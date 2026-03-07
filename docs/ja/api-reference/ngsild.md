---
title: "NGSI-LD API"
description: "NGSI-LD API reference"
outline: deep
---
# NGSI-LD API

> このドキュメントは [API.md](./endpoints.md) から分離されました。メインの API 仕様については [API.md](./endpoints.md) を参照してください。

---

NGSI-LD は JSON-LD ベースのコンテキスト情報管理 API です。

## 仕様準拠

本ドキュメントは **[ETSI GS CIM 009 V1.9.1 (2025-07)](https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/01.09.01_60/gs_CIM009v010901p.pdf)** に準拠しています。各機能の詳細は、以下の ETSI 仕様セクションを参照してください:

| 機能カテゴリ | ETSI GS CIM 009 セクション |
|-------------|---------------------------|
| エンティティ操作 | Section 5.6 |
| クエリ操作 | Section 5.7 |
| サブスクリプション | Section 5.8 |
| コンテキストソース登録 | Section 5.9 |
| 時系列 API | Section 5.6.12-5.6.19 |
| EntityMaps | Section 5.14 |
| JSON-LD コンテキスト管理 | Section 5.12 |
| 分散操作 | Section 5.10 |

### コンテントネゴシエーションと @context

NGSI-LD API は `Accept` ヘッダーによるコンテントネゴシエーションをサポートしています。

| Accept ヘッダー | レスポンス形式 | @context の扱い |
|----------------|--------------|----------------|
| `application/ld+json` | JSON-LD | `@context` がレスポンスボディに含まれる |
| `application/json` | JSON | `@context` は `Link` ヘッダーで返される |
| `application/geo+json` | GeoJSON | `@context` は `Link` ヘッダーで返される |

`Accept: application/json` の場合、レスポンスには `Link` ヘッダーが含まれます:

```http
Link: <https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"
```



### 自然言語照合 (lang + orderBy)

`lang` パラメータと `orderBy` を組み合わせることで、指定した言語のロケールに基づいて結果をソートできます。例えば、`lang=ja` を指定すると日本語の照合順序でソートされます。

### エンティティ操作 (NGSI-LD)

> **ETSI GS CIM 009 参照**: Section 5.6 - Entity Operations

