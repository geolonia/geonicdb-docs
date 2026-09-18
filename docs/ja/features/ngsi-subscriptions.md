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
  
* [実践的な例](#practical-examples)
  
* [ベストプラクティス](#ベストプラクティス)
  
* [アクセス制御と所有権 (GeonicDB 拡張)](#アクセス制御と所有権-geonicdb-拡張)
  
* [トラブルシューティング](#トラブルシューティング)

***

## 概要

サブスクリプションは、エンティティの作成、更新、削除を監視し、定義された条件が満たされたときに指定されたエンドポイントに通知を送信します。

### 主なユースケース


* **センサーデータの監視**: 温度、湿度などの閾値超過を検出
  
* **位置追跡**: 車両やデバイスの位置変化を追跡
  
* **イベント駆動アーキテクチャ**: エンティティの変更によってトリガーされる自動処理
  
* **データ統合**: 他のシステムへのリアルタイムデータ配信

### サポートされている API

| API     | Endpoint                    | Support |
| ------- | --------------------------- | ------- |
| NGSIv2  | `/v2/subscriptions`         | ✅       |
| NGSI-LD | `/ngsi-ld/v1/subscriptions` | ✅       |

> **注意 (#1304 / #2337)**: ホスト名ルーティングされたデプロイメント（マルチサブドメイン構成の専用 DB）でも購読は発火します。API 経由のエンティティ変更はリクエストスコープでイベントを発行し、発生元デプロイメントの情報（`deployment.hostname`）を運んで背景ワーカーが正しい DB に対してマッチング・通知・状態更新を行います。**制限**: デプロイメント DB への直接 DB 書き込み（API を経由しない変更）はイベントを発火しません。AWS は EventBridge が一次ソース。Standalone の購読は `LocalEventBusPublisher` 一本で、Change Stream は ReactiveCore Rules 専用 — 物理削除で `fullDocument` が取れない Change Stream を購読の一次ソースにすると tenant が `'unknown'` になり沈黙する (#2337)。また、デプロイメント行の登録・有効化はキャッシュ（最大 5 分）の反映後にワーカーへ届きます。

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

**レイテンシ**: API 経由の通常のエンティティ作成/更新/削除ではほぼ即座です。TTL 失効の場合は、`EntityDeleted` 通知がこのパイプラインに入る前に、失効スイーパーのポーリング間隔（`ENTITY_EXPIRY.SWEEP_INTERVAL_SECONDS`、[QUOTAS.md](../saas/quotas.md#ttl-失効-expiresat-expiry-sweeper1561) を参照）の最大約 1 分が追加されます。

### EntityDeleted トゥームストーンと `previousAttributes` (#2439 / #2631 / #2671)

NGSI-LD の削除通知は、削除された属性を `urn:ngsi-ld:null` トゥームストーンとしてレンダリングします
（また、`attributeDeleted` トリガーも発火する可能性があります）。どちらも
`EntityDeleted` イベントの `EntityChangeEvent.changes.previousAttributes` が必要です。

| Source of `EntityDeleted`                                                                                                   | Supplies `previousAttributes`?                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| API delete / purge via `EntityService` (`deleteEntity`, …) (#2337)                                                          | Yes — attributes read before delete                                                                                                                                                                                                                                                  |
| TTL expiry via `EntityExpiryService` ([#1561](https://github.com/geolonia/geonicdb/issues/1561))                            | Yes — claimed document before soft-delete                                                                                                                                                                                                                                            |
| MongoDB Change Stream pre-image (`changeStreamPreAndPostImages`, [#1411](https://github.com/geolonia/geonicdb/issues/1411)) | **Not used.** The CDC `ChangeStreamProcessorFunction` and pre-image enablement were removed in [#1560](https://github.com/geolonia/geonicdb/issues/1560); resurrecting them would double-publish. On standalone, Change Stream remains Rules-only (`CHANGE_STREAM` in `defaults.ts`) |

**[#2631](https://github.com/geolonia/geonicdb/issues/2631) の処理**: トゥームストーンが #1411 / change-stream の配線がオフのときに暗黙的に無効化されるという前提は、**現在の main では成立しません**。Context Broker起動時に検出するランタイムフラグはなく、事前イメージ依存関係が欠落している場合のサブスクリプション作成時の 4xx エラーもありません。TTL 削除の可観測性は、すでに #1561 スイーパーで fail-loud になっています: `publishFailures > 0` は Lambda の呼び出しを失敗させ、`ExpirySweeperErrorsAlarm` が発火します（[QUOTAS.md](../saas/quotas.md#ttl-失効-expiresat-expiry-sweeper1561) を参照）。

**可観測性フォローアップ ([#2671](https://github.com/geolonia/geonicdb/issues/2671))**: それでも `EntityDeleted` イベントが `previousAttributes` **なしで**到着した場合（パブリッシャーのバグまたは将来の発行サイト）、マッチャーとスタンドアロンノーティファイアは **warn** をログに記録するため、トゥームストーン / `attributeDeleted` が暗黙的に空になることはありません。空のオブジェクト `{}`（属性のないエンティティ）は有効であり、警告は**出ません**。別の問題として、単一エンティティの `safePublishEntityChangeEvent` は依然として公開の失敗を `logger.error` のみで飲み込みます（スイーパーとは異なり）— #2671 で追跡されています。

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

> 上記の例は **NGSIv2** のボディです。NGSI-LD サブスクリプションは ETSI `Notification`(`id` / `type: "Notification"` / `data[]` を `notification.format` で選択された表現で)を配信します — [Notification Body Shape](#notification-body-shape-ngsi-ld-vs-ngsiv2-1765) を参照してください。

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

#### httpCustom.json (型保持テンプレート)

`payload` は文字列テンプレートであるため、すべての置換値は文字列になります。**属性の型を保持**する必要がある場合(数値は数値のまま、ブール値はブール値のまま)、代わりに `httpCustom.json` を使用してください(FIWARE Orion パリティ)。`json` はオブジェクトまたは配列のテンプレートを受け入れ、`payload` とは**相互排他的**です。

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


* **単一マクロ値** (`"${temperature}"`)︰属性値は元の JSON 型でインライン化されます(数値 → 数値、ブール値 → ブール値、オブジェクト/配列 → オブジェクト/配列)。欠落している属性は `null` になります。
  
* **部分マクロ値** (`"prefix-${id}"`)︰常に文字列を生成します。
  
* **キーは置換されません** — キー内のマクロ(`"${id}": ...`)は `400` で拒否されます。
  
* テンプレートは作成時に制限されます︰シリアル化サイズ ≤ `MAX_PAYLOAD_LENGTH`、ネスト深度 ≤ `MAX_JSON_DEPTH`。違反は `400` で拒否されます。
  
* 通知はデフォルトで `Content-Type: application/json` で送信されます。これは `receiverInfo` (カスタムヘッダー)によってオーバーライドできます。

上記のサブスクリプションに対して配信されるボディの例 (temperature = 25.5, active = true):

```json
{ "room": "Room1", "temp": 25.5, "active": true, "unit": "celsius" }
```

### MQTT

MQTT ブローカーにメッセージを公開します。

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

同じ NGSI 通知 JSON ボディを VAPID を使用してブラウザ Push Service (FCM / Mozilla / Apple など) に配信します。**GeonicDB 拡張** — FIWARE Orion または ETSI Endpoint の一部ではありません。

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

**例 (NGSI-LD — GeonicDB 拡張):**

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

**デプロイ時の VAPID キー** (デプロイごとのグローバル): ENV.md を参照 — `WEBPUSH_VAPID_PUBLIC_KEY` / `WEBPUSH_VAPID_PRIVATE_KEY` / `WEBPUSH_VAPID_SUBJECT` (staging/prod: `geonicdb-<env>` JSON シークレットを `resolveWebPushVapidSecrets()` 経由で使用、#3033; SAM プレーンパラメータはフォールバック)。公開鍵の検出: `GET /.well-known/webpush-vapid-key` → `{ "publicKey": "..." }` (未設定の場合は 503)。

**失敗処理 (#3014 Q6):** 

* Push Service `404` / `410` → 非一時的; サブスクリプションドキュメントの `status` が `failed` になります (エンドポイントが消失 / 登録解除)。
* `413` → 非一時的; そのメッセージのみを破棄 — サブスクリプションを停止 **しない**。
* `401` / `403` → 非一時的; サブスクリプションを永続的に失敗とマーク **しない**。
* その他の 4xx は `408` / `429` を除いて非一時的です。5xx およびネットワークエラーは HTTP と同様に再試行します。

**GET レスポンス:** `keys.auth` は `******` としてマスクされます (MQTT の `passwd` と同様)。`keys.p256dh` はクリアテキストで返されます。NGSI-LD レスポンスは `endpoint.webpush` を公開しますが、`endpoint.protocol` は **公開しません** (Web Push は `webpush` の存在で判断します)。`csourceSubscriptions` は `webpush` を `400` で拒否します。

#### アプリ実装フロー (#3060)

上記の API はワイヤーフォーマットのみをカバーしています。PWA/ブラウザクライアントは次のように接続します:


1. **service worker を登録** アプリのオリジンに: `await navigator.serviceWorker.register('/sw.js')`。
2. **Push にサブスクリプションライブ** `PushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` 経由で、ここで `applicationServerKey` はデプロイの VAPID 公開鍵で `GET /.well-known/webpush-vapid-key` から取得し、`Uint8Array` に変換します (RFC 8291)。
3. **`PushSubscription.toJSON()` を変換** して `notification.webpush` (NGSIv2) または `endpoint.webpush` (NGSI-LD) にします。上記のフィールドマッピングテーブルに従い、サブスクリプションを `POST` します。
4. **`sw.js` で `push` イベントを処理** — NGSI 通知ボディは `event.data.json()` として到着します; `self.registration.showNotification(...)` を呼び出して OS レベルの通知を表示します。

`@geolonia/geonicdb-sdk` は完全なアプリフローを `db.registerWebPushSubscription({ protocol, ... })` として実装しています (#3092) — ブラウザのサブスクリプションライブ + 冪等な GeonicDB 作成 (localStorage ベース; VAPID ローテーションは `PATCH` 経由で更新)。デフォルトは

localStorage キーは `baseUrl` + `tenant` + `protocol` のみでスコープされ、ログインプリンシパルでは**スコープされません**(`logout()` はそれをクリアしません)。複数のユーザーが 1 つのプロファイルを共有する**共有ブラウザ / キオスク**では、後の登録が以前のユーザーの `subscriptionId` を再利用し、新しい `subject` / `entities` を無視する可能性があります。SDK はプリンシパルを**自動で分離しません**。呼び出し側は、デフォルトのスコープを含む明示的な `storageKey` を渡す必要があります(例えば、`buildWebPushSubscriptionStorageKey(baseUrl, tenant, protocol)` に `:${userId}:${filterId}` を追加する)。これにより、共有ブラウザのユーザー*および*異なるフィルターが分離されます(#3097)。メールが利用できない場合(API キーセッション)は、`userId` にアプリ管理の安定した ID を使用してください。HTTP 507 (`QuotaExceededError`) は、プランのサブスクリプション猶予上限を超えたことを意味します。未使用のサブスクリプションを削除するかプランを変更した後にのみリトライしてください。ブラウザの `unsubscribeWebPush()` だけでは GeonicDB ドキュメントは削除されません。低レベルの部品は `db.subscribeWebPush()` + `toNgsiv2WebPushNotification()` / `toNgsiLdWebPushEndpoint()` および `db.unsubscribeWebPush()` のままです。コード付きの完全なウォークスルーについては、SDK.md → Web Push 通知 を参照してください。

### NGSI-LD の `notification` は閉じた構造です(#2066)

上記で説明した `http` / `httpCustom` / `mqtt` 通知スタイル、およびそれらのネストされたフィールド(`httpCustom.json`、MQTT `qos` / `retain` / `user` / `passwd` など)は、**NGSIv2 専用**です。NGSI-LD サブスクリプションは単一の `notification.endpoint` オブジェクト(`uri` / `accept` / `receiverInfo` / `notifierInfo` — [API\_NGSILD.md → Create Subscription](../api-reference/ngsild.md#create-subscription) を参照)を持ち、別の `mqtt` フィールドではなく、`endpoint.uri` の `mqtt://` / `mqtts://` スキームを介して MQTT 配信を選択します。**Web Push** は、その同じ `endpoint` オブジェクト上の GeonicDB 拡張機能です(`webpush`、オプションの書き込み専用 `protocol: "webpush"`)。パブリック GET レスポンスには `protocol` は含まれません。

\#2066 以降、`POST` / `PATCH /ngsi-ld/v1/subscriptions` は、**ETSI GS CIM 009 Table 5.2.14-1 で定義されていない `notification` のメンバー**を `400 BadRequestData` で拒否します。ただし、`endpoint` で明示的に宣言された GeonicDB 拡張機能(`webpush` / `protocol`、#3014)は除きます。NGSIv2 形式の `notification.httpCustom` / `notification.http` / `notification.mqtt` を NGSI-LD エンドポイントに送信すると、#2066 以前の動作ではなく、すぐに失敗するようになりました。以前は、不明なキーが Zod のデフォルト(strip)検証によって黙ってストリップされ、リクエストは `201` / `204` で成功し、カスタム配信設定は痕跡なく削除されていました。Subscription の**トップレベル**の JSON-LD 語彙拡張は影響を受けません。閉じているのは `notification` のみです。

`POST` / `PATCH /ngsi-ld/v1/csourceSubscriptions` も同じ動作をします。コンテキストソースサブスクリプションはまったく同じリクエストスキーマを再利用するため、閉じた `notification` はそこにも適用されます。

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

> **パターン制限。** `idPattern` と `typePattern` は通知パス上のエンティティ ID とタイプに対して評価されるため、壊滅的バックトラッキングを引き起こしやすいパターンはサブスクリプション作成時に `400 BadRequest` で拒否されます。これはネストされた量指定子 (`(a+)+`) と **量指定されたグループ内の選択肢** (`^(a|aa)+$`、`^((a|aa))+$`) をカバーします — 完全なルールセットについては Regex Pattern Validation (ReDoS) を参照してください。文字クラスと量指定されていないグループは影響を受けません:`^urn:ngsi-ld:(Room|Vehicle):[0-9]+$` と `Room[0-9]+` は受け入れられます。

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

`typePattern` は両方の API で受け入れられます。**NGSI-LD サブスクリプションでは `type` と `typePattern` は相互排他的ではありません**: `EntitySelectorSchema` は *少なくとも 1 つ* のセレクタを必要とし、両方が存在する場合、マッチャーは `type` の完全一致と `typePattern` 正規表現を **AND** で評価します。両方とも `GET` で保持されるため (#2067)、取得したサブスクリプションをそのフィルタを緩めることなく再実行できます。AND セマンティクスは確定した設計です (#2105): NGSIv2 は仕様で義務付けられた排他性を維持し (「両方を同時に使用することはできません」— 両方を指定すると `400 BadRequest` を返す)、一方 NGSI-LD では、`typePattern` は GeonicDB 拡張機能であり、両方を AND フィルタとして受け入れます。コンテキストソースサブスクリプション (`/csourceSubscriptions`) は同じセレクタを共有し、同じルールを適用します (#2105): `typePattern` は登録されたエンティティタイプに対して AND で評価され、`typePattern` のみのセレクタが受け入れられ、`typePattern` は `idPattern` と同じ作成時 ReDoS 検証を通過します。登録されたタイプは FQN として保存されるため (#1800)、パターンは保存された FQN とサブスクリプションのマッチング語彙で圧縮された用語の両方に対してマッチされます — 書き込み時の `@context` (`contextRef`、サブスクリプションが属性名を保存するたびに記録される (#1900) **または `entities[].typePattern` セレクタ** (#2117)) またはそれ以外の場合はコアコンテキスト。#2117 以前は、エンティティのみの csource サブスクリプションは `contextRef` を記録しなかったため、カスタム語彙に対して記述された短縮名の `typePattern` は決してマッチできませんでした (回避策はサブスクリプションに属性名を与えることでした); 常に `matchJsonldContext` を保存する通常のサブスクリプションとのその非対称性 (#1680) は解消されました。`entities` のみに触れる `PATCH` は、属性名を保存するサブスクリプションの `contextRef` を上書きすることはありません。なぜなら、その値はそれらの逐語的な名前がレスポンスでどのように圧縮されるかを制御するためです。通知 `@context` (`jsonldContext`) はマッチングに使用されることはなく (#2040)、このパス上のコンテキスト解決はリモートドキュメントをフェッチすることはなく (#1680)、`type` を宣言しない登録エンティティ仕様は `typePattern` によって絞り込まれません (パターン対パターンの `idPattern` ケースと同じ失敗方向)。NGSIv2 では仕様の一部です; NGSI-LD サブスクリプション (`entities[].typePattern`) では **GeonicDB 拡張機能** です — ETSI `EntitySelector` には `typePattern` がありません。`type` とは異なり、`typePattern` は `@context` で用語展開 **されません** (#1657)。NGSI-LD エンティティのタイプが正規の FQN 形式で保存されている場合 (`@context` によって絶対 IRI にマッピングされた用語)、パターンは保存された FQN とサブスクリプション自身の `@context` で圧縮された用語の **両方** に対してマッチされます。これはこの目的のために作成/更新時に保存されます (#1680) — したがって、短縮名に対して記述されたパターン (例: `Sensor.*`) は、マッピングコンテキストを介して作成されたエンティティとマッチし続けます。

> **NGSI-LD `GET` は各エンティティセレクタを保存された形式で返します (#2067)。** 以前は `typePattern` はレスポンスで `type` に折りたたまれ、タイプ制約が全くないセレクタは作成された `type: "*"` でレンダリングされていました。両方ともラウンドトリップを歪めました: 取得したサブスクリプション本体を新しい `POST` として再実行すると、`^Sensor` のようなパターンがリテラルのタイプ名 `^Sensor` になりました。`GET` は現在、実際に保存されたセレクタ (`id` / `idPattern` / `type` / `typePattern`) のいずれかを返し、タイプセレクタが指定されなかった場合は `type` を完全に省略します。

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

`coordinates` は文字列(`"139.6503,35.6762"`)または GeoJSON 形式の配列のいずれかを受け付けます。これには、仕様が `LineString` / `Polygon` に使用するネストされた形式(`[[[138,34],[141,34],[141,37],[138,34]]]`)も含まれます。`geoQ.geometry` は、すべての 6 つの GeoJSON ジオメトリタイプ — `Point`、`MultiPoint`、`LineString`、`MultiLineString`、`Polygon`、`MultiPolygon` を受け付けます(#1696)。`Multi*` バリアントはネストされた GeoJSON 座標をそのまま保持し、`GET` は同じネストされた配列形式でそれらを返すため、取得した `geoQ` は変更なしに `PATCH` で戻すことができます。`Polygon` リングは閉じている必要があります — 最初と最後の位置が**すべての**要素で等しく、3 要素の `[lng, lat, alt]` 位置が使用される場合は高度も含まれます(#1644) — また、穴のあるポリゴン(複数のリング)は `400` で拒否されます。

NGSIv2 サブスクリプションは NGSIv2 の軸順序を維持します(`coords` は `lat,lng`)。これは `GET /v2/entities?coords=` と同じ方法で正規化されるため、サブスクリプションと同等の検索が一致します。軸順序は**サブスクリプションの**元の API によって決定され、サブスクリプションが作成されたときに記録されます — そのフィールドが存在する前に作成されたサブスクリプションは、推測されるのではなく `geoQ` 述語がスキップされます(そしてジオフィルタリングなしで通知されます)。

サブスクリプションを更新すると、送信したメンバーのみが置き換えられます:`q` を含む `PATCH` は保存された `geoQ` をそのまま残し、その逆も同様です。また、`geoQ` はオブジェクト全体として置き換えられます(したがって、省略された `geoproperty` は継承されるのではなくクリアされます)。`q: ""` を送信すると、属性フィルタが削除されます。

**並行更新 (#1593)**:部分更新はマージする前に保存された subject/notification を読み取る必要があるため、`PATCH` は**楽観的同時実行制御**を使用します — 書き込みは読み取られた `modifiedAt` 値でガードされ、負けたライターは再読み取りして再試行します。`SUBSCRIPTION.MAX_UPDATE_RETRIES` 回の試行後も更新が収束できない場合(同じサブスクリプションへの持続的な並行書き込み)、リクエストは **`409 Conflict`** で失敗し、クライアントは再試行する必要があります。このガードがないと、2 つの同時 `PATCH` の両方が `2xx` を返し、後の書き込みが前の書き込みを暗黙的に破棄していました。配信統計(`notification.timesSent` / `lastNotification` / `status`)は通知者によって書き込まれ、このガードの対象**ではない**ことに注意してください — これらは最終的に一貫性があり、配信と同時に到着した `PATCH` は 1 回の増分を失う可能性があります。

### q / geoQ / scopeQ が通知をフィルタリングする方法

`q`、`geoQ`、および(NGSI-LD のみ)`scopeQ` は、サブスクリプションが存在するかどうかだけでなく、**どのエンティティ変更が通知を発火させるか**を制限します。`q: "severity>100"`、`geoQ` ポリゴン、または `scopeQ: "/Madrid/#"` を持つサブスクリプションは、述語を満たすエンティティへの変更に対してのみ通知されます。

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

`scopeQ`(NGSI-LD のみ)は保存され、`GET` によって返され、**通知フィルタとして評価されます** — `q` / `geoQ` と同じ方法で、`GET /ngsi-ld/v1/entities?scopeQ=` と同じ `parseScopeQuery` 述語ビルダーを使用します。`scopeQ: "/Madrid/#"` を持つサブスクリプションは、`scope` が一致するエンティティへの変更に対してのみ通知されます。これは `q` / `geoQ` と同じ方法で作成/更新時に検証され(不正な形式の `scopeQ` は `400` で拒否されます)、上記の表で説明されているのと同じコスト制限/重複排除/フェイルオープン動作に参加します(同じ式ごとのキャッシュキーに `q` / `geoQ` と一緒に折りたたまれます)。

`temporalQ` と `lang` は受け付けられ、永続化され、`GET` によって返されますが、通知マッチングには**適用されません**(#1588)。これは意図的なものであり、後で閉じられるべきギャップではありません:


* `temporalQ` は**履歴を取得する**ための時間範囲(`timerel` / `timeAt` / `endTimeAt`)を記述します。単一の変更通知イベントには比較対象となる「時間範囲」がないため、イベントごとの述語としての意味がありません。
  
* `lang` は、エンティティを返すときにどの `LanguageProperty` 値を選択するかのレンダリングヒントであり、変更が満たすか満たさないかの条件ではありません。

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

**統合された NGSI-LD プロジェクション (`pick` / `omit`):**

ETSI GS CIM 009 (clause 4.21) に従い、`notification.pick` は含める属性を選択し、`notification.omit` は除外する属性を選択します。これらは、レガシーの `attributes` (含める) / `exceptAttrs` (除外) セレクタとまったく同じように通知ペイロードに適用されます:

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

**レスポンスのシリアライゼーション (非対称性に注意):** `GET` / `List` レスポンスは、作成時にどのエイリアスが使用されたかに関係なく、常に保存されたプロジェクションを ETSI の正規フィールド名でシリアライズします:


* **含める**プロジェクションは `notification.attributes` として返されます (`pick` ではありません);
  
* **除外**プロジェクションは `notification.omit` として返されます (`exceptAttrs` ではありません)。

したがって、`pick` でサブスクリプションを作成したクライアントは、レスポンス内の `notification.attributes` の下に選択を見つけ、`exceptAttrs` を使用したクライアントは `notification.omit` の下に見つけます。両方のレスポンスフィールド名は戻りの際に受け入れられ(同じ内部の含める / 除外プロジェクションにマッピングされます)、したがって `GET` → 編集 → `PATCH` のラウンドトリップはプロジェクションを保持します。

**`PATCH` でプロジェクションをクリアする (JSON Merge Patch、#1635):**

サブスクリプションの更新は JSON Merge Patch (RFC 7396 / ETSI GS CIM 009 clause 5.8.2) に従います。通知プロジェクションセレクタ (`pick` / `omit` / `attributes` / `attrs` / `exceptAttrs`) の場合、これは 3 つの状態を意味します:

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

`null` は*クリア*シグナルであるため、含める / 除外の排他性チェックから除外されます:同じリクエストで `pick: null` を `omit` の値とともに送信して、含めるプロジェクションをクリアし、除外プロジェクションを設定できます。空の配列 `[]` はクリアメカニズムでは**ありません**(すべてのセレクタは空でない配列を必要とします)— クリアするには `null` を使用します。これがないと、一度設定されたプロジェクションはサブスクリプションを削除して再作成することによってのみ削除できます。

### サブスクリプション @context を用いた通知 `type` のレンダリング (NGSI-LD、#1687)

NGSI-LD サブスクリプションの場合、通知 `data[]` 内の各エンティティの `type` は、**サブスクリプション自身の `@context`**(作成/更新時に保存)を用いてレンダリングされます。これは ETSI GS CIM 009 §5.5.7 の「出力時にコンパクト化する」ルールに従います。正規 FQN 形式(用語定義によってマッピングされた絶対 IRI、#1657 参照)で保存された type は、配信前に**短い用語にコンパクト化**されます。これは、エンティティ変更通知とルールトリガー通知の両方に適用されます。配信時にサブスクリプションの `@context` が解決できない場合は、フォールバックとして FQN が送信されます。ベア(コア `@vocab`)type は以前と同様に変更されずに配信されます。

> **⚠️ 破壊的変更(受信側、#1687)**: 絶対 IRI にマッピングされた type の場合、以前の通知では `data[].type` に FQN が公開されていましたが、現在はコンパクト化された短い用語が含まれます。FQN で分岐する受信クライアント(例: geonicdb-cli / geonicdb-pulse)は見直しが必要です。これは #1725 で追跡されています。WebSocket イベントストリーミングパスは現在コンパクト化**されておらず**、保存された(FQN)形式を配信しています。

### マルチタイプ `data[].type` (NGSI-LD、#2477)

エンティティが複数のエンティティタイプを持つ場合(節 4.16 / 表 5.2.4)、通知ペイロードは `data[].type` を **JSON 文字列配列**としてレンダリングします。これは `GET /ngsi-ld/v1/entities/{id}` と同じルールです。単一の type は文字列のままです(1 要素の配列にはなりません)。

> **⚠️ 破壊的変更(受信側、#2477)**: `data[].type` が常に文字列であると仮定するクライアントは、マルチタイプエンティティで動作しなくなります。`type` を `string | string[]` として扱ってください(WebSocket イベントの `entityType` も同様です。[EVENT\_STREAMING.md](./subscriptions.md) を参照)。

### 通知 `jsonldContext` (NGSI-LD, #1847 / #1801)

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

### 通知ボディの形状 (NGSI-LD vs NGSIv2, #1765)

通知ボディは、イベントのプロトコルではなく、**サブスクリプションの**プロトコルから構築されます。

**NGSI-LD サブスクリプション**は ETSI `Notification` (GS CIM 009 clause 5.2.13) を配信します。その必須メンバーは `id` (URI — GeonicDB は配信ごとに `urn:ngsi-ld:Notification:<uuid>` を生成)、`type` (`"Notification"`)、`subscriptionId`、`notifiedAt`、`data` です。`data[]` 内の各エンティティは、`notification.format` で選択された NGSI-LD 表現でレンダリングされます (デフォルトは `normalized`、clause 5.2.14 による):

| `notification.format`  | `data[]` attribute shape                                                                                                                                                                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `normalized` (default) | `{"temperature": {"type": "Property", "value": 32.5}}` — attribute `type` is `Property` / `Relationship` (with `object`) / `GeoProperty` / `LanguageProperty` …                                                                                                                                                                             |
| `concise`              | `{"temperature": 32.5}`, or `{"value": 32.5, "<subAttr>": …}` when sub-attributes are present (sub-attribute rendering itself is still normalized — see the known gaps below)                                                                                                                                                               |
| `keyValues`            | `{"temperature": 32.5}` — values only, no type information or sub-attributes. Multi-attributes become a `dataset` map: `{"temperature": {"dataset": {"@none": 32.5, "urn:ngsi-ld:Dataset:a": 30.1}}}` (clause 4.5.4, #1930). `simplified` is accepted as the ETSI synonym (Table 5.2.14.1-1, #2103) and normalized to `keyValues` on intake |

`showChanges` は、`normalized` / `concise` において、型固有の previous-member (ラップされていない以前の **value/object**) を追加します。`keyValues` はサブ属性を表現できないため、すべての previous-member はそこでは省略されます。

**マルチ属性**の場合、previous-member は `datasetId` によってペアリングされ、**インスタンスごとに**付加されます (ETSI GS CIM 009 clause 4.5.2.3 は `previousValue` を Property インスタンスのメンバーとし、clause 4.5.5 はインスタンスを `datasetId` によって識別します — 配列位置によってではありません、#1813):


* 変更前に `datasetId` が存在していたインスタンスは、独自の previous-member を持ちます。
  
* **新規**のインスタンス (同じ `datasetId` の下に対応するものがない) は **何も**持ちません — 存在しなかったものに対する「以前の値」はありません。
  
* 値が変更されなかったインスタンスでも、現在の値と等しい previous-member を持ちます。これは `changedAttributes` が属性名の粒度しか持たず、それを省略すると #1813 が修正したまさに「何も変更されていないように見える」ギャップが再現されるためです。
  
* 形状は**現在の**状態に従います。属性が現在単一インスタンスである場合、出力は単一オブジェクトのままで、配列に変換されることはありません。

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

**NGSIv2 サブスクリプション**は Orion 互換のボディを維持します — NGSIv2 表現 (属性 `type` は値の型: `Number` / `Text` / …) の `subscriptionId` + `data[]` — `id` / `type` の Notification エンベロープは**ありません**。`notifiedAt` と `triggerReason` はそのパスにおける GeonicDB の拡張です。

`protocol` フィールドが存在する前に作成されたサブスクリプション (#1570) はプロトコルを持ちません。これらは、どちらかの形式に推測されるのではなく、レガシー (内部) 形状のまま変更されずに配信されます。

両方の配信ルート — Lambda パイプライン (`matcher` → SQS → `notifier`) とスタンドアロンのインプロセスサービス (`npm start` / E2E) — は、エンティティ変更とルールトリガー通知の両方について、**同じ**共有関数 (`formatNotificationData` / `buildNotificationBody`) を通じてボディを構築するため、2 つのルートが乖離することはありません。

### HTTP 配信トランスポート (#2932)

アウトバウンド HTTP 通知 (エンティティサブスクリプション、CSource サブスクリプション、ReactiveCore `webhook` アクション) は `pinnedRequest` を使用します。Context Brokerはエンドポイントホストを**一度**解決し、SSRF ブロックリストに対してアドレスを検証し、TCP 接続をその IP に固定することで、チェックと接続の間の DNS リバインディングが内部アドレスに到達できないようにします。

**リダイレクトは追跡されません。** `3xx` レスポンスは配信失敗です (ETSI GS CIM 009 V1.8.1 clause 5.8.6 は `200 OK` 以外のステータスをすべて失敗として扱います) そして一時的なものとして**再試行されません**。受信者が異なる URL を必要とする場合は、その URL をサブスクリプション / webhook 設定に直接入れてください — 最初のホップからの `301`/`302`/`307`/`308` に依存しないでください。

### マッチングにおけるプロトコル分離 (#2253)

上記の段落はボディの *形式* についてです。マッチング自体は別の問題であり、#2253 以前は `protocol` を全く見ていませんでした。候補となるサブスクリプションは `tenant` + `servicePath` + `entityTypes` + `status` のみで選択されていました。エンティティはプロトコル分離されています (#964 — NGSIv2 API を通じて作成されたエンティティは NGSI-LD の読み取りからは見えず、その逆も同様)。そのため、**変更イベントはその境界を越える唯一のものでした**。`POST /v2/entities` を通じて `Room` を作成すると、`Room` を監視している NGSI-LD サブスクリプションに通知され、その逆も同様でした。エラーは発生しませんでした。受信者は単に、読み取ることができないエンティティの id、type、および属性値を知るだけでした。

マッチングは現在、サブスクリプションの `protocol` (作成時に記録、#1570) と変更イベントのプロトコルを比較します。サブスクリプションは、それが作成された API を通じて行われた変更に対してのみ発火します。このルールは 2 つの層で強制されます — `findMatchingSubscriptions` における MongoDB プッシュダウンと、両方の配信ルートで共有されるアプリケーション層のガードです — なぜなら、プッシュダウンだけでは、呼び出しサイトがプロトコルを渡すのを忘れた瞬間に静かに緩和されるからです。

**#1570 以前に作成されたサブスクリプションは `protocol` を持たず、両方のプロトコルにマッチし続けます。** どの API がそれらを作成したかを復元する方法はなく、一方を選択すると、間違っている側の配信が静かに停止します — この変更が閉じようとしているのと同じクラスの事故で、より大きな影響範囲を持ちます。プロトコル境界を越えることは認可境界を越えることにはなりません (配信される行は依然として作成者の読み取り述語を通過します、以下を参照)。そのため、これらのドキュメントをフェイルオープンのままにしておくコストは、配信を停止するよりも小さいです。意図された API を通じてそのようなサブスクリプションを再作成することで、分離にオプトインするのに十分です。

### コンテキストソース登録通知 (CSource サブスクリプション、#1837)

NGSI-LD コンテキストソース登録サブスクリプション (`/ngsi-ld/v1/csourceSubscriptions`) の場合、変更通知は `type: "ContextSourceNotification"` (ETSI GS CIM 009 Table 5.3.2-1) を使用し、`"Notification"` ではありません。`Ngsild-Trigger` ヘッダーは依然として変更クラス (`csourceRegistration-created|updated|deleted`) を示し、`id` は既存の GeonicDB プレフィックス契約を持つ有効な URI (`urn:ngsi-ld:Notification:`) であり続けます。

**サブスクリプション作成時の初期通知 (#1764)。** `csourceSubscription` を作成すると、**マッチする既に登録されているコンテキストソース登録ごとに 1 つの通知が送信されます** (ETSI GS CIM 009 clause 5.11.7)。これがないと、サブスクリプションライバーは次の登録変更まで何も知ることができないため、既存のコンテキストソースは見えないままになります。初期通知は変更通知パスを再利用するため、同じマッチングルール、行レベル読み取りリダクション (#2133)、1 日あたりの通知クォータ (#1544)、および `@context` 選択 (#2025) が適用されます。配信は fire-and-forget です。初期通知の失敗は `201` をロールバックしません。

**既知のギャップ** (個別に追跡、#1765 では対処されていません):

| Gap                                                                                                                                                                                                                                                                                                          | Issue                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `concise` is not fully concise: it drops the reserved sub-attributes `unitCode` / `observedAt` / `datasetId`, and renders user-defined sub-attributes in normalized form (a sub-Property should collapse to its bare value). Not notification-specific — `GET /entities?format=concise` behaves the same way | [#1779](https://github.com/geolonia/geonicdb/issues/1779) |

以下の両方のギャップは Epic [#1979](https://github.com/geolonia/geonicdb/issues/1979) の PR-F によって閉じられ、「通知 `@context`」および「NGSIv2 `attrsFormat`」に記載されています。NGSIv2 `attrsFormat` は現在、通知ボディに適用されます ([#1780](https://github.com/geolonia/geonicdb/issues/1780))。また、NGSI-LD 通知はその `@context` を運びます ([#1841](https://github.com/geolonia/geonicdb/issues/1841) / [#1781](https://github.com/geolonia/geonicdb/issues/1781))。

### 通知 `@context` (#1841)

ETSI GS CIM 009 clause 5.8.1.4 は、通知をサブスクリプションの `jsonldContext` と共に送信することを要求しています。それが与えられていない場合、**フィールドは初期化されます**。サブスクリプションに適用可能な `@context` (clause 5.5.5 — 最低限コア `@context`) で初期化されます。仕様が書き込みを義務付けている ("shall be **initialized**") ため、GeonicDB は作成時およびリクエスト `@context` を運ぶ任意の `PATCH` 時に初期化します。**その `PATCH` が含むメンバーが何であれ** (#2040) — そして、フィールドがまだ未設定の間のみです (#2029 / #2041)。GeonicDB は `notification.endpoint.accept` によって選択された方法で、それを正確に 1 回配信します。

| `accept`                          | Delivery                                                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `application/ld+json`             | `@context` member in the notification body                                                               |
| `application/json` (default)      | `Link` header (`rel="http://www.w3.org/ns/json-ld#context"`)                                             |
| `application/geo+json`            | body `@context` by default; `Link` header when `receiverInfo` carries `Prefer: body=json` (clause 6.3.8) |
| MQTT endpoints                    | `@context` member in the body (MQTT has no headers)                                                      |
| `httpCustom` (`payload` / `json`) | neither — the body is user-defined, so claiming a `@context` for it would be wrong                       |

両方が一緒に送信されることは決してありません。2 つの情報源があると、受信者がアクティブな `@context` について意見が一致しない可能性があります (リクエスト側の clause 6.3.5 "No mixes" と同じ理由)。これは GeonicDB 自体がアタッチするコンテキストを制約します — `notification.endpoint.receiverInfo` は独自の `Link` ヘッダーを追加する可能性があり、それは生成されたコンテキスト `Link` に追加されます (置き換えることはありません)。

`jsonldContext` 自体は、単一の参照可能な URI 文字列のみを受け入れます。サブスクリプションリクエスト `@context` 内の 1 要素 URI 配列は、その URI に畳み込まれます (#2344) — すでに参照可能であるため、`ImplicitlyCreated` コピーは作成されません。インラインオブジェクトまたは混合 / 複数 URL 配列は、サブスクリプションリクエスト `@context` (`jsonldContext` が省略された場合に使用されます) を通じてのみ通知パスに到達できます。そのようなコンテキストは完全な形で `Link` ヘッダーに運ぶことができないため、`application/json` の場合でもボディに配置されます — URL 部分だけを発行すると、インラインで定義された用語が静かにドロップされます。

### GeoJSON 通知 (`accept: application/geo+json`

) — #1762

ETSI GS CIM 009 clause 5.2.15 は `application/geo+json` を `notification.endpoint.accept` が取りうる 3 つの値の 1 つとして列挙しており、clause 6.3.8 では通知バインディングにおいて明示的にカバーしています。したがって、GeonicDB は **通知ボディを GeoJSON としてレンダリング**し、単に `Content-Type` を設定するだけではありません — 通常の NGSI-LD `Notification` オブジェクトを含む `Content-Type: application/geo+json` は、ペイロードについての誤った主張となります。

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

形状に関する注記、**clause 6.3.8 は形状を指定していない**ため(MIME タイプと `@context` の配置場所のみを定義しています):


* トップレベルは `FeatureCollection` であり、clause 6.3.4 が Query Entities に対して定義する GeoJSON 表現と一致します — 通知の `data` メンバーはエンティティのリストです。
  
* `subscriptionId` / `notifiedAt` / `triggerReason` は **RFC 7946 §6.1 foreign members** として保持されるため、GeoJSON にすることでサブスクリプション ID を失うことはありません。
  
* `Notification` メンバーの `id` と `type: "Notification"` は出力**されません**:`type` は GeoJSON によってオブジェクト種別用に予約されているため、そこに `"Notification"` を書くとボディが無効な GeoJSON になります。
  
* `notification.format` (`normalized` / `concise` / `keyValues`) は適用**されません** — GeoJSON は独自の表現であり、`properties` は簡略化された値を保持します。同じ理由で、`showChanges` の `previous*` メンバーは GeoJSON 通知には存在しません。必要な場合は `normalized` または `concise` を使用してください。
  
* Feature の `geometry` は `location` 属性から取得されます。それを持たないエンティティは `"geometry": null` を受け取ります(RFC 7946 に従って有効です)。
  
* `properties` 内の属性名とエンティティタイプは、通知の `@context` でコンパクト化されます。これは他のすべての通知表現と同じです(clause 5.5.7)。

`accept: application/geo+json` を持つ MQTT エンドポイントは、同じ `FeatureCollection` ボディを受信します(エンベロープはトランスポート非依存です)。clause 6.3.8 の `Link` ヘッダーブランチのみが HTTP 固有です。

`ContextSourceNotification` (`csourceSubscriptions` の登録変更通知)は同じルールに従います(#2025):`@context` はサブスクリプションの `jsonldContext`、または csource サブスクリプションが作成/更新されたときに適用された `@context` であり、`endpoint.accept` は上記と同様にボディ対 `Link` ヘッダーを選択します。#2025 以前は、`accept` に関係なく、常にボディ内のコア `@context` でした。

`notification.format` は **受け入れられて保持されますが、`ContextSourceNotification` ボディには影響しません**(#2159)。Table 5.3.2-1 は `data[]` を `CSourceRegistration` の配列(カーディナリティ 1)として定義していますが、`normalized` / `concise` / `keyValues` は Entity 表現(clause 4.5)です — それらが選択するレジストレーションレンダリングは存在しません。3 つの値すべてが受け入れられ(`simplified` は取り込み時に `keyValues` に正規化されます、#2103)、`GET` によってそのまま返されます。通知ボディはすべてのケースで完全な登録ドキュメントです。#2159 以前は、共有 `NotificationParams` スキーマと OpenAPI ドキュメントがそれを宣言していたにもかかわらず、サービス層は `concise` を `400` で拒否していました。

`data[]` 内の属性名は同じ `@context` でコンパクト化されます(clause 5.5.7、#1788)。したがって、通知とその `@context` で発行された `GET` は属性を同一にスペルします。完全修飾 IRI として保存された名前はコンパクト化されます。そのまま保存された裸の名前はそのまま残されます(変更イベントはエンティティの `attrNameForm` を保持しないため、それらを展開するとレガシーの短い名前が IRI に変わる可能性があります)。これはエンティティ `type` のコンパクト化が既に従っているのと同じルールです。

NGSIv2 サブスクリプションは `@context` メンバーまたは `Link` ヘッダーを受信しません。

### NGSIv2 `attrsFormat` (#1780)

`attrsFormat` は通知ボディの形状を選択し、NGSIv2 HTTP 通知の `Ngsiv2-AttrsFormat` ヘッダーにエコーされます:

| `attrsFormat`          | `data[]` element                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| `normalized` (default) | `{"id": ..., "type": ..., "temperature": {"type": "Number", "value": 25}}`                          |
| `keyValues`            | `{"id": ..., "type": ..., "temperature": 25}`                                                       |
| `values`               | `[25]` — values only, ordered by `notification.attrs` (attribute name order when `attrs` is absent) |

`protocol` フィールドが存在する前に作成されたサブスクリプション(#1570)は、レガシーの normalized 形状のままにされます:それらの API プロトコルは判定できず、推測するとレシーバーが既にパースしているボディを書き換えることになります。それらは同じ理由で `Ngsiv2-AttrsFormat: normalized` を受信し続けます。

`httpCustom` (`payload` / `json`)がボディを定義する場合、ヘッダーは `custom` となり、Orion と一致します("If text based or JSON payloads are used ... then `Ngsiv2-AttrsFormat` header is set to `custom`")。

**NGSI-LD サブスクリプションはこのヘッダーを受信しません。** その語彙(`normalized` / `keyValues` / `values`)は NGSIv2 のものです。NGSI-LD 表現(`normalized` / `concise` / `keyValues`)を記述するためにそれを使用すると、レシーバーに誤った情報を与えることになります。#1780 以前は、ヘッダーはハードコードされた `normalized` ですべての通知に送信されており、NGSI-LD 通知が NGSIv2-normalized であると主張していました。

### 通知におけるリンクされたエンティティの取得 (`notification.join` / `joinLevel`

、NGSI-LD、#2104)

ETSI GS CIM 009 Table 5.2.14.1-1 は、`join` と `joinLevel` を NotificationParams メンバーとして定義しています。これらは**通知ペイロード内のリンクされたエンティティの取得**を制御し、エンティティ読み取り時の `join` / `joinLevel` クエリパラメータと同じセマンティクスを持ちます(clause 4.5.23)。

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

両方のメンバーは永続化され、`GET /ngsi-ld/v1/subscriptions{,/{id}}` によって返されます。未設定のメンバーはデフォルト値で具体化**されない**ため、join を要求しなかったサブスクリプションは、その表現内に `"join": "@none"` が追加されることはありません。

解決処理はエンティティ読み取りと同じコードパスを通るため、`ListRelationship` (`objectList`)、配列の `object` を持つ `Relationship`、およびマルチ属性インスタンスはすべて走査されます(#2225)。また、`keyValues` ペイロードは、Relationship の値をサブメンバーを追加するのではなく、ターゲットの簡略化された表現(clause 4.5.3 EXAMPLE 9 / EXAMPLE 17)で置き換えます。

> **認可。** リンクされたエンティティは、サブスクリプションが宣言しなかったターゲットであるため、**サブスクリプション作成者の**行レベル読み取り述語によってフィルタリングされます。この述語は、CSource 通知パスが使用するものと同じヘルパー(#2133)と、HTTP join と同じ自由な `entityType` ディシプリン(#2213)を使用して導出されます。述語が決定できない場合(`createdBy` がない、作成者が削除された、非アクティブ化された、またはテナント内のアクティブなメンバーシップを持たない、テナントが解決できない、またはユーザードキュメントをまったく持たない認証情報によって作成されたサブスクリプション — API キーの `createdBy` は `apikey:<keyId>` であり、OAuth クライアントの場合はクライアント id)、join は**ゼロ個**のリンクされたエンティティに解決され、通知は埋め込みデータなしで配信されます。`join` は追加の表現であるため、通知が送信されるかどうかを変更してはなりません。[AUTH.md](../reference/auth.md) を参照してください。
>
> **両方の配信パスに適用されます。** join は、Lambda マッチャーとスタンドアロン通知サービスの両方で使用される共有ヘルパーによって適用され、エンティティ変更通知と ReactiveCore ルール通知の両方に対応します。NGSIv2 サブスクリプション(および `protocol` を持たない #1570 以前のサブスクリプション)は影響を受けません — `join` は NGSI-LD メンバーです。
>
> **解決の失敗が通知を抑制することはありません。** リンクされたエンティティの解決はデータベースを読み取るため、一時的に失敗する可能性があります。共有ヘルパーはこれらの失敗を吸収し、**join 前の**ペイロードで通知を配信します(`NOTIFICATION_JOIN_RESOLUTION_FAILED` としてログに記録)。これは、上記の決定不可能な述語が配信を削除するのではなくゼロ個のリンクされたエンティティを生成するのと同じ理由によるものです。`join` は追加の表現であるためです。この方向での失敗はデータを保留するものであり、決して公開することはありません。

### 作成 / 更新時のフィールド検証

ETSI GS CIM 009(clause 4.21 / 5.8.1)によれば、一部のサブスクリプションフィールドは組み合わせることができません。これらは、作成 / 更新時に `400 BadRequest` で拒否されます(意味が未定義のサブスクリプションを作成するのではなく)。

| Rule                                                                                                  | Reason                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `throttling` ⊥ `timeInterval`                                                                         | These are distinct operating modes: `throttling` sets a minimum interval between change-triggered notifications, `timeInterval` sends periodic notifications.    |
| `watchedAttributes` ⊥ `timeInterval`                                                                  | A `timeInterval` subscription is **periodic-only** — entity changes never trigger it — so watching attributes would have no effect (ETSI GS CIM 009 clause 5.8). |
| At most one include selector (`notification.pick` / `notification.attributes` / `notification.attrs`) | The include-style attribute selectors are mutually exclusive; `pick` and `attributes`/`attrs` map to the same internal include projection.                       |
| At most one exclude selector (`notification.omit` / `notification.exceptAttrs`)                       | The exclude-style attribute selectors are mutually exclusive; `omit` and `exceptAttrs` map to the same internal exclude projection.                              |
| Include ⊥ exclude                                                                                     | An include selector cannot be combined with an exclude selector (`pick`/`omit` are mutually exclusive per clause 4.21).                                          |

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

Slack Webhook にカスタム形式の通知を送信:

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

これにより、同じエンティティの変更通知が 60 秒ごとに 1 回に制限されます。

### 3. Set an Expiry

テスト用のサブスクリプションには `expires` を設定します:

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

`inactive` に設定して、一時的に通知を停止します:

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

> **注意**: `super_admin` はサブスクリプションエンドポイント (`/v2/subscriptions`、`/ngsi-ld/v1/subscriptions`) にアクセスできません。これらはデータ API であるためです。代わりに `tenant_admin` または `user` ロールを使用してください。

認証が有効な環境では、サブスクリプションに所有権ベースのアクセス制御が適用されます。

### 動作


* サブスクリプションが作成されると、認証されたユーザーの ID が `createdBy` フィールドに記録されます。
  
* **更新 (PATCH) および削除 (DELETE)** は、以下のいずれかの条件を満たすユーザーのみが実行できます:
  
  * サブスクリプションの作成者 (`createdBy` が一致)
    
  * `tenant_admin` ロール
    
* 上記の条件を満たさない場合、**404 Not Found** が返されます (#2189)。`403` を返すと、読み取りができないプリンシパルに対してサブスクリプションの存在を確認することになります — 読み取りパスはサブスクリプションを隠すため (#2140)、書き込みパスで `403` を返すとその存在が漏洩します (**存在オラクル**)。`404` は「そのようなドキュメントは存在しない」と区別がつきません。
  
* **`createdBy` を持たない**サブスクリプション (そのフィールドが存在する前に作成されたもの) も、更新および削除時に非管理者に対して **404 Not Found** を返します (#2161)。`tenant_admin` は引き続きそれらのドキュメントを管理できます。

> **`super_admin` はここでのエスケープハッチではありません。** サービスレイヤーの所有権チェックは `super_admin` をスキップしますが、認証が有効な場合、そのロールはこれらのエンドポイントに到達しません: `SUPER_ADMIN_DATA_API_DENY_FENCE` (`policy.defaults.ts`) は、カスタムポリシーが解除できない deny-overrides フェンスとして `/v2/**` および `/ngsi-ld/**` を `super_admin` に対して厳格に拒否し、プラットフォーム管理者がテナントデータに触れられないようにしています。サブスクリプションと登録を実際に管理できる管理者ロールは **`tenant_admin`** です。(`AUTH_ENABLED=false` の場合、すべてのリクエストは合成された `super_admin` となり、フェンスは適用されませんが、その場合、所有権の強制自体も存在しません。)
> 

* **取得 (GET) および一覧表示 (LIST)** は所有権チェックの対象外です — 作成者によってフィルタリングされません — しかし、これはテナント内のすべてのドキュメントが表示されるという意味では**ありません**。#2140 以降、読み取りは行レベルの読み取り述語を通過します: プリンシパルが読み取れないエンティティタイプのみを宣言しているサブスクリプションは完全に非表示になり (ID による取得では 404、リストとカウントから除外、通知エンドポイント URL を含む)、読み取り不可能なタイプセレクターは混合サブスクリプションから削除されます。
  
* **配信は作成者の読み取り述語によってフィルタリングされます (#2205)**。上記の #2140 は*サブスクリプションドキュメント*が表示可能かどうかを決定します; サブスクリプションが配信するエンティティについては何も述べていません。サブスクリプションの書き込みはサブスクリプションリソースパスをフレームとして認可されるため、`GET /ngsi-ld/v1/entities` を制限するポリシーはサブスクリプション作成にまったく適用されません — タイプを拒否されたサブジェクトがそれをサブスクリプションライブし、通知として受信できてしまいます。したがって、すべての通知は配信時に作成者の行レベル読み取り述語でフィルタリングされ、3 つの次元すべて (`entityType`、`entityOwner`、`scope`) にわたって実エンティティ上で評価されます。不変条件は: **作成者 P が `GET /ngsi-ld/v1/entities` で見ることができない行は、P のサブスクリプションに配信されない**というものです。これにより、2 つの長年のギャップも埋められます — 制限が厳格化される前に作成されたサブスクリプションは、`PATCH` 時だけでなく配信ごとに再評価され、`scope` / `entityOwner` 次元は具体的なタイプセレクターにも適用されます。
  ユーザードキュメントを持たない作成者 — **API キーと OAuth クライアント** — は、それぞれにバインドされたポリシーに対して評価されます (#2282): サブスクリプションは作成者のプリンシパル種別 (`createdByRole`) を保存し、述語はクレデンシャルドキュメントから派生し、`policyId` は**ライブ**で読み取られるため、キーの再バインドは次回の配信時に有効になります。プリンシパル種別は `createdBy` の形状から推測されることはないため、API キー ID のように見えるユーザー ID がクレデンシャルのポリシーで評価されることはありません。
  述語を決定できない場合、配信は**停止**します (フェイルクローズ、`securityEvent` 警告ログ付き)。条件はプリンシパル種別によって異なります。**すべての**作成者に対して: 保存された `createdBy` がない (レガシードキュメント)、解決できないテナント、またはエンティティ読み取りを完全に拒否する述語。**ユーザー**作成者に対しては追加で: アクティブなユーザーに解決できない作成者 (削除 / 無効化)、または通知対象テナントでアクティブなメンバーシップを持たないユーザー。**クレデンシャル**作成者 (`api_key` / `oauth_client`) の場合、ユーザーとメンバーシップ条件はまったく適用されません — 代わりに: 保存された `createdByRole` がない (#2282 以前に書き込まれたサブスクリプション)、または欠落している、取り消されている (`isActive: false`)、あるいは異なるテナントに属するクレデンシャルドキュメント。`AUTH_ENABLED=false` の場合、述語自体が存在せず、配信は制限なしで、HTTP 読み取りパスと一致します。

> **注意**: 同じ所有権検証が登録 (`/v2/registrations`、`/ngsi-ld/v1/csourceRegistrations`) および — #2188 以降 — コンテキストソースサブスクリプション (`/ngsi-ld/v1/csourceSubscriptions`) にも適用されます。同じ契約は #2198 以降、カスタムデータモデル (`/custom-data-models`) もカバーします。4 つすべてが共有するのは: 管理者バイパス、`createdBy` が欠落 → `404`。**所有者の不一致はサブスクリプション / 登録 / csource-subscriptions では `404` です (#2189) が、カスタムデータモデルでは `403` のままです** — カスタムデータモデルは行レベル読み取り述語の対象外であるため、その存在は `GET` で制限された呼び出し元にも表示され、閉じるべき `404` 対 `403` 存在オラクルは存在しません。

### サブスクリプション書き込みに対する XACML 属性ベース制御 (#1104 / #2005)

すべてのサブスクリプション**書き込み** — 3 つのサブスクリプションリソースすべてにわたる作成*および*更新 — において、XACML PIP はサブスクリプションターゲット属性を `AuthzRequest.resource` に注入し、きめ細かなポリシー制御を可能にします:

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

`entities[]` に複数の要素が含まれる場合、書き込みが成功するには**すべての要素が Permit でなければなりません** (全 Permit セマンティクス)。単一の不一致タイプまたは ID パターンがリクエスト全体を `403 Forbidden` で拒否します。

サブスクリプションは継続的な読み取りであるため、更新は**更新後の有効値**で評価されます: リクエストボディが宣言する値、または — ボディがそれらに触れない場合 — すでに保存されている値です。したがって、制限された呼び出し元は、許可されたサブスクリプションを制限されたタイプに交換することも、他のフィールドのみを編集して今や制限されたサブスクリプションを存続させることもできません。制限されたサブスクリプションを許可されたタイプに絞り込むことは許可されます。

> リテラル `body.type === "Subscription"` は `entityType` に伝播**されません**。ポリシーはラッパーオブジェクトのタイプではなく、`entities[].type` をターゲットにする必要があります。
>
> `path` を `/ngsi-ld/v1/subscriptions` に対して完全に一致させるポリシーは、作成呼び出しのみをカバーします。更新もカバーするには glob (`/ngsi-ld/v1/subscriptions**`) を使用してください — `*` は `/` を越えません。

認証と認可の詳細については、[AUTH.md § Subscription PIP attributes](../reference/auth.md#subscription-pip-attributes) を参照してください。

***

## トラブルシューティング

### 1. Notifications Are Not Being Delivered

**原因:**

* 条件式が一致しない
  
* 通知先 URL に到達できない
  
* サブスクリプションが `inactive` または期限切れ
  
* テナントの日次通知ファンアウトクォータ(`maxNotificationsPerDay`、#1544)が
  その日分として使い果たされた — [QUOTAS.md](../saas/quotas.md#notification-fan-out-quota-1544) を参照。
  これにより、個々の通知が(警告ログと
  `notificationQuotaExceeded` メトリックとともに)ドロップされますが、サブスクリプション自体には触れず、
  HTTP エラーも返しません。配信はトリガーとなる API リクエストの外で行われるためです。
  **`remaining: 0` で `limit > 0`** の場合、次の UTC 深夜 0 時に自動的にクリアされます(カウンターは UTC 日単位のバケットです)。**`limit: 0` は明示的で永続的な停止** であり、そのテナントに対して自動的にクリアされることはなく、
  `PUT /admin/tenants/{tenantId}/quotas` によるクォータ変更が必要です
  
* **変更が他の API プロトコル経由で行われた(#2253)。** `/ngsi-ld/v1/subscriptions` 経由で作成されたサブスクリプションは NGSI-LD エンティティの変更に対してのみ発火し、`/v2/subscriptions` 経由で作成されたものは NGSIv2 の変更に対してのみ発火します。エンティティを書き込む API 経由でサブスクリプションを再作成してください。(#1570 以前に作成されたサブスクリプションは例外で、両方に一致します。)
  
* **作成者がエンティティを読み取れない(#2205)。** 配信はサブスクリプション作成者の行レベル読み取り述語によってフィルタリングされるため、
  `GET /ngsi-ld/v1/entities` でそのプリンシパルから隠された行は配信もされません。API キーおよび OAuth クライアントの作成者は、自身にバインドされたポリシーに対して判断されます(#2282)。述語が決定できない場合、配信は完全に停止します — すべての作成者について:保存された `createdBy` のないレガシーサブスクリプション、**ユーザー**作成者の場合:アクティブなユーザーに解決されなくなった作成者、またはテナント内のアクティブなメンバーシップを持たない作成者、**認証情報**作成者の場合:保存された `createdByRole` がない、または取り消された / 削除された / 別のテナントからの認証情報(ユーザーおよびメンバーシップの条件は認証情報には適用されません)。
  サーバーログには
  `errorCode: SUBSCRIPTION_NOTIFICATION_RLS_DENIED`(述語が拒否)または
  `SUBSCRIPTION_NOTIFICATION_RLS_SKIPPED`(述語が決定不可)が `subscriptionId` とともに記録されます。

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

**解決策:**

* 条件式をテストする:手動でエンティティを更新し、条件が満たされることを確認する
  
* 通知 URL をテストする:`curl` を使用して直接到達可能であることを確認する
  
* ステータスを `active` に変更する
  
* `currentUsage.notifications.day.remaining` が `0` の場合、配信は UTC 深夜 0 時に自動的に再開されます。プラン制限を超える持続的なニーズがある場合は、
  `customQuotas.rateLimit.maxNotificationsPerDay` のオーバーライドをリクエストしてください

### 2. Notifications Are Duplicated

**原因:**

* `throttling` が設定されていない
  
* 複数のサブスクリプションが同じエンティティを監視している

**解決策:**

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
  
* `attrsFormat` が適切ではない
  
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
  
* 認証資格情報が正しくない
  
* トピック名が無効である

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

* 通知の送信先が一時的なエラー(5xx、429、タイムアウト)を `NOTIFICATION_AUTO_PAUSE_AFTER_MS`(デフォルト 1 時間)の間返し続け、成功した配信がない場合(#3080)、GeonicDB はサブスクリプションの `status` を `inactive` に設定し、`autoDisabledAt`(GeonicDB 拡張)を記録するため、Context Brokerの自動一時停止と手動の一時停止を区別できます。
  
* Web Push の送信先が `404` / `410` を返す場合、代わりに `status` が `failed` に設定されます(#3014)。

**確認方法:**

* サブスクリプションを `GET` する:`status` が `inactive`(NGSI-LD では `paused` として表示されます)であり、`autoDisabledAt` が存在する
  
* CloudWatch メトリクス `GeonicDB/SubscriptionAutoPaused` / アラーム `subscription-auto-paused`

**解決方法:**

* 通知の送信先が 2xx で応答するように修正する
  
* サブスクリプションを `active` に戻す(NGSIv2 では `status: "active"` で `PATCH` するか、NGSI-LD では `isActive: true` にします)。これにより、`autoDisabledAt` と失敗ストリークがクリアされます

***

## 関連ドキュメント


* [API Common Specification](../api-reference/endpoints.md) - REST API ドキュメント
  
* [API\_NGSIV2.md](../api-reference/ngsiv2.md) - NGSIv2 Subscriptions API リファレンス
  
* [API\_NGSILD.md](../api-reference/ngsild.md) - NGSI-LD Subscriptions API リファレンス
  
* [EVENT\_STREAMING.md](./subscriptions.md) - WebSocket イベントストリーミング
