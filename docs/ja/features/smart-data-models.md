---
title: "Smart Data Models"
description: "FIWARE Smart Data Models support"
outline: deep
---
# Smart Data Models サポート

GeonicDB は [Smart Data Models](https://smartdatamodels.org/) イニシアティブのデータモデルをサポートしています。Smart Data Models は、FIWARE エコシステムおよびスマートシティ分野で広く使用されている標準化されたデータモデルのカタログです。

## 概要

Smart Data Models サポートには、以下の 2 つの機能が含まれます:


1. **MCP ツール**: カタログを閲覧し、利用可能なデータモデルを検索
   
2. **モデルカタログ**: クライアントが参照するための、エンティティタイプ → JSON-LD @context URL マッピング

> **#1733 で変更**: GeonicDB は、エンティティの `type` に基づいて Smart Data Models @context をレスポンスに注入しなくなりました。以下の [レスポンス @context](#response-context) を参照してください。

## サポート対象ドメイン

GeonicDB は、以下のドメインの主要な Smart Data Models をサポートしています:

| Domain              | Example models included                                      |
| ------------------- | ------------------------------------------------------------ |
| **Parking**         | OffStreetParking, OnStreetParking, ParkingSpot               |
| **Weather**         | WeatherObserved, WeatherForecast                             |
| **Transportation**  | Vehicle, TrafficFlowObserved, BikeHireDockingStation         |
| **Environment**     | AirQualityObserved, NoiseLevelObserved, WaterQualityObserved |
| **Building**        | Building, BuildingOperation                                  |
| **Device**          | Device, DeviceModel                                          |
| **WasteManagement** | WasteContainer, WasteContainerIsle                           |
| **Energy**          | EnergyMonitor, ThreePhaseAcMeasurement                       |

各モデルには以下の情報が含まれます:

* エンティティタイプ名
  
* ドメイン
  
* JSON-LD @context URL
  
* 説明
  
* スキーマ URL
  
* サンプルプロパティ

## MCP ツール: `data_models`

Smart Data Models カタログを閲覧するための MCP ツールが利用可能です。

### アクション

#### `list_domains` - ドメインのリストを取得

利用可能なすべてのドメインのリストを取得します。

**パラメータ**: なし

**レスポンス例**:

```json
{
  "domains": [
    "Building",
    "Device",
    "Energy",
    "Environment",
    "Parking",
    "Transportation",
    "WasteManagement",
    "Weather"
  ],
  "total": 8
}
```

#### `list_models` - モデルのリストを取得

利用可能なデータモデルのリストを取得します。ドメインや検索語でフィルタリングできます。

**パラメータ**:

* `domain` (オプション): ドメインでフィルタリング (例: "Parking")
  
* `search` (オプション): タイプまたは説明で検索 (例: "weather")
  
* `limit` (オプション): 最大結果数 (デフォルト: 100)
  
* `offset` (オプション): ページネーションオフセット (デフォルト: 0)

**レスポンス例**:

```json
{
  "models": [
    {
      "type": "OffStreetParking",
      "domain": "Parking",
      "contextUrl": "https://raw.githubusercontent.com/smart-data-models/dataModel.Parking/master/context.jsonld",
      "description": "Off street parking site with explicit entries and exits",
      "schemaUrl": "https://github.com/smart-data-models/dataModel.Parking/blob/master/OffStreetParking/schema.json",
      "exampleProperties": ["name", "location", "totalSpotNumber", "availableSpotNumber", "occupancyDetectionType"]
    }
  ],
  "total": 1
}
```

#### `get_model` - 特定のモデルの詳細を取得

指定されたエンティティタイプのデータモデル詳細を取得します。

**パラメータ**:

* `type` (必須): エンティティタイプ名 (例: "OffStreetParking")

**レスポンス例**:

```json
{
  "type": "OffStreetParking",
  "domain": "Parking",
  "contextUrl": "https://raw.githubusercontent.com/smart-data-models/dataModel.Parking/master/context.jsonld",
  "description": "Off street parking site with explicit entries and exits",
  "schemaUrl": "https://github.com/smart-data-models/dataModel.Parking/blob/master/OffStreetParking/schema.json",
  "exampleProperties": ["name", "location", "totalSpotNumber", "availableSpotNumber", "occupancyDetectionType"],
  "propertyDetails": {
    "name": {
      "ngsiType": "Property",
      "valueType": "string",
      "example": "Central Parking Lot",
      "required": true
    },
    "location": {
      "ngsiType": "GeoProperty",
      "valueType": "GeoJSON Point or Polygon",
      "example": { "type": "Point", "coordinates": [139.6917, 35.6895] },
      "required": true
    },
    "totalSpotNumber": {
      "ngsiType": "Property",
      "valueType": "number",
      "example": 200
    },
    "availableSpotNumber": {
      "ngsiType": "Property",
      "valueType": "number",
      "example": 45
    },
    "occupancyDetectionType": {
      "ngsiType": "Property",
      "valueType": "Array<string>",
      "example": ["balancing", "singleSpaceDetection"]
    }
  }
}
```

**注**: `propertyDetails` フィールドは主要なモデル (WeatherObserved、AirQualityObserved、OffStreetParking、OnStreetParking、TrafficFlowObserved、Vehicle、Device、Building、WasteContainer、EnergyMonitor) で利用可能です。各プロパティには以下の情報が含まれます:

* `ngsiType`: NGSI-LD プロパティタイプ (Property、GeoProperty、Relationship、LanguageProperty)
  
* `valueType`: 値の型 (number、string、GeoJSON 構造、Object など)
  
* `example`: 実際の例として使用するサンプル値
  
* `required`: フィールドが必須かどうか (オプション)
  
* `@context`: JSON-LD 語彙 URI (オプション、HTTP(S) URL のみ)。カスタムデータモデルの場合、Linked Data の相互運用性を向上させるために、よく知られた語彙 (例: `https://schema.org/email`) を指定してください。`@context` を持たないプロパティは、このContext Broker自身のベース URL 上に自動生成された URL を取得します (`{brokerBaseUrl}/vocab/{tenantId}/{propertyName}`、#1984) — `GET /vocab/{tenantId}/{term}` で参照可能です。

## レスポンスの @context

**GeonicDB はエンティティタイプから @context を推測しません。** レスポンスをレンダリングするために使用される @context は、リクエストが提供したものだけです。リクエストが何も提供しなかった場合、NGSI-LD コアの @context のみが使用されます。

これは ETSI GS CIM 009 に従っています (<https://cim.etsi.org/NGSI-LD/official/clause-5.html> を参照):


* clause 5.5.5 — "API クライアントによって提供された入力に @context が含まれていない場合、実装は少なくとも Core @context をそのような入力に割り当てなければならない。"
  
* clause 5.5.7 — "用語の圧縮または展開を実行するために使用される @context は、各 API 呼び出しによって提供されたもの (またはその不在時のデフォルト @context) でなければならず、**以前に提供された可能性のある他の @context であってはならない**" および "圧縮時に、現在の @context で一致する用語が見つからない場合、実装は完全修飾名をレンダリングしなければならない。"

### 動作の仕組み

エンティティを取得する際の @context 解決:


1. **明示的な @context** (読み取り時の JSON-LD `Link` ヘッダー) - そのまま使用されます
   
2. **それ以外の場合、NGSI-LD コアの @context のみ**

作成時に提供された @context はエンティティと共に永続化されますが (#1620 / #1633)、それは保存された属性の完全修飾名を復元するために**のみ**使用され、レスポンスの語彙を決定するために使用されることはありません。その結果、ドメインコンテキストの下で書き込まれたエンティティをそのコンテキストを提供**せずに**読み取ると、コアの @context が圧縮できない用語については完全修飾 URI が返されます:

```bash
# created with a context that maps name → https://example-vocab/ns#name
GET /ngsi-ld/v1/entities/urn:ngsi-ld:Building:v1
→ { "type": "https://example-vocab/ns#Building",
    "https://example-vocab/ns#name": { "type": "Property", "value": "HQ" } }

# supply the same context and the short terms come back
GET /ngsi-ld/v1/entities/urn:ngsi-ld:Building:v1
Link: <https://example.org/building.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"
→ { "type": "Building", "name": { "type": "Property", "value": "HQ" } }
```

**移行に関する注意**: Context Brokerが Smart Data Models の @context を推測することに依存していたクライアントは、今後モデルの @context URL を自分で渡す必要があります (`Link` ヘッダー経由、または `application/ld+json` 書き込みの場合は本文で)。上記のカタログテーブルと MCP ツールは、渡すべき URL を提供します。

### 例: Smart Data Model エンティティの作成と取得

**エンティティの作成**:

```bash
POST /ngsi-ld/v1/entities
Content-Type: application/ld+json

{
  "id": "urn:ngsi-ld:OffStreetParking:downtown",
  "type": "OffStreetParking",
  "name": {
    "type": "Property",
    "value": "Downtown Parking"
  },
  "totalSpotNumber": {
    "type": "Property",
    "value": 200
  },
  "location": {
    "type": "GeoProperty",
    "value": {
      "type": "Point",
      "coordinates": [139.7671, 35.6812]
    }
  }
}
```

**エンティティの取得** (Smart Data Models の @context を指定して、レスポンスがその語彙を使用するようにします):

```bash
GET /ngsi-ld/v1/entities/urn:ngsi-ld:OffStreetParking:downtown
Link: <https://raw.githubusercontent.com/smart-data-models/dataModel.Parking/master/context.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"
```

**レスポンス** (@context はリクエストが指定したものです):

```json
{
  "@context": "https://raw.githubusercontent.com/smart-data-models/dataModel.Parking/master/context.jsonld",
  "id": "urn:ngsi-ld:OffStreetParking:downtown",
  "type": "OffStreetParking",
  "name": {
    "type": "Property",
    "value": "Downtown Parking"
  },
  "totalSpotNumber": {
    "type": "Property",
    "value": 200
  },
  "location": {
    "type": "GeoProperty",
    "value": {
      "type": "Point",
      "coordinates": [139.7671, 35.6812]
    }
  }
}
```

### 重要な注意事項


* **作成時に指定された @context は永続化されます** (#1620 / #1633): URL、URL の配列、またはインライン context オブジェクト — `application/ld+json` の場合はリクエストボディ経由で、`application/json` の場合は Link ヘッダー経由で供給されます。これは保存された属性の完全修飾名を復元するために使用され、レスポンスの @context を選択するためには使用され**ません** (#1733)
  
* **読み取りリクエストがレスポンスの語彙を決定します**: 読み取り時に供給された @context が、レスポンスのコンパクト化に使用されます。何も供給されない場合は、コアの @context のみが使用されます
  
* **レスポンスの @context がコンパクト化できない用語は、完全修飾 URI として表示されます** (ETSI 条項 5.5.7)

### 異なるドメインの例

**天気ドメイン**:

```json
{
  "@context": [
    "https://raw.githubusercontent.com/smart-data-models/dataModel.Weather/master/context.jsonld",
    "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld"
  ],
  "id": "urn:ngsi-ld:WeatherObserved:station01",
  "type": "WeatherObserved",
  "temperature": {
    "type": "Property",
    "value": 25.5
  }
}
```

**交通ドメイン**:

```json
{
  "@context": [
    "https://raw.githubusercontent.com/smart-data-models/dataModel.Transportation/master/context.jsonld",
    "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld"
  ],
  "id": "urn:ngsi-ld:Vehicle:car123",
  "type": "Vehicle",
  "speed": {
    "type": "Property",
    "value": 60
  }
}
```

## メリット

### FIWARE エコシステムとの相互運用性

Smart Data Models @context を使用すると、以下が可能になります:


* **標準化されたプロパティ名**: 他の FIWARE システムとの互換性
  
* **セマンティック相互運用性**: JSON-LD を使用した意味のあるデータ交換
  
* **エコシステム統合**: FIWARE Marketplace および他の FIWARE コンポーネントとの統合

### 改善された AI アシスタント体験

MCP ツールを通じて、AI アシスタント (Claude など) は以下が可能です:


* **データモデルの検索**: ドメインまたはキーワードで利用可能なデータモデルスキーマを検索
  
* **プロパティ情報の取得**: `propertyDetails` から各プロパティの詳細情報を取得
  
  * NGSI-LD プロパティタイプ (Property、GeoProperty、Relationship) の識別
    
  * 値のタイプ (number、string、GeoJSON 構造など) の理解
    
  * 実世界の例としてのサンプル値の使用
    
  * 必須フィールドの識別
    
* **正確なエンティティの作成**: 取得した情報に基づいて正しく構造化された NGSI-LD エンティティを生成
  
* **ドメイン固有のベストプラクティス**: Smart Data Models 標準に従った実装

**推奨されるワークフロー**:

1. `list_models` でモデルを検索
   
2. `get_model` で選択したモデルの `propertyDetails` を取得
   
3. `propertyDetails` 情報に基づいて正しい NGSI-LD 構造でエンティティを作成

## 参考資料


* [Smart Data Models 公式サイト](https://smartdatamodels.org/)
  
* [Smart Data Models GitHub](https://github.com/smart-data-models)
  
* [FIWARE Data Models](https://fiware-datamodels.readthedocs.io/)
  
* [NGSI-LD 仕様](https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/)

## 関連ドキュメント


* [MCP.md](../ai-integration/mcp-server.md) - Model Context Protocol サーバー
  
* [AI\_INTEGRATION.md](../ai-integration/overview.md) - AI ツール統合
  
* [API\_NGSILD.md](../api-reference/ngsild.md) - NGSI-LD API リファレンス