#### エンティティ一覧取得

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
| `id` | string | エンティティ ID でフィルタ (複数の場合はカンマ区切り、URI 形式) | - |
| `limit` | integer | 取得件数 | 20 |
| `offset` | integer | オフセット | 0 |
| `orderBy` | string | ソート基準 (`entityId`, `entityType`, `modifiedAt`) | - |
| `orderDirection` | string | ソート方向 (`asc`, `desc`) | `asc` |
| `type` | string | エンティティタイプでフィルタ | - |
| `idPattern` | string | エンティティ ID の正規表現パターン | - |
| `q` | string | 属性値でフィルタ | - |
| `attrs` | string | 取得する属性名 (カンマ区切り) | - |
| `pick` | string | 取得する属性名 (カンマ区切り、`omit` と排他) | - |
| `omit` | string | 除外する属性名 (カンマ区切り、`pick` と排他、`id`/`type` は不可) | - |
| `scopeQ` | string | スコープクエリ (例: `/Madrid`, `/Madrid/#`, `/Madrid/+`) | - |
| `lang` | string | LanguageProperty の言語フィルタ (BCP 47、カンマ区切りで優先順位、`*` で全言語) | - |
| `georel` | string | ジオクエリの演算子 | - |
| `geometry` | string | ジオメトリタイプ | - |
| `coordinates` | string | 座標 | - |
| `spatialId` | string | 空間 ID でフィルタ (ZFXY 形式) ([空間 ID 検索](./endpoints.md#spatial-id-search)を参照) | - |
| `spatialIdDepth` | integer | 空間 ID 階層展開の深さ (0-4) | 0 |
| `crs` | string | 座標参照系 ([座標参照系 (CRS)](./endpoints.md#coordinate-reference-system-crs)を参照)。URN 形式も可 | `EPSG:4326` |
| `geoproperty` | string | ジオクエリで使用する GeoProperty 名 | `location` |
| `format` | string | 出力形式 (`simplified` で keyValues 形式、`geojson` で GeoJSON 形式)。GeoJSON は `Accept: application/geo+json` ヘッダーでも指定可 | - |
| `expandValues` | string | 展開する属性名 (カンマ区切り、展開された値を返す) | - |
| `options` | string | `keyValues`, `concise`, `entityMap`, `sysAttrs` (システム属性を出力)、`splitEntities` (タイプ別にレスポンスを分割) | - |

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

#### エンティティ作成

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
















**一時的エンティティ (expiresAt)**

エンティティに `expiresAt` フィールド (ISO 8601 形式) を指定することで、有効期限付きの一時的エンティティ (Transient Entity) として作成されます。有効期限は未来の日時である必要があります。

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
- ステータス: `201 Created`- ステータス: `409 AlreadyExists` 同じ ID のエンティティが既に存在する場合 (タイプに関わらず)
- ヘッダー: `Location: /ngsi-ld/v1/entities/urn:ngsi-ld:Room:001`
> **注意**: エンティティ ID はテナントとServicePathスコープ内で一意です。同じ ID で異なるタイプのエンティティを作成すると `409 AlreadyExists` が返されます。詳細は [エンティティ ID の一意性](./endpoints.md#entity-id-uniqueness-geonicdb-extension) を参照してください。

#### エンティティ単体取得

```http
GET /ngsi-ld/v1/entities/{entityId}
```



**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `type` | string | エンティティタイプ |
| `attrs` | string | 取得する属性名 (カンマ区切り) |
| `pick` | string | 取得する属性名 (カンマ区切り、`omit` と排他) |
| `omit` | string | 除外する属性名 (カンマ区切り、`pick` と排他、`id`/`type` は不可) |
| `lang` | string | LanguageProperty の言語フィルタ (BCP 47) |
| `options` | string | `keyValues`, `concise`, `entityMap` |

#### エンティティ置換

```http
PUT /ngsi-ld/v1/entities/{entityId}
```



エンティティの全属性を置換します。リクエストボディに含まれない属性は削除されます。

**レスポンス**: `204 No Content`
#### エンティティ更新

```http
PATCH /ngsi-ld/v1/entities/{entityId}
```



**Merge-Patch セマンティクス** (ETSI GS CIM 009 Section 5.6.4):

- `Content-Type: application/merge-patch+json` を使用すると、リクエストボディに含まれない属性は保持されます (マージモード)。標準の `application/json` / `application/ld+json` では全属性が置換されます。
- プロパティ値に `urn:ngsi-ld:null` を指定すると、その属性を削除できます。
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
| `options=noOverwrite` | 既存の属性を上書きしない (既存属性は保持され、新規属性のみ追加される) |

**レスポンス**: `204 No Content`
#### 複数属性の部分更新

```http
PATCH /ngsi-ld/v1/entities/{entityId}/attrs
Content-Type: application/ld+json
```




エンティティの複数属性を部分的に更新します。リクエストボディに含まれる属性のみが更新され、含まれない属性は保持されます。

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
#### エンティティ削除

```http
DELETE /ngsi-ld/v1/entities/{entityId}
```



**レスポンス**: `204 No Content`
#### エンティティの全属性取得

```http
GET /ngsi-ld/v1/entities/{entityId}/attrs
```



エンティティの全属性を取得します。

**レスポンス**: `200 OK`
#### 属性単体取得

```http
GET /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
```



エンティティの特定の属性を取得します。

**レスポンス**: `200 OK`
#### 属性上書き (PUT)

```http
PUT /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
Content-Type: application/ld+json
```




指定された属性を新しい値で完全に上書きします。属性が存在しない場合は `404 Not Found` を返します。

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




指定された属性を新しい値で置換します。

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
> **注意**: エンティティまたは属性が存在しない場合、`404 Not Found` が返されます (ETSI GS CIM 009 V1.9.1 clause 5.6.4)。この操作は既存属性の部分更新のみを行い、新規属性の作成は行いません。

#### 属性削除

```http
DELETE /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
```



**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `datasetId` | string | 削除するマルチ属性インスタンスの datasetId |
| `deleteAll` | boolean | `true` の場合、全インスタンスを削除 |

**レスポンス**: `204 No Content`
### マルチ属性 (datasetId)

> **ETSI GS CIM 009 参照**: Section 4.5.3 - Multi-Attribute

NGSI-LD では、同じ属性名に対して複数のインスタンスを保持できます。各インスタンスは `datasetId` (URI 形式) で区別されます。`datasetId` を持たないインスタンスは「デフォルトインスタンス」と呼ばれ、属性ごとに最大 1 つまで存在できます。

#### 作成 (CREATE)

エンティティ作成時、属性を配列形式で指定することで複数のインスタンスを作成できます。

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























上記の例では、`speed` 属性に GPS、OBD、デフォルトの 3 つのインスタンスがあります。

#### 取得 (RETRIEVE)

エンティティ取得時、マルチ属性は配列形式で返されます。`keyValues` 形式では、デフォルトインスタンス (`datasetId` なし) の値のみが返されます。

#### 更新 (UPDATE)

属性更新 (PATCH/POST) 時、`datasetId` を指定することで特定のインスタンスのみを更新できます。

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

属性削除時、`datasetId` クエリパラメータを指定することで