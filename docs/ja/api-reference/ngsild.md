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
- Status: `201 Created`
- Status: `409 AlreadyExists` if an entity with the same ID already exists (regardless of type)
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
- All successful: `201 Created`
- Partial success: `207 Multi-Status`

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
POST /ngsi-ld/v1/entityOperations/purge
Content-Type: application/json
```

Bulk deletes entities of the specified type. Compliant with ETSI NGSI-LD specification Section 5.6.14.

**Query Parameters**

| Parameter | Type | Description |
|-----------|-----|------|
| `type` | string | Entity type to delete (required) |

**Response**
- Success: `204 No Content`
- Type not specified: `400 Bad Request`

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
| `lastN` | integer | Return only the latest N instances (positive integer, ETSI GS CIM 009 Section 5.6.12) |
| `options` | string | `temporalValues`: Simplified temporal representation |

**lastN Parameter**

Specifying `lastN` returns only the latest N instances of temporal data. Combined with `timerel`/`timeAt`, you can retrieve the latest N instances within a time range.

```bash
# Retrieve the latest 10 temporal data instances
curl "http://localhost:3000/ngsi-ld/v1/temporal/entities/urn:ngsi-ld:Sensor:001?lastN=10" \
  -H "Fiware-Service: myservice"
```

#### Temporal Response Format Options

Specifying `options=temporalValues` returns each attribute in a simplified format with a `values` array (pairs of `[value, timestamp]`).

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

#### Temporal Aggregation Query (Single Entity)

Aggregation queries can be executed on temporal entity GET endpoints using the `aggrMethods` and `aggrPeriodDuration` query parameters. Available on both the list retrieval endpoint and the single entity retrieval endpoint.

| Parameter | Type | Description |
|-----------|-----|------|
| `aggrMethods` | string | Aggregation methods (comma-separated): `totalCount`, `distinctCount`, `sum`, `avg`, `min`, `max`, `stddev`, `sumsq` |
| `aggrPeriodDuration` | string | ISO 8601 duration (e.g., `PT1H` for 1 hour). Required when `aggrMethods` is specified |

**Example**: `GET /ngsi-ld/v1/temporal/entities/{entityId}?aggrMethods=avg&aggrPeriodDuration=PT1H&timerel=after&timeAt=2024-01-01T00:00:00Z`

```json
{
  "id": "urn:ngsi-ld:Sensor:1",
  "type": "Sensor",
  "temperature": {
    "type": "Property",
    "values": [
      {
        "@value": { "avg": 21.0 },
        "observedAt": "2024-01-01T10:00:00Z",
        "endAt": "2024-01-01T11:00:00Z"
      }
    ]
  }
}
```

> **Note**: Specifying `aggrMethods` without `aggrPeriodDuration` returns a `400 Bad Request` error.

> **Note**: Aggregation queries are **not supported for encrypted tenants** (tenants with `encryptionEnabled: true`). Since attribute values are encrypted at rest, MongoDB aggregation pipelines cannot perform numeric operations on encrypted data. Requesting aggregation on an encrypted tenant returns `400 Bad Request`. Use the `temporalValues` endpoint to retrieve decrypted values and perform aggregation in the application layer.

---

### Entity Type Operations (NGSI-LD)

#### Retrieve Type List

```http
GET /ngsi-ld/v1/types
```

**Parameters**: `limit`, `offset`

**Response** (200):
```json
[
  {
    "id": "urn:ngsi-ld:EntityType:Room",
    "type": "EntityType",
    "typeName": "Room",
    "attributeNames": ["temperature", "pressure"],
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld"
  }
]
```

**Header**: Total count returned via `NGSILD-Results-Count`

#### Retrieve Type Details

```http
GET /ngsi-ld/v1/types/{typeName}
```

**Response** (200):
```json
{
  "id": "urn:ngsi-ld:EntityType:Room",
  "type": "EntityTypeInformation",
  "typeName": "Room",
  "entityCount": 5,
  "attributeDetails": [
    {
      "id": "temperature",
      "type": "Attribute",
      "attributeTypes": ["Property"]
    }
  ],
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld"
}
```

**Error**: 404 (if the type does not exist)

### Attribute Operations (NGSI-LD)

#### Retrieve Attribute List

```http
GET /ngsi-ld/v1/attributes
```

**Parameters**: `limit`, `offset`

**Response** (200):
```json
[
  {
    "id": "urn:ngsi-ld:Attribute:temperature",
    "type": "Attribute",
    "attributeName": "temperature",
    "typeNames": ["Room", "Sensor"],
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld"
  }
]
```

**Header**: Total count returned via `NGSILD-Results-Count`

#### Retrieve Attribute Details

```http
GET /ngsi-ld/v1/attributes/{attrName}
```

**Response** (200):
```json
{
  "id": "urn:ngsi-ld:Attribute:temperature",
  "type": "Attribute",
  "attributeName": "temperature",
  "attributeCount": 5,
  "typeNames": ["Room", "Sensor"],
  "attributeTypes": ["Property"],
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld"
}
```

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
| `showChanges` | boolean | If `true`, includes the previous attribute value as `previousValue` in the notification data |
| `notification.onlyChangedAttrs` | boolean | If `true`, includes only attributes that have actually changed in the notification payload. Can be combined with `notification.attributes` |
| `expiresAt` | string (ISO 8601) | Subscription expiration time |

**Validation**
- `watchedAttributes` and `timeInterval` are mutually exclusive. Specifying both simultaneously returns `400 Bad Request` (ETSI GS CIM 009 V1.9.1 clause 5.8.1)

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

When authentication is enabled (`AUTH_ENABLED=true`), subscription update (PATCH) and delete (DELETE) operations perform ownership verification based on the `createdBy` field. Users other than the creator who attempt these operations will receive `403 Forbidden`. The `super_admin` and `tenant_admin` roles can bypass this verification. For details, see AUTH.md.

---

### Registrations (NGSI-LD)

In NGSI-LD, external context providers are registered as Context Source Registrations.

#### Create Registration

```http
POST /ngsi-ld/v1/csourceRegistrations
Content-Type: application/ld+json
```

**Request Body**

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "type": "ContextSourceRegistration",
  "registrationName": "Weather Data Provider",
  "description": "Provides weather data for the region",
  "endpoint": "http://context-provider:8080/ngsi-ld/v1",
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

**Response**
- Status: `201 Created`
- Header: `Location: /ngsi-ld/v1/csourceRegistrations/{registrationId}`

#### Retrieve Registration List

```http
GET /ngsi-ld/v1/csourceRegistrations
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
    "id": "urn:ngsi-ld:ContextSourceRegistration:csr001",
    "type": "ContextSourceRegistration",
    "endpoint": "http://context-provider:8080/ngsi-ld/v1",
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
  "endpoint": "http://new-provider:8080/ngsi-ld/v1"
}
```

**Response**: `204 No Content`

#### Delete Registration

```http
DELETE /ngsi-ld/v1/csourceRegistrations/{registrationId}
```

**Response**: `204 No Content`

#### Ownership Verification (GeonicDB Extension)

When authentication is enabled (`AUTH_ENABLED=true`), registration update (PATCH) and delete (DELETE) operations perform ownership verification based on the `createdBy` field. Users other than the creator who attempt these operations will receive `403 Forbidden`. The `super_admin` and `tenant_admin` roles can bypass this verification. For details, see AUTH.md.

#### CSR Advanced Fields (ETSI GS CIM 009 V1.8.1)

The following advanced fields are supported for Context Source Registration:

| Field | Type | Description |
|-----------|-----|------|
| `cacheDuration` | string (ISO 8601 duration) | Cache duration for responses from the context source |
| `refreshRate` | string (ISO 8601 duration) | Interval for periodic refresh to the context source |
| `timeout` | integer (ms) | Request timeout to the context source |
| `contextSourceAlias` | string | Alias name for the context source |
| `contextSourceInfo` | object[] | Additional metadata for the context source |
| `operationGroup` | string[] | Operation groups: `federationOps`, `retrieveOps`, `updateOps`, `redirectionOps` |

### Distributed Operation Information

#### Retrieve Broker Identity

```http
GET /ngsi-ld/v1/info/sourceIdentity
```

Returns identity information for the context broker. Used for broker identification in distributed environments.

**Response**: `200 OK` (`application/ld+json`)

#### Retrieve Conformance Information

```http
GET /ngsi-ld/v1/info/conformance
```

Returns the compliance status with the NGSI-LD specification.

**Response**: `200 OK` (`application/ld+json`)

#### Distributed Query Parameters

| Parameter | Type | Description |
|-----------|-----|------|
| `localOnly` | boolean | If `true`, skips federation and returns only local data |
| `csf` | string | Context Source Filter expression (e.g., `name==value`, `endpoint~=pattern`) |

#### Distributed Operation Response Headers

| Header | Description |
|----------|------|
| `NGSILD-Warning` | Warning message set when some context sources fail during federation (ETSI GS CIM 009 - 6.3.6) |
| `Via` | Header for loop detection in distributed operations. The broker adds its own ID to forwarded requests (ETSI GS CIM 009 - 6.3.5) |

#### CSR Change Notifications

When a Context Source Registration is created, updated, or deleted, notifications are automatically sent to the notification endpoints of matching CSource Subscriptions (ETSI GS CIM 009 - 5.11). Notifications include the `Ngsild-Trigger` header indicating the type of change (`csourceRegistration-created`, `csourceRegistration-updated`, `csourceRegistration-deleted`).

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

#### Retrieve EntityMap List

```http
GET /ngsi-ld/v1/entityMaps
```

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

**Response**: `200 OK`

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
| `joinLevel` | integer | Depth of linked entity resolution (default: 1) |

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

### Vector Tiles (NGSI-LD)

Provides entity data as GeoJSON vector tiles for map visualization. Supports TileJSON 3.0 compliant metadata and GeoJSON tile retrieval by zoom level and tile coordinates.

#### Retrieve TileJSON Metadata

```http
GET /ngsi-ld/v1/tiles
```

**Response**: `200 OK` (TileJSON 3.0 format)

#### Retrieve GeoJSON Tile

```http
GET /ngsi-ld/v1/tiles/{z}/{x}/{y}.geojson
```

**Path Parameters**

| Parameter | Type | Description |
|-----------|-----|------|
| `z` | integer | Zoom level |
| `x` | integer | Tile X coordinate |
| `y` | integer | Tile Y coordinate |

**Query Parameters**

| Parameter | Type | Description |
|-----------|-----|------|
| `type` | string | Entity type filter |
| `attrs` | string | Attributes to retrieve (comma-separated) |
| `q` | string | Attribute filter using NGSI-LD query language |
| `limit` | integer | Maximum number of results (default: 20, max: 1000) |
| `offset` | integer | Number of results to skip (default: 0) |

**Response**: `200 OK` (GeoJSON FeatureCollection format)

---

## Endpoint List

ETSI NGSI-LD compatible Context Broker API.

### Common Specifications

- **Content-Type**: `application/ld+json` or `application/json`
- **Authentication**: Required when `AUTH_ENABLED=true`
- **Tenant Isolation**: `NGSILD-Tenant` or `Fiware-Service` header
- **Pagination**: `limit`/`offset` parameters, total count always returned via `NGSILD-Results-Count` header
- **OPTIONS Method**: All NGSI-LD endpoints support the OPTIONS method. Returns a 204 response with `Allow` and `Accept-Patch` headers
- **405 Method Not Allowed**: Returns a 405 response for disallowed HTTP methods (RFC 7807 ProblemDetails format, with `Allow` header)
- **Error Format**: NGSI-LD error responses are returned in RFC 7807 ProblemDetails format (`application/json`)

### Entity Operations

| Endpoint | Method | Description | Success | Error | Pagination |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/entities` | GET | Retrieve entity list | 200 | 400, 401 | ✅ (max: 1000) |
| `/ngsi-ld/v1/entities` | POST | Create entity | 201 | 400, 401, 409, 415 | - |
| `/ngsi-ld/v1/entities/{entityId}` | GET | Retrieve entity | 200 | 400, 401, 404 | - |
| `/ngsi-ld/v1/entities/{entityId}` | PUT | Replace entity | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/entities/{entityId}` | PATCH | Update entity (merge patch) | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/entities/{entityId}` | POST | Add attributes | 204/207 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/entities/{entityId}` | DELETE | Delete entity | 204 | 401, 404 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs` | GET | Retrieve all attributes of entity | 200 | 401, 404 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs` | POST | Add attributes | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs` | PATCH | Partial attribute update | 204/207 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}` | GET | Retrieve single attribute | 200 | 401, 404 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}` | POST | Replace attribute | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}` | PUT | Replace attribute | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}` | PATCH | Partial attribute update | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}` | DELETE | Delete attribute | 204 | 401, 404 | - |

### Type Operations

| Endpoint | Method | Description | Success | Error | Pagination |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/types` | GET | Retrieve entity type list | 200 | 400, 401 | ✅ (max: 1000) |
| `/ngsi-ld/v1/types/{typeName}` | GET | Retrieve entity type details | 200 | 401, 404 | - |

