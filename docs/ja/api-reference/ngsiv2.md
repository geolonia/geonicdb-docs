---
title: "NGSIv2 API"
description: "NGSIv2 API reference"
outline: deep
---
# NGSIv2 API

> このドキュメントは [API.md](./endpoints.md) から分割されました。メインの API 仕様については [API.md](./endpoints.md) を参照してください。

---

## エンティティ操作

### エンティティの一覧取得

```http
GET /v2/entities
```



**クエリパラメータ**

| パラメータ | 型 | 説明 | デフォルト |
|-----------|------|-------------|---------|
| `id` | string | エンティティ ID でフィルタ (カンマ区切りで複数指定可) | - |
| `limit` | integer | 取得する結果数 (最大: 1000) | 20 |
| `offset` | integer | オフセット (ページネーション用) | 0 |
| `orderBy` | string | ソート基準 (`entityId`、`entityType`、`modifiedAt`、または属性名)。FIWARE Orion 互換の `!` プレフィックスで降順を指定可能 (例: `!temperature`) | - |
| `orderDirection` | string | ソート方向 (`asc`、`desc`)。**GeonicDB 拡張** (公式仕様は `!` プレフィックス方式のみサポート) | `asc` |
| `type` | string | エンティティタイプでフィルタ | - |
| `typePattern` | string | エンティティタイプの正規表現パターン | - |
| `idPattern` | string | エンティティ ID の正規表現パターン | - |
| `q` | string | 属性値でフィルタ ([クエリ言語](./endpoints.md#query-language) を参照) | - |
| `mq` | string | メタデータでフィルタ ([クエリ言語](./endpoints.md#query-language) を参照) | - |
| `attrs` | string | 取得する属性名 (カンマ区切り) | - |
| `metadata` | string | メタデータ出力制御 (`on`、`off`)。**GeonicDB 拡張** (公式仕様ではカンマ区切りの名前リストと `*` ワイルドカードなどを使用) | `on` |
| `georel` | string | ジオクエリ演算子 ([ジオクエリ](./endpoints.md#geo-queries) を参照) | - |
| `geometry` | string | ジオメトリタイプ | - |
| `coords` | string | 座標 (緯度,経度形式、セミコロン区切り) | - |
| `spatialId` | string | 空間 ID でフィルタ (ZFXY 形式) ([空間 ID 検索](./endpoints.md#spatial-id-search) を参照) | - |
| `spatialIdDepth` | integer | 空間 ID 階層展開の深さ (0-4) | 0 |
| `crs` | string | 座標参照系 ([座標参照系 (CRS)](./endpoints.md#coordinate-reference-system-crs) を参照) | `EPSG:4326` |
| `options` | string | `keyValues`、`values`、`count`、`geojson`、`sysAttrs`、`unique` | - |

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

レスポンスに `Fiware-Total-Count` ヘッダーが追加されます。

**geojson オプション** (`options=geojson` または `Accept: application/geo+json` ヘッダー)

GeoJSON FeatureCollection としてレスポンスを返します。

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













レスポンスヘッダーに `Content-Type: application/geo+json` が設定されます。

### エンティティの作成

```http
POST /v2/entities
```



**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `options` | string | `upsert`: エンティティが既に存在する場合は更新。`keyValues`: リクエストボディを keyValues 形式として解釈 |

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

エンティティが存在しない場合は作成され (`201 Created`)、既に存在する場合は属性が更新されます (`204 No Content`)。

**レスポンス**
- ステータス: `201 Created` (新規作成)、`204 No Content` (upsert による更新)
- ステータス: `409 AlreadyExists` 同じ ID のエンティティが既に存在する場合 (タイプに関わらず)
- ヘッダー: `Location: /v2/entities/Room1?type=Room`
> **GeonicDB 拡張 — エンティティ ID の一意性**: エンティティ ID はテナントとServicePathスコープ内で一意です。同じ ID で異なるタイプのエンティティを作成することは許可されず、`409 AlreadyExists` を返します。これは、同じ ID で異なるタイプのエンティティを許可する NGSIv2 仕様とは異なります。詳細は [エンティティ ID の一意性](./endpoints.md#entity-id-uniqueness-geonicdb-extension) を参照してください。

### 単一エンティティの取得

```http
GET /v2/entities/{entityId}
```



**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `type` | string | エンティティタイプ (オプションのフィルタ。エンティティ ID は一意なのでタイプの曖昧性解消は不要 — [エンティティ ID の一意性](./endpoints.md#entity-id-uniqueness-geonicdb-extension) を参照) |
| `attrs` | string | 取得する属性名 (カンマ区切り) |
| `options` | string | `keyValues`、`values` |

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








**レスポンス**: `204 No Content`
### エンティティの更新 (PUT)

```http
PUT /v2/entities/{entityId}/attrs
```



すべての属性を置き換えます (指定されなかった属性は削除されます)。

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `type` | string | エンティティタイプ |

**レスポンス**: `204 No Content`
### 属性の追加 (POST)

```http
POST /v2/entities/{entityId}/attrs
```



新しい属性を追加します (既存の属性は上書きされます)。

`options=append` を指定すると、既存の属性は上書きされず、新しい属性のみが追加されます (厳密追加モード)。既に存在する属性名が含まれている場合、`422 Unprocessable Entity` エラーが返されます。

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `type` | string | エンティティタイプ |
| `options` | string | `append`: 既存属性の上書きを禁止 (厳密追加モード) |

**レスポンス**: `204 No Content`
### エンティティの削除

```http
DELETE /v2/entities/{entityId}
```



**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `type` | string | エンティティタイプ |

**レスポンス**: `204 No Content`
---

## 属性操作

### エンティティ属性の取得

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






> **注意**: `/v2/entities/{entityId}?attrs=...` とは異なり、このエンドポイントには `id` と `type` フィールドが含まれません。属性のみが必要な場合に使用してください。

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






**レスポンス**: `204 No Content`
### 単一属性の削除

```http
DELETE /v2/entities/{entityId}/attrs/{attrName}
```



**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `type` | string | エンティティタイプ |

**レスポンス**: `204 No Content`
### 属性値の直接取得

```http
GET /v2/entities/{entityId}/attrs/{attrName}/value
```



属性の値のみを取得します (タイプとメタデータは含まれません)。

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `type` | string | エンティティタイプ |

**レスポンス**

値のタイプに応じて異なる Content-Type で返されます:

| 値のタイプ | Content-Type | 例 |
|------------|--------------|---------|
| 文字列 | `text/plain` | `hello world` |
| 数値 | `text/plain` | `23.5` |
| 真偽値 | `text/plain` | `true` |
| null | `text/plain` | `null` |
| オブジェクト | `application/json` | `{"lat": 35.68, "lon": 139.76}` |
| 配列 | `application/json` | `[1, 2, 3]` |

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











### 属性値の直接更新

```http
PUT /v2/entities/{entityId}/attrs/{attrName}/value
```



属性の値のみを更新します。既存のタイプとメタデータは保持されます。

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|------|-------------|
| `type` | string | エンティティタイプ |

**リクエスト**

Content-Type に応じて値の解釈が異なります:

| Content-Type | 解釈 |
|--------------|----------------|
| `application/json` | JSON としてパース |
| `text/plain` | プリミティブ値 (`null`、`true`、`false`、数値) または文字列 |

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
**注意**: この操作は既存属性のタイプやメタデータを変更しません — それらは保持されます。

---

## バッチ操作

> **注意**: バッチ操作は 1 リクエストあたり **`MAX_BATCH_SIZE`** エンティティまで処理できます (デフォルト: 100、SAM パラメータ `MaxBatchSize` で最大 10,000 まで設定可能)。この制限を超えるリクエストは `400 Bad Request` エラーを返します。設定の詳細は [DEVELOPMENT.md](../getting-started/installation.md) を参照してください。

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
