---
title: "JavaScript SDK"
description: "@geolonia/geonicdb-sdk — NGSI-LD client, React hooks, and NGSIv2 client"
outline: deep
---

# JavaScript SDK

`@geolonia/geonicdb-sdk` provides a TypeScript/JavaScript client for the GeonicDB NGSI-LD Context Broker, along with optional React hooks and an NGSIv2 client.

## Installation

```bash
npm install @geolonia/geonicdb-sdk
```

For React hooks and the map component, React 18 or 19 is required as a peer dependency:

```bash
npm install @geolonia/geonicdb-sdk react react-dom
```

## Import Subpaths

The SDK is split into three subpaths to keep bundles lean:

| Subpath | Contents | React required |
|---------|----------|---------------|
| `@geolonia/geonicdb-sdk` | NGSI-LD client (core), DPoP, WebSocket | No |
| `@geolonia/geonicdb-sdk/react` | React hooks + GeonicDbMap component | Yes (optional peerDep) |
| `@geolonia/geonicdb-sdk/ngsi-v2` | NGSIv2 basic client | No |

## Core (`@geolonia/geonicdb-sdk`)

```typescript
import GeonicDB from '@geolonia/geonicdb-sdk';

const db = new GeonicDB({
  apiKey: 'your-api-key',
  tenant: 'your-tenant',
  baseUrl: 'https://your-geonicdb.example.com',
});

// Login (DPoP applied automatically when supported)
await db.login('user@example.com', 'password');

// Query entities
const rooms = await db.getEntities({ type: 'Room' });

// Create entity
await db.createEntity({
  id: 'urn:ngsi-ld:Room:001',
  type: 'Room',
  temperature: { type: 'Property', value: 22.5 },
});
```

See [Authentication Reference](/en/reference/auth) for the full API.

## React Hooks (`@geolonia/geonicdb-sdk/react`)

Import from the `./react` subpath to use hooks without pulling React into non-React consumers.

### `useLdEntities`

Fetch NGSI-LD entities reactively:

```tsx
import GeonicDB from '@geolonia/geonicdb-sdk';
import { useLdEntities } from '@geolonia/geonicdb-sdk/react';

const db = new GeonicDB({ apiKey: '...', tenant: '...', baseUrl: '...' });

function RoomList() {
  const { entities, loading, error, refetch } = useLdEntities(db, {
    type: 'Room',
    limit: 50,
  });

  if (loading) return <p>Loading…</p>;
  if (error) return <p>Error: {error.message}</p>;

  return (
    <ul>
      {entities.map(e => <li key={e.id}>{e.id}</li>)}
    </ul>
  );
}
```

**Options:**

| Option | Type | Description |
|--------|------|-------------|
| `type` | `string` | Filter by entity type |
| `limit` | `number` | Maximum number of results |
| `attrs` | `string[]` | Attributes to return |
| `q` | `string` | NGSI-LD query filter |
| `scopeQ` | `string` | Scope filter |

**Returns:** `{ entities, loading, error, refetch }`

### `useTemporalData`

Fetch NGSI-LD temporal (time-series) data:

```tsx
import { useTemporalData } from '@geolonia/geonicdb-sdk/react';

function TemporalChart({ client }) {
  const { data, loading, error } = useTemporalData(client, {
    type: 'TemperatureSensor',
    timerel: 'between',
    timeAt: '2026-01-01T00:00:00Z',
    endTimeAt: '2026-01-02T00:00:00Z',
  });

  if (loading) return <p>Loading…</p>;
  return <pre>{JSON.stringify(data, null, 2)}</pre>;
}
```

### `GeonicDbMap`

Display entities on a map using [@geolonia/embed](https://github.com/geolonia/embed):

```tsx
import { GeonicDbMap } from '@geolonia/geonicdb-sdk/react';
import { useLdEntities } from '@geolonia/geonicdb-sdk/react';

function EntityMap({ client }) {
  const { entities } = useLdEntities(client, { type: 'GeoFeature' });

  return (
    <GeonicDbMap
      entities={entities}
      center={[139.7671, 35.6812]}
      zoom={12}
      onEntityClick={(e) => console.log(e.id)}
      fitToMarkers
    />
  );
}
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `entities` | `(LdEntity \| NgsiEntity)[]` | `[]` | Entities to display |
| `center` | `[number, number]` | Tokyo | Initial center `[lng, lat]` |
| `zoom` | `number` | `13` | Initial zoom level |
| `styleUrl` | `string` | `'geolonia/basic'` | Map style URL |
| `onEntityClick` | `(entity) => void` | — | Click handler |
| `onMapClick` | `([lng, lat]) => void` | — | Map click handler |
| `showPopups` | `boolean` | `true` | Show hover popups |
| `fitToMarkers` | `boolean` | `false` | Auto-fit bounds to markers |

> **Note:** `GeonicDbMap` uses `@geolonia/embed` via dynamic import. Add it to your project separately if needed: `npm install @geolonia/embed`.

## NGSIv2 Client (`@geolonia/geonicdb-sdk/ngsi-v2`)

For NGSIv2-compatible brokers, use the dedicated client:

```typescript
import { createNgsiV2Client } from '@geolonia/geonicdb-sdk/ngsi-v2';

const client = createNgsiV2Client({
  baseUrl: 'https://orion.example.com',
  service: 'mytenant',    // Fiware-Service header
  servicePath: '/mypath', // Fiware-ServicePath header
});

// List entities
const rooms = await client.getEntities({ type: 'Room', limit: 20 });

// Get single entity
const room = await client.getEntity('Room1');

// Create entity
await client.createEntity({
  id: 'Room2',
  type: 'Room',
  temperature: { type: 'Number', value: 23 },
});

// Update attributes
await client.updateEntityAttributes('Room2', {
  temperature: { type: 'Number', value: 24 },
});

// Delete entity
await client.deleteEntity('Room2');
```

**`NgsiV2ClientConfig`:**

| Field | Type | Description |
|-------|------|-------------|
| `baseUrl` | `string` | Base URL of the NGSIv2 broker |
| `service` | `string?` | FIWARE service (tenant) |
| `servicePath` | `string?` | FIWARE service path |
