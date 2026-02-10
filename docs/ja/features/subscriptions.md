---
title: サブスクリプションと通知
description: Vela OS で HTTP Webhook、MQTT、WebSocket イベントストリーミングによるリアルタイム通知を設定する方法。
outline: deep
---

# サブスクリプションと通知

Vela OS は、エンティティの属性が変更された際にリアルタイムでデータを配信する3つの通知チャネルを提供します：**HTTP Webhook**、**MQTT**、**WebSocket イベントストリーミング**。サブスクリプションにより、通知をトリガーする条件を定義し、アプリケーションを最新のコンテキストデータと同期させることができます。

## 通知チャネル

| チャネル | 方向 | フィルタリング | レイテンシ | プロトコル |
|---------|------|--------------|-----------|----------|
| HTTP Webhook | プッシュ | サブスクリプション条件 | 約1分 | HTTP/HTTPS POST |
| MQTT | プッシュ | サブスクリプション条件 | 約1分 | MQTT 3.1.1 / 5.0 |
| WebSocket | プッシュ | テナント + エンティティタイプ/IDパターン | 約1分 | WebSocket (WSS) |

## サブスクリプションの作成

### NGSIv2

```bash
curl -X POST https://api.vela.geolonia.com/v2/subscriptions \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "description": "温度変化時に通知",
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
curl -X POST https://api.vela.geolonia.com/ngsi-ld/v1/subscriptions \
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

## HTTP Webhook 通知

サブスクリプション条件が満たされると、Vela OS は設定されたエンドポイントに HTTP POST リクエストを送信します。

### 通知ペイロード（NGSIv2）

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

### カスタムヘッダー

Webhook 通知にカスタムヘッダーを含めることができます：

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

## MQTT 通知

Vela OS は HTTP リクエストの代わりに MQTT ブローカーに通知をパブリッシュできます。

```json
{
  "notification": {
    "mqtt": {
      "url": "mqtt://broker.example.com:1883",
      "topic": "vela/notifications/room",
      "qos": 1
    },
    "attrs": ["temperature"]
  }
}
```

| パラメータ | 説明 |
|-----------|------|
| `url` | MQTT ブローカー URL（`mqtt://` または `mqtts://`） |
| `topic` | パブリッシュ先の MQTT トピック |
| `qos` | Quality of Service レベル（0、1、または 2） |

## WebSocket イベントストリーミング

ブラウザベースのリアルタイムアプリケーション向けに、Vela OS はエンティティの変更を接続中のクライアントに直接プッシュする WebSocket イベントストリーミングを提供します。

### 接続

```javascript
const ws = new WebSocket(
  'wss://api.vela.geolonia.com/ws?tenant=smartcity&token=YOUR_API_KEY'
);

ws.onopen = () => {
  // 特定のエンティティタイプを購読
  ws.send(JSON.stringify({
    action: 'subscribe',
    entityTypes: ['Room', 'Sensor']
  }));

  // 5分ごとにキープアライブ ping を送信
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

### 接続パラメータ

| パラメータ | 必須 | 説明 |
|-----------|------|------|
| `tenant` | はい | テナント名（`Fiware-Service` ヘッダーと同等） |
| `token` | 認証有効時 | API アクセストークン |

### サブスクリプションフィルタ

接続後、`subscribe` メッセージを送信してイベントをフィルタリングできます：

```json
{
  "action": "subscribe",
  "entityTypes": ["Room", "Sensor"],
  "idPattern": "urn:ngsi-ld:Room:.*"
}
```

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `entityTypes` | string[] | イベントを受信するエンティティタイプ |
| `idPattern` | string | エンティティ ID の正規表現パターン |

### イベント形式

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

イベントタイプ：`entityCreated`、`entityUpdated`、`entityDeleted`

### WebSocket の制約

| 項目 | 値 |
|------|-----|
| アイドルタイムアウト | 10分（5分ごとに ping を送信） |
| 最大同時接続数 | 500（デフォルト） |
| 最大フレームサイズ | 128 KB |
| 接続 TTL | 2時間 |

## 条件式

サブスクリプションは `q` パラメータを使用した式ベースのフィルタリングをサポートしています：

| 演算子 | 例 | 説明 |
|--------|-----|------|
| `==` | `temperature==30` | 等しい |
| `!=` | `status!=inactive` | 等しくない |
| `>` | `temperature>25` | より大きい |
| `<` | `temperature<10` | より小さい |
| `>=` | `temperature>=20` | 以上 |
| `<=` | `temperature<=35` | 以下 |
| `..` | `temperature==10..30` | 範囲（境界含む） |

条件は `;`（AND）または `,`（OR）で組み合わせることができます：

```text
temperature>25;humidity<80
```

## スロットリング

`throttling` フィールド（秒単位）はサブスクリプションごとの通知レートを制限します。設定すると、複数の属性変更が発生しても、指定された間隔内に1回以上の通知は送信されません。

```json
{
  "throttling": 10
}
```

この設定により、そのサブスクリプションに対して最大10秒に1回の通知が保証されます。

## サブスクリプションの管理

### 一覧取得

```bash
curl https://api.vela.geolonia.com/v2/subscriptions \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### 削除

```bash
curl -X DELETE https://api.vela.geolonia.com/v2/subscriptions/{subscriptionId} \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## アーキテクチャ

サブスクリプション通知は非同期で処理されます：

```text
エンティティ変更 → MongoDB Change Stream → EventBridge
                                               ├── SubscriptionMatcher → SQS FIFO → HTTP/MQTT
                                               └── WsBroadcastFunction → WebSocket クライアント
```

このアーキテクチャにより、WebSocket ストリーミングの低レイテンシを維持しながら、信頼性の高い順序保証付きの通知配信を実現しています。
