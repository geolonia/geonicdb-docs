---
title: "NGSIv2 API"
description: "NGSIv2 API reference"
outline: deep
---
# NGSIv2 API

> このドキュメントは [API.md](./endpoints.md) から分割されました。メインの API 仕様については、[API.md](./endpoints.md) を参照してください。

---

## エンティティ操作### エンティティの一覧取得

```http
GET /v2/entities
```

**クエリパラメータ**

| パラメータ | 型 | 説明 | デフォルト |
|-----------|------|-------------|---------|
| `id` | string | エンティティ ID でフィルタリング (カンマ区切りで複数指定可能) | - |
| `limit` | integer | 取得する結果の数 (最大: 1000) | 20 |
| `offset` | integer | オフセット (ページネーション用) | 0 |
| `orderBy` | string | ソート基準 (`entityId`、`entityType`、`modifiedAt`、または属性名)。降順の場合は FIWARE Orion 互換の `!` プレフィックスを使用 (例: `!temperature`) | - |
| `orderDirection` | string | ソート方向 (`asc`、`desc`)。**GeonicDB 拡張機能** (公式仕様は `!` プレフィックス方式のみをサポート) | `asc` |
| `type` | string | エンティティタイプでフィルタリング | - |
| `typePattern` | string | エンティティタイプの正規表現パターン | - |
| `idPattern` | string | エンティティ ID の正規表現パターン | - |
| `q` | string | 属性値でフィルタリング ([クエリ言語](./endpoints.md#query-language) を参照) | - |
| `mq` | string | メタデータでフィルタリング ([クエリ言語](./endpoints.md#query-language) を参照) | - |
| `attrs` | string | 取得する属性名 (カンマ区切り) | - |
| `metadata` | string | メタデータ出力制御 (`on`、`off`)。**GeonicDB 拡張機能** (公式仕様では `*` ワイルドカードなどを含むカンマ区切りの名前リストを使用) | `on` |
| `georel` | string | ジオクエリ演算子 ([ジオクエリ](./endpoints.md#geo-queries) を参照) | - |
| `geometry` | string | ジオメトリタイプ | - |
| `coords` | string | 座標 (緯度,経度形式、セミコロン区切り) | - |
| `spatialId` | string | 空間 ID でフィルタリング (ZFXY 形式) ([空間 ID 検索](./endpoints.md#spatial-id-search) を参照) | - |
| `spatialIdDepth` | integer | 空間 ID 階層展開の深さ (0-4) | 0 |
| `crs` | string | 座標参照系 ([座標参照系 (CRS)](./endpoints.md#coordinate-reference-system-crs) を参照) | `EPSG:4326` |
| `options` | string | `keyValues`、`values`、`count`、`geojson`、`sysAttrs`、`unique` | - |

**組み込み属性**

`attrs` パラメータは、ユーザー定義属性に加えて以下の組み込み属性をサポートしています:

| 組み込み属性 | 型 | 説明 |
|---|---|---|
| `dateCreated` | DateTime | エンティティ作成タイムスタンプ (`options=sysAttrs` でも利用可能) |
| `dateModified` | DateTime | 最終更新タイムスタンプ (`options=sysAttrs` でも利用可能) |
| `dateExpires` | DateTime | 一時的なエンティティの有効期限タイムスタンプ |
| `servicePath` | Text | エンティティが保存されているServicePath (作成時の `Fiware-ServicePath` ヘッダー値) |

例: `GET /v2/entities?attrs=temperature,servicePath`**レスポンス例**

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

**keyValues 形式** (`options=keyValues`)

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

**count オプション** (`options=count`)

レスポンスに `Fiware-Total-Count` ヘッダーが追加されます。

**geojson オプション** (`options=geojson` または `Accept: application/geo+json` ヘッダー)

レスポンスを GeoJSON FeatureCollection として返します。

```bash
# Specified via options parameter
curl "http://localhost:3000/v2/entities?type=Store&options=geojson" \
  -H "Fiware-Service: myservice"

# Specified via Accept header
curl "http://localhost:3000/v2/entities?type=Store" \
  -H "Fiware-Service: myservice" \
  -H "Accept: application/geo+json"
```

レスポンス例:

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

### エンティティの作成

```http
POST /v2/entities
```

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `options` | string | `upsert`: エンティティが既に存在する場合は更新します。`keyValues`: リクエストボディを keyValues 形式として解釈します |

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

**keyValues 形式の入力** (`options=keyValues`)

```json
{
  "id": "Room1",
  "type": "Room",
  "temperature": 23.5,
  "pressure": 720
}
```

**アップサート動作** (`options=upsert`)

エンティティが存在しない場合は作成され (`201 Created`)、既に存在する場合はその属性が更新されます (`204 No Content`)。

**レスポンス**
- ステータス: `201 Created` (新規作成)、`204 No Content` (アップサートによる更新)
- ステータス: `409 AlreadyExists` 同じ ID を持つエンティティが既に存在する場合 (タイプに関係なく)
- ヘッダー: `Location: /v2/entities/Room1?type=Room`> **GeonicDB 拡張機能 — エンティティ ID の一意性**: エンティティ ID はテナントとServicePathのスコープ内で一意です。同じ ID で異なるタイプのエンティティを作成することはできず、`409 AlreadyExists` が返されます。これは、同じ ID で異なるタイプのエンティティを許可する NGSIv2 仕様とは異なります。詳細については [エンティティ ID の一意性](./endpoints.md#entity-id-uniqueness-geonicdb-extension) を参照してください。### 単一エンティティの取得

```http
GET /v2/entities/{entityId}
```

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `type` | string | エンティティタイプ (オプションのフィルタ; エンティティ ID は一意であるため、タイプの曖昧性解消は不要 — [エンティティ ID の一意性](./endpoints.md#entity-id-uniqueness-geonicdb-extension) を参照) |
| `attrs` | string | 取得する属性名 (カンマ区切り) |
| `options` | string | `keyValues`, `values` |

### エンティティの更新 (PATCH)

```http
PATCH /v2/entities/{entityId}/attrs
```

指定された属性のみを更新します。存在しない属性は追加されます。

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
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

**レスポンス**: `204 No Content`### エンティティの更新 (PUT)

```http
PUT /v2/entities/{entityId}/attrs
```

すべての属性を置き換えます (指定されていない属性は削除されます)。

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `type` | string | エンティティタイプ |

**レスポンス**: `204 No Content`### 属性の追加 (POST)

```http
POST /v2/entities/{entityId}/attrs
```

新しい属性を追加します (既存の属性は上書きされます)。

`options=append` を指定すると、既存の属性は上書きされず、新しい属性のみが追加されます (厳格な追加モード)。既に存在する属性名が含まれている場合、`422 Unprocessable Entity` エラーが返されます。

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `type` | string | エンティティタイプ |
| `options` | string | `append`: 既存の属性の上書きを禁止 (厳格な追加モード) |

**レスポンス**: `204 No Content`### エンティティの削除

```http
DELETE /v2/entities/{entityId}
```

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `type` | string | エンティティタイプ |

**レスポンス**: `204 No Content`---

## 属性操作### エンティティ属性の取得

エンティティのすべての属性を取得します (`id` と `type` フィールドは含まれません)。

```http
GET /v2/entities/{entityId}/attrs
```

**クエリパラメータ**

| パラメータ | 型 | 説明 | デフォルト |
|-----------|------|-------------|---------|
| `type` | string | エンティティタイプ | - |
| `attrs` | string | 取得する属性名 (カンマ区切り) | - |
| `metadata` | string | メタデータ出力制御 (`on`、`off`) | `on` |
| `options` | string | `keyValues`、`values`、`sysAttrs` | - |

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

**keyValues 形式** (`options=keyValues`)

```json
{
  "temperature": 23.5,
  "pressure": 720
}
```

> **注意**: `/v2/entities/{entityId}?attrs=...` とは異なり、このエンドポイントには `id` と `type` フィールドが含まれません。属性のみが必要な場合に使用します。

### 単一属性の取得

```http
GET /v2/entities/{entityId}/attrs/{attrName}
```

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `type` | string | エンティティタイプ |

**レスポンス例**

```json
{
  "type": "Float",
  "value": 23.5,
  "metadata": {}
}
```

### 単一属性の更新

```http
PUT /v2/entities/{entityId}/attrs/{attrName}
```

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `type` | string | エンティティタイプ |

**リクエストボディ**

```json
{
  "type": "Float",
  "value": 25.0
}
```

**レスポンス**: `204 No Content`### 単一属性の削除

```http
DELETE /v2/entities/{entityId}/attrs/{attrName}
```

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `type` | string | エンティティタイプ |

**レスポンス**: `204 No Content`### 属性値の直接取得

```http
GET /v2/entities/{entityId}/attrs/{attrName}/value
```

属性の値のみを取得します (型とメタデータは含まれません)。

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `type` | string | エンティティタイプ |

**レスポンス**

値の型に応じて異なる Content-Type で返されます:

| 値の型 | Content-Type | 例 |
|------------|--------------|---------|
| String | `text/plain` | `hello world` |
| Number | `text/plain` | `23.5` |
| Boolean | `text/plain` | `true` |
| null | `text/plain` | `null` |
| Object | `application/json` | `{"lat": 35.68, "lon": 139.76}` |
| Array | `application/json` | `[1, 2, 3]` |

**使用例**

```bash
# Get a numeric attribute value
curl "http://localhost:3000/v2/entities/Room1/attrs/temperature/value" \
  -H "Fiware-Service: smartcity"
# Response: 23.5 (Content-Type: text/plain)

# Get an object attribute value
curl "http://localhost:3000/v2/entities/Car1/attrs/location/value" \
  -H "Fiware-Service: smartcity"
# Response: {"type":"Point","coordinates":[139.76,35.68]} (Content-Type: application/json)
```
### 属性値を直接更新する

```http
PUT /v2/entities/{entityId}/attrs/{attrName}/value
```

属性の値のみを更新します。既存の type とメタデータは保持されます。

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `type` | string | エンティティタイプ |

**リクエスト**

値の解釈は Content-Type によって異なります:

| Content-Type | 解釈 |
|--------------|----------------|
| `application/json` | JSON として解析されます |
| `text/plain` | プリミティブ値 (`null`、`true`、`false`、number) または文字列 |

**使用例**

```bash
# Update a number with text/plain
curl -X PUT "http://localhost:3000/v2/entities/Room1/attrs/temperature/value" \
  -H "Fiware-Service: smartcity" \
  -H "Content-Type: text/plain" \
  -d "25.5"

# Update an object with application/json
curl -X PUT "http://localhost:3000/v2/entities/Car1/attrs/location/value" \
  -H "Fiware-Service: smartcity" \
  -H "Content-Type: application/json" \
  -d '{"type":"Point","coordinates":[140.0,36.0]}'
```

**レスポンス**: `204 No Content`**注意**: この操作は既存の属性の type やメタデータを変更しません。これらは保持されます。

---## バッチ操作

> **注意**: バッチ操作は 1 リクエストあたり最大 **`MAX_BATCH_SIZE`** エンティティまで処理できます (デフォルト: 100、`MaxBatchSize` SAM パラメータで最大 10,000 まで設定可能)。この制限を超えるリクエストは `400 Bad Request` エラーになります。設定の詳細については [DEVELOPMENT.md](../getting-started/installation.md) を参照してください。

### バッチ更新

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
|--------|-------------|
| `append` | 既存エンティティの属性を追加/更新 |
| `appendStrict` | 既存エンティティに新しい属性を追加 (既存属性が存在する場合はエラーを返す) |
| `update` | 既存属性のみを更新 (エンティティが存在しない場合はエラー) |
| `replace` | すべての属性を置換 |
| `delete` | エンティティまたは属性を削除 |

**レスポンス**
- すべて成功: `204 No Content`- 部分的な成功/エラー: `200 OK` とエラー詳細

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

### バッチクエリ

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

### 通知の受信

```http
POST /v2/op/notify
```

外部 Context Broker からの通知を受信し、append でエンティティを処理します (存在しない場合は作成、既に存在する場合は更新)。

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

- `subscriptionId`: 必須 - 通知をトリガーしたサブスクリプション ID
- `data`: 必須 - NGSIv2 正規化形式のエンティティの配列

**レスポンス**: `200 OK`---

## サブスクリプション### サブスクリプションの作成

```http
POST /v2/subscriptions
```

**HTTP 通知の例**

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

**httpCustom 通知の例 (カスタムテンプレート)**

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

**httpCustom フィールド**

| フィールド | 型 | 必須 | 説明 |
|-------|------|----------|-------------|
| `url` | string | ✓ | 通知先 URL |
| `method` | string | - | HTTP メソッド (GET, POST, PUT, PATCH, DELETE)。デフォルト: POST |
| `headers` | object | - | カスタム HTTP ヘッダー |
| `qs` | object | - | クエリ文字列パラメータ (`${...}` マクロ置換をサポート) |
| `payload` | string | - | リクエストボディテンプレート (`${...}` マクロ置換をサポート) |

**マクロ置換**

`${...}` 構文を使用して、`payload` と `qs` の値にエンティティデータを埋め込むことができます:

| マクロ | 置換値 |
|-------|-------------------|
| `${id}` | エンティティ ID |
| `${type}` | エンティティタイプ |
| `${attrName}` | 属性値 (正規化された属性から `.value` を抽出) |

存在しない属性は文字列 `null` に置き換えられます。マクロは attrs/exceptAttrs フィルタが適用される前の完全なエンティティに対して評価されます。

**MQTT 通知の例**

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

**MQTT 通知設定**

| フィールド | 型 | 必須 | 説明 |
|-------|------|----------|-------------|
| `url` | string | ✓ | MQTT ブローカー URL (`mqtt://` または `mqtts://`) |
| `topic` | string | ✓ | 通知先トピック |
| `qos` | integer | - | QoS レベル (0, 1, 2)。デフォルト: 0 |
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

**attrsFormat タイプ**

| フォーマット | 説明 |
|--------|-------------|
| `normalized` | 標準 NGSIv2 フォーマット (デフォルト) |
| `keyValues` | 簡易的なキー・バリューフォーマット |

**通知属性フィルタリング**

| フィールド | 型 | 説明 |
|-------|------|-------------|
| `attrs` | string[] | 通知に含める属性名のリスト |
| `exceptAttrs` | string[] | 通知から除外する属性名のリスト |
| `onlyChangedAttrs` | boolean | `true` の場合、実際に変更された属性のみが通知に含まれます。`attrs`/`exceptAttrs` と組み合わせることができます。 |

**レスポンス**
- ステータス: `201 Created`- ヘッダー: `Location: /v2/subscriptions/{subscriptionId}`### サブスクリプションの一覧取得

```http
GET /v2/subscriptions
```

**クエリパラメータ**

| パラメータ | 型 | 説明 | デフォルト |
|-----------|------|-------------|---------|
| `limit` | integer | 取得する結果の数 | 20 |
| `offset` | integer | オフセット | 0 |
| `status` | string | ステータスでフィルタ (`active`, `inactive`) | - |

### サブスクリプションの取得

```http
GET /v2/subscriptions/{subscriptionId}
```

### サブスクリプションの更新

```http
PATCH /v2/subscriptions/{subscriptionId}
```

**リクエストボディ**

```json
{
  "status": "inactive"
}
```

**レスポンス**: `204 No Content`### サブスクリプションの削除

```http
DELETE /v2/subscriptions/{subscriptionId}
```

**レスポンス**: `204 No Content`### 所有権の検証 (GeonicDB 拡張機能)

認証が有効な場合 (`AUTH_ENABLED=true`)、サブスクリプションの更新 (PATCH) と削除 (DELETE) 操作は `createdBy` フィールドに基づいて所有権の検証を実行します。作成者以外のユーザーがこれらの操作を試みた場合、`403 Forbidden` が返されます。`super_admin` と `tenant_admin` ロールはこの検証をバイパスできます。詳細については AUTH.md を参照してください。

---## 登録

登録は、外部コンテキストプロバイダを登録し、エンティティ情報のソースを管理します。

### 登録の作成

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
|-------|------|----------|-------------|
| `description` | string | - | 登録の説明 |
| `dataProvided.entities` | array | ✓ | 対象エンティティ (id、idPattern、type) |
| `dataProvided.attrs` | array | - | 提供する属性名 |
| `provider.http.url` | string | ✓ | プロバイダ URL |
| `expires` | string | - | 有効期限 (ISO 8601 形式) |
| `status` | string | - | ステータス (`active` / `inactive`)。デフォルト: `active` |
| `mode` | string | - | 転送モード (`inclusive` / `exclusive` / `redirect` / `auxiliary`)。NGSI-LD 互換拡張 |

**レスポンス**
- ステータス: `201 Created`- ヘッダー: `Location: /v2/registrations/{registrationId}`### 登録の一覧取得

```http
GET /v2/registrations
```

**クエリパラメータ**

| パラメータ | 型 | 説明 | デフォルト |
|-----------|------|-------------|---------|
| `limit` | integer | 取得する結果の数 | 20 |
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

### 登録の取得

```http
GET /v2/registrations/{registrationId}
```

### 登録の更新

```http
PATCH /v2/registrations/{registrationId}
```

**リクエストボディ**

```json
{
  "description": "Updated description"
}
```

**レスポンス**: `204 No Content`### 登録の削除

```http
DELETE /v2/registrations/{registrationId}
```

**レスポンス**: `204 No Content`### 所有権検証 (GeonicDB 拡張)

認証が有効な場合 (`AUTH_ENABLED=true`)、登録の更新 (PATCH) および削除 (DELETE) 操作は `createdBy` フィールドに基づいて所有権検証を実行します。作成者以外のユーザーがこれらの操作を試みると、`403 Forbidden` が返されます。`super_admin` および `tenant_admin` ロールはこの検証をバイパスできます。詳細は AUTH.md を参照してください。

---## フェデレーション (クエリ転送 / 更新転送)

登録に基づいて、GeonicDB はクエリを外部コンテキストプロバイダに転送し、結果を統合し、更新を転送します。

### フェデレーションの仕組み

エンティティをクエリする際、一致する登録が存在する場合、クエリは並行してそのプロバイダにも送信され、結果がマージされて返されます。

```text
Client → Context Broker
              │
              ├── Local DB search
              │
              └── Query forwarded to registered provider
                        │
                        └── Results merged → returned to client
```

### 登録モード

| モード | 動作 |
|------|----------|
| `inclusive` | ローカルとリモートの両方の結果を返す (デフォルト) |
| `exclusive` | リモートの結果のみを返す (ローカルデータは無視される) |
| `redirect` | 303 リダイレクト URL を返す |
| `auxiliary` | ローカルデータを優先し、不足データをリモートで補う |

### フェデレーションの例

1. 外部プロバイダを登録する:

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

2. クエリ時にフェデレーションが自動的に行われる:

```bash
curl "http://localhost:3000/v2/entities?type=WeatherObserved" \
  -H "Fiware-Service: smartcity"
```

この場合、ローカル DB と `http://weather-service:8080/v2` の両方からデータが取得され、マージされて返されます。

### 更新転送

エンティティを更新または削除する際、一致する登録が存在する場合、更新も並行してそのプロバイダに転送されます。

**サポートされる更新操作**

| 操作 | 説明 |
|-----------|-------------|
| エンティティ属性の更新 | `PATCH /v2/entities/{id}/attrs` |
| エンティティ属性の追加 | `POST /v2/entities/{id}/attrs` |
| エンティティ属性の置換 | `PUT /v2/entities/{id}/attrs` |
| エンティティの削除 | `DELETE /v2/entities/{id}` |
| 属性の削除 | `DELETE /v2/entities/{id}/attrs/{attr}` |

**モード別の更新動作**

| モード | 動作 |
|------|----------|
| `inclusive` | ローカルとリモートの両方を更新 |
| `exclusive` | リモートのみを更新 (ローカルは更新されない) |
| `redirect` | 303 リダイレクト URL を返す (ローカルは更新されない) |
| `auxiliary` | ローカルのみを更新 (リモートは読み取り専用) |

### エラーハンドリング

| シナリオ | 動作 |
|----------|----------|
| プロバイダ接続失敗 | 警告をログに記録し、ローカルの結果のみを返す |
| プロバイダタイムアウト | 警告をログに記録し、ローカルの結果のみを返す |
| 排他モードですべてのプロバイダが失敗 | 502 エラーを返す (オプション) |

---

## エンティティタイプ

### タイプ一覧

```http
GET /v2/types
```

**クエリパラメータ**

| パラメータ | 説明 |
|-----------|-------------|
| `options=count` | エンティティ数を含める |
| `options=values` | 属性の詳細を含める |

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

### 特定のタイプを取得

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

---## HTTP キャッシュ制御

GET エンドポイントは、エンドポイントのクラスごとにキャッシュ関連のヘッダーを返します:

### データエンドポイント (entities、subscriptions、registrations) — 完全な RFC 7232 + RFC 7234 サポート

| ヘッダー | 値 | 目的 |
|--------|-------|---------|
| `ETag` | `W/"..."` | 弱いバリデーター。生成シードには `path + Accept + Fiware-Service + Fiware-ServicePath` が含まれるため、異なるエンドポイント / Accept / テナント / ServicePathは常に異なる ETag を生成します。リスト: `id + modifiedAt` のストリーミングダイジェストと総数およびスコープを混合。単一: `modifiedAt` のハッシュとスコープを混合。 |
| `Last-Modified` | RFC 1123 HTTP-date | 結果セット内の最新の `modifiedAt` のタイムスタンプ。 |
| `Cache-Control` | `private, no-cache` | `private` は共有 / 中間キャッシュストレージをブロックします; `no-cache` はプライベートキャッシュからの再検証を強制します。 |
| `Vary` | `Fiware-Service, Fiware-ServicePath, Authorization, X-Api-Key, Accept` | 共有キャッシュ用のテナント + 認証 + コンテンツネゴシエーション分離。 |

条件付きリクエストがサポートされています:

| リクエストヘッダー | 動作 |
|----------------|----------|
| `If-None-Match: <ETag>` | 一致した場合、`304 Not Modified` (空のボディ) を返します。 |
| `If-Modified-Since: <HTTP-date>` | リソースが変更されていない場合、`304` を返します。 |
| `Cache-Control: no-store` | サーバーはレスポンスの `Cache-Control` を `no-store` にオーバーライドします。 |

### メタエンドポイント (types) — Cache-Control + Vary のみ (ETag なし / 304 なし)

| ヘッダー | 値 | 目的 |
|--------|-------|---------|
| `Cache-Control` | `max-age=60, stale-while-revalidate=120` | バックグラウンド再検証を伴う短期キャッシング。 |
| `Vary` | `Fiware-Service, Fiware-ServicePath, Authorization, X-Api-Key, Accept` | データエンドポイントと同じテナント/認証分離。 |

メタエンドポイントは `ETag` / `Last-Modified` を返さず、`If-None-Match` / `If-Modified-Since` 条件付きリクエストをサポートしません。クライアントは代わりに `max-age` / `stale-while-revalidate` ディレクティブに依存する必要があります。

完全なセマンティクスについては、[API.md §HTTP Cache Control](./endpoints.md#http-cache-control-etag--conditional-requests) を参照してください。

---

## HTTP エラーレスポンス

| ステータスコード | エラーコード | 説明 |
|-------------|------------|-------------|
| 400 | BadRequest | 無効なリクエストパラメーターまたはボディ |
| 400 | InvalidModification | 無効な属性変更 (例: id または type の変更) |
| 401 | Unauthorized | 認証が必要またはトークンが無効 |
| 403 | Forbidden | 権限不足 |
| 404 | NotFound | Entity、subscription などが見つかりません |
| 405 | MethodNotAllowed | HTTP メソッドが許可されていません |
| 409 | AlreadyExists | Entity が既に存在します (POST 作成時) |
| 409 | TooManyResults | 複数の entity が一致しました (type が指定されていない場合) |
| 411 | ContentLengthRequired | Content-Length ヘッダーが必要です |
| 413 | RequestEntityTooLarge | リクエストボディが大きすぎます |
| 415 | UnsupportedMediaType | サポートされていない Content-Type |
| 422 | Unprocessable | Entity フォーマットが無効 |
| 429 | TooManyRequests | レート制限を超過 |
| 500 | InternalError | 内部サーバーエラー |

**エラーレスポンス形式**

```json
{
  "error": "BadRequest",
  "description": "Invalid query parameter: limit must be a positive integer"
}
```

---## エンドポイントリファレンス

FIWARE NGSIv2 互換 Context Broker API。

### 共通仕様

- **Content-Type**: `application/json`- **認証**: `AUTH_ENABLED=true` の場合に必要
- **テナント分離**: `Fiware-Service` ヘッダーによるテナント分離
- **ページネーション**: `limit`/`offset` パラメータ; 総数を取得するには `options=count` を使用

### エンティティ操作

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|----------|--------|-------------|---------|-------|------------|
| `/v2/entities` | GET | エンティティ一覧 | 200 | 400, 401 | ✅ (最大: 1000) |
| `/v2/entities` | POST | エンティティ作成 | 201 | 400, 401, 409, 415 | - |
| `/v2/entities/{entityId}` | GET | エンティティ取得 | 200 | 400, 401, 404 | - |
| `/v2/entities/{entityId}` | DELETE | エンティティ削除 | 204 | 401, 404 | - |
| `/v2/entities/{entityId}/attrs` | GET | 属性のみ取得 (id/type フィールドなし) | 200 | 400, 401, 404 | - |
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
|----------|--------|-------------|---------|-------|------------|
| `/v2/types` | GET | タイプ一覧 | 200 | 400, 401 | ✅ (最大: 1000) |
| `/v2/types/{typeName}` | GET | タイプ詳細取得 | 200 | 401, 404 | - |

### サブスクリプション操作

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|----------|--------|-------------|---------|-------|------------|
| `/v2/subscriptions` | GET | サブスクリプション一覧 | 200 | 400, 401 | ✅ (最大: 1000) |
| `/v2/subscriptions` | POST | サブスクリプション作成 | 201 | 400, 401, 415 | - |
| `/v2/subscriptions/{subscriptionId}` | GET | サブスクリプション取得 | 200 | 401, 404 | - |
| `/v2/subscriptions/{subscriptionId}` | PATCH | サブスクリプション更新 | 204 | 400, 401, 404, 415 | - |
| `/v2/subscriptions/{subscriptionId}` | DELETE | サブスクリプション削除 | 204 | 401, 404 | - |

### 登録操作 (フェデレーション)

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|----------|--------|-------------|---------|-------|------------|
| `/v2/registrations` | GET | 登録一覧 | 200 | 400, 401 | ✅ (最大: 1000) |
| `/v2/registrations` | POST | 登録作成 | 201 | 400, 401, 415 | - |
| `/v2/registrations/{registrationId}` | GET | 登録取得 | 200 | 401, 404 | - |
| `/v2/registrations/{registrationId}` | PATCH | 登録更新 | 204 | 400, 401, 404, 415 | - |
| `/v2/registrations/{registrationId}` | DELETE | 登録削除 | 204 | 401, 404 | - |

### バッチ操作

> **注意**: バッチ操作 (クエリを除く) は、リクエストあたり **`MAX_BATCH_SIZE`** エンティティに制限されています (デフォルト: 100、最大 10,000 まで設定可能)。この制限を超えると `400 Bad Request` が返されます。

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|----------|--------|-------------|---------|-------|------------|
| `/v2/op/update` | POST | バッチ更新 (最大: `MAX_BATCH_SIZE`) | 204 | 400, 401, 415 | - |
| `/v2/op/query` | POST | バッチクエリ | 200 | 400, 401, 415 | ✅ (最大: 1000) |
| `/v2/op/notify` | POST | 通知受信 | 200 | 400, 401, 415 | - |