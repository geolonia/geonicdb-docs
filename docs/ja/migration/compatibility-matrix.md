---
title: "Compatibility Matrix"
description: "Feature comparison with FIWARE Orion"
outline: deep
---
# GeonicDB と FIWARE Orion の機能比較

このドキュメントでは、GeonicDB と FIWARE Orion Context Broker の機能を比較します。

## 概要

| 項目 | GeonicDB | FIWARE Orion |
|------|-------------------|--------------|
| **実装言語** | TypeScript/Node.js | C++ |
| **アーキテクチャ** | サーバーレス (AWS Lambda) | モノリシック (Docker) |
| **データベース** | MongoDB Atlas | MongoDB |
| **ライセンス** | AGPL v3.0 | AGPL v3.0 |
| **対応 API** | NGSIv2 + NGSI-LD | NGSIv2 (Orion) / NGSI-LD (Orion-LD) |
| **スケーラビリティ** | 自動スケーリング (Lambda) | 手動スケーリング (コンテナ) |
| **コスト** | 従量課金 | 固定インフラコスト |

## API サポート状況

### NGSIv2 API

| 機能 | GeonicDB | FIWARE Orion | 備考 |
|---------|:------------------:|:------------:|-------|
| `POST /v2/entities` | ✅ | ✅ | エンティティの作成 |
| `GET /v2/entities` | ✅ | ✅ | エンティティの一覧 |
| `GET /v2/entities/{id}` | ✅ | ✅ | エンティティの取得 |
| `DELETE /v2/entities/{id}` | ✅ | ✅ | エンティティの削除 |
| `PATCH /v2/entities/{id}/attrs` | ✅ | ✅ | 属性の更新 |
| `POST /v2/entities/{id}/attrs` | ✅ | ✅ | 属性の追加 |
| `PUT /v2/entities/{id}/attrs` | ✅ | ✅ | 属性の置換 |
| `GET /v2/entities/{id}/attrs/{attr}` | ✅ | ✅ | 属性の取得 |
| `PUT /v2/entities/{id}/attrs/{attr}` | ✅ | ✅ | 属性の更新 |
| `DELETE /v2/entities/{id}/attrs/{attr}` | ✅ | ✅ | 属性の削除 |
| `GET /v2/entities/{id}/attrs/{attr}/value` | ✅ | ✅ | 属性値の直接取得 |
| `PUT /v2/entities/{id}/attrs/{attr}/value` | ✅ | ✅ | 属性値の直接更新 |
| `POST /v2/op/update` | ✅ | ✅ | バッチ更新 |
| `POST /v2/op/query` | ✅ | ✅ | バッチクエリ |
| `POST /v2/op/notify` | ✅ | ✅ | 通知の受信 |
| `GET /v2/types` | ✅ | ✅ | エンティティタイプの一覧 |
| `GET /v2/types/{type}` | ✅ | ✅ | エンティティタイプの取得 |
| `POST /v2/subscriptions` | ✅ | ✅ | サブスクリプションの作成 |
| `GET /v2/subscriptions` | ✅ | ✅ | サブスクリプションの一覧 |
| `GET /v2/subscriptions/{id}` | ✅ | ✅ | サブスクリプションの取得 |
| `PATCH /v2/subscriptions/{id}` | ✅ | ✅ | サブスクリプションの更新 |
| `DELETE /v2/subscriptions/{id}` | ✅ | ✅ | サブスクリプションの削除 |
| `POST /v2/registrations` | ✅ | ✅ | 登録の作成 |
| `GET /v2/registrations` | ✅ | ✅ | 登録の一覧 |
| `GET /v2/registrations/{id}` | ✅ | ✅ | 登録の取得 |
| `PATCH /v2/registrations/{id}` | ✅ | ✅ | 登録の更新 |
| `DELETE /v2/registrations/{id}` | ✅ | ✅ | 登録の削除 |
| `GET /version` | ✅ | ✅ | バージョン情報 |

### NGSI-LD API

