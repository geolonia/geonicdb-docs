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

> **Note (#1304)**: ホスト名ルーティングされたデプロイメント（マルチサブドメイン構成の専用 DB）でも購読は発火します。API 経由のエンティティ変更はリクエストスコープでイベントを発行し、発生元デプロイメントの情報（`deployment.hostname`）を運んで背景ワーカーが正しい DB に対してマッチング・通知・状態更新を行います。**制限**: デプロイメント DB への直接 DB 書き込み（API を経由しない変更）はイベントを発火しません — change stream によるバックアップ監視はデフォルト DB のみです（デフォルト DB には EventBridge 発行漏れ時の冗長経路がありますが、デプロイメント DB にはない信頼性の非対称があります）。また、デプロイメント行の登録・有効化はキャッシュ（最大 5 分）の反映後にワーカーへ届きます。

---

## How Subscriptions Work

```text
1. Entity creation/update/delete (via API), published directly to EventBridge by EntityService
   — or, for TTL-expired entities (`expiresAt`), claimed and published by the expiry sweeper (#1561)
   ↓
2. SubscriptionMatcher searches for subscriptions matching the conditions
   ↓
3. Notification message is sent to the SQS queue
   ↓
4. NotificationSender sends an HTTP/MQTT notification to the external endpoint
```

**Latency**: Near-instant for regular entity create/update/delete via the API. For TTL expiry, add up to ~1 minute for the expiry sweeper's polling interval (`ENTITY_EXPIRY.SWEEP_INTERVAL_SECONDS`, see [QUOTAS.md](../saas/quotas.md#ttl-失効-expiresat-expiry-sweeper1561)) before the `EntityDeleted` notification enters this pipeline.

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

`typePattern` is accepted by both APIs (`type` and `typePattern` are mutually exclusive). In
NGSIv2 it is part of the specification; in NGSI-LD subscriptions (`entities[].typePattern`) it is
a **GeonicDB extension** — the ETSI `EntitySelector` has no `typePattern`. Unlike `type`, a
`typePattern` is **not** term-expanded with the `@context` (#1657). For NGSI-LD entities whose
type is stored in canonical FQN form (a term mapped by an `@context` to an absolute IRI), the
pattern is matched against **both** the stored FQN and the term compacted with the subscription's
own `@context`, which is saved at create/update time for this purpose (#1680) — so a pattern
written against the short name (e.g. `Sensor.*`) keeps matching entities created via a mapping
context.

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

### Notification `jsonldContext` (NGSI-LD, #1847 / #1801)

NGSI-LD Subscription には、通知用のトップレベル `jsonldContext` を指定できます。これは
**dereferenceable URI 文字列** (ETSI Table 5.2.12-1: `String | Dereferenceable URI | 0..1`)
で、通知送出時に使う `@context` を明示的に上書きするためのフィールドです。

- `jsonldContext` 未指定時は、購読自体の `@context` で初期化されます (clause 5.8.1.4)
- 指定値が不正な URI の場合は `400 BadRequestData`
- URI が取得不能な場合は `504 LdContextNotAvailable`
- レスポンス (`GET /ngsi-ld/v1/subscriptions*`) では、`jsonldContext` が**文字列のときのみ**返ります
- リクエスト `@context` に含まれるインライン object/array は `jsonldContext` の文字列として表現できないため、レスポンスでは省略されます
- **`PATCH` で適用した `@context` も既定値になります (#2029)**。`PATCH /ngsi-ld/v1/subscriptions/{id}`
  はリクエスト `@context` を照合用 (`matchJsonldContext`) に保存するため、`jsonldContext` を
  明示していない購読では**その値**が通知の語彙になります (clause 5.8.1.4 の "the `@context` used for
  the subscription")。既定値の解決は `resolveNotificationJsonldContext`
  (`src/core/subscriptions/notification-context.ts`) の 1 箇所にあり、**封筒の `@context`・型名の
  compaction・属性名の compaction がすべて同じ値**を使います。明示指定した `jsonldContext` は
  `PATCH` では上書きされません
- **`csourceSubscriptions` でも同じフィールドが使えます (#2025)**。`POST` / `PATCH
  /ngsi-ld/v1/csourceSubscriptions` は `jsonldContext` を保存し、`GET` で返し、
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
| `keyValues` | `{"temperature": 32.5}` — values only, no type information or sub-attributes. Multi-attributes become a `dataset` map: `{"temperature": {"dataset": {"@none": 32.5, "urn:ngsi-ld:Dataset:a": 30.1}}}` (clause 4.5.4, #1930) |

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
standalone/docker in-process service — build the body through the **same** shared functions
(`formatNotificationData` / `buildNotificationBody`), for entity-change and rule-triggered
notifications alike, so the two routes cannot drift apart.

### Context Source Registration Notifications (CSource Subscriptions, #1837)

For NGSI-LD Context Source Registration subscriptions (`/ngsi-ld/v1/csourceSubscriptions`), change
notifications use `type: "ContextSourceNotification"` (ETSI GS CIM 009 Table 5.3.2-1), not
`"Notification"`. The `Ngsild-Trigger` header still indicates the change class
(`csourceRegistration-created|updated|deleted`), and `id` continues to be a valid URI with the
existing GeonicDB prefix contract (`urn:ngsi-ld:Notification:`).

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
`jsonldContext`; when it is not given, the `@context` applicable to the subscription is used
(clause 5.5.5 — the core `@context` at minimum). GeonicDB delivers it exactly once, chosen by
`notification.endpoint.accept`:

| `accept` | Delivery |
|---|---|
| `application/ld+json` | `@context` member in the notification body |
| `application/json` (default) | `Link` header (`rel="http://www.w3.org/ns/json-ld#context"`) |
| MQTT endpoints | `@context` member in the body (MQTT has no headers) |
| `httpCustom` (`payload` / `json`) | neither — the body is user-defined, so claiming a `@context` for it would be wrong |

Both are never sent together: two sources of truth would let receivers disagree about the active
`@context` (the same reasoning as clause 6.3.5 "No mixes" on the request side). This constrains the
context GeonicDB itself attaches — `notification.endpoint.receiverInfo` may add a `Link` header of
its own, which is appended to (never replaces) the generated context `Link`.

`jsonldContext` itself accepts only a single dereferenceable URI string. An inline object or a
mixed URL/inline array can only reach the notification path through the subscription request
`@context` (used when `jsonldContext` is omitted). Such a context cannot be carried in a `Link`
header in full, so it is placed in the body even for `application/json` — emitting just the URL part
would silently drop the terms defined inline.

`ContextSourceNotification` (registration change notifications for `csourceSubscriptions`) follows
the same rules (#2025): the `@context` is the subscription's `jsonldContext`, or the `@context`
applied when the csource subscription was created/updated, and `endpoint.accept` picks body vs
`Link` header exactly as above. Before #2025 it was always the core `@context` in the body,
regardless of `accept`.

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

### Field Validation at Creation / Update

Per ETSI GS CIM 009 (clause 4.21 / 5.8.1), some subscription fields cannot be combined. These are
rejected with `400 BadRequest` at create/update time (rather than creating a subscription whose
meaning is undefined):

| Rule | Reason |
|-----------|--------|
| `throttling` ⊥ `timeInterval` | These are distinct operating modes: `throttling` sets a minimum interval between change-triggered notifications, `timeInterval` sends periodic notifications. |
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
- If the above conditions are not met, **403 Forbidden** is returned.
- **Retrieval (GET) and listing (LIST)** are unrestricted for any authenticated user within the same tenant.

> **Note**: The same ownership validation applies to registrations (`/v2/registrations`, `/ngsi-ld/v1/csourceRegistrations`).

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

**How to check:**

```bash
# Check subscription details
curl http://localhost:3000/v2/subscriptions/{id} \
  -H "Fiware-Service: demo"

# Check status, expires, and lastNotification
```

**Resolution:**
- Test the condition expression: manually update an entity and verify the condition is met
- Test the notification URL: verify it is directly reachable via `curl`
- Change the status to `active`

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
- The notification destination is returning errors continuously (5xx, timeout)
- GeonicDB automatically disabled the subscription

**Resolution:**
- Check the logs of the notification destination endpoint
- Fix the endpoint so it responds correctly
- Set the subscription back to `active`

---

## Related Documentation

- [API Common Specification](../api-reference/endpoints.md) - REST API documentation
- [API_NGSIV2.md](../api-reference/ngsiv2.md) - NGSIv2 Subscriptions API Reference
- [API_NGSILD.md](../api-reference/ngsild.md) - NGSI-LD Subscriptions API Reference
- [EVENT_STREAMING.md](./subscriptions.md) - WebSocket Event Streaming
