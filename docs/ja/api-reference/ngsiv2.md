---
title: NGSIv2 API リファレンス
description: GeonicDB NGSIv2 REST API の完全リファレンス -- エンティティの CRUD、属性操作、バッチ処理、サブスクリプション、レジストレーション、エンティティタイプ。
outline: deep
---

# NGSIv2 API リファレンス

このページでは、GeonicDB NGSIv2 REST API の完全なリファレンスを提供します。すべてのエンドポイントは、SaaS のベース URL 配下で利用できます。

```text
https://api.geonicdb.geolonia.com/v2/
```

すべてのリクエストには、テナントを指定するための `Fiware-Service` ヘッダーが必要です。

```bash
curl https://api.geonicdb.geolonia.com/v2/entities \
  -H "Fiware-Service: mytenant"
```

ページネーションの一般的な情報については[ページネーション](/ja/api-reference/pagination)を参照してください。HTTP ステータスコードについては[ステータスコード](/ja/api-reference/status-codes)を参照してください。エンドポイントの一覧については[エンドポイント](/ja/api-reference/endpoints)を参照してください。

## エンティティ操作

### エンティティ一覧の取得

```http
GET /v2/entities
```

エンティティの一覧を取得します。タイプ、属性値、地理的位置などでフィルタリングできます。

**クエリパラメータ**

| パラメータ | 型 | 説明 | デフォルト |
|-----------|------|-------------|---------|
| `limit` | integer | 最大取得件数（上限: 1000） | 20 |
| `offset` | integer | ページネーションのオフセット | 0 |
| `orderBy` | string | ソートフィールド（`entityId`、`entityType`、`modifiedAt`） | - |
| `type` | string | エンティティタイプでフィルタリング | - |
| `idPattern` | string | エンティティ ID の正規表現パターン | - |
| `q` | string | 属性値フィルター（[クエリ言語](/ja/core-concepts/query-language)） | - |
| `mq` | string | メタデータ値フィルター（[クエリ言語](/ja/core-concepts/query-language)） | - |
| `attrs` | string | 返却する属性のカンマ区切りリスト | - |
| `metadata` | string | メタデータ出力制御（`on`、`off`） | `on` |
| `georel` | string | 地理クエリ演算子（例: `near;maxDistance:1000`） | - |
| `geometry` | string | ジオメトリタイプ（`point`、`polygon`、`line`） | - |
| `coords` | string | 座標（lat,lon 形式、セミコロン区切り） | - |
| `options` | string | `keyValues`、`values`、`count`、`geojson`、`sysAttrs`、`unique` | - |

**リクエスト**

```bash
curl -s "https://api.geonicdb.geolonia.com/v2/entities?type=Room&limit=10&options=count" \
  -H "Fiware-Service: smartbuilding"
```

**レスポンス** `200 OK`

```json
[
  {
    "id": "urn:ngsi-ld:Room:001",
    "type": "Room",
    "temperature": {
      "type": "Number",
      "value": 23.5,
      "metadata": {}
    },
    "pressure": {
      "type": "Integer",
      "value": 720,
      "metadata": {}
    }
  }
]
```

`options=count` を指定すると、レスポンスに一致するエンティティの総数を示す `Fiware-Total-Count` ヘッダーが含まれます。

#### keyValues 形式

`options=keyValues` を指定すると、属性はタイプやメタデータを含まないシンプルなキーバリュー形式で返されます。

```bash
curl -s "https://api.geonicdb.geolonia.com/v2/entities?type=Room&options=keyValues" \
  -H "Fiware-Service: smartbuilding"
```

```json
[
  {
    "id": "urn:ngsi-ld:Room:001",
    "type": "Room",
    "temperature": 23.5,
    "pressure": 720
  }
]
```

#### GeoJSON 形式

`options=geojson` または `Accept: application/geo+json` ヘッダーを指定すると、レスポンスは GeoJSON FeatureCollection 形式でフォーマットされます。

