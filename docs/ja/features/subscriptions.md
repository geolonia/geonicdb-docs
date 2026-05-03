---
title: "Event Streaming"
description: "Real-time event streaming"
outline: deep
---
# WebSocket イベントストリーミング

GeonicDB は WebSocket によるリアルタイムイベントストリーミングをサポートしています。エンティティの変更をリアルタイムでサブスクリプションライブし、Web アプリケーションやダッシュボードに即座に反映できます。

## 目次

- [概要](#概要)
- [アーキテクチャと有効化](#アーキテクチャと有効化)
- [接続](#接続)
- [メッセージ形式とフィルタリング](#メッセージ形式とフィルタリング)
- [クライアント実装](#クライアント実装)
- [ベストプラクティス](#ベストプラクティス)
- [トラブルシューティング](#トラブルシューティング)
- [制約](#制約)

---

## 概要

イベントストリーミングは、既存の MongoDB Change Streams → EventBridge パイプラインに並行パスを追加し、エンティティの変更を WebSocket クライアントにブロードキャストします。

### 通知チャネルの比較

| チャネル | 方向 | フィルタリング | レイテンシ |
|---------|-----------|-----------|---------|
| HTTP Webhook (既存) | Push | サブスクリプション条件 | 約 1 分 |
| MQTT (既存) | Push | サブスクリプション条件 | 約 1 分 |
| WebSocket (本機能) | Push | テナント + エンティティタイプ/ID パターン | 約 1 分 |

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

GeonicDB SaaS ではイベントストリーミングは既定で有効です。追加の設定は不要です。

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

ローカル開発の場合:

```text
ws://localhost:3000?tenant={tenantName}
```

### クエリパラメータ

| パラメータ | 必須 | 説明 |
|-----------|------|------|
| `tenant` | ✅ | テナント名 (`Fiware-Service` ヘッダーと同等) |

### 認証

`AUTH_ENABLED=true` の場合、WebSocket 接続を確立するには認証トークンが必要です。トークンは次の優先順位で抽出されます:

1. **`Authorization` ヘッダー (推奨)**: `Authorization: Bearer <token>` — 最も安全な方法
2. **`Sec-WebSocket-Protocol` ヘッダー (ブラウザ向け)**: `Sec-WebSocket-Protocol: access_token, <token>` — ブラウザクライアントが `Authorization` ヘッダーを設定できない場合に使用

> **破壊的変更 (#1072)**: `?token=<token>` クエリパラメータは受け付けなくなりました。URL はリバースプロキシ / WAF / ロードバランサーのアクセスログ、ブラウザ履歴、`Referer` ヘッダーに漏洩します。これまで URL 経由でトークンを渡していたクライアントは、上記の 2 つのヘッダー方式のいずれかに切り替える必要があります。

- REST API `/auth/login` エンドポイントから取得した `accessToken` をトークンとして直接使用してください。
- `super_admin` ロールは、WebSocket ストリーミングのために任意のテナントに接続できます。注意: `super_admin` は REST 経由でデータ API (`/v2/*`、`/ngsi-ld/*`) にアクセスできませんが、運用監視目的での WebSocket イベントストリーミングは許可されています。
- `tenant_admin` / `user` ロールは自分のテナントにのみ接続できます。

| 条件 | 結果 |
|------|------|
| `AUTH_ENABLED=false`、トークンなし | ✅ 接続許可 |
| `AUTH_ENABLED=true`、トークンなし | ❌ 接続拒否 (1008) |
| `AUTH_ENABLED=true`、無効なトークン | ❌ 接続拒否 (1008) |
| `AUTH_ENABLED=true`、有効なトークン、自分のテナント | ✅ 接続許可 |
| `AUTH_ENABLED=true`、有効なトークン、他のテナント | ❌ 接続拒否 (1008) |
| `AUTH_ENABLED=true`、super_admin、任意のテナント | ✅ 接続許可 |

### 接続フロー

1. クライアントが WebSocket URL に接続 (`tenant` クエリパラメータは必須; 認証が有効な場合はトークンも必須)
2. サーバーがトークンを検証し、テナントアクセス権限を確認 (認証が有効な場合)
3. トークンに `cnf.jkt` クレーム (DPoP バインドトークン) が含まれている場合、接続は `pending_dpop` 状態になります — クライアントは 5 秒以内に `dpop_bind` メッセージを送信する必要があります (下記の [DPoP バインディング](#dpop-binding-for-websocket) を参照)
4. サーバーが DynamoDB に接続を記録 (TTL: 2 時間)
5. オプション: `subscribe` メッセージでフィルター条件を設定
6. エンティティが変更されると、サーバーがクライアントにイベントをプッシュ

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

#### dpop_bind (DPoP 証明検証)

```json
{
  "action": "dpop_bind",
  "proof": "<DPoP proof JWT>"
}
```

DPoP バインドされたトークン (`cnf.jkt` を含む JWT) で接続する場合に必要です。接続後 5 秒以内に送信する必要があります。サーバーは証明の JWK Thumbprint がトークンの `cnf.jkt` クレームと一致することを検証し、`{"type": "dpop_verified"}` で応答します。検証されるまで、他のすべてのメッセージは `{"type": "error", "message": "DPoP proof required"}` で拒否されます。

詳細は AUTH.md — DPoP Token Binding を参照してください。

#### ping (キープアライブ)

```json
{
  "action": "ping"
}
```

サーバーは `{"type": "pong"}` を返します。10 分間のアイドルタイムアウトを防ぐため、5 分ごとに ping を送信してください。

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

フィルタリングは次の順序で 3 つの層で適用されます:

1. **テナントフィルタ (必須)** — 接続時に `tenant` クエリパラメータを介して自動的に適用されます。
2. **接続側の `subscribe` フィルタ (オプション)** — クライアントが受信したい内容を絞り込みます:
   - `entityTypes`: 受信するエンティティタイプの配列
   - `idPattern`: `entityId` に対してマッチングされる正規表現
3. **XACML 認可フィルタ** — 上記を通過した各接続に対して、ブロードキャスターはアクティブな XACML ポリシーを実行します。サブジェクトがイベントに対して `Permit` された接続のみに配信されます。

#### XACML で利用可能なイベントごとのリソース属性 (#1107)

ブロードキャスターが配信を認可する際、以下のエンティティごとのリソース属性を AuthzRequest に注入します:

| attributeId | ソース |
|-------------|--------|
| `entityType` | イベントのエンティティタイプ |
| `entityId` | イベントのエンティティ ID |
| `entityOwner` | イベントエンティティの `createdBy` (元々エンティティを `POST` したユーザー) |

これにより、`${subject.userId}` テンプレート展開と `entityOwner` を使用して、単一の XACML ポリシーで「各ユーザーは自分が作成したエンティティのイベントのみを受信する」といった**ユーザーごとの配信フィルタ**を記述できます。完全なポリシー例については `docs/AUTH.md` — ブロードキャスト時のエンティティごとの属性 を参照してください。

> 認証なしで書き込まれたエンティティ (または `createdBy` を設定しないレガシー / バッチパス経由) は、`owner` 属性のないイベントを発行します — 所有者ベースのルールはこれらのイベントにマッチしないため、このフォールバックを考慮してポリシーを設計してください。

---

## クライアント実装

### JavaScript SDK (推奨)

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

Bearer JWT 認証の場合(例: ログインフロー後)、`setCredentials()` で認証情報を注入します:

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

## WebSocket の DPoP バインディング

DPoP バインドトークンを使用する WebSocket 接続には、接続後の証明検証ステップが必要です。WebSocket プロトコルは初期ハンドシェイク後のカスタムヘッダーをサポートしていないため、DPoP 証明は接続確立後にメッセージとして送信されます。

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

| 状態 | 説明 | 許可されるメッセージ |
|-------|-------------|------------------|
| `pending_dpop` | 接続後に DPoP 証明を待機中 | `dpop_bind` のみ |
| `verified` | DPoP 証明が正常に検証された | `subscribe`、`ping` など |

`dpop_bind` メッセージが 5 秒以内に受信されない場合、接続は終了されます。

---

## ベストプラクティス

### 1. 再接続ロジック

> **注意**: JavaScript SDK を使用している場合、指数バックオフを使用した再接続が組み込まれています。`db.reconnect()` を使用して強制的に再接続するか、`reconnecting` イベントをリッスンして再接続試行を追跡できます。以下の例は、raw WebSocket 実装向けです。

指数バックオフを使用した堅牢な再接続を実装します:

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

### 3. イベント処理の最適化

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

**トークン有効期限の管理:**

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

---

## トラブルシューティング

### 1. 接続が拒否される (1008 エラー)

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

### 2. 10 分後に接続が切断される

**原因:** Keep-alive (ping) メッセージが送信されていない。

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
- フィルタが厳しすぎる
- テナントが間違っている
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

### 4. ローカル開発環境で接続できない

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

ブラウザの開発者ツールの Network タブで、WebSocket 接続と送受信されたメッセージを確認できます。

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
| アイドルタイムアウト | 10 分 | クライアントは 5 分ごとに ping を送信する必要があります |
| 同時接続数 | 500 (デフォルト) | AWS Support 経由で増やすことができます |
| フレームサイズ | 128KB | 大きなエンティティは切り詰めが必要です |
| レイテンシ | ~1 分 | MongoDB Change Stream のポーリング間隔に依存します |
| 接続 TTL | 2 時間 | DynamoDB TTL によって自動的にクリーンアップされます |
| ローカル開発 | サポート対象 | ローカル WebSocket サーバー経由で利用可能 |

---

## 関連ドキュメント

- JavaScript SDK - SDK API リファレンス (ブラウザアプリケーションに推奨)
- [API 共通仕様](../api-reference/endpoints.md) - REST API ドキュメント
- Authentication and Authorization - 認証設定
- Development Guide - ローカル開発とデプロイ