---
title: "Event Streaming"
description: "Real-time event streaming"
outline: deep
---
# WebSocket イベントストリーミング

GeonicDB は WebSocket を介したリアルタイムイベントストリーミングをサポートしています。エンティティの変更をリアルタイムでサブスクリプションライブし、Web アプリケーションやダッシュボードに即座に反映させることができます。

## 目次


* [概要](#概要)
  
* [アーキテクチャと有効化](#アーキテクチャと有効化)
  
* [接続](#接続)
  
* [メッセージフォーマットとフィルタリング](#メッセージフォーマットとフィルタリング)
  
* [クライアント実装](#クライアント実装)
  
* [ベストプラクティス](#ベストプラクティス)
  
* [トラブルシューティング](#トラブルシューティング)
  
* [制約](#制約)

***

## 概要

イベントストリーミングは、既存の MongoDB Change Streams → EventBridge パイプラインに並列パスを追加し、エンティティの変更を WebSocket クライアントにブロードキャストします。

### WebSocket は NGSI-LD リーダーです (#2284)

**WebSocket 接続は NGSI-LD エンティティの変更のみをストリーミングします。NGSIv2 API を通じて行われた変更は、決してそこに配信されません。**

これは、ソケットがすでに何であるかから導かれます:配信されるイベントは、サブスクリプション `@context` で圧縮された NGSI-LD *normalized* 表現を運び (#2026 / #2044)、`entityTypes` セレクターは同じ `@context` で正規化されます (#2055)。エンティティはプロトコル分離されており (#964 — `POST /v2/entities` を通じて作成されたエンティティは NGSI-LD 読み取りには見えず、その逆も同様)、ソケットは *連続読み取り* であるため、同じ境界がそれに適用されます。#2284 以前はそうではありませんでした:ブロードキャストフィルターはテナント、デプロイメント、エンティティタイプ、ID パターンを比較しましたが、プロトコルは比較しなかったため、NGSIv2 書き込みは NGSI-LD サブスクリプションライバーに到達しました — これは HTTP サブスクリプションに対して #2253 が閉じたのと同じギャップの WebSocket セルです。

結果:


* 変更をストリーミングするには、NGSI-LD API (`/ngsi-ld/v1/entities`、`/ngsi-ld/v1/entityOperations/*`) を通じて書き込んでください。NGSIv2 ライターは代わりに HTTP サブスクリプション (`/v2/subscriptions`) を使用できます — これらは NGSIv2 の変更と一致し続けます。
  
* `protocol` フィールドなしで保存されたエンティティ (プロトコル分離以前のもの) は NGSI-LD として扱われ、読み取られる方法と一致します ([INTEROPERABILITY.md](../core-concepts/ngsiv2-vs-ngsild.md) を参照)。したがって、それらの変更は引き続き配信されます。
  
* 認可は NGSI-LD エンティティ読み取りパスに基づいてフレーム化されます — 以下の [WebSocket ポリシーは NGSI-LD 読み取りパスを許可する必要があります](#websocket-policies-must-permit-the-ngsi-ld-read-path-2284) および [AUTH.md](../reference/auth.md#websocket-authorization-ws--get) を参照してください。

### 通知チャネル比較

| Channel                  | Direction | Filtering                                                         | Latency |
| ------------------------ | --------- | ----------------------------------------------------------------- | ------- |
| HTTP Webhook (existing)  | Push      | Subscription conditions                                           | \~1 min |
| MQTT (existing)          | Push      | Subscription conditions                                           | \~1 min |
| WebSocket (this feature) | Push      | Tenant + entity type/ID pattern (**NGSI-LD changes only**, #2284) | \~1 min |

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

SAM テンプレートで `EventStreamingEnabled` パラメータを `true` に設定してデプロイしてください。

```bash
sam deploy -t infrastructure/template.yaml \
  --parameter-overrides EventStreamingEnabled=true
```

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

| Parameter    | Required | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tenant`     | ✅        | Tenant name (equivalent to the `Fiware-Service` header)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `deployment` | No       | Deployment hostname for non-default deployments (#2867). When the shared execute-api WebSocket endpoint is used (as returned by `GET /sdk/v1/streaming`), clients on a dedicated deployment **must** pass the same hostname registered in the `deployments` table (e.g. `ee24n6hnas.geonicdb.geolonia.com`). Omitted = Host-based resolution (unknown execute-api Host falls back to the env default DB). When present, resolution is **strict**: unknown, reserved, over-length, or disabled hostnames are rejected (403/400), and lookup infrastructure failures return 503. The GeonicDB SDK adds this parameter automatically when discovery returns a `deployment` field. |

### 認証

認証はデフォルトで有効になっています(明示的に `AUTH_ENABLED=false` を設定した場合のみ無効になります。これはローカル開発用です)。有効な場合、WebSocket 接続を確立するには認証トークンが必要です。トークンは以下の優先順位で抽出されます:


1. **`Authorization` ヘッダー(推奨)**: `Authorization: Bearer <token>` — 最も安全な方法
   
2. **`Sec-WebSocket-Protocol` ヘッダー(ブラウザ用)**: `Sec-WebSocket-Protocol: access_token, <token>` — ブラウザクライアントが `Authorization` ヘッダーを設定できない場合に使用します

> **破壊的変更 (#1072)**: `?token=<token>` クエリパラメータは受け付けなくなりました。URL はリバースプロキシ / WAF / ロードバランサーのアクセスログ、ブラウザ履歴、`Referer` ヘッダーに漏洩します。以前に URL 経由でトークンを渡していたクライアントは、上記の 2 つのヘッダー方式のいずれかに切り替える必要があります。


* REST API の `/auth/login` エンドポイントから取得した `accessToken` をトークンとして直接使用します。
  
* `super_admin` ロールは、WebSocket ストリーミングのために任意のテナントに接続できます。注意: `super_admin` は REST 経由でデータ API(`/v2/*`、`/ngsi-ld/*`)にアクセスできませんが、運用監視目的で WebSocket イベントストリーミングは許可されます。
  
* `tenant_admin` / `user` ロールは自分のテナントにのみ接続できます。

| Condition                                      | Result                       |
| ---------------------------------------------- | ---------------------------- |
| `AUTH_ENABLED=false`, no token                 | ✅ Connection allowed         |
| `AUTH_ENABLED=true`, no token                  | ❌ Connection rejected (1008) |
| `AUTH_ENABLED=true`, invalid token             | ❌ Connection rejected (1008) |
| `AUTH_ENABLED=true`, valid token, own tenant   | ✅ Connection allowed         |
| `AUTH_ENABLED=true`, valid token, other tenant | ❌ Connection rejected (1008) |
| `AUTH_ENABLED=true`, super\_admin, any tenant  | ✅ Connection allowed         |

### 接続フロー


1. クライアントが WebSocket URL に接続します(`tenant` クエリパラメータは必須です。認証が有効な場合はトークンも必須です)
   
2. サーバーがトークンを検証し、テナントアクセス権を確認します(認証が有効な場合)
   
3. トークンに `cnf.jkt` クレーム(DPoP バインドトークン)が含まれる場合、接続は `pending_dpop` 状態になります — クライアントは 5 秒以内に `dpop_bind` メッセージを送信する必要があります(下記の [DPoP Binding](#dpop-binding-for-websocket) を参照)
   
4. サーバーが DynamoDB に接続を記録します(TTL: 2 時間)
   
5. オプション: `subscribe` メッセージでフィルター条件を設定します
   
6. エンティティが変更されると、サーバーがクライアントにイベントをプッシュします

***

## メッセージフォーマットとフィルタリング

### クライアント → サーバー

#### subscribe (フィルター設定)

```json
{
  "action": "subscribe",
  "entityTypes": ["Room", "Sensor"],
  "idPattern": "urn:ngsi-ld:Room:.*",
  "@context": "https://example.org/my-context.jsonld"
}
```

| Field         | Type                      | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `action`      | string                    | `subscribe`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `entityTypes` | string\[]                 | Entity types to filter                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `@context`    | string \| string\[] | **#2026.** JSON-LD `@context` used to render delivered events — the entity type and attribute names are compacted against it (ETSI GS CIM 009 clause 5.5.7), and the value is echoed back in each event's `@context` member. Omit it to get the core `@context` (names come through in stored form). Only URL strings (or an array of them, max 10 entries, 2048 chars each) are accepted; inline context objects are rejected so a single message cannot dictate unbounded resolution work. **It also governs `entityTypes` matching** — since #2055 the supplied `@context` is resolved once at `subscribe` time to expand `entityTypes` into the canonical stored form, so a term defined by a custom `@context` does change which entities match. `idPattern` alone is matched against the stored form verbatim. |
| `idPattern`   | string                    | Regular expression pattern for entity IDs. Omit the field to leave any existing ID filter untouched; send an **empty string** (`""`) to clear it and receive every entity ID again. Any other value is screened by the same ReDoS validation as every other regex entry point (max 200 chars, must compile, no quantified group containing an alternation or a nested quantifier — see SECURITY.md). Non-strings — including `null` — are rejected, matching how `entityTypes` is validated in the same message. A rejected value returns an error and leaves the existing subscription unchanged; the identical decision is made whether the broker runs on Lambda or standalone (#1931).                                                                                                                           |

##### サブスクリプション確認応答 (#2055)

成功時、サーバーは次のように応答します:

```json
{ "type": "subscribed" }
```

**フィルターがアクティブであると仮定する前に、このフレームを待つ必要があります。** `subscribe` の適用は非同期です — サーバーは、マッチングに使用される正規形式に `entityTypes` を展開するために、提供された `@context` を解決します (ETSI GS CIM 009 clause 5.5.7)。`subscribe` フレームとこの確認応答の間のウィンドウで公開されたイベントは、配信が保証されません。

なお、`ping`/`pong` は代替バリアとして使用できません:インバウンドメッセージは接続ごとに順次処理されないため、`subscribe` がまだ適用中であっても `pong` が返される可能性があります。

拒否された `subscribe` (無効な `entityTypes` / `idPattern` / `@context`、または認可拒否) は、代わりに `{"type": "error", "message": "..."}` を返し、確認応答は送信されません。

#### dpop\_bind (DPoP proof 検証)

```json
{
  "action": "dpop_bind",
  "proof": "<DPoP proof JWT>"
}
```

DPoP バインドトークン (`cnf.jkt` を含む JWT) で接続する場合に必要です。接続から 5 秒以内に送信する必要があります。サーバーは proof の JWK Thumbprint がトークンの `cnf.jkt` クレームと一致することを検証し、`{"type": "dpop_verified"}` で応答します。検証されるまで、他のすべてのメッセージは `{"type": "error", "message": "DPoP proof required"}` で拒否されます。

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
    "temperature": { "type": "Property", "value": 23.5 }
  },
  "changedAttributes": ["temperature"],
  "timestamp": "2024-01-01T00:00:00Z",
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.9.jsonld"
}
```

| Field               | Type                      | Description                                                                                                                                                                                                                                               |
| ------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`              | string                    | `entityCreated`, `entityUpdated`, `entityDeleted`                                                                                                                                                                                                         |
| `tenant`            | string                    | Tenant name                                                                                                                                                                                                                                               |
| `servicePath`       | string                    | Service path                                                                                                                                                                                                                                              |
| `entityId`          | string                    | Entity ID                                                                                                                                                                                                                                                 |
| `entityType`        | string \| string\[] | Entity type(s), compacted with the subscription `@context` (clause 5.5.7). **#2477:** a single type is a string; multi-type entities use a string array (Table 5.2.4 / same rule as GET).                                                                 |
| `data`              | object                    | Entity attributes in **NGSI-LD normalized representation** (clause 4.5.2). Attribute names are compacted with the subscription `@context`; sub-attributes appear inline; multi-attributes (clause 4.5.5) appear as an instance array carrying `datasetId` |
| `changedAttributes` | string\[]                 | Names of changed attributes (on update only)                                                                                                                                                                                                              |
| `timestamp`         | string                    | Event timestamp (ISO 8601)                                                                                                                                                                                                                                |
| `@context`          | string \| string\[] | **#2026.** The vocabulary `entityType` and the `data` keys were rendered with — the subscription `@context`, or the core `@context` when none was given                                                                                                   |

> **#2026 / #2044 で変更されました。** イベントは以前、Context Brokerの内部属性形式を伝達していました:
> NGSIv2 スタイルの型名 (`"Number"`、`"Text"`)、`metadata` ラッパーの下にネストされたサブ属性、それらを解決するための `@context` がない完全修飾属性/型名、および内部形式のマルチ属性インスタンス。配信されるイベントは現在、**HTTP 通知と同じ表現レイヤー**を通過するため、`data` は NGSI-LD 正規化されています。エンベロープキー自体は変更されておらず、`@context` は純粋に追加的なものです — それを無視するクライアントは引き続き動作します。

> **TTL 有効期限での `entityDeleted` (#1561)**: `expiresAt` で作成されたエンティティは、有効期限が切れたときに `entityDeleted` も発行します — バックグラウンドの*有効期限スイーパー*が TTL 期限切れエンティティ (`expiresAt <= now`) を最大で 1 分に 1 回要求してイベントを公開します。MongoDB 自身の TTL モニターはアプリケーション層の外でドキュメントを削除するため、そのままではクライアントが気付かないままになるためです。配信は他の変更イベントと同様にベストエフォートです: エンティティを要求してから公開するまでの間にスイープが失敗すると、通知が失われる可能性があります (エンティティ自体は削除済みとしてマークされ、同じスイープ内で API 経由では見えなくなります)。イベントは `expiresAt` が経過してから最大約 1 分後に期待してください。即座ではありません。
>
> **スナップショットクローン / リストア (#1563)**: `POST /ngsi-ld/v1/snapshots/{id}/clone` は `EntityService` の外でエンティティを書き込みます (`replaceOne` / `insertOne`)。現在は `createEventPublisher()` を通じて `entityCreated` (挿入) または `entityUpdated` (置換) を公開するため、WebSocket / サブスクリプションのサブスクリプションライバーはリストアを確認できます。ファンアウトボリュームは送信時に既存の通知ファンアウトクォータ (#1544) によって制限されます — クローンは別の上限を追加しません。
>
> **意図的に発行しないパス (#1563)**: テナントカスケード削除 (`tenant-data-cleanup.service.ts`) およびインデックス作成中の無効な geo の検疫 (`client.ts` の `quarantineInvalidGeoDocument`) は、設計上イベントなしのままです — 前者はテナント解体時の通知フラッドを避けるため、後者はビジネス変更ではなくインフラストラクチャ修復であるためです。両方の決定はコードコメントに記録されています。

### フィルタリング

フィルタリングは次の順序で 4 つのレイヤーで適用されます:

0\. **プロトコルフィルター (#2284、設定不可)** — **NGSI-LD** API を通じて行われた変更のみがブロードキャストされます。NGSIv2 の変更は、接続が検討される前にドロップされます(`debug` レベルで `WS_DELIVERY_PROTOCOL_MISMATCH`)。[WebSocket is an NGSI-LD reader](#websocket-is-an-ngsi-ld-reader-2284) を参照してください。

1. **テナントフィルター (必須)** — 接続時に `tenant` クエリパラメーターを介して自動的に適用されます。
   
2. **接続側 `subscribe` フィルター (オプション)** — クライアントが受信したいものを絞り込みます:
   
   * `entityTypes`: 受信するエンティティタイプの配列
     
   * `idPattern`: `entityId` に対してマッチする正規表現
     
3. **XACML 認可フィルター** — 上記を通過した各接続に対して、ブロードキャスターはアクティブな XACML ポリシーを実行します。イベントに対してサブジェクトが `Permit` されている接続のみに配信されます。

#### XACML で利用可能なイベントごとのリソース属性 (#1107)

ブロードキャスターが配信を認可する際、これらのエンティティごとのリソース属性を AuthzRequest に注入します:

| attributeId   | Source                                                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `entityType`  | event's entity type                                                                                                               |
| `entityId`    | event's entity ID                                                                                                                 |
| `entityOwner` | event entity's `createdBy` (the user who originally `POST`ed the entity)                                                          |
| `scope`       | event entity's `scope`, comma-joined — same matching semantics as entity-level checks and the list-query row filter (#1369/#1383) |

これにより、`entityOwner` に対する `${subject.userId}` テンプレート展開を使用した単一の XACML ポリシーで、「各ユーザーは自分が作成したエンティティのイベントのみを受信する」といった **ユーザーごとの配信フィルター** を記述できます。完全なポリシー例については、[`docs/AUTH.md` — Per-entity attributes at broadcast time](../reference/auth.md#per-entity-attributes-at-broadcast-time-1107--1383) を参照してください。

> 認証なしで書き込まれたエンティティ(または `createdBy` を設定しないレガシー/バッチパス経由)は、`owner` 属性なしでイベントを発行します — オーナーベースのルールはそれらのイベントにマッチしないため、フォールバックを考慮してポリシーを設計してください。

#### WebSocket ポリシーは NGSI-LD 読み取りパスを許可する必要があります (#2284)

`authorizeWs()` は、すべての WebSocket 決定を `resource.path = /ngsi-ld/v1/entities` でフレーム化します。以前は `/v2/entities` を送信していましたが、これは同じソケット上の NGSI-LD 表現とセレクター処理と矛盾していました。

**これは NGSIv2 パスグロブのみを通じて WebSocket アクセスを許可するカスタムポリシーにとっての破壊的変更です**(例: ターゲットが `{"attributeId": "path", "matchValue": "/v2/**"}` であるルール)。このようなルールは WebSocket リクエストのターゲットセットの一部ではなくなるため、`Permit` を提供せず、サブスクリプションは拒否されます。ロールのデフォルト(`user`、`tenant_admin`)は `/v2/**` *および* `/ngsi-ld/**` を許可するため、ロールのデフォルトに依存するプリンシパルは影響を受けません。

移行: 同じサブジェクトに対して `/ngsi-ld/**` — または具体的な `/ngsi-ld/v1/entities` — にマッチするルールを追加(または拡大)し、既存の `entityType` / `entityOwner` / `scope` 条件はそのまま保持します。影響を受けるポリシーを見つけるには、`subscribe` 時にこの警告を監視してください:

```json
{ "level": "WARN", "errorCode": "WS_AUTHZ_FRAME_MIGRATION_REQUIRED", "wsFramePath": "/ngsi-ld/v1/entities", "legacyFramePath": "/v2/entities" }
```

これは、NGSI-LD フレームの下でサブスクリプションライブが拒否されたが、古い NGSIv2 フレームの下では許可されて*いた*場合に発行されます — つまり、拡大が必要なポリシーそのものです。決定は依然として `Deny` です: レガシーフレームを尊重すると、NGSIv2 読み取りに制限されたプリンシパルが NGSI-LD エンティティを受信できるようになりますが、これは #2284 が閉じる境界です。

**逆方向には警告ではなく移行が必要です。** `/v2/**` グロブを通じて WebSocket 配信を*制限*していたポリシー(例:「このユーザーが作成したエンティティのみ」)も新しいフレームの下ではターゲットから外れます — そしてその場合、ロールのデフォルトの `Permit` が生き残るため、ソケットは**テナント内のそのタイプのすべて**を受信します。

このケースのために、明示的なレガシー `Deny` を尊重する移行時のセーフティネットが使用されていました。**それは [#2326](https://github.com/geolonia/geonicdb/issues/2326) で削除されました**。移行が完了し、対応する警告が一度も観測されなかったためです。**`/v2/**` のみにスコープされた制限ポリシーは、もはや WebSocket 配信を制限しません — `/ngsi-ld/**` に再スコープしてください。**

***

## クライアント実装

### JavaScript SDK (推奨)

GeonicDB JavaScript SDK は、WebSocket イベントストリーミングを使用する最もシンプルな方法を提供します。認証、トークンのリフレッシュ、DPoP バインディング、および再接続を自動的に処理します。

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

### クイックスタート (生の WebSocket、最小限のセットアップ)

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
      // Control frames carry no entityId/data, so they must not go down the
      // entity-event path. `dpop_verified` acknowledges a `dpop_bind`.
      if (data.type === 'pong' || data.type === 'dpop_verified') return;
      // #2055: the subscription filter is now active on the server.
      if (data.type === 'subscribed') {
        console.log('✅ Subscription active');
        return;
      }
      // `error` covers every server-side rejection, not just `subscribe`.
      if (data.type === 'error') {
        console.error('❌ WebSocket error:', data.message);
        return;
      }

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

// Control frames carry no entity payload — keep them out of the entity event type.
// `subscribed` (#2055) means the subscription filter is now active on the server;
// `dpop_verified` acknowledges a successful `dpop_bind`; `error` covers every
// server-side rejection (invalid JSON, DPoP failures, a rejected `subscribe`,
// unknown action), so do not label it as subscribe-specific.
interface ControlFrame {
  type: 'pong' | 'subscribed' | 'dpop_verified' | 'error';
  message?: string;
}

interface EntityEvent {
  type: 'entityCreated' | 'entityUpdated' | 'entityDeleted';
  tenant: string;
  entityId: string;
  entityType: string | string[];  // #2477: multi-type is string[]
  data: Record<string, any>;
  entity?: Record<string, any>;  // Complete NGSI-LD entity ({ id, type, ...data }). Undefined for some delete events.
  changedAttributes?: string[];
  timestamp: string;
  '@context'?: string | string[];  // #2026: vocabulary the names were rendered with
}

interface UseGeonicDBWebSocketOptions {
  wsUrl: string;
  tenant: string;
  token?: string;
  entityTypes?: string[];
  onEvent?: (event: EntityEvent) => void;
  /** #2055: fired once the server has activated the subscription filter. */
  onSubscribed?: () => void;
}

export function useGeonicDBWebSocket({
  wsUrl,
  tenant,
  token,
  entityTypes,
  onEvent,
  onSubscribed
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
      const data: ControlFrame | EntityEvent = JSON.parse(event.data);

      // Control frames first — they have no entity payload, so passing them to
      // onEvent would append `undefined` entity ids to the caller's event list.
      if (data.type === 'pong' || data.type === 'dpop_verified') return;
      if (data.type === 'subscribed') {
        onSubscribed?.();
        return;
      }
      if (data.type === 'error') {
        console.error('❌ WebSocket error:', (data as ControlFrame).message);
        return;
      }

      onEvent?.(data as EntityEvent);
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
    // `onSubscribed` is captured by the `onmessage` closure, so it belongs here —
    // otherwise a re-rendered parent's new callback never sees the ACK.
  }, [wsUrl, tenant, token, entityTypes, onEvent, onSubscribed]);

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

### JavaScript (認証付き)

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

***

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

| State          | Description                          | Allowed Messages          |
| -------------- | ------------------------------------ | ------------------------- |
| `pending_dpop` | Awaiting DPoP proof after connection | `dpop_bind` only          |
| `verified`     | DPoP proof verified successfully     | `subscribe`, `ping`, etc. |

`dpop_bind` メッセージが 5 秒以内に受信されない場合、接続は終了されます。

***

## ベストプラクティス

### 1. Reconnection Logic

> **注意**: JavaScript SDK を使用している場合、エクスポネンシャルバックオフを使用した再接続機能が組み込まれています。`db.reconnect()` を使用して強制的に再接続するか、`reconnecting` イベントをリッスンして再接続の試行を追跡できます。以下の例は、生の WebSocket 実装用です。

エクスポネンシャルバックオフを使用した堅牢な再接続を実装します:

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

大量のイベントを受信する場合、デバウンスを使用して UI 更新を最適化します:

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
  
* 認証が有効な場合 (デフォルト) にトークンが提供されていない

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

* **変更が NGSIv2 API を通じて書き込まれた (#2284)** — WebSocket ストリームは NGSI-LD の変更のみ
  
* フィルタが厳しすぎる
  
* テナントが間違っている
  
* カスタム XACML ポリシーが `/v2/**` のみに読み取りアクセスを許可している ([#2284 migration](#websocket-policies-must-permit-the-ngsi-ld-read-path-2284) を参照 — WebSocket を対象としなくなったため、`Permit` が提供されません)
  
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

* ローカルサーバーが実行されていない
  
* WebSocket URL が正しくない

**解決方法:**

```bash
# Start the local server
npm start

# Use ws:// locally (not wss://)
const wsUrl = 'ws://localhost:3000?tenant=demo';
```

### 5. Debugging

ブラウザの開発者ツールの Network タブで WebSocket 接続と送受信メッセージを検査できます。

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

## 制約

| Item                   | Value         | Description                                                     |
| ---------------------- | ------------- | --------------------------------------------------------------- |
| Idle timeout           | 10 minutes    | Clients must send a ping every 5 minutes                        |
| Concurrent connections | 500 (default) | Can be increased via AWS Support                                |
| Frame size             | 128KB         | Large entities require truncation                               |
| Latency                | \~1 minute    | Depends on the MongoDB Change Stream polling interval           |
| API protocol           | NGSI-LD only  | Changes written through the NGSIv2 API are not streamed (#2284) |
| Connection TTL         | 2 hours       | Automatically cleaned up by DynamoDB TTL                        |
| Local development      | Supported     | Available via local WebSocket server                            |

### マルチデプロイメントルーティング (#1304)

ホスト名ルーティングされたデプロイメント（マルチサブドメイン構成）に対応するため、イベントと接続レコードにデプロイメント情報が付与される:


* **イベントスキーマ**: `EntityChangeEvent` / `RuleNotificationEvent` に `deployment?: { hostname: string }` フィールドが追加された（`undefined` = env デフォルト DB）。発行時に発生元デプロイメントが自動付与され、背景ワーカー（購読 matcher / notifier / rules / WS broadcaster）がこのホスト名で正しい DB に対して処理する
  
* **WS 接続レコード**: `$connect` 時に `Host` ヘッダー、または `#2867` の `?deployment=` クエリパラメータからデプロイメントを解決し、接続レコードに `hostname` を保存する。broadcaster はイベントの発生元デプロイメントと接続の `hostname` が一致する接続にのみ配信する（デフォルト同士も一致扱い — 既存接続と後方互換）。認可（XACML）もそのデプロイメントの DB に対して評価される
  
* **SDK ディスカバリ** (#2867): `GET /sdk/v1/streaming` はリクエスト `Host` が非 default デプロイメントに解決できる場合、レスポンスに `deployment` フィールド（hostname）を含める。SDK は `$connect` URL に `?deployment=` を自動付与する
  
* **未知ホストの WS 接続**: `?deployment=` 省略時は Host ベース。HTTP と異なり 404 にせずデフォルト扱いで受け入れる（現状 WS は raw `execute-api` ドメインが唯一の経路のため）。**`?deployment=` 明示時は strict** — unknown / 予約語 / 超過長は拒否 (#2867)
  
* **lookup 一時障害時の WS $connect** (#1306): デプロイメント解決がインフラ障害（`error`）で失敗した場合は fail-closed で **503** を返して接続を拒否する（デフォルト DB へフォールバックして誤った DB のデータを配信しないため）。Host ベースで未登録ホスト（`not_found`）はデフォルト扱いのまま。**`?deployment=` 明示時の unknown/not\_found は 403**
  
* **背景ワーカーの lookup 障害耐性** (#1306): EventBridge 駆動ワーカー（rules / WS broadcaster）と SQS 駆動 notifier は、lookup 一時障害イベントを再試行し、リトライ超過分を `<stack>-worker-dlq`（EventBridge 系）/ 通知 DLQ（SQS 系）に退避する。standalone 経路は有限リトライ後に skip する（再配信機構なし）
  
* **制限**: デプロイメント DB への直接 DB 書き込み（API 非経由）は WS 配信されない（change stream バックアップはデフォルト DB のみ）

***

## 関連ドキュメント


* JavaScript SDK - SDK API リファレンス（ブラウザアプリケーションに推奨）
  
* [API 共通仕様](../api-reference/endpoints.md) - REST API ドキュメント
  
* [認証と認可](../reference/auth.md) - 認証設定
  
* 開発ガイド - ローカル開発とデプロイメント
