---
title: "NGSIv2 vs NGSI-LD"
description: "NGSIv2 and NGSI-LD interoperability"
outline: deep
---
# NGSIv2 / NGSI-LD プロトコル分離

GeonicDB は単一の Context Broker 内で NGSIv2 と NGSI-LD の両方の API をサポートしています。両 API は統一された内部ストレージ形式を共有していますが、**エンティティはプロトコルごとに分離されています** -- NGSIv2 で作成されたエンティティは NGSIv2 でのみアクセス可能であり、NGSI-LD も同様です。

## 目次

- [概要](#概要)
- [統一された内部形式](#統一された内部形式)
- [プロトコル分離](#プロトコル分離)
- [属性タイプマッピングテーブル](#属性タイプマッピングテーブル)
- [システム属性の違い](#システム属性の違い)
- [出力形式の違い](#出力形式の違い)
- [共有機能](#共有機能)
- [NGSI-LD 固有の機能](#ngsi-ld-固有の機能)
- [エンティティ ID の考慮事項](#エンティティ-id-の考慮事項)
- [Federation](#federation)
- [ユースケースとベストプラクティス](#ユースケースとベストプラクティス)

---

## 概要

GeonicDB のデュアル API アーキテクチャは、FIWARE NGSIv2 と ETSI NGSI-LD の両仕様をサポートしています。各エンティティには作成時に使用されたプロトコルがタグ付けされ、2 つの API 間での厳格な分離が保証されます。

### アーキテクチャ

```text
NGSIv2 API (/v2) ──────> [protocol: 'ngsiv2'] ──┐
                                                 ├──> Unified Internal Format ──> MongoDB
NGSI-LD API (/ngsi-ld/v1) ──> [protocol: 'ngsild'] ┘
```

- 両 API は同じ MongoDB ストレージと統一された内部形式を共有
- 各エンティティは作成時に設定される `protocol` フィールド (`'ngsiv2'` または `'ngsild'`) を持つ
- クエリはプロトコルでフィルタリング: NGSIv2 API は `protocol: 'ngsiv2'` エンティティのみを返し、NGSI-LD API は `protocol: 'ngsild'` エンティティのみを返す
- `protocol` フィールドを持たない既存のエンティティは `'ngsild'` として扱われる

### メリット

- **プロトコル分離** - 明確な境界により、意図しないプロトコル間のデータ漏洩を防ぎ、各 API が仕様に準拠したエンティティのみを返すことを保証
- **仕様準拠** - 各 API は厳密に独自の仕様内で動作し、形式変換によるエッジケースを回避
- **既存システムとの統合** - NGSIv2 と NGSI-LD のワークロードを干渉なく並行して実行可能
- **API 選択の自由** - 各ユースケースに最適な API を選択可能。プロトコル間連携が必要な場合は Federation を使用

---

## 統一内部フォーマット

GeonicDB は両方の API からのデータを統一された内部フォーマットに変換します。

### 内部エンティティ構造

```typescript
interface InternalEntity {
  id: string;                                    // Entity ID
  type: string;                                  // Entity type
  attributes: Record<string, EntityAttribute>;   // Set of attributes
  metadata?: EntityMetadata;                     // System metadata
  scope?: string[];                              // NGSI-LD scope hierarchy
  servicePath?: string;                          // Service path (NGSIv2 builtin attribute)
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
  protocol?: 'ngsiv2' | 'ngsild';  // Protocol that created this entity
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

## プロトコル分離

エンティティは、それを作成したプロトコルによって分離されます。各エンティティには `protocol` フィールド（`'ngsiv2'` または `'ngsild'`）があり、どの API がアクセスできるかを決定します。

### ルール

| 操作 | NGSIv2 エンティティ（`protocol: 'ngsiv2'`） | NGSI-LD エンティティ（`protocol: 'ngsild'`） |
|-----------|--------------------------------------|---------------------------------------|
| NGSIv2 GET/LIST | 可視 | 不可視 |
| NGSIv2 UPDATE/DELETE | 許可 | 見つからない (404) |
| NGSI-LD GET/LIST | 不可視 | 可視 |
| NGSI-LD UPDATE/DELETE | 見つからない (404) | 許可 |

### レガシーエンティティ

プロトコル分離の導入前に作成されたエンティティ（つまり、データベースに `protocol` フィールドがないエンティティ）は `'ngsild'` として扱われます。これらは NGSI-LD API 経由でのみアクセス可能です。

### フェデレーションによるクロスプロトコルアクセス

直接的なクロスプロトコルアクセスはサポートされていません。プロトコル間でエンティティにアクセスする必要がある場合は、**フェデレーション**（コンテキストソース登録）を使用して、一方の GeonicDB インスタンスを他方のプロトコルのコンテキストプロバイダーとして登録してください。詳細については、[フェデレーション](#フェデレーション) セクションを参照してください。

### 例: プロトコル分離の動作

```bash
# Create an entity via NGSIv2
curl -X POST http://localhost:3000/v2/entities \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: demo" \
  -d '{"id": "urn:ngsi-ld:Room:001", "type": "Room", "temperature": {"type": "Number", "value": 23.5}}'

# Accessible via NGSIv2
curl http://localhost:3000/v2/entities/urn:ngsi-ld:Room:001 -H "Fiware-Service: demo"
# => 200 OK

# NOT accessible via NGSI-LD (returns 404)
curl http://localhost:3000/ngsi-ld/v1/entities/urn:ngsi-ld:Room:001 -H "Fiware-Service: demo"
# => 404 Not Found
```

---

## 属性タイプマッピング表

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

以下の NGSI-LD 固有タイプは内部的には保持されますが、NGSIv2 API では `Property` として扱われます。

| NGSI-LD タイプ | 内部タイプ | NGSIv2 変換 | 説明 |
|--------------|---------------|-------------------|-------------|
| `Relationship` | `Relationship` | `Relationship` (カスタムタイプ) | エンティティ参照(`object` プロパティを含む) |
| `LanguageProperty` | `LanguageProperty` | `StructuredValue` | 多言語文字列(`languageMap` プロパティを含む) |
| `JsonProperty` | `JsonProperty` | `Object` | JSON データ(`json` プロパティを含む) |
| `VocabProperty` | `VocabProperty` | `Object` | ボキャブラリーデータ(`vocab` または `vocabMap` プロパティを含む) |
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

エンティティのメタデータ (作成タイムスタンプおよび変更タイムスタンプ) は、API によって異なる名前を使用します。

### NGSIv2 システム属性

| 属性名 | 型 | 説明 |
|--------|-----|------|
| `dateCreated` | `DateTime` | エンティティ作成タイムスタンプ (ISO 8601) |
| `dateModified` | `DateTime` | エンティティ最終変更タイムスタンプ (ISO 8601) |

**例 (NGSIv2 レスポンス、`options=dateCreated,dateModified` を使用):**

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

| 属性名 | 型 | 説明 |
|--------|-----|------|
| `createdAt` | ISO 8601 文字列 | エンティティ作成タイムスタンプ |
| `modifiedAt` | ISO 8601 文字列 | エンティティ最終変更タイムスタンプ |

**注意:** `pick` パラメータを使用する場合、レスポンスには明示的に要求された属性とともに `@context`、`id`、および `type` (常に存在) が含まれます。ただし、`createdAt` と `modifiedAt` は、`pick` を使用しても返されません — これらのシステム属性には `sysAttrs` オプションが必要です。

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
|-------------|-------------------|------|
| **normalized** (デフォルト) | (なし) | 型とメタデータを含む完全フォーマット |
| **keyValues** | `options=keyValues` | キーバリューペアのみ (メタデータなし) |
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
|-------------|----------------|------|
| **normalized** (デフォルト) | `application/ld+json` | 型とメタデータを含む完全フォーマット |
| **concise** | `application/ld+json` + `options=concise` | 簡潔フォーマット (省略記法) |
| **keyValues** | `application/ld+json` + `options=keyValues` | キーバリューペアのみ |

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

## 共通機能

以下の機能は両方の API で共有されています。

### 1. クエリ言語

| 機能 | NGSIv2 | NGSI-LD | 説明 |
|---------|--------|---------|-------------|
| **シンプルクエリ** | `q` パラメータ | `q` パラメータ | 属性値フィルタ (例: `temperature>20;humidity<80`) |
| **メタデータクエリ** | `mq` パラメータ | `q` パラメータ (メタデータもクエリ可能) | メタデータフィルタ |
| **スコープクエリ** | `Fiware-ServicePath` ヘッダ (スコープから独立) | `scopeQ` パラメータ | スコープ階層フィルタ |

**基本的な例:**

```bash
# NGSIv2: Entities with temperature greater than 20
curl 'http://localhost:3000/v2/entities?type=Room&q=temperature>20'

# NGSI-LD: Entities with temperature greater than 20
curl 'http://localhost:3000/ngsi-ld/v1/entities?type=Room&q=temperature>20'
```

#### メタデータクエリ (mq) の詳細

NGSIv2 の `mq` パラメータは、属性メタデータに対するクエリをサポートします。

**サポートされている演算子:**

| 演算子 | 説明 | 例 |
|----------|-------------|---------|
| `==` | 等しい | `mq=temperature.accuracy==0.95` |
| `!=` | 等しくない | `mq=temperature.accuracy!=0` |
| `>`、`<`、`>=`、`<=` | 比較演算子 | `mq=temperature.accuracy>0.9` |
| `~=` | パターンマッチ | `mq=temperature.unit~=Cel.*` |
| `..` | 範囲 (境界を含む) | `mq=temperature.accuracy==0.9..1.0` |
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

**サポートされている演算子:**

| 演算子 | 説明 | 例 |
|----------|-------------|---------|
| `/path` | 完全一致 | `scopeQ=/Japan/Tokyo` |
| `/path/+` | 1 階層下のみ | `scopeQ=/Japan/+` (例: Tokyo) |
| `/path/#` | すべての子孫 | `scopeQ=/Japan/#` (例: Tokyo、Tokyo/Shibuya) |
| `;` | AND 条件 (複数のスコープ) | `scopeQ=/Japan/Tokyo;/IoT` |

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

| ジオクエリ演算子 | NGSIv2 | NGSI-LD | 説明 |
|--------------------|--------|---------|-------------|
| `near` | ✅ | ✅ | 指定した地点の近く |
| `coveredBy` | ✅ | ✅ | 領域内に完全に含まれる |
| `within` | ✅ | ✅ | 領域と交差または含まれる |
| `intersects` | ✅ | ✅ | 領域と交差する |
| `disjoint` | ✅ | ✅ | 領域と交差しない |

**例:**

```bash
# NGSIv2: Entities within 1km of Tokyo Station
curl 'http://localhost:3000/v2/entities?georel=near;maxDistance:1000&geometry=point&coords=35.6812,139.7671'

# NGSI-LD: Entities within 1km of Tokyo Station
curl 'http://localhost:3000/ngsi-ld/v1/entities?georel=near;maxDistance==1000&geometry=Point&coordinates=%5B139.7671,35.6812%5D'
```

### 3. ページネーション

| ヘッダ | NGSIv2 | NGSI-LD | 説明 |
|--------|--------|---------|-------------|
| **総数** | `Fiware-Total-Count` | `NGSILD-Results-Count` | クエリ結果の総数 |
| **次のリンク** | `Link` (rel="next") | `Link` (rel="next") | 次のページへのリンク |

詳細については、[ページネーション](/ja/api-reference/pagination)を参照してください。

### 4. サブスクリプション

| 通知方法 | NGSIv2 | NGSI-LD | 説明 |
|--------------------|--------|---------|-------------|
| **HTTP Webhook** | ✅ | ✅ | REST エンドポイントへの POST |
| **MQTT** | ✅ | ✅ | MQTT ブローカへの公開 (QoS 0/1/2、TLS) |
| **WebSocket** | ✅ | ✅ | リアルタイムイベントストリーム |

### 5. フェデレーション (Context Source Registration)

| 機能 | NGSIv2 | NGSI-LD | 説明 |
|---------|--------|---------|-------------|
| **Registration API** | `/v2/registrations` | `/ngsi-ld/v1/csourceRegistrations` | リモートプロバイダーの登録 |
| **並列クエリ** | ✅ | ✅ | 複数のプロバイダーへの同時クエリ |
| **結果のマージ** | ✅ | ✅ | ローカルとリモートの結果のマージ |
| **ループ検出** | ✅ | ✅ | `Via` ヘッダーによるループ検出 |

---

## NGSI-LD 固有の機能

以下の機能は NGSI-LD API でのみサポートされており、NGSIv2 API では直接利用できません。

### 1. Relationship

エンティティ間の関連を表します。

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

> **注意:** プロトコル分離により、NGSI-LD エンティティ (Relationship 属性を含むもの) は NGSIv2 API 経由ではアクセスできません。

### 2. LanguageProperty (多言語プロパティ)

複数の言語で文字列を保持します。

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

**NGSI-LD で `lang=ja` を使用する場合:**

`lang` クエリパラメータを使用すると、LanguageProperty は標準の Property に変換され、指定された言語の値が `value` フィールドに設定されます。

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

> **注意:** プロトコル分離により、NGSI-LD エンティティ (LanguageProperty 属性を含むもの) は NGSIv2 API 経由ではアクセスできません。

### 3. Scope (スコープ階層)

エンティティの論理的な階層を表します。

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
# All entities under /Japan/Tokyo
curl 'http://localhost:3000/ngsi-ld/v1/entities?scopeQ=/Japan/Tokyo'
```

**NGSIv2 との互換性:**

- NGSIv2 は階層的なエンティティ管理に `Fiware-ServicePath` ヘッダーを使用します
- `servicePath` は `?attrs=servicePath` 経由で組み込み属性として利用可能です
- **servicePath と scope は独立した概念です (#964):** 自動的には同期されません
  - NGSIv2 `Fiware-ServicePath` → DB に `servicePath` として保存 (インフラストラクチャレベルの分離)
  - NGSI-LD `scope` → DB に `scope` として保存 (ユーザー定義の論理階層)
  - NGSI-LD は ETSI GS CIM 009 仕様に従い `Fiware-ServicePath` ヘッダーを無視します

### 4. 属性プロジェクション (pick / omit パラメータ)

NGSI-LD では、`pick` および `omit` クエリパラメータを使用して、レスポンスに含まれる属性を制御できます。

#### pick パラメータ (属性選択)

指定された属性のみをレスポンスに含めます。

**例:**

```bash
# Retrieve only the temperature and humidity attributes
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

#### omit パラメータ (属性除外)

指定された属性をレスポンスから除外します。

**例:**

```bash
# Retrieve without the location attribute
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

**注意事項:**

- `pick` と `omit` は同時に使用できません
- `pick` を使用する場合: `@context`、`id`、`type`、および指定された属性のみが含まれます。`createdAt` と `modifiedAt` は含まれません。
- `omit` を使用する場合: 指定された属性以外のすべての属性が含まれます。`id` と `type` は除外できません (ETSI GS CIM 009 V1.9.1 仕様による)

**NGSIv2 互換性:**

- NGSIv2 API では、`attrs` パラメータが同等の機能を提供します (pick のみ)
- `omit` に相当する NGSIv2 の機能はありません

```bash
# Retrieve only temperature and humidity with NGSIv2 (equivalent to pick)
curl 'http://localhost:3000/v2/entities/urn:ngsi-ld:Room:001?attrs=temperature,humidity'
```

### 5. @context (JSON-LD コンテキスト)

NGSI-LD では、エンティティに `@context` を含めることで、ボキャブラリを定義します。

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

**NGSIv2 互換性:**

- NGSIv2 には `@context` の概念がありません
- GeonicDB は Smart Data Models の `@context` の自動補完をサポートしていますが、`@context` は NGSIv2 API では返されません

---

## エンティティ ID に関する考慮事項

### エンティティ ID の一意性 (GeonicDB 拡張)

> **GeonicDB 拡張**: GeonicDB では、エンティティ ID はテナント (`Fiware-Service`) とServicePath (`Fiware-ServicePath`) のスコープ内で一意です。エンティティの `type` は一意性制約の一部では**ありません**。

これは意図的な設計決定であり、両方の API で ID のセマンティクスを統一するものです:

- **NGSI-LD** はエンティティ ID を URI として扱い、本質的に一意です
- **NGSIv2** (標準) では同じ ID で異なる型のエンティティが共存できますが、GeonicDB はこの動作を**サポートしません**

**影響:**
- **直接作成** (`POST /v2/entities`、`POST /ngsi-ld/v1/entities`): 既存のエンティティと同じ ID を持つエンティティを作成すると (異なる `type` であっても) `409 AlreadyExists` が返されます
- **バッチ更新** (`POST /v2/op/update` と `append`/`appendStrict`): `entityId` のみでエンティティをマッチングします。属性は更新されますが、元の `type` は保持されます
- **バッチアップサート** (`POST /ngsi-ld/v1/entityOperations/upsert`): `entityId` のみでエンティティをマッチングします。属性は更新されます (型の処理はアップサートのセマンティクスに従います)
- **バッチ作成** (`POST /ngsi-ld/v1/entityOperations/create`): 重複する ID に対してエンティティごとのエラー詳細を含む `207` を返します
- 同じ ID のエンティティ間での型による曖昧性解消のための NGSIv2 の `?type=` パラメータは適用されなくなりました

この統一により、NGSIv2 の型ベースの曖昧性解消が NGSI-LD の一意な ID モデルと競合する相互運用性の問題を排除します。

### NGSI-LD URI 要件

NGSI-LD 仕様では、エンティティ ID は URI 形式であることが推奨されています。

**推奨される形式 (URN):**

```text
urn:ngsi-ld:{EntityType}:{LocalId}
```

**例:**

```text
urn:ngsi-ld:Room:001
urn:ngsi-ld:Vehicle:ABC123
urn:ngsi-ld:WeatherObserved:Tokyo-2026-02-08
```

**NGSIv2 互換性:**

- NGSIv2 では任意の文字列を ID として使用できます (例: `Room1`、`sensor-abc`)
- 一貫性と将来の移行のため、どの API を使用する場合でも URN 形式の使用が推奨されます

**ベストプラクティス:**

- NGSIv2 API を使用する場合でも、すべてのエンティティに URN 形式を使用します
- NGSIv2 から NGSI-LD に移行する場合、エンティティは NGSI-LD API を介して再作成する必要があります (プロトコルの分離により API 間アクセスは防止されます)

---

## フェデレーション

GeonicDB のフェデレーション機能は、リモートコンテキストプロバイダのプロトコルを自動的に検出します。

### 自動プロトコル検出

登録されたリモートプロバイダに対して、GeonicDB は以下の順序でプロトコルを検出します:

1. **明示的な指定** - 登録時に `information.format` が指定されている場合、そのプロトコルが使用されます
2. **自動検出** - URL パスからの自動検出:
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

**NGSIv2 でクエリすると、NGSI-LD プロバイダに自動的に転送されます:**

```bash
curl http://localhost:3000/v2/entities/urn:ngsi-ld:Vehicle:V999 \
  -H "Fiware-Service: demo"
```

**動作:**

1. GeonicDB は `urn:ngsi-ld:Vehicle:V999` がローカルに存在しないことを検出します
2. 登録情報から `http://remote-provider.example.com/ngsi-ld/v1` を特定します
3. NGSI-LD プロトコルを使用してクエリを転送します: `GET /ngsi-ld/v1/entities/urn:ngsi-ld:Vehicle:V999`4. レスポンスを NGSI-LD → 内部形式 → NGSIv2 に変換してクライアントに返します

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

**NGSI-LD でクエリすると、NGSIv2 プロバイダに自動的に転送されます:**

```bash
curl http://localhost:3000/ngsi-ld/v1/entities/urn:ngsi-ld:Sensor:S888 \
  -H "Fiware-Service: demo"
```

**動作:**

1. GeonicDB は `urn:ngsi-ld:Sensor:S888` がローカルに存在しないことを検出します
2. 登録情報から `http://legacy-system.example.com/v2` を特定します
3. NGSIv2 プロトコルを使用してクエリを転送します: `GET /v2/entities/urn:ngsi-ld:Sensor:S888`4. レスポンスを NGSIv2 → 内部形式 → NGSI-LD に変換してクライアントに返します

---

## ユースケースとベストプラクティス

### どちらのAPIを使用すべきか？

#### NGSIv2 を選択するケース

- **既存の FIWARE Orion 互換システム** - レガシーシステムとの統合
- **シンプルな IoT データ管理** - センサーデータの収集と可視化
- **学習コストの低さ** - NGSI-LD よりもシンプルな仕様
- **豊富な既存ドキュメントとツール** - 成熟した NGSIv2 エコシステム

**推奨されるユースケース:**

- IoT センサーネットワーク
- 基本的なスマートシティデータ収集
- プロトタイピングと PoC

#### NGSI-LD を選択するケース

- **セマンティック Web / Linked Data** - JSON-LD と RDF の活用
- **複雑なエンティティ間の関係** - Relationship と LanguageProperty の使用
- **国際標準への準拠** - ETSI 標準に準拠したシステム
- **将来的な拡張性** - NGSI-LD 仕様は継続的に拡張されています

**推奨されるユースケース:**

- Smart Data Models を活用したデータカタログ
- 多言語サポートが必要なシステム
- エンティティ間の複雑な関係を表現する必要があるシステム
- データ統合とオープンデータ公開

#### 両方の API を同時に実行する

GeonicDB は両方の API を同時にサポートしていますが、エンティティはプロトコルごとに分離されています。各 API は独自のエンティティセットに対して独立して動作します。

**推奨されるアプローチ:**

1. **ユースケースごとに 1 つの API を選択** - 同じデータに対してプロトコルを混在させることは避けてください。要件に基づいて NGSIv2 または NGSI-LD を選択し、それに従ってください
2. **プロトコル間のニーズには Federation を使用** - NGSIv2 クライアントが NGSI-LD エンティティにアクセスする必要がある場合(またはその逆)、Federation 経由でコンテキストソースを登録してください
3. **マイグレーションには再作成が必要** - NGSIv2 から NGSI-LD にエンティティを移行するには、NGSIv2 API からエクスポートし、NGSI-LD API 経由で再作成してください。プロトコル間の自動マイグレーションはありません

### ベストプラクティス

#### 1. エンティティ ID には URN 形式を使用する

**推奨:**

```text
urn:ngsi-ld:Room:001
```

**非推奨:**

```text
Room1
sensor-abc
```

理由: NGSI-LD 仕様に準拠し、両方の API 間で互換性を維持します。

#### 2. 地理空間データには GeoJSON を使用する

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

理由: ジオクエリは GeoJSON 形式のみをサポートしています。

#### 3. Smart Data Models を活用する

GeonicDB は Smart Data Models の `@context` を自動的に補完します。

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

理由: `type` が Smart Data Models のモデル名と一致する場合、適切な `@context` が自動的に補完されます。

#### 4. 目的に応じてサブスクリプションを選択する

| 目的 | 推奨チャネル | 理由 |
|------|-------------|------|
| Web アプリ(リアルタイム更新) | WebSocket | 低レイテンシ、サーバー不要 |
| サーバー間統合 | HTTP Webhook | 信頼性、リトライ機能 |
| IoT デバイス | MQTT | 軽量、QoS 保証 |

#### 5. テナント分離を活用する

`Fiware-Service` ヘッダーを使用してテナントを分離します。

```bash
# Create entity in tenant "demo"
curl -X POST http://localhost:3000/v2/entities \
  -H "Fiware-Service: demo" \
  -d '{...}'

# Create entity in tenant "prod"
curl -X POST http://localhost:3000/v2/entities \
  -H "Fiware-Service: prod" \
  -d '{...}'
```

理由: 開発環境と本番環境の分離、および顧客ごとのデータ分離が可能になります。

---

## まとめ

| 項目 | NGSIv2 | NGSI-LD | GeonicDB の動作 |
|------|--------|---------|----------------|
| **プロトコル** | REST/JSON | REST/JSON-LD | 両方をサポート。エンティティは `protocol` フィールドで分離 |
| **エンティティ分離** | `protocol: 'ngsiv2'` | `protocol: 'ngsild'` | 各 API は自身のエンティティのみを参照 |
| **エンティティ ID** | 任意の文字列 | URI (URN 推奨) | URN を推奨。**ID はテナント + servicePath ごとに一意**(型による区別は削除) |
| **属性の型** | シンプル (Number、Text など) | セマンティック (Property、Relationship など) | 型マッピングルールで対応関係を定義(上記の表を参照) |
| **システム属性** | `dateCreated`、`dateModified` | `createdAt`、`modifiedAt` | 内部で統一され、API ごとに変換 |
| **ジオクエリ** | ✅ | ✅ | 共有機能 |
| **サブスクリプション** | ✅ (HTTP、MQTT、WebSocket) | ✅ (HTTP、MQTT、WebSocket) | 共有機能 |
| **フェデレーション** | ✅ | ✅ | 自動プロトコル検出。プロトコル間アクセスを可能にする |
| **プロトコル間アクセス** | 直接サポートなし | 直接サポートなし | プロトコル間アクセスが必要な場合はフェデレーションを使用 |
| **ユースケース** | IoT、レガシーシステム | セマンティック Web、オープンデータ | ユースケースごとに 1 つの API を選択 |

GeonicDB は、厳格なプロトコル分離を伴う NGSIv2 と NGSI-LD の両方の API を提供します。ユースケースに最適な API を選択し、プロトコル間アクセスが必要な場合はフェデレーションを活用してください。

---

## 関連ドキュメント

- [API 共通仕様](../api-reference/endpoints.md)
- [NGSIv2 API](../api-reference/ngsiv2.md)
- [NGSI-LD API](../api-reference/ngsild.md)
- [Smart Data Models](../features/smart-data-models.md)
- [FIWARE Orion 比較](../migration/compatibility-matrix.md)