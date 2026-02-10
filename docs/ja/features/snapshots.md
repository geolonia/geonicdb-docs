---
title: スナップショット
description: Vela OS でエンティティデータのポイントインタイムスナップショットを作成・復元する方法。
outline: deep
---

# スナップショット

Vela OS はエンティティデータのポイントインタイムコピーをキャプチャ・復元できる **スナップショット** 機能を提供します。スナップショットはバックアップ、テスト、データ移行、ロールバックのシナリオで活用できます。

## 概要

スナップショットは、特定の時点におけるテナント内のエンティティの現在の状態をキャプチャします。オンデマンドでスナップショットを作成し、後でそれを復元してエンティティを以前の状態に戻すことができます。

## スナップショットの作成

```bash
curl -X POST https://api.vela.geolonia.com/v2/snapshots \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "description": "デプロイ前のバックアップ"
  }'
```

**レスポンス：**

```json
{
  "id": "snapshot_2026-01-15T10-00-00Z",
  "description": "デプロイ前のバックアップ",
  "createdAt": "2026-01-15T10:00:00Z",
  "entityCount": 1250,
  "status": "completed"
}
```

## スナップショットの一覧

```bash
curl https://api.vela.geolonia.com/v2/snapshots \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**レスポンス：**

```json
[
  {
    "id": "snapshot_2026-01-15T10-00-00Z",
    "description": "デプロイ前のバックアップ",
    "createdAt": "2026-01-15T10:00:00Z",
    "entityCount": 1250,
    "status": "completed"
  },
  {
    "id": "snapshot_2026-01-10T08-00-00Z",
    "description": "週次バックアップ",
    "createdAt": "2026-01-10T08:00:00Z",
    "entityCount": 1180,
    "status": "completed"
  }
]
```

## スナップショットの復元

```bash
curl -X POST https://api.vela.geolonia.com/v2/snapshots/snapshot_2026-01-15T10-00-00Z/restore \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**レスポンス：**

```json
{
  "id": "snapshot_2026-01-15T10-00-00Z",
  "status": "restoring",
  "restoredEntities": 1250
}
```

::: warning
スナップショットを復元すると、現在のエンティティデータがスナップショットデータで置き換えられます。スナップショット作成後に行われた変更は失われます。復元前に新しいスナップショットを作成することを検討してください。
:::

## スナップショットの削除

```bash
curl -X DELETE https://api.vela.geolonia.com/v2/snapshots/snapshot_2026-01-15T10-00-00Z \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## エンドポイント一覧

| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/v2/snapshots` | 新しいスナップショットを作成 |
| GET | `/v2/snapshots` | すべてのスナップショットを一覧 |
| GET | `/v2/snapshots/{snapshotId}` | スナップショットの詳細を取得 |
| POST | `/v2/snapshots/{snapshotId}/restore` | スナップショットを復元 |
| DELETE | `/v2/snapshots/{snapshotId}` | スナップショットを削除 |

## ユースケース

### デプロイ前のバックアップ

エンティティデータを変更するアプリケーション変更をデプロイする前にスナップショットを作成：

```bash
# デプロイ前
curl -X POST https://api.vela.geolonia.com/v2/snapshots \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"description": "デプロイ前: v2.1.0"}'

# 問題が発生した場合、復元
curl -X POST https://api.vela.geolonia.com/v2/snapshots/snapshot_2026-01-15T10-00-00Z/restore \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### 本番データでのテスト

本番データのスナップショットを作成し、テストテナントで復元して現実的なテストシナリオを実現します。

### データ移行

データ移行スクリプトを実行する前に現在の状態をスナップショットし、移行で問題が発生した場合のロールバックを可能にします。

## マルチテナンシー

スナップショットは `Fiware-Service` ヘッダーで指定されたテナントにスコープされます。各テナントは独立してスナップショットを管理し、データの分離が保証されます。
