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

## API対応状況

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
| `PATCH /ngsi-ld/v1/entities/{id}` | ✅ | ✅ | エンティティ更新（merge-patch+json対応、urn:ngsi-ld:null、keyValues/concise入力） |
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
| `POST /ngsi-ld/v1/csourceSubscriptions` | ✅ | ❌ | CSRサブスクリプション作成 (※) |
| `GET /ngsi-ld/v1/csourceSubscriptions` | ✅ | ❌ | CSRサブスクリプション一覧 (※) |
| `GET /ngsi-ld/v1/csourceSubscriptions/{id}` | ✅ | ❌ | CSRサブスクリプション取得 (※) |
| `PATCH /ngsi-ld/v1/csourceSubscriptions/{id}` | ✅ | ❌ | CSRサブスクリプション更新 (※) |
| `DELETE /ngsi-ld/v1/csourceSubscriptions/{id}` | ✅ | ❌ | CSRサブスクリプション削除 (※) |
| `GET /ngsi-ld/v1/attributes` | ✅ | ✅ | 属性一覧 |
| `GET /ngsi-ld/v1/attributes/{attrName}` | ✅ | ✅ | 属性詳細 |
| `GET /.well-known/ngsi-ld` | ✅ | ✅ | APIディスカバリー |
| JSON-LD @context サポート | ✅ | ✅ | Linked Dataコンテキスト |
| **Temporal API** | ✅ | ⚠️ 制限あり | 時系列データ管理 |
| **JSON-LD コンテキスト管理** | ✅ | ✅ | `/ngsi-ld/v1/jsonldContexts` |
| **EntityMap 操作** | ✅ | ❌ | エンティティマッピング・変換 |
| **スナップショット操作** | ✅ | ❌ | ポイントインタイム・スナップショット |
| **適合性情報** | ✅ | ✅ | `/ngsi-ld/v1/info/conformance` |
| **ソースアイデンティティ** | ✅ | ✅ | `/ngsi-ld/v1/info/sourceIdentity` |
| **ベクトルタイル** | ✅ | ❌ | `/ngsi-ld/v1/tiles` GeoJSON ベクトルタイル |

