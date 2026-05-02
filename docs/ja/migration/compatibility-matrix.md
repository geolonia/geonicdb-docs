---
title: "Compatibility Matrix"
description: "Feature comparison with FIWARE Orion"
outline: deep
---
# GeonicDB vs FIWARE Orion 機能比較

このドキュメントは GeonicDB と FIWARE Orion Context Broker の機能を比較しています。

## 概要

| 項目 | GeonicDB | FIWARE Orion |
|------|-------------------|--------------|
| **実装言語** | TypeScript/Node.js | C++ |
| **アーキテクチャ** | サーバーレス (AWS Lambda) | モノリシック (Docker) |
| **データベース** | MongoDB Atlas | MongoDB |
| **ライセンス** | AGPL v3.0 | AGPL v3.0 |
| **サポート API** | NGSIv2 + NGSI-LD | NGSIv2 (Orion) / NGSI-LD (Orion-LD) |
| **スケーラビリティ** | 自動スケーリング (Lambda) | 手動スケーリング (コンテナ) |
| **コスト** | 従量課金 | 固定インフラストラクチャコスト |

## API サポート状況

### NGSIv2 API

| 機能 | GeonicDB | FIWARE Orion | 備考 |
|---------|:------------------:|:------------:|-------|
| `POST /v2/entities` | ✅ | ✅ | エンティティの作成 |
| `GET /v2/entities` | ✅ | ✅ | エンティティの一覧取得 |
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
| `GET /v2/types` | ✅ | ✅ | エンティティタイプの一覧取得 |
| `GET /v2/types/{type}` | ✅ | ✅ | エンティティタイプの取得 |
| `POST /v2/subscriptions` | ✅ | ✅ | サブスクリプションの作成 |
| `GET /v2/subscriptions` | ✅ | ✅ | サブスクリプションの一覧取得 |
| `GET /v2/subscriptions/{id}` | ✅ | ✅ | サブスクリプションの取得 |
| `PATCH /v2/subscriptions/{id}` | ✅ | ✅ | サブスクリプションの更新 |
| `DELETE /v2/subscriptions/{id}` | ✅ | ✅ | サブスクリプションの削除 |
| `POST /v2/registrations` | ✅ | ✅ | 登録の作成 |
| `GET /v2/registrations` | ✅ | ✅ | 登録の一覧取得 |
| `GET /v2/registrations/{id}` | ✅ | ✅ | 登録の取得 |
| `PATCH /v2/registrations/{id}` | ✅ | ✅ | 登録の更新 |
| `DELETE /v2/registrations/{id}` | ✅ | ✅ | 登録の削除 |
| `GET /version` | ✅ | ✅ | バージョン情報 |### NGSI-LD API

