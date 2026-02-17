# GeonicDB ドキュメント

🇬🇧 [English version](README.md)

## 概要

このリポジトリは **GeonicDB** の公式ドキュメントを提供します。GeonicDB は、サーバーレス環境で動作する FIWARE Orion 互換 Context Broker です。ドキュメントサイトは VitePress で構築されており、包括的なガイド、API リファレンス、統合例を提供しています。

**GeonicDB** は、FIWARE 標準をサーバーレス環境に持ち込む次世代 Context Broker です：

- **AI ネイティブ**: MCP サーバー、llms.txt、tools.json、OpenAPI 3.0 を標準搭載し、AI エージェントとのシームレスな統合を実現
- **サーバーレス**: AWS Lambda 上で動作し、オートスケールと従量課金を実現
- **デュアル API サポート**: 単一インスタンスで NGSIv2 と NGSI-LD の両方をサポート
- **日本標準対応**: CADDE 互換、来歴追跡機能を搭載

🌐 **公開ドキュメント**: https://docs.geonicdb.org/

## 技術スタック

- **VitePress** 1.6.x - ドキュメント用静的サイトジェネレーター
- **TypeScript** - 型安全な開発環境
- **i18n** - 英語・日本語の多言語対応
- **yuuhitsu** - AI翻訳ツール

## はじめに

### 前提条件

- Node.js 20.x 以上
- pnpm 10.29.2 以上

### インストール

```bash
# リポジトリをクローン
git clone https://github.com/geolonia/geonicdb-docs.git
cd geonicdb-docs

# 依存関係をインストール
pnpm install
```

### 開発

開発サーバーを起動:

```bash
pnpm docs:dev
```

http://localhost:5173 でサイトが表示されます。

### ビルド

本番環境用の静的サイトをビルド:

```bash
pnpm docs:build
```

本番ビルドをプレビュー:

```bash
pnpm docs:preview
```

## テスト

### ユニットテスト

Vitest でユニットテストを実行:

```bash
pnpm test          # すべてのユニットテストを実行
pnpm test:unit     # ユニットテストのみ実行
```

### E2E テスト

Playwright で E2E テストを実行:

```bash
pnpm test:e2e      # E2E テストを実行
```

### すべてのテスト

すべてのテスト（ユニット + E2E）を実行:

```bash
pnpm test:all
```

## 翻訳

ドキュメントは英語と日本語の両方で提供されています。翻訳の一貫性を保つため、**yuuhitsu** AI翻訳CLIを開発依存関係として統合しています。

ドキュメントを翻訳するには:

```bash
# .env に API キーを設定
ANTHROPIC_API_KEY=your_api_key_here

# 英語ファイルを日本語に翻訳
pnpm translate:ja -- docs/en/path/to/file.md

# 日本語ファイルを英語に翻訳
pnpm translate:en -- docs/ja/path/to/file.md
```

## プロジェクト構造

```
docs/
├── en/                         # 英語ドキュメント
│   ├── introduction/          # 入門ガイド
│   ├── core-concepts/         # コアコンセプト
│   ├── features/              # 機能ガイド
│   ├── api-reference/         # API ドキュメント
│   ├── ai-integration/        # AI 統合ガイド
│   ├── security/              # セキュリティ・認証
│   ├── japan-standards/       # 日本標準（CADDE等）
│   ├── migration/             # 移行ガイド
│   └── index.md               # 英語版ホームページ
├── ja/                         # 日本語ドキュメント
│   └── (en/ と同じ構造)
└── .vitepress/
    ├── config/                 # VitePress 設定
    └── theme/                  # カスタムテーマ
```

## コントリビューション

コントリビューションを歓迎します！以下のガイドラインに従ってください:

1. **ブランチを作成**してから変更を加える:
   ```bash
   git checkout -b feat/your-feature
   ```

2. **main への直接 push は禁止** - 必ずプルリクエストを作成してください

3. **テストを実行**してから提出:
   ```bash
   pnpm test:all
   ```

4. **CodeRabbit レビュー** - CodeRabbit からの Actionable 以上の指摘にすべて対応してください

5. **PR を提出**する際は、変更内容を明確に説明してください

### ワークフロー

- すべての PR は CI チェック（ユニットテスト + E2E テスト）に合格する必要があります
- CodeRabbit が自動的に PR をレビューします
- マージには少なくとも1名のメンテナーの承認が必要です

## スクリプト一覧

| コマンド | 説明 |
|---------|------|
| `pnpm docs:dev` | 開発サーバーを起動 |
| `pnpm docs:build` | 本番環境用にビルド |
| `pnpm docs:preview` | 本番ビルドをプレビュー |
| `pnpm test` | ユニットテストを実行 |
| `pnpm test:unit` | ユニットテストのみ実行 |
| `pnpm test:e2e` | E2E テストを実行 |
| `pnpm test:all` | すべてのテストを実行 |
| `pnpm sync-docs` | 外部ソースからドキュメントを同期 |
| `pnpm check-links` | リンク切れをチェック |
| `pnpm translate` | Markdown ファイルを翻訳 |
| `pnpm translate:ja` | 英語ドキュメントを日本語に翻訳 |
| `pnpm translate:en` | 日本語ドキュメントを英語に翻訳 |

## 詳細情報

- **GeonicDB リポジトリ**: https://github.com/geolonia/geonicdb
- **FIWARE Orion**: https://fiware-orion.readthedocs.io/
- **NGSIv2 仕様**: https://fiware.github.io/specifications/ngsiv2/stable/
- **NGSI-LD 仕様**: https://ngsi-ld.org
- **VitePress**: https://vitepress.dev/

## ライセンス

MIT License

Copyright (c) 2026 Geolonia Inc.

詳細は [LICENSE](LICENSE) をご覧ください。
