---
title: NGSIv2 vs NGSI-LD
description: Vela OS における NGSIv2 と NGSI-LD API の詳細比較 — 統一内部フォーマット、クロス API アクセス、属性マッピング、使い分けガイド。
outline: deep
---

# NGSIv2 vs NGSI-LD

Vela OS は同一インスタンス上で **NGSIv2** と **NGSI-LD** の両方をサポートしています。統一された内部エンティティフォーマットにより、一方の API で書き込んだデータをもう一方の API で読み取ることができ、フォーマット変換は自動的かつ透過的に処理されます。このページでは、両 API の包括的な比較を提供します。

## 統一アーキテクチャ

FIWARE Orion（NGSIv2 のみ）や Orion-LD（NGSI-LD のみ）とは異なり、Vela OS は単一のデプロイメントで両方の API を提供し、単一の MongoDB データベースをバックエンドとしています。両方の API レイヤーは同じエンティティストレージとサブスクリプション基盤を共有します。

```text
┌─────────────────────────────────────────────────┐
│                   クライアント                    │
│   NGSIv2 アプリ   │    NGSI-LD アプリ             │
└────────┬─────────┴──────────┬───────────────────┘
         │                    │
         ▼                    ▼
┌─────────────────┐  ┌──────────────────┐
│  NGSIv2 API     │  │  NGSI-LD API     │
│  /v2/entities   │  │  /ngsi-ld/v1/    │
│  Transformer    │  │  Transformer     │
└────────┬────────┘  └────────┬─────────┘
         │                    │
         ▼                    ▼
┌─────────────────────────────────────────────────┐
│          統一内部エンティティフォーマット            │
│        （サービスレイヤー / ビジネスロジック）       │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│                  MongoDB Atlas                   │
│          （単一エンティティコレクション）            │
└─────────────────────────────────────────────────┘
```

各 API レイヤーには独自の**トランスフォーマー**があり、ワイヤフォーマット（NGSIv2 JSON または NGSI-LD JSON-LD）と統一内部表現の間の変換を行います。サービスレイヤーは内部フォーマットのみを扱うため、ビジネスロジック（クエリ、サブスクリプション、ジオ処理）は両方の API で共有されます。

## クロス API アクセス

一方の API で作成したエンティティを、もう一方の API で読み取り、更新、削除できます。これが Vela の統一アーキテクチャの最大の利点です。

### NGSIv2 で書き込み、NGSI-LD で読み取り

NGSIv2 API を使用してエンティティを作成：

```bash
curl -X POST https://api.vela.geolonia.com/v2/entities \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: demo" \
  -d '{
    "id": "urn:ngsi-ld:TemperatureSensor:001",
    "type": "TemperatureSensor",
    "temperature": {
      "type": "Number",
      "value": 23.5,
      "metadata": {
        "unit": { "type": "Text", "value": "CEL" }
      }
    },
    "location": {
      "type": "geo:json",
      "value": {
        "type": "Point",
        "coordinates": [139.7671, 35.6812]
      }
    }
  }'
```

NGSI-LD API で同じエンティティを読み取り：

```bash
curl https://api.vela.geolonia.com/ngsi-ld/v1/entities/urn:ngsi-ld:TemperatureSensor:001 \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: demo"
```

