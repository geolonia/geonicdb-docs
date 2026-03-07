---
title: "Changelog"
description: "GeonicDB changelog"
outline: deep
---
# 変更履歴

このプロジェクトのすべての重要な変更は、このファイルに記録されます。

このフォーマットは [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に基づいており、
このプロジェクトは [Semantic Versioning](https://semver.org/lang/ja/) に準拠しています。

## [Unreleased]

### 2026-03-07
- **BREAKING**: `super_admin` ロールの権限をプラットフォーム管理操作（`/admin/*`、`/auth/*`）のみに制限 (#674)
  - データ API（`/v2/*`、`/ngsi-ld/*`、`/catalog*`、`/rules*`）へのアクセスは 403 Forbidden
  - MCP ツールのデータ操作も同様に拒否
  - `AUTH_ENABLED=false` 時の匿名 super_admin は従来通りアクセス可能（後方互換）
- **Feat**: API キー認証基盤の追加 (`/admin/api-keys`、`/me/api-keys`) (#676)
- **Feat**: テナント単位フィーチャーフラグ (`features.apiKeysEnabled`、`features.oauthClientsEnabled`) の追加 (#676)
- **Feat**: X-Api-Key ヘッダーによる認証のサポート (#676)
- **BREAKING**: `OAUTH_ENABLED` 環境変数の廃止（OAuth は `AUTH_ENABLED=true` なら常に有効） (#676)

### 2026-03-06
- **Fix**: 認証無効時に `/me` エンドポイントが匿名ユーザー情報を返すように修正 (#663)
- **Feat**: `limit=0` と `count` の組み合わせによるカウントのみクエリをサポート (#664)
- **Feat**: XACML AuthzRequest に entityType 自動抽出を追加 (#665)
  - PIP 拡張: `?type=` クエリパラメータまたはリクエストボディの `type`/`@type` フィールドから entityType を自動抽出
  - パスレベル認可（`requireAuthz`）でもエンティティタイプに基づくアクセス制御が可能に
  - E2E テスト追加: エンティティタイプによる書き込み拒否・読み取り拒否シナリオ
- **Fix**: `PATCH /entities/{id}/attrs` で新規属性の追加が可能に & NGSI-LD orderBy テスト追加 (#666)
- **Feat**: XACML エンティティ単位のオーナーシップ制御 (#650)
  - `EntityDocument` に `createdBy` フィールドを追加（エンティティ作成者の記録）
  - PIP（Policy Information Point）拡張: `buildAuthzRequest` にエンティティコンテキスト（`entityId`/`entityType`/`entityOwner`）を渡せるように
  - PDP（Policy Decision Point）拡張: リソース属性 `entityId`/`entityType`/`entityOwner` のマッチング対応
  - `${subject.userId}` 等のテンプレート変数展開（XACML AttributeDesignator 相当の簡略化実装）
  - `requireEntityAuthz` ヘルパー関数追加（エンティティレベル PEP）
  - 後方互換性: 全フィールド optional、既存ポリシー・既存エンティティへの影響なし

### 2026-03-05
- **Feat**: ユーザー自身による OAuth Client Credentials セルフサービス (#642)
  - `POST /me/oauth-clients` — 自分用の OAuth クライアントを作成（シークレットは作成時のみ返却）
  - `GET /me/oauth-clients` — 自分が作成したクライアント一覧を取得
  - `DELETE /me/oauth-clients/:id` — 自分が作成したクライアントを削除
  - `POST /me/oauth-clients/:id/regenerate-secret` — クライアントシークレットの再生成
  - ユーザーあたり最大 5 クライアント、ロールベースのスコープ制限（user ロールは resource スコープのみ）
  - `OAuthClient` に `createdBy` フィールドを追加（所有者追跡）

### 2026-03-03
- **Docs**: CLI リファレンス (`docs/CLI.md`) を追加 (#632)
  - `@geolonia/geonicdb-cli` (`geonic` コマンド) の全コマンドリファレンス
  - インストール、認証、設定・プロファイル管理、入出力フォーマット
  - entities、batch、subscriptions、registrations、temporal、snapshots、rules、admin 等の全コマンド

### 2026-03-02
- **Fix**: Custom Data Model バリデーションの複数の不具合を修正 (#597)
  - `validateValueType()` の case mismatch を修正（PascalCase `"String"` 等が lowercase `'string'` と不一致で型チェックが無効化されていた）
  - `batchCreateEntities` / `batchUpsertEntities` にカスタムデータモデルバリデーションを追加（type 別キャッシュ付き）
  - `getActiveDataModel()` のフェイルオープン動作を修正（DB 障害時にバリデーションをスキップせずエラーを伝播）

### 2026-02-28
- **Feat**: Crypto-Shredding と削除完了レポート生成 (#554)
  - `DELETE /admin/tenants/{tenantId}?shred=true` で暗号化テナントの Crypto-Shredding を実行
  - KMS CMK の DisableKey → ScheduleKeyDeletion → 全テナントデータ物理削除 → テナント論理削除
  - 削除完了レポート自動生成（ISMAP/ISO 27001/NIST SP 800-88 準拠）
  - `GET /admin/tenants/{tenantId}/deletion-report` でレポート取得
  - CloudTrail 監査イベント取得（best-effort）
  - テナント論理削除（`status: 'deleted'`）とクエリからの自動除外
- **Infra**: 単一リージョン Staging デプロイ対応 (#571)
  - `HasSecondaryRegion` 条件追加: `SecondaryRegion=""` 時に `AWS::DynamoDB::Table` を使用
  - 3 テーブル (DeploymentsTable、TokenInvalidationTable、UsageStatisticsTable) の単一リージョン版を追加
  - 環境変数・IAM ポリシー参照をネスト `!If` で切り替え
- **Infra**: Staging パラメータファイル追加 (#572)
  - `infrastructure/parameters/staging.json` を新規作成 (`Environment: staging`、`LogLevel: INFO`)
- **CI**: `ci.yml` に `workflow_call` トリガー追加 (#573)
  - CD ワークフロー (`deploy.yml`) から CI パイプラインを再利用可能に
- **CI**: CD パイプライン `deploy.yml` 新規作成 (#574、#575)
  - Staging: `main` マージで自動デプロイ（OIDC 認証、ヘルスチェック、デプロイ記録）
  - Production: `v*.*.*` タグで手動承認付きマルチリージョンデプロイ（Primary → Secondary → Route53）
  - `ci.yml` から `push: [main]` トリガーを削除（`deploy.yml` 経由の `workflow_call` に統合）

### 2026-02-27
- **Perf**: KMS Decrypt DEK キャッシュと並列数制限の導入 (#578)
  - 復号済み DEK をキャッシュし、同一エンベロープの繰り返し KMS DecryptCommand 呼び出しを排除
  - `ConcurrencyLimiter` により KMS API 並列呼び出しを制限（デフォルト: 10）
  - `entity.repository.ts`、`temporal.repository.ts`、`snapshot.repository.ts` のバッチ復号に適用
- **Feat**: 暗号化テナントでの時系列集計リクエストにランタイムチェックを追加 (#579)
  - `aggrMethod` パラメータ指定時に暗号化テナントを検出して 400 Bad Request を返却
  - 代替手段: `temporalValues` エンドポイントで復号後データを取得し、アプリケーション層で集計
- **BREAKING**: エンティティ ID の一意制約をテナントスコープ内で `entityId` 単独に変更 (#580)
  - インデックスを `(tenant, servicePath, entityId, entityType)` → `(tenant, servicePath, entityId)` に変更
  - 同一 ID で異なる type のエンティティ作成は `409 AlreadyExists` を返却
  - バッチ Upsert は `entityId` のみでマッチ（type の上書きが可能）
  - NGSIv2 の `?type=` パラメータによる type disambiguation を廃止
  - NGSI-LD の ID 一意セマンティクスと統一（GeonicDB 独自拡張）
- **Feat**: テナント単位 KMS CMK 導入と Envelope Encryption の実装 (#553)
  - テナント作成時に AWS KMS CMK を自動生成（`encryptionEnabled: true` 設定時）
  - エンティティ `attributes` フィールドを AES-256-GCM Envelope Encryption で暗号化
  - データキーキャッシュ（TTL/カウント/バイト制限）による KMS API 呼び出し最適化
  - テナント削除時の KMS 鍵無効化・削除スケジュール（Crypto-Shredding 対応）
  - 暗号化/非暗号化テナントの後方互換共存
  - Temporal/Snapshot リポジトリの暗号化統合
  - SAM テンプレート: KMS IAM ポリシー、DynamoDB SSE 設定、`EncryptionEnabled` パラメータ追加
  - 依存追加: `@aws-sdk/client-kms`
### 2026-02-25
- **Feat**: マルチリージョン HA アーキテクチャ Phase 1+2 (#557)
  - Active-Passive 構成 (Primary: ap-northeast-1、Secondary: ap-northeast-3)
  - ヘルスチェック強化: `/health`、`/health/live`、`/health/ready` に `region`、`regionRole` を追加
  - `/health/ready` を DynamoDB/EventBridge 深層チェック対応に拡張 (Route 53 フェイルオーバー用)
  - MongoDB クライアントに `readPreference`、`writeConcern`、`readConcern`、`retryWrites` の HA オプション追加
  - EventBridge イベントに `sourceRegion` メタデータを自動注入
  - Change Stream プロセッサのセカンダリリージョン自動無効化
  - Secrets Manager 統合 (JWT シークレット / MongoDB URI の安全な管理)
  - SAM テンプレート: `RegionRole` パラメータ、DynamoDB GlobalTable (3 テーブル)、WAF、条件付きリソース
  - Route 53 フェイルオーバースタック (`infrastructure/template-route53.yaml`)
  - フェイルオーバー自動化 Lambda + SNS 通知
  - 依存追加: `@aws-sdk/client-secrets-manager`、`@aws-sdk/client-sns`- **Feat**: テナント削除時の全関連データ連鎖削除を実装 (#556)
  - `DELETE /admin/tenants/{tenantId}` で全 16 コレクションのテナントデータを連鎖削除
  - Deactivate-first パターン: 削除前にテナントを自動的に `isActive: false` に設定
  - ユーザー存在チェック撤廃: ユーザーが存在するテナントも一括削除可能に
  - 削除順序: subscriptions → registrations → entities → snapshots → 設定 → 認証 → users → memberships
  - 各コレクションの削除件数を監査ログに記録
  - `TenantDataCleanupService` を独立サービスとして分離（Phase 2-3 Crypto-Shredding 拡張対応）

### 2026-02-24
- **Feat**: ReactiveCore Rules に `appendToTemporal` アクションタイプを追加 (#549)
  - エンティティ変更時にルールベースで Temporal API (Time Series Collection) へ自動追記
  - `attributes` で記録対象の属性を明示的に指定可能（省略時は `changedAttributes` を使用）
  - `TemporalService.recordEntityChange()` を内部的に呼び出し

### 2026-02-21
- **Fix**: minimatch ReDoS 脆弱性を修正 (Dependabot #5) (#537)
  - `minimatch` の npm override を追加し全インスタンスを `^10.2.1` に統一
  - ajv@6.12.6 (eslint devDependency) は 6.x 系にパッチなし、tolerable_risk として dismiss

### 2026-02-20
- **Feat**: リソーススコープ付きトークン Phase 1 (#536)
  - JWT にリソーススコープを埋め込み、エンティティタイプ/ID パターン/属性/操作レベルの細粒度アクセス制御を実現
  - `POST /auth/login`