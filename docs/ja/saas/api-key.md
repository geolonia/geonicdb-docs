---
title: API キー
description: GeonicDB SaaS の API キーの取得方法と API 認証への使い方。
outline: deep
---

# API キー

GeonicDB SaaS へのすべての API リクエストには API キーによる認証が必要です。このページでは、キーの取得・使い方・管理方法を説明します。

## API キーの取得方法

GeonicDB SaaS の API キーは、オンボーディング時に Geolonia から発行されます。

::: info コンソールはまだ利用できません
セルフサービスの API キー管理コンソール（`app.geonicdb.com`）は現在 **Coming Soon** です。プレビュー期間中は、キーは Geolonia のアカウント担当者から直接提供されます。
:::

**API キーを取得するには：**

1. [https://www.geolonia.com/contact/](https://www.geolonia.com/contact/) でアカウントを申請
2. アカウントがプロビジョニングされると、招待メールで初期 API キーが提供されます
3. キーは安全な場所に保管してください — 初回発行後は再表示されません

**キーのローテーションや新規発行が必要な場合：**

[https://www.geolonia.com/contact/](https://www.geolonia.com/contact/) から Geolonia のアカウント担当者にお問い合わせください。

## API キーの使い方

すべての API 呼び出しで、`x-api-key` リクエストヘッダーに API キーを含めてください：

```bash
curl -X GET "https://geonicdb.geolonia.com/v2/entities" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: YOUR_TENANT"
```

::: info API URL について
GeonicDB SaaS の API エンドポイント `https://geonicdb.geolonia.com` は、現在のプレビュー期間中に変更される場合があります。変更がある場合はアカウント担当者からご連絡いたします。
:::

### 必須ヘッダー

| ヘッダー | 説明 | 例 |
|---------|------|-----|
| `x-api-key` | GeonicDB API キー | `x-api-key: gdb_live_...` |
| `Fiware-Service` | テナント名 | `Fiware-Service: my-company` |
| `Fiware-ServicePath` | スコープパス（省略可、デフォルト `/`） | `Fiware-ServicePath: /sensors` |

### 例：エンティティの作成

```bash
curl -X POST "https://geonicdb.geolonia.com/v2/entities" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: YOUR_TENANT" \
  -d '{
    "id": "urn:ngsi-ld:Sensor:001",
    "type": "Sensor",
    "temperature": {
      "type": "Number",
      "value": 22.5
    }
  }'
```

## API キーのスコープ

GeonicDB API キーは以下の権限レベルをサポートします：

| スコープ | 権限 |
|---------|------|
| `read` | GET 操作のみ（エンティティ・通知設定の一覧・取得） |
| `readwrite` | エンティティと通知設定に対する GET / POST / PATCH / PUT / DELETE |
| `admin` | テナント設定を含むフルアクセス |

キースコープはプロビジョニング時に Geolonia のアカウント担当者が設定します。新規アカウントのデフォルトは `readwrite` スコープです。

## セキュリティのベストプラクティス

- **API キーをバージョン管理にコミットしない**こと
- **環境変数**を使ってランタイムにキーを注入する：
  ```bash
  export GEONICDB_API_KEY="YOUR_API_KEY"
  curl -H "x-api-key: $GEONICDB_API_KEY" ...
  ```
- **定期的にキーをローテーション** — 交替キーの発行はアカウント担当者に依頼
- データの参照のみが必要な公開向けアプリケーションには**読み取り専用キー**を使用
- キーが漏洩した場合は**直ちに無効化** — Geolonia にご連絡ください

## トラブルシューティング

| エラー | 原因 | 対処法 |
|--------|------|--------|
| `401 Unauthorized` | `x-api-key` ヘッダーが欠損または無効 | キーの値とヘッダー名を確認 |
| `403 Forbidden` | 要求された操作に必要な権限がキーにない | 必要なスコープを持つキーを申請 |
| `404 Not Found` | テナントが見つからない、またはキーがテナントに紐付いていない | `Fiware-Service` ヘッダーがテナント名と一致しているか確認 |

## 次のステップ

- [最初の API 呼び出し](/ja/saas/first-call) — 複数言語のコードサンプル付き詳細ガイド
- [最初のエンティティ](/ja/saas/first-entity) — CRUD 操作のステップバイステップ
- [コンソール](/ja/saas/console) — コンソールの概要（Coming Soon）
