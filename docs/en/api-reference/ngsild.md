---
title: NGSI-LD API Reference
description: Complete reference for the NGSI-LD API on Vela OS — entity CRUD, batch operations, subscriptions, registrations, temporal queries, and more. Conformant to ETSI GS CIM 009 V1.9.1.
outline: deep
---

# NGSI-LD API Reference

This page documents the NGSI-LD API endpoints available on Vela OS. The implementation conforms to **[ETSI GS CIM 009 V1.9.1 (2025-07)](https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/01.09.01_60/gs_CIM009v010901p.pdf)**.

## Base URL

```text
https://api.vela.geolonia.com/ngsi-ld/v1/
```

All requests require the following headers:

| Header | Required | Description |
|--------|----------|-------------|
| `x-api-key` | Yes | Your API key |
| `Fiware-Service` | Yes | Tenant name for data isolation |
| `Content-Type` | For write operations | `application/ld+json`, `application/json`, or `application/merge-patch+json` |
| `Accept` | Optional | Controls response format (see [Content Negotiation](#content-negotiation)) |

## Content Negotiation

NGSI-LD supports content negotiation via the `Accept` header.

| Accept Header | Response Format | `@context` Handling |
|---------------|-----------------|---------------------|
| `application/ld+json` | JSON-LD | Included in the response body |
| `application/json` | JSON | Returned via `Link` header |
| `application/geo+json` | GeoJSON | Returned via `Link` header |

When using `Accept: application/json`, the response includes a `Link` header:

```text
Link: <https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"
```

For `application/ld+json` requests, provide the `@context` in the request body:

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "id": "urn:ngsi-ld:Room:001",
  "type": "Room"
}
```

For `application/json` requests, provide the `@context` via a `Link` header instead.

## Conformance Reference

| Feature Category | ETSI GS CIM 009 Section |
|------------------|-------------------------|
| Entity Operations | Section 5.6 |
| Query Operations | Section 5.7 |
| Subscriptions | Section 5.8 |
| Context Source Registration | Section 5.9 |
| Temporal API | Section 5.6.12 -- 5.6.19 |
| EntityMaps | Section 5.14 |
| JSON-LD Context Management | Section 5.11 |
| Distributed Operations | Section 5.10 |

## Entity Operations

### List Entities

```http
GET /ngsi-ld/v1/entities
```

Retrieve entities matching the specified filters.

**Example request:**

```bash
curl -s "https://api.vela.geolonia.com/ngsi-ld/v1/entities?type=Room&limit=10" \
  -H "Accept: application/ld+json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq .
```

**Query parameters:**

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `type` | string | Filter by entity type | -- |
| `id` | string | Comma-separated entity IDs | -- |
| `idPattern` | string | Regex pattern for entity IDs | -- |
| `q` | string | Query expression filtering by attribute values | -- |
| `attrs` | string | Comma-separated attribute names to return | -- |
| `pick` | string | Attributes to include (mutually exclusive with `omit`) | -- |
| `omit` | string | Attributes to exclude (mutually exclusive with `pick`; cannot omit `id` or `type`) | -- |
| `limit` | integer | Maximum number of results | 20 |
| `offset` | integer | Number of results to skip | 0 |
| `orderBy` | string | Sort field (`entityId`, `entityType`, `modifiedAt`) | -- |
| `scopeQ` | string | Scope query (e.g., `/Madrid`, `/Madrid/#`, `/Madrid/+`) | -- |
| `lang` | string | LanguageProperty filter (BCP 47, comma-separated priority, `*` for all) | -- |
| `georel` | string | Geo-query operator (e.g., `near;maxDistance==1000`, `within`) | -- |
| `geometry` | string | Geometry type (`Point`, `Polygon`, etc.) | -- |
| `coordinates` | string | GeoJSON coordinates | -- |
| `geoproperty` | string | GeoProperty name for geo-queries | `location` |
| `format` | string | Output format (`simplified` for keyValues, `geojson` for GeoJSON) | -- |
| `options` | string | Comma-separated: `keyValues`, `concise`, `entityMap`, `sysAttrs`, `splitEntities` | -- |

**Response:** `200 OK`

```json
[
  {
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
    "id": "urn:ngsi-ld:Room:001",
    "type": "Room",
    "temperature": {
      "type": "Property",
      "value": 23.5,
      "observedAt": "2026-01-15T10:00:00Z",
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

**Response headers:**

| Header | Description |
|--------|-------------|
| `NGSILD-Results-Count` | Total count (when `count` option is used) |

### Create Entity

```http
POST /ngsi-ld/v1/entities
```

Create a new entity.

**Example request:**

```bash
curl -X POST https://api.vela.geolonia.com/ngsi-ld/v1/entities \
  -H "Content-Type: application/ld+json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
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
  }'
