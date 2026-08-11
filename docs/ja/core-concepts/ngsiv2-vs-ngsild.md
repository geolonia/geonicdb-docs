---
title: "NGSIv2 vs NGSI-LD"
description: "NGSIv2 and NGSI-LD interoperability"
outline: deep
---
# NGSIv2 / NGSI-LD プロトコル分離

GeonicDB は単一の Context Broker で NGSIv2 と NGSI-LD の両方の API をサポートしています。両方の API は統一された内部ストレージフォーマットを共有していますが、**エンティティはプロトコルによって分離されています** -- NGSIv2 経由で作成されたエンティティは NGSIv2 経由でのみアクセス可能で、NGSI-LD についても同様です。

## 目次


* [概要](#overview)
  
* [統一内部フォーマット](#統一内部フォーマット)
  
* [プロトコル分離](#プロトコル分離)
  
* [属性タイプマッピングテーブル](#属性タイプマッピングテーブル)
  
* [システム属性の違い](#システム属性の違い)
  
* [出力フォーマットの違い](#出力フォーマットの違い)
  
* [共有機能](#shared-features)
  
* [NGSI-LD 固有機能](#ngsi-ld-specific-features)
  
* [エンティティ ID の考慮事項](#エンティティ-id-の考慮事項)
  
* [フェデレーション](#フェデレーション)
  
* [ユースケースとベストプラクティス](#ユースケースとベストプラクティス)

***

## 概要

GeonicDB のデュアル API アーキテクチャは、FIWARE NGSIv2 と ETSI NGSI-LD の両方の仕様をサポートしています。各エンティティはそれを作成したプロトコルでタグ付けされており、2つの API 間の厳格な分離を保証します。

### アーキテクチャ

```text
NGSIv2 API (/v2) ──────> [protocol: 'ngsiv2'] ──┐
                                                 ├──> Unified Internal Format ──> MongoDB
NGSI-LD API (/ngsi-ld/v1) ──> [protocol: 'ngsild'] ┘
```


* 両方の API は同じ MongoDB ストレージと統一された内部フォーマットを共有します
  
* 各エンティティは作成時に `protocol` フィールド(`'ngsiv2'` または `'ngsild'`)を持ちます
  
* クエリはプロトコルでフィルタリングされます:NGSIv2 API は `protocol: 'ngsiv2'` エンティティのみを返し、NGSI-LD API は `protocol: 'ngsild'` エンティティのみを返します
  
* `protocol` フィールドを持たない既存のエンティティは `'ngsild'` として扱われます

### メリット


* **プロトコル分離** - 明確な境界により、意図しないプロトコル間のデータ漏洩を防ぎ、各 API が仕様準拠のエンティティのみを返すことを保証します
  
* **仕様準拠** - 各 API は厳密に独自の仕様内で動作し、フォーマット変換によるエッジケースを回避します
  
* **既存システムとの統合** - NGSIv2 と NGSI-LD のワークロードを干渉なく並行して実行できます
  
* **API 選択の自由** - 各ユースケースに最適な API を選択できます。プロトコル間の連携が必要な場合は Federation を使用します

***

## 統一内部フォーマット

GeonicDB は両方の API からのデータを統一内部フォーマットに変換します。

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

***

## プロトコル分離

エンティティは、それを作成したプロトコルによって分離されます。各エンティティには `protocol` フィールド(`'ngsiv2'` または `'ngsild'`)があり、どの API がアクセスできるかを決定します。

### ルール

| Operation             | NGSIv2 entity (`protocol: 'ngsiv2'`) | NGSI-LD entity (`protocol: 'ngsild'`) |
| --------------------- | ------------------------------------ | ------------------------------------- |
| NGSIv2 GET/LIST       | Visible                              | Not visible                           |
| NGSIv2 UPDATE/DELETE  | Allowed                              | Not found (404)                       |
| NGSI-LD GET/LIST      | Not visible                          | Visible                               |
| NGSI-LD UPDATE/DELETE | Not found (404)                      | Allowed                               |

### レガシーエンティティ

プロトコル分離の導入前に作成されたエンティティ(つまり、データベースに `protocol` フィールドがないもの)は `'ngsild'` として扱われます。これらは NGSI-LD API 経由でのみアクセス可能です。

### Federation によるクロスプロトコルアクセス

直接的なクロスプロトコルアクセスはサポートされていません。プロトコル間でエンティティにアクセスする必要がある場合は、**Federation**(Context Source Registration)を使用して、ある GeonicDB インスタンスを他のプロトコルのコンテキストプロバイダーとして登録してください。詳細については [Federation](#federation) セクションを参照してください。

### 例:プロトコル分離の動作

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

***

## 属性タイプマッピングテーブル

GeonicDB は、以下のルールに従って NGSIv2 タイプ、内部タイプ、および NGSI-LD タイプ間で変換を行います。

### 基本データタイプ

| NGSIv2 Type       | Internal Type | NGSI-LD Type                     | Description                  |
| ----------------- | ------------- | -------------------------------- | ---------------------------- |
| `Number`          | `Number`      | `Property`                       | Numeric (integer or decimal) |
| `Text` / `String` | `String`      | `Property`                       | String                       |
| `Boolean`         | `Boolean`     | `Property`                       | Boolean                      |
| `DateTime`        | `DateTime`    | `Property` or `TemporalProperty` | ISO 8601 datetime string     |
| `Null`            | `Null`        | `Property`                       | null value                   |

### 構造化データタイプ

| NGSIv2 Type       | Internal Type | NGSI-LD Type                 | Description     |
| ----------------- | ------------- | ---------------------------- | --------------- |
| `Object`          | `Object`      | `Property`                   | JSON object     |
| `Array`           | `Array`       | `Property` or `ListProperty` | JSON array      |
| `StructuredValue` | `Object`      | `Property`                   | Structured data |

### 地理空間タイプ

| NGSIv2 Type | Internal Type     | NGSI-LD Type  | Description                                                                                                                                                                                                                            |
| ----------- | ----------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `geo:json`  | `GeoJSON`         | `GeoProperty` | GeoJSON (Point, LineString, Polygon, MultiPoint, MultiLineString, MultiPolygon). Multi\* geometries are also accepted in geo-queries (`geometry` parameter) and subscription `geoQ.geometry` with nested coordinates preserved (#1696) |
| `geo:point` | `GeoJSON` (Point) | `GeoProperty` | Latitude/longitude point                                                                                                                                                                                                               |

### NGSI-LD 固有タイプ

以下の NGSI-LD 固有タイプは内部的に保持されますが、NGSIv2 API では `Property` として扱われます。

| NGSI-LD Type       | Internal Type      | NGSIv2 Conversion            | Description                                                                                                                                                                |
| ------------------ | ------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Relationship`     | `Relationship`     | `Relationship` (custom type) | Entity reference (includes `object` property)                                                                                                                              |
| `LanguageProperty` | `LanguageProperty` | `StructuredValue`            | Multilingual string (includes `languageMap` property)                                                                                                                      |
| `JsonProperty`     | `JsonProperty`     | `Object`                     | JSON data (includes `json` property)                                                                                                                                       |
| `VocabProperty`    | `VocabProperty`    | `Object`                     | Vocabulary data. `vocab` is defined by ETSI GS CIM 009; `vocabMap` is a **GeonicDB-only extension** (not in NGSI-LD) and is therefore not interoperable with other brokers |
| `ListProperty`     | `ListProperty`     | `Array`                      | Ordered array (includes `valueList` property)                                                                                                                              |
| `ListRelationship` | `ListRelationship` | `Array`                      | Array of entity references (includes `objectList` property)                                                                                                                |

### メタデータタイプマッピング

| NGSIv2 Metadata Name    | NGSI-LD Property        | Description               |
| ----------------------- | ----------------------- | ------------------------- |
| `unit` (Text)           | `unitCode` (string)     | Unit (e.g., "CEL", "KMH") |
| `observedAt` (DateTime) | `observedAt` (ISO 8601) | Observation timestamp     |
| `datasetId` (Text)      | `datasetId` (URI)       | Dataset ID                |

***

## システム属性の違い

エンティティのメタデータ(作成および変更のタイムスタンプ)は、API によって異なる名前を使用します。

### NGSIv2 システム属性

| Attribute Name | Type       | Description                               |
| -------------- | ---------- | ----------------------------------------- |
| `dateCreated`  | `DateTime` | Entity creation timestamp (ISO 8601)      |
| `dateModified` | `DateTime` | Entity last modified timestamp (ISO 8601) |

**例 (NGSIv2 レスポンス、`options=dateCreated,dateModified` 使用時):**

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

| Attribute Name | Type            | Description                    |
| -------------- | --------------- | ------------------------------ |
| `createdAt`    | ISO 8601 string | Entity creation timestamp      |
| `modifiedAt`   | ISO 8601 string | Entity last modified timestamp |

**注:** `pick` パラメータを使用する場合、レスポンスには明示的にリクエストされた属性と、`@context`、`id`、`type`(これらは常に存在します)が含まれます。ただし、`createdAt` および `modifiedAt` は、`pick` を使用しても返されません — これらのシステム属性には `sysAttrs` オプションが必要です。

**例 (NGSI-LD レスポンス、システム属性は常に含まれます):**

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

***

## 出力フォーマットの違い

各 API は複数のレスポンスフォーマットをサポートしています。

### NGSIv2 出力フォーマット

| Format                   | options Parameter   | Description                             |
| ------------------------ | ------------------- | --------------------------------------- |
| **normalized** (default) | (none)              | Full format including type and metadata |
| **keyValues**            | `options=keyValues` | Key-value pairs only (no metadata)      |
| **values**               | `options=values`    | Array of attribute values only          |

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

> **メディアタイプと表現フォーマット。** これらは独立した軸です。`Accept` ヘッダーは *メディアタイプ* を選択し、`options` / `format` は以下の *表現フォーマット* を選択します。ETSI GS CIM 009 clause 6.3.4 によると、**`Accept` ヘッダーが存在しない場合(または `*/*`)は `application/json` に解決され**、`application/ld+json` にはなりません — レスポンスボディに `@context` を埋め込みたい場合は、明示的に `Accept: application/ld+json` を送信してください(#1734)。`application/json` / `application/ld+json`(および entity エンドポイントでの `application/geo+json`)のみがサポートされています。それ以外は `406 Not Acceptable` を返します。[API\_NGSILD.md — Content Negotiation](../api-reference/ngsild.md#content-negotiation-and-context) を参照してください。

| Format                   | Accept Header                                         | Description                             |
| ------------------------ | ----------------------------------------------------- | --------------------------------------- |
| **normalized** (default) | any supported media type (e.g. `application/ld+json`) | Full format including type and metadata |
| **concise**              | any supported media type + `options=concise`          | Concise format (abbreviated notation)   |
| **keyValues**            | any supported media type + `options=keyValues`        | Key-value pairs only                    |

**例:**

```bash
# normalized (default)
curl http://localhost:3000/ngsi-ld/v1/entities/urn:ngsi-ld:Room:Room1

# concise
curl 'http://localhost:3000/ngsi-ld/v1/entities/urn:ngsi-ld:Room:Room1?options=concise'

# keyValues
curl 'http://localhost:3000/ngsi-ld/v1/entities/urn:ngsi-ld:Room:Room1?options=keyValues'
```

***

## 共通機能

以下の機能は両方の API で共通です。

### 1. Query Language

| Feature            | NGSIv2                                               | NGSI-LD                                 | Description                                                 |
| ------------------ | ---------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------- |
| **Simple Query**   | `q` parameter                                        | `q` parameter                           | Attribute value filter (e.g., `temperature>20;humidity<80`) |
| **Metadata Query** | `mq` parameter                                       | `q` parameter (metadata also queryable) | Metadata filter                                             |
| **Scope Query**    | `Fiware-ServicePath` header (independent from scope) | `scopeQ` parameter                      | Scope hierarchy filter                                      |

**基本的な例:**

```bash
# NGSIv2: Entities with temperature greater than 20
curl 'http://localhost:3000/v2/entities?type=Room&q=temperature>20'

# NGSI-LD: Entities with temperature greater than 20
curl 'http://localhost:3000/ngsi-ld/v1/entities?type=Room&q=temperature>20'
```

#### メタデータクエリ (mq) の詳細

NGSIv2 の `mq` パラメータは、属性メタデータに対するクエリをサポートします。

**サポートされる演算子:**

| Operator             | Description          | Example                                                 |                               |                         |
| -------------------- | -------------------- | ------------------------------------------------------- | ----------------------------- | ----------------------- |
| `==`                 | Equal to             | `mq=temperature.accuracy==0.95`                         |                               |                         |
| `!=`                 | Not equal to         | `mq=temperature.accuracy!=0`                            |                               |                         |
| `>`, `<`, `>=`, `<=` | Comparison operators | `mq=temperature.accuracy>0.9`                           |                               |                         |
| `~=`                 | Pattern match        | `mq=temperature.unit~=Cel.*`                            |                               |                         |
| `..`                 | Range (inclusive)    | `mq=temperature.accuracy==0.9..1.0`                     |                               |                         |
| `,`                  | List (OR)            | `mq=temperature.unit==Celsius,Fahrenheit`               |                               |                         |
| `;`                  | AND condition        | `mq=temperature.accuracy>0.9;temperature.unit==Celsius` |                               |                         |
| \`                   | \`                   | OR condition                                            | \`mq=temperature.accuracy>0.9 | humidity.accuracy>0.8\` |

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

> **メタデータ名の文字セット (#1946):** `mq` 条件内の属性名とメタデータ名の両方は `\w+` (Orion 互換文法) として解析されるため、メタデータ名は書き込み時に `^[A-Za-z0-9_]+$` に対して検証されます。`.`, `-`, `$` または空白を含む名前は、クエリで取得できないデータとして保存されるのではなく、`400` エラーで拒否されます。[エンティティフィールドの文字セット](#entity-field-character-set-id--type--attribute-name--geonicdb-独自拡張) を参照してください。

#### スコープクエリ (scopeQ) の詳細

NGSI-LD の `scopeQ` パラメータは、エンティティスコープ階層に対するクエリをサポートします。

**サポートされる演算子:**

| Operator  | Description                     | Example                                        |
| --------- | ------------------------------- | ---------------------------------------------- |
| `/path`   | Exact match                     | `scopeQ=/Japan/Tokyo`                          |
| `/path/+` | One level below only            | `scopeQ=/Japan/+` (e.g., Tokyo)                |
| `/path/#` | All descendants                 | `scopeQ=/Japan/#` (e.g., Tokyo, Tokyo/Shibuya) |
| `;`       | AND condition (multiple scopes) | `scopeQ=/Japan/Tokyo;/IoT`                     |

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

#### スコープの文字セット (GeonicDB 独自拡張)

NGSI-LD 仕様 (ETSI GS CIM 009 clause 4.18 / 5.2.x) は、スコープセグメント文字を `[A-Za-z0-9_]` (ALPHA / DIGIT / アンダースコア) に制限しています。GeonicDB はこれを **POSIX Portable Filename Character Set** に若干拡張することで、スコープがファイルシステムスタイルのパスとして直感的になるようにしています:

|                            | NGSI-LD spec (strict) | GeonicDB (POSIX portable)                         |
| -------------------------- | --------------------- | ------------------------------------------------- |
| Allowed segment characters | `[A-Za-z0-9_]`        | `[A-Za-z0-9._-]`                                  |
| Leading `/` required       | ✅                     | ✅                                                 |
| Empty segments (`//`)      | ❌                     | ❌                                                 |
| Segment may start with `-` | (n/a)                 | ❌ (POSIX convention to avoid CLI-flag collisions) |

形式文法:

```ebnf
ScopePath  = "/" ScopeLevel ( "/" ScopeLevel )*
ScopeLevel = ( ALPHA | DIGIT | "." | "_" ) *( ALPHA | DIGIT | "." | "_" | "-" )
```

Regex per scope string: `^(/[A-Za-z0-9._][A-Za-z0-9._-]*)+$`

**なぜ POSIX portable なのか?** 純粋な NGSI-LD 仕様のセット (`[A-Za-z0-9_]`) は実際の使用には過度に制限的です。POSIX portable は `.` と `-` を追加し、`/com.example.region/tokyo-shibuya` や `/v1.0/sensors` のような自然な名前を可能にします。同時に、`scopeQ` の予約文字 (`;` `+` `#`) と半角スペースを拒否します — これらはそうでなければ**静かな罠**となります: 保存は成功しますが、エンティティは `scopeQ` 経由でマッチ不可能になります。

**例:**

| Input                               | Status               | Reason                          |
| ----------------------------------- | -------------------- | ------------------------------- |
| `/Japan/Tokyo`                      | ✅ accepted           | NGSI-LD strict compliant        |
| `/com.example.region/tokyo-shibuya` | ✅ accepted           | POSIX portable extension        |
| `/v1.0/sensors`                     | ✅ accepted           | POSIX portable extension        |
| `/Japan/+`                          | ❌ 400 BadRequestData | `+` is a `scopeQ` wildcard      |
| `/Japan;Tokyo`                      | ❌ 400 BadRequestData | `;` is a `scopeQ` AND separator |
| `/Japan/#`                          | ❌ 400 BadRequestData | `#` is a `scopeQ` wildcard      |
| `/Tokyo Shibuya`                    | ❌ 400 BadRequestData | Half-width space                |
| `Tokyo`                             | ❌ 400 BadRequestData | Missing leading `/`             |
| `/Japan//Tokyo`                     | ❌ 400 BadRequestData | Empty segment                   |
| `/-Japan`                           | ❌ 400 BadRequestData | Segment starts with `-`         |
| `/東京`                               | ❌ 400 BadRequestData | Non-ASCII                       |

検証は `POST/PATCH/PUT /entities`、`POST /entityOperations/*`、temporal エンドポイント、および ReactiveCore ルールの `createEntity` アクションに適用されます。非適合スコープを持つ既存の保存済みエンティティ (pre-#1189 データ) は読み取り可能なまま残ります; 新しい書き込みリクエストのみが拒否されます。

厳密な NGSI-LD 仕様準拠を目指すクライアントは、実装間での移植性のために、スコープを `[A-Za-z0-9_]` 内に保つべきです。

#### Scope Update Semantics (GeonicDB 独自拡張)

NGSI-LD 仕様 (ETSI GS CIM 009) はエンティティの `scope` フィールドと `scopeQ` クエリパラメータを定義していますが、PATCH/PUT/upsert を通じて既存のスコープをアンセットする方法は**指定していません**。GeonicDB は API を次のように拡張します:

| Request body for `scope`                 | Effect                                                                    | Subsequent GET response                                   |
| ---------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------- |
| (field omitted)                          | Existing scope preserved                                                  | Whatever was previously stored (key omitted if never set) |
| `"scope": "/foo"` or `"scope": ["/foo"]` | Replace with the new value                                                | `"scope": ["/foo"]`                                       |
| `"scope": null`                          | **Explicit unset** (GeonicDB extension)                                   | `"scope": null`                                           |
| `"scope": []`                            | **Explicit unset** — treated as equivalent to `null` (GeonicDB extension) | `"scope": null`                                           |


* アンセット拡張をサポートするエンドポイント: `PATCH /entities/{id}` (merge-patch)、`PUT /entities/{id}` (replace)、`POST /entityOperations/upsert` (merge および replace モードの両方)。attrs レベルのエンドポイント `PATCH /entities/{id}/attrs` は現在 `scope` フィールドを尊重しません (送信された値は黙って無視されます)。scope を更新する必要がある場合は、代わりにエンティティレベルの `PATCH /entities/{id}` を使用してください。
  
* 明示的アンセット状態 (`scope: null`) はフィールドを完全に削除するのではなく、ストレージに保存されます。これにより、API は「scope が意図的にクリアされた」と「scope が設定されたことがない」を区別できます。
  
* `scopeQ` クエリは `scope: null` を持つエンティティにマッチしません (フィールドにはマッチさせるパスコンポーネントがありません)。これは、scope を持ったことがないエンティティと一貫しています。
  
* 厳密な NGSI-LD 仕様準拠を目指すクライアントは、この拡張に依存することを避けるべきです。

#### Entity Field Character Set (id / type / attribute name) — GeonicDB 独自拡張

NGSIv2 spec の Field syntax restrictions (control chars / whitespace / `&` `?` `/` `#` 以外を許容) と NGSI-LD spec はいずれも実装側が追加制約を加えることを許容している。GeonicDB は #1189 で scope に採用した **POSIX Portable Filename Character Set** を `type` にも展開しつつ、attribute name は実装上の制約から旧来の厳格な charset を維持する (#1209):

| Field                           | GeonicDB allowed characters                          | Regex                                       | NGSIv2 spec                            | NGSI-LD spec     |
| ------------------------------- | ---------------------------------------------------- | ------------------------------------------- | -------------------------------------- | ---------------- |
| `id`                            | `[A-Za-z0-9._:-]` (`:` for URN form, no leading `-`) | `^[A-Za-z0-9._:][A-Za-z0-9._:-]*$`          | ASCII minus `& ? / # whitespace`, ≤256 | URI form         |
| `type` (NGSIv2)                 | `[A-Za-z0-9._-]` (POSIX portable, no leading `-`)    | `^[A-Za-z0-9._][A-Za-z0-9._-]*$`            | same as `id`                           | —                |
| `type` (NGSI-LD, #1211)         | POSIX portable **OR** absolute IRI                   | TYPE\_PATTERN **\|** URI\_PATTERN     | —                                      | URI form         |
| attribute name (NGSIv2)         | `[A-Za-z0-9_]` (**MongoDB レイヤー制約のため**)               | `^[A-Za-z0-9_]+$`                           | same as `id`                           | —                |
| attribute name (NGSI-LD, #1649) | 短縮名 **OR** 絶対 IRI                                    | `^[A-Za-z0-9_]+$` **\|** URI\_PATTERN | —                                      | shortname or URI |
| Max length                      | 256 chars (all three fields)                         | —                                           | 256                                    | —                |

ここで `URI_PATTERN` は `/^[A-Za-z][A-Za-z0-9+.-]*:[^\s<>"{}|\\^`]+$/`— RFC 3986 の scheme (ALPHA 開始) +`:`+ 非空の opaque 部分 (空白・制御文字および`<>"{}|^\`\` を禁止)。

Notes:


* **`id` / `type` / attribute name すべて先頭の `-` を不可**。`id` の旧 regex (`^[\w:.-]+$`) は先頭 `-` を許容していたため、新 regex への移行で **`-` から始まる id がわずかに厳格化** される (POSIX 慣習に合わせ統一; 実運用で先頭 `-` の id はまず使われないため影響軽微)。
  
* `id` は `:` を受け入れます。なぜなら NGSI-LD URN 形式 `urn:ngsi-ld:Type:identifier` が正規の id フォーマットだからです。
  
* **NGSI-LD path** は POSIX portable 短縮名に加えて、`type` として絶対 IRI を受け入れます (#1211)。例: `https://uri.fiware.org/ns/data-models#WeatherObserved`、`urn:ngsi-ld:Type:Sensor`。**NGSIv2 path** は引き続き URI 形式を拒否します (プロトコル分離)。
  
* **型名 (`type`) は active `@context` で term ⇄ URI 展開される (ETSI GS CIM 009 §5.5.7、#1613)** — #1211 時点の「URI を不透明保存」は #1613 で置換された。書き込み・クエリ時に `@context` で型名を canonical 正規化し (term → FQN、core `@vocab` に落ちる短縮名は決定的に bare 短縮名へ還元して保存)、読み出し時は応答 `@context` で compact する。したがって、ある `@context` が `Vehicle → https://ontology.example/Vehicle` をマップしていれば、term `Vehicle` で投入したエンティティを FQN `https://ontology.example/Vehicle` でクエリしてヒットする (逆も同じ)。逆に、どの `@context` もマップしない短縮名 `Temperature` は core `@vocab` で `.../default-context/Temperature` に展開され、絶対 IRI `https://example.com/Temperature` とは別 URI なので照合しない (opaque 保存ではなく context 依存の展開結果として区別される)。型を伴うクエリ/作成で active `@context` が解決不能なら `504 LdContextNotAvailable` (§5.5.4、fail-closed)。**属性名セレクタ (`attrs` / `pick` / `omit`) を伴うクエリも同様** (#1613) — `Link` ヘッダで解決不能な `@context` を渡した場合、従来は属性名を展開せず `200` を返していたが、クエリの解釈に必要な `@context` が無い以上 fail-closed で `504` を返す (`?type=` と同じ扱い。**意図的な挙動変更**)。`Link` を付けないリクエストは従来どおり `@context` を解決しない。
  
* **属性名 (attribute name) の term ⇄ URI 展開は、セレクタ・単一属性パス (#1613) と保存キーの canonical 化 (#1649) の両方が実装済み。**

  **保存 canonical 形の定義**: `compactIri(core @context, expandTerm(リクエスト @context, 名前))`。すなわち
  

  * リクエスト `@context` が**マップする** term (`temperature → https://example/ns#Warmth`) → **FQN で保存**
    
  * core 語彙 (`location` / `observedAt` / `unitCode` 等) と**どの `@context` もマップしない**短縮名 → **短縮名のまま保存** (保存形不変)

  型名の canonical-bare (`@vocab` 剥がし) を属性名にそのまま使うと、core `@context` が `location` を `@vocab` ではなく `https://uri.etsi.org/ngsi-ld/location` にマップするため **`location` が FQN 化して geo インデックス・`geoproperty` の既定値・NGSIv2 相互運用がまとめて壊れる**。そのため属性名側は core で compact する定義を採る。FQN に含まれる `.` は MongoDB の dot-path と衝突するため保存キーでは percent エスケープする (`%` `.` `$` `\0` の 4 文字のみ、`src/core/entities/attr-key-escape.ts`)。

  したがって **flip の影響範囲は「リクエスト `@context` がマップする属性名」だけ**に閉じる。`@context` を渡さないクライアントの保存形は 1 バイトも変わらない。クエリ/照合側は `@context` で解決するため、**完全修飾 URI で属性を指定できる**: `?attrs=<FQN>` / `pick` / `omit` / `GET /attributes/{FQN}` / `PUT`・`PATCH`・`DELETE /entities/{id}/attrs/{FQN}` / temporal の `attrs` / `POST /entityOperations/query` の `attrs` / purge の `attrs`・`keep`・`drop`。解決はリクエスト `@context` を使った round-trip (FQN → その `@context` が定める term) であり、**書き込みと同じ `@context` を渡すクライアント**に対して機能する。
  

  * **`@context` を渡さないと短縮名は引けない (破壊的変更、#1649)**: `@context` がマップする属性を **`@context` 無し**で `GET /entities/{id}/attrs/{短縮名}` すると、その短縮名は `default-context/<名前>` = **別の属性**を指すため `404` になる。旧挙動 (verbatim 保存ゆえに保存名で引けた) は保存形に依存した後方互換の副産物で、clause 5.5.7 とは整合しない。**書き込みと同じ `@context` を渡せば従来どおり短縮名で引ける。**
    
  * **移行 (必須)**: flip 前に書かれたエンティティは `attrNameForm` フラグを持たず **legacy 意味論 (verbatim 保存 + 作成時 `contextRef` で復元)** のまま読まれる。挙動は今日と同じなので放置しても壊れないが、`geoproperty` / `orderBy` は単一名しか取れず canonical 側の名前で照合されないため、`@context` がマップする属性名でこれらを使う場合は移行が要る (`q` は候補 union で緩和済み)。一括移行: `npm run migrate:attr-names`(dry-run) → `-- --apply`。**暗号化テナントの既存 doc はスキップされる** (属性名が envelope 内の「値」として入っており KMS 復号+再暗号化が要るため。スキップされた doc は legacy のままで安全)。
    
  * **doc 単位で意味論を固定する**: 移行前の bare `temperature` と移行後の canonical-bare `temperature` は**同じ文字列なのに意味が違う**ため、per-key では判別できない。`EntityDocument.attrNameForm === 'canonical'` の有無で doc ごとに決める。legacy doc への部分書き込みは verbatim のまま行い、**同一 doc 内に legacy キーと canonical キーを混在させない** (全置換 = `PUT` / batch replace は置換後に legacy キーが残らないので移行を兼ねる)。
    
    * **federation の registration 照合は別で、cross-`@context` に対応済み**。`csourceRegistrations` の `propertyNames` / `relationshipNames` は「verbatim ∪ canonical」の union インデックスで保持される (#1890) ため、ctx-B の `warmth` で登録した registration に ctx-A の `temperature` (同一 URI) で照会しても転送される。回帰ガード: `tests/e2e/features/ngsi-ld/attr-uri-expansion.feature` の `@issue-1613-federation-fqn-drop`。
      
  * `q` / `geoproperty` / `orderBy` は**仕様上そもそも短縮名限定**のため対象外 — clause 4.9: "The attribute path is always a composition of short hand names and not a fully qualified ones, because, when the query language is used, an `@context` properly defining all the terms (as per clause 5.5.7) shall be issued."
    
* 構文検証は型・属性名とも「短縮名 **または** 絶対 IRI」(型は POSIX portable 短縮名、属性名は `[A-Za-z0-9_]` 短縮名。**属性名の絶対 IRI 受理は NGSI-LD 経路のみ**、#1649。NGSIv2 は短縮名のみ)。`@context` の解決は展開に必要なときのみ行い、Smart Data Models 存在確認は行わない。
  
* **属性名の文字種は「短縮名 (`^[A-Za-z0-9_]+$`) ∥ 絶対 IRI」** (#1649、NGSI-LD 経路のみ。NGSIv2 は短縮名のみ)。POSIX portable (`.` `-` を含む) を短縮名として許さない理由は元のまま: 属性名は MongoDB の field key (`attributes.${name}`) に直接埋め込まれるため `.` が dot-path 記法と衝突し (`attributes.sensor.id` が `attributes.sensor` の `id` サブフィールドと解釈される)、`q` パーサが属性名を `([\w.]+)` で切り出すため `-` は silent な footgun になる (保存はできるが `q` で絞れない)。絶対 IRI を許せるようになったのは、canonical 保存 (clause 5.5.7) で保存キーが FQN になる #1649 に合わせて **percent エスケープ層** (`src/core/entities/attr-key-escape.ts`、`%` `.` `$` `\0` の 4 文字のみ) を dot-path 構築の唯一の入口に据えたため。`q` は clause 4.9 が **shorthand 限定**と定めるので、パーサの `[\w.]` 制約はそのままでよい (FQN を `q` に書くことは仕様上ない)。
  
* **metadata 名の文字種は protocol で分岐する** (#1946 / #1788 サブ項目 4)。**NGSIv2 の `metadata` キーは短縮名 (`^[A-Za-z0-9_]+$`) のみ**、**NGSI-LD のサブ属性名は短縮名 ∥ 絶対 IRI**。metadata は `attributes.<attr>.metadata.<meta>` として保存され、NGSIv2 の `mq` はこれを dot-path で引く。#1946 以前は文字種検証がまったく無く、(1) `mq` の文法 (`attrName.metaName{op}value`、Orion 互換で `\w` のみ) では書けないうえ意図しないネストパスになるため**保存できるのに二度と引けない**、(2) 作成 (`insertOne`) は通るが更新の `$set` は通らない (`cannot use dotted field name '...' in a sub object`) ため**作れるのに直せない**、という 2 つの silent な壊れ方を作れた。NGSI-LD 側を絶対 IRI まで緩めたのは、clause 5.5.7 の term ⇄ URI 等価変換が**サブ属性名にも掛かる** (短縮名で送っても FQN が保存形になる) ため — 受理しないと自分が書いた保存形を書き戻せない。#1946 が緩和の前提としていた「percent エスケープ層 (`attr-key-escape.ts`) が top-level 属性キー限定」は解消済みで、`escapeAttrsObject` / `unescapeAttrsObject` が `metadata` キーまで再帰的に escape する。NGSIv2 は `@context` が無く FQN 保存も起きないため短縮名のまま (protocol 分離)。**絶対 IRI でない**ドット入りの名前 (`unit.code`) はどちらの protocol でも 400。
  
* エラーレスポンスには問題のある値と許可された文字セットが含まれます。例: `Entity type contains invalid characters (allowed: A-Z a-z 0-9 . _ - (must not start with -)); got "Sensor@Type"`。

**例:**

| Field                    | Input                                                   | Status                                                                       |
| ------------------------ | ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| type                     | `Room`                                                  | ✅ accepted (both protocols)                                                  |
| type                     | `Blesensor.per3600`                                     | ✅ accepted (`.` allowed, both protocols)                                     |
| type                     | `Sensor-Type`                                           | ✅ accepted (`-` allowed, both protocols)                                     |
| type                     | `Sensor@Type`                                           | ❌ 400 (invalid character)                                                    |
| type                     | `Sensor Type`                                           | ❌ 400 (whitespace)                                                           |
| type                     | `-LeadingHyphen`                                        | ❌ 400 (leading `-`)                                                          |
| type                     | `urn:ngsi-ld:Sensor`                                    | NGSI-LD: ✅ / NGSIv2: ❌ 400 (#1211)                                           |
| type                     | `https://uri.fiware.org/ns/data-models#WeatherObserved` | NGSI-LD: ✅ / NGSIv2: ❌ 400 (#1211)                                           |
| type                     | `http://example.com/types/Temperature`                  | NGSI-LD: ✅ / NGSIv2: ❌ 400 (#1211)                                           |
| type                     | `1http://example.com/X`                                 | ❌ 400 (scheme must start with ALPHA)                                         |
| type                     | `https:`                                                | ❌ 400 (opaque part is empty)                                                 |
| attribute                | `waterLevel` / `water_level`                            | ✅ accepted                                                                   |
| attribute                | `water-level`                                           | ❌ 400 (`-` not allowed; q-parser limitation)                                 |
| attribute                | `sensor.id`                                             | ❌ 400 (`.` not allowed; MongoDB dot-path conflict)                           |
| attribute                | `attr name`                                             | ❌ 400 (whitespace)                                                           |
| attribute                | `https://uri.fiware.org/ns/dm#temperature`              | NGSI-LD: ✅ / NGSIv2: ❌ 400 (#1649)                                           |
| metadata / sub-attribute | `accuracy` / `unit_code`                                | ✅ accepted (both protocols)                                                  |
| metadata / sub-attribute | `unit.code`                                             | ❌ 400 (`.` not allowed; MongoDB dot-path conflict, #1946)                    |
| metadata / sub-attribute | `unit-code`                                             | ❌ 400 (`-` not allowed; mq-parser limitation, #1946)                         |
| metadata / sub-attribute | `$where`                                                | ❌ 400 (`$` not allowed; MongoDB operator, #1946)                             |
| metadata / sub-attribute | `https://example.org/ns#accuracy`                       | ❌ 400 (**both protocols**; escape layer does not cover metadata keys, #1946) |
| id                       | `urn:ngsi-ld:Room:1`                                    | ✅ accepted (`:` allowed for id)                                              |
| id                       | `-foo`                                                  | ❌ 400 (leading `-`; **わずかな厳格化** vs 旧来)                                       |

検証は NGSIv2 `POST/PATCH/PUT /v2/entities` および NGSI-LD `POST/PATCH/PUT /ngsi-ld/v1/entities`、時系列エンドポイント、およびバッチ操作に適用されます。不適合フィールドを持つ既存の保存済みエンティティ(#1209 以前のデータ)は引き続き読み取り可能です。新しい書き込みリクエストのみが拒否されます。

厳格な NGSI-LD 仕様準拠を目指すクライアントは、実装間の移植性のために `type` を `[A-Za-z0-9_]` の範囲内に保つことができます。

### 2. Geo-Queries

| Geo-query Operator | NGSIv2 | NGSI-LD | Description                                |
| ------------------ | ------ | ------- | ------------------------------------------ |
| `near`             | ✅      | ✅       | Near a specified point                     |
| `coveredBy`        | ✅      | ✅       | Completely contained within a region       |
| `within`           | ✅      | ✅       | Intersects or is contained within a region |
| `intersects`       | ✅      | ✅       | Intersects a region                        |
| `disjoint`         | ✅      | ✅       | Does not intersect a region                |

**例:**

```bash
# NGSIv2: Entities within 1km of Tokyo Station
curl 'http://localhost:3000/v2/entities?georel=near;maxDistance:1000&geometry=point&coords=35.6812,139.7671'

# NGSI-LD: Entities within 1km of Tokyo Station
curl 'http://localhost:3000/ngsi-ld/v1/entities?georel=near;maxDistance==1000&geometry=Point&coordinates=%5B139.7671,35.6812%5D'
```

### 3. Pagination

| Header          | NGSIv2               | NGSI-LD                | Description                   |
| --------------- | -------------------- | ---------------------- | ----------------------------- |
| **Total count** | `Fiware-Total-Count` | `NGSILD-Results-Count` | Total number of query results |
| **Next Link**   | `Link` (rel="next")  | `Link` (rel="next")    | Link to the next page         |

詳細については、DEVELOPMENT.md の「API Specification」セクションを参照してください。

### 4. Subscriptions

| Notification Method | NGSIv2 | NGSI-LD | Description                                |
| ------------------- | ------ | ------- | ------------------------------------------ |
| **HTTP Webhook**    | ✅      | ✅       | POST to a REST endpoint                    |
| **MQTT**            | ✅      | ✅       | Publish to an MQTT broker (QoS 0/1/2, TLS) |
| **WebSocket**       | ✅      | ✅       | Real-time event stream                     |

### 5. Federation (Context Source Registration)

| Feature              | NGSIv2              | NGSI-LD                            | Description                                                                                                                                                                                                                                                              |
| -------------------- | ------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Registration API** | `/v2/registrations` | `/ngsi-ld/v1/csourceRegistrations` | Remote provider registration                                                                                                                                                                                                                                             |
| **Parallel queries** | ✅                   | ✅                                  | Simultaneous queries to multiple providers                                                                                                                                                                                                                               |
| **Result merging**   | ✅                   | ✅                                  | Merge of local and remote results                                                                                                                                                                                                                                        |
| **Loop detection**   | ✅                   | ✅                                  | `Via` header loop detection (RFC 7230 / ETSI 6.3.17-6.3.18, #1664): forwarded requests append `1.1 <BROKER_ID>`; incoming `Via` containing own pseudonym skips forwarding (inclusive → local + `NGSILD-Warning` 199) or returns `508 Loop Detected` (exclusive/redirect) |

***

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

> **注意:** プロトコル分離のため、NGSI-LD エンティティ(Relationship 属性を持つものを含む)は NGSIv2 API 経由ではアクセスできません。

### 2. LanguageProperty (Multilingual Property)

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

> **注意:** プロトコル分離のため、NGSI-LD エンティティ(LanguageProperty 属性を持つものを含む)は NGSIv2 API 経由ではアクセスできません。

### 3. Scope (Scope Hierarchy)

エンティティの論理的な階層を表します。

**NGSI-LD:**

```json
{
  "id": "urn:ngsi-ld:Sensor:S123",
  "type": "Sensor",
  "scope": ["/Japan/Tokyo/Shibuya", "/IoT/Temperature"]
}
```

**Scope クエリ:**

```bash
# All entities under /Japan/Tokyo
curl 'http://localhost:3000/ngsi-ld/v1/entities?scopeQ=/Japan/Tokyo'
```

**NGSIv2 互換性:**


* NGSIv2 は階層的なエンティティ管理に `Fiware-ServicePath` ヘッダーを使用します
  
* `servicePath` は `?attrs=servicePath` 経由で組み込み属性として利用可能です
  
* **servicePath と scope は独立した概念です (#964):** これらは自動的に同期されません
  
  * NGSIv2 `Fiware-ServicePath` → DB に `servicePath` として保存されます(インフラストラクチャレベルの分離)
    
  * NGSI-LD `scope` → DB に `scope` として保存されます(ユーザー定義の論理階層)
    
  * NGSI-LD は ETSI GS CIM 009 仕様に従い `Fiware-ServicePath` ヘッダーを無視します

### 4. Attribute Projection (pick / omit Parameters)

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

**注意:**


* `pick` と `omit` は同時に使用できません
  
* `pick` を使用する場合:`@context`、`id`、`type`、および指定された属性のみが含まれます。`createdAt` と `modifiedAt` は含まれません。
  
* `omit` を使用する場合:指定されたもの以外のすべての属性が含まれます。`id` と `type` は除外できません (ETSI GS CIM 009 V1.9.1 仕様に準拠)

**NGSIv2 互換性:**


* NGSIv2 API では、`attrs` パラメータが同等の機能を提供します (pick のみ)
  
* `omit` に相当する NGSIv2 の機能はありません

```bash
# Retrieve only temperature and humidity with NGSIv2 (equivalent to pick)
curl 'http://localhost:3000/v2/entities/urn:ngsi-ld:Room:001?attrs=temperature,humidity'
```

### 5. @context (JSON-LD Context)

NGSI-LD では、エンティティに `@context` を含めることで語彙を定義します。

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


* NGSIv2 には `@context` の概念がありません
  
* GeonicDB は Smart Data Models の `@context` の自動補完をサポートしていますが、`@context` は NGSIv2 API では返されません

***

## エンティティ ID の考慮事項

### エンティティ ID の一意性 (GeonicDB 拡張)

> **GeonicDB 拡張**: GeonicDB では、エンティティ ID はテナント (`Fiware-Service`) とServicePath (`Fiware-ServicePath`) のスコープ内で一意です。エンティティ `type` は一意性制約の一部では**ありません**。

これは両方の API にわたって ID のセマンティクスを統一する意図的な設計決定です:


* **NGSI-LD** はエンティティ ID を URI として扱い、本質的に一意です
  
* **NGSIv2** (標準) は同じ ID で異なる type を持つエンティティの共存を許可しますが、GeonicDB はこの動作を**サポートしていません**

**影響:**

* **直接作成** (`POST /v2/entities`, `POST /ngsi-ld/v1/entities`): 既存のエンティティと同じ ID を持つエンティティを作成すると (異なる `type` であっても)、`409 AlreadyExists` が返されます
  
* **バッチ更新** (`POST /v2/op/update` with `append`/`appendStrict`): `entityId` のみでエンティティをマッチングします。属性は更新されますが、元の `type` は保持されます
  
* **バッチアップサート** (`POST /ngsi-ld/v1/entityOperations/upsert`): `entityId` のみでエンティティをマッチングします。属性は更新されます (type の処理はアップサートのセマンティクスに従います)
  
* **バッチ作成** (`POST /ngsi-ld/v1/entityOperations/create`): 重複した ID に対してエンティティごとのエラー詳細を含む `207` を返します
  
* 同じ ID を持つエンティティ間の type による曖昧性解消のための NGSIv2 `?type=` パラメータは、もはや適用できません

この統一により、NGSIv2 の type ベースの曖昧性解消が NGSI-LD の一意 ID モデルと競合する相互運用性の問題のクラスが排除されます。

### NGSI-LD URI 要件

NGSI-LD 仕様では、エンティティ ID を URI 形式にすることを推奨しています。

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

**NGSIv2 互換性:**


* NGSIv2 は任意の文字列を ID として使用できます (例: `Room1`, `sensor-abc`)
  
* 一貫性と将来の移行のために、どの API を使用する場合でも URN 形式を使用することを推奨します

**ベストプラクティス:**


* NGSIv2 API を使用する場合でも、すべてのエンティティに URN 形式を使用してください
  
* NGSIv2 から NGSI-LD に移行する場合、エンティティは NGSI-LD API を介して再作成する必要があります (プロトコルの分離により、API 間のアクセスが防止されます)

***

## フェデレーション

GeonicDB のフェデレーション機能は、リモートコンテキストプロバイダーのプロトコルを自動的に検出します。

### 自動プロトコル検出

登録されたリモートプロバイダーに対して、GeonicDB は次の順序でプロトコルを検出します:


1. **明示的な指定** - 登録時に `information.format` が指定されている場合、そのプロトコルが使用されます
   
2. **自動検出** - URL パスからの自動検出:
   
   * `/v2/` を含む → NGSIv2
     
   * `/ngsi-ld/` を含む → NGSI-LD
     
   * それ以外 → NGSIv2 (デフォルト)

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

**NGSIv2 でクエリを実行すると、自動的に NGSI-LD プロバイダーに転送されます:**

```bash
curl http://localhost:3000/v2/entities/urn:ngsi-ld:Vehicle:V999 \
  -H "Fiware-Service: demo"
```

**動作:**


1. GeonicDB は `urn:ngsi-ld:Vehicle:V999` がローカルに存在しないことを検出します
   
2. 登録情報から `http://remote-provider.example.com/ngsi-ld/v1` を特定します
   
3. NGSI-LD プロトコルを使用してクエリを転送します: `GET /ngsi-ld/v1/entities/urn:ngsi-ld:Vehicle:V999`
   
4. NGSI-LD → 内部フォーマット → NGSIv2 のレスポンスを変換し、クライアントに返します

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

**NGSI-LD でクエリを実行すると、自動的に NGSIv2 プロバイダーに転送されます:**

```bash
curl http://localhost:3000/ngsi-ld/v1/entities/urn:ngsi-ld:Sensor:S888 \
  -H "Fiware-Service: demo"
```

**動作:**


1. GeonicDB は `urn:ngsi-ld:Sensor:S888` がローカルに存在しないことを検出します
   
2. 登録情報から `http://legacy-system.example.com/v2` を特定します
   
3. NGSIv2 プロトコルを使用してクエリを転送します: `GET /v2/entities/urn:ngsi-ld:Sensor:S888`
   
4. NGSIv2 → 内部フォーマット → NGSI-LD のレスポンスを変換し、クライアントに返します

***

## ユースケースとベストプラクティス

### どの API を使用すべきか?

#### NGSIv2 を選択すべき場合


* **既存の FIWARE Orion 互換システム** - レガシーシステムとの統合
  
* **シンプルな IoT データ管理** - センサーデータの収集と可視化
  
* **学習曲線が低い** - NGSI-LD よりもシンプルな仕様
  
* **豊富な既存ドキュメントとツール** - 成熟した NGSIv2 エコシステム

**推奨されるユースケース:**


* IoT センサーネットワーク
  
* 基本的なスマートシティデータ収集
  
* プロトタイピングと PoC

#### NGSI-LD を選択すべき場合


* **セマンティック Web / Linked Data** - JSON-LD と RDF の活用
  
* **複雑なエンティティ関係** - Relationship と LanguageProperty の使用
  
* **国際標準への準拠** - ETSI 標準に準拠したシステム
  
* **将来の拡張性** - NGSI-LD 仕様は継続的に拡張されています

**推奨されるユースケース:**


* Smart Data Models を活用したデータカタログ
  
* 多言語サポートが必要なシステム
  
* エンティティ間の複雑な関係を表現する必要があるシステム
  
* データ統合とオープンデータの公開

#### 両方の API の同時実行

GeonicDB は両方の API を同時にサポートしますが、エンティティはプロトコルごとに分離されています。各 API は独自のエンティティセットで独立して動作します。

**推奨されるアプローチ:**


1. **ユースケースごとに 1 つの API を選択** - 同じデータに対してプロトコルを混在させないでください。要件に基づいて NGSIv2 または NGSI-LD を選択し、それに従ってください
   
2. **プロトコル間の連携には Federation を使用** - NGSIv2 クライアントが NGSI-LD エンティティにアクセスする必要がある場合(またはその逆)、Federation 経由でコンテキストソースを登録してください
   
3. **マイグレーションには再作成が必要** - エンティティを NGSIv2 から NGSI-LD に移行するには、NGSIv2 API からエクスポートし、NGSI-LD API 経由で再作成してください。プロトコル間の自動マイグレーションはありません

### ベストプラクティス

#### 1. エンティティ ID に URN 形式を使用する

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

理由: Geo クエリは GeoJSON 形式のみをサポートします。

#### 3. Smart Data Models を活用する

Smart Data Models のタイプを使用し、モデルの `@context` を明示的に渡します。

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

理由: 標準的なモデルタイプは、Context Broker間でエンティティの相互運用性を維持します。なお、GeonicDB はエンティティの `type` から `@context` を推測**しない**点に注意してください(#1733)。書き込みと読み取りの両方で、モデルの `@context` を提供してください(JSON-LD `Link` ヘッダー、または `application/ld+json` 書き込みの場合は本文で)。これがない場合、レスポンスは NGSI-LD コアの `@context` のみを使用し、マッピングされていない用語を完全修飾 URI としてレンダリングします(ETSI GS CIM 009 clause 5.5.5 / 5.5.7 による)。

#### 4. 目的に応じてサブスクリプションを選択する

| Purpose                      | Recommended Channel | Reason                           |
| ---------------------------- | ------------------- | -------------------------------- |
| Web apps (real-time updates) | WebSocket           | Low latency, no server required  |
| Server-to-server integration | HTTP Webhook        | Reliability, retry functionality |
| IoT devices                  | MQTT                | Lightweight, QoS guarantees      |

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

理由: 開発環境と本番環境の分離、および顧客ごとのデータの分離が可能になります。

***

## 概要

| Item                      | NGSIv2                        | NGSI-LD                                 | GeonicDB Behavior                                                                        |
| ------------------------- | ----------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Protocol**              | REST/JSON                     | REST/JSON-LD                            | Both supported; entities isolated by `protocol` field                                    |
| **Entity isolation**      | `protocol: 'ngsiv2'`          | `protocol: 'ngsild'`                    | Each API only sees its own entities                                                      |
| **Entity ID**             | Any string                    | URI (URN recommended)                   | URN recommended. **ID is unique per tenant + servicePath** (type disambiguation removed) |
| **Attribute types**       | Simple (Number, Text, etc.)   | Semantic (Property, Relationship, etc.) | Type mapping rules define the correspondence (see table above)                           |
| **System attributes**     | `dateCreated`, `dateModified` | `createdAt`, `modifiedAt`               | Unified internally, converted per API                                                    |
| **Geo-queries**           | ✅                             | ✅                                       | Shared feature                                                                           |
| **Subscriptions**         | ✅ (HTTP, MQTT, WebSocket)     | ✅ (HTTP, MQTT, WebSocket)               | Shared feature                                                                           |
| **Federation**            | ✅                             | ✅                                       | Automatic protocol detection; enables cross-protocol access                              |
| **Cross-protocol access** | Not supported directly        | Not supported directly                  | Use Federation for cross-protocol needs                                                  |
| **Use cases**             | IoT, legacy systems           | Semantic Web, open data                 | Choose one API per use case                                                              |

GeonicDB は NGSIv2 と NGSI-LD API の両方を提供し、厳格なプロトコル分離を実現しています。ユースケースに最適な API を選択し、プロトコル間アクセスが必要な場合は Federation を活用してください。

***

## 関連ドキュメント


* [API Common Specification](../api-reference/endpoints.md)
  
* [NGSIv2 API](../api-reference/ngsiv2.md)
  
* [NGSI-LD API](../api-reference/ngsild.md)
  
* [Smart Data Models](../features/smart-data-models.md)
