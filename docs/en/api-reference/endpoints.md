---
title: Endpoints
description: Common API specifications for Vela OS — headers, content types, CORS, tenant headers, and the complete list of all API endpoints.
outline: deep
---

# Endpoints

This page describes the common specifications shared across all Vela OS API endpoints, including headers, content types, and the complete endpoint reference.

## API Categories

| Category | Base Path | Auth Required | Content-Type |
|----------|-----------|---------------|--------------|
| Meta / Health | `/` | No | `application/json` |
| Auth | `/auth` | No | `application/json` |
| User | `/me` | Yes | `application/json` |
| NGSIv2 | `/v2` | Yes* | `application/json` |
| NGSI-LD | `/ngsi-ld/v1` | Yes* | `application/ld+json` |
| Admin | `/admin` | Yes (super_admin) | `application/json` |
| Catalog | `/catalog` | Yes* | `application/json` |

\* Authentication is required only when `AUTH_ENABLED=true`.

## Common Headers

### Request Headers

| Header | Required | Default | Description |
|--------|----------|---------|-------------|
| `Content-Type` | Yes (for POST/PUT/PATCH) | — | `application/json` (NGSIv2) or `application/ld+json` (NGSI-LD) |
| `Fiware-Service` | Recommended | `default` | Tenant identifier |
| `Fiware-ServicePath` | Recommended | `/` | Hierarchical service path |
| `Fiware-Correlator` | Optional | Auto-generated | Request correlation ID for distributed tracing |
| `Authorization` | When auth enabled | — | `Bearer {access_token}` |

### CORS Headers

All responses include CORS headers:

```text
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Fiware-Service, Fiware-ServicePath, Authorization, Link
Access-Control-Expose-Headers: Location, Fiware-Correlator, Fiware-Total-Count, NGSILD-Results-Count, X-Total-Count, Link
```

### OPTIONS Method

All endpoints support the `OPTIONS` method for CORS preflight requests, returning `204 No Content` with allowed methods and headers.

NGSI-LD endpoints additionally return an `Accept-Patch` header:

```text
Accept-Patch: application/json, application/ld+json, application/merge-patch+json
```

## Public Endpoints (Meta / Health)

These endpoints require no authentication.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | API documentation in llms.txt format (Markdown) |
| `/version` | GET | FIWARE Orion-compatible version information |
| `/health` | GET | Basic health check |
| `/health/live` | GET | Kubernetes liveness probe |
| `/health/ready` | GET | Kubernetes readiness probe (checks MongoDB) |
| `/.well-known/ngsi-ld` | GET | NGSI-LD API discovery |
| `/api.json` | GET | API reference in JSON format |
| `/openapi.json` | GET | OpenAPI 3.0 specification |
| `/statistics` | GET | FIWARE Orion-compatible server statistics |
| `/cache/statistics` | GET | Subscription and registration cache stats |
| `/metrics` | GET | Prometheus exposition format metrics |
| `/tools.json` | GET | AI tool definitions (Claude Tool Use / OpenAI Function Calling) |
| `/.well-known/ai-plugin.json` | GET | AI plugin manifest |
| `/mcp` | POST | MCP (Model Context Protocol) Streamable HTTP endpoint |

## NGSIv2 Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v2/entities` | GET | List entities |
| `/v2/entities` | POST | Create entity |
| `/v2/entities/{id}` | GET | Get entity |
| `/v2/entities/{id}` | DELETE | Delete entity |
| `/v2/entities/{id}/attrs` | GET | Get entity attributes |
| `/v2/entities/{id}/attrs` | POST | Append entity attributes |
| `/v2/entities/{id}/attrs` | PATCH | Update entity attributes |
| `/v2/entities/{id}/attrs` | PUT | Replace entity attributes |
| `/v2/entities/{id}/attrs/{attr}` | GET | Get attribute |
| `/v2/entities/{id}/attrs/{attr}` | PUT | Update attribute |
| `/v2/entities/{id}/attrs/{attr}` | DELETE | Delete attribute |
| `/v2/entities/{id}/attrs/{attr}/value` | GET | Get attribute value |
| `/v2/entities/{id}/attrs/{attr}/value` | PUT | Update attribute value |
| `/v2/subscriptions` | GET | List subscriptions |
| `/v2/subscriptions` | POST | Create subscription |
| `/v2/subscriptions/{id}` | GET | Get subscription |
| `/v2/subscriptions/{id}` | PATCH | Update subscription |
| `/v2/subscriptions/{id}` | DELETE | Delete subscription |
| `/v2/registrations` | GET | List registrations |
| `/v2/registrations` | POST | Create registration |
| `/v2/registrations/{id}` | GET | Get registration |
| `/v2/registrations/{id}` | PATCH | Update registration |
| `/v2/registrations/{id}` | DELETE | Delete registration |
| `/v2/types` | GET | List entity types |
| `/v2/types/{typeName}` | GET | Get entity type |
| `/v2/op/update` | POST | Batch update |
| `/v2/op/query` | POST | Batch query |
| `/v2/op/notify` | POST | Receive notification |
| `/v2/tiles` | GET | TileJSON metadata |
| `/v2/tiles/{z}/{x}/{y}.geojson` | GET | GeoJSON vector tile |