```bash
curl -s "https://api.geonicdb.geolonia.com/v2/entities?type=Store&options=geojson" \
  -H "Fiware-Service: smartcity"
```

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "Store1",
      "geometry": { "type": "Point", "coordinates": [139.6917, 35.6895] },
      "properties": { "id": "Store1", "type": "Store", "name": "Tokyo Store" }
    }
  ]
}
```

レスポンスの `Content-Type` は `application/geo+json` に設定されます。

### エンティティの作成

```http
POST /v2/entities
```

新しいエンティティを作成します。リクエストボディには `id` と `type` を含める必要があります。

**リクエスト**

```bash
curl -X POST https://api.geonicdb.geolonia.com/v2/entities \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
    "id": "urn:ngsi-ld:Room:001",
    "type": "Room",
    "temperature": {
      "type": "Number",
      "value": 23.5,
      "metadata": {
        "unit": { "type": "Text", "value": "CEL" }
      }
    },
    "pressure": {
      "type": "Integer",
      "value": 720
    }
  }'
```

**レスポンス** `201 Created`

`Location` ヘッダーに、新しく作成されたエンティティの URL が含まれます。

```text
Location: /v2/entities/urn:ngsi-ld:Room:001?type=Room
```

### エンティティの取得

```http
GET /v2/entities/{entityId}
```

ID を指定して単一のエンティティを取得します。

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `type` | string | エンティティタイプ（同一 ID のエンティティが複数存在する場合は必須） |
| `attrs` | string | 返却する属性のカンマ区切りリスト |
| `options` | string | `keyValues`、`values` |

**リクエスト**

```bash
curl -s https://api.geonicdb.geolonia.com/v2/entities/urn:ngsi-ld:Room:001 \
  -H "Fiware-Service: smartbuilding" | jq .
```

**レスポンス** `200 OK`

```json
{
  "id": "urn:ngsi-ld:Room:001",
  "type": "Room",
  "temperature": {
    "type": "Number",
    "value": 23.5,
    "metadata": {
      "unit": { "type": "Text", "value": "CEL" }
    }
  },
  "pressure": {
    "type": "Integer",
    "value": 720,
    "metadata": {}
  }
}
```

### エンティティ属性の更新 (PATCH)

```http
PATCH /v2/entities/{entityId}/attrs
```

エンティティの属性を部分的に更新します。指定された属性のみが変更されます。存在しない属性は追加されます。

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `type` | string | エンティティタイプ |

**リクエスト**

```bash
curl -X PATCH https://api.geonicdb.geolonia.com/v2/entities/urn:ngsi-ld:Room:001/attrs \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
    "temperature": {
      "type": "Number",
      "value": 25.0
    }
  }'
```

**レスポンス** `204 No Content`

### エンティティ属性の置換 (PUT)

```http
PUT /v2/entities/{entityId}/attrs
```

エンティティのすべての属性を置換します。リクエストボディに含まれない属性は削除されます。

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `type` | string | エンティティタイプ |

**レスポンス** `204 No Content`

### エンティティ属性の追加 (POST)

```http
POST /v2/entities/{entityId}/attrs
```

エンティティに新しい属性を追加します。同名の既存属性は上書きされます。

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `type` | string | エンティティタイプ |

**リクエスト**

```bash
curl -X POST https://api.geonicdb.geolonia.com/v2/entities/urn:ngsi-ld:Room:001/attrs \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
    "humidity": {
      "type": "Number",
      "value": 55
    }
  }'
```

**レスポンス** `204 No Content`

### エンティティの削除

```http
DELETE /v2/entities/{entityId}
```

ID を指定してエンティティを削除します。

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `type` | string | エンティティタイプ |

**リクエスト**

```bash
curl -X DELETE https://api.geonicdb.geolonia.com/v2/entities/urn:ngsi-ld:Room:001 \
  -H "Fiware-Service: smartbuilding"
