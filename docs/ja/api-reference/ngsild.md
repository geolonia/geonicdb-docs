---
title: "NGSI-LD API"
description: "NGSI-LD API reference"
outline: deep
---
# NGSI-LD API

> この文書は [API.md](./endpoints.md) から分離されました。メインの API 仕様については [API.md](./endpoints.md) を参照してください。

---

NGSI-LD は JSON-LD ベースのコンテキスト情報管理 API です。

> **注意:** NGSI-LD API は ETSI GS CIM 009 仕様に従い、`Fiware-ServicePath` ヘッダーを無視します。階層は `scope` エンティティプロパティと `scopeQ` クエリパラメータで管理されます。`servicePath` と `scope` は独立した概念であり、自動的には同期されません ([INTEROPERABILITY.md](../core-concepts/ngsiv2-vs-ngsild.md#3-scope-scope-hierarchy) を参照)。
>
> **注意:** NGSIv2 と NGSI-LD のエンティティは完全に分離されています。NGSIv2 で作成されたエンティティは NGSI-LD から見えず、逆も同様です (各エンティティの `protocol` フィールド、#964)。

## 仕様準拠

この文書は **[ETSI GS CIM 009 V1.9.1 (2025-07)](https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/01.09.01_60/gs_CIM009v010901p.pdf)** に準拠しています。各機能の詳細については、以下の ETSI 仕様セクションを参照してください:

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
| `application/ld+json` | JSON-LD | `@context` はレスポンスボディに含まれます |
| `application/json` | JSON | `@context` は `Link` ヘッダーで返されます |
| `application/geo+json` | GeoJSON | `@context` は `Link` ヘッダーで返されます |

`Accept: application/json` の場合、レスポンスには `Link` ヘッダーが含まれます:

```http
Link: <https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"
```





### 自然言語照合 (lang + orderBy)

`lang` パラメータと `orderBy` を組み合わせることで、指定された言語のロケールに基づいて結果をソートできます。例えば、`lang=ja` は日本語の照合順序を適用してソートします。### エンティティ操作 (NGSI-LD)

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

| パラメータ | 型 | 説明 | デフォルト |
|-----------|-----|------|-----------|
| `id` | string | エンティティ ID でフィルタ (複数の場合はカンマ区切り、URI 形式) | - |
| `limit` | integer | 取得する結果の数 | 20 |
| `offset` | integer | オフセット | 0 |
| `orderBy` | string | ソート基準 (`entityId`、`entityType`、`modifiedAt`) | - |
| `orderDirection` | string | ソート方向 (`asc`、`desc`) | `asc` |
| `type` | string | エンティティタイプでフィルタ | - |
| `idPattern` | string | エンティティ ID の正規表現パターン | - |
| `q` | string | 属性値でフィルタ | - |
| `attrs` | string | 取得する属性名 (カンマ区切り) | - |
| `pick` | string | 取得する属性名 (カンマ区切り、`omit` と排他的) | - |
| `omit` | string | 除外する属性名 (カンマ区切り、`pick` と排他的、`id`/`type` は不可) | - |
| `scopeQ` | string | スコープクエリ (例: `/Madrid`、`/Madrid/#`、`/Madrid/+`) | - |
| `lang` | string | LanguageProperty の言語フィルタ (BCP 47、カンマ区切りの優先順位、全言語は `*`) | - |
| `georel` | string | ジオクエリ演算子 | - |
| `geometry` | string | ジオメトリタイプ | - |
| `coordinates` | string | 座標 | - |
| `spatialId` | string | 空間 ID でフィルタ (ZFXY 形式) ([空間 ID 検索](./endpoints.md#spatial-id-search)を参照) | - |
| `spatialIdDepth` | integer | 空間 ID 階層展開の深さ (0-4) | 0 |
| `crs` | string | 座標参照系 ([座標参照系 (CRS)](./endpoints.md#coordinate-reference-system-crs)を参照)。URN 形式も受け付け可能 | `EPSG:4326` |
| `geoproperty` | string | ジオクエリに使用する GeoProperty 名 | `location` |
| `format` | string | 出力形式 (keyValues 形式は `simplified`、GeoJSON 形式は `geojson`)。GeoJSON は `Accept: application/geo+json` ヘッダーでも指定可能 | - |
| `expandValues` | string | 展開する属性名 (カンマ区切り、展開された値を返す) | - |
| `options` | string | `keyValues`、`concise`、`entityMap`、`sysAttrs` (システム属性を出力)、`splitEntities` (タイプ別にレスポンスを分割) | - |

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















# 一時的エンティティ (expiresAt)

エンティティに `expiresAt` フィールド (ISO 8601 形式) を指定することで、有効期限付きの一時的エンティティとして作成されます。有効期限は未来の日時である必要があります。

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
- ステータス: `201 Created`- ステータス: `409 AlreadyExists` 同じ ID のエンティティが既に存在する場合 (タイプに関係なく)
- ヘッダー: `Location: /ngsi-ld/v1/entities/urn:ngsi-ld:Room:001`> **注意**: エンティティ ID はテナントとServicePathのスコープ内で一意です。同じ ID で異なるタイプのエンティティを作成すると `409 AlreadyExists` が返されます。詳細は [エンティティ ID の一意性](./endpoints.md#entity-id-uniqueness-geonicdb-extension) を参照してください。

#### 単一エンティティの取得

```http
GET /ngsi-ld/v1/entities/{entityId}
```



**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `type` | string | エンティティタイプ |
| `attrs` | string | 取得する属性名 (カンマ区切り) |
| `pick` | string | 取得する属性名 (カンマ区切り、`omit` と相互排他) |
| `omit` | string | 除外する属性名 (カンマ区切り、`pick`、`id`/`type` と相互排他、使用不可) |
| `lang` | string | LanguageProperty の言語フィルタ (BCP 47) |
| `options` | string | `keyValues`、`concise`、`entityMap` |

#### エンティティの置換

```http
PUT /ngsi-ld/v1/entities/{entityId}
```



エンティティのすべての属性を置き換えます。リクエストボディに含まれない属性は削除されます。

**レスポンス**: `204 No Content`#### エンティティの更新

```http
PATCH /ngsi-ld/v1/entities/{entityId}
```



**Merge-Patch セマンティクス** (ETSI GS CIM 009 Section 5.6.4):

- `Content-Type: application/merge-patch+json` を使用すると、リクエストボディに含まれない属性は保持されます (マージモード)。標準の `application/json` / `application/ld+json` では、すべての属性が置き換えられます。
- プロパティ値として `urn:ngsi-ld:null` を指定すると、その属性が削除されます。
- クエリパラメータ `options=keyValues` または `options=concise` を指定することで、簡易的な入力形式を使用できます。

**レスポンス**: `204 No Content`#### 属性の追加

```http
POST /ngsi-ld/v1/entities/{entityId}
Content-Type: application/ld+json
```




**クエリパラメータ**

| パラメータ | 説明 |
|-----------|------|
| `options=noOverwrite` | 既存の属性を上書きしない (既存の属性は保持され、新しい属性のみが追加されます) |

**レスポンス**: `204 No Content`#### 複数属性の部分更新

```http
PATCH /ngsi-ld/v1/entities/{entityId}/attrs
Content-Type: application/ld+json
```




エンティティの複数の属性を部分的に更新します。リクエストボディに含まれる属性のみが更新され、含まれない属性は保持されます。

**リクエストボディ**

```json
{
  "temperature": {
    "type": "Property",
    "value": 25.0
  }
}
```







**レスポンス**: `204 No Content`#### エンティティの削除

```http
DELETE /ngsi-ld/v1/entities/{entityId}
```





**レスポンス**: `204 No Content`#### エンティティの全属性の取得

```http
GET /ngsi-ld/v1/entities/{entityId}/attrs
```





エンティティの全属性を取得します。

**レスポンス**: `200 OK`#### 単一属性の取得

```http
GET /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
```





エンティティの特定の属性を取得します。

**レスポンス**: `200 OK`#### 属性の上書き (PUT)

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











**レスポンス**: `204 No Content`#### 属性の置換

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











**レスポンス**: `204 No Content`#### 属性の部分更新

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











**レスポンス**: `204 No Content`> **注意**: エンティティまたは属性が存在しない場合、`404 Not Found` が返されます (ETSI GS CIM 009 V1.9.1 clause 5.6.4)。この操作は既存の属性の部分更新のみを行い、新しい属性は作成しません。

#### 属性の削除

```http
DELETE /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
```


**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `datasetId` | string | 削除するマルチ属性インスタンスの datasetId |
| `deleteAll` | boolean | `true` の場合、すべてのインスタンスを削除 |

**レスポンス**: `204 No Content`### Multi-Attribute (datasetId)

> **ETSI GS CIM 009 Reference**: Section 4.5.3 - Multi-Attribute

NGSI-LD では、同じ属性名に対して複数のインスタンスを保持できます。各インスタンスは `datasetId` (URI 形式) によって区別されます。`datasetId` を持たないインスタンスは「デフォルトインスタンス」と呼ばれ、属性ごとに最大1つまで存在できます。

#### 作成 (CREATE)

エンティティを作成する際、配列形式で属性を指定することで、複数のインスタンスを作成できます。

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













































上記の例では、`speed` 属性に対して3つのインスタンスがあります: GPS からのもの、OBD からのもの、そしてデフォルトインスタンスです。

#### 取得 (RETRIEVE)

エンティティを取得する際、マルチ属性は配列形式で返されます。`keyValues` 形式では、デフォルトインスタンス (`datasetId` なし) の値のみが返されます。

#### 更新 (UPDATE)

属性を更新する際 (PATCH/POST)、`datasetId` を指定することで、特定のインスタンスのみを更新できます。

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

属性を削除する際、`datasetId` クエリパラメータを指定すると、特定のインスタンスのみが削除されます。`deleteAll=true` を指定すると、すべてのインスタンスが削除されます。

```http
DELETE /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}?datasetId=urn:ngsi-ld:dataset:gps
DELETE /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}?deleteAll=true
```







---### バッチ操作 (NGSI-LD)

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
- すべて成功: `201 Created`- 一部成功: `207 Multi-Status`#### バッチアップサート

```http
POST /ngsi-ld/v1/entityOperations/upsert
```





**クエリパラメータ**

| パラメータ | 説明 |
|-----------|------|
| `options=replace` | 既存エンティティのすべての属性を置き換える |

**レスポンス**
- すべて成功: `201 Created` (新規作成) または `204 No Content` (更新)
- 一部成功: `207 Multi-Status`#### バッチ更新

```http
POST /ngsi-ld/v1/entityOperations/update
```





**レスポンス**
- すべて成功: `204 No Content`- 一部成功: `207 Multi-Status`#### バッチ削除

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
- すべて成功: `204 No Content`- 一部成功: `207 Multi-Status`#### エンティティパージ

```http
POST /ngsi-ld/v1/entityOperations/purge
Content-Type: application/json
```







指定されたタイプのエンティティを一括削除します。ETSI NGSI-LD 仕様セクション 5.6.14 に準拠しています。

**クエリパラメータ**

| パラメータ | タイプ | 説明 |
|-----------|-----|------|
| `type` | string | 削除するエンティティタイプ (必須) |**レスポンス**
- 成功: `204 No Content`- タイプが指定されていない: `400 Bad Request`#### バッチクエリ

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

#### バッチマージ

```http
POST /ngsi-ld/v1/entityOperations/merge
Content-Type: application/ld+json
```







Merge-Patch セマンティクスを使用して、複数のエンティティに対して一括更新を実行します。既存の属性はマージされ、リクエストに含まれていない属性は保持されます。`urn:ngsi-ld:null` を値として指定すると、その属性が削除されます。

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

| パラメータ | 説明 |
|-----------|------|
| `options=noOverwrite` | 既存の属性を上書きしない |

**レスポンス**
- すべて成功: `204 No Content`- 一部成功: `207 Multi-Status`---### 時系列バッチ操作 (NGSI-LD)

> **ETSI GS CIM 009 リファレンス**: セクション 5.6.12-5.6.19 - エンティティの時系列表現

時系列エンティティのバッチ操作。1 リクエストあたり最大 **1,000** エンティティを処理できます。

> **注意**: 時系列 entityOperations の create / upsert / delete は ETSI GS CIM 009 仕様には含まれない GeonicDB の拡張機能です。query のみが仕様に準拠しています。これらの拡張機能は時系列データの一括取り込みの効率を向上させるために提供されています。

#### 時系列バッチ作成

```http
POST /ngsi-ld/v1/temporal/entityOperations/create
Content-Type: application/ld+json
```







時系列エンティティを一括作成します。リクエストボディは時系列エンティティの配列です。

**レスポンス**: すべて成功時は `201 Created`、部分的な失敗時は `207 Multi-Status`#### 時系列バッチアップサート

```http
POST /ngsi-ld/v1/temporal/entityOperations/upsert
Content-Type: application/ld+json
```







時系列エンティティを一括作成または更新します(既存のエンティティに属性を追加)。

**レスポンス**: すべて成功時は `204 No Content`、部分的な失敗時は `207 Multi-Status`#### 時系列バッチ削除

```http
POST /ngsi-ld/v1/temporal/entityOperations/delete
Content-Type: application/ld+json
```







時系列エンティティを一括削除します。リクエストボディはエンティティ ID の配列です。

**レスポンス**: すべて成功時は `204 No Content`、部分的な失敗時は `207 Multi-Status`#### 時系列バッチクエリ

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

以下のクエリパラメータは時系列エンティティの GET エンドポイントで使用できます。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `timerel` | string | 時間関係演算子 (`after`、`before`、`between`) |
| `timeAt` | string | 基準時刻 (ISO 8601 形式) |
| `endTimeAt` | string | 終了時刻 (`timerel=between` の場合必須、ISO 8601 形式) |
| `lastN` | integer | 最新の N インスタンスのみを返す (正の整数、ETSI GS CIM 009 セクション 5.6.12) |
| `options` | string | `temporalValues`: 簡略化された時系列表現 |

**lastN パラメータ**

`lastN` を指定すると、時系列データの最新 N インスタンスのみが返されます。`timerel`/`timeAt` と組み合わせることで、時間範囲内の最新 N インスタンスを取得できます。

```bash
# Retrieve the latest 10 temporal data instances
curl "http://localhost:3000/ngsi-ld/v1/temporal/entities/urn:ngsi-ld:Sensor:001?lastN=10" \
  -H "Fiware-Service: myservice"
```









#### 時系列レスポンス形式オプション

`options=temporalValues` を指定すると、各属性が `values` 配列 (`[value, timestamp]` のペア) を持つ簡略化された形式で返されます。

**例**: `GET /ngsi-ld/v1/temporal/entities/{entityId}?options=temporalValues````json
{
  "id": "urn:ngsi-ld:Sensor:1",
  "type": "Sensor",
  "temperature": {
    "type": "Property",
    "values": [[20.5, "2024-01-01T10:00:00Z"], [21.0, "2024-01-01T11:00:00Z"]]
  }
}
```









#### 時系列集約クエリ（単一エンティティ）

集約クエリは、時系列エンティティの GET エンドポイントで `aggrMethods` および `aggrPeriodDuration` クエリパラメータを使用して実行できます。リスト取得エンドポイントと単一エンティティ取得エンドポイントの両方で利用可能です。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `aggrMethods` | string | 集約メソッド（カンマ区切り）： `totalCount`、`distinctCount`、`sum`、`avg`、`min`、`max`、`stddev`、`sumsq` |
| `aggrPeriodDuration` | string | ISO 8601 期間（例： `PT1H` は 1 時間）。`aggrMethods` が指定された場合は必須 |

**例**： `GET /ngsi-ld/v1/temporal/entities/{entityId}?aggrMethods=avg&aggrPeriodDuration=PT1H&timerel=after&timeAt=2024-01-01T00:00:00Z````json
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































> **注意**： `aggrPeriodDuration` なしで `aggrMethods` を指定すると、`400 Bad Request` エラーが返されます。

> **注意**： 集約クエリは**暗号化されたテナントではサポートされていません**（`encryptionEnabled: true` が設定されたテナント）。属性値が保存時に暗号化されているため、MongoDB の集約パイプラインは暗号化されたデータに対して数値演算を実行できません。暗号化されたテナントで集約をリクエストすると `400 Bad Request` が返されます。`temporalValues` エンドポイントを使用して復号化された値を取得し、アプリケーション層で集約を実行してください。

---### エンティティタイプ操作 (NGSI-LD)

#### タイプリストの取得

```http
GET /ngsi-ld/v1/types
```





**パラメータ**: `limit`、`offset`**レスポンス** (200):
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





















**ヘッダー**: 総数は `NGSILD-Results-Count` 経由で返されます

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































**エラー**: 404 (タイプが存在しない場合)

### 属性操作 (NGSI-LD)

#### 属性リストの取得

```http
GET /ngsi-ld/v1/attributes
```





**パラメータ**: `limit`、`offset`**レスポンス** (200):
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





















**ヘッダー**: 総数は `NGSILD-Results-Count` 経由で返されます

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

---### サブスクリプション (NGSI-LD)

> **ETSI GS CIM 009 リファレンス**: セクション 5.8 - Subscription Operations

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

NGSI-LD では、エンドポイント URI に `mqtt://` または `mqtts://` スキームを使用し、トピックをパスとして指定します。MQTT 固有の設定は `notifierInfo` で指定します。

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

| キー | 値 | 説明 |
|-----|-----|------|
| `MQTT-Version` | `mqtt3.1.1` または `mqtt5.0` | MQTT プロトコルバージョン |
| `MQTT-QoS` | `0`、`1`、または `2` | QoS レベル |

**サブスクリプション拡張フィールド**

| フィールド | タイプ | 説明 |
|-----------|-----|------|
| `cooldown` | integer | 通知間の最小間隔(秒)。正の整数のみ。指定された秒数内では再通知しません |
| `notificationTrigger` | string[] | 通知をトリガーするイベントタイプ。`entityCreated`、`entityUpdated`、`entityChanged`、`entityDeleted`、`attributeCreated`、`attributeUpdated`、`attributeDeleted`。`entityChanged` は属性値が実際に変更された場合にのみトリガーされます(同じ値での更新は無視されます) |
| `showChanges` | boolean | `true` の場合、通知データに以前の属性値を `previousValue` として含めます |
| `notification.onlyChangedAttrs` | boolean | `true` の場合、通知ペイロードに実際に変更された属性のみを含めます。`notification.attributes` と組み合わせることができます |
| `expiresAt` | string (ISO 8601) | サブスクリプションの有効期限 |

**検証**
- `watchedAttributes` と `timeInterval` は相互排他的です。両方を同時に指定すると `400 Bad Request` が返されます(ETSI GS CIM 009 V1.9.1 clause 5.8.1)

**レスポンス**
- ステータス: `201 Created`- ヘッダー: `Location: /ngsi-ld/v1/subscriptions/{subscriptionId}`#### サブスクリプション一覧

```http
GET /ngsi-ld/v1/subscriptions
```





**クエリパラメータ**

| パラメータ | タイプ | 説明 | デフォルト |
|-----------|-----|------|-----------|
| `limit` | integer | 取得する結果の数 | 20 |
| `offset` | integer | オフセット | 0 |

#### サブスクリプションの取得

```http
GET /ngsi-ld/v1/subscriptions/{subscriptionId}
```


**通知ステータスフィールド (読み取り専用)**

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `notification.status` | string | `ok` または `failed` |
| `notification.lastNotification` | string | 最後に通知を送信した日時 (ISO 8601) |
| `notification.lastFailure` | string | 最後に通知が失敗した日時 (ISO 8601) |
| `notification.lastFailureReason` | string | 最後の失敗の理由 (例: `HTTP 500: Internal Server Error`)。成功時にクリアされる |
| `notification.lastSuccess` | string | 最後に通知が成功した日時 (ISO 8601) |
| `notification.timesSent` | integer | 送信された通知の数 |

**リトライ動作**: 通知配信が失敗した場合、一時的なエラー (5xx、ネットワークエラー) に対して、指数バックオフ (1 秒、2 秒、4 秒) により最大 3 回のリトライが実行されます。4xx エラーに対してはリトライは実行されません。

#### サブスクリプションの更新

```http
PATCH /ngsi-ld/v1/subscriptions/{subscriptionId}
```





**レスポンス**: `204 No Content`#### サブスクリプションの削除

```http
DELETE /ngsi-ld/v1/subscriptions/{subscriptionId}
```





**レスポンス**: `204 No Content`#### 所有権検証 (GeonicDB 拡張)

認証が有効な場合 (`AUTH_ENABLED=true`)、サブスクリプションの更新 (PATCH) と削除 (DELETE) 操作は `createdBy` フィールドに基づいて所有権検証を実行します。作成者以外のユーザーがこれらの操作を試みると `403 Forbidden` を受け取ります。`super_admin` および `tenant_admin` ロールはこの検証をバイパスできます。詳細については、AUTH.md を参照してください。

---### 登録 (NGSI-LD)

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

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `type` | string | ✓ | 固定: `ContextSourceRegistration` |
| `registrationName` | string | - | 登録名 |
| `description` | string | - | 登録の説明 |
| `endpoint` | string | ✓ | プロバイダーのエンドポイント URL |
| `information` | array | ✓ | 提供される情報 (entities、propertyNames、relationshipNames) |
| `observationInterval` | object | - | 観測間隔 (start、end) |
| `managementInterval` | object | - | 管理間隔 (start、end) |
| `location` | GeoJSON | - | 地理的範囲 |
| `expiresAt` | string | - | 有効期限 (ISO 8601 形式) |
| `status` | string | - | ステータス (`active` / `inactive`) |
| `mode` | string | - | モード (`inclusive` / `exclusive` / `redirect` / `auxiliary`) |

**レスポンス**
- ステータス: `201 Created`- ヘッダー: `Location: /ngsi-ld/v1/csourceRegistrations/{registrationId}`#### 登録リストの取得

```http
GET /ngsi-ld/v1/csourceRegistrations
```





**クエリパラメータ**

| パラメータ | 型 | 説明 | デフォルト |
|-----------|-----|------|-----------|
| `limit` | integer | 取得する結果の数 | 20 |
| `offset` | integer | オフセット | 0 |

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











**レスポンス**: `204 No Content`#### 登録の削除

```http
DELETE /ngsi-ld/v1/csourceRegistrations/{registrationId}
```





**レスポンス**: `204 No Content`#### 所有権検証 (GeonicDB 拡張)

認証が有効な場合 (`AUTH_ENABLED=true`)、登録の更新 (PATCH) と削除 (DELETE) 操作は `createdBy` フィールドに基づいて所有権検証を行います。作成者以外のユーザがこれらの操作を試みると `403 Forbidden` を受け取ります。`super_admin` と `tenant_admin` ロールはこの検証をバイパスできます。詳細は AUTH.md を参照してください。

#### CSR 拡張フィールド (ETSI GS CIM 009 V1.9.1)

Context Source Registration では以下の拡張フィールドがサポートされています:

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `cacheDuration` | string (ISO 8601 duration) | コンテキストソースからのレスポンスのキャッシュ期間 |
| `refreshRate` | string (ISO 8601 duration) | コンテキストソースへの定期的なリフレッシュの間隔 |
| `timeout` | integer (ms) | コンテキストソースへのリクエストタイムアウト |
| `contextSourceAlias` | string | コンテキストソースのエイリアス名 |
| `contextSourceInfo` | object[] | コンテキストソースの追加メタデータ |
| `operationGroup` | string[] | 操作グループ: `federationOps`、`retrieveOps`、`updateOps`、`redirectionOps` |

### 分散操作情報

#### ブローカー識別情報の取得

```http
GET /ngsi-ld/v1/info/sourceIdentity
```





コンテキストブローカーの識別情報を返します。分散環境でのブローカー識別に使用されます。

**レスポンス**: `200 OK` (`application/ld+json`)

#### 適合性情報の取得

```http
GET /ngsi-ld/v1/info/conformance
```





NGSI-LD 仕様への準拠状況を返します。

**レスポンス**: `200 OK` (`application/ld+json`)

#### 分散クエリパラメータ

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `localOnly` | boolean | `true` の場合、フェデレーションをスキップしてローカルデータのみを返します |
| `csf` | string | Context Source Filter 式 (例: `name==value`、`endpoint~=pattern`) |

#### 分散操作レスポンスヘッダー

| ヘッダー | 説明 |
|----------|------|
| `NGSILD-Warning` | フェデレーション中に一部のコンテキストソースが失敗した場合に設定される警告メッセージ (ETSI GS CIM 009 - 6.3.6) |
| `Via` | 分散操作におけるループ検出用ヘッダー。ブローカーは転送されたリクエストに自身の ID を追加します (ETSI GS CIM 009 - 6.3.5) |

#### CSR 変更通知

Context Source Registration が作成、更新、または削除されると、マッチする CSource Subscription の通知エンドポイントに自動的に通知が送信されます (ETSI GS CIM 009 - 5.11)。通知には変更の種類を示す `Ngsild-Trigger` ヘッダー (`csourceRegistration-created`、`csourceRegistration-updated`、`csourceRegistration-deleted`) が含まれます。

#### 分散型と属性検出

`/ngsi-ld/v1/types` と `/ngsi-ld/v1/attributes` エンドポイントは、ローカルエンティティに加えて Context Source Registration に登録されているエンティティタイプと属性を返します (ETSI GS CIM 009 - 5.9.3.3)。### EntityMap 操作

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







**レスポンス**: `201 Created`、作成された EntityMap の URL が `Location` ヘッダーに含まれます

#### EntityMap リストを取得

```http
GET /ngsi-ld/v1/entityMaps
```





**クエリパラメータ**

| パラメータ | タイプ | 説明 |
|-----------|-----|------|
| `limit` | integer | 最大結果数 (デフォルト: 20、最大: 1000) |
| `offset` | integer | スキップする結果数 (デフォルト: 0) |

**レスポンス**: `200 OK`#### EntityMap を取得

```http
GET /ngsi-ld/v1/entityMaps/{entityMapId}
```





**レスポンス**: `200 OK`#### EntityMap を更新

```http
PATCH /ngsi-ld/v1/entityMaps/{entityMapId}
Content-Type: application/ld+json
```







**レスポンス**: `204 No Content`#### EntityMap を削除

```http
DELETE /ngsi-ld/v1/entityMaps/{entityMapId}
```





**レスポンス**: `204 No Content`### リンクされたエンティティの取得 (join/joinLevel)

エンティティ取得エンドポイント (`GET /ngsi-ld/v1/entities` および `GET /ngsi-ld/v1/entities/{entityId}`) では、`join` および `joinLevel` クエリパラメータを使用してリンクされたエンティティを取得できます。

| パラメータ | タイプ | 説明 |
|-----------|-----|------|
| `join` | string | リンクされたエンティティの取得モード: `inline` (Relationship 内にネスト) または `flat` (結果配列に追加) |
| `joinLevel` | integer | リンクされたエンティティの解決深度 (デフォルト: 1) |

**使用例**

```bash
# inline mode - linked entities are nested inside the Relationship
curl "https://api.example.com/ngsi-ld/v1/entities?type=Room&join=inline&joinLevel=2" \
  -H "Fiware-Service: smartcity"

# flat mode - linked entities are appended to the result array
curl "https://api.example.com/ngsi-ld/v1/entities/urn:ngsi-ld:Room:001?join=flat&joinLevel=1" \
  -H "Fiware-Service: smartcity"
```








### コンテキスト ソース登録サブスクリプション

NGSI-LD では、コンテキスト ソース登録サブスクリプション (CSR サブスクリプション) は、コンテキスト ソース登録の変更を監視するサブスクリプションを管理します。

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

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `type` | string | ✓ | 固定値: `Subscription` |
| `entities` | array | ✓ | 監視対象エンティティ (type、id、idPattern) |
| `notification` | object | ✓ | 通知設定 (endpoint.uri は必須) |
| `description` | string | - | サブスクリプションの説明 |
| `watchedAttributes` | array | - | 監視する属性のリスト |
| `expiresAt` | string | - | 有効期限 (ISO 8601 形式) |
| `throttling` | number | - | 通知間隔 (秒) |
| `isActive` | boolean | - | アクティブ状態 (デフォルト: true) |

**レスポンス**
- ステータス: `201 Created`- ヘッダー: `Location: /ngsi-ld/v1/csourceSubscriptions/{subscriptionId}`#### CSR サブスクリプションリストの取得

```http
GET /ngsi-ld/v1/csourceSubscriptions
```





**クエリパラメータ**

| パラメータ | 型 | 説明 | デフォルト |
|-----------|-----|------|-----------|
| `limit` | integer | 取得する結果の数 | 20 |
| `offset` | integer | オフセット | 0 |

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











**レスポンス**: `204 No Content`#### CSR サブスクリプションの削除# API ウォークスルー

Vela は `Fiware-ServicePath` の形式で HTTP ベースの API を公開します。

## アーキテクチャ

Vela は、NGSI Context Broker と対話する標準的な FIWARE ソリューションに似たアーキテクチャに従います。

```http
Link: <https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"
```



Orion Context Broker の代わりに、Vela には、さまざまな Context Source をサポートする複数の [Source adapters](./sources) が含まれています。また、Vela は Orion Context Broker を [source](./sources/orion) としても使用できます。

各 Context Source は以下の通りです:

* [Registered](./crud) されている
* コンテキストデータを提供できる (エンティティ)

各 Context Consumer は以下の通りです:

* 特定の Context Source からのコンテキストデータへの [Subscription](./subscriptions) を作成できる
* 変更が発生したときにコンテキストデータの通知を受け取る

## 認証

現在、すべての API 操作は認証なしでアクセスできます。認証は将来のリリースで追加される予定です。

## サポートされるメソッド

Vela は以下の API メソッドをサポートしています:

* **GET** - データの取得
* **POST** - 新しいリソースの作成
* **PATCH** - 既存のリソースの更新
* **DELETE** - 既存のリソースの削除

すべてのメソッドは `scope` の `scopeQ` で JSON ペイロードを受け付け、返します。

## ステータスコード

Vela は以下の HTTP ステータスコードを返します:

* **200 OK** - リクエストが成功し、レスポンスボディにデータが含まれる
* **201 Created** - 新しいリソースが正常に作成された
* **204 No Content** - リクエストが成功したがレスポンスボディにデータがない
* **400 Bad Request** - リクエストが無効である
* **404 Not Found** - リソースが見つからない
* **500 Internal Server Error** - サーバーエラーが発生した

## CRUD 操作

Vela は、以下を含むコンテキストデータに対する完全な CRUD 操作をサポートしています:

* [Registrations](./crud)
* [Subscriptions](./subscriptions)

## 通知

Vela は、サブスクリプションに基づいてコンテキストデータの変更を通知します:

[Notifications](./notifications) を参照してください。

## ヘルスチェック

Vela は、サービスの状態を確認するためのヘルスチェックエンドポイントを提供します:

### リクエスト

```http
DELETE /ngsi-ld/v1/csourceSubscriptions/{subscriptionId}
```



### レスポンス

`204 No Content`### JSON-LD Context 管理

ETSI GS CIM 009 Section 5.12 に準拠した JSON-LD コンテキスト管理 API です。ユーザー定義の JSON-LD コンテキストの登録と管理を可能にします。

#### JSON-LD Context の登録

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
- ステータス: `201 Created`- ヘッダー: `Location: /ngsi-ld/v1/jsonldContexts/{contextId}`#### JSON-LD Context リストの取得

```http
GET /ngsi-ld/v1/jsonldContexts
```





**クエリパラメータ**

| パラメータ | 型 | 説明 | デフォルト |
|-----------|-----|------|-----------|
| `limit` | integer | 結果の最大数 | 20 |
| `offset` | integer | スキップする結果の数 | 0 |

**レスポンス**: `200 OK`#### JSON-LD Context の取得

```http
GET /ngsi-ld/v1/jsonldContexts/{contextId}
```





**キャッシュヘッダー**

レスポンスには以下のキャッシュ関連ヘッダーが含まれます:

| ヘッダー | 説明 |
|---------|------|
| `ETag` | コンテキストボディの MD5 ハッシュ |
| `Last-Modified` | コンテキストの作成日時 |
| `Cache-Control` | `public, max-age=3600` |

**条件付きリクエスト**

| リクエストヘッダー | 動作 |
|------------------|------|
| `If-None-Match` | ETag が一致する場合、`304 Not Modified` を返します |
| `If-Modified-Since` | 指定された日時以降に変更がない場合、`304 Not Modified` を返します |

**レスポンス**: `200 OK` / `304 Not Modified`#### JSON-LD Context の削除

```http
DELETE /ngsi-ld/v1/jsonldContexts/{contextId}
```





**レスポンス**: `204 No Content`### ベクタタイル (NGSI-LD)

マップ可視化のために、エンティティデータを GeoJSON ベクタタイルとして提供します。TileJSON 3.0 準拠のメタデータと、ズームレベルおよびタイル座標による GeoJSON タイルの取得をサポートします。

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

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `z` | integer | ズームレベル |
| `x` | integer | タイル X 座標 |
| `y` | integer | タイル Y 座標 |

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `type` | string | エンティティタイプフィルタ |
| `attrs` | string | 取得する属性 (カンマ区切り) |
| `q` | string | NGSI-LD クエリ言語を使用した属性フィルタ |
| `limit` | integer | 結果の最大数 (デフォルト: 20、最大: 1000) |
| `offset` | integer | スキップする結果数 (デフォルト: 0) |

**レスポンス**: `200 OK` (GeoJSON FeatureCollection 形式)

---

## HTTP キャッシュ制御

NGSI-LD GET エンドポイントは、エンドポイントクラス別にキャッシュ関連ヘッダーを返します:

### データエンドポイント (entities, subscriptions, csourceRegistrations, csourceSubscriptions) — 完全な RFC 7232 + RFC 7234 サポート

| ヘッダー | 値 | 目的 |
|--------|-------|---------|
| `ETag` | `W/"..."` | 弱い検証子。生成シードには `path + Accept + tenant + Fiware-ServicePath` (tenant = `NGSILD-Tenant` ?? `Fiware-Service`) が含まれるため、異なるエンドポイント / Accept / テナント / ServicePathは常に異なる ETag を生成します。リスト: `id + modifiedAt` のストリーミングダイジェストと総数およびスコープを混合。単一: `modifiedAt` のハッシュとスコープを混合。 |
| `Last-Modified` | RFC 1123 HTTP-date | 結果セット内の最新の `modifiedAt` のタイムスタンプ。 |
| `Cache-Control` | `private, no-cache` | `private` は共有 / 中間キャッシュストレージをブロック; `no-cache` はプライベートキャッシュからの再検証を強制。 |
| `Vary` | `Fiware-Service, Fiware-ServicePath, Authorization, X-Api-Key, Accept` | 共有キャッシュのためのテナント + 認証 + コンテンツネゴシエーション分離。 |

条件付きリクエストがサポートされています:

| リクエストヘッダー | 動作 |
|----------------|----------|
| `If-None-Match: <ETag>` | マッチした場合、`304 Not Modified` (空のボディ) を返します。 |
| `If-Modified-Since: <HTTP-date>` | リソースが変更されていない場合、`304` を返します。 |
| `Cache-Control: no-store` | サーバーはレスポンスの `Cache-Control` を `no-store` でオーバーライドします。 |

### メタエンドポイント (types, attributes) — Cache-Control + Vary のみ (ETag なし / 304 なし)

| ヘッダー | 値 | 目的 |
|--------|-------|---------|
| `Cache-Control` | `max-age=60, stale-while-revalidate=120` | バックグラウンド再検証による短期キャッシング。 |
| `Vary` | `Fiware-Service, Fiware-ServicePath, Authorization, X-Api-Key, Accept` | データエンドポイントと同じテナント / 認証分離。 |

メタエンドポイントは `ETag` / `Last-Modified` を返さず、`If-None-Match` / `If-Modified-Since` 条件付きリクエストをサポートしません。クライアントは代わりに `max-age` / `stale-while-revalidate` ディレクティブに依存する必要があります。

> **注意**: `/ngsi-ld/v1/jsonldContexts/{contextId}` には追加のコンテキスト固有のキャッシュセマンティクスがあります — 上記の JSON-LD コンテキスト管理セクションを参照してください。

完全なセマンティクスについては、[API.md §HTTP Cache Control](./endpoints.md#http-cache-control-etag--conditional-requests) を参照してください。

---

## エンドポイント一覧

ETSI NGSI-LD 互換コンテキストブローカー API。

### 共通仕様

- **Content-Type**: `application/ld+json` または `application/json`- **認証**: `AUTH_ENABLED=true` の場合は必須
- **テナント分離**: `NGSILD-Tenant` または `Fiware-Service` ヘッダー
- **ページネーション**: `limit`/`offset` パラメータ、総数は常に `NGSILD-Results-Count` ヘッダーで返されます
- **OPTIONS メソッド**: すべての NGSI-LD エンドポイントは OPTIONS メソッドをサポートします。`Allow` および `Accept-Patch` ヘッダーとともに 204 レスポンスを返します
- **405 Method Not Allowed**: 許可されていない HTTP メソッドに対して 405 レスポンスを返します (RFC 7807 ProblemDetails 形式、`Allow` ヘッダー付き)
- **エラー形式**: NGSI-LD エラーレスポンスは RFC 7807 ProblemDetails 形式 (`application/json`) で返されます### エンティティ操作

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/entities` | GET | エンティティ一覧の取得 | 200 | 400、401 | ✅ (最大: 1000) |
| `/ngsi-ld/v1/entities` | POST | エンティティの作成 | 201 | 400、401、409、415 | - |
| `/ngsi-ld/v1/entities/{entityId}` | GET | エンティティの取得 | 200 | 400、401、404 | - |
| `/ngsi-ld/v1/entities/{entityId}` | PUT | エンティティの置き換え | 204 | 400、401、404、415 | - |
| `/ngsi-ld/v1/entities/{entityId}` | PATCH | エンティティの更新 (マージパッチ) | 204 | 400、401、404、415 | - |
| `/ngsi-ld/v1/entities/{entityId}` | POST | 属性の追加 | 204/207 | 400、401、404、415 | - |
| `/ngsi-ld/v1/entities/{entityId}` | DELETE | エンティティの削除 | 204 | 401、404 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs` | GET | エンティティの全属性の取得 | 200 | 401、404 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs` | POST | 属性の追加 | 204 | 400、401、404、415 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs` | PATCH | 属性の部分更新 | 204/207 | 400、401、404、415 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}` | GET | 単一属性の取得 | 200 | 401、404 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}` | POST | 属性の置き換え | 204 | 400、401、404、415 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}` | PUT | 属性の置き換え | 204 | 400、401、404、415 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}` | PATCH | 属性の部分更新 | 204 | 400、401、404、415 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}` | DELETE | 属性の削除 | 204 | 401、404 | - |

### タイプ操作

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/types` | GET | エンティティタイプ一覧の取得 | 200 | 400、401 | ✅ (最大: 1000) |
| `/ngsi-ld/v1/types/{typeName}` | GET | エンティティタイプの詳細取得 | 200 | 401、404 | - |

### 属性操作

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/attributes` | GET | 属性一覧の取得 | 200 | 400、401 | ✅ (最大: 1000) |
| `/ngsi-ld/v1/attributes/{attrName}` | GET | 属性の詳細取得 | 200 | 401、404 | - |

### サブスクリプション操作

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/subscriptions` | GET | サブスクリプション一覧 | 200 | 400、401 | ✅ (最大: 1000) |
| `/ngsi-ld/v1/subscriptions` | POST | サブスクリプションの作成 | 201 | 400、401、415 | - |
| `/ngsi-ld/v1/subscriptions/{subscriptionId}` | GET | サブスクリプションの取得 | 200 | 401、404 | - |
| `/ngsi-ld/v1/subscriptions/{subscriptionId}` | PATCH | サブスクリプションの更新 | 204 | 400、401、404、415 | - |
| `/ngsi-ld/v1/subscriptions/{subscriptionId}` | DELETE | サブスクリプションの削除 | 204 | 401、404 | - |

### コンテキストソース登録操作 (フェデレーション)

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/csourceRegistrations` | GET | 登録一覧 | 200 | 400、401 | ✅ (最大: 1000) |
| `/ngsi-ld/v1/csourceRegistrations` | POST | 登録の作成 | 201 | 400、401、415 | - |
| `/ngsi-ld/v1/csourceRegistrations/{registrationId}` | GET | 登録の取得 | 200 | 401、404 | - |
| `/ngsi-ld/v1/csourceRegistrations/{registrationId}` | PATCH | 登録の更新 | 204 | 400、401、404、415 | - |
| `/ngsi-ld/v1/csourceRegistrations/{registrationId}` | DELETE | 登録の削除 | 204 | 401、404 | - |

### コンテキストソース登録サブスクリプション操作

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/csourceSubscriptions` | GET | CSR サブスクリプション一覧 | 200 | 400、401 | ✅ (最大: 1000) |
| `/ngsi-ld/v1/csourceSubscriptions` | POST | CSR サブスクリプションの作成 | 201 | 400、401、415 | - |
| `/ngsi-ld/v1/csourceSubscriptions/{subscriptionId}` | GET | CSR サブスクリプションの取得 | 200 | 401、404 | - |
| `/ngsi-ld/v1/csourceSubscriptions/{subscriptionId}` | PATCH | CSR サブスクリプションの更新 | 204 | 400、401、404、415 | - |
| `/ngsi-ld/v1/csourceSubscriptions/{subscriptionId}` | DELETE | CSR サブスクリプションの削除 | 204 | 401、404 | - |

### 分散オペレーション情報

| エンドポイント | メソッド | 説明 | 成功 | エラー |
|---------------|---------|------|------|--------|
| `/ngsi-ld/v1/info/sourceIdentity` | GET | ブローカー ID の取得 | 200 | - |
| `/ngsi-ld/v1/info/conformance` | GET | NGSI-LD 準拠情報の取得 | 200 | - |

### JSON-LD コンテキスト管理

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/jsonldContexts` | GET | JSON-LD コンテキスト一覧 | 200 | 400、401 | ✅ (最大: 1000) |
| `/ngsi-ld/v1/jsonldContexts` | POST | JSON-LD コンテキストの登録 | 201 | 400、401、409、415 | - |
| `/ngsi-ld/v1/jsonldContexts/{contextId}` | GET | JSON-LD コンテキストの取得 | 200 | 401、404 | - |
| `/ngsi-ld/v1/jsonldContexts/{contextId}` | DELETE | JSON-LD コンテキストの削除 | 204 | 401、404 | - |

### EntityMap 操作

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/entityMaps` | GET | EntityMap 一覧の取得 | 200 | 400、401 | ✅ (最大: 1000) |
| `/ngsi-ld/v1/entityMaps` | POST | EntityMap の作成 | 201 | 400、401、415 | - |
| `/ngsi-ld/v1/entityMaps/{entityMapId}` | GET | EntityMap の取得 | 200 | 401、404 | - |
| `/ngsi-ld/v1/entityMaps/{entityMapId}` | PATCH | EntityMap の更新 | 204 | 400、401、404、415 | - |
| `/ngsi-ld/v1/entityMaps/{entityMapId}` | DELETE | EntityMap の削除 | 204 | 401、404 | - |### スナップショット操作

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/snapshots` | GET | スナップショットリストの取得 | 200 | 400, 401 | ✅ (最大: 1000) |
| `/ngsi-ld/v1/snapshots` | POST | スナップショットの作成 | 201 | 400, 401, 415 | - |
| `/ngsi-ld/v1/snapshots` | DELETE | 全スナップショットの削除 | 200 | 401 | - |
| `/ngsi-ld/v1/snapshots/{snapshotId}` | GET | スナップショットの取得 | 200 | 401, 404 | - |
| `/ngsi-ld/v1/snapshots/{snapshotId}` | PATCH | スナップショットステータスの更新 | 204 | 400, 401, 404 | - |
| `/ngsi-ld/v1/snapshots/{snapshotId}` | DELETE | スナップショットの削除 | 204 | 401, 404 | - |
| `/ngsi-ld/v1/snapshots/{snapshotId}/clone` | POST | スナップショットのクローン(復元) | 200 | 400, 401, 404 | - |

### バッチ操作

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/entityOperations/create` | POST | バッチ作成 (最大: 1000) | 200/201 | 400, 401, 415 | - |
| `/ngsi-ld/v1/entityOperations/upsert` | POST | バッチアップサート (最大: 1000) | 200/201 | 400, 401, 415 | - |
| `/ngsi-ld/v1/entityOperations/update` | POST | バッチ更新 (最大: 1000) | 200/204 | 400, 401, 415 | - |
| `/ngsi-ld/v1/entityOperations/delete` | POST | バッチ削除 (最大: 1000) | 200/204 | 400, 401, 415 | - |
| `/ngsi-ld/v1/entityOperations/query` | POST | バッチクエリ | 200 | 400, 401, 415 | ✅ (最大: 1000) |
| `/ngsi-ld/v1/entityOperations/merge` | POST | バッチマージパッチ (最大: 1000) | 204/207 | 400, 401, 415 | - |
| `/ngsi-ld/v1/entityOperations/purge` | POST | エンティティの一括削除 | 204 | 400, 401, 415 | - |

### 時系列 API (時系列データ)

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/temporal/entities` | GET | 時系列エンティティリストの取得 | 200 | 400, 401 | ✅ (最大: 1000) |
| `/ngsi-ld/v1/temporal/entities` | POST | 時系列エンティティの作成 | 201 | 400, 401, 409, 415 | - |
| `/ngsi-ld/v1/temporal/entities/{entityId}` | GET | 時系列エンティティの取得 | 200 | 400, 401, 404 | - |
| `/ngsi-ld/v1/temporal/entities/{entityId}` | PATCH | 時系列エンティティの属性のマージ | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/temporal/entities/{entityId}` | DELETE | 時系列エンティティの削除 | 204 | 401, 404 | - |
| `/ngsi-ld/v1/temporal/entities/{entityId}/attrs` | POST | 属性インスタンスの追加 | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/temporal/entities/{entityId}/attrs/{attrName}` | DELETE | 属性インスタンスの削除 | 204 | 401, 404 | - |
| `/ngsi-ld/v1/temporal/entities/{entityId}/attrs/{attrName}/{instanceId}` | PATCH | 属性インスタンスの変更 | 204 | 400, 401, 404 | - |
| `/ngsi-ld/v1/temporal/entityOperations/create` | POST | 時系列バッチ作成 (最大: 1000) | 201/207 | 400, 401, 415 | - |
| `/ngsi-ld/v1/temporal/entityOperations/upsert` | POST | 時系列バッチアップサート (最大: 1000) | 204/207 | 400, 401, 415 | - |
| `/ngsi-ld/v1/temporal/entityOperations/delete` | POST | 時系列バッチ削除 | 204/207 | 400, 401, 415 | - |
| `/ngsi-ld/v1/temporal/entityOperations/query` | POST | 時系列バッチクエリ | 200 | 400, 401, 415 | ✅ (最大: 1000) |

### ベクタータイル操作

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/tiles` | GET | TileJSON 3.0 メタデータの取得 | 200 | 401 | - |
| `/ngsi-ld/v1/tiles/{z}/{x}/{y}.geojson` | GET | GeoJSON タイルの取得 | 200 | 400, 401 | ✅ (最大: 1000) |