### Attribute Operations

| Endpoint | Method | Description | Success | Error | Pagination |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/attributes` | GET | Retrieve attribute list | 200 | 400, 401 | ✅ (max: 1000) |
| `/ngsi-ld/v1/attributes/{attrName}` | GET | Retrieve attribute details | 200 | 401, 404 | - |

### Subscription Operations

| Endpoint | Method | Description | Success | Error | Pagination |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/subscriptions` | GET | Subscription list | 200 | 400, 401 | ✅ (max: 1000) |
| `/ngsi-ld/v1/subscriptions` | POST | Create subscription | 201 | 400, 401, 415 | - |
| `/ngsi-ld/v1/subscriptions/{subscriptionId}` | GET | Retrieve subscription | 200 | 401, 404 | - |
| `/ngsi-ld/v1/subscriptions/{subscriptionId}` | PATCH | Update subscription | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/subscriptions/{subscriptionId}` | DELETE | Delete subscription | 204 | 401, 404 | - |

### Context Source Registration Operations (Federation)

| Endpoint | Method | Description | Success | Error | Pagination |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/csourceRegistrations` | GET | Registration list | 200 | 400, 401 | ✅ (max: 1000) |
| `/ngsi-ld/v1/csourceRegistrations` | POST | Create registration | 201 | 400, 401, 415 | - |
| `/ngsi-ld/v1/csourceRegistrations/{registrationId}` | GET | Retrieve registration | 200 | 401, 404 | - |
| `/ngsi-ld/v1/csourceRegistrations/{registrationId}` | PATCH | Update registration | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/csourceRegistrations/{registrationId}` | DELETE | Delete registration | 204 | 401, 404 | - |

### Context Source Registration Subscription Operations

| Endpoint | Method | Description | Success | Error | Pagination |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/csourceSubscriptions` | GET | CSR subscription list | 200 | 400, 401 | ✅ (max: 1000) |
| `/ngsi-ld/v1/csourceSubscriptions` | POST | Create CSR subscription | 201 | 400, 401, 415 | - |
| `/ngsi-ld/v1/csourceSubscriptions/{subscriptionId}` | GET | Retrieve CSR subscription | 200 | 401, 404 | - |
| `/ngsi-ld/v1/csourceSubscriptions/{subscriptionId}` | PATCH | Update CSR subscription | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/csourceSubscriptions/{subscriptionId}` | DELETE | Delete CSR subscription | 204 | 401, 404 | - |

### Distributed Operation Information

| Endpoint | Method | Description | Success | Error |
|---------------|---------|------|------|--------|
| `/ngsi-ld/v1/info/sourceIdentity` | GET | Retrieve broker identity | 200 | - |
| `/ngsi-ld/v1/info/conformance` | GET | Retrieve NGSI-LD conformance information | 200 | - |

### JSON-LD Context Management

| Endpoint | Method | Description | Success | Error | Pagination |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/jsonldContexts` | GET | JSON-LD context list | 200 | 400, 401 | ✅ (max: 1000) |
| `/ngsi-ld/v1/jsonldContexts` | POST | Register JSON-LD context | 201 | 400, 401, 409, 415 | - |
| `/ngsi-ld/v1/jsonldContexts/{contextId}` | GET | Retrieve JSON-LD context | 200 | 401, 404 | - |
| `/ngsi-ld/v1/jsonldContexts/{contextId}` | DELETE | Delete JSON-LD context | 204 | 401, 404 | - |

