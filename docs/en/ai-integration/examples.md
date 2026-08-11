---
title: "AI Integration Examples"
description: "AI integration code examples"
outline: deep
---
# AI Integration

GeonicDB provides multiple AI-oriented interfaces so that AI agents (Claude, GPT-4, Gemini, etc.) can easily consume the API.

## Endpoint List

| Endpoint | Format | Description |
|---------------|------|------|
| `GET /llms.txt` | Markdown (llms.txt) | API documentation for LLMs |
| `GET /tools.json` | JSON | Claude Tool Use / OpenAI Function Calling compatible schema |
| `GET /.well-known/ai-plugin.json` | JSON | AI plugin manifest |
| `GET /openapi.json` | JSON | OpenAPI 3.0 specification |
| `GET /api.json` | JSON | API reference |

## Tool Use Schema (`/tools.json`

)

Provides tool definitions compatible with Claude Tool Use and OpenAI Function Calling.

### Available Tools (5 tools)

Each tool selects its operation via the `action` and `resource` parameters.

| Tool Name | Resource | Action | Description |
|---------|---------|-----------|------|
| `entities` | entities (default), types, attributes | list, get, create, update, delete, replace, search_by_location, search_by_attribute, get_info, get_all, append, patch_all, patch | IoT entity, type, and attribute management |
| `batch` | - | create, upsert, update, merge, delete, query, purge | Bulk entity operations (up to 1,000 items) |
| `temporal` | - | get, query, create, delete, add_attributes, delete_attribute, merge, modify_instance, delete_instance, batch_create, batch_upsert, batch_delete, batch_query | Time-series data management |
| `config` | rules, jsonld_contexts, data_models, cadde_config | list, get, create, update, delete, activate, deactivate, list_domains, list_models, get_model, generate_template | ReactiveCore Rules, JSON-LD context, Smart Data Models, custom data model management, template generation, and CADDE configuration management (super_admin, get/update/delete) |
| `admin` | users, tenants, policies | list, get, create, update, delete, activate, deactivate, change_password | User, tenant, and policy management (authentication required) |

### Temporal Representation Parameters (#2032 / #2033)

The `temporal` tool accepts the same representation parameters as the HTTP Temporal API, and its
responses go through the **same representation layer** as HTTP (#2033):

| Parameter | Description |
|---|---|
| `format` | `temporalValues` (simplified temporal representation, ETSI clause 4.5.9) or `aggregatedValues` (clause 4.5.19; requires `aggrMethods`). Takes precedence over `options` (clause 6.3.12). Not supported for `batch_query`. |
| `options` | Comma-separated: `temporalValues` / `simplified` / `aggregatedValues` / `sysAttrs`. Unknown tokens are rejected. |
| `aggrMethods` | `totalCount`, `distinctCount`, `sum`, `avg`, `min`, `max`, `stddev`, `sumsq` (comma-separated). Requires `aggrPeriodDuration`. |
| `aggrPeriodDuration` | ISO 8601 duration for the aggregation period (e.g. `PT1H`). |

Consequences of routing MCP/A2A through the shared representation layer (**breaking for clients
that relied on the previous raw output**):

- System temporal attributes (`createdAt` / `modifiedAt` / `expiresAt`) are returned **only** when
  `options=sysAttrs` is requested (clause 6.3.11). They used to be returned unconditionally.
- The internal `attrNameForm` marker is no longer emitted — it was never part of the API contract.
- `instanceId` **is** still returned: it is a representation member defined by clause 4.5.7 and is
  required by the modify/delete instance operations (clause 5.6.14).
- Attribute and type names go through clause 5.5.7 compaction. MCP/A2A supply no request
  `@context`, so names stored as absolute IRIs are rendered as fully qualified URIs (the clause
  5.5.7 fallback), exactly as HTTP does for a core-only request `@context`.

The A2A `temporal` skill returns the same shape for its `get` / `query` / `list` actions.

### Automatic NGSI-LD Attribute Type Detection

MCP tools automatically infer the NGSI-LD type from attribute values:

| Value Pattern | Detected Type | Example |
|------------|-----------|-----|
| String starting with `urn:` | `Relationship` | `"urn:ngsi-ld:Building:001"` |
| GeoJSON object (Point, Polygon, LineString, MultiPoint, MultiPolygon, MultiLineString) | `GeoProperty` | `{"type": "Point", "coordinates": [139.7, 35.6]}` |
| Object containing a `languageMap` field | `LanguageProperty` | `{"languageMap": {"en": "Hello", "ja": "こんにちは"}}` |
| All other values | `Property` | `25.5`, `"text"`, `true`, `[1, 2, 3]` |

You can also specify the type explicitly:
- `{"type": "Property", "value": 25.5}`
- `{"type": "Relationship", "object": "urn:ngsi-ld:Building:001"}`
- `{"type": "GeoProperty", "value": {"type": "Point", "coordinates": [139.7, 35.6]}}`

### Response Structure

```json
{
  "schemaVersion": "1.0.0",
  "apiVersion": "1.0.0",
  "name": "GeonicDB",
  "description": "FIWARE Orion-compatible Context Broker API tools",
  "baseUrl": "https://api.example.com",
  "tools": [
    {
      "name": "entities",
      "description": "Manage IoT entities (sensors, devices, etc.)...",
      "input_schema": {
        "type": "object",
        "properties": { "action": { "type": "string", "enum": ["list", "get", ...] }, ... },
        "required": ["action"]
      }
    }
  ],
  "authentication": {
    "type": "header",
    "headers": {
      "Fiware-Service": "Tenant name",
      "Fiware-ServicePath": "Hierarchical path (default: /)",
      "Authorization": "Bearer token (required unless AUTH_ENABLED=false)"
    }
  }
}
```

## AI Plugin Manifest (`/.well-known/ai-plugin.json`

)

