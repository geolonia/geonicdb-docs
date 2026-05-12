---
title: "NGSI Subscriptions"
description: "HTTP Webhook subscriptions for entity change notifications"
outline: deep
---
# サブスクリプション

GeonicDB のサブスクリプション機能により、エンティティの変更をリアルタイムで監視し、外部システムに自動的に通知することができます。

## 目次


* [概要](#概要)
  
* [サブスクリプションの仕組み](#サブスクリプションの仕組み)
  
* [通知方法](#通知方法)
  
* [条件とフィルタリング](#条件とフィルタリング)
  
* [実用例](#実用例)
  
* [ベストプラクティス](#ベストプラクティス)
  
* [アクセス制御と所有権 (GeonicDB 拡張)](#アクセス制御と所有権-geonicdb-拡張)
  
* [トラブルシューティング](#トラブルシューティング)

***

## 概要

サブスクリプションは、エンティティの作成、更新、削除を監視し、定義された条件が満たされたときに指定されたエンドポイントに通知を送信します。

### 主なユースケース


* **センサーデータ監視**: 温度、湿度などのしきい値超過を検出
  
* **位置追跡**: 車両やデバイスの位置変化を追跡
  
* **イベント駆動アーキテクチャ**: エンティティの変更によってトリガーされる自動処理
  
* **データ統合**: 他のシステムへのリアルタイムデータ配信

### サポートされている API

| API     | Endpoint                    | Support |
| ------- | --------------------------- | ------- |
| NGSIv2  | `/v2/subscriptions`         | ✅       |
| NGSI-LD | `/ngsi-ld/v1/subscriptions` | ✅       |

***

## サブスクリプションの仕組み

```text
1. Entity creation/update
   ↓
2. MongoDB Change Stream detects the event
   ↓
3. Event is sent to EventBridge
   ↓
4. SubscriptionMatcher searches for subscriptions matching the conditions
   ↓
5. Notification message is sent to the SQS queue
   ↓
6. NotificationSender sends an HTTP/MQTT notification to the external endpoint
```

**レイテンシ**: エンティティの変更から通知配信まで約 1 分(Change Stream のポーリング間隔に依存します)。

***

## 通知方法

### HTTP Webhook

標準的な HTTP POST リクエストとして通知を送信します。

**サブスクリプション作成の例:**

```bash
curl -X POST http://localhost:3000/v2/subscriptions \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: demo" \
  -d '{
    "description": "Room temperature monitoring",
    "subject": {
      "entities": [{ "idPattern": ".*", "type": "Room" }],
      "condition": {
        "attrs": ["temperature"],
        "expression": { "q": "temperature>25" }
      }
    },
    "notification": {
      "http": { "url": "https://webhook.example.com/notify" },
      "attrs": ["temperature", "pressure"]
    },
    "expires": "2030-12-31T23:59:59.000Z",
    "throttling": 5
  }'
```

**通知ペイロードの例:**

```json
{
  "subscriptionId": "sub123",
  "data": [
    {
      "id": "Room1",
      "type": "Room",
      "temperature": {
        "type": "Number",
        "value": 26.5,
        "metadata": {}
      },
      "pressure": {
        "type": "Number",
        "value": 1013.25,
        "metadata": {}
      }
    }
  ]
}
```

### httpCustom (カスタムテンプレート)

HTTP メソッド、ヘッダー、およびペイロードのカスタマイズが可能です。

**サブスクリプション作成の例:**

```bash
curl -X POST http://localhost:3000/v2/subscriptions \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: demo" \
  -d '{
    "description": "Custom notification template",
    "subject": {
      "entities": [{ "type": "Room" }],
      "condition": { "attrs": ["temperature"] }
    },
    "notification": {
      "httpCustom": {
        "url": "https://api.example.com/events",
        "method": "PUT",
        "headers": {
          "X-Api-Key": "secret-key",
          "Content-Type": "application/json"
        },
        "qs": {
          "entityId": "${id}",
          "temp": "${temperature}"
        },
        "payload": "{\"room\": \"${id}\", \"temp\": ${temperature}, \"timestamp\": \"${timestamp}\"}"
      }
    }
  }'
```

**マクロ置換:**

| Macro            | Substituted value                                              |
| ---------------- | -------------------------------------------------------------- |
| `${id}`          | Entity ID                                                      |
| `${type}`        | Entity type                                                    |
| `${temperature}` | Attribute value (extracts `.value` from normalized attributes) |

存在しない属性は文字列 `null` に置き換えられます。

### MQTT

MQTT ブローカーにメッセージを発行します。

**サブスクリプション作成の例:**

```bash
curl -X POST http://localhost:3000/v2/subscriptions \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: demo" \
  -d '{
    "description": "MQTT notification",
    "subject": {
      "entities": [{ "type": "Sensor" }],
      "condition": { "attrs": ["value"] }
    },
    "notification": {
      "mqtt": {
        "url": "mqtt://broker.example.com:1883",
        "topic": "sensors/room/temperature",
        "qos": 1,
        "user": "username",
        "passwd": "password"
      },
      "attrs": ["value"]
    }
  }'
```

**MQTT 設定:**

| Field    | Description                               | Default |
| -------- | ----------------------------------------- | ------- |
| `url`    | MQTT broker URL (`mqtt://` or `mqtts://`) | -       |
| `topic`  | Topic to publish to                       | -       |
| `qos`    | QoS level (0, 1, 2)                       | 0       |
| `retain` | Message retain flag                       | false   |
| `user`   | Authentication username                   | -       |
| `passwd` | Authentication password                   | -       |

***

## 条件とフィルタリング

### エンティティの指定

**特定の ID:**

```json
{
  "subject": {
    "entities": [
      { "id": "Room1", "type": "Room" }
    ]
  }
}
```

**ID パターン (正規表現):**

```json
{
  "subject": {
    "entities": [
      { "idPattern": "Room.*", "type": "Room" }
    ]
  }
}
```

**すべてのエンティティ:**

```json
{
  "subject": {
    "entities": [
      { "idPattern": ".*" }
    ]
  }
}
```

### 条件式(q パラメータ)

**比較演算子:**

| Operator | Description              | Example            |
| -------- | ------------------------ | ------------------ |
| `>`      | Greater than             | `temperature>25`   |
| `<`      | Less than                | `temperature<10`   |
| `>=`     | Greater than or equal to | `temperature>=20`  |
| `<=`     | Less than or equal to    | `temperature<=30`  |
| `==`     | Equal to                 | `status==active`   |
| `!=`     | Not equal to             | `status!=inactive` |

**論理演算子:**

| Operator | Description | Example                      |
| -------- | ----------- | ---------------------------- |
| `;`      | AND         | `temperature>20;humidity<80` |
| `,`      | OR          | `type==Room,type==Building`  |

**例:**

```json
{
  "subject": {
    "condition": {
      "attrs": ["temperature"],
      "expression": {
        "q": "temperature>25;temperature<40"
      }
    }
  }
}
```

### 通知属性フィルタリング

**特定の属性のみを通知:**

```json
{
  "notification": {
    "attrs": ["temperature", "humidity"]
  }
}
```

**特定の属性を除外:**

```json
{
  "notification": {
    "exceptAttrs": ["metadata", "internalId"]
  }
}
```

**変更された属性のみを通知:**

```json
{
  "notification": {
    "onlyChangedAttrs": true
  }
}
```

***

## 実用例

### 例 1: 温度閾値監視

高温アラートを送信するサブスクリプション:

```bash
curl -X POST http://localhost:3000/v2/subscriptions \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -d '{
    "description": "High temperature alert",
    "subject": {
      "entities": [{ "type": "TemperatureSensor" }],
      "condition": {
        "attrs": ["temperature"],
        "expression": { "q": "temperature>35" }
      }
    },
    "notification": {
      "http": { "url": "https://alerts.example.com/high-temp" },
      "attrs": ["temperature", "location"]
    }
  }'
```

### 例 2: 車両位置追跡

車両の位置変化を追跡:

```bash
curl -X POST http://localhost:3000/v2/subscriptions \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: fleet" \
  -d '{
    "description": "Vehicle location tracking",
    "subject": {
      "entities": [{ "idPattern": "Vehicle.*", "type": "Vehicle" }],
      "condition": { "attrs": ["location"] }
    },
    "notification": {
      "http": { "url": "https://tracking.example.com/update" },
      "attrs": ["location", "speed", "status"],
      "attrsFormat": "keyValues"
    }
  }'
```

### 例 3: カスタムペイロード (Slack 通知)

Slack Webhook にカスタムフォーマットされた通知を送信:

```bash
curl -X POST http://localhost:3000/v2/subscriptions \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -d '{
    "description": "Slack notification for alerts",
    "subject": {
      "entities": [{ "type": "Alert" }],
      "condition": { "attrs": ["severity"] }
    },
    "notification": {
      "httpCustom": {
        "url": "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
        "method": "POST",
        "headers": { "Content-Type": "application/json" },
        "payload": "{\"text\": \"⚠️ Alert: ${id} - Severity: ${severity}\"}"
      }
    }
  }'
```

### 例 4: MQTT センサーデータ配信

MQTT ブローカーにセンサーデータを配信:

```bash
curl -X POST http://localhost:3000/v2/subscriptions \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: iot" \
  -d '{
    "description": "Sensor data to MQTT",
    "subject": {
      "entities": [{ "type": "Sensor" }],
      "condition": { "attrs": ["value"] }
    },
    "notification": {
      "mqtt": {
        "url": "mqtts://broker.hivemq.com:8883",
        "topic": "sensors/${type}/${id}",
        "qos": 1
      },
      "attrsFormat": "keyValues"
    }
  }'
```

***

## ベストプラクティス

### 1. 条件を適切に設定する

**❌ 悪い例: すべてのエンティティを監視する**

```json
{
  "subject": {
    "entities": [{ "idPattern": ".*" }],
    "condition": { "attrs": [] }
  }
}
```

通知の量が過剰になり、システムに負荷がかかります。

**✅ 良い例: 特定のタイプと条件で絞り込む**

```json
{
  "subject": {
    "entities": [{ "type": "Sensor" }],
    "condition": {
      "attrs": ["temperature"],
      "expression": { "q": "temperature>25" }
    }
  }
}
```

### 2. スロットリングを設定する

`throttling`(秒単位)を設定して、過剰な通知を防ぎます:

```json
{
  "throttling": 60
}
```

これにより、同じエンティティの変更通知が 60 秒に 1 回に制限されます。

### 3. 有効期限を設定する

テストサブスクリプションには `expires` を設定します:

```json
{
  "expires": "2026-12-31T23:59:59.000Z"
}
```

### 4. 変更された属性のみを通知する

不要な通知を削減します:

```json
{
  "notification": {
    "onlyChangedAttrs": true
  }
}
```

### 5. ステータス管理

`inactive` に設定して、一時的に通知を停止します:

```bash
curl -X PATCH http://localhost:3000/v2/subscriptions/{id} \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: demo" \
  -d '{ "status": "inactive" }'
```

### 6. エラーハンドリング

通知の送信先エンドポイントで以下を実装します:

* **2xx ステータスコードを返す**: 成功を示すため
  
* **リトライロジック**: 一時的な障害を処理するため
  
* **タイムアウト設定**: 長時間のハングを防ぐため

***

## アクセス制御と所有権 (GeonicDB 拡張)

> **注意**: `super_admin` はサブスクリプションエンドポイント (`/v2/subscriptions`, `/ngsi-ld/v1/subscriptions`) にアクセスできません。これらはデータ API です。代わりに `tenant_admin` または `user` ロールを使用してください。

認証が有効な環境では、サブスクリプションに所有権ベースのアクセス制御が適用されます。

### 動作


* サブスクリプションが作成されると、認証されたユーザーの ID が `createdBy` フィールドに記録されます。
  
* **更新 (PATCH) と削除 (DELETE)** は、次のいずれかの条件を満たすユーザーのみが実行できます:
  
  * サブスクリプションの作成者 (`createdBy` が一致)
    
  * `tenant_admin` ロール
    
* 上記の条件が満たされない場合、**403 Forbidden** が返されます。
  
* **取得 (GET) と一覧表示 (LIST)** は、同じテナント内の認証された任意のユーザーに対して制限されません。

> **注意**: 同じ所有権検証が登録 (`/v2/registrations`, `/ngsi-ld/v1/csourceRegistrations`) にも適用されます。

### サブスクリプション作成における XACML 属性ベース制御 (NGSI-LD, #1104)

`POST /ngsi-ld/v1/subscriptions` の場合、XACML PIP はサブスクリプション対象の属性を `AuthzRequest.resource` に注入し、きめ細かなポリシー制御を可能にします:

| Resource attribute     | Source field                | Example use                                                                                                 |
| ---------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `entityType`           | `entities[].type`           | "Anonymous can subscribe only to `ActivityLog`"                                                             |
| `entityId`             | `entities[].id`             | Restrict to specific entity IDs                                                                             |
| `entityIdPattern`      | `entities[].idPattern`      | Restrict by id pattern                                                                                      |
| `notificationEndpoint` | `notification.endpoint.uri` | "Notifications may only be posted to `https://*.example.com/**`" — defence against SSRF / data exfiltration |

`entities[]` に複数の要素が含まれる場合、サブスクリプション作成が成功するためには、**すべての要素が Permit である必要があります** (全 Permit セマンティクス)。単一の不一致の型または id パターンでも、リクエスト全体が `403 Forbidden` で拒否されます。

> リテラル `body.type === "Subscription"` は `entityType` に伝播**されません**。ポリシーはラッパーオブジェクトの型ではなく、`entities[].type` をターゲットにする必要があります。

認証と認可の詳細については、[AUTH.md § Subscription PIP attributes](../reference/auth.md#subscription-pip-attributes) を参照してください。

***

## トラブルシューティング

### 1. 通知が配信されない

**原因:**

* 条件式が一致しない
  
* 通知先 URL に到達できない
  
* サブスクリプションが `inactive` であるか、期限切れである

**確認方法:**

```bash
# Check subscription details
curl http://localhost:3000/v2/subscriptions/{id} \
  -H "Fiware-Service: demo"

# Check status, expires, and lastNotification
```

**解決方法:**

* 条件式をテスト: エンティティを手動で更新し、条件が満たされていることを確認
  
* 通知 URL をテスト: `curl` で直接到達可能であることを確認
  
* ステータスを `active` に変更

### 2. 通知が重複する

**原因:**

* `throttling` が設定されていない
  
* 複数のサブスクリプションが同じエンティティを監視している

**解決方法:**

```bash
# Configure throttling
curl -X PATCH http://localhost:3000/v2/subscriptions/{id} \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: demo" \
  -d '{ "throttling": 30 }'

# Check the subscription list
curl http://localhost:3000/v2/subscriptions \
  -H "Fiware-Service: demo"
```

### 3. Notification Payload Is Not as Expected

**原因:**

* `attrs` フィルターが正しく設定されていない
  
* `attrsFormat` が適切でない
  
* `httpCustom` マクロの構文が正しくない

**確認方法:**

```bash
# Check subscription configuration
curl http://localhost:3000/v2/subscriptions/{id} \
  -H "Fiware-Service: demo" | jq '.notification'
```

**解決方法:**

* 必要な属性を含むように `attrs` を更新する
  
* `attrsFormat` を `normalized` または `keyValues` に変更する
  
* `httpCustom` マクロの構文を確認する(`${attrName}` は属性名と一致する必要があります)

### 4. MQTT Notifications Are Not Being Sent

**原因:**

* MQTT ブローカーに接続できない
  
* 認証資格情報が正しくない
  
* トピック名が無効

**確認方法:**

```bash
# Test the connection to the MQTT broker (using mosquitto_sub)
mosquitto_sub -h broker.example.com -p 1883 -t "sensors/#" -u username -P password
```

**解決方法:**

* MQTT ブローカーの URL、ポート、および資格情報を確認する
  
* トピック名に特殊文字が含まれていないことを確認する
  
* QoS レベルを 0 に下げてみる

### 5. Subscription Automatically Becomes inactive

**原因:**

* 通知先が継続的にエラーを返している(5xx、タイムアウト)
  
* GeonicDB がサブスクリプションを自動的に無効化した

**解決方法:**

* 通知先エンドポイントのログを確認する
  
* エンドポイントが正しく応答するように修正する
  
* サブスクリプションを `active` に戻す

***

## 関連ドキュメント


* [API Common Specification](../api-reference/endpoints.md) - REST API ドキュメント
  
* [API\_NGSIV2.md](../api-reference/ngsiv2.md) - NGSIv2 Subscriptions API リファレンス
  
* [API\_NGSILD.md](../api-reference/ngsild.md) - NGSI-LD Subscriptions API リファレンス
  
* [EVENT\_STREAMING.md](./subscriptions.md) - WebSocket イベントストリーミング
