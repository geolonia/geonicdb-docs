---
title: "NGSI-LD API"
description: "NGSI-LD API リファレンス"
outline: deep
---
# NGSI-LD API

> このドキュメントは [API.md](./endpoints.md) から分離されたものです。メインのAPI仕様については [API.md](./endpoints.md) を参照してください。

---

NGSI-LD は JSON-LD ベースのコンテキスト情報管理APIです。

## 仕様準拠

このドキュメントは **[ETSI GS CIM 009 V1.9.1 (2025-07)](https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/01.09.01_60/gs_CIM009v010901p.pdf)** に準拠しています。各機能の詳細については、以下の ETSI 仕様セクションを参照してください：

| 機能カテゴリ | ETSI GS CIM 009 セクション |
|-------------|---------------------------|
| エンティティ操作 | Section 5.6 |
| クエリ操作 | Section 5.7 |
| サブスクリプション | Section 5.8 |
| Context Source Registration | Section 5.9 |
| Temporal API | Section 5.6.12-5.6.19 |
| EntityMaps | Section 5.14 |
| JSON-LD Context 管理 | Section 5.11 |
| 分散オペレーション | Section 5.10 |

### コンテンツネゴシエーションと @context

NGSI-LD API は `Accept` ヘッダーによるコンテンツネゴシエーションをサポートします。

| Accept ヘッダー | レスポンス形式 | @context の扱い |
|----------------|--------------|----------------|
| `application/ld+json` | JSON-LD | レスポンスボディ内に `@context` を含む |
| `application/json` | JSON | `@context` は `Link` ヘッダーで返却 |
| `application/geo+json` | GeoJSON | `@context` は `Link` ヘッダーで返却 |

`Accept: application/json` の場合、レスポンスに `Link` ヘッダーが付与されます：

```text
Link: <https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"
```

### 自然言語照合（lang + orderBy）

`lang` パラメータと `orderBy` を組み合わせることで、指定した言語のロケールに基づいたソートが可能です。例えば `lang=ja` で日本語の照合順序によるソートが適用されます。

### エンティティ操作 (NGSI-LD)

> **ETSI GS CIM 009 参照**: Section 5.6 - Entity Operations

#### エンティティ一覧の取得

```http
GET /ngsi-ld/v1/entities
```

**リクエストヘッダー**

```text
Accept: application/ld+json
Link: <https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"
```

**クエリパラメータ**

