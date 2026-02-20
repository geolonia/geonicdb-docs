---
title: "NGSIv2 vs NGSI-LD"
description: "NGSIv2 と NGSI-LD の相互運用性"
outline: deep
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
|-----|------------------|------|
| **normalized** (デフォルト) | (なし) | 型とメタデータを含む完全な形式 |
| **keyValues** | `options=keyValues` | キー・値のペアのみ（メタデータなし） |
| **values** | `options=values` | 属性値の配列のみ |

**例:**

```bash
# normalized (デフォルト)
curl http://localhost:3000/v2/entities/Room1

# keyValues
curl http://localhost:3000/v2/entities/Room1?options=keyValues

# values
curl 'http://localhost:3000/v2/entities?type=Room&options=values&attrs=temperature,humidity'
```

### NGSI-LD の出力形式

| 形式 | Accept ヘッダー | 説明 |
|-----|---------------|------|
| **normalized** (デフォルト) | `application/ld+json` | 型とメタデータを含む完全な形式 |
| **concise** | `application/ld+json` + `options=concise` | 簡潔な形式（省略記法） |
| **keyValues** | `application/ld+json` + `options=keyValues` | キー・値のみ |

**例:**

```bash
# normalized (デフォルト)
curl http://localhost:3000/ngsi-ld/v1/entities/urn:ngsi-ld:Room:Room1

# concise
curl 'http://localhost:3000/ngsi-ld/v1/entities/urn:ngsi-ld:Room:Room1?options=concise'

# keyValues
curl 'http://localhost:3000/ngsi-ld/v1/entities/urn:ngsi-ld:Room:Room1?options=keyValues'
```

---

## 共通機能

以下の機能は両 API で共有されます。

### 1. クエリ言語

| 機能 | NGSIv2 | NGSI-LD | 説明 |
|-----|-------|---------|------|
| **シンプルクエリ** | `q` パラメータ | `q` パラメータ | 属性値フィルタ（例: `temperature>20;humidity<80`) |
| **メタデータクエリ** | `mq` パラメータ | `q` パラメータ (メタデータもクエリ可能) | メタデータフィルタ |
| **スコープクエリ** | (非対応) | `scopeQ` パラメータ | スコープ階層フィルタ |

**基本例:**

```bash
# NGSIv2: 温度が20度以上のエンティティ
curl 'http://localhost:3000/v2/entities?type=Room&q=temperature>20'

# NGSI-LD: 温度が20度以上のエンティティ
curl 'http://localhost:3000/ngsi-ld/v1/entities?type=Room&q=temperature>20'
```

#### メタデータクエリ (mq) の詳細

NGSIv2 の `mq` パラメータは、属性のメタデータに対するクエリをサポートします。

**サポートされる演算子:**

| 演算子 | 説明 | 例 |
|-------|------|------|
| `==` | 等しい | `mq=temperature.accuracy==0.95` |
| `!=` | 等しくない | `mq=temperature.accuracy!=0` |
| `>`, `<`, `>=`, `<=` | 比較演算子 | `mq=temperature.accuracy>0.9` |
| `~=` | パターンマッチ | `mq=temperature.unit~=Cel.*` |
| `..` | 範囲（包含） | `mq=temperature.accuracy==0.9..1.0` |
| `,` | リスト（OR） | `mq=temperature.unit==Celsius,Fahrenheit` |
| `;` | AND条件 | `mq=temperature.accuracy>0.9;temperature.unit==Celsius` |
| `|` | OR条件 | `mq=temperature.accuracy>0.9|humidity.accuracy>0.8` |

**例:**

