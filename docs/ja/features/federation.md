---
title: フェデレーション
description: GeonicDB で Context Source Registration（CSR）を使用して複数の Context Broker 間でクエリを分散する方法。
outline: deep
---

# フェデレーション

GeonicDB は **Context Source Registration（CSR）** によるフェデレーションをサポートしており、複数の Context Broker 間でクエリや更新を分散させることができます。これにより、異なるデータプロバイダーがそれぞれのエンティティを管理しながら、中央のブローカーがリクエストをシームレスに集約・転送する分散アーキテクチャを実現できます。

## 概要

GeonicDB のフェデレーションは、特定のエンティティタイプやパターンのデータを提供できる外部 Context Broker（コンテキストプロバイダー）を登録することで動作します。登録に一致するクエリが届くと、GeonicDB はリクエストを登録済みプロバイダーに転送し、結果をマージします。

```text
クライアント → GeonicDB（中央） ──┬── ローカル MongoDB
                                 ├── コンテキストプロバイダー A（例：気象サービス）
                                 └── コンテキストプロバイダー B（例：交通サービス）
```

## Context Source Registration の作成

### NGSIv2

```bash
curl -X POST https://api.geonicdb.geolonia.com/v2/registrations \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "description": "外部プロバイダーからの気象データ",
    "dataProvided": {
      "entities": [
        { "type": "WeatherObserved" }
      ],
      "attrs": ["temperature", "humidity", "windSpeed"]
    },
    "provider": {
      "http": {
        "url": "https://weather-broker.example.com/v2"
      },
      "supportedForwardingMode": "all"
    }
  }'
```

### NGSI-LD

```bash
curl -X POST https://api.geonicdb.geolonia.com/ngsi-ld/v1/csourceRegistrations \
  -H "Content-Type: application/json" \
  -H "NGSILD-Tenant: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
    "type": "ContextSourceRegistration",
    "information": [
      {
        "entities": [
          { "type": "WeatherObserved" }
        ],
        "propertyNames": ["temperature", "humidity", "windSpeed"]
      }
    ],
    "endpoint": "https://weather-broker.example.com/ngsi-ld/v1"
  }'
```

## 転送モード

| モード | 説明 |
|--------|------|
| `all` | クエリと更新の両方をプロバイダーに転送 |
| `query` | クエリ操作のみ転送 |
| `update` | 更新操作のみ転送 |
| `none` | 登録は存在するが転送は行わない |

## 分散クエリ

クライアントがエンティティをクエリすると、GeonicDB は登録を確認してリクエストをファンアウトします：

1. ローカル MongoDB からマッチするエンティティを検索
2. マッチするすべてのコンテキストプロバイダーに並列でクエリを転送
3. すべてのソースからの結果をマージ
4. 統合されたレスポンスをクライアントに返却

```bash
# このクエリはローカルデータ + フェデレーションプロバイダーから提供される可能性があります
curl https://api.geonicdb.geolonia.com/v2/entities?type=WeatherObserved \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### エンティティレベルの転送

個別エンティティの取得では、ローカルにエンティティが見つからないが登録がマッチする場合、GeonicDB は登録済みプロバイダーにリクエストを転送します：

```bash
curl https://api.geonicdb.geolonia.com/v2/entities/urn:ngsi-ld:WeatherObserved:station01 \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## ループ検出

GeonicDB はマルチブローカーフェデレーション環境での無限転送チェーンを防止するループ検出機能を搭載しています。リクエストを転送する際、GeonicDB はトラッキングヘッダーを追加して循環転送パスを検出・遮断します。転送されたリクエストが同じブローカーに戻ってきた場合、無限ループを回避するために終了されます。

## 登録パターン

### エンティティタイプ別

特定のタイプのすべてのクエリを転送：

```json
{
  "dataProvided": {
    "entities": [
      { "type": "WeatherObserved" }
    ]
  }
}
```

### エンティティ ID パターン別

特定の ID パターンに一致するクエリを転送：

```json
{
  "dataProvided": {
    "entities": [
      { "idPattern": "urn:ngsi-ld:Building:tokyo-.*", "type": "Building" }
    ]
  }
}
```

### 属性別

特定の属性のみを転送：

```json
{
  "dataProvided": {
    "entities": [
      { "type": "Room" }
    ],
    "attrs": ["temperature", "humidity"]
  }
}
```

## 登録の管理

### 一覧取得

```bash
curl https://api.geonicdb.geolonia.com/v2/registrations \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### 削除

```bash
curl -X DELETE https://api.geonicdb.geolonia.com/v2/registrations/{registrationId} \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## ベストプラクティス

- **タイムアウト処理** — フェデレーションクエリには設定可能なタイムアウトがあります。コンテキストプロバイダーが時間内に応答しない場合、プロバイダーのデータなしでローカル結果が返されます。
- **属性パーティショニング** — 特定の属性に対してプロバイダーを登録し、不要な転送を最小限に抑えましょう。
- **ヘルスモニタリング** — コンテキストプロバイダーの可用性を監視してください。到達不能なプロバイダーはタイムアウトを引き起こしますが、ローカルデータの取得はブロックしません。
- **セキュリティ** — コンテキストプロバイダーが HTTPS 経由でアクセス可能であることを確認してください。GeonicDB はテナントコンテキストを転送しますが、プロバイダー側で独自の認証を実装する必要があります。
