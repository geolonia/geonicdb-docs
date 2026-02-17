---
title: NGSI-LD API リファレンス
description: GeonicDB の NGSI-LD API 完全リファレンス -- エンティティの CRUD、バッチ操作、サブスクリプション、レジストレーション、時系列クエリなど。ETSI GS CIM 009 V1.9.1 に準拠。
outline: deep
---

# NGSI-LD API リファレンス

このページでは、GeonicDB で利用可能な NGSI-LD API エンドポイントについて説明します。実装は **[ETSI GS CIM 009 V1.9.1 (2025-07)](https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/01.09.01_60/gs_CIM009v010901p.pdf)** に準拠しています。

## ベース URL

```text
https://api.geonicdb.geolonia.com/ngsi-ld/v1/
```

すべてのリクエストには以下のヘッダーが必要です:

| ヘッダー | 必須 | 説明 |
|--------|----------|-------------|
| `x-api-key` | はい | API キー |
| `Fiware-Service` | はい | データ分離のためのテナント名 |
| `Content-Type` | 書き込み操作時 | `application/ld+json`、`application/json`、または `application/merge-patch+json` |
| `Accept` | 任意 | レスポンス形式を制御（[コンテントネゴシエーション](#コンテントネゴシエーション)を参照） |

## コンテントネゴシエーション

NGSI-LD は `Accept` ヘッダーによるコンテントネゴシエーションをサポートしています。

| Accept ヘッダー | レスポンス形式 | `@context` の扱い |
|---------------|-----------------|---------------------|
| `application/ld+json` | JSON-LD | レスポンスボディに含まれる |
| `application/json` | JSON | `Link` ヘッダーで返される |
| `application/geo+json` | GeoJSON | `Link` ヘッダーで返される |

`Accept: application/json` を使用した場合、レスポンスには `Link` ヘッダーが含まれます:

```text
Link: <https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"
```

`application/ld+json` リクエストの場合は、リクエストボディに `@context` を含めます:

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "id": "urn:ngsi-ld:Room:001",
  "type": "Room"
}
```

`application/json` リクエストの場合は、代わりに `Link` ヘッダーで `@context` を指定します。

## 準拠リファレンス

| 機能カテゴリ | ETSI GS CIM 009 セクション |
|------------------|-------------------------|
| エンティティ操作 | Section 5.6 |
| クエリ操作 | Section 5.7 |
| サブスクリプション | Section 5.8 |
| コンテキストソースレジストレーション | Section 5.9 |
| Temporal API | Section 5.6.12 -- 5.6.19 |
| EntityMaps | Section 5.14 |
| JSON-LD コンテキスト管理 | Section 5.11 |
| 分散オペレーション | Section 5.10 |

## エンティティ操作

### エンティティ一覧の取得

```http
GET /ngsi-ld/v1/entities
```

指定したフィルタに一致するエンティティを取得します。

**リクエスト例:**

```bash
curl -s "https://api.geonicdb.geolonia.com/ngsi-ld/v1/entities?type=Room&limit=10" \
  -H "Accept: application/ld+json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq .
```

**クエリパラメータ:**

| パラメータ | 型 | 説明 | デフォルト |
|-----------|------|-------------|---------|
| `type` | string | エンティティタイプでフィルタ | -- |
| `id` | string | カンマ区切りのエンティティ ID | -- |
| `idPattern` | string | エンティティ ID の正規表現パターン | -- |
| `q` | string | 属性値によるフィルタリングのクエリ式 | -- |
| `attrs` | string | 返す属性名のカンマ区切りリスト | -- |
| `pick` | string | 含める属性（`omit` と排他的） | -- |
| `omit` | string | 除外する属性（`pick` と排他的。`id` と `type` は除外不可） | -- |
| `limit` | integer | 最大結果数 | 20 |
| `offset` | integer | スキップする結果数 | 0 |
| `orderBy` | string | ソートフィールド（`entityId`、`entityType`、`modifiedAt`） | -- |
| `scopeQ` | string | スコープクエリ（例: `/Madrid`、`/Madrid/#`、`/Madrid/+`） | -- |
| `lang` | string | LanguageProperty フィルタ（BCP 47、カンマ区切りの優先順位、`*` で全言語） | -- |
| `georel` | string | 地理クエリ演算子（例: `near;maxDistance==1000`、`within`） | -- |
| `geometry` | string | ジオメトリタイプ（`Point`、`Polygon` など） | -- |
| `coordinates` | string | GeoJSON 座標 | -- |
| `geoproperty` | string | 地理クエリ対象の GeoProperty 名 | `location` |
| `format` | string | 出力形式（`simplified` で keyValues、`geojson` で GeoJSON） | -- |
| `options` | string | カンマ区切り: `keyValues`、`concise`、`entityMap`、`sysAttrs`、`splitEntities` | -- |