```bash
# 精度が0.9以上のtemperature属性を持つエンティティ
curl 'http://localhost:3000/v2/entities?type=Room&mq=temperature.accuracy>0.9'

# 精度が0.9から1.0の範囲のtemperature属性を持つエンティティ
curl 'http://localhost:3000/v2/entities?type=Room&mq=temperature.accuracy==0.9..1.0'

# 単位がCelsiusまたはFahrenheitのtemperature属性を持つエンティティ
curl 'http://localhost:3000/v2/entities?type=Room&mq=temperature.unit==Celsius,Fahrenheit'

# 複合条件: 精度が0.9以上かつ単位がCelsius
curl 'http://localhost:3000/v2/entities?type=Room&mq=temperature.accuracy>0.9;temperature.unit==Celsius'
```

#### スコープクエリ (scopeQ) の詳細

NGSI-LD の `scopeQ` パラメータは、エンティティのスコープ階層に対するクエリをサポートします。

**サポートされる演算子:**

| 演算子 | 説明 | 例 |
|-------|------|------|
| `/path` | 完全一致 | `scopeQ=/Japan/Tokyo` |
| `/path/+` | 1階層下のみ | `scopeQ=/Japan/+` (Tokyoなど) |
| `/path/#` | すべての子孫 | `scopeQ=/Japan/#` (Tokyo, Tokyo/Shibuya など) |
| `;` | AND条件（複数スコープ） | `scopeQ=/Japan/Tokyo;/IoT` |

**例:**

```bash
# /Japan/Tokyo スコープを持つエンティティ（完全一致）
curl 'http://localhost:3000/ngsi-ld/v1/entities?scopeQ=/Japan/Tokyo'

# /Japan の直下（1階層下のみ）のエンティティ
curl 'http://localhost:3000/ngsi-ld/v1/entities?scopeQ=/Japan/+'

# /Japan のすべての子孫エンティティ
curl 'http://localhost:3000/ngsi-ld/v1/entities?scopeQ=/Japan/%23'

# 複数スコープを持つエンティティ（AND条件）
curl 'http://localhost:3000/ngsi-ld/v1/entities?scopeQ=/Japan/Tokyo;/IoT'
```

### 2. ジオクエリ

| ジオクエリ演算子 | NGSIv2 | NGSI-LD | 説明 |
|---------------|-------|---------|------|
| `near` | ✅ | ✅ | 指定点の近く |
| `coveredBy` | ✅ | ✅ | 領域内に完全に含まれる |
| `within` | ✅ | ✅ | 領域と交差または含まれる |
| `intersects` | ✅ | ✅ | 領域と交差する |
| `disjoint` | ✅ | ✅ | 領域と交差しない |

**例:**

```bash
# NGSIv2: 東京駅から1km圏内のエンティティ
curl 'http://localhost:3000/v2/entities?georel=near;maxDistance:1000&geometry=point&coords=35.6812,139.7671'

# NGSI-LD: 東京駅から1km圏内のエンティティ
curl 'http://localhost:3000/ngsi-ld/v1/entities?georel=near;maxDistance==1000&geometry=Point&coordinates=%5B139.7671,35.6812%5D'
```

### 3. ページネーション

| ヘッダー | NGSIv2 | NGSI-LD | 説明 |
|---------|-------|---------|------|
| **総数** | `Fiware-Total-Count` | `NGSILD-Results-Count` | クエリ結果の総数 |
| **Next Link** | `Link` (rel="next") | `Link` (rel="next") | 次のページへのリンク |

詳細は [DEVELOPMENT.md](../getting-started/installation.md) の「API 仕様」セクションを参照。

### 4. サブスクリプション

| 通知方式 | NGSIv2 | NGSI-LD | 説明 |
|---------|-------|---------|------|
| **HTTP Webhook** | ✅ | ✅ | REST エンドポイントへのPOST |
| **MQTT** | ✅ | ✅ | MQTT Broker への Publish (QoS 0/1/2, TLS) |
| **WebSocket** | ✅ | ✅ | リアルタイムイベントストリーム |

### 5. フェデレーション（コンテキストソース登録）

