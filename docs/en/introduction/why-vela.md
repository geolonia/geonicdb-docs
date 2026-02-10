---
title: Why Vela?
description: A detailed comparison between Vela OS and FIWARE Orion Context Broker, highlighting the key differences in architecture, AI support, geo-spatial features, and more.
outline: deep
---

# Why Vela?

Vela OS is a modern alternative to FIWARE Orion, built from the ground up for cloud-native, AI-driven, and geo-spatial workloads. This page highlights the key differences.

## At a Glance

| Aspect | Vela OS | FIWARE Orion |
|--------|---------|--------------|
| **Language** | TypeScript / Node.js | C++ |
| **Architecture** | Serverless (AWS Lambda) | Monolithic (Docker) |
| **Database** | MongoDB Atlas | MongoDB |
| **API Support** | NGSIv2 + NGSI-LD (single instance) | NGSIv2 (Orion) or NGSI-LD (Orion-LD) |
| **Scaling** | Automatic (Lambda) | Manual (container orchestration) |
| **Pricing** | Pay-per-use | Fixed infrastructure cost |
| **License** | GPL v3.0 | AGPL v3.0 |

## 9 Key Differentiators

### 1. Serverless Architecture

Vela runs on AWS Lambda — no servers to provision, patch, or scale. Lambda automatically handles traffic spikes, and you only pay for actual API invocations.

| | Vela OS | Orion |
|---|---------|-------|
| Deployment | AWS Lambda + API Gateway | Docker containers |
| Scaling | Automatic, per-request | Manual, container-level |
| Cost model | Pay-per-invocation | Fixed server cost |
| Maintenance | Managed by AWS | Self-managed |

### 2. AI-Native Design

Vela ships with four AI integration endpoints out of the box. No plugins or external tools needed.

| Endpoint | Purpose | Orion Support |
|----------|---------|---------------|
| `POST /mcp` | MCP server for Claude Desktop / AI agents | ❌ |
| `GET /` | llms.txt — LLM-readable API docs | ❌ |
| `GET /tools.json` | Tool definitions for Claude / OpenAI | ❌ |
| `GET /openapi.json` | OpenAPI 3.0 specification | ✅ |

With Vela, AI assistants can directly query, create, and manage IoT entities through standardized tool interfaces.

### 3. Geo-Spatial Extensions

Beyond standard NGSI geo-queries, Vela adds Japan-specific spatial features and modern map integration.

| Feature | Vela OS | Orion |
|---------|---------|-------|
| Standard geo-queries (near, within, intersects, etc.) | ✅ | ✅ |
| Spatial ID (ZFXY) — Japan Digital Agency standard | ✅ | ❌ |
| Vector tiles (TileJSON 3.0) | ✅ | ❌ |
| GeoJSON output | ✅ | ✅ |
| CRS transformation | ✅ | ❌ |
| Auto-clustering for map display | ✅ | ❌ |

### 4. CADDE Integration (Japan Data Exchange)

Vela natively supports Japan's Cross-domain Data Exchange platform (CADDE), enabling interoperability with government data systems.

- `x-cadde-*` request headers for resource identification
- Provenance information headers (`x-cadde-provenance-*`)
- Bearer authentication for CADDE connectors

FIWARE Orion does not support CADDE.

### 5. Dual API (NGSIv2 + NGSI-LD)

Orion supports NGSIv2 only. Orion-LD supports NGSI-LD only. Vela supports **both on the same instance** with full cross-API interoperability.

- Write an entity via NGSIv2 → read it via NGSI-LD
- Write an entity via NGSI-LD → read it via NGSIv2
- Unified internal format handles all transformations automatically

This means existing NGSIv2 applications can coexist with new NGSI-LD services, enabling gradual migration.

### 6. Built-in Enterprise Authentication

Vela includes a complete authentication and authorization system. Orion requires external components (Keyrock, Wilma PEP Proxy).

| Feature | Vela OS | Orion |
|---------|---------|-------|
| JWT authentication | ✅ Built-in | ❌ Requires Keyrock |
| RBAC (3 roles) | ✅ Built-in | ❌ Requires PEP Proxy |
| XACML policy sets | ✅ Built-in | ❌ |
| OIDC external IdP | ✅ Built-in | ❌ |
| IP whitelisting | ✅ Built-in | ❌ |
| OAuth 2.0 (M2M) | ✅ Built-in | ❌ Requires Keyrock |

### 7. Real-Time WebSocket Streaming

Vela provides WebSocket-based event streaming for real-time entity change notifications, in addition to standard HTTP webhook and MQTT delivery.

| Notification Channel | Vela OS | Orion |
|---------------------|---------|-------|
| HTTP Webhook | ✅ | ✅ |
| MQTT (QoS 0/1/2, TLS) | ✅ | ✅ |
| WebSocket streaming | ✅ | ❌ |
| SQS FIFO (ordered delivery) | ✅ | ❌ |
| Dead Letter Queue | ✅ | ❌ |

### 8. Data Catalog

Vela includes a built-in data catalog API compatible with EU and open data standards.

| Feature | Vela OS | Orion |
|---------|---------|-------|
| DCAT-AP JSON-LD catalog | ✅ | ❌ |
| CKAN compatible API | ✅ | ❌ |
| CKAN harvester support | ✅ | ❌ |
| Dataset sample endpoint | ✅ | ❌ |

### 9. SaaS API Access

Vela OS is available as a managed SaaS — no deployment, no infrastructure, no maintenance. Just call the API.

| | Vela OS | Orion |
|---|---------|-------|
| SaaS availability | ✅ | ❌ |
| Self-hosted option | AWS Lambda | Docker / Kubernetes |
| Getting started | API key + curl | Clone → Docker Compose → configure |

## When to Choose Vela

Vela OS is the right choice when you need:

- **Serverless / auto-scaling** — Variable traffic, pay-per-use
- **AI integration** — LLM agents interacting with IoT data
- **Dual API** — NGSIv2 + NGSI-LD coexistence
- **Japan standards** — CADDE, Spatial ID (ZFXY)
- **Built-in auth** — No external identity management setup
- **Real-time streaming** — WebSocket for browser-based dashboards
- **Data catalog** — DCAT-AP / CKAN integration

## When to Choose Orion

FIWARE Orion may be a better fit when you need:

- **On-premises deployment** — Air-gapped or regulated environments
- **Existing FIWARE ecosystem** — Tight integration with Keyrock, Wilma, Cygnus, etc.
- **Docker / Kubernetes** — Standard container orchestration
- **Multi-cloud** — AWS, GCP, Azure, or hybrid environments

## Next Steps

- [Architecture](/en/introduction/architecture) — Understand how Vela is built
- [Quick Start](/en/introduction/quick-start) — Make your first API call
- [Orion to Vela Migration](/en/migration/orion-to-vela) — Step-by-step migration guide
