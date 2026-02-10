---
title: はじめてのエンティティ
description: Vela OS SaaS 上でのNGSIv2 エンティティの作成、クエリ、更新、削除のステップバイステップチュートリアル。サブスクリプションも含む。
outline: deep
---

# はじめてのエンティティ

このチュートリアルでは、Vela OS 上の NGSIv2 エンティティのライフサイクル全体をカバーします — 作成からサブスクリプション、削除まで。

## 作るもの

会議室センサーを使ったスマートビルディングのシナリオです。温度、湿度、在室人数をトラッキングします。

1. 属性とメタデータを持つエンティティの作成
2. エンティティのクエリとフィルタリング
3. 属性の更新
4. 変更通知のサブスクリプション設定
5. エンティティの削除

## 前提条件

- Vela OS SaaS API へのアクセス（[セットアップ](/ja/getting-started/installation) を参照）
- `curl` および JSON 整形用の `jq`（オプション）

::: tip
すべてのコマンドは SaaS エンドポイントを使用します。`YOUR_API_KEY` は実際の API キーに置き換えてください。
:::

## ステップ 1: エンティティの作成

2つの会議室エンティティを作成します：

**101号室 — 東棟:**

```bash
curl -X POST https://api.vela.geolonia.com/v2/entities \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
    "id": "urn:ngsi-ld:Room:101",
    "type": "Room",
    "name": {
      "type": "Text",
      "value": "会議室 101"
    },
    "floor": {
      "type": "Integer",
      "value": 1
    },
    "temperature": {
      "type": "Number",
      "value": 23.5,
      "metadata": {
        "unit": { "type": "Text", "value": "CEL" },
        "accuracy": { "type": "Number", "value": 0.5 }
      }
    },
    "humidity": {
      "type": "Number",
      "value": 55,
      "metadata": {
        "unit": { "type": "Text", "value": "%" }
      }
    },
    "occupancy": {
      "type": "Integer",
      "value": 0
    },
    "status": {
      "type": "Text",
      "value": "available"
    }
  }'
```

**201号室 — 西棟:**

```bash
curl -X POST https://api.vela.geolonia.com/v2/entities \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
    "id": "urn:ngsi-ld:Room:201",
    "type": "Room",
    "name": {
      "type": "Text",
      "value": "会議室 201"
    },
    "floor": {
      "type": "Integer",
      "value": 2
    },
    "temperature": {
      "type": "Number",
      "value": 26.0,
      "metadata": {
        "unit": { "type": "Text", "value": "CEL" },
        "accuracy": { "type": "Number", "value": 0.5 }
      }
    },
    "humidity": {
      "type": "Number",
      "value": 62,
      "metadata": {
        "unit": { "type": "Text", "value": "%" }
      }
    },
    "occupancy": {
      "type": "Integer",
      "value": 5
    },
    "status": {
      "type": "Text",
      "value": "occupied"
    }
  }'
```

どちらも **201 Created** が返されます。

## ステップ 2: エンティティのクエリ

### 全会議室の一覧

```bash
curl -s https://api.vela.geolonia.com/v2/entities?type=Room \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq '.[].id'
```

```json
"urn:ngsi-ld:Room:101"
"urn:ngsi-ld:Room:201"
```

### 特定のエンティティを取得

```bash
curl -s https://api.vela.geolonia.com/v2/entities/urn:ngsi-ld:Room:101 \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq .
```

### 属性値でフィルタリング

温度が25°Cを超える部屋を検索：

```bash
curl -s "https://api.vela.geolonia.com/v2/entities?type=Room&q=temperature>25" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq '.[].id'
```

```json
"urn:ngsi-ld:Room:201"
```

### 特定の属性のみ取得

名前と温度だけを返す：

```bash
curl -s "https://api.vela.geolonia.com/v2/entities?type=Room&attrs=name,temperature" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq .
```

### Key-Values 形式

メタデータなしの簡略化した出力：

```bash
curl -s "https://api.vela.geolonia.com/v2/entities?type=Room&options=keyValues" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq .
```

```json
[
  {
    "id": "urn:ngsi-ld:Room:101",
    "type": "Room",
    "name": "会議室 101",
    "floor": 1,
    "temperature": 23.5,
    "humidity": 55,
    "occupancy": 0,
    "status": "available"
  },
  ...
]
```

### 複合フィルター

2階で温度が高い使用中の部屋を検索：

```bash
curl -s "https://api.vela.geolonia.com/v2/entities?type=Room&q=floor==2;temperature>25;status==occupied" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq '.[].id'
```

