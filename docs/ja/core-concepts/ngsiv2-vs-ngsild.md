---
title: "NGSIv2 vs NGSI-LD"
description: "NGSIv2 and NGSI-LD interoperability"
outline: deep
---
# NGSIv2 / NGSI-LD 相互運用性

GeonicDB は、単一の Context Broker で NGSIv2 と NGSI-LD の両方をサポートし、プロトコルに依存しない内部フォーマットを通じて相互運用性を実現します。

## 目次

- [概要](#概要)
- [統合された内部フォーマット](#統合された内部フォーマット)
- [クロス API アクセス](#クロス-api-アクセス)
- [属性タイプマッピングテーブル](#属性タイプマッピングテーブル)
- [システム属性の違い](#システム属性の違い)
- [出力フォーマットの違い](#出力フォーマットの違い)
- [共有機能](#共有機能)
- [NGSI-LD 固有機能](#ngsi-ld-固有機能)
- [エンティティ ID に関する考慮事項](#エンティティ-id-に関する考慮事項)
- [フェデレーション](#フェデレーション)
- [ユースケースとベストプラクティス](#ユースケースとベストプラクティス)

---

## 概要

GeonicDB のデュアル API アーキテクチャは、FIWARE NGSIv2 と ETSI NGSI-LD 仕様の両方をサポートします。

### アーキテクチャ

```text
NGSIv2 API (/v2) ───┐
                    ├──> Unified Internal Format ──> MongoDB
NGSI-LD API (/ngsi-ld/v1) ┘
```





- 両 API は同じ MongoDB ストレージを共有します
- エンティティは、使用された API とは独立したプロトコル非依存フォーマットで保存されます
- リクエスト時:各 API フォーマットは内部フォーマットに変換されます
- レスポンス時:内部フォーマットは各 API フォーマットに変換されます

### 相互運用性のメリット

- **移行の柔軟性** - NGSIv2 から NGSI-LD への段階的な移行が可能
- **既存システムとの統合** - レガシー NGSIv2 クライアントと新しい NGSI-LD クライアントの共存が可能
- **API 選択の自由** - 各ユースケースに最適な API を選択可能
- **単一データソース** - 重複データを管理する必要がない

---

## 統合された内部フォーマット

GeonicDB は両 API からのデータを統合された内部フォーマットに変換します。

### 内部エンティティ構造

```typescript
interface InternalEntity {
  id: string;                                    // Entity ID
  type: string;                                  // Entity type
  attributes: Record<string, EntityAttribute>;   // Set of attributes
  metadata?: EntityMetadata;                     // System metadata
  scope?: string[];                              // NGSI-LD scope hierarchy
  distance?: number;                             // Distance in geo-query results
  expiresAt?: string;                            // Expiry for Transient entities
}

interface EntityAttribute {
  type: string;                                  // Attribute type
  value: AttributeValue;                         // Attribute value
  metadata?: Record<string, AttributeMetadata>;  // Attribute metadata
  datasetId?: string;                            // NGSI-LD dataset ID
}

interface EntityMetadata {
  createdAt: string;   // Creation timestamp (ISO 8601)
  modifiedAt: string;  // Last modified timestamp (ISO 8601)
  version: number;     // Version number
  deletedAt?: string;  // Deletion timestamp (soft delete)
}
```

























### MongoDB ストレージフォーマット

```typescript
interface EntityDocument {
  _id: ObjectId;
  tenant: string;           // Tenant name (Fiware-Service)
  servicePath: string;      // Service path
  entityId: string;         // Entity ID
  entityType: string;       // Entity type
  attributes: Record<string, EntityAttribute>;
  location?: {              // Separate field for 2dsphere index
    type: string;
    value: GeoGeometry;
  };
  scope?: string[];
  createdAt: Date;
  modifiedAt: Date;
  version: number;
  expiresAt?: Date;
  deletedAt?: Date;
}
```




















---

## クロス API アクセス

NGSIv2 で作成されたエンティティは NGSI-LD 経由で取得できます(逆も同様)。

### 例 1:NGSIv2 で作成 → NGSI-LD で取得

**NGSIv2 でエンティティを作成:**

```bash
curl -X POST http://localhost:3000/v2/entities \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: demo" \
  -d '{
    "id": "urn:ngsi-ld:Room:001",
    "type": "Room",
    "temperature": {
      "type": "Number",
      "value": 23.5,
      "metadata": {
        "unit": {
          "type": "Text",
          "value": "Celsius"
        }
      }
    },
    "humidity": {
      "type": "Number",
      "value": 60
    }
  }'
```























**NGSI-LD で同じエンティティを取得:**

```bash
curl http://localhost:3000/ngsi-ld/v1/entities/urn:ngsi-ld:Room:001 \
  -H "Fiware-Service: demo"
```




**レスポンス (NGSI-LD フォーマット):**

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "id": "urn:ngsi-ld:Room:001",
  "type": "Room",
  "temperature": {
    "type": "Property",
    "value": 23.5,
    "unitCode": "Celsius"
  },
  "humidity": {
    "type": "Property",
    "value": 60
  },
  "createdAt": "2026-02-08T10:00:00.000Z",
  "modifiedAt": "2026-02-08T10:00:00.000Z"
}
```


















### 例 2:NGSI-LD で作成 → NGSIv2 で取得

**NGSI-LD でエンティティを作成:**

```bash
curl -X POST http://localhost:3000/ngsi-ld/v1/entities \
  -H "Content-Type: application/ld+json" \
  -H "Fiware-Service: demo" \
  -d '{
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
    "id": "urn:ngsi-ld:Vehicle:V123",
    "type": "Vehicle",
    "speed": {
      "type": "Property",
      "value": 55.5,
      "unitCode": "KMH",
      "observedAt": "2026-02-08T10:00:00Z"
    },
    "location": {
      "type": "GeoProperty",
      "value": {
        "type": "Point",
        "coordinates": [139.7671, 35.6812]
      }
    }
  }'
```























**NGSIv2 で同じエンティティを取得:**

```bash
curl http://localhost:3000/v2/entities/urn:ngsi-ld:Vehicle:V123 \
  -H "Fiware-Service: demo"
```




**レスポンス (NGSIv2 フォーマット):**

```json
{
  "id": "urn:ngsi-ld:Vehicle:V123",
  "type": "Vehicle",
  "speed": {
    "type": "Number",
    "value": 55.5,
    "metadata": {
      "unit": {
        "type": "Text",
        "value": "KMH"
      },
      "observedAt": {
        "type": "DateTime",
        "value": "2026-02-08T10:00:00Z"
      }
    }
  },
  "location": {
    "type": "geo:json",
    "value": {
      "type": "Point",
      "coordinates": [139.7671, 35.6812]
    }
  }
}
```



























---

## 属性タイプマッピングテーブル

GeonicDB は、以下のルールに従って NGSIv2 タイプ、内部タイプ、NGSI-LD タイプ間で変換を行います。

### 基本データタイプ

| NGSIv2 タイプ | 内部タイプ | NGSI-LD タイプ | 説明 |
|-------------|---------------|--------------|-------------|
| `Number` | `Number` | `Property` | 数値(整数または小数) |
| `Text` / `String` | `String` | `Property` | 文字列 |
| `Boolean` | `Boolean` | `Property` | 真偽値 |
| `DateTime` | `DateTime` | `Property` または `TemporalProperty` | ISO 8601 日時文字列 |
| `Null` | `Null` | `Property` | null 値 |

### 構造化データタイプ

| NGSIv2 タイプ | 内部タイプ | NGSI-LD タイプ | 説明 |
|-------------|---------------|--------------|-------------|
| `Object` | `Object` | `Property` | JSON オブジェクト |
| `Array` | `Array` | `Property` または `ListProperty` | JSON 配列 |
| `StructuredValue` | `Object` | `Property` | 構造化データ |

### 地理空間タイプ

| NGSIv2 タイプ | 内部タイプ | NGSI-LD タイプ | 説明 |
|-------------|---------------|--------------|-------------|
| `geo:json` | `GeoJSON` | `GeoProperty` | GeoJSON (Point、LineString、Polygon) |
| `geo:point` | `GeoJSON` (Point) | `GeoProperty` | 緯度/経度ポイント |

### NGSI-LD 固有タイプ

以下の NGSI-LD 固有タイプは内部的に保持されますが、NGSIv2 API では `Property` として扱われます。

| NGSI-LD タイプ | 内部タイプ | NGSIv2 変換 | 説明 |
|--------------|---------------|-------------------|-------------|
| `Relationship` | `Relationship` | `Relationship` (カスタムタイプ) | エンティティ参照(`object` プロパティを含む) |
| `LanguageProperty` | `LanguageProperty` | `StructuredValue` | 多言語文字列(`languageMap` プロパティを含む) |
| `JsonProperty` | `JsonProperty` | `Object` | JSON データ(`json` プロパティを含む) |
| `VocabProperty` | `VocabProperty` | `Object` | 語彙データ(`vocab` または `vocabMap` プロパティを含む) |
| `ListProperty` | `ListProperty` | `Array` | 順序付き配列(`valueList` プロパティを含む) |
| `ListRelationship` | `ListRelationship` | `Array` | エンティティ参照の配列(`objectList` プロパティを含む) |

### メタデータタイプマッピング

| NGSIv2 メタデータ名 | NGSI-LD プロパティ | 説明 |
|----------------------|------------------|-------------|
| `unit` (Text) | `unitCode` (string) | 単位(例:"CEL"、"KMH") |
| `observedAt` (DateTime) | `observedAt` (ISO 8601) | 観測タイムスタンプ |
| `datasetId` (Text) | `datasetId` (URI) | データセット ID |

---

## システム属性の違い

エンティティメタデータ(作成および変更タイムスタンプ)は、API によって異なる名前を使用します。

### NGSIv2 システム属性

| 属性名 | タイプ | 説明 |
|----------------|------|-------------|
| `dateCreated` | `DateTime` | エンティティ作成タイムスタンプ (ISO 8601) |
| `dateModified` | `DateTime` | エンティティ最終変更タイムスタンプ (ISO 8601) |

**例 (`options=dateCreated,dateModified` を含む NGSIv2 レスポンス):**

```json
{
  "id": "Room1",
  "type": "Room",
  "temperature": {
    "type": "Number",
    "value": 23
  },
  "dateCreated": {
    "type": "DateTime",
    "value": "2026-02-08T10:00:00.000Z"
  },
  "dateModified": {
    "type": "DateTime",
    "value": "2026-02-08T11:00:00.000Z"
  }
}
```


















### NGSI-LD システム属性

| 属性名 | タイプ | 説明 |
|----------------|------|-------------|
| `createdAt` | ISO 8601 文字列 | エンティティ作成タイムスタンプ |
| `modifiedAt` | ISO 8601 文字列 | エンティティ最終変更タイムスタンプ |

**注:** `pick` パラメータを使用すると、明示的にリクエストされた属性と、`@context`、`id`、`type` (常に存在)がレスポンスに含まれます。ただし、`createdAt` と `modifiedAt` は `pick` を使用しても返されません — これらのシステム属性には `sysAttrs` オプションが必要です。

**例 (NGSI-LD レスポンス、システム属性は常に含まれる):**

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "id": "urn:ngsi-ld:Room:Room1",
  "type": "Room",
  "temperature": {
    "type": "Property",
    "value": 23
  },
  "createdAt": "2026-02-08T10:00:00.000Z",
  "modifiedAt": "2026-02-08T11:00:00.000Z"
}
```













### 内部表現 (MongoDB)

```typescript
{
  metadata: {
    createdAt: "2026-02-08T10:00:00.000Z",  // ISO 8601 string
    modifiedAt: "2026-02-08T11:00:00.000Z", // ISO 8601 string
    version: 1
  }
}
```









---

## 出力フォーマットの違い

各 API は複数のレスポンスフォーマットをサポートしています。

### NGSIv2 出力フォーマット

| フォーマット | options パラメータ | 説明 |
|--------|-------------------|-------------|
| **normalized** (デフォルト) | (なし) | タイプとメタデータを含む完全なフォーマット |
| **keyValues** | `options=keyValues` | キー・バリューペアのみ(メタデータなし) |
| **values** | `options=values` | 属性値の配列のみ |

**例:**

```bash
# normalized (default)
curl http://localhost:3000/v2/entities/Room1

# keyValues
curl http://localhost:3000/v2/entities/Room1?options=keyValues

# values
curl 'http://localhost:3000/v2/entities?type=Room&options=values&attrs=temperature,humidity'
```










### NGSI-LD 出力フォーマット

| フォーマット | Accept ヘッダー | 説明 |
|--------|---------------|-------------|
| **normalized** (デフォルト) | `application/ld+json` | タイプとメタデータを含む完全なフォーマット |
| **concise** | `application/ld+json` + `options=concise` | 簡潔フォーマット(省略表記) |
| **keyValues** | `application/ld+json` + `options=keyValues` | キー・バリューペアのみ |

**例:**

```bash
# normalized (default)
curl http://localhost:3000/ngsi-ld/v1/entities/urn:ngsi-ld:Room:Room1

# concise
curl 'http://localhost:3000/ngsi-ld/v1/entities/urn:ngsi-ld:Room:Room1?options=concise'

# keyValues
curl 'http://localhost:3000/ngsi-ld/v1/entities/urn:ngsi-ld:Room:Room1?options=keyValues'
```










---

## 共有機能

以下の機能は両 API で共有されています。

### 1. クエリ言語

| 機能 | NGSIv2 | NGSI-LD | 説明 |
|---------|--------|---------|-------------|
| **シンプルクエリ** | `q` パラメータ | `q` パラメータ | 属性値フィルタ(例:`temperature>20;humidity<80`) |
| **メタデータクエリ** | `mq` パラメータ | `q` パラメータ(メタデータもクエリ可能) | メタデータフィルタ |
| **スコープクエリ** | (サポートなし) | `scopeQ` パラメータ | スコープ階層フィルタ |

**基本例:**

```bash
# NGSIv2: Entities with temperature greater than 20
curl 'http://localhost:3000/v2/entities?type=Room&q=temperature>20'

# NGSI-LD: Entities with temperature greater than 20
curl 'http://localhost:3000/ngsi-ld/v1/entities?type=Room&q=temperature>20'
```







#### メタデータクエリ (mq) の詳細

NGSIv2 の `mq` パラメータは、属性メタデータに対するクエリをサポートします。

**サポートされる演算子:**

| 演算子 | 説明 | 例 |
|----------|-------------|---------|
| `==` | 等しい | `mq=temperature.accuracy==0.95` |
| `!=` | 等しくない | `mq=temperature.accuracy!=0` |
| `>`、`<`、`>=`、`<=` | 比較演算子 | `mq=temperature.accuracy>0.9` |
| `~=` | パターンマッチ | `mq=temperature.unit~=Cel.*` |
| `..` | 範囲(包含) | `mq=temperature.accuracy==0.9..1.0` |
| `,` | リスト (OR) | `mq=temperature.unit==Celsius,Fahrenheit` |
| `;` | AND 条件 | `mq=temperature.accuracy>0.9;temperature.unit==Celsius` |
| `|` | OR 条件 | `mq=temperature.accuracy>0.9|humidity.accuracy>0.8` |

**例:**

```bash
# Entities with a temperature attribute having accuracy greater than 0.9
curl 'http://localhost:3000/v2/entities?type=Room&mq=temperature.accuracy>0.9'

# Entities with a temperature attribute having accuracy in the range 0.9 to 1.0
curl 'http://localhost:3000/v2/entities?type=Room&mq=temperature.accuracy==0.9..1.0'

# Entities with a temperature attribute having unit Celsius or Fahrenheit
curl 'http://localhost:3000/v2/entities?type=Room&mq=temperature.unit==Celsius,Fahrenheit'

# Compound condition: accuracy greater than 0.9 AND unit is Celsius
curl 'http://localhost:3000/v2/entities?type=Room&mq=temperature.accuracy>0.9;temperature.unit==Celsius'
```













#### スコープクエリ (scopeQ) の詳細

NGSI-LD の `scopeQ` パラメータは、エンティティスコープ階層に対するクエリをサポートします。

**サポートされる演算子:**

| 演算子 | 説明 | 例 |
|----------|-------------|---------|
| `/path` | 完全一致 | `scopeQ=/Japan/Tokyo` |
| `/path/+` | 1 階層下のみ | `scopeQ=/Japan/+` (例:東京) |
| `/path/#` | すべての子孫 | `scopeQ=/Japan/#` (例:東京、東京/渋谷) |
| `;` | AND 条件(複数スコープ) | `scopeQ=/Japan/Tokyo;/IoT` |

**例:**

```bash
# Entities with scope /Japan/Tokyo (exact match)
curl 'http://localhost:3000/ngsi-ld/v1/entities?scopeQ=/Japan/Tokyo'

# Entities directly under /Japan (one level below only)
curl 'http://localhost:3000/ngsi-ld/v1/entities?scopeQ=/Japan/+'

# All descendant entities under /Japan
curl 'http://localhost:3000/ngsi-ld/v1/entities?scopeQ=/Japan/%23'

# Entities with multiple scopes (AND condition)
curl 'http://localhost:3000/ngsi-ld/v1/entities?scopeQ=/Japan/Tokyo;/IoT'
```













### 2. ジオクエリ

| ジオクエリ演算子 | NGS