# Implementation Plan: GeonicDB Documentation Site

**Branch**: `master` | **Date**: 2026-02-10 | **Spec**: `.specify/spec.md`
**Input**: Feature specification from `.specify/spec.md`

## Summary

GeonicDB（FIWARE Orion 互換 Context Broker）の公式ドキュメントサイトを VitePress で構築する。GeonicDB 本体の `docs/`（25ファイル、約12,000行）を Single Source of Truth として取り込みつつ、チュートリアルや導入事例等の独自コンテンツも管理する。日英2言語対応、9セクション構成。GeonicDB は当面 SaaS として提供し、OSS としては公開しない。

## Technical Context

**Language/Version**: TypeScript (Node.js 20.x+)
**Primary Dependencies**: VitePress 1.x (latest), Vue 3
**Storage**: N/A (静的サイト生成)
**Testing**: VitePress ビルド成功 + リンク検証スクリプト
**Target Platform**: Web (静的サイトホスティング: GitHub Pages)
**Project Type**: single (VitePress ドキュメントプロジェクト)
**Performance Goals**: ビルド時間 < 60秒、ページロード < 2秒
**Constraints**: GeonicDB 本体 docs/ との同期を維持、i18n 2言語
**Scale/Scope**: 約50ページ（25 取り込み + 25 オリジナル）、4ペルソナ対応

## 1. GeonicDB 本体 docs/ からの取り込みメカニズム

### 選択肢比較

| 方式 | メリット | デメリット | 評価 |
|------|---------|----------|------|
| **(A) ビルドスクリプト** | 変換ロジック自由、frontmatter 自動付与、セクション振り分け可能 | スクリプトのメンテナンスコスト | **推奨** |
| (B) シンボリックリンク | シンプル、リアルタイム反映 | OS依存、CI/CDで問題、変換不可 | 不採用 |
| (C) git submodule | バージョン固定可能 | 操作が複雑、開発者体験悪化 | 不採用 |

### 推奨: (A) ビルドスクリプト方式

**選定根拠**:
1. GeonicDB 本体の docs/ は日本語で書かれており、英語翻訳版を生成する必要がある → 変換ロジックが必要
2. ファイル名が大文字 (`API.md`, `AUTH_SCENARIOS.md`) → VitePress の URL に合わせて小文字ケバブケースに変換が必要
3. 各ファイルに VitePress frontmatter (`title`, `description`, `outline`) を自動付与する必要がある
4. 1ファイルを複数セクションページに分割するケースがある（例: `AUTH_SCENARIOS.md` → Security 配下の複数ページ）

**重要**: geonicdb 本体 (`geolonia/geonicdb`) と geonicdb-docs (`geolonia/geonicdb-docs`) は別 GitHub リポジトリ。ローカルパス直接参照は不可。GitHub リポジトリ経由で取り込む。

**スクリプト設計** (`scripts/sync-geonicdb-docs.ts`):

```
入力: GitHub API 経由で geolonia/geonicdb リポジトリの docs/ ディレクトリを取得
      (gh api repos/geolonia/geonicdb/contents/docs または git sparse-checkout)
出力: docs/ja/{section}/*.md (日本語版 = そのまま取り込み)

取得方式:
  - CI/CD: git sparse-checkout で geonicdb リポジトリの docs/ のみ clone
  - ローカル開発: GEONICDB_REPO_PATH 環境変数でローカル clone パスを指定可能（オプション）

処理:
1. geolonia/geonicdb リポジトリから docs/ の全 .md ファイルを取得
2. マッピングテーブルに従いセクション振り分け
3. frontmatter 付与（title, description, outline: deep）
4. ファイル名を小文字ケバブケースに変換
5. docs/ja/ 配下の該当ディレクトリにコピー
6. 英語版は手動翻訳 (docs/en/) — 初期は英語版未翻訳でも ja にフォールバック
```

## 2. VitePress ディレクトリ構成

