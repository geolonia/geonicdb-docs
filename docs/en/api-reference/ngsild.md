---
title: "NGSI-LD API"
description: "NGSI-LD API リファレンス"
outline: deep
---
# NGSI-LD API

> This document has been separated from [API.md](./endpoints.md). For the main API specification, refer to [API.md](./endpoints.md).

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
| `application/ld+json` | JSON-LD | `@context` is included in the response body |
| `application/json` | JSON | `@context` is returned via the `Link` header |
| `application/geo+json` | GeoJSON | `@context` is returned via the `Link` header |

When `Accept: application/json`, the response includes a `Link` header:

```http
Link: <https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"
```



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
| `offset` | integer | Offset | 0 |
| `orderBy` | string | Sort criteria (`entityId`, `entityType`, `modifiedAt`) | - |
| `orderDirection` | string | Sort direction (`asc`, `desc`) | `asc` |
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
- Status: `201 Created`- Status: `409 AlreadyExists` if an entity with the same ID already exists (regardless of type)
- Header: `Location: /ngsi-ld/v1/entities/urn:ngsi-ld:Room:001`
> **Note**: Entity IDs are unique within a tenant and service path scope. Creating an entity with the same ID but a different type returns `409 AlreadyExists`. See [Entity ID Uniqueness](./endpoints.md#entity-id-uniqueness-geonicdb-extension) for details.

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

- Using `Content-Type: application/merge-patch+json`, attributes not included in the request body are preserved (merge mode). With the standard `application/json` / `application/ld+json`, all attributes are replaced.
- Specifying `urn:ngsi-ld:null` as a property value deletes that attribute.
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




Partially updates multiple attributes of an entity. Only attributes included in the request body are updated; attributes not included are preserved.

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

When retrieving an entity, multi-attributes are returned in array format. In `keyValues` format, only the value of the default instance (without `datasetId`) is returned.

#### Update (UPDATE)

When updating attributes (PATCH/POST), specifying `datasetId` allows updating only a specific instance.

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
- All successful: `201 Created`- Partial success: `207 Multi-Status`
#### Batch Upsert

```http
POST /ngsi-ld/v1/entityOperations/upsert
```



**Query Parameters**

| Parameter | Description |
|-----------|------|
| `options=replace` | Replace all attributes of existing entities |

**Response**
- All successful: `201 Created` (new creation) or `204 No Content` (update)
- Partial success: `207 Multi-Status`
#### Batch Update

```http
POST /ngsi-ld/v1/entityOperations/update
```



**Response**
- All successful: `204 No Content`- Partial success: `207 Multi-Status`
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
- All successful: `204 No Content`- Partial success: `207 Multi-Status`
#### Entity Purge

```http
POST /ngsi-ld/v1/entityOperations/purge
Content-Type: application/json
```




Bulk deletes entities of the specified type. Compliant with ETSI NGSI-LD specification Section 5.6.14.

**Query Parameters**

| Parameter | Type | Description |
|-----------|-----|------|
| `type` | string | Entity type to delete (required) |

**Response**
- Success: `204 No Content`- Type not specified: `400 Bad Request`
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












**Response**: Array of entities

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
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
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
- All successful: `204 No Content`- Partial success: `207 Multi-Status`
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









**Response**: __INLINE_CODE_135