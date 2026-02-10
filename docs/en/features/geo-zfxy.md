---
title: Geo-Queries & Spatial ID (ZFXY)
description: Perform geographic queries using near, within, intersects, and coveredBy operators, and leverage Spatial ID (ZFXY) support in Vela OS.
outline: deep
---

# Geo-Queries & Spatial ID (ZFXY)

Vela OS provides powerful geographic query capabilities for filtering entities by location. It supports standard NGSI geo-query operators, GeoJSON geometry types, and Japan's Spatial ID (ZFXY) tile-based spatial indexing system.

## Geo-Query Operators

### NGSIv2 Geo-Queries

Use the `georel`, `geometry`, and `coords` parameters to filter entities by geographic criteria:

```bash
# Find entities near a point (within 1km)
curl -G https://api.vela.geolonia.com/v2/entities \
  --data-urlencode "georel=near;maxDistance:1000" \
  --data-urlencode "geometry=point" \
  --data-urlencode "coords=35.6812,139.7671" \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

| Operator | Description | Example |
|----------|-------------|---------|
| `near` | Entities near a point | `georel=near;maxDistance:1000` |
| `within` | Entities within a polygon | `georel=within` |
| `intersects` | Entities intersecting a geometry | `georel=intersects` |
| `coveredBy` | Entities covered by a geometry | `georel=coveredBy` |
| `equals` | Entities at exact location | `georel=equals` |
| `disjoint` | Entities outside a geometry | `georel=disjoint` |

### Geometry Types

| Type | `coords` Format | Example |
|------|-----------------|---------|
| `point` | `lat,lon` | `35.6812,139.7671` |
| `line` | `lat1,lon1;lat2,lon2;...` | `35.68,139.76;35.69,139.77` |
| `polygon` | `lat1,lon1;lat2,lon2;...;lat1,lon1` | `35.68,139.76;35.69,139.77;35.69,139.76;35.68,139.76` |
| `box` | `latSW,lonSW;latNE,lonNE` | `35.68,139.76;35.70,139.78` |

### NGSI-LD Geo-Queries

NGSI-LD uses `geoproperty`, `georel`, `geometry`, and `coordinates` parameters:

```bash
# Find entities within a polygon
curl -G https://api.vela.geolonia.com/ngsi-ld/v1/entities \
  --data-urlencode "type=Building" \
  --data-urlencode "georel=within" \
  --data-urlencode "geometry=Polygon" \
  --data-urlencode 'coordinates=[[[139.76,35.68],[139.77,35.68],[139.77,35.69],[139.76,35.69],[139.76,35.68]]]' \
  -H "NGSILD-Tenant: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Near Query with Distance

```bash
# Entities within 500 meters of Tokyo Station
curl -G https://api.vela.geolonia.com/v2/entities \
  --data-urlencode "type=Sensor" \
  --data-urlencode "georel=near;maxDistance:500" \
  --data-urlencode "geometry=point" \
  --data-urlencode "coords=35.6812,139.7671" \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

The `near` operator supports:
- `maxDistance:<meters>` — Maximum distance from the reference point
- `minDistance:<meters>` — Minimum distance from the reference point

## GeoJSON Support

Vela OS stores and returns entity locations using standard GeoJSON format.

### Creating an Entity with Location

```bash
curl -X POST https://api.vela.geolonia.com/v2/entities \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "id": "urn:ngsi-ld:Sensor:tokyo-001",
    "type": "Sensor",
    "location": {
      "type": "geo:json",
      "value": {
        "type": "Point",
        "coordinates": [139.7671, 35.6812]
      }
    },
    "temperature": {
      "type": "Number",
      "value": 22.5
    }
  }'
```

### NGSI-LD GeoProperty

```bash
curl -X POST https://api.vela.geolonia.com/ngsi-ld/v1/entities \
  -H "Content-Type: application/json" \
  -H "NGSILD-Tenant: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "id": "urn:ngsi-ld:Sensor:tokyo-001",
    "type": "Sensor",
    "location": {
      "type": "GeoProperty",
      "value": {
        "type": "Point",
        "coordinates": [139.7671, 35.6812]
      }
    }
  }'
```

### Supported GeoJSON Types

| GeoJSON Type | Description |
|-------------|-------------|
| `Point` | Single coordinate |
| `LineString` | Sequence of coordinates |
| `Polygon` | Closed area with boundary ring |
| `MultiPoint` | Collection of points |
| `MultiLineString` | Collection of line strings |
| `MultiPolygon` | Collection of polygons |

## Spatial ID (ZFXY)

Vela OS supports Japan's **Spatial ID (ZFXY)** system, a tile-based spatial indexing scheme aligned with the Digital Agency / IPA guidelines. ZFXY divides 3D space into a hierarchical grid using zoom level (Z), floor (F), X, and Y coordinates.

### ZFXY Format

```text
/{z}/{f}/{x}/{y}
```

| Component | Description |
|-----------|-------------|
| `z` | Zoom level (0–25) — higher values mean finer resolution |
| `f` | Floor level — for 3D spatial indexing |
| `x` | X tile coordinate |
| `y` | Y tile coordinate |

### Querying by Spatial ID

```bash
# Query entities within a specific spatial tile
curl -G https://api.vela.geolonia.com/v2/entities \
  --data-urlencode "type=Sensor" \
  --data-urlencode "spatialId=15/0/29103/12903" \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Use Cases

- **Smart city zoning** — Assign entities to standardized spatial tiles for uniform data aggregation
- **3D building management** — Use the floor (F) component to represent vertical positioning
- **Cross-platform interoperability** — Share location data using a standardized tile system across government and industry platforms
