---
title: デモアプリ
description: Vela Demo App の紹介 — ダッシュボード、API チュートリアル、スマートビルディング管理、シティマップのインタラクティブなデモ。
outline: deep
---

# デモアプリ

[Vela Demo App](https://github.com/geolonia/vela-demo-app) は、Vela OS の機能を体験できるインタラクティブなアプリケーション集です。React、Vite、MapLibre GL JS で構築され、エグゼクティブダッシュボードから地理空間シティマップまで、実際のユースケースをカバーしています。

## デモアプリケーション

### Dashboard（ダッシュボード）

**対象**: ビジネスステークホルダー、意思決定者

Vela エンティティのデータをアクション可能なメトリクスに集約するエグゼクティブサマリービューです。

- **KPI カード** — エンティティ数、タイプ分布、位置情報カバー率、ヘルスステータス
- **メトリクス集計** — 全エンティティの属性ごとのカウント、平均、最小、最大
- **タイプ分析** — テナント内のエンティティタイプのビジュアル分析
- **エンティティテーブル** — 主要属性付きの全エンティティのソート可能な一覧
- **ミニマップ** — 位置情報を持つエンティティの地図表示

### API Tutorial（API チュートリアル）

**対象**: 開発者、評価者

Vela API をハンズオンで学ぶ、ガイド付き5ステップのインタラクティブなウォークスルーです：

1. **CRUD 操作** — エンティティの作成、取得、更新、削除
2. **クエリ言語** — `q` パラメータによるエンティティのフィルタリング
3. **地理空間クエリ** — 位置に基づくエンティティの検索
4. **サブスクリプション** — 変更通知の設定
5. **AI 連携** — AI ツールを通じたデータ操作

各ステップでマルチ言語のコードサンプル（curl、JavaScript、Python）を提供し、ブラウザ内で直接 API コールを実行できます。

### Smart Building（スマートビルディング）

**対象**: 施設管理者、ビルオペレーター

IoT センサーデータの可視化を示すビル管理インターフェースです：

- **フロア別ルームカード** — フロアごとに整理された会議室の表示
- **環境メトリクス** — 温度、湿度、CO2 のしきい値アラート付き表示
- **エレベーターパネル** — リアルタイムのエレベーター状況とフロア追跡
- **シナリオプリセット** — Normal、Overcrowded、HVAC Failure の状態切り替え
- **ライブシミュレーション** — 速度調整可能なシミュレーションでリアルタイムデータ変化を確認
- **インライン編集** — UI から直接エンティティ属性を変更

### City Map（シティマップ）

**対象**: GIS エンジニア、スマートシティプランナー

空間データ探索のためのフルスクリーン地理インターフェースです：

- **マーカー/ヒートマップ切り替え** — ポイントマーカーとヒートマップ表示の切り替え
- **空間クエリツール** — 円やポリゴンを描画してエリア内のエンティティを検索
- **クエリ結果オーバーレイ** — マッチしたエンティティと生成された curl コマンドの表示
- **エンティティパネル** — タイプ別フィルタリング付きのエンティティ一覧
- **AI チャット** — MCP によるツールコール可視化付きの自然言語クエリ

## 技術スタック

| テクノロジー | 用途 |
|-------------|------|
| React 18 | UI フレームワーク |
| Vite 5 | ビルドツールと開発サーバー |
| TailwindCSS 3 | スタイリング |
| MapLibre GL JS | 地図レンダリング（@geolonia/embed 経由） |
| TanStack Query 5 | サーバーステート管理 |
| TypeScript 5 | 型安全性 |

## はじめ方

### 前提条件

- Node.js 20+
- pnpm 9+
- 稼働中の Vela インスタンス（ローカルまたは SaaS）

### ローカルで実行

```bash
# リポジトリをクローン
git clone https://github.com/geolonia/vela-demo-app.git
cd vela-demo-app

# 依存パッケージのインストール
pnpm install

# 環境変数の設定
cp .env.sample .env
# .env を編集して Geolonia API キーを追加（地図タイル用）

# Vela にデモデータをロード
./scripts/demo-data/setup.sh

# 開発サーバーを起動
pnpm dev
```

`http://localhost:5173` をブラウザで開くとランディングページにアクセスできます。

### 環境変数

| 変数 | 説明 | 必須 |
|------|------|------|
| `VITE_GEOLONIA_API_KEY` | 地図タイル用 Geolonia Maps API キー | はい |
| `VITE_VELA_URL` | Vela API URL（デフォルト: `http://localhost:3000`） | いいえ |

### デモテナント

セットアップスクリプトが以下のテナントを作成します：

| テナント | コンテンツ |
|---------|----------|
| `smartcity` | 大気質センサー、駐車場、交通流（東京エリア） |
| `smartbuilding` | 会議室、エレベーター |
| `shibuya` | 環境センサー（渋谷エリア） |
| `shinjuku` | 環境センサー（新宿エリア） |

## アーキテクチャ

```
vela-demo-app/
├── packages/
│   ├── shared/              # 共有ライブラリ
│   │   ├── src/api/         # VelaClient — 型安全な API クライアント
│   │   ├── src/types/       # NGSI エンティティ型
│   │   ├── src/hooks/       # React hooks（useEntities, useGeoEntities）
│   │   └── src/components/  # VelaMap コンポーネント
│   └── dashboard/           # メインデモアプリ
│       ├── src/pages/       # Landing, Dashboard, Tutorial, SmartBuilding, CityMap
│       └── src/components/  # ページ固有のコンポーネント
├── e2e/                     # Playwright E2E テスト
└── scripts/demo-data/       # デモデータセットアップ
```

## リンク

- **GitHub リポジトリ**: [geolonia/vela-demo-app](https://github.com/geolonia/vela-demo-app)
- **Vela OS**: [geolonia/vela](https://github.com/geolonia/vela)
- **Geolonia Maps**: [geolonia.com](https://geolonia.com/)

## 次のステップ

- [クイックスタート](/ja/introduction/quick-start) — 最初の API コールを試す
- API リファレンス — NGSIv2 API の完全なドキュメント
- AI 連携 — MCP、llms.txt、tools.json について
