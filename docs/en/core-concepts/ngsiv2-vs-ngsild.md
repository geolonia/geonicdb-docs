---
title: "NGSIv2 vs NGSI-LD"
description: "NGSIv2 and NGSI-LD interoperability"
outline: deep
---
# NGSIv2 / NGSI-LD Protocol Isolation

GeonicDB supports both NGSIv2 and NGSI-LD APIs in a single Context Broker. While both APIs share a unified internal storage format, **entities are isolated by protocol** -- an entity created via NGSIv2 is only accessible via NGSIv2, and likewise for NGSI-LD.

## Table of Contents

- [Overview](#overview)
- [Unified Internal Format](#unified-internal-format)
- [Protocol Isolation](#protocol-isolation)
- [Attribute Type Mapping Table](#attribute-type-mapping-table)
- [System Attribute Differences](#system-attribute-differences)
- [Output Format Differences](#output-format-differences)
- [Shared Features](#shared-features)
- [NGSI-LD-Specific Features](#ngsi-ld-specific-features)
- [Entity ID Considerations](#entity-id-considerations)
- [Federation](#federation)
- [Use Cases and Best Practices](#use-cases-and-best-practices)

---

## Overview

GeonicDB's dual API architecture supports both the FIWARE NGSIv2 and ETSI NGSI-LD specifications. Each entity is tagged with the protocol that created it, ensuring strict isolation between the two APIs.

### Architecture

```text
NGSIv2 API (/v2) ──────> [protocol: 'ngsiv2'] ──┐
                                                 ├──> Unified Internal Format ──> MongoDB
NGSI-LD API (/ngsi-ld/v1) ──> [protocol: 'ngsild'] ┘
```

- Both APIs share the same MongoDB storage and unified internal format
- Each entity has a `protocol` field (`'ngsiv2'` or `'ngsild'`) set at creation time
- Queries filter by protocol: NGSIv2 API only returns `protocol: 'ngsiv2'` entities, NGSI-LD API only returns `protocol: 'ngsild'` entities
- Existing entities without a `protocol` field are treated as `'ngsild'`

### Benefits

- **Protocol isolation** - Clear boundaries prevent unintended cross-protocol data leaks and ensure each API returns only spec-compliant entities
- **Spec compliance** - Each API operates strictly within its own specification, avoiding edge cases from format conversion
- **Integration with existing systems** - Run NGSIv2 and NGSI-LD workloads side by side without interference
- **Freedom of API choice** - Select the optimal API for each use case; use Federation for cross-protocol needs

---

## Unified Internal Format

GeonicDB converts data from both APIs into a unified internal format.

### Internal Entity Structure

```typescript
interface InternalEntity {
  id: string;                                    // Entity ID
  type: string;                                  // Entity type
  attributes: Record<string, EntityAttribute>;   // Set of attributes
  metadata?: EntityMetadata;                     // System metadata
  scope?: string[];                              // NGSI-LD scope hierarchy
  servicePath?: string;                          // Service path (NGSIv2 builtin attribute)
  distance?: number;                             // Distance in geo-query results
  expiresAt?: string;                            // Expiry for Transient entities
}

interface EntityAttribute {
  type: string;                                  // Attribute type
  value: AttributeValue;                         // Attribute value
  metadata?: Record<string, AttributeMetadata>;  // Attribute metadata
  datasetId?: string;                            // NGSI-LD dataset ID
}

interface EntityMetadata {
  createdAt: string;   // Creation timestamp (ISO 8601)
  modifiedAt: string;  // Last modified timestamp (ISO 8601)
  version: number;     // Version number
  deletedAt?: string;  // Deletion timestamp (soft delete)
}
```

### MongoDB Storage Format

```typescript
interface EntityDocument {
  _id: ObjectId;
  tenant: string;           // Tenant name (Fiware-Service)
  servicePath: string;      // Service path
  protocol?: 'ngsiv2' | 'ngsild';  // Protocol that created this entity
  entityId: string;         // Entity ID
  entityType: string;       // Entity type
  attributes: Record<string, EntityAttribute>;
  location?: {              // Separate field for 2dsphere index
    type: string;
    value: GeoGeometry;
  };
  scope?: string[];
  createdAt: Date;
  modifiedAt: Date;
  version: number;
  expiresAt?: Date;
  deletedAt?: Date;
}
```

---

## Protocol Isolation

Entities are isolated by the protocol that created them. Each entity has a `protocol` field (`'ngsiv2'` or `'ngsild'`) that determines which API can access it.

### Rules

| Operation | NGSIv2 entity (`protocol: 'ngsiv2'`) | NGSI-LD entity (`protocol: 'ngsild'`) |
|-----------|--------------------------------------|---------------------------------------|
| NGSIv2 GET/LIST | Visible | Not visible |
| NGSIv2 UPDATE/DELETE | Allowed | Not found (404) |
| NGSI-LD GET/LIST | Not visible | Visible |
| NGSI-LD UPDATE/DELETE | Not found (404) | Allowed |

### Legacy Entities

Entities created before the introduction of protocol isolation (i.e., those without a `protocol` field in the database) are treated as `'ngsild'`. They are accessible only via the NGSI-LD API.

### Cross-Protocol Access via Federation

Direct cross-protocol access is not supported. If you need to access entities across protocols, use **Federation** (Context Source Registration) to register one GeonicDB instance as a context provider for the other protocol. See the [Federation](#federation) section for details.

### Example: Protocol Isolation in Action

```bash
# Create an entity via NGSIv2
curl -X POST http://localhost:3000/v2/entities \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: demo" \
  -d '{"id": "urn:ngsi-ld:Room:001", "type": "Room", "temperature": {"type": "Number", "value": 23.5}}'

# Accessible via NGSIv2
curl http://localhost:3000/v2/entities/urn:ngsi-ld:Room:001 -H "Fiware-Service: demo"
# => 200 OK

# NOT accessible via NGSI-LD (returns 404)
curl http://localhost:3000/ngsi-ld/v1/entities/urn:ngsi-ld:Room:001 -H "Fiware-Service: demo"
# => 404 Not Found
```

---

## Attribute Type Mapping Table

GeonicDB converts between NGSIv2 types, internal types, and NGSI-LD types according to the following rules.

### Basic Data Types

| NGSIv2 Type | Internal Type | NGSI-LD Type | Description |
|-------------|---------------|--------------|-------------|
| `Number` | `Number` | `Property` | Numeric (integer or decimal) |
| `Text` / `String` | `String` | `Property` | String |
| `Boolean` | `Boolean` | `Property` | Boolean |
| `DateTime` | `DateTime` | `Property` or `TemporalProperty` | ISO 8601 datetime string |
| `Null` | `Null` | `Property` | null value |

### Structured Data Types

| NGSIv2 Type | Internal Type | NGSI-LD Type | Description |
|-------------|---------------|--------------|-------------|
| `Object` | `Object` | `Property` | JSON object |
| `Array` | `Array` | `Property` or `ListProperty` | JSON array |
| `StructuredValue` | `Object` | `Property` | Structured data |

### Geospatial Types

| NGSIv2 Type | Internal Type | NGSI-LD Type | Description |
|-------------|---------------|--------------|-------------|
| `geo:json` | `GeoJSON` | `GeoProperty` | GeoJSON (Point, LineString, Polygon, MultiPoint, MultiLineString, MultiPolygon). Multi\* geometries are also accepted in geo-queries (`geometry` parameter) and subscription `geoQ.geometry` with nested coordinates preserved (#1696) |
| `geo:point` | `GeoJSON` (Point) | `GeoProperty` | Latitude/longitude point |

### NGSI-LD-Specific Types

The following NGSI-LD-specific types are preserved internally but are treated as `Property` by the NGSIv2 API.

| NGSI-LD Type | Internal Type | NGSIv2 Conversion | Description |
|--------------|---------------|-------------------|-------------|
| `Relationship` | `Relationship` | `Relationship` (custom type) | Entity reference (includes `object` property) |
| `LanguageProperty` | `LanguageProperty` | `StructuredValue` | Multilingual string (includes `languageMap` property) |
| `JsonProperty` | `JsonProperty` | `Object` | JSON data (includes `json` property) |
| `VocabProperty` | `VocabProperty` | `Object` | Vocabulary data. `vocab` is defined by ETSI GS CIM 009; `vocabMap` is a **GeonicDB-only extension** (not in NGSI-LD) and is therefore not interoperable with other brokers |
| `ListProperty` | `ListProperty` | `Array` | Ordered array (includes `valueList` property) |
| `ListRelationship` | `ListRelationship` | `Array` | Array of entity references (includes `objectList` property) |

### Metadata Type Mapping

| NGSIv2 Metadata Name | NGSI-LD Property | Description |
|----------------------|------------------|-------------|
| `unit` (Text) | `unitCode` (string) | Unit (e.g., "CEL", "KMH") |
| `observedAt` (DateTime) | `observedAt` (ISO 8601) | Observation timestamp |
| `datasetId` (Text) | `datasetId` (URI) | Dataset ID |

---

## System Attribute Differences

Entity metadata (creation and modification timestamps) use different names depending on the API.

### NGSIv2 System Attributes

| Attribute Name | Type | Description |
|----------------|------|-------------|
| `dateCreated` | `DateTime` | Entity creation timestamp (ISO 8601) |
| `dateModified` | `DateTime` | Entity last modified timestamp (ISO 8601) |

**Example (NGSIv2 response with `options=dateCreated,dateModified`):**

```json
{
  "id": "Room1",
  "type": "Room",
  "temperature": {
    "type": "Number",
    "value": 23
  },
  "dateCreated": {
    "type": "DateTime",
    "value": "2026-02-08T10:00:00.000Z"
  },
  "dateModified": {
    "type": "DateTime",
    "value": "2026-02-08T11:00:00.000Z"
  }
}
```

### NGSI-LD System Attributes

| Attribute Name | Type | Description |
|----------------|------|-------------|
| `createdAt` | ISO 8601 string | Entity creation timestamp |
| `modifiedAt` | ISO 8601 string | Entity last modified timestamp |

**Note:** When using the `pick` parameter, the response includes the explicitly requested attributes along with `@context`, `id`, and `type` (which are always present). However, `createdAt` and `modifiedAt` are not returned even if `pick` is used — these system attributes require the `sysAttrs` option.

**Example (NGSI-LD response, system attributes always included):**

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "id": "urn:ngsi-ld:Room:Room1",
  "type": "Room",
  "temperature": {
    "type": "Property",
    "value": 23
  },
  "createdAt": "2026-02-08T10:00:00.000Z",
  "modifiedAt": "2026-02-08T11:00:00.000Z"
}
```

### Internal Representation (MongoDB)

```typescript
{
  metadata: {
    createdAt: "2026-02-08T10:00:00.000Z",  // ISO 8601 string
    modifiedAt: "2026-02-08T11:00:00.000Z", // ISO 8601 string
    version: 1
  }
}
```

---

## Output Format Differences

Each API supports multiple response formats.

### NGSIv2 Output Formats

| Format | options Parameter | Description |
|--------|-------------------|-------------|
| **normalized** (default) | (none) | Full format including type and metadata |
| **keyValues** | `options=keyValues` | Key-value pairs only (no metadata) |
| **values** | `options=values` | Array of attribute values only |

**Examples:**

```bash
# normalized (default)
curl http://localhost:3000/v2/entities/Room1

# keyValues
curl http://localhost:3000/v2/entities/Room1?options=keyValues

# values
curl 'http://localhost:3000/v2/entities?type=Room&options=values&attrs=temperature,humidity'
```

### NGSI-LD Output Formats

> **Media type vs. representation format.** These are independent axes. The `Accept` header selects the *media type*; `options` / `format` select the *representation format* below. Per ETSI GS CIM 009 clause 6.3.4, an **absent `Accept` header (or `*/*`) resolves to `application/json`**, not `application/ld+json` — send `Accept: application/ld+json` explicitly when you want the `@context` embedded in the response body (#1734). Only `application/json` / `application/ld+json` (plus `application/geo+json` on entity endpoints) are supported; anything else yields `406 Not Acceptable`. See [API_NGSILD.md — Content Negotiation](../api-reference/ngsild.md#content-negotiation-and-context).

| Format | Accept Header | Description |
|--------|---------------|-------------|
| **normalized** (default) | any supported media type (e.g. `application/ld+json`) | Full format including type and metadata |
| **concise** | any supported media type + `options=concise` | Concise format (abbreviated notation) |
| **keyValues** | any supported media type + `options=keyValues` | Key-value pairs only |

**Examples:**

```bash
# normalized (default)
curl http://localhost:3000/ngsi-ld/v1/entities/urn:ngsi-ld:Room:Room1

# concise
curl 'http://localhost:3000/ngsi-ld/v1/entities/urn:ngsi-ld:Room:Room1?options=concise'

# keyValues
curl 'http://localhost:3000/ngsi-ld/v1/entities/urn:ngsi-ld:Room:Room1?options=keyValues'
```

---

## Shared Features

The following features are shared by both APIs.

### 1. Query Language

| Feature | NGSIv2 | NGSI-LD | Description |
|---------|--------|---------|-------------|
| **Simple Query** | `q` parameter | `q` parameter | Attribute value filter (e.g., `temperature>20;humidity<80`) |
| **Metadata Query** | `mq` parameter | `q` parameter (metadata also queryable) | Metadata filter |
| **Scope Query** | `Fiware-ServicePath` header (independent from scope) | `scopeQ` parameter | Scope hierarchy filter |

**Basic examples:**

```bash
# NGSIv2: Entities with temperature greater than 20
curl 'http://localhost:3000/v2/entities?type=Room&q=temperature>20'

# NGSI-LD: Entities with temperature greater than 20
curl 'http://localhost:3000/ngsi-ld/v1/entities?type=Room&q=temperature>20'
```

#### Metadata Query (mq) Details

The NGSIv2 `mq` parameter supports queries against attribute metadata.

**Supported operators:**

| Operator | Description | Example |
|----------|-------------|---------|
| `==` | Equal to | `mq=temperature.accuracy==0.95` |
| `!=` | Not equal to | `mq=temperature.accuracy!=0` |
| `>`, `<`, `>=`, `<=` | Comparison operators | `mq=temperature.accuracy>0.9` |
| `~=` | Pattern match | `mq=temperature.unit~=Cel.*` |
| `..` | Range (inclusive) | `mq=temperature.accuracy==0.9..1.0` |
| `,` | List (OR) | `mq=temperature.unit==Celsius,Fahrenheit` |
| `;` | AND condition | `mq=temperature.accuracy>0.9;temperature.unit==Celsius` |
| `|` | OR condition | `mq=temperature.accuracy>0.9|humidity.accuracy>0.8` |

**Examples:**

```bash
# Entities with a temperature attribute having accuracy greater than 0.9
curl 'http://localhost:3000/v2/entities?type=Room&mq=temperature.accuracy>0.9'

# Entities with a temperature attribute having accuracy in the range 0.9 to 1.0
curl 'http://localhost:3000/v2/entities?type=Room&mq=temperature.accuracy==0.9..1.0'

# Entities with a temperature attribute having unit Celsius or Fahrenheit
curl 'http://localhost:3000/v2/entities?type=Room&mq=temperature.unit==Celsius,Fahrenheit'

# Compound condition: accuracy greater than 0.9 AND unit is Celsius
curl 'http://localhost:3000/v2/entities?type=Room&mq=temperature.accuracy>0.9;temperature.unit==Celsius'
```

> **Metadata name charset (#1946):** both the attribute name and the metadata name in an `mq`
> condition are parsed as `\w+` (Orion-compatible grammar), so metadata names are validated on
> write against `^[A-Za-z0-9_]+$`. Names containing `.`, `-`, `$` or whitespace are rejected with
> `400` instead of being stored as data that can never be queried back. See
> [Entity Field Character Set](#entity-field-character-set-id--type--attribute-name--geonicdb-独自拡張).

#### Scope Query (scopeQ) Details

The NGSI-LD `scopeQ` parameter supports queries against the entity scope hierarchy.

**Supported operators:**

| Operator | Description | Example |
|----------|-------------|---------|
| `/path` | Exact match | `scopeQ=/Japan/Tokyo` |
| `/path/+` | One level below only | `scopeQ=/Japan/+` (e.g., Tokyo) |
| `/path/#` | All descendants | `scopeQ=/Japan/#` (e.g., Tokyo, Tokyo/Shibuya) |
| `;` | AND condition (multiple scopes) | `scopeQ=/Japan/Tokyo;/IoT` |

**Examples:**

```bash
# Entities with scope /Japan/Tokyo (exact match)
curl 'http://localhost:3000/ngsi-ld/v1/entities?scopeQ=/Japan/Tokyo'

# Entities directly under /Japan (one level below only)
curl 'http://localhost:3000/ngsi-ld/v1/entities?scopeQ=/Japan/+'

# All descendant entities under /Japan
curl 'http://localhost:3000/ngsi-ld/v1/entities?scopeQ=/Japan/%23'

# Entities with multiple scopes (AND condition)
curl 'http://localhost:3000/ngsi-ld/v1/entities?scopeQ=/Japan/Tokyo;/IoT'
```

#### Scope Character Set (GeonicDB 独自拡張)

NGSI-LD specification (ETSI GS CIM 009 clause 4.18 / 5.2.x) restricts scope segment characters to `[A-Za-z0-9_]` (ALPHA / DIGIT / underscore). GeonicDB extends this slightly to the **POSIX Portable Filename Character Set** so that scope is intuitive as a filesystem-style path:

| | NGSI-LD spec (strict) | GeonicDB (POSIX portable) |
|---|---|---|
| Allowed segment characters | `[A-Za-z0-9_]` | `[A-Za-z0-9._-]` |
| Leading `/` required | ✅ | ✅ |
| Empty segments (`//`) | ❌ | ❌ |
| Segment may start with `-` | (n/a) | ❌ (POSIX convention to avoid CLI-flag collisions) |

Formal grammar:

```ebnf
ScopePath  = "/" ScopeLevel ( "/" ScopeLevel )*
ScopeLevel = ( ALPHA | DIGIT | "." | "_" ) *( ALPHA | DIGIT | "." | "_" | "-" )
```

Regex per scope string: `^(/[A-Za-z0-9._][A-Za-z0-9._-]*)+$`

**Why POSIX portable?** The pure NGSI-LD spec set (`[A-Za-z0-9_]`) is overly restrictive for real-world use. POSIX portable adds `.` and `-`, enabling natural names like `/com.example.region/tokyo-shibuya` or `/v1.0/sensors`. At the same time, it rejects the `scopeQ` reserved characters (`;` `+` `#`) and half-width space — these would otherwise be **silent footguns**: storage succeeds, but the entity becomes unmatchable via `scopeQ`.

**Examples:**

| Input | Status | Reason |
|-------|--------|--------|
| `/Japan/Tokyo` | ✅ accepted | NGSI-LD strict compliant |
| `/com.example.region/tokyo-shibuya` | ✅ accepted | POSIX portable extension |
| `/v1.0/sensors` | ✅ accepted | POSIX portable extension |
| `/Japan/+` | ❌ 400 BadRequestData | `+` is a `scopeQ` wildcard |
| `/Japan;Tokyo` | ❌ 400 BadRequestData | `;` is a `scopeQ` AND separator |
| `/Japan/#` | ❌ 400 BadRequestData | `#` is a `scopeQ` wildcard |
| `/Tokyo Shibuya` | ❌ 400 BadRequestData | Half-width space |
| `Tokyo` | ❌ 400 BadRequestData | Missing leading `/` |
| `/Japan//Tokyo` | ❌ 400 BadRequestData | Empty segment |
| `/-Japan` | ❌ 400 BadRequestData | Segment starts with `-` |
| `/東京` | ❌ 400 BadRequestData | Non-ASCII |

Validation applies to `POST/PATCH/PUT /entities`, `POST /entityOperations/*`, temporal endpoints, and ReactiveCore rules' `createEntity` action. Existing stored entities with non-conformant scopes (pre-#1189 data) remain readable; only new write requests are rejected.

Clients targeting strict NGSI-LD specification compliance should keep their scopes within `[A-Za-z0-9_]` for portability across implementations.

#### Scope Update Semantics (GeonicDB 独自拡張)

NGSI-LD specification (ETSI GS CIM 009) defines the `scope` field on entities and the `scopeQ` query parameter but does **not** specify how to unset an existing scope through PATCH/PUT/upsert. GeonicDB extends the API as follows:

| Request body for `scope` | Effect | Subsequent GET response |
|--------------------------|--------|-------------------------|
| (field omitted) | Existing scope preserved | Whatever was previously stored (key omitted if never set) |
| `"scope": "/foo"` or `"scope": ["/foo"]` | Replace with the new value | `"scope": ["/foo"]` |
| `"scope": null` | **Explicit unset** (GeonicDB extension) | `"scope": null` |
| `"scope": []` | **Explicit unset** — treated as equivalent to `null` (GeonicDB extension) | `"scope": null` |

- Endpoints supporting the unset extension: `PATCH /entities/{id}` (merge-patch), `PUT /entities/{id}` (replace), `POST /entityOperations/upsert` (both merge and replace modes). The attrs-level endpoint `PATCH /entities/{id}/attrs` does not currently honor the `scope` field (sent values are silently ignored). Use the entity-level `PATCH /entities/{id}` instead when you need to update scope.
- The explicit-unset state (`scope: null`) is preserved in storage rather than removing the field entirely, so the API can distinguish "scope was deliberately cleared" from "scope was never set".
- `scopeQ` queries do not match entities with `scope: null` (the field has no path components to match against), which is consistent with entities that never had a scope.
- Clients targeting strict NGSI-LD specification compliance should avoid relying on this extension.

#### Entity Field Character Set (id / type / attribute name) — GeonicDB 独自拡張

NGSIv2 spec の Field syntax restrictions (control chars / whitespace / `&` `?` `/` `#` 以外を許容) と NGSI-LD spec はいずれも実装側が追加制約を加えることを許容している。GeonicDB は #1189 で scope に採用した **POSIX Portable Filename Character Set** を `type` にも展開しつつ、attribute name は実装上の制約から旧来の厳格な charset を維持する (#1209):

| Field | GeonicDB allowed characters | Regex | NGSIv2 spec | NGSI-LD spec |
|-------|----------------------------|-------|-------------|--------------|
| `id` | `[A-Za-z0-9._:-]` (`:` for URN form, no leading `-`) | `^[A-Za-z0-9._:][A-Za-z0-9._:-]*$` | ASCII minus `& ? / # whitespace`, ≤256 | URI form |
| `type` (NGSIv2) | `[A-Za-z0-9._-]` (POSIX portable, no leading `-`) | `^[A-Za-z0-9._][A-Za-z0-9._-]*$` | same as `id` | — |
| `type` (NGSI-LD, #1211) | POSIX portable **OR** absolute IRI | TYPE_PATTERN **\|** URI_PATTERN | — | URI form |
| attribute name (NGSIv2) | `[A-Za-z0-9_]` (**MongoDB レイヤー制約のため**) | `^[A-Za-z0-9_]+$` | same as `id` | — |
| attribute name (NGSI-LD, #1649) | 短縮名 **OR** 絶対 IRI | `^[A-Za-z0-9_]+$` **\|** URI_PATTERN | — | shortname or URI |
| Max length | 256 chars (all three fields) | — | 256 | — |

ここで `URI_PATTERN` は `/^[A-Za-z][A-Za-z0-9+.-]*:[^\s<>"{}|\\^`]+$/` — RFC 3986 の scheme (ALPHA 開始) + `:` + 非空の opaque 部分 (空白・制御文字および `<>"{}|\^\`` を禁止)。

Notes:

- **`id` / `type` / attribute name すべて先頭の `-` を不可**。`id` の旧 regex (`^[\w:.-]+$`) は先頭 `-` を許容していたため、新 regex への移行で **`-` から始まる id がわずかに厳格化** される (POSIX 慣習に合わせ統一; 実運用で先頭 `-` の id はまず使われないため影響軽微)。
- `id` accepts `:` because NGSI-LD URN form `urn:ngsi-ld:Type:identifier` is the canonical id format.
- **NGSI-LD path** accepts absolute IRIs as `type` in addition to POSIX portable short names (#1211). Examples: `https://uri.fiware.org/ns/data-models#WeatherObserved`, `urn:ngsi-ld:Type:Sensor`. **NGSIv2 path** continues to reject URI forms (protocol isolation).
- **型名 (`type`) は active `@context` で term ⇄ URI 展開される (ETSI GS CIM 009 §5.5.7、#1613)** — #1211 時点の「URI を不透明保存」は #1613 で置換された。書き込み・クエリ時に `@context` で型名を canonical 正規化し (term → FQN、core `@vocab` に落ちる短縮名は決定的に bare 短縮名へ還元して保存)、読み出し時は応答 `@context` で compact する。したがって、ある `@context` が `Vehicle → https://ontology.example/Vehicle` をマップしていれば、term `Vehicle` で投入したエンティティを FQN `https://ontology.example/Vehicle` でクエリしてヒットする (逆も同じ)。逆に、どの `@context` もマップしない短縮名 `Temperature` は core `@vocab` で `.../default-context/Temperature` に展開され、絶対 IRI `https://example.com/Temperature` とは別 URI なので照合しない (opaque 保存ではなく context 依存の展開結果として区別される)。型を伴うクエリ/作成で active `@context` が解決不能なら `504 LdContextNotAvailable` (§5.5.4、fail-closed)。**属性名セレクタ (`attrs` / `pick` / `omit`) を伴うクエリも同様** (#1613) — `Link` ヘッダで解決不能な `@context` を渡した場合、従来は属性名を展開せず `200` を返していたが、クエリの解釈に必要な `@context` が無い以上 fail-closed で `504` を返す (`?type=` と同じ扱い。**意図的な挙動変更**)。`Link` を付けないリクエストは従来どおり `@context` を解決しない。
- **属性名 (attribute name) の term ⇄ URI 展開は、セレクタ・単一属性パス (#1613) と保存キーの canonical 化 (#1649) の両方が実装済み。**

  **保存 canonical 形の定義**: `compactIri(core @context, expandTerm(リクエスト @context, 名前))`。すなわち
  - リクエスト `@context` が**マップする** term (`temperature → https://example/ns#Warmth`) → **FQN で保存**
  - core 語彙 (`location` / `observedAt` / `unitCode` 等) と**どの `@context` もマップしない**短縮名 → **短縮名のまま保存** (保存形不変)

  型名の canonical-bare (`@vocab` 剥がし) を属性名にそのまま使うと、core `@context` が `location` を `@vocab` ではなく `https://uri.etsi.org/ngsi-ld/location` にマップするため **`location` が FQN 化して geo インデックス・`geoproperty` の既定値・NGSIv2 相互運用がまとめて壊れる**。そのため属性名側は core で compact する定義を採る。FQN に含まれる `.` は MongoDB の dot-path と衝突するため保存キーでは percent エスケープする (`%` `.` `$` `\0` の 4 文字のみ、`src/core/entities/attr-key-escape.ts`)。

  したがって **flip の影響範囲は「リクエスト `@context` がマップする属性名」だけ**に閉じる。`@context` を渡さないクライアントの保存形は 1 バイトも変わらない。クエリ/照合側は `@context` で解決するため、**完全修飾 URI で属性を指定できる**: `?attrs=<FQN>` / `pick` / `omit` / `GET /attributes/{FQN}` / `PUT`・`PATCH`・`DELETE /entities/{id}/attrs/{FQN}` / temporal の `attrs` / `POST /entityOperations/query` の `attrs` / purge の `attrs`・`keep`・`drop`。解決はリクエスト `@context` を使った round-trip (FQN → その `@context` が定める term) であり、**書き込みと同じ `@context` を渡すクライアント**に対して機能する。
  - **`@context` を渡さないと短縮名は引けない (破壊的変更、#1649)**: `@context` がマップする属性を **`@context` 無し**で `GET /entities/{id}/attrs/{短縮名}` すると、その短縮名は `default-context/<名前>` = **別の属性**を指すため `404` になる。旧挙動 (verbatim 保存ゆえに保存名で引けた) は保存形に依存した後方互換の副産物で、clause 5.5.7 とは整合しない。**書き込みと同じ `@context` を渡せば従来どおり短縮名で引ける。**
  - **移行 (必須)**: flip 前に書かれたエンティティは `attrNameForm` フラグを持たず **legacy 意味論 (verbatim 保存 + 作成時 `contextRef` で復元)** のまま読まれる。挙動は今日と同じなので放置しても壊れないが、`geoproperty` / `orderBy` は単一名しか取れず canonical 側の名前で照合されないため、`@context` がマップする属性名でこれらを使う場合は移行が要る (`q` は候補 union で緩和済み)。一括移行: `npm run migrate:attr-names`(dry-run) → `-- --apply`。**暗号化テナントの既存 doc はスキップされる** (属性名が envelope 内の「値」として入っており KMS 復号+再暗号化が要るため。スキップされた doc は legacy のままで安全)。
  - **doc 単位で意味論を固定する**: 移行前の bare `temperature` と移行後の canonical-bare `temperature` は**同じ文字列なのに意味が違う**ため、per-key では判別できない。`EntityDocument.attrNameForm === 'canonical'` の有無で doc ごとに決める。legacy doc への部分書き込みは verbatim のまま行い、**同一 doc 内に legacy キーと canonical キーを混在させない** (全置換 = `PUT` / batch replace は置換後に legacy キーが残らないので移行を兼ねる)。
    - **federation の registration 照合は別で、cross-`@context` に対応済み**。`csourceRegistrations` の `propertyNames` / `relationshipNames` は「verbatim ∪ canonical」の union インデックスで保持される (#1890) ため、ctx-B の `warmth` で登録した registration に ctx-A の `temperature` (同一 URI) で照会しても転送される。回帰ガード: `tests/e2e/features/ngsi-ld/attr-uri-expansion.feature` の `@issue-1613-federation-fqn-drop`。
  - `q` / `geoproperty` / `orderBy` は**仕様上そもそも短縮名限定**のため対象外 — clause 4.9: "The attribute path is always a composition of short hand names and not a fully qualified ones, because, when the query language is used, an `@context` properly defining all the terms (as per clause 5.5.7) shall be issued."
- 構文検証は型・属性名とも「短縮名 **または** 絶対 IRI」(型は POSIX portable 短縮名、属性名は `[A-Za-z0-9_]` 短縮名。**属性名の絶対 IRI 受理は NGSI-LD 経路のみ**、#1649。NGSIv2 は短縮名のみ)。`@context` の解決は展開に必要なときのみ行い、Smart Data Models 存在確認は行わない。
- **属性名の文字種は「短縮名 (`^[A-Za-z0-9_]+$`) ∥ 絶対 IRI」** (#1649、NGSI-LD 経路のみ。NGSIv2 は短縮名のみ)。POSIX portable (`.` `-` を含む) を短縮名として許さない理由は元のまま: 属性名は MongoDB の field key (`attributes.${name}`) に直接埋め込まれるため `.` が dot-path 記法と衝突し (`attributes.sensor.id` が `attributes.sensor` の `id` サブフィールドと解釈される)、`q` パーサが属性名を `([\w.]+)` で切り出すため `-` は silent な footgun になる (保存はできるが `q` で絞れない)。絶対 IRI を許せるようになったのは、canonical 保存 (clause 5.5.7) で保存キーが FQN になる #1649 に合わせて **percent エスケープ層** (`src/core/entities/attr-key-escape.ts`、`%` `.` `$` `\0` の 4 文字のみ) を dot-path 構築の唯一の入口に据えたため。`q` は clause 4.9 が **shorthand 限定**と定めるので、パーサの `[\w.]` 制約はそのままでよい (FQN を `q` に書くことは仕様上ない)。
- **metadata 名の文字種は protocol で分岐する** (#1946 / #1788 サブ項目 4)。**NGSIv2 の `metadata` キーは短縮名 (`^[A-Za-z0-9_]+$`) のみ**、**NGSI-LD のサブ属性名は短縮名 ∥ 絶対 IRI**。metadata は `attributes.<attr>.metadata.<meta>` として保存され、NGSIv2 の `mq` はこれを dot-path で引く。#1946 以前は文字種検証がまったく無く、(1) `mq` の文法 (`attrName.metaName{op}value`、Orion 互換で `\w` のみ) では書けないうえ意図しないネストパスになるため**保存できるのに二度と引けない**、(2) 作成 (`insertOne`) は通るが更新の `$set` は通らない (`cannot use dotted field name '...' in a sub object`) ため**作れるのに直せない**、という 2 つの silent な壊れ方を作れた。NGSI-LD 側を絶対 IRI まで緩めたのは、clause 5.5.7 の term ⇄ URI 等価変換が**サブ属性名にも掛かる** (短縮名で送っても FQN が保存形になる) ため — 受理しないと自分が書いた保存形を書き戻せない。#1946 が緩和の前提としていた「percent エスケープ層 (`attr-key-escape.ts`) が top-level 属性キー限定」は解消済みで、`escapeAttrsObject` / `unescapeAttrsObject` が `metadata` キーまで再帰的に escape する。NGSIv2 は `@context` が無く FQN 保存も起きないため短縮名のまま (protocol 分離)。**絶対 IRI でない**ドット入りの名前 (`unit.code`) はどちらの protocol でも 400。
- Error responses include the offending value and the allowed character set, e.g. `Entity type contains invalid characters (allowed: A-Z a-z 0-9 . _ - (must not start with -)); got "Sensor@Type"`.

**Examples:**

| Field | Input | Status |
|-------|-------|--------|
| type | `Room` | ✅ accepted (both protocols) |
| type | `Blesensor.per3600` | ✅ accepted (`.` allowed, both protocols) |
| type | `Sensor-Type` | ✅ accepted (`-` allowed, both protocols) |
| type | `Sensor@Type` | ❌ 400 (invalid character) |
| type | `Sensor Type` | ❌ 400 (whitespace) |
| type | `-LeadingHyphen` | ❌ 400 (leading `-`) |
| type | `urn:ngsi-ld:Sensor` | NGSI-LD: ✅ / NGSIv2: ❌ 400 (#1211) |
| type | `https://uri.fiware.org/ns/data-models#WeatherObserved` | NGSI-LD: ✅ / NGSIv2: ❌ 400 (#1211) |
| type | `http://example.com/types/Temperature` | NGSI-LD: ✅ / NGSIv2: ❌ 400 (#1211) |
| type | `1http://example.com/X` | ❌ 400 (scheme must start with ALPHA) |
| type | `https:` | ❌ 400 (opaque part is empty) |
| attribute | `waterLevel` / `water_level` | ✅ accepted |
| attribute | `water-level` | ❌ 400 (`-` not allowed; q-parser limitation) |
| attribute | `sensor.id` | ❌ 400 (`.` not allowed; MongoDB dot-path conflict) |
| attribute | `attr name` | ❌ 400 (whitespace) |
| attribute | `https://uri.fiware.org/ns/dm#temperature` | NGSI-LD: ✅ / NGSIv2: ❌ 400 (#1649) |
| metadata / sub-attribute | `accuracy` / `unit_code` | ✅ accepted (both protocols) |
| metadata / sub-attribute | `unit.code` | ❌ 400 (`.` not allowed; MongoDB dot-path conflict, #1946) |
| metadata / sub-attribute | `unit-code` | ❌ 400 (`-` not allowed; mq-parser limitation, #1946) |
| metadata / sub-attribute | `$where` | ❌ 400 (`$` not allowed; MongoDB operator, #1946) |
| metadata / sub-attribute | `https://example.org/ns#accuracy` | ❌ 400 (**both protocols**; escape layer does not cover metadata keys, #1946) |
| id | `urn:ngsi-ld:Room:1` | ✅ accepted (`:` allowed for id) |
| id | `-foo` | ❌ 400 (leading `-`; **わずかな厳格化** vs 旧来) |

Validation applies to NGSIv2 `POST/PATCH/PUT /v2/entities` and NGSI-LD `POST/PATCH/PUT /ngsi-ld/v1/entities`, temporal endpoints, and batch operations. Existing stored entities with non-conformant fields (pre-#1209 data) remain readable; only new write requests are rejected.

Clients targeting strict NGSI-LD specification compliance can keep their `type` within `[A-Za-z0-9_]` for portability across implementations.

### 2. Geo-Queries

| Geo-query Operator | NGSIv2 | NGSI-LD | Description |
|--------------------|--------|---------|-------------|
| `near` | ✅ | ✅ | Near a specified point |
| `coveredBy` | ✅ | ✅ | Completely contained within a region |
| `within` | ✅ | ✅ | Intersects or is contained within a region |
| `intersects` | ✅ | ✅ | Intersects a region |
| `disjoint` | ✅ | ✅ | Does not intersect a region |

**Examples:**

```bash
# NGSIv2: Entities within 1km of Tokyo Station
curl 'http://localhost:3000/v2/entities?georel=near;maxDistance:1000&geometry=point&coords=35.6812,139.7671'

# NGSI-LD: Entities within 1km of Tokyo Station
curl 'http://localhost:3000/ngsi-ld/v1/entities?georel=near;maxDistance==1000&geometry=Point&coordinates=%5B139.7671,35.6812%5D'
```

### 3. Pagination

| Header | NGSIv2 | NGSI-LD | Description |
|--------|--------|---------|-------------|
| **Total count** | `Fiware-Total-Count` | `NGSILD-Results-Count` | Total number of query results |
| **Next Link** | `Link` (rel="next") | `Link` (rel="next") | Link to the next page |

For details, see [Pagination](/en/api-reference/pagination).

### 4. Subscriptions

| Notification Method | NGSIv2 | NGSI-LD | Description |
|--------------------|--------|---------|-------------|
| **HTTP Webhook** | ✅ | ✅ | POST to a REST endpoint |
| **MQTT** | ✅ | ✅ | Publish to an MQTT broker (QoS 0/1/2, TLS) |
| **WebSocket** | ✅ | ✅ | Real-time event stream |

### 5. Federation (Context Source Registration)

| Feature | NGSIv2 | NGSI-LD | Description |
|---------|--------|---------|-------------|
| **Registration API** | `/v2/registrations` | `/ngsi-ld/v1/csourceRegistrations` | Remote provider registration |
| **Parallel queries** | ✅ | ✅ | Simultaneous queries to multiple providers |
| **Result merging** | ✅ | ✅ | Merge of local and remote results |
| **Loop detection** | ✅ | ✅ | `Via` header loop detection (RFC 7230 / ETSI 6.3.17-6.3.18, #1664): forwarded requests append `1.1 <BROKER_ID>`; incoming `Via` containing own pseudonym skips forwarding (inclusive → local + `NGSILD-Warning` 199) or returns `508 Loop Detected` (exclusive/redirect) |

---

## NGSI-LD-Specific Features

The following features are only supported by the NGSI-LD API and are not directly available in the NGSIv2 API.

### 1. Relationship

Represents associations between entities.

**NGSI-LD:**

```json
{
  "id": "urn:ngsi-ld:Vehicle:V123",
  "type": "Vehicle",
  "owner": {
    "type": "Relationship",
    "object": "urn:ngsi-ld:Person:P456"
  }
}
```

> **Note:** Due to protocol isolation, NGSI-LD entities (including those with Relationship attributes) are not accessible via the NGSIv2 API.

### 2. LanguageProperty (Multilingual Property)

Holds strings in multiple languages.

**NGSI-LD:**

```json
{
  "id": "urn:ngsi-ld:Museum:M001",
  "type": "Museum",
  "name": {
    "type": "LanguageProperty",
    "languageMap": {
      "en": "Tokyo National Museum",
      "ja": "東京国立博物館"
    }
  }
}
```

**When using `lang=ja` with NGSI-LD:**

When using the `lang` query parameter, a LanguageProperty is converted to a standard Property, with the value for the specified language set in the `value` field.

```bash
curl 'http://localhost:3000/ngsi-ld/v1/entities/urn:ngsi-ld:Museum:M001?lang=ja'
```

```json
{
  "id": "urn:ngsi-ld:Museum:M001",
  "type": "Museum",
  "name": {
    "type": "Property",
    "value": "東京国立博物館",
    "lang": "ja"
  }
}
```

> **Note:** Due to protocol isolation, NGSI-LD entities (including those with LanguageProperty attributes) are not accessible via the NGSIv2 API.

### 3. Scope (Scope Hierarchy)

Represents the logical hierarchy of an entity.

**NGSI-LD:**

```json
{
  "id": "urn:ngsi-ld:Sensor:S123",
  "type": "Sensor",
  "scope": ["/Japan/Tokyo/Shibuya", "/IoT/Temperature"]
}
```

**Scope query:**

```bash
# All entities under /Japan/Tokyo
curl 'http://localhost:3000/ngsi-ld/v1/entities?scopeQ=/Japan/Tokyo'
```

**NGSIv2 compatibility:**

- NGSIv2 uses `Fiware-ServicePath` header for hierarchical entity management
- `servicePath` is available as a builtin attribute via `?attrs=servicePath`
- **servicePath and scope are independent concepts (#964):** they are not automatically synchronized
  - NGSIv2 `Fiware-ServicePath` → stored as `servicePath` in DB (infrastructure-level isolation)
  - NGSI-LD `scope` → stored as `scope` in DB (user-defined logical hierarchy)
  - NGSI-LD ignores the `Fiware-ServicePath` header per ETSI GS CIM 009 spec

### 4. Attribute Projection (pick / omit Parameters)

In NGSI-LD, the `pick` and `omit` query parameters can be used to control which attributes are included in the response.

#### pick Parameter (Attribute Selection)

Includes only the specified attributes in the response.

**Example:**

```bash
# Retrieve only the temperature and humidity attributes
curl 'http://localhost:3000/ngsi-ld/v1/entities/urn:ngsi-ld:Room:001?pick=temperature,humidity'
```

**Response:**

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "id": "urn:ngsi-ld:Room:001",
  "type": "Room",
  "temperature": {
    "type": "Property",
    "value": 23.5
  },
  "humidity": {
    "type": "Property",
    "value": 60
  }
}
```

#### omit Parameter (Attribute Exclusion)

Excludes the specified attributes from the response.

**Example:**

```bash
# Retrieve without the location attribute
curl 'http://localhost:3000/ngsi-ld/v1/entities/urn:ngsi-ld:Room:001?omit=location'
```

**Response:**

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "id": "urn:ngsi-ld:Room:001",
  "type": "Room",
  "temperature": {
    "type": "Property",
    "value": 23.5
  },
  "humidity": {
    "type": "Property",
    "value": 60
  }
}
```

**Notes:**

- `pick` and `omit` cannot be used simultaneously
- When using `pick`: only `@context`, `id`, `type`, and the specified attributes are included. `createdAt` and `modifiedAt` are not included.
- When using `omit`: all attributes except the specified ones are included. `id` and `type` cannot be excluded (per ETSI GS CIM 009 V1.9.1 specification)

**NGSIv2 compatibility:**

- In the NGSIv2 API, the `attrs` parameter provides equivalent functionality (pick only)
- There is no NGSIv2 equivalent for `omit`

```bash
# Retrieve only temperature and humidity with NGSIv2 (equivalent to pick)
curl 'http://localhost:3000/v2/entities/urn:ngsi-ld:Room:001?attrs=temperature,humidity'
```

### 5. @context (JSON-LD Context)

In NGSI-LD, including `@context` in an entity defines the vocabulary.

**NGSI-LD:**

```json
{
  "@context": [
    "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
    "https://smartdatamodels.org/context.jsonld"
  ],
  "id": "urn:ngsi-ld:AirQualityObserved:001",
  "type": "AirQualityObserved",
  ...
}
```

**NGSIv2 compatibility:**

- NGSIv2 has no concept of `@context`
- GeonicDB supports automatic completion of Smart Data Models `@context`, but `@context` is not returned by the NGSIv2 API

---

## Entity ID Considerations

### Entity ID Uniqueness (GeonicDB Extension)

> **GeonicDB Extension**: In GeonicDB, entity IDs are unique within the scope of a tenant (`Fiware-Service`) and service path (`Fiware-ServicePath`). The entity `type` is **not** part of the uniqueness constraint.

This is a deliberate design decision that unifies the ID semantics across both APIs:

- **NGSI-LD** treats entity IDs as URIs, which are inherently unique
- **NGSIv2** (standard) allows entities with the same ID but different types to coexist — GeonicDB **does not** support this behavior

**Impact:**
- **Direct creation** (`POST /v2/entities`, `POST /ngsi-ld/v1/entities`): Creating an entity with the same ID as an existing entity (even with a different `type`) returns `409 AlreadyExists`
- **Batch update** (`POST /v2/op/update` with `append`/`appendStrict`): Matches entities by `entityId` only. Attributes are updated but the original `type` is preserved
- **Batch upsert** (`POST /ngsi-ld/v1/entityOperations/upsert`): Matches entities by `entityId` only. Attributes are updated (type handling follows upsert semantics)
- **Batch create** (`POST /ngsi-ld/v1/entityOperations/create`): Returns `207` with per-entity error details for duplicate IDs
- The NGSIv2 `?type=` parameter for type disambiguation among same-ID entities is no longer applicable

This unification eliminates a class of interoperability issues where NGSIv2 type-based disambiguation would conflict with NGSI-LD's unique ID model.

### NGSI-LD URI Requirements

The NGSI-LD specification recommends that entity IDs be in URI format.

**Recommended format (URN):**

```text
urn:ngsi-ld:{EntityType}:{LocalId}
```

**Examples:**

```text
urn:ngsi-ld:Room:001
urn:ngsi-ld:Vehicle:ABC123
urn:ngsi-ld:WeatherObserved:Tokyo-2026-02-08
```

**NGSIv2 compatibility:**

- NGSIv2 allows any string to be used as an ID (e.g., `Room1`, `sensor-abc`)
- Using URN format is recommended regardless of which API you use, for consistency and future migration

**Best practices:**

- Use URN format for all entities, even when using the NGSIv2 API
- When migrating from NGSIv2 to NGSI-LD, entities must be re-created via the NGSI-LD API (protocol isolation prevents cross-API access)

---

## Federation

GeonicDB's federation feature automatically detects the protocol of remote context providers.

### Automatic Protocol Detection

For registered remote providers, GeonicDB detects the protocol in the following order:

1. **Explicit specification** - If `information.format` is specified at registration time, that protocol is used
2. **Auto-detection** - Automatic detection from the URL path:
   - Contains `/v2/` → NGSIv2
   - Contains `/ngsi-ld/` → NGSI-LD
   - Otherwise → NGSIv2 (default)

### Federation from NGSIv2

**Register with NGSIv2:**

```bash
curl -X POST http://localhost:3000/v2/registrations \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: demo" \
  -d '{
    "dataProvided": {
      "entities": [
        { "id": "urn:ngsi-ld:Vehicle:V999", "type": "Vehicle" }
      ],
      "attrs": ["speed", "location"]
    },
    "provider": {
      "http": {
        "url": "http://remote-provider.example.com/ngsi-ld/v1"
      }
    }
  }'
```

**Querying with NGSIv2 automatically forwards to the NGSI-LD provider:**

```bash
curl http://localhost:3000/v2/entities/urn:ngsi-ld:Vehicle:V999 \
  -H "Fiware-Service: demo"
```

**Behavior:**

1. GeonicDB detects that `urn:ngsi-ld:Vehicle:V999` does not exist locally
2. Identifies `http://remote-provider.example.com/ngsi-ld/v1` from the registration information
3. Forwards the query using the NGSI-LD protocol: `GET /ngsi-ld/v1/entities/urn:ngsi-ld:Vehicle:V999`
4. Converts the response from NGSI-LD → internal format → NGSIv2 and returns it to the client

### Federation from NGSI-LD

**Register with NGSI-LD:**

```bash
curl -X POST http://localhost:3000/ngsi-ld/v1/csourceRegistrations \
  -H "Content-Type: application/ld+json" \
  -H "Fiware-Service: demo" \
  -d '{
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
    "type": "ContextSourceRegistration",
    "information": [
      {
        "entities": [
          { "id": "urn:ngsi-ld:Sensor:S888", "type": "Sensor" }
        ]
      }
    ],
    "endpoint": "http://legacy-system.example.com/v2"
  }'
```

**Querying with NGSI-LD automatically forwards to the NGSIv2 provider:**

```bash
curl http://localhost:3000/ngsi-ld/v1/entities/urn:ngsi-ld:Sensor:S888 \
  -H "Fiware-Service: demo"
```

**Behavior:**

1. GeonicDB detects that `urn:ngsi-ld:Sensor:S888` does not exist locally
2. Identifies `http://legacy-system.example.com/v2` from the registration information
3. Forwards the query using the NGSIv2 protocol: `GET /v2/entities/urn:ngsi-ld:Sensor:S888`
4. Converts the response from NGSIv2 → internal format → NGSI-LD and returns it to the client

---

## Use Cases and Best Practices

### Which API Should You Use?

#### When to Choose NGSIv2

- **Existing FIWARE Orion-compatible systems** - Integration with legacy systems
- **Simple IoT data management** - Sensor data collection and visualization
- **Lower learning curve** - Simpler specification than NGSI-LD
- **Rich existing documentation and tools** - Mature NGSIv2 ecosystem

**Recommended use cases:**

- IoT sensor networks
- Basic smart city data collection
- Prototyping and PoC

#### When to Choose NGSI-LD

- **Semantic Web / Linked Data** - Leveraging JSON-LD and RDF
- **Complex entity relationships** - Using Relationship and LanguageProperty
- **International standard compliance** - Systems conforming to ETSI standards
- **Future extensibility** - The NGSI-LD specification continues to be extended

**Recommended use cases:**

- Data catalogs leveraging Smart Data Models
- Systems requiring multilingual support
- Systems needing to express complex relationships between entities
- Data integration and open data publication

#### Running Both APIs

GeonicDB supports both APIs simultaneously, but entities are protocol-isolated. Each API operates independently on its own set of entities.

**Recommended approach:**

1. **Choose one API per use case** - Avoid mixing protocols for the same data. Pick NGSIv2 or NGSI-LD based on your requirements and stick with it
2. **Use Federation for cross-protocol needs** - If an NGSIv2 client needs to access NGSI-LD entities (or vice versa), register a context source via Federation
3. **Migration requires re-creation** - To migrate entities from NGSIv2 to NGSI-LD, export them from the NGSIv2 API and re-create them via the NGSI-LD API. There is no automatic cross-protocol migration

### Best Practices

#### 1. Use URN Format for Entity IDs

**Recommended:**

```text
urn:ngsi-ld:Room:001
```

**Not recommended:**

```text
Room1
sensor-abc
```

Reason: Conforms to the NGSI-LD specification and maintains compatibility across both APIs.

#### 2. Use GeoJSON for Geospatial Data

**Recommended (NGSIv2):**

```json
{
  "location": {
    "type": "geo:json",
    "value": {
      "type": "Point",
      "coordinates": [139.7671, 35.6812]
    }
  }
}
```

**Recommended (NGSI-LD):**

```json
{
  "location": {
    "type": "GeoProperty",
    "value": {
      "type": "Point",
      "coordinates": [139.7671, 35.6812]
    }
  }
}
```

Reason: Geo-queries only support GeoJSON format.

#### 3. Leverage Smart Data Models

Use Smart Data Models types and pass the model's `@context` explicitly.

**Recommended (NGSI-LD):**

```json
{
  "id": "urn:ngsi-ld:AirQualityObserved:001",
  "type": "AirQualityObserved",
  "pm25": {
    "type": "Property",
    "value": 15.5
  }
}
```

Reason: Standard model types keep entities interoperable across brokers. Note that GeonicDB does **not** guess a `@context` from the entity `type` (#1733) — supply the model's `@context` on both writes and reads (JSON-LD `Link` header, or the body for `application/ld+json` writes). Without one, responses use the NGSI-LD core `@context` only and render unmapped terms as fully qualified URIs, per ETSI GS CIM 009 clause 5.5.5 / 5.5.7.

#### 4. Choose Subscriptions Based on Purpose

| Purpose | Recommended Channel | Reason |
|---------|---------------------|--------|
| Web apps (real-time updates) | WebSocket | Low latency, no server required |
| Server-to-server integration | HTTP Webhook | Reliability, retry functionality |
| IoT devices | MQTT | Lightweight, QoS guarantees |

#### 5. Leverage Tenant Isolation

Use the `Fiware-Service` header to isolate tenants.

```bash
# Create entity in tenant "demo"
curl -X POST http://localhost:3000/v2/entities \
  -H "Fiware-Service: demo" \
  -d '{...}'

# Create entity in tenant "prod"
curl -X POST http://localhost:3000/v2/entities \
  -H "Fiware-Service: prod" \
  -d '{...}'
```

Reason: Enables separation of development and production environments, and isolation of data per customer.

---

## Summary

| Item | NGSIv2 | NGSI-LD | GeonicDB Behavior |
|------|--------|---------|-------------------|
| **Protocol** | REST/JSON | REST/JSON-LD | Both supported; entities isolated by `protocol` field |
| **Entity isolation** | `protocol: 'ngsiv2'` | `protocol: 'ngsild'` | Each API only sees its own entities |
| **Entity ID** | Any string | URI (URN recommended) | URN recommended. **ID is unique per tenant + servicePath** (type disambiguation removed) |
| **Attribute types** | Simple (Number, Text, etc.) | Semantic (Property, Relationship, etc.) | Type mapping rules define the correspondence (see table above) |
| **System attributes** | `dateCreated`, `dateModified` | `createdAt`, `modifiedAt` | Unified internally, converted per API |
| **Geo-queries** | ✅ | ✅ | Shared feature |
| **Subscriptions** | ✅ (HTTP, MQTT, WebSocket) | ✅ (HTTP, MQTT, WebSocket) | Shared feature |
| **Federation** | ✅ | ✅ | Automatic protocol detection; enables cross-protocol access |
| **Cross-protocol access** | Not supported directly | Not supported directly | Use Federation for cross-protocol needs |
| **Use cases** | IoT, legacy systems | Semantic Web, open data | Choose one API per use case |

GeonicDB provides both NGSIv2 and NGSI-LD APIs with strict protocol isolation. Choose the API that best fits your use case, and leverage Federation when cross-protocol access is required.

---

## Related Documentation

- [API Common Specification](../api-reference/endpoints.md)
- [NGSIv2 API](../api-reference/ngsiv2.md)
- [NGSI-LD API](../api-reference/ngsild.md)
- [Smart Data Models](../features/smart-data-models.md)