レスポンス（NGSI-LD normalized フォーマット）：

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "id": "urn:ngsi-ld:TemperatureSensor:001",
  "type": "TemperatureSensor",
  "temperature": {
    "type": "Property",
    "value": 23.5,
    "unitCode": "CEL"
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

### NGSI-LD で書き込み、NGSIv2 で読み取り

NGSI-LD API を使用してエンティティを作成：

```bash
curl -X POST https://api.vela.geolonia.com/ngsi-ld/v1/entities \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: demo" \
  -d '{
    "id": "urn:ngsi-ld:Room:101",
    "type": "Room",
    "temperature": {
      "type": "Property",
      "value": 21.0,
      "unitCode": "CEL",
      "observedAt": "2026-02-10T09:00:00Z"
    },
    "isPartOf": {
      "type": "Relationship",
      "object": "urn:ngsi-ld:Building:001"
    }
  }'
```

NGSIv2 で読み取り：

```bash
curl https://api.vela.geolonia.com/v2/entities/urn:ngsi-ld:Room:101 \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: demo"
```

レスポンス（NGSIv2 normalized フォーマット）：

```json
{
  "id": "urn:ngsi-ld:Room:101",
  "type": "Room",
  "temperature": {
    "type": "Number",
    "value": 21.0,
    "metadata": {
      "unit": { "type": "Text", "value": "CEL" },
      "observedAt": { "type": "DateTime", "value": "2026-02-10T09:00:00Z" }
    }
  },
  "isPartOf": {
    "type": "Relationship",
    "value": "urn:ngsi-ld:Building:001",
    "metadata": {}
  }
}
```

## 属性タイプのマッピング

Vela OS は 2 つの API フォーマット間で属性タイプを自動的に変換します。マッピングは決定的であり、すべての標準タイプで情報の損失はありません。

| NGSIv2 タイプ | NGSI-LD タイプ | 説明 |
|-------------|--------------|------|
| `Number` | `Property` | 数値（整数または浮動小数点） |
| `Text` / `String` | `Property` | 文字列 |
| `Boolean` | `Property` | 真偽値 |
| `DateTime` | `Property` | ISO 8601 日時文字列 |
| `StructuredValue` | `Property` | 複合 JSON オブジェクトまたは配列 |
| `geo:json` | `GeoProperty` | GeoJSON ジオメトリ（Point、Polygon 等） |
| `Relationship` | `Relationship` | エンティティ ID による他エンティティへの参照 |
| _（対応なし）_ | `LanguageProperty` | 多言語文字列値（NGSI-LD のみ） |

::: info NGSIv2 での LanguageProperty
`LanguageProperty` を NGSIv2 経由で読み取る場合、`languageMap` オブジェクトを含む `StructuredValue` として返されます。セマンティックな意味は保持されますが、NGSI-LD 固有のタイプは利用できません。
:::

## システム属性の違い

両方の API はエンティティの作成および更新タイムスタンプを追跡しますが、フィールド名が異なります。

| NGSIv2 | NGSI-LD | 説明 |
|--------|---------|------|
| `dateCreated` | `createdAt` | エンティティ作成タイムスタンプ |
| `dateModified` | `modifiedAt` | 最終更新タイムスタンプ |

**NGSIv2** では、クエリパラメータで明示的にリクエストした場合のみシステム属性が含まれます：

```bash
curl "https://api.vela.geolonia.com/v2/entities/urn:ngsi-ld:Room:101?options=dateCreated,dateModified" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: demo"
```

**NGSI-LD** では、システム属性（`createdAt`、`modifiedAt`）はデフォルトで常にレスポンスに含まれます。属性レベルでも表示され、各属性の作成・更新時刻を追跡します。

## 出力フォーマットの違い

各 API は異なる出力フォーマットオプションをサポートしています。

### NGSIv2 フォーマット

| フォーマット | パラメータ | 説明 |
|-----------|-----------|------|
| Normalized（デフォルト） | — | `type`、`value`、`metadata` を含む完全フォーマット |
| keyValues | `options=keyValues` | 簡略化されたキーと値のペア |
| values | `options=values` | 属性値の配列 |

```bash
# Normalized（デフォルト）
curl "https://api.vela.geolonia.com/v2/entities/urn:ngsi-ld:Room:101" \
  -H "x-api-key: YOUR_API_KEY" -H "Fiware-Service: demo"

# keyValues
curl "https://api.vela.geolonia.com/v2/entities/urn:ngsi-ld:Room:101?options=keyValues" \
  -H "x-api-key: YOUR_API_KEY" -H "Fiware-Service: demo"
```

keyValues レスポンス：

```json
{
  "id": "urn:ngsi-ld:Room:101",
  "type": "Room",
  "temperature": 21.0
}
```

### NGSI-LD フォーマット

| フォーマット | パラメータ | 説明 |
|-----------|-----------|------|
| Normalized（デフォルト） | — | `type`、`value`、サブ属性を含む完全フォーマット |
| Concise | `options=concise` | 簡略表記（NGSI-LD 1.6+） |
| keyValues | `options=keyValues` | キーと値のペア |

```bash
# Normalized（デフォルト）
curl "https://api.vela.geolonia.com/ngsi-ld/v1/entities/urn:ngsi-ld:Room:101" \
  -H "x-api-key: YOUR_API_KEY" -H "Fiware-Service: demo"

# Concise
curl "https://api.vela.geolonia.com/ngsi-ld/v1/entities/urn:ngsi-ld:Room:101?options=concise" \
  -H "x-api-key: YOUR_API_KEY" -H "Fiware-Service: demo"
```

Concise レスポンス：

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "id": "urn:ngsi-ld:Room:101",
  "type": "Room",
  "temperature": 21.0,
  "isPartOf": { "object": "urn:ngsi-ld:Building:001" }
}
```

## 共通機能

両方の API は統一サービスレイヤーを通じて多くのコア機能を共有しています。

| 機能 | NGSIv2 | NGSI-LD |
|------|--------|---------|
| クエリ言語（`q` パラメータ） | ✅ | ✅ |
| ジオクエリ（near、within、intersects 等） | ✅ | ✅ |
| ページネーション（limit/offset） | ✅ | ✅ |
| サブスクリプション（HTTP、MQTT、WebSocket） | ✅ | ✅ |
| バッチ操作 | ✅ | ✅ |
| フェデレーション / コンテキストプロバイダー | ✅ | ✅ |
| マルチテナンシー | ✅ | ✅ |

クエリ構文の詳細は[クエリ言語](/ja/core-concepts/query-language)ページを参照してください。

## NGSI-LD 固有の機能

NGSI-LD は NGSIv2 では利用できない追加機能を提供します。

### Relationship

エンティティ間の参照を表すファーストクラスの属性タイプです。`object` フィールドにターゲットエンティティの ID を保持します：

```json
{
  "isPartOf": {
    "type": "Relationship",
    "object": "urn:ngsi-ld:Building:001"
  }
}
```

NGSIv2 も `"type": "Relationship"` をサポートしていますが、NGSI-LD は正式なセマンティクスを定義し、リレーションシップのトラバースを可能にします。

### LanguageProperty

`languageMap` を使用した多言語値：

```json
{
  "name": {
    "type": "LanguageProperty",
    "languageMap": {
      "en": "Tokyo Tower",
      "ja": "東京タワー",
      "zh": "东京塔"
    }
  }
}
```

`lang` クエリパラメータを使用して特定の言語のバリアントを取得できます。

### Scope

`scope` 属性と `scopeQ` クエリパラメータを使用したエンティティレベルのスコープフィルタリング：

```json
{
  "id": "urn:ngsi-ld:Room:101",
  "type": "Room",
  "scope": ["/building/floor1"]
}
```

```bash
curl "https://api.vela.geolonia.com/ngsi-ld/v1/entities?type=Room&scopeQ=/building/#" \
  -H "x-api-key: YOUR_API_KEY" -H "Fiware-Service: demo"
