---
title: First API Call
description: Make your first GeonicDB API call — create an entity, query it, and set up a change notification.
outline: deep
---

# First API Call

This page walks you through making your first real API calls against GeonicDB SaaS using `curl`, JavaScript, and Python.

::: info Prerequisites
- A GeonicDB SaaS account and API key ([Sign Up](/en/saas/sign-up))
- `curl` installed, or Node.js / Python for the code samples

**API URL**: `https://geonicdb.geolonia.com` — subject to change during the current preview period. Your account manager will notify you of any updates.
:::

## Set Up Environment Variables

Before running the samples, export your credentials:

```bash
export GEONICDB_API_KEY="YOUR_API_KEY"
export GEONICDB_TENANT="YOUR_TENANT"
export GEONICDB_BASE_URL="https://geonicdb.geolonia.com"
```

## 1. Create an Entity

Create a temperature sensor entity:

::: code-group

```bash [curl]
curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$GEONICDB_BASE_URL/v2/entities" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $GEONICDB_API_KEY" \
  -H "Fiware-Service: $GEONICDB_TENANT" \
  -d '{
    "id": "urn:ngsi-ld:Sensor:temp-001",
    "type": "Sensor",
    "temperature": {
      "type": "Number",
      "value": 22.5
    },
    "location": {
      "type": "geo:json",
      "value": {
        "type": "Point",
        "coordinates": [139.6917, 35.6895]
      }
    }
  }'
# Expected: 201
```

```js [JavaScript]
const BASE_URL = process.env.GEONICDB_BASE_URL;
const API_KEY  = process.env.GEONICDB_API_KEY;
const TENANT   = process.env.GEONICDB_TENANT;

const res = await fetch(`${BASE_URL}/v2/entities`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': API_KEY,
    'Fiware-Service': TENANT,
  },
  body: JSON.stringify({
    id: 'urn:ngsi-ld:Sensor:temp-001',
    type: 'Sensor',
    temperature: { type: 'Number', value: 22.5 },
    location: {
      type: 'geo:json',
      value: { type: 'Point', coordinates: [139.6917, 35.6895] },
    },
  }),
});
console.log(res.status); // 201
```

```python [Python]
import os, requests

BASE_URL = os.environ["GEONICDB_BASE_URL"]
API_KEY  = os.environ["GEONICDB_API_KEY"]
TENANT   = os.environ["GEONICDB_TENANT"]

headers = {
    "Content-Type": "application/json",
    "x-api-key": API_KEY,
    "Fiware-Service": TENANT,
}
entity = {
    "id": "urn:ngsi-ld:Sensor:temp-001",
    "type": "Sensor",
    "temperature": {"type": "Number", "value": 22.5},
    "location": {
        "type": "geo:json",
        "value": {"type": "Point", "coordinates": [139.6917, 35.6895]},
    },
}
r = requests.post(f"{BASE_URL}/v2/entities", json=entity, headers=headers)
print(r.status_code)  # 201
```

:::

A **201 Created** response means the entity was stored successfully.

## 2. Query the Entity

Retrieve the entity you just created:

::: code-group

```bash [curl]
curl -s "$GEONICDB_BASE_URL/v2/entities/urn:ngsi-ld:Sensor:temp-001" \
  -H "x-api-key: $GEONICDB_API_KEY" \
  -H "Fiware-Service: $GEONICDB_TENANT" | jq .
```

```js [JavaScript]
const res = await fetch(
  `${BASE_URL}/v2/entities/urn:ngsi-ld:Sensor:temp-001`,
  { headers: { 'x-api-key': API_KEY, 'Fiware-Service': TENANT } }
);
console.log(await res.json());
```

```python [Python]
r = requests.get(
    f"{BASE_URL}/v2/entities/urn:ngsi-ld:Sensor:temp-001",
    headers=headers,
)
print(r.json())
```

:::

Expected response:

```json
{
  "id": "urn:ngsi-ld:Sensor:temp-001",
  "type": "Sensor",
  "temperature": {
    "type": "Number",
    "value": 22.5,
    "metadata": {}
  },
  "location": {
    "type": "geo:json",
    "value": { "type": "Point", "coordinates": [139.6917, 35.6895] },
    "metadata": {}
  }
}
```

## 3. Update an Attribute

Update the temperature reading:

```bash
curl -X PATCH "$GEONICDB_BASE_URL/v2/entities/urn:ngsi-ld:Sensor:temp-001/attrs" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $GEONICDB_API_KEY" \
  -H "Fiware-Service: $GEONICDB_TENANT" \
  -d '{ "temperature": { "type": "Number", "value": 28.0 } }'
# Expected: 204 No Content
```

## 4. List All Entities

```bash
curl -s "$GEONICDB_BASE_URL/v2/entities?type=Sensor&options=keyValues" \
  -H "x-api-key: $GEONICDB_API_KEY" \
  -H "Fiware-Service: $GEONICDB_TENANT" | jq .
```

The `options=keyValues` parameter returns simplified output without metadata wrappers:

```json
[
  {
    "id": "urn:ngsi-ld:Sensor:temp-001",
    "type": "Sensor",
    "temperature": 28.0,
    "location": { "type": "Point", "coordinates": [139.6917, 35.6895] }
  }
]
```

## 5. Set Up a Change Notification

Receive a webhook when temperature exceeds 25°C:

```bash
curl -X POST "$GEONICDB_BASE_URL/v2/subscriptions" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $GEONICDB_API_KEY" \
  -H "Fiware-Service: $GEONICDB_TENANT" \
  -d '{
    "description": "High temperature alert",
    "subject": {
      "entities": [{ "idPattern": ".*", "type": "Sensor" }],
      "condition": {
        "attrs": ["temperature"],
        "expression": { "q": "temperature>25" }
      }
    },
    "notification": {
      "http": { "url": "https://your-webhook.example.com/alerts" },
      "attrs": ["temperature", "location"]
    }
  }'
# Expected: 201 Created
```

## Next Steps

- [First Entity Tutorial](/en/saas/first-entity) — Complete CRUD walkthrough including batch operations and subscriptions
- [API Reference](/en/api-reference/ngsiv2) — Full NGSIv2 API documentation
- [Query Language](/en/core-concepts/query-language) — Advanced filtering with `q`, `mq`, `georel`
- [Console](/en/saas/console) — Management console overview (Coming Soon)
