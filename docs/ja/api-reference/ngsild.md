---
title: "NGSI-LD API"
description: "NGSI-LD API リファレンス"
outline: deep
---
# NGSI-LD API

> このドキュメントは [API.md](./endpoints.md) から分離されました。メイン API 仕様については [API.md](./endpoints.md) を参照してください。

---

NGSI-LD は、JSON-LD ベースのコンテキスト情報管理 API です。

## 仕様準拠

本ドキュメントは **[ETSI GS CIM 009 V1.9.1 (2025-07)](https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/01.09.01_60/gs_CIM009v010901p.pdf)** に準拠しています。各機能の詳細については、以下の ETSI 仕様セクションを参照してください:

| 機能カテゴリ | ETSI GS CIM 009 セクション |
|-------------|---------------------------|
| Entity 操作 | Section 5.6 |
| クエリ操作 | Section 5.7 |
| サブスクリプション | Section 5.8 |
| Context Source Registration | Section 5.9 |
| Temporal API | Section 5.6.12-5.6.19 |
| EntityMaps | Section 5.14 |
| JSON-LD Context 管理 | Section 5.11 |
| 分散操作 | Section 5.10 |

### コンテンツネゴシエーションと @context

NGSI-LD API は `Accept` ヘッダーによるコンテンツネゴシエーションをサポートしています。

| Accept ヘッダー | レスポンス形式 | @context の扱い |
|----------------|--------------|----------------|
| `application/ld+json` | JSON-LD | `@context` がレスポンスボディに含まれる |
| `application/json` | JSON | `@context` が `Link` ヘッダーで返される |
| `application/geo+json` | GeoJSON | `@context` が `Link` ヘッダーで返される |

`Accept: application/json` の場合、レスポンスには `Link` ヘッダーが含まれます:

```http
Link: <https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"
```



### 自然言語照合 (lang + orderBy)

`lang` パラメータと `orderBy` を組み合わせることで、指定した言語のロケールに基づいてソートできます。例えば `lang=ja` は日本語の照合順序を適用してソートします。

### Entity 操作 (NGSI-LD)

> **ETSI GS CIM 009 参照**: Section 5.6 - Entity Operations

#### Entity 一覧取得

```http
GET /ngsi-ld/v1/entities
```



**リクエストヘッダー**

```http
Accept: application/ld+json
Link: <https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"
```




**クエリパラメータ**