**レスポンス:** `200 OK`

```json
[
  {
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
    "id": "urn:ngsi-ld:Room:001",
    "type": "Room",
    "temperature": {
      "type": "Property",
      "value": 23.5,
      "observedAt": "2026-01-15T10:00:00Z",
      "unitCode": "CEL"
    },
    "location": {
      "type": "GeoProperty",
      "value": {
        "type": "Point",
        "coordinates": [139.7671, 35.6812]
      }
    }
  }
]
```

**レスポンスヘッダー:**

| ヘッダー | 説明 |
|--------|-------------|
| `NGSILD-Results-Count` | 合計件数（`count` オプション使用時） |

### エンティティの作成

```http
POST /ngsi-ld/v1/entities
```

新しいエンティティを作成します。

**リクエスト例:**

```bash
curl -X POST https://api.geonicdb.geolonia.com/ngsi-ld/v1/entities \
  -H "Content-Type: application/ld+json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
    "id": "urn:ngsi-ld:Room:001",
    "type": "Room",
    "temperature": {
      "type": "Property",
      "value": 23.5,
      "unitCode": "CEL"
    },
    "isPartOf": {
      "type": "Relationship",
      "object": "urn:ngsi-ld:Building:001"
    }
  }'
```

**レスポンス:** `201 Created`

```text
Location: /ngsi-ld/v1/entities/urn:ngsi-ld:Room:001
```

#### 一時エンティティ（expiresAt）

`expiresAt` フィールド（ISO 8601 形式の日時、未来の日時である必要あり）を追加すると、指定時刻に自動削除される一時エンティティを作成できます:

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "id": "urn:ngsi-ld:Room:temp-001",
  "type": "Room",
  "temperature": { "type": "Property", "value": 23.5 },
  "expiresAt": "2030-01-01T00:00:00Z"
}
```

### エンティティの取得

```http
GET /ngsi-ld/v1/entities/{entityId}
```

ID を指定して単一のエンティティを取得します。

**クエリパラメータ:**

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `type` | string | エンティティタイプ |
| `attrs` | string | 返す属性名のカンマ区切りリスト |
| `pick` | string | 含める属性（`omit` と排他的） |
| `omit` | string | 除外する属性（`pick` と排他的） |
| `lang` | string | LanguageProperty フィルタ（BCP 47） |
| `options` | string | `keyValues`、`concise`、`entityMap` |

**リクエスト例:**

```bash
curl -s "https://api.geonicdb.geolonia.com/ngsi-ld/v1/entities/urn:ngsi-ld:Room:001?attrs=temperature" \
  -H "Accept: application/ld+json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq .
```

**レスポンス:** `200 OK`

### エンティティの置換

```http
PUT /ngsi-ld/v1/entities/{entityId}
```

エンティティのすべての属性を置換します。リクエストボディに含まれない属性は削除されます。

**レスポンス:** `204 No Content`

### エンティティの更新（Merge-Patch）

```http
PATCH /ngsi-ld/v1/entities/{entityId}
```

**Merge-Patch セマンティクス**（ETSI GS CIM 009 Section 5.6.4）を使用してエンティティを部分更新します:

- `Content-Type: application/merge-patch+json` を使用して属性をマージします。リクエストボディに含まれない属性は保持されます。
- プロパティ値に `"urn:ngsi-ld:null"` を設定すると、その属性が削除されます。
- `options=keyValues` または `options=concise` で簡略化された入力形式を使用できます。

**リクエスト例:**

```bash
curl -X PATCH "https://api.geonicdb.geolonia.com/ngsi-ld/v1/entities/urn:ngsi-ld:Room:001" \
  -H "Content-Type: application/merge-patch+json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
    "temperature": {
      "type": "Property",
      "value": 25.0
    }
  }'
