---
title: Pagination
description: Pagination specifications for Vela OS APIs — limit/offset parameters, total count headers, and Link headers for all list endpoints.
outline: deep
---

# Pagination

All list endpoints in Vela OS support pagination using `limit` and `offset` query parameters.

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Maximum number of items to return |
| `offset` | integer | Number of items to skip (0-indexed) |

## Defaults and Limits

### NGSIv2 / NGSI-LD / Catalog API

| Setting | Value | Notes |
|---------|-------|-------|
| Default limit | 20 | FIWARE Orion compatible |
| Default offset | 0 | |
| Maximum limit | 1000 | FIWARE Orion compatible |

### Admin API

| Setting | Value | Notes |
|---------|-------|-------|
| Default limit | 20 | |
| Default offset | 0 | |
| Maximum limit | 100 | Lower limit for management endpoints |

## Total Count Headers

The total count of matching items is returned via API-specific response headers:

| API | Header | When |
|-----|--------|------|
| NGSIv2 | `Fiware-Total-Count` | Always returned on list endpoints |
| NGSI-LD | `NGSILD-Results-Count` | Always returned |
| Admin API | `X-Total-Count` | Always returned |
| Catalog API | `X-Total-Count` | Always returned |
| Vector Tiles (GeoJSON) | `X-Total-Count` | Always returned |

## Link Headers (RFC 8288)

All paginated endpoints return [RFC 8288](https://www.rfc-editor.org/rfc/rfc8288) compliant `Link` headers for navigation:

| Relation | Condition | Description |
|----------|-----------|-------------|
| `next` | `offset + limit < total` | URL for the next page |
| `prev` | `offset > 0` | URL for the previous page |

```text
Link: <https://api.vela.geolonia.com/v2/entities?limit=10&offset=20>; rel="next",
      <https://api.vela.geolonia.com/v2/entities?limit=10&offset=0>; rel="prev"
```

- No `Link` header is returned when results fit in a single page.
- Existing query parameters (`type`, `q`, etc.) are preserved in Link URLs.
- The `prev` offset is clamped to 0 (never negative).

## Usage Examples

### Basic Pagination

```bash
# First 10 items
curl "https://api.vela.geolonia.com/v2/entities?limit=10&offset=0" \
  -H "Fiware-Service: demo"

# Next 10 items
curl "https://api.vela.geolonia.com/v2/entities?limit=10&offset=10" \
  -H "Fiware-Service: demo"
```

### NGSIv2 with Total Count

```bash
curl "https://api.vela.geolonia.com/v2/entities?limit=10&options=count" \
  -H "Fiware-Service: demo"

# Response header:
# Fiware-Total-Count: 150
```

### NGSI-LD Pagination

```bash
curl "https://api.vela.geolonia.com/ngsi-ld/v1/entities?limit=10&offset=0" \
  -H "Fiware-Service: demo"

# Response header:
# NGSILD-Results-Count: 150
```

### Admin API Pagination

```bash
curl "https://api.vela.geolonia.com/admin/users?limit=50&offset=0" \
  -H "Authorization: Bearer YOUR_API_KEY"

# Response header:
# X-Total-Count: 75
```

### Fetching All Results

```javascript
async function fetchAllEntities(baseUrl, tenant) {
  const limit = 1000;
  let offset = 0;
  let allEntities = [];
  let total = Infinity;

  while (offset < total) {
    const response = await fetch(
      `${baseUrl}/v2/entities?limit=${limit}&offset=${offset}&options=count`,
      { headers: { 'Fiware-Service': tenant } }
    );

    total = parseInt(response.headers.get('Fiware-Total-Count'), 10);
    const entities = await response.json();
    allEntities = allEntities.concat(entities);
    offset += limit;
  }

  return allEntities;
}
```

## Paginated Endpoints

### NGSIv2

| Endpoint | Max Limit | Count Header |
|----------|-----------|--------------|
| `GET /v2/entities` | 1000 | `Fiware-Total-Count` |
| `GET /v2/types` | 1000 | `Fiware-Total-Count` |
| `GET /v2/subscriptions` | 1000 | `Fiware-Total-Count` |
| `GET /v2/registrations` | 1000 | `Fiware-Total-Count` |
| `POST /v2/op/query` | 1000 | `Fiware-Total-Count` |
| `GET /v2/tiles/{z}/{x}/{y}.geojson` | 1000 | `X-Total-Count` |

### NGSI-LD

| Endpoint | Max Limit | Count Header |
|----------|-----------|--------------|
| `GET /ngsi-ld/v1/entities` | 1000 | `NGSILD-Results-Count` |
| `GET /ngsi-ld/v1/types` | 1000 | `NGSILD-Results-Count` |
| `GET /ngsi-ld/v1/attributes` | 1000 | `NGSILD-Results-Count` |
| `GET /ngsi-ld/v1/subscriptions` | 1000 | `NGSILD-Results-Count` |
| `GET /ngsi-ld/v1/csourceRegistrations` | 1000 | `NGSILD-Results-Count` |
| `GET /ngsi-ld/v1/csourceSubscriptions` | 1000 | `NGSILD-Results-Count` |
| `GET /ngsi-ld/v1/jsonldContexts` | 1000 | `NGSILD-Results-Count` |
| `POST /ngsi-ld/v1/entityOperations/query` | 1000 | `NGSILD-Results-Count` |
| `GET /ngsi-ld/v1/temporal/entities` | 1000 | `NGSILD-Results-Count` |
| `GET /ngsi-ld/v1/snapshots` | 1000 | `NGSILD-Results-Count` |
| `GET /ngsi-ld/v1/tiles/{z}/{x}/{y}.geojson` | 1000 | `X-Total-Count` |

### Admin API

| Endpoint | Max Limit | Count Header |
|----------|-----------|--------------|
| `GET /admin/users` | 100 | `X-Total-Count` |
| `GET /admin/tenants` | 100 | `X-Total-Count` |
| `GET /admin/policies` | 100 | `X-Total-Count` |
| `GET /admin/policy-sets` | 100 | `X-Total-Count` |
| `GET /admin/oauth-clients` | 100 | `X-Total-Count` |

### Catalog API

| Endpoint | Max Limit | Count Header |
|----------|-----------|--------------|
| `GET /catalog/datasets` | 1000 | `X-Total-Count` |
| `GET /catalog/ckan/package_list` | 1000 | `X-Total-Count` |
| `GET /catalog/ckan/current_package_list_with_resources` | 1000 | `X-Total-Count` |

## Validation Errors

Invalid pagination parameters return `400 Bad Request`:

| Condition | Error Message |
|-----------|---------------|
| Non-integer limit | `limit must be a valid integer` |
| Negative limit | `limit must not be negative` |
| Zero limit | `limit must be greater than 0` |
| Exceeds maximum | `limit exceeds maximum allowed value of {max}` |
| Non-integer offset | `offset must be a valid integer` |
| Negative offset | `offset must not be negative` |

::: tip
When `offset` exceeds the total count, an empty array is returned — this is not an error.
:::

## Next Steps

- [Endpoints](/en/api-reference/endpoints) — Complete endpoint reference
- [Status Codes](/en/api-reference/status-codes) — HTTP status codes and error formats
