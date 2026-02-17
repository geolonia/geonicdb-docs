---
title: Admin API
description: GeonicDB Admin API reference — authentication, user management, tenant management, XACML policies, OAuth clients, metrics, and security configuration.
outline: deep
---

# Admin API

The Admin API provides administrative operations for GeonicDB, including authentication, user and tenant management, policy-based authorization, OAuth client management, and system metrics. All admin endpoints are served under the `https://api.geonicdb.geolonia.com` base URL.

## Overview

GeonicDB uses **JWT-based authentication** with role-based access control. Three built-in roles govern access:

| Role | Description | Scope |
|------|-------------|-------|
| `super_admin` | Full platform access | All tenants, all operations |
| `tenant_admin` | Tenant-level administration | Assigned tenant(s) only |
| `user` | Standard API access | Data operations within assigned tenant and service path |

### Authentication Flow

```text
┌────────┐         ┌──────────────┐         ┌──────────┐
│ Client │──POST──▶│ /auth/login  │──JWT────▶│  Admin   │
│        │         │              │          │  APIs    │
│        │◀─token──│  (verify     │          │          │
│        │  pair   │   credentials)│          │          │
└────┬───┘         └──────────────┘         └────┬─────┘
     │                                           │
     │  Authorization: Bearer <access_token>     │
     │──────────────────────────────────────────▶│
     │                                           │
     │◀──── Response (200 / 403 / 401) ─────────│
     │                                           │
     │  POST /auth/refresh  { refresh_token }    │
     │──────────────────────────────────────────▶│
     │◀──── New access_token ────────────────────│
└────┘                                     └─────┘
```

1. The client sends credentials to `POST /auth/login` and receives an access token and a refresh token.
2. The access token is included in the `Authorization: Bearer` header on subsequent requests.
3. When the access token expires, the client calls `POST /auth/refresh` with the refresh token to obtain a new access token.

## Authentication Endpoints

### Login

Authenticate with email and password to receive a JWT token pair.

```bash
curl -X POST https://api.geonicdb.geolonia.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "SecureP@ssw0rd!"
  }'
```

**Response** `200 OK`

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "user": {
    "id": "usr_01HQ3XJKM0000000000000001",
    "email": "admin@example.com",
    "role": "super_admin",
    "tenants": ["smartcity", "production"]
  }
}
```

### Refresh Token

Exchange a refresh token for a new access token without re-authenticating.

```bash
curl -X POST https://api.geonicdb.geolonia.com/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refresh_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

**Response** `200 OK`

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

### Get Current User

Retrieve the profile of the currently authenticated user.

```bash
curl https://api.geonicdb.geolonia.com/me \
  -H "Authorization: Bearer <access_token>"
```

**Response** `200 OK`

```json
{
  "id": "usr_01HQ3XJKM0000000000000001",
  "email": "admin@example.com",
  "name": "Admin User",
  "role": "super_admin",
  "tenants": ["smartcity", "production"],
  "last_login": "2026-02-10T08:30:00Z",
  "created_at": "2025-06-01T00:00:00Z"
}
```

### Change Password

Change the password for the currently authenticated user.

```bash
curl -X POST https://api.geonicdb.geolonia.com/me/password \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "current_password": "OldP@ssw0rd!",
    "new_password": "NewSecureP@ss123!"
  }'
```

**Response** `204 No Content`

## User Management

Manage platform users. Requires `super_admin` or `tenant_admin` role.

::: tip
`tenant_admin` users can only manage users within their assigned tenants.
:::

### List Users

```bash
curl "https://api.geonicdb.geolonia.com/admin/users?limit=20&offset=0" \
  -H "Authorization: Bearer <access_token>"
```

**Response** `200 OK`

