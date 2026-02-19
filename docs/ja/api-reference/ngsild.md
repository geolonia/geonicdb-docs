---
title: "NGSI-LD API"
---

# NGSI-LD API

> このドキュメントは [API.md](./endpoints.md) から分離されたものです。メインの API 仕様については [API.md](./endpoints.md) を参照してください。

---

NGSI-LD は JSON-LD ベースのコンテキスト情報管理 API です。

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

```json
Accept: application/ld+json
Link: <https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"
```

**クエリパラメータ**

| パラメータ | 型 | 説明 | デフォルト |
|-----------|-----|------|-----------|
| `id` | string | エンティティ ID でフィルタ（カンマ区切りで複数指定可、URI 形式） | - |
| `limit` | integer | 取得件数 | 20 |
| `offset` | integer | オフセット | 0 |
| `orderBy` | string | ソート基準（`entityId`, `entityType`, `modifiedAt`） | - |
| `orderDirection` | string | ソート方向（`asc`, `desc`） | `asc` |
| `type` | string | エンティティタイプでフィルタ | - |
| `idPattern` | string | エンティティ ID の正規表現パターン | - |
| `q` | string | 属性値によるフィルタ | - |
| `attrs` | string | 取得する属性名（カンマ区切り） | - |
| `pick` | string | 取得する属性名（カンマ区切り、`omit` と排他） | - |
| `omit` | string | 除外する属性名（カンマ区切り、`pick` と排他、`id`/`type` は不可） | - |
| `scopeQ` | string | スコープクエリ（例: `/Madrid`, `/Madrid/#`, `/Madrid/+`） | - |
| `lang` | string | LanguageProperty の言語フィルタ（BCP 47、カンマ区切り優先度順、`*` で全言語） | - |
| `georel` | string | ジオクエリ演算子 | - |
| `geometry` | string | ジオメトリタイプ | - |
| `coordinates` | string | 座標 | - |
| `spatialId` | string | 空間 ID（ZFXY 形式）でフィルタ（[空間 ID 検索](./endpoints.md#空間id検索)参照） | - |
| `spatialIdDepth` | integer | 空間 ID 階層展開の深さ（0-4） | 0 |
| `crs` | string | 座標参照系（[座標参照系（CRS）](./endpoints.md#座標参照系crs)参照）。URN 形式も可 | `EPSG:4326` |
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

エンティティに `expiresAt` フィールド（ISO 8601 形式）を指定すると、有効期限付きの Transient Entity として作成されます。有効期限は未来の日時でなければなりません。

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

###