```text
geonicdb-docs/
├── .specify/                    # speckit 管理
│   ├── spec.md
│   ├── plan.md
│   └── tasks.md (後続)
├── .gitignore
├── docs/                        # VitePress コンテンツルート
│   ├── .vitepress/
│   │   ├── config.ts            # メイン設定
│   │   ├── config/
│   │   │   ├── shared.ts        # 共通設定
│   │   │   ├── en.ts            # 英語ナビ・サイドバー
│   │   │   └── ja.ts            # 日本語ナビ・サイドバー
│   │   └── theme/
│   │       └── index.ts         # カスタムテーマ（必要に応じて）
│   ├── en/                      # 英語 (プライマリ)
│   │   ├── index.md             # ランディングページ
│   │   ├── introduction/
│   │   │   ├── what-is-geonicdb.md
│   │   │   ├── why-geonicdb.md
│   │   │   ├── architecture.md
│   │   │   └── quick-start.md
│   │   ├── getting-started/
│   │   │   ├── installation.md
│   │   │   ├── first-entity.md
│   │   │   └── demo-app.md
│   │   ├── core-concepts/
│   │   │   ├── ngsi-data-model.md
│   │   │   ├── multi-tenancy.md
│   │   │   ├── ngsiv2-vs-ngsild.md
│   │   │   └── query-language.md
│   │   ├── api-reference/
│   │   │   ├── ngsiv2.md
│   │   │   ├── ngsild.md
│   │   │   ├── admin.md
│   │   │   ├── endpoints.md
│   │   │   ├── pagination.md
│   │   │   └── status-codes.md
│   │   ├── features/
│   │   │   ├── subscriptions.md
│   │   │   ├── federation.md
│   │   │   ├── geo-zfxy.md
│   │   │   ├── vector-tiles.md
│   │   │   ├── temporal.md
│   │   │   ├── catalog.md
│   │   │   ├── smart-data-models.md
│   │   │   └── snapshots.md
│   │   ├── ai-integration/
│   │   │   ├── overview.md
│   │   │   ├── mcp-server.md
│   │   │   ├── llms-txt.md
│   │   │   ├── tools-json.md
│   │   │   └── examples.md
│   │   ├── security/
│   │   │   └── index.md              # Coming Soon ページ
│   │   ├── japan-standards/
│   │   │   ├── cadde.md
│   │   │   ├── spatial-id-zfxy.md
│   │   │   └── smart-city-cases.md
│   │   └── migration/
│   │       ├── orion-to-geonicdb.md
│   │       └── compatibility-matrix.md
│   └── ja/                      # 日本語
│       ├── index.md
│       └── (en/ と同構成)
├── scripts/
│   └── sync-geonicdb-docs.ts        # GeonicDB docs 取り込みスクリプト
├── package.json
├── pnpm-lock.yaml
└── tsconfig.json
```

**ページ数**: 約 38 ページ/言語 × 2言語 = 約 76 ページ

## 3. i18n 構成

VitePress のルートベース i18n を採用:

```typescript
// .vitepress/config.ts
export default defineConfig({
  locales: {
    en: {
      label: 'English',
      lang: 'en',
      link: '/en/',
    },
    ja: {
      label: '日本語',
      lang: 'ja',
      link: '/ja/',
    },
  },
})
```

**方針**:
- `/en/` が英語（プライマリ）
- `/ja/` が日本語
- ルート `/` は `/en/` にリダイレクト
- GeonicDB 本体 docs/ は日本語 → `docs/ja/` にそのまま取り込み
- 英語版は手動翻訳（`docs/en/`）。初期は日本語のみでも可
- 未翻訳ページはプライマリ言語（英語）にフォールバック

## 4. サイドバー・ナビゲーション設計

### トップナビゲーション

```
[GeonicDB] [Getting Started] [API Reference] [Features] [AI] [GitHub ↗]
```

### サイドバー（9セクション）

```
Introduction
├── What is GeonicDB?
├── Why GeonicDB?
├── Architecture
└── Quick Start

Getting Started
├── Installation
├── First Entity Tutorial
└── Demo App

Core Concepts
├── NGSI Data Model
├── Multi-Tenancy
├── NGSIv2 vs NGSI-LD
└── Query Language

API Reference
├── NGSIv2 API
├── NGSI-LD API
├── Admin API
├── Endpoints
├── Pagination
└── Status Codes

Features
├── Subscriptions
├── Federation
├── Geo / ZFXY
├── Vector Tiles
├── Temporal
├── Catalog
├── Smart Data Models
└── Snapshots

AI Integration
├── Overview
├── MCP Server
├── llms.txt
├── tools.json
└── Examples

Security (Coming Soon)
└── index.md              # Coming Soon 表示のみ

Japan Standards
├── CADDE
├── Spatial ID / ZFXY
└── Smart City Cases

Migration
├── Orion → GeonicDB Guide
└── Compatibility Matrix
```

