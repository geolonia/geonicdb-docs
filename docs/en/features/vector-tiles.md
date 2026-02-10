---
title: Vector Tiles
description: Serve entity data as vector tiles with TileJSON 3.0, automatic clustering, and MapLibre GL JS integration in Vela OS.
outline: deep
---

# Vector Tiles

Vela OS can serve entity location data as **vector tiles**, enabling high-performance map visualizations directly from your context data. The built-in tile server supports the **TileJSON 3.0** specification, automatic point clustering, and seamless integration with **MapLibre GL JS**.

## Overview

Vector tiles provide an efficient way to render large numbers of geo-located entities on a map. Instead of fetching all entities and rendering them client-side, vector tiles deliver pre-processed, tile-based data that map libraries can render incrementally as the user pans and zooms.

## TileJSON 3.0 Endpoint

Vela OS exposes a TileJSON 3.0 metadata endpoint for each entity type:

```bash
curl https://api.vela.geolonia.com/v2/entities/tiles/Room/tilejson \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Response

```json
{
  "tilejson": "3.0.0",
  "name": "Room",
  "tiles": [
    "https://api.vela.geolonia.com/v2/entities/tiles/Room/{z}/{x}/{y}.pbf"
  ],
  "minzoom": 0,
  "maxzoom": 14,
  "bounds": [122.93, 24.04, 153.99, 45.55]
}
```

## Tile Endpoint

Individual tiles are served in Mapbox Vector Tile (MVT / `.pbf`) format:

```text
GET /v2/entities/tiles/{entityType}/{z}/{x}/{y}.pbf
```

| Parameter | Description |
|-----------|-------------|
| `entityType` | Entity type to generate tiles for |
| `z` | Zoom level |
| `x` | Tile column |
| `y` | Tile row |

### Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Fiware-Service` | Yes | Tenant name |
| `Authorization` | When auth enabled | API access token |

## Automatic Clustering

At lower zoom levels, Vela OS automatically clusters nearby entities into aggregated points. This improves rendering performance when viewing large datasets at city or regional scale.

| Zoom Level | Behavior |
|------------|----------|
| 0–10 | Clustered points with count property |
| 11–14 | Individual entity points |

Cluster features include a `point_count` property that indicates the number of entities in the cluster.

## MapLibre GL JS Integration

### Basic Setup

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="https://unpkg.com/maplibre-gl/dist/maplibre-gl.css" />
  <script src="https://unpkg.com/maplibre-gl/dist/maplibre-gl.js"></script>
</head>
<body>
  <div id="map" style="width: 100%; height: 100vh;"></div>
  <script>
    const map = new maplibregl.Map({
      container: 'map',
      style: 'https://basemaps.geolonia.com/v1/styles/basic.json',
      center: [139.7671, 35.6812],
      zoom: 12
    });

    map.on('load', () => {
      map.addSource('sensors', {
        type: 'vector',
        url: 'https://api.vela.geolonia.com/v2/entities/tiles/Sensor/tilejson'
      });

      map.addLayer({
        id: 'sensor-points',
        type: 'circle',
        source: 'sensors',
        'source-layer': 'entities',
        paint: {
          'circle-radius': 6,
          'circle-color': '#007cbf'
        }
      });
    });
  </script>
</body>
</html>
```

### Displaying Clusters

```javascript
map.on('load', () => {
  map.addSource('sensors', {
    type: 'vector',
    url: 'https://api.vela.geolonia.com/v2/entities/tiles/Sensor/tilejson'
  });

  // Cluster circles
  map.addLayer({
    id: 'clusters',
    type: 'circle',
    source: 'sensors',
    'source-layer': 'entities',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': [
        'step', ['get', 'point_count'],
        '#51bbd6', 10,
        '#f1f075', 50,
        '#f28cb1'
      ],
      'circle-radius': [
        'step', ['get', 'point_count'],
        15, 10,
        20, 50,
        25
      ]
    }
  });

  // Cluster count labels
  map.addLayer({
    id: 'cluster-count',
    type: 'symbol',
    source: 'sensors',
    'source-layer': 'entities',
    filter: ['has', 'point_count'],
    layout: {
      'text-field': '{point_count}',
      'text-size': 12
    }
  });

  // Individual points
  map.addLayer({
    id: 'unclustered-point',
    type: 'circle',
    source: 'sensors',
    'source-layer': 'entities',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-radius': 5,
      'circle-color': '#007cbf'
    }
  });
});
```

### Click Interaction

```javascript
map.on('click', 'unclustered-point', (e) => {
  const properties = e.features[0].properties;
  new maplibregl.Popup()
    .setLngLat(e.lngLat)
    .setHTML(`<strong>${properties.id}</strong><br>Type: ${properties.type}`)
    .addTo(map);
});
```

## Entity Properties in Tiles

Each feature in the vector tile includes the following properties:

| Property | Description |
|----------|-------------|
| `id` | Entity ID |
| `type` | Entity type |
| Additional attributes | Entity attributes as feature properties |

## Performance Considerations

- Vector tiles are generated on-demand from the MongoDB geo-index
- Results are tile-boundary clipped for efficient transfer
- Use the `Fiware-Service` header to scope tiles to a specific tenant
- For large datasets, clustering at low zoom levels significantly reduces tile size