```

**Response:** `201 Created`

```text
Location: /ngsi-ld/v1/entities/urn:ngsi-ld:Room:001
```

#### Transient Entities (expiresAt)

Add an `expiresAt` field (ISO 8601 datetime, must be in the future) to create a transient entity that is automatically deleted after the specified time:

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "id": "urn:ngsi-ld:Room:temp-001",
  "type": "Room",
  "temperature": { "type": "Property", "value": 23.5 },
  "expiresAt": "2030-01-01T00:00:00Z"
}
```

### Get Entity

```http
GET /ngsi-ld/v1/entities/{entityId}
```

Retrieve a single entity by ID.

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Entity type |
| `attrs` | string | Comma-separated attribute names to return |
| `pick` | string | Attributes to include (mutually exclusive with `omit`) |
| `omit` | string | Attributes to exclude (mutually exclusive with `pick`) |
| `lang` | string | LanguageProperty filter (BCP 47) |
| `options` | string | `keyValues`, `concise`, `entityMap` |

**Example request:**

```bash
curl -s "https://api.vela.geolonia.com/ngsi-ld/v1/entities/urn:ngsi-ld:Room:001?attrs=temperature" \
  -H "Accept: application/ld+json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq .
```

**Response:** `200 OK`

### Replace Entity

```http
PUT /ngsi-ld/v1/entities/{entityId}
```

Replace all attributes of an entity. Attributes not included in the request body are removed.

**Response:** `204 No Content`

### Update Entity (Merge-Patch)

```http
PATCH /ngsi-ld/v1/entities/{entityId}
```

Partially update an entity using **Merge-Patch semantics** (ETSI GS CIM 009 Section 5.6.4):

- Use `Content-Type: application/merge-patch+json` to merge attributes. Attributes not in the request body are preserved.
- Set a property value to `"urn:ngsi-ld:null"` to delete that attribute.
- Use `options=keyValues` or `options=concise` for simplified input format.

**Example request:**

```bash
curl -X PATCH "https://api.vela.geolonia.com/ngsi-ld/v1/entities/urn:ngsi-ld:Room:001" \
  -H "Content-Type: application/merge-patch+json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
    "temperature": {
      "type": "Property",
      "value": 25.0
    }
  }'
```

**Response:** `204 No Content`

### Append Entity Attributes

```http
POST /ngsi-ld/v1/entities/{entityId}
```

Append new attributes to an existing entity.

| Parameter | Description |
|-----------|-------------|
| `options=noOverwrite` | Do not overwrite existing attributes; only add new ones |

**Response:** `204 No Content`

### Delete Entity

```http
DELETE /ngsi-ld/v1/entities/{entityId}
```

**Response:** `204 No Content`

## Attribute Operations

### Get All Attributes of an Entity

```http
GET /ngsi-ld/v1/entities/{entityId}/attrs
```

**Response:** `200 OK`

### Partial Update of Multiple Attributes

```http
PATCH /ngsi-ld/v1/entities/{entityId}/attrs
```

Update multiple attributes at once. Only attributes included in the request body are updated; others are preserved.

**Example request:**

```bash
curl -X PATCH "https://api.vela.geolonia.com/ngsi-ld/v1/entities/urn:ngsi-ld:Room:001/attrs" \
  -H "Content-Type: application/ld+json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
    "temperature": {
      "type": "Property",
      "value": 25.0
    }
  }'
```

