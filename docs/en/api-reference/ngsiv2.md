---
title: NGSIv2 API Reference
description: Complete reference for the Vela OS NGSIv2 REST API — entity CRUD, attribute operations, batch processing, subscriptions, registrations, and entity types.
outline: deep
---

# NGSIv2 API Reference

This page provides the complete reference for the Vela OS NGSIv2 REST API. All endpoints are available under the SaaS base URL:

```text
https://api.vela.geolonia.com/v2/
```

Every request must include the `Fiware-Service` header to specify the tenant:

```bash
curl https://api.vela.geolonia.com/v2/entities \
  -H "Fiware-Service: mytenant"
```

For general information about pagination, see [Pagination](/en/api-reference/pagination). For HTTP status codes, see [Status Codes](/en/api-reference/status-codes). For the full list of endpoints at a glance, see [Endpoints](/en/api-reference/endpoints).

## Entity Operations

### List Entities

```http
GET /v2/entities
```

Retrieve a list of entities, optionally filtered by type, attribute values, geographic location, and more.

**Query Parameters**

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `limit` | integer | Maximum number of results (max: 1000) | 20 |
| `offset` | integer | Pagination offset | 0 |
| `orderBy` | string | Sort field (`entityId`, `entityType`, `modifiedAt`) | - |
| `type` | string | Filter by entity type | - |
| `idPattern` | string | Regex pattern for entity ID | - |
| `q` | string | Attribute value filter ([Query Language](/en/core-concepts/query-language)) | - |
| `mq` | string | Metadata value filter ([Query Language](/en/core-concepts/query-language)) | - |
| `attrs` | string | Comma-separated list of attributes to return | - |
| `metadata` | string | Metadata output control (`on`, `off`) | `on` |
| `georel` | string | Geo-query operator (e.g., `near;maxDistance:1000`) | - |
| `geometry` | string | Geometry type (`point`, `polygon`, `line`) | - |
| `coords` | string | Coordinates (lat,lon format, semicolon-separated) | - |
| `options` | string | `keyValues`, `values`, `count`, `geojson`, `sysAttrs`, `unique` | - |

**Request**

```bash
curl -s "https://api.vela.geolonia.com/v2/entities?type=Room&limit=10&options=count" \
  -H "Fiware-Service: smartbuilding"
```

**Response** `200 OK`

```json
[
  {
    "id": "urn:ngsi-ld:Room:001",
    "type": "Room",
    "temperature": {
      "type": "Number",
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

When `options=count` is specified, the response includes a `Fiware-Total-Count` header with the total number of matching entities.

#### keyValues Format

With `options=keyValues`, attributes are returned as simple key-value pairs without type or metadata:

```bash
curl -s "https://api.vela.geolonia.com/v2/entities?type=Room&options=keyValues" \
  -H "Fiware-Service: smartbuilding"
```

```json
[
  {
    "id": "urn:ngsi-ld:Room:001",
    "type": "Room",
    "temperature": 23.5,
    "pressure": 720
  }
]
```

#### GeoJSON Format

With `options=geojson` or the `Accept: application/geo+json` header, the response is formatted as a GeoJSON FeatureCollection:

```bash
curl -s "https://api.vela.geolonia.com/v2/entities?type=Store&options=geojson" \
  -H "Fiware-Service: smartcity"
```

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

The response `Content-Type` is set to `application/geo+json`.

### Create Entity

```http
POST /v2/entities
```

Create a new entity. The request body must include `id` and `type`.

**Request**

```bash
curl -X POST https://api.vela.geolonia.com/v2/entities \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
    "id": "urn:ngsi-ld:Room:001",
    "type": "Room",
    "temperature": {
      "type": "Number",
      "value": 23.5,
      "metadata": {
        "unit": { "type": "Text", "value": "CEL" }
      }
    },
    "pressure": {
      "type": "Integer",
      "value": 720
    }
  }'
```

**Response** `201 Created`

The `Location` header contains the URL of the newly created entity:

```text
Location: /v2/entities/urn:ngsi-ld:Room:001?type=Room
```

### Get Entity

```http
GET /v2/entities/{entityId}
```

Retrieve a single entity by ID.

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Entity type (required when multiple entities share the same ID) |
| `attrs` | string | Comma-separated list of attributes to return |
| `options` | string | `keyValues`, `values` |

**Request**

```bash
curl -s https://api.vela.geolonia.com/v2/entities/urn:ngsi-ld:Room:001 \
  -H "Fiware-Service: smartbuilding" | jq .
