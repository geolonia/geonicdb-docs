---
title: クイックスタート
description: Vela OS SaaS API を数分で使い始める — エンティティの作成、取得、更新、削除。
outline: deep
---

# クイックスタート

このガイドでは、Vela OS SaaS エンドポイントへの最初の API コールを紹介します。インストール不要 — `curl` が使えるターミナルだけで始められます。

## 前提条件

- `curl` がインストールされたターミナル
- Vela OS SaaS の API キー

::: tip 準備中
API キーの登録機能は現在準備中です。利用可能になり次第、Vela OS ダッシュボードからキーを取得できるようになります。
:::

## ステップ 1: 接続確認

API エンドポイントに到達できるか確認します：

```bash
curl https://api.vela.geolonia.com/version
```

期待されるレスポンス：

```json
{
  "orion": {
    "version": "4.1.0",
    "uptime": "..."
  }
}
```

## ステップ 2: エンティティの作成

NGSIv2 API を使って温度センサーエンティティを作成します：

```bash
curl -X POST https://api.vela.geolonia.com/v2/entities \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: myproject" \
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

作成に成功すると `Location` ヘッダー付きで **201 Created** が返されます。

::: info Fiware-Service について
`Fiware-Service` ヘッダーはテナント識別子として機能します。テナント間でデータは完全に分離されます。プロジェクトに合わせて任意の名前を指定してください（例：`myproject`、`smartcity`）。
:::

## ステップ 3: エンティティの取得

作成したエンティティを読み取ります：

```bash
curl https://api.vela.geolonia.com/v2/entities/urn:ngsi-ld:TemperatureSensor:001 \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: myproject"
```

期待されるレスポンス：

```json
{
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
}
```

## ステップ 4: エンティティの更新

温度の値を更新します：

```bash
curl -X PATCH https://api.vela.geolonia.com/v2/entities/urn:ngsi-ld:TemperatureSensor:001/attrs \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: myproject" \
  -d '{
    "temperature": {
      "type": "Number",
      "value": 25.0
    }
  }'
```

更新に成功すると **204 No Content** が返されます。

更新を確認：

```bash
curl https://api.vela.geolonia.com/v2/entities/urn:ngsi-ld:TemperatureSensor:001/attrs/temperature \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: myproject"
```

```json
{
  "type": "Number",
  "value": 25.0,
  "metadata": {
    "unit": { "type": "Text", "value": "CEL" }
  }
}
```

## ステップ 5: エンティティの削除

エンティティを削除します：

```bash
curl -X DELETE https://api.vela.geolonia.com/v2/entities/urn:ngsi-ld:TemperatureSensor:001 \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: myproject"
```

削除に成功すると **204 No Content** が返されます。

## ステップ 6: NGSI-LD を試す（オプション）

Vela は NGSIv2 と並行して NGSI-LD もサポートしています。NGSI-LD API で同じエンティティを作成してみましょう：

```bash
curl -X POST https://api.vela.geolonia.com/ngsi-ld/v1/entities \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: myproject" \
  -d '{
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
  }'
```

どちらの API からでも取得できます：

```bash
# NGSI-LD 経由
curl https://api.vela.geolonia.com/ngsi-ld/v1/entities/urn:ngsi-ld:TemperatureSensor:001 \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: myproject"

# NGSIv2 経由（クロス API アクセス）
curl https://api.vela.geolonia.com/v2/entities/urn:ngsi-ld:TemperatureSensor:001 \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: myproject"
```

両方の API が同じエンティティを返し、リクエストされた形式に自動変換されます。

## 次のステップ

- [セットアップ](/ja/getting-started/installation) — API アクセスの詳細と推奨ツール
- [はじめてのエンティティ](/ja/getting-started/first-entity) — サブスクリプションを含む詳細な CRUD チュートリアル
- [デモアプリ](/ja/getting-started/demo-app) — インタラクティブなデモアプリケーション
- [NGSIv2 API リファレンス](/ja/api-reference/ngsiv2) — 完全な API ドキュメント
