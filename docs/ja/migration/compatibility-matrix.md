---
title: 互換性マトリクス
description: FIWARE Orion と Vela OS の詳細な互換性マトリクス。NGSIv2、NGSI-LD、地理空間、サブスクリプション、認証 API をカバー。
outline: deep
---

# 互換性マトリクス

このページでは、**FIWARE Orion**（NGSIv2）/ **Orion-LD**（NGSI-LD）と **Vela OS** の API 互換性を詳細に比較します。

## 概要

| 項目 | Vela OS | FIWARE Orion |
|------|---------|-------------|
| **実装言語** | TypeScript / Node.js | C++ |
| **アーキテクチャ** | サーバーレス（AWS Lambda） | モノリシック（Docker） |
| **データベース** | MongoDB Atlas | MongoDB |
| **ライセンス** | GPL v3.0 | AGPL v3.0 |
| **対応 API** | NGSIv2 + NGSI-LD | NGSIv2（Orion）/ NGSI-LD（Orion-LD） |
| **スケーリング** | 自動（Lambda） | 手動（コンテナ） |

## NGSIv2 API 互換性

すべての標準 NGSIv2 エンドポイントを完全サポート:

| エンドポイント | Vela | Orion | 備考 |
|---------------|:----:|:-----:|------|
| `POST /v2/entities` | ✅ | ✅ | エンティティ作成 |
| `GET /v2/entities` | ✅ | ✅ | エンティティ一覧 |
| `GET /v2/entities/{id}` | ✅ | ✅ | エンティティ取得 |
| `DELETE /v2/entities/{id}` | ✅ | ✅ | エンティティ削除 |
| `PATCH /v2/entities/{id}/attrs` | ✅ | ✅ | 属性更新 |
| `POST /v2/entities/{id}/attrs` | ✅ | ✅ | 属性追加 |
| `PUT /v2/entities/{id}/attrs` | ✅ | ✅ | 属性置換 |
| `GET /v2/entities/{id}/attrs/{attr}` | ✅ | ✅ | 属性取得 |
| `PUT /v2/entities/{id}/attrs/{attr}` | ✅ | ✅ | 属性更新 |
| `DELETE /v2/entities/{id}/attrs/{attr}` | ✅ | ✅ | 属性削除 |
| `GET /v2/entities/{id}/attrs/{attr}/value` | ✅ | ✅ | 属性値直接取得 |
| `PUT /v2/entities/{id}/attrs/{attr}/value` | ✅ | ✅ | 属性値直接更新 |
| `POST /v2/op/update` | ✅ | ✅ | バッチ更新 |
| `POST /v2/op/query` | ✅ | ✅ | バッチクエリ |
| `POST /v2/op/notify` | ✅ | ✅ | 通知受信 |
| `GET /v2/types` | ✅ | ✅ | タイプ一覧 |
| `GET /v2/types/{type}` | ✅ | ✅ | タイプ詳細 |
| サブスクリプション CRUD | ✅ | ✅ | 完全ライフサイクル |
| 登録 CRUD | ✅ | ✅ | 完全ライフサイクル |
| `GET /version` | ✅ | ✅ | バージョン情報 |

## NGSI-LD API 互換性

| エンドポイント | Vela | Orion-LD | 備考 |
|---------------|:----:|:--------:|------|
| エンティティ CRUD | ✅ | ✅ | 作成・取得・更新・削除 |
| バッチ操作 | ✅ | ✅ | create, upsert, update, delete, query |
| サブスクリプション CRUD | ✅ | ✅ | 完全ライフサイクル |
| CSR CRUD | ✅ | ✅ | Context Source Registration |
| `POST /ngsi-ld/v1/csourceSubscriptions` | ✅ | ❌ | CSR サブスクリプション（Vela のみ） |
| Temporal API | ✅ | ⚠️ | Orion-LD では制限あり |
| JSON-LD コンテキスト管理 | ✅ | ✅ | `/ngsi-ld/v1/jsonldContexts` |
| EntityMap 操作 | ✅ | ❌ | Vela のみ |
| スナップショット操作 | ✅ | ❌ | Vela のみ |
| ベクトルタイル | ✅ | ❌ | Vela のみ |

## クエリ機能

