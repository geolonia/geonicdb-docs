---
title: NGSIv2 vs NGSI-LD
description: A side-by-side comparison of NGSIv2 and NGSI-LD APIs in Vela OS — unified internal format, cross-API access, attribute mapping, and when to use which API.
outline: deep
---

# NGSIv2 vs NGSI-LD

Vela OS supports both **NGSIv2** and **NGSI-LD** on the same instance. A unified internal entity format allows data written through one API to be read through the other, with automatic format transformation handled transparently. This page provides a comprehensive comparison of the two APIs.

## Unified Architecture

Unlike FIWARE Orion (NGSIv2 only) and Orion-LD (NGSI-LD only), Vela OS serves both APIs from a single deployment backed by a single MongoDB database. Both API layers share the same entity storage and subscription infrastructure.

```text
┌─────────────────────────────────────────────────┐
│                   Clients                       │
│   NGSIv2 apps    │    NGSI-LD apps              │
└────────┬─────────┴──────────┬───────────────────┘
         │                    │
         ▼                    ▼
┌─────────────────┐  ┌──────────────────┐
│  NGSIv2 API     │  │  NGSI-LD API     │
│  /v2/entities   │  │  /ngsi-ld/v1/    │
│  Transformer    │  │  Transformer     │
└────────┬────────┘  └────────┬─────────┘
         │                    │
         ▼                    ▼
┌─────────────────────────────────────────────────┐
│          Unified Internal Entity Format          │
│        (Service Layer / Business Logic)          │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│                  MongoDB Atlas                   │
│          (Single Entity Collection)              │
└─────────────────────────────────────────────────┘
```

Each API layer has its own **transformer** that converts between the wire format (NGSIv2 JSON or NGSI-LD JSON-LD) and the unified internal representation. The service layer operates exclusively on the internal format, so business logic — queries, subscriptions, geo-processing — is shared across both APIs.

## Cross-API Access

Entities created via one API can be read, updated, and deleted via the other. This is the core benefit of Vela's unified architecture.

### Write via NGSIv2, Read via NGSI-LD

Create an entity using the NGSIv2 API:

```bash
curl -X POST https://api.vela.geolonia.com/v2/entities \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: demo" \
  -d '{
    "id": "urn:ngsi-ld:TemperatureSensor:001",
    "type": "TemperatureSensor",
    "temperature": {
      "type": "Number",
      "value": 23.5,
      "metadata": {
        "unit": { "type": "Text", "value": "CEL" }
      }
    },
    "location": {
      "type": "geo:json",
      "value": {
        "type": "Point",
        "coordinates": [139.7671, 35.6812]
      }
    }
  }'
```

Read the same entity via the NGSI-LD API:

```bash
curl https://api.vela.geolonia.com/ngsi-ld/v1/entities/urn:ngsi-ld:TemperatureSensor:001 \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: demo"
```

Response (NGSI-LD normalized format):

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "id": "urn:ngsi-ld:TemperatureSensor:001",
  "type": "TemperatureSensor",
  "temperature": {
    "type": "Property",
    "value": 23.5,
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
```

### Write via NGSI-LD, Read via NGSIv2

Create an entity using the NGSI-LD API:

```bash
curl -X POST https://api.vela.geolonia.com/ngsi-ld/v1/entities \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: demo" \
  -d '{
    "id": "urn:ngsi-ld:Room:101",
    "type": "Room",
    "temperature": {
      "type": "Property",
      "value": 21.0,
      "unitCode": "CEL",
      "observedAt": "2026-02-10T09:00:00Z"
    },
    "isPartOf": {
      "type": "Relationship",
      "object": "urn:ngsi-ld:Building:001"
    }
  }'