| パラメータ | 型 | 説明 | デフォルト |
|-----------|-----|------|-----------|
| `id` | string | エンティティIDでフィルタ（カンマ区切りで複数指定可、URI形式） | - |
| `limit` | integer | 取得件数 | 20 |
| `offset` | integer | オフセット | 0 |
| `orderBy` | string | ソート基準（`entityId`, `entityType`, `modifiedAt`） | - |
| `orderDirection` | string | ソート方向（`asc`, `desc`） | `asc` |
| `type` | string | エンティティタイプでフィルタ | - |
| `idPattern` | string | エンティティIDの正規表現パターン | - |
| `q` | string | 属性値によるフィルタ | - |
| `attrs` | string | 取得する属性名（カンマ区切り） | - |
| `pick` | string | 取得する属性名（カンマ区切り、`omit` と排他） | - |
| `omit` | string | 除外する属性名（カンマ区切り、`pick` と排他、`id`/`type` は不可） | - |
| `scopeQ` | string | スコープクエリ（例: `/Madrid`, `/Madrid/#`, `/Madrid/+`） | - |
| `lang` | string | LanguageProperty の言語フィルタ（BCP 47、カンマ区切り優先度順、`*` で全言語） | - |
| `georel` | string | ジオクエリ演算子 | - |
| `geometry` | string | ジオメトリタイプ | - |
| `coordinates` | string | 座標 | - |
| `spatialId` | string | 空間ID（ZFXY形式）でフィルタ（[空間ID検索](./endpoints.md#空間id検索)参照） | - |
| `spatialIdDepth` | integer | 空間ID階層展開の深さ（0-4） | 0 |
| `crs` | string | 座標参照系（[座標参照系（CRS）](./endpoints.md#座標参照系crs)参照）。URN形式も可 | `EPSG:4326` |
| `geoproperty` | string | 地理クエリに使用する GeoProperty 名 | `location` |
| `format` | string | 出力形式（`simplified` で keyValues 形式、`geojson` で GeoJSON 形式）。`Accept: application/geo+json` ヘッダーでも GeoJSON 指定可能 | - |
| `expandValues` | string | 展開する属性名（カンマ区切り、値を展開して返却） | - |
| `options` | string | `keyValues`, `concise`, `entityMap`, `sysAttrs`（システム属性出力）, `splitEntities`（タイプ別にレスポンスを分割） | - |

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
| `NGSILD-Results-Count` | 総件数（常に返却） |

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

**Transient Entity (expiresAt)**

エンティティに `expiresAt` フィールド（ISO 8601形式）を指定すると、有効期限付きのTransient Entityとして作成されます。有効期限は未来の日時でなければなりません。

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
- ステータス: `201 Created`
- ヘッダー: `Location: /ngsi-ld/v1/entities/urn:ngsi-ld:Room:001`

#### 単一エンティティの取得

```http
GET /ngsi-ld/v1/entities/{entityId}
```

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `type` | string | エンティティタイプ |
| `attrs` | string | 取得する属性名（カンマ区切り） |
| `pick` | string | 取得する属性名（カンマ区切り、`omit` と排他） |
| `omit` | string | 除外する属性名（カンマ区切り、`pick` と排他、`id`/`type` は不可） |
| `lang` | string | LanguageProperty の言語フィルタ（BCP 47） |
| `options` | string | `keyValues`, `concise`, `entityMap` |

#### エンティティの置換

```http
PUT /ngsi-ld/v1/entities/{entityId}
```

エンティティの全属性を置換します。リクエストボディに含まれない属性は削除されます。

**レスポンス**: `204 No Content`

#### エンティティの更新

```http
PATCH /ngsi-ld/v1/entities/{entityId}
```

**Merge-Patch セマンティクス** (ETSI GS CIM 009 Section 5.6.4):

- `Content-Type: application/merge-patch+json` を使用すると、リクエストボディに含まれない属性は保持されます（マージモード）。通常の `application/json` / `application/ld+json` では全属性が置換されます。
- `urn:ngsi-ld:null` をプロパティ値として指定すると、その属性が削除されます。
- クエリパラメータ `options=keyValues` または `options=concise` を指定すると、簡略化された入力形式を使用できます。

**レスポンス**: `204 No Content`

#### 属性の追加

```http
POST /ngsi-ld/v1/entities/{entityId}
Content-Type: application/ld+json
```

**クエリパラメータ**

| パラメータ | 説明 |
|-----------|------|
| `options=noOverwrite` | 既存の属性を上書きしない（既存属性はそのまま保持し、新規属性のみ追加） |

**レスポンス**: `204 No Content`

#### 属性の部分更新（複数属性）

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

#### エンティティの削除

```http
DELETE /ngsi-ld/v1/entities/{entityId}
```

**レスポンス**: `204 No Content`

#### エンティティの全属性取得

```http
GET /ngsi-ld/v1/entities/{entityId}/attrs
```

エンティティのすべての属性を取得します。

**レスポンス**: `200 OK`

#### 単一属性の取得

```http
GET /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
```

エンティティの特定の属性を取得します。

**レスポンス**: `200 OK`

#### 属性の上書き（PUT）

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

> **注意**: エンティティまたは属性が存在しない場合は `404 Not Found` が返されます（ETSI GS CIM 009 V1.9.1 clause 5.6.4）。この操作は既存の属性の部分更新のみを行い、新規属性の作成は行いません。

#### 属性の削除

```http
DELETE /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
```

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `datasetId` | string | 削除するマルチアトリビュートインスタンスの datasetId |
| `deleteAll` | boolean | `true` の場合、すべてのインスタンスを削除 |

**レスポンス**: `204 No Content`

### マルチアトリビュート（datasetId）

> **ETSI GS CIM 009 参照**: Section 4.5.3 - Multi-Attribute

NGSI-LD では、同じ属性名に対して複数のインスタンスを保持できます。各インスタンスは `datasetId`（URI形式）で区別されます。`datasetId` を持たないインスタンスは「デフォルトインスタンス」と呼ばれ、属性ごとに最大1つまでです。

#### 作成（CREATE）

エンティティ作成時に、属性を配列形式で指定することで複数インスタンスを作成できます。

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

上記の例では `speed` 属性に3つのインスタンスがあります: GPS由来、OBD由来、デフォルトインスタンスの3つです。

#### 取得（RETRIEVE）

エンティティ取得時、マルチアトリビュートは配列形式で返却されます。`keyValues` 形式ではデフォルトインスタンス（`datasetId` なし）の値のみが返されます。

#### 更新（UPDATE）

属性更新（PATCH/POST）時に `datasetId` を指定することで、特定のインスタンスのみを更新できます。

```json
{
  "speed": {
    "type": "Property",
    "value": 60,
    "datasetId": "urn:ngsi-ld:dataset:gps"
  }
}
```

#### 削除（DELETE）

属性削除時に `datasetId` クエリパラメータを指定すると、特定のインスタンスのみを削除します。`deleteAll=true` を指定すると、すべてのインスタンスを削除します。

```http
DELETE /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}?datasetId=urn:ngsi-ld:dataset:gps
DELETE /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}?deleteAll=true
```

---

### バッチ操作 (NGSI-LD)

> **注記**: バッチ操作は1回のリクエストで最大 **1,000 件** までのエンティティを処理できます。1,000 件を超えるリクエストは `400 Bad Request` エラーになります。

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
- 全て成功: `201 Created`
- 部分成功: `207 Multi-Status`

#### バッチ Upsert

```http
POST /ngsi-ld/v1/entityOperations/upsert
```

**クエリパラメータ**

| パラメータ | 説明 |
|-----------|------|
| `options=replace` | 既存エンティティの全属性を置換 |

**レスポンス**
- 全て成功: `201 Created`（新規作成）または `204 No Content`（更新）
- 部分成功: `207 Multi-Status`

#### バッチ更新

```http
POST /ngsi-ld/v1/entityOperations/update
```

**レスポンス**
- 全て成功: `204 No Content`
- 部分成功: `207 Multi-Status`

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
- 全て成功: `204 No Content`
- 部分成功: `207 Multi-Status`

#### エンティティパージ

```http
POST /ngsi-ld/v1/entityOperations/purge
Content-Type: application/json
```

指定したタイプのエンティティを一括削除します。ETSI NGSI-LD 仕様 Section 5.6.14 準拠。

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `type` | string | 削除対象のエンティティタイプ（必須） |

**レスポンス**
- 成功: `204 No Content`
- タイプ未指定: `400 Bad Request`

#### バッチクエリ

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

複数エンティティに対して Merge-Patch セマンティクスで一括更新を行います。既存属性はマージされ、リクエストに含まれない属性は保持されます。`urn:ngsi-ld:null` を値として指定すると属性を削除できます。

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
- 全て成功: `204 No Content`
- 部分成功: `207 Multi-Status`

---

### Temporal バッチ操作 (NGSI-LD)

> **ETSI GS CIM 009 参照**: Section 5.6.12-5.6.19 - Temporal Representation of Entities

時系列エンティティに対するバッチ操作です。1回のリクエストで最大 **1,000 件** まで処理できます。

> **注記**: temporal entityOperations の create / upsert / delete は ETSI GS CIM 009 仕様には含まれない GeonicDB 独自拡張です。query のみ仕様準拠です。これらの拡張機能は、時系列データの一括取り込み効率化のために提供されています。

#### Temporal バッチ作成

```http
POST /ngsi-ld/v1/temporal/entityOperations/create
Content-Type: application/ld+json
```

時系列エンティティを一括作成します。リクエストボディは時系列エンティティの配列です。

**レスポンス**: 全件成功時 `201 Created`、一部失敗時 `207 Multi-Status`

#### Temporal バッチ Upsert

```http
POST /ngsi-ld/v1/temporal/entityOperations/upsert
Content-Type: application/ld+json
```

時系列エンティティを一括作成または更新（既存エンティティには属性を追加）します。

**レスポンス**: 全件成功時 `204 No Content`、一部失敗時 `207 Multi-Status`

#### Temporal バッチ削除

```http
POST /ngsi-ld/v1/temporal/entityOperations/delete
Content-Type: application/ld+json
```

時系列エンティティを一括削除します。リクエストボディはエンティティIDの配列です。

**レスポンス**: 全件成功時 `204 No Content`、一部失敗時 `207 Multi-Status`

#### Temporal バッチクエリ

```http
POST /ngsi-ld/v1/temporal/entityOperations/query
Content-Type: application/ld+json
```

POST ベースの時系列クエリです。リクエストボディにクエリ条件を指定します。

**リクエストボディ例**:

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

#### Temporal クエリパラメータ

時系列エンティティの GET エンドポイントでは以下のクエリパラメータを使用できます。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `timerel` | string | 時間関係演算子（`after`, `before`, `between`） |
| `timeAt` | string | 基準時刻（ISO 8601形式） |
| `endTimeAt` | string | 終了時刻（`timerel=between` 時に必要、ISO 8601形式） |
| `lastN` | integer | 最新N件のインスタンスのみ返却（正の整数、ETSI GS CIM 009 Section 5.6.12） |
| `options` | string | `temporalValues`: 簡略化された時系列表現 |

**lastN パラメータ**

`lastN` を指定すると、時系列データの最新N件のインスタンスのみが返されます。`timerel`/`timeAt` と組み合わせることで、時間範囲内の最新N件を取得できます。

```bash
# 最新10件の時系列データを取得
curl "http://localhost:3000/ngsi-ld/v1/temporal/entities/urn:ngsi-ld:Sensor:001?lastN=10" \
  -H "Fiware-Service: myservice"
```

#### Temporal レスポンス形式オプション

`options=temporalValues` を指定すると、各属性が `values` 配列（`[value, timestamp]` ペア）を持つ簡略化された形式で返却されます。

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

#### Temporal 集計クエリ（単一エンティティ）

時系列エンティティの GET エンドポイントでは `aggrMethods` と `aggrPeriodDuration` クエリパラメータで集計クエリを実行できます。一覧取得エンドポイントと単一エンティティ取得エンドポイントの両方で使用可能です。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `aggrMethods` | string | 集計メソッド（カンマ区切り）: `totalCount`, `distinctCount`, `sum`, `avg`, `min`, `max`, `stddev`, `sumsq` |
| `aggrPeriodDuration` | string | ISO 8601 期間（例: `PT1H` で1時間）。`aggrMethods` 指定時は必須 |

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

> **注意**: `aggrMethods` を指定して `aggrPeriodDuration` を省略すると `400 Bad Request` エラーが返されます。

---

### エンティティタイプ操作 (NGSI-LD)

#### タイプ一覧の取得

```http
GET /ngsi-ld/v1/types
```

**パラメータ**: `limit`, `offset`

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

**ヘッダー**: `NGSILD-Results-Count` で総件数を返却

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

#### 属性一覧の取得

```http
GET /ngsi-ld/v1/attributes
```

**パラメータ**: `limit`, `offset`

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

**ヘッダー**: `NGSILD-Results-Count` で総件数を返却

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

---

### サブスクリプション (NGSI-LD)

> **ETSI GS CIM 009 参照**: Section 5.8 - Subscription Operations

#### サブスクリプションの作成

```http
POST /ngsi-ld/v1/subscriptions
Content-Type: application/ld+json
```

**HTTP通知の例**

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

**MQTT通知の例**

NGSI-LDでは、エンドポイントURIに `mqtt://` または `mqtts://` スキームを使用し、トピックをパスとして指定します。MQTT固有の設定は `notifierInfo` で指定します。

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

**MQTT notifierInfo設定**

| キー | 値 | 説明 |
|-----|-----|------|
| `MQTT-Version` | `mqtt3.1.1` または `mqtt5.0` | MQTTプロトコルバージョン |
| `MQTT-QoS` | `0`, `1`, または `2` | QoSレベル |

**サブスクリプション拡張フィールド**

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `cooldown` | integer | 通知の最小間隔（秒）。正の整数のみ。指定した秒数以内に再通知しない |
| `notificationTrigger` | string[] | 通知をトリガーするイベントタイプ。`entityCreated`, `entityUpdated`, `entityChanged`, `entityDeleted`, `attributeCreated`, `attributeUpdated`, `attributeDeleted`。`entityChanged` は属性値が実際に変化した場合のみトリガーされる（同じ値での更新は無視） |
| `showChanges` | boolean | `true` の場合、変更前の属性値を `previousValue` として通知データに含める |
| `notification.onlyChangedAttrs` | boolean | `true` の場合、実際に変更された属性のみを通知ペイロードに含める。`notification.attributes` と組み合わせ可能 |
| `expiresAt` | string (ISO 8601) | サブスクリプションの有効期限 |

**バリデーション**
- `watchedAttributes` と `timeInterval` は相互排他です。両方を同時に指定すると `400 Bad Request` が返されます（ETSI GS CIM 009 V1.9.1 clause 5.8.1）

**レスポンス**
- ステータス: `201 Created`
- ヘッダー: `Location: /ngsi-ld/v1/subscriptions/{subscriptionId}`

#### サブスクリプション一覧

```http
GET /ngsi-ld/v1/subscriptions
```

**クエリパラメータ**

| パラメータ | 型 | 説明 | デフォルト |
|-----------|-----|------|-----------|
| `limit` | integer | 取得件数 | 20 |
| `offset` | integer | オフセット | 0 |

#### サブスクリプションの取得

```http
GET /ngsi-ld/v1/subscriptions/{subscriptionId}
```

**通知ステータスフィールド（読み取り専用）**

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `notification.status` | string | `ok` または `failed` |
| `notification.lastNotification` | string | 最後の通知送信日時（ISO 8601） |
| `notification.lastFailure` | string | 最後の通知失敗日時（ISO 8601） |
| `notification.lastFailureReason` | string | 最後の失敗理由（例: `HTTP 500: Internal Server Error`）。成功時にクリアされる |
| `notification.lastSuccess` | string | 最後の通知成功日時（ISO 8601） |
| `notification.timesSent` | integer | 通知送信回数 |

**リトライ動作**: 通知送信に失敗した場合、一時的なエラー（5xx、ネットワークエラー）に対して最大3回のリトライを指数バックオフ（1秒、2秒、4秒）で実行します。4xx エラーではリトライしません。

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

#### オーナーシップ検証（GeonicDB 独自拡張）

認証有効時（`AUTH_ENABLED=true`）、サブスクリプションの更新（PATCH）および削除（DELETE）は `createdBy` フィールドに基づくオーナーシップ検証を行います。作成者以外のユーザーがこれらの操作を実行すると `403 Forbidden` が返されます。`super_admin` および `tenant_admin` ロールはこの検証をバイパスできます。詳細は AUTH.md を参照してください。

---

### 登録 (NGSI-LD)

NGSI-LD では Context Source Registration（コンテキストソース登録）として、外部のコンテキストプロバイダーを登録します。

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
| `type` | string | ✓ | `ContextSourceRegistration` 固定 |
| `registrationName` | string | - | 登録名 |
| `description` | string | - | 登録の説明 |
| `endpoint` | string | ✓ | プロバイダーのエンドポイントURL |
| `information` | array | ✓ | 提供情報（entities, propertyNames, relationshipNames） |
| `observationInterval` | object | - | 観測期間（start, end） |
| `managementInterval` | object | - | 管理期間（start, end） |
| `location` | GeoJSON | - | 地理的範囲 |
| `expiresAt` | string | - | 有効期限（ISO 8601形式） |
| `status` | string | - | ステータス（`active` / `inactive`） |
| `mode` | string | - | モード（`inclusive` / `exclusive` / `redirect` / `auxiliary`） |

**レスポンス**
- ステータス: `201 Created`
- ヘッダー: `Location: /ngsi-ld/v1/csourceRegistrations/{registrationId}`

#### 登録一覧の取得

```http
GET /ngsi-ld/v1/csourceRegistrations
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

#### オーナーシップ検証（GeonicDB 独自拡張）

認証有効時（`AUTH_ENABLED=true`）、登録の更新（PATCH）および削除（DELETE）は `createdBy` フィールドに基づくオーナーシップ検証を行います。作成者以外のユーザーがこれらの操作を実行すると `403 Forbidden` が返されます。`super_admin` および `tenant_admin` ロールはこの検証をバイパスできます。詳細は AUTH.md を参照してください。

#### CSR 高度フィールド（ETSI GS CIM 009 V1.8.1）

Context Source Registration では以下の高度フィールドがサポートされています：

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `cacheDuration` | string (ISO 8601 duration) | コンテキストソースからのレスポンスのキャッシュ期間 |
| `refreshRate` | string (ISO 8601 duration) | コンテキストソースへの定期的なリフレッシュ間隔 |
| `timeout` | integer (ms) | コンテキストソースへのリクエストタイムアウト |
| `contextSourceAlias` | string | コンテキストソースのエイリアス名 |
| `contextSourceInfo` | object[] | コンテキストソースの追加メタデータ |
| `operationGroup` | string[] | オペレーショングループ: `federationOps`, `retrieveOps`, `updateOps`, `redirectionOps` |

### 分散オペレーション情報

#### ブローカーアイデンティティ取得

```http
GET /ngsi-ld/v1/info/sourceIdentity
```

コンテキストブローカーのアイデンティティ情報を返します。分散環境でのブローカー識別に使用されます。

**レスポンス**: `200 OK` (`application/ld+json`)

#### 適合性情報取得

```http
GET /ngsi-ld/v1/info/conformance
```

NGSI-LD 仕様への準拠状況を返します。

**レスポンス**: `200 OK` (`application/ld+json`)

#### 分散クエリパラメータ

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `localOnly` | boolean | `true` の場合、フェデレーションをスキップしてローカルデータのみ返す |
| `csf` | string | Context Source Filter 式（例: `name==value`, `endpoint~=pattern`） |

#### 分散オペレーション応答ヘッダー

| ヘッダー | 説明 |
|----------|------|
| `NGSILD-Warning` | フェデレーション中にコンテキストソースの一部が失敗した場合に設定される警告メッセージ（ETSI GS CIM 009 - 6.3.6） |
| `Via` | 分散オペレーションのループ検出用ヘッダー。ブローカーは転送リクエストに自身のIDを追加する（ETSI GS CIM 009 - 6.3.5） |

#### CSR変更通知

Context Source Registrationが作成・更新・削除されると、マッチするCSource Subscriptionの通知エンドポイントに自動的に通知が送信されます（ETSI GS CIM 009 - 5.11）。通知には `Ngsild-Trigger` ヘッダーが含まれ、変更種別（`csourceRegistration-created`、`csourceRegistration-updated`、`csourceRegistration-deleted`）が示されます。

#### 分散タイプ・属性探索

`/ngsi-ld/v1/types` および `/ngsi-ld/v1/attributes` エンドポイントは、ローカルエンティティに加えてContext Source Registrationsに登録されたエンティティタイプと属性も含めて返します（ETSI GS CIM 009 - 5.9.3.3）。

### EntityMap 操作

> **ETSI GS CIM 009 参照**: Section 5.14 - Entity Map

NGSI-LD の EntityMap は、クエリ結果をマップとして保存し、後からエンティティ ID で効率的にアクセスできるようにする機能です。

#### EntityMap 形式でのエンティティ取得

`GET /ngsi-ld/v1/entities` のクエリパラメータに `options=entityMap` を指定すると、レスポンスがエンティティID をキーとしたオブジェクト形式で返されます。

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

**レスポンス**: `201 Created`、`Location` ヘッダーに作成された EntityMap の URL

#### EntityMap 一覧の取得

```http
GET /ngsi-ld/v1/entityMaps
```

**クエリパラメータ**

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `limit` | integer | 取得件数上限（デフォルト: 20、最大: 1000） |
| `offset` | integer | スキップ件数（デフォルト: 0） |

**レスポンス**: `200 OK`

#### EntityMap の取得

```http
GET /ngsi-ld/v1/entityMaps/{entityMapId}
```

**レスポンス**: `200 OK`

#### EntityMap の更新

```http
PATCH /ngsi-ld/v1/entityMaps/{entityMapId}
Content-Type: application/ld+json
```

**レスポンス**: `204 No Content`

#### EntityMap の削除

```http
DELETE /ngsi-ld/v1/entityMaps/{entityMapId}
```

**レスポンス**: `204 No Content`

### リンクエンティティ取得（join/joinLevel）

エンティティ取得エンドポイント（`GET /ngsi-ld/v1/entities` および `GET /ngsi-ld/v1/entities/{entityId}`）で、`join` と `joinLevel` クエリパラメータを使用してリンクされたエンティティを取得できます。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `join` | string | リンクエンティティ取得モード: `inline`（Relationship 内にネスト）または `flat`（結果配列に追加） |
| `joinLevel` | integer | リンクエンティティ解決の深さ（デフォルト: 1） |

**使用例**

```bash
# inline モード - リンクされたエンティティが Relationship 内にネストされる
curl "https://api.example.com/ngsi-ld/v1/entities?type=Room&join=inline&joinLevel=2" \
  -H "Fiware-Service: smartcity"

# flat モード - リンクされたエンティティが結果配列に追加される
curl "https://api.example.com/ngsi-ld/v1/entities/urn:ngsi-ld:Room:001?join=flat&joinLevel=1" \
  -H "Fiware-Service: smartcity"
```

### コンテキストソースレジストレーションサブスクリプション

NGSI-LD では Context Source Registration Subscription（CSRサブスクリプション）として、コンテキストソースの登録変更を監視するサブスクリプションを管理します。

#### CSRサブスクリプションの作成

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
| `type` | string | ✓ | `Subscription` 固定 |
| `entities` | array | ✓ | 監視対象エンティティ（type, id, idPattern） |
| `notification` | object | ✓ | 通知設定（endpoint.uri が必須） |
| `description` | string | - | サブスクリプションの説明 |
| `watchedAttributes` | array | - | 監視対象属性のリスト |
| `expiresAt` | string | - | 有効期限（ISO 8601形式） |
| `throttling` | number | - | 通知間隔（秒） |
| `isActive` | boolean | - | アクティブ状態（デフォルト: true） |

**レスポンス**
- ステータス: `201 Created`
- ヘッダー: `Location: /ngsi-ld/v1/csourceSubscriptions/{subscriptionId}`

#### CSRサブスクリプション一覧の取得

```http
GET /ngsi-ld/v1/csourceSubscriptions
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

#### CSRサブスクリプションの取得

```http
GET /ngsi-ld/v1/csourceSubscriptions/{subscriptionId}
```

#### CSRサブスクリプションの更新

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

#### CSRサブスクリプションの削除

```http
DELETE /ngsi-ld/v1/csourceSubscriptions/{subscriptionId}
```

**レスポンス**: `204 No Content`

### JSON-LD コンテキスト管理

ETSI GS CIM 009 Section 5.12 準拠の JSON-LD コンテキスト管理 API です。ユーザー定義の JSON-LD コンテキストを登録・管理できます。

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
- ステータス: `201 Created`
- ヘッダー: `Location: /ngsi-ld/v1/jsonldContexts/{contextId}`

#### JSON-LD コンテキスト一覧の取得

```http
GET /ngsi-ld/v1/jsonldContexts
```

**クエリパラメータ**

| パラメータ | 型 | 説明 | デフォルト |
|-----------|-----|------|-----------|
| `limit` | integer | 取得件数上限 | 20 |
| `offset` | integer | スキップ件数 | 0 |

**レスポンス**: `200 OK`

#### JSON-LD コンテキストの取得

```http
GET /ngsi-ld/v1/jsonldContexts/{contextId}
```

**キャッシュヘッダー**

レスポンスには以下のキャッシュ関連ヘッダーが含まれます:

| ヘッダー | 説明 |
|---------|------|
| `ETag` | コンテキスト本文の MD5 ハッシュ |
| `Last-Modified` | コンテキストの作成日時 |
| `Cache-Control` | `public, max-age=3600` |

**条件付きリクエスト**

| リクエストヘッダー | 動作 |
|------------------|------|
| `If-None-Match` | ETag が一致する場合 `304 Not Modified` を返す |
| `If-Modified-Since` | 指定日時以降に変更がない場合 `304 Not Modified` を返す |

**レスポンス**: `200 OK` / `304 Not Modified`

#### JSON-LD コンテキストの削除

```http
DELETE /ngsi-ld/v1/jsonldContexts/{contextId}
```

**レスポンス**: `204 No Content`

### ベクトルタイル (NGSI-LD)

エンティティデータを GeoJSON ベクトルタイルとしてマップ可視化向けに提供します。TileJSON 3.0 準拠のメタデータと、ズームレベル・タイル座標指定による GeoJSON タイル取得が可能です。

#### TileJSON メタデータの取得

```http
GET /ngsi-ld/v1/tiles
```

**レスポンス**: `200 OK`（TileJSON 3.0 形式）

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
| `attrs` | string | 取得する属性（カンマ区切り） |
| `q` | string | NGSI-LD クエリ言語による属性フィルタ |
| `limit` | integer | 取得件数上限（デフォルト: 20、最大: 1000） |
| `offset` | integer | スキップ件数（デフォルト: 0） |

**レスポンス**: `200 OK`（GeoJSON FeatureCollection 形式）

---

## エンドポイント一覧

ETSI NGSI-LD 互換の Context Broker API です。

### 共通仕様

- **Content-Type**: `application/ld+json` または `application/json`
- **認証**: `AUTH_ENABLED=true` の場合は必須
- **テナント分離**: `NGSILD-Tenant` または `Fiware-Service` ヘッダー
- **ページネーション**: `limit`/`offset` パラメータ、総件数は常に `NGSILD-Results-Count` ヘッダーで返却
- **OPTIONS メソッド**: すべての NGSI-LD エンドポイントで OPTIONS メソッドに対応。`Allow` および `Accept-Patch` ヘッダーを含む 204 レスポンスを返却
- **405 Method Not Allowed**: 許可されていない HTTP メソッドに対しては 405 レスポンスを返却（RFC 7807 ProblemDetails 形式、`Allow` ヘッダー付き）
- **エラー形式**: NGSI-LD エラーレスポンスは RFC 7807 ProblemDetails 形式 (`application/json`) で返却

### エンティティ操作

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/entities` | GET | エンティティ一覧取得 | 200 | 400, 401 | ✅ (max: 1000) |
| `/ngsi-ld/v1/entities` | POST | エンティティ作成 | 201 | 400, 401, 409, 415 | - |
| `/ngsi-ld/v1/entities/{entityId}` | GET | エンティティ取得 | 200 | 400, 401, 404 | - |
| `/ngsi-ld/v1/entities/{entityId}` | PUT | エンティティ置換 | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/entities/{entityId}` | PATCH | エンティティ更新（マージパッチ） | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/entities/{entityId}` | POST | 属性追加 | 204/207 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/entities/{entityId}` | DELETE | エンティティ削除 | 204 | 401, 404 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs` | GET | エンティティの全属性取得 | 200 | 401, 404 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs` | POST | 属性追加 | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs` | PATCH | 属性部分更新 | 204/207 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}` | GET | 単一属性取得 | 200 | 401, 404 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}` | POST | 属性置換 | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}` | PUT | 属性置換 | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}` | PATCH | 属性部分更新 | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}` | DELETE | 属性削除 | 204 | 401, 404 | - |

