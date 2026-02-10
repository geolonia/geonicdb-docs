---
title: Status Codes
description: HTTP status codes and error response formats used across all Vela OS API endpoints.
outline: deep
---

# Status Codes

This page documents all HTTP status codes and error response formats used by Vela OS APIs.

## Success Responses

| Status Code | Description | Used By |
|-------------|-------------|---------|
| `200 OK` | Request succeeded | GET requests, login, some updates |
| `201 Created` | Resource created | POST creating entities, subscriptions, etc. |
| `204 No Content` | Success, no body | DELETE, PATCH, PUT operations |
| `207 Multi-Status` | Partial success (NGSI-LD batch) | Batch operations with mixed results |

### 201 Created — Location Header

When a resource is created, the `Location` header contains the URL of the new resource:

```text
HTTP/1.1 201 Created
Location: /v2/entities/urn:ngsi-ld:Room:001
```

## Client Errors

### 400 Bad Request

Invalid request syntax or validation errors.

| Scenario | Error Message |
|----------|---------------|
| Missing required field | `{field} is required` |
| Invalid JSON | `Invalid JSON` |
| Invalid entity ID | `Invalid entity id` |
| Invalid attribute value | `Invalid attribute value` |
| Invalid pagination parameter | `limit must be a valid integer` |
| Invalid geo-query | `Invalid georel value` |
| Invalid coordinates | Latitude/longitude out of range |

### 401 Unauthorized

Authentication error — credentials missing or invalid.

| Scenario | Error Message |
|----------|---------------|
| No Authorization header | `Authorization header required` |
| Invalid token | `Invalid token` |
| Expired token | `Token expired` |
| Invalid credentials | `Invalid credentials` |
| Deactivated user | `User is deactivated` |
| Deactivated tenant | `Tenant is deactivated` |

### 403 Forbidden

Authorization error — authenticated but lacking permissions.

| Scenario | Error Message |
|----------|---------------|
| Insufficient role | `Forbidden` |
| IP restriction | `Access denied from this IP` |
| Cross-tenant access | `Access denied to this tenant` |
| XACML policy denial | `Access denied by policy` |

### 404 Not Found

Resource does not exist.

| Scenario | Error Message |
|----------|---------------|
| Entity not found | `Entity not found` |
| Subscription not found | `Subscription not found` |
| Attribute not found | `Attribute not found` |
| User not found | `User not found` |
| Tenant not found | `Tenant not found` |
| Policy not found | `Policy {policyId} not found` |

### 405 Method Not Allowed

HTTP method not supported for the endpoint. The response includes an `Allow` header listing permitted methods.

### 409 Conflict

Resource conflict.

| Scenario | Error Message |
|----------|---------------|
| Entity already exists | `Entity already exists` |
| Email already exists | `Email already exists` |
| Tenant name taken | `Tenant name already exists` |
| Multiple entities match | `More than one entity matches the query` |

### 411 Content-Length Required

`Content-Length` header is required for the request.

### 413 Request Entity Too Large

Request body exceeds the size limit.

### 415 Unsupported Media Type

Invalid `Content-Type` header.

| API | Expected Content-Type |
|-----|-----------------------|
| NGSIv2 | `application/json` |
| NGSI-LD | `application/ld+json` or `application/json` |

## Server Errors

### 500 Internal Server Error

Unexpected server error.

### 502 Bad Gateway

Federation error — context provider returned an error or is unreachable.

| Scenario | Error Message |
|----------|---------------|
| Connection failed | `Failed to connect to context provider` |
| Provider error | `Context provider returned error` |

### 503 Service Unavailable

Service is not ready (e.g., JSON-LD context unavailable).

### 504 Gateway Timeout

Context provider request timed out.

## Error Response Formats

### NGSIv2 Format

