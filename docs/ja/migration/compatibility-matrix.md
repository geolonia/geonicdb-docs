---
title: "互換性マトリクス"
description: "FIWARE Orion との互換性比較"
outline: deep
---
# GeonicDB vs FIWARE Orion 機能比較表

本ドキュメントでは、GeonicDB と FIWARE Orion Context Broker の機能を比較します。

## 概要

| 項目 | GeonicDB | FIWARE Orion |
|------|-------------------|--------------|
| **実装言語** | TypeScript/Node.js | C++ |
| **アーキテクチャ** | サーバーレス (AWS Lambda) | モノリシック (Docker) |
| **データベース** | MongoDB Atlas | MongoDB |
| **ライセンス** | AGPL v3.0 | AGPL v3.0 |
| **対応API** | NGSIv2 + NGSI-LD | NGSIv2 (Orion) / NGSI-LD (Orion-LD) |
| **スケーラビリティ** | 自動スケーリング (Lambda) | 手動スケーリング (コンテナ) |
| **コスト** | 従量課金 | 固定インフラコスト |

## API 対応状況

### NGSIv2 API

| 機能 | GeonicDB | FIWARE Orion | 備考 |
|------|:------------------:|:------------:|------|
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
| `GET /v2/types` | ✅ | ✅ | エンティティタイプ一覧 |
| `GET /v2/types/{type}` | ✅ | ✅ | エンティティタイプ取得 |
| `POST /v2/subscriptions` | ✅ | ✅ | サブスクリプション作成 |
| `GET /v2/subscriptions` | ✅ | ✅ | サブスクリプション一覧 |
| `GET /v2/subscriptions/{id}` | ✅ | ✅ | サブスクリプション取得 |
| `PATCH /v2/subscriptions/{id}` | ✅ | ✅ | サブスクリプション更新 |
| `DELETE /v2/subscriptions/{id}` | ✅ | ✅ | サブスクリプション削除 |
| `POST /v2/registrations` | ✅ | ✅ | 登録作成 |
| `GET /v2/registrations` | ✅ | ✅ | 登録一覧 |
| `GET /v2/registrations/{id}` | ✅ | ✅ | 登録取得 |
| `PATCH /v2/registrations/{id}` | ✅ | ✅ | 登録更新 |
| `DELETE /v2/registrations/{id}` | ✅ | ✅ | 登録削除 |
| `GET /version` | ✅ | ✅ | バージョン情報 |

### NGSI-LD API

| 機能 | GeonicDB | FIWARE Orion-LD | 備考 |
|------|:------------------:|:---------------:|------|
| `POST /ngsi-ld/v1/entities` | ✅ | ✅ | エンティティ作成 |
| `GET /ngsi-ld/v1/entities` | ✅ | ✅ | エンティティ一覧 |
| `GET /ngsi-ld/v1/entities/{id}` | ✅ | ✅ | エンティティ取得 |
| `PUT /ngsi-ld/v1/entities/{id}` | ✅ | ✅ | エンティティ置換 |
| `PATCH /ngsi-ld/v1/entities/{id}` | ✅ | ✅ | エンティティ更新(merge-patch+json 対応、urn:ngsi-ld:null、keyValues/concise 入力) |
| `POST /ngsi-ld/v1/entities/{id}` | ✅ | ✅ | 属性追加 |
| `DELETE /ngsi-ld/v1/entities/{id}` | ✅ | ✅ | エンティティ削除 |
| `GET /ngsi-ld/v1/entities/{id}/attrs` | ✅ | ✅ | 全属性取得 |
| `GET /ngsi-ld/v1/entities/{id}/attrs/{attr}` | ✅ | ✅ | 属性取得 |
| `POST /ngsi-ld/v1/entities/{id}/attrs/{attr}` | ✅ | ✅ | 属性置換 |
| `PATCH /ngsi-ld/v1/entities/{id}/attrs/{attr}` | ✅ | ✅ | 属性部分更新 |
| `DELETE /ngsi-ld/v1/entities/{id}/attrs/{attr}` | ✅ | ✅ | 属性削除 |
| `POST /ngsi-ld/v1/entityOperations/create` | ✅ | ✅ | バッチ作成 |
| `POST /ngsi-ld/v1/entityOperations/upsert` | ✅ | ✅ | バッチ作成/更新 |
| `POST /ngsi-ld/v1/entityOperations/update` | ✅ | ✅ | バッチ更新 |
| `POST /ngsi-ld/v1/entityOperations/delete` | ✅ | ✅ | バッチ削除 |
| `POST /ngsi-ld/v1/entityOperations/query` | ✅ | ✅ | バッチクエリ |
| `POST /ngsi-ld/v1/subscriptions` | ✅ | ✅ | サブスクリプション作成 |
| `GET /ngsi-ld/v1/subscriptions` | ✅ | ✅ | サブスクリプション一覧 |
| `GET /ngsi-ld/v1/subscriptions/{id}` | ✅ | ✅ | サブスクリプション取得 |
| `PATCH /ngsi-ld/v1/subscriptions/{id}` | ✅ | ✅ | サブスクリプション更新 |
| `DELETE /ngsi-ld/v1/subscriptions/{id}` | ✅ | ✅ | サブスクリプション削除 |
| `POST /ngsi-ld/v1/csourceRegistrations` | ✅ | ✅ | 登録作成 |
| `GET /ngsi-ld/v1/csourceRegistrations` | ✅ | ✅ | 登録一覧 |
| `GET /ngsi-ld/v1/csourceRegistrations/{id}` | ✅ | ✅ | 登録取得 |
| `PATCH /ngsi-ld/v1/csourceRegistrations/{id}` | ✅ | ✅ | 登録更新 |
| `DELETE /ngsi-ld/v1/csourceRegistrations/{id}` | ✅ | ✅ | 登録削除 |
| `POST /ngsi-ld/v1/csourceSubscriptions` | ✅ | ❌ | CSR サブスクリプション作成 (※) |
| `GET /ngsi-ld/v1/csourceSubscriptions` | ✅ | ❌ | CSR サブスクリプション一覧 (※) |
| `GET /ngsi-ld/v1/csourceSubscriptions/{id}` | ✅ | ❌ | CSR サブスクリプション取得 (※) |
| `PATCH /ngsi-ld/v1/csourceSubscriptions/{id}` | ✅ | ❌ | CSR サブスクリプション更新 (※) |
| `DELETE /ngsi-ld/v1/csourceSubscriptions/{id}` | ✅ | ❌ | CSR サブスクリプション削除 (※) |
| `GET /ngsi-ld/v1/attributes` | ✅ | ✅ | 属性一覧 |
| `GET /ngsi-ld/v1/attributes/{attrName}` | ✅ | ✅ | 属性詳細 |
| `GET /.well-known/ngsi-ld` | ✅ | ✅ | API ディスカバリー |
| JSON-LD @context サポート | ✅ | ✅ | Linked Data コンテキスト |
| **Temporal API** | ✅ | ⚠️ 制限あり | 時系列データ管理 |
| **JSON-LD コンテキスト管理** | ✅ | ✅ | `/ngsi-ld/v1/jsonldContexts` |
| **EntityMap 操作** | ✅ | ❌ | エンティティマッピング・変換 |
| **スナップショット操作** | ✅ | ❌ | ポイントインタイム・スナップショット |
| **適合性情報** | ✅ | ✅ | `/ngsi-ld/v1/info/conformance` |
| **ソースアイデンティティ** | ✅ | ✅ | `/ngsi-ld/v1/info/sourceIdentity` |
| **ベクトルタイル** | ✅ | ❌ | `/ngsi-ld/v1/tiles` GeoJSON ベクトルタイル |

