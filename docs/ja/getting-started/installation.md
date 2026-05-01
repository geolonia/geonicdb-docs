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


### 3. 環境変数の設定

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































#### 認証と認可の有効化 (オプション)

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













































#### CADDE 連携の有効化 (オプション)

CADDE (Cross-Domain Data Collaboration Infrastructure) 連携を有効にするには:

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














### 4. 1Password CLI によるシークレット管理（推奨）

機密性の高いシークレット（MongoDB の認証情報、JWT シークレット、管理者パスワード）は **`geonic-ops`** 1Password Vault に保存され、1Password CLI を介して実行時に注入されます。`.env.op` ファイル（リポジトリにコミット済み）は `op://` URI 参照のみを保持し、実際の値は含まれません。

#### 1Password CLI のインストール

```bash
# macOS
brew install 1password-cli

# Other platforms: https://developer.1password.com/docs/cli/get-started
```











確認: `op --version`#### 1Password へのシークレットの追加

**`geonic-ops`** Vault に **`geonicdb-dev`** という名前のアイテムを作成し、以下のフィールドを追加します:

| フィールド | 説明 |
|-------|-------------|
| `MONGODB_URI` | 認証情報を含む完全な MongoDB 接続文字列 |
| `JWT_SECRET` | ランダムな文字列、32 文字以上 |
| `SUPER_ADMIN_EMAIL` | ローカル開発用のスーパー管理者メールアドレス |
| `SUPER_ADMIN_PASSWORD` | ローカル開発用のスーパー管理者パスワード |

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





















#### シークレットを注入して開発サーバーを起動

```bash
npm run dev:op
# equivalent to: op run --env-file=.env.op -- npm start
```







機密性のない変数（`ENVIRONMENT`、`AWS_REGION`、`LOG_LEVEL` など）は、通常通りローカルの `.env` ファイルから読み込まれます。

> **注意:** `.env.op` はコミットしても安全です。`.env` と `.env.local` は gitignore に含まれており、絶対にコミットしてはいけません。`npm run dev:op` を使用する場合は、`.env` に `MONGODB_URI`、`JWT_SECRET`、`SUPER_ADMIN_EMAIL`、`SUPER_ADMIN_PASSWORD` を定義しないでください。これらは 1Password によって注入されるため、両方の場所に実際の値があると混乱を招く可能性があります。

### 5. ビルド

```bash
npm run build
```





## 開発コマンド

| コマンド | 説明 |
|---------|------|
| `npm start` | ローカル開発サーバーを起動（インメモリ MongoDB を使用） |
| `npm run dev:op` | 1Password からシークレットを注入して開発サーバーを起動（`geonic-ops` Vault） |
| `npm run build` | TypeScript をコンパイル |
| `npm run watch` | ファイルの変更を監視して自動コンパイル |
| `npm test` | すべてのテストを実行（ユニット + E2E） |
| `npm run test:unit` | ユニットテストのみ実行 |
| `npm run test:e2e` | E2E テストのみ実行 |
| `npm run test:watch` | ウォッチモードでユニットテストを実行 |
| `npm run test:coverage` | カバレッジレポートを生成 |
| `npm run lint` | ESLint でコードをチェック |
| `npm run lint:fix` | ESLint の問題を自動修正 |## プロジェクト構造

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
- **E2E テスト**: Cucumber.js + Gherkin (日本語 BDD フォーマット)

### すべてのテストを実行

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

E2E テストは Cucumber.js を使用し、Gherkin フォーマット (日本語) で記述されています。
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

















## E2E テスト機能ファイルの構造

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


































## Gherkin テストの例

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

















## カバレッジレポート

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






### CLI 経由での起動（推奨）

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









> **注意**: URL が競合する場合(例: アプリケーションにも `/llms.txt` がある場合)、GeonicDB が優先されます。

### アプリケーション package.json の設定例

`concurrently` を使用して、GeonicDB とアプリケーションの開発サーバーを同時に起動できます。`--kill-others` を使用すると、一方のプロセスが終了した場合、もう一方も自動的に停止します:

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



























Vite 側にプロキシ設定を追加することで、どちらのポートにアクセスしても API を使用できるようになります:

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

`createServer()` によって返されるオブジェクト:

| プロパティ | 型 | 説明 |
|-----------|------|------|
| `port` | `number` | リスニングしている実際のポート |
| `url` | `string` | サーバーの完全な URL (例: `http://localhost:3000`) |
| `mongoUri` | `string` | MongoDB 接続 URI (テストなどで使用可能) |
| `close()` | `() => Promise<void>` | サーバーと MongoDB を停止 |### プライベートリポジトリからのインストール

プライベートリポジトリの場合、SSH キーが GitHub に登録されていれば、そのまま動作します:

```bash
npm install -D github:geolonia/geonicdb
```





CI/CD 環境では、GitHub Personal Access Token または Deploy Key の設定が必要です。チーム全体での運用には、GitHub Packages への公開も検討してください。

## ローカル開発サーバー### シンプルサーバー (推奨)

`npm start` を使用してインメモリ MongoDB でローカルサーバーを起動できます。外部の MongoDB インスタンスは不要です。

```bash
npm start
```





#### ポートの指定

デフォルトのポートは `3000` です。CLI 引数または環境変数でポートを変更できます:

```bash
# Specify via CLI argument
npm start -- --port 3001

# Specify via environment variable
PORT=3001 npm start
```













優先順位: `--port` 引数 > `PORT` 環境変数 > デフォルト (3000)

指定したポートが使用中の場合、次に利用可能なポートが自動的に選択されます (最大 10 ポートまで検索)。

> **ヒント**: git worktrees と組み合わせると、異なるブランチのサーバーを同時に起動できます:
> ```bash
> # メインの worktree で起動
> npm start                    # → localhost:3000
>
> # 別の worktree で起動
> cd .worktrees/geonicdb-feature
> npm start -- --port 3001     # → localhost:3001
> ```

`Ctrl+C` を押すとサーバーが停止します。MongoDB も自動的に停止します。

**機能:**
- 外部 MongoDB 不要 (mongodb-memory-server が自動起動)
- 環境変数の設定不要
- ポートの指定が可能 (`--port` / `PORT` 環境変数)
- ポートが使用中の場合の自動フォールバック
- 開発とテストに最適
- サーバー停止時にデータがクリアされる (インメモリ)

### SAM CLI の使用

AWS SAM CLI を使用して API をローカルでテストします:

```bash
# SAM build
npm run sam:build

# Start local server
npm run sam:local
```













API は `http://localhost:3000` で利用可能になります。# サンプルテストリクエスト

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


























































