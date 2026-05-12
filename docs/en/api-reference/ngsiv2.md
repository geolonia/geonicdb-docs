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

**Built-in Attributes**

The `attrs` parameter supports the following built-in attributes in addition to user-defined attributes:

| Builtin Attribute | Type | Description |
|---|---|---|
| `dateCreated` | DateTime | Entity creation timestamp (also available via `options=sysAttrs`) |
| `dateModified` | DateTime | Last modification timestamp (also available via `options=sysAttrs`) |
| `dateExpires` | DateTime | Transient entity expiration timestamp |
| `servicePath` | Text | Service path where the entity is stored (`Fiware-ServicePath` header value at creation) |

Example: `GET /v2/entities?attrs=temperature,servicePath`

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

> **Note**: Batch operations can process up to **`MAX_BATCH_SIZE`** entities per request (default: 100). Requests exceeding this limit will result in a `400 Bad Request` error. 

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
- All succeeded: `204 No Content`
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
- Status: `201 Created`
- Header: `Location: /v2/subscriptions/{subscriptionId}`

### List Subscriptions

```http
GET /v2/subscriptions
```

**Query Parameters**

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `limit` | integer | Number of results to retrieve | 20 |
| `offset` | integer | Offset | 0 |
| `status` | string | Filter by status (`active`, `inactive`) | - |

### Get Subscription

```http
GET /v2/subscriptions/{subscriptionId}
```

### Update Subscription

```http
PATCH /v2/subscriptions/{subscriptionId}
```

**Request Body**

```json
{
  "status": "inactive"
}
```

**Response**: `204 No Content`

### Delete Subscription

```http
DELETE /v2/subscriptions/{subscriptionId}
```

**Response**: `204 No Content`

### Ownership Verification (GeonicDB Extension)

When authentication is enabled (`AUTH_ENABLED=true`), subscription update (PATCH) and delete (DELETE) operations perform ownership verification based on the `createdBy` field. If a user other than the creator attempts these operations, `403 Forbidden` is returned. The `super_admin` and `tenant_admin` roles can bypass this verification. See [AUTH.md](../reference/auth.md) for details.

---

## Registrations

A Registration registers an external context provider and manages the source of entity information.

### Create Registration

```http
POST /v2/registrations
```

**Request Body**

```json
{
  "description": "Weather data provider",
  "dataProvided": {
    "entities": [
      { "type": "WeatherObserved" }
    ],
    "attrs": ["temperature", "humidity", "pressure"]
  },
  "provider": {
    "http": {
      "url": "http://context-provider:8080/v2"
    }
  },
  "expires": "2040-12-31T23:59:59.000Z",
  "status": "active"
}
```

**Request Fields**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `description` | string | - | Description of the registration |
| `dataProvided.entities` | array | ✓ | Target entities (id, idPattern, type) |
| `dataProvided.attrs` | array | - | Attribute names to provide |
| `provider.http.url` | string | ✓ | Provider URL |
| `expires` | string | - | Expiration date (ISO 8601 format) |
| `status` | string | - | Status (`active` / `inactive`). Default: `active` |
| `mode` | string | - | Forwarding mode (`inclusive` / `exclusive` / `redirect` / `auxiliary`). NGSI-LD compatible extension |

**Response**
- Status: `201 Created`
- Header: `Location: /v2/registrations/{registrationId}`

### List Registrations

```http
GET /v2/registrations
```

**Query Parameters**

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `limit` | integer | Number of results to retrieve | 20 |
| `offset` | integer | Offset | 0 |

**Response Example**

```json
[
  {
    "id": "5f8a7b3c-1234-5678-abcd-ef0123456789",
    "description": "Weather data provider",
    "dataProvided": {
      "entities": [{ "type": "WeatherObserved" }],
      "attrs": ["temperature", "humidity", "pressure"]
    },
    "provider": {
      "http": { "url": "http://context-provider:8080/v2" }
    },
    "status": "active"
  }
]
```

