---
title: MCP Server
description: Vela OS provides a Model Context Protocol (MCP) server endpoint for direct AI agent integration with Claude Desktop, VS Code Copilot, and other MCP clients.
outline: deep
---

# MCP Server

Vela OS supports the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/), enabling MCP-compatible AI clients to connect directly to the Context Broker and perform data operations through structured tool calls.

## Endpoint Details

| Property | Value |
|----------|-------|
| **Endpoint** | `POST /mcp` |
| **Transport** | Streamable HTTP (JSON response mode) |
| **Protocol Version** | 2025-03-26 |
| **Operation Mode** | Stateless (Lambda-compatible) |
| **Authentication** | JWT Bearer token (when `AUTH_ENABLED=true`) |

## Claude Desktop Configuration

### SaaS (with authentication)

Add the following to your Claude Desktop MCP settings:

```json
{
  "mcpServers": {
    "vela": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://api.vela.geolonia.com/mcp",
        "--header",
        "Authorization: Bearer YOUR_API_KEY"
      ]
    }
  }
}
```

Replace `YOUR_API_KEY` with your JWT token.

### Local Development (no authentication)

For local development with authentication disabled:

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

## Available Tools

The MCP server exposes **8 tools**, each using an `action` parameter to select the operation:

| Tool | Actions | Description |
|------|---------|-------------|
| `entities` | list, get, create, update, delete, replace, search_by_location, search_by_attribute | IoT entity management |
| `types` | list, get | Entity type queries |
| `attributes` | list, get_info, get_all, get, append, patch_all, replace, patch, delete | Entity attribute management |
| `batch` | create, upsert, update, merge, delete, query, purge | Batch operations (up to 1,000 entities) |
| `temporal` | get, query, create, delete, add_attributes, delete_attribute, merge, modify_instance, delete_instance, batch_create, batch_upsert, batch_delete, batch_query | Time-series data management |
| `jsonld_contexts` | list, get, create, delete | JSON-LD context management |
| `admin` | list, get, create, update, delete, activate, deactivate, change_password | User, tenant, and policy management (auth required) |
| `data_models` | list_domains, list_models, get_model | Smart Data Models catalog browsing |

## Tenant and Service Path

### Tenant Selection

Each tool accepts a `tenant` parameter:

- **Auth disabled**: Defaults to `default` tenant if omitted
- **Auth enabled**: Defaults to the authenticated user's tenant. `super_admin` users can specify any tenant; `tenant_admin` and `user` roles are limited to their own tenant.

### Service Path

The `entities`, `types`, `attributes`, `batch`, and `temporal` tools accept a `servicePath` parameter for hierarchical entity scoping:

```text
# Entities under /hello
servicePath: "/hello"

# Hierarchical search: /Madrid/Gardens and all children
servicePath: "/Madrid/Gardens/#"

# Multiple paths (up to 10, comma-separated)
servicePath: "/park1, /park2"
```

::: warning
Write operations (create, update, delete) require a single, non-hierarchical service path. The `/#` suffix and comma-separated paths are only supported for read operations.
:::

## Testing with curl

You can test the MCP endpoint directly:

```bash
curl -X POST https://api.vela.geolonia.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer YOUR_API_KEY" \
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

## Limitations

- **Stateless mode**: Due to AWS Lambda constraints, SSE streaming is not available. All requests return JSON responses.
- **No session management**: Each request is processed independently. `GET /mcp` (SSE) and `DELETE /mcp` (session termination) return HTTP 405.
- **Authentication**: When `AUTH_ENABLED=true`, a valid Bearer token is required. When `AUTH_ENABLED=false`, no authentication is needed.

## Next Steps

- [llms.txt](/en/ai-integration/llms-txt) — LLM-optimized documentation endpoint
- [tools.json](/en/ai-integration/tools-json) — Tool definition schema for function calling
- [Examples](/en/ai-integration/examples) — Working code examples
