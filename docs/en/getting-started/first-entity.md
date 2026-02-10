---
title: First Entity Tutorial
description: A step-by-step tutorial for creating, querying, updating, and deleting NGSIv2 entities on Vela OS SaaS, including subscriptions.
outline: deep
---

# First Entity Tutorial

This tutorial walks you through the complete lifecycle of an NGSIv2 entity on Vela OS — from creation to subscriptions to deletion.

## What You'll Build

A smart building scenario with conference room sensors that track temperature, humidity, and occupancy. You'll learn to:

1. Create entities with attributes and metadata
2. Query and filter entities
3. Update attributes
4. Set up a subscription for change notifications
5. Delete entities

## Prerequisites

- Access to the Vela OS SaaS API (see [Installation & Setup](/en/getting-started/installation))
- `curl` and optionally `jq` for JSON formatting

::: tip
All commands use the SaaS endpoint. Replace `YOUR_API_KEY` with your actual API key.
:::

## Step 1: Create Entities

Create two conference room entities:

**Room 101 — East Wing:**

```bash
curl -X POST https://api.vela.geolonia.com/v2/entities \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
    "id": "urn:ngsi-ld:Room:101",
    "type": "Room",
    "name": {
      "type": "Text",
      "value": "Conference Room 101"
    },
    "floor": {
      "type": "Integer",
      "value": 1
    },
    "temperature": {
      "type": "Number",
      "value": 23.5,
      "metadata": {
        "unit": { "type": "Text", "value": "CEL" },
        "accuracy": { "type": "Number", "value": 0.5 }
      }
    },
    "humidity": {
      "type": "Number",
      "value": 55,
      "metadata": {
        "unit": { "type": "Text", "value": "%" }
      }
    },
    "occupancy": {
      "type": "Integer",
      "value": 0
    },
    "status": {
      "type": "Text",
      "value": "available"
    }
  }'
```

**Room 201 — West Wing:**

```bash
curl -X POST https://api.vela.geolonia.com/v2/entities \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
    "id": "urn:ngsi-ld:Room:201",
    "type": "Room",
    "name": {
      "type": "Text",
      "value": "Conference Room 201"
    },
    "floor": {
      "type": "Integer",
      "value": 2
    },
    "temperature": {
      "type": "Number",
      "value": 26.0,
      "metadata": {
        "unit": { "type": "Text", "value": "CEL" },
        "accuracy": { "type": "Number", "value": 0.5 }
      }
    },
    "humidity": {
      "type": "Number",
      "value": 62,
      "metadata": {
        "unit": { "type": "Text", "value": "%" }
      }
    },
    "occupancy": {
      "type": "Integer",
      "value": 5
    },
    "status": {
      "type": "Text",
      "value": "occupied"
    }
  }'
```

Both requests should return **201 Created**.

## Step 2: Query Entities

### List All Rooms

```bash
curl -s https://api.vela.geolonia.com/v2/entities?type=Room \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq '.[].id'
```

```json
"urn:ngsi-ld:Room:101"
"urn:ngsi-ld:Room:201"
```

### Get a Specific Entity

```bash
curl -s https://api.vela.geolonia.com/v2/entities/urn:ngsi-ld:Room:101 \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq .
```

### Filter by Attribute Value

Find rooms where temperature exceeds 25°C:

```bash
curl -s "https://api.vela.geolonia.com/v2/entities?type=Room&q=temperature>25" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq '.[].id'
```

```json
"urn:ngsi-ld:Room:201"
```

### Select Specific Attributes

Return only name and temperature:

```bash
curl -s "https://api.vela.geolonia.com/v2/entities?type=Room&attrs=name,temperature" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq .
```

### Key-Values Format

Get simplified output without metadata:

```bash
curl -s "https://api.vela.geolonia.com/v2/entities?type=Room&options=keyValues" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq .
```

```json
[
  {
    "id": "urn:ngsi-ld:Room:101",
    "type": "Room",
    "name": "Conference Room 101",
    "floor": 1,
    "temperature": 23.5,
    "humidity": 55,
    "occupancy": 0,
    "status": "available"
  },
  ...
]
```

### Combine Filters

Find occupied rooms on floor 2 with high temperature:

```bash
curl -s "https://api.vela.geolonia.com/v2/entities?type=Room&q=floor==2;temperature>25;status==occupied" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq '.[].id'
```