```

**レスポンス** `204 No Content`

## 属性操作

### エンティティ属性の一覧取得

```http
GET /v2/entities/{entityId}/attrs
```

エンティティのすべての属性を取得します。`GET /v2/entities/{entityId}` とは異なり、このエンドポイントでは `id` と `type` フィールドは**含まれません**。

**クエリパラメータ**

| パラメータ | 型 | 説明 | デフォルト |
|-----------|------|-------------|---------|
| `type` | string | エンティティタイプ | - |
| `attrs` | string | 返却する属性のカンマ区切りリスト | - |
| `metadata` | string | メタデータ出力制御（`on`、`off`） | `on` |
| `options` | string | `keyValues`、`values`、`sysAttrs` | - |

**リクエスト**

```bash
curl -s https://api.geonicdb.geolonia.com/v2/entities/urn:ngsi-ld:Room:001/attrs \
  -H "Fiware-Service: smartbuilding" | jq .
```

**レスポンス** `200 OK`

```json
{
  "temperature": {
    "type": "Number",
    "value": 23.5,
    "metadata": {}
  },
  "pressure": {
    "type": "Integer",
    "value": 720,
    "metadata": {}
  }
}
```

### 単一属性の取得

```http
GET /v2/entities/{entityId}/attrs/{attrName}
```

タイプ、値、メタデータを含む単一の属性を取得します。

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `type` | string | エンティティタイプ |

**リクエスト**

```bash
curl -s https://api.geonicdb.geolonia.com/v2/entities/urn:ngsi-ld:Room:001/attrs/temperature \
  -H "Fiware-Service: smartbuilding" | jq .
```

**レスポンス** `200 OK`

```json
{
  "type": "Number",
  "value": 23.5,
  "metadata": {}
}
```

### 単一属性の更新

```http
PUT /v2/entities/{entityId}/attrs/{attrName}
```

単一の属性を完全に置換します（タイプ、値、メタデータすべて）。

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `type` | string | エンティティタイプ |

**リクエスト**

```bash
curl -X PUT https://api.geonicdb.geolonia.com/v2/entities/urn:ngsi-ld:Room:001/attrs/temperature \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
    "type": "Number",
    "value": 25.0
  }'
```

**レスポンス** `204 No Content`

### 単一属性の削除

```http
DELETE /v2/entities/{entityId}/attrs/{attrName}
```

エンティティから単一の属性を削除します。

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `type` | string | エンティティタイプ |

**リクエスト**

```bash
curl -X DELETE https://api.geonicdb.geolonia.com/v2/entities/urn:ngsi-ld:Room:001/attrs/pressure \
  -H "Fiware-Service: smartbuilding"
```

**レスポンス** `204 No Content`

### 属性値の取得

```http
GET /v2/entities/{entityId}/attrs/{attrName}/value
```

タイプやメタデータを含まない、属性の生の値のみを取得します。

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `type` | string | エンティティタイプ |

レスポンスの `Content-Type` は値の型に応じて異なります。

| 値の型 | Content-Type | 例 |
|------------|--------------|---------|
| 文字列 | `text/plain` | `hello world` |
| 数値 | `text/plain` | `23.5` |
| 真偽値 | `text/plain` | `true` |
| null | `text/plain` | `null` |
| オブジェクト | `application/json` | `{"lat": 35.68, "lon": 139.76}` |
| 配列 | `application/json` | `[1, 2, 3]` |

**リクエスト**

```bash
curl -s https://api.geonicdb.geolonia.com/v2/entities/urn:ngsi-ld:Room:001/attrs/temperature/value \
  -H "Fiware-Service: smartbuilding"
```

**レスポンス** `200 OK`

```text
23.5
```

### 属性値の更新

```http
PUT /v2/entities/{entityId}/attrs/{attrName}/value
```

属性の値のみを更新します。既存のタイプとメタデータは保持されます。

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `type` | string | エンティティタイプ |

`Content-Type` ヘッダーによってリクエストボディの解釈が決まります。

| Content-Type | 解釈 |
|--------------|----------------|
| `application/json` | JSON としてパース（オブジェクト、配列、数値、真偽値、null） |
| `text/plain` | プリミティブ値（数値、真偽値、`null`）または文字列 |

**リクエスト (text/plain)**

```bash
curl -X PUT https://api.geonicdb.geolonia.com/v2/entities/urn:ngsi-ld:Room:001/attrs/temperature/value \
  -H "Content-Type: text/plain" \
  -H "Fiware-Service: smartbuilding" \
  -d "25.5"
