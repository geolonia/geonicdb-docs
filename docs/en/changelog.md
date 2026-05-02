---
title: "Changelog"
description: "GeonicDB changelog"
outline: deep
---
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### 2026-05-02
- **Fix**: SDK published package `d.ts` root failed to resolve named imports under strict tsconfig (issue #1127)
  - Background: PR #1124 (#1118 fix) changed `geonicdb.d.ts` to wildcard re-export `export * from './index'`, but `src/sdk/package.json` `files: ["geonicdb.*"]` intentionally delivers only single-file bundle (#877), so `./index.d.ts` and other per-file d.ts files are not included in the npm package. Under strict tsconfig (`verbatimModuleSyntax`, `strict`, etc.), consumers saw the wildcard resolve to empty and all named exports including `AuthorizationError` disappeared (discovered during locus sample development: `import { AuthorizationError } from '@geolonia/geonicdb-sdk'` caused module resolution error)
  - Fix: Reverted `scripts/build-sdk.ts` d.ts generation to hardcoded export enumeration format. However, TypeScript AST (`createSourceFile` from `typescript`) now traverses `src/sdk/index.ts` at build time to auto-collect the export list, so no need to manually update `build-sdk.ts` when adding new exports (drift auto-prevention)
  - **Verification strengthening** (regression prevention): Instead of reading `dist/sdk/` directly, extract npm pack tarball and:
    - Verify published files include `geonicdb.d.ts` / `geonicdb.{cjs,mjs,iife.js}`
    - **Reproduce strict tsconfig environment**: assemble a consumer project in `tmpdir`, compile with `tsc --project`, and assert named imports (`import { ... }` and `import type { ... }`) of each error class / public type **do not cause TS2614**
    - Prohibit `export * from` form in published d.ts via regex
    - Drift guard: verify export names in `src/sdk/index.ts` source match export names in published d.ts
  - Docs: Added "TypeScript" section to `docs/SDK.md` / `src/sdk/README.md` clarifying named imports work under strict tsconfig

## [0.7.0] — 2026-05-02

### 2026-05-02
- **Improve**: Implemented cooperative cancellation for ReactiveCore Rules on SLO overrun (issue #1122) (#1123)
  - Background: The `Promise.race`-based soft timeout for `RuleProcessorFunction` introduced in PR #1121 only stopped waiting but continued execution of `ruleEngine.processEntityChange()` in the background. Lambda hard timeout (30s) would eventually stop it, but processing exceeding SLO (`MAX_RULE_EXECUTION_TIME_MS = 5s`) could cause unintended entity creation / webhook firing (CodeRabbit comment)
  - Fix: Added optional `AbortSignal` to `RuleEngineService.processEntityChange(event, signal?)`. Checks `signal.throwIfAborted()` at rule evaluation loop and action execution loop boundaries to prevent starting new rules / actions. `executeWebhookAction` uses `AbortSignal.any([external signal, internal timeout signal])` to compose external signal with existing internal timeout and also abort HTTP fetch
  - `handlers/rules/processor.ts` creates `AbortController` and calls `controller.abort()` on SLO overrun. Records ERROR on span distinguishing whether aborted (`aborted` flag in log)
  - Signal threading to each method of existing `entity.service` / `temporal.service` has wide blast radius, cut to separate issue; this fix guarantees "don't start next processing at loop boundary". In-flight DB operations are allowed to complete
  - Related: `src/core/rules/rule-engine.service.ts`, `src/handlers/rules/processor.ts`, `tests/unit/core/rules/rule-engine.service.test.ts` (4 cooperative cancellation via signal cases added), `tests/unit/handlers/rules/processor.test.ts` (2 abort/log/span verification via signal cases added)
- **Fix**: Error classes silently dropped from SDK published d.ts (`geonicdb.d.ts` of `@geolonia/geonicdb-sdk`) (issue #1118) (#1124)
  - Cause: `scripts/build-sdk.ts` wrote `geonicdb.d.ts` with hardcoded export enumeration, and `GeonicDBError` / `AuthenticationError` / `AuthorizationError` / `NotFoundError` / `ConflictError` / `ValidationError` / `RateLimitError` / `NetworkError` re-exported from `errors.ts` in `src/sdk/index.ts` were not included. Runtime bundles (cjs / mjs) exported correctly, but TypeScript showed module resolution error for `import { AuthorizationError } from '@geolonia/geonicdb-sdk'`
  - Fix: Changed `scripts/build-sdk.ts` d.ts generation to `export * from './index'; export { default } from './index';` to auto-forward all named exports from `src/sdk/index.ts`. No need to modify this script when adding exports to index in the future
  - Regression prevention: Added `tests/unit/sdk/build-artifacts.test.ts`. Verifies `geonicdb.d.ts` is in wildcard form, error classes are publicly available via re-export form from `errors.ts` in `index.d.ts`, and error classes can be called as constructors in both runtime CJS / ESM bundles, are Error subclasses, and have `GeonicDBError` as common base (ESM evaluated via child process)
- **Add**: ReactiveCore Rules action templates now support calling functions like `${now()}` / `${uuid()}` (issue #1120) (#1125)
  - Background: Existing `${path}` resolution was limited to paths referencing `entity.id` / `attribute.<name>.value` / `trigger.*`, with no way to generate server time or unique IDs. Only deterministic entityIds like `urn:ngsi-ld:ActivityLog:${entity.id}` were possible; generating derived entities from multiple updates of the same entity would fail with id collision from the 2nd time onwards
  - Fix: Extended `substituteTemplate` in `rule-engine.service.ts` to interpret `${name(args)}` form as function calls. Implemented functions are whitelist-only with no side effects or external I/O:
    - `${now()}` / `${now('iso')}` → ISO 8601 timestamp
    - `${now('unix')}` → UNIX seconds
    - `${now('unix-ms')}` → UNIX milliseconds
    - `${uuid()}` → RFC 4122 v4 UUID
  - Safety: Argument parser accepts only simple quoted string literals. Unsupported function names / formats are left as literals with a warn log (does not stop firing)
  - Docs: Added "Template Functions" subsection to Template Variables section of `docs/REACTIVCORE_RULES.md`. Includes append-only ActivityLog practical example
  - Tests: Added 10 scenarios to `template substitution` describe in `rule-engine.service.test.ts` (return value formats for each function, simultaneous multi-function expansion, mixing with path references, unknown function / invalid format literal preservation, `createEntity` `${uuid()}` uniqueness)

### 2026-05-01
- **Fix**: ReactiveCore Rules not firing at all in production (Lambda) (issue #1119) (#1121)
  - Cause: Rule consumer Lambda listening to `EntityCreated/Updated/Deleted` events published from `entity.service` to EventBridge was not present in `infrastructure/template.yaml`, making Rules firing path depend solely on `ChangeStreamProcessorFunction` `Schedule: rate(1 minute)` startup → MongoDB Change Stream tail. This path was silently failing in production Lambda environment so Rules never executed (discovered during locus sample development)
  - Fix: Added new Lambda `RuleProcessorFunction` (`src/handlers/rules/processor.ts`) to listen to `EntityCreated/Updated/Deleted` with same EventBridgeRule as SubscriptionMatcher, driving `RuleEngineService.processEntityChange`. Removed rule engine call from `ChangeStreamProcessorFunction` side (double-firing prevention)
  - **Reflecting on failure to detect this bug with E2E**: Existing `tests/e2e/support/rule-execution-helper.ts` (`triggerRuleExecution`) called `ruleEngine.processEntityChange` directly, completely skipping EventBridge path, so loss of wiring in `template.yaml` went unnoticed. Added following detection measures:
    - Added `@rules-auto-fire` tag dedicated bridge to `tests/e2e/support/hooks.ts`. Calls production handler `handlers/rules/processor.handler` directly via `getLocalEventBus().on('entityChange', ...)`, threading through entity creation API → EventBridge equivalent → RuleProcessor Lambda → ruleEngine path
    - Added 2 scenarios to `tests/e2e/features/auth/rules-auto-fire.feature` for "Rule action auto-executes from entity creation API alone" (reproduction test without `triggerRuleExecution`)
    - Added `tests/unit/infrastructure/sam-template.test.ts` to mechanically verify minimum structure of `infrastructure/template.yaml` (RuleProcessorFunction / SubscriptionMatcherFunction / WsBroadcastFunction listen to 3 detail-types via EventBridgeRule)
    - Added `tests/unit/handlers/rules/processor.test.ts` verifying new handler unit behavior (3 event delegation, secondary region skip, error suppression, timeout)
  - Related: `src/handlers/rules/processor.ts` (new), `src/handlers/streams/change-stream.ts` (rule engine call removed), `infrastructure/template.yaml` (`RuleProcessorFunction` added), `tests/e2e/support/hooks.ts` / `tests/e2e/features/auth/rules-auto-fire.feature` / `tests/unit/infrastructure/sam-template.test.ts` / `tests/unit/handlers/rules/processor.test.ts`

## [0.6.0] — 2026-05-01

### 2026-05-01
- **Authz**: Inject `entityOwner` / `entityId` into XACML AuthzRequest on WebSocket delivery (issue #1107) (#1116)
  - Refactored `filterByAuthz` in `src/handlers/websocket/broadcaster.ts` and `broadcastEventAsync` in `src/core/streaming/local-ws-server.ts`. Pass `entityOwner` (createdBy) / `entityId` / `entityType` of the entity being delivered to each connection's `authorizeWs()` call. Previously only `entityType` was passed, so XACML custom policies for "receive only updates to entities you own" per-user notification filter could not be written
  - Added optional `owner?: string` to `EntityChangeEvent.entity`. Propagate entity `createdBy` transparently in `entity.service.ts` publish paths (CREATE/UPDATE/DELETE). Also added `InternalEntity.createdBy` (internal use; not output by NGSI transformer)
  - Added `WsEntityContext` interface to `policy.pip.ts`. Changed 5th argument of `buildWsAuthzRequest` / `authorizeWs` from `entityType?: string` to `entityContext?: WsEntityContext` (`{ entityType?, entityId?, entityOwner? }`). entityOwner injected into both AuthzRequests in `WS ⊂ GET` evaluation
  - Extended authz cache key from `role:policyId` to `role:policyId:userId`. Policies of form `subject.userId == entityOwner` have different decisions per userId even with same role/policyId. Cache is only reused when same user connects from multiple devices
  - New use cases: "receive only events addressed to me" (chat, notifications), "subscribe to entities you own" (my page feed), "only feed for GeoJSON I edited" in locus sample, etc. are now possible with XACML custom policies
  - Related: `src/infrastructure/eventbridge/client.ts`, `src/core/entities/entity.types.ts`, `src/core/entities/entity.repository.ts`, `src/core/entities/entity.service.ts`, `src/core/auth/policy/policy.pip.ts`, `src/handlers/websocket/broadcaster.ts` / `src/core/streaming/local-ws-server.ts`, `docs/AUTH.md` / `docs/EVENT_STREAMING.md`, tests (12 happy/unhappy cases added), `tests/e2e/features/common/websocket.feature` (1 owner-based WS filter scenario)
- **ReactiveCore Rules**: Added `eventType` condition (issue #1103) (#1115)
  - Rules `conditions` now support `{type: "eventType", eventTypes: ["create" | "update" | "delete"]}`. Can filter EntityCreated / EntityUpdated / EntityDeleted trigger events on the Rule side. Common patterns in `geonicdb-locus` sample app (GeoJSON collaborative editing) like "generate ActivityLog only on create" and "cleanup only on delete" can now be written directly
  - Previously `change` condition (`changedAttributes` reference) couldn't distinguish CREATE and DELETE (both have `changedAttributes` undefined), making natural expressions impossible
  - Can be freely combined with existing `entityType` / `value` / `change` / `and` / `or` / `not` etc. Use `{type: "not", condition: {type: "eventType", eventTypes: ["delete"]}}` to express "anything except delete"
  - Related: `src/core/rules/rule.types.ts`, `src/core/rules/rule-engine.service.ts`, `src/api/shared/schemas/rule.schemas.ts`, `docs/REACTIVCORE_RULES.md`, tests added
- **ReactiveCore Rules**: Exposed `previous.attribute.<name>` in CEL evaluation context (issue #1106) (#1114)
  - In `evaluateCelExpressionCondition` of `src/core/rules/rule-engine.service.ts`, bound `RuleEvaluationContext.previousEntity` attributes as `previous.attribute.<name>.value` / `previous.attribute.<name>.type` in CEL environment. Previously `previousEntity` was held internally but could not be referenced from CEL
  - Behavior: `previous.attribute` is empty object (`{}`) on `EntityCreated`, pre-update attribute snapshot on `EntityUpdated`, final state on `EntityDeleted`. Direct property reference on empty object (`previous.attribute.x.value`) throws `No such key` in CEL, so `has()` guard is recommended
  - Enables rules like "threshold crossing detection", "`draft` → `published` state transition detection", "configuration change audit log", "idempotent update misfiring avoidance" that cannot be expressed with current values alone
  - Docs: Added `previous.attribute.<name>.value` / `.type` rows and `has()` guard notes to CEL Context Variables table in `docs/REACTIVCORE_RULES.md`, plus 4 usage examples
  - Tests: Added 12 cases to `rule-engine.service.test.ts`. E2E: 2 scenarios for threshold crossing and state transition added to `rules.feature`
- **SDK**: Added anonymous mode (issue #1105) (#1113)
  - `new GeonicDB({ anonymous: true, tenant, baseUrl })` completely skips token acquisition and `Authorization` header sending. Server-side (`optionalAuth`) passes as `role: 'anonymous'`, with XACML custom policy deciding authorization for `anonymous` role. Public apps like GeoJSON viewers / BI dashboards / public data visualization that want to return public resources to unregistered viewers can now use the SDK without login forms
  - Simultaneous specification with `apiKey` throws in constructor (mutually exclusive with token acquisition path). Can upgrade to authenticated with `login()` / `setCredentials()`, and return to anonymous with `logout()` (check current state with `db.isAnonymous()`)
  - 401 / 403 from anonymous requests don't enter token re-acquisition loop and are passed through transparently. XACML Deny reaches caller as-is
  - WebSocket explicitly throws at `connect()` (server `local-ws-server.ts` requires token). WS anonymous support deferred to separate issue
  - Related: `src/sdk/auth.ts`, `src/sdk/index.ts`, `src/sdk/types.ts`, `src/sdk/websocket.ts`, tests, `docs/SDK.md`, `src/sdk/README.md`
- **Authz**: Inject subscription target attributes into XACML AuthzRequest on NGSI-LD Subscription creation (issue #1104) (#1112)
  - Fixed issue where `body.type === "Subscription"` was going directly to `resource.entityType` in authorization for `POST /ngsi-ld/v1/subscriptions`. Now extracts `entityType` / `entityId` / `entityIdPattern` from each element of `entities[]` and injects `notification.endpoint.uri` as `resource.notificationEndpoint`
  - For `entities[]` with multiple elements, evaluates with **all-Permit semantics**. If even one is not permitted (Deny / NotApplicable / Indeterminate), deny overall. Prevents the loophole of permitting only the first element to skip the rest
  - New resource attributes enable type-based / URI-based control in XACML custom policies like "allow `anonymous` only for `entityType=ActivityLog` subscriptions" or "allow only subscriptions where `notificationEndpoint` matches `https://*.example.com/**`" (SSRF / data exfiltration countermeasure)
- **Security**: Raised PoW difficulty from 4 to 16 bits (issue #1093) (#1110)
  - Changed `PROOF_OF_WORK.DIFFICULTY` in `src/config/defaults.ts` from `4` to `16`. Average SHA256 computations 16 → 65,536, raising the cost for GPU burst bots to succeed
  - Primary defense is IP / OAuth `client_id`-based rate limiting (#1075). PoW is secondary defense, but 4 bits is solvable in a few microseconds on modern GPUs making it ineffective as a deterrent
  - SDK (`src/sdk/pow.ts`) already supports variable `difficulty` parameter (`MAX_ITERATIONS=1M`, Web Crypto batch processing), so no client compatibility impact
- **Security**: `MONGODB_ENFORCE_SECRETS=true` makes `MONGODB_URI` env variable path fail-closed (issue #1086) (#1111)
  - Refactored `getMongoUriAsync()` in `src/infrastructure/mongodb/client.ts`. When `HA.SECRETS_MANAGER.MONGODB_ENFORCE_SECRETS` (env-derived, `@config/defaults`) is true: throws at startup if `MONGODB_URI_ARN` not set; also throws if ARN is set but Secrets Manager fetch fails (no env fallback)
  - Set `MONGODB_ENFORCE_SECRETS: 'true'` in Lambda prod deployment by default. Docker Smoke E2E / local `npm start` / dev/test can start with env URI without this setting. For production on Docker / EC2, operators explicitly set `MONGODB_ENFORCE_SECRETS=true`
  - Fail-closed design blocking plaintext credentials exposed via memory dumps / CloudWatch log contamination. Added behavior matrix to `docs/SECURITY.md`

### 2026-04-30
- **Security**: Added Condition to Lambda IAM `kms:CreateKey` to enforce key usage and tags (issue #1071) (#1108)
  - Added `Condition` to `kms:CreateKey` Statement in `ApiHandlerFunction.Policies` in `infrastructure/template.yaml`: enforces `kms:KeyUsage = ENCRYPT_DECRYPT` / `kms:KeySpec = SYMMETRIC_DEFAULT` / `aws:RequestTag/geonicdb:purpose = envelope-encryption`, limits unknown tag keys with `ForAllValues:StringEquals` `aws:TagKeys` to `geonicdb:tenantId` / `geonicdb:purpose` only, prohibits key creation without tenant ownership info with `Null: aws:RequestTag/geonicdb:tenantId = false`
  - Added separate Statement for `kms:TagResource` allowed under `arn:aws:kms:${AWS::Region}:${AWS::AccountId}:key/*` with Region/Account limits, providing permission needed for `Tags` parameter in `CreateKeyCommand`
  - Actual code (`src/infrastructure/kms/key-manager.ts createTenantKey()`) already issues with above tags/KeyUsage/KeySpec, so non-breaking. Suppresses path for compromised Lambda to mass-produce signing keys / asymmetric keys / untagged keys / keys with unknown tenantId
- **Security**: Parameterized `Access-Control-Allow-Origin` in API Gateway `GatewayResponses` (issue #1088) (#1108)
  - Added new `GatewayResponseAllowOrigin` Parameter (default `*` for backward compatibility). Referenced via `!Sub "'${GatewayResponseAllowOrigin}'"` in `DEFAULT_4XX` / `DEFAULT_5XX` of `infrastructure/template.yaml`
  - In production deployment, restrict to allowed origin with `--parameter-overrides GatewayResponseAllowOrigin='https://app.example.com'`
- **Security**: Log WS ⊂ GET invariant violations when registering XACML policies (issue #1085) (#1109)
  - Added `PolicyService.validateWsGetSymmetry()`. In each path of `createPolicy` / `updatePolicy` / `updatePolicySystem` / `updatePolicyForUser`, outputs WARN log when `rule.target.actions` has entry with `attributeId === 'method'` and `matchValue === 'WS'` (`string-equal`) but the same rule doesn't include `'GET'`
  - `authorizeWs()` evaluates both WS and GET and permits only when both Permit, so WS-only rules are prone to divergence between admin intent and actual behavior. Left as WARN rather than reject to maintain backward compatibility with existing policies
  - Added "WebSocket Authorization (WS ⊂ GET)" section to `docs/AUTH.md` clarifying invariant, recommended notation, and how to read WARN logs
- **Security**: Implemented rollback on partial failure for public endpoint rate limiting (issue #1075 follow-up) (#1102)
  - Old behavior: `consumeBucket()` updated 3 time windows (minute/hour/day) in parallel with `Promise.all`, so if an exception occurred in some windows (DDB / Mongo transient failure, etc.), only successful windows had tokens consumed, causing "over-counting" where subsequent requests were unfairly depleted. Also when rejecting limit exceedance, consumption could be committed in windows other than the rejecting window
  - Fix: Updated 3 windows in parallel with `Promise.allSettled`; on (a) partial throws, rolled back by `updateBucket` with negative weight only for windows that are fulfilled with non-negative values, then re-throws original exception; (b) on limit exceedance rejection, similarly rolled back windows where consumption was committed other than the rejecting window
  - **Negative-value guard**: `updateBucket` returns negative values as fulfilled when condition fails, but DDB SET / Mongo $inc is not executed in that case and consumption was not committed. Rollback target limited to `r.value >= 0` fulfilled results only (CodeRabbit comment #1102 additional fix)
- **Security**: Introduced IP-based rate limiting for public (unauthenticated) endpoints (issue #1075) (#1101)
  - Old behavior: `/.well-known/ai-plugin.json`, `/.well-known/agent-card.json`, `/.well-known/ngsi-ld`, `/openapi.json`, `/api.json`, `/tools.json`, `/llms.txt`, `/oauth/token`, `/auth/refresh`, `/auth/nonce` had no rate limiting at all; tenant-level `checkRateLimit()` only fires after authentication, effectively unlimited. Enabled offline brute-force of OAuth `client_id+secret` and Lambda concurrency exhaustion (DoS) by hammering heavy JSON generation endpoints
  - Fix: Added new `src/core/quotas/rate-limit/public-rate-limit.service.ts` reusing existing `providers.rateLimit` (DynamoDB / MongoDB token bucket) with `checkPublicRateLimit()` / `checkOAuthClientRateLimit()` per IP / OAuth `client_id` bucket. Added `enforcePublicRateLimit()` helper and related helpers to `src/handlers/api/index.ts`, calling before dispatch for metadata / OAuth / auth refresh / nonce. `/auth/login` excluded (protected by existing `LoginProtectionService`), `/health` `/version` excluded (monitoring polling use)
  - **Early firing**: Public path rate limit check runs before `Promise.all([resolveJwtSecret(), getMongoClient()])` and `resolveHostnameContext()`, skipping JWT secret resolution / Mongo connection / hostname DDB reference on limit exceedance. Minimizes Lambda CPU consumption and cold start wait for rate-exceeded requests
  - Returns 429 + `Retry-After` header via `TooManyRequestsError`. Fail-open on bucket store failure (don't drop public endpoints)
- **Security**: Changed PBKDF2 iteration count from `NODE_ENV`-dependent to fixed constant (issue #1073) (#1100)
  - Old behavior: Ternary `process.env.NODE_ENV === 'test'` switched iter=1000 / 100000, creating a path where production hash computation could be weakened 100x if `NODE_ENV=test` leaked into CI/CD or Lambda env vars
  - Fix: Added `PASSWORD_HASH` block to `src/config/defaults.ts` with `PBKDF2_ITERATIONS: 100000` (production fixed value). `password.service.ts` no longer references `NODE_ENV`
  - Test override only activated when explicitly setting separate env var `PASSWORD_HASH_ITERATIONS_TEST` (with positive integer check). Set this variable to `'1000'` in both Jest / Cucumber setups
- **[Breaking] WebSocket Authentication**: Completely removed `?token=` URL query parameter path (issue #1072) (#1099)
  - Old behavior: `extractWebSocketToken()` and `extractLocalWebSocketToken()` accepted `?token=<jwt>` URL query as fallback in addition to `Authorization` header / `Sec-WebSocket-Protocol` (only deprecation warning log, actual use permitted)
  - Attack surface: Token in URL is recorded in reverse proxy / WAF / LB access logs, and also remains in browser history and cache. Leakage path via `Referer` header also exists (compounded with unset Referrer-Policy)
  - Fix: Moved query token extraction logic to the very front of auth flow with **fail-closed** behavior. If query contains `token`, even if valid `Authorization` header or `Sec-WebSocket-Protocol` is co-sent, leaves warn log and returns `null`, rejecting connection with 1008 / 401. URL already recorded in upstream proxy logs so token is treated as leaked
  - Client migration: Existing clients need to migrate token to one of: **Node.js / own WebSocket client**: `Authorization: Bearer <token>` header; **Browser**: Standard `WebSocket` API can't set arbitrary headers, so use `new WebSocket(url, ['access_token', token])` form `Sec-WebSocket-Protocol`
  - `@geolonia/geonicdb-sdk` (`src/sdk/websocket.ts`) already uses `Sec-WebSocket-Protocol` → SDK users (geonicdb-pulse / geonicdb-voice) can migrate with no operation. geonicdb-cli / geonicdb-app-template don't use WebSocket, geonicdb-demo-app `use-geonicdb-stream.ts` doesn't use query token

### 2026-04-29
- **CORS / Security**: Block token leakage / CSRF paths with Origin echo-back + tenant-level `allowedOrigins` (issue #1069) (#1097)
  - Old behavior: Returning `Access-Control-Allow-Origin: '*'` while including `Authorization` / `X-Api-Key` / `DPoP` in `Access-Control-Allow-Headers` created a path for attackers to send requests with browser-held user Bearer tokens / API Keys from attacker-controlled sites (CSRF + token leakage concern)
  - Single environment variable whitelist is inappropriate since GeonicDB is a multi-tenant data integration platform (Context Broker). Changed to design where allowed origins are set by tenant operators at runtime via DB
  - **Data model extension**: Added `TenantSettings.allowedOrigins?: string[]`. `undefined` = backward-compatible allow all, `[]` = deny all, `['*']` = allow all, `[origin1, ...]` = exact match. Max 50 (`TENANT.MAX_ALLOWED_ORIGINS`)
  - **CORS middleware echo-back**: Changed `Access-Control-Allow-Origin` to echo-back request `Origin` header, always including `Vary: Origin`. Prevents CDN / browser cache mixing responses by origin
  - **Fail-close in authentication layer**: New `src/core/auth/origin/origin-check.ts` integrated into `src/api/shared/middleware/auth.middleware.ts`. Preflight (OPTIONS) passes without origin validation; actual request authentication phase validates origin with `validateOriginForTenant()`, failing 403 on violation
  - **CORS headers on error**: Even when returning 403, include `Access-Control-Allow-Origin` / `Vary: Origin`. Without echo-back, browsers completely block response as "Network error", hiding cause from operators
- **Security audit batch**: Batch fix for 5 compatibility-safe issues from comprehensive audit (#1068) (#1098)
  - Moved `TestPasswordHasher` under `tests/`. Removed test-only SHA-256/salt-less hasher export from production modules, eliminating accidental injection paths (#1077)
  - Added dummy PBKDF2 verification to login failure paths (user not found / env super admin password mismatch). Equalizes response time to prevent timing-based user enumeration (#1095)
  - Elevated tenant mismatch / global→tenant violation bind in `loadBoundPolicy()` to `error` level + `errorCode` / `securityEvent` structured fields. Enabled detection via CloudWatch metrics filter (#1081)
  - Added path traversal rejection (`..`, `//`, `/./`) to `validateAllowedPath()`. Completely eliminated potential for string-prefix check miseval as defense layer. 6 test cases added (#1083)
  - Added "Path-Level vs Entity-Level Authorization" section to `docs/AUTH.md`. Documented design rationale and operational implications of `requireAuthz` (fail-closed) vs `requireEntityAuthz` (fail-open) (#1076)

### 2026-04-28
- **CORS Fix**: Added `If-None-Match` / `If-Modified-Since` to `Access-Control-Allow-Headers` (#1065)
  - Old config: These 2 headers were not allowed in cross-origin requests, causing CORS preflight (OPTIONS) to reject them, preventing browser HTTP cache auto-revalidation and SDK `_cachedRequest` from sending INM-bearing GET requests
  - This meant that even with 3-step fix of PR #1060 (SDK invalidation removal) / #1062 (CORS expose ETag) / #1063 (Cache-Control: no-cache strip), INM itself wasn't sent from browser so entire 304 path was non-functional (incident 2026-04-28: final root cause of SDK cache not working in pulse)
  - Fix: Added new `CORS_ALLOW_HEADERS` constant to `src/config/defaults.ts` with complete allow-list including `If-None-Match` / `If-Modified-Since`. Synced `cors.middleware.ts` and `infrastructure/template.yaml` to this constant
- **Deploy visibility**: Embedded commit SHA in `git_hash` field of `/version` endpoint (#1064)
  - Added `GitHash` parameter to `infrastructure/template.yaml`, injected as Lambda env var `GIT_HASH`
  - `deploy-env.yml` passes `GitHash=${{ github.sha }}` as SAM parameter (both staging / prod paths)
- **Conditional Request Fix**: Excluded `Cache-Control: no-cache` request header from INM evaluation (#1063)
  - Old behavior: `fresh` package treated request `Cache-Control: no-cache` as "force reload" per RFC 2616 §14.9.4, returning 200 + body even on `If-None-Match` match
  - Fix: Excluded `cache-control` from request headers in `normalizeRequestHeaders` of `evaluateConditionalRequest`. SDK explicitly sending `If-None-Match` = "304 is OK if same" intent, so browser auto-appended `Cache-Control: no-cache` should not suppress 304
- **CORS Fix**: Added multiple response headers to `Access-Control-Expose-Headers` (#1062)
  - **ETag / Vary**: Old config hid ETag via CORS, so browser JS `res.headers.get('etag')` returned `null`, SDK couldn't create cache entries or send `If-None-Match`, 304 bandwidth saving path completely non-functional (incident 2026-04-28: root cause of SDK cache never working in pulse)
  - **Content-Crs**: Header for CRS notification in NGSI-LD / NGSIv2 geo responses. Needed for browser clients to determine coordinate system
  - **Fiware-Next-Token**: NGSIv2 pagination continuation token
  - **NGSILD-Warning**: NGSI-LD federation warning
  - **Retry-After**: 429 rate limit / 503 retry-after guidance
- **Security**: Batch resolution of 13 Dependabot alerts (#1061)
  - Direct dependencies (via overrides): `hono` ^4.12.14, `@hono/node-server` ^1.19.13 — resolved JSX SSR HTML injection / cookie name validation / IPv4-mapped IPv6 / serveStatic / toSSG path traversal
  - Indirect dependencies (overrides added): `protobufjs@<8` ^7.5.5 (arbitrary code execution), `basic-ftp` ^5.3.1 (CRLF injection / DoS), `follow-redirects` ^1.16.0 (Authorization header leak), `uuid` ^14.0.0 (buffer boundary)
  - Confirmed `npm audit` 0 vulnerabilities
- **SDK Performance Fix**: Removed automatic cache invalidation on WebSocket entity events (#1060)
  - Old implementation: `_invalidateCacheForEntityEvent()` deleted all `entities` cache entries via `deleteWhere` on receiving `entityCreated` / `entityUpdated` / `entityDeleted`
  - Deletion also loses ETag, so next read doesn't send `If-None-Match`, server returns full `200` body every time → 304 bandwidth saving path completely dead
  - Data endpoints are `Cache-Control: private, no-cache` so revalidated every time regardless, safe to keep cache (server-side ETag match automatically routes 304 / 200)
  - Result: Cache becomes effective in real-time monitoring apps like pulse during WebSocket reception, unchanged data re-fetches resolve with 304
- **Security Enhancement**: Security Audit Group 3 — Comprehensive validation of public vs authenticated boundary (#1057)
  - **#1053: Applied STATIC policy to public meta endpoints** — 6 endpoints weren't returning `Cache-Control`. Applied `applyCachePolicy('static')` to return `Cache-Control: public, max-age=3600`. `/openapi.json` falls back to `meta` policy only when tenant-specific `CustomDataModel_*` is injected
  - **#1053: Minimized Vary for STATIC policy** — Since STATIC is shareable cross-tenant, limited `Vary` to `Accept` only
  - **#1048: Vary coverage audit + documentation** — Confirmed existing `Vary` is comprehensive. Documented intentional exclusions in `docs/SECURITY.md`
  - **#1052: DPoP / DPoP-Nonce × cache verification + documentation** — Fixed `DPoP-Nonce` in 304 passthrough whitelist in unit test. Documented DPoP authentication failure evaluating before `evaluateConditionalRequest` in `docs/AUTH.md` / `docs/SECURITY.md`
  - **Docs**: Added 3 sections to `docs/SECURITY.md`: "Vary Header Coverage Audit", "DPoP / DPoP-Nonce & Cache Integrity", "Public vs Authenticated Endpoint Cache Policy Matrix". Added "DPoP & HTTP Cache Interaction" subsection to `docs/AUTH.md`

### 2026-04-28
- **Security Enhancement**: Security Audit Group 2 — Authorization consistency (#1056)
  - **#1049: HMAC-based ETag** — Changed ETag generation from `createHash` to `createHmac(algo, secret)`. Key obtained from `ETAG_HMAC_SECRET` env var; in prod (`ENVIRONMENT='prod'`), fails fast if unset. Dev/test uses documented fallback. Previously deterministic ETag is now unreproducible for attackers, fundamentally eliminating `modifiedAt` / count blind information leak via `If-None-Match` attempts. Same-tenant legitimate users share the same key so 304 bandwidth saving is maintained
  - **#1050: XACML policy Revoke and cache consistency** — Fixed handler evaluation order (`requireAuthz` → controller → `evaluateConditionalRequest`) in unit test. When `requireAuthz` throws, catch path returns 4xx without going through controller / `evaluateConditionalRequest`, preventing old ETag `If-None-Match` from 304ing stale view after authorization revocation. E2E verifies 4xx is returned after changing auth/tenant after obtaining real ETag
  - **Docs**: Added 2 sections to `docs/SECURITY.md`: "HMAC-Based ETag", "Policy Revocation & Cache Integrity". Added "Policy Propagation Delay & HTTP Cache Integrity" section to `docs/AUTH.md` (PolicyService cache TTL: 60s). Added `ETAG_HMAC_SECRET` to `docs/ENV.md` / `infrastructure/template.yaml`

### 2026-04-28
- **Security Enhancement**: Security Audit Group 1 — Immediate Cache-Control / ETag hardening (#1055)
  - **#1047: Prevent shared cache contamination** — Changed data endpoint `Cache-Control` from `no-cache` to `private, no-cache`. RFC 7234 §5.2.2.6 `private` prohibits storage in CloudFront / intermediate proxies / ISP proxies, allowing only browser private cache
  - **#1051: Prevent cross-tenant ETag collision** — Added `Fiware-Service` + `Fiware-ServicePath` to `deriveEtagScope(event)` seed. Guarantees ETag values differ between tenants / sub-tenants even through broken intermediate caches. `Authorization` / `X-Api-Key` not included in seed (tenant seed is sufficient as authorization boundary)
  - **Tests**: Added 4 scope verification cases to cache-control middleware unit test. Added `@issue-1047` 3 scenarios and `@issue-1051` 3 scenarios to `http-cache-control.feature`
  - **Docs**: Reflected `private, no-cache` policy and tenant-scoped ETag in `docs/API.md`, `docs/API_NGSIV2.md`, `docs/API_NGSILD.md`, `docs/INSTRUCTION.md`, `docs/SECURITY.md`

### 2026-04-27
- **Security / Bug Fix**: Fixed 4 bugs detected in HTTP cache control audit (#1054)
  - **B-1: Different body for different Accept but same ETag** — Weak validator violation (RFC 7232 §2.3.2): body clearly differs for `Accept: application/json` (257B) vs `application/ld+json` (476B with `@context`) but ETag was identical. Confirmed cross-Accept 304 from shared cache causing clients to replay wrong format body
  - **B-2: Empty list ETag collision between different endpoints** — `/v2/subscriptions` and `/ngsi-ld/v1/csourceRegistrations` etc. had same ETag when both empty (count=0). Sending subscription ETag to csourceRegistrations `If-None-Match` returned 304
  - **B-3: HEAD method returning 405** — RFC 7231 §4.3.2 violation. HEAD MUST be supported for GET-supporting resources
  - **B-4: temporal endpoint outside cache control middleware scope** — `/ngsi-ld/v1/temporal/entities` series was returning without `Cache-Control` or `Vary`
  - **Fix implementation**: Added `deriveEtagScope(event)` to `cache-control.middleware.ts`, mixed `path + Accept` into ETag computation seed to batch resolve B-1 / B-2. Changed `createListEtagBuilder(scope)` / `generateEntityEtag(scope, modifiedAt)` signatures. HEAD requests fall back internally to GET, suppressing final body with `addCorsHeaders` wrapper. Applied `applyCachePolicy('data')` to 4 GET paths in `temporal.controller.ts`
  - **Tests**: Added 11 scope verification cases to cache-control middleware unit test. Added 7 scenarios for B-1 / B-2 / B-3 / B-4 to `http-cache-control.feature`. Rewrote `head-requests.feature` to expect 200 (verify HEAD operates equivalent to GET)
  - **Docs**: Added Temporal class, ETag scope (path + Accept) explanation, HEAD support note to `docs/API.md`

## [0.4.0] — 2026-04-27

### 2026-04-27
- **Feature**: SDK client cache Phase A — Added in-memory cache + ETag/304 auto-handling + request deduplication + ETag-based `poll()` API to `@geolonia/geonicdb-sdk` (#1043)
  - `src/sdk/cache.ts` — `SdkCache` (LRU, `maxEntries` limit, keys by URL+method, holds `etag` / `lastModified` / `data` / `headers`)
  - `src/sdk/auth.ts` `request()` — For GET / HEAD, auto-adds `If-None-Match` / `If-Modified-Since` via cache; on 304 transparently returns cached body as 200. Re-reflects updated validators from 304 to cache
  - Added dedup to bundle multiple in-flight requests to same path into one
  - `src/sdk/index.ts` — Added new `db.poll(params, { interval, onData, onNoChange, onError })`. Zero transfer when ETag unchanged. Stop with `handle.stop()`. Input validation for `interval`
  - Auto-invalidates cache on WebSocket `entityCreated` / `entityUpdated` / `entityDeleted` receive
  - Auto-discards cache + in-flight dedup on auth context (`login()` / `setCredentials()` / `logout()`) switch — cross-user leakage protection
  - Added `cache` / `cacheMaxEntries` to `GeonicDBOptions`, added `cacheHit` / `cacheMiss` / `cacheInvalidated` to `GeonicDBEventMap`
- **Chore**: Batch update of 12 Dependabot PRs
  - npm: `@cucumber/cucumber`, `eslint`, `mongodb`, `@opentelemetry/*`, `typescript-eslint`, `@aws-sdk/*` (9 packages)
  - GitHub Actions: `docker/setup-qemu-action` v3→v4, `docker/setup-buildx-action` v3→v4, `docker/login-action` v3→v4, `docker/metadata-action` v5→v6, `docker/build-push-action` v6→v7
- **Fix**: Entity-level XACML authorization check (`checkEntityOwnership`) was missing from `GET /v2/entities/{entityId}` and `GET /ngsi-ld/v1/entities/{entityId}` (#1028)
  - Bug from XACML integration (#748) refactoring. Was being called for other operations (PATCH/PUT/DELETE/attribute retrieval) but absent for GET single entity
  - Impact: Entity-level policy (`resource.entityId` / `resource.entityOwner` based) was ignored for GET, risking 304 returning stale cache after authorization revocation when combined with Phase 2 cache control
  - Fix: Added `await this.checkEntityOwnership(...)` call in NGSIv2 / NGSI-LD `getEntity`. Added 2 E2E scenarios
- **Feature**: HTTP Cache Control Phase 2 — Added `Cache-Control` / `Vary` headers to responses, supporting endpoint-specific policies and client-driven `no-store` override (#989)
  - data API (entities / subscriptions / registrations / csourceSubscriptions): `Cache-Control: no-cache`
  - meta API (types / attributes): `Cache-Control: max-age=60, stale-while-revalidate=120`
  - All responses include `Vary: Fiware-Service, Fiware-ServicePath, Authorization, Accept` to ensure tenant isolation in edge caches like CloudFront
  - If client sends `Cache-Control: no-store` request header, overrides response `Cache-Control` with `no-store`
- **Feature**: HTTP Cache Control Phase 1 — Introduced `ETag` / `Last-Modified` to GET endpoints, supporting conditional requests (304 Not Modified) via `If-None-Match` / `If-Modified-Since` (#1026)
  - Targets: list / single retrieval of `/v2/entities`, `/v2/subscriptions`, `/v2/registrations`, `/ngsi-ld/v1/entities`, `/ngsi-ld/v1/subscriptions`, `/ngsi-ld/v1/csourceRegistrations`, `/ngsi-ld/v1/csourceSubscriptions`
  - List ETag: streaming hash of each element `id + modifiedAt` + total count digest (accurate weak validator per RFC 7232 §2.3.2)
  - Single ETag: hash of `modifiedAt`
  - RFC 7232 compliant evaluation via `fresh` module (weak ETag, wildcard, HTTP-date)
  - 304 response retains ETag / Last-Modified / Cache-Control / Vary / CORS / correlation ID / trace
- **Feature**: A2A (Agent-to-Agent) protocol Phase 1 support (#1025)
  - `GET /.well-known/agent-card.json` — Agent Card delivery (5 skills: entities, batch, temporal, config, admin)
  - `POST /a2a` — JSON-RPC 2.0 endpoint. Supports `message/send`, `tasks/get`, `tasks/list`, `tasks/cancel` methods
  - Task state management via MongoDB `a2aTasks` collection (lifecycle: submitted → working → completed/failed/canceled, TTL 30 days)
  - Mapped 5 existing MCP tools to A2A skills. Calls service layer directly
  - Leveraged `@a2a-js/sdk` v0.3.13 (`JsonRpcTransportHandler` + `DefaultRequestHandler`)

## [0.3.0] — 2026-04-24

### 2026-04-24
- **Feature**: Added `additionalProperties` field to custom data models. Setting to `false` enables strict mode rejecting attributes not defined in the model. Default is `true` (maintains natural NGSI-LD behavior) (#1007)
- **Feature**: Introduced typed error classes to SDK. Added `GeonicDBError` base class and `AuthenticationError`, `AuthorizationError`, `NotFoundError`, `ConflictError`, `ValidationError`, `RateLimitError`, `NetworkError`. Can determine error type with `instanceof` (#1008)
- **Feature**: Added `entity` field to SDK WebSocket events (`entityCreated`/`entityUpdated`/`entityDeleted`). Directly retrieve complete NGSI-LD entity object built from `id` + `type` + `data` (#1009)
- **Feature**: Added `debug` option to SDK. When enabled, logs HTTP requests/responses, WebSocket connections/events, and token refreshes to console (#1010)

### 2026-04-23
- **Feature**: Cross-protocol entity creation for ReactiveCore Rules (#1004)
  - Added `protocol` field to `createEntity` / `updateAttribute` / `deleteAttribute` actions (enables operations crossing NGSIv2 ↔ NGSI-LD boundary)
  - Added `servicePath` / `scope` fields to `createEntity` (control target hierarchy path)
  - Auto-mapping between servicePath ↔ scope (NGSIv2 `/sensors` → NGSI-LD `["/sensors"]`)
  - Added template variables `${trigger.protocol}`, `${trigger.servicePath}`, `${trigger.scope}`, `${trigger.service}`
- **Improve**: Added custom responses to WAF custom rules (RateLimitPerIP, SizeRestrictionBody10MB). Returns application-compatible JSON error body and appropriate HTTP status codes (429/413) (#986)
- **Feature**: Added WAF logging configuration. Records only BLOCK/COUNT actions, enabling tracing of block causes from managed rules (#986)

### 2026-04-21
- **Fix**: Fixed issue where `SizeRestrictionBody10MB` WAF rule's `OversizeHandling: MATCH` caused all requests over 8KB to return 403 Forbidden (#983)

### 2026-04-18
- **Breaking**: NGSIv2 and NGSI-LD entity separation and spec compliance (#966)
  - **Protocol-based entity separation**: Entities created in NGSIv2 accessible only from NGSIv2, entities created in NGSI-LD accessible only from NGSI-LD
  - Fixed to ignore `Fiware-ServicePath` header in NGSI-LD API (ETSI GS CIM 009 spec compliance)
  - Maintained servicePath and scope as independent concepts
  - Added NGSIv2 `servicePath` built-in attribute (retrievable with `?attrs=servicePath`)
  - Existing entities (without `protocol` field) treated as NGSI-LD

### 2026-04-14
- **Release**: SDK v0.2.0 — Added `count()` and `requestRaw()` methods (#928)
- **Change**: Changed SDK license from AGPL-3.0 to MIT (main product remains AGPL-3.0) (#942)
- **Remove**: Removed built-in SDK delivery endpoints (`/sdk/v1/geonicdb.js`, `/sdk/v1/geonicdb.d.ts`). Unified to obtain from npm / unpkg CDN (#942)

### 2026-04-10
- **Fix**: Scoped unique indexes to tenant — policies, policySets, apiKeys, oauthClients, rules IDs now unique within tenant. Same ID can be used across different tenants (#896)
- **Feature**: Significantly expanded NGSI-LD query parameters in MCP tools (#898)
  - `entities` tool: Added `idList`, `idPattern`, `orderBy`, `orderDirection`, `sysAttrs`, `pick`, `omit`, `scopeQ`, `lang`, `geoproperty`, `spatialId`, `spatialIdDepth`
  - `batch` tool `query` action: Added `orderBy`, `orderDirection`, `sysAttrs`
  - Added `sysAttrs` (`createdAt`/`modifiedAt` output) and `distance` output to `entityToKeyValues`
  - Support descending sort with `!` prefix in `orderBy`
  - Added CSV parameter empty element filtering
  - Unified MCP tools to NGSI-LD (removed NGSIv2-specific parameters `mq`, `typePattern`)

### 2026-04-09
- Rewrote SDK in TypeScript, publishable as npm package `@geolonia/geonicdb-sdk`
- Added convenience methods for Types/Attributes Discovery, Temporal API, Batch Operations (#832)
- Fixed bug where `expiresIn: 0` in `setCredentials()` was ignored (#876)

### 2026-04-08
- **Feature**: Improved custom data model JSON-LD `@context` URI (#858)
  - Added `@context` field to `propertyDetails` (enables specifying existing vocabulary URLs)
  - Migrated auto-generated URI from URN → URL (`https://geonicdb.geolonia.com/vocab/{tenantId}/{propertyName}`)
  - Made attribute URI independent from entity type, reusable within tenant
  - Added schema.org vocabulary suggestion instructions to MCP tools / llms.txt / openapi.json

### 2026-04-07
- **Fix**: Auto-recovery from index initialization failure when invalid GeoJSON data exists — isolates problematic entities and rebuilds `2dsphere` index (#857)
- **Fix**: Fixed issue where WAF `EC2MetaDataSSRF_BODY` rule falsely detected `localhost` URLs in `allowedOrigins` as SSRF and blocked them (#848)
- **Fix**: Fixed issue where WAF `CrossSiteScripting_BODY` rule falsely detected URLs in `allowedOrigins` as XSS causing 403 on API key creation (#846)

### 2026-04-05
- **Breaking**: Deprecated `onTokenRefresh(callback)` and unified to `on('tokenRefresh', cb)` event (#831)
- **Change**: Changed `request()` to return error-checked + JSON-parsed value (raw Response → `Promise<Object|string|null>`) (#831)
- **Feature**: Added `GET /sdk/v1/geonicdb.d.ts` endpoint — delivers TypeScript type definitions (#831)
- **Docs**: Documented that specifying Bearer + refreshToken in `setCredentials()` completely bypasses DPoP/PoW (#831)

### 2026-04-04
- **Feature**: Added public API methods to JavaScript SDK — eliminating dependency on internal methods (#830)
  - `setCredentials()`: Inject external authentication token (Bearer JWT session etc.)
  - `onTokenRefresh(callback)`: Register callback on token refresh
  - `request(method, path, body)`: Authenticated generic API request
  - `reconnect()`: Force WebSocket reconnection
  - `isConnected()`: Check WebSocket connection state
  - Added WebSocket lifecycle events: `connected`, `disconnected`, `reconnecting`
  - Embedded JSDoc type definitions at SDK file header — AI coding assistants can automatically understand all APIs

### 2026-04-01
- **Fix**: Fixed issue where WAF `SizeRestrictions_BODY` rule returned 403 Forbidden for request bodies over 8KB (#813)
  - Excluded `SizeRestrictions_BODY` from `AWSManagedRulesCommonRuleSet`
  - Added custom 10MB body size limit rule as alternative (matches API Gateway REST API limit)

### 2026-03-25
- **Feature**: Added API key rotation with `POST /me/api-keys/{keyId}/refresh` & `POST /admin/api-keys/{keyId}/refresh` (#798)
- **Breaking**: Removed `keyPrefix` field from `ApiKeyPublic` response (#798)
- **Breaking**: Changed `keyId` format for new API keys from `gdb_` + UUID to plain UUID (existing keys maintained with backward compatibility) (#798)
- **Change**: Added `key: "******"` masked display to API key list/detail responses (#798)
- **Perf**: Parallelized cold start initialization — up to 1000ms reduction (#775)
  - Parallel execution of `resolveJwtSecret()` and `getMongoClient()` with `Promise.all` in `handlers/api/index.ts`
  - Changed Secrets Manager resolution (~100-500ms) and MongoDB connection establishment (~500-1000ms) from sequential to parallel
- **Security**: Fixed TOCTOU race condition in `updatePolicy` with Optimistic Locking (#784) (#793)
  - Added `version: number` field to `Policy`/`PolicyDocument`/`PolicyPublic`
  - Added version filter to `PolicyRepository.updatePolicy()` (`version` match check via `findOneAndUpdate`)
  - Returns `ConflictError` (409) on version mismatch
- **Security**: Prohibited `permit-overrides` combining algorithm for non-`super_admin` roles (defense in depth) (#785) (#793)
  - Added `actorRole` parameter to `validateCombiningAlgorithm()`
  - `tenant_admin`/`user` specifying `permit-overrides` returns `ForbiddenError` (403)

### 2026-03-24
- **Perf**: Eliminated duplicate tenant data fetch (#776)
  - Fixed `handlers/api/index.ts` request body size check to update `tenantData` directly
  - Reduced 2 `TenantRepository.getByName()` calls (body check + response size check) to 1 when rate limiting disabled and request body present
- **Perf**: Added cache for `policyId`-bound policies (#777)
  - Added `getPolicy/setPolicy` methods to `PolicyCache` (TTL: 60 seconds)
  - Reduced MongoDB round-trips in auth flow for tenants with custom policies
- **Perf**: Enabled API Gateway gzip compression (MinimumCompressionSize: 1024) (#791)
  - Auto gzip compression for responses over 1KB — 60-75% transfer reduction for entity lists etc.
- **Perf**: Migrated Lambda architecture to ARM64 (Graviton2) (#791)
  - Unified all Lambda functions to arm64 — approximately 20% CPU processing speed improvement
- **Perf**: Increased Lambda memory size from 256MB to 512MB (#791)
  - Doubled CPU allocation, accelerating JSON serialization / MongoDB queries / XACML evaluation
- **Perf**: Enabled esbuild Minify to reduce bundle size (#791)
  - Minified code bundles for all Lambda handlers — estimated 30-50% size reduction, cold start reduction
- **Security Fix**: Prohibited `string-regexp` matchFunction for `path` attribute (#788)
  - Fixed to return `ForbiddenError` when `matchFunction: 'string-regexp'` is specified for path attributes in both policy-level and rule-level within `validateNonEscalatingPolicy`
  - Prevents path prefix constraint bypass via regex (use `glob` instead)
- **Security Fix**: Added `minPriority` check to `policyId` validation when updating API Key (#788)
  - Fixed `ApiKeyService.updateKey()` to pass `ROLE_MIN_PRIORITY[actor.role]` to `validatePolicyId()`
  - Prevents `tenant_admin` privilege escalation by binding policies with priority < 10 to API Keys
- **Fix**: Fixed issue where `tenant_admin` could not delete their own policies via `DELETE /me/policies/{policyId}` (#790)
  - For `tenant_admin`, allow access when `createdBy` matches OR tenant scope matches (`tenantId` matches)
  - `tenant_admin` can also delete/update/retrieve old data (`createdBy: null`)
- **Fix**: Eliminated 400 errors from DPoP Nonce retry from browser console (#758)
  - Added `dpop_nonce` field to `POST /auth/nonce` response (RFC 9449 §8 compliant)
  - SDK uses pre-fetched `dpop_nonce` to send nonce-attached DPoP proof from the start
  - Avoids `400 use_dpop_nonce` handshake that occurred on first token acquisition after page load

### 2026-03-23
- **Feature**: Implemented `PATCH /me/api-keys/{keyId}` and `PATCH /me/oauth-clients/{clientId}` (#791)
  - Enables partial update of attributes for own API keys and OAuth clients
  - Updatable fields (API key): `name`, `allowedOrigins`, `policyId`, `rateLimit`, `dpopRequired`, `isActive`
  - Updatable fields (OAuth client): `name`, `description`, `policyId`, `isActive`
  - `policyId` binding checked `createdBy === actor.id` — only own policies allowed

### 2026-03-21
- **Breaking**: Changed API key and OAuth client fields (#759)
  - API key: Removed `allowedScopes`, `allowedEntityTypes`, `permissions` fields, added optional `policyId`
  - OAuth client: Renamed `clientName` to `name`, removed `allowedScopes`, added optional `policyId`
  - Deprecated auto-generated policies (`__apikey_*` prefix, `buildAutoPolicy`, `syncAutoPolicy`)
  - Can bind existing XACML policies to credentials via `policyId` (policy Target is bypassed for bound policy)
  - Falls back to tenant policy + role default when `policyId` not specified
- **Fix**: Fixed XACML Target multiple values for same `attributeId` to be evaluated as OR (#756)
  - Multiple `matchValue` within same `attributeId` evaluated as OR (any match)
  - AND (all must match) maintained between different `attributeId`s
  - Enables listing `POST` and `PATCH` in `actions` to allow multiple methods

### 2026-03-20
- **Feature**: Auto-generate XACML policy on API key creation (#749)
  - Just specifying `permissions` field (`read`/`write`/`create`/`update`/`delete`) auto-generates XACML policy
  - `write` is alias for `create` + `update` + `delete`
  - Auto-generates entity-type restricted policy in combination with `allowedEntityTypes`
  - Policy also deleted when API key is deleted
  - Unspecified `permissions` behaves same as before (default Deny)
- **Feature**: Added `servicePath` to XACML resource attributes (#750)
  - Enables using `Fiware-ServicePath` header value in policy evaluation
  - Enables access control for service path hierarchy with glob patterns (e.g., `/opendata/**`)
  - Also supports regex match (`string-regexp`)
- **Feature**: XACML authorization unification — integrated 5-layer authorization logic (#748)
  - Added default fallback policies per role: user (readonly), api_key (all Deny), anonymous (all Deny)
  - Deprecated entity-type middleware (`allowedEntityTypes` field remains in ApiKey model)
  - Completely removed tenant feature flags (`apiKeysEnabled`, `oauthClientsEnabled`, `anonymousAccessEnabled`)
  - Deprecated scope/resource-scope middleware (integrated into XACML policies)
  - **Breaking**: user role (no policy) Permit for GET only, api_key role (no policy) all Deny
  - **Breaking**: Unauthenticated requests return 403 instead of 401 (evaluated as anonymous via XACML)

### 2026-03-19
- **Fix**: Fixed 403 error returned for `api_key` role when policy not matched (#744)
  - When tenant only has policies for anonymous, `api_key` role requests were converting `NotApplicable` → `Deny`
  - Since `api_key` role is already restricted by scope-based access control (`allowedScopes` / `allowedEntityTypes`), changed to fall back to `Permit` when XACML policy not matched
  - Explicit `Deny` policies remain effective

### 2026-03-18
- **Feature**: Support tenant-level anonymous access policy (#730)
  - Added `anonymous` role, applying policy evaluation to unauthenticated requests
  - Opt-in control via tenant feature flag `anonymousAccessEnabled` (default: false)
  - Added `optionalAuth()` middleware: validates auth token if present, passes as anonymous actor if absent
  - Anonymous access is Deny unless explicitly Permitted by policy (fail-closed)
  - Tenant admins can define access control for `role=anonymous` via XACML policies
- **Fix**: Fixed SDK entity API path from NGSIv2 (`/v2/entities`) to NGSI-LD (`/ngsi-ld/v1/entities`) (#728)
  - Fixed paths for all CRUD methods (createEntity, getEntities, getEntity, updateEntity, deleteEntity)
  - Changed Content-Type / Accept headers to `application/ld+json`
  - Handle `detail` field in error responses (NGSI-LD format)
- **Fix**: Added DPoP headers to API Gateway-level CORS configuration (#726)
  - Added `DPoP` to `Cors.AllowHeaders` / `GatewayResponses` (4XX/5XX) in `template.yaml`
  - Enables DPoP transmission from browser even for preflight/error responses not reaching Lambda
- **Fix**: Added DPoP-related headers to CORS headers (RFC 9449) (#725)
  - Added `DPoP` to `Access-Control-Allow-Headers` (allows DPoP proof transmission from browser)
  - Added `DPoP-Nonce` to `Access-Control-Expose-Headers` (allows nonce reading in client JS)

### 2026-03-17
- **Breaking**: `write:X` scope no longer implicitly includes `read:X` (#723)
  - Enables preventing read access in write-only use cases like inquiry forms
  - `admin:X` → `read:X` / `write:X` inclusion maintained
  - Explicitly grant `read:X write:X` when both read and write are needed
- **Fix**: Added tenant existence check for specified `tenantId` on user creation/update (#722)
  - Returns 400 error when creating user with non-existent tenant ID
  - Same validation for tenant migration destination on user update (`null` change allowed)

### 2026-03-12
- **Fix**: Added tenant header (`NGSILD-Tenant` / `Fiware-Service`) format validation on login (issue #708) (#711)
  - Returns 400 error for invalid format header values
- **Fix**: Added tenant name format validation to Zod schema (issue #709) (#711)
  - Enforces `^[a-z0-9_]+$` in `POST /admin/tenants` and `PATCH /admin/tenants/{tenantId}`
  - Names containing uppercase / hyphens / spaces etc. return 400 error
- **Feat**: Support tenant specification via `NGSILD-Tenant` / `Fiware-Service` headers on login (issue #710) (#711)
  - Priority: `body.tenantId` > `NGSILD-Tenant` header > primary tenant
  - Resolves tenant by name from header value (400 error if not found)

### 2026-03-10
- **Feat**: DPoP (Demonstration of Proof-of-Possession) token binding (#707)
  - RFC 9449 compliant: Token ownership proof via ECDSA P-256 key pair
  - DPoP proof-bearing token exchange at `/oauth/token` → `token_type: "DPoP"` + JWT `cnf.jkt` binding
  - DPoP proof validation per API request (`htm`/`htu`/`ath` checks)
  - `dpopRequired` API key flag: rejects token exchange without DPoP proof
  - SDK: Non-extractable key pair generation via `crypto.subtle`, automatic proof attachment
  - WebSocket: Post-Connect DPoP binding (`dpop_bind` message)
  - DPoP-Nonce (RFC 9449 §8): Pre-compute prevention via server-issued nonce. Stateless HMAC method (TTL: 300s)
  - `use_dpop_nonce` error code + `DPoP-Nonce` response header auto-retry flow
  - Bearer fallback: Non-DPoP-supporting clients work with traditional Bearer tokens

### 2026-03-09
- **Fix**: Changed `tenantId` to required validation in `POST /admin/api-keys` (#704)
  - Returns 400 error when super_admin creates key without `tenantId`
  - Rejects `null` / empty string at schema level (auto-set from session for `tenant_admin`)
  - Added `tenantId` required check for super_admin in service layer

### 2026-03-08
- **Feat**: JS SDK + API key token exchange endpoint (#689)
  - `POST /auth/nonce`: Nonce + Proof of Work challenge issuance (bound to API key + Origin)
  - `POST /oauth/token` (`grant_type=api_key`): API key → session JWT exchange
  - `GET /sdk/v1/geonicdb.js`: Browser JavaScript SDK delivery
  - Multi-layer security: Origin validation → HMAC Nonce → PoW → short-lived JWT (1h)
- **Fix**: Fixed bug where API key created with `allowedOrigins: []` (empty array) was completely unusable (issue #678) (#687)
  - Added `.min(1)` validation to both Create/Update schemas
  - Use `["*"]` to allow all origins
- **Feat**: `allowedEntityTypes` runtime enforcement for API keys (#688)
  - Validates allowed types on entity creation, retrieval, update, deletion
  - Auto-injects `type` filter on list retrieval
  - Batch validates all entity types in batch operations
  - Supports both NGSIv2 and NGSI-LD APIs

### 2026-03-07
- **BREAKING**: Restricted `super_admin` role permissions to platform management operations (`/admin/*`, `/auth/*`) only (#674)
  - Data APIs (`/v2/*`, `/ngsi-ld/*`, `/catalog*`, `/rules*`) return 403 Forbidden
  - MCP tool data operations also rejected
  - Anonymous super_admin when `AUTH_ENABLED=false` maintains backward compatibility
- **Feat**: Added API key authentication infrastructure (`/admin/api-keys`, `/me/api-keys`) (#676)
- **Feat**: Added tenant-level feature flags (`features.apiKeysEnabled`, `features.oauthClientsEnabled`) (#676)
- **Feat**: Support authentication via `X-Api-Key` header (#676)
- **BREAKING**: Deprecated `OAUTH_ENABLED` environment variable (OAuth always enabled when `AUTH_ENABLED=true`) (#676)

### 2026-03-06
- **Fix**: Fixed `/me` endpoint to return anonymous user info when auth disabled (#663)
- **Feat**: Support count-only query with combination of `limit=0` and `count` (#664)
- **Feat**: Added entity type auto-extraction to XACML AuthzRequest (#665)
  - PIP extension: Auto-extracts entityType from `?type=` query parameter or `type`/`@type` field in request body
  - Path-level authorization (`requireAuthz`) also enables entity type-based access control
  - E2E tests added: write denial / read denial scenarios by entity type
- **Fix**: Made adding new attributes possible with `PATCH /entities/{id}/attrs` & added NGSI-LD orderBy tests (#666)
- **Feat**: XACML entity-level ownership control (#650)
  - Added `createdBy` field to `EntityDocument` (records entity creator)
  - PIP (Policy Information Point) extension: Pass entity context (`entityId`/`entityType`/`entityOwner`) to `buildAuthzRequest`
  - PDP (Policy Decision Point) extension: Added resource attribute matching for `entityId`/`entityType`/`entityOwner`
  - Template variable expansion for `${subject.userId}` etc. (simplified XACML AttributeDesignator equivalent implementation)
  - Added `requireEntityAuthz` helper function (entity-level PEP)
  - Backward compatible: all fields optional, no impact on existing policies / entities

### 2026-03-05
- **Feat**: OAuth Client Credentials self-service for users (#642)
  - `POST /me/oauth-clients` — Create own OAuth client (secret returned only at creation)
  - `GET /me/oauth-clients` — List clients created by self
  - `DELETE /me/oauth-clients/:id` — Delete own client
  - `POST /me/oauth-clients/:id/regenerate-secret` — Regenerate client secret
  - Max 5 clients per user, role-based scope restrictions (user role: resource scopes only)
  - Added `createdBy` field to `OAuthClient` (ownership tracking)

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
  - Added `HasSecondaryRegion` condition: use `AWS::DynamoDB::Table` when `SecondaryRegion=""`
  - Added single-region versions of 3 tables (DeploymentsTable, TokenInvalidationTable, UsageStatisticsTable)
  - Switch environment variables and IAM policy references with nested `!If`
- **Infra**: Added Staging parameter file (#572)
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
  - Applied to batch decryption in `entity.repository.ts`, `temporal.repository.ts`, `snapshot.repository.ts`
- **Feat**: Added runtime check for time-series aggregation requests on encrypted tenants (#579)
  - Detect encrypted tenant when `aggrMethod` parameter is specified and return 400 Bad Request
  - Alternative: fetch decrypted data from `temporalValues` endpoint and aggregate at application layer
- **BREAKING**: Changed entity ID unique constraint to `entityId` alone within tenant scope (#580)
  - Changed index from `(tenant, servicePath, entityId, entityType)` to `(tenant, servicePath, entityId)`
  - Creating entities with same ID but different type returns `409 AlreadyExists`
  - Batch Upsert matches by `entityId` only (type can be overwritten)
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
  - Enhanced health checks: added `region`, `regionRole` to `/health`, `/health/live`, `/health/ready`
  - Extended `/health/ready` for DynamoDB/EventBridge deep checks (for Route 53 failover)
  - Added HA options to MongoDB client: `readPreference`, `writeConcern`, `readConcern`, `retryWrites`
  - Auto-inject `sourceRegion` metadata in EventBridge events
  - Auto-disable Change Stream processor in secondary region
  - Secrets Manager integration (secure JWT secret/MongoDB URI management)
  - SAM template: `RegionRole` parameter, DynamoDB GlobalTable (3 tables), WAF, conditional resources
  - Route 53 failover stack (`infrastructure/template-route53.yaml`)
  - Failover automation Lambda + SNS notifications
  - Added dependencies: `@aws-sdk/client-secrets-manager`, `@aws-sdk/client-sns`
- **Feat**: Implemented cascade deletion of all related data on tenant deletion (#556)
  - Cascade delete tenant data from all 16 collections with `DELETE /admin/tenants/{tenantId}`
  - Deactivate-first pattern: automatically set tenant to `isActive: false` before deletion
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
  - Added npm override for `minimatch` to unify all instances to `^10.2.1`
  - ajv@6.12.6 (eslint devDependency) has no patch in 6.x series, dismissed as tolerable_risk

### 2026-02-20
- **Feat**: Resource-scoped tokens Phase 1 (#536)
  - Embed resource scopes in JWT for fine-grained access control at entity type/ID pattern/attribute/operation level
  - Added `resourceScopes` parameter to `POST /auth/login`
  - Added `resource_scopes` parameter to OAuth `POST /oauth/token`
  - Pre-check for write operations (`checkResourceScopes`): reject unauthorized entity writes with 403
  - Post-filter for read responses (`filterByResourceScopes`): exclude unauthorized entities/attributes
  - Backward compatible: no `resourceScopes` = full access as before
- **Feat**: Opened XACML policy management to tenant_admin (#531)
  - Opened `/admin/policies` and `/admin/policy-sets` to `tenant_admin`
  - Changed routing layer auth from `requireSuperAdminAuth` to `requireAdminAuth`
  - Safely restricted by existing tenant scope control in service layer (own tenant only)
  - `tenant_admin` can manage XACML policies for `user` role in own tenant
- **Feat**: Multi-tenant membership + tenant-scoped tokens (#527)
  - FIWARE Keyrock Organization model compliant: 1 user can belong to multiple tenants
  - Added `tenant_memberships` collection (`userId + tenantId` unique constraint)
  - Added 4 tenant membership management API endpoints (PUT/DELETE/GET members, GET user tenants)
  - Tenant-scoped login: added `tenantId` parameter to `POST /auth/login`
  - Auto-create membership on user creation, cascade delete on tenant/user deletion
  - Maintain single `tenantId` value in JWT, zero impact on existing authz middleware
- **Feat**: `tenant_admin` can perform user management (CRUD) within own tenant (#527)
  - Adopted permission delegation model equivalent to FIWARE Keyrock Organization Owner
  - Changed `/admin/users` path auth from `requireSuperAdminAuth` to `requireAdminAuth`
  - Safely restricted by existing permission checks in service layer (`checkCanCreateUser` etc.)
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
  - Fixed glob conversion logic in `policy.pdp.ts` from `/.*` to `(/.*)?`
- **Test**: Added 22 XACML security E2E test scenarios (`xacml-security.feature`)
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
  - Added ReDoS protection (`validateRegexPattern`) to Temporal/Federation regex patterns (#515)