```

### Pick と Omit

`pick` と `omit` クエリパラメータによるきめ細かい属性選択：

```bash
# temperature と humidity のみを返す
curl "https://api.vela.geolonia.com/ngsi-ld/v1/entities?type=Room&pick=temperature,humidity" \
  -H "x-api-key: YOUR_API_KEY" -H "Fiware-Service: demo"

# location 以外のすべての属性を返す
curl "https://api.vela.geolonia.com/ngsi-ld/v1/entities?type=Room&omit=location" \
  -H "x-api-key: YOUR_API_KEY" -H "Fiware-Service: demo"
```

### JSON-LD @context

NGSI-LD は `@context` を使用してボキャブラリマッピングを定義し、セマンティックな意味を提供します。コンテキストはインラインで提供するか、`Link` ヘッダー経由で提供できます：

```bash
curl -X POST https://api.vela.geolonia.com/ngsi-ld/v1/entities \
  -H "Content-Type: application/ld+json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: demo" \
  -d '{
    "@context": [
      "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
      "https://smartdatamodels.org/context.jsonld"
    ],
    "id": "urn:ngsi-ld:AirQualityObserved:001",
    "type": "AirQualityObserved",
    "PM25": {
      "type": "Property",
      "value": 12.3,
      "observedAt": "2026-02-10T09:00:00Z"
    }
  }'
