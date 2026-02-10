---
title: llms.txt
description: Vela OS provides an llms.txt endpoint that serves LLM-optimized API documentation in Markdown format at the root URL.
outline: deep
---

# llms.txt

Vela OS implements the [llms.txt standard](https://llmstxt.org/), serving a Markdown-formatted API documentation page at the root URL. This gives LLMs a concise, structured overview of the API that they can use to understand and interact with the Context Broker.

## Endpoint

| Property | Value |
|----------|-------|
| **URL** | `GET /` |
| **Format** | Markdown |
| **Content-Type** | `text/markdown` |
| **Authentication** | Not required |

## How It Works

When an AI agent (or any HTTP client) sends a `GET /` request, Vela OS returns a Markdown document that describes:

- The API's purpose and capabilities
- Available endpoints and their parameters
- Authentication requirements
- Example requests and responses

This document is dynamically generated based on the current server configuration, ensuring it always reflects the active API surface.

## Usage

### Direct Fetch

```bash
curl https://api.vela.geolonia.com/
```

The response is a Markdown document that an LLM can parse to understand the API.

### In AI Agent Workflows

AI agents can fetch the llms.txt content as a first step to discover the API:

```python
import requests

# Fetch API documentation
docs = requests.get("https://api.vela.geolonia.com/").text

# Pass to LLM as context
# The LLM can now understand the API structure and generate appropriate calls
```

## Why llms.txt?

Traditional API documentation (HTML pages, PDF) is designed for human reading. While OpenAPI specs are machine-readable, they can be verbose and complex for LLMs to process efficiently.

The llms.txt format provides a middle ground:

- **Concise** — Only the essential information an AI needs to use the API
- **Structured** — Markdown headings and tables for easy parsing
- **Dynamic** — Always reflects the current API configuration
- **Universal** — Any LLM can process Markdown without special tooling

## Related Endpoints

| Endpoint | Format | Use Case |
|----------|--------|----------|
| `GET /` | Markdown (llms.txt) | LLM-friendly overview |
| `GET /tools.json` | JSON | Structured tool definitions for function calling |
| `GET /openapi.json` | JSON | Full OpenAPI 3.0 specification |
| `GET /.well-known/ai-plugin.json` | JSON | AI plugin discovery manifest |

## Next Steps

- [tools.json](/en/ai-integration/tools-json) — Structured tool definitions for Claude and OpenAI
- [MCP Server](/en/ai-integration/mcp-server) — Direct MCP protocol access
- [Examples](/en/ai-integration/examples) — Working code examples
