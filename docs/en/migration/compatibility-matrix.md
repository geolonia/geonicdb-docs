---
title: Compatibility Matrix
description: Detailed compatibility matrix between FIWARE Orion and Vela OS, covering NGSIv2, NGSI-LD, geospatial, subscription, and authentication APIs.
outline: deep
---

# Compatibility Matrix

This page provides a detailed comparison of API compatibility between **FIWARE Orion** (NGSIv2) / **Orion-LD** (NGSI-LD) and **Vela OS**.

## Overview

| Property | Vela OS | FIWARE Orion |
|----------|---------|-------------|
| **Implementation** | TypeScript / Node.js | C++ |
| **Architecture** | Serverless (AWS Lambda) | Monolithic (Docker) |
| **Database** | MongoDB Atlas | MongoDB |
| **License** | GPL v3.0 | AGPL v3.0 |
| **Supported APIs** | NGSIv2 + NGSI-LD | NGSIv2 (Orion) / NGSI-LD (Orion-LD) |
| **Scaling** | Automatic (Lambda) | Manual (containers) |

## NGSIv2 API Compatibility

All standard NGSIv2 endpoints are fully supported:

| Endpoint | Vela | Orion | Notes |
|----------|:----:|:-----:|-------|
| `POST /v2/entities` | ✅ | ✅ | Entity creation |
| `GET /v2/entities` | ✅ | ✅ | Entity listing |
| `GET /v2/entities/{id}` | ✅ | ✅ | Entity retrieval |
| `DELETE /v2/entities/{id}` | ✅ | ✅ | Entity deletion |
| `PATCH /v2/entities/{id}/attrs` | ✅ | ✅ | Attribute update |
| `POST /v2/entities/{id}/attrs` | ✅ | ✅ | Attribute append |
| `PUT /v2/entities/{id}/attrs` | ✅ | ✅ | Attribute replace |
| `GET /v2/entities/{id}/attrs/{attr}` | ✅ | ✅ | Attribute get |
| `PUT /v2/entities/{id}/attrs/{attr}` | ✅ | ✅ | Attribute update |
| `DELETE /v2/entities/{id}/attrs/{attr}` | ✅ | ✅ | Attribute delete |
| `GET /v2/entities/{id}/attrs/{attr}/value` | ✅ | ✅ | Attribute value get |
| `PUT /v2/entities/{id}/attrs/{attr}/value` | ✅ | ✅ | Attribute value update |
| `POST /v2/op/update` | ✅ | ✅ | Batch update |
| `POST /v2/op/query` | ✅ | ✅ | Batch query |
| `POST /v2/op/notify` | ✅ | ✅ | Notification receipt |
| `GET /v2/types` | ✅ | ✅ | Entity type listing |
| `GET /v2/types/{type}` | ✅ | ✅ | Entity type detail |
| `POST /v2/subscriptions` | ✅ | ✅ | Subscription creation |
| `GET /v2/subscriptions` | ✅ | ✅ | Subscription listing |
| `GET /v2/subscriptions/{id}` | ✅ | ✅ | Subscription detail |
| `PATCH /v2/subscriptions/{id}` | ✅ | ✅ | Subscription update |
| `DELETE /v2/subscriptions/{id}` | ✅ | ✅ | Subscription delete |
| `POST /v2/registrations` | ✅ | ✅ | Registration creation |
| `GET /v2/registrations` | ✅ | ✅ | Registration listing |
| `PATCH /v2/registrations/{id}` | ✅ | ✅ | Registration update |
| `DELETE /v2/registrations/{id}` | ✅ | ✅ | Registration delete |
| `GET /version` | ✅ | ✅ | Version info |

## NGSI-LD API Compatibility

| Endpoint | Vela | Orion-LD | Notes |
|----------|:----:|:--------:|-------|
| `POST /ngsi-ld/v1/entities` | ✅ | ✅ | Entity creation |
| `GET /ngsi-ld/v1/entities` | ✅ | ✅ | Entity listing |
| `GET /ngsi-ld/v1/entities/{id}` | ✅ | ✅ | Entity retrieval |
| `PUT /ngsi-ld/v1/entities/{id}` | ✅ | ✅ | Entity replace |
| `PATCH /ngsi-ld/v1/entities/{id}` | ✅ | ✅ | Entity update (merge-patch) |
| `DELETE /ngsi-ld/v1/entities/{id}` | ✅ | ✅ | Entity deletion |
| `POST /ngsi-ld/v1/entityOperations/create` | ✅ | ✅ | Batch create |
| `POST /ngsi-ld/v1/entityOperations/upsert` | ✅ | ✅ | Batch upsert |
| `POST /ngsi-ld/v1/entityOperations/update` | ✅ | ✅ | Batch update |
| `POST /ngsi-ld/v1/entityOperations/delete` | ✅ | ✅ | Batch delete |
| `POST /ngsi-ld/v1/entityOperations/query` | ✅ | ✅ | Batch query |
| Subscriptions CRUD | ✅ | ✅ | Full lifecycle |
| CSR CRUD | ✅ | ✅ | Context Source Registrations |
| `POST /ngsi-ld/v1/csourceSubscriptions` | ✅ | ❌ | CSR subscriptions (Vela only) |
| Temporal API | ✅ | ⚠️ | Limited in Orion-LD |
| JSON-LD context management | ✅ | ✅ | `/ngsi-ld/v1/jsonldContexts` |
| EntityMap operations | ✅ | ❌ | Vela only |
| Snapshot operations | ✅ | ❌ | Vela only |
| Vector tiles | ✅ | ❌ | Vela only |