```

**リクエスト (application/json)**

```bash
curl -X PUT https://api.geonicdb.geolonia.com/v2/entities/urn:ngsi-ld:Car:001/attrs/location/value \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -d '{"type": "Point", "coordinates": [139.76, 35.68]}'
```

**レスポンス** `204 No Content`

## バッチ操作

バッチ操作は、単一のリクエストで複数のエンティティを処理します。各リクエストでは最大 **1,000 エンティティ** を処理できます。この上限を超えるリクエストは `400 Bad Request` を返します。

### バッチ更新

```http
POST /v2/op/update
```

単一のリクエストで複数のエンティティを作成、更新、または削除します。

**リクエストボディ**

```json
{
  "actionType": "append",
  "entities": [
    {
      "id": "urn:ngsi-ld:Room:001",
      "type": "Room",
      "temperature": { "type": "Number", "value": 21.0 }
    },
    {
      "id": "urn:ngsi-ld:Room:002",
      "type": "Room",
      "temperature": { "type": "Number", "value": 22.5 }
    }
  ]
}
```

**actionType の値**

| アクション | 説明 |
|--------|-------------|
| `append` | エンティティの属性を追加または更新します。エンティティが存在しない場合は作成します。 |
| `appendStrict` | 新しい属性のみを追加します。属性が既に存在してもエラーにはなりません。 |
| `update` | 既存の属性のみを更新します。エンティティが存在しない場合はエラーを返します。 |
| `replace` | エンティティのすべての属性を置換します。 |
| `delete` | エンティティまたは特定の属性を削除します。 |

**リクエスト**

```bash
curl -X POST https://api.geonicdb.geolonia.com/v2/op/update \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
    "actionType": "append",
    "entities": [
      {
        "id": "urn:ngsi-ld:Room:001",
        "type": "Room",
        "temperature": { "type": "Number", "value": 21.0 }
      },
      {
        "id": "urn:ngsi-ld:Room:002",
        "type": "Room",
        "temperature": { "type": "Number", "value": 22.5 }
      }
    ]
  }'
```

**レスポンス**

- すべての操作が成功: `204 No Content`
- 一部成功またはエラー: `200 OK`（詳細付き）

```json
{
  "success": [
    { "entityId": "urn:ngsi-ld:Room:001" }
  ],
  "errors": [
    {
      "entityId": "urn:ngsi-ld:Room:002",
      "error": {
        "code": "NotFound",
        "message": "Entity not found: urn:ngsi-ld:Room:002"
      }
    }
  ]
}
```

### バッチクエリ

```http
POST /v2/op/query
```

複雑なフィルタ条件でエンティティをクエリします。`GET /v2/entities` と同じフィルタリング機能を POST ボディ経由で利用でき、大規模または複雑なクエリに便利です。

**リクエスト**

```bash
curl -X POST https://api.geonicdb.geolonia.com/v2/op/query \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
    "entities": [
      { "idPattern": ".*", "type": "Room" }
    ],
    "attrs": ["temperature"],
    "expression": {
      "q": "temperature>20",
      "georel": "within",
      "geometry": "polygon",
      "coords": "138,34;141,34;141,37;138,37;138,34"
    }
  }'
```

**レスポンス** `200 OK`

一致するエンティティの配列を返します。

```json
[
  {
    "id": "urn:ngsi-ld:Room:001",
    "type": "Room",
    "temperature": {
      "type": "Number",
      "value": 23.5,
      "metadata": {}
    }
  }
]
```

### 通知の受信

```http
POST /v2/op/notify
```

外部の Context Broker からの通知を受信します。通知ペイロード内のエンティティは `append` セマンティクスで処理されます（存在しない場合は作成、存在する場合は更新）。

**リクエスト**

```bash
curl -X POST https://api.geonicdb.geolonia.com/v2/op/notify \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
    "subscriptionId": "sub123",
    "data": [
      {
        "id": "urn:ngsi-ld:Room:001",
        "type": "Room",
        "temperature": { "type": "Number", "value": 25.0 }
      }
    ]
  }'