## NGSI-LD Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/ngsi-ld/v1/entities` | GET | List entities |
| `/ngsi-ld/v1/entities` | POST | Create entity |
| `/ngsi-ld/v1/entities/{id}` | GET | Get entity |
| `/ngsi-ld/v1/entities/{id}` | PUT | Replace entity |
| `/ngsi-ld/v1/entities/{id}` | PATCH | Update entity (Merge-Patch) |
| `/ngsi-ld/v1/entities/{id}` | POST | Append attributes |
| `/ngsi-ld/v1/entities/{id}` | DELETE | Delete entity |
| `/ngsi-ld/v1/entities/{id}/attrs` | GET | Get all attributes |
| `/ngsi-ld/v1/entities/{id}/attrs` | PATCH | Partial update attributes |
| `/ngsi-ld/v1/entities/{id}/attrs/{attr}` | GET | Get attribute |
| `/ngsi-ld/v1/entities/{id}/attrs/{attr}` | PUT | Replace attribute |
| `/ngsi-ld/v1/entities/{id}/attrs/{attr}` | POST | Replace attribute |
| `/ngsi-ld/v1/entities/{id}/attrs/{attr}` | PATCH | Partial update attribute |
| `/ngsi-ld/v1/entities/{id}/attrs/{attr}` | DELETE | Delete attribute |
| `/ngsi-ld/v1/subscriptions` | GET | List subscriptions |
| `/ngsi-ld/v1/subscriptions` | POST | Create subscription |
| `/ngsi-ld/v1/subscriptions/{id}` | GET | Get subscription |
| `/ngsi-ld/v1/subscriptions/{id}` | PATCH | Update subscription |
| `/ngsi-ld/v1/subscriptions/{id}` | DELETE | Delete subscription |
| `/ngsi-ld/v1/csourceRegistrations` | GET | List context source registrations |
| `/ngsi-ld/v1/csourceRegistrations` | POST | Create registration |
| `/ngsi-ld/v1/csourceRegistrations/{id}` | GET | Get registration |
| `/ngsi-ld/v1/csourceRegistrations/{id}` | PATCH | Update registration |
| `/ngsi-ld/v1/csourceRegistrations/{id}` | DELETE | Delete registration |
| `/ngsi-ld/v1/types` | GET | List entity types |
| `/ngsi-ld/v1/types/{typeName}` | GET | Get entity type |
| `/ngsi-ld/v1/attributes` | GET | List attributes |
| `/ngsi-ld/v1/attributes/{attrName}` | GET | Get attribute info |
| `/ngsi-ld/v1/entityOperations/create` | POST | Batch create |
| `/ngsi-ld/v1/entityOperations/upsert` | POST | Batch upsert |
| `/ngsi-ld/v1/entityOperations/update` | POST | Batch update |
| `/ngsi-ld/v1/entityOperations/delete` | POST | Batch delete |
| `/ngsi-ld/v1/entityOperations/query` | POST | Batch query |
| `/ngsi-ld/v1/entityOperations/merge` | POST | Batch merge |
| `/ngsi-ld/v1/entityOperations/purge` | POST | Batch purge |
| `/ngsi-ld/v1/temporal/entities` | GET | List temporal entities |
| `/ngsi-ld/v1/temporal/entities` | POST | Create temporal entity |
| `/ngsi-ld/v1/temporal/entities/{id}` | GET | Get temporal entity |
| `/ngsi-ld/v1/temporal/entities/{id}` | PATCH | Update temporal entity |
| `/ngsi-ld/v1/temporal/entities/{id}` | DELETE | Delete temporal entity |
| `/ngsi-ld/v1/jsonldContexts` | GET | List JSON-LD contexts |
| `/ngsi-ld/v1/jsonldContexts` | POST | Register JSON-LD context |
| `/ngsi-ld/v1/jsonldContexts/{id}` | GET | Get JSON-LD context |
| `/ngsi-ld/v1/jsonldContexts/{id}` | DELETE | Delete JSON-LD context |
| `/ngsi-ld/v1/snapshots` | GET | List snapshots |
| `/ngsi-ld/v1/snapshots` | POST | Create snapshot |
| `/ngsi-ld/v1/snapshots/{id}` | GET | Get snapshot |
| `/ngsi-ld/v1/snapshots/{id}` | PATCH | Update snapshot |
| `/ngsi-ld/v1/snapshots/{id}` | DELETE | Delete snapshot |
| `/ngsi-ld/v1/snapshots/{id}/clone` | POST | Clone snapshot |
| `/ngsi-ld/v1/info/sourceIdentity` | GET | Source identity |
| `/ngsi-ld/v1/info/conformance` | GET | Conformance info |
| `/ngsi-ld/v1/tiles` | GET | TileJSON metadata |
| `/ngsi-ld/v1/tiles/{z}/{x}/{y}.geojson` | GET | GeoJSON vector tile |