### EntityMap Operations

| Endpoint | Method | Description | Success | Error | Pagination |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/entityMaps` | GET | Retrieve EntityMap list | 200 | 400, 401 | ✅ (max: 1000) |
| `/ngsi-ld/v1/entityMaps` | POST | Create EntityMap | 201 | 400, 401, 415 | - |
| `/ngsi-ld/v1/entityMaps/{entityMapId}` | GET | Retrieve EntityMap | 200 | 401, 404 | - |
| `/ngsi-ld/v1/entityMaps/{entityMapId}` | PATCH | Update EntityMap | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/entityMaps/{entityMapId}` | DELETE | Delete EntityMap | 204 | 401, 404 | - |

### Snapshot Operations

| Endpoint | Method | Description | Success | Error | Pagination |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/snapshots` | GET | Retrieve snapshot list | 200 | 400, 401 | ✅ (max: 1000) |
| `/ngsi-ld/v1/snapshots` | POST | Create snapshot | 201 | 400, 401, 415 | - |
| `/ngsi-ld/v1/snapshots` | DELETE | Purge all snapshots | 200 | 401 | - |
| `/ngsi-ld/v1/snapshots/{snapshotId}` | GET | Retrieve snapshot | 200 | 401, 404 | - |
| `/ngsi-ld/v1/snapshots/{snapshotId}` | PATCH | Update snapshot status | 204 | 400, 401, 404 | - |
| `/ngsi-ld/v1/snapshots/{snapshotId}` | DELETE | Delete snapshot | 204 | 401, 404 | - |
| `/ngsi-ld/v1/snapshots/{snapshotId}/clone` | POST | Clone snapshot (restore) | 200 | 400, 401, 404 | - |

### Batch Operations

| Endpoint | Method | Description | Success | Error | Pagination |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/entityOperations/create` | POST | Batch create (max: 1000) | 200/201 | 400, 401, 415 | - |
| `/ngsi-ld/v1/entityOperations/upsert` | POST | Batch upsert (max: 1000) | 200/201 | 400, 401, 415 | - |
| `/ngsi-ld/v1/entityOperations/update` | POST | Batch update (max: 1000) | 200/204 | 400, 401, 415 | - |
| `/ngsi-ld/v1/entityOperations/delete` | POST | Batch delete (max: 1000) | 200/204 | 400, 401, 415 | - |
| `/ngsi-ld/v1/entityOperations/query` | POST | Batch query | 200 | 400, 401, 415 | ✅ (max: 1000) |
| `/ngsi-ld/v1/entityOperations/merge` | POST | Batch merge patch (max: 1000) | 204/207 | 400, 401, 415 | - |
| `/ngsi-ld/v1/entityOperations/purge` | POST | Bulk entity purge | 204 | 400, 401, 415 | - |

