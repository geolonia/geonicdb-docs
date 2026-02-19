---
title: "NGSIv2 / NGSI-LD 相互互換性"
---

# NGSIv2 / NGSI-LD 相互互換性

GeonicDB は NGSIv2 と NGSI-LD の両方を単一の Context Broker でサポートしており、プロトコル非依存の内部フォーマットを通じて相互運用が可能です。

## 目次

- [概要](#概要)
- [統一内部フォーマット](#統一内部フォーマット)
- [クロスAPIアクセス](#クロスapiアクセス)
- [属性型マッピング表](#属性型マッピング表)
- [システム属性の違い](#システム属性の違い)
- [出力フォーマットの違い](#出力フォーマットの違い)
- [共通機能](#共通機能)
- [NGSI-LD固有機能](#ngsi-ld固有機能)
- [エンティティIDの注意点](#エンティティidの注意点)
- [フェデレーション](#フェデレーション)
- [ユースケースとベストプラクティス](#ユースケースとベストプラクティス)

---

## 概要

GeonicDB のデュアル API アーキテクチャは、FIWARE NGSIv2 と ETSI NGSI-LD の両方の仕様をサポートします。

### アーキテクチャ

```text
NGSIv2 API (/v2) ───┐
                    ├──> 統一内部フォーマット ──> MongoDB
NGSI-LD API (LD/v1) ┘
```

- 両 API は同一の MongoDB ストレージを共有
- エンティティは API に依存しないプロトコル非依存形式で保存
- リクエスト時に各 API 形式から内部形式に変換
- レスポンス時に内部形式から各 API 形式に変換

### 相互運用性のメリット

- **移行の柔軟性** - NGSIv2 から NGSI-LD への段階的移行が可能
- **既存システムとの統合** - 古い NGSIv2 クライアントと新しい NGSI-LD クライアントの共存
- **API 選択の自由** - ユースケースに応じて最適な API を選択
- **単一データソース** - 重複データの管理不要

---

## 統一内部フォーマット

GeonicDB は両 API からのデータを統一内部フォーマットに変換します。

### 内部エンティティ構造

```typescript
interface InternalEntity {
  id: string;                                    // エンティティID
  type: string;                                  // エンティティタイプ
  attributes: Record<string, EntityAttribute>;   // 属性の集合
  metadata?: EntityMetadata;                     // システムメタデータ
  scope?: string[];                              // NGSI-LD スコープ階層
  distance?: number;                             // ジオクエリ結果の距離
  expiresAt?: string;                            // Transient エンティティの期限
}

interface EntityAttribute {
  type: string;                                  // 属性型
  value: AttributeValue;                         // 属性値
  metadata?: Record<string, AttributeMetadata>;  // 属性メタデータ
  datasetId?: string;                            // NGSI-LD データセットID
}

interface EntityMetadata {
  createdAt: string;   // 作成日時 (ISO 8601)
  modifiedAt: string;  // 更新日時 (ISO 8601)
  version: number;     // バージョン番号
  deletedAt?: string;  // 削除日時（論理削除）
}
```

### MongoDB ストレージ形式

```typescript
interface EntityDocument {
  _id: ObjectId;
  tenant: string;           // テナント名 (Fiware-Service)
  servicePath: string;      // サービスパス
  entityId: string;         // エンティティID
  entityType: string;       // エンティティタイプ
  attributes: Record<string, EntityAttribute>;
  location?: {              // 2dsphere インデックス用の分離フィールド
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

## クロスAPIアクセス

NGSIv2 で作成したエンティティを NGSI-LD で取得できます（逆も同様）。

### 例1: NGSIv2 で作成 → NGSI-LD で取得

**NGSIv2 でエンティティ作成:**

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

**レスポンス (NGSI-LD 形式):**

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

### 例2: NGSI-LD で作成 → NGSIv2 で取得

**NGSI-LD でエンティティ作成:**

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

**レスポンス (NGSIv2 形式):**

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

## 属性型マッピング表

GeonicDB は以下のルールで NGSIv2 型 ↔ 内部型 ↔ NGSI-LD 型を変換します。

### 基本データ型

| NGSIv2 型 | 内部型 | NGSI-LD 型 | 説明 |
|----------|-------|-----------|------|
| `Number` | `Number` | `Property` | 数値 (整数・小数) |
| `Text` / `String` | `String` | `Property` | 文字列 |
| `Boolean` | `Boolean` | `Property` | 真偽値 |
| `DateTime` | `DateTime` | `Property` または `TemporalProperty` | ISO 8601 日時文字列 |
| `Null` | `Null` | `Property` | null 値 |

### 構造化データ型

| NGSIv2 型 | 内部型 | NGSI-LD 型 | 説明 |
|----------|-------|-----------|------|
| `Object` | `Object` | `Property` | JSON オブジェクト |
| `Array` | `Array` | `Property` または `ListProperty` | JSON 配列 |
| `StructuredValue` | `Object` | `Property` | 構造化データ |

### 地理空間型

| NGSIv2 型 | 内部型 | NGSI-LD 型 | 説明 |
|----------|-------|-----------|------|
| `geo:json` | `GeoJSON` | `GeoProperty` | GeoJSON (Point, LineString, Polygon) |
| `geo:point` | `GeoJSON` (Point) | `GeoProperty` | 緯度・経度の点 |

### NGSI-LD 固有型

以下の NGSI-LD 固有型は内部的に保持されますが、NGSIv2 API では `Property` として扱われます。

| NGSI-LD 型 | 内部型 | NGSIv2 変換 | 説明 |
|-----------|-------|-----------|------|
| `Relationship` | `Relationship` | `Relationship` (カスタム型) | エンティティ参照 (`object` プロパティを含む) |
| `LanguageProperty` | `LanguageProperty` | `StructuredValue` | 多言語文字列 (`languageMap` プロパティを含む) |
| `JsonProperty` | `JsonProperty` | `Object` | JSON データ (`json` プロパティを含む) |
| `VocabProperty` | `VocabProperty` | `Object` | 語彙データ (`vocab` または `vocabMap` プロパティを含む) |
| `ListProperty` | `ListProperty` | `Array` | 順序付き配列 (`valueList` プロパティを含む) |
| `ListRelationship` | `ListRelationship` | `Array` | エンティティ参照の配列 (`objectList` プロパティを含む) |

### メタデータ型マッピング

| NGSIv2 メタデータ名 | NGSI-LD プロパティ | 説明 |
|-------------------|------------------|------|
| `unit` (Text) | `unitCode` (string) | 単位 (例: "CEL", "KMH") |
| `observedAt` (DateTime) | `observedAt` (ISO 8601) | 観測日時 |
| `datasetId` (Text) | `datasetId` (URI) | データセットID |

---

## システム属性の違い

エンティティのメタデータ（作成日時・更新日時）は API によって名前が異なります。

### NGSIv2 のシステム属性

| 属性名 | 型 | 説明 |
|-------|---|------|
| `dateCreated` | `DateTime` | エンティティ作成日時 (ISO 8601) |
| `dateModified` | `DateTime` | エンティティ最終更新日時 (ISO 8601) |

**例 (NGSIv2 レスポンス with `options=dateCreated,dateModified`):**

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

### NGSI-LD のシステム属性

| 属性名 | 型 | 説明 |
|-------|---|------|
| `createdAt` | ISO 8601 文字列 | エンティティ作成日時 |
| `modifiedAt` | ISO 8601 文字列 | エンティティ最終更新日時 |

**注記:** `pick` パラメータを使用した場合、`@context`、`id`、`type` のみが選択され、`createdAt` および `modifiedAt` は含まれません（例外）。

**例 (NGSI-LD レスポンス, システム属性は常に含まれる):**

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

### 内部表現（MongoDB）

```typescript
{
  metadata: {
    createdAt: "2026-02-08T10:00:00.000Z",  // ISO 8601 文字列
    modifiedAt: "2026-02-08T11:00:00.000Z", // ISO 8601 文字列
    version: 1
  }
}
```

---

## 出力フォーマットの違い

各 API は複数のレスポンス形式をサポートします。

### NGSIv2 の出力形式

| 形式 | options パラメータ | 説明 |
|--