| パラメータ | 型 | 説明 | デフォルト |
|-----------|-----|------|-----------|
| `id` | string | Entity ID でフィルタ (複数の場合はカンマ区切り、URI 形式) | - |
| `limit` | integer | 取得件数 | 20 |
| `offset` | integer | オフセット | 0 |
| `orderBy` | string | ソート基準 (`entityId`, `entityType`, `modifiedAt`) | - |
| `orderDirection` | string | ソート方向 (`asc`, `desc`) | `asc` |
| `type` | string | Entity Type でフィルタ | - |
| `idPattern` | string | Entity ID の正規表現パターン | - |
| `q` | string | 属性値でフィルタ | - |
| `attrs` | string | 取得する属性名 (カンマ区切り) | - |
| `pick` | string | 取得する属性名 (カンマ区切り、`omit` と排他) | - |
| `omit` | string | 除外する属性名 (カンマ区切り、`pick` と排他、`id`/`type` は不可) | - |
| `scopeQ` | string | スコープクエリ (例: `/Madrid`, `/Madrid/#`, `/Madrid/+`) | - |
| `lang` | string | LanguageProperty の言語フィルタ (BCP 47、カンマ区切り優先順、`*` で全言語) | - |
| `georel` | string | Geo-query オペレータ | - |
| `geometry` | string | ジオメトリタイプ | - |
| `coordinates` | string | 座標 | - |
| `spatialId` | string | 空間 ID でフィルタ (ZFXY 形式) ([空間 ID 検索](./endpoints.md#spatial-id-search) 参照) | - |
| `spatialIdDepth` | integer | 空間 ID の階層展開深度 (0-4) | 0 |
| `crs` | string | 座標参照系 ([座標参照系 (CRS)](./endpoints.md#coordinate-reference-system-crs) 参照)。URN 形式も可 | `EPSG:4326` |
| `geoproperty` | string | geo-query に使用する GeoProperty 名 | `location` |
| `format` | string | 出力形式 (`simplified` で keyValues 形式、`geojson` で GeoJSON 形式)。GeoJSON は `Accept: application/geo+json` ヘッダーでも指定可 | - |
| `expandValues` | string | 展開する属性名 (カンマ区切り、展開された値を返す) | - |
| `options` | string | `keyValues`, `concise`, `entityMap`, `sysAttrs` (システム属性を出力), `splitEntities` (タイプごとに分割したレスポンス) | - |

**レスポンス例**

```json
[
  {
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
    "id": "urn:ngsi-ld:Room:001",
    "type": "Room",
    "temperature": {
      "type": "Property",
      "value": 23.5,
      "observedAt": "2024-01-15T10:00:00Z",
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






















**レスポンスヘッダー**

| ヘッダー | 説明 |
|---------|------|
| `NGSILD-Results-Count` | 総件数 (常に返される) |

#### Entity 作成

```http
POST /ngsi-ld/v1/entities
Content-Type: application/ld+json
```




**リクエストボディ**

```json
{
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
}
```
















**一時的な Entity (expiresAt)**

Entity に `expiresAt` フィールド (ISO 8601 形式) を指定することで、有効期限付きの Transient Entity として作成されます。有効期限は未来の日時である必要があります。

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "id": "urn:ngsi-ld:Room:temp-001",
  "type": "Room",
  "temperature": { "type": "Property", "value": 23.5 },
  "expiresAt": "2030-01-01T00:00:00Z"
}
```









**レスポンス**
- ステータス: `201 Created`- ステータス: `409 AlreadyExists` 同じ ID の Entity が既に存在する場合 (タイプに関係なく)
- ヘッダー: `Location: /ngsi-ld/v1/entities/urn:ngsi-ld:Room:001`
> **注意**: Entity ID はテナントと ServicePath スコープ内で一意です。同じ ID で異なるタイプの Entity を作成すると `409 AlreadyExists` が返されます。詳細は [Entity ID の一意性](./endpoints.md#entity-id-uniqueness-geonicdb-extension) を参照してください。

#### 単一 Entity 取得

```http
GET /ngsi-ld/v1/entities/{entityId}
```



**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `type` | string | Entity Type |
| `attrs` | string | 取得する属性名 (カンマ区切り) |
| `pick` | string | 取得する属性名 (カンマ区切り、`omit` と排他) |
| `omit` | string | 除外する属性名 (カンマ区切り、`pick` と排他、`id`/`type` は不可) |
| `lang` | string | LanguageProperty の言語フィルタ (BCP 47) |
| `options` | string | `keyValues`, `concise`, `entityMap` |

#### Entity 置換

```http
PUT /ngsi-ld/v1/entities/{entityId}
```



Entity の全属性を置き換えます。リクエストボディに含まれていない属性は削除されます。

**レスポンス**: `204 No Content`
#### Entity 更新

```http
PATCH /ngsi-ld/v1/entities/{entityId}
```



**Merge-Patch セマンティクス** (ETSI GS CIM 009 Section 5.6.4):

- `Content-Type: application/merge-patch+json` を使用すると、リクエストボディに含まれていない属性は保持されます (マージモード)。標準の `application/json` / `application/ld+json` では全属性が置換されます。
- プロパティ値として `urn:ngsi-ld:null` を指定すると、その属性が削除されます。
- クエリパラメータ `options=keyValues` または `options=concise` を指定すると、簡略化された入力形式を使用できます。

**レスポンス**: `204 No Content`
#### 属性追加

```http
POST /ngsi-ld/v1/entities/{entityId}
Content-Type: application/ld+json
```




**クエリパラメータ**

| パラメータ | 説明 |
|-----------|------|
| `options=noOverwrite` | 既存の属性を上書きしない (既存の属性は保持され、新しい属性のみが追加されます) |

**レスポンス**: `204 No Content`
#### 複数属性の部分更新

```http
PATCH /ngsi-ld/v1/entities/{entityId}/attrs
Content-Type: application/ld+json
```




Entity の複数属性を部分更新します。リクエストボディに含まれた属性のみが更新され、含まれていない属性は保持されます。

**リクエストボディ**

```json
{
  "temperature": {
    "type": "Property",
    "value": 25.0
  }
}
```








**レスポンス**: `204 No Content`
#### Entity 削除

```http
DELETE /ngsi-ld/v1/entities/{entityId}
```



**レスポンス**: `204 No Content`
#### Entity の全属性取得

```http
GET /ngsi-ld/v1/entities/{entityId}/attrs
```



Entity の全属性を取得します。

**レスポンス**: `200 OK`
#### 単一属性取得

```http
GET /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
```



Entity の特定の属性を取得します。

**レスポンス**: `200 OK`
#### 属性上書き (PUT)

```http
PUT /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
Content-Type: application/ld+json
```




指定した属性を新しい値で完全に上書きします。属性が存在しない場合は `404 Not Found` を返します。

**リクエストボディ**

```json
{
  "type": "Property",
  "value": 25.0
}
```






**レスポンス**: `204 No Content`
#### 属性置換

```http
POST /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
Content-Type: application/ld+json
```




指定した属性を新しい値で置き換えます。

**リクエストボディ**

```json
{
  "type": "Property",
  "value": 25.0
}
```






**レスポンス**: `204 No Content`
#### 属性の部分更新

```http
PATCH /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
Content-Type: application/ld+json
```




**リクエストボディ**

```json
{
  "type": "Property",
  "value": 25.0
}
```






**レスポンス**: `204 No Content`
> **注意**: Entity または属性が存在しない場合、`404 Not Found` が返されます (ETSI GS CIM 009 V1.9.1 clause 5.6.4)。この操作は既存の属性の部分更新のみを行い、新しい属性を作成しません。

#### 属性削除

```http
DELETE /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
```



**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `datasetId` | string | 削除する multi-attribute インスタンスの datasetId |
| `deleteAll` | boolean | `true` の場合、全インスタンスを削除 |

**レスポンス**: `204 No Content`
### Multi-Attribute (datasetId)

> **ETSI GS CIM 009 参照**: Section 4.5.3 - Multi-Attribute

NGSI-LD では、同じ属性名に対して複数のインスタンスを保持できます。各インスタンスは `datasetId` (URI 形式) で区別されます。`datasetId` を持たないインスタンスは "デフォルトインスタンス" と呼ばれ、1 つの属性に対して最大 1 つ存在できます。

#### 作成 (CREATE)

Entity 作成時に、属性を配列形式で指定することで複数のインスタンスを作成できます。

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "id": "urn:ngsi-ld:Vehicle:A001",
  "type": "Vehicle",
  "speed": [
    {
      "type": "Property",
      "value": 55,
      "datasetId": "urn:ngsi-ld:dataset:gps"
    },
    {
      "type": "Property",
      "value": 54.5,
      "datasetId": "urn:ngsi-ld:dataset:obd"
    },
    {
      "type": "Property",
      "value": 54.8
    }
  ]
}
```























上記の例では、`speed` 属性に 3 つのインスタンス (GPS からのもの、OBD からのもの、デフォルトインスタンス) があります。

#### 取得 (RETRIEVE)

Entity 取得時、multi-attribute は配列形式で返されます。`keyValues` 形式では、デフォルトインスタンス (`datasetId` なし) の値のみが返されます。

#### 更新 (UPDATE)

属性更新時 (PATCH/POST)、`datasetId` を指定することで特定のインスタンスのみを更新できます。

```json
{
  "speed": {
    "type": "Property",
    "value": 60,
    "datasetId": "urn:ngsi-ld:dataset:gps"
  }
}
```









#### 削除 (DELETE)

属性削除時、`datasetId` クエリパラメータを指定することで特定のインスタンスのみを削除できます。`deleteAll=true` を指定すると全インスタンスが削除されます。

```http
DELETE /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}?datasetId=urn:ngsi-ld:dataset:gps
DELETE /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}?deleteAll=true
```




---

### バッチ操作 (NGSI-LD)

> **注意**: バッチ操作は 1 リクエストあたり最大 **1,000** 件の Entity を処理できます