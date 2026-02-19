---
title: "イベントストリーミング"
description: "リアルタイムイベントストリーミング"
outline: deep
---
# WebSocket イベントストリーミング

GeonicDB は WebSocket を使用したリアルタイムのイベントストリーミングをサポートしています。エンティティの変更をリアルタイムで購読し、Webアプリケーションやダッシュボードに即座に反映できます。

## 目次

- [概要](#概要)
- [アーキテクチャと有効化](#アーキテクチャと有効化)
- [接続方法](#接続方法)
- [メッセージ形式とフィルタリング](#メッセージ形式とフィルタリング)
- [クライアント実装](#クライアント実装)
- [ベストプラクティス](#ベストプラクティス)
- [トラブルシューティング](#トラブルシューティング)
- [制約事項](#制約事項)

---

## 概要

Event Streaming は MongoDB Change Streams → EventBridge の既存パイプラインに並列パスを追加し、WebSocket クライアントにエンティティ変更をブロードキャストします。

### 通知チャネルの比較

| チャネル | 方向 | フィルタリング | 遅延 |
|---------|------|--------------|------|
| HTTP Webhook (既存) | プッシュ | サブスクリプション条件 | ~1分 |
| MQTT (既存) | プッシュ | サブスクリプション条件 | ~1分 |
| WebSocket (本機能) | プッシュ | テナント + エンティティタイプ/IDパターン | ~1分 |

---

## アーキテクチャと有効化

### アーキテクチャ

```text
EventBridge ─┬─> SubscriptionMatcher -> SQS -> HTTP/MQTT  [既存]
             └─> WsBroadcastFunction -> API GW WebSocket -> クライアント  [新規]
```

- **接続状態**: DynamoDB（PAY_PER_REQUEST、TTL 自動クリーンアップ）
- **接続管理**: 3つの Lambda 関数（connect、disconnect、default）
- **ブロードキャスト**: EventBridge から直接トリガーされる Lambda 関数

### 有効化

SAM テンプレートの `EventStreamingEnabled` パラメータを `true` に設定してデプロイします。

```bash
sam deploy -t infrastructure/template.yaml \
  --parameter-overrides EventStreamingEnabled=true
```

### 環境変数

| 変数名 | 説明 |
|--------|------|
| `EVENT_STREAMING_ENABLED` | `true` で有効化 |
| `WS_CONNECTIONS_TABLE` | DynamoDB 接続テーブル名（自動設定） |
| `WS_API_ENDPOINT` | WebSocket API エンドポイント（自動設定） |

---

## 接続方法

### WebSocket URL

```text
wss://{api-id}.execute-api.{region}.amazonaws.com/{stage}?tenant={tenantName}
```

ローカル開発時:

```text
ws://localhost:3000?tenant={tenantName}
```

### クエリパラメータ

| パラメータ | 必須 | 説明 |
|-----------|------|------|
| `tenant` | ✅ | テナント名（`Fiware-Service` ヘッダーと同等） |

### 認証

`AUTH_ENABLED=true` の場合、WebSocket 接続時に認証トークンが必要です。以下の優先順位でトークンが抽出されます:

1. **`Authorization` ヘッダー（推奨）**: `Authorization: Bearer <token>` — 最もセキュアな方法
2. **`Sec-WebSocket-Protocol` ヘッダー（ブラウザ向け）**: `Sec-WebSocket-Protocol: access_token, <token>` — ブラウザクライアントで `Authorization` ヘッダーを設定できない場合に使用
3. **`token` クエリパラメータ（非推奨）**: `?token=<token>` — 後方互換のため残存。URL にトークンが露出するためセキュリティリスクがあり、将来削除予定

- トークンは REST API の `/auth/login` エンドポイントで取得した `accessToken` をそのまま使用します
- `super_admin` ロールは任意のテナントに接続可能です
- `tenant_admin` / `user` ロールは自分が所属するテナントのみに接続可能です

| 条件 | 結果 |
|------|------|
| `AUTH_ENABLED=false`、トークンなし | ✅ 接続許可 |
| `AUTH_ENABLED=true`、トークンなし | ❌ 接続拒否（1008） |
| `AUTH_ENABLED=true`、無効トークン | ❌ 接続拒否（1008） |
| `AUTH_ENABLED=true`、有効トークン、自テナント | ✅ 接続許可 |
| `AUTH_ENABLED=true`、有効トークン、他テナント | ❌ 接続拒否（1008） |
| `AUTH_ENABLED=true`、super_admin、任意テナント | ✅ 接続許可 |

### 接続フロー

1. クライアントが WebSocket URL に接続（`tenant` クエリパラメータ必須、認証有効時はトークンも必須）
2. サーバーがトークンを検証し、テナントアクセス権を確認（認証有効時）
3. サーバーが DynamoDB に接続を記録（TTL: 2時間）
4. オプション: `subscribe` メッセージでフィルタ条件を設定
5. エンティティ変更時にサーバーからイベントをプッシュ

---

## メッセージ形式とフィルタリング

### クライアント → サーバー

#### subscribe（フィルタ設定）

```json
{
  "action": "subscribe",
  "entityTypes": ["Room", "Sensor"],
  "idPattern": "urn:ngsi-ld:Room:.*"
}
```

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `action` | string | `subscribe` |
| `entityTypes` | string[] | フィルタ対象のエンティティタイプ |
| `idPattern` | string | エンティティIDの正規表現パターン |

#### ping（キープアライブ）

```json
{
  "action": "ping"
}
```

サーバーは `{"type": "pong"}` を返します。10分のアイドルタイムアウトを防ぐため、5分ごとにpingを送信してください。

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
|-----------|-----|------|
| `type` | string | `entityCreated`, `entityUpdated`, `entityDeleted` |
| `tenant` | string | テナント名 |
| `servicePath` | string | サービスパス |
| `entityId` | string | エンティティID |
| `entityType` | string | エンティティタイプ |
| `data` | object | エンティティの属性データ |
| `changedAttributes` | string[] | 変更された属性名（更新時のみ） |
| `timestamp` | string | イベント発生時刻（ISO 8601） |

### フィルタリング

- **テナントフィルタ（必須）**: 接続時のクエリパラメータ `tenant` によって自動的にフィルタリング
- **エンティティタイプフィルタ（オプション）**: `subscribe` メッセージの `entityTypes` で指定したタイプのみ受信。未指定の場合はすべてのタイプを受信
- **エンティティIDパターンフィルタ（オプション）**: `subscribe` メッセージの `idPattern` で正規表現パターンによるフィルタリング

---

## クライアント実装

### クイックスタート（最小構成）

認証なしでの最小構成の接続例：

```html
<!DOCTYPE html>
<html>
<head>
  <title>GeonicDB WebSocket クイックスタート</title>
</head>
<body>
  <h1>リアルタイムイベントモニター</h1>
  <div id="events"></div>

  <script>
    const ws = new WebSocket('ws://localhost:3000?tenant=demo');

    ws.onopen = () => {
      console.log('✅ 接続成功');

      // 特定のエンティティタイプを購読
      ws.send(JSON.stringify({
        action: 'subscribe',
        entityTypes: ['Room', 'Sensor']
      }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'pong') return;

      // イベントを画面に表示
      const eventDiv = document.createElement('div');
      eventDiv.textContent = `${data.type}: ${data.entityId} - ${JSON.stringify(data.data)}`;
      document.getElementById('events').appendChild(eventDiv);
    };

    ws.onerror = (error) => console.error('❌ エラー:', error);
    ws.onclose = () => console.log('🔌 切断されました');
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

    // 認証トークンは Sec-WebSocket-Protocol ヘッダーで送信（ブラウザ対応）
    const protocols = token ? ['access_token', token] : undefined;
    const ws = new WebSocket(url, protocols);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('✅ WebSocket 接続成功');
      setIsConnected(true);

      // フィルタ設定
      if (entityTypes) {
        ws.send(JSON.stringify({
          action: 'subscribe',
          entityTypes
        }));
      }

      // キープアライブ（5分ごと）
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
      console.error('❌ WebSocket エラー:', error);
    };

    ws.onclose = (event) => {
      console.log('🔌 WebSocket 切断:', event.code, event.reason);
      setIsConnected(false);
      if (keepAliveIntervalRef.current) {
        clearInterval(keepAliveIntervalRef.current);
      }
    };

    // クリーンアップ
    return () => {
      if (keepAliveIntervalRef.current) {
        clearInterval(keepAliveIntervalRef.current);
      }
      ws.close();
    };
  }, [wsUrl, tenant, token, entityTypes, onEvent]);

  return { isConnected };
}

// 使用例
function RoomMonitor() {
  const [events, setEvents] = useState<EntityEvent[]>([]);

  const { isConnected } = useVelaWebSocket({
    wsUrl: 'ws://localhost:3000',
    tenant: 'demo',
    entityTypes: ['Room'],
    onEvent: (event) => {
      setEvents(prev => [event, ...prev].slice(0, 100)); // 最新100件のみ保持
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

### JavaScript（認証あり）

```javascript
// トークン取得
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

// WebSocket接続
async function connectWebSocket(tenant, token) {
  const wsUrl = `wss://your-api.execute-api.ap-northeast-1.amazonaws.com/prod?tenant=${tenant}`;
  // Authorization ヘッダーが使えない場合は Sec-WebSocket-Protocol で送信
  const ws = new WebSocket(wsUrl, ['access_token', token]);

  ws.onopen = () => {
    console.log('✅ 認証済み接続成功');

    // エンティティタイプでフィルタ
    ws.send(JSON.stringify({
      action: 'subscribe',
      entityTypes: ['Vehicle', 'Sensor']
    }));

    // キープアライブ（5分ごと）
    setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'ping' }));
      }
    }, 5 * 60 * 1000);
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type !== 'pong') {
      console.log('📩 イベント受信:', data);
    }
  };

  ws.onclose = (event) => {
    if (event.code === 1008) {
      console.error('❌ 認証エラー: トークンが無効または期限切れ');
    } else {
      console.log('🔌 切断:', event.code, event.reason);
    }
  };

  return ws;
}

// 使用例
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
    token = "your-access-token"  # 認証有効時はトークンを付加
    uri = "wss://{api-id}.execute-api.{region}.amazonaws.com/{stage}?tenant=smartcity"
    headers = {"Authorization": f"Bearer {token}"}

    async with websockets.connect(uri, extra_headers=headers) as ws:
        # 購読設定
        await ws.send(json.dumps({
            "action": "subscribe",
            "entityTypes": ["Room"]
        }))

        # イベント受信ループ
        async for message in ws:
            event = json.loads(message)
            if event.get('type') != 'pong':
                print(f"{event['type']}: {event['entityId']}", event['data'])

asyncio.run(stream_events())
```

### wscat（デバッグ用）

```bash
# 接続（認証有効時は Authorization ヘッダーでトークンを送信）
wscat -c "wss://{api-id}.execute-api.{region}.amazonaws.com/{stage}?tenant=smartcity" -H "Authorization: Bearer YOUR_TOKEN"

# フィルタ設定
> {"action": "subscribe", "entityTypes": ["Room"]}

# キープアライブ
> {"action": "ping"}
```

---

## ベストプラクティス

### 1. 再接続ロジック

Exponential Backoff を使用した堅牢な再接続を実装：

```javascript
class VelaWebSocket {
  constructor(config) {
    this.config = config;
    this.reconnectDelay = 1000; // 初期遅延: 1秒
    this.maxReconnectDelay = 30000; // 最大遅延: 30秒
    this.shouldReconnect = true;
  }

  connect() {
    const url = `${this.config.wsUrl}?tenant=${this.config.tenant}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('✅ 接続成功');
      this.reconnectDelay = 1000; // 遅延をリセット
    };

    this.ws.onclose = () => {
      if (this.shouldReconnect) {
        console.log(`🔄 ${this.reconnectDelay}ms 後に再接続...`);
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

10分のアイドルタイムアウトを防ぐため、5分ごとに ping を送信：

```javascript
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action: 'ping' }));
  }
}, 5 * 60 * 1000);
```

### 3. イベント処理の最適化

大量のイベントを受信する場合、デバウンス処理で UI 更新を最適化：

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

**トークンの安全な管理:**

```javascript
// ❌ 悪い例: ローカルストレージに保存
localStorage.setItem('token', token);