```

**Response** `200 OK`

```json
{
  "id": "urn:ngsi-ld:Room:001",
  "type": "Room",
  "temperature": {
    "type": "Number",
    "value": 23.5,
    "metadata": {
      "unit": { "type": "Text", "value": "CEL" }
    }
  },
  "pressure": {
    "type": "Integer",
    "value": 720,
    "metadata": {}
  }
}
```

### Update Entity Attributes (PATCH)

```http
PATCH /v2/entities/{entityId}/attrs
```

Partially update an entity's attributes. Only the specified attributes are modified. Attributes that do not exist are added.

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Entity type |

**Request**

```bash
curl -X PATCH https://api.vela.geolonia.com/v2/entities/urn:ngsi-ld:Room:001/attrs \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
    "temperature": {
      "type": "Number",
      "value": 25.0
    }
  }'
```

**Response** `204 No Content`

### Replace Entity Attributes (PUT)

```http
PUT /v2/entities/{entityId}/attrs
```

Replace all attributes on an entity. Attributes not included in the request body are removed.

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Entity type |

**Response** `204 No Content`

### Append Entity Attributes (POST)

```http
POST /v2/entities/{entityId}/attrs
```

Add new attributes to an entity. Existing attributes with the same name are overwritten.

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Entity type |

**Request**

```bash
curl -X POST https://api.vela.geolonia.com/v2/entities/urn:ngsi-ld:Room:001/attrs \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
    "humidity": {
      "type": "Number",
      "value": 55
    }
  }'
```

**Response** `204 No Content`

### Delete Entity

```http
DELETE /v2/entities/{entityId}
```

Delete an entity by ID.

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Entity type |

**Request**

```bash
curl -X DELETE https://api.vela.geolonia.com/v2/entities/urn:ngsi-ld:Room:001 \
  -H "Fiware-Service: smartbuilding"
```

**Response** `204 No Content`

## Attribute Operations

### List Entity Attributes

```http
GET /v2/entities/{entityId}/attrs
```

Retrieve all attributes of an entity. Unlike `GET /v2/entities/{entityId}`, this endpoint does **not** include the `id` and `type` fields.

**Query Parameters**

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `type` | string | Entity type | - |
| `attrs` | string | Comma-separated list of attributes to return | - |
| `metadata` | string | Metadata output control (`on`, `off`) | `on` |
| `options` | string | `keyValues`, `values`, `sysAttrs` | - |

**Request**

```bash
curl -s https://api.vela.geolonia.com/v2/entities/urn:ngsi-ld:Room:001/attrs \
  -H "Fiware-Service: smartbuilding" | jq .