```

**レスポンス:** `204 No Content`

### エンティティ属性の追加

```http
POST /ngsi-ld/v1/entities/{entityId}
```

既存のエンティティに新しい属性を追加します。

| パラメータ | 説明 |
|-----------|-------------|
| `options=noOverwrite` | 既存の属性を上書きせず、新しい属性のみ追加する |

**レスポンス:** `204 No Content`

### エンティティの削除

```http
DELETE /ngsi-ld/v1/entities/{entityId}
```

**レスポンス:** `204 No Content`

## 属性操作

### エンティティの全属性取得

```http
GET /ngsi-ld/v1/entities/{entityId}/attrs
```

**レスポンス:** `200 OK`

### 複数属性の部分更新

```http
PATCH /ngsi-ld/v1/entities/{entityId}/attrs
```

複数の属性を一度に更新します。リクエストボディに含まれる属性のみが更新され、その他は保持されます。

**リクエスト例:**

```bash
curl -X PATCH "https://api.geonicdb.geolonia.com/ngsi-ld/v1/entities/urn:ngsi-ld:Room:001/attrs" \
  -H "Content-Type: application/ld+json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
    "temperature": {
      "type": "Property",
      "value": 25.0
    }
  }'
```

**レスポンス:** `204 No Content`

### 単一属性の取得

```http
GET /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
```

**レスポンス:** `200 OK`

### 属性の上書き（PUT）

```http
PUT /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
```

既存の属性を完全に上書きします。属性が存在しない場合は `404 Not Found` を返します。

**リクエストボディ:**

```json
{
  "type": "Property",
  "value": 25.0
}
```

**レスポンス:** `204 No Content`

### 属性の置換（POST）

```http
POST /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
```

属性を新しい値で置換します。

**レスポンス:** `204 No Content`

### 属性の部分更新（PATCH）

```http
PATCH /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
```

既存の属性を部分的に更新します。新しい属性は作成しません -- エンティティまたは属性が存在しない場合は `404 Not Found` を返します（ETSI GS CIM 009 V1.9.1 clause 5.6.4）。

**レスポンス:** `204 No Content`

### 属性の削除

```http
DELETE /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
```

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `datasetId` | string | 削除するマルチ属性インスタンスの `datasetId` |
| `deleteAll` | boolean | `true` の場合、この属性のすべてのインスタンスを削除する |

**レスポンス:** `204 No Content`

## バッチ操作

バッチ操作は 1 リクエストあたり最大 **1,000 エンティティ** を処理できます。この制限を超えるリクエストは `400 Bad Request` を返します。

### バッチ作成

```http
POST /ngsi-ld/v1/entityOperations/create
```

**リクエスト例:**

```bash
curl -X POST https://api.geonicdb.geolonia.com/ngsi-ld/v1/entityOperations/create \
  -H "Content-Type: application/ld+json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" \
  -d '[
    {
      "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
      "id": "urn:ngsi-ld:Room:001",
      "type": "Room",
      "temperature": { "type": "Property", "value": 23.5 }
    },
    {
      "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
      "id": "urn:ngsi-ld:Room:002",
      "type": "Room",
      "temperature": { "type": "Property", "value": 21.0 }
    }
  ]'
