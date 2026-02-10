---
title: AI Integration Overview
description: Vela OS is an AI-native Context Broker that provides multiple interfaces for AI agents — MCP server, llms.txt, tools.json, and OpenAPI 3.0.
outline: deep
---

# AI Integration Overview

Vela OS is designed from the ground up as an **AI-native Context Broker**. It provides multiple standardized interfaces that allow AI agents (Claude, GPT-4, Gemini, and others) to discover, query, and manage IoT context data without custom integration code.

## Three Pillars of AI Integration

Vela OS exposes three complementary AI interfaces, each serving a different purpose:

| Endpoint | Format | Purpose |
|----------|--------|---------|
| `GET /` | Markdown ([llms.txt](https://llmstxt.org/)) | Human-readable API documentation optimized for LLMs |
| `GET /tools.json` | JSON | Tool definitions for Claude Tool Use / OpenAI Function Calling |
| `POST /mcp` | JSON-RPC ([MCP](https://modelcontextprotocol.io/)) | Direct agent-to-broker communication via Model Context Protocol |

In addition, standard machine-readable specs are available:

| Endpoint | Format | Purpose |
|----------|--------|---------|
| `GET /openapi.json` | JSON | OpenAPI 3.0 specification |
| `GET /.well-known/ai-plugin.json` | JSON | AI plugin manifest for API discovery |

## How AI Agents Use Vela

### 1. Discovery

An AI agent first discovers Vela's capabilities by fetching `GET /` (llms.txt) or `GET /tools.json`. These endpoints describe the available operations, parameters, and authentication requirements in a format the agent can understand.

### 2. Interaction

The agent then interacts with Vela through one of two paths:

- **MCP Protocol** — The agent connects via `POST /mcp` using the Model Context Protocol. This is the preferred method for MCP-compatible clients like Claude Desktop, as it provides a structured tool-calling interface with 8 built-in tools.
- **Direct API Calls** — The agent calls NGSIv2 or NGSI-LD endpoints directly, using the schema from `tools.json` or `openapi.json` to construct requests.

### 3. Data Operations

Through either path, the agent can perform the full range of NGSI operations:

- **Query** entities by type, ID, attribute, location, or temporal range
- **Create** new entities with automatic NGSI-LD attribute type detection
- **Update** existing entities (append, patch, replace)
- **Subscribe** to entity changes via webhooks, MQTT, or WebSocket
- **Manage** tenants, users, and access policies (with authentication)

## Available MCP Tools

Vela's MCP server exposes **8 tools**, each supporting multiple actions via an `action` parameter:

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

## NGSI-LD Attribute Type Auto-Detection

When creating or updating entities through MCP tools, Vela automatically infers the NGSI-LD attribute type from the value:

| Value Pattern | Detected Type | Example |
|--------------|---------------|---------|
| String starting with `urn:` | `Relationship` | `"urn:ngsi-ld:Building:001"` |
| GeoJSON object (Point, Polygon, etc.) | `GeoProperty` | `{"type": "Point", "coordinates": [139.7, 35.6]}` |
| Object with `languageMap` field | `LanguageProperty` | `{"languageMap": {"en": "Hello", "ja": "こんにちは"}}` |
| All other values | `Property` | `25.5`, `"text"`, `true`, `[1, 2, 3]` |

You can also specify types explicitly:

```json
{"type": "Property", "value": 25.5}
{"type": "Relationship", "object": "urn:ngsi-ld:Building:001"}
{"type": "GeoProperty", "value": {"type": "Point", "coordinates": [139.7, 35.6]}}
```

## Authentication

When `AUTH_ENABLED=true`, AI agents must include authentication credentials:

- **MCP**: Pass a JWT Bearer token in the `Authorization` header of the `POST /mcp` request
- **Direct API**: Include the `Authorization: Bearer <token>` header with each request
- **Tenant Isolation**: Each tool accepts a `tenant` parameter. Authenticated users default to their assigned tenant; `super_admin` users can access any tenant.

## Next Steps

- [MCP Server](/en/ai-integration/mcp-server) — Configure MCP access for Claude Desktop and other clients
- [llms.txt](/en/ai-integration/llms-txt) — Learn about the LLM-optimized documentation endpoint
- [tools.json](/en/ai-integration/tools-json) — Explore the tool definition schema
- [Examples](/en/ai-integration/examples) — See working code examples with Python SDKs
