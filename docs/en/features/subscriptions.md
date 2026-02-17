---
title: Subscriptions & Notifications
description: Configure real-time notifications via HTTP Webhooks, MQTT, and WebSocket event streaming in GeonicDB.
outline: deep
---

# Subscriptions & Notifications

GeonicDB provides three notification channels for real-time data delivery when entity attributes change: **HTTP Webhooks**, **MQTT**, and **WebSocket event streaming**. Subscriptions let you define conditions that trigger notifications, ensuring your applications stay in sync with the latest context data.

## Notification Channels

| Channel | Direction | Filtering | Latency | Protocol |
|---------|-----------|-----------|---------|----------|
| HTTP Webhook | Push | Subscription conditions | ~1 min | HTTP/HTTPS POST |
| MQTT | Push | Subscription conditions | ~1 min | MQTT 3.1.1 / 5.0 |
| WebSocket | Push | Tenant + entity type/ID pattern | Real-time (sub-second) | WebSocket (WSS) |

## Creating Subscriptions

### NGSIv2

```bash
curl -X POST https://api.geonicdb.geolonia.com/v2/subscriptions \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "description": "Notify on temperature changes",
    "subject": {
      "entities": [
        { "idPattern": ".*", "type": "Room" }
      ],
      "condition": {
        "attrs": ["temperature"],
        "expression": {
          "q": "temperature>30"
        }
      }
    },
    "notification": {
      "http": {
        "url": "https://your-app.example.com/webhook"
      },
      "attrs": ["temperature", "humidity"],
      "attrsFormat": "normalized"
    },
    "throttling": 5
  }'
```

### NGSI-LD

```bash
curl -X POST https://api.geonicdb.geolonia.com/ngsi-ld/v1/subscriptions \
  -H "Content-Type: application/json" \
  -H "NGSILD-Tenant: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "type": "Subscription",
    "entities": [
      { "type": "Room" }
    ],
    "watchedAttributes": ["temperature"],
    "q": "temperature>30",
    "notification": {
      "endpoint": {
        "uri": "https://your-app.example.com/webhook",
        "accept": "application/json"
      },
      "attributes": ["temperature", "humidity"]
    },
    "throttling": 5
  }'
```

## HTTP Webhook Notifications

When a subscription condition is met, GeonicDB sends an HTTP POST request to the configured endpoint.

### Notification Payload (NGSIv2)

```json
{
  "subscriptionId": "5f3a...",
  "data": [
    {
      "id": "urn:ngsi-ld:Room:001",
      "type": "Room",
      "temperature": {
        "type": "Number",
        "value": 32.5,
        "metadata": {}
      }
    }
  ]
}
```

### Custom Headers

You can include custom headers in webhook notifications:

```json
{
  "notification": {
    "http": {
      "url": "https://your-app.example.com/webhook"
    },
    "httpCustom": {
      "headers": {
        "X-Custom-Header": "my-value",
        "Authorization": "Bearer your-token"
      }
    }
  }
}
```

## MQTT Notifications

GeonicDB can publish notifications to an MQTT broker instead of sending HTTP requests.

```json
{
  "notification": {
    "mqtt": {
      "url": "mqtt://broker.example.com:1883",
      "topic": "geonicdb/notifications/room",
      "qos": 1
    },
    "attrs": ["temperature"]
  }
}
```

| Parameter | Description |
|-----------|-------------|
| `url` | MQTT broker URL (`mqtt://` or `mqtts://`) |
| `topic` | MQTT topic to publish to |
| `qos` | Quality of Service level (0, 1, or 2) |

## WebSocket Event Streaming

For real-time browser-based applications, GeonicDB provides WebSocket event streaming that pushes entity changes directly to connected clients.

### Connecting

```javascript
const ws = new WebSocket(
  'wss://api.geonicdb.geolonia.com/ws?tenant=smartcity&token=YOUR_API_KEY'
);

ws.onopen = () => {
  // Subscribe to specific entity types
  ws.send(JSON.stringify({
    action: 'subscribe',
    entityTypes: ['Room', 'Sensor']
  }));

  // Keep-alive ping every 5 minutes
  setInterval(() => {
    ws.send(JSON.stringify({ action: 'ping' }));
  }, 300000);
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type !== 'pong') {
    console.log(`${data.type}: ${data.entityId}`, data.data);
  }
};
```

### Connection Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `tenant` | Yes | Tenant name (equivalent to `Fiware-Service` header) |
| `token` | When auth enabled | API access token |

### Subscription Filters

After connecting, send a `subscribe` message to filter events:

```json
{
  "action": "subscribe",
  "entityTypes": ["Room", "Sensor"],
  "idPattern": "urn:ngsi-ld:Room:.*"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `entityTypes` | string[] | Entity types to receive events for |
| `idPattern` | string | Regex pattern for entity IDs |

### Event Format

```json
{
  "type": "entityUpdated",
  "tenant": "smartcity",
  "servicePath": "/",
  "entityId": "urn:ngsi-ld:Room:001",
  "entityType": "Room",
  "data": {
    "temperature": { "type": "Number", "value": 32.5 }
  },
  "changedAttributes": ["temperature"],
  "timestamp": "2026-01-15T10:30:00Z"
}
```

Event types: `entityCreated`, `entityUpdated`, `entityDeleted`.

### WebSocket Constraints

| Item | Value |
|------|-------|
| Idle timeout | 10 minutes (send ping every 5 minutes) |
| Max concurrent connections | 500 (default) |
| Max frame size | 128 KB |
| Connection TTL | 2 hours |

## Condition Expressions

Subscriptions support expression-based filtering using the `q` parameter:

| Operator | Example | Description |
|----------|---------|-------------|
| `==` | `temperature==30` | Equal |
| `!=` | `status!=inactive` | Not equal |
| `>` | `temperature>25` | Greater than |
| `<` | `temperature<10` | Less than |
| `>=` | `temperature>=20` | Greater or equal |
| `<=` | `temperature<=35` | Less or equal |
| `..` | `temperature==10..30` | Range (inclusive) |

Combine conditions with `;` (AND) or `,` (OR):

```text
temperature>25;humidity<80
```

## Throttling

The `throttling` field (in seconds) limits the notification rate per subscription. When set, GeonicDB will not send more than one notification within the specified interval, even if multiple attribute changes occur.

```json
{
  "throttling": 10
}
```

This ensures at most one notification every 10 seconds for that subscription.

## Managing Subscriptions

### List Subscriptions

```bash
curl https://api.geonicdb.geolonia.com/v2/subscriptions \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Delete a Subscription

```bash
curl -X DELETE https://api.geonicdb.geolonia.com/v2/subscriptions/{subscriptionId} \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## Architecture

Subscription notifications are processed asynchronously:

```text
Entity Change → MongoDB Change Stream → EventBridge
                                            ├── SubscriptionMatcher → SQS FIFO → HTTP/MQTT
                                            └── WsBroadcastFunction → WebSocket clients
```

This architecture ensures reliable, ordered delivery of notifications while maintaining low latency for WebSocket streaming.
