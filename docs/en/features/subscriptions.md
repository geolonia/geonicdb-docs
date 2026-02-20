---
title: "Event Streaming"
description: "Real-time event streaming"
outline: deep
---
# WebSocket Event Streaming

GeonicDB supports real-time event streaming via WebSocket. You can subscribe to entity changes in real-time and reflect them instantly in web applications and dashboards.

## Table of Contents

- [Overview](#overview)
- [Architecture and Activation](#architecture-and-activation)
- [Connection Method](#connection-method)
- [Message Format and Filtering](#message-format-and-filtering)
- [Client Implementation](#client-implementation)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Limitations](#limitations)

---

## Overview

Event Streaming adds a parallel path to the existing MongoDB Change Streams → EventBridge pipeline, broadcasting entity changes to WebSocket clients.

### Notification Channel Comparison

| Channel | Direction | Filtering | Latency |
|---------|-----------|-----------|---------|
| HTTP Webhook (existing) | Push | Subscription conditions | ~1min |
| MQTT (existing) | Push | Subscription conditions | ~1min |
| WebSocket (this feature) | Push | Tenant + Entity type/ID pattern | ~1min |

---

## Architecture and Activation

### Architecture

```text
EventBridge ─┬─> SubscriptionMatcher -> SQS -> HTTP/MQTT  [Existing]
             └─> WsBroadcastFunction -> API GW WebSocket -> Client  [New]
```

- **Connection State**: DynamoDB (PAY_PER_REQUEST, automatic TTL cleanup)
- **Connection Management**: 3 Lambda functions (connect, disconnect, default)
- **Broadcast**: Lambda function triggered directly from EventBridge

### Activation

Deploy by setting the `EventStreamingEnabled` parameter to `true` in the SAM template.

```bash
sam deploy -t infrastructure/template.yaml \
  --parameter-overrides EventStreamingEnabled=true
```

### Environment Variables

| Variable Name | Description |
|--------------|-------------|
| `EVENT_STREAMING_ENABLED` | Enable by setting to `true` |
| `WS_CONNECTIONS_TABLE` | DynamoDB connection table name (auto-configured) |
| `WS_API_ENDPOINT` | WebSocket API endpoint (auto-configured) |

---

## Connection Method

### WebSocket URL

```text
wss://{api-id}.execute-api.{region}.amazonaws.com/{stage}?tenant={tenantName}
```

For local development:

```text
ws://localhost:3000?tenant={tenantName}
```

### Query Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `tenant` | ✅ | Tenant name (equivalent to `Fiware-Service` header) |

### Authentication

When `AUTH_ENABLED=true`, an authentication token is required for WebSocket connections. The token is extracted in the following priority order:

1. **`Authorization` header (recommended)**: `Authorization: Bearer <token>` — Most secure method
2. **`Sec-WebSocket-Protocol` header (for browsers)**: `Sec-WebSocket-Protocol: access_token, <token>` — Use when browsers cannot set the `Authorization` header
3. **`token` query parameter (deprecated)**: `?token=<token>` — Remains for backward compatibility. Has security risks as the token is exposed in the URL; will be removed in the future

- Use the `accessToken` obtained from the `/auth/login` endpoint of the REST API as-is
- `super_admin` role can connect to any tenant
- `tenant_admin` / `user` roles can only connect to their own tenant

| Condition | Result |
|-----------|--------|
| `AUTH_ENABLED=false`, no token | ✅ Connection allowed |
| `AUTH_ENABLED=true`, no token | ❌ Connection rejected (1008) |
| `AUTH_ENABLED=true`, invalid token | ❌ Connection rejected (1008) |
| `AUTH_ENABLED=true`, valid token, own tenant | ✅ Connection allowed |
| `AUTH_ENABLED=true`, valid token, other tenant | ❌ Connection rejected (1008) |
| `AUTH_ENABLED=true`, super_admin, any tenant | ✅ Connection allowed |

### Connection Flow

1. Client connects to WebSocket URL (with required `tenant` query parameter, and token if authentication is enabled)
2. Server validates token and verifies tenant access (when authentication is enabled)
3. Server records connection in DynamoDB (TTL: 2 hours)
4. Optional: Set filter conditions with `subscribe` message
5. Server pushes events when entity changes occur

---

## Message Format and Filtering

### Client → Server

#### subscribe (Filter Configuration)

```json
{
  "action": "subscribe",
  "entityTypes": ["Room", "Sensor"],
  "idPattern": "urn:ngsi-ld:Room:.*"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `action` | string | `subscribe` |
| `entityTypes` | string[] | Entity types to filter |
| `idPattern` | string | Regular expression pattern for entity ID |

#### ping (Keep-Alive)

```json
{
  "action": "ping"
}
```

Server returns `{"type": "pong"}`. Send ping every 5 minutes to prevent the 10-minute idle timeout.

### Server → Client

#### Entity Change Event

```json
{
  "type": "entityCreated",
  "tenant": "smartcity",
  "servicePath": "/",
  "entityId": "urn:ngsi-ld:Room:001",
  "entityType": "Room",
  "data": {
    "temperature": { "type": "Number", "value": 23.5 }
  },
  "changedAttributes": ["temperature"],
  "timestamp": "2024-01-01T00:00:00Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | `entityCreated`, `entityUpdated`, `entityDeleted` |
| `tenant` | string | Tenant name |
| `servicePath` | string | Service path |
| `entityId` | string | Entity ID |
| `entityType` | string | Entity type |
| `data` | object | Entity attribute data |
| `changedAttributes` | string[] | Changed attribute names (update only) |
| `timestamp` | string | Event occurrence time (ISO 8601) |

### Filtering

- **Tenant Filter (Required)**: Automatically filtered by the `tenant` query parameter at connection time
- **Entity Type Filter (Optional)**: Receive only types specified in `entityTypes` of the `subscribe` message. If not specified, all types are received
- **Entity ID Pattern Filter (Optional)**: Regular expression pattern filtering in `idPattern` of the `subscribe` message

---

## Client Implementation

### Quick Start (Minimal Configuration)

Example of minimal configuration connection without authentication:

```html
<!DOCTYPE html>
<html>
<head>
  <title>GeonicDB WebSocket Quick Start</title>
</head>
<body>
  <h1>Real-time Event Monitor</h1>
  <div id="events"></div>

  <script>
    const ws = new WebSocket('ws://localhost:3000?tenant=demo');

    ws.onopen = () => {
      console.log('✅ Connection successful');

      // Subscribe to specific entity types
      ws.send(JSON.stringify({
        action: 'subscribe',
        entityTypes: ['Room', 'Sensor']
      }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'pong') return;

      // Display event on screen
      const eventDiv = document.createElement('div');
      eventDiv.textContent = `${data.type}: ${data.entityId} - ${JSON.stringify(data.data)}`;
      document.getElementById('events').appendChild(eventDiv);
    };

    ws.onerror = (error) => console.error('❌ Error:', error);
    ws.onclose = () => console.log('🔌 Disconnected');
  </script>
</body>
</html>
```

### React + TypeScript

```typescript
import { useEffect, useRef, useState } from 'react';

interface EntityEvent {
  type: 'entityCreated' | 'entityUpdated' | 'entityDeleted' | 'pong';
  tenant: string;
  entityId: string;
  entityType: string;
  data: Record<string, any>;
  changedAttributes?: string[];
  timestamp: string;
}

interface UseVelaWebSocketOptions {
  wsUrl: string;
  tenant: string;
  token?: string;
  entityTypes?: string[];
  onEvent?: (event: EntityEvent) => void;
}

export function useVelaWebSocket({
  wsUrl,
  tenant,
  token,
  entityTypes,
  onEvent
}: UseVelaWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const keepAliveIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const url = `${wsUrl}?tenant=${tenant}`;

    // Send authentication token via Sec-WebSocket-Protocol header (browser compatible)
    const protocols = token ? ['access_token', token] : undefined;
    const ws = new WebSocket(url, protocols);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('✅ WebSocket connection successful');
      setIsConnected(true);

      // Filter configuration
      if (entityTypes) {
        ws.send(JSON.stringify({
          action: 'subscribe',
          entityTypes
        }));
      }

      // Keep-alive (every 5 minutes)
      keepAliveIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ action: 'ping' }));
        }
      }, 5 * 60 * 1000);
    };

    ws.onmessage = (event) => {
      const data: EntityEvent = JSON.parse(event.data);
      if (data.type !== 'pong' && onEvent) {
        onEvent(data);
      }
    };

    ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
    };

    ws.onclose = (event) => {
      console.log('🔌 WebSocket disconnected:', event.code, event.reason);
      setIsConnected(false);
      if (keepAliveIntervalRef.current) {
        clearInterval(keepAliveIntervalRef.current);
      }
    };

    // Cleanup
    return () => {
      if (keepAliveIntervalRef.current) {
        clearInterval(keepAliveIntervalRef.current);
      }
      ws.close();
    };
  }, [wsUrl, tenant, token, entityTypes, onEvent]);

  return { isConnected };
}

// Usage example
function RoomMonitor() {
  const [events, setEvents] = useState<EntityEvent[]>([]);

  const { isConnected } = useVelaWebSocket({
    wsUrl: 'ws://localhost:3000',
    tenant: 'demo',
    entityTypes: ['Room'],
    onEvent: (event) => {
      setEvents(prev => [event, ...prev].slice(0, 100)); // Keep only the latest 100
    }
  });

  return (
    <div>
      <h1>Room Monitor {isConnected ? '🟢' : '🔴'}</h1>
      <ul>
        {events.map((event, i) => (
          <li key={i}>
            {event.type}: {event.entityId} - {JSON.stringify(event.data)}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### JavaScript (with Authentication)

```javascript
// Get token
async function login(username, password) {
  const response = await fetch('https://your-api.example.com/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Fiware-Service': 'demo'
    },
    body: JSON.stringify({ username, password })
  });

  const data = await response.json();
  return data.accessToken;
}

// WebSocket connection
async function connectWebSocket(tenant, token) {
  const wsUrl = `wss://your-api.execute-api.ap-northeast-1.amazonaws.com/prod?tenant=${tenant}`;
  // If Authorization header cannot be used, send via Sec-WebSocket-Protocol
  const ws = new WebSocket(wsUrl, ['access_token', token]);

  ws.onopen = () => {
    console.log('✅ Authenticated connection successful');

    // Filter by entity type
    ws.send(JSON.stringify({
      action: 'subscribe',
      entityTypes: ['Vehicle', 'Sensor']
    }));

    // Keep-alive (every 5 minutes)
    setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'ping' }));
      }
    }, 5 * 60 * 1000);
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type !== 'pong') {
      console.log('📩 Event received:', data);
    }
  };

  ws.onclose = (event) => {
    if (event.code === 1008) {
      console.error('❌ Authentication error: Token is invalid or expired');
    } else {
      console.log('🔌 Disconnected:', event.code, event.reason);
    }
  };

  return ws;
}