### タイプ操作

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/types` | GET | エンティティタイプ一覧取得 | 200 | 400, 401 | ✅ (max: 1000) |
| `/ngsi-ld/v1/types/{typeName}` | GET | エンティティタイプ詳細取得 | 200 | 401, 404 | - |

### 属性操作

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/attributes` | GET | 属性一覧取得 | 200 | 400, 401 | ✅ (max: 1000) |
| `/ngsi-ld/v1/attributes/{attrName}` | GET | 属性詳細取得 | 200 | 401, 404 | - |

### サブスクリプション操作

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/subscriptions` | GET | サブスクリプション一覧 | 200 | 400, 401 | ✅ (max: 1000) |
| `/ngsi-ld/v1/subscriptions` | POST | サブスクリプション作成 | 201 | 400, 401, 415 | - |
| `/ngsi-ld/v1/subscriptions/{subscriptionId}` | GET | サブスクリプション取得 | 200 | 401, 404 | - |
| `/ngsi-ld/v1/subscriptions/{subscriptionId}` | PATCH | サブスクリプション更新 | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/subscriptions/{subscriptionId}` | DELETE | サブスクリプション削除 | 204 | 401, 404 | - |

### コンテキストソースレジストレーション操作（フェデレーション）

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/csourceRegistrations` | GET | レジストレーション一覧 | 200 | 400, 401 | ✅ (max: 1000) |
| `/ngsi-ld/v1/csourceRegistrations` | POST | レジストレーション作成 | 201 | 400, 401, 415 | - |
| `/ngsi-ld/v1/csourceRegistrations/{registrationId}` | GET | レジストレーション取得 | 200 | 401, 404 | - |
| `/ngsi-ld/v1/csourceRegistrations/{registrationId}` | PATCH | レジストレーション更新 | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/csourceRegistrations/{registrationId}` | DELETE | レジストレーション削除 | 204 | 401, 404 | - |

