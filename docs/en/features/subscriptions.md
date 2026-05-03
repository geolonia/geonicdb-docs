---
title: "Event Streaming"
description: "Real-time event streaming"
outline: deep
---
# WebSocket Event Streaming

GeonicDB supports real-time event streaming via WebSocket. You can subscribe to entity changes in real time and have them reflected instantly in web applications or dashboards.

## Table of Contents

- [Overview](#overview)
- [Architecture and Enabling](#architecture-and-enabling)
- [Connecting](#connecting)
- [Message Format and Filtering](#message-format-and-filtering)
- [Client Implementation](#client-implementation)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Constraints](#constraints)

---

## Overview

Event Streaming adds a parallel path to the existing MongoDB Change Streams → EventBridge pipeline, broadcasting entity changes to WebSocket clients.

### Notification Channel Comparison

| Channel | Direction | Filtering | Latency |
|---------|-----------|-----------|---------|
| HTTP Webhook (existing) | Push | Subscription conditions | ~1 min |
| MQTT (existing) | Push | Subscription conditions | ~1 min |
| WebSocket (this feature) | Push | Tenant + entity type/ID pattern | ~1 min |

---

## Architecture and Enabling

### Architecture

```text
EventBridge ─┬─> SubscriptionMatcher -> SQS -> HTTP/MQTT  [existing]
             └─> WsBroadcastFunction -> API GW WebSocket -> client  [new]
```

- **Connection state**: DynamoDB (PAY_PER_REQUEST, automatic TTL cleanup)
- **Connection management**: Three Lambda functions (connect, disconnect, default)
- **Broadcast**: Lambda function triggered directly from EventBridge

### Enabling

Event streaming is enabled by default in GeonicDB SaaS. No additional configuration is required.

### Environment Variables

| Variable | Description |
|----------|-------------|
| `EVENT_STREAMING_ENABLED` | Enable by setting to `true` |
| `WS_CONNECTIONS_TABLE` | DynamoDB connections table name (auto-configured) |
| `WS_API_ENDPOINT` | WebSocket API endpoint (auto-configured) |

---

## Connecting

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
| `tenant` | ✅ | Tenant name (equivalent to the `Fiware-Service` header) |

### Authentication

When `AUTH_ENABLED=true`, an authentication token is required to establish a WebSocket connection. The token is extracted in the following order of priority:

1. **`Authorization` header (recommended)**: `Authorization: Bearer <token>` — the most secure method
2. **`Sec-WebSocket-Protocol` header (for browsers)**: `Sec-WebSocket-Protocol: access_token, <token>` — use this when a browser client cannot set the `Authorization` header

> **Breaking change (#1072)**: The `?token=<token>` query parameter is no longer accepted. URLs leak into reverse-proxy / WAF / load-balancer access logs, browser history, and `Referer` headers. Clients that previously passed the token via the URL must switch to one of the two header methods above.

- Use the `accessToken` obtained from the REST API `/auth/login` endpoint directly as the token.
- The `super_admin` role can connect to any tenant for WebSocket streaming. Note: while `super_admin` cannot access data APIs (`/v2/*`, `/ngsi-ld/*`) via REST, WebSocket event streaming is permitted for operational monitoring purposes.
- The `tenant_admin` / `user` roles can only connect to their own tenant.

| Condition | Result |
|-----------|--------|
| `AUTH_ENABLED=false`, no token | ✅ Connection allowed |
| `AUTH_ENABLED=true`, no token | ❌ Connection rejected (1008) |
| `AUTH_ENABLED=true`, invalid token | ❌ Connection rejected (1008) |
| `AUTH_ENABLED=true`, valid token, own tenant | ✅ Connection allowed |
| `AUTH_ENABLED=true`, valid token, other tenant | ❌ Connection rejected (1008) |
| `AUTH_ENABLED=true`, super_admin, any tenant | ✅ Connection allowed |

### Connection Flow

1. Client connects to the WebSocket URL (the `tenant` query parameter is required; a token is also required when authentication is enabled)
2. Server validates the token and verifies tenant access rights (when authentication is enabled)
3. If the token contains a `cnf.jkt` claim (DPoP-bound token), the connection enters `pending_dpop` state — the client must send a `dpop_bind` message within 5 seconds (see [DPoP Binding](#dpop-binding-for-websocket) below)
4. Server records the connection in DynamoDB (TTL: 2 hours)
5. Optional: set filter conditions via a `subscribe` message
6. Server pushes events to the client when entities change

---

## Message Format and Filtering

### Client → Server

#### subscribe (filter configuration)

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
| `idPattern` | string | Regular expression pattern for entity IDs |

#### dpop_bind (DPoP proof verification)

```json
{
  "action": "dpop_bind",
  "proof": "<DPoP proof JWT>"
}
```

Required when connecting with a DPoP-bound token (JWT containing `cnf.jkt`). Must be sent within 5 seconds of connection. The server verifies the proof's JWK Thumbprint matches the token's `cnf.jkt` claim and responds with `{"type": "dpop_verified"}`. Until verified, all other messages are rejected with `{"type": "error", "message": "DPoP proof required"}`.

See AUTH.md — DPoP Token Binding for details.

#### ping (keep-alive)

```json
{
  "action": "ping"
}
```

The server returns `{"type": "pong"}`. Send a ping every 5 minutes to prevent the 10-minute idle timeout.

### Server → Client

#### Entity change event

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
| `changedAttributes` | string[] | Names of changed attributes (on update only) |
| `timestamp` | string | Event timestamp (ISO 8601) |

### Filtering

Filtering is applied in three layers, in this order:

1. **Tenant filter (required)** — automatically applied via the `tenant` query parameter at connection time.
2. **Connection-side `subscribe` filters (optional)** — the client narrows what it wants:
   - `entityTypes`: array of entity types to receive
   - `idPattern`: regular expression matched against `entityId`
3. **XACML authorization filter** — for each connection that survives the above, the broadcaster runs the active XACML policy. Only connections whose subject is `Permit`-ed for the event are delivered to.

#### Per-event resource attributes available to XACML (#1107)

When the broadcaster authorizes a delivery, it injects these per-entity resource attributes into the AuthzRequest:

| attributeId | Source |
|-------------|--------|
| `entityType` | event's entity type |
| `entityId` | event's entity ID |
| `entityOwner` | event entity's `createdBy` (the user who originally `POST`ed the entity) |

This lets you write **per-user delivery filters** like "each user only receives events for entities they created" using a single XACML policy with `${subject.userId}` template expansion against `entityOwner`. See `docs/AUTH.md` — Per-entity attributes at broadcast time for a complete policy example.

> Entities written without authentication (or via legacy / batch paths that don't set `createdBy`) emit events with no `owner` attribute — owner-based rules will not match those events, so design your policies with that fallback in mind.

---

## Client Implementation

### JavaScript SDK (Recommended)

The GeonicDB JavaScript SDK provides the simplest way to use WebSocket event streaming. It handles authentication, token refresh, DPoP binding, and reconnection automatically.

```bash
npm install @geolonia/geonicdb-sdk
```

```javascript
import GeonicDB from '@geolonia/geonicdb-sdk';

const db = new GeonicDB({
  apiKey: 'your-api-key',
  tenant: 'smartcity',
  baseUrl: 'https://your-geonicdb.example.com'
});

// Subscribe to entity types
db.subscribe({ entityTypes: ['Room', 'Sensor'] });

// Listen for events
db.on('entityCreated', function(event) { console.log('Created:', event.entityId); });
db.on('entityUpdated', function(event) { console.log('Updated:', event.entityId); });

// Connection lifecycle events
db.on('connected', function() { console.log('Connected'); });
db.on('disconnected', function() { console.log('Disconnected — reconnecting...'); });
db.on('reconnecting', function(info) { console.log('Attempt', info.attempt, 'in', info.delay, 'ms'); });
db.on('error', function(err) { console.error(err.message); });

// Connect (authentication and DPoP binding are automatic)
db.connect();

// Check connection state after the connected event
db.on('connected', function() {
  if (db.isConnected()) { console.log('WebSocket is open'); }
});

// Force reconnect only when needed (e.g., after resuming from background)
// db.reconnect();
```

For Bearer JWT authentication (e.g., after a login flow), inject credentials with `setCredentials()`:

```javascript
import GeonicDB from '@geolonia/geonicdb-sdk';

const db = new GeonicDB({ tenant: 'my-tenant', baseUrl: 'https://...' });

db.setCredentials({
  token: auth.accessToken,
  tokenType: 'Bearer',
  expiresIn: auth.expiresIn,
  refreshToken: auth.refreshToken
});

db.on('tokenRefresh', function(creds) {
  // Sync new tokens to your storage
  saveAuth(creds.token, creds.refreshToken);
});

db.subscribe({ entityTypes: ['Room'] });
db.connect();
```

See the SDK documentation for the full API reference.

### Quick Start (raw WebSocket, minimal setup)

Minimal connection example without authentication:

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
      console.log('✅ Connected');

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
  entity?: Record<string, any>;  // Complete NGSI-LD entity ({ id, type, ...data }). Undefined for some delete events.
  changedAttributes?: string[];
  timestamp: string;
}

interface UseGeonicDBWebSocketOptions {
  wsUrl: string;
  tenant: string;
  token?: string;
  entityTypes?: string[];
  onEvent?: (event: EntityEvent) => void;
}

export function useGeonicDBWebSocket({
  wsUrl,
  tenant,
  token,
  entityTypes,
  onEvent
}: UseGeonicDBWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const keepAliveIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const url = `${wsUrl}?tenant=${tenant}`;

    // Send the authentication token via the Sec-WebSocket-Protocol header (browser-compatible)
    const protocols = token ? ['access_token', token] : undefined;
    const ws = new WebSocket(url, protocols);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('✅ WebSocket connected');
      setIsConnected(true);

      // Configure filters
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

  const { isConnected } = useGeonicDBWebSocket({
    wsUrl: 'ws://localhost:3000',
    tenant: 'demo',
    entityTypes: ['Room'],
    onEvent: (event) => {
      setEvents(prev => [event, ...prev].slice(0, 100)); // Keep only the latest 100 events
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

### JavaScript (with authentication)

```javascript
// Obtain a token
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
  // If the Authorization header cannot be used, send the token via Sec-WebSocket-Protocol
  const ws = new WebSocket(wsUrl, ['access_token', token]);

  ws.onopen = () => {
    console.log('✅ Authenticated connection established');

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
      console.error('❌ Authentication error: token is invalid or expired');
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
    token = "your-access-token"  # Add the token when authentication is enabled
    uri = "wss://{api-id}.execute-api.{region}.amazonaws.com/{stage}?tenant=smartcity"
    headers = {"Authorization": f"Bearer {token}"}

    async with websockets.connect(uri, extra_headers=headers) as ws:
        # Configure subscription
        await ws.send(json.dumps({
            "action": "subscribe",
            "entityTypes": ["Room"]
        }))

        # Event receive loop
        async for message in ws:
            event = json.loads(message)
            if event.get('type') != 'pong':
                print(f"{event['type']}: {event['entityId']}", event['data'])

asyncio.run(stream_events())
```

### wscat (for debugging)

```bash
# Connect (when authentication is enabled, send the token via the Authorization header)
wscat -c "wss://{api-id}.execute-api.{region}.amazonaws.com/{stage}?tenant=smartcity" -H "Authorization: Bearer YOUR_TOKEN"

# Configure filters
> {"action": "subscribe", "entityTypes": ["Room"]}

# Keep-alive
> {"action": "ping"}
```

---

## DPoP Binding for WebSocket

WebSocket connections using DPoP-bound tokens require a post-connect proof verification step. Since the WebSocket protocol does not support custom headers after the initial handshake, DPoP proof is sent as a message after connection establishment.

### Flow

```text
Client                               Server
  │  WS Connect (token with cnf.jkt)    │
  │ ──────────────────────────────────►  │
  │  Connection accepted (pending_dpop)  │
  │ ◄──────────────────────────────────  │
  │                                      │
  │  { action: "dpop_bind",             │
  │    proof: "<DPoP proof JWT>" }      │
  │ ──────────────────────────────────►  │  ← Must be sent within 5 seconds
  │  { type: "dpop_verified" }          │
  │ ◄──────────────────────────────────  │
  │                                      │
  │  { action: "subscribe", ... }       │  ← Now allowed
  │ ──────────────────────────────────►  │
```

### States

| State | Description | Allowed Messages |
|-------|-------------|------------------|
| `pending_dpop` | Awaiting DPoP proof after connection | `dpop_bind` only |
| `verified` | DPoP proof verified successfully | `subscribe`, `ping`, etc. |

If the `dpop_bind` message is not received within 5 seconds, the connection is terminated.

---

## Best Practices

### 1. Reconnection Logic

> **Note**: If you are using the JavaScript SDK, reconnection with exponential backoff is built in. Use `db.reconnect()` to force a reconnection, or listen for the `reconnecting` event to track reconnect attempts. The examples below are for raw WebSocket implementations.

Implement robust reconnection with Exponential Backoff:

```javascript
class GeonicDBWebSocket {
  constructor(config) {
    this.config = config;
    this.reconnectDelay = 1000; // Initial delay: 1 second
    this.maxReconnectDelay = 30000; // Maximum delay: 30 seconds
    this.shouldReconnect = true;
  }

  connect() {
    const url = `${this.config.wsUrl}?tenant=${this.config.tenant}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('✅ Connected');
      this.reconnectDelay = 1000; // Reset delay
    };

    this.ws.onclose = () => {
      if (this.shouldReconnect) {
        console.log(`🔄 Reconnecting in ${this.reconnectDelay}ms...`);
        setTimeout(() => this.connect(), this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      }
    };
  }

  disconnect() {
    this.shouldReconnect = false;
    this.ws.close();
  }
}
```

### 2. Keep-Alive

Send a ping every 5 minutes to prevent the 10-minute idle timeout:

```javascript
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action: 'ping' }));
  }
}, 5 * 60 * 1000);
```

### 3. Optimizing Event Processing

When receiving large volumes of events, optimize UI updates with debouncing:

```javascript
import { debounce } from 'lodash';

const debouncedUpdate = debounce((event) => {
  updateUI(event);
}, 100);

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  debouncedUpdate(data);
};
```

### 4. Security

**Secure token management:**

```javascript
// ❌ Bad example: storing in local storage
localStorage.setItem('token', token);

// ✅ Good example: keeping in memory
let tokenCache = null;

async function getToken() {
  if (!tokenCache || isTokenExpired(tokenCache)) {
    tokenCache = await fetchNewToken();
  }
  return tokenCache;
}
```

**Token expiry management:**

```javascript
function isTokenExpired(token, bufferSeconds = 60) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const expiresAt = payload.exp * 1000;
    return expiresAt < Date.now() + (bufferSeconds * 1000);
  } catch {
    return true;
  }
}
```

### 5. Memory Management

Set a limit on event history to prevent memory leaks:

```javascript
const MAX_EVENTS = 1000;
if (events.length > MAX_EVENTS) {
  events = events.slice(0, MAX_EVENTS);
}

// Cleanup
onUnmounted(() => {
  clearInterval(keepAliveInterval);
  ws.close();
});
```

---

## Troubleshooting

### 1. Connection Rejected (1008 Error)

**Causes:**
- Token is invalid or expired
- No access permission for the tenant
- Token not provided despite `AUTH_ENABLED=true`

**Resolution:**

```javascript
ws.onclose = (event) => {
  if (event.code === 1008) {
    console.error('Authentication error: please check your token');
    // Re-obtain the token and reconnect
    getNewToken().then(token => reconnect(token));
  }
};
```

### 2. Connection Drops After 10 Minutes

**Cause:** Keep-alive (ping) messages are not being sent.

**Resolution:**

```javascript
// Send a ping every 5 minutes
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action: 'ping' }));
  }
}, 5 * 60 * 1000);
```

### 3. Not Receiving Events

**Causes:**
- Filters are too restrictive
- Wrong tenant
- Entity creation/update has not actually occurred

**Resolution:**

```javascript
// Debug: log all messages
ws.onmessage = (event) => {
  console.log('Received:', event.data);
  const data = JSON.parse(event.data);
  // ...
};

