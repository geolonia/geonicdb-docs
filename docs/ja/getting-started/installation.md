---
title: "開発者ガイド"
description: "開発環境セットアップ・インストール"
outline: deep
---
# Developer Guide

## Requirements

- Node.js 24.x or higher
- npm 9.x or higher
- AWS CLI v2 (for deployment)
- AWS SAM CLI (for deployment)
- MongoDB 8.0 or higher (MongoDB Atlas or local MongoDB)
- [1Password CLI](https://developer.1password.com/docs/cli) (`op`) — for secret injection (recommended)

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/geolonia/geonicdb.git
cd geonicdb
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file:

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

#### Enabling authentication and authorization (optional)

To enable the authentication feature, add the following environment variables:

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

#### Enabling CADDE integration (optional)

To enable CADDE (Cross-Domain Data Collaboration Infrastructure) integration:

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

### 4. Secret management with 1Password CLI (recommended)

Sensitive secrets (MongoDB credentials, JWT secrets, admin passwords) are stored in the **`geonic-ops`** 1Password vault and injected at runtime via the 1Password CLI. The `.env.op` file (committed to the repo) holds only `op://` URI references — no real values.

#### Install the 1Password CLI

```bash
# macOS
brew install 1password-cli

# Other platforms: https://developer.1password.com/docs/cli/get-started
```

Verify: `op --version`

#### Add secrets to 1Password

Create an item named **`geonicdb-dev`** in the **`geonic-ops`** vault with the following fields:

| Field | Description |
|-------|-------------|
| `MONGODB_URI` | Full MongoDB connection string including credentials |
| `JWT_SECRET` | Random string, 32+ characters |
| `SUPER_ADMIN_EMAIL` | Local dev super-admin email |
| `SUPER_ADMIN_PASSWORD` | Local dev super-admin password |

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

#### Start the dev server with secrets injected

```bash
npm run dev:op
# equivalent to: op run --env-file=.env.op -- npm start
```

Non-secret variables (`ENVIRONMENT`, `AWS_REGION`, `LOG_LEVEL`, etc.) are still read from a local `.env` file as usual.

> **Note:** `.env.op` is safe to commit. `.env` and `.env.local` are gitignored and must never be committed. When using `npm run dev:op`, do not also define `MONGODB_URI`, `JWT_SECRET`, `SUPER_ADMIN_EMAIL`, or `SUPER_ADMIN_PASSWORD` in your `.env` — they are injected by 1Password, and having real values in both places may cause confusion.

### 5. Build

```bash
npm run build
```

## Development Commands

| Command | Description |
|---------|------|
| `npm start` | Start the local development server (using in-memory MongoDB) |
| `npm run dev:op` | Start the dev server with secrets injected from 1Password (`geonic-ops` vault) |
| `npm run build` | Compile TypeScript |
| `npm run watch` | Watch for file changes and auto-compile |
| `npm test` | Run all tests (unit + E2E) |
| `npm run test:unit` | Run unit tests only |
| `npm run test:e2e` | Run E2E tests only |
| `npm run test:watch` | Run unit tests in watch mode |
| `npm run test:coverage` | Generate coverage report |
| `npm run lint` | Check code with ESLint |
| `npm run lint:fix` | Auto-fix ESLint issues |

## Project Structure

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

## Testing

This project uses two types of testing frameworks:

- **Unit tests / Integration tests**: Jest
- **E2E tests**: Cucumber.js + Gherkin (Japanese BDD format)

### Run all tests

```bash
npm test
```

### Run unit tests

```bash
# All unit tests
npm run test:unit

# Watch mode
npm run test:watch

# Specific file
npx jest tests/unit/api/ngsiv2/controllers/entities.controller.test.ts
```

### Run E2E tests

E2E tests use Cucumber.js and are written in Gherkin format (Japanese).
Test cases are implemented based on the FIWARE Orion API documentation.

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

### E2E test feature file structure

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

### Gherkin test example

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

### Coverage report

```bash
npm run test:coverage
```

You can view the HTML report at `coverage/lcov-report/index.html`.

## Developing integration applications (using as an npm package)

You can install GeonicDB as an npm package and integrate it with your application's development server.

### Installation

```bash
# Install directly from GitHub repository
npm install -D github:geolonia/geonicdb

# Also install peerDependencies
npm install -D express mongodb-memory-server
```

### Start via CLI (recommended)

You can start GeonicDB standalone with the `npx geonicdb` command. Using the `--proxy` option forwards requests that do not match GeonicDB routes to the application's development server.

```bash
# Basic startup
npx geonicdb

# Specify port
npx geonicdb --port 3001

# Start with proxy (integrate with Vite or other dev servers)
npx geonicdb --port 3000 --proxy http://localhost:5173
```

Request flow when `--proxy` is specified:

```text
Browser → localhost:3000 (GeonicDB)
  ├── /v2/*, /ngsi-ld/*, /llms.txt, etc. → Handled by GeonicDB
  └── Others (HTML, JS, CSS, etc.)        → Proxied to application dev server
```

> **Note**: If URLs conflict (e.g., the application also has `/llms.txt`), GeonicDB takes priority.

### Application package.json configuration example

You can use `concurrently` to start GeonicDB and the application's development server simultaneously. With `--kill-others`, if one process exits, the other also stops automatically:

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

Adding a proxy configuration to the Vite side allows the API to be used regardless of which port is accessed:

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

### Programmatic API

You can also start and control the server directly from JavaScript/TypeScript:

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

#### GeonicDBServer object

The object returned by `createServer()`:

| Property | Type | Description |
|-----------|------|------|
| `port` | `number` | The actual port being listened on |
| `url` | `string` | The server's full URL (e.g., `http://localhost:3000`) |
| `mongoUri` | `string` | MongoDB connection URI (usable in tests, etc.) |
| `close()` | `() => Promise<void>` | Stop the server and MongoDB |

### Installing from a private repository

For private repositories, if your SSH key is registered with GitHub, it works as-is:

```bash
npm install -D github:geolonia/geonicdb
```

In CI/CD environments, you need to configure a GitHub Personal Access Token or Deploy Key. For full team operation, consider publishing to GitHub Packages as well.

## Local development server

### Simple server (recommended)

You can start a local server using in-memory MongoDB with `npm start`. No external MongoDB instance is required.

```bash
npm start
```

#### Specifying a port

The default port is `3000`. You can change the port with a CLI argument or environment variable:

```bash
# Specify via CLI argument
npm start -- --port 3001

# Specify via environment variable
PORT=3001 npm start
```

Priority: `--port` argument > `PORT` environment variable > default (3000)

If the specified port is in use, the next available port is automatically selected (searches up to 10 ports).

> **Tip**: Combined with git worktrees, you can start servers for different branches simultaneously:
> ```bash
> # Start in the main worktree
> npm start                    # → localhost:3000
>
> # Start in another worktree
> cd .worktrees/geonicdb-feature
> npm start -- --port 3001     # → localhost:3001
> ```

Press `Ctrl+C` to stop the server. MongoDB also stops automatically.

**Features:**
- No external MongoDB required (mongodb-memory-server starts automatically)
- No environment variable configuration required
- Port can be specified (`--port` / `PORT` environment variable)
- Automatic fallback if the port is in use
- Ideal for development and testing
- Data is cleared when the server stops (in-memory)

### Using SAM CLI

Test the API locally using AWS SAM CLI:

```bash
# SAM build
npm run sam:build

# Start local server
npm run sam:local
```

The API will be available at `http://localhost:3000`.

### Sample test requests

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

## Connecting from Claude Desktop via MCP (Model Context Protocol)

With the local server running, you can connect directly to the context broker from Claude Desktop.

### 1. Start the local server

```bash
npm start
```

### 2. Configure Claude Desktop

Add the following to the Claude Desktop configuration file (`claude_desktop_config.json`).

**macOS**: `~/Library/Application\ Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

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

> **Note**: The [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) package is used as a bridge to connect to the Streamable HTTP MCP server. It is downloaded automatically on first run.

**When authentication is enabled (`AUTH_ENABLED=true`)**, you need to specify the Bearer token header:

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

After configuring, restart Claude Desktop.

### 3. Verify operation

When you chat with Claude Desktop as shown below, the context broker tools are automatically invoked.

- "Show me the list of entities in tenant test"
- "Create a Room entity with ID Room1 and set the temperature to 23.5"
- "Search for sensors near Tokyo Station"

### 4. Verify operation with curl

To verify MCP protocol behavior without using Claude Desktop:

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

For details, refer to the [MCP documentation](../ai-integration/mcp-server.md).

## API Specification

### Pagination

List retrieval endpoints support common pagination parameters.

**Parameters:**

| Parameter | Type | Default | Maximum | Description |
|---------|---|---------|-------|------|
| `limit` | integer | 20 | 1000 | Number of results to retrieve (NGSI API) |
| `limit` | integer | 20 | 100 | Number of results to retrieve (Admin API) |
| `offset` | integer | 0 | - | Number of results to skip |

**Response headers:**

- **NGSIv2**: `Fiware-Total-Count` - Total count
- **NGSI-LD**: `NGSILD-Results-Count` - Total count
- **Admin API**: `X-Total-Count` - Total count

**Example:**

```bash
# Get the first 10 results
curl "http://localhost:3000/v2/entities?limit=10&offset=0"

# Get results 11 through 20
curl "http://localhost:3000/v2/entities?limit=10&offset=10"
```

### HTTP Status Codes

Main status codes and error response formats:

| Code | Description | Usage |
|-------|------|--------|
| 200 | OK | Entity retrieval successful, attribute update successful |
| 201 | Created | Entity creation successful |
| 204 | No Content | Entity deletion successful, attribute deletion successful |
| 400 | Bad Request | Invalid request body, invalid parameters |
| 401 | Unauthorized | No authentication token, invalid token |
| 403 | Forbidden | Insufficient permissions, tenant access denied |
| 404 | Not Found | Entity/attribute does not exist |
| 409 | Conflict | Entity ID already exists |
| 422 | Unprocessable Entity | Entity does not exist (during partial update) |
| 500 | Internal Server Error | Internal server error |

**Error response format (NGSIv2):**

```json
{
  "error": "NotFound",
  "description": "The requested entity has not been found. Check type and id"
}
```

**Error response format (NGSI-LD):**

```json
{
  "type": "https://uri.etsi.org/ngsi-ld/errors/ResourceNotFound",
  "title": "Entity not found",
  "detail": "Entity with id urn:ngsi-ld:Room:Room1 not found"
}
```

## Deployment

GeonicDB is deployed as an AWS SAM (Serverless Application Model) application. All resources are defined in `infrastructure/template.yaml` and deployed as a CloudFormation stack using the `sam deploy` command.

### Stack configuration overview

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

### Prerequisites

1. **Install and configure AWS CLI:**

```bash
aws configure
# Set AWS Access Key ID, Secret Access Key, and region (ap-northeast-1)
```

2. **Install AWS SAM CLI:**

```bash
# macOS (Homebrew)
brew install aws-sam-cli

# Verify
sam --version
```

3. **Prepare MongoDB Atlas:**

- Create a cluster in MongoDB Atlas (M0 Free Tier is sufficient)
- Network access: Allow `0.0.0.0/0` (restrict to AWS Lambda IP ranges only in production)
- Create a database user and obtain the connection string

4. **IAM permissions:**

The IAM user/role executing the deployment needs permissions for the following services:
CloudFormation, Lambda, API Gateway, DynamoDB, EventBridge, SQS, IAM, S3, CloudWatch Logs

### Deployment steps

**Step 1: SAM build**

```bash
npm run sam:build
```

**Step 2: Create samconfig.toml**

`samconfig.toml` is included in `.gitignore` and should not be committed (it may contain secrets). Create it per environment.

For the first deployment, you can create it interactively in guided mode:

```bash
npm run sam:deploy
# → Runs sam deploy --guided; samconfig.toml is automatically generated after entering parameters
```

Template for manual creation:

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

> **Note**: `infrastructure/parameters/dev.json` and `prod.json` are reference files listing only non-default parameters. Use `parameter_overrides` in `samconfig.toml` for actual deployments.

**Step 3: Execute deployment**

```bash
# Development environment (uses the [dev] section of samconfig.toml)
npm run sam:deploy:dev

# Production environment (uses the [prod] section of samconfig.toml)
npm run sam:deploy:prod

# Other environments such as staging (manual command)
sam deploy --config-env staging -t infrastructure/template.yaml
```

**Step 4: Post-deployment verification**

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

### Automated deployment (CD pipeline)

Staging is deployed automatically on every merge to `main` via `.github/workflows/deploy.yml`. The workflow runs the full CI suite first, then deploys to the `staging` GitHub Environment (no approval gate required).

#### Required GitHub Actions secrets and variables

All secrets and variables are scoped to their respective GitHub Environment (`staging`, `production`), not the repository. This means the same secret name (e.g. `DEPLOY_ROLE_ARN`) holds different values per environment and is only accessible to jobs that declare `environment: <name>`.

**Secrets** (`Settings → Environments → <env> → Environment secrets`):

| Secret | Description |
|--------|-------------|
| `DEPLOY_ROLE_ARN` | ARN of the IAM role assumed via OIDC (e.g. `arn:aws:iam::<account>:role/geonicdb-deploy-staging`) |
| `MONGODB_URI` | MongoDB Atlas connection URI |
| `JWT_SECRET` | JWT signing secret (32+ chars) |

**Variables** (`Settings → Environments → <env> → Environment variables`):

| Variable | Description |
|----------|-------------|
| `SAM_BUCKET` | S3 bucket name for SAM artifacts (e.g. `geonicdb-sam-staging-ap-northeast-1`) |

#### GitHub Environment

Create one environment per deployment target in `Settings → Environments`:
- `staging` — no required reviewers; deploys automatically on every push to `main`
- `production` — add required reviewers; deploys on `v*.*.*` tags (see [Production deploy](#production-deploy))

#### Non-sensitive staging parameters

Non-sensitive values (region, environment name, feature flags) are read from `infrastructure/parameters/staging.json` and passed to `sam deploy --parameter-overrides` at deploy time.

#### Production deploy

Production deploys (multi-region, manual approval gate) are tag-triggered (`v*.*.*`) and documented in a follow-up once the production pipeline is implemented.

### Environment variables and parameters list

All parameters defined in the Parameters section of `infrastructure/template.yaml`. Values are set via `parameter_overrides` in `samconfig.toml`.

#### Basic settings

| Parameter | Environment Variable | Default | Description |
|-----------|---------|-----------|------|
| `Environment` | `ENVIRONMENT` | `dev` | Environment name (`dev` / `staging` / `prod`) |
| `LogLevel` | `LOG_LEVEL` | `INFO` | Log level (`DEBUG` / `INFO` / `WARN` / `ERROR`) |
| `MongoDbUri` | `MONGODB_URI` | — | MongoDB Atlas connection string (**required**) |
| `MongoDbDatabase` | `MONGODB_DATABASE` | `context-broker` | MongoDB database name |
| `ApiBaseUrl` | `API_BASE_URL` | `''` | Base URL for API documentation (defaults to `http://localhost:3000` if empty) |

#### Authentication and authorization

For details, refer to docs/AUTH.md.

| Parameter | Environment Variable | Default | Description |
|-----------|---------|-----------|------|
| `AuthEnabled` | `AUTH_ENABLED` | `true` | Enable built-in authentication |
| `JwtSecret` | `JWT_SECRET` | `''` | JWT signing secret (32 characters or more recommended) |
| `JwtExpiresIn` | `JWT_EXPIRES_IN` | `1h` | Access token expiration |
| `JwtRefreshExpiresIn` | `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token expiration |
| `SuperAdminEmail` | `SUPER_ADMIN_EMAIL` | `''` | Environment variable-based super admin email |
| `SuperAdminPassword` | `SUPER_ADMIN_PASSWORD` | `''` | Environment variable-based super admin password |
| `AdminAllowedIps` | `ADMIN_ALLOWED_IPS` | `''` | Admin API allowed IPs (comma-separated CIDR) |
| `AuthzDefaultDecision` | `AUTHZ_DEFAULT_DECISION` | `Deny` | XACML default authorization decision (`Permit` / `Deny`) |

#### OIDC external IdP

For details, refer to docs/AUTH.md.

| Parameter | Environment Variable | Default | Description |
|-----------|---------|-----------|------|
| `OidcEnabled` | `OIDC_ENABLED` | `false` | Enable OIDC external IdP authentication |
| `OidcIssuerUrl` | `OIDC_ISSUER_URL` | `''` | OIDC Issuer URL |
| `OidcAudience` | `OIDC_AUDIENCE` | `''` | Expected audience (aud) claim |
| `OidcEmailClaim` | `OIDC_EMAIL_CLAIM` | `email` | JWT claim name containing the email address |

#### OAuth 2.0

For details, refer to docs/AUTH.md.

| Parameter | Environment Variable | Default | Description |
|-----------|---------|-----------|------|
| `OAuthEnabled` | `OAUTH_ENABLED` | `true` | Enable OAuth 2.0 Client Credentials Flow |
| `OAuthTokenExpiresIn` | `OAUTH_TOKEN_EXPIRES_IN` | `3600` | OAuth token expiration (seconds) |

#### Rate limits and quotas

| Parameter | Environment Variable | Default | Description |
|-----------|---------|-----------|------|
| `RateLimitEnabled` | `RATE_LIMIT_ENABLED` | `true` | Enable API rate limiting |
| `QuotaAlertWebhookUrl` | `QUOTA_ALERT_WEBHOOK_URL` | `''` | Webhook URL for quota violation notifications |

#### Batch and tile limits

| Parameter | Environment Variable | Default | Description |
|-----------|---------|-----------|------|
| `MaxBatchSize` | `MAX_BATCH_SIZE` | `100` | Maximum number of entities for batch operations (1 to 10000) |
| `MaxEntitiesPerRequest` | `MAX_ENTITIES_PER_REQUEST` | `1000` | Maximum number of entities per request (tile clustering threshold) |

#### Temporal

| Parameter | Environment Variable | Default | Description |
|-----------|---------|-----------|------|
| `TemporalDataRetentionDays` | `TEMPORAL_DATA_RETENTION_DAYS` | `0` | Time-series data retention period in days (0 = unlimited) |

#### Event streaming

For details, refer to [docs/EVENT_STREAMING.md](../features/subscriptions.md).

| Parameter | Environment Variable | Default | Description |
|-----------|---------|-----------|------|
| `EventStreamingEnabled` | `EVENT_STREAMING_ENABLED` | `false` | Enable WebSocket event streaming |

#### OpenTelemetry

For details, refer to docs/INTEGRATIONS.md.

| Parameter | Environment Variable | Default | Description |
|-----------|---------|-----------|------|
| `OtelEnabled` | `OTEL_ENABLED` | `false` | Enable OpenTelemetry distributed tracing |
| `OtelServiceName` | `OTEL_SERVICE_NAME` | `geonicdb` | Service name |
| `OtelExporterOtlpEndpoint` | `OTEL_EXPORTER_OTLP_ENDPOINT` | `''` | OTLP exporter endpoint |
| `OtelTracesSampler` | `OTEL_TRACES_SAMPLER` | `always_on` | Sampler (`always_on` / `always_off` / `traceidratio`) |
| `OtelTracesSamplerArg` | `OTEL_TRACES_SAMPLER_ARG` | `1.0` | Sampler argument (ratio for `traceidratio`) |

#### Automatically configured environment variables

The following environment variables are automatically set from resource references within the stack and do not need to be specified manually:

| Environment Variable | Source | Description |
|---------|--------|------|
| `EVENT_BUS_NAME` | `ContextBrokerEventBus` | EventBridge event bus name |
| `NOTIFICATION_QUEUE_URL` | `NotificationQueue` | SQS FIFO queue URL |
| `RATE_LIMIT_TABLE_NAME` | `RateLimitBucketsTable` | Rate limit DynamoDB table name |
| `USAGE_STATS_TABLE_NAME` | `UsageStatisticsTable` | Usage statistics DynamoDB table name |
| `TOKEN_INVALIDATION_TABLE_NAME` | `TokenInvalidationTable` | Token invalidation DynamoDB table name |
| `WS_CONNECTIONS_TABLE` | `WsConnectionsTable` | WebSocket connections DynamoDB table name (conditional) |
| `WS_API_ENDPOINT` | `WsApi` | WebSocket API endpoint (conditional) |

### Stack outputs

Output values available after deployment is complete:

| Output | Description | Example value |
|--------|------|--------|
| `ApiEndpoint` | REST API endpoint URL | `https://<id>.execute-api.<region>.amazonaws.com/<env>` |
| `EventBusName` | EventBridge event bus name | `geonicdb-dev-events` |
| `WebSocketEndpoint` | WebSocket endpoint (only when `EventStreamingEnabled=true`) | `wss://<id>.execute-api.<region>.amazonaws.com/<env>` |

```bash
# Get all outputs
aws cloudformation describe-stacks \
  --stack-name geonicdb-dev \
  --query "Stacks[0].Outputs" \
  --output table
```

## Multi-Region HA (High Availability)

GeonicDB supports multi-region HA with Active-Passive architecture.

- **Primary**: ap-northeast-1 (Tokyo)
- **Secondary**: ap-northeast-3 (Osaka)
- **Architecture**: Active-Passive (due to SQS FIFO cross-region constraints)
- **Targets**: RPO < 1 min, RTO < 5 min, 99.99% availability

### Architecture Overview

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

**Primary region**: All features enabled (CRUD, subscriptions, notifications, Change Stream)

**Secondary region**: The following are automatically disabled:
- Change Stream processor
- Subscription matcher / notification sender
- SQS notification queue

### Required Service Plans

Multi-region HA requires higher-tier service plans compared to single-region deployment.

#### MongoDB Atlas

| Requirement | Minimum Plan | Notes |
|-------------|-------------|-------|
| Multi-region cluster | **M10+** (Dedicated) | M0/M2/M5 (Shared) do not support multi-region replication |
| Cross-region read replicas | **M10+** | Required for Secondary region read access |
| Change Streams | **M10+** (Dedicated) | Required for subscriptions. Change Streams work on replica sets with WiredTiger storage engine; Serverless instances do not support them. Atlas App Services limits: M10/M20 max 100, M30/M40 max 1000 concurrent streams |

> **Note**: For production workloads, M30+ is recommended. See also the [FAQ](../faq.md) for sizing guidelines by entity count. If zone-based sharding (Global Cluster) is needed for latency-based routing, refer to the [Atlas Global Clusters documentation](https://www.mongodb.com/docs/atlas/global-clusters/) for current tier requirements.

The MongoDB Atlas connection string is the same for both regions — Atlas handles replica routing internally. The Secondary region uses `readPreference: primaryPreferred` by default, which can be changed via the `MONGODB_READ_PREFERENCE` environment variable.

#### DynamoDB

| Requirement | Billing Mode | Notes |
|-------------|-------------|-------|
| Global Tables (V2) | **PAY_PER_REQUEST** (on-demand) | Used for cross-region replication of 3 tables |
| Point-in-Time Recovery | Included | Enabled on all GlobalTable replicas |

**3 tables configured as GlobalTables** (replicated across Primary and Secondary):

| Table (Physical Name) | CloudFormation Logical Name | Billing Mode | GlobalTable |
|-----------------------|---------------------------|:------------:|:-----------:|
| `geonicdb-deployments` | `DeploymentsTable` | PAY_PER_REQUEST | Yes |
| `{stack}-token-invalidations` | `TokenInvalidationTable` | PAY_PER_REQUEST | Yes |
| `{stack}-usage-statistics` | `UsageStatisticsTable` | PAY_PER_REQUEST | Yes |
| `{stack}-rate-limit-buckets` | `RateLimitBucketsTable` | PAY_PER_REQUEST | No (region-local) |
| `{stack}-ws-connections` | `WsConnectionsTable` | PAY_PER_REQUEST | No (region-local) |

> **Note**: DynamoDB Global Tables support both `PAY_PER_REQUEST` (on-demand) and `PROVISIONED` billing modes (default is `PROVISIONED`). GeonicDB's templates use `PAY_PER_REQUEST` as a design choice to simplify operations and avoid capacity planning. Cross-region replication costs apply — writes are billed as replicated write request units (rWRUs) per replica.

### HA-Related Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REGION_ROLE` | Region role (`primary` / `secondary`) | `primary` |
| `PRIMARY_REGION` | Primary AWS region | `ap-northeast-1` |
| `SECONDARY_REGION` | Secondary AWS region | `ap-northeast-3` |
| `JWT_SECRET_ARN` | Secrets Manager ARN for JWT secret | (empty) |
| `MONGODB_URI_ARN` | Secrets Manager ARN for MongoDB URI | (empty) |
| `HEALTH_CHECK_DYNAMODB` | Enable DynamoDB health check | `false` |
| `HEALTH_CHECK_EVENTBRIDGE` | Enable EventBridge health check | `false` |
| `MONGODB_READ_PREFERENCE` | MongoDB read preference | `primaryPreferred` |
| `MONGODB_WRITE_CONCERN` | MongoDB write concern level | `majority` |
| `MONGODB_READ_CONCERN` | MongoDB read concern level | `majority` |
| `MONGODB_RETRY_WRITES` | MongoDB retry writes | `true` |

### SAM Templates

Multi-region deployment uses two templates:

| Template | Scope | Description |
|----------|-------|-------------|
| `infrastructure/template.yaml` | Regional | Main stack (deployed to both Primary and Secondary) |
| `infrastructure/template-route53.yaml` | Global | Route 53 failover (deployed only once) |

### Multi-Region HA Deployment Steps

#### Step 1: Register Secrets in Secrets Manager

Create secrets in Secrets Manager. Since Secrets Manager is a regional service, secrets must be created in each region.

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

> **Note**: The MongoDB Atlas connection string is identical for both regions (Atlas handles region routing). Use the same JWT secret value for both regions.

#### Step 2: Deploy to the Primary Region

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

The Primary deployment automatically creates:
- Lambda functions (API, Change Stream processor, subscription matcher, etc.)
- 3 DynamoDB GlobalTables (Deployments, TokenInvalidation, UsageStatistics)
  - Replicas in the Secondary region are created automatically
- SQS notification queue + DLQ
- EventBridge event bus
- WAF WebACL (AWS Managed Rules + IP rate limiting at 2000 req/5min)

#### Step 3: Deploy to the Secondary Region

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

The Secondary deployment **automatically disables** the following (controlled by `IsPrimaryCondition`):
- Subscription matcher / notification sender Lambda
- SQS notification queue / DLQ
- Change Stream processor schedule trigger
- DynamoDB tables (already replicated from Primary via GlobalTable)

#### Step 4: Configure Route 53 Failover

Route 53 is a global resource, so deploy it once using a separate template.

```bash
sam deploy \
  --region ap-northeast-1 \
  --stack-name geonicdb-route53 \
  --template-file infrastructure/template-route53.yaml \
  --parameter-overrides \
    DomainName=api.example.com \
    HostedZoneId=Z1234567890ABC \
    PrimaryEndpoint=xxx.execute-api.ap-northeast-1.amazonaws.com \
    SecondaryEndpoint=yyy.execute-api.ap-northeast-3.amazonaws.com \
    FailoverNotificationEmail=ops-team@example.com \
  --capabilities CAPABILITY_IAM
```

This template creates:
- Route 53 Health Check (monitors Primary `/health/ready` every 10 seconds, marks unhealthy after 3 consecutive failures)
- Route 53 Failover Record (PRIMARY/SECONDARY CNAME records)
- CloudWatch Alarm (Health Check status monitoring)
- SNS Topic (failover notification email)

#### Step 5: Post-Deployment Verification

```bash
# Primary health check
curl https://xxx.execute-api.ap-northeast-1.amazonaws.com/health/ready
# Expected: {"status":"healthy","region":"ap-northeast-1","regionRole":"primary","checks":{"mongodb":{"status":"healthy",...},...},...}

# Secondary health check
curl https://yyy.execute-api.ap-northeast-3.amazonaws.com/health/ready
# Expected: {"status":"healthy","region":"ap-northeast-3","regionRole":"secondary",...}

# Route 53 failover DNS verification
dig api.example.com CNAME
# Expected: CNAME to Primary endpoint

# Route 53 Health Check status
aws route53 get-health-check-status \
  --health-check-id <health-check-id>
```

### Failover Behavior

When Route 53 Health Check detects 3 consecutive failures of Primary's `/health/ready`:

1. **Automatic failover**: Route 53 switches DNS to the Secondary endpoint (RTO < 5 min)
2. **Notification**: CloudWatch Alarm → SNS → email notification to administrators
3. **Failover recording**: Failover Lambda records state in DynamoDB

When Primary recovers:
1. Route 53 Health Check detects healthy status
2. DNS automatically switches back to Primary
3. Recovery notification via SNS

### DynamoDB GlobalTable

The following 3 tables are automatically replicated across regions:

| Table | Purpose | Reason for GlobalTable |
|-------|---------|------------------------|
| `DeploymentsTable` | Tenant configuration | Tenant information required during failover |
| `TokenInvalidationTable` | Token invalidation list | Security requirement (invalidation must be reflected in both regions) |
| `UsageStatisticsTable` | API usage statistics | Provides a consolidated view |

The following tables are region-local (**not** GlobalTable):

| Table | Reason |
|-------|--------|
| `RateLimitBucketsTable` | Rate limiting is calculated per region |
| `WsConnectionsTable` | WebSocket connections are region-specific |

### WAF Configuration

WAF WebACL is applied to the API Gateway in each region:

| Rule | Description |
|------|-------------|
| AWS-AWSManagedRulesCommonRuleSet | Protection against common attacks such as SQLi and XSS |
| AWS-AWSManagedRulesSQLiRuleSet | SQL injection protection |
| RateLimit (2000 req / 5min per IP) | Per-IP rate limiting |

### Local Testing of Secondary Region

```bash
REGION_ROLE=secondary npm start
```

In secondary mode, the Change Stream processor is skipped at startup (visible in log output).

## Deployment Management (Hostname-Based Multi-Database)

GeonicDB supports multi-deployment functionality that connects to different MongoDB databases based on hostname (#396).

### How It Works

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

### DeploymentConfig Schema

Item structure of the DynamoDB `geonicdb-deployments` table:

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `hostname` | String | ✅ | Partition key. Matched against the request's Host header |
| `mongodbUri` | String | ✅ | MongoDB Atlas connection string |
| `databaseName` | String | ✅ | Database name to use |
| `defaultQuotaPlan` | String | ✅ | Quota plan (`FREE` / `STANDARD` / `PREMIUM` / `ENTERPRISE` / `CUSTOM`) |
| `enabled` | Boolean | ✅ | Falls back to default DB when `false` |
| `rateLimitTableName` | String | - | Deployment-specific rate limit table name |
| `createdAt` | Number | ✅ | Creation timestamp (UNIX milliseconds) |
| `updatedAt` | Number | ✅ | Update timestamp (UNIX milliseconds) |
| `metadata` | Map | - | Arbitrary additional metadata |

### Adding and Managing Deployments

Currently (Phase 0), deployment configurations are managed directly via the AWS CLI or DynamoDB console.

#### Adding a Deployment via AWS CLI

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

#### Disabling a Deployment

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

#### Listing All Deployments

```bash
aws dynamodb scan \
  --table-name geonicdb-deployments \
  --projection-expression "hostname, databaseName, defaultQuotaPlan, enabled" \
  --output table
```

### Fault Tolerance

| Scenario | Behavior |
|----------|----------|
| Hostname not registered in DynamoDB | `null` fallback → continues processing with default DB |
| Deployment has `enabled: false` | Treated the same as unregistered |
| DynamoDB connection failure | Error logged + `null` fallback (requests are not blocked) |
| Cache expired | DynamoDB is re-queried on the next request |
| Continuous requests with unknown hostname | Negative cache (`null` is cached to reduce DynamoDB load) |

### Configuration Change Propagation

Deployment configuration changes take effect after the cache TTL (default 5 minutes) expires. For immediate effect, redeploy the Lambda function.

```bash
# Cache TTL setting (src/config/defaults.ts)
DEPLOYMENTS.CACHE_TTL_MS = 300000  # 5 min
```

### HA Integration

The `geonicdb-deployments` table is configured as a DynamoDB GlobalTable and is automatically replicated across both Primary and Secondary regions. Deployment configuration is immediately available during failover.

## Path Aliases

Path aliases are used in TypeScript:

```typescript
import { EntityService } from '@core/entities/entity.service';
import { NotFoundError } from '@api/shared/errors';
import { handler } from '@handlers/api';
import { getDatabase } from '@infrastructure/mongodb';
```