| 機能 | NGSIv2 | NGSI-LD | 説明 |
|-----|-------|---------|------|
| **登録API** | `/v2/registrations` | `/ngsi-ld/v1/csourceRegistrations` | リモートプロバイダー登録 |
| **並列クエリ** | ✅ | ✅ | 複数プロバイダーへの同時クエリ |
| **結果統合** | ✅ | ✅ | ローカルとリモート結果のマージ |
| **ループ検出** | ✅ | ✅ | `Via` ヘッダーでループを検出 |

---

## NGSI-LD固有機能

以下の機能は NGSI-LD API でのみサポートされ、NGSIv2 API では直接対応していません。

### 1. Relationship（リレーションシップ）

エンティティ間の関連を表現します。

**NGSI-LD:**

```json
{
  "id": "urn:ngsi-ld:Vehicle:V123",
  "type": "Vehicle",
  "owner": {
    "type": "Relationship",
    "object": "urn:ngsi-ld:Person:P456"
  }
}
```

**NGSIv2 で取得した場合:**

```json
{
  "id": "urn:ngsi-ld:Vehicle:V123",
  "type": "Vehicle",
  "owner": {
    "type": "Relationship",
    "value": {
      "object": "urn:ngsi-ld:Person:P456"
    }
  }
}
```

### 2. LanguageProperty（多言語プロパティ）

複数言語の文字列を保持します。

**NGSI-LD:**

```json
{
  "id": "urn:ngsi-ld:Museum:M001",
  "type": "Museum",
  "name": {
    "type": "LanguageProperty",
    "languageMap": {
      "en": "Tokyo National Museum",
      "ja": "東京国立博物館"
    }
  }
}
```

**NGSI-LD で `lang=ja` 指定時:**

`lang` クエリパラメータを使用すると、LanguageProperty は通常の Property に変換され、指定された言語の値が `value` フィールドに設定されます。

```bash
curl 'http://localhost:3000/ngsi-ld/v1/entities/urn:ngsi-ld:Museum:M001?lang=ja'
```

```json
{
  "id": "urn:ngsi-ld:Museum:M001",
  "type": "Museum",
  "name": {
    "type": "Property",
    "value": "東京国立博物館",
    "lang": "ja"
  }
}
```

**NGSIv2 で取得した場合:**

```json
{
  "id": "urn:ngsi-ld:Museum:M001",
  "type": "Museum",
  "name": {
    "type": "StructuredValue",
    "value": {
      "languageMap": {
        "en": "Tokyo National Museum",
        "ja": "東京国立博物館"
      }
    }
  }
}
```

### 3. Scope（スコープ階層）

エンティティの論理的な階層を表現します。

**NGSI-LD:**

```json
{
  "id": "urn:ngsi-ld:Sensor:S123",
  "type": "Sensor",
  "scope": ["/Japan/Tokyo/Shibuya", "/IoT/Temperature"]
}
```

**スコープクエリ:**

```bash
# /Japan/Tokyo 配下のすべてのエンティティ
curl 'http://localhost:3000/ngsi-ld/v1/entities?scopeQ=/Japan/Tokyo'
```

**NGSIv2 での対応:**

- NGSIv2 API では `scope` は通常の属性として扱われます
- `scopeQ` クエリはサポートされません

### 4. 属性の射影（pick / omit パラメータ）

NGSI-LD では、`pick` および `omit` クエリパラメータを使用して、レスポンスに含める属性を制御できます。

#### pick パラメータ（属性の選択）

指定した属性のみをレスポンスに含めます。

**例:**

```bash
# temperature と humidity 属性のみを取得
curl 'http://localhost:3000/ngsi-ld/v1/entities/urn:ngsi-ld:Room:001?pick=temperature,humidity'
```

