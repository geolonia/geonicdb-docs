---
title: Temporal API
description: Access entity history and time-series data with TTL management using the Temporal API in Vela OS.
outline: deep
---

# Temporal API

Vela OS provides a **Temporal API** for accessing the historical state of entities over time. Every attribute change is recorded, enabling time-series analysis, trend monitoring, and auditing of context data.

## Overview

The Temporal API follows the NGSI-LD temporal representation model. When temporal tracking is enabled, Vela OS stores each entity attribute update as a time-indexed record, allowing you to query the full history of an entity's attributes.

## Querying Temporal Data

### NGSI-LD Temporal Entities

```bash
# Get the temporal history of an entity
curl -G https://api.vela.geolonia.com/ngsi-ld/v1/temporal/entities/urn:ngsi-ld:Room:001 \
  --data-urlencode "timerel=between" \
  --data-urlencode "timeAt=2026-01-01T00:00:00Z" \
  --data-urlencode "endTimeAt=2026-01-31T23:59:59Z" \
  -H "NGSILD-Tenant: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Response

```json
{
  "id": "urn:ngsi-ld:Room:001",
  "type": "Room",
  "temperature": [
    {
      "type": "Property",
      "value": 22.5,
      "observedAt": "2026-01-15T08:00:00Z"
    },
    {
      "type": "Property",
      "value": 23.1,
      "observedAt": "2026-01-15T09:00:00Z"
    },
    {
      "type": "Property",
      "value": 24.0,
      "observedAt": "2026-01-15T10:00:00Z"
    }
  ]
}
```

## Time Query Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `timerel` | Temporal relationship | `before`, `after`, `between` |
| `timeAt` | Reference time point | `2026-01-01T00:00:00Z` |
| `endTimeAt` | End time (required for `between`) | `2026-01-31T23:59:59Z` |
| `timeproperty` | Which time property to use | `observedAt` (default) |
| `attrs` | Filter to specific attributes | `temperature,humidity` |
| `lastN` | Return only the last N values | `10` |

### Time Relationships

| `timerel` | Description |
|-----------|-------------|
| `before` | Records before `timeAt` |
| `after` | Records after `timeAt` |
| `between` | Records between `timeAt` and `endTimeAt` |

## Querying Multiple Entities

```bash
# Get temporal data for all Room entities
curl -G https://api.vela.geolonia.com/ngsi-ld/v1/temporal/entities \
  --data-urlencode "type=Room" \
  --data-urlencode "timerel=after" \
  --data-urlencode "timeAt=2026-01-15T00:00:00Z" \
  --data-urlencode "attrs=temperature" \
  --data-urlencode "lastN=5" \
  -H "NGSILD-Tenant: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## Filtering by Attribute

Retrieve history for specific attributes only:

```bash
curl -G https://api.vela.geolonia.com/ngsi-ld/v1/temporal/entities/urn:ngsi-ld:Room:001 \
  --data-urlencode "attrs=temperature,humidity" \
  --data-urlencode "timerel=after" \
  --data-urlencode "timeAt=2026-01-15T00:00:00Z" \
  -H "NGSILD-Tenant: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## TTL (Time-to-Live)

Vela OS supports TTL configuration for temporal data to manage storage growth. Temporal records older than the configured TTL are automatically purged.

### Configuration

TTL is configured at the tenant level. Records exceeding the retention period are cleaned up automatically via MongoDB TTL indexes.

> **Note:** In Vela OS SaaS, TTL is managed at the tenant level by administrators. For details on configuring TTL settings, refer to the [Admin API documentation](/en/api-reference/admin).

### Use Cases

| TTL Setting | Scenario |
|-------------|----------|
| 24 hours | Real-time dashboards with recent data only |
| 7 days | Weekly trend analysis |
| 30 days | Monthly reporting |
| 365 days | Annual compliance auditing |

## Use Cases

### Temperature Trend Analysis

```bash
# Get hourly temperature readings for the last 24 hours
curl -G https://api.vela.geolonia.com/ngsi-ld/v1/temporal/entities/urn:ngsi-ld:Room:001 \
  --data-urlencode "attrs=temperature" \
  --data-urlencode "timerel=after" \
  --data-urlencode "timeAt=2026-01-14T10:00:00Z" \
  -H "NGSILD-Tenant: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Audit Trail

The Temporal API provides a full audit trail of entity changes, making it suitable for compliance requirements where you need to demonstrate data provenance and change history.

### IoT Sensor Data

For IoT applications, the Temporal API stores sensor readings over time, enabling:

- Historical analysis and reporting
- Anomaly detection by comparing current values to historical baselines
- Data export for machine learning model training