> **※ csourceSubscriptions について**
> Context Source Registration (CSR) のサブスクリプション機能は ETSI GS CIM 009 仕様で定義されています。GeonicDB は仕様準拠の実装を提供していますが、Orion-LD では現在未実装です（実装予定、参照: [Orion-LD Issue #280](https://github.com/FIWARE/context.Orion-LD/issues/280)）。

### NGSI-LD 属性タイプ

| 機能 | GeonicDB | FIWARE Orion-LD | 備考 |
|------|:------------------:|:---------------:|------|
| Property | ✅ | ✅ | 基本属性 |
| Relationship | ✅ | ✅ | エンティティ間関連 |
| GeoProperty | ✅ | ✅ | 地理空間属性 |
| LanguageProperty | ✅ | ✅ | 多言語属性 |
| JsonProperty | ✅ | ✅ | JSON値属性 |
| VocabProperty | ✅ | ✅ | 語彙属性（vocab/vocabMap） |
| ListProperty | ✅ | ✅ | リスト値属性 |
| ListRelationship | ✅ | ✅ | リスト関連属性 |
| TemporalProperty | ✅ | ✅ | 時間属性 |
| **Multi-attribute** | ✅ | ✅ | datasetIdによる複数インスタンス |
| `datasetId` クエリパラメータ | ✅ | ✅ | 特定インスタンスの削除 |
| `deleteAll` クエリパラメータ | ✅ | ✅ | 全インスタンスの削除 |

### NGSI-LD 出力形式

| 機能 | GeonicDB | FIWARE Orion-LD | 備考 |
|------|:------------------:|:---------------:|------|
| normalized | ✅ | ✅ | 完全形式（デフォルト） |
| concise | ✅ | ✅ | 簡潔形式（typeを省略） |
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
| 完全一致 (`/path`) | ✅ | ✅ | |
| 全子孫検索 (`/path/#`) | ✅ | ✅ | |
| 直接の子検索 (`/path/+`) | ✅ | ✅ | |
| OR条件 (`;`) | ✅ | ✅ | |
| **ページネーション** | ✅ | ✅ | |
| `limit` パラメータ | ✅ (max: 1000) | ✅ (max: 1000) | |
| `offset` パラメータ | ✅ | ✅ | |
| **出力形式** | | | |
| `keyValues` | ✅ | ✅ | 簡易形式 |
| `values` | ✅ | ✅ | 値のみ |
| `unique` | ✅ | ✅ | `values`と組み合わせて重複排除 |
| `sysAttrs` | ✅ | ✅ | システム属性（dateCreated, dateModified）を含む |
| `normalized` (デフォルト) | ✅ | ✅ | 完全形式 |
| **属性選択** | | | |
| `attrs` パラメータ | ✅ | ✅ | 含める属性 |
| `metadata` パラメータ | ✅ | ✅ | メタデータ出力制御（on/off） |
| **ソート** | | | |
| `orderBy` パラメータ | ✅ | ✅ | entityId, entityType, modifiedAt でソート |
| `orderDirection` パラメータ | ✅ | ✅ | asc/desc でソート方向を指定 |

## 地理空間機能

| 機能 | GeonicDB | FIWARE Orion | 備考 |
|------|:------------------:|:------------:|------|
| **ジオクエリ** | ✅ | ✅ | |
| `georel=near` | ✅ | ✅ | Pointジオメトリのみ対応、距離ソートなし |
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
| Box | ✅ | ✅ | バウンディングボックス（2点で矩形指定） |
| MultiPoint | ✅ | ✅ | |
| MultiLineString | ✅ | ✅ | |
| MultiPolygon | ✅ | ✅ | |
| **GeoJSON出力** | ✅ | ✅ | `options=geojson` |
| **ベクトルタイル** | ✅ | ❌ | TileJSON 3.0準拠、自動クラスタリング |
| **空間ID (ZFXY)** | ✅ | ❌ | 日本デジタル庁標準 |

## サブスクリプション/通知機能

| 機能 | GeonicDB | FIWARE Orion | 備考 |
|------|:------------------:|:------------:|------|
| **Subject 条件** | | | |
| エンティティID指定 | ✅ | ✅ | |
| エンティティIDパターン | ✅ | ✅ | 正規表現 |
| エンティティタイプ指定 | ✅ | ✅ | |
| エンティティタイプパターン | ✅ | ✅ | 正規表現 |
| 属性条件 (`attrs`) | ✅ | ✅ | |
| クエリ言語条件 (`q`) | ✅ | ✅ | |
| ジオ条件 | ✅ | ✅ | |
| **Notification 設定** | | | |
| HTTP Webhook | ✅ | ✅ | |
| MQTT | ✅ | ✅ | |
| **WebSocket イベントストリーミング** | ✅ | ❌ | リアルタイムエンティティ変更配信 |
| カスタムヘッダー | ✅ | ✅ | |
| `httpCustom.method` | ✅ | ✅ | カスタムHTTPメソッド |
| `httpCustom.qs` | ✅ | ✅ | クエリ文字列パラメータ（マクロ置換対応） |
| `httpCustom.payload` | ✅ | ✅ | カスタムペイロードテンプレート（マクロ置換対応） |
| マクロ置換 (`${id}`, `${type}`, `${attr}`) | ✅ | ✅ | payload/qsで使用可能 |
| `httpCustom.json` | ❌ | ✅ | JSONテンプレート（将来対応予定） |
| `httpCustom.ngsi` | ❌ | ✅ | NGSIパッチ（将来対応予定） |
| JEXL式 | ❌ | ✅ | 将来対応予定 |
| `attrsFormat` | ✅ | ✅ | |
| `exceptAttrs` | ✅ | ✅ | |
| `onlyChangedAttrs` | ✅ | ✅ | 変更された属性のみ通知に含める |
| **制御** | | | |
| `expires` (有効期限) | ✅ | ✅ | |
| `throttling` (スロットリング) | ✅ | ✅ | |
| `status` (一時停止) | ✅ | ✅ | |
| **統計情報** | | | |
| `timesSent` | ✅ | ✅ | |
| `lastNotification` | ✅ | ✅ | |
| `lastFailure` | ✅ | ✅ | |
| `lastSuccess` | ✅ | ✅ | |
| **通知配信** | | | |
| 順序保証 | ✅ (SQS FIFO) | ⚠️ 制限あり | |
| 再試行機能 | ✅ | ✅ | |
| Dead Letter Queue | ✅ | ❌ | |

## 登録/コンテキストプロバイダー

| 機能 | GeonicDB | FIWARE Orion | 備考 |
|------|:------------------:|:------------:|------|
| **Registration CRUD** | ✅ | ✅ | |
| エンティティタイプ登録 | ✅ | ✅ | |
| 属性登録 | ✅ | ✅ | |
| **フェデレーションクエリ** | ✅ | ✅ | 分散クエリ転送（getEntity/queryEntities） |
| **フェデレーション更新** | ✅ | ✅ | 分散更新転送（updateEntity/deleteEntity/deleteAttribute） |
| **分散オペレーション機能** | | | |
| CSR変更通知 (Ngsild-Trigger) | ✅ | ❌ | CSR作成/更新/削除時の自動通知（ETSI GS CIM 009 - 5.11） |
| ループ検出 (Via header) | ✅ | ❌ | 分散フェデレーションのループ防止（ETSI GS CIM 009 - 6.3.5） |
| 警告ヘッダー (NGSILD-Warning) | ✅ | ❌ | フェデレーション失敗時の警告伝播（ETSI GS CIM 009 - 6.3.6） |
| 分散タイプ/属性探索 | ✅ | ❌ | /types と /attributes がCSRも含む（ETSI GS CIM 009 - 5.9.3.3） |
| **モード** | | | |
| inclusive | ✅ | ✅ | ローカル+リモートを統合（NGSI-LD標準、NGSIv2拡張） |
| exclusive | ✅ | ✅ | リモートのみ返却（NGSI-LD標準、NGSIv2拡張） |
| redirect | ✅ | ✅ | 303リダイレクト（NGSI-LD標準、NGSIv2拡張） |
| auxiliary | ✅ | ✅ | ローカル優先、不足分をリモートで補完（NGSI-LD標準、NGSIv2拡張） |

## マルチテナンシー

| 機能 | GeonicDB | FIWARE Orion | 備考 |
|------|:------------------:|:------------:|------|
| `Fiware-Service` ヘッダー | ✅ | ✅ | テナント識別 |
| `Fiware-ServicePath` ヘッダー | ✅ | ✅ | 階層的パス |
| テナント自動分離 | ✅ | ✅ | |
| 階層的サービスパス | ✅ | ✅ | |
| 階層検索（`/#`） | ✅ | ✅ | `/path/#` で子パスも含めて検索 |
| 複数パス指定 | ✅ | ✅ | カンマ区切りで最大10パス |
| ヘッダー省略時の全検索 | ✅ | ✅ | クエリ時にヘッダー省略で全パス検索 |
| `Fiware-Correlator` ヘッダー | ✅ | ✅ | リクエスト追跡 |

## 認証・認可

| 機能 | GeonicDB | FIWARE Orion | 備考 |
|------|:------------------:|:------------:|------|
| **組み込み認証** | ✅ | ❌ | JWT認証・ロールベースアクセス制御 |
| JWT認証 | ✅ | ❌ | アクセストークン・リフレッシュトークン |
| ロールベースアクセス制御 | ✅ | ❌ | super_admin, tenant_admin, user |
| **OIDC 外部 IdP 連携** | ✅ | ❌ | OpenID Connect による外部認証プロバイダー連携 |
| **XACML ポリシーセット** | ✅ | ❌ | ポリシーセットによる階層的アクセス制御 |
| **外部認証連携** | | | |
| OAuth 2.0 | ⚠️ API Gateway経由 | ⚠️ PEP Proxy経由 | |
| Keyrock IdM連携 | ⚠️ API互換 | ✅ | API互換性により連携可能（未検証） |
| Wilma PEP Proxy | ⚠️ API互換 | ✅ | API互換性により連携可能（未検証） |
| AWS Cognito | ✅ | ❌ | API Gateway連携 |
| AWS IAM | ✅ | ❌ | Lambda Authorizer |

## データ連携基盤

| 機能 | GeonicDB | FIWARE Orion | 備考 |
|------|:------------------:|:------------:|------|
| **CADDE連携** | ✅ | ❌ | 分野間データ連携基盤 |
| `x-cadde-*` ヘッダー対応 | ✅ | ❌ | リソースURL・プロバイダ情報 |
| 来歴情報ヘッダー | ✅ | ❌ | `x-cadde-provenance-*` |
| Bearer認証（CADDE） | ✅ | ❌ | オプション |

## データカタログ

| 機能 | GeonicDB | FIWARE Orion | 備考 |
|------|:------------------:|:------------:|------|
| **DCAT-AP カタログ** | ✅ | ❌ | EU データポータル標準 |
| `GET /catalog` | ✅ | ❌ | DCAT-AP JSON-LD 形式 |
| `GET /catalog/datasets` | ✅ | ❌ | データセット一覧 |
| `GET /catalog/datasets/{id}` | ✅ | ❌ | データセット詳細 |
| `GET /catalog/datasets/{id}/sample` | ✅ | ❌ | サンプルデータ取得 |
| **CKAN 互換 API** | ✅ | ❌ | オープンデータポータル連携 |
| `/catalog/ckan/package_list` | ✅ | ❌ | パッケージID一覧 |
| `/catalog/ckan/package_show` | ✅ | ❌ | パッケージ詳細 |
| `/catalog/ckan/current_package_list_with_resources` | ✅ | ❌ | ページネーション対応一覧 |
| **CKAN ハーベスタ対応** | ✅ | ❌ | 自動データ収集対応 |

## AI連携

| 機能 | GeonicDB | FIWARE Orion | 備考 |
|------|:------------------:|:------------:|------|
| **MCP (Model Context Protocol)** | ✅ | ❌ | Streamable HTTP トランスポート、ステートレス |
| MCP ツール提供 | ✅ | ❌ | エンティティ CRUD・クエリ等を AI ツールとして公開 |
| MCP 認証 (JWT) | ✅ | ❌ | テナント分離対応 |
| **llms.txt** | ✅ | ❌ | AI/LLM 向け API ドキュメント (`GET /llms.txt`) |
| **tools.json** | ✅ | ❌ | AI エージェント向けツール定義 (`GET /tools.json`) |
| **OpenAPI 3.0** | ✅ | ✅ | `GET /openapi.json` |

## 運用・モニタリング

| 機能 | GeonicDB | FIWARE Orion | 備考 |
|------|:------------------:|:------------:|------|
| **ヘルスチェック** | ✅ | ✅ | |
| `/health` | ✅ | ✅ | |
| `/health/live` | ✅ | ❌ | Kubernetes Liveness |
| `/health/ready` | ✅ | ❌ | Kubernetes Readiness |
| **ログ** | | | |
| 構造化ログ (JSON) | ✅ | ✅ | |
| 監査ログ | ✅ | ❌ | 書き込み操作の who/what/when を構造化 JSON で出力 |
| AWS CloudWatch連携 | ✅ | ❌ | |
| **トレーシング** | | | |
| AWS X-Ray | ✅ | ❌ | |
| OpenTelemetry | ✅ | ⚠️ 制限あり | OTLP over HTTP/gRPC |
| **メトリクス** | | | |
| CloudWatch Metrics | ✅ | ❌ | |
| Prometheus | ✅ | ✅ | /metrics エンドポイント |

## デプロイメント

| 項目 | GeonicDB | FIWARE Orion | 備考 |
|------|:------------------:|:------------:|------|
| **デプロイ方式** | | | |
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
|------|------|
| **MCP (Model Context Protocol)** | [MCP](https://modelcontextprotocol.io/) 対応の AI ツールエンドポイント (`POST /mcp`)。Claude Desktop 等の AI クライアントから直接操作可能 |
| **llms.txt 対応** | [llms.txt 標準](https://llmstxt.org/)に準拠したAI/LLM向けAPIドキュメント (`GET /llms.txt`) |
| **空間ID (ZFXY) サポート** | 日本デジタル庁/IPA「空間IDガイドライン」準拠の3D空間識別 |
| **ベクトルタイル** | TileJSON 3.0準拠のGeoJSONベクトルタイル出力、自動クラスタリング対応 |
| **DCAT-AP カタログ** | EU データポータル標準の JSON-LD カタログ出力 (`GET /catalog`) |
| **CKAN 互換 API** | オープンデータポータル CKAN のハーベスタと連携可能 |
| **CADDE連携** | 分野間データ連携基盤（CADDE）コネクタとの連携機能 |
| **WebSocket イベントストリーミング** | AWS API Gateway WebSocket API によるリアルタイムエンティティ変更配信。エンティティタイプ・IDパターンでフィルタリング可能 |
| **スナップショット** | エンティティのポイントインタイム・スナップショット作成・復元（`/ngsi-ld/v1/snapshots`） |
| **EntityMap** | エンティティの分散マッピング・変換定義（`/ngsi-ld/v1/entityMaps`） |
| **適合性情報** | NGSI-LD 適合性情報エンドポイント（`/ngsi-ld/v1/info/conformance`）、ソースアイデンティティ（`/ngsi-ld/v1/info/sourceIdentity`） |
| **OIDC 外部 IdP 連携** | OpenID Connect による外部認証プロバイダー連携 |
| **XACML ポリシーセット** | ポリシーセットによる階層的アクセス制御管理 |
| **Temporal バッチ操作** | `temporal/entityOperations/create`, `upsert`, `delete`（ETSI GS CIM 009 仕様外の独自拡張） |
| **Time Series Collection** | MongoDB Time Series Collection による時系列データの最適化ストレージ、`$dateTrunc` 集計、TTL データ保持ポリシー |
| **サーバーレスアーキテクチャ** | AWS Lambda による自動スケーリング・従量課金 |
| **SQS FIFO 通知キュー** | 順序保証された通知配信 |
| **Dead Letter Queue** | 失敗通知の隔離・再処理 |
| **MongoDB Change Stream** | リアルタイムイベント検出 |
| **AWS X-Ray トレーシング** | 分散トレーシング対応 |
| **Kubernetes Probes** | `/health/live`, `/health/ready` エンドポイント |

### FIWARE Orion のみ

※ Keyrock IdM / Wilma PEP Proxy については、GeonicDB も API 互換性により連携可能です（上記「認証・認可」セクション参照）。

## 推奨ユースケース

### GeonicDB が適している場合

- AWS インフラを既に利用している
- サーバーレスアーキテクチャを採用したい
- 自動スケーリング・従量課金が必要
- 日本の空間ID標準への対応が必要
- CADDE（分野間データ連携基盤）との連携が必要
- 運用コストを最小化したい
- AI/LLM との連携を想定（llms.txt 対応）

### FIWARE Orion が適している場合

- オンプレミス環境での運用が必要
- FIWARE エコシステムの他コンポーネント (Keyrock, Wilma等) と連携
- Docker/Kubernetes での運用を想定
- AWS 以外のクラウドやマルチクラウド環境で運用

## 参考情報

- [GeonicDB リポジトリ](https://github.com/geolonia/geonicdb)
- [FIWARE Orion ドキュメント](https://fiware-orion.readthedocs.io/)
- [FIWARE Orion-LD リポジトリ](https://github.com/FIWARE/context.Orion-LD)
- [NGSIv2 仕様](https://fiware-orion.readthedocs.io/en/master/orion-api.html)
- [NGSI-LD 仕様 (ETSI)](https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/)
- [CADDE（分野間データ連携基盤）](https://www.cio.go.jp/cadde)
- [DCAT-AP（EU データポータル標準）](https://joinup.ec.europa.eu/collection/semic-support-centre/solution/dcat-application-profile-data-portals-europe)
- [CKAN API ドキュメント](https://docs.ckan.org/en/latest/api/)

---

*最終更新: 2026年2月*
