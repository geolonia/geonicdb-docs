---
title: "Smart Data Models"
description: "FIWARE Smart Data Models Support"
outline: deep
---
# Smart Data Models Support

GeonicDB supports data models from the [Smart Data Models](https://smartdatamodels.org/) initiative. Smart Data Models is a catalog of standardized data models widely used in the FIWARE ecosystem and smart city domains.

## Overview

Smart Data Models support includes two main features:

1. **MCP Tools**: Browse the catalog and search for available data models
2. **@context Auto-completion**: Automatically add appropriate JSON-LD @context for known Smart Data Model entity types

## Supported Domains

GeonicDB supports major Smart Data Models from the following domains:

| Domain | Example Models |
|---------|----------------|
| **Parking** | OffStreetParking, OnStreetParking, ParkingSpot |
| **Weather** | WeatherObserved, WeatherForecast |
| **Transportation** | Vehicle, TrafficFlowObserved, BikeHireDockingStation |
| **Environment** | AirQualityObserved, NoiseLevelObserved, WaterQualityObserved |
| **Building** | Building, BuildingOperation |
| **Device** | Device, DeviceModel |
| **WasteManagement** | WasteContainer, WasteContainerIsle |
| **Energy** | EnergyMonitor, ThreePhaseAcMeasurement |

Each model includes the following information:
- Entity type name
- Domain
- JSON-LD @context URL
- Description
- Schema URL
- Sample properties

## MCP Tool: `data_models`

An MCP tool is available for browsing the Smart Data Models catalog.

### Actions

#### `list_domains` - Get Domain List

Retrieve a list of all available domains.

**Parameters**: None

**Response Example**:
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

#### `list_models` - Get Model List

Retrieve a list of available data models. Can be filtered by domain or search term.

**Parameters**:
- `domain` (optional): Filter by domain (e.g., "Parking")
- `search` (optional): Search by type or description (e.g., "weather")
- `limit` (optional): Maximum number of results (default: 100)
- `offset` (optional): Pagination offset (default: 0)

**Response Example**:
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

#### `get_model` - Get Specific Model Details

Retrieve data model details for a specified entity type.

**Parameters**:
- `type` (required): Entity type name (e.g., "OffStreetParking")

**Response Example**:
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

**Note**: The `propertyDetails` field is available for major models (WeatherObserved, AirQualityObserved, OffStreetParking, OnStreetParking, TrafficFlowObserved, Vehicle, Device, Building, WasteContainer, EnergyMonitor). Each property includes:
- `ngsiType`: NGSI-LD property type (Property, GeoProperty, Relationship, LanguageProperty)
- `valueType`: Value type (number, string, GeoJSON structure, Object, etc.)
- `example`: Sample value for actual usage
- `required`: Whether the field is required (optional)

## @context Auto-completion

When retrieving entities via the NGSI-LD API, GeonicDB automatically adds the appropriate @context for known Smart Data Model types.

### How It Works

Priority for @context resolution when retrieving entities:

1. **Explicit @context** (specified in Link header or parameter) - Always takes priority
2. **Smart Data Models @context** (when entity type is a known SDM) - Auto-completion
3. **Default NGSI-LD Core @context** - Fallback

### Example: Creating and Retrieving a Smart Data Model Entity

**Creating an Entity**:
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

**Retrieving the Entity**:
```bash
GET /ngsi-ld/v1/entities/urn:ngsi-ld:OffStreetParking:downtown
```

**Response** (@context is automatically added):
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

### Important Notes

- **@context is not stored in storage**: @context is metadata dynamically generated during API response
- **Explicit @context takes priority**: If you specify @context in the Link header, it overrides SDM auto-completion
- **Unknown types use default @context**: Custom entity types only receive the NGSI-LD core @context

### Examples from Different Domains

**Weather Domain**:
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

**Transportation Domain**:
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

### Interoperability with FIWARE Ecosystem

Using Smart Data Models @context enables:

- **Standardized Property Names**: Compatibility with other FIWARE systems
- **Semantic Interoperability**: Meaningful data exchange using JSON-LD
- **Ecosystem Integration**: Integration with FIWARE Marketplace and other FIWARE components

### Improved AI Assistant Capabilities

MCP tools enable AI assistants (like Claude) to:

- **Search Data Models**: Find available data model schemas by domain or keyword
- **Get Property Information**: Retrieve detailed information for each property from `propertyDetails`
  - Determine NGSI-LD property types (Property, GeoProperty, Relationship)
  - Understand value types (number, string, GeoJSON structure, etc.)
  - Use sample values for actual usage examples
  - Identify required fields
- **Create Accurate Entities**: Generate correctly structured NGSI-LD entities based on retrieved information
- **Apply Domain-Specific Best Practices**: Implement according to Smart Data Models standards

**Recommended Workflow**:
1. Search models using `list_models`
2. Retrieve `propertyDetails` for selected model using `get_model`
3. Create entities with correct NGSI-LD structure based on `propertyDetails` information

## References

- [Smart Data Models Official Site](https://smartdatamodels.org/)
- [Smart Data Models GitHub](https://github.com/smart-data-models)
- [FIWARE Data Models](https://fiware-datamodels.readthedocs.io/)
- [NGSI-LD Specification](https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/)

## Related Documentation

- [MCP.md](../ai-integration/mcp-server.md) - Model Context Protocol Server
- [AI_INTEGRATION.md](../ai-integration/overview.md) - AI Tool Integration
- [API_NGSILD.md](../api-reference/ngsild.md) - NGSI-LD API Reference