```

NGSIv2 には `@context` の概念がありません — ボキャブラリは暗黙的です。

## エンティティ ID の規則

両方の API は任意の文字列のエンティティ ID を受け付けます。ただし、クロス API 互換性のために **URN 形式**を強く推奨します：

```text
urn:ngsi-ld:{EntityType}:{LocalId}
```

例：

```text
urn:ngsi-ld:Room:001
urn:ngsi-ld:Vehicle:ABC123
urn:ngsi-ld:WeatherObserved:Tokyo-2026-02-10
```

::: warning ショート ID と NGSI-LD
NGSI-LD は技術的にエンティティ ID が有効な URI であることを要求します。Vela OS は利便性のために `Room1` のようなショート ID を受け付けますが、厳密な NGSI-LD クライアントとの間で問題が生じる可能性があります。本番環境では常に URN 形式を使用してください。
:::

エンティティ ID、タイプ、属性の詳細は [NGSI データモデル](/ja/core-concepts/ngsi-data-model)を参照してください。

## どちらの API を使うべきか

### NGSIv2 を選ぶ場合：

- **FIWARE Orion からの移行** — NGSIv2 は Orion と API 互換であり、既存のクライアントがそのまま動作します。
- **シンプルな IoT データ収集** — センサーデータの読み取りや基本的なエンティティ管理。
- **既存の NGSIv2 クライアント** — NGSIv2 を使用しているライブラリ、ダッシュボード、サービスがある場合。
- **最小限のオーバーヘッド** — JSON-LD、`@context`、リンクドデータセマンティクスが不要な場合。

### NGSI-LD を選ぶ場合：

- **セマンティックデータモデリング** — リンクドデータ、`@context`、豊富な型セマンティクスが必要な場合。
- **エンティティ間のリレーションシップ** — ファーストクラスの `Relationship` 属性とトラバース機能。
- **多言語対応** — 国際化データのための `LanguageProperty`。
- **Smart Data Models** — [Smart Data Models](https://smartdatamodels.org/) プログラムの標準データモデルを使用する場合。
- **新規プロジェクト** — NGSI-LD は最新の ETSI 標準であり、グリーンフィールドアプリケーションに推奨されます。

### 判断マトリクス

| 基準 | NGSIv2 | NGSI-LD |
|------|--------|---------|
| 学習曲線 | 低い | 中程度 |
| API の複雑さ | シンプル | 豊富 |
| リンクドデータ / セマンティクス | なし | あり |
| レガシー互換性 | Orion 互換 | 新標準 |
| エンティティリレーションシップ | 基本的 | ファーストクラス |
| 多言語対応 | なし | あり（`LanguageProperty`） |
| `@context` サポート | なし | あり |
| クエリ言語 | `q`, `mq`, `georel` | `q`, `scopeQ`, `georel`, `pick`, `omit` |

## ハイブリッド運用パターン

Vela の主要な強みの一つは、同じデータに対して両方の API を同時に実行するハイブリッド運用を可能にすることです。

### 段階的な移行

NGSIv2 から NGSI-LD へ段階的に移行できます。既存の NGSIv2 サービスは運用を継続しながら、新しいサービスは NGSI-LD を使用：

```text
┌──────────────────────────┐
│  既存の NGSIv2 サービス   │──→ /v2/entities ──┐
└──────────────────────────┘                   │
                                                ▼
                                          ┌──────────┐
                                          │ Vela OS  │
                                          │（共有     │
                                          │ データ）  │
                                          └──────────┘
                                                ▲