## 5. GeonicDB 更新追随フロー

### CI/CD パイプライン (GitHub Actions)

```
geonicdb リポジトリ (docs/ 更新)
  → repository_dispatch イベント発火
  → geonicdb-docs の GitHub Actions ワークフロー起動
  → sync-geonicdb-docs.ts 実行
  → 差分があれば PR 自動作成
```

### ワークフロー設計

**geonicdb 側** (`.github/workflows/docs-sync-trigger.yml`):
```yaml
on:
  push:
    paths: ['docs/**']
    branches: [main]
jobs:
  trigger:
    runs-on: ubuntu-latest
    steps:
      - uses: peter-evans/repository-dispatch@v3
        with:
          repository: geolonia/geonicdb-docs
          event-type: geonicdb-docs-updated
```

**geonicdb-docs 側** (`.github/workflows/sync-geonicdb-docs.yml`):
```yaml
on:
  repository_dispatch:
    types: [geonicdb-docs-updated]
  workflow_dispatch:  # 手動トリガーも可能
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4            # geonicdb-docs をチェックアウト
      - uses: actions/checkout@v4            # geonicdb を sparse-checkout (docs/ のみ)
        with:
          repository: geolonia/geonicdb
          path: .geonicdb-upstream
          sparse-checkout: docs
          sparse-checkout-cone-mode: false
      - uses: pnpm/action-setup@v4
      - run: pnpm install
      - run: GEONICDB_REPO_PATH=.geonicdb-upstream pnpm run sync-docs
      - 差分チェック (git diff)
      - 差分があれば PR 作成 (peter-evans/create-pull-request)
      - .geonicdb-upstream は .gitignore に含まれるため commit されない
```

### 差分検知メカニズム

1. `sync-geonicdb-docs.ts` 実行後、`git diff --stat` で変更ファイルをリスト
2. 変更がなければ何もしない
3. 変更があれば PR を自動作成（タイトル: `docs: sync from geonicdb/docs (YYYY-MM-DD)`）
4. PR 本文に変更されたファイル一覧を記載

## 6. GeonicDB 本体 docs/ と geonicdb-docs ページの対応表

| GeonicDB docs/ ファイル | 行数 | geonicdb-docs セクション | geonicdb-docs ページ |
|---------------------|------|---------------------|-----------------|
| API.md | 2,092 | API Reference | api-reference/endpoints.md (共通仕様部分) |
| API_NGSIV2.md | 991 | API Reference | api-reference/ngsiv2.md |
| API_NGSILD.md | 1,320 | API Reference | api-reference/ngsild.md |
| API_ENDPOINTS.md | 439 | API Reference | api-reference/endpoints.md |
| API_ENDPOINTS_NGSIV2.md | — | API Reference | api-reference/ngsiv2.md (統合) |
| API_ENDPOINTS_NGSILD.md | — | API Reference | api-reference/ngsild.md (統合) |
| AUTH_SCENARIOS.md | 1,564 | Security (Coming Soon) | security/index.md (将来展開時に活用) |
| AUTH_OAUTH.md | 887 | Security (Coming Soon) | security/index.md (将来展開時に活用) |
| AUTH_ADMIN.md | 774 | API Reference | api-reference/admin.md |
| AI_INTEGRATION.md | 150 | AI Integration | ai-integration/overview.md, ai-integration/tools-json.md, ai-integration/examples.md |
| MCP.md | 159 | AI Integration | ai-integration/mcp-server.md |
| SMART_DATA_MODELS.md | 251 | Features | features/smart-data-models.md |
| WEBAPP_INTEGRATION.md | 1,666 | Features | features/subscriptions.md (WebSocket 部分) |
| EVENT_STREAMING.md | 288 | Features | features/subscriptions.md (統合) |
| INTEROPERABILITY.md | 1,039 | Core Concepts | core-concepts/ngsiv2-vs-ngsild.md |
| CATALOG.md | 254 | Features | features/catalog.md |
| PAGINATION.md | 295 | API Reference | api-reference/pagination.md |
| STATUS_CODES.md | 704 | API Reference | api-reference/status-codes.md |
| DEVELOPMENT.md | 480 | Getting Started | getting-started/installation.md (開発者向け部分) |
| DEMO_SCENARIO.md | 734 | Getting Started | getting-started/demo-app.md, getting-started/first-entity.md |
| FIWARE_ORION_COMPARISON.md | 411 | Migration | migration/compatibility-matrix.md |
| FAQ.md | 400 | (トップレベル) | faq.md (各セクションに分散 or 独立ページ) |
| README.md | — | (参照のみ) | Introduction ページの素材 |

