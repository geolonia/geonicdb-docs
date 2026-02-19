---
title: "NGSIv2 API"
description: "NGSIv2 API リファレンス"
outline: deep
---
# NGSIv2 API

> このドキュメントは [API.md](./endpoints.md) から分離されたものです。メインの API 仕様については [API.md](./endpoints.md) を参照してください。

---

### エンティティ操作

#### エンティティ一覧の取得

```http
GET /v2/entities
```

**クエリパラメータ**

| パラメータ | 型 | 説明 | デフォルト |
|-----------|-----|------|-----------|
| `id` | string | エンティティ ID でフィルタ（カンマ区切りで複数指定可） | - |
| `limit` | integer | 取得件数（最大: 1000） | 20 |
| `offset` | integer | オフセット（ページネーション用） | 0 |
| `orderBy` | string | ソート基準（`entityId`、`entityType`、`modifiedAt`、属性名も可）。FIWARE Orion 互換の `!` プレフィックスで降順指定も可能（例: `!temperature`） | - |
| `orderDirection` | string | ソート方向（`asc`、`desc`）。**GeonicDB 独自拡張**（公式仕様は `!` プレフィックス方式のみ） | `asc` |
| `type` | string | エンティティタイプでフィルタ | - |
| `typePattern` | string | エンティティタイプの正規表現パターン | - |
| `idPattern` | string | エンティティ ID の正規表現パターン | - |
| `q` | string | 属性値によるフィルタ（[クエリ言語](./endpoints.md#クエリ言語)参照） | - |
| `mq` | string | メタデータによるフィルタ（[クエリ言語](./endpoints.md#クエリ言語)参照） | - |
| `attrs` | string | 取得する属性名（カンマ区切り） | - |
| `metadata` | string | メタデータ出力制御（`on`、`off`）。**GeonicDB 独自拡張**（公式仕様はカンマ区切りの名前リストで `*` ワイルドカード等を指定） | `on` |
| `georel` | string | ジオクエリ演算子（[ジオクエリ](./endpoints.md#ジオクエリ)参照） | - |
| `geometry` | string | ジオメトリタイプ | - |
| `coords` | string | 座標（緯度,経度 形式、セミコロン区切り） | - |
| `spatialId` | string | 空間 ID（ZFXY 形式）でフィルタ（[空間 ID 検索](./endpoints.md#空間id検索)参照） | - |
| `spatialIdDepth` | integer | 空間 ID 階層展開の深さ（0-4） | 0 |
| `crs` | string | 座標参照系（[座標参照系（CRS）](./endpoints.md#座標参照系crs)参照） | `EPSG:4326` |
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

**keyValues 形式**（`options=keyValues`）

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
| `type` | string | エンティティタイプ（同一 ID が複数タイプにある場合に必要） |
| `attrs` | string | 取得する属性名（カンマ区切り） |
| `options` | string | `keyValues`、`values` |

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
| `metadata` | string | メタデータ出力制御（`on`、`off`） | `on` |
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

**keyValues 形式**（`options=keyValues`）

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

値の型に応じて異なる Content-Type で返されます：

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

Content-Type に応じて値の解釈が異なります：

| Content-Type | 解釈 |
|--------------|------|
| `application/json` | JSON としてパース |
| `text/plain` | プリミティブ値（`null`、`true`、`false`、数値）または文字列 |

**使用例**

```bash
# text/plain で数値を