### コンテキストソースレジストレーションサブスクリプション操作

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/csourceSubscriptions` | GET | CSRサブスクリプション一覧 | 200 | 400, 401 | ✅ (max: 1000) |
| `/ngsi-ld/v1/csourceSubscriptions` | POST | CSRサブスクリプション作成 | 201 | 400, 401, 415 | - |
| `/ngsi-ld/v1/csourceSubscriptions/{subscriptionId}` | GET | CSRサブスクリプション取得 | 200 | 401, 404 | - |
| `/ngsi-ld/v1/csourceSubscriptions/{subscriptionId}` | PATCH | CSRサブスクリプション更新 | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/csourceSubscriptions/{subscriptionId}` | DELETE | CSRサブスクリプション削除 | 204 | 401, 404 | - |

### 分散オペレーション情報

| エンドポイント | メソッド | 説明 | 成功 | エラー |
|---------------|---------|------|------|--------|
| `/ngsi-ld/v1/info/sourceIdentity` | GET | ブローカーアイデンティティ取得 | 200 | - |
| `/ngsi-ld/v1/info/conformance` | GET | NGSI-LD 適合性情報取得 | 200 | - |

### JSON-LD コンテキスト管理

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/jsonldContexts` | GET | JSON-LD コンテキスト一覧 | 200 | 400, 401 | ✅ (max: 1000) |
| `/ngsi-ld/v1/jsonldContexts` | POST | JSON-LD コンテキスト登録 | 201 | 400, 401, 409, 415 | - |
| `/ngsi-ld/v1/jsonldContexts/{contextId}` | GET | JSON-LD コンテキスト取得 | 200 | 401, 404 | - |
| `/ngsi-ld/v1/jsonldContexts/{contextId}` | DELETE | JSON-LD コンテキスト削除 | 204 | 401, 404 | - |

### EntityMap 操作

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/entityMaps` | GET | EntityMap 一覧取得 | 200 | 400, 401 | ✅ (max: 1000) |
| `/ngsi-ld/v1/entityMaps` | POST | EntityMap 作成 | 201 | 400, 401, 415 | - |
| `/ngsi-ld/v1/entityMaps/{entityMapId}` | GET | EntityMap 取得 | 200 | 401, 404 | - |
| `/ngsi-ld/v1/entityMaps/{entityMapId}` | PATCH | EntityMap 更新 | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/entityMaps/{entityMapId}` | DELETE | EntityMap 削除 | 204 | 401, 404 | - |

### スナップショット操作

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/snapshots` | GET | スナップショット一覧取得 | 200 | 400, 401 | ✅ (max: 1000) |
| `/ngsi-ld/v1/snapshots` | POST | スナップショット作成 | 201 | 400, 401, 415 | - |
| `/ngsi-ld/v1/snapshots` | DELETE | 全スナップショットパージ | 200 | 401 | - |
| `/ngsi-ld/v1/snapshots/{snapshotId}` | GET | スナップショット取得 | 200 | 401, 404 | - |
| `/ngsi-ld/v1/snapshots/{snapshotId}` | PATCH | スナップショットステータス更新 | 204 | 400, 401, 404 | - |
| `/ngsi-ld/v1/snapshots/{snapshotId}` | DELETE | スナップショット削除 | 204 | 401, 404 | - |
| `/ngsi-ld/v1/snapshots/{snapshotId}/clone` | POST | スナップショットクローン（復元） | 200 | 400, 401, 404 | - |

