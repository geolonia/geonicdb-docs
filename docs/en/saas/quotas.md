---
title: "Quotas & Plans"
description: "GeonicDB quota system and plans"
outline: deep
---
# GeonicDB Quota System

GeonicDB provides a comprehensive quota system for managing per-tenant rate limits and storage quotas.

## Overview

The quota system consists of three main components:

1. **Rate Limiting System** - API request limiting using a DynamoDB-based token bucket algorithm
2. **Storage Quota System** - Count limits on entities/subscriptions/registrations/temporal data based on MongoDB
3. **Monitoring & Management System** - Usage tracking, alert delivery, and management API

## Quota Plans

GeonicDB offers four standard plans and a custom plan:

### FREE Plan (for evaluation and development)

**Rate Limits:**
- Per minute: 60 requests (1 req/sec)
- Per hour: 1,000 requests
- Per day: 10,000 requests
- Burst allowance: 10 requests

**Storage Quotas:**
- Entities: 1,000
- Subscriptions: 10
- Registrations: 5
- Temporal data points: 10,000

**Limits:**
- Maximum request body size: 512KB
- Maximum response body size: 5MB
- Maximum batch operation size: 50

### STANDARD Plan (small-scale production)

**Rate Limits:**
- Per minute: 600 requests (10 req/sec)
- Per hour: 10,000 requests
- Per day: 100,000 requests
- Burst allowance: 100 requests

**Storage Quotas:**
- Entities: 10,000
- Subscriptions: 100
- Registrations: 50
- Temporal data points: 100,000

**Limits:**
- Maximum request body size: 1MB
- Maximum response body size: 10MB
- Maximum batch operation size: 100

### PREMIUM Plan (medium-scale production)

**Rate Limits:**
- Per minute: 3,000 requests (50 req/sec)
- Per hour: 50,000 requests
- Per day: 500,000 requests
- Burst allowance: 500 requests

**Storage Quotas:**
- Entities: 100,000
- Subscriptions: 500
- Registrations: 200
- Temporal data points: 1,000,000

**Limits:**
- Maximum request body size: 5MB
- Maximum response body size: 50MB
- Maximum batch operation size: 500

### ENTERPRISE Plan (large-scale production)

**Rate Limits:**
- Per minute: 12,000 requests (200 req/sec)
- Per hour: 200,000 requests
- Per day: 2,000,000 requests
- Burst allowance: 2,000 requests

**Storage Quotas:**
- Entities: 1,000,000
- Subscriptions: 2,000
- Registrations: 1,000
- Temporal data points: 10,000,000

**Limits:**
- Maximum request body size: 10MB
- Maximum response body size: 100MB
- Maximum batch operation size: 1,000

### CUSTOM Plan

A custom plan that allows any values to be configured. Set individually using the management API.

## Rate Limiting

### Token Bucket Algorithm

GeonicDB uses a token bucket algorithm operating on three sliding windows (minute/hour/day):

1. Tokens are consumed per request based on the endpoint weight
2. A request is permitted only when all three windows have sufficient tokens
3. Tokens are automatically refilled at the transition of each time window

### Endpoint Weights

Different endpoints are assigned different weights based on their processing cost:

| Operation | Weight | Example |
|------|------|-----|
| GET | 1 | `GET /v2/entities` |
| POST (single) | 3 | `POST /v2/entities` |
| PATCH/PUT | 2 | `PATCH /v2/entities/{id}` |
| DELETE | 2 | `DELETE /v2/entities/{id}` |
| Batch operations | 5 × count | `POST /v2/op/update` with 10 entities = 50 |
| Temporal operations | 2 | `POST /ngsi-ld/v1/temporal/entities` |

### Burst Allowance

Each plan has a burst allowance to handle sudden traffic spikes in short periods. This allows temporarily exceeding the limit.

### Response Headers

When rate limiting is enabled, responses from NGSIv2, NGSI-LD, and Catalog API endpoints include headers indicating the current rate limit status:

```http
X-RateLimit-Limit-Minute: 600
X-RateLimit-Remaining-Minute: 450
X-RateLimit-Reset-Minute: 1707648000

X-RateLimit-Limit-Hour: 10000
X-RateLimit-Remaining-Hour: 8500
X-RateLimit-Reset-Hour: 1707651600

X-RateLimit-Limit-Day: 100000
X-RateLimit-Remaining-Day: 95000
X-RateLimit-Reset-Day: 1707734400
```