Provides API discovery information.

```json
{
  "schema_version": "v1",
  "name_for_human": "GeonicDB",
  "name_for_model": "geonicdb",
  "description_for_human": "FIWARE Orion-compatible Context Broker for IoT data",
  "description_for_model": "GeonicDB is a FIWARE Orion-compatible Context Broker...",
  "auth": {
    "type": "service_http",
    "instructions": "Provide a JWT Bearer token in the Authorization header, or an API key in the X-Api-Key header. OAuth 2.0 client credentials flow is also supported via POST /oauth/token.",
    "authorization_type": "bearer"
  },
  "api": { "type": "openapi", "url": "/openapi.json" },
  "tools": { "url": "/tools.json" },
  "mcp": { "url": "/mcp", "transport": "streamable-http" },
  "a2a": { "url": "/a2a", "agentCard": "/.well-known/agent-card.json" }
}
```

**Note on `auth`**: the ai-plugin.json `auth` block can only express a single scheme machine-readably — here Bearer (`authorization_type: "bearer"`). The X-Api-Key and OAuth 2.0 client credentials alternatives are mentioned only in the human-readable `instructions` text. For the complete machine-readable definitions of all supported schemes, use the `securitySchemes` in `/openapi.json` (`BearerAuth`, `ApiKeyAuth`, `DPoPAuth`, `basicAuth`), which is the source of truth for auth definitions.

## Usage Examples

### Python + Claude API

```python
import anthropic
import requests

# Fetch the tool schema
tools = requests.get("https://geonicdb.example.com/tools.json").json()["tools"]

# Use the tools with Claude
client = anthropic.Anthropic()
response = client.messages.create(
    model="claude-sonnet-4-20250514",
    tools=tools,
    messages=[{"role": "user", "content": "Get a list of temperature sensors"}]
)
```

### Python + OpenAI API

```python
import openai
import requests

# Fetch the tool schema and convert to OpenAI format
tools_data = requests.get("https://geonicdb.example.com/tools.json").json()
openai_tools = [
    {
        "type": "function",
        "function": {
            "name": tool["name"],
            "description": tool["description"],
            "parameters": tool["input_schema"],
        }
    }
    for tool in tools_data["tools"]
]

client = openai.OpenAI()
response = client.chat.completions.create(
    model="gpt-4",
    tools=openai_tools,
    messages=[{"role": "user", "content": "Search for sensors near Shibuya Station"}]
)
```

## MCP (Model Context Protocol) Support

GeonicDB supports the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/). MCP-compatible AI clients (such as Claude Desktop) can connect directly to the context broker.

### Overview