**Response:** `204 No Content`

### Get Single Attribute

```http
GET /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
```

**Response:** `200 OK`

### Overwrite Attribute (PUT)

```http
PUT /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
```

Completely overwrite an existing attribute. Returns `404 Not Found` if the attribute does not exist.

**Request body:**

```json
{
  "type": "Property",
  "value": 25.0
}
```

**Response:** `204 No Content`

### Replace Attribute (POST)

```http
POST /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
```

Replace an attribute with a new value.

**Response:** `204 No Content`

### Partial Update Attribute (PATCH)

```http
PATCH /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
```

Partially update an existing attribute. Does not create new attributes -- returns `404 Not Found` if the entity or attribute does not exist (ETSI GS CIM 009 V1.9.1 clause 5.6.4).

**Response:** `204 No Content`

### Delete Attribute

```http
DELETE /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `datasetId` | string | The `datasetId` of the multi-attribute instance to delete |
| `deleteAll` | boolean | If `true`, delete all instances of this attribute |

**Response:** `204 No Content`

## Batch Operations

Batch operations process up to **1,000 entities** per request. Requests exceeding this limit return `400 Bad Request`.

### Batch Create

```http
POST /ngsi-ld/v1/entityOperations/create
```

**Example request:**

```bash
curl -X POST https://api.vela.geolonia.com/ngsi-ld/v1/entityOperations/create \
  -H "Content-Type: application/ld+json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" \
  -d '[
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
  ]'
```

**Response:**
- All succeeded: `201 Created`
- Partial success: `207 Multi-Status`

### Batch Upsert

```http
POST /ngsi-ld/v1/entityOperations/upsert
```

Create entities that do not exist and update those that do.

| Parameter | Description |
|-----------|-------------|
| `options=replace` | Replace all attributes of existing entities |

**Response:**
- All succeeded: `201 Created` (new) or `204 No Content` (updated)
- Partial success: `207 Multi-Status`

### Batch Update

```http
POST /ngsi-ld/v1/entityOperations/update
```

Update existing entities. Entities that do not exist cause a partial failure.

**Response:**
- All succeeded: `204 No Content`
- Partial success: `207 Multi-Status`

### Batch Delete

```http
POST /ngsi-ld/v1/entityOperations/delete
```

**Request body:** An array of entity IDs.

```json
["urn:ngsi-ld:Room:001", "urn:ngsi-ld:Room:002"]
```

**Response:**
- All succeeded: `204 No Content`
- Partial success: `207 Multi-Status`

### Batch Query

```http
POST /ngsi-ld/v1/entityOperations/query
```

POST-based query with a structured request body.

**Example request body:**

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

**Response:** `200 OK` -- Array of matching entities.

### Batch Merge

```http
POST /ngsi-ld/v1/entityOperations/merge
```

Apply Merge-Patch semantics to multiple entities at once. Existing attributes are merged; attributes not in the request are preserved. Use `"urn:ngsi-ld:null"` as a value to delete an attribute.

| Parameter | Description |
|-----------|-------------|
| `options=noOverwrite` | Do not overwrite existing attributes |

**Response:**
- All succeeded: `204 No Content`
- Partial success: `207 Multi-Status`

### Entity Purge

```http
POST /ngsi-ld/v1/entityOperations/purge
```

Delete all entities of a specified type (ETSI GS CIM 009 Section 5.6.14).

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Entity type to purge (**required**) |

**Response:**
- Success: `204 No Content`
- Type not specified: `400 Bad Request`

## Subscriptions

> ETSI GS CIM 009 Section 5.8

Subscriptions allow you to receive notifications when entities matching your criteria are created, updated, or deleted.

### Create Subscription

```http
POST /ngsi-ld/v1/subscriptions
```

#### HTTP Notification Example

```bash
curl -X POST https://api.vela.geolonia.com/ngsi-ld/v1/subscriptions \
  -H "Content-Type: application/ld+json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
    "type": "Subscription",
    "entities": [{ "type": "Room" }],
    "watchedAttributes": ["temperature"],
    "q": "temperature>25",
    "notification": {
      "format": "normalized",
      "endpoint": {
        "uri": "https://webhook.example.com/notify",
        "accept": "application/ld+json"
      }
    }
  }'