### バッチ操作

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/entityOperations/create` | POST | バッチ作成（max: 1000） | 200/201 | 400, 401, 415 | - |
| `/ngsi-ld/v1/entityOperations/upsert` | POST | バッチ upsert（max: 1000） | 200/201 | 400, 401, 415 | - |
| `/ngsi-ld/v1/entityOperations/update` | POST | バッチ更新（max: 1000） | 200/204 | 400, 401, 415 | - |
| `/ngsi-ld/v1/entityOperations/delete` | POST | バッチ削除（max: 1000） | 200/204 | 400, 401, 415 | - |
| `/ngsi-ld/v1/entityOperations/query` | POST | バッチクエリ | 200 | 400, 401, 415 | ✅ (max: 1000) |
| `/ngsi-ld/v1/entityOperations/merge` | POST | バッチマージパッチ（max: 1000） | 204/207 | 400, 401, 415 | - |
| `/ngsi-ld/v1/entityOperations/purge` | POST | エンティティ一括パージ | 204 | 400, 401, 415 | - |

### Temporal API（時系列データ）

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/temporal/entities` | GET | 時系列エンティティ一覧取得 | 200 | 400, 401 | ✅ (max: 1000) |
| `/ngsi-ld/v1/temporal/entities` | POST | 時系列エンティティ作成 | 201 | 400, 401, 409, 415 | - |
| `/ngsi-ld/v1/temporal/entities/{entityId}` | GET | 時系列エンティティ取得 | 200 | 400, 401, 404 | - |
| `/ngsi-ld/v1/temporal/entities/{entityId}` | PATCH | 時系列エンティティの属性をマージ | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/temporal/entities/{entityId}` | DELETE | 時系列エンティティ削除 | 204 | 401, 404 | - |
| `/ngsi-ld/v1/temporal/entities/{entityId}/attrs` | POST | 属性インスタンス追加 | 204 | 400, 401, 404, 415 | - |
| `/ngsi-ld/v1/temporal/entities/{entityId}/attrs/{attrName}` | DELETE | 属性インスタンス削除 | 204 | 401, 404 | - |
| `/ngsi-ld/v1/temporal/entities/{entityId}/attrs/{attrName}/{instanceId}` | PATCH | 属性インスタンス修正 | 204 | 400, 401, 404 | - |
| `/ngsi-ld/v1/temporal/entityOperations/create` | POST | 時系列バッチ作成（max: 1000） | 201/207 | 400, 401, 415 | - |
| `/ngsi-ld/v1/temporal/entityOperations/upsert` | POST | 時系列バッチ upsert（max: 1000） | 204/207 | 400, 401, 415 | - |
| `/ngsi-ld/v1/temporal/entityOperations/delete` | POST | 時系列バッチ削除 | 204/207 | 400, 401, 415 | - |
| `/ngsi-ld/v1/temporal/entityOperations/query` | POST | 時系列バッチクエリ | 200 | 400, 401, 415 | ✅ (max: 1000) |

### ベクトルタイル操作

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/ngsi-ld/v1/tiles` | GET | TileJSON 3.0 メタデータ取得 | 200 | 401 | - |
| `/ngsi-ld/v1/tiles/{z}/{x}/{y}.geojson` | GET | GeoJSON タイル取得 | 200 | 400, 401 | ✅ (max: 1000) |
