---
title: "開発者ガイド"
description: "開発環境セットアップ・インストール"
outline: deep
---
# 開発者向けガイド

## 必要要件

- Node.js 20.x 以上
- npm 9.x 以上
- AWS CLI v2 (デプロイ時)
- AWS SAM CLI (デプロイ時)
- MongoDB 8.0 以上 (MongoDB Atlas、またはローカル MongoDB)

## セットアップ

### 1. リポジトリのクローン

```bash
git clone https://github.com/your-org/vela.git
cd vela
```

### 2. 依存パッケージのインストール

```bash
npm install
```

### 3. 環境変数の設定

`.env` ファイルを作成：

```bash
# MongoDB 接続設定
MONGODB_URI=mongodb://localhost:27017
MONGODB_DATABASE=context-broker

# 環境名 (dev/staging/prod)
ENVIRONMENT=dev

# AWS 設定 (ローカル開発用)
AWS_REGION=us-east-1
EVENT_BUS_NAME=local-event-bus
NOTIFICATION_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789012/local-queue

# ログレベル (DEBUG/INFO/WARN/ERROR/SILENT)
LOG_LEVEL=DEBUG
```

#### 認証・認可の有効化 (オプション)

認証機能を有効にする場合は、以下の環境変数を追加：

```bash
# 認証機能を有効にする (true/false)
AUTH_ENABLED=true

# JWT トークン署名シークレット (32 文字以上推奨)
# 本番環境では必ず安全なランダム文字列を使用してください
JWT_SECRET=your-secret-key-change-in-production

# アクセストークン有効期限 (例: 1h, 30m, 1d)
JWT_EXPIRES_IN=1h

# リフレッシュトークン有効期限 (例: 7d, 30d)
JWT_REFRESH_EXPIRES_IN=7d

# 環境変数ベースのスーパー管理者 (初期セットアップ用)
SUPER_ADMIN_EMAIL=admin@example.com
SUPER_ADMIN_PASSWORD=SuperSecretPassword123!

# Admin API へのアクセスを許可する IP アドレス (カンマ区切り)
# 空の場合はすべての IP からアクセス可能
# 例: 192.168.1.0/24,10.0.0.0/8
ADMIN_ALLOWED_IPS=
```

#### CADDE 連携の有効化 (オプション)

CADDE (分野間データ連携基盤) 連携機能を有効にする場合：

```bash
# CADDE 連携機能を有効にする
CADDE_ENABLED=true

# CADDE リクエストに Bearer トークン認証を必須にする
CADDE_AUTH_ENABLED=true

# デフォルトのプロバイダ ID
CADDE_DEFAULT_PROVIDER=provider-001

# JWT 検証設定 (CADDE_AUTH_ENABLED=true の場合)
CADDE_JWT_ISSUER=https://auth.example.com
CADDE_JWT_AUDIENCE=my-api
CADDE_JWKS_URL=https://auth.example.com/.well-known/jwks.json
```

### 4. ビルド

```bash
npm run build
```

## 開発コマンド

| コマンド | 説明 |
|---------|------|
| `npm start` | ローカル開発サーバーを起動 (インメモリ MongoDB 使用) |
| `npm run build` | TypeScript をコンパイル |
| `npm run watch` | ファイル変更を監視して自動コンパイル |
| `npm test` | 全テストを実行 (ユニット + E2E) |
| `npm run test:unit` | ユニットテストのみ実行 |
| `npm run test:e2e` | E2E テストのみ実行 |
| `npm run test:watch` | ユニットテストをウォッチモードで実行 |
| `npm run test:coverage` | カバレッジレポートを生成 |
| `npm run lint` | ESLint でコードをチェック |
| `npm run lint:fix` | ESLint の問題を自動修正 |

## プロジェクト構造