```

#### MQTT Notification Example

Use `mqtt://` or `mqtts://` as the endpoint URI scheme with the topic as the path:

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "type": "Subscription",
  "entities": [{ "type": "Room" }],
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

**MQTT notifierInfo options:**

| Key | Values | Description |
|-----|--------|-------------|
| `MQTT-Version` | `mqtt3.1.1`, `mqtt5.0` | MQTT protocol version |
| `MQTT-QoS` | `0`, `1`, `2` | Quality of Service level |

#### Subscription Fields

| Field | Type | Description |
|-------|------|-------------|
| `entities` | array | Entity type/id/idPattern filters |
| `watchedAttributes` | string[] | Attributes that trigger notifications |
| `q` | string | Query expression filter |
| `notification` | object | Notification endpoint and format configuration |
| `cooldown` | integer | Minimum interval between notifications (seconds) |
| `notificationTrigger` | string[] | Trigger events: `entityCreated`, `entityUpdated`, `entityChanged`, `entityDeleted`, `attributeCreated`, `attributeUpdated`, `attributeDeleted` |
| `showChanges` | boolean | Include `previousValue` in notification data |
| `notification.onlyChangedAttrs` | boolean | Include only changed attributes in the payload |
| `expiresAt` | string | Subscription expiry (ISO 8601) |

::: warning
`watchedAttributes` and `timeInterval` are mutually exclusive. Specifying both returns `400 Bad Request` (ETSI GS CIM 009 V1.9.1 clause 5.8.1).
:::

**Response:** `201 Created`

```text
Location: /ngsi-ld/v1/subscriptions/{subscriptionId}
```

### List Subscriptions

```http
GET /ngsi-ld/v1/subscriptions
```

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `limit` | integer | Maximum number of results | 20 |
| `offset` | integer | Number of results to skip | 0 |

### Get Subscription

```http
GET /ngsi-ld/v1/subscriptions/{subscriptionId}
```

**Notification status fields (read-only):**

| Field | Type | Description |
|-------|------|-------------|
| `notification.status` | string | `ok` or `failed` |
| `notification.lastNotification` | string | Last notification time (ISO 8601) |
| `notification.lastFailure` | string | Last failure time (ISO 8601) |
| `notification.lastFailureReason` | string | Failure reason (e.g., `HTTP 500: Internal Server Error`) |
| `notification.lastSuccess` | string | Last success time (ISO 8601) |
| `notification.timesSent` | integer | Total notifications sent |

**Retry behavior:** On temporary errors (5xx, network errors), up to 3 retries with exponential backoff (1s, 2s, 4s). No retries for 4xx errors.

### Update Subscription

```http
PATCH /ngsi-ld/v1/subscriptions/{subscriptionId}
```

**Response:** `204 No Content`

### Delete Subscription

```http
DELETE /ngsi-ld/v1/subscriptions/{subscriptionId}
```

**Response:** `204 No Content`

## Context Source Registrations

> ETSI GS CIM 009 Section 5.9

Register external context providers so that Vela can federate queries across multiple data sources.

### Create Registration

```http
POST /ngsi-ld/v1/csourceRegistrations
```

**Example request:**

```bash
curl -X POST https://api.vela.geolonia.com/ngsi-ld/v1/csourceRegistrations \
  -H "Content-Type: application/ld+json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartcity" \
  -d '{
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
    "type": "ContextSourceRegistration",
    "registrationName": "Weather Data Provider",
    "endpoint": "http://context-provider:8080/ngsi-ld/v1",
    "information": [
      {
        "entities": [{ "type": "WeatherObserved" }],
        "propertyNames": ["temperature", "humidity"],
        "relationshipNames": ["observedBy"]
      }
    ],
    "mode": "inclusive"
  }'
```