### Get Registration

```http
GET /v2/registrations/{registrationId}
```

### Update Registration

```http
PATCH /v2/registrations/{registrationId}
```

**Request Body**

```json
{
  "description": "Updated description"
}
```

**Response**: `204 No Content`

### Delete Registration

```http
DELETE /v2/registrations/{registrationId}
```

**Response**: `204 No Content`

### Ownership Verification (GeonicDB Extension)

When authentication is enabled (`AUTH_ENABLED=true`), registration update (PATCH) and delete (DELETE) operations perform ownership verification based on the `createdBy` field. If a user other than the creator attempts these operations, `403 Forbidden` is returned. The `super_admin` and `tenant_admin` roles can bypass this verification. See [AUTH.md](../reference/auth.md) for details.

---

## Federation (Query Forwarding / Update Forwarding)

Based on Registrations, GeonicDB forwards queries to external context providers, integrates results, and forwards updates.

### How Federation Works

When querying entities, if a matching registration exists, queries are also sent to that provider in parallel and the results are merged and returned.

```text
Client → Context Broker
              │
              ├── Local DB search
              │
              └── Query forwarded to registered provider
                        │
                        └── Results merged → returned to client
```

### Registration Modes

| Mode | Behavior |
|------|----------|
| `inclusive` | Returns both local and remote results (default) |
| `exclusive` | Returns only remote results (local data is ignored) |
| `redirect` | Returns a 303 redirect URL |
| `auxiliary` | Local data takes priority; remote fills in missing data |

### Federation Example

1. Register an external provider:

```bash
curl -X POST "http://localhost:3000/v2/registrations" \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -d '{
    "description": "Weather data provider",
    "dataProvided": {
      "entities": [{ "type": "WeatherObserved" }],
      "attrs": ["temperature", "humidity"]
    },
    "provider": {
      "http": { "url": "http://weather-service:8080/v2" }
    }
  }'
```

2. Federation happens automatically when querying:

```bash
curl "http://localhost:3000/v2/entities?type=WeatherObserved" \
  -H "Fiware-Service: smartcity"
```

In this case, data is fetched from both the local DB and `http://weather-service:8080/v2`, merged, and returned.

### Update Forwarding

When updating or deleting entities, if a matching registration exists, updates are also forwarded to that provider in parallel.

**Supported update operations**

| Operation | Description |
|-----------|-------------|
| Update entity attributes | `PATCH /v2/entities/{id}/attrs` |
| Add entity attributes | `POST /v2/entities/{id}/attrs` |
| Replace entity attributes | `PUT /v2/entities/{id}/attrs` |
| Delete entity | `DELETE /v2/entities/{id}` |
| Delete attribute | `DELETE /v2/entities/{id}/attrs/{attr}` |

**Update behavior by mode**

| Mode | Behavior |
|------|----------|
| `inclusive` | Updates both local and remote |
| `exclusive` | Updates only remote (local is not updated) |
| `redirect` | Returns a 303 redirect URL (local is not updated) |
| `auxiliary` | Updates only local (remote is read-only) |

### Error Handling

| Scenario | Behavior |
|----------|----------|
| Provider connection failure | Logs a warning and returns only local results |
| Provider timeout | Logs a warning and returns only local results |
| All providers fail in exclusive mode | Returns a 502 error (optional) |

---

## Entity Types

### List Types

```http
GET /v2/types
```

**Query Parameters**

| Parameter | Description |
|-----------|-------------|
| `options=count` | Include entity count |
| `options=values` | Include attribute details |

**Response Example**

```json
[
  {
    "type": "Room",
    "count": 5,
    "attrs": {
      "temperature": { "types": ["Float"] },
      "pressure": { "types": ["Integer"] }
    }
  }
]
```

### Get Specific Type

```http
GET /v2/types/{typeName}
```

**Response Example**

```json
{
  "type": "Room",
  "count": 5,
  "attrs": {
    "temperature": { "types": ["Float"] },
    "pressure": { "types": ["Integer"] }
  }
}
```

