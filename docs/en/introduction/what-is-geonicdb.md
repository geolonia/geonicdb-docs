---
title: What is GeonicDB?
description: An overview of GeonicDB — a FIWARE Orion-compatible serverless Context Broker running on AWS Lambda with dual API support, AI-native design, and geo-spatial extensions.
outline: deep
---

# What is GeonicDB?

GeonicDB is a **FIWARE Orion-compatible Context Broker** that runs on **AWS Lambda** with **MongoDB Atlas** as its data store. It provides full support for both **NGSIv2** and **NGSI-LD** APIs within a single deployment, enabling seamless management of IoT and smart city context data.

## Key Highlights

- **Serverless Architecture** — Built on AWS Lambda for automatic scaling and pay-per-use pricing. No infrastructure management required.
- **Dual API Support** — Both NGSIv2 and NGSI-LD are supported simultaneously. Entities created via one API can be accessed through the other.
- **AI-Native Design** — Ships with MCP (Model Context Protocol) server, llms.txt, tools.json, and OpenAPI 3.0 endpoints out of the box. AI agents can interact with your data directly.
- **Geo-Spatial Extensions** — Spatial ID (ZFXY), GeoJSON output, vector tiles (TileJSON 3.0), and CRS transformation are built in.
- **Enterprise Authentication** — JWT + RBAC + XACML policy-based authorization + OIDC external IdP integration, all built in without external components.
- **Real-Time Streaming** — WebSocket event streaming and MQTT native support for subscription notifications.
- **Data Catalog** — DCAT-AP / CKAN compatible API for open data portal integration.
- **Japan Government Standards** — CADDE (Cross-domain Data Exchange) connector and Spatial ID support aligned with Digital Agency / IPA guidelines.
- **FIWARE Ecosystem Compatibility** — Drop-in replacement for FIWARE Orion, compatible with the broader FIWARE ecosystem.

## How It Works

GeonicDB receives API requests through **AWS API Gateway**, which routes them to **AWS Lambda** functions. These functions process NGSI requests — entity CRUD, subscriptions, geo-queries, federation — and store data in **MongoDB Atlas**.

```text
Client Request
    ↓
API Gateway (HTTP / WebSocket)
    ↓
AWS Lambda (GeonicDB)
    ↓
MongoDB Atlas
```

Subscription notifications are processed asynchronously via **EventBridge** and **SQS FIFO** queues, ensuring ordered and reliable delivery through HTTP webhooks, MQTT, or WebSocket channels.

## Dual API: NGSIv2 and NGSI-LD

Unlike FIWARE Orion (NGSIv2 only) and Orion-LD (NGSI-LD only), GeonicDB supports **both APIs on the same instance**. A unified internal entity format ensures full interoperability:

| Feature | NGSIv2 | NGSI-LD |
|---------|--------|---------|
| Entity CRUD | `/v2/entities` | `/ngsi-ld/v1/entities` |
| Subscriptions | `/v2/subscriptions` | `/ngsi-ld/v1/subscriptions` |
| Batch Operations | `/v2/op/update`, `/v2/op/query` | `/ngsi-ld/v1/entityOperations/*` |
| Registrations | `/v2/registrations` | `/ngsi-ld/v1/csourceRegistrations` |
| Cross-API Access | ✅ | ✅ |

Data written through NGSIv2 can be read through NGSI-LD and vice versa, with automatic format transformation handled transparently.

## AI-Native Integration

GeonicDB is designed from the ground up for AI agent interaction:

- **MCP Server** (`POST /mcp`) — Streamable HTTP transport compatible with Claude Desktop and other MCP clients
- **llms.txt** (`GET /`) — Human-readable API documentation optimized for LLMs
- **tools.json** (`GET /tools.json`) — Tool definitions compatible with Claude Tool Use and OpenAI Function Calling
- **OpenAPI 3.0** (`GET /openapi.json`) — Standard API specification

These endpoints enable AI assistants to query, create, and manage IoT data without custom integration code.

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 20.x, TypeScript |
| Cloud | AWS Lambda, API Gateway, EventBridge, SQS |
| Database | MongoDB Atlas 8.0+ (Time Series Collections) |
| Notifications | HTTP Webhook, MQTT (QoS 0/1/2), WebSocket |
| Observability | OpenTelemetry, AWS X-Ray, Prometheus metrics |
| License | GPL v3.0 |

## SaaS Access

GeonicDB is available as a managed SaaS service. No installation or infrastructure setup is required.

- **API Endpoint**: `https://api.geonicdb.geolonia.com/v2/`
- **NGSI-LD Endpoint**: `https://api.geonicdb.geolonia.com/ngsi-ld/v1/`

::: tip Coming Soon
API key registration is currently being prepared. Check back soon for access details.
:::

## Next Steps

- [Why GeonicDB?](/en/introduction/why-geonicdb) — See how GeonicDB compares to FIWARE Orion
- [Architecture](/en/introduction/architecture) — Explore the system architecture in detail
- [Quick Start](/en/introduction/quick-start) — Try your first API call in minutes