```

Read via NGSIv2:

```bash
curl https://api.vela.geolonia.com/v2/entities/urn:ngsi-ld:Room:101 \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: demo"
```

Response (NGSIv2 normalized format):

```json
{
  "id": "urn:ngsi-ld:Room:101",
  "type": "Room",
  "temperature": {
    "type": "Number",
    "value": 21.0,
    "metadata": {
      "unit": { "type": "Text", "value": "CEL" },
      "observedAt": { "type": "DateTime", "value": "2026-02-10T09:00:00Z" }
    }
  },
  "isPartOf": {
    "type": "Relationship",
    "value": "urn:ngsi-ld:Building:001",
    "metadata": {}
  }
}
```

## Attribute Type Mapping

Vela OS automatically converts attribute types between the two API formats. The mapping is deterministic and lossless for all standard types.

| NGSIv2 Type | NGSI-LD Type | Description |
|-------------|--------------|-------------|
| `Number` | `Property` | Numeric values (integer or float) |
| `Text` / `String` | `Property` | String values |
| `Boolean` | `Property` | Boolean values |
| `DateTime` | `Property` | ISO 8601 date-time strings |
| `StructuredValue` | `Property` | Complex JSON objects or arrays |
| `geo:json` | `GeoProperty` | GeoJSON geometry (Point, Polygon, etc.) |
| `Relationship` | `Relationship` | Reference to another entity by ID |
| _(no equivalent)_ | `LanguageProperty` | Multi-language string values (NGSI-LD only) |

::: info LanguageProperty in NGSIv2
When a `LanguageProperty` is read via NGSIv2, it is returned as a `StructuredValue` containing the `languageMap` object. The semantic meaning is preserved but the NGSI-LD-specific type is not available.
:::

## System Attribute Differences

Both APIs track entity creation and modification timestamps, but use different field names.

| NGSIv2 | NGSI-LD | Description |
|--------|---------|-------------|
| `dateCreated` | `createdAt` | Entity creation timestamp |
| `dateModified` | `modifiedAt` | Last modification timestamp |

In **NGSIv2**, system attributes are only included when explicitly requested via query parameters:

```bash
curl "https://api.vela.geolonia.com/v2/entities/urn:ngsi-ld:Room:101?options=dateCreated,dateModified" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: demo"
```

In **NGSI-LD**, system attributes (`createdAt`, `modifiedAt`) are always included in responses by default. They also appear at the attribute level, tracking when each individual attribute was created or last modified.

## Output Format Differences

Each API supports different output format options.

### NGSIv2 Formats

| Format | Parameter | Description |
|--------|-----------|-------------|
| Normalized (default) | — | Full format with `type`, `value`, and `metadata` |
| keyValues | `options=keyValues` | Simplified key-value pairs |
| values | `options=values` | Ordered attribute values array |

```bash
# Normalized (default)
curl "https://api.vela.geolonia.com/v2/entities/urn:ngsi-ld:Room:101" \
  -H "x-api-key: YOUR_API_KEY" -H "Fiware-Service: demo"

# keyValues
curl "https://api.vela.geolonia.com/v2/entities/urn:ngsi-ld:Room:101?options=keyValues" \
  -H "x-api-key: YOUR_API_KEY" -H "Fiware-Service: demo"
```

keyValues response:

```json
{
  "id": "urn:ngsi-ld:Room:101",
  "type": "Room",
  "temperature": 21.0
}
```

### NGSI-LD Formats

| Format | Parameter | Description |
|--------|-----------|-------------|
| Normalized (default) | — | Full format with `type`, `value`, and sub-attributes |
| Concise | `options=concise` | Simplified notation (NGSI-LD 1.6+) |
| keyValues | `options=keyValues` | Simple key-value pairs |

```bash
# Normalized (default)
curl "https://api.vela.geolonia.com/ngsi-ld/v1/entities/urn:ngsi-ld:Room:101" \
  -H "x-api-key: YOUR_API_KEY" -H "Fiware-Service: demo"

# Concise
curl "https://api.vela.geolonia.com/ngsi-ld/v1/entities/urn:ngsi-ld:Room:101?options=concise" \
  -H "x-api-key: YOUR_API_KEY" -H "Fiware-Service: demo"
```

Concise response:

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "id": "urn:ngsi-ld:Room:101",
  "type": "Room",
  "temperature": 21.0,
  "isPartOf": { "object": "urn:ngsi-ld:Building:001" }
}
```

## Common Features

Both APIs share many core capabilities through the unified service layer.

| Feature | NGSIv2 | NGSI-LD |
|---------|--------|---------|
| Query language (`q` parameter) | ✅ | ✅ |
| Geo-queries (near, within, intersects, etc.) | ✅ | ✅ |
| Pagination (limit/offset) | ✅ | ✅ |
| Subscriptions (HTTP, MQTT, WebSocket) | ✅ | ✅ |
| Batch operations | ✅ | ✅ |
| Federation / context providers | ✅ | ✅ |
| Multi-tenancy | ✅ | ✅ |