## Step 3: Update Attributes

### Partial Update (PATCH)

Update Room 101's temperature and occupancy:

```bash
curl -X PATCH https://api.vela.geolonia.com/v2/entities/urn:ngsi-ld:Room:101/attrs \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
    "temperature": {
      "type": "Number",
      "value": 28.0
    },
    "occupancy": {
      "type": "Integer",
      "value": 8
    },
    "status": {
      "type": "Text",
      "value": "occupied"
    }
  }'
```

Returns **204 No Content** on success.

### Update a Single Attribute Value

Update just the temperature value directly:

```bash
curl -X PUT https://api.vela.geolonia.com/v2/entities/urn:ngsi-ld:Room:101/attrs/temperature/value \
  -H "Content-Type: text/plain" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" \
  -d '22.0'
```

### Add a New Attribute

Add a `lastCleaned` timestamp attribute:

```bash
curl -X POST https://api.vela.geolonia.com/v2/entities/urn:ngsi-ld:Room:101/attrs \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
    "lastCleaned": {
      "type": "DateTime",
      "value": "2026-02-10T09:00:00Z"
    }
  }'
```

## Step 4: Create a Subscription

Set up a notification when any Room's temperature exceeds 27°C:

```bash
curl -X POST https://api.vela.geolonia.com/v2/subscriptions \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
    "description": "High temperature alert",
    "subject": {
      "entities": [
        { "idPattern": ".*", "type": "Room" }
      ],
      "condition": {
        "attrs": ["temperature"],
        "expression": {
          "q": "temperature>27"
        }
      }
    },
    "notification": {
      "http": {
        "url": "https://your-webhook-endpoint.example.com/alerts"
      },
      "attrs": ["temperature", "name", "floor"]
    },
    "throttling": 60
  }'
```

Returns **201 Created** with the subscription ID in the `Location` header.

### List Subscriptions

```bash
curl -s https://api.vela.geolonia.com/v2/subscriptions \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq .
```

### How Notifications Work

When a Room entity's temperature is updated to a value above 27°C, Vela sends a POST request to your webhook URL:

```json
{
  "subscriptionId": "...",
  "data": [
    {
      "id": "urn:ngsi-ld:Room:101",
      "type": "Room",
      "temperature": { "type": "Number", "value": 28.0 },
      "name": { "type": "Text", "value": "Conference Room 101" },
      "floor": { "type": "Integer", "value": 1 }
    }
  ]
}
```

::: info Notification Channels
Besides HTTP webhooks, Vela also supports **MQTT** (QoS 0/1/2) and **WebSocket** notifications. See the Subscriptions page for details.
:::

## Step 5: Delete Entities

Delete a single entity:

```bash
curl -X DELETE https://api.vela.geolonia.com/v2/entities/urn:ngsi-ld:Room:201 \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding"
```

Returns **204 No Content**.

### Batch Delete

Delete multiple entities at once using the batch operation:

```bash
curl -X POST https://api.vela.geolonia.com/v2/op/update \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
    "actionType": "delete",
    "entities": [
      { "id": "urn:ngsi-ld:Room:101", "type": "Room" }
    ]
  }'
```

## Summary

| Operation | Method | Endpoint |
|-----------|--------|----------|
| Create entity | `POST` | `/v2/entities` |
| List entities | `GET` | `/v2/entities` |
| Get entity | `GET` | `/v2/entities/{id}` |
| Update attributes | `PATCH` | `/v2/entities/{id}/attrs` |
| Add attributes | `POST` | `/v2/entities/{id}/attrs` |
| Replace attributes | `PUT` | `/v2/entities/{id}/attrs` |
| Update attribute value | `PUT` | `/v2/entities/{id}/attrs/{attr}/value` |
| Delete entity | `DELETE` | `/v2/entities/{id}` |
| Create subscription | `POST` | `/v2/subscriptions` |
| List subscriptions | `GET` | `/v2/subscriptions` |

## Next Steps

- [Demo App](/en/getting-started/demo-app) — See Vela in action with interactive demos
- NGSIv2 API Reference — Complete API documentation
- Query Language — Advanced filtering with q, mq, scopeQ
- Subscriptions — HTTP, MQTT, and WebSocket notifications
