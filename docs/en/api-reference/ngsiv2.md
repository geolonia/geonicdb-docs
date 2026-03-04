---
title: "NGSIv2 API"
description: "NGSIv2 API reference"
outline: deep
---
# NGSIv2 API

> This document was split from [API.md](./endpoints.md). For the main API specification, refer to [API.md](./endpoints.md).

---

## Entity Operations

### List Entities

```http
GET /v2/entities
```



**Query Parameters**

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `id` | string | Filter by entity ID (multiple values can be specified as a comma-separated list) | - |
| `limit` | integer | Number of results to retrieve (max: 1000) | 20 |
| `offset` | integer | Offset (for pagination) | 0 |
| `orderBy` | string | Sort criteria (`entityId`, `entityType`, `modifiedAt`, or attribute name). FIWARE Orion-compatible `!` prefix for descending order (e.g. `!temperature`) | - |
| `orderDirection` | string | Sort direction (`asc`, `desc`). **GeonicDB extension** (the official specification only supports the `!` prefix approach) | `asc` |
| `type` | string | Filter by entity type | - |
| `typePattern` | string | Regular expression pattern for entity type | - |
| `idPattern` | string | Regular expression pattern for entity ID | - |
| `q` | string | Filter by attribute value (see [Query Language](./endpoints.md#query-language)) | - |
| `mq` | string | Filter by metadata (see [Query Language](./endpoints.md#query-language)) | - |
| `attrs` | string | Attribute names to retrieve (comma-separated) | - |
| `metadata` | string | Metadata output control (`on`, `off`). **GeonicDB extension** (the official specification uses a comma-separated name list with `*` wildcards, etc.) | `on` |
| `georel` | string | Geo-query operator (see [Geo-queries](./endpoints.md#geo-queries)) | - |
| `geometry` | string | Geometry type | - |
| `coords` | string | Coordinates (latitude,longitude format, semicolon-separated) | - |
| `spatialId` | string | Filter by spatial ID (ZFXY format) (see [Spatial ID Search](./endpoints.md#spatial-id-search)) | - |
| `spatialIdDepth` | integer | Depth of spatial ID hierarchy expansion (0-4) | 0 |
| `crs` | string | Coordinate reference system (see [Coordinate Reference System (CRS)](./endpoints.md#coordinate-reference-system-crs)) | `EPSG:4326` |
| `options` | string | `keyValues`, `values`, `count`, `geojson`, `sysAttrs`, `unique` | - |

**Response Example**

```json
[
  {
    "id": "Room1",
    "type": "Room",
    "temperature": {
      "type": "Float",
      "value": 23.5,
      "metadata": {}
    },
    "pressure": {
      "type": "Integer",
      "value": 720,
      "metadata": {}
    }
  }
]
```


















**keyValues format** (`options=keyValues`)

```json
[
  {
    "id": "Room1",
    "type": "Room",
    "temperature": 23.5,
    "pressure": 720
  }
]
```










**count option** (`options=count`)

The `Fiware-Total-Count` header is added to the response.

**geojson option** (`options=geojson` or `Accept: application/geo+json` header)

Returns the response as a GeoJSON FeatureCollection.

```bash
# Specified via options parameter
curl "http://localhost:3000/v2/entities?type=Store&options=geojson" \
  -H "Fiware-Service: myservice"

# Specified via Accept header
curl "http://localhost:3000/v2/entities?type=Store" \
  -H "Fiware-Service: myservice" \
  -H "Accept: application/geo+json"
```










Response example:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "Store1",
      "geometry": { "type": "Point", "coordinates": [139.6917, 35.6895] },
      "properties": { "id": "Store1", "type": "Store", "name": "Tokyo Store" }
    }
  ]
}
```













The response header will have `Content-Type: application/geo+json` set.

### Create Entity

```http
POST /v2/entities
```



**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `options` | string | `upsert`: Update the entity if it already exists. `keyValues`: Interpret the request body in keyValues format |

**Request Body**

```json
{
  "id": "Room1",
  "type": "Room",
  "temperature": {
    "type": "Float",
    "value": 23.5
  },
  "pressure": {
    "type": "Integer",
    "value": 720
  }
}
```














**keyValues format input** (`options=keyValues`)

```json
{
  "id": "Room1",
  "type": "Room",
  "temperature": 23.5,
  "pressure": 720
}
```








**Upsert behavior** (`options=upsert`)

If the entity does not exist, it is created (`201 Created`); if it already exists, its attributes are updated (`204 No Content`).

**Response**
- Status: `201 Created` (new creation), `204 No Content` (updated via upsert)
- Status: `409 AlreadyExists` if an entity with the same ID already exists (regardless of type)
- Header: `Location: /v2/entities/Room1?type=Room`
> **GeonicDB Extension — Entity ID Uniqueness**: Entity IDs are unique within a tenant and service path scope. Creating an entity with the same ID but a different type is not allowed and returns `409 AlreadyExists`. This differs from the NGSIv2 specification, which permits same-ID entities with different types. See [Entity ID Uniqueness](./endpoints.md#entity-id-uniqueness-geonicdb-extension) for details.

### Get Single Entity

```http
GET /v2/entities/{entityId}
```



**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Entity type (optional filter; type disambiguation is no longer needed as entity IDs are unique — see [Entity ID Uniqueness](./endpoints.md#entity-id-uniqueness-geonicdb-extension)) |
| `attrs` | string | Attribute names to retrieve (comma-separated) |
| `options` | string | `keyValues`, `values` |

### Update Entity (PATCH)

```http
PATCH /v2/entities/{entityId}/attrs
```



Updates only the specified attributes. Non-existent attributes will be added.

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Entity type |

**Request Body**

```json
{
  "temperature": {
    "type": "Float",
    "value": 25.0
  }
}
```








**Response**: `204 No Content`
### Update Entity (PUT)

```http
PUT /v2/entities/{entityId}/attrs
```



Replaces all attributes (attributes not specified will be deleted).

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Entity type |

**Response**: `204 No Content`
### Add Attributes (POST)

```http
POST /v2/entities/{entityId}/attrs
```



Adds new attributes (existing attributes will be overwritten).

When `options=append` is specified, existing attributes will not be overwritten and only new attributes will be added (strict append mode). If attribute names that already exist are included, a `422 Unprocessable Entity` error is returned.

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Entity type |
| `options` | string | `append`: Prohibit overwriting existing attributes (strict append mode) |

**Response**: `204 No Content`
### Delete Entity

```http
DELETE /v2/entities/{entityId}
```



**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Entity type |

**Response**: `204 No Content`
---

## Attribute Operations

### Get Entity Attributes

Retrieves all attributes of an entity (the `id` and `type` fields are not included).

```http
GET /v2/entities/{entityId}/attrs
```



**Query Parameters**

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `type` | string | Entity type | - |
| `attrs` | string | Attribute names to retrieve (comma-separated) | - |
| `metadata` | string | Metadata output control (`on`, `off`) | `on` |
| `options` | string | `keyValues`, `values`, `sysAttrs` | - |

**Response Example**

```json
{
  "temperature": {
    "type": "Float",
    "value": 23.5,
    "metadata": {}
  },
  "pressure": {
    "type": "Integer",
    "value": 720,
    "metadata": {}
  }
}
```














**keyValues format** (`options=keyValues`)

```json
{
  "temperature": 23.5,
  "pressure": 720
}
```






> **Note**: Unlike `/v2/entities/{entityId}?attrs=...`, this endpoint does not include the `id` and `type` fields. Use this when only attributes are needed.

### Get Single Attribute

```http
GET /v2/entities/{entityId}/attrs/{attrName}
```



**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Entity type |

**Response Example**

```json
{
  "type": "Float",
  "value": 23.5,
  "metadata": {}
}
```







### Update Single Attribute

```http
PUT /v2/entities/{entityId}/attrs/{attrName}
```



**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Entity type |

**Request Body**

```json
{
  "type": "Float",
  "value": 25.0
}
```






**Response**: `204 No Content`
### Delete Single Attribute

```http
DELETE /v2/entities/{entityId}/attrs/{attrName}
```



**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Entity type |

**Response**: `204 No Content`
### Get Attribute Value Directly

```http
GET /v2/entities/{entityId}/attrs/{attrName}/value
```



Retrieves only the value of an attribute (type and metadata are not included).

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Entity type |

**Response**

Returned with different Content-Types depending on the type of value:

| Value type | Content-Type | Example |
|------------|--------------|---------|
| String | `text/plain` | `hello world` |
| Number | `text/plain` | `23.5` |
| Boolean | `text/plain` | `true` |
| null | `text/plain` | `null` |
| Object | `application/json` | `{"lat": 35.68, "lon": 139.76}` |
| Array | `application/json` | `[1, 2, 3]` |

**Usage Examples**

```bash
# Get a numeric attribute value
curl "http://localhost:3000/v2/entities/Room1/attrs/temperature/value" \
  -H "Fiware-Service: smartcity"
# Response: 23.5 (Content-Type: text/plain)

# Get an object attribute value
curl "http://localhost:3000/v2/entities/Car1/attrs/location/value" \
  -H "Fiware-Service: smartcity"
# Response: {"type":"Point","coordinates":[139.76,35.68]} (Content-Type: application/json)
```











### Update Attribute Value Directly

```http
PUT /v2/entities/{entityId}/attrs/{attrName}/value
```



Updates only the value of an attribute. The existing type and metadata are preserved.

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Entity type |

**Request**

The interpretation of the value differs depending on the Content-Type:

| Content-Type | Interpretation |
|--------------|----------------|
| `application/json` | Parsed as JSON |
| `text/plain` | Primitive value (`null`, `true`, `false`, number) or string |

**Usage Examples**

```bash
# Update a number with text/plain
curl -X PUT "http://localhost:3000/v2/entities/Room1/attrs/temperature/value" \
  -H "Fiware-Service: smartcity" \
  -H "Content-Type: text/plain" \
  -d "25.5"

# Update an object with application/json
curl -X PUT "http://localhost:3000/v2/entities/Car1/attrs/location/value" \
  -H "Fiware-Service: smartcity" \
  -H "Content-Type: application/json" \
  -d '{"type":"Point","coordinates":[140.0,36.0]}'
```













**Response**: `204 No Content`
**Note**: This operation does not change the existing attribute's type or metadata — they are preserved.

---

## Batch Operations

> **Note**: Batch operations can process up to **`MAX_BATCH_SIZE`** entities per request (default: 100, configurable up to 10,000 via the `MaxBatchSize` SAM parameter). Requests exceeding this limit will result in a `400 Bad Request` error. See [DEVELOPMENT.md](../getting-started/installation.md) for configuration details.

### Batch Update

```http
POST /v2/op/update
```



**Request Body**

```json
{
  "actionType": "append",
  "entities": [
    {
      "id": "Room1",
      "type": "Room",
      "temperature": { "type": "Float", "value": 21.0 }
    },
    {
      "id": "Room2",
      "type": "Room",
      "temperature": { "type": "Float", "value": 22.5 }
    }
  ]
}
```

















**actionType types**

| Action | Description |
|--------|-------------|
| `append` | Add/update attributes of existing entities |
| `appendStrict` | Add new attributes to existing entities (returns an error if existing attributes are present) |
| `update` | Update only existing attributes (error if entity does not exist) |
| `replace` | Replace all attributes |
| `delete` | Delete entities or attributes |

**Response**
- All succeeded: `204 No Content`- Partial success/errors: `200 OK` with error details

```json
{
  "success": [
    { "entityId": "Room1" }
  ],
  "errors": [
    {
      "entityId": "Room2",
      "error": {
        "code": "NotFound",
        "message": "Entity not found: Room2"
      }
    }
  ]
}
```
















### Batch Query

```http
POST /v2/op/query
```



**Request Body**

```json
{
  "entities": [
    { "idPattern": ".*", "type": "Room" }
  ],
  "attrs": ["temperature"],
  "expression": {
    "q": "temperature>20",
    "georel": "within",
    "geometry": "polygon",
    "coords": "138,34;141,34;141,37;138,37;138,34"
  }
}
```














**Response**: Array of entities

### Receive Notification

```http
POST /v2/op/notify
```



Receives notifications from an external Context Broker and processes entities with append (creates if not present, updates if already exists).

**Request Body**

```json
{
  "subscriptionId": "sub123",
  "data": [
    {
      "id": "Room1",
      "type": "Room",
      "temperature": { "type": "Float", "value": 25.0 }
    }
  ]
}
```












- `subscriptionId`: Required - the subscription ID that triggered the notification
- `data`: Required - array of entities in NGSIv2 normalized format

**Response**: `200 OK`
---

## Subscriptions

### Create Subscription

```http
POST /v2/subscriptions
```



**HTTP notification example**

```json
{
  "description": "Room temperature monitoring",
  "subject": {
    "entities": [
      { "idPattern": ".*", "type": "Room" }
    ],
    "condition": {
      "attrs": ["temperature"],
      "expression": {
        "q": "temperature>25"
      }
    }
  },
  "notification": {
    "http": {
      "url": "https://webhook.example.com/notify"
    },
    "attrs": ["temperature", "pressure"],
    "attrsFormat": "normalized"
  },
  "expires": "2030-12-31T23:59:59.000Z",
  "throttling": 5
}
```

























**httpCustom notification example (custom template)**

```json
{
  "description": "Custom notification with payload template",
  "subject": {
    "entities": [{ "type": "Room" }],
    "condition": { "attrs": ["temperature"] }
  },
  "notification": {
    "httpCustom": {
      "url": "https://api.example.com/events",
      "method": "PUT",
      "headers": {
        "X-Api-Key": "secret-key"
      },
      "qs": { "entityId": "${id}", "temp": "${temperature}" },
      "payload": "Entity ${id} has temperature ${temperature}"
    }
  }
}
```




















**httpCustom fields**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | ✓ | Notification destination URL |
| `method` | string | - | HTTP method (GET, POST, PUT, PATCH, DELETE). Default: POST |
| `headers` | object | - | Custom HTTP headers |
| `qs` | object | - | Query string parameters (supports `${...}` macro substitution) |
| `payload` | string | - | Request body template (supports `${...}` macro substitution) |

**Macro substitution**

You can embed entity data using the `${...}` syntax in `payload` and `qs` values:

| Macro | Replacement value |
|-------|-------------------|
| `${id}` | Entity ID |
| `${type}` | Entity type |
| `${attrName}` | Attribute value (extracts `.value` from normalized attribute) |

Non-existent attributes are replaced with the string `null`. Macros are evaluated against the full entity before the attrs/exceptAttrs filter is applied.

**MQTT notification example**

```json
{
  "description": "Room temperature MQTT notification",
  "subject": {
    "entities": [
      { "type": "Room" }
    ],
    "condition": {
      "attrs": ["temperature"]
    }
  },
  "notification": {
    "mqtt": {
      "url": "mqtt://broker.example.com:1883",
      "topic": "sensors/room/temperature",
      "qos": 1,
      "retain": false,
      "user": "username",
      "passwd": "password"
    },
    "attrs": ["temperature"]
  }
}
```
























**MQTT notification settings**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | ✓ | MQTT broker URL (`mqtt://` or `mqtts://`) |
| `topic` | string | ✓ | Notification destination topic |
| `qos` | integer | - | QoS level (0, 1, 2). Default: 0 |
| `retain` | boolean | - | Message retain flag. Default: false |
| `user` | string | - | Authentication username |
| `passwd` | string | - | Authentication password |

**Request Body**

```json
{
  "description": "Room temperature monitoring",
  "subject": {
    "entities": [
      { "idPattern": ".*", "type": "Room" }
    ],
    "condition": {
      "attrs": ["temperature"],
      "expression": {
        "q": "temperature>25"
      }
    }
  },
  "notification": {
    "http": {
      "url": "https://webhook.example.com/notify"
    },
    "attrs": ["temperature", "pressure"],
    "attrsFormat": "normalized"
  },
  "expires": "2030-12-31T23:59:59.000Z",
  "throttling": 5
}
```

























**attrsFormat types**

| Format | Description |
|--------|-------------|
| `normalized` | Standard NGSIv2 format (default) |
| `keyValues` | Simplified key-value format |

**Notification attribute filtering**

| Field | Type | Description |
|-------|------|-------------|
| `attrs` | string[] | List of attribute names to include in notifications |
| `exceptAttrs` | string[] | List of attribute names to exclude from notifications |
| `onlyChangedAttrs` | boolean | If `true`, only attributes that actually changed are included in notifications. It can be combined with `attrs`/`exceptAttrs`. |

**Response**
- Status