For details on query syntax, see the [Query Language](/en/core-concepts/query-language) page.

## NGSI-LD-Specific Features

NGSI-LD offers additional capabilities not available in NGSIv2.

### Relationship

A first-class attribute type for entity-to-entity references. The `object` field holds the target entity ID:

```json
{
  "isPartOf": {
    "type": "Relationship",
    "object": "urn:ngsi-ld:Building:001"
  }
}
```

While NGSIv2 also supports `"type": "Relationship"`, NGSI-LD defines formal semantics and enables relationship traversal.

### LanguageProperty

Multi-language values using a `languageMap`:

```json
{
  "name": {
    "type": "LanguageProperty",
    "languageMap": {
      "en": "Tokyo Tower",
      "ja": "東京タワー",
      "zh": "东京塔"
    }
  }
}
```

Use the `lang` query parameter to retrieve a specific language variant.

### Scope

Entity-level scope filtering using the `scope` attribute and `scopeQ` query parameter:

```json
{
  "id": "urn:ngsi-ld:Room:101",
  "type": "Room",
  "scope": ["/building/floor1"]
}
```

```bash
curl "https://api.vela.geolonia.com/ngsi-ld/v1/entities?type=Room&scopeQ=/building/#" \
  -H "x-api-key: YOUR_API_KEY" -H "Fiware-Service: demo"
```

### Pick and Omit

Fine-grained attribute selection using `pick` and `omit` query parameters:

```bash
# Return only temperature and humidity
curl "https://api.vela.geolonia.com/ngsi-ld/v1/entities?type=Room&pick=temperature,humidity" \
  -H "x-api-key: YOUR_API_KEY" -H "Fiware-Service: demo"

# Return all attributes except location
curl "https://api.vela.geolonia.com/ngsi-ld/v1/entities?type=Room&omit=location" \
  -H "x-api-key: YOUR_API_KEY" -H "Fiware-Service: demo"
```

### JSON-LD @context

NGSI-LD uses `@context` to define vocabulary mappings and provide semantic meaning. The context can be provided inline or via the `Link` header:

```bash
curl -X POST https://api.vela.geolonia.com/ngsi-ld/v1/entities \
  -H "Content-Type: application/ld+json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: demo" \
  -d '{
    "@context": [
      "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
      "https://smartdatamodels.org/context.jsonld"
    ],
    "id": "urn:ngsi-ld:AirQualityObserved:001",
    "type": "AirQualityObserved",
    "PM25": {
      "type": "Property",
      "value": 12.3,
      "observedAt": "2026-02-10T09:00:00Z"
    }
  }'
```

NGSIv2 does not have a `@context` concept — vocabulary is implicit.

## Entity ID Conventions

Both APIs accept arbitrary string entity IDs. However, for cross-API compatibility, the **URN format** is strongly recommended:

```text
urn:ngsi-ld:{EntityType}:{LocalId}
```

Examples:

```text
urn:ngsi-ld:Room:001
urn:ngsi-ld:Vehicle:ABC123
urn:ngsi-ld:WeatherObserved:Tokyo-2026-02-10
```

::: warning Short IDs and NGSI-LD
NGSI-LD technically requires entity IDs to be valid URIs. While Vela OS accepts short IDs like `Room1` for convenience, they may cause issues with strict NGSI-LD clients. Always use URN format for production deployments.
:::

For more detail on entity IDs, types, and attributes, see [NGSI Data Model](/en/core-concepts/ngsi-data-model).

## When to Use Which API

### Choose NGSIv2 when:

- **Migrating from FIWARE Orion** — NGSIv2 is API-compatible with Orion, so existing clients work without changes.
- **Simple IoT data collection** — Straightforward sensor readings and basic entity management.
- **Existing NGSIv2 clients** — Libraries, dashboards, or services already using NGSIv2.
- **Minimal overhead** — No need for JSON-LD, `@context`, or linked data semantics.

### Choose NGSI-LD when:

