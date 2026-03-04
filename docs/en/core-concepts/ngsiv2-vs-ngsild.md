---
title: "NGSIv2 vs NGSI-LD"
description: "NGSIv2 and NGSI-LD interoperability"
outline: deep
---
# NGSIv2 / NGSI-LD Interoperability

GeonicDB supports both NGSIv2 and NGSI-LD in a single Context Broker, enabling interoperability through a protocol-agnostic internal format.

## Table of Contents

- [Overview](#overview)
- [Unified Internal Format](#unified-internal-format)
- [Cross-API Access](#cross-api-access)
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

GeonicDB's dual API architecture supports both the FIWARE NGSIv2 and ETSI NGSI-LD specifications.

### Architecture

```text
NGSIv2 API (/v2) ───┐
                    ├──> Unified Internal Format ──> MongoDB
NGSI-LD API (/ngsi-ld/v1) ┘
```





- Both APIs share the same MongoDB storage
- Entities are stored in a protocol-agnostic format independent of the API used
- On request: each API format is converted to the internal format
- On response: the internal format is converted back to each API format

### Benefits of Interoperability

- **Migration flexibility** - Enables gradual migration from NGSIv2 to NGSI-LD
- **Integration with existing systems** - Allows coexistence of legacy NGSIv2 clients and new NGSI-LD clients
- **Freedom of API choice** - Select the optimal API for each use case
- **Single data source** - No need to manage duplicate data

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

## Cross-API Access

Entities created with NGSIv2 can be retrieved via NGSI-LD (and vice versa).

### Example 1: Create with NGSIv2 → Retrieve with NGSI-LD

**Create entity with NGSIv2:**

```bash
curl -X POST http://localhost:3000/v2/entities \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: demo" \
  -d '{
    "id": "urn:ngsi-ld:Room:001",
    "type": "Room",
    "temperature": {
      "type": "Number",
      "value": 23.5,
      "metadata": {
        "unit": {
          "type": "Text",
          "value": "Celsius"
        }
      }
    },
    "humidity": {
      "type": "Number",
      "value": 60
    }
  }'
```























**Retrieve the same entity with NGSI-LD:**

```bash
curl http://localhost:3000/ngsi-ld/v1/entities/urn:ngsi-ld:Room:001 \
  -H "Fiware-Service: demo"
```




**Response (NGSI-LD format):**

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "id": "urn:ngsi-ld:Room:001",
  "type": "Room",
  "temperature": {
    "type": "Property",
    "value": 23.5,
    "unitCode": "Celsius"
  },
  "humidity": {
    "type": "Property",
    "value": 60
  },
  "createdAt": "2026-02-08T10:00:00.000Z",
  "modifiedAt": "2026-02-08T10:00:00.000Z"
}
```


















### Example 2: Create with NGSI-LD → Retrieve with NGSIv2

**Create entity with NGSI-LD:**

```bash
curl -X POST http://localhost:3000/ngsi-ld/v1/entities \
  -H "Content-Type: application/ld+json" \
  -H "Fiware-Service: demo" \
  -d '{
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
    "id": "urn:ngsi-ld:Vehicle:V123",
    "type": "Vehicle",
    "speed": {
      "type": "Property",
      "value": 55.5,
      "unitCode": "KMH",
      "observedAt": "2026-02-08T10:00:00Z"
    },
    "location": {
      "type": "GeoProperty",
      "value": {
        "type": "Point",
        "coordinates": [139.7671, 35.6812]
      }
    }
  }'
```























**Retrieve the same entity with NGSIv2:**

```bash
curl http://localhost:3000/v2/entities/urn:ngsi-ld:Vehicle:V123 \
  -H "Fiware-Service: demo"
```




**Response (NGSIv2 format):**

```json
{
  "id": "urn:ngsi-ld:Vehicle:V123",
  "type": "Vehicle",
  "speed": {
    "type": "Number",
    "value": 55.5,
    "metadata": {
      "unit": {
        "type": "Text",
        "value": "KMH"
      },
      "observedAt": {
        "type": "DateTime",
        "value": "2026-02-08T10:00:00Z"
      }
    }
  },
  "location": {
    "type": "geo:json",
    "value": {
      "type": "Point",
      "coordinates": [139.7671, 35.6812]
    }
  }
}
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
| **Scope Query** | (not supported) | `scopeQ` parameter | Scope hierarchy filter |

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

For details, see the "API Specification" section in [DEVELOPMENT.md](../getting-started/installation.md).

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










**When retrieved via NGSIv2:**

```json
{
  "id": "urn:ngsi-ld:Vehicle:V123",
  "type": "Vehicle",
  "owner": {
    "type": "Relationship",
    "value": {
      "object": "urn:ngsi-ld:Person:P456"
    }
  }
}
```












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











**When retrieved via NGSIv2:**

```json
{
  "id": "urn:ngsi-ld:Museum:M001",
  "type": "Museum",
  "name": {
    "type": "StructuredValue",
    "value": {
      "languageMap": {
        "en": "Tokyo National Museum",
        "ja": "東京国立博物館"
      }
    }
  }
}
```















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

- In the NGSIv2 API, `scope` is treated as a regular attribute
- The `scopeQ` query is not supported

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

Excludes