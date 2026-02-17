---
title: tools.json
description: GeonicDB provides a tools.json endpoint with Claude Tool Use and OpenAI Function Calling compatible tool definitions for AI agent integration.
outline: deep
---

# tools.json

GeonicDB serves a `tools.json` endpoint that provides tool definitions compatible with **Claude Tool Use** and **OpenAI Function Calling**. AI agents can fetch this schema and use it to make structured API calls without manual configuration.

## Endpoint

| Property | Value |
|----------|-------|
| **URL** | `GET /tools.json` |
| **Format** | JSON |
| **Authentication** | Not required |

## Response Structure

```json
{
  "schemaVersion": "1.0.0",
  "apiVersion": "1.0.0",
  "name": "GeonicDB",
  "description": "FIWARE Orion-compatible Context Broker API tools",
  "baseUrl": "https://api.geonicdb.geolonia.com",
  "tools": [
    {
      "name": "entities",
      "description": "Manage IoT entities (sensors, devices, etc.)...",
      "input_schema": {
        "type": "object",
        "properties": {
          "action": {
            "type": "string",
            "enum": ["list", "get", "create", "update", "delete", "replace", "search_by_location", "search_by_attribute"]
          }
        },
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

## Tool Definitions (8 Tools)

Each tool uses an `action` parameter to select the specific operation:

| Tool | Actions | Description |
|------|---------|-------------|
| `entities` | list, get, create, update, delete, replace, search_by_location, search_by_attribute | IoT entity management |
| `types` | list, get | Entity type queries |
| `attributes` | list, get_info, get_all, get, append, patch_all, replace, patch, delete | Entity attribute management |
| `batch` | create, upsert, update, merge, delete, query, purge | Batch operations (up to 1,000 entities) |
| `temporal` | get, query, create, delete, add_attributes, delete_attribute, merge, modify_instance, delete_instance, batch_create, batch_upsert, batch_delete, batch_query | Time-series data management |
| `jsonld_contexts` | list, get, create, delete | JSON-LD context management |
| `admin` | list, get, create, update, delete, activate, deactivate, change_password | User, tenant, and policy management (authentication required) |
| `data_models` | list_domains, list_models, get_model | Smart Data Models catalog browsing |

> **Note:** The `admin` tools require administrator privileges. Ensure you use an appropriate authentication token.

## Using with Claude Tool Use

The `tools` array from the response can be passed directly to the Anthropic API:

```python
import anthropic
import requests

# Fetch tool definitions
tools_response = requests.get("https://api.geonicdb.geolonia.com/tools.json")
tools = tools_response.json()["tools"]

# Use with Claude
client = anthropic.Anthropic()
response = client.messages.create(
    model="claude-sonnet-4-20250514",
    tools=tools,
    messages=[{"role": "user", "content": "List all temperature sensors"}]
)
```

## Using with OpenAI Function Calling

The tool definitions need a simple transformation to match OpenAI's format:

```python
import openai
import requests

# Fetch and transform tool definitions
tools_data = requests.get("https://api.geonicdb.geolonia.com/tools.json").json()
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

# Use with OpenAI
client = openai.OpenAI()
response = client.chat.completions.create(
    model="gpt-4",
    tools=openai_tools,
    messages=[{"role": "user", "content": "Search for sensors near Shibuya Station"}]
)
```

## AI Plugin Manifest

GeonicDB also provides an AI plugin manifest for API discovery:

```bash
curl https://api.geonicdb.geolonia.com/.well-known/ai-plugin.json
```

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

## Next Steps

- [Examples](/en/ai-integration/examples) — Complete working code examples
- [MCP Server](/en/ai-integration/mcp-server) — Direct MCP protocol integration
- [llms.txt](/en/ai-integration/llms-txt) — LLM-optimized documentation endpoint