### Behavior When Rate Limit Is Exceeded

When the rate limit is exceeded:

- **HTTP status code**: `429 Too Many Requests`
- **Retry-After header**: Number of seconds until the next request is permitted
- **Error message**: `{"error": "TooManyRequests", "description": "Rate limit exceeded"}`

### Public (Unauthenticated) Endpoint Rate Limit (#1075)

Public endpoints reachable without authentication are protected by a separate
IP-based token bucket independent of per-tenant `QUOTAS.PLANS`. This blocks
OAuth `client_id+secret` brute-force and DoS via heavy JSON generation
(`/openapi.json` etc.).

| Category | Endpoints | Per minute | Per hour | Per day | Burst |
|----------|-----------|-----------:|---------:|--------:|------:|
| `metadata` | `/openapi.json`, `/api.json`, `/tools.json`, `/llms.txt`, `/.well-known/ai-plugin.json`, `/.well-known/agent-card.json`, `/.well-known/ngsi-ld` | 30 | 300 | 1,000 | 10 |
| `oauth` (per IP) | `/oauth/token` | 20 | 100 | 500 | 5 |
| `oauth` (per `client_id`) | `/oauth/token` | 10 | 60 | 200 | 2 |
| `auth` | `/auth/refresh`, `/auth/nonce` | 30 | 200 | 1,000 | 5 |

Notes:

- `/auth/login` is **not** subject to this limit; it is protected by `LoginProtectionService` (email + IP based progressive lockout).
- `/health`, `/health/live`, `/health/ready`, `/version` are **not** subject to this limit (intended for health-check polling).
- When the bucket store (DynamoDB / MongoDB) is unavailable, the request is allowed through; we do not fail-close on infrastructure error to avoid taking the public surface offline.
- Defaults are centralised in `PUBLIC_RATE_LIMIT` in `src/config/defaults.ts`.

## Storage Quotas

### Resource Types

Quotas are configured for four types of resources:

1. **Entities** - Total number of NGSIv2/NGSI-LD entities
2. **Subscriptions** - Total number of active subscriptions
3. **Registrations** - Total number of context source registrations
4. **Temporal data points** - Total number of time-series data points

### Pre-Check

Storage quotas are checked **before** create operations:

- For batch operations, execution proceeds only when all entities fit within the quota
- If even one would exceed the quota, the entire operation is rejected (all-or-nothing)

### Response Headers

NGSIv2, NGSI-LD, and Catalog API endpoints include headers indicating the current storage usage:

```http
X-Storage-Quota-Entities-Used: 5000
X-Storage-Quota-Entities-Limit: 10000
X-Storage-Quota-Subscriptions-Used: 50
X-Storage-Quota-Subscriptions-Limit: 100
X-Storage-Quota-Registrations-Used: 25
X-Storage-Quota-Registrations-Limit: 50
X-Storage-Quota-TemporalDataPoints-Used: 50000
X-Storage-Quota-TemporalDataPoints-Limit: 100000
```