// Relax filters
ws.send(JSON.stringify({
  action: 'subscribe',
  // Do not specify entityTypes or idPattern
}));
```

### 4. Cannot Connect in Local Development

**Causes:**
- Local server is not running
- WebSocket URL is incorrect

**Resolution:**

```bash
# Start the local server
npm start

# Use ws:// locally (not wss://)
const wsUrl = 'ws://localhost:3000?tenant=demo';
```

### 5. Debugging

You can inspect WebSocket connections and sent/received messages in the Network tab of your browser's developer tools.

```javascript
class DebugWebSocket {
  constructor(url) {
    this.ws = new WebSocket(url);

    this.ws.onopen = () => console.log('🟢 [WebSocket] OPEN');
    this.ws.onmessage = (e) => console.log('📥 [WebSocket] MESSAGE:', e.data);
    this.ws.onerror = (e) => console.error('🔴 [WebSocket] ERROR:', e);
    this.ws.onclose = (e) => console.log('🔌 [WebSocket] CLOSE:', e.code, e.reason);
  }

  send(data) {
    console.log('📤 [WebSocket] SEND:', data);
    this.ws.send(data);
  }
}
```

---

## Constraints

| Item | Value | Description |
|------|-------|-------------|
| Idle timeout | 10 minutes | Clients must send a ping every 5 minutes |
| Concurrent connections | 500 (default) | Can be increased via AWS Support |
| Frame size | 128KB | Large entities require truncation |
| Latency | ~1 minute | Depends on the MongoDB Change Stream polling interval |
| Connection TTL | 2 hours | Automatically cleaned up by DynamoDB TTL |
| Local development | Supported | Available via local WebSocket server |

---

## Related Documentation

- JavaScript SDK - SDK API reference (recommended for browser applications)
- [API Common Specification](../api-reference/endpoints.md) - REST API documentation
- Authentication and Authorization - Authentication configuration
- Development Guide - Local development and deployment