---

## HTTP Cache Control

GET endpoints return cache-related headers by endpoint class:

### Data endpoints (entities, subscriptions, registrations) — full RFC 7232 + RFC 7234 support

| Header | Value | Purpose |
|--------|-------|---------|
| `ETag` | `W/"..."` | Weak validator. Generation seeds include `path + Accept + Fiware-Service + Fiware-ServicePath` so distinct endpoints / Accept / tenants / service paths always produce distinct ETags. Lists: streaming digest of `id + modifiedAt` mixed with total count and scope. Single: hash of `modifiedAt` mixed with scope. |
| `Last-Modified` | RFC 1123 HTTP-date | Timestamp of the latest `modifiedAt` in the result set. |
| `Cache-Control` | `private, no-cache` | `private` blocks shared / intermediate cache storage; `no-cache` forces revalidation from the private cache. |
| `Vary` | `Fiware-Service, Fiware-ServicePath, Authorization, X-Api-Key, Accept` | Tenant + auth + content-negotiation isolation for shared caches. |

Conditional requests are supported:

| Request Header | Behavior |
|----------------|----------|
| `If-None-Match: <ETag>` | Returns `304 Not Modified` (empty body) if matched. |
| `If-Modified-Since: <HTTP-date>` | Returns `304` if the resource is unchanged. |
| `Cache-Control: no-store` | Server overrides response `Cache-Control` to `no-store`. |

### Meta endpoints (types) — Cache-Control + Vary only (no ETag / no 304)

| Header | Value | Purpose |
|--------|-------|---------|
| `Cache-Control` | `max-age=60, stale-while-revalidate=120` | Short-term caching with background revalidation. |
| `Vary` | `Fiware-Service, Fiware-ServicePath, Authorization, X-Api-Key, Accept` | Same tenant/auth isolation as data endpoints. |

Meta endpoints do not return `ETag` / `Last-Modified` and do not support `If-None-Match` / `If-Modified-Since` conditional requests. Clients should rely on the `max-age` / `stale-while-revalidate` directives instead.

