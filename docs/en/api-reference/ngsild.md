---
title: "NGSI-LD API"
description: "NGSI-LD API reference"
outline: deep
---
# NGSI-LD API

> This document has been separated from [API.md](./endpoints.md). Please refer to [API.md](./endpoints.md) for the main API specifications.

---

NGSI-LD is a JSON-LD based context information management API.

## Specification Compliance

This document conforms to **[ETSI GS CIM 009 V1.9.1 (2025-07)](https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/01.09.01_60/gs_CIM009v010901p.pdf)**. For details on each feature, refer to the following ETSI specification sections:

| Feature Category | ETSI GS CIM 009 Section |
|-------------|---------------------------|
| Entity Operations | Section 5.6 |
| Query Operations | Section 5.7 |
| Subscriptions | Section 5.8 |
| Context Source Registration | Section 5.9 |
| Temporal API | Section 5.6.12-5.6.19 |
| EntityMaps | Section 5.14 |
| JSON-LD Context Management | Section 5.11 |
| Distributed Operations | Section 5.10 |

### Content Negotiation and @context

The NGSI-LD API supports content negotiation via the `Accept` header.

| Accept Header | Response Format | @context Handling |
|----------------|--------------|----------------|
| `application/ld+json` | JSON-LD | Includes `@context` in response body |
| `application/json` | JSON | Returns `@context` in `Link` header |
| `application/geo+json` | GeoJSON | Returns `@context` in `Link` header |

When `Accept: application/json` is specified, a `Link` header is added to the response:

```text
Link: <https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"
```

### Natural Language Collation (lang + orderBy)

By combining the `lang` parameter with `orderBy`, sorting based on the specified language's locale is possible. For example, `lang=ja` applies Japanese collation order for sorting.

### Entity Operations (NGSI-LD)

> **ETSI GS CIM 009 Reference**: Section 5.6 - Entity Operations

#### Retrieve Entity List

```http
GET /ngsi-ld/v1/entities
```

**Request Headers**

```text
Accept: application/ld+json
Link: <https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"
```

**Query Parameters**

