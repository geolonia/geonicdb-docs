---
title: "Event Streaming"
description: "Real-time event streaming"
outline: deep
---
# WebSocket イベントストリーミング

GeonicDB は WebSocket を介したリアルタイムイベントストリーミングをサポートしています。エンティティの変更をリアルタイムでサブスクリプションライブし、Web アプリケーションやダッシュボードに即座に反映できます。

## 目次

- [概要](#概要)
- [アーキテクチャと有効化](#アーキテクチャと有効化)
- [接続](#接続)
- [メッセージフォーマットとフィルタリング](#メッセージフォーマットとフィルタリング)
- [クライアント実装](#クライアント実装)
- [ベストプラクティス](#ベストプラクティス)
- [トラブルシューティング](#トラブルシューティング)
- [制約](#制約)

---

## 概要

イベントストリーミングは、既存の MongoDB Change Streams → EventBridge パイプラインに並行するパスを追加し、エンティティの変更を WebSocket クライアントにブロードキャストします。

### 通知チャネルの比較

| チャネル | 方向 | フィルタリング | レイテンシ |
|---------|-----------|-----------|---------|
| HTTP Webhook (既存) | プッシュ | サブスクリプション条件 | 約 1 分 |
| MQTT (既存) | プッシュ | サブスクリプション条件 | 約 1 分 |
| WebSocket (この機能) | プッシュ | テナント + エンティティタイプ/ID パターン | 約 1 分 |

---

## アーキテクチャと有効化

### アーキテクチャ

```text
EventBridge ─┬─> SubscriptionMatcher -> SQS -> HTTP/MQTT  [existing]
             └─> WsBroadcastFunction -> API GW WebSocket -> client  [new]
```




- **接続状態**: DynamoDB (PAY_PER_REQUEST、自動 TTL クリーンアップ)
- **接続管理**: 3 つの Lambda 関数 (connect、disconnect、default)
- **ブロードキャスト**: EventBridge から直接トリガーされる Lambda 関数

### 有効化

SAM テンプレートで `EventStreamingEnabled` パラメータを `true` に設定してデプロイします。

```bash
sam deploy -t infrastructure/template.yaml \
  --parameter-overrides EventStreamingEnabled=true
```




### 環境変数

| 変数 | 説明 |
|----------|-------------|
| `EVENT_STREAMING_ENABLED` | `true` に設定して有効化 |
| `WS_CONNECTIONS_TABLE` | DynamoDB 接続テーブル名 (自動設定) |
| `WS_API_ENDPOINT` | WebSocket API エンドポイント (自動設定) |

---

## 接続

### WebSocket URL

```text
wss://{api-id}.execute-api.{region}.amazonaws.com/{stage}?tenant={tenantName}
```



ローカル開発環境の場合:

```text
ws://localhost:3000?tenant={tenantName}
```



### クエリパラメータ

| パラメータ | 必須 | 説明 |
|-----------|----------|-------------|
| `tenant` | ✅ | テナント名 (`Fiware-Service` ヘッダーに相当) |

### 認証

`AUTH_ENABLED=true` の場合、WebSocket 接続の確立には認証トークンが必要です。トークンは以下の優先順位で抽出されます:

1. **`Authorization` ヘッダー (推奨)**: `Authorization: Bearer <token>` — 最も安全な方法
2. **`Sec-WebSocket-Protocol` ヘッダー (ブラウザ向け)**: `Sec-WebSocket-Protocol: access_token, <token>` — ブラウザクライアントが `Authorization` ヘッダーを設定できない場合に使用
3. **`token` クエリパラメータ (非推奨)**: `?token=<token>` — 後方互換性のために保持。URL にトークンが露出しセキュリティリスクがあるため、将来のリリースで削除予定

- REST API の `/auth/login` エンドポイントから取得した `accessToken` をトークンとして直接使用します。
- `super_admin` ロールは、任意のテナントに WebSocket ストリーミング接続できます。注意: `super_admin` は REST 経由のデータ API (`/v2/*`、`/ngsi-ld/*`) にはアクセスできませんが、運用監視目的での WebSocket イベントストリーミングは許可されています。
- `tenant_admin` / `user` ロールは、自分のテナントにのみ接続できます。

| 条件 | 結果 |
|-----------|--------|
| `AUTH_ENABLED=false`、トークンなし | ✅ 接続許可 |
| `AUTH_ENABLED=true`、トークンなし | ❌ 接続拒否 (1008) |
| `AUTH_ENABLED=true`、無効なトークン | ❌ 接続拒否 (1008) |
| `AUTH_ENABLED=true`、有効なトークン、自分のテナント | ✅ 接続許可 |
| `AUTH_ENABLED=true`、有効なトークン、他のテナント | ❌ 接続拒否 (1008) |
| `AUTH_ENABLED=true`、super_admin、任意のテナント | ✅ 接続許可 |

### 接続フロー

1. クライアントが WebSocket URL に接続 (`tenant` クエリパラメータは必須。認証が有効な場合はトークンも必須)
2. サーバーがトークンを検証し、テナントアクセス権を確認 (認証が有効な場合)
3. サーバーが DynamoDB に接続を記録 (TTL: 2 時間)
4. オプション: `subscribe` メッセージでフィルタ条件を設定
5. エンティティが変更されると、サーバーがクライアントにイベントをプッシュ

---

## メッセージフォーマットとフィルタリング

### クライアント → サーバー

#### subscribe (フィルタ設定)

```json
{
  "action": "subscribe",
  "entityTypes": ["Room", "Sensor"],
  "idPattern": "urn:ngsi-ld:Room:.*"
}
```







| フィールド | 型 | 説明 |
|-------|------|-------------|
| `action` | string | `subscribe` |
| `entityTypes` | string[] | フィルタリングするエンティティタイプ |
| `idPattern` | string | エンティティ ID の正規表現パターン |

#### ping (キープアライブ)

```json
{
  "action": "ping"
}
```





サーバーは `{"type": "pong"}` を返します。10 分のアイドルタイムアウトを防ぐため、5 分ごとに ping を送信してください。

### サーバー → クライアント

#### エンティティ変更イベント

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














| フィールド | 型 | 説明 |
|-------|------|-------------|
| `type` | string | `entityCreated`、`entityUpdated`、`entityDeleted` |
| `tenant` | string | テナント名 |
| `servicePath` | string | ServicePath |
| `entityId` | string | エンティティ ID |
| `entityType` | string | エンティティタイプ |
| `data` | object | エンティティ属性データ |
| `changedAttributes` | string[] | 変更された属性の名前 (更新時のみ) |
| `timestamp` | string | イベントタイムスタンプ (ISO 8601) |

### フィルタリング

- **テナントフィルタ (必須)**: 接続時に提供された `tenant` クエリパラメータで自動的にフィルタリング
- **エンティティタイプフィルタ (オプション)**: `subscribe` メッセージの `entityTypes` で指定されたタイプのみを受信。指定しない場合はすべてのタイプを受信
- **エンティティ ID パターンフィルタ (オプション)**: `subscribe` メッセージの `idPattern` で指定された正規表現パターンでフィルタ

---

## クライアント実装

### クイックスタート (最小構成)

認証なしの最小接続例:

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






















































































































### JavaScript (認証あり)

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

























### wscat (デバッグ用)

```bash
# Connect (when authentication is enabled, send the token via the Authorization header)
wscat -c "wss://{api-id}.execute-api.{region}.amazonaws.com/{stage}?tenant=smartcity" -H "Authorization: Bearer YOUR_TOKEN"

# Configure filters
> {"action": "subscribe", "entityTypes": ["Room"]}

# Keep-alive
> {"action": "ping"}
```










---

## ベストプラクティス

### 1. 再接続ロジック

Exponential Backoff による堅牢な再接続を実装:

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

































### 2. キープアライブ

10 分のアイドルタイムアウトを防ぐため、5 分ごとに ping を送信:

```javascript
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action: 'ping' }));
  }
}, 5 * 60 * 1000);
```







### 3. イベント処理の最適化

大量のイベントを受信する場合、デバウンスで UI 更新を最適化:

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












### 4. セキュリティ

**安全なトークン管理:**

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














**トークン有効期限管理:**

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











### 5. メモリ管理

メモリリークを防ぐためイベント履歴に上限を設定:

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

## トラブルシューティング

### 1. 接続拒否 (1008 エラー)

**原因:**
- トークンが無効または期限切れ
- テナントへのアクセス権限がない
- `AUTH_ENABLED=true` にもかかわらずトークンが提供されていない

**解決方法:**

```javascript
ws.onclose = (event) => {
  if (event.code === 1008) {
    console.error('Authentication error: please check your token');
    // Re-obtain the token and reconnect
    getNewToken().then(token => reconnect(token));
  }
};
```









### 2. 10 分後に接続が切れる

**原因:** キープアライブ (ping) メッセージが送信されていない。

**解決方法:**

```javascript
// Send a ping every 5 minutes
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action: 'ping' }));
  }
}, 5 * 60 * 1000);
```








### 3. イベントを受信できない

**原因:**
- フィルタが厳格すぎる
- 間違ったテナント
- エンティティの作成/更新が実際に発生していない

**解決方法:**

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














### 4. ローカル開発で接続できない

**原因:**
- ローカルサーバーが起動していない
- WebSocket URL が間違っている

**解決方法:**

```bash
# Start the local server
npm start

# Use ws:// locally (not wss://)
const wsUrl = 'ws://localhost:3000?tenant=demo';
```







### 5. デバッグ

ブラウザの開発者ツールの Network タブで WebSocket 接続と送受信メッセージを確認できます。

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

## 制約

| 項目 | 値 | 説明 |
|------|-------|-------------|
| アイドルタイムアウト | 10 分 | クライアントは 5 分ごとに ping を送信する必要がある |
| 同時接続数 | 500 (デフォルト) | AWS サポート経由で増加可能 |
| フレームサイズ | 128KB | 大きなエンティティは切り捨てが必要 |
| レイテンシ | 約 1 分 | MongoDB Change Stream のポーリング間隔に依存 |
| 接続 TTL | 2 時間 | DynamoDB TTL により自動クリーンアップ |
| ローカル開発 | サポート | ローカル WebSocket サーバー経由で利用可能 |

---

## 関連ドキュメント

- [API 共通仕様](../api-reference/endpoints.md) - REST API ドキュメント
- 認証と認可 - 認証設定
- [開発ガイド](../getting-started/installation.md) - ローカル開発とデプロイ