See [API.md §HTTP Cache Control](./endpoints.md#http-cache-control-etag--conditional-requests) for full semantics.

---

## HTTP Error Responses

| Status Code | Error Code | Description |
|-------------|------------|-------------|
| 400 | BadRequest | Invalid request parameters or body |
| 400 | InvalidModification | Invalid attribute modification (e.g., changing id or type) |
| 401 | Unauthorized | Authentication required or token is invalid |
| 403 | Forbidden | Insufficient permissions |
| 404 | NotFound | Entity, subscription, etc. not found |
| 405 | MethodNotAllowed | HTTP method not allowed |
| 409 | AlreadyExists | Entity already exists (during POST creation) |
| 409 | TooManyResults | Multiple entities matched (when type is not specified) |
| 411 | ContentLengthRequired | Content-Length header is required |
| 413 | RequestEntityTooLarge | Request body is too large |
| 415 | UnsupportedMediaType | Unsupported Content-Type |
| 422 | Unprocessable | Entity format is invalid |
| 429 | TooManyRequests | Rate limit exceeded |
| 500 | InternalError | Internal server error |

**Error Response Format**

```json
{
  "error": "BadRequest",
  "description": "Invalid query parameter: limit must be a positive integer"
}
```

---

## Endpoint Reference

FIWARE NGSIv2-compatible Context Broker API.

### Common Specifications

- **Content-Type**: `application/json`
- **Authentication**: Required when `AUTH_ENABLED=true`
- **Tenant isolation**: Tenant isolation via the `Fiware-Service` header
- **Pagination**: `limit`/`offset` parameters; use `options=count` to get the total count

### Entity Operations

| Endpoint | Method | Description | Success | Error | Pagination |
|----------|--------|-------------|---------|-------|------------|
| `/v2/entities` | GET | List entities | 200 | 400, 401 | ✅ (max: 1000) |
| `/v2/entities` | POST | Create entity | 201 | 400, 401, 409, 415 | - |
| `/v2/entities/{entityId}` | GET | Get entity | 200 | 400, 401, 404 | - |
| `/v2/entities/{entityId}` | DELETE | Delete entity | 204 | 401, 404 | - |
| `/v2/entities/{entityId}/attrs` | GET | Get attributes only (no id/type fields) | 200 | 400, 401, 404 | - |
| `/v2/entities/{entityId}/attrs` | PATCH | Update attributes | 204 | 400, 401, 404, 415 | - |
| `/v2/entities/{entityId}/attrs` | POST | Add attributes | 204 | 400, 401, 404, 415 | - |
| `/v2/entities/{entityId}/attrs` | PUT | Replace attributes | 204 | 400, 401, 404, 415 | - |
| `/v2/entities/{entityId}/attrs/{attrName}` | GET | Get attribute | 200 | 401, 404 | - |
| `/v2/entities/{entityId}/attrs/{attrName}` | PUT | Update attribute | 204 | 400, 401, 404, 415 | - |
| `/v2/entities/{entityId}/attrs/{attrName}` | DELETE | Delete attribute | 204 | 401, 404 | - |
| `/v2/entities/{entityId}/attrs/{attrName}/value` | GET | Get attribute value | 200 | 401, 404 | - |
| `/v2/entities/{entityId}/attrs/{attrName}/value` | PUT | Update attribute value | 204 | 400, 401, 404, 415 | - |

### Type Operations

| Endpoint | Method | Description | Success | Error | Pagination |
|----------|--------|-------------|---------|-------|------------|
| `/v2/types` | GET | List types | 200 | 400, 401 | ✅ (max: 1000) |
| `/v2/types/{typeName}` | GET | Get type details | 200 | 401, 404 | - |

### Subscription Operations

| Endpoint | Method | Description | Success | Error | Pagination |
|----------|--------|-------------|---------|-------|------------|
| `/v2/subscriptions` | GET | List subscriptions | 200 | 400, 401 | ✅ (max: 1000) |
| `/v2/subscriptions` | POST | Create subscription | 201 | 400, 401, 415 | - |
| `/v2/subscriptions/{subscriptionId}` | GET | Get subscription | 200 | 401, 404 | - |
| `/v2/subscriptions/{subscriptionId}` | PATCH | Update subscription | 204 | 400, 401, 404, 415 | - |
| `/v2/subscriptions/{subscriptionId}` | DELETE | Delete subscription | 204 | 401, 404 | - |

### Registration Operations (Federation)

| Endpoint | Method | Description | Success | Error | Pagination |
|----------|--------|-------------|---------|-------|------------|
| `/v2/registrations` | GET | List registrations | 200 | 400, 401 | ✅ (max: 1000) |
| `/v2/registrations` | POST | Create registration | 201 | 400, 401, 415 | - |
| `/v2/registrations/{registrationId}` | GET | Get registration | 200 | 401, 404 | - |
| `/v2/registrations/{registrationId}` | PATCH | Update registration | 204 | 400, 401, 404, 415 | - |
| `/v2/registrations/{registrationId}` | DELETE | Delete registration | 204 | 401, 404 | - |

### Batch Operations

> **Note**: Batch operations (excluding query) are limited to **`MAX_BATCH_SIZE`** entities per request (default: 100). Exceeding this limit returns `400 Bad Request`.

| Endpoint | Method | Description | Success | Error | Pagination |
|----------|--------|-------------|---------|-------|------------|
| `/v2/op/update` | POST | Batch update (max: `MAX_BATCH_SIZE`) | 204 | 400, 401, 415 | - |
| `/v2/op/query` | POST | Batch query | 200 | 400, 401, 415 | ✅ (max: 1000) |
| `/v2/op/notify` | POST | Receive notification | 200 | 400, 401, 415 | - |