- **Semantic data modeling** — You need linked data, `@context`, and rich type semantics.
- **Entity relationships** — First-class `Relationship` attributes with traversal capabilities.
- **Multi-language support** — `LanguageProperty` for internationalized data.
- **Smart Data Models** — Using standardized data models from the [Smart Data Models](https://smartdatamodels.org/) program.
- **New projects** — NGSI-LD is the latest ETSI standard and the recommended choice for greenfield applications.

### Decision Matrix

| Criterion | NGSIv2 | NGSI-LD |
|-----------|--------|---------|
| Learning curve | Lower | Moderate |
| API complexity | Simpler | Richer |
| Linked data / semantics | No | Yes |
| Legacy compatibility | Orion-compatible | New standard |
| Entity relationships | Basic | First-class |
| Multi-language | No | Yes (`LanguageProperty`) |
| `@context` support | No | Yes |
| Query language | `q`, `mq`, `georel` | `q`, `scopeQ`, `georel`, `pick`, `omit` |

## Hybrid Operation Patterns

One of Vela's key strengths is enabling hybrid operation — running both APIs simultaneously on the same data.

### Gradual Migration

Migrate from NGSIv2 to NGSI-LD incrementally. Existing NGSIv2 services continue operating while new services use NGSI-LD:

```text
┌──────────────────────────┐
│  Existing NGSIv2 Service │──→ /v2/entities ──┐
└──────────────────────────┘                   │
                                                ▼
                                          ┌──────────┐
                                          │ Vela OS  │
                                          │ (shared  │
                                          │  data)   │
                                          └──────────┘
                                                ▲
┌──────────────────────────┐                   │
│  New NGSI-LD Service     │──→ /ngsi-ld/v1/ ──┘
└──────────────────────────┘
```

### Read-Optimized Pattern

Use the API format that best suits each use case:

- **IoT devices** write sensor data via NGSIv2 (simpler payload, lower overhead)
- **Analytics platforms** read the same data via NGSI-LD (richer semantics, `@context` for data integration)

```bash
# IoT device writes via NGSIv2 (simple)
curl -X POST https://api.vela.geolonia.com/v2/entities \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartcity" \
  -d '{
    "id": "urn:ngsi-ld:AirQualityObserved:sensor42",
    "type": "AirQualityObserved",
    "PM25": { "type": "Number", "value": 15.2 },
    "PM10": { "type": "Number", "value": 28.7 }
  }'

# Analytics platform reads via NGSI-LD (semantic)
curl "https://api.vela.geolonia.com/ngsi-ld/v1/entities?type=AirQualityObserved&options=keyValues" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartcity" \
  -H "Link: <https://smartdatamodels.org/context.jsonld>; rel=\"http://www.w3.org/ns/json-ld#context\"; type=\"application/ld+json\""
```

### Subscription Bridging

Subscriptions created via one API will trigger for entity changes made through either API:

```bash
# Create a subscription via NGSI-LD
curl -X POST https://api.vela.geolonia.com/ngsi-ld/v1/subscriptions \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartcity" \
  -d '{
    "type": "Subscription",
    "entities": [{ "type": "AirQualityObserved" }],
    "notification": {
      "endpoint": {
        "uri": "https://example.com/webhook",
        "accept": "application/json"
      }
    }
  }'
```

This subscription fires when an `AirQualityObserved` entity is created or updated via **either** `/v2/entities` or `/ngsi-ld/v1/entities`.

## API Endpoint Reference

| Operation | NGSIv2 | NGSI-LD |
|-----------|--------|---------|
| Entity CRUD | `/v2/entities` | `/ngsi-ld/v1/entities` |
| Subscriptions | `/v2/subscriptions` | `/ngsi-ld/v1/subscriptions` |
| Batch Operations | `/v2/op/update`, `/v2/op/query` | `/ngsi-ld/v1/entityOperations/*` |
| Registrations | `/v2/registrations` | `/ngsi-ld/v1/csourceRegistrations` |
| Types | `/v2/types` | `/ngsi-ld/v1/types` |

For full API details, see the [NGSIv2 API Reference](/en/api-reference/ngsiv2) and [NGSI-LD API Reference](/en/api-reference/ngsild).

## Next Steps

- [NGSI Data Model](/en/core-concepts/ngsi-data-model) — Understand entities, attributes, and metadata
- [Multi-Tenancy](/en/core-concepts/multi-tenancy) — Data isolation with tenant headers
- [Query Language](/en/core-concepts/query-language) — Filter entities with powerful query syntax
- [NGSIv2 API Reference](/en/api-reference/ngsiv2) — Full NGSIv2 endpoint documentation
- [NGSI-LD API Reference](/en/api-reference/ngsild) — Full NGSI-LD endpoint documentation