- **Endpoint**: `POST /mcp`
- **Transport**: Streamable HTTP (JSON response mode)
- **Protocol Version**: 2025-03-26
- **Operation Mode**: Stateless (Lambda-compatible)
- **Authentication**: While authentication is enabled (the default), access control and tenant isolation are enforced via JWT Bearer token

### Claude Desktop Configuration

#### Local Development (No Authentication)

```json
{
  "mcpServers": {
    "geonicdb": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://localhost:3000/mcp",
        "--transport",
        "http-only",
        "--allow-http"
      ]
    }
  }
}
```

> **Note**: `--transport http-only` is required because GeonicDB only supports Streamable HTTP (POST) — SSE is not available. `--allow-http` is needed for `http://` URLs (not required for `https://` in production).

#### Production Environment (With JWT Authentication)

```json
{
  "mcpServers": {
    "geonicdb": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://your-api-endpoint.example.com/mcp",
        "--transport",
        "http-only",
        "--header",
        "Authorization: Bearer <your-jwt-token>"
      ]
    }
  }
}
```

JWT tokens can be obtained from the `/auth/login` endpoint. Note that JWT tokens expire and need periodic renewal.

#### Production Environment (With API Key Authentication)

API keys do not expire and are recommended for long-lived integrations such as Claude Desktop.

**Step 1: Install GeonicDB CLI**

```bash
npm install -g @geolonia/geonicdb-cli
```

**Step 2: Log in and configure the CLI**

```bash
# Set the server URL
geonic config set url https://geonicdb.example.com

# Log in (interactive prompt)
geonic auth login
```

**Step 3: Create an API key**

```bash
geonic me api-keys create \
  --name "claude-desktop" \
  --origins "*" \
  --save
```

> **Important**: The API key (`gdb_` prefixed string) is only displayed once at creation time. Store it securely. The `--save` flag stores the key in the CLI config for automatic use.

API keys are all-Deny by default under the XACML authorization model. Grant access in one of two ways:

- Bind a policy at creation with `--policy <policyId>` (a personal policy created via `geonic me policies create`)
- Have a tenant admin create a tenant policy targeting `role=api_key`

Without either, MCP tool calls are denied.

**Step 4: Configure Claude Desktop**

Edit the Claude Desktop configuration file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "geonicdb": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://geonicdb.example.com/mcp",
        "--header",
        "X-Api-Key:${GEONIC_API_KEY}",
        "--header",
        "NGSILD-Tenant:${GEONIC_SERVICE}",
        "--transport",
        "http-only"
      ],
      "env": {
        "GEONIC_API_KEY": "gdb_your_api_key_here",
        "GEONIC_SERVICE": "your-tenant-name"
      }
    }
  }
}
```

> **Note**: Replace the `env` values with your actual API key and tenant name. Environment variables keep credentials out of the `args` array.

**Step 5: Restart Claude Desktop**

After saving the configuration, fully quit and restart Claude Desktop. The GeonicDB MCP server should appear in the available tools.

#### Claude Code

Claude Code supports Streamable HTTP natively — no `mcp-remote` proxy is needed:

```bash
# Production (with API key)
claude mcp add --transport http geonicdb https://geonicdb.example.com/mcp \
  --header "X-Api-Key: gdb_your_api_key" \
  --header "NGSILD-Tenant: your-tenant-name"

# Local development (no auth)
claude mcp add --transport http geonicdb-local http://localhost:3000/mcp
```

#### Other MCP Clients (Cursor, VS Code, etc.)

Any Streamable HTTP-capable MCP client can connect directly:

- URL: `https://geonicdb.example.com/mcp`
- Headers: `X-Api-Key: gdb_...` (or `Authorization: Bearer <jwt>`) and `NGSILD-Tenant: <tenant>`

#### Managing API Keys

```bash
# List your API keys
geonic me api-keys list

# Delete an API key
geonic me api-keys delete <key-id>
```

### Tenant Specification

Each tool has a `tenant` parameter for specifying the target tenant for the operation.

- **When authentication is disabled**: If omitted, the `default` tenant is used.
- **When authentication is enabled**: If omitted, the logged-in user's tenant is used as the default. `super_admin` cannot use data tools (returns 403). Use `tenant_admin` or `user` role instead, but `tenant_admin`/`user` can only access their own tenant.

