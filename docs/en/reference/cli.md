---
title: "CLI Reference"
description: "GeonicDB CLI (geonic) command reference"
outline: deep
---
# CLI Reference

`@geolonia/geonicdb-cli` (`geonic` command) is a command-line interface for GeonicDB. It provides full access to NGSI-LD entities, subscriptions, registrations, temporal data, batch operations, admin management, and more.

- **Repository**: [geolonia/geonicdb-cli](https://github.com/geolonia/geonicdb-cli)
- **Runtime**: Node.js >= 20
- **Package**: `@geolonia/geonicdb-cli`

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Global Options](#global-options)
- [Configuration & Profiles](#configuration--profiles)
  - [Configuration File](#configuration-file)
  - [Profile Management](#profile-management)
  - [Environment Variables](#environment-variables)
  - [Option Resolution Order](#option-resolution-order)
- [Authentication](#authentication)
  - [Email / Password Login](#email--password-login)
  - [OAuth 2.0 Client Credentials](#oauth-20-client-credentials)
  - [Token Auto-Refresh](#token-auto-refresh)
  - [Logout](#logout)
- [Input Format](#input-format)
- [Output Format](#output-format)
- [Dry Run](#dry-run)
- [Update Notifier](#update-notifier)
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
    - [admin tenants](#admin-tenants)
    - [admin users](#admin-users)
    - [admin policies](#admin-policies)
    - [admin oauth-clients](#admin-oauth-clients)
    - [admin api-keys](#admin-api-keys)
    - [admin cadde](#admin-cadde)
  - [health](#health)
  - [version](#version)
  - [me](#me)
    - [me oauth-clients](#me-oauth-clients)
    - [me api-keys](#me-api-keys)
  - [help](#help)
- [Shell Completion](#shell-completion)

---

## Installation

```bash
npm install -g @geolonia/geonicdb-cli
```

Or run directly with npx:

```bash
npx @geolonia/geonicdb-cli <command>
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

Available on all commands. See [Option Resolution Order](#option-resolution-order) for precedence rules.

| Option | Description |
|--------|-------------|
| `-u, --url <url>` | GeonicDB server base URL |
| `-s, --service <name>` | Tenant name (`NGSILD-Tenant` header) |
| `--token <token>` | Authentication token |
| `-p, --profile <name>` | Named profile to use |
| `--api-key <key>` | API key authentication |
| `-f, --format <fmt>` | Output format: `json`, `table`, `geojson` |
| `--no-color` | Disable colored output |
| `-v, --verbose` | Show HTTP request/response details on stderr (sensitive values are masked) |
| `--dry-run` | Print the equivalent `curl` command without executing the request |

---

## Configuration & Profiles

### Configuration File

The CLI stores settings in `~/.config/geonic/config.json`. Override the directory with the `GEONIC_CONFIG_DIR` environment variable.

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

**Configuration keys**: `url`, `service`, `token`, `refreshToken`, `format`, `apiKey`, `clientId`, `clientSecret`

#### `geonic config set <key> <value>`

Save a configuration value. Sensitive values (`token`, `refreshToken`, `apiKey`, `clientId`, `clientSecret`) are masked in output.

#### `geonic config get <key>`

Retrieve a configuration value.

#### `geonic config list`

Display all configuration values for the current profile.

#### `geonic config delete <key>`

Remove a configuration value.

### Profile Management

Manage multiple connection profiles (e.g., production, staging, development). The default profile is named `default` and cannot be deleted.

#### `geonic profile list`

List all profiles. The active profile is marked with `*`.

#### `geonic profile use <name>`

Switch the active profile.

#### `geonic profile create <name>`

Create a new empty profile.

#### `geonic profile delete <name>`

Delete a profile. The `default` profile cannot be deleted.

#### `geonic profile show [name]`

Show profile settings. Defaults to the active profile. Sensitive values are masked.

### Environment Variables

| Variable | Description |
|----------|-------------|
| `GDB_EMAIL` | Email address for login |
| `GDB_PASSWORD` | Password for login |
| `GDB_OAUTH_CLIENT_ID` | OAuth Client Credentials client ID |
| `GDB_OAUTH_CLIENT_SECRET` | OAuth Client Credentials client secret |
| `GDB_API_KEY` | API key (equivalent to `--api-key`) |
| `GEONIC_CONFIG_DIR` | Override config directory path |
| `NO_UPDATE_NOTIFIER` | Disable the update notifier |

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

When running in a terminal, the CLI prompts for email and password interactively. In non-interactive environments, set `GDB_EMAIL` and `GDB_PASSWORD` environment variables.

The CLI calls `POST /auth/login` and stores the received `accessToken` and `refreshToken` in the configuration file.

### OAuth 2.0 Client Credentials

```bash
geonic auth login --client-credentials \
  --client-id <id> \
  --client-secret <secret> \
  --scope "read write"
```

Uses the OAuth 2.0 Client Credentials flow (`POST /oauth/token`). Client ID and secret can also be set via `GDB_OAUTH_CLIENT_ID` and `GDB_OAUTH_CLIENT_SECRET` environment variables.

| Option | Description |
|--------|-------------|
| `--client-credentials` | Use Client Credentials flow |
| `--client-id <id>` | OAuth client ID |
| `--client-secret <secret>` | OAuth client secret |
| `--scope <scopes>` | OAuth scopes (space-separated) |
| `--tenant-id <id>` | Tenant ID for scoped authentication |

### Token Auto-Refresh

When a request returns 401 Unauthorized and a `refreshToken` is available, the CLI automatically refreshes the token via `POST /auth/refresh` and retries the request.

When `clientId` and `clientSecret` are saved in the config (e.g., via `geonic me oauth-clients create --save`), the CLI automatically re-authenticates using the Client Credentials flow when the token expires.

### Logout

```bash
geonic auth logout
```

Clears stored tokens and sends a best-effort logout notification to the server.

---

## Input Format

Commands that accept a `[json]` argument support multiple input methods. The CLI auto-detects the source:

### Inline JSON / JSON5

```bash
geonic entities create '{"id": "urn:ngsi-ld:Room:001", "type": "Room"}'
```

JSON5 is supported: unquoted keys, single quotes, trailing commas, and comments.

```bash
geonic entities create '{id: "urn:ngsi-ld:Room:001", type: "Room",}'
```

### File Input (`@` prefix)

```bash
geonic entities create @entity.json
```

### Stdin (pipe)

```bash
cat entity.json | geonic entities create
```

The explicit `-` marker is also supported for backward compatibility:

```bash
cat entity.json | geonic entities create -
```

### Interactive Mode

When the CLI is connected to a terminal and no JSON argument is provided, an interactive `json>` prompt opens. Input auto-submits when brackets are balanced.

---

## Output Format

Set with `--format` or `geonic config set format <fmt>`.

| Format | Description |
|--------|-------------|
| `json` (default) | Pretty-printed JSON |
| `table` | ASCII table (arrays as columns, objects as key-value pairs) |
| `geojson` | GeoJSON FeatureCollection (converts `location` attribute to geometry) |

When `--count` is used, the `NGSILD-Results-Count` response header is displayed as `Count: N`.

---

## Dry Run

Use `--dry-run` on any command to print the equivalent `curl` command instead of executing the request. The output can be copied and run directly in a terminal.

```bash
$ geonic entities list --type Sensor --dry-run
curl \
  -H 'Content-Type: application/ld+json' \
  -H 'Accept: application/ld+json' \
  -H 'Authorization: Bearer <token>' \
  'http://localhost:3000/ngsi-ld/v1/entities?type=Sensor'
```

Works with all operations including POST with body:

```bash
$ geonic entities create '{"id":"Room1","type":"Room"}' --dry-run
curl \
  -X POST \
  -H 'Content-Type: application/ld+json' \
  -H 'Accept: application/ld+json' \
  -d '{"id":"Room1","type":"Room"}' \
  'http://localhost:3000/ngsi-ld/v1/entities'
```

---

## Update Notifier

The CLI checks for new versions once every 24 hours and displays a notification box when an update is available. The check is skipped in CI environments and non-TTY terminals. Disable it by setting `NO_UPDATE_NOTIFIER=1`.

---

## Command Reference

### `entities`

Manage NGSI-LD context entities (`/ngsi-ld/v1/entities`).

#### `geonic entities list`

List entities with optional filters.

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
| `--count-only` | Only show the total count without listing entities |
| `--key-values` | Return simplified key-value format |

```bash
# List all Room entities
geonic entities list --type Room

# Geo-query: entities near a point
geonic entities list --georel "near;maxDistance==1000" --geometry Point --coords "[139.7671,35.6812]"

# Query expression with pagination
geonic entities list --query "temperature>25" --limit 10 --offset 0 --count

# Get only the total count (no entity data)
geonic entities list --type Sensor --count-only
```

#### `geonic entities get <id>`

Retrieve a single entity by ID.

| Option | Description |
|--------|-------------|
| `--key-values` | Return simplified key-value format |

#### `geonic entities create [json]`

Create a new entity.

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

#### `geonic entities update <id> [json]`

Partially update entity attributes (`PATCH /entities/{id}/attrs`).

```bash
geonic entities update urn:ngsi-ld:Room:001 '{"temperature": {"type": "Property", "value": 25.0}}'
```

#### `geonic entities replace <id> [json]`

Replace all entity attributes (`PUT /entities/{id}/attrs`).

#### `geonic entities upsert [json]`

Create or update an entity (`POST /entityOperations/upsert`).

#### `geonic entities delete <id>`

Delete an entity.

---

### `entities attrs`

Manage individual attributes of an entity.

| Command | Description |
|---------|-------------|
| `geonic entities attrs list <entityId>` | List all attributes |
| `geonic entities attrs get <entityId> <attrName>` | Get a specific attribute |
| `geonic entities attrs add <entityId> [json]` | Add attributes |
| `geonic entities attrs update <entityId> <attrName> [json]` | Update a specific attribute |
| `geonic entities attrs delete <entityId> <attrName>` | Delete a specific attribute |

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
| `geonic batch query [json]` | POST `/entityOperations/query` | Query entities by POST |
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
| `geonic sub get <id>` | Get a subscription |
| `geonic sub create [json]` | Create a subscription |
| `geonic sub update <id> [json]` | Update a subscription |
| `geonic sub delete <id>` | Delete a subscription |

**`sub list` options**: `--limit <n>`, `--offset <n>`, `--count`

```bash
geonic sub create '{
  "type": "Subscription",
  "entities": [{"type": "Room"}],
  "watchedAttributes": ["temperature"],
  "notification": {
    "endpoint": { "uri": "https://webhook.example.com/notify" }
  }
}'
```

---

### `registrations` (reg)

Manage context source registrations (`/ngsi-ld/v1/csourceRegistrations`). Alias: `reg`.

| Command | Description |
|---------|-------------|
| `geonic reg list` | List registrations |
| `geonic reg get <id>` | Get a registration |
| `geonic reg create [json]` | Create a registration |
| `geonic reg update <id> [json]` | Update a registration |
| `geonic reg delete <id>` | Delete a registration |

**`reg list` options**: `--limit <n>`, `--offset <n>`, `--count`

---

### `types`

Query available entity types (`/ngsi-ld/v1/types`).

| Command | Description |
|---------|-------------|
| `geonic types list` | List all entity types |
| `geonic types get <typeName>` | Get details for a specific type |

---

### `temporal`

Manage temporal (time-series) entity data (`/ngsi-ld/v1/temporal`).

#### `geonic temporal entities list`

List temporal entities.

| Option | Description |
|--------|-------------|
| `--type <type>` | Filter by entity type |
| `--attrs <a,b>` | Attributes to return |
| `--query <q>` | NGSI query expression |
| `--georel <rel>` | Geo-relation |
| `--geometry <geo>` | Geometry type |
| `--coords <coords>` | Coordinates |
| `--time-rel <rel>` | Temporal relation: `before`, `after`, `between` |
| `--time-at <time>` | Start time (ISO 8601) |
| `--end-time-at <time>` | End time (ISO 8601) |
| `--last-n <n>` | Return last N temporal values |
| `--limit <n>` | Maximum number of results |
| `--offset <n>` | Number of results to skip |
| `--count` | Include total count |

```bash
# Get temperature history for the last hour
geonic temporal entities get urn:ngsi-ld:Room:001 \
  --attrs temperature \
  --time-rel after \
  --time-at 2026-01-01T00:00:00Z
```

#### `geonic temporal entities get <id>`

Get temporal representation of an entity.

**Options**: `--attrs`, `--time-rel`, `--time-at`, `--end-time-at`, `--last-n`

#### `geonic temporal entities create [json]`

Create a temporal entity.

#### `geonic temporal entities delete <id>`

Delete a temporal entity.

#### `geonic temporal entityOperations query [json]`

Query temporal entities by POST with aggregation support.

| Option | Description |
|--------|-------------|
| `--aggr-methods <methods>` | Aggregation methods (e.g., `totalCount,sum,avg`) |
| `--aggr-period <period>` | Aggregation period duration (ISO 8601, e.g., `PT1H`) |

```bash
# Hourly average temperature
geonic temporal entityOperations query @query.json \
  --aggr-methods avg \
  --aggr-period PT1H
```

---

### `snapshots`

Manage entity snapshots.

| Command | Description |
|---------|-------------|
| `geonic snapshots list` | List snapshots |
| `geonic snapshots get <id>` | Get a snapshot |
| `geonic snapshots create` | Create a new snapshot |
| `geonic snapshots delete <id>` | Delete a snapshot |
| `geonic snapshots clone <id>` | Clone a snapshot |

**`snapshots list` options**: `--limit <n>`, `--offset <n>`

---

### `rules`

Manage ReactiveCore Rules. See [ReactiveCore Rules](../features/reactivcore-rules.md) for details.

| Command | Description |
|---------|-------------|
| `geonic rules list` | List all rules |
| `geonic rules get <id>` | Get a rule |
| `geonic rules create [json]` | Create a rule |
| `geonic rules update <id> [json]` | Update a rule |
| `geonic rules delete <id>` | Delete a rule |
| `geonic rules activate <id>` | Activate a rule |
| `geonic rules deactivate <id>` | Deactivate a rule |

---

### `custom-data-models` (models)

Manage custom data models. Alias: `models`.

| Command | Description |
|---------|-------------|
| `geonic models list` | List all data models |
| `geonic models get <id>` | Get a data model |
| `geonic models create [json]` | Create a data model |
| `geonic models update <id> [json]` | Update a data model |
| `geonic models delete <id>` | Delete a data model |

---

### `catalog`

Browse the DCAT-AP data catalog.

| Command | Description |
|---------|-------------|
| `geonic catalog get` | Get the catalog |
| `geonic catalog datasets list` | List datasets |
| `geonic catalog datasets get <id>` | Get a dataset |
| `geonic catalog datasets sample <id>` | Get a sample from a dataset |

---

### `admin`

Administrative operations. Requires `tenant_admin` or `super_admin` role. See [Authentication & Authorization Guide](./auth.md) for details.

#### `admin tenants`

| Command | Description |
|---------|-------------|
| `geonic admin tenants list` | List tenants |
| `geonic admin tenants get <id>` | Get a tenant |
| `geonic admin tenants create [json]` | Create a tenant |
| `geonic admin tenants update <id> [json]` | Update a tenant |
| `geonic admin tenants delete <id>` | Delete a tenant |
| `geonic admin tenants activate <id>` | Activate a tenant |
| `geonic admin tenants deactivate <id>` | Deactivate a tenant |

#### `admin users`

| Command | Description |
|---------|-------------|
| `geonic admin users list` | List users |
| `geonic admin users get <id>` | Get a user |
| `geonic admin users create [json]` | Create a user |
| `geonic admin users update <id> [json]` | Update a user |
| `geonic admin users delete <id>` | Delete a user |
| `geonic admin users activate <id>` | Activate a user |
| `geonic admin users deactivate <id>` | Deactivate a user |
| `geonic admin users unlock <id>` | Unlock a locked user |

#### `admin policies`

XACML policy management. See [XACML Policy-Based Authorization](./auth.md#xacml-policy-based-authorization) for details.

| Command | Description |
|---------|-------------|
| `geonic admin policies list` | List policies |
| `geonic admin policies get <id>` | Get a policy |
| `geonic admin policies create [json]` | Create a policy |
| `geonic admin policies update <id> [json]` | Update a policy |
| `geonic admin policies delete <id>` | Delete a policy |
| `geonic admin policies activate <id>` | Activate a policy |
| `geonic admin policies deactivate <id>` | Deactivate a policy |

#### `admin oauth-clients`

OAuth 2.0 client management. See [OAuth 2.0 M2M Authentication](./auth.md#oauth-20-m2m-authentication) for details.

| Command | Description |
|---------|-------------|
| `geonic admin oauth-clients list` | List OAuth clients |
| `geonic admin oauth-clients get <id>` | Get an OAuth client |
| `geonic admin oauth-clients create [json]` | Create an OAuth client |
| `geonic admin oauth-clients update <id> [json]` | Update an OAuth client |
| `geonic admin oauth-clients delete <id>` | Delete an OAuth client |

#### `admin api-keys`

API key management. Requires `tenant_admin` or `super_admin` role. See [API Key Authentication](./auth.md#api-key-authentication) for details.

| Command | Description |
|---------|-------------|
| `geonic admin api-keys list` | List API keys |
| `geonic admin api-keys get <id>` | Get an API key |
| `geonic admin api-keys create [json]` | Create an API key |
| `geonic admin api-keys update <id> [json]` | Update an API key |
| `geonic admin api-keys delete <id>` | Delete an API key |

**`admin api-keys list` options**: `--limit <n>`, `--offset <n>`, `--count`, `--tenant-id <id>` (super_admin only)

```bash
# Create an API key with policy binding
geonic admin api-keys create '{
  "name": "my-sensor-key",
  "tenantId": "my-tenant",
  "allowedOrigins": ["https://example.com"],
  "policyId": "sensor-writer",
  "rateLimit": { "perMinute": 120 }
}'

# List API keys for a specific tenant (super_admin)
geonic admin api-keys list --tenant-id my-tenant

# Update an API key
geonic admin api-keys update gdb_abc123 '{"name": "renamed-key", "isActive": false}'
```

**Create schema**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Key name (1–100 chars) |
| `tenantId` | string | Yes (super_admin) | Target tenant ID. Required for super_admin. Optional for tenant_admin (defaults to their own tenant) |
| `allowedOrigins` | string[] | Yes | CORS origins (min 1, max 20). Use `["*"]` for all |
| `policyId` | string | No | Bind to an existing XACML policy (target bypassed). If omitted, authorization falls back to tenant policies, then role defaults (`api_key` default is Deny) |
| `rateLimit` | object | No | `{ perMinute: number }` (1–1000, default: 60) |

> **Note**: The plaintext API key is returned only once in the `key` field of the creation response. Store it securely.

#### `admin cadde`

CADDE (Connector Architecture for Decentralized Data Exchange) settings management.

| Command | Description |
|---------|-------------|
| `geonic admin cadde get` | Get CADDE settings |
| `geonic admin cadde set [json]` | Set CADDE settings |
| `geonic admin cadde delete` | Delete CADDE settings |

---

### `health`

```bash
geonic health
```

Check server health status (`GET /health`).

### `version`

```bash
geonic version
```

Display CLI version and server version (`GET /version`).

### `me`

Display the currently authenticated user and manage user resources.

```bash
geonic me
```

Shows the current user info, JWT token expiry (red if expired, yellow if expiring within 5 minutes), and the active profile name.

#### `me oauth-clients`

Manage your own OAuth clients (`/me/oauth-clients`). Unlike `admin oauth-clients`, this does not require admin privileges — any authenticated user can manage their own clients.

| Command | Description |
|---------|-------------|
| `geonic me oauth-clients list` | List your OAuth clients |
| `geonic me oauth-clients create [json]` | Create a new OAuth client |
| `geonic me oauth-clients delete <id>` | Delete an OAuth client |

**`me oauth-clients create` options**:

| Option | Description |
|--------|-------------|
| `--name <name>` | Client name |
| `--policy <policyId>` | Bind to an existing XACML policy (target bypassed). If omitted, authorization falls back to tenant policies, then role defaults (`user` default is GET-only) |
| `--save` | Save credentials to config for automatic re-authentication |

```bash
# Create an OAuth client with flags
geonic me oauth-clients create --name my-ci-bot --policy bot-access

# Create and save credentials for auto-reauth
geonic me oauth-clients create --name my-ci-bot --save

# Create from JSON
geonic me oauth-clients create '{"name":"my-bot","policyId":"bot-access"}'
```

When `--save` is used, the CLI performs a Client Credentials grant immediately and saves `clientId`, `clientSecret`, and the resulting `token` to the config. Subsequent token expirations are handled automatically.

#### `me api-keys`

Manage your own API keys (`/me/api-keys`). Unlike `admin api-keys`, this does not require admin privileges — any authenticated user can manage their own keys. Limited to 5 keys per user.

| Command | Description |
|---------|-------------|
| `geonic me api-keys list` | List your API keys |
| `geonic me api-keys create [json]` | Create a new API key |
| `geonic me api-keys delete <key-id>` | Delete an API key |

**`me api-keys list` options**: `--limit <n>`, `--offset <n>`, `--count`

```bash
# Create a personal API key
geonic me api-keys create '{
  "name": "my-dev-key",
  "allowedOrigins": ["http://localhost:3000"],
  "policyId": "dev-access"
}'

# List your API keys
geonic me api-keys list

# Delete an API key
geonic me api-keys delete gdb_abc123
```

> **Note**: The plaintext API key is returned only once in the `key` field of the creation response. Store it securely.

### `help`

WP-CLI-style help with progressive detail.

```bash
geonic help                    # All commands overview
geonic help entities           # Command group details
geonic help entities list      # Subcommand details with options and examples
geonic help admin tenants      # Nested command help
```

The `--help` flag works on all commands as well.

---

## Shell Completion

### Bash

```bash
eval "$(geonic cli completions bash)"
```

Add to `~/.bashrc` for persistence.

### Zsh

```bash
eval "$(geonic cli completions zsh)"
```

Add to `~/.zshrc` for persistence.

Completions support subcommand names, option flags, and `--format` value candidates (`json`, `table`, `geojson`).

---

## Command Tree

```text
geonic
├── config
│   ├── set <key> <value>
│   ├── get <key>
│   ├── list
│   └── delete <key>
├── profile
│   ├── list
│   ├── use <name>
│   ├── create <name>
│   ├── delete <name>
│   └── show [name]
├── auth
│   ├── login [--client-credentials] [--client-id] [--client-secret] [--scope] [--tenant-id]
│   └── logout
├── me
│   ├── (default: show current user info)
│   ├── oauth-clients
│   │   ├── list
│   │   ├── create [json] [--name] [--scopes] [--save]
│   │   └── delete <id>
│   └── api-keys
│       ├── list [--limit] [--offset] [--count]
│       ├── create [json]
│       └── delete <id>
├── entities
│   ├── list [options]
│   ├── get <id> [--key-values]
│   ├── create [json]
│   ├── update <id> [json]
│   ├── replace <id> [json]
│   ├── upsert [json]
│   ├── delete <id>
│   └── attrs
│       ├── list <entityId>
│       ├── get <entityId> <attrName>
│       ├── add <entityId> [json]
│       ├── update <entityId> <attrName> [json]
│       └── delete <entityId> <attrName>
├── entityOperations (alias: batch)
│   ├── create [json]
│   ├── upsert [json]
│   ├── update [json]
│   ├── delete [json]
│   ├── query [json]
│   └── merge [json]
├── subscriptions (alias: sub)
│   ├── list [--limit] [--offset] [--count]
│   ├── get <id>
│   ├── create [json]
│   ├── update <id> [json]
│   └── delete <id>
├── registrations (alias: reg)
│   ├── list [--limit] [--offset] [--count]
│   ├── get <id>
│   ├── create [json]
│   ├── update <id> [json]
│   └── delete <id>
├── types
│   ├── list
│   └── get <typeName>
├── temporal
│   ├── entities
│   │   ├── list [options]
│   │   ├── get <id> [options]
│   │   ├── create [json]
│   │   └── delete <id>
│   └── entityOperations
│       └── query [json] [--aggr-methods] [--aggr-period]
├── snapshots
│   ├── list [--limit] [--offset]
│   ├── get <id>
│   ├── create
│   ├── delete <id>
│   └── clone <id>
├── rules
│   ├── list
│   ├── get <id>
│   ├── create [json]
│   ├── update <id> [json]
│   ├── delete <id>
│   ├── activate <id>
│   └── deactivate <id>
├── custom-data-models (alias: models)
│   ├── list
│   ├── get <id>
│   ├── create [json]
│   ├── update <id> [json]
│   └── delete <id>
├── catalog
│   ├── get
│   └── datasets
│       ├── list
│       ├── get <id>
│       └── sample <id>
├── admin
│   ├── tenants
│   │   ├── list / get / create / update / delete
│   │   ├── activate / deactivate
│   ├── users
│   │   ├── list / get / create / update / delete
│   │   ├── activate / deactivate / unlock
│   ├── policies
│   │   ├── list / get / create / update / delete
│   │   ├── activate / deactivate
│   ├── oauth-clients
│   │   └── list / get / create / update / delete
│   ├── api-keys
│   │   └── list / get / create / update / delete
│   └── cadde
│       └── get / set / delete
├── health
├── version
├── help [<args...>]
└── cli
    ├── completions bash / zsh
    └── version
```
