---
title: "AI Integration Overview"
description: "Overview of GeonicDB's AI-native features"
outline: deep
---
# AI Integration

GeonicDB provides multiple AI-oriented interfaces to enable AI agents (Claude, GPT-4, Gemini, etc.) to easily utilize the API.

## Endpoint List

| Endpoint | Format | Description |
|----------|--------|-------------|
| `GET /llms.txt` | Markdown (llms.txt) | API documentation for LLMs |
| `GET /tools.json` | JSON | Claude Tool Use / OpenAI Function Calling compatible schema |
| `GET /.well-known/ai-plugin.json` | JSON | AI plugin manifest |
| `GET /openapi.json` | JSON | OpenAPI 3.0 specification |
| `GET /api.json` | JSON | API reference |

## Tool Use Schema (`/tools.json`)

Provides tool definitions compatible with Claude Tool Use and OpenAI Function Calling.

### Available Tools (5 tools)

Each tool selects operations using `action` and `resource` parameters.

| Tool Name | Resources | Actions | Description |
|-----------|-----------|---------|-------------|
| `entities` | entities (default), types, attributes | list, get, create, update, delete, replace, search_by_location, search_by_attribute, get_info, get_all, append, patch_all, patch | IoT entity, type, and attribute management |
| `batch` | - | create, upsert, update, merge, delete, query, purge | Bulk entity operations (up to 1,000 items) |
| `temporal` | - | get, query, create, delete, add_attributes, delete_attribute, merge, modify_instance, delete_instance, batch_create, batch_upsert, batch_delete, batch_query | Time-series data management |
| `config` | rules, jsonld_contexts, data_models, cadde_config | list, get, create, update, delete, activate, deactivate, list_domains, list_models, get_model, generate_template | ReactiveCore Rules, JSON-LD contexts, Smart Data Models, custom data model management, template generation, CADDE configuration management (super_admin, get/update/delete) |
| `admin` | users, tenants, policies | list, get, create, update, delete, activate, deactivate, change_password | User, tenant, and policy management (authentication required) |

### Automatic NGSI-LD Attribute Type Detection

MCP tools automatically infer NGSI-LD types from attribute values:

| Value Pattern | Detected Type | Example |
|--------------|---------------|---------|
| String starting with `urn:` | `Relationship` | `"urn:ngsi-ld:Building:001"` |
| GeoJSON object (Point, Polygon, LineString, MultiPoint, MultiPolygon, MultiLineString) | `GeoProperty` | `{"type": "Point", "coordinates": [139.7, 35.6]}` |
| Object containing `languageMap` field | `LanguageProperty` | `{"languageMap": {"en": "Hello", "ja": "こんにちは"}}` |
| All other values | `Property` | `25.5`, `"text"`, `true`, `[1, 2, 3]` |

Explicit type specification is also possible:
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

## AI Plugin Manifest (`/.well-known/ai-plugin.json`)

Provides API discovery information.

```json
{
  "schema_version": "v1",
  "name_for_human": "GeonicDB",
  "name_for_model": "vela",
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

# Retrieve tool schema
tools = requests.get("https://vela.example.com/tools.json").json()["tools"]

# Use tools with Claude
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

# Retrieve tool schema and convert to OpenAI format
tools_data = requests.get("https://vela.example.com/tools.json").json()
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
    messages=[{"role": "user", "content": "Search for sensors around Shibuya Station"}]
)
```

## MCP (Model Context Protocol) Support

GeonicDB supports the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/). You can connect directly to the context broker from MCP-compatible AI clients (such as Claude Desktop).

### Overview

- **Endpoint**: `POST /mcp`
- **Transport**: Streamable HTTP (JSON response mode)
- **Protocol Version**: 2025-03-26
- **Operation Mode**: Stateless (Lambda-compatible)
- **Authentication**: JWT Bearer token access control and tenant isolation when `AUTH_ENABLED=true`

### Claude Desktop Configuration

#### Local Development (No Authentication)

```json
{
  "mcpServers": {
    "vela": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://localhost:3000/mcp"
      ]
    }
  }
}
```

#### Production Environment (With Authentication)

```json
{
  "mcpServers": {
    "vela": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://your-api-endpoint.example.com/mcp",
        "--header",
        "Authorization: Bearer <your-jwt-token>"
      ]
    }
  }
}
```

JWT tokens can be obtained from the `/auth/login` endpoint.

### Tenant Specification

Each tool has a `tenant` parameter to specify the target tenant for operations.

- **When authentication is disabled**: If omitted, the `default` tenant is used.
- **When authentication is enabled**: If omitted, the logged-in user's tenant is used by default. `super_admin` can access any tenant, but `tenant_admin`/`user` can only access their own tenant.

