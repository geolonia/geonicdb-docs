---
title: Federation
description: Distribute queries across multiple Context Brokers using Context Source Registrations (CSR) in GeonicDB.
outline: deep
---

# Federation

GeonicDB supports **federation** through Context Source Registrations (CSR), allowing you to distribute queries and updates across multiple Context Brokers. This enables a decentralized architecture where different data providers manage their own entities while a central broker can aggregate and forward requests seamlessly.

## Overview

Federation in GeonicDB works by registering external Context Brokers (context providers) that can supply data for specific entity types or patterns. When a query arrives for entities that match a registration, GeonicDB forwards the request to the registered provider and merges the results.

```text
Client → GeonicDB (Central) ──┬── Local MongoDB
                              ├── Context Provider A (e.g., Weather Service)
                              └── Context Provider B (e.g., Traffic Service)
```

## Context Source Registrations

### Creating a Registration (NGSIv2)

```bash
curl -X POST https://api.geonicdb.geolonia.com/v2/registrations \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "description": "Weather data from external provider",
    "dataProvided": {
      "entities": [
        { "type": "WeatherObserved" }
      ],
      "attrs": ["temperature", "humidity", "windSpeed"]
    },
    "provider": {
      "http": {
        "url": "https://weather-broker.example.com/v2"
      },
      "supportedForwardingMode": "all"
    }
  }'
```

### Creating a Registration (NGSI-LD)

```bash
curl -X POST https://api.geonicdb.geolonia.com/ngsi-ld/v1/csourceRegistrations \
  -H "Content-Type: application/json" \
  -H "NGSILD-Tenant: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
    "type": "ContextSourceRegistration",
    "information": [
      {
        "entities": [
          { "type": "WeatherObserved" }
        ],
        "propertyNames": ["temperature", "humidity", "windSpeed"]
      }
    ],
    "endpoint": "https://weather-broker.example.com/ngsi-ld/v1"
  }'
```

## Forwarding Modes

| Mode | Description |
|------|-------------|
| `all` | Forward queries and updates to the provider |
| `query` | Forward only query operations |
| `update` | Forward only update operations |
| `none` | Registration exists but no forwarding occurs |

## Distributed Queries

When a client queries for entities, GeonicDB checks registrations and fans out requests:

1. Query local MongoDB for matching entities
2. Forward the query to all matching context providers in parallel
3. Merge results from all sources
4. Return the combined response to the client

```bash
# This query may be served by local data + federated providers
curl https://api.geonicdb.geolonia.com/v2/entities?type=WeatherObserved \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Entity-Level Forwarding

For individual entity retrieval, if the entity is not found locally but a registration matches, GeonicDB forwards the request to the registered provider:

```bash
curl https://api.geonicdb.geolonia.com/v2/entities/urn:ngsi-ld:WeatherObserved:station01 \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## Loop Detection

GeonicDB includes loop detection to prevent infinite forwarding chains in multi-broker federations. When forwarding a request, GeonicDB adds tracking headers to detect and break circular forwarding paths. If a forwarded request arrives back at the same broker, it is terminated to avoid infinite loops.

## Registration Patterns

### By Entity Type

Forward all queries for a specific type:

```json
{
  "dataProvided": {
    "entities": [
      { "type": "WeatherObserved" }
    ]
  }
}
```

### By Entity ID Pattern

Forward queries matching a specific ID pattern:

```json
{
  "dataProvided": {
    "entities": [
      { "idPattern": "urn:ngsi-ld:Building:tokyo-.*", "type": "Building" }
    ]
  }
}
```

### By Attributes

Forward only specific attributes:

```json
{
  "dataProvided": {
    "entities": [
      { "type": "Room" }
    ],
    "attrs": ["temperature", "humidity"]
  }
}
```

## Managing Registrations

### List Registrations

```bash
curl https://api.geonicdb.geolonia.com/v2/registrations \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Delete a Registration

```bash
curl -X DELETE https://api.geonicdb.geolonia.com/v2/registrations/{registrationId} \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## Best Practices

- **Timeout handling** — Federated queries have a configurable timeout. If a context provider does not respond in time, the local results are returned without the provider's data.
- **Attribute partitioning** — Register providers for specific attributes to minimize unnecessary forwarding.
- **Health monitoring** — Monitor context provider availability. Unreachable providers will cause timeouts but will not block local data retrieval.
- **Security** — Ensure context providers are accessible over HTTPS. GeonicDB forwards the tenant context but providers must implement their own authentication.