```

**リクエストボディのフィールド**

| フィールド | 型 | 必須 | 説明 |
|-------|------|----------|-------------|
| `subscriptionId` | string | はい | この通知をトリガーしたサブスクリプション ID |
| `data` | array | はい | NGSIv2 正規化形式のエンティティ配列 |

**レスポンス** `200 OK`

## サブスクリプション

サブスクリプションを使用すると、エンティティデータの変更時に通知を受信できます。GeonicDB は HTTP、MQTT、およびカスタム HTTP（httpCustom）の通知チャネルをサポートしています。

### サブスクリプションの作成

```http
POST /v2/subscriptions
```

#### HTTP 通知

```bash
curl -X POST https://api.geonicdb.geolonia.com/v2/subscriptions \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
    "description": "Room temperature monitoring",
    "subject": {
      "entities": [
        { "idPattern": ".*", "type": "Room" }
      ],
      "condition": {
        "attrs": ["temperature"],
        "expression": {
          "q": "temperature>25"
        }
      }
    },
    "notification": {
      "http": {
        "url": "https://webhook.example.com/notify"
      },
      "attrs": ["temperature", "pressure"],
      "attrsFormat": "normalized"
    },
    "expires": "2030-12-31T23:59:59.000Z",
    "throttling": 5
  }'
```

**レスポンス** `201 Created`

`Location` ヘッダーにサブスクリプション ID が含まれます。

```text
Location: /v2/subscriptions/{subscriptionId}
```

#### MQTT 通知

```json
{
  "description": "Room temperature MQTT notification",
  "subject": {
    "entities": [
      { "type": "Room" }
    ],
    "condition": {
      "attrs": ["temperature"]
    }
  },
  "notification": {
    "mqtt": {
      "url": "mqtt://broker.example.com:1883",
      "topic": "sensors/room/temperature",
      "qos": 1,
      "retain": false,
      "user": "username",
      "passwd": "password"
    },
    "attrs": ["temperature"]
  }
}
```

**MQTT 通知のフィールド**

| フィールド | 型 | 必須 | 説明 |
|-------|------|----------|-------------|
| `url` | string | はい | MQTT ブローカーの URL（`mqtt://` または `mqtts://`） |
| `topic` | string | はい | 送信先トピック |
| `qos` | integer | いいえ | QoS レベル（0、1、2）。デフォルト: 0 |
| `retain` | boolean | いいえ | Retain フラグ。デフォルト: false |
| `user` | string | いいえ | 認証ユーザー名 |
| `passwd` | string | いいえ | 認証パスワード |

#### httpCustom 通知

`httpCustom` 通知タイプを使用すると、送信される HTTP リクエストのメソッド、ヘッダー、クエリ文字列、ペイロードテンプレート（マクロ置換付き）を完全に制御できます。

```json
{
  "description": "Custom notification with payload template",
  "subject": {
    "entities": [{ "type": "Room" }],
    "condition": { "attrs": ["temperature"] }
  },
  "notification": {
    "httpCustom": {
      "url": "https://api.example.com/events",
      "method": "PUT",
      "headers": {
        "X-Api-Key": "secret-key"
      },
      "qs": { "entityId": "${id}", "temp": "${temperature}" },
      "payload": "Entity ${id} has temperature ${temperature}"
    }
  }
}
```

**httpCustom のフィールド**

| フィールド | 型 | 必須 | 説明 |
|-------|------|----------|-------------|
| `url` | string | はい | 送信先 URL |
| `method` | string | いいえ | HTTP メソッド（GET、POST、PUT、PATCH、DELETE）。デフォルト: POST |
| `headers` | object | いいえ | カスタム HTTP ヘッダー |
| `qs` | object | いいえ | クエリ文字列パラメータ（`${...}` マクロ置換対応） |
| `payload` | string | いいえ | リクエストボディテンプレート（`${...}` マクロ置換対応） |

**マクロ置換**

`payload` と `qs` フィールドでは、`${...}` 構文を使用してエンティティデータを埋め込めます。

| マクロ | 置換内容 |
|-------|---------------|
| `${id}` | エンティティ ID |
| `${type}` | エンティティタイプ |
| `${attrName}` | 属性値（正規化属性から `.value` を抽出） |

