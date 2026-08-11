---
title: "Smart Data Models"
description: "FIWARE Smart Data Models support"
outline: deep
---
# Smart Data Models Support

GeonicDB supports data models from the [Smart Data Models](https://smartdatamodels.org/) initiative. Smart Data Models is a catalog of standardized data models widely used in the FIWARE ecosystem and smart city domains.

## Overview

Smart Data Models support includes the following two features:

1. **MCP tool**: Browse the catalog and search for available data models
2. **Model catalog**: Entity type → JSON-LD @context URL mapping, for clients to reference

> **Changed in #1733**: GeonicDB no longer injects a Smart Data Models @context into responses based on
> the entity `type`. See [Response @context](#response-context) below.

## Supported Domains

GeonicDB supports key Smart Data Models from the following domains:

| Domain | Example models included |
|--------|------------------------|
| **Parking** | OffStreetParking, OnStreetParking, ParkingSpot |
| **Weather** | WeatherObserved, WeatherForecast |
| **Transportation** | Vehicle, TrafficFlowObserved, BikeHireDockingStation |
| **Environment** | AirQualityObserved, NoiseLevelObserved, WaterQualityObserved |
| **Building** | Building, BuildingOperation |
| **Device** | Device, DeviceModel |
| **WasteManagement** | WasteContainer, WasteContainerIsle |
| **Energy** | EnergyMonitor, ThreePhaseAcMeasurement |

Each model contains the following information:
- Entity type name
- Domain
- JSON-LD @context URL
- Description
- Schema URL
- Sample properties

## MCP Tool: `data_models`

An MCP tool is available for browsing the Smart Data Models catalog.

### Actions

#### `list_domains` - Get list of domains

Retrieves a list of all available domains.

**Parameters**: None

**Response example**:
```json
{
  "domains": [
    "Building",
    "Device",
    "Energy",
    "Environment",
    "Parking",
    "Transportation",
    "WasteManagement",
    "Weather"
  ],
  "total": 8
}
```

#### `list_models` - Get list of models

Retrieves a list of available data models. Can be filtered by domain or search term.

**Parameters**:
- `domain` (optional): Filter by domain (e.g. "Parking")
- `search` (optional): Search by type or description (e.g. "weather")
- `limit` (optional): Maximum number of results (default: 100)
- `offset` (optional): Pagination offset (default: 0)

**Response example**:
```json
{
  "models": [
    {
      "type": "OffStreetParking",
      "domain": "Parking",
      "contextUrl": "https://raw.githubusercontent.com/smart-data-models/dataModel.Parking/master/context.jsonld",
      "description": "Off street parking site with explicit entries and exits",
      "schemaUrl": "https://github.com/smart-data-models/dataModel.Parking/blob/master/OffStreetParking/schema.json",
      "exampleProperties": ["name", "location", "totalSpotNumber", "availableSpotNumber", "occupancyDetectionType"]
    }
  ],
  "total": 1
}
```

#### `get_model` - Get details for a specific model

Retrieves data model details for the specified entity type.

**Parameters**:
- `type` (required): Entity type name (e.g. "OffStreetParking")

**Response example**:
```json
{
  "type": "OffStreetParking",
  "domain": "Parking",
  "contextUrl": "https://raw.githubusercontent.com/smart-data-models/dataModel.Parking/master/context.jsonld",
  "description": "Off street parking site with explicit entries and exits",
  "schemaUrl": "https://github.com/smart-data-models/dataModel.Parking/blob/master/OffStreetParking/schema.json",
  "exampleProperties": ["name", "location", "totalSpotNumber", "availableSpotNumber", "occupancyDetectionType"],
  "propertyDetails": {
    "name": {
      "ngsiType": "Property",
      "valueType": "string",
      "example": "Central Parking Lot",
      "required": true
    },
    "location": {
      "ngsiType": "GeoProperty",
      "valueType": "GeoJSON Point or Polygon",
      "example": { "type": "Point", "coordinates": [139.6917, 35.6895] },
      "required": true
    },
    "totalSpotNumber": {
      "ngsiType": "Property",
      "valueType": "number",
      "example": 200
    },
    "availableSpotNumber": {
      "ngsiType": "Property",
      "valueType": "number",
      "example": 45
    },
    "occupancyDetectionType": {
      "ngsiType": "Property",
      "valueType": "Array<string>",
      "example": ["balancing", "singleSpaceDetection"]
    }
  }
}
```

**Note**: The `propertyDetails` field is available for key models (WeatherObserved, AirQualityObserved, OffStreetParking, OnStreetParking, TrafficFlowObserved, Vehicle, Device, Building, WasteContainer, EnergyMonitor). Each property contains the following information:
- `ngsiType`: NGSI-LD property type (Property, GeoProperty, Relationship, LanguageProperty)
- `valueType`: Value type (number, string, GeoJSON structure, Object, etc.)
- `example`: Sample value for use as a real-world example
- `required`: Whether the field is required (optional)
- `@context`: JSON-LD vocabulary URI (optional, HTTP(S) URL only). For custom data models, specify well-known vocabulary (e.g., `https://schema.org/email`) to improve Linked Data interoperability. Properties without `@context` get auto-generated URLs on this broker's own base URL (`{brokerBaseUrl}/vocab/{tenantId}/{propertyName}`, #1984) — dereferenceable via `GET /vocab/{tenantId}/{term}`.

## Response @context

**GeonicDB does not guess an @context from the entity type.** The @context used to render a response
is exclusively the one the request supplied; if the request supplied none, only the NGSI-LD core
@context is used.

This follows ETSI GS CIM 009 (see <https://cim.etsi.org/NGSI-LD/official/clause-5.html>):

- clause 5.5.5 — "If the input provided by an API client does not include any @context, then the
  implementation shall at minimum assign the Core @context to such an input."
- clause 5.5.7 — "the @context used to perform compaction or expansion of terms shall be the one
  provided by each API call (or the default @context in its absence), and **not any other @context
  which might have been supplied previously**" and "At compaction time, in the event that no matching
  term is found in the current @context, implementations shall render Fully Qualified Names."

### How It Works

@context resolution when retrieving an entity:

1. **Explicit @context** (JSON-LD `Link` header on the read) - used as-is
2. **Otherwise, the NGSI-LD core @context only**

The @context supplied at creation time is still persisted with the entity (#1620 / #1633), but it is
used **only** to recover the fully qualified names of the stored attributes — never to decide the
response vocabulary. Consequently, reading an entity written under a domain context **without**
supplying that context returns fully qualified URIs for any term the core @context cannot compact:

```bash
# created with a context that maps name → https://example-vocab/ns#name
GET /ngsi-ld/v1/entities/urn:ngsi-ld:Building:v1
→ { "type": "https://example-vocab/ns#Building",
    "https://example-vocab/ns#name": { "type": "Property", "value": "HQ" } }

# supply the same context and the short terms come back
GET /ngsi-ld/v1/entities/urn:ngsi-ld:Building:v1
Link: <https://example.org/building.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"
→ { "type": "Building", "name": { "type": "Property", "value": "HQ" } }
```

**Migration note**: clients that relied on the broker guessing the Smart Data Models @context must now
pass the model's @context URL themselves (via the `Link` header, or the body for `application/ld+json`
writes). The catalog table above and the MCP tool give you the URL to pass.

### Example: Creating and Retrieving a Smart Data Model Entity

**Create entity**:
```bash
POST /ngsi-ld/v1/entities
Content-Type: application/ld+json

{
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

**Retrieve entity** (supplying the Smart Data Models @context so the response uses its vocabulary):
```bash
GET /ngsi-ld/v1/entities/urn:ngsi-ld:OffStreetParking:downtown
Link: <https://raw.githubusercontent.com/smart-data-models/dataModel.Parking/master/context.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"
```

**Response** (the @context is the one the request supplied):
```json
{
  "@context": "https://raw.githubusercontent.com/smart-data-models/dataModel.Parking/master/context.jsonld",
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

### Important Notes

- **The @context specified at creation is persisted** (#1620 / #1633): a URL, an array of URLs, or an inline context object — supplied via the request body for `application/ld+json`, or the Link header for `application/json`. It is used to recover the fully qualified names of the stored attributes, **not** to choose the response @context (#1733)
- **The read request decides the response vocabulary**: whatever @context the read supplies is what the response is compacted with; with none supplied, the core @context only
- **Terms the response @context cannot compact are rendered as fully qualified URIs** (ETSI clause 5.5.7)

### Examples for Different Domains

**Weather domain**:
```json
{
  "@context": [
    "https://raw.githubusercontent.com/smart-data-models/dataModel.Weather/master/context.jsonld",
    "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld"
  ],
  "id": "urn:ngsi-ld:WeatherObserved:station01",
  "type": "WeatherObserved",
  "temperature": {
    "type": "Property",
    "value": 25.5
  }
}
```

**Transportation domain**:
```json
{
  "@context": [
    "https://raw.githubusercontent.com/smart-data-models/dataModel.Transportation/master/context.jsonld",
    "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld"
  ],
  "id": "urn:ngsi-ld:Vehicle:car123",
  "type": "Vehicle",
  "speed": {
    "type": "Property",
    "value": 60
  }
}
```

## Benefits

### Interoperability with the FIWARE Ecosystem

Using the Smart Data Models @context enables the following:

- **Standardized property names**: Compatibility with other FIWARE systems
- **Semantic interoperability**: Meaningful data exchange using JSON-LD
- **Ecosystem integration**: Integration with the FIWARE Marketplace and other FIWARE components

### Improved AI Assistant Experience

Through MCP tools, AI assistants (such as Claude) can:

- **Search data models**: Search available data model schemas by domain or keyword
- **Retrieve property information**: Get detailed information for each property from `propertyDetails`
  - Identify NGSI-LD property types (Property, GeoProperty, Relationship)
  - Understand value types (number, string, GeoJSON structure, etc.)
  - Use sample values as real-world examples
  - Identify required fields
- **Create accurate entities**: Generate correctly structured NGSI-LD entities based on retrieved information
- **Domain-specific best practices**: Implement according to Smart Data Models standards

**Recommended workflow**:
1. Search for a model with `list_models`
2. Retrieve `propertyDetails` for the selected model with `get_model`
3. Create an entity with the correct NGSI-LD structure based on the `propertyDetails` information

## References

- [Smart Data Models Official Site](https://smartdatamodels.org/)
- [Smart Data Models GitHub](https://github.com/smart-data-models)
- [FIWARE Data Models](https://fiware-datamodels.readthedocs.io/)
- [NGSI-LD Specification](https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/)

## Related Documentation

- [MCP.md](../ai-integration/mcp-server.md) - Model Context Protocol server
- [AI_INTEGRATION.md](../ai-integration/overview.md) - AI tool integration
- [API_NGSILD.md](../api-reference/ngsild.md) - NGSI-LD API reference