```

**レスポンス:**
- すべて成功: `201 Created`
- 部分的に成功: `207 Multi-Status`

### バッチ Upsert

```http
POST /ngsi-ld/v1/entityOperations/upsert
```

存在しないエンティティを作成し、既存のエンティティを更新します。

| パラメータ | 説明 |
|-----------|-------------|
| `options=replace` | 既存エンティティのすべての属性を置換する |

**レスポンス:**
- すべて成功: `201 Created`（新規）または `204 No Content`（更新）
- 部分的に成功: `207 Multi-Status`

### バッチ更新

```http
POST /ngsi-ld/v1/entityOperations/update
```

既存のエンティティを更新します。存在しないエンティティは部分的な失敗となります。

**レスポンス:**
- すべて成功: `204 No Content`
- 部分的に成功: `207 Multi-Status`

### バッチ削除

```http
POST /ngsi-ld/v1/entityOperations/delete
```

**リクエストボディ:** エンティティ ID の配列。

```json
["urn:ngsi-ld:Room:001", "urn:ngsi-ld:Room:002"]
```

**レスポンス:**
- すべて成功: `204 No Content`
- 部分的に成功: `207 Multi-Status`

### バッチクエリ

```http
POST /ngsi-ld/v1/entityOperations/query
```

構造化されたリクエストボディを使用した POST ベースのクエリです。

**リクエストボディ例:**

```json
{
  "type": "Room",
  "attrs": ["temperature"],
  "q": "temperature>20",
  "geoQ": {
    "georel": "within",
    "geometry": "Polygon",
    "coordinates": [[[138, 34], [141, 34], [141, 37], [138, 37], [138, 34]]]
  }
}
```

**レスポンス:** `200 OK` -- 一致するエンティティの配列。

### バッチマージ

```http
POST /ngsi-ld/v1/entityOperations/merge
```

複数のエンティティに対して Merge-Patch セマンティクスを適用します。既存の属性はマージされ、リクエストに含まれない属性は保持されます。属性を削除するには値に `"urn:ngsi-ld:null"` を使用します。

| パラメータ | 説明 |
|-----------|-------------|
| `options=noOverwrite` | 既存の属性を上書きしない |

**レスポンス:**
- すべて成功: `204 No Content`
- 部分的に成功: `207 Multi-Status`

### エンティティパージ

```http
POST /ngsi-ld/v1/entityOperations/purge
```

指定したタイプのすべてのエンティティを削除します（ETSI GS CIM 009 Section 5.6.14）。

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `type` | string | パージするエンティティタイプ（**必須**） |

**レスポンス:**
- 成功: `204 No Content`
- タイプ未指定: `400 Bad Request`

## サブスクリプション

> ETSI GS CIM 009 Section 5.8

サブスクリプションを使用すると、条件に一致するエンティティが作成・更新・削除された際に通知を受け取ることができます。

### サブスクリプションの作成

```http
POST /ngsi-ld/v1/subscriptions
```

#### HTTP 通知の例

```bash
curl -X POST https://api.geonicdb.geolonia.com/ngsi-ld/v1/subscriptions \
  -H "Content-Type: application/ld+json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
    "type": "Subscription",
    "entities": [{ "type": "Room" }],
    "watchedAttributes": ["temperature"],
    "q": "temperature>25",
    "notification": {
      "format": "normalized",
      "endpoint": {
        "uri": "https://webhook.example.com/notify",
        "accept": "application/ld+json"
      }
    }
  }'
