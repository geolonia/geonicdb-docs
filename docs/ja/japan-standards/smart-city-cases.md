---
title: スマートシティ ユースケース
description: 交通管理、環境モニタリング、防災、ゴミ収集など、Vela OS を使ったスマートシティ・IoT のユースケース。
outline: deep
---

# スマートシティ ユースケース

Vela OS は**スマートシティ**および **IoT** プラットフォームを支えるために設計されています。FIWARE Orion 互換の Context Broker として、サーバーレスアーキテクチャと日本固有の標準サポートを備え、複数のドメインにわたる都市インフラプロジェクトに適しています。

## アーキテクチャパターン

Vela を使った典型的なスマートシティ構成:

```text
IoT センサー / データソース
    ↓ (NGSIv2 / NGSI-LD)
Vela OS（Context Broker）
    ↓
┌──────────────┬───────────┬──────────┐
│ ダッシュボード │ AI エージェント│ CADDE    │
│ (WebSocket)  │ (MCP/tools)│ (x-cadde-*)│
└──────────────┴───────────┴──────────┘
```

**主要コンポーネント**:

- NGSIv2 / NGSI-LD API による IoT センサー・外部システムからの**データ取り込み**
- WebSocket、MQTT、HTTP Webhook によるダッシュボードへの**リアルタイム通知**
- MCP サーバーによる自律的なデータ分析のための **AI 連携**
- 政府間相互運用のための CADDE コネクタによる**分野横断データ共有**
- ZFXY 空間IDによる位置ベースサービスのための**空間クエリ**

## 交通管理

### ユースケース

車両センサーと路側ユニットを使ってリアルタイムの交通フローを監視。渋滞の検出、信号タイミングの最適化、ナビゲーションガイダンスの提供。

### Vela での実装例

```bash
# 交通センサーエンティティの作成
curl -X POST https://api.vela.geolonia.com/v2/entities \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smart-city" \
  -H "Fiware-ServicePath: /traffic" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "id": "urn:ngsi-ld:TrafficFlowObserved:shibuya-001",
    "type": "TrafficFlowObserved",
    "location": {
      "type": "geo:json",
      "value": {"type": "Point", "coordinates": [139.7013, 35.6580]}
    },
    "intensity": {"type": "Number", "value": 342},
    "averageVehicleSpeed": {"type": "Number", "value": 28.5},
    "congestionLevel": {"type": "Text", "value": "moderate"}
  }'
```

**使用する Vela 機能**: 空間フィルタリング用のジオクエリ、リアルタイムダッシュボード更新用の WebSocket サブスクリプション、過去のトレンド分析用の Temporal API。

## 環境モニタリング

### ユースケース

都市エリア全体の大気質、騒音レベル、気温、湿度を追跡。閾値超過時にアラートを生成。

### Vela での実装例

```bash
# 大気質センサーエンティティの作成
curl -X POST https://api.vela.geolonia.com/v2/entities \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smart-city" \
  -H "Fiware-ServicePath: /environment" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "id": "urn:ngsi-ld:AirQualityObserved:shinjuku-003",
    "type": "AirQualityObserved",
    "location": {
      "type": "geo:json",
      "value": {"type": "Point", "coordinates": [139.6917, 35.6895]}
    },
    "PM25": {"type": "Number", "value": 12.3},
    "PM10": {"type": "Number", "value": 28.7},
    "NO2": {"type": "Number", "value": 15.2},
    "temperature": {"type": "Number", "value": 22.1},
    "relativeHumidity": {"type": "Number", "value": 65.0}
  }'
```

**使用する Vela 機能**: 閾値条件（`q` パラメータ）付きサブスクリプションによるアラート、政府環境機関とのデータ共有のための CADDE 連携、オープンデータ公開のための DCAT-AP カタログ。

## 防災

### ユースケース

河川・貯水池の水位監視、地震活動の検知、市内インフラ全体への避難警報の配信。

### Vela での実装例

```bash
# 水位センサーエンティティの作成
curl -X POST https://api.vela.geolonia.com/v2/entities \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smart-city" \
  -H "Fiware-ServicePath: /disaster-prevention" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "id": "urn:ngsi-ld:WaterLevelObserved:tama-river-005",
    "type": "WaterLevelObserved",
    "location": {
      "type": "geo:json",
      "value": {"type": "Point", "coordinates": [139.4455, 35.6285]}
    },
    "waterLevel": {"type": "Number", "value": 2.35},
    "alertLevel": {"type": "Text", "value": "normal"},
    "measuredAt": {"type": "DateTime", "value": "2026-02-10T09:00:00Z"}
  }'
```

**使用する Vela 機能**: 3D 危険区域マッピングのための空間ID（ZFXY）、リアルタイム警報配信のためのサブスクリプション、複数自治体のブローカーからデータを集約するフェデレーション。

## ゴミ収集

### ユースケース

スマートゴミ箱のリアルタイム充填レベルに基づいてゴミ収集ルートを最適化。収集コストの削減とサービス効率の向上。

### Vela での実装例

```bash
# ゴミ容器エンティティの作成
curl -X POST https://api.vela.geolonia.com/v2/entities \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smart-city" \
  -H "Fiware-ServicePath: /waste" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "id": "urn:ngsi-ld:WasteContainer:minato-042",
    "type": "WasteContainer",
    "location": {
      "type": "geo:json",
      "value": {"type": "Point", "coordinates": [139.7454, 35.6586]}
    },
    "fillingLevel": {"type": "Number", "value": 0.75},
    "temperature": {"type": "Number", "value": 18.2},
    "status": {"type": "Text", "value": "ok"}
  }'
```

**使用する Vela 機能**: ルート沿いの近隣容器検索のためのジオクエリ、`fillingLevel > 0.85` でトリガーされるサブスクリプション、容器位置の地図表示のためのベクトルタイル。

## FIWARE + Vela アーキテクチャ

Vela OS は FIWARE Orion のドロップインリプレースメントとして **FIWARE エコシステム** と統合できます:

```text
┌─────────────────────────────────┐
│     スマートシティプラットフォーム    │
├──────────┬──────────┬───────────┤
│ Vela OS  │QuantumLeap│ Keyrock  │
│(Broker)  │ (時系列DB) │ (認証)   │
├──────────┴──────────┴───────────┤
│         FIWARE エコシステム        │
└─────────────────────────────────┘
```

既存の FIWARE ベースのスマートシティ環境は、Vela に移行することでサーバーレススケーリング、AI 連携、日本固有の標準サポートを得ながら、他の FIWARE コンポーネントとの互換性を維持できます。

## 次のステップ

- [CADDE](/ja/japan-standards/cadde) — 政府間相互運用のための分野間データ連携基盤
- [空間ID / ZFXY](/ja/japan-standards/spatial-id-zfxy) — 位置ベースサービスのための3D空間識別