| 機能 | GeonicDB | FIWARE Orion-LD | 備考 |
|---------|:------------------:|:---------------:|-------|
| `POST /ngsi-ld/v1/entities` | ✅ | ✅ | エンティティの作成 |
| `GET /ngsi-ld/v1/entities` | ✅ | ✅ | エンティティの一覧 |
| `GET /ngsi-ld/v1/entities/{id}` | ✅ | ✅ | エンティティの取得 |
| `PUT /ngsi-ld/v1/entities/{id}` | ✅ | ✅ | エンティティの置換 |
| `PATCH /ngsi-ld/v1/entities/{id}` | ✅ | ✅ | エンティティの更新 (merge-patch+json、urn:ngsi-ld:null、keyValues/concise 入力に対応) |
| `POST /ngsi-ld/v1/entities/{id}` | ✅ | ✅ | 属性の追加 |
| `DELETE /ngsi-ld/v1/entities/{id}` | ✅ | ✅ | エンティティの削除 |
| `GET /ngsi-ld/v1/entities/{id}/attrs` | ✅ | ✅ | すべての属性の取得 |
| `GET /ngsi-ld/v1/entities/{id}/attrs/{attr}` | ✅ | ✅ | 属性の取得 |
| `POST /ngsi-ld/v1/entities/{id}/attrs/{attr}` | ✅ | ✅ | 属性の置換 |
| `PATCH /ngsi-ld/v1/entities/{id}/attrs/{attr}` | ✅ | ✅ | 属性の部分更新 |
| `DELETE /ngsi-ld/v1/entities/{id}/attrs/{attr}` | ✅ | ✅ | 属性の削除 |
| `POST /ngsi-ld/v1/entityOperations/create` | ✅ | ✅ | バッチ作成 |
| `POST /ngsi-ld/v1/entityOperations/upsert` | ✅ | ✅ | バッチ作成/更新 |
| `POST /ngsi-ld/v1/entityOperations/update` | ✅ | ✅ | バッチ更新 |
| `POST /ngsi-ld/v1/entityOperations/delete` | ✅ | ✅ | バッチ削除 |
| `POST /ngsi-ld/v1/entityOperations/query` | ✅ | ✅ | バッチクエリ |
| `POST /ngsi-ld/v1/subscriptions` | ✅ | ✅ | サブスクリプションの作成 |
| `GET /ngsi-ld/v1/subscriptions` | ✅ | ✅ | サブスクリプションの一覧 |
| `GET /ngsi-ld/v1/subscriptions/{id}` | ✅ | ✅ | サブスクリプションの取得 |
| `PATCH /ngsi-ld/v1/subscriptions/{id}` | ✅ | ✅ | サブスクリプションの更新 |
| `DELETE /ngsi-ld/v1/subscriptions/{id}` | ✅ | ✅ | サブスクリプションの削除 |
| `POST /ngsi-ld/v1/csourceRegistrations` | ✅ | ✅ | 登録の作成 |
| `GET /ngsi-ld/v1/csourceRegistrations` | ✅ | ✅ | 登録の一覧 |
| `GET /ngsi-ld/v1/csourceRegistrations/{id}` | ✅ | ✅ | 登録の取得 |
| `PATCH /ngsi-ld/v1/csourceRegistrations/{id}` | ✅ | ✅ | 登録の更新 |
| `DELETE /ngsi-ld/v1/csourceRegistrations/{id}` | ✅ | ✅ | 登録の削除 |
| `POST /ngsi-ld/v1/csourceSubscriptions` | ✅ | ❌ | CSR サブスクリプションの作成 (*) |
| `GET /ngsi-ld/v1/csourceSubscriptions` | ✅ | ❌ | CSR サブスクリプションの一覧 (*) |
| `GET /ngsi-ld/v1/csourceSubscriptions/{id}` | ✅ | ❌ | CSR サブスクリプションの取得 (*) |
| `PATCH /ngsi-ld/v1/csourceSubscriptions/{id}` | ✅ | ❌ | CSR サブスクリプションの更新 (*) |
| `DELETE /ngsi-ld/v1/csourceSubscriptions/{id}` | ✅ | ❌ | CSR サブスクリプションの削除 (*) |
| `GET /ngsi-ld/v1/attributes` | ✅ | ✅ | 属性の一覧 |
| `GET /ngsi-ld/v1/attributes/{attrName}` | ✅ | ✅ | 属性の詳細 |
| `GET /.well-known/ngsi-ld` | ✅ | ✅ | API ディスカバリ |
| JSON-LD @context サポート | ✅ | ✅ | Linked Data コンテキスト |
| **Temporal API** | ✅ | ⚠️ 限定的 | 時系列データ管理 |
| **JSON-LD コンテキスト管理** | ✅ | ✅ | `/ngsi-ld/v1/jsonldContexts` |
| **EntityMap オペレーション** | ✅ | ❌ | エンティティのマッピングと変換 |
| **スナップショットオペレーション** | ✅ | ❌ | ポイントインタイムスナップショット |
| **適合性情報** | ✅ | ✅ | `/ngsi-ld/v1/info/conformance` |
| **ソース識別情報** | ✅ | ✅ | `/ngsi-ld/v1/info/sourceIdentity` |
| **ベクタタイル** | ✅ | ❌ | `/ngsi-ld/v1/tiles` GeoJSON ベクタタイル |

