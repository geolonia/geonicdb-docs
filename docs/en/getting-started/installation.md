---
title: Installation & Setup
description: How to access the GeonicDB SaaS API — endpoint URLs, API key setup, recommended HTTP clients, and SDK availability.
outline: deep
---

# Installation & Setup

GeonicDB is provided as a managed SaaS service. There is no software to install — you access it through HTTP API calls.

## API Endpoints

| API | Base URL |
|-----|----------|
| **NGSIv2** | `https://api.geonicdb.geolonia.com/v2/` |
| **NGSI-LD** | `https://api.geonicdb.geolonia.com/ngsi-ld/v1/` |
| **Admin** | `https://api.geonicdb.geolonia.com/admin/` |
| **MCP** | `https://api.geonicdb.geolonia.com/mcp` |
| **Data Catalog** | `https://api.geonicdb.geolonia.com/catalog/` |
| **Health Check** | `https://api.geonicdb.geolonia.com/health` |
| **Version** | `https://api.geonicdb.geolonia.com/version` |

## API Key

All API requests require an `x-api-key` header for authentication.

::: tip Coming Soon
API key registration is currently being prepared. Once available, you will be able to:

1. Sign up at the GeonicDB dashboard
2. Create a project
3. Generate an API key
4. Use the key in the `x-api-key` header
:::

### Authentication Header

Include your API key in every request:

```bash
curl https://api.geonicdb.geolonia.com/v2/entities \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: myproject"
```

### Tenant Isolation

Use the `Fiware-Service` header to specify your tenant (project). Data is fully isolated between tenants.

```bash
# Tenant A data
curl https://api.geonicdb.geolonia.com/v2/entities \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: tenant-a"

# Tenant B data (completely separate)
curl https://api.geonicdb.geolonia.com/v2/entities \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: tenant-b"
```

## Recommended HTTP Clients

### curl (Command Line)

The simplest way to interact with GeonicDB. All examples in this documentation use curl.

```bash
# Verify connectivity
curl https://api.geonicdb.geolonia.com/version
```

### Postman

[Postman](https://www.postman.com/) provides a graphical interface for API exploration:

1. Set the base URL to `https://api.geonicdb.geolonia.com`
2. Add headers:
   - `x-api-key`: your API key
   - `Fiware-Service`: your tenant name
   - `Content-Type`: `application/json` (for POST/PATCH/PUT)
3. Import the OpenAPI spec for auto-generated request templates:
   ```text
   https://api.geonicdb.geolonia.com/openapi.json
   ```

### HTTPie

[HTTPie](https://httpie.io/) is a user-friendly alternative to curl:

```bash
# Install
pip install httpie

# Example request
http GET https://api.geonicdb.geolonia.com/v2/entities \
  x-api-key:YOUR_API_KEY \
  Fiware-Service:myproject
```

### VS Code REST Client

The [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) extension lets you send HTTP requests directly from VS Code:

```http
### Get all entities
GET https://api.geonicdb.geolonia.com/v2/entities
x-api-key: YOUR_API_KEY
Fiware-Service: myproject
```

## AI Agent Integration

### Claude Desktop (MCP)

Connect Claude Desktop to GeonicDB's MCP server for AI-powered data interaction:

```json
{
  "mcpServers": {
    "geonicdb": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://api.geonicdb.geolonia.com/mcp",
        "--header",
        "x-api-key: YOUR_API_KEY",
        "--header",
        "Fiware-Service: myproject"
      ]
    }
  }
}
```

### OpenAI / Claude API (tools.json)

Fetch the tool definitions for use with AI APIs:

```bash
curl https://api.geonicdb.geolonia.com/tools.json
```

The returned JSON can be used directly as tool definitions in Claude Tool Use or OpenAI Function Calling.

## SDK (Future)

::: info Planned
Official SDKs for the following languages are planned:

- **JavaScript / TypeScript** (npm)
- **Python** (pip)
- **Go** (module)

Until SDKs are available, use standard HTTP clients with the REST API.
:::

## Rate Limits

::: tip Coming Soon
Rate limit details will be published when the SaaS service launches. The API will use standard HTTP 429 (Too Many Requests) responses with `Retry-After` headers.
:::

## Next Steps

- [First Entity Tutorial](/en/getting-started/first-entity) — Create and manage your first entity
- [Demo App](/en/getting-started/demo-app) — Explore interactive demo applications
- [Quick Start](/en/introduction/quick-start) — Rapid CRUD walkthrough