## Claude Desktop から MCP (Model Context Protocol) で接続する

ローカルサーバーを起動すると、Claude Desktop からコンテキストブローカーに直接接続できます。

### 1. ローカルサーバーを起動する

```bash
npm start
```





### 2. Claude Desktop を設定する

Claude Desktop の設定ファイル (`claude_desktop_config.json`) に以下を追加します。

**macOS**: `~/Library/Application\ Support/Claude/claude_desktop_config.json`**Windows**: `%APPDATA%\Claude\claude_desktop_config.json````json
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



























> **注意**: [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) パッケージは、Streamable HTTP MCP サーバーに接続するためのブリッジとして使用されます。初回実行時に自動的にダウンロードされます。

**認証が有効な場合 (`AUTH_ENABLED=true`)**、Bearer トークンヘッダーを指定する必要があります:

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

### 3. 動作を確認する

以下のように Claude Desktop でチャットすると、コンテキストブローカーのツールが自動的に呼び出されます。

- "テナント test のエンティティ一覧を表示して"
- "ID が Room1 の Room エンティティを作成して、温度を 23.5 に設定して"
- "東京駅付近のセンサーを検索して"

### 4. curl で動作を確認する

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































詳細については、[MCP ドキュメント](../ai-integration/mcp-server.md) を参照してください。## API 仕様

### ページネーション

リスト取得エンドポイントは共通のページネーションパラメータをサポートしています。

**パラメータ:**

| パラメータ | 型 | デフォルト | 最大値 | 説明 |
|---------|---|---------|-------|------|
| `limit` | integer | 20 | 1000 | 取得する結果の数 (NGSI API) |
| `limit` | integer | 20 | 100 | 取得する結果の数 (Admin API) |
| `offset` | integer | 0 | - | スキップする結果の数 |

**レスポンスヘッダー:**

- **NGSIv2**: `Fiware-Total-Count` - 総数
- **NGSI-LD**: `NGSILD-Results-Count` - 総数
- **Admin API**: `X-Total-Count` - 総数

**例:**

```bash
# Get the first 10 results
curl "http://localhost:3000/v2/entities?limit=10&offset=0"

# Get results 11 through 20
curl "http://localhost:3000/v2/entities?limit=10&offset=10"
```













### HTTP ステータスコード

主要なステータスコードとエラーレスポンス形式:

| コード | 説明 | 使用法 |
|-------|------|--------|
| 200 | OK | エンティティ取得成功、属性更新成功 |
| 201 | Created | エンティティ作成成功 |
| 204 | No Content | エンティティ削除成功、属性削除成功 |
| 400 | Bad Request | 無効なリクエストボディ、無効なパラメータ |
| 401 | Unauthorized | 認証トークンなし、無効なトークン |
| 403 | Forbidden | 権限不足、テナントアクセス拒否 |
| 404 | Not Found | エンティティ/属性が存在しない |
| 409 | Conflict | エンティティ ID が既に存在 |
| 422 | Unprocessable Entity | エンティティが存在しない(部分更新時) |
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






## Bootstrap: 初期スーパー管理者の管理

新しい環境(ステージングまたは本番)にデプロイした後、データベースにはスーパー管理者ユーザーが存在しません。`scripts/create-super-admin.ts` を使用して、MongoDB 経由で直接作成、更新、または削除を行います。

### 前提条件

- Node.js + npm の依存関係がインストールされていること(`npm ci`)
- 1Password CLI がインストールされていること(ステージング/本番の場合)、または `MONGODB_URI` が明示的に設定されていること

### 作成または更新

```bash
# Local (requires local server to be running: npm start)
npm run super-admin:local -- --email admin@example.com --password "MyPassword123!"

# Staging — email and password read from 1Password vault automatically
npm run super-admin:staging

# Production — email and password read from 1Password vault automatically
npm run super-admin:production

# Explicit MONGODB_URI — pass credentials as env vars to avoid shell history exposure
MONGODB_URI="mongodb+srv://..." SUPER_ADMIN_EMAIL=admin@example.com \
  SUPER_ADMIN_PASSWORD="MyPassword123!" npx ts-node scripts/create-super-admin.ts
```



























### 削除

```bash
# Staging — email read from 1Password vault automatically
npm run super-admin:staging -- --delete

# Production
npm run super-admin:production -- --delete
```













### 1Password Vault のセットアップ

各環境アイテムには次のフィールドが含まれている必要があります:

| フィールド                  | 説明                      |
|------------------------|----------------------------------|
| `MONGODB_URI`          | Atlas 接続文字列          |
| `SUPER_ADMIN_EMAIL`    | Bootstrap スーパー管理者メール      |
| `SUPER_ADMIN_PASSWORD` | Bootstrap スーパー管理者パスワード   |

| 環境 | Vault        | アイテム                  |
|-------------|-------------|-----------------------|
| staging     | `geonic-ops` | `geonicdb-staging`   |
| production  | `geonic-ops` | `geonicdb-production` |

CLI 引数(`--email`、`--password`)は常に Vault の値より優先されます。

### 注意事項

- 既存の `super_admin` ユーザーに対して再実行しても安全です — パスワードがその場で更新されます。異なるロールでメールが存在する場合、意図しない権限昇格を防ぐためにスクリプトは中止されます。
- パスワードはアプリケーションのパスワードポリシー(大文字、小文字、数字、特殊文字)を満たす必要があります。
- ユーザーを作成した後、依存する前に `POST /auth/login` 経由でログインが機能することを確認してください。
- 削除は永続的です — ユーザーは MongoDB から即座に削除されます。

---

## デプロイメント

GeonicDB は AWS SAM (Serverless Application Model) アプリケーションとしてデプロイされます。すべてのリソースは `infrastructure/template.yaml` で定義され、`sam deploy` コマンドを使用して CloudFormation スタックとしてデプロイされます。### スタック構成の概要

```text
┌─────────────────────────────────────────────────────────────────────┐
│  CloudFormation Stack: geonicdb-{env}                               │
│                                                                     │
│  ┌──────────────────────┐    ┌────────────────────────────────────┐ │
│  │ API Gateway (REST)   │───▶│ Lambda: ApiHandler                │ │
│  │ ContextBrokerApi     │    │ NGSIv2 / NGSI-LD / Admin / Auth   │ │
│  └──────────────────────┘    │ MCP / Catalog / CADDE / Tiles     │ │
│                              └──────┬──────────────┬─────────────┘ │
│                                     │              │               │
│  ┌──────────────────────┐    ┌──────▼──────┐ ┌─────▼────────────┐ │
│  │ Schedule (1min)      │───▶│ EventBridge │ │ DynamoDB Tables  │ │
│  │ ChangeStreamProcessor│    │ Event Bus   │ │ - RateLimitBkts  │ │
│  └──────────────────────┘    └──────┬──────┘ │ - UsageStats     │ │
│                                     │        │ - TokenInvalid.  │ │
│  ┌──────────────────────┐    ┌──────▼──────┐ │ - Deployments    │ │
│  │ EventBridge Rule     │───▶│ Lambda:     │ └──────────────────┘ │
│  │ EntityCreated/       │    │ Matcher     │                      │
│  │ Updated/Deleted      │    └──────┬──────┘                      │
│  └──────────────────────┘           │                              │
│                              ┌──────▼──────┐                      │
│                              │ SQS FIFO    │                      │
│                              │ Notification│                      │
│                              └──────┬──────┘                      │
│                              ┌──────▼──────┐                      │
│                              │ Lambda:     │                      │
│                              │ Notifier    │                      │
│                              └─────────────┘                      │
│                                                                    │
│  ┌─ Only when EventStreamingEnabled=true ──────────────────────┐  │
│  │ WebSocket API Gateway ──▶ Lambda: Connect/Disconnect/Default │  │
│  │ EventBridge Rule ────────▶ Lambda: Broadcaster               │  │
│  │ DynamoDB: WsConnections                                      │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
  MongoDB Atlas (external)