| Parameter | Type | Description | Default |
|-----------|-----|------|-----------|
| `id` | string | Filter by entity ID (comma-separated, URI format) | - |
| `limit` | integer | Number of items to retrieve | 20 |
| `offset` | integer | Offset | 0 |
| `orderBy` | string | Sort criteria (`entityId`, `entityType`, `modifiedAt`) | - |
| `orderDirection` | string | Sort direction (`asc`, `desc`) | `asc` |
| `type` | string | Filter by entity type | - |
| `idPattern` | string | Entity ID regex pattern | - |
| `q` | string | Filter by attribute values | - |
| `attrs` | string | Attribute names to retrieve (comma-separated) | - |
| `pick` | string | Attribute names to retrieve (comma-separated, exclusive with `omit`) | - |
| `omit` | string | Attribute names to exclude (comma-separated, exclusive with `pick`, cannot exclude `id`/`type`) | - |
| `scopeQ` | string | Scope query (e.g., `/Madrid`, `/Madrid/#`, `/Madrid/+`) | - |
| `lang` | string | LanguageProperty language filter (BCP 47, comma-separated priority order, `*` for all languages) | - |
| `georel` | string | Geo-query operator | - |
| `geometry` | string | Geometry type | - |
| `coordinates` | string | Coordinates | - |
| `spatialId` | string | Filter by spatial ID (ZFXY format) (see [Spatial ID Search](./endpoints.md#spatial-id-search)) | - |
| `spatialIdDepth` | integer | Spatial ID hierarchy expansion depth (0-4) | 0 |
| `crs` | string | Coordinate reference system (see [Coordinate Reference System (CRS)](./endpoints.md#coordinate-reference-system-crs)). URN format also supported | `EPSG:4326` |
| `geoproperty` | string | GeoProperty name to use for geo-query | `location` |
| `format` | string | Output format (`simplified` for keyValues format, `geojson` for GeoJSON format). GeoJSON can also be specified with `Accept: application/geo+json` header | - |
| `expandValues` | string | Attribute names to expand (comma-separated, returns expanded values) | - |
| `options` | string | `keyValues`, `concise`, `entityMap`, `sysAttrs` (output system attributes), `splitEntities` (split response by type) | - |

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
| `NGSILD-Results-Count` | Total count (always returned) |

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

**Transient Entity (expiresAt)**

When an `expiresAt` field (ISO 8601 format) is specified in an entity, it is created as a Transient Entity with an expiration time. The expiration time must be a future date/time.

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
- Header: `Location: /ngsi-ld/v1/entities/urn:ngsi-ld:Room:001`

#### Retrieve Single Entity

```http
GET /ngsi-ld/v1/entities/{entityId}
```

**Query Parameters**

| Parameter | Type | Description |
|-----------|-----|------|
| `type` | string | Entity type |
| `attrs` | string | Attribute names to retrieve (comma-separated) |
| `pick` | string | Attribute names to retrieve (comma-separated, exclusive with `omit`) |
| `omit` | string | Attribute names to exclude (comma-separated, exclusive with `pick`, cannot exclude `id`/`type`) |
| `lang` | string | LanguageProperty language filter (BCP 47) |
| `options` | string | `keyValues`, `concise`, `entityMap` |

#### Replace Entity

```http
PUT /ngsi-ld/v1/entities/{entityId}
```

Replaces all attributes of an entity. Attributes not included in the request body are deleted.

**Response**: `204 No Content`

#### Update Entity

```http
PATCH /ngsi-ld/v1/entities/{entityId}
```

**Merge-Patch Semantics** (ETSI GS CIM 009 Section 5.6.4):

- Using `Content-Type: application/merge-patch+json` preserves attributes not included in the request body (merge mode). With standard `application/json` / `application/ld+json`, all attributes are replaced.
- Specifying `urn:ngsi-ld:null` as a property value deletes that attribute.
- Specifying query parameter `options=keyValues` or `options=concise` allows using simplified input format.

**Response**: `204 No Content`

#### Append Attributes

```http
POST /ngsi-ld/v1/entities/{entityId}
Content-Type: application/ld+json
```

**Query Parameters**

| Parameter | Description |
|-----------|------|
| `options=noOverwrite` | Do not overwrite existing attributes (preserve existing attributes and only add new ones) |

**Response**: `204 No Content`

#### Partial Update of Attributes (Multiple)

```http
PATCH /ngsi-ld/v1/entities/{entityId}/attrs
Content-Type: application/ld+json
```

Partially updates multiple attributes of an entity. Only attributes included in the request body are updated, and attributes not included are preserved.

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

#### Retrieve All Entity Attributes

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

> **Note**: Returns `404 Not Found` if the entity or attribute does not exist (ETSI GS CIM 009 V1.9.1 clause 5.6.4). This operation only performs partial updates of existing attributes and does not create new attributes.

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

### Multi-Attribute (datasetId)

> **ETSI GS CIM 009 Reference**: Section 4.5.3 - Multi-Attribute

In NGSI-LD, multiple instances can be maintained for the same attribute name. Each instance is distinguished by a `datasetId` (URI format). Instances without a `datasetId` are called "default instances", with a maximum of one per attribute.

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

In the above example, the `speed` attribute has 3 instances: GPS-derived, OBD-derived, and the default instance.

#### Retrieve (RETRIEVE)

When retrieving an entity, multi-attributes are returned in array format. In `keyValues` format, only the default instance (without `datasetId`) value is returned.

#### Update (UPDATE)

When updating attributes (PATCH/POST), specifying a `datasetId` allows updating only a specific instance.

```json
{
  "speed": {
    "type": "Property",
    "value": 60,
    "datasetId": "urn:ngsi-ld:dataset:gps"
  }
}
```

#### Delete (DELETE)

When deleting an attribute, specifying the `datasetId` query parameter deletes only the specific instance. Specifying `deleteAll=true` deletes all instances.

```http
DELETE /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}?datasetId=urn:ngsi-ld:dataset:gps
DELETE /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}?deleteAll=true
```

---

### Batch Operations (NGSI-LD)

> **Note**: Batch operations can process a maximum of **1,000 entities** per request. Requests exceeding 1,000 entities will result in a `400 Bad Request` error.

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
    "@context": "https://uri.etsi.org/ngsi-ld/v1