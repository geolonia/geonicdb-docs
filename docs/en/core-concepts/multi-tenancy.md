---
title: Multi-Tenancy
description: Learn how Vela OS isolates data between tenants using Fiware-Service and Fiware-ServicePath headers.
outline: deep
---

# Multi-Tenancy

Vela OS supports multi-tenancy through HTTP headers, allowing complete data isolation between different tenants within a single deployment.

## Tenant Headers

| Header | Required | Default | Description |
|--------|----------|---------|-------------|
| `Fiware-Service` | Recommended | `default` | Tenant identifier (alphanumeric and underscores only) |
| `Fiware-ServicePath` | Recommended | `/` | Hierarchical path within a tenant |
| `Fiware-Correlator` | Optional | Auto-generated | Request correlation ID for tracing |

### Basic Usage

```bash
curl -X POST https://api.vela.geolonia.com/v2/entities \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -H "Fiware-ServicePath: /buildings/floor1" \
  -d '{
    "id": "urn:ngsi-ld:Room:001",
    "type": "Room",
    "temperature": { "type": "Number", "value": 23.5 }
  }'
```

## Tenant Isolation

Data under different `Fiware-Service` values is **completely isolated**:

- Entities created in tenant `smartcity` are invisible to tenant `production`.
- Subscriptions only trigger for events within the same tenant.
- Federation queries are scoped to the requesting tenant.

```bash
# Create entity in tenant "demo"
curl -X POST https://api.vela.geolonia.com/v2/entities \
  -H "Fiware-Service: demo" \
  -H "Content-Type: application/json" \
  -d '{"id": "Room1", "type": "Room", "temperature": {"type": "Number", "value": 22}}'

# This returns nothing — different tenant
curl https://api.vela.geolonia.com/v2/entities?type=Room \
  -H "Fiware-Service: production"

# This returns Room1 — same tenant
curl https://api.vela.geolonia.com/v2/entities?type=Room \
  -H "Fiware-Service: demo"
```

### Tenant Name Rules

- Automatically converted to lowercase.
- Only alphanumeric characters and underscores are allowed.
- If omitted, the `default` tenant is used.

## Service Path

The `Fiware-ServicePath` header provides hierarchical data organization **within** a tenant.

### Path Format

- Must start with `/`.
- Only alphanumeric characters and underscores per level.
- Maximum 10 levels deep, each level up to 50 characters.

```text
/                           # Root
/buildings                  # Level 1
/buildings/floor1           # Level 2
/buildings/floor1/room101   # Level 3
```

### Hierarchical Search

Use the `/#` suffix to search a path and all its descendants (**query operations only**):

```bash
# Search /buildings and all sub-paths
curl https://api.vela.geolonia.com/v2/entities \
  -H "Fiware-Service: smartcity" \
  -H "Fiware-ServicePath: /buildings/#"
```

### Multiple Paths

Use comma-separated paths to search multiple locations simultaneously (up to 10 paths, **query operations only**):

```bash
# Search both /park1 and /park2
curl https://api.vela.geolonia.com/v2/entities \
  -H "Fiware-Service: smartcity" \
  -H "Fiware-ServicePath: /park1, /park2"
```

### Default Behavior

| Operation | Header Omitted | Description |
|-----------|---------------|-------------|
| Query (GET) | `/` | Searches root path only |
| Write (POST/PUT/PATCH/DELETE) | `/` | Writes to root path |

::: warning
Write operations accept only a single, non-hierarchical path. Using `/#` or multiple paths in write operations will return an error.
:::

## NGSI-LD Tenant Header

NGSI-LD also supports tenant isolation. Vela OS accepts both header names:

| Header | API |
|--------|-----|
| `Fiware-Service` | NGSIv2 and NGSI-LD |
| `NGSILD-Tenant` | NGSI-LD only |

Both headers are equivalent — use whichever fits your client.

```bash
# NGSI-LD with Fiware-Service
curl https://api.vela.geolonia.com/ngsi-ld/v1/entities?type=Room \
  -H "Fiware-Service: smartcity"

# NGSI-LD with NGSILD-Tenant
curl https://api.vela.geolonia.com/ngsi-ld/v1/entities?type=Room \
  -H "NGSILD-Tenant: smartcity"
```

## Use Cases

### Environment Separation

Use tenants to isolate development, staging, and production data:

```bash
# Development
curl -H "Fiware-Service: dev" ...

# Staging
curl -H "Fiware-Service: staging" ...

# Production
curl -H "Fiware-Service: prod" ...
```

### Customer Isolation

For SaaS applications, assign each customer a separate tenant:

```bash
# Customer A
curl -H "Fiware-Service: customer_a" ...

# Customer B
curl -H "Fiware-Service: customer_b" ...
```

### Departmental Organization

Use service paths to organize data within a tenant by department or location:

```bash
# Create sensor data for different floors
curl -H "Fiware-Service: building_mgmt" \
     -H "Fiware-ServicePath: /floor1/sensors" ...

curl -H "Fiware-Service: building_mgmt" \
     -H "Fiware-ServicePath: /floor2/sensors" ...

# Query all sensor data across floors
curl -H "Fiware-Service: building_mgmt" \
     -H "Fiware-ServicePath: /#" ...
```

## Next Steps

- [NGSIv2 vs NGSI-LD](/en/core-concepts/ngsiv2-vs-ngsild) — Compare both APIs
- [Query Language](/en/core-concepts/query-language) — Learn query syntax for filtering entities
- [Endpoints](/en/api-reference/endpoints) — Common API specifications including headers