```

#### MQTT 通知の例

エンドポイント URI スキームに `mqtt://` または `mqtts://` を使用し、パスにトピックを指定します:

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "type": "Subscription",
  "entities": [{ "type": "Room" }],
  "watchedAttributes": ["temperature"],
  "notification": {
    "format": "normalized",
    "endpoint": {
      "uri": "mqtt://broker.example.com:1883/sensors/room/temperature",
      "notifierInfo": [
        { "key": "MQTT-Version", "value": "mqtt5.0" },
        { "key": "MQTT-QoS", "value": "1" }
      ]
    }
  }
}
```

**MQTT notifierInfo オプション:**

| キー | 値 | 説明 |
|-----|--------|-------------|
| `MQTT-Version` | `mqtt3.1.1`、`mqtt5.0` | MQTT プロトコルバージョン |
| `MQTT-QoS` | `0`、`1`、`2` | Quality of Service レベル |

#### サブスクリプションフィールド

| フィールド | 型 | 説明 |
|-------|------|-------------|
| `entities` | array | エンティティタイプ / ID / idPattern フィルタ |
| `watchedAttributes` | string[] | 通知をトリガーする属性 |
| `q` | string | クエリ式フィルタ |
| `notification` | object | 通知エンドポイントとフォーマットの設定 |
| `cooldown` | integer | 通知間の最小間隔（秒） |
| `notificationTrigger` | string[] | トリガーイベント: `entityCreated`、`entityUpdated`、`entityChanged`、`entityDeleted`、`attributeCreated`、`attributeUpdated`、`attributeDeleted` |
| `showChanges` | boolean | 通知データに `previousValue` を含める |
| `notification.onlyChangedAttrs` | boolean | 変更された属性のみをペイロードに含める |
| `expiresAt` | string | サブスクリプションの有効期限（ISO 8601） |

::: warning
`watchedAttributes` と `timeInterval` は排他的です。両方を指定すると `400 Bad Request` が返されます（ETSI GS CIM 009 V1.9.1 clause 5.8.1）。
:::

**レスポンス:** `201 Created`

```text
Location: /ngsi-ld/v1/subscriptions/{subscriptionId}
```

### サブスクリプション一覧の取得

```http
GET /ngsi-ld/v1/subscriptions
```

| パラメータ | 型 | 説明 | デフォルト |
|-----------|------|-------------|---------|
| `limit` | integer | 最大結果数 | 20 |
| `offset` | integer | スキップする結果数 | 0 |

### サブスクリプションの取得

```http
GET /ngsi-ld/v1/subscriptions/{subscriptionId}
```

**通知ステータスフィールド（読み取り専用）:**

| フィールド | 型 | 説明 |
|-------|------|-------------|
| `notification.status` | string | `ok` または `failed` |
| `notification.lastNotification` | string | 最終通知時刻（ISO 8601） |
| `notification.lastFailure` | string | 最終失敗時刻（ISO 8601） |
| `notification.lastFailureReason` | string | 失敗理由（例: `HTTP 500: Internal Server Error`） |
| `notification.lastSuccess` | string | 最終成功時刻（ISO 8601） |
| `notification.timesSent` | integer | 送信された通知の合計数 |

**リトライ動作:** 一時的なエラー（5xx、ネットワークエラー）の場合、指数バックオフ（1 秒、2 秒、4 秒）で最大 3 回リトライします。4xx エラーではリトライしません。

### サブスクリプションの更新

```http
PATCH /ngsi-ld/v1/subscriptions/{subscriptionId}
```

**レスポンス:** `204 No Content`

### サブスクリプションの削除

```http
DELETE /ngsi-ld/v1/subscriptions/{subscriptionId}
```

**レスポンス:** `204 No Content`

## コンテキストソースレジストレーション

> ETSI GS CIM 009 Section 5.9

外部コンテキストプロバイダを登録することで、GeonicDB が複数のデータソースにまたがるクエリをフェデレーションできるようにします。

### レジストレーションの作成

```http
POST /ngsi-ld/v1/csourceRegistrations
```

**リクエスト例:**

```bash
curl -X POST https://api.geonicdb.geolonia.com/ngsi-ld/v1/csourceRegistrations \
  -H "Content-Type: application/ld+json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartcity" \
  -d '{
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
    "type": "ContextSourceRegistration",
    "registrationName": "Weather Data Provider",
    "endpoint": "http://context-provider:8080/ngsi-ld/v1",
    "information": [
      {
        "entities": [{ "type": "WeatherObserved" }],
        "propertyNames": ["temperature", "humidity"],
        "relationshipNames": ["observedBy"]
      }
    ],
    "mode": "inclusive"
  }'
