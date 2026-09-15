---
title: "NGSI Subscriptions"
description: "HTTP Webhook subscriptions for entity change notifications"
outline: deep
---
# サブスクリプション

GeonicDB のサブスクリプション機能を使用すると、エンティティの変更をリアルタイムで監視し、外部システムに自動的に通知できます。

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


* **センサーデータの監視**: 温度、湿度などのしきい値超過を検出
  
* **位置追跡**: 車両やデバイスの位置変化を追跡
  
* **イベント駆動アーキテクチャ**: エンティティの変更によってトリガーされる自動処理
  
* **データ統合**: 他のシステムへのリアルタイムデータ配信

### サポートされる API

| API     | Endpoint                    | Support |
| ------- | --------------------------- | ------- |
| NGSIv2  | `/v2/subscriptions`         | ✅       |
| NGSI-LD | `/ngsi-ld/v1/subscriptions` | ✅       |

> **注意 (#1304 / #2337)**: ホスト名ルーティングされたデプロイメント(マルチサブドメイン構成の専用 DB)でも購読は発火します。API 経由のエンティティ変更はリクエストスコープでイベントを発行し、発生元デプロイメントの情報(`deployment.hostname`)を運んで背景ワーカーが正しい DB に対してマッチング・通知・状態更新を行います。**制限**: デプロイメント DB への直接 DB 書き込み(API を経由しない変更)はイベントを発火しません。AWS は EventBridge が一次ソース。Standalone の購読は `LocalEventBusPublisher` 一本で、Change Stream は ReactiveCore Rules 専用 — 物理削除で `fullDocument` が取れない Change Stream を購読の一次ソースにすると tenant が `'unknown'` になり沈黙する (#2337)。また、デプロイメント行の登録・有効化はキャッシュ(最大 5 分)の反映後にワーカーへ届きます。

***

## サブスクリプションの仕組み

```text
1. Entity creation/update/delete (via API), published by EntityService through `IEventPublisher`
   — AWS: EventBridge → matcher Lambda
   — Standalone default DB: `LocalEventBusPublisher` → `emitEntityChangeForSubscription` (#2337)
   — Standalone deployment DB: `LocalEventBusPublisher` → `emitEntityChangeForDeploymentWorkers` → subscription workers (#1304)
   — or, for TTL-expired entities (`expiresAt`), claimed and published by the expiry sweeper (#1561)
   ↓
2. SubscriptionMatcher searches for subscriptions matching the conditions
   ↓
3. Notification message is sent to the SQS queue
   ↓
4. NotificationSender sends an HTTP/MQTT notification to the external endpoint
```

**レイテンシ**: API 経由の通常のエンティティ作成/更新/削除ではほぼ即座。TTL 失効の場合、失効スイーパーのポーリング間隔(`ENTITY_EXPIRY.SWEEP_INTERVAL_SECONDS`、[QUOTAS.md](../saas/quotas.md#ttl-失効-expiresat-expiry-sweeper1561) 参照)の最大 \~1 分を加算してから `EntityDeleted` 通知がこのパイプラインに入ります。

### EntityDeleted トゥームストーンと `previousAttributes` (#2439 / #2631 / #2671)

NGSI-LD 削除通知は削除された属性を `urn:ngsi-ld:null` トゥームストーンとしてレンダリングします
(`attributeDeleted` トリガーも発火する場合があります)。どちらも
`EntityDeleted` イベントの `EntityChangeEvent.changes.previousAttributes` を必要とします。

| Source of `EntityDeleted`                                                                                                   | Supplies `previousAttributes`?                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| API delete / purge via `EntityService` (`deleteEntity`, …) (#2337)                                                          | Yes — attributes read before delete                                                                                                                                                                                                                                                  |
| TTL expiry via `EntityExpiryService` ([#1561](https://github.com/geolonia/geonicdb/issues/1561))                            | Yes — claimed document before soft-delete                                                                                                                                                                                                                                            |
| MongoDB Change Stream pre-image (`changeStreamPreAndPostImages`, [#1411](https://github.com/geolonia/geonicdb/issues/1411)) | **Not used.** The CDC `ChangeStreamProcessorFunction` and pre-image enablement were removed in [#1560](https://github.com/geolonia/geonicdb/issues/1560); resurrecting them would double-publish. On standalone, Change Stream remains Rules-only (`CHANGE_STREAM` in `defaults.ts`) |

**[#2631](https://github.com/geolonia/geonicdb/issues/2631) の対応**: #1411 / change-stream 配線がオフのときにトゥームストーンが静かに無効になるという前提は、**現在の main では成立しません**。Context Broker起動時に検出するランタイムフラグは存在せず、pre-image 依存関係が欠けている場合のサブスクリプション作成時の 4xx もありません。TTL 削除の可観測性は #1561 スイーパーですでに fail-loud です: `publishFailures > 0` は Lambda 呼び出しを失敗させ、`ExpirySweeperErrorsAlarm` が発火します([QUOTAS.md](../saas/quotas.md#ttl-失効-expiresat-expiry-sweeper1561) 参照)。

**可観測性のフォローアップ ([#2671](https://github.com/geolonia/geonicdb/issues/2671))**: それでも `EntityDeleted` イベントが `previousAttributes` **なしで**到着した場合(パブリッシャーのバグまたは将来の発行サイト)、マッチャーとスタンドアロン通知機能は **warn** をログに記録するため、トゥームストーン / `attributeDeleted` が静かに空になることはありません。空のオブジェクト `{}`(属性のないエンティティ)は有効であり、warn は**出しません**。別途、単一エンティティの `safePublishEntityChangeEvent` は(スイーパーとは異なり)`logger.error` のみでパブリッシュ失敗を飲み込みます — #2671 で追跡されています。

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

> 上記の例は **NGSIv2** のボディです。NGSI-LD サブスクリプションは ETSI `Notification`(`id` / `type: "Notification"` / `data[]` を `notification.format` によって選択された表現で)を配信します — [Notification Body Shape](#notification-body-shape-ngsi-ld-vs-ngsiv2-1765) を参照してください。

### httpCustom (カスタムテンプレート)

HTTP メソッド、ヘッダー、ペイロードのカスタマイズが可能です。

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

#### httpCustom.json (型保存テンプレート)

`payload` は文字列テンプレートであるため、置換されたすべての値は文字列になります。**属性の型を保持する**必要がある場合(数値は数値のまま、真偽値は真偽値のまま)は、代わりに `httpCustom.json` を使用してください(FIWARE Orion との互換性)。`json` はオブジェクトまたは配列テンプレートを受け入れ、`payload` とは**相互排他的**です。

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


* **単一マクロ値**(`"${temperature}"`)の場合:属性値は元の JSON 型でインライン化されます(数値 → 数値、真偽値 → 真偽値、オブジェクト/配列 → オブジェクト/配列)。存在しない属性は `null` になります。
  
* **部分マクロ値**(`"prefix-${id}"`)の場合:常に文字列を生成します。
  
* **キーは置換されません** — キー内のマクロ(`"${id}": ...`)は `400` エラーで拒否されます。
  
* テンプレートは作成時に制限されます:シリアライズサイズ ≤ `MAX_PAYLOAD_LENGTH`、ネスト深度 ≤ `MAX_JSON_DEPTH`。違反は `400` エラーで拒否されます。
  
* 通知はデフォルトで `Content-Type: application/json` で送信されます。これは `receiverInfo` (カスタムヘッダー)を介してオーバーライドできます。

上記のサブスクリプションに対して配信されるボディの例 (temperature = 25.5, active = true):

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

### Web Push (#3014)

同じ NGSI 通知 JSON ボディを、VAPID を使用してブラウザプッシュサービス (FCM / Mozilla / Apple など) に配信します。**GeonicDB 拡張機能** — FIWARE Orion または ETSI Endpoint の一部ではありません。

**フィールドマッピング (ブラウザ ↔ API):**

| Browser `PushSubscription.toJSON()` | NGSIv2 `notification.webpush`         | NGSI-LD `notification.endpoint` |
| ----------------------------------- | ------------------------------------- | ------------------------------- |
| `endpoint`                          | `url`                                 | `uri`                           |
| `keys.p256dh`                       | `keys.p256dh`                         | `webpush.keys.p256dh`           |
| `keys.auth`                         | `keys.auth`                           | `webpush.keys.auth`             |
| —                                   | `ttl` / `urgency` / `topic` (RFC8030) | same under `webpush`            |

**例 (NGSIv2):**

```bash
curl -X POST http://localhost:3000/v2/subscriptions \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: demo" \
  -d '{
    "description": "Web Push notification",
    "subject": {
      "entities": [{ "type": "Sensor" }],
      "condition": { "attrs": ["value"] }
    },
    "notification": {
      "webpush": {
        "url": "https://fcm.googleapis.com/fcm/send/....",
        "keys": {
          "p256dh": "<87-char base64url>",
          "auth": "<22-char base64url>"
        },
        "ttl": 86400,
        "urgency": "normal"
      }
    }
  }'
```

**例 (NGSI-LD — GeonicDB 拡張機能):**

```json
{
  "type": "Subscription",
  "entities": [{ "type": "Sensor" }],
  "notification": {
    "endpoint": {
      "uri": "https://fcm.googleapis.com/fcm/send/....",
      "protocol": "webpush",
      "webpush": {
        "keys": { "p256dh": "...", "auth": "..." }
      }
    }
  }
}
```

**デプロイ時の VAPID キー** (デプロイごとにグローバル): ENV.md を参照 — `WEBPUSH_VAPID_PUBLIC_KEY` / `WEBPUSH_VAPID_PRIVATE_KEY` / `WEBPUSH_VAPID_SUBJECT` (staging/prod: `geonicdb-<env>` JSON シークレットを `resolveWebPushVapidSecrets()` 経由、#3033; SAM プレーンパラメータはフォールバック)。公開鍵の検出: `GET /.well-known/webpush-vapid-key` → `{ "publicKey": "..." }` (未設定の場合は 503)。

**失敗処理 (#3014 Q6):** 

* Push Service `404` / `410` → 非一時的; サブスクリプションドキュメントの `status` が `failed` になります (エンドポイントが消失 / サブスクリプション解除)。
* `413` → 非一時的; そのメッセージのみを破棄 — サブスクリプションを終了**しません**。
* `401` / `403` → 非一時的; サブスクリプションを永続的に失敗とマーク**しません**。
* その他の 4xx は、`408` / `429` を除き非一時的です。5xx およびネットワークエラーは HTTP と同様にリトライします。

**GET レスポンス:** `keys.auth` は `******` としてマスクされます (MQTT `passwd` と同様)。`keys.p256dh` はクリアで返されます。NGSI-LD レスポンスは `endpoint.webpush` を公開しますが、`endpoint.protocol` は公開**しません** (`webpush` の存在により Web Push と判断)。`csourceSubscriptions` は `webpush` を `400` で拒否します。

#### アプリ実装フロー (#3060)

上記の API はワイヤフォーマットのみをカバーしています。PWA/ブラウザクライアントは次のように接続します:


1. アプリのオリジンに**サービスワーカーを登録**: `await navigator.serviceWorker.register('/sw.js')`。
2. `PushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` 経由で **Push にサブスクリプションライブ**。ここで `applicationServerKey` は、`GET /.well-known/webpush-vapid-key` から取得したデプロイの VAPID 公開鍵を `Uint8Array` に変換したもの (RFC 8291)。
3. `PushSubscription.toJSON()` を上記のフィールドマッピングテーブルに従って `notification.webpush` (NGSIv2) または `endpoint.webpush` (NGSI-LD) に**変換**し、サブスクリプションを `POST` します。
4. `sw.js` で **`push` イベントを処理** — NGSI 通知ボディは `event.data.json()` として到着します; `self.registration.showNotification(...)` を呼び出して OS レベルの通知を表示します。

`@geolonia/geonicdb-sdk` は、完全なアプリフローを `db.registerWebPushSubscription({ protocol, ... })` (#3092) として実装 — ブラウザサブスクリプションライブ + 冪等な GeonicDB 作成 (localStorage ベース; VAPID ローテーション更新は `PATCH` 経由)。デフォルトの

localStorage キーは `baseUrl` + `tenant` + `protocol` のみでスコープされ、ログインプリンシパルでは**スコープされません**(`logout()` はそれをクリアしません)。複数のユーザーが 1 つのプロファイルを共有する**共有ブラウザ / キオスク**では、後の登録が以前のユーザーの `subscriptionId` を再利用し、新しい `subject` / `entities` を無視する可能性があります。SDK はプリンシパルを**自動的に分離しません**。呼び出し側は、デフォルトのスコープを含む明示的な `storageKey` を渡す必要があります(例: `buildWebPushSubscriptionStorageKey(baseUrl, tenant, protocol)` に `:${userId}:${filterId}` を追加)。これにより、共有ブラウザユーザー*と*異なるフィルターが分離されたままになります(#3097)。メールが利用できない場合(API キーセッション)は、`userId` にアプリ管理の安定した ID を使用してください。HTTP 507 (`QuotaExceededError`) は、プランのサブスクリプション猶予上限を超えたことを意味します。未使用のサブスクリプションを削除するか、プランを変更した後にのみ再試行してください — ブラウザの `unsubscribeWebPush()` だけでは GeonicDB ドキュメントは削除されません。低レベルの部品は `db.subscribeWebPush()` + `toNgsiv2WebPushNotification()` / `toNgsiLdWebPushEndpoint()` および `db.unsubscribeWebPush()` のままです — コード付きの完全なウォークスルーについては、SDK.md → Web Push 通知 を参照してください。

### NGSI-LD `notification` は閉じた構造です(#2066)

上記で説明した `http` / `httpCustom` / `mqtt` 通知スタイルとそれらのネストされたフィールド(`httpCustom.json`、MQTT `qos` / `retain` / `user` / `passwd` など)は、**NGSIv2 のみ**です。NGSI-LD サブスクリプションは単一の `notification.endpoint` オブジェクト(`uri` / `accept` / `receiverInfo` / `notifierInfo` — [API\_NGSILD.md → Create Subscription](../api-reference/ngsild.md#create-subscription) を参照)を持ち、`endpoint.uri` の `mqtt://` / `mqtts://` スキームを介して MQTT 配信を選択します。個別の `mqtt` フィールドではありません。**Web Push** は同じ `endpoint` オブジェクトに対する GeonicDB 拡張です(`webpush`; オプションの書き込み専用 `protocol: "webpush"`)。パブリック GET レスポンスには `protocol` は含まれません。

\#2066 以降、`POST` / `PATCH /ngsi-ld/v1/subscriptions` は、**ETSI GS CIM 009 Table 5.2.14-1 で定義されていない `notification` の任意のメンバー**を `400 BadRequestData` で拒否します — `endpoint` で明示的に宣言された GeonicDB 拡張(`webpush` / `protocol`、#3014)を除きます。NGSIv2 形式の `notification.httpCustom` / `notification.http` / `notification.mqtt` を NGSI-LD エンドポイントに送信すると、#2066 以前の動作ではなく、即座に失敗するようになりました。以前は、不明なキーは Zod のデフォルト(strip)検証によって黙ってストリップされ、リクエストは `201` / `204` で成功し、カスタム配信設定は痕跡なく削除されていました。Subscription の**トップレベル** JSON-LD ボキャブラリ拡張は影響を受けません。`notification` のみが閉じられています。

`POST` / `PATCH /ngsi-ld/v1/csourceSubscriptions` も同じように動作します: コンテキストソースサブスクリプションはまったく同じリクエストスキーマを再利用するため、閉じた `notification` はそこにも適用されます。

***

## 条件とフィルタリング

### エンティティ仕様

**特定 ID:**

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

> **パターン制限。** `idPattern` と `typePattern` は通知パス上でエンティティ ID とタイプに対して評価されるため、壊滅的バックトラッキングを引き起こしやすいパターンはサブスクリプション作成時に `400 BadRequest` で拒否されます。これには、ネストされた量指定子 (`(a+)+`) と**量指定されたグループ内の選択肢** (`^(a|aa)+$`、`^((a|aa))+$`) が含まれます — 完全なルールセットについては Regex Pattern Validation (ReDoS) を参照してください。文字クラスと量指定されていないグループは影響を受けません:`^urn:ngsi-ld:(Room|Vehicle):[0-9]+$` と `Room[0-9]+` は受け入れられます。

**タイプパターン (正規表現):**

```json
{
  "subject": {
    "entities": [
      { "idPattern": ".*", "typePattern": "Sensor.*" }
    ]
  }
}
```

`typePattern` は両方の API で受け入れられます。**NGSI-LD サブスクリプションでは `type` と `typePattern` は相互排他的ではありません**:`EntitySelectorSchema` は*少なくとも 1 つ*のセレクタを必要とし、両方が存在する場合、マッチャーは `type` の完全一致と `typePattern` 正規表現を **AND** で評価します。両方とも `GET` で保持されるため (#2067)、取得したサブスクリプションをフィルタを緩めることなく再実行できます。AND セマンティクスは確定された設計です (#2105):NGSIv2 は仕様で義務付けられた排他性を維持し(「両方を同時に使用することはできません」— 両方を指定すると `400 BadRequest` が返されます)、一方 NGSI-LD では、`typePattern` は GeonicDB 拡張であり、両方を AND フィルタとして受け入れます。コンテキストソースサブスクリプション (`/csourceSubscriptions`) は同じセレクタを共有し、同じルールを適用します (#2105):`typePattern` は登録されたエンティティタイプに対して AND で評価され、`typePattern` のみのセレクタが受け入れられ、`typePattern` は `idPattern` と同じ作成時 ReDoS 検証を通過します。登録されたタイプは FQN として保存され (#1800)、パターンは保存された FQN とサブスクリプションのマッチング語彙で圧縮された用語の両方に対してマッチングされます — 書き込み時の `@context` (`contextRef`、サブスクリプションが属性名を保存するときに記録されます (#1900) **または `entities[].typePattern` セレクタ** (#2117))、それ以外の場合はコアコンテキストです。#2117 より前は、エンティティのみの csource サブスクリプションは `contextRef` を記録しなかったため、カスタム語彙に対して書かれた短縮名 `typePattern` はマッチすることができませんでした(回避策はサブスクリプションに属性名を与えることでした);この通常のサブスクリプションとの非対称性 — これは常に `matchJsonldContext` を保存します (#1680) — は解消されました。`entities` のみに触れる `PATCH` は、属性名を保存するサブスクリプションの `contextRef` を上書きすることはありません。なぜなら、その値はそれらの逐語的な名前がレスポンスでどのように圧縮されるかを制御するためです。通知 `@context` (`jsonldContext`) はマッチングには使用されず (#2040)、このパス上のコンテキスト解決はリモートドキュメントを取得することはなく (#1680)、`type` を宣言しない登録エンティティ仕様は `typePattern` によって絞り込まれません(パターン対パターンの `idPattern` ケースと同じ失敗方向です)。NGSIv2 では仕様の一部です;NGSI-LD サブスクリプション (`entities[].typePattern`) では **GeonicDB 拡張** です — ETSI `EntitySelector` には `typePattern` はありません。`type` とは異なり、`typePattern` は `@context` で用語展開**されません** (#1657)。NGSI-LD エンティティのタイプが正規の FQN 形式で保存されている場合(`@context` によって絶対 IRI にマッピングされた用語)、パターンは保存された FQN と**両方**、サブスクリプション自身の `@context` で圧縮された用語に対してマッチングされます。これはこの目的のために作成/更新時に保存されます (#1680) — したがって、短縮名に対して書かれたパターン(例:`Sensor.*`)は、マッピングコンテキストを介して作成されたエンティティとマッチし続けます。

> **NGSI-LD `GET` は各エンティティセレクタを保存された形式で返します (#2067)。** 以前は `typePattern` がレスポンスで `type` に折りたたまれ、タイプ制約が全くないセレクタは作成された `type: "*"` でレンダリングされていました。どちらもラウンドトリップを歪めていました:取得したサブスクリプションボディを新しい `POST` として再実行すると、`^Sensor` のようなパターンがリテラルタイプ名 `^Sensor` に変わりました。`GET` は現在、実際に保存されたセレクタ(`id` / `idPattern` / `type` / `typePattern`)を返し、タイプセレクタが指定されなかった場合は `type` を完全に省略します。

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

NGSI-LD サブスクリプションは `geoQ` も受け入れ、**`GET /ngsi-ld/v1/entities` と同じジオエンジン**で評価されます(`georel` / `geometry` / `coordinates`、オプションの `geoproperty` でデフォルトは `location`):

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

`coordinates` は文字列(`"139.6503,35.6762"`)または GeoJSON 形式の配列のいずれかを受け入れます — 仕様が `LineString` / `Polygon` に使用するネストされた形式を含みます(`[[[138,34],[141,34],[141,37],[138,34]]]`)。`geoQ.geometry` は 6 つの GeoJSON ジオメトリタイプすべてを受け入れます — `Point`、`MultiPoint`、`LineString`、`MultiLineString`、`Polygon`、`MultiPolygon`(#1696)。`Multi*` バリアントはネストされた GeoJSON 座標をそのまま保持し、`GET` は同じネストされた配列形式でそれらを返すため、取得した `geoQ` を変更なしで `PATCH` で戻すことができます。`Polygon` リングは閉じている必要があります — **すべての**要素で最初と最後の位置が等しく、3 要素の `[lng, lat, alt]` 位置が使用される場合は高度を含みます(#1644) — 穴のあるポリゴン(複数のリング)は `400` で拒否されます。

NGSIv2 サブスクリプションは NGSIv2 の軸順序を保持します(`coords` は `lat,lng`)。これは `GET /v2/entities?coords=` が正規化される方法と同じ方法で正規化されるため、サブスクリプションと同等の検索が一致します。軸順序は**サブスクリプションの**元の API によって決定され、サブスクリプションが作成されたときに記録されます — そのフィールドが存在する前に作成されたサブスクリプションは、推測されるのではなく `geoQ` 述語がスキップされます(そしてジオフィルタリングなしで通知されます)。

サブスクリプションを更新すると、送信したメンバーのみが置き換えられます: `q` を含む `PATCH` は保存された `geoQ` をそのままにし、その逆も同様です。`geoQ` はオブジェクト全体として置き換えられます(したがって、省略された `geoproperty` は継承されるのではなくクリアされます)。`q: ""` を送信すると、属性フィルタが削除されます。

**同時更新 (#1593)**: 部分更新はマージする前に保存された subject/notification を読み取る必要があるため、`PATCH` は**楽観的同時実行制御**を使用します — 書き込みは読み取られた `modifiedAt` 値で保護され、負けた書き込み側は再読み取りして再試行します。`SUBSCRIPTION.MAX_UPDATE_RETRIES` 回の試行後も更新が確定できない場合(同じサブスクリプションへの継続的な同時書き込み)、リクエストは **`409 Conflict`** で失敗し、クライアントは再試行する必要があります。このガードがなければ、2 つの同時 `PATCH` は両方とも `2xx` を返し、後の書き込みが前の書き込みを黙って破棄していました。配信統計(`notification.timesSent` / `lastNotification` / `status`)は通知者によって書き込まれ、このガードの対象では**ありません** — これらは最終的に一貫性があり、配信と同時に着信する `PATCH` は 1 回の増分を失う可能性があります。

### q / geoQ / scopeQ が通知をフィルタリングする方法

`q`、`geoQ`、および(NGSI-LD のみ)`scopeQ` は、**どのエンティティ変更が通知を発火するか**を制限するものであり、どのサブスクリプションが存在するかだけを制限するものではありません。`q: "severity>100"`、`geoQ` ポリゴン、または `scopeQ: "/Madrid/#"` を持つサブスクリプションは、述語を満たすエンティティへの変更に対してのみ通知されます。

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
| Creation boundary               | A change that **occurred before the subscription was created** is never notified, even when its asynchronous matching happens to run after the subscription exists (#2068). ETSI GS CIM 009 clause 5.8.6 sends notifications only while the subscription is `active`, and a subscription that did not exist at change time was not active. The guard compares the change's occurrence time with the subscription's `createdAt` and is enforced in `matchesSubscription`, the single chokepoint shared by the AWS and standalone paths. Fail-open: a legacy subscription without `createdAt`, an event without a timestamp, or an exact tie is still notified. On standalone, subscription events take the occurrence time from `EntityService`'s publisher payload (#2337). Change Stream `wallTime` remains the timestamp source only for rules. Rule-triggered notifications (explicit `subscriptionIds`) are not subject to this boundary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| throttling / cooldown           | `throttling` (FIWARE, min seconds) and `cooldown` (GeonicDB extension) are both enforced on the entity-change notification path (#1589). Enforcement is an **atomic claim**: at match time (after `q`/`geoQ`) the broker does one `findOneAndUpdate` that both checks the window and stamps the window clock, so only the winning event of a burst is delivered — the check and the record cannot race. **The window clock is a dedicated server-only field** (`lastThrottledAt` for throttling, `lastTriggered` for cooldown), intentionally separate from the FIWARE display field `notification.lastNotification`: this keeps delivery retries from refreshing the window, and prevents a client-supplied `lastNotification` from poisoning the guard. `notification.lastNotification` remains the spec-visible "last notification timestamp" and is stamped at delivery time by the outcome recorder (so it advances even for rule-triggered notifications, which are not claimed/throttled). Delivery-outcome recording (`notification.status` / `lastSuccess` / `lastFailure` / `timesSent` / `lastNotification`) does **not** touch the window clock, so a successful delivery and its retries do not refresh the window (the AWS and standalone paths behave identically). The clock is stamped at claim time (just before delivery); if delivery then **fails** the window is **released** (the clock is cleared) so a retry or the next event can re-claim — a send failure does not burn the window (AWS path retries the event; standalone reopens for the next event). The residual lossy case is a process crash between claim and release; monitor delivery health via `notification.status` / `lastFailure`. Both are a **single per-subscription budget**: rule-triggered notifications go through the explicit-`subscriptionIds` path and are not claimed/throttled |

### スコープフィルタリング (scopeQ) とラウンドトリップ専用フィールド (temporalQ / lang)

`scopeQ`(NGSI-LD のみ)は保存され、`GET` によって返され、**通知フィルタとして評価されます** — `q` / `geoQ` と同じ方法で、`GET /ngsi-ld/v1/entities?scopeQ=` と同じ `parseScopeQuery` 述語ビルダーを使用します。`scopeQ: "/Madrid/#"` を持つサブスクリプションは、`scope` が一致するエンティティへの変更に対してのみ通知されます。これは作成/更新時に `q` / `geoQ` と同じ方法で検証され(不正な `scopeQ` は `400` で拒否されます)、上記の表で説明されているのと同じコスト制限/重複排除/フェイルオープン動作に参加します(同じ式ごとのキャッシュキーに `q` / `geoQ` と一緒に含まれます)。

`temporalQ` と `lang` は受け入れられ、永続化され、`GET` によって返されますが、通知マッチングには**適用されません**(#1588)。これは意図的なものであり、後で埋めるべきギャップではありません:


* `temporalQ` は**履歴を取得する**ための時間範囲を記述します(`timerel` / `timeAt` / `endTimeAt`)。単一の変更通知イベントには、比較対象となる「時間範囲」がないため、イベントごとの述語としての意味を持ちません。
  
* `lang` は、エンティティを返すときにどの `LanguageProperty` 値を選択するかのレンダリングヒントであり、変更が満たすか満たさないかの条件ではありません。

### 通知属性のフィルタリング

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

**統一された NGSI-LD プロジェクション (`pick` / `omit`):**

ETSI GS CIM 009 (clause 4.21) に従い、`notification.pick` は含める属性を選択し、`notification.omit` は除外する属性を選択します。これらは、レガシーの `attributes` (含める) / `exceptAttrs` (除外) セレクタと全く同じように通知ペイロードに適用されます:

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

**レスポンスのシリアライゼーション (非対称性に注意):** `GET` / `List` レスポンスは、作成時にどのエイリアスが使用されたかに関係なく、常に保存されたプロジェクションを ETSI 標準のフィールド名でシリアライズします:


* **include** プロジェクションは `notification.attributes` として返されます (`pick` ではありません);
  
* **exclude** プロジェクションは `notification.omit` として返されます (`exceptAttrs` ではありません)。

したがって、`pick` でサブスクリプションを作成したクライアントは、レスポンスの `notification.attributes` で選択内容を見つけ、`exceptAttrs` を使用したクライアントは `notification.omit` で見つけることになります。両方のレスポンスフィールド名は、戻る際に受け入れられます (それらは同じ内部の include / exclude プロジェクションにマップされます) ので、`GET` → 編集 → `PATCH` のラウンドトリップでプロジェクションが保持されます。

**`PATCH` でプロジェクションをクリアする (JSON Merge Patch, #1635):**

サブスクリプションの更新は JSON Merge Patch (RFC 7396 / ETSI GS CIM 009 clause 5.8.2) に従います。通知プロジェクションセレクタ (`pick` / `omit` / `attributes` / `attrs` / `exceptAttrs`) については、これは 3 つの状態を意味します:

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

`null` は *クリア* シグナルなので、include/exclude の排他性チェックから除外されます: `pick: null` を `omit` 値と一緒に送信して、include プロジェクションをクリアし、同じリクエストで exclude プロジェクションを設定できます。空の配列 `[]` はクリアメカニズムでは**ありません** (すべてのセレクタは空でない配列を必要とします) — クリアするには `null` を使用してください。これがないと、一度設定されたプロジェクションは、サブスクリプションを削除して再作成することによってのみ削除できます。

### Subscription @context を用いた通知 `type` のレンダリング (NGSI-LD, #1687)

NGSI-LD サブスクリプションでは、通知 `data[]` 内の各エンティティの `type` は、ETSI GS CIM 009 §5.5.7 の「出力時に圧縮すべき」ルールに従い、**サブスクリプション自身の `@context`**(作成/更新時に保存)を用いてレンダリングされます。正規 FQN 形式(用語定義によってマッピングされた絶対 IRI、#1657 参照)で保存された type は、配信前に**短縮形の term に圧縮**されます。これは、エンティティ変更トリガーおよびルールトリガーの両方の通知に適用されます。配信時にサブスクリプションの `@context` が解決できない場合は、フォールバックとして FQN が送信されます。ベア(コア `@vocab`)type は以前と同様に変更されずに配信されます。

> **⚠️ 破壊的変更(受信側、#1687)**: 絶対 IRI にマッピングされた type について、通知は以前 `data[].type` に FQN を公開していましたが、現在は圧縮された短縮 term を含みます。FQN で分岐する受信クライアント(例: geonicdb-cli / geonicdb-pulse)は見直しが必要です — #1725 で追跡中。WebSocket イベントストリーミングパスは現在圧縮**されておらず**、保存された(FQN)形式を配信しています。

### マルチタイプ `data[].type` (NGSI-LD, #2477)

エンティティが複数の Entity Types を持つ場合(clause 4.16 / Table 5.2.4)、通知ペイロードは `data[].type` を **JSON 文字列配列**としてレンダリングします — `GET /ngsi-ld/v1/entities/{id}` と同じルールです。単一の type は文字列のまま(1要素配列にはなりません)。

> **⚠️ 破壊的変更(受信側、#2477)**: `data[].type` が常に文字列であると仮定するクライアントは、マルチタイプエンティティで動作しなくなります。`type` を `string | string[]` として扱ってください(WebSocket イベントの `entityType` も同様 — [EVENT\_STREAMING.md](./subscriptions.md) 参照)。

### 通知 `jsonldContext` (NGSI-LD、#1847 / #1801)

NGSI-LD Subscription には、通知用のトップレベル `jsonldContext` を指定できます。これは
**dereferenceable URI 文字列** (ETSI Table 5.2.12-1: `String | Dereferenceable URI | 0..1`)
で、通知送出時に使う `@context` を明示的に上書きするためのフィールドです。


* `jsonldContext` 未指定時は、購読自体の `@context` で初期化されます (clause 5.8.1.4)
  
* 指定値が不正な URI の場合は `400 BadRequestData`
  
* URI が取得不能な場合は `504 LdContextNotAvailable`
  
* レスポンス (`GET /ngsi-ld/v1/subscriptions*`) では、`jsonldContext` が**文字列のときのみ**返ります
  
* **リクエスト `@context` が 2 要素以上の配列 / インライン object の場合は、それを `ImplicitlyCreated` の
  `@context` として自ホストに払い出し、その serve URL (`<base>/ngsi-ld/v1/jsonldContexts/<localId>`)
  で初期化します (#2250)**。clause 5.13.1 が定める動作そのもので — "when a client creates a
  subscription using an `@context` that is an array, and the broker has to notify with
  Content-Type `application/json`, then the broker needs this `@context` array to be hosted at a
  URL" — Table 5.2.12-1 の型 (Dereferenceable URI) を満たすための手段です。**URI 1 個だけの配列は
  既に dereferenceable なので払い出さず、その URL へ畳みます (#2344)**。**照合用の語彙
  (`matchJsonldContext`) は生の値のまま**保たれ、型セレクタの照合は変わりません。
  \#2250 以前は配列 / インライン object をそのまま保存していたため、URI として表現できず
  レスポンスから `jsonldContext` が**丸ごと省略**されていました (0..1 optional)。
  それ以前に作られた購読 (配列を保持したままの legacy doc) は、いまも応答では省略されます
  
* **`PATCH` で適用した `@context` も既定値になります (#2029 / #2040)**。clause 5.8.1.4 は
  "If not present, the `jsonldContext` field **shall be initialized** with the `@context`
  applicable for the Subscription" と定めており、**保存フィールドへの初期化**です。したがって
  `PATCH /ngsi-ld/v1/subscriptions/{id}` にリクエスト `@context` が付いていて `jsonldContext` が
  まだ未設定なら、**body の形に依らず** (`entities` / `watchedAttributes` / `q` / `description`
  いずれの PATCH でも) その値で初期化されます。#2040 以前は `entities` を含む PATCH の場合だけ
  照合用フィールド経由で効いており、`watchedAttributes` だけの PATCH では通知が core / FQN の
  まま残っていました
  
* **初期化は一度だけです (init-once)**。既に設定済みの `jsonldContext` は、明示指定した値でも
  初期化された値でも、後続の PATCH で上書きされません — clause 5.8.1.4 前段が
  "shall be the one **specified in** the `jsonldContext` field" と明示値の優先を定めており、
  後段の "If not present, …" は明示値を破壊する根拠にならないためです。語彙を切り替えるときは
  `jsonldContext` を明示的に PATCH してください
  
* **core だけを宣言した PATCH (および `application/json` の PATCH) は語彙を変えません**。
  core のみの `@context` は「ユーザー用語を運ばない」ため保存対象になりません (#1620)。
  ここで保存値を消す実装にすると「説明だけ直す PATCH で通知語彙が core に戻る」silent な
  副作用になります
  
* 初期化された値は **`GET /ngsi-ld/v1/subscriptions/{id}` で返ります (#2041)**。clause 5.8.3.5 は
  clause 5.2.12 のとおり購読を返すよう定めており、初期化済みのフィールドはその一部です。
  これにより「通知は独自語彙で来るのに、購読を読んでも通知語彙が判らない」非対称が解消します
  (文字列のときのみ返る規則は上記のとおり)
  
* 規則は 2 箇所に集約されています: 書き込み側 (初期化) が `resolveJsonldContextInit`、
  読み取り側 (既定値の解決) が `resolveNotificationJsonldContext` — どちらも
  `src/core/subscriptions/notification-context.ts`。**封筒の `@context`・型名の compaction・
  属性名の compaction がすべて同じ値**を使います
  
* **通知語彙の初期化は照合語彙 (`matchJsonldContext`) を書き換えません。** 照合語彙が更新されるのは
  `entities` を含む PATCH の場合だけです (#1801 の既存挙動)。通知語彙を初期化する際、
  照合語彙が未設定なら core で固定します。照合語彙は `typePattern` の照合候補
  (保存 FQN + その語彙での短縮名) を決めるため、ここに通知語彙が漏れると**過剰マッチ**に
  なります (#1801 が分離した目的)
  
* **`@context` だけを送る `PATCH` は従来どおり `400 BadRequestData` です。** 通知語彙の初期化は
  「更新可能なメンバ」ではないため、更新メンバが 1 つも無い body は初期化も行わずに拒否されます
  
* **本修正以前に `entities` を含む PATCH で語彙を切り替えた既存購読**は、通知は引き続きその語彙
  ですが (読み取り側フォールバック)、`GET` では `jsonldContext` が省略されたままです。次に
  独自語彙付きの PATCH を受けた時点で初期化されます (能動的なマイグレーションは行いません)
  
* **`csourceSubscriptions` でも同じフィールドが使えます (#2025)**。
  `POST` / `PATCH /ngsi-ld/v1/csourceSubscriptions` は `jsonldContext` を保存し、`GET` で返し、
  `ContextSourceNotification` の封筒に適用します。未指定なら購読作成・更新時の `@context` が
  既定になります (通常購読と同じ写像)

### 通知ボディの形状 (NGSI-LD vs NGSIv2、#1765)

通知ボディは、イベントのプロトコルではなく、**サブスクリプションの**プロトコルから構築されます。

**NGSI-LD サブスクリプション**は ETSI `Notification` (GS CIM 009 clause 5.2.13) を配信し、その必須メンバーは `id` (URI — GeonicDB は配信ごとに `urn:ngsi-ld:Notification:<uuid>` を生成)、`type` (`"Notification"`)、`subscriptionId`、`notifiedAt`、および `data` です。`data[]` 内の各エンティティは、`notification.format` で選択された NGSI-LD 表現でレンダリングされます (デフォルトは `normalized`、clause 5.2.14 による):

| `notification.format`  | `data[]` attribute shape                                                                                                                                                                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `normalized` (default) | `{"temperature": {"type": "Property", "value": 32.5}}` — attribute `type` is `Property` / `Relationship` (with `object`) / `GeoProperty` / `LanguageProperty` …                                                                                                                                                                             |
| `concise`              | `{"temperature": 32.5}`, or `{"value": 32.5, "<subAttr>": …}` when sub-attributes are present (sub-attribute rendering itself is still normalized — see the known gaps below)                                                                                                                                                               |
| `keyValues`            | `{"temperature": 32.5}` — values only, no type information or sub-attributes. Multi-attributes become a `dataset` map: `{"temperature": {"dataset": {"@none": 32.5, "urn:ngsi-ld:Dataset:a": 30.1}}}` (clause 4.5.4, #1930). `simplified` is accepted as the ETSI synonym (Table 5.2.14.1-1, #2103) and normalized to `keyValues` on intake |

`showChanges` は、`normalized` / `concise` において型固有の previous-member (previous **value/object**、unwrapped) を追加します。`keyValues` はサブ属性を表現できないため、すべての previous-member はそこでは省略されます。

**マルチ属性**の場合、previous-member は `datasetId` でペアリングされた**インスタンスごとに**付加されます (ETSI GS CIM 009 clause 4.5.2.3 は `previousValue` を Property インスタンスのメンバーとし、clause 4.5.5 はインスタンスを配列位置ではなく `datasetId` で識別します、#1813):


* 変更前に `datasetId` が存在していたインスタンスは、独自の previous-member を持ちます。
  
* **新しい**インスタンス (同じ `datasetId` の下に対応するものがない) は**何も持ちません** — 存在しなかったものに対する「previous value」はありません。
  
* 値が変更されなかったインスタンスでも、現在の値と等しい previous-member を持ちます。なぜなら `changedAttributes` は属性名の粒度しか持たず、それを省略すると #1813 が修正した「何も変更されていないように見える」ギャップが再現されてしまうからです。
  
* 形状は**現在の**状態に従います。属性が現在単一のインスタンスである場合、出力は単一のオブジェクトのままであり、配列に変換されません。

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

`VocabProperty` の場合、previous-member 名は**古いインスタンスの形状**から選択されます。previous `vocab` 値は `previousVocab` を使用し、previous `vocabMap` 値は `previousVocabMap` を使用します。

**NGSIv2 サブスクリプション**は、Orion 互換のボディ — NGSIv2 表現での `subscriptionId` + `data[]` (属性 `type` は値の型: `Number` / `Text` / …) — を保持し、`id` / `type` Notification エンベロープは**ありません**。`notifiedAt` および `triggerReason` は、そのパスにおける GeonicDB 拡張です。

`protocol` フィールドが存在する前に作成されたサブスクリプション (#1570) は、プロトコルを持ちません。それらは、どちらかの形式に推測されるのではなく、レガシー (内部) 形状のまま変更されずに配信されます。

両方の配信ルート — Lambda パイプライン (`matcher` → SQS → `notifier`) とスタンドアロンのインプロセスサービス (`npm start` / E2E) — は、エンティティ変更およびルールトリガー通知の両方について、**同じ**共有関数 (`formatNotificationData` / `buildNotificationBody`) を通じてボディを構築するため、2 つのルートが乖離することはありません。

### HTTP 配信トランスポート (#2932)

アウトバウンド HTTP 通知 (エンティティサブスクリプション、CSource サブスクリプション、および ReactiveCore `webhook` アクション) は `pinnedRequest` を使用します。Context Brokerはエンドポイントホストを**一度だけ**解決し、SSRF ブロックリストに対してアドレスを検証し、その IP に TCP 接続を固定することで、チェックと接続の間の DNS リバインディングが内部アドレスに到達できないようにします。

**リダイレクトは追跡されません。** `3xx` レスポンスは配信失敗です (ETSI GS CIM 009 V1.8.1 clause 5.8.6 は `200 OK` 以外のステータスをすべて失敗として扱います) 、そして一時的なものとして**再試行されません**。受信者が異なる URL を必要とする場合は、その URL をサブスクリプション / webhook 設定に直接記述してください — 最初のホップからの `301`/`302`/`307`/`308` に依存しないでください。

### マッチングにおけるプロトコル分離 (#2253)

上記の段落はボディの*形状*に関するものです。マッチング自体は別の問題であり、#2253 までは `protocol` を全く見ていませんでした。候補となるサブスクリプションは `tenant` + `servicePath` + `entityTypes` + `status` のみで選択されていました。エンティティはプロトコル分離されており(#964 — NGSIv2 API を通じて作成されたエンティティは NGSI-LD の読み取りからは見えず、その逆も同様)、**変更イベントがその境界を越える唯一のものでした**。`POST /v2/entities` を通じて `Room` を作成すると、`Room` を監視している NGSI-LD サブスクリプションに通知され、逆も同様でした。エラーは発生しませんでしたが、受信者は読み取ることができないエンティティの id、type、および属性値を知ることになりました。

マッチングは現在、サブスクリプションの `protocol`(作成時に記録、#1570)と変更イベントのプロトコルを比較します。サブスクリプションは、それが作成された API を通じて行われた変更に対してのみ発火します。このルールは 2 つの層で強制されます — `findMatchingSubscriptions` における MongoDB プッシュダウンと、両方の配信ルートで共有されるアプリケーション層ガード — プッシュダウンのみでは、呼び出し側がプロトコルを渡し忘れた瞬間に暗黙的に緩くなってしまうためです。

\*\*#1570 以前に作成されたサブスクリプションは `protocol` を持たず、両方のプロトコルにマッチし続けます。\*\*どの API がそれらを作成したかを回復する方法はなく、どちらか一方を選択すると、誤った側の配信が暗黙的に停止します — これは、この変更が閉じようとしているのと同じクラスの事故であり、より大きな影響範囲を持ちます。プロトコル境界を越えることは認可境界を越えることではなく(配信される行は依然として作成者の読み取り述語を通過します、以下を参照)、これらのドキュメントをフェイルオープンのままにすることは、配信を停止するよりもコストが低くなります。意図した API を通じてそのようなサブスクリプションを再作成することで、分離にオプトインするのに十分です。

### コンテキストソース登録通知 (CSource サブスクリプション、#1837)

NGSI-LD コンテキストソース登録サブスクリプション(`/ngsi-ld/v1/csourceSubscriptions`)の場合、変更通知は `type: "ContextSourceNotification"`(ETSI GS CIM 009 Table 5.3.2-1)を使用し、`"Notification"` ではありません。`Ngsild-Trigger` ヘッダーは依然として変更クラス(`csourceRegistration-created|updated|deleted`)を示し、`id` は既存の GeonicDB プレフィックス契約(`urn:ngsi-ld:Notification:`)を持つ有効な URI であり続けます。

**サブスクリプション作成時の初期通知(#1764)。**`csourceSubscription` を作成すると、**マッチする既に登録されたコンテキストソース登録ごとに 1 つの通知**が送信されます(ETSI GS CIM 009 clause 5.11.7)。これがないと、サブスクリプションライバーは次の登録変更まで何も学習しないため、既存のコンテキストソースは見えないままになります。初期通知は変更通知パスを再利用するため、同じマッチングルール、行レベルの読み取りリダクション(#2133)、日次通知クォータ(#1544)、および `@context` 選択(#2025)が適用されます。配信はファイア・アンド・フォーゲットです。初期通知の失敗は `201` をロールバックしません。

**既知のギャップ**(個別に追跡、#1765 では対処されていません):

| Gap                                                                                                                                                                                                                                                                                                          | Issue                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `concise` is not fully concise: it drops the reserved sub-attributes `unitCode` / `observedAt` / `datasetId`, and renders user-defined sub-attributes in normalized form (a sub-Property should collapse to its bare value). Not notification-specific — `GET /entities?format=concise` behaves the same way | [#1779](https://github.com/geolonia/geonicdb/issues/1779) |

以下の両方のギャップは Epic [#1979](https://github.com/geolonia/geonicdb/issues/1979) の PR-F によって閉じられ、以下の「通知 `@context`」および「NGSIv2 `attrsFormat`」に文書化されています。NGSIv2 `attrsFormat` は現在、通知ボディに適用されます([#1780](https://github.com/geolonia/geonicdb/issues/1780))、また NGSI-LD 通知はそれらの `@context` を持ちます([#1841](https://github.com/geolonia/geonicdb/issues/1841) / [#1781](https://github.com/geolonia/geonicdb/issues/1781))。

### 通知 `@context` (#1841)

ETSI GS CIM 009 clause 5.8.1.4 は、通知をサブスクリプションの `jsonldContext` とともに送信することを要求しています。それが与えられていない場合、**フィールドは初期化**され、サブスクリプションに適用可能な `@context`(clause 5.5.5 — 最低限コアの `@context`)が設定されます。仕様が書き込みを義務付けている(「shall be **initialized**」)ため、GeonicDB は作成時およびリクエスト `@context` を持つ任意の `PATCH` 時にそれを初期化します。**その `PATCH` に含まれるメンバーが何であれ**(#2040) — そしてフィールドがまだ設定されていない間のみです(#2029 / #2041)。GeonicDB はそれを `notification.endpoint.accept` によって選択された一度だけ配信します:

| `accept`                          | Delivery                                                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `application/ld+json`             | `@context` member in the notification body                                                               |
| `application/json` (default)      | `Link` header (`rel="http://www.w3.org/ns/json-ld#context"`)                                             |
| `application/geo+json`            | body `@context` by default; `Link` header when `receiverInfo` carries `Prefer: body=json` (clause 6.3.8) |
| MQTT endpoints                    | `@context` member in the body (MQTT has no headers)                                                      |
| `httpCustom` (`payload` / `json`) | neither — the body is user-defined, so claiming a `@context` for it would be wrong                       |

両方が一緒に送信されることは決してありません。2 つの真実の源があると、受信者がアクティブな `@context` について意見が一致しなくなる可能性があります(リクエスト側の clause 6.3.5「混在なし」と同じ理由)。これは GeonicDB 自体が付加するコンテキストを制約します — `notification.endpoint.receiverInfo` は独自の `Link` ヘッダーを追加する可能性があり、それは生成されたコンテキスト `Link` に追加されます(置き換えられることはありません)。

`jsonldContext` 自体は、単一の参照可能な URI 文字列のみを受け入れます。サブスクリプションリクエスト `@context` 内の 1 要素の URI 配列は、その URI に畳み込まれます(#2344) — それはすでに参照可能であるため、`ImplicitlyCreated` コピーは作成されません。インラインオブジェクトまたは混在 / 複数 URL 配列は、サブスクリプションリクエスト `@context`(`jsonldContext` が省略された場合に使用される)を通じてのみ通知パスに到達できます。そのようなコンテキストは完全に `Link` ヘッダーで運ぶことができないため、`application/json` の場合でもボディに配置されます — URL 部分のみを出力すると、インラインで定義された用語が暗黙的に削除されてしまいます。

### GeoJSON 通知 (`accept: application/geo+json`

) — #1762

ETSI GS CIM 009 clause 5.2.15 は `application/geo+json` を `notification.endpoint.accept` が取りうる 3 つの値の 1 つとしてリストしており、clause 6.3.8 は通知バインディングにおいてこれを明示的にカバーしています。したがって GeonicDB は、単に `Content-Type` を設定するだけでなく、**通知ボディを GeoJSON としてレンダリング**します。通常の NGSI-LD `Notification` オブジェクトを運ぶ `Content-Type: application/geo+json` は、ペイロードについての誤った主張となります。

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "urn:ngsi-ld:Store:001",
      "geometry": { "type": "Point", "coordinates": [139.6503, 35.6762] },
      "properties": { "type": "Store", "temperature": 25.5 }
    }
  ],
  "subscriptionId": "urn:ngsi-ld:Subscription:...",
  "notifiedAt": "2026-08-11T00:00:00.000Z",
  "triggerReason": "entityCreated",
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.9.jsonld"
}
```

**clause 6.3.8 はこれを指定していない**ため(MIME タイプと `@context` の場所のみを定義)、形状に関する注意事項:


* トップレベルは `FeatureCollection` であり、clause 6.3.4 が Query Entities に対して定義する GeoJSON 表現と一致します — 通知の `data` メンバーはエンティティのリストです。
  
* `subscriptionId` / `notifiedAt` / `triggerReason` は **RFC 7946 §6.1 foreign members** として保持されるため、GeoJSON にしてもサブスクリプションの識別情報は失われません。
  
* `Notification` メンバーの `id` と `type: "Notification"` は出力**されません**:`type` は GeoJSON によってオブジェクトの種類用に予約されているため、そこに `"Notification"` を書くとボディが無効な GeoJSON になります。
  
* `notification.format` (`normalized` / `concise` / `keyValues`) は適用**されません** — GeoJSON は独自の表現であり、`properties` は簡略化された値を運びます。同じ理由で `showChanges` の `previous*` メンバーは GeoJSON 通知には存在しません;必要な場合は `normalized` または `concise` を使用してください。
  
* Feature の `geometry` は `location` 属性から来ます;それを持たないエンティティは `"geometry": null` を取得します(RFC 7946 に従って有効)。
  
* `properties` 内の属性名とエンティティタイプは、他のすべての通知表現と同様に、通知の `@context` で圧縮されます(clause 5.5.7)。

`accept: application/geo+json` を持つ MQTT エンドポイントは同じ `FeatureCollection` ボディを受信します(エンベロープはトランスポート非依存);clause 6.3.8 の `Link` ヘッダー分岐のみが HTTP 固有です。

`ContextSourceNotification` (`csourceSubscriptions` の登録変更通知)は同じルールに従います(#2025):`@context` はサブスクリプションの `jsonldContext`、または csource サブスクリプションが作成/更新されたときに適用された `@context` であり、`endpoint.accept` は上記とまったく同じようにボディ対 `Link` ヘッダーを選択します。#2025 以前は、`accept` に関係なく、常にボディ内のコア `@context` でした。

`notification.format` は**受け入れられて保持されますが、`ContextSourceNotification` ボディには影響しません**(#2159)。Table 5.3.2-1 は `data[]` を `CSourceRegistration` の配列(カーディナリティ 1)として定義していますが、`normalized` / `concise` / `keyValues` は Entity 表現(clause 4.5)です — それらが選択する登録レンダリングは存在しません。3 つの値すべてが受け入れられ(`simplified` は取り込み時に `keyValues` に正規化されます、#2103)、`GET` によってそのまま返されます;通知ボディはすべてのケースで完全な登録ドキュメントです。#2159 以前は、共有 `NotificationParams` スキーマと OpenAPI ドキュメントがそれを宣言していたにもかかわらず、サービス層は `concise` を `400` で拒否していました。

`data[]` 内の属性名は同じ `@context` で圧縮されるため(clause 5.5.7、#1788)、通知とその `@context` で発行された `GET` は属性を同じように綴ります。完全修飾 IRI として保存された名前は圧縮されます;そのまま保存された名前はそのまま残されます(変更イベントはエンティティの `attrNameForm` を運ばないため、それらを展開するとレガシーのショートネームが IRI に変わる可能性があります)。これはエンティティ `type` の圧縮がすでに従っているのと同じルールです。

NGSIv2 サブスクリプションは `@context` メンバーまたは `Link` ヘッダーを受信しません。

### NGSIv2 `attrsFormat` (#1780)

`attrsFormat` は通知ボディの形状を選択し、NGSIv2 HTTP 通知の `Ngsiv2-AttrsFormat` ヘッダーにエコーされます:

| `attrsFormat`          | `data[]` element                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| `normalized` (default) | `{"id": ..., "type": ..., "temperature": {"type": "Number", "value": 25}}`                          |
| `keyValues`            | `{"id": ..., "type": ..., "temperature": 25}`                                                       |
| `values`               | `[25]` — values only, ordered by `notification.attrs` (attribute name order when `attrs` is absent) |

`protocol` フィールドが存在する前に作成されたサブスクリプション(#1570)は、レガシーの normalized 形状のままです:それらの API プロトコルは判定できず、推測すると受信者がすでに解析しているボディを書き換えてしまいます。同じ理由で `Ngsiv2-AttrsFormat: normalized` を受信し続けます。

`httpCustom` (`payload` / `json`)がボディを定義する場合、ヘッダーは `custom` となり、Orion と一致します(「テキストベースまたは JSON ペイロードが使用される場合 ... `Ngsiv2-AttrsFormat` ヘッダーは `custom` に設定されます」)。

**NGSI-LD サブスクリプションはこのヘッダーを受信しません。** その語彙(`normalized` / `keyValues` / `values`)は NGSIv2 のものです;これを使用して NGSI-LD 表現(`normalized` / `concise` / `keyValues`)を記述すると、受信者に誤った情報を与えることになります。#1780 まで、このヘッダーはハードコードされた `normalized` ですべての通知で送信されており、NGSI-LD 通知が NGSIv2-normalized であると主張していました。

### 通知におけるリンクエンティティ取得 (`notification.join` / `joinLevel`

、NGSI-LD、#2104)

ETSI GS CIM 009 Table 5.2.14.1-1 は `join` と `joinLevel` を NotificationParams メンバーとして定義しています。これらは**通知ペイロード内のリンクエンティティ取得**を制御し、エンティティ読み取り時の `join` / `joinLevel` クエリパラメータと同じセマンティクスを持ちます(clause 4.5.23)。

| Member      | Values                     | Default | Effect on the notification `data`                                                                                                                                                                                                            |
| ----------- | -------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `join`      | `inline`, `flat`, `@none`  | `@none` | `inline`: each Relationship gains an `entity` / `entityList` member holding the target(s) in the notification's own representation format. `flat`: the targets are appended to `data` as independent entities. `@none`: nothing is resolved. |
| `joinLevel` | positive integer (max `5`) | `1`     | Recursion depth. Only meaningful together with `join` — `joinLevel` alone resolves nothing.                                                                                                                                                  |

```json
{
  "type": "Subscription",
  "entities": [{ "type": "Room" }],
  "notification": {
    "format": "normalized",
    "join": "inline",
    "joinLevel": 1,
    "endpoint": { "uri": "http://example.com/notify" }
  }
}
```

両メンバーは永続化され、`GET /ngsi-ld/v1/subscriptions{,/{id}}` によって返されます。未設定のメンバーはデフォルト値で具現化**されません**。そのため、join を要求しなかったサブスクリプションは、その表現に `"join": "@none"` が追加されることはありません。

解決処理はエンティティ読み取りと同じコードパスを通るため、`ListRelationship` (`objectList`)、`object` 配列を持つ `Relationship`、およびマルチ属性インスタンスはすべて走査されます(#2225)。また、`keyValues` ペイロードは Relationship 値をターゲットの簡略化された表現に置き換えます(clause 4.5.3 EXAMPLE 9 / EXAMPLE 17)。サブメンバーを追加するのではなく置き換えます。

> **認可。** リンクエンティティはサブスクリプションが宣言していないターゲットであるため、**サブスクリプション作成者の**行レベル読み取り述語によってフィルタリングされます。この述語は CSource 通知パスが使用するのと同じヘルパー(#2133)で導出され、HTTP join と同じ自由な `entityType` 規律(#2213)が適用されます。述語を決定できない場合(`createdBy` がない、作成者が削除された、非アクティブ化された、またはテナント内でアクティブなメンバーシップを持っていない、テナントが解決不可能、またはユーザードキュメントを持たない認証情報によって作成されたサブスクリプション — API キーの `createdBy` は `apikey:<keyId>`、OAuth クライアントの場合はクライアント ID)、join は**ゼロ個**のリンクエンティティに解決され、通知は埋め込みデータなしで配信されます。`join` は追加の表現であるため、通知が送信されるかどうかを変更してはいけません。[AUTH.md](../reference/auth.md) を参照してください。
>
> **両方の配信パスに適用されます。** join は、Lambda マッチャーとスタンドアロン通知サービスの両方で使用される共有ヘルパーによって適用され、エンティティ変更通知と ReactiveCore ルール通知の両方に対応します。NGSIv2 サブスクリプション(および `protocol` を持たない #1570 以前のサブスクリプション)には影響しません — `join` は NGSI-LD メンバーです。
>
> **解決の失敗が通知を抑制することはありません。** リンクエンティティの解決はデータベースを読み取るため、一時的に失敗する可能性があります。共有ヘルパーはこれらの失敗を吸収し、**join 実行前**のペイロードで通知を配信します(`NOTIFICATION_JOIN_RESOLUTION_FAILED` としてログ記録)。これは、上記の決定不可能な述語が配信を中止するのではなくゼロ個のリンクエンティティを返すのと同じ理由です。`join` は追加の表現です。この方向での失敗はデータを保留するだけで、決して公開しません。

### 作成 / 更新時のフィールド検証

ETSI GS CIM 009 (clause 4.21 / 5.8.1) に従い、一部のサブスクリプションフィールドは組み合わせることができません。これらは作成 / 更新時に `400 BadRequest` で拒否されます(意味が未定義のサブスクリプションを作成するのではなく)。

| Rule                                                                                                  | Reason                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `throttling` ⊥ `timeInterval`                                                                         | These are distinct operating modes: `throttling` sets a minimum interval between change-triggered notifications, `timeInterval` sends periodic notifications.    |
| `watchedAttributes` ⊥ `timeInterval`                                                                  | A `timeInterval` subscription is **periodic-only** — entity changes never trigger it — so watching attributes would have no effect (ETSI GS CIM 009 clause 5.8). |
| At most one include selector (`notification.pick` / `notification.attributes` / `notification.attrs`) | The include-style attribute selectors are mutually exclusive; `pick` and `attributes`/`attrs` map to the same internal include projection.                       |
| At most one exclude selector (`notification.omit` / `notification.exceptAttrs`)                       | The exclude-style attribute selectors are mutually exclusive; `omit` and `exceptAttrs` map to the same internal exclude projection.                              |
| Include ⊥ exclude                                                                                     | An include selector cannot be combined with an exclude selector (`pick`/`omit` are mutually exclusive per clause 4.21).                                          |

***

## 実用例

### 例 1: 温度しきい値監視

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

車両位置の変化を追跡:

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

Slack Webhook にカスタムフォーマットの通知を送信:

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

**❌ 悪い例:すべてのエンティティを監視**

```json
{
  "subject": {
    "entities": [{ "idPattern": ".*" }],
    "condition": { "attrs": [] }
  }
}
```

通知量が過剰になり、システムに負荷がかかります。

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

### 2. スロットリングを設定する

`throttling` (秒単位) を設定して、過剰な通知を防ぎます:

```json
{
  "throttling": 60
}
```

これにより、同じエンティティの変更通知が 60 秒ごとに 1 回に制限されます。

### 3. 有効期限を設定する

テスト用のサブスクリプションには `expires` を設定します:

```json
{
  "expires": "2026-12-31T23:59:59.000Z"
}
```

### 4. 変更された属性のみを通知する

不要な通知を減らします:

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

通知先エンドポイントで以下を実装します:

* **2xx ステータスコードを返す**:成功を示すため
  
* **リトライロジック**:一時的な障害に対処するため
  
* **タイムアウト設定**:長時間のハングを防ぐため

***

## アクセス制御と所有権 (GeonicDB 拡張)

> **注意**: `super_admin` はサブスクリプションエンドポイント (`/v2/subscriptions`, `/ngsi-ld/v1/subscriptions`) にアクセスできません。これらはデータ API であるためです。代わりに `tenant_admin` または `user` ロールを使用してください。

認証が有効な環境では、サブスクリプションに所有権ベースのアクセス制御が適用されます。

### 動作


* サブスクリプションが作成されると、認証されたユーザーの ID が `createdBy` フィールドに記録されます。
  
* **更新 (PATCH) と削除 (DELETE)** は、以下のいずれかの条件を満たすユーザーのみが実行できます:
  
  * サブスクリプションの作成者 (`createdBy` が一致)
    
  * `tenant_admin` ロール
    
* 上記の条件が満たされない場合、**404 Not Found** が返されます (#2189)。`403` を返すと、それを読み取ることができないプリンシパルに対してサブスクリプションが存在することを確認してしまいます — 読み取りパスはサブスクリプションを隠すため (#2140 参照)、書き込みパスで `403` を返すとその存在が漏洩します (**存在オラクル**)。`404` は「そのようなドキュメントは存在しない」と区別がつきません。
  
* **`createdBy` を持たない**サブスクリプション (そのフィールドが存在する前に作成されたもの) も、非管理者による更新と削除時に **404 Not Found** を返します (#2161)。`tenant_admin` はそれらのドキュメントを引き続き管理できます。

> **`super_admin` はここでの脱出ハッチではありません。** サービス層の所有権チェックは `super_admin` をスキップしますが、認証が有効な場合、そのロールはこれらのエンドポイントに到達しません: `SUPER_ADMIN_DATA_API_DENY_FENCE` (`policy.defaults.ts`) は、`super_admin` に対して `/v2/**` と `/ngsi-ld/**` をハード拒否するフェンスとして機能し、カスタムポリシーでは解除できない拒否優先フェンスとなっており、プラットフォーム管理者がテナントデータに触れることができないようにしています。実際にサブスクリプションと登録を管理できる管理者ロールは **`tenant_admin`** です。(`AUTH_ENABLED=false` の場合、すべてのリクエストは合成された `super_admin` となり、フェンスは適用されませんが、その場合は所有権の強制も存在しません。)
> 

* **取得 (GET) とリスト表示 (LIST)** は所有権チェックの対象ではありません — 作成者によってフィルタリングされません — しかし、これはテナント内のすべてのドキュメントが表示されることを意味するわけでは**ありません**。#2140 以降、読み取りは行レベルの読み取り述語を通過します: プリンシパルが読み取ることができないエンティティタイプのみを宣言しているサブスクリプションは完全に非表示になり (ID による取得では 404、リストとカウントからは除外、通知エンドポイント URL を含む)、読み取り不可能なタイプセレクタは混合サブスクリプションから削除されます。
  
* **配信は作成者の読み取り述語によってフィルタリングされます (#2205)。** 上記の #2140 は*サブスクリプションドキュメント*が表示されるかどうかを決定します; サブスクリプションが配信するエンティティについては何も述べていません。サブスクリプションの書き込みは、フレームとしてサブスクリプションリソースパスで認可されるため、`GET /ngsi-ld/v1/entities` を制限するポリシーはサブスクリプションの作成にまったく適用されません — タイプを拒否された主体がそれをサブスクリプションライブし、通知として受信することができてしまいます。したがって、すべての通知は配信時に作成者の行レベル読み取り述語でフィルタリングされ、3 つすべての次元 (`entityType`、`entityOwner`、`scope`) にわたって実際のエンティティ上で評価されます。不変条件は次のとおりです: **行作成者 P が `GET /ngsi-ld/v1/entities` で見ることができないものは、P のサブスクリプションに配信されることはありません。** これにより、2 つの長年のギャップも閉じられます — 制限が厳しくなる前に作成されたサブスクリプションは `PATCH` 時だけでなく配信のたびに再評価され、`scope` / `entityOwner` の次元は具体的なタイプセレクタにも適用されます。
  ユーザードキュメントを持たない作成者 — **API キーと OAuth クライアント** — は、独自のバインドされたポリシーに対して評価されます (#2282): サブスクリプションは作成者のプリンシパルの種類 (`createdByRole`) を保存し、述語は認証情報ドキュメントから派生し、`policyId` は**ライブ**で読み取られるため、キーの再バインドは次回の配信時に有効になります。プリンシパルの種類は `createdBy` の形状から推測されることはないため、API キー ID のように見えるユーザー ID が認証情報のポリシーで評価されることはありません。
  述語を決定できない場合、配信は**停止**します (フェイルクローズ、`securityEvent` 警告ログ付き)。条件はプリンシパルの種類によって異なります。**すべての**作成者について: 保存された `createdBy` がない (レガシードキュメント)、解決不可能なテナント、またはエンティティ読み取りを完全に拒否する述語。**ユーザー**作成者についてはさらに: アクティブなユーザーに解決できない作成者 (削除 / 無効化)、または通知されたテナント内のアクティブなメンバーシップを持たない作成者。**認証情報**作成者 (`api_key` / `oauth_client`) については、ユーザーとメンバーシップの条件はまったく適用されません — 代わりに: 保存された `createdByRole` がない (#2282 より前に書き込まれたサブスクリプション)、または認証情報ドキュメントが存在しない、取り消されている (`isActive: false`)、または別のテナントに属している場合。`AUTH_ENABLED=false` の場合、述語は存在せず、配信は制限されず、HTTP 読み取りパスと一致します。

> **注意**: 同じ所有権検証が登録 (`/v2/registrations`、`/ngsi-ld/v1/csourceRegistrations`) および — #2188 以降 — コンテキストソースサブスクリプション (`/ngsi-ld/v1/csourceSubscriptions`) にも適用されます。同じ契約は、#2198 以降、カスタムデータモデル (`/custom-data-models`) もカバーします。これら 4 つはすべて共通しています: 管理者バイパス、`createdBy` がない → `404`。**所有者の不一致は、サブスクリプション / 登録 / csource-subscriptions では `404` ですが (#2189)、カスタムデータモデルでは `403` のままです** — カスタムデータモデルは行レベルの読み取り述語の対象ではないため、その存在は `GET` で制限された呼び出し元に表示され、閉じるべき `404` 対 `403` の存在オラクルは存在しません。

### サブスクリプション書き込みに対する XACML 属性ベース制御 (#1104 / #2005)

すべてのサブスクリプション**書き込み** — 作成*および*更新、3 つすべてのサブスクリプションリソースにわたって — において、XACML PIP はサブスクリプションターゲット属性を `AuthzRequest.resource` に注入し、きめ細かいポリシー制御を可能にします:

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

`entities[]` に複数の要素が含まれている場合、書き込みが成功するには**すべての要素が Permit である必要があります** (全 Permit セマンティクス)。単一の不一致なタイプまたは ID パターンでも、リクエスト全体が `403 Forbidden` で拒否されます。

サブスクリプションは継続的な読み取りであるため、更新は**更新後の有効値**で評価されます: リクエストボディが宣言する値、または — ボディがそれらに触れない場合 — すでに保存されている値。したがって、制限された呼び出し元は、許可されたサブスクリプションを制限されたタイプに切り替えることも、他のフィールドのみを編集して現在制限されているサブスクリプションを維持することもできません。制限されたサブスクリプションを許可されたタイプに絞り込むことは許可されます。

> リテラル `body.type === "Subscription"` は `entityType` に伝播**されません**。ポリシーは、ラッパーオブジェクトのタイプではなく、`entities[].type` をターゲットにする必要があります。
>
> `path` を `/ngsi-ld/v1/subscriptions` に対して正確に一致させるポリシーは、作成呼び出しのみをカバーします。更新もカバーするには、glob (`/ngsi-ld/v1/subscriptions**`) を使用してください — `*` は `/` を越えません。

認証と認可の詳細については、[AUTH.md § Subscription PIP attributes](../reference/auth.md#subscription-pip-attributes) を参照してください。

***

## トラブルシューティング

### 1. Notifications Are Not Being Delivered

**原因:**

* 条件式が一致しない
  
* 通知先 URL に到達できない
  
* サブスクリプションが `inactive` または期限切れ
  
* テナントの1日あたりの通知ファンアウトクォータ(`maxNotificationsPerDay`、#1544)がその日の分を使い果たした場合 — [QUOTAS.md](../saas/quotas.md#notification-fan-out-quota-1544) を参照してください。これにより、個々の通知が(警告ログと `notificationQuotaExceeded` メトリックとともに)ドロップされますが、サブスクリプション自体には触れず、HTTP エラーも返しません。配信はトリガーとなる API リクエストの外で発生するためです。**`remaining: 0` で `limit > 0` の場合**は、次の UTC 午前0時に自動的にクリアされます(カウンターは UTC 日単位のバケットです)。**`limit: 0` は明示的な恒久的停止**であり、そのテナントに対して自動的にクリアされることはなく、`PUT /admin/tenants/{tenantId}/quotas` によるクォータ変更が必要です
  
* **変更が別の API プロトコルを通じて行われた(#2253)。** `/ngsi-ld/v1/subscriptions` を通じて作成されたサブスクリプションは NGSI-LD エンティティの変更に対してのみ発火し、`/v2/subscriptions` を通じて作成されたものは NGSIv2 の変更に対してのみ発火します。エンティティを書き込む API を通じてサブスクリプションを再作成してください。(#1570 より前に作成されたサブスクリプションは例外で、両方に一致します。)
  
* **作成者がエンティティを読み取れない(#2205)。** 配信はサブスクリプション作成者の行レベル読み取り述語によってフィルタリングされるため、`GET /ngsi-ld/v1/entities` でそのプリンシパルから非表示になっている行は配信もされません。API キーと OAuth クライアントの作成者は、自身にバインドされたポリシーに対して判定されます(#2282)。述語が判定できない場合、配信は完全に停止します — すべての作成者について:保存された `createdBy` がないレガシーサブスクリプション; **ユーザー**作成者について:アクティブなユーザーに解決されなくなった作成者、またはテナント内にアクティブなメンバーシップを持たない作成者; **クレデンシャル**作成者について:保存された `createdByRole` がない、または取り消された / 削除された / 別のテナントからのクレデンシャル(ユーザーとメンバーシップの条件はこれらには適用されません)。サーバーログには `errorCode: SUBSCRIPTION_NOTIFICATION_RLS_DENIED`(述語が拒否)または `SUBSCRIPTION_NOTIFICATION_RLS_SKIPPED`(述語が判定不能)が `subscriptionId` とともに記録されます。

**確認方法:**

```bash
# Check subscription details
curl http://localhost:3000/v2/subscriptions/{id} \
  -H "Fiware-Service: demo"

# Check status, expires, and lastNotification

# Check today's notification quota usage for the tenant
curl http://localhost:3000/admin/tenants/{tenantId}/quotas \
  -H "Authorization: Bearer {token}"
# → currentUsage.notifications.day: { used, limit, remaining, usagePercent, date }
```

**解決方法:**

* 条件式をテストする:手動でエンティティを更新し、条件が満たされることを確認する
  
* 通知 URL をテストする:`curl` で直接到達可能であることを確認する
  
* ステータスを `active` に変更する
  
* `currentUsage.notifications.day.remaining` が `0` の場合、配信は UTC 午前0時に自動的に再開されます; プラン制限を超える持続的なニーズがある場合は、`customQuotas.rateLimit.maxNotificationsPerDay` のオーバーライドをリクエストしてください

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

### 3. 通知ペイロードが期待通りでない

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

### 4. MQTT 通知が送信されない

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

* MQTT ブローカーの URL、ポート、および資格情報を検証する
  
* トピック名に特殊文字が含まれていないことを確認する
  
* QoS レベルを 0 に下げてみる

### 5. サブスクリプションが自動的に inactive になる

**原因:**

* 通知先が `NOTIFICATION_AUTO_PAUSE_AFTER_MS`(デフォルトは 1 時間)の間、成功した配信なしで一時的なエラー(5xx、429、タイムアウト)を返し続けている(#3080)。その場合、GeonicDB はサブスクリプションの `status` を `inactive` に設定し、`autoDisabledAt`(GeonicDB 拡張)を記録するため、Context Brokerによる自動一時停止と手動の一時停止を区別できます。
  
* `404` / `410` を返す Web Push 宛先は、代わりに `status` を `failed` に設定します(#3014)。

**確認方法:**

* サブスクリプションを `GET` する:`status` が `inactive`(NGSI-LD では `paused` としてレンダリングされます)で、`autoDisabledAt` が存在する
  
* CloudWatch メトリクス `GeonicDB/SubscriptionAutoPaused` / アラーム `subscription-auto-paused`

**解決方法:**

* 通知先を修正して 2xx で応答するようにする
  
* サブスクリプションを `active` に戻す(NGSIv2 では `status: "active"` で `PATCH`、NGSI-LD では `isActive: true` で `PATCH`)。これにより `autoDisabledAt` と失敗連続がクリアされます

***

## 関連ドキュメント


* [API Common Specification](../api-reference/endpoints.md) - REST API ドキュメント
  
* [API\_NGSIV2.md](../api-reference/ngsiv2.md) - NGSIv2 Subscriptions API リファレンス
  
* [API\_NGSILD.md](../api-reference/ngsild.md) - NGSI-LD Subscriptions API リファレンス
  
* [EVENT\_STREAMING.md](./subscriptions.md) - WebSocket Event Streaming