存在しない属性を参照するマクロは文字列 `null` に置換されます。マクロは `attrs`/`exceptAttrs` フィルタリングの適用前に、完全なエンティティに対して評価されます。

### 通知の属性フィルタリング

通知ペイロードに含まれる属性を制御します。

| フィールド | 型 | 説明 |
|-------|------|-------------|
| `attrs` | string[] | 通知に含める属性 |
| `exceptAttrs` | string[] | 通知から除外する属性 |
| `onlyChangedAttrs` | boolean | `true` の場合、実際に変更された属性のみが含まれます。`attrs`/`exceptAttrs` と併用可能。 |

::: warning
同一のサブスクリプションで `attrs` と `exceptAttrs` の両方を指定することはできません。いずれか一方を使用してください。
:::

### attrsFormat

`notification` 内の `attrsFormat` フィールドは、通知におけるエンティティデータの形式を制御します。

| 形式 | 説明 |
|--------|-------------|
| `normalized` | タイプとメタデータを含む標準的な NGSIv2 形式（デフォルト） |
| `keyValues` | タイプやメタデータを含まない簡略化されたキーバリュー形式 |

### サブスクリプション一覧の取得

```http
GET /v2/subscriptions
```

**クエリパラメータ**

| パラメータ | 型 | 説明 | デフォルト |
|-----------|------|-------------|---------|
| `limit` | integer | 最大取得件数 | 20 |
| `offset` | integer | ページネーションのオフセット | 0 |
| `status` | string | ステータスでフィルタリング（`active`、`inactive`） | - |

**リクエスト**

```bash
curl -s https://api.geonicdb.geolonia.com/v2/subscriptions \
  -H "Fiware-Service: smartbuilding" | jq .
```

**レスポンス** `200 OK`

```json
[
  {
    "id": "5f8a7b3c-abcd-1234-5678-ef0123456789",
    "description": "Room temperature monitoring",
    "status": "active",
    "subject": {
      "entities": [
        { "idPattern": ".*", "type": "Room" }
      ],
      "condition": {
        "attrs": ["temperature"],
        "expression": { "q": "temperature>25" }
      }
    },
    "notification": {
      "http": {
        "url": "https://webhook.example.com/notify"
      },
      "attrs": ["temperature", "pressure"],
      "attrsFormat": "normalized",
      "timesSent": 12,
      "lastNotification": "2026-02-10T08:30:00.000Z"
    },
    "expires": "2030-12-31T23:59:59.000Z",
    "throttling": 5
  }
]
```

### サブスクリプションの取得

```http
GET /v2/subscriptions/{subscriptionId}
```

**リクエスト**

```bash
curl -s https://api.geonicdb.geolonia.com/v2/subscriptions/5f8a7b3c-abcd-1234-5678-ef0123456789 \
  -H "Fiware-Service: smartbuilding" | jq .
```

**レスポンス** `200 OK` -- サブスクリプションオブジェクトを返します。

### サブスクリプションの更新

```http
PATCH /v2/subscriptions/{subscriptionId}
```

サブスクリプションを部分的に更新します。指定されたフィールドのみが変更されます。

**リクエスト**

```bash
curl -X PATCH https://api.geonicdb.geolonia.com/v2/subscriptions/5f8a7b3c-abcd-1234-5678-ef0123456789 \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartbuilding" \
  -d '{
    "status": "inactive"
  }'
```

**レスポンス** `204 No Content`

### サブスクリプションの削除

```http
DELETE /v2/subscriptions/{subscriptionId}
```

**リクエスト**

```bash
curl -X DELETE https://api.geonicdb.geolonia.com/v2/subscriptions/5f8a7b3c-abcd-1234-5678-ef0123456789 \
  -H "Fiware-Service: smartbuilding"
```

**レスポンス** `204 No Content`

## レジストレーション

レジストレーションは、エンティティデータを提供する外部コンテキストプロバイダーを定義します。クエリが登録済みプロバイダーに一致すると、GeonicDB はリクエストを転送し、結果をマージします（フェデレーション）。

### レジストレーションの作成

```http
POST /v2/registrations
```

**リクエスト**