// ✅ 良い例: メモリに保持
let tokenCache = null;

async function getToken() {
  if (!tokenCache || isTokenExpired(tokenCache)) {
    tokenCache = await fetchNewToken();
  }
  return tokenCache;
}
```

**トークンの有効期限管理:**

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

イベント履歴の上限を設定し、メモリリークを防止：

```javascript
const MAX_EVENTS = 1000;
if (events.length > MAX_EVENTS) {
  events = events.slice(0, MAX_EVENTS);
}

// クリーンアップ
onUnmounted(() => {
  clearInterval(keepAliveInterval);
  ws.close();
});
```

---

## トラブルシューティング

### 1. 接続が拒否される（1008 エラー）

**原因:**
- トークンが無効または期限切れ
- テナントへのアクセス権限がない
- `AUTH_ENABLED=true` なのにトークンを渡していない

**解決方法:**

```javascript
ws.onclose = (event) => {
  if (event.code === 1008) {
    console.error('認証エラー: トークンを確認してください');
    // トークンを再取得して再接続
    getNewToken().then(token => reconnect(token));
  }
};
```

### 2. 接続が10分後に切断される

**原因:** キープアライブ（ping）を送信していない

**解決方法:**

```javascript
// 5分ごとにpingを送信
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action: 'ping' }));
  }
}, 5 * 60 * 1000);
```

### 3. イベントが受信できない

**原因:**
- フィルタが厳しすぎる
- テナントが間違っている
- エンティティ作成/更新が実際に行われていない

**解決方法:**

```javascript
// デバッグ: すべてのメッセージをログ出力
ws.onmessage = (event) => {
  console.log('受信:', event.data);
  const data = JSON.parse(event.data);
  // ...
};