```

**Response** `200 OK`

```json
{
  "temperature": {
    "type": "Number",
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

### Get Single Attribute

```http
GET /v2/entities/{entityId}/attrs/{attrName}
```

Retrieve a single attribute including its type, value, and metadata.

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Entity type |

**Request**

```bash
curl -s https://api.vela.geolonia.com/v2/entities/urn:ngsi-ld:Room:001/attrs/temperature \
  -H "Fiware-Service: smartbuilding" | jq .
```

**Response** `200 OK`

```json
{
  "type": "Number",
  "value": 23.5,
  "metadata": {}
}
```

### Update Single Attribute

```http
PUT /v2/entities/{entityId}/attrs/{attrName}
```

Replace a single attribute entirely (type, value, and metadata).

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Entity type |

**Request**

```bash
curl -X PUT https://api.vela.geolonia.com/v2/entities/urn:ngsi-ld:Room:001/attrs/temperature \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
    "type": "Number",
    "value": 25.0
  }'
```

**Response** `204 No Content`

### Delete Single Attribute

```http
DELETE /v2/entities/{entityId}/attrs/{attrName}
```

Remove a single attribute from an entity.

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Entity type |

**Request**

```bash
curl -X DELETE https://api.vela.geolonia.com/v2/entities/urn:ngsi-ld:Room:001/attrs/pressure \
  -H "Fiware-Service: smartbuilding"
```

**Response** `204 No Content`

### Get Attribute Value

```http
GET /v2/entities/{entityId}/attrs/{attrName}/value
```

Retrieve only the raw value of an attribute, without type or metadata.

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Entity type |

The response `Content-Type` depends on the value type:

| Value Type | Content-Type | Example |
|------------|--------------|---------|
| String | `text/plain` | `hello world` |
| Number | `text/plain` | `23.5` |
| Boolean | `text/plain` | `true` |
| null | `text/plain` | `null` |
| Object | `application/json` | `{"lat": 35.68, "lon": 139.76}` |
| Array | `application/json` | `[1, 2, 3]` |

**Request**

```bash
curl -s https://api.vela.geolonia.com/v2/entities/urn:ngsi-ld:Room:001/attrs/temperature/value \
  -H "Fiware-Service: smartbuilding"
```

**Response** `200 OK`

```text
23.5
```

### Update Attribute Value

```http
PUT /v2/entities/{entityId}/attrs/{attrName}/value
```

Update only the value of an attribute. The existing type and metadata are preserved.

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Entity type |

The `Content-Type` header determines how the request body is interpreted:

| Content-Type | Interpretation |
|--------------|----------------|
| `application/json` | Parsed as JSON (object, array, number, boolean, null) |
| `text/plain` | Primitive value (number, boolean, `null`) or string |

**Request (text/plain)**

```bash
curl -X PUT https://api.vela.geolonia.com/v2/entities/urn:ngsi-ld:Room:001/attrs/temperature/value \
  -H "Content-Type: text/plain" \
  -H "Fiware-Service: smartbuilding" \
  -d "25.5"
```

**Request (application/json)**

```bash
curl -X PUT https://api.vela.geolonia.com/v2/entities/urn:ngsi-ld:Car:001/attrs/location/value \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -d '{"type": "Point", "coordinates": [139.76, 35.68]}'
```

**Response** `204 No Content`

## Batch Operations

Batch operations process multiple entities in a single request. Each request can handle up to **1,000 entities**. Requests exceeding this limit return `400 Bad Request`.

### Batch Update

```http
POST /v2/op/update
```

Create, update, or delete multiple entities in a single request.

**Request Body**

```json
{
  "actionType": "append",
  "entities": [
    {
      "id": "urn:ngsi-ld:Room:001",
      "type": "Room",
      "temperature": { "type": "Number", "value": 21.0 }
    },
    {
      "id": "urn:ngsi-ld:Room:002",
      "type": "Room",
      "temperature": { "type": "Number", "value": 22.5 }
    }
  ]
}
```

**actionType Values**

| Action | Description |
|--------|-------------|
| `append` | Add or update attributes on entities. Creates the entity if it does not exist. |
| `appendStrict` | Add new attributes only. Does not error if the attribute already exists. |
| `update` | Update existing attributes only. Returns an error if the entity does not exist. |
| `replace` | Replace all attributes on the entity. |
| `delete` | Delete entities or specific attributes. |

**Request**

```bash
curl -X POST https://api.vela.geolonia.com/v2/op/update \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
    "actionType": "append",
    "entities": [
      {
        "id": "urn:ngsi-ld:Room:001",
        "type": "Room",
        "temperature": { "type": "Number", "value": 21.0 }
      },
      {
        "id": "urn:ngsi-ld:Room:002",
        "type": "Room",
        "temperature": { "type": "Number", "value": 22.5 }
      }
    ]
  }'
```

**Response**

- All operations succeed: `204 No Content`
- Partial success or errors: `200 OK` with details

```json
{
  "success": [
    { "entityId": "urn:ngsi-ld:Room:001" }
  ],
  "errors": [
    {
      "entityId": "urn:ngsi-ld:Room:002",
      "error": {
        "code": "NotFound",
        "message": "Entity not found: urn:ngsi-ld:Room:002"
      }
    }
  ]
}
```

### Batch Query

```http
POST /v2/op/query
```

Query entities with complex filter criteria. Supports the same filtering capabilities as `GET /v2/entities` but via a POST body, which is useful for large or complex queries.

**Request**

```bash
curl -X POST https://api.vela.geolonia.com/v2/op/query \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
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
  }'
```

**Response** `200 OK`

Returns an array of matching entities.

```json
[
  {
    "id": "urn:ngsi-ld:Room:001",
    "type": "Room",
    "temperature": {
      "type": "Number",
      "value": 23.5,
      "metadata": {}
    }
  }
]
```

### Receive Notification

```http
POST /v2/op/notify
```

Receive notifications from an external Context Broker. Entities in the notification payload are processed with `append` semantics (created if they do not exist, updated otherwise).

**Request**

```bash
curl -X POST https://api.vela.geolonia.com/v2/op/notify \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
    "subscriptionId": "sub123",
    "data": [
      {
        "id": "urn:ngsi-ld:Room:001",
        "type": "Room",
        "temperature": { "type": "Number", "value": 25.0 }
      }
    ]
  }'
```

**Request Body Fields**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `subscriptionId` | string | Yes | The subscription ID that triggered this notification |
| `data` | array | Yes | Array of entities in NGSIv2 normalized format |

**Response** `200 OK`

## Subscriptions

Subscriptions allow you to receive notifications when entity data changes. Vela supports HTTP, MQTT, and custom HTTP (httpCustom) notification channels.

### Create Subscription

```http
POST /v2/subscriptions
```

#### HTTP Notification

```bash
curl -X POST https://api.vela.geolonia.com/v2/subscriptions \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
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
  }'
```

**Response** `201 Created`

The `Location` header contains the subscription ID:

```text
Location: /v2/subscriptions/{subscriptionId}
```

#### MQTT Notification

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

**MQTT Notification Fields**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | MQTT broker URL (`mqtt://` or `mqtts://`) |
| `topic` | string | Yes | Target topic |
| `qos` | integer | No | QoS level (0, 1, 2). Default: 0 |
| `retain` | boolean | No | Retain flag. Default: false |
| `user` | string | No | Authentication username |
| `passwd` | string | No | Authentication password |

#### httpCustom Notification

The `httpCustom` notification type allows full control over the outgoing HTTP request, including method, headers, query strings, and payload templates with macro substitution.

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

**httpCustom Fields**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | Target URL |
| `method` | string | No | HTTP method (GET, POST, PUT, PATCH, DELETE). Default: POST |
| `headers` | object | No | Custom HTTP headers |
| `qs` | object | No | Query string parameters (supports `${...}` macro substitution) |
| `payload` | string | No | Request body template (supports `${...}` macro substitution) |

**Macro Substitution**

The `payload` and `qs` fields support `${...}` syntax to embed entity data:

| Macro | Replaced With |
|-------|---------------|
| `${id}` | Entity ID |
| `${type}` | Entity type |
| `${attrName}` | Attribute value (extracts `.value` from normalized attributes) |

Macros referencing non-existent attributes are replaced with the string `null`. Macros are evaluated against the full entity before `attrs`/`exceptAttrs` filtering is applied.

### Notification Attribute Filtering

Control which attributes are included in notification payloads:

| Field | Type | Description |
|-------|------|-------------|
| `attrs` | string[] | Attributes to include in the notification |
| `exceptAttrs` | string[] | Attributes to exclude from the notification |
| `onlyChangedAttrs` | boolean | When `true`, only attributes that actually changed are included. Can be combined with `attrs`/`exceptAttrs`. |

::: warning
You cannot specify both `attrs` and `exceptAttrs` in the same subscription. Use one or the other.
:::

### attrsFormat

The `attrsFormat` field in `notification` controls the format of entity data in notifications:

| Format | Description |
|--------|-------------|
| `normalized` | Standard NGSIv2 format with type and metadata (default) |
| `keyValues` | Simplified key-value format without type or metadata |

### List Subscriptions

```http
GET /v2/subscriptions
```

**Query Parameters**

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `limit` | integer | Maximum number of results | 20 |
| `offset` | integer | Pagination offset | 0 |
| `status` | string | Filter by status (`active`, `inactive`) | - |

**Request**

```bash
curl -s https://api.vela.geolonia.com/v2/subscriptions \
  -H "Fiware-Service: smartbuilding" | jq .
```

**Response** `200 OK`

```json
[
  {
    "id": "5f8a7b3c-abcd-1234-5678-ef0123456789",
    "description": "Room temperature monitoring",
    "status": "active",
    "subject": {
      "entities": [
        { "idPattern": ".*", "type": "Room" }
      ],
      "condition": {
        "attrs": ["temperature"],
        "expression": { "q": "temperature>25" }
      }
    },
    "notification": {
      "http": {
        "url": "https://webhook.example.com/notify"
      },
      "attrs": ["temperature", "pressure"],
      "attrsFormat": "normalized",
      "timesSent": 12,
      "lastNotification": "2026-02-10T08:30:00.000Z"
    },
    "expires": "2030-12-31T23:59:59.000Z",
    "throttling": 5
  }
]
```

### Get Subscription

```http
GET /v2/subscriptions/{subscriptionId}
```

**Request**

```bash
curl -s https://api.vela.geolonia.com/v2/subscriptions/5f8a7b3c-abcd-1234-5678-ef0123456789 \
  -H "Fiware-Service: smartbuilding" | jq .
```

**Response** `200 OK` -- returns the subscription object.

### Update Subscription

```http
PATCH /v2/subscriptions/{subscriptionId}
```

Partially update a subscription. Only the provided fields are modified.

**Request**

```bash
curl -X PATCH https://api.vela.geolonia.com/v2/subscriptions/5f8a7b3c-abcd-1234-5678-ef0123456789 \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
    "status": "inactive"
  }'
```

**Response** `204 No Content`

### Delete Subscription

```http
DELETE /v2/subscriptions/{subscriptionId}
```

**Request**

```bash
curl -X DELETE https://api.vela.geolonia.com/v2/subscriptions/5f8a7b3c-abcd-1234-5678-ef0123456789 \
  -H "Fiware-Service: smartbuilding"
```

**Response** `204 No Content`

## Registrations

Registrations define external context providers that supply entity data. When a query matches a registered provider, Vela forwards the request and merges the results (federation).

### Create Registration

```http
POST /v2/registrations
```

**Request**

```bash
curl -X POST https://api.vela.geolonia.com/v2/registrations \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -d '{
    "description": "Weather data provider",
    "dataProvided": {
      "entities": [
        { "type": "WeatherObserved" }
      ],
      "attrs": ["temperature", "humidity", "pressure"]
    },
    "provider": {
      "http": {
        "url": "http://weather-service:8080/v2"
      }
    },
    "expires": "2040-12-31T23:59:59.000Z",
    "status": "active"
  }'
```

**Request Body Fields**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `description` | string | No | Registration description |
| `dataProvided.entities` | array | Yes | Target entities (`id`, `idPattern`, `type`) |
| `dataProvided.attrs` | array | No | Attributes provided |
| `provider.http.url` | string | Yes | Provider URL |
| `expires` | string | No | Expiration date (ISO 8601) |
| `status` | string | No | `active` or `inactive`. Default: `active` |

**Response** `201 Created`

The `Location` header contains the registration ID:

```text
Location: /v2/registrations/{registrationId}
```

### List Registrations

```http
GET /v2/registrations
```

**Query Parameters**

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `limit` | integer | Maximum number of results | 20 |
| `offset` | integer | Pagination offset | 0 |

**Request**

```bash
curl -s https://api.vela.geolonia.com/v2/registrations \
  -H "Fiware-Service: smartcity" | jq .
```

**Response** `200 OK`

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
      "http": { "url": "http://weather-service:8080/v2" }
    },
    "status": "active"
  }
]
```

### Get Registration

```http
GET /v2/registrations/{registrationId}
```

**Response** `200 OK` -- returns the registration object.

### Update Registration

```http
PATCH /v2/registrations/{registrationId}
```

Partially update a registration. Only the provided fields are modified.

**Request**

```bash
curl -X PATCH https://api.vela.geolonia.com/v2/registrations/5f8a7b3c-1234-5678-abcd-ef0123456789 \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -d '{
    "description": "Updated weather data provider"
  }'
