---
title: "変更履歴"
description: "GeonicDB の変更履歴"
outline: deep
---
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### 2026-03-03
- **Docs**: Added CLI reference (`docs/CLI.md`) (#632)
  - Complete command reference for `@geolonia/geonicdb-cli` (`geonic` command)
  - Installation, authentication, configuration & profile management, input/output formats
  - All commands: entities, batch, subscriptions, registrations, temporal, snapshots, rules, admin, etc.

### 2026-03-02
- **Fix**: Fixed multiple bugs in Custom Data Model validation (#597)
  - Fixed `validateValueType()` case mismatch (PascalCase `"String"` etc. were mismatched with lowercase `'string'`, disabling type checks)
  - Added custom data model validation to `batchCreateEntities` / `batchUpsertEntities` (with per-type cache)
  - Fixed fail-open behavior in `getActiveDataModel()` (now propagates errors instead of skipping validation on DB failure)

### 2026-02-28
- **Feat**: Crypto-Shredding and deletion report generation (#554)
  - Execute Crypto-Shredding for encrypted tenants with `DELETE /admin/tenants/{tenantId}?shred=true`  - KMS CMK DisableKey → ScheduleKeyDeletion → physical deletion of all tenant data → logical tenant deletion
  - Automatic deletion report generation (ISMAP/ISO 27001/NIST SP 800-88 compliant)
  - Retrieve report with `GET /admin/tenants/{tenantId}/deletion-report`  - CloudTrail audit event retrieval (best-effort)
  - Logical tenant deletion (`status: 'deleted'`) and automatic exclusion from queries
- **Infra**: Single-region Staging deployment support (#571)
  - Added `HasSecondaryRegion` condition: use `AWS::DynamoDB::Table` when `SecondaryRegion=""`  - Added single-region versions of 3 tables (DeploymentsTable, TokenInvalidationTable, UsageStatisticsTable)
  - Switch environment variables and IAM policy references with nested `!If`- **Infra**: Added Staging parameter file (#572)
  - Created new `infrastructure/parameters/staging.json` (`Environment: staging`, `LogLevel: INFO`)
- **CI**: Added `workflow_call` trigger to `ci.yml` (#573)
  - Made CI pipeline reusable from CD workflow (`deploy.yml`)
- **CI**: Created new CD pipeline `deploy.yml` (#574, #575)
  - Staging: auto-deploy on `main` merge (OIDC auth, health check, deployment recording)
  - Production: manual approval multi-region deploy on `v*.*.*` tag (Primary → Secondary → Route53)
  - Removed `push: [main]` trigger from `ci.yml` (unified to `workflow_call` via `deploy.yml`)

### 2026-02-27
- **Perf**: Introduced KMS Decrypt DEK cache and concurrency limit (#578)
  - Cache decrypted DEKs to eliminate repeated KMS DecryptCommand calls for the same envelope
  - Limit KMS API parallel calls with `ConcurrencyLimiter` (default: 10)
  - Applied to batch decryption in `entity.repository.ts`, `temporal.repository.ts`, `snapshot.repository.ts`- **Feat**: Added runtime check for time-series aggregation requests on encrypted tenants (#579)
  - Detect encrypted tenant when `aggrMethod` parameter is specified and return 400 Bad Request
  - Alternative: fetch decrypted data from `temporalValues` endpoint and aggregate at application layer
- **BREAKING**: Changed entity ID unique constraint to `entityId` alone within tenant scope (#580)
  - Changed index from `(tenant, servicePath, entityId, entityType)` to `(tenant, servicePath, entityId)`  - Creating entities with same ID but different type returns `409 AlreadyExists`  - Batch Upsert matches by `entityId` only (type can be overwritten)
  - Removed NGSIv2 type disambiguation via `?type=` parameter
  - Unified with NGSI-LD ID uniqueness semantics (GeonicDB proprietary extension)
- **Feat**: Implemented tenant-level KMS CMK and Envelope Encryption (#553)
  - Auto-generate AWS KMS CMK on tenant creation (when `encryptionEnabled: true` is set)
  - Encrypt entity `attributes` fields with AES-256-GCM Envelope Encryption
  - Data key cache (TTL/count/byte limits) for KMS API call optimization
  - KMS key disable/deletion schedule on tenant deletion (Crypto-Shredding support)
  - Backward-compatible coexistence of encrypted/non-encrypted tenants
  - Encryption integration in Temporal/Snapshot repositories
  - SAM template: KMS IAM policy, DynamoDB SSE settings, `EncryptionEnabled` parameter
  - Added dependency: `@aws-sdk/client-kms`
### 2026-02-25
- **Feat**: Multi-region HA architecture Phase 1+2 (#557)
  - Active-Passive configuration (Primary: ap-northeast-1, Secondary: ap-northeast-3)
  - Enhanced health checks: added `region`, `regionRole` to `/health`, `/health/live`, `/health/ready`  - Extended `/health/ready` for DynamoDB/EventBridge deep checks (for Route 53 failover)
  - Added HA options to MongoDB client: `readPreference`, `writeConcern`, `readConcern`, `retryWrites`  - Auto-inject `sourceRegion` metadata in EventBridge events
  - Auto-disable Change Stream processor in secondary region
  - Secrets Manager integration (secure JWT secret/MongoDB URI management)
  - SAM template: `RegionRole` parameter, DynamoDB GlobalTable (3 tables), WAF, conditional resources
  - Route 53 failover stack (`infrastructure/template-route53.yaml`)
  - Failover automation Lambda + SNS notifications
  - Added dependencies: `@aws-sdk/client-secrets-manager`, `@aws-sdk/client-sns`- **Feat**: Implemented cascade deletion of all related data on tenant deletion (#556)
  - Cascade delete tenant data from all 16 collections with `DELETE /admin/tenants/{tenantId}`  - Deactivate-first pattern: automatically set tenant to `isActive: false` before deletion
  - Removed user existence check: tenants with users can now be deleted in bulk
  - Deletion order: subscriptions → registrations → entities → snapshots → config → auth → users → memberships
  - Record deletion count for each collection in audit log
  - Separated `TenantDataCleanupService` as independent service (Phase 2-3 Crypto-Shredding extension support)

### 2026-02-24
- **Feat**: Added `appendToTemporal` action type to ReactiveCore Rules (#549)
  - Auto-append to Temporal API (Time Series Collection) based on rules when entity changes
  - Explicitly specify recording target attributes with `attributes` (uses `changedAttributes` if omitted)
  - Internally calls `TemporalService.recordEntityChange()`
### 2026-02-21
- **Fix**: Fixed minimatch ReDoS vulnerability (Dependabot #5) (#537)
  - Added npm override for `minimatch` to unify all instances to `^10.2.1`  - ajv@6.12.6 (eslint devDependency) has no patch in 6.x series, dismissed as tolerable_risk

### 2026-02-20
- **Feat**: Resource-scoped tokens Phase 1 (#536)
  - Embed resource scopes in JWT for fine-grained access control at entity type/ID pattern/attribute/operation level
  - Added `resourceScopes` parameter to `POST /auth/login`  - Added `resource_scopes` parameter to OAuth `POST /oauth/token`  - Pre-check for write operations (`checkResourceScopes`): reject unauthorized entity writes with 403
  - Post-filter for read responses (`filterByResourceScopes`): exclude unauthorized entities/attributes
  - Backward compatible: no `resourceScopes` = full access as before
- **Feat**: Opened XACML policy management to tenant_admin (#531)
  - Opened `/admin/policies` and `/admin/policy-sets` to `tenant_admin`  - Changed routing layer auth from `requireSuperAdminAuth` to `requireAdminAuth`  - Safely restricted by existing tenant scope control in service layer (own tenant only)
  - `tenant_admin` can manage XACML policies for `user` role in own tenant
- **Feat**: Multi-tenant membership + tenant-scoped tokens (#527)
  - FIWARE Keyrock Organization model compliant: 1 user can belong to multiple tenants
  - Added `tenant_memberships` collection (`userId + tenantId` unique constraint)
  - Added 4 tenant membership management API endpoints (PUT/DELETE/GET members, GET user tenants)
  - Tenant-scoped login: added `tenantId` parameter to `POST /auth/login`  - Auto-create membership on user creation, cascade delete on tenant/user deletion
  - Maintain single `tenantId` value in JWT, zero impact on existing authz middleware
- **Feat**: `tenant_admin` can perform user management (CRUD) within own tenant (#527)
  - Adopted permission delegation model equivalent to FIWARE Keyrock Organization Owner
  - Changed `/admin/users` path auth from `requireSuperAdminAuth` to `requireAdminAuth`  - Safely restricted by existing permission checks in service layer (`checkCanCreateUser` etc.)
  - `tenant_admin` can only create `user` role (`super_admin` / `tenant_admin` creation returns 403)
  - Operations on other tenant users are prohibited (existing tenant isolation logic)

### 2026-02-19
- **Fix**: Fixed 6 bugs discovered in authenticated local server verification (#524)
  - Added `express.urlencoded()` middleware to local server (OAuth form-encoded request support)
  - Fixed XACML PDP to auto-detect glob patterns (matchValue containing `*`) when `matchFunction` is unspecified
  - Improved XACML XML import parser to not depend on AttributeDesignator attribute order
  - Added `PATCH /admin/policies/{policyId}` route (405 → 200)
  - Unified OAuth client response field name from `client_secret` to `clientSecret` (Admin API camelCase convention)
  - Removed progressive delay from brute-force protection `recordFailedAttempt()` (apply delay only in `checkLoginAllowed()`)
- **Fix**: Fixed XACML spec compliance issues discovered in review (#524)
  - Convert glob matchFunction to `string-regexp-match` regex in XACML export (no glob function exists in XACML 3.0)
  - Explicitly documented glob auto-detection as GeonicDB proprietary extension
- **Fix**: Fixed bug where XACML policy PDP glob `/**` pattern did not match base path itself
  - `/v2/entities/**` did not match `/v2/entities` - standard glob spec defines `/**` as "zero or more path segments"
  - Fixed glob conversion logic in `policy.pdp.ts` from `/.*` to `(/.*)?`- **Test**: Added 22 XACML security E2E test scenarios (`xacml-security.feature`)
  - Batch operations, NGSI-LD specific endpoints, PATCH/PUT/DELETE method enforcement
  - Policy disable, dynamic changes, cross-API leak prevention
  - Policy priority conflicts, default decision edge cases, email attribute control
  - `/rules` endpoint enforcement, tenant isolation + XACML composite tests

### 2026-02-18
- **Fix**: Fixed 10 spec compliance bugs missed in E2E tests (#520)
  - **[BREAKING]** Fixed NGSIv2 `Fiware-Total-Count` header to return only when `options=count` is specified (spec: NGSIv2 spec "Pagination" section) (#520)
  - **[BREAKING]** Fixed NGSI-LD `NGSILD-Results-Count` header to return only when `count=true` is specified (spec: ETSI GS CIM 009) (#520)
  - Added `options=values`/`options=unique` support to NGSIv2 `POST /v2/op/query` (spec: NGSIv2 spec "Representation Formats") (#520)
  - Added `orderBy` support to NGSIv2 `POST /v2/op/query` (spec: NGSIv2 spec "Ordering Results") (#520)
  - Added `expression.mq` support to NGSIv2 `POST /v2/op/query` (spec: NGSIv2 spec "Batch Operations") (#520)
  - Migrated NGSIv2 `POST /v2/op/notify` to Zod schema validation (applied `Ngsiv2NotifySchema`) (#520)
  - Fixed NGSIv2 `GET /v2/types?options=values` to return array of type name strings (spec: NGSIv2 spec "Entity Types") (#520)
  - Fixed NGSI-LD temporal controller `AlreadyExistsError` to `AlreadyExistsLdError` (spec: ETSI GS CIM 009 §5.5.1) (#520)
  - Made NGSI-LD controller error types spec-compliant: JSON parse errors are `InvalidRequest`, data validation errors are `BadRequestData` (spec: ETSI GS CIM 009 §5.5.1, Orion-LD/Stellio compatible) (#520)
  - Fixed NGSI-LD batch 207 response Content-Type to `application/json` (spec: ETSI GS CIM 009 §5.6.7/5.6.8) (#520)

### 2026-02-18
- **Fix**: Fixed ReactiveCore Rules condition evaluation to allow entity-level fields (`id`, `type`) in `attributeName` (Issue #513) (#516)
  - Support `attributeName: "id"` / `"type"` in `value` and `pattern` conditions (#516)
  - Fixed issue where rule actions were not executed after PATCH (#516)
- **Security**: OWASP API Security batch fix - addressed 8 security issues (#515)
  - Fixed cross-tenant Subscription notification data leak - added tenant filter to `findMatchingSubscriptions` (#515)
  - Fixed MCP tool OAuth scope validation and XACML authz bypass - added `requireMcpScope`, moved endpoints after rate limiting (#515)
  - Added brute-force protection to OAuth token endpoint - applied `LoginProtectionService` based on `clientId` (#515)
  - Added DNS Rebinding protection (`validateResolvedDns`) to CSource notifications, Rule Webhooks, Registration (#515)
  - Added OAuth scope requirements to `/admin/cadde`, `/admin/metrics`, `/rules`, `/custom-data-models` (#515)
  - Unified PasswordSchema to `PASSWORD_POLICY.MIN_LENGTH`, added `SUPER_ADMIN_PASSWORD` minimum length check, added token revalidation to WebSocket messages (#515)
  - Added resource limits to query parameters - ID list 100 items, polygon vertices 1000, query conditions 50 max (#515)
  - Added ReDoS protection (__INLINE