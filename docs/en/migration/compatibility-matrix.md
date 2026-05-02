---
title: "Compatibility Matrix"
description: "Feature comparison with FIWARE Orion"
outline: deep
---
# GeonicDB vs FIWARE Orion Feature Comparison

This document compares the features of GeonicDB and FIWARE Orion Context Broker.

## Overview

| Item | GeonicDB | FIWARE Orion |
|------|-------------------|--------------|
| **Implementation language** | TypeScript/Node.js | C++ |
| **Architecture** | Serverless (AWS Lambda) | Monolithic (Docker) |
| **Database** | MongoDB Atlas | MongoDB |
| **License** | AGPL v3.0 | AGPL v3.0 |
| **Supported APIs** | NGSIv2 + NGSI-LD | NGSIv2 (Orion) / NGSI-LD (Orion-LD) |
| **Scalability** | Auto-scaling (Lambda) | Manual scaling (container) |
| **Cost** | Pay-per-use | Fixed infrastructure cost |

## API Support Status

### NGSIv2 API

| Feature | GeonicDB | FIWARE Orion | Notes |
|---------|:------------------:|:------------:|-------|
| `POST /v2/entities` | ✅ | ✅ | Create entity |
| `GET /v2/entities` | ✅ | ✅ | List entities |
| `GET /v2/entities/{id}` | ✅ | ✅ | Get entity |
| `DELETE /v2/entities/{id}` | ✅ | ✅ | Delete entity |
| `PATCH /v2/entities/{id}/attrs` | ✅ | ✅ | Update attributes |
| `POST /v2/entities/{id}/attrs` | ✅ | ✅ | Add attributes |
| `PUT /v2/entities/{id}/attrs` | ✅ | ✅ | Replace attributes |
| `GET /v2/entities/{id}/attrs/{attr}` | ✅ | ✅ | Get attribute |
| `PUT /v2/entities/{id}/attrs/{attr}` | ✅ | ✅ | Update attribute |
| `DELETE /v2/entities/{id}/attrs/{attr}` | ✅ | ✅ | Delete attribute |
| `GET /v2/entities/{id}/attrs/{attr}/value` | ✅ | ✅ | Get attribute value directly |
| `PUT /v2/entities/{id}/attrs/{attr}/value` | ✅ | ✅ | Update attribute value directly |
| `POST /v2/op/update` | ✅ | ✅ | Batch update |
| `POST /v2/op/query` | ✅ | ✅ | Batch query |
| `POST /v2/op/notify` | ✅ | ✅ | Receive notification |
| `GET /v2/types` | ✅ | ✅ | List entity types |
| `GET /v2/types/{type}` | ✅ | ✅ | Get entity type |
| `POST /v2/subscriptions` | ✅ | ✅ | Create subscription |
| `GET /v2/subscriptions` | ✅ | ✅ | List subscriptions |
| `GET /v2/subscriptions/{id}` | ✅ | ✅ | Get subscription |
| `PATCH /v2/subscriptions/{id}` | ✅ | ✅ | Update subscription |
| `DELETE /v2/subscriptions/{id}` | ✅ | ✅ | Delete subscription |
| `POST /v2/registrations` | ✅ | ✅ | Create registration |
| `GET /v2/registrations` | ✅ | ✅ | List registrations |
| `GET /v2/registrations/{id}` | ✅ | ✅ | Get registration |
| `PATCH /v2/registrations/{id}` | ✅ | ✅ | Update registration |
| `DELETE /v2/registrations/{id}` | ✅ | ✅ | Delete registration |
| `GET /version` | ✅ | ✅ | Version information |

### NGSI-LD API