```json
{
  "users": [
    {
      "id": "usr_01HQ3XJKM0000000000000001",
      "email": "admin@example.com",
      "name": "Admin User",
      "role": "super_admin",
      "tenants": ["smartcity", "production"],
      "status": "active",
      "created_at": "2025-06-01T00:00:00Z",
      "updated_at": "2026-01-15T12:00:00Z"
    },
    {
      "id": "usr_01HQ3XJKM0000000000000002",
      "email": "operator@example.com",
      "name": "City Operator",
      "role": "user",
      "tenants": ["smartcity"],
      "status": "active",
      "created_at": "2025-07-10T00:00:00Z",
      "updated_at": "2025-07-10T00:00:00Z"
    }
  ],
  "total": 2,
  "limit": 20,
  "offset": 0
}
```

See [Pagination](/en/api-reference/pagination) for details on `limit` and `offset` parameters.

### Create User

```bash
curl -X POST https://api.geonicdb.geolonia.com/admin/users \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "name": "New User",
    "password": "InitialP@ss123!",
    "role": "user",
    "tenants": ["smartcity"]
  }'
```

**Response** `201 Created`

```json
{
  "id": "usr_01HQ3XJKM0000000000000003",
  "email": "newuser@example.com",
  "name": "New User",
  "role": "user",
  "tenants": ["smartcity"],
  "status": "active",
  "created_at": "2026-02-10T09:00:00Z"
}
```

### Update User

```bash
curl -X PATCH https://api.geonicdb.geolonia.com/admin/users/usr_01HQ3XJKM0000000000000003 \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Name",
    "role": "tenant_admin",
    "tenants": ["smartcity", "demo"]
  }'
```

**Response** `200 OK`

```json
{
  "id": "usr_01HQ3XJKM0000000000000003",
  "email": "newuser@example.com",
  "name": "Updated Name",
  "role": "tenant_admin",
  "tenants": ["smartcity", "demo"],
  "status": "active",
  "updated_at": "2026-02-10T09:30:00Z"
}
```

### Delete User

```bash
curl -X DELETE https://api.geonicdb.geolonia.com/admin/users/usr_01HQ3XJKM0000000000000003 \
  -H "Authorization: Bearer <access_token>"
```

**Response** `204 No Content`

### Activate / Deactivate User

```bash
# Deactivate
curl -X POST https://api.geonicdb.geolonia.com/admin/users/usr_01HQ3XJKM0000000000000003/deactivate \
  -H "Authorization: Bearer <access_token>"

# Activate
curl -X POST https://api.geonicdb.geolonia.com/admin/users/usr_01HQ3XJKM0000000000000003/activate \
  -H "Authorization: Bearer <access_token>"
```

**Response** `200 OK`

```json
{
  "id": "usr_01HQ3XJKM0000000000000003",
  "status": "inactive",
  "updated_at": "2026-02-10T10:00:00Z"
}
```

Deactivated users cannot log in or make API calls. Their data and configuration are preserved.

## Tenant Management

Manage tenants (organizations). Requires `super_admin` role.

### List Tenants

```bash
curl "https://api.geonicdb.geolonia.com/admin/tenants?limit=20&offset=0" \
  -H "Authorization: Bearer <access_token>"
```

**Response** `200 OK`

```json
{
  "tenants": [
    {
      "id": "tnt_01HQ3XJKM0000000000000001",
      "name": "smartcity",
      "display_name": "Smart City Project",
      "status": "active",
      "plan": "standard",
      "settings": {
        "max_entities": 1000000,
        "max_subscriptions": 500,
        "retention_days": 365
      },
      "created_at": "2025-06-01T00:00:00Z",
      "updated_at": "2026-01-20T00:00:00Z"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

### Create Tenant

```bash
curl -X POST https://api.geonicdb.geolonia.com/admin/tenants \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "production",
    "display_name": "Production Environment",
    "plan": "enterprise",
    "settings": {
      "max_entities": 5000000,
      "max_subscriptions": 2000,
      "retention_days": 730
    }
  }'
