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
  
* [実用的な例](#practical-examples)
  
* [ベストプラクティス](#ベストプラクティス)
  
* [アクセス制御と所有権（GeonicDB 拡張）](#access-control-and-ownership-geonicdb-extension)
  
* [トラブルシューティング](#トラブルシューティング)

***

## 概要

サブスクリプションは、エンティティの作成、更新、削除を監視し、定義された条件が満たされたときに指定されたエンドポイントに通知を送信します。

### 主なユースケース


* **センサーデータの監視**: 温度、湿度などのしきい値超過を検出
  
* **位置追跡**: 車両やデバイスの位置変更を追跡
  
* **イベント駆動アーキテクチャ**: エンティティの変更によってトリガーされる自動処理
  
* **データ統合**: 他のシステムへのリアルタイムデータ配信

### サポートされている API

| API     | Endpoint                    | Support |
| ------- | --------------------------- | ------- |
| NGSIv2  | `/v2/subscriptions`         | ✅       |
| NGSI-LD | `/ngsi-ld/v1/subscriptions` | ✅       |

> **注意 (#1304 / #2337)**: ホスト名ルーティングされたデプロイメント（マルチサブドメイン構成の専用 DB）でも購読は発火します。API 経由のエンティティ変更はリクエストスコープでイベントを発行し、発生元デプロイメントの情報（`deployment.hostname`）を運んで背景ワーカーが正しい DB に対してマッチング・通知・状態更新を行います。**制限**: デプロイメント DB への直接 DB 書き込み（API を経由しない変更）はイベントを発火しません。AWS は EventBridge が一次ソース。Standalone の購読は `LocalEventBusPublisher` 一本で、Change Stream は ReactiveCore Rules 専用 — 物理削除で `fullDocument` が取れない Change Stream を購読の一次ソースにすると tenant が `'unknown'` になり沈黙する (#2337)。また、デプロイメント行の登録・有効化はキャッシュ（最大 30 秒。DynamoDB 障害時は最大 5 分 30 秒）の反映後にワーカーへ届きます。

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

**レイテンシー**: API 経由の通常のエンティティ作成 / 更新 / 削除の場合はほぼ即座です。TTL 失効の場合は、失効スイーパーのポーリング間隔（`ENTITY_EXPIRY.SWEEP_INTERVAL_SECONDS`、[QUOTAS.md](../saas/quotas.md#ttl-失効-expiresat-expiry-sweeper1561) を参照）の最大約 1 分が追加され、その後 `EntityDeleted` 通知がこのパイプラインに入ります。

### EntityDeleted トゥームストーンと `previousAttributes` (#2439 / #2631 / #2671)

NGSI-LD 削除通知は、削除された属性を `urn:ngsi-ld:null` トゥームストーンとしてレンダリングします
（また、`attributeDeleted` トリガーを発火する場合もあります）。どちらも
`EntityDeleted` イベントの `EntityChangeEvent.changes.previousAttributes` が必要です。

| Source of `EntityDeleted`                                                                                                   | Supplies `previousAttributes`?                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| API delete / purge via `EntityService` (`deleteEntity`, …) (#2337)                                                          | Yes — attributes read before delete                                                                                                                                                                                                                                                  |
| TTL expiry via `EntityExpiryService` ([#1561](https://github.com/geolonia/geonicdb/issues/1561))                            | Yes — claimed document before soft-delete                                                                                                                                                                                                                                            |
| MongoDB Change Stream pre-image (`changeStreamPreAndPostImages`, [#1411](https://github.com/geolonia/geonicdb/issues/1411)) | **Not used.** The CDC `ChangeStreamProcessorFunction` and pre-image enablement were removed in [#1560](https://github.com/geolonia/geonicdb/issues/1560); resurrecting them would double-publish. On standalone, Change Stream remains Rules-only (`CHANGE_STREAM` in `defaults.ts`) |

**[#2631](https://github.com/geolonia/geonicdb/issues/2631) の判断**: #1411 / change-stream 配線がオフの場合にトゥームストーンが暗黙的に無効化されるという前提は、**現在の main では成立しません**。Context Broker起動時に検出するランタイムフラグはなく、プリイメージ依存関係の欠落に対するサブスクリプション作成時の 4xx もありません。TTL 削除の可観測性は #1561 スイーパーで既に fail-loud です: `publishFailures > 0` は Lambda 呼び出しを失敗させ、`ExpirySweeperErrorsAlarm` が発火します（[QUOTAS.md](../saas/quotas.md#ttl-失効-expiresat-expiry-sweeper1561) を参照）。

**可観測性フォローアップ ([#2671](https://github.com/geolonia/geonicdb/issues/2671))**: それでも `EntityDeleted` イベントが `previousAttributes` **なしで**到着した場合（パブリッシャーのバグまたは将来の発行サイト）、マッチャーとスタンドアロン通知者は **warn** をログに記録し、トゥームストーン / `attributeDeleted` が暗黙的に空にならないようにします。空のオブジェクト `{}`（属性のないエンティティ）は有効であり、警告は**出しません**。別途、単一エンティティの `safePublishEntityChangeEvent` は依然として公開失敗を `logger.error` のみで飲み込みます（スイーパーとは異なり）— #2671 で追跡中です。

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

#### httpCustom.json (型保持テンプレート)

`payload` は文字列テンプレートであるため、置換されたすべての値は文字列になります。**属性の型を保持する**必要がある場合(数値は数値のまま、真偽値は真偽値のまま)、代わりに `httpCustom.json` を使用してください(FIWARE Orion との互換性)。`json` はオブジェクトまたは配列テンプレートを受け入れ、`payload` とは**相互排他的**です。

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


* **単独マクロ値**(`"${temperature}"`)の場合:属性値は元の JSON 型でインライン展開されます(数値 → 数値、真偽値 → 真偽値、オブジェクト/配列 → オブジェクト/配列)。存在しない属性は `null` になります。
  
* **部分マクロ値**(`"prefix-${id}"`)の場合:常に文字列を生成します。
  
* **キーは置換されません** — キー内のマクロ(`"${id}": ...`)は `400` エラーで拒否されます。
  
* テンプレートは作成時に制約されます:シリアライズサイズ ≤ `MAX_PAYLOAD_LENGTH` かつネスト深度 ≤ `MAX_JSON_DEPTH`。違反は `400` エラーで拒否されます。
  
* 通知はデフォルトで `Content-Type: application/json` で送信されます。これは `receiverInfo`(カスタムヘッダー)で上書きできます。

上記のサブスクリプションで配信される本文の例(temperature = 25.5、active = true):

```json
{ "room": "Room1", "temp": 25.5, "active": true, "unit": "celsius" }
```

### MQTT

MQTT ブローカーにメッセージを公開します。

**Context Broker宛先ポリシー (#3587):** Context Broker URL (`notification.mqtt.url` / `mqttCustom.url` は NGSIv2、`notification.endpoint.uri` は NGSI-LD) は HTTP 通知 URL と同じ SSRF ポリシーを通過します。`mqtt://` と `mqtts://` のみが許可されます。プライベート、ループバック、リンクローカル(`169.254.169.254` を含む)、CGNAT、または IPv6 ULA アドレス上のContext Brokerは、作成および更新時に `400` で拒否されます。10 進数または 16 進数で記述された IPv4(`mqtt://2852039166`)は、チェック前に正規化されます。配信時にContext Brokerのホスト名が**一度**解決され、解決された IP がチェックされ、TCP 接続はその IP に対して行われるため、DNS リバインディングによって内部アドレスにリダイレクトされることはありません。`mqtts` は元のホスト名を TLS SNI として保持するため、証明書は引き続きそれに対して検証されます。ブロックされたContext Brokerを指す保存されたサブスクリプションは配信に失敗し、接続しません。

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

同じ NGSI 通知 JSON ボディを、VAPID を使用してブラウザ Push Service (FCM / Mozilla / Apple など) に配信します。**GeonicDB 拡張** — FIWARE Orion または ETSI Endpoint の一部ではありません。

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

**デプロイ時の VAPID キー** (デプロイメントごとにグローバル): ENV.md を参照 — `WEBPUSH_VAPID_PUBLIC_KEY` / `WEBPUSH_VAPID_PRIVATE_KEY` / `WEBPUSH_VAPID_SUBJECT` (staging/prod: `resolveWebPushVapidSecrets()` 経由の `geonicdb-<env>` JSON シークレット、#3033; SAM プレーンパラメータはフォールバック)。公開鍵の取得: `GET /.well-known/webpush-vapid-key` → `{ "publicKey": "..." }` (未設定時は 503)。

**障害処理 (#3014 Q6):**

* Push Service `404` / `410` → 一時的でない; サブスクリプションドキュメントの `status` が `failed` になる (エンドポイントが消失 / 登録解除)。
  
* `413` → 一時的でない; そのメッセージのみ破棄 — サブスクリプションを無効化**しない**。
  
* `401` / `403` → 一時的でない; サブスクリプションを永久的に失敗としてマーク**しない**。
  
* その他の 4xx は `408` / `429` を除き一時的でない。5xx およびネットワークエラーは HTTP と同様にリトライされる。

**GET レスポンス:** `keys.auth` は `******` としてマスクされる (MQTT `passwd` と同様)。`keys.p256dh` はクリアテキストで返される。NGSI-LD レスポンスは `endpoint.webpush` を公開するが、`endpoint.protocol` は**公開しない** (Web Push は `webpush` の存在で判断)。`csourceSubscriptions` は `webpush` を `400` で拒否する。

#### アプリ実装フロー (#3060)

上記の API はワイヤーフォーマットのみをカバーします。PWA/ブラウザクライアントは以下のように接続します:


1. **サービスワーカーを登録** アプリのオリジンで: `await navigator.serviceWorker.register('/sw.js')`。
   
2. **Push に登録** `PushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` を使用して行い、`applicationServerKey` はデプロイメントの VAPID 公開鍵で、`GET /.well-known/webpush-vapid-key` から取得し、`Uint8Array` に変換します (RFC 8291)。
   
3. **`PushSubscription.toJSON()` を変換** して、上記のフィールドマッピングテーブルに従って `notification.webpush` (NGSIv2) または `endpoint.webpush` (NGSI-LD) にし、サブスクリプションを `POST` します。
   
4. **`sw.js` で `push` イベントを処理** — NGSI 通知ボディは `event.data.json()` として到着します; `self.registration.showNotification(...)` を呼び出して OS レベルの通知を表示します。

`@geolonia/geonicdb-sdk` は、`db.registerWebPushSubscription({ protocol, ... })` (#3092) として完全なアプリフローを実装します — ブラウザ登録 + 冪等 GeonicDB 作成 (localStorage バックアップ; VAPID ローテーションは `PATCH` で更新)。デフォルトの

localStorage キーは `baseUrl` + `tenant` + `protocol` のみでスコープされ、ログインプリンシパルでは**スコープされません**(`logout()` はそれをクリアしません)。複数のユーザーが 1 つのプロファイルを共有する**共有ブラウザ / キオスク**では、後の登録が以前のユーザーの `subscriptionId` を再利用し、新しい `subject` / `entities` を無視する可能性があります。SDK はプリンシパルを**自動分離しません**。呼び出し側は、デフォルトのスコープを含む明示的な `storageKey` を渡す必要があります(例: `buildWebPushSubscriptionStorageKey(baseUrl, tenant, protocol)` に `:${userId}:${filterId}` を追加)。これにより、共有ブラウザユーザー*および*異なるフィルターが分離された状態を保ちます(#3097)。メールが利用できない場合(API キーセッション)は、アプリ管理の安定した ID を `userId` に使用してください。HTTP 507 (`QuotaExceededError`) は、プランのサブスクリプション猶予上限を超えたことを意味します。未使用のサブスクリプションを削除するか、プランを変更した後にのみ再試行してください — ブラウザの `unsubscribeWebPush()` だけでは GeonicDB ドキュメントは削除されません。低レベルの要素は `db.subscribeWebPush()` + `toNgsiv2WebPushNotification()` / `toNgsiLdWebPushEndpoint()` および `db.unsubscribeWebPush()` のままです — コード付きの完全なウォークスルーについては、SDK.md → Web Push 通知を参照してください。

### NGSI-LD `notification` は閉じた構造です(#2066)

上記で説明した `http` / `httpCustom` / `mqtt` 通知スタイルとそれらのネストされたフィールド(`httpCustom.json`、MQTT `qos` / `retain` / `user` / `passwd` など)は、**NGSIv2 専用**です。NGSI-LD サブスクリプションは単一の `notification.endpoint` オブジェクト(`uri` / `accept` / `receiverInfo` / `notifierInfo` — [API\_NGSILD.md → Create Subscription](../api-reference/ngsild.md#create-subscription) を参照)を持ち、個別の `mqtt` フィールドではなく `endpoint.uri` の `mqtt://` / `mqtts://` スキームを介して MQTT 配信を選択します。NGSI-LD MQTT ペイロードは、`endpoint.receiverInfo` に `MQTT-QoS` / `MQTT-Version`(大文字小文字を区別しない)以外のエントリが少なくとも 1 つある場合を除き、トップレベルの Notification のままです。その場合、メッセージは clause 7.2 の `{"metadata","body"}` エンベロープになります(#3341)。これら 2 つのキーのみの場合は、従来のペイロードのままです。NGSIv2 MQTT ペイロードは変更されません。**Web Push** は、同じ `endpoint` オブジェクト上の GeonicDB 拡張機能です(`webpush`; オプションの書き込み専用 `protocol: "webpush"`)。パブリック GET レスポンスには `protocol` は含まれません。

\#2066 以降、`POST` / `PATCH /ngsi-ld/v1/subscriptions` は、**ETSI GS CIM 009 Table 5.2.14-1 で定義されていない `notification` のメンバー**を `400 BadRequestData` で拒否します — `endpoint` で明示的に宣言された GeonicDB 拡張機能(`webpush` / `protocol`、#3014)を除きます。NGSIv2 形式の `notification.httpCustom` / `notification.http` / `notification.mqtt` を NGSI-LD エンドポイントに送信すると、#2066 以前の動作ではなく、すぐに失敗するようになりました。以前は、未知のキーが Zod のデフォルト(strip)検証によって黙って削除され、リクエストは `201` / `204` で成功しましたが、カスタム配信設定は痕跡なく削除されていました。Subscription の**トップレベル**の JSON-LD 語彙拡張は影響を受けません。`notification` のみが閉じられています。

`POST` / `PATCH /ngsi-ld/v1/csourceSubscriptions` も同じように動作します。コンテキストソースサブスクリプションはまったく同じリクエストスキーマを再利用するため、閉じた `notification` がそこにも適用されます。

***

## 条件とフィルタリング

### NGSI-LD 通知トリガー

変更駆動型の NGSI-LD サブスクリプションで `notificationTrigger` が指定されていない場合、`["attributeCreated", "attributeUpdated"]` が使用されます。単一サブスクリプションおよびリストレスポンスは、トリガーが保存されていないサブスクリプションに対してこれらのデフォルト値を返します。定期的なサブスクリプションは、API が返すトリガー配列に関係なく、その `timeInterval` に従って配信されます。

デフォルトのペアと明示的に設定された `attributeCreated` または `attributeUpdated` は、同じ属性レベルのマッチングを使用します。監視対象の属性を持つエンティティを作成することは `attributeCreated` として認定されます。システムタイムスタンプのみを変更する書き込みを含め、同一の内容で属性を書き換えても、`attributeUpdated` としては認定されません。これは [ETSI TS 104 175 §10.5.7](https://www.etsi.org/deliver/etsi_ts/104100_104199/104175/01.01.01_60/ts_104175v010101p.pdf) の変更定義に従っています。

アップグレードする前に、削除イベントまたは型のみに影響するエンティティの変更、または属性を持たないエンティティの作成に依存する既存のサブスクリプションにパッチを適用してください。デフォルトのペアと必要なトリガーを含めてください。たとえば、この本文は属性の作成と更新の通知を保持し、エンティティの削除通知を追加します。これを `PATCH /ngsi-ld/v1/subscriptions/{subscriptionId}` に `Content-Type: application/json` とサブスクリプションで使用したものと同じテナントおよび JSON-LD コンテキストヘッダーと共に送信してください。

```json
{
  "notificationTrigger": ["attributeCreated", "attributeUpdated", "entityDeleted"]
}
```

属性の削除には `attributeDeleted` を、属性を持たないエンティティの作成には `entityCreated` を追加してください。型のみの更新には `entityUpdated` を追加してください。明示的なトリガー配列は以前の配列を置き換えます。コンパクト IRI を監視するレガシーサブスクリプションの場合、展開された URI と元の `@context` を使用して `watchedAttributes` に PATCH を適用し、その正規名が保存されるようにしてください。

NGSI-LD エンティティ ID を繰り返すバッチアップサートは、成功した書き込みごとに個別の通知を生成する可能性があります。受信側では各通知を個別に処理してください。フィルター述語とペイロードは、対応する書き込みのコミット済み状態を使用します。既存のスロットリングとエンティティ生成ガードが適用されます。イベントがパブリッシャーの予算を超えた場合、Context Brokerは現在のスナップショットを保持し、まず以前の値を変更されたインスタンスにトリミングします。それらの以前の値がまだ予算を超えている場合、配信はそれらなしでレンダリングできるサブスクリプションに制限されます。現在のスナップショットが予算を超える場合、Context Brokerはそのオカレンスを破棄し、オーバーサイズイベントを記録します。

配信はプライマリ上の物理的な MongoDB ドキュメントをチェックし、サブスクリプション作成者がキャプチャされた状態と現在の行の両方を読み取ることができる必要があります。以前の値または削除トゥームストーンの配信には、以前のスナップショットへの読み取りアクセスも必要です。削除、期限切れ、または置き換えられた物理ドキュメントは、キューに入れられたオカレンスから通知を生成できません。Lambda は、既存のキューを介して失敗したドキュメントルックアップを再試行します。Standalone は合計で最大 3 回ルックアップを再試行し、ルックアップが利用できないままの場合は破棄されたオカレンスを記録します。

共有の 1 秒デッドラインは、キュー待機とキールックアップを含む、繰り返しバッチ暗号化をカバーします。Context Brokerは、そのデッドライン内でコミット済みスナップショットの一時的な失敗を最大 3 回再試行できます。欠落したスナップショットをログに記録し、コミット済みの書き込み結果を保持します。

ローカルバッチアップサートで ID が繰り返される場合、`tenant`、`servicePath`、`entityId` に対する準備済みの MongoDB ユニークインデックス `idx_entity_unique_v3` が必要です。アップグレードする前に、重複する論理 ID を解決し、完全なユニークインデックスを構築し、Context Brokerロールがエンティティコレクションで `listIndexes` を実行できることを確認してください。インデックスが利用できない場合、バッチは 207 レスポンスで影響を受けるアイテムに対して `ServiceUnavailable` を報告し、確認された成功を含めます。

古いサブスクリプションのみのオカレンス形式を既に出力している環境からアップグレードする際は、古いプロデューサーを一時停止し、切り替える前に古いコンシューマーで保留中のオカレンスイベントをドレインしてください。新しいコンシューマーは、すべてのオカレンスにドキュメント ID フィールドを必要とします。

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

> **パターン制限。** `idPattern` と `typePattern` は通知パス上でエンティティ ID と型に対して評価されるため、壊滅的なバックトラッキングを引き起こしやすいパターンはサブスクリプション作成時に `400 BadRequest` で拒否されます。これには、ネストされた量指定子 (`(a+)+`) と**量指定されたグループ内の選択肢** (`^(a|aa)+$`、`^((a|aa))+$`) が含まれます — 完全なルールセットについては Regex Pattern Validation (ReDoS) を参照してください。文字クラスと量指定されていないグループは影響を受けません: `^urn:ngsi-ld:(Room|Vehicle):[0-9]+$` と `Room[0-9]+` は受け入れられます。

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

`typePattern` は両方の API で受け入れられます。**NGSI-LD サブスクリプションでは `type` と `typePattern` は相互排他的ではありません**: `EntitySelectorSchema` は*少なくとも 1 つ*のセレクタを必要とし、両方が存在する場合、マッチャーは `type` の完全一致と `typePattern` の正規表現を **AND** で評価します。両方とも `GET` で保持されます (#2067) ので、取得したサブスクリプションはフィルタを緩めることなく再実行できます。AND セマンティクスは確定した設計です (#2105): NGSIv2 は仕様で義務付けられた排他性を保持し (「両方を同時に使用することはできません」— 両方を指定すると `400 BadRequest` を返します)、一方 NGSI-LD では `typePattern` は GeonicDB 拡張であり、両方を AND フィルタとして受け入れます。コンテキストソースサブスクリプション (`/csourceSubscriptions`) は同じセレクタを共有し、同じルールを適用します (#2105): `typePattern` は登録されたエンティティ型に対して AND で評価され、`typePattern` のみのセレクタも受け入れられ、`typePattern` は `idPattern` と同じ作成時の ReDoS 検証を受けます。登録された型は FQN として保存されます (#1800) ので、パターンは保存された FQN とサブスクリプションのマッチング語彙 — 書き込み時の `@context` (`contextRef`、サブスクリプションが属性名を保存するたびに記録されます (#1900) **または `entities[].typePattern` セレクタ** (#2117)) またはそれ以外の場合はコアコンテキスト — で圧縮された用語の両方に対してマッチングされます。#2117 以前は、エンティティのみの csource サブスクリプションは `contextRef` を記録しなかったため、カスタム語彙に対して書き込まれた短縮名の `typePattern` はマッチすることができませんでした (回避策はサブスクリプションに属性名を与えることでした); 常に `matchJsonldContext` を保存する通常のサブスクリプション (#1680) との非対称性は解消されました。`entities` のみに触れる `PATCH` は、属性名を保存するサブスクリプションの `contextRef` を上書きすることはありません。なぜなら、その値はそれらの逐語的な名前がレスポンスでどのように圧縮されるかを制御するからです。通知の `@context` (`jsonldContext`) はマッチングには使用されず (#2040)、このパスでのコンテキスト解決はリモートドキュメントを取得しません (#1680)。また、`type` を宣言していない登録エンティティ仕様は `typePattern` によって絞り込まれません (パターン対パターンの `idPattern` のケースと同じ失敗方向です)。NGSIv2 では仕様の一部です; NGSI-LD サブスクリプション (`entities[].typePattern`) では **GeonicDB 拡張** です — ETSI の `EntitySelector` には `typePattern` がありません。`type` とは異なり、`typePattern` は `@context` で用語展開**されません** (#1657)。型が正規の FQN 形式 (`@context` によって絶対 IRI にマッピングされた用語) で保存されている NGSI-LD エンティティの場合、パターンは保存された FQN と**両方**、サブスクリプション自身の `@context` で圧縮された用語に対してマッチングされます。これはこの目的のために作成/更新時に保存されます (#1680) — したがって、短縮名に対して書き込まれたパターン (例: `Sensor.*`) は、マッピングコンテキストを介して作成されたエンティティとのマッチングを継続します。

> **NGSI-LD `GET` は各エンティティセレクタを保存された形式で返します (#2067)。** 以前は `typePattern` がレスポンスで `type` に折りたたまれ、型制約がまったくないセレクタは作成された `type: "*"` でレンダリングされていました。両方ともラウンドトリップを歪めていました: 取得したサブスクリプション本文を新しい `POST` として再実行すると、`^Sensor` のようなパターンがリテラルの型名 `^Sensor` に変わりました。`GET` は実際に保存されたセレクタ (`id` / `idPattern` / `type` / `typePattern`) のいずれかを返し、型セレクタが指定されていない場合は `type` を完全に省略します。

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

`coordinates` は文字列(`"139.6503,35.6762"`)または GeoJSON 形式の配列のいずれかを受け付けます。これには、仕様が `LineString` / `Polygon` に使用するネストされた形式(`[[[138,34],[141,34],[141,37],[138,34]]]`)も含まれます。`geoQ.geometry` は 6 つの GeoJSON ジオメトリタイプすべてを受け付けます — `Point`、`MultiPoint`、`LineString`、`MultiLineString`、`Polygon`、`MultiPolygon`(#1696)。`Multi*` バリアントはネストされた GeoJSON 座標をそのまま保持し、`GET` は同じネストされた配列形式で返すため、取得した `geoQ` を変更せずに `PATCH` で戻すことができます。`Polygon` リングは閉じている必要があります — 最初と最後の位置が **すべての** 要素で等しく、3 要素の `[lng, lat, alt]` 位置が使用される場合は高度も含まれます(#1644) — 穴のあるポリゴン(複数のリング)は `400` で拒否されます。

NGSIv2 サブスクリプションは NGSIv2 の軸順序を維持します(`coords` は `lat,lng`)。これは `GET /v2/entities?coords=` が正規化される方法と同じように正規化されるため、サブスクリプションと同等の検索が一致します。軸順序は **サブスクリプションの** 元の API によって決定され、サブスクリプションが作成されたときに記録されます — そのフィールドが存在する前に作成されたサブスクリプションは、推測されるのではなく `geoQ` 述語がスキップされ(ジオフィルタリングなしで通知されます)ます。

サブスクリプションの更新は、送信したメンバーのみを置き換えます:`q` を含む `PATCH` は保存された `geoQ` をそのままにし、その逆も同様です。`geoQ` はオブジェクト全体として置き換えられます(したがって、省略された `geoproperty` は継承されるのではなくクリアされます)。`q: ""` を送信すると属性フィルタが削除されます。

**並行更新(#1593)**:部分更新はマージする前に保存された subject/notification を読み取る必要があるため、`PATCH` は **楽観的並行性制御** を使用します — 書き込みは読み取られた `modifiedAt` 値でガードされ、失敗したライターは再読み取りして再試行します。`SUBSCRIPTION.MAX_UPDATE_RETRIES` 回の試行後も更新が落ち着かない場合(同じサブスクリプションへの継続的な並行書き込み)、リクエストは **`409 Conflict`** で失敗し、クライアントは再試行する必要があります。このガードがないと、2 つの同時 `PATCH` は両方とも `2xx` を返し、後の書き込みが前の書き込みを暗黙的に破棄しました。配信統計は 2 つのフェーズで書き込まれ、このガードで **カバーされていない** ことに注意してください。`notification.timesSent` と `notification.lastNotification` は送信直前にスタンプされます(ETSI GS CIM 009 条項 5.8.6)。`notification.status` / `lastSuccess` / `lastFailure` / `timesFailed` はエンドポイントが応答した後に書き込まれます。これらは結果整合性があります:送信前の書き込みが失敗しても通知は送信され、カウンターは 1 つ不足します。いずれかの書き込みと同じ瞬間に着地する `PATCH` は 1 つのインクリメントを失う可能性があります。

### q / geoQ / scopeQ が通知をフィルタリングする方法

`q`、`geoQ`、および(NGSI-LD のみ)`scopeQ` は、**どのエンティティ変更が通知を発火するか** を制限します。サブスクリプションが存在するかどうかだけではありません。`q: "severity>100"`、`geoQ` ポリゴン、または `scopeQ: "/Madrid/#"` を持つサブスクリプションは、述語を満たすエンティティへの変更に対してのみ通知されます。

セマンティクスと現在の制限:

| Aspect                          | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Evaluation                      | The changed entity is re-evaluated against the same MongoDB predicate builder used by `GET /ngsi-ld/v1/entities`, so the **predicate semantics** (operators, geo handling, scope rules) are identical to search. Results can still differ from a concurrent search because the predicate is evaluated against current state while the notification payload comes from the event — see **Ordering** / **Timing** below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Invalid `q` / `geoQ` / `scopeQ` | **NGSI-LD only**: rejected at create/update time with `400` (`georel` enum, coordinate bounds, `georel`+`geometry`+`coordinates` must be given together; `scopeQ` runs through the same `parseScopeQuery` used at evaluation time). NGSIv2 subscriptions are not strictly validated, because the predicate builder does not yet implement NGSIv2's `lat,lon` `coords` order or its `attr:value` `q` form (`scopeQ` does not exist in NGSIv2). Subscriptions whose expression cannot be parsed at evaluation time are notified **without** filtering, and the failure is logged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Delete events                   | `EntityDeleted` is **not** filtered by `q` / `geoQ`. The entity no longer exists, so the predicate cannot be evaluated; suppressing the event would silently hide deletions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `noLongerMatching`              | Not implemented as a distinct transition — a subscription is notified while its predicate matches, and stops being notified when it does not                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Ordering                        | Entity-change consumers (subscription matcher, ReactiveCore rules, WebSocket broadcast) drop **stale** events whose `(createdAt, version)` is older than the entity's current DB generation (#3827). This prevents an out-of-order older snapshot from being delivered last. **Intermediate values may be omitted** when events race; the current state is carried by a later event. Use the Temporal API for audit/history. Separately, because the subscription predicate is evaluated against current state while the payload comes from the event, rapid consecutive updates can still deliver a payload that no longer satisfies the filter, or (in the reverse order) suppress the change that did match. Orion-LD, which evaluates in-line, does not have that predicate/payload gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Duplicates                      | Notifications are at-least-once. On a transient failure the event is redelivered; SQS FIFO de-duplication absorbs re-sends inside a 5-minute window, so a redelivery later than that can duplicate an already-sent notification. On the **entity-change** path (which uses `claimNotificationSlot`), matcher fanout processes deliverable subscriptions in chunks (`MATCHER_FANOUT_CHUNK_SIZE`); a partial `SendMessageBatch` failure within a chunk releases and reclaims **only the failed subscriptions** — successful entries (including those in earlier chunks) keep their window and are not re-sent on that retry (#3678 / #3173 C1 / #3928). Semantics are unchanged from the pre-chunk path. Rule-triggered notifications do not claim; a partial batch failure rethrows after the send attempt and EventBridge may redeliver the whole event, with SQS FIFO deduplication absorbing duplicates inside the window. On the **Lambda notification-sender** path (#3925 / #3947), **1 invocation = 1 notification** (`BatchSize: 1`); the same subscription is serialized by FIFO group. Records that share a FIFO `MessageGroupId` are still processed sequentially within the group; after a failure or deadline deferral, remaining unprocessed records in the same group are returned in `batchItemFailures` (groups are concurrent up to `NOTIFICATION.MAX_CONCURRENT`). A 30s HTTP timeout failure is not retried in-process when remaining time is insufficient — SQS redelivery (Visibility 120s) is the retry, and 3 receives go to DLQ; fast transient failures still get up to 4 in-process attempts. Successful records in other groups are not re-sent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Timing                          | The predicate is evaluated against the entity's state at evaluation time. A change applied between publication and evaluation can flip the decision. If the entity is gone (deleted / TTL-expired / soft-deleted) by then, the predicate is treated as **not evaluable** and the notification is sent rather than silently dropped                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Encrypted tenants               | Encrypted entities store their attributes in an opaque envelope, so a `q` predicate (and a `geoQ` on a non-`location` GeoProperty) cannot be evaluated. Such subscriptions are notified **without** filtering, and this is logged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `!=` and `!attr`                | Evaluated exactly as `GET /entities` does, where a missing attribute satisfies `!=`. Orion-LD treats comparisons against a missing attribute as false, so results can differ for these operators                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Rule-triggered notifications    | ReactiveCore rules always name their target subscriptions explicitly (`subscriptionIds`), and on that path `q` / `geoQ` are **not** applied — the rule's own condition (CEL) decides which entities fire                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Cost bound                      | Evaluations are de-duplicated per unique expression per event and capped (`SUBSCRIPTION.MAX_EXPRESSION_EVALUATIONS_PER_EVENT`); at most `SUBSCRIPTION.MAX_CONCURRENT_EXPRESSION_EVALUATIONS` run concurrently. Beyond the cap, subscriptions are notified without filtering and the truncation is logged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| servicePath                     | A subscription is matched only against entity changes in the **same** servicePath (exact match), on both the AWS and standalone paths (#1587)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Creation boundary               | A change that **occurred before the subscription was created** is never notified, even when its asynchronous matching happens to run after the subscription exists (#2068). ETSI GS CIM 009 clause 5.8.6 sends notifications only while the subscription is `active`, and a subscription that did not exist at change time was not active. The guard compares the change's occurrence time with the subscription's `createdAt` and is enforced in `matchesSubscription`, the single chokepoint shared by the AWS and standalone paths. Fail-open: a legacy subscription without `createdAt`, an event without a timestamp, or an exact tie is still notified. On standalone, subscription events take the occurrence time from `EntityService`'s publisher payload (#2337). Change Stream `wallTime` remains the timestamp source only for rules. Rule-triggered notifications (explicit `subscriptionIds`) are not subject to this boundary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| throttling / cooldown           | `throttling` (FIWARE, min seconds) and `cooldown` (GeonicDB extension) are both enforced on the entity-change notification path (#1589). Enforcement is an **atomic claim**: at match time (after `q`/`geoQ`) the broker does one `findOneAndUpdate` that both checks the window and stamps the window clock, so only the winning event of a burst is delivered — the check and the record cannot race. **Windowless subscriptions** (neither `throttling` nor `cooldown`, or a non-positive value) claim with a primary read only — no write — so deletion races are still detected without amplifying subscription updates (#3928). If you PATCH `throttling`/`cooldown` onto a previously windowless subscription, the window starts from the first delivery after that PATCH (at most one extra notification right after the change). **The window clock is a dedicated server-only field** (`lastThrottledAt` for throttling, `lastTriggered` for cooldown), intentionally separate from the FIWARE display field `notification.lastNotification`: this keeps delivery retries from refreshing the window, and prevents a client-supplied `lastNotification` from poisoning the guard. `notification.lastNotification` remains the spec-visible "last notification timestamp" and, together with `timesSent`, is stamped immediately before the send by `recordNotificationAttempt` (ETSI GS CIM 009 clause 5.8.6 places those steps before the response is classified; the stamp advances even for rule-triggered notifications, which are not claimed/throttled). If that write fails the send still proceeds and the counter is short by one. The outcome recorder then writes `notification.status` / `lastSuccess` / `lastFailure` / `timesFailed` after the response. Neither write touches the window clock, so a successful delivery and its retries do not refresh the window (the AWS and standalone paths behave identically). The clock is stamped at claim time (just before delivery); if delivery then **fails** the window is **released** (the clock is cleared) so a retry or the next event can re-claim — a send failure does not burn the window (AWS path retries the event; standalone reopens for the next event). The residual lossy case is a process crash between claim and release; monitor delivery health via `notification.status` / `lastFailure`. Both are a **single per-subscription budget**: rule-triggered notifications go through the explicit-`subscriptionIds` path and are not claimed/throttled |

### スコープフィルタリング(scopeQ)とラウンドトリップ専用フィールド(temporalQ / lang)

`scopeQ`(NGSI-LD のみ)は保存され、`GET` で返され、**通知フィルタとして評価されます** — `q` / `geoQ` と同じ方法で、`GET /ngsi-ld/v1/entities?scopeQ=` と同じ `parseScopeQuery` 述語ビルダーを使用します。`scopeQ: "/Madrid/#"` を持つサブスクリプションは、`scope` が一致するエンティティへの変更に対してのみ通知されます。これは `q` / `geoQ` と同じ方法で作成/更新時に検証されます(不正な `scopeQ` は `400` で拒否されます)。また、上の表で説明されているのと同じコスト制限 / 重複排除 / フェイルオープン動作に参加します(`q` / `geoQ` と同じ式ごとのキャッシュキーに組み込まれます)。

`temporalQ` と `lang` は受け付けられ、永続化され、`GET` で返されますが、通知マッチングには **適用されません**(#1588)。これは意図的なものであり、後で埋めるべきギャップではありません:


* `temporalQ` は **履歴取得** のための時間範囲を記述します(`timerel` / `timeAt` / `endTimeAt`)。単一の変更通知イベントには比較対象となる「時間範囲」がないため、イベントごとの述語としての意味はありません。
  
* `lang` はエンティティを返す際にどの `LanguageProperty` 値を選択するかのレンダリングヒントであり、変更が満たすか満たさないかの条件ではありません。

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

**統一された NGSI-LD プロジェクション (`pick` / `omit`):**

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

**レスポンスのシリアライゼーション (非対称性に注意):** `GET` / `List` レスポンスは、作成時にどのエイリアスが使用されたかに関係なく、常に ETSI 標準のフィールド名で保存されたプロジェクションをシリアライズします:


* **含める** プロジェクションは `notification.attributes` として返されます (`pick` ではありません);
  
* **除外** プロジェクションは `notification.omit` として返されます (`exceptAttrs` ではありません)。

したがって、`pick` でサブスクリプションを作成したクライアントは、レスポンスの `notification.attributes` の下に選択内容を見つけることになり、`exceptAttrs` を使用したクライアントは `notification.omit` の下に見つけることになります。両方のレスポンスフィールド名は戻りの際に受け入れられます (同じ内部の含める / 除外プロジェクションにマッピングされます) ので、`GET` → 編集 → `PATCH` のラウンドトリップはプロジェクションを保持します。

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

`null` は *クリア* シグナルであるため、含める / 除外の排他性チェックから除外されます: `pick: null` を `omit` 値と一緒に送信して、含めるプロジェクションをクリアし、同じリクエストで除外プロジェクションを設定できます。空の配列 `[]` はクリアメカニズムでは **ありません** (すべてのセレクタは非空の配列を必要とします) — クリアするには `null` を使用してください。これがなければ、一度設定されたプロジェクションは、サブスクリプションを削除して再作成することによってのみ削除できます。

### Subscription @context を使用した通知 `type` のレンダリング (NGSI-LD、#1687)

NGSI-LD サブスクリプションの場合、通知 `data[]` 内の各エンティティの `type` は、ETSI GS CIM 009 §5.5.7 の「出力時にコンパクト化するものとする」ルールに従い、**サブスクリプション自身の `@context`**(作成/更新時に保存されたもの)を使用してレンダリングされます。正規の FQN 形式(用語定義によってマッピングされた絶対 IRI、#1657 を参照)で保存されたタイプは、配信前に**短い用語にコンパクト化**されます。これはエンティティ変更とルールトリガーの両方の通知に適用されます。配信時にサブスクリプションの `@context` を解決できない場合は、フォールバックとして FQN が送信されます。ベアな(コア `@vocab`)タイプは以前と同様に変更されずに配信されます。

> **⚠️ 破壊的変更(受信側、#1687)**: 絶対 IRI にマッピングされたタイプの場合、以前の通知では `data[].type` に FQN が公開されていましたが、現在はコンパクト化された短い用語が含まれます。FQN で分岐する受信クライアント(例: geonicdb-cli / geonicdb-pulse)は見直しが必要です — #1725 で追跡されています。WebSocket イベントストリーミングパスは現在コンパクト化**されておらず**、保存された(FQN)形式が配信されます。

### 複数タイプの `data[].type` (NGSI-LD、#2477)

エンティティが複数のエンティティタイプを持つ場合(4.16 節 / 表 5.2.4)、通知ペイロードは `data[].type` を **JSON 文字列配列**としてレンダリングします — これは `GET /ngsi-ld/v1/entities/{id}` と同じルールです。単一のタイプは文字列のまま(1 要素の配列ではありません)です。

> **⚠️ 破壊的変更(受信側、#2477)**: `data[].type` が常に文字列であると想定しているクライアントは、複数タイプのエンティティで動作しなくなります。`type` を `string | string[]` として扱ってください(WebSocket イベントの `entityType` も同様です — [EVENT\_STREAMING.md](./subscriptions.md) を参照)。

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

**NGSI-LD サブスクリプション**は、ETSI `Notification` (GS CIM 009 clause 5.2.13) を配信します。その必須メンバーは `id` (URI — GeonicDB は配信ごとに `urn:ngsi-ld:Notification:<uuid>` を生成)、`type` (`"Notification"`)、`subscriptionId`、`notifiedAt`、および `data` です。`data[]` 内の各エンティティは、`notification.format` によって選択された NGSI-LD 表現でレンダリングされます (デフォルトは `normalized`、clause 5.2.14 に従う):

| `notification.format`  | `data[]` attribute shape                                                                                                                                                                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `normalized` (default) | `{"temperature": {"type": "Property", "value": 32.5}}` — attribute `type` is `Property` / `Relationship` (with `object`) / `GeoProperty` / `LanguageProperty` …                                                                                                                                                                             |
| `concise`              | `{"temperature": 32.5}`, or `{"value": 32.5, "<subAttr>": …}` when sub-attributes are present (sub-attribute rendering itself is still normalized — see the known gaps below)                                                                                                                                                               |
| `keyValues`            | `{"temperature": 32.5}` — values only, no type information or sub-attributes. Multi-attributes become a `dataset` map: `{"temperature": {"dataset": {"@none": 32.5, "urn:ngsi-ld:Dataset:a": 30.1}}}` (clause 4.5.4, #1930). `simplified` is accepted as the ETSI synonym (Table 5.2.14.1-1, #2103) and normalized to `keyValues` on intake |

`showChanges` は、`normalized` / `concise` において型固有の previous-member (previous **value/object**、ラップ解除) を追加します。`keyValues` はサブ属性を表現できないため、すべての previous-member はそこでは省略されます。

**マルチ属性**の場合、previous-member は `datasetId` によってペアリングされた**インスタンスごと**に付加されます (ETSI GS CIM 009 clause 4.5.2.3 は `previousValue` を Property インスタンスのメンバーとし、clause 4.5.5 はインスタンスを `datasetId` によって識別します — 配列の位置によってではありません、#1813):


* 変更前に `datasetId` が存在していたインスタンスは、独自の previous-member を持ちます。
  
* **新規**のインスタンス (同じ `datasetId` の下に対応するものがない) は **none** を持ちます — 存在しなかったものに対する「以前の値」はありません。
  
* 値が変更されなかったインスタンスでも、現在の値と等しい previous-member を持ちます。これは `changedAttributes` が属性名の粒度しか持たず、それを省略すると #1813 が修正した「何も変更されていないように見える」ギャップが再現されてしまうためです。
  
* 形状は**現在**の状態に従います: 属性が現在単一のインスタンスである場合、出力は単一のオブジェクトのままで、配列に変換されません。

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

`VocabProperty` の場合、previous-member 名は**古いインスタンスの形状**から選択されます: 以前の `vocab` 値は `previousVocab` を使用し、以前の `vocabMap` 値は `previousVocabMap` を使用します。

**NGSIv2 サブスクリプション**は、Orion 互換のボディを維持します — NGSIv2 表現での `subscriptionId` + `data[]` (属性 `type` は値の型: `Number` / `Text` / …) — `id` / `type` Notification エンベロープは**ありません**。`notifiedAt` と `triggerReason` は、そのパスにおける GeonicDB の拡張です。

`protocol` フィールドが存在する前に作成されたサブスクリプション (#1570) はプロトコルを持ちません。それらはどちらの形式にも推測されるのではなく、レガシー (内部) 形状のまま変更されずに配信されます。

両方の配信ルート — Lambda パイプライン (`matcher` → SQS → `notifier`) とスタンドアロンのインプロセスサービス (`npm start` / E2E) — は、エンティティ変更とルールトリガー通知の両方において**同じ**共有関数 (`formatNotificationData` / `buildNotificationBody`) を通じてボディを構築するため、2 つのルートが乖離することはありません。

### HTTP 配信トランスポート (#2932)

アウトバウンド HTTP 通知 (エンティティサブスクリプション、CSource サブスクリプション、および ReactiveCore `webhook` アクション) は `pinnedRequest` を使用します: Context Brokerはエンドポイントホストを**一度**解決し、SSRF ブロックリストに対してアドレスを検証し、その IP に TCP 接続を固定することで、チェックと接続の間の DNS リバインディングが内部アドレスに到達できないようにします。

**リダイレクトは追跡されません。** `3xx` レスポンスは配信失敗です (ETSI GS CIM 009 V1.8.1 clause 5.8.6 は `200 OK` 以外のすべてのステータスを失敗として扱います) し、一時的なものとして再試行**されません**。レシーバーが異なる URL を必要とする場合は、その URL をサブスクリプション / webhook 設定に直接記述してください — 最初のホップからの `301`/`302`/`307`/`308` に依存しないでください。

### マッチングにおけるプロトコル分離 (#2253)

上記の段落はボディの *形状* についてです。マッチング自体は別の問題であり、#2253 まではまったく `protocol` を見ていませんでした。候補となるサブスクリプションは `tenant` + `servicePath` + `entityTypes` + `status` のみで選択されていました。エンティティはプロトコル分離されており (#964 — NGSIv2 API を通じて作成されたエンティティは NGSI-LD の読み取りでは見えず、その逆も同様)、**変更イベントがその境界を越える唯一のものでした**。`POST /v2/entities` を通じて `Room` を作成すると、`Room` を監視している NGSI-LD サブスクリプションに通知され、逆も同様でした。何もエラーにはなりませんでした。受信者は単に、読み取ることができないエンティティの id、type、および属性値を知ることになるだけでした。

マッチングは現在、サブスクリプションの `protocol` (作成時に記録される、#1570) と変更イベントのプロトコルを比較します。サブスクリプションは、それが作成された API を通じて行われた変更に対してのみ発火します。このルールは 2 つのレイヤーで強制されます。`findMatchingSubscriptions` における MongoDB プッシュダウンと、両方の配信ルートで共有されるアプリケーションレイヤーのガードです。なぜなら、プッシュダウンだけでは、呼び出し側がプロトコルを渡すのを忘れた瞬間に暗黙的に緩くなってしまうからです。

**#1570 より前に作成されたサブスクリプションは `protocol` を持たず、両方のプロトコルにマッチし続けます。** どの API がそれらを作成したかを回復する方法はなく、どちらか一方を選ぶと、間違っている側の配信が暗黙的に停止します。これは、この変更が閉じようとしているのと同じクラスの事故であり、より大きな影響範囲を持ちます。プロトコル境界を越えることは認可境界を越えることではなく (配信される行は依然として作成者の読み取り述語を通過します、下記参照)、それらのドキュメントをフェイルオープンのままにしておくコストは、配信を停止するよりも少なくなります。意図された API を通じてそのようなサブスクリプションを再作成することで、分離にオプトインするのに十分です。

### コンテキストソース登録通知 (CSource サブスクリプション、#1837)

NGSI-LD コンテキストソース登録サブスクリプション (`/ngsi-ld/v1/csourceSubscriptions`) の場合、変更通知は `type: "ContextSourceNotification"` (ETSI GS CIM 009 Table 5.3.2-1) を使用し、`"Notification"` ではありません。`Ngsild-Trigger` ヘッダーは依然として変更クラス (`csourceRegistration-created|updated|deleted`) を示し、`id` は既存の GeonicDB プレフィックス契約 (`urn:ngsi-ld:Notification:`) を持つ有効な URI であり続けます。

**サブスクリプション作成時の初期通知 (#1764)。** `csourceSubscription` を作成すると、**マッチする既に登録されたコンテキストソース登録ごとに 1 つの通知が送信されます** (ETSI GS CIM 009 clause 5.11.7)。これがないと、サブスクリプションライバーは次の登録変更まで何も知ることができないため、既存のコンテキストソースは見えないままになります。初期通知は変更通知パスを再利用するため、同じマッチングルール、行レベルの読み取りリダクション (#2133)、日次通知クォータ (#1544)、および `@context` 選択 (#2025) が適用されます。配信はファイア・アンド・フォーゲットです。初期通知の失敗は `201` をロールバックしません。

**既知のギャップ** (別途追跡され、#1765 では対処されていません):

| Gap                                                                                                                                                                                                                                                                                                          | Issue                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `concise` is not fully concise: it drops the reserved sub-attributes `unitCode` / `observedAt` / `datasetId`, and renders user-defined sub-attributes in normalized form (a sub-Property should collapse to its bare value). Not notification-specific — `GET /entities?format=concise` behaves the same way | [#1779](https://github.com/geolonia/geonicdb/issues/1779) |

以下の両方のギャップは、Epic [#1979](https://github.com/geolonia/geonicdb/issues/1979) の PR-F によって閉じられ、以下の「通知 `@context`」および「NGSIv2 `attrsFormat`」で文書化されています。NGSIv2 `attrsFormat` は現在、通知ボディに適用されます ([#1780](https://github.com/geolonia/geonicdb/issues/1780))。また、NGSI-LD 通知はその `@context` を運びます ([#1841](https://github.com/geolonia/geonicdb/issues/1841) / [#1781](https://github.com/geolonia/geonicdb/issues/1781))。

### 通知 `@context` (#1841)

ETSI GS CIM 009 clause 5.8.1.4 は、通知をサブスクリプションの `jsonldContext` と共に送信することを要求しています。それが与えられていない場合、**フィールドは初期化されます**。サブスクリプションに適用可能な `@context` (clause 5.5.5 — 最低限コア `@context`) で初期化されます。仕様が書き込みを義務付けているため ("shall be **initialized**")、GeonicDB は作成時および要求 `@context` を運ぶ任意の `PATCH` 時に初期化します。**その `PATCH` が含む任意のメンバー** (#2040) に対して初期化し、**フィールドがまだ未設定の間のみ** (#2029 / #2041) 初期化します。GeonicDB は、`notification.endpoint.accept` によって選択された、正確に 1 回それを配信します。

| `accept`                                                                                          | Delivery                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `application/ld+json`                                                                             | `@context` member in the notification body                                                                                                                                                                                                                 |
| `application/json` (default)                                                                      | `Link` header (`rel="http://www.w3.org/ns/json-ld#context"`)                                                                                                                                                                                               |
| `application/geo+json`                                                                            | body `@context` by default; `Link` header when `receiverInfo` carries `Prefer: body=json` (clause 6.3.8)                                                                                                                                                   |
| MQTT without `receiverInfo` (or empty)                                                            | `@context` member in the body (backward compatible; MQTT has no headers)                                                                                                                                                                                   |
| MQTT whose `receiverInfo` has an entry other than `MQTT-QoS` / `MQTT-Version` (#3341, clause 7.2) | message is `{"metadata","body"}`. `application/json`: `@context` as `metadata.Link`. `application/ld+json`: `@context` on `body`. `application/geo+json`: same Prefer rule as HTTP, carried in `metadata`. Those two keys alone do not select the envelope |
| `httpCustom` (`payload` / `json`)                                                                 | neither — the body is user-defined, so claiming a `@context` for it would be wrong                                                                                                                                                                         |

両方が一緒に送信されることはありません。2 つの真実のソースがあると、受信者がアクティブな `@context` について意見が一致しなくなる可能性があります (リクエスト側の clause 6.3.5 "No mixes" と同じ理由)。これは、GeonicDB 自体が添付するコンテキストを制約します。`notification.endpoint.receiverInfo` は独自の `Link` ヘッダーを追加する場合がありますが、これは生成されたコンテキスト `Link` に追加されます (決して置き換えられることはありません)。

`jsonldContext` 自体は、単一の参照可能な URI 文字列のみを受け入れます。サブスクリプション要求 `@context` 内の 1 要素の URI 配列は、その URI に折りたたまれます (#2344)。それはすでに参照可能であるため、`ImplicitlyCreated` コピーは作成されません。インラインオブジェクトまたは混合/複数 URL 配列は、サブスクリプション要求 `@context` を通じてのみ通知パスに到達できます (`jsonldContext` が省略された場合に使用されます)。そのようなコンテキストは、`Link` ヘッダーに完全に含めることができないため、`application/json` の場合でもボディに配置されます。URL 部分だけを出力すると、インラインで定義された用語が暗黙的にドロップされます。

### GeoJSON 通知 (`accept: application/geo+json`

) — #1762

ETSI TS 104 175 clause 5.2.6.9.1 は、Notification の `data` メンバーを「NGSI-LD Entity\[] または FeatureCollection」として定義しています。`notification.endpoint.accept: application/geo+json` を指定すると、GeonicDB は通常の `Notification` を送信し、その `data` は GeoJSON `FeatureCollection` となります(clause 6.3.8 では MIME タイプと `@context` の配置について説明しています)。

```json
{
  "id": "urn:ngsi-ld:Notification:...",
  "type": "Notification",
  "subscriptionId": "urn:ngsi-ld:Subscription:...",
  "notifiedAt": "2026-08-11T00:00:00.000Z",
  "triggerReason": "entityCreated",
  "data": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "id": "urn:ngsi-ld:Store:001",
        "geometry": { "type": "Point", "coordinates": [139.6503, 35.6762] },
        "properties": {
          "type": "Store",
          "temperature": { "type": "Property", "value": 25.5 },
          "location": { "type": "GeoProperty", "value": { "type": "Point", "coordinates": [139.6503, 35.6762] } }
        }
      }
    ],
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.9.jsonld"
  }
}
```

構造に関する注記:


* **破壊的変更 (#3732)**: 以前は `FeatureCollection` がトップレベルであり、`subscriptionId` / `notifiedAt` は外部メンバーでした。受信者は今後 `body.features` ではなく `body.data.features` (および `body.data["@context"]`) を読み取る必要があります。`id` と `type: "Notification"` が現在存在しています。
  
* **破壊的変更 (#3732)、2つ目**: `notification.format` が未設定(デフォルト `normalized`)の場合、`features[].properties` は簡略化された値から正規化された属性(`{"type":"Property","value":...}`)に変更されます。以前の簡略化された値を保持するには、サブスクリプションで `notification.format: "keyValues"` を設定してください。
  
* `@context` は `Notification` ではなく、`FeatureCollection` の内部にあります。`receiverInfo` で `Prefer: body=json` を指定すると、本文から省略され `Link` ヘッダーとして送信されます — ただし、解決された `@context` にインラインオブジェクト(単独または配列内で混在)が含まれている場合は例外です。`Link` はそれを運ぶことができないため、その場合は `data["@context"]` に残り、タームが暗黙的に削除されることはありません。
  
* `features[].properties` は `notification.format` に従います:`normalized` (デフォルト)と `concise` は、`showChanges` の `previous*` メンバーや `entityDeleted` の `deletedAt` を含む他の通知と同じ属性表現を使用します。`keyValues` は簡略化された値を提供します。
  
* Feature の `geometry` は `location` 属性から取得されます。それを持たないエンティティ(または削除されたエンティティ)は `"geometry": null` を取得します(RFC 7946 に準拠した有効な値)。`location` は `properties` にも残ります。
  
* `properties` 内の属性名とエンティティタイプは、通知の `@context` で圧縮され、他のすべての通知表現と同じです(clause 5.5.7)。

`accept: application/geo+json` を指定した MQTT エンドポイントは、同じ本文を受信します。`receiverInfo` がない場合、または `MQTT-QoS` / `MQTT-Version` のみの場合、それが公開されるメッセージです。他の `receiverInfo` エントリがある場合、それは clause 7.2 エンベロープの `body` となり、clause 6.3.8 の `Link` ブランチは HTTP ヘッダーの代わりに `metadata.Link` となります (#3341)。

`ContextSourceNotification` (`csourceSubscriptions` の登録変更通知)は同じルールに従います (#2025):`@context` はサブスクリプションの `jsonldContext`、または csource サブスクリプションが作成/更新されたときに適用された `@context` であり、`endpoint.accept` は上記とまったく同じように本文と `Link` ヘッダーを選択します。#2025 以前は、`accept` に関係なく、常に本文内のコア `@context` でした。

`notification.format` は **受け入れられ保存されますが、`ContextSourceNotification` の本文には影響しません** (#2159)。Table 5.3.2-1 は `data[]` を `CSourceRegistration` の配列(基数 1)として定義していますが、`normalized` / `concise` / `keyValues` はエンティティ表現(clause 4.5)です — これらが選択する登録のレンダリングは存在しません。3つの値すべてが受け入れられ(`simplified` は取り込み時に `keyValues` に正規化されます、#2103)、`GET` によってそのまま返されます。通知本文はすべてのケースで完全な登録ドキュメントです。#2159 以前は、共有 `NotificationParams` スキーマと OpenAPI ドキュメントがそれを宣言していたにもかかわらず、サービス層は `concise` を `400` で拒否していました。

`data[]` 内の属性名は同じ `@context` で圧縮されるため(clause 5.5.7、#1788)、通知とその `@context` で発行された `GET` は属性を同じように綴ります。完全修飾 IRI として保存された名前は圧縮されます。保存されたそのままの名前はそのまま残されます(変更イベントはエンティティの `attrNameForm` を運ばないため、それらを展開するとレガシーの短い名前が IRI になる可能性があります)。これはエンティティ `type` の圧縮が既に従っているのと同じルールです。

NGSIv2 サブスクリプションは `@context` メンバーや `Link` ヘッダーを受信しません。

### NGSIv2 `attrsFormat` (#1780)

`attrsFormat` は通知本文の形式を選択し、NGSIv2 HTTP 通知の `Ngsiv2-AttrsFormat` ヘッダーにエコーされます:

| `attrsFormat`          | `data[]` element                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| `normalized` (default) | `{"id": ..., "type": ..., "temperature": {"type": "Number", "value": 25}}`                          |
| `keyValues`            | `{"id": ..., "type": ..., "temperature": 25}`                                                       |
| `values`               | `[25]` — values only, ordered by `notification.attrs` (attribute name order when `attrs` is absent) |

`protocol` フィールドが存在する前に作成されたサブスクリプション(#1570)は、レガシーの normalized 形式のままです:それらの API プロトコルは判定できず、推測すると受信者が既に解析している本文を書き換えることになります。同じ理由で、それらは引き続き `Ngsiv2-AttrsFormat: normalized` を受信します。

`httpCustom`(`payload` / `json`)が本文を定義する場合、ヘッダーは `custom` になり、Orion と一致します(「テキストベースまたは JSON ペイロードが使用される場合... `Ngsiv2-AttrsFormat` ヘッダーは `custom` に設定されます」)。

**NGSI-LD サブスクリプションはこのヘッダーを受信しません。** その語彙(`normalized` / `keyValues` / `values`)は NGSIv2 のものです。これを使用して NGSI-LD 表現(`normalized` / `concise` / `keyValues`)を記述すると、受信者に誤った情報を与えることになります。#1780 までは、ヘッダーはハードコードされた `normalized` ですべての通知に送信されており、NGSI-LD 通知が NGSIv2 normalized であると主張していました。

### 通知におけるリンクエンティティ取得 (`notification.join` / `joinLevel`

、NGSI-LD、#2104)

ETSI GS CIM 009 Table 5.2.14.1-1 は `join` と `joinLevel` を NotificationParams メンバーとして定義しています。これらは**通知ペイロード内のリンクエンティティ取得**を制御し、エンティティ読み取りにおける `join` / `joinLevel` クエリパラメータと同じセマンティクスを持ちます(clause 4.5.23)。

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

両メンバーは永続化され、`GET /ngsi-ld/v1/subscriptions{,/{id}}` によって返されます。設定されていないメンバーはそのデフォルト値で具体化**されない**ため、join を要求しなかったサブスクリプションはその表現内に `"join": "@none"` が追加されることはありません。

解決処理はエンティティ読み取りと同じコードパスを通るため、`ListRelationship` (`objectList`)、配列 `object` を持つ `Relationship`、および複数属性インスタンスはすべて走査されます(#2225)。また、`keyValues` ペイロードはサブメンバーを追加するのではなく、Relationship 値をターゲットの簡略化された表現(clause 4.5.3 EXAMPLE 9 / EXAMPLE 17)で置き換えます。

> **`subscription.datasetId` と `notification.join` (#3668)。** サブスクリプションが `datasetId` を持つ場合、join は選択された Attribute インスタンスのみを追跡します(`GET ...?datasetId=&join=` と同じルール)。マッチしない Relationship ターゲットは `join=flat` で追加されず、インラインレンダリングキャップにカウントされません。このフィルターは各再帰的な `joinLevel` でも適用されます。

> **認可。** リンクエンティティはサブスクリプションが宣言していないターゲットであるため、**サブスクリプション作成者の**行レベル読み取り述語によってフィルタリングされます。これは CSource 通知パスが使用するのと同じヘルパー(#2133)と、HTTP join と同じ自由な `entityType` 規律(#2213)を使って導出されます。述語が決定できない場合(`createdBy` がない、作成者が削除された、非アクティブ化された、またはテナント内のアクティブなメンバーシップを持っていない、テナントが解決できない、またはユーザードキュメントをまったく持たない認証情報によって作成されたサブスクリプション — API キーの `createdBy` は `apikey:<keyId>`、OAuth クライアントのものはクライアント ID)、join は**ゼロ個の**リンクエンティティに解決され、通知は埋め込みデータなしで配信されます。`join` は追加の表現であるため、通知が送信されるかどうかを変更してはなりません。[AUTH.md](../reference/auth.md) を参照してください。
>
> **両方の配信パスに適用されます。** join は Lambda マッチャーとスタンドアロン通知サービスの両方で使用される共有ヘルパーによって適用され、エンティティ変更通知と ReactiveCore ルール通知の両方に適用されます。NGSIv2 サブスクリプション(および `protocol` を持たない #1570 以前のサブスクリプション)は影響を受けません — `join` は NGSI-LD メンバーです。
>
> **失敗した解決が通知を抑制することはありません。** リンクエンティティの解決はデータベースを読み取るため、一時的に失敗する可能性があります。共有ヘルパーはこれらの失敗を吸収し、**join 前の**ペイロードで通知を配信します(`NOTIFICATION_JOIN_RESOLUTION_FAILED` としてログ記録)。これは、上記の決定不可能な述語が配信をドロップするのではなくゼロ個のリンクエンティティを生成するのと同じ理由です。`join` は追加の表現だからです。この方向で失敗するとデータを保留しますが、決して公開しません。

### 作成 / 更新時のフィールド検証

ETSI GS CIM 009 (clause 4.21 / 5.8.1)によれば、一部のサブスクリプションフィールドは組み合わせることができません。これらは作成 / 更新時に `400 BadRequest` で拒否されます(意味が未定義のサブスクリプションを作成するのではなく)。

| Rule                                                                                                  | Reason                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `throttling` ⊥ `timeInterval`                                                                         | These are distinct operating modes: `throttling` sets a minimum interval between change-triggered notifications, `timeInterval` sends periodic notifications.    |
| `watchedAttributes` ⊥ `timeInterval`                                                                  | A `timeInterval` subscription is **periodic-only** — entity changes never trigger it — so watching attributes would have no effect (ETSI GS CIM 009 clause 5.8). |
| At most one include selector (`notification.pick` / `notification.attributes` / `notification.attrs`) | The include-style attribute selectors are mutually exclusive; `pick` and `attributes`/`attrs` map to the same internal include projection.                       |
| At most one exclude selector (`notification.omit` / `notification.exceptAttrs`)                       | The exclude-style attribute selectors are mutually exclusive; `omit` and `exceptAttrs` map to the same internal exclude projection.                              |
| Include ⊥ exclude                                                                                     | An include selector cannot be combined with an exclude selector (`pick`/`omit` are mutually exclusive per clause 4.21).                                          |

***

## 実践的な例

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

### 大きな属性値と EventBridge サイズ (#3833)

エンティティ変更イベントは AWS EventBridge を経由します(PutEvents はエントリあたり ≤ 256 KiB、GeonicDB では約 10% の安全マージンあり)。イベントの `Detail` には `currentAttributes` / `previousAttributes` が含まれます。そのペイロードが予算を超える場合、GeonicDB は一般的なケースでイベントをドロップする代わりに**縮退**させます:属性本体を除去し(最初に `previousAttributes`、次に `currentAttributes`)、`previousAttributesOmitted` / `attributesOmitted` を設定し、コンシューマーは必要に応じて現在のエンティティをデータベースから再読み込みします。その除去後もエンベロープ単体が予算を超える場合(病的なケース)、イベントはドロップ/拒否され、`EntityChangePublishFailures` でカウントされます。

コンシューマーは `attributesOmitted` が設定されている場合、データベースから**現在の**エンティティを再読み込みします。その状態は、コンシューマーが実行される前に別の書き込みが行われた場合、変更イベントが公開された時点よりも新しくなる可能性があります。ReactiveCore ルールは `previousAttributes` が除去された場合、復元された `previousEntity` を**取得しません**。再読み込みが失敗した場合 — エンティティが消失した、または**一時的な DB エラー** — 配信は**スキップ**され(フェイルクローズ — 空の属性マップは「完全クリア」として送信されません)、`EntityChangeHydrateFailures` でカウントされます。コンシューマーは hydrate 失敗時に同じイベントを再試行するために例外を**スローしません**;ミスはその EMF メトリック / ログを通じてのみ確認できます。

**通知ペイロードサイズ (SQS 256 KiB、matcher / Lambda パスのみ):** hydrate 後、サブスクリプションの通知本体は依然として AWS SQS のメッセージあたりの予算(`SUBSCRIPTION.MATCHER_SQS_BATCH_MAX_BYTES`)を超える可能性があります。その場合、matcher はその通知をエンキュー**しません**:警告をログに記録し、`NotificationPayloadTooLarge` を発行し、そのサブスクリプションのイベント配信をスキップします。**Standalone**(`npm start` / ローカル)は HTTP 経由で直接配信し、この SQS 予算スキップを**適用しません** — HTTP パスに収まる大きすぎる本体は依然として送信されます。

大きなエンティティの結果(1 MiB ドキュメント制限内でも):


* `entityCreated` / `entityUpdated` / `entityDeleted` および `changedAttributes` から派生した `attributeUpdated` / `entityChanged` の通知は引き続き発火します(hydrate が成功した場合;matcher パスでは、通知本体が SQS に収まる場合も)。
  
* **縮退時の属性レベルトリガー:** パブリッシャーはいずれかの属性スナップショットを除去する前に、完全なペイロードから `changes.notificationTriggers` をスタンプします。NGSI-LD の作成と更新では、通常、作成および更新された属性名と `watchedAttributes` マッチングのエイリアスマッピングを保持します。両方のスナップショットが削除された後もイベントが予算を超える場合、パブリッシャーはまずエイリアスをドロップし、監視トリガー分類と変更された属性の復元名のみを保持します。それでも予算を超える場合、詳細なメタデータをドロップし、イベントを再測定します。作成は元のイベントで名前を使用できます。それ以外の場合、matcher はイベントレベルのトリガー情報にフォールバックし、混合更新で監視属性の通知を追加または抑制できます。詳細な分類のないレガシーおよび変更ストリームイベントは、`changedAttributes` のみが残る場合、`attributeUpdated` にフォールバックできます。
  
* `showChanges` 更新は、配信対象として選択された属性インスタンスが必要な以前の値を欠いている場合、抑制されます。属性と `datasetId` プロジェクションはこのチェックの前に適用されます。
  
* 属性削除通知には、削除された属性とインスタンスデータが必要です。その情報のないレガシーイベントは `attributeDeleted` をトリガーしません。明示的な `entityDeleted` 通知は、以前の属性が利用できない場合、エンティティの識別情報のみを運ぶことができます。
  
* **matcher パスでは、SQS 256 KiB 予算を超える通知ペイロードは配信されません**(上記参照)。Standalone HTTP 配信はその SQS 予算に縛られません。

**推奨:** 大きな BLOB (画像、ファイル)はオブジェクトストレージ(S3 など)に保管し、エンティティには URL のみを保存してください — 通常の FIWARE / Smart Data Models パターン(`image` を URI として)。数百キロバイトの base64 ペイロードを属性に入れると、ドキュメントが 1 MiB 未満であっても、ストレージ、リスト読み取り、時系列履歴、通知に負荷がかかります。

### 1. Configure Conditions Appropriately

**❌ 悪い例:すべてのエンティティを監視**

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

過剰な通知を防ぐために `throttling` (秒単位) を設定します:

```json
{
  "throttling": 60
}
```

これにより、同じエンティティの変更通知が 60 秒に 1 回に制限されます。

### 3. Set an Expiry

テストサブスクリプションに `expires` を設定します:

```json
{
  "expires": "2026-12-31T23:59:59.000Z"
}
```

### 4. Notify Only Changed Attributes

不要な通知を削減します:

```json
{
  "notification": {
    "onlyChangedAttrs": true
  }
}
```

### 5. Status Management

通知を一時的に停止するには `inactive` に設定します:

```bash
curl -X PATCH http://localhost:3000/v2/subscriptions/{id} \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: demo" \
  -d '{ "status": "inactive" }'
```

### 6. Error Handling

通知先エンドポイントで以下を実装します:

* **2xx ステータスコードを返す**: 成功を示すため
  
* **リトライロジック**: 一時的な障害を処理するため
  
* **タイムアウト設定**: 30 秒以内に応答します (`NOTIFICATION.TIMEOUT_MS`)。Lambda の送信側はその HTTP タイムアウトを維持し、残りの呼び出し時間が不十分な場合はさらなる試行の開始を停止します (#3925 / #1544)

***

## アクセス制御と所有権 (GeonicDB 拡張)

> **注意**: `super_admin` はサブスクリプションエンドポイント (`/v2/subscriptions`、`/ngsi-ld/v1/subscriptions`) にアクセスできません。これらはデータ API であるためです。代わりに `tenant_admin` または `user` ロールを使用してください。

認証が有効な環境では、サブスクリプションに所有権ベースのアクセス制御が適用されます。

### 動作


* サブスクリプションが作成されると、認証されたユーザーの ID が `createdBy` フィールドに記録されます。
  
* **更新 (PATCH) と削除 (DELETE)** は、以下のいずれかの条件を満たすユーザーのみが実行できます:
  
  * サブスクリプションの作成者 (`createdBy` が一致)
    
  * `tenant_admin` ロール
    
* 上記の条件が満たされない場合、**404 Not Found** が返されます (#2189)。`403` を返すと、それを読むことができないプリンシパルに対してサブスクリプションの存在を確認してしまいます — 読み取りパスはサブスクリプションを隠す (#2140 参照) ため、書き込みパスで `403` を返すとその存在が漏れてしまいます (**存在オラクル**)。`404` は「そのようなドキュメントは存在しない」と区別がつきません。
  
* **`createdBy` がない** サブスクリプション (そのフィールドが存在する前に作成されたもの) も、管理者以外の更新と削除に対して **404 Not Found** を返します (#2161)。`tenant_admin` は引き続きそれらのドキュメントを管理できます。

> **`super_admin` はここでの抜け道ではありません。** サービス層の所有権チェックは `super_admin` をスキップしますが、認証が有効な場合、そのロールはこれらのエンドポイントに到達しません: `SUPER_ADMIN_DATA_API_DENY_FENCE` (`policy.defaults.ts`) は、`super_admin` に対して `/v2/**` と `/ngsi-ld/**` をハード拒否し、カスタムポリシーが解除できない拒否優先フェンスとして機能するため、プラットフォーム管理者はテナントデータに触れることができません。サブスクリプションと登録を実際に管理できる管理者ロールは **`tenant_admin`** です。(`AUTH_ENABLED=false` の場合、すべてのリクエストは合成された `super_admin` となり、フェンスは適用されませんが、そもそも所有権の強制もありません。)
> 

* **取得 (GET) と一覧表示 (LIST)** は所有権チェックの対象外です — 作成者によってフィルタリングされません — しかし、これはテナント内のすべてのドキュメントが表示されることを**意味しません**。#2140 以降、読み取りは行レベルの読み取り述語を通過します: プリンシパルが読み取れないエンティティタイプのみを宣言するサブスクリプションは完全に隠され (ID による取得では 404、一覧とカウントから除外、通知エンドポイント URL も含む)、読み取り不可能なタイプセレクターは混合サブスクリプションから除外されます。
  
* **配信は作成者の読み取り述語によってフィルタリングされます (#2205)。** 上記の #2140 は *サブスクリプションドキュメント
* が表示可能かどうかを決定します; それはサブスクリプションが配信するエンティティについては何も述べていません。サブスクリプションの書き込みはサブスクリプションリソースパスをフレームとして認可されるため、`GET /ngsi-ld/v1/entities` を制限するポリシーはサブスクリプションの作成にはまったく適用されません — タイプを拒否されたサブジェクトがそれをサブスクリプションライブして通知として受け取ることができます。したがって、すべての通知は配信時に作成者の行レベル読み取り述語でフィルタリングされ、実際のエンティティに対して 3 つの次元すべて (`entityType`、`entityOwner`、`scope`) で評価されます。不変条件は: **作成者 P が `GET /ngsi-ld/v1/entities` で見ることができない行は、P のサブスクリプションに配信されません。** これにより、2 つの長年のギャップも閉じられます — 制限が厳しくなる前に作成されたサブスクリプションは `PATCH` 時だけでなく配信のたびに再評価され、`scope` / `entityOwner` の次元は具体的なタイプセレクターにも適用されます。
  ユーザードキュメントを持たない作成者 — **API キーと OAuth クライアント** — は、独自のバインドされたポリシーに対して評価されます (#2282): サブスクリプションは作成者のプリンシパル種別 (`createdByRole`) を格納し、述語は認証情報ドキュメントから派生し、`policyId` は **ライブ** で読み取られるため、キーの再バインドは次の配信で有効になります。プリンシパル種別は `createdBy` の形状から推測されることはないため、API キー ID のように見えるユーザー ID が認証情報のポリシーで評価されることはありません。
  述語が決定できない場合、配信は **停止** します (フェイルクローズ、`securityEvent` 警告ログ付き)。条件はプリンシパル種別によって異なります。**すべての** 作成者の場合: 通知されたテナントが無効化されている (#3543、`AUTH_ENABLED=false` の場合も)、`createdBy` が格納されていない (レガシードキュメント)、解決できないテナント、またはエンティティ読み取りを完全に拒否する述語。**ユーザー** 作成者の場合さらに: アクティブなユーザーに解決できない作成者 (削除 / 無効化)、または通知されたテナントでアクティブなメンバーシップを持たない作成者。**認証情報** 作成者 (`api_key` / `oauth_client`) の場合、ユーザーとメンバーシップの条件はまったく適用されません — 代わりに: `createdByRole` が格納されていない (# 2282 以前に書き込まれたサブスクリプション)、または認証情報ドキュメントが欠落している、取り消されている (`isActive: false`)、または別のテナントに属している。`AUTH_ENABLED=false` の場合、述語は存在せず、配信は無制限で、HTTP 読み取りパスと一致します。

> **注意**: 同じ所有権検証が登録 (`/v2/registrations`、`/ngsi-ld/v1/csourceRegistrations`) と — #2188 以降 — コンテキストソースサブスクリプション (`/ngsi-ld/v1/csourceSubscriptions`) に適用されます。同じ契約は #2198 以降、カスタムデータモデル (`/custom-data-models`) もカバーします。4 つすべてが共有: 管理者バイパス、`createdBy` の欠落 → `404`。**所有者の不一致は、サブスクリプション / 登録 / csource-subscriptions では `404` ですが (#2189)、カスタムデータモデルでは `403` のままです** — カスタムデータモデルは行レベルの読み取り述語の対象外であるため、その存在は `GET` で制限された呼び出し元に表示され、閉じるべき `404` 対 `403` の存在オラクルは存在しません。

### サブスクリプション書き込みの XACML 属性ベース制御 (#1104 / #2005)

すべてのサブスクリプション **書き込み** — 作成 *と* 更新、3 つすべてのサブスクリプションリソースにわたって — において、XACML PIP はサブスクリプションターゲット属性を `AuthzRequest.resource` に注入し、きめ細かいポリシー制御を可能にします:

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

`entities[]` に複数の要素が含まれる場合、**すべての要素が Permit でなければなりません** (全許可セマンティクス)。1 つのタイプまたは ID パターンが一致しないだけで、リクエスト全体が `403 Forbidden` で拒否されます。

サブスクリプションは継続的な読み取りであるため、更新は **更新後の有効値** で評価されます: リクエストボディが宣言する値、または — ボディがそれらに触れない場合 — すでに格納されている値。したがって、制限された呼び出し元は、許可されたサブスクリプションを制限されたタイプに切り替えることも、他のフィールドのみを編集して今では制限されたサブスクリプションを維持することもできません。制限されたサブスクリプションを許可されたタイプに絞り込むことは許可されます。

> リテラル `body.type === "Subscription"` は `entityType` に **伝播されません**。ポリシーはラッパーオブジェクトのタイプではなく、`entities[].type` をターゲットにする必要があります。
>
> `path` を `/ngsi-ld/v1/subscriptions` と完全に一致させるポリシーは、作成呼び出しのみをカバーします。更新もカバーするには glob (`/ngsi-ld/v1/subscriptions**`) を使用してください — `*` は `/` を越えません。

認証と認可の詳細については、[AUTH.md § Subscription PIP attributes](../reference/auth.md#subscription-pip-attributes) を参照してください。

***

## トラブルシューティング

### 1. Notifications Are Not Being Delivered

**原因:**

* 条件式が一致しない
  
* 通知先 URL に到達できない
  
* サブスクリプションが `inactive` または有効期限切れ
  
* テナントが無効化されている (#3543)。テナントが非アクティブの間、あらゆる種類の通知 (変更駆動型、定期的、コンテキストソース、Web Push) が停止します。サブスクリプションの `status` は変更されないため、`POST /admin/tenants/{tenantId}/activate` の後、サブスクリプションへの変更なしに配信が再開されます
  
* テナントの 1 日あたりの通知ファンアウトクォータ (`maxNotificationsPerDay`、#1544) がその日使い果たされています — [QUOTAS.md](../saas/quotas.md#notification-fan-out-quota-1544) を参照してください。これにより、個別の通知が (警告ログと `notificationQuotaExceeded` メトリックとともに) ドロップされますが、サブスクリプション自体には触れず、HTTP エラーも返されません。配信はトリガーする API リクエストの外部で発生するためです。**`remaining: 0` で `limit > 0`** の場合は、次の UTC 午前 0 時に自動的にクリアされます (カウンターは UTC 日バケットです)。**`limit: 0` は明示的で恒久的な停止** であり、そのテナントに対して自動的にクリアされることはなく、`PUT /admin/tenants/{tenantId}/quotas` によるクォータ変更が必要です
  
* **変更が他の API プロトコルを通じて行われた (#2253)。** `/ngsi-ld/v1/subscriptions` を通じて作成されたサブスクリプションは、NGSI-LD エンティティの変更に対してのみ発火し、`/v2/subscriptions` を通じて作成されたものは NGSIv2 の変更に対してのみ発火します。エンティティを書き込む API を通じてサブスクリプションを再作成してください。(#1570 以前に作成されたサブスクリプションは例外であり、両方に一致します。)
  
* **作成者がエンティティを読み取れない (#2205)。** 配信はサブスクリプション作成者の行レベル読み取り述語によってフィルタリングされるため、`GET /ngsi-ld/v1/entities` でそのプリンシパルから隠された行は配信もされません。API キーと OAuth クライアント作成者は、自身にバインドされたポリシーに対して判定されます (#2282)。述語が判定できない場合、配信は完全に停止します — すべての作成者: 保存された `createdBy` がないレガシーサブスクリプション。**ユーザー**作成者の場合: アクティブなユーザーに解決されなくなった作成者、またはテナント内のアクティブなメンバーシップを持たない作成者。**認証情報**作成者の場合: 保存された `createdByRole` がない、または認証情報が取り消された / 削除された / 別のテナントのもの (ユーザーとメンバーシップの条件は適用されません)。サーバーログには `errorCode: SUBSCRIPTION_NOTIFICATION_RLS_DENIED` (述語が拒否) または `SUBSCRIPTION_NOTIFICATION_RLS_SKIPPED` (述語が判定不可) が `subscriptionId` とともに記録されます。

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

* 条件式をテストする: エンティティを手動で更新し、条件が満たされることを確認する
  
* 通知 URL をテストする: `curl` で直接到達可能であることを確認する
  
* ステータスを `active` に変更する
  
* `currentUsage.notifications.day.remaining` が `0` の場合、配信は UTC 午前 0 時に自動的に再開されます。プラン制限を超える継続的な必要性がある場合は、`customQuotas.rateLimit.maxNotificationsPerDay` のオーバーライドをリクエストしてください

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

* `attrs` フィルタが正しく設定されていない
  
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

### 4. MQTT 通知が送信されていない

**原因:**

* MQTT ブローカーに接続できない
  
* Context Brokerのホスト名がプライベート / 内部アドレスに解決される。接続前に配信が拒否される(#3587、[MQTT](#mqtt) を参照)。パブリックContext Brokerは影響を受けない
  
* 認証資格情報が正しくない
  
* トピック名が無効

**確認方法:**

```bash
# Test the connection to the MQTT broker (using mosquitto_sub)
mosquitto_sub -h broker.example.com -p 1883 -t "sensors/#" -u username -P password
```

**解決方法:**

* MQTT ブローカーの URL、ポート、および資格情報を確認する
  
* トピック名に特殊文字が含まれていないか確認する
  
* QoS レベルを 0 に下げてみる

### 5. サブスクリプションが自動的に inactive になる

**原因:**

* 通知の送信先が、成功した配信なしに `NOTIFICATION_AUTO_PAUSE_AFTER_MS`(デフォルト 1 時間)の間、一時的なエラー(5xx、429、タイムアウト)を返し続ける(#3080)。その後 GeonicDB はサブスクリプションの `status` を `inactive` に設定し、`autoDisabledAt`(GeonicDB 拡張)を記録するため、Context Brokerの自動一時停止と手動の一時停止を区別できる。
  
* `404` / `410` を返す Web Push の送信先は、代わりに `status` を `failed` に設定する(#3014)。

**確認方法:**

* サブスクリプションを `GET` する:`status` が `inactive`(NGSI-LD では `paused` としてレンダリングされる)で、`autoDisabledAt` が存在する
  
* CloudWatch メトリクス `GeonicDB/SubscriptionAutoPaused` / アラーム `subscription-auto-paused`

**解決方法:**

* 通知の送信先を修正して 2xx で応答するようにする
  
* サブスクリプションを `active` に戻す(NGSIv2 では `status: "active"` で `PATCH`、NGSI-LD では `isActive: true`)。これにより `autoDisabledAt` と失敗の連続がクリアされる

### Fanout の可観測性(#3688 / #3173 C5)

SubscriptionMatcher(Lambda パス)は、各 fanout 試行後に EMF メトリクスを発行する:`SubscriptionMatcherNotifiable` / `Sent` / `Failed` / `SqsBatchFailed` / `Duration`(ミリ秒)を `GeonicDB` 名前空間に発行。アラーム `geonicdb-<env>-subscription-matcher-duration-p99` は、Lambda の `Duration` p99 が Timeout の 80%(Globals Timeout 30s で 24000ms)を 3 つの連続する 5 分間の期間で超えると発火する。これは既存の `subscription-matcher-errors`(15 分間の Errors)アラームよりも早期のシグナルとなる。メトリクス名としきい値は `docs/QUOTAS.md`(fanout 観測性)にリストされている。Standalone(`npm start` / E2E)はプロセス内配信を使用し、これらのメトリクスを発行しない。

***

## 関連ドキュメント


* [API Common Specification](../api-reference/endpoints.md) - REST API ドキュメント
  
* [API\_NGSIV2.md](../api-reference/ngsiv2.md) - NGSIv2 Subscriptions API リファレンス
  
* [API\_NGSILD.md](../api-reference/ngsild.md) - NGSI-LD Subscriptions API リファレンス
  
* [EVENT\_STREAMING.md](./subscriptions.md) - WebSocket Event Streaming
