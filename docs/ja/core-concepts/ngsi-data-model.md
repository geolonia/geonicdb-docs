---
title: NGSI データモデル
description: Vela OS の基盤となる NGSI 情報モデルの中核概念 — エンティティ、属性、メタデータについて解説します。
outline: deep
---

# NGSI データモデル

Vela OS は **NGSI（Next Generation Service Interface）** データモデルを使用してコンテキスト情報を管理します。このページでは、中核となる構成要素である**エンティティ**、**属性**、**メタデータ**について説明します。

## エンティティ

**エンティティ**はコンテキスト情報の基本単位です。部屋、センサー、車両、建物など、現実世界のオブジェクトや概念を表現します。

すべてのエンティティは以下のフィールドを持ちます：

| フィールド | 説明 | 例 |
|-----------|------|-----|
| `id` | 一意の識別子 | `urn:ngsi-ld:Room:001` |
| `type` | エンティティの分類 | `Room` |
| 属性 | データを保持する名前付きプロパティ | `temperature`, `humidity` |

### エンティティ ID の命名規則

- **NGSIv2** では任意の文字列をエンティティ ID として使用可能（例: `Room1`, `sensor-abc`）。
- **NGSI-LD** では URN 形式を推奨: `urn:ngsi-ld:{Type}:{LocalId}`。

両方の API 間で最適な相互運用性を得るためには、常に URN 形式を使用してください：

```text
urn:ngsi-ld:Room:001
urn:ngsi-ld:Vehicle:ABC123
urn:ngsi-ld:WeatherObserved:Tokyo-2026-02-08
```

### エンティティタイプ

`type` フィールドはエンティティを分類します。クエリでタイプによるフィルタリングが可能です（例: `Room` タイプのすべてのエンティティを取得）。セマンティック相互運用性のために、[Smart Data Models](https://smartdatamodels.org/) の標準タイプ名の使用を推奨します。

## 属性

属性はエンティティの実際のデータを保持します。各属性には**タイプ**と**値**があります。

### NGSIv2 の属性フォーマット

NGSIv2 では、属性は `type`、`value`、オプションの `metadata` を持つ JSON オブジェクトです：

```json
{
  "id": "urn:ngsi-ld:Room:001",
  "type": "Room",
  "temperature": {
    "type": "Number",
    "value": 23.5,
    "metadata": {
      "unit": {
        "type": "Text",
        "value": "Celsius"
      }
    }
  },
  "humidity": {
    "type": "Number",
    "value": 60,
    "metadata": {}
  }
}
```

### NGSI-LD の属性タイプ

NGSI-LD はよりセマンティックに豊富な属性タイプを使用します：

| 属性タイプ | 説明 | 例 |
|-----------|------|-----|
| `Property` | データ値（数値、文字列、真偽値、オブジェクト） | `"type": "Property", "value": 23.5` |
| `Relationship` | 他のエンティティへの参照 | `"type": "Relationship", "object": "urn:ngsi-ld:Building:001"` |
| `GeoProperty` | 地理的位置（GeoJSON） | `"type": "GeoProperty", "value": {"type": "Point", ...}` |
| `LanguageProperty` | 多言語文字列値 | `"type": "LanguageProperty", "languageMap": {"en": "...", "ja": "..."}` |

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "id": "urn:ngsi-ld:Room:001",
  "type": "Room",
  "temperature": {
    "type": "Property",
    "value": 23.5,
    "unitCode": "CEL",
    "observedAt": "2026-02-08T10:00:00Z"
  },
  "isPartOf": {
    "type": "Relationship",
    "object": "urn:ngsi-ld:Building:001"
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

### 属性タイプのマッピング

Vela OS は NGSIv2 と NGSI-LD の属性タイプを自動的に変換します：

| NGSIv2 タイプ | NGSI-LD タイプ | 説明 |
|-------------|--------------|------|
| `Number` | `Property` | 数値 |
| `Text` / `String` | `Property` | 文字列 |
| `Boolean` | `Property` | 真偽値 |
| `DateTime` | `Property` | ISO 8601 日時文字列 |
| `geo:json` | `GeoProperty` | GeoJSON ジオメトリ |
| `Relationship` | `Relationship` | エンティティ参照 |
| `StructuredValue` | `Property` | 複合 JSON オブジェクト |

## メタデータ

メタデータは属性に関する追加情報を提供します。

### NGSIv2 のメタデータ

NGSIv2 では、メタデータは属性内のネストされたオブジェクトです：

```json
{
  "temperature": {
    "type": "Number",
    "value": 23.5,
    "metadata": {
      "unit": {
        "type": "Text",
        "value": "Celsius"
      },
      "accuracy": {
        "type": "Number",
        "value": 0.95
      }
    }
  }
}
```

### NGSI-LD のサブ属性

NGSI-LD では、メタデータは属性内のサブ属性として直接表現されます：

```json
{
  "temperature": {
    "type": "Property",
    "value": 23.5,
    "unitCode": "CEL",
    "observedAt": "2026-02-08T10:00:00Z"
  }
}
```

### メタデータのマッピング

| NGSIv2 メタデータ | NGSI-LD サブ属性 | 説明 |
|-----------------|-----------------|------|
| `unit` (Text) | `unitCode` (string) | 計測単位（例: "CEL", "KMH"） |
| `observedAt` (DateTime) | `observedAt` (ISO 8601) | 観測タイムスタンプ |
| `datasetId` (Text) | `datasetId` (URI) | データセット識別子 |

## システム属性

エンティティにはシステム管理のタイムスタンプがあり、API によってフィールド名が異なります：

| NGSIv2 | NGSI-LD | 説明 |
|--------|---------|------|
| `dateCreated` | `createdAt` | エンティティ作成タイムスタンプ |
| `dateModified` | `modifiedAt` | 最終更新タイムスタンプ |

NGSIv2 では、`options=dateCreated,dateModified` を指定した場合にのみシステム属性が返されます。NGSI-LD では、常にレスポンスに含まれます。

## 出力フォーマット

### NGSIv2

| フォーマット | パラメータ | 説明 |
|-----------|-----------|------|
| Normalized（デフォルト） | — | タイプとメタデータを含む完全フォーマット |
| keyValues | `options=keyValues` | キーと値のペアのみ |
| values | `options=values` | 属性値の配列のみ |

### NGSI-LD

| フォーマット | パラメータ | 説明 |
|-----------|-----------|------|
| Normalized（デフォルト） | — | タイプとサブ属性を含む完全フォーマット |
| Concise | `options=concise` | 簡略表記 |
| keyValues | `options=keyValues` | キーと値のペアのみ |

## JSON-LD コンテキスト

NGSI-LD は `@context` を使用してボキャブラリとセマンティクスを定義します。Vela OS は NGSI-LD コアコンテキストをサポートし、Smart Data Models コンテキストを自動的に解決します：

```json
{
  "@context": [
    "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
    "https://smartdatamodels.org/context.jsonld"
  ],
  "id": "urn:ngsi-ld:AirQualityObserved:001",
  "type": "AirQualityObserved"
}
```

NGSIv2 には `@context` の概念がありません — ボキャブラリは暗黙的です。

## 次のステップ

- [マルチテナンシー](/ja/core-concepts/multi-tenancy) — テナントによるデータ分離について
- [NGSIv2 vs NGSI-LD](/ja/core-concepts/ngsiv2-vs-ngsild) — 両 API の比較
- [クエリ言語](/ja/core-concepts/query-language) — 強力なクエリ構文でエンティティをフィルタリング
