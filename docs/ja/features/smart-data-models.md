---
title: "Smart Data Models"
description: "FIWARE Smart Data Models 対応"
outline: deep
---
# Smart Data Models サポート

GeonicDB は [Smart Data Models](https://smartdatamodels.org/) イニシアチブのデータモデルをサポートしています。Smart Data Models は、FIWARE エコシステムやスマートシティ分野で広く使われている標準化されたデータモデルのカタログです。

## 概要

Smart Data Models サポートには以下の 2 つの機能があります:

1. **MCP ツール**: カタログをブラウズし、利用可能なデータモデルを検索
2. **@context 自動補完**: 既知の Smart Data Model エンティティタイプに対して、適切な JSON-LD @context を自動的に追加

## サポートされているドメイン

GeonicDB は以下のドメインから主要な Smart Data Models をサポートしています:

| ドメイン | 含まれるモデル例 |
|---------|----------------|
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

Smart Data Models カタログをブラウズするための MCP ツールが利用可能です。

### アクション

#### `list_domains` - ドメイン一覧を取得

すべての利用可能なドメインのリストを取得します。

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

#### `list_models` - モデル一覧を取得

利用可能なデータモデルのリストを取得します。ドメインや検索語でフィルタリング可能です。

**パラメータ**:
- `domain` (optional): ドメインでフィルタリング (例: "Parking")
- `search` (optional): タイプまたは説明で検索 (例: "weather")
- `limit` (optional): 最大結果数 (デフォルト: 100)
- `offset` (optional): ページネーションオフセット (デフォルト: 0)

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

#### `get_model` - 特定のモデル詳細を取得

指定したエンティティタイプのデータモデル詳細を取得します。

**パラメータ**:
- `type` (required): エンティティタイプ名 (例: "OffStreetParking")

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

**注**: `propertyDetails` フィールドは主要なモデル (WeatherObserved, AirQualityObserved, OffStreetParking, OnStreetParking, TrafficFlowObserved, Vehicle, Device, Building, WasteContainer, EnergyMonitor) で利用可能です。各プロパティには以下の情報が含まれます:
- `ngsiType`: NGSI-LD プロパティタイプ (Property, GeoProperty, Relationship, LanguageProperty)
- `valueType`: 値の型 (number, string, GeoJSON 構造, Object など)
- `example`: 実際の使用例となるサンプル値
- `required`: 必須フィールドかどうか (オプショナル)

## @context 自動補完

NGSI-LD API 経由でエンティティを取得する際、GeonicDB は既知の Smart Data Model タイプに対して自動的に適切な @context を補完します。

### 動作原理

エンティティを取得する際の @context 解決優先順位:

1. **明示的な @context** (Link ヘッダーまたはパラメータで指定) - 常に優先
2. **Smart Data Models @context** (エンティティタイプが既知の SDM の場合) - 自動補完
3. **デフォルト NGSI-LD コア @context** - フォールバック

### 例: Smart Data Model エンティティの作成と取得

**エンティティ作成**:
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

**エンティティ取得**:
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

### 重要な注意点

- **@context はストレージに保存されません**: @context は API レスポンス時に動的に生成されるメタデータです
- **明示的な @context が優先されます**: Link ヘッダーで @context を指定した場合、SDM の自動補完より優先されます
- **不明なタイプはデフォルト @context を使用**: カスタムエンティティタイプには NGSI-LD コア @context のみが返されます

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

## 利点

### FIWARE エコシステムとの相互運用性

Smart Data Models の @context を使用することで、以下が可能になります:

- **標準化されたプロパティ名**: 他の FIWARE システムとの互換性
- **セマンティック相互運用性**: JSON-LD を使用した意味のあるデータ交換
- **エコシステム統合**: FIWARE Marketplace や他の FIWARE コンポーネントとの連携

### AI アシスタントの改善

MCP ツールにより、AI アシスタント (Claude など) が以下を行えます:

- **データモデルの検索**: 利用可能なデータモデルスキーマをドメインやキーワードで検索
- **プロパティ情報の取得**: `propertyDetails` から各プロパティの詳細情報を取得
  - NGSI-LD プロパティタイプ (Property, GeoProperty, Relationship) の判別
  - 値の型 (数値、文字列、GeoJSON 構造など) の理解
  - 実際の使用例となるサンプル値の利用
  - 必須フィールドの識別
- **正確なエンティティ作成**: 取得した情報を基に、正しく構造化された NGSI-LD エンティティを生成
- **ドメイン固有のベストプラクティス**: Smart Data Models の標準に従った実装

**推奨ワークフロー**:
1. `list_models` でモデルを検索
2. `get_model` で選択したモデルの `propertyDetails` を取得
3. `propertyDetails` の情報を基に、正しい NGSI-LD 構造でエンティティを作成

## 参考資料

- [Smart Data Models 公式サイト](https://smartdatamodels.org/)
- [Smart Data Models GitHub](https://github.com/smart-data-models)
- [FIWARE Data Models](https://fiware-datamodels.readthedocs.io/)
- [NGSI-LD Specification](https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/)

## 関連ドキュメント

- [MCP.md](../ai-integration/mcp-server.md) - Model Context Protocol サーバー
- [AI_INTEGRATION.md](../ai-integration/overview.md) - AI ツール統合
- [API_NGSILD.md](../api-reference/ngsild.md) - NGSI-LD API リファレンス