**レスポンス:**

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "id": "urn:ngsi-ld:Room:001",
  "type": "Room",
  "temperature": {
    "type": "Property",
    "value": 23.5
  },
  "humidity": {
    "type": "Property",
    "value": 60
  }
}
```

#### omit パラメータ（属性の除外）

指定した属性をレスポンスから除外します。

**例:**

```bash
# location 属性を除外して取得
curl 'http://localhost:3000/ngsi-ld/v1/entities/urn:ngsi-ld:Room:001?omit=location'
```

**レスポンス:**

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "id": "urn:ngsi-ld:Room:001",
  "type": "Room",
  "temperature": {
    "type": "Property",
    "value": 23.5
  },
  "humidity": {
    "type": "Property",
    "value": 60
  }
}
```

**注意点:**

- `pick` と `omit` は同時に使用できません
- `pick` 使用時: `@context`、`id`、`type` と指定した属性のみが含まれます。`createdAt`、`modifiedAt` は含まれません。
- `omit` 使用時: 指定した属性以外の全属性が含まれます。`id`、`type` は除外できません（ETSI GS CIM 009 V1.9.1 仕様に準拠）

**NGSIv2 での対応:**

- NGSIv2 API では `attrs` パラメータが同様の機能を提供します（pick のみ）
- `omit` に相当する機能は NGSIv2 にはありません

```bash
# NGSIv2 で temperature と humidity のみを取得（pick 相当）
curl 'http://localhost:3000/v2/entities/urn:ngsi-ld:Room:001?attrs=temperature,humidity'
```

### 5. @context（JSON-LD コンテキスト）

NGSI-LD ではエンティティに `@context` を含めることで語彙を定義できます。

**NGSI-LD:**

```json
{
  "@context": [
    "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
    "https://smartdatamodels.org/context.jsonld"
  ],
  "id": "urn:ngsi-ld:AirQualityObserved:001",
  "type": "AirQualityObserved",
  ...
}
```

**NGSIv2 での対応:**

- NGSIv2 には `@context` の概念がありません
- GeonicDB は Smart Data Models の自動補完に対応していますが、NGSIv2 API では `@context` は返されません

---

## エンティティIDの注意点

### NGSI-LD の URI 要件

NGSI-LD 仕様では、エンティティ ID は URI 形式であることが推奨されます。

**推奨形式 (URN):**

```text
urn:ngsi-ld:{EntityType}:{LocalId}
```

**例:**

```text
urn:ngsi-ld:Room:001
urn:ngsi-ld:Vehicle:ABC123
urn:ngsi-ld:WeatherObserved:Tokyo-2026-02-08
```

**NGSIv2 との互換性:**

- NGSIv2 では任意の文字列を ID として使用可能 (例: `Room1`, `sensor-abc`)
- NGSI-LD で URN 形式を使用すると、両 API で互換性が保たれます
- NGSIv2 で URN 形式以外の ID を使用した場合でも、NGSI-LD API でアクセス可能です

**ベストプラクティス:**

- 相互運用性を重視する場合は、すべてのエンティティに URN 形式を使用することを推奨
- 既存の NGSIv2 システムから移行する場合、ID の書き換えは不要（両 API でアクセス可能）

---

## フェデレーション

GeonicDB のフェデレーション機能は、リモートコンテキストプロバイダーのプロトコルを自動判別します。

### プロトコル自動判別

登録されたリモートプロバイダーに対して、GeonicDB は以下の順序でプロトコルを検出します：

1. **明示的な指定** - 登録時に `information.format` で指定された場合、そのプロトコルを使用
2. **自動検出** - URL パスから自動判別:
   - `/v2/` を含む → NGSIv2
   - `/ngsi-ld/` を含む → NGSI-LD
   - それ以外 → NGSIv2 (デフォルト)

### NGSIv2 からのフェデレーション

**NGSIv2 で登録:**

