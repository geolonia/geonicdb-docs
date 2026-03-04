---
title: "Smart Data Models"
description: "FIWARE Smart Data Models support"
outline: deep
---
# Smart Data Models サポート

GeonicDB は [Smart Data Models](https://smartdatamodels.org/) イニシアチブのデータモデルをサポートしています。Smart Data Models は、FIWARE エコシステムやスマートシティ分野で広く利用されている標準化されたデータモデルのカタログです。

## 概要

Smart Data Models サポートには、以下の 2 つの機能が含まれます:

1. **MCP ツール**: カタログを閲覧し、利用可能なデータモデルを検索
2. **@context 自動補完**: 既知の Smart Data Model エンティティタイプに対して、適切な JSON-LD @context を自動的に追加

## サポートされるドメイン

GeonicDB は、以下のドメインから主要な Smart Data Models をサポートしています:

| ドメイン | 含まれるモデル例 |
|--------|------------------------|
| **Parking** | OffStreetParking, OnStreetParking, ParkingSpot |
| **Weather** | WeatherObserved, WeatherForecast |
| **Transportation** | Vehicle, TrafficFlowObserved, BikeHireDockingStation |
| **Environment** | AirQualityObserved, NoiseLevelObserved, WaterQualityObserved |
| **Building** | Building, BuildingOperation |
| **Device** | Device, DeviceModel |
| **WasteManagement** | WasteContainer, WasteContainerIsle |
| **Energy** | EnergyMonitor, ThreePhaseAcMeasurement |

各モデルには以下の情報が含まれます:
- エンティティタイプ名
- ドメイン
- JSON-LD @context URL
- 説明
- スキーマ URL
- サンプルプロパティ

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
- `domain` (オプション): ドメインでフィルタリング (例: "Parking")
- `search` (オプション): タイプまたは説明で検索 (例: "weather")
- `limit` (オプション): 最大結果数 (デフォルト: 100)
- `offset` (オプション): ページネーションのオフセット (デフォルト: 0)

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
- `type` (必須): エンティティタイプ名 (例: "OffStreetParking")

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







































**注意**: `propertyDetails` フィールドは、主要なモデル (WeatherObserved, AirQualityObserved, OffStreetParking, OnStreetParking, TrafficFlowObserved, Vehicle, Device, Building, WasteContainer, EnergyMonitor) で利用可能です。各プロパティには以下の情報が含まれます:
- `ngsiType`: NGSI-LD プロパティタイプ (Property, GeoProperty, Relationship, LanguageProperty)
- `valueType`: 値の型 (number, string, GeoJSON 構造, Object など)
- `example`: 実際の例として使用できるサンプル値
- `required`: そのフィールドが必須かどうか (オプション)

## @context 自動補完

NGSI-LD API を介してエンティティを取得する際、GeonicDB は既知の Smart Data Model タイプに対して、適切な @context を自動的に追加します。

### 動作原理

エンティティを取得する際の @context 解決の優先順位:

1. **明示的な @context** (Link ヘッダーまたはパラメータで指定) - 常に優先されます
2. **Smart Data Models @context** (エンティティタイプが既知の SDM の場合) - 自動補完されます
3. **デフォルトの NGSI-LD コア @context** - フォールバック

### 例: Smart Data Model エンティティの作成と取得

**エンティティを作成**:
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
























**エンティティを取得**:
```bash
GET /ngsi-ld/v1/entities/urn:ngsi-ld:OffStreetParking:downtown
```



**レスポンス** (@context が自動的に追加されます):
```json
{
  "@context": [
    "https://raw.githubusercontent.com/smart-data-models/dataModel.Parking/master/context.jsonld",
    "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld"
  ],
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

- **@context はストレージに保存されません**: @context は API レスポンス時に動的に生成されるメタデータです
- **明示的な @context が優先されます**: Link ヘッダーで @context が指定されている場合は、SDM 自動補完よりも優先されます
- **未知のタイプはデフォルトの @context を使用します**: カスタムエンティティタイプの場合、NGSI-LD コア @context のみが返されます

### 異なるドメインの例

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














## メリット

### FIWARE エコシステムとの相互運用性

Smart Data Models の @context を使用することで、以下が可能になります:

- **標準化されたプロパティ名**: 他の FIWARE システムとの互換性
- **セマンティックな相互運用性**: JSON-LD を使用した意味のあるデータ交換
- **エコシステム統合**: FIWARE Marketplace や他の FIWARE コンポーネントとの統合

### AI アシスタントの体験向上

MCP ツールを通じて、AI アシスタント (Claude など) は以下が可能になります:

- **データモデルの検索**: ドメインやキーワードで利用可能なデータモデルスキーマを検索
- **プロパティ情報の取得**: `propertyDetails` から各プロパティの詳細情報を取得
  - NGSI-LD プロパティタイプ (Property, GeoProperty, Relationship) の識別
  - 値の型 (number, string, GeoJSON 構造など) の理解
  - サンプル値を実際の例として使用
  - 必須フィールドの識別
- **正確なエンティティの作成**: 取得した情報に基づいて、正しく構造化された NGSI-LD エンティティを生成
- **ドメイン固有のベストプラクティス**: Smart Data Models 標準に従った実装

**推奨ワークフロー**:
1. `list_models` でモデルを検索
2. `get_model` で選択したモデルの `propertyDetails` を取得
3. `propertyDetails` 情報に基づいて、正しい NGSI-LD 構造でエンティティを作成

## 参考資料

- [Smart Data Models 公式サイト](https://smartdatamodels.org/)
- [Smart Data Models GitHub](https://github.com/smart-data-models)
- [FIWARE Data Models](https://fiware-datamodels.readthedocs.io/)
- [NGSI-LD 仕様](https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/)

## 関連ドキュメント

- [MCP.md](../ai-integration/mcp-server.md) - Model Context Protocol サーバー
- [AI_INTEGRATION.md](../ai-integration/overview.md) - AI ツール統合
- [API_NGSILD.md](../api-reference/ngsild.md) - NGSI-LD API リファレンス