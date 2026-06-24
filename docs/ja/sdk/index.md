---
title: "JavaScript SDK"
description: "@geolonia/geonicdb-sdk — NGSI-LD クライアント、React hooks、NGSIv2 クライアント"
outline: deep
---

# JavaScript SDK

`@geolonia/geonicdb-sdk` は GeonicDB NGSI-LD コンテキストブローカー向けの TypeScript/JavaScript クライアントです。React hooks および NGSIv2 クライアントもオプションで提供します。

## インストール

```bash
npm install @geolonia/geonicdb-sdk
```

React hooks とマップコンポーネントを使用する場合は、React 18 または 19 が必要です。

```bash
npm install @geolonia/geonicdb-sdk react react-dom
```

## サブパス

SDK はバンドルサイズを最適化するため 3 つのサブパスに分割されています。

| サブパス | 内容 | React 必須 |
|---------|------|------------|
| `@geolonia/geonicdb-sdk` | NGSI-LD クライアント（コア）、DPoP、WebSocket | 不要 |
| `@geolonia/geonicdb-sdk/react` | React hooks + GeonicDbMap コンポーネント | 必要（optional peerDep） |
| `@geolonia/geonicdb-sdk/ngsi-v2` | NGSIv2 基本クライアント | 不要 |

## コア (`@geolonia/geonicdb-sdk`)

```typescript
import GeonicDB from '@geolonia/geonicdb-sdk';

const db = new GeonicDB({
  apiKey: 'your-api-key',
  tenant: 'your-tenant',
  baseUrl: 'https://your-geonicdb.example.com',
});

// ログイン（DPoP は対応環境で自動適用）
await db.login('user@example.com', 'password');

// エンティティ取得
const rooms = await db.getEntities({ type: 'Room' });

// エンティティ作成
await db.createEntity({
  id: 'urn:ngsi-ld:Room:001',
  type: 'Room',
  temperature: { type: 'Property', value: 22.5 },
});
```

## React Hooks (`@geolonia/geonicdb-sdk/react`)

### `useLdEntities`

NGSI-LD エンティティをリアクティブに取得します。

```tsx
import GeonicDB from '@geolonia/geonicdb-sdk';
import { useLdEntities } from '@geolonia/geonicdb-sdk/react';

const db = new GeonicDB({ apiKey: '...', tenant: '...', baseUrl: '...' });

function RoomList() {
  const { entities, loading, error, refetch } = useLdEntities(db, {
    type: 'Room',
    limit: 50,
  });

  if (loading) return <p>読み込み中...</p>;
  if (error) return <p>エラー: {error.message}</p>;

  return (
    <ul>
      {entities.map(e => <li key={e.id}>{e.id}</li>)}
    </ul>
  );
}
```

**オプション:**

| オプション | 型 | 説明 |
|-----------|-----|------|
| `type` | `string` | エンティティ型でフィルタ |
| `limit` | `number` | 最大取得件数 |
| `attrs` | `string[]` | 取得する属性のリスト |
| `q` | `string` | NGSI-LD クエリフィルタ |
| `scopeQ` | `string` | スコープフィルタ |

**戻り値:** `{ entities, loading, error, refetch }`

### `useTemporalData`

NGSI-LD 時系列データを取得します。

```tsx
import { useTemporalData } from '@geolonia/geonicdb-sdk/react';

function TemporalChart({ client }) {
  const { data, loading, error } = useTemporalData(client, {
    type: 'TemperatureSensor',
    timerel: 'between',
    timeAt: '2026-01-01T00:00:00Z',
    endTimeAt: '2026-01-02T00:00:00Z',
  });

  if (loading) return <p>読み込み中...</p>;
  return <pre>{JSON.stringify(data, null, 2)}</pre>;
}
```

### `GeonicDbMap`

[@geolonia/embed](https://geolonia.com/maplibre-gl-js/) を使ってエンティティをマップ上に表示します。

```tsx
import { GeonicDbMap, useLdEntities } from '@geolonia/geonicdb-sdk/react';

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

> **注意:** `GeonicDbMap` は `@geolonia/embed` を動的 import で読み込みます。使用する場合は `npm install @geolonia/embed` が必要です。

## NGSIv2 クライアント (`@geolonia/geonicdb-sdk/ngsi-v2`)

NGSIv2 互換ブローカー向けのクライアントです。

```typescript
import { createNgsiV2Client } from '@geolonia/geonicdb-sdk/ngsi-v2';

const client = createNgsiV2Client({
  baseUrl: 'https://orion.example.com',
  service: 'mytenant',
  servicePath: '/mypath',
});

const rooms = await client.getEntities({ type: 'Room', limit: 20 });
const room = await client.getEntity('Room1');
await client.createEntity({ id: 'Room2', type: 'Room', temperature: { type: 'Number', value: 23 } });
await client.updateEntityAttributes('Room2', { temperature: { type: 'Number', value: 24 } });
await client.deleteEntity('Room2');
```