```json
vela/
├── src/
│   ├── api/                    # API レイヤー
│   │   ├── ngsiv2/            # NGSIv2 API 実装
│   │   │   ├── controllers/   # リクエストハンドラ
│   │   │   ├── routes.ts      # ルーティング
│   │   │   └── transformers/  # データ変換
│   │   ├── ngsild/            # NGSI-LD API 実装
│   │   └── shared/            # 共通ユーティリティ
│   │       ├── middleware/    # ミドルウェア
│   │       └── errors/        # エラークラス
│   │
│   ├── core/                   # ビジネスロジック
│   │   ├── entities/          # エンティティ管理
│   │   ├── subscriptions/     # サブスクリプション管理
│   │   ├── registrations/     # 登録 (コンテキストソース) 管理
│   │   └── geo/               # ジオクエリ
│   │
│   ├── handlers/               # Lambda ハンドラ
│   │   ├── api/               # API リクエスト処理
│   │   ├── streams/           # Change Stream 処理
│   │   └── subscriptions/     # サブスクリプション処理
│   │
│   └── infrastructure/         # インフラクライアント
│       ├── mongodb/           # MongoDB クライアント
│       ├── eventbridge/       # EventBridge クライアント
│       └── logger.ts          # ロガー
│
├── tests/
│   ├── unit/                   # ユニットテスト (Jest)
│   ├── integration/            # 統合テスト (Jest)
│   └── e2e/                    # E2E テスト (Cucumber.js + Gherkin)
│       ├── features/           # Gherkin feature ファイル
│       │   ├── ngsiv2/         # NGSIv2 API テスト
│       │   └── ngsi-ld/        # NGSI-LD API テスト
│       ├── step-definitions/   # ステップ定義
│       └── support/            # テストサポート
│
├── infrastructure/             # SAM テンプレート
│   ├── template.yaml
│   └── parameters/
│
└── docs/                       # ドキュメント
```

## テスト

本プロジェクトでは 2 種類のテストフレームワークを使用しています：

- **ユニットテスト / 統合テスト**: Jest
- **E2E テスト**: Cucumber.js + Gherkin (日本語 BDD 形式)

### 全テストの実行

```bash
npm test
```

### ユニットテストの実行

```bash
# 全ユニットテスト
npm run test:unit

# ウォッチモード
npm run test:watch

# 特定のファイル
npx jest tests/unit/api/ngsiv2/controllers/entities.controller.test.ts
```

### E2E テストの実行

E2E テストは Cucumber.js を使用し、Gherkin 形式 (日本語) で記述されています。
FIWARE Orion の API ドキュメントに基づいたテストケースを実装しています。

```bash
# 全 E2E テスト
npm run test:e2e

# NGSIv2 テストのみ
npm run test:e2e:ngsiv2

# NGSI-LD テストのみ
npm run test:e2e:ngsild

# 特定のタグで実行
npx cucumber-js --tags "@entities"
npx cucumber-js --tags "@subscriptions"
npx cucumber-js --tags "@batch"
npx cucumber-js --tags "@crs"
npx cucumber-js --tags "@tutorial"
npx cucumber-js --tags "@meta"
```

### E2E テストの feature ファイル構成

```text
tests/e2e/features/
├── ngsiv2/
│   ├── entities.feature            # エンティティ CRUD
│   ├── attribute-values.feature    # 属性値の直接取得・更新
│   ├── subscriptions.feature       # サブスクリプション (HTTP 通知)
│   ├── subscriptions-mqtt.feature  # サブスクリプション (MQTT 通知)
│   ├── batch.feature               # バッチ操作
│   ├── query-language.feature      # クエリ言語
│   ├── types.feature               # エンティティタイプ
│   ├── multitenancy.feature        # マルチテナンシー
│   ├── geo-queries.feature         # 地理空間クエリ
│   ├── spatial-id.feature          # 空間 ID 検索 (ZFXY 形式)
│   ├── geojson-output.feature      # GeoJSON 出力
│   ├── crs-transform.feature       # 座標参照系 (CRS) 変換
│   ├── output-formats.feature      # 出力フォーマット
│   ├── ordering.feature            # ソート機能
│   ├── special-types.feature       # 特殊属性タイプ
│   ├── metadata.feature            # メタデータ
│   ├── error-handling.feature      # エラーハンドリング
│   └── orion-tutorial.feature      # Orion 利用手順書に基づくチュートリアル
├── common/
│   └── meta.feature                # メタエンドポイント (/version, /health, /.well-known/ngsi-ld)
└── ngsi-ld/
    ├── entities.feature            # エンティティ CRUD
    ├── subscriptions.feature       # サブスクリプション (HTTP 通知)
    ├── subscriptions-mqtt.feature  # サブスクリプション (MQTT 通知)
    ├── batch.feature               # バッチ操作
    ├── multitenancy.feature        # マルチテナンシー
    ├── spatial-id.feature          # 空間 ID 検索 (ZFXY 形式)
    ├── geojson-output.feature      # GeoJSON 出力
    ├── crs-transform.feature       # 座標参照系 (CRS) 変換
    └── attributes.feature          # 属性一覧・詳細
```