> **※ csourceSubscriptions について**
> Context Source Registration (CSR) のサブスクリプション機能は ETSI GS CIM 009 仕様で定義されています。GeonicDB は仕様準拠の実装を提供していますが、Orion-LD では現在未実装です(実装予定、参照: [Orion-LD Issue #280](https://github.com/FIWARE/context.Orion-LD/issues/280))。

### NGSI-LD 属性タイプ

| 機能 | GeonicDB | FIWARE Orion-LD | 備考 |
|------|:------------------:|:---------------:|------|
| Property | ✅ | ✅ | 基本属性 |
| Relationship | ✅ | ✅ | エンティティ間関連 |
| GeoProperty | ✅ | ✅ | 地理空間属性 |
| LanguageProperty | ✅ | ✅ | 多言語属性 |
| JsonProperty | ✅ | ✅ | JSON 値属性 |
| VocabProperty | ✅ | ✅ | 語彙属性(vocab/vocabMap) |
| ListProperty | ✅ | ✅ | リスト値属性 |
| ListRelationship | ✅ | ✅ | リスト関連属性 |
| TemporalProperty | ✅ | ✅ | 時間属性 |
| **Multi-attribute** | ✅ | ✅ | datasetId による複数インスタンス |
| `datasetId` クエリパラメータ | ✅ | ✅ | 特定インスタンスの削除 |
| `deleteAll` クエリパラメータ | ✅ | ✅ | 全インスタンスの削除 |

### NGSI-LD 出力形式

| 機能 | GeonicDB | FIWARE Orion-LD | 備考 |
|------|:------------------:|:---------------:|------|
| normalized | ✅ | ✅ | 完全形式(デフォルト) |
| concise | ✅ | ✅ | 簡潔形式(type を省略) |
| keyValues / simplified | ✅ | ✅ | 値のみ |

## クエリ機能

| 機能 | GeonicDB | FIWARE Orion | 備考 |
|------|:------------------:|:------------:|------|
| **Simple Query Language (q)** | ✅ | ✅ | |
| 比較演算子 (`==`, `!=`, `<`, `>`, `<=`, `>=`) | ✅ | ✅ | |
| 論理演算子 (`;` AND, `\|` OR) | ✅ | ✅ | |
| 範囲クエリ (`..`) | ✅ | ✅ | |
| パターンマッチ (`~=`) | ✅ | ✅ | 正規表現対応 |
| `idPattern` (正規表現) | ✅ | ✅ | |
| `typePattern` (正規表現) | ✅ | ✅ | |
| **Scope クエリ (NGSI-LD)** | ✅ | ✅ | |
| `scopeQ` パラメータ | ✅ | ✅ | 階層的スコープによるエンティティ分類・検索 |
| 完全一致 (`/path`) | 