```

**Response** `201 Created`

```json
{
  "id": "tnt_01HQ3XJKM0000000000000002",
  "name": "production",
  "display_name": "Production Environment",
  "status": "active",
  "plan": "enterprise",
  "settings": {
    "max_entities": 5000000,
    "max_subscriptions": 2000,
    "retention_days": 730
  },
  "created_at": "2026-02-10T09:00:00Z"
}
```

### Update Tenant

```bash
curl -X PATCH https://api.geonicdb.geolonia.com/admin/tenants/tnt_01HQ3XJKM0000000000000002 \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "display_name": "Production (Primary)",
    "settings": {
      "max_entities": 10000000
    }
  }'
```

**Response** `200 OK`

### Delete Tenant

```bash
curl -X DELETE https://api.geonicdb.geolonia.com/admin/tenants/tnt_01HQ3XJKM0000000000000002 \
  -H "Authorization: Bearer <access_token>"
```

**Response** `204 No Content`

::: danger
Deleting a tenant permanently removes all entities, subscriptions, and registrations associated with it. This action cannot be undone.
:::

### Activate / Deactivate Tenant

```bash
# Deactivate
curl -X POST https://api.geonicdb.geolonia.com/admin/tenants/tnt_01HQ3XJKM0000000000000002/deactivate \
  -H "Authorization: Bearer <access_token>"

# Activate
curl -X POST https://api.geonicdb.geolonia.com/admin/tenants/tnt_01HQ3XJKM0000000000000002/activate \
  -H "Authorization: Bearer <access_token>"
```

**Response** `200 OK`

```json
{
  "id": "tnt_01HQ3XJKM0000000000000002",
  "name": "production",
  "status": "inactive",
  "updated_at": "2026-02-10T10:00:00Z"
}
```

Deactivated tenants reject all API requests with `403 Forbidden`. Data is preserved and accessible again upon reactivation.

## Policy Management (XACML 3.0)

GeonicDB supports fine-grained attribute-based access control using **XACML 3.0** policies. Policies define rules based on subject attributes (user role, tenant), resource attributes (entity type, service path), and action attributes (read, write, delete).

Requires `super_admin` role.

### List Policies

```bash
curl "https://api.geonicdb.geolonia.com/admin/policies?limit=20&offset=0" \
  -H "Authorization: Bearer <access_token>"
