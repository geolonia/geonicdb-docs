---
title: "tools.json"
description: "AI tool definitions (tools.json)"
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
      "Authorization": "Bearer token (when AUTH_ENABLED=true)"
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
  "auth": { "type": "none" },
  "api": { "type": "openapi", "url": "/openapi.json" },
  "tools": { "url": "/tools.json" }
}
```

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
- **Authentication**: When `AUTH_ENABLED=true`, access control and tenant isolation are enforced via JWT Bearer token

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
geonic config set url https://geonicdb.geolonia.com

# Log in (interactive prompt)
geonic auth login
```

**Step 3: Create an API key**

```bash
geonic me api-keys create \
  --name "claude-desktop" \
  --scopes "read:entities,write:entities,read:subscriptions,write:subscriptions,read:registrations,write:registrations" \
  --origins "*" \
  --service <your-tenant-name> \
  --save
```

> **Important**: The API key (`gdb_` prefixed string) is only displayed once at creation time. Store it securely. The `--save` flag stores the key in the CLI config for automatic use.

Available scopes for API keys:

| Scope | Description |
|---|---|
| `read:entities` | Read entities, types, and attributes |
| `write:entities` | Create, update, and delete entities |
| `read:subscriptions` | Read subscriptions |
| `write:subscriptions` | Create, update, and delete subscriptions |
| `read:registrations` | Read context source registrations |
| `write:registrations` | Create, update, and delete registrations |

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
        "https://geonicdb.geolonia.com/mcp",
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

The `entities`, `types`, `attributes`, `batch`, and `temporal` tools have a `servicePath` parameter that allows managing entities within a hierarchical scope.

#### Basic Format

- **Format**: A path starting with `/` (e.g., `/hello`, `/city/sensors`)
- **Default**: If omitted, the root path `/` is used
- **Use case**: Used to group or isolate entities within the same tenant

```yaml
# Get entities under the /hello path
entities tool:
  action: "list"
  tenant: "my-tenant"
  servicePath: "/hello"
```

#### Hierarchical Search (`/#`

)

Using the `/#` suffix searches the specified path and all its child paths.

```yaml
# Search /Madrid/Gardens and its child paths (e.g., /Madrid/Gardens/ParqueNorte)
entities tool:
  action: "list"
  tenant: "my-tenant"
  servicePath: "/Madrid/Gardens/#"
```

#### Multiple Path Specification (Comma-separated)

Multiple paths can be searched simultaneously by separating them with commas (up to 10 paths).

```yaml
# Search both /park1 and /park2
entities tool:
  action: "list"
  tenant: "my-tenant"
  servicePath: "/park1, /park2"
```

**Note**: Write operations (create, update, delete) only support a single, non-hierarchical path.

### NGSI-LD Query Parameters

The `entities` tool supports the full set of NGSI-LD query parameters:

| Parameter | Description | Example |
|---|---|---|
| `idList` | Comma-separated entity IDs for bulk retrieval | `"urn:ngsi-ld:Room:001,urn:ngsi-ld:Room:002"` |
| `idPattern` | Regex pattern to match entity IDs | `"Room.*"` |
| `orderBy` | Sort by attribute or system field. Prefix with `!` for descending | `"createdAt"`, `"!modifiedAt"` |
| `orderDirection` | Sort direction (alternative to `!` prefix) | `"asc"`, `"desc"` |
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
  orderBy: "!createdAt"
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
- **Authentication**: A Bearer token is required when `AUTH_ENABLED=true`. When `AUTH_ENABLED=false`, operation proceeds without authentication.
- **OAuth scopes**: When using OAuth tokens, the OAuth scope corresponding to each MCP tool operation is required (e.g., `read:entities` for reading entities, `write:entities` for writing). Scope restrictions do not apply to JWT RBAC tokens.
- **Rate limiting**: The MCP endpoint is subject to the same rate limits, storage quotas, and request body size limits as the REST API.

## JSON Schema and Custom Data Models

Custom data models automatically have a JSON Schema (Draft 2020-12) generated at creation time. This JSON Schema can be leveraged by AI tools for the following purposes.

**`additionalProperties` field**: Controls whether entities can have attributes not defined in `propertyDetails`. Default is `true` (allows any additional attributes, following NGSI-LD semantics). Set to `false` to enforce strict validation — only defined attributes are accepted. AI agents should check this field when creating entities to determine whether extra attributes are permitted.

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
    "SurveyResponse": "https://geonicdb.geolonia.com/vocab/{tenantId}/SurveyResponse",
    "email": "https://schema.org/email",
    "name": "https://geonicdb.geolonia.com/vocab/{tenantId}/name"
  }
}
```

Property URIs are entity-type independent — the same property name (e.g., `email`) shares the same URI across different entity types within the same tenant.

### @context Resolution Extension

When retrieving entities via the NGSI-LD API, if the custom data model has a `contextUrl` configured, the custom context is automatically included in the response's `@context`. Similar to Smart Data Models contexts, AI agents can use this `@context` to interpret the semantic information of entities.

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