| Feature | GeonicDB | FIWARE Orion-LD | Notes |
|---------|:------------------:|:---------------:|-------|
| `POST /ngsi-ld/v1/entities` | ✅ | ✅ | Create entity |
| `GET /ngsi-ld/v1/entities` | ✅ | ✅ | List entities |
| `GET /ngsi-ld/v1/entities/{id}` | ✅ | ✅ | Get entity |
| `PUT /ngsi-ld/v1/entities/{id}` | ✅ | ✅ | Replace entity |
| `PATCH /ngsi-ld/v1/entities/{id}` | ✅ | ✅ | Update entity (supports merge-patch+json, urn:ngsi-ld:null, keyValues/concise input) |
| `POST /ngsi-ld/v1/entities/{id}` | ✅ | ✅ | Add attributes |
| `DELETE /ngsi-ld/v1/entities/{id}` | ✅ | ✅ | Delete entity |
| `GET /ngsi-ld/v1/entities/{id}/attrs` | ✅ | ✅ | Get all attributes |
| `GET /ngsi-ld/v1/entities/{id}/attrs/{attr}` | ✅ | ✅ | Get attribute |
| `POST /ngsi-ld/v1/entities/{id}/attrs/{attr}` | ✅ | ✅ | Replace attribute |
| `PATCH /ngsi-ld/v1/entities/{id}/attrs/{attr}` | ✅ | ✅ | Partially update attribute |
| `DELETE /ngsi-ld/v1/entities/{id}/attrs/{attr}` | ✅ | ✅ | Delete attribute |
| `POST /ngsi-ld/v1/entityOperations/create` | ✅ | ✅ | Batch create |
| `POST /ngsi-ld/v1/entityOperations/upsert` | ✅ | ✅ | Batch create/update |
| `POST /ngsi-ld/v1/entityOperations/update` | ✅ | ✅ | Batch update |
| `POST /ngsi-ld/v1/entityOperations/delete` | ✅ | ✅ | Batch delete |
| `POST /ngsi-ld/v1/entityOperations/query` | ✅ | ✅ | Batch query |
| `POST /ngsi-ld/v1/subscriptions` | ✅ | ✅ | Create subscription |
| `GET /ngsi-ld/v1/subscriptions` | ✅ | ✅ | List subscriptions |
| `GET /ngsi-ld/v1/subscriptions/{id}` | ✅ | ✅ | Get subscription |
| `PATCH /ngsi-ld/v1/subscriptions/{id}` | ✅ | ✅ | Update subscription |
| `DELETE /ngsi-ld/v1/subscriptions/{id}` | ✅ | ✅ | Delete subscription |
| `POST /ngsi-ld/v1/csourceRegistrations` | ✅ | ✅ | Create registration |
| `GET /ngsi-ld/v1/csourceRegistrations` | ✅ | ✅ | List registrations |
| `GET /ngsi-ld/v1/csourceRegistrations/{id}` | ✅ | ✅ | Get registration |
| `PATCH /ngsi-ld/v1/csourceRegistrations/{id}` | ✅ | ✅ | Update registration |
| `DELETE /ngsi-ld/v1/csourceRegistrations/{id}` | ✅ | ✅ | Delete registration |
| `POST /ngsi-ld/v1/csourceSubscriptions` | ✅ | ❌ | Create CSR subscription (*) |
| `GET /ngsi-ld/v1/csourceSubscriptions` | ✅ | ❌ | List CSR subscriptions (*) |
| `GET /ngsi-ld/v1/csourceSubscriptions/{id}` | ✅ | ❌ | Get CSR subscription (*) |
| `PATCH /ngsi-ld/v1/csourceSubscriptions/{id}` | ✅ | ❌ | Update CSR subscription (*) |
| `DELETE /ngsi-ld/v1/csourceSubscriptions/{id}` | ✅ | ❌ | Delete CSR subscription (*) |
| `GET /ngsi-ld/v1/attributes` | ✅ | ✅ | List attributes |
| `GET /ngsi-ld/v1/attributes/{attrName}` | ✅ | ✅ | Attribute details |
| `GET /.well-known/ngsi-ld` | ✅ | ✅ | API discovery |
| JSON-LD @context support | ✅ | ✅ | Linked Data context |
| **Temporal API** | ✅ | ⚠️ Limited | Time-series data management |
| **JSON-LD context management** | ✅ | ✅ | `/ngsi-ld/v1/jsonldContexts` |
| **EntityMap operations** | ✅ | ❌ | Entity mapping and transformation |
| **Snapshot operations** | ✅ | ❌ | Point-in-time snapshots |
| **Conformance information** | ✅ | ✅ | `/ngsi-ld/v1/info/conformance` |
| **Source identity** | ✅ | ✅ | `/ngsi-ld/v1/info/sourceIdentity` |
| **Vector tiles** | ✅ | ❌ | `/ngsi-ld/v1/tiles` GeoJSON vector tiles |