### Gherkin テストの例

```gherkin
# language: ja

@ngsiv2 @entities
機能: NGSIv2 エンティティ CRUD 操作

  背景:
    前提 テスト用データベースが初期化されている
    かつ テナントヘッダーが "testservice" に設定されている

  シナリオ: 属性を持つエンティティを作成する
    もし 以下のエンティティを作成する:
      | id    | type | temperature.value | temperature.type |
      | Room1 | Room | 23                | Float            |
    ならば レスポンスステータスコードは 201 である
    かつ レスポンスヘッダー "Location" に "Room1" が含まれる
```

### カバレッジレポート

```bash
npm run test:coverage
```

`coverage/lcov-report/index.html` で HTML レポートを確認できます。

## 連携アプリケーション開発 (npm パッケージとして利用)

GeonicDB を npm パッケージとしてインストールし、アプリケーションの開発サーバーと統合できます。

### インストール

```bash
# GitHub リポジトリから直接インストール
npm install -D github:geolonia/geonicdb

# peerDependencies もインストール
npm install -D express mongodb-memory-server
```

### CLI で起動 (推奨)

`npx geonicdb` コマンドでスタンドアロン起動できます。`--proxy` オプションを使うと、GeonicDB のルートにマッチしないリクエストをアプリ側の開発サーバーに転送します。

```bash
# 基本的な起動
npx geonicdb

# ポート指定
npx geonicdb --port 3001

# プロキシ付き起動 (Vite 等の dev server と統合)
npx geonicdb --port 3000 --proxy http://localhost:5173
```

`--proxy` 指定時のリクエストフロー:

```text
ブラウザ → localhost:3000 (GeonicDB)
  ├── /v2/*, /ngsi-ld/*, /llms.txt 等 → GeonicDB が処理
  └── その他 (HTML, JS, CSS 等)     → アプリ側 dev server にプロキシ
```

> **Note**: URL が重複した場合 (例: アプリ側にも `/llms.txt` がある場合)、GeonicDB 側が優先されます。

### アプリケーションの package.json 設定例

`concurrently` を使って GeonicDB とアプリの開発サーバーを同時起動できます。`--kill-others` により、片方のプロセスが終了するともう片方も自動停止します:

```json
{
  "scripts": {
    "dev": "concurrently --kill-others 'geonicdb --port 4000 --proxy http://localhost:5173' 'vite --port 5173'"
  },
  "devDependencies": {
    "geonicdb": "github:geolonia/geonicdb",
    "express": "^5.0.0",
    "mongodb-memory-server": "^11.0.0",
    "concurrently": "^9.0.0",
    "vite": "^7.0.0"
  }
}
```

Vite 側にもプロキシ設定を追加すると、どちらのポートからアクセスしても API が利用できます:

```js
// vite.config.js
export default {
  server: {
    proxy: {
      '/v2': 'http://localhost:4000',
      '/ngsi-ld': 'http://localhost:4000',
      '/admin': 'http://localhost:4000',
      '/auth': 'http://localhost:4000',
      '/ll