```













































































### 前提条件

1. **AWS CLI のインストールと設定:**

```bash
aws configure
# Set AWS Access Key ID, Secret Access Key, and region (ap-northeast-1)
```







2. **AWS SAM CLI のインストール:**

```bash
# macOS (Homebrew)
brew install aws-sam-cli

# Verify
sam --version
```













3. **MongoDB Atlas の準備:**

- MongoDB Atlas でクラスターを作成 (M0 Free Tier で十分です)
- ネットワークアクセス: 開発環境では `0.0.0.0/0` を許可。本番環境では、固定の送信 IP を使用するために VPC + NAT Gateway (Elastic IP) を使用するか、Atlas へのプライベート接続のために AWS PrivateLink / VPC Peering を使用してください
- データベースユーザーを作成し、接続文字列を取得

4. **IAM 権限:**

デプロイを実行する IAM ユーザー/ロールには、以下のサービスに対する権限が必要です:
CloudFormation、Lambda、API Gateway、DynamoDB、EventBridge、SQS、IAM、S3、CloudWatch Logs### デプロイ手順

**ステップ 1: SAM ビルド**

```bash
npm run sam:build
```





**ステップ 2: samconfig.toml の作成**

`samconfig.toml` は `.gitignore` に含まれており、コミットすべきではありません(機密情報を含む可能性があります)。環境ごとに作成してください。

初回デプロイ時は、ガイドモードで対話的に作成できます:

```bash
npm run sam:deploy
# → Runs sam deploy --guided; samconfig.toml is automatically generated after entering parameters
```







手動作成用のテンプレート:

```toml
version = 0.1

[default.deploy.parameters]
stack_name = "geonicdb-dev"
resolve_s3 = true
s3_prefix = "geonicdb-dev"
region = "ap-northeast-1"
capabilities = "CAPABILITY_IAM"
parameter_overrides = [
  "Environment=dev",
  "LogLevel=DEBUG",
  "MongoDbUri=mongodb+srv://user:password@cluster.mongodb.net/?retryWrites=true&w=majority",
  "MongoDbDatabase=context-broker",
  "AuthEnabled=true",
  "JwtSecret=your-secret-key-at-least-32-characters-long",
]

[dev.deploy.parameters]
stack_name = "geonicdb-dev"
resolve_s3 = true
s3_prefix = "geonicdb-dev"
region = "ap-northeast-1"
capabilities = "CAPABILITY_IAM"
parameter_overrides = [
  "Environment=dev",
  "LogLevel=DEBUG",
  "MongoDbUri=mongodb+srv://...",
]

[prod.deploy.parameters]
stack_name = "geonicdb-prod"
resolve_s3 = true
s3_prefix = "geonicdb-prod"
region = "ap-northeast-1"
capabilities = "CAPABILITY_IAM"
confirm_changeset = true
parameter_overrides = [
  "Environment=prod",
  "LogLevel=INFO",
  "MongoDbUri=mongodb+srv://...",
]
```





















































































> **注意**: `infrastructure/parameters/dev.json` と `prod.json` は、デフォルト以外のパラメータのみをリストした参照ファイルです。実際のデプロイには `samconfig.toml` 内の `parameter_overrides` を使用してください。

**ステップ 3: デプロイの実行**

```bash
# Development environment (uses the [dev] section of samconfig.toml)
npm run sam:deploy:dev

# Production environment (uses the [prod] section of samconfig.toml)
npm run sam:deploy:prod

# Other environments such as staging (manual command)
sam deploy --config-env staging -t infrastructure/template.yaml
```



















**ステップ 4: デプロイ後の検証**

```bash
# Display all stack outputs
aws cloudformation describe-stacks \
  --stack-name geonicdb-dev \
  --query "Stacks[0].Outputs" \
  --output table

# Get only the API endpoint URL
aws cloudformation describe-stacks \
  --stack-name geonicdb-dev \
  --query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue" \
  --output text