## ステップ 3: 属性の更新

### 部分更新（PATCH）

101号室の温度と在室人数を更新：

```bash
curl -X PATCH https://api.vela.geolonia.com/v2/entities/urn:ngsi-ld:Room:101/attrs \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
    "temperature": {
      "type": "Number",
      "value": 28.0
    },
    "occupancy": {
      "type": "Integer",
      "value": 8
    },
    "status": {
      "type": "Text",
      "value": "occupied"
    }
  }'
```

成功すると **204 No Content** が返されます。

### 属性値の直接更新

温度の値だけを直接更新：

```bash
curl -X PUT https://api.vela.geolonia.com/v2/entities/urn:ngsi-ld:Room:101/attrs/temperature/value \
  -H "Content-Type: text/plain" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" \
  -d '22.0'
```

### 新しい属性の追加

`lastCleaned` タイムスタンプ属性を追加：

```bash
curl -X POST https://api.vela.geolonia.com/v2/entities/urn:ngsi-ld:Room:101/attrs \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
    "lastCleaned": {
      "type": "DateTime",
      "value": "2026-02-10T09:00:00Z"
    }
  }'
```

## ステップ 4: サブスクリプションの作成

Room の温度が27°Cを超えたときに通知を受け取るサブスクリプションを設定：

```bash
curl -X POST https://api.vela.geolonia.com/v2/subscriptions \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
    "description": "高温アラート",
    "subject": {
      "entities": [
        { "idPattern": ".*", "type": "Room" }
      ],
      "condition": {
        "attrs": ["temperature"],
        "expression": {
          "q": "temperature>27"
        }
      }
    },
    "notification": {
      "http": {
        "url": "https://your-webhook-endpoint.example.com/alerts"
      },
      "attrs": ["temperature", "name", "floor"]
    },
    "throttling": 60
  }'
```

**201 Created** が返され、`Location` ヘッダーにサブスクリプション ID が含まれます。

### サブスクリプション一覧

```bash
curl -s https://api.vela.geolonia.com/v2/subscriptions \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq .
```

### 通知の仕組み

Room エンティティの温度が27°Cを超える値に更新されると、Vela は Webhook URL に POST リクエストを送信します：

```json
{
  "subscriptionId": "...",
  "data": [
    {
      "id": "urn:ngsi-ld:Room:101",
      "type": "Room",
      "temperature": { "type": "Number", "value": 28.0 },
      "name": { "type": "Text", "value": "会議室 101" },
      "floor": { "type": "Integer", "value": 1 }
    }
  ]
}
```

::: info 通知チャネル
HTTP Webhook の他に、Vela は **MQTT**（QoS 0/1/2）と **WebSocket** 通知もサポートしています。詳細は サブスクリプション ページをご覧ください。
:::

## ステップ 5: エンティティの削除

エンティティを1つ削除：

```bash
curl -X DELETE https://api.vela.geolonia.com/v2/entities/urn:ngsi-ld:Room:201 \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding"
```

**204 No Content** が返されます。

### バッチ削除

バッチ操作で複数のエンティティを一括削除：

```bash
curl -X POST https://api.vela.geolonia.com/v2/op/update \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
    "actionType": "delete",
    "entities": [
      { "id": "urn:ngsi-ld:Room:101", "type": "Room" }
    ]
  }'
```

## まとめ

| 操作 | メソッド | エンドポイント |
|------|---------|--------------|
| エンティティ作成 | `POST` | `/v2/entities` |
| エンティティ一覧 | `GET` | `/v2/entities` |
| エンティティ取得 | `GET` | `/v2/entities/{id}` |
| 属性更新 | `PATCH` | `/v2/entities/{id}/attrs` |
| 属性追加 | `POST` | `/v2/entities/{id}/attrs` |
| 属性置換 | `PUT` | `/v2/entities/{id}/attrs` |
| 属性値更新 | `PUT` | `/v2/entities/{id}/attrs/{attr}/value` |
| エンティティ削除 | `DELETE` | `/v2/entities/{id}` |
| サブスクリプション作成 | `POST` | `/v2/subscriptions` |
| サブスクリプション一覧 | `GET` | `/v2/subscriptions` |

## 次のステップ

- [デモアプリ](/ja/getting-started/demo-app) — Vela を使ったインタラクティブなデモ
- NGSIv2 API リファレンス — 完全な API ドキュメント
- クエリ言語 — q, mq, scopeQ を使った高度なフィルタリング
- サブスクリプション — HTTP、MQTT、WebSocket 通知