**Registration fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | `ContextSourceRegistration` |
| `registrationName` | string | No | Registration name |
| `description` | string | No | Description |
| `endpoint` | string | Yes | Provider endpoint URL |
| `information` | array | Yes | Provided entity types, properties, relationships |
| `observationInterval` | object | No | Observation period (`start`, `end`) |
| `managementInterval` | object | No | Management period (`start`, `end`) |
| `location` | GeoJSON | No | Geographic scope |
| `expiresAt` | string | No | Expiry time (ISO 8601) |
| `status` | string | No | `active` or `inactive` |
| `mode` | string | No | `inclusive`, `exclusive`, `redirect`, or `auxiliary` |

**Response:** `201 Created`

```text
Location: /ngsi-ld/v1/csourceRegistrations/{registrationId}
```

### List Registrations

```http
GET /ngsi-ld/v1/csourceRegistrations
```

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `limit` | integer | Maximum number of results | 20 |
| `offset` | integer | Number of results to skip | 0 |

### Get Registration

```http
GET /ngsi-ld/v1/csourceRegistrations/{registrationId}
```

### Update Registration

```http
PATCH /ngsi-ld/v1/csourceRegistrations/{registrationId}
```

**Response:** `204 No Content`

### Delete Registration

```http
DELETE /ngsi-ld/v1/csourceRegistrations/{registrationId}
```

**Response:** `204 No Content`

## Types and Attributes Discovery

### List Entity Types

```http
GET /ngsi-ld/v1/types
```

Discover all entity types in the current tenant. Results include types from both local entities and Context Source Registrations.

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Maximum number of results |
| `offset` | integer | Number of results to skip |

**Response:** `200 OK`

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

### Get Entity Type Details

```http
GET /ngsi-ld/v1/types/{typeName}
```

**Response:** `200 OK`

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

### List Attributes

```http
GET /ngsi-ld/v1/attributes
```

Discover all attribute names used across entities in the current tenant.

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Maximum number of results |
| `offset` | integer | Number of results to skip |

**Response:** `200 OK`

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

### Get Attribute Details

```http
GET /ngsi-ld/v1/attributes/{attrName}
```

**Response:** `200 OK`

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

## JSON-LD Context Management

> ETSI GS CIM 009 Section 5.12

Manage user-defined JSON-LD contexts for custom vocabulary.

### Register Context

```http
POST /ngsi-ld/v1/jsonldContexts
```

**Example request:**

```bash
curl -X POST https://api.vela.geolonia.com/ngsi-ld/v1/jsonldContexts \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
    "@context": {
      "type": "@type",
      "id": "@id",
      "Temperature": "https://example.org/ontology#Temperature"
    }
  }'
```

**Response:** `201 Created`

```text
Location: /ngsi-ld/v1/jsonldContexts/{contextId}
```

### List Contexts

```http
GET /ngsi-ld/v1/jsonldContexts
```

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `limit` | integer | Maximum number of results | 20 |
| `offset` | integer | Number of results to skip | 0 |

### Get Context

```http
GET /ngsi-ld/v1/jsonldContexts/{contextId}
```

Supports conditional requests for caching:

| Response Header | Description |
|-----------------|-------------|
| `ETag` | MD5 hash of the context body |
| `Last-Modified` | Context creation timestamp |
| `Cache-Control` | `public, max-age=3600` |

| Request Header | Behavior |
|----------------|----------|
| `If-None-Match` | Returns `304 Not Modified` if ETag matches |
| `If-Modified-Since` | Returns `304 Not Modified` if unchanged since the specified date |

### Delete Context

```http
DELETE /ngsi-ld/v1/jsonldContexts/{contextId}
```

**Response:** `204 No Content`

## Temporal API

> ETSI GS CIM 009 Section 5.6.12 -- 5.6.19

The Temporal API provides access to time series data for entities.

### Query Temporal Entities

```http
GET /ngsi-ld/v1/temporal/entities
```

Standard query parameters apply, plus temporal-specific parameters:

