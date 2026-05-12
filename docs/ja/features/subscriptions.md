---
title: "Event Streaming"
description: "Real-time event streaming"
outline: deep
---
# WebSocket イベントストリーミング

GeonicDB は WebSocket によるリアルタイムイベントストリーミングをサポートしています。エンティティの変更をリアルタイムでサブスクリプションライブし、Web アプリケーションやダッシュボードに即座に反映できます。

## 目次


* [概要](#概要)
  
* [アーキテクチャと有効化](#アーキテクチャと有効化)
  
* [接続](#接続)
  
* [メッセージフォーマットとフィルタリング](#メッセージフォーマットとフィルタリング)
  
* [クライアント実装](#クライアント実装)
  
* [ベストプラクティス](#ベストプラクティス)
  
* [トラブルシューティング](#トラブルシューティング)
  
* [制約](#constraints)

***

## 概要

イベントストリーミングは、既存の MongoDB Change Streams → EventBridge パイプラインに並行パスを追加し、エンティティの変更を WebSocket クライアントにブロードキャストします。

### 通知チャネルの比較

| Channel                  | Direction | Filtering                       | Latency |
| ------------------------ | --------- | ------------------------------- | ------- |
| HTTP Webhook (existing)  | Push      | Subscription conditions         | \~1 min |
| MQTT (existing)          | Push      | Subscription conditions         | \~1 min |
| WebSocket (this feature) | Push      | Tenant + entity type/ID pattern | \~1 min |

***

## アーキテクチャと有効化

### アーキテクチャ

```text
EventBridge ─┬─> SubscriptionMatcher -> SQS -> HTTP/MQTT  [existing]
             └─> WsBroadcastFunction -> API GW WebSocket -> client  [new]
```


* **接続状態**: DynamoDB (PAY\_PER\_REQUEST、自動 TTL クリーンアップ)
  
* **接続管理**: 3 つの Lambda 関数 (connect、disconnect、default)
  
* **ブロードキャスト**: EventBridge から直接トリガーされる Lambda 関数

### 有効化

GeonicDB SaaS ではイベントストリーミングは既定で有効です。追加の設定は不要です。

### 環境変数

| Variable                  | Description                                       |
| ------------------------- | ------------------------------------------------- |
| `EVENT_STREAMING_ENABLED` | Enable by setting to `true`                       |
| `WS_CONNECTIONS_TABLE`    | DynamoDB connections table name (auto-configured) |
| `WS_API_ENDPOINT`         | WebSocket API endpoint (auto-configured)          |

***

## 接続

### WebSocket URL

```text
wss://{api-id}.execute-api.{region}.amazonaws.com/{stage}?tenant={tenantName}
```

ローカル開発の場合:

```text
ws://localhost:3000?tenant={tenantName}
```

### クエリパラメータ

| Parameter | Required | Description                                             |
| --------- | -------- | ------------------------------------------------------- |
| `tenant`  | ✅        | Tenant name (equivalent to the `Fiware-Service` header) |

### 認証

`AUTH_ENABLED=true` の場合、WebSocket 接続を確立するには認証トークンが必要です。トークンは以下の優先順位で抽出されます:


1. **`Authorization` ヘッダー (推奨)**: `Authorization: Bearer <token>` — 最も安全な方法
   
2. **`Sec-WebSocket-Protocol` ヘッダー (ブラウザ用)**: `Sec-WebSocket-Protocol: access_token, <token>` — ブラウザクライアントが `Authorization` ヘッダーを設定できない場合に使用します

> **破壊的変更 (#1072)**: `?token=<token>` クエリパラメータは受け付けられなくなりました。URL はリバースプロキシ / WAF / ロードバランサーのアクセスログ、ブラウザ履歴、`Referer` ヘッダーに漏洩します。以前 URL 経由でトークンを渡していたクライアントは、上記の 2 つのヘッダー方式のいずれかに切り替える必要があります。


* REST API の `/auth/login` エンドポイントから取得した `accessToken` をトークンとして直接使用します。
  
* `super_admin` ロールは WebSocket ストリーミングのために任意のテナントに接続できます。注意: `super_admin` は REST 経由でデータ API (`/v2/*`、`/ngsi-ld/*`) にアクセスできませんが、運用監視目的で WebSocket イベントストリーミングは許可されています。
  
* `tenant_admin` / `user` ロールは自分自身のテナントにのみ接続できます。

| Condition                                      | Result                       |
| ---------------------------------------------- | ---------------------------- |
| `AUTH_ENABLED=false`, no token                 | ✅ Connection allowed         |
| `AUTH_ENABLED=true`, no token                  | ❌ Connection rejected (1008) |
| `AUTH_ENABLED=true`, invalid token             | ❌ Connection rejected (1008) |
| `AUTH_ENABLED=true`, valid token, own tenant   | ✅ Connection allowed         |
| `AUTH_ENABLED=true`, valid token, other tenant | ❌ Connection rejected (1008) |
| `AUTH_ENABLED=true`, super\_admin, any tenant  | ✅ Connection allowed         |

### 接続フロー


1. クライアントは WebSocket URL に接続します (`tenant` クエリパラメータは必須です。認証が有効な場合はトークンも必須です)
   
2. サーバーはトークンを検証し、テナントアクセス権限を確認します (認証が有効な場合)
   
3. トークンに `cnf.jkt` クレーム (DPoP バインドトークン) が含まれている場合、接続は `pending_dpop` 状態になります — クライアントは 5 秒以内に `dpop_bind` メッセージを送信する必要があります (以下の [DPoP Binding](#dpop-binding-for-websocket) を参照)
   
4. サーバーは DynamoDB に接続を記録します (TTL: 2 時間)
   
5. オプション: `subscribe` メッセージ経由でフィルター条件を設定
   
6. エンティティが変更されると、サーバーはクライアントにイベントをプッシュします

***

## メッセージフォーマットとフィルタリング

### クライアント → サーバー

#### subscribe (フィルター設定)

```json
{
  "action": "subscribe",
  "entityTypes": ["Room", "Sensor"],
  "idPattern": "urn:ngsi-ld:Room:.*"
}
```

| Field         | Type      | Description                               |
| ------------- | --------- | ----------------------------------------- |
| `action`      | string    | `subscribe`                               |
| `entityTypes` | string\[] | Entity types to filter                    |
| `idPattern`   | string    | Regular expression pattern for entity IDs |

#### dpop\_bind (DPoP proof 検証)

```json
{
  "action": "dpop_bind",
  "proof": "<DPoP proof JWT>"
}
```

DPoP バウンドトークン (`cnf.jkt` を含む JWT) で接続する際に必要です。接続から 5 秒以内に送信する必要があります。サーバーは proof の JWK Thumbprint がトークンの `cnf.jkt` クレームと一致することを検証し、`{"type": "dpop_verified"}` で応答します。検証されるまで、他のすべてのメッセージは `{"type": "error", "message": "DPoP proof required"}` で拒否されます。

詳細は [AUTH.md — DPoP Token Binding](../reference/auth.md#dpop-token-binding-rfc-9449) を参照してください。

#### ping (キープアライブ)

```json
{
  "action": "ping"
}
```

サーバーは `{"type": "pong"}` を返します。10 分のアイドルタイムアウトを防ぐために、5 分ごとに ping を送信してください。

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

| Field               | Type      | Description                                       |
| ------------------- | --------- | ------------------------------------------------- |
| `type`              | string    | `entityCreated`, `entityUpdated`, `entityDeleted` |
| `tenant`            | string    | Tenant name                                       |
| `servicePath`       | string    | Service path                                      |
| `entityId`          | string    | Entity ID                                         |
| `entityType`        | string    | Entity type                                       |
| `data`              | object    | Entity attribute data                             |
| `changedAttributes` | string\[] | Names of changed attributes (on update only)      |
| `timestamp`         | string    | Event timestamp (ISO 8601)                        |

### フィルタリング

フィルタリングは次の順序で 3 つのレイヤーで適用されます:


1. **テナントフィルタ (必須)** — 接続時に `tenant` クエリパラメータを介して自動的に適用されます。
   
2. **接続側の `subscribe` フィルタ (オプション)** — クライアントが受信したい内容を絞り込みます:
   
   * `entityTypes`: 受信するエンティティタイプの配列
     
   * `idPattern`: `entityId` に対してマッチングされる正規表現
     
3. **XACML 認可フィルタ** — 上記を通過した各接続に対して、ブロードキャスターはアクティブな XACML ポリシーを実行します。イベントに対して subject が `Permit` されている接続のみに配信されます。

#### XACML で利用可能なイベントごとのリソース属性 (#1107)

ブロードキャスターが配信を認可する際、これらのエンティティごとのリソース属性を AuthzRequest に注入します:

| attributeId   | Source                                                                   |
| ------------- | ------------------------------------------------------------------------ |
| `entityType`  | event's entity type                                                      |
| `entityId`    | event's entity ID                                                        |
| `entityOwner` | event entity's `createdBy` (the user who originally `POST`ed the entity) |

これにより、単一の XACML ポリシーで `${subject.userId}` テンプレート展開を `entityOwner` に対して使用して、「各ユーザーは自分が作成したエンティティのイベントのみを受信する」のような**ユーザーごとの配信フィルタ**を記述できます。完全なポリシー例については、[`docs/AUTH.md` — ブロードキャスト時のエンティティごとの属性](../reference/auth.md#per-entity-attributes-at-broadcast-time-1107) を参照してください。

> 認証なしで書き込まれたエンティティ(または `createdBy` を設定しないレガシー/バッチパス経由)は、`owner` 属性を持たないイベントを発行します — オーナーベースのルールはこれらのイベントにマッチしないため、そのフォールバックを念頭に置いてポリシーを設計してください。

***

## クライアント実装

### JavaScript SDK(推奨)

GeonicDB JavaScript SDK は、WebSocket イベントストリーミングを使用する最もシンプルな方法を提供します。認証、トークンの更新、DPoP バインディング、再接続を自動的に処理します。

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

Bearer JWT 認証の場合(例:ログインフロー後)、`setCredentials()` で認証情報を注入します:

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

完全な API リファレンスについては、SDK ドキュメントを参照してください。

### クイックスタート (raw WebSocket、最小限のセットアップ)

認証なしの最小限の接続例:

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

### wscat(デバッグ用)

```bash
# Connect (when authentication is enabled, send the token via the Authorization header)
wscat -c "wss://{api-id}.execute-api.{region}.amazonaws.com/{stage}?tenant=smartcity" -H "Authorization: Bearer YOUR_TOKEN"

# Configure filters
> {"action": "subscribe", "entityTypes": ["Room"]}

# Keep-alive
> {"action": "ping"}
```

***

## WebSocket の DPoP バインディング

DPoP バインドトークンを使用する WebSocket 接続では、接続後の証明検証ステップが必要です。WebSocket プロトコルは初期ハンドシェイク後のカスタムヘッダーをサポートしていないため、DPoP 証明は接続確立後にメッセージとして送信されます。

### フロー

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

### 状態

| State          | Description                          | Allowed Messages          |
| -------------- | ------------------------------------ | ------------------------- |
| `pending_dpop` | Awaiting DPoP proof after connection | `dpop_bind` only          |
| `verified`     | DPoP proof verified successfully     | `subscribe`, `ping`, etc. |

`dpop_bind` メッセージが 5 秒以内に受信されない場合、接続は終了されます。

***

## ベストプラクティス

### 1. Reconnection Logic

> **注**: JavaScript SDK を使用している場合、指数バックオフを伴う再接続が組み込まれています。`db.reconnect()` を使用して強制的に再接続するか、`reconnecting` イベントをリッスンして再接続試行を追跡してください。以下の例は、生の WebSocket 実装向けです。

指数バックオフを用いた堅牢な再接続を実装します:

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

10 分間のアイドルタイムアウトを防ぐために、5 分ごとに ping を送信します:

```javascript
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action: 'ping' }));
  }
}, 5 * 60 * 1000);
```

### 3. Optimizing Event Processing

大量のイベントを受信する場合、デバウンシングで UI 更新を最適化します:

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

### 5. Memory Management

メモリリークを防ぐために、イベント履歴に制限を設定します:

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

***

## トラブルシューティング

### 1. Connection Rejected (1008 Error)

**原因:**

* トークンが無効または期限切れ
  
* テナントへのアクセス権限がない
  
* `AUTH_ENABLED=true` にもかかわらずトークンが提供されていない

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

### 2. Connection Drops After 10 Minutes

**原因:** キープアライブ (ping) メッセージが送信されていません。

**解決方法:**

```javascript
// Send a ping every 5 minutes
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action: 'ping' }));
  }
}, 5 * 60 * 1000);
```

### 3. Not Receiving Events

**原因:**

* フィルタが厳しすぎる
  
* テナントが間違っている
  
* エンティティの作成/更新が実際に発生していない

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

### 4. Cannot Connect in Local Development

**原因:**

* ローカルサーバーが起動していない
  
* WebSocket URL が間違っている

**解決方法:**

```bash
# Start the local server
npm start

# Use ws:// locally (not wss://)
const wsUrl = 'ws://localhost:3000?tenant=demo';
```

### 5. Debugging

ブラウザの開発者ツールの Network タブで、WebSocket 接続と送受信されたメッセージを検査できます。

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

***

## 制約事項

| Item                   | Value         | Description                                           |
| ---------------------- | ------------- | ----------------------------------------------------- |
| Idle timeout           | 10 minutes    | Clients must send a ping every 5 minutes              |
| Concurrent connections | 500 (default) | Can be increased via AWS Support                      |
| Frame size             | 128KB         | Large entities require truncation                     |
| Latency                | \~1 minute    | Depends on the MongoDB Change Stream polling interval |
| Connection TTL         | 2 hours       | Automatically cleaned up by DynamoDB TTL              |
| Local development      | Supported     | Available via local WebSocket server                  |

***

## 関連ドキュメント


* JavaScript SDK - SDK API リファレンス(ブラウザアプリケーションに推奨)
  
* [API Common Specification](../api-reference/endpoints.md) - REST API ドキュメント
  
* [Authentication and Authorization](../reference/auth.md) - 認証設定
  
* Development Guide - ローカル開発とデプロイメント