**Target endpoints**: These headers are returned by all endpoints of the NGSIv2, NGSI-LD, and Catalog APIs. Using the management API (`/admin/tenants/{tenantId}/quotas`) allows you to retrieve more detailed quota information. See [Authentication & Authorization](../reference/auth.md#quota-management) for details.

### Behavior When Storage Quota Is Exceeded

When the storage quota is exceeded:

- **HTTP status code**: `507 Insufficient Storage`
- **Error message**: Includes the resource type and current usage
- **Example**: `{"error": "InsufficientStorage", "description": "Entity quota exceeded (10000/10000)", "details": {"resourceType": "entities", "current": 10000, "limit": 10000}}`

## Monitoring and Alerts

### Usage Snapshots

The system periodically records usage snapshots to DynamoDB:

- Rate limit utilization (minute/hour/day)
- Storage resource utilization
- Timestamp and tenant information
- Retained for 90 days (TTL)

### Alert Thresholds

Each tenant has two alert levels:

- **Warning**: Default at 80% usage
- **Critical**: Default at 95% usage

### Alert Delivery

When a configured threshold is exceeded:

1. An alert message is recorded in the log
2. If a Webhook URL is configured, an alert is sent via HTTP POST
3. The same alert is not resent within 1 hour (debounce feature)

### Webhook Payload

```json
{
  "id": "rateLimit.perMinute.warning.tenant1#/",
  "tenantService": "tenant1#/",
  "alertType": "rateLimit",
  "resourceType": "perMinute",
  "severity": "warning",
  "message": "Rate limit perMinute usage is high (85%)",
  "currentValue": 510,
  "limitValue": 600,
  "utilizationPercent": 85,
  "timestamp": 1707645123456
}
```

## Management API

### Get Quota Information

```http
GET /admin/tenants/{tenantId}/quotas
```

**Response:**
```json
{
  "tenantId": "tenant-1",
  "tenantName": "tenant1",
  "quotaPlan": "STANDARD",
  "customQuotas": null,
  "alertThresholds": {
    "rateLimitWarning": 80,
    "rateLimitCritical": 95,
    "storageWarning": 80,
    "storageCritical": 95
  },
  "currentUsage": {
    "rateLimit": {
      "minute": { "limit": 600, "used": 150, "remaining": 450, "usagePercent": 25, "resetAt": 1707648000 },
      "hour": { "limit": 10000, "used": 1500, "remaining": 8500, "usagePercent": 15, "resetAt": 1707651600 },
      "day": { "limit": 100000, "used": 5000, "remaining": 95000, "usagePercent": 5, "resetAt": 1707734400 }
    },
    "storage": {
      "entities": { "used": 5000, "limit": 10000, "usagePercent": 50 },
      "subscriptions": { "used": 50, "limit": 100, "usagePercent": 50 },
      "registrations": { "used": 25, "limit": 50, "usagePercent": 50 },
      "temporalDataPoints": { "used": 50000, "limit": 100000, "usagePercent": 50 }
    }
  }
}
```

### Update Quota Settings

```http
PUT /admin/tenants/{tenantId}/quotas
```

**Request body:**
```json
{
  "quotaPlan": "PREMIUM",
  "alertThresholds": {
    "rateLimitWarning": 85,
    "rateLimitCritical": 98,
    "storageWarning": 85,
    "storageCritical": 98
  }
}
```

### Configure Custom Quotas

```http
PUT /admin/tenants/{tenantId}/quotas
```

**Request body:**
```json
{
  "quotaPlan": "CUSTOM",
  "customQuotas": {
    "rateLimit": {
      "perMinute": 1200,
      "perHour": 20000,
      "perDay": 200000,
      "burstAllowance": 200
    },
    "storage": {
      "maxEntities": 50000,
      "maxSubscriptions": 200,
      "maxRegistrations": 100,
      "maxTemporalDataPoints": 500000
    },
    "limits": {
      "maxRequestBodyBytes": 2097152,
      "maxResponseBodyBytes": 20971520,
      "maxBatchSize": 200
    }
  }
}
```

### Get Usage History

```http
GET /admin/tenants/{tenantId}/usage?startDate=2026-02-01&endDate=2026-02-10&limit=100
```

**Response:**
```json
{
  "tenantId": "tenant-1",
  "tenantName": "tenant1",
  "startDate": "2026-02-01",
  "endDate": "2026-02-10",
  "snapshots": [
    {
      "tenantService": "tenant1#/",
      "timestamp": 1707645123456,
      "date": "2026-02-10",
      "rateLimit": { ... },
      "storage": { ... }
    }
  ]
}
```

## Environment Variables

### SAM Template

```yaml
Parameters:
  RateLimitEnabled:
    Type: String
    Default: 'true'
    Description: Enable rate limiting for API requests

  QuotaAlertWebhookUrl:
    Type: String
    Default: ''
    Description: Webhook URL for quota violation alerts
```

### Environment Variables

- `RATE_LIMIT_ENABLED`: Enable/disable rate limiting (default: `true`)
- `RATE_LIMIT_TABLE_NAME`: DynamoDB rate limit table name
- `USAGE_STATS_TABLE_NAME`: DynamoDB usage statistics table name
- `QUOTA_ALERT_WEBHOOK_URL`: Webhook URL for alert delivery (optional)

## Access Control

### Permission Levels

- **super_admin**: Can view and modify quotas for all tenants
- **tenant_admin**: Can view and modify quotas for their own tenant
- **user**: No access to the quota management API

### Authentication

All quota management APIs require authentication:

```http
Authorization: Bearer <JWT_TOKEN>
```

## Best Practices

### Choosing a Quota Plan

1. **Development/Testing**: Start with the FREE plan
2. **Small-scale production**: STANDARD plan
3. **Medium-scale production**: PREMIUM plan
4. **Large-scale production**: ENTERPRISE plan
5. **Special requirements**: Configure individually with the CUSTOM plan

### Alert Configuration

- **Warning**: Threshold to consider expanding capacity (default 80%)
- **Critical**: Threshold requiring immediate action (default 95%)
- Configure a Webhook URL to receive real-time notifications

### Monitoring

- Check response headers regularly
- Analyze trends with the usage history API
- Monitor alert logs

## Troubleshooting

### 429 Too Many Requests

**Cause**: Rate limit exceeded

**Resolution**:
1. Wait the number of seconds specified in the `Retry-After` header
2. Reduce request frequency
3. Leverage batch operations to reduce the number of requests
4. Consider upgrading the plan

### 507 Insufficient Storage

**Cause**: Storage quota exceeded

**Resolution**:
1. Delete unnecessary entities/subscriptions/registrations
2. Shorten the retention period for temporal data
3. Consider upgrading the plan

### Quota Headers Not Displayed

**Cause**: Rate limiting may be disabled

**Resolution**:
1. Check the `RATE_LIMIT_ENABLED` environment variable
2. Check the SAM template parameters
3. Verify that the DynamoDB table is deployed correctly

## Input Validation Limits

GeonicDB enforces input length and count limits to prevent abuse and ensure system stability.

### Authentication & Login Protection

#### Per-Account Login Protection

Existing per-account brute-force protection (see [AUTH.md](../reference/auth.md)):

- Maximum failed login attempts per account: **5** within **15 minutes**
- Account lock duration: **15 minutes** after threshold is reached
- Progressive delay: Exponential backoff starting at **2 seconds** (2^(n-2))

#### Per-IP Login Protection (#900)

Prevents password spray attacks across multiple accounts from a single IP:

| Parameter | Value |
|-----------|-------|
| Maximum failed attempts per IP | **20** within **5 minutes** |
| IP lock duration | **15 minutes** |
| Record TTL | **1 hour** (auto-deleted) |

- **HTTP status**: `429 Too Many Requests` with `Retry-After: 900`
- Successful logins do NOT reset the IP counter (prevents timing-based enumeration)
- Error message: `"Too many failed login attempts from this IP. Please try again later."`

### Tenant Resource Limits

#### Users per Tenant (#901)

| Parameter | Default |
|-----------|---------|
| Maximum users per tenant | **100** |

- Checked on user creation only
- Per-tenant override via `tenant.settings.maxUsers`
- **HTTP status**: `400 Bad Request`
- Error message: `"User limit reached for this tenant (current: N, limit: M)"`

#### Policies per Tenant (#912)

| Parameter | Default |
|-----------|---------|
| Maximum policies per tenant | **50** |

- Per-tenant override via `tenant.settings.maxPolicies`
- **HTTP status**: `400 Bad Request`
- Error message: `"Policy limit reached for this tenant (current: N, limit: M)"`

#### Admin User Operations Rate Limit (#905)

Prevents create-delete cycle attacks on the Admin API:

| Parameter | Value |
|-----------|-------|
| Window | **10 minutes** |
| Maximum operations per window | **1,000** (create + delete combined) |

- Applied per tenant on `createUser` and `deleteUser`
- `super_admin` is exempt
- **HTTP status**: `429 Too Many Requests`
- Error message: `"Too many user management operations. Limit: 1000 per 10 minutes."`

### XACML Policy Input Limits (#912)

| Field | Max Length |
|-------|-----------|
| `policyId` / `policySetId` / `ruleId` | 256 characters |
| `description` | 2,000 characters |
| `attributeId` | 256 characters |
| `matchValue` | 2,000 characters |
| `expression` (condition) | 5,000 characters |
| `timezone`, `startTime`, `endTime` | 50 characters |
| IP/CIDR entry in `allowedIps` | 50 characters |

| Collection | Max Count |
|------------|-----------|
| Rules per policy | 100 |
| Conditions per rule | 50 |
| Policies per policy set | 100 |

### Email Address Validation (#903)

- Maximum length: **254 characters** (RFC 5321 compliance)
- Applied to: user creation, user update, login
- **HTTP status**: `400 Bad Request`

### Subscription Endpoint URI/URL (#913)

- Maximum length: **2,048 characters**
- Applied to: NGSI-LD `notification.endpoint.uri`, NGSIv2 `notification.http.url` / `notification.httpCustom.url` / `notification.mqtt.url`
- **HTTP status**: `400 Bad Request`

### Input Validation Limits (General)

GeonicDB enforces comprehensive input validation across all API endpoints. Exceeding any limit returns `400 Bad Request`.

#### String Length Limits

| Category | Example Fields | Max Length |
|----------|---------------|-----------|
| Entity ID | `entityId`, `id` | 256 |
| Entity Type | `type` | 256 |
| Attribute Name | `attrName`, attribute keys | 256 |
| Generic ID | `subscriptionId`, `registrationId`, `ruleId` | 256 |
| Name fields | `name`, `subscriptionName` | 256 |
| Description fields | `description` | 2,000 |
| URL fields | `endpoint`, `provider.http.url` | 2,048 |
| Query strings | `q`, `mq`, `scopeQ`, `csf` | 2,000 |
| Regex patterns | `idPattern`, `typePattern` | 200 |
| georel | `georel` | 100 |
| geometry | `geometry` | 50 |
| coords | `coords`, `coordinates` | 2,000 |
| orderBy | `orderBy` | 500 |
| options | `options` | 200 |
| lang | `lang` | 50 |
| scope | `scope` (string) | 500 |
| unitCode | `unitCode` | 50 |

#### Array Element Count Limits

| Array Field | Max Elements |
|------------|-------------|
| `attrs`, `pick`, `omit`, `expandValues` | 50 |
| `watchedAttributes` | 100 |
| `notification.attrs` / `exceptAttrs` | 100 |
| `subject.entities` / `entities` | 100 |
| Batch operation `entities` | 100 (MAX_BATCH_SIZE) |
| `propertyNames` / `relationshipNames` | 100 |
| `receiverInfo` / `notifierInfo` | 50 |
| `contextSourceInfo` | 50 |
| `operationGroup` | 20 |
| `scope` (array) | 20 |
| `@context` (array) | 10 |

#### Numeric Upper Bounds

| Field | Max Value |
|-------|-----------|
| `throttling` | 86,400 (24 hours, in seconds) |
| `timeout` | 30,000 (30 seconds, in ms) |
| `lastN` | 1,000 |

#### Header Validation

| Header | Max Length |
|--------|-----------|
| Bearer / DPoP token | 8,192 |
| Link (@context URL) | 2,048 |
| Fiware-ServicePath (per element) | 256 |
| Tenant name (Fiware-Service) | 64 |

#### Path Parameter Validation

Resource IDs in URL paths are also validated for length.

| Parameter | Max Length | Applicable APIs |
|-----------|-----------|-----------------|
| `entityId` | 256 | NGSIv2, NGSI-LD |
| `attrName` | 256 | NGSIv2, NGSI-LD |
| `subscriptionId` | 256 | NGSIv2, NGSI-LD |
| `registrationId` | 256 | NGSIv2, NGSI-LD |
| `instanceId` | 256 | NGSI-LD Temporal |
| `entityMapId` | 256 | NGSI-LD Entity Maps |
| `contextId` | 256 | NGSI-LD JSON-LD Contexts |
| `snapshotId` | 256 | NGSI-LD Snapshots |
| `ruleId` | 256 | Rules API |
| `typeName` | 256 | NGSIv2/NGSI-LD Types |
| `datasetId` | 256 | Catalog API |

#### AttributeValue Nesting Depth Limit

- Maximum depth: **10**
- Beyond the limit, only primitive types (string, number, boolean, null) are accepted
- **HTTP status**: `400 Bad Request` when nesting exceeds the limit

#### MQTT Notification Fields

| Field | Max Length |
|-------|-----------|
| `topic` | 1,024 |
| `user` / `passwd` | 256 |

#### HTTP Custom Notification Fields

| Field | Max Length |
|-------|-----------|
| Header key | 256 |
| Header value | 4,096 |
| Query string value | 2,048 |
| `payload` | 51,200 (50KB) |

#### Admin API Validation

| Field | Max Length / Value |
|-------|-------------------|
| Tenant `name` | 64 |
| Tenant `maxUsers` | 10,000 |
| Tenant `description` | 2,000 |
| Tenant `allowedServices` | 50 elements, each 256 chars |
| User `password` | 128 (also minimum 12) |
| Policy `priority` | 0–1,000 |
| Policy `subjects` / `resources` / `actions` array | 50 elements each |
| API key `policyId` / `tenantId` | 256 |
| API key origin | 2,048 |
| OAuth client `name` | 256 |
| OAuth client `description` | 2,000 |
| Path parameters (`tenantId`, `userId`, `policyId`, `keyId`, `clientId`) | 256 |

#### Auth & OAuth API Validation

| Field | Max Length |
|-------|-----------|
| Login `password` | 128 |
| Login `tenantId` | 256 |
| Refresh token | 8,192 |
| Password reset `token` | 2,048 |
| OAuth `scope` | 2,000 |
| OAuth `client_secret` | 512 |
| OAuth `nonce` / `proof` | 512 |

#### Custom Quota Upper Bounds

When configuring custom quotas via the Admin API, the following maximum values apply:

| Field | Max Value |
|-------|-----------|
| `rateLimit.perMinute` | 1,000,000 |
| `rateLimit.perHour` | 10,000,000 |
| `rateLimit.perDay` | 100,000,000 |
| `rateLimit.burstAllowance` | 100,000 |
| `storage.maxEntities` | 100,000,000 |
| `storage.maxSubscriptions` | 1,000,000 |
| `storage.maxRegistrations` | 1,000,000 |
| `storage.maxTemporalDataPoints` | 1,000,000,000 |
| `limits.maxRequestBodyBytes` | 100MB (104,857,600) |
| `limits.maxResponseBodyBytes` | 1GB (1,073,741,824) |
| `limits.maxBatchSize` | 10,000 |

#### Rules API Validation

| Field | Max Length / Value |
|-------|-------------------|
| Rule `name` | 256 |
| Rule `description` | 2,000 |
| Rule `priority` | 0–1,000 |
| Rule `cooldownSeconds` | 86,400 (24h) |
| Condition `attributeName` | 256 |
| Condition `pattern` | 200 |
| Condition `timezone` / `startTime` / `endTime` | 50 |
| Action `entityId` | 256 |
| Action `entityType` | 256 |
| Action `url` (webhook) | 2,048 |
| Action `message` | 2,000 |
| `conditions` / `actions` array | 50 elements each |
| `entityTypes` array | 100 elements |

#### Custom Data Models API Validation

| Field | Max Length / Value |
|-------|-------------------|
| Model `type` | 256 |
| Model `domain` | 256 |
| Model `description` | 2,000 |
| Property `valueType` | 256 |
| Property `description` | 2,000 |
| Validation `minLength` / `maxLength` | 10,000 |
| Validation `enum` array | 100 elements |

#### Catalog / CADDE / Vocabulary API Validation

| Field | Max Length |
|-------|-----------|
| Catalog `q` (keyword) | 2,000 |
| Catalog `id` (package/dataset) | 256 |
| CADDE query params (`type`, `id`, `q`) | Same as NGSI limits |
| Vocabulary `tenantId` | 64 |
| Vocabulary `term` | 256 |

#### MCP Admin Tools Validation

MCP tools enforce the same limits as the HTTP Admin API at the tool input layer:

| Field | Validation |
|-------|-----------|
| `email` | Valid email format, max 254 chars |
| `password` | 12–128 chars |
| `id` / `policyId` / `tenant` | Max 256 chars |
| `description` | Max 2,000 chars |
| `priority` | 0–1,000 |

All limit violations return:
- **HTTP status**: `400 Bad Request`
- **Error format**: `{ "error": "BadRequest", "description": "field exceeds maximum length of N" }`

### Storage Quota Fix: `/v2/op/update` (#902)

The storage quota check for batch operations (`/v2/op/update`) now correctly identifies entity-creation operations:

- **`append` / `appendStrict`**: Counted as entity creation — consumes storage quota
- **`update` / `delete` / `replace`**: NOT counted as entity creation — no storage quota impact

Previously, all `/v2/op/update` requests were incorrectly counted against the entity creation quota regardless of `actionType`.

## Related Documentation

- Development & Deployment Guide - Infrastructure setup
- [Authentication & Authorization](../reference/auth.md) - Tenant/user management, access control
