---
title: "NGSI-LD API"
description: "NGSI-LD API reference"
outline: deep
---
# NGSI-LD API

> このドキュメントは [API.md](./endpoints.md) から分離されました。メインの API 仕様については、[API.md](./endpoints.md) を参照してください。

***

NGSI-LD は JSON-LD ベースのコンテキスト情報管理 API です。

> **注意:** NGSI-LD API は ETSI GS CIM 009 仕様に従い、`Fiware-ServicePath` ヘッダーを無視します。階層は `scope` エンティティプロパティと `scopeQ` クエリパラメータによって管理されます。`servicePath` と `scope` は独立した概念であり、自動的に同期されることはありません ([INTEROPERABILITY.md](../core-concepts/ngsiv2-vs-ngsild.md#3-scope-scope-hierarchy) を参照)。
>
> **注意:** NGSIv2 と NGSI-LD のエンティティは完全に分離されています。NGSIv2 で作成されたエンティティは NGSI-LD からは見えず、その逆も同様です (各エンティティの `protocol` フィールド、#964)。

## 仕様への準拠

このドキュメントは **[ETSI GS CIM 009 V1.9.1 (2025-07)](https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/01.09.01_60/gs_CIM009v010901p.pdf)** に準拠しています。各機能の詳細については、以下の ETSI 仕様セクションを参照してください:

| Feature Category            | ETSI GS CIM 009 Section |
| --------------------------- | ----------------------- |
| Entity Operations           | Section 5.6             |
| Query Operations            | Section 5.7             |
| Subscriptions               | Section 5.8             |
| Context Source Registration | Section 5.9             |
| Temporal API                | Section 5.6.12-5.6.19   |
| EntityMaps                  | Section 5.14            |
| JSON-LD Context Management  | Section 5.12            |
| Distributed Operations      | Section 5.10            |

### コンテントネゴシエーションと @context

NGSI-LD API は `Accept` ヘッダーによるコンテントネゴシエーションをサポートしています。

| Accept Header          | Response Format | @context Handling                            |
| ---------------------- | --------------- | -------------------------------------------- |
| `application/ld+json`  | JSON-LD         | `@context` is included in the response body  |
| `application/json`     | JSON            | `@context` is returned via the `Link` header |
| `application/geo+json` | GeoJSON         | `@context` is returned via the `Link` header |

`Accept: application/json` の場合、レスポンスには `Link` ヘッダーが含まれます:

```http
Link: <https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"
```

### 自然言語照合 (lang + orderBy)

`lang` パラメータと `orderBy` を組み合わせることで、指定した言語のロケールに基づいて結果をソートできます。たとえば、`lang=ja` を指定すると、日本語の照合順序でソートが適用されます。

### エンティティ操作 (NGSI-LD)

> **ETSI GS CIM 009 リファレンス**: セクション 5.6 - エンティティ操作

#### エンティティリストの取得

```http
GET /ngsi-ld/v1/entities
```

**リクエストヘッダー**

```http
Accept: application/ld+json
Link: <https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"
```

**クエリパラメータ**

| Parameter        | Type    | Description                                                                                                                                               | Default     |
| ---------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `id`             | string  | Filter by entity ID (comma-separated for multiple, URI format)                                                                                            | -           |
| `limit`          | integer | Number of results to retrieve                                                                                                                             | 20          |
| `offset`         | integer | Offset                                                                                                                                                    | 0           |
| `orderBy`        | string  | Sort criteria (`entityId`, `entityType`, `modifiedAt`)                                                                                                    | -           |
| `orderDirection` | string  | Sort direction (`asc`, `desc`)                                                                                                                            | `asc`       |
| `type`           | string  | Filter by entity type                                                                                                                                     | -           |
| `idPattern`      | string  | Regular expression pattern for entity ID                                                                                                                  | -           |
| `q`              | string  | Filter by attribute value                                                                                                                                 | -           |
| `attrs`          | string  | Attribute names to retrieve (comma-separated)                                                                                                             | -           |
| `pick`           | string  | Attribute names to retrieve (comma-separated, mutually exclusive with `omit`)                                                                             | -           |
| `omit`           | string  | Attribute names to exclude (comma-separated, mutually exclusive with `pick`, `id`/`type` not allowed)                                                     | -           |
| `scopeQ`         | string  | Scope query (e.g., `/Madrid`, `/Madrid/#`, `/Madrid/+`)                                                                                                   | -           |
| `lang`           | string  | Language filter for LanguageProperty (BCP 47, comma-separated priority order, `*` for all languages)                                                      | -           |
| `georel`         | string  | Geo-query operator                                                                                                                                        | -           |
| `geometry`       | string  | Geometry type                                                                                                                                             | -           |
| `coordinates`    | string  | Coordinates                                                                                                                                               | -           |
| `spatialId`      | string  | Filter by spatial ID (ZFXY format) (see [Spatial ID Search](./endpoints.md#spatial-id-search))                                                            | -           |
| `spatialIdDepth` | integer | Depth of spatial ID hierarchy expansion (0-4)                                                                                                             | 0           |
| `crs`            | string  | Coordinate reference system (see [Coordinate Reference System (CRS)](./endpoints.md#coordinate-reference-system-crs)). URN format also accepted           | `EPSG:4326` |
| `geoproperty`    | string  | GeoProperty name to use for geo-queries                                                                                                                   | `location`  |
| `format`         | string  | Output format (`simplified` for keyValues format, `geojson` for GeoJSON format). GeoJSON can also be specified with `Accept: application/geo+json` header | -           |
| `expandValues`   | string  | Attribute names to expand (comma-separated, returns expanded values)                                                                                      | -           |
| `options`        | string  | `keyValues`, `concise`, `entityMap`, `sysAttrs` (output system attributes), `splitEntities` (split response by type)                                      | -           |

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

| Header                 | Description                   |
| ---------------------- | ----------------------------- |
| `NGSILD-Results-Count` | Total count (always returned) |

#### エンティティの作成

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

`expiresAt` フィールド (ISO 8601 形式) をエンティティに指定することで、有効期限を持つ一時的エンティティとして作成されます。有効期限は将来の日付である必要があります。

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

* ステータス: `201 Created`
  
* ステータス: `409 AlreadyExists` 同じ ID のエンティティが既に存在する場合 (タイプに関係なく)
  
* ヘッダー: `Location: /ngsi-ld/v1/entities/urn:ngsi-ld:Room:001`

> **注意**: エンティティ ID はテナントとServicePathのスコープ内で一意です。同じ ID で異なるタイプのエンティティを作成すると、`409 AlreadyExists` が返されます。詳細は [Entity ID Uniqueness](./endpoints.md#entity-id-uniqueness-geonicdb-extension) を参照してください。

#### 単一エンティティの取得

```http
GET /ngsi-ld/v1/entities/{entityId}
```

**クエリパラメータ**

| Parameter | Type   | Description                                                                                           |
| --------- | ------ | ----------------------------------------------------------------------------------------------------- |
| `type`    | string | Entity type                                                                                           |
| `attrs`   | string | Attribute names to retrieve (comma-separated)                                                         |
| `pick`    | string | Attribute names to retrieve (comma-separated, mutually exclusive with `omit`)                         |
| `omit`    | string | Attribute names to exclude (comma-separated, mutually exclusive with `pick`, `id`/`type` not allowed) |
| `lang`    | string | Language filter for LanguageProperty (BCP 47)                                                         |
| `options` | string | `keyValues`, `concise`, `entityMap`                                                                   |

#### エンティティの置換

```http
PUT /ngsi-ld/v1/entities/{entityId}
```

エンティティのすべての属性を置換します。リクエストボディに含まれていない属性は削除されます。

**レスポンス**: `204 No Content`

#### エンティティの更新

```http
PATCH /ngsi-ld/v1/entities/{entityId}
```

**マージパッチセマンティクス** (ETSI GS CIM 009 Section 5.6.4):


* `Content-Type: application/merge-patch+json` を使用すると、リクエストボディに含まれていない属性は保持されます (マージモード)。標準の `application/json` / `application/ld+json` では、すべての属性が置換されます。
  
* プロパティ値として `urn:ngsi-ld:null` を指定すると、その属性が削除されます。
  
* クエリパラメータ `options=keyValues` または `options=concise` を指定すると、簡易化された入力形式を使用できます。

**レスポンス**: `204 No Content`

#### 属性の追加

```http
POST /ngsi-ld/v1/entities/{entityId}
Content-Type: application/ld+json
```

**クエリパラメータ**

| Parameter             | Description                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| `options=noOverwrite` | Do not overwrite existing attributes (existing attributes are preserved, only new attributes are added) |

**レスポンス**: `204 No Content`

#### 複数属性の部分更新

```http
PATCH /ngsi-ld/v1/entities/{entityId}/attrs
Content-Type: application/ld+json
```

エンティティの複数の属性を部分的に更新します。リクエストボディに含まれている属性のみが更新され、含まれていない属性は保持されます。

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

#### エンティティの削除

```http
DELETE /ngsi-ld/v1/entities/{entityId}
```

**レスポンス**: `204 No Content`

#### エンティティの全属性の取得

```http
GET /ngsi-ld/v1/entities/{entityId}/attrs
```

エンティティの全属性を取得します。

**レスポンス**: `200 OK`

#### 単一属性の取得

```http
GET /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
```

エンティティの特定の属性を取得します。

**レスポンス**: `200 OK`

#### 属性の上書き (PUT)

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

#### 属性の置換

```http
POST /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
Content-Type: application/ld+json
```

指定された属性を新しい値で置き換えます。

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

> **注意**: エンティティまたは属性が存在しない場合、`404 Not Found` が返されます (ETSI GS CIM 009 V1.9.1 clause 5.6.4)。この操作は既存の属性の部分更新のみを実行し、新しい属性は作成しません。

#### 属性の削除

```http
DELETE /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
```

**クエリパラメータ**

| Parameter   | Type    | Description                                         |
| ----------- | ------- | --------------------------------------------------- |
| `datasetId` | string  | datasetId of the multi-attribute instance to delete |
| `deleteAll` | boolean | If `true`, deletes all instances                    |

**レスポンス**: `204 No Content`

### マルチ属性 (datasetId)

> **ETSI GS CIM 009 リファレンス**: Section 4.5.3 - Multi-Attribute

NGSI-LD では、同じ属性名に対して複数のインスタンスを保持できます。各インスタンスは `datasetId` (URI 形式) によって区別されます。`datasetId` を持たないインスタンスは「デフォルトインスタンス」と呼ばれ、属性ごとに最大 1 つまで存在できます。

#### 作成 (CREATE)

エンティティを作成する際、配列形式で属性を指定することで複数のインスタンスを作成できます。

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

上記の例では、`speed` 属性に対して 3 つのインスタンスがあります:GPS からのもの、OBD からのもの、そしてデフォルトインスタンスです。

#### 取得 (RETRIEVE)

エンティティを取得する際、マルチ属性は配列形式で返されます。`keyValues` 形式では、デフォルトインスタンス (`datasetId` なし) の値のみが返されます。

#### 更新 (UPDATE)

属性を更新する際 (PATCH/POST)、`datasetId` を指定することで特定のインスタンスのみを更新できます。

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

属性を削除する際、`datasetId` クエリパラメータを指定すると特定のインスタンスのみが削除されます。`deleteAll=true` を指定すると全てのインスタンスが削除されます。

```http
DELETE /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}?datasetId=urn:ngsi-ld:dataset:gps
DELETE /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}?deleteAll=true
```

***

### バッチ操作 (NGSI-LD)

> **注意**: バッチ操作は、1 リクエストあたり最大 **1,000** 個のエンティティを処理できます。1,000 を超えるリクエストは `400 Bad Request` エラーになります。

#### バッチ作成

```http
POST /ngsi-ld/v1/entityOperations/create
Content-Type: application/ld+json
```

**リクエストボディ**

```json
[
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
]
```

**レスポンス**

* すべて成功: `201 Created`
  
* 部分的成功: `207 Multi-Status`

#### バッチアップサート

```http
POST /ngsi-ld/v1/entityOperations/upsert
```

**クエリパラメータ**

| Parameter         | Description                                 |
| ----------------- | ------------------------------------------- |
| `options=replace` | Replace all attributes of existing entities |

**レスポンス**

* すべて成功: `201 Created` (新規作成) または `204 No Content` (更新)
  
* 部分的成功: `207 Multi-Status`

#### バッチ更新

```http
POST /ngsi-ld/v1/entityOperations/update
```

**レスポンス**

* すべて成功: `204 No Content`
  
* 部分的成功: `207 Multi-Status`

#### バッチ削除

```http
POST /ngsi-ld/v1/entityOperations/delete
Content-Type: application/json
```

**リクエストボディ**

```json
[
  "urn:ngsi-ld:Room:001",
  "urn:ngsi-ld:Room:002"
]
```

**レスポンス**

* すべて成功: `204 No Content`
  
* 部分的成功: `207 Multi-Status`

#### エンティティパージ

```http
POST /ngsi-ld/v1/entityOperations/purge
Content-Type: application/json
```

指定されたタイプのエンティティを一括削除します。ETSI NGSI-LD 仕様セクション 5.6.14 に準拠しています。

**クエリパラメータ**

| Parameter | Type   | Description                      |
| --------- | ------ | -------------------------------- |
| `type`    | string | Entity type to delete (required) |

**レスポンス**

* 成功: `204 No Content`
  
* Type が指定されていません: `400 Bad Request`

#### Batch Query

```http
POST /ngsi-ld/v1/entityOperations/query
Content-Type: application/json
```

**リクエストボディ**

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

**レスポンス**: エンティティの配列

#### Batch Merge

```http
POST /ngsi-ld/v1/entityOperations/merge
Content-Type: application/ld+json
```

Merge-Patch セマンティクスを使用して、複数のエンティティの一括更新を実行します。既存の属性はマージされ、リクエストに含まれていない属性は保持されます。値として `urn:ngsi-ld:null` を指定すると、その属性が削除されます。

**リクエストボディ**

```json
[
  {
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
    "id": "urn:ngsi-ld:Room:001",
    "type": "Room",
    "temperature": { "type": "Property", "value": 25.0 }
  }
]
```

**クエリパラメータ**

| Parameter             | Description                          |
| --------------------- | ------------------------------------ |
| `options=noOverwrite` | Do not overwrite existing attributes |

**レスポンス**

* すべて成功: `204 No Content`
  
* 部分的に成功: `207 Multi-Status`

***

### 時系列バッチ操作 (NGSI-LD)

> **ETSI GS CIM 009 リファレンス**: セクション 5.6.12-5.6.19 - エンティティの時系列表現

時系列エンティティのバッチ操作。1 回のリクエストで最大 **1,000** 個のエンティティを処理できます。

> **注**: 時系列 entityOperations の create / upsert / delete は GeonicDB 拡張機能であり、ETSI GS CIM 009 仕様には含まれていません。query のみが仕様準拠です。これらの拡張機能は、時系列データの一括取り込みの効率を向上させるために提供されています。

#### 時系列バッチ作成

```http
POST /ngsi-ld/v1/temporal/entityOperations/create
Content-Type: application/ld+json
```

時系列エンティティを一括作成します。リクエストボディは時系列エンティティの配列です。

**レスポンス**: すべて成功した場合は `201 Created`、部分的に失敗した場合は `207 Multi-Status`

#### 時系列バッチアップサート

```http
POST /ngsi-ld/v1/temporal/entityOperations/upsert
Content-Type: application/ld+json
```

時系列エンティティを一括作成または更新します(既存のエンティティに属性を追加します)。

**レスポンス**: すべて成功した場合は `204 No Content`、部分的に失敗した場合は `207 Multi-Status`

#### 時系列バッチ削除

```http
POST /ngsi-ld/v1/temporal/entityOperations/delete
Content-Type: application/ld+json
```

時系列エンティティを一括削除します。リクエストボディはエンティティ ID の配列です。

**レスポンス**: すべて成功した場合は `204 No Content`、部分的に失敗した場合は `207 Multi-Status`

#### 時系列バッチクエリ

```http
POST /ngsi-ld/v1/temporal/entityOperations/query
Content-Type: application/ld+json
```

POST ベースの時系列クエリ。クエリ条件はリクエストボディで指定します。

**リクエストボディの例**:

```json
{
  "type": "TemperatureSensor",
  "temporalQ": {
    "timerel": "after",
    "timeAt": "2024-01-01T00:00:00Z"
  }
}
```

**レスポンス**: `200 OK` - 時系列エンティティの配列

#### 時系列クエリパラメータ

以下のクエリパラメータは、時系列エンティティ GET エンドポイントで使用できます。

| Parameter   | Type    | Description                                                                           |
| ----------- | ------- | ------------------------------------------------------------------------------------- |
| `timerel`   | string  | Temporal relationship operator (`after`, `before`, `between`)                         |
| `timeAt`    | string  | Reference time (ISO 8601 format)                                                      |
| `endTimeAt` | string  | End time (required when `timerel=between`, ISO 8601 format)                           |
| `lastN`     | integer | Return only the latest N instances (positive integer, ETSI GS CIM 009 Section 5.6.12) |
| `options`   | string  | `temporalValues`: Simplified temporal representation                                  |

**lastN パラメータ**

`lastN` を指定すると、時系列データの最新 N 件のインスタンスのみが返されます。`timerel`/`timeAt` と組み合わせると、時間範囲内の最新 N 件のインスタンスを取得できます。

```bash
# Retrieve the latest 10 temporal data instances
curl "http://localhost:3000/ngsi-ld/v1/temporal/entities/urn:ngsi-ld:Sensor:001?lastN=10" \
  -H "Fiware-Service: myservice"
```

#### 時系列レスポンスフォーマットオプション

`options=temporalValues` を指定すると、各属性が `values` 配列(`[value, timestamp]` のペア)を持つ簡略化されたフォーマットで返されます。

**例**: `GET /ngsi-ld/v1/temporal/entities/{entityId}?options=temporalValues`

```json
{
  "id": "urn:ngsi-ld:Sensor:1",
  "type": "Sensor",
  "temperature": {
    "type": "Property",
    "values": [[20.5, "2024-01-01T10:00:00Z"], [21.0, "2024-01-01T11:00:00Z"]]
  }
}
```

#### 時系列集約クエリ(単一エンティティ)

集約クエリは、`aggrMethods` および `aggrPeriodDuration` クエリパラメータを使用して、時系列エンティティ GET エンドポイントで実行できます。リスト取得エンドポイントと単一エンティティ取得エンドポイントの両方で利用可能です。

| Parameter            | Type   | Description                                                                                                         |
| -------------------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| `aggrMethods`        | string | Aggregation methods (comma-separated): `totalCount`, `distinctCount`, `sum`, `avg`, `min`, `max`, `stddev`, `sumsq` |
| `aggrPeriodDuration` | string | ISO 8601 duration (e.g., `PT1H` for 1 hour). Required when `aggrMethods` is specified                               |

**例**: `GET /ngsi-ld/v1/temporal/entities/{entityId}?aggrMethods=avg&aggrPeriodDuration=PT1H&timerel=after&timeAt=2024-01-01T00:00:00Z`

```json
{
  "id": "urn:ngsi-ld:Sensor:1",
  "type": "Sensor",
  "temperature": {
    "type": "Property",
    "values": [
      {
        "@value": { "avg": 21.0 },
        "observedAt": "2024-01-01T10:00:00Z",
        "endAt": "2024-01-01T11:00:00Z"
      }
    ]
  }
}
```

> **注**: `aggrPeriodDuration` なしで `aggrMethods` を指定すると、`400 Bad Request` エラーが返されます。

> **注**: 集約クエリは**暗号化されたテナントではサポートされていません**(テナントで `encryptionEnabled: true` の場合)。属性値は保管時に暗号化されているため、MongoDB の集約パイプラインは暗号化されたデータに対して数値演算を実行できません。暗号化されたテナントで集約をリクエストすると `400 Bad Request` が返されます。復号化された値を取得して、アプリケーション層で集約を実行するには、`temporalValues` エンドポイントを使用してください。

***

### エンティティタイプ操作(NGSI-LD)

#### タイプリストの取得

```http
GET /ngsi-ld/v1/types
```

**パラメータ**: `limit`、`offset`

**レスポンス** (200):

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

**ヘッダー**: 合計件数は `NGSILD-Results-Count` で返される

#### タイプ詳細の取得

```http
GET /ngsi-ld/v1/types/{typeName}
```

**レスポンス** (200):

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

**エラー**: 404(タイプが存在しない場合)

### 属性操作 (NGSI-LD)

#### 属性リストの取得

```http
GET /ngsi-ld/v1/attributes
```

**パラメータ**: `limit`、`offset`

**レスポンス** (200):

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

**ヘッダー**: 合計カウントは `NGSILD-Results-Count` で返されます

#### 属性詳細の取得

```http
GET /ngsi-ld/v1/attributes/{attrName}
```

**レスポンス** (200):

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

**エラー**: 404 (属性が存在しない場合)

***

### サブスクリプション (NGSI-LD)

> **ETSI GS CIM 009 リファレンス**: Section 5.8 - Subscription Operations

#### サブスクリプションの作成

```http
POST /ngsi-ld/v1/subscriptions
Content-Type: application/ld+json
```

**HTTP 通知の例**

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "type": "Subscription",
  "entities": [
    { "type": "Room" }
  ],
  "watchedAttributes": ["temperature"],
  "q": "temperature>25",
  "notification": {
    "format": "normalized",
    "endpoint": {
      "uri": "https://webhook.example.com/notify",
      "accept": "application/ld+json"
    }
  }
}
```

**MQTT 通知の例**

NGSI-LD では、エンドポイント URI に `mqtt://` または `mqtts://` スキームを使用し、トピックはパスとして指定します。MQTT 固有の設定は `notifierInfo` で指定します。

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "type": "Subscription",
  "entities": [
    { "type": "Room" }
  ],
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

**MQTT notifierInfo 設定**

| Key            | Value                    | Description           |
| -------------- | ------------------------ | --------------------- |
| `MQTT-Version` | `mqtt3.1.1` or `mqtt5.0` | MQTT protocol version |
| `MQTT-QoS`     | `0`, `1`, or `2`         | QoS level             |

**サブスクリプション拡張フィールド**

| Field                           | Type              | Description                                                                                                                                                                                                                                                                               |
| ------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cooldown`                      | integer           | Minimum interval between notifications (seconds). Positive integers only. Will not re-notify within the specified number of seconds                                                                                                                                                       |
| `notificationTrigger`           | string\[]         | Event types that trigger notifications. `entityCreated`, `entityUpdated`, `entityChanged`, `entityDeleted`, `attributeCreated`, `attributeUpdated`, `attributeDeleted`. `entityChanged` is only triggered when attribute values actually change (updates with the same value are ignored) |
| `showChanges`                   | boolean           | If `true`, includes the previous attribute value as `previousValue` in the notification data                                                                                                                                                                                              |
| `notification.onlyChangedAttrs` | boolean           | If `true`, includes only attributes that have actually changed in the notification payload. Can be combined with `notification.attributes`                                                                                                                                                |
| `expiresAt`                     | string (ISO 8601) | Subscription expiration time                                                                                                                                                                                                                                                              |

**検証**

* `watchedAttributes` と `timeInterval` は相互に排他的です。両方を同時に指定すると `400 Bad Request` が返されます (ETSI GS CIM 009 V1.9.1 clause 5.8.1)

**レスポンス**

* ステータス: `201 Created`
  
* ヘッダー: `Location: /ngsi-ld/v1/subscriptions/{subscriptionId}`

#### サブスクリプション一覧

```http
GET /ngsi-ld/v1/subscriptions
```

**クエリパラメータ**

| Parameter | Type    | Description                   | Default |
| --------- | ------- | ----------------------------- | ------- |
| `limit`   | integer | Number of results to retrieve | 20      |
| `offset`  | integer | Offset                        | 0       |

#### サブスクリプションの取得

```http
GET /ngsi-ld/v1/subscriptions/{subscriptionId}
```

**通知ステータスフィールド(読み取り専用)**

| Field                            | Type    | Description                                                                               |
| -------------------------------- | ------- | ----------------------------------------------------------------------------------------- |
| `notification.status`            | string  | `ok` or `failed`                                                                          |
| `notification.lastNotification`  | string  | Date and time of last notification sent (ISO 8601)                                        |
| `notification.lastFailure`       | string  | Date and time of last notification failure (ISO 8601)                                     |
| `notification.lastFailureReason` | string  | Reason for the last failure (e.g., `HTTP 500: Internal Server Error`). Cleared on success |
| `notification.lastSuccess`       | string  | Date and time of last successful notification (ISO 8601)                                  |
| `notification.timesSent`         | integer | Number of notifications sent                                                              |

**再試行動作**: 通知配信が失敗した場合、一時的なエラー(5xx、ネットワークエラー)に対して指数バックオフ(1 秒、2 秒、4 秒)で最大 3 回の再試行が実行されます。4xx エラーに対しては再試行は実行されません。

#### サブスクリプションの更新

```http
PATCH /ngsi-ld/v1/subscriptions/{subscriptionId}
```

**レスポンス**: `204 No Content`

#### サブスクリプションの削除

```http
DELETE /ngsi-ld/v1/subscriptions/{subscriptionId}
```

**レスポンス**: `204 No Content`

#### 所有権の検証(GeonicDB 拡張機能)

認証が有効な場合(`AUTH_ENABLED=true`)、サブスクリプションの更新(PATCH)および削除(DELETE)操作は `createdBy` フィールドに基づいて所有権の検証を実行します。作成者以外のユーザーがこれらの操作を試みると `403 Forbidden` を受け取ります。`super_admin` および `tenant_admin` ロールはこの検証をバイパスできます。詳細については、[AUTH.md](../reference/auth.md) を参照してください。

***

### 登録 (NGSI-LD)

NGSI-LD では、外部コンテキストプロバイダーは Context Source Registrations として登録されます。

#### 登録の作成

```http
POST /ngsi-ld/v1/csourceRegistrations
Content-Type: application/ld+json
```

**リクエストボディ**

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "type": "ContextSourceRegistration",
  "registrationName": "Weather Data Provider",
  "description": "Provides weather data for the region",
  "endpoint": "http://context-provider:8080/ngsi-ld/v1",
  "information": [
    {
      "entities": [{ "type": "WeatherObserved" }],
      "propertyNames": ["temperature", "humidity"],
      "relationshipNames": ["observedBy"]
    }
  ],
  "observationInterval": {
    "start": "2020-01-01T00:00:00Z",
    "end": "2030-12-31T23:59:59Z"
  },
  "location": {
    "type": "Polygon",
    "coordinates": [[[139.5, 35.5], [140.0, 35.5], [140.0, 36.0], [139.5, 36.0], [139.5, 35.5]]]
  },
  "expiresAt": "2040-12-31T23:59:59.000Z",
  "mode": "inclusive"
}
```

**リクエストフィールド**

| Field                 | Type    | Required | Description                                                       |
| --------------------- | ------- | -------- | ----------------------------------------------------------------- |
| `type`                | string  | ✓        | Fixed: `ContextSourceRegistration`                                |
| `registrationName`    | string  | -        | Registration name                                                 |
| `description`         | string  | -        | Registration description                                          |
| `endpoint`            | string  | ✓        | Provider endpoint URL                                             |
| `information`         | array   | ✓        | Provided information (entities, propertyNames, relationshipNames) |
| `observationInterval` | object  | -        | Observation interval (start, end)                                 |
| `managementInterval`  | object  | -        | Management interval (start, end)                                  |
| `location`            | GeoJSON | -        | Geographic scope                                                  |
| `expiresAt`           | string  | -        | Expiration time (ISO 8601 format)                                 |
| `status`              | string  | -        | Status (`active` / `inactive`)                                    |
| `mode`                | string  | -        | Mode (`inclusive` / `exclusive` / `redirect` / `auxiliary`)       |

**レスポンス**

* ステータス:`201 Created`
  
* ヘッダー:`Location: /ngsi-ld/v1/csourceRegistrations/{registrationId}`

#### 登録リストの取得

```http
GET /ngsi-ld/v1/csourceRegistrations
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
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
    "id": "urn:ngsi-ld:ContextSourceRegistration:csr001",
    "type": "ContextSourceRegistration",
    "endpoint": "http://context-provider:8080/ngsi-ld/v1",
    "information": [
      {
        "entities": [{ "type": "WeatherObserved" }],
        "propertyNames": ["temperature", "humidity"]
      }
    ],
    "status": "active"
  }
]
```

#### 登録の取得

```http
GET /ngsi-ld/v1/csourceRegistrations/{registrationId}
```

#### 登録の更新

```http
PATCH /ngsi-ld/v1/csourceRegistrations/{registrationId}
```

**リクエストボディ**

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "endpoint": "http://new-provider:8080/ngsi-ld/v1"
}
```

**レスポンス**: `204 No Content`

#### 登録の削除

```http
DELETE /ngsi-ld/v1/csourceRegistrations/{registrationId}
```

**レスポンス**: `204 No Content`

#### 所有権検証 (GeonicDB 拡張)

認証が有効な場合 (`AUTH_ENABLED=true`)、登録の更新 (PATCH) および削除 (DELETE) 操作は `createdBy` フィールドに基づいて所有権検証を実行します。作成者以外のユーザーがこれらの操作を試みた場合、`403 Forbidden` を受け取ります。`super_admin` および `tenant_admin` ロールはこの検証をバイパスできます。詳細については、[AUTH.md](../reference/auth.md) を参照してください。

#### CSR 高度なフィールド (ETSI GS CIM 009 V1.9.1)

Context Source Registration では、以下の高度なフィールドがサポートされています:

| Field                | Type                       | Description                                                                     |
| -------------------- | -------------------------- | ------------------------------------------------------------------------------- |
| `cacheDuration`      | string (ISO 8601 duration) | Cache duration for responses from the context source                            |
| `refreshRate`        | string (ISO 8601 duration) | Interval for periodic refresh to the context source                             |
| `timeout`            | integer (ms)               | Request timeout to the context source                                           |
| `contextSourceAlias` | string                     | Alias name for the context source                                               |
| `contextSourceInfo`  | object\[]                  | Additional metadata for the context source                                      |
| `operationGroup`     | string\[]                  | Operation groups: `federationOps`, `retrieveOps`, `updateOps`, `redirectionOps` |

### 分散操作情報

#### Context Broker識別情報の取得

```http
GET /ngsi-ld/v1/info/sourceIdentity
```

コンテキストブローカーの識別情報を返します。分散環境におけるContext Broker識別に使用されます。

**レスポンス**: `200 OK` (`application/ld+json`)

#### 適合性情報の取得

```http
GET /ngsi-ld/v1/info/conformance
```

NGSI-LD 仕様への適合状況を返します。

**レスポンス**: `200 OK` (`application/ld+json`)

#### 分散クエリパラメータ

| Parameter   | Type    | Description                                                                 |
| ----------- | ------- | --------------------------------------------------------------------------- |
| `localOnly` | boolean | If `true`, skips federation and returns only local data                     |
| `csf`       | string  | Context Source Filter expression (e.g., `name==value`, `endpoint~=pattern`) |

#### 分散操作レスポンスヘッダー

| Header           | Description                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `NGSILD-Warning` | Warning message set when some context sources fail during federation (ETSI GS CIM 009 - 6.3.6)                                  |
| `Via`            | Header for loop detection in distributed operations. The broker adds its own ID to forwarded requests (ETSI GS CIM 009 - 6.3.5) |

#### CSR 変更通知

Context Source Registration が作成、更新、または削除されると、マッチする CSource Subscription の通知エンドポイントに通知が自動的に送信されます (ETSI GS CIM 009 - 5.11)。通知には、変更のタイプを示す `Ngsild-Trigger` ヘッダー (`csourceRegistration-created`、`csourceRegistration-updated`、`csourceRegistration-deleted`) が含まれます。

#### 分散型タイプおよび属性ディスカバリ

`/ngsi-ld/v1/types` および `/ngsi-ld/v1/attributes` エンドポイントは、ローカルエンティティに加えて、Context Source Registration に登録されたエンティティタイプおよび属性を返します (ETSI GS CIM 009 - 5.9.3.3)。

### EntityMap 操作

> **ETSI GS CIM 009 リファレンス**: セクション 5.14 - Entity Map

NGSI-LD EntityMap は、クエリ結果をマップとして保存し、後でエンティティ ID による効率的なアクセスを可能にする機能です。

#### EntityMap 形式でエンティティを取得

`GET /ngsi-ld/v1/entities` のクエリパラメータに `options=entityMap` を指定すると、エンティティ ID をキーとするオブジェクトとしてレスポンスが返されます。

```bash
curl "http://localhost:3000/ngsi-ld/v1/entities?type=Room&options=entityMap" \
  -H "Fiware-Service: myservice"
```

**レスポンス例**:

```json
{
  "urn:ngsi-ld:Room:001": {
    "id": "urn:ngsi-ld:Room:001",
    "type": "Room",
    "temperature": { "type": "Property", "value": 23.5 }
  },
  "urn:ngsi-ld:Room:002": {
    "id": "urn:ngsi-ld:Room:002",
    "type": "Room",
    "temperature": { "type": "Property", "value": 21.0 }
  }
}
```

#### EntityMap を作成

```http
POST /ngsi-ld/v1/entityMaps
Content-Type: application/ld+json
```

**レスポンス**: `201 Created`、`Location` ヘッダーに作成された EntityMap の URL

#### EntityMap リストを取得

```http
GET /ngsi-ld/v1/entityMaps
```

**クエリパラメータ**

| Parameter | Type    | Description                                        |
| --------- | ------- | -------------------------------------------------- |
| `limit`   | integer | Maximum number of results (default: 20, max: 1000) |
| `offset`  | integer | Number of results to skip (default: 0)             |

**レスポンス**: `200 OK`

#### EntityMap を取得

```http
GET /ngsi-ld/v1/entityMaps/{entityMapId}
```

**レスポンス**: `200 OK`

#### EntityMap を更新

```http
PATCH /ngsi-ld/v1/entityMaps/{entityMapId}
Content-Type: application/ld+json
```

**レスポンス**: `204 No Content`

#### EntityMap を削除

```http
DELETE /ngsi-ld/v1/entityMaps/{entityMapId}
```

**レスポンス**: `204 No Content`

### リンクされたエンティティの取得 (join/joinLevel)

エンティティ取得エンドポイント (`GET /ngsi-ld/v1/entities` および `GET /ngsi-ld/v1/entities/{entityId}`) では、`join` および `joinLevel` クエリパラメータを使用して、リンクされたエンティティを取得できます。

| Parameter   | Type    | Description                                                                                              |
| ----------- | ------- | -------------------------------------------------------------------------------------------------------- |
| `join`      | string  | Linked entity retrieval mode: `inline` (nested inside Relationship) or `flat` (appended to result array) |
| `joinLevel` | integer | Depth of linked entity resolution (default: 1)                                                           |

**使用例**

```bash
# inline mode - linked entities are nested inside the Relationship
curl "https://api.example.com/ngsi-ld/v1/entities?type=Room&join=inline&joinLevel=2" \
  -H "Fiware-Service: smartcity"

# flat mode - linked entities are appended to the result array
curl "https://api.example.com/ngsi-ld/v1/entities/urn:ngsi-ld:Room:001?join=flat&joinLevel=1" \
  -H "Fiware-Service: smartcity"
```

### コンテキストソース登録サブスクリプション

NGSI-LD では、コンテキストソース登録サブスクリプション (CSR サブスクリプション) は、コンテキストソース登録への変更を監視するサブスクリプションを管理します。

#### CSR サブスクリプションの作成

```http
POST /ngsi-ld/v1/csourceSubscriptions
Content-Type: application/ld+json
```

**リクエストボディ**

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "type": "Subscription",
  "entities": [{ "type": "Vehicle" }],
  "notification": {
    "endpoint": {
      "uri": "http://example.com/notify"
    }
  }
}
```

**リクエストフィールド**

| Field               | Type    | Required | Description                                      |
| ------------------- | ------- | -------- | ------------------------------------------------ |
| `type`              | string  | ✓        | Fixed: `Subscription`                            |
| `entities`          | array   | ✓        | Target entities to monitor (type, id, idPattern) |
| `notification`      | object  | ✓        | Notification settings (endpoint.uri is required) |
| `description`       | string  | -        | Subscription description                         |
| `watchedAttributes` | array   | -        | List of attributes to monitor                    |
| `expiresAt`         | string  | -        | Expiration time (ISO 8601 format)                |
| `throttling`        | number  | -        | Notification interval (seconds)                  |
| `isActive`          | boolean | -        | Active state (default: true)                     |

**レスポンス**

* ステータス: `201 Created`
  
* ヘッダー: `Location: /ngsi-ld/v1/csourceSubscriptions/{subscriptionId}`

#### CSR サブスクリプションリストの取得

```http
GET /ngsi-ld/v1/csourceSubscriptions
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
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
    "id": "urn:ngsi-ld:CSourceSubscription:sub001",
    "type": "Subscription",
    "entities": [{ "type": "Vehicle" }],
    "notification": {
      "endpoint": { "uri": "http://example.com/notify" }
    },
    "isActive": true
  }
]
```

#### CSR サブスクリプションの取得

```http
GET /ngsi-ld/v1/csourceSubscriptions/{subscriptionId}
```

#### CSR サブスクリプションの更新

```http
PATCH /ngsi-ld/v1/csourceSubscriptions/{subscriptionId}
```

**リクエストボディ**

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "description": "Updated subscription"
}
```

**レスポンス**: `204 No Content`

#### CSR サブスクリプションの削除

```http
DELETE /ngsi-ld/v1/csourceSubscriptions/{subscriptionId}
```

**レスポンス**: `204 No Content`

### JSON-LD コンテキスト管理

ETSI GS CIM 009 Section 5.12 に準拠した JSON-LD コンテキスト管理 API。ユーザー定義の JSON-LD コンテキストの登録と管理を可能にします。

#### JSON-LD コンテキストの登録

```http
POST /ngsi-ld/v1/jsonldContexts
Content-Type: application/json
```

**リクエストボディ**

```json
{
  "@context": {
    "type": "@type",
    "id": "@id",
    "Temperature": "https://example.org/ontology#Temperature"
  }
}
```

**レスポンス**

* ステータス:`201 Created`
  
* ヘッダー:`Location: /ngsi-ld/v1/jsonldContexts/{contextId}`

#### JSON-LD コンテキストリストの取得

```http
GET /ngsi-ld/v1/jsonldContexts
```

**クエリパラメータ**

| Parameter | Type    | Description               | Default |
| --------- | ------- | ------------------------- | ------- |
| `limit`   | integer | Maximum number of results | 20      |
| `offset`  | integer | Number of results to skip | 0       |

**レスポンス**:`200 OK`

#### JSON-LD コンテキストの取得

```http
GET /ngsi-ld/v1/jsonldContexts/{contextId}
```

**キャッシュヘッダー**

レスポンスには以下のキャッシュ関連ヘッダーが含まれます:

| Header          | Description                           |
| --------------- | ------------------------------------- |
| `ETag`          | MD5 hash of the context body          |
| `Last-Modified` | Creation date and time of the context |
| `Cache-Control` | `public, max-age=3600`                |

**条件付きリクエスト**

| Request Header      | Behavior                                                          |
| ------------------- | ----------------------------------------------------------------- |
| `If-None-Match`     | Returns `304 Not Modified` if the ETag matches                    |
| `If-Modified-Since` | Returns `304 Not Modified` if no changes since the specified date |

**レスポンス**:`200 OK` / `304 Not Modified`

#### JSON-LD コンテキストの削除

```http
DELETE /ngsi-ld/v1/jsonldContexts/{contextId}
```

**レスポンス**:`204 No Content`

### Vector Tiles (NGSI-LD)

エンティティデータを GeoJSON ベクタータイルとして提供し、地図の可視化を実現します。TileJSON 3.0 準拠のメタデータと、ズームレベルおよびタイル座標による GeoJSON タイルの取得をサポートします。

#### TileJSON メタデータの取得

```http
GET /ngsi-ld/v1/tiles
```

**レスポンス**: `200 OK` (TileJSON 3.0 形式)

#### GeoJSON タイルの取得

```http
GET /ngsi-ld/v1/tiles/{z}/{x}/{y}.geojson
```

**パスパラメータ**

| Parameter | Type    | Description       |
| --------- | ------- | ----------------- |
| `z`       | integer | Zoom level        |
| `x`       | integer | Tile X coordinate |
| `y`       | integer | Tile Y coordinate |

**クエリパラメータ**

| Parameter | Type    | Description                                        |
| --------- | ------- | -------------------------------------------------- |
| `type`    | string  | Entity type filter                                 |
| `attrs`   | string  | Attributes to retrieve (comma-separated)           |
| `q`       | string  | Attribute filter using NGSI-LD query language      |
| `limit`   | integer | Maximum number of results (default: 20, max: 1000) |
| `offset`  | integer | Number of results to skip (default: 0)             |

**レスポンス**: `200 OK` (GeoJSON FeatureCollection 形式)

***

## HTTP キャッシュコントロール

NGSI-LD GET エンドポイントは、エンドポイントクラスごとにキャッシュ関連のヘッダーを返します:

### データエンドポイント (entities、subscriptions、csourceRegistrations、csourceSubscriptions) — RFC 7232 + RFC 7234 完全サポート

| Header          | Value                                                                  | Purpose                                                                                                                                                                                                                                                                                                                                                     |
| --------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ETag`          | `W/"..."`                                                              | Weak validator. Generation seeds include `path + Accept + tenant + Fiware-ServicePath` (tenant = `NGSILD-Tenant` ?? `Fiware-Service`) so distinct endpoints / Accept / tenants / service paths always produce distinct ETags. Lists: streaming digest of `id + modifiedAt` mixed with total count and scope. Single: hash of `modifiedAt` mixed with scope. |
| `Last-Modified` | RFC 1123 HTTP-date                                                     | Timestamp of the latest `modifiedAt` in the result set.                                                                                                                                                                                                                                                                                                     |
| `Cache-Control` | `private, no-cache`                                                    | `private` blocks shared / intermediate cache storage; `no-cache` forces revalidation from the private cache.                                                                                                                                                                                                                                                |
| `Vary`          | `Fiware-Service, Fiware-ServicePath, Authorization, X-Api-Key, Accept` | Tenant + auth + content-negotiation isolation for shared caches.                                                                                                                                                                                                                                                                                            |

条件付きリクエストがサポートされています:

| Request Header                   | Behavior                                                 |
| -------------------------------- | -------------------------------------------------------- |
| `If-None-Match: <ETag>`          | Returns `304 Not Modified` (empty body) if matched.      |
| `If-Modified-Since: <HTTP-date>` | Returns `304` if the resource is unchanged.              |
| `Cache-Control: no-store`        | Server overrides response `Cache-Control` to `no-store`. |

### メタエンドポイント (types、attributes) — Cache-Control + Vary のみ (ETag なし / 304 なし)

| Header          | Value                                                                  | Purpose                                          |
| --------------- | ---------------------------------------------------------------------- | ------------------------------------------------ |
| `Cache-Control` | `max-age=60, stale-while-revalidate=120`                               | Short-term caching with background revalidation. |
| `Vary`          | `Fiware-Service, Fiware-ServicePath, Authorization, X-Api-Key, Accept` | Same tenant/auth isolation as data endpoints.    |

メタエンドポイントは `ETag` / `Last-Modified` を返さず、`If-None-Match` / `If-Modified-Since` 条件付きリクエストをサポートしません。クライアントは代わりに `max-age` / `stale-while-revalidate` ディレクティブに依存する必要があります。

> **注**: `/ngsi-ld/v1/jsonldContexts/{contextId}` には、追加のコンテキスト固有のキャッシュセマンティクスがあります — 上記の JSON-LD Context Management セクションを参照してください。

完全なセマンティクスについては、[API.md §HTTP Cache Control](./endpoints.md#http-cache-control-etag--conditional-requests) を参照してください。

***

## エンドポイント一覧

ETSI NGSI-LD 互換の Context Broker API。

### 共通仕様


* **Content-Type**: `application/ld+json` または `application/json`
  
* **認証**: `AUTH_ENABLED=true` の場合は必須
  
* **テナント分離**: `NGSILD-Tenant` または `Fiware-Service` ヘッダー
  
* **ページネーション**: `limit`/`offset` パラメータ、総数は常に `NGSILD-Results-Count` ヘッダー経由で返されます
  
* **OPTIONS メソッド**: すべての NGSI-LD エンドポイントは OPTIONS メソッドをサポートします。`Allow` および `Accept-Patch` ヘッダーを含む 204 レスポンスを返します
  
* **405 Method Not Allowed**: 許可されていない HTTP メソッドに対して 405 レスポンスを返します (RFC 7807 ProblemDetails 形式、`Allow` ヘッダー付き)
  
* **エラー形式**: NGSI-LD エラーレスポンスは RFC 7807 ProblemDetails 形式 (`application/json`) で返されます

### エンティティ操作

| Endpoint                                           | Method | Description                       | Success | Error              | Pagination    |
| -------------------------------------------------- | ------ | --------------------------------- | ------- | ------------------ | ------------- |
| `/ngsi-ld/v1/entities`                             | GET    | Retrieve entity list              | 200     | 400, 401           | ✅ (max: 1000) |
| `/ngsi-ld/v1/entities`                             | POST   | Create entity                     | 201     | 400, 401, 409, 415 | -             |
| `/ngsi-ld/v1/entities/{entityId}`                  | GET    | Retrieve entity                   | 200     | 400, 401, 404      | -             |
| `/ngsi-ld/v1/entities/{entityId}`                  | PUT    | Replace entity                    | 204     | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/entities/{entityId}`                  | PATCH  | Update entity (merge patch)       | 204     | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/entities/{entityId}`                  | POST   | Add attributes                    | 204/207 | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/entities/{entityId}`                  | DELETE | Delete entity                     | 204     | 401, 404           | -             |
| `/ngsi-ld/v1/entities/{entityId}/attrs`            | GET    | Retrieve all attributes of entity | 200     | 401, 404           | -             |
| `/ngsi-ld/v1/entities/{entityId}/attrs`            | POST   | Add attributes                    | 204     | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/entities/{entityId}/attrs`            | PATCH  | Partial attribute update          | 204/207 | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}` | GET    | Retrieve single attribute         | 200     | 401, 404           | -             |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}` | POST   | Replace attribute                 | 204     | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}` | PUT    | Replace attribute                 | 204     | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}` | PATCH  | Partial attribute update          | 204     | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}` | DELETE | Delete attribute                  | 204     | 401, 404           | -             |

### タイプ操作

| Endpoint                       | Method | Description                  | Success | Error    | Pagination    |
| ------------------------------ | ------ | ---------------------------- | ------- | -------- | ------------- |
| `/ngsi-ld/v1/types`            | GET    | Retrieve entity type list    | 200     | 400, 401 | ✅ (max: 1000) |
| `/ngsi-ld/v1/types/{typeName}` | GET    | Retrieve entity type details | 200     | 401, 404 | -             |

### 属性操作

| Endpoint                            | Method | Description                | Success | Error    | Pagination    |
| ----------------------------------- | ------ | -------------------------- | ------- | -------- | ------------- |
| `/ngsi-ld/v1/attributes`            | GET    | Retrieve attribute list    | 200     | 400, 401 | ✅ (max: 1000) |
| `/ngsi-ld/v1/attributes/{attrName}` | GET    | Retrieve attribute details | 200     | 401, 404 | -             |

### サブスクリプション操作

| Endpoint                                     | Method | Description           | Success | Error              | Pagination    |
| -------------------------------------------- | ------ | --------------------- | ------- | ------------------ | ------------- |
| `/ngsi-ld/v1/subscriptions`                  | GET    | Subscription list     | 200     | 400, 401           | ✅ (max: 1000) |
| `/ngsi-ld/v1/subscriptions`                  | POST   | Create subscription   | 201     | 400, 401, 415      | -             |
| `/ngsi-ld/v1/subscriptions/{subscriptionId}` | GET    | Retrieve subscription | 200     | 401, 404           | -             |
| `/ngsi-ld/v1/subscriptions/{subscriptionId}` | PATCH  | Update subscription   | 204     | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/subscriptions/{subscriptionId}` | DELETE | Delete subscription   | 204     | 401, 404           | -             |

### コンテキストソース登録操作 (フェデレーション)

| Endpoint                                            | Method | Description           | Success | Error              | Pagination    |
| --------------------------------------------------- | ------ | --------------------- | ------- | ------------------ | ------------- |
| `/ngsi-ld/v1/csourceRegistrations`                  | GET    | Registration list     | 200     | 400, 401           | ✅ (max: 1000) |
| `/ngsi-ld/v1/csourceRegistrations`                  | POST   | Create registration   | 201     | 400, 401, 415      | -             |
| `/ngsi-ld/v1/csourceRegistrations/{registrationId}` | GET    | Retrieve registration | 200     | 401, 404           | -             |
| `/ngsi-ld/v1/csourceRegistrations/{registrationId}` | PATCH  | Update registration   | 204     | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/csourceRegistrations/{registrationId}` | DELETE | Delete registration   | 204     | 401, 404           | -             |

### コンテキストソース登録サブスクリプション操作

| Endpoint                                            | Method | Description               | Success | Error              | Pagination    |
| --------------------------------------------------- | ------ | ------------------------- | ------- | ------------------ | ------------- |
| `/ngsi-ld/v1/csourceSubscriptions`                  | GET    | CSR subscription list     | 200     | 400, 401           | ✅ (max: 1000) |
| `/ngsi-ld/v1/csourceSubscriptions`                  | POST   | Create CSR subscription   | 201     | 400, 401, 415      | -             |
| `/ngsi-ld/v1/csourceSubscriptions/{subscriptionId}` | GET    | Retrieve CSR subscription | 200     | 401, 404           | -             |
| `/ngsi-ld/v1/csourceSubscriptions/{subscriptionId}` | PATCH  | Update CSR subscription   | 204     | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/csourceSubscriptions/{subscriptionId}` | DELETE | Delete CSR subscription   | 204     | 401, 404           | -             |

### 分散操作情報

| Endpoint                          | Method | Description                              | Success | Error |
| --------------------------------- | ------ | ---------------------------------------- | ------- | ----- |
| `/ngsi-ld/v1/info/sourceIdentity` | GET    | Retrieve broker identity                 | 200     | -     |
| `/ngsi-ld/v1/info/conformance`    | GET    | Retrieve NGSI-LD conformance information | 200     | -     |

### JSON-LD コンテキスト管理

| Endpoint                                 | Method | Description              | Success | Error              | Pagination    |
| ---------------------------------------- | ------ | ------------------------ | ------- | ------------------ | ------------- |
| `/ngsi-ld/v1/jsonldContexts`             | GET    | JSON-LD context list     | 200     | 400, 401           | ✅ (max: 1000) |
| `/ngsi-ld/v1/jsonldContexts`             | POST   | Register JSON-LD context | 201     | 400, 401, 409, 415 | -             |
| `/ngsi-ld/v1/jsonldContexts/{contextId}` | GET    | Retrieve JSON-LD context | 200     | 401, 404           | -             |
| `/ngsi-ld/v1/jsonldContexts/{contextId}` | DELETE | Delete JSON-LD context   | 204     | 401, 404           | -             |

### EntityMap 操作

| Endpoint                               | Method | Description             | Success | Error              | Pagination    |
| -------------------------------------- | ------ | ----------------------- | ------- | ------------------ | ------------- |
| `/ngsi-ld/v1/entityMaps`               | GET    | Retrieve EntityMap list | 200     | 400, 401           | ✅ (max: 1000) |
| `/ngsi-ld/v1/entityMaps`               | POST   | Create EntityMap        | 201     | 400, 401, 415      | -             |
| `/ngsi-ld/v1/entityMaps/{entityMapId}` | GET    | Retrieve EntityMap      | 200     | 401, 404           | -             |
| `/ngsi-ld/v1/entityMaps/{entityMapId}` | PATCH  | Update EntityMap        | 204     | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/entityMaps/{entityMapId}` | DELETE | Delete EntityMap        | 204     | 401, 404           | -             |

### スナップショット操作

| Endpoint                                   | Method | Description              | Success | Error         | Pagination    |
| ------------------------------------------ | ------ | ------------------------ | ------- | ------------- | ------------- |
| `/ngsi-ld/v1/snapshots`                    | GET    | Retrieve snapshot list   | 200     | 400, 401      | ✅ (max: 1000) |
| `/ngsi-ld/v1/snapshots`                    | POST   | Create snapshot          | 201     | 400, 401, 415 | -             |
| `/ngsi-ld/v1/snapshots`                    | DELETE | Purge all snapshots      | 200     | 401           | -             |
| `/ngsi-ld/v1/snapshots/{snapshotId}`       | GET    | Retrieve snapshot        | 200     | 401, 404      | -             |
| `/ngsi-ld/v1/snapshots/{snapshotId}`       | PATCH  | Update snapshot status   | 204     | 400, 401, 404 | -             |
| `/ngsi-ld/v1/snapshots/{snapshotId}`       | DELETE | Delete snapshot          | 204     | 401, 404      | -             |
| `/ngsi-ld/v1/snapshots/{snapshotId}/clone` | POST   | Clone snapshot (restore) | 200     | 400, 401, 404 | -             |

### バッチ操作

| Endpoint                              | Method | Description                   | Success | Error         | Pagination    |
| ------------------------------------- | ------ | ----------------------------- | ------- | ------------- | ------------- |
| `/ngsi-ld/v1/entityOperations/create` | POST   | Batch create (max: 1000)      | 200/201 | 400, 401, 415 | -             |
| `/ngsi-ld/v1/entityOperations/upsert` | POST   | Batch upsert (max: 1000)      | 200/201 | 400, 401, 415 | -             |
| `/ngsi-ld/v1/entityOperations/update` | POST   | Batch update (max: 1000)      | 200/204 | 400, 401, 415 | -             |
| `/ngsi-ld/v1/entityOperations/delete` | POST   | Batch delete (max: 1000)      | 200/204 | 400, 401, 415 | -             |
| `/ngsi-ld/v1/entityOperations/query`  | POST   | Batch query                   | 200     | 400, 401, 415 | ✅ (max: 1000) |
| `/ngsi-ld/v1/entityOperations/merge`  | POST   | Batch merge patch (max: 1000) | 204/207 | 400, 401, 415 | -             |
| `/ngsi-ld/v1/entityOperations/purge`  | POST   | Bulk entity purge             | 204     | 400, 401, 415 | -             |

### Temporal API (時系列データ)

| Endpoint                                                                 | Method | Description                         | Success | Error              | Pagination    |
| ------------------------------------------------------------------------ | ------ | ----------------------------------- | ------- | ------------------ | ------------- |
| `/ngsi-ld/v1/temporal/entities`                                          | GET    | Retrieve temporal entity list       | 200     | 400, 401           | ✅ (max: 1000) |
| `/ngsi-ld/v1/temporal/entities`                                          | POST   | Create temporal entity              | 201     | 400, 401, 409, 415 | -             |
| `/ngsi-ld/v1/temporal/entities/{entityId}`                               | GET    | Retrieve temporal entity            | 200     | 400, 401, 404      | -             |
| `/ngsi-ld/v1/temporal/entities/{entityId}`                               | PATCH  | Merge attributes of temporal entity | 204     | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/temporal/entities/{entityId}`                               | DELETE | Delete temporal entity              | 204     | 401, 404           | -             |
| `/ngsi-ld/v1/temporal/entities/{entityId}/attrs`                         | POST   | Add attribute instance              | 204     | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/temporal/entities/{entityId}/attrs/{attrName}`              | DELETE | Delete attribute instance           | 204     | 401, 404           | -             |
| `/ngsi-ld/v1/temporal/entities/{entityId}/attrs/{attrName}/{instanceId}` | PATCH  | Modify attribute instance           | 204     | 400, 401, 404      | -             |
| `/ngsi-ld/v1/temporal/entityOperations/create`                           | POST   | Temporal batch create (max: 1000)   | 201/207 | 400, 401, 415      | -             |
| `/ngsi-ld/v1/temporal/entityOperations/upsert`                           | POST   | Temporal batch upsert (max: 1000)   | 204/207 | 400, 401, 415      | -             |
| `/ngsi-ld/v1/temporal/entityOperations/delete`                           | POST   | Temporal batch delete               | 204/207 | 400, 401, 415      | -             |
| `/ngsi-ld/v1/temporal/entityOperations/query`                            | POST   | Temporal batch query                | 200     | 400, 401, 415      | ✅ (max: 1000) |

### ベクタータイル操作

| Endpoint                                | Method | Description                    | Success | Error    | Pagination    |
| --------------------------------------- | ------ | ------------------------------ | ------- | -------- | ------------- |
| `/ngsi-ld/v1/tiles`                     | GET    | Retrieve TileJSON 3.0 metadata | 200     | 401      | -             |
| `/ngsi-ld/v1/tiles/{z}/{x}/{y}.geojson` | GET    | Retrieve GeoJSON tile          | 200     | 400, 401 | ✅ (max: 1000) |