```bash
curl -X POST http://localhost:3000/v2/registrations \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: demo" \
  -d '{
    "dataProvided": {
      "entities": [
        { "id": "urn:ngsi-ld:Vehicle:V999", "type": "Vehicle" }
      ],
      "attrs": ["speed", "location"]
    },
    "provider": {
      "http": {
        "url": "http://remote-provider.example.com/ngsi-ld/v1"
      }
    }
  }'
```

**NGSIv2 でクエリすると、NGSI-LD プロバイダーに自動転送:**

```bash
curl http://localhost:3000/v2/entities/urn:ngsi-ld:Vehicle:V999 \
  -H "Fiware-Service: demo"
```

**動作:**

1. GeonicDB はローカルに `urn:ngsi-ld:Vehicle:V999` が存在しないことを検出
2. 登録情報から `http://remote-provider.example.com/ngsi-ld/v1` を特定
3. NGSI-LD プロトコルでクエリを転送: `GET /ngsi-ld/v1/entities/urn:ngsi-ld:Vehicle:V999`
4. レスポンスを NGSI-LD → 内部形式 → NGSIv2 に変換してクライアントに返却

### NGSI-LD からのフェデレーション

**NGSI-LD で登録:**

```bash
curl -X POST http://localhost:3000/ngsi-ld/v1/csourceRegistrations \
  -H "Content-Type: application/ld+json" \
  -H "Fiware-Service: demo" \
  -d '{
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
    "type": "ContextSourceRegistration",
    "information": [
      {
        "entities": [
          { "id": "urn:ngsi-ld:Sensor:S888", "type": "Sensor" }
        ]
      }
    ],
    "endpoint": "http://legacy-system.example.com/v2"
  }'
```

**NGSI-LD でクエリすると、NGSIv2 プロバイダーに自動転送:**

```bash
curl http://localhost:3000/ngsi-ld/v1/entities/urn:ngsi-ld:Sensor:S888 \
  -H "Fiware-Service: demo"
```

**動作:**

1. GeonicDB はローカルに `urn:ngsi-ld:Sensor:S888` が存在しないことを検出
2. 登録情報から `http://legacy-system.example.com/v2` を特定
3. NGSIv2 プロトコルでクエリを転送: `GET /v2/entities/urn:ngsi-ld:Sensor:S888`
4. レスポンスを NGSIv2 → 内部形式 → NGSI-LD に変換してクライアントに返却

---

## ユースケースとベストプラクティス

### どちらのAPIを使うべきか？

#### NGSIv2 を選ぶべき場合

- **既存の FIWARE Orion 互換システム** - レガシーシステムとの統合
- **シンプルなIoTデータ管理** - センサーデータの収集・可視化
- **学習コストを抑えたい** - NGSI-LD よりもシンプルな仕様
- **既存ドキュメント・ツールの豊富さ** - NGSIv2 のエコシステムが充実

**推奨ユースケース:**

- IoT センサーネットワーク
- スマートシティの基本的なデータ収集
- プロトタイピング・PoC

#### NGSI-LD を選ぶべき場合

- **セマンティックWeb / Linked Data** - JSON-LD と RDF の活用
- **複雑なエンティティ関係** - Relationship や LanguageProperty の活用
- **国際標準への準拠** - ETSI 標準に準拠したシステム
- **将来の拡張性** - NGSI-LD は今後も仕様が拡張される予定

**推奨ユースケース:**

- Smart Data Models を活用したデータカタログ
- 多言語対応が必要なシステム
- エンティティ間の複雑な関係を表現する必要があるシステム
- データ連携・オープンデータ公開

#### ハイブリッド運用

GeonicDB では両 API を同時に使用できます。

**推奨パターン:**

1. **段階的移行** - レガシー NGSIv2 システムを稼働させながら、新機能を NGSI-LD で開発
2. **外部 API と内部 API の分離** - 外部向けには NGSI-LD (標準準拠)、内部システムには NGSIv2 (シンプル)
3. **クライアント選択** - モバイルアプリは NGSIv2 (軽量)、データカタログは NGSI-LD (セマンティック)

