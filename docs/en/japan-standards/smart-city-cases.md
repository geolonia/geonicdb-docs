---
title: Smart City Use Cases
description: Smart city and IoT use cases built with Vela OS, including traffic management, environmental monitoring, disaster prevention, and waste collection.
outline: deep
---

# Smart City Use Cases

Vela OS is designed to power **smart city** and **IoT** platforms. As a FIWARE Orion-compatible Context Broker with serverless architecture and Japan-specific standards support, it is well suited for urban infrastructure projects across multiple domains.

## Architecture Pattern

A typical smart city deployment with Vela follows this pattern:

```text
IoT Sensors / Data Sources
    ↓ (NGSIv2 / NGSI-LD)
Vela OS (Context Broker)
    ↓
┌────────────┬─────────────┬──────────────┐
│ Dashboards │ AI Agents   │ CADDE        │
│ (WebSocket)│ (MCP/tools) │ (x-cadde-*)  │
└────────────┴─────────────┴──────────────┘
```

**Key components**:

- **Data ingestion** via NGSIv2 or NGSI-LD APIs from IoT sensors and external systems
- **Real-time notifications** via WebSocket, MQTT, or HTTP webhooks to dashboards
- **AI integration** via MCP server for autonomous data analysis
- **Cross-domain data sharing** via CADDE connector for government interoperability
- **Spatial queries** via ZFXY spatial IDs for location-based services

## Traffic Management

### Use Case

Monitor traffic flow in real time using vehicle sensors and roadside units. Detect congestion, optimize signal timing, and provide navigation guidance.

### Implementation with Vela

```bash
# Create a traffic sensor entity
curl -X POST https://api.vela.geolonia.com/v2/entities \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smart-city" \
  -H "Fiware-ServicePath: /traffic" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "id": "urn:ngsi-ld:TrafficFlowObserved:shibuya-001",
    "type": "TrafficFlowObserved",
    "location": {
      "type": "geo:json",
      "value": {"type": "Point", "coordinates": [139.7013, 35.6580]}
    },
    "intensity": {"type": "Number", "value": 342},
    "averageVehicleSpeed": {"type": "Number", "value": 28.5},
    "congestionLevel": {"type": "Text", "value": "moderate"}
  }'
```

**Vela features used**: Geo-queries for spatial filtering, WebSocket subscriptions for real-time dashboard updates, temporal API for historical trend analysis.

## Environmental Monitoring

### Use Case

Track air quality, noise levels, temperature, and humidity across urban areas. Generate alerts when thresholds are exceeded.

### Implementation with Vela

```bash
# Create an air quality sensor entity
curl -X POST https://api.vela.geolonia.com/v2/entities \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smart-city" \
  -H "Fiware-ServicePath: /environment" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "id": "urn:ngsi-ld:AirQualityObserved:shinjuku-003",
    "type": "AirQualityObserved",
    "location": {
      "type": "geo:json",
      "value": {"type": "Point", "coordinates": [139.6917, 35.6895]}
    },
    "PM25": {"type": "Number", "value": 12.3},
    "PM10": {"type": "Number", "value": 28.7},
    "NO2": {"type": "Number", "value": 15.2},
    "temperature": {"type": "Number", "value": 22.1},
    "relativeHumidity": {"type": "Number", "value": 65.0}
  }'
```

**Vela features used**: Subscriptions with threshold conditions (`q` parameter) for alerts, CADDE integration for sharing data with government environmental agencies, DCAT-AP catalog for open data publishing.

## Disaster Prevention

### Use Case

Monitor water levels in rivers and reservoirs, detect seismic activity, and distribute evacuation alerts across a city's infrastructure.

### Implementation with Vela

```bash
# Create a water level sensor entity
curl -X POST https://api.vela.geolonia.com/v2/entities \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smart-city" \
  -H "Fiware-ServicePath: /disaster-prevention" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "id": "urn:ngsi-ld:WaterLevelObserved:tama-river-005",
    "type": "WaterLevelObserved",
    "location": {
      "type": "geo:json",
      "value": {"type": "Point", "coordinates": [139.4455, 35.6285]}
    },
    "waterLevel": {"type": "Number", "value": 2.35},
    "alertLevel": {"type": "Text", "value": "normal"},
    "measuredAt": {"type": "DateTime", "value": "2026-02-10T09:00:00Z"}
  }'
```

**Vela features used**: Spatial ID (ZFXY) for 3D hazard zone mapping, subscriptions for real-time alert distribution, federation for aggregating data from multiple municipal brokers.

## Waste Collection

### Use Case

Optimize waste collection routes based on real-time fill levels in smart waste bins. Reduce collection costs and improve service efficiency.

### Implementation with Vela

```bash
# Create a waste container entity
curl -X POST https://api.vela.geolonia.com/v2/entities \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smart-city" \
  -H "Fiware-ServicePath: /waste" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "id": "urn:ngsi-ld:WasteContainer:minato-042",
    "type": "WasteContainer",
    "location": {
      "type": "geo:json",
      "value": {"type": "Point", "coordinates": [139.7454, 35.6586]}
    },
    "fillingLevel": {"type": "Number", "value": 0.75},
    "temperature": {"type": "Number", "value": 18.2},
    "status": {"type": "Text", "value": "ok"}
  }'
```

**Vela features used**: Geo-queries to find nearby containers along a route, subscriptions triggered when `fillingLevel > 0.85`, vector tiles for map visualization of container locations.

## FIWARE + Vela Architecture

Vela OS integrates with the broader **FIWARE ecosystem** as a drop-in replacement for Orion:

```text
┌─────────────────────────────────┐
│        Smart City Platform      │
├──────────┬──────────┬───────────┤
│ Vela OS  │ QuantumLeap│ Keyrock │
│ (Broker) │ (Time DB)  │ (Auth)  │
├──────────┴──────────┴───────────┤
│         FIWARE Ecosystem        │
└─────────────────────────────────┘
```

Existing FIWARE-based smart city deployments can migrate to Vela to gain serverless scaling, AI integration, and Japan-specific standards support while maintaining compatibility with other FIWARE components.

## Next Steps

- [CADDE](/en/japan-standards/cadde) — Cross-domain data exchange for government interoperability
- [Spatial ID / ZFXY](/en/japan-standards/spatial-id-zfxy) — 3D spatial identification for location services