```

**Response** `204 No Content`

### Delete Registration

```http
DELETE /v2/registrations/{registrationId}
```

**Request**

```bash
curl -X DELETE https://api.vela.geolonia.com/v2/registrations/5f8a7b3c-1234-5678-abcd-ef0123456789 \
  -H "Fiware-Service: smartcity"
```

**Response** `204 No Content`

### Federation

When a query matches a registered provider, Vela automatically forwards the request to the external provider and merges the results with local data.

```text
Client Request
    |
    v
Vela Context Broker
    |
    +-- Local DB query
    |
    +-- Forward to registered provider(s)
            |
            v
        Merge results --> Return to client
```

**Registration Modes**

| Mode | Query Behavior | Update Behavior |
|------|----------------|-----------------|
| `inclusive` | Returns local + remote results (default) | Updates local + remote |
| `exclusive` | Returns remote results only | Updates remote only |
| `redirect` | Returns 303 redirect URL | Returns 303 redirect URL |
| `auxiliary` | Local first, remote fills gaps | Local only (remote is read-only) |

## Entity Types

### List Types

```http
GET /v2/types
```

Retrieve all entity types in the current tenant, with counts and attribute information.

**Query Parameters**

| Parameter | Description |
|-----------|-------------|
| `options=count` | Include entity count per type |
| `options=values` | Include attribute details |

**Request**

```bash
curl -s https://api.vela.geolonia.com/v2/types \
  -H "Fiware-Service: smartbuilding" | jq .
