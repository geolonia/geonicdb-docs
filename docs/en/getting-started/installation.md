---
title: "Developer Guide"
---

# Developer Guide

## Requirements

- Node.js 20.x or higher
- npm 9.x or higher
- AWS CLI v2 (for deployment)
- AWS SAM CLI (for deployment)
- MongoDB 8.0 or higher (MongoDB Atlas or local MongoDB)

## Setup

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/vela.git
cd vela
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

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

#### Enable Authentication & Authorization (Optional)

To enable authentication features, add the following environment variables:

```bash
# Enable authentication features (true/false)
AUTH_ENABLED=true

# JWT token signing secret (32+ characters recommended)
# Always use a secure random string in production
JWT_SECRET=your-secret-key-change-in-production

# Access token expiration (e.g., 1h, 30m, 1d)
JWT_EXPIRES_IN=1h

# Refresh token expiration (e.g., 7d, 30d)
JWT_REFRESH_EXPIRES_IN=7d

# Environment-based super admin (for initial setup)
SUPER_ADMIN_EMAIL=admin@example.com
SUPER_ADMIN_PASSWORD=SuperSecretPassword123!

# Allowed IP addresses for Admin API access (comma-separated)
# Empty means access from all IPs is allowed
# Example: 192.168.1.0/24,10.0.0.0/8
ADMIN_ALLOWED_IPS=
```

#### Enable CADDE Integration (Optional)

To enable CADDE (Cross-domain Data Exchange Platform) integration:

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

### 4. Build

```bash
npm run build
```

## Development Commands

| Command | Description |
|---------|-------------|
| `npm start` | Start local development server (using in-memory MongoDB) |
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
vela/
├── src/
│   ├── api/                    # API layer
│   │   ├── ngsiv2/            # NGSIv2 API implementation
│   │   │   ├── controllers/   # Request handlers
│   │   │   ├── routes.ts      # Routing
│   │   │   └── transformers/  # Data transformation
│   │   ├── ngsild/            # NGSI-LD API implementation
│   │   └── shared/            # Shared utilities
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
│   │   ├── streams/           # Change stream processing
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

- **Unit Tests / Integration Tests**: Jest
- **E2E Tests**: Cucumber.js + Gherkin (Japanese BDD format)

### Run All Tests

```bash
npm test
```

### Run Unit Tests

```bash
# All unit tests
npm run test:unit

# Watch mode
npm run test:watch

# Specific file
npx jest tests/unit/api/ngsiv2/controllers/entities.controller.test.ts
```

### Run E2E Tests

E2E tests use Cucumber.js and are written in Gherkin format (Japanese).
Test cases are implemented based on FIWARE Orion API documentation.

```bash
# All E2E tests
npm run test:e2e

# NGSIv2 tests only
npm run test:e2e:ngsiv2

# NGSI-LD tests only
npm run test:e2e:ngsild

# Run with specific tags
npx cucumber-js --tags "@entities"
npx cucumber-js --tags "@subscriptions"
npx cucumber-js --tags "@batch"
npx cucumber-js --tags "@crs"
npx cucumber-js --tags "@tutorial"
npx cucumber-js --tags "@meta"
```

### E2E Test Feature File Structure

```text
tests/e2e/features/
├── ngsiv2/
│   ├── entities.feature            # Entity CRUD
│   ├── attribute-values.feature    # Direct attribute value get/update
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

### Gherkin Test Example

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

### Coverage Report

```bash
npm run test:coverage
```

You can view the HTML report at `coverage/lcov-report/index.html`.

## Integration Application Development (Using as npm Package)

You can install GeonicDB as an npm package and integrate it with your application's development server.

### Installation

```bash
# Install directly from GitHub repository
npm install -D github:geolonia/geonicdb

# Also install peerDependencies
npm install -D express mongodb-memory-server
```

### Start with CLI (Recommended)

Use the `npx geonicdb` command for standalone startup. The `--proxy` option forwards requests that don't match GeonicDB's routes to your application's development server.

```bash
# Basic startup
npx geonicdb

# Specify port
npx geonicdb --port 3001

# Start with proxy (integrate with Vite dev server, etc.)
npx geonicdb --port 3000 --proxy http://localhost:5173
```

Request flow when using `--proxy`:

```text
Browser → localhost:3000 (GeonicDB)
  ├── /v2/*, /ngsi-ld/*, /llms.txt, etc. → Handled by GeonicDB
  └── Other (HTML, JS, CSS, etc.)        → Proxied to app dev server
```

> **Note**: If URLs overlap (e.g., your app also has `/llms.txt`), GeonicDB takes priority.

### Application package.json Configuration Example

Use `concurrently` to start GeonicDB and your app's development server simultaneously. The `--kill-others` flag automatically stops both when either process terminates:

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

Add proxy settings to Vite as well to access the API from either port:

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

#### GeonicDBServer Object

Object returned by `createServer()`:

| Property | Type | Description |
|----------|------|-------------|
| `port` | `number` | Actual listening port |
| `url` | `string` | Full server URL (e.g., `http://localhost:3000`) |
| `mongoUri` | `string` | MongoDB connection URI (can be used for testing) |
| `close()` | `() => Promise<void>` | Stop server and MongoDB |

### Installing from Private Repository

For private repositories, it works as-is if your SSH key is registered on GitHub:

```bash
npm install -D github:geolonia/geonicdb
```

In CI/CD environments, you'll need to configure GitHub Personal Access Token or Deploy Key. For production team use, consider publishing to GitHub Packages.

## Local Development Server

### Simple Server (Recommended)

Use `npm start` to launch a local server with in-memory MongoDB. No external MongoDB instance required.

```bash
npm start
```

#### Port Configuration

The default port is `3000`. You can change it via CLI argument or environment variable:

```bash
# Specify via CLI argument
npm start -- --port 3001

# Specify via environment variable
PORT=3001 npm start
```

Priority: `--port` argument > `PORT` environment variable > Default (3000)

If the specified port is in use, the next available port is automatically selected (up to 10 ports explored).

> **Tip**: Combined with git worktree, you can run servers for different branches simultaneously:
> ```bash
> # Start in main worktree
> npm start                    # → localhost:3000
>
> # Start in another worktree
> cd .worktrees/vela-feature
> npm start -- --port 3001     # → localhost:3001
> ```

Press `Ctrl+C` to stop the server. MongoDB is automatically stopped as well.

**Features:**
- No external MongoDB required (mongodb-memory-server auto-starts)
- No environment variable configuration needed
- Port specification available (`--port` / `PORT` environment variable)
- Automatic fallback if port is in use
- Ideal for development and testing
- Data is cleared when server stops (in-memory)

### Using SAM CLI

Test the API locally using AWS SAM CLI:

```bash
# SAM build
npm run sam:build

# Start local server
npm run sam:local
```

The API will be available at `http://localhost:3000`.

### Test Request Examples

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