| 機能 | GeonicDB | FIWARE Orion-LD | 備考 |
|---------|:------------------:|:---------------:|-------|
| `POST /ngsi-ld/v1/entities` | ✅ | ✅ | エンティティの作成 |
| `GET /ngsi-ld/v1/entities` | ✅ | ✅ | エンティティの一覧取得 |
| `GET /ngsi-ld/v1/entities/{id}` | ✅ | ✅ | エンティティの取得 |
| `PUT /ngsi-ld/v1/entities/{id}` | ✅ | ✅ | エンティティの置換 |
| `PATCH /ngsi-ld/v1/entities/{id}` | ✅ | ✅ | エンティティの更新(merge-patch+json、urn:ngsi-ld:null、keyValues/concise 入力をサポート) |
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
| `GET /ngsi-ld/v1/subscriptions` | ✅ | ✅ | サブスクリプションの一覧取得 |
| `GET /ngsi-ld/v1/subscriptions/{id}` | ✅ | ✅ | サブスクリプションの取得 |
| `PATCH /ngsi-ld/v1/subscriptions/{id}` | ✅ | ✅ | サブスクリプションの更新 |
| `DELETE /ngsi-ld/v1/subscriptions/{id}` | ✅ | ✅ | サブスクリプションの削除 |
| `POST /ngsi-ld/v1/csourceRegistrations` | ✅ | ✅ | 登録の作成 |
| `GET /ngsi-ld/v1/csourceRegistrations` | ✅ | ✅ | 登録の一覧取得 |
| `GET /ngsi-ld/v1/csourceRegistrations/{id}` | ✅ | ✅ | 登録の取得 |
| `PATCH /ngsi-ld/v1/csourceRegistrations/{id}` | ✅ | ✅ | 登録の更新 |
| `DELETE /ngsi-ld/v1/csourceRegistrations/{id}` | ✅ | ✅ | 登録の削除 |
| `POST /ngsi-ld/v1/csourceSubscriptions` | ✅ | ❌ | CSR サブスクリプションの作成 (*) |
| `GET /ngsi-ld/v1/csourceSubscriptions` | ✅ | ❌ | CSR サブスクリプションの一覧取得 (*) |
| `GET /ngsi-ld/v1/csourceSubscriptions/{id}` | ✅ | ❌ | CSR サブスクリプションの取得 (*) |
| `PATCH /ngsi-ld/v1/csourceSubscriptions/{id}` | ✅ | ❌ | CSR サブスクリプションの更新 (*) |
| `DELETE /ngsi-ld/v1/csourceSubscriptions/{id}` | ✅ | ❌ | CSR サブスクリプションの削除 (*) |
| `GET /ngsi-ld/v1/attributes` | ✅ | ✅ | 属性の一覧取得 |
| `GET /ngsi-ld/v1/attributes/{attrName}` | ✅ | ✅ | 属性の詳細 |
| `GET /.well-known/ngsi-ld` | ✅ | ✅ | API ディスカバリ |
| JSON-LD @context サポート | ✅ | ✅ | Linked Data コンテキスト |
| **Temporal API** | ✅ | ⚠️ 制限付き | 時系列データ管理 |
| **JSON-LD コンテキスト管理** | ✅ | ✅ | `/ngsi-ld/v1/jsonldContexts` |
| **EntityMap 操作** | ✅ | ❌ | エンティティのマッピングと変換 |
| **スナップショット操作** | ✅ | ❌ | ポイントインタイムスナップショット |
| **適合性情報** | ✅ | ✅ | `/ngsi-ld/v1/info/conformance` |
| **ソース識別** | ✅ | ✅ | `/ngsi-ld/v1/info/sourceIdentity` |
| **ベクタータイル** | ✅ | ❌ | `/ngsi-ld/v1/tiles` GeoJSON ベクタータイル |