// Usage example
(async () => {
  const token = await login('user@example.com', 'password123');
  const ws = await connectWebSocket('demo', token);
})();
```

### Python

```python
import asyncio
import json
import websockets

async def stream_events():
    token = "your-access-token"  # Add token when authentication is enabled
    uri = "wss://{api-id}.execute-api.{region}.amazonaws.com/{stage}?tenant=smartcity"
    headers = {"Authorization": f"Bearer {token}"}

    async with websockets.connect(uri, extra_headers=headers) as ws:
        # Subscribe configuration
        await ws.send(json.dumps({
            "action": "subscribe",
            "entityTypes": ["Room"]
        }))

        # Event receiving loop
        async for message in ws:
            event = json.loads(message)
            if event.get('type') != 'pong':
                print(f"{event['type']}: {event['entityId']}", event['data'])

asyncio.run(stream_events())
```

### wscat (For Debugging)

```bash
# Connect (send token via Authorization header when authentication is enabled)
wscat -c "wss://{api-id}.execute-api.{region}.amazonaws.com/{stage}?tenant=smartcity" -H "Authorization: Bearer YOUR_TOKEN"

# Filter configuration
> {"action": "subscribe", "entityTypes": ["Room"]}

# Keep-alive
> {"action": "ping"}
```

---

## Best Practices

### 1. Reconnection Logic

Implement robust reconnection using Exponential Backoff:

```javascript
class VelaWebSocket {
  constructor(config) {
    this.config = config;
    this.reconnectDelay = 1000; // Initial delay: 1 second
    this.maxReconnectDelay = 30000; // Max delay: 30 seconds
    this.shouldReconnect = true;
  }

  connect() {
    const url = `${this.config.wsUrl}?tenant=${this.config.tenant}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('✅ Connection successful');
      this.reconnectDelay = 1000; // Reset delay
    };

    this.ws.onclose = () => {
      if (this.shouldReconnect) {
        console.log(`🔄 Reconn