┌──────────────────────────┐                   │
│  新しい NGSI-LD サービス  │──→ /ngsi-ld/v1/ ──┘
└──────────────────────────┘
```

### 読み取り最適化パターン

各ユースケースに最適な API フォーマットを使用：

- **IoT デバイス**は NGSIv2 経由でセンサーデータを書き込み（シンプルなペイロード、低オーバーヘッド）
- **分析プラットフォーム**は NGSI-LD 経由で同じデータを読み取り（豊富なセマンティクス、データ統合のための `@context`）

```bash
# IoT デバイスが NGSIv2 経由で書き込み（シンプル）
curl -X POST https://api.vela.geolonia.com/v2/entities \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartcity" \
  -d '{
    "id": "urn:ngsi-ld:AirQualityObserved:sensor42",
    "type": "AirQualityObserved",
    "PM25": { "type": "Number", "value": 15.2 },
    "PM10": { "type": "Number", "value": 28.7 }
  }'

# 分析プラットフォームが NGSI-LD 経由で読み取り（セマンティック）
curl "https://api.vela.geolonia.com/ngsi-ld/v1/entities?type=AirQualityObserved&options=keyValues" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartcity" \
  -H "Link: <https://smartdatamodels.org/context.jsonld>; rel=\"http://www.w3.org/ns/json-ld#context\"; type=\"application/ld+json\""
```

### サブスクリプションブリッジング

一方の API で作成したサブスクリプションは、どちらの API を通じたエンティティ変更でもトリガーされます：

```bash
# NGSI-LD 経由でサブスクリプションを作成
curl -X POST https://api.vela.geolonia.com/ngsi-ld/v1/subscriptions \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartcity" \
  -d '{
    "type": "Subscription",
    "entities": [{ "type": "AirQualityObserved" }],
    "notification": {
      "endpoint": {
        "uri": "https://example.com/webhook",
        "accept": "application/json"
      }
    }
  }'
```

このサブスクリプションは、`AirQualityObserved` エンティティが `/v2/entities` または `/ngsi-ld/v1/entities` の**どちらから**作成・更新されてもトリガーされます。

## API エンドポイントリファレンス

| 操作 | NGSIv2 | NGSI-LD |
|------|--------|---------|
| エンティティ CRUD | `/v2/entities` | `/ngsi-ld/v1/entities` |
| サブスクリプション | `/v2/subscriptions` | `/ngsi-ld/v1/subscriptions` |
| バッチ操作 | `/v2/op/update`, `/v2/op/query` | `/ngsi-ld/v1/entityOperations/*` |
| 登録 | `/v2/registrations` | `/ngsi-ld/v1/csourceRegistrations` |
| タイプ | `/v2/types` | `/ngsi-ld/v1/types` |

API の詳細は [NGSIv2 API リファレンス](/ja/api-reference/ngsiv2)および [NGSI-LD API リファレンス](/ja/api-reference/ngsild)を参照してください。

## 次のステップ

- [NGSI データモデル](/ja/core-concepts/ngsi-data-model) — エンティティ、属性、メタデータの理解
- [マルチテナンシー](/ja/core-concepts/multi-tenancy) — テナントヘッダーによるデータ分離
- [クエリ言語](/ja/core-concepts/query-language) — 強力なクエリ構文でエンティティをフィルタリング
- [NGSIv2 API リファレンス](/ja/api-reference/ngsiv2) — NGSIv2 エンドポイントの完全なドキュメント
- [NGSI-LD API リファレンス](/ja/api-reference/ngsild) — NGSI-LD エンドポイントの完全なドキュメント