> **csourceSubscriptions に関する注記**
> Context Source Registration (CSR) サブスクリプション機能は、ETSI GS CIM 009 仕様で定義されています。GeonicDB は仕様準拠の実装を提供していますが、Orion-LD は現在これを実装していません(実装は計画中です。[Orion-LD Issue #280](https://github.com/FIWARE/context.Orion-LD/issues/280) を参照してください)。

### NGSI-LD 属性タイプ

| 機能 | GeonicDB | FIWARE Orion-LD | 備考 |
|---------|:------------------:|:---------------:|-------|
| Property | ✅ | ✅ | 基本属性 |
| Relationship | ✅ | ✅ | エンティティ間の関連 |
| GeoProperty | ✅ | ✅ | 地理空間属性 |
| LanguageProperty | ✅ | ✅ | 多言語属性 |
| JsonProperty | ✅ | ✅ | JSON 値属性 |
| VocabProperty | ✅ | ✅ | 語彙属性(vocab/vocabMap) |
| ListProperty | ✅ | ✅ | リスト値属性 |
| ListRelationship | ✅ | ✅ | リスト関係属性 |
| TemporalProperty | ✅ | ✅ | 時間属性 |
| **マルチ属性** | ✅ | ✅ | datasetId による複数インスタンス |
| `datasetId` クエリパラメータ | ✅ | ✅ | 特定のインスタンスを削除 |
| `deleteAll` クエリパラメータ | ✅ | ✅ | すべてのインスタンスを削除 |

### NGSI-LD 出力形式

| 機能 | GeonicDB | FIWARE Orion-LD | 備考 |
|---------|:------------------:|:---------------:|-------|
| normalized | ✅ | ✅ | 完全形式(デフォルト) |
| concise | ✅ | ✅ | 簡潔形式(type 省略) |
| keyValues / simplified | ✅ | ✅ | 値のみ |## クエリ機能

| 機能 | GeonicDB | FIWARE Orion | 備考 |
|---------|:------------------:|:------------:|-------|
| **シンプルクエリ言語 (q)** | ✅ | ✅ | |
| 比較演算子 (`==`, `!=`, `<`, `>`, `<=`, `>=`) | ✅ | ✅ | |
| 論理演算子 (`;` AND、`\|` OR) | ✅ | ✅ | |
| 範囲クエリ (`..`) | ✅ | ✅ | |
| パターンマッチ (`~=`) | ✅ | ✅ | 正規表現サポート |
| `idPattern` (正規表現) | ✅ | ✅ | |
| `typePattern` (正規表現) | ✅ | ✅ | |
| **スコープクエリ (NGSI-LD)** | ✅ | ✅ | |
| `scopeQ` パラメータ | ✅ | ✅ | エンティティの分類と階層的スコープによる検索 |
| 完全一致 (`/path`) | ✅ | ✅ | |
| すべての子孫 (`/path/#`) | ✅ | ✅ | |
| 直接の子要素 (`/path/+`) | ✅ | ✅ | |
| OR 条件 (`;`) | ✅ | ✅ | |
| **ページネーション** | ✅ | ✅ | |
| `limit` パラメータ | ✅ (最大: 1000) | ✅ (最大: 1000) | |
| `offset` パラメータ | ✅ | ✅ | |
| **出力形式** | | | |
| `keyValues` | ✅ | ✅ | 簡易形式 |
| `values` | ✅ | ✅ | 値のみ |
| `unique` | ✅ | ✅ | `values` と組み合わせた際の重複排除 |
| `sysAttrs` | ✅ | ✅ | システム属性 (dateCreated、dateModified) を含む |
| `normalized` (デフォルト) | ✅ | ✅ | 完全形式 |
| **属性選択** | | | |
| `attrs` パラメータ | ✅ | ✅ | 含める属性 |
| `metadata` パラメータ | ✅ | ✅ | メタデータ出力制御 (on/off) |
| **ソート** | | | |
| `orderBy` パラメータ | ✅ | ✅ | entityId、entityType、modifiedAt でソート |
| `orderDirection` パラメータ | ✅ | ✅ | asc/desc でソート方向を指定 |

## 地理空間機能

| 機能 | GeonicDB | FIWARE Orion | 備考 |
|---------|:------------------:|:------------:|-------|
| **地理クエリ** | ✅ | ✅ | |
| `georel=near` | ✅ | ✅ | Point ジオメトリのみ、距離ソートなし |
| `georel=within` | ✅ | ✅ | |
| `georel=coveredBy` | ✅ | ✅ | |
| `georel=intersects` | ✅ | ✅ | |
| `georel=disjoint` | ✅ | ✅ | |
| `georel=equals` | ✅ | ✅ | |
| `georel=contains` | ✅ | ✅ | |
| **ジオメトリタイプ** | | | |
| Point | ✅ | ✅ | |
| LineString | ✅ | ✅ | |
| Polygon | ✅ | ✅ | |
| Box | ✅ | ✅ | バウンディングボックス (2 点で指定された矩形エリア) |
| MultiPoint | ✅ | ✅ | |
| MultiLineString | ✅ | ✅ | |
| MultiPolygon | ✅ | ✅ | |
| **GeoJSON 出力** | ✅ | ✅ | `options=geojson` |
| **ベクタータイル** | ✅ | ❌ | TileJSON 3.0 準拠、自動クラスタリング |
| **空間 ID (ZFXY)** | ✅ | ❌ | デジタル庁標準 |

## サブスクリプション/通知機能

| 機能 | GeonicDB | FIWARE Orion | 備考 |
|---------|:------------------:|:------------:|-------|
| **サブジェクト条件** | | | |
| エンティティ ID 指定 | ✅ | ✅ | |
| エンティティ ID パターン | ✅ | ✅ | 正規表現 |
| エンティティタイプ指定 | ✅ | ✅ | |
| エンティティタイプパターン | ✅ | ✅ | 正規表現 |
| 属性条件 (`attrs`) | ✅ | ✅ | |
| クエリ言語条件 (`q`) | ✅ | ✅ | |
| 地理条件 | ✅ | ✅ | |
| **通知設定** | | | |
| HTTP Webhook | ✅ | ✅ | |
| MQTT | ✅ | ✅ | |
| **WebSocket イベントストリーミング** | ✅ | ❌ | リアルタイムエンティティ変更配信 |
| カスタムヘッダー | ✅ | ✅ | |
| `httpCustom.method` | ✅ | ✅ | カスタム HTTP メソッド |
| `httpCustom.qs` | ✅ | ✅ | クエリ文字列パラメータ (マクロ置換サポート) |
| `httpCustom.payload` | ✅ | ✅ | カスタムペイロードテンプレート (マクロ置換サポート) |
| マクロ置換 (`${id}`、`${type}`、`${attr}`) | ✅ | ✅ | payload/qs で使用可能 |
| `httpCustom.json` | ❌ | ✅ | JSON テンプレート (将来サポート予定) |
| `httpCustom.ngsi` | ❌ | ✅ | NGSI パッチ (将来サポート予定) |
| JEXL 式 | ❌ | ✅ | 将来サポート予定 |
| `attrsFormat` | ✅ | ✅ | |
| `exceptAttrs` | ✅ | ✅ | |
| `onlyChangedAttrs` | ✅ | ✅ | 通知に変更された属性のみを含める |
| **制御** | | | |
| `expires` (有効期限) | ✅ | ✅ | |
| `throttling` | ✅ | ✅ | |
| `status` (一時停止) | ✅ | ✅ | |
| **統計** | | | |
| `timesSent` | ✅ | ✅ | |
| `lastNotification` | ✅ | ✅ | |
| `lastFailure` | ✅ | ✅ | |
| `lastSuccess` | ✅ | ✅ | |
| **通知配信** | | | |
| 順序保証 | ✅ (SQS FIFO) | ⚠️ 限定的 | |
| リトライ機能 | ✅ | ✅ | |
| Dead Letter Queue | ✅ | ❌ | |## 登録 / コンテキストプロバイダー

| 機能 | GeonicDB | FIWARE Orion | 備考 |
|---------|:------------------:|:------------:|-------|
| **登録 CRUD** | ✅ | ✅ | |
| エンティティタイプの登録 | ✅ | ✅ | |
| 属性の登録 | ✅ | ✅ | |
| **フェデレーションクエリ** | ✅ | ✅ | 分散クエリ転送 (getEntity/queryEntities) |
| **フェデレーション更新** | ✅ | ✅ | 分散更新転送 (updateEntity/deleteEntity/deleteAttribute) |
| **分散操作機能** | | | |
| CSR 変更通知 (Ngsild-Trigger) | ✅ | ❌ | CSR の作成/更新/削除時の自動通知 (ETSI GS CIM 009 - 5.11) |
| ループ検出 (Via ヘッダー) | ✅ | ❌ | 分散フェデレーションのループ防止 (ETSI GS CIM 009 - 6.3.5) |
| 警告ヘッダー (NGSILD-Warning) | ✅ | ❌ | フェデレーション失敗時の警告伝播 (ETSI GS CIM 009 - 6.3.6) |
| 分散型タイプ/属性検出 | ✅ | ❌ | /types と /attributes に CSR が含まれる (ETSI GS CIM 009 - 5.9.3.3) |
| **モード** | | | |
| inclusive | ✅ | ✅ | ローカルとリモートをマージ (NGSI-LD 標準、NGSIv2 拡張) |
| exclusive | ✅ | ✅ | リモートのみ返却 (NGSI-LD 標準、NGSIv2 拡張) |
| redirect | ✅ | ✅ | 303 リダイレクト (NGSI-LD 標準、NGSIv2 拡張) |
| auxiliary | ✅ | ✅ | ローカル優先、欠損データをリモートで補完 (NGSI-LD 標準、NGSIv2 拡張) |

## マルチテナンシー

| 機能 | GeonicDB | FIWARE Orion | 備考 |
|---------|:------------------:|:------------:|-------|
| `Fiware-Service` ヘッダー | ✅ | ✅ | テナント識別 |
| `Fiware-ServicePath` ヘッダー | ✅ | ✅ | 階層パス |
| 自動テナント分離 | ✅ | ✅ | |
| 階層ServicePath | ✅ | ✅ | |
| 階層検索 (`/#`) | ✅ | ✅ | `/path/#` で子パスを含む検索 |
| 複数パス指定 | ✅ | ✅ | 最大 10 パス、カンマ区切り |
| ヘッダー省略時に全パスを検索 | ✅ | ✅ | クエリでヘッダーを省略すると全パスを検索 |
| `Fiware-Correlator` ヘッダー | ✅ | ✅ | リクエスト追跡 |

## 認証と認可

| 機能 | GeonicDB | FIWARE Orion | 備考 |
|---------|:------------------:|:------------:|-------|
| **組み込み認証** | ✅ | ❌ | JWT 認証とロールベースアクセス制御 |
| JWT 認証 | ✅ | ❌ | アクセストークンとリフレッシュトークン |
| ロールベースアクセス制御 | ✅ | ❌ | super_admin、tenant_admin、user、api_key |
| **OIDC 外部 IdP 連携** | ✅ | ❌ | OpenID Connect を介した外部認証プロバイダー |
| **XACML ポリシーセット** | ✅ | ❌ | ポリシーセットによる階層的アクセス制御管理 |
| **外部認証連携** | | | |
| OAuth 2.0 | ⚠️ API Gateway 経由 | ⚠️ PEP Proxy 経由 | |
| Keyrock IdM 連携 | ⚠️ API 互換 | ✅ | API 互換性による連携が可能 (未検証) |
| Wilma PEP Proxy | ⚠️ API 互換 | ✅ | API 互換性による連携が可能 (未検証) |
| AWS Cognito | ✅ | ❌ | API Gateway 連携 |
| AWS IAM | ✅ | ❌ | Lambda Authorizer |

## データ連携基盤

| 機能 | GeonicDB | FIWARE Orion | 備考 |
|---------|:------------------:|:------------:|-------|
| **CADDE 連携** | ✅ | ❌ | クロスドメインデータ交換基盤 |
| `x-cadde-*` ヘッダーサポート | ✅ | ❌ | リソース URL とプロバイダー情報 |
| プロベナンス情報ヘッダー | ✅ | ❌ | `x-cadde-provenance-*` |
| Bearer 認証 (CADDE) | ✅ | ❌ | オプション |

## データカタログ

| 機能 | GeonicDB | FIWARE Orion | 備考 |
|---------|:------------------:|:------------:|-------|
| **DCAT-AP カタログ** | ✅ | ❌ | EU データポータル標準 |
| `GET /catalog` | ✅ | ❌ | DCAT-AP JSON-LD 形式 |
| `GET /catalog/datasets` | ✅ | ❌ | データセット一覧 |
| `GET /catalog/datasets/{id}` | ✅ | ❌ | データセット詳細 |
| `GET /catalog/datasets/{id}/sample` | ✅ | ❌ | サンプルデータ取得 |
| **CKAN 互換 API** | ✅ | ❌ | オープンデータポータル連携 |
| `/catalog/ckan/package_list` | ✅ | ❌ | パッケージ ID 一覧 |
| `/catalog/ckan/package_show` | ✅ | ❌ | パッケージ詳細 |
| `/catalog/ckan/current_package_list_with_resources` | ✅ | ❌ | ページネーション付き一覧 |
| **CKAN ハーベスターサポート** | ✅ | ❌ | 自動データ収集サポート |

## AI 連携

| 機能 | GeonicDB | FIWARE Orion | 備考 |
|---------|:------------------:|:------------:|-------|
| **MCP (Model Context Protocol)** | ✅ | ❌ | ストリーミング可能な HTTP トランスポート、ステートレス |
| MCP ツール公開 | ✅ | ❌ | エンティティ CRUD、クエリなどを AI ツールとして公開 |
| MCP 認証 (JWT) | ✅ | ❌ | テナント分離サポート |
| **llms.txt** | ✅ | ❌ | AI/LLM 向け API ドキュメント (`GET /llms.txt`) |
| **tools.json** | ✅ | ❌ | AI エージェント向けツール定義 (`GET /tools.json`) |
| **OpenAPI 3.0** | ✅ | ✅ | `GET /openapi.json` |## 運用と監視

| 機能 | GeonicDB | FIWARE Orion | 備考 |
|---------|:------------------:|:------------:|-------|
| **ヘルスチェック** | ✅ | ✅ | |
| `/health` | ✅ | ✅ | |
| `/health/live` | ✅ | ❌ | Kubernetes Liveness |
| `/health/ready` | ✅ | ❌ | Kubernetes Readiness |
| **ロギング** | | | |
| 構造化ロギング (JSON) | ✅ | ✅ | |
| 監査ログ | ✅ | ❌ | 書き込み操作の誰が/何を/いつを記録する構造化 JSON 出力 |
| AWS CloudWatch 統合 | ✅ | ❌ | |
| **トレーシング** | | | |
| AWS X-Ray | ✅ | ❌ | |
| OpenTelemetry | ✅ | ⚠️ 制限あり | OTLP over HTTP/gRPC |
| **メトリクス** | | | |
| CloudWatch Metrics | ✅ | ❌ | |
| Prometheus | ✅ | ✅ | /metrics エンドポイント |

## デプロイメント

| 項目 | GeonicDB | FIWARE Orion | 備考 |
|------|:------------------:|:------------:|-------|
| **デプロイ方法** | | | |
| AWS SAM | ✅ | ❌ | |
| Docker | ❌ | ✅ | |
| Docker Compose | ❌ | ✅ | |
| Kubernetes | ⚠️ 未検証 | ✅ | |
| **依存サービス** | | | |
| MongoDB | ✅ | ✅ | |
| EventBridge | ✅ | ❌ | イベント駆動 |
| SQS | ✅ | ❌ | 通知キュー |
| **環境** | | | |
| AWS | ✅ | ⚠️ 可能 | |
| オンプレミス | ❌ | ✅ | |
| GCP/Azure | ❌ | ⚠️ 可能 | |

## 独自機能

### GeonicDB のみ

| 機能 | 説明 |
|---------|-------------|
| **MCP (Model Context Protocol)** | [MCP](https://modelcontextprotocol.io/) 互換の AI ツールエンドポイント (`POST /mcp`)。Claude Desktop などの AI クライアントから直接操作可能 |
| **llms.txt サポート** | [llms.txt 標準](https://llmstxt.org/) に準拠した AI/LLM 向けの API ドキュメント (`GET /llms.txt`) |
| **空間 ID (ZFXY) サポート** | 日本のデジタル庁/IPA「空間 ID ガイドライン」に準拠した 3D 空間識別 |
| **ベクタータイル** | TileJSON 3.0 準拠の GeoJSON ベクタータイル出力、自動クラスタリングサポート |
| **DCAT-AP カタログ** | EU データポータル標準に準拠した JSON-LD カタログ出力 (`GET /catalog`) |
| **CKAN 互換 API** | CKAN オープンデータポータルハーベスターとの互換性 |
| **CADDE 統合** | CADDE (クロスドメインデータ交換基盤) コネクタとの統合機能 |
| **WebSocket イベントストリーミング** | AWS API Gateway WebSocket API 経由のリアルタイムエンティティ変更配信。エンティティタイプと ID パターンでフィルタリング可能 |
| **スナップショット** | エンティティのポイントインタイムスナップショット作成と復元 (`/ngsi-ld/v1/snapshots`) |
| **EntityMap** | 分散エンティティマッピングと変換定義 (`/ngsi-ld/v1/entityMaps`) |
| **適合性情報** | NGSI-LD 適合性情報エンドポイント (`/ngsi-ld/v1/info/conformance`)、ソース識別 (`/ngsi-ld/v1/info/sourceIdentity`) |
| **OIDC 外部 IdP 統合** | OpenID Connect 経由の外部認証プロバイダー統合 |
| **XACML ポリシーセット** | ポリシーセット経由の階層的アクセス制御管理 |
| **時系列バッチ操作** | `temporal/entityOperations/create`、`upsert`、`delete` (ETSI GS CIM 009 仕様を超える独自拡張) |
| **Time Series Collection** | MongoDB Time Series Collection による最適化された時系列データストレージ、`$dateTrunc` 集約、TTL データ保持ポリシー |
| **サーバーレスアーキテクチャ** | AWS Lambda による自動スケーリングと従量課金 |
| **SQS FIFO 通知キュー** | 順序保証された通知配信 |
| **Dead Letter Queue** | 失敗した通知の分離と再処理 |
| **MongoDB Change Stream** | リアルタイムイベント検出 |
| **AWS X-Ray トレーシング** | 分散トレーシングサポート |
| **Kubernetes Probes** | `/health/live`、`/health/ready` エンドポイント |

### FIWARE Orion のみ

注: Keyrock IdM / Wilma PEP Proxy については、GeonicDB も API 互換性を介して統合可能です (上記「認証と認可」セクションを参照)。

## 推奨ユースケース

### GeonicDB が適している場合

- すでに AWS インフラを使用している
- サーバーレスアーキテクチャを採用する
- 自動スケーリングと従量課金が必要
- 日本の空間 ID 標準のサポートが必要
- CADDE (クロスドメインデータ交換基盤) との統合が必要
- 運用コストを最小化したい
- AI/LLM 統合を計画している (llms.txt サポート)

### FIWARE Orion が適している場合

- オンプレミス環境で運用する必要がある
- 他の FIWARE エコシステムコンポーネント (Keyrock、Wilma など) と統合する
- Docker/Kubernetes で運用する予定
- AWS 以外のクラウドまたはマルチクラウド環境で運用する## 参考資料

- [GeonicDB Repository](https://github.com/geolonia/geonicdb) (プライベートリポジトリ)
- [FIWARE Orion Documentation](https://fiware-orion.readthedocs.io/)
- [FIWARE Orion-LD Repository](https://github.com/FIWARE/context.Orion-LD)
- [NGSIv2 Specification](https://fiware-orion.readthedocs.io/en/master/orion-api.html)
- [NGSI-LD Specification (ETSI)](https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/)
- [CADDE (Cross-Domain Data Exchange Platform)](https://www.data-ex.jp/)
- [DCAT-AP (EU Data Portal Standard)](https://joinup.ec.europa.eu/collection/semic-support-centre/solution/dcat-application-profile-data-portals-europe)
- [CKAN API Documentation](https://docs.ckan.org/en/latest/api/)

---

*最終更新日: 2026 年 2 月*