```bash
curl -X POST https://api.geonicdb.geolonia.com/v2/registrations \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -d '{
    "description": "Weather data provider",
    "dataProvided": {
      "entities": [
        { "type": "WeatherObserved" }
      ],
      "attrs": ["temperature", "humidity", "pressure"]
    },
    "provider": {
      "http": {
        "url": "http://weather-service:8080/v2"
      }
    },
    "expires": "2040-12-31T23:59:59.000Z",
    "status": "active"
  }'
```

**リクエストボディのフィールド**

| フィールド | 型 | 必須 | 説明 |
|-------|------|----------|-------------|
| `description` | string | いいえ | レジストレーションの説明 |
| `dataProvided.entities` | array | はい | 対象エンティティ（`id`、`idPattern`、`type`） |
| `dataProvided.attrs` | array | いいえ | 提供される属性 |
| `provider.http.url` | string | はい | プロバイダーの URL |
| `expires` | string | いいえ | 有効期限（ISO 8601 形式） |
| `status` | string | いいえ | `active` または `inactive`。デフォルト: `active` |

**レスポンス** `201 Created`

`Location` ヘッダーにレジストレーション ID が含まれます。

```text
Location: /v2/registrations/{registrationId}
```

### レジストレーション一覧の取得

```http
GET /v2/registrations
```

**クエリパラメータ**

| パラメータ | 型 | 説明 | デフォルト |
|-----------|------|-------------|---------|
| `limit` | integer | 最大取得件数 | 20 |
| `offset` | integer | ページネーションのオフセット | 0 |

**リクエスト**

```bash
curl -s https://api.geonicdb.geolonia.com/v2/registrations \
  -H "Fiware-Service: smartcity" | jq .
```

**レスポンス** `200 OK`

```json
[
  {
    "id": "5f8a7b3c-1234-5678-abcd-ef0123456789",
    "description": "Weather data provider",
    "dataProvided": {
      "entities": [{ "type": "WeatherObserved" }],
      "attrs": ["temperature", "humidity", "pressure"]
    },
    "provider": {
      "http": { "url": "http://weather-service:8080/v2" }
    },
    "status": "active"
  }
]
```

### レジストレーションの取得

```http
GET /v2/registrations/{registrationId}
```

**レスポンス** `200 OK` -- レジストレーションオブジェクトを返します。

### レジストレーションの更新

```http
PATCH /v2/registrations/{registrationId}
```

レジストレーションを部分的に更新します。指定されたフィールドのみが変更されます。

**リクエスト**

```bash
curl -X PATCH https://api.geonicdb.geolonia.com/v2/registrations/5f8a7b3c-1234-5678-abcd-ef0123456789 \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -d '{
    "description": "Updated weather data provider"
  }'
```

**レスポンス** `204 No Content`

### レジストレーションの削除

```http
DELETE /v2/registrations/{registrationId}
```

**リクエスト**

```bash
curl -X DELETE https://api.geonicdb.geolonia.com/v2/registrations/5f8a7b3c-1234-5678-abcd-ef0123456789 \
  -H "Fiware-Service: smartcity"
```

**レスポンス** `204 No Content`

### フェデレーション

クエリが登録済みプロバイダーに一致すると、GeonicDB は自動的にリクエストを外部プロバイダーに転送し、ローカルデータと結果をマージします。

```text
Client Request
    |
    v
GeonicDB Context Broker
    |
    +-- Local DB query
    |
    +-- Forward to registered provider(s)
            |
            v
        Merge results --> Return to client
```

**レジストレーションモード**

| モード | クエリ動作 | 更新動作 |
|------|----------------|-----------------|
| `inclusive` | ローカル + リモートの結果を返す（デフォルト） | ローカル + リモートを更新 |
| `exclusive` | リモートの結果のみを返す | リモートのみを更新 |
| `redirect` | 303 リダイレクト URL を返す | 303 リダイレクト URL を返す |
| `auxiliary` | ローカル優先、リモートで補完 | ローカルのみ（リモートは読み取り専用） |

## エンティティタイプ

### タイプ一覧の取得

```http
GET /v2/types
```

現在のテナントのすべてのエンティティタイプを、件数と属性情報とともに取得します。

