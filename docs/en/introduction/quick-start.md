---
title: Quick Start
description: Get started with GeonicDB SaaS API in minutes — create, read, update, and delete your first entity.
outline: deep
---

# Quick Start

This guide walks you through making your first API calls to the GeonicDB SaaS endpoint. No installation required — just a terminal with `curl`.

## Prerequisites

- A terminal with `curl` installed
- An API key for GeonicDB SaaS

::: tip Coming Soon
API key registration is currently being prepared. Once available, you'll be able to obtain your key from the GeonicDB dashboard.
:::

## Step 1: Verify Connectivity

Check that the API endpoint is reachable:

```bash
curl https://api.geonicdb.geolonia.com/version
```

Expected response:

```json
{
  "orion": {
    "version": "4.1.0",
    "uptime": "..."
  }
}
```

## Step 2: Create an Entity

Create a temperature sensor entity using the NGSIv2 API:

```bash
curl -X POST https://api.geonicdb.geolonia.com/v2/entities \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: myproject" \
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

A successful creation returns **201 Created** with a `Location` header.

::: info About Fiware-Service
The `Fiware-Service` header acts as a tenant identifier. Data is fully isolated between tenants. Choose any name for your project (e.g., `myproject`, `smartcity`).
:::

## Step 3: Retrieve the Entity

Read back the entity you just created:

```bash
curl https://api.geonicdb.geolonia.com/v2/entities/urn:ngsi-ld:TemperatureSensor:001 \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: myproject"
```

Expected response:

```json
{
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
}
```

## Step 4: Update the Entity

Update the temperature reading:

```bash
curl -X PATCH https://api.geonicdb.geolonia.com/v2/entities/urn:ngsi-ld:TemperatureSensor:001/attrs \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: myproject" \
  -d '{
    "temperature": {
      "type": "Number",
      "value": 25.0
    }
  }'
```

A successful update returns **204 No Content**.

Verify the update:

```bash
curl https://api.geonicdb.geolonia.com/v2/entities/urn:ngsi-ld:TemperatureSensor:001/attrs/temperature \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: myproject"
```

```json
{
  "type": "Number",
  "value": 25.0,
  "metadata": {
    "unit": { "type": "Text", "value": "CEL" }
  }
}
```

## Step 5: Delete the Entity

Remove the entity:

```bash
curl -X DELETE https://api.geonicdb.geolonia.com/v2/entities/urn:ngsi-ld:TemperatureSensor:001 \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: myproject"
```

A successful deletion returns **204 No Content**.

## Step 6: Try NGSI-LD (Optional)

GeonicDB supports NGSI-LD alongside NGSIv2. Create the same entity using the NGSI-LD API:

```bash
curl -X POST https://api.geonicdb.geolonia.com/ngsi-ld/v1/entities \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: myproject" \
  -d '{
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
  }'
```

Retrieve it via either API:

```bash
# Via NGSI-LD
curl https://api.geonicdb.geolonia.com/ngsi-ld/v1/entities/urn:ngsi-ld:TemperatureSensor:001 \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: myproject"

# Via NGSIv2 (cross-API access)
curl https://api.geonicdb.geolonia.com/v2/entities/urn:ngsi-ld:TemperatureSensor:001 \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: myproject"
```

Both APIs return the same entity, automatically transformed to the requested format.

## What's Next?

- [Installation & Setup](/en/getting-started/installation) — API access details and recommended tools
- [First Entity Tutorial](/en/getting-started/first-entity) — In-depth CRUD walkthrough with subscriptions
- [Demo App](/en/getting-started/demo-app) — Explore interactive demo applications
- NGSIv2 API Reference — Full API documentation
