---
title: "Authentication Guide"
description: "GeonicDB authentication and authorization guide"
outline: deep
---
# Authentication & Authorization Guide

This document describes the overall picture, setup, and administration of GeonicDB's authentication and authorization features.

## Table of Contents

- [Overview](#overview)
- [Authentication Architecture](#authentication-architecture)
- [Initial Setup](#initial-setup)
- [User & Tenant Management](#user--tenant-management)
- [API Key Authentication](#api-key-authentication)
  - [API Key Token Exchange (Browser SDK)](#api-key-token-exchange-browser-sdk)
  - [DPoP Token Binding (RFC 9449)](#dpop-token-binding-rfc-9449)
- [OAuth 2.0 M2M Authentication](#oauth-20-m2m-authentication)
- [OIDC External IdP Authentication](#oidc-external-idp-authentication)
- [XACML Policy-Based Authorization](#xacml-policy-based-authorization)
- [Authentication Scenario Reference](#authentication-scenario-reference)
- [Troubleshooting](#troubleshooting)

---

## Overview

GeonicDB provides JWT-based authentication and authorization features.

### Role Configuration

| Role | Description | Permissions |
|--------|------|------|
| `super_admin` | Platform administrator | `/admin/*`, `/auth/*`, `/me/*`, monitoring endpoints (`/statistics`, `/metrics`, `/cache/statistics`) only. **Cannot** access data APIs (`/v2/*`, `/ngsi-ld/*`, `/catalog*`, `/rules*`) — returns 403 |
| `tenant_admin` | Tenant administrator | Full access within the assigned tenant (admin + data APIs) |
| `user` | General user | Read-only by default (GET only). Custom XACML policies can grant write access |
| `anonymous` | Unauthenticated user | Denied by default. Explicit XACML Permit policy required. No feature flag needed (#748) |

> **Note**: `super_admin` is restricted to platform management operations for SaaS security.
> Customer data isolation is enforced — Geolonia staff with `super_admin` credentials cannot access tenant entity data.
> See [#674](https://github.com/geolonia/geonicdb/issues/674) for details.

### Authentication Flow

```text
┌─────────┐     POST /auth/login      ┌─────────┐
│  Client │ ─────────────────────────▶│  Server │
└─────────┘                           └─────────┘
     │                                      │
     │◀──── accessToken + refreshToken ─────│
     │                                      │
     │   Authorization: Bearer <token>      │
     │ ────────────────────────────────────▶│
     │                                      │
     │◀─────────── API Response ────────────│
     │                                      │
     │     POST /auth/logout               │
     │ ────────────────────────────────────▶│
     │        (invalidate all tokens)        │
     │◀──────────── 204 ───────────────────│
```

---

## Authentication Architecture

GeonicDB's authentication and authorization is composed of the following layers.

```text
Request
  ↓
[1. Token Extraction] Retrieve token from Authorization: DPoP/Bearer <token> or X-Api-Key header
  ↓
[2. Authentication (AuthN)] Token verification (attempted in the following order)
  │               2a. Authorization: Bearer <token> → Internal JWT / OIDC verification
  │               2b. X-Api-Key header → API Key verification (SHA-256 hash lookup)
  │                   → Origin check
  │               2c. Internal JWT (HS256) verification → authentication completes immediately on success
  │               2d. OIDC external IdP verification (only when OIDC_ENABLED=true)
  │                   → Signature verification via OIDC Discovery + JWKS (RS256/ES256)
  │                   → Search GeonicDB DB user by email address
  ↓                → requireAuth() / requireAdminAuth() / requireSuperAdminAuth()
[3. IP Restriction]  Admin endpoints only: restriction via ADMIN_ALLOWED_IPS
  ↓
[4. Tenant Isolation] Match Fiware-Service header against user's tenantId
  ↓                → checkTenantAccess()
[5. Authorization (AuthZ)] XACML policy-based authorization (when AUTH_ENABLED=true)
  ↓                → XacmlService.evaluate()
[6. Endpoint Processing]
```

### Environment Variables

| Variable | Default | Description |
|-------|----------|------|
| `AUTH_ENABLED` | `false` | Enable JWT authentication |
| `JWT_SECRET` | `development-secret-key-change-in-production` | Secret for JWT signing |
| `JWT_EXPIRES_IN` | `1h` | Access token expiration |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token expiration |
| `SUPER_ADMIN_EMAIL` | - | Super Admin email address via environment variable |
| `SUPER_ADMIN_PASSWORD` | - | Super Admin password via environment variable |
| `ADMIN_ALLOWED_IPS` | - | Allowed IPs for Admin API access (CIDR) |
| `OAUTH_ENABLED` | ~~`false`~~ | **Deprecated**: OAuth 2.0 is always enabled when `AUTH_ENABLED=true`. This variable is ignored. |
| `OIDC_ENABLED` | `false` | Enable OIDC external IdP authentication |
| `OIDC_ISSUER` | - | OIDC Issuer URL |
| `OIDC_AUDIENCE` | - | OIDC Audience (aud claim) |
| `TOKEN_INVALIDATION_TABLE_NAME` | - | DynamoDB table name for token invalidation (in-memory when not set) |

---

## Initial Setup

### 1. Configure Environment Variables

> **SaaS users**: GeonicDB SaaS manages authentication automatically. No environment variable configuration is required.

Set the following environment variables to enable authentication.

```bash
# Required settings
export AUTH_ENABLED=true
export JWT_SECRET=your-very-secure-secret-key-at-least-32-characters

# Super Admin settings (required for initial setup)
export SUPER_ADMIN_EMAIL=admin@example.com
export SUPER_ADMIN_PASSWORD=YourSecurePassword123!

# Optional settings
export JWT_EXPIRES_IN=1h              # Access token expiration (default: 1h)
export JWT_REFRESH_EXPIRES_IN=7d      # Refresh token expiration (default: 7d)
export ADMIN_ALLOWED_IPS=10.0.0.0/8,192.168.1.0/24  # Admin API access restriction
```

### 2. Starting the Local Development Environment

```bash
# Start the server with environment variables set
AUTH_ENABLED=true \
JWT_SECRET=development-secret-key-32chars \
SUPER_ADMIN_EMAIL=admin@localhost \
SUPER_ADMIN_PASSWORD=adminpass123 \
npm start
```

### 3. Deploying to AWS Lambda

Set the following parameters in the SAM template:

```yaml
Parameters:
  AuthEnabled:
    Type: String
    Default: "true"
  JwtSecret:
    Type: String
    NoEcho: true  # Hide secret value
  SuperAdminEmail:
    Type: String
  SuperAdminPassword:
    Type: String
    NoEcho: true
```

### Registering a Super Admin

There are two ways to register a Super Admin.

#### Method 1: Configuration via Environment Variables (Recommended)

Set the first Super Admin using environment variables.

```bash
export SUPER_ADMIN_EMAIL=admin@example.com
export SUPER_ADMIN_PASSWORD=YourSecurePassword123!
```

**Characteristics:**
- Not stored in the database (in-memory only)
- Available with the same credentials after server restart
- Changing the password requires updating the environment variable and restarting the server

#### Method 2: Additional Registration via Admin API

After logging in as an existing Super Admin, you can create new Super Admins using the Admin API.

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "YourSecurePassword123!"
  }'
```

---

## User & Tenant Management

For details, refer to the Admin API documentation.

### CADDE Configuration Management (super_admin only)

| Endpoint | Method | Description |
|---------------|---------|------|
| `/admin/cadde` | GET | Get CADDE configuration |
| `/admin/cadde` | PUT | Update CADDE configuration (upsert) |
| `/admin/cadde` | DELETE | Delete CADDE configuration (disable) |

### Tenant Management

| Endpoint | Method | Description |
|---------------|---------|------|
| `/admin/tenants` | GET | Get tenant list |
| `/admin/tenants` | POST | Create tenant |
| `/admin/tenants/{tenantId}` | GET | Get tenant |
| `/admin/tenants/{tenantId}` | PATCH | Update tenant |
| `/admin/tenants/{tenantId}` | DELETE | Delete tenant (`?shred=true` for Crypto-Shredding) |
| `/admin/tenants/{tenantId}/deletion-report` | GET | Get deletion report (Crypto-Shredding) |
| `/admin/tenants/{tenantId}/activate` | POST | Activate tenant |
| `/admin/tenants/{tenantId}/deactivate` | POST | Deactivate tenant |
| `/admin/tenants/{tenantId}/ip-restrictions` | GET | Get tenant IP restrictions |
| `/admin/tenants/{tenantId}/ip-restrictions` | PUT | Update tenant IP restrictions |
| `/admin/tenants/{tenantId}/ip-restrictions` | DELETE | Delete tenant IP restrictions |

### User Management

| Endpoint | Method | Description |
|---------------|---------|------|
| `/admin/users` | GET | Get user list |
| `/admin/users` | POST | Create user |
| `/admin/users/{userId}` | GET | Get user |
| `/admin/users/{userId}` | PATCH | Update user |
| `/admin/users/{userId}` | DELETE | Delete user |
| `/admin/users/{userId}/activate` | POST | Activate user |
| `/admin/users/{userId}/deactivate` | POST | Deactivate user |
| `/admin/users/{userId}/unlock` | POST | Clear login lock |

#### Tenant Existence Validation

When creating or updating a user with a `tenantId`, the system validates that the specified tenant exists. If the tenant does not exist, a `400 Bad Request` error is returned.

- **POST /admin/users**: `tenantId` must reference an existing tenant (except for `super_admin` users, which have no tenant)
- **PATCH /admin/users/{userId}**: When changing `tenantId`, the target tenant must exist. Setting `tenantId` to `null` is allowed without validation.

### Tenant Membership Management

Conforming to the FIWARE Keyrock Organization model, a single user can belong to multiple tenants. Membership is automatically created when a user is created.

| Endpoint | Method | Description | Authorization |
|---------------|---------|------|------|
| `/admin/tenants/{tenantId}/users` | GET | List tenant members | `tenant_admin` (own tenant) / `super_admin` |
| `/admin/tenants/{tenantId}/users/{userId}` | PUT | Add user to tenant | `tenant_admin` (own tenant) / `super_admin` |
| `/admin/tenants/{tenantId}/users/{userId}` | DELETE | Remove user from tenant | `tenant_admin` (own tenant) / `super_admin` |
| `/admin/users/{userId}/tenants` | GET | List tenants a user belongs to | Self / `super_admin` |

#### Tenant-Scoped Login

By specifying `tenantId` at login time, you can obtain a JWT token scoped to that tenant. The tenant can be specified via the request body or HTTP headers.

```bash
# Login with tenantId in request body
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password12345",
    "tenantId": "target-tenant-id"
  }'

# Login with NGSILD-Tenant header (resolved by tenant name)
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -H "NGSILD-Tenant: my_tenant" \
  -d '{
    "email": "user@example.com",
    "password": "password12345"
  }'
```

**Tenant resolution priority:**
1. `body.tenantId` — direct tenant ID specification (highest priority)
2. `NGSILD-Tenant` / `Fiware-Service` header — resolved by tenant name
3. Primary tenant (`user.tenantId`) — fallback when neither is specified

**Behavior:**
- With `tenantId` specified: Issues a token scoped to that tenant after confirming membership
- With `NGSILD-Tenant` / `Fiware-Service` header: Resolves the tenant by name. Returns `400 Bad Request` if the tenant name is not found or has an invalid format (must match `^[a-z0-9_]+$`)
- Without any tenant specification: Issues a token for the primary tenant (`user.tenantId`). If the user belongs to multiple tenants, the response includes an `availableTenants` list
- Specifying a tenant the user does not belong to: `403 Forbidden`

#### Membership Lifecycle

- **On user creation**: Membership is automatically created via `POST /admin/users`
- **Additional registration**: Add to another tenant via `PUT /admin/tenants/{tenantId}/users/{userId}`
- **On tenant deletion**: All tenant-related data is cascade deleted (entities, subscriptions, registrations, temporalEntities, snapshots, rules, policies, OAuth clients, data models, users, memberships, etc. — all 16 collections)
- **On user deletion**: All memberships associated with the user are automatically deleted

### Per-Tenant CORS Allowed Origins (#1069)

GeonicDB validates the request `Origin` header against a tenant-level whitelist. This is layered on top of API-Key `allowedOrigins` and applies to anonymous, JWT, and API-Key requests alike. Because GeonicDB is a multi-tenant Context Broker, allowed origins **cannot** be pinned via environment variables — they must be configured per tenant at runtime through the admin API.

#### Endpoint

Use the standard tenant settings endpoint:

```http
PATCH /admin/tenants/{tenantId}
Content-Type: application/json
Authorization: Bearer <super_admin token>

{
  "settings": {
    "allowedOrigins": ["https://app.example.com", "https://admin.example.com"]
  }
}
```

#### `allowedOrigins` Semantics

| Value | Behavior |
|-------|----------|
| Field absent | All origins allowed (backward compat — existing tenants unaffected). |
| `[]` (explicit empty array) | All origins denied. |
| `["*"]` | All origins allowed. Requests without `Origin` header (curl / S2S / CLI) also pass. |
| `["https://app.example.com", ...]` | Exact match only (max 50 entries; protocol + host + port). Requests without `Origin` header are denied. |

#### Enforcement

- **Preflight (OPTIONS)** is not origin-validated (CORS spec: tenant header is not on preflight). It always echoes back the request `Origin` and returns 204.
- **Actual request** passes through `optionalAuth(event, tenantService)` (data API) or `requireAuth(event)` (admin / `/auth/logout`). On origin mismatch, the request is rejected with `403 Forbidden` and body `Origin not allowed for this tenant`.
- The 403 response still includes `Access-Control-Allow-Origin` echo back + `Vary: Origin` so the browser surfaces the actual error to the client (otherwise developers see a generic Network error).
- `super_admin` users (`tenantId: null`) skip origin validation — they operate above tenant scope.

#### Layering with API Key `allowedOrigins`

Both checks apply when an API Key is used:

1. **Tenant-level**: must satisfy `tenant.settings.allowedOrigins`.
2. **API-Key level**: must satisfy `apiKey.allowedOrigins` (existing behavior, unchanged).

Most restrictive wins.

### Per-Tenant IP Restrictions

You can configure unique IP address restrictions per tenant. In addition to the global setting (`ADMIN_ALLOWED_IPS`), fine-grained access control at the tenant level is possible.

#### Endpoints

| Endpoint | Method | Description |
|---------------|---------|------|
| `/admin/tenants/{tenantId}/ip-restrictions` | GET | Get IP restriction settings |
| `/admin/tenants/{tenantId}/ip-restrictions` | PUT | Update IP restriction settings |
| `/admin/tenants/{tenantId}/ip-restrictions` | DELETE | Delete IP restriction settings (reset to default) |

#### Scope

| Scope | Description |
|---------|------|
| `admin` | Restrict access to the Admin API (`/admin/*`) only |
| `all` | Restrict access to all API endpoints |

#### Fallback Behavior

When no IP restrictions are configured for a tenant, the global setting (`ADMIN_ALLOWED_IPS` environment variable) is applied. If a tenant-level setting exists, it takes priority.

#### Request Examples

**Get IP restriction settings:**

```bash
curl -X GET http://localhost:3000/admin/tenants/{tenantId}/ip-restrictions \
  -H "Authorization: Bearer <accessToken>"
```

**Response example:**

```json
{
  "tenantId": "abc123",
  "tenantName": "my-tenant",
  "ipRestrictions": {
    "enabled": false,
    "allowedIps": [],
    "scope": "admin"
  },
  "globalFallback": null
}
```

**Update IP restriction settings:**

```bash
curl -X PUT http://localhost:3000/admin/tenants/{tenantId}/ip-restrictions \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "allowedIps": ["192.168.1.0/24", "10.0.0.1"],
    "scope": "admin"
  }'
```

**Delete IP restriction settings:**

```bash
curl -X DELETE http://localhost:3000/admin/tenants/{tenantId}/ip-restrictions \
  -H "Authorization: Bearer <accessToken>"
```

---

## API Key Authentication

GeonicDB supports API Key-based authentication as a lightweight alternative to JWT/OAuth tokens. API keys are ideal for public-facing integrations, browser-based applications, and scenarios where full OAuth credentials are unnecessary.

### Overview

API keys provide a simpler authentication mechanism with built-in restrictions for origin and rate limiting, and optional XACML policy binding via `policyId`.

### Authentication Header

```http
X-Api-Key: <UUID or gdb_-prefixed key>
```

**Priority**: When both `Authorization: Bearer` and `X-Api-Key` headers are present, the Bearer token takes priority. The API key is used as a fallback only when no Bearer token is provided.

### Key Format

- **New keys**: Plain UUID (`randomUUID()`) — e.g., `550e8400-e29b-41d4-a716-446655440000`
- **Legacy keys**: Existing keys with `gdb_` prefix continue to work (backward compatible)
- **Storage**: Only the SHA-256 hash of the key is stored in the database. The plaintext key is returned only at creation and refresh time.
- **Masking**: List and get responses return `"key": "******"` instead of the actual key

### Restrictions

| Field | Description |
|-------|-------------|
| **Origin** | `allowedOrigins` — list of permitted URL origins (or `*` for any). At least 1 required. Max 20 entries. Enforced at runtime. |
| **Policy Binding** | `policyId` — optional. Binds the key to an existing XACML policy. The bound policy's target is bypassed during evaluation (only rules are evaluated). Without `policyId`, the key falls back to tenant policies + role default (api_key = All Deny). |
| **Rate Limit** | `rateLimit.perMinute` — requests per minute (1–1000, default: 60). |

### API Key Management (Admin)

Administrators can manage API keys for any user.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/admin/api-keys` | POST | Create API key (returns raw key in response) |
| `/admin/api-keys` | GET | List API keys (paginated, `X-Total-Count` header) |
| `/admin/api-keys/{keyId}` | GET | Get API key details |
| `/admin/api-keys/{keyId}` | PATCH | Update API key |
| `/admin/api-keys/{keyId}` | DELETE | Delete API key |
| `/admin/api-keys/{keyId}/refresh` | POST | Refresh (regenerate) API key — returns new plaintext key |

### Self-Service API Key Management

Users can create and manage their own API keys without admin privileges.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/me/api-keys` | POST | Create own API key |
| `/me/api-keys` | GET | List own API keys |
| `/me/api-keys/{keyId}` | PATCH | Update own API key (partial) |
| `/me/api-keys/{keyId}` | DELETE | Delete own API key |
| `/me/api-keys/{keyId}/refresh` | POST | Refresh (regenerate) own API key — returns new plaintext key |

**Restrictions:**
- Maximum **5 keys** per user
- `allowedOrigins` is required at creation (non-empty array; use `["*"]` to allow all origins)
- `policyId` is optional — when specified, the referenced policy must already exist and must have been created by the same user
- `tenantId` is required for `super_admin` (400 if missing); `tenant_admin` may omit it (auto-derived from session)

**PATCH updatable fields** (`PATCH /me/api-keys/{keyId}`):

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Key name |
| `allowedOrigins` | string[] | Allowed origins (min 1 entry) |
| `policyId` | string \| null | Policy binding (must be created by you, or `null` to unbind) |
| `rateLimit` | object | Rate limit override |
| `dpopRequired` | boolean | Require DPoP proof |
| `isActive` | boolean | Activate / deactivate the key |

### Request Examples

#### Create an API Key

```bash
curl -X POST http://localhost:3000/admin/api-keys \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Public Dashboard",
    "allowedOrigins": ["https://dashboard.example.com"],
    "rateLimit": { "perMinute": 120 }
  }'
```

> **Note:** `keyId` is auto-generated (UUID). `tenantId` is required for `super_admin`; `tenant_admin` may omit it (auto-derived from session). `policyId` is optional — when omitted, authorization falls back to tenant policies + role defaults. IDs (`keyId`, `policyId`) are unique per tenant.

**Response** (`201 Created`, `Location: /admin/api-keys/{keyId}`):

```json
{
  "keyId": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Public Dashboard",
  "key": "550e8400-e29b-41d4-a716-446655440000 (plaintext key, shown only at creation and refresh)",
  "allowedOrigins": ["https://dashboard.example.com"],
  "policyId": "dashboard-readonly",
  "rateLimit": { "perMinute": 120 },
  "isActive": true,
  "tenantId": "my-tenant-id",
  "createdBy": "user-uuid",
  "lastUsedAt": null,
  "createdAt": "2026-03-07T00:00:00.000Z",
  "updatedAt": "2026-03-07T00:00:00.000Z"
}
```

> **Note:** The `keyPrefix` field has been removed. The `key` field is returned as plaintext only at creation and refresh; list/get responses return `"key": "******"`.
>
> **Backward compatibility:** Existing keys with `gdb_` prefix remain valid and continue to work. Only newly created keys use the UUID format.

#### Refresh an API Key

```bash
curl -X POST http://localhost:3000/me/api-keys/{keyId}/refresh \
  -H "Authorization: Bearer <accessToken>"
```

Regenerates the key value. The old key is immediately invalidated. The response includes the new plaintext key (same format as creation response).

#### Use an API Key

```bash
curl -X GET http://localhost:3000/v2/entities?type=TemperatureSensor \
  -H "X-Api-Key: 550e8400-e29b-41d4-a716-446655440000" \
  -H "Fiware-Service: mytenant"
```

### Defaults and Limits

| Parameter | Value |
|-----------|-------|
| Max keys per user | 5 |
| Max allowed origins | 20 |
| Default rate limit | 60 requests/minute |
| Max rate limit | 1000 requests/minute |
| Key length | 32 bytes (64 hex characters) |

### Policy Binding (`policyId`

)

By default, API keys have a `Deny` policy (`__default_api_key`, priority -2). To grant permissions, create an XACML policy first, then bind it to the API key via the `policyId` field.

#### Workflow

```bash
# 1. Create a policy (policyId is auto-generated when omitted)
curl -X POST http://localhost:3000/admin/policies \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "rules": [{ "ruleId": "permit", "effect": "Permit" }]
  }'
# Response: { "policyId": "550e8400-...", ... }

# 2. Create API key with policyId binding
curl -X POST http://localhost:3000/admin/api-keys \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sensor key",
    "allowedOrigins": ["*"],
    "policyId": "<policyId from step 1>"
  }'
```

> **Note:** `policyId` and `ruleId` are auto-generated (UUID) when omitted. IDs are unique per tenant — different tenants can use the same ID independently.

When `policyId` is specified, the bound policy's `target` is bypassed during evaluation — only the policy's `rules` are evaluated. This allows a single policy to be shared across multiple credentials without target conflicts.

#### Behavior

| `policyId` | Behavior |
|-----------|----------|
| Specified (valid) | Bound policy rules are evaluated (target bypassed) |
| Specified (not found) | 400 error at creation/update |
| `null` or omitted | Tenant policies + role default (api_key = All Deny) |

#### Updating policy binding

Use `PATCH /admin/api-keys/{keyId}` to change or remove the policy binding (admin):

```bash
# Change the bound policy
curl -X PATCH http://localhost:3000/admin/api-keys/{keyId} \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"policyId": "new-policy"}'

# Remove policy binding (revert to default Deny)
curl -X PATCH http://localhost:3000/admin/api-keys/{keyId} \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"policyId": null}'
```

For self-service keys, use `PATCH /me/api-keys/{keyId}` — the `policyId` must refer to a policy created by the authenticated user:

```bash
curl -X PATCH http://localhost:3000/me/api-keys/{keyId} \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"policyId": "my-readonly-policy"}'
```

### API Key Token Exchange (Browser SDK)

For browser-based applications, API keys cannot be used directly in `X-Api-Key` headers due to the risk of key exposure. Instead, GeonicDB provides a token exchange flow that converts an API key into a short-lived session JWT via Nonce + Proof of Work.

#### Flow

```text
Browser                              GeonicDB
  │                                      │
  │  POST /auth/nonce                    │
  │  Headers: Origin: <origin>           │
  │  Body: { api_key }                   │
  │ ──────────────────────────────────►  │
  │  { nonce, challenge, difficulty }    │
  │ ◄──────────────────────────────────  │
  │                                      │
  │  [Solve PoW: SHA256(challenge+n)]    │
  │                                      │
  │  POST /oauth/token                   │
  │  Headers: Origin: <origin>           │
  │  Body: { grant_type: "api_key",      │
  │          api_key, nonce, proof }     │
  │ ──────────────────────────────────►  │
  │  { access_token, token_type,         │
  │    expires_in, scope }               │
  │ ◄──────────────────────────────────  │
  │                                      │
  │  GET /v2/entities                    │
  │  Authorization: Bearer <JWT>         │
  │ ──────────────────────────────────►  │
```

#### Security Layers

1. **Origin validation**: Nonce is bound to the request Origin via HMAC; mismatched Origin causes rejection
2. **HMAC Nonce**: Stateless, signed with server secret, includes timestamp + Origin + keyId; TTL 60 seconds
3. **Proof of Work**: SHA-256 based, difficulty=4 (4 leading zero bits); prevents automated abuse without external dependencies
4. **Short-lived JWT**: `api_key_session` type, expires in 1 hour, embeds policyId

#### JavaScript SDK

GeonicDB provides a JavaScript SDK as an npm package (`@geolonia/geonicdb-sdk`) that handles the entire token exchange flow automatically:

```javascript
import GeonicDB from '@geolonia/geonicdb-sdk';

const db = new GeonicDB({
  apiKey: 'gdb_your_api_key_here',
  tenant: 'your-tenant',
  baseUrl: 'https://your-geonicdb-instance'
});

db.getEntities({ type: 'TemperatureSensor' }).then(function(entities) {
  console.log(entities);
});
```

The SDK handles nonce retrieval, PoW solving, and token refresh transparently.

#### External Token Injection

When using Bearer JWT login externally (e.g., application-level login flow), inject the token into the SDK via `setCredentials()` and register a callback for token refresh synchronization with `on('tokenRefresh', cb)`:

```javascript
var db = new GeonicDB({ tenant: 'my-tenant', baseUrl: 'https://...' });

// Inject tokens obtained from an external login flow
db.setCredentials({
  token: loginResponse.accessToken,
  tokenType: 'Bearer',
  expiresIn: loginResponse.expiresIn,
  refreshToken: loginResponse.refreshToken
});

// Sync refreshed tokens to application state (e.g., localStorage)
db.on('tokenRefresh', function(creds) {
  saveToStorage({ accessToken: creds.token, refreshToken: creds.refreshToken });
});
```

> **Note**: When `setCredentials()` is called with `tokenType: 'Bearer'` and a `refreshToken`, all subsequent API calls and `connect()` bypass DPoP/PoW entirely. Token renewal uses `/auth/refresh`, so no PoW recomputation is needed.

See the SDK documentation for full details.

### DPoP Token Binding (RFC 9449)

GeonicDB supports DPoP (Demonstration of Proof-of-Possession) per [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) to bind tokens to client-held cryptographic keys. This eliminates token theft and replay risks — even if a JWT is intercepted, it cannot be used without the corresponding private key.

#### How It Works

1. **Key pair generation**: Client generates an ECDSA P-256 key pair (the SDK uses `crypto.subtle.generateKey` with `extractable: false`)
2. **Token exchange with DPoP proof**: Client sends a `DPoP` header containing a proof JWT during `POST /oauth/token`
3. **Token binding**: Server verifies the proof and embeds the JWK Thumbprint ([RFC 7638](https://datatracker.ietf.org/doc/html/rfc7638)) as `cnf.jkt` in the issued JWT
4. **Per-request proof**: Each API request includes a new DPoP proof; server verifies the proof's `jkt` matches the token's `cnf.jkt`

#### DPoP Flow

```text
Browser                              GeonicDB
  │                                      │
  │  [Generate ECDSA P-256 key pair]     │
  │                                      │
  │  POST /oauth/token                   │
  │  Headers: Origin: <origin>           │
  │           DPoP: <proof JWT>          │
  │  Body: { grant_type: "api_key",      │
  │          api_key, nonce, proof }      │
  │ ──────────────────────────────────►  │
  │  { access_token (cnf.jkt bound),    │
  │    token_type: "DPoP", ... }         │
  │ ◄──────────────────────────────────  │
  │                                      │
  │  GET /v2/entities                    │
  │  Authorization: DPoP <JWT>           │
  │  DPoP: <new proof JWT>              │
  │ ──────────────────────────────────►  │
  │  [Verify proof jkt == token cnf.jkt] │
```

#### DPoP-Nonce (RFC 9449 Section 8)

GeonicDB implements server-provided nonces per RFC 9449 Section 8 to prevent precomputed DPoP proofs. The nonce handshake occurs transparently:

1. Client sends DPoP proof without `nonce` claim
2. Server returns `400` with `error: "use_dpop_nonce"` and a `DPoP-Nonce` response header
3. Client creates a new DPoP proof including the server nonce in the `nonce` claim
4. Server verifies the nonce and issues the token; response includes a fresh `DPoP-Nonce` for subsequent requests

```text
Browser                              GeonicDB
  │                                      │
  │  POST /oauth/token                   │
  │  DPoP: <proof (no nonce)>            │
  │ ──────────────────────────────────►  │
  │  400 { error: "use_dpop_nonce" }     │
  │  DPoP-Nonce: <server-nonce>          │
  │ ◄──────────────────────────────────  │
  │                                      │
  │  POST /oauth/token                   │
  │  DPoP: <proof (nonce: server-nonce)> │
  │ ──────────────────────────────────►  │
  │  200 { access_token, token_type }    │
  │  DPoP-Nonce: <next-nonce>            │
  │ ◄──────────────────────────────────  │
```

The nonce is stateless (HMAC-based) with a TTL of 300 seconds. No database storage is required.

API requests with DPoP-bound tokens also require nonces. The server returns a `DPoP-Nonce` header on every successful response and on `401` errors with `use_dpop_nonce` message.

#### DPoP Proof JWT Structure

```json
// Header
{
  "typ": "dpop+jwt",
  "alg": "ES256",
  "jwk": { "kty": "EC", "crv": "P-256", "x": "...", "y": "..." }
}

// Payload
{
  "jti": "<unique identifier>",
  "htm": "POST",
  "htu": "https://api.example.com/oauth/token",
  "iat": 1710000000,
  "nonce": "<server-issued DPoP-Nonce>",
  "ath": "<SHA-256 hash of access token>"  // Only for API requests, not token exchange
}
```

| Claim | Description |
|-------|-------------|
| `jti` | Unique proof identifier (replay prevention) |
| `htm` | HTTP method of the request |
| `htu` | HTTP URI of the request (scheme + host + path) |
| `iat` | Issued-at timestamp (max age: 120 seconds) |
| `nonce` | Server-issued DPoP-Nonce (required when server enforces nonce) |
| `ath` | Access token hash (required when using with a bound token) |

#### `dpopRequired` Flag

API keys can enforce DPoP by setting `dpopRequired: true` at creation time:

```bash
curl -X POST https://api.example.com/admin/api-keys \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "secure-key", "allowedOrigins": ["https://app.example.com"], "dpopRequired": true}'
```

When `dpopRequired` is `true`, token exchange without a valid `DPoP` header returns `400 invalid_dpop_proof`.

#### Bearer Fallback

When no `DPoP` header is sent during token exchange (and `dpopRequired` is `false`), the server issues a standard `Bearer` token without binding. This maintains backward compatibility with clients that do not support DPoP.

| DPoP Header | `dpopRequired` | Result |
|-------------|----------------|--------|
| Present, valid | `false` | `token_type: "DPoP"` with `cnf.jkt` binding |
| Present, valid | `true` | `token_type: "DPoP"` with `cnf.jkt` binding |
| Absent | `false` | `token_type: "Bearer"` (no binding) |
| Absent | `true` | `400 invalid_dpop_proof` (rejected) |

> **Note**: All DPoP-bound requests (token exchange and API calls) participate in the nonce handshake. The JavaScript SDK handles this transparently.

#### SDK DPoP Support

The JavaScript SDK (`@geolonia/geonicdb-sdk`) automatically enables DPoP when `crypto.subtle` is available:

- Generates a non-extractable ECDSA P-256 key pair on initialization
- Attaches DPoP proofs to token exchange and API requests
- Falls back to Bearer mode in environments without `crypto.subtle`
- Handles `use_dpop_nonce` retry automatically for both token exchange and API requests
- WebSocket connections use post-connect `dpop_bind` message for proof verification

See the full SDK API reference for all available methods.

#### DPoP & HTTP Cache Interaction (#1052)

DPoP touches three points in the HTTP-cache flow:

1. **DPoP proof JWT in `Vary`?** — No. The proof contains a per-request `jti` and `iat`, so adding it to `Vary` would make every request a cache miss. The bound access token in `Authorization` is the cache-key dimension that matters; the proof is verified separately and does not influence body content.
2. **`DPoP-Nonce` on `304 Not Modified`** — Yes, passed through. The cache-control middleware whitelists `DPoP-Nonce` in the 304 response headers (`evaluateConditionalRequest`). When the server rotates the nonce, a `304` still delivers the freshest nonce so the client does not fall behind. Without this passthrough, a client receiving `304` would retry with a stale nonce and hit `401 + use_dpop_nonce` on the next request.
3. **DPoP authentication failure** — Stale or missing DPoP proofs are rejected at `requireAuth` before `evaluateConditionalRequest` runs (see [Policy Propagation Delay](#policy-propagation-delay--http-cache-integrity-1050) for the handler order). A stale `If-None-Match` cannot resurface a `304` from a previous valid session — the response is `401`, never `304`.

See SECURITY.md — DPoP & Cache Integrity for the security model.

---

## OAuth 2.0 M2M Authentication

GeonicDB supports machine-to-machine (M2M) authentication via the OAuth 2.0 Client Credentials flow.

### Overview

The OAuth 2.0 Client Credentials flow is an authentication method optimized for machine-to-machine (M2M) scenarios such as server-to-server communication and background jobs.

### When to Use OAuth 2.0

- **Machine-to-machine communication**: API-to-API calls
- **Background jobs**: Batch processing without user interaction
- **Service-to-service integration**: Authentication between microservices
- **CI/CD pipelines**: API access in automated deployment and testing
- **Fine-grained access control**: When scope-based permission management is required

### Differences Between OAuth 2.0 and JWT Authentication

| Item | OAuth 2.0 Client Credentials | JWT Authentication |
|------|----------------------------|---------|
| **Authentication subject** | Client application (machine) | User (human) |
| **Token acquisition** | `POST /oauth/token` | `POST /auth/login` |
| **Credentials** | Client ID + Client Secret (Basic auth) | Email + Password |
| **Access control** | Scope-based | Role-based |
| **Token expiration** | Short-lived (default: 1 hour; unlimited with `permanent` scope) | Access token: 1 hour, Refresh token: 7 days |
| **Refresh token** | None (re-request when expired) | Available (can be refreshed via `POST /auth/refresh`) |

### OAuth Client Management

| Endpoint | Method | Description |
|---------------|---------|------|
| `/admin/oauth-clients` | GET | Get OAuth client list |
| `/admin/oauth-clients` | POST | Create OAuth client |
| `/admin/oauth-clients/{clientId}` | GET | Get OAuth client |
| `/admin/oauth-clients/{clientId}` | PATCH | Update OAuth client |
| `/admin/oauth-clients/{clientId}` | DELETE | Delete OAuth client |
| `/admin/oauth-clients/{clientId}/regenerate-secret` | POST | Regenerate Client Secret |

### Self-Service OAuth Client Management

Users can create and manage their own OAuth clients without admin privileges. Clients created via self-service are scoped to the user and subject to role-based restrictions.

| Endpoint | Method | Description |
|---------------|---------|------|
| `/me/oauth-clients` | POST | Create own OAuth client |
| `/me/oauth-clients` | GET | List own OAuth clients |
| `/me/oauth-clients/{clientId}` | PATCH | Update own OAuth client (partial) |
| `/me/oauth-clients/{clientId}` | DELETE | Delete own OAuth client |
| `/me/oauth-clients/{clientId}/regenerate-secret` | POST | Regenerate own client secret |

**Restrictions:**
- Maximum **5 clients** per user
- `policyId` is optional — when specified, the referenced policy must already exist and must have been created by the same user. When omitted, authorization falls back to tenant policies + role defaults (`user` default is GET-only Permit)
- The `clientSecret` is returned only at creation and regeneration — store it securely

**PATCH updatable fields** (`PATCH /me/oauth-clients/{clientId}`):

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Client name |
| `description` | string | Client description |
| `policyId` | string \| null | Policy binding (must be created by you, or `null` to unbind) |
| `isActive` | boolean | Activate / deactivate the client |

### Token Request

```bash
curl -X POST https://api.example.com/oauth/token \
  -u "$CLIENT_ID:$CLIENT_SECRET" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&scope=read:entities write:entities"
```

**Response example:**

```json
{
  "access_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "read:entities write:entities"
}
```

### Rate Limiting (#1075)

`POST /oauth/token` is rate-limited per **client IP** and per **`client_id`**
to prevent offline-less brute force of `client_id+client_secret` pairs.

| Bucket | Per minute | Per hour | Per day | Burst |
|--------|-----------:|---------:|--------:|------:|
| Per IP | 20 | 100 | 500 | 5 |
| Per `client_id` | 10 | 60 | 200 | 2 |

Both buckets must permit the request. Exceeding either returns `429 Too Many
Requests` with a `Retry-After` header. The same per-IP scheme also protects
`/auth/refresh` and `/auth/nonce` (the `auth` category in `PUBLIC_RATE_LIMIT`).
See [QUOTAS.md — Public (Unauthenticated) Endpoint Rate Limit](../saas/quotas.md#public-unauthenticated-endpoint-rate-limit-1075)
for the full configuration.

### Scope System

| Scope | Description | `user` | `tenant_admin` | `super_admin` |
|-------|-------------|:------:|:---------------:|:--------------:|
| `read:entities` | Read entities | ✅ | ✅ | ✅ |
| `write:entities` | Write entities (create/update/delete only) | ✅ | ✅ | ✅ |
| `read:subscriptions` | Read subscriptions | ✅ | ✅ | ✅ |
| `write:subscriptions` | Write subscriptions (create/update/delete only) | ✅ | ✅ | ✅ |
| `read:registrations` | Read registrations | ✅ | ✅ | ✅ |
| `write:registrations` | Write registrations (create/update/delete only) | ✅ | ✅ | ✅ |
| `read:rules` | Read rules | ✅ | ✅ | ✅ |
| `write:rules` | Write rules (create/update/delete only) | ✅ | ✅ | ✅ |
| `read:custom-data-models` | Read custom data models | ✅ | ✅ | ✅ |
| `write:custom-data-models` | Write custom data models (create/update/delete only) | ✅ | ✅ | ✅ |
| `admin:users` | Access to user management API (`/admin/users`) | ❌ | ✅ | ✅ |
| `admin:policies` | Access to policy management API (`/admin/policies`, `/admin/policy-sets`) | ❌ | ✅ | ✅ |
| `admin:oauth-clients` | Access to OAuth client management API (`/admin/oauth-clients`) | ❌ | ✅ | ✅ |
| `admin:metrics` | Access to metrics API (`/admin/metrics`) | ❌ | ✅ | ✅ |
| `admin:tenants` | Access to tenant management API (`/admin/tenants`) | ❌ | ❌ | ✅ |
| `permanent` | Set token to never expire (no expiration) | — | — | — |
| `jwt` | JWT format token | — | — | — |

> **Scope hierarchy**: `write:X` does **not** imply `read:X` — scopes are independent. This enables write-only use cases such as public contact forms. `admin:X` implies both `read:X` and `write:X`. OAuth tokens with `admin:*` scopes can access the Admin API, bypassing normal JWT role-based authentication. Normal JWT tokens (without a `scope` field) skip scope checks for backward compatibility.
>
> **Role restrictions for self-service (`/me/oauth-clients`)**: Users can only request scopes allowed for their role. `user` can request resource scopes only. `tenant_admin` can additionally request `admin:*` scopes except `admin:tenants`. `super_admin` can request all scopes.

---

## OIDC External IdP Authentication

GeonicDB supports authentication by external IdPs compliant with OIDC (OpenID Connect).

### Enabling

```bash
export AUTH_ENABLED=true
export OIDC_ENABLED=true
export OIDC_ISSUER=https://accounts.google.com
export OIDC_AUDIENCE=your-client-id.apps.googleusercontent.com
```

### Behavior

1. The client obtains an ID token from the external IdP
2. Include `Authorization: Bearer <id_token>` in the GeonicDB API request
3. GeonicDB verifies the signature via OIDC Discovery + JWKS
4. Search for the user in the GeonicDB DB by email address (`email` claim)
5. Authentication succeeds if the user exists

### Supported IdPs

- Google
- Microsoft Entra ID (Azure AD)
- Auth0
- Other OIDC-compliant IdPs

---

## XACML Policy-Based Authorization

GeonicDB supports XACML 3.0-compliant policy-based access control.

### Policy Management

| Endpoint | Method | Description |
|---------------|---------|------|
| `/admin/policies` | GET | Get policy list |
| `/admin/policies` | POST | Create policy |
| `/admin/policies/{policyId}` | GET | Get policy |
| `/admin/policies/{policyId}` | PATCH | Update policy (partial) |
| `/admin/policies/{policyId}` | PUT | Replace policy |
| `/admin/policies/{policyId}` | DELETE | Delete policy |
| `/admin/policies/{policyId}/activate` | POST | Activate policy |
| `/admin/policies/{policyId}/deactivate` | POST | Deactivate policy |

### Target Matching Semantics

Within `subjects`, `resources`, and `actions` arrays:
- **Same `attributeId`**: OR (any match satisfies) — e.g., `[{method: POST}, {method: PATCH}]` matches POST **or** PATCH
- **Different `attributeId`s**: AND (all must match) — e.g., `[{role: user}, {userId: u1}]` requires both
- **Across categories** (`subjects` + `resources` + `actions`): AND

### Match Functions (including GeonicDB extensions)

`matchFunction` values available in AttributeMatch within a policy's Target:

| matchFunction | Description | XACML 3.0 |
|---------------|------|-----------|
| `string-equal` | Exact match (default) | Standard |
| `string-regexp` | Regular expression match | Standard (`string-regexp-match`) |
| `glob` | Glob pattern match (`*`, `**` supported) | **GeonicDB extension** |

**Automatic glob detection (GeonicDB extension)**: When `matchFunction` is omitted, if `matchValue` contains `*`, it is automatically processed as `glob`. Otherwise, `string-equal` is applied.

**XACML XML export**: Since `glob` does not exist in the XACML 3.0 specification, it is converted to a regular expression and output as `string-regexp-match` on export.

### Implicit Policy Hierarchy

GeonicDB applies the following implicit policies (skipping DB lookup):

| Priority | Role | Behavior |
|--------|--------|------|
| Custom policies (0+) | any | Custom XACML policies always override defaults |
| 0 | `super_admin` | Management APIs always Permit. Data APIs Deny (403) |
| 0 | `tenant_admin` | Always Permit (all APIs within own tenant) |
| -1 | `user` | GET → Permit, all other methods → Deny (readonly) |
| -2 | `api_key` | All Deny (explicit Permit policy required) |
| -3 | `anonymous` | All Deny (explicit Permit policy required) |

> **Important**: Custom XACML policies (priority 0 or higher) always override role defaults. To grant write access to `user`, create a Permit policy with priority ≥ 0.
>
> **Tie-breaking**: When priorities are equal, policies are evaluated by `policyId` in lexicographic order for deterministic results. Tenant custom policies (stored in DB) are combined with role defaults and sorted together.

### Resource Attributes

The following attributes are available in `resources` within a policy Target:

| attributeId | Description | Source |
|-------------|-------------|--------|
| `path` | HTTP request path (e.g. `/v2/entities/Room1`) | Request |
| `tenantService` | Tenant service name (`Fiware-Service` header) | Request |
| `servicePath` | Service path (`Fiware-ServicePath` header, e.g. `/devices`, `/opendata`) | Request |
| `scope` | NGSI-LD entity scope (comma-separated, e.g. `/Madrid/parks,/Madrid/gardens`) | Entity context |
| `entityId` | Target entity ID (e.g. `Room1`) | Entity context / Subscription `entities[].id` |
| `entityType` | Target entity type (e.g. `Room`) | Request (auto-extracted) / Entity context / Subscription `entities[].type` |
| `entityOwner` | Entity creator's userId (`createdBy` field) | Entity context |
| `entityIdPattern` | Subscription target id pattern (e.g. `urn:ngsi-ld:Sensor:.*`) | Subscription `entities[].idPattern` |
| `notificationEndpoint` | Subscription notification endpoint URI (e.g. `https://hooks.example.com/x`) | Subscription `notification.endpoint.uri` |

> **Note**: `entityId`, `entityOwner`, and `scope` are only available for entity-level authorization checks (via `requireEntityAuthz`). `entityType` is automatically extracted from the HTTP request at the path level — from the `?type=` query parameter or the request body's `type` / `@type` field — making entity-type-based access control possible without entity-level checks. `servicePath` is automatically extracted from the `Fiware-ServicePath` header and available at both path-level and entity-level checks — supports glob patterns (e.g. `/opendata/**`) for hierarchical path matching. `scope` is the NGSI-LD equivalent of NGSIv2's `servicePath` at the entity level — when an entity has multiple scope values (e.g. `["/Madrid/parks", "/Madrid/gardens"]`), they are joined as a comma-separated string for matching with `string-regexp` or `glob`. **NGSI-LD Subscription create (`POST /ngsi-ld/v1/subscriptions`)**: the literal `body.type === "Subscription"` is **not** injected into `entityType` — instead, the PIP extracts the **subscription target** from `entities[]` and the **notification destination** from `notification.endpoint.uri`. When `entities[]` contains multiple elements, one AuthzRequest is built per element and **all of them must Permit** (all-Permit semantics) for the request to succeed. This lets you write type-based policies ("anonymous can only subscribe to `ActivityLog`") and URI-based policies ("subscriptions may only post notifications to `https://*.example.com/**`", a defence against SSRF / data exfiltration). See [Subscription PIP attributes](#subscription-pip-attributes) below.

### Path-Level vs Entity-Level Authorization

GeonicDB uses a two-stage authorization model. Each stage uses XACML evaluation, but the **default decision for `NotApplicable` differs by design**.

| Stage | Middleware | Triggered when | NotApplicable behavior |
|-------|-----------|----------------|------------------------|
| Path-level | `requireAuthz()` | Every authenticated request | **Deny (fail-closed)** |
| Entity-level | `requireEntityAuthz()` | Entity CRUD with concrete entity (after path-level passes) | **Permit (fail-open)** |

#### Why path-level is fail-closed

Without an applicable policy, the request must be rejected. Otherwise, an unprivileged user could call any path that no policy explicitly Permits. The default role policies (`__default_user`, `__default_api_key`, etc.) ensure that the path stage always has at least one applicable rule.

#### Why entity-level is fail-open (by design)

By the time `requireEntityAuthz()` runs, the path stage has **already produced a Permit**. Entity-level evaluation is meant to apply **additional** constraints (e.g., owner-only, scope-based), not to re-authorize the request from scratch.

If entity-level were fail-closed, it would Deny any request whose tenant has no entity-targeted policy — even though the path was already permitted. That would force every tenant to write a default-Permit entity policy just to keep CRUD working, which is both error-prone and contrary to the layering intent.

**Consequence**: attribute-based fine-grained control (e.g., "users can only modify entities they created") requires an **explicit Deny rule** at the entity level. A missing rule does **not** Deny — only Permits with non-matching targets, or explicit Denies, take effect.

#### Example: owner-only update enforcement

To restrict `PATCH /v2/entities/{id}/attrs` to entity owners, write an explicit Deny:

```json
{
  "description": "Users can only modify entities they own",
  "ruleCombiningAlgorithm": "first-applicable",
  "rules": [
    {
      "ruleId": "deny-non-owner",
      "effect": "Deny",
      "target": {
        "subjects": [{ "attributeId": "role", "matchValue": "user" }],
        "actions": [{ "attributeId": "method", "matchValue": "PATCH" }],
        "resources": [
          { "attributeId": "path", "matchValue": "/v2/entities/**", "matchFunction": "glob" }
        ]
      },
      "condition": {
        "function": "string-not-equal",
        "args": ["${subject.userId}", "${resource.entityOwner}"]
      }
    }
  ]
}
```

Without such an explicit rule, entity-level evaluation returns `NotApplicable` and the request is permitted (because the path stage already permitted it).

### WebSocket Authorization (WS ⊂ GET)

WebSocket subscriptions and broadcasts are evaluated as a **read-only stream** that is a subset of `GET`. The `authorizeWs()` PIP (`src/core/auth/policy/policy.pip.ts`) evaluates each WebSocket request **twice** — once with `action.method = 'WS'` and once with `action.method = 'GET'` — and grants access only if **both** evaluations return `Permit`.

This invariant has two practical consequences for policy authors:

1. **Policies that Deny `GET` automatically Deny `WS`.** No need to repeat `WS` in the rule; the second evaluation will pick up the same Deny.
2. **Policies that target `WS` alone are typically a configuration mistake.** Because the second evaluation falls back to `GET`, denying `WS` only does not protect the underlying data — clients can still read it via `GET /v2/entities/...`. Conversely, permitting `WS` only is meaningless if `GET` is not also permitted.

#### Authoring guidance

When you want to restrict streaming for a specific role/tenant, write the rule against `GET` (or omit `actions` entirely so the rule applies to all methods). Mention `WS` only when the rule must apply to *both*:

```json
{
  "actions": [
    { "attributeId": "method", "matchValue": "WS" },
    { "attributeId": "method", "matchValue": "GET" }
  ]
}
```

#### Detection

`PolicyService.validateWsGetSymmetry()` (#1085) emits a `WARN` log when a rule's `actions` contain `method = 'WS'` (`string-equal`) but no matching `'GET'` entry. This runs on every write path: `createPolicy`, `updatePolicy`, `updatePolicySystem`, and `updatePolicyForUser` (including self-service `/me/policies` updates). The policy is still accepted to preserve backward compatibility — the warning is the signal to revisit the rule.

```text
[WARN] PolicyService — Policy rule 'ws-only-deny' targets method='WS' without an explicit 'GET'
counterpart. WebSocket authorization evaluates both WS and GET, so WS-only rules typically do not
restrict the data path that GET serves.
```

#### Per-entity attributes at broadcast time (#1107)

When the WebSocket broadcaster (`src/handlers/websocket/broadcaster.ts`, `src/core/streaming/local-ws-server.ts`) decides whether to deliver a change event to a connection, it injects the following per-entity attributes into the AuthzRequest:

| attributeId | Source | Use case |
|-------------|--------|----------|
| `entityType` | `EntityChangeEvent.entity.type` | "Only forward `ActivityLog` events to clients" |
| `entityId` | `EntityChangeEvent.entity.id` | "Forward only `urn:ngsi-ld:Room:42` events" |
| `entityOwner` | `EntityChangeEvent.entity.owner` (the entity's `createdBy`) | "Forward only events for entities the recipient owns" |

The `entityOwner` attribute, combined with `${subject.userId}` template expansion, lets you express **per-user "self-only" delivery filters** in a single XACML policy:

```jsonc
// Each user receives only updates to entities they created
{
  "policyId": "ws-self-only-feed",
  "target": {
    "subjects": [{ "attributeId": "role", "matchValue": "user" }],
    "resources": [
      { "attributeId": "path", "matchValue": "/v2/**", "matchFunction": "glob" },
      { "attributeId": "entityType", "matchValue": "GeoJSON" }
    ]
  },
  "ruleCombiningAlgorithm": "first-applicable",
  "rules": [
    // Allow the user to create their own entity (no owner exists at POST time)
    { "ruleId": "permit-write", "effect": "Permit",
      "target": { "actions": [
        { "attributeId": "method", "matchValue": "POST" },
        { "attributeId": "method", "matchValue": "PATCH" },
        { "attributeId": "method", "matchValue": "PUT" }
      ] }
    },
    // For WS / GET, only forward entities the subject owns
    { "ruleId": "permit-self-read", "effect": "Permit",
      "target": { "resources": [
        { "attributeId": "entityOwner", "matchValue": "${subject.userId}" }
      ] }
    },
    { "ruleId": "default-deny", "effect": "Deny" }
  ]
}
```

> **Caching note**: The broadcaster caches authorization decisions per `(role, policyId, userId)` within a single broadcast — `userId` must be in the key because owner-based policies yield per-user decisions even at fixed entityType/entityOwner. Multi-device users with the same userId still share the cached decision within one event.
>
> **Source of `entity.owner`**: populated transparently by `EntityService` when publishing change events. It comes from the entity's `createdBy` field (set on `POST` by the authenticated user) — entities without `createdBy` (legacy / batch / unauthenticated writes) emit events without `owner`, in which case owner-based rules will not match and the next rule applies.

### Subscription PIP attributes

For `POST /ngsi-ld/v1/subscriptions` (NGSI-LD subscription create), the PIP injects three additional resource attributes drawn from the subscription body, **and the literal `body.type === "Subscription"` is intentionally not exposed as `entityType`**:

| attributeId | Source field | Use case |
|-------------|--------------|----------|
| `entityType` | `entities[].type` | "Anonymous can only subscribe to `ActivityLog`" |
| `entityId` | `entities[].id` | "Allow subscribing only to `urn:ngsi-ld:Room:1`" |
| `entityIdPattern` | `entities[].idPattern` | "Allow subscribing only when the pattern matches `urn:ngsi-ld:Sensor:.*`" |
| `notificationEndpoint` | `notification.endpoint.uri` | "Notifications may only be sent to `https://*.example.com/**`" — defence against SSRF / data exfiltration |

#### Multi-entity all-Permit semantics

If `entities[]` contains more than one element, the PEP evaluates **one AuthzRequest per element** and the request is permitted only when **every** AuthzRequest returns `Permit`. A single `Deny` / `NotApplicable` / `Indeterminate` short-circuits the entire request to `403 Forbidden`. This prevents a "first element looks fine, sneak the rest in" bypass:

```jsonc
// All elements must satisfy the policy. With a policy that permits only ActivityLog,
// this body is rejected because { type: "Building" } is not permitted.
{
  "type": "Subscription",
  "entities": [{ "type": "ActivityLog" }, { "type": "Building" }],
  "notification": { "endpoint": { "uri": "http://localhost:1028/notify" } }
}
```

#### Example: type-based + URI-based control combined

```json
{
  "policyId": "anon-subscribe-activity-only",
  "target": {
    "subjects": [{ "attributeId": "role", "matchValue": "anonymous" }],
    "resources": [{ "attributeId": "path", "matchValue": "/ngsi-ld/v1/subscriptions" }],
    "actions": [{ "attributeId": "method", "matchValue": "POST" }]
  },
  "ruleCombiningAlgorithm": "first-applicable",
  "rules": [
    {
      "ruleId": "allow-activitylog-to-internal-hooks",
      "effect": "Permit",
      "target": {
        "resources": [
          { "attributeId": "entityType", "matchValue": "ActivityLog" },
          { "attributeId": "notificationEndpoint", "matchValue": "https://*.example.com/**", "matchFunction": "glob" }
        ]
      }
    },
    { "ruleId": "deny-rest", "effect": "Deny" }
  ]
}
```

This policy permits only when *both* the subscription target type is `ActivityLog` *and* the notification endpoint is on `*.example.com`. Different `attributeId`s within `resources` are AND-combined (see [Target Matching Semantics](#target-matching-semantics)).

> **Out of scope (#1104)**: `PATCH /ngsi-ld/v1/subscriptions/{id}` does **not** yet apply this same rewriting — the legacy single-AuthzRequest path is still used. Subscription updates are therefore evaluated only against the path / role, not the new target / notification endpoint. Track this as a follow-up if your threat model requires it.

### Template Variables (GeonicDB Extension)

`matchValue` supports `${subject.<attributeId>}` template variables that are resolved to the request subject's attribute values at evaluation time. This enables dynamic policies like "owner-only" access without hardcoding user IDs.

| Template | Resolves to |
|----------|-------------|
| `${subject.userId}` | Requesting user's ID |
| `${subject.email}` | Requesting user's email |
| `${subject.role}` | Requesting user's role |

#### Example: Entity Owner-Only Policy

```json
{
  "description": "Users can only operate on entities they created",
  "ruleCombiningAlgorithm": "first-applicable",
  "rules": [
    {
      "effect": "Permit",
      "target": {
        "resources": [
          { "attributeId": "entityOwner", "matchValue": "${subject.userId}" }
        ]
      }
    },
    {
      "effect": "Deny"
    }
  ]
}
```

> `policyId` and `ruleId` are auto-generated when omitted.

This policy permits access only when `entityOwner` (the entity's `createdBy` value) matches the requesting user's `userId`. All other requests are denied.

#### Example: Service Path-Based Access Control

```json
{
  "description": "Allow anonymous read access to /opendata/ service path",
  "target": {
    "subjects": [{ "attributeId": "role", "matchValue": "anonymous" }],
    "resources": [{ "attributeId": "servicePath", "matchValue": "/opendata/**" }],
    "actions": [{ "attributeId": "method", "matchValue": "GET" }]
  },
  "rules": [{ "ruleId": "permit-read", "effect": "Permit" }],
  "priority": 100
}
```

This policy allows anonymous users to read entities under the `/opendata/` service path (including nested paths like `/opendata/sensors`). The glob pattern `/**` matches zero or more path segments.

#### Example: NGSI-LD Scope-Based Access Control

```json
{
  "description": "Allow read access only to entities scoped under /Madrid",
  "ruleCombiningAlgorithm": "first-applicable",
  "rules": [
    {
      "ruleId": "allow-madrid-read",
      "effect": "Permit",
      "target": {
        "resources": [
          { "attributeId": "scope", "matchValue": "(^|,)/Madrid(/[^,]*)?(,|$)", "matchFunction": "string-regexp" }
        ],
        "actions": [{ "attributeId": "method", "matchValue": "GET" }]
      }
    },
    { "ruleId": "deny-all", "effect": "Deny" }
  ],
  "priority": 50
}
```

This policy permits read access to entities whose `scope` is `/Madrid` itself or a child path under it (e.g. `["/Madrid/parks"]`). Since entity scopes are stored as arrays and serialized to comma-separated strings (e.g. `"/Madrid/parks,/Madrid/gardens"`), prefer boundary-aware `string-regexp` patterns (using `(^|,)` and `(,|$)` anchors) to avoid unintended partial matches. For single-value exact matching, `string-equal` works directly (e.g. `matchValue: "/Madrid"`).

### Default Policies

GeonicDB has the following default policies configured:

- **Admin API**: Accessible by `super_admin` only
- **Rules API**: Accessible by `super_admin` or `tenant_admin`
- **NGSI API**: Explicit policy required (`user` role)

### Anonymous Access Policy (GeonicDB Extension)

GeonicDB supports anonymous (unauthenticated) access to data APIs when configured by tenant administrators. This is useful for publishing public data (e.g., weather observations, open datasets) without requiring authentication.

#### Prerequisites

1. **Create an explicit Permit policy**: Target `role=anonymous` with the desired access level (no feature flag needed since #748)

#### Setup

```bash
# Create a policy allowing anonymous read access
curl -X POST http://localhost:3000/admin/policies \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Allow anonymous read access to WeatherObserved entities",
    "target": {
      "subjects": [{"attributeId": "role", "matchValue": "anonymous"}],
      "resources": [
        {"attributeId": "path", "matchValue": "/v2/**", "matchFunction": "glob"},
        {"attributeId": "entityType", "matchValue": "WeatherObserved"}
      ]
    },
    "ruleCombiningAlgorithm": "first-applicable",
    "rules": [
      {"effect": "Permit", "target": {"actions": [{"attributeId": "method", "matchValue": "GET"}]}},
      {"effect": "Deny"}
    ]
  }'

# 3. Anonymous access (no Authorization header)
curl http://localhost:3000/v2/entities?type=WeatherObserved \
  -H "Fiware-Service: mytenant"
```

For browser / Node apps, the SDK supports the same flow via the `anonymous: true` option (no token acquisition, no `Authorization` header). See `docs/SDK.md`.

```javascript
const db = new GeonicDB({
  baseUrl: 'http://localhost:3000',
  tenant: 'mytenant',
  anonymous: true,
});
const entities = await db.getEntities({ type: 'WeatherObserved' });
```

#### Security Model

- **Fail-closed**: Without explicit Permit policies, all anonymous requests are denied (403).
- **No policies = Deny**: Anonymous access always requires explicit XACML Permit policies.
- **Admin APIs are never accessible**: Anonymous users cannot access `/admin/*`, `/auth/*`, or `/me/*` endpoints regardless of policies.
- **Tenant isolation**: Anonymous requests must include a `Fiware-Service` header. The anonymous user is bound to the specified tenant and cannot access other tenants' data.
- **Revocable**: Delete the XACML Permit policy to immediately block all anonymous access.

---

## Policy Propagation Delay & HTTP Cache Integrity (#1050)

When XACML policies are added, modified, or deleted via `/admin/policies`, there is a small window during which Lambda instances may still serve cached evaluations.

### Cache Layers

1. **`PolicyService` instance cache (TTL: `AUTH.POLICY_CACHE_TTL_MS` = 60s)** — Per-Lambda-instance in-memory cache of `findActivePoliciesForTenant(tenantId)` results. Invalidated on policy create/update/delete operations within the same Lambda instance, but other Lambda instances rely on TTL expiry.
2. **No HTTP / CDN cache for data endpoints** — All data endpoints return `Cache-Control: private, no-cache` (#1047). Shared caches MUST NOT store these responses, and even private caches MUST revalidate. So policy changes propagate as soon as the next request reaches a Lambda with a fresh PolicyService cache (≤ 60s).

### Worst-Case Propagation Delay

- **Single Lambda instance**: Immediate (cache invalidated on the same write).
- **Multiple Lambda instances**: Up to `POLICY_CACHE_TTL_MS` (default 60s) before all instances pick up the change.

This is acceptable for most authorization changes. For immediate revocation, restart Lambda instances or rotate the user's token to force re-authentication.

### HTTP Cache Integrity After Policy Revocation

The handler evaluates middleware in this fixed order, locked in by [the unit test in `tests/unit/handlers/api/index.test.ts`](../tests/unit/handlers/api/index.test.ts) under `#1050` regression tests:

```text
extractAuthContext → optionalAuth → checkTenantAccess → requireAuthz (XACML PEP)
  → controller (200 + ETag)
  → evaluateConditionalRequest (200 → 304 if If-None-Match matches)
```

When `requireAuthz` throws `ForbiddenError` (policy revoked), the response goes through the `catch` block which returns `4xx` directly — `evaluateConditionalRequest` is **not** called. So even if the client sends `If-None-Match` with a stale ETag from before revocation, the server returns `403`, never `304`. The old view cannot resurface.

### Operational Recommendations

- **Audit-critical revocations** should be paired with token invalidation (see [Token Invalidation](#token-invalidation)) to forcibly log out the user and prevent any in-flight cached responses from being trusted by the client.
- **Policy hot-fixes** (≤ 60s propagation) are sufficient for most operational changes. Document the propagation expectation when communicating policy changes.

---

## Resource Scopes (Deprecated)

> **Removed in #748**: Resource scopes (`resourceScopes` in JWT, `checkResourceScopes()`, `filterByResourceScopes()`) have been removed as part of the XACML authorization consolidation. Use XACML policies for fine-grained access control instead.

---

## Per-Tenant Feature Flags (Deprecated)

> **Removed in #748**: Tenant feature flags (`apiKeysEnabled`, `oauthClientsEnabled`, `anonymousAccessEnabled`) have been removed. Authorization is now handled entirely by XACML policies with role-based defaults:
> - API keys: Default Deny, requires explicit XACML Permit policy
> - OAuth clients: Always available (no feature flag gate)
> - Anonymous access: Default Deny, requires explicit XACML Permit policy (no feature flag needed)

---

## Authentication Scenario Reference

### Access Permission Summary by Role

| API Category | anonymous | user | tenant_admin | super_admin |
|-------------|-----------|------|--------------|-------------|
| Public endpoints | ✅ | ✅ | ✅ | ✅ |
| `/statistics`, `/cache/statistics`, `/metrics` | ❌ (401) | ✅ (auth required) | ✅ (auth required) | ✅ (auth required) |
| `/auth/*` | ❌ (401) | ✅ | ✅ | ✅ |
| `/me/*` | ❌ (401) | ✅ | ✅ | ✅ |
| `/v2/*` | ⚠️ Policy-dependent | 📖 Read-only (own tenant) | ✅ (own tenant) | ❌ Denied (403) |
| `/ngsi-ld/*` | ⚠️ Policy-dependent | 📖 Read-only (own tenant) | ✅ (own tenant) | ❌ Denied (403) |
| `/catalog/*` | ⚠️ Policy-dependent | 📖 Read-only (own tenant) | ✅ (own tenant) | ❌ Denied (403) |
| `/admin/users` | ❌ (403) | ❌ | ✅ (`user` role within own tenant only) | ✅ (all users) |
| `/admin/policies`, `/admin/policy-sets` | ❌ (403) | ❌ | ✅ (own tenant) | ✅ (all tenants) |
| `/admin/cadde` | ❌ (403) | ❌ | ❌ | ✅ |
| `/custom-data-models` | ❌ (403) | 📖 Read-only (own tenant) | ✅ (own tenant) | ✅ (all tenants) |
| `/admin/*` (others) | ❌ (403) | ❌ (OAuth: accessible with `admin:*` scope) | ❌ | ✅ |
| `/rules` | ⚠️ Policy-dependent | 📖 Read-only (own tenant) | ✅ (own tenant) | ❌ Denied (403) |
| WebSocket | ❌ (403) | ✅ (own tenant) | ✅ (own tenant) | ❌ Denied (403) |

> **⚠️ Policy-dependent**: Requires an explicit XACML Permit policy targeting `role=anonymous`. Without it, returns 403.

### Common Authentication Scenarios

#### Scenario 1: Authentication Disabled (`AUTH_ENABLED=false`

)

All endpoints are accessible without authentication.

#### Scenario 2: JWT Authentication

```bash
# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password12345"}'

# API request
curl -X GET http://localhost:3000/v2/entities \
  -H "Authorization: Bearer <access_token>" \
  -H "Fiware-Service: mytenant"
```

#### Scenario 3: OAuth 2.0 M2M Authentication

```bash
# Obtain token
curl -X POST http://localhost:3000/oauth/token \
  -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d "grant_type=client_credentials&scope=read:entities"

# API request
curl -X GET http://localhost:3000/v2/entities \
  -H "Authorization: Bearer <access_token>" \
  -H "Fiware-Service: mytenant"
```

#### Scenario 4: API Key Authentication

```bash
# Create an API key (via admin or self-service)
curl -X POST http://localhost:3000/me/api-keys \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My App Key",
    "allowedOrigins": ["*"]
  }'

# API request with API key
curl -X GET http://localhost:3000/v2/entities \
  -H "X-Api-Key: gdb_<key_from_creation_response>" \
  -H "Fiware-Service: mytenant"
```

#### Scenario 5: OIDC External IdP Authentication

```bash
# Obtain ID token from external IdP (e.g., Google)
# API request
curl -X GET http://localhost:3000/v2/entities \
  -H "Authorization: Bearer <id_token_from_google>" \
  -H "Fiware-Service: mytenant"
```

#### Scenario 6: Anonymous Access (No Authentication)

```bash
# No Authorization header needed
# Requires: XACML Permit policy for role=anonymous (no feature flag needed since #748)
curl -X GET http://localhost:3000/v2/entities?type=WeatherObserved \
  -H "Fiware-Service: mytenant"
```

---

## Token Invalidation

GeonicDB provides a per-user token invalidation mechanism.

### How Invalidation Works

A timestamp (`invalidatedBefore`) is maintained per user — "tokens issued before this time are invalid." If a token's `iat` (issued-at time) is earlier than this timestamp, the token is judged invalid.

### When Invalidation Occurs

| Action | Effect |
|-----------|------|
| `POST /auth/logout` | Immediately invalidates all access tokens and refresh tokens for that user |
| `POST /me/password` (password change) | Invalidates all existing tokens after the password change (re-login required) |

### Storage

| Environment | Storage | Configuration |
|------|----------|------|
| AWS Lambda | DynamoDB table | Specified via `TOKEN_INVALIDATION_TABLE_NAME` environment variable |
| Local development | In-memory Map | Used automatically when environment variable is not set |

The DynamoDB table has a TTL configured (7 days), and records exceeding the refresh token's expiration are automatically deleted.

### Notes

- OAuth 2.0 Client Credentials tokens are not subject to token invalidation
- Logging in again after logout issues a new token

### WebSocket Token Re-validation

For WebSocket connections, the JWT `exp` (expiration) is stored in DynamoDB when the connection is established. On subsequent message receipt, `exp` is re-validated, and `401` is returned if the token has expired (OWASP API2:2023 compliance).

- On connection: The `connect` handler saves `tokenExp` in `ConnectionRecord`
- On message: The `default` handler compares `tokenExp` with the current time

---

## Brute Force Protection

GeonicDB includes a brute force attack prevention feature for the login endpoint (`POST /auth/login`) and the OAuth token endpoint (`POST /oauth/token`) (OWASP API2:2023 compliance).

### Behavior Specification

#### Login Endpoint (`POST /auth/login`

)

Tracks login failure counts by email address and responds with the following rules:

| Failure count | Response | Wait time until next attempt |
|---------|-----------|---------------------|
| 1st | `401 Unauthorized` | None |
| 2nd | `401 Unauthorized` | 2 seconds (progressive delay) |
| 3rd | `401 Unauthorized` | 4 seconds (progressive delay) |
| 4th | `401 Unauthorized` | 8 seconds (progressive delay) |
| 5th and beyond (locked) | `429 Too Many Requests` | 60 seconds (lock) |
| While locked (even correct PW) | `429 Too Many Requests` | Remaining seconds |
| Successful login | Counter reset | — |

> **Note**: Retrying within the wait time results in `429 Too Many Requests` (with a `Retry-After` header). The progressive delay is applied on the next request (`checkLoginAllowed`), and the failure response itself is `401`.

#### OAuth Token Endpoint (`POST /oauth/token`

)

Tracks authentication failure counts by `client_id`. The behavior rules are the same as the login endpoint (progressive delay + account lock).

- **Tracking key**: Shares `LoginProtectionService` in the format `oauth:<clientId>`
- **On success**: Counter reset
- **Inactive client**: Recorded as authentication failure

### Design Principles

- **Email-based**: Tracked per email address since IP addresses can be easily bypassed with VPNs/proxies
- **Lambda-optimized**: Responds with `429 + Retry-After` header instead of `sleep()` delay (to avoid Lambda billing costs)
- **Automatic cleanup**: Attempt records are automatically deleted after 1 hour via MongoDB TTL index
- **Independent from activate/deactivate**: Brute force protection is an automated security mechanism, managed separately from manual enable/disable operations by administrators

### Administrator Unlock

When an account is locked, administrators can clear the lock at the following endpoint:

```bash
POST /admin/users/{userId}/unlock
Authorization: Bearer <accessToken>
```

**Response example:**

```json
{
  "userId": "abc123",
  "email": "user@example.com",
  "locked": false,
  "failedCount": 0,
  "message": "Account login lock has been cleared"
}
```

### Configuration Values

| Parameter | Default | Description |
|-----------|------------|------|
| `MAX_FAILED_ATTEMPTS` | 5 | Maximum number of failures before lock |
| `LOCK_DURATION_SECONDS` | 60 | Lock duration (seconds) |
| `ATTEMPT_WINDOW_SECONDS` | 900 | Attempt window (15 minutes) |
| `PROGRESSIVE_DELAY_BASE_SECONDS` | 2 | Base value for progressive delay (seconds) — delay = base × 2^(n-2) |
| `ATTEMPT_RECORD_TTL_SECONDS` | 3600 | Automatic deletion of attempt records (1 hour) |

---

## Ownership Verification (GeonicDB Extension)

GeonicDB provides ownership verification for Subscriptions and Registrations as a countermeasure for OWASP API1:2023 (Broken Object Level Authorization).

### Overview

The NGSI specification performs access control through tenant isolation (the `Fiware-Service` header) alone, but in multi-user tenant environments there is a challenge: users within the same tenant can operate on other users' resources. GeonicDB introduces a `createdBy` field and verifies ownership on write operations.

### Target Resources

| Resource | Target Operations |
|---------|---------|
| Subscription (`/v2/subscriptions`, `/ngsi-ld/v1/subscriptions`) | UPDATE, DELETE |
| Registration (`/v2/registrations`, `/ngsi-ld/v1/csourceRegistrations`) | UPDATE, DELETE |

> **Note**: Read operations (GET/LIST) are not restricted. Only tenant isolation conforming to the NGSI specification applies.

### Behavior by Role

| Role | Own resource | Other's resource | createdBy not set |
|--------|--------------|--------------|----------------|
| `super_admin` | ✅ Operable | ✅ Operable (bypass) | ✅ Operable |
| `tenant_admin` | ✅ Operable | ✅ Operable (bypass) | ✅ Operable |
| `user` | ✅ Operable | ❌ 403 Forbidden | ✅ Operable (backward compatible) |

### Behavior Specification

1. **On creation**: The authenticated user's ID is automatically recorded in the `createdBy` field when a resource is created
2. **On update/delete**: The requesting user's ID is matched against `createdBy`
   - Match: Operation permitted
   - Mismatch: Returns `403 Forbidden`
   - `createdBy` not set (existing data): Operation permitted for backward compatibility
3. **Admin bypass**: `super_admin`/`tenant_admin` skip the ownership check
4. **When authentication is disabled**: Ownership check is skipped when `AUTH_ENABLED=false`

### Error Response

```json
{
  "error": "Forbidden",
  "description": "You do not have permission to modify this resource"
}
```

Status code: `403 Forbidden`

---

## Troubleshooting

### Rate Limit Error (429 Too Many Requests)

**Possible causes:**
- Too many login failures (brute force protection)
- Account is locked

**Resolution:**
- Wait the number of seconds indicated in the `Retry-After` header, then retry
- If locked, ask an administrator to clear the lock via `POST /admin/users/{userId}/unlock`

### Authentication Error (401 Unauthorized)

**Possible causes:**
- Token is invalid or expired
- `JWT_SECRET` is not configured correctly
- User or tenant is deactivated
- Token after logout or password change (already invalidated)

**Resolution:**
```bash
# Check token expiration
jwt decode <access_token>

# Re-login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password12345"}'
```

### Authorization Error (403 Forbidden)

**Possible causes:**
- Insufficient role
- Tenant does not match
- Denied by XACML policy

**Resolution:**
- Check the user's role
- Verify that the `Fiware-Service` header matches the user's tenant
- Check the policy configuration

### Admin API Access Error

**Possible causes:**
- Not a `super_admin` role (when using JWT authentication)
- OAuth token lacks the required `admin:*` scope
- IP address is not included in `ADMIN_ALLOWED_IPS`

**Resolution:**
```bash
# Re-login as Super Admin
# Check IP restrictions
echo $ADMIN_ALLOWED_IPS
# For OAuth: check the client's policyId and bound policy
```

---

## Related Documentation

- [API Common Specification](../api-reference/endpoints.md) - General API specifications
- Development Guide - API specifications (pagination, status codes) and deployment
- [XACML 3.0 Specification](https://docs.oasis-open.org/xacml/3.0/xacml-3.0-core-spec-os-en.html) - Official XACML 3.0 specification