> **csourceSubscriptions についての注意**
> Context Source Registration (CSR) サブスクリプション機能は、ETSI GS CIM 009 仕様で定義されています。GeonicDB は仕様準拠の実装を提供していますが、Orion-LD は現在実装されていません (実装予定。[Orion-LD Issue #280](https://github.com/FIWARE/context.Orion-LD/issues/280) 参照)。

### NGSI-LD 属性タイプ

| 機能 | GeonicDB | FIWARE Orion-LD | 備考 |
|---------|:------------------:|:---------------:|-------|
| Property | ✅ | ✅ | 基本属性 |
| Relationship | ✅ | ✅ | エンティティ間の関連付け |
| GeoProperty | ✅ | ✅ | 地理空間属性 |
| LanguageProperty | ✅ | ✅ | 多言語属性 |
| JsonProperty | ✅ | ✅ | JSON 値属性 |
| VocabProperty | ✅ | ✅ | 語彙属性 (vocab/vocabMap) |
| ListProperty | ✅ | ✅ | リスト値属性 |
| ListRelationship | ✅ | ✅ | リスト関係属性 |
| TemporalProperty | ✅ | ✅ | 時間属性 |
| **マルチ属性** | ✅ | ✅ | datasetId による複数インスタンス |
| `datasetId` クエリパラメータ | ✅ | ✅ | 特定のインスタンスを削除 |
| `deleteAll` クエリパラメータ | ✅ | ✅ | すべてのインスタンスを削除 |

### NGSI-LD 出力形式

| 機能 | GeonicDB | FIWARE Orion-LD | 備考 |
|---------|:------------------:|:---------------:|-------|
| normalized | ✅ | ✅ | 完全形式 (デフォルト) |
| concise | ✅ | ✅ | 簡潔形式 (type を省略) |
| keyValues / simplified | ✅ | ✅ | 値のみ |

## クエリ機能

| 機能 | GeonicDB | FIWARE Orion | 備考 |
|---------|:------------------:|:------------:|-------|
| **シンプルクエリ言語 (q)** | ✅ | ✅ | |
| 比較演算子 (`==`、`!=`、`<`、`>`、`<=`、`>=`) | ✅ | ✅ | |
| 論理演算子 (`;` AND、`\|` OR) | ✅ | ✅ | |
| 範囲クエリ (`..`) | ✅ | ✅ | |
| パターンマッチ (`~=`) | ✅ | ✅ | 正規表現サポート |
| `idPattern` (正規表現) | ✅ | ✅ | |
| `typePattern` (正規表現) | ✅ | ✅ | |
| **スコープクエリ (NGSI-LD)** | ✅ | ✅ | |
| `scopeQ` パラメータ | ✅ | ✅ | エンティティの分類と階層的スコープによる検索 |
| 完全一致 (`/path`) | ✅ | ✅ | |
| すべての子孫 (`/path/#`) | ✅ | ✅ | |
| 直接の子 (`/path/+`) | ✅ | ✅ | |
| OR 条件 (`;`) | ✅ | ✅ | |
| **ページネーション** | ✅ | ✅ | |
| `limit` パラメータ | ✅ (最大: 1000) | ✅ (最大: 1000) | |
| `offset` パラメータ | ✅ | ✅ | |
| **出力形式** | | | |
| `keyValues` | ✅ | ✅ | 簡潔形式 |
| `values` | ✅ | ✅ | 値のみ |
| `unique` | ✅ | ✅ | `values` と組み合わせた場合の重複排除 |
| `sysAttrs` | ✅ | ✅ | システム属性 (dateCreated、dateModified) を含める |
| `normalized` (デフォルト) | 