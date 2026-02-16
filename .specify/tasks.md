# Tasks: GeonicDB Documentation Site

**Input**: Design documents from `.specify/` (spec.md, plan.md)
**Prerequisites**: plan.md (required), spec.md (required for user stories)

**Tests**: 各Phase完了条件に基づく手動検証。VitePress ビルド成功 + ブラウザ確認。

**Organization**: Tasks are grouped by implementation phase. Phase 1-2 は基盤構築、Phase 3-6 はセクション別コンテンツ作成、Phase 7 は統合・仕上げ。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[USx]**: Which user story this task belongs to (e.g., US1, US4)
- Include exact file paths in descriptions

## Path Conventions

- **VitePress 設定**: `docs/.vitepress/`
- **英語コンテンツ**: `docs/en/`
- **日本語コンテンツ**: `docs/ja/`
- **ビルドスクリプト**: `scripts/`
- **CI/CD**: `.github/workflows/`
- **speckit 管理**: `.specify/`

---

## Phase 1: Project Setup & VitePress Foundation [US4]

**Purpose**: VitePress プロジェクト初期化、i18n 設定、基本ナビゲーション構築

- [ ] T001 [US4] pnpm init + VitePress インストール — `package.json` 作成、`pnpm add -D vitepress vue`、`docs:dev`/`docs:build`/`docs:preview` スクリプト追加
- [ ] T002 [US4] VitePress 設定ファイル作成 — `docs/.vitepress/config.ts`（メイン）、`docs/.vitepress/config/shared.ts`（共通）、`docs/.vitepress/config/en.ts`（英語）、`docs/.vitepress/config/ja.ts`（日本語）
- [ ] T003 [US4] i18n ルーティング設定 — locales 設定（`/en/` プライマリ、`/ja/` 日本語）、ルート `/` → `/en/` リダイレクト
- [ ] T004 [US4] サイドバー・ナビゲーション定義 — 9セクションのサイドバー構成を `en.ts`/`ja.ts` に定義。Security は Coming Soon 注記付き
- [ ] T005 [P] [US4] ランディングページ作成 — `docs/en/index.md`、`docs/ja/index.md`（VitePress Hero + Features レイアウト）
- [ ] T006 [P] [US4] `.github/workflows/deploy.yml` 作成 — GitHub Pages デプロイワークフロー（push to main → build → deploy）
- [ ] T007 [P] [US4] `tsconfig.json` 作成 — TypeScript 設定（scripts/ 用）

**Checkpoint**: `pnpm docs:dev` でローカルプレビュー起動、日英切り替え動作、9セクションのサイドバー表示

---

## Phase 2: Docs Sync Infrastructure [US1, US5]

**Purpose**: GeonicDB 本体 docs/ 取り込みスクリプト + CI/CD 自動同期パイプライン

- [ ] T008 [US1] `scripts/sync-geonicdb-docs.ts` 作成 — GeonicDB 本体 docs/ を VitePress 形式に変換するビルドスクリプト。ファイル名小文字ケバブケース変換、frontmatter 自動付与、セクション振り分け
- [ ] T009 [US1] マッピングテーブル定義 — plan.md Section 6 の対応表を `scripts/sync-geonicdb-docs.ts` 内に実装（25ファイル → 各セクションへの振り分け）
- [ ] T010 [US1] `package.json` に `sync-docs` スクリプト追加 — `tsx scripts/sync-geonicdb-docs.ts`
- [ ] T011 [US1] `.github/workflows/sync-geonicdb-docs.yml` 作成 — repository_dispatch + workflow_dispatch トリガー、sparse-checkout で geonicdb docs/ 取得、sync-docs 実行、差分 PR 自動作成
- [ ] T012 [P] [US5] リンク検証スクリプト作成 — ビルド後の HTML 内リンク（内部リンク + 外部リンク）の死活チェックスクリプト

**Checkpoint**: `pnpm sync-docs` で GeonicDB docs/ が `docs/ja/` 配下に正しく変換・配置される。VitePress ビルド成功

---

## Phase 3: Core Content - Introduction & Getting Started [US1, US4]

