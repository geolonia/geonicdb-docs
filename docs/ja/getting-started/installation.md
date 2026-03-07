---
title: "Developer Guide"
description: "Development environment setup and installation"
outline: deep
---
# 開発者ガイド

## 要件

- Node.js 24.x 以上
- npm 9.x 以上
- AWS CLI v2 (デプロイ用)
- AWS SAM CLI (デプロイ用)
- MongoDB 8.0 以上 (MongoDB Atlas またはローカル MongoDB)
- [1Password CLI](https://developer.1password.com/docs/cli) (`op`) — シークレット注入用 (推奨)

## セットアップ

### 1. リポジトリをクローンする

```bash
git clone https://github.com/geolonia/geonicdb.git
cd geonicdb
```




### 2. 依存関係をインストールする

```bash
npm install
```



### 3. 環境変数を設定する

`.env` ファイルを作成します:

```bash
# MongoDB connection settings
MONGODB_URI=mongodb://localhost:27017
MONGODB_DATABASE=context-broker

# Environment name (dev/staging/prod)
ENVIRONMENT=dev

# AWS settings (for local development)
AWS_REGION=us-east-1
EVENT_BUS_NAME=local-event-bus
NOTIFICATION_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789012/local-queue

# Log level (DEBUG/INFO/WARN/ERROR/SILENT)
LOG_LEVEL=DEBUG
```
















#### 認証と認可を有効にする (オプション)

認証機能を有効にするには、以下の環境変数を追加します:

```bash
# Enable authentication (true/false)
AUTH_ENABLED=true

# JWT token signing secret (32 characters or more recommended)
# Always use a secure random string in production
JWT_SECRET=your-secret-key-change-in-production

# Access token expiration (e.g., 1h, 30m, 1d)
JWT_EXPIRES_IN=1h

# Refresh token expiration (e.g., 7d, 30d)
JWT_REFRESH_EXPIRES_IN=7d

# Environment variable-based super admin (for initial setup)
SUPER_ADMIN_EMAIL=admin@example.com
SUPER_ADMIN_PASSWORD=SuperSecretPassword123!

# IP addresses allowed to access the Admin API (comma-separated)
# If empty, access is allowed from all IPs
# Example: 192.168.1.0/24,10.0.0.0/8
ADMIN_ALLOWED_IPS=
```























#### CADDE 統合を有効にする (オプション)

CADDE (Cross-Domain Data Collaboration Infrastructure) 統合を有効にするには:

```bash
# Enable CADDE integration
CADDE_ENABLED=true

# Require Bearer token authentication for CADDE requests
CADDE_AUTH_ENABLED=true

# Default provider ID
CADDE_DEFAULT_PROVIDER=provider-001

# JWT verification settings (when CADDE_AUTH_ENABLED=true)
CADDE_JWT_ISSUER=https://auth.example.com
CADDE_JWT_AUDIENCE=my-api
CADDE_JWKS_URL=https://auth.example.com/.well-known/jwks.json
```















### 4. 1Password CLI によるシークレット管理 (推奨)

機密性の高いシークレット (MongoDB 認証情報、JWT シークレット、管理者パスワード) は **`geonic-ops`** 1Password Vault に保存され、1Password CLI 経由で実行時に注入されます。`.env.op` ファイル (リポジトリにコミット済み) には `op://` URI 参照のみが含まれており、実際の値は含まれていません。

#### 1Password CLI をインストールする

```bash
# macOS
brew install 1password-cli

# Other platforms: https://developer.1password.com/docs/cli/get-started
```






確認: `op --version`
#### シークレットを 1Password に追加する

**`geonic-ops`** Vault に **`geonicdb-dev`** という名前のアイテムを作成し、以下のフィールドを設定します:

| フィールド | 説明 |
|-------|-------------|
| `MONGODB_URI` | 認証情報を含む MongoDB 接続文字列 |
| `JWT_SECRET` | ランダム文字列、32 文字以上 |
| `SUPER_ADMIN_EMAIL` | ローカル開発用スーパー管理者のメールアドレス |
| `SUPER_ADMIN_PASSWORD` | ローカル開発用スーパー管理者のパスワード |

```bash
# Example: create the item via CLI
op item create \
  --vault geonic-ops \
  --title geonicdb-dev \
  --category login \
  MONGODB_URI="mongodb+srv://user:pass@cluster.mongodb.net/context-broker" \
  JWT_SECRET="$(openssl rand -hex 32)" \
  SUPER_ADMIN_EMAIL="admin@example.com" \
  SUPER_ADMIN_PASSWORD="$(openssl rand -hex 16)"
```











#### シークレットを注入して開発サーバーを起動する

```bash
npm run dev:op
# equivalent to: op run --env-file=.env.op -- npm start
```




非機密な変数 (`ENVIRONMENT`、`AWS_REGION`、`LOG_LEVEL` など) は、通常通りローカルの `.env` ファイルから読み込まれます。

> **注:** `.env.op` はコミットしても安全です。`.env` と `.env.local` は gitignore 設定されており、絶対にコミットしてはいけません。`npm run dev:op` を使用する場合、`.env` に `MONGODB_URI`、`JWT_SECRET`、`SUPER_ADMIN_EMAIL`、`SUPER_ADMIN_PASSWORD` を定義しないでください。これらは 1Password から注入されるため、両方の場所に実際の値があると混乱を招く可能性があります。

### 5. ビルド

```bash
npm run build
```



## 開発コマンド

| コマンド | 説明 |
|---------|------|
| `npm start` | ローカル開発サーバーを起動 (インメモリ MongoDB を使用) |
| `npm run dev:op` | 1Password (`geonic-ops` Vault) からシークレットを注入して開発サーバーを起動 |
| `npm run build` | TypeScript をコンパイル |
| `npm run watch` | ファイルの変更を監視して自動コンパイル |
| `npm test` | 全テストを実行 (ユニット + E2E) |
| `npm run test:unit` | ユニットテストのみを実行 |
| `npm run test:e2e` | E2E テストのみを実行 |
| `npm run test:watch` | ユニットテストをウォッチモードで実行 |
| `npm run test:coverage` | カバレッジレポートを生成 |
| `npm run lint` | ESLint でコードをチェック |
| `npm run lint:fix` | ESLint の問題を自動修正 |

## プロジェクト構成

```text
geonicdb/
├── src/
│   ├── api/                    # API layer
│   │   ├── ngsiv2/            # NGSIv2 API implementation
│   │   │   ├── controllers/   # Request handlers
│   │   │   ├── routes.ts      # Routing
│   │   │   └── transformers/  # Data transformation
│   │   ├── ngsild/            # NGSI-LD API implementation
│   │   └── shared/            # Common utilities
│   │       ├── middleware/    # Middleware
│   │       └── errors/        # Error classes
│   │
│   ├── core/                   # Business logic
│   │   ├── entities/          # Entity management
│   │   ├── subscriptions/     # Subscription management
│   │   ├── registrations/     # Registration (context source) management
│   │   └── geo/               # Geo-queries
│   │
│   ├── handlers/               # Lambda handlers
│   │   ├── api/               # API request processing
│   │   ├── streams/           # Change Stream processing
│   │   └── subscriptions/     # Subscription processing
│   │
│   └── infrastructure/         # Infrastructure clients
│       ├── mongodb/           # MongoDB client
│       ├── eventbridge/       # EventBridge client
│       └── logger.ts          # Logger
│
├── tests/
│   ├── unit/                   # Unit tests (Jest)
│   ├── integration/            # Integration tests (Jest)
│   └── e2e/                    # E2E tests (Cucumber.js + Gherkin)
│       ├── features/           # Gherkin feature files
│       │   ├── ngsiv2/         # NGSIv2 API tests
│       │   └── ngsi-ld/        # NGSI-LD API tests
│       ├── step-definitions/   # Step definitions
│       └── support/            # Test support
│
├── infrastructure/             # SAM templates
│   ├── template.yaml
│   └── parameters/
│
└── docs/                       # Documentation
```













































## テスト

このプロジェクトでは 2 種類のテストフレームワークを使用しています:

- **ユニットテスト / 統合テスト**: Jest
- **E2E テスト**: Cucumber.js + Gherkin (日本語 BDD 形式)

### 全テストを実行

```bash
npm test
```



### ユニットテストを実行

```bash
# All unit tests
npm run test:unit

# Watch mode
npm run test:watch

# Specific file
npx jest tests/unit/api/ngsiv2/controllers/entities.controller.test.ts
```










### E2E テストを実行

E2E テストは Cucumber.js を使用し、Gherkin 形式 (日本語) で記述されています。
テストケースは FIWARE Orion API ドキュメントに基づいて実装されています。

```bash
# All E2E tests
npm run test:e2e

# NGSIv2 tests only
npm run test:e2e:ngsiv2

# NGSI-LD tests only
npm run test:e2e:ngsild

# Run by specific tag
npx cucumber-js --tags "@entities"
npx cucumber-js --tags "@subscriptions"
npx cucumber-js --tags "@batch"
npx cucumber-js --tags "@crs"
npx cucumber-js --tags "@tutorial"
npx cucumber-js --tags "@meta"
```


















### E2E テストフィーチャーファイル構成

```text
tests/e2e/features/
├── ngsiv2/
│   ├── entities.feature            # Entity CRUD
│   ├── attribute-values.feature    # Direct attribute value retrieval and update
│   ├── subscriptions.feature       # Subscriptions (HTTP notifications)
│   ├── subscriptions-mqtt.feature  # Subscriptions (MQTT notifications)
│   ├── batch.feature               # Batch operations
│   ├── query-language.feature      # Query language
│   ├── types.feature               # Entity types
│   ├── multitenancy.feature        # Multi-tenancy
│   ├── geo-queries.feature         # Geospatial queries
│   ├── spatial-id.feature          # Spatial ID search (ZFXY format)
│   ├── geojson-output.feature      # GeoJSON output
│   ├── crs-transform.feature       # Coordinate Reference System (CRS) transformation
│   ├── output-formats.feature      # Output formats
│   ├── ordering.feature            # Sorting functionality
│   ├── special-types.feature       # Special attribute types
│   ├── metadata.feature            # Metadata
│   ├── error-handling.feature      # Error handling
│   └── orion-tutorial.feature      # Tutorial based on Orion usage guide
├── common/
│   └── meta.feature                # Meta endpoints (/version, /health, /.well-known/ngsi-ld)
└── ngsi-ld/
    ├── entities.feature            # Entity CRUD
    ├── subscriptions.feature       # Subscriptions (HTTP notifications)
    ├── subscriptions-mqtt.feature  # Subscriptions (MQTT notifications)
    ├── batch.feature               # Batch operations
    ├── multitenancy.feature        # Multi-tenancy
    ├── spatial-id.feature          # Spatial ID search (ZFXY format)
    ├── geojson-output.feature      # GeoJSON output
    ├── crs-transform.feature       # Coordinate Reference System (CRS) transformation
    └── attributes.feature          # Attribute list and details
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



HTML レポートは `coverage/lcov-report/index.html` で確認できます。

## 統合アプリケーションの開発 (npm パッケージとして使用)

GeonicDB を npm パッケージとしてインストールし、アプリケーションの開発サーバーと統合できます。

### インストール

```bash
# Install directly from GitHub repository
npm install -D github:geolonia/geonicdb

# Also install peerDependencies
npm install -D express mongodb-memory-server
```







### CLI 経由で起動 (推奨)

`npx geonicdb` コマンドで GeonicDB をスタンドアロンで起動できます。`--proxy` オプションを使用すると、GeonicDB のルートに一致しないリクエストをアプリケーションの開発サーバーに転送します。

```bash
# Basic startup
npx geonicdb

# Specify port
npx geonicdb --port 3001

# Start with proxy (integrate with Vite or other dev servers)
npx geonicdb --port 3000 --proxy http://localhost:5173
```










`--proxy` を指定した場合のリクエストフロー:

```text
Browser → localhost:3000 (GeonicDB)
  ├── /v2/*, /ngsi-ld/*, /llms.txt, etc. → Handled by GeonicDB
  └── Others (HTML, JS, CSS, etc.)        → Proxied to application dev server
```





> **注:** URL が競合する場合 (例: アプリケーションにも `/llms.txt` がある場合)、GeonicDB が優先されます。

### アプリケーションの package.json 設定例

`concurrently` を使用して GeonicDB とアプリケーションの開発サーバーを同時に起動できます。`--kill-others` を使用すると、一方のプロセスが終了すると、もう一方も自動的に停止します:

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














Vite 側にプロキシ設定を追加することで、どちらのポートにアクセスしても API を利用できます:

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

// Start server
const server = await createServer({
  port: 3000,                          // Listen port (default: 3000)
  proxy: 'http://localhost:5173',      // Proxy target (optional)
  silent: true,                        // Suppress console output (optional)
});

console.log(`GeonicDB running at ${server.url}`);
console.log(`MongoDB URI: ${server.mongoUri}`);

// Graceful shutdown
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
| `url` | `string` | サーバーの完全な URL (例: `http://localhost:3000`) |
| `mongoUri` | `string` | MongoDB 接続 URI (テストなどで利用可能) |
| `close()` | `() => Promise<void>` | サーバーと MongoDB を停止 |

### プライベートリポジトリからのインストール

プライベートリポジトリの場合、SSH キーが GitHub に登録されていればそのまま動作します:

```bash
npm install -D github:geolonia/geonicdb
```



CI/CD 環境では、GitHub Personal Access Token または Deploy Key の設定が必要です。チーム全体で運用する場合は、GitHub Packages への公開も検討してください。

## ローカル開発サーバー

### シンプルサーバー (推奨)

`npm start` でインメモリ MongoDB を使用したローカルサーバーを起動できます。外部の MongoDB インスタンスは不要です。

```bash
npm start
```



#### ポートを指定する

デフォルトポートは `3000` です。CLI 引数または環境変数でポートを変更できます:

```bash
# Specify via CLI argument
npm start -- --port 3001

# Specify via environment variable
PORT=3001 npm start
```







優先度: `--port` 引数 > `PORT` 環境変数 > デフォルト (3000)

指定したポートが使用中の場合、次に利用可能なポートが自動的に選択されます (最大 10 ポートまで検索)。

> **ヒント:** git worktrees と組み合わせることで、異なるブランチのサーバーを同時に起動できます:
> ```bash
> # Start in the main worktree
> npm start                    # → localhost:3000
>
> # Start in another worktree
> cd .worktrees/geonicdb-feature
> npm start -- --port 3001     # → localhost:3001
> ```








`Ctrl+C` を押すとサーバーが停止します。MongoDB も自動的に停止します。

**特徴:**
- 外部の MongoDB が不要 (mongodb-memory-server が自動起動)
- 環境変数の設定が不要
- ポートを指定可能 (`--port` / `PORT` 環境変数)
- ポートが使用中の場合は自動フォールバック
- 開発とテストに最適
- サーバー停止時にデータがクリアされる (インメモリ)

### SAM CLI を使用

AWS SAM CLI を使用してローカルで API をテストします:

```bash
# SAM build
npm run sam:build

# Start local server
npm run sam:local
```







API は `http://localhost:3000` で利用可能になります。

### サンプルテストリクエスト

```bash
# Create entity
curl -X POST http://localhost:3000/v2/entities \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: test" \
  -d '{
    "id": "Room1",
    "type": "Room",
    "temperature": {"type": "Float", "value": 23.5}
  }'

# Get entity
curl http://localhost:3000/v2/entities/Room1 \
  -H "Fiware-Service: test"

# Direct attribute value retrieval
curl http://localhost:3000/v2/entities/Room1/attrs/temperature/value \
  -H "Fiware-Service: test"

# Direct attribute value update
curl -X PUT http://localhost:3000/v2/entities/Room1/attrs/temperature/value \
  -H "Fiware-Service: test" \
  -H "Content-Type: text/plain" \
  -d "25.5"

# Search using query language
curl "http://localhost:3000/v2/entities?type=Room&q=temperature>20" \
  -H "Fiware-Service: test"

# Geo-query (search within polygon)
curl "http://localhost:3000/v2/entities?type=Place&georel=coveredBy&geometry=polygon&coords=34,138;34,141;37,141;37,138;34,138" \
  -H "Fiware-Service: test"

# Spatial ID search (ZFXY format)
curl "http://localhost:3000/v2/entities?spatialId=20/0/929592/410773" \
  -H "Fiware-Service: test"

# Output in GeoJSON format
curl "http://localhost:3000/v2/entities?type=Store&options=geojson" \
  -H "Fiware-Service: test"

# Get API documentation (llms.txt format)
curl http://localhost:3000/llms.txt

# Get API documentation (JSON format)
curl http://localhost:3000/api.json

# Get OpenAPI specification
curl http://localhost:3000/openapi.json

# Get version information
curl http://localhost:3000/version

# Health check
curl http://localhost:3000/health

# NGSI-LD API discovery
curl http://localhost:3000/.well-known/ngsi-ld
```



























































## MCP (Model Context Protocol) 経由で Claude Desktop から接続

ローカルサーバーを起動すると、Claude Desktop からコンテキストブローカーに直接接続できます。

### 1. ローカルサーバーを起動

```bash
npm start
```



### 2. Claude Desktop を設定

Claude Desktop の設定ファイル (`claude_desktop_config.json`) に以下を追加します。

**macOS**: `~/Library/Application\ Support/Claude/claude_desktop_config.json`**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
```json
{
  "mcpServers": {
    "geonicdb": {
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














> **注:** [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) パッケージは、Streamable HTTP MCP サーバーに接続するためのブリッジとして使用されます。初回実行時に自動的にダウンロードされます。

**認証が有効な場合 (`AUTH_ENABLED=true`)** は、Bearer トークンヘッダーを指定する必要があります:

```json
{
  "mcpServers": {
    "geonicdb": {
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

Claude Desktop で以下のようにチャットすると、コンテキストブローカーツールが自動的に呼び出されます。

- "テナント test のエンティティ一覧を表示して"
- "ID が Room1 の Room エンティティを作成して、温度を 23.5 に設定して"
- "東京駅付近のセンサーを検索して"

### 4. curl で動作確認

Claude Desktop を使用せずに MCP プロトコルの動作を確認するには:

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
















詳細は [MCP ドキュメント](../ai-integration/mcp-server.md)を参照してください。

## API 仕様

### ページネーション

リスト取得エンドポイントは共通のページネーションパラメータをサポートします。

**パラメータ:**

| パラメータ | 型 | デフォルト | 最大値 | 説明 |
|---------|---|---------|-------|------|
| `limit` | integer | 20 | 1000 | 取得する結果の数 (NGSI API) |
| `limit` | integer | 20 | 100 | 取得する結果の数 (Admin API) |
| `offset` | integer | 0 | - | スキップする結果の数 |

**レスポンスヘッダー:**

- **NGSIv2**: `Fiware-Total-Count` - 総件数
- **NGSI-LD**: `NGSILD-Results-Count` - 総件数
- **Admin API**: `X-Total-Count` - 総件数

**例:**

```bash
# Get the first 10 results
curl "http://localhost:3000/v2/entities?limit=10&offset=0"

# Get results 11 through 20
curl "http://localhost:3000/v2/entities?limit=10&offset=10"
```







### HTTP ステータスコード

主なステータスコードとエラーレスポンス形式:

| コード | 説明 | 用途 |
|-------|------|--------|
| 200 | OK | エンティティ取得成功、属性更新成功 |
| 201 | Created | エンティティ作成成功 |
| 204 | No Content | エンティティ削除成功、属性削除成功 |
| 400 | Bad Request | 無効なリクエストボディ、無効なパラメータ |
| 401 | Unauthorized | 認証トークンなし、無効なトークン |
| 403 | Forbidden | 権限不足、テナントアクセス拒否 |
| 404 | Not Found | エンティティ/属性が存在しない |
| 409 | Conflict | エンティティ ID が既に存在 |
| 422 | Unprocessable Entity | エンティティが存在しない (部分更新時) |
| 500 | Internal Server Error | 内部サーバーエラー |

**エラーレスポンス形式 (NGSIv2):**

```json
{
  "error": "NotFound",
  "description": "The requested entity has not been found. Check type and id"
}
```






**エラーレスポンス形式 (NGSI-LD):**

```json
{
  "type": "https://uri.etsi.org/ngsi-ld/errors/ResourceNotFound",
  "title": "Entity not found",
  "detail": "Entity with id urn:ngsi-ld:Room:Room1 not found"
}
```







## デプロイ

GeonicDB は AWS SAM (Server