// フィルタを緩める
ws.send(JSON.stringify({
  action: 'subscribe'
  // entityTypes, idPattern を指定しない
}));
```

### 4. ローカル開発で接続できない

**原因:**
- ローカルサーバーが起動していない
- WebSocket URL が間違っている

**解決方法:**

```bash
# ローカルサーバーを起動
npm start

# ローカルでは ws:// を使用（wss:// ではない）
const wsUrl = 'ws://localhost:3000?tenant=demo';
```

### 5. デバッグ方法

ブラウザ開発者ツールの Network タブで WebSocket 接続と送受信メッセージを確認できます。

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

## 制約事項

| 項目 | 値 | 説明 |
|------|-----|------|
| アイドルタイムアウト | 10分 | クライアントは5分ごとにpingを送信する必要あり |
| 同時接続数 | 500（デフォルト） | AWS サポートで増加可能 |
| フレームサイズ | 128KB | 大きなエンティティはトランケーションが必要 |
| レイテンシ | ~1分 | MongoDB Change Stream のポーリング間隔に依存 |
| 接続TTL | 2時間 | DynamoDB の TTL で自動クリーンアップ |
| ローカル開発 | 対応 | ローカル WebSocket サーバーで利用可能 |

---

## 関連ドキュメント

- [API 共通仕様](../api-reference/endpoints.md) - REST API ドキュメント
- 認証・認可 - 認証設定
- [開発ガイド](../getting-started/installation.md) - ローカル開発とデプロイ