### オリジナルコンテンツ（geonicdb-docs 独自）

| ページ | セクション | 内容 |
|--------|-----------|------|
| what-is-geonicdb.md | Introduction | GeonicDB 概要（README.md ベースに拡充） |
| why-geonicdb.md | Introduction | Orion との違い・メリット訴求 |
| architecture.md | Introduction | アーキテクチャ図（新規作成） |
| quick-start.md | Introduction | 3ステップ起動（README.md ベース） |
| ngsi-data-model.md | Core Concepts | NGSI データモデル解説（新規） |
| multi-tenancy.md | Core Concepts | マルチテナンシー解説（新規） |
| query-language.md | Core Concepts | クエリ言語解説（API.md から抽出・拡充） |
| geo-zfxy.md | Features | 地理空間・ZFXY（新規） |
| vector-tiles.md | Features | ベクトルタイル（新規） |
| temporal.md | Features | Temporal API（新規） |
| snapshots.md | Features | スナップショット（新規） |
| federation.md | Features | フェデレーション（新規） |
| llms-txt.md | AI Integration | llms.txt 解説（新規） |
| cadde.md | Japan Standards | CADDE 連携（新規） |
| spatial-id-zfxy.md | Japan Standards | 空間ID 解説（新規） |
| smart-city-cases.md | Japan Standards | スマートシティ事例（新規） |
| orion-to-geonicdb.md | Migration | SaaS 移行ガイド（新規） |

## 7. 技術スタック詳細

| 項目 | 選定 | 根拠 |
|------|------|------|
| **フレームワーク** | VitePress 1.x (latest) | Vite ベース、Markdown 中心、i18n 組み込み、Vue 3 カスタマイズ |
| **Node.js** | 20.x+ | GeonicDB 本体と統一 |
| **パッケージマネージャ** | pnpm | geonicdb-demo-app と統一、高速・ディスク効率 |
| **ビルドスクリプト** | tsx (TypeScript 実行) | 型安全な変換ロジック |
| **検索** | VitePress 組み込み (MiniSearch) | 初期は組み込みで十分。規模拡大時に Algolia DocSearch 移行 |
| **デプロイ先** | GitHub Pages | 無料、CDN 配信、GitHub 連携 |
| **CI/CD** | GitHub Actions | geonicdb リポジトリとの連携、PR 自動作成 |

### package.json 主要依存

```json
{
  "devDependencies": {
    "vitepress": "^1.6.0",
    "tsx": "^4.0.0",
    "vue": "^3.5.0"
  },
  "scripts": {
    "docs:dev": "vitepress dev docs",
    "docs:build": "vitepress build docs",
    "docs:preview": "vitepress preview docs",
    "sync-docs": "tsx scripts/sync-geonicdb-docs.ts"
  }
}
```

## Project Structure

### Source Code (repository root)

```text
geonicdb-docs/
├── docs/                        # VitePress コンテンツルート
│   ├── .vitepress/
│   │   ├── config.ts            # メイン設定（locales, themeConfig）
│   │   └── config/
│   │       ├── shared.ts        # 共通設定
│   │       ├── en.ts            # 英語サイドバー・ナビ
│   │       └── ja.ts            # 日本語サイドバー・ナビ
│   ├── en/                      # 英語コンテンツ（38ページ）
│   └── ja/                      # 日本語コンテンツ（38ページ）
├── scripts/
│   └── sync-geonicdb-docs.ts        # GeonicDB docs 取り込みスクリプト
├── .specify/                    # speckit 管理
├── .github/
│   └── workflows/
│       └── sync-geonicdb-docs.yml   # 自動同期ワークフロー
├── package.json
├── pnpm-lock.yaml
└── tsconfig.json
```

**Structure Decision**: VitePress 標準の単一プロジェクト構成。`docs/` がコンテンツルート、`scripts/` がビルドツール。i18n はディレクトリベース (`/en/`, `/ja/`)。