```json
{
  "error": "BadRequest",
  "description": "Invalid entity id",
  "details": {}
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `error` | string | Yes | Error code |
| `description` | string | Yes | Error description |
| `details` | object | No | Additional error details |

### NGSI-LD Format (RFC 7807 ProblemDetails)

```json
{
  "type": "https://uri.etsi.org/ngsi-ld/errors/InvalidRequest",
  "title": "Invalid Request",
  "status": 400,
  "detail": "Invalid entity id"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | Error type URI (ETSI NGSI-LD spec) |
| `title` | string | Yes | Error title |
| `status` | integer | Yes | HTTP status code |
| `detail` | string | Yes | Error description |

### NGSI-LD Error Types

| Error Type URI | Status | Description |
|----------------|--------|-------------|
| `https://uri.etsi.org/ngsi-ld/errors/InvalidRequest` | 400 | Invalid request |
| `https://uri.etsi.org/ngsi-ld/errors/ResourceNotFound` | 404 | Resource not found |
| `https://uri.etsi.org/ngsi-ld/errors/AlreadyExists` | 409 | Resource already exists |
| `https://uri.etsi.org/ngsi-ld/errors/OperationNotSupported` | 403 | Operation not supported |
| `https://uri.etsi.org/ngsi-ld/errors/MethodNotAllowed` | 405 | Method not allowed |
| `https://uri.etsi.org/ngsi-ld/errors/LdContextNotAvailable` | 503 | JSON-LD context unavailable |

### OAuth 2.0 Format (RFC 6749)

The `/oauth/token` endpoint returns RFC 6749 error format:

```json
{
  "error": "invalid_client",
  "error_description": "Client authentication failed"
}
```

| Error Code | Description |
|------------|-------------|
| `invalid_request` | Missing required parameter or invalid value |
| `invalid_client` | Client authentication failed |
| `invalid_grant` | Grant is invalid or expired |
| `unauthorized_client` | Client not authorized for this grant type |
| `unsupported_grant_type` | Grant type not supported |
| `invalid_scope` | Requested scope is invalid or not allowed |

## Endpoint Status Code Summary

### NGSIv2 Entity API

| Endpoint | Success | Errors |
|----------|---------|--------|
| `GET /v2/entities` | 200 | 400, 401 |
| `POST /v2/entities` | 201 | 400, 401, 409, 415 |
| `GET /v2/entities/{id}` | 200 | 400, 401, 404 |
| `DELETE /v2/entities/{id}` | 204 | 401, 404 |
| `PATCH /v2/entities/{id}/attrs` | 204 | 400, 401, 404, 415 |
| `POST /v2/entities/{id}/attrs` | 204 | 400, 401, 404, 415 |
| `PUT /v2/entities/{id}/attrs` | 204 | 400, 401, 404, 415 |

### NGSI-LD Entity API

| Endpoint | Success | Errors |
|----------|---------|--------|
| `GET /ngsi-ld/v1/entities` | 200 | 400, 401, 405 |
| `POST /ngsi-ld/v1/entities` | 201 | 400, 401, 405, 409, 415 |
| `GET /ngsi-ld/v1/entities/{id}` | 200 | 400, 401, 404 |
| `DELETE /ngsi-ld/v1/entities/{id}` | 204 | 401, 404 |
| `PATCH /ngsi-ld/v1/entities/{id}` | 204 | 400, 401, 404, 415 |

### NGSI-LD Batch API

| Endpoint | Success | Errors |
|----------|---------|--------|
| `POST /ngsi-ld/v1/entityOperations/create` | 201 (207) | 400, 401, 415 |
| `POST /ngsi-ld/v1/entityOperations/upsert` | 204 (207) | 400, 401, 415 |
| `POST /ngsi-ld/v1/entityOperations/update` | 204 (207) | 400, 401, 415 |
| `POST /ngsi-ld/v1/entityOperations/delete` | 204 (207) | 400, 401, 415 |
| `POST /ngsi-ld/v1/entityOperations/query` | 200 | 400, 401, 415 |

::: tip
Batch operations return `207 Multi-Status` when some items succeed and others fail. The response body contains details for each item.
:::

### Auth API

| Endpoint | Success | Errors |
|----------|---------|--------|
| `POST /auth/login` | 200 | 400, 401 |
| `POST /auth/refresh` | 200 | 400, 401 |
| `GET /me` | 200 | 401 |
| `POST /me/password` | 204 | 400, 401 |
| `POST /oauth/token` | 200 | 400, 401 |

### Admin API

| Endpoint | Success | Errors |
|----------|---------|--------|
| `GET /admin/tenants` | 200 | 400, 401, 403 |
| `POST /admin/tenants` | 201 | 400, 401, 403, 409 |
| `GET /admin/users` | 200 | 400, 401, 403 |
| `POST /admin/users` | 201 | 400, 401, 403, 409 |
| `GET /admin/policies` | 200 | 400, 401, 403 |
| `POST /admin/policies` | 201 | 400, 401, 403, 409 |

## Next Steps

- [Endpoints](/en/api-reference/endpoints) — Complete endpoint reference
- [Pagination](/en/api-reference/pagination) — Pagination specifications