**クエリパラメータ**

| パラメータ | 説明 |
|-----------|-------------|
| `options=count` | タイプごとのエンティティ件数を含める |
| `options=values` | 属性の詳細を含める |

**リクエスト**

```bash
curl -s https://api.geonicdb.geolonia.com/v2/types \
  -H "Fiware-Service: smartbuilding" | jq .
```

**レスポンス** `200 OK`

```json
[
  {
    "type": "Room",
    "count": 5,
    "attrs": {
      "temperature": { "types": ["Number"] },
      "pressure": { "types": ["Integer"] }
    }
  }
]
```

### タイプの取得

```http
GET /v2/types/{typeName}
```

特定のエンティティタイプの詳細を取得します。

**リクエスト**

```bash
curl -s https://api.geonicdb.geolonia.com/v2/types/Room \
  -H "Fiware-Service: smartbuilding" | jq .
```

**レスポンス** `200 OK`

```json
{
  "type": "Room",
  "count": 5,
  "attrs": {
    "temperature": { "types": ["Number"] },
    "pressure": { "types": ["Integer"] }
  }
}
```

## クエリパラメータリファレンス

このセクションでは、`GET /v2/entities` および `POST /v2/op/query` で利用可能なクエリパラメータをまとめます。

### ページネーション

| パラメータ | 型 | 説明 | デフォルト |
|-----------|------|-------------|---------|
| `limit` | integer | 返却する結果数（上限: 1000） | 20 |
| `offset` | integer | スキップする結果数 | 0 |

ページネーションを実装するには、`Fiware-Total-Count` ヘッダー（`options=count` で返却）を使用します。詳細は[ページネーション](/ja/api-reference/pagination)を参照してください。

### フィルタリング

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `type` | string | エンティティタイプでフィルタリング |
| `idPattern` | string | エンティティ ID にマッチする正規表現 |
| `q` | string | 属性値でフィルタリング。[クエリ言語](/ja/core-concepts/query-language)を参照。 |
| `mq` | string | メタデータ値でフィルタリング。[クエリ言語](/ja/core-concepts/query-language)を参照。 |

### 射影

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `attrs` | string | レスポンスに含める属性のカンマ区切りリスト |
| `metadata` | string | メタデータ出力制御: `on`（デフォルト）または `off` |

### ソート

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `orderBy` | string | ソートフィールド: `entityId`、`entityType`、`modifiedAt` |

### 地理クエリ

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `georel` | string | 地理クエリ演算子（例: `near;maxDistance:1000`、`within`、`intersects`、`disjoint`） |
| `geometry` | string | 参照ジオメトリタイプ（`point`、`polygon`、`line`） |
| `coords` | string | lat,lon 形式の座標。複数点の場合はセミコロン区切り |

**例: ある地点から 1 km 以内のエンティティを検索**

```bash
curl -s "https://api.geonicdb.geolonia.com/v2/entities?type=Store&georel=near;maxDistance:1000&geometry=point&coords=35.6895,139.6917" \
  -H "Fiware-Service: smartcity"
```

### options の値

| 値 | 説明 |
|-------|-------------|
| `keyValues` | 属性をシンプルなキーバリュー形式で返す |
| `values` | 属性値を配列として返す |
| `count` | 一致するエンティティの総数を `Fiware-Total-Count` ヘッダーに含める |
| `geojson` | 結果を GeoJSON FeatureCollection として返す |
| `sysAttrs` | システム属性（`dateCreated`、`dateModified`）を含める |
| `unique` | 一意の属性値のみを返す |

複数のオプションはカンマで結合できます: `options=keyValues,count`。

## 関連ページ

- [エンドポイント](/ja/api-reference/endpoints) -- 利用可能なすべての API エンドポイントのクイックリファレンス
- [ページネーション](/ja/api-reference/pagination) -- limit、offset、count を使用したページネーションパターン
- [ステータスコード](/ja/api-reference/status-codes) -- HTTP ステータスコードとエラーレスポンス
- [クエリ言語](/ja/core-concepts/query-language) -- q、mq、地理クエリによるエンティティフィルタリング
