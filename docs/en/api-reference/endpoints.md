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

- Creating an entity with the same ID as an existing entity (even with a different `type`) returns `409 AlreadyExists`- Batch upsert operations match entities by `entityId` only (type can be overwritten)
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
- Admin scopes: `admin:users`, `admin:tenants`, `admin:policies`- Special scopes: `permanent` (unlimited token), `jwt` (JWT API access)

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