**Purpose**: サイトの入口ページ群を作成。Quick Start は SaaS API 向け

- [ ] T013 [P] [US1] `docs/en/introduction/what-is-geonicdb.md` 作成 — GeonicDB 概要（AWS Lambda + MongoDB Atlas、Orion 互換、AI ネイティブ）
- [ ] T014 [P] [US1] `docs/en/introduction/why-geonicdb.md` 作成 — Orion との主要な違い9項目
- [ ] T015 [P] [US1] `docs/en/introduction/architecture.md` 作成 — Lambda → API Gateway → MongoDB Atlas のアーキテクチャ図、src/ ディレクトリ構造
- [ ] T016 [P] [US4] `docs/en/introduction/quick-start.md` 作成 — SaaS API エンドポイントへの curl コマンド例。API キー取得は Coming Soon / プレースホルダー
- [ ] T017 [P] [US4] `docs/en/getting-started/installation.md` 作成 — SaaS API アクセス方法（エンドポイント URL、API キー取得手順 Coming Soon）
- [ ] T018 [P] [US4] `docs/en/getting-started/first-entity.md` 作成 — NGSIv2 エンティティ CRUD チュートリアル（SaaS エンドポイント向け curl 例）
- [ ] T019 [P] [US4] `docs/en/getting-started/demo-app.md` 作成 — geonicdb-demo-app への導線と概要
- [ ] T020 [US1, US4] Introduction & Getting Started の日本語版作成 — `docs/ja/introduction/`、`docs/ja/getting-started/` に翻訳版配置

**Checkpoint**: Introduction 4ページ + Getting Started 3ページが日英で閲覧可能。Quick Start の curl 例がコピー可能

---

## Phase 4: Core Content - API Reference & Core Concepts [US1, US4, US5]

**Purpose**: API リファレンスと基本概念ページを作成。GeonicDB docs/ からの取り込みコンテンツが中心

- [ ] T021 [P] [US5] `docs/en/core-concepts/ngsi-data-model.md` 作成 — Entity, Attribute, Metadata の基本概念
- [ ] T022 [P] [US5] `docs/en/core-concepts/multi-tenancy.md` 作成 — Fiware-Service / Fiware-ServicePath ヘッダー
- [ ] T023 [P] [US5] `docs/en/core-concepts/ngsiv2-vs-ngsild.md` 作成 — 両 API 比較、Unified Internal Format（INTEROPERABILITY.md ベース）
- [ ] T024 [P] [US5] `docs/en/core-concepts/query-language.md` 作成 — q/mq/scopeQ/pick/omit/lang パラメータ（API.md から抽出）
- [ ] T025 [P] [US1] `docs/en/api-reference/ngsiv2.md` 作成 — NGSIv2 全エンドポイント（API_NGSIV2.md ベース）
- [ ] T026 [P] [US1] `docs/en/api-reference/ngsild.md` 作成 — NGSI-LD 全エンドポイント（API_NGSILD.md ベース）
- [ ] T027 [P] [US1] `docs/en/api-reference/admin.md` 作成 — Admin API（AUTH_ADMIN.md ベース）
- [ ] T028 [P] [US1] `docs/en/api-reference/endpoints.md` 作成 — 共通仕様（API.md ベース）
- [ ] T029 [P] [US1] `docs/en/api-reference/pagination.md` 作成 — PAGINATION.md ベース
- [ ] T030 [P] [US1] `docs/en/api-reference/status-codes.md` 作成 — STATUS_CODES.md ベース
- [ ] T031 [US1, US5] Core Concepts & API Reference の日本語版作成 — `docs/ja/` 配下に翻訳版配置

**Checkpoint**: Core Concepts 4ページ + API Reference 6ページが日英で閲覧可能。エンドポイント一覧・パラメータ・レスポンス例が含まれる

---

## Phase 5: Feature Content - Features, AI, Japan Standards, Security, Migration [US1, US2, US3, US5, US6]

**Purpose**: 残り5セクションのコンテンツを作成

### Features (8ページ)

