---
title: "GeonicDB Context Broker API Documentation"
---

# GeonicDB Context Broker API Documentation

Documentation for the FIWARE Orion-compatible Context Broker API running on AWS Lambda. Supports both NGSIv2 and NGSI-LD APIs.

## Table of Contents

- [Overview](#overview)
- [Authentication and Multi-tenancy](#authentication-and-multi-tenancy)
- [Pagination](#pagination)
- [Authentication API](#authentication-api)
- [Meta Endpoints](#meta-endpoints)
- [NGSIv2 API](#ngsiv2-api) (→ [API_NGSIV2.md](./ngsiv2.md))
- [NGSI-LD API](#ngsi-ld-api) (→ [API_NGSILD.md](./ngsild.md))
- [Query Language](#query-language)
- [Geo Queries](#geo-queries)
- [Spatial ID Search](#spatial-id-search)
- [GeoJSON Output](#geojson-output)
- [Vector Tiles](#vector-tiles)
- [Coordinate Reference Systems (CRS)](#coordinate-reference-systems-crs)
- [Data Catalog API](#data-catalog-api)
- [CADDE Integration](#cadde-integration)
- [Event Streaming](#event-streaming)
- [Error Responses](#error-responses)
- [Implementation Status](#implementation-status)

---

## Overview

This Context Broker provides a RESTful API compliant with the FIWARE NGSI (Next Generation Service Interface) specification.

**📖 Related Documentation:**
- [NGSIv2 / NGSI-LD Interoperability Guide](../core-concepts/ngsiv2-vs-ngsild.md) - Cross-API compatibility, type mapping, and best practices
- [WebSocket Event Streaming](../features/subscriptions.md) - Real-time event subscriptions, implementation examples, and best practices

### Base URL

```text
https://{api-gateway-url}/{stage}
```

### Supported APIs

| API Version | Base Path | Content-Type |
|------------|-----------|--------------|
| NGSIv2 | `/v2` | `application/json` |
| NGSI-LD | `/ngsi-ld/v1` | `application/ld+json` |

### OPTIONS Method

All endpoints support the `OPTIONS` method. Returns information about allowed methods and headers in response to CORS preflight requests.

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

For NGSI-LD endpoints, an additional `Accept-Patch` header is included:

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

---

## Authentication and Multi-tenancy

### Required Headers

It is recommended to include the following headers in all requests:

| Header | Required | Description | Default |
|--------|----------|-------------|---------|
| `Fiware-Service` | Recommended | Tenant name (alphanumeric and underscore only) | `default` |
| `Fiware-ServicePath` | Recommended | Hierarchical path within tenant (starts with `/`) | `/` (equivalent to `/#` for queries) |
| `Fiware-Correlator` | Optional | Correlation ID for request tracking | Auto-generated |

### Usage Example

```bash
curl -X GET "https://api.example.com/v2/entities" \
  -H "Fiware-Service: smartcity" \
  -H "Fiware-ServicePath: /buildings/floor1"
```

### Tenant Isolation

- Data from different `Fiware-Service` values is completely isolated
- Within the same tenant, data can be hierarchically organized using `Fiware-ServicePath`
- Tenant names are automatically converted to lowercase

### Service Path Specification

Complies with the [FIWARE Orion specification](https://fiware-orion.readthedocs.io/en/1.3.0/user/service_path/index.html).

#### Basic Format

- Only absolute paths starting with `/` are allowed
- Only alphanumeric characters and underscores can be used
- Maximum 10 levels, maximum 50 characters per level

```bash
# Get entities at specific path
curl "http://localhost:3000/v2/entities" \
  -H "Fiware-Service: smartcity" \
  -H "Fiware-ServicePath: /Madrid/Gardens"
```

#### Hierarchical Search (/#)

Using the `/#` suffix allows searching the specified path and all its child paths (**query operations only**).

```bash
# Search /Madrid/Gardens and all child paths
curl "http://localhost:3000/v2/entities" \
  -H "Fiware-Service: smartcity" \
  -H "Fiware-ServicePath: /Madrid/Gardens/#"
```

#### Multiple Path Specification (comma-separated)

Multiple paths can be searched simultaneously by separating them with commas (maximum 10 paths, **query operations only**).

```bash
# Search both /park1 and /park2
curl "http://localhost:3000/v2/entities" \
  -H "Fiware-Service: smartcity" \
  -H "Fiware-ServicePath: /park1, /park2"
```

#### Default Behavior

| Operation | When Header Omitted | Description |
|-----------|-------------------|-------------|
| Query (GET) | `/` | Search root path only |
| Write (POST/PUT/PATCH/DELETE) | `/` | Create/update at root path |

**Note**: For write operations, only a single non-hierarchical path can be used. Using `/#` or multiple paths will result in an error.

---

## Pagination

Pagination is supported for all list-based API endpoints.

### Parameters

| Parameter | Description | Default | Maximum |
|-----------|-------------|---------|---------|
| `limit` | Maximum number of items to return | 20 | 1000 (100 for Admin API) |
| `offset` | Number of items to skip | 0 | - |

### Response Headers

Each API type returns a header indicating the total count:

| API | Header Name | Condition |
|-----|-------------|-----------|
| NGSIv2 | `Fiware-Total-Count` | Always returned (all list endpoints) |
| NGSI-LD | `NGSILD-Results-Count` | Always returned |
| Admin API | `X-Total-Count` | Always returned |
| Catalog API | `X-Total-Count` | Always returned |

### Link Header

All list endpoints return a `Link` header compliant with [RFC 8288](https://www.rfc-editor.org/rfc/rfc8288), providing URLs for next page (`rel="next"`) and previous page (`rel="prev"`). If the results fit in a single page, the `Link` header is not returned.

```http
Link: <https://api.example.com/v2/entities?limit=10&offset=20>; rel="next", <https://api.example.com/v2/entities?limit=10&offset=0>; rel="prev"
```

### Validation

Invalid pagination parameters return `400 Bad Request`:

| Error Condition | Error Message |
|----------------|---------------|
| Negative limit | `Invalid limit: must not be negative` |
| Negative offset | `Invalid offset: must not be negative` |
| limit=0 | `Invalid limit: must be greater than 0` |
| Exceeds maximum | `Invalid limit: must not exceed 1000` |
| Non-numeric | `Invalid limit: must be a valid integer` |

### Usage Example

```bash
# Get page 2 (10 items per page)
curl "http://localhost:3000/v2/entities?limit=10&offset=10" \
  -H "Fiware-Service: smartcity"

# Get with total count header
curl "http://localhost:3000/v2/entities?limit=10&options=count" \
  -H "Fiware-Service: smartcity"
```

### Notes

- If `offset` exceeds the total count, an empty array is returned (not an error)
- Complies with the FIWARE Orion specification

---

## Authentication API

Authentication functionality enables user authentication and access control.

### Activation

Authentication is disabled by default. It can be enabled with the following environment variable.

**Note**: When `AUTH_ENABLED=false`, authentication-related endpoints (`/auth/*`, `/me`, `/me/*`, `/admin/*`) return 404.

**Important**: When `AUTH_ENABLED=true`, authentication is required for NGSI API endpoints (`/v2/*`, `/ngsi-ld/*`, `/catalog/*`). Accessing without authentication returns a `401 Unauthorized` error.

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `AUTH_ENABLED` | `false` | Enable authentication functionality |
| `JWT_SECRET` | - | Secret for JWT token signing (32+ characters recommended) |
| `JWT_EXPIRES_IN` | `1h` | Access token expiration time |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token expiration time |
| `SUPER_ADMIN_EMAIL` | - | Super admin email address set via environment variable |
| `SUPER_ADMIN_PASSWORD` | - | Super admin password set via environment variable |
| `ADMIN_ALLOWED_IPS` | - | IP/CIDR allowed to access admin API (comma-separated) |

### Roles and Permissions

| Role | Description | Permissions |
|------|-------------|-------------|
| `super_admin` | Super administrator | All tenant and user management, tenant creation/deletion |
| `tenant_admin` | Tenant administrator | User management within own tenant |
| `user` | Regular user | Own profile viewing and password change only |

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
  "tenantId": "target-tenant-id"
}
```

> `tenantId` is an optional parameter. If specified, issues a JWT scoped to that tenant. If omitted, the primary tenant is used.

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

### Get Current User Information

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

**Note**: After password change, all existing access tokens and refresh tokens are invalidated. Please log in again to obtain new tokens.

### Logout

```http
POST /auth/logout
Authorization: Bearer <accessToken>
```

Invalidates all sessions. All access tokens and refresh tokens issued to this user are immediately invalidated.

**Response**: `204 No Content`

### Admin API

The Admin API is only accessible to users with `super_admin` or `tenant_admin` roles.

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
| `limit` | Number of items to retrieve |
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

#### Unlock Login Lock

Unlocks an account locked by brute force protection.

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

**Note**: Tenants with existing users cannot be deleted.

#### Activate/Deactivate Tenant

```http
POST /admin/tenants/{tenantId}/activate
POST /admin/tenants/{tenantId}/deactivate
Authorization: Bearer <accessToken>
```

### Custom Data Model Management

> **Note**: The Custom Data Models API has moved to `/custom-data-models`. See the [Custom Data Models API](#custom-data-models-api) section for details.

### IP Restrictions

By setting the `ADMIN_ALLOWED_IPS` environment variable, you can restrict access to the admin API (`/admin/*`) to specific IP addresses only:

```bash
# Single IP
ADMIN_ALLOWED_IPS=192.168.1.100

# Multiple IPs
ADMIN_ALLOWED_IPS=192.168.1.100,10.0.0.50

# CIDR notation
ADMIN_ALLOWED_IPS=192.168.1.0/24,10.0.0.0/8
```

| Endpoint | Method | Description | Success | Error |
|----------|--------|-------------|---------|-------|
| `/oauth/token` | POST | OAuth token acquisition (M2M) | 200 | 400, 401 |

### User Endpoints

Endpoints for authenticated users to manage their own information.

| Endpoint | Method | Description | Success | Error | Minimum Role |
|----------|--------|-------------|---------|-------|-------------|
| `/me` | GET | Get own profile | 200 | 401 | user |
| `/me/password` | POST | Change password | 204 | 400, 401 | user |

### NGSIv2 / NGSI-LD Endpoints

For detailed endpoint specifications, refer to:
- [NGSIv2 API Reference](./ngsiv2.md)
- [NGSI-LD API Reference](./ngsild.md)

### Admin API

Management API for tenants and users. Requires `super_admin` or `tenant_admin` role depending on the endpoint (`tenant_admin` has access only within their own tenant scope).

#### Tenant Management

| Endpoint | Method | Description | Success | Error | Pagination |
|----------|--------|-------------|---------|-------|-----------|
| `/admin/tenants` | GET | List tenants | 200 | 400, 401, 403 | ✅ (max: 100) |
| `/admin/tenants` | POST | Create tenant | 201 | 400, 401, 403, 409 | - |
| `/admin/tenants/{tenantId}` | GET | Get tenant | 200 | 401, 403, 404 | - |
| `/admin/tenants/{tenantId}` | PATCH | Update tenant | 204 | 400, 401, 403, 404, 409 | - |
| `/admin/tenants/{tenantId}` | DELETE | Delete tenant | 204 | 401, 403, 404 | - |
| `/admin/tenants/{tenantId}/activate` | POST | Activate tenant | 204 | 401, 403, 404 | - |
| `/admin/tenants/{tenantId}/deactivate` | POST | Deactivate tenant | 204 | 401, 403, 404 | - |
| `/admin/tenants/{tenantId}/ip-restrictions` | GET | Get tenant IP restrictions | 200 | 401, 403, 404 | - |
| `/admin/tenants/{tenantId}/ip-restrictions` | PUT | Update tenant IP restrictions | 200 | 400, 401, 403, 404 | - |
| `/admin/tenants/{tenantId}/ip-restrictions` | DELETE | Delete tenant IP restrictions | 204 | 401, 403, 404 | - |
| `/admin/tenants/{tenantId}/users` | GET | List tenant members (tenant_admin: own tenant only) | 200 | 401, 403, 404 | ✅ (max: 100) |
| `/admin/tenants/{tenantId}/users/{userId}` | PUT | Add user to tenant (tenant_admin: own tenant only) | 200 | 400, 401, 403, 404 | - |
| `/admin/tenants/{tenantId}/users/{userId}` | DELETE | Remove user from tenant (tenant_admin: own tenant only) | 204 | 400, 401, 403, 404 | - |

#### User Management

| Endpoint | Method | Description | Success | Error | Pagination |
|----------|--------|-------------|---------|-------|-----------|
| `/admin/users` | GET | List users | 200 | 400, 401, 403 | ✅ (max: 100) |
| `/admin/users` | POST | Create user | 201 | 400, 401, 403, 409 | - |
| `/admin/users/{userId}` | GET | Get user | 200 | 401, 403, 404 | - |
| `/admin/users/{userId}` | PATCH | Update user | 204 | 400, 401, 403, 404, 409 | - |
| `/admin/users/{userId}` | DELETE | Delete user | 204 | 401, 403, 404 | - |
| `/admin/users/{userId}/activate` | POST | Activate user | 204 | 401, 403, 404 | - |
| `/admin/users/{userId}/deactivate` | POST | Deactivate user | 204 | 401, 403, 404 | - |
| `/admin/users/{userId}/unlock` | POST | Unlock login | 200 | 400, 401, 403, 404 | - |
| `/admin/users/{userId}/tenants` | GET | List user's tenants (self or super_admin) | 200 | 401, 403 | ✅ (max: 100) |

#### Policy Management (XACML 3.0 authorization, super_admin / tenant_admin)

| Endpoint | Method | Description | Success | Error | Pagination |
|----------|--------|-------------|---------|-------|-----------|
| `/admin/policies` | GET | List policies | 200 | 400, 401, 403 | ✅ (max: 100) |
| `/admin/policies` | POST | Create policy | 201 | 400, 401, 403, 409 | - |
| `/admin/policies/{policyId}` | GET | Get policy | 200 | 401, 403, 404 | - |
| `/admin/policies/{policyId}` | PATCH | Update policy (partial) | 200 | 400, 401, 403, 404 | - |
| `/admin/policies/{policyId}` | PUT | Replace policy | 200 | 400, 401, 403, 404 | - |
| `/admin/policies/{policyId}` | DELETE | Delete policy | 204 | 401, 403, 404 | - |
| `/admin/policies/{policyId}/activate` | POST | Activate policy | 200 | 401, 403, 404 | - |
| `/admin/policies/{policyId}/deactivate` | POST | Deactivate policy | 200 | 401, 403, 404 | - |

#### OAuth Client Management

| Endpoint | Method | Description | Success | Error | Pagination |
|----------|--------|-------------|---------|-------|-----------|
| `/admin/oauth-clients` | GET | List OAuth clients | 200 | 400, 401, 403 | ✅ (max: 100) |
| `/admin/oauth-clients` | POST | Create OAuth client | 201 | 400, 401, 403 | - |
| `/admin/oauth-clients/{clientId}` | GET | Get OAuth client | 200 | 401, 403, 404 | - |
| `/admin/oauth-clients/{clientId}` | PATCH | Update OAuth client | 200 | 400, 401, 403, 404 | - |
| `/admin/oauth-clients/{clientId}` | DELETE | Delete OAuth client | 204 | 401, 403, 404 | - |

#### CADDE Configuration Management

Manage CADDE (Cross-domain Advanced Data Distribution and Exchange) settings via API. Settings are stored in MongoDB and no environment variables are required.

| Endpoint | Method | Description | Success | Error | Pagination |
|----------|--------|-------------|---------|-------|-----------|
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
| `enabled` | boolean | ✅ | Enable/disable CADDE functionality |
| `authEnabled` | boolean | ✅ | Enable/disable Bearer authentication |
| `defaultProvider` | string | - | Default provider ID |
| `jwtIssuer` | string | - | JWT issuer claim validation value |
| `jwtAudience` | string | - | JWT audience claim validation value |
| `jwksUrl` | string | - | JWKS public key endpoint URL (HTTPS required) |

#### Rule Engine Management

| Endpoint | Method | Description | Success | Error | Pagination |
|----------|--------|-------------|---------|-------|-----------|
| `/rules` | GET | List rules | 200 | 400, 401, 403 | ✅ (max: 100) |
| `/rules` | POST | Create rule | 201 | 400, 401, 403, 409 | - |
| `/rules/{ruleId}` | GET | Get rule | 200 | 401, 403, 404 | - |
| `/rules/{ruleId}` | PATCH | Update rule | 204 | 400, 401, 403, 404 | - |
| `/rules/{ruleId}` | DELETE | Delete rule | 204 | 401, 403, 404 | - |
| `/rules/{ruleId}/activate` | POST | Activate rule | 200 | 401, 403, 404 | - |
| `/rules/{ruleId}/deactivate` | POST | Deactivate rule | 200 | 401, 403, 404 | - |

### Custom Data Models API

API for managing tenant-specific custom data models. Requires JWT authentication, and XACML policy-based authorization allows `tenant_admin` and `user` roles to also manage custom data models within their tenant.

**Related Documentation**: [SMART_DATA_MODELS.md](../features/smart-data-models.md)

| Endpoint | Method | Description | Success | Error | Pagination |
|----------|--------|-------------|---------|-------|-----------|
| `/custom-data-models` | GET | List custom data models | 200 | 400, 401, 403 | ✅ (max: 100) |
| `/custom-data-models` | POST | Create custom data model | 201 | 400, 401, 403, 409 | - |
| `/custom-data-models/{type}` | GET | Get custom data model | 200 | 401, 403, 404 | - |
| `/custom-data-models/{type}` | PATCH | Update custom data model | 200 | 400, 401, 403, 404 | - |
| `/custom-data-models/{type}` | DELETE | Delete custom data model | 204 | 401, 403, 404 | - |

#### Entity Validation

When a custom data model is defined, validation is automatically performed during entity creation and updates. Validation is applied only to models with `isActive: true`.

**Validation Checks:**

| Check Item | Description |
|-----------|-------------|
| Required fields | Check if attributes with `required: true` exist |
| Type check | Type validation based on `valueType` (string, number, integer, boolean, array, object, GeoJSON) |
| minLength / maxLength | String length constraints |
| minimum / maximum | Numeric range constraints |
| pattern | Regular expression pattern matching |
| enum | List of allowed values |

Returns `400 Bad Request` on validation failure:

```json
{
  "error": "BadRequest",
  "description": "Entity validation failed: temperature: Value (150) exceeds maximum (100)"
}
```

#### Automatic JSON Schema Generation

When creating or updating a custom data model, a JSON Schema (Draft 2020-12) is automatically generated from `propertyDetails` and included in the response's `jsonSchema` field. You can also manually specify `jsonSchema`.

#### @context Resolution Extension

In NGSI-LD responses, if a custom data model has a `contextUrl` configured, the custom context is automatically included in the entity's `@context` (returned as an array with the core context).

### Catalog API

| Endpoint | Method | Description | Success | Error | Pagination |
|----------|--------|-------------|---------|-------|-----------|
| `/catalog` | GET | Get DCAT-AP catalog | 200 | 401 | - |
| `/catalog/datasets` | GET | List datasets | 200 | 400, 401 | ✅ (max: 1000) |
| `/catalog/datasets/{datasetId}` | GET | Get dataset | 200 | 401, 404 | - |
| `/catalog/datasets/{datasetId}/sample` | GET | Get sample data | 200 | 401, 404 | - |

### Vector Tiles API

| Endpoint | Method | Description | Success | Error |
|----------|--------|-------------|---------|--------|
| `/v2/tiles` | GET | Get TileJSON metadata (NGSIv2) | 200 | 401 |
| `/v2/tiles/{z}/{x}/{y}.geojson` | GET | Get GeoJSON tile (NGSIv2) | 200 | 400, 401 |
| `/ngsi-ld/v1/tiles` | GET | Get TileJSON metadata (NGSI-LD) | 200 | 401 |
| `/ngsi-ld/v1/tiles/{z}/{x}/{y}.geojson` | GET | Get GeoJSON tile (NGSI-LD) | 200 | 400, 401 |

### Event Streaming API

Real-time entity change streaming using WebSocket. Enabled with `EVENT_STREAMING_ENABLED=true`.

| Endpoint | Protocol | Description |
|----------|----------|-------------|
| `wss://{api-id}.execute-api.{region}.amazonaws.com/{stage}?tenant={name}` | WebSocket | Entity change event streaming (authentication via `Authorization` header) |

For details, see [Event Streaming Documentation](../features/subscriptions.md).

### Access Permissions Summary

| API Category | user | tenant_admin | super_admin |
|-------------|------|--------------|-------------|
| Public endpoints | ✅ | ✅ | ✅ |
| `/auth/*` | ✅ | ✅ | ✅ |
| `/me/*` | ✅ | ✅ | ✅ |
| `/v2/*` | ✅ (own tenant) | ✅ (own tenant) | ✅ (all tenants) |
| `/ngsi-ld/*` | ✅ (own tenant) | ✅ (own tenant) | ✅ (all tenants) |
| `/catalog/*` | ✅ (own tenant) | ✅ (own tenant) | ✅ (all tenants) |
| `/admin/policies`, `/admin/policy-sets` | ❌ | ✅ (own tenant) | ✅ (all tenants) |
| `/admin/*` (others) | ❌ | ❌ | ✅ |
| `/custom-data-models` | ✅ (own tenant) | ✅ (own tenant) | ✅ (all tenants) |
| `/rules` | ❌ | ✅ (own tenant) | ✅ (all tenants) |
| WebSocket | ✅ (own tenant) | ✅ (own tenant) | ✅ (all tenants) |

---

## Related Links

- [FIWARE NGSI v2 Specification](https://fiware.github.io/specifications/ngsiv2/stable/)
- [ETSI NGSI-LD Specification](https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/01.06.01_60/gs_CIM009v010601p.pdf)
- [FIWARE Orion Context Broker Documentation](https://fiware-orion.readthedocs.io/)
- [IPA Spatial ID Guidelines](https://www.ipa.go.jp/digital/architecture/guidelines/4dspatio-temporal-guideline.html)
- [Digital Agency Spatial ID](https://www.digital.go.jp/policies/mobility_and_infrastructure/spatial-id)
- [RFC 7946 GeoJSON](https://datatracker.ietf.org/doc/html/rfc7946)