```

**レジストレーションフィールド:**

| フィールド | 型 | 必須 | 説明 |
|-------|------|----------|-------------|
| `type` | string | はい | `ContextSourceRegistration` |
| `registrationName` | string | いいえ | レジストレーション名 |
| `description` | string | いいえ | 説明 |
| `endpoint` | string | はい | プロバイダのエンドポイント URL |
| `information` | array | はい | 提供するエンティティタイプ、プロパティ、リレーションシップ |
| `observationInterval` | object | いいえ | 観測期間（`start`、`end`） |
| `managementInterval` | object | いいえ | 管理期間（`start`、`end`） |
| `location` | GeoJSON | いいえ | 地理的スコープ |
| `expiresAt` | string | いいえ | 有効期限（ISO 8601） |
| `status` | string | いいえ | `active` または `inactive` |
| `mode` | string | いいえ | `inclusive`、`exclusive`、`redirect`、または `auxiliary` |

**レスポンス:** `201 Created`

```text
Location: /ngsi-ld/v1/csourceRegistrations/{registrationId}
```

### レジストレーション一覧の取得

```http
GET /ngsi-ld/v1/csourceRegistrations
```

| パラメータ | 型 | 説明 | デフォルト |
|-----------|------|-------------|---------|
| `limit` | integer | 最大結果数 | 20 |
| `offset` | integer | スキップする結果数 | 0 |

### レジストレーションの取得

```http
GET /ngsi-ld/v1/csourceRegistrations/{registrationId}
```

### レジストレーションの更新

```http
PATCH /ngsi-ld/v1/csourceRegistrations/{registrationId}
```

**レスポンス:** `204 No Content`

### レジストレーションの削除

```http
DELETE /ngsi-ld/v1/csourceRegistrations/{registrationId}
```

**レスポンス:** `204 No Content`

## タイプと属性のディスカバリ

### エンティティタイプ一覧

```http
GET /ngsi-ld/v1/types
```

現在のテナントのすべてのエンティティタイプを検出します。結果にはローカルエンティティとコンテキストソースレジストレーションの両方のタイプが含まれます。

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `limit` | integer | 最大結果数 |
| `offset` | integer | スキップする結果数 |

**レスポンス:** `200 OK`

```json
[
  {
    "id": "urn:ngsi-ld:EntityType:Room",
    "type": "EntityType",
    "typeName": "Room",
    "attributeNames": ["temperature", "pressure"],
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld"
  }
]
```

### エンティティタイプの詳細取得

```http
GET /ngsi-ld/v1/types/{typeName}
```

**レスポンス:** `200 OK`

```json
{
  "id": "urn:ngsi-ld:EntityType:Room",
  "type": "EntityTypeInformation",
  "typeName": "Room",
  "entityCount": 5,
  "attributeDetails": [
    {
      "id": "temperature",
      "type": "Attribute",
      "attributeTypes": ["Property"]
    }
  ],
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld"
}
```

### 属性一覧

```http
GET /ngsi-ld/v1/attributes
```

現在のテナントのエンティティで使用されているすべての属性名を検出します。

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `limit` | integer | 最大結果数 |
| `offset` | integer | スキップする結果数 |

**レスポンス:** `200 OK`

```json
[
  {
    "id": "urn:ngsi-ld:Attribute:temperature",
    "type": "Attribute",
    "attributeName": "temperature",
    "typeNames": ["Room", "Sensor"],
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld"
  }
]
```

### 属性の詳細取得

```http
GET /ngsi-ld/v1/attributes/{attrName}
```

**レスポンス:** `200 OK`

```json
{
  "id": "urn:ngsi-ld:Attribute:temperature",
  "type": "Attribute",
  "attributeName": "temperature",
  "attributeCount": 5,
  "typeNames": ["Room", "Sensor"],
  "attributeTypes": ["Property"],
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld"
}
```

## JSON-LD コンテキスト管理

> ETSI GS CIM 009 Section 5.12

カスタム語彙のためのユーザー定義 JSON-LD コンテキストを管理します。

### コンテキストの登録

```http
POST /ngsi-ld/v1/jsonldContexts
```

**リクエスト例:**

```bash
curl -X POST https://api.geonicdb.geolonia.com/ngsi-ld/v1/jsonldContexts \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
    "@context": {
      "type": "@type",
      "id": "@id",
      "Temperature": "https://example.org/ontology#Temperature"
    }
  }'
```

**レスポンス:** `201 Created`

```text
Location: /ngsi-ld/v1/jsonldContexts/{contextId}
```

### コンテキスト一覧の取得

```http
GET /ngsi-ld/v1/jsonldContexts
```

| パラメータ | 型 | 説明 | デフォルト |
|-----------|------|-------------|---------|
| `limit` | integer | 最大結果数 | 20 |
| `offset` | integer | スキップする結果数 | 0 |

### コンテキストの取得

```http
GET /ngsi-ld/v1/jsonldContexts/{contextId}
```

キャッシュのための条件付きリクエストをサポートしています:

| レスポンスヘッダー | 説明 |
|-----------------|-------------|
| `ETag` | コンテキストボディの MD5 ハッシュ |
| `Last-Modified` | コンテキスト作成時のタイムスタンプ |
| `Cache-Control` | `public, max-age=3600` |

| リクエストヘッダー | 動作 |
|----------------|----------|
| `If-None-Match` | ETag が一致した場合 `304 Not Modified` を返す |
| `If-Modified-Since` | 指定日時以降に変更がない場合 `304 Not Modified` を返す |

### コンテキストの削除

```http
DELETE /ngsi-ld/v1/jsonldContexts/{contextId}
```

**レスポンス:** `204 No Content`

## Temporal API

> ETSI GS CIM 009 Section 5.6.12 -- 5.6.19

Temporal API はエンティティの時系列データへのアクセスを提供します。

### テンポラルエンティティのクエリ

```http
GET /ngsi-ld/v1/temporal/entities
```

標準のクエリパラメータに加え、時系列固有のパラメータが利用可能です:

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `timerel` | string | 時間関係: `before`、`after`、`between` |
| `timeAt` | string | 基準時刻（ISO 8601） |
| `endTimeAt` | string | `between` クエリの終了時刻（ISO 8601） |
| `timeproperty` | string | 時間プロパティ名（デフォルト: `observedAt`） |
| `aggrMethods` | string | 集計方法（カンマ区切り）: `totalCount`、`distinctCount`、`sum`、`avg`、`min`、`max`、`stddev`、`sumsq` |
| `aggrPeriodDuration` | string | ISO 8601 期間（例: `PT1H`）。`aggrMethods` 指定時は**必須** |
| `options` | string | `temporalValues` で簡略化された時系列形式 |

::: warning
`aggrMethods` を `aggrPeriodDuration` なしで指定すると `400 Bad Request` が返されます。
:::

### テンポラルエンティティの取得

```http
GET /ngsi-ld/v1/temporal/entities/{entityId}
```

**temporalValues を使用した例:**

```bash
curl -s "https://api.geonicdb.geolonia.com/ngsi-ld/v1/temporal/entities/urn:ngsi-ld:Sensor:1?options=temporalValues&timerel=after&timeAt=2026-01-01T00:00:00Z" \
  -H "Accept: application/ld+json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartcity" | jq .
