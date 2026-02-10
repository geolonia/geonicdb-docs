---
title: NGSI Data Model
description: Understand the core data model concepts — Entities, Attributes, and Metadata — that form the foundation of the NGSI information model used by Vela OS.
outline: deep
---

# NGSI Data Model

Vela OS manages context information using the **NGSI (Next Generation Service Interface)** data model. This page explains the core building blocks: **Entities**, **Attributes**, and **Metadata**.

## Entities

An **Entity** is the primary unit of context information. It represents a real-world object or concept — a room, a sensor, a vehicle, a building.

Every entity has:

| Field | Description | Example |
|-------|-------------|---------|
| `id` | Unique identifier | `urn:ngsi-ld:Room:001` |
| `type` | Classification of the entity | `Room` |
| Attributes | Named properties holding data | `temperature`, `humidity` |

### Entity ID Conventions

- **NGSIv2** allows any string as an entity ID (e.g., `Room1`, `sensor-abc`).
- **NGSI-LD** recommends URN format: `urn:ngsi-ld:{Type}:{LocalId}`.

For best interoperability across both APIs, always use URN format:

```text
urn:ngsi-ld:Room:001
urn:ngsi-ld:Vehicle:ABC123
urn:ngsi-ld:WeatherObserved:Tokyo-2026-02-08
```

### Entity Type

The `type` field classifies entities. You can use it to filter queries (e.g., retrieve all entities of type `Room`). Standard type names from [Smart Data Models](https://smartdatamodels.org/) are recommended for semantic interoperability.

## Attributes

Attributes hold the actual data for an entity. Each attribute has a **type** and a **value**.

### NGSIv2 Attribute Format

In NGSIv2, attributes are JSON objects with `type`, `value`, and optional `metadata`:

```json
{
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
    "value": 60,
    "metadata": {}
  }
}
```

### NGSI-LD Attribute Types

NGSI-LD uses semantically richer attribute types:

| Attribute Type | Description | Example |
|---------------|-------------|---------|
| `Property` | A data value (number, string, boolean, object) | `"type": "Property", "value": 23.5` |
| `Relationship` | A reference to another entity | `"type": "Relationship", "object": "urn:ngsi-ld:Building:001"` |
| `GeoProperty` | A geographic location (GeoJSON) | `"type": "GeoProperty", "value": {"type": "Point", ...}` |
| `LanguageProperty` | Multi-language string values | `"type": "LanguageProperty", "languageMap": {"en": "...", "ja": "..."}` |

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "id": "urn:ngsi-ld:Room:001",
  "type": "Room",
  "temperature": {
    "type": "Property",
    "value": 23.5,
    "unitCode": "CEL",
    "observedAt": "2026-02-08T10:00:00Z"
  },
  "isPartOf": {
    "type": "Relationship",
    "object": "urn:ngsi-ld:Building:001"
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

### Attribute Type Mapping

Vela OS automatically converts between NGSIv2 and NGSI-LD attribute types:

| NGSIv2 Type | NGSI-LD Type | Description |
|-------------|--------------|-------------|
| `Number` | `Property` | Numeric values |
| `Text` / `String` | `Property` | String values |
| `Boolean` | `Property` | Boolean values |
| `DateTime` | `Property` | ISO 8601 date-time strings |
| `geo:json` | `GeoProperty` | GeoJSON geometry |
| `Relationship` | `Relationship` | Entity references |
| `StructuredValue` | `Property` | Complex JSON objects |

## Metadata

Metadata provides additional information about attributes.

### NGSIv2 Metadata

In NGSIv2, metadata is a nested object within an attribute:

```json
{
  "temperature": {
    "type": "Number",
    "value": 23.5,
    "metadata": {
      "unit": {
        "type": "Text",
        "value": "Celsius"
      },
      "accuracy": {
        "type": "Number",
        "value": 0.95
      }
    }
  }
}
```

### NGSI-LD Sub-Attributes

In NGSI-LD, metadata is represented as sub-attributes directly within the attribute:

```json
{
  "temperature": {
    "type": "Property",
    "value": 23.5,
    "unitCode": "CEL",
    "observedAt": "2026-02-08T10:00:00Z"
  }
}
```

### Metadata Mapping

| NGSIv2 Metadata | NGSI-LD Sub-Attribute | Description |
|------------------|-----------------------|-------------|
| `unit` (Text) | `unitCode` (string) | Measurement unit (e.g., "CEL", "KMH") |
| `observedAt` (DateTime) | `observedAt` (ISO 8601) | Observation timestamp |
| `datasetId` (Text) | `datasetId` (URI) | Dataset identifier |

## System Attributes

Entities have system-managed timestamps that differ by API:

| NGSIv2 | NGSI-LD | Description |
|--------|---------|-------------|
| `dateCreated` | `createdAt` | Entity creation timestamp |
| `dateModified` | `modifiedAt` | Last modification timestamp |

In NGSIv2, system attributes are returned when `options=dateCreated,dateModified` is specified. In NGSI-LD, they are always included in responses.

## Output Formats

### NGSIv2

| Format | Parameter | Description |
|--------|-----------|-------------|
| Normalized (default) | — | Full format with type and metadata |
| keyValues | `options=keyValues` | Key-value pairs only |
| values | `options=values` | Attribute values array only |

### NGSI-LD

| Format | Parameter | Description |
|--------|-----------|-------------|
| Normalized (default) | — | Full format with type and sub-attributes |
| Concise | `options=concise` | Simplified notation |
| keyValues | `options=keyValues` | Key-value pairs only |

## JSON-LD Context

NGSI-LD uses `@context` to define vocabulary and semantics. Vela OS supports the NGSI-LD core context and automatically resolves Smart Data Models contexts:

```json
{
  "@context": [
    "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
    "https://smartdatamodels.org/context.jsonld"
  ],
  "id": "urn:ngsi-ld:AirQualityObserved:001",
  "type": "AirQualityObserved"
}
```

NGSIv2 does not have a `@context` concept — vocabulary is implicit.

## Next Steps

- [Multi-Tenancy](/en/core-concepts/multi-tenancy) — Learn about data isolation with tenants
- [NGSIv2 vs NGSI-LD](/en/core-concepts/ngsiv2-vs-ngsild) — Compare both APIs side by side
- [Query Language](/en/core-concepts/query-language) — Filter entities with powerful query syntax