```

**Response** `200 OK`

```json
{
  "policies": [
    {
      "id": "pol_01HQ3XJKM0000000000000001",
      "name": "allow-read-smartcity",
      "description": "Allow read access to all entities in the smartcity tenant",
      "status": "active",
      "effect": "Permit",
      "target": {
        "subjects": [{ "role": "user" }],
        "resources": [{ "tenant": "smartcity", "entity_type": "*" }],
        "actions": ["read"]
      },
      "created_at": "2025-08-01T00:00:00Z",
      "updated_at": "2025-08-01T00:00:00Z"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

### Create Policy

```bash
curl -X POST https://api.geonicdb.geolonia.com/admin/policies \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "deny-delete-production",
    "description": "Deny delete operations in the production tenant for non-admins",
    "effect": "Deny",
    "target": {
      "subjects": [{ "role": "user" }],
      "resources": [{ "tenant": "production", "entity_type": "*" }],
      "actions": ["delete"]
    },
    "conditions": [
      {
        "attribute": "subject.role",
        "operator": "not_in",
        "value": ["super_admin", "tenant_admin"]
      }
    ]
  }'
```

**Response** `201 Created`

```json
{
  "id": "pol_01HQ3XJKM0000000000000002",
  "name": "deny-delete-production",
  "status": "active",
  "effect": "Deny",
  "created_at": "2026-02-10T09:00:00Z"
}
```

### Update Policy

```bash
curl -X PUT https://api.geonicdb.geolonia.com/admin/policies/pol_01HQ3XJKM0000000000000002 \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "deny-delete-production",
    "description": "Updated: Deny delete operations in production for all non-admins",
    "effect": "Deny",
    "target": {
      "subjects": [{ "role": "user" }],
      "resources": [{ "tenant": "production", "entity_type": "*", "service_path": "/#" }],
      "actions": ["delete"]
    }
  }'
```

**Response** `200 OK`

### Delete Policy

```bash
curl -X DELETE https://api.geonicdb.geolonia.com/admin/policies/pol_01HQ3XJKM0000000000000002 \
  -H "Authorization: Bearer <access_token>"
```

**Response** `204 No Content`

### Activate / Deactivate Policy

```bash
# Deactivate
curl -X POST https://api.geonicdb.geolonia.com/admin/policies/pol_01HQ3XJKM0000000000000002/deactivate \
  -H "Authorization: Bearer <access_token>"

# Activate
curl -X POST https://api.geonicdb.geolonia.com/admin/policies/pol_01HQ3XJKM0000000000000002/activate \
  -H "Authorization: Bearer <access_token>"
```

**Response** `200 OK`

### Import / Export Policies

Export all policies as a JSON array for backup or migration between environments.

```bash
# Export
curl https://api.geonicdb.geolonia.com/admin/policies/export \
  -H "Authorization: Bearer <access_token>" \
  -o policies-backup.json

# Import
curl -X POST https://api.geonicdb.geolonia.com/admin/policies/import \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d @policies-backup.json
```

**Export Response** `200 OK`

```json
{
  "policies": [
    {
      "name": "allow-read-smartcity",
      "description": "Allow read access to all entities in the smartcity tenant",
      "effect": "Permit",
      "target": { "..." : "..." },
      "conditions": []
    }
  ],
  "exported_at": "2026-02-10T12:00:00Z",
  "version": "1.0"
}
```

**Import Response** `200 OK`

```json
{
  "imported": 5,
  "skipped": 1,
  "errors": []
}
```

## OAuth Client Management

Manage OAuth 2.0 clients for machine-to-machine (M2M) authentication. Requires `super_admin` or `tenant_admin` role.

### List OAuth Clients

```bash
curl "https://api.geonicdb.geolonia.com/admin/oauth-clients?limit=20&offset=0" \
  -H "Authorization: Bearer <access_token>"
```

**Response** `200 OK`

```json
{
  "clients": [
    {
      "id": "oac_01HQ3XJKM0000000000000001",
      "client_id": "geonicdb_client_abc123",
      "name": "IoT Data Ingestion Service",
      "grant_types": ["client_credentials"],
      "scopes": ["entities:read", "entities:write"],
      "tenants": ["smartcity"],
      "status": "active",
      "created_at": "2025-09-01T00:00:00Z"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

### Create OAuth Client

```bash
curl -X POST https://api.geonicdb.geolonia.com/admin/oauth-clients \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "IoT Data Ingestion Service",
    "grant_types": ["client_credentials"],
    "scopes": ["entities:read", "entities:write", "subscriptions:read"],
    "tenants": ["smartcity"]
  }'
```

**Response** `201 Created`

```json
{
  "id": "oac_01HQ3XJKM0000000000000002",
  "client_id": "geonicdb_client_def456",
  "client_secret": "geonicdb_secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "name": "IoT Data Ingestion Service",
  "grant_types": ["client_credentials"],
  "scopes": ["entities:read", "entities:write", "subscriptions:read"],
  "tenants": ["smartcity"],
  "status": "active",
  "created_at": "2026-02-10T09:00:00Z"
}
```

::: warning
The `client_secret` is returned **only once** at creation time. Store it securely. If lost, use the regenerate-secret endpoint.
:::

### Update OAuth Client

```bash
curl -X PATCH https://api.geonicdb.geolonia.com/admin/oauth-clients/oac_01HQ3XJKM0000000000000002 \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "IoT Ingestion Service (v2)",
    "scopes": ["entities:read", "entities:write", "subscriptions:read", "subscriptions:write"]
  }'
```

**Response** `200 OK`

### Delete OAuth Client

```bash
curl -X DELETE https://api.geonicdb.geolonia.com/admin/oauth-clients/oac_01HQ3XJKM0000000000000002 \
  -H "Authorization: Bearer <access_token>"
```

**Response** `204 No Content`

### Regenerate Client Secret

```bash
curl -X POST https://api.geonicdb.geolonia.com/admin/oauth-clients/oac_01HQ3XJKM0000000000000002/regenerate-secret \
  -H "Authorization: Bearer <access_token>"
```

**Response** `200 OK`

```json
{
  "client_id": "geonicdb_client_def456",
  "client_secret": "geonicdb_secret_yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy",
  "regenerated_at": "2026-02-10T11:00:00Z"
}
```

::: danger
Regenerating a secret immediately invalidates the previous secret. All applications using the old secret will lose access.
:::

## OAuth Token Endpoint

### Client Credentials Grant

Obtain an access token using OAuth 2.0 Client Credentials flow. This is the standard flow for service-to-service (M2M) authentication.

```bash
curl -X POST https://api.geonicdb.geolonia.com/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=geonicdb_client_def456" \
  -d "client_secret=geonicdb_secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -d "scope=entities:read entities:write"
```

**Response** `200 OK`

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "entities:read entities:write"
}
```

Use the returned access token in the `Authorization` header for subsequent API calls:

```bash
curl https://api.geonicdb.geolonia.com/v2/entities \
  -H "Authorization: Bearer <access_token>" \
  -H "Fiware-Service: smartcity"
```

## Metrics

View and manage API usage metrics. Requires `super_admin` role.

### Get Metrics

```bash
curl "https://api.geonicdb.geolonia.com/admin/metrics?from=2026-02-01T00:00:00Z&to=2026-02-10T23:59:59Z" \
  -H "Authorization: Bearer <access_token>"
```

**Response** `200 OK`

```json
{
  "period": {
    "from": "2026-02-01T00:00:00Z",
    "to": "2026-02-10T23:59:59Z"
  },
  "totals": {
    "requests": 1542830,
    "entities_created": 85420,
    "entities_updated": 324100,
    "queries": 1012500,
    "notifications_sent": 120810
  },
  "by_tenant": [
    {
      "tenant": "smartcity",
      "requests": 1200000,
      "entities": 450000,
      "subscriptions": 120
    },
    {
      "tenant": "production",
      "requests": 342830,
      "entities": 85000,
      "subscriptions": 45
    }
  ]
}
```

### Delete Metrics

Delete metrics data for a specified time range.

```bash
curl -X DELETE "https://api.geonicdb.geolonia.com/admin/metrics?before=2025-12-31T23:59:59Z" \
  -H "Authorization: Bearer <access_token>"
```

**Response** `200 OK`

```json
{
  "deleted_records": 52340,
  "period_before": "2025-12-31T23:59:59Z"
}
```

## Health and System Endpoints

The /health and /version endpoints do not require authentication. All other admin endpoints require super_admin role.

### Health Check

```bash
curl https://api.geonicdb.geolonia.com/health
```

**Response** `200 OK`

```json
{
  "status": "healthy",
  "components": {
    "api": "healthy",
    "database": "healthy",
    "eventbridge": "healthy"
  },
  "timestamp": "2026-02-10T12:00:00Z"
}
```

### Version

```bash
curl https://api.geonicdb.geolonia.com/version
```

**Response** `200 OK`

```json
{
  "version": "2.1.0",
  "ngsiv2": "v2",
  "ngsild": "v1",
  "build": "2026-02-01T00:00:00Z"
}
```

### Statistics

Retrieve system-wide statistics. Requires `super_admin` role.

```bash
curl https://api.geonicdb.geolonia.com/statistics \
  -H "Authorization: Bearer <access_token>"
```

**Response** `200 OK`

```json
{
  "tenants": 12,
  "users": 48,
  "total_entities": 2450000,
  "total_subscriptions": 340,
  "total_registrations": 25,
  "uptime_seconds": 8640000
}
```

### Prometheus Metrics

Retrieve metrics in Prometheus exposition format for monitoring integration.

```bash
curl https://api.geonicdb.geolonia.com/metrics \
  -H "Authorization: Bearer <access_token>"
```

**Response** `200 OK` (`text/plain`)

```text
# HELP geonicdb_requests_total Total number of API requests
# TYPE geonicdb_requests_total counter
geonicdb_requests_total{method="GET",status="200"} 1250000
geonicdb_requests_total{method="POST",status="201"} 85420
# HELP geonicdb_request_duration_seconds Request duration in seconds
# TYPE geonicdb_request_duration_seconds histogram
geonicdb_request_duration_seconds_bucket{le="0.01"} 980000
geonicdb_request_duration_seconds_bucket{le="0.1"} 1300000
```

## Security Configuration

### IP Restrictions

Restrict admin API access to specific IP addresses or CIDR ranges using the `ADMIN_ALLOWED_IPS` environment variable.

```text
ADMIN_ALLOWED_IPS=203.0.113.0/24,198.51.100.50,2001:db8::/32
```

When configured:
- Requests from allowed IPs proceed normally.
- Requests from other IPs receive `403 Forbidden`.
- If `ADMIN_ALLOWED_IPS` is not set, admin endpoints are accessible from any IP (authentication is still required).

::: tip
Use IP restrictions in combination with JWT authentication for defense in depth. Even if a token is compromised, access is limited to authorized networks.
:::

### OIDC External IdP Integration

GeonicDB supports delegating authentication to an external Identity Provider (IdP) via **OpenID Connect (OIDC)**. This enables Single Sign-On (SSO) with providers such as Azure AD, Google Workspace, or Okta.

When OIDC is configured:
- Users authenticate through the external IdP.
- The IdP issues an ID token, which GeonicDB validates and maps to an internal user.
- Role mapping can be configured based on IdP claims (e.g., `groups` claim maps to GeonicDB roles).

**OIDC Configuration Fields**

| Field | Description | Example |
|-------|-------------|---------|
| `issuer` | OIDC issuer URL | `https://login.microsoftonline.com/{tenant}/v2.0` |
| `client_id` | Client ID registered with the IdP | `abc123-def456-...` |
| `client_secret` | Client secret for the IdP | `secret_value` |
| `redirect_uri` | Callback URL after IdP authentication | `https://api.geonicdb.geolonia.com/auth/oidc/callback` |
| `scopes` | Requested OIDC scopes | `openid profile email` |
| `role_claim` | JWT claim to map to GeonicDB roles | `groups` or `roles` |
| `role_mapping` | Mapping from IdP claim values to GeonicDB roles | `{"admins": "super_admin", "users": "user"}` |

### JWT Token Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| Access token expiry | 3600s (1 hour) | Duration before the access token expires |
| Refresh token expiry | 604800s (7 days) | Duration before the refresh token expires |
| Signing algorithm | RS256 | RSA-based asymmetric signing |
| Key rotation | Automatic | Keys are rotated periodically; JWKS endpoint provides public keys |

### Password Policy

Passwords must meet the following requirements:

| Rule | Requirement |
|------|-------------|
| Minimum length | 12 characters |
| Uppercase | At least 1 uppercase letter |
| Lowercase | At least 1 lowercase letter |
| Digit | At least 1 number |
| Special character | At least 1 special character (`!@#$%^&*` etc.) |
| History | Cannot reuse the last 5 passwords |
| Lockout | Account locked after 5 consecutive failed login attempts |

## Error Responses

Admin API errors follow the standard GeonicDB error format. See [Status Codes](/en/api-reference/status-codes) for the complete list.

| Status | Description | Common Cause |
|--------|-------------|--------------|
| `400` | Bad Request | Invalid request body or parameters |
| `401` | Unauthorized | Missing or expired access token |
| `403` | Forbidden | Insufficient role permissions or IP restriction |
| `404` | Not Found | Resource does not exist |
| `409` | Conflict | Duplicate email or tenant name |
| `422` | Unprocessable Entity | Validation error (e.g., weak password) |
| `429` | Too Many Requests | Rate limit exceeded |

**Example error response:**

```json
{
  "error": "Forbidden",
  "description": "User role 'user' does not have permission to access /admin/users",
  "status": 403
}
```

## Endpoint Summary

| Method | Endpoint | Role Required | Description |
|--------|----------|---------------|-------------|
| `POST` | `/auth/login` | None | Authenticate and receive tokens |
| `POST` | `/auth/refresh` | None | Refresh access token |
| `GET` | `/me` | Any authenticated | Get current user profile |
| `POST` | `/me/password` | Any authenticated | Change own password |
| `GET` | `/admin/users` | `super_admin`, `tenant_admin` | List users |
| `POST` | `/admin/users` | `super_admin`, `tenant_admin` | Create user |
| `PATCH` | `/admin/users/:id` | `super_admin`, `tenant_admin` | Update user |
| `DELETE` | `/admin/users/:id` | `super_admin`, `tenant_admin` | Delete user |
| `POST` | `/admin/users/:id/activate` | `super_admin`, `tenant_admin` | Activate user |
| `POST` | `/admin/users/:id/deactivate` | `super_admin`, `tenant_admin` | Deactivate user |
| `GET` | `/admin/tenants` | `super_admin` | List tenants |
| `POST` | `/admin/tenants` | `super_admin` | Create tenant |
| `PATCH` | `/admin/tenants/:id` | `super_admin` | Update tenant |
| `DELETE` | `/admin/tenants/:id` | `super_admin` | Delete tenant |
| `POST` | `/admin/tenants/:id/activate` | `super_admin` | Activate tenant |
| `POST` | `/admin/tenants/:id/deactivate` | `super_admin` | Deactivate tenant |
| `GET` | `/admin/policies` | `super_admin` | List policies |
| `POST` | `/admin/policies` | `super_admin` | Create policy |
| `PUT` | `/admin/policies/:id` | `super_admin` | Update policy |
| `DELETE` | `/admin/policies/:id` | `super_admin` | Delete policy |
| `POST` | `/admin/policies/:id/activate` | `super_admin` | Activate policy |
| `POST` | `/admin/policies/:id/deactivate` | `super_admin` | Deactivate policy |
| `GET` | `/admin/policies/export` | `super_admin` | Export all policies |
| `POST` | `/admin/policies/import` | `super_admin` | Import policies |
| `GET` | `/admin/oauth-clients` | `super_admin`, `tenant_admin` | List OAuth clients |
| `POST` | `/admin/oauth-clients` | `super_admin`, `tenant_admin` | Create OAuth client |
| `PATCH` | `/admin/oauth-clients/:id` | `super_admin`, `tenant_admin` | Update OAuth client |
| `DELETE` | `/admin/oauth-clients/:id` | `super_admin`, `tenant_admin` | Delete OAuth client |
| `POST` | `/admin/oauth-clients/:id/regenerate-secret` | `super_admin`, `tenant_admin` | Regenerate client secret |
| `POST` | `/oauth/token` | None (client auth) | OAuth token endpoint |
| `GET` | `/admin/metrics` | `super_admin` | Get usage metrics |
| `DELETE` | `/admin/metrics` | `super_admin` | Delete metrics data |
| `GET` | `/health` | None | Health check |
| `GET` | `/version` | None | Version info |
| `GET` | `/statistics` | `super_admin` | System statistics |
| `GET` | `/metrics` | `super_admin` | Prometheus metrics |

## Next Steps

- [Endpoints](/en/api-reference/endpoints) -- Common API specifications including headers and base URLs
- [Pagination](/en/api-reference/pagination) -- Paginating through large result sets
- [Status Codes](/en/api-reference/status-codes) -- HTTP status codes and error format reference