## Auth Endpoints

| Endpoint | Method | Description | Auth |
|----------|--------|-------------|------|
| `/auth/login` | POST | User login (JWT) | No |
| `/auth/refresh` | POST | Token refresh | No |
| `/oauth/token` | POST | OAuth token (M2M) | Basic Auth |

## Admin Endpoints

All admin endpoints require `super_admin` role.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/admin/tenants` | GET/POST | List / create tenants |
| `/admin/tenants/{id}` | GET/PATCH/DELETE | Get / update / delete tenant |
| `/admin/tenants/{id}/activate` | POST | Activate tenant |
| `/admin/tenants/{id}/deactivate` | POST | Deactivate tenant |
| `/admin/users` | GET/POST | List / create users |
| `/admin/users/{id}` | GET/PATCH/DELETE | Get / update / delete user |
| `/admin/users/{id}/activate` | POST | Activate user |
| `/admin/users/{id}/deactivate` | POST | Deactivate user |
| `/admin/policies` | GET/POST | List / create policies |
| `/admin/policies/{id}` | GET/PUT/DELETE | Get / replace / delete policy |
| `/admin/policies/{id}/activate` | POST | Activate policy |
| `/admin/policies/{id}/deactivate` | POST | Deactivate policy |
| `/admin/policies/{id}/export` | GET | Export XACML XML |
| `/admin/policies/import` | POST | Import XACML XML |
| `/admin/policy-sets` | GET/POST | List / create policy sets |
| `/admin/policy-sets/{id}` | GET/PUT/DELETE | Get / replace / delete policy set |
| `/admin/oauth-clients` | GET/POST | List / create OAuth clients |
| `/admin/oauth-clients/{id}` | GET/PATCH/DELETE | Get / update / delete OAuth client |
| `/admin/oauth-clients/{id}/regenerate-secret` | POST | Regenerate client secret |
| `/admin/metrics` | GET/DELETE | Get / reset metrics |

## Catalog Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/catalog` | GET | DCAT-AP catalog |
| `/catalog/datasets` | GET | List datasets |
| `/catalog/datasets/{id}` | GET | Get dataset |
| `/catalog/datasets/{id}/sample` | GET | Get sample data |
| `/catalog/ckan/package_list` | GET | CKAN package list |
| `/catalog/ckan/package_show` | GET | CKAN package details |
| `/catalog/ckan/current_package_list_with_resources` | GET | CKAN packages with resources |

## Role-Based Access

| API Category | user | tenant_admin | super_admin |
|-------------|------|--------------|-------------|
| Public endpoints | Yes | Yes | Yes |
| `/auth/*` | Yes | Yes | Yes |
| `/me/*` | Yes | Yes | Yes |
| `/v2/*` | Own tenant | Own tenant | All tenants |
| `/ngsi-ld/*` | Own tenant | Own tenant | All tenants |
| `/catalog/*` | Own tenant | Own tenant | All tenants |
| `/admin/*` | No | No | Yes |

## Next Steps

- [NGSIv2 API](/en/api-reference/ngsiv2) — Detailed NGSIv2 API reference
- [NGSI-LD API](/en/api-reference/ngsild) — Detailed NGSI-LD API reference
- [Admin API](/en/api-reference/admin) — Authentication and administration
- [Pagination](/en/api-reference/pagination) — Pagination specifications
- [Status Codes](/en/api-reference/status-codes) — HTTP status codes and error formats
