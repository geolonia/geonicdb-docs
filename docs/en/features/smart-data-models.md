---
title: Smart Data Models
description: Use FIWARE Smart Data Models with automatic @context resolution and MCP-based schema browsing in Vela OS.
outline: deep
---

# Smart Data Models

Vela OS integrates with the [FIWARE Smart Data Models](https://smartdatamodels.org/) initiative, providing **automatic @context resolution** for known data model types and an **MCP tool** for browsing the model catalog. This ensures semantic interoperability with the broader FIWARE ecosystem.

## Overview

Smart Data Models are standardized data schemas widely used in smart city and IoT deployments. Vela OS supports them through two features:

1. **@context Auto-Completion** — When retrieving NGSI-LD entities of known Smart Data Model types, Vela OS automatically adds the correct JSON-LD @context
2. **MCP Tool (`data_models`)** — Browse and search available data models via the MCP interface

## Supported Domains

| Domain | Example Models |
|--------|---------------|
| **Parking** | OffStreetParking, OnStreetParking, ParkingSpot |
| **Weather** | WeatherObserved, WeatherForecast |
| **Transportation** | Vehicle, TrafficFlowObserved, BikeHireDockingStation |
| **Environment** | AirQualityObserved, NoiseLevelObserved, WaterQualityObserved |
| **Building** | Building, BuildingOperation |
| **Device** | Device, DeviceModel |
| **WasteManagement** | WasteContainer, WasteContainerIsle |
| **Energy** | EnergyMonitor, ThreePhaseAcMeasurement |

## @context Auto-Completion

When you retrieve entities via the NGSI-LD API, Vela OS checks if the entity type matches a known Smart Data Model and automatically includes the appropriate @context.

### Resolution Priority

1. **Explicit @context** — A `Link` header or request parameter always takes precedence
2. **Smart Data Models @context** — Added automatically for known types
3. **Default NGSI-LD Core @context** — Fallback for custom types

### Example

**Create a Smart Data Model entity:**

```bash
curl -X POST https://api.vela.geolonia.com/ngsi-ld/v1/entities \
  -H "Content-Type: application/json" \
  -H "NGSILD-Tenant: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "id": "urn:ngsi-ld:OffStreetParking:downtown",
    "type": "OffStreetParking",
    "name": {
      "type": "Property",
      "value": "Downtown Parking"
    },
    "totalSpotNumber": {
      "type": "Property",
      "value": 200
    },
    "location": {
      "type": "GeoProperty",
      "value": {
        "type": "Point",
        "coordinates": [139.7671, 35.6812]
      }
    }
  }'
```

**Retrieve with auto-completed @context:**

```bash
curl https://api.vela.geolonia.com/ngsi-ld/v1/entities/urn:ngsi-ld:OffStreetParking:downtown \
  -H "NGSILD-Tenant: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Response:**

```json
{
  "@context": [
    "https://raw.githubusercontent.com/smart-data-models/dataModel.Parking/master/context.jsonld",
    "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld"
  ],
  "id": "urn:ngsi-ld:OffStreetParking:downtown",
  "type": "OffStreetParking",
  "name": {
    "type": "Property",
    "value": "Downtown Parking"
  },
  "totalSpotNumber": {
    "type": "Property",
    "value": 200
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

The `@context` array includes both the domain-specific context and the NGSI-LD core context, ensuring full semantic interoperability.

## MCP Tool: `data_models`

The `data_models` MCP tool lets AI assistants and programmatic clients browse the Smart Data Models catalog.

### List Domains

```json
{
  "action": "list_domains"
}
```

**Response:**

```json
{
  "domains": [
    "Building", "Device", "Energy", "Environment",
    "Parking", "Transportation", "WasteManagement", "Weather"
  ],
  "total": 8
}
```

### List Models

Search and filter available data models:

```json
{
  "action": "list_models",
  "domain": "Parking",
  "search": "parking",
  "limit": 10,
  "offset": 0
}
```

**Response:**

```json
{
  "models": [
    {
      "type": "OffStreetParking",
      "domain": "Parking",
      "contextUrl": "https://raw.githubusercontent.com/smart-data-models/dataModel.Parking/master/context.jsonld",
      "description": "Off street parking site with explicit entries and exits",
      "schemaUrl": "https://github.com/smart-data-models/dataModel.Parking/blob/master/OffStreetParking/schema.json",
      "exampleProperties": ["name", "location", "totalSpotNumber", "availableSpotNumber"]
    }
  ],
  "total": 1
}
```

### Get Model Details

```json
{
  "action": "get_model",
  "type": "OffStreetParking"
}
```

Returns the full model definition including @context URL, schema URL, description, and example properties.

## Benefits

### FIWARE Ecosystem Interoperability

- **Standardized property names** compatible with other FIWARE components
- **Semantic interoperability** via JSON-LD @context for meaningful data exchange
- **Ecosystem integration** with FIWARE Marketplace and third-party tools

### AI Assistant Integration

The MCP tool enables AI assistants (such as Claude) to:

- Search available data model schemas
- Suggest appropriate properties when creating entities
- Follow domain-specific best practices for data modeling

## Important Notes

- The @context is **not stored in the database** — it is dynamically added to API responses
- Explicit @context (via `Link` header) always overrides auto-completion
- Custom entity types that do not match any Smart Data Model receive only the default NGSI-LD core @context
