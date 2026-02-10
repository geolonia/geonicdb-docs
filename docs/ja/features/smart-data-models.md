---
title: Smart Data Models
description: Vela OS で FIWARE Smart Data Models を使用し、自動 @context 解決と MCP ベースのスキーマブラウジングを活用する方法。
outline: deep
---

# Smart Data Models

Vela OS は [FIWARE Smart Data Models](https://smartdatamodels.org/) イニシアチブと統合されており、既知のデータモデルタイプに対する **@context の自動補完** と、モデルカタログをブラウズするための **MCP ツール** を提供します。これにより、FIWARE エコシステム全体とのセマンティック相互運用性が確保されます。

## 概要

Smart Data Models はスマートシティや IoT デプロイメントで広く使用されている標準化されたデータスキーマです。Vela OS は2つの機能を通じてこれらをサポートします：

1. **@context の自動補完** — 既知の Smart Data Model タイプの NGSI-LD エンティティを取得する際、Vela OS が正しい JSON-LD @context を自動的に追加
2. **MCP ツール（`data_models`）** — MCP インターフェース経由で利用可能なデータモデルをブラウズ・検索

## サポートされているドメイン

| ドメイン | モデル例 |
|---------|---------|
| **Parking** | OffStreetParking、OnStreetParking、ParkingSpot |
| **Weather** | WeatherObserved、WeatherForecast |
| **Transportation** | Vehicle、TrafficFlowObserved、BikeHireDockingStation |
| **Environment** | AirQualityObserved、NoiseLevelObserved、WaterQualityObserved |
| **Building** | Building、BuildingOperation |
| **Device** | Device、DeviceModel |
| **WasteManagement** | WasteContainer、WasteContainerIsle |
| **Energy** | EnergyMonitor、ThreePhaseAcMeasurement |

## @context の自動補完

NGSI-LD API 経由でエンティティを取得する際、Vela OS はエンティティタイプが既知の Smart Data Model に一致するかチェックし、適切な @context を自動的に含めます。

### 解決の優先順位

1. **明示的な @context** — `Link` ヘッダーまたはリクエストパラメータが常に優先
2. **Smart Data Models の @context** — 既知のタイプに対して自動的に追加
3. **デフォルトの NGSI-LD Core @context** — カスタムタイプのフォールバック

### 使用例

**Smart Data Model エンティティの作成：**

```bash
curl -X POST https://api.vela.geolonia.com/ngsi-ld/v1/entities \
  -H "Content-Type: application/json" \
  -H "NGSILD-Tenant: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
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
  }'
```

**自動補完された @context 付きで取得：**

```bash
curl https://api.vela.geolonia.com/ngsi-ld/v1/entities/urn:ngsi-ld:OffStreetParking:downtown \
  -H "NGSILD-Tenant: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**レスポンス：**

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

`@context` 配列にはドメイン固有のコンテキストと NGSI-LD コアコンテキストの両方が含まれ、完全なセマンティック相互運用性が確保されます。

## MCP ツール：`data_models`

`data_models` MCP ツールにより、AI アシスタントやプログラマティッククライアントが Smart Data Models カタログをブラウズできます。

### ドメイン一覧

```json
{
  "action": "list_domains"
}
```

**レスポンス：**

```json
{
  "domains": [
    "Building", "Device", "Energy", "Environment",
    "Parking", "Transportation", "WasteManagement", "Weather"
  ],
  "total": 8
}
```

### モデル一覧

利用可能なデータモデルを検索・フィルタリング：

```json
{
  "action": "list_models",
  "domain": "Parking",
  "search": "parking",
  "limit": 10,
  "offset": 0
}
```

**レスポンス：**

```json
{
  "models": [
    {
      "type": "OffStreetParking",
      "domain": "Parking",
      "contextUrl": "https://raw.githubusercontent.com/smart-data-models/dataModel.Parking/master/context.jsonld",
      "description": "Off street parking site with explicit entries and exits",
      "schemaUrl": "https://github.com/smart-data-models/dataModel.Parking/blob/master/OffStreetParking/schema.json",
      "exampleProperties": ["name", "location", "totalSpotNumber", "availableSpotNumber"]
    }
  ],
  "total": 1
}
```

### モデル詳細の取得

```json
{
  "action": "get_model",
  "type": "OffStreetParking"
}
```

@context URL、スキーマ URL、説明、プロパティ例を含む完全なモデル定義を返します。

## メリット

### FIWARE エコシステムとの相互運用性

- **標準化されたプロパティ名** — 他の FIWARE コンポーネントとの互換性
- **セマンティック相互運用性** — JSON-LD @context を使用した意味のあるデータ交換
- **エコシステム統合** — FIWARE Marketplace やサードパーティツールとの連携

### AI アシスタントの統合

MCP ツールにより、AI アシスタント（Claude など）が以下を行えます：

- 利用可能なデータモデルスキーマを検索
- エンティティ作成時に適切なプロパティを提案
- ドメイン固有のベストプラクティスに従った実装

## 重要な注意事項

- @context は **データベースに保存されません** — API レスポンス時に動的に追加されます
- 明示的な @context（`Link` ヘッダー経由）は常に自動補完より優先されます
- いずれの Smart Data Model にも一致しないカスタムエンティティタイプには、デフォルトの NGSI-LD コア @context のみが返されます
