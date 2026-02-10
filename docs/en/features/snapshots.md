---
title: Snapshots
description: Create and restore point-in-time snapshots of entity data in Vela OS.
outline: deep
---

# Snapshots

Vela OS provides a **snapshot** feature that allows you to capture and restore point-in-time copies of entity data. Snapshots are useful for backup, testing, data migration, and rollback scenarios.

## Overview

A snapshot captures the current state of entities within a tenant at a specific point in time. You can create snapshots on demand and restore them later to revert entities to a previous state.

## Creating a Snapshot

```bash
curl -X POST https://api.vela.geolonia.com/v2/snapshots \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "description": "Pre-deployment backup"
  }'
```

**Response:**

```json
{
  "id": "snapshot_2026-01-15T10-00-00Z",
  "description": "Pre-deployment backup",
  "createdAt": "2026-01-15T10:00:00Z",
  "entityCount": 1250,
  "status": "completed"
}
```

## Listing Snapshots

```bash
curl https://api.vela.geolonia.com/v2/snapshots \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Response:**

```json
[
  {
    "id": "snapshot_2026-01-15T10-00-00Z",
    "description": "Pre-deployment backup",
    "createdAt": "2026-01-15T10:00:00Z",
    "entityCount": 1250,
    "status": "completed"
  },
  {
    "id": "snapshot_2026-01-10T08-00-00Z",
    "description": "Weekly backup",
    "createdAt": "2026-01-10T08:00:00Z",
    "entityCount": 1180,
    "status": "completed"
  }
]
```

## Restoring a Snapshot

```bash
curl -X POST https://api.vela.geolonia.com/v2/snapshots/snapshot_2026-01-15T10-00-00Z/restore \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Response:**

```json
{
  "id": "snapshot_2026-01-15T10-00-00Z",
  "status": "restoring",
  "restoredEntities": 1250
}
```

::: warning
Restoring a snapshot replaces the current entity data with the snapshot data. Any changes made after the snapshot was created will be lost. Consider creating a new snapshot before restoring.
:::

## Deleting a Snapshot

```bash
curl -X DELETE https://api.vela.geolonia.com/v2/snapshots/snapshot_2026-01-15T10-00-00Z \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## Endpoint Summary

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v2/snapshots` | Create a new snapshot |
| GET | `/v2/snapshots` | List all snapshots |
| GET | `/v2/snapshots/{snapshotId}` | Get snapshot details |
| POST | `/v2/snapshots/{snapshotId}/restore` | Restore a snapshot |
| DELETE | `/v2/snapshots/{snapshotId}` | Delete a snapshot |

## Use Cases

### Pre-Deployment Backup

Create a snapshot before deploying application changes that modify entity data:

```bash
# Before deployment
curl -X POST https://api.vela.geolonia.com/v2/snapshots \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"description": "Pre-deployment: v2.1.0"}'

# If something goes wrong, restore
curl -X POST https://api.vela.geolonia.com/v2/snapshots/snapshot_2026-01-15T10-00-00Z/restore \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Testing with Production Data

Create a snapshot of production data and restore it in a test tenant for realistic testing scenarios.

### Data Migration

Before running data migration scripts, snapshot the current state to enable rollback if the migration encounters issues.

## Multi-Tenancy

Snapshots are scoped to the tenant specified in the `Fiware-Service` header. Each tenant manages its own snapshots independently, ensuring data isolation.
