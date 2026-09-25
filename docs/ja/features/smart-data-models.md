---
title: "Smart Data Models"
description: "FIWARE Smart Data Models support"
outline: deep
---
# Smart Data Models サポート

GeonicDB は [Smart Data Models](https://smartdatamodels.org/) イニシアチブのデータモデルをサポートしています。Smart Data Models は、FIWARE エコシステムおよびスマートシティドメインで広く使用されている標準化されたデータモデルのカタログです。

## 概要

Smart Data Models サポートには、以下の 2 つの機能が含まれます:


1. **A2A `config` スキル**: カタログを閲覧し、利用可能なデータモデルを検索します
   (`/a2a` に `resource: "data_models"` を送信)。これは MCP ツールでは**ない**ため、MCP / Tool Use `config` ツールを通じてアクセスすることは**できません**。`config` ツールの `custom_data_models` リソースは、代わりにあなた自身のモデルを管理します (#2209)。
   
2. **モデルカタログ**: エンティティタイプ → JSON-LD @context URL マッピング、クライアントが参照するため

> **#1733 で変更**: GeonicDB は、エンティティ `type` に基づいてレスポンスに Smart Data Models @context を挿入しなくなりました。以下の [Response @context](#response-context) を参照してください。

## サポートされるドメイン

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

## A2A `config` スキル、`

resource: "data_models"`

Smart Data Models カタログは、**A2A** `config` スキル (`POST /a2a`) を通じて閲覧可能です。以下のアクションのいずれかと共に `resource: "data_models"` を送信します。

> **MCP ツールではありません (#2209)**。MCP サーバーは正確に 5 つのツール — `entities`、`batch`、`temporal`、`config`、`admin` (`src/api/mcp/tools/index.ts`) — を登録し、その `config` ツールは `rules` / `jsonld_contexts` / `custom_data_models` のみを受け付けます。トップレベルの `data_models` MCP ツールは存在せず、MCP `config` ツールに `resource: "data_models"` を送信すると、その `z.enum` によって拒否されます。

> **A2A `config` スキルは正確に `rules` / `jsonld_contexts` / `data_models` を受け付けます (#2228)**。MCP の `custom_data_models` を含む他の値は、サポートされているセットを明記したエラーで拒否されます。**これは明示的に指定された `resource` にのみ適用されます**。`resource` が省略された場合、スキルはフリーテキストメッセージに対するキーワード検出にフォールバックし、同じ 3 つの値のいずれかを選択します(何も一致しない場合は `rules`)。そのため、フリーテキストリクエストが拒否パスに到達することはありません — このフォールバックは意図的であり、変更されていません。#2228 以前は、不明な `resource` は黙って `rules` にフォールスルーしていたため、A2A 経由でカスタムデータモデルを要求するクライアントは、**代わりにリアクティブルールを操作していました**。受け付けられるセットは、Agent Card (`/.well-known/agent-card.json`) にも機械可読な形式で、`config` スキルの ``Accepted `resource` values: ...`` として宣言されています。

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

利用可能なデータモデルのリストを取得します。ドメインまたは検索語句でフィルタリングできます。

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

指定されたエンティティタイプのデータモデルの詳細を取得します。

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

**注意**: `propertyDetails` フィールドは主要なモデル (WeatherObserved、AirQualityObserved、OffStreetParking、OnStreetParking、TrafficFlowObserved、Vehicle、Device、Building、WasteContainer、EnergyMonitor) で利用可能です。各プロパティには以下の情報が含まれます:

* `ngsiType`: NGSI-LD プロパティタイプ (Property、GeoProperty、Relationship、LanguageProperty)
  
* `valueType`: 値の型 (number、string、GeoJSON 構造、Object など)
  
* `example`: 実際の例として使用するサンプル値
  
* `required`: フィールドが必須かどうか (オプション)
  
* `@context`: JSON-LD ボキャブラリー URI (オプション、HTTP(S) URL のみ)。カスタムデータモデルの場合は、Linked Data の相互運用性を向上させるために、よく知られたボキャブラリー (例: `https://schema.org/email`) を指定してください。`@context` を持たないプロパティは、このContext Broker自身のベース URL 上に自動生成された URL を取得します (`{brokerBaseUrl}/vocab/{tenantId}/{propertyName}`、#1984) — `GET /vocab/{tenantId}/{term}` 経由で `rdf:Property` として参照可能です (#3191)。`rdfs:domain` は、正確に 1 つのモデルが属性を宣言している場合にのみ追加されます。`rdfs:range` は、`ngsiType`/`valueType` がデータ型に解決される場合にのみ追加されます (`Relationship` と未解決の値型は省略されます)。複数の宣言モデルは両方とも省略します。[API.md → Term kind](../api-reference/endpoints.md#term-kind-type) を参照してください。

## レスポンス @context

**GeonicDB はエンティティタイプから @context を推測しません。** レスポンスのレンダリングに使用される @context は、リクエストが提供したものだけです。リクエストが何も提供しなかった場合は、NGSI-LD コア @context のみが使用されます。

これは ETSI GS CIM 009 に従っています (<https://cim.etsi.org/NGSI-LD/official/clause-5.html> を参照):


* clause 5.5.5 — 「API クライアントから提供された入力に @context が含まれていない場合、実装は最低限、そのような入力にコア @context を割り当てる必要があります。」
  
* clause 5.5.7 — 「用語の圧縮または展開を実行するために使用される @context は、各 API 呼び出しによって提供されたもの (またはその不在時のデフォルト @context) であり、**以前に提供された可能性のある他の @context ではありません**」および「圧縮時に、現在の @context で一致する用語が見つからない場合、実装は完全修飾名をレンダリングする必要があります。」

### 仕組み

エンティティ取得時の @context 解決:


1. **明示的な @context** (読み取り時の JSON-LD `Link` ヘッダー) - そのまま使用されます
   
2. **それ以外の場合は、NGSI-LD コア @context のみ**

作成時に提供された @context はエンティティと共に永続化されますが (#1620 / #1633)、これは保存された属性の完全修飾名を復元するためだけに使用され、レスポンスのボキャブラリーを決定するために使用されることはありません。その結果、ドメインコンテキストの下で書き込まれたエンティティを、そのコンテキストを提供せずに読み取ると、コア @context が圧縮できない用語については完全修飾 URI が返されます:

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

**移行に関する注意**: Context Brokerが Smart Data Models @context を推測することに依存していたクライアントは、今後はモデルの @context URL を自分で渡す必要があります (`Link` ヘッダー経由、または `application/ld+json` 書き込みの場合は本文経由)。上記のカタログテーブルと A2A `config` スキルが、渡すべき URL を提供します。

### 例：Smart Data Model エンティティの作成と取得

**エンティティの作成**：

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

**エンティティの取得**（レスポンスがその語彙を使用するように Smart Data Models の @context を指定）：

```bash
GET /ngsi-ld/v1/entities/urn:ngsi-ld:OffStreetParking:downtown
Link: <https://raw.githubusercontent.com/smart-data-models/dataModel.Parking/master/context.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"
```

**レスポンス**（@context はリクエストが指定したもの）：

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


* **作成時に指定された @context は永続化される**（#1620 / #1633）：URL、URL の配列、またはインライン context オブジェクト — `application/ld+json` の場合はリクエストボディ経由、`application/json` の場合は Link ヘッダー経由で提供される。これは保存された属性の完全修飾名を復元するために使用され、レスポンスの @context を選択するために使用されるわけでは**ない**（#1733）
  
* **読み取りリクエストがレスポンスの語彙を決定する**：読み取りが提供する @context がレスポンスのコンパクト化に使用される。何も提供されない場合は、コア @context のみが使用される
  
* **レスポンスの @context がコンパクト化できない用語は完全修飾 URI としてレンダリングされる**（ETSI 条項 5.5.7）

### さまざまなドメインの例

**Weather ドメイン**:

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

**Transportation ドメイン**:

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

## 利点

### FIWARE エコシステムとの相互運用性

Smart Data Models @context を使用することで、以下が可能になります:


* **標準化されたプロパティ名**: 他の FIWARE システムとの互換性
  
* **セマンティック相互運用性**: JSON-LD を使用した意味のあるデータ交換
  
* **エコシステム統合**: FIWARE Marketplace および他の FIWARE コンポーネントとの統合

### AI アシスタント体験の向上

A2A `config` スキル(カタログ参照)と MCP `entities` ツール(エンティティ書き込み)を通じて、
AI アシスタント(Claude など)は次のことができます:


* **データモデルの検索**: ドメインまたはキーワードで利用可能なデータモデルスキーマを検索
  
* **プロパティ情報の取得**: `propertyDetails` から各プロパティの詳細情報を取得
  
  * NGSI-LD プロパティタイプ(Property、GeoProperty、Relationship)の識別
    
  * 値タイプ(number、string、GeoJSON 構造など)の理解
    
  * 実世界の例としてのサンプル値の使用
    
  * 必須フィールドの識別
    
* **正確なエンティティの作成**: 取得した情報に基づいて正しく構造化された NGSI-LD エンティティを生成
  
* **ドメイン固有のベストプラクティス**: Smart Data Models 標準に従って実装

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
