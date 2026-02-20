---
title: "NGSIv2 vs NGSI-LD"
description: "Interoperability between NGSIv2 and NGSI-LD"
outline: deep
---
# NGSIv2 / NGSI-LD Interoperability

GeonicDB supports both NGSIv2 and NGSI-LD in a single Context Broker, enabling interoperability through a protocol-independent internal format.

## Table of Contents

- [Overview](#overview)
- [Unified Internal Format](#unified-internal-format)
- [Cross-API Access](#cross-api-access)
- [Attribute Type Mapping Table](#attribute-type-mapping-table)
- [System Attribute Differences](#system-attribute-differences)
- [Output Format Differences](#output-format-differences)
- [Common Features](#common-features)
- [NGSI-LD Specific Features](#ngsi-ld-specific-features)
- [Entity ID Notes](#entity-id-notes)
- [Federation](#federation)
- [Use Cases and Best Practices](#use-cases-and-best-practices)

---

## Overview

GeonicDB's dual API architecture supports both FIWARE NGSIv2 and ETSI NGSI-LD specifications.

### Architecture

```text
NGSIv2 API (/v2) ───┐
                    ├──> Unified Internal Format ──> MongoDB
NGSI-LD API (LD/v1) ┘
```

- Both APIs share the same MongoDB storage
- Entities are stored in an API-independent, protocol-agnostic format
- Conversion from each API format to internal format on request
- Conversion from internal format to each API format on response

### Interoperability Benefits

- **Migration Flexibility** - Gradual migration from NGSIv2 to NGSI-LD is possible
- **Integration with Existing Systems** - Coexistence of legacy NGSIv2 clients and new NGSI-LD clients
- **API Choice Freedom** - Select the optimal API based on use case
- **Single Data Source** - No need to manage duplicate data

---

## Unified Internal Format

GeonicDB converts data from both APIs into a unified internal format.

### Internal Entity Structure

```typescript
interface InternalEntity {
  id: string;                                    // Entity ID
  type: string;                                  // Entity Type
  attributes: Record<string, EntityAttribute>;   // Collection of attributes
  metadata?: EntityMetadata;                     // System metadata
  scope?: string[];                              // NGSI-LD scope hierarchy
  distance?: number;                             // Distance in geoquery results
  expiresAt?: string;                            // Expiration for Transient entities
}

interface EntityAttribute {
  type: string;                                  // Attribute type
  value: AttributeValue;                         // Attribute value
  metadata?: Record<string, AttributeMetadata>;  // Attribute metadata
  datasetId?: string;                            // NGSI-LD dataset ID
}

interface EntityMetadata {
  createdAt: string;   // Creation timestamp (ISO 8601)
  modifiedAt: string;  // Last modification timestamp (ISO 8601)
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
  entityType: string;       // Entity Type
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

Entities created with NGSIv2 can be retrieved with NGSI-LD (and vice versa).

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

**Retrieve same entity with NGSI-LD:**

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

**Retrieve same entity with NGSIv2:**

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

GeonicDB converts NGSIv2 types ↔ internal types ↔ NGSI-LD types according to the following rules.

### Basic Data Types

| NGSIv2 Type | Internal Type | NGSI-LD Type | Description |
|----------|-------|-----------|------|
| `Number` | `Number` | `Property` | Numeric value (integer or decimal) |
| `Text` / `String` | `String` | `Property` | String |
| `Boolean` | `Boolean` | `Property` | Boolean value |
| `DateTime` | `DateTime` | `Property` or `TemporalProperty` | ISO 8601 datetime string |
| `Null` | `Null` | `Property` | null value |

### Structured Data Types

| NGSIv2 Type | Internal Type | NGSI-LD Type | Description |
|----------|-------|-----------|------|
| `Object` | `Object` | `Property` | JSON object |
| `Array` | `Array` | `Property` or `ListProperty` | JSON array |
| `StructuredValue` | `Object` | `Property` | Structured data |

### Geospatial Types

| NGSIv2 Type | Internal Type | NGSI-LD Type | Description |
|----------|-------|-----------|------|
| `geo:json` | `GeoJSON` | `GeoProperty` | GeoJSON (Point, LineString, Polygon) |
| `geo:point` | `GeoJSON` (Point) | `GeoProperty` | Latitude/longitude point |

### NGSI-LD Specific Types

The following NGSI-LD specific types are retained internally but treated as `Property` in the NGSIv2 API.

| NGSI-LD Type | Internal Type | NGSIv2 Conversion | Description |
|-----------|-------|-----------|------|
| `Relationship` | `Relationship` | `Relationship` (custom type) | Entity reference (contains `object` property) |
| `LanguageProperty` | `LanguageProperty` | `StructuredValue` | Multi-language string (contains `languageMap` property) |
| `JsonProperty` | `JsonProperty` | `Object` | JSON data (contains `json` property) |
| `VocabProperty` | `VocabProperty` | `Object` | Vocabulary data (contains `vocab` or `vocabMap` property) |
| `ListProperty` | `ListProperty` | `Array` | Ordered array (contains `valueList` property) |
| `ListRelationship` | `ListRelationship` | `Array` | Array of entity references (contains `objectList` property) |

### Metadata Type Mapping

| NGSIv2 Metadata Name | NGSI-LD Property | Description |
|-------------------|------------------|------|
| `unit` (Text) | `unitCode` (string) | Unit (e.g., "CEL", "KMH") |
| `observedAt` (DateTime) | `observedAt` (ISO 8601) | Observation timestamp |
| `datasetId` (Text) | `datasetId` (URI) | Dataset ID |

---

## System Attribute Differences

Entity metadata (creation/modification timestamps) have different names depending on the API.

### NGSIv2 System Attributes

| Attribute Name | Type | Description |
|-------|---|------|
| `dateCreated` | `DateTime` | Entity creation timestamp (ISO 8601) |
| `dateModified` | `DateTime` | Entity last modification timestamp (ISO 8601) |

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
|-------|---|------|
| `createdAt` | ISO 8601 string | Entity creation timestamp |
| `modifiedAt` | ISO 8601 string | Entity last modification timestamp |

**Note:** When using the `pick` parameter, only `@context`, `id`, and `type` are selected; `createdAt` and `modifiedAt` are not included (exception).

**Example (NGSI-LD response, system attributes are always included):**

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
|-----|------------------|------|
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
|-----|---------------|------|
| **normalized** (default) | `application/ld+json` | Full format including type and metadata |
| **concise** | `application/ld+json` + `options=concise` | Concise format (abbreviated notation) |
| **keyValues** | `application/ld+json` + `options=keyValues` | Key-values only |

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

## Common Features

The following features are shared between both APIs.

### 1. Query Language

| Feature | NGSIv2 | NGSI-LD | Description |
|-----|-------|---------|------|
| **Simple Query** | `q` parameter | `q` parameter | Attribute value filter (e.g., `temperature>20;humidity<80`) |
| **Metadata Query** | `mq` parameter | `q` parameter (metadata can also be queried) | Metadata filter |
| **Scope Query** | (not supported) | `scopeQ` parameter | Scope hierarchy filter |

**Basic Examples:**

```bash
# NGSIv2: Entities with temperature above 20 degrees
curl 'http://localhost:3000/v2/entities?type=Room&q=temperature>20'

# NGSI-LD: Entities with temperature above 20 degrees
curl 'http://localhost:3000/ngsi-