### Service Path Specification

**Data tools do not support `servicePath` (#1608).** NGSI-LD has no `Fiware-ServicePath` concept, and the MCP data tools (`entities`, `batch`, `temporal`, including the `types`/`attributes` resources) operate on the NGSI-LD API, so all data is stored under the root path `/` (matching the HTTP NGSI-LD API). The `servicePath` parameter on these tools is deprecated: any non-root value is rejected with an error.

To group or isolate entities hierarchically, use the entity `scope` attribute instead. For searching, the `entities` tool accepts a `scopeQ` query parameter (the `batch` and `temporal` tools do not have a `scopeQ` argument):

```yaml
# Search entities under the /Madrid/Gardens scope and its children
entities tool:
  action: "list"
  tenant: "my-tenant"
  scopeQ: "/Madrid/Gardens/#"
```

**Exception — `config` tool rules operations**: ReactiveCore Rules use `servicePath` as a first-class field, so the `config` tool accepts it for the rules `list` (as an optional filter) and `create` operations (other rules operations ignore it). The value is trimmed, an empty string defaults to `/`, and the result must be a single exact path matching `/^\/[\w/]*$/` (e.g., `/sensors`) — hierarchical `/#` and comma-separated multi-path values are rejected because rules match by exact `servicePath` equality (#1607/#1608).

### NGSI-LD Query Parameters

The `entities` tool supports the full set of NGSI-LD query parameters:

| Parameter | Description | Example |
|---|---|---|
| `idList` | Comma-separated entity IDs for bulk retrieval | `"urn:ngsi-ld:Room:001,urn:ngsi-ld:Room:002"` |
| `idPattern` | Regex pattern to match entity IDs | `"Room.*"` |
| `orderBy` | Entity Ordering Language (ETSI GS CIM 009 V1.9.1 §4.23): comma-separated terms with optional `;` direction (`asc`, `desc`, `dist-asc`, `dist-desc`), supports dot/bracket paths and composite sort keys. Legacy `!attr` is still accepted (deprecated). | `"temperature;desc"`, `"type;asc,temperature;desc"` |
| `orderDirection` | Legacy notation only (`asc`/`desc`), used when `orderBy` does not include `;` directions | `"asc"`, `"desc"` |
| `sysAttrs` | Include system attributes (`createdAt`, `modifiedAt`) in results | `true` |
| `pick` | Comma-separated attribute names to include | `"temperature,humidity"` |
| `omit` | Comma-separated attribute names to exclude | `"status"` |
| `scopeQ` | Scope query expression | `"/Madrid/Gardens"` |
| `lang` | Language filter for LanguageProperty values | `"ja"` |
| `geoproperty` | GeoProperty attribute name for geo-queries (default: `location`) | `"observationArea"` |
| `spatialId` | Spatial ID in ZFXY format | `"18/232814/103224"` |
| `spatialIdDepth` | Depth for spatial ID hierarchical search | `2` |

```yaml
# List entities sorted by creation time (newest first) with system attributes
entities tool:
  action: "list"
  type: "Sensor"
  orderBy: "createdAt;desc"
  sysAttrs: true
  limit: 10

# Retrieve specific entities by ID
entities tool:
  action: "list"
  idList: "urn:ngsi-ld:Room:001,urn:ngsi-ld:Room:002"

# Search with attribute projection
entities tool:
  action: "list"
  type: "Room"
  pick: "temperature,humidity"
  q: "temperature>20"
```

The `batch` tool's `query` action also supports `orderBy`, `orderDirection`, and `sysAttrs`.

### Verification

```bash
# Start the local server
npm start

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

### Limitations

- **Stateless mode**: Due to Lambda environment constraints, SSE streaming is not available. All requests are returned as JSON responses.
- **No session management**: Each request is processed independently. `GET /mcp` (SSE) and `DELETE /mcp` (session termination) return 405.
- **Authentication**: A Bearer token is required while authentication is enabled (the default). With an explicit `AUTH_ENABLED=false`, operation proceeds without authentication.
- **OAuth scopes**: When using OAuth tokens, the OAuth scope corresponding to each MCP tool operation is required (e.g., `read:entities` for reading entities, `write:entities` for writing). Scope restrictions do not apply to JWT RBAC tokens.
- **Rate limiting**: The MCP endpoint is subject to the same rate limits, storage quotas, and request body size limits as the REST API.

## JSON Schema and Custom Data Models

Custom data models automatically have a JSON Schema (Draft 2020-12) generated at creation time. This JSON Schema can be leveraged by AI tools for the following purposes.

**`additionalProperties` field**: Controls whether entities can have attributes not defined in `propertyDetails`. Default is `true` (allows any additional attributes, following NGSI-LD semantics). Set to `false` to enforce strict validation — only defined attributes are accepted. AI agents should check this field when creating entities to determine whether extra attributes are permitted.

**`uniqueConstraints` field**: Declares composite-unique attribute combinations (e.g., `[{"name": "no-double-booking", "fields": ["room", "date", "startTime"]}]`) enforced server-side via a database unique index. When an entity create/update would duplicate a constrained combination, the API returns `409 AlreadyExists` with the violated constraint name. AI agents should check `uniqueConstraints` on the data model before creating entities and treat a 409 containing "violates unique constraint" as a data conflict (choose different values), not as an entity-ID collision.

### Example Use Cases with AI Tools

**Schema reference during entity creation**: An AI agent can retrieve a custom data model using the `config` tool's `data_models` resource and reference the `jsonSchema` field to generate entities that conform to the correct types and validation rules.

```yaml
# 1. Retrieve the JSON Schema for the custom data model
config tool:
  action: "get"
  resource: "data_models"
  type: "TemperatureSensor"

# 2. Create an entity based on the JSON Schema
entities tool:
  action: "create"
  entity:
    id: "urn:ngsi-ld:TemperatureSensor:001"
    type: "TemperatureSensor"
    temperature: 23.5  # within minimum: -50, maximum: 100 range
    unit: "Celsius"    # enum: ["Celsius", "Fahrenheit", "Kelvin"]
```

**Automatic correction of validation errors**: If a validation error is returned during entity creation, an AI agent can reference the JSON Schema to identify the cause of the error and correct it to a valid value.

### Entity Template Generation

Using the `generate_template` action of the `config` tool, an NGSI-LD entity template can be automatically generated from a custom data model.

```yaml
# Generate a template
config tool:
  resource: "data_models"
  action: "generate_template"
  type: "TemperatureSensor"
```

**Example response:**

```json
{
  "id": "urn:ngsi-ld:TemperatureSensor:550e8400-e29b-41d4-a716-446655440000",
  "type": "TemperatureSensor",
  "@context": [
    "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
    "https://example.com/contexts/temperature-sensor.jsonld"
  ],
  "temperature": {
    "type": "Property",
    "value": 20.0
  },
  "unit": {
    "type": "Property",
    "value": "Celsius"
  }
}
```

The template determines values using the following priority order:
1. The `defaultValue` if defined
2. The `example` value if defined
3. A default value based on `valueType` (string → `""`, number → `0`, boolean → `false`, etc.)

AI agents can use this template as a base, modifying values according to user instructions to create entities.

### Dynamic Integration with OpenAPI Specification

The `/openapi.json` endpoint dynamically adds the JSON Schema of custom data models associated with the authenticated user's tenant to `components/schemas`. This allows AI tools and code generation tools that reference the OpenAPI specification to automatically recognize tenant-specific data models.

```bash
# Retrieve the OpenAPI specification with authentication (includes custom schemas)
curl https://api.example.com/openapi.json \
  -H "Authorization: Bearer <accessToken>"
```

The custom data model JSON Schema is added to `components.schemas` in the response:

```json
{
  "components": {
    "schemas": {
      "Entity": { "..." },
      "TemperatureSensor": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": "TemperatureSensor",
        "type": "object",
        "properties": {
          "temperature": { "type": "number", "minimum": -50, "maximum": 100 }
        }
      }
    }
  }
}
```

### Property @context for Vocabulary Mapping

Each property in `propertyDetails` can include an optional `@context` field with an HTTP(S) URL. When defining attributes, check [schema.org](https://schema.org/docs/full.html) for matching vocabulary and set it as the `@context` value.

```yaml
# Create a model with schema.org vocabulary
config tool:
  resource: "data_models"
  action: "create"
  type: "SurveyResponse"
  domain: "survey"
  description: "Survey response"
  propertyDetails:
    email:
      ngsiType: "Property"
      valueType: "string"
      example: "taro@example.com"
      "@context": "https://schema.org/email"   # schema.org vocabulary
    name:
      ngsiType: "Property"
      valueType: "string"
      example: "田中太郎"
      # No @context → auto-generated URL
```

The generated JSON-LD `@context` will be:

```json
{
  "@context": {
    "SurveyResponse": "https://api.example.com/vocab/{tenantId}/SurveyResponse",
    "email": "https://schema.org/email",
    "name": "https://api.example.com/vocab/{tenantId}/name"
  }
}
```

Auto-generated vocabulary IRIs live on **this broker's own base URL** (#1984) and are dereferenceable via `GET /vocab/{tenantId}/{term}`. The base URL comes from the `API_BASE_URL` environment variable — injected at deploy time from the SAM template parameter **`ApiBaseUrl`** (`infrastructure/template.yaml`) — and falls back to the request `Host` header when it is unset. Set `ApiBaseUrl` so the IRIs stay stable across hostnames; see [API.md → Broker base URL resolution](../api-reference/endpoints.md#broker-base-url-resolution).

Property URIs are entity-type independent — the same property name (e.g., `email`) shares the same URI across different entity types within the same tenant.

### @context Resolution (#1733)

The `@context` used to render an NGSI-LD response is **only** the one the request supplied. With none supplied, the NGSI-LD core `@context` alone is used, and terms it cannot compact are rendered as fully qualified URIs (ETSI GS CIM 009 clause 5.5.5 / 5.5.7).

A custom data model's `contextUrl` is not injected automatically. AI agents that want the model's vocabulary should read `contextUrl` from the data model and pass it on the read via the JSON-LD `Link` header — the fully qualified URIs returned without a context are themselves unambiguous semantic identifiers.

## JavaScript SDK with AI Coding Assistants

The GeonicDB JavaScript SDK (`@geolonia/geonicdb-sdk`) is designed for AI-assisted development. The npm package includes full TypeScript type declarations, so AI coding assistants (Claude Code, Cursor, GitHub Copilot, etc.) can automatically discover the full public API without any additional configuration.

### What AI tools learn from the SDK

| Information | Source |
|------------|--------|
| Constructor options | `GeonicDBOptions` type |
| Method signatures (17 methods) | TypeScript declarations |
| Credential types | `CredentialsOptions`, `RefreshedCredentials` types |
| Query parameters | `GetEntitiesParams` type |
| Subscription options | `SubscribeOptions` type |
| Event payloads | `EntityEvent`, `ReconnectingEvent` types |
| All 10 event types | Documented in type declarations |

### How it works

1. Developer installs the SDK: `npm install @geolonia/geonicdb-sdk`
2. Developer imports the SDK: `import GeonicDB from '@geolonia/geonicdb-sdk'`
3. AI reads the TypeScript declarations from the package
4. AI generates correct code using the documented API

No separate documentation URLs or special configuration required. TypeScript projects get full type checking and IDE autocompletion out of the box. See the SDK documentation for details.

## A2A (Agent-to-Agent Protocol) Support

GeonicDB supports the [A2A (Agent-to-Agent) protocol](https://google.github.io/A2A/), enabling other AI agents to interact with the context broker through standardized inter-agent communication.

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/.well-known/agent-card.json` | GET | Agent Card — describes capabilities, skills, and authentication |
| `/a2a` | POST | JSON-RPC 2.0 endpoint for A2A operations |

### Supported Methods (Phase 1)

| JSON-RPC Method | Description |
|-----------------|-------------|
| `message/send` | Send a message and receive a synchronous response |
| `tasks/get` | Retrieve current state of a task |
| `tasks/list` | List tasks with filtering and pagination |
| `tasks/cancel` | Request task cancellation |

### Skills

A2A maps to the same 5 tools available via MCP:

| Skill ID | Description |
|----------|-------------|
| `entities` | NGSI-LD entity CRUD, geo-spatial/attribute search |
| `batch` | Bulk create, upsert, update, delete operations |
| `temporal` | Time-series data management |
| `config` | Reactive rules, JSON-LD contexts, data models |
| `admin` | User, tenant, and policy management |

### Authentication

A2A uses the same authentication methods as the REST API:
- **Bearer JWT**: `Authorization: Bearer <token>` header
- **API Key**: `X-Api-Key: <key>` header
- **OAuth 2.0**: Client credentials flow via `POST /oauth/token`
- **DPoP**: `Authorization: DPoP <token>` + `DPoP` proof header (when enabled)

`Fiware-Service` ヘッダーによるテナント指定を推奨します（未指定時はデフォルトテナントにフォールバック）。

**Authorization (#1651)**: A2A の entities/batch/temporal スキルは、REST / MCP と **同一の entity-level / list-level 認可**を通ります（`checkEntityOwnership` / `requireListReadAuthz` / `requireAuthz` を合成イベントで無改変に呼ぶ実装を共有）。`entityType` / `entityOwner` / `scope` による制約は A2A 経由でも等しく強制され、一覧は読めない行を除外し、by-id 操作は DB の実属性で判定されます。到達には `/a2a` への path-level 許可が必要です — `tenant_admin` は既定ポリシーで許可され（`/mcp` と対称）、`user` / `oauth_client` / `api_key` はテナント管理者がバインドしたポリシーで `/a2a` を明示許可する必要があります（`super_admin` は data tool を使えません）。

**入力検証 (#1944)**: `message.metadata` は dispatch の前に Zod スキーマで検証されます。**構造化フィールド (`entities` / `attributes` / `entityIds`) だけがオブジェクト / 配列を取れ、それ以外のキーはすべてプリミティブ (string / number / boolean / null) のみ**です。`{"type": {"$ne": null}}` のような演算子オブジェクトはクエリ層に届く前に検証エラーとして拒否されます。

allowlist（既知キーの列挙）ではなく**値の形**で制約しているのは、`params.X` の消費点が 40 以上あり列挙漏れ 1 つで穴が空くためです。この設計により、将来ハンドラが新しい `params.X` を読み始めても注入経路は塞がったままになります。検証失敗は JSON-RPC のエラーとして返り、HTTP の 400 と同じ「拒否される」挙動になります。

**管理系スキルのロール要件 (#1651)**: `admin` スキル（users / policies）と `config` スキルの `rules` 操作は `tenant_admin` ロールを要求します（MCP と同じゲート）。`/a2a` を許可された `oauth_client` / `api_key` / `user` は、これらの管理操作ではアクセス拒否になります（entities / batch / temporal のデータ操作は上記の entity-level 認可で判定）。

**管理系スキルのテナントスコープ (#1938)**: ポリシー操作は HTTP の `/admin/policies` と**同一のテナントスコープ・権限昇格チェック**を通ります。対象は、MCP `admin` ツール `resource: policies` の `get` / `update` / `delete` / `activate` / `deactivate` と、A2A `admin` スキル `resource: policies` の `get` です（A2A のポリシー操作は `list` と `get` のみを提供し、それ以外の action は `Unsupported policies action` エラーになります）。`tenant_admin` は自テナントのポリシーのみ対象にでき、他テナントおよびグローバルポリシー（`tenantId: null`）は `super_admin` のみが扱えます。更新時のロール制限（`permit-overrides` は `super_admin` のみ／`priority` はロール別下限以上）は、更新操作を提供する **MCP の `update`** に適用されます。

### Example: Sending a Message

```bash
curl -X POST https://your-geonicdb.example.com/a2a \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -H "Fiware-Service: mytenant" \
  -d '{
    "jsonrpc": "2.0",
    "method": "message/send",
    "id": 1,
    "params": {
      "message": {
        "role": "user",
        "parts": [{"kind": "text", "text": "List all entities of type Sensor"}],
        "metadata": {
          "skill": "entities",
          "action": "list",
          "type": "Sensor"
        }
      }
    }
  }'
```

### Relationship with MCP

A2A and MCP are complementary:
- **MCP** is for tool invocation — an AI agent uses GeonicDB as a tool
- **A2A** is for inter-agent communication — AI agents collaborate with GeonicDB as a peer agent

Both share the same underlying service layer and support the same 5 skill/tool categories.

## References

- [Claude Tool Use](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [A2A Protocol](https://google.github.io/A2A/)
- [llms.txt](https://llmstxt.org/)