- [ ] T032 [P] [US5] `docs/en/features/subscriptions.md` 作成 — HTTP Webhook、MQTT、WebSocket、スロットリング、マクロ置換（WEBAPP_INTEGRATION.md + EVENT_STREAMING.md ベース）
- [ ] T033 [P] [US5] `docs/en/features/federation.md` 作成 — CSR、分散クエリ、ループ検出、モード
- [ ] T034 [P] [US5] `docs/en/features/geo-zfxy.md` 作成 — ジオクエリ演算子、空間ID (ZFXY)、GeoJSON
- [ ] T035 [P] [US5] `docs/en/features/vector-tiles.md` 作成 — TileJSON 3.0、自動クラスタリング
- [ ] T036 [P] [US5] `docs/en/features/temporal.md` 作成 — Temporal API、TTL、バッチ
- [ ] T037 [P] [US5] `docs/en/features/catalog.md` 作成 — DCAT-AP、CKAN 互換、CADDE（CATALOG.md ベース）
- [ ] T038 [P] [US5] `docs/en/features/smart-data-models.md` 作成 — SMART_DATA_MODELS.md ベース
- [ ] T039 [P] [US5] `docs/en/features/snapshots.md` 作成 — スナップショット作成・復元

### AI Integration (5ページ)

- [ ] T040 [P] [US3] `docs/en/ai-integration/overview.md` 作成 — AI ネイティブ概要（AI_INTEGRATION.md ベース）
- [ ] T041 [P] [US3] `docs/en/ai-integration/mcp-server.md` 作成 — POST /mcp、Streamable HTTP、Claude Desktop 設定（MCP.md ベース）
- [ ] T042 [P] [US3] `docs/en/ai-integration/llms-txt.md` 作成 — llms.txt 標準、GET / レスポンス
- [ ] T043 [P] [US3] `docs/en/ai-integration/tools-json.md` 作成 — 8ツール一覧、Claude Tool Use / OpenAI Function Calling スキーマ
- [ ] T044 [P] [US3] `docs/en/ai-integration/examples.md` 作成 — Python + Claude API / OpenAI API コード例

### Security (1ページ - Coming Soon)

- [ ] T045 [P] [US6] `docs/en/security/index.md` 作成 — Coming Soon 表示。SaaS 提供開始後に JWT、OAuth/OIDC、RBAC、XACML、IP制限のドキュメントを公開予定と記載

### Japan Standards (3ページ)

- [ ] T046 [P] [US2] `docs/en/japan-standards/cadde.md` 作成 — CADDE 連携（x-cadde-* ヘッダー、来歴情報、Bearer 認証）
- [ ] T047 [P] [US2] `docs/en/japan-standards/spatial-id-zfxy.md` 作成 — デジタル庁/IPA 空間ID準拠仕様
- [ ] T048 [P] [US2] `docs/en/japan-standards/smart-city-cases.md` 作成 — スマートシティ・IoT ユースケース

### Migration (2ページ)

- [ ] T049 [P] [US1] `docs/en/migration/orion-to-geonicdb.md` 作成 — Orion セルフホスト → GeonicDB SaaS 移行手順（API エンドポイント変更、認証切替、サブスクリプション移行）
- [ ] T050 [P] [US1] `docs/en/migration/compatibility-matrix.md` 作成 — NGSIv2/NGSI-LD 全エンドポイント対応状況、非互換点（FIWARE_ORION_COMPARISON.md ベース）

### 日本語版

- [ ] T051 [US1-US6] Phase 5 全コンテンツの日本語版作成 — `docs/ja/` 配下に翻訳版配置（Features 8ページ、AI 5ページ、Security 1ページ、Japan Standards 3ページ、Migration 2ページ）

**Checkpoint**: 全9セクションの全ページが日英で閲覧可能。VitePress ビルド成功。サイト内検索で「subscription」「CADDE」「ZFXY」「MCP」がヒット

---

## Phase 6: Integration & Quality [全US]

**Purpose**: サイト全体の統合テスト、リンク検証、パフォーマンス確認