### Service Path Specification

The `entities`, `types`, `attributes`, `batch`, and `temporal` tools have a `servicePath` parameter for managing entities in hierarchical scopes.

#### Basic Format

- **Format**: Path starting with `/` (e.g., `/hello`, `/city/sensors`)
- **Default**: If omitted, searches all paths (equivalent to `/#`)
- **Usage**: Used to group or isolate entities within the same tenant

```yaml
# Get entities in /hello path
entities tool:
  action: "list"
  tenant: "my-tenant"
  servicePath: "/hello"
```

#### Hierarchical Search (/#)

Using the `/#` suffix allows searching the specified path and all its child paths.

```yaml
# Search /Madrid/Gardens and its child paths (e.g., /Madrid/Gardens/ParqueNorte)
entities tool:
  action: "list"
  tenant: "my-tenant"
  servicePath: "/Madrid/Gardens/#"
```

#### Multiple Path Specification (Comma-separated)

Multiple paths can be searched simultaneously using comma separation (up to 10 paths).

```yaml
# Search both /park1 and /park2
entities tool:
  action: "list"
  tenant: "my-tenant"
  servicePath: "/park1, /park2"
```

**Note**: Write operations (create, update, delete) can only use a single non-hierarchical path.

### Verification

```bash
# Start local server
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

- **Stateless Mode**: Due to Lambda environment constraints, SSE streaming is not available. All requests return JSON responses.
- **No Session Management**: Each request is processed independently. `GET /mcp` (SSE) and `DELETE /mcp` (session termination) return 405.
- **Authentication**: Bearer token is required when `AUTH_ENABLED=true`. Operates without authentication when `AUTH_ENABLED=false`.
- **OAuth Scopes**: When using OAuth tokens, OAuth scopes corresponding to each MCP tool operation are required (e.g., entity read requires `read:entities`, write requires `write:entities`). Scope restrictions do not apply to JWT RBAC tokens.
- **Rate Limiting**: The MCP endpoint is subject to the same rate limits, storage quotas, and request body size limits as the REST API.

## JSON Schema and Custom Data Models

Custom data models automatically generate JSON Schema (Draft 2020-12) upon creation. This JSON Schema can be utilized by AI tools for the following purposes.

### Usage Examples with AI Tools

**Schema Reference During Entity Creation**: AI agents can retrieve custom data models using the `config` tool's `data_models` resource and reference the `jsonSchema` field to generate entities that conform to the correct types and validation rules.

```yaml
# 1. Retrieve JSON Schema of custom data model
config tool:
  action: "get"
  resource: "data_models"
  type: "TemperatureSensor"

# 2. Create entity based on JSON Schema
entities tool:
  action: "create"
  entity:
    id: "urn:ngsi-ld:TemperatureSensor:001"
    type: "TemperatureSensor"
    temperature: 23.5  # Within minimum: -50, maximum: 100 range
    unit: "Celsius"    # enum: ["Celsius", "Fahrenheit", "Kelvin"]
```

**Automatic Correction of Validation Errors**: When validation errors are returned during entity creation, AI agents can reference the JSON Schema to identify the cause of the error and correct the values.

### Entity Template Generation

The `generate_template` action of the `config` tool can automatically generate NGSI-LD format entity templates from custom data models.

```yaml
# Generate template
config tool:
  resource: "data_models"
  action: "generate_template"
  type: "TemperatureSensor"
```

**Response Example:**

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

Templates determine values according to the following priority:
1. The value defined in `defaultValue` if present
2. The value defined in `example` if present
3. Default values based on `valueType` (string → `""`, number → `0`, boolean → `false`, etc.)

AI agents can create entities based on this template, modifying values according to user instructions.

### Dynamic Integration with OpenAPI Specification

The `/openapi.json` endpoint dynamically adds JSON Schemas of custom data models associated with the authenticated user's tenant to `components/schemas`. This enables AI tools and code generation tools that reference the OpenAPI specification to automatically recognize tenant-specific data models.

```bash
# Retrieve OpenAPI specification with authentication (includes custom schemas)
curl https://api.example.com/openapi.json \
  -H "Authorization: Bearer <accessToken>"
```

Custom data model JSON Schemas are added to `components.schemas` in the response:

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

### @context Resolution Extension

When retrieving entities via the NGSI-LD API, if a custom data model has a `contextUrl` set, the custom context is automatically included in the response's `@context`. Similar to Smart Data Models contexts, AI agents can use this `@context` to interpret the semantic information of entities.

## Reference Materials

- [Claude Tool Use](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [llms.txt](https://llmstxt.org/)