---
title: "API 共通仕様"
description: "GeonicDB API の共通仕様・認証・クエリパラメータ"
outline: deep
---
# GeonicDB Context Broker API Documentation

This is the API documentation for the FIWARE Orion-compatible Context Broker running on AWS Lambda. It supports both NGSIv2 and NGSI-LD APIs.

## Table of Contents

- [Overview](#overview)
- [Authentication and Multi-Tenancy](#authentication-and-multi-tenancy)
- [Pagination](#pagination)
- [Authentication API](#authentication-api)
- [Meta Endpoints](#meta-endpoints)
- [NGSIv2 API](#ngsiv2-api) (→ [API_NGSIV2.md](./ngsiv2.md))
- [NGSI-LD API](#ngsi-ld-api) (→ [API_NGSILD.md](./ngsild.md))
- [Query Language](#query-language)
- [Geo-Queries](#geo-queries)
- [Spatial ID Search](#spatial-id-search)
- [GeoJSON Output](#geojson-output)
- [Vector Tiles](#vector-tiles)
- [Coordinate Reference System (CRS)](#coordinate-reference-system-crs)
- [Data Catalog API](#data-catalog-api)
- [CADDE Integration](#cadde-integration)
- [Event Streaming](#event-streaming)
- [Error Responses](#error-responses)
- [Implementation Status](#implementation-status)

---

## Overview

This Context Broker provides a RESTful API conforming to the FIWARE NGSI (Next Generation Service Interface) specification.

**Related Documentation:**
- [NGSIv2 / NGSI-LD Interoperability Guide](../core-concepts/ngsiv2-vs-ngsild.md) - Interoperability between both APIs, type mappings, and best practices
- [WebSocket Event Streaming](../features/subscriptions.md) - Real-time event subscriptions, implementation examples, and best practices

### Base URL

```text
https://{api-gateway-url}/{stage}
```

### Supported APIs

| API Version | Base Path | Content-Type |
|-------------|-----------|--------------|
| NGSIv2 | `/v2` | `application/json` |
| NGSI-LD | `/ngsi-ld/v1` | `application/ld+json` |

### OPTIONS Method

The `OPTIONS` method is supported on all endpoints. It returns information about allowed methods and headers in response to CORS preflight requests.

#### Response Format

OPTIONS requests return `204 No Content` with the following headers:

```http
OPTIONS /v2/entities/urn:ngsi-ld:Room:Room1

HTTP/1.1 204 No Content
Allow: GET, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Fiware-Service, Fiware-ServicePath, Authorization
Access-Control-Max-Age: 86400
```

For NGSI-LD endpoints, an additional `Accept-Patch` header is also returned:

```http
OPTIONS /ngsi-ld/v1/entities/urn:ngsi-ld:Room:Room1

HTTP/1.1 204 No Content
Allow: GET, PUT, PATCH, DELETE, OPTIONS
Accept-Patch: application/json, application/ld+json, application/merge-patch+json
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, NGSILD-Tenant, Fiware-Service, Link, Authorization
Access-Control-Max-Age: 86400
```

### Entity ID Uniqueness (GeonicDB Extension)

> **GeonicDB Extension**: This behavior differs from the standard NGSIv2 specification, which allows entities with the same ID but different types to coexist.

In GeonicDB, entity IDs are unique within the scope of a **tenant** (`Fiware-Service`) and **service path** (`Fiware-ServicePath`). The entity `type` is **not** part of the uniqueness constraint.

**Key behaviors:**

- Creating an entity with the same ID as an existing entity (even with a different `type`) returns `409 AlreadyExists`
- Batch upsert operations match entities by `entityId` only (type can be overwritten)
- The NGSIv2 `?type=` query parameter for type disambiguation among same-ID entities is no longer applicable

This design aligns with the NGSI-LD specification, where entity IDs are URIs and are inherently unique. By enforcing ID uniqueness across both APIs, GeonicDB provides a consistent data model for NGSIv2/NGSI-LD interoperability.

---

## Authentication and Multi-Tenancy

### Required Headers

All requests are recommended to include the following headers:

| Header | Required | Description | Default |
|--------|----------|-------------|---------|
| `Fiware-Service` | Recommended | Tenant name (alphanumeric and underscores only) | `default` |
| `Fiware-ServicePath` | Recommended | Hierarchical path within the tenant (starts with `/`) | `/` (equivalent to `/#` for queries) |
| `Fiware-Correlator` | Optional | Correlation ID for request tracing | Auto-generated |

### Usage Example

```bash
curl -X GET "https://api.example.com/v2/entities" \
  -H "Fiware-Service: smartcity" \
  -H "Fiware-ServicePath: /buildings/floor1"
```

### Tenant Isolation

- Data from different `Fiware-Service` values is completely isolated
- Within the same tenant, `Fiware-ServicePath` can be used to organize data hierarchically
- Tenant names are automatically converted to lowercase

### Service Path Specification

Conforms to the [FIWARE Orion specification](https://fiware-orion.readthedocs.io/en/1.3.0/user/service_path/index.html).

#### Basic Format

- Only absolute paths starting with `/` are allowed
- Only alphanumeric characters and underscores are allowed
- Maximum 10 levels, up to 50 characters per level

```bash
# Retrieve entities at a specific path
curl "http://localhost:3000/v2/entities" \
  -H "Fiware-Service: smartcity" \
  -H "Fiware-ServicePath: /Madrid/Gardens"
```

#### Hierarchical Search (`/#`)

Using the `/#` suffix allows searching the specified path and all its child paths (**query operations only**).

```bash
# Search /Madrid/Gardens and all its child paths
curl "http://localhost:3000/v2/entities" \
  -H "Fiware-Service: smartcity" \
  -H "Fiware-ServicePath: /Madrid/Gardens/#"
```

#### Multiple Paths (Comma-Separated)

Multiple paths can be searched simultaneously by separating them with commas (maximum 10 paths, **query operations only**).

```bash
# Search both /park1 and /park2
curl "http://localhost:3000/v2/entities" \
  -H "Fiware-Service: smartcity" \
  -H "Fiware-ServicePath: /park1, /park2"
```

#### Default Behavior

| Operation | When Header is Omitted | Description |
|-----------|------------------------|-------------|
| Query (GET) | `/` | Search root path only |
| Write (POST/PUT/PATCH/DELETE) | `/` | Create/update in root path |

**Note**: Write operations can only use a single non-hierarchical path. Specifying `/#` or multiple paths will result in an error.

---

## Pagination

Pagination is supported on all list-type API endpoints.

### Parameters

| Parameter | Description | Default | Maximum |
|-----------|-------------|---------|---------|
| `limit` | Maximum number of results to return | 20 | 1000 (Admin API: 100) |
| `offset` | Number of results to skip | 0 | - |

### Response Headers

A header indicating the total count is returned for each API type:

| API | Header Name | Condition |
|-----|-------------|-----------|
| NGSIv2 | `Fiware-Total-Count` | Always returned (all list endpoints) |
| NGSI-LD | `NGSILD-Results-Count` | Always returned |
| Admin API | `X-Total-Count` | Always returned |
| Catalog API | `X-Total-Count` | Always returned |

### Link Header

All list endpoints return a `Link` header conforming to [RFC 8288](https://www.rfc-editor.org/rfc/rfc8288), providing URLs for the next page (`rel="next"`) and previous page (`rel="prev"`). If results fit on a single page, the `Link` header is not returned.

```http
Link: <https://api.example.com/v2/entities?limit=10&offset=20>; rel="next", <https://api.example.com/v2/entities?limit=10&offset=0>; rel="prev"
```

### Validation

Invalid pagination parameters return `400 Bad Request`:

| Error Condition | Error Message |
|-----------------|---------------|
| Negative limit | `Invalid limit: must not be negative` |
| Negative offset | `Invalid offset: must not be negative` |
| limit=0 | `Invalid limit: must be greater than 0` |
| Exceeds maximum | `Invalid limit: must not exceed 1000` |
| Non-numeric | `Invalid limit: must be a valid integer` |

### Usage Examples

```bash
# Retrieve the second page (10 results per page)
curl "http://localhost:3000/v2/entities?limit=10&offset=10" \
  -H "Fiware-Service: smartcity"

# Retrieve with total count header
curl "http://localhost:3000/v2/entities?limit=10&options=count" \
  -H "Fiware-Service: smartcity"
```

### Notes

- If `offset` exceeds the total count, an empty array is returned (not an error)
- Conforms to the FIWARE Orion specification

---

## Authentication API

The authentication feature allows user authentication and access control.

### Enabling

Authentication is disabled by default. It can be enabled with the following environment variables.

**Note**: When `AUTH_ENABLED=false`, authentication-related endpoints (`/auth/*`, `/me`, `/me/*`, `/admin/*`) return 404.

**Important**: When `AUTH_ENABLED=true`, access to NGSI API endpoints (`/v2/*`, `/ngsi-ld/*`, `/catalog/*`) requires authentication. Accessing without authentication returns a `401 Unauthorized` error.

| Environment Variable | Default | Description |
|----------------------|---------|-------------|
| `AUTH_ENABLED` | `false` | Enable authentication |
| `JWT_SECRET` | - | Secret for JWT token signing (32+ characters recommended) |
| `JWT_EXPIRES_IN` | `1h` | Access token expiration |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token expiration |
| `SUPER_ADMIN_EMAIL` | - | Super admin email address set via environment variable |
| `SUPER_ADMIN_PASSWORD` | - | Super admin password set via environment variable |
| `ADMIN_ALLOWED_IPS` | - | IPs/CIDRs allowed to access the Admin API (comma-separated) |

### Roles and Permissions

| Role | Description | Permissions |
|------|-------------|-------------|
| `super_admin` | Super administrator | Manage all tenants and users, create/delete tenants |
| `tenant_admin` | Tenant administrator | Manage users within their own tenant |
| `user` | General user | View own profile and change password only |

### Login

```http
POST /auth/login
Content-Type: application/json
```

**Request Body**

```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "tenantId": "target-tenant-id",
  "resourceScopes": [
    { "entityTypes": ["TemperatureSensor"], "ops": ["read", "write"] },
    { "entityTypes": ["HumiditySensor"], "attrs": ["humidity"], "ops": ["read"] }
  ]
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `email` | string | Yes | Email address |
| `password` | string | Yes | Password |
| `tenantId` | string | No | If specified, issues a JWT scoped to that tenant. Defaults to primary tenant if omitted |
| `resourceScopes` | ResourceScope[] | No | Entity-level access control scopes. Full access if omitted. See AUTH.md for details |

**Response Example**

```json
{
  "accessToken": "<access_token>",
  "refreshToken": "<refresh_token>",
  "expiresIn": 3600,
  "tokenType": "Bearer",
  "user": {
    "id": "user-123",
    "email": "user@example.com",
    "role": "tenant_admin",
    "tenantId": "tenant-456"
  }
}
```

### Token Refresh

```http
POST /auth/refresh
Content-Type: application/json
```

**Request Body**

```json
{
  "refreshToken": "<refresh_token>"
}
```

**Response**: Same format as login

### Get Current User Info

```http
GET /me
Authorization: Bearer <accessToken>
```

**Response Example**

```json
{
  "id": "user-123",
  "email": "user@example.com",
  "role": "tenant_admin",
  "tenantId": "tenant-456",
  "tenantName": "My Organization"
}
```

### Change Password

```http
POST /me/password
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body**

```json
{
  "currentPassword": "OldPassword123!",
  "newPassword": "NewSecurePassword456!"
}
```

**Response**: `204 No Content`

**Note**: After changing your password, all existing access tokens and refresh tokens are invalidated. Please log in again to obtain new tokens.

### Logout

```http
POST /auth/logout
Authorization: Bearer <accessToken>
```

Invalidates all sessions. All access tokens and refresh tokens issued for this user are immediately invalidated.

**Response**: `204 No Content`

### Admin API

The Admin API is accessible only to users with the `super_admin` or `tenant_admin` role.

#### List Users

```http
GET /admin/users
Authorization: Bearer <accessToken>
```

**Query Parameters**

| Parameter | Description |
|-----------|-------------|
| `tenantId` | Filter by tenant ID (super_admin only) |
| `role` | Filter by role |
| `limit` | Number of results to retrieve |
| `offset` | Offset |

#### Create User

```http
POST /admin/users
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body**

```json
{
  "email": "newuser@example.com",
  "password": "SecurePassword123!",
  "role": "user",
  "tenantId": "tenant-456"
}
```

#### Get User

```http
GET /admin/users/{userId}
Authorization: Bearer <accessToken>
```

#### Update User

```http
PATCH /admin/users/{userId}
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body**

```json
{
  "email": "updated@example.com",
  "role": "tenant_admin"
}
```

#### Delete User

```http
DELETE /admin/users/{userId}
Authorization: Bearer <accessToken>
```

#### Activate/Deactivate User

```http
POST /admin/users/{userId}/activate
POST /admin/users/{userId}/deactivate
Authorization: Bearer <accessToken>
```

#### Unlock Login

Unlocks an account locked by brute-force protection.

```http
POST /admin/users/{userId}/unlock
Authorization: Bearer <accessToken>
```

**Response (200):**

```json
{
  "userId": "abc123",
  "email": "user@example.com",
  "locked": false,
  "failedCount": 0,
  "message": "Account login lock has been cleared"
}
```

### Tenant Management (super_admin only)

#### List Tenants

```http
GET /admin/tenants
Authorization: Bearer <accessToken>
```

#### Create Tenant

```http
POST /admin/tenants
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body**

```json
{
  "name": "New Organization",
  "settings": {
    "maxUsers": 100,
    "allowedServices": ["*"]
  }
}
```

#### Get Tenant

```http
GET /admin/tenants/{tenantId}
Authorization: Bearer <accessToken>
```

#### Update Tenant

```http
PATCH /admin/tenants/{tenantId}
Authorization: Bearer <accessToken>
Content-Type: application/json
```

#### Delete Tenant

```http
DELETE /admin/tenants/{tenantId}
Authorization: Bearer <accessToken>
```

**Cascade Deletion**: When a tenant is deleted, all associated data (entities, subscriptions, registrations, rules, policies, users, memberships, and all 16 collections) is automatically cascade-deleted. Before deletion begins, the tenant is automatically deactivated to block new API requests.

#### Activate/Deactivate Tenant

```http
POST /admin/tenants/{tenantId}/activate
POST /admin/tenants/{tenantId}/deactivate
Authorization: Bearer <accessToken>
```

### Custom Data Model Management

> **Note**: The custom data model API has moved to `/custom-data-models`. See the [Custom Data Models API](#custom-data-models-api) section for details.

### IP Restrictions

By setting the `ADMIN_ALLOWED_IPS` environment variable, you can restrict access to the Admin API (`/admin/*`) to specific IP addresses:

```bash
# Single IP
ADMIN_ALLOWED_IPS=192.168.1.100

# Multiple IPs
ADMIN_ALLOWED_IPS=192.168.1.100,10.0.0.50

# CIDR notation
ADMIN_ALLOWED_IPS=192.168.1.0/24,10.0.0.0/8
```

Access from unauthorized IPs will result in a `403 Forbidden` error.

#### Per-Tenant IP Restrictions

Individual IP restrictions can be configured per tenant. If a tenant-level setting exists, it takes priority over the global setting (`ADMIN_ALLOWED_IPS`).

```http
GET /admin/tenants/{tenantId}/ip-restrictions
PUT /admin/tenants/{tenantId}/ip-restrictions
DELETE /admin/tenants/{tenantId}/ip-restrictions
Authorization: Bearer <accessToken>
```

The scope can be either `admin` (Admin API only) or `all` (all APIs). See AUTH.md for details.

### Rule Engine Management (super_admin, tenant_admin)

Manage rules that automatically process entity changes. super_admin can manage rules for all tenants; tenant_admin can only manage rules for their own tenant.

- **REACTIVCORE_RULES.md** - User guide (usage examples, Admin API, etc.)

#### List Rules

```http
GET /rules
Authorization: Bearer <accessToken>
```

**Query Parameters**

| Parameter | Description |
|-----------|-------------|
| `limit` | Number of results (default: 20, max: 100) |
| `offset` | Offset (default: 0) |
| `servicePath` | Filter by service path |
| `isActive` | Filter by active/inactive (`true` / `false`) |

#### Create Rule

```http
POST /rules
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body**

```json
{
  "ruleId": "high-temperature-alert",
  "name": "High Temperature Warning",
  "description": "Add a warning attribute when temperature exceeds 30 degrees",
  "conditions": [
    {
      "type": "entityType",
      "entityTypes": ["TemperatureSensor"]
    },
    {
      "type": "value",
      "attributeName": "temperature",
      "operator": ">",
      "value": 30
    }
  ],
  "actions": [
    {
      "type": "updateAttribute",
      "entityId": "${entity.id}",
      "attributeName": "alert",
      "value": "HIGH_TEMPERATURE"
    }
  ],
  "priority": 10
}
```

#### Get Rule

```http
GET /rules/{ruleId}
Authorization: Bearer <accessToken>
```

#### Update Rule

```http
PATCH /rules/{ruleId}
Authorization: Bearer <accessToken>
Content-Type: application/json
```

Response: `204 No Content`

#### Delete Rule

```http
DELETE /rules/{ruleId}
Authorization: Bearer <accessToken>
```

#### Activate/Deactivate Rule

```http
POST /rules/{ruleId}/activate
POST /rules/{ruleId}/deactivate
Authorization: Bearer <accessToken>
```

---

## OAuth 2.0 API (M2M Authentication)

Machine-to-Machine (M2M) authentication using the OAuth 2.0 Client Credentials Grant flow is supported.

**Key Endpoints:**
- `POST /oauth/token` - Token acquisition (Basic authentication)
- `POST /admin/oauth-clients` - Client creation (Admin)
- `GET /admin/oauth-clients` - List clients (Admin)
- `POST /admin/oauth-clients/{clientId}/regenerate-secret` - Regenerate secret (Admin)

**Enabling:** Environment variable `OAUTH_ENABLED=true` (default: `true`)

**Available Scopes:**
- Resource scopes: `read:entities`, `write:entities`, `read:subscriptions`, `write:subscriptions`, etc.
- Admin scopes: `admin:users`, `admin:tenants`, `admin:policies`
- Special scopes: `permanent` (unlimited token), `jwt` (JWT API access)

**Resource Scopes:** Specifying the `resource_scopes` parameter (JSON string) in `POST /oauth/token` issues a token with entity-level access control. See AUTH.md for details.

**Details:** See the OAuth 2.0 section in AUTH.md.

---

## Meta Endpoints

Meta endpoints require no authentication and provide system status and API information.

### API Documentation (llms.txt Format)

```http
GET /llms.txt
```

Returns API documentation in the AI-friendly [llms.txt](https://llmstxt.org/) format. Uses Markdown format structured for easy understanding by AI agents and LLMs.

**Response**
- Content-Type: `text/markdown; charset=utf-8`

### API Documentation (JSON Format)

```http
GET /api.json
```

Returns a list of API endpoints in JSON format.

**Response Example**

```json
{
  "name": "GeonicDB",
  "version": "1.0.0",
  "documentation": {
    "llms_txt": "/llms.txt",
    "openapi": "/openapi.json",
    "full": "https://github.com/geolonia/geonicdb/blob/main/docs/API.md"
  },
  "apis": {
    "ngsiv2": { "basePath": "/v2", "endpoints": {...} },
    "ngsi-ld": { "basePath": "/ngsi-ld/v1", "endpoints": {...} }
  }
}
```

### OpenAPI Specification

```http
GET /openapi.json
```

Returns the OpenAPI 3.0 specification in JSON format. Can be used with Swagger UI and various API client generation tools.

**Response**
- Content-Type: `application/json`
- OpenAPI version: 3.0.3

### Version Information

```http
GET /version
```

Returns FIWARE Orion-compatible version information.

**Response Example**

```json
{
  "orion": {
    "version": "1.0.0",
    "uptime": "0 d, 1 h, 30 m, 45 s",
    "git_hash": "787ae22",
    "compile_time": "2026-01-25T00:00:00Z",
    "compiled_by": "geonicdb",
    "compiled_in": "aws-lambda",
    "release_date": "2026-01-25",
    "machine": "x64",
    "doc": "https://github.com/geolonia/geonicdb"
  },
  "vendor": {
    "name": "Geolonia Inc.",
    "url": "https://geolonia.com"
  }
}
```

### NGSI-LD API Discovery

```http
GET /.well-known/ngsi-ld
```

Returns NGSI-LD API support information.

**Response Example**

```json
{
  "serverVersion": "1.0.0",
  "supportedApiVersions": ["v1"],
  "supportedFeatures": ["entities", "subscriptions", "batchOperations"]
}
```

### Health Checks

All health check endpoints return `region` and `regionRole` for multi-region HA support. Route 53 failover monitors these endpoints and switches to the secondary when the primary returns `503`.

#### Basic Health

```http
GET /health
```

Returns the basic operational status of the service.

**Response Example**

```json
{
  "status": "healthy",
  "timestamp": "2026-01-25T10:30:00Z",
  "region": "ap-northeast-1",
  "regionRole": "primary"
}
```

#### Liveness Probe

```http
GET /health/live
```

For Kubernetes / Route 53 liveness probes. Checks whether the service is running.

**Response Example**

```json
{
  "status": "healthy",
  "timestamp": "2026-01-25T10:30:00Z",
  "region": "ap-northeast-1",
  "regionRole": "primary"
}
```

#### Readiness Probe

```http
GET /health/ready
```

For Kubernetes / Route 53 readiness probes. Checks MongoDB connectivity, and optionally performs deep health checks for DynamoDB and EventBridge.

**Enabling Deep Health Checks via Environment Variables**

| Environment Variable | Description |
|---------|------|
| `HEALTH_CHECK_DYNAMODB=true` | Add DynamoDB DescribeTable connectivity check |
| `HEALTH_CHECK_EVENTBRIDGE=true` | Add EventBridge DescribeEventBus connectivity check |

**Response**
- Success: `200 OK` with `status: "healthy"`
- Failure: `503 Service Unavailable` with `status: "unhealthy"`

**Response Example (with deep health checks enabled)**

```json
{
  "status": "healthy",
  "timestamp": "2026-01-25T10:30:00Z",
  "region": "ap-northeast-1",
  "regionRole": "primary",
  "checks": {
    "mongodb": { "status": "healthy", "latencyMs": 12 },
    "dynamodb": { "status": "healthy", "latencyMs": 8 },
    "eventbridge": { "status": "healthy", "latencyMs": 15 }
  },
  "totalLatencyMs": 35
}
```

### Statistics and Metrics

Provides a FIWARE Orion-compatible statistics endpoint and a Prometheus-format metrics endpoint.

#### Statistics

```http
GET /statistics
Authorization: Bearer <token>
```

Returns server operational statistics in FIWARE Orion-compatible format. When authentication is enabled (`AUTH_ENABLED=true`), only authenticated users can access this endpoint.

**Response Example**

```json
{
  "uptime_in_secs": 3600,
  "measuring_interval_in_secs": 3600,
  "counters": {
    "jsonRequests": 1500,
    "noPayloadRequests": 200,
    "requests": {
      "entities": 1000,
      "subscriptions": 300,
      "registrations": 200
    },
    "notifications": {
      "sent": 500,
      "failed": 10
    }
  },
  "timing": {
    "totalRequestTime": { "total": 15000, "count": 1700, "mean": 8.82 },
    "dbTime": { "total": 5000, "count": 1700, "mean": 2.94 }
  },
  "notifQueue": {
    "size": 5,
    "in": 510,
    "out": 505
  }
}
```

#### Cache Statistics

```http
GET /cache/statistics
Authorization: Bearer <token>
```

Returns cache statistics for subscriptions and registrations. When authentication is enabled (`AUTH_ENABLED=true`), only authenticated users can access this endpoint.

**Response Example**

```json
{
  "subscriptions": {
    "count": 50,
    "inserts": 100,
    "updates": 25,
    "removes": 50,
    "refreshes": 10
  },
  "registrations": {
    "count": 20,
    "inserts": 30,
    "updates": 5,
    "removes": 10,
    "refreshes": 5
  }
}
```

#### Prometheus Metrics

```http
GET /metrics
Authorization: Bearer <token>
```

Returns metrics in Prometheus exposition format. When authentication is enabled (`AUTH_ENABLED=true`), only authenticated users can access this endpoint. Can be used for monitoring in Kubernetes environments and integration with Grafana dashboards.

**Response**
- Content-Type: `text/plain; version=0.0.4`

**Response Example**

```text
# HELP geonicdb_uptime_seconds Server uptime in seconds
# TYPE geonicdb_uptime_seconds gauge
geonicdb_uptime_seconds 3600

# HELP geonicdb_entities_total Total number of entities
# TYPE geonicdb_entities_total gauge
geonicdb_entities_total 1000

# HELP geonicdb_subscriptions_total Total number of subscriptions
# TYPE geonicdb_subscriptions_total gauge
geonicdb_subscriptions_total 50

# HELP geonicdb_registrations_total Total number of registrations
# TYPE geonicdb_registrations_total gauge
geonicdb_registrations_total 20

# HELP geonicdb_http_requests_total Total HTTP requests
# TYPE geonicdb_http_requests_total counter
geonicdb_http_requests_total{endpoint="entities"} 1000
geonicdb_http_requests_total{endpoint="subscriptions"} 300

# HELP geonicdb_notifications_sent_total Total notifications sent
# TYPE geonicdb_notifications_sent_total counter
geonicdb_notifications_sent_total 500

# HELP geonicdb_notifications_failed_total Total notifications failed
# TYPE geonicdb_notifications_failed_total counter
geonicdb_notifications_failed_total 10
```

#### AI Integration

##### AI Tool Definitions

```http
GET /tools.json
```

Returns tool definitions in JSON format compatible with Claude Tool Use / OpenAI Function Calling. This is the schema for AI agents to use the API as tools.

**Provided Tools**: `list_entities`, `get_entity`, `search_by_location`, `search_by_attribute`, `create_entity`, `update_entity`, `delete_entity`, `list_entity_types`, `get_temporal_data`, `subscribe`

##### AI Plugin Manifest

```http
GET /.well-known/ai-plugin.json
```

Returns the AI plugin manifest. Includes an overview of the API, tool definition URL, OpenAPI specification URL, etc.

##### MCP (Model Context Protocol)

```http
POST /mcp
Content-Type: application/json
Accept: application/json, text/event-stream
```

MCP Streamable HTTP endpoint. Can be connected directly from MCP-compatible AI clients (such as Claude Desktop). Operates in stateless mode (JSON response), with all 10 tools available via MCP tools/call.

When `AUTH_ENABLED=true`, authentication via Bearer token (JWT) is required. Tenant access control also applies.

**Claude Desktop Configuration Example**:
```json
{
  "mcpServers": {
    "geonicdb": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://localhost:3000/mcp",
        "--header",
        "Authorization: Bearer <your-jwt-token>"
      ]
    }
  }
}
```
Note: `headers` is only required when `AUTH_ENABLED=true`.

For details, see [AI_INTEGRATION.md](../ai-integration/overview.md).

#### Per-Tenant Metrics (Admin API)

```http
GET /admin/metrics
Authorization: Bearer <accessToken>
```

Returns metrics by tenant and service path. Requires the `super_admin` role.

**Response Example**

```json
{
  "services": {
    "smartcity": {
      "subservs": {
        "/": {
          "entityCount": 500,
          "subscriptionCount": 20,
          "registrationCount": 10
        },
        "/sensors": {
          "entityCount": 300,
          "subscriptionCount": 15,
          "registrationCount": 5
        }
      }
    }
  }
}
```

---

## NGSIv2 API

For details on the NGSIv2 API, see [API_NGSIV2.md](./ngsiv2.md).

---

## NGSI-LD API

For details on the NGSI-LD API, see [API_NGSILD.md](./ngsild.md).

---

## Query Language

Filtering by attribute values is possible using the `q` parameter.

### Basic Syntax

| Operator | Description | Example |
|----------|-------------|---------|
| `==` | Equal to | `temperature==23` |
| `!=` | Not equal to | `status!=inactive` |
| `>` | Greater than | `temperature>20` |
| `<` | Less than | `temperature<30` |
| `>=` | Greater than or equal to | `temperature>=20` |
| `<=` | Less than or equal to | `temperature<=30` |
| `..` | Range | `temperature==20..30` |
| `~=` | Pattern match (regular expression) | `name~=Room.*` |

### Multiple Conditions

Combine AND conditions with semicolons (`;`):

```text
q=temperature>20;pressure<800
```

Combine OR conditions with pipes (`|`) (`;` has higher precedence than `|`):

```text
q=temperature==23|temperature==35
q=temperature>25;humidity<40|status==active
```

### Range Query

Combine the `==` operator with `..` for range filtering (inclusive of boundaries):

```text
q=temperature==20..30    # 20 or above and 30 or below
```

### String Matching

```text
q=status~=act     # Partial match (regular expression)
q=name==Room1     # Exact match
```

---

## Geo-Queries

Entities with location information can be queried spatially.

### Parameters

| Parameter | Description |
|-----------|-------------|
| `georel` | Spatial relationship (coveredBy, within, intersects, disjoint, equals) |
| `geometry` | Geometry type (point, polygon, line, box) |
| `coords` | Coordinates (NGSIv2: latitude,longitude format; NGSI-LD: longitude,latitude format; multiple points separated by semicolons) |

> **Note**: `georel`, `geometry`, and `coords` (or `coordinates` in NGSI-LD) must all be specified together. Specifying only some of them returns `400 Bad Request` (ETSI GS CIM 009 V1.9.1 clause 4.10).

### Coordinate Format

In NGSIv2, coordinates are specified in **latitude,longitude** order (conforming to the NGSIv2 specification). In NGSI-LD, coordinates are in **longitude,latitude** order (conforming to the GeoJSON standard).

> **Important**: The latitude,longitude order in NGSIv2 is a deviation from the GeoJSON standard (longitude,latitude). This was corrected in NGSI-LD, which uses the same longitude,latitude order as GeoJSON. When using the API, make sure to specify coordinates in the correct order for the API version being used.

```text
# NGSIv2 (latitude,longitude)
coords=35.6812,139.7671              # Single point
coords=34,138;34,141;37,141;37,138;34,138  # Polygon (semicolon-separated)

# NGSI-LD (longitude,latitude)
coordinates=[139.7671,35.6812]       # Single point
```

### Area Search (coveredBy / within)

Search for entities within a polygon:

```http
GET /v2/entities?georel=coveredBy&geometry=polygon&coords=34,138;34,141;37,141;37,138;34,138
```

### Intersection Search (intersects)

Search for entities intersecting a geometry:

```http
GET /v2/entities?georel=intersects&geometry=box&coords=35.67,139.76;35.69,139.78
```

### Disjoint Search (disjoint)

Search for entities not intersecting a geometry:

```http
GET /v2/entities?georel=disjoint&geometry=polygon&coords=34,138;34,141;37,141;37,138;34,138
```

### Proximity Search (near)

Search for entities within a certain distance from the specified coordinates.

#### Parameters

| Parameter | Description |
|-----------|-------------|
| `maxDistance` | Maximum distance (meters) |
| `minDistance` | Minimum distance (meters) |
| `orderByDistance` | When set to `true`, sorts results by distance and attaches distance information (`@distance`) to each entity |

#### Basic Usage (NGSIv2)

```http
# Search for entities within 5km of Tokyo Station
GET /v2/entities?georel=near;maxDistance:5000&geometry=point&coords=35.6812,139.7671

# Search for entities more than 100km from Tokyo Station
GET /v2/entities?georel=near;minDistance:100000&geometry=point&coords=35.6812,139.7671

# Donut-shaped search (500m to 10km range)
GET /v2/entities?georel=near;minDistance:500;maxDistance:10000&geometry=point&coords=35.6812,139.7671
```

#### Usage in NGSI-LD

In NGSI-LD, parameters are specified using `==`:

```http
# Search for entities within 5km of Tokyo Station
GET /ngsi-ld/v1/entities?georel=near;maxDistance==5000&geometry=Point&coordinates=[139.7671,35.6812]

# Search for entities more than 100km from Tokyo Station
GET /ngsi-ld/v1/entities?georel=near;minDistance==100000&geometry=Point&coordinates=[139.7671,35.6812]

# Donut-shaped search (500m to 10km range)
GET /ngsi-ld/v1/entities?georel=near;minDistance==500;maxDistance==10000&geometry=Point&coordinates=[139.7671,35.6812]
```

#### georel Syntax Comparison

The georel parameter modifier syntax differs between NGSIv2 and NGSI-LD:

| Feature | NGSIv2 | NGSI-LD | Description |
|---------|--------|---------|-------------|
| Max distance | `georel=near;maxDistance:5000` | `georel=near;maxDistance==5000` | `:` vs `==` difference |
| Min distance | `georel=near;minDistance:1000` | `georel=near;minDistance==1000` | `:` vs `==` difference |
| Distance range | `georel=near;minDistance:500;maxDistance:10000` | `georel=near;minDistance==500;maxDistance==10000` | `:` vs `==` difference |

> **Reason for syntax difference**: NGSIv2 uses `:` to specify parameter values, while NGSI-LD uses `==` in accordance with the ETSI specification. When calling the API, use the syntax corresponding to the API version being used.

#### Distance Sorting and Distance Information

Specifying the `orderByDistance=true` parameter enables the following features:

1. **Distance sorting**: Results are sorted in ascending order of distance from the specified coordinates
2. **Distance information**: A `@distance` attribute is added to each entity, returning the distance (in meters) from the specified coordinates

This feature is implemented using MongoDB's `$geoNear` aggregation pipeline.

##### Usage in NGSIv2

```http
# Retrieve entities within 5km of Tokyo Station sorted by distance
GET /v2/entities?georel=near;maxDistance:5000&geometry=point&coords=35.6812,139.7671&orderByDistance=true
```

Response example:
```json
[
  {
    "id": "Store1",
    "type": "Store",
    "name": { "type": "Text", "value": "Tokyo Store" },
    "location": {
      "type": "geo:json",
      "value": { "type": "Point", "coordinates": [139.7671, 35.6812] }
    },
    "@distance": { "type": "Number", "value": 0 }
  },
  {
    "id": "Store2",
    "type": "Store",
    "name": { "type": "Text", "value": "Nearby Store" },
    "location": {
      "type": "geo:json",
      "value": { "type": "Point", "coordinates": [139.77, 35.685] }
    },
    "@distance": { "type": "Number", "value": 512.35 }
  }
]
```

##### Usage in NGSI-LD

```http
# Retrieve entities within 5km of Tokyo Station sorted by distance
GET /ngsi-ld/v1/entities?georel=near;maxDistance==5000&geometry=Point&coordinates=[139.7671,35.6812]&orderByDistance=true
```

##### Descending Sort

Use `orderDirection=desc` together to sort by distance in descending order (farthest first):

```http
GET /v2/entities?georel=near;maxDistance:5000&geometry=point&coords=35.6812,139.7671&orderByDistance=true&orderDirection=desc
```

#### Limitations

- **Point geometry only**: Only `geometry=point` (NGSIv2) or `geometry=Point` (NGSI-LD) is supported

### Error Handling

If geo-query parameters are invalid, `400 Bad Request` is returned.

| Error Condition | Example Error Message |
|----------------|-----------------------|
| Invalid `georel` value | `Invalid georel: xxx. Supported values: near, coveredBy, within, contains, intersects, disjoint, equals` |
| Invalid `geometry` value | `Unsupported geometry type: xxx. Supported types: point, polygon, linestring, line, box` |
| Insufficient coordinates (Point) | `Point geometry requires at least 2 coordinates, but got 1` |
| Insufficient coordinates (Polygon) | `Polygon geometry requires at least 4 coordinate pairs (8 values), but got 6 values` |
| Insufficient coordinates (LineString) | `LineString geometry requires at least 2 coordinate pairs (4 values), but got 2 values` |
| Insufficient coordinates (Box) | `Box geometry requires 2 coordinate pairs (4 values), but got 2 values` |
| Invalid coordinate value | `Invalid coordinate value: xxx` |
| Latitude out of range | `Latitude out of range: 91. Must be between -90 and 90.` |
| Longitude out of range | `Longitude out of range: 181. Must be between -180 and 180.` |
| `near` without distance | `The 'near' georel requires maxDistance and/or minDistance modifier` |
| `near` with non-Point geometry | `The 'near' georel requires Point geometry, but 'polygon' was provided` |

---

## Spatial ID Search

Supports spatial search based on the 3D spatial identification standard (ZFXY format) established by Japan's Digital Agency / IPA.

### ZFXY Format

| Element | Description | Range |
|---------|-------------|-------|
| Z | Zoom level | 0-28 |
| F | Vertical direction (altitude level) | Integer |
| X | East-west direction (longitude tile) | 0 to 2^z-1 |
| Y | North-south direction (latitude tile) | 0 to 2^z-1 |

Format: `{z}/{f}/{x}/{y}` (example: `20/0/929593/410773`)

### Usage in NGSIv2

```http
GET /v2/entities?spatialId=20/0/929593/410773
```

### Usage in NGSI-LD

```http
GET /ngsi-ld/v1/entities?spatialId=20/0/929593/410773
```

### Hierarchical Expansion (spatialIdDepth)

Specifying the `spatialIdDepth` parameter expands the search to surrounding tiles centered on the specified spatial ID.

```http
# depth=1: Expands to a 3x3 tile grid (9 tiles)
GET /v2/entities?spatialId=20/0/929593/410773&spatialIdDepth=1

# depth=2: Expands to a 5x5 tile grid (25 tiles)
GET /v2/entities?spatialId=20/0/929593/410773&spatialIdDepth=2
```

| spatialIdDepth | Expansion Range | Tile Count |
|----------------|-----------------|------------|
| 0 (default) | Specified tile only | 1 |
| 1 | 3x3 | 9 |
| 2 | 5x5 | 25 |
| 3 | 7x7 | 49 |
| 4 | 9x9 | 81 |

### Usage Examples

```bash
# Search for entities near Tokyo Station (zoom level 20)
curl "http://localhost:3000/v2/entities?spatialId=20/0/929592/410773" \
  -H "Fiware-Service: smartcity"

# Search with expansion to surrounding 3x3 tiles
curl "http://localhost:3000/v2/entities?spatialId=20/0/929592/410773&spatialIdDepth=1" \
  -H "Fiware-Service: smartcity"
```

---

## GeoJSON Output

Entities can be output in RFC 7946-compliant GeoJSON FeatureCollection format.

### Usage in NGSIv2

Use the `options=geojson` parameter or the `Accept: application/geo+json` header:

```http
# options parameter
GET /v2/entities?type=Store&options=geojson

# Accept header
GET /v2/entities?type=Store
Accept: application/geo+json
```

### Usage in NGSI-LD

Use the `format=geojson` parameter or the `Accept: application/geo+json` header:

```http
# format parameter
GET /ngsi-ld/v1/entities?type=Store&format=geojson

# Accept header
GET /ngsi-ld/v1/entities?type=Store
Accept: application/geo+json
```

### Response Format

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "Store1",
      "geometry": {
        "type": "Point",
        "coordinates": [139.6917, 35.6895]
      },
      "properties": {
        "type": "Store",
        "name": "Tokyo Store",
        "category": "retail"
      }
    },
    {
      "type": "Feature",
      "id": "Store2",
      "geometry": {
        "type": "Point",
        "coordinates": [139.7454, 35.6586]
      },
      "properties": {
        "type": "Store",
        "name": "Shinagawa Store",
        "category": "retail"
      }
    }
  ]
}
```

### @context in NGSI-LD

When outputting GeoJSON in NGSI-LD, `@context` is included at the FeatureCollection level:

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "type": "FeatureCollection",
  "features": [...]
}
```

### Content-Type

Response header for GeoJSON output:

```http
Content-Type: application/geo+json
```

### Usage Examples

```bash
# GeoJSON output in NGSIv2
curl "http://localhost:3000/v2/entities?type=Store&options=geojson" \
  -H "Fiware-Service: smartcity"

# GeoJSON output in NGSI-LD (format parameter)
curl "http://localhost:3000/ngsi-ld/v1/entities?type=Store&format=geojson" \
  -H "Fiware-Service: smartcity"

# GeoJSON output in NGSI-LD (Accept header)
curl "http://localhost:3000/ngsi-ld/v1/entities?type=Store" \
  -H "Fiware-Service: smartcity" \
  -H "Accept: application/geo+json"

# Combine spatial ID search with GeoJSON output
curl "http://localhost:3000/v2/entities?spatialId=20/0/929592/410773&options=geojson" \
  -H "Fiware-Service: smartcity"
```

### Notes

- Entities without a `location` attribute are output as `geometry: null`
- GeoJSON output can be used together with the `keyValues` option
- Geometry types including Polygon, LineString, MultiPoint, etc. are supported

---

## Vector Tiles

Entities can be output as GeoJSON vector tiles based on the XYZ tile scheme. Optimized for efficiently displaying large numbers of entities on a map.

### Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /v2/tiles` | TileJSON metadata (NGSIv2) |
| `GET /v2/tiles/{z}/{x}/{y}.geojson` | GeoJSON tile (NGSIv2) |
| `GET /ngsi-ld/v1/tiles` | TileJSON metadata (NGSI-LD) |
| `GET /ngsi-ld/v1/tiles/{z}/{x}/{y}.geojson` | GeoJSON tile (NGSI-LD) |

### TileJSON Metadata

Returns metadata conforming to the TileJSON 3.0 specification:

```bash
curl "http://localhost:3000/v2/tiles" \
  -H "Fiware-Service: smartcity"
```

**Response Example**

```json
{
  "tilejson": "3.0.0",
  "tiles": ["http://localhost:3000/v2/tiles/{z}/{x}/{y}.geojson"],
  "name": "GeonicDB Vector Tiles",
  "description": "GeoJSON vector tiles for NGSI entities",
  "minzoom": 0,
  "maxzoom": 22,
  "bounds": [-180, -85.051129, 180, 85.051129],
  "center": [0, 0, 2]
}
```

### Retrieve GeoJSON Tile

Retrieve entities within a tile in GeoJSON format by specifying XYZ coordinates:

```bash
# Zoom level 14 tile around Tokyo
curl "http://localhost:3000/v2/tiles/14/14549/6451.geojson" \
  -H "Fiware-Service: smartcity"
```

**Query Parameters**

| Parameter | Description |
|-----------|-------------|
| `type` | Filter by entity type |
| `attrs` | Specify attributes to output as a comma-separated list |

**Usage Examples**

```bash
# Retrieve only a specific entity type
curl "http://localhost:3000/v2/tiles/14/14549/6451.geojson?type=Store" \
  -H "Fiware-Service: smartcity"

# Retrieve only specific attributes
curl "http://localhost:3000/v2/tiles/14/14549/6451.geojson?attrs=name,category" \
  -H "Fiware-Service: smartcity"
```

**Response Example**

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "Store1",
      "geometry": {
        "type": "Point",
        "coordinates": [139.7671, 35.6812]
      },
      "properties": {
        "entityId": "Store1",
        "entityType": "Store",
        "name": "Tokyo Station Store"
      }
    }
  ],
  "totalCount": 1,
  "tileCoordinates": {
    "z": 14,
    "x": 14549,
    "y": 6451
  }
}
```

### Clustering

When the number of entities in a tile exceeds the threshold (default: 1000), they are automatically clustered. When clustered, a single cluster Feature with the centroid coordinates of all entities in the tile is returned.

**Response Example When Clustered**

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "cluster-14-14549-6451",
      "geometry": {
        "type": "Point",
        "coordinates": [139.7654, 35.6798]
      },
      "properties": {
        "cluster": true,
        "point_count": 1523,
        "entityTypes": {
          "Store": 850,
          "Restaurant": 673
        }
      }
    }
  ],
  "totalCount": 1523,
  "tileCoordinates": {
    "z": 14,
    "x": 14549,
    "y": 6451
  },
  "clustered": true
}
```

**Response Headers**

| Header | Description |
|--------|-------------|
| `X-Tile-Mode` | `individual` (individual entities) or `clustered` (clustering) |
| `X-Total-Count` | Total number of entities in the tile |

### Configuration

| Environment Variable | Default | Description |
|----------------------|---------|-------------|
| `MAX_ENTITIES_PER_REQUEST` | `1000` | Threshold for clustering (clustering occurs at or above this value) |

### References

- [TileJSON 3.0 Specification](https://github.com/mapbox/tilejson-spec/tree/master/3.0.0)
- [RFC 7946 GeoJSON](https://datatracker.ietf.org/doc/html/rfc7946)
- [XYZ Tile Scheme](https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames)

---

## Coordinate Reference System (CRS)

By specifying a Coordinate Reference System, coordinates can be transformed between different geodetic systems.

### Supported CRS

| CRS | EPSG | Description | Use Case |
|-----|------|-------------|----------|
| WGS84 | EPSG:4326 | World Geodetic System 1984 (default) | GPS, international standard |
| JGD2011 | EPSG:6668 | Japanese Geodetic Datum 2011 | High-precision surveying in Japan |
| Web Mercator | EPSG:3857 | Web Mercator projection | Google Maps, OpenStreetMap, etc. |

### How to Specify CRS

#### NGSIv2

Specify the EPSG code using the `crs` query parameter:

```http
# Retrieve with JGD2011 coordinates
GET /v2/entities?type=Store&crs=EPSG:6668

# Retrieve with Web Mercator coordinates
GET /v2/entities?type=Store&crs=EPSG:3857
```

#### NGSI-LD

NGSI-LD supports both EPSG short form and URN format:

```http
# EPSG short form
GET /ngsi-ld/v1/entities?type=Store&crs=EPSG:6668

# URN format (ETSI-compliant)
GET /ngsi-ld/v1/entities?type=Store&crs=urn:ogc:def:crs:EPSG::6668
```

### Response Headers

Responses to requests specifying a CRS include the `Content-Crs` header:

```text
Content-Crs: EPSG:6668
```

When a URN format is specified in NGSI-LD, it is returned in URN format:

```text
Content-Crs: urn:ogc:def:crs:EPSG::6668
```

### Coordinate Input/Output

#### When Querying (Input)

Geo-query coordinates are interpreted in the specified CRS:

```http
# Proximity search with JGD2011 coordinates
GET /v2/entities?georel=near;maxDistance:5000&geometry=point&coords=35.6812,139.7671&crs=EPSG:6668
```

#### When Creating Entities

Specifying the `crs` parameter when creating an entity causes the input coordinates to be interpreted as the specified CRS and internally converted to WGS84 for storage:

```bash
# Create entity with Web Mercator coordinates
curl -X POST "http://localhost:3000/v2/entities?crs=EPSG:3857" \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -d '{
    "id": "Store1",
    "type": "Store",
    "location": {
      "type": "geo:json",
      "value": {
        "type": "Point",
        "coordinates": [15559764.8, 4252367.9]
      }
    }
  }'
```

#### When Retrieving (Output)

Specifying the `crs` parameter when retrieving returns coordinates converted to the specified CRS:

```bash
# Retrieve with JGD2011 coordinates
curl "http://localhost:3000/v2/entities/Store1?crs=EPSG:6668" \
  -H "Fiware-Service: smartcity"
```

### Coordinate Conversion Accuracy

| Conversion | Accuracy |
|------------|----------|
| WGS84 ↔ JGD2011 | Several cm to tens of cm |
| WGS84 ↔ Web Mercator | Depends on calculation precision (within ±85 degrees latitude) |

### Usage Examples

#### Usage in NGSIv2

```bash
# Create entity with JGD2011 coordinates
curl -X POST "http://localhost:3000/v2/entities?crs=EPSG:6668" \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -d '{
    "id": "TokyoTower",
    "type": "Landmark",
    "name": { "type": "Text", "value": "Tokyo Tower" },
    "location": {
      "type": "geo:json",
      "value": {
        "type": "Point",
        "coordinates": [139.745438, 35.658581]
      }
    }
  }'

# Retrieve with Web Mercator coordinates
curl "http://localhost:3000/v2/entities/TokyoTower?crs=EPSG:3857" \
  -H "Fiware-Service: smartcity"
```

#### Usage in NGSI-LD

```bash
# Create entity specifying CRS in URN format
curl -X POST "http://localhost:3000/ngsi-ld/v1/entities?crs=urn:ogc:def:crs:EPSG::6668" \
  -H "Content-Type: application/ld+json" \
  -H "Fiware-Service: smartcity" \
  -d '{
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
    "id": "urn:ngsi-ld:Landmark:TokyoTower",
    "type": "Landmark",
    "name": { "type": "Property", "value": "Tokyo Tower" },
    "location": {
      "type": "GeoProperty",
      "value": {
        "type": "Point",
        "coordinates": [139.745438, 35.658581]
      }
    }
  }'

# Retrieve list with JGD2011 coordinates
curl "http://localhost:3000/ngsi-ld/v1/entities?type=Landmark&crs=EPSG:6668" \
  -H "Fiware-Service: smartcity"
```

### Errors

| Error | HTTP Code | Description |
|-------|-----------|-------------|
| Unsupported CRS | 400 | Specified CRS code is not supported |
| Invalid CRS format | 400 | Invalid CRS format specified |
| Coordinates out of range | 400 | Coordinates exceeding ±85 degrees latitude in Web Mercator |

### Limitations

- Web Mercator (EPSG:3857) does not support areas beyond ±85 degrees latitude
- All coordinates are internally stored in WGS84
- The [proj4](https://github.com/proj4js/proj4js) library is used for coordinate conversion

### References

- [OGC API Features CRS Extension](https://docs.ogc.org/is/18-058r1/18-058r1.html)
- [EPSG Geodetic Parameter Registry](https://epsg.io/)
- [ETSI NGSI-LD CRS Specification](https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/01.08.01_60/gs_CIM009v010801p.pdf)

---

## Data Catalog API

Outputs entity type information in DCAT-AP format and provides CKAN harvest-compatible endpoints.

### DCAT-AP Catalog

```http
GET /catalog
```

Outputs the entire catalog in DCAT-AP format as JSON-LD.

**Response Example**

```json
{
  "@context": {
    "dcat": "http://www.w3.org/ns/dcat#",
    "dct": "http://purl.org/dc/terms/",
    "foaf": "http://xmlns.com/foaf/0.1/"
  },
  "@type": "dcat:Catalog",
  "@id": "urn:ngsi-ld:Catalog:default",
  "dct:title": "Context Data Catalog",
  "dct:publisher": {
    "@type": "foaf:Organization",
    "foaf:name": "GeonicDB"
  },
  "dcat:dataset": [...]
}
```

### Dataset List

```http
GET /catalog/datasets
```

Outputs a list of datasets in DCAT format.

**Query Parameters**

| Parameter | Description |
|-----------|-------------|
| `limit` | Number of datasets to retrieve |
| `offset` | Number of datasets to skip |

### Individual Dataset

```http
GET /catalog/datasets/{datasetId}
```

Outputs detailed information about an individual dataset (entity type).

### Sample Data

```http
GET /catalog/datasets/{datasetId}/sample
```

Retrieves sample data for a dataset.

**Query Parameters**

| Parameter | Description | Default |
|-----------|-------------|---------|
| `limit` | Number of samples to retrieve | 5 |

### CKAN-Compatible API

Provides an API compatible with CKAN data catalog harvesters.

#### Package List

```http
GET /catalog/ckan/package_list
```

Retrieves a list of IDs for all packages (datasets).

**Response Example**

```json
{
  "success": true,
  "result": ["room", "sensor"]
}
```

#### Package Details

```http
GET /catalog/ckan/package_show?id={package_id}
```

Retrieves detailed information for a specific package.

**Response Example**

```json
{
  "success": true,
  "result": {
    "id": "room",
    "name": "room",
    "title": "Room",
    "num_resources": 2,
    "resources": [
      {
        "id": "room-0",
        "url": "/v2/entities?type=Room",
        "format": "JSON"
      }
    ]
  }
}
```

#### Package List with Resources

```http
GET /catalog/ckan/current_package_list_with_resources
```

Retrieves a paginated list of packages with resource information.

**Query Parameters**

| Parameter | Description |
|-----------|-------------|
| `limit` | Number of packages to retrieve |
| `offset` | Number of packages to skip |

For details, see the External Integration Documentation.

---

## CADDE Integration

Provides integration functionality with CADDE (Connector Architecture for Decentralized Data Exchange) connectors.

### Overview

CADDE is a Japanese data exchange architecture that enables data sharing across different sectors. This Context Broker accepts requests from CADDE connectors and returns responses with provenance information.

### Enabling

CADDE functionality is disabled by default. Use the Admin API (`PUT /admin/cadde`) to manage the configuration:

```bash
# Enable CADDE configuration
curl -X PUT "https://api.example.com/admin/cadde" \
  -H "Authorization: Bearer <super_admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "authEnabled": false,
    "defaultProvider": "my-provider"
  }'
```

| Configuration Item | Default | Description |
|--------------------|---------|-------------|
| `enabled` | `false` | Enable CADDE functionality |
| `authEnabled` | `false` | Enable Bearer authentication |
| `defaultProvider` | - | Default provider ID |
| `jwtIssuer` | - | Expected issuer (`iss`) claim for JWT validation |
| `jwtAudience` | - | Expected audience (`aud`) claim for JWT validation |
| `jwksUrl` | - | JWKS endpoint URL for signature verification (HTTPS required) |

Configuration is stored in MongoDB, enabling dynamic changes via API after deployment.

### Request Headers

Requests from CADDE connectors include the following headers:

| Header | Required | Description |
|--------|----------|-------------|
| `x-cadde-resource-url` | - | URL of the resource being accessed |
| `x-cadde-resource-api-type` | - | API type (e.g., `api/ngsi`) |
| `x-cadde-provider` | - | Data provider ID |
| `x-cadde-options` | - | Additional options (tenant headers, etc.) |

### x-cadde-options Format

Tenant information and other details can be specified in the `x-cadde-options` header:

```text
x-cadde-options: Fiware-Service:smartcity, Fiware-ServicePath:/sensors
```

Values specified in this header take priority over regular HTTP headers.

### Provenance Response Headers

Responses to CADDE requests include the following provenance headers:

| Header | Description |
|--------|-------------|
| `x-cadde-provenance-id` | Unique identifier for the request (uses Fiware-Correlator) |
| `x-cadde-provenance-timestamp` | Response generation time (ISO 8601 format) |
| `x-cadde-provenance-provider` | Data provider ID |
| `x-cadde-provenance-resource-url` | URL of the resource accessed |

### Authentication

When `CADDE_AUTH_ENABLED=true`, CADDE requests require Bearer authentication:

```http
Authorization: Bearer <token>
```

If no token is present, a `401 Unauthorized` error is returned.

#### JWT Validation (Optional)

Setting `CADDE_JWKS_URL` enables full JWT validation for Bearer tokens:

| Feature | Description |
|---------|-------------|
| **Signature verification** | Supports RS256 or ES256 algorithms. Automatically fetches public keys from the JWKS endpoint |
| **Expiration verification** | Validates the `exp` (expiration) claim and rejects expired tokens |
| **Issued-at verification** | Validates the `iat` (issued-at) claim and rejects tokens issued in the future |
| **Issuer verification** | Validates the `iss` claim if `CADDE_JWT_ISSUER` is configured |
| **Audience verification** | Validates the `aud` claim if `CADDE_JWT_AUDIENCE` is configured |

**Configuration Example:**

```bash
# Enable full JWT validation via Admin API
curl -X PUT "https://api.example.com/admin/cadde" \
  -H "Authorization: Bearer <super_admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "authEnabled": true,
    "jwtIssuer": "https://auth.example.com",
    "jwtAudience": "my-api",
    "jwksUrl": "https://auth.example.com/.well-known/jwks.json"
  }'
```

**Error Responses:**

When JWT validation fails, detailed error messages are returned:

| Error | Description |
|-------|-------------|
| `Malformed JWT token` | Invalid token format |
| `Invalid token signature` | Invalid signature |
| `Token has expired` | Token has expired |
| `Invalid token issuer` | Issuer claim does not match |
| `Invalid token audience` | Audience claim does not match |
| `Unsupported signing algorithm` | Unsupported algorithm (other than RS256/ES256) |
| `Unable to fetch signing keys` | Failed to access the JWKS endpoint |
| `Signing key not found` | The key with the specified kid does not exist in JWKS |

**Note:** If `jwksUrl` is not configured, only the presence of the token is checked (for backward compatibility).

### Usage Examples

```bash
# Retrieve entities with CADDE headers
curl "http://localhost:3000/v2/entities" \
  -H "x-cadde-resource-url: http://localhost:3000/v2/entities" \
  -H "x-cadde-resource-api-type: api/ngsi" \
  -H "x-cadde-provider: provider-001" \
  -H "x-cadde-options: Fiware-Service:smartcity, Fiware-ServicePath:/"

# Example response headers:
# x-cadde-provenance-id: 550e8400-e29b-41d4-a716-446655440000
# x-cadde-provenance-timestamp: 2026-01-26T12:00:00.000Z
# x-cadde-provenance-provider: provider-001
# x-cadde-provenance-resource-url: https://localhost/v2/entities
```

### Usage with NGSI-LD API

CADDE headers can also be used with the NGSI-LD API:

```bash
curl "http://localhost:3000/ngsi-ld/v1/entities" \
  -H "x-cadde-resource-url: http://localhost:3000/ngsi-ld/v1/entities" \
  -H "x-cadde-resource-api-type: api/ngsi-ld" \
  -H "x-cadde-provider: ld-provider" \
  -H "x-cadde-options: Fiware-Service:smartcity"
```

### CADDE Connector v4 API

Dedicated endpoints conforming to the CADDE connector v4 specification (available only when CADDE configuration is enabled, configured via `PUT /admin/cadde`).

Reference: https://github.com/CADDE-sip/connector

#### Endpoint List

| Method | Path | Description |
|--------|------|-------------|
| GET | `/cadde/api/v4/catalog` | Catalog search (cross-domain search / detailed search) |
| GET | `/cadde/api/v4/entities` | NGSI data exchange |

#### Catalog Search (`/cadde/api/v4/catalog`)

Specify the search type using the `x-cadde-search` header:

| Search Type | Header Value | Description |
|-------------|--------------|-------------|
| Cross-domain search | `x-cadde-search: meta` | Returns dataset list in CKAN format (keyword filtering via `q` parameter) |
| Detailed search | `x-cadde-search: detail` | Returns details of an individual dataset (specified via `id` or `fq` parameter) |

CADDE-specific fields are added to the response:
- `caddec_dataset_id_for_detail`: Dataset ID for detailed search
- `caddec_provider_id`: Provider ID (if `CADDE_DEFAULT_PROVIDER` is configured)
- `caddec_resource_type`: Resource type (`api/ngsi`)

```bash
# Cross-domain search
curl "http://localhost:3000/cadde/api/v4/catalog?q=sensor" \
  -H "x-cadde-search: meta" \
  -H "x-cadde-resource-url: https://example.com/cadde/api/v4/catalog" \
  -H "Fiware-Service: smartcity"

# Detailed search
curl "http://localhost:3000/cadde/api/v4/catalog?id=sensor" \
  -H "x-cadde-search: detail" \
  -H "x-cadde-resource-url: https://example.com/cadde/api/v4/catalog" \
  -H "Fiware-Service: smartcity"
```

#### NGSI Data Exchange (`/cadde/api/v4/entities`)

Parses query parameters from the `x-cadde-resource-url` header to retrieve entities.

| Header | Required | Description |
|--------|----------|-------------|
| `x-cadde-resource-url` | Yes | Resource URL (containing type, id, q, attrs, limit, offset as query parameters) |
| `x-cadde-resource-api-type` | - | Response format: `api/ngsi` (default) or `api/ngsi-ld` |
| `x-cadde-provider` | - | Data provider ID |

```bash
# Retrieve entities in NGSIv2 format
curl "http://localhost:3000/cadde/api/v4/entities" \
  -H "x-cadde-resource-url: https://example.com/v2/entities?type=Sensor&q=temperature>20" \
  -H "x-cadde-resource-api-type: api/ngsi" \
  -H "x-cadde-provider: provider-001" \
  -H "Fiware-Service: smartcity"

# Retrieve entities in NGSI-LD format
curl "http://localhost:3000/cadde/api/v4/entities" \
  -H "x-cadde-resource-url: https://example.com/ngsi-ld/v1/entities?type=Sensor" \
  -H "x-cadde-resource-api-type: api/ngsi-ld" \
  -H "x-cadde-provider: provider-001" \
  -H "Fiware-Service: smartcity"
```

#### Error Response Format

Error responses for CADDE v4 endpoints are in the following format:

```json
{ "detail": "Resource not found", "status": 404 }
```

#### Authentication

CADDE v4 endpoints bypass GeonicDB authentication (`requireAuth`). Authentication is handled by CADDE JWT validation (`processCaddeRequestAsync`).

### References

- [CADDE (Cross-sector Data Exchange Infrastructure)](https://www.cio.go.jp/cadde)
- [CADDE-sip/connector](https://github.com/CADDE-sip/connector)
- [DATA-EX](https://data-ex.jp/)

---

## Event Streaming

Real-time entity change streaming using WebSocket API Gateway. Enabled with `EVENT_STREAMING_ENABLED=true`.

### Connection

```text
wss://{api-id}.execute-api.{region}.amazonaws.com/{stage}?tenant={tenantName}
```

### Client Messages

| Action | Description |
|--------|-------------|
| `subscribe` | Set filters by entity type/ID pattern |
| `ping` | Keep-alive (`pong` response) |

### Server Events

| Type | Description |
|------|-------------|
| `entityCreated` | An entity was created |
| `entityUpdated` | An entity was updated |
| `entityDeleted` | An entity was deleted |

For details, see the [Event Streaming Documentation](../features/subscriptions.md).

---

## Error Responses

### NGSIv2 Error Format

```json
{
  "error": "NotFound",
  "description": "The requested entity has not been found"
}
```

### NGSI-LD Error Format (RFC 7807 ProblemDetails)

NGSI-LD API error responses are returned in [RFC 7807](https://tools.ietf.org/html/rfc7807) ProblemDetails format.
Content-Type is `application/json` (to conform to the ETSI GS CIM 009 specification, standard JSON MIME type is used instead of RFC 7807's `application/problem+json`).

```json
{
  "type": "https://uri.etsi.org/ngsi-ld/errors/ResourceNotFound",
  "title": "Resource Not Found",
  "status": 404,
  "detail": "Entity urn:ngsi-ld:Room:001 not found"
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| `200` | Success (with data) |
| `201` | Created successfully |
| `204` | Success (no data) |
| `207` | Partial success (batch operations) |
| `400` | Bad request |
| `403` | Forbidden (authorization error) |
| `404` | Resource not found |
| `405` | Method not allowed (NGSI-LD, with `Allow` header) |
| `409` | Conflict (already exists, etc.) |
| `500` | Internal server error |

---

## Implementation Status

### Implemented Features

| Feature | NGSIv2 | NGSI-LD |
|---------|--------|---------|
| Entity CRUD | Yes | Yes |
| Attribute operations | Yes | Yes |
| Direct attribute value retrieval/update | Yes | - |
| Batch operations | Yes | Yes |
| Subscriptions (HTTP notifications) | Yes | Yes |
| Subscriptions (MQTT notifications) | Yes | Yes |
| Event streaming (WebSocket) | Yes | Yes |
| Entity types | Yes | - |
| Query language (q parameter) | Yes | Yes |
| Sorting (orderBy, orderDirection) | Yes | Yes |
| Metadata control (metadata / sysAttrs) | Yes | Yes |
| Geo-queries (coveredBy, within, intersects, disjoint) | Yes | Yes |
| Spatial ID search (ZFXY format) | Yes | Yes |
| GeoJSON output | Yes | Yes |
| Coordinate Reference System (CRS) conversion | Yes | Yes |
| Multi-tenancy | Yes | Yes |
| Pagination | Yes | Yes |
| keyValues format | Yes | Yes |
| Registrations | Yes | Yes |
| Context providers (federation/query forwarding) | Yes | Yes |
| Context providers (update forwarding) | Yes | Yes |
| CADDE integration | Yes | Yes |
| Authentication API (JWT-based) | Yes | Yes |
| User/tenant management API | Yes | Yes |
| `/version` endpoint | Yes | - |
| `/.well-known/ngsi-ld` | - | Yes |
| Health check (`/health`) | Yes | Yes |

### Limitations

| Feature | Status | Notes |
|---------|--------|-------|
| `near` geo-query (proximity search) | Supported | Point geometry only; supports distance sorting and distance information with `orderByDistance=true` |
| `minDistance` / `maxDistance` | Supported | Specified in meters |

---

## Usage Examples

### Creating an Entity with cURL

```bash
curl -X POST "https://api.example.com/v2/entities" \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -H "Fiware-ServicePath: /buildings" \
  -d '{
    "id": "Room1",
    "type": "Room",
    "temperature": { "type": "Float", "value": 23.5 },
    "humidity": { "type": "Float", "value": 60.0 }
  }'
```

### Retrieving an Entity

```bash
curl -X GET "https://api.example.com/v2/entities/Room1" \
  -H "Fiware-Service: smartcity" \
  -H "Fiware-ServicePath: /buildings"
```

### Conditional Query

```bash
curl -X GET "https://api.example.com/v2/entities?type=Room&q=temperature>25" \
  -H "Fiware-Service: smartcity"
```

### Geo-Query (Polygon Area Search)

```bash
curl -X GET "https://api.example.com/v2/entities?type=Place&georel=coveredBy&geometry=polygon&coords=34,138;34,141;37,141;37,138;34,138" \
  -H "Fiware-Service: smartcity"
```

### Creating a Subscription

```bash
curl -X POST "https://api.example.com/v2/subscriptions" \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -d '{
    "description": "High temperature alert",
    "subject": {
      "entities": [{ "type": "Room" }],
      "condition": {
        "attrs": ["temperature"],
        "expression": { "q": "temperature>30" }
      }
    },
    "notification": {
      "http": { "url": "https://webhook.example.com/alert" },
      "attrs": ["temperature", "id"]
    }
  }'
```

### Creating an NGSI-LD Entity

```bash
curl -X POST "https://api.example.com/ngsi-ld/v1/entities" \
  -H "Content-Type: application/ld+json" \
  -H "Fiware-Service: smartcity" \
  -d '{
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
    "id": "urn:ngsi-ld:Room:001",
    "type": "Room",
    "temperature": { "type": "Property", "value": 23.5 }
  }'
```

---

## Endpoint Reference

This section summarizes pagination, authentication/authorization, and status code information for all GeonicDB API endpoints.

### API Categories

| API Category | Base Path | Authentication | Content-Type |
|--------------|-----------|----------------|--------------|
| Meta/Health | `/` | Not required*† | `application/json` |
| Authentication | `/auth` | Not required | `application/json` |
| User | `/me` | Required | `application/json` |
| NGSIv2 | `/v2` | Required* | `application/json` |
| NGSI-LD | `/ngsi-ld/v1` | Required* | `application/ld+json` |
| Admin | `/admin` | Required (super_admin / tenant_admin) | `application/json` |
| Catalog | `/catalog` | Required* | `application/json` |

\* Authentication not required when `AUTH_ENABLED=false`

† `/statistics`, `/cache/statistics`, `/metrics` require authentication when `AUTH_ENABLED=true`

### Public Endpoints (Meta/Health)

Endpoints accessible without authentication.

| Endpoint | Method | Description | Success | Error |
|----------|--------|-------------|---------|-------|
| `/llms.txt` | GET | API documentation (llms.txt) | 200 | - |
| `/version` | GET | FIWARE Orion-compatible version information | 200 | - |
| `/health` | GET | Basic health check | 200 | - |
| `/health/live` | GET | Kubernetes liveness probe | 200 | - |
| `/health/ready` | GET | Kubernetes readiness probe | 200 | 503 |
| `/.well-known/ngsi-ld` | GET | NGSI-LD API discovery | 200 | - |
| `/api.json` | GET | API reference (JSON) | 200 | - |
| `/openapi.json` | GET | OpenAPI 3.0 specification | 200 | - |
| `/statistics` | GET | FIWARE Orion-compatible statistics (authentication required) | 200 | 401 |
| `/cache/statistics` | GET | Cache statistics (authentication required) | 200 | 401 |
| `/metrics` | GET | Prometheus metrics (authentication required) | 200 | 401 |
| `/tools.json` | GET | AI tool definitions (Claude Tool Use / OpenAI Function Calling) | 200 | - |
| `/.well-known/ai-plugin.json` | GET | AI plugin manifest | 200 | - |
| `/mcp` | POST | MCP (Model Context Protocol) Streamable HTTP endpoint | 200 | 400, 405, 500 |

### Authentication Endpoints

- `/auth/*` is available only when `AUTH_ENABLED=true`
- `/oauth/token` is available only when `OAUTH_ENABLED=true`

| Endpoint | Method | Description | Success | Error |
|----------|--------|-------------|---------|-------|
| `/auth/login` | POST | User login (JWT) | 200 | 400, 401 |
| `/auth/refresh` | POST | Token refresh | 200 | 400, 401 |
| `/auth/logout` | POST | Logout (invalidate all sessions, authentication required) | 204 | 401 |
| `/oauth/token` | POST | OAuth token acquisition (M2M) | 200 | 400, 401 |

### User Endpoints

Endpoints for authenticated users to manage their own information.

| Endpoint | Method | Description | Success | Error | Minimum Role |
|----------|--------|-------------|---------|-------|--------------|
| `/me` | GET | Retrieve own profile | 200 | 401 | user |
| `/me/password` | POST | Change password | 204 | 400, 401 | user |

### NGSIv2 / NGSI-LD Endpoints

For detailed endpoint specifications, see:
- [NGSIv2 API Reference](./ngsiv2.md)
- [NGSI-LD API Reference](./ngsild.md)

### Admin API

API for managing tenants and users. Endpoints require either `super_admin` or `tenant_admin` role (`tenant_admin` has own-tenant scope only).

#### Tenant Management

| Endpoint | Method | Description | Success | Error | Pagination |
|----------|--------|-------------|---------|-------|------------|
| `/admin/tenants` | GET | List tenants | 200 | 400, 401, 403 | Yes (max: 100) |
| `/admin/tenants` | POST | Create tenant | 201 | 400, 401, 403, 409 | - |
| `/admin/tenants/{tenantId}` | GET | Get tenant | 200 | 401, 403, 404 | - |
| `/admin/tenants/{tenantId}` | PATCH | Update tenant | 204 | 400, 401, 403, 404, 409 | - |
| `/admin/tenants/{tenantId}` | DELETE | Delete tenant (Crypto-Shredding with `?shred=true`) | 204 / 200 | 400, 401, 403, 404 | - |
| `/admin/tenants/{tenantId}/deletion-report` | GET | Get deletion report | 200 | 401, 403, 404 | - |
| `/admin/tenants/{tenantId}/activate` | POST | Activate tenant | 204 | 401, 403, 404 | - |
| `/admin/tenants/{tenantId}/deactivate` | POST | Deactivate tenant | 204 | 401, 403, 404 | - |
| `/admin/tenants/{tenantId}/ip-restrictions` | GET | Get tenant IP restrictions | 200 | 401, 403, 404 | - |
| `/admin/tenants/{tenantId}/ip-restrictions` | PUT | Update tenant IP restrictions | 200 | 400, 401, 403, 404 | - |
| `/admin/tenants/{tenantId}/ip-restrictions` | DELETE | Delete tenant IP restrictions | 204 | 401, 403, 404 | - |
| `/admin/tenants/{tenantId}/users` | GET | List tenant members (tenant_admin: own tenant only) | 200 | 401, 403, 404 | Yes (max: 100) |
| `/admin/tenants/{tenantId}/users/{userId}` | PUT | Add user to tenant (tenant_admin: own tenant only) | 200 | 400, 401, 403, 404 | - |
| `/admin/tenants/{tenantId}/users/{userId}` | DELETE | Remove user from tenant (tenant_admin: own tenant only) | 204 | 400, 401, 403, 404 | - |

#### User Management

| Endpoint | Method | Description | Success | Error | Pagination |
|----------|--------|-------------|---------|-------|------------|
| `/admin/users` | GET | List users | 200 | 400, 401, 403 | Yes (max: 100) |
| `/admin/users` | POST | Create user | 201 | 400, 401, 403, 409 | - |
| `/admin/users/{userId}` | GET | Get user | 200 | 401, 403, 404 | - |
| `/admin/users/{userId}` | PATCH | Update user | 204 | 400, 401, 403, 404, 409 | - |
| `/admin/users/{userId}` | DELETE | Delete user | 204 | 401, 403, 404 | - |
| `/admin/users/{userId}/activate` | POST | Activate user | 204 | 401, 403, 404 | - |
| `/admin/users/{userId}/deactivate` | POST | Deactivate user | 204 | 401, 403, 404 | - |
| `/admin/users/{userId}/unlock` | POST | Unlock login | 200 | 400, 401, 403, 404 | - |
| `/admin/users/{userId}/tenants` | GET | List tenants the user belongs to (self or super_admin) | 200 | 401, 403 | Yes (max: 100) |

#### Policy Management (XACML 3.0 Authorization, super_admin / tenant_admin)

| Endpoint | Method | Description | Success | Error | Pagination |
|----------|--------|-------------|---------|-------|------------|
| `/admin/policies` | GET | List policies | 200 | 400, 401, 403 | Yes (max: 100) |
| `/admin/policies` | POST | Create policy | 201 | 400, 401, 403, 409 | - |
| `/admin/policies/{policyId}` | GET | Get policy | 200 | 401, 403, 404 | - |
| `/admin/policies/{policyId}` | PATCH | Partial policy update | 200 | 400, 401, 403, 404 | - |
| `/admin/policies/{policyId}` | PUT | Replace policy | 200 | 400, 401, 403, 404 | - |
| `/admin/policies/{policyId}` | DELETE | Delete policy | 204 | 401, 403, 404 | - |
| `/admin/policies/{policyId}/activate` | POST | Activate policy | 200 | 401, 403, 404 | - |
| `/admin/policies/{policyId}/deactivate` | POST | Deactivate policy | 200 | 401, 403, 404 | - |

#### OAuth Client Management

| Endpoint | Method | Description | Success | Error | Pagination |
|----------|--------|-------------|---------|-------|------------|
| `/admin/oauth-clients` | GET | List OAuth clients | 200 | 400, 401, 403 | Yes (max: 100) |
| `/admin/oauth-clients` | POST | Create OAuth client | 201 | 400, 401, 403 | - |
| `/admin/oauth-clients/{clientId}` | GET | Get OAuth client | 200 | 401, 403, 404 | - |
| `/admin/oauth-clients/{clientId}` | PATCH | Update OAuth client | 200 | 400, 401, 403, 404 | - |
| `/admin/oauth-clients/{clientId}` | DELETE | Delete OAuth client | 204 | 401, 403, 404 | - |

#### CADDE Configuration Management

Manage CADDE (cross-sector data exchange infrastructure) configuration via API. Configuration is stored in MongoDB and no environment variables are needed.

| Endpoint | Method | Description | Success | Error | Pagination |
|----------|--------|-------------|---------|-------|------------|
| `/admin/cadde` | GET | Get CADDE configuration | 200 | 401, 403 | - |
| `/admin/cadde` | PUT | Update CADDE configuration (upsert) | 200 | 400, 401, 403 | - |
| `/admin/cadde` | DELETE | Delete CADDE configuration (disable) | 204 | 401, 403 | - |

**Request Body (PUT)**

```json
{
  "enabled": true,
  "authEnabled": true,
  "defaultProvider": "provider-001",
  "jwtIssuer": "https://auth.example.com",
  "jwtAudience": "my-api",
  "jwksUrl": "https://auth.example.com/.well-known/jwks.json"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `enabled` | boolean | Yes | Enable/disable CADDE functionality |
| `authEnabled` | boolean | Yes | Enable/disable Bearer authentication |
| `defaultProvider` | string | - | Default provider ID |
| `jwtIssuer` | string | - | JWT issuer claim validation value |
| `jwtAudience` | string | - | JWT audience claim validation value |
| `jwksUrl` | string | - | JWKS public key endpoint URL (HTTPS required) |

#### Rule Engine Management

| Endpoint | Method | Description | Success | Error | Pagination |
|----------|--------|-------------|---------|-------|------------|
| `/rules` | GET | List rules | 200 | 400, 401, 403 | Yes (max: 100) |
| `/rules` | POST | Create rule | 201 | 400, 401, 403, 409 | - |
| `/rules/{ruleId}` | GET | Get rule | 200 | 401, 403, 404 | - |
| `/rules/{ruleId}` | PATCH | Update rule | 204 | 400, 401, 403, 404 | - |
| `/rules/{ruleId}` | DELETE | Delete rule | 204 | 401, 403, 404 | - |
| `/rules/{ruleId}/activate` | POST | Activate rule | 200 | 401, 403, 404 | - |
| `/rules/{ruleId}/deactivate` | POST | Deactivate rule | 200 | 401, 403, 404 | - |

### Custom Data Models API

API for managing tenant-specific custom data models. Requires JWT authentication; XACML policy-based authorization allows `tenant_admin` and `user` roles to manage custom data models within their tenant.

**Related Documentation**: [SMART_DATA_MODELS.md](../features/smart-data-models.md)

| Endpoint | Method | Description | Success | Error | Pagination |
|----------|--------|-------------|---------|-------|------------|
| `/custom-data-models` | GET | List custom data models | 200 | 400, 401, 403 | Yes (max: 100) |
| `/custom-data-models` | POST | Create custom data model | 201 | 400, 401, 403, 409 | - |
| `/custom-data-models/{type}` | GET | Get custom data model | 200 | 401, 403, 404 | - |
| `/custom-data-models/{type}` | PATCH | Update custom data model | 200 | 400, 401, 403, 404 | - |
| `/custom-data-models/{type}` | DELETE | Delete custom data model | 204 | 401, 403, 404 | - |

#### Entity Validation

When a custom data model is defined, validation is automatically performed when creating or updating entities. Validation applies only to models with `isActive: true`.

**Validation Checks:**

| Check | Description |
|-------|-------------|
| Required fields | Whether attributes with `required: true` are present |
| Type check | Type validation based on `valueType` (string, number, integer, boolean, array, object, GeoJSON) |
| minLength / maxLength | String length constraints |
| minimum / maximum | Numeric range constraints |
| pattern | Regular expression pattern match |
| enum | List of permitted values |

Validation failures return `400 Bad Request`:

```json
{
  "error": "BadRequest",
  "description": "Entity validation failed: temperature: Value (150) exceeds maximum (100)"
}
```

#### Automatic JSON Schema Generation

When a custom data model is created or updated, a JSON Schema (Draft 2020-12) is automatically generated from `propertyDetails` and included in the `jsonSchema` field of the response. It is also possible to specify `jsonSchema` manually.

#### @context Resolution Extension

In NGSI-LD responses, if a custom data model has a `contextUrl` configured, the custom context is automatically included in the entity's `@context` (returned as an array together with the core context).

### Catalog API

| Endpoint | Method | Description | Success | Error | Pagination |
|----------|--------|-------------|---------|-------|------------|
| `/catalog` | GET | Get DCAT-AP catalog | 200 | 401 | - |
| `/catalog/datasets` | GET | List datasets | 200 | 400, 401 | Yes (max: 1000) |
| `/catalog/datasets/{datasetId}` | GET | Get dataset | 200 | 401, 404 | - |
| `/catalog/datasets/{datasetId}/sample` | GET | Get sample data | 200 | 401, 404 | - |

### Vector Tiles API

| Endpoint | Method | Description | Success | Error |
|----------|--------|-------------|---------|-------|
| `/v2/tiles` | GET | Get TileJSON metadata (NGSIv2) | 200 | 401 |
| `/v2/tiles/{z}/{x}/{y}.geojson` | GET | Get GeoJSON tile (NGSIv2) | 200 | 400, 401 |
| `/ngsi-ld/v1/tiles` | GET | Get TileJSON metadata (NGSI-LD) | 200 | 401 |
| `/ngsi-ld/v1/tiles/{z}/{x}/{y}.geojson` | GET | Get GeoJSON tile (NGSI-LD) | 200 | 400, 401 |

### Event Streaming API

Real-time entity change streaming using WebSocket. Enabled with `EVENT_STREAMING_ENABLED=true`.

| Endpoint | Protocol | Description |
|----------|----------|-------------|
| `wss://{api-id}.execute-api.{region}.amazonaws.com/{stage}?tenant={name}` | WebSocket | Stream entity change events (authentication sent via `Authorization` header) |

For details, see the [Event Streaming Documentation](../features/subscriptions.md).

### Access Permissions Summary

| API Category | user | tenant_admin | super_admin |
|--------------|------|--------------|-------------|
| Public endpoints | Yes | Yes | Yes |
| `/auth/*` | Yes | Yes | Yes |
| `/me/*` | Yes | Yes | Yes |
| `/v2/*` | Yes (own tenant) | Yes (own tenant) | Yes (all tenants) |
| `/ngsi-ld/*` | Yes (own tenant) | Yes (own tenant) | Yes (all tenants) |
| `/catalog/*` | Yes (own tenant) | Yes (own tenant) | Yes (all tenants) |
| `/admin/policies`, `/admin/policy-sets` | No | Yes (own tenant) | Yes (all tenants) |
| `/admin/*` (other) | No | No | Yes |
| `/custom-data-models` | Yes (own tenant) | Yes (own tenant) | Yes (all tenants) |
| `/rules` | No | Yes (own tenant) | Yes (all tenants) |
| WebSocket | Yes (own tenant) | Yes (own tenant) | Yes (all tenants) |

---

## Related Links

- [FIWARE NGSI v2 Specification](https://fiware.github.io/specifications/ngsiv2/stable/)
- [ETSI NGSI-LD Specification](https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/01.06.01_60/gs_CIM009v010601p.pdf)
- [FIWARE Orion Context Broker Documentation](https://fiware-orion.readthedocs.io/)
- [IPA Spatial ID Guidelines](https://www.ipa.go.jp/digital/architecture/guidelines/4dspatio-temporal-guideline.html)
- [Digital Agency Spatial ID](https://www.digital.go.jp/policies/mobility_and_infrastructure/spatial-id)
- [RFC 7946 GeoJSON](https://datatracker.ietf.org/doc/html/rfc7946)
