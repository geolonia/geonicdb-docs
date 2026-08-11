---
title: "NGSI-LD API"
description: "NGSI-LD API reference"
outline: deep
---
# NGSI-LD API

> This document has been separated from [API.md](./endpoints.md). For the main API specification, refer to [API.md](./endpoints.md).

---

NGSI-LD is a JSON-LD based context information management API.

> **Note:** The NGSI-LD API ignores the `Fiware-ServicePath` header per ETSI GS CIM 009 spec. Hierarchy is managed via the `scope` entity property and `scopeQ` query parameter. `servicePath` and `scope` are independent concepts — they are not automatically synchronized (see [INTEROPERABILITY.md](../core-concepts/ngsiv2-vs-ngsild.md#3-scope-scope-hierarchy)). This also applies to authorization (#1323): XACML policies with a `servicePath` resource attribute always see `/` on NGSI-LD requests, so `Fiware-ServicePath` **cannot be used as an access-control or isolation boundary** on NGSI-LD — use `scope` / `entityType` policy constraints instead (see [AUTH.md](../reference/auth.md)).
>
> **Scope character set (#1189):** Each scope segment must match `[A-Za-z0-9._-]` (POSIX Portable Filename Character Set; GeonicDB extension of the NGSI-LD spec set `[A-Za-z0-9_]`), and the first character of a segment may not be `-`. Strings violating this — e.g. containing `;` `+` `#` half-width space, or missing the leading `/` — are rejected with `400 BadRequestData` to prevent `scopeQ` collisions and silent footguns. See [INTEROPERABILITY.md → Scope Character Set](../core-concepts/ngsiv2-vs-ngsild.md#scope-character-set-geonicdb-独自拡張).
>
> **Entity field character set (#1209 / #1211):** `id` accepts `A-Z a-z 0-9 . _ - :` (`:` for NGSI-LD URN form, no leading `-`); `type` accepts **POSIX portable short names** (`A-Z a-z 0-9 . _ -`, no leading `-`) **or absolute IRIs** (e.g. `https://uri.fiware.org/ns/data-models#WeatherObserved`, `urn:ngsi-ld:Type:Sensor`); **attribute names accept short names (`A-Z a-z 0-9 _`) or absolute IRIs** (#1649 — canonical 保存で保存キーが FQN になりうるため。NGSIv2 経路は従来どおり短縮名のみ)。All three fields are bounded to 256 characters. Violations return `400 BadRequestData`. **型名 (`type`) は active `@context` で term ⇄ URI 展開される (ETSI GS CIM 009 §5.5.7、#1613)** — `@context` がマップする term と対応する FQN は同一 type に解決し (書き込みで canonical 正規化・読み出しで応答 context に compact)、どの context もマップしない短縮名 `Temperature` は core `@vocab` の `.../default-context/Temperature` に展開され絶対 IRI `https://example.com/Temperature` とは別 type になる。型を伴うクエリ/作成で `@context` が解決不能なら `504 LdContextNotAvailable`。**属性名 (attribute name) も active `@context` で term ⇄ URI 展開され、canonical 形で保存される (#1649)** — リクエスト `@context` がマップする term は FQN で保存され、core 語彙 (`location` / `observedAt` 等) と未定義 term は短縮名のまま保存される (保存形不変)。応答はリクエスト `@context` で compact されるため、**別の `@context` の同義 term で書いた属性も引ける** (clause 5.5.7 の "if and only if" 完全形)。**破壊的変更**: `@context` がマップする属性を **`@context` 無し**で引くと `default-context/<名前>` = 別属性を指すため `404` になる (旧: 短縮名の verbatim 保存ゆえに引けた)。移行前データは `npm run migrate:attr-names -- --apply` で変換する。Detail: [INTEROPERABILITY.md → Entity Field Character Set](../core-concepts/ngsiv2-vs-ngsild.md#entity-field-character-set-id--type--attribute-name--geonicdb-独自拡張).
>
> **Note:** NGSIv2 and NGSI-LD entities are completely isolated. Entities created via NGSIv2 are not visible from NGSI-LD and vice versa (`protocol` field on each entity, #964).

## Specification Compliance

This document targets **[ETSI GS CIM 009 V1.9.1 (2025-07)](https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/01.09.01_60/gs_CIM009v010901p.pdf)** as its reference specification. GeonicDB implements a subset of the specification; conformance is not self-declared but measured out-of-band against the pinned ETSI Test Suite (see [geonicdb-compliance](https://github.com/geolonia/geonicdb-compliance)). For details on each feature, refer to the following ETSI specification sections:

| Feature Category | ETSI GS CIM 009 Section |
|-------------|---------------------------|
| Entity Operations | Section 5.6 |
| Query Operations | Section 5.7 |
| Subscriptions | Section 5.8 |
| Context Source Registration | Section 5.9 |
| Temporal API | Section 5.6.11-5.6.16, 5.7.3-5.7.4 |
| EntityMaps | Section 5.14 |
| JSON-LD Context Management | Section 5.13 |
| Distributed Operations | Section 4.3.6 (5.10-5.12) |

### Implementation Status (v1.9.1 delta)

| Status | Feature | Notes / Tracking |
|---|---|---|
| Implemented | `orderBy` (shared parser + entity/temporal query) | Implemented by #1661 / #1662 / #1663 |
| Implemented | NGSI-LD core `@context` v1.9 update | Implemented by #1665 |
| Implemented | Property `valueType` member | Implemented by #1666 |
| Implemented | Batch operations (`create` / `upsert` / `update` / `merge` / `delete` / `query`) | Implemented scope tracked in #1580 |
| Implemented | Geo-queries | Implemented scope tracked in #1580 |
| Implemented | EntityMap | Implemented scope tracked in #1580 |
| Implemented | `GET /info/sourceIdentity` | Returns a `ContextSourceIdentity` (clause 5.15 / 5.2.40) including the mandatory `contextSourceAlias` / `contextSourceUptime` / `contextSourceTimeAt` members. Implemented by #1731 |
| Partial / Known difference | Entity Purge | Spec form `DELETE /entities` (clause 5.6.21, binding 6.4.3.3) is supported; `POST /entityOperations/purge` is a **GeonicDB extension** (no such resource in the spec). Known `keep`/`drop` behavior differences (#1660) |
| Partial / Known difference | Snapshot API | **GeonicDB extension**; not the ETSI Snapshot module (clause 5.16 / data type 5.2.41) — same name, different shape, distinguishable by input form (#1667) |
| Partial / Known difference | Distributed Operations | Implemented, but interoperability pass-rate remains low; improvement continues (#1664 / #1580) |
| Not implemented (known gaps) | `ngsildproof` signature attributes | Tier3 / out of scope in #1580 |
| Not implemented (known gaps) | `splitEntities` | Tier3 / out of scope in #1580 |
| Not implemented (known gaps) | Backward-compatibility version negotiation | Tier3 / out of scope in #1580 |

> Note: GeonicDB does not provide machine-readable conformance declaration because ETSI GS CIM 009 does not define a conformance-class model (#1585). Pass-rate is published out-of-band via pinned measurement runs in [geonicdb-compliance](https://github.com/geolonia/geonicdb-compliance).

### Content Negotiation and @context

The NGSI-LD API supports content negotiation via the `Accept` header.

The table below describes ETSI retrieval endpoints (`/entities`, `/subscriptions`, `/temporal`, etc.).

| Accept Header | Response Format | @context Handling |
|----------------|--------------|----------------|
| *(absent)* | JSON | `@context` is returned via the `Link` header |
| `*/*` | JSON | `@context` is returned via the `Link` header |
| `application/ld+json` | JSON-LD | `@context` is included in the response body |
| `application/json` | JSON | `@context` is returned via the `Link` header |
| `application/geo+json` | GeoJSON | `@context` is included in the response body |

**Negotiation rules (ETSI GS CIM 009 - 6.3.4, #1734 / #1727):** see the [clause 6 text](https://cim.etsi.org/NGSI-LD/official/clause-6.html).

1. **An absent (or empty) `Accept` header is treated as wildcard acceptance** (IETF RFC 9110 §12.5.1), which on every ETSI retrieval endpoint resolves to `application/json` by candidate order — exactly as clause 6.3.4 requires: *"If the Accept header is not present, `application/json` shall be assumed."*
2. On ETSI retrieval endpoints with the standard candidate set, when the `Accept` header expands to more than one supported representation, the candidate list order `application/json` → `application/ld+json` → `application/geo+json` is significant and **the first match wins**. So `Accept: */*` — the default of `curl`, `python-requests` and most HTTP clients — resolves to `application/json`, not JSON-LD, on those ETSI endpoints.
3. Relative `q` values (IETF RFC 7231 §5.3.2, including media-range specificity: `type/subtype` > `type/*` > `*/*`) **override** that list order. `Accept: application/json;q=0.1, application/ld+json;q=1` yields JSON-LD; `Accept: application/json, */*` yields plain JSON because the explicit media type is more specific than the wildcard.
4. `application/geo+json` is only a candidate on endpoints that can render a GeoJSON body — `GET /entities`, `GET /entities/{entityId}`, and `POST /entityOperations/query` (#1783). Clause 6.3.4 names both "Retrieve Entity" (5.7.1) and "Query Entity" (5.7.2) as GeoJSON-eligible, and Query Entity can be invoked either via `GET /entities` or this POST. Elsewhere it is ignored for selection and yields `406` if nothing else is acceptable.

> **Breaking change (#1734):** before this fix, an absent `Accept` header and `Accept: */*` resolved to `application/ld+json`, so responses carried a top-level `@context` in the body. They now resolve to `application/json`, where `@context` moves to the `Link` header. Clients that require JSON-LD must send `Accept: application/ld+json` explicitly. The official CLI (`geonic`) and the npm SDK (`@geolonia/geonicdb-sdk`) already do, and are unaffected.

When the negotiated type is `application/json`, the response includes a `Link` header:

```http
Link: <https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.9.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"
```

**406 Not Acceptable (#1693):** On NGSI-LD GET (retrieval) endpoints and `POST /entityOperations/query`, when the `Accept` header cannot be negotiated into one of the available representations, the broker returns `406 Not Acceptable` (ETSI GS CIM 009 - 6.3.2 / 6.3.4) instead of silently serving JSON. The ProblemDetails body (`type: https://uri.etsi.org/ngsi-ld/errors/NotAcceptable`) lists path-specific negotiable media types in `availableRepresentations`: typically `application/json` / `application/ld+json` (plus `application/geo+json` on entities endpoints and `POST /entityOperations/query`, #1783). For example, `Accept: application/xml` or `text/csv` yields `406`; an absent or empty `Accept` header is treated as wildcard acceptance and resolves to each endpoint's highest-priority available representation, so it does not yield `406`.

**Request body `@context` (write operations, #1583):** For requests that carry an entity representation or fragment (create, replace, append attributes), the `Content-Type` governs how `@context` is supplied:

| Request `Content-Type` | `@context` in body | Behavior |
|----------------|--------------|----------------|
| `application/ld+json` | **Required** | Omitting `@context` returns `400 BadRequestData` (ETSI GS CIM 009 clause 6.3.5). A JSON-LD document without a context has undefined attribute-name semantics. |
| `application/json` | **Rejected** | Clause 6.3.5: "if the request payload body (as JSON) contains a `@context` term, then an HTTP error response of type BadRequestData shall be raised." Supply the context via the `Link` header instead; with neither, the core `@context` applies implicitly. |

**No mixes (#1924).** Clause 6.3.5 closes with "No mixes are allowed, i.e. mixing options shall result in HTTP response errors." Both directions return `400 BadRequestData` on `POST` / `PATCH` / `PUT`:

| Request | Result |
|---|---|
| `application/ld+json` + JSON-LD `Link` header | `400 BadRequestData` |
| `application/json` + body `@context` | `400 BadRequestData` |
| `application/ld+json` + body `@context` only | accepted |
| `application/json` + `Link` header only | accepted |
| `application/json`, no `@context` anywhere | accepted (core `@context`) |

The check runs once at the NGSI-LD router entry, so it covers **every** body-carrying NGSI-LD write — entity-level, single-attribute, batch, temporal, subscriptions, csourceRegistrations and csourceSubscriptions alike. `POST /ngsi-ld/v1/jsonldContexts` is exempt: its body *is* a JSON-LD context document, not a context declaration. `application/merge-patch+json` is outside clause 6.3.5's wording (it names only `application/json` and `application/ld+json`) and is therefore not subject to the mix rule.

**Compatibility note.** Clients that previously sent `application/json` with a body `@context` (the `@context` was silently ignored) now receive `400`. Switch them to `application/ld+json`, or move the context to the `Link` header. Likewise, a client that sends `application/ld+json` *and* a `Link` header must drop the `Link` header on writes.

**Response `@context` is decided by the request alone (#1733).** Per ETSI GS CIM 009 clause 5.5.7, "the `@context` used to perform compaction or expansion of terms shall be the one provided by each API call (or the default `@context` in its absence), and **not any other `@context` which might have been supplied previously**", and clause 5.5.5 requires that an input without any `@context` be given "at minimum … the Core `@context`". Accordingly:

- If the read supplies a context via the JSON-LD `Link` header, the response is compacted with it. For the `POST` query operations (`/entityOperations/query`, `/temporal/entityOperations/query`) the source follows clause 6.3.5 like any other POST: with `application/ld+json` the `@context` comes from the request **body**, with `application/json` from the `Link` header (#1786). Before this was wired, a body `@context` was ignored on those endpoints and the query's type / attribute names expanded under the wrong vocabulary — which surfaced as **zero results**, not an error.
- If the read supplies none, the response is compacted with the **NGSI-LD core `@context` only**. Entity types and attribute names that the core `@context` cannot compact are rendered as **fully qualified URIs** (clause 5.5.7: "implementations shall render Fully Qualified Names").
- The broker never guesses a context from the entity `type` (Smart Data Models / Custom Data Model). To get a domain vocabulary back, pass that vocabulary's `@context` on the read.
- **A short name is only used when it expands back to the same URI under the request's `@context` (#1787).** If the request's `@context` maps that short name to a *different* IRI (shadowing), it is not a "matching term" and is never emitted — the broker falls through to the next compaction form (a `prefix:suffix` compact IRI that does round-trip) and finally to the fully qualified URI. Example: an attribute written without any `@context` (URI `https://uri.etsi.org/ngsi-ld/default-context/name`) read back with a context defining `"name": "https://example.org/vocab#name"` renders as `ngsi-ld:default-context/name`, **not** `name` — returning `name` would make the client read it as `example.org/vocab#name`. This mirrors the JSON-LD 1.1 [IRI Compaction Algorithm](https://www.w3.org/TR/json-ld11-api/#iri-compaction) and applies to entity types and attribute names alike.
- **The shadowing check applies to short-name entity types too (#1876).** Types written without any `@context` are stored as bare canonical names, and the broker used to render them by stripping the core `@vocab` without consulting the read's `@context` at all. It now consults it whenever the read supplies one: a `Building` created with no context, read back under a context defining `"Building": "https://example.org/vocab#Building"`, renders as `ngsi-ld:default-context/Building`. Reads that supply no `@context` (or only the core one) keep the old fast path and never fetch a remote context. The same rule applies to the type selectors inside `csourceRegistrations`, `csourceSubscriptions` and `subscriptions` responses.
- **Ambiguous `@context` documents are rejected with `400 BadRequestData` (#1878).** A context that defines a term whose *key* is an absolute IRI in pass-through form (`https://…`, `urn:…`, or a `prefix:suffix` whose prefix is undefined) and maps it to a **different** IRI leaves the broker no way to satisfy clause 5.5.7: even the fully qualified name it would fall back to means something else under that context. Such a request is refused rather than answered with a silently misread name. This is narrow — `{"ex": "https://ex/ns#", "ex:Name": "https://ex/ns#Name"}` (a compact IRI key whose prefix is defined in the same context) and `{"https://ex/X": "https://ex/X"}` (a key mapped to itself) are both still accepted.

**Creation `@context` preservation (#1620 / #1633):** The `@context` supplied at creation time (body for `application/ld+json`, or `Link` header for `application/json`) is stored with the entity. This covers **URLs, URL arrays, inline context objects (term → IRI maps), and mixed arrays** (#1633 extends #1620, which stored only URLs). Since #1733 it is used **only to recover the fully qualified names of the stored attributes** when rendering a response — it never decides the response `@context`. This applies to both single (`POST /entities`) and **batch** (`POST /entityOperations/create`, `upsert`) creation; on upsert/replace of an **existing** entity the stored context is preserved (context update semantics are out of scope). An inline `@context` whose serialized size exceeds `MAX_CONTEXT_INLINE_BYTES` (8 KiB), or a `@context` array with more than `MAX_CONTEXT_ARRAY` (10) entries, is rejected with `400 BadRequestData`. For `application/json` reads the `Link` header can only carry a URL, so inline vocabulary can only be supplied in an `application/ld+json` body.

### Natural Language Collation (lang + orderBy)

By combining the `lang` parameter with `orderBy`, results can be sorted based on the locale of the specified language. For example, `lang=ja` applies Japanese collation order for sorting.

### Entity Operations (NGSI-LD)

> **ETSI GS CIM 009 Reference**: Section 5.6 - Entity Operations

#### Retrieve Entity List

```http
GET /ngsi-ld/v1/entities
```

**Request Headers**

```http
Accept: application/ld+json
Link: <https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"
```

**Query Parameters**

| Parameter | Type | Description | Default |
|-----------|-----|------|-----------|
| `id` | string | Filter by entity ID (comma-separated for multiple, URI format) | - |
| `limit` | integer | Number of results to retrieve | 20 |
| `offset` | integer | Offset (max: 10000) | 0 |
| `pageToken` | string | Keyset continuation token (default sort only). Send back the previous response's `NGSILD-Next`. Mutually exclusive with `offset`; invalid with `orderBy`. See [API.md §Keyset Pagination](./endpoints.md#keyset-pagination-pagetoken-1435) (#1435) | - |
| `orderBy` | string | Entity Ordering Language expression (ETSI GS CIM 009 V1.9.1 §4.23 / 5.2.43) — see [Entity Ordering (orderBy)](#entity-ordering-orderby) below | - |
| `orderDirection` | string | Sort direction (`asc`, `desc`) for the legacy notation (see below). Ignored when `orderBy` carries explicit `;`-direction operators | `asc` |
| `type` | string | Filter by entity type | - |
| `idPattern` | string | Regular expression pattern for entity ID | - |
| `q` | string | Filter by attribute value | - |
| `attrs` | string | Attribute names to retrieve (comma-separated) | - |
| `pick` | string | Attribute names to retrieve (comma-separated, mutually exclusive with `omit`) | - |
| `omit` | string | Attribute names to exclude (comma-separated, mutually exclusive with `pick`, `id`/`type` not allowed) | - |
| `scopeQ` | string | Scope query (e.g., `/Madrid`, `/Madrid/#`, `/Madrid/+`) | - |
| `lang` | string | Language filter for LanguageProperty (BCP 47, comma-separated priority order, `*` for all languages) | - |
| `georel` | string | Geo-query operator | - |
| `geometry` | string | Geometry type | - |
| `coordinates` | string | Coordinates | - |
| `spatialId` | string | Filter by spatial ID (ZFXY format) (see [Spatial ID Search](./endpoints.md#spatial-id-search)) | - |
| `spatialIdDepth` | integer | Depth of spatial ID hierarchy expansion (0-4) | 0 |
| `crs` | string | Coordinate reference system (see [Coordinate Reference System (CRS)](./endpoints.md#coordinate-reference-system-crs)). URN format also accepted | `EPSG:4326` |
| `geoproperty` | string | GeoProperty name to use for geo-queries | `location` |
| `format` | string | Output format (`normalized`, `concise`, `keyValues`, `simplified`, `geojson`). `format` is prioritized over `options`. Unknown values are rejected with `400 InvalidRequest`. `geojson` can also be specified with `Accept: application/geo+json` header | - |
| `expandValues` | string | Attribute names to expand (comma-separated, returns expanded values) | - |
| `options` | string | `keyValues` / `simplified`, `concise`, `entityMap`, `sysAttrs` (output system attributes). Comma-separated tokens. **Unknown tokens are rejected with `400 InvalidRequest`** (ETSI GS CIM 009 - 6.3.20, #1664) | - |
| `count` | boolean | `true` returns the `NGSILD-Results-Count` header; `false` is accepted and omits it; any other lexical value returns `400 BadRequestData` (ETSI GS CIM 009 Table 6.3.13-1 declares `count` as Boolean, #1904) | - |
| `splitEntities` | flag | Split response into arrays grouped by entity type (GeonicDB 独自拡張; standalone query parameter, not an `options` token) | - |
| `local` | boolean | `true` answers from local data only (no Context Source Registration is considered as matching; ETSI GS CIM 009 Table 6.3.18-1). `localOnly` is a backward-compatible alias. Non-Boolean values return `400 BadRequestData` (#2008) | `false` |

> **GeoJSON attribute/type name compaction (#1788 サブ項目 6):** When `format=geojson` (or `Accept: application/geo+json`) is negotiated, the Feature `properties` keys and `properties.type` are compacted with the same request-`@context` rules as the JSON representation (ETSI GS CIM 009 clause 5.5.7 — see [Content Negotiation and @context](#content-negotiation-and-context) above). Before this fix, `toNgsiLd` (JSON) compacted names while the GeoJSON transformer emitted the stored (canonical/FQN) names verbatim, so the same entity could carry different attribute names depending on `Accept`. The attribute used as the `geometry` (fixed to the stored name `location`; **not** wired to the `geoproperty` query parameter above, which only affects geo-query filtering) is still matched against the **stored** attribute name — only the emitted `properties` key is compacted, so the geometry selection is unaffected by compaction.
>
> **未知クエリパラメータの扱い (仕様逸脱の明示, #1664)**: ETSI GS CIM 009 - 6.3.20 は
> 「operation と両立しないパラメータ」に `400 InvalidRequest` を返すべき (should) としている。
> GeonicDB は `options` の**値** (トークン) は厳格に検証して 400 を返すが、**未知のクエリ
> パラメータ名**は silent に無視する (should 準拠の意図的逸脱)。これは `localOnly` / `csf` /
> `spatialId` / `join` / `crs` / `pageToken` 等の GeonicDB 独自パラメータが多数存在し、
> パラメータ名の strict 化は独自拡張と衝突するため。

##### Entity Ordering (orderBy)

> **ETSI GS CIM 009 V1.9.1 Reference**: §4.23 Entity Ordering Language / §5.2.43 OrderingParams

`orderBy` accepts the v1.9.1 Entity Ordering Language (#1580 / #1661):

```text
orderBy = AttrName [";" directionOp] *("," AttrName [";" directionOp])
directionOp = asc | desc | dist-asc | dist-desc
```

- **Single key with direction**: `orderBy=temperature;desc` (default direction is `asc`). `directionOp` is case-insensitive (`;DESC` is accepted).
- **Composite keys** (comma-separated, evaluated left-to-right as tie-breakers): `orderBy=type;asc,temperature;desc`.
- **Paths**: dot notation (`name.observedAt`) and bracket notation (`address[city]`, normalized to the equivalent dot path) are accepted; the entity members `id` / `type` / `scope` may also be used.
- **Distance sorting**: `dist-asc` / `dist-desc` sort by distance for GeoProperties; `orderBy=geo:distance` (with a `near` geo-query) routes through the `$geoNear` distance-sort path.
- **Grammar violations** (e.g. `;ascending`, empty term, trailing comma, malformed brackets) return `400 BadRequestData`. A syntactically valid but **non-existent attribute is not an error** — per §4.23.2 mixed-type ordering, entities missing the attribute sort last.
- At most **20** ordering terms per expression (`SECURITY.MAX_ORDER_BY_TERMS`); more return `400`.
- The same syntax is accepted by the batch query (`POST /entityOperations/query`) and temporal query endpoints. Temporal queries additionally reject `orderBy` combined with `aggrMethods`, and reject attribute-value sorting on encrypted tenants, with `400`.

> **Legacy notation (GeonicDB, deprecated)**: The pre-v1.9.1 notation — `orderBy=!attr` (leading `!` for descending) combined with the separate `orderDirection` parameter — is still accepted for backward compatibility and is translated to the canonical grammar at the controller boundary (an explicit `orderDirection` takes precedence over `!`). New clients should use the `;`-direction syntax.

**Response Example**

```json
[
  {
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
    "id": "urn:ngsi-ld:Room:001",
    "type": "Room",
    "temperature": {
      "type": "Property",
      "value": 23.5,
      "observedAt": "2024-01-15T10:00:00Z",
      "unitCode": "CEL"
    },
    "location": {
      "type": "GeoProperty",
      "value": {
        "type": "Point",
        "coordinates": [139.7671, 35.6812]
      }
    }
  }
]
```

**Response Headers**

| Header | Description |
|---------|------|
| `NGSILD-Results-Count` | Total count — returned only when `count=true` is requested (ETSI GS CIM 009 §5.5.6). Without it, the count query is skipped and further pages are indicated via `NGSILD-Next` / `Link` (`rel="next"`) (#1434). |

> **`count` accepted values (#1904)**: `count` is a **Boolean** per ETSI GS CIM 009 Table 6.3.13-1.
> `count=true` sets the `NGSILD-Results-Count` header; **`count=false` is accepted** and simply omits it
> (200, not an error). Any other value — `yes`, `1`, `True`, empty — is not a Boolean lexical form and
> returns **`400 BadRequestData`**. This applies to every NGSI-LD listing endpoint (entities, batch query,
> attributes, csourceSubscriptions, entityMaps, jsonldContexts, registrations, snapshots, subscriptions,
> types, temporal). NGSIv2 uses `options=count` and is unaffected.

#### Create Entity

```http
POST /ngsi-ld/v1/entities
Content-Type: application/ld+json
```

**Request Body**

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "id": "urn:ngsi-ld:Room:001",
  "type": "Room",
  "temperature": {
    "type": "Property",
    "value": 23.5,
    "unitCode": "CEL"
  },
  "isPartOf": {
    "type": "Relationship",
    "object": "urn:ngsi-ld:Building:001"
  }
}
```

> **Sub-attributes (#1581)**: An attribute may carry user-defined sub-attributes (Property of Property, Relationship of Property, etc. — ETSI GS CIM 009 clause 4.5), e.g. `"airQualityLevel": { "type": "Property", "value": 2, "accuracy": { "type": "Property", "value": 0.9 } }`. One level of sub-attributes is stored and returned on read (normalized and concise). Deeper nesting (a sub-attribute's own sub-attributes) is not preserved.
>
> **Concise metadata and recursive sub-attributes (#1761 / #1779)**: In concise output, reserved metadata is restored from what is actually stored: `observedAt`, `unitCode`, and `valueType`, plus `datasetId` for attribute types that retain it at write time (ETSI GS CIM 009 clause 4.5.2.3). `GeoProperty` and `LanguageProperty` currently do not retain `datasetId` at write time, so `datasetId` is absent from both normalized and concise output for those types (tracked in #1795); this is an ingestion-side limitation, not a concise-format limitation. `unitCode` is omitted for unitless types where ETSI explicitly forbids it (`Relationship`, `ListRelationship`, `LanguageProperty`, `VocabProperty`, `JsonProperty`; clauses 4.5.3.3 / 4.5.22.3 / 4.5.18.3 / 4.5.20.3 / 4.5.24.3). Sub-attributes are serialized recursively in concise representation: a sub-Property without its own sub-attributes collapses to the bare value, while a sub-Relationship keeps its envelope (`{ "type": "Relationship", "object": ... }`).
>
> **Multi-target Relationship (#1615)**: `Relationship.object` accepts either a single URI or an **array of URIs** (ETSI `oneOf: string | array`), e.g. `"locatedAt": { "type": "Relationship", "object": ["urn:ngsi-ld:City:Paris", "urn:ngsi-ld:City:Lyon"] }`. The array form (1 to `MAX_QUERY_ATTRS` URIs, default 50) is stored and returned as an array.
>
> **Sub-attribute names and term expansion (#1788 sub-item 4)**: Sub-attribute names are subject to the same term ⇄ URI equivalence as Attribute and Entity Type names (ETSI GS CIM 009 clause 5.5.7 — "Property, Relationship or Type names"). A short name is expanded with the request `@context` and stored as a Fully Qualified Name, and responses compact it back using **the `@context` supplied by that request** (clause 5.5.5). Consequently a sub-attribute name may be given as either a short name (`^[A-Za-z0-9_]+$`) or an absolute IRI; a dotted name that is not an absolute IRI (e.g. `unit.code`) is still rejected with `400 BadRequestData`. Reserved attribute members (`observedAt`, `unitCode`, `datasetId`, `valueType`) are **not** names in this sense and are never transformed. If two sub-attribute names of the same attribute would render to the same output name, that attribute is rendered with its stored names instead (data preservation wins over compaction — same rule as top-level attribute names). This applies to normalized and concise output, single-attribute retrieval (`GET /entities/{entityId}/attrs/{attrName}`), and subscription notifications.
>
> **Concise input carries sub-attributes (#1793)**: With `options=concise` (`PATCH /entities/{entityId}/attrs`, `PATCH /entities/{entityId}`, `PUT /entities/{entityId}`), members of an attribute object other than the reserved ones are ingested as user-defined sub-attributes, matching clause 4.5.2.3 (sub-attributes are serialized recursively in concise representation). A bare scalar (`"accuracy": 0.5`) becomes a sub-Property, and an object form (`"providedBy": {"object": "urn:..."}`) is typed from its value member using the same inference as top-level concise input. Previously only the four reserved members survived, so reading concise and writing it back silently dropped every user-defined sub-attribute. Note that `POST /entities/{entityId}/attrs` (append) does not accept `options=concise` — its options vocabulary is `noOverwrite` only (clause 5.6.3).
>
> **VocabProperty values and term expansion (#1788 sub-item 5)**: ETSI GS CIM 009 clause 5.5.7 lists "Property, Relationship or Type names **and VocabProperty values**" as subject to term ⇄ URI equivalence. A `vocab` value given as a short name is expanded with the request `@context` and stored as a Fully Qualified Name, and responses compact it back using the `@context` supplied by that request — exactly the rule applied to Attribute and Entity Type names. For `vocabMap` only the **values** are transformed; the keys are language tags, not terms. A VocabProperty appearing as a sub-attribute is transformed the same way. Queries follow: `q=fuel=="diesel"` matches an entity stored with the canonical FQN, and the same entity is found through a different `@context` that maps another term to the same URI. The query-side widening is **restricted to VocabProperty** (the attribute document's `type` is part of the condition), so value comparisons on plain Properties are unaffected.
>
> **Property `valueType` (#1580)**: The optional Property member `valueType` (ETSI GS CIM 009 clause 4.5.2) is stored on write and preserved on read (normalized and concise representations). An empty string is rejected with `400 BadRequestData`.

**Transient Entity (expiresAt)**

By specifying the `expiresAt` field (ISO 8601 format) in an entity, it is created as a Transient Entity with an expiration time. The expiration time must be a future date.

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "id": "urn:ngsi-ld:Room:temp-001",
  "type": "Room",
  "temperature": { "type": "Property", "value": 23.5 },
  "expiresAt": "2030-01-01T00:00:00Z"
}
```

**Response**
- Status: `201 Created`
- Status: `409 AlreadyExists` if an entity with the same ID already exists (regardless of type)
- Header: `Location: /ngsi-ld/v1/entities/urn:ngsi-ld:Room:001`

> **Note**: Entity IDs are unique within a tenant and service path scope. Creating an entity with the same ID but a different type returns `409 AlreadyExists`. See [Entity ID Uniqueness](./endpoints.md#entity-id-uniqueness-geonicdb-extension) for details.

> **GeoProperty coordinates with altitude (#1584)**: GeoProperty values are GeoJSON geometries (RFC 7946). A position may be 2 elements `[longitude, latitude]` or 3 elements `[longitude, latitude, altitude]` — the optional third element (altitude/elevation) is accepted and preserved on read-back. Only longitude/latitude are used for spatial indexing and geo-queries. Positions with more than 3 elements return `400 BadRequestData` (RFC 7946 §3.1.1 discourages extending positions beyond three elements). Altitude is preserved even when a non-WGS84 `crs` query parameter triggers coordinate transformation: only longitude/latitude are reprojected, and the altitude is carried through unchanged (these CRS have no vertical datum, so altitude is reprojection-invariant) (#1595).

#### Retrieve Single Entity

```http
GET /ngsi-ld/v1/entities/{entityId}
```

**Query Parameters**

| Parameter | Type | Description |
|-----------|-----|------|
| `type` | string | Entity type |
| `attrs` | string | Attribute names to retrieve (comma-separated) |
| `pick` | string | Attribute names to retrieve (comma-separated, mutually exclusive with `omit`) |
| `omit` | string | Attribute names to exclude (comma-separated, mutually exclusive with `pick`, `id`/`type` not allowed) |
| `lang` | string | Language filter for LanguageProperty (BCP 47) |
| `format` | string | Output format (`normalized`, `concise`, `keyValues`, `simplified`, `geojson`). `format` is prioritized over `options`. Unknown values are rejected with `400 InvalidRequest`. `geojson` can also be specified with `Accept: application/geo+json` header |
| `options` | string | `keyValues`, `concise`, `sysAttrs` |

> **GeoJSON output on single retrieval (#1759)**: `format=geojson` (or `Accept: application/geo+json`) returns a GeoJSON **Feature** object with `Content-Type: application/geo+json`. In contrast, `GET /ngsi-ld/v1/entities` returns a GeoJSON **FeatureCollection**. As with the list endpoint, `properties` keys and `properties.type` are compacted with the request `@context` (#1788 サブ項目 6, see the note under [Retrieve Entity List](#retrieve-entity-list) above).

> **`attrs` and 404 (#1619)**: When `attrs` is supplied and the entity has **none** of the requested attributes, a `404 Not Found` is returned (ETSI GS CIM 009 clause 5.7.1 / OpenAPI `Query.attrs`: "If the Entity does not have any of the Attributes in attrs, then a 404 Not Found shall be retrieved"). This applies to single-entity retrieval; the list/query endpoint returns an empty collection (`200`) instead.

> **Path `{entityId}` URI validation (#1692)**: On all NGSI-LD by-id endpoints (entities, subscriptions, csourceRegistrations, temporal entities, jsonldContexts), a path id that is not a syntactically valid URI (e.g. `not-a-uri`) is rejected with `400 BadRequestData` **before** the existence check — it never yields `404` (ETSI GS CIM 009 clause 5.7.1 / 5.8.3: URI validity is checked before resource lookup). Valid URIs that do not exist return `404 Not Found` as usual.

#### Replace Entity

```http
PUT /ngsi-ld/v1/entities/{entityId}
```

Replaces all attributes of an entity. Attributes not included in the request body are deleted. Including `scope` in the body replaces the entity's scope; omitting it preserves the existing scope. Pass either a single string or an array of strings. Sending `scope: null` or `scope: []` explicitly unsets the scope (**GeonicDB extension**, see `docs/INTEROPERABILITY.md`).

**Response**: `204 No Content`

#### Update Entity

```http
PATCH /ngsi-ld/v1/entities/{entityId}
```

**Merge-Patch Semantics** (ETSI GS CIM 009 Section 5.6.4):

- Using `Content-Type: application/merge-patch+json`, attributes not included in the request body are preserved (merge mode). With the standard `application/json` / `application/ld+json`, all attributes are replaced.
- Specifying `urn:ngsi-ld:null` as a property value deletes that attribute.
- Including `scope` in the body replaces the entity's scope; omitting it preserves the existing scope. Pass either a single string or an array of strings. Sending `scope: null` or `scope: []` explicitly unsets the scope (**GeonicDB extension**, see `docs/INTEROPERABILITY.md`).
- Specifying query parameter `options=keyValues` or `options=concise` allows using a simplified input format.

**Response**: `204 No Content`

#### Add Attributes

```http
POST /ngsi-ld/v1/entities/{entityId}
Content-Type: application/ld+json
```

**Query Parameters**

| Parameter | Description |
|-----------|------|
| `options=noOverwrite` | Do not overwrite existing attributes (existing attributes are preserved, only new attributes are added) |

**Response**: `204 No Content`

#### Partial Update of Multiple Attributes

```http
PATCH /ngsi-ld/v1/entities/{entityId}/attrs
Content-Type: application/ld+json
```

Partially updates multiple attributes of an entity. Only attributes included in the request body are updated; attributes not included are preserved. This endpoint does **not** currently honor a `scope` field in the body — to update scope, use `PATCH /entities/{entityId}` (Update Entity) or `PUT /entities/{entityId}` (Replace Entity) instead.

**Request Body**

```json
{
  "temperature": {
    "type": "Property",
    "value": 25.0
  }
}
```

**Response**: `204 No Content`

#### Delete Entity

```http
DELETE /ngsi-ld/v1/entities/{entityId}
```

**Response**: `204 No Content`

#### Retrieve All Attributes of an Entity

```http
GET /ngsi-ld/v1/entities/{entityId}/attrs
```

Retrieves all attributes of an entity.

**Response**: `200 OK`

#### Retrieve Single Attribute

```http
GET /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
```

Retrieves a specific attribute of an entity.

**Response**: `200 OK`

#### Overwrite Attribute (PUT)

```http
PUT /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
Content-Type: application/ld+json
```

Completely overwrites the specified attribute with a new value. Returns `404 Not Found` if the attribute does not exist.

**Request Body**

```json
{
  "type": "Property",
  "value": 25.0
}
```

**Response**: `204 No Content`

#### Replace Attribute

```http
POST /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
Content-Type: application/ld+json
```

Replaces the specified attribute with a new value.

**Request Body**

```json
{
  "type": "Property",
  "value": 25.0
}
```

**Response**: `204 No Content`

#### Partial Update of Attribute

```http
PATCH /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
Content-Type: application/ld+json
```

**Request Body**

```json
{
  "type": "Property",
  "value": 25.0
}
```

**Response**: `204 No Content`

> **Note**: If the entity or attribute does not exist, `404 Not Found` is returned (ETSI GS CIM 009 V1.9.1 clause 5.6.4). This operation only performs partial updates of existing attributes and does not create new attributes.

**Entity Fragment semantics** (clause 5.6.4 — *"A partial update only changes the elements provided in an Entity Fragment, leaving the rest as they are"*)

The request body is an *Entity Fragment*: it only needs to carry the elements you want to change. Members you do not send are left untouched, so you never have to echo back what the broker already stores.

> The fragments below show **only the members under discussion**. As with every `application/ld+json` request, an actual request body also carries the inline `@context` (see [Content Negotiation and @context](#content-negotiation-and-context)); with `application/json` the context is supplied via the `Link` header instead.

- **The value member may be omitted.** `value` / `object` / `languageMap` / `json` / `vocab` / `vocabMap` (GeonicDB extension) / `valueList` / `objectList` are all optional. A fragment carrying only metadata or sub-attributes is valid, and the stored value and attribute type are preserved.

  ```json
  { "observedAt": "2026-08-06T18:30:00.000Z" }
  ```

  ```json
  { "providedBy": { "type": "Relationship", "object": "urn:ngsi-ld:Person:JohnDoe" } }
  ```

- **`type` may be omitted.** When the fragment carries a value member, the attribute type is inferred from it (`object` → `Relationship`, `languageMap` → `LanguageProperty`, `json` → `JsonProperty`, `valueList` → `ListProperty`, `objectList` → `ListRelationship`, `vocab` / `vocabMap` (GeonicDB extension) → `VocabProperty`, GeoJSON-shaped `value` → `GeoProperty`, otherwise `Property`). When the fragment carries no value member, the stored attribute type is kept.

  ```json
  { "languageMap": { "fr": "Grand Place", "es": "Gran Lugar" } }
  ```

- **Validation of the elements you do send is unchanged.** An invalid `observedAt`, a malformed `languageMap`, a non-URI `object`, etc. still return `400 BadRequestData`.

- **`@context` is still mandatory with `application/ld+json` (#1927).** Being allowed to omit value members does *not* extend to the `@context`: ETSI GS CIM 009 clause 6.3.5 requires the `@context` of a `POST` / `PUT` / `PATCH` body to come from the payload itself whenever `Content-Type` is `application/ld+json`, and a body without one returns `400 BadRequestData`. With `application/json`, supply it via the `Link` header instead. This applies to the single-attribute endpoints exactly as it does to the entity-level ones.

> **PUT / POST are different.** `PUT` and `POST` on the same path are *Replace Attribute* (clause 5.6.19 — *"Completely replace the existing Attribute instance"*). They require a complete attribute: omitting the value member returns `400 BadRequestData`, and members not supplied are removed rather than preserved.

#### Delete Attribute

```http
DELETE /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
```

**Query Parameters**

| Parameter | Type | Description |
|-----------|-----|------|
| `datasetId` | string | datasetId of the multi-attribute instance to delete |
| `deleteAll` | boolean | If `true`, deletes all instances |

**Response**: `204 No Content`

> **Note**: Deleting the **last remaining attribute** is allowed and returns `204`. NGSI-LD (ETSI GS CIM 009) does not require an entity to retain at least one attribute — an entity consisting solely of `id`/`type` is valid and remains after the deletion.

### Multi-Attribute (datasetId)

> **ETSI GS CIM 009 Reference**: Section 4.5.3 - Multi-Attribute

In NGSI-LD, multiple instances can be held for the same attribute name. Each instance is distinguished by a `datasetId` (URI format). An instance without a `datasetId` is called the "default instance", and there can be at most one per attribute.

#### Create (CREATE)

When creating an entity, multiple instances can be created by specifying attributes in array format.

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "id": "urn:ngsi-ld:Vehicle:A001",
  "type": "Vehicle",
  "speed": [
    {
      "type": "Property",
      "value": 55,
      "datasetId": "urn:ngsi-ld:dataset:gps"
    },
    {
      "type": "Property",
      "value": 54.5,
      "datasetId": "urn:ngsi-ld:dataset:obd"
    },
    {
      "type": "Property",
      "value": 54.8
    }
  ]
}
```

The above example has three instances for the `speed` attribute: one from GPS, one from OBD, and a default instance.

#### Retrieve (RETRIEVE)

When retrieving an entity, multi-attributes are returned in array format.

In `keyValues` (simplified) format, a multi-attribute is returned as a **`dataset` map** keyed by `datasetId`, with the default instance (the one without a `datasetId`) keyed by the JSON-LD keyword `@none` (ETSI GS CIM 009 clause 4.5.4, #1930). Single-instance attributes stay bare values.

```json
{
  "id": "urn:ngsi-ld:Vehicle:A4567",
  "type": "Vehicle",
  "speed": {
    "dataset": {
      "@none": 55,
      "urn:ngsi-ld:Dataset:gps": 60,
      "urn:ngsi-ld:Dataset:obd": 61
    }
  },
  "serial": "SN-0001"
}
```

The `@none` key is present only when a default instance exists. The same shape applies to `Relationship`, `ListProperty` and `ListRelationship` (clause 4.5.4 EXAMPLE 13 / 15 / 19). `normalized` and `concise` are unchanged — they keep returning arrays of instances.

> Before #1930 only the default instance (or, absent one, the first instance) was returned, so `keyValues` silently exposed less information than `normalized`. Clients that read `keyValues` multi-attributes must now unwrap `dataset`.

#### Update (UPDATE)

On the single-attribute endpoints (`PATCH` / `PUT` / `POST /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}`), the operation targets **one attribute instance**, selected by the `datasetId` in the request body (ETSI GS CIM 009 clauses 5.6.4 / 5.6.19). Other instances of the same attribute are left untouched (#1819).

```json
{
  "type": "Property",
  "value": 60,
  "datasetId": "urn:ngsi-ld:dataset:gps"
}
```

| Body | Target instance | If it does not exist |
|---|---|---|
| `datasetId` present | the instance with the same `datasetId` | `404 ResourceNotFound` |
| `datasetId` absent | the default instance (the one without a `datasetId`) | `404 ResourceNotFound` |

`PATCH` merges the provided members into the selected instance (clause 5.6.4 — members that are not provided are left as they are); `PUT` / `POST` completely replace the selected instance (clause 5.6.19).

##### Entity-level updates (#1909)

The **entity-level** update operations select instances by the same rule, but they have **no `ResourceNotFound` gate** — a `datasetId` that matches no existing instance is **added as a new instance** rather than rejected. This follows the generic patch algorithm of ETSI GS CIM 009 clause 5.5.8: a member carrying a `datasetId` is only replaced when the `datasetId` is the same, *"otherwise the member of the Fragment is added as a new instance to the target"*. Instances that the request does not target are left untouched.

This applies to:

- `POST /ngsi-ld/v1/entities/{entityId}/attrs` (Append Attributes — clause 5.6.3)
- `PATCH /ngsi-ld/v1/entities/{entityId}/attrs` (Update Attributes — clause 5.6.2)
- `PATCH /ngsi-ld/v1/entities/{entityId}` (Merge Entity — clause 5.6.17)
- `POST /ngsi-ld/v1/entityOperations/merge` / `update` / `upsert`

| Body value for an attribute | Effect |
|---|---|
| single instance whose `datasetId` matches a stored instance | that instance is replaced; the others are kept |
| single instance whose `datasetId` matches nothing | added as a new instance; existing ones are kept |
| single instance with no `datasetId` | replaces the default instance if present, otherwise added |
| array of instances | each element is applied by the rules above, in order |

An attribute may also be supplied as an **array of instances** in entity-level updates, the same as at creation time (clause 4.5.5). At most one element may omit `datasetId` (the default instance); more than one results in `400 BadRequestData`.

#### Delete (DELETE)

When deleting an attribute, specifying the `datasetId` query parameter deletes only the specific instance. Specifying `deleteAll=true` deletes all instances.

```http
DELETE /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}?datasetId=urn:ngsi-ld:dataset:gps
DELETE /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}?deleteAll=true
```

---

### Batch Operations (NGSI-LD)

> **Note**: Batch operations can process up to **1,000** entities per request. Requests exceeding 1,000 will result in a `400 Bad Request` error.

#### Batch Create

```http
POST /ngsi-ld/v1/entityOperations/create
Content-Type: application/ld+json
```

**Request Body**

```json
[
  {
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
    "id": "urn:ngsi-ld:Room:001",
    "type": "Room",
    "temperature": { "type": "Property", "value": 23.5 }
  },
  {
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
    "id": "urn:ngsi-ld:Room:002",
    "type": "Room",
    "temperature": { "type": "Property", "value": 21.0 }
  }
]
```

**Response**
- All successful: `201 Created`
- Partial success: `207 Multi-Status`

#### Batch Upsert

```http
POST /ngsi-ld/v1/entityOperations/upsert
```

**Query Parameters**

| Parameter | Description |
|-----------|------|
| `options=update` | Merge into existing attributes (explicit form of the GeonicDB default) |
| `options=replace` | Replace all attributes of existing entities (full replace); omitted attributes are cleared |

> **明示的な仕様逸脱 (#1664):** ETSI GS CIM 009 5.6.8.3 の upsert 既定モードは **replace** ですが、
> GeonicDB の既定 (options 省略時) は後方互換のため **update** (マージ) です。仕様既定の挙動が
> 必要な場合は `options=replace` を明示してください。未知の options 値は `400 InvalidRequest`
> で拒否されます (6.3.20)。

**Response**
- All successful: `204 No Content`
- Partial success: `207 Multi-Status`

> **Note (GeonicDB extension)**: Both default (merge) and `options=replace` modes are executed via a single bulk write. The whole batch is validated up-front — one invalid entity fails the batch with `400` (same as batch create), while per-entity DB errors (e.g. an ambiguous id that matches multiple entities of different types) are reported as `207 Multi-Status`. In `options=replace`, an existing entity's type is preserved (only attributes are replaced), and `scope` follows the 3-state semantics (`omitted`=keep, `null`/`[]`=unset, array=set).

#### Batch Update

```http
POST /ngsi-ld/v1/entityOperations/update
```

**Response**
- All successful: `204 No Content`
- Partial success: `207 Multi-Status`

#### Batch Delete

```http
POST /ngsi-ld/v1/entityOperations/delete
Content-Type: application/json
```

**Request Body**

```json
[
  "urn:ngsi-ld:Room:001",
  "urn:ngsi-ld:Room:002"
]
```

**Response**
- All successful: `204 No Content`
- Partial success: `207 Multi-Status`

#### Entity Purge

```http
DELETE /ngsi-ld/v1/entities
```

Bulk purge supports selector-based deletion and attribute mutation (ETSI GS CIM 009 clause 5.6.21 / 6.4.3.3).

**Query Parameters**

| Parameter | Type | Description |
|-----------|-----|------|
| `type` | string | Entity type selector (`*` supported) |
| `id` / `idPattern` | string | Optional entity ID selectors |
| `q` | string | NGSI-LD query selector |
| `georel` / `geometry` / `coordinates` / `geoproperty` / `geometryProperty` | string | Geo selector (`geometryProperty` is the spec alias of `geoproperty`) |
| `scopeQ` | string | Scope selector |
| `attrs` | csv | Selector matching entities that have **any of** the listed attributes (OR, clause 5.6.21.4) |
| `keep` | csv | Keep listed attributes and remove the others |
| `drop` | csv | Remove only listed attributes |
| `local` / `localOnly` | boolean | Local-only scope flag (not a selector) |

**Validation / guards**
- At least one of `type`, `attrs`, `q`, `georel` is required (`id` only or `local` only is rejected)
- `keep` and `drop` cannot be specified together; empty `keep=` / `drop=` is rejected with 400
- Unknown query parameters are rejected with `400 InvalidRequest`
- Attribute names in `attrs` / `keep` / `drop` are expanded against the request `@context`

**Response**
- Success: `204 No Content`

> **Note:** GeonicDB は distributed operations (context source への purge 転送) を
> サポートしません。purge は常にローカルストレージに対して実行されます (`csf` は受理されますが
> 転送は行われません)。

> **GeonicDB 独自拡張 (後方互換):** `POST /ngsi-ld/v1/entityOperations/purge` も引き続き利用可能です。

#### Batch Query

```http
POST /ngsi-ld/v1/entityOperations/query
Content-Type: application/json
```

**Request Body**

```json
{
  "type": "Room",
  "attrs": ["temperature"],
  "q": "temperature>20",
  "geoQ": {
    "georel": "within",
    "geometry": "Polygon",
    "coordinates": [[[138, 34], [141, 34], [141, 37], [138, 37], [138, 34]]]
  }
}
```

The body also accepts `orderBy` (v1.9.1 Entity Ordering Language, e.g. `"orderBy": "temperature;desc"` — see [Entity Ordering (orderBy)](#entity-ordering-orderby)) and the legacy `orderDirection` (`asc` / `desc`). Non-string `orderBy` or an invalid `orderDirection` is rejected with `400` (#1681).

**Response**: Array of entities

> **GeoJSON output (#1783)**: ETSI GS CIM 009 clause 6.3.4 lists "Query Entity" (clause 5.7.2) — which this operation implements — among the GeoJSON-eligible operations. Negotiating `format=geojson` (query parameter) or `Accept: application/geo+json` returns a GeoJSON **FeatureCollection** with `Content-Type: application/geo+json`, in the **same shape** as `GET /ngsi-ld/v1/entities` (same `NgsiLdGeoJsonTransformer`, same pagination headers: `Link` / `NGSILD-Results-Count`). `splitEntities` (type-grouped nested arrays) cannot be represented as a FeatureCollection, so GeoJSON takes priority over it — the same precedence `GET /entities` already applies. As with the list and single-retrieval endpoints, `properties` keys and `properties.type` are compacted with the request `@context` (#1788 サブ項目 6, see the note under [Retrieve Entity List](#retrieve-entity-list) above).

#### Batch Merge

```http
POST /ngsi-ld/v1/entityOperations/merge
Content-Type: application/ld+json
```

Performs bulk updates on multiple entities using Merge-Patch semantics. Existing attributes are merged, and attributes not included in the request are preserved. Specifying `urn:ngsi-ld:null` as a value deletes the attribute.

**Request Body**

```json
[
  {
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.9.jsonld",
    "id": "urn:ngsi-ld:Room:001",
    "type": "Room",
    "temperature": { "type": "Property", "value": 25.0 }
  }
]
```

**Query Parameters**

| Parameter | Description |
|-----------|------|
| `options=noOverwrite` | Do not overwrite existing attributes |

**Response**
- All successful: `204 No Content`
- Partial success: `207 Multi-Status`

---

### Temporal Batch Operations (NGSI-LD)

> **ETSI GS CIM 009 Reference**: Section 5.6.12-5.6.19 - Temporal Representation of Entities

Batch operations for temporal entities. Up to **1,000** entities can be processed per request.

> **Note**: temporal entityOperations create / upsert / delete are GeonicDB extensions not included in the ETSI GS CIM 009 specification. Only query is specification-compliant. These extensions are provided to improve efficiency for bulk ingestion of time-series data.

#### Temporal Batch Create

```http
POST /ngsi-ld/v1/temporal/entityOperations/create
Content-Type: application/ld+json
```

Bulk creates temporal entities. The request body is an array of temporal entities.

**Response**: `201 Created` when all succeed, `207 Multi-Status` on partial failure

#### Temporal Batch Upsert

```http
POST /ngsi-ld/v1/temporal/entityOperations/upsert
Content-Type: application/ld+json
```

Bulk creates or updates temporal entities (adds attributes to existing entities).

**Response**: `204 No Content` when all succeed, `207 Multi-Status` on partial failure

#### Temporal Batch Delete

```http
POST /ngsi-ld/v1/temporal/entityOperations/delete
Content-Type: application/ld+json
```

Bulk deletes temporal entities. The request body is an array of entity IDs.

**Response**: `204 No Content` when all succeed, `207 Multi-Status` on partial failure

#### Temporal Batch Query

```http
POST /ngsi-ld/v1/temporal/entityOperations/query
Content-Type: application/ld+json
```

POST-based temporal query. Query conditions are specified in the request body.

**Request Body Example**:

```json
{
  "type": "TemperatureSensor",
  "temporalQ": {
    "timerel": "after",
    "timeAt": "2024-01-01T00:00:00Z"
  }
}
```

**Response**: `200 OK` - Array of temporal entities

#### Temporal Query Parameters

The following query parameters can be used with temporal entity GET endpoints.

| Parameter | Type | Description |
|-----------|-----|------|
| `timerel` | string | Temporal relationship operator (`after`, `before`, `between`) |
| `timeAt` | string | Reference time (ISO 8601 format) |
| `endTimeAt` | string | End time (required when `timerel=between`, ISO 8601 format) |
| `lastN` | integer | Return only the latest N instances per attribute (1–1000; exceeding 1000 returns 400, ETSI GS CIM 009 Section 5.6.12) |
| `format` | string | Representation format (ETSI GS CIM 009 - 6.3.12). One of `temporalValues` (simplified temporal representation, clause 4.5.9) or `aggregatedValues` (aggregated representation, clause 4.5.19); `simplified` is accepted as a synonym of `temporalValues` (GeonicDB extension). **Unknown values are rejected with `400 InvalidRequest`** (#1814). On `POST /temporal/entityOperations/query`, `aggregatedValues` is **not** supported (aggregation is not implemented for that operation) and is likewise rejected with `400`. **When both `format` and `options` are present, `format` takes precedence** (6.3.12). |
| `options` | string | Deprecated alternative to `format` (6.3.12). `temporalValues` / `simplified`: Simplified temporal representation (`[value, timestamp]` pairs), `aggregatedValues`: Aggregation representation (**`aggrMethods` is required when `aggregatedValues` is specified via `options` or `format`**), `sysAttrs`: include system temporal attributes (see below, #1817). Unknown tokens are rejected with `400 InvalidRequest` (6.3.20). The raw value must not exceed **200 characters** or **12 comma-separated values**; exceeding either returns `400 InvalidRequest` (#2031) |
| `orderBy` | string | v1.9.1 Entity Ordering Language (see [Entity Ordering (orderBy)](#entity-ordering-orderby)). Combining with `aggrMethods` returns `400`; attribute-value sorting on encrypted tenants returns `400` (#1681) |
| `orderDirection` | string | Legacy sort direction — `asc` / `desc` only; other values return `400` (#1681) |

**lastN Parameter**

Specifying `lastN` returns only the latest N instances of temporal data. Combined with `timerel`/`timeAt`, you can retrieve the latest N instances within a time range. The maximum is **1000** per attribute; a larger value returns `400`.

**Default instance cap (#1437)**: To prevent unbounded memory use, when `lastN` is **not** specified the broker returns at most the **100** most recent instances per attribute. If a query is capped this way, the response carries an `NGSILD-Warning` (warn-code 199); narrow `timeAt`/`endTimeAt` or set an explicit `lastN` (≤1000) to retrieve more. An explicit `lastN` is honored as-is and does **not** produce a truncation warning.

```bash
# Retrieve the latest 10 temporal data instances
curl "http://localhost:3000/ngsi-ld/v1/temporal/entities/urn:ngsi-ld:Sensor:001?lastN=10" \
  -H "Fiware-Service: myservice"
```

#### Temporal Response Format Options

Specifying `options=temporalValues` (or `options=simplified`) returns each attribute in a simplified format with a `values` array (pairs of `[value, timestamp]`).

**Example**: `GET /ngsi-ld/v1/temporal/entities/{entityId}?options=temporalValues`

```json
{
  "id": "urn:ngsi-ld:Sensor:1",
  "type": "Sensor",
  "temperature": {
    "type": "Property",
    "values": [[20.5, "2024-01-01T10:00:00Z"], [21.0, "2024-01-01T11:00:00Z"]]
  }
}
```

#### System Temporal Attributes (`options=sysAttrs`

)

ETSI GS CIM 009 clause 6.3.11 requires support for `options=sysAttrs` on `/temporal/entities/` and
**all of its sub-resources**, as well as on the POST query of clause 5.7.4. When requested, each
attribute instance of the **normalized** representation carries the system generated temporal
attributes `createdAt` / `modifiedAt` (and `expiresAt` when a temporal TTL is configured):

```json
{
  "id": "urn:ngsi-ld:Sensor:1",
  "type": "Sensor",
  "temperature": [
    {
      "type": "Property",
      "value": 20.5,
      "observedAt": "2024-01-01T10:00:00Z",
      "instanceId": "urn:ngsi-ld:attribute:instance:...",
      "createdAt": "2024-01-01T09:00:00Z",
      "modifiedAt": "2024-01-01T09:00:00Z"
    }
  ]
}
```

Values that the broker does not hold are simply omitted — clause 6.3.11 states *"Implementations
shall not raise an error if they do not hold system generated temporal attributes."* For the same
reason `sysAttrs` is **accepted and ignored** (never `400`) for the simplified (`temporalValues`,
clause 4.5.9 `[value, timestamp]` pairs) and aggregated (clause 4.5.19) representations, which have
no place in their structure to carry system attributes.

#### Name Compaction in Temporal Responses (#1975 / #1788)

Both **attribute names and the entity `type`** in temporal responses are compacted with the
`@context` supplied by *that request* (ETSI GS CIM 009 clause 5.5.7 / 5.5.5). Attribute names have
been compacted since #1975; the entity `type` was returned in its stored (fully qualified) form
until #1788 sub-item 2 — writes normalize it with `normalizeTypeName`, so the short name used on
write is now the short name returned on read, and the same short name matches on `?type=`.

When the request supplies no `@context` (or only the core context) there is nothing to compact to,
so names are rendered as fully qualified URIs — that is the clause 5.5.7 fallback, not a defect.
Attribute names written before #1975 (legacy, verbatim storage) are returned as stored, because
the `@context` they were written with was not recorded.

#### Temporal Aggregation Query (Single Entity)

Aggregation queries can be executed on temporal entity GET endpoints using the `aggrMethods` and `aggrPeriodDuration` query parameters. Available on both the list retrieval endpoint and the single entity retrieval endpoint.
To request aggregation representation via `options` or `format`, specify `options=aggregatedValues` or `format=aggregatedValues` together with `aggrMethods`.

> **GeonicDB extension (backward compatibility)**: ETSI states that `aggrMethods` is *"Only applicable
> if `aggregatedValues` is present in the `format` or `options` parameter"*, but does not define what
> happens when it is supplied without one. GeonicDB keeps its historical behavior: **when neither
> `format` nor `options` carries a representation keyword, the presence of `aggrMethods` implies
> `aggregatedValues`**. As soon as either parameter carries a representation keyword, only the
> resolved representation drives the response — so
> `format=temporalValues&options=aggregatedValues&aggrMethods=sum` returns the *simplified* temporal
> representation (ETSI test `021_19_02`), not an aggregation.

> **`POST /temporal/entityOperations/query` does not aggregate (#2030)**: aggregation is not
> implemented for that operation. Supplying `aggrMethods` / `aggrPeriodDuration` there returns `200`
> with the non-aggregated representation plus an `NGSILD-Warning` header (RFC 7234 warn-code 199)
> stating that the aggregation request was ignored — rather than dropping it silently. It is **not**
> a `400` because the official CLI currently sends this shape (geolonia/geonicdb-cli#188); use
> `GET /temporal/entities` with `format=aggregatedValues` for aggregation.

| Parameter | Type | Description |
|-----------|-----|------|
| `aggrMethods` | string | Aggregation methods (comma-separated): `totalCount`, `distinctCount`, `sum`, `avg`, `min`, `max`, `stddev`, `sumsq` |
| `aggrPeriodDuration` | string | ISO 8601 duration (e.g., `PT1H` for 1 hour). Required when `aggrMethods` is specified |

**Example**: `GET /ngsi-ld/v1/temporal/entities/{entityId}?aggrMethods=avg&aggrPeriodDuration=PT1H&timerel=after&timeAt=2024-01-01T00:00:00Z&options=aggregatedValues`

```json
{
  "id": "urn:ngsi-ld:Sensor:1",
  "type": "Sensor",
  "temperature": {
    "type": "Property",
    "avg": [
      [21.0, "2024-01-01T10:00:00Z", "2024-01-01T11:00:00Z"]
    ]
  }
}
```

The shape follows ETSI GS CIM 009 clause 4.5.19.0: **one member per requested aggregation method,
keyed by the method name**, whose value is an array with one element per period, and **each period is
an array of exactly three elements** — the aggregated value, the start `DateTime` and the end
`DateTime`. Requesting several methods (`aggrMethods=avg,max`) therefore produces one member each:

```json
{
  "id": "urn:ngsi-ld:Sensor:1",
  "type": "Sensor",
  "temperature": {
    "type": "Property",
    "avg": [[21.0, "2024-01-01T10:00:00Z", "2024-01-01T11:00:00Z"]],
    "max": [[30.0, "2024-01-01T10:00:00Z", "2024-01-01T11:00:00Z"]]
  }
}
```

> **BREAKING (#1815)**: before this change GeonicDB returned a proprietary shape
> (`{"values": [{"@value": {"avg": 21.0}, "observedAt": ..., "endAt": ...}]}`). Clients that parsed
> `values[].@value` must switch to the method-keyed members above.
>
> **Note**: Specifying `aggrMethods` without `aggrPeriodDuration` returns a `400 Bad Request` error.
>
> **Note**: Specifying `aggregatedValues` without `aggrMethods` (either `options=aggregatedValues` or `format=aggregatedValues`) returns a `400 Bad Request` error.

> **Note**: Aggregation queries are **not supported for encrypted tenants** (tenants with `encryptionEnabled: true`). Since attribute values are encrypted at rest, MongoDB aggregation pipelines cannot perform numeric operations on encrypted data. Requesting aggregation on an encrypted tenant returns `400 Bad Request`. Use the `temporalValues` endpoint to retrieve decrypted values and perform aggregation in the application layer.

---

### Entity Type Operations (NGSI-LD)

#### Retrieve Type List

> **ETSI GS CIM 009 Reference**: clause 5.7.4 - Retrieve Available Entity Types

```http
GET /ngsi-ld/v1/types
```

**Parameters**: `limit`, `offset`, `details`

Without `details`, the response is an **`EntityTypeList` object** (ETSI OpenAPI v1.8.1), not a bare array:

**Response** (200, `details` not specified):
```json
{
  "id": "urn:ngsi-ld:EntityTypeList:34kj2l4-a8s7-...",
  "type": "EntityTypeList",
  "typeList": ["Room", "Sensor"],
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.9.jsonld"
}
```

With `details=true` (or `options=details`), an array of `EntityType` objects is returned instead:

**Response** (200, `details=true`):
```json
[
  {
    "id": "https://uri.etsi.org/ngsi-ld/default-context/Room",
    "type": "EntityType",
    "typeName": "Room",
    "attributeNames": ["temperature", "pressure"],
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.9.jsonld"
  }
]
```

> **破壊的変更 (#1694)**: 従来は `details` 未指定でも上記の詳細配列を返していましたが、
> ETSI OpenAPI v1.8.1 準拠のため `details` 未指定時のレスポンスを `EntityTypeList`
> オブジェクトに変更しました。配列形式が必要なクライアントは `details=true` を指定してください。

> **名前の compaction (#1977) と `id` の FQN 化 (#1989)**: `typeList` の型名、および `details=true` 時の `typeName` / `attributeNames` は、**そのリクエストが渡した `@context`**（`Link` ヘッダー）を基準に compact して返されます (ETSI GS CIM 009 clause 5.5.7 / 5.7.5)。`id` は compact されず**保存名から復元した FQN**を返します — Table 5.2.25-1 が `id` を "Fully Qualified Name (FQN) of the entity type being described"、`typeName` を "short name if contained in @context" と**別の値**として定義しているためです（例: `@context` 無しで型 `Room` の `id` は `https://uri.etsi.org/ngsi-ld/default-context/Room`。`location` / `value` 等の core 組み込み語彙は `@vocab` ではなく `https://uri.etsi.org/ngsi-ld/<名前>` へ展開されます）。
>
> **既知の制限 (#1975 で部分解消)**: temporal コレクション由来の属性名のうち、**#1975 で canonical 保存されたもの**（[Temporal API](#temporal-api-time-series-data) 参照）はここでも応答 `@context` で compact され、`id` も FQN へ復元されます。それ以前 (移行前) に verbatim 保存された属性名は、書き込み時の `@context` を保存していないため compact / FQN 化されず、保存形のまま返ります。

**Header**: Total count returned via `NGSILD-Results-Count` (when `count=true`)

#### Retrieve Type Details

```http
GET /ngsi-ld/v1/types/{typeName}
```

**Response** (200):
```json
{
  "id": "https://uri.etsi.org/ngsi-ld/default-context/Room",
  "type": "EntityTypeInfo",
  "typeName": "Room",
  "entityCount": 5,
  "attributeDetails": [
    {
      "id": "https://uri.etsi.org/ngsi-ld/default-context/temperature",
      "type": "Attribute",
      "attributeName": "temperature",
      "attributeTypes": ["Property"]
    }
  ],
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld"
}
```

> **名前の compaction (#1977) と `id` の FQN 化 (#1989)**: `typeName` と `attributeDetails[].attributeName` は、**そのリクエストが渡した `@context`**（`Link` ヘッダー）を基準に compact して返されます (ETSI GS CIM 009 clause 5.5.7 / 5.7.6)。`id` / `attributeDetails[].id` は compact されず**保存名から復元した FQN**を返します — Table 5.2.26-1 / 5.2.28-1 が `id` を FQN（"Full URI of attribute name"）、`typeName` / `attributeName` を短縮名と**別の値**として定義しているためです（例: `@context` 無しで型 `Room` の `id` は `https://uri.etsi.org/ngsi-ld/default-context/Room`、属性 `temperature` の `id` は `https://uri.etsi.org/ngsi-ld/default-context/temperature`）。`attributeDetails[].attributeName` は #1977 で追加したフィールドです（Table 5.2.26-1 は要素を `id` / `type` / `attributeName` / `attributeTypes` と定めています）。
>
> **既知の制限 (#1975 で部分解消)**: temporal コレクション由来の属性名のうち、**#1975 で canonical 保存されたもの**（[Temporal API](#temporal-api-time-series-data) 参照）はここでも応答 `@context` で compact され、`id` も FQN へ復元されます。それ以前 (移行前) に verbatim 保存された属性名は、書き込み時の `@context` を保存していないため compact / FQN 化されず、保存形のまま返ります。

**Error**: 404 (if the type does not exist)

### Attribute Operations (NGSI-LD)

#### Retrieve Attribute List

> **ETSI GS CIM 009 Reference**: clause 5.7.6 - Retrieve Available Attributes

```http
GET /ngsi-ld/v1/attributes
```

**Parameters**: `limit`, `offset`, `details`

Without `details`, the response is an **`AttributeList` object** (ETSI OpenAPI v1.8.1), not a bare array:

**Response** (200, `details` not specified):
```json
{
  "id": "urn:ngsi-ld:AttributeList:98fj3k2-b1c4-...",
  "type": "AttributeList",
  "attributeList": ["temperature", "pressure"],
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.9.jsonld"
}
```

With `details=true` (or `options=details`), an array of `Attribute` objects is returned instead:

**Response** (200, `details=true`):
```json
[
  {
    "id": "https://uri.etsi.org/ngsi-ld/default-context/temperature",
    "type": "Attribute",
    "attributeName": "temperature",
    "typeNames": ["Room", "Sensor"],
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.9.jsonld"
  }
]
```

> **破壊的変更 (#1694)**: 従来は `details` 未指定でも上記の詳細配列を返していましたが、
> ETSI OpenAPI v1.8.1 準拠のため `details` 未指定時のレスポンスを `AttributeList`
> オブジェクトに変更しました。配列形式が必要なクライアントは `details=true` を指定してください。

> **名前の compaction (#1977) と `id` の FQN 化 (#1989)**: `attributeList` の属性名、および `details=true` 時の `attributeName` / `typeNames` は、**そのリクエストが渡した `@context`**（`Link` ヘッダー）を基準に compact して返されます (ETSI GS CIM 009 clause 5.5.7 / 5.7.9)。`id` は compact されず**保存名から復元した FQN**を返します（Table 5.2.28-1: "Full URI of attribute name"。例: `@context` 無しで属性 `temperature` の `id` は `https://uri.etsi.org/ngsi-ld/default-context/temperature`）。

**Header**: Total count returned via `NGSILD-Results-Count` (when `count=true`)

#### Retrieve Attribute Details

```http
GET /ngsi-ld/v1/attributes/{attrName}
```

**Response** (200):
```json
{
  "id": "https://uri.etsi.org/ngsi-ld/default-context/temperature",
  "type": "Attribute",
  "attributeName": "temperature",
  "attributeCount": 5,
  "typeNames": ["Room", "Sensor"],
  "attributeTypes": ["Property"],
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld"
}
```

> **名前の compaction (#1977) と `id` の FQN 化 (#1989)**: `attributeName` / `typeNames` は、**そのリクエストが渡した `@context`**（`Link` ヘッダー）を基準に compact して返されます (ETSI GS CIM 009 clause 5.5.7 / 5.7.10)。`id` は compact されず**保存名から復元した FQN**を返します（Table 5.2.28-1: "Full URI of attribute name"。例: `@context` 無しで属性 `temperature` の `id` は `https://uri.etsi.org/ngsi-ld/default-context/temperature`）。

**Error**: 404 (if the attribute does not exist)

---

### Subscriptions (NGSI-LD)

> **ETSI GS CIM 009 Reference**: Section 5.8 - Subscription Operations

#### Create Subscription

```http
POST /ngsi-ld/v1/subscriptions
Content-Type: application/ld+json
```

**HTTP Notification Example**

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "type": "Subscription",
  "entities": [
    { "type": "Room" }
  ],
  "watchedAttributes": ["temperature"],
  "q": "temperature>25",
  "notification": {
    "format": "normalized",
    "endpoint": {
      "uri": "https://webhook.example.com/notify",
      "accept": "application/ld+json"
    }
  }
}
```

**MQTT Notification Example**

In NGSI-LD, use `mqtt://` or `mqtts://` scheme in the endpoint URI, with the topic specified as the path. MQTT-specific settings are specified in `notifierInfo`.

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "type": "Subscription",
  "entities": [
    { "type": "Room" }
  ],
  "watchedAttributes": ["temperature"],
  "notification": {
    "format": "normalized",
    "endpoint": {
      "uri": "mqtt://broker.example.com:1883/sensors/room/temperature",
      "notifierInfo": [
        { "key": "MQTT-Version", "value": "mqtt5.0" },
        { "key": "MQTT-QoS", "value": "1" }
      ]
    }
  }
}
```

**MQTT notifierInfo Settings**

| Key | Value | Description |
|-----|-----|------|
| `MQTT-Version` | `mqtt3.1.1` or `mqtt5.0` | MQTT protocol version |
| `MQTT-QoS` | `0`, `1`, or `2` | QoS level |

**Subscription Extension Fields**

| Field | Type | Description |
|-----------|-----|------|
| `cooldown` | integer | Minimum interval between notifications (seconds). Positive integers only. Will not re-notify within the specified number of seconds |
| `notificationTrigger` | string[] | Event types that trigger notifications. `entityCreated`, `entityUpdated`, `entityChanged`, `entityDeleted`, `attributeCreated`, `attributeUpdated`, `attributeDeleted`. `entityChanged` is only triggered when attribute values actually change (updates with the same value are ignored) |
| `showChanges` | boolean | If `true`, includes type-specific previous-members in notification attributes (`normalized` / `concise`): `previousValue` (Property/GeoProperty/TemporalProperty), `previousObject` (Relationship), `previousLanguageMap`, `previousVocab`/`previousVocabMap` (GeonicDB extension for `vocabMap` shape), `previousValueList`, `previousObjectList`, `previousJson`. `keyValues` cannot represent sub-attributes, so previous-members are omitted |
| `notification.onlyChangedAttrs` | boolean | If `true`, includes only attributes that have actually changed in the notification payload. Can be combined with `notification.attributes` |
| `notification.pick` | string[] | Unified NGSI-LD projection (ETSI GS CIM 009 clause 4.21): attribute names to **include** in the notification payload. Maps to the same internal include projection as `notification.attributes` / `attrs` |
| `notification.omit` | string[] | Unified NGSI-LD projection (ETSI GS CIM 009 clause 4.21): attribute names to **exclude** from the notification payload. Maps to the same internal exclude projection as `notification.exceptAttrs` |
| `jsonldContext` | string (dereferenceable URI) | JSON-LD `@context` URI used when sending notifications (ETSI GS CIM 009 Table 5.2.12-1). If omitted, GeonicDB uses the `@context` applied to the subscription — the one supplied at creation, **or on a later `PATCH` (#2029)** — falling back to the NGSI-LD core context when neither carried one. It is delivered with every notification and compacts both the entity type and the attribute names in `data[]` (one resolved value drives all three; see "Notification `@context`" below) |
| `expiresAt` | string (ISO 8601) | Subscription expiration time |

**Notification `@context`** (#1841 / #1788, ETSI GS CIM 009 clause 5.3.1 / 5.8.1.4 / 5.8.6)

*Which `@context` is used.* Two distinct things, with different accepted shapes:

| Source | Accepted shape |
|---|---|
| `jsonldContext` (explicit) | **a single dereferenceable URI string only** — a non-URI string, an inline object or an array is rejected with `400 BadRequestData` at create/update time (the field is typed `z.string()`, and non-URI strings are rejected by an explicit absolute-IRI check) |
| the subscription request `@context` (used when `jsonldContext` is omitted) | whatever a request `@context` may be: a URI, an **inline object**, or an **array** mixing both |
| neither present | the NGSI-LD core `@context` (clause 5.5.5) |

*How GeonicDB delivers it.* The context GeonicDB itself attaches is delivered **exactly once** —
never in the body and the `Link` header at the same time, since two sources would let receivers
disagree about the active `@context`:

| `notification.endpoint.accept` | Delivery |
|---|---|
| `application/ld+json` | `@context` member in the notification body |
| `application/json` (default) | `Link` header (`rel="http://www.w3.org/ns/json-ld#context"`) |
| MQTT endpoints | `@context` member in the body (MQTT has no headers) |
| `httpCustom` (`payload` / `json`) | neither — the body is defined entirely by the user |

A resolved `@context` that a `Link` header cannot carry in full (an inline object, or an array
mixing URLs and inline objects — both only reachable through the request `@context` above) is placed
in the body even for `application/json`: a `Link` can only reference URIs, and emitting just the URL
part would silently drop the terms defined inline.

"Exactly once" constrains **GeonicDB's own context delivery**, not the notification as a whole:
`notification.endpoint.receiverInfo` may add a `Link` header of its own, which is appended to (never
replaces) the generated context `Link`, so a body `@context` and a custom `Link` header can coexist.

Attribute names in `data[]` are compacted with the same `@context` (clause 5.5.7), so a notification
and a `GET` issued with that `@context` spell attributes identically. Names stored as fully
qualified IRIs are compacted; bare stored names are passed through unchanged.

NGSIv2 subscriptions never receive an `@context` member or a `Link` header.

**Filtering with `q` / `geoQ`**
- `q` and `geoQ` restrict which entity changes fire a notification, evaluated with the same
  predicate builder as `GET /ngsi-ld/v1/entities`
- `geoQ.coordinates` accepts a string or a GeoJSON-shaped array, including the nested form used
  for `LineString` / `Polygon`; `geoQ.geoproperty` selects the GeoProperty (default `location`)
- `EntityDeleted` notifications are not filtered by `q` / `geoQ` (the entity no longer exists, so
  the predicate cannot be evaluated). See [SUBSCRIPTIONS.md](../features/ngsi-subscriptions.md) for the full
  semantics and limits

**Validation**
- `watchedAttributes` and `timeInterval` are mutually exclusive. Specifying both simultaneously returns `400 Bad Request` (ETSI GS CIM 009 V1.9.1 clause 5.8.1)
- `throttling` and `timeInterval` are mutually exclusive (distinct operating modes). Specifying both returns `400 Bad Request` (#1618)
- Notification projection selectors split into an **include** family (`notification.pick` / `notification.attributes` / `notification.attrs`) and an **exclude** family (`notification.omit` / `notification.exceptAttrs`). At most one selector per family may be given, and an include selector cannot be combined with an exclude selector (`pick`/`omit` are mutually exclusive per ETSI GS CIM 009 clause 4.21). Violations return `400 Bad Request` (#1627)
- `notification.pick` maps to the internal include projection (= `attributes`/`attrs`) and `notification.omit` maps to the internal exclude projection (= `exceptAttrs`); both are actually applied to the notification payload (#1627, supersedes the temporary `400` rejection added in #1618)
- On `PATCH` the notification projection follows JSON Merge Patch (RFC 7396 / ETSI GS CIM 009 clause 5.8.2): **omitting** a selector keeps the existing projection, sending an **array** replaces it, and sending **`null`** (e.g. `"pick": null` / `"omit": null` / `"exceptAttrs": null`) clears the projection so notifications carry all attributes again. Because `null` is a clear signal it is exempt from the include/exclude exclusivity check, so `pick: null` may be combined with an `omit` value to clear the include projection and set an exclude one in the same request. An empty array `[]` is **not** a clear mechanism — all selectors require a non-empty array, so use `null` to clear (#1635)
- `jsonldContext` must be a single dereferenceable URI string (ETSI GS CIM 009 Table 5.2.12-1). Non-URI strings return `400 BadRequestData`; dereference failures (DNS/unreachable host) return `504 LdContextNotAvailable`; SSRF-blocked destinations still return `400 BadRequestData`
- Invalid `q` (unparsable condition) and invalid `geoQ` (unknown `georel`, out-of-range
  coordinates, or `georel`/`geometry`/`coordinates` not given together) return `400 Bad Request`.
  Previously these were accepted with `201` and then ignored

**Response**
- Status: `201 Created`
- Header: `Location: /ngsi-ld/v1/subscriptions/{subscriptionId}`

#### Subscription List

```http
GET /ngsi-ld/v1/subscriptions
```

**Query Parameters**

| Parameter | Type | Description | Default |
|-----------|-----|------|-----------|
| `limit` | integer | Number of results to retrieve | 20 |
| `offset` | integer | Offset | 0 |

#### Retrieve Subscription

```http
GET /ngsi-ld/v1/subscriptions/{subscriptionId}
```

**Notification Status Fields (Read-only)**

| Field | Type | Description |
|-----------|-----|------|
| `notification.status` | string | `ok` or `failed` |
| `notification.lastNotification` | string | Date and time of last notification sent (ISO 8601) |
| `notification.lastFailure` | string | Date and time of last notification failure (ISO 8601) |
| `notification.lastFailureReason` | string | Reason for the last failure (e.g., `HTTP 500: Internal Server Error`). Cleared on success |
| `notification.lastSuccess` | string | Date and time of last successful notification (ISO 8601) |
| `notification.timesSent` | integer | Number of notifications sent |

**Retry Behavior**: When notification delivery fails, up to 3 retries are performed with exponential backoff (1 second, 2 seconds, 4 seconds) for transient errors (5xx, network errors). Retries are not performed for 4xx errors.

#### Update Subscription

```http
PATCH /ngsi-ld/v1/subscriptions/{subscriptionId}
```

**Response**: `204 No Content`

#### Delete Subscription

```http
DELETE /ngsi-ld/v1/subscriptions/{subscriptionId}
```

**Response**: `204 No Content`

#### Ownership Verification (GeonicDB Extension)

While authentication is enabled (the default), subscription update (PATCH) and delete (DELETE) operations perform ownership verification based on the `createdBy` field. Users other than the creator who attempt these operations will receive `403 Forbidden`. The `super_admin` and `tenant_admin` roles can bypass this verification. For details, see [AUTH.md](../reference/auth.md).

---

### Registrations (NGSI-LD)

In NGSI-LD, external context providers are registered as Context Source Registrations.

#### Create Registration

```http
POST /ngsi-ld/v1/csourceRegistrations
Content-Type: application/ld+json
```

> **`endpoint` はベース URI (`{apiRoot}`) を指定する。** ETSI GS CIM 009 clause 6.2 は全リソース URI が `{apiRoot}/ngsi-ld/v1/` の下に来ると規定しており、`/ngsi-ld/v1/...` は転送する側 (GeonicDB) が付ける。転送先が NGSI-LD として扱われるか NGSIv2 として扱われるかは **`endpoint` の文字列ではなく、登録を作成した API** で決まる — `/ngsi-ld/v1/csourceRegistrations` で作った登録は NGSI-LD として、`/v2/registrations` で作った登録は NGSIv2 として転送される (#1763)。`endpoint` の**パスプレフィクス**は転送 URL に保たれる (#1879) — `http://host/broker-a/` を登録すると転送先は `http://host/broker-a/ngsi-ld/v1/entities` になり、パスベースでルーティングする API ゲートウェイ配下の context source を登録できる。互換のため、`endpoint` が API ルート (`/ngsi-ld/v1` または `/v2`) で終わる場合はそれを `{apiRoot}` の一部とみなさず取り除く — 既に `http://host/ngsi-ld/v1` の形で登録済みの registration は従来どおり転送される (`/ngsi-ld/v1/ngsi-ld/v1/entities` にはならない)。

**Request Body**

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "type": "ContextSourceRegistration",
  "registrationName": "Weather Data Provider",
  "description": "Provides weather data for the region",
  "endpoint": "http://context-provider:8080/",
  "information": [
    {
      "entities": [{ "type": "WeatherObserved" }],
      "propertyNames": ["temperature", "humidity"],
      "relationshipNames": ["observedBy"]
    }
  ],
  "observationInterval": {
    "start": "2020-01-01T00:00:00Z",
    "end": "2030-12-31T23:59:59Z"
  },
  "location": {
    "type": "Polygon",
    "coordinates": [[[139.5, 35.5], [140.0, 35.5], [140.0, 36.0], [139.5, 36.0], [139.5, 35.5]]]
  },
  "expiresAt": "2040-12-31T23:59:59.000Z",
  "mode": "inclusive"
}
```

**Request Fields**

| Field | Type | Required | Description |
|-----------|-----|------|------|
| `id` | string (URI) | - | Client-settable registration identifier. If provided it is used as-is; re-registering an existing `id` returns `409 Conflict`. If omitted, the server generates a `urn:ngsi-ld:ContextSourceRegistration:{uuid}`. |
| `type` | string | ✓ | Fixed: `ContextSourceRegistration` |
| `registrationName` | string | - | Registration name |
| `description` | string | - | Registration description |
| `endpoint` | string | ✓ | Provider endpoint URL |
| `information` | array | ✓ | Provided information (entities, propertyNames, relationshipNames) |
| `observationInterval` | object | - | Observation interval (start, end) |
| `managementInterval` | object | - | Management interval (start, end) |
| `location` | GeoJSON | - | Geographic scope |
| `expiresAt` | string | - | Expiration time (ISO 8601 format) |
| `status` | string | - | Status (`active` / `inactive`) |
| `mode` | string | - | Mode (`inclusive` / `exclusive` / `redirect` / `auxiliary`) |
| `operations` | string[] | - | Supported API operations (ETSI GS CIM 009 clause 4.20). Any operation names are accepted, e.g. group names (`federationOps`) or individual operations (`retrieveEntity`, `createBatch`). When omitted it is stored/returned as absent and treated as the implicit default `federationOps` (the field is not materialized into the response). |

**Response**
- Status: `201 Created`
- Header: `Location: /ngsi-ld/v1/csourceRegistrations/{registrationId}`
- Status: `409 Conflict` — a registration with the same client-provided `id` already exists

#### Retrieve Registration List

```http
GET /ngsi-ld/v1/csourceRegistrations
```

**Query Parameters**

| Parameter | Type | Description | Default |
|-----------|-----|------|-----------|
| `id` | string | Comma-separated Context Source Registration ids (NGSI-LD URIs) | - |
| `type` | string | Entity type selector. Expanded with the request `@context` before matching | - |
| `attrs` | string | Comma-separated attribute names (`propertyNames` / `relationshipNames`). Expanded with the request `@context` before matching | - |
| `limit` | integer | Number of results to retrieve | 20 |
| `offset` | integer | Offset | 0 |
| `count` | string | `true` to return the total count in `NGSILD-Results-Count` | - |

> **`type` と `attrs` は AND で組み合わされる (#1892)。** 両方を指定すると「その型を提供し、**かつ** その属性を提供する」登録だけが返る (以前は OR だった)。`id` も他の条件と AND。
>
> **`@context` による term ⇄ URI 変換 (#1800 / #1890)。** ETSI GS CIM 009 clause 5.5.7 に従い、`type` / `attrs` はリクエストの `@context` (`Link` ヘッダ) で展開してから照合し、応答の `information[].entities[].type` / `propertyNames` / `relationshipNames` はリクエストの `@context` で compact して返す。したがって登録時と別の `@context` を使っても、同じ URI を指す term でヒットし、その `@context` の語彙で返る。完全修飾 URI での照会も可能。
>
> 属性名の照合インデックスは **登録時の表記と展開後の URI の両方**を保持する。federation の転送マッチ (`findMatchingRegistrations`) 側の展開は #1899 (PR #1996) で実装済みで、別 `@context` の同義 term でもヒットする。両持ちは登録済みデータの後方互換のために維持する。
>
> **転送先の照合で `type` を省略した場合 (#1994)。** `GET /ngsi-ld/v1/entities/{id}`（かつローカルに当該エンティティが存在しない）や一覧クエリで `type` を指定しないとき、照合する型は**未確定**として扱われ、**型で絞らずに全 active 登録が転送候補**になる。
>
> ただし**一覧クエリについては、行レベルの読み取り述語 (`readableEntityFilter`) を持つ制限付き principal では従来の保守的な照合を維持する** — federation でマージされるリモートエンティティはこの述語を通らないため、候補集合を広げると読めないはずの型のエンティティが混ざりうるため (#2003 で追跡)。単一取得 (`/entities/{id}`) の経路にはそもそも行レベル述語が無く (`checkEntityOwnership` のみ)、`type` を明示した場合の転送は本変更以前から行われていたため、この例外は適用されない。`ContextSourceRegistration` に保存される `'*'` は「**登録側**が任意の型を受け付ける」ことを表す値であり、「照合側の型が未確定」を意味しない — 両者を同一視すると、`entities` を省略した登録にしか当たらず、`entities: [{"type": "Sensor"}]` のように**型を宣言した登録へは一度も転送されない**。`type` はオプション (clause 5.7.1 / 5.7.2 — 一覧クエリは `attrs` / `q` / `georel` だけでも成立する) なので、省略できることが前提となる。`type` を明示した場合の絞り込みは従来どおり効く。

**Response Example**

```json
[
  {
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
    "id": "urn:ngsi-ld:ContextSourceRegistration:csr001",
    "type": "ContextSourceRegistration",
    "endpoint": "http://context-provider:8080/",
    "information": [
      {
        "entities": [{ "type": "WeatherObserved" }],
        "propertyNames": ["temperature", "humidity"]
      }
    ],
    "status": "active"
  }
]
```

#### Retrieve Registration

```http
GET /ngsi-ld/v1/csourceRegistrations/{registrationId}
```

#### Update Registration

```http
PATCH /ngsi-ld/v1/csourceRegistrations/{registrationId}
```

**Request Body**

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "endpoint": "http://new-provider:8080/"
}
```

**Response**: `204 No Content`

#### Delete Registration

```http
DELETE /ngsi-ld/v1/csourceRegistrations/{registrationId}
```

**Response**: `204 No Content`

#### Ownership Verification (GeonicDB Extension)

While authentication is enabled (the default), registration update (PATCH) and delete (DELETE) operations perform ownership verification based on the `createdBy` field. Users other than the creator who attempt these operations will receive `403 Forbidden`. The `super_admin` and `tenant_admin` roles can bypass this verification. For details, see [AUTH.md](../reference/auth.md).

#### CSR Advanced Fields (ETSI GS CIM 009 V1.9.1)

The following advanced fields are supported for Context Source Registration:

| Field | Type | Description |
|-----------|-----|------|
| `cacheDuration` | string (ISO 8601 duration) | Cache duration for responses from the context source |
| `refreshRate` | string (ISO 8601 duration) | Interval for periodic refresh to the context source |
| `timeout` | integer (ms) | Request timeout to the context source |
| `contextSourceAlias` | string | Alias name for the context source |
| `contextSourceInfo` | object[] | Additional metadata for the context source |
| `operationGroup` | string[] | Operation groups: `federationOps`, `retrieveOps`, `updateOps`, `redirectionOps` |
| `operations` | string[] | Supported API operations (ETSI GS CIM 009 clause 4.20). Accepts arbitrary operation names — group names (`federationOps`) or individual operations (`retrieveEntity`, `createBatch`, …) |

### Distributed Operation Information

#### Retrieve Broker Identity

```http
GET /ngsi-ld/v1/info/sourceIdentity
```

Returns identity information for the context broker. Used for broker identification in distributed environments.

**Authentication**: Required (protected). `sourceIdentity` exposes the broker `endpoint` URL and software version, so it stays behind authentication to limit fingerprinting.

**Response**: `200 OK` (`application/ld+json`)

Returns a `ContextSourceIdentity` (ETSI GS CIM 009 clause 5.2.40). Mandatory members:

| Member | Type | Description |
|---|---|---|
| `contextSourceAlias` | string | RFC 7230 pseudonym (token). GeonicDB returns the same pseudonym as its `Via` header (`BROKER_ID`) for loop identification (clause 6.3.18) |
| `contextSourceUptime` | string | ISO 8601 duration. Calculated from deployment start time: `BROKER_START_TIME` is preferred; if missing/invalid/future, process start time is used |
| `contextSourceTimeAt` | string | Current UTC DateTime in ISO 8601 format (millisecond precision, trailing `Z`) |

Response example:

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.9.jsonld",
  "id": "urn:ngsi-ld:ContextSourceIdentity:geonicdb-staging",
  "type": "ContextSourceIdentity",
  "contextSourceAlias": "geonicdb-staging",
  "contextSourceUptime": "PT2H3M4S",
  "contextSourceTimeAt": "2026-08-05T12:34:56.789Z",
  "name": "GeonicDB",
  "description": "FIWARE Orion-compatible Context Broker running on AWS Lambda. Supports NGSIv2 and NGSI-LD APIs for IoT/smart city context data management.",
  "endpoint": "https://geonicdb.geolonia.com",
  "supportedApi": ["ngsi-ld-v1", "ngsiv2"],
  "supportedOperations": ["federationOps", "retrieveOps", "updateOps", "redirectionOps"],
  "registrationMode": ["inclusive", "exclusive", "redirect", "auxiliary"],
  "version": "0.16.0"
}
```

> **Note (#1585)**: A `GET /ngsi-ld/v1/info/conformance` endpoint was previously exposed but has been **removed**. ETSI GS CIM 009 (v1.8.1 / v1.9.1) defines no conformance-class model and no `/info/conformance` operation — the only normative `/info/*` resource is `/info/sourceIdentity`. The path now behaves like any other non-existent NGSI-LD resource: an authenticated/authorized request receives `404 Not Found`; with `AUTH_ENABLED=true` and no explicit `role=anonymous` XACML Permit for the tenant, an unauthenticated request is denied with `403` before routing (if such a Permit exists, routing proceeds and the removed path returns `404`). The previous public, unauthenticated `200` response is gone. Conformance is asserted out-of-band (via the pinned ETSI Test Suite measurements in [geonicdb-compliance](https://github.com/geolonia/geonicdb-compliance)), the same way Orion-LD / Stellio / Scorpio do.

#### Distributed Query Parameters

| Parameter | Type | Description |
|-----------|-----|------|
| `local` | boolean | If `true`, **no Context Source Registration is considered as matching**, so the operation is answered from local data only (ETSI GS CIM 009 Table 6.3.18-1). Applies to `GET /entities`, `GET /entities/{entityId}`, `POST /entityOperations/query`, `GET /types`, `GET /types/{typeName}`, `GET /attributes` and `GET /attributes/{attrId}`. `local` is a **Boolean**: any lexical value other than `true` / `false` returns `400 BadRequestData` (#2008) |
| `localOnly` | boolean | Alias of `local`, kept for backward compatibility. When both are present, `local` wins (#2008) |
| `csf` | string | Context Source Filter expression (e.g., `name==value`, `endpoint~=pattern`) |

> **`local` accepted values (#2008)**: before this was wired, only `localOnly` was honoured and the
> spec-named `local` had **no effect on forwarding at all** — a request with `local=true` still reached
> the registered Context Source. `POST /entityOperations/query` honoured neither name. Forwarding is now
> decided in a single place (`@api/ngsild/utils/local-scope`), so every read path answers the same way.
> Non-Boolean values used to be ignored silently (and therefore forwarded); they now return
> `400 BadRequestData`, matching what `DELETE /entities` already did.
>
> **`/types/` and `/attributes/` too (#2036)**: the normative wording is *"no Context Source
> Registrations shall be considered as matching"*, not *"do not forward"*. Those discovery endpoints
> send no outbound request, but they do merge registration-declared types and attribute names into the
> response — with `local=true` that registration-derived data is now left out.
>
> `/temporal/entities/` and `/temporal/entityOperations/` accept `local` but it is currently a no-op:
> the temporal read paths have no federation wiring, so they are already local-only.

#### Distributed Operation Response Headers

| Header | Description |
|----------|------|
| `NGSILD-Warning` | Warning message set when some context sources fail during federation (ETSI GS CIM 009 - 6.3.6), or when forwarding was skipped due to loop detection (6.3.17/6.3.18, warn-code 199) |
| `Via` | Loop detection header for distributed operations (ETSI GS CIM 009 - 6.3.18 / RFC 7230). The broker appends its own pseudonym as `1.1 <BROKER_ID>` to forwarded requests |

#### Loop Detection (#1664)

ETSI GS CIM 009 - 6.3.17 / 6.3.18 に基づき、受信リクエストの `Via` ヘッダに自ブローカーの
pseudonym (`BROKER_ID`、既定 `geonicdb`) が含まれる場合はループと判定する:

- **inclusive / auxiliary registration**: 転送をスキップしてローカル結果のみ返し、
  `NGSILD-Warning: 199 - "Loop detected: ..."` を付与する (`200 OK`)
- **exclusive / redirect registration**: データが外部ソースにしか存在せず転送すると
  無限ループになるため **`508 Loop Detected`** を返す (ProblemDetails
  `type: https://uri.etsi.org/ngsi-ld/errors/LoopDetected` — 508 用の型は ETSI エラー型
  registry に未定義のため、413 系と同じ規約で GeonicDB が割り当てた安定識別子)
- Via のパースは RFC 7230 準拠 (comment / received-protocol / ポート番号を除去して
  pseudonym を比較)。CloudFront / ALB 等の中間装置が挿入する Via エントリが混在しても
  正しく検出する
- ループ判定は深度判定より**先**に行われる (長い Via チェーンの本物のループでも
  silent local-only にならず 508 / Warning 199 の正しいシグナルが出る)
- **注意:** CDN / ALB / 企業 proxy 等の中間装置が挿入する Via エントリも深度に
  カウントされる (エントリがブローカーか proxy かは判別不能)。proxy 段数が深い
  デプロイ構成では実効カスケード段数がその分減るため、必要に応じて
  `FEDERATION.MAX_CASCADING_DEPTH` の引き上げを検討すること
- Via チェーンの長さはカスケード深度 (`FEDERATION.MAX_CASCADING_DEPTH`、既定 3) の
  判定にも使われる
- **federation する各デプロイには一意の `BROKER_ID` を設定すること** (`docs/ENV.md`)。
  両方既定値のままだと相互に false positive のループ検出になる

#### CSR Change Notifications

When a Context Source Registration is created, updated, or deleted, notifications are automatically sent to the notification endpoints of matching CSource Subscriptions (ETSI GS CIM 009 - 5.11). Notifications include the `Ngsild-Trigger` header indicating the type of change (`csourceRegistration-created`, `csourceRegistration-updated`, `csourceRegistration-deleted`).

The notification payload `type` is `ContextSourceNotification` (ETSI GS CIM 009 Table 5.3.2-1). GeonicDB keeps the existing URI contract for `id` (`urn:ngsi-ld:Notification:<...>`), which is valid because the spec requires a valid URI but does not mandate a fixed prefix.

#### Distributed Type and Attribute Discovery

The `/ngsi-ld/v1/types` and `/ngsi-ld/v1/attributes` endpoints return entity types and attributes registered in Context Source Registrations in addition to local entities (ETSI GS CIM 009 - 5.9.3.3).

### EntityMap Operations

> **ETSI GS CIM 009 Reference**: Section 5.14 - Entity Map

NGSI-LD EntityMap is a feature that saves query results as a map, enabling efficient access by entity ID later.

#### Retrieve Entities in EntityMap Format

Specifying `options=entityMap` in the query parameters of `GET /ngsi-ld/v1/entities` returns the response as an object keyed by entity ID.

```bash
curl "http://localhost:3000/ngsi-ld/v1/entities?type=Room&options=entityMap" \
  -H "Fiware-Service: myservice"
```

**Response Example**:

```json
{
  "urn:ngsi-ld:Room:001": {
    "id": "urn:ngsi-ld:Room:001",
    "type": "Room",
    "temperature": { "type": "Property", "value": 23.5 }
  },
  "urn:ngsi-ld:Room:002": {
    "id": "urn:ngsi-ld:Room:002",
    "type": "Room",
    "temperature": { "type": "Property", "value": 21.0 }
  }
}
```

#### Create EntityMap

```http
POST /ngsi-ld/v1/entityMaps
Content-Type: application/ld+json
```

**Response**: `201 Created`, URL of the created EntityMap in the `Location` header

> **Authorization (#1955)**: the query behind an EntityMap runs with the **same row-level predicate as `GET /ngsi-ld/v1/entities`**, so `entityIds` and `totalCount` only cover rows you are permitted to read. A subject with no readable rows gets `403`. 既存の EntityMap の**読み出し**は所有者ガードで保護されます (#1963 — 下記)。

#### Retrieve EntityMap List

```http
GET /ngsi-ld/v1/entityMaps
```

> **所有者ガード (#1963)**: 非管理者 (`super_admin` / `tenant_admin` 以外) は**自分が作成した EntityMap だけ**を読み出せます。EntityMap は「クエリ結果の entityId 集合と件数」を保存するため、制限の緩い principal が作成したものを制限の強い principal が読めると、読めない行の id と `totalCount` が観測できてしまいます。`GET` (単体・一覧) / `PATCH` / `DELETE` のすべてに同じガードが掛かります。所有者不明のレガシー行は非管理者からは見えません (fail-closed)。

**Query Parameters**

| Parameter | Type | Description |
|-----------|-----|------|
| `limit` | integer | Maximum number of results (default: 20, max: 1000) |
| `offset` | integer | Number of results to skip (default: 0) |

**Response**: `200 OK`

#### Retrieve EntityMap

```http
GET /ngsi-ld/v1/entityMaps/{entityMapId}
```

**Response**: `200 OK` / `404 Not Found`

> 他 principal が作成した EntityMap には **`404`** を返します (#1963)。`403` にすると「その id の EntityMap は存在する」と分かってしまい、存在自体が漏れるためです。

#### Update EntityMap

```http
PATCH /ngsi-ld/v1/entityMaps/{entityMapId}
Content-Type: application/ld+json
```

**Response**: `204 No Content`

#### Delete EntityMap

```http
DELETE /ngsi-ld/v1/entityMaps/{entityMapId}
```

**Response**: `204 No Content`

### Linked Entity Retrieval (join/joinLevel)

On entity retrieval endpoints (`GET /ngsi-ld/v1/entities` and `GET /ngsi-ld/v1/entities/{entityId}`), the `join` and `joinLevel` query parameters can be used to retrieve linked entities.

| Parameter | Type | Description |
|-----------|-----|------|
| `join` | string | Linked entity retrieval mode: `inline` (nested inside Relationship) or `flat` (appended to result array) |
| `joinLevel` | integer | Depth of linked entity resolution (default: 1, max: 5). Values above the maximum are rejected with 400 to prevent resource exhaustion from exponential link resolution. |

**Usage Examples**

```bash
# inline mode - linked entities are nested inside the Relationship
curl "https://api.example.com/ngsi-ld/v1/entities?type=Room&join=inline&joinLevel=2" \
  -H "Fiware-Service: smartcity"

# flat mode - linked entities are appended to the result array
curl "https://api.example.com/ngsi-ld/v1/entities/urn:ngsi-ld:Room:001?join=flat&joinLevel=1" \
  -H "Fiware-Service: smartcity"
```

### Context Source Registration Subscriptions

In NGSI-LD, Context Source Registration Subscriptions (CSR subscriptions) manage subscriptions that monitor changes to context source registrations.

#### Create CSR Subscription

```http
POST /ngsi-ld/v1/csourceSubscriptions
Content-Type: application/ld+json
```

**Request Body**

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "type": "Subscription",
  "entities": [{ "type": "Vehicle" }],
  "notification": {
    "endpoint": {
      "uri": "http://example.com/notify"
    }
  }
}
```

**Request Fields**

| Field | Type | Required | Description |
|-----------|-----|------|------|
| `type` | string | ✓ | Fixed: `Subscription` |
| `entities` | array | ✓ | Target entities to monitor (type, id, idPattern) |
| `notification` | object | ✓ | Notification settings (endpoint.uri is required) |
| `description` | string | - | Subscription description |
| `watchedAttributes` | array | - | List of attributes to monitor |
| `expiresAt` | string | - | Expiration time (ISO 8601 format) |
| `throttling` | number | - | Notification interval (seconds) |
| `isActive` | boolean | - | Active state (default: true) |
| `jsonldContext` | string (dereferenceable URI) | - | JSON-LD `@context` used when sending `ContextSourceNotification`s (#2025, ETSI GS CIM 009 Table 5.2.12-1 / clause 5.8.1.4). If omitted, the `@context` applied to this csource subscription at create/update time is used, falling back to the NGSI-LD core context. Must be a single absolute IRI that GeonicDB can resolve — otherwise `400 BadRequestData`. Returned by `GET` when set |

`watchedAttributes` and `notification.attributes` follow the same `@context` term ⇄ URI rules as `csourceRegistrations` attribute names (#1890 / #1900): names are stored verbatim with the write-time `@context`; GET responses compact them using the request `@context`; CSR notification matching uses an alias-set intersection (verbatim ∪ canonical).

The `@context` of the resulting `ContextSourceNotification` follows the same delivery rule as ordinary subscription notifications (#2025 / #1841): `notification.endpoint.accept: application/ld+json` puts it in the body, `application/json` puts it in the `Link` header, and **never both**. Before #2025 the core `@context` was always placed in the body regardless of `accept`, and a supplied `jsonldContext` was silently discarded.

**Response**
- Status: `201 Created`
- Header: `Location: /ngsi-ld/v1/csourceSubscriptions/{subscriptionId}`

#### Retrieve CSR Subscription List

```http
GET /ngsi-ld/v1/csourceSubscriptions
```

**Query Parameters**

| Parameter | Type | Description | Default |
|-----------|-----|------|-----------|
| `limit` | integer | Number of results to retrieve | 20 |
| `offset` | integer | Offset | 0 |

**Response Example**

```json
[
  {
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
    "id": "urn:ngsi-ld:CSourceSubscription:sub001",
    "type": "Subscription",
    "entities": [{ "type": "Vehicle" }],
    "notification": {
      "endpoint": { "uri": "http://example.com/notify" }
    },
    "isActive": true
  }
]
```

#### Retrieve CSR Subscription

```http
GET /ngsi-ld/v1/csourceSubscriptions/{subscriptionId}
```

#### Update CSR Subscription

```http
PATCH /ngsi-ld/v1/csourceSubscriptions/{subscriptionId}
```

**Request Body**

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "description": "Updated subscription"
}
```

**Response**: `204 No Content`

#### Delete CSR Subscription

```http
DELETE /ngsi-ld/v1/csourceSubscriptions/{subscriptionId}
```

**Response**: `204 No Content`

### JSON-LD Context Management

JSON-LD context management API compliant with ETSI GS CIM 009 Section 5.12. Allows registration and management of user-defined JSON-LD contexts.

#### Register JSON-LD Context

```http
POST /ngsi-ld/v1/jsonldContexts
Content-Type: application/json
```

**Request Body**

```json
{
  "@context": {
    "type": "@type",
    "id": "@id",
    "Temperature": "https://example.org/ontology#Temperature"
  }
}
```

**Response**
- Status: `201 Created`
- Header: `Location: /ngsi-ld/v1/jsonldContexts/{contextId}`

#### Retrieve JSON-LD Context List

```http
GET /ngsi-ld/v1/jsonldContexts
```

**Query Parameters**

| Parameter | Type | Description | Default |
|-----------|-----|------|-----------|
| `limit` | integer | Maximum number of results | 20 |
| `offset` | integer | Number of results to skip | 0 |

**Response**: `200 OK`

#### Retrieve JSON-LD Context

```http
GET /ngsi-ld/v1/jsonldContexts/{contextId}
```

**Cache Headers**

The response includes the following cache-related headers:

| Header | Description |
|---------|------|
| `ETag` | MD5 hash of the context body |
| `Last-Modified` | Creation date and time of the context |
| `Cache-Control` | `public, max-age=3600` |
| `Vary` | Includes `Link` and `Accept` — response `@context` placement depends on these request dimensions |

**Representation note (#1838):** The dereferenced body echoes the request `@context` and may omit inline `@context` when `Accept` is not JSON-LD. Shared caches that ignore `Vary` may mix representations for the same `contextId` URL (interoperability risk, not tenant leakage — `contextId` is globally unique and the endpoint is unauthenticated).

**Conditional Requests**

| Request Header | Behavior |
|------------------|------|
| `If-None-Match` | Returns `304 Not Modified` if the ETag matches |
| `If-Modified-Since` | Returns `304 Not Modified` if no changes since the specified date |

**Response**: `200 OK` / `304 Not Modified`

#### Delete JSON-LD Context

```http
DELETE /ngsi-ld/v1/jsonldContexts/{contextId}
```

**Response**: `204 No Content`

## HTTP Cache Control

NGSI-LD GET endpoints return cache-related headers by endpoint class:

### Data endpoints (entities, subscriptions, csourceRegistrations, csourceSubscriptions) — full RFC 7232 + RFC 7234 support

| Header | Value | Purpose |
|--------|-------|---------|
| `ETag` | `W/"..."` | Weak validator. Generation seeds include `path + Accept + tenant + Fiware-ServicePath` (tenant = `NGSILD-Tenant` ?? `Fiware-Service`) so distinct endpoints / Accept / tenants / service paths always produce distinct ETags. **Entity list** (`GET /entities`, non-federated, non-geoNear, non-join/split/entityMap): lightweight validator derived from `total count + max(modifiedAt)` mixed with a scope that also includes the full query string, computed **without fetching entity bodies** so `If-None-Match` can be evaluated and `304` returned before the heavy query (#1261). Federated / geoNear / materialized list paths fall back to a streaming digest of each `id + modifiedAt` mixed with total count and scope. Other lists (subscriptions, registrations, csource\*): streaming digest. Single: hash of `modifiedAt` mixed with scope. |
| `Last-Modified` | RFC 1123 HTTP-date | Timestamp of the latest `modifiedAt` in the result set. |
| `Cache-Control` | `private, no-cache` | `private` blocks shared / intermediate cache storage; `no-cache` forces revalidation from the private cache. |
| `Vary` | `NGSILD-Tenant, Fiware-Service, Fiware-ServicePath, Authorization, X-Api-Key, Accept` | Tenant + auth + content-negotiation isolation for shared caches. |

Conditional requests are supported:

| Request Header | Behavior |
|----------------|----------|
| `If-None-Match: <ETag>` | Returns `304 Not Modified` (empty body) if matched. |
| `If-Modified-Since: <HTTP-date>` | Returns `304` if the resource is unchanged. |
| `Cache-Control: no-store` | Server overrides response `Cache-Control` to `no-store`. |

### Meta endpoints (types, attributes) — Cache-Control + Vary only (no ETag / no 304)

| Header | Value | Purpose |
|--------|-------|---------|
| `Cache-Control` | `private, max-age=60, stale-while-revalidate=120` | Shared/intermediate cache storage is forbidden; private cache can reuse briefly with background revalidation. |
| `Vary` | `NGSILD-Tenant, Fiware-Service, Fiware-ServicePath, Authorization, X-Api-Key, Accept` | Same tenant/auth isolation as data endpoints. |

Meta endpoints do not return `ETag` / `Last-Modified` and do not support `If-None-Match` / `If-Modified-Since` conditional requests. Clients should rely on the `max-age` / `stale-while-revalidate` directives instead.

### Error responses (#1821)

The error statuses among RFC 9110 §15.1's heuristically cacheable set (404, 405, 410, 414, 501) receive `Cache-Control: no-store` from the centralized error handler so shared caches (CloudFront Error Caching Minimum TTL, etc.) cannot store cross-tenant existence oracles on entity GET. Typical 400 responses are not heuristically cacheable and receive no override.

> **Note**: `/ngsi-ld/v1/jsonldContexts/{contextId}` has additional context-specific cache semantics — see the JSON-LD Context Management section above.

See [API.md §HTTP Cache Control](./endpoints.md#http-cache-control-etag--conditional-requests) for full semantics.

---

## Endpoint List

ETSI NGSI-LD compatible Context Broker API.

### Common Specifications

- **Content-Type**: `application/ld+json` or `application/json`
- **Authentication**: Required unless `AUTH_ENABLED=false`
- **Tenant Isolation**: `NGSILD-Tenant` or `Fiware-Service` header
- **Pagination**: `limit`/`offset` parameters. Total count is returned via the `NGSILD-Results-Count` header **only when `count=true` is requested** (ETSI GS CIM 009 §5.5.6). When count is not requested, the broker skips the count query and indicates further pages via `NGSILD-Next` / `Link` (`rel="next"`) instead (#1434).
- **OPTIONS Method**: All NGSI-LD endpoints support the OPTIONS method. Returns a 204 response with `Allow` and `Accept-Patch` headers
- **405 Method Not Allowed**: Returns a 405 response for disallowed HTTP methods (RFC 7807 ProblemDetails format, with `Allow` header)
- **406 Not Acceptable**: GET endpoints reject an `Accept` header that cannot be negotiated into an available representation with a 406 ProblemDetails listing `availableRepresentations` (ETSI GS CIM 009 - 6.3.2 / 6.3.4, #1693). See [Content Negotiation](#content-negotiation-and-context)
- **Path id validation**: On by-id endpoints (entities, subscriptions, csourceRegistrations, temporal entities, jsonldContexts), a path id that is not a valid URI returns `400 BadRequestData` before the existence check (#1692)
- **Error Format**: NGSI-LD error responses are returned in RFC 7807 ProblemDetails format (`application/json`)

### Entity Operations

| Endpoint | Method | Description | Success | Error | Pagination |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/entities` | GET | Retrieve entity list | 200 | 400, 401, 406 | ✅ (max: 1000) |
| `/ngsi-ld/v1/entities` | POST | Create entity | 201 | 400, 401, 409, 415 | - |
| `/ngsi-ld/v1/entities` | DELETE | Purge entities / attribute-level purge (`keep` / `drop`) | 204 | 400, 401 | - |
| `/ngsi-ld/v1/entities/{entityId}` | GET | Retrieve entity | 200 | 400, 401, 404, 406 | - |
| `/ngsi-ld/v1/entities/{entityId}` | PUT | Replace entity | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/entities/{entityId}` | PATCH | Update entity (merge patch) | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/entities/{entityId}` | POST | Add attributes | 204/207 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/entities/{entityId}` | DELETE | Delete entity | 204 | 400, 401, 404 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs` | GET | Retrieve all attributes of entity | 200 | 400, 401, 404, 406 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs` | POST | Add attributes | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs` | PATCH | Partial attribute update | 204/207 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}` | GET | Retrieve single attribute | 200 | 400, 401, 404, 406 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}` | POST | Replace attribute | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}` | PUT | Replace attribute | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}` | PATCH | Partial attribute update | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}` | DELETE | Delete attribute | 204 | 400, 401, 404 | - |

### Type Operations

| Endpoint | Method | Description | Success | Error | Pagination |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/types` | GET | Retrieve entity type list | 200 | 400, 401, 406 | ✅ (max: 1000) |
| `/ngsi-ld/v1/types/{typeName}` | GET | Retrieve entity type details | 200 | 401, 404, 406 | - |

### Attribute Operations

| Endpoint | Method | Description | Success | Error | Pagination |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/attributes` | GET | Retrieve attribute list | 200 | 400, 401, 406 | ✅ (max: 1000) |
| `/ngsi-ld/v1/attributes/{attrName}` | GET | Retrieve attribute details | 200 | 401, 404, 406 | - |

### Subscription Operations

| Endpoint | Method | Description | Success | Error | Pagination |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/subscriptions` | GET | Subscription list | 200 | 400, 401, 406 | ✅ (max: 1000) |
| `/ngsi-ld/v1/subscriptions` | POST | Create subscription | 201 | 400, 401, 415 | - |
| `/ngsi-ld/v1/subscriptions/{subscriptionId}` | GET | Retrieve subscription | 200 | 400, 401, 404, 406 | - |
| `/ngsi-ld/v1/subscriptions/{subscriptionId}` | PATCH | Update subscription | 204 | 400, 401, 404, 409, 415 | - |
| `/ngsi-ld/v1/subscriptions/{subscriptionId}` | DELETE | Delete subscription | 204 | 400, 401, 404 | - |

### Context Source Registration Operations (Federation)

| Endpoint | Method | Description | Success | Error | Pagination |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/csourceRegistrations` | GET | Registration list | 200 | 400, 401, 406 | ✅ (max: 1000) |
| `/ngsi-ld/v1/csourceRegistrations` | POST | Create registration | 201 | 400, 401, 409, 415 | - |
| `/ngsi-ld/v1/csourceRegistrations/{registrationId}` | GET | Retrieve registration | 200 | 400, 401, 404, 406 | - |
| `/ngsi-ld/v1/csourceRegistrations/{registrationId}` | PATCH | Update registration | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/csourceRegistrations/{registrationId}` | DELETE | Delete registration | 204 | 400, 401, 404 | - |

### Context Source Registration Subscription Operations

| Endpoint | Method | Description | Success | Error | Pagination |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/csourceSubscriptions` | GET | CSR subscription list | 200 | 400, 401, 406 | ✅ (max: 1000) |
| `/ngsi-ld/v1/csourceSubscriptions` | POST | Create CSR subscription | 201 | 400, 401, 415 | - |
| `/ngsi-ld/v1/csourceSubscriptions/{subscriptionId}` | GET | Retrieve CSR subscription | 200 | 401, 404, 406 | - |
| `/ngsi-ld/v1/csourceSubscriptions/{subscriptionId}` | PATCH | Update CSR subscription | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/csourceSubscriptions/{subscriptionId}` | DELETE | Delete CSR subscription | 204 | 401, 404 | - |

### Distributed Operation Information

| Endpoint | Method | Description | Success | Error |
|---------------|---------|------|------|--------|
| `/ngsi-ld/v1/info/sourceIdentity` | GET | Retrieve broker identity | 200 | 406 |

### JSON-LD Context Management

| Endpoint | Method | Description | Success | Error | Pagination |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/jsonldContexts` | GET | JSON-LD context list | 200 | 400, 401, 406 | ✅ (max: 1000) |
| `/ngsi-ld/v1/jsonldContexts` | POST | Register JSON-LD context | 201 | 400, 401, 409, 415 | - |
| `/ngsi-ld/v1/jsonldContexts/{contextId}` | GET | Retrieve JSON-LD context | 200 | 400, 401, 404, 406 | - |
| `/ngsi-ld/v1/jsonldContexts/{contextId}` | DELETE | Delete JSON-LD context | 204 | 400, 401, 404 | - |

### EntityMap Operations

| Endpoint | Method | Description | Success | Error | Pagination |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/entityMaps` | GET | Retrieve EntityMap list | 200 | 400, 401, 406 | ✅ (max: 1000) |
| `/ngsi-ld/v1/entityMaps` | POST | Create EntityMap | 201 | 400, 401, 403, 415 | - |
| `/ngsi-ld/v1/entityMaps/{entityMapId}` | GET | Retrieve EntityMap | 200 | 401, 404, 406 | - |
| `/ngsi-ld/v1/entityMaps/{entityMapId}` | PATCH | Update EntityMap | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/entityMaps/{entityMapId}` | DELETE | Delete EntityMap | 204 | 401, 404 | - |

### Snapshot Operations

> **GeonicDB 独自拡張 (非 ETSI 準拠, #1667):** GeonicDB の Snapshot API は ETSI GS CIM 009 v1.9.1
> の optional Snapshot module (clause 5.16 / 6.36-6.38) と**同名だが別物**です。ETSI の Snapshot は
> 「クエリ結果の凍結ビュー」を非同期実行で作る横断機構であるのに対し、GeonicDB の Snapshot は
> エンティティのコピー & リストア機構です。ETSI 準拠のクライアントはこのエンドポイントを
> ETSI Snapshot として扱わないでください。
>
> | 観点 | ETSI 5.16 Snapshot | GeonicDB Snapshot |
> |------|--------------------|-------------------|
> | 目的 | クエリ結果の凍結ビュー (frozen view) | エンティティ集合のコピー & リストア |
> | 作成入力 | `snapshotQueries` (Query 配列) **必須** | `{description, entityTypes, entityIds}` |
> | 実行モデル | 非同期 (status: `Pending`→`Processing`→`Available`) | 同期キャプチャ (status: `running`/`succeeded`/`failed`) |
> | 参照方法 | 任意の NGSI-LD 操作に `NGSILD-Snapshot` ヘッダを付けて snapshot 上で実行 | `GET /snapshots/{id}` + `POST /snapshots/{id}/clone` (リストア) |
> | 通知 | `SnapshotNotification` | なし |
> | `NGSILD-Snapshot` ヘッダ (6.3.22) | あり | **未対応** |
>
> **将来の共存パス:** 仕様形の `POST /snapshots` は `snapshotQueries` メンバが必須、GeonicDB 形は
> `{description, entityTypes, entityIds}` であり、入力形で判別可能です。将来 ETSI 準拠実装を同一
> path に追加する migration path は塞がれていません。

| Endpoint | Method | Description | Success | Error | Pagination |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/snapshots` | GET | Retrieve snapshot list | 200 | 400, 401, 406 | ✅ (max: 1000) |
| `/ngsi-ld/v1/snapshots` | POST | Create snapshot | 201 | 400, 401, 403, 415 | - |
| `/ngsi-ld/v1/snapshots` | DELETE | Purge own snapshots | 200 | 401 | - |
| `/ngsi-ld/v1/snapshots/{snapshotId}` | GET | Retrieve snapshot | 200 | 401, 404, 406 | - |
| `/ngsi-ld/v1/snapshots/{snapshotId}` | PATCH | Update snapshot status | 204 | 400, 401, 403, 404 | - |
| `/ngsi-ld/v1/snapshots/{snapshotId}` | DELETE | Delete snapshot | 204 | 401, 403, 404 | - |
| `/ngsi-ld/v1/snapshots/{snapshotId}/clone` | POST | Clone snapshot (restore) | 200 | 400, 401, 403, 404 | - |

> **行レベル認可 (#1945):** Snapshot API はエンティティ経路と同じ行レベル認可を適用します。
>
> - **capture (`POST /snapshots`)** — 取り込むのは、その principal が `GET /ngsi-ld/v1/entities`
>   で読める行だけです。scope / owner で読めないエンティティは snapshot に入りません
>   (`entityCount` にも数えられません)。読める行が 1 件も無い principal は 403 になります。
> - **clone (`POST /snapshots/{id}/clone`)** — 書き戻すのは、その principal が
>   `POST /ngsi-ld/v1/entities` で書ける行だけです。復元内容 (snapshot 行) と
>   上書き先の既存行の**両方**が Permit される必要があります。
> - **snapshot 自体の変更 (PATCH / DELETE)** — 作成者のみ。他者の snapshot は 403 です
>   (`super_admin` / `tenant_admin` は従来どおり全件操作できます)。
> - **purge (`DELETE /snapshots`)** — 非管理者は**自分が作成した** snapshot だけを削除します。

### Batch Operations

| Endpoint | Method | Description | Success | Error | Pagination |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/entityOperations/create` | POST | Batch create (max: 1000) | 200/201 | 400, 401, 415 | - |
| `/ngsi-ld/v1/entityOperations/upsert` | POST | Batch upsert (max: 1000) | 204/207 | 400, 401, 415 | - |
| `/ngsi-ld/v1/entityOperations/update` | POST | Batch update (max: 1000) | 200/204 | 400, 401, 415 | - |
| `/ngsi-ld/v1/entityOperations/delete` | POST | Batch delete (max: 1000) | 200/204 | 400, 401, 415 | - |
| `/ngsi-ld/v1/entityOperations/query` | POST | Batch query | 200 | 400, 401, 415 | ✅ (max: 1000) |
| `/ngsi-ld/v1/entityOperations/merge` | POST | Batch merge patch (max: 1000) | 204/207 | 400, 401, 415 | - |
| `/ngsi-ld/v1/entityOperations/purge` | POST | Bulk entity purge (GeonicDB 独自拡張, backward compatibility) | 204 | 400, 401, 415 | - |

### Temporal API (Time-Series Data)

Temporal history is not auto-recorded by Entity API writes such as `POST /ngsi-ld/v1/entities`, `PATCH /ngsi-ld/v1/entities/{entityId}`, or `POST/PATCH /ngsi-ld/v1/entities/{entityId}/attrs`. Use one of these ingestion paths: (1) explicit writes to Temporal API endpoints (single or batch), or (2) ReactiveCore rules using `appendToTemporal` to append on entity changes.

| Endpoint | Method | Description | Success | Error | Pagination |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/temporal/entities` | GET | Retrieve temporal entity list | 200 | 400, 401, 406 | ✅ (max: 1000) |
| `/ngsi-ld/v1/temporal/entities` | POST | Create temporal entity | 201 | 400, 401, 409, 415 | - |
| `/ngsi-ld/v1/temporal/entities/{entityId}` | GET | Retrieve temporal entity | 200 | 400, 401, 404, 406 | - |
| `/ngsi-ld/v1/temporal/entities/{entityId}` | PATCH | Merge attributes of temporal entity | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/temporal/entities/{entityId}` | DELETE | Delete temporal entity | 204 | 400, 401, 404 | - |
| `/ngsi-ld/v1/temporal/entities/{entityId}/attrs` | POST | Add attribute instance | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/temporal/entities/{entityId}/attrs/{attrName}` | DELETE | Delete attribute instance | 204 | 400, 401, 404 | - |
| `/ngsi-ld/v1/temporal/entities/{entityId}/attrs/{attrName}/{instanceId}` | PATCH | Modify attribute instance | 204 | 400, 401, 404 | - |
| `/ngsi-ld/v1/temporal/entityOperations/create` | POST | Temporal batch create (max: 1000) | 201/207 | 400, 401, 415 | - |
| `/ngsi-ld/v1/temporal/entityOperations/upsert` | POST | Temporal batch upsert (max: 1000) | 204/207 | 400, 401, 415 | - |
| `/ngsi-ld/v1/temporal/entityOperations/delete` | POST | Temporal batch delete | 204/207 | 400, 401, 415 | - |
| `/ngsi-ld/v1/temporal/entityOperations/query` | POST | Temporal batch query | 200 | 400, 401, 415 | ✅ (max: 1000) |

> **属性名の保存形と compaction (#1975)**: temporal の属性名も entity 側 (#1649) と同じ canonical 形 (`compactIri(core @context, expandTerm(書き込み @context, 名前))`) で保存されます。単一/batch の create・`POST .../attrs`・`PATCH` (merge) の全書き込み経路が対象で、書き込み時にリクエスト `@context` がマップする term は FQN で保存されます。GET / query / 集約応答は**そのリクエストが渡した `@context`** を基準に属性名を compact して返します (ETSI GS CIM 009 clause 5.5.7)。`orderBy`・`attrs` セレクタ・属性削除 (`DELETE .../attrs/{attrName}`)・インスタンス修正 (`PATCH .../attrs/{attrName}/{instanceId}`) のパス属性名も同じ正規化と候補照合 (保存形の union の OR) を通るため、ある `@context` で書いた属性を**別の `@context` の同義 term**で引く・並び替える・削除できます。属性名は短縮名 (`A-Za-z0-9_`) に加え**絶対 IRI もそのまま受理**します（従来は短縮名限定でした）。
>
> **既知の制限**: temporal は書き込み時 `@context` を保存していないため一括移行ができません。**#1975 適用前 (移行前) の既存データは verbatim 保存のまま**残り、応答でも保存形をそのまま返します（compact されません）。読み取り・クエリ・削除は保存形の候補集合（verbatim ∪ canonical）の OR で照合するため、legacy データにも当たり続けます。

