---
title: "開発者ガイド"
description: "開発環境セットアップ・インストール"
outline: deep
---
# 開発者向けガイド

## 必要要件

- Node.js 20.x 以上
- npm 9.x 以上
- AWS CLI v2（デプロイ時）
- AWS SAM CLI（デプロイ時）
- MongoDB 8.0 以上（MongoDB Atlas、またはローカル MongoDB）

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

# AWS 設定（ローカル開発用）
AWS_REGION=us-east-1
EVENT_BUS_NAME=local-event-bus
NOTIFICATION_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789012/local-queue

# ログレベル (DEBUG/INFO/WARN/ERROR/SILENT)
LOG_LEVEL=DEBUG
```

#### 認証・認可の有効化（オプション）

認証機能を有効にする場合は、以下の環境変数を追加：

```bash
# 認証機能を有効にする (true/false)
AUTH_ENABLED=true

# JWT トークン署名シークレット（32文字以上推奨）
# 本番環境では必ず安全なランダム文字列を使用してください
JWT_SECRET=your-secret-key-change-in-production

# アクセストークン有効期限 (例: 1h, 30m, 1d)
JWT_EXPIRES_IN=1h

# リフレッシュトークン有効期限 (例: 7d, 30d)
JWT_REFRESH_EXPIRES_IN=7d

# 環境変数ベースのスーパー管理者（初期セットアップ用）
SUPER_ADMIN_EMAIL=admin@example.com
SUPER_ADMIN_PASSWORD=SuperSecretPassword123!

# Admin API へのアクセスを許可する IP アドレス（カンマ区切り）
# 空の場合はすべての IP からアクセス可能
# 例: 192.168.1.0/24,10.0.0.0/8
ADMIN_ALLOWED_IPS=
```

#### CADDE 連携の有効化（オプション）

CADDE（分野間データ連携基盤）連携機能を有効にする場合：

```bash
# CADDE 連携機能を有効にする
CADDE_ENABLED=true

# CADDE リクエストに Bearer トークン認証を必須にする
CADDE_AUTH_ENABLED=true

# デフォルトのプロバイダ ID
CADDE_DEFAULT_PROVIDER=provider-001

# JWT 検証設定（CADDE_AUTH_ENABLED=true の場合）
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
| `npm start` | ローカル開発サーバーを起動（インメモリ MongoDB 使用） |
| `npm run build` | TypeScript をコンパイル |
| `npm run watch` | ファイル変更を監視して自動コンパイル |
| `npm test` | 全テストを実行（ユニット + E2E） |
| `npm run test:unit` | ユニットテストのみ実行 |
| `npm run test:e2e` | E2E テストのみ実行 |
| `npm run test:watch` | ユニットテストをウォッチモードで実行 |
| `npm run test:coverage` | カバレッジレポートを生成 |
| `npm run lint` | ESLint でコードをチェック |
| `npm run lint:fix` | ESLint の問題を自動修正 |

## プロジェクト構造

```text
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
│   │   ├── registrations/     # 登録（コンテキストソース）管理
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

本プロジェクトでは2種類のテストフレームワークを使用しています：

- **ユニットテスト / 統合テスト**: Jest
- **E2E テスト**: Cucumber.js + Gherkin（日本語 BDD 形式）

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

E2E テストは Cucumber.js を使用し、Gherkin 形式（日本語）で記述されています。
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
│   ├── subscriptions.feature       # サブスクリプション（HTTP通知）
│   ├── subscriptions-mqtt.feature  # サブスクリプション（MQTT通知）
│   ├── batch.feature               # バッチ操作
│   ├── query-language.feature      # クエリ言語
│   ├── types.feature               # エンティティタイプ
│   ├── multitenancy.feature        # マルチテナンシー
│   ├── geo-queries.feature         # 地理空間クエリ
│   ├── spatial-id.feature          # 空間ID検索（ZFXY形式）
│   ├── geojson-output.feature      # GeoJSON出力
│   ├── crs-transform.feature       # 座標参照系（CRS）変換
│   ├── output-formats.feature      # 出力フォーマット
│   ├── ordering.feature            # ソート機能
│   ├── special-types.feature       # 特殊属性タイプ
│   ├── metadata.feature            # メタデータ
│   ├── error-handling.feature      # エラーハンドリング
│   └── orion-tutorial.feature      # Orion利用手順書に基づくチュートリアル
├── common/
│   └── meta.feature                # メタエンドポイント (/version, /health, /.well-known/ngsi-ld)
└── ngsi-ld/
    ├── entities.feature            # エンティティ CRUD
    ├── subscriptions.feature       # サブスクリプション（HTTP通知）
    ├── subscriptions-mqtt.feature  # サブスクリプション（MQTT通知）
    ├── batch.feature               # バッチ操作
    ├── multitenancy.feature        # マルチテナンシー
    ├── spatial-id.feature          # 空間ID検索（ZFXY形式）
    ├── geojson-output.feature      # GeoJSON出力
    ├── crs-transform.feature       # 座標参照系（CRS）変換
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

`coverage/lcov-report/index.html` でHTMLレポートを確認できます。

## 連携アプリケーション開発（npmパッケージとして利用）

GeonicDB を npm パッケージとしてインストールし、アプリケーションの開発サーバーと統合できます。

### インストール

```bash
# GitHub リポジトリから直接インストール
npm install -D github:geolonia/geonicdb