```

**Response** `200 OK`

```json
[
  {
    "type": "Room",
    "count": 5,
    "attrs": {
      "temperature": { "types": ["Number"] },
      "pressure": { "types": ["Integer"] }
    }
  }
]
```

### Get Type

```http
GET /v2/types/{typeName}
```

Retrieve details about a specific entity type.

**Request**

```bash
curl -s https://api.vela.geolonia.com/v2/types/Room \
  -H "Fiware-Service: smartbuilding" | jq .
```

**Response** `200 OK`

```json
{
  "type": "Room",
  "count": 5,
  "attrs": {
    "temperature": { "types": ["Number"] },
    "pressure": { "types": ["Integer"] }
  }
}
```

## Query Parameters Reference

This section summarizes the query parameters available on `GET /v2/entities` and `POST /v2/op/query`.

### Pagination

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `limit` | integer | Number of results to return (max: 1000) | 20 |
| `offset` | integer | Number of results to skip | 0 |

Use the `Fiware-Total-Count` header (returned with `options=count`) to implement pagination. See [Pagination](/en/api-reference/pagination) for details.

### Filtering

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Filter by entity type |
| `idPattern` | string | Regular expression to match entity IDs |
| `q` | string | Filter by attribute values. See [Query Language](/en/core-concepts/query-language). |
| `mq` | string | Filter by metadata values. See [Query Language](/en/core-concepts/query-language). |

### Projection

| Parameter | Type | Description |
|-----------|------|-------------|
| `attrs` | string | Comma-separated list of attributes to include in the response |
| `metadata` | string | Metadata output control: `on` (default) or `off` |

### Sorting

| Parameter | Type | Description |
|-----------|------|-------------|
| `orderBy` | string | Sort field: `entityId`, `entityType`, `modifiedAt` |

### Geo-Queries

| Parameter | Type | Description |
|-----------|------|-------------|
| `georel` | string | Geo-query operator (e.g., `near;maxDistance:1000`, `within`, `intersects`, `disjoint`) |
| `geometry` | string | Reference geometry type (`point`, `polygon`, `line`) |
| `coords` | string | Coordinates in lat,lon format, semicolon-separated for multiple points |

**Example: Find entities within 1 km of a point**

```bash
curl -s "https://api.vela.geolonia.com/v2/entities?type=Store&georel=near;maxDistance:1000&geometry=point&coords=35.6895,139.6917" \
  -H "Fiware-Service: smartcity"
```

### options Values

| Value | Description |
|-------|-------------|
| `keyValues` | Return attributes as simple key-value pairs |
| `values` | Return attribute values as arrays |
| `count` | Include `Fiware-Total-Count` header with total matching entities |
| `geojson` | Return results as GeoJSON FeatureCollection |
| `sysAttrs` | Include system attributes (`dateCreated`, `dateModified`) |
| `unique` | Return only unique attribute values |

Multiple options can be combined with commas: `options=keyValues,count`.

## Related Pages

- [Endpoints](/en/api-reference/endpoints) -- Quick reference of all available API endpoints
- [Pagination](/en/api-reference/pagination) -- Pagination patterns with limit, offset, and count
- [Status Codes](/en/api-reference/status-codes) -- HTTP status codes and error responses
- [Query Language](/en/core-concepts/query-language) -- Filtering entities with q, mq, and geo-queries