| Parameter | Type | Description |
|-----------|------|-------------|
| `timerel` | string | Temporal relation: `before`, `after`, `between` |
| `timeAt` | string | Reference time (ISO 8601) |
| `endTimeAt` | string | End time for `between` queries (ISO 8601) |
| `timeproperty` | string | Time property name (default: `observedAt`) |
| `aggrMethods` | string | Aggregation methods (comma-separated): `totalCount`, `distinctCount`, `sum`, `avg`, `min`, `max`, `stddev`, `sumsq` |
| `aggrPeriodDuration` | string | ISO 8601 duration (e.g., `PT1H`). **Required** when `aggrMethods` is specified |
| `options` | string | `temporalValues` for simplified time series format |

::: warning
Specifying `aggrMethods` without `aggrPeriodDuration` returns `400 Bad Request`.
:::

### Get Temporal Entity

```http
GET /ngsi-ld/v1/temporal/entities/{entityId}
```

**Example with temporalValues:**

```bash
curl -s "https://api.vela.geolonia.com/ngsi-ld/v1/temporal/entities/urn:ngsi-ld:Sensor:1?options=temporalValues&timerel=after&timeAt=2026-01-01T00:00:00Z" \
  -H "Accept: application/ld+json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartcity" | jq .
```

**Response with `options=temporalValues`:**

```json
{
  "id": "urn:ngsi-ld:Sensor:1",
  "type": "Sensor",
  "temperature": {
    "type": "Property",
    "values": [[20.5, "2026-01-01T10:00:00Z"], [21.0, "2026-01-01T11:00:00Z"]]
  }
}
```

**Aggregation example:**

```bash
curl -s "https://api.vela.geolonia.com/ngsi-ld/v1/temporal/entities/urn:ngsi-ld:Sensor:1?aggrMethods=avg&aggrPeriodDuration=PT1H&timerel=after&timeAt=2026-01-01T00:00:00Z" \
  -H "Accept: application/ld+json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartcity" | jq .
```

**Aggregation response:**

```json
{
  "id": "urn:ngsi-ld:Sensor:1",
  "type": "Sensor",
  "temperature": {
    "type": "Property",
    "values": [
      {
        "@value": { "avg": 21.0 },
        "observedAt": "2026-01-01T10:00:00Z",
        "endAt": "2026-01-01T11:00:00Z"
      }
    ]
  }
}
```

### Temporal Batch Operations

Batch operations for temporal entities (up to 1,000 per request).

::: info Vela Extension
Temporal batch `create`, `upsert`, and `delete` are Vela OS extensions (not part of the ETSI specification). Only `query` is specification-conformant.
:::

| Operation | Method | Endpoint |
|-----------|--------|----------|
| Batch Create | `POST` | `/ngsi-ld/v1/temporal/entityOperations/create` |
| Batch Upsert | `POST` | `/ngsi-ld/v1/temporal/entityOperations/upsert` |
| Batch Delete | `POST` | `/ngsi-ld/v1/temporal/entityOperations/delete` |
| Batch Query | `POST` | `/ngsi-ld/v1/temporal/entityOperations/query` |

**Batch Query example:**

```json
{
  "type": "TemperatureSensor",
  "temporalQ": {
    "timerel": "after",
    "timeAt": "2026-01-01T00:00:00Z"
  }
}
```

## Snapshots

```http
GET /ngsi-ld/v1/snapshots
```

Retrieve entity snapshots. Snapshots provide a point-in-time view of entity state.

## EntityMaps

EntityMaps store query results as a map for efficient lookup by entity ID.

### Create EntityMap

```http
POST /ngsi-ld/v1/entityMaps
```

**Response:** `201 Created` with `Location` header.

### List EntityMaps

```http
GET /ngsi-ld/v1/entityMaps
```

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `limit` | integer | Maximum number of results | 20 |
| `offset` | integer | Number of results to skip | 0 |

### Get EntityMap

```http
GET /ngsi-ld/v1/entityMaps/{entityMapId}
```

### Update EntityMap