# Health check
curl https://<api-id>.execute-api.ap-northeast-1.amazonaws.com/dev/health
```















### 自動デプロイ (CD パイプライン)

Staging は `main` へのマージごとに `.github/workflows/deploy.yml` を通じて自動的にデプロイされます。ワークフローはまず完全な CI スイートを実行し、その後 `staging` GitHub Environment にデプロイします (承認ゲートは不要)。

#### 必要な GitHub Actions のシークレットと変数

すべてのシークレットと変数は、リポジトリではなく、それぞれの GitHub Environment (`staging`、`production`) にスコープされています。つまり、同じシークレット名 (例: `DEPLOY_ROLE_ARN`) が環境ごとに異なる値を保持し、`environment: <name>` を宣言したジョブからのみアクセス可能です。

**シークレット** (`Settings → Environments → <env> → Environment secrets`):

| シークレット | 説明 |
|--------|-------------|
| `DEPLOY_ROLE_ARN` | OIDC 経由で引き受ける IAM ロールの ARN (例: `arn:aws:iam::<account>:role/geonicdb-deploy-staging`) |
| `MONGODB_URI` | MongoDB Atlas 接続 URI |
| `JWT_SECRET` | JWT 署名シークレット (32 文字以上) |

**変数** (`Settings → Environments → <env> → Environment variables`):

| 変数 | 説明 |
|----------|-------------|
| `SAM_BUCKET` | SAM アーティファクト用の S3 バケット名 (例: `geonicdb-sam-staging-ap-northeast-1`) |

#### GitHub Environment

`Settings → Environments` でデプロイターゲットごとに 1 つの環境を作成します:
- `staging` — 必須レビュアーなし; `main` へのプッシュごとに自動デプロイ
- `production` — 必須レビュアーを追加; `v*.*.*` タグでデプロイ ([本番デプロイ](#production-deploy) を参照)

#### 非機密な Staging パラメータ

非機密な値 (リージョン、環境名、機能フラグ) は `infrastructure/parameters/staging.json` から読み取られ、デプロイ時に `sam deploy --parameter-overrides` に渡されます。

#### 本番デプロイ

本番デプロイ (マルチリージョン、手動承認ゲート) はタグトリガー (`v*.*.*`) で、本番パイプラインが実装された後のフォローアップでドキュメント化されます。### 環境変数とパラメータ一覧

すべてのパラメータは `infrastructure/template.yaml` の Parameters セクションで定義されています。値は `samconfig.toml` の `parameter_overrides` を通じて設定されます。

#### 基本設定

| パラメータ | 環境変数 | デフォルト | 説明 |
|-----------|---------|-----------|------|
| `Environment` | `ENVIRONMENT` | `dev` | 環境名 (`dev` / `staging` / `prod`) |
| `LogLevel` | `LOG_LEVEL` | `INFO` | ログレベル (`DEBUG` / `INFO` / `WARN` / `ERROR`) |
| `MongoDbUri` | `MONGODB_URI` | — | MongoDB Atlas 接続文字列 (**必須**) |
| `MongoDbDatabase` | `MONGODB_DATABASE` | `context-broker` | MongoDB データベース名 |
| `ApiBaseUrl` | `API_BASE_URL` | `''` | API ドキュメントのベース URL (空の場合は `http://localhost:3000` がデフォルト) |

#### 認証と認可

詳細については、docs/AUTH.md を参照してください。

| パラメータ | 環境変数 | デフォルト | 説明 |
|-----------|---------|-----------|------|
| `AuthEnabled` | `AUTH_ENABLED` | `true` | 組み込み認証の有効化 |
| `JwtSecret` | `JWT_SECRET` | `''` | JWT 署名シークレット (32 文字以上を推奨) |
| `JwtExpiresIn` | `JWT_EXPIRES_IN` | `1h` | アクセストークンの有効期限 |
| `JwtRefreshExpiresIn` | `JWT_REFRESH_EXPIRES_IN` | `7d` | リフレッシュトークンの有効期限 |
| `SuperAdminEmail` | `SUPER_ADMIN_EMAIL` | `''` | 環境変数ベースのスーパー管理者メールアドレス |
| `SuperAdminPassword` | `SUPER_ADMIN_PASSWORD` | `''` | 環境変数ベースのスーパー管理者パスワード |
| `AdminAllowedIps` | `ADMIN_ALLOWED_IPS` | `''` | 管理 API 許可 IP (カンマ区切りの CIDR) |
| `AuthzDefaultDecision` | `AUTHZ_DEFAULT_DECISION` | `Deny` | XACML デフォルト認可決定 (`Permit` / `Deny`) |

#### OIDC 外部 IdP

詳細については、docs/AUTH.md を参照してください。

| パラメータ | 環境変数 | デフォルト | 説明 |
|-----------|---------|-----------|------|
| `OidcEnabled` | `OIDC_ENABLED` | `false` | OIDC 外部 IdP 認証の有効化 |
| `OidcIssuerUrl` | `OIDC_ISSUER_URL` | `''` | OIDC 発行者 URL |
| `OidcAudience` | `OIDC_AUDIENCE` | `''` | 期待されるオーディエンス (aud) クレーム |
| `OidcEmailClaim` | `OIDC_EMAIL_CLAIM` | `email` | メールアドレスを含む JWT クレーム名 |

#### OAuth 2.0

詳細については、docs/AUTH.md を参照してください。

