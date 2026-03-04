---
title: "AI 連携サンプル"
description: "AI 連携コード例"
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

## Tool Use Schema (`/tools.json`)

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
- `{"type": "Property", "value": 25.5}`- `{"type": "Relationship", "object": "urn:ngsi-ld:Building:001"}`- `{"type": "GeoProperty", "value": {"type": "Point", "coordinates": [139.7, 35.6]}}`
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

- **Endpoint**: `POST /mcp`- **Transport**: Streamable HTTP (JSON response mode)
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
    "geonicdb": {
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

Each tool has a `tenant` parameter for specifying the target tenant for the operation.

- **When authentication is disabled**: If omitted, the `default` tenant is used.
- **When authentication is enabled**: If omitted, the logged-in user's tenant is used as the default. `super_admin` can access any tenant, but `tenant_admin`/`user` can only access their own tenant.

### Service Path Specification

The `entities`, `types`, `attributes`, `batch`, and `temporal` tools have a `servicePath` parameter that allows managing entities within a hierarchical scope.

#### Basic Format

- **Format**: A path starting with `/` (e.g., `/hello`, `/city/sensors`)
- **Default**: If omitted, all paths are searched (equivalent to `/#`)
- **Use case**: Used to group or isolate entities within the same tenant

```yaml
# Get entities under the /hello path
entities tool:
  action: "list"
  tenant: "my-tenant"
  servicePath: "/hello"
```







#### Hierarchical Search (`/#`)

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

















### @context Resolution Extension

When retrieving entities via the NGSI-LD API, if the custom data model has a `contextUrl` configured, the custom context is automatically included in the response's `@context`. Similar to Smart Data Models contexts, AI agents can use this `@context` to interpret the semantic information of entities.

## References

- [Claude Tool Use](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [llms.txt](https://llmstxt.org/)