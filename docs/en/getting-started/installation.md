---
title: "Developer Guide"
description: "Development environment setup and installation"
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

Create an `.env` file:

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

#### Enable authentication and authorization (optional)

To enable authentication features, add the following environment variables:

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

#### Enable CADDE integration (optional)

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

Sensitive information (MongoDB credentials, JWT secrets, admin passwords) is stored in the **`geonic-ops`** 1Password Vault and injected at runtime via the 1Password CLI. The `.env.op` file (committed to the repository) contains only `op://` URI references, not actual values.

#### Install 1Password CLI

```bash
# macOS
brew install 1password-cli

# Other platforms: https://developer.1password.com/docs/cli/get-started
```

Verify: `op --version`
#### Add secrets to 1Password

Create an item named **`geonicdb-dev`** in the **`geonic-ops`** Vault with the following fields:

| Field | Description |
|-------|-------------|
| `MONGODB_URI` | Full MongoDB connection string including credentials |
| `JWT_SECRET` | Random string, 32 characters or more |
| `SUPER_ADMIN_EMAIL` | Super admin email address for local development |
| `SUPER_ADMIN_PASSWORD` | Super admin password for local development |

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

#### Inject secrets and start development server

```bash
npm run dev:op
# equivalent to: op run --env-file=.env.op -- npm start
```

Non-sensitive variables (`ENVIRONMENT`, `AWS_REGION`, `LOG_LEVEL`, etc.) are loaded from the local `.env` file as usual.

> **Note:** `.env.op` is safe to commit. `.env` and `.env.local` are gitignored and should never be committed. When using `npm run dev:op`, do not define `.env`, `MONGODB_URI`, `JWT_SECRET`, `SUPER_ADMIN_EMAIL`, or `SUPER_ADMIN_PASSWORD` in `.env`, as these are injected by 1Password. Having actual values in both places can cause confusion.

### 5. Build

```bash
npm run build
```

## Development Commands

| Command | Description |
|---------|------|
| `npm start` | Start local development server (using in-memory MongoDB) |
| `npm run dev:op` | Inject secrets from 1Password (`geonic-ops` Vault) and start development server |
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

HTML report is available at `coverage/lcov-report/index.html`.

## Integrated Application Development (using as an npm package)

You can install GeonicDB as an npm package and integrate it with your application's development server.

### Installation

```bash
# Install directly from GitHub repository
npm install -D github:geolonia/geonicdb

# Also install peerDependencies
npm install -D express mongodb-memory-server
```

### Start via CLI (recommended)

You can start GeonicDB standalone with the `npx geonicdb` command. Using the `--proxy` option forwards requests that don't match GeonicDB's routes to your application's development server.

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

> **Note**: If URLs conflict (e.g., your application also has `/llms.txt`), GeonicDB takes precedence.

### Example application package.json configuration

You can use `concurrently` to start GeonicDB and your application's development server simultaneously. Using `--kill-others` ensures that when one process terminates, the others automatically stop:

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

Add proxy configuration on the Vite side to enable API access from either port:

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

Object returned by `createServer()`:

| Property | Type | Description |
|-----------|------|------|
| `port` | `number` | Actual port being listened on |
| `url` | `string` | Full server URL (e.g., `http://localhost:3000`) |
| `mongoUri` | `string` | MongoDB connection URI (usable for testing, etc.) |
| `close()` | `() => Promise<void>` | Stop server and MongoDB |

### Installing from private repository

For private repositories, it works as-is if your SSH key is registered on GitHub:

```bash
npm install -D github:geolonia/geonicdb
```

In CI/CD environments, you need to configure a GitHub Personal Access Token or Deploy Key. For team-wide operations, consider publishing to GitHub Packages.

## Local Development Server

### Simple server (recommended)

Using `npm start` starts a local server with in-memory MongoDB. No external MongoDB instance is required.

```bash
npm start
```

#### Specifying port

The default port is `3000`. You can change the port via CLI argument or environment variable:

```bash
# Specify via CLI argument
npm start -- --port 3001

# Specify via environment variable
PORT=3001 npm start
```

Priority: `--port` argument > `PORT` environment variable > default (3000)

If the specified port is in use, the next available port is automatically selected (searches up to 10 ports).

> **Tip**: Combined with git worktrees, you can run servers from different branches simultaneously:
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
- No environment variable configuration needed
- Specifiable port (`--port` / `PORT` environment variable)
- Automatic fallback if port is in use
- Ideal for development and testing
- Data clears when server stops (in-memory)

### Using SAM CLI

Test API locally using AWS SAM CLI:

```bash
# SAM build
npm run sam:build

# Start local server
npm run sam:local
```

API becomes available at `http://localhost:3000`.

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

### 1. Start local server

```bash
npm start
```

### 2. Configure Claude Desktop

Add the following to Claude Desktop's configuration file (`claude_desktop_config.json`).

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

> **Note**: The [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) package is used as a bridge to connect to Streamable HTTP MCP servers. It is automatically downloaded on first run.

**If authentication is enabled (`AUTH_ENABLED=true`)**, specify the Bearer token header:

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

After configuration, restart Claude Desktop.

### 3. Verify operation

When chatting with Claude Desktop as follows, the context broker's tools are automatically invoked:

- "Display entity list for tenant test"
- "Create Room entity with ID Room1 and set temperature to 23.5"
- "Search for sensors near Tokyo Station"

### 4. Verify operation with curl

To verify MCP protocol operation without using Claude Desktop:

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

For details, see [MCP documentation](../ai-integration/mcp-server.md).

## API Specification

### Pagination

List retrieval endpoints support common pagination parameters.

**Parameters:**

| Parameter | Type | Default | Max | Description |
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
| 200 | OK | Entity retrieval success, attribute update success |
| 201 | Created | Entity creation success |
| 204 | No Content | Entity deletion success, attribute deletion success |
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

GeonicDB uses AWS SAM