| パラメータ | 環境変数 | デフォルト | 説明 |
|-----------|---------|-----------|------|
| `OAuthEnabled` | `OAUTH_ENABLED` | ~~`true`~~ | **非推奨** (#672): OAuth 2.0 は `AUTH_ENABLED=true` の場合に常に有効です。この変数は無視されます。 |
| `OAuthTokenExpiresIn` | `OAUTH_TOKEN_EXPIRES_IN` | `3600` | OAuth トークンの有効期限 (秒) |

#### レート制限とクォータ

| パラメータ | 環境変数 | デフォルト | 説明 |
|-----------|---------|-----------|------|
| `RateLimitEnabled` | `RATE_LIMIT_ENABLED` | `true` | API レート制限の有効化 |
| `QuotaAlertWebhookUrl` | `QUOTA_ALERT_WEBHOOK_URL` | `''` | クォータ違反通知用 Webhook URL |

#### バッチとタイル制限

| パラメータ | 環境変数 | デフォルト | 説明 |
|-----------|---------|-----------|------|
| `MaxBatchSize` | `MAX_BATCH_SIZE` | `100` | バッチ操作の最大エンティティ数 (1 から 10000) |
| `MaxEntitiesPerRequest` | `MAX_ENTITIES_PER_REQUEST` | `1000` | リクエストごとの最大エンティティ数 (タイルクラスタリング閾値) |

#### 時系列

| パラメータ | 環境変数 | デフォルト | 説明 |
|-----------|---------|-----------|------|
| `TemporalDataRetentionDays` | `TEMPORAL_DATA_RETENTION_DAYS` | `0` | 時系列データの保持期間 (日数) (0 = 無制限) |

#### イベントストリーミング

詳細については、[docs/EVENT_STREAMING.md](../features/subscriptions.md) を参照してください。

| パラメータ | 環境変数 | デフォルト | 説明 |
|-----------|---------|-----------|------|
| `EventStreamingEnabled` | `EVENT_STREAMING_ENABLED` | `true` | WebSocket イベントストリーミングの有効化 |

#### OpenTelemetry

詳細については、docs/INTEGRATIONS.md を参照してください。

| パラメータ | 環境変数 | デフォルト | 説明 |
|-----------|---------|-----------|------|
| `OtelEnabled` | `OTEL_ENABLED` | `false` | OpenTelemetry 分散トレーシングの有効化 |
| `OtelServiceName` | `OTEL_SERVICE_NAME` | `geonicdb` | サービス名 |
| `OtelExporterOtlpEndpoint` | `OTEL_EXPORTER_OTLP_ENDPOINT` | `''` | OTLP エクスポーターエンドポイント |
| `OtelTracesSampler` | `OTEL_TRACES_SAMPLER` | `always_on` | サンプラー (`always_on` / `always_off` / `traceidratio`) |
| `OtelTracesSamplerArg` | `OTEL_TRACES_SAMPLER_ARG` | `1.0` | サンプラー引数 (`traceidratio` の比率) |

#### 自動的に設定される環境変数

以下の環境変数は、スタック内のリソース参照から自動的に設定されるため、手動で指定する必要はありません:

| 環境変数 | ソース | 説明 |
|---------|--------|------|
| `EVENT_BUS_NAME` | `ContextBrokerEventBus` | EventBridge イベントバス名 |
| `NOTIFICATION_QUEUE_URL` | `NotificationQueue` | SQS FIFO キュー URL |
| `RATE_LIMIT_TABLE_NAME` | `RateLimitBucketsTable` | レート制限 DynamoDB テーブル名 |
| `USAGE_STATS_TABLE_NAME` | `UsageStatisticsTable` | 使用統計 DynamoDB テーブル名 |
| `TOKEN_INVALIDATION_TABLE_NAME` | `TokenInvalidationTable` | トークン無効化 DynamoDB テーブル名 |
| `WS_CONNECTIONS_TABLE` | `WsConnectionsTable` | WebSocket 接続 DynamoDB テーブル名 (条件付き) |
| `WS_API_ENDPOINT` | `WsApi` | WebSocket API エンドポイント (条件付き) |### スタック出力

デプロイ完了後に利用可能な出力値:

| 出力 | 説明 | 例 |
|--------|------|--------|
| `ApiEndpoint` | REST API エンドポイント URL | `https://<id>.execute-api.<region>.amazonaws.com/<env>` |
| `EventBusName` | EventBridge イベントバス名 | `geonicdb-dev-events` |
| `WebSocketEndpoint` | WebSocket エンドポイント (`EventStreamingEnabled=true` の場合のみ) | `wss://<id>.execute-api.<region>.amazonaws.com/<env>` |

```bash
# Get all outputs
aws cloudformation describe-stacks \
  --stack-name geonicdb-dev \
  --query "Stacks[0].Outputs" \
  --output table
```













## マルチリージョン HA (高可用性)

GeonicDB はアクティブ・パッシブアーキテクチャによるマルチリージョン HA をサポートしています。

- **プライマリ**: ap-northeast-1 (東京)
- **セカンダリ**: ap-northeast-3 (大阪)
- **アーキテクチャ**: アクティブ・パッシブ (SQS FIFO のクロスリージョン制約による)
- **目標**: RPO < 1 分、RTO < 5 分、可用性 99.99%

### アーキテクチャ概要

```text
┌─────────────────────────────────────────────┐
│            Route 53 (Failover DNS)          │
│       Primary ─── Health Check ──→ /health/ready  │
│       Secondary ─── Standby                 │
└──────────────┬──────────────┬───────────────┘
               │              │
    ┌──────────▼──────┐  ┌───▼──────────────┐
    │  ap-northeast-1 │  │  ap-northeast-3  │
    │  (Primary)      │  │  (Secondary)     │
    │                 │  │                  │
    │  API Gateway    │  │  API Gateway     │
    │  + WAF          │  │  + WAF           │
    │  ↓              │  │  ↓               │
    │  Lambda (Full)  │  │  Lambda (Read)   │
    │  ↓              │  │  ↓               │
    │  MongoDB Atlas  │  │  MongoDB Atlas   │
    │  (Primary)      │  │  (Replica)       │
    └──────┬──────────┘  └──────┬───────────┘
           │    DynamoDB GlobalTable    │
           └──────────┬───────────────┘
                      │
              ┌───────▼───────┐
              │ 3 GlobalTables │
              │ - Deployments  │
              │ - TokenInval.  │
              │ - UsageStats   │
              └───────────────┘
```

























































**プライマリリージョン**: すべての機能が有効 (CRUD、サブスクリプション、通知、Change Stream)

**セカンダリリージョン**: 以下が自動的に無効化されます:
- Change Stream プロセッサ
- サブスクリプションマッチャー / 通知送信
- SQS 通知キュー### 必要なサービスプラン

マルチリージョン HA は、シングルリージョン デプロイメントと比較して、より高いティアのサービスプランが必要です。

#### MongoDB インデックス (テナントスコープの一意制約)

GeonicDB は、テナントスコープの一意インデックスを使用して、データベースレベルでデータ分離を実施します。すべてのリソース ID は**テナントごと**に一意であり、異なるテナントが同じ ID を独立して使用できます。

| コレクション | インデックス名 | フィールド | 自動生成 ID |
|-----------|-----------|--------|-------------------|
| `entities` | `idx_entity_unique_v3` | `(tenant, servicePath, entityId)` | いいえ (ユーザー指定) |
| `subscriptions` | `idx_subscription_unique` | `(tenant, servicePath, subscriptionId)` | はい (UUID) |
| `registrations` | `idx_registration_unique` | `(tenant, servicePath, registrationId)` | はい (URN) |
| `policies` | `idx_policy_unique_v2` | `(tenantId, policyId)` | はい (UUID) |
| `policySets` | `idx_policyset_unique_v2` | `(tenantId, policySetId)` | はい (UUID) |
| `apiKeys` | `idx_api_key_id_v2` | `(tenantId, keyId)` | はい (UUID) |
| `oauthClients` | `idx_oauth_client_id_v2` | `(tenantId, oauthClientId)` | はい (UUID) |
| `oauthClients` | `idx_client_id_v2` | `(tenantId, clientId)` | はい (UUID) |
| `rules` | `idx_rule_unique_v2` | `(tenantId, ruleId)` | はい (UUID) |

レガシー v1 インデックス (`tenantId` プレフィックスなし) は、Lambda コールドスタート時に自動的に削除されます (`src/infrastructure/mongodb/client.ts` 内の `dropLegacyIndexes()`)。

#### MongoDB Atlas

| 要件 | 最小プラン | 備考 |
|-------------|-------------|-------|
| マルチリージョンクラスター | **M10+** (専用) | M0/M2/M5 (共有) はマルチリージョンレプリケーションをサポートしていません |
| クロスリージョン読み取りレプリカ | **M10+** | セカンダリリージョンの読み取りアクセスに必要 |
| Change Streams | **M10+** (専用) | サブスクリプションに必要。Change Streams は WiredTiger ストレージエンジンを使用するレプリカセットで動作します。サーバーレスインスタンスはサポートしていません。Atlas App Services の制限: M10/M20 は最大 100、M30/M40 は最大 1000 の同時ストリーム |

> **注**: 本番環境のワークロードには M30+ を推奨します。エンティティ数によるサイジングガイドラインについては、[FAQ](../faq.md) も参照してください。レイテンシーベースのルーティングのためにゾーンベースのシャーディング (Global Cluster) が必要な場合は、現在のティア要件について [Atlas Global Clusters ドキュメント](https://www.mongodb.com/docs/atlas/global-clusters/) を参照してください。

MongoDB Atlas の接続文字列は両リージョンで同じです — Atlas が内部的にレプリカルーティングを処理します。セカンダリリージョンはデフォルトで `readPreference: primaryPreferred` を使用しますが、`MONGODB_READ_PREFERENCE` 環境変数で変更できます。

#### DynamoDB

| 要件 | 課金モード | 備考 |
|-------------|-------------|-------|
| Global Tables (V2) | **PAY_PER_REQUEST** (オンデマンド) | 3 つのテーブルのクロスリージョンレプリケーションに使用 |
| ポイントインタイムリカバリ | 含まれる | すべての GlobalTable レプリカで有効 |

**GlobalTable として設定された 3 つのテーブル** (プライマリとセカンダリ間でレプリケート):

| テーブル (物理名) | CloudFormation 論理名 | 課金モード | GlobalTable |
|-----------------------|---------------------------|:------------:|:-----------:|
| `geonicdb-deployments` | `DeploymentsTable` | PAY_PER_REQUEST | はい |
| `{stack}-token-invalidations` | `TokenInvalidationTable` | PAY_PER_REQUEST | はい |
| `{stack}-usage-statistics` | `UsageStatisticsTable` | PAY_PER_REQUEST | はい |
| `{stack}-rate-limit-buckets` | `RateLimitBucketsTable` | PAY_PER_REQUEST | いいえ (リージョンローカル) |
| `{stack}-ws-connections` | `WsConnectionsTable` | PAY_PER_REQUEST | いいえ (リージョンローカル) |

> **注**: DynamoDB Global Tables は `PAY_PER_REQUEST` (オンデマンド) と `PROVISIONED` 課金モードの両方をサポートしています (デフォルトは `PROVISIONED`)。GeonicDB のテンプレートは、運用を簡素化しキャパシティプランニングを回避するため、設計上の選択として `PAY_PER_REQUEST` を使用しています。クロスリージョンレプリケーションのコストが適用されます — 書き込みはレプリカごとにレプリケート書き込みリクエストユニット (rWRU) として課金されます。

### HA 関連の環境変数

| 変数 | 説明 | デフォルト |
|----------|-------------|---------|
| `REGION_ROLE` | リージョンの役割 (`primary` / `secondary`) | `primary` |
| `PRIMARY_REGION` | プライマリ AWS リージョン | `ap-northeast-1` |
| `SECONDARY_REGION` | セカンダリ AWS リージョン | `ap-northeast-3` |
| `JWT_SECRET_ARN` | JWT シークレット用 Secrets Manager ARN | (空) |
| `MONGODB_URI_ARN` | MongoDB URI 用 Secrets Manager ARN | (空) |
| `HEALTH_CHECK_DYNAMODB` | DynamoDB ヘルスチェックを有効化 | `false` |
| `HEALTH_CHECK_EVENTBRIDGE` | EventBridge ヘルスチェックを有効化 | `false` |
| `MONGODB_READ_PREFERENCE` | MongoDB 読み取りプリファレンス | `primaryPreferred` |
| `MONGODB_WRITE_CONCERN` | MongoDB 書き込みコンサーンレベル | `majority` |
| `MONGODB_READ_CONCERN` | MongoDB 読み取りコンサーンレベル | `majority` |
| `MONGODB_RETRY_WRITES` | MongoDB 書き込みリトライ | `true` |### Read/Write Consistency Policy

MongoDB の read preference / write concern / read concern は **`MongoClient` 生成時に一度だけ設定** し、個別 operation では上書きしない方針です。これは `src/infrastructure/mongodb/client.ts` に集約され、静的検査テスト (`tests/unit/infrastructure/mongodb/no-per-op-read-preference.test.ts`) によって「個別 operation での override が混入しない」ことが保証されています。

例外:

- **Change Stream は必ず `primary` から読む**: oplog を tail する性質上 primary 固定が必須。`docker-entrypoint.mjs` と `src/local-server.ts` の `collection.watch()` に `readPreference: 'primary'` を明示しています (allowlist で検査を除外)。

#### デフォルトの根拠

- **`readPreference: primaryPreferred`**: 通常は primary から読み、primary 不在時のみ最も近い secondary にフォールバック。Read-your-writes consistency をほぼ保ちつつ、primary 障害時の可用性も確保する中庸な選択。
- **`writeConcern: majority`**: 過半数のレプリカに書き込みが伝播するまで待機。Rollback 可能性を最小化。
- **`readConcern: majority`**: コミット済み (過半数に伝播済み) のデータだけを読む。snapshot 隔離ではないが stale read を防ぐ。
- **`retryWrites: true`**: ネットワーク一時障害時の再送を driver に任せる。

#### マルチリージョン時の選択肢

Atlas でマルチリージョン (replica set 5 ノード × 3 リージョンなど) を運用する際、**アプリ側で read preference を変えるなら環境変数だけで切り替える** のが作法です。

| 選択肢 | `MONGODB_READ_PREFERENCE` | ユースケース |
|---|---|---|
| 強整合 (既定) | `primaryPreferred` | Read-your-writes が要、レイテンシより一貫性優先 |
| 近接読み | `nearest` | 地理分散した read-only 用途、stale 許容 |
| Analytics 分離 | secondary + tag (`{nodeType: 'ANALYTICS'}`) | 集計/BI を専用ノードに逃がす。tag-aware はクライアント URI のオプションで指定 |

Tag-aware な read preference が必要になった時点で、`MongoClient` 接続 URI の `readPreferenceTags` を ENV で上書きする形で対応可能です (アプリ側コード変更不要)。

**Change Stream のルーティング** はこの方針の影響を受けません (常に primary 固定)。

### SAM Templates

マルチリージョン デプロイメントでは 2 つのテンプレートを使用します:

| テンプレート | スコープ | 説明 |
|----------|-------|-------------|
| `infrastructure/template.yaml` | リージョナル | メインスタック (プライマリとセカンダリの両方にデプロイ) |
| `infrastructure/template-route53.yaml` | グローバル | Route 53 フェイルオーバー (一度だけデプロイ) |### マルチリージョン HA デプロイメント手順

#### ステップ 1: Secrets Manager にシークレットを登録

Secrets Manager にシークレットを作成します。Secrets Manager はリージョナルサービスのため、各リージョンにシークレットを作成する必要があります。

```bash
# Primary region (ap-northeast-1)
aws secretsmanager create-secret \
  --region ap-northeast-1 \
  --name "geonicdb/prod/mongodb-uri" \
  --secret-string "mongodb+srv://user:password@cluster.mongodb.net/?retryWrites=true&w=majority"

aws secretsmanager create-secret \
  --region ap-northeast-1 \
  --name "geonicdb/prod/jwt-secret" \
  --secret-string "your-jwt-secret-key-min-32-chars-long"

# Secondary region (ap-northeast-3)
aws secretsmanager create-secret \
  --region ap-northeast-3 \
  --name "geonicdb/prod/mongodb-uri" \
  --secret-string "mongodb+srv://user:password@cluster.mongodb.net/?retryWrites=true&w=majority"

aws secretsmanager create-secret \
  --region ap-northeast-3 \
  --name "geonicdb/prod/jwt-secret" \
  --secret-string "your-jwt-secret-key-min-32-chars-long"
```













































> **注意**: MongoDB Atlas の接続文字列は両リージョンで同一です（Atlas がリージョンルーティングを処理します）。両リージョンで同じ JWT シークレット値を使用してください。

#### ステップ 2: プライマリリージョンへのデプロイ

```bash
# SAM build
npm run sam:build

# Primary deploy
sam deploy \
  --region ap-northeast-1 \
  --stack-name geonicdb-prod \
  --parameter-overrides \
    Environment=prod \
    RegionRole=primary \
    PrimaryRegion=ap-northeast-1 \
    SecondaryRegion=ap-northeast-3 \
    JwtSecretArn=arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:geonicdb/prod/jwt-secret \
    MongoDbUriArn=arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:geonicdb/prod/mongodb-uri \
    HealthCheckDynamoDb=true \
    HealthCheckEventBridge=true \
  --capabilities CAPABILITY_IAM \
  --resolve-s3
```







































プライマリデプロイメントは以下を自動的に作成します:
- Lambda 関数（API、Change Stream プロセッサ、サブスクリプションマッチャーなど）
- 3 つの DynamoDB GlobalTable（Deployments、TokenInvalidation、UsageStatistics）
  - セカンダリリージョンのレプリカは自動的に作成されます
- SQS 通知キュー + DLQ
- EventBridge イベントバス
- WAF WebACL（AWS マネージドルール + IP レート制限 2000 req/5min）

#### ステップ 3: セカンダリリージョンへのデプロイ

```bash
sam deploy \
  --region ap-northeast-3 \
  --stack-name geonicdb-prod \
  --parameter-overrides \
    Environment=prod \
    RegionRole=secondary \
    PrimaryRegion=ap-northeast-1 \
    SecondaryRegion=ap-northeast-3 \
    JwtSecretArn=arn:aws:secretsmanager:ap-northeast-3:123456789012:secret:geonicdb/prod/jwt-secret \
    MongoDbUriArn=arn:aws:secretsmanager:ap-northeast-3:123456789012:secret:geonicdb/prod/mongodb-uri \
    HealthCheckDynamoDb=true \
    HealthCheckEventBridge=true \
  --capabilities CAPABILITY_IAM \
  --resolve-s3
```































セカンダリデプロイメントは以下を **自動的に無効化** します（`IsPrimaryCondition` によって制御）:
- サブスクリプションマッチャー / 通知送信 Lambda
- SQS 通知キュー / DLQ
- Change Stream プロセッサのスケジュールトリガー
- DynamoDB テーブル（GlobalTable によりプライマリから既にレプリケート済み）

#### ステップ 4: Route 53 フェイルオーバーの設定Route 53 はグローバルリソースなので、別のテンプレートを使用して一度だけデプロイします。

> **注意**: Route 53 フェイルオーバーを設定する前に、各リージョンで API Gateway カスタムドメインとベースパスマッピングが必要です。生の `execute-api` ホスト名にはステージパスセグメントが含まれており、DNS CNAME レコードで直接使用できません。まず各リージョンでカスタムドメイン (例: `primary-api.example.com`、`secondary-api.example.com`) とベースパスマッピングを設定してください。

```bash
sam deploy \
  --region ap-northeast-1 \
  --stack-name geonicdb-route53 \
  --template-file infrastructure/template-route53.yaml \
  --parameter-overrides \
    DomainName=api.example.com \
    HostedZoneId=Z1234567890ABC \
    PrimaryEndpoint=primary-api.example.com \
    SecondaryEndpoint=secondary-api.example.com \
    FailoverNotificationEmail=ops-team@example.com \
  --capabilities CAPABILITY_IAM
```

























このテンプレートは以下を作成します:
- Route 53 ヘルスチェック (プライマリの `/health/ready` を 10 秒ごとに監視し、3 回連続で失敗すると異常とマーク)
- Route 53 フェイルオーバーレコード (PRIMARY/SECONDARY CNAME レコード)
- CloudWatch アラーム (ヘルスチェックステータス監視)
- SNS トピック (フェイルオーバー通知メール)

#### ステップ 5: デプロイ後の検証

```bash
# Primary health check
curl https://primary-api.example.com/health/ready
# Expected: {"status":"healthy","region":"ap-northeast-1","regionRole":"primary","checks":{"mongodb":{"status":"healthy",...},...},...}

# Secondary health check
curl https://secondary-api.example.com/health/ready
# Expected: {"status":"healthy","region":"ap-northeast-3","regionRole":"secondary",...}

# Route 53 failover DNS verification
dig api.example.com CNAME
# Expected: CNAME to Primary endpoint

# Route 53 Health Check status
aws route53 get-health-check-status \
  --health-check-id <health-check-id>
```

































### フェイルオーバー動作

Route 53 ヘルスチェックがプライマリの `/health/ready` で 3 回連続して失敗を検出した場合:

1. **自動フェイルオーバー**: Route 53 は DNS をセカンダリエンドポイントに切り替えます (RTO < 5 分)
2. **通知**: CloudWatch アラーム → SNS → 管理者へのメール通知
3. **フェイルオーバー記録**: フェイルオーバー Lambda が DynamoDB に状態を記録

プライマリが復旧した場合:
1. Route 53 ヘルスチェックが正常ステータスを検出
2. DNS が自動的にプライマリに切り戻ります
3. SNS 経由で復旧通知

### DynamoDB GlobalTable

以下の 3 つのテーブルはリージョン間で自動的にレプリケートされます:

| テーブル | 目的 | GlobalTable にする理由 |
|-------|---------|------------------------|
| `DeploymentsTable` | テナント設定 | フェイルオーバー時にテナント情報が必要 |
| `TokenInvalidationTable` | トークン無効化リスト | セキュリティ要件 (無効化は両リージョンに反映される必要がある) |
| `UsageStatisticsTable` | API 使用統計 | 統合ビューを提供 |

以下のテーブルはリージョンローカルです (**GlobalTable ではない**):

| テーブル | 理由 |
|-------|--------|
| `RateLimitBucketsTable` | レート制限はリージョンごとに計算される |
| `WsConnectionsTable` | WebSocket 接続はリージョン固有 |

### WAF 設定

WAF WebACL は各リージョンの API Gateway に適用されます:

| ルール | 説明 |
|------|-------------|
| AWSManagedRulesCommonRuleSet | 一般的な攻撃からの保護 (除外: SizeRestrictions_BODY、CrossSiteScripting_BODY、EC2MetaDataSSRF_BODY) |
| AWSManagedRulesSQLiRuleSet | SQL インジェクション保護 |
| AWSManagedRulesKnownBadInputsRuleSet | 既知の不正入力からの保護 (Log4Shell など) |
| RateLimitPerIP (2000 req / 5min per IP) | IP ごとのレート制限 |
| SizeRestrictionBody10MB | カスタムボディサイズ制限 (10 MB) |### セカンダリリージョンのローカルテスト

```bash
REGION_ROLE=secondary npm start
```





セカンダリモードでは、起動時に Change Stream プロセッサがスキップされます（ログ出力で確認可能）。

## デプロイメント管理（ホスト名ベースのマルチデータベース）

GeonicDB は、ホスト名に基づいて異なる MongoDB データベースに接続するマルチデプロイメント機能をサポートしています（#396）。

### 仕組み

```text
Request (Host: customer-a.geonicdb.io)
  ↓
Hostname extraction middleware
  ↓ hostname = "customer-a.geonicdb.io"
DeploymentService.getDeploymentConfig(hostname)
  ├─ In-memory cache check (TTL: 5 min)
  └─ Fetch from DynamoDB `geonicdb-deployments` table
  ↓ DeploymentConfig { mongodbUri, databaseName, ... }
ConnectionManager.getDatabaseForHostname()
  └─ Manages independent MongoClient per hostname/DB name
  ↓
MongoDB (deployment-specific database)
```



























### DeploymentConfig スキーマ

DynamoDB `geonicdb-deployments` テーブルのアイテム構造:

| フィールド | タイプ | 必須 | 説明 |
|-------|------|:--------:|-------------|
| `hostname` | String | ✅ | パーティションキー。リクエストの Host ヘッダーと照合される |
| `mongodbUri` | String | ✅ | MongoDB Atlas 接続文字列 |
| `databaseName` | String | ✅ | 使用するデータベース名 |
| `defaultQuotaPlan` | String | ✅ | クォータプラン (`FREE` / `STANDARD` / `PREMIUM` / `ENTERPRISE` / `CUSTOM`) |
| `enabled` | Boolean | ✅ | `false` の場合、デフォルト DB にフォールバック |
| `rateLimitTableName` | String | - | デプロイメント固有のレート制限テーブル名 |
| `createdAt` | Number | ✅ | 作成タイムスタンプ（UNIX ミリ秒） |
| `updatedAt` | Number | ✅ | 更新タイムスタンプ（UNIX ミリ秒） |
| `metadata` | Map | - | 任意の追加メタデータ |

### デプロイメントの追加と管理

現在（フェーズ 0）、デプロイメント設定は AWS CLI または DynamoDB コンソールを介して直接管理されます。

#### AWS CLI によるデプロイメントの追加

```bash
aws dynamodb put-item \
  --table-name geonicdb-deployments \
  --item '{
    "hostname": {"S": "customer-a.geonicdb.io"},
    "mongodbUri": {"S": "mongodb+srv://user:password@cluster-a.mongodb.net/?retryWrites=true&w=majority"},
    "databaseName": {"S": "geonicdb-customer-a"},
    "defaultQuotaPlan": {"S": "ENTERPRISE"},
    "enabled": {"BOOL": true},
    "createdAt": {"N": "1740441600000"},
    "updatedAt": {"N": "1740441600000"}
  }'
```

























#### デプロイメントの無効化

```bash
aws dynamodb update-item \
  --table-name geonicdb-deployments \
  --key '{"hostname": {"S": "customer-a.geonicdb.io"}}' \
  --update-expression "SET enabled = :e, updatedAt = :u" \
  --expression-attribute-values '{
    ":e": {"BOOL": false},
    ":u": {"N": "1740528000000"}
  }'
```



















#### 全デプロイメントの一覧表示

```bash
aws dynamodb scan \
  --table-name geonicdb-deployments \
  --projection-expression "hostname, databaseName, defaultQuotaPlan, enabled" \
  --output table
```











### フォールトトレランス

| シナリオ | 動作 |
|----------|----------|
| ホスト名が DynamoDB に登録されていない | `null` フォールバック → デフォルト DB で処理を継続 |
| デプロイメントが `enabled: false` になっている | 未登録と同じ扱い |
| DynamoDB 接続失敗 | エラーをログに記録 + `null` フォールバック（リクエストはブロックされない） |
| キャッシュ期限切れ | 次のリクエスト時に DynamoDB を再クエリ |
| 未知のホスト名での連続リクエスト | ネガティブキャッシュ（`null` をキャッシュして DynamoDB 負荷を軽減） |### 設定変更の伝播

デプロイメント設定の変更は、キャッシュ TTL (デフォルトは 5 分) が期限切れになった後に有効になります。即座に反映させるには、Lambda 関数を再デプロイしてください。

```ts
// Cache TTL setting (src/config/defaults.ts)
DEPLOYMENTS.CACHE_TTL_MS = 300000  // 5 min
```







### HA 統合

`geonicdb-deployments` テーブルは DynamoDB GlobalTable として設定されており、プライマリリージョンとセカンダリリージョンの両方で自動的にレプリケートされます。フェイルオーバー時には、デプロイメント設定が即座に利用可能になります。

## パスエイリアス

TypeScript でパスエイリアスが使用されています:

```typescript
import { EntityService } from '@core/entities/entity.service';
import { NotFoundError } from '@api/shared/errors';
import { handler } from '@handlers/api';
import { getDatabase } from '@infrastructure/mongodb';
```





