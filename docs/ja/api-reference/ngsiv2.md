---
title: "NGSIv2 API"
description: "NGSIv2 API reference"
outline: deep
---
# NGSIv2 API

> このドキュメントは [API.md](./endpoints.md) から分割されました。メインの API 仕様については、[API.md](./endpoints.md) を参照してください。

***

## エンティティ操作

### エンティティの一覧取得

```http
GET /v2/entities
```

**クエリパラメータ**

| Parameter        | Type    | Description                                                                                                                                              | Default     |
| ---------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `id`             | string  | Filter by entity ID (multiple values can be specified as a comma-separated list)                                                                         | -           |
| `limit`          | integer | Number of results to retrieve (max: 1000)                                                                                                                | 20          |
| `offset`         | integer | Offset (for pagination)                                                                                                                                  | 0           |
| `orderBy`        | string  | Sort criteria (`entityId`, `entityType`, `modifiedAt`, or attribute name). FIWARE Orion-compatible `!` prefix for descending order (e.g. `!temperature`) | -           |
| `orderDirection` | string  | Sort direction (`asc`, `desc`). **GeonicDB extension** (the official specification only supports the `!` prefix approach)                                | `asc`       |
| `type`           | string  | Filter by entity type                                                                                                                                    | -           |
| `typePattern`    | string  | Regular expression pattern for entity type                                                                                                               | -           |
| `idPattern`      | string  | Regular expression pattern for entity ID                                                                                                                 | -           |
| `q`              | string  | Filter by attribute value (see [Query Language](./endpoints.md#query-language))                                                                          | -           |
| `mq`             | string  | Filter by metadata (see [Query Language](./endpoints.md#query-language))                                                                                 | -           |
| `attrs`          | string  | Attribute names to retrieve (comma-separated)                                                                                                            | -           |
| `metadata`       | string  | Metadata output control (`on`, `off`). **GeonicDB extension** (the official specification uses a comma-separated name list with `*` wildcards, etc.)     | `on`        |
| `georel`         | string  | Geo-query operator (see [Geo-queries](./endpoints.md#geo-queries))                                                                                       | -           |
| `geometry`       | string  | Geometry type                                                                                                                                            | -           |
| `coords`         | string  | Coordinates (latitude,longitude format, semicolon-separated)                                                                                             | -           |
| `spatialId`      | string  | Filter by spatial ID (ZFXY format) (see [Spatial ID Search](./endpoints.md#spatial-id-search))                                                           | -           |
| `spatialIdDepth` | integer | Depth of spatial ID hierarchy expansion (0-4)                                                                                                            | 0           |
| `crs`            | string  | Coordinate reference system (see [Coordinate Reference System (CRS)](./endpoints.md#coordinate-reference-system-crs))                                    | `EPSG:4326` |
| `options`        | string  | `keyValues`, `values`, `count`, `geojson`, `sysAttrs`, `unique`                                                                                          | -           |

**組み込み属性**

`attrs` パラメータは、ユーザー定義属性に加えて、以下の組み込み属性をサポートしています:

| Builtin Attribute | Type     | Description                                                                             |
| ----------------- | -------- | --------------------------------------------------------------------------------------- |
| `dateCreated`     | DateTime | Entity creation timestamp (also available via `options=sysAttrs`)                       |
| `dateModified`    | DateTime | Last modification timestamp (also available via `options=sysAttrs`)                     |
| `dateExpires`     | DateTime | Transient entity expiration timestamp                                                   |
| `servicePath`     | Text     | Service path where the entity is stored (`Fiware-ServicePath` header value at creation) |

例: `GET /v2/entities?attrs=temperature,servicePath`

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

`Fiware-Total-Count` ヘッダーがレスポンスに追加されます。

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

| Parameter | Type   | Description                                                                                                   |
| --------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| `options` | string | `upsert`: Update the entity if it already exists. `keyValues`: Interpret the request body in keyValues format |

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

**Upsert 動作** (`options=upsert`)

エンティティが存在しない場合は作成され (`201 Created`)、既に存在する場合はその属性が更新されます (`204 No Content`)。

**レスポンス**

* ステータス: `201 Created` (新規作成)、`204 No Content` (upsert による更新)
  
* ステータス: `409 AlreadyExists` 同じ ID を持つエンティティが既に存在する場合 (タイプに関係なく)
  
* ヘッダー: `Location: /v2/entities/Room1?type=Room`

> **GeonicDB 拡張 — エンティティ ID の一意性**: エンティティ ID は、テナントとServicePathのスコープ内で一意です。同じ ID で異なるタイプのエンティティを作成することは許可されず、`409 AlreadyExists` が返されます。これは、同じ ID で異なるタイプのエンティティを許可する NGSIv2 仕様とは異なります。詳細については、[エンティティ ID の一意性](./endpoints.md#entity-id-uniqueness-geonicdb-extension) を参照してください。

### 単一エンティティの取得

```http
GET /v2/entities/{entityId}
```

**クエリパラメータ**

| Parameter | Type   | Description                                                                                                                                                                          |
| --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `type`    | string | Entity type (optional filter; type disambiguation is no longer needed as entity IDs are unique — see [Entity ID Uniqueness](./endpoints.md#entity-id-uniqueness-geonicdb-extension)) |
| `attrs`   | string | Attribute names to retrieve (comma-separated)                                                                                                                                        |
| `options` | string | `keyValues`, `values`                                                                                                                                                                |

### エンティティの更新 (PATCH)

```http
PATCH /v2/entities/{entityId}/attrs
```

指定された属性のみを更新します。存在しない属性は追加されます。

**クエリパラメータ**

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| `type`    | string | Entity type |

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

### エンティティの更新 (PUT)

```http
PUT /v2/entities/{entityId}/attrs
```

すべての属性を置き換えます (指定されていない属性は削除されます)。

**クエリパラメータ**

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| `type`    | string | Entity type |

**レスポンス**: `204 No Content`

### 属性の追加 (POST)

```http
POST /v2/entities/{entityId}/attrs
```

新しい属性を追加します (既存の属性は上書きされます)。

`options=append` が指定されている場合、既存の属性は上書きされず、新しい属性のみが追加されます (厳密な追加モード)。既に存在する属性名が含まれている場合、`422 Unprocessable Entity` エラーが返されます。

**クエリパラメータ**

| Parameter | Type   | Description                                                             |
| --------- | ------ | ----------------------------------------------------------------------- |
| `type`    | string | Entity type                                                             |
| `options` | string | `append`: Prohibit overwriting existing attributes (strict append mode) |

**レスポンス**: `204 No Content`

### エンティティの削除

```http
DELETE /v2/entities/{entityId}
```

**クエリパラメータ**

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| `type`    | string | Entity type |

**レスポンス**: `204 No Content`

***

## 属性の操作

### エンティティ属性の取得

エンティティのすべての属性を取得します (`id` および `type` フィールドは含まれません)。

```http
GET /v2/entities/{entityId}/attrs
```

**クエリパラメータ**

| Parameter  | Type   | Description                                   | Default |
| ---------- | ------ | --------------------------------------------- | ------- |
| `type`     | string | Entity type                                   | -       |
| `attrs`    | string | Attribute names to retrieve (comma-separated) | -       |
| `metadata` | string | Metadata output control (`on`, `off`)         | `on`    |
| `options`  | string | `keyValues`, `values`, `sysAttrs`             | -       |

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

> **注意**: `/v2/entities/{entityId}?attrs=...` とは異なり、このエンドポイントには `id` および `type` フィールドが含まれません。属性のみが必要な場合に使用してください。

### 単一属性の取得

```http
GET /v2/entities/{entityId}/attrs/{attrName}
```

**クエリパラメータ**

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| `type`    | string | Entity type |

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

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| `type`    | string | Entity type |

**リクエストボディ**

```json
{
  "type": "Float",
  "value": 25.0
}
```

**レスポンス**: `204 No Content`

### 単一属性の削除

```http
DELETE /v2/entities/{entityId}/attrs/{attrName}
```

**クエリパラメータ**

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| `type`    | string | Entity type |

**レスポンス**: `204 No Content`

### 属性値の直接取得

```http
GET /v2/entities/{entityId}/attrs/{attrName}/value
```

属性の値のみを取得します (type とメタデータは含まれません)。

**クエリパラメータ**

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| `type`    | string | Entity type |

**レスポンス**

値の型に応じて異なる Content-Type で返されます:

| Value type | Content-Type       | Example                         |
| ---------- | ------------------ | ------------------------------- |
| String     | `text/plain`       | `hello world`                   |
| Number     | `text/plain`       | `23.5`                          |
| Boolean    | `text/plain`       | `true`                          |
| null       | `text/plain`       | `null`                          |
| Object     | `application/json` | `{"lat": 35.68, "lon": 139.76}` |
| Array      | `application/json` | `[1, 2, 3]`                     |

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

### 属性値を直接更新

```http
PUT /v2/entities/{entityId}/attrs/{attrName}/value
```

属性の値のみを更新します。既存の型とメタデータは保持されます。

**クエリパラメータ**

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| `type`    | string | Entity type |

**リクエスト**

値の解釈は Content-Type によって異なります:

| Content-Type       | Interpretation                                              |
| ------------------ | ----------------------------------------------------------- |
| `application/json` | Parsed as JSON                                              |
| `text/plain`       | Primitive value (`null`, `true`, `false`, number) or string |

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

**レスポンス**: `204 No Content`

**注意**: この操作は既存の属性の型やメタデータを変更しません — それらは保持されます。

***

## バッチ操作

> **注意**: バッチ操作は、リクエストごとに最大 **`MAX_BATCH_SIZE`** 個のエンティティを処理できます(デフォルト: 100、`MaxBatchSize` SAM パラメータにより最大 10,000 まで設定可能)。この制限を超えるリクエストは `400 Bad Request` エラーになります。

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

| Action         | Description                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------- |
| `append`       | Add/update attributes of existing entities                                                    |
| `appendStrict` | Add new attributes to existing entities (returns an error if existing attributes are present) |
| `update`       | Update only existing attributes (error if entity does not exist)                              |
| `replace`      | Replace all attributes                                                                        |
| `delete`       | Delete entities or attributes                                                                 |

**レスポンス**

* すべて成功: `204 No Content`
  
* 部分的成功/エラー: `200 OK` とエラー詳細

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

### 通知を受信

```http
POST /v2/op/notify
```

外部 Context Broker からの通知を受信し、append でエンティティを処理します(存在しない場合は作成、既に存在する場合は更新)。

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


* `subscriptionId`: 必須 - 通知をトリガーしたサブスクリプション ID
  
* `data`: 必須 - NGSIv2 正規化形式のエンティティの配列

**レスポンス**: `200 OK`

***

## サブスクリプション

### サブスクリプションを作成

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

| Field     | Type   | Required | Description                                                    |
| --------- | ------ | -------- | -------------------------------------------------------------- |
| `url`     | string | ✓        | Notification destination URL                                   |
| `method`  | string | -        | HTTP method (GET, POST, PUT, PATCH, DELETE). Default: POST     |
| `headers` | object | -        | Custom HTTP headers                                            |
| `qs`      | object | -        | Query string parameters (supports `${...}` macro substitution) |
| `payload` | string | -        | Request body template (supports `${...}` macro substitution)   |

**マクロ置換**

`payload` および `qs` の値内で `${...}` 構文を使用してエンティティデータを埋め込むことができます:

| Macro         | Replacement value                                             |
| ------------- | ------------------------------------------------------------- |
| `${id}`       | Entity ID                                                     |
| `${type}`     | Entity type                                                   |
| `${attrName}` | Attribute value (extracts `.value` from normalized attribute) |

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

| Field    | Type    | Required | Description                               |
| -------- | ------- | -------- | ----------------------------------------- |
| `url`    | string  | ✓        | MQTT broker URL (`mqtt://` or `mqtts://`) |
| `topic`  | string  | ✓        | Notification destination topic            |
| `qos`    | integer | -        | QoS level (0, 1, 2). Default: 0           |
| `retain` | boolean | -        | Message retain flag. Default: false       |
| `user`   | string  | -        | Authentication username                   |
| `passwd` | string  | -        | Authentication password                   |

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

| Format       | Description                      |
| ------------ | -------------------------------- |
| `normalized` | Standard NGSIv2 format (default) |
| `keyValues`  | Simplified key-value format      |

**通知属性フィルタリング**

| Field              | Type      | Description                                                                                                                    |
| ------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `attrs`            | string\[] | List of attribute names to include in notifications                                                                            |
| `exceptAttrs`      | string\[] | List of attribute names to exclude from notifications                                                                          |
| `onlyChangedAttrs` | boolean   | If `true`, only attributes that actually changed are included in notifications. It can be combined with `attrs`/`exceptAttrs`. |

**レスポンス**

* ステータス:`201 Created`
  
* ヘッダー:`Location: /v2/subscriptions/{subscriptionId}`

### サブスクリプション一覧

```http
GET /v2/subscriptions
```

**クエリパラメータ**

| Parameter | Type    | Description                             | Default |
| --------- | ------- | --------------------------------------- | ------- |
| `limit`   | integer | Number of results to retrieve           | 20      |
| `offset`  | integer | Offset                                  | 0       |
| `status`  | string  | Filter by status (`active`, `inactive`) | -       |

### サブスクリプション取得

```http
GET /v2/subscriptions/{subscriptionId}
```

### サブスクリプション更新

```http
PATCH /v2/subscriptions/{subscriptionId}
```

**リクエストボディ**

```json
{
  "status": "inactive"
}
```

**レスポンス**:`204 No Content`

### サブスクリプションの削除

```http
DELETE /v2/subscriptions/{subscriptionId}
```

**レスポンス**: `204 No Content`

### 所有権検証 (GeonicDB 拡張)

認証が有効な場合 (`AUTH_ENABLED=true`)、サブスクリプションの更新 (PATCH) および削除 (DELETE) 操作は `createdBy` フィールドに基づいて所有権検証を実行します。作成者以外のユーザーがこれらの操作を試みた場合、`403 Forbidden` が返されます。`super_admin` および `tenant_admin` ロールはこの検証をバイパスできます。詳細は [AUTH.md](../reference/auth.md) を参照してください。

***

## レジストレーション

レジストレーションは外部コンテキストプロバイダーを登録し、エンティティ情報のソースを管理します。

### レジストレーションの作成

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

| Field                   | Type   | Required | Description                                                                                          |
| ----------------------- | ------ | -------- | ---------------------------------------------------------------------------------------------------- |
| `description`           | string | -        | Description of the registration                                                                      |
| `dataProvided.entities` | array  | ✓        | Target entities (id, idPattern, type)                                                                |
| `dataProvided.attrs`    | array  | -        | Attribute names to provide                                                                           |
| `provider.http.url`     | string | ✓        | Provider URL                                                                                         |
| `expires`               | string | -        | Expiration date (ISO 8601 format)                                                                    |
| `status`                | string | -        | Status (`active` / `inactive`). Default: `active`                                                    |
| `mode`                  | string | -        | Forwarding mode (`inclusive` / `exclusive` / `redirect` / `auxiliary`). NGSI-LD compatible extension |

**レスポンス**

* ステータス: `201 Created`
  
* ヘッダー: `Location: /v2/registrations/{registrationId}`

### レジストレーション一覧

```http
GET /v2/registrations
```

**クエリパラメータ**

| Parameter | Type    | Description                   | Default |
| --------- | ------- | ----------------------------- | ------- |
| `limit`   | integer | Number of results to retrieve | 20      |
| `offset`  | integer | Offset                        | 0       |

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

### 登録を取得

```http
GET /v2/registrations/{registrationId}
```

### 登録を更新

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

### 登録を削除

```http
DELETE /v2/registrations/{registrationId}
```

**レスポンス**: `204 No Content`

### 所有権検証 (GeonicDB 拡張)

認証が有効な場合 (`AUTH_ENABLED=true`)、登録の更新 (PATCH) および削除 (DELETE) 操作は `createdBy` フィールドに基づいて所有権検証を実行します。作成者以外のユーザーがこれらの操作を試みた場合、`403 Forbidden` が返されます。`super_admin` および `tenant_admin` ロールはこの検証をバイパスできます。詳細については [AUTH.md](../reference/auth.md) を参照してください。

***

## フェデレーション(クエリ転送 / 更新転送)

Registration に基づいて、GeonicDB はクエリを外部コンテキストプロバイダーに転送し、結果を統合し、更新を転送します。

### フェデレーションの仕組み

エンティティをクエリする際、一致する registration が存在する場合、クエリは並列的にそのプロバイダーにも送信され、結果がマージされて返されます。

```text
Client → Context Broker
              │
              ├── Local DB search
              │
              └── Query forwarded to registered provider
                        │
                        └── Results merged → returned to client
```

### Registration モード

| Mode        | Behavior                                                |
| ----------- | ------------------------------------------------------- |
| `inclusive` | Returns both local and remote results (default)         |
| `exclusive` | Returns only remote results (local data is ignored)     |
| `redirect`  | Returns a 303 redirect URL                              |
| `auxiliary` | Local data takes priority; remote fills in missing data |

### フェデレーションの例


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

2\. クエリ時に自動的にフェデレーションが発生:

```bash
curl "http://localhost:3000/v2/entities?type=WeatherObserved" \
  -H "Fiware-Service: smartcity"
```

この場合、ローカル DB と `http://weather-service:8080/v2` の両方からデータが取得され、マージされて返されます。

### 更新転送

エンティティを更新または削除する際、一致する registration が存在する場合、更新も並列的にそのプロバイダーに転送されます。

**サポートされる更新操作**

| Operation                 | Description                             |
| ------------------------- | --------------------------------------- |
| Update entity attributes  | `PATCH /v2/entities/{id}/attrs`         |
| Add entity attributes     | `POST /v2/entities/{id}/attrs`          |
| Replace entity attributes | `PUT /v2/entities/{id}/attrs`           |
| Delete entity             | `DELETE /v2/entities/{id}`              |
| Delete attribute          | `DELETE /v2/entities/{id}/attrs/{attr}` |

**モード別の更新動作**

| Mode        | Behavior                                          |
| ----------- | ------------------------------------------------- |
| `inclusive` | Updates both local and remote                     |
| `exclusive` | Updates only remote (local is not updated)        |
| `redirect`  | Returns a 303 redirect URL (local is not updated) |
| `auxiliary` | Updates only local (remote is read-only)          |

### エラー処理

| Scenario                             | Behavior                                      |
| ------------------------------------ | --------------------------------------------- |
| Provider connection failure          | Logs a warning and returns only local results |
| Provider timeout                     | Logs a warning and returns only local results |
| All providers fail in exclusive mode | Returns a 502 error (optional)                |

***

## エンティティタイプ

### タイプ一覧

```http
GET /v2/types
```

**クエリパラメータ**

| Parameter        | Description               |
| ---------------- | ------------------------- |
| `options=count`  | Include entity count      |
| `options=values` | Include attribute details |

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

***

## HTTP キャッシュコントロール

GET エンドポイントは、エンドポイントクラスごとにキャッシュ関連のヘッダーを返します:

### データエンドポイント (entities、subscriptions、registrations) — RFC 7232 + RFC 7234 の完全サポート

| Header          | Value                                                                  | Purpose                                                                                                                                                                                                                                                                                                              |
| --------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ETag`          | `W/"..."`                                                              | Weak validator. Generation seeds include `path + Accept + Fiware-Service + Fiware-ServicePath` so distinct endpoints / Accept / tenants / service paths always produce distinct ETags. Lists: streaming digest of `id + modifiedAt` mixed with total count and scope. Single: hash of `modifiedAt` mixed with scope. |
| `Last-Modified` | RFC 1123 HTTP-date                                                     | Timestamp of the latest `modifiedAt` in the result set.                                                                                                                                                                                                                                                              |
| `Cache-Control` | `private, no-cache`                                                    | `private` blocks shared / intermediate cache storage; `no-cache` forces revalidation from the private cache.                                                                                                                                                                                                         |
| `Vary`          | `Fiware-Service, Fiware-ServicePath, Authorization, X-Api-Key, Accept` | Tenant + auth + content-negotiation isolation for shared caches.                                                                                                                                                                                                                                                     |

条件付きリクエストがサポートされています:

| Request Header                   | Behavior                                                 |
| -------------------------------- | -------------------------------------------------------- |
| `If-None-Match: <ETag>`          | Returns `304 Not Modified` (empty body) if matched.      |
| `If-Modified-Since: <HTTP-date>` | Returns `304` if the resource is unchanged.              |
| `Cache-Control: no-store`        | Server overrides response `Cache-Control` to `no-store`. |

### メタエンドポイント (types) — Cache-Control + Vary のみ (ETag なし / 304 なし)

| Header          | Value                                                                  | Purpose                                          |
| --------------- | ---------------------------------------------------------------------- | ------------------------------------------------ |
| `Cache-Control` | `max-age=60, stale-while-revalidate=120`                               | Short-term caching with background revalidation. |
| `Vary`          | `Fiware-Service, Fiware-ServicePath, Authorization, X-Api-Key, Accept` | Same tenant/auth isolation as data endpoints.    |

メタエンドポイントは `ETag` / `Last-Modified` を返さず、`If-None-Match` / `If-Modified-Since` 条件付きリクエストをサポートしません。クライアントは代わりに `max-age` / `stale-while-revalidate` ディレクティブに依存する必要があります。

完全なセマンティクスについては、[API.md §HTTP Cache Control](./endpoints.md#http-cache-control-etag--conditional-requests) を参照してください。

***

## HTTP エラーレスポンス

| Status Code | Error Code            | Description                                                |
| ----------- | --------------------- | ---------------------------------------------------------- |
| 400         | BadRequest            | Invalid request parameters or body                         |
| 400         | InvalidModification   | Invalid attribute modification (e.g., changing id or type) |
| 401         | Unauthorized          | Authentication required or token is invalid                |
| 403         | Forbidden             | Insufficient permissions                                   |
| 404         | NotFound              | Entity, subscription, etc. not found                       |
| 405         | MethodNotAllowed      | HTTP method not allowed                                    |
| 409         | AlreadyExists         | Entity already exists (during POST creation)               |
| 409         | TooManyResults        | Multiple entities matched (when type is not specified)     |
| 411         | ContentLengthRequired | Content-Length header is required                          |
| 413         | RequestEntityTooLarge | Request body is too large                                  |
| 415         | UnsupportedMediaType  | Unsupported Content-Type                                   |
| 422         | Unprocessable         | Entity format is invalid                                   |
| 429         | TooManyRequests       | Rate limit exceeded                                        |
| 500         | InternalError         | Internal server error                                      |

**エラーレスポンス形式**

```json
{
  "error": "BadRequest",
  "description": "Invalid query parameter: limit must be a positive integer"
}
```

***

## エンドポイントリファレンス

FIWARE NGSIv2 互換 Context Broker API。

### 共通仕様


* **Content-Type**: `application/json`
  
* **認証**: `AUTH_ENABLED=true` の場合は必須
  
* **テナント分離**: `Fiware-Service` ヘッダーによるテナント分離
  
* **ページネーション**: `limit`/`offset` パラメータ; 総数を取得するには `options=count` を使用

### エンティティ操作

| Endpoint                                         | Method | Description                             | Success | Error              | Pagination    |
| ------------------------------------------------ | ------ | --------------------------------------- | ------- | ------------------ | ------------- |
| `/v2/entities`                                   | GET    | List entities                           | 200     | 400, 401           | ✅ (max: 1000) |
| `/v2/entities`                                   | POST   | Create entity                           | 201     | 400, 401, 409, 415 | -             |
| `/v2/entities/{entityId}`                        | GET    | Get entity                              | 200     | 400, 401, 404      | -             |
| `/v2/entities/{entityId}`                        | DELETE | Delete entity                           | 204     | 401, 404           | -             |
| `/v2/entities/{entityId}/attrs`                  | GET    | Get attributes only (no id/type fields) | 200     | 400, 401, 404      | -             |
| `/v2/entities/{entityId}/attrs`                  | PATCH  | Update attributes                       | 204     | 400, 401, 404, 415 | -             |
| `/v2/entities/{entityId}/attrs`                  | POST   | Add attributes                          | 204     | 400, 401, 404, 415 | -             |
| `/v2/entities/{entityId}/attrs`                  | PUT    | Replace attributes                      | 204     | 400, 401, 404, 415 | -             |
| `/v2/entities/{entityId}/attrs/{attrName}`       | GET    | Get attribute                           | 200     | 401, 404           | -             |
| `/v2/entities/{entityId}/attrs/{attrName}`       | PUT    | Update attribute                        | 204     | 400, 401, 404, 415 | -             |
| `/v2/entities/{entityId}/attrs/{attrName}`       | DELETE | Delete attribute                        | 204     | 401, 404           | -             |
| `/v2/entities/{entityId}/attrs/{attrName}/value` | GET    | Get attribute value                     | 200     | 401, 404           | -             |
| `/v2/entities/{entityId}/attrs/{attrName}/value` | PUT    | Update attribute value                  | 204     | 400, 401, 404, 415 | -             |

### タイプ操作

| Endpoint               | Method | Description      | Success | Error    | Pagination    |
| ---------------------- | ------ | ---------------- | ------- | -------- | ------------- |
| `/v2/types`            | GET    | List types       | 200     | 400, 401 | ✅ (max: 1000) |
| `/v2/types/{typeName}` | GET    | Get type details | 200     | 401, 404 | -             |

### サブスクリプション操作

| Endpoint                             | Method | Description         | Success | Error              | Pagination    |
| ------------------------------------ | ------ | ------------------- | ------- | ------------------ | ------------- |
| `/v2/subscriptions`                  | GET    | List subscriptions  | 200     | 400, 401           | ✅ (max: 1000) |
| `/v2/subscriptions`                  | POST   | Create subscription | 201     | 400, 401, 415      | -             |
| `/v2/subscriptions/{subscriptionId}` | GET    | Get subscription    | 200     | 401, 404           | -             |
| `/v2/subscriptions/{subscriptionId}` | PATCH  | Update subscription | 204     | 400, 401, 404, 415 | -             |
| `/v2/subscriptions/{subscriptionId}` | DELETE | Delete subscription | 204     | 401, 404           | -             |

### レジストレーション操作 (フェデレーション)

| Endpoint                             | Method | Description         | Success | Error              | Pagination    |
| ------------------------------------ | ------ | ------------------- | ------- | ------------------ | ------------- |
| `/v2/registrations`                  | GET    | List registrations  | 200     | 400, 401           | ✅ (max: 1000) |
| `/v2/registrations`                  | POST   | Create registration | 201     | 400, 401, 415      | -             |
| `/v2/registrations/{registrationId}` | GET    | Get registration    | 200     | 401, 404           | -             |
| `/v2/registrations/{registrationId}` | PATCH  | Update registration | 204     | 400, 401, 404, 415 | -             |
| `/v2/registrations/{registrationId}` | DELETE | Delete registration | 204     | 401, 404           | -             |

### バッチ操作

> **注意**: バッチ操作 (クエリを除く) は、1 リクエストあたり **`MAX_BATCH_SIZE`** エンティティに制限されています (デフォルト: 100)。この制限を超えると `400 Bad Request` が返されます。

| Endpoint        | Method | Description                          | Success | Error         | Pagination    |
| --------------- | ------ | ------------------------------------ | ------- | ------------- | ------------- |
| `/v2/op/update` | POST   | Batch update (max: `MAX_BATCH_SIZE`) | 204     | 400, 401, 415 | -             |
| `/v2/op/query`  | POST   | Batch query                          | 200     | 400, 401, 415 | ✅ (max: 1000) |
| `/v2/op/notify` | POST   | Receive notification                 | 200     | 400, 401, 415 | -             |