### ベストプラクティス

#### 1. エンティティ ID は URN 形式を使用

**推奨:**

```text
urn:ngsi-ld:Room:001
```

**非推奨:**

```text
Room1
sensor-abc
```

理由: NGSI-LD 仕様に準拠し、両 API での互換性が保たれます。

#### 2. 地理空間データは GeoJSON を使用

**推奨 (NGSIv2):**

```json
{
  "location": {
    "type": "geo:json",
    "value": {
      "type": "Point",
      "coordinates": [139.7671, 35.6812]
    }
  }
}
```

**推奨 (NGSI-LD):**

```json
{
  "location": {
    "type": "GeoProperty",
    "value": {
      "type": "Point",
      "coordinates": [139.7671, 35.6812]
    }
  }
}
```

理由: ジオクエリは GeoJSON 形式のみサポートされます。

#### 3. Smart Data Models の活用

GeonicDB は Smart Data Models の `@context` を自動補完します。

**推奨 (NGSI-LD):**

```json
{
  "id": "urn:ngsi-ld:AirQualityObserved:001",
  "type": "AirQualityObserved",
  "pm25": {
    "type": "Property",
    "value": 15.5
  }
}
```

理由: `type` が Smart Data Models のモデル名と一致する場合、自動的に適切な `@context` が補完されます。

#### 4. サブスクリプションは用途に応じて選択

| 用途 | 推奨チャネル | 理由 |
|-----|-----------|------|
| Web アプリ (リアルタイム更新) | WebSocket | 低遅延、サーバー不要 |
| サーバー間連携 | HTTP Webhook | 信頼性、リトライ機能 |
| IoT デバイス | MQTT | 軽量、QoS 保証 |

#### 5. テナント分離の活用

`Fiware-Service` ヘッダーでテナントを分離します。

```bash
# テナント "demo" にエンティティ作成
curl -X POST http://localhost:3000/v2/entities \
  -H "Fiware-Service: demo" \
  -d '{...}'

# テナント "prod" にエンティティ作成
curl -X POST http://localhost:3000/v2/entities \
  -H "Fiware-Service: prod" \
  -d '{...}'
```

理由: 開発環境・本番環境の分離、顧客ごとのデータ分離が可能です。

---

## まとめ

| 項目 | NGSIv2 | NGSI-LD | GeonicDB の相互運用性 |
|-----|-------|---------|-------------------|
| **プロトコル** | REST/JSON | REST/JSON-LD | 両方サポート、統一内部フォーマット |
| **エンティティID** | 任意の文字列 | URI (URN推奨) | 両方サポート、URN推奨 |
| **属性型** | シンプル (Number, Text, etc.) | セマンティック (Property, Relationship, etc.) | 自動変換、型マッピング表参照 |
| **システム属性** | `dateCreated`, `dateModified` | `createdAt`, `modifiedAt` | 内部で統一、API ごとに変換 |
| **ジオクエリ** | ✅ | ✅ | 共通機能 |
| **サブスクリプション** | ✅ (HTTP, MQTT, WebSocket) | ✅ (HTTP, MQTT, WebSocket) | 共通機能 |
| **フェデレーション** | ✅ | ✅ | プロトコル自動判別 |
| **ユースケース** | IoT, レガシーシステム | セマンティックWeb, オープンデータ | 両方を同時に使用可能 |

GeonicDB を使用することで、NGSIv2 と NGSI-LD の両方のエコシステムを活用し、段階的な移行や最適な API の選択が可能になります。

---

## 関連ドキュメント

- [API 共通仕様](../api-reference/endpoints.md)
- [NGSIv2 API](../api-reference/ngsiv2.md)
- [NGSI-LD API](../api-reference/ngsild.md)
- [Smart Data Models](../features/smart-data-models.md)
- [FIWARE Orion 比較](../migration/compatibility-matrix.md)
