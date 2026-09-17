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
[5. Authorization (AuthZ)] XACML policy-based authorization (while authentication is enabled)
  ↓                → XacmlService.evaluate()
[6. Endpoint Processing]
```

### Environment Variables

| Variable | Default | Description |
|-------|----------|------|
| `AUTH_ENABLED` | `true` | Built-in authentication. **Only an explicit `false` disables it** (#1981) — intended for local development only. Never set to `false` on an internet-reachable deployment. |
| `JWT_SECRET` | `development-secret-key-change-in-production` | Secret for JWT signing (single-key mode) |
| `JWT_KEYS` | - | (#1449) JSON `{kid: secret}` map for multi-key rotation. See [JWT Key Rotation](#jwt-key-rotation-1449) |
| `JWT_ACTIVE_KID` | - | (#1449) `kid` used to sign new tokens (must exist in `JWT_KEYS`) |
| `JWT_EXPIRES_IN` | `1h` | Access token expiration |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token expiration |
| `SUPER_ADMIN_EMAIL` | - | Super Admin email address via environment variable |
| `SUPER_ADMIN_PASSWORD` | - | Super Admin password via environment variable |
| `ADMIN_ALLOWED_IPS` | - | Allowed IPs for Admin API access (CIDR) |
| `OIDC_ENABLED` | `false` | Enable OIDC external IdP authentication |
| `OIDC_ISSUER` | - | OIDC Issuer URL |
| `OIDC_AUDIENCE` | - | OIDC Audience (aud claim) |
| `TOKEN_INVALIDATION_TABLE_NAME` | - | DynamoDB table name for token invalidation (in-memory when not set) |

---

## JWT Key Rotation (#1449)

JWT はサーバー内で完結する対称鍵 (HS256) で署名される。既定では単一の `JWT_SECRET` で
署名・検証するため、鍵を漏洩などで即ローテすると **既発行トークンが一斉に無効化** され、
全アクティブセッションが切断される。これを避けるため、`kid` (Key ID) 付きの複数鍵を
サポートする (HS256 のまま・非破壊)。

### 仕組み

- `JWT_KEYS`: `kid` → secret の JSON マップ。例: `{"2026-07":"secretA","2026-10":"secretB"}`
- `JWT_ACTIVE_KID`: **署名** に使う `kid` (`JWT_KEYS` に存在必須)。トークン header に `kid` が入る。
- `JWT_KEYS` 内の**すべての鍵は検証に有効** — active = 署名 + 検証、その他 = 検証のみ (retiring / next)。
- `JWT_KEYS` / `JWT_ACTIVE_KID` 未設定時は `JWT_SECRET` を単一鍵として使う (`kid` なし・従来動作)。
- 本機能導入前に発行された `kid` なしトークンは `JWT_SECRET` (legacy) で検証され続ける (移行期の非破壊)。

### ローテ手順

1. **next 鍵を追加**: `JWT_KEYS` に新しい `kid` を追加してデプロイ (検証に有効化。署名はまだ旧鍵)。
2. **active を切り替え**: `JWT_ACTIVE_KID` を新 `kid` に変更してデプロイ。新規トークンは新鍵で署名され、
   旧 `kid` のトークンは **retiring として検証され続ける** ため既存セッションは切れない。
3. **retiring 鍵を撤去**: 旧トークンの有効期限 (`JWT_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN`) 経過後、
   旧 `kid` を `JWT_KEYS` から外してデプロイ。以降その `kid` のトークンのみ段階的に失効する。

> **`JWT_SECRET` (legacy) の扱い**: マルチキー運用でも `JWT_SECRET` は必須ではないが、設定されている限り
> **`kid` を持たない旧トークン (本機能導入前に発行) を検証し続ける** (移行期の非破壊性)。導入前のトークンが
> 全て失効した後は、`kid`-less トークンの受理を止めるために `JWT_SECRET` を削除する (署名は `JWT_ACTIVE_KID`
> の鍵で行われるため single-key へ戻すのでなければ削除して差し支えない)。単一キー運用に戻す場合は
> `JWT_KEYS`/`JWT_ACTIVE_KID` を外し `JWT_SECRET` を残す。

> Production では `JWT_KEYS` / `JWT_ACTIVE_KID` も単一 JSON 環境シークレット (`geonicdb-<env>`) の
> キーとして解決される (`JWT_SECRET` と同経路、#1449)。

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

### Deployment Routing Management (super_admin only)

Hostname → MongoDB cluster routing rows. These span all deployments, so `tenant_admin` is denied even read access — otherwise a tenant administrator could read every other deployment's cluster wiring. See [API.md](../api-reference/endpoints.md#deployment-routing-management-super_admin-only) and DEDICATED_CLUSTER_ONBOARDING.md.

| Endpoint | Method | Description |
|---------------|---------|------|
| `/admin/deployments` | GET | List deployment routing rows |
| `/admin/deployments` | POST | Create a deployment routing row |
| `/admin/deployments/{hostname}` | GET | Get a deployment routing row |
| `/admin/deployments/{hostname}` | PATCH | Update a deployment routing row |
| `/admin/deployments/{hostname}` | DELETE | Delete a deployment routing row |

The plaintext `mongodbUri` is never returned. Deleting or disabling the deployment that is serving the current request is refused with 409 (self-lockout guard).

### CADDE Configuration Management (super_admin only)

| Endpoint | Method | Description |
|---------------|---------|------|
| `/admin/cadde` | GET | Get CADDE configuration |
| `/admin/cadde` | PUT | Update CADDE configuration (upsert) |
| `/admin/cadde` | DELETE | Delete CADDE configuration (disable) |

CADDE configuration is stored in the deployment's MongoDB `settings` collection (`_id: 'cadde'`). It is **not** controlled by environment variables such as `CADDE_ENABLED` (see `docs/INTEGRATIONS.md`). Enabling CADDE exposes `/cadde/api/v4/*` for **all tenants** in the deployment without GeonicDB XACML row-level filters (#2469) — see CADDE and XACML.

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
| `/admin/users/{userId}/reset-password` | POST | Issue a temporary password + force change on next login (#1532) |

#### Forced Password Change on First Login (#675 / #1321 / #1532)

Administrators onboard users by issuing a **temporary password** that the user must replace on their first login. Enforcement is **single-shot**: a temporary password is a bootstrap credential whose only capability is to set a new password — it never yields a usable token, so it cannot read entities or issue API keys.

**Note:** A temporary password is server-generated in two cases: (a) creating a user with `"passwordResetRequired": true` (invite), or (b) calling `reset-password` on an existing user (also how you reset a forgotten password). Creating a user **without** `passwordResetRequired` sets the supplied `password` directly and does **not** force a change (non-breaking).

**1. Admin issues the account** — either at creation (invite) or afterwards (reset)

```bash
# (a) Invite: create + issue a temporary password in one call.
#     Do NOT send `password` — the server generates the temporary one (sending both → 400).
curl -X POST http://localhost:3000/admin/users \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","role":"user","primaryTenantId":"<tenant-id>","passwordResetRequired":true}'
# → 201 (Cache-Control: no-store)
#   { "id", ..., "passwordResetRequired": true, "temporaryPassword", "expiresAt" }

# (b) Reset an existing user (forgotten password / re-issue):
curl -X POST http://localhost:3000/admin/users/{userId}/reset-password \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# → { "userId", "temporaryPassword", "expiresAt", "passwordResetRequired": true, "message": ... }
```

- Authorization: `super_admin` (any user) / `tenant_admin` (users in their own tenant).
- The temporary password is shown **once** and the response carries `Cache-Control: no-store`. It expires after `PASSWORD_POLICY.TEMP_PASSWORD_VALIDITY_DAYS` (default **7 days**). `reset-password` invalidates the user's existing sessions (invite creates a fresh user, so there are none to invalidate).

**2. User logs in with the temporary password and sets a new one (single call)**

```bash
# Without newPassword → 409, no token issued:
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"<temporaryPassword>"}'
# → 409 { "error": "PasswordResetRequired", ... }

# With newPassword → sets the password and returns fresh tokens in the same response:
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"<temporaryPassword>","newPassword":"<newPassword>"}'
# → 200 { "accessToken", "refreshToken", ... }   (no re-login needed)
```

**Machine-readable error keys** (the `error` field; CLI/SDK branch on these, not on the message):

| Status | `error` | Meaning |
|--------|---------|---------|
| `409` | `PasswordResetRequired` | Temp password valid; submit `newPassword` to complete login |
| `403` | `TemporaryPasswordExpired` | Temp password expired (or issue timestamp missing → fail-closed); ask admin to re-issue |
| `400` | `BadRequest` | `newPassword` equals the temp password, violates the password policy, or was sent when no reset is required |

**Guarantees**

- No token is issued until the password is changed (fail-closed). Business branching happens **after** the temporary password is verified, so account state is never leaked to unauthenticated callers.
- Concurrent completions are guarded by a compare-and-set update (`409 Conflict` on the loser).
- `refreshToken()` also rejects a user pending a forced change (defense-in-depth).
- A reset invalidates the user's **password-derived JWT sessions only** — their API keys / OAuth clients keep working. For suspected compromise, revoke those separately or `deactivate` the user.
- Setting a password directly via `PATCH /admin/users/{userId}` **clears** the forced-change state and **revokes the user's existing password-derived sessions** (#1566): the admin-chosen password is immediately usable, the user is no longer prompted to reset on next login, and old tokens issued under the previous password stop working (consistent with `reset-password` / `changePassword`).

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

By specifying a tenant at login time, you can obtain a JWT token scoped to that tenant. The tenant can be specified via the request body (`tenantId` or `tenantName`) or HTTP headers.

```bash
# Login with tenantId in request body (UUID)
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password12345",
    "tenantId": "target-tenant-id"
  }'

# Login with tenantName in request body (#1223 — name resolves to tenant ID server-side)
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password12345",
    "tenantName": "my_tenant"
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
2. `body.tenantName` — tenant name in body, resolved server-side (#1223)
3. `NGSILD-Tenant` / `Fiware-Service` header — resolved by tenant name
4. Primary tenant (`user.tenantId`) — fallback when nothing is specified

`tenantId` and `tenantName` are **mutually exclusive** in the request body — specifying both returns `400 Bad Request`.

Tenant name uniqueness is enforced system-wide by a partial unique index on `tenants.name` (excluding soft-deleted tenants, #1223). This is the prerequisite that lets name-based resolution be unambiguous across `Fiware-Service`, `NGSILD-Tenant`, and `body.tenantName`.

**Behavior:**
- With `tenantId` specified: Issues a token scoped to that tenant after confirming membership
- With `tenantName` specified (body or header): Resolves the tenant by name. Returns `400 Bad Request` if the tenant name is not found or has an invalid format (must match `^[a-z0-9_]+$` for headers)
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
| `["https://app.example.com", ...]` | Exact match (max 50 entries; protocol + host + port). Requests without `Origin` header are denied. |
| `["https://*.example.com", ...]` | Subdomain wildcard. `*` must be the leading host label and matches **one or more** labels — `https://a.example.com` and `https://a.b.example.com` match, the apex `https://example.com` does not (add an exact entry if needed). Scheme and port must match exactly, and lookalike domains (`https://evil-example.com`) do not match. Intended for CI/CD deploy previews (e.g. Cloudflare Pages `https://*.<project>.pages.dev`). |

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

#### geonicdb-console staging (`console.geonicdb.geolonia.com`

) (#2022)

[geonicdb-console](https://github.com/geolonia/geonicdb-console) staging connects to the real backend (`https://geonicdb.geolonia.com`) from `https://console.geonicdb.geolonia.com` using password login + `/auth/dpop-bind` (RFC 9449). No HTTP middleware change is required:

- **CORS preflight** echoes back the console origin and already allows `Authorization` and `DPoP` (`CORS_ALLOW_HEADERS` in `src/config/defaults.ts`).
- **Actual requests** are gated by `tenant.settings.allowedOrigins` (and API-key `allowedOrigins` when applicable) in the auth phase.

For the dedicated staging QA tenant (`console-qa` by convention). **The tenant must exist before any of this is meaningful** — as of 2026-08-11 it is not yet provisioned on `https://geonicdb.geolonia.com`. Provision it first (`geonicdb-infra-cdk/scripts/provision-tenants.sh`), then check:

| `settings.allowedOrigins` | Action needed |
|---------------------------|---------------|
| Field absent (`undefined`) | None — backward-compat all-allow |
| `["*"]` | None |
| `["https://*.geonicdb.geolonia.com"]` | None — covers `console.geonicdb.geolonia.com` |
| Explicit list without the console origin | Add `https://console.geonicdb.geolonia.com` (or the wildcard above) via `PATCH /admin/tenants/{tenantId}` |

Verify against a deployed environment. The preflight must echo the console origin and list both `Authorization` and `DPoP`:

```bash
curl -sSD - -o /dev/null -X OPTIONS https://geonicdb.geolonia.com/auth/dpop-bind \
  -H 'Origin: https://console.geonicdb.geolonia.com' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: authorization,dpop,content-type' \
  | grep -i '^access-control-'
```

The preflight is tenant-independent, so it answers on its own. The tenant probe below is **only interpretable once the tenant is provisioned**:

```bash
curl -sS https://geonicdb.geolonia.com/v2/entities \
  -H 'Origin: https://console.geonicdb.geolonia.com' \
  -H 'Fiware-Service: console-qa'
```

| Response body | Meaning |
|---|---|
| `Origin not allowed` | Origin check **rejected** — add the console origin to `allowedOrigins` |
| `Access denied` (403) | Origin check **passed**; only authorization rejected the anonymous caller (expected) |
| `Invalid tenant header value` / 400 / NotFound | **Not an Origin verdict** — the tenant does not exist. Provision it and re-run; do not read this as "origin is fine" |

The third row is the fail-open trap: an unprovisioned tenant never reaches the origin check at all, so the absence of `Origin not allowed` proves nothing.

To read the tenant's current setting directly, `GET /admin/tenants` with a super-admin token and inspect `settings.allowedOrigins`.

`Access-Control-Allow-Credentials` is intentionally **not** set — the console uses header-based Bearer + DPoP, not cookies.

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
| **Origin** | `allowedOrigins` — list of permitted URL origins, subdomain wildcards (`https://*.example.com`), or `*` for any. At least 1 required. Max 20 entries. Enforced at runtime. Wildcard semantics are the same as the tenant-level list (see [`allowedOrigins` Semantics](#allowedorigins-semantics)). |
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
- `allowedOrigins` is required at creation (non-empty array; use `["*"]` to allow all origins, or `https://*.example.com` for subdomain wildcards)
- `policyId` is optional — when specified, the referenced policy must already exist and must have been created by the same user
- `tenantId` is required for `super_admin` (400 if missing); `tenant_admin` may omit it (auto-derived from session)

> **Owner restriction inheritance (#1363 / #1376).** A self-service credential (API key or OAuth client) with a **personal-scoped** bound policy cannot exceed the restrictions imposed on its owner. During authorization, if a bound `personal` policy is present, the request is re-evaluated under the owner's identity against the tenant policies; if the owner would be **denied** (e.g. a `tenant_admin` policy targeting `role=user`/`userId` restricts the owner to a specific `Fiware-ServicePath` or to read-only), the credential is denied too. This closes the bypass where a restricted user could escape a tenant `Deny` by binding a self-made unconstrained `Permit` to their own key/client. Admin-issued credentials bind `tenant`-scoped policies and are unaffected.
>
> For **list reads** (type-less `GET /entities`, which use the policy-to-filter row-level-security path of #1337/#1369), the owner restriction is applied as a **filter intersection** rather than a binary deny (#1376): the credential's readable-entity filter is intersected with the owner's readable-entity filter, so the credential sees exactly the rows its owner could see (e.g. filtered to the owner's permitted `entityType`), not a blanket 403. This keeps list-read parity consistent with the owner instead of over-restricting the credential.
>
> Owner lookup itself distinguishes **deterministic absence** from **transient I/O failure** (#2341), matching `loadBoundPolicy`. A deleted owner (`UserRepository.getById` returns `null`) is fail-closed as `role=user` / empty email. A Mongo disconnect or replica-set failover is **re-thrown**, not folded into that absence: list-read would otherwise synthesize `unrestricted` (user GET default) or `kind:'none'`, and the notification path would map the latter to `SUBSCRIPTION_NOTIFICATION_RLS_DENIED` — a permanent drop, never retried. Retriable I/O errors reach `deriveSubscriberReadFilter`'s `'unresolved'` branch (#2289) so Lambda can redeliver. HTTP callers therefore see **500** (retry) rather than **403** (looks like a permission deny) for the same blip.

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

#### `htu` Validation and Local HTTP Development

Each DPoP proof carries an `htu` (HTTP URI) claim that must match the request URL the server reconstructs. The server derives the scheme from `X-Forwarded-Proto` (set by API Gateway / CloudFront to `https` in production) and defaults to `https` when that header is absent.

This default breaks **local HTTP development** with no proxy: the SDK signs `htu` from its `baseUrl` (e.g. `http://localhost:3001/oauth/token`), while the server reconstructs `https://localhost:3001/...`, causing a persistent `htu_mismatch` (400) that blocks DPoP token exchange (#1153).

To develop locally over HTTP, run the server in localhost mode (`npm start` enables it unconditionally — see ENV.md). Only then, **and only when the `Host` header is loopback** (`localhost` / `127.0.0.0/8` / `[::1]`, port optional, case-insensitive), does the server derive the scheme as `http` so it matches the SDK's `http` `baseUrl`. `X-Forwarded-Proto`, when present, always takes precedence. In production (Lambda) localhost mode is never active, so an attacker spoofing `Host: localhost` cannot downgrade the derived scheme — both conditions must hold (AND).

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

#### Password-Login Session Binding (`POST /auth/dpop-bind`

)

The DPoP flow above binds tokens obtained through the **API-key** exchange (`/oauth/token`), which is the path the SDK uses for data-plane access. A management console where a **human administrator** signs in with email/password does not go through that path — `POST /auth/login` issues a plain Bearer session token. To protect that session token (e.g. against XSS theft from browser storage), the session can be upgraded to a DPoP sender-constrained token via `POST /auth/dpop-bind`.

Unlike the API-key flow, no Proof-of-Work is required (the user has already authenticated with a password). Replay protection reuses the same `DPoP-Nonce` handshake.

```text
1. POST /auth/login (email/password)            → Bearer access + refresh (no cnf)
2. Client generates a non-extractable ECDSA P-256 key pair
3. POST /auth/dpop-bind
   Authorization: Bearer <access>
   DPoP: <proof JWT>            (htm=POST, htu=.../auth/dpop-bind)
   → 401 + DPoP-Nonce  (first call without nonce)
   → retry proof with nonce
   → { accessToken, refreshToken, tokenType: "DPoP", ... }   (both tokens carry cnf.jkt)
4. Subsequent requests: Authorization: DPoP <token> + per-request DPoP proof
5. POST /auth/refresh: when the refresh token carries cnf.jkt, a DPoP proof is REQUIRED;
   the re-issued tokens stay bound to the same jkt.
```

Notes:

- The DPoP-bound access token **cannot** be used with the `Authorization: Bearer` scheme — `requireAuth` rejects a `cnf.jkt` token presented as Bearer with `401`.
- The client key pair should be non-extractable (`extractable: false`) and persisted in IndexedDB so it survives reloads while remaining unexportable by injected scripts. The token value itself may remain in `localStorage`: once bound, a stolen token is useless without the private key.
- This is intended for first-party admin consoles (e.g. geonicdb-console). For third-party apps, prefer the scoped API-key + DPoP model described above.

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
| `admin:metrics` | Access to metrics API (`/admin/metrics`). Read only for `tenant_admin` — resetting the counters (`DELETE`, or `?reset=true`) is `super_admin` only and cannot be granted by a custom XACML policy (#2236) | ❌ | ✅ | ✅ |
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

### XACML policy Zod limits (#2712)

Write-path Zod caps for `/admin/policies`, `/me/policies`, and MCP `admin` policy shapes (SoT: `SECURITY.MAX_POLICY_*` in `src/config/defaults.ts`):

| Dimension | Cap |
|---|---|
| `rules` | `MAX_POLICY_RULES` (10) |
| `target.subjects` / `resources` / `actions` (each) | `MAX_POLICY_TARGET_MATCHES` (15) |
| `conditions` per rule | `MAX_POLICY_CONDITIONS_PER_RULE` (5) |

These are **array-item count** limits. Separate string `.max()` limits use Zod's UTF-16 code-unit semantics. They are **not** byte-aligned with `MAX_AUTHENTICATED_CONTROL_PLANE_REQUEST_BODY_BYTES` (1 MiB UTF-8). Multibyte payloads can still exceed 1 MiB while staying under Zod caps — the HTTP body cap remains the absolute safety net for `/me`/`/admin`.

**Breaking change asymmetry:** raising a cap is non-breaking; **lowering is breaking**. PDP evaluation does not re-validate stored policies through Zod, so oversized documents keep authorizing, but `PATCH`/`PUT`/`POST` that resubmit the full shape return **400**.

**Evidence for 15 matches (#2712):** partial staging Admin API sample (one visible tenant only) saw `resources` max **9**; 15 is a 1.67× margin. All other tenants and global (`tenantId: null`) policies were **not** measured — deploy after running the audit below.

**Pre-deploy audit (read-only).** Flag policies that would become uneditable:

```javascript
// mongosh — run per DB that has a `policies` collection
// $isArray で保護: 保存済みの非配列値で $size が監査全体を止めないようにする
const asArray = (expr) => ({
  $cond: [{ $isArray: expr }, expr, []],
});
db.policies.aggregate([
  { $project: {
      policyId: 1, tenantId: 1,
      rulesCount: { $size: asArray('$rules') },
      maxMatches: { $max: [
        { $size: asArray('$target.subjects') },
        { $size: asArray('$target.resources') },
        { $size: asArray('$target.actions') },
        { $max: { $map: { input: asArray('$rules'), as: 'r', in: { $size: asArray('$$r.target.subjects') } } } },
        { $max: { $map: { input: asArray('$rules'), as: 'r', in: { $size: asArray('$$r.target.resources') } } } },
        { $max: { $map: { input: asArray('$rules'), as: 'r', in: { $size: asArray('$$r.target.actions') } } } },
      ]},
      maxConditions: { $max: { $map: {
        input: asArray('$rules'), as: 'r',
        in: { $size: asArray('$$r.conditions') },
      }}},
  }},
  { $match: { $or: [
    { rulesCount: { $gt: 10 } },
    { maxMatches: { $gt: 15 } },
    { maxConditions: { $gt: 5 } },
  ]}},
])
```

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

> **`policyId` / `policySetId` naming (#1628).** Client-supplied IDs may contain characters that require URL encoding (non-ASCII, spaces, `%`). Percent-encode the ID in the path when addressing such a policy — API Gateway delivers `event.path` percent-encoded, and the server decodes it exactly once. A double-encoded segment therefore resolves to a single-encoded value (`a%2520b` addresses the policy whose ID is literally `a%20b`), and a malformed escape (`a%b`) returns `400`. IDs that literally contain `%` were previously addressable in raw form and must now be double-encoded (`50%-rule` is addressed as `50%25-rule`); a raw `%` that is not a valid escape now returns `400` instead of resolving. The `Location` header returned on creation is already percent-encoded, so following it verbatim works, except for the two ID shapes listed below.
>
> Two ID shapes remain unreachable through the API and should be avoided:
>
> - IDs containing `/` (both `policyId` and `policySetId`) — the route pattern matches a single path segment (`[^/]+`), and how API Gateway normalizes `%2F` inside a path is environment-dependent.
> - The exact `policyId` `import` — `POST /admin/policies/import` shadows the `/admin/policies/{policyId}` route. (Percent-encoding any one character, e.g. `%69mport`, falls through to the `{policyId}` route and does reach it.) This collision is specific to `policyId`; `policySetId` has no `import` route, so a `policySetId` of `import` is reachable.
>
> `policyId` and `policySetId` are currently validated for length only (max 256 characters), not for character class.

### Target Matching Semantics

Within `subjects`, `resources`, and `actions` arrays:
- **Same `attributeId`**: OR (any match satisfies) — e.g., `[{method: POST}, {method: PATCH}]` matches POST **or** PATCH
- **Different `attributeId`s**: AND (all must match) — e.g., `[{role: user}, {userId: u1}]` requires both
- **Across categories** (`subjects` + `resources` + `actions`): AND

**Omitted or empty `subjects` / `resources` / `actions`**: that category is skipped and matches **every** request for the category. This is XACML 3.0 empty-`<Target/>` semantics (`matchTarget` in `policy.pdp.ts`): a policy with only `resources` / `actions` (no `subjects`) is a **legitimate** resource-only / action-only policy — it applies to **all** subjects in the tenant (including `anonymous` and `tenant_admin`). An empty array (`"subjects": []`) is treated the same as omitting the field.

#### subjects-omission trap (#2934)

Custom policies are combined with role defaults using **per-priority-group first-applicable**, then **cross-group deny-overrides** (Deny from any applicable group wins). If you omit `subjects` on a Deny-carrying policy, the Deny applies to every role and overrides the role-default Permit — including `tenant_admin`.

```json
{
  "policyId": "readonly-paths-missing-subjects",
  "description": "INTENDED for api_key only — but subjects omitted",
  "target": {
    "resources": [
      {"attributeId": "path", "matchValue": "/v2/**", "matchFunction": "glob"},
      {"attributeId": "path", "matchValue": "/ngsi-ld/**", "matchFunction": "glob"}
    ]
  },
  "ruleCombiningAlgorithm": "first-applicable",
  "rules": [
    {
      "ruleId": "allow-read",
      "effect": "Permit",
      "target": {
        "actions": [
          {"attributeId": "method", "matchValue": "GET"}
        ]
      }
    },
    {"ruleId": "deny-others", "effect": "Deny"}
  ]
}
```

With the policy above, a `tenant_admin` POST is Denied: the custom policy matches (no `subjects` filter), `deny-others` fires, and cross-group deny-overrides beats the `tenant_admin` default Permit. Fix: always set `subjects` when the policy is meant for a subset of principals, e.g. `[{"attributeId": "role", "matchValue": "api_key"}]`.

See also [docs/customer/QUICKSTART.md](./customer/QUICKSTART.md) (MCP / DPoP policy recipes) and [INSTRUCTION.md appendix D.2](./customer/INSTRUCTION.md).

#### No create-time API warning (#2934)

GeonicDB does **not** return a warning field or header when `subjects` is omitted on policy create/update. Reasons:

1. **Resource-only / action-only policies are valid XACML** — a create-time warning would fire on intentional shapes and train operators to ignore it.
2. Adding a warning body field or header is a **public API surface change**; Priority Low documentation is the right layer for a runtime-data pitfall that static analysis cannot see (#2921).
3. There is no in-repo Admin UI to surface a soft warning; the Admin API remains the write path.

Do **not** make `subjects` required — that would break legitimate resource-only / action-only policies (breaking change).

### Match Functions (including GeonicDB extensions)

`matchFunction` values available in AttributeMatch within a policy's Target:

| matchFunction | Description | XACML 3.0 |
|---------------|------|-----------|
| `string-equal` | Exact match (default) | Standard |
| `string-regexp` | Regular expression match | Standard (`string-regexp-match`) |
| `glob` | Glob pattern match (`*`, `**` supported) | **GeonicDB extension** |

**Automatic glob detection (GeonicDB extension)**: When `matchFunction` is omitted, if `matchValue` contains `*`, it is automatically processed as `glob`. Otherwise, `string-equal` is applied.

**XACML XML export**: Since `glob` does not exist in the XACML 3.0 specification, it is converted to a regular expression and output as `string-regexp-match` on export.

#### `string-regexp` pattern constraints (#1935)

`string-regexp` `matchValue`s are validated **at write time** — on `POST/PATCH/PUT /admin/policies`, `POST /admin/policies/import` (XACML XML), `/me/policies`, and the policy-set endpoints. A pattern is rejected with **400** when it:

- exceeds **200 characters**,
- is empty or contains only whitespace,
- is not a syntactically valid regular expression,
- contains nested quantifiers such as `(a+)+` (ReDoS risk),
- contains more than 10 alternations or more than 5 backreferences.

> These limits are a **GeonicDB extension**, not an XACML 3.0 requirement. What the specification does define is the evaluation-time behaviour below (`Indeterminate` on evaluation error).

If a pattern turns out to be unevaluable **at evaluation time**, the match evaluates to **`Indeterminate`** per XACML 3.0 §7.6 (Target evaluation), not to "never matches". `Indeterminate` propagates to the Rule (§7.11) and Policy (§7.12) and is finally resolved **fail-closed as `Deny`**, and the list-query row filter (policy-to-filter) degrades to "no readable rows" (403) for the same request.

Two situations reach evaluation-time `Indeterminate`:

1. **`${subject.*}` template expansion** produces an unevaluable pattern (write-time validation can only inspect the *unexpanded* string).
2. **Policies stored before write-time validation existed**, or written by paths that bypass the service layer (e.g. `scripts/backup-import.ts` restores documents with a raw `insertMany`). No migration is performed for existing documents — evaluation-time `Indeterminate` is what covers them.

> Treating an unevaluable pattern as "never matches" is fail-closed for `Permit` rules but **fail-open for `Deny` rules** — the denial would silently stop applying. Keep `${subject.*}` templates short enough that the expanded pattern stays within the 200-character limit.

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
| `tenantService` | Tenant service name (`Fiware-Service` header). **Exception — `/custom-data-models`:** resolved from the authenticated actor's tenant, not from the header (see note below) | Request |
| `servicePath` | Service path (NGSIv2: resolved `TenantContext.servicePath` after CADDE `x-cadde-options` merge, e.g. `/devices`, `/opendata`. NGSI-LD: always `/` — the header is not part of the NGSI-LD spec, see note) | Request (resolved tenant) |
| `scope` | NGSI-LD entity scope (comma-separated, e.g. `/Madrid/parks,/Madrid/gardens`) | Entity context |
| `entityId` | Target entity ID (e.g. `Room1`) | Entity context / Subscription `entities[].id` |
| `entityType` | Target entity type (e.g. `Room`) | Request (auto-extracted) / Entity context / Subscription `entities[].type` |
| `entityOwner` | Entity creator's userId (`createdBy` field) | Entity context |
| `entityIdPattern` | Subscription target id pattern (e.g. `urn:ngsi-ld:Sensor:.*`) | Subscription `entities[].idPattern` (NGSIv2: `subject.entities[].idPattern`) |
| `notificationEndpoint` | Subscription notification endpoint URI (e.g. `https://hooks.example.com/x`) | Subscription `notification.endpoint.uri` (NGSIv2: notification channel `url`) |

> **Note**: `entityId` is only available for entity-level authorization checks (via `requireEntityAuthz`). `entityOwner` and `scope` are available for entity-level checks **and, since #1369, act as row-level filters on list read queries** — see [Policy-to-filter query rewriting](#policy-to-filter-query-rewriting-for-list-queries-1337--1369). `entityType` is automatically extracted from the HTTP request at the path level — from the `?type=` query parameter or the request body's `type` / `@type` field. **For by-id entity routes (`/entities/{id}` and below), authorization is enforced at the entity level with the actual `entityType` stored in the DB** (#1324) — the client-supplied `?type=` parameter is used only as a lookup filter and never as an authorization attribute. See [Entity-level authorization for by-id routes](#entity-level-authorization-for-by-id-routes-1324-1336). `servicePath` on NGSIv2 is taken from the **resolved `TenantContext`** (`extractTenantContext`), which already applies CADDE `x-cadde-options` overrides — the PIP does **not** re-read the raw `Fiware-ServicePath` header on HTTP paths (#1862; same class as #1835 for cache keys). Available at both path-level and entity-level checks — supports glob patterns (e.g. `/opendata/**`) for hierarchical path matching. **For NGSI-LD requests, `servicePath` is always evaluated as `/`** (#1323): the NGSI-LD spec (ETSI GS CIM 009) has no `Fiware-ServicePath` concept, the tenant middleware normalizes it to `/`, and the data layer stores every NGSI-LD entity at `servicePath: '/'`. Injecting the raw header value into the authorization request would let the caller choose their own authorization attribute while data access ignores it entirely — so servicePath-based policies **cannot be used as an isolation boundary on NGSI-LD**. For hierarchy-based control on NGSI-LD, use the `scope` attribute (entity-level) instead; for project-level isolation within a tenant, use `entityType` / `entityId` constraints. `scope` is the NGSI-LD equivalent of NGSIv2's `servicePath` at the entity level — when an entity has multiple scope values (e.g. `["/Madrid/parks", "/Madrid/gardens"]`), they are joined as a comma-separated string for matching with `string-regexp` or `glob`. **Subscription writes** (`POST`/`PATCH` on `/ngsi-ld/v1/subscriptions`, `/ngsi-ld/v1/csourceSubscriptions` and `/v2/subscriptions`, #1104 / #2005): the literal `body.type === "Subscription"` is **not** injected into `entityType` — instead, the PIP extracts the **subscription target** from `entities[]` (NGSIv2: `subject.entities[]`) and the **notification destination** from `notification.endpoint.uri` (NGSIv2: the `url` of the configured notification channel). On `PATCH` the attributes are resolved on the **post-update effective value** (declared value, otherwise the stored one). When `entities[]` contains multiple elements, one AuthzRequest is built per element and **all of them must Permit** (all-Permit semantics) for the request to succeed. This lets you write type-based policies ("anonymous can only subscribe to `ActivityLog`") and URI-based policies ("subscriptions may only post notifications to `https://*.example.com/**`", a defence against SSRF / data exfiltration). See [Subscription PIP attributes](#subscription-pip-attributes) below. **Batch operations** (`POST /ngsi-ld/v1/entityOperations/*`, `POST /v2/op/update`): one AuthzRequest is built per **distinct entity type** in the body (delete: per entity ID) with the same all-Permit semantics — see [Batch operation authorization](#batch-operation-authorization-1325). **`/custom-data-models` — `tenantService` comes from the actor, not the header** (#2215): this route is an admin API keyed on `actor.tenantId`, so the handler deliberately skips `checkTenantAccess` (the check that ties the `Fiware-Service` header to the caller's tenant). The header is therefore **unvalidated on this route**, and feeding it to the PDP would let the caller pick their own authorization attribute: a `tenantService`-conditioned **Deny** would silently stop matching (authorization bypass), while a `tenantService`-conditioned **Permit** would stop matching (over-denial). The PIP is given the tenant resolved from `actor.tenantId` instead, so `tenantService` policies behave the same here as on every other route. A principal with no tenant, or an unresolvable `tenantId`, is rejected with **403** (fail-closed) rather than being evaluated with the attribute missing. **No role is exempt** — `super_admin` is resolved from the actor too. Real `super_admin`s cannot reach this route at all (the unoverridable priority -1 deny-fence denies `/custom-data-models/**`), and the synthetic `super_admin` used when `AUTH_ENABLED=false` has no tenant, so a header fallback for that role would only reintroduce the unvalidated input on a path that cannot succeed anyway. **`servicePath` is pinned to `/` on this route** (#2221): custom data models are not partitioned by servicePath at all and the route never reads `Fiware-ServicePath`, so leaving the raw header in the authorization request would only hand the caller a second self-chosen attribute — the same fail-open shape as `tenantService` above, one dimension over. A `servicePath`-conditioned policy therefore always evaluates against `/` here and cannot be dodged by varying the header; it is still not usable as an isolation boundary on this route, but for the opposite reason (the value is fixed, not caller-chosen).

### Path-Level vs Entity-Level Authorization

GeonicDB uses a two-stage authorization model. Both stages use XACML evaluation, and since #1324 **both are fail-closed**. The same enforcement points also cover the MCP and A2A tool endpoints — see [MCP / A2A tool authorization](#mcp--a2a-tool-authorization-1610--1651--1672).

| Stage | Middleware | Triggered when | Non-Permit behavior |
|-------|-----------|----------------|---------------------|
| Path-level | `requireAuthz()` | Every authenticated request, except by-id entity routes and list reads (which delegate to the rows below) | `Deny` / `NotApplicable` / `Indeterminate` → **403 (fail-closed)** |
| Entity-level | `requireEntityAuthz()` (via `checkEntityOwnership`) | By-id entity routes — path-level is skipped and this is the single enforcement point (#1324) | `Deny` / `NotApplicable` / `Indeterminate` → **403 (fail-closed)** |
| List-level | `requireListReadAuthz()` | List read queries (#1337/#1369) | Derived row filter: `unrestricted` → no filter, partial → only readable rows, `none` → **403 (fail-closed)** |
| Subscription-update | `requireSubscriptionUpdateAuthz()` | `PATCH` on a subscription by id — path-level is skipped and this is the single enforcement point (#2005) | `Deny` / `NotApplicable` / `Indeterminate` → **403 (fail-closed)** |

#### Why path-level is fail-closed

Without an applicable policy, the request must be rejected. Otherwise, an unprivileged user could call any path that no policy explicitly Permits. The default role policies (`__default_user`, `__default_api_key`, etc.) ensure that the path stage always has at least one applicable rule.

#### Entity-level is also fail-closed (#1324)

Entity-level evaluation was historically fail-open, on the assumption that the path stage had already produced a Permit and this stage only applied **additional** constraints (owner-only, scope-based). That assumption broke when by-id entity routes started **skipping the path-level PEP** and delegating to entity-level as their single enforcement point — a `NotApplicable` there would be unauthorized access, not a missing extra constraint. Since #1324, `requireEntityAuthz()` rejects `Deny`, `NotApplicable`, and `Indeterminate` alike with `403` (see also [Entity-level authorization for by-id routes](#entity-level-authorization-for-by-id-routes-1324-1336)). The MCP / A2A synthetic-event checks reuse this same implementation, so they inherit the same fail-closed behavior.

This does not force tenants to write entity-targeted policies just to keep CRUD working: roles with decisive defaults (`user`, `tenant_admin`, `super_admin`) always produce a Permit or Deny on data APIs and never hit `NotApplicable`; only principals with empty-rule defaults (`api_key`, `anonymous`, `oauth_client`) fall through to `NotApplicable`, and for them closed is the correct answer (no policy = no access).

**Consequence**: attribute-based fine-grained control (e.g., "users can only modify entities they created") requires an **explicit Deny rule** at a priority above the role default — otherwise the role-default Permit applies at the entity level too.

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

Without such an explicit rule, the role default (`__default_user`, Permit on `/v2/**`) applies at the entity level and the request is permitted.

### WebSocket Authorization (WS ⊂ GET)

WebSocket subscriptions and broadcasts are evaluated as a **read-only stream** that is a subset of `GET`. The `authorizeWs()` PIP (`src/core/auth/policy/policy.pip.ts`) evaluates each WebSocket request **twice** — once with `action.method = 'WS'` and once with `action.method = 'GET'` — and grants access only if **both** evaluations return `Permit`.

#### The read frame is `/ngsi-ld/v1/entities` (#2284)

Both evaluations carry `resource.path = /ngsi-ld/v1/entities`. A WebSocket is an **NGSI-LD reader**: delivered events are NGSI-LD normalized and compacted with the subscription `@context` (#2026 / #2044), the `entityTypes` selector is canonicalized with that `@context` (#2055), and since #2284 only NGSI-LD entity changes are broadcast at all (see [EVENT_STREAMING.md](../features/subscriptions.md#websocket-is-an-ngsi-ld-reader-2284)). The frame must match the read path the same principal would use over HTTP — a `path` glob that does not cover the frame drops out of the target set entirely and supplies no `Permit`, which is how PR #2204 measured legitimate requests collapsing to `kind: 'none'` (#2205).

Until #2284 the frame was `/v2/entities`, i.e. the **NGSIv2** read path, while the representation and matching on the same socket were NGSI-LD. Two things followed from moving it, and they are deliberately shipped together — changing only the delivery filter or only the frame reproduces the #2205 accident:

- **Breaking for custom policies scoped to `/v2/**` only.** Such a rule no longer targets WebSocket requests; the subscribe is denied. Role defaults (`user`, `tenant_admin`) permit both `/v2/**` and `/ngsi-ld/**` and are unaffected. Fix by adding a rule matching `/ngsi-ld/**` (or `/ngsi-ld/v1/entities`) for the same subject, keeping the `entityType` / `entityOwner` / `scope` conditions unchanged.
- **A migration diagnostic, not a fallback.** When a `subscribe` is denied under the new frame, `authorizeWs()` re-evaluates it under `/v2/entities` and, if *that* would have permitted (both `WS` and `GET`), logs `WS_AUTHZ_FRAME_MIGRATION_REQUIRED` at `WARN` with the role, policy id and entity type. The decision stays `Deny` — accepting the legacy frame would let a principal restricted to NGSIv2 reads receive NGSI-LD entities, which is the boundary being closed. The extra evaluation runs at subscribe time only; per-event delivery denials do not pay for it and do not log. A failure inside the diagnostic is swallowed: an observation must never turn a decided `Deny` into a rejected promise.

##### The frame change cuts both ways — restricting policies must target `/ngsi-ld/**`

Target matching ANDs across different `attributeId`s, so a policy whose target pairs `path: /v2/**` with `entityType: X` — the shape of every **restricting** WebSocket policy written before #2284, including the `ws-self-only-feed` example below — becomes `NoMatch` → `NotApplicable` under the new frame. A `NotApplicable` group is dropped before the cross-group `deny-overrides` combination, so what remains is the role default (`__default_user` / `__default_tenant_admin` permit `/ngsi-ld/**`): **the restriction disappears and the socket starts receiving every entity of that type in the tenant.** Measured on PR #2324 with the `ws-self-only` fixture — the subscriber received an entity created by a different user.

So the frame move has two directions, and only one of them is a denial:

| Legacy policy intent | New frame alone |
|---|---|
| **Grant** WS (`Permit` under a `/v2/**` glob) | falls out of target → denied (diagnosed by `WS_AUTHZ_FRAME_MIGRATION_REQUIRED`) |
| **Restrict** WS (`Deny` / trailing `default-deny` under a `/v2/**` glob) | falls out of target → **delivery widens** |

The widening direction is an authorization regression, so `authorizeWs()` carried a transitional safety net that honoured an explicit `Deny` under the legacy `/v2/entities` frame. **That safety net was removed in [#2326](https://github.com/geolonia/geonicdb/issues/2326)**, once the migration was complete: the legacy frame was never observed to deny in practice (`WS_AUTHZ_LEGACY_FRAME_DENY` never fired), so a permitted request is now decided by the NGSI-LD frame alone and costs two PDP evaluations instead of four.

**A restricting policy scoped to `/v2/**` alone therefore no longer restricts WebSocket delivery.** Scope restricting policies to `/ngsi-ld/**` — see the migration note above, which the `WS_AUTHZ_FRAME_MIGRATION_REQUIRED` diagnostic still covers for the granting direction.

This invariant has two practical consequences for policy authors:

1. **Policies that Deny `GET` automatically Deny `WS`.** No need to repeat `WS` in the rule; the second evaluation will pick up the same Deny.
2. **Policies that target `WS` alone are typically a configuration mistake.** Because the second evaluation falls back to `GET`, denying `WS` only does not protect the underlying data — clients can still read it via `GET /ngsi-ld/v1/entities/...`. Conversely, permitting `WS` only is meaningless if `GET` is not also permitted.

#### Where the invariant is enforced: subscribe & delivery, not connect (#1271)

The `authorizeWs()` (WS ⊂ GET) check runs **per subscribed `entityType`** at two points, on both the API Gateway path (`handlers/websocket/default.ts` subscribe, `handlers/websocket/broadcaster.ts` delivery) and the local path (`core/streaming/local-ws-server.ts`):

- **Subscribe** — when a client sends `{ "action": "subscribe", "entityTypes": [...] }`, each type is authorized with `authorizeWs(..., { entityType })`. A type the policy does not permit is rejected.
- **Delivery** — before each event is pushed, the connection is re-authorized with the event's concrete `entityType` (and `entityOwner`/`scope`). Only permitted events are delivered.

**Connect does *not* run data authorization.** `$connect` (API GW) and the local upgrade handler verify **authentication and tenant match only** — they do not evaluate `authorizeWs`. This lets a key scoped to a single `entityType` (e.g. a policy that permits only `entityType = PollVote`, with **no** type-less `GET /ngsi-ld/v1/entities`) open a WebSocket and receive that type. The WS ⊂ GET invariant is preserved because **no event is delivered unless it passes the per-type `authorizeWs` at subscribe and delivery** — a principal with no GET for a type receives nothing of that type, even though the socket is open.

> **Connect-time 403 is not XACML (#2867).** A `$connect` rejection with body `"Access denied"` (without `"Access denied by policy"`) means **tenant resolution failed** (wrong deployment DB, tenant name mismatch, or unknown `?deployment=` hostname) — not a policy denial. PDP/`authorizeWs` runs only at subscribe and delivery. Dedicated deployments must pass `?deployment=<registered-hostname>` on the shared execute-api WebSocket URL (the SDK adds this automatically when `GET /sdk/v1/streaming` returns a `deployment` field).

`ip-range` and other `environment` policy conditions still apply to WS **at the data layer**: the connect-time source IP is stored on the connection record (`sourceIp`) and passed to the subscribe/delivery `authorizeWs` calls, so IP-scoped policies are evaluated there (not at connect). If `sourceIp` is unavailable it is treated as absent and `ip-range` conditions fail closed (deny).

> A connection whose principal can receive nothing (every type denied) is still accepted at connect but is effectively inert — it receives no events.

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

#### Per-entity attributes at broadcast time (#1107 / #1383)

When the WebSocket broadcaster (`src/handlers/websocket/broadcaster.ts`, `src/core/streaming/local-ws-server.ts`) decides whether to deliver a change event to a connection, it injects the following per-entity attributes into the AuthzRequest:

| attributeId | Source | Use case |
|-------------|--------|----------|
| `entityType` | `EntityChangeEvent.entity.type` | "Only forward `ActivityLog` events to clients" |
| `entityId` | `EntityChangeEvent.entity.id` | "Forward only `urn:ngsi-ld:Room:42` events" |
| `entityOwner` | `EntityChangeEvent.entity.owner` (the entity's `createdBy`) | "Forward only events for entities the recipient owns" |
| `scope` | `EntityChangeEvent.entity.scope`, comma-joined (#1383) | "Only forward events for entities scoped under `/public`" |

The `entityOwner` attribute, combined with `${subject.userId}` template expansion, lets you express **per-user "self-only" delivery filters** in a single XACML policy:

```jsonc
// Each user receives only updates to entities they created
{
  "policyId": "ws-self-only-feed",
  "target": {
    "subjects": [{ "attributeId": "role", "matchValue": "user" }],
    // #2284: the WebSocket frame is the NGSI-LD read path. A `/v2/**` glob here no longer
    // targets WebSocket requests, so this restriction would stop applying (see below).
    "resources": [
      { "attributeId": "path", "matchValue": "/ngsi-ld/**", "matchFunction": "glob" },
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
> **Source of `entity.owner`**: populated transparently by `EntityService` (and by the snapshot clone publisher, #1563) when publishing change events, via the shared `buildChangeEventEntity()` builder (#1383). On AWS this is the **only** event publisher for API-originated writes (#1560 removed the MongoDB change-stream processor, which was a dead second publisher); on local/standalone the in-process Change Stream watcher uses the same builder for subscription/rules, while WebSocket still follows `emitEntityChange` from the app path. It comes from the entity's `createdBy` field (set on `POST` by the authenticated user) — entities without `createdBy` (legacy / batch / unauthenticated writes) emit events without `owner`, in which case owner-based rules will not match and the next rule applies.
>
> **TTL-expiry deletions emit `EntityDeleted` via the app-side sweeper (#1561).** MongoDB's TTL monitor still physically deletes outside `EntityService`, but `EntityExpiryService` claims soft-deleted rows first and publishes through `createEventPublisher()` — the usable `id` / `type` / `owner` / `scope` that the old change-stream `delete` branch never reliably carried. See [EVENT_STREAMING.md](../features/subscriptions.md) and [QUOTAS.md](../saas/quotas.md#ttl-失効-expiresat-expiry-sweeper1561).
>
> **Other EntityService-bypass paths (#1563)**: snapshot clone **emits** `EntityCreated` / `EntityUpdated`. Tenant cascade delete and invalid-geo quarantine **do not emit** (flood / infra repair) — decisions are in code comments and SECURITY.md / [EVENT_STREAMING.md](../features/subscriptions.md).
>
> **`scope` at broadcast time (#1383)**: populated from the stored entity's `scope` and matched with the same **comma-joined string semantics** as entity-level checks and the list-query row filter (#1369) — the delivery boundary is identical to what the subject can read via `GET` lists. Unscoped entities (missing / `null` / `[]`) evaluate as `''`. Prefer boundary-aware `string-regexp` patterns (e.g. `(^|,)/public(/[^,]*)?(,|$)`) for subtree matching on multi-scope entities.

### Subscription PIP attributes

A subscription is a **continuous read**, so target and destination restrictions must hold on every write to it — not just on create. Since #2005 the PIP therefore covers **all six subscription write cells**, and on all of them the literal `body.type === "Subscription"` is intentionally **not** exposed as `entityType`:

| Resource | Create | Update |
|----------|--------|--------|
| NGSI-LD subscriptions | `POST /ngsi-ld/v1/subscriptions` | `PATCH /ngsi-ld/v1/subscriptions/{id}` |
| Context source subscriptions | `POST /ngsi-ld/v1/csourceSubscriptions` | `PATCH /ngsi-ld/v1/csourceSubscriptions/{id}` |
| NGSIv2 subscriptions | `POST /v2/subscriptions` | `PATCH /v2/subscriptions/{id}` |

| attributeId | Source field (NGSI-LD / csource) | Source field (NGSIv2) | Use case |
|-------------|----------------------------------|-----------------------|----------|
| `entityType` | `entities[].type` | `subject.entities[].type` | "Anonymous can only subscribe to `ActivityLog`" |
| `entityId` | `entities[].id` | `subject.entities[].id` | "Allow subscribing only to `urn:ngsi-ld:Room:1`" |
| `entityIdPattern` | `entities[].idPattern` | `subject.entities[].idPattern` | "Allow subscribing only when the pattern matches `urn:ngsi-ld:Sensor:.*`" |
| `notificationEndpoint` | `notification.endpoint.uri` | `notification.http` / `httpCustom` / `mqtt` / `mqttCustom` `.url` | "Notifications may only be sent to `https://*.example.com/**`" — defence against SSRF / data exfiltration |

`?type=` is **never** used as the authorization attribute on these paths: the controllers use neither it nor `body.type` to decide what the subscription watches, so accepting it would let a caller declare `?type=Public` while actually subscribing to `Secret`.

#### Partial updates are evaluated on the post-update effective value (#2005)

`PATCH` is a partial update, so the attributes above are resolved as **"the value the body declares, otherwise the value already stored"**:

- body declares `entities` (NGSIv2: `subject`) → the declared targets are evaluated (you cannot swap a permitted subscription over to a restricted type);
- body omits them → the **stored** targets are evaluated (you cannot keep a subscription that targets a now-restricted type alive by only touching its description or notification endpoint);
- neither yields a target → a single empty target is evaluated, which fails closed.

Narrowing is allowed: a subscription that targets a restricted type may be `PATCH`ed down to a permitted type, because the post-update value is what gets evaluated.

Because the stored value is needed, the `PATCH` cells delegate the decision from the path-level PEP to the controller (`requireSubscriptionUpdateAuthz`), the same way by-id entity routes delegate to entity-level authorization. Stored types are already canonical and are **not** re-normalized against the request `@context`; only client-declared types are (#1613).

#### The PEP resolves the same `@context` as the subscription controller (#1657)

Client-declared types are canonicalized before evaluation (#1613), so the PEP must pick the **same** active `@context` the controller will store with — otherwise a caller can alias a restricted type into a permitted-looking term ("authorization sees `AliasType`, storage sees `SecretType`"). Since #1772 / #1924 the supply rule is clause 6.3.5 applied in **one** place (`selectActiveContextRef`), used by controllers and PEP alike: `application/ld+json` takes the body `@context`, `application/json` takes the `Link` header, and mixing the two is a 400. Because there is no per-route branch left, a controller changing its `@context` source cannot silently desynchronize the PEP.

`tests/e2e/features/auth/subscription-write-authz.feature` pins this for both supply forms: a term aliased onto the restricted type's IRI is rejected whether it arrives via the ld+json body `@context` or via the `Link` header on `application/json`.

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

> **Policy targeting note**: policies written against `path` with an exact match on `/ngsi-ld/v1/subscriptions` only cover the create call. To cover updates as well, use a glob (`/ngsi-ld/v1/subscriptions**`) — `*` does not cross `/`.

### Batch operation authorization (#1325)

Batch operations carry multiple entities in a single request, so a single `entityType` cannot represent the whole request. The PIP extracts one authorization target per **distinct entity type** from the request body and the PEP evaluates them with the same **all-Permit semantics** as subscriptions: every target must return `Permit`, otherwise the entire batch is rejected with `403 Forbidden`.

Covered endpoints (all `POST`):

| Endpoint | Body shape | Targets |
|----------|-----------|---------|
| `/ngsi-ld/v1/entityOperations/create` / `upsert` / `update` / `merge` | Entity array | One per distinct `type` / `@type` (multi-type arrays supported) |
| `/ngsi-ld/v1/temporal/entityOperations/create` / `upsert` | Entity array | Same as above |
| `/ngsi-ld/v1/entityOperations/delete`, `/ngsi-ld/v1/temporal/entityOperations/delete` | Entity ID (URI string) array | One per distinct `entityId`, with `entityType` fixed to `""` (the type is unknown without a DB lookup) |
| `/v2/op/update` | `{ actionType, entities: [...] }` | One per distinct `entities[].type` |

Example: with a policy that permits `POST` only for `entityType: EVChargingStation`, a batch upsert containing only `EVChargingStation` entities succeeds, while a batch that mixes in a single `Sensor` entity is rejected as a whole — nothing is written.

**Fail-closed rules**:

- Elements whose type cannot be determined (missing `type`, NGSIv2 id-only updates, non-object elements), unparsable bodies, and bodies exceeding `MAX_BATCH_SIZE` are evaluated as a target with `entityType: ""`. This never matches a type-constrained Permit rule, and the `?type=` query parameter is deliberately **not** used as a fallback for these targets (otherwise appending `?type=<allowed>` would bypass the constraint).
- Policies that constrain only `path` / `method` (no `entityType` match) are unaffected: they match regardless of the injected `entityType` value, so unconstrained API keys behave exactly as before.
- **Batch delete** bodies are ID arrays with no type information, so type-constrained-only policies cannot permit batch deletes. Add an `entityId`-based rule (glob patterns supported, e.g. `urn:ngsi-ld:EVChargingStation:*`) or use single-entity `DELETE` requests instead.

> **Note (#1325/#1337/#1369)**: the read-side batch endpoints `POST /ngsi-ld/v1/entityOperations/query` and `POST /v2/op/query` are handled by **list-level authorization**: a readable-entity filter (entityType / scope / entityOwner) is derived from the policy set and composed into the query; a declared type is folded in as a fixed attribute (a non-permitted declared type still yields 403) — see [Policy-to-filter query rewriting](#policy-to-filter-query-rewriting-for-list-queries-1337--1369).
>
> **Set-based deletion (`purge`) is also list-level (#1679)**: `DELETE /ngsi-ld/v1/entities` (clause 5.6.21) and the GeonicDB extension `POST /ngsi-ld/v1/entityOperations/purge` select their targets by a *predicate*, not by an id set, so the all-Permit batch evaluation above does not apply. Both derive the same readable-entity filter (entityType / scope / entityOwner) and compose it into the deletion query, so **rows the subject is not permitted to delete are excluded from the predicate and survive**; a subject with no deletable rows at all gets `403`. Path-level body extraction (`type`) alone is *not* sufficient — it only sees the client-declared type, never the stored `scope` / `entityOwner`. The same wiring is applied to the non-HTTP entry points that bypass the controllers: the MCP `batch` tool (`action: "purge"`) and the A2A `batch` skill (`action: "purge"`).
>
> **Exception — the declared type is *not* folded when it is not the single authoritative operated type (#1653/#1656/#2061)**: for **NGSIv2 `POST /v2/op/query`** the actual matched types live in the body's `entities[].type` / `typePattern` (multiple specs), and the controller ignores `?type=` / body top-level `type`; and a **comma-separated `?type=A,B`** on a list read is split element-by-element by the controller. Folding either as a single fixed attribute would let it collapse the derived filter to `unrestricted` (if that folded value is unconditionally permitted) while the controller matches a *different* type set — leaking forbidden rows under permit-by-default + point-deny policies. For these routes `entityType` is kept a **free variable** and the derived row-level predicate is enforced across every spec instead.
>
> **The discovery routes never fold `?type=` at all (#2061)** — not even a single token. `GET /ngsi-ld/v1/types`, `/types/{typeName}`, `/attributes`, `/attributes/{attrId}`, `/v2/types` and `/v2/types/{typeName}` decide what they match from the **path parameter** (detail) or from **all readable entities** (list); none of them reads `?type=`. Folding it let `?type=<readable>` collapse the derived filter to `unrestricted` and leak the existence, `entityCount` and attribute names of unreadable types — re-opening the leak that #1370 closed. Consequently `?type=<denied>` on these six routes no longer produces a fast `403`: the response is identical to the same request without `?type=` (row-filtered `200`, or `404` for a type the subject cannot read). That is the correct outcome — ETSI GS CIM 009 defines no `type` parameter for these operations, so the old `403` was a false denial driven by a value the controller never consults. `/ngsi-ld/v1/temporal/entities` and `/ngsi-ld/v1/entityMaps` **do** use `?type=` as a real match filter (`params.type` → `typeList`), so they keep folding it.
>
> Outside those six routes, a single `?type=Denied` (no comma) is still folded (fast `403`).

### Entity-level authorization for by-id routes (#1324, #1336)

For **by-id entity routes** — `/ngsi-ld/v1/entities/{id}` (and `/attrs`, `/attrs/{attrName}`), `/v2/entities/{id}` (and `/attrs`, `/attrs/{attrName}`, `/attrs/{attrName}/value`), and the **temporal by-id routes** `/ngsi-ld/v1/temporal/entities/{id}` (and `/attrs`, `/attrs/{attrName}`, `/attrs/{attrName}/{instanceId}`) (#1336) — the path-level PEP is skipped and **entity-level authorization is the single enforcement point**. Before touching data, the controller loads the entity's real attributes from the DB and evaluates the full policy set with:

| Attribute | Source |
|-----------|--------|
| `entityType` | **Actual type stored in the DB** — never the client-supplied `?type=` parameter (that is only a lookup filter). If the entity does not exist, `entityType` is evaluated as `""` (matches no type-constrained Permit rule). |
| `entityId` | Path parameter |
| `entityOwner` | `createdBy` of the stored entity |
| `scope` | `scope` of the stored entity |

Consequences:

- **Type-constrained keys work on by-id operations.** A policy that permits `GET` for `entityType: SalesTarget` now permits `GET /ngsi-ld/v1/entities/urn:ngsi-ld:SalesTarget:1` directly. Before #1324 this always fell through to deny (path-level evaluation had no `entityType`), and the workaround was URN-prefix `path` glob rules — those still work but are no longer necessary.
- **Entity-level decisions are fail-closed**: `NotApplicable` → `403`. Roles with decisive defaults (`user`, `tenant_admin`, `super_admin`) are unaffected (their default policies always produce a decision); for `api_key` / `anonymous` / `oauth_client` (empty-rule defaults) this is the correct closed behavior. Nonexistent entities under a constrained key yield `403` (existence is not disclosed).
- **`?type=` cannot forge the authorization attribute.** `GET /entities/{sensorId}?type=AllowedType` is denied: the DB lookup (filtered by the declared type) finds nothing and the request is evaluated with `entityType: ""` — the query-parameter fallback is deliberately suppressed for entity-level evaluation (same bypass-prevention as #1325).
- Deny fences (e.g. the super_admin data-API fence) are unaffected — entity-level evaluation runs the same policy set as the path level.
- **Temporal by-id routes source the authorization attributes from the `entities` collection** (#1336) — the temporal collection stores no owner/scope. If the entity no longer exists there (deleted with history retained, or created via the temporal API alone), owner and scope are unavailable and the request is evaluated without them.
- **`entityType` is *not* dropped in that case (#2157).** It is resolved from the temporal history's own `metadata.entityType` and evaluated **in addition to** the typeless evaluation (both must Permit), so a Deny rule targeting `entityType` still matches a **temporal-only** entity (one with history but no document in `entities` — the normal outcome of `POST /ngsi-ld/v1/temporal/entities`, which never writes to `entities`, except a scope-carrying body, which **does** materialize one via #2434 A'-1). Before #2157 the attribute was simply absent, the type-constrained Deny rule went `NoMatch`, and a permit-by-default policy read the forbidden history through `GET /ngsi-ld/v1/temporal/entities/{id}`, MCP `temporal.get`, or A2A `temporal.get` — while the *list* route hid the same rows (they are filtered by the readable `entityId` set derived from `entities`). The fallback closes that read/by-id asymmetry in the fail-closed direction; the list route was deliberately **not** widened. It applies to every temporal by-id operation (get / delete / attrs / instance) and to the temporal **batch** shapes, so `batch_delete` cannot reach a row that by-id delete refuses (parity invariant). Multiple recorded types for one id require *all* of them to be permitted.
- **The fallback only ever denies more, never less.** Because the typeless request is still evaluated alongside the resolved type, a subject that was refused when the type could not be resolved stays refused: the deliberate fail-closed rule of #1336 — a type-constrained subject cannot reach history whose entity body no longer exists — is preserved verbatim. (Replacing the typeless evaluation instead of adding to it silently flipped that case from `403` to `200`; measured on `tests/e2e/features/auth/temporal-entity-authz.feature`.)
- **Owner / scope for temporal-only entities remain unevaluable** — the temporal collection records neither, so owner- and scope-constrained rules still cannot bind to those rows (unchanged by #2157; see the known limitation below).

### Policy-to-filter query rewriting for list queries (#1337 / #1369)

For **list read queries** — `GET /ngsi-ld/v1/entities`, `GET /v2/entities`, `POST /ngsi-ld/v1/entityOperations/query`, `POST /v2/op/query`, and (since #1370) the aggregate reads `GET /ngsi-ld/v1/types`, `GET /ngsi-ld/v1/attributes`, `GET /v2/types`, `GET /ngsi-ld/v1/temporal/entities` — the path-level PEP is skipped and **list-level authorization** derives a *readable entity predicate* from the subject's effective policy set, composing it into the MongoDB filter (row-level security). Pagination, `NGSILD-Results-Count` / `Fiware-Total-Count`, and list ETags are computed after the filter, so they are always consistent with what the subject can read.

The derivation is a **symbolic PDP evaluation with `entityType`, `scope`, and `entityOwner` as free variables** (#1369 extended this from `entityType` alone): an entity `E` matches the derived predicate if and only if the same request evaluated with `entityType: E.type`, `scope: E.scope.join(',')`, `entityOwner: E.createdBy` would be Permitted. All three rule-combining algorithms and the two-stage combining (per-priority-group first-applicable + cross-group deny-overrides) are reproduced exactly, including rule ordering.

When the request **declares a type** (`?type=` / `body.type`), `entityType` leaves the free-variable set and is folded as a fixed attribute with the declared value — preserving the #649 semantics (a non-permitted declared type still yields `403`), while the scope/owner row filter **still applies**: declaring a type cannot bypass scope/owner-based restrictions. Only `null` / `undefined` attributes become free variables (#1384). **The declared type is folded only when it is the single authoritative operated type**: for `POST /v2/op/query` (whose real types are the body's `entities[].type` / `typePattern` specs); for the discovery routes `GET /ngsi-ld/v1/types(/{typeName})?`, `GET /ngsi-ld/v1/attributes(/{attrId})?`, `GET /v2/types(/{typeName})?` (#2061) — whose controllers never match against `?type=` at all (the by-name detail routes match on the **path** parameter, the bare list routes aggregate over every readable row), so a declared `?type=` has no observable effect on which rows the controller actually returns and folding it would let a single readable `?type=` value collapse the derived filter to `unrestricted` while every other type's existence/count/attribute-name leak stays open; and for a `?type=` that the controller normalizes (`split(',') → trim → drop-empty`) into anything other than a single token identical to the raw value — comma-separated `A,B`, whitespace-padded `" Secret"`, or whitespace-only `" "` (which the controller turns into *no* type filter = all types) — `entityType` is kept a **free variable** so the derived row-level predicate is enforced across every spec, rather than folded and collapsed to `unrestricted` (#1653/#1656/#2061). The empty-string fail-closed marker (`''`, from `body.type: ""`) is the one exception: it is **not** made free — it still folds to `kind:'none'` → `403` (#1384), so `body.type: ""` cannot be used to escape the whole-list deny. An **empty-string value on the request — the fail-closed marker for unresolvable attributes (#1324/#1325), e.g. `body.type: ""` — fails the whole list closed (`403`)**: it cannot be folded as a fixed value, because the data query does not restrict rows by an empty value (folding it would let constrained Deny rules go vacant — a leak), and it cannot be treated as free without ignoring the marker. This applies to the *request's* declared attribute value only: policy **rules** with `matchValue: ""` on `scope` / `entityOwner` (matching unscoped / ownerless rows) are unaffected and continue to match those rows in the derived row filter.

Outcomes:

| Derivation result | Behavior |
|---|---|
| Unconditional Permit, no deny contributions | No filter (unchanged behavior — e.g. `tenant_admin`, plain `user` role) |
| Some readable rows | `200` with only readable entities (**was `403`** for type/scope/owner-constrained subjects before #1337/#1369) |
| No readable rows | `403` fail-closed (unchanged — e.g. policy-less `api_key` / `anonymous`) |

Consequences:

- **Type-constrained keys can list without `?type=`.** A key permitted only for `entityType: SalesTarget` gets a `200` containing only SalesTarget entities. Before #1337 this was always `403`.
- **Explicit Deny rules now hide their types from list results.** A tenant policy denying `GET` on `entityType: Secret` (at a priority above the role default, e.g. `priority: 10`) removes Secret entities from a `user`'s type-less list — previously the deny only worked on by-id / by-type requests.
- **Owner-only reading works on lists** (#1369). A rule permitting `GET` with `entityOwner: ${subject.userId}` (+ deny-others) turns every list into "only rows I created", with correct count headers. The MongoDB translation targets the stored `createdBy` field; conditions matching the empty string also match documents with no `createdBy` (the PDP evaluates a missing owner as `''`).
- **Scope-based reading works on lists** (#1369). Scope rules are matched against the same **comma-joined scope string** the PDP uses for entity-level checks (see the `scope` attribute note above) — prefer boundary-aware `string-regexp` patterns such as `(^|,)/public(/[^,]*)?(,|$)` for subtree matching on multi-scope entities. The translation reproduces the joined-string semantics in MongoDB via `$expr`; unscoped entities (`scope` missing / `null` / `[]`) match rules that match `''`. Geo queries (`$geoNear`) apply the same predicate as a `$match` stage, so distance-sorted results and their counts are filtered identically.
- Environment conditions (`time-range` / `ip-range`) and `${subject.*}` templates are folded at request time; unresolved templates (#1939) and invalid regexes (#1935) are `Indeterminate` and short-circuit the derivation to "no readable rows" (403), the same fail-closed outcome the PDP reaches.
- Rules constrained by **`entityId` / `entityIdPattern` do not fire at list level** (they are evaluated against the empty value, exactly as path-level evaluation did) — by-id requests are covered by entity-level authorization (#1324).
- **Federated results (context providers) are filtered by the same derived predicate too (#2003)** — see the callout below for how, since remote entities never touch MongoDB and can't go through `entityReadFilterToMongo` directly.

> **Behavior change note (#1369)**: policies constrained by `scope` / `entityOwner` previously never fired on list requests (both attributes evaluated as `''`). They now act as row filters. In particular, an "owner-only **write**" policy that does not restrict its `actions` to write methods will also row-filter reads once it applies to list paths — scope such policies to the intended methods (`actions: [{"attributeId": "method", "matchValue": "PATCH"}, ...]`).
>
> **Follow-up status**: the `/ngsi-ld/v1/types` / `/ngsi-ld/v1/attributes` aggregations and temporal list queries that #1369 deferred were completed in #1370 / #1488; EntityMap creation in #1955 and EntityMap **reading** in #1963 (see the table below). All follow-ups from #1369 are now closed.
>
> **Federated (context provider) results now pass through the same predicate too (#2003).** Remote entities merged in from `ContextSourceRegistration` forwarding never touch MongoDB, so the derived filter above — which is composed into the MongoDB query — never ran on them: a principal restricted by `entityType` / `scope` / `entityOwner` previously saw the **full, unfiltered** remote result. `entityMayBeRead()` (`policy.filter.ts`) is a JS mirror of `entityReadFilterToMongo` that evaluates all three free-variable dimensions against **concrete values** — unlike `entityTypeMayBeReadable()` (the registration-existence check further down, which treats `scope` / `entityOwner` as "may match" because a registration carries no concrete value for them), a remote entity **is** a row of real data, so a dimension it has no value for folds to the same real value `''` used for a local document with no `createdBy` / no `scope` — not to "may match". `FederationService.filterRemoteEntitiesByReadFilter()` applies it before the inclusive/auxiliary merge and in exclusive mode. Because remote responses carry `type` **verbatim** (unlike the canonicalized stored form), the filter canonicalizes it first with the same `createStoredTypeCanonicalizer()` used by #2086 — otherwise a `Deny entityType == Sensor` rule would silently miss an FQN'd remote type (the #2086 class of leak). If the core `@context` can't be resolved, remote results are **dropped entirely** rather than compared unnormalized (fail-closed). This also let #2003 remove the #1994 `probeEntityType` guard that kept row-level-restricted principals on the conservative type-suppressing candidate set for registration matching. Restricted principals now go through **normal** registration matching, after which `narrowRegistrationsByReadableType()` drops candidates that declare **only** types the principal cannot read (using `entityTypeMayBeReadable()`, the same existence check the discovery endpoints use). Filtering the merged entities alone would not be enough: a forwarded-but-unreadable registration still leaks its `endpoint` and registration id through the `199` warning raised on provider failure, and — for `exclusive` registrations — through the `508` raised by Via-loop detection. Registrations that declare no type at all (`entityTypes` empty or `'*'`) carry no type information and are still forwarded. Entity visibility is unchanged by this narrowing, because a dropped registration could only have supplied entities of the types it declares, and those are removed by the row-level predicate anyway. If the core `@context` cannot be resolved, no forwarding happens at all and the response carries a `199` warning saying the result is partial (clause 6.3.6) — deliberately **without** naming any registration.
>
> **By-id fetch is covered too (#2092).** `GET /ngsi-ld/v1/entities/{id}` for an entity that exists only remotely goes through entity-level authorization (#1324/#1336), and `getEntityAuthzContext` finds nothing locally for such an entity — the PDP evaluates without `entityType`, so a type-based `Deny` never fires at that point (measured to return `200` before the fix). #2092 closes this with the same row-level predicate as #2003: every federated by-id read path (NGSI-LD `GET /entities/{id}`, `/attrs`, `/attrs/{attrName}`; NGSIv2 `GET /v2/entities/{id}`, `/attrs`, `/attrs/{attrName}`, `/attrs/{attrName}/value`) passes a lazily-derived filter (`deriveRemoteEntityReadFilter`) into `FederationService.getEntity`, which applies `entityMayBeRead()` (type canonicalized first) to the remote entity and `narrowRegistrationsByReadableType()` to the forwarding candidates. The derivation deliberately keeps `entityType` a **free variable** even when the client declares `?type=` — the declared type is a search filter only (#1324) and must not let a caller steer the `Deny` off-target. An unreadable remote-only entity yields `404` (indistinguishable from non-existence, consistent with it being absent from list results); the derivation runs only when at least one forwarding candidate registration matches, so tenants without registrations pay no extra policy work. MCP / A2A `get` actions use the non-federated `EntityService` (no `get` in `ENTITY_FORWARDING_ACTIONS`) and never reach remote entities.

#### Aggregate and derived reads over entities (#1370 / #1955)

Any endpoint that reads the `entities` collection must apply **the same derived predicate**, otherwise the row the entity endpoints hide becomes observable through the other endpoint (the #1376 parity invariant). Beyond the list endpoints above:

| Endpoint | What the predicate protects | Wiring |
|---|---|---|
| `GET /ngsi-ld/v1/types`, `/v2/types`, `/ngsi-ld/v1/attributes` | Existence of a type / attribute, and their counts | #1370 / #1488 / #2061 (closed a `?type=` fold that let a single readable type collapse the derived filter and re-open the leak) |
| `GET /ngsi-ld/v1/temporal/entities` | Readable `entityId` set (temporal rows carry no owner/scope) | #1370 |
| `POST /ngsi-ld/v1/snapshots`, `.../clone`, `DELETE /ngsi-ld/v1/snapshots` | Rows copied into / restored from a snapshot | #1945 |
| `POST /ngsi-ld/v1/entityMaps` | The `entityIds` set stored in the EntityMap and its `totalCount` | #1955 |
| `GET /ngsi-ld/v1/entityMaps{,/{id}}`, `PATCH`, `DELETE` | The **stored** `entityIds` / `totalCount` of an EntityMap created by another principal | #1963 (owner guard) |
| `GET /ngsi-ld/v1/entities{,/{id}}?join=flat\|inline` | Entities reached by following `Relationship` objects (Linked Entity Retrieval, clause 4.5.23) | #2213 |
| `GET /catalog{,/**}` (DCAT / datasets / sample / CKAN) | Dataset existence, `entityCount`, attribute schema, spatial bbox, and `sample` entity bodies | #2465 / #2468 / #2471 / #2472 |
| Notification payloads of subscriptions with `notification.join` | Entities reached by following `Relationship` / `ListRelationship` targets **into the notification body** | #2104 |
| Notification payloads of entity subscriptions (`/ngsi-ld/v1/subscriptions`, `/v2/subscriptions`) | The **primary notified entity itself** — id, type and attribute values in `data[]` | #2205 |

> **CADDE v4 is explicitly outside this matrix (#2469).** `/cadde/api/v4/entities` and `/cadde/api/v4/catalog` do not carry a GeonicDB principal — they authenticate with CADDE's own JWT (or none when `authEnabled: false`) and **never apply XACML row-level read filters**, including tenant policies such as `Deny(entityType == X)`. This is intentional: CADDE is a deployment-wide, opt-in data-exchange gate (`PUT /admin/cadde`, `enabled: false` by default) whose trust model is contract-level (resource URL / connector auth), not per-principal row control inside GeonicDB. The #1376 parity invariant ("principal P's restrictions hold across every shape P can use") does not apply because there is no GeonicDB principal P on this path. See CADDE and XACML.
>
> **Linked Entity Retrieval (`join`) follows Relationships into rows the caller never asked for (#2213).** `join=flat` / `join=inline` resolve the targets of `Relationship` attributes and either append them to the response array or embed them as an `entity` sub-attribute. Those targets are **not** the types the caller declared in `?type=` — they are whatever the linking entity points at. Until #2213 the resolution ran through `EntityRepository.getMany()`, which carried the tenant / servicePath / protocol / soft-delete boundary but **no row-level predicate**, so a subject denied `entityType == Secret` could read a `Secret` entity in full by requesting a readable entity that links to it. One `Relationship` was enough to step around the predicate — the same "two paths disagree on which rows are readable" class as #2003 (federated results).
>
> **The same hole exists in notifications (#2104).** `notification.join` resolves Relationship targets into the notification body, where there is no HTTP request and therefore no `actor` to derive a predicate from. The predicate is derived from the **subscription creator** (`createdBy`) with `deriveSubscriberReadFilter()` — the helper #2133 introduced for CSource notifications, shared so the two paths cannot drift (getting the effective role or the `super_admin` `tenantId` wrong in either place turns into "what HTTP hides shows up in a notification"). The `'skip'` outcome is mapped differently, though: CSource notifications are **not sent** when the predicate is undecidable, whereas a `notification.join` maps `'skip'` to `{ kind: 'none' }` — zero linked entities, notification still delivered. `join` is additional representation, so an undecidable predicate must not silently stop deliveries; withholding the linked data is the fail-closed part.
>
> **The notified entity itself passes through the predicate too (#2205).** #2104 above covers the rows a `notification.join` *reaches*; the entity the notification is actually about was never filtered. It could not be filtered by the write path either: subscription writes are authorized with the **subscription resource path** as the frame (`buildSubscriptionAuthzRequests`), so a policy scoped to `/ngsi-ld/v1/entities**` is not even part of the target set when a subscription is created — a subject denied `entityType == Secret` on entity reads could create a subscription for `Secret` (or `type: "*"`) and receive those entities as notifications. Re-framing the *write* authorization onto the entity read path is not a fix: measured in PR #2204, a custom policy that permits subscription writes by path glob falls out of target under the read frame and supplies **no Permit at all**, collapsing to `kind: 'none'` and turning legitimate `201`s into `403`s. The delivery-time form is used instead — the same shape as `#2140` reads, `#2133` CSource notifications and the WebSocket per-event `authorizeWs` (#1107 / #1383): the subscription is allowed at write time, and **every delivery** is judged against the creator's current predicate. Judgement uses `entityMayBeRead()` (all three free dimensions on the real row), not `entityTypeMayBeReadable()` — a notification body carries the entity's contents, so looking only at the type dimension leaks rows to `entityOwner` / `scope`-restricted subjects. The read frame path follows the subscription's own `protocol` (`NOTIFICATION.READ_FRAME_PATH`: `/ngsi-ld/v1/entities` or `/v2/entities`) so the synthetic event lands in the same target set the principal's HTTP reads do. Because the predicate is re-derived per delivery, this also closes two gaps `#2005` left open: subscriptions created before a restriction was tightened are re-judged instead of grandfathered until the next `PATCH`, and `scope` / `entityOwner` restrictions apply even to concrete-type selectors (the subscription PIP never builds those attributes). The gate runs **before** `claimNotificationSlot` — a suppressed subscription must not consume its throttling / cooldown window, or the notification disappears permanently once the predicate later allows it.
>
> `'skip'` (undecidable predicate) means **do not deliver**, matching CSource notifications rather than `notification.join`'s "zero linked entities": here the withheld thing *is* the notification. The fail-closed cells depend on the creator's principal kind. For **user** creators they are the shared ones listed for #2133 above — no stored `createdBy`, a creator that does not resolve to an active user, a creator whose membership in the notified tenant is revoked or absent, an unresolvable tenant, and a predicate that denies entity reads outright. For **credential** creators (`api_key` / `oauth_client`, #2282) the user-document and membership cells do not apply at all — they are evaluated from the credential document instead, and fail closed only when that document is missing, revoked (`isActive: false`), or belongs to a different tenant, when the stored principal kind disagrees with the id shape, when the kind was never stored (subscriptions written before #2282), or when the derived predicate denies entity reads outright. **A valid, active API key bound to a permitting policy is not a suppression cause** — its subscriptions receive every row that key can read over HTTP. **Behavior change**: legacy subscriptions without `createdBy` stop receiving notifications on `AUTH_ENABLED=true` deployments until re-created by an identifiable principal; the `securityEvent` warning log (`SUBSCRIPTION_NOTIFICATION_RLS_SKIPPED`) makes this operationally visible. API-key and OAuth-client creators were in that same bucket at first — they have no user document, so `UserRepository.getById('apikey:<keyId>')` returned `null` and the derivation fell to `'skip'`, i.e. **a subscription created with an API key received nothing at all** while still reporting `201` / `status: active`. #2282 made them *evaluable* rather than failing open: the subscription stores the creator's principal kind (`createdByRole`, persisted for both `/subscriptions` and `/csourceSubscriptions`) and the derivation rebuilds the **same actor HTTP authentication builds** from the credential document — `apikey:<keyId>` / `apikey-<keyId>@internal` / `role: api_key` / the key's `tenantId`, or the OAuth client's `clientId` / `role: oauth_client`, with `policyId` read from the credential document so re-binding a policy takes effect on the next delivery instead of being frozen at subscription time. The kind is never inferred from the `apikey:` prefix on `createdBy` (a `user.id` colliding with that shape would otherwise be evaluated with a credential's policy — the "guessed principal kind" class), so subscriptions written before #2282 stay fail-closed. Revoked (`isActive: false`), deleted, and **cross-tenant** credentials also stay fail-closed, as does a stored kind that disagrees with the id shape. With `AUTH_ENABLED=false` the gate is inert, exactly as the HTTP read path is unrestricted there.
>
> The same gate carries the protocol isolation of #2253, and both delivery routes (Lambda `matcher` and the standalone in-process service) plus both event kinds (entity change and rule-triggered notification) run through **one** function — the first cut wired only the entity-change halves and left rule-triggered notifications unguarded, which is the #1376 "one cell left behind" class reproduced inside its own fix.
>
> The predicate is now derived by `deriveLinkedEntityReadFilter()` and composed into `getMany()`'s Mongo filter, at **every** recursion level of `joinLevel`. It is deliberately **not** the filter `requireListReadAuthz()` returned for the surrounding query: with a declared `?type=A` that derivation folds `entityType` to the literal `A` (often collapsing to `unrestricted`), which says nothing about a linked entity of type `B`. Like `deriveRemoteEntityReadFilter()` (#2092) it keeps `entityType` a free variable; unlike it, `entityId` is **not** folded either, because a join has many targets rather than one. `kind: 'none'` yields zero linked entities instead of failing the whole request — the linking entity was already authorized, and turning a `join` parameter into a `403` would be over-denial.

> **Context Source Registration-derived contributions to `/types` and `/attributes` needed a separate mechanism (#2079).** The row above covers reads of the `entities` collection, but `GET /ngsi-ld/v1/types(/{typeName})?` and `/ngsi-ld/v1/attributes(/{attrId})?` also merge type names and attribute names **declared by Context Source Registrations** into the response (ETSI GS CIM 009 - 5.9.3.3). A registration is not an `entities` row, so it never passes through `readableEntityFilter` / `entityReadFilterToMongo` at all — #1370's leak closure for entities-derived contributions left the registration-derived path open: a type-constrained subject could learn the existence (and attribute names) of any type declared by *any* registration, and `/types/{typeName}` returned `200` for a type the subject could not read a single entity of, purely because a registration declared it. `entityTypeMayBeReadable()` (`policy.filter.ts`) is a JS mirror of `entityReadFilterToMongo` restricted to the `entityType` dimension (the only dimension a registration has a concrete value for; `scope` / `entityOwner` are treated as "may match" since registrations carry neither) — used to drop registration-derived type/attribute names the subject cannot possibly read. `/types/{typeName}` and `/attributes/{attrId}` fold to `404` when the target type has no readable possibility at all, rather than leaking existence via the registration. Unconstrained subjects (`readableEntityFilter === undefined`) see no change.

> **The predicate compares stored strings, so the stored form has to agree (#2086).** `entityTypeMayBeReadable()` matches the registration's declared type name against the matcher value with exact string equality — the same footing as the Mongo-side `{entityType: <matcher>}` comparison for `entities` rows. That only holds if both sides went through the same normalization. NGSI-LD registrations do (`normalizeTypeName` at write time, #1700); **NGSIv2 registrations do not** — `POST`/`PATCH /v2/registrations` store the type verbatim because NGSIv2 has no active `@context`. As registrations are visible across protocols, a v2-registered `https://uri.etsi.org/ngsi-ld/default-context/Sensor` slipped past a `Deny entityType == Sensor` rule while the entities of that same type were correctly hidden. The discovery endpoints therefore canonicalize registration type selectors with the core vocabulary at the point of consumption (`listRegistrationsSafely` in both controllers), so the predicate, the `/types/{typeName}` lookup and the response type name are all evaluated on the same string. The stored form is deliberately left verbatim: NGSIv2 entities are also stored verbatim and `findMatchingRegistrations` matches them by exact string, so flipping the stored form would silently break NGSIv2 federation forwarding and change `GET /v2/registrations` irreversibly (#1890 took the same decision for attribute names).
>
> **Reading the Context Source Registration documents themselves passes through the predicate too (#2084).** #2079 narrowed registration-derived *contributions* to `/types` and `/attributes`, but the supply source — `GET /ngsi-ld/v1/csourceRegistrations(/{registrationId})?` and `GET /v2/registrations(/{registrationId})?` — still returned CSR documents whole: a CSR list request carries no concrete `entityType`, so a type Deny never fires at point authorization, and a subject whose policy permits CSR reads (the `user` role default GET Permit, or a permit-by-default custom policy with a type Deny) could read the existence, the declared type names and the provider `endpoint` URL of registrations for types it cannot read. The read paths now derive the same row-level predicate (`requireListReadAuthz`) and **redact**: unreadable concrete type selectors are dropped from `information[].entities[]`, an information entry declaring only unreadable types is dropped whole, and a document whose every entry is dropped is omitted from lists and returns `404` on by-id reads. The rule is the same function the discovery endpoints use (`redactInformationForRead` — calling the same function is what keeps discovery and CSR-read visibility from diverging), judged on canonicalized type values (#2086) while responses keep the stored form. List `count` and pagination are computed **after** redaction (a pre-redaction count would leak the existence of hidden registrations), and `?type=` / `?attrs=` are re-matched against the redacted documents (a document matched only via an unreadable selector, or only via an attribute of a dropped entry, must not appear at all — its appearance alone would leak what the redaction removed). The `?attrs=` re-match judges verbatim ∪ canonical names (expanding each entry's stored names with the registration's write-time `@context`, #2141) so its matching surface mirrors the Mongo union index (#1890) — without this a query matching only in canonical form (an FQN, or a synonym term from another `@context`) returned results for unrestricted subjects but `0` results for restricted ones. The redacted list also scans the collection page-by-page (bounded by an OOM safety cap with a warning on truncation) so `count` / `total` stay accurate past the first page (#2141). `GET /ngsi-ld/v1/csourceRegistrations` always defers the declared `?type=` to the row-level predicate instead of folding it into point authorization: a CSR matched by a readable type can still *contain* unreadable selectors, so folding would collapse the predicate to `unrestricted` and return the matched multi-type document unredacted (the #1653/#1656 declared-type ≠ actual-content class). Behavior change: subjects restricted to an entity-type allow-list (the #2079 policy shape) previously got `403` on CSR lists; they now get `200` with only the registrations declaring readable (or no) types — the same fail-closed→filtered transition #1370 made for entity lists. The csource-subscription notification channel is covered too (#2133, below).
>
> **CSR documents delivered by csource-subscription notifications are redacted by the subscription creator's predicate (#2133).** The notification channel (`csource-notification.service.ts` — CSR documents are POSTed whole to subscriber endpoints on registration create/update/delete) used to bypass the #2084 redaction entirely. Csource subscriptions now store their creator (`createdBy`, the same shape as entity subscriptions), and at delivery time the creator's **current** effective policy set is used to derive the same row-level predicate as an HTTP CSR read (`requireListReadAuthz` called through the synthetic-authz pattern, #1610) — the parity invariant is "what creator P sees on `GET /ngsi-ld/v1/csourceRegistrations` is what P's subscriptions are notified with". Matching is evaluated against the **redacted** view (a notification matched only via an unreadable type selector must not arrive at all — its arrival alone would leak that a CSR declaring that type exists), and a registration whose every entry is redacted is not delivered. **All of this applies only when authentication is enabled.** With `AUTH_ENABLED=false` there is no row-level predicate to speak of — `optionalAuth` synthesizes a `super_admin` for every request, so an HTTP CSR read returns every document unredacted. The notification path short-circuits on the same condition and delivers without redaction; suppressing notifications there (the stored creator is `anonymous`, which resolves to no user) would break the very parity invariant above in the availability direction. Everything below describes `AUTH_ENABLED=true` deployments.

The role used for the predicate is the creator's role **scoped to the notified tenant**, not the global `role` on the user document: `super_admin` passes through, otherwise the membership row for the notified tenant decides. The three cases are distinct and must not be conflated: a membership row that is **active** supplies its `role`; a membership row that exists but is **inactive** (revoked) fails closed; **no membership row at all** falls back to `user.role`, and only when the creator's `primaryTenantId` is the notified tenant (legacy users predating auto-membership, or a re-pointed `primaryTenantId` — the same principals for which the default login issues a `user.role` token). A missing row for a *different* tenant fails closed like the revoked case. This mirrors #1201 ("a non-`super_admin`'s effective role is always `membership.role`"), which matters because `PATCH /admin/users/{id}` updates the user document's role without touching memberships.

Fail-closed cells (**no notification** is sent, with a structured warning log): subscriptions with no stored `createdBy` (legacy documents created before this change — `CSOURCE_NOTIFICATION_RLS_SKIPPED_LEGACY`), **user** creators that cannot be resolved to an active user (deleted / deactivated users — `CSOURCE_NOTIFICATION_RLS_OWNER_UNRESOLVED`; since #2282 `api_key` / `oauth_client` creators are **not** in this cell — they are resolved from their credential document instead and fail closed only when it is missing, revoked, or from another tenant — `CSOURCE_NOTIFICATION_RLS_CREDENTIAL_UNRESOLVED`), **user** creators whose membership in the notified tenant exists but is revoked (`isActive: false`), and **user** creators with **no** membership row in a tenant that is not their `primaryTenantId` (membership is a user-only concept; credential creators are scoped by the `tenantId` on the credential document) (both — `CSOURCE_NOTIFICATION_RLS_MEMBERSHIP_MISSING`; `refreshToken` returns `403` for the same principals). Note this cell does **not** include the legacy no-row case described above: a creator with no membership row whose `primaryTenantId` is the notified tenant falls back to `user.role` and **is** notified. Also fail-closed: an unresolvable tenant (`CSOURCE_NOTIFICATION_RLS_TENANT_UNRESOLVED`), and creators whose predicate denies CSR reads outright. **Behavior change**: legacy csource subscriptions (created before `createdBy` existed) stop receiving notifications until re-created by an identifiable user; the warning log makes this operationally visible.
>
> **Reading subscription documents passes through the predicate too (#2140).** The same hole existed for `GET /ngsi-ld/v1/subscriptions(/{subscriptionId})`, `GET /v2/subscriptions(/{subscriptionId})` and `GET /ngsi-ld/v1/csourceSubscriptions(/{subscriptionId})`: a subscription list request carries no concrete `entityType`, so a type Deny never fires at point authorization, and a subject with a type Deny could read the existence, the declared type names and the **notification endpoint URL** of subscriptions watching types it cannot read. The read paths now derive the same row-level predicate and redact with the exact mirror of the CSR rule (`subscription-read-redaction.ts` — the type-agnostic judgement mirrors `informationEntryIsTypeAgnostic`): unreadable concrete type selectors are dropped from the selector list (`subject.entities` / `entities`), a subscription whose selectors declare only unreadable concrete types is omitted from lists and returns `404` on by-id reads, and type-agnostic subscriptions (no selectors, `type: "*"`, `id`/`idPattern`/`typePattern`-only selectors, `watchedAttributes`-only subscriptions) are unaffected. List `count` and pagination are computed after redaction, `?type=` is always deferred to the row predicate (these controllers do not use `?type=` for matching, so folding it would collapse the predicate to `unrestricted` — the #2084 finding-1 class), and the predicate is mixed into the `ETag` seed. Subscriptions are stored in one protocol-shared collection, so both the NGSI-LD and NGSIv2 entrances redact identically. Update/delete authorization is unchanged (`requireSubscriptionUpdateAuthz` / ownership checks evaluate the subscription's effective values and do not pass through this path).

Notes:

- **EntityMap creation keeps its path-level PEP** (it is a `POST` that creates a resource) and additionally derives the row predicate with the real request, so a subject with no readable rows gets `403` (fail-closed) and a declared `?type=` cannot bypass scope/owner restrictions.
- **Reading an existing EntityMap uses an owner guard, not a re-derived row predicate (#1963)**. `EntityMapDocument` gained a `createdBy` field; non-admin principals (anything other than `super_admin` / `tenant_admin`) can only read, update and delete EntityMaps **they created themselves**. Legacy rows with no `createdBy` are invisible to non-admins — **fail-closed**, following #1945 (snapshots). At the time this was a deliberate difference from `SubscriptionService.checkOwnership`, which let an unknown owner pass through; **#2161 closed that gap**, so subscriptions and registrations now fail closed on legacy documents too (see the ownership section below).

  Why an owner guard rather than intersecting the stored `entityIds` with the reader's readable set: creation already filters through **the reader's own** derived predicate (#1955), so the owner is by construction allowed to see every id in their own map — filtering again would be redundant, would cost an extra `entities` query per `GET`, and would change the meaning of `totalCount` (the total of the original query) per reader.

  **A non-owner gets `404`, not `403`** — a `403` would confirm that an EntityMap with that id exists, which is the same existence-leak class #1370 closed. The guard is applied **inside the Mongo query** (`{tenant, entityMapId, createdBy}`) rather than by fetching and then rejecting, so there is no code path where "exists but not yours" and "does not exist" can diverge.

  `PATCH` / `DELETE` are guarded identically: closing only the read path would leave a non-admin able to modify or delete another principal's EntityMap (CLAUDE.md Authorization Change Checklist 2 — wire every enforcement path).
- EntityMap authorization semantics are **not specified by ETSI GS CIM 009** (clause 5.2.32 / 6.3.16 define the resource but not its access control), so the two operations follow different spec-defined analogues:
  - **Creation** (`POST`) follows the sibling path `GET /entities`: exclude non-readable rows and return success (`403` only when *no* row is readable).
  - **Reading / updating / deleting an existing EntityMap** follows the snapshot owner guard (#1945) in shape — scoped by `createdBy`, legacy rows without `createdBy` hidden from non-admins — but returns `404` rather than snapshots' `403`, because #1963 folds the owner into the Mongo query (see below).
- The vector tile endpoints that #1955 originally also covered were **removed entirely** in #1961 (PR #1965); the repeated authorization / cache / normalization misses on that path were part of the rationale.

#### Catalog read credentials (#2465 / #2468 / #2472)

`/catalog/**` returns **row data**, not a metadata-only index: `sample` is full entity bodies, and dataset metadata exposes accurate `entityCount`, attribute schema, and spatial bbox. Row-level authorization therefore uses the **same predicate** as entity list reads (#1376 parity). Since #2465 / #2468, `CatalogService` derives that predicate via `requireListReadAuthz` on a synthetic event whose path is `GET /v2/entities` (handlers extract `/catalog/**` as `apiType: 'ngsiv2'` — see #2471).

**Fail-closed by design.** A credential whose custom policy Permits only `/catalog/**` (and not the entities list path) still passes path-level `requireAuthz` on catalog routes, but the synthetic derivation yields `kind:'none'` and `requireListReadAuthz` throws **403**. Dual-path derivation that treated `/catalog/**` Permit as sufficient would re-open the #2465 hole (entityType / servicePath Deny written against `/v2/**` would silently miss on catalog).

**Open-data portal recipe** (no code change — express with existing XACML):

Grant the same principal (`api_key` / `oauth_client` / `anonymous`) both:

1. `Permit` — `path: /catalog/**`, `method: GET` (path-level reachability)
2. `Permit` — `path: /v2/entities`, `method: GET` (row-filter derivation source)

To publish only selected types, add an `entityType` condition on (2). The same condition becomes the catalog row filter, so catalog and `GET /v2/entities` see the **same rows**. That also permits direct `GET /v2/entities` for those types — catalog already distributes equivalent data, so this is not additional exposure.

Bound-policy example (`/me/policies` then `policyId` on the API key / OAuth client; when bound, the policy `target` is bypassed and only `rules` run):

```json
{
  "policyId": "portal-catalog-publictype",
  "target": {
    "resources": [
      { "attributeId": "path", "matchValue": "/catalog/**", "matchFunction": "glob" },
      { "attributeId": "path", "matchValue": "/v2/entities", "matchFunction": "string-equal" }
    ]
  },
  "ruleCombiningAlgorithm": "first-applicable",
  "rules": [
    {
      "ruleId": "permit-catalog",
      "effect": "Permit",
      "target": {
        "resources": [{ "attributeId": "path", "matchValue": "/catalog/**", "matchFunction": "glob" }],
        "actions": [{ "attributeId": "method", "matchValue": "GET" }]
      }
    },
    {
      "ruleId": "permit-v2-entities-public",
      "effect": "Permit",
      "target": {
        "resources": [
          { "attributeId": "path", "matchValue": "/v2/entities", "matchFunction": "string-equal" },
          { "attributeId": "entityType", "matchValue": "PublicType", "matchFunction": "string-equal" }
        ],
        "actions": [{ "attributeId": "method", "matchValue": "GET" }]
      }
    },
    { "ruleId": "deny-others", "effect": "Deny" }
  ]
}
```

Anonymous portals use the same shape with `role=anonymous` (and `anonymousAccessEnabled` as required). Do **not** Permit `/catalog/**` alone and expect catalog to return 200.

> **Out of scope.** A metadata-only catalog that omits `sample` / `entityCount` (so catalog ≠ entity read) would be a separate product design; there is no current demand (#2472).

### MCP / A2A tool authorization (#1610 / #1651 / #1672)

The MCP server (`POST /mcp`) and the A2A JSON-RPC endpoint (`POST /a2a`) expose entity / batch / temporal data tools that bypass the HTTP controllers. They do **not** have a separate authorization implementation: each tool call builds a minimal synthetic `APIGatewayProxyEvent` and invokes the **same shared enforcement functions** as the HTTP layer — `checkEntityOwnership` (entity-level, by-id), `requireListReadAuthz` (list-level row filtering), and `requireAuthz` (point checks) — via `@api/shared/authz/synthetic-authz` (`src/api/mcp/tools/authz.ts` for MCP). So `entityType` / `entityOwner` / `scope` constraints in custom policies are enforced identically across HTTP, MCP (#1610), and A2A (#1651), and Deny / NotApplicable results are fail-closed.

- **By-id tool operations authorize with the actual `entityType` stored in the DB** — the client-supplied `type` argument is never used as an authorization attribute (it remains a lookup filter for the subsequent data access only), the same rule as HTTP by-id routes ([#1324](#entity-level-authorization-for-by-id-routes-1324-1336)). This closes the type-spoof bypass where a forged `type` made the entity lookup miss and the request slide into an `entityType: ""` evaluation under permit-by-default policies (A2A: #1651, MCP: #1672).
- **Reachability is a separate, path-level concern**: `/mcp` and `/a2a` are permitted by the `tenant_admin` default policy and included in the tenant-policy path allowlist (`TENANT_POLICY_ALLOWED_PATH_PREFIXES`, `src/core/auth/policy/policy.defaults.ts`), so a tenant admin can grant them to `user` / `api_key` / `oauth_client` principals with a custom Permit policy. A path-level Permit on `/mcp` / `/a2a` only makes the endpoint reachable — the per-tool entity-level / list-level checks above still apply to every data operation.
- **Admin tools require the `tenant_admin` role**: the admin/config management tools (users / policies / rules) are role-gated on both MCP and A2A, so a principal granted `/mcp` / `/a2a` for data tools cannot enumerate users or read policies / rules.

- **The role gate is not a substitute for policy evaluation (#2223).** The MCP `config` tool's `custom_data_models` resource used to stop at `requireAdminRole` + tenant resolution and **never evaluate custom XACML policies**: `/mcp` is authorized path-level as `resource.path = "/mcp"`, so a `Deny` written against `/custom-data-models` never applied, and a `tenant_admin` restricted from data models over HTTP could still create / update / delete them through MCP. It now builds a synthetic event for the corresponding HTTP route (`GET|POST /custom-data-models`, `GET|PATCH|DELETE /custom-data-models/{type}`) and calls the same `requireAuthz` the HTTP handler calls, so the same policy decides both entry points. As on the HTTP route (#2215), `resource.tenantService` is resolved from the **actor**, never from a caller-declared value — on MCP the tenant comes from the `tenant` argument, which `resolveToolTenant` has already verified to be the actor's own tenant. `resource.servicePath` is folded to `/` for the same reason the HTTP route folds it (#2221): the value `resolveToolTenant` returns comes from the caller's `servicePath` argument, so leaving it in would let a `servicePath`-conditioned Deny be dodged by varying that argument — the `tenantService` hole, one dimension over.

  - **One attribute is still unavailable on this path: `environment.sourceIp`.** Synthetic events carry no source IP by design (#1610 — MCP / A2A call contexts do not propagate one, and fabricating a value would be worse), and an `ip-range` condition evaluates to `false` without it. So an `ip-range`-conditioned **Deny** written against `/custom-data-models/**` does not fire on the MCP path, while the same policy does fire over HTTP. This is a property of every synthetic-event check (it predates this change and applies equally to the entity / batch / temporal tools), but it becomes newly reachable here now that `/custom-data-models` policies are evaluated from MCP at all. Path-level authorization of `POST /mcp` itself still sees the real client IP, so IP restriction on the **endpoint** is unaffected — express IP restrictions there rather than on the tool's target resource.

- **The same wiring covers `rules` and `jsonld_contexts` on both entry points (#2244).** #2223 only wired the `custom_data_models` branch; the sibling branches of the same tool were left as they were — `handleRuleAction` stopped at `requireAdminRole`, and `handleJsonLdContextsAction` had no role gate at all, so a principal holding only a path-level `Permit` for `/mcp` reached JSON-LD context create / delete. The A2A `config` skill had the same gap on its read-only `rules` / `jsonld_contexts` handlers. All four now build a synthetic event through one shared mapping (`@api/shared/authz/config-authz-target`) so MCP and A2A cannot drift apart:

  | action | rules | jsonld_contexts |
  |---|---|---|
  | `list` | `GET /rules` | `GET /ngsi-ld/v1/jsonldContexts` |
  | `get` | `GET /rules/{ruleId}` | `GET /ngsi-ld/v1/jsonldContexts/{contextId}` |
  | `create` | `POST /rules` | `POST /ngsi-ld/v1/jsonldContexts` |
  | `update` | `PATCH /rules/{ruleId}` | — |
  | `delete` | `DELETE /rules/{ruleId}` | `DELETE /ngsi-ld/v1/jsonldContexts/{contextId}` |
  | `activate` / `deactivate` | `POST /rules/{ruleId}/activate`\|`/deactivate` | — |

  - **`servicePath` is handled differently per resource, matching HTTP.** ReactiveCore Rules keep `servicePath` as a first-class field and the HTTP route passes the `Fiware-ServicePath`-derived value straight to `requireAuthz`, so the MCP / A2A paths pass the caller's `servicePath` through unchanged — folding it to `/` here (as `custom_data_models` does, #2221) would make a `servicePath`-conditioned Deny that works over HTTP silently miss on the tool path. JSON-LD contexts need no folding at all: `buildAuthzRequest` already normalizes `resource.servicePath` to `/` for every NGSI-LD path (#1323 / #1862).

  - **No role gate was added to `jsonld_contexts`.** The HTTP route has none either — who may do what is decided by policy alone (the default `__default_user` policy `Permit`s all methods on `/ngsi-ld/**`, so an unrestricted `user` can create contexts over HTTP too). Gating the tool on `tenant_admin` would make an operation that succeeds over HTTP fail over MCP, which is the parity invariant in reverse.

  - The `environment.sourceIp` caveat above applies to these resources as well.

See [AI_INTEGRATION.md](../ai-integration/overview.md) for the tool inventories and A2A specifics.

### Template Variables (GeonicDB Extension)

`matchValue` supports `${subject.<attributeId>}` template variables that are resolved to the request subject's attribute values at evaluation time. This enables dynamic policies like "owner-only" access without hardcoding user IDs.

| Template | Resolves to |
|----------|-------------|
| `${subject.userId}` | Requesting user's ID |
| `${subject.email}` | Requesting user's email |
| `${subject.role}` | Requesting user's role |
| `${subject.tenantId}` | Requesting user's tenant ID (`''` for global principals) |

**These four are the only resolvable attributes** (`SUBJECT_ATTRIBUTE_IDS` in `src/core/auth/policy/policy.pdp.ts`). Any other name — a typo such as `${subject.userID}`, or `${subject.id}` / `${subject.name}` — is **rejected at write time with `400`** on every policy write path (create / update / policy set / XACML import) ([#1939](#unresolved-subject-templates-1939)).

#### Unresolved `${subject.*}` Templates (#1939)

Before #1939 an unresolvable template caused its `matchValue` to be **skipped**, which made the enclosing group `NoMatch` and the rule `NotApplicable`. For a `Permit` rule that removes privilege (safe); for a **`Deny` rule the denial silently stopped applying** (fail-open) — and the write API returned `201`, so the policy author had no signal.

Two layers now close this, mirroring the `string-regexp` treatment above:

1. **Write time** — an unknown subject attribute in any `matchValue` (regardless of `matchFunction`) is a `400`.
2. **Evaluation time** — an unresolved template is an unprocessable `AttributeDesignator` and evaluates to **`Indeterminate`** per XACML 3.0 §7.6, which resolves fail-closed to `Deny` (and to "no readable rows" / `403` in the list-query row filter). This layer covers policies stored before the write-time validation existed, and documents restored by paths that bypass the service layer (e.g. `scripts/backup-import.ts`).

> This is **not** the XACML `MustBePresent=false` case (empty bag → No match). All four resolvable attributes are non-optional on `AuthzRequest`, so a template can only fail to resolve when the attribute ID itself does not exist — an authoring error, not an absent value.

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

> **NGSIv2 only (#1323)**: this pattern works because NGSIv2 stores and filters entities by `Fiware-ServicePath`. On NGSI-LD requests the `servicePath` attribute is always `/` (the header is spec-less and ignored by the data layer), so a policy like the above never matches NGSI-LD requests — by design. Use `scope` / `entityType` constraints for NGSI-LD instead.

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

#### NGSI-LD Scope Authorization: 3 Practical Patterns (#1659)

For NGSI-LD write operations, `scope` can be absent (`missing` / `null` / `[]`). In that case, authorization evaluates the scope attribute as `''` (empty string). You can intentionally choose one of these policy styles:

1. **Allowlist (strict)**: Permit only specific scopes (for example `/Public`) and rely on fail-closed behavior for anything else.  
   Result: scope-unset writes are denied (`403`).
2. **Denylist + fallback Permit**: Deny specific forbidden scopes (for example `/Secret`) and permit other writes.  
   Result: scope-unset writes are allowed (`201`).
3. **Explicit unset control**: Add an explicit rule for `matchValue: ''` to allow or deny unscoped entities intentionally.

#### Read=OR / Write=AND Scope Semantics (#1659)

- **Read paths (existing behavior)**: scope matching uses the stored comma-joined scope string (OR semantics).  
  Example: `["/Public", "/Secret"]` is readable for a `/Public` reader.
- **Write destinations (create/move)**: each scope element is evaluated as an independent AuthzRequest and all of them must be `Permit` (`evaluateAllPermit`, AND semantics).  
  Example: with `Permit(POST, scope~/Public)` only, writing `["/Public", "/Secret"]` is denied (`403`).

This asymmetry is intentional: read visibility can be partial (OR), but writes must be authorized for every destination scope (AND). Never collapse multiple write scopes into one comma-joined authorization request.

#### Batch Writes Evaluate the Existing Entity, Not Just the Body (#1678)

Batch write operations (`POST /ngsi-ld/v1/entityOperations/{upsert,update,merge,delete}`) modify entities that already exist, so the request body alone is not a sufficient authorization input. In addition to the body-declared targets (`entityType` per #1325, destination `scope` per #1659), GeonicDB resolves every `id` in the body with a single projection query and evaluates **the stored entity's actual `entityType`, `entityOwner` (`createdBy`) and `scope`** — the same attributes the by-id path (`checkEntityOwnership`) uses.

- **All-Permit**: if any element is not `Permit`, the whole request is rejected with `403` before any write happens (no partial application). This matches `/v2/op/update` batch semantics (#1325) and NGSI-LD subscription creation (#1104).
- **Move semantics**: the *source* scope (stored) and every *destination* scope element (body, per-element AND) must all be permitted.
- **Creates are exempt**: ids that do not exist yet are treated as creations and only the body-declared attributes apply.
- **Ambiguous ids** (multiple documents for one id, possible only when the unique index is missing) require `Permit` for **every** matching document (fail-closed).
- **Non-HTTP callers**: MCP tools and A2A skills bypass the HTTP controllers, so they call the same enforcement helper (`syntheticCheckBatchEntityAuthz`). A restriction expressed as a policy therefore holds identically over HTTP, MCP and A2A.

Practical consequence: a policy such as `Deny when scope ~ /Secret` now blocks `entityOperations/update` on an entity stored under `/Secret` exactly as it blocks `PATCH /entities/{id}`. Before #1678 the batch shape silently bypassed it.

> **Status code note**: NGSI-LD (ETSI GS CIM 009) does not define authorization failures — `207 Multi-Status` is for per-entity *operation* errors (NotFound / BadRequestData), and Table 6.3.2-1 has no AccessDenied error type. GeonicDB therefore returns a request-level `403`. Returning `207` with partial application would make the same restriction weaker in the batch shape than in the by-id shape, breaking the authorization parity invariant (#1376).

#### The Authorization Decision Is Pinned to the Document It Was Made About (#1943)

Evaluating the stored entity (#1678) is only half the guarantee. The authorization query and the write are two separate round trips, so between them a third party can **hard-delete the entity and a different principal can recreate it under the same id**. Without a link between the two steps, the write lands on a document whose `entityOwner` / `scope` the PDP never saw — an authorization bypass, even though every individual step behaved correctly.

GeonicDB closes this by carrying the identity of the evaluated document into the write:

- `getEntityAuthzContexts()` returns each matching document's **`_id`** alongside `entityOwner` / `scope` / `entityType`.
- `checkBatchEntityAuthz()` returns those `_id`s as **authorization pins** (`EntityAuthzPins`), keyed by entity id.
- Every write derived from that decision adds the pin to its MongoDB filter: `_id ∈ {evaluated ids}`. Ids the authorization step saw as **non-existent** (treated as creations) get a predicate that can never match an existing document, making the write **insert-only** — so a document created inside the race window is not silently updated either.

**Why `_id` and not `createdBy` or a version counter.** `createdBy` is written only on insert (`EntityRepository.create`) and is never updated, so a document's owner is immutable; the only way the owner can change is delete + recreate, which always produces a new `_id`. Pinning `_id` therefore closes the owner dimension exactly. Pinning `createdBy` would not: `batchCreate` does not set `createdBy` at all, so an ownerless document replaced by another ownerless document would compare equal. A version counter (`EntityDocument.version`, which already exists and is maintained on every write path) is **deliberately not used**: an *in-place* change racing the write — including a `scope` move — is equivalent to a serial order in which the write happened first, so it is not an authorization violation. Version pinning would only convert benign concurrent updates into conflicts, regressing the documented last-write-wins behaviour of the bulk path.

**Relationship to the "no partial application on Deny" contract.** That contract (#1325 / #1678 / #1928 / #1932) is about the *authorization decision*, which is still evaluated up front and still yields a request-level `403` before any write. A pin mismatch is not a Deny — it is a concurrency conflict detected at write time, which is exactly what ETSI GS CIM 009 models with `207 Multi-Status` + `BatchOperationResult` per-entity errors. The security-relevant guarantee is unconditional and holds in both shapes: **a write never lands on a document the PDP did not evaluate.** In the bulk paths the mismatching element fails on the entity unique index (`idx_entity_unique_v3`) and is reported as a per-entity error; in the per-entity loop paths (`entityOperations/{update,merge,delete}`, `/v2/op/update` with `actionType=replace|delete`) it matches nothing and surfaces as the existing `ResourceNotFound` per-entity error. Either way that element persists nothing.

**The per-entity `detail` only names a cause when the cause is unambiguous.** A duplicate-key failure on a pinned bulk operation has at least three causes: the TOCTOU swap above; a document that became soft-deleted or expired (the bulk *replace* filter carries the live predicates while the authorization query deliberately does not, per #1678 — this needs no race at all); and the same entity id appearing twice in one payload when authorization saw it as non-existent. The write error cannot tell them apart in general, so the conflict wording — and the suggestion to retry — is added only where the cause is certain: when the pin set is empty (authorization saw no document, so something must have claimed the id afterwards), or when the write filter carries no live predicates (`batchUpsert`), where a duplicate key can only mean the pinned document is gone. On `batchReplace` with a non-empty pin the message stays the plain "entity already exists" text, because telling a caller to retry a write that is failing on a soft-deleted or expired document would loop forever. The raw MongoDB message is never returned in any case, since index names and key values disclose the existence of documents in another tenant's or owner's slot.

**The bulk-path outcome depends on `idx_entity_unique_v3`.** "Persists nothing" holds because the pinned upsert's insert attempt collides with the entity unique index. Where that index is absent — the same degraded condition that produces the ambiguous ids described above — the insert succeeds and adds a *second* document for the same `entityId` instead of failing. The security invariant still holds (the write did not land on the document the PDP had not evaluated), but the element is no longer a no-op. The per-entity loop paths do not depend on the index: they match nothing and return `ResourceNotFound` either way. For the same reason the bulk pre-fetch that feeds merge semantics and the encryption envelope is filtered by the same pins as the write — otherwise, in that degraded mode, attributes read from a swapped document could be written into the surviving one.

Not yet covered (tracked separately): temporal batch writes (the authorization attributes live in the `entities` collection while the write targets the `temporal` collection, so an `_id` pin does not apply), `purgeEntities` (predicate-selected ids are handed to an unpinned `deleteMany`), and the single-entity by-id paths, which have the same read-then-write structure.

#### The Same Rule Applies to NGSIv2 Batch and Temporal Batch (#1928)

The contract above is not NGSI-LD specific. Two further batch shapes evaluate the stored entity the same way:

- **`POST /v2/op/update`** (all `actionType` values: `append` / `appendStrict` / `update` / `replace` / `delete`). NGSIv2 has no `scope` concept, so only the `entityOwner` / `entityType` dimensions apply — there is no destination-scope AND evaluation.
- **`POST /ngsi-ld/v1/temporal/entityOperations/{upsert,delete}`**. The temporal collection stores no `owner` / `scope`, so — exactly as the temporal by-id routes do (#1336) — the authorization attributes are read from the **entities** collection (`createdBy` / `scope` / `entityType`).

Both are evaluated before the first write, so a `Deny` on any element rejects the whole request with `403` and persists nothing. The MCP temporal batch tools bypass the HTTP controller and therefore call the same helper (`syntheticCheckBatchEntityAuthz`).

Before #1928 both shapes discarded the authenticated actor entirely: a policy that blocked `PATCH /v2/entities/{id}/attrs` or `PATCH /ngsi-ld/v1/temporal/entities/{id}` with `403` was bypassed by sending the identical write through the batch endpoint, which returned `204`.

> **Known limitation (unchanged by #1928 / #1941 / #2434)**: an entity created through the temporal API *without* a `scope` member has no document in the entities collection, hence no recorded owner. Such entities carry no owner-based restriction — in the batch shape *and* in the by-id shape alike, so authorization parity holds. Attaching ownership to temporal-only entities is tracked separately. A temporal create that *does* carry `scope` materializes a current entity (#2434 A'-1), so a scope-carrying temporal-only create is **not** owner-less — the materialized document records the creating principal as `createdBy`.

#### Creating Temporal History Is a Write to an Existing Entity (#1941)

`POST /ngsi-ld/v1/temporal/entities` and `POST /ngsi-ld/v1/temporal/entityOperations/create` look like creations,
but when the target id already has a document in the **entities** collection they write history onto *someone
else's* entity. Since #1941 both evaluate the stored `entityOwner` / `scope` / `entityType` — read from the
entities collection, as every temporal route does (#1336) — before the first write.

The gap was easy to miss because the only pre-existing guard, `temporalEntityExists`, inspects the **temporal**
collection alone. So the bypass window was exactly "entities has a foreign-owned document **and** no temporal
document yet": no `AlreadyExists`, no ownership check, `201`. A principal that received `403` from
`PATCH /ngsi-ld/v1/temporal/entities/{id}` could fabricate the same entity's history through `create` — a
request-shape parity break of the #1363 / #1325 / #1678 / #1928 / #1932 family.

Batch create returns `207 Multi-Status` for per-entity *operation* errors, but authorization is evaluated for the
whole request **before** the loop: a `Deny` on any element rejects everything with `403` and persists nothing.
Scoring it per element would leave the batch shape weaker than the by-id shape, which is the defect being fixed.

Ids with no entities-collection document are still skipped, so genuinely temporal-only entities (those without a
`scope` member) are created exactly as before. A scope-carrying body is the one exception (#2434 / #2758 / #2796 / #2814 A'-1):
HTTP by-id `POST /temporal/entities`, HTTP `entityOperations/create` / `upsert`, and MCP `create` /
`batch_create` / `batch_upsert` all materialize a current entity so `GET /entities/{id}` and
`DELETE /entities/{id}/attrs/scope` work right after.
MCP / A2A path-level authz must pass the same destination `scope` (via `buildTemporalCreatePathAuthzBody`) that
HTTP `targetsFromEntityArray` / `extractScopeFieldFromBody` evaluate — otherwise A'-1 would persist a Deny scope
that HTTP rejects (#2796 / #2814). On batch paths, materialization failure for one entity maps to that entity's `207`
`errors[]` entry and skips its temporal write (other entities continue). The A2A `temporal` skill (`create`) also
calls the same helpers.

#### Notification Intake Is a Write, Not an Exemption (`POST /v2/op/notify`

, #1932)

`POST /v2/op/notify` is the notification intake endpoint: an upstream broker or context provider posts a
`{ subscriptionId, data: [...] }` payload and GeonicDB appends `data[]` to the local entities. Since #1932 it
evaluates the **stored** `entityOwner` / `entityType` of every element in `data[]` before the first write, exactly
like `POST /v2/op/update` with `actionType: append`. Neither the NGSIv2 specification nor the Orion API defines
authorization for this endpoint, so the choice is GeonicDB's; the deciding rule is the parity invariant (#1376):

- **The caller is a principal evaluated by policy, not an anonymous wire.** `/v2/op/notify` carries no special
  authentication contract — it goes through `optionalAuth` like every other data route, which means: with
  `AUTH_ENABLED=false` every request is treated as `super_admin`; with `AUTH_ENABLED=true` a credentialled request
  becomes its own principal and an uncredentialled one becomes `role=anonymous`, which the default policies Deny at
  the path stage but a custom `Permit` can allow. Whatever principal results, it is the same principal the by-id
  routes would see. If a tenant policy denies it writes to entities owned by someone else, the denial is
  intentional and must hold in every request shape — including this one.
- **Notification is a request *shape*, not a permission level.** Exempting it would make the same policy weaker for
  `/v2/op/notify` than for `PATCH /v2/entities/{id}/attrs` — the exact defect class of #1363 / #1325 / #1678 / #1928.
  Left unenforced, any principal that can reach the endpoint holds a universal write primitive over the tenant.
- **`subscriptionId` is never an authorization input.** It is a caller-supplied free-form string
  (`Ngsiv2NotifySchema`), so deriving permissions from it — e.g. "trust whoever names a registered subscription" —
  would be a fail-open by construction. Only the authenticated actor and the stored entity attributes are used.
  Note also that there is nothing to match it against: the id identifies a subscription **on the broker that sent
  the notification**, and the receiving broker holds no record of it. Subscription-derived authorization is not
  merely unsafe here, it has no data to operate on.

Creation is unaffected: ids with no stored document are skipped as creations, so a notification that introduces new
entities behaves exactly as before. What is blocked is overwriting an **existing** entity the policy protects. A
deployment that wants an upstream broker to be able to overwrite entities it does not own must say so in policy
(e.g. a `Permit` rule for that `userId` on `/v2/op/notify`), rather than relying on a missing check.

**Authorization lookup must be a superset of what the write touches.** The projection query that resolves authorization attributes deliberately omits the "live" predicates (`deletedAt` / `expiresAt`) that read paths apply, because the batch write filters do not apply them either. If the authorization lookup were narrower than the write in any predicate (tenant / servicePath / protocol / soft-delete / expiry / type), the affected documents would look *absent* to authorization, be treated as creations, and skip the check entirely — a silent fail-open. Over-inclusion is harmless: a document that authorization can see but reads cannot is still returned as `404` afterwards.

### Default Policies

GeonicDB configures the following role-default policies (source of truth: `src/core/auth/policy/policy.defaults.ts`):

- **`super_admin`**: Permit on admin APIs (`/admin/**`), read-only statistics/metrics, and `/me/**`. A deny-fence (priority `-1`, not overridable) blocks the data APIs (`/v2/**`, `/ngsi-ld/**`, `/catalog/**`, `/rules/**`, `/custom-data-models/**`, `/mcp`) — platform administrators cannot touch tenant data. `/a2a` is not listed in the fence but has no default Permit either, so it is rejected by the fail-closed path stage all the same.
- **`tenant_admin`**: Permit (all methods) on all data APIs, on the AI tool endpoints `/mcp` and `/a2a` (#1651), and on the tenant-scoped admin APIs.
- **`user`**: Permit (CRUD) on the NGSI APIs (`/v2/**`, `/ngsi-ld/**`); `GET`-only on `/catalog/**`, `/rules/**`, `/custom-data-models/**`, and `/mcp`; plus `/me/**` and read-only statistics/metrics endpoints. Note that the MCP tool-call transport is `POST /mcp` and A2A is `POST /a2a` — **neither is covered by the `user` default** (`GET /mcp` only; `/a2a` not at all), so a `user` needs a custom Permit policy to call MCP / A2A tools, same as `api_key` / `oauth_client`.
- **`api_key` / `anonymous` / `oauth_client`**: empty-rule defaults (`rules: []`) — no default `Permit`, so every request evaluates to `NotApplicable` and is rejected with `403` by the fail-closed PEP (not an explicit XACML `Deny`; see [Path-Level vs Entity-Level Authorization](#path-level-vs-entity-level-authorization)). Effectively no access until an explicit Permit policy is bound.

Custom tenant policies authored by `tenant_admin` may only target paths in the allowlist `TENANT_POLICY_ALLOWED_PATH_PREFIXES` (`/v2/`, `/ngsi-ld/`, `/catalog`, `/rules`, `/custom-data-models`, `/mcp`, `/a2a`) — this is also how MCP / A2A tool access (`POST /mcp` / `POST /a2a`) is granted to `user` / `api_key` / `oauth_client` principals (see [MCP / A2A tool authorization](#mcp--a2a-tool-authorization-1610--1651--1672)).

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
- **Credentials presented but invalid → 401, not anonymous (#2794)**: `optionalAuth` (data API / `/custom-data-models` / MCP / A2A) treats a missing credential as `role=anonymous`, but any **presented** `Authorization` or `X-Api-Key` header (including empty Bearer / malformed scheme) that fails verification returns `401 Authentication required`. Downgrading failed credentials to anonymous used to surface as `403 Access denied: no applicable policy`, which blocked client refresh logic that keys off 401 and could silently grant anonymous Permit policies.

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

The handler evaluates middleware in this fixed order, locked in by the unit test in `tests/unit/handlers/api/index.test.ts` under `#1050` regression tests:

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

## Resource Scopes

> **#748 で削除済み**（JWT 埋め込みの `resourceScopes` と評価 middleware）。細粒度制御は XACML ポリシーを使う。残骸クリーンアップは #2263。

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
>
> **Catalog credentials (#2472).** Path-level `Permit` on `/catalog/**` alone is not enough for `api_key` / `oauth_client` / `anonymous`. Catalog derives its row filter from a synthetic `GET /v2/entities` evaluation (#2465 / #2471); without a matching entities Permit the derivation is `kind:'none'` and catalog returns **403**. See [Catalog read credentials](#catalog-read-credentials-2465--2468--2472).

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
- Re-login immediately after logout (within the same second) is safe: JWT `iat` has one-second precision, so newly issued tokens advance their `iat` past the invalidation threshold (`iat = max(now, invalidatedBefore)`, at most 1 second in the future) and are not caught by the invalidation window. Conversely, each invalidation write escalates the threshold (`max(now + 1, current + 1)`) so that an advanced token is still reliably killed by a subsequent logout (#1351)

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
| Context source subscription (`/ngsi-ld/v1/csourceSubscriptions`) | UPDATE, DELETE (#2188) |
| Custom data model (`/custom-data-models`) | UPDATE, DELETE (#2198) |

> **Custom data models were added in #2198.** They stored a `createdBy` at creation time but
> `CustomDataModelService.updateDataModel` / `deleteDataModel` only checked existence via
> `repository.get`, so any principal permitted to write in the tenant could update or delete another
> user's model — and deletion also removes the auto-generated JSON-LD context and the unique-constraint
> indexes. The route guards (`requireAuth + checkTenantAccess + requireAuthz`) enforce the tenant
> boundary and path/method authorization, **not per-resource ownership**. They now follow exactly the
> same contract as the other three resources. **One divergence (#2189): for subscriptions, registrations
> and csource-subscriptions an owner mismatch returns `404` (same as a missing `createdBy`), while
> custom data models keep `403`** — custom data models are not subject to the row-level read predicate, so
> their existence is not hidden from a restricted caller and there is no existence oracle to close. For
> the other three, `404` and `403` would differ (a `403` reveals the document exists), so they are unified
> on `404`. Tenant-wide shared schemas remain possible by editing them as a `tenant_admin`. The guard
> also covers the MCP entry point (`src/api/mcp/tools/config.tools.ts`), which calls the same
> service methods.
>
> **Context source subscriptions were added in #2188.** They stored a `createdBy` (#2133) but
> `CSourceSubscriptionService.updateSubscription` / `deleteSubscription` performed no ownership check at
> all and were not even passed an `actor`, so any authenticated principal in the tenant could update or
> delete another user's CSR subscription. They now follow the same contract as the other two resources
> (admin bypass / missing `createdBy` → `404` / owner mismatch → `404` since #2189). `requireSubscriptionUpdateAuthz`
> (#2005) does **not** cover this: it evaluates whether the *post-update effective value* may be subscribed
> to, not whether the caller may modify someone else's subscription.
>
> **Note**: Read operations (GET/LIST) are not restricted by the ownership check itself. Tenant isolation
> conforming to the NGSI specification applies, and — since #2140 (subscriptions) / #2084 (registrations) —
> reads additionally pass through the row-level read predicate, which redacts or hides documents declaring
> entity types the principal cannot read.

### Behavior by Role

| Role | Own resource | Other's resource | createdBy not set (legacy) |
|--------|--------------|--------------|----------------|
| `super_admin` | ✅ Operable | ✅ Operable (bypass) | ✅ Operable |
| `tenant_admin` | ✅ Operable | ✅ Operable (bypass) | ✅ Operable |
| `user` | ✅ Operable | ❌ 404 Not Found (#2189) | ❌ 404 Not Found (**fail-closed**, #2161) |

> For custom data models, the "Other's resource" cell matching `user` returns `403 Forbidden` (not `404`);
> see the divergence note under #2198 above.

### Behavior Specification

1. **On creation**: The authenticated user's ID is automatically recorded in the `createdBy` field when a resource is created
2. **On update/delete**: The requesting user's ID is matched against `createdBy`
   - Match: Operation permitted
   - Mismatch: Returns `404 Not Found` (**indistinguishable from "no such document"**, #2189)
   - `createdBy` not set (legacy data created before this field existed): Returns `404 Not Found` for
     non-admins (#2161)
3. **Admin bypass**: `super_admin`/`tenant_admin` skip the ownership check — but see the fence note below:
   with authentication enabled, `super_admin` never reaches these endpoints at all, so the only
   administrator that can actually manage these resources is `tenant_admin`
4. **When authentication is disabled**: Ownership check is skipped when `AUTH_ENABLED=false`

> **The `super_admin` bypass is unreachable on data APIs (with auth enabled).**
> `SUPER_ADMIN_DATA_API_DENY_FENCE` (`policy.defaults.ts`) hard-denies `/v2/**`, `/ngsi-ld/**`,
> `/catalog/**` and `/rules/**` for `super_admin`, as a deny-overrides fence that custom policies cannot
> lift — platform administrators must not be able to touch tenant data. The ownership check's
> `actor.role === 'super_admin'` early return is therefore only exercised when `AUTH_ENABLED=false`
> (every request is then a synthetic `super_admin`) or from internal callers. Read the rows below as
> "what the ownership check itself would do", not as end-to-end reachability.
>
> **Legacy documents are fail-closed, and the status code is `404`, not `403` (#2161).** Before #2161 the
> guard read `doc.createdBy && doc.createdBy !== actor.id`, so a document with **no** `createdBy` made the
> whole condition false and *any* authenticated principal in the tenant could update or delete it
> ("unknown owner passes through"). Two things were wrong with that. First, it is a Broken Object Level
> Authorization hole in its own right. Second, once #2140 / #2084 made reads pass through the row-level
> predicate, a principal denied a type would get `404` on `GET` but `204` on `DELETE` for the very same
> document — the difference itself revealed that the document exists (an **existence oracle**), on top of
> letting the caller destroy it. Returning `404` for legacy documents makes the ownership check itself
> indistinguishable from "no such document", closing both. `403` would not: it confirms existence, the same
> leak class #1370 closed and the same reason #1963 (entityMaps) chose `404`. (#1945 (snapshots) made the
> same **fail-closed** call for legacy rows but kept `403` — `SnapshotService.checkSnapshotOwnership`
> returns `ForbiddenError`; only #1963 folds the owner into the Mongo query so that "exists but not yours"
> and "does not exist" cannot diverge.)
>
> **What #2189 closed.** The `404` above initially applied to the legacy (`createdBy` absent) cell only.
> Two neighbouring paths still returned `403` for a document the caller may not be able to read, and
> therefore still revealed its existence. Both are now closed by #2189:
>
> - **Owner mismatch.** A document created by another user returned `403`, while a nonexistent id returns
>   `404` — the `403` itself confirmed the document exists. Owner mismatch now returns `404`, matching a
>   nonexistent id, so a non-owner cannot tell the two apart. (`#2005` update authorization is also
>   evaluated against the existing document, so a policy-denied subscriber also observes `404`.)
> - **The NGSI-LD `PATCH` route.** The subscription-update authorization (`requireSubscriptionUpdateAuthz`,
>   #2005) used to be evaluated on the existing document *before* the ownership check, so a principal denied
>   by that policy would get `403` regardless of `createdBy`. The ownership check is now enforced first, so
>   a non-owner gets `404` before the policy is ever consulted.
>
> The remaining asymmetry — a legacy document the caller *can* read answers `200` to `GET` but `404` to
> `DELETE` — is deliberate and safe (it denies the write), but it is not "invisible": the caller can still
> tell the resource exists via `GET`. That is out of scope for the write-path oracle (`GET` is by design
> readable to a permitted principal).
>
> **Operational consequence**: subscriptions and registrations created before `createdBy` existed can no
> longer be updated or deleted by regular users — including by whoever originally created them, since the
> stored document carries no owner to match. `tenant_admin` retains full access to those
> documents (the intended escape hatch — `super_admin` cannot, per the fence note above); re-creating the
> resource under an authenticated principal restores normal self-service management.

### Error Response

For subscriptions / registrations / csource-subscriptions, an owner mismatch is indistinguishable from a
nonexistent id, so the NGSIv2 / NGSI-LD error envelope is the same as a `404`:

```json
{
  "error": "NotFound",
  "description": "Subscription not found: {subscriptionId}"
}
```

Status code: `404 Not Found`

Custom data models keep `403 Forbidden`:

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
