---
title: "CLI リファレンス"
description: "GeonicDB CLI (geonic) コマンドリファレンス"
outline: deep
---
# CLI Reference

`@geolonia/geonicdb-cli` (or `geonic` command) is the command-line interface for GeonicDB. It provides complete access to NGSI-LD entities, subscriptions, registrations, temporal data, batch operations, administrative features, and more.

- **Repository**: [geolonia/geonicdb-cli](https://github.com/geolonia/geonicdb-cli)
- **Runtime**: Node.js >= 20
- **Package**: `@geolonia/geonicdb-cli`
## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Global Options](#global-options)
- [Configuration and Profiles](#configuration-and-profiles)
  - [Configuration Files](#configuration-files)
  - [Profile Management](#profile-management)
  - [Environment Variables](#environment-variables)
  - [Option Resolution Order](#option-resolution-order)
- [Authentication](#authentication)
  - [Email / Password Login](#email--password-login)
  - [OAuth 2.0 Client Credentials](#oauth-20-client-credentials)
  - [Automatic Token Refresh](#automatic-token-refresh)
  - [Logout](#logout)
- [Input Formats](#input-formats)
- [Output Formats](#output-formats)
- [Command Reference](#command-reference)
  - [entities](#entities)
  - [entities attrs](#entities-attrs)
  - [entityOperations (batch)](#entityoperations-batch)
  - [subscriptions (sub)](#subscriptions-sub)
  - [registrations (reg)](#registrations-reg)
  - [types](#types)
  - [temporal](#temporal)
  - [snapshots](#snapshots)
  - [rules](#rules)
  - [custom-data-models (models)](#custom-data-models-models)
  - [catalog](#catalog)
  - [admin](#admin)
  - [health](#health)
  - [version](#version)
  - [me](#me)
  - [help](#help)
- [Shell Completion](#shell-completion)

---

## Installation

```bash
npm install -g @geolonia/geonicdb-cli
```

## Quick Start

```bash
# Configure the server URL
geonic config set url https://your-geonicdb-server.example.com

# Login
geonic auth login

# Create an entity
geonic entities create '{
  "id": "urn:ngsi-ld:Room:001",
  "type": "Room",
  "temperature": { "type": "Property", "value": 23.5 }
}'

# List entities
geonic entities list --type Room

# Get an entity
geonic entities get urn:ngsi-ld:Room:001
```

---

## Global Options

Available for all commands. See [Option Resolution Order](#option-resolution-order) for priority rules.

| Option | Description |
|--------|-------------|
| `-u, --url <url>` | Base URL of GeonicDB server |
| `-s, --service <name>` | Tenant name (`NGSILD-Tenant` header) |
| `--token <token>` | Authentication token |
| `-p, --profile <name>` | Named profile to use |
| `--api-key <key>` | API key authentication |
| `-f, --format <fmt>` | Output format: `json`, `table`, `geojson` |
| `--no-color` | Disable color output |
| `-v, --verbose` | Display HTTP request/response details to stderr (sensitive values masked) |

---

## Configuration and Profiles

### Configuration Files

The CLI stores configuration in `~/.config/geonic/config.json`. You can override the directory with the `GEONIC_CONFIG_DIR` environment variable.

```json
{
  "version": 2,
  "currentProfile": "default",
  "profiles": {
    "default": {
      "url": "http://localhost:3000",
      "format": "json"
    },
    "production": {
      "url": "https://geonicdb.example.com",
      "service": "my-tenant"
    }
  }
}
```

**Configuration Keys**: `url`, `service`, `token`, `refreshToken`, `format`, `apiKey`
#### `geonic config set <key> <value>`Save configuration values. Sensitive values (`token`, `refreshToken`, `apiKey`) are masked when displayed.

#### `geonic config get <key>`Retrieve configuration values.

#### `geonic config list`Display all configuration values for the current profile.

#### `geonic config delete <key>`Delete configuration values.

### Profile Management

Manage multiple connection profiles (e.g., production, staging, development). The default profile is named `default` and cannot be deleted.

#### `geonic profile list`List all profiles. Active profile is marked with `*`.

#### `geonic profile use <name>`Switch the active profile.

#### `geonic profile create <name>`Create a new empty profile.

#### `geonic profile delete <name>`Delete a profile. The `default` profile cannot be deleted.

#### `geonic profile show [name]`Display profile configuration. Shows the active profile by default. Sensitive values are masked.

### Environment Variables

| Variable | Description |
|----------|-------------|
| `GDB_EMAIL` | Email address for login |
| `GDB_PASSWORD` | Password for login |
| `GDB_OAUTH_CLIENT_ID` | Client ID for OAuth Client Credentials |
| `GDB_OAUTH_CLIENT_SECRET` | Client secret for OAuth Client Credentials |
| `GDB_API_KEY` | API key (equivalent to `--api-key`) |
| `GEONIC_CONFIG_DIR` | Override configuration directory path |

### Option Resolution Order

Values are resolved in the following order (highest priority first):

1. CLI flags (`--url`, `--token`, etc.)
2. Configuration file (profile settings)
3. Default values

---

## Authentication

### Email / Password Login

```bash
geonic auth login
```

When run in a terminal, the CLI will interactively prompt for email and password. For non-interactive environments, set the `GDB_EMAIL` and `GDB_PASSWORD` environment variables.

The CLI calls `POST /auth/login` and saves the received `accessToken` and `refreshToken` to the configuration file.

### OAuth 2.0 Client Credentials

```bash
geonic auth login --client-credentials \
  --client-id <id> \
  --client-secret <secret> \
  --scope "read write"
```

Uses the OAuth 2.0 Client Credentials flow (`POST /oauth/token`). Client ID and secret can also be set via the `GDB_OAUTH_CLIENT_ID` and `GDB_OAUTH_CLIENT_SECRET` environment variables.

| Option | Description |
|--------|-------------|
| `--client-credentials` | Use Client Credentials flow |
| `--client-id <id>` | OAuth client ID |
| `--client-secret <secret>` | OAuth client secret |
| `--scope <scopes>` | OAuth scopes (space-separated) |
| `--tenant-id <id>` | Tenant ID for scoped authentication |

### Automatic Token Refresh

If a request returns 401 Unauthorized and `refreshToken` is available, the CLI automatically refreshes the token via `POST /auth/refresh` and retries the request.

### Logout

```bash
geonic auth logout
```

Clears saved tokens and sends a best-effort logout notification to the server.

---

## Input Formats

Commands accepting `[json]` arguments support multiple input methods. The CLI auto-detects the source:

### Inline JSON / JSON5

```bash
geonic entities create '{"id": "urn:ngsi-ld:Room:001", "type": "Room"}'
```

JSON5 is supported: unquoted keys, single quotes, trailing commas, comments.

```bash
geonic entities create '{id: "urn:ngsi-ld:Room:001", type: "Room",}'
```

### File Input (`@` prefix)

```bash
geonic entities create @entity.json
```

### Standard Input (pipe)

```bash
cat entity.json | geonic entities create
```

### Interactive Mode

If the CLI is connected to a terminal and no JSON argument is provided, an interactive `json>` prompt opens. Input is automatically submitted when brackets are balanced.

---

## Output Formats

Set with `--format` or `geonic config set format <fmt>`.

| Format | Description |
|--------|-------------|
| `json` (default) | Pretty-printed JSON |
| `table` | ASCII table (arrays as columns, objects as key-value pairs) |
| `geojson` | GeoJSON FeatureCollection (converts `location` attributes to geometries) |

When `--count` is used, the `NGSILD-Results-Count` response header is displayed as `Count: N`.

---

## Command Reference

### `entities`Manage NGSI-LD context entities (`/ngsi-ld/v1/entities`).

#### `geonic entities list`List entities with optional filters.

| Option | Description |
|--------|-------------|
| `--type <type>` | Filter by entity type |
| `--id-pattern <pat>` | Filter by entity ID pattern (regex) |
| `--query <q>` | NGSI query expression (e.g., `temperature>30`) |
| `--attrs <a,b>` | Comma-separated list of attributes to return |
| `--georel <rel>` | Geo-relation (e.g., `near;maxDistance==1000`) |
| `--geometry <geo>` | Geometry type (e.g., `Point`, `Polygon`) |
| `--coords <coords>` | Coordinates for geo-query |
| `--spatial-id <zfxy>` | Spatial ID filter (ZFXY tile format, e.g., `15/0/29101/12903`) |
| `--limit <n>` | Maximum number of results |
| `--offset <n>` | Number of results to skip |
| `--order-by <field>` | Sort field |
| `--count` | Include total count in response |
| `--key-values` | Return in simplified key-value format |

```bash
# List all Room entities
geonic entities list --type Room

# Geo-query: entities near a point
geonic entities list --georel "near;maxDistance==1000" --geometry Point --coords "35.68,139.76"

# Query expression with pagination
geonic entities list --query "temperature>25" --limit 10 --offset 0 --count
```

#### `geonic entities get <id>`Get a single entity by ID.

| Option | Description |
|--------|-------------|
| `--key-values` | Return in simplified key-value format |

#### `geonic entities create [json]`Create a new entity.

```bash
geonic entities create '{
  "id": "urn:ngsi-ld:Room:001",
  "type": "Room",
  "temperature": { "type": "Property", "value": 23.5 },
  "location": {
    "type": "GeoProperty",
    "value": { "type": "Point", "coordinates": [139.76, 35.68] }
  }
}'
```

#### `geonic entities update <id> [json]`Partially update entity attributes (`PATCH /entities/{id}/attrs`).

```bash
geonic entities update urn:ngsi-ld:Room:001 '{"temperature": {"type": "Property", "value": 25.0}}'
```

#### `geonic entities replace <id> [json]`Replace all entity attributes (`PUT /entities/{id}/attrs`).

#### `geonic entities upsert [json]`Create or update entity (`POST /entityOperations/upsert`).

#### `geonic entities delete <id>`Delete entity.

---

### `entities attrs`Manage individual attributes of entities.

| Command | Description |
|---------|-------------|
| `geonic entities attrs list <entityId>` | List all attributes |
| `geonic entities attrs get <entityId> <attrName>` | Get specific attribute |
| `geonic entities attrs add <entityId> [json]` | Add attribute |
| `geonic entities attrs update <entityId> <attrName> [json]` | Update specific attribute |
| `geonic entities attrs delete <entityId> <attrName>` | Delete specific attribute |

```bash
# Get the temperature attribute
geonic entities attrs get urn:ngsi-ld:Room:001 temperature

# Update an attribute
geonic entities attrs update urn:ngsi-ld:Room:001 temperature '{"type": "Property", "value": 26.0}'
```

---

### `entityOperations` (batch)

Batch operations on entities (`/ngsi-ld/v1/entityOperations`). Alias: `batch`.

| Command | HTTP | Description |
|---------|------|-------------|
| `geonic batch create [json]` | POST `/entityOperations/create` | Create multiple entities |
| `geonic batch upsert [json]` | POST `/entityOperations/upsert` | Create or update multiple entities |
| `geonic batch update [json]` | POST `/entityOperations/update` | Update multiple entities |
| `geonic batch delete [json]` | POST `/entityOperations/delete` | Delete multiple entities |
| `geonic batch query [json]` | POST `/entityOperations/query` | Query entities via POST |
| `geonic batch merge [json]` | POST `/entityOperations/merge` | Merge multiple entities |

```bash
# Batch create entities from a file
geonic batch create @entities.json

# Batch upsert from stdin
cat entities.json | geonic batch upsert
```

---

### `subscriptions` (sub)

Manage context subscriptions (`/ngsi-ld/v1/subscriptions`). Alias: `sub`.

| Command | Description |
|---------|-------------|
| `geonic sub list` | List subscriptions |
| `geonic sub get <id>` | Get subscription |
| `geonic sub create [json]` | Create subscription |
| `geonic sub update <id> [json]` | Update subscription |