| 機能 | Vela | Orion | 備考 |
|------|:----:|:-----:|------|
| Simple Query Language（`q`） | ✅ | ✅ | |
| 比較演算子 | ✅ | ✅ | `==`, `!=`, `<`, `>`, `<=`, `>=` |
| 論理演算子 | ✅ | ✅ | `;`（AND）、`\|`（OR） |
| 範囲クエリ（`..`） | ✅ | ✅ | |
| パターンマッチ（`~=`） | ✅ | ✅ | 正規表現対応 |
| `idPattern` | ✅ | ✅ | 正規表現 |
| `typePattern` | ✅ | ✅ | 正規表現 |
| スコープクエリ（`scopeQ`） | ✅ | ✅ | NGSI-LD 階層スコーピング |
| ページネーション | ✅ | ✅ | リクエストあたり最大1,000件 |
| 出力形式 | ✅ | ✅ | `keyValues`, `values`, `unique` |
| 属性選択（`attrs`） | ✅ | ✅ | |
| ソート（`orderBy`） | ✅ | ✅ | |

## 地理空間機能

| 機能 | Vela | Orion | 備考 |
|------|:----:|:-----:|------|
| `georel=near` | ✅ | ✅ | Point ジオメトリのみ |
| `georel=within` | ✅ | ✅ | |
| `georel=coveredBy` | ✅ | ✅ | |
| `georel=intersects` | ✅ | ✅ | |
| `georel=disjoint` | ✅ | ✅ | |
| `georel=equals` | ✅ | ✅ | |
| `georel=contains` | ✅ | ✅ | |
| GeoJSON 出力 | ✅ | ✅ | `options=geojson` |
| ベクトルタイル | ✅ | ❌ | TileJSON 3.0 |
| 空間ID（ZFXY） | ✅ | ❌ | デジタル庁標準 |

## サブスクリプション / 通知機能

| 機能 | Vela | Orion | 備考 |
|------|:----:|:-----:|------|
| HTTP Webhook | ✅ | ✅ | |
| MQTT | ✅ | ✅ | |
| WebSocket ストリーミング | ✅ | ❌ | Vela のみ |
| カスタムヘッダー | ✅ | ✅ | |
| カスタムペイロードテンプレート | ✅ | ✅ | マクロ置換対応 |
| `httpCustom.json` | ❌ | ✅ | Vela で対応予定 |
| `httpCustom.ngsi` | ❌ | ✅ | Vela で対応予定 |
| JEXL 式 | ❌ | ✅ | Vela で対応予定 |
| スロットリング | ✅ | ✅ | |
| 有効期限 | ✅ | ✅ | |
| `onlyChangedAttrs` | ✅ | ✅ | |
| 順序保証配信 | ✅（SQS FIFO） | ⚠️ | Orion では制限あり |
| Dead Letter Queue | ✅ | ❌ | Vela のみ |

## 認証 / 認可

| 機能 | Vela | Orion | 備考 |
|------|:----:|:-----:|------|
| 組み込み JWT 認証 | ✅ | ❌ | |
| RBAC（ロール） | ✅ | ❌ | super_admin, tenant_admin, user |
| OIDC 外部 IdP | ✅ | ❌ | |
| XACML ポリシー | ✅ | ❌ | |
| Keyrock IdM | ⚠️ | ✅ | API 互換（未検証） |
| Wilma PEP Proxy | ⚠️ | ✅ | API 互換（未検証） |
| マルチテナンシーヘッダー | ✅ | ✅ | Fiware-Service / Fiware-ServicePath |

## Vela 独自機能

以下の機能は Vela OS でのみ利用可能です:

| 機能 | 説明 |
|------|------|
| MCP サーバー | Model Context Protocol エンドポイント（`POST /mcp`） |
| llms.txt | LLM 向け最適化 API ドキュメント（`GET /`） |
| tools.json | AI ツール定義（`GET /tools.json`） |
| 空間ID（ZFXY） | 3D 空間識別 |
| ベクトルタイル | TileJSON 3.0 GeoJSON タイル |
| CADDE 連携 | 分野間データ連携基盤 |
| DCAT-AP カタログ | EU データポータル標準 |
| CKAN 互換 API | オープンデータポータル連携 |
| WebSocket ストリーミング | リアルタイムエンティティ変更イベント |
| スナップショット | ポイントインタイム・エンティティスナップショット |
| EntityMap | エンティティマッピング・変換 |
| Dead Letter Queue | 失敗通知の隔離 |

## 次のステップ

- [Orion から Vela への移行ガイド](/ja/migration/orion-to-vela) — ステップバイステップの移行手順