## Query Features

| Feature | Vela | Orion | Notes |
|---------|:----:|:-----:|-------|
| Simple Query Language (`q`) | ✅ | ✅ | |
| Comparison operators | ✅ | ✅ | `==`, `!=`, `<`, `>`, `<=`, `>=` |
| Logical operators | ✅ | ✅ | `;` (AND), `\|` (OR) |
| Range queries (`..`) | ✅ | ✅ | |
| Pattern matching (`~=`) | ✅ | ✅ | Regex support |
| `idPattern` | ✅ | ✅ | Regex |
| `typePattern` | ✅ | ✅ | Regex |
| Scope query (`scopeQ`) | ✅ | ✅ | NGSI-LD hierarchical scoping |
| Pagination (`limit`, `offset`) | ✅ | ✅ | Max 1,000 per request |
| Output formats (`keyValues`, `values`, `unique`) | ✅ | ✅ | |
| Attribute selection (`attrs`) | ✅ | ✅ | |
| Ordering (`orderBy`) | ✅ | ✅ | |

## Geospatial Features

| Feature | Vela | Orion | Notes |
|---------|:----:|:-----:|-------|
| `georel=near` | ✅ | ✅ | Point geometry only |
| `georel=within` | ✅ | ✅ | |
| `georel=coveredBy` | ✅ | ✅ | |
| `georel=intersects` | ✅ | ✅ | |
| `georel=disjoint` | ✅ | ✅ | |
| `georel=equals` | ✅ | ✅ | |
| `georel=contains` | ✅ | ✅ | |
| GeoJSON output | ✅ | ✅ | `options=geojson` |
| Vector tiles | ✅ | ❌ | TileJSON 3.0 |
| Spatial ID (ZFXY) | ✅ | ❌ | Digital Agency standard |

## Subscription / Notification Features

| Feature | Vela | Orion | Notes |
|---------|:----:|:-----:|-------|
| HTTP Webhook | ✅ | ✅ | |
| MQTT | ✅ | ✅ | |
| WebSocket streaming | ✅ | ❌ | Vela only |
| Custom headers | ✅ | ✅ | |
| Custom payload template | ✅ | ✅ | Macro substitution |
| `httpCustom.json` | ❌ | ✅ | Planned for Vela |
| `httpCustom.ngsi` | ❌ | ✅ | Planned for Vela |
| JEXL expressions | ❌ | ✅ | Planned for Vela |
| Throttling | ✅ | ✅ | |
| Expiration | ✅ | ✅ | |
| `onlyChangedAttrs` | ✅ | ✅ | |
| Ordered delivery | ✅ (SQS FIFO) | ⚠️ | Limited in Orion |
| Dead Letter Queue | ✅ | ❌ | Vela only |

## Authentication / Authorization

| Feature | Vela | Orion | Notes |
|---------|:----:|:-----:|-------|
| Built-in JWT auth | ✅ | ❌ | |
| RBAC (roles) | ✅ | ❌ | super_admin, tenant_admin, user |
| OIDC external IdP | ✅ | ❌ | |
| XACML policies | ✅ | ❌ | |
| Keyrock IdM | ⚠️ | ✅ | API-compatible (untested) |
| Wilma PEP Proxy | ⚠️ | ✅ | API-compatible (untested) |
| Multi-tenancy headers | ✅ | ✅ | Fiware-Service / Fiware-ServicePath |

## Vela-Only Features

The following features are available exclusively in Vela OS:

| Feature | Description |
|---------|-------------|
| MCP Server | Model Context Protocol endpoint (`POST /mcp`) |
| llms.txt | LLM-optimized API documentation (`GET /`) |
| tools.json | AI tool definitions (`GET /tools.json`) |
| Spatial ID (ZFXY) | 3D spatial identification |
| Vector Tiles | TileJSON 3.0 GeoJSON tiles |
| CADDE Integration | Cross-domain data exchange |
| DCAT-AP Catalog | EU data portal standard |
| CKAN Compatible API | Open data portal integration |
| WebSocket Streaming | Real-time entity change events |
| Snapshots | Point-in-time entity snapshots |
| EntityMap | Entity mapping and transformation |
| Dead Letter Queue | Failed notification isolation |

## Next Steps

- [Orion to Vela Guide](/en/migration/orion-to-vela) — Step-by-step migration instructions
