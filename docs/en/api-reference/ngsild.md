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

**Request body `@context` (write operations, #1583 / #1599 / #2065):** For **every** `POST` / `PATCH` / `PUT` that carries a body, the `Content-Type` governs how `@context` is supplied. Clause 6.3.5 names the verb, not the resource, so this covers entity-level writes, single-attribute writes, batch operations, temporal writes, subscriptions, csourceRegistrations and csourceSubscriptions alike:

| Request `Content-Type` | `@context` in body | Behavior |
|----------------|--------------|----------------|
| `application/ld+json` | **Required** | Omitting `@context` returns `400 BadRequestData` (ETSI GS CIM 009 clause 6.3.5). A JSON-LD document without a context has undefined attribute-name semantics. |
| `application/json` | **Rejected** | Clause 6.3.5: "if the request payload body (as JSON) contains a `@context` term, then an HTTP error response of type BadRequestData shall be raised." Supply the context via the `Link` header instead; with neither, the core `@context` applies implicitly. |

**No mixes (#1924).** Clause 6.3.5 closes with "No mixes are allowed, i.e. mixing options shall result in HTTP response errors." Both directions return `400 BadRequestData` on `POST` / `PATCH` / `PUT`:

| Request | Result |
|---|---|
| `application/ld+json` + JSON-LD `Link` header | `400 BadRequestData` |
| `application/json` + body `@context` | `400 BadRequestData` |
| `application/ld+json`, no `@context` anywhere | `400 BadRequestData` |
| `application/ld+json` + body `@context` only | accepted |
| `application/json` + `Link` header only | accepted |
| `application/json`, no `@context` anywhere | accepted (core `@context`) |

The check runs once at the NGSI-LD router entry, so it covers **every** body-carrying NGSI-LD write — entity-level, single-attribute, batch, temporal, subscriptions, csourceRegistrations and csourceSubscriptions alike. `POST /ngsi-ld/v1/jsonldContexts` is exempt: its body *is* a JSON-LD context document, not a context declaration. `application/merge-patch+json` is outside clause 6.3.5's wording (it names only `application/json` and `application/ld+json`) and is therefore not subject to the mix rule.

**Array bodies are checked per element (#2069).** A batch body is "a JSON-LD Array containing one or more JSON-LD documents **each one representing an NGSI-LD Entity**" (clause 5.6.7.3), so each element is its own JSON-LD document and needs its own `@context`. A violation therefore belongs to that element, not to the request: it is reported as a `BatchEntityError` in the `errors` array of a **`207 Multi-Status`** response, and the remaining elements are still processed. Only the `Link`-header violation — which cannot be attributed to any single element — stays a request-level `400`. The ETSI conformance suite measures exactly this split (`003_06_01` / `003_08_01` expect `207`, `003_09_01` expects `400`).

`POST /entityOperations/delete` is exempt: clause 5.6.10.3 defines its input as "a JSON-LD Array containing a list of **Entity IDs (URIs)**", and a string element has nowhere to carry an `@context`. The exemption is decided by the **shape of the element**, not by the path.

| Batch request | Result |
|---|---|
| `application/ld+json`, every element carries `@context` | accepted |
| `application/ld+json`, some elements lack `@context` | `207` — those elements fail with `BadRequestData`, the rest succeed |
| `application/ld+json`, no element carries `@context` | `207` — every element fails with `BadRequestData` |
| `application/json`, some elements carry `@context` | `207` — those elements fail with `BadRequestData` |
| `application/ld+json` + JSON-LD `Link` header | `400 BadRequestData` (request-level) |
| `POST /entityOperations/delete` (array of ID strings), any `Content-Type` | accepted |

**Compatibility note.** Clients that previously sent `application/json` with a body `@context` (the `@context` was silently ignored) now receive `400`. Switch them to `application/ld+json`, or move the context to the `Link` header. Likewise, a client that sends `application/ld+json` *and* a `Link` header must drop the `Link` header on writes.

**Breaking change (#2065 / #1599).** Before this change the "`application/ld+json` requires a body `@context`" rule was wired only to the six entity-level endpoints. `POST /entityOperations/*`, `POST`/`PATCH /subscriptions`, `POST`/`PATCH /csourceRegistrations`, `POST`/`PATCH /csourceSubscriptions`, the temporal writes and both `POST` query operations accepted context-less JSON-LD with `200` / `201` / `204`. They now return `400` (or `207` for array bodies). A client that sends `Content-Type: application/ld+json` on these endpoints must include an inline `@context` — or switch to `application/json` and supply the context via the `Link` header.

**Response `@context` is decided by the request alone (#1733).** Per ETSI GS CIM 009 clause 5.5.7, "the `@context` used to perform compaction or expansion of terms shall be the one provided by each API call (or the default `@context` in its absence), and **not any other `@context` which might have been supplied previously**", and clause 5.5.5 requires that an input without any `@context` be given "at minimum … the Core `@context`". Accordingly:

- If the read supplies a context via the JSON-LD `Link` header, the response is compacted with it. For the `POST` query operations (`/entityOperations/query`, `/temporal/entityOperations/query`) the source follows clause 6.3.5 like any other POST: with `application/ld+json` the `@context` comes from the request **body**, with `application/json` from the `Link` header (#1786). Before this was wired, a body `@context` was ignored on those endpoints and the query's type / attribute names expanded under the wrong vocabulary — which surfaced as **zero results**, not an error.
- If the read supplies none, the response is compacted with the **NGSI-LD core `@context` only**. Entity types and attribute names that the core `@context` cannot compact are rendered as **fully qualified URIs** (clause 5.5.7: "implementations shall render Fully Qualified Names").
- The broker never guesses a context from the entity `type` (Smart Data Models / Custom Data Model). To get a domain vocabulary back, pass that vocabulary's `@context` on the read.
- **A short name is only used when it expands back to the same URI under the request's `@context` (#1787).** If the request's `@context` maps that short name to a *different* IRI (shadowing), it is not a "matching term" and is never emitted — the broker falls through to the next compaction form (a `prefix:suffix` compact IRI that does round-trip) and finally to the fully qualified URI. Example: an attribute written without any `@context` (URI `https://uri.etsi.org/ngsi-ld/default-context/name`) read back with a context defining `"name": "https://example.org/vocab#name"` renders as `ngsi-ld:default-context/name`, **not** `name` — returning `name` would make the client read it as `example.org/vocab#name`. This mirrors the JSON-LD 1.1 [IRI Compaction Algorithm](https://www.w3.org/TR/json-ld11-api/#iri-compaction) and applies to entity types and attribute names alike.
- **The shadowing check applies to short-name entity types too (#1876).** Types written without any `@context` are stored as bare canonical names, and the broker used to render them by stripping the core `@vocab` without consulting the read's `@context` at all. It now consults it whenever the read supplies one: a `Building` created with no context, read back under a context defining `"Building": "https://example.org/vocab#Building"`, renders as `ngsi-ld:default-context/Building`. Reads that supply no `@context` (or only the core one) keep the old fast path and never fetch a remote context. The same rule applies to the type selectors inside `csourceRegistrations`, `csourceSubscriptions` and `subscriptions` responses.
- **Ambiguous `@context` documents are rejected with `400 BadRequestData` (#1878).** A context that defines a term whose *key* is an absolute IRI in pass-through form (`https://…`, `urn:…`, or a `prefix:suffix` whose prefix is undefined) and maps it to a **different** IRI leaves the broker no way to satisfy clause 5.5.7: even the fully qualified name it would fall back to means something else under that context. Such a request is refused rather than answered with a silently misread name. This is narrow — `{"ex": "https://ex/ns#", "ex:Name": "https://ex/ns#Name"}` (a compact IRI key whose prefix is defined in the same context) and `{"https://ex/X": "https://ex/X"}` (a key mapped to itself) are both still accepted.

**Creation / update `@context` preservation (#1620 / #1633 / #1637):** The `@context` supplied on write (body for `application/ld+json`, or `Link` header for `application/json`) is stored with the entity as `contextRef`. This covers **URLs, URL arrays, inline context objects (term → IRI maps), and mixed arrays**. Since #1733 it is used **only to recover the fully qualified names of stored attributes** when rendering a response — it never decides the response `@context`. **Update semantics (#1637, ETSI GS CIM 009 clause 5.6.18 Replace / 5.6.17 Merge / 5.6.2 Update Attributes):**

- **Replace family** (`PUT /entities/{id}`, batch upsert `options=replace`): if the request carries a storable `@context`, it **overwrites** the stored `contextRef`. If omitted or core-only (`extractContextRef` returns undefined, #1620), the stored value is **left untouched** (omission is not deletion).
- **Merge family** (`PATCH /entities/{id}`, `PATCH /attrs`, `POST /attrs`, batch upsert default / update / merge): **set-if-absent** — a missing `contextRef` is backfilled; an existing one is never overwritten.

JSON `null` does not unset `@context` on entity PATCH (`@context` is not an Attribute; entity merge uses `urn:ngsi-ld:null`, clause 5.5.12). Hosting inline contexts as dereferenceable `jsonldContexts` URLs (so `application/json` `Link` headers can carry them) is out of scope. An inline `@context` whose serialized size exceeds `MAX_CONTEXT_INLINE_BYTES` (8 KiB), or a `@context` array with more than `MAX_CONTEXT_ARRAY` (10) entries, is rejected with `400 BadRequestData`.

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
| `typePattern` | string | Regular expression pattern for entity type, evaluated **verbatim** (no implicit `*`→`.*` conversion). Combining with `type` is an **AND** (both must match) — unlike NGSIv2 where they are mutually exclusive (#2105/#2122). Applied to federated (remote) results before merging as well (#2134). **GeonicDB 独自拡張** | - |
| `idPattern` | string | Regular expression pattern for entity ID | - |
| `q` | string | Filter by attribute value | - |
| `attrs` | string | Attribute names to retrieve (comma-separated) | - |
| `pick` | string | Attribute names to retrieve, in the **NGSI-LD Attribute Projection Language** (ETSI GS CIM 009 clause 4.21). Mutually exclusive with `omit` and `attrs`. Entity members `id` / `type` / `scope` may be listed. Syntax violations return `400 BadRequestData` (#2277) | - |
| `omit` | string | Attribute names (or Entity members `id` / `type` / `scope`) to exclude, same projection language as `pick`. Mutually exclusive with `pick` and `attrs`. The result may no longer be a valid NGSI-LD Entity (#2275) | - |
| `scopeQ` | string | Scope query (e.g., `/Madrid`, `/Madrid/#`, `/Madrid/+`) | - |
| `lang` | string | Language filter for LanguageProperty (BCP 47, comma-separated / q-value ranking, `*` for any supported language). Converts the attribute to a Property `{value, lang}` and drops `languageMap` | - |
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

> **GeoJSON attribute/type name compaction (#1788 サブ項目 6):** When `format=geojson` (or `Accept: application/geo+json`) is negotiated, the Feature `properties` keys and `properties.type` are compacted with the same request-`@context` rules as the JSON representation (ETSI GS CIM 009 clause 5.5.7 — see [Content Negotiation and @context](#content-negotiation-and-context) above). Before this fix, `toNgsiLd` (JSON) compacted names while the GeoJSON transformer emitted the stored (canonical/FQN) names verbatim, so the same entity could carry different attribute names depending on `Accept`. Only the emitted `properties` key is compacted; the attribute selected as the `geometry` is matched against the **stored** attribute name, so geometry selection is unaffected by compaction.
>
> **Top-level `geometry` selection — `geometryProperty` (#2046):** ETSI GS CIM 009 clause 4.5.16.1 defines the selection algorithm: the `geometryProperty` query parameter names the GeoProperty to use as the Feature `geometry`, and **"if this parameter is not present, then the default name of `location` shall be used"**. The parameter value is a term, so it is expanded with the request `@context` before being matched against the stored (canonical/FQN) attribute name — passing a short name defined by your `@context` works even when the attribute is stored as a FQN. If the entity lacks the named GeoProperty, or the value is not a valid GeoJSON geometry object, `geometry` is `null` (clause 4.5.16.1); it does **not** fall back to `location`. The same wiring applies to all three GeoJSON-eligible bindings — `GET /entities`, `GET /entities/{entityId}` and `POST /entityOperations/query`.
>
> `geometryProperty` is a **different parameter from `geoproperty`** (Table 6.4.3.2-1 defines both): `geometryProperty` selects the GeoJSON top-level `geometry`, while `geoproperty` names the GeoProperty a geo-query filters on. Per clauses 5.7.1 and 5.7.2, *"if `geometryProperty` parameter is present and the Accept Header is not set to `application/geo+json`, then an error of type BadRequestData shall be raised"* — so supplying it on a non-GeoJSON response yields `400 BadRequestData` rather than being silently ignored. (GeonicDB also renders GeoJSON for `?format=geojson`, so the check is "is this response GeoJSON", not "is the Accept header exactly geo+json".)
>
> **The selected GeoProperty also appears in `properties` (#2046):** clause 4.5.16.2 defines `properties` as *"One member for each Property (**including the selected GeoProperty**)"*, and the annex C.2.3 example shows `geometry` and `properties.location` side by side. Before this fix GeonicDB excluded the geometry attribute from `properties`, so `location` disappeared from GeoJSON responses. It is now emitted in both places, as the specification requires. Clause 4.5.17.1 states the same rule for the simplified GeoJSON representation.
>
> **`pick` / `omit` は clause 4.21 の文法で検証する (#2277)**: ETSI GS CIM 009 clause 4.21
> *NGSI-LD Attribute Projection Language* は射影パラメータの文法を ABNF で定める。
>
> ```abnf
> orOp             = %x7C / %x2C                                 ; | ,
> ProjectionTerm   = AttrName *1(LinkedEntityTerm) *(orOp ProjectionTerm)
> LinkedEntityTerm = %x7B ProjectionTerm %x7D                    ; {ProjectionTerm}
> ```
>
> 従来 GeonicDB は `pick` / `omit` を素の `split(',')` で読んでおり、文法違反
> (`id;name` / `id,,name` / `id,locatedAt{name` / `id,locatedAt{{name}` / `id,locatedAt{,name}` /
> `id,locatedAt{}`) が **400 にならず、silent に「射影なし」へ落ちて**いた
> (`id,,name` は一覧クエリで 5xx になっていた)。現在はいずれも `400 BadRequestData` を返す。
>
> - `,` と `|` はどちらも orOp。`pick=name|category` は正当。
> - `AttrName` は clause 4.9 の `unicodeLetter *TermChar` (`TermChar` = 文字 / 数字 / `_`)。
>   **GeonicDB はこれに加えて絶対 IRI も受理する** — #1649 以降、属性名は canonical (FQN) で
>   保存されるため `pick=https://uri.etsi.org/ngsi-ld/default-context/name` は正当な指定。
> - Entity member の `id` / `type` / `scope` は `AttrName` の形を満たすので従来どおり書ける。
> - **`LinkedEntityTerm` (波括弧) は `join` が無ければ `400 BadRequestData`**、
>   ネスト深さが `joinLevel` を超えても `400` (clause 5.7.1.4 / 5.7.2.4)。
>   **`join=inline` / `join=flat` と併用するとリンク先へ射影が適用される (#2291)** —
>   inline は `entity` / `entityList`（および keyValues の置換値）へ、flat は配列末尾の
>   リンク先エンティティへ、`{...}` 内の ProjectionTerm を再帰適用する。
>   `omit=observation{humidity}` のように LinkedEntityTerm 付きの omit は親の Relationship を
>   残し、リンク先から指定属性だけを外す（親名だけの `omit=observation` は従来どおり親から除去）。
>
> **`pick` / `omit` は Entity member (`id` / `type` / `scope`) にも効く (#2275)**: Table 6.4.3.2-1 /
> 6.5.3.1-1 は各値が Entity member であると定める。4.5.1 の「正規形 Entity は id/type 必須」は
> 射影の禁止ではない。単体取得で射影後に member が残らなければ `404 ResourceNotFound`
> (Query は `200`)。`omit` ∩ `attrs` は `400 BadRequestData`。

> **未知クエリパラメータは `400 InvalidRequest` (#2278。#1664 の逸脱を解消)**: ETSI GS CIM 009 - 6.3.20 は
> 「operation と両立しないパラメータ」に `400 InvalidRequest` を返すべき (should) としている。
> 従来 GeonicDB は `options` の**値** (トークン) だけを検証し、**未知のクエリパラメータ名**は
> silent に無視していた (#1664 時点の意図的逸脱)。#2278 でこれを解消し、
> `GET /entities` / `GET /temporal/entities` / `GET /types` / `GET /attributes` / `GET /subscriptions` は
> 許可集合に無いパラメータ名を `400 InvalidRequest` で弾く。
> **挙動変更**: `/types` / `/attributes` / `/subscriptions` の `?type=` は照合に使われず silent に無視されていたが、
> これらのオペレーションでは未定義のパラメータなので `400` になる。
> 許可集合は **当該リソースの ETSI Query parameters 表 ∪ GeonicDB 独自拡張** で、
> `localOnly` / `csf` / `spatialId` / `join` / `crs` / `pageToken` / `orderBy` / `orderDirection` /
> `orderByDistance` / `splitEntities` / `typePattern` / `spatialIdDepth` は引き続き受理される。
> 仕様が定義しているが GeonicDB が未実装のパラメータ (`containedBy` / `entityMap` 等) も
> 許可側に置く (operation と "incompatible" ではないため)。
> **MCP / A2A は対象外** — clause 6.3.20 は HTTP バインディングの規定であり、両者はその binding ではない。
>
> **「広すぎるクエリ」は `400 BadRequestData` (#2278 / #2290)**: clause 5.7.2.4 / 5.7.4.4 は
> `GET /entities` / `GET /temporal/entities` と、同じ操作の POST バインディング
> (`POST /entityOperations/query` = clause 6.23.3.1、`POST /temporal/entityOperations/query` = clause 6.24.3.1)
> について
> *"At least one of the following input data shall be provided: a) selector of Entity Types;
> b) list of Attribute names, including at least one non-system Attribute; c) NGSI-LD Query,
> including at least one non-system Attribute; d) NGSI-LD GeoQuery; e) local scope ...
> If none of the above is provided, then an error of type BadRequestData shall be raised (too wide query)."*
> と定める。**`id` / `idPattern` だけの指定は免除にならない** (clause 5.7.2.3)。
> POST では `type: "Query"` はリクエスト型の sentinel であり、Entity Type セレクタには数えない。
> 免除 (e) local scope は POST でもクエリパラメータ `local=true` (clause 6.3.18)。
> **破壊的変更**: 絞り込みの無い一覧 (`GET /entities`、`GET /entities?count=true`、
> `GET /entities?id=...`、`GET /temporal/entities` の id / timerel だけ、
> `POST /entityOperations/query` および `POST /temporal/entityOperations/query` の id だけの body) は `400 BadRequestData` になる。全件を取りたい場合は
> **`local=true`** (免除条件 e) を付けるか、`type=` / `entities[].type` / `attrs` / `q` / `geoQ` 等の絞り込みを指定する。

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

> **Reserved Core Context non-reified Property names (#2522 / #2538)**: ETSI GS CIM 009 clause 4.5.1 forbids using Core Context non-reified Properties as Attribute names. GeonicDB rejects (compact name or Core FQN `https://uri.etsi.org/ngsi-ld/<name>`, case-sensitive) on entity / batch / temporal write paths with `400 BadRequestData` (including MCP/A2A temporal tools): `createdAt` / `modifiedAt` / `deletedAt` / `expiresAt` / `observedAt` / `lastUsedAt` / `datasetId` / `instanceId` / `unitCode` / `valueType` / `lang` / `entityIdSealed` / `entityTypeSealed`. Entity-level `expiresAt` as an ISO 8601 TTL string remains allowed (clause 4.22). ISO string echoes of `createdAt` / `modifiedAt` / `deletedAt` / `expiresAt` from `options=sysAttrs` responses are ignored as system attributes (not treated as user Attributes). Near-miss names (`observed_at`, `ObservedAt`, `https://example.org/observedAt`, …) are accepted. **Attribute inner members** with the same tokens (e.g. Property `observedAt` / `unitCode` / `datasetId` / `valueType`) remain valid metadata and are not rejected. Existing entities that already store a reserved-name Attribute keep returning it on GET when system values are not requested; when `options=sysAttrs` (or entity-level `expiresAt`) emits a system value for the same key, the system value wins. `DELETE /entities/{id}/attrs/{reservedName}` and temporal attribute DELETE remain allowed so clients can clean up legacy Attributes.
>
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
>
> **Concise multi-attribute array elements are objects (#2573)**: ETSI GS CIM 009 clause 4.5.2.3 / 4.5.5 require multi-instance concise attributes to be a JSON-LD **array of objects**. GeonicDB therefore always renders each multi-attribute instance as an object in `GET ?options=concise` and concise notifications (e.g. default Property instance `{ "value": 42 }`, never bare `42`). The bare-value shortening of clause 4.5.2.3 first form still applies to **single-instance** attributes only. On write (`options=concise`), every array element is classified first: all attribute-shaped → multi-attribute (at most one default instance without `datasetId`); all plain → Property array value; **mixed → `400 BadRequestData`** (order-independent). Hand-written legacy shapes such as `[55, {"value":54,"datasetId":"..."}]` are rejected — rewrite as `[{"value":55},{"value":54,"datasetId":"..."}]`, or use `{"value":[...]}` when a Property array value is intended.
>
> **Foreign value members (#2525)**: A value-carrying member that does not belong to the declared attribute type (e.g. `object` / `languageMap` / `json` / `vocab` / `valueList` / `objectList` on a `Property`, or `value` on a `LanguageProperty`) is rejected with `400 BadRequestData` on every full-form **Entity API** write path (create / append / update attributes / replace entity / replace attribute / batch). This follows ETSI GS CIM 009 clause 4.5.2.2 (and the corresponding "shall never be present" lists for other attribute types) plus clause 5.5.4. Same-type output-only members such as `previousValue` remain ignored per Table 5.2.5-2 (they are not rejected). `vocabMap` on `VocabProperty` is accepted as a GeonicDB extension (Table 5.2.35-1 lists only `vocab`). **Temporal API write paths are not covered here** (they use a separate attribute-instance schema; see the Temporal section / tracking issue).
>
> **Foreign output-only members (#2533)**: A `previous*` / `entity` / `entityList` member that belongs to another attribute type (e.g. `previousObject` / `entity` on a `Property`, or `previousValue` on a `Relationship`) is likewise rejected with `400 BadRequestData` on Entity API write paths when sent under its **short name** (clause 4.5.2.2 Prohibited + clause 5.5.4), including **concise** input (same difference set as normalized). Same-type output-only members are **ignored** (Table 5.2.x-2 / clause 4.5.3.2 / 4.5.22.2): Property/GeoProperty/TemporalProperty `previousValue`, Relationship `previousObject`+`entity`, LanguageProperty `previousLanguageMap`, JsonProperty `previousJson`, VocabProperty `previousVocab` (and GeonicDB-extension `previousVocabMap`), ListProperty `previousValueList`, ListRelationship `previousObjectList`+`entityList`. Short-name attribute objects are not stored. Inputs that land on those names only after `@context` term expansion (inline alias or absolute IRI as the member key) may still be persisted in metadata, but **reads never return them** (normalized and concise) — this also applies to **pre-existing documents** that already stored those names as sub-attributes / metadata keys: there is **no migration and no warning**; such keys simply disappear from every retrieve/query response. That drop is intentional (it is the read-side half of the #2533 defence and also neutralizes legacy contamination). Write-side rejection of those alias/IRI forms (allowlist for legitimate NGSI-LD members such as `observedAt` / `unitCode` / `datasetId`) is tracked in #2572. **Temporal API write paths are not covered** (same exclusion as #2525). **MCP / A2A** use the same leaf difference set as HTTP (`listPresentForeignValueMembers`) and additionally reject any attribute object that presents two or more of `ALL_ATTRIBUTE_VALUE_MEMBERS` even when the declared `type` is unknown (#2532). Concise **array** (multi-attribute) form is covered by #2573 (HTTP); MCP/A2A array form remains #2570.
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
| `pick` | string | Attribute names to retrieve, in the **NGSI-LD Attribute Projection Language** (ETSI GS CIM 009 clause 4.21). Mutually exclusive with `omit` and `attrs`. Entity members `id` / `type` / `scope` may be listed. Syntax violations return `400 BadRequestData` (#2277) |
| `omit` | string | Attribute names (or Entity members `id` / `type` / `scope`) to exclude, same projection language as `pick`. Mutually exclusive with `pick` and `attrs`. The result may no longer be a valid NGSI-LD Entity (#2275) |
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

**Merge-Patch Semantics** (ETSI GS CIM 009 clause 5.6.17 / 5.5.12):

- Unmentioned attributes and attribute members are preserved. Merge is applied at arbitrary depth (not RFC 7396 object-level replace): `value` / `json` / `languageMap` objects are merged key-by-key, and metadata such as `unitCode` / `observedAt` / sub-attributes is kept unless named in the fragment.
- `urn:ngsi-ld:null` deletes that member. A LanguageProperty is deleted with `languageMap: { "@none": "urn:ngsi-ld:null" }`. Without `datasetId`, only the default instance is removed (clause 5.6.5.4). Setting `datasetId` itself to `urn:ngsi-ld:null` is `400 BadRequestData`.
- **`vocabMap` NGSI-LD Null (GeonicDB 独自拡張 / #2545)**: `vocabMap` itself is not in ETSI Table 5.2.35-1 (only `vocab` is). GeonicDB accepts `vocabMap` as a multi-lingual vocab value member. Whole-attribute Null uses the same map form as `languageMap` (clause 4.5.0 / 4.5.18 precedent): `vocabMap: { "@none": "urn:ngsi-ld:null" }`. On merge / partial update that form deletes the Attribute (clause 5.5.12 / 5.5.8 / 5.6.4). On create / append / replace it is rejected with `400 BadRequestData` (clause 5.5.4). A bare string `vocabMap: "urn:ngsi-ld:null"` remains schema-invalid (`z.record`). Entry-level `{ "en": "urn:ngsi-ld:null" }` is not whole-attribute Null (same boundary as `languageMap` entry merge).
- An empty entity id (`PATCH /ngsi-ld/v1/entities/` after path normalization) is `400 BadRequestData` (clause 5.6.17.4).
- If a custom data model is defined for the entity's type and a `required: true` attribute would disappear, this returns `400 Bad Request` instead (**GeonicDB extension**).
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

- **NGSI-LD Null deletes the Attribute** (#2419 / ETSI 012_05). Clause 5.6.4.4 requires the partial-update algorithm of **clause 5.5.8**, which deletes any Fragment member whose value is an NGSI-LD Null (and defers `datasetId` instances to **clause 5.6.5**). Sending e.g. `{ "type": "Property", "value": "urn:ngsi-ld:null" }` on `PATCH .../attrs/{attrName}` therefore removes that Attribute (or the selected instance) and returns `204`, the same outcome as `DELETE .../attrs/{attrName}`.

  > **Authorization note**: XACML actions are matched on the **HTTP method** (`method`). A policy that Permits `PATCH` and Denies only `DELETE` does **not** prevent attribute destruction — clients can still remove attributes with `PATCH` + NGSI-LD Null (and entity-level `PATCH .../attrs` can already call `removeAttributes`). To block deletion, Deny `PATCH` (and other write methods that accept Null) as well as `DELETE`.

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

> **Note (instance selection, clause 5.6.5.4)**: If `datasetId` is omitted, the operation targets the **default instance** — the instance that carries no `datasetId`. If the attribute has no default instance (every stored instance carries a `datasetId`), the request returns `404 ResourceNotFound`; delete such instances by passing their `datasetId`, or pass `deleteAll=true`. This holds regardless of whether the attribute is currently stored as an array of instances or as a single object: an attribute that has been reduced to one instance is unwrapped to a single object, and unwrapping does not turn a `datasetId`-carrying instance into the default one (#2177).
>
> **Note**: Deleting the **last remaining attribute** is allowed and returns `204`. NGSI-LD (ETSI GS CIM 009) does not require an entity to retain at least one attribute — an entity consisting solely of `id`/`type` is valid and remains after the deletion.

> **Note (GeonicDB extension)**: If a custom data model is defined for the entity's type and the attribute is marked `required: true`, this returns `400 Bad Request` — but only when the deletion would remove the attribute entirely (i.e. the last remaining multi-attribute instance, or a `deleteAll` request). Deleting one instance by `datasetId` while another instance remains returns `204` as usual. The same rule applies to deletion via merge patch `urn:ngsi-ld:null`. Attributes with `required: false`, and attributes on models with `isActive: false`, can still be deleted.

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

When retrieving an entity, matching instances are returned as an **array only when more than one instance matches** (ETSI GS CIM 009 clause 4.5.5.1). A single matching instance — including after a `?datasetId=` filter, or after an instance was deleted — is returned as a single Attribute element, not a one-element array (#2272).

In `keyValues` (simplified) format, a multi-attribute is returned as a **`dataset` map** keyed by `datasetId` **only when more than one instance matches**, with the default instance (the one without a `datasetId`) keyed by the JSON-LD keyword `@none` (ETSI GS CIM 009 clause 4.5.4 / 4.5.5.1, #1930 / #2272). A single matching instance stays a bare value.

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

The `@none` key is present only when a default instance exists. The same shape applies to `Relationship`, `ListProperty` and `ListRelationship` (clause 4.5.4 EXAMPLE 13 / 15 / 19). `normalized` and `concise` also collapse a single matching multi-attribute instance; arrays remain only for multiple matches. This is the Attribute-instance array (clause 4.5.5.1), not a `ListProperty` / `ListRelationship` value array.

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

When deleting an attribute, specifying the `datasetId` query parameter deletes only the specific instance. Specifying `deleteAll=true` deletes all instances. Omitting both targets the **default instance** (the one without a `datasetId`) and returns `404 ResourceNotFound` when there is none — see the note under [Delete Attribute](#delete-attribute) above.

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
- Created entities present: `201 Created` (body = array of **created** entity IDs only)
- All entities already existed and were updated: `204 No Content`
- Partial success / per-entity errors: `207 Multi-Status`

> **Note (#2420 / ETSI 5.2.16)**: A `207` body always includes the BatchResult members
> `success` (union of successfully created or updated IDs) and `errors`. GeonicDB **also**
> returns `created` and `updated` as an extension so clients can tell which IDs were new.
> Duplicate entity IDs in one payload are processed in array order by occurrence round
> (clause 5.5.11.2) — they do not produce a `207` by themselves.
>
> **Note (GeonicDB / #2420)**: Both default (merge) and `options=replace` modes are executed via
> bulk writes (duplicate IDs are split into rounds first). Invalid elements are reported as
> per-entity `207` errors (not a request-level `400`), matching clause 5.6.8 / #2069-style
> element attribution. In the default **update** mode, an existing entity's type list is
> **merged** with novel types from the payload (clause 5.6.8.4 → 5.6.2.4 / #2455; types are
> never deleted). In `options=replace`, the entity is **completely replaced** including
> `entityType` (clause 5.6.18.4); novel types require destination-type authorization
> (`requireAuthzForNovelTypes`). `scope` follows the 3-state semantics
> (`omitted`=keep, `null`/`[]`=unset, array=set).

#### Batch Update

```http
POST /ngsi-ld/v1/entityOperations/update
```

**Response**
- All successful: `204 No Content`
- Partial success: `207 Multi-Status`

> **Note (#2455)**: Payload `type` may be a string or a non-empty string array (Table 5.2.4). Novel Entity Types are appended per clause 5.6.9 → 5.6.2 / 5.6.3 (same semantics as `/attrs`).

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
| `id` / `idPattern` | string | Optional **refinements** (not sufficient alone — same contract as GET list / #2290) |
| `q` | string | NGSI-LD query selector |
| `georel` / `geometry` / `coordinates` / `geoproperty` / `geometryProperty` | string | Geo selector. On **this purge endpoint only**, `geometryProperty` is accepted as an alias of `geoproperty` (Table 6.4.3.3-1 lists both, but a purge has no GeoJSON response for a top-level `geometry` to select). On the GeoJSON-eligible read endpoints it is a **different** parameter — see [Retrieve Entity List](#retrieve-entity-list) (#2046) |
| `scopeQ` | string | Optional **refinement** (not sufficient alone — `scopeQ` alone → 400) |
| `attrs` | csv | Selector matching entities that have **any of** the listed attributes (OR, clause 5.6.21.4). Must include at least one **non-system** attribute name |
| `keep` | csv | Keep listed attributes and remove the others. Counts as an attribute-name selector (clause 5.6.21.4). Must include at least one **non-system** attribute name |
| `drop` | csv | Remove only listed attributes. Same selector / non-system rules as `keep` |
| `local` / `localOnly` | boolean | Local-only scope flag. `local=true` alone is allowed (clause 5.6.21.4 local scope); it is not an entity-match filter |

**Validation / guards**
- At least one of `type`, `attrs`, `keep`, `drop`, `q`, `georel` is required, **or** `local=true` (`id` / `idPattern` / `scopeQ` alone is rejected with 400)
- `attrs` / `keep` / `drop` must list at least one non-system attribute (`keep=createdAt` alone → 400). Shared helper with GET too-wide guard (`hasNonSystemAttribute`)
- `keep` and `drop` cannot be specified together; empty `keep=` / `drop=` is rejected with 400
- Unknown query parameters are rejected with `400 InvalidRequest`
- Attribute names in `attrs` / `keep` / `drop` are expanded against the request `@context`

> **Warning (`keep` / `drop` alone):** `keep` and `drop` are entity selectors, not merely attribute-mutation flags.  
> `DELETE /entities?keep=name` (no `type` / `id` / …) returns **204** and strips every attribute except `name` from **all entities in the tenant** that the caller is authorized to mutate (ETSI 5.6.21.4 bullet 2 / #2432).  
> The same blast radius was already reachable via `?type=*&keep=name` on `origin/main`. Prefer an explicit `type` / `q` / `id` refinement when you do not intend a tenant-wide attribute strip.

**Response**
- Success: `204 No Content`

> **Note:** GeonicDB は distributed operations (context source への purge 転送) を
> サポートしません。purge は常にローカルストレージに対して実行されます (`csf` は受理されますが
> 転送は行われません)。

> **GeonicDB 独自拡張 (後方互換):** `POST /ngsi-ld/v1/entityOperations/purge` も引き続き利用可能です。
> 絞り込みに使えるのは body の `type` / `q` / `geoQ` のみです。**`typePattern` を body に積むと
> `400 BadRequestData`** になります (#2156) — 黙って無視すると「パターンで絞ったつもりが `type`
> 全件を消す」ことになるため、破壊的操作では silent 無視ではなく loud 拒否に倒しています。
> MCP `batch` ツールの `purge` / A2A `batch` スキルの `purge` も同じく拒否します。
> この拡張ルートには `DELETE /entities` 相当の too-wide セレクタガードがありません（既存の非対称。#2432 では悪化させていません）。

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

> **Too wide query (#2290)**: this is the POST binding of Query Entities (clause 6.23.3.1 → 5.7.2.4). A body that only names `entities[].id` / `idPattern`, or only `type: "Query"`, is `400 BadRequestData` — the same contract as `GET /entities?id=...`. Add `entities[].type` / `attrs` (with a non-system attribute) / `q` / `geoQ`, or pass `?local=true`.

**Response**: Array of entities

> **GeoJSON output (#1783)**: ETSI GS CIM 009 clause 6.3.4 lists "Query Entity" (clause 5.7.2) — which this operation implements — among the GeoJSON-eligible operations. Negotiating `format=geojson` (query parameter) or `Accept: application/geo+json` returns a GeoJSON **FeatureCollection** with `Content-Type: application/geo+json`, in the **same shape** as `GET /ngsi-ld/v1/entities` (same `NgsiLdGeoJsonTransformer`, same pagination headers: `Link` / `NGSILD-Results-Count`). The `geometryProperty` parameter selects the top-level `geometry` here exactly as it does on `GET /entities` (#2046, see the note under [Retrieve Entity List](#retrieve-entity-list)). `splitEntities` (type-grouped nested arrays) cannot be represented as a FeatureCollection, so GeoJSON takes priority over it — the same precedence `GET /entities` already applies. As with the list and single-retrieval endpoints, `properties` keys and `properties.type` are compacted with the request `@context` (#1788 サブ項目 6, see the note under [Retrieve Entity List](#retrieve-entity-list) above).

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

> **DB timeout aborts the batch (#2542)**: If a database query timeout (`maxTimeMS` exceeded) occurs while processing an element of `create` / `upsert` / `delete`, the remaining **untried** elements are aborted and reported in the `207 Multi-Status` `errors` array with type `https://uri.etsi.org/ngsi-ld/errors/ServiceUnavailable` and a `detail` starting with `Not attempted:` — distinct from the `detail` of elements that actually timed out. The response is still `207`, even when nothing succeeded (no overall `503`). Entities listed in `success` are committed; **retry only the entity IDs listed in `errors`**. For `create` / `upsert`, temporal writes are append-only, so re-sending already-successful entities would duplicate their temporal instances; for `delete`, re-sending an already-deleted entity simply reports it as not found (no data is duplicated).

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

**Response**: `200 OK` when the full temporal representation fits in one response (no `lastN`, and the default per-attribute cap did not truncate). `206 Partial Content` with a `Content-Range` header when the client requested `lastN` or the default cap actually truncated the history (see [Partial Content (`206`) and `Content-Range`](#partial-content-206-and-content-range-clause-6310) below). Empty results and aggregated representations (`aggrMethods`) are also `200 OK`.

#### Temporal Query Parameters

The following query parameters can be used with temporal entity GET endpoints.

| Parameter | Type | Description |
|-----------|-----|------|
| `type` | string | Filter by entity type |
| `typePattern` | string | Regular expression pattern for entity type, evaluated **verbatim** (no implicit `*`→`.*` conversion, matching the `typePattern` discipline used elsewhere, e.g. csourceSubscriptions, #2105). Combining with `type` is an **AND** (both must match) — NGSI-LD design decision is `type`/`typePattern` combine as AND, unlike NGSIv2 where `type`/`typePattern` are mutually exclusive (#2105). **GeonicDB 独自拡張** (#2115) |
| `timerel` | string | Temporal relationship operator (`after`, `before`, `between`). Values outside these three are rejected with `400 BadRequestData`, at **every** entry point — single retrieval, list, `POST /temporal/entityOperations/query` and attribute delete (#2266) |
| `timeAt` | string | Reference time. **ISO 8601 is the recommended form** (clause 4.6.3); the broker accepts any value `Date` can parse, matching `TemporalService.validateTimeParameters`. Unparsable values, and values longer than `SECURITY.MAX_TIME_FIELD_LENGTH` (50), are rejected with `400 BadRequestData` at every entry point (#2310); until then the single-retrieval entry accepted an unparsable value and turned it into an `Invalid Date` comparison, surfacing as `404` |
| `endTimeAt` | string | End time (required when `timerel=between`). Same acceptance rule as `timeAt` (ISO 8601 recommended; actually accepted iff `Date` can parse it). **Format and length are validated only when `timerel=between`** — matching `TemporalService.validateTimeParameters`, so a stray `endTimeAt` on `before`/`after` is ignored rather than newly rejected (#2310); whether it is *required*, ordered after `timeAt`, and within the maximum span stays a per-operation rule |
| `timeproperty` | string | Temporal Property compared by `timerel` / `timeAt` / `endTimeAt` (ETSI GS CIM 009 Table 5.2.21-1 / clause 4.11): `observedAt` (default), `createdAt`, `modifiedAt`, `deletedAt`. Unknown values — including `expiresAt`, which is a Temporal Property in clause 4.8 but **not** in Table 5.2.21-1 — are `400 BadRequestData` at every entry point (GET list, GET by-id, POST query, attribute delete, MCP, A2A) (#2267). Instances that do not carry the selected property (e.g. `deletedAt` on a living instance) are **non-matching** (empty / 404); they are not a 400. **Non-default `timeproperty` (§ `deletedAt`) constrains the query to instances that convey that property** — a query with `timeproperty=deletedAt` (even without `timerel`) only returns instances carrying `deletedAt`, never living instances that merely lack it (clause 4.11 last sentence, #2434) |
| `lastN` | integer | Return only the latest N instances per attribute (1–1000; exceeding 1000 returns 400, ETSI GS CIM 009 Section 5.6.12) |
| `format` | string | Representation format (ETSI GS CIM 009 - 6.3.12). One of `temporalValues` (simplified temporal representation, clause 4.5.9) or `aggregatedValues` (aggregated representation, clause 4.5.19); `simplified` is accepted as a synonym of `temporalValues` (GeonicDB extension). **Unknown values are rejected with `400 InvalidRequest`** (#1814). `POST /temporal/entityOperations/query` supports the same values as the GET form (clause 6.24.3.1: *"The behaviour of this clause mirrors the one in clause 6.18.3.2"*, #1816). **When both `format` and `options` are present, `format` takes precedence** (6.3.12). |
| `options` | string | Deprecated alternative to `format` (6.3.12). `temporalValues` / `simplified`: Simplified temporal representation (`[value, timestamp]` pairs), `aggregatedValues`: Aggregation representation (**`aggrMethods` is required when `aggregatedValues` is specified via `options` or `format`**), `sysAttrs`: include system temporal attributes (see below, #1817). Unknown tokens are rejected with `400 InvalidRequest` (6.3.20). The raw value must not exceed **200 characters** or **12 comma-separated values**; exceeding either returns `400 InvalidRequest` (#2031) |
| `orderBy` | string | v1.9.1 Entity Ordering Language (see [Entity Ordering (orderBy)](#entity-ordering-orderby)). Combining with `aggrMethods` returns `400`; attribute-value sorting on encrypted tenants returns `400` (#1681) |
| `orderDirection` | string | Legacy sort direction — `asc` / `desc` only; other values return `400` (#1681) |
| `scopeQ` | string | Scope query (clause 4.19 / Table 6.18.3.2-1). **GET** `/temporal/entities` takes it as a **query parameter**; **POST** `/temporal/entityOperations/query` takes it as a **request-body** member (Table 5.2.23-1 / clause 6.24.3.1 mirrors 6.18.3.2). Filters temporal results by the **current** entity `scope` in the entities collection (#2597). Temporal attribute documents do not persist scope; deleted or temporal-only entities (no entities doc) are **non-matching** (fail-closed, same class as #1336). Invalid charset / term limits follow the same rules as entity `scopeQ` (#2583) → `400 BadRequestData`. Non-string `scopeQ` on POST body → `400 BadRequestData`. Authz-constrained subjects combine the readable filter and `scopeQ` in **one** entities distinct before the `AUTH.MAX_READABLE_ENTITY_IDS` cap (#2597 L1/L2). There is **no scope-specific Mongo index**; residual filtering is in-memory after the match stage — same class as entity-list `scopeQ`, not a new regression. **Behaviour change**: before #2597, `scopeQ` was accepted but silently ignored (full result set) |

**lastN Parameter**

Specifying `lastN` returns only the latest N instances of temporal data. Combined with `timerel`/`timeAt`, you can retrieve the latest N instances within a time range. The maximum is **1000** per attribute; a larger value returns `400`. The selected instances are returned **oldest-first** (clause 4.5.9 EXAMPLE / #2271 (c)) — `lastN` chooses the newest N, it does not reverse the array.

**Default instance cap (#1437 / #2360)**: To prevent unbounded memory use, when `lastN` is **not** specified the broker returns at most the **10** most recent instances per attribute. If a query is capped this way, the response carries an `NGSILD-Warning` (warn-code 199); narrow `timeAt`/`endTimeAt` or set an explicit `lastN` (≤1000) to retrieve more. An explicit `lastN` is honored as-is and does **not** produce a truncation warning.

**Time range span limit (GeonicDB 独自拡張)**: `timerel=between` on **list/query** read paths (`GET /temporal/entities`, `POST /temporal/entityOperations/query`) and on **aggregation** (including single-entity GET **with** `aggrMethods`) rejects a span longer than **732 days** (`TEMPORAL.MAX_TIMESPAN_DAYS`, = 366×2) with `400 BadRequestData`. This bounds scan windows (OWASP API4:2023). Response size is capped by `limit` / `lastN` on non-aggregated paths. **Aggregated list responses** (`aggrMethods` on `GET /temporal/entities` / `POST /temporal/entityOperations/query`) also apply **Entity-level** `limit` / `offset` (default page size 20; clause 5.5.9 / 5.7.4.4 / #2509) plus `AGGREGATION_MAX_TIME_MS`; period arrays inside each Entity are not truncated (clause 4.5.19). **Period-count hard caps (#2524 / #2555)**: non-zero `aggrPeriodDuration` rejects with **`403 TooManyResults`** when (1) any **merged** `(entityId, attributeName)` would exceed **`TEMPORAL.MAX_AGGR_PERIODS=1000`** periods, or (2) the **page-total** of periods across entities/attributes would exceed **`TEMPORAL.MAX_AGGR_PERIODS_TOTAL=20000`** (`DEFAULT_LIMIT × MAX_AGGR_PERIODS`). For **`timerel=between` and `timeproperty` omitted/`observedAt`**, the per-attribute upper bound is also checked before DB via `floor(window/duration)+1`. The data-driven `$group` probe always runs for non-zero duration (including `between`) and checks both per-attribute max and page total. Escape hatches: narrow with `attrs`, reduce `limit`, lengthen `aggrPeriodDuration`, or shift with `offset`. MongoDB `$group` cost of the probe itself is unchanged (follow-up #2556). Legitimate over-cap paths may scan twice (`maxTimeMS` budget ×2). `PT0S` / omitted duration stays a single period (#2109). Both the `Link` `total` parameter and `NGSILD-Results-Count` (when `count=true`) report the **total matching Entity count**, not the page length (clause 6.3.13). **Single-entity GET without `aggrMethods`** (`GET /temporal/entities/{id}`) and **attribute delete** (`DELETE /temporal/entities/{id}/attrs/{attr}`) do **not** apply the span limit (#2310 / #2312). Date validity, `timerel`/`timeAt` pairing, and `endTimeAt > timeAt` still apply on delete.

```bash
# Retrieve the latest 10 temporal data instances
curl "http://localhost:3000/ngsi-ld/v1/temporal/entities/urn:ngsi-ld:Sensor:001?lastN=10" \
  -H "Fiware-Service: myservice"
```

#### Pagination `Link` (`rel="next"` / `"prev"`

, clause 6.3.10)

List operations (`GET /entities`, `GET /temporal/entities`, `POST /entityOperations/query`, `POST /temporal/entityOperations/query`, and the other NGSI-LD collections) serialize next/prev page pointers as RFC 8288 link-values. Each pagination link-value includes `type` set **exactly** to the media type resulting from the original request (the negotiated `Content-Type`). JSON-LD `@context` links are a different contract and keep `type="application/ld+json"`.

```http
Link: <http://localhost:3000/ngsi-ld/v1/temporal/entities?limit=2&offset=2>; rel="next"; type="application/ld+json"
```

#### Partial Content (`206`) and `

Content-Range` (clause 6.3.10)

**Two layers (do not conflate them):**

1. **ETSI GS CIM 009 V1.9.1 clause 6.3.10** — implementations **shall** use `206 Partial Content`
   when they cannot return the full temporal representation at once. The `lastN` wording there
   is pagination **direction** under that case ("In this case"), not an unconditional
   "`lastN` present → 206" rule.
2. **GeonicDB A1 (#2343)** — this broker returns `206` with `Content-Range` when the client
   passed `lastN`, **or** when the default per-attribute cap actually truncated the history
   (`lastN` defaulting to 10). When neither is true, the response is `200 OK` with no
   `Content-Range`. Empty results and aggregated representations (`aggrMethods`) stay `200`
   even if `lastN` was set, because no instance timestamps exist to build `Content-Range`.

**Reproduction (A1, no truncation):** create a temporal entity with fewer than 10 instances
per attribute, then `GET /temporal/entities/{id}?lastN=10`. GeonicDB answers **`206`** with
`Content-Range` even though every stored instance fits in the response — because `lastN` was
present. Clause 6.3.10 alone would also allow `200` here (full representation returned at once).

> **ETSI suite note (#2506):** at pin `334dd6d0` the suite contradicts itself on that choice:
> `020_05_02` (lastN present, no truncation → expects **200**) vs `020_13_02` (lastN present,
> no truncation → expects **206**). GeonicDB keeps A1 (score-optimal against that pin) and
> records the disputed cases as `spec-ambiguous` in `geolonia/geonicdb-compliance`
> `triage.json`. Upstream:
> [ngsi-ld-test-suite#106](https://forge.etsi.org/rep/cim/ngsi-ld-test-suite/-/work_items/106).

Temporal reads — `GET /temporal/entities`, `GET /temporal/entities/{entityId}` and
`POST /temporal/entityOperations/query` — apply the A1 rule above.

```http
HTTP/1.1 206 Partial Content
Content-Range: date-time 2020-01-01T01:00:00.000Z-2020-01-01T04:00:00.000Z/*
```

Timestamps in the header are taken from the Temporal Property selected by `timeproperty` (default `observedAt`). A `timeproperty=createdAt` query therefore reports `createdAt` bounds, not `observedAt` (#2267).

The value is `date-time <range-start>-<range-end>/<size>`:

| Request | range-start | range-end | size |
|---|---|---|---|
| `lastN` present (paginates **backwards**) | `timeAt` for `timerel=before`, `endTimeAt` for `between`, otherwise the most recent timestamp in the response | least recent timestamp in the response | the requested `lastN` |
| `lastN` absent (paginates **forwards**) | `timeAt` for `timerel=after` / `between`, otherwise the least recent timestamp in the response | most recent timestamp in the response | `*` |

`200` is also returned when no `Content-Range` can be derived: the response carries no
instances at all, or it is an **aggregated** representation (`aggrMethods`, clause 4.5.19),
which reports aggregate values rather than instance timestamps.

`206` is a success status, so `fetch`'s `response.ok` and axios' default 2xx validation keep
working unchanged. Clients that compare `status === 200` must be updated.

> The `unit` token is `date-time`. Clause 6.3.10 prose spells it `DateTime`, but the ETSI
> conformance suite (`020_13` / `021_15` / `021_16`) asserts `date-time` with a
> case-sensitive comparison, and the suite is what decides conformance.


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

#### `observedAt` Representation Fidelity (#2271)

`observedAt` is returned in **exactly the string representation the client supplied on write**.
ETSI GS CIM 009 clause 4.6.3 makes the fractional-seconds component of a DateTime *optional*, so
`2020-09-01T12:03:00Z` and `2020-09-01T12:03:00.000Z` are both valid representations of the same
instant and the specification does not designate a canonical form. GeonicDB therefore does not
normalize one into the other: write `...:00Z` and you read back `...:00Z`; write `...:00.123456Z`
and you read back all six fractional digits.

Note that time-based filtering (`timerel` / `timeAt` / `endTimeAt`), ordering and `lastN` operate
on millisecond precision, since the instant is stored as a BSON `Date`. Only the *representation*
carries the original precision. Instances written before #2271 are returned in the canonical
`...ss.sssZ` form, because the original representation was not recorded.

#### Scope Temporal Evolution (#2434)

The `scope` Entity member (clause 4.18 — single value is a `string`, multiple values a JSON array)
is persisted into the temporal collection too, so the evolution of an entity's scope can be
retrieved via the Temporal API.

- **Temporal create / attribute append with `scope`** (`POST /temporal/entities`,
  `POST /temporal/entities/{id}/attrs`) stores the scope as a **single `Property` instance whose
  `value` is the scope array** (clause 4.5.7 EXAMPLE). The `observedAt` is the write time — scope is
  a point-in-time membership, not a series of observations, so no client `observedAt` is expected.
  Sending `scope: null` / `scope: []` records nothing.
- **`DELETE /entities/{id}/attrs/scope` (clause 5.6.5)** also records a **deletion instance**
  (tombstone): a `Property` with `value: []` and `deletedAt` set (clause 4.5.7). As with any other
  deletion instance, the normalized representation **omits `observedAt`** (the temporal reference is
  `deletedAt` itself) — matching ETSI `020_19`. In `temporalValues` form the pair is
  `[[], <deletedAt>]` (ETSI `020_20`).
- **`timeproperty=deletedAt`** returns only instances carrying `deletedAt` (see `timeproperty` row
  above), so a scope that was deleted is a **tombstone-only** result: `scope` holds `value: []` and
  `deletedAt`, and living attributes (like `fuelLevel`) are excluded because they convey no
  `deletedAt`.
- **Current-entity materialization (GeonicDB extension, A'-1)** — a temporal create whose body carries
  `scope` attempts to `create-if-absent` the current entity (so `GET /entities/{id}` and
  `DELETE /entities/{id}/attrs/scope` work right after). It creates the entity with **only** the
  `scope` member (no other attributes); if the entity already exists it is left untouched
  (`AlreadyExists` is silently skipped). Any other materialization failure **fails the write** —
  single create returns 4xx/5xx with no temporal history written; batch create / upsert and MCP
  `batch_create` / `batch_upsert` map the failing entity into `207` `errors[]` and skip that entity's
  temporal write (other entities continue). Silent skip of materialization failure is rejected
  (#2434 security-review): otherwise temporal history alone would remain and a later re-POST would
  hit temporal `AlreadyExists`, permanently blocking retries. A temporal create **without** `scope`
  does **not** materialize a current entity. Applies to HTTP by-id / batch create / batch upsert and
  MCP create / `batch_create` / `batch_upsert` (#2434 / #2758 / #2796 / #2814).

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

> **`POST /temporal/entityOperations/query` aggregates too (#1816)**: clause 6.24.3.1 states that
> this operation *"mirrors the one in clause 6.18.3.2"* (the GET form), so aggregation is supported
> with the same parameters and the same validation. The spec-defined place for the parameters is the
> request body's `temporalQ` object (`aggrMethods` / `aggrPeriodDuration`, Table 5.2.21-1); the query
> string is also accepted as a fallback (the shape the official CLI sends,
> geolonia/geonicdb-cli#188), with the body taking precedence. The `NGSILD-Warning` (warn-code 199)
> that #2030 used to emit here has been removed — the request is no longer ignored.

| Parameter | Type | Description |
|-----------|-----|------|
| `aggrMethods` | string | Aggregation methods (comma-separated): `totalCount`, `distinctCount`, `sum`, `avg`, `min`, `max`, `stddev`, `sumsq` |
| `aggrPeriodDuration` | string | ISO 8601 duration (e.g., `PT1H` for 1 hour). Optional (Table 5.2.21-1 cardinality 0..1). When omitted it defaults to `PT0S`, which is interpreted as a single period spanning the whole time range of the query. For a non-zero duration the first period starts at the attribute's **earliest observation**, not a calendar boundary (clause 4.5.19 / #2271 (d)) |

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
> **Note**: `aggrPeriodDuration` is optional. Omitting it (or passing `PT0S` / `P0D`) aggregates the whole time range of the query as a single period, per ETSI GS CIM 009 Table 5.2.21-1 and clause 4.5.19.1.
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
>
> **パス型名の解決 (#1736)**: `{typeName}` はリクエスト `@context`（`Link` ヘッダー）を基準に保存形 (canonical) へ解決してから照合されます (ETSI GS CIM 009 clause 5.5.7)。作成に使ったのと同じ `@context` の同じ短縮名を渡せば、保存形が FQN であっても一致します（一覧の `?type=` と同じ規律）。

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
>
> **属性の同一性 (#2002)**: `{attrName}` はリクエスト `@context` を基準に FQN へ展開し、**その FQN と一致する保存属性のみ**が集計されます (ETSI GS CIM 009 clause 5.5.7 / Table 5.2.28-1)。同じ保存名 (例: `temperature`) を持ちながら別の `@context` で書かれ別の FQN を持つ属性が同居していても、**書き込み時 `@context` を解決できる限り**混同されません（解決できない場合の例外は直下の #2070 を参照）。FQN 一致が無い場合のみ保存名の候補一致にフォールバックします（純 legacy テナントとの後方互換）。
>
> **到達不能な書き込み時 `@context` の扱い (#2070)**: 書き込み時 `@context` の解決は fail-soft (解決に失敗すると保存名をそのまま FQN とみなす) なので、解決の成否を区別しないと「本当に FQN が一致した」ものと「たまたま保存名が要求綴りと文字列一致しただけ」のものを取り違えます。`@context` を解決できなかった保存属性は、FQN 一致・候補名一致どちらの all-or-nothing 判定の母数にも含めず、**モードに関わらず常に候補名一致で集計へ merge**されます。これにより、同じ応答に確定した FQN 一致が別の保存属性で 1 件でもあるだけで、外部 `@context` が一時的に到達不能な寄与源が集計から丸ごと落ちる、という silent under-count を防いでいます。
>
> **この規律にはトレードオフがあります。** `@context` を解決できない以上、その寄与源が要求属性と同じ FQN へ展開されたのかは**決められません**（決めるための情報が存在しません）。したがって「解決できていれば**別の FQN** だった寄与源」も、保存名の綴りが要求名の候補と一致すれば merge されます。取れる選択は「常に merge する（一致したはずの寄与源を落とさない代わりに、別物だったはずが混ざる）」か「FQN モードでは除外する（別物だったはずを混ぜない代わりに、一致したはずを落とす = #2070 の症状そのもの）」の 2 つで、**どちらも到達性で応答が変わります**。GeonicDB は発見系の応答が「存在するものを列挙する」意味論であることから、取りこぼしを避ける前者を採っています。この境界の実挙動は `tests/e2e/features/ngsi-ld/attr-discovery-etsi-compliance.feature` の `@issue-2070-tradeoff` シナリオが両方向とも固定しています。
>
> **registration 側も同じ規律 (#2063)**: 応答の `typeNames` / `attributeTypes` には Context Source Registration 由来の寄与も含まれますが、こちらも同じ FQN の同一性で照合されます。registration の `propertyNames` / `relationshipNames` は verbatim 保存 + 登録時 `@context` (#1890) なので、**その登録の `@context` で展開した FQN** が要求 FQN と一致するものだけが寄与します。同じ綴りを宣言していても別 FQN へ展開される registration は混入せず、逆に**別の綴り (別 `@context` の別名) でも同じ FQN へ展開されれば寄与します**。FQN 一致が 1 件も無い場合のみ候補名一致へフォールバックします（ローカル属性側と同じフォールバック規律）。registration の `@context` を解決できない場合の扱いも、直上の「到達不能な書き込み時 `@context` の扱い (#2070)」とローカル属性側と同一です — 判定母数から外し、候補名一致で常に merge します。

**Error**: 404 (if the attribute does not exist)

---

### Subscriptions (NGSI-LD)

> **ETSI GS CIM 009 Reference**: Section 5.8 - Subscription Operations

#### Create Subscription

```http
POST /ngsi-ld/v1/subscriptions
Content-Type: application/ld+json
```

> **Entity selector wildcard**: `entities[].type` accepts `"*"` to request notifications for
> **all** entity types (ETSI GS CIM 009 Table 5.2.33-1, #2102). Only the exact string `"*"` is a
> wildcard. Other selector fields (`id` / `idPattern` / `typePattern`) still apply (AND).
> The same wildcard semantics applies to `/ngsi-ld/v1/csourceSubscriptions`, whose `entities` is
> the same `EntitySelector` (csource subscriptions reuse the `Subscription` type, Table 5.2.12-1;
> clause 5.12 distinguishes the subscription side `EntitySelector` from the registration side
> `EntityInfo`; #2149) — a `type: "*"` csource subscription fires on
> registration changes of any declared type, and its `typePattern` still narrows with AND.
>
> **Entity selector type validation (#2158 / #2171)**: `entities[].type` must be a valid
> **type selection string as per clause 4.17** — see below — or the exact wildcard `"*"`.
> Values such as `"**"`, `" *"` or `"*Sensor"` are rejected with `400 BadRequestData`; they are
> neither a valid selection string nor the wildcard, and before #2158 they were accepted and
> stored as a subscription that could never fire. The same rule applies to
> `/ngsi-ld/v1/csourceSubscriptions` (shared selector schema). NGSIv2 subscription selectors are
> validated with the stricter v2 type charset (#2124).
>
> **Entity Type Selection Language (clause 4.17, #2171)**: Table 5.2.33-1 refers to "a valid type
> selection string as per clause 4.17", which is a disjunction/conjunction grammar, not a single
> type name:
>
> ```abnf
> EntityTypes  = OrEntityType *(orOp OrEntityType)
> OrEntityType = "(" EntityType *(";" EntityType) ")" / EntityType
> andOp = ";"    orOp = "|" / ","
> ```
>
> `Building|House` and `Building,House` mean *Building **or** House*; `(Home;Vehicle)` means
> *Home **and** Vehicle*; `(Home;Vehicle)|Motorhome` combines both. GeonicDB parses the selection
> string, canonicalises **each terminal** with the request `@context` on write, compacts each
> terminal with the request `@context` in responses (clause 5.5.7, so `GET` returns what you
> wrote), and evaluates the expression in the subscription and csource-subscription matchers.
> Because a GeonicDB entity carries exactly one type, a conjunction of two **different** types is
> never satisfied; `(Home;Vehicle)|Motorhome` therefore fires only on `Motorhome`.
>
> Forms outside the ABNF are rejected with `400 BadRequestData`: a dangling or repeated operator
> (`Building|`, `Building,,House`), an unbalanced or nested group (`(Building`, `(Home;(A;B))`),
> an `andOp` outside a group (`Building;House`), and the wildcard mixed into an expression
> (`*|Building`).
>
> **Ambiguity with absolute IRIs**: clause 4.17 NOTE observes that `,` `;` `(` `)` are legal URI
> characters and only recommends short names. GeonicDB resolves this by **always reading the
> operators as structure** — so an absolute IRI containing `, ; ( )` cannot be written as a single
> Entity Type in a selector. Before #2171 the behaviour was split (`urn:a,urn:b` was accepted as a
> single type while `urn:a|urn:b` was rejected); use short names, as the specification recommends.
>
> **Authorization is evaluated per terminal** (#2268): a selection string is expanded into its
> terminals before the XACML request is built, and **every** terminal must be permitted
> (all-Permit, the same shape as batch operations #1325). Mixing a denied type into a
> disjunction (`SecretType|PublicType`) therefore does not bypass a
> `Deny(entityType == "SecretType")` rule. The same expansion applies to the stored-value path
> used by `PATCH` bodies that omit `entities` (#2005), and to the subscription read redaction
> (#2140) — a selector survives redaction only when **all** of its terminals may be read.
>
> **Terminal count limit** (#2285): a single selector may name at most **50 distinct Entity Types**
> (`SECURITY.MAX_TYPE_SELECTION_TERMINALS`); more is `400 BadRequestData`. The 256-character limit
> on `type` (`MAX_ENTITY_TYPE_LENGTH`) binds independently — with short names the terminal-count
> limit is the tighter of the two (50 two-to-three-character terminals fit in ~190 characters),
> while with long names the character limit is reached first. The limit exists because since #2268
> a selector produces one
> authorization target **per terminal**, and those targets are built eagerly, before the policy
> decision and before body validation runs. A request whose selectors would expand to more than
> `MAX_SUBSCRIPTION_ENTITIES x MAX_TYPE_SELECTION_TERMINALS` targets in total is likewise rejected
> with `400` rather than truncated — dropping targets from an all-Permit evaluation would loosen
> it. That total bound also applies to NGSIv2 subscriptions (which do not expand selectors at all),
> so `subject.entities` on the NGSIv2 API is now capped at `MAX_SUBSCRIPTION_ENTITIES` too — it
> previously had no limit, which would have left the acceptance layer and the pre-validation
> authorization layer disagreeing.
>
> **NGSIv2 subscriptions are excluded**: the selection language is an NGSI-LD notion, so a
> subscription created through the NGSIv2 API keeps exact-equality type matching (the same
> asymmetry as the `"*"` wildcard, #2102).
>
> Note that `POST /ngsi-ld/v1/temporal/entityOperations/query` uses a **different** schema, where
> `entities[].type` containing `*` is interpreted as a GeonicDB glob (a distinct, tested feature);
> that path is unaffected by this validation.
>
> **`notification.format`**: `normalized` (default) / `concise` / `keyValues`. `simplified` is
> accepted as the ETSI synonym of `keyValues` (Table 5.2.14.1-1, #2103) and is normalized to
> `keyValues` on intake (`GET` returns `keyValues`).

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

**Web Push Notification Example (#3014 — GeonicDB extension)**

HTTPS Push Service URLs cannot be distinguished from HTTP callbacks by URI scheme, so
`endpoint.webpush` (and optional write-time `protocol: "webpush"`) select Web Push delivery.
`uri` equals the browser `PushSubscription.toJSON().endpoint`. GET responses return
`endpoint.webpush` but **omit** `protocol` (same as MQTT). `keys.auth` is masked as `******`;
`keys.p256dh` is not. `csourceSubscriptions` reject `webpush` with `400`.

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "type": "Subscription",
  "entities": [{ "type": "Room" }],
  "watchedAttributes": ["temperature"],
  "notification": {
    "format": "normalized",
    "endpoint": {
      "uri": "https://fcm.googleapis.com/fcm/send/....",
      "protocol": "webpush",
      "webpush": {
        "keys": {
          "p256dh": "<87-char base64url>",
          "auth": "<22-char base64url>"
        },
        "urgency": "normal"
      }
    }
  }
}
```

> **`notification` is a closed structure (#2066).** ETSI GS CIM 009 Table 5.2.14-1
> (NotificationParams) enumerates its members exhaustively and does not include the NGSIv2-only
> `httpCustom` / `http` / `mqtt` (MQTT delivery is instead selected via the `mqtt://` /
> `mqtts://` scheme in `notification.endpoint.uri`, shown above). GeonicDB additionally accepts
> `endpoint.webpush` / `endpoint.protocol` as a documented extension (#3014). Any other member of
> `notification` outside that table returns `400 BadRequestData` on both create and `PATCH` (this applies to
> `/ngsi-ld/v1/csourceSubscriptions` as well, which reuses the same request schemas) — previously such
> members were silently stripped by Zod's default (strip) validation and the request succeeded
> with `201` / `204` while the value was dropped without a trace. The Subscription's **top-level**
> JSON-LD vocabulary extension is unaffected; only `notification` is closed.
>
> `join` / `joinLevel` (Table 5.2.14.1-1) are **applied to notification payloads** (#2104): `inline`
> embeds each Relationship's target as an `entity` / `entityList` member, `flat` appends the targets to
> the notification's `data` array, and `@none` (the default) resolves nothing. `joinLevel` defaults to `1`
> and is only meaningful together with `join`; the maximum is the same as for the query parameter (`5`)
> but the **handling of an over-maximum value differs**: the query parameter rejects it with `400`
> (a read either honours the requested depth or fails), whereas `notification.joinLevel` is **clamped**
> to the maximum — a subscription is a long-lived resource, and rejecting it at notification time would
> mean silently dropping deliveries for a value that was accepted at create time. Both members are persisted and returned by `GET /subscriptions{,/{id}}` — unset members are not
> materialized with their defaults. Linked entities in notifications are filtered by the **subscription
> creator's** row-level read predicate; if that predicate cannot be determined the join resolves to zero
> linked entities and the notification is still delivered (see [AUTH.md](../reference/auth.md)).
> The output-only members (`status`, `timesSent`, `timesFailed`, `lastNotification`, `lastFailure`,
> `lastSuccess`) are accepted and **ignored** if supplied on create/update, per clause 5.2.14.2
> ("implementations shall ignore them") — they are never rejected. On query/retrieve they are
> generated as part of the representation (clause 5.2.14.2 "shall generate") — in particular
> `timesFailed` is always present (`0` when there are no failed deliveries; internally the counter
> is stored as `timesFailure` and mapped to the ETSI name on output, #2103).

**Subscription Extension Fields**

| Field | Type | Description |
|-----------|-----|------|
| `cooldown` | integer | Minimum interval between notifications (seconds). Positive integers only. Will not re-notify within the specified number of seconds |
| `notificationTrigger` | string[] | Event types that trigger notifications. `entityCreated`, `entityUpdated`, `entityChanged`, `entityDeleted`, `attributeCreated`, `attributeUpdated`, `attributeDeleted`. `entityChanged` is only triggered when attribute values actually change (updates with the same value are ignored) |
| `showChanges` | boolean | If `true`, includes type-specific previous-members in notification attributes (`normalized` / `concise`): `previousValue` (Property/GeoProperty/TemporalProperty), `previousObject` (Relationship), `previousLanguageMap`, `previousVocab`/`previousVocabMap` (GeonicDB extension for `vocabMap` shape), `previousValueList`, `previousObjectList`, `previousJson`. `keyValues` cannot represent sub-attributes, so previous-members are omitted |
| `notification.onlyChangedAttrs` | boolean | If `true`, includes only attributes that have actually changed in the notification payload. Can be combined with `notification.attributes` |
| `notification.pick` | string[] | Unified NGSI-LD projection (ETSI GS CIM 009 clause 4.21): attribute names to **include** in the notification payload. Maps to the same internal include projection as `notification.attributes` / `attrs` |
| `notification.omit` | string[] | Unified NGSI-LD projection (ETSI GS CIM 009 clause 4.21): attribute names to **exclude** from the notification payload. Maps to the same internal exclude projection as `notification.exceptAttrs` |
| `jsonldContext` | string (dereferenceable URI) | JSON-LD `@context` URI used when sending notifications (ETSI GS CIM 009 Table 5.2.12-1). If omitted, the field **is initialized** with the `@context` applied to the subscription — at creation, or on a later `PATCH` that updates at least one subscription field, **regardless of which of those updatable members that `PATCH` carries** (#2029 / #2040). A `PATCH` carrying only `@context` updates nothing and is still rejected with `400 BadRequestData` — the initialization is applied **after** the empty-update guard, so declaring a vocabulary alone never turns an empty update into a success — falling back to the NGSI-LD core context when none carried one. Initialization happens **once**: an already-set value (explicit or initialized) is never overwritten by a later `PATCH`, and a `PATCH` declaring only the core context does not change it (clause 5.8.1.4: "the `jsonldContext` field shall be **initialized** with the `@context` applicable for the Subscription"). The initialized value is returned by `GET` (#2041). **When the applied `@context` is not already a single URI** (an array, or an inline object), GeonicDB stores it as an `ImplicitlyCreated` `@context` (clause 5.13.1) and initializes this field with that entry's dereferenceable self-hosted URL — the field is typed `String (Dereferenceable URI)`, so the array itself cannot be the value, and a broker that has to notify with `Content-Type: application/json` needs the array to live at a URL (#2250). The matching vocabulary used by the subscription's type selectors is **not** affected. It is delivered with every notification and compacts both the entity type and the attribute names in `data[]` (one resolved value drives all three; see "Notification `@context`" below) |
| `expiresAt` | string (ISO 8601) | Subscription expiration time |
| `autoDisabledAt` | string (ISO 8601) | **GeonicDB extension (#3080).** Present when the broker automatically set the subscription to `inactive` because delivery failures continued for `NOTIFICATION_AUTO_PAUSE_AFTER_MS` (default 1 hour) without a success. Cleared when the subscription is set back to `active` (`isActive: true`). Distinguishes broker auto-pause from a manual `isActive: false` pause. Rendered `status` is `paused` (ETSI Table 5.2.12-1) while stored status is `inactive` |

**Notification `@context`** (#1841 / #1788, ETSI GS CIM 009 clause 5.3.1 / 5.8.1.4 / 5.8.6)

*Which `@context` is used.* Two distinct things, with different accepted shapes:

| Source | Accepted shape |
|---|---|
| `jsonldContext` (explicit) | **a single dereferenceable URI string only** — a non-URI string, an inline object or an array is rejected with `400 BadRequestData` at create/update time (the field is typed `z.string()`, and non-URI strings are rejected by an explicit absolute-IRI check) |
| the subscription request `@context` (used when `jsonldContext` is omitted) | whatever a request `@context` may be: a URI, an **inline object**, or an **array** mixing both. A one-element URI array is folded to that URI (#2344). Other non-URI shapes are hosted as an `ImplicitlyCreated` `@context` and referenced by URL (#2250, clause 5.13.1) |
| neither present | the NGSI-LD core `@context` (clause 5.5.5) |

*How GeonicDB delivers it.* The context GeonicDB itself attaches is delivered **exactly once** —
never in the body and the `Link` header at the same time, since two sources would let receivers
disagree about the active `@context`:

| `notification.endpoint.accept` | Delivery |
|---|---|
| `application/ld+json` | `@context` member in the notification body |
| `application/json` (default) | `Link` header (`rel="http://www.w3.org/ns/json-ld#context"`) |
| `application/geo+json` | `@context` member in the body; `Link` header instead when `receiverInfo` carries `Prefer: body=json` (clause 6.3.8, #1762) |
| MQTT endpoints | `@context` member in the body (MQTT has no headers) |
| `httpCustom` (`payload` / `json`) | neither — the body is defined entirely by the user |

**`accept: application/geo+json` (#1762).** Clause 5.2.15 lists it as one of the three `accept`
values and clause 6.3.8 covers it in the notification binding, so the **body is rendered as GeoJSON**
rather than merely labelled with the media type: a `FeatureCollection` whose `features[]` are the
notified entities, with `subscriptionId` / `notifiedAt` / `triggerReason` retained as RFC 7946 §6.1
foreign members. The Notification members `id` and `type: "Notification"` are omitted (GeoJSON
reserves `type`), and `notification.format` does not apply — `properties` carries simplified values,
so `showChanges` `previous*` members are unavailable in this representation. See
[SUBSCRIPTIONS.md → GeoJSON notifications](../features/ngsi-subscriptions.md) for the full payload.

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

**Periodic notifications (`timeInterval`)** (#1764)

- A subscription with `timeInterval` is notified **periodically**, whether or not any attribute changed (ETSI GS CIM 009 clause 5.8). Each notification carries the entity set that matches the subscription **at that moment**.
- Such a subscription is **periodic-only**: entity changes do not trigger it. This is why `watchedAttributes` and `timeInterval` are mutually exclusive.
- The first notification is sent one `timeInterval` after the subscription is created, not at creation time.
- `timeInterval` is persisted and returned by `GET /subscriptions/{id}`.
- Each periodic notification carries at most 100 entities (`PERIODIC_NOTIFICATION.MAX_ENTITIES_PER_NOTIFICATION`). Periodic notifications have no client-supplied `limit`, so the result size is bounded server-side.
- **Runtime granularity differs.** In standalone mode the sweep runs every second, so short intervals are honoured. On AWS Lambda the sweep is driven by an EventBridge Schedule whose **minimum granularity is one minute**, so a `timeInterval` below 60 is effectively 60 seconds there.
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

> **Row-level read authorization (#2140):** for a subject restricted by a row-level read predicate (custom XACML policy), subscription reads (`GET /ngsi-ld/v1/subscriptions(/{subscriptionId})`, `GET /ngsi-ld/v1/csourceSubscriptions(/{subscriptionId})`) redact unreadable concrete type selectors from `entities`, hide subscriptions that watch only unreadable types (list omission / `404` on by-id reads) and compute `count` / pagination after redaction — the same rule as CSR reads (#2084). Type-agnostic subscriptions (`watchedAttributes`-only, `type: "*"`, `id`/`idPattern`/`typePattern`-only selectors) are unaffected. Unrestricted subjects see no change. See [AUTH.md](../reference/auth.md) (#2140).

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
| `notification.timesFailed` | integer | Number of failed notification deliveries; always generated, `0` when there are no failures (clause 5.2.14.2, #2103) |

> **Entity selectors round-trip in stored form (#2067).** `GET` returns each `entities[]` element
> using whichever selector was actually stored — `id` / `idPattern` / `type` / `typePattern` —
> instead of collapsing `typePattern` into `type` or fabricating `type: "*"` when no type selector
> was given. Re-`POST`ing the retrieved body reproduces the original selector; previously a
> `typePattern` such as `^Sensor` was rendered as `type: "^Sensor"`, so replaying the response
> created a literal type name instead of a pattern selector (`typePattern` is a **GeonicDB
> extension** — see [SUBSCRIPTIONS.md → Entity Specification](../features/ngsi-subscriptions.md#entity-specification)).
> The same fix omits `notification.endpoint.accept` / `receiverInfo` from the response when no
> value was stored, rather than rendering them as `null` — a stored `null` sent back verbatim on a
> `PATCH` previously failed with `400` because `accept` only accepts one of its enum values or
> absence, not `null`.

**Retry Behavior**: When notification delivery fails, up to 3 retries are performed with exponential backoff (1 second, 2 seconds, 4 seconds) for transient errors (5xx, 429, network errors). Retries are not performed for most 4xx errors (408/429 are treated as transient). If transient failures continue for `NOTIFICATION_AUTO_PAUSE_AFTER_MS` (default 1 hour) without a successful delivery, the broker sets the subscription to `inactive`, records `autoDisabledAt`, stops matching/enqueue, and consumes the current SQS message (#3080). Resume with `PATCH { "isActive": true }`.

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

While authentication is enabled (the default), subscription update (PATCH) and delete (DELETE) operations perform ownership verification based on the `createdBy` field. Users other than the creator who attempt these operations will receive `404 Not Found` (as is the case when the subscription does not exist at all, so the difference cannot be observed from outside); subscriptions with **no** `createdBy` (created before that field existed) also return `404 Not Found` to non-admins (#2161). The `super_admin` and `tenant_admin` roles can bypass this verification. For details, see [AUTH.md](../reference/auth.md).

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
    "startAt": "2020-01-01T00:00:00Z",
    "endAt": "2030-12-31T23:59:59Z"
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
| `observationInterval` | object | - | Observation interval — `{ "startAt": ISO8601, "endAt"?: ISO8601 }` (ETSI GS CIM 009 clause 5.2.11). The legacy GeonicDB member names `start` / `end` are still accepted on write and normalized to `startAt` / `endAt`, but responses always use the spec names (#2274) |
| `managementInterval` | object | - | Management interval — same shape as `observationInterval` |
| `location` | GeoJSON | - | Geographic scope |
| `scope` | string or string[] | - | Registration scope hierarchy (ETSI GS CIM 009 Table 5.2.9-1 / clause 4.18). Single value is returned as a string; multiple values as a JSON array. Sending `scope: null` or `scope: []` explicitly unsets the scope (**GeonicDB extension**, same as entities) |
| `expiresAt` | string | - | Expiration time (ISO 8601 format) |
| `status` | string | - | **GeonicDB extension.** Lifecycle flag (`active` / `inactive`); `inactive` registrations are excluded from federation forwarding and from type/attribute discovery. Defaults to `active`. Note that ETSI GS CIM 009 Table 5.2.9-2 reserves `status` for a read-only distributed-operation health value (`ok` / `failed`), so the response only carries this member when it is `inactive` (#2274) |
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
| `q` | string | Simple property equality against Context Source Properties: `name==value` (quoted forms `name=="value"` / `name=='value'` are also accepted). Compound expressions — inequality operators (`!=`, `>`, …), `;` (AND), `\|` (OR), parentheses — are **not** supported and return `400 BadRequestData`, as do syntactically invalid values (clause 5.10.2.4). The property name must match `[A-Za-z_][\w]*` and the value is a single string / number literal (see the `q` note below) | - |
| `georel` / `geometry` / `coordinates` / `geoproperty` | string | NGSI-LD geoquery (clause 4.10). `georel`, `geometry` and `coordinates` must be supplied together; invalid values return `400 BadRequestData` | - |
| `scopeQ` | string | Scope query against the registration's `scope` member (clause 4.19 / 5.10.2). Same operators as entity `scopeQ` (`/#`, `/+`, `;` AND, `,`/`\|` OR). Requires another selector (`type`, `attrs`, `q`, geoquery, or `id`) — `scopeQ` alone is not sufficient (too-wide query) | - |
| `timerel` / `timeAt` / `endTimeAt` / `timeproperty` | string | NGSI-LD temporal query (clause 4.11). See the temporal scoping note below | - |
| `options` | string | `sysAttrs` to include `createdAt` / `modifiedAt` in the response (clause 6.3.11) | - |
| `limit` | integer | Number of results to retrieve | 20 |
| `offset` | integer | Offset | 0 |
| `count` | string | `true` to return the total count in `NGSILD-Results-Count` | - |

> **Too wide query (#2304 / #2442).** ETSI GS CIM 009 clause 5.10.2.4 mandates `400 BadRequestData` when none of `id` / `type` / `attrs` / `q` / a geoquery (`georel` / `geometry` / `coordinates`) is provided. `limit` / `offset` / `count` / a temporal query / `local=true` alone are **not** enough (unlike Query Entities, CSR discovery has no local-scope exemption). A concrete `id` list is enough (ETSI 037_10_01; earlier #2304 wording treated `id` as insufficient and was corrected in #2442). Unlike clause 5.7.2.4, `attrs` / `q` do **not** need a non-system attribute.
>
> **`q` is simple equality only (#2442 / #2627).** On CSR discovery, `q` conditions match **Context Source Properties** — the registration document's additional top-level members — not entity attributes (ETSI GS CIM 009 clause 5.10.2.4: "the conditions specified by the context source query filter match the respective Context Source Properties"). Only the simple equality form `name==value` is implemented; inequality operators, `;` (AND), `|` (OR) and parenthesised compound expressions are rejected with `400 BadRequestData` — at the entry validation with the same contract as execution, so an accepted expression is never refused later. This is deliberate: under the pinned ETSI suite (`334dd6d0`) CSR discovery exercises `q` with exactly two cases — `037_10_02` (`csourceProperty1=="aValue"`, simple equality) and `037_03_02` (syntactically invalid → 400) — and both pass. The full clause 4.9 grammar would cost the same as the entity `q` implementation, whose parser is coupled to the entity storage shape (`attributes.<name>.value` dot-paths, datasetId alias sets) and does not transfer to registration properties. Revisit when the suite requires compound expressions, or when the separate `csf` parameter (Table 6.8.3.2-1; unimplemented here) is taken up.
>
> **`q` value grammar is narrow (#2442 / #2627).** The property name must match `[A-Za-z_][\w]*` (ASCII word characters only — `foo:bar`, dotted, hyphenated, Unicode or otherwise non-`\w` names are not matched). The value is a single scalar: an unquoted run without whitespace / `()` / `;` / `|` / `&`, or a quoted `"..."` / `'...'` string. Matching is string-equality; a value that lexes as a number also matches a numerically-stored property (`buildRegistrationPropertyQueryFilter` adds a `Number` candidate). Booleans match only as literal strings; object / array Context Source Properties cannot be targeted.
>
> **Empty / whitespace-only `q` is treated as absent (#2442 / #2304).** `listRegistrations` builds the `q` filter only when `q.trim().length > 0`, so both `q=` and a `q` containing only spaces are not selectors: `q=` alone returns `400 BadRequestData` (too-wide query, clause 5.10.2.4 — no selector is left), while `type=Building&q=` returns `200` and applies only the `type` filter. The existing E2E guards this ("空 / 空白の type・attrs・q はセレクタとして数えない").
>
> **Geoquery Polygon rings (#2442 / ETSI 037_07_02).** On `GET /csourceRegistrations` only, a single-ring Polygon whose first/last coordinates differ is treated as closed (the first vertex is appended) before the geo filter runs. Entity / subscription geoqueries still reject unclosed rings with `400 BadRequestData` — the relaxation is scoped to CSR discovery to match the ETSI suite payloads.
>
> **Temporal scoping (#2274).** Per clause 5.10.2.4, when **no** temporal query is present only registrations **without** `observationInterval` / `managementInterval` are considered. When a temporal query is present, only registrations whose relevant interval **overlaps** the queried period are returned: `timeproperty=observedAt` (the default) matches `observationInterval`, and `timeproperty=createdAt` / `modifiedAt` / `deletedAt` matches `managementInterval`. A registration without the relevant interval never matches. Interval endpoints are inclusive, and a missing `endAt` means the interval is open-ended.
>
> **System attributes (#2274).** `createdAt` / `modifiedAt` are returned only when `options=sysAttrs` is supplied (clause 6.3.11). Unknown `options` tokens are rejected with `400 InvalidRequest` (clause 6.3.20).
>
> **`type` と `attrs` は AND で組み合わされる (#1892)。** 両方を指定すると「その型を提供し、**かつ** その属性を提供する」登録だけが返る (以前は OR だった)。`id` も他の条件と AND。
>
> **`@context` による term ⇄ URI 変換 (#1800 / #1890)。** ETSI GS CIM 009 clause 5.5.7 に従い、`type` / `attrs` はリクエストの `@context` (`Link` ヘッダ) で展開してから照合し、応答の `information[].entities[].type` / `propertyNames` / `relationshipNames` はリクエストの `@context` で compact して返す。したがって登録時と別の `@context` を使っても、同じ URI を指す term でヒットし、その `@context` の語彙で返る。完全修飾 URI での照会も可能。
>
> 属性名の照合インデックスは **登録時の表記と展開後の URI の両方**を保持する。federation の転送マッチ (`findMatchingRegistrations`) 側の展開は #1899 (PR #1996) で実装済みで、別 `@context` の同義 term でもヒットする。両持ちは登録済みデータの後方互換のために維持する。
>
> **転送先の照合で `type` を省略した場合 (#1994)。** `GET /ngsi-ld/v1/entities/{id}`（かつローカルに当該エンティティが存在しない）や一覧クエリで `type` を指定しないとき、照合する型は**未確定**として扱われ、**型で絞らずに全 active 登録が転送候補**になる。
>
> **制限付き principal も同じ候補集合を得る (#2003)。** 以前は「行レベルの読み取り述語 (`readableEntityFilter`) を持つ制限付き principal では従来の保守的な照合を維持する」という例外があった — リモートエンティティがこの述語を通らず、候補集合を広げると読めないはずの型のエンティティが混ざりうるためである。#2003 でリモート結果にも同じ述語を適用するようになったため、この例外は撤去された。制限付き principal でも通常どおりの照合が行われ、返ったエンティティのうち述語が許さない行は応答に載らない。**ただし照合後に、読めない型しか宣言していない登録は転送候補から外れる** — 転送してしまうと、プロバイダー障害時の `NGSILD-Warning: 199` に載る `endpoint` / registration id や、`exclusive` 登録に対する Via ループ検出の 508 から、その登録の存在が観測できてしまうため。型を宣言しない登録 (`entities` 省略 / `'*'`) は型情報を持たないので従来どおり転送される。`ContextSourceRegistration` に保存される `'*'` は「**登録側**が任意の型を受け付ける」ことを表す値であり、「照合側の型が未確定」を意味しない — 両者を同一視すると、`entities` を省略した登録にしか当たらず、`entities: [{"type": "Sensor"}]` のように**型を宣言した登録へは一度も転送されない**。`type` はオプション (clause 5.7.1 / 5.7.2 — 一覧クエリは `attrs` / `q` / `georel` だけでも成立する) なので、省略できることが前提となる。`type` を明示した場合の絞り込みは従来どおり効く。

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
    ]
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

> **Partial update (#2442 / clause 5.5.8 / 5.9.3.4).** The body is a Context Source Registration Fragment: members named in the fragment are updated or added; members omitted from the fragment are preserved. Context Source Properties (additional top-level members beyond Table 5.2.9-1) follow the same rule — a PATCH that sends only `csourceProperty1` does **not** delete other stored properties. `expiresAt` is the canonical expiration member; the legacy alias `expires` is also accepted on create/update.

#### Delete Registration

```http
DELETE /ngsi-ld/v1/csourceRegistrations/{registrationId}
```

**Response**: `204 No Content`

#### Ownership Verification (GeonicDB Extension)

While authentication is enabled (the default), registration update (PATCH) and delete (DELETE) operations perform ownership verification based on the `createdBy` field. Users other than the creator who attempt these operations will receive `404 Not Found` (as is the case when the registration does not exist at all, so the difference cannot be observed from outside); registrations with **no** `createdBy` (created before that field existed) also return `404 Not Found` to non-admins (#2161). The `super_admin` and `tenant_admin` roles can bypass this verification. For details, see [AUTH.md](../reference/auth.md).

#### CSR Advanced Fields (ETSI GS CIM 009 V1.9.1)

The following advanced fields are supported for Context Source Registration:

| Field | Type | Description |
|-----------|-----|------|
| `cacheDuration` | string (ISO 8601 duration) | Cache duration for responses from the context source |
| `refreshRate` | string (ISO 8601 duration) | Interval for periodic refresh to the context source |
| `timeout` | integer (ms) | Request timeout to the context source. Only returned when it was explicitly set (#2274) |
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
| `contextSourceExtras` | object | **Implementation-specific configuration data** (`name` / `description` / `endpoint` / `supportedApi` / `supportedOperations` / `registrationMode` / `version`). Table 5.2.40-1 defines this member as "raw un-expandable JSON which shall not be interpreted as JSON-LD using the supplied @context" — the core `@context` declares it as `@type: @json` |

> **Breaking change (#1798)**: these implementation-specific members were previously returned at the **top level**. They now live under `contextSourceExtras`. The top level is exactly the Table 5.2.40-1 member set. The old placement produced semantically wrong triples under the core `@context` v1.9 — `endpoint` expanded to `ngsi-ld:endpoint` (the term for a **CSourceRegistration** endpoint) and `description` to `dcterms:description`.

Response example:

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.9.jsonld",
  "id": "urn:ngsi-ld:ContextSourceIdentity:geonicdb-staging",
  "type": "ContextSourceIdentity",
  "contextSourceAlias": "geonicdb-staging",
  "contextSourceUptime": "PT2H3M4S",
  "contextSourceTimeAt": "2026-08-05T12:34:56.789Z",
  "contextSourceExtras": {
    "name": "GeonicDB",
    "description": "FIWARE Orion-compatible Context Broker running on AWS Lambda. Supports NGSIv2 and NGSI-LD APIs for IoT/smart city context data management.",
    "endpoint": "https://geonicdb.geolonia.com",
    "supportedApi": ["ngsi-ld-v1", "ngsiv2"],
    "supportedOperations": ["federationOps", "retrieveOps", "updateOps", "redirectionOps"],
    "registrationMode": ["inclusive", "exclusive", "redirect", "auxiliary"],
    "version": "0.16.0"
  }
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
>
> **Non-HTTP entrypoints invert the default (#2072)**: MCP tools and A2A skills do *not* forward to
> Context Sources unless `local="false"` is passed explicitly, and only on their query actions
> (`entities` list / search_by_location / search_by_attribute, `batch` query). `local` is defined for
> the HTTP binding, so a local-only default on a non-HTTP surface is not a compliance deviation; both
> surfaces are synchronous request/response and forwarding would expose AI clients to provider
> round-trip latency they did not ask for. By-id retrieval stays local-only there — #2092 closed the
> authorization hole on the HTTP by-id path (remote-only entities now pass the row-level read
> predicate), so forwarding by-id from MCP / A2A is no longer blocked on it, but remains unimplemented.
> See `docs/AI_INTEGRATION.md`.

#### Distributed Operation Response Headers

| Header | Description |
|----------|------|
| `NGSILD-Warning` | Warning message set when some context sources fail during federation (ETSI GS CIM 009 - 6.3.6), or when forwarding was skipped due to loop detection (6.3.17/6.3.18, warn-code 199) |
| `Via` | Loop detection header for distributed operations (ETSI GS CIM 009 - 6.3.18 / RFC 7230). The broker appends its own pseudonym as `1.1 <BROKER_ID>` to forwarded requests |

#### Write Forwarding (#1709)

読み取りだけでなく、**NGSI-LD の書き込みも一致する Context Source Registration へ転送される**
(ETSI GS CIM 009 - 6.3.x)。対象は次の 5 経路:

| 操作 | 転送先 |
|---|---|
| `POST /ngsi-ld/v1/entities` | `POST {apiRoot}/ngsi-ld/v1/entities` |
| `PUT /ngsi-ld/v1/entities/{entityId}` | `PUT {apiRoot}/ngsi-ld/v1/entities/{entityId}` |
| `PATCH /ngsi-ld/v1/entities/{entityId}/attrs` | `PATCH {apiRoot}/ngsi-ld/v1/entities/{entityId}/attrs` |
| `DELETE /ngsi-ld/v1/entities/{entityId}` | `DELETE {apiRoot}/ngsi-ld/v1/entities/{entityId}` |
| `DELETE /ngsi-ld/v1/entities/{entityId}/attrs/{attrId}` | `DELETE {apiRoot}/ngsi-ld/v1/entities/{entityId}/attrs/{attrId}` |

属性削除の**インスタンス選択条件** (`?datasetId=` / `?deleteAll=true`、ETSI GS CIM 009 clause 5.6.5.4) は
転送先のクエリにもそのまま載る。落とすと「ローカルは指定インスタンス・転送先は既定インスタンス」を
消す silent な分岐になるため (どちらも 204 を返すのでクライアントからは観測できない)。
redirect モードで返す `redirectUrl` にも同じ条件を保つ。**NGSI-LD の登録にだけ載せる** — `datasetId` / `deleteAll` は多重属性 (clause 4.5.5) の概念で NGSIv2 には存在しないため。

**転送するのはこの 5 経路だけ** (#2072 と同じ opt-in 規律)。`EntityService` の書き込みメソッドは
NGSIv2 の単体書き込み・NGSI-LD の batch (`entityOperations/*`) / merge patch (`PATCH /entities/{id}`) /
append からも呼ばれるが、それらは**従来どおりローカルのみ**で Context Source へは転送しない。
「どの入口が転送しうるか」を呼び出し側のコードから静的に読める状態に保つための設計であり、
配線範囲を広げるときは `Via` 伝播・`NGSILD-Warning` 配線・回帰 E2E をセットで足すこと
(#2448 で POST create / PUT replace を追加した際もこの規律に従った)。

> **#2448 の scope 限定:** `PUT /entities/{entityId}` (Replace Entity) の転送は、ローカルに
> 既存の複製が**ある**場合にのみ動く。update/delete が持つ「ローカル複製が無くても exclusive /
> redirect registration があれば転送する」(下記 #2195) の対称は replace には**まだ実装していない**
> — Replace はローカル存在確認 (`repository.get`) が先に走り、無ければ 404 になる。

登録モードごとの扱いは読み取りと同じ規約に揃えてある:

- **inclusive**: ローカルと Context Source の**両方**に適用する
- **exclusive**: Context Source にのみ適用し、**ローカルは書き換えない** (データは外部にしか無い)
- **redirect**: 適用せず、`redirectUrl` を添えた `404` を返す (読み取り側と同じ運び方)
- **auxiliary**: ローカルのみ (auxiliary は読み取り専用)

転送リクエストには読み取りと同じ `Via` ヘッダ (`1.1 <BROKER_ID>`) が付き、ループ検出も
同じ規約で効く (下記)。

**転送先の失敗は握り潰さない:**

- **inclusive** (ローカルにも書く) — 部分成功なので `NGSILD-Warning: 199 - "Context Source
  {endpoint} (registration: {id}) responded with error: ..."` を付けて返す。書式は読み取り側の
  `failedProviders` 由来の 199 と同一
- **exclusive** (ローカルを書かない) で **1 つも成功しなかった場合は `502 ContextProviderError`** を返す (エラー応答なので詳細は ProblemDetails に載る。`NGSILD-Warning` は付かない)。
  ローカルを書き換えていない以上その書き込みはどこにも適用されておらず、204 を返すと
  「削除したはずのデータがローカルに残り続け、登録を外した瞬間に再び読める」状態になるため
  (読み取り側 exclusive の `failOnProviderError` と同じ判断)

> **#2195:** exclusive / redirect registration が一致すれば、ローカル複製が無くても
> Context Source へ書き込みを転送する (読み取り側 `getEntity` と同じ構造)。
> inclusive のみ・registration 無しのローカル不在は従来どおり `404`。

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

> **Row-level read authorization applies to registration-derived contributions too (#2079).** For a subject restricted by a row-level read predicate (custom XACML policy, see [AUTH.md](../reference/auth.md#policy-to-filter-query-rewriting-for-list-queries-1337--1369)), a registration's declared type/attribute names only contribute to the response if the declared type may plausibly be readable — a registration cannot be used to learn the existence or attribute names of a type the subject has no read access to. `/types/{typeName}` and `/attributes/{attrId}` fall through to `404` when the only matching contribution is a registration declaring an unreadable type. A registration that declares **no** entity type (omitted `entities`, `type: "*"`, or an `id`/`idPattern`-only selector — the wildcard form of #1594) carries no type information, so it still contributes its attribute names; only the `typeNames` it supplies are narrowed to readable types. Unrestricted subjects (the default `user` / `tenant_admin` / `super_admin` roles) see no change.
>
> **Reading CSR documents themselves is redacted by the same predicate (#2084).** `GET /ngsi-ld/v1/csourceRegistrations` and `GET /ngsi-ld/v1/csourceRegistrations/{registrationId}` drop unreadable concrete type selectors from `information[].entities[]`, drop information entries that declare only unreadable types, omit fully-redacted documents from lists (with `count` and pagination computed after redaction) and return `404` for them on by-id reads. `?type=` / `?attrs=` are re-matched against the redacted documents, so a registration matched only via an unreadable type selector does not appear at all. Type-agnostic registrations (omitted `entities`, `type: "*"`, `id`/`idPattern`-only selectors) carry no type information and are unaffected. Unrestricted subjects see no change. See [AUTH.md](../reference/auth.md) (#2084) for the full rule.
>
> **Registration type selectors are canonicalized where the discovery endpoints read them (#2086).** The predicate above compares the **stored** type name against the XACML matcher value by exact string equality. NGSI-LD registrations are stored canonicalized at write time (`normalizeTypeName`, #1700), but **NGSIv2 registrations (`POST`/`PATCH /v2/registrations`) store `dataProvided.entities[].type` verbatim** — NGSIv2 has no active `@context`, so it has no expansion rule. Since registrations are visible across protocols, a type registered from NGSIv2 as `https://uri.etsi.org/ngsi-ld/default-context/Sensor` did not string-match a `Deny entityType == Sensor` rule (over-permission), while `/types/Sensor` and `/attributes/{attr}` failed to match it at all (silent `404`). The discovery endpoints now canonicalize registration type selectors with the **core** vocabulary at the point they read them, so the authorization predicate, the exact-match lookup and the rendered type name all see the same value. The **stored** form is unchanged and `GET /v2/registrations` still returns the verbatim type (same discipline as #1890 for attribute names) — canonicalization is applied to the values used for matching, not to what is persisted. Because the transform is a fixed point on already-canonical values, existing data is covered with no migration.
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

The entity selector query parameters accepted by `GET /ngsi-ld/v1/entities` (`type`, `idPattern`, `q`, `attrs`, `georel`/`geometry`/`coordinates`, `geoproperty`, `scopeQ`, `lang`) are also accepted here to define which entities the EntityMap captures. In addition:

| Parameter | Type | Description |
|-----------|-----|------|
| `typePattern` | string | Regular expression pattern for entity type, evaluated **verbatim** (no implicit `*`→`.*` conversion). Combining with `type` is an **AND** (both must match, same discipline as the temporal `typePattern` extension, #2105). An empty value (`typePattern=`) is treated as if the parameter were omitted: it is not applied to the query and not echoed in `query` (same handling as the other selector parameters). **GeonicDB 独自拡張** (#2116) |

**Response**: `201 Created`, URL of the created EntityMap in the `Location` header

> **`query` echoes the stored (input) form, not a normalized/folded form (#2116)**: the persisted and returned `query` object reflects exactly what was requested — `query.type` is the comma-separated input form (not an array, not expanded), and `typePattern` is **not** folded into `type`. Before #2116, replaying a response's `query` for a `typePattern`-only selector (e.g. `^Sensor`) would have produced `type: "^Sensor"`, silently turning a pattern selector into a literal type name (same class of bug as #1800).
>
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

On entity retrieval endpoints (`GET /ngsi-ld/v1/entities` and `GET /ngsi-ld/v1/entities/{entityId}`), the `join` and `joinLevel` query parameters can be used to retrieve linked entities. The same two
members are also available on subscriptions as `notification.join` / `notification.joinLevel`
(Table 5.2.14.1-1, #2104) and behave identically inside the notification payload.

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

**Output shape** (ETSI GS CIM 009 clause 4.5.23.2, #2222)

`inline` adds an `entity` sub-member to the annotated Relationship holding the linked entity **in the
same representation format as the enclosing response** (normalized / concise). The embedded entity has
no `@context` of its own — it is part of the parent document, not a standalone JSON-LD document.

```jsonc
// normalized
"refLinked": {
  "type": "Relationship",
  "object": "urn:ngsi-ld:Linked:001",
  "entity": { "id": "urn:ngsi-ld:Linked:001", "type": "Linked",
              "marker": { "type": "Property", "value": "ok" } }
}
```

In `keyValues` (simplified) the Relationship itself is **replaced** by the linked entity's simplified
representation rather than gaining an `entity` member (clause 4.5.3 EXAMPLE 9):

```jsonc
// keyValues
"refLinked": { "id": "urn:ngsi-ld:Linked:001", "type": "Linked", "marker": "ok" }
```

`flat` appends the linked entity to the result array as an independent entity (so it **does** carry its
own `@context`). The Relationship itself is left untouched — it gains no `entity` member, and any
`datasetId` / sub-attributes it already had are preserved.

**Which links are followed (#2225)**

All three link shapes are traversed, in both `inline` and `flat`, including when they appear as
multi-attribute instances (clause 4.5.5):

| Attribute | Link member | `inline` output member |
|---|---|---|
| `Relationship` with a single `object` URI | `object` | `entity` — the linked entity |
| `Relationship` with an `object` **array** (clause 4.5.3 allows both) | `object[]` | `entity` — an **array**, in `object` order |
| `ListRelationship` | `objectList` | `entityList` — an **ordered array**, in `objectList` order |

The member name follows the attribute type: the spec forbids `entity` on a `ListRelationship` and
`entityList` on a `Relationship`. Ordering always comes from the attribute's own `object` / `objectList`,
never from the order the targets happen to be fetched in.

In `keyValues` the same distinction applies to the replacement value: a single `object` is replaced by one
simplified object (EXAMPLE 9), while an `object` array / `objectList` is replaced by an **ordered array** of
simplified objects (EXAMPLE 17). Multi-attribute instances keep the clause 4.5.4 `dataset` map and only the
per-`datasetId` values are replaced.

```jsonc
// normalized, ListRelationship
"route": {
  "type": "ListRelationship",
  "objectList": ["urn:ngsi-ld:City:002", "urn:ngsi-ld:City:001"],
  "entityList": [
    { "id": "urn:ngsi-ld:City:002", "type": "City", "cityName": { "type": "Property", "value": "Rotterdam" } },
    { "id": "urn:ngsi-ld:City:001", "type": "City", "cityName": { "type": "Property", "value": "Antwerp" } }
  ]
}

// keyValues, same attribute (clause 4.5.3 EXAMPLE 17)
"route": [
  { "id": "urn:ngsi-ld:City:002", "type": "City", "cityName": "Rotterdam" },
  { "id": "urn:ngsi-ld:City:001", "type": "City", "cityName": "Antwerp" }
]
```

A target that cannot be resolved (missing, or filtered out by the read predicate below) is simply absent
from `entityList` / `entity`; the member is omitted entirely when no target resolves, so an empty array is
never used to mean "unreadable".

> **`entityList` is therefore not positionally aligned with `objectList`.** When some targets resolve and
> others do not, the array is **compacted** — `objectList: [c, b, a]` with `b` unreadable yields
> `entityList: [C, A]`. Match entries by their `id`, never by index. (The spec already allows the two to
> diverge: a target that "has been previously encountered" is omitted as well.) The same applies to the
> array form of `entity` for a multi-target `Relationship`.
>
> **Authorization (#2213)**: linked entities are resolved under the **same row-level read predicate** as the
> linking entities. A caller whose policy denies reading a given entity type does not receive entities of
> that type through a Relationship, at any `joinLevel`. The link itself (the `Relationship` `object` URI on
> the readable entity) is still returned — only the target entity's content is withheld. See
> [AUTH.md](../reference/auth.md#aggregate-and-derived-reads-over-entities-1370--1955).

### Context Source Registration Subscriptions

In NGSI-LD, Context Source Registration Subscriptions (CSR subscriptions) manage subscriptions that monitor changes to context source registrations.

> **Notifications are redacted by the subscription creator's read predicate (#2133).** CSR subscriptions store their creator (`createdBy`); delivered CSR documents pass through the same row-level redaction as `GET /ngsi-ld/v1/csourceRegistrations` (#2084), evaluated with the creator's current policies. A notification that would only match via an unreadable type selector is not delivered. Subscriptions without a stored creator (created before this change) or whose creator is no longer an active user receive **no** notifications (fail-closed; a structured warning `CSOURCE_NOTIFICATION_RLS_*` is logged). See [AUTH.md](../reference/auth.md) (#2133).

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
| `id` | URI | - | Client-provided subscription id (ETSI GS CIM 009 Table 5.2.12-1). If omitted, the broker assigns `urn:ngsi-ld:CSourceSubscription:{uuid}`. A second `POST` with the same `id` returns `409 AlreadyExists` (#2315) |
| `type` | string | ✓ | Fixed: `Subscription` |
| `entities` | array | ✓ | Target entities to monitor (type, id, idPattern) |
| `notification` | object | ✓ | Notification settings (endpoint.uri is required) |
| `description` | string | - | Subscription description |
| `watchedAttributes` | array | - | List of attributes to monitor |
| `expiresAt` | string | - | Expiration time (ISO 8601 format) |
| `throttling` | number | - | Notification interval (seconds) |
| `isActive` | boolean | - | Active state (default: true) |
| `jsonldContext` | string (dereferenceable URI) | - | JSON-LD `@context` used when sending `ContextSourceNotification`s (#2025, ETSI GS CIM 009 Table 5.2.12-1 / clause 5.8.1.4). If omitted, the `@context` applied to this csource subscription at create/update time is used, falling back to the NGSI-LD core context. Must be a single absolute IRI that GeonicDB can resolve — otherwise `400 BadRequestData`. Returned by `GET` when set |
| `q` | string | - | Filter on Context Source Properties (ETSI GS CIM 009 clause 5.11.2.4 / #2762). Only simple equality (`name==value`) is supported — same contract as discovery `GET /csourceRegistrations?q=` (#2442). Applied as a notification filter against the registration's additional properties |
| `geoQ` | object | - | Geo filter on the registration's `location` (default `geoproperty`) — clause 5.11.2.4 / #2762. Evaluated in-app on create/update/delete notification matching (including before-state for `newlyMatching` / `noLongerMatching`). **Supported for CSR notification filtering: `geometry: Point` with `georel: near` (maxDistance/minDistance) or `equals` only** — other combinations are rejected with `400` at create/update (in-app evaluator has no Mongo 2dsphere) |
| `temporalQ` | object | - | Temporal filter on `observationInterval` / `managementInterval` (`timeproperty` selects which) — clause 5.11.2.4 / #2762. Overlap semantics match discovery (clause 5.10.2.4). **When omitted, only registrations without time intervals match** (absence rule — not "pass all") |
| `scopeQ` | string | - | Filter on the registration's `scope` member (clause 5.11.2.4 / #2844). Same operators as entity/discovery `scopeQ`. Evaluated in-app on create/update/delete notification matching |

`watchedAttributes` and `notification.attributes` follow the same `@context` term ⇄ URI rules as `csourceRegistrations` attribute names (#1890 / #1900): names are stored verbatim with the write-time `@context`; GET responses compact them using the request `@context`; CSR notification matching uses an alias-set intersection (verbatim ∪ canonical).

The `@context` of the resulting `ContextSourceNotification` follows the same delivery rule as ordinary subscription notifications (#2025 / #1841): `notification.endpoint.accept: application/ld+json` puts it in the body, `application/json` puts it in the `Link` header, and **never both**. Before #2025 the core `@context` was always placed in the body regardless of `accept`, and a supplied `jsonldContext` was silently discarded.

**Response**
- Status: `201 Created`
- Header: `Location: /ngsi-ld/v1/csourceSubscriptions/{subscriptionId}`
- Status: `409 Conflict` — a subscription with the same client-provided `id` already exists (#2315)

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
    "status": "active"
  }
]
```

**Response Fields**

| Field | Type | Description |
|-----------|-----|------|
| `status` | string | Read-only. `active` \| `paused` \| `expired` (ETSI GS CIM 009 Table 5.2.12-1, #2440). `paused` when created/updated with `isActive: false`; `expired` once `expiresAt` has passed, derived at read time regardless of the stored value |
| `isActive` | boolean | Only present (and `false`) when `status` is not `active` (#2452) — mirrors the input field, omitted on the common case |

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

JSON-LD context management API compliant with ETSI GS CIM 009 clause 5.13 (*Storing, Managing and Serving @contexts*). Allows registration and management of user-defined JSON-LD contexts.

Stored contexts carry one of three kinds (clause 5.13.1). The specification vocabulary is capitalised and **responses use it** (#2250):

| `kind` | Meaning | Served on demand? |
|---|---|---|
| `Hosted` | Explicitly added by a client (`POST /jsonldContexts`). Add @context **always** creates `Hosted` (clause 5.13.2.4); a client-supplied `kind` is rejected with `400` (#2297) | Yes |
| `ImplicitlyCreated` | Created by the broker as a side effect of a client request — the auto-generated `@context` of a custom data model, or a subscription `@context` that is not already a dereferenceable URI (2+ element arrays / inline objects; clause 5.13.1, #2250 / #2344) | Yes |
| `Cached` | Fetched / recorded by the broker from an external URL for its own use (not creatable via Add @context, #2297). **GeonicDB extension (#2418):** on subscription (and csource subscription) write paths, a successful remote `@context` fetch is persisted as `Cached` so notification compaction can resolve it without outbound fetch (hot path `#1680`). Cap: **`CONTEXT_RESOLVER.MAX_CACHED_PER_TENANT` (500)** records per tenant+servicePath. When the cap is reached, new URLs are not cached; notification attribute/type names for those subscriptions may stay expanded (FQN) until capacity is available **and** a subsequent subscription or csource-subscription write fetches and caches the context. Deleting an entry alone does not re-cache existing subscriptions. **TTL (#2628):** each Cached record gets `expiresAt = now + CONTEXT_RESOLVER.CACHED_CONTEXT_TTL_MS` (default 24h). Authenticated lookup and `@context` resolution re-fetch when expired; failure keeps the stale snapshot and warns (no Mongo TTL delete). The unauthenticated serve endpoint and List never re-fetch — they return the stale snapshot. Legacy rows without `expiresAt` use `createdAt + TTL` (+ deterministic jitter). | **No** — `422 OperationNotSupported` (clause 5.13.4.4). Metadata is still available with `details=true` (includes `expiresAt` when Cached) |

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

A client-supplied `kind` field is rejected with `400 BadRequestData` — clause 5.13.2.4 flags every Add @context entry as `Hosted` (#2297).

**Response**
- Status: `201 Created`
- Header: `Location: /ngsi-ld/v1/jsonldContexts/{contextId}`

> **The `{contextId}` in `Location` is not percent-encoded beyond what a path segment requires (#2250).**
> `:` and `@` are `pchar` under RFC 3986 §3.3 and are emitted literally, so the header reads
> `Location: /ngsi-ld/v1/jsonldContexts/urn:ngsi-ld:JsonLdContext:<uuid>`. Encoding them
> breaks the ordinary client round-trip: a client that takes the id out of `Location` and
> encodes it as a path segment when building the next URL would send `urn%253A…`, which one
> server-side decode cannot undo, and the request is rejected with `400 BadRequestData`.
> Characters that would otherwise break the path (`/`, `?`, `#`, whitespace, control
> characters) are still percent-encoded. The same applies to `Location` on
> `POST /ngsi-ld/v1/csourceRegistrations` and `POST /ngsi-ld/v1/csourceSubscriptions`.

#### Retrieve JSON-LD Context List

```http
GET /ngsi-ld/v1/jsonldContexts
```

**Query Parameters**

| Parameter | Type | Description | Default |
|-----------|-----|------|-----------|
| `limit` | integer | Maximum number of results | 20 |
| `offset` | integer | Number of results to skip | 0 |
| `details` | string | `true` or `false`. Any other value is rejected with `400 BadRequestData` (#2250) | `false` |
| `kind` | string | Filter by stored context kind. Accepts the specification vocabulary `Cached` / `Hosted` / `ImplicitlyCreated` (clause 5.13.3.3) and, for backward compatibility, the lowercase forms this implementation stores (`cached` / `hosted` / `implicitlyCreated`). Both are normalized to the stored value before filtering; any other value is rejected with `400 BadRequestData` (#2250) | — |

**Response**: `200 OK`

By default the body is **a list of URLs** (clause 5.13.3.1). Each URL can be used to download the corresponding `@context`:

```json
[
  "http://localhost:3000/ngsi-ld/v1/jsonldContexts/urn:ngsi-ld:JsonLdContext:6f1b...",
  "https://example.org/custom-context.jsonld"
]
```

With `details=true` the body is a list of metadata objects (clause 5.13.3.5):

```json
[
  {
    "URL": "http://localhost:3000/ngsi-ld/v1/jsonldContexts/urn:ngsi-ld:JsonLdContext:6f1b...",
    "localId": "urn:ngsi-ld:JsonLdContext:6f1b...",
    "kind": "Hosted",
    "createdAt": "2026-08-15T00:00:00.000Z"
  }
]
```

`URL` is the context's **original URL when the record has one** (mandatory for `Cached`, clause 5.13.3.1); contexts registered by value get this broker's serve URL. `localId` is the identifier handed back in `Location` at registration time.

#### Retrieve JSON-LD Context

```http
GET /ngsi-ld/v1/jsonldContexts/{contextId}
```

**Query Parameters**

| Parameter | Type | Description | Default |
|-----------|-----|------|-----------|
| `details` | string | `true` returns metadata about the `@context` (same shape as the list above) instead of its content (clause 5.13.4.3). `true` or `false`; any other value is rejected with `400 BadRequestData` | `false` |

**Response body**

Without `details`, the body is **the stored `@context` document itself** (clause 6.30.3.1 — "a JSON object that has a root node named `@context`"), so the URL can be dereferenced directly by any JSON-LD processor:

```json
{
  "@context": {
    "Temperature": "https://example.org/ontology#Temperature"
  }
}
```

Information supplied outside the `@context` subtree at registration time is discarded (clause 5.13.2.3). The body is identical in both representations: the `@context` here is the payload, not an NGSI-LD envelope declaration, so it is **not** moved to the `Link` header for `application/json`.

Serving the **content** of a `Cached` context is rejected with `422 OperationNotSupported` (clause 5.13.1 / 5.13.4.4); its **metadata** (`details=true`) is returned for every kind.

**Cache Headers**

The response includes the following cache-related headers:

| Header | Description |
|---------|------|
| `ETag` | MD5 hash of the context body |
| `Last-Modified` | Creation date and time of the context |
| `Cache-Control` | `public, max-age=3600` |
| `Vary` | Includes `Link` and `Accept` — response `@context` placement depends on these request dimensions |

**Representation note (#1838 / #2250):** The body no longer varies by representation — it is the stored `@context` document in both. `Vary` and the representation-seeded `ETag` are kept because `Content-Type` and the response `Link` header still differ per representation (RFC 9110 §8.8.1: an entity-tag identifies the *selected* representation). Shared caches that ignore `Vary` may mix representations for the same `contextId` URL (interoperability risk, not tenant leakage — `contextId` is globally unique and the endpoint is unauthenticated).

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

**Query Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `reload` | boolean | No | Optional flag (ETSI GS CIM 009 clause 5.13.5.4 / Table 6.30.3.2-1). **When provided**, values other than `true`/`false` are `400 BadRequestData` before the identifier lookup. `reload=true` on a Hosted or ImplicitlyCreated `@context` is `400 BadRequestData` and the stored entry is left intact. `reload=true` on a Cached `@context` currently **deletes** the entry (`204`) — re-download from the original URL is not implemented. When omitted or `false`, the `@context` is deleted. |

**Response**: `204 No Content` / `400 BadRequestData` / `404 Not Found`

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
| `/ngsi-ld/v1/csourceSubscriptions` | POST | Create CSR subscription | 201 | 400, 401, 409, 415 | - |
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
| `/ngsi-ld/v1/jsonldContexts/{contextId}` | GET | Serve JSON-LD context | 200 | 400, 401, 404, 406, 422 | - |
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

> **`entityTypes` フィルタの型名 (#2125):** `POST /snapshots` の `entityTypes` は、`?type=` と同じく
> **リクエストの `@context`** (`Link` ヘッダ) で正規化してから保存形と照合します。短縮名 `Room` と、
> それが展開される `https://uri.etsi.org/ngsi-ld/default-context/Room` は同一の型として扱われ、
> どちらの表記でも同じエンティティが capture されます (ETSI GS CIM 009 clause 4.4 / 5.5.7)。
> 別の名前空間の同名 IRI は別の型であり、一致しません。

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

Temporal history is not auto-recorded by Entity API writes **by default**. Use one of these ingestion paths: (1) explicit writes to Temporal API endpoints (single or batch), (2) ReactiveCore rules using `appendToTemporal` to append on entity changes, or (3) set `TEMPORAL_ENTITY_DUAL_WRITE=true` (GeonicDB extension, opt-in; see `docs/ENV.md`) so Core Entity API **writes and deletes** dual-write into Temporal Evolution (deletions as `urn:ngsi-ld:null` + `deletedAt` tombstones per clause 4.5.7/4.5.8, including TTL expiry via EntityExpiryService — #2527 / #2780).

**Dual-write scope when (3) is ON** (NGSI-LD only): single-entity `POST /entities`, `PUT /entities/{id}`, `PATCH /entities/{id}`, `POST|PATCH|PUT .../attrs` (including single-attribute replace/update), batch `entityOperations/create|upsert|update|merge|delete`, and `entityOperations/purge` / `DELETE /entities` purge selectors. Core Entity API **deletes** (entity delete, attribute delete, batch delete, purge) are dual-written as `urn:ngsi-ld:null` + `deletedAt` tombstones (clause 4.5.7/4.5.8). When an enabled `appendToTemporal` rule exists for the same tenant + servicePath, (3) is skipped (rule wins).

**Not dual-written:** NGSIv2 Entity API writes, and Temporal API's own `DELETE` operations (history removal — distinct from recording Core API deletions). TTL expiry (EntityExpiryService) **is** dual-written when the flag is on (#2780).

| Endpoint | Method | Description | Success | Error | Pagination |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/temporal/entities` | GET | Retrieve temporal entity list | 200 (206 when lastN or truncated) | 400, 401, 406 | ✅ (max: 1000) |
| `/ngsi-ld/v1/temporal/entities` | POST | Create (201) or upsert (204) temporal entity — clause 5.6.11: an existing id appends the given attribute instances instead of 409 | 201/204 | 400, 401, 415 | - |
| `/ngsi-ld/v1/temporal/entities/{entityId}` | GET | Retrieve temporal entity | 200 (206 when lastN or truncated) | 400, 401, 404, 406 | - |
| `/ngsi-ld/v1/temporal/entities/{entityId}` | PATCH | Merge attributes of temporal entity | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/temporal/entities/{entityId}` | DELETE | Delete temporal entity | 204 | 400, 401, 404 | - |
| `/ngsi-ld/v1/temporal/entities/{entityId}/attrs` | POST | Add attribute instance | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/temporal/entities/{entityId}/attrs/{attrName}` | DELETE | Delete attribute instance(s) — supports `datasetId` and `deleteAll` query params (clause 5.6.5.4) | 204 | 400, 401, 404 | - |
| `/ngsi-ld/v1/temporal/entities/{entityId}/attrs/{attrName}/{instanceId}` | PATCH | Modify attribute instance | 204 | 400, 401, 404 | - |
| `/ngsi-ld/v1/temporal/entities/{entityId}/attrs/{attrName}/{instanceId}` | DELETE | Delete attribute instance | 204 | 400, 401, 404 | - |
| `/ngsi-ld/v1/temporal/entityOperations/create` | POST | Temporal batch create (max: 1000) | 201/207 | 400, 401, 415 | - |
| `/ngsi-ld/v1/temporal/entityOperations/upsert` | POST | Temporal batch upsert (max: 1000) | 204/207 | 400, 401, 415 | - |
| `/ngsi-ld/v1/temporal/entityOperations/delete` | POST | Temporal batch delete | 204/207 | 400, 401, 415 | - |
| `/ngsi-ld/v1/temporal/entityOperations/query` | POST | Temporal batch query | 200 (206 when lastN or truncated) | 400, 401, 415 | ✅ (max: 1000) |

> **Temporal attribute delete instance selection (#2436, clause 5.6.5.4)**: `DELETE /ngsi-ld/v1/temporal/entities/{entityId}/attrs/{attrName}` deletes historical instances of that attribute, scoped like the Core Entity attribute delete: `?datasetId=` deletes only instances carrying that `datasetId`; `?deleteAll=true` deletes every instance regardless of `datasetId`; omitting both targets only the **default instances** (those without a `datasetId`) and returns `404 ResourceNotFound` if none exist. `?instanceId=` (GeonicDB extension on this endpoint) selects a single instance directly and is not affected by `datasetId`/`deleteAll`. The same selection applies to `?datasetId=`/`deleteAll` on the MCP `temporal` tool's `delete_attribute` action and the equivalent A2A skill parameter.
>
> **属性名の保存形と compaction (#1975)**: temporal の属性名も entity 側 (#1649) と同じ canonical 形 (`compactIri(core @context, expandTerm(書き込み @context, 名前))`) で保存されます。単一/batch の create・`POST .../attrs`・`PATCH` (merge) の全書き込み経路が対象で、書き込み時にリクエスト `@context` がマップする term は FQN で保存されます。GET / query / 集約応答は**そのリクエストが渡した `@context`** を基準に属性名を compact して返します (ETSI GS CIM 009 clause 5.5.7)。`orderBy`・`attrs` セレクタ・属性削除 (`DELETE .../attrs/{attrName}`)・インスタンス修正 (`PATCH .../attrs/{attrName}/{instanceId}`) のパス属性名も同じ正規化と候補照合 (保存形の union の OR) を通るため、ある `@context` で書いた属性を**別の `@context` の同義 term**で引く・並び替える・削除できます。属性名は短縮名 (`A-Za-z0-9_`) に加え**絶対 IRI もそのまま受理**します（従来は短縮名限定でした）。
>
> **既知の制限**: temporal は書き込み時 `@context` を保存していないため一括移行ができません。**#1975 適用前 (移行前) の既存データは verbatim 保存のまま**残り、応答でも保存形をそのまま返します（compact されません）。読み取り・クエリ・削除は保存形の候補集合（verbatim ∪ canonical）の OR で照合するため、legacy データにも当たり続けます。

