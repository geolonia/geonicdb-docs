---
title: Orion から Vela への移行ガイド
description: セルフホスト型 FIWARE Orion から Vela OS SaaS への移行手順。API エンドポイント、認証、サブスクリプション、データ移行をカバー。
outline: deep
---

# Orion から Vela への移行ガイド

このガイドでは、セルフホスト型の **FIWARE Orion**（または Orion-LD）から **Vela OS SaaS** への移行手順を説明します。Vela は Orion と API 互換のため、ほとんどのアプリケーションはエンドポイント URL と認証設定の変更で移行できます。

## 移行の概要

| ステップ | 作業 | 影響度 |
|---------|------|--------|
| 1 | API エンドポイント URL の更新 | 低 — 設定変更のみ |
| 2 | 認証の設定 | 中 — リクエストに Bearer トークンを追加 |
| 3 | サブスクリプションの移行 | 中 — 新エンドポイントで再作成 |
| 4 | エンティティデータの移行 | 可変 — データ量に依存 |
| 5 | 検証とカットオーバー | 低 — 機能テスト |

## ステップ 1: API エンドポイントの更新

Orion のエンドポイント URL を Vela SaaS のエンドポイントに置き換えます:

### NGSIv2

| 移行前（Orion） | 移行後（Vela SaaS） |
|----------------|-------------------|
| `http://orion:1026/v2/entities` | `https://api.vela.geolonia.com/v2/entities` |
| `http://orion:1026/v2/subscriptions` | `https://api.vela.geolonia.com/v2/subscriptions` |
| `http://orion:1026/v2/registrations` | `https://api.vela.geolonia.com/v2/registrations` |
| `http://orion:1026/v2/types` | `https://api.vela.geolonia.com/v2/types` |
| `http://orion:1026/v2/op/update` | `https://api.vela.geolonia.com/v2/op/update` |
| `http://orion:1026/v2/op/query` | `https://api.vela.geolonia.com/v2/op/query` |

### NGSI-LD

| 移行前（Orion-LD） | 移行後（Vela SaaS） |
|-------------------|-------------------|
| `http://orion-ld:1026/ngsi-ld/v1/entities` | `https://api.vela.geolonia.com/ngsi-ld/v1/entities` |
| `http://orion-ld:1026/ngsi-ld/v1/subscriptions` | `https://api.vela.geolonia.com/ngsi-ld/v1/subscriptions` |

## ステップ 2: 認証の設定

Vela SaaS は認証が必要です。すべてのリクエストに `Authorization` ヘッダーを追加してください:

```bash
# 移行前（Orion — 認証なし）
curl http://orion:1026/v2/entities

# 移行後（Vela SaaS — Bearer トークン）
curl https://api.vela.geolonia.com/v2/entities \
  -H "Authorization: Bearer YOUR_API_KEY"
```

マルチテナンシー用の `Fiware-Service` / `Fiware-ServicePath` ヘッダーは従来通り使用できます:

```bash
curl https://api.vela.geolonia.com/v2/entities \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Fiware-Service: my-tenant" \
  -H "Fiware-ServicePath: /sensors"
```

## ステップ 3: サブスクリプションの移行

Orion のサブスクリプションは直接転送できません。Vela 上で再作成する必要があります。サブスクリプション形式は互換性があるため、同じペイロードを使用できます。

### 既存サブスクリプションのエクスポート

```bash
# Orion からエクスポート
curl http://orion:1026/v2/subscriptions | jq '.' > subscriptions.json
```

### Vela で再作成

```bash
# subscriptions.json の各サブスクリプションについて
curl -X POST https://api.vela.geolonia.com/v2/subscriptions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d @subscriptions.json
```

::: tip 通知先 URL の確認
通知エンドポイント（Webhook URL）がインターネットからアクセス可能であることを確認してください。Vela SaaS はローカルネットワークではなく AWS インフラから通知を送信します。
:::

## ステップ 4: エンティティデータの移行

### 小規模データセット（10,000件未満）

小規模データセットの場合、バッチ操作でエクスポート・再インポート:

```bash
# Orion からエクスポート（ページネーション）
curl "http://orion:1026/v2/entities?limit=1000&offset=0" > entities_batch1.json
curl "http://orion:1026/v2/entities?limit=1000&offset=1000" > entities_batch2.json
# ... 全エンティティのエクスポートが完了するまで続行

# Vela にバッチアップデートでインポート
curl -X POST https://api.vela.geolonia.com/v2/op/update \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "actionType": "append",
    "entities": '"$(cat entities_batch1.json)"'
  }'
```

### 大規模データセット（10,000件以上）

大規模データセットの場合、MongoDB から直接エクスポートし、Vela チームと連携してバルクインポートを行ってください。

## ステップ 5: 検証とカットオーバー

移行後の確認事項:

1. **エンティティデータ**: 主要エンティティをクエリし属性を比較
2. **サブスクリプション**: テスト更新をトリガーし通知配信を確認
3. **ジオクエリ**: 使用している場合は位置ベースクエリをテスト
4. **マルチテナンシー**: テナント分離が正しく機能することを確認

### チェックリスト

- [ ] すべてのエンティティタイプが存在
- [ ] エンティティ数が一致
- [ ] サブスクリプションが通知を受信
- [ ] ジオクエリが正しい結果を返却
- [ ] すべてのサービスアカウントで認証が機能
- [ ] アプリケーションのエンドポイントが Vela SaaS URL に更新済み

## Orion との主な違い

| 機能 | FIWARE Orion | Vela SaaS |
|------|-------------|-----------|
| ホスティング | セルフホスト（Docker） | マネージド SaaS |
| 認証 | 外部（Keyrock + Wilma） | 組み込み JWT |
| デュアル API | Orion（v2）または Orion-LD（LD） | 両方同時対応 |
| 通知 | HTTP, MQTT | HTTP, MQTT, WebSocket |
| AI 連携 | なし | MCP, llms.txt, tools.json |
| スケーリング | 手動（コンテナ） | 自動（Lambda） |

## 次のステップ

- [互換性マトリクス](/ja/migration/compatibility-matrix) — 詳細な API 互換性比較
