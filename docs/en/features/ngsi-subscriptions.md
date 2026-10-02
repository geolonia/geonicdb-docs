---
title: "NGSI Subscriptions"
description: "HTTP Webhook subscriptions for entity change notifications"
outline: deep
---
# Subscriptions

GeonicDB's subscription feature allows you to monitor entity changes in real time and automatically notify external systems.

## Table of Contents

- [Overview](#overview)
- [How Subscriptions Work](#how-subscriptions-work)
- [Notification Methods](#notification-methods)
- [Conditions and Filtering](#conditions-and-filtering)
- [Practical Examples](#practical-examples)
- [Best Practices](#best-practices)
- [Access Control and Ownership (GeonicDB Extension)](#access-control-and-ownership-geonicdb-extension)
- [Troubleshooting](#troubleshooting)

---

## Overview

Subscriptions monitor entity creation, update, and deletion, and send notifications to a specified endpoint when the defined conditions are met.

### Key Use Cases

- **Sensor data monitoring**: Detect threshold exceedances for temperature, humidity, etc.
- **Location tracking**: Track position changes of vehicles and devices
- **Event-driven architecture**: Automated processing triggered by entity changes
- **Data integration**: Real-time data delivery to other systems

### Supported APIs

| API | Endpoint | Support |
|-----|----------|---------|
| NGSIv2 | `/v2/subscriptions` | ✅ |
| NGSI-LD | `/ngsi-ld/v1/subscriptions` | ✅ |

> **Note (#1304 / #2337)**: ホスト名ルーティングされたデプロイメント（マルチサブドメイン構成の専用 DB）でも購読は発火します。API 経由のエンティティ変更はリクエストスコープでイベントを発行し、発生元デプロイメントの情報（`deployment.hostname`）を運んで背景ワーカーが正しい DB に対してマッチング・通知・状態更新を行います。**制限**: デプロイメント DB への直接 DB 書き込み（API を経由しない変更）はイベントを発火しません。AWS は EventBridge が一次ソース。Standalone の購読は `LocalEventBusPublisher` 一本で、Change Stream は ReactiveCore Rules 専用 — 物理削除で `fullDocument` が取れない Change Stream を購読の一次ソースにすると tenant が `'unknown'` になり沈黙する (#2337)。また、デプロイメント行の登録・有効化はキャッシュ（最大 5 分）の反映後にワーカーへ届きます。

---

## How Subscriptions Work

```text
1. Entity creation/update/delete (via API), published by EntityService through `IEventPublisher`
   — AWS: EventBridge → matcher Lambda
   — Standalone default DB: `LocalEventBusPublisher` → `emitEntityChangeForSubscription` (#2337)
   — Standalone deployment DB: `LocalEventBusPublisher` → `emitEntityChangeForDeploymentWorkers` → subscription workers (#1304)
   — or, for TTL-expired entities (`expiresAt`), claimed and published by the expiry sweeper (#1561)
   ↓
2. SubscriptionMatcher searches for subscriptions matching the conditions
   ↓
3. Notification message is sent to the SQS queue
   ↓
4. NotificationSender sends an HTTP/MQTT notification to the external endpoint
```

**Latency**: Near-instant for regular entity create/update/delete via the API. For TTL expiry, add up to ~1 minute for the expiry sweeper's polling interval (`ENTITY_EXPIRY.SWEEP_INTERVAL_SECONDS`, see [QUOTAS.md](../saas/quotas.md#ttl-失効-expiresat-expiry-sweeper1561)) before the `EntityDeleted` notification enters this pipeline.

### EntityDeleted tombstones and `previousAttributes` (#2439 / #2631 / #2671)

NGSI-LD delete notifications render removed attributes as `urn:ngsi-ld:null` tombstones
(and may also fire the `attributeDeleted` trigger). Both require
`EntityChangeEvent.changes.previousAttributes` on the `EntityDeleted` event.

| Source of `EntityDeleted` | Supplies `previousAttributes`? |
|---|---|
| API delete / purge via `EntityService` (`deleteEntity`, …) (#2337) | Yes — attributes read before delete |
| TTL expiry via `EntityExpiryService` ([#1561](https://github.com/geolonia/geonicdb/issues/1561)) | Yes — claimed document before soft-delete |
| MongoDB Change Stream pre-image (`changeStreamPreAndPostImages`, [#1411](https://github.com/geolonia/geonicdb/issues/1411)) | **Not used.** The CDC `ChangeStreamProcessorFunction` and pre-image enablement were removed in [#1560](https://github.com/geolonia/geonicdb/issues/1560); resurrecting them would double-publish. On standalone, Change Stream remains Rules-only (`CHANGE_STREAM` in `defaults.ts`) |

**Disposition of [#2631](https://github.com/geolonia/geonicdb/issues/2631)**: the premise that tombstones silently disable when #1411 / change-stream wiring is off **does not hold on current main**. There is no runtime flag to detect at broker startup, and no subscription-create 4xx for a missing pre-image dependency. TTL delete observability is already fail-loud in the #1561 sweeper: `publishFailures > 0` fails the Lambda invocation and `ExpirySweeperErrorsAlarm` fires (see [QUOTAS.md](../saas/quotas.md#ttl-失効-expiresat-expiry-sweeper1561)).

**Observability follow-up ([#2671](https://github.com/geolonia/geonicdb/issues/2671))**: if an `EntityDeleted` event nevertheless arrives **without** `previousAttributes` (publisher bug or a future emit site), the matcher and standalone notifier log a **warn** so tombstones / `attributeDeleted` do not empty out silently. An empty object `{}` (entity with no attributes) is valid and does **not** warn. Separately, single-entity `safePublishEntityChangeEvent` still swallows publish failures with `logger.error` only (unlike the sweeper) — tracked in #2671.

---

## Notification Methods

### HTTP Webhook

Sends notifications as standard HTTP POST requests.

**Example subscription creation:**

```bash
curl -X POST http://localhost:3000/v2/subscriptions \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: demo" \
  -d '{
    "description": "Room temperature monitoring",
    "subject": {
      "entities": [{ "idPattern": ".*", "type": "Room" }],
      "condition": {
        "attrs": ["temperature"],
        "expression": { "q": "temperature>25" }
      }
    },
    "notification": {
      "http": { "url": "https://webhook.example.com/notify" },
      "attrs": ["temperature", "pressure"]
    },
    "expires": "2030-12-31T23:59:59.000Z",
    "throttling": 5
  }'
```

**Example notification payload:**

```json
{
  "subscriptionId": "sub123",
  "data": [
    {
      "id": "Room1",
      "type": "Room",
      "temperature": {
        "type": "Number",
        "value": 26.5,
        "metadata": {}
      },
      "pressure": {
        "type": "Number",
        "value": 1013.25,
        "metadata": {}
      }
    }
  ]
}
```

> The example above is the **NGSIv2** body. NGSI-LD subscriptions deliver an ETSI `Notification`
> (`id` / `type: "Notification"` / `data[]` in the representation chosen by
> `notification.format`) — see
> [Notification Body Shape](#notification-body-shape-ngsi-ld-vs-ngsiv2-1765).

### httpCustom (Custom Template)

Allows customization of the HTTP method, headers, and payload.

**Example subscription creation:**

```bash
curl -X POST http://localhost:3000/v2/subscriptions \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: demo" \
  -d '{
    "description": "Custom notification template",
    "subject": {
      "entities": [{ "type": "Room" }],
      "condition": { "attrs": ["temperature"] }
    },
    "notification": {
      "httpCustom": {
        "url": "https://api.example.com/events",
        "method": "PUT",
        "headers": {
          "X-Api-Key": "secret-key",
          "Content-Type": "application/json"
        },
        "qs": {
          "entityId": "${id}",
          "temp": "${temperature}"
        },
        "payload": "{\"room\": \"${id}\", \"temp\": ${temperature}, \"timestamp\": \"${timestamp}\"}"
      }
    }
  }'
```

**Macro substitution:**

| Macro | Substituted value |
|-------|-------------------|
| `${id}` | Entity ID |
| `${type}` | Entity type |
| `${temperature}` | Attribute value (extracts `.value` from normalized attributes) |

Non-existent attributes are replaced with the string `null`.

#### httpCustom.json (type-preserving template)

`payload` is a string template, so every substituted value becomes a string. When you need
to **preserve attribute types** (numbers stay numbers, booleans stay booleans), use
`httpCustom.json` instead (FIWARE Orion parity). `json` accepts an object or array template
and is **mutually exclusive with `payload`**.

```bash
curl -X POST http://localhost:3000/v2/subscriptions \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: demo" \
  -d '{
    "subject": { "entities": [{ "type": "Room" }] },
    "notification": {
      "httpCustom": {
        "url": "https://api.example.com/events",
        "json": {
          "room": "${id}",
          "temp": "${temperature}",
          "active": "${active}",
          "unit": "celsius"
        }
      }
    }
  }'
```

Substitution rules:

- **Sole-macro value** (`"${temperature}"`): the attribute value is inlined with its
  original JSON type (number → number, boolean → boolean, object/array → object/array).
  A missing attribute becomes `null`.
- **Partial-macro value** (`"prefix-${id}"`): always produces a string.
- **Keys are never substituted** — a macro in a key (`"${id}": ...`) is rejected with `400`.
- The template is bounded at creation time: serialized size ≤ `MAX_PAYLOAD_LENGTH`
  and nesting depth ≤ `MAX_JSON_DEPTH`; violations are rejected with `400`.
- Notifications are sent with `Content-Type: application/json` by default. This can be
  overridden via `receiverInfo` (custom headers).

Example delivered body for the subscription above (temperature = 25.5, active = true):

```json
{ "room": "Room1", "temp": 25.5, "active": true, "unit": "celsius" }
```

### MQTT

Publishes messages to an MQTT broker.

**Example subscription creation:**

```bash
curl -X POST http://localhost:3000/v2/subscriptions \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: demo" \
  -d '{
    "description": "MQTT notification",
    "subject": {
      "entities": [{ "type": "Sensor" }],
      "condition": { "attrs": ["value"] }
    },
    "notification": {
      "mqtt": {
        "url": "mqtt://broker.example.com:1883",
        "topic": "sensors/room/temperature",
        "qos": 1,
        "user": "username",
        "passwd": "password"
      },
      "attrs": ["value"]
    }
  }'
```

**MQTT settings:**

| Field | Description | Default |
|-------|-------------|---------|
| `url` | MQTT broker URL (`mqtt://` or `mqtts://`) | - |
| `topic` | Topic to publish to | - |
| `qos` | QoS level (0, 1, 2) | 0 |
| `retain` | Message retain flag | false |
| `user` | Authentication username | - |
| `passwd` | Authentication password | - |

### Web Push (#3014)

Delivers the same NGSI notification JSON body to a browser Push Service (FCM / Mozilla /
Apple, etc.) using VAPID. **GeonicDB extension** — not part of FIWARE Orion or ETSI Endpoint.

**Field mapping (browser ↔ API):**

| Browser `PushSubscription.toJSON()` | NGSIv2 `notification.webpush` | NGSI-LD `notification.endpoint` |
|-------------------------------------|-------------------------------|----------------------------------|
| `endpoint` | `url` | `uri` |
| `keys.p256dh` | `keys.p256dh` | `webpush.keys.p256dh` |
| `keys.auth` | `keys.auth` | `webpush.keys.auth` |
| — | `ttl` / `urgency` / `topic` (RFC8030) | same under `webpush` |

**Example (NGSIv2):**

```bash
curl -X POST http://localhost:3000/v2/subscriptions \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: demo" \
  -d '{
    "description": "Web Push notification",
    "subject": {
      "entities": [{ "type": "Sensor" }],
      "condition": { "attrs": ["value"] }
    },
    "notification": {
      "webpush": {
        "url": "https://fcm.googleapis.com/fcm/send/....",
        "keys": {
          "p256dh": "<87-char base64url>",
          "auth": "<22-char base64url>"
        },
        "ttl": 86400,
        "urgency": "normal"
      }
    }
  }'
```

**Example (NGSI-LD — GeonicDB extension):**

```json
{
  "type": "Subscription",
  "entities": [{ "type": "Sensor" }],
  "notification": {
    "endpoint": {
      "uri": "https://fcm.googleapis.com/fcm/send/....",
      "protocol": "webpush",
      "webpush": {
        "keys": { "p256dh": "...", "auth": "..." }
      }
    }
  }
}
```

**Deploy-time VAPID keys** (global per deployment): see ENV.md —
`WEBPUSH_VAPID_PUBLIC_KEY` / `WEBPUSH_VAPID_PRIVATE_KEY` / `WEBPUSH_VAPID_SUBJECT`
(staging/prod: `geonicdb-<env>` JSON secret via `resolveWebPushVapidSecrets()`, #3033;
SAM plain params are fallback).
Public key discovery: `GET /.well-known/webpush-vapid-key` → `{ "publicKey": "..." }`
(503 when unset).

**Failure handling (#3014 Q6):**
- Push Service `404` / `410` → non-transient; subscription document `status` becomes `failed`
  (endpoint gone / unsubscribed).
- `413` → non-transient; discard that message only — do **not** kill the subscription.
- `401` / `403` → non-transient; do **not** mark the subscription permanently failed.
- Other 4xx are non-transient except `408` / `429`. 5xx and network errors retry like HTTP.

**GET response:** `keys.auth` is masked as `******` (same as MQTT `passwd`). `keys.p256dh` is
returned in clear. NGSI-LD responses expose `endpoint.webpush` but **not** `endpoint.protocol`
(judge Web Push by `webpush` presence). `csourceSubscriptions` reject `webpush` with `400`.

#### App implementation flow (#3060)

The API above only covers the wire format. A PWA/browser client wires it together like this:

1. **Register a service worker** in the app's origin: `await navigator.serviceWorker.register('/sw.js')`.
2. **Subscribe to Push** via `PushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`,
   where `applicationServerKey` is the deployment's VAPID public key from
   `GET /.well-known/webpush-vapid-key`, converted to a `Uint8Array` (RFC 8291).
3. **Convert `PushSubscription.toJSON()`** into `notification.webpush` (NGSIv2) or
   `endpoint.webpush` (NGSI-LD) per the field mapping table above, and `POST` the subscription.
4. **Handle `push` events in `sw.js`** — the NGSI notification body arrives as `event.data.json()`;
   call `self.registration.showNotification(...)` to surface an OS-level notification.

`@geolonia/geonicdb-sdk` implements the full app flow as
`db.registerWebPushSubscription({ protocol, ... })` (#3092) — browser subscribe + idempotent
GeonicDB create (localStorage-backed; VAPID rotation updates via `PATCH`). The default
localStorage key is scoped by `baseUrl` + `tenant` + `protocol` only — **not** by login
principal (`logout()` does not clear it). On a **shared browser / kiosk** where multiple
users share one profile, a later registration can reuse the earlier user's
`subscriptionId` and ignore the new `subject` / `entities`. The SDK does **not**
auto-isolate principals; callers must pass an explicit `storageKey` that still includes
the default scope (e.g. append `:${userId}:${filterId}` to
`buildWebPushSubscriptionStorageKey(baseUrl, tenant, protocol)`) so shared-browser users
*and* distinct filters stay isolated (#3097). Use an app-managed stable id for `userId`
when email is unavailable (API key sessions). HTTP 507 (`QuotaExceededError`) means the
plan's subscription grace ceiling is exceeded; retry only after deleting unused
subscriptions or changing the plan — browser `unsubscribeWebPush()` alone does not remove
the GeonicDB document. Low-level pieces remain
`db.subscribeWebPush()` + `toNgsiv2WebPushNotification()` / `toNgsiLdWebPushEndpoint()` and
`db.unsubscribeWebPush()` — see SDK.md → Web Push 通知 for the
full walkthrough with code.

### NGSI-LD `notification` Is a Closed Structure (#2066)

The `http` / `httpCustom` / `mqtt` notification styles described above, and their nested fields
(`httpCustom.json`, MQTT `qos` / `retain` / `user` / `passwd`, etc.), are **NGSIv2-only**. NGSI-LD
subscriptions carry a single `notification.endpoint` object (`uri` / `accept` / `receiverInfo` /
`notifierInfo` — see [API_NGSILD.md → Create Subscription](../api-reference/ngsild.md#create-subscription))
and select MQTT delivery via the `mqtt://` / `mqtts://` scheme in `endpoint.uri`, not a separate
`mqtt` field. **Web Push** is a GeonicDB extension on that same `endpoint` object (`webpush`;
optional write-only `protocol: "webpush"`). Public GET responses do not include `protocol`.

Since #2066, `POST` / `PATCH /ngsi-ld/v1/subscriptions` reject **any member of `notification` not
defined by ETSI GS CIM 009 Table 5.2.14-1** with `400 BadRequestData` — except GeonicDB extensions
explicitly declared on `endpoint` (`webpush` / `protocol`, #3014). Sending the NGSIv2-shaped
`notification.httpCustom` / `notification.http` / `notification.mqtt` to the NGSI-LD endpoint now
fails fast instead of the pre-#2066 behavior, where the unknown key was silently stripped by Zod's
default (strip) validation — the request succeeded with `201` / `204` and the custom delivery
settings were dropped without a trace. The Subscription's **top-level** JSON-LD vocabulary
extension is unaffected; only `notification` is closed.

`POST` / `PATCH /ngsi-ld/v1/csourceSubscriptions` behave the same way: context source
subscriptions reuse the very same request schemas, so the closed `notification` applies there too.

---

## Conditions and Filtering

### Entity Specification

**Specific ID:**

```json
{
  "subject": {
    "entities": [
      { "id": "Room1", "type": "Room" }
    ]
  }
}
```

**ID pattern (regular expression):**

```json
{
  "subject": {
    "entities": [
      { "idPattern": "Room.*", "type": "Room" }
    ]
  }
}
```

**All entities:**

```json
{
  "subject": {
    "entities": [
      { "idPattern": ".*" }
    ]
  }
}
```

> **Pattern restrictions.** `idPattern` and `typePattern` are evaluated against entity IDs and types on the notification path, so patterns prone to catastrophic backtracking are rejected at subscription-creation time with `400 BadRequest`. This covers nested quantifiers (`(a+)+`) and **alternations inside a quantified group** (`^(a|aa)+$`, `^((a|aa))+$`) — see Regex Pattern Validation (ReDoS) for the full rule set. Character classes and unquantified groups are unaffected: `^urn:ngsi-ld:(Room|Vehicle):[0-9]+$` and `Room[0-9]+` are accepted.

**Type pattern (regular expression):**

```json
{
  "subject": {
    "entities": [
      { "idPattern": ".*", "typePattern": "Sensor.*" }
    ]
  }
}
```

`typePattern` is accepted by both APIs. **In NGSI-LD subscriptions `type` and `typePattern` are
not mutually exclusive**: `EntitySelectorSchema` requires *at least one* selector, and when both
are present the matcher evaluates the `type` exact match and the `typePattern` regular expression
with **AND**. Both are preserved on `GET` (#2067), so a retrieved subscription can be replayed
without loosening its filter. The AND semantics is the settled design (#2105): NGSIv2 keeps the
spec-mandated exclusivity ("Both cannot be used at the same time" — both given returns
`400 BadRequest`), while NGSI-LD, where `typePattern` is a GeonicDB extension, accepts both as an
AND filter. Context source subscriptions (`/csourceSubscriptions`) share the same selector and
apply the same rule (#2105): `typePattern` is evaluated with AND against the registered entity
types, a `typePattern`-only selector is accepted, and `typePattern` goes through the same
creation-time ReDoS validation as `idPattern`. Registered types are stored as FQNs (#1800), so the
pattern is matched against both the stored FQN and the term compacted with the subscription's
matching vocabulary — the write-time `@context` (`contextRef`, recorded whenever the subscription
stores attribute names (#1900) **or an `entities[].typePattern` selector** (#2117)) or the core
context otherwise. Before #2117 an entities-only csource subscription never recorded `contextRef`,
so a short-name `typePattern` written against a custom vocabulary could never match (the workaround
was to give the subscription attribute names); that asymmetry with regular subscriptions — which
always store `matchJsonldContext` (#1680) — is closed. A `PATCH` that touches only `entities`
never overwrites the `contextRef` of a subscription that stores attribute names, because that value
governs how those verbatim names are compacted in responses. The notification `@context`
(`jsonldContext`) is never used for matching (#2040), context resolution on this path never
fetches remote documents (#1680), and a registration entity spec that declares no `type` is not
narrowed by `typePattern` (same fail direction as the pattern-vs-pattern `idPattern` case). In
NGSIv2 it is part of the specification; in NGSI-LD subscriptions (`entities[].typePattern`) it is
a **GeonicDB extension** — the ETSI `EntitySelector` has no `typePattern`. Unlike `type`, a
`typePattern` is **not** term-expanded with the `@context` (#1657). For NGSI-LD entities whose
type is stored in canonical FQN form (a term mapped by an `@context` to an absolute IRI), the
pattern is matched against **both** the stored FQN and the term compacted with the subscription's
own `@context`, which is saved at create/update time for this purpose (#1680) — so a pattern
written against the short name (e.g. `Sensor.*`) keeps matching entities created via a mapping
context.

> **NGSI-LD `GET` returns each entity selector in its stored form (#2067).** Previously
> `typePattern` was collapsed into `type` in the response, and a selector with no type constraint
> at all was rendered with a fabricated `type: "*"`. Both distorted the round-trip: replaying a
> retrieved subscription body as a new `POST` turned a pattern like `^Sensor` into the literal
> type name `^Sensor`. `GET` now returns whichever selector (`id` / `idPattern` / `type` /
> `typePattern`) was actually stored, and omits `type` entirely when no type selector was given.

### Condition Expressions (q parameter)

**Comparison operators:**

| Operator | Description | Example |
|----------|-------------|---------|
| `>` | Greater than | `temperature>25` |
| `<` | Less than | `temperature<10` |
| `>=` | Greater than or equal to | `temperature>=20` |
| `<=` | Less than or equal to | `temperature<=30` |
| `==` | Equal to | `status==active` |
| `!=` | Not equal to | `status!=inactive` |

**Logical operators:**

| Operator | Description | Example |
|----------|-------------|---------|
| `;` | AND | `temperature>20;humidity<80` |
| `,` | OR | `type==Room,type==Building` |

**Example:**

```json
{
  "subject": {
    "condition": {
      "attrs": ["temperature"],
      "expression": {
        "q": "temperature>25;temperature<40"
      }
    }
  }
}
```

### Geo Filtering (geoQ)

NGSI-LD subscriptions also accept `geoQ`, evaluated with the **same geo engine as
`GET /ngsi-ld/v1/entities`** (`georel` / `geometry` / `coordinates`, optional `geoproperty`
defaulting to `location`):

```json
{
  "type": "Subscription",
  "entities": [{ "type": "Incident" }],
  "geoQ": {
    "georel": "near;maxDistance==1000",
    "geometry": "Point",
    "coordinates": [139.6503, 35.6762]
  },
  "notification": {
    "endpoint": { "uri": "https://example.com/hook" }
  }
}
```

`coordinates` accepts either a string (`"139.6503,35.6762"`) or a GeoJSON-shaped array —
including the nested form the spec uses for `LineString` / `Polygon`
(`[[[138,34],[141,34],[141,37],[138,34]]]`). `geoQ.geometry` accepts all six GeoJSON geometry
types — `Point`, `MultiPoint`, `LineString`, `MultiLineString`, `Polygon` and `MultiPolygon`
(#1696). The `Multi*` variants keep their nested GeoJSON coordinates as-is, and `GET` returns
them in the same nested array form, so a retrieved `geoQ` can be `PATCH`ed back unchanged. A
`Polygon` ring must be closed — the first and last positions equal in **every** element,
including the altitude when 3-element `[lng, lat, alt]` positions are used (#1644) — and
polygons with holes (more than one ring) are rejected with `400`.

NGSIv2 subscriptions keep the NGSIv2 axis order (`coords` is `lat,lng`); it is normalized the
same way `GET /v2/entities?coords=` is, so a subscription and the equivalent search agree. The
axis order is decided by the **subscription's** originating API, which is recorded when the
subscription is created — subscriptions created before that field existed have their `geoQ`
predicate skipped (and are notified without geo filtering) rather than guessed at.

Updating a subscription replaces only the members you send: a `PATCH` carrying `q` leaves a
stored `geoQ` intact and vice versa, and `geoQ` is replaced as a whole object (so an omitted
`geoproperty` is cleared rather than inherited). Sending `q: ""` removes the attribute filter.

**Concurrent updates (#1593)**: because a partial update has to read the stored subject/notification
before merging, `PATCH` uses **optimistic concurrency control** — the write is guarded on the
`modifiedAt` value that was read, and a losing writer re-reads and retries. If the update still
cannot settle after `SUBSCRIPTION.MAX_UPDATE_RETRIES` attempts (sustained concurrent writes to the
same subscription), the request fails with **`409 Conflict`** and the client should retry. Without
this guard two simultaneous `PATCH`es both returned `2xx` and the later write silently discarded the
earlier one. Note that delivery statistics (`notification.timesSent` / `lastNotification` /
`status`) are written by the notifier and are **not** covered by this guard — they are eventually
consistent and a `PATCH` landing at the same moment as a delivery can lose one increment.

### How q / geoQ / scopeQ Filter Notifications

`q`, `geoQ` and (NGSI-LD only) `scopeQ` restrict **which entity changes fire a notification**,
not just which subscriptions exist. A subscription with `q: "severity>100"`, a `geoQ` polygon, or
`scopeQ: "/Madrid/#"` is notified only for changes to entities that satisfy the predicate.

Semantics and current limits:

| Aspect | Behavior |
|---|---|
| Evaluation | The changed entity is re-evaluated against the same MongoDB predicate builder used by `GET /ngsi-ld/v1/entities`, so the **predicate semantics** (operators, geo handling, scope rules) are identical to search. Results can still differ from a concurrent search because the predicate is evaluated against current state while the notification payload comes from the event — see **Ordering** / **Timing** below |
| Invalid `q` / `geoQ` / `scopeQ` | **NGSI-LD only**: rejected at create/update time with `400` (`georel` enum, coordinate bounds, `georel`+`geometry`+`coordinates` must be given together; `scopeQ` runs through the same `parseScopeQuery` used at evaluation time). NGSIv2 subscriptions are not strictly validated, because the predicate builder does not yet implement NGSIv2's `lat,lon` `coords` order or its `attr:value` `q` form (`scopeQ` does not exist in NGSIv2). Subscriptions whose expression cannot be parsed at evaluation time are notified **without** filtering, and the failure is logged |
| Delete events | `EntityDeleted` is **not** filtered by `q` / `geoQ`. The entity no longer exists, so the predicate cannot be evaluated; suppressing the event would silently hide deletions |
| `noLongerMatching` | Not implemented as a distinct transition — a subscription is notified while its predicate matches, and stops being notified when it does not |
| Ordering | Because the predicate is evaluated against current state while the payload comes from the event, rapid consecutive updates can deliver a payload that no longer satisfies the filter, or (in the reverse order) suppress the change that did match. Orion-LD, which evaluates in-line, does not have this gap |
| Duplicates | Notifications are at-least-once. On a transient failure the event is redelivered; SQS FIFO de-duplication absorbs re-sends inside a 5-minute window, so a redelivery later than that can duplicate an already-sent notification |
| Timing | The predicate is evaluated against the entity's state at evaluation time. A change applied between publication and evaluation can flip the decision. If the entity is gone (deleted / TTL-expired / soft-deleted) by then, the predicate is treated as **not evaluable** and the notification is sent rather than silently dropped |
| Encrypted tenants | Encrypted entities store their attributes in an opaque envelope, so a `q` predicate (and a `geoQ` on a non-`location` GeoProperty) cannot be evaluated. Such subscriptions are notified **without** filtering, and this is logged |
| `!=` and `!attr` | Evaluated exactly as `GET /entities` does, where a missing attribute satisfies `!=`. Orion-LD treats comparisons against a missing attribute as false, so results can differ for these operators |
| Rule-triggered notifications | ReactiveCore rules always name their target subscriptions explicitly (`subscriptionIds`), and on that path `q` / `geoQ` are **not** applied — the rule's own condition (CEL) decides which entities fire |
| Cost bound | Evaluations are de-duplicated per unique expression per event and capped (`SUBSCRIPTION.MAX_EXPRESSION_EVALUATIONS_PER_EVENT`); at most `SUBSCRIPTION.MAX_CONCURRENT_EXPRESSION_EVALUATIONS` run concurrently. Beyond the cap, subscriptions are notified without filtering and the truncation is logged |
| servicePath | A subscription is matched only against entity changes in the **same** servicePath (exact match), on both the AWS and standalone paths (#1587) |
| Creation boundary | A change that **occurred before the subscription was created** is never notified, even when its asynchronous matching happens to run after the subscription exists (#2068). ETSI GS CIM 009 clause 5.8.6 sends notifications only while the subscription is `active`, and a subscription that did not exist at change time was not active. The guard compares the change's occurrence time with the subscription's `createdAt` and is enforced in `matchesSubscription`, the single chokepoint shared by the AWS and standalone paths. Fail-open: a legacy subscription without `createdAt`, an event without a timestamp, or an exact tie is still notified. On standalone, subscription events take the occurrence time from `EntityService`'s publisher payload (#2337). Change Stream `wallTime` remains the timestamp source only for rules. Rule-triggered notifications (explicit `subscriptionIds`) are not subject to this boundary |
| throttling / cooldown | `throttling` (FIWARE, min seconds) and `cooldown` (GeonicDB extension) are both enforced on the entity-change notification path (#1589). Enforcement is an **atomic claim**: at match time (after `q`/`geoQ`) the broker does one `findOneAndUpdate` that both checks the window and stamps the window clock, so only the winning event of a burst is delivered — the check and the record cannot race. **The window clock is a dedicated server-only field** (`lastThrottledAt` for throttling, `lastTriggered` for cooldown), intentionally separate from the FIWARE display field `notification.lastNotification`: this keeps delivery retries from refreshing the window, and prevents a client-supplied `lastNotification` from poisoning the guard. `notification.lastNotification` remains the spec-visible "last notification timestamp" and is stamped at delivery time by the outcome recorder (so it advances even for rule-triggered notifications, which are not claimed/throttled). Delivery-outcome recording (`notification.status` / `lastSuccess` / `lastFailure` / `timesSent` / `lastNotification`) does **not** touch the window clock, so a successful delivery and its retries do not refresh the window (the AWS and standalone paths behave identically). The clock is stamped at claim time (just before delivery); if delivery then **fails** the window is **released** (the clock is cleared) so a retry or the next event can re-claim — a send failure does not burn the window (AWS path retries the event; standalone reopens for the next event). The residual lossy case is a process crash between claim and release; monitor delivery health via `notification.status` / `lastFailure`. Both are a **single per-subscription budget**: rule-triggered notifications go through the explicit-`subscriptionIds` path and are not claimed/throttled |

### Scope Filtering (scopeQ) and Round-Trip-Only Fields (temporalQ / lang)

`scopeQ` (NGSI-LD only) is stored, returned by `GET`, **and evaluated as a notification
filter** — the same way `q` / `geoQ` are, using the same `parseScopeQuery` predicate builder as
`GET /ngsi-ld/v1/entities?scopeQ=`. A subscription with `scopeQ: "/Madrid/#"` is only notified for
changes to entities whose `scope` matches. It is validated at create/update time the same way
`q` / `geoQ` are (malformed `scopeQ` is rejected with `400`), and it participates in the same
cost-bound / dedup / fail-open behavior described in the table above (it is folded into the same
per-expression cache key as `q` / `geoQ`).

`temporalQ` and `lang` are accepted, persisted, and returned by `GET`, but are **not** applied to
notification matching (#1588). This is intentional, not a gap to be closed later:

- `temporalQ` describes a time range for **retrieving history** (`timerel` / `timeAt` /
  `endTimeAt`); a single change-notification event has no "time range" for it to be compared
  against, so it has no meaning as a per-event predicate.
- `lang` is a rendering hint for which `LanguageProperty` value to pick when returning an entity,
  not a condition that a change either satisfies or does not.

### Notification Attribute Filtering

**Notify only specific attributes:**

```json
{
  "notification": {
    "attrs": ["temperature", "humidity"]
  }
}
```

**Exclude specific attributes:**

```json
{
  "notification": {
    "exceptAttrs": ["metadata", "internalId"]
  }
}
```

**Notify only changed attributes:**

```json
{
  "notification": {
    "onlyChangedAttrs": true
  }
}
```

**Unified NGSI-LD projection (`pick` / `omit`):**

Per ETSI GS CIM 009 (clause 4.21), `notification.pick` selects the attributes to include and
`notification.omit` selects the attributes to exclude. They are applied to the notification
payload exactly like the legacy `attributes` (include) / `exceptAttrs` (exclude) selectors:

```json
{
  "notification": {
    "pick": ["temperature", "humidity"]
  }
}
```

```json
{
  "notification": {
    "omit": ["metadata", "internalId"]
  }
}
```

**Response serialization (note the asymmetry):** `GET` / `List` responses always serialize the
stored projection with the ETSI canonical field names, regardless of which alias was used at
creation time:

- the **include** projection is returned as `notification.attributes` (not `pick`);
- the **exclude** projection is returned as `notification.omit` (not `exceptAttrs`).

So a client that created a subscription with `pick` will find the selection under
`notification.attributes` in the response, and one that used `exceptAttrs` will find it under
`notification.omit`. Both response field names are accepted on the way back in (they map to the
same internal include / exclude projection), so a `GET` → edit → `PATCH` round-trip preserves the
projection.

**Clearing a projection on `PATCH` (JSON Merge Patch, #1635):**

Subscription updates follow JSON Merge Patch (RFC 7396 / ETSI GS CIM 009 clause 5.8.2). For the
notification projection selectors (`pick` / `omit` / `attributes` / `attrs` / `exceptAttrs`) this
means three states:

| PATCH input | Effect |
|-------------|--------|
| selector **omitted** | keep the existing projection (endpoint/format-only updates never widen delivery) |
| selector = **array** | replace the projection (include ↔ exclude switch allowed) |
| selector = **`null`** (e.g. `"pick": null`) | **clear** the projection — the subscription goes back to delivering all attributes |

```json
PATCH /ngsi-ld/v1/subscriptions/{id}
{
  "notification": {
    "pick": null,
    "endpoint": { "uri": "http://receiver.example.com/notify" }
  }
}
```

`null` is a *clear* signal, so it is exempt from the include/exclude exclusivity check: you can send
`pick: null` together with an `omit` value to clear the include projection and set an exclude one in
the same request. An empty array `[]` is **not** a clear mechanism (all selectors require a non-empty
array) — use `null` to clear. Without this, a projection set once could only be removed by deleting
and re-creating the subscription.

### Notification `type` Rendering with the Subscription @context (NGSI-LD, #1687)

For NGSI-LD subscriptions, the `type` of each entity in the notification `data[]` is rendered
with the **subscription's own `@context`** (stored at create/update time), per the "shall
compact on output" rule of ETSI GS CIM 009 §5.5.7: a type stored in canonical FQN form (an
absolute IRI mapped by a term definition, see #1657) is **compacted back to the short term**
before delivery. This applies to both entity-change and rule-triggered notifications. If the
subscription's `@context` cannot be resolved at delivery time, the FQN is sent as a fallback;
bare (core `@vocab`) types are delivered unchanged as before.

> **⚠️ Breaking change (receiver side, #1687)**: for types mapped to an absolute IRI,
> notifications previously exposed the FQN in `data[].type`; they now carry the compacted short
> term. Receiving clients that branch on the FQN (e.g. geonicdb-cli / geonicdb-pulse) must be
> reviewed — tracked in #1725. The WebSocket event-streaming path is currently **not** compacted
> and still delivers the stored (FQN) form.

### Multi-type `data[].type` (NGSI-LD, #2477)

When an entity has multiple Entity Types (clause 4.16 / Table 5.2.4), notification payloads
render `data[].type` as a **JSON array of strings** — the same rule as `GET /ngsi-ld/v1/entities/{id}`.
A single type remains a string (not a one-element array).

> **⚠️ Breaking change (receiver side, #2477)**: clients that assume `data[].type` is always a
> string will break on multi-type entities. Treat `type` as `string | string[]` (and
> `entityType` on WebSocket events likewise — see [EVENT_STREAMING.md](./subscriptions.md)).

### Notification `jsonldContext` (NGSI-LD, #1847 / #1801)

NGSI-LD Subscription には、通知用のトップレベル `jsonldContext` を指定できます。これは
**dereferenceable URI 文字列** (ETSI Table 5.2.12-1: `String | Dereferenceable URI | 0..1`)
で、通知送出時に使う `@context` を明示的に上書きするためのフィールドです。

- `jsonldContext` 未指定時は、購読自体の `@context` で初期化されます (clause 5.8.1.4)
- 指定値が不正な URI の場合は `400 BadRequestData`
- URI が取得不能な場合は `504 LdContextNotAvailable`
- レスポンス (`GET /ngsi-ld/v1/subscriptions*`) では、`jsonldContext` が**文字列のときのみ**返ります
- **リクエスト `@context` が 2 要素以上の配列 / インライン object の場合は、それを `ImplicitlyCreated` の
  `@context` として自ホストに払い出し、その serve URL (`<base>/ngsi-ld/v1/jsonldContexts/<localId>`)
  で初期化します (#2250)**。clause 5.13.1 が定める動作そのもので — "when a client creates a
  subscription using an `@context` that is an array, and the broker has to notify with
  Content-Type `application/json`, then the broker needs this `@context` array to be hosted at a
  URL" — Table 5.2.12-1 の型 (Dereferenceable URI) を満たすための手段です。**URI 1 個だけの配列は
  既に dereferenceable なので払い出さず、その URL へ畳みます (#2344)**。**照合用の語彙
  (`matchJsonldContext`) は生の値のまま**保たれ、型セレクタの照合は変わりません。
  #2250 以前は配列 / インライン object をそのまま保存していたため、URI として表現できず
  レスポンスから `jsonldContext` が**丸ごと省略**されていました (0..1 optional)。
  それ以前に作られた購読 (配列を保持したままの legacy doc) は、いまも応答では省略されます
- **`PATCH` で適用した `@context` も既定値になります (#2029 / #2040)**。clause 5.8.1.4 は
  "If not present, the `jsonldContext` field **shall be initialized** with the `@context`
  applicable for the Subscription" と定めており、**保存フィールドへの初期化**です。したがって
  `PATCH /ngsi-ld/v1/subscriptions/{id}` にリクエスト `@context` が付いていて `jsonldContext` が
  まだ未設定なら、**body の形に依らず** (`entities` / `watchedAttributes` / `q` / `description`
  いずれの PATCH でも) その値で初期化されます。#2040 以前は `entities` を含む PATCH の場合だけ
  照合用フィールド経由で効いており、`watchedAttributes` だけの PATCH では通知が core / FQN の
  まま残っていました
- **初期化は一度だけです (init-once)**。既に設定済みの `jsonldContext` は、明示指定した値でも
  初期化された値でも、後続の PATCH で上書きされません — clause 5.8.1.4 前段が
  "shall be the one **specified in** the `jsonldContext` field" と明示値の優先を定めており、
  後段の "If not present, …" は明示値を破壊する根拠にならないためです。語彙を切り替えるときは
  `jsonldContext` を明示的に PATCH してください
- **core だけを宣言した PATCH (および `application/json` の PATCH) は語彙を変えません**。
  core のみの `@context` は「ユーザー用語を運ばない」ため保存対象になりません (#1620)。
  ここで保存値を消す実装にすると「説明だけ直す PATCH で通知語彙が core に戻る」silent な
  副作用になります
- 初期化された値は **`GET /ngsi-ld/v1/subscriptions/{id}` で返ります (#2041)**。clause 5.8.3.5 は
  clause 5.2.12 のとおり購読を返すよう定めており、初期化済みのフィールドはその一部です。
  これにより「通知は独自語彙で来るのに、購読を読んでも通知語彙が判らない」非対称が解消します
  (文字列のときのみ返る規則は上記のとおり)
- 規則は 2 箇所に集約されています: 書き込み側 (初期化) が `resolveJsonldContextInit`、
  読み取り側 (既定値の解決) が `resolveNotificationJsonldContext` — どちらも
  `src/core/subscriptions/notification-context.ts`。**封筒の `@context`・型名の compaction・
  属性名の compaction がすべて同じ値**を使います
- **通知語彙の初期化は照合語彙 (`matchJsonldContext`) を書き換えません。** 照合語彙が更新されるのは
  `entities` を含む PATCH の場合だけです (#1801 の既存挙動)。通知語彙を初期化する際、
  照合語彙が未設定なら core で固定します。照合語彙は `typePattern` の照合候補
  (保存 FQN + その語彙での短縮名) を決めるため、ここに通知語彙が漏れると**過剰マッチ**に
  なります (#1801 が分離した目的)
- **`@context` だけを送る `PATCH` は従来どおり `400 BadRequestData` です。** 通知語彙の初期化は
  「更新可能なメンバ」ではないため、更新メンバが 1 つも無い body は初期化も行わずに拒否されます
- **本修正以前に `entities` を含む PATCH で語彙を切り替えた既存購読**は、通知は引き続きその語彙
  ですが (読み取り側フォールバック)、`GET` では `jsonldContext` が省略されたままです。次に
  独自語彙付きの PATCH を受けた時点で初期化されます (能動的なマイグレーションは行いません)
- **`csourceSubscriptions` でも同じフィールドが使えます (#2025)**。
  `POST` / `PATCH /ngsi-ld/v1/csourceSubscriptions` は `jsonldContext` を保存し、`GET` で返し、
  `ContextSourceNotification` の封筒に適用します。未指定なら購読作成・更新時の `@context` が
  既定になります (通常購読と同じ写像)

### Notification Body Shape (NGSI-LD vs NGSIv2, #1765)

The notification body is built from the **subscription's** protocol, not the event's.

**NGSI-LD subscriptions** deliver an ETSI `Notification` (GS CIM 009 clause 5.2.13), whose
mandatory members are `id` (a URI — GeonicDB mints `urn:ngsi-ld:Notification:<uuid>` per
delivery), `type` (`"Notification"`), `subscriptionId`, `notifiedAt` and `data`. Each entity in
`data[]` is rendered in the NGSI-LD representation selected by `notification.format`
(default `normalized`, per clause 5.2.14):

| `notification.format` | `data[]` attribute shape |
|---|---|
| `normalized` (default) | `{"temperature": {"type": "Property", "value": 32.5}}` — attribute `type` is `Property` / `Relationship` (with `object`) / `GeoProperty` / `LanguageProperty` … |
| `concise` | `{"temperature": 32.5}`, or `{"value": 32.5, "<subAttr>": …}` when sub-attributes are present (sub-attribute rendering itself is still normalized — see the known gaps below) |
| `keyValues` | `{"temperature": 32.5}` — values only, no type information or sub-attributes. Multi-attributes become a `dataset` map: `{"temperature": {"dataset": {"@none": 32.5, "urn:ngsi-ld:Dataset:a": 30.1}}}` (clause 4.5.4, #1930). `simplified` is accepted as the ETSI synonym (Table 5.2.14.1-1, #2103) and normalized to `keyValues` on intake |

`showChanges` adds a type-specific previous-member (previous **value/object**, unwrapped) in
`normalized` / `concise`; `keyValues` cannot represent sub-attributes, so all previous-members are
omitted there.

For **multi-attributes** the previous-member is attached **per instance**, paired by `datasetId`
(ETSI GS CIM 009 clause 4.5.2.3 makes `previousValue` a member of the Property instance, and
clause 4.5.5 identifies instances by `datasetId` — never by array position, #1813):

- an instance whose `datasetId` existed before the change carries its own previous-member;
- an instance that is **new** (no counterpart under the same `datasetId`) carries **none** — there
  is no "previous value" for something that did not exist;
- an instance whose value did not change still carries a previous-member equal to its current
  value, because `changedAttributes` only has attribute-name granularity and omitting it would
  recreate the very "looks like nothing changed" gap #1813 fixed;
- the shape follows the **current** state: if the attribute is now a single instance, the output
  stays a single object and is not turned into an array.

| Attribute type | Previous-member |
|---|---|
| `Property` | `previousValue` |
| `GeoProperty` | `previousValue` (no dedicated name in ETSI Table 5.2.7) |
| `TemporalProperty` | `previousValue` (fallback; clause 4.8 defines no previous-member) |
| `Relationship` | `previousObject` |
| `LanguageProperty` | `previousLanguageMap` |
| `VocabProperty` (`vocab` shape) | `previousVocab` |
| `VocabProperty` (`vocabMap` shape) | `previousVocabMap` (**GeonicDB extension**; `vocabMap` itself is not defined in ETSI GS CIM 009) |
| `ListProperty` | `previousValueList` |
| `ListRelationship` | `previousObjectList` |
| `JsonProperty` | `previousJson` |

For `VocabProperty`, the previous-member name is chosen from the **old instance shape**: previous
`vocab` values use `previousVocab`, previous `vocabMap` values use `previousVocabMap`.

**NGSIv2 subscriptions** keep the Orion-compatible body — `subscriptionId` + `data[]` in NGSIv2
representation (attribute `type` is the value type: `Number` / `Text` / …) — with **no**
`id` / `type` Notification envelope. `notifiedAt` and `triggerReason` are GeonicDB extensions on
that path.

Subscriptions created before the `protocol` field existed (#1570) carry no protocol; they are
delivered in the legacy (internal) shape unchanged rather than guessed into either form.

Both delivery routes — the Lambda pipeline (`matcher` → SQS → `notifier`) and the
standalone in-process service (`npm start` / E2E) — build the body through the **same** shared functions
(`formatNotificationData` / `buildNotificationBody`), for entity-change and rule-triggered
notifications alike, so the two routes cannot drift apart.

### HTTP delivery transport (#2932)

Outbound HTTP notifications (entity subscriptions, CSource subscriptions, and ReactiveCore
`webhook` actions) use `pinnedRequest`: the broker resolves the endpoint host **once**, validates
the address against the SSRF blocklist, and pins the TCP connection to that IP so a DNS rebinding
between check and connect cannot reach an internal address.

**Redirects are not followed.** A `3xx` response is a delivery failure (ETSI GS CIM 009 V1.8.1
clause 5.8.6 treats any status other than `200 OK` as failure) and is **not** retried as transient.
If a receiver needs a different URL, put that URL directly in the subscription / webhook
configuration — do not rely on `301`/`302`/`307`/`308` from the first hop.

### Protocol Isolation in Matching (#2253)

The paragraph above is about the *shape* of the body. Matching itself is a separate question, and
until #2253 it did not look at `protocol` at all: candidate subscriptions were selected by
`tenant` + `servicePath` + `entityTypes` + `status` only. Entities are protocol-isolated (#964 — an
entity created through the NGSIv2 API is invisible to NGSI-LD reads and vice versa), so
**the change event was the only thing that crossed that boundary**: creating a `Room` through
`POST /v2/entities` notified an NGSI-LD subscription watching `Room`, and the reverse held too.
Nothing errored — the receiver simply learned the id, type and attribute values of an entity it
could not read.

Matching now compares the subscription's `protocol` (recorded at create time, #1570) with the
protocol of the change event. A subscription only fires for changes made through the API it was
created with. The rule is enforced in two layers — a MongoDB pushdown in `findMatchingSubscriptions`
and an application-layer guard shared by both delivery routes — because a pushdown alone would
silently loosen the moment a call site forgot to pass the protocol.

**Subscriptions created before #1570 carry no `protocol` and keep matching both protocols.** There
is no way to recover which API created them, and picking a side would silently stop deliveries for
whichever side is wrong — the same class of accident this change is closing, with a larger blast
radius. Crossing the protocol boundary does not cross an authorization boundary (the delivered rows
still pass the creator's read predicate, below), so leaving those documents fail-open costs less
than stopping their deliveries. Re-creating such a subscription through the intended API is enough
to opt it into the isolation.

### Context Source Registration Notifications (CSource Subscriptions, #1837)

For NGSI-LD Context Source Registration subscriptions (`/ngsi-ld/v1/csourceSubscriptions`), change
notifications use `type: "ContextSourceNotification"` (ETSI GS CIM 009 Table 5.3.2-1), not
`"Notification"`. The `Ngsild-Trigger` header still indicates the change class
(`csourceRegistration-created|updated|deleted`), and `id` continues to be a valid URI with the
existing GeonicDB prefix contract (`urn:ngsi-ld:Notification:`).

**Initial notification on subscription creation (#1764).** Creating a `csourceSubscription`
sends **one notification for each already-registered Context Source Registration that matches**
(ETSI GS CIM 009 clause 5.11.7). Without it, a subscriber learns nothing until the next
registration change, so existing context sources stay invisible. The initial notification reuses
the change-notification path, so the same matching rules, row-level read redaction (#2133),
daily notification quota (#1544) and `@context` selection (#2025) apply. Delivery is
fire-and-forget: a failed initial notification does not roll back the `201`.

**Known gaps** (tracked separately, not addressed by #1765):

| Gap | Issue |
|---|---|
| `concise` is not fully concise: it drops the reserved sub-attributes `unitCode` / `observedAt` / `datasetId`, and renders user-defined sub-attributes in normalized form (a sub-Property should collapse to its bare value). Not notification-specific — `GET /entities?format=concise` behaves the same way | [#1779](https://github.com/geolonia/geonicdb/issues/1779) |

Both of the gaps below were closed by PR-F of Epic [#1979](https://github.com/geolonia/geonicdb/issues/1979)
and are documented in "Notification `@context`" and "NGSIv2 `attrsFormat`" below:
NGSIv2 `attrsFormat` is now applied to the notification body ([#1780](https://github.com/geolonia/geonicdb/issues/1780)),
and NGSI-LD notifications carry their `@context` ([#1841](https://github.com/geolonia/geonicdb/issues/1841) /
[#1781](https://github.com/geolonia/geonicdb/issues/1781)).

### Notification `@context` (#1841)

ETSI GS CIM 009 clause 5.8.1.4 requires notifications to be sent with the subscription's
`jsonldContext`; when it is not given, **the field is initialized** with the `@context` applicable
to the subscription (clause 5.5.5 — the core `@context` at minimum). Because the spec mandates a
write ("shall be **initialized**"), GeonicDB initializes it on creation and on any `PATCH` that
carries a request `@context`, **whatever members that `PATCH` contains** (#2040) — and only while
the field is still unset (#2029 / #2041). GeonicDB delivers it exactly once, chosen by
`notification.endpoint.accept`:

| `accept` | Delivery |
|---|---|
| `application/ld+json` | `@context` member in the notification body |
| `application/json` (default) | `Link` header (`rel="http://www.w3.org/ns/json-ld#context"`) |
| `application/geo+json` | body `@context` by default; `Link` header when `receiverInfo` carries `Prefer: body=json` (clause 6.3.8) |
| MQTT endpoints | `@context` member in the body (MQTT has no headers) |
| `httpCustom` (`payload` / `json`) | neither — the body is user-defined, so claiming a `@context` for it would be wrong |

Both are never sent together: two sources of truth would let receivers disagree about the active
`@context` (the same reasoning as clause 6.3.5 "No mixes" on the request side). This constrains the
context GeonicDB itself attaches — `notification.endpoint.receiverInfo` may add a `Link` header of
its own, which is appended to (never replaces) the generated context `Link`.

`jsonldContext` itself accepts only a single dereferenceable URI string. A one-element URI
array in the subscription request `@context` is folded to that URI (#2344) — it is already
dereferenceable, so no `ImplicitlyCreated` copy is minted. An inline object or a mixed /
multi-URL array can only reach the notification path through the subscription request
`@context` (used when `jsonldContext` is omitted). Such a context cannot be carried in a `Link`
header in full, so it is placed in the body even for `application/json` — emitting just the URL part
would silently drop the terms defined inline.

### GeoJSON notifications (`accept: application/geo+json`

) — #1762

ETSI GS CIM 009 clause 5.2.15 lists `application/geo+json` as one of the three values
`notification.endpoint.accept` may take, and clause 6.3.8 covers it explicitly in the notification
binding. GeonicDB therefore **renders the notification body as GeoJSON** rather than only setting
the `Content-Type` — a `Content-Type: application/geo+json` carrying an ordinary NGSI-LD
`Notification` object would be a false claim about the payload.

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "urn:ngsi-ld:Store:001",
      "geometry": { "type": "Point", "coordinates": [139.6503, 35.6762] },
      "properties": { "type": "Store", "temperature": 25.5 }
    }
  ],
  "subscriptionId": "urn:ngsi-ld:Subscription:...",
  "notifiedAt": "2026-08-11T00:00:00.000Z",
  "triggerReason": "entityCreated",
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.9.jsonld"
}
```

Notes on the shape, since **clause 6.3.8 does not specify it** (it defines only the MIME type and
where `@context` goes):

- The top level is a `FeatureCollection`, matching the GeoJSON representation clause 6.3.4 defines
  for Query Entities — the notification `data` member is a list of entities.
- `subscriptionId` / `notifiedAt` / `triggerReason` are kept as **RFC 7946 §6.1 foreign members**,
  so going GeoJSON does not cost you the subscription identity.
- The `Notification` members `id` and `type: "Notification"` are **not** emitted: `type` is reserved
  by GeoJSON for the object kind, so writing `"Notification"` there would make the body invalid
  GeoJSON.
- `notification.format` (`normalized` / `concise` / `keyValues`) does **not** apply — GeoJSON is its
  own representation and `properties` carries simplified values. For the same reason `showChanges`
  `previous*` members are not present in GeoJSON notifications; use `normalized` or `concise` if you
  need them.
- The Feature `geometry` comes from the `location` attribute; entities without it get
  `"geometry": null` (valid per RFC 7946).
- Attribute names and the entity type in `properties` are compacted with the notification
  `@context`, the same as every other notification representation (clause 5.5.7).

MQTT endpoints with `accept: application/geo+json` receive the same `FeatureCollection` body (the
envelope is transport-independent); only the `Link`-header branch of clause 6.3.8 is HTTP-specific.

`ContextSourceNotification` (registration change notifications for `csourceSubscriptions`) follows
the same rules (#2025): the `@context` is the subscription's `jsonldContext`, or the `@context`
applied when the csource subscription was created/updated, and `endpoint.accept` picks body vs
`Link` header exactly as above. Before #2025 it was always the core `@context` in the body,
regardless of `accept`.

`notification.format` is **accepted and preserved but has no effect on `ContextSourceNotification`
bodies** (#2159). Table 5.3.2-1 defines `data[]` as an array of `CSourceRegistration` (cardinality 1), while
`normalized` / `concise` / `keyValues` are Entity representations (clause 4.5) — there is no
registration rendering they select between. All three values are accepted (`simplified` is
normalized to `keyValues` on intake, #2103) and returned verbatim by `GET`; the notification body is
the full registration document in every case. Before #2159 the service layer rejected `concise` with
`400` even though the shared `NotificationParams` schema and the OpenAPI document declared it.

Attribute names in `data[]` are compacted with the same `@context` (clause 5.5.7, #1788), so a
notification and a `GET` issued with that `@context` spell attributes identically. Names stored as
fully qualified IRIs are compacted; bare stored names are left as-is (change events do not carry the
entity's `attrNameForm`, so expanding them could turn a legacy short name into an IRI). This is the
same rule the entity `type` compaction already follows.

NGSIv2 subscriptions never receive an `@context` member or `Link` header.

### NGSIv2 `attrsFormat` (#1780)

`attrsFormat` selects the notification body shape and is echoed in the `Ngsiv2-AttrsFormat` header
of NGSIv2 HTTP notifications:

| `attrsFormat` | `data[]` element |
|---|---|
| `normalized` (default) | `{"id": ..., "type": ..., "temperature": {"type": "Number", "value": 25}}` |
| `keyValues` | `{"id": ..., "type": ..., "temperature": 25}` |
| `values` | `[25]` — values only, ordered by `notification.attrs` (attribute name order when `attrs` is absent) |

Subscriptions created before the `protocol` field existed (#1570) are left in the legacy normalized
shape: their API protocol cannot be determined, and guessing would rewrite bodies their receivers
already parse. They keep receiving `Ngsiv2-AttrsFormat: normalized` for the same reason.

When `httpCustom` (`payload` / `json`) defines the body, the header is `custom`, matching Orion
("If text based or JSON payloads are used ... then `Ngsiv2-AttrsFormat` header is set to `custom`").

**NGSI-LD subscriptions do not receive this header.** Its vocabulary (`normalized` / `keyValues` /
`values`) is NGSIv2's; using it to describe an NGSI-LD representation (`normalized` / `concise` /
`keyValues`) would misinform receivers. Until #1780 the header was sent on every notification with a
hardcoded `normalized`, which claimed NGSI-LD notifications were NGSIv2-normalized.

### Linked Entity Retrieval in Notifications (`notification.join` / `joinLevel`

, NGSI-LD, #2104)

ETSI GS CIM 009 Table 5.2.14.1-1 defines `join` and `joinLevel` as NotificationParams members: they
control **Linked Entity Retrieval inside the notification payload**, with the same semantics as the
`join` / `joinLevel` query parameters on entity reads (clause 4.5.23).

| Member | Values | Default | Effect on the notification `data` |
|---|---|---|---|
| `join` | `inline`, `flat`, `@none` | `@none` | `inline`: each Relationship gains an `entity` / `entityList` member holding the target(s) in the notification's own representation format. `flat`: the targets are appended to `data` as independent entities. `@none`: nothing is resolved. |
| `joinLevel` | positive integer (max `5`) | `1` | Recursion depth. Only meaningful together with `join` — `joinLevel` alone resolves nothing. |

```json
{
  "type": "Subscription",
  "entities": [{ "type": "Room" }],
  "notification": {
    "format": "normalized",
    "join": "inline",
    "joinLevel": 1,
    "endpoint": { "uri": "http://example.com/notify" }
  }
}
```

Both members are persisted and returned by `GET /ngsi-ld/v1/subscriptions{,/{id}}`. Unset members are
**not** materialized with their defaults, so a subscription that never asked for a join does not grow a
`"join": "@none"` in its representation.

The resolution runs through the same code path as entity reads, so `ListRelationship` (`objectList`),
`Relationship` with an `object` array, and multi-attribute instances are all traversed (#2225), and the
`keyValues` payload replaces the Relationship value with the target's simplified representation
(clause 4.5.3 EXAMPLE 9 / EXAMPLE 17) rather than adding a sub-member.

> **Authorization.** Linked entities are targets the subscription never declared, so they are filtered by
> the **subscription creator's** row-level read predicate — derived with the same helper the CSource
> notification path uses (#2133) and the same free-`entityType` discipline as the HTTP join (#2213). If the
> predicate cannot be determined (no `createdBy`; creator removed, deactivated or without an active
> membership in the tenant; tenant unresolvable; or a subscription created by a credential that has no user
> document at all — an API key's `createdBy` is `apikey:<keyId>`, an OAuth client's is the client id), the join
> resolves to **zero** linked entities and the notification is delivered without embedded data: `join` is
> additional representation, so it must not change whether a notification is sent. See
> [AUTH.md](../reference/auth.md).
>
> **Applies to both delivery paths.** The join is applied by a shared helper used by the Lambda matcher and
> the standalone notification service, for entity-change and ReactiveCore rule notifications alike. NGSIv2
> subscriptions (and pre-#1570 subscriptions with no `protocol`) are untouched — `join` is an NGSI-LD member.
>
> **A failed resolution never suppresses the notification.** Resolving linked entities reads the database, so
> it can fail transiently. The shared helper absorbs those failures and delivers the notification with the
> **pre-join** payload (logged as `NOTIFICATION_JOIN_RESOLUTION_FAILED`), for the same reason the undecidable
> predicate above yields zero linked entities rather than dropping the delivery: `join` is additional
> representation. Failing this direction withholds data, never exposes it.

### Field Validation at Creation / Update

Per ETSI GS CIM 009 (clause 4.21 / 5.8.1), some subscription fields cannot be combined. These are
rejected with `400 BadRequest` at create/update time (rather than creating a subscription whose
meaning is undefined):

| Rule | Reason |
|-----------|--------|
| `throttling` ⊥ `timeInterval` | These are distinct operating modes: `throttling` sets a minimum interval between change-triggered notifications, `timeInterval` sends periodic notifications. |
| `watchedAttributes` ⊥ `timeInterval` | A `timeInterval` subscription is **periodic-only** — entity changes never trigger it — so watching attributes would have no effect (ETSI GS CIM 009 clause 5.8). |
| At most one include selector (`notification.pick` / `notification.attributes` / `notification.attrs`) | The include-style attribute selectors are mutually exclusive; `pick` and `attributes`/`attrs` map to the same internal include projection. |
| At most one exclude selector (`notification.omit` / `notification.exceptAttrs`) | The exclude-style attribute selectors are mutually exclusive; `omit` and `exceptAttrs` map to the same internal exclude projection. |
| Include ⊥ exclude | An include selector cannot be combined with an exclude selector (`pick`/`omit` are mutually exclusive per clause 4.21). |

---

## Practical Examples

### Example 1: Temperature Threshold Monitoring

A subscription that sends high-temperature alerts:

```bash
curl -X POST http://localhost:3000/v2/subscriptions \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -d '{
    "description": "High temperature alert",
    "subject": {
      "entities": [{ "type": "TemperatureSensor" }],
      "condition": {
        "attrs": ["temperature"],
        "expression": { "q": "temperature>35" }
      }
    },
    "notification": {
      "http": { "url": "https://alerts.example.com/high-temp" },
      "attrs": ["temperature", "location"]
    }
  }'
```

### Example 2: Vehicle Location Tracking

Track vehicle position changes:

```bash
curl -X POST http://localhost:3000/v2/subscriptions \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: fleet" \
  -d '{
    "description": "Vehicle location tracking",
    "subject": {
      "entities": [{ "idPattern": "Vehicle.*", "type": "Vehicle" }],
      "condition": { "attrs": ["location"] }
    },
    "notification": {
      "http": { "url": "https://tracking.example.com/update" },
      "attrs": ["location", "speed", "status"],
      "attrsFormat": "keyValues"
    }
  }'
```

### Example 3: Custom Payload (Slack Notification)

Send a custom-formatted notification to a Slack Webhook:

```bash
curl -X POST http://localhost:3000/v2/subscriptions \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -d '{
    "description": "Slack notification for alerts",
    "subject": {
      "entities": [{ "type": "Alert" }],
      "condition": { "attrs": ["severity"] }
    },
    "notification": {
      "httpCustom": {
        "url": "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
        "method": "POST",
        "headers": { "Content-Type": "application/json" },
        "payload": "{\"text\": \"⚠️ Alert: ${id} - Severity: ${severity}\"}"
      }
    }
  }'
```

### Example 4: MQTT Sensor Data Delivery

Deliver sensor data to an MQTT broker:

```bash
curl -X POST http://localhost:3000/v2/subscriptions \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: iot" \
  -d '{
    "description": "Sensor data to MQTT",
    "subject": {
      "entities": [{ "type": "Sensor" }],
      "condition": { "attrs": ["value"] }
    },
    "notification": {
      "mqtt": {
        "url": "mqtts://broker.hivemq.com:8883",
        "topic": "sensors/${type}/${id}",
        "qos": 1
      },
      "attrsFormat": "keyValues"
    }
  }'
```

---

## Best Practices

### 1. Configure Conditions Appropriately

**❌ Bad example: monitoring all entities**

```json
{
  "subject": {
    "entities": [{ "idPattern": ".*" }],
    "condition": { "attrs": [] }
  }
}
```

The volume of notifications will be excessive and put a load on the system.

**✅ Good example: narrow down by specific type and conditions**

```json
{
  "subject": {
    "entities": [{ "type": "Sensor" }],
    "condition": {
      "attrs": ["temperature"],
      "expression": { "q": "temperature>25" }
    }
  }
}
```

### 2. Configure Throttling

Set `throttling` (in seconds) to prevent excessive notifications:

```json
{
  "throttling": 60
}
```

This limits change notifications for the same entity to once every 60 seconds.

### 3. Set an Expiry

Set `expires` for test subscriptions:

```json
{
  "expires": "2026-12-31T23:59:59.000Z"
}
```

### 4. Notify Only Changed Attributes

Reduce unnecessary notifications:

```json
{
  "notification": {
    "onlyChangedAttrs": true
  }
}
```

### 5. Status Management

Set to `inactive` to temporarily stop notifications:

```bash
curl -X PATCH http://localhost:3000/v2/subscriptions/{id} \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: demo" \
  -d '{ "status": "inactive" }'
```

### 6. Error Handling

Implement the following at the notification destination endpoint:
- **Return a 2xx status code**: to indicate success
- **Retry logic**: to handle transient failures
- **Timeout settings**: to prevent long hangs

---

## Access Control and Ownership (GeonicDB Extension)

> **Note**: `super_admin` cannot access subscription endpoints (`/v2/subscriptions`, `/ngsi-ld/v1/subscriptions`) as they are data APIs. Use `tenant_admin` or `user` role instead.

In environments with authentication enabled, ownership-based access control is applied to subscriptions.

### Behavior

- When a subscription is created, the authenticated user's ID is recorded in the `createdBy` field.
- **Update (PATCH) and deletion (DELETE)** can only be performed by users who meet one of the following conditions:
  - The creator of the subscription (`createdBy` matches)
  - The `tenant_admin` role
- If the above conditions are not met, **404 Not Found** is returned (#2189). Returning `403` would confirm
  the subscription exists to a principal that cannot read it — read paths hide the subscription (see
  #2140), so a `403` on the write path would leak its existence (an **existence oracle**). `404` is
  indistinguishable from "no such document".
- Subscriptions with **no `createdBy`** (created before that field existed) also return **404 Not Found** to
  non-admins on update and delete (#2161). `tenant_admin` can still manage those documents.

> **`super_admin` is not an escape hatch here.** The service-layer ownership check does skip `super_admin`,
> but with authentication enabled that role never reaches these endpoints: `SUPER_ADMIN_DATA_API_DENY_FENCE`
> (`policy.defaults.ts`) hard-denies `/v2/**` and `/ngsi-ld/**` for `super_admin` as a deny-overrides fence
> that custom policies cannot lift, so that platform administrators cannot touch tenant data. The
> administrator role that can actually manage subscriptions and registrations is **`tenant_admin`**. (With
> `AUTH_ENABLED=false` every request is a synthetic `super_admin` and no fence applies, but then there is no
> ownership enforcement to speak of either.)
- **Retrieval (GET) and listing (LIST)** are not subject to the ownership check — they are *not* filtered by
  creator — but that does **not** mean every document in the tenant is visible. Since #2140 reads pass
  through the row-level read predicate: subscriptions declaring only entity types the principal cannot read
  are hidden entirely (404 on by-id, excluded from lists and counts, notification endpoint URLs included),
  and unreadable type selectors are stripped from mixed subscriptions.
- **Delivery is filtered by the creator's read predicate (#2205).** #2140 above decides whether the
  *subscription document* is visible; it says nothing about the entities the subscription delivers.
  Because subscription writes are authorized with the subscription resource path as the frame, a
  policy that restricts `GET /ngsi-ld/v1/entities` never applies to subscription creation at all —
  a subject denied a type could subscribe to it and receive it as notifications. Every notification
  is therefore filtered at delivery time with the creator's row-level read predicate, evaluated on
  the real entity across all three dimensions (`entityType`, `entityOwner`, `scope`). The invariant
  is: **a row creator P cannot see on `GET /ngsi-ld/v1/entities` is never delivered to P's
  subscriptions.** This also closes two long-standing gaps — subscriptions created before a
  restriction was tightened are re-evaluated on every delivery rather than only on `PATCH`, and the
  `scope` / `entityOwner` dimensions apply even to concrete-type selectors.
  Creators without a user document — **API keys and OAuth clients** — are evaluated against their own
  bound policy (#2282): the subscription stores the creator's principal kind (`createdByRole`) and the
  predicate is derived from the credential document, with the `policyId` read **live** so re-binding a
  key takes effect on the next delivery. The principal kind is never inferred from the shape of
  `createdBy`, so a user id that happens to look like an API-key id cannot be evaluated with a
  credential's policy.
  Deliveries **stop** (fail-closed, with a `securityEvent` warning log) when the predicate cannot be
  determined, and the conditions differ by principal kind. For **every** creator: no stored
  `createdBy` (legacy documents), an unresolvable tenant, or a predicate that denies entity reads
  outright. For **user** creators additionally: a creator that cannot be resolved to an active user
  (deleted / deactivated), or one without an active membership in the notified tenant. For
  **credential** creators (`api_key` / `oauth_client`) the user and membership conditions do not
  apply at all — instead: no stored `createdByRole` (subscriptions written before #2282), or a
  credential document that is missing, revoked (`isActive: false`), or belongs to a different
  tenant. With `AUTH_ENABLED=false` there is no predicate to speak of and delivery is unrestricted,
  matching the HTTP read path.

> **Note**: The same ownership validation applies to registrations (`/v2/registrations`, `/ngsi-ld/v1/csourceRegistrations`) and — since #2188 — to context source subscriptions (`/ngsi-ld/v1/csourceSubscriptions`). The same contract also covers custom data models (`/custom-data-models`) since #2198. All four share: admin bypass, missing `createdBy` → `404`. **Owner mismatch is `404` for subscriptions / registrations / csource-subscriptions (#2189), but stays `403` for custom data models** — custom data models are not subject to the row-level read predicate, so their existence is visible to a restricted caller on `GET`, and no `404`-vs-`403` existence oracle exists to close.

### XACML attribute-based control on Subscription writes (#1104 / #2005)

On every subscription **write** — create *and* update, across all three subscription resources — the XACML PIP injects subscription-target attributes into `AuthzRequest.resource`, enabling fine-grained policy control:

| Resource | Create | Update |
|----------|--------|--------|
| NGSI-LD subscriptions | `POST /ngsi-ld/v1/subscriptions` | `PATCH /ngsi-ld/v1/subscriptions/{id}` |
| Context source subscriptions | `POST /ngsi-ld/v1/csourceSubscriptions` | `PATCH /ngsi-ld/v1/csourceSubscriptions/{id}` |
| NGSIv2 subscriptions | `POST /v2/subscriptions` | `PATCH /v2/subscriptions/{id}` |

| Resource attribute | Source field (NGSI-LD / csource) | Source field (NGSIv2) | Example use |
|--------------------|----------------------------------|-----------------------|-------------|
| `entityType` | `entities[].type` | `subject.entities[].type` | "Anonymous can subscribe only to `ActivityLog`" |
| `entityId` | `entities[].id` | `subject.entities[].id` | Restrict to specific entity IDs |
| `entityIdPattern` | `entities[].idPattern` | `subject.entities[].idPattern` | Restrict by id pattern |
| `notificationEndpoint` | `notification.endpoint.uri` | `notification.http` / `httpCustom` / `mqtt` / `mqttCustom` `.url` | "Notifications may only be posted to `https://*.example.com/**`" — defence against SSRF / data exfiltration |

When `entities[]` contains multiple elements, **every element must Permit** for the write to succeed (all-Permit semantics). A single mismatched type or id pattern rejects the entire request with `403 Forbidden`.

Because a subscription is a continuous read, an update is evaluated on the **post-update effective value**: the value the request body declares, or — when the body does not touch them — the value already stored. So a restricted caller can neither swap a permitted subscription over to a restricted type nor keep a now-restricted subscription alive by editing only its other fields. Narrowing a restricted subscription down to a permitted type is allowed.

> The literal `body.type === "Subscription"` is **not** propagated to `entityType`. Policies must target `entities[].type`, not the wrapper object's type.
>
> Policies matching `path` exactly against `/ngsi-ld/v1/subscriptions` cover only the create call. Use a glob (`/ngsi-ld/v1/subscriptions**`) to cover updates too — `*` does not cross `/`.

For details on authentication and authorization, see [AUTH.md § Subscription PIP attributes](../reference/auth.md#subscription-pip-attributes).

---

## Troubleshooting

### 1. Notifications Are Not Being Delivered

**Causes:**
- Condition expression does not match
- Notification destination URL is unreachable
- Subscription is `inactive` or has expired
- The tenant's daily notification fan-out quota (`maxNotificationsPerDay`, #1544) has
  been exhausted for the day — see [QUOTAS.md](../saas/quotas.md#notification-fan-out-quota-1544).
  This drops the individual notification (with a warning log and a
  `notificationQuotaExceeded` metric) without touching the subscription itself or
  returning any HTTP error, since delivery happens outside the triggering API request.
  **`remaining: 0` with `limit > 0`** clears on its own at the next UTC midnight (the
  counter is a UTC-day bucket). **`limit: 0` is an explicit, permanent stop** for that
  tenant — it never clears on its own and requires a quota change via
  `PUT /admin/tenants/{tenantId}/quotas`
- **The change was made through the other API protocol (#2253).** A subscription created through
  `/ngsi-ld/v1/subscriptions` only fires for NGSI-LD entity changes, and one created through
  `/v2/subscriptions` only for NGSIv2 changes. Re-create the subscription through the API you write
  entities with. (Subscriptions created before #1570 are exempt and still match both.)
- **The creator cannot read the entity (#2205).** Deliveries are filtered by the subscription
  creator's row-level read predicate, so a row hidden from that principal on
  `GET /ngsi-ld/v1/entities` is not delivered either. API-key and OAuth-client creators are judged
  against their own bound policy (#2282). Deliveries stop entirely when the predicate cannot be
  determined — for any creator: legacy subscriptions with no stored `createdBy`; for **user**
  creators: a creator that no longer resolves to an active user, or one without an active membership
  in the tenant; for **credential** creators: no stored `createdByRole`, or a credential that is
  revoked / deleted / from another tenant (the user and membership conditions never apply to them).
  Server logs carry
  `errorCode: SUBSCRIPTION_NOTIFICATION_RLS_DENIED` (predicate says no) or
  `SUBSCRIPTION_NOTIFICATION_RLS_SKIPPED` (predicate undecidable) with the `subscriptionId`.

**How to check:**

```bash
# Check subscription details
curl http://localhost:3000/v2/subscriptions/{id} \
  -H "Fiware-Service: demo"

# Check status, expires, and lastNotification

# Check today's notification quota usage for the tenant
curl http://localhost:3000/admin/tenants/{tenantId}/quotas \
  -H "Authorization: Bearer {token}"
# → currentUsage.notifications.day: { used, limit, remaining, usagePercent, date }
```

**Resolution:**
- Test the condition expression: manually update an entity and verify the condition is met
- Test the notification URL: verify it is directly reachable via `curl`
- Change the status to `active`
- If `currentUsage.notifications.day.remaining` is `0`, delivery resumes automatically
  at UTC midnight; for a sustained need above the plan limit, request a
  `customQuotas.rateLimit.maxNotificationsPerDay` override

### 2. Notifications Are Duplicated

**Causes:**
- `throttling` is not configured
- Multiple subscriptions are monitoring the same entity

**Resolution:**

```bash
# Configure throttling
curl -X PATCH http://localhost:3000/v2/subscriptions/{id} \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: demo" \
  -d '{ "throttling": 30 }'

# Check the subscription list
curl http://localhost:3000/v2/subscriptions \
  -H "Fiware-Service: demo"
```

### 3. Notification Payload Is Not as Expected

**Causes:**
- `attrs` filter is not configured correctly
- `attrsFormat` is not appropriate
- `httpCustom` macro syntax is incorrect

**How to check:**

```bash
# Check subscription configuration
curl http://localhost:3000/v2/subscriptions/{id} \
  -H "Fiware-Service: demo" | jq '.notification'
```

**Resolution:**
- Update `attrs` to include the required attributes
- Change `attrsFormat` to `normalized` or `keyValues`
- Verify `httpCustom` macro syntax (the `${attrName}` must match the attribute name)

### 4. MQTT Notifications Are Not Being Sent

**Causes:**
- Cannot connect to the MQTT broker
- Authentication credentials are incorrect
- Topic name is invalid

**How to check:**

```bash
# Test the connection to the MQTT broker (using mosquitto_sub)
mosquitto_sub -h broker.example.com -p 1883 -t "sensors/#" -u username -P password
```

**Resolution:**
- Verify the MQTT broker URL, port, and credentials
- Check that the topic name does not contain special characters
- Try lowering the QoS level to 0

### 5. Subscription Automatically Becomes inactive

**Causes:**
- The notification destination keeps returning transient errors (5xx, 429, timeout) for
  `NOTIFICATION_AUTO_PAUSE_AFTER_MS` (default 1 hour) without a successful delivery
  (#3080). GeonicDB then sets the subscription `status` to `inactive` and records
  `autoDisabledAt` (GeonicDB extension) so you can tell broker auto-pause from a manual pause.
- Web Push destinations that return `404` / `410` set `status` to `failed` instead (#3014).

**How to tell:**
- `GET` the subscription: `status` is `inactive` (NGSI-LD renders it as `paused`) and
  `autoDisabledAt` is present
- CloudWatch metric `GeonicDB/SubscriptionAutoPaused` / alarm `subscription-auto-paused`

**Resolution:**
- Fix the notification destination so it responds with 2xx
- Set the subscription back to `active` (`PATCH` with `status: "active"` on NGSIv2, or
  `isActive: true` on NGSI-LD). That clears `autoDisabledAt` and the failure streak

---

## Related Documentation

- [API Common Specification](../api-reference/endpoints.md) - REST API documentation
- [API_NGSIV2.md](../api-reference/ngsiv2.md) - NGSIv2 Subscriptions API Reference
- [API_NGSILD.md](../api-reference/ngsild.md) - NGSI-LD Subscriptions API Reference
- [EVENT_STREAMING.md](./subscriptions.md) - WebSocket Event Streaming
