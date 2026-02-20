---
title: "NGSIv2 API"
---

# NGSIv2 API

> This document has been separated from [API.md](./endpoints.md). Please refer to [API.md](./endpoints.md) for the main API specifications.

---

### Entity Operations

#### List Entities

```http
GET /v2/entities
```

**Query Parameters**

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `id` | string | Filter by entity ID (comma-separated for multiple) | - |
| `limit` | integer | Number of items to retrieve (max: 1000) | 20 |
| `offset` | integer | Offset for pagination | 0 |
| `orderBy` | string | Sort criteria (`entityId`, `entityType`, `modifiedAt`, or attribute names). FIWARE Orion compatible `!` prefix for descending order (e.g., `!temperature`) | - |
| `orderDirection` | string | Sort direction (`asc`, `desc`). **GeonicDB-specific extension** (official spec uses only `!` prefix method) | `asc` |
| `type` | string | Filter by entity type | - |
| `typePattern` | string | Regular expression pattern for entity type | - |
| `idPattern` | string | Regular expression pattern for entity ID | - |
| `q` | string | Filter by attribute values (see [Query Language](./endpoints.md#query-language)) | - |
| `mq` | string | Filter by metadata (see [Query Language](./endpoints.md#query-language)) | - |
| `attrs` | string | Attribute names to retrieve (comma-separated) | - |
| `metadata` | string | Metadata output control (`on`, `off`). **GeonicDB-specific extension** (official spec uses comma-separated name list with `*` wildcard, etc.) | `on` |
| `georel` | string | Geo-query operator (see [Geo-queries](./endpoints.md#geo-queries)) | - |
| `geometry` | string | Geometry type | - |
| `coords` | string | Coordinates (latitude,longitude format, semicolon-separated) | - |
| `spatialId` | string | Filter by Spatial ID (ZFXY format) (see [Spatial ID Search](./endpoints.md#spatial-id-search)) | - |
| `spatialIdDepth` | integer | Spatial ID hierarchy expansion depth (0-4) | 0 |
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

**keyValues Format** (`options=keyValues`)

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

**count Option** (`options=count`)

Adds `Fiware-Total-Count` to the response headers.

**geojson Option** (`options=geojson` or `Accept: application/geo+json` header)

Returns response in GeoJSON FeatureCollection format.

```bash
# Specify with options parameter
curl "http://localhost:3000/v2/entities?type=Store&options=geojson" \
  -H "Fiware-Service: myservice"

# Specify with Accept header
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

Response headers will include `Content-Type: application/geo+json`.

#### Create Entity

```http
POST /v2/entities
```

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `options` | string | `upsert`: Update if entity already exists. `keyValues`: Interpret request body as keyValues format |

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

**keyValues Format Input** (`options=keyValues`)

```json
{
  "id": "Room1",
  "type": "Room",
  "temperature": 23.5,
  "pressure": 720
}
```

**Upsert Behavior** (`options=upsert`)

Creates entity if it doesn't exist (`201 Created`), or updates attributes if it already exists (`204 No Content`).

**Response**
- Status: `201 Created` (new creation), `204 No Content` (upsert update)
- Header: `Location: /v2/entities/Room1?type=Room`

#### Get Single Entity

```http
GET /v2/entities/{entityId}
```

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Entity type (required when same ID exists in multiple types) |
| `attrs` | string | Attribute names to retrieve (comma-separated) |
| `options` | string | `keyValues`, `values` |

#### Update Entity (PATCH)

```http
PATCH /v2/entities/{entityId}/attrs
```

Updates only specified attributes. Non-existent attributes will be added.

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

#### Update Entity (PUT)

```http
PUT /v2/entities/{entityId}/attrs
```

Replaces all attributes (unspecified attributes will be deleted).

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Entity type |

**Response**: `204 No Content`

#### Add Attributes (POST)

```http
POST /v2/entities/{entityId}/attrs
```

Adds new attributes (existing attributes will be overwritten).

When `options=append` is specified, only new attributes are added without overwriting existing ones (strict append mode). Returns `422 Unprocessable Entity` error if attribute names already exist.

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Entity type |
| `options` | string | `append`: Prohibit overwriting existing attributes (strict append mode) |

**Response**: `204 No Content`

#### Delete Entity

```http
DELETE /v2/entities/{entityId}
```

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Entity type |

**Response**: `204 No Content`

---

### Attribute Operations

#### Get Entity Attributes

Retrieves all attributes of an entity (`id` and `type` fields are not included).

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

**keyValues Format** (`options=keyValues`)

```json
{
  "temperature": 23.5,
  "pressure": 720
}
```

> **Note**: Unlike `/v2/entities/{entityId}?attrs=...`, this endpoint does not include `id` and `type` fields. Use this when only attributes are needed.

#### Get Single Attribute

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

#### Update Single Attribute

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

#### Delete Single Attribute

```http
DELETE /v2/entities/{entityId}/attrs/{attrName}
```

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Entity type |

**Response**: `204 No Content`

#### Get Attribute Value Directly

```http
GET /v2/entities/{entityId}/attrs/{attrName}/value
```

Retrieves only the attribute value (type and metadata are not included).

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Entity type |

**Response**

Returned with different Content-Type depending on value type:

| Value Type | Content-Type | Example |
|------------|--------------|---------|
| String | `text/plain` | `hello world` |
| Number | `text/plain` | `23.5` |
| Boolean | `text/plain` | `true` |
| null | `text/plain` | `null` |
| Object | `application/json` | `{"lat": 35.68, "lon": 139.76}` |
| Array | `application/json` | `[1, 2, 3]` |

**Usage Examples**

```bash
# Get numeric attribute value
curl "http://localhost:3000/v2/entities/Room1/attrs/temperature/value" \
  -H "Fiware-Service: smartcity"
# Response: 23.5 (Content-Type: text/plain)

# Get object attribute value
curl "http://localhost:3000/v2/entities/Car1/attrs/location/value" \
  -H "Fiware-Service: smartcity"
# Response: {"type":"Point","coordinates":[139.76,35.68]} (Content-Type: application/json)
```

#### Update Attribute Value Directly

```http
PUT /v2/entities/{entityId}/attrs/{attrName}/value
```

Updates only the attribute value. Existing type and metadata are preserved.

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Entity type |

**Request**

Value interpretation differs based on Content-Type:

| Content-Type | Interpretation |
|--------------|----------------|
| `application/json` | Parse as JSON |
| `text/plain` | Primitive values (`null`, `true`, `false`, numbers) or string |

**Usage Examples**

```bash
# Update number with text/plain
curl -X PUT "http://localhost:3000/v2/entities/Room1/attrs/temperature/value" \
  -H "Fiware-Service: smartcity" \
  -H "Content-Type: text/plain" \
  -d "25.5"

# Update object with application/json
curl -X PUT "http://localhost:3000/v2/entities/Car1/attrs/location/value" \
  -H "Fiware-Service: smartcity" \
  -H "Content-Type: application/json" \
  -d '{"type":"Point","coordinates":[140.0,36.0]}'
```

**Response**: `204 No Content`

**Note**: This operation preserves the existing attribute type and metadata without changes.

---

### Batch Operations

> **Note**: Batch operations can process up to **1,000 entities** per request. Requests exceeding 1,000 entities will result in a `400 Bad Request` error.

#### Batch Update

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

**Action Types**

| Action | Description |
|--------|-------------|
| `append` | Add/update attributes of existing entities |
| `appendStrict` | Add new attributes to existing entities (returns error if attribute already exists) |
| `update` | Update only existing attributes (error if entity doesn't exist) |
| `replace` | Replace all attributes |
| `delete` | Delete entity or attributes |

**Response**
- All successful: `204 No Content`
- Partial success/errors: `200 OK` with error details

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

#### Batch Query

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

#### Receive Notification

```http
POST /v2/op/notify
```

Receives notifications from external Context Broker and processes entities with append (creates if doesn't exist, updates if exists).

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

- `subscriptionId`: Required - Subscription ID that triggered the notification
- `data`: Required - Array of entities in NGSIv2 normalized format

**Response**: `200 OK`

---

### Subscriptions

#### Create Subscription

```http
POST /v2/subscriptions
```

**HTTP Notification Example**

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
    