# peerDependencies もインストール
npm install -D express mongodb-memory-server
```

### CLI で起動（推奨）

`npx geonicdb` コマンドでスタンドアロン起動できます。`--proxy` オプションを使うと、GeonicDB のルートにマッチしないリクエストをアプリ側の開発サーバーに転送します。

```bash
# 基本的な起動
npx geonicdb

# ポート指定
npx geonicdb --port 3001

# プロキシ付き起動（Vite等のdev serverと統合）
npx geonicdb --port 3000 --proxy http://localhost:5173
```

`--proxy` 指定時のリクエストフロー:

```text
ブラウザ → localhost:3000 (GeonicDB)
  ├── /v2/*, /ngsi-ld/*, /llms.txt 等 → GeonicDB が処理
  └── その他（HTML, JS, CSS 等）     → アプリ側 dev server にプロキシ
```

> **Note**: URL が重複した場合（例: アプリ側にも `/llms.txt` がある場合）、GeonicDB 側が優先されます。

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
      '/llms.txt': 'http://localhost:4000',
      '/.well-known': 'http://localhost:4000',
    },
  },
};
```

### プログラマティック API

JavaScript/TypeScript から直接サーバーを起動・制御することもできます:

```typescript
import { createServer } from 'geonicdb';

// サーバー起動
const server = await createServer({
  port: 3000,                          // リッスンポート（デフォルト: 3000）
  proxy: 'http://localhost:5173',      // プロキシ先（省略可）
  silent: true,                        // コンソール出力抑制（省略可）
});

console.log(`GeonicDB running at ${server.url}`);
console.log(`MongoDB URI: ${server.mongoUri}`);

// グレースフルシャットダウン
process.on('SIGINT', async () => {
  await server.close();
  process.exit(0);
});
```

#### GeonicDBServer オブジェクト

`createServer()` が返すオブジェクト:

| プロパティ | 型 | 説明 |
|-----------|------|------|
| `port` | `number` | 実際にリッスンしているポート |
| `url` | `string` | サーバーの完全な URL（例: `http://localhost:3000`） |
| `mongoUri` | `string` | MongoDB 接続 URI（テスト等で利用可能） |
| `close()` | `() => Promise<void>` | サーバーと MongoDB を停止 |

### プライベートリポジトリからのインストール

プライベートリポジトリの場合、SSH 鍵が GitHub に登録されていればそのまま動作します:

```bash
npm install -D github:geolonia/geonicdb
```

CI/CD 環境では、GitHub Personal Access Token や Deploy Key の設定が必要です。チームで本格運用する場合は GitHub Packages への公開も検討してください。

## ローカル開発サーバー

### 簡易サーバー（推奨）

`npm start` でインメモリ MongoDB を使用したローカルサーバーを起動できます。外部の MongoDB インスタンスは不要です。

```bash
npm start
```

#### ポート指定

デフォルトポートは `3000` です。CLI引数または環境変数でポートを変更できます：

```bash
# CLI引数で指定
npm start -- --port 3001

# 環境変数で指定
PORT=3001 npm start
```

優先順位: `--port` 引数 > `PORT` 環境変数 > デフォルト（3000）

指定したポートが使用中の場合は、自動的に次の空きポートが選択されます（最大10ポート探索）。

> **Tip**: git worktree と組み合わせると、異なるブランチのサーバーを同時に起動できます：
> ```bash
> # メインの worktree で起動
> npm start                    # → localhost:3000
>
> # 別の worktree で起動
> cd .worktrees/vela-feature
> npm start -- --port 3001     # → localhost:3001
> ```

サーバーを停止するには `Ctrl+C` を押します。MongoDB も自動的に停止します。

**特徴：**
- 外部 MongoDB 不要（mongodb-memory-server を自動起動）
- 環境変数の設定不要
- ポート指定可能（`--port` / `PORT` 環境変数）
- ポート使用中の場合は自動フォールバック
- 開発・テスト用途に最適
- サーバー停止時にデータは消去される（インメモリ）

### SAM CLI を使用する場合

AWS SAM CLI を使用してローカルで API をテスト：

```bash
# SAM ビルド
npm run sam:build

# ローカルサーバー起動
npm run sam:local
```

API は `http://localhost:3000` で利用可能になります。

### テストリクエスト例

```bash
# エンティティ作成
curl -X POST http://localhost:3000/v2/entities \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: test" \
  -d '{
    "id": "Room1",
    "type": "Room",
    "temperature": {"type": "Float", "value": 23.5}
  }'

# エンティティ取得
curl http://localhost:3000/v2/entities/Room1 \
  -H "Fiware-Service: test"

# 属性値の直接取得
curl http://localhost:3000/v2/entities/Room1/attrs/temperature/value \
  -H "Fiware-Service: test"

# 属性値の直接更新
curl -X PUT http://localhost:3000/v2/entities/Room1/attrs/temperature/value \
  -H "Fiware-Service: test" \
  -H "Content-Type: text/plain" \
  -d "25.5"

# クエリ言語を使用した検索
curl "http://localhost:3000/v2/entities?type=Room&q=temperature>20" \
  -H "Fiware-Service: test"

# ジオクエリ（ポリゴン内検索）
curl "http://localhost:3000/v2/entities?type=Place&georel=coveredBy&geometry=polygon&coords=34,138;34,141;37,141;37,138;34,138" \
  -H "Fiware-Service: test"

# 空間ID検索（ZFXY形式）
curl "http://localhost:3000/v2/entities?spatialId=20/0/929592/410773" \
  -H "Fiware-Service: test"

# GeoJSON形式で出力
curl "http://localhost:3000/v2/entities?type=Store&options=geojson" \
  -H "Fiware-Service: test"

# APIドキュメント取得（llms.txt形式）
curl http://localhost:3000/llms.txt

# APIドキュメント取得（JSON形式）
curl http://localhost:3000/api.json

# OpenAPI仕様取得
curl http://localhost:3000/openapi.json

# バージョン情報取得
curl http://localhost:3000/version

# ヘルスチェック
curl http://localhost:3000/health

# NGSI-LD API ディスカバリ
curl http://localhost:3000/.well-known/ngsi-ld
```

## MCP (Model Context Protocol) で Claude Desktop から接続

ローカルサーバーを起動した状態で、Claude Desktop から直接コンテキストブローカーに接続できます。

### 1. ローカルサーバーの起動

```bash
npm start
```

### 2. Claude Desktop の設定

Claude Desktop の設定ファイル（`claude_desktop_config.json`）に以下を追加します。

**macOS**: `~/Library/Application\ Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "vela": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://localhost:3000/mcp",
        "--allow-http"
      ]
    }
  }
}
```

> **Note**: Streamable HTTP の MCP サーバーに接続するために [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) パッケージをブリッジとして使用しています。初回実行時に自動でダウンロードされます。

**認証有効時（`AUTH_ENABLED=true`）** の場合、Bearer トークンのヘッダー指定が必要です：

```json
{
  "mcpServers": {
    "vela": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://localhost:3000/mcp",
        "--allow-http",
        "--header",
        "Authorization: Bearer <your-jwt-token>"
      ]
    }
  }
}
```

設定後、Claude Desktop を再起動してください。

### 3. 動作確認

Claude Desktop のチャットで以下のように話しかけると、コンテキストブローカーのツールが自動的に呼び出されます。

- 「テナント test のエンティティ一覧を見せて」
- 「Room1 という ID の Room エンティティを作成して、温度 23.5 を設定して」
- 「東京駅の近くにあるセンサーを検索して」

### 4. curl での動作確認

Claude Desktop を使わずに MCP プロトコルの動作を確認する場合：

```bash
# MCP initialize
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": {"name": "curl-test", "version": "1.0.0"}
    }
  }'
```

詳細は [MCP ドキュメント](../ai-integration/mcp-server.md) を参照してください。

## API 仕様

### ページネーション

リスト取得エンドポイントは共通のページネーションパラメータをサポートしています。

**パラメータ:**

| パラメータ | 型 | デフォルト | 最大値 | 説明 |
|---------|---|---------|-------|------|
| `limit` | integer | 20 | 1000 | 取得件数（NGSI API） |
| `limit` | integer | 20 | 100 | 取得件数（Admin API） |
| `offset` | integer | 0 | - | スキップ件数 |

**レスポンスヘッダー:**

- **NGSIv2**: `Fiware-Total-Count` - 総件数
- **NGSI-LD**: `NGSILD-Results-Count` - 総件数
- **Admin API**: `X-Total-Count` - 総件数

**例:**

```bash
# 最初の10件を取得
curl "http://localhost:3000/v2/entities?limit=10&offset=0"

# 11件目から20件目を取得
curl "http://localhost:3000/v2/entities?limit=10&offset=10"
```

### HTTP ステータスコード

主要なステータスコードとエラーレスポンス形式：

| コード | 説明 | 使用例 |
|-------|------|--------|
| 200 | OK | エンティティ取得成功、属性更新成功 |
| 201 | Created | エンティティ作成成功 |
| 204 | No Content | エンティティ削除成功、属性削除成功 |
| 400 | Bad Request | 不正なリクエストボディ、無効なパラメータ |
| 401 | Unauthorized | 認証トークンなし、無効なトークン |
| 403 | Forbidden | 権限不足、テナントアクセス不可 |
| 404 | Not Found | エンティティ/属性が存在しない |
| 409 | Conflict | エンティティIDが既に存在 |
| 422 | Unprocessable Entity | エンティティが存在しない（部分更新時） |
| 500 | Internal Server Error | サーバー内部エラー |

**エラーレスポンス形式（NGSIv2）:**

```json
{
  "error": "NotFound",
  "description": "The requested entity has not been found. Check type and id"
}
```

**エラーレスポンス形式（NGSI-LD）:**

```json
{
  "type": "https://uri.etsi.org/ngsi-ld/errors/ResourceNotFound",
  "title": "Entity not found",
  "detail": "Entity with id urn:ngsi-ld:Room:Room1 not found"
}
```

## デプロイ

### 事前準備

1. **AWS CLI のインストールと設定:**

```bash
aws configure
# AWS Access Key ID、Secret Access Key、リージョン（ap-northeast-1）を設定
```

2. **AWS SAM CLI のインストール:**

```bash
# macOS (Homebrew)
brew install aws-sam-cli

# 確認
sam --version
```

3. **MongoDB Atlas の準備:**

- MongoDB Atlas でクラスタを作成（M0 Free Tier で可）
- ネットワークアクセス: `0.0.0.0/0` を許可（本番環境では AWS Lambda の IP 範囲のみに制限）
- データベースユーザーを作成し、接続文字列を取得

### デプロイ手順

**1. SAM ビルド:**

```bash
npm run sam:build
```

**2. Parameter Store に環境変数を設定:**

```bash
# MongoDB 接続文字列
aws ssm put-parameter \
  --name "/vela/dev/MONGODB_URI" \
  --value "mongodb+srv://user:password@cluster.mongodb.net/?retryWrites=true&w=majority" \
  --type "SecureString" \
  --overwrite

# JWT シークレット（認証有効時）
aws ssm put-parameter \
  --name "/vela/dev/JWT_SECRET" \
  --value "your-secret-key-min-32-chars" \
  --type "SecureString" \
  --overwrite

# スーパー管理者（初回のみ）
aws ssm put-parameter \
  --name "/vela/dev/SUPER_ADMIN_EMAIL" \
  --value "admin@example.com" \
  --type "String" \
  --overwrite

aws ssm put-parameter \
  --name "/vela/dev/SUPER_ADMIN_PASSWORD" \
  --value "SecurePassword123!" \
  --type "SecureString" \
  --overwrite
```

**3. デプロイ実行:**

```bash
# 開発環境
npm run sam:deploy:dev

# 本番環境
npm run sam:deploy:prod
```

**4. デプロイ後の確認:**

```bash
# API エンドポイント URL を取得
aws cloudformation describe-stacks \
  --stack-name vela-dev \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" \
  --output text

# ヘルスチェック
curl https://your-api-id.execute-api.ap-northeast-1.amazonaws.com/v2/health
```

### 主要な環境変数

| 変数名 | 説明 | Parameter Store パス |
|-------|------|---------------------|
| `MONGODB_URI` | MongoDB 接続文字列（必須） | `/vela/{env}/MONGODB_URI` |
| `JWT_SECRET` | JWT 署名シークレット | `/vela/{env}/JWT_SECRET` |
| `AUTH_ENABLED` | 認証機能の有効化（true/false） | `/vela/{env}/AUTH_ENABLED` |
| `LOG_LEVEL` | ログレベル（DEBUG/INFO/WARN/ERROR） | `/vela/{env}/LOG_LEVEL` |

詳細は `infrastructure/template.yaml` の `Parameters` セクションを参照してください。

## パスエイリアス

TypeScript でパスエイリアスを使用しています：

```typescript
import { EntityService } from '@core/entities/entity.service';
import { NotFoundError } from '@api/shared/errors';
import { handler } from '@handlers/api';
import { getDatabase } from '@infrastructure/mongodb';
```
