---
title: Orion to GeonicDB Migration Guide
description: Step-by-step guide for migrating from a self-hosted FIWARE Orion deployment to GeonicDB SaaS, covering API endpoints, authentication, subscriptions, and data migration.
outline: deep
---

# Orion to GeonicDB Migration Guide

This guide walks through migrating from a self-hosted **FIWARE Orion** (or Orion-LD) deployment to **GeonicDB SaaS**. Because GeonicDB is API-compatible with Orion, most applications can migrate by updating endpoint URLs and authentication configuration.

## Migration Overview

| Step | Action | Impact |
|------|--------|--------|
| 1 | Update API endpoint URLs | Low — configuration change only |
| 2 | Configure authentication | Medium — add Bearer token to requests |
| 3 | Migrate subscriptions | Medium — recreate with new endpoint |
| 4 | Migrate entity data | Variable — depends on data volume |
| 5 | Verify and cut over | Low — functional testing |

## Step 1: Update API Endpoints

Replace your Orion endpoint URLs with GeonicDB SaaS endpoints:

### NGSIv2

| Before (Orion) | After (GeonicDB SaaS) |
|----------------|-------------------|
| `http://orion:1026/v2/entities` | `https://api.geonicdb.geolonia.com/v2/entities` |
| `http://orion:1026/v2/subscriptions` | `https://api.geonicdb.geolonia.com/v2/subscriptions` |
| `http://orion:1026/v2/registrations` | `https://api.geonicdb.geolonia.com/v2/registrations` |
| `http://orion:1026/v2/types` | `https://api.geonicdb.geolonia.com/v2/types` |
| `http://orion:1026/v2/op/update` | `https://api.geonicdb.geolonia.com/v2/op/update` |
| `http://orion:1026/v2/op/query` | `https://api.geonicdb.geolonia.com/v2/op/query` |

### NGSI-LD

| Before (Orion-LD) | After (GeonicDB SaaS) |
|-------------------|-------------------|
| `http://orion-ld:1026/ngsi-ld/v1/entities` | `https://api.geonicdb.geolonia.com/ngsi-ld/v1/entities` |
| `http://orion-ld:1026/ngsi-ld/v1/subscriptions` | `https://api.geonicdb.geolonia.com/ngsi-ld/v1/subscriptions` |

## Step 2: Configure Authentication

GeonicDB SaaS requires authentication. Add the `Authorization` header to all requests:

```bash
# Before (Orion — no auth)
curl http://orion:1026/v2/entities

# After (GeonicDB SaaS — Bearer token)
curl https://api.geonicdb.geolonia.com/v2/entities \
  -H "Authorization: Bearer YOUR_API_KEY"
```

If you use `Fiware-Service` and `Fiware-ServicePath` headers for multi-tenancy, these continue to work as before:

```bash
curl https://api.geonicdb.geolonia.com/v2/entities \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Fiware-Service: my-tenant" \
  -H "Fiware-ServicePath: /sensors"
```

## Step 3: Migrate Subscriptions

Subscriptions from Orion cannot be transferred directly — they must be recreated on GeonicDB. The subscription format is compatible, so you can use the same payloads.

### Export Existing Subscriptions

```bash
# Export from Orion
curl http://orion:1026/v2/subscriptions | jq '.' > subscriptions.json
```

### Recreate on GeonicDB

```bash
# For each subscription in subscriptions.json
curl -X POST https://api.geonicdb.geolonia.com/v2/subscriptions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d @subscriptions.json
```

::: tip Notification URLs
Make sure your notification endpoints (webhook URLs) are accessible from the internet, since GeonicDB SaaS sends notifications from AWS infrastructure rather than your local network.
:::

## Step 4: Migrate Entity Data

### Small Datasets (< 10,000 entities)

For small datasets, use batch operations to export and re-import:

```bash
# Export from Orion (paginated)
curl "http://orion:1026/v2/entities?limit=1000&offset=0" > entities_batch1.json
curl "http://orion:1026/v2/entities?limit=1000&offset=1000" > entities_batch2.json
# ... continue until all entities exported

# Import to GeonicDB using batch update
curl -X POST https://api.geonicdb.geolonia.com/v2/op/update \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "actionType": "append",
    "entities": '"$(cat entities_batch1.json)"'
  }'
```

### Large Datasets (> 10,000 entities)

For larger datasets, export directly from MongoDB and coordinate with the GeonicDB team for bulk import.

## Step 5: Verify and Cut Over

After migration, verify:

1. **Entity data**: Query key entities and compare attributes
2. **Subscriptions**: Trigger a test update and verify notification delivery
3. **Geo-queries**: Test location-based queries if used
4. **Multi-tenancy**: Verify tenant isolation works correctly

### Checklist

- [ ] All entity types present
- [ ] Entity counts match
- [ ] Subscriptions receiving notifications
- [ ] Geo-queries returning correct results
- [ ] Authentication working for all service accounts
- [ ] Application endpoints updated to GeonicDB SaaS URLs

## Key Differences from Orion

| Feature | FIWARE Orion | GeonicDB SaaS |
|---------|-------------|-----------|
| Hosting | Self-hosted (Docker) | Managed SaaS |
| Authentication | External (Keyrock + Wilma) | Built-in JWT |
| Dual API | Orion (v2) OR Orion-LD (LD) | Both simultaneously |
| Notifications | HTTP, MQTT | HTTP, MQTT, WebSocket |
| AI Integration | None | MCP, llms.txt, tools.json |
| Scaling | Manual (containers) | Automatic (Lambda) |

## Next Steps

- [Compatibility Matrix](/en/migration/compatibility-matrix) — Detailed API compatibility comparison