```

**`options=temporalValues` 使用時のレスポンス:**

```json
{
  "id": "urn:ngsi-ld:Sensor:1",
  "type": "Sensor",
  "temperature": {
    "type": "Property",
    "values": [[20.5, "2026-01-01T10:00:00Z"], [21.0, "2026-01-01T11:00:00Z"]]
  }
}
```

**集計の例:**

```bash
curl -s "https://api.geonicdb.geolonia.com/ngsi-ld/v1/temporal/entities/urn:ngsi-ld:Sensor:1?aggrMethods=avg&aggrPeriodDuration=PT1H&timerel=after&timeAt=2026-01-01T00:00:00Z" \
  -H "Accept: application/ld+json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartcity" | jq .
```

**集計レスポンス:**

```json
{
  "id": "urn:ngsi-ld:Sensor:1",
  "type": "Sensor",
  "temperature": {
    "type": "Property",
    "values": [
      {
        "@value": { "avg": 21.0 },
        "observedAt": "2026-01-01T10:00:00Z",
        "endAt": "2026-01-01T11:00:00Z"
      }
    ]
  }
}
```

### テンポラルバッチ操作

テンポラルエンティティのバッチ操作です（1 リクエストあたり最大 1,000 件）。

::: info GeonicDB 拡張
テンポラルバッチの `create`、`upsert`、`delete` は GeonicDB の独自拡張です（ETSI 仕様には含まれません）。`query` のみが仕様準拠です。
:::

| 操作 | メソッド | エンドポイント |
|-----------|--------|----------|
| バッチ作成 | `POST` | `/ngsi-ld/v1/temporal/entityOperations/create` |
| バッチ Upsert | `POST` | `/ngsi-ld/v1/temporal/entityOperations/upsert` |
| バッチ削除 | `POST` | `/ngsi-ld/v1/temporal/entityOperations/delete` |
| バッチクエリ | `POST` | `/ngsi-ld/v1/temporal/entityOperations/query` |

**バッチクエリの例:**

```json
{
  "type": "TemperatureSensor",
  "temporalQ": {
    "timerel": "after",
    "timeAt": "2026-01-01T00:00:00Z"
  }
}
```

## スナップショット

```http
GET /ngsi-ld/v1/snapshots
```

エンティティのスナップショットを取得します。スナップショットはエンティティの特定時点の状態を提供します。

## EntityMaps

EntityMaps はクエリ結果をマップとして保存し、エンティティ ID による効率的な検索を可能にします。

### EntityMap の作成

```http
POST /ngsi-ld/v1/entityMaps
```

**レスポンス:** `201 Created`（`Location` ヘッダー付き）。

### EntityMap 一覧の取得

```http
GET /ngsi-ld/v1/entityMaps
```

| パラメータ | 型 | 説明 | デフォルト |
|-----------|------|-------------|---------|
| `limit` | integer | 最大結果数 | 20 |
| `offset` | integer | スキップする結果数 | 0 |

### EntityMap の取得

```http
GET /ngsi-ld/v1/entityMaps/{entityMapId}
```

### EntityMap の更新

```http
PATCH /ngsi-ld/v1/entityMaps/{entityMapId}
```

**レスポンス:** `204 No Content`

### EntityMap の削除

```http
DELETE /ngsi-ld/v1/entityMaps/{entityMapId}
```

**レスポンス:** `204 No Content`

## クエリパラメータリファレンス

エンティティエンドポイント全体で利用可能なクエリパラメータの統合リファレンスです。

### フィルタリング

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `type` | string | エンティティタイプでフィルタ |
| `id` | string | エンティティ ID でフィルタ（カンマ区切り） |
| `idPattern` | string | エンティティ ID の正規表現パターン |
| `q` | string | NGSI-LD クエリ言語式（例: `temperature>25;humidity<80`） |
| `scopeQ` | string | スコープクエリ（例: `/Madrid`、`/Madrid/#`） |

