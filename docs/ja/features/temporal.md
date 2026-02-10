---
title: Temporal API
description: Vela OS の Temporal API でエンティティ履歴と時系列データにアクセスし、TTL を管理する方法。
outline: deep
---

# Temporal API

Vela OS は、エンティティの時間的な状態履歴にアクセスするための **Temporal API** を提供します。属性の変更がすべて記録されるため、時系列分析、トレンドモニタリング、コンテキストデータの監査が可能です。

## 概要

Temporal API は NGSI-LD の時間的表現モデルに準拠しています。テンポラルトラッキングが有効な場合、Vela OS は各エンティティ属性の更新を時間インデックス付きのレコードとして保存し、属性の完全な履歴をクエリできるようにします。

## テンポラルデータのクエリ

### NGSI-LD テンポラルエンティティ

```bash
# エンティティのテンポラル履歴を取得
curl -G https://api.vela.geolonia.com/ngsi-ld/v1/temporal/entities/urn:ngsi-ld:Room:001 \
  --data-urlencode "timerel=between" \
  --data-urlencode "timeAt=2026-01-01T00:00:00Z" \
  --data-urlencode "endTimeAt=2026-01-31T23:59:59Z" \
  -H "NGSILD-Tenant: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### レスポンス

```json
{
  "id": "urn:ngsi-ld:Room:001",
  "type": "Room",
  "temperature": [
    {
      "type": "Property",
      "value": 22.5,
      "observedAt": "2026-01-15T08:00:00Z"
    },
    {
      "type": "Property",
      "value": 23.1,
      "observedAt": "2026-01-15T09:00:00Z"
    },
    {
      "type": "Property",
      "value": 24.0,
      "observedAt": "2026-01-15T10:00:00Z"
    }
  ]
}
```

## 時間クエリパラメータ

| パラメータ | 説明 | 例 |
|-----------|------|-----|
| `timerel` | 時間的関係 | `before`、`after`、`between` |
| `timeAt` | 基準時点 | `2026-01-01T00:00:00Z` |
| `endTimeAt` | 終了時点（`between` の場合必須） | `2026-01-31T23:59:59Z` |
| `timeproperty` | 使用する時間プロパティ | `observedAt`（デフォルト） |
| `attrs` | 特定の属性にフィルタ | `temperature,humidity` |
| `lastN` | 最新の N 件のみ返却 | `10` |

### 時間的関係

| `timerel` | 説明 |
|-----------|------|
| `before` | `timeAt` より前のレコード |
| `after` | `timeAt` より後のレコード |
| `between` | `timeAt` から `endTimeAt` の間のレコード |

## 複数エンティティのクエリ

```bash
# すべての Room エンティティのテンポラルデータを取得
curl -G https://api.vela.geolonia.com/ngsi-ld/v1/temporal/entities \
  --data-urlencode "type=Room" \
  --data-urlencode "timerel=after" \
  --data-urlencode "timeAt=2026-01-15T00:00:00Z" \
  --data-urlencode "attrs=temperature" \
  --data-urlencode "lastN=5" \
  -H "NGSILD-Tenant: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## 属性によるフィルタリング

特定の属性の履歴のみを取得：

```bash
curl -G https://api.vela.geolonia.com/ngsi-ld/v1/temporal/entities/urn:ngsi-ld:Room:001 \
  --data-urlencode "attrs=temperature,humidity" \
  --data-urlencode "timerel=after" \
  --data-urlencode "timeAt=2026-01-15T00:00:00Z" \
  -H "NGSILD-Tenant: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## TTL（Time-to-Live）

Vela OS はストレージの増大を管理するために、テンポラルデータの TTL 設定をサポートしています。設定された TTL を超えたテンポラルレコードは自動的にパージされます。

### 設定

TTL はテナントレベルで設定されます。保持期間を超えたレコードは MongoDB の TTL インデックスにより自動的にクリーンアップされます。

> **注:** Vela OS SaaS では、TTL は管理者によってテナントレベルで管理されます。TTL 設定の詳細については、[Admin API ドキュメント](/ja/api-reference/admin)を参照してください。

### ユースケース

| TTL 設定 | シナリオ |
|----------|---------|
| 24時間 | 最新データのみのリアルタイムダッシュボード |
| 7日間 | 週次トレンド分析 |
| 30日間 | 月次レポート |
| 365日間 | 年次コンプライアンス監査 |

## ユースケース

### 温度トレンド分析

```bash
# 過去24時間の時間ごとの温度データを取得
curl -G https://api.vela.geolonia.com/ngsi-ld/v1/temporal/entities/urn:ngsi-ld:Room:001 \
  --data-urlencode "attrs=temperature" \
  --data-urlencode "timerel=after" \
  --data-urlencode "timeAt=2026-01-14T10:00:00Z" \
  -H "NGSILD-Tenant: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### 監査証跡

Temporal API はエンティティ変更の完全な監査証跡を提供し、データの来歴と変更履歴を証明する必要があるコンプライアンス要件に適しています。

### IoT センサーデータ

IoT アプリケーションでは、Temporal API がセンサーの読み取り値を時系列で保存し、以下を実現します：

- 履歴分析とレポート
- 現在の値と過去のベースラインの比較による異常検出
- 機械学習モデルのトレーニング用データエクスポート