> **Note on csourceSubscriptions**
> The Context Source Registration (CSR) subscription feature is defined in the ETSI GS CIM 009 specification. GeonicDB provides a spec-compliant implementation, while Orion-LD does not currently implement it (implementation planned; see [Orion-LD Issue #280](https://github.com/FIWARE/context.Orion-LD/issues/280)).

### NGSI-LD Attribute Types

| Feature | GeonicDB | FIWARE Orion-LD | Notes |
|---------|:------------------:|:---------------:|-------|
| Property | ✅ | ✅ | Basic attribute |
| Relationship | ✅ | ✅ | Inter-entity association |
| GeoProperty | ✅ | ✅ | Geospatial attribute |
| LanguageProperty | ✅ | ✅ | Multilingual attribute |
| JsonProperty | ✅ | ✅ | JSON value attribute |
| VocabProperty | ✅ | ✅ | Vocabulary attribute (vocab/vocabMap) |
| ListProperty | ✅ | ✅ | List value attribute |
| ListRelationship | ✅ | ✅ | List relationship attribute |
| TemporalProperty | ✅ | ✅ | Temporal attribute |
| **Multi-attribute** | ✅ | ✅ | Multiple instances via datasetId |
| `datasetId` query parameter | ✅ | ✅ | Delete a specific instance |
| `deleteAll` query parameter | ✅ | ✅ | Delete all instances |

### NGSI-LD Output Formats

| Feature | GeonicDB | FIWARE Orion-LD | Notes |
|---------|:------------------:|:---------------:|-------|
| normalized | ✅ | ✅ | Full format (default) |
| concise | ✅ | ✅ | Concise format (type omitted) |
| keyValues / simplified | ✅ | ✅ | Values only |

## Query Features

| Feature | GeonicDB | FIWARE Orion | Notes |
|---------|:------------------:|:------------:|-------|
| **Simple Query Language (q)** | ✅ | ✅ | |
| Comparison operators (`==`, `!=`, `<`, `>`, `<=`, `>=`) | ✅ | ✅ | |
| Logical operators (`;` AND, `\|` OR) | ✅ | ✅ | |
| Range query (`..`) | ✅ | ✅ | |
| Pattern match (`~=`) | ✅ | ✅ | Regular expression support |
| `idPattern` (regular expression) | ✅ | ✅ | |
| `typePattern` (regular expression) | ✅ | ✅ | |
| **Scope query (NGSI-LD)** | ✅ | ✅ | |
| `scopeQ` parameter | ✅ | ✅ | Entity classification and search by hierarchical scope |
| Exact match (`/path`) | ✅ | ✅ | |
| All descendants (`/path/#`) | ✅ | ✅ | |
| Direct children (`/path/+`) | ✅ | ✅ | |
| OR condition (`;`) | ✅ | ✅ | |
| **Pagination** | ✅ | ✅ | |
| `limit` parameter | ✅ (max: 1000) | ✅ (max: 1000) | |
| `offset` parameter | ✅ | ✅ | |
| **Output formats** | | | |
| `keyValues` | ✅ | ✅ | Simplified format |
| `values` | ✅ | ✅ | Values only |
| `unique` | ✅ | ✅ | Deduplicate when combined with `values` |
| `sysAttrs` | ✅ | ✅ | Include system attributes (dateCreated, dateModified) |
| `normalized` (default) | ✅ | ✅ | Full format |
| **Attribute selection** | | | |
| `attrs` parameter | ✅ | ✅ | Attributes to include |
| `metadata` parameter | ✅ | ✅ | Metadata output control (on/off) |
| **Sorting** | | | |
| `orderBy` parameter | ✅ | ✅ | Sort by entityId, entityType, modifiedAt |
| `orderDirection` parameter | ✅ | ✅ | Specify sort direction with asc/desc |

## Geospatial Features

| Feature | GeonicDB | FIWARE Orion | Notes |
|---------|:------------------:|:------------:|-------|
| **Geo-queries** | ✅ | ✅ | |
| `georel=near` | ✅ | ✅ | Point geometry only, no distance sorting |
| `georel=within` | ✅ | ✅ | |
| `georel=coveredBy` | ✅ | ✅ | |
| `georel=intersects` | ✅ | ✅ | |
| `georel=disjoint` | ✅ | ✅ | |
| `georel=equals` | ✅ | ✅ | |
| `georel=contains` | ✅ | ✅ | |
| **Geometry types** | | | |
| Point | ✅ | ✅ | |
| LineString | ✅ | ✅ | |
| Polygon | ✅ | ✅ | |
| Box | ✅ | ✅ | Bounding box (rectangular area specified by 2 points) |
| MultiPoint | ✅ | ✅ | |
| MultiLineString | ✅ | ✅ | |
| MultiPolygon | ✅ | ✅ | |
| **GeoJSON output** | ✅ | ✅ | `options=geojson` |
| **Vector tiles** | ✅ | ❌ | TileJSON 3.0 compliant, automatic clustering |
| **Spatial ID (ZFXY)** | ✅ | ❌ | Japan Digital Agency standard |

## Subscription/Notification Features

| Feature | GeonicDB | FIWARE Orion | Notes |
|---------|:------------------:|:------------:|-------|
| **Subject conditions** | | | |
| Entity ID specification | ✅ | ✅ | |
| Entity ID pattern | ✅ | ✅ | Regular expression |
| Entity type specification | ✅ | ✅ | |
| Entity type pattern | ✅ | ✅ | Regular expression |
| Attribute condition (`attrs`) | ✅ | ✅ | |
| Query language condition (`q`) | ✅ | ✅ | |
| Geo condition | ✅ | ✅ | |
| **Notification settings** | | | |
| HTTP Webhook | ✅ | ✅ | |
| MQTT | ✅ | ✅ | |
| **WebSocket event streaming** | ✅ | ❌ | Real-time entity change delivery |
| Custom headers | ✅ | ✅ | |
| `httpCustom.method` | ✅ | ✅ | Custom HTTP method |
| `httpCustom.qs` | ✅ | ✅ | Query string parameters (macro substitution supported) |
| `httpCustom.payload` | ✅ | ✅ | Custom payload template (macro substitution supported) |
| Macro substitution (`${id}`, `${type}`, `${attr}`) | ✅ | ✅ | Usable in payload/qs |
| `httpCustom.json` | ❌ | ✅ | JSON template (planned for future support) |
| `httpCustom.ngsi` | ❌ | ✅ | NGSI patch (planned for future support) |
| JEXL expressions | ❌ | ✅ | Planned for future support |
| `attrsFormat` | ✅ | ✅ | |
| `exceptAttrs` | ✅ | ✅ | |
| `onlyChangedAttrs` | ✅ | ✅ | Include only changed attributes in notification |
| **Control** | | | |
| `expires` (expiry) | ✅ | ✅ | |
| `throttling` | ✅ | ✅ | |
| `status` (pause) | ✅ | ✅ | |
| **Statistics** | | | |
| `timesSent` | ✅ | ✅ | |
| `lastNotification` | ✅ | ✅ | |
| `lastFailure` | ✅ | ✅ | |
| `lastSuccess` | ✅ | ✅ | |
| **Notification delivery** | | | |
| Ordering guarantee | ✅ (SQS FIFO) | ⚠️ Limited | |
| Retry functionality | ✅ | ✅ | |
| Dead Letter Queue | ✅ | ❌ | |

## Registration / Context Providers

| Feature | GeonicDB | FIWARE Orion | Notes |
|---------|:------------------:|:------------:|-------|
| **Registration CRUD** | ✅ | ✅ | |
| Entity type registration | ✅ | ✅ | |
| Attribute registration | ✅ | ✅ | |
| **Federation query** | ✅ | ✅ | Distributed query forwarding (getEntity/queryEntities) |
| **Federation update** | ✅ | ✅ | Distributed update forwarding (updateEntity/deleteEntity/deleteAttribute) |
| **Distributed operation features** | | | |
| CSR change notification (Ngsild-Trigger) | ✅ | ❌ | Automatic notification on CSR create/update/delete (ETSI GS CIM 009 - 5.11) |
| Loop detection (Via header) | ✅ | ❌ | Loop prevention for distributed federation (ETSI GS CIM 009 - 6.3.5) |
| Warning header (NGSILD-Warning) | ✅ | ❌ | Warning propagation on federation failure (ETSI GS CIM 009 - 6.3.6) |
| Distributed type/attribute discovery | ✅ | ❌ | /types and /attributes include CSRs (ETSI GS CIM 009 - 5.9.3.3) |
| **Modes** | | | |
| inclusive | ✅ | ✅ | Merge local and remote (NGSI-LD standard, NGSIv2 extension) |
| exclusive | ✅ | ✅ | Return remote only (NGSI-LD standard, NGSIv2 extension) |
| redirect | ✅ | ✅ | 303 redirect (NGSI-LD standard, NGSIv2 extension) |
| auxiliary | ✅ | ✅ | Local priority, supplement with remote for missing data (NGSI-LD standard, NGSIv2 extension) |

## Multi-tenancy

| Feature | GeonicDB | FIWARE Orion | Notes |
|---------|:------------------:|:------------:|-------|
| `Fiware-Service` header | ✅ | ✅ | Tenant identification |
| `Fiware-ServicePath` header | ✅ | ✅ | Hierarchical path |
| Automatic tenant isolation | ✅ | ✅ | |
| Hierarchical service path | ✅ | ✅ | |
| Hierarchical search (`/#`) | ✅ | ✅ | Search including child paths with `/path/#` |
| Multiple path specification | ✅ | ✅ | Up to 10 paths, comma-separated |
| Search all paths when header omitted | ✅ | ✅ | Omitting header in queries searches all paths |
| `Fiware-Correlator` header | ✅ | ✅ | Request tracking |

## Authentication and Authorization

| Feature | GeonicDB | FIWARE Orion | Notes |
|---------|:------------------:|:------------:|-------|
| **Built-in authentication** | ✅ | ❌ | JWT authentication and role-based access control |
| JWT authentication | ✅ | ❌ | Access tokens and refresh tokens |
| Role-based access control | ✅ | ❌ | super_admin, tenant_admin, user, api_key |
| **OIDC external IdP integration** | ✅ | ❌ | External authentication provider via OpenID Connect |
| **XACML policy sets** | ✅ | ❌ | Hierarchical access control management via policy sets |
| **External authentication integration** | | | |
| OAuth 2.0 | ⚠️ Via API Gateway | ⚠️ Via PEP Proxy | |
| Keyrock IdM integration | ⚠️ API compatible | ✅ | Integration possible via API compatibility (unverified) |
| Wilma PEP Proxy | ⚠️ API compatible | ✅ | Integration possible via API compatibility (unverified) |
| AWS Cognito | ✅ | ❌ | API Gateway integration |
| AWS IAM | ✅ | ❌ | Lambda Authorizer |

## Data Integration Platform

| Feature | GeonicDB | FIWARE Orion | Notes |
|---------|:------------------:|:------------:|-------|
| **CADDE integration** | ✅ | ❌ | Cross-domain data exchange platform |
| `x-cadde-*` header support | ✅ | ❌ | Resource URL and provider information |
| Provenance information headers | ✅ | ❌ | `x-cadde-provenance-*` |
| Bearer authentication (CADDE) | ✅ | ❌ | Optional |

## Data Catalog

| Feature | GeonicDB | FIWARE Orion | Notes |
|---------|:------------------:|:------------:|-------|
| **DCAT-AP catalog** | ✅ | ❌ | EU data portal standard |
| `GET /catalog` | ✅ | ❌ | DCAT-AP JSON-LD format |
| `GET /catalog/datasets` | ✅ | ❌ | List datasets |
| `GET /catalog/datasets/{id}` | ✅ | ❌ | Dataset details |
| `GET /catalog/datasets/{id}/sample` | ✅ | ❌ | Get sample data |
| **CKAN-compatible API** | ✅ | ❌ | Open data portal integration |
| `/catalog/ckan/package_list` | ✅ | ❌ | List package IDs |
| `/catalog/ckan/package_show` | ✅ | ❌ | Package details |
| `/catalog/ckan/current_package_list_with_resources` | ✅ | ❌ | Paginated list |
| **CKAN harvester support** | ✅ | ❌ | Automatic data harvesting support |

## AI Integration

| Feature | GeonicDB | FIWARE Orion | Notes |
|---------|:------------------:|:------------:|-------|
| **MCP (Model Context Protocol)** | ✅ | ❌ | Streamable HTTP transport, stateless |
| MCP tool exposure | ✅ | ❌ | Entity CRUD, queries, etc. exposed as AI tools |
| MCP authentication (JWT) | ✅ | ❌ | Tenant isolation support |
| **llms.txt** | ✅ | ❌ | API documentation for AI/LLM (`GET /llms.txt`) |
| **tools.json** | ✅ | ❌ | Tool definitions for AI agents (`GET /tools.json`) |
| **OpenAPI 3.0** | ✅ | ✅ | `GET /openapi.json` |

## Operations and Monitoring

| Feature | GeonicDB | FIWARE Orion | Notes |
|---------|:------------------:|:------------:|-------|
| **Health check** | ✅ | ✅ | |
| `/health` | ✅ | ✅ | |
| `/health/live` | ✅ | ❌ | Kubernetes Liveness |
| `/health/ready` | ✅ | ❌ | Kubernetes Readiness |
| **Logging** | | | |
| Structured logging (JSON) | ✅ | ✅ | |
| Audit logging | ✅ | ❌ | Structured JSON output of who/what/when for write operations |
| AWS CloudWatch integration | ✅ | ❌ | |
| **Tracing** | | | |
| AWS X-Ray | ✅ | ❌ | |
| OpenTelemetry | ✅ | ⚠️ Limited | OTLP over HTTP/gRPC |
| **Metrics** | | | |
| CloudWatch Metrics | ✅ | ❌ | |
| Prometheus | ✅ | ✅ | /metrics endpoint |

## Deployment

| Item | GeonicDB | FIWARE Orion | Notes |
|------|:------------------:|:------------:|-------|
| **Deployment methods** | | | |
| AWS SAM | ✅ | ❌ | |
| Docker | ❌ | ✅ | |
| Docker Compose | ❌ | ✅ | |
| Kubernetes | ⚠️ Unverified | ✅ | |
| **Dependent services** | | | |
| MongoDB | ✅ | ✅ | |
| EventBridge | ✅ | ❌ | Event-driven |
| SQS | ✅ | ❌ | Notification queue |
| **Environments** | | | |
| AWS | ✅ | ⚠️ Possible | |
| On-premises | ❌ | ✅ | |
| GCP/Azure | ❌ | ⚠️ Possible | |

## Unique Features

### GeonicDB Only

| Feature | Description |
|---------|-------------|
| **MCP (Model Context Protocol)** | [MCP](https://modelcontextprotocol.io/)-compatible AI tool endpoint (`POST /mcp`). Directly operable from AI clients such as Claude Desktop |
| **llms.txt support** | API documentation for AI/LLM conforming to the [llms.txt standard](https://llmstxt.org/) (`GET /llms.txt`) |
| **Spatial ID (ZFXY) support** | 3D spatial identification compliant with Japan's Digital Agency/IPA "Spatial ID Guidelines" |
| **Vector tiles** | GeoJSON vector tile output compliant with TileJSON 3.0, with automatic clustering support |
| **DCAT-AP catalog** | JSON-LD catalog output conforming to EU data portal standard (`GET /catalog`) |
| **CKAN-compatible API** | Compatible with the CKAN open data portal harvester |
| **CADDE integration** | Integration functionality with CADDE (cross-domain data exchange platform) connectors |
| **WebSocket event streaming** | Real-time entity change delivery via AWS API Gateway WebSocket API. Filterable by entity type and ID pattern |
| **Snapshots** | Point-in-time snapshot creation and restoration for entities (`/ngsi-ld/v1/snapshots`) |
| **EntityMap** | Distributed entity mapping and transformation definitions (`/ngsi-ld/v1/entityMaps`) |
| **Conformance information** | NGSI-LD conformance information endpoint (`/ngsi-ld/v1/info/conformance`), source identity (`/ngsi-ld/v1/info/sourceIdentity`) |
| **OIDC external IdP integration** | External authentication provider integration via OpenID Connect |
| **XACML policy sets** | Hierarchical access control management via policy sets |
| **Temporal batch operations** | `temporal/entityOperations/create`, `upsert`, `delete` (proprietary extension beyond ETSI GS CIM 009 specification) |
| **Time Series Collection** | Optimized time-series data storage via MongoDB Time Series Collection, `$dateTrunc` aggregation, TTL data retention policy |
| **Serverless architecture** | Auto-scaling and pay-per-use via AWS Lambda |
| **SQS FIFO notification queue** | Ordered notification delivery |
| **Dead Letter Queue** | Isolation and reprocessing of failed notifications |
| **MongoDB Change Stream** | Real-time event detection |
| **AWS X-Ray tracing** | Distributed tracing support |
| **Kubernetes Probes** | `/health/live`, `/health/ready` endpoints |

### FIWARE Orion Only

Note: Regarding Keyrock IdM / Wilma PEP Proxy, GeonicDB can also integrate via API compatibility (see "Authentication and Authorization" section above).

## Recommended Use Cases

### When GeonicDB Is the Better Choice

- Already using AWS infrastructure
- Adopting a serverless architecture
- Need auto-scaling and pay-per-use billing
- Require support for Japan's Spatial ID standard
- Need integration with CADDE (cross-domain data exchange platform)
- Want to minimize operational costs
- Planning AI/LLM integration (llms.txt support)

### When FIWARE Orion Is the Better Choice

- Need to operate in an on-premises environment
- Integrating with other FIWARE ecosystem components (Keyrock, Wilma, etc.)
- Planning to operate on Docker/Kubernetes
- Operating on non-AWS cloud or multi-cloud environments

## References

- [GeonicDB Repository](https://github.com/geolonia/geonicdb) (private repository)
- [FIWARE Orion Documentation](https://fiware-orion.readthedocs.io/)
- [FIWARE Orion-LD Repository](https://github.com/FIWARE/context.Orion-LD)
- [NGSIv2 Specification](https://fiware-orion.readthedocs.io/en/master/orion-api.html)
- [NGSI-LD Specification (ETSI)](https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/)
- [CADDE (Cross-Domain Data Exchange Platform)](https://www.data-ex.jp/)
- [DCAT-AP (EU Data Portal Standard)](https://joinup.ec.europa.eu/collection/semic-support-centre/solution/dcat-application-profile-data-portals-europe)
- [CKAN API Documentation](https://docs.ckan.org/en/latest/api/)

---

*Last updated: February 2026*
