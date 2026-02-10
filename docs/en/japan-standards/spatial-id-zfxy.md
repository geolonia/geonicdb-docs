---
title: Spatial ID / ZFXY
description: Vela OS implements the Digital Agency / IPA 3D Spatial Identification (ZFXY) standard for indexing and querying entities in three-dimensional space.
outline: deep
---

# Spatial ID / ZFXY

Vela OS implements the **3D Spatial Identification standard** (commonly known as **ZFXY** or **Spatial ID**) defined by Japan's **Digital Agency** and **IPA** (Information-technology Promotion Agency). This allows entities to be indexed and queried using a hierarchical 3D spatial grid system.

## What is ZFXY?

ZFXY is a spatial identification scheme that extends 2D web map tiling (used by Google Maps, OpenStreetMap, etc.) into three dimensions by adding a **floor (altitude) axis**. Each spatial cell is identified by four parameters:

| Parameter | Description | Range |
|-----------|-------------|-------|
| **z** | Zoom level (spatial resolution) | 0–28 |
| **f** | Floor level (vertical/altitude index) | Any integer (positive or negative) |
| **x** | X tile coordinate (longitude direction) | 0 to 2^z − 1 |
| **y** | Y tile coordinate (latitude direction) | 0 to 2^z − 1 |

### Format

```text
z/f/x/y
```

or with a leading slash:

```text
/z/f/x/y
```

**Example**: `20/0/929593/410773` identifies a ground-level tile near Tokyo at zoom level 20.

## How It Works

### Horizontal Grid (X, Y)

The horizontal grid follows the **Web Mercator** tiling scheme:

- At zoom level 0, the entire world is one tile (1×1)
- At zoom level 1, the world is split into 4 tiles (2×2)
- At zoom level z, the world has 2^z × 2^z tiles
- Higher zoom levels provide finer spatial resolution

### Vertical Grid (F)

The floor parameter adds a vertical dimension:

- **f = 0**: Ground level
- **f > 0**: Above ground (each floor corresponds to an altitude range)
- **f < 0**: Below ground (underground structures, subway, etc.)

The altitude resolution depends on the zoom level. At the default configuration (base zoom 25, 1 meter per unit):

- At zoom level 25: Each floor = 1 meter
- At zoom level 20: Each floor = 32 meters
- At zoom level 15: Each floor = 1,024 meters

## API Usage

### Query by Spatial ID

Query entities within a specific spatial cell:

```bash
curl "https://api.vela.geolonia.com/v2/entities?spatialId=20/0/929593/410773" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Query with Depth Expansion

Expand the query to include child tiles at finer zoom levels:

```bash
curl "https://api.vela.geolonia.com/v2/entities?spatialId=18/0/232398/102693&depth=2" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

With `depth=2`, this returns entities in all tiles at zoom level 20 that fall within the zoom-18 parent tile.

## Spatial ID Operations

Vela's spatial ID system supports the following operations:

### Coordinate to Spatial ID

Convert geographic coordinates to a spatial ID at a specified zoom level:

- **Input**: longitude, latitude, altitude (optional), zoom level
- **Output**: `z/f/x/y` spatial ID
- **Projection**: Web Mercator (EPSG:3857)

### Spatial ID to Bounding Box

Convert a spatial ID back to geographic bounds:

- **2D**: Returns min/max longitude and latitude
- **3D**: Also includes min/max altitude based on the floor level

### Hierarchical Operations

- **Expand**: Get all child tiles at a deeper zoom level (e.g., zoom 18 → zoom 20 returns 4 tiles)
- **Parent**: Get the parent tile at a shallower zoom level
- **Contains**: Check if a coordinate falls within a spatial ID's bounds
- **Bounding Box to Spatial IDs**: Find all spatial IDs that cover a given bounding box

## Geofencing with Spatial IDs

Spatial IDs enable efficient geofencing by providing a hierarchical spatial index:

1. **Define a geofence** using a set of spatial IDs at a specific zoom level
2. **Index entities** by their spatial ID at ingestion time
3. **Query efficiently** — instead of calculating point-in-polygon for every entity, simply match spatial ID prefixes

This is particularly useful for smart city applications where millions of entities need to be monitored within defined geographic areas.

## Reference

- [Digital Agency — Spatial ID](https://www.digital.go.jp/policies/mobility_and_infrastructure/spatial-id)
- [IPA — 4D Spatio-Temporal Guideline](https://www.ipa.go.jp/digital/architecture/guidelines/4dspatio-temporal-guideline.html)

## Next Steps

- [CADDE](/en/japan-standards/cadde) — Cross-domain data exchange integration
- [Smart City Cases](/en/japan-standards/smart-city-cases) — Smart city use cases with Vela
