---
title: "NGSI Subscriptions"
description: "HTTP Webhook subscriptions for entity change notifications"
outline: deep
---
# サブスクリプション

GeonicDB のサブスクリプション機能により、エンティティの変更をリアルタイムで監視し、外部システムに自動的に通知することができます。

## 目次


* [概要](#概要)
  
* [サブスクリプションの動作](#サブスクリプションの動作)
  
* [通知方法](#通知方法)
  
* [条件とフィルタリング](#条件とフィルタリング)
  
* [実践例](#practical-examples)
  
* [ベストプラクティス](#ベストプラクティス)
  
* [アクセス制御と所有権(GeonicDB 拡張)](#access-control-and-ownership-geonicdb-extension)
  
* [トラブルシューティング](#トラブルシューティング)

***

## 概要

サブスクリプションは、エンティティの作成、更新、削除を監視し、定義された条件が満たされた場合に指定されたエンドポイントに通知を送信します。

### 主なユースケース


* **センサーデータ監視**: 温度、湿度などの閾値超過を検出
  
* **位置追跡**: 車両やデバイスの位置変化を追跡
  
* **イベント駆動アーキテクチャ**: エンティティの変更によってトリガーされる自動処理
  
* **データ統合**: 他のシステムへのリアルタイムデータ配信

### サポートされている API

| API     | Endpoint                    | Support |
| ------- | --------------------------- | ------- |
| NGSIv2  | `/v2/subscriptions`         | ✅       |
| NGSI-LD | `/ngsi-ld/v1/subscriptions` | ✅       |

> **注記(#1304)**: ホスト名ルーティングされたデプロイメント(マルチサブドメイン構成の専用 DB)でも購読は発火します。API 経由のエンティティ変更はリクエストスコープでイベントを発行し、発生元デプロイメントの情報(`deployment.hostname`)を運んで背景ワーカーが正しい DB に対してマッチング・通知・状態更新を行います。**制限**: デプロイメント DB への直接 DB 書き込み(API を経由しない変更)はイベントを発火しません — change stream によるバックアップ監視はデフォルト DB のみです(デフォルト DB には EventBridge 発行漏れ時の冗長経路がありますが、デプロイメント DB にはない信頼性の非対称があります)。また、デプロイメント行の登録・有効化はキャッシュ(最大 5 分)の反映後にワーカーへ届きます。

***

## サブスクリプションの動作

```text
1. Entity creation/update/delete (via API), published directly to EventBridge by EntityService
   — or, for TTL-expired entities (`expiresAt`), claimed and published by the expiry sweeper (#1561)
   ↓
2. SubscriptionMatcher searches for subscriptions matching the conditions
   ↓
3. Notification message is sent to the SQS queue
   ↓
4. NotificationSender sends an HTTP/MQTT notification to the external endpoint
```

**レイテンシ**: API 経由の通常のエンティティ作成/更新/削除ではほぼ即時です。TTL 失効の場合、`EntityDeleted` 通知がこのパイプラインに入る前に、失効スイーパーのポーリング間隔(`ENTITY_EXPIRY.SWEEP_INTERVAL_SECONDS`、[QUOTAS.md](../saas/quotas.md#ttl-失効-expiresat-expiry-sweeper1561) を参照)として最大約 1 分が追加されます。

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

> 上記の例は **NGSIv2** のボディです。NGSI-LD サブスクリプションは、ETSI `Notification`(`id` / `type: "Notification"` / `data[]` を `notification.format` で選択された表現形式で)を配信します — [Notification Body Shape](#notification-body-shape-ngsi-ld-vs-ngsiv2-1765) を参照してください。

### httpCustom (カスタムテンプレート)

HTTP メソッド、ヘッダー、およびペイロードのカスタマイズを可能にします。

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

#### httpCustom.json (型保持テンプレート)

`payload` は文字列テンプレートであるため、置換されたすべての値は文字列になります。**属性の型を保持**する必要がある場合(数値は数値のまま、ブール値はブール値のまま)は、代わりに `httpCustom.json` を使用してください(FIWARE Orion パリティ)。`json` はオブジェクトまたは配列テンプレートを受け入れ、`payload` とは**相互排他的**です。

```bash
curl -X POST http://localhost:3000/v2/subscriptions \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: demo" \
  -d '{
    "subject": { "entities": [{ "type": "Room" }] },
    "notification": {
      "httpCustom": {
        "url": "https://api.example.com/events",
        "json": {
          "room": "${id}",
          "temp": "${temperature}",
          "active": "${active}",
          "unit": "celsius"
        }
      }
    }
  }'
```

置換ルール:


* **単独マクロ値**(`"${temperature}"`):\*\*属性値は元の JSON 型でインライン化されます(数値 → 数値、ブール値 → ブール値、オブジェクト/配列 → オブジェクト/配列)。存在しない属性は `null` になります。
  
* **部分マクロ値**(`"prefix-${id}"`):\*\*常に文字列を生成します。
  
* **キーは置換されません** — キー内のマクロ(`"${id}": ...`)は `400` で拒否されます。
  
* テンプレートは作成時に制限されます:シリアル化されたサイズ ≤ `MAX_PAYLOAD_LENGTH` およびネスト深度 ≤ `MAX_JSON_DEPTH`;違反は `400` で拒否されます。
  
* 通知はデフォルトで `Content-Type: application/json` で送信されます。これは `receiverInfo` (カスタムヘッダー)を介してオーバーライドできます。

上記のサブスクリプションに対して配信される本文の例 (temperature = 25.5, active = true):

```json
{ "room": "Room1", "temp": 25.5, "active": true, "unit": "celsius" }
```

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

### エンティティ仕様

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

> **パターンの制限。** `idPattern` と `typePattern` は通知パス上のエンティティ ID と型に対して評価されるため、壊滅的なバックトラッキングを引き起こしやすいパターンは、サブスクリプション作成時に `400 BadRequest` で拒否されます。これには、ネストされた量指定子 (`(a+)+`) と **量指定されたグループ内の選択** (`^(a|aa)+$`、`^((a|aa))+$`) が含まれます — 完全なルールセットについては Regex Pattern Validation (ReDoS) を参照してください。文字クラスと量指定されていないグループは影響を受けません: `^urn:ngsi-ld:(Room|Vehicle):[0-9]+$` と `Room[0-9]+` は受け入れられます。

**型パターン (正規表現):**

```json
{
  "subject": {
    "entities": [
      { "idPattern": ".*", "typePattern": "Sensor.*" }
    ]
  }
}
```

`typePattern` は両方の API で受け入れられます (`type` と `typePattern` は相互に排他的です)。NGSIv2 では仕様の一部ですが、NGSI-LD サブスクリプション (`entities[].typePattern`) では **GeonicDB 拡張** です — ETSI の `EntitySelector` には `typePattern` がありません。`type` とは異なり、`typePattern` は `@context` で項展開 **されません** (#1657)。型が正規の FQN 形式 (`@context` によって絶対 IRI にマッピングされた項) で保存されている NGSI-LD エンティティの場合、パターンは、保存された FQN と、この目的のために作成/更新時に保存されるサブスクリプション自身の `@context` で圧縮された項の **両方** に対してマッチングされます (#1680) — そのため、短い名前 (例: `Sensor.*`) に対して書かれたパターンは、マッピングコンテキストを介して作成されたエンティティとのマッチングを維持します。

### 条件式 (q パラメータ)

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

### ジオフィルタリング (geoQ)

NGSI-LD サブスクリプションは `geoQ` も受け付けます。これは **`GET /ngsi-ld/v1/entities` と同じジオエンジン**で評価されます(`georel` / `geometry` / `coordinates`、オプションの `geoproperty` はデフォルトで `location`):

```json
{
  "type": "Subscription",
  "entities": [{ "type": "Incident" }],
  "geoQ": {
    "georel": "near;maxDistance==1000",
    "geometry": "Point",
    "coordinates": [139.6503, 35.6762]
  },
  "notification": {
    "endpoint": { "uri": "https://example.com/hook" }
  }
}
```

`coordinates` は文字列(`"139.6503,35.6762"`)または GeoJSON 形式の配列を受け付けます — 仕様が `LineString` / `Polygon` に使用するネストされた形式も含みます(`[[[138,34],[141,34],[141,37],[138,34]]]`)。`geoQ.geometry` は 6 つの GeoJSON ジオメトリタイプすべて — `Point`、`MultiPoint`、`LineString`、`MultiLineString`、`Polygon`、`MultiPolygon` を受け付けます(#1696)。`Multi*` バリアントはネストされた GeoJSON 座標をそのまま保持し、`GET` は同じネストされた配列形式で返すため、取得した `geoQ` は変更せずにそのまま `PATCH` で戻すことができます。`Polygon` リングは閉じている必要があります — 最初と最後の位置が**すべての**要素で等しく、3 要素の `[lng, lat, alt]` 位置が使用される場合は高度も含みます(#1644) — そして、穴のあるポリゴン(複数のリング)は `400` で拒否されます。

NGSIv2 サブスクリプションは NGSIv2 の軸順序を保持します(`coords` は `lat,lng`)。これは `GET /v2/entities?coords=` と同じ方法で正規化されるため、サブスクリプションと同等の検索が一致します。軸順序は**サブスクリプションの**発信元 API によって決定され、サブスクリプションが作成されたときに記録されます — そのフィールドが存在する前に作成されたサブスクリプションは、`geoQ` 述語がスキップされ(推測するのではなく)、ジオフィルタリングなしで通知されます。

サブスクリプションの更新は、送信したメンバーのみを置き換えます: `q` を含む `PATCH` は保存された `geoQ` をそのままにし、その逆も同様です。`geoQ` はオブジェクト全体として置き換えられます(したがって、省略された `geoproperty` は継承されるのではなくクリアされます)。`q: ""` を送信すると、属性フィルターが削除されます。

**並行更新(#1593)**: 部分更新はマージ前に保存された subject/notification を読み取る必要があるため、`PATCH` は**楽観的同時実行制御**を使用します — 書き込みは読み取られた `modifiedAt` 値で保護され、負けたライターは再読み取りして再試行します。`SUBSCRIPTION.MAX_UPDATE_RETRIES` 回の試行後も更新が確定しない場合(同じサブスクリプションへの持続的な並行書き込み)、リクエストは **`409 Conflict`** で失敗し、クライアントは再試行する必要があります。このガードがない場合、2 つの同時 `PATCH` が両方とも `2xx` を返し、後の書き込みが前の書き込みを黙って破棄していました。配信統計(`notification.timesSent` / `lastNotification` / `status`)は通知機能によって書き込まれ、このガードの対象では**ありません** — これらは結果整合性があり、配信と同じタイミングで着地する `PATCH` は 1 つのインクリメントを失う可能性があります。

### q / geoQ / scopeQ が通知をフィルタリングする方法

`q`、`geoQ`、および(NGSI-LD のみ)`scopeQ` は、どのサブスクリプションが存在するかだけでなく、**どのエンティティ変更が通知を発火するか**を制限します。`q: "severity>100"`、`geoQ` ポリゴン、または `scopeQ: "/Madrid/#"` を持つサブスクリプションは、述語を満たすエンティティへの変更に対してのみ通知されます。

セマンティクスと現在の制限:

| Aspect                          | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Evaluation                      | The changed entity is re-evaluated against the same MongoDB predicate builder used by `GET /ngsi-ld/v1/entities`, so the **predicate semantics** (operators, geo handling, scope rules) are identical to search. Results can still differ from a concurrent search because the predicate is evaluated against current state while the notification payload comes from the event — see **Ordering** / **Timing** below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Invalid `q` / `geoQ` / `scopeQ` | **NGSI-LD only**: rejected at create/update time with `400` (`georel` enum, coordinate bounds, `georel`+`geometry`+`coordinates` must be given together; `scopeQ` runs through the same `parseScopeQuery` used at evaluation time). NGSIv2 subscriptions are not strictly validated, because the predicate builder does not yet implement NGSIv2's `lat,lon` `coords` order or its `attr:value` `q` form (`scopeQ` does not exist in NGSIv2). Subscriptions whose expression cannot be parsed at evaluation time are notified **without** filtering, and the failure is logged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Delete events                   | `EntityDeleted` is **not** filtered by `q` / `geoQ`. The entity no longer exists, so the predicate cannot be evaluated; suppressing the event would silently hide deletions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `noLongerMatching`              | Not implemented as a distinct transition — a subscription is notified while its predicate matches, and stops being notified when it does not                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Ordering                        | Because the predicate is evaluated against current state while the payload comes from the event, rapid consecutive updates can deliver a payload that no longer satisfies the filter, or (in the reverse order) suppress the change that did match. Orion-LD, which evaluates in-line, does not have this gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Duplicates                      | Notifications are at-least-once. On a transient failure the event is redelivered; SQS FIFO de-duplication absorbs re-sends inside a 5-minute window, so a redelivery later than that can duplicate an already-sent notification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Timing                          | The predicate is evaluated against the entity's state at evaluation time. A change applied between publication and evaluation can flip the decision. If the entity is gone (deleted / TTL-expired / soft-deleted) by then, the predicate is treated as **not evaluable** and the notification is sent rather than silently dropped                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Encrypted tenants               | Encrypted entities store their attributes in an opaque envelope, so a `q` predicate (and a `geoQ` on a non-`location` GeoProperty) cannot be evaluated. Such subscriptions are notified **without** filtering, and this is logged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `!=` and `!attr`                | Evaluated exactly as `GET /entities` does, where a missing attribute satisfies `!=`. Orion-LD treats comparisons against a missing attribute as false, so results can differ for these operators                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Rule-triggered notifications    | ReactiveCore rules always name their target subscriptions explicitly (`subscriptionIds`), and on that path `q` / `geoQ` are **not** applied — the rule's own condition (CEL) decides which entities fire                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Cost bound                      | Evaluations are de-duplicated per unique expression per event and capped (`SUBSCRIPTION.MAX_EXPRESSION_EVALUATIONS_PER_EVENT`); at most `SUBSCRIPTION.MAX_CONCURRENT_EXPRESSION_EVALUATIONS` run concurrently. Beyond the cap, subscriptions are notified without filtering and the truncation is logged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| servicePath                     | A subscription is matched only against entity changes in the **same** servicePath (exact match), on both the AWS and standalone paths (#1587)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| throttling / cooldown           | `throttling` (FIWARE, min seconds) and `cooldown` (GeonicDB extension) are both enforced on the entity-change notification path (#1589). Enforcement is an **atomic claim**: at match time (after `q`/`geoQ`) the broker does one `findOneAndUpdate` that both checks the window and stamps the window clock, so only the winning event of a burst is delivered — the check and the record cannot race. **The window clock is a dedicated server-only field** (`lastThrottledAt` for throttling, `lastTriggered` for cooldown), intentionally separate from the FIWARE display field `notification.lastNotification`: this keeps delivery retries from refreshing the window, and prevents a client-supplied `lastNotification` from poisoning the guard. `notification.lastNotification` remains the spec-visible "last notification timestamp" and is stamped at delivery time by the outcome recorder (so it advances even for rule-triggered notifications, which are not claimed/throttled). Delivery-outcome recording (`notification.status` / `lastSuccess` / `lastFailure` / `timesSent` / `lastNotification`) does **not** touch the window clock, so a successful delivery and its retries do not refresh the window (the AWS and standalone paths behave identically). The clock is stamped at claim time (just before delivery); if delivery then **fails** the window is **released** (the clock is cleared) so a retry or the next event can re-claim — a send failure does not burn the window (AWS path retries the event; standalone reopens for the next event). The residual lossy case is a process crash between claim and release; monitor delivery health via `notification.status` / `lastFailure`. Both are a **single per-subscription budget**: rule-triggered notifications go through the explicit-`subscriptionIds` path and are not claimed/throttled |

### スコープフィルタリング (scopeQ) とラウンドトリップのみのフィールド (temporalQ / lang)

`scopeQ`(NGSI-LD のみ)は保存され、`GET` によって返され、**通知フィルターとして評価されます** — `q` / `geoQ` と同じ方法で、`GET /ngsi-ld/v1/entities?scopeQ=` と同じ `parseScopeQuery` 述語ビルダーを使用します。`scopeQ: "/Madrid/#"` を持つサブスクリプションは、`scope` が一致するエンティティへの変更に対してのみ通知されます。これは `q` / `geoQ` と同じ方法で作成/更新時に検証され(不正な `scopeQ` は `400` で拒否されます)、上記の表で説明されているのと同じコスト制限/重複排除/フェイルオープン動作に参加します(同じ式ごとのキャッシュキーに `q` / `geoQ` と一緒に組み込まれます)。

`temporalQ` と `lang` は受け付けられ、永続化され、`GET` によって返されますが、通知マッチングには**適用されません**(#1588)。これは意図的なもので、後で埋めるべきギャップではありません:


* `temporalQ` は**履歴を取得する**ための時間範囲を記述します(`timerel` / `timeAt` / `endTimeAt`)。単一の変更通知イベントには比較対象となる「時間範囲」がないため、イベントごとの述語としての意味がありません。
  
* `lang` は、エンティティを返すときにどの `LanguageProperty` 値を選択するかのレンダリングヒントであり、変更が満たすかどうかの条件ではありません。

### 通知属性フィルタリング

**特定の属性のみ通知:**

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

**変更された属性のみ通知:**

```json
{
  "notification": {
    "onlyChangedAttrs": true
  }
}
```

**統一された NGSI-LD プロジェクション (`pick` / `omit`):**

ETSI GS CIM 009 (clause 4.21) に従い、`notification.pick` は含める属性を選択し、
`notification.omit` は除外する属性を選択します。これらは、レガシーの `attributes` (含める) / `exceptAttrs` (除外) セレクターとまったく同じように通知ペイロードに適用されます:

```json
{
  "notification": {
    "pick": ["temperature", "humidity"]
  }
}
```

```json
{
  "notification": {
    "omit": ["metadata", "internalId"]
  }
}
```

**レスポンスのシリアライゼーション (非対称性に注意):** `GET` / `List` レスポンスは、作成時にどのエイリアスが使用されたかに関係なく、常に保存されたプロジェクションを ETSI 正規フィールド名でシリアライズします:


* **含める** プロジェクションは `notification.attributes` として返されます (`pick` ではありません);
  
* **除外** プロジェクションは `notification.omit` として返されます (`exceptAttrs` ではありません)。

したがって、`pick` でサブスクリプションを作成したクライアントは、レスポンス内の
`notification.attributes` の下に選択内容を見つけることになり、`exceptAttrs` を使用したクライアントは
`notification.omit` の下に見つけることになります。両方のレスポンスフィールド名は入力時にも受け入れられます (それらは同じ内部の含める / 除外プロジェクションにマッピングされます)。したがって、`GET` → 編集 → `PATCH` のラウンドトリップはプロジェクションを保持します。

**`PATCH` でプロジェクションをクリアする (JSON Merge Patch, #1635):**

サブスクリプション更新は JSON Merge Patch (RFC 7396 / ETSI GS CIM 009 clause 5.8.2) に従います。通知プロジェクションセレクター (`pick` / `omit` / `attributes` / `attrs` / `exceptAttrs`) については、これは 3 つの状態を意味します:

| PATCH input                                 | Effect                                                                             |
| ------------------------------------------- | ---------------------------------------------------------------------------------- |
| selector **omitted**                        | keep the existing projection (endpoint/format-only updates never widen delivery)   |
| selector = **array**                        | replace the projection (include ↔ exclude switch allowed)                          |
| selector = **`null`** (e.g. `"pick": null`) | **clear** the projection — the subscription goes back to delivering all attributes |

```json
PATCH /ngsi-ld/v1/subscriptions/{id}
{
  "notification": {
    "pick": null,
    "endpoint": { "uri": "http://receiver.example.com/notify" }
  }
}
```

`null` は *クリア* 信号であり、含める / 除外の排他性チェックから免除されます:同じリクエストで `pick: null` を `omit` 値と一緒に送信して、含めるプロジェクションをクリアし、除外プロジェクションを設定できます。空の配列 `[]` はクリアメカニズムでは**ありません** (すべてのセレクターは空でない配列を必要とします) — クリアするには `null` を使用してください。これがないと、一度設定されたプロジェクションはサブスクリプションを削除して再作成することでしか削除できませんでした。

### Subscription @context を用いた通知 `type` のレンダリング (NGSI-LD, #1687)

NGSI-LD サブスクリプションでは、通知 `data[]` 内の各エンティティの `type` は、**サブスクリプション自身の `@context`**(作成・更新時に保存されたもの)を使ってレンダリングされます。これは ETSI GS CIM 009 §5.5.7 の「出力時に compact すべき」という規則に従ったもので、正規の FQN 形式(term definition によってマッピングされた絶対 IRI、#1657 参照)で保存された type は、配信前に**短い term に compact** されます。これはエンティティ変更通知とルールトリガー通知の両方に適用されます。配信時にサブスクリプションの `@context` が解決できない場合は、フォールバックとして FQN が送信されます。bare(コア `@vocab`)type は以前と同様に変更されずに配信されます。

> **⚠️ 破壊的変更(受信側、#1687)**:絶対 IRI にマッピングされた type については、以前の通知では `data[].type` に FQN が公開されていましたが、現在は compact された短い term が含まれます。FQN で分岐する受信クライアント(例:geonicdb-cli / geonicdb-pulse)は見直しが必要です — #1725 で追跡されています。WebSocket イベントストリーミングパスは現在 compact **されておらず**、保存された(FQN)形式のまま配信されます。

### 通知 `jsonldContext` (NGSI-LD, #1847 / #1801)

NGSI-LD Subscription には、通知用のトップレベル `jsonldContext` を指定できます。これは **dereferenceable URI 文字列**(ETSI Table 5.2.12-1: `String | Dereferenceable URI | 0..1`)で、通知送出時に使う `@context` を明示的に上書きするためのフィールドです。


* `jsonldContext` 未指定時は、購読自体の `@context` で初期化されます (clause 5.8.1.4)
  
* 指定値が不正な URI の場合は `400 BadRequestData`
  
* URI が取得不能な場合は `504 LdContextNotAvailable`
  
* レスポンス (`GET /ngsi-ld/v1/subscriptions*`) では、`jsonldContext` が**文字列のときのみ**返ります
  
* リクエスト `@context` に含まれるインライン object/array は `jsonldContext` の文字列として表現できないため、レスポンスでは省略されます
  
* **`PATCH` で適用した `@context` も既定値になります (#2029)**。`PATCH /ngsi-ld/v1/subscriptions/{id}` はリクエスト `@context` を照合用 (`matchJsonldContext`) に保存するため、`jsonldContext` を明示していない購読では**その値**が通知の語彙になります (clause 5.8.1.4 の "the `@context` used for the subscription")。既定値の解決は `resolveNotificationJsonldContext`(`src/core/subscriptions/notification-context.ts`) の 1 箇所にあり、**封筒の `@context`・型名の compaction・属性名の compaction がすべて同じ値**を使います。明示指定した `jsonldContext` は `PATCH` では上書きされません
  
* **`csourceSubscriptions` でも同じフィールドが使えます (#2025)**。`POST` / `PATCH /ngsi-ld/v1/csourceSubscriptions` は `jsonldContext` を保存し、`GET` で返し、`ContextSourceNotification` の封筒に適用します。未指定なら購読作成・更新時の `@context` が既定になります (通常購読と同じ写像)

### 通知本文の形式 (NGSI-LD vs NGSIv2, #1765)

通知本文は、イベントのプロトコルではなく、**サブスクリプションの**プロトコルから構築されます。

**NGSI-LD サブスクリプション**は ETSI `Notification` (GS CIM 009 clause 5.2.13) を配信します。その必須メンバーは `id` (URI — GeonicDB は配信ごとに `urn:ngsi-ld:Notification:<uuid>` を生成)、`type` (`"Notification"`)、`subscriptionId`、`notifiedAt`、`data` です。`data[]` 内の各エンティティは、`notification.format` で選択された NGSI-LD 表現 (デフォルトは `normalized`、clause 5.2.14 による) でレンダリングされます。

| `notification.format`  | `data[]` attribute shape                                                                                                                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `normalized` (default) | `{"temperature": {"type": "Property", "value": 32.5}}` — attribute `type` is `Property` / `Relationship` (with `object`) / `GeoProperty` / `LanguageProperty` …                                                             |
| `concise`              | `{"temperature": 32.5}`, or `{"value": 32.5, "<subAttr>": …}` when sub-attributes are present (sub-attribute rendering itself is still normalized — see the known gaps below)                                               |
| `keyValues`            | `{"temperature": 32.5}` — values only, no type information or sub-attributes. Multi-attributes become a `dataset` map: `{"temperature": {"dataset": {"@none": 32.5, "urn:ngsi-ld:Dataset:a": 30.1}}}` (clause 4.5.4, #1930) |

`showChanges` は、`normalized` / `concise` において型固有の previous-member (previous **value/object**、アンラップされたもの) を追加します。`keyValues` はサブ属性を表現できないため、すべての previous-member はそこでは省略されます。

**マルチ属性**の場合、previous-member は `datasetId` でペアリングされた**インスタンスごと**に付加されます (ETSI GS CIM 009 clause 4.5.2.3 は `previousValue` を Property インスタンスのメンバーとし、clause 4.5.5 はインスタンスを `datasetId` で識別します — 配列位置では決して識別しません、#1813)。


* 変更前に `datasetId` が存在していたインスタンスは、独自の previous-member を持ちます。
  
* **新規**のインスタンス (同じ `datasetId` の下に対応するものがない) は、previous-member を**持ちません** — 存在しなかったものに対する「以前の値」はありません。
  
* 値が変更されなかったインスタンスでも、現在の値と等しい previous-member を持ちます。なぜなら、`changedAttributes` は属性名の粒度しか持たず、それを省略すると #1813 が修正した「何も変更されていないように見える」というギャップが再現されてしまうからです。
  
* 形状は**現在**の状態に従います。属性が現在単一のインスタンスである場合、出力は単一のオブジェクトのままであり、配列に変換されません。

| Attribute type                     | Previous-member                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| `Property`                         | `previousValue`                                                                                  |
| `GeoProperty`                      | `previousValue` (no dedicated name in ETSI Table 5.2.7)                                          |
| `TemporalProperty`                 | `previousValue` (fallback; clause 4.8 defines no previous-member)                                |
| `Relationship`                     | `previousObject`                                                                                 |
| `LanguageProperty`                 | `previousLanguageMap`                                                                            |
| `VocabProperty` (`vocab` shape)    | `previousVocab`                                                                                  |
| `VocabProperty` (`vocabMap` shape) | `previousVocabMap` (**GeonicDB extension**; `vocabMap` itself is not defined in ETSI GS CIM 009) |
| `ListProperty`                     | `previousValueList`                                                                              |
| `ListRelationship`                 | `previousObjectList`                                                                             |
| `JsonProperty`                     | `previousJson`                                                                                   |

`VocabProperty` の場合、previous-member 名は**古いインスタンスの形状**から選択されます。以前の `vocab` 値は `previousVocab` を使用し、以前の `vocabMap` 値は `previousVocabMap` を使用します。

**NGSIv2 サブスクリプション**は Orion 互換の本文を維持します — NGSIv2 表現での `subscriptionId` + `data[]` (属性 `type` は値の型: `Number` / `Text` / …) — `id` / `type` の Notification エンベロープは**ありません**。`notifiedAt` と `triggerReason` はそのパスでの GeonicDB 拡張です。

`protocol` フィールドが存在する前に作成されたサブスクリプション (#1570) はプロトコルを持ちません。それらは、どちらかの形式に推測されるのではなく、レガシー (内部) 形式のまま変更されずに配信されます。

両方の配信ルート — Lambda パイプライン (`matcher` → SQS → `notifier`) と standalone/docker のインプロセスサービス — は、エンティティ変更とルールトリガー通知の両方において、**同じ**共有関数 (`formatNotificationData` / `buildNotificationBody`) を通じて本文を構築するため、2つのルートが乖離することはありません。

### コンテキストソース登録通知 (CSource サブスクリプション、#1837)

NGSI-LD コンテキストソース登録サブスクリプション (`/ngsi-ld/v1/csourceSubscriptions`) の場合、変更通知は `"Notification"` ではなく `type: "ContextSourceNotification"` (ETSI GS CIM 009 Table 5.3.2-1) を使用します。`Ngsild-Trigger` ヘッダーは依然として変更クラス (`csourceRegistration-created|updated|deleted`) を示し、`id` は既存の GeonicDB プレフィックス契約 (`urn:ngsi-ld:Notification:`) による有効な URI であり続けます。

**既知のギャップ** (個別に追跡されており、#1765 では対処されていません):

| Gap                                                                                                                                                                                                                                                                                                          | Issue                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `concise` is not fully concise: it drops the reserved sub-attributes `unitCode` / `observedAt` / `datasetId`, and renders user-defined sub-attributes in normalized form (a sub-Property should collapse to its bare value). Not notification-specific — `GET /entities?format=concise` behaves the same way | [#1779](https://github.com/geolonia/geonicdb/issues/1779) |

以下の両方のギャップは Epic [#1979](https://github.com/geolonia/geonicdb/issues/1979) の PR-F によってクローズされ、以下の「通知 `@context`」と「NGSIv2 `attrsFormat`」に文書化されています。NGSIv2 `attrsFormat` が通知本文に適用されるようになり ([#1780](https://github.com/geolonia/geonicdb/issues/1780))、NGSI-LD 通知は `@context` を持つようになりました ([#1841](https://github.com/geolonia/geonicdb/issues/1841) / [#1781](https://github.com/geolonia/geonicdb/issues/1781))。

### 通知 `@context` (#1841)

ETSI GS CIM 009 clause 5.8.1.4 は、サブスクリプションの `jsonldContext` を使用して通知を送信することを要求しています。それが指定されていない場合は、サブスクリプションに適用可能な `@context` が使用されます(clause 5.5.5 — 最低限コア `@context`)。GeonicDB は、`notification.endpoint.accept` によって選択され、これを正確に一度配信します:

| `accept`                          | Delivery                                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| `application/ld+json`             | `@context` member in the notification body                                         |
| `application/json` (default)      | `Link` header (`rel="http://www.w3.org/ns/json-ld#context"`)                       |
| MQTT endpoints                    | `@context` member in the body (MQTT has no headers)                                |
| `httpCustom` (`payload` / `json`) | neither — the body is user-defined, so claiming a `@context` for it would be wrong |

両方が同時に送信されることはありません。2 つの真実のソースがあると、受信者がアクティブな `@context` について意見が一致しなくなる可能性があります(リクエスト側の clause 6.3.5 "No mixes" と同じ理由)。これは、GeonicDB 自体が付加するコンテキストを制約します — `notification.endpoint.receiverInfo` は独自の `Link` ヘッダーを追加する場合がありますが、これは生成されたコンテキスト `Link` に追加されます(決して置き換えられません)。

`jsonldContext` 自体は、単一の参照可能な URI 文字列のみを受け入れます。インラインオブジェクトまたは混合 URL/インライン配列は、サブスクリプションリクエストの `@context`(`jsonldContext` が省略された場合に使用される)を通じてのみ通知パスに到達できます。このようなコンテキストは `Link` ヘッダーで完全に運ぶことができないため、`application/json` の場合でもボディに配置されます — URL 部分のみを出力すると、インラインで定義された用語が暗黙的に削除されてしまいます。

`ContextSourceNotification`(`csourceSubscriptions` の登録変更通知)は同じルールに従います(#2025)。`@context` はサブスクリプションの `jsonldContext`、または csource サブスクリプションが作成/更新されたときに適用された `@context` であり、`endpoint.accept` は上記と同様にボディ対 `Link` ヘッダーを選択します。#2025 以前は、`accept` に関係なく、常にボディ内のコア `@context` でした。

`data[]` 内の属性名は同じ `@context` で圧縮されます(clause 5.5.7、#1788)。そのため、通知とその `@context` で発行された `GET` は、属性を同じようにスペルします。完全修飾 IRI として保存された名前は圧縮されます。ベアな保存名はそのまま残されます(変更イベントはエンティティの `attrNameForm` を運ばないため、それらを展開するとレガシーの短い名前が IRI に変わる可能性があります)。これはエンティティの `type` 圧縮が既に従っているのと同じルールです。

NGSIv2 サブスクリプションは、`@context` メンバーまたは `Link` ヘッダーを受信しません。

### NGSIv2 `attrsFormat` (#1780)

`attrsFormat` は通知ボディの形状を選択し、NGSIv2 HTTP 通知の `Ngsiv2-AttrsFormat` ヘッダーにエコーされます:

| `attrsFormat`          | `data[]` element                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| `normalized` (default) | `{"id": ..., "type": ..., "temperature": {"type": "Number", "value": 25}}`                          |
| `keyValues`            | `{"id": ..., "type": ..., "temperature": 25}`                                                       |
| `values`               | `[25]` — values only, ordered by `notification.attrs` (attribute name order when `attrs` is absent) |

`protocol` フィールドが存在する前に作成されたサブスクリプション(#1570)は、レガシーの normalized 形状のままです。それらの API プロトコルは判定できず、推測すると受信者が既に解析しているボディが書き換えられてしまいます。同じ理由で、それらは `Ngsiv2-AttrsFormat: normalized` を受信し続けます。

`httpCustom`(`payload` / `json`)がボディを定義する場合、ヘッダーは `custom` になり、Orion と一致します("If text based or JSON payloads are used ... then `Ngsiv2-AttrsFormat` header is set to `custom`")。

**NGSI-LD サブスクリプションはこのヘッダーを受信しません。** その語彙(`normalized` / `keyValues` / `values`)は NGSIv2 のものです。これを使用して NGSI-LD 表現(`normalized` / `concise` / `keyValues`)を記述すると、受信者に誤った情報を与えることになります。#1780 まで、ヘッダーはハードコードされた `normalized` で全ての通知に送信されており、NGSI-LD 通知が NGSIv2-normalized であると主張していました。

### 作成/更新時のフィールド検証

ETSI GS CIM 009(clause 4.21 / 5.8.1)によれば、一部のサブスクリプションフィールドは組み合わせることができません。これらは作成/更新時に `400 BadRequest` で拒否されます(意味が未定義のサブスクリプションを作成するのではなく):

| Rule                                                                                                  | Reason                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `throttling` ⊥ `timeInterval`                                                                         | These are distinct operating modes: `throttling` sets a minimum interval between change-triggered notifications, `timeInterval` sends periodic notifications. |
| At most one include selector (`notification.pick` / `notification.attributes` / `notification.attrs`) | The include-style attribute selectors are mutually exclusive; `pick` and `attributes`/`attrs` map to the same internal include projection.                    |
| At most one exclude selector (`notification.omit` / `notification.exceptAttrs`)                       | The exclude-style attribute selectors are mutually exclusive; `omit` and `exceptAttrs` map to the same internal exclude projection.                           |
| Include ⊥ exclude                                                                                     | An include selector cannot be combined with an exclude selector (`pick`/`omit` are mutually exclusive per clause 4.21).                                       |

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

### 1. Configure Conditions Appropriately

**❌ 悪い例:すべてのエンティティを監視する**

```json
{
  "subject": {
    "entities": [{ "idPattern": ".*" }],
    "condition": { "attrs": [] }
  }
}
```

通知の量が過剰になり、システムに負荷がかかります。

**✅ 良い例:特定のタイプと条件で絞り込む**

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

### 2. Configure Throttling

`throttling`(秒単位)を設定して、過剰な通知を防ぎます:

```json
{
  "throttling": 60
}
```

これにより、同じエンティティの変更通知が 60 秒に 1 回に制限されます。

### 3. Set an Expiry

テストサブスクリプションには `expires` を設定します:

```json
{
  "expires": "2026-12-31T23:59:59.000Z"
}
```

### 4. Notify Only Changed Attributes

不要な通知を減らします:

```json
{
  "notification": {
    "onlyChangedAttrs": true
  }
}
```

### 5. Status Management

`inactive` に設定して一時的に通知を停止します:

```bash
curl -X PATCH http://localhost:3000/v2/subscriptions/{id} \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: demo" \
  -d '{ "status": "inactive" }'
```

### 6. Error Handling

通知先エンドポイントで以下を実装します:

* **2xx ステータスコードを返す**:成功を示すため
  
* **リトライロジック**:一時的な障害に対処するため
  
* **タイムアウト設定**:長時間のハングを防ぐため

***

## アクセス制御と所有権 (GeonicDB 拡張)

> **注意**: `super_admin` はサブスクリプションエンドポイント (`/v2/subscriptions`、`/ngsi-ld/v1/subscriptions`) にアクセスできません。これらはデータ API のためです。代わりに `tenant_admin` または `user` ロールを使用してください。

認証が有効な環境では、サブスクリプションに所有権ベースのアクセス制御が適用されます。

### 動作


* サブスクリプションが作成されると、認証されたユーザーの ID が `createdBy` フィールドに記録されます。
  
* **更新 (PATCH) と削除 (DELETE)** は、以下のいずれかの条件を満たすユーザーのみが実行できます:
  
  * サブスクリプションの作成者 (`createdBy` が一致)
    
  * `tenant_admin` ロール
    
* 上記の条件が満たされない場合、**403 Forbidden** が返されます。
  
* **取得 (GET) とリスト表示 (LIST)** は、同じテナント内の任意の認証されたユーザーに対して制限なく実行できます。

> **注意**: 同じ所有権検証がレジストレーション (`/v2/registrations`、`/ngsi-ld/v1/csourceRegistrations`) にも適用されます。

### サブスクリプション書き込みに対する XACML 属性ベース制御 (#1104 / #2005)

すべてのサブスクリプション **書き込み** — 3 つのサブスクリプションリソースすべてにわたる作成*および*更新 — において、XACML PIP はサブスクリプション対象の属性を `AuthzRequest.resource` に注入し、きめ細かなポリシー制御を可能にします:

| Resource                     | Create                                  | Update                                        |
| ---------------------------- | --------------------------------------- | --------------------------------------------- |
| NGSI-LD subscriptions        | `POST /ngsi-ld/v1/subscriptions`        | `PATCH /ngsi-ld/v1/subscriptions/{id}`        |
| Context source subscriptions | `POST /ngsi-ld/v1/csourceSubscriptions` | `PATCH /ngsi-ld/v1/csourceSubscriptions/{id}` |
| NGSIv2 subscriptions         | `POST /v2/subscriptions`                | `PATCH /v2/subscriptions/{id}`                |

| Resource attribute     | Source field (NGSI-LD / csource) | Source field (NGSIv2)                                             | Example use                                                                                                 |
| ---------------------- | -------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `entityType`           | `entities[].type`                | `subject.entities[].type`                                         | "Anonymous can subscribe only to `ActivityLog`"                                                             |
| `entityId`             | `entities[].id`                  | `subject.entities[].id`                                           | Restrict to specific entity IDs                                                                             |
| `entityIdPattern`      | `entities[].idPattern`           | `subject.entities[].idPattern`                                    | Restrict by id pattern                                                                                      |
| `notificationEndpoint` | `notification.endpoint.uri`      | `notification.http` / `httpCustom` / `mqtt` / `mqttCustom` `.url` | "Notifications may only be posted to `https://*.example.com/**`" — defence against SSRF / data exfiltration |

`entities[]` に複数の要素が含まれる場合、書き込みが成功するには**すべての要素が許可 (Permit) される必要があります**(全許可セマンティクス)。単一の不一致な型または id パターンがあると、リクエスト全体が `403 Forbidden` で拒否されます。

サブスクリプションは継続的な読み取りであるため、更新は**更新後の有効値**で評価されます:リクエストボディが宣言する値、または — ボディがそれらに触れない場合 — すでに保存されている値です。したがって、制限された呼び出し元は、許可されたサブスクリプションを制限された型に切り替えることも、他のフィールドのみを編集することで現在制限されているサブスクリプションを維持することもできません。制限されたサブスクリプションを許可された型に絞り込むことは許可されます。

> リテラル `body.type === "Subscription"` は `entityType` に伝播**されません**。ポリシーはラッパーオブジェクトの型ではなく、`entities[].type` をターゲットにする必要があります。
>
> `path` を `/ngsi-ld/v1/subscriptions` に対して正確に一致させるポリシーは、作成呼び出しのみをカバーします。更新もカバーするには glob (`/ngsi-ld/v1/subscriptions**`) を使用してください — `*` は `/` を越えません。

認証と認可の詳細については、[AUTH.md § Subscription PIP attributes](../reference/auth.md#subscription-pip-attributes) を参照してください。

***

## トラブルシューティング

### 1. 通知が配信されない

**原因:**

* 条件式が一致しない
  
* 通知先 URL に到達できない
  
* サブスクリプションが `inactive` であるか、有効期限が切れている

**確認方法:**

```bash
# Check subscription details
curl http://localhost:3000/v2/subscriptions/{id} \
  -H "Fiware-Service: demo"

# Check status, expires, and lastNotification
```

**解決策:**

* 条件式をテストする:エンティティを手動で更新し、条件が満たされることを確認する
  
* 通知 URL をテストする:`curl` で直接到達可能であることを確認する
  
* ステータスを `active` に変更する

### 2. Notifications Are Duplicated

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
  
* `httpCustom` マクロ構文が正しくない

**確認方法:**

```bash
# Check subscription configuration
curl http://localhost:3000/v2/subscriptions/{id} \
  -H "Fiware-Service: demo" | jq '.notification'
```

**解決方法:**

* `attrs` を更新して必要な属性を含める
  
* `attrsFormat` を `normalized` または `keyValues` に変更する
  
* `httpCustom` マクロ構文を検証する(`${attrName}` は属性名と一致する必要があります)

### 4. MQTT Notifications Are Not Being Sent

**原因:**

* MQTT ブローカーに接続できない
  
* 認証情報が正しくない
  
* トピック名が無効

**確認方法:**

```bash
# Test the connection to the MQTT broker (using mosquitto_sub)
mosquitto_sub -h broker.example.com -p 1883 -t "sensors/#" -u username -P password
```

**解決方法:**

* MQTT ブローカーの URL、ポート、および認証情報を検証する
  
* トピック名に特殊文字が含まれていないことを確認する
  
* QoS レベルを 0 に下げてみる

### 5. Subscription Automatically Becomes inactive

**原因:**

* 通知の宛先が継続的にエラーを返している(5xx、タイムアウト)
  
* GeonicDB がサブスクリプションを自動的に無効化した

**解決方法:**

* 通知の宛先エンドポイントのログを確認する
  
* エンドポイントを修正して正しく応答するようにする
  
* サブスクリプションを `active` に戻す

***

## 関連ドキュメント


* [API Common Specification](../api-reference/endpoints.md) - REST API ドキュメント
  
* [API\_NGSIV2.md](../api-reference/ngsiv2.md) - NGSIv2 Subscriptions API リファレンス
  
* [API\_NGSILD.md](../api-reference/ngsild.md) - NGSI-LD Subscriptions API リファレンス
  
* [EVENT\_STREAMING.md](./subscriptions.md) - WebSocket Event Streaming