### Temporal API (Time-Series Data)

| Endpoint | Method | Description | Success | Error | Pagination |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/temporal/entities` | GET | Retrieve temporal entity list | 200 | 400, 401 | ✅ (max: 1000) |
| `/ngsi-ld/v1/temporal/entities` | POST | Create temporal entity | 201 | 400, 401, 409, 415 | - |
| `/ngsi-ld/v1/temporal/entities/{entityId}` | GET | Retrieve temporal entity | 200 | 400, 401, 404 | - |
| `/ngsi-ld/v1/temporal/entities/{entityId}` | PATCH | Merge attributes of temporal entity | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/temporal/entities/{entityId}` | DELETE | Delete temporal entity | 204 | 401, 404 | - |
| `/ngsi-ld/v1/temporal/entities/{entityId}/attrs` | POST | Add attribute instance | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/temporal/entities/{entityId}/attrs/{attrName}` | DELETE | Delete attribute instance | 204 | 401, 404 | - |
| `/ngsi-ld/v1/temporal/entities/{entityId}/attrs/{attrName}/{instanceId}` | PATCH | Modify attribute instance | 204 | 400, 401, 404 | - |
| `/ngsi-ld/v1/temporal/entityOperations/create` | POST | Temporal batch create (max: 1000) | 201/207 | 400, 401, 415 | - |
| `/ngsi-ld/v1/temporal/entityOperations/upsert` | POST | Temporal batch upsert (max: 1000) | 204/207 | 400, 401, 415 | - |
| `/ngsi-ld/v1/temporal/entityOperations/delete` | POST | Temporal batch delete | 204/207 | 400, 401, 415 | - |
| `/ngsi-ld/v1/temporal/entityOperations/query` | POST | Temporal batch query | 200 | 400, 401, 415 | ✅ (max: 1000) |

### Vector Tile Operations

| Endpoint | Method | Description | Success | Error | Pagination |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/tiles` | GET | Retrieve TileJSON 3.0 metadata | 200 | 401 | - |
| `/ngsi-ld/v1/tiles/{z}/{x}/{y}.geojson` | GET | Retrieve GeoJSON tile | 200 | 400, 401 | ✅ (max: 1000) |