- [ ] T052 [P] VitePress ビルド成功確認 — `pnpm docs:build` が全ページで成功し、ビルド時間 < 60秒
- [ ] T053 [P] リンク検証実行 — T012 で作成したスクリプトで全内部リンク + 外部リンクを検証、404 がないこと
- [ ] T054 [P] レスポンシブデザイン確認 — モバイル表示でレイアウトが崩れないことを確認（VitePress デフォルトテーマ準拠）
- [ ] T055 [P] サイト内検索テスト — VitePress 組み込み検索で主要キーワード（subscription, CADDE, ZFXY, MCP, migration）がヒットすることを確認
- [ ] T056 [P] ダークモード/ライトモード切り替え確認 — 全ページで表示が崩れないこと
- [ ] T057 [P] GitHub Pages デプロイテスト — `.github/workflows/deploy.yml` による自動デプロイが成功すること
- [ ] T058 OpenAPI 自動生成検討 — FR-130 に基づき、`GET /openapi.json` からの API ドキュメント自動生成パイプラインの設計・PoC

**Checkpoint**: GitHub Pages にデプロイされたサイトで全SC（SC-001〜SC-010）が達成されている

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: 依存なし — 即時開始可能
- **Phase 2 (Sync Infra)**: Phase 1 完了が前提 — sync-docs スクリプトは VitePress 設定に依存
- **Phase 3 (Intro & Getting Started)**: Phase 1 完了が前提。Phase 2 と **並列可能**（オリジナルコンテンツのみのため）
- **Phase 4 (API Ref & Core Concepts)**: Phase 2 完了が前提（GeonicDB docs/ 取り込みコンテンツを含むため）。Phase 3 と **並列可能**
- **Phase 5 (Features 他)**: Phase 2 完了が前提。Phase 3, 4 と **並列可能**
- **Phase 6 (Integration)**: Phase 1〜5 全完了が前提

### Execution Flow Diagram

```text
Phase 1 (Setup)
  │
  ├──────────────┐
  ▼              ▼
Phase 2        Phase 3
(Sync Infra)   (Intro & Getting Started)
  │
  ├──────────┐
  ▼          ▼
Phase 4    Phase 5
(API Ref)  (Features 他)
  │          │
  ▼          ▼
Phase 6 (Integration) ← 全Phase完了後
```

### Parallel Opportunities

- **Phase 1 内**: T005 (ランディングページ), T006 (deploy.yml), T007 (tsconfig) は T001〜T004 完了後に並列可能
- **Phase 2 内**: T012 (リンク検証) は T008〜T011 と並列可能
- **Phase 3 内**: T013〜T019 は全て並列可能（個別ページ作成）
- **Phase 4 内**: T021〜T030 は全て並列可能
- **Phase 5 内**: T032〜T050 は全て並列可能（個別ページ作成）
- **Phase 6 内**: T052〜T057 は全て並列可能

---

## Implementation Strategy

### MVP First (Phase 1 → 2 → 3)

1. Phase 1: VitePress 環境構築（サイドバー・i18n 設定）
2. Phase 2: GeonicDB docs/ 取り込みスクリプト + CI/CD
3. Phase 3: Introduction + Getting Started = **MVP 完成**
4. **STOP and VALIDATE**: Quick Start が SaaS API 向けに動作、日英切り替え OK

### Incremental Delivery

1. MVP (Phase 1-3) → サイト骨格 + 入口ページ
2. + Phase 4 → API リファレンス追加
3. + Phase 5 → 全セクション完成
4. Phase 6 → 品質確認 + デプロイ

---

## Notes

- [P] タスク = 異なるファイル対象、依存関係なし、並列実行可能
- [USx] = spec.md のユーザーストーリーへの紐付け
- Security セクションは Coming Soon（SaaS 認証基盤の設計確定後に詳細化）
- Deployment セクションは SaaS 方針により削除済み（OSS セルフホスト非対応）
- 英語がプライマリ。日本語版は各 Phase の最終タスクで一括作成
- GeonicDB docs/ 取り込みは sync-geonicdb-docs.ts 経由。ローカルパス直接参照不可（GitHub リポジトリ経由）
