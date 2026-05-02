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
| `geo:json` | `GeoJSON` | `GeoProperty` | GeoJSON (Point, LineString, Polygon) |
| `geo:point` | `GeoJSON` (Point) | `GeoProperty` | Latitude/longitude point |

### NGSI-LD-Specific Types

The following NGSI-LD-specific types are preserved internally but are treated as `Property` by the NGSIv2 API.

| NGSI-LD Type | Internal Type | NGSIv2 Conversion | Description |
|--------------|---------------|-------------------|-------------|
| `Relationship` | `Relationship` | `Relationship` (custom type) | Entity reference (includes `object` property) |
| `LanguageProperty` | `LanguageProperty` | `StructuredValue` | Multilingual string (includes `languageMap` property) |
| `JsonProperty` | `JsonProperty` | `Object` | JSON data (includes `json` property) |
| `VocabProperty` | `VocabProperty` | `Object` | Vocabulary data (includes `vocab` or `vocabMap` property) |
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

| Format | Accept Header | Description |
|--------|---------------|-------------|
| **normalized** (default) | `application/ld+json` | Full format including type and metadata |
| **concise** | `application/ld+json` + `options=concise` | Concise format (abbreviated notation) |
| **keyValues** | `application/ld+json` + `options=keyValues` | Key-value pairs only |

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

For details, see the "API Specification" section in DEVELOPMENT.md.

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
| **Loop detection** | ✅ | ✅ | Loop detection via `Via` header |

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

GeonicDB automatically completes Smart Data Models `@context`.

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

Reason: When `type` matches a Smart Data Models model name, the appropriate `@context` is automatically completed.

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
- [FIWARE Orion Comparison](../migration/compatibility-matrix.md)
