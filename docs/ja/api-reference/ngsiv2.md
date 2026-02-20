---
title: "NGSIv2 API"
description: "NGSIv2 API リファレンス"
outline: deep
---
# NGSIv2 API

> このドキュメントは [API.md](./endpoints.md) から分離されたものです。メインのAPI仕様については [API.md](./endpoints.md) を参照してください。

---

### エンティティ操作

#### エンティティ一覧の取得

```http
GET /v2/entities
```

**クエリパラメータ**

| パラメータ | 型 | 説明 | デフォルト |
|-----------|-----|------|-----------|
| `id` | string | エンティティIDでフィルタ（カンマ区切りで複数指定可） | - |
| `limit` | integer | 取得件数（最大: 1000） | 20 |
| `offset` | integer | オフセット（ページネーション用） | 0 |
| `orderBy` | string | ソート基準（`entityId`, `entityType`, `modifiedAt`、属性名も可）。FIWARE Orion 互換の `!` プレフィックスで降順指定も可能（例: `!temperature`） | - |
| `orderDirection` | string | ソート方向（`asc`, `desc`）。**GeonicDB 独自拡張**（公式仕様は `!` プレフィックス方式のみ） | `asc` |
| `type` | string | エンティティタイプでフィルタ | - |
| `typePattern` | string | エンティティタイプの正規表現パターン | - |
| `idPattern` | string | エンティティIDの正規表現パターン | - |
| `q` | string | 属性値によるフィルタ（[クエリ言語](./endpoints.md#クエリ言語)参照） | - |
| `mq` | string | メタデータによるフィルタ（[クエリ言語](./endpoints.md#クエリ言語)参照） | - |
| `attrs` | string | 取得する属性名（カンマ区切り） | - |
| `metadata` | string | メタデータ出力制御（`on`, `off`）。**GeonicDB 独自拡張**（公式仕様はカンマ区切りの名前リストで `*` ワイルドカード等を指定） | `on` |
| `georel` | string | ジオクエリ演算子（[ジオクエリ](./endpoints.md#ジオクエリ)参照） | - |
| `geometry` | string | ジオメトリタイプ | - |
| `coords` | string | 座標（緯度,経度 形式、セミコロン区切り） | - |
| `spatialId` | string | 空間ID（ZFXY形式）でフィルタ（[空間ID検索](./endpoints.md#空間id検索)参照） | - |
| `spatialIdDepth` | integer | 空間ID階層展開の深さ（0-4） | 0 |
| `crs` | string | 座標参照系（[座標参照系（CRS）](./endpoints.md#座標参照系crs)参照） | `EPSG:4326` |
| `options` | string | `keyValues`, `values`, `count`, `geojson`, `sysAttrs`, `unique` | - |

**レスポンス例**

```json
[
  {
    "id": "Room1",
    "type": "Room",
    "temperature": {
      "type": "Float",
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

**keyValues形式**（`options=keyValues`）

```json
[
  {
    "id": "Room1",
    "type": "Room",
    "temperature": 23.5,
    "pressure": 720
  }
]
```

**count オプション**（`options=count`）

レスポンスヘッダーに `Fiware-Total-Count` が追加されます。

**geojson オプション**（`options=geojson` または `Accept: application/geo+json` ヘッダー）

GeoJSON FeatureCollection 形式でレスポンスを返します。

```bash
# options パラメータで指定
curl "http://localhost:3000/v2/entities?type=Store&options=geojson" \
  -H "Fiware-Service: myservice"

# Accept ヘッダーで指定
curl "http://localhost:3000/v2/entities?type=Store" \
  -H "Fiware-Service: myservice" \
  -H "Accept: application/geo+json"
```

レスポンス例：

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

レスポンスヘッダーには `Content-Type: application/geo+json` が設定されます。

#### エンティティの作成

```http
POST /v2/entities
```

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `options` | string | `upsert`: エンティティが既に存在する場合は更新する。`keyValues`: リクエストボディを keyValues 形式として解釈する |

**リクエストボディ**

```json
{
  "id": "Room1",
  "type": "Room",
  "temperature": {
    "type": "Float",
    "value": 23.5
  },
  "pressure": {
    "type": "Integer",
    "value": 720
  }
}
```

**keyValues 形式入力**（`options=keyValues`）

```json
{
  "id": "Room1",
  "type": "Room",
  "temperature": 23.5,
  "pressure": 720
}
```

**Upsert 動作**（`options=upsert`）

エンティティが存在しない場合は作成（`201 Created`）、既に存在する場合は属性を更新（`204 No Content`）します。

**レスポンス**
- ステータス: `201 Created`（新規作成）、`204 No Content`（upsert による更新）
- ヘッダー: `Location: /v2/entities/Room1?type=Room`

#### 単一エンティティの取得

```http
GET /v2/entities/{entityId}
```

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `type` | string | エンティティタイプ（同一IDが複数タイプにある場合に必要） |
| `attrs` | string | 取得する属性名（カンマ区切り） |
| `options` | string | `keyValues`, `values` |

#### エンティティの更新（PATCH）

```http
PATCH /v2/entities/{entityId}/attrs
```

指定した属性のみを更新します。存在しない属性は追加されます。

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `type` | string | エンティティタイプ |

**リクエストボディ**

```json
{
  "temperature": {
    "type": "Float",
    "value": 25.0
  }
}
```

**レスポンス**: `204 No Content`

#### エンティティの更新（PUT）

```http
PUT /v2/entities/{entityId}/attrs
```

すべての属性を置き換えます（指定されていない属性は削除されます）。

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `type` | string | エンティティタイプ |

**レスポンス**: `204 No Content`

#### 属性の追加（POST）

```http
POST /v2/entities/{entityId}/attrs
```

新しい属性を追加します（既存の属性は上書きされます）。

`options=append` を指定すると、既存の属性を上書きせず、新しい属性のみを追加します（strict append モード）。既に存在する属性名が含まれる場合は `422 Unprocessable Entity` エラーを返します。

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `type` | string | エンティティタイプ |
| `options` | string | `append`: 既存属性の上書きを禁止（strict append モード） |

**レスポンス**: `204 No Content`

#### エンティティの削除

```http
DELETE /v2/entities/{entityId}
```

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `type` | string | エンティティタイプ |

**レスポンス**: `204 No Content`

---

### 属性操作

#### エンティティ属性一覧の取得

エンティティの全属性を取得します（`id` および `type` フィールドは含まれません）。

```http
GET /v2/entities/{entityId}/attrs
```

**クエリパラメータ**

| パラメータ | 型 | 説明 | デフォルト |
|-----------|-----|------|-----------|
| `type` | string | エンティティタイプ | - |
| `attrs` | string | 取得する属性名（カンマ区切り） | - |
| `metadata` | string | メタデータ出力制御（`on`, `off`） | `on` |
| `options` | string | `keyValues`, `values`, `sysAttrs` | - |

**レスポンス例**

```json
{
  "temperature": {
    "type": "Float",
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

**keyValues形式**（`options=keyValues`）

```json
{
  "temperature": 23.5,
  "pressure": 720
}
```

> **注意**: このエンドポイントは `/v2/entities/{entityId}?attrs=...` との違いとして、`id` および `type` フィールドが含まれません。属性のみが必要な場合に使用します。

#### 単一属性の取得

```http
GET /v2/entities/{entityId}/attrs/{attrName}
```

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `type` | string | エンティティタイプ |

**レスポンス例**

```json
{
  "type": "Float",
  "value": 23.5,
  "metadata": {}
}
```

#### 単一属性の更新

```http
PUT /v2/entities/{entityId}/attrs/{attrName}
```

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `type` | string | エンティティタイプ |

**リクエストボディ**

```json
{
  "type": "Float",
  "value": 25.0
}
```

**レスポンス**: `204 No Content`

#### 単一属性の削除

```http
DELETE /v2/entities/{entityId}/attrs/{attrName}
```

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `type` | string | エンティティタイプ |

**レスポンス**: `204 No Content`

#### 属性値の直接取得

```http
GET /v2/entities/{entityId}/attrs/{attrName}/value
```

属性の値のみを取得します（型やメタデータは含まれません）。

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `type` | string | エンティティタイプ |

**レスポンス**

値の型に応じて異なるContent-Typeで返されます：

| 値の型 | Content-Type | 例 |
|--------|--------------|-----|
| 文字列 | `text/plain` | `hello world` |
| 数値 | `text/plain` | `23.5` |
| ブール値 | `text/plain` | `true` |
| null | `text/plain` | `null` |
| オブジェクト | `application/json` | `{"lat": 35.68, "lon": 139.76}` |
| 配列 | `application/json` | `[1, 2, 3]` |

**使用例**

```bash
# 数値の属性値を取得
curl "http://localhost:3000/v2/entities/Room1/attrs/temperature/value" \
  -H "Fiware-Service: smartcity"
# レスポンス: 23.5 (Content-Type: text/plain)

# オブジェクトの属性値を取得
curl "http://localhost:3000/v2/entities/Car1/attrs/location/value" \
  -H "Fiware-Service: smartcity"
# レスポンス: {"type":"Point","coordinates":[139.76,35.68]} (Content-Type: application/json)
```

#### 属性値の直接更新

```http
PUT /v2/entities/{entityId}/attrs/{attrName}/value
```

属性の値のみを更新します。既存の型とメタデータは保持されます。

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `type` | string | エンティティタイプ |

**リクエスト**

Content-Typeに応じて値の解釈が異なります：

| Content-Type | 解釈 |
|--------------|------|
| `application/json` | JSONとしてパース |
| `text/plain` | プリミティブ値（`null`, `true`, `false`, 数値）または文字列 |

**使用例**

```bash
# text/plainで数値を更新
curl -X PUT "http://localhost:3000/v2/entities/Room1/attrs/temperature/value" \
  -H "Fiware-Service: smartcity" \
  -H "Content-Type: text/plain" \
  -d "25.5"

# application/jsonでオブジェクトを更新
curl -X PUT "http://localhost:3000/v2/entities/Car1/attrs/location/value" \
  -H "Fiware-Service: smartcity" \
  -H "Content-Type: application/json" \
  -d '{"type":"Point","coordinates":[140.0,36.0]}'
```

**レスポンス**: `204 No Content`

**注意**: この操作では既存の属性の型（type）とメタデータ（metadata）は変更されず保持されます。

---

### バッチ操作

> **注記**: バッチ操作は1回のリクエストで最大 **1,000 件** までのエンティティを処理できます。1,000 件を超えるリクエストは `400 Bad Request` エラーになります。

#### バッチ更新

```http
POST /v2/op/update
```

**リクエストボディ**

```json
{
  "actionType": "append",
  "entities": [
    {
      "id": "Room1",
      "type": "Room",
      "temperature": { "type": "Float", "value": 21.0 }
    },
    {
      "id": "Room2",
      "type": "Room",
      "temperature": { "type": "Float", "value": 22.5 }
    }
  ]
}
```

**actionType の種類**

| アクション | 説明 |
|-----------|------|
| `append` | 既存エンティティの属性を追加/更新 |
| `appendStrict` | 既存エンティティに新しい属性を追加（既存属性があればエラーを返す） |
| `update` | 既存属性のみ更新（エンティティが存在しない場合はエラー） |
| `replace` | 全属性を置換 |
| `delete` | エンティティまたは属性を削除 |

**レスポンス**
- 全て成功: `204 No Content`
- 部分成功/エラーあり: `200 OK` とエラー詳細

```json
{
  "success": [
    { "entityId": "Room1" }
  ],
  "errors": [
    {
      "entityId": "Room2",
      "error": {
        "code": "NotFound",
        "message": "Entity not found: Room2"
      }
    }
  ]
}
```

#### バッチクエリ

```http
POST /v2/op/query
```

**リクエストボディ**

```json
{
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
}
```

**レスポンス**: エンティティの配列

#### 通知受信

```http
POST /v2/op/notify
```

外部の Context Broker からの通知を受信し、エンティティを append（存在しなければ作成、あれば更新）で処理します。

**リクエストボディ**

```json
{
  "subscriptionId": "sub123",
  "data": [
    {
      "id": "Room1",
      "type": "Room",
      "temperature": { "type": "Float", "value": 25.0 }
    }
  ]
}
```

- `subscriptionId`: 必須 - 通知をトリガーしたサブスクリプションID
- `data`: 必須 - NGSIv2 normalized 形式のエンティティ配列

**レスポンス**: `200 OK`

---

### サブスクリプション

#### サブスクリプションの作成

```http
POST /v2/subscriptions
```

**HTTP通知の例**

```json
{
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
}
```

**httpCustom通知の例（カスタムテンプレート）**

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

**httpCustomフィールド**

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `url` | string | ✓ | 通知先URL |
| `method` | string | - | HTTPメソッド（GET, POST, PUT, PATCH, DELETE）デフォルト: POST |
| `headers` | object | - | カスタムHTTPヘッダー |
| `qs` | object | - | クエリ文字列パラメータ（`${...}` マクロ置換対応） |
| `payload` | string | - | リクエストボディテンプレート（`${...}` マクロ置換対応） |

**マクロ置換**

`payload` と `qs` の値で `${...}` 構文を使用してエンティティデータを埋め込めます:

| マクロ | 置換値 |
|--------|--------|
| `${id}` | エンティティID |
| `${type}` | エンティティタイプ |
| `${attrName}` | 属性値（正規化属性の `.value` を抽出） |

存在しない属性は文字列 `null` に置換されます。マクロはattrs/exceptAttrsフィルタ適用前のフルエンティティに対して評価されます。

**MQTT通知の例**

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

**MQTT通知設定**

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `url` | string | ✓ | MQTTブローカーURL（`mqtt://` または `mqtts://`） |
| `topic` | string | ✓ | 通知先トピック |
| `qos` | integer | - | QoSレベル（0, 1, 2）デフォルト: 0 |
| `retain` | boolean | - | メッセージ保持フラグ。デフォルト: false |
| `user` | string | - | 認証ユーザー名 |
| `passwd` | string | - | 認証パスワード |

**リクエストボディ**

```json
{
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
}
```

**attrsFormat の種類**

| フォーマット | 説明 |
|-------------|------|
| `normalized` | 標準のNGSIv2形式（デフォルト） |
| `keyValues` | 簡略化された key-value 形式 |

**通知属性フィルタリング**

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `attrs` | string[] | 通知に含める属性名のリスト |
| `exceptAttrs` | string[] | 通知から除外する属性名のリスト |
| `onlyChangedAttrs` | boolean | `true` の場合、実際に変更された属性のみを通知に含める。`attrs`/`exceptAttrs` と組み合わせ可能 |

**レスポンス**
- ステータス: `201 Created`
- ヘッダー: `Location: /v2/subscriptions/{subscriptionId}`

#### サブスクリプション一覧

```http
GET /v2/subscriptions
```

**クエリパラメータ**

| パラメータ | 型 | 説明 | デフォルト |
|-----------|-----|------|-----------|
| `limit` | integer | 取得件数 | 20 |
| `offset` | integer | オフセット | 0 |
| `status` | string | ステータスでフィルタ（`active`, `inactive`） | - |

#### サブスクリプションの取得

```http
GET /v2/subscriptions/{subscriptionId}
```

#### サブスクリプションの更新

```http
PATCH /v2/subscriptions/{subscriptionId}
```

**リクエストボディ**

```json
{
  "status": "inactive"
}
```

**レスポンス**: `204 No Content`

#### サブスクリプションの削除

```http
DELETE /v2/subscriptions/{subscriptionId}
```

**レスポンス**: `204 No Content`

#### オーナーシップ検証（GeonicDB 独自拡張）

認証有効時（`AUTH_ENABLED=true`）、サブスクリプションの更新（PATCH）および削除（DELETE）は `createdBy` フィールドに基づくオーナーシップ検証を行います。作成者以外のユーザーがこれらの操作を実行すると `403 Forbidden` が返されます。`super_admin` および `tenant_admin` ロールはこの検証をバイパスできます。詳細は AUTH.md を参照してください。

---

### 登録（Registrations）

登録（Registration）は、外部のコンテキストプロバイダー（Context Provider）を登録し、エンティティ情報の提供元を管理する機能です。

#### 登録の作成

```http
POST /v2/registrations
```

**リクエストボディ**

```json
{
  "description": "Weather data provider",
  "dataProvided": {
    "entities": [
      { "type": "WeatherObserved" }
    ],
    "attrs": ["temperature", "humidity", "pressure"]
  },
  "provider": {
    "http": {
      "url": "http://context-provider:8080/v2"
    }
  },
  "expires": "2040-12-31T23:59:59.000Z",
  "status": "active"
}
```

**リクエストフィールド**

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `description` | string | - | 登録の説明 |
| `dataProvided.entities` | array | ✓ | 対象エンティティ（id, idPattern, type） |
| `dataProvided.attrs` | array | - | 提供する属性名 |
| `provider.http.url` | string | ✓ | プロバイダーのURL |
| `expires` | string | - | 有効期限（ISO 8601形式） |
| `status` | string | - | ステータス（`active` / `inactive`）デフォルト: `active` |
| `mode` | string | - | フォワーディングモード（`inclusive` / `exclusive` / `redirect` / `auxiliary`）。NGSI-LD互換拡張 |

**レスポンス**
- ステータス: `201 Created`
- ヘッダー: `Location: /v2/registrations/{registrationId}`

#### 登録一覧の取得

```http
GET /v2/registrations
```

**クエリパラメータ**

| パラメータ | 型 | 説明 | デフォルト |
|-----------|-----|------|-----------|
| `limit` | integer | 取得件数 | 20 |
| `offset` | integer | オフセット | 0 |

**レスポンス例**

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
      "http": { "url": "http://context-provider:8080/v2" }
    },
    "status": "active"
  }
]
```

#### 登録の取得

```http
GET /v2/registrations/{registrationId}
```

#### 登録の更新

```http
PATCH /v2/registrations/{registrationId}
```

**リクエストボディ**

```json
{
  "description": "Updated description"
}
```

**レスポンス**: `204 No Content`

#### 登録の削除

```http
DELETE /v2/registrations/{registrationId}
```

**レスポンス**: `204 No Content`

#### オーナーシップ検証（GeonicDB 独自拡張）

認証有効時（`AUTH_ENABLED=true`）、登録の更新（PATCH）および削除（DELETE）は `createdBy` フィールドに基づくオーナーシップ検証を行います。作成者以外のユーザーがこれらの操作を実行すると `403 Forbidden` が返されます。`super_admin` および `tenant_admin` ロールはこの検証をバイパスできます。詳細は AUTH.md を参照してください。

---

### フェデレーション（クエリ転送・更新転送）

登録（Registration）に基づいて、外部コンテキストプロバイダーへのクエリ転送と結果統合、および更新転送を行います。

#### フェデレーションの動作

エンティティのクエリ時に、マッチする登録が存在する場合、そのプロバイダーへも並列でクエリを送信し、結果を統合して返します。

```text
クライアント → Context Broker
                    │
                    ├── ローカルDB検索
                    │
                    └── 登録済みプロバイダーへクエリ転送
                              │
                              └── 結果統合 → クライアントへ返却
```

#### 登録モード

| モード | 動作 |
|--------|------|
| `inclusive` | ローカル + リモート両方を返す（デフォルト） |
| `exclusive` | リモートのみを返す（ローカルデータは無視） |
| `redirect` | 303リダイレクトURLを返す |
| `auxiliary` | ローカル優先、不足分をリモートで補完 |

#### フェデレーションの例

1. 外部プロバイダーを登録:

```bash
curl -X POST "http://localhost:3000/v2/registrations" \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -d '{
    "description": "Weather data provider",
    "dataProvided": {
      "entities": [{ "type": "WeatherObserved" }],
      "attrs": ["temperature", "humidity"]
    },
    "provider": {
      "http": { "url": "http://weather-service:8080/v2" }
    }
  }'
```

2. クエリ時に自動的にフェデレーション:

```bash
curl "http://localhost:3000/v2/entities?type=WeatherObserved" \
  -H "Fiware-Service: smartcity"
```

この場合、ローカルDBと `http://weather-service:8080/v2` の両方からデータを取得し、統合して返します。

#### 更新転送

エンティティの更新・削除時にも、マッチする登録が存在する場合、そのプロバイダーへも並列で更新を転送します。

**サポートされる更新操作**

| 操作 | 説明 |
|------|------|
| エンティティ属性の更新 | `PATCH /v2/entities/{id}/attrs` |
| エンティティ属性の追加 | `POST /v2/entities/{id}/attrs` |
| エンティティ属性の置換 | `PUT /v2/entities/{id}/attrs` |
| エンティティの削除 | `DELETE /v2/entities/{id}` |
| 属性の削除 | `DELETE /v2/entities/{id}/attrs/{attr}` |

**モード別の更新動作**

| モード | 動作 |
|--------|------|
| `inclusive` | ローカル + リモート両方を更新 |
| `exclusive` | リモートのみ更新（ローカルは更新しない） |
| `redirect` | 303リダイレクトURLを返す（ローカルは更新しない） |
| `auxiliary` | ローカルのみ更新（リモートは読み取り専用） |

#### エラーハンドリング

| シナリオ | 動作 |
|----------|------|
| プロバイダー接続失敗 | 警告ログを出力し、ローカル結果のみ返却 |
| プロバイダータイムアウト | 警告ログを出力し、ローカル結果のみ返却 |
| exclusive モードで全プロバイダー失敗 | 502 エラーを返却（オプション） |

---

### エンティティタイプ

#### タイプ一覧の取得

```http
GET /v2/types
```

**クエリパラメータ**

| パラメータ | 説明 |
|-----------|------|
| `options=count` | エンティティ数を含める |
| `options=values` | 属性詳細を含める |

**レスポンス例**

```json
[
  {
    "type": "Room",
    "count": 5,
    "attrs": {
      "temperature": { "types": ["Float"] },
      "pressure": { "types": ["Integer"] }
    }
  }
]
```

#### 特定タイプの取得

```http
GET /v2/types/{typeName}
```

**レスポンス例**

```json
{
  "type": "Room",
  "count": 5,
  "attrs": {
    "temperature": { "types": ["Float"] },
    "pressure": { "types": ["Integer"] }
  }
}
```

---

### HTTPエラーレスポンス

| ステータスコード | エラーコード | 説明 |
|-----------------|-------------|------|
| 400 | BadRequest | リクエストパラメータやボディが不正 |
| 400 | InvalidModification | 無効な属性変更（例: id や type の変更） |
| 401 | Unauthorized | 認証が必要、またはトークンが無効 |
| 403 | Forbidden | 権限不足 |
| 404 | NotFound | エンティティ、サブスクリプション等が存在しない |
| 405 | MethodNotAllowed | 許可されていないHTTPメソッド |
| 409 | AlreadyExists | エンティティが既に存在する（POST 作成時） |
| 409 | TooManyResults | 複数のエンティティがマッチ（type 未指定時） |
| 411 | ContentLengthRequired | Content-Length ヘッダーが必要 |
| 413 | RequestEntityTooLarge | リクエストボディが大きすぎる |
| 415 | UnsupportedMediaType | サポートされていない Content-Type |
| 422 | Unprocessable | エンティティ形式が無効 |
| 429 | TooManyRequests | レート制限超過 |
| 500 | InternalError | サーバー内部エラー |

**エラーレスポンス形式**

```json
{
  "error": "BadRequest",
  "description": "Invalid query parameter: limit must be a positive integer"
}
```

---

## エンドポイント一覧

FIWARE NGSIv2 互換の Context Broker API です。

### 共通仕様

- **Content-Type**: `application/json`
- **認証**: `AUTH_ENABLED=true` の場合は必須
- **テナント分離**: `Fiware-Service` ヘッダーでテナント分離
- **ページネーション**: `limit`/`offset` パラメータ、`options=count` で総件数取得

### エンティティ操作

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/v2/entities` | GET | エンティティ一覧取得 | 200 | 400, 401 | ✅ (max: 1000) |
| `/v2/entities` | POST | エンティティ作成 | 201 | 400, 401, 409, 415 | - |
| `/v2/entities/{entityId}` | GET | エンティティ取得 | 200 | 400, 401, 404 | - |
| `/v2/entities/{entityId}` | DELETE | エンティティ削除 | 204 | 401, 404 | - |
| `/v2/entities/{entityId}/attrs` | GET | 属性のみ取得（id/type フィールドなし） | 200 | 400, 401, 404 | - |
| `/v2/entities/{entityId}/attrs` | PATCH | 属性更新 | 204 | 400, 401, 404, 415 | - |
| `/v2/entities/{entityId}/attrs` | POST | 属性追加 | 204 | 400, 401, 404, 415 | - |
| `/v2/entities/{entityId}/attrs` | PUT | 属性置換 | 204 | 400, 401, 404, 415 | - |
| `/v2/entities/{entityId}/attrs/{attrName}` | GET | 属性取得 | 200 | 401, 404 | - |
| `/v2/entities/{entityId}/attrs/{attrName}` | PUT | 属性更新 | 204 | 400, 401, 404, 415 | - |
| `/v2/entities/{entityId}/attrs/{attrName}` | DELETE | 属性削除 | 204 | 401, 404 | - |
| `/v2/entities/{entityId}/attrs/{attrName}/value` | GET | 属性値取得 | 200 | 401, 404 | - |
| `/v2/entities/{entityId}/attrs/{attrName}/value` | PUT | 属性値更新 | 204 | 400, 401, 404, 415 | - |

### タイプ操作

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/v2/types` | GET | タイプ一覧取得 | 200 | 400, 401 | ✅ (max: 1000) |
| `/v2/types/{typeName}` | GET | タイプ詳細取得 | 200 | 401, 404 | - |

### サブスクリプション操作

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/v2/subscriptions` | GET | サブスクリプション一覧 | 200 | 400, 401 | ✅ (max: 1000) |
| `/v2/subscriptions` | POST | サブスクリプション作成 | 201 | 400, 401, 415 | - |
| `/v2/subscriptions/{subscriptionId}` | GET | サブスクリプション取得 | 200 | 401, 404 | - |
| `/v2/subscriptions/{subscriptionId}` | PATCH | サブスクリプション更新 | 204 | 400, 401, 404, 415 | - |
| `/v2/subscriptions/{subscriptionId}` | DELETE | サブスクリプション削除 | 204 | 401, 404 | - |

### レジストレーション操作（フェデレーション）

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/v2/registrations` | GET | レジストレーション一覧 | 200 | 400, 401 | ✅ (max: 1000) |
| `/v2/registrations` | POST | レジストレーション作成 | 201 | 400, 401, 415 | - |
| `/v2/registrations/{registrationId}` | GET | レジストレーション取得 | 200 | 401, 404 | - |
| `/v2/registrations/{registrationId}` | PATCH | レジストレーション更新 | 204 | 400, 401, 404, 415 | - |
| `/v2/registrations/{registrationId}` | DELETE | レジストレーション削除 | 204 | 401, 404 | - |

### バッチ操作

> **注記**: バッチ操作（query を除く）は1回のリクエストで最大 **1,000 件** までです。超過時は `400 Bad Request`。

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/v2/op/update` | POST | バッチ更新（max: 1000） | 204 | 400, 401, 415 | - |
| `/v2/op/query` | POST | バッチクエリ | 200 | 400, 401, 415 | ✅ (max: 1000) |
| `/v2/op/notify` | POST | 通知受信 | 200 | 400, 401, 415 | - |