### 属性の選択

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `attrs` | string | 返す属性のカンマ区切りリスト |
| `pick` | string | 含める属性（`omit` と排他的） |
| `omit` | string | 除外する属性（`pick` と排他的。`id` と `type` は除外不可） |

### ページネーションとソート

| パラメータ | 型 | 説明 | デフォルト |
|-----------|------|-------------|---------|
| `limit` | integer | 返す最大結果数 | 20 |
| `offset` | integer | スキップする結果数 | 0 |
| `orderBy` | string | ソートフィールド | -- |

### 地理クエリ

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `georel` | string | 地理クエリ演算子（例: `near;maxDistance==1000`、`within`、`intersects`） |
| `geometry` | string | ジオメトリタイプ（`Point`、`Polygon`、`LineString` など） |
| `coordinates` | string | GeoJSON 座標 |
| `geoproperty` | string | クエリ対象の GeoProperty 名（デフォルト: `location`） |

### 言語

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `lang` | string | LanguageProperty フィルタ（BCP 47 言語タグ、カンマ区切りで優先順位指定、`*` で全言語） |

### 出力オプション

| オプション | 説明 |
|--------|-------------|
| `keyValues` | 簡略化されたキーバリュー出力（タイプやサブ属性のメタデータなし） |
| `concise` | 簡潔な表記 |
| `entityMap` | 結果を EntityMap として返す |
| `sysAttrs` | システム属性（`createdAt`、`modifiedAt`）を含める |
| `splitEntities` | レスポンスをエンティティタイプごとに分割する |

### リンクエンティティの取得

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `join` | string | `inline`（Relationship 内にネスト）または `flat`（結果配列に追加） |
| `joinLevel` | integer | リンクエンティティの解決深度（デフォルト: 1） |

**例:**

```bash
curl -s "https://api.geonicdb.geolonia.com/ngsi-ld/v1/entities?type=Room&join=inline&joinLevel=2" \
  -H "Accept: application/ld+json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartcity" | jq .
```

## エラーレスポンス

NGSI-LD のエラーレスポンスは標準的な形式に従います:

```json
{
  "type": "https://uri.etsi.org/ngsi-ld/errors/BadRequestData",
  "title": "Bad Request Data",
  "detail": "Entity already exists"
}
```

主なエラータイプ:

| HTTP ステータス | エラータイプ | 説明 |
|-------------|-----------|-------------|
| `400` | `BadRequestData` | 不正なリクエストまたは無効なパラメータ |
| `404` | `ResourceNotFound` | エンティティ、属性、またはサブスクリプションが見つからない |
| `409` | `AlreadyExists` | 同じ ID のエンティティが既に存在する |
| `422` | `UnprocessableEntity` | 意味的に無効なリクエスト |

ステータスコードの完全な一覧は[ステータスコード](/ja/api-reference/status-codes)を参照してください。

## 関連ページ

- [NGSI データモデル](/ja/core-concepts/ngsi-data-model) -- エンティティ、属性、メタデータの理解
- [マルチテナンシー](/ja/core-concepts/multi-tenancy) -- `Fiware-Service` ヘッダーによるデータ分離
- [インストールとセットアップ](/ja/getting-started/installation) -- API エンドポイントと認証
- [初めてのエンティティチュートリアル](/ja/getting-started/first-entity) -- 実践的な CRUD ウォークスルー（NGSIv2）
- [ページネーション](/ja/api-reference/pagination) -- 全エンドポイント共通のページネーションパターン
- [ステータスコード](/ja/api-reference/status-codes) -- HTTP ステータスコードリファレンス