```http
PATCH /ngsi-ld/v1/entityMaps/{entityMapId}
```

**Response:** `204 No Content`

### Delete EntityMap

```http
DELETE /ngsi-ld/v1/entityMaps/{entityMapId}
```

**Response:** `204 No Content`

## Query Parameters Reference

A consolidated reference of query parameters available across entity endpoints.

### Filtering

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Filter by entity type |
| `id` | string | Filter by entity ID(s), comma-separated |
| `idPattern` | string | Regex pattern for entity IDs |
| `q` | string | NGSI-LD query language expression (e.g., `temperature>25;humidity<80`) |
| `scopeQ` | string | Scope query (e.g., `/Madrid`, `/Madrid/#`) |

### Attribute Selection

| Parameter | Type | Description |
|-----------|------|-------------|
| `attrs` | string | Comma-separated list of attributes to return |
| `pick` | string | Attributes to include (mutually exclusive with `omit`) |
| `omit` | string | Attributes to exclude (mutually exclusive with `pick`; `id` and `type` cannot be omitted) |

### Pagination and Ordering

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `limit` | integer | Maximum results to return | 20 |
| `offset` | integer | Number of results to skip | 0 |
| `orderBy` | string | Sort field | -- |

### Geo-Queries

| Parameter | Type | Description |
|-----------|------|-------------|
| `georel` | string | Geo-query operator (e.g., `near;maxDistance==1000`, `within`, `intersects`) |
| `geometry` | string | Geometry type (`Point`, `Polygon`, `LineString`, etc.) |
| `coordinates` | string | GeoJSON coordinates |
| `geoproperty` | string | GeoProperty name to query against (default: `location`) |

### Language

| Parameter | Type | Description |
|-----------|------|-------------|
| `lang` | string | LanguageProperty filter (BCP 47 language tag, comma-separated for priority order, `*` for all) |

### Output Options

| Option | Description |
|--------|-------------|
| `keyValues` | Simplified key-value output (no type/sub-attribute metadata) |
| `concise` | Concise notation |
| `entityMap` | Return results as an EntityMap |
| `sysAttrs` | Include system attributes (`createdAt`, `modifiedAt`) |
| `splitEntities` | Split response by entity type |

### Linked Entity Retrieval

| Parameter | Type | Description |
|-----------|------|-------------|
| `join` | string | `inline` (nest within Relationship) or `flat` (append to result array) |
| `joinLevel` | integer | Depth of linked entity resolution (default: 1) |

**Example:**

```bash
curl -s "https://api.vela.geolonia.com/ngsi-ld/v1/entities?type=Room&join=inline&joinLevel=2" \
  -H "Accept: application/ld+json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartcity" | jq .
```

## Error Responses

NGSI-LD error responses follow a standard format:

```json
{
  "type": "https://uri.etsi.org/ngsi-ld/errors/BadRequestData",
  "title": "Bad Request Data",
  "detail": "Entity already exists"
}
```

Common error types:

| HTTP Status | Error Type | Description |
|-------------|-----------|-------------|
| `400` | `BadRequestData` | Malformed request or invalid parameters |
| `404` | `ResourceNotFound` | Entity, attribute, or subscription not found |
| `409` | `AlreadyExists` | Entity with the same ID already exists |
| `422` | `UnprocessableEntity` | Semantically invalid request |

For a complete list of status codes, see [Status Codes](/en/api-reference/status-codes).

## Related Pages

- [NGSI Data Model](/en/core-concepts/ngsi-data-model) -- Understand entities, attributes, and metadata
- [Multi-Tenancy](/en/core-concepts/multi-tenancy) -- Data isolation with the `Fiware-Service` header
- [Installation & Setup](/en/getting-started/installation) -- API endpoints and authentication
- [First Entity Tutorial](/en/getting-started/first-entity) -- Hands-on CRUD walkthrough (NGSIv2)
- [Pagination](/en/api-reference/pagination) -- Pagination patterns across all endpoints
- [Status Codes](/en/api-reference/status-codes) -- HTTP status code reference
