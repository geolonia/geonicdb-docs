---
title: "NGSI-LD API"
description: "NGSI-LD API reference"
outline: deep
---
# NGSI-LD API

> このドキュメントは [API.md](./endpoints.md) から分離されました。メイン API 仕様については [API.md](./endpoints.md) を参照してください。

---

NGSI-LD は JSON-LD ベースのコンテキスト情報管理 API です。

> **注意:** NGSI-LD API は ETSI GS CIM 009 仕様に従い `Fiware-ServicePath` ヘッダーを無視します。階層構造は `scope` エンティティプロパティと `scopeQ` クエリパラメータで管理されます。`servicePath` と `scope` は独立した概念であり、自動的に同期されません ([INTEROPERABILITY.md](../core-concepts/ngsiv2-vs-ngsild.md#3-scope-scope-hierarchy) を参照)。
>
> **注意:** NGSIv2 と NGSI-LD のエンティティは完全に分離されています。NGSIv2 で作成されたエンティティは NGSI-LD からは見えず、その逆も同様です (各エンティティの `protocol` フィールド、#964)。

## 仕様準拠

このドキュメントは **[ETSI GS CIM 009 V1.9.1 (2025-07)](https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/01.09.01_60/gs_CIM009v010901p.pdf)** に準拠しています。各機能の詳細については、以下の ETSI 仕様セクションを参照してください:

| 機能カテゴリ | ETSI GS CIM 009 セクション |
|-------------|---------------------------|
| エンティティ操作 | Section 5.6 |
| クエリ操作 | Section 5.7 |
| サブスクリプション | Section 5.8 |
| コンテキストソース登録 | Section 5.9 |
| Temporal API | Section 5.6.12-5.6.19 |
| EntityMaps | Section 5.14 |
| JSON-LD コンテキスト管理 | Section 5.12 |
| 分散操作 | Section 5.10 |

### コンテントネゴシエーションと @context

NGSI-LD API は `Accept` ヘッダーを介したコンテントネゴシエーションをサポートしています。

| Accept ヘッダー | レスポンス形式 | @context の処理 |
|----------------|--------------|----------------|
| `application/ld+json` | JSON-LD | `@context` はレスポンスボディに含まれます |
| `application/json` | JSON | `@context` は `Link` ヘッダーで返されます |
| `application/geo+json` | GeoJSON | `@context` は `Link` ヘッダーで返されます |

`Accept: application/json` の場合、レスポンスには `Link` ヘッダーが含まれます:

```http
Link: <https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"
```

### 自然言語照合 (lang + orderBy)

`lang` パラメータと `orderBy` を組み合わせることで、指定された言語のロケールに基づいて結果をソートできます。たとえば、`lang=ja` は日本語の照合順序をソートに適用します。### エンティティ操作 (NGSI-LD)

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
| `orderBy` | string | ソート条件 (`entityId`、`entityType`、`modifiedAt`) | - |
| `orderDirection` | string | ソート方向 (`asc`、`desc`) | `asc` |
| `type` | string | エンティティタイプでフィルタ | - |
| `idPattern` | string | エンティティ ID の正規表現パターン | - |
| `q` | string | 属性値でフィルタ | - |
| `attrs` | string | 取得する属性名 (カンマ区切り) | - |
| `pick` | string | 取得する属性名 (カンマ区切り、`omit` と排他) | - |
| `omit` | string | 除外する属性名 (カンマ区切り、`pick` と排他、`id`/`type` は不可) | - |
| `scopeQ` | string | スコープクエリ (例: `/Madrid`、`/Madrid/#`、`/Madrid/+`) | - |
| `lang` | string | LanguageProperty の言語フィルタ (BCP 47、カンマ区切りの優先順、すべての言語は `*`) | - |
| `georel` | string | ジオクエリ演算子 | - |
| `geometry` | string | ジオメトリタイプ | - |
| `coordinates` | string | 座標 | - |
| `spatialId` | string | 空間 ID でフィルタ (ZFXY 形式) ([空間 ID 検索](./endpoints.md#spatial-id-search) を参照) | - |
| `spatialIdDepth` | integer | 空間 ID 階層展開の深さ (0-4) | 0 |
| `crs` | string | 座標参照系 ([座標参照系 (CRS)](./endpoints.md#coordinate-reference-system-crs) を参照)。URN 形式も可 | `EPSG:4326` |
| `geoproperty` | string | ジオクエリに使用する GeoProperty 名 | `location` |
| `format` | string | 出力形式 (keyValues 形式は `simplified`、GeoJSON 形式は `geojson`)。GeoJSON は `Accept: application/geo+json` ヘッダーでも指定可 | - |
| `expandValues` | string | 展開する属性名 (カンマ区切り、展開された値を返す) | - |
| `options` | string | `keyValues`、`concise`、`entityMap`、`sysAttrs` (システム属性を出力)、`splitEntities` (タイプごとに分割してレスポンス) | - |

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

**一時エンティティ (expiresAt)**

エンティティに `expiresAt` フィールド (ISO 8601 形式) を指定すると、有効期限付きの一時エンティティとして作成されます。有効期限は未来の日付である必要があります。

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
- ステータス: `201 Created`- ステータス: 同じ ID のエンティティが既に存在する場合は `409 AlreadyExists` (タイプに関係なく)
- ヘッダー: `Location: /ngsi-ld/v1/entities/urn:ngsi-ld:Room:001`> **注意**: エンティティ ID はテナントとServicePathスコープ内で一意です。同じ ID で異なるタイプのエンティティを作成すると `409 AlreadyExists` が返されます。詳細は [エンティティ ID の一意性](./endpoints.md#entity-id-uniqueness-geonicdb-extension) を参照してください。

#### 単一エンティティの取得

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

- `Content-Type: application/merge-patch+json` を使用すると、リクエストボディに含まれない属性は保持されます(マージモード)。標準の `application/json` / `application/ld+json` では、すべての属性が置き換えられます。
- プロパティ値として `urn:ngsi-ld:null` を指定すると、その属性が削除されます。
- クエリパラメータ `options=keyValues` または `options=concise` を指定すると、簡略化された入力形式を使用できます。

**レスポンス**: `204 No Content`#### 属性の追加

```http
POST /ngsi-ld/v1/entities/{entityId}
Content-Type: application/ld+json
```

**クエリパラメータ**

| パラメータ | 説明 |
|-----------|------|
| `options=noOverwrite` | 既存の属性を上書きしない(既存の属性は保持され、新しい属性のみが追加されます) |

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

**レスポンス**: `204 No Content`#### エンティティのすべての属性を取得

```http
GET /ngsi-ld/v1/entities/{entityId}/attrs
```

エンティティのすべての属性を取得します。

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

指定された属性を新しい値で置き換えます。

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

**レスポンス**: `204 No Content`> **注意**: エンティティまたは属性が存在しない場合、`404 Not Found` が返されます (ETSI GS CIM 009 V1.9.1 clause 5.6.4)。この操作は既存の属性の部分更新のみを実行し、新しい属性は作成しません。

#### 属性の削除

```http
DELETE /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
```

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `datasetId` | string | 削除するマルチ属性インスタンスの datasetId |
| `deleteAll` | boolean | `true` の場合、すべてのインスタンスを削除します |**レスポンス**: `204 No Content`### マルチ属性 (datasetId)

> **ETSI GS CIM 009 リファレンス**: Section 4.5.3 - Multi-Attribute

NGSI-LD では、同じ属性名に対して複数のインスタンスを保持できます。各インスタンスは `datasetId` (URI 形式) によって区別されます。`datasetId` を持たないインスタンスは「デフォルトインスタンス」と呼ばれ、属性ごとに最大 1 つ存在できます。

#### 作成 (CREATE)

エンティティを作成する際、属性を配列形式で指定することで複数のインスタンスを作成できます。

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

上記の例では、`speed` 属性に対して 3 つのインスタンスがあります: GPS から 1 つ、OBD から 1 つ、そしてデフォルトインスタンスが 1 つです。

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

属性を削除する際、`datasetId` クエリパラメータを指定すると特定のインスタンスのみが削除されます。`deleteAll=true` を指定すると、すべてのインスタンスが削除されます。

```http
DELETE /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}?datasetId=urn:ngsi-ld:dataset:gps
DELETE /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}?deleteAll=true
```

---### バッチ操作 (NGSI-LD)

> **注意**: バッチ操作は、1 リクエストあたり最大 **1,000** 個のエンティティを処理できます。1,000 個を超えるリクエストは `400 Bad Request` エラーになります。

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
- すべて成功: `201 Created`- 部分的に成功: `207 Multi-Status`#### バッチアップサート

```http
POST /ngsi-ld/v1/entityOperations/upsert
```

**クエリパラメータ**

| パラメータ | 説明 |
|-----------|------|
| `options=replace` | 既存エンティティのすべての属性を置き換える |

**レスポンス**
- すべて成功: `201 Created` (新規作成) または `204 No Content` (更新)
- 部分的に成功: `207 Multi-Status`#### バッチ更新

```http
POST /ngsi-ld/v1/entityOperations/update
```

**レスポンス**
- すべて成功: `204 No Content`- 部分的に成功: `207 Multi-Status`#### バッチ削除

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
- すべて成功: `204 No Content`- 部分的に成功: `207 Multi-Status`#### エンティティパージ

```http
POST /ngsi-ld/v1/entityOperations/purge
Content-Type: application/json
```

指定されたタイプのエンティティを一括削除します。ETSI NGSI-LD 仕様のセクション 5.6.14 に準拠しています。

**クエリパラメータ**

| パラメータ | タイプ | 説明 |
|-----------|-----|------|
| `type` | string | 削除するエンティティタイプ (必須) |

**レスポンス**
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
| `options=noOverwrite` | 既存の属性を上書きしない |**レスポンス**
- すべて成功: `204 No Content`- 部分的な成功: `207 Multi-Status`---### 時系列・バッチ操作 (NGSI-LD)

> **ETSI GS CIM 009 参照**: セクション 5.6.12-5.6.19 - エンティティの時系列表現

時系列エンティティのバッチ操作。リクエストごとに最大 **1,000** エンティティを処理できます。

> **注**: 時系列 entityOperations の create / upsert / delete は、ETSI GS CIM 009 仕様には含まれていない GeonicDB の拡張機能です。仕様に準拠しているのは query のみです。これらの拡張機能は、時系列データの一括取り込みの効率を向上させるために提供されています。

#### 時系列・バッチ作成

```http
POST /ngsi-ld/v1/temporal/entityOperations/create
Content-Type: application/ld+json
```

時系列エンティティを一括作成します。リクエストボディは時系列エンティティの配列です。

**レスポンス**: すべて成功した場合は `201 Created`、部分的に失敗した場合は `207 Multi-Status`#### 時系列・バッチアップサート

```http
POST /ngsi-ld/v1/temporal/entityOperations/upsert
Content-Type: application/ld+json
```

時系列エンティティを一括作成または更新します (既存のエンティティに属性を追加します)。

**レスポンス**: すべて成功した場合は `204 No Content`、部分的に失敗した場合は `207 Multi-Status`#### 時系列・バッチ削除

```http
POST /ngsi-ld/v1/temporal/entityOperations/delete
Content-Type: application/ld+json
```

時系列エンティティを一括削除します。リクエストボディはエンティティ ID の配列です。

**レスポンス**: すべて成功した場合は `204 No Content`、部分的に失敗した場合は `207 Multi-Status`#### 時系列・バッチクエリ

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
| `timerel` | string | 時系列関係演算子 (`after`, `before`, `between`) |
| `timeAt` | string | 基準時刻 (ISO 8601 形式) |
| `endTimeAt` | string | 終了時刻 (`timerel=between` のときに必須、ISO 8601 形式) |
| `lastN` | integer | 最新の N 個のインスタンスのみを返す (正の整数、ETSI GS CIM 009 セクション 5.6.12) |
| `options` | string | `temporalValues`: 簡易時系列表現 |

**lastN パラメータ**

`lastN` を指定すると、時系列データの最新 N 個のインスタンスのみを返します。`timerel`/`timeAt` と組み合わせて、時間範囲内の最新 N 個のインスタンスを取得できます。

```bash
# Retrieve the latest 10 temporal data instances
curl "http://localhost:3000/ngsi-ld/v1/temporal/entities/urn:ngsi-ld:Sensor:001?lastN=10" \
  -H "Fiware-Service: myservice"
```

#### 時系列レスポンス形式オプション

`options=temporalValues` を指定すると、各属性が `values` 配列 (`[value, timestamp]` のペア) を含む簡易形式で返されます。

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

#### 時系列集計クエリ (単一エンティティ)

時系列エンティティの GET エンドポイントでは、`aggrMethods` および `aggrPeriodDuration` クエリパラメータを使用して集計クエリを実行できます。リスト取得エンドポイントと単一エンティティ取得エンドポイントの両方で利用可能です。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `aggrMethods` | string | 集計メソッド (カンマ区切り): `totalCount`, `distinctCount`, `sum`, `avg`, `min`, `max`, `stddev`, `sumsq` |
| `aggrPeriodDuration` | string | ISO 8601 期間 (例: `PT1H` は 1 時間)。`aggrMethods` 指定時に必須 |

**例**: `GET /ngsi-ld/v1/temporal/entities/{entityId}?aggrMethods=avg&aggrPeriodDuration=PT1H&timerel=after&timeAt=2024-01-01T00:00:00Z````json
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

> **注**: 集計クエリは **暗号化テナント** (テナントで `encryptionEnabled: true` が設定されている場合) では **サポートされていません**。属性値が保存時に暗号化されているため、MongoDB の集計パイプラインは暗号化されたデータに対して数値演算を実行できません。暗号化テナントで集計をリクエストすると `400 Bad Request` が返されます。`temporalValues` エンドポイントを使用して復号化された値を取得し、アプリケーション層で集計を実行してください。

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

**ヘッダー**: 合計数は `NGSILD-Results-Count` 経由で返されます

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

**ヘッダー**: 合計数は `NGSILD-Results-Count` 経由で返されます

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

> **ETSI GS CIM 009 リファレンス**: セクション 5.8 - サブスクリプション操作

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

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `cooldown` | integer | 通知間の最小間隔 (秒)。正の整数のみ。指定された秒数以内に再通知しません |
| `notificationTrigger` | string[] | 通知をトリガーするイベントタイプ。`entityCreated`、`entityUpdated`、`entityChanged`、`entityDeleted`、`attributeCreated`、`attributeUpdated`、`attributeDeleted`。`entityChanged` は属性値が実際に変更された場合にのみトリガーされます (同じ値での更新は無視されます) |
| `showChanges` | boolean | `true` の場合、通知データに以前の属性値を `previousValue` として含めます |
| `notification.onlyChangedAttrs` | boolean | `true` の場合、実際に変更された属性のみを通知ペイロードに含めます。`notification.attributes` と組み合わせて使用できます |
| `expiresAt` | string (ISO 8601) | サブスクリプション有効期限 |

**バリデーション**
- `watchedAttributes` と `timeInterval` は相互排他的です。両方を同時に指定すると `400 Bad Request` が返されます (ETSI GS CIM 009 V1.9.1 clause 5.8.1)

**レスポンス**
- ステータス: `201 Created`- ヘッダー: `Location: /ngsi-ld/v1/subscriptions/{subscriptionId}`#### サブスクリプション一覧

```http
GET /ngsi-ld/v1/subscriptions
```

**クエリパラメータ**

| パラメータ | 型 | 説明 | デフォルト |
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
| `notification.lastFailureReason` | string | 最後の失敗の理由 (例: `HTTP 500: Internal Server Error`)。成功時にクリアされます |
| `notification.lastSuccess` | string | 最後に通知が成功した日時 (ISO 8601) |
| `notification.timesSent` | integer | 送信された通知の数 |

**リトライ動作**: 通知配信が失敗した場合、一時的なエラー (5xx、ネットワークエラー) に対しては、指数バックオフ (1 秒、2 秒、4 秒) で最大 3 回のリトライが実行されます。4xx エラーに対してはリトライは実行されません。

#### サブスクリプションの更新

```http
PATCH /ngsi-ld/v1/subscriptions/{subscriptionId}
```

**レスポンス**: `204 No Content`#### サブスクリプションの削除

```http
DELETE /ngsi-ld/v1/subscriptions/{subscriptionId}
```

**レスポンス**: `204 No Content`#### 所有権検証 (GeonicDB 拡張)

認証が有効な場合 (`AUTH_ENABLED=true`)、サブスクリプションの更新 (PATCH) および削除 (DELETE) 操作は、`createdBy` フィールドに基づいて所有権検証を実行します。作成者以外のユーザーがこれらの操作を試みると `403 Forbidden` を受け取ります。`super_admin` および `tenant_admin` ロールはこの検証をバイパスできます。詳細については、AUTH.md を参照してください。

---### レジストレーション (NGSI-LD)

NGSI-LD では、外部コンテキストプロバイダーは Context Source Registration として登録されます。

#### レジストレーションの作成

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
| `type` | string | ✓ | 固定値: `ContextSourceRegistration` |
| `registrationName` | string | - | レジストレーション名 |
| `description` | string | - | レジストレーションの説明 |
| `endpoint` | string | ✓ | プロバイダーのエンドポイント URL |
| `information` | array | ✓ | 提供される情報 (entities、propertyNames、relationshipNames) |
| `observationInterval` | object | - | 観測期間 (start、end) |
| `managementInterval` | object | - | 管理期間 (start、end) |
| `location` | GeoJSON | - | 地理的範囲 |
| `expiresAt` | string | - | 有効期限 (ISO 8601 形式) |
| `status` | string | - | ステータス (`active` / `inactive`) |
| `mode` | string | - | モード (`inclusive` / `exclusive` / `redirect` / `auxiliary`) |

**レスポンス**
- ステータス: `201 Created`- ヘッダー: `Location: /ngsi-ld/v1/csourceRegistrations/{registrationId}`#### レジストレーション一覧の取得

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

#### レジストレーションの取得

```http
GET /ngsi-ld/v1/csourceRegistrations/{registrationId}
```

#### レジストレーションの更新

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

**レスポンス**: `204 No Content`#### レジストレーションの削除

```http
DELETE /ngsi-ld/v1/csourceRegistrations/{registrationId}
```

**レスポンス**: `204 No Content`#### 所有権の検証 (GeonicDB 拡張)

認証が有効な場合 (`AUTH_ENABLED=true`)、レジストレーションの更新 (PATCH) と削除 (DELETE) 操作は `createdBy` フィールドに基づいて所有権の検証を実行します。作成者以外のユーザーがこれらの操作を試みると `403 Forbidden` を受け取ります。`super_admin` および `tenant_admin` ロールはこの検証をバイパスできます。詳細は AUTH.md を参照してください。

#### CSR 拡張フィールド (ETSI GS CIM 009 V1.9.1)

Context Source Registration では、以下の拡張フィールドがサポートされています:

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `cacheDuration` | string (ISO 8601 duration) | コンテキストソースからのレスポンスのキャッシュ期間 |
| `refreshRate` | string (ISO 8601 duration) | コンテキストソースへの定期的なリフレッシュの間隔 |
| `timeout` | integer (ms) | コンテキストソースへのリクエストタイムアウト |
| `contextSourceAlias` | string | コンテキストソースのエイリアス名 |
| `contextSourceInfo` | object[] | コンテキストソースの追加メタデータ |
| `operationGroup` | string[] | 操作グループ: `federationOps`、`retrieveOps`、`updateOps`、`redirectionOps` |### 分散操作情報

#### ブローカー ID の取得

```http
GET /ngsi-ld/v1/info/sourceIdentity
```

コンテキストブローカーの ID 情報を返します。分散環境におけるブローカーの識別に使用されます。

**レスポンス**: `200 OK` (`application/ld+json`)

#### 適合性情報の取得

```http
GET /ngsi-ld/v1/info/conformance
```

NGSI-LD 仕様への準拠状況を返します。

**レスポンス**: `200 OK` (`application/ld+json`)

#### 分散クエリパラメータ

| パラメータ | タイプ | 説明 |
|-----------|-----|------|
| `localOnly` | boolean | `true` の場合、フェデレーションをスキップしてローカルデータのみを返します |
| `csf` | string | コンテキストソースフィルタ式 (例: `name==value`、`endpoint~=pattern`) |

#### 分散操作レスポンスヘッダー

| ヘッダー | 説明 |
|----------|------|
| `NGSILD-Warning` | フェデレーション中に一部のコンテキストソースが失敗した場合に設定される警告メッセージ (ETSI GS CIM 009 - 6.3.6) |
| `Via` | 分散操作におけるループ検出用のヘッダー。ブローカーは転送されたリクエストに自身の ID を追加します (ETSI GS CIM 009 - 6.3.5) |

#### CSR 変更通知

コンテキストソース登録が作成、更新、または削除されると、一致する CSource サブスクリプションの通知エンドポイントに自動的に通知が送信されます (ETSI GS CIM 009 - 5.11)。通知には変更のタイプを示す `Ngsild-Trigger` ヘッダー (`csourceRegistration-created`、`csourceRegistration-updated`、`csourceRegistration-deleted`) が含まれます。

#### 分散型タイプと属性の検出

`/ngsi-ld/v1/types` と `/ngsi-ld/v1/attributes` エンドポイントは、ローカルエンティティに加えて、コンテキストソース登録に登録されたエンティティタイプと属性を返します (ETSI GS CIM 009 - 5.9.3.3)。### EntityMap 操作

> **ETSI GS CIM 009 リファレンス**: セクション 5.14 - Entity Map

NGSI-LD EntityMap は、クエリ結果をマップとして保存し、後でエンティティ ID による効率的なアクセスを可能にする機能です。

#### EntityMap 形式でエンティティを取得

`options=entityMap` を `GET /ngsi-ld/v1/entities` のクエリパラメータに指定すると、レスポンスがエンティティ ID をキーとするオブジェクトとして返されます。

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

#### EntityMap の作成

```http
POST /ngsi-ld/v1/entityMaps
Content-Type: application/ld+json
```

**レスポンス**: `201 Created`、作成された EntityMap の URL が `Location` ヘッダに含まれます

#### EntityMap リストの取得

```http
GET /ngsi-ld/v1/entityMaps
```

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `limit` | integer | 最大結果数 (デフォルト: 20、最大: 1000) |
| `offset` | integer | スキップする結果数 (デフォルト: 0) |

**レスポンス**: `200 OK`#### EntityMap の取得

```http
GET /ngsi-ld/v1/entityMaps/{entityMapId}
```

**レスポンス**: `200 OK`#### EntityMap の更新

```http
PATCH /ngsi-ld/v1/entityMaps/{entityMapId}
Content-Type: application/ld+json
```

**レスポンス**: `204 No Content`#### EntityMap の削除

```http
DELETE /ngsi-ld/v1/entityMaps/{entityMapId}
```

**レスポンス**: `204 No Content`### リンクエンティティの取得 (join/joinLevel)

エンティティ取得エンドポイント (`GET /ngsi-ld/v1/entities` と `GET /ngsi-ld/v1/entities/{entityId}`) では、`join` と `joinLevel` のクエリパラメータを使用してリンクされたエンティティを取得できます。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `join` | string | リンクエンティティ取得モード: `inline` (Relationship 内にネスト) または `flat` (結果配列に追加) |
| `joinLevel` | integer | リンクエンティティ解決の深さ (デフォルト: 1) |

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

| フィールド | タイプ | 必須 | 説明 |
|-----------|-----|------|------|
| `type` | string | ✓ | 固定値: `Subscription` |
| `entities` | array | ✓ | 監視対象のエンティティ (type、id、idPattern) |
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

| パラメータ | タイプ | 説明 | デフォルト |
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

**レスポンス**: `204 No Content`#### CSR サブスクリプションの削除

```http
DELETE /ngsi-ld/v1/csourceSubscriptions/{subscriptionId}
```

**レスポンス**: `204 No Content`### JSON-LD Context 管理

ETSI GS CIM 009 Section 5.12 に準拠した JSON-LD context 管理 API です。ユーザー定義の JSON-LD context の登録と管理が可能です。

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
| `limit` | integer | 取得する結果の最大数 | 20 |
| `offset` | integer | スキップする結果の数 | 0 |

**レスポンス**: `200 OK`#### JSON-LD Context の取得

```http
GET /ngsi-ld/v1/jsonldContexts/{contextId}
```

**キャッシュヘッダー**

レスポンスには以下のキャッシュ関連ヘッダーが含まれます:

| ヘッダー | 説明 |
|---------|------|
| `ETag` | context ボディの MD5 ハッシュ |
| `Last-Modified` | context の作成日時 |
| `Cache-Control` | `public, max-age=3600` |

**条件付きリクエスト**

| リクエストヘッダー | 動作 |
|------------------|------|
| `If-None-Match` | ETag が一致する場合 `304 Not Modified` を返す |
| `If-Modified-Since` | 指定日時以降に変更がない場合 `304 Not Modified` を返す |

**レスポンス**: `200 OK` / `304 Not Modified`#### JSON-LD Context の削除

```http
DELETE /ngsi-ld/v1/jsonldContexts/{contextId}
```

**レスポンス**: `204 No Content`### Vector Tiles (NGSI-LD)

地図可視化のためにエンティティデータを GeoJSON ベクタータイルとして提供します。TileJSON 3.0 準拠のメタデータと、ズームレベルおよびタイル座標による GeoJSON タイルの取得をサポートします。

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
| `type` | string | エンティティタイプのフィルタ |
| `attrs` | string | 取得する属性 (カンマ区切り) |
| `q` | string | NGSI-LD クエリ言語を使用した属性フィルタ |
| `limit` | integer | 取得する結果の最大数 (デフォルト: 20、最大: 1000) |
| `offset` | integer | スキップする結果の数 (デフォルト: 0) |

**レスポンス**: `200 OK` (GeoJSON FeatureCollection 形式)

---## HTTP キャッシュ制御

NGSI-LD GET エンドポイントは、エンドポイントクラスごとにキャッシュ関連のヘッダーを返します:

### データエンドポイント (entities, subscriptions, csourceRegistrations, csourceSubscriptions) — RFC 7232 + RFC 7234 完全サポート

| ヘッダー | 値 | 目的 |
|--------|-------|---------|
| `ETag` | `W/"..."` | 弱い検証子。生成シードには `path + Accept + tenant + Fiware-ServicePath` (tenant = `NGSILD-Tenant` ?? `Fiware-Service`) が含まれるため、異なるエンドポイント / Accept / テナント / ServicePathは常に異なる ETag を生成します。リスト: `id + modifiedAt` のストリーミングダイジェストと総数およびスコープの混合。単一: `modifiedAt` のハッシュとスコープの混合。 |
| `Last-Modified` | RFC 1123 HTTP-date | 結果セット内の最新の `modifiedAt` のタイムスタンプ。 |
| `Cache-Control` | `private, no-cache` | `private` は共有 / 中間キャッシュストレージをブロック; `no-cache` はプライベートキャッシュからの再検証を強制します。 |
| `Vary` | `Fiware-Service, Fiware-ServicePath, Authorization, X-Api-Key, Accept` | 共有キャッシュのためのテナント + 認証 + コンテンツネゴシエーション分離。 |

条件付きリクエストがサポートされています:

| リクエストヘッダー | 動作 |
|----------------|----------|
| `If-None-Match: <ETag>` | 一致した場合、`304 Not Modified` (空のボディ) を返します。 |
| `If-Modified-Since: <HTTP-date>` | リソースが変更されていない場合、`304` を返します。 |
| `Cache-Control: no-store` | サーバーはレスポンス `Cache-Control` を `no-store` にオーバーライドします。 |

### メタエンドポイント (types, attributes) — Cache-Control + Vary のみ (ETag / 304 なし)

| ヘッダー | 値 | 目的 |
|--------|-------|---------|
| `Cache-Control` | `max-age=60, stale-while-revalidate=120` | バックグラウンド再検証を伴う短期キャッシング。 |
| `Vary` | `Fiware-Service, Fiware-ServicePath, Authorization, X-Api-Key, Accept` | データエンドポイントと同じテナント / 認証分離。 |

メタエンドポイントは `ETag` / `Last-Modified` を返さず、`If-None-Match` / `If-Modified-Since` 条件付きリクエストをサポートしません。クライアントは代わりに `max-age` / `stale-while-revalidate` ディレクティブに依存する必要があります。

> **注**: `/ngsi-ld/v1/jsonldContexts/{contextId}` には追加のコンテキスト固有のキャッシュセマンティクスがあります — 上記の JSON-LD コンテキスト管理セクションを参照してください。

完全なセマンティクスについては、[API.md §HTTP Cache Control](./endpoints.md#http-cache-control-etag--conditional-requests) を参照してください。

---

## エンドポイント一覧

ETSI NGSI-LD 互換 Context Broker API。

### 共通仕様

- **Content-Type**: `application/ld+json` または `application/json`- **認証**: `AUTH_ENABLED=true` の場合は必須
- **テナント分離**: `NGSILD-Tenant` または `Fiware-Service` ヘッダー
- **ページネーション**: `limit`/`offset` パラメータ、総数は常に `NGSILD-Results-Count` ヘッダーで返されます
- **OPTIONS メソッド**: すべての NGSI-LD エンドポイントは OPTIONS メソッドをサポートします。`Allow` および `Accept-Patch` ヘッダーと共に 204 レスポンスを返します
- **405 Method Not Allowed**: 許可されていない HTTP メソッドに対して 405 レスポンスを返します (RFC 7807 ProblemDetails 形式、`Allow` ヘッダー付き)
- **エラー形式**: NGSI-LD エラーレスポンスは RFC 7807 ProblemDetails 形式 (`application/json`) で返されます

### エンティティ操作

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/entities` | GET | エンティティリストの取得 | 200 | 400, 401 | ✅ (最大: 1000) |
| `/ngsi-ld/v1/entities` | POST | エンティティの作成 | 201 | 400, 401, 409, 415 | - |
| `/ngsi-ld/v1/entities/{entityId}` | GET | エンティティの取得 | 200 | 400, 401, 404 | - |
| `/ngsi-ld/v1/entities/{entityId}` | PUT | エンティティの置換 | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/entities/{entityId}` | PATCH | エンティティの更新 (マージパッチ) | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/entities/{entityId}` | POST | 属性の追加 | 204/207 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/entities/{entityId}` | DELETE | エンティティの削除 | 204 | 401, 404 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs` | GET | エンティティのすべての属性を取得 | 200 | 401, 404 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs` | POST | 属性の追加 | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs` | PATCH | 属性の部分更新 | 204/207 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}` | GET | 単一属性の取得 | 200 | 401, 404 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}` | POST | 属性の置換 | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}` | PUT | 属性の置換 | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}` | PATCH | 属性の部分更新 | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}` | DELETE | 属性の削除 | 204 | 401, 404 | - |

### タイプ操作

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/types` | GET | エンティティタイプリストの取得 | 200 | 400, 401 | ✅ (最大: 1000) |
| `/ngsi-ld/v1/types/{typeName}` | GET | エンティティタイプ詳細の取得 | 200 | 401, 404 | - |

### 属性操作

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/attributes` | GET | 属性リストの取得 | 200 | 400, 401 | ✅ (最大: 1000) |
| `/ngsi-ld/v1/attributes/{attrName}` | GET | 属性詳細の取得 | 200 | 401, 404 | - |### サブスクリプション操作

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/subscriptions` | GET | サブスクリプション一覧 | 200 | 400, 401 | ✅ (最大: 1000) |
| `/ngsi-ld/v1/subscriptions` | POST | サブスクリプション作成 | 201 | 400, 401, 415 | - |
| `/ngsi-ld/v1/subscriptions/{subscriptionId}` | GET | サブスクリプション取得 | 200 | 401, 404 | - |
| `/ngsi-ld/v1/subscriptions/{subscriptionId}` | PATCH | サブスクリプション更新 | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/subscriptions/{subscriptionId}` | DELETE | サブスクリプション削除 | 204 | 401, 404 | - |

### コンテキストソース登録操作 (フェデレーション)

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/csourceRegistrations` | GET | 登録一覧 | 200 | 400, 401 | ✅ (最大: 1000) |
| `/ngsi-ld/v1/csourceRegistrations` | POST | 登録作成 | 201 | 400, 401, 415 | - |
| `/ngsi-ld/v1/csourceRegistrations/{registrationId}` | GET | 登録取得 | 200 | 401, 404 | - |
| `/ngsi-ld/v1/csourceRegistrations/{registrationId}` | PATCH | 登録更新 | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/csourceRegistrations/{registrationId}` | DELETE | 登録削除 | 204 | 401, 404 | - |

### コンテキストソース登録サブスクリプション操作

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/csourceSubscriptions` | GET | CSR サブスクリプション一覧 | 200 | 400, 401 | ✅ (最大: 1000) |
| `/ngsi-ld/v1/csourceSubscriptions` | POST | CSR サブスクリプション作成 | 201 | 400, 401, 415 | - |
| `/ngsi-ld/v1/csourceSubscriptions/{subscriptionId}` | GET | CSR サブスクリプション取得 | 200 | 401, 404 | - |
| `/ngsi-ld/v1/csourceSubscriptions/{subscriptionId}` | PATCH | CSR サブスクリプション更新 | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/csourceSubscriptions/{subscriptionId}` | DELETE | CSR サブスクリプション削除 | 204 | 401, 404 | - |

### 分散オペレーション情報

| エンドポイント | メソッド | 説明 | 成功 | エラー |
|---------------|---------|------|------|--------|
| `/ngsi-ld/v1/info/sourceIdentity` | GET | ブローカー識別情報の取得 | 200 | - |
| `/ngsi-ld/v1/info/conformance` | GET | NGSI-LD 準拠情報の取得 | 200 | - |

### JSON-LD コンテキスト管理

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/jsonldContexts` | GET | JSON-LD コンテキスト一覧 | 200 | 400, 401 | ✅ (最大: 1000) |
| `/ngsi-ld/v1/jsonldContexts` | POST | JSON-LD コンテキスト登録 | 201 | 400, 401, 409, 415 | - |
| `/ngsi-ld/v1/jsonldContexts/{contextId}` | GET | JSON-LD コンテキスト取得 | 200 | 401, 404 | - |
| `/ngsi-ld/v1/jsonldContexts/{contextId}` | DELETE | JSON-LD コンテキスト削除 | 204 | 401, 404 | - |

### EntityMap 操作

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/entityMaps` | GET | EntityMap 一覧取得 | 200 | 400, 401 | ✅ (最大: 1000) |
| `/ngsi-ld/v1/entityMaps` | POST | EntityMap 作成 | 201 | 400, 401, 415 | - |
| `/ngsi-ld/v1/entityMaps/{entityMapId}` | GET | EntityMap 取得 | 200 | 401, 404 | - |
| `/ngsi-ld/v1/entityMaps/{entityMapId}` | PATCH | EntityMap 更新 | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/entityMaps/{entityMapId}` | DELETE | EntityMap 削除 | 204 | 401, 404 | - |

### スナップショット操作

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/snapshots` | GET | スナップショット一覧取得 | 200 | 400, 401 | ✅ (最大: 1000) |
| `/ngsi-ld/v1/snapshots` | POST | スナップショット作成 | 201 | 400, 401, 415 | - |
| `/ngsi-ld/v1/snapshots` | DELETE | 全スナップショット削除 | 200 | 401 | - |
| `/ngsi-ld/v1/snapshots/{snapshotId}` | GET | スナップショット取得 | 200 | 401, 404 | - |
| `/ngsi-ld/v1/snapshots/{snapshotId}` | PATCH | スナップショットステータス更新 | 204 | 400, 401, 404 | - |
| `/ngsi-ld/v1/snapshots/{snapshotId}` | DELETE | スナップショット削除 | 204 | 401, 404 | - |
| `/ngsi-ld/v1/snapshots/{snapshotId}/clone` | POST | スナップショット複製 (復元) | 200 | 400, 401, 404 | - |

### バッチ操作

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/entityOperations/create` | POST | バッチ作成 (最大: 1000) | 200/201 | 400, 401, 415 | - |
| `/ngsi-ld/v1/entityOperations/upsert` | POST | バッチアップサート (最大: 1000) | 200/201 | 400, 401, 415 | - |
| `/ngsi-ld/v1/entityOperations/update` | POST | バッチ更新 (最大: 1000) | 200/204 | 400, 401, 415 | - |
| `/ngsi-ld/v1/entityOperations/delete` | POST | バッチ削除 (最大: 1000) | 200/204 | 400, 401, 415 | - |
| `/ngsi-ld/v1/entityOperations/query` | POST | バッチクエリ | 200 | 400, 401, 415 | ✅ (最大: 1000) |
| `/ngsi-ld/v1/entityOperations/merge` | POST | バッチマージパッチ (最大: 1000) | 204/207 | 400, 401, 415 | - |
| `/ngsi-ld/v1/entityOperations/purge` | POST | エンティティ一括削除 | 204 | 400, 401, 415 | - |

### Temporal API (時系列データ)

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/temporal/entities` | GET | 時系列エンティティ一覧取得 | 200 | 400, 401 | ✅ (最大: 1000) |
| `/ngsi-ld/v1/temporal/entities` | POST | 時系列エンティティ作成 | 201 | 400, 401, 409, 415 | - |
| `/ngsi-ld/v1/temporal/entities/{entityId}` | GET | 時系列エンティティ取得 | 200 | 400, 401, 404 | - |
| `/ngsi-ld/v1/temporal/entities/{entityId}` | PATCH | 時系列エンティティの属性マージ | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/temporal/entities/{entityId}` | DELETE | 時系列エンティティ削除 | 204 | 401, 404 | - |
| `/ngsi-ld/v1/temporal/entities/{entityId}/attrs` | POST | 属性インスタンス追加 | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/temporal/entities/{entityId}/attrs/{attrName}` | DELETE | 属性インスタンス削除 | 204 | 401, 404 | - |
| `/ngsi-ld/v1/temporal/entities/{entityId}/attrs/{attrName}/{instanceId}` | PATCH | 属性インスタンス変更 | 204 | 400, 401, 404 | - |
| `/ngsi-ld/v1/temporal/entityOperations/create` | POST | 時系列バッチ作成 (最大: 1000) | 201/207 | 400, 401, 415 | - |
| `/ngsi-ld/v1/temporal/entityOperations/upsert` | POST | 時系列バッチアップサート (最大: 1000) | 204/207 | 400, 401, 415 | - |
| `/ngsi-ld/v1/temporal/entityOperations/delete` | POST | 時系列バッチ削除 | 204/207 | 400, 401, 415 | - |
| `/ngsi-ld/v1/temporal/entityOperations/query` | POST | 時系列バッチクエリ | 200 | 400, 401, 415 | ✅ (最大: 1000) |### ベクタータイル操作

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/tiles` | GET | TileJSON 3.0 メタデータを取得 | 200 | 401 | - |
| `/ngsi-ld/v1/tiles/{z}/{x}/{y}.geojson` | GET | GeoJSON タイルを取得 | 200 | 400, 401 | ✅ (最大: 1000) |