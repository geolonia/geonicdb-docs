---
title: "FAQ"
description: "Frequently asked questions"
outline: deep
---
# Frequently Asked Questions (FAQ)

A collection of frequently asked questions and answers about GeonicDB.

## Table of Contents

- [Data Volume and Performance](#data-volume-and-performance)
- [Differences from FIWARE Orion](#differences-from-fiware-orion)
- [Deployment and Operations](#deployment-and-operations)
- [How to Use the API](#how-to-use-the-api)
- [Geospatial Extensions](#geospatial-extensions)
- [Security](#security)

---

## Data Volume and Performance

### Q: Is there a data volume limit?

**A:** GeonicDB itself has no explicit data volume limit. It depends on MongoDB's scaling capabilities.

#### Hard Limits (System Constraints)

| Constraint | Value | Description |
|------|-----|------|
| Maximum items per request | 1,000 | `limit` upper bound for pagination (FIWARE Orion compatible) |
| Admin API maximum items | 100 | Pagination upper bound for admin APIs |
| API Gateway timeout | 29 seconds | AWS-side limit |
| Lambda timeout | 15 minutes | For Lambda functions such as batch processing |

#### Practical Guidelines for Production

| Data Scale | Recommended Environment |
|-----------|---------|
| Up to 100,000 entities | MongoDB Atlas M10–M30 |
| Up to 1,000,000 entities | MongoDB Atlas M30–M50 |
| Over 1,000,000 entities | MongoDB Atlas M50+ with sharding consideration |

### Q: Are there cases where queries become slow?

**A:** Query performance may degrade in the following cases.

#### Queries That Leverage Indexes (Fast)

- Search by entity ID
- Filtering by entity type
- Geo queries (`georel`, `geometry`, `coordinates`)
- Sorting by last modified date (`modifiedAt`)
- Time-series data search by `observedAt`

#### Queries Requiring Attention (Potentially Slow)

| Query Pattern | Reason | Mitigation |
|--------------|------|------|
| Partial match search on attribute values | Indexes are not effective | Use exact matches where possible |
| Complex combinations of `q` filters | May result in full scan | Narrow down filter conditions |
| Wide-range Geo searches | Too many candidates | Limit the search area |
| Retrieving all records without `limit` | High memory consumption | Always use pagination |

### Q: What should I be aware of with time-series (Temporal) data?

**A:** Time-series data volume grows rapidly with the number of entities x attributes x time intervals.

#### Recommended Configuration

```bash
# Configure automatic deletion of old data (TTL)
# expireAfterSeconds can be set in MongoDB Atlas collection settings
```

#### Data Volume Estimation Example

```text
1,000 entities x 10 attributes x 1-minute interval x 24 hours x 30 days
= approximately 430 million records/month
```

If handling large volumes of time-series data, consider integrating with a dedicated time-series database (TimescaleDB, InfluxDB).

---

## Differences from FIWARE Orion

### Q: What is the compatibility with FIWARE Orion?

**A:** The NGSIv2 API has high compatibility. See the [FIWARE Orion Comparison Document](./migration/compatibility-matrix.md) for details.

#### Compatible Features

- NGSIv2 entity CRUD operations
- Subscriptions (notifications)
- Geo queries
- Batch operations
- Registrations (Context Provider)

#### GeonicDB-Exclusive Features

- NGSI-LD API support
- JWT authentication and authorization
- Multi-tenancy
- AI tool integration (MCP)
- Vector tile output
- Snapshot functionality

### Q: Can I migrate from Orion?

**A:** Basic entity data can be migrated.

```bash
# Export entities from Orion
curl -X GET "http://orion:1026/v2/entities?limit=1000" \
  -H "Fiware-Service: myservice" > entities.json

# Import into GeonicDB
curl -X POST "https://api.example.com/v2/op/update" \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: myservice" \
  -d '{"actionType": "append", "entities": '"$(cat entities.json)"'}'
```

---

## Deployment and Operations

### Q: Where can I deploy this?

**A:** It runs in the following environments.

| Environment | Description |
|------|------|
| AWS Lambda + API Gateway | Recommended. Serverless with automatic scaling |
| Local (`npm start`) | For development and testing. Uses in-memory MongoDB |
| Docker | Can run in any container environment |

### Q: Which MongoDB should I use?

**A:** One of the following is recommended.

| Service | Features |
|---------|------|
| MongoDB Atlas | Recommended. Fully managed, automatic scaling |
| Self-hosted MongoDB | Full control, but high operational overhead |

> **Note**: MongoDB 8.0 or higher is required (for Time Series Collection support). Amazon DocumentDB is not supported as it does not support Time Series Collections.

### Q: What are the estimated costs?

**A:** Since this is a serverless architecture, you are billed only for what you use.

| Component | Small scale (100,000 requests/month) | Medium scale (1,000,000 requests/month) |
|--------------|---------------------------|----------------------------|
| Lambda | ~$5 | ~$20 |
| API Gateway | ~$4 | ~$35 |
| MongoDB Atlas (M10) | ~$60 | ~$60 |
| **Total** | **~$70/month** | **~$115/month** |

* Actual costs vary by region, data volume, and request patterns.

---

## How to Use the API

### Q: Should I use NGSIv2 or NGSI-LD?

**A:** Choose based on your use case.

| Perspective | NGSIv2 | NGSI-LD |
|------|--------|---------|
| Learning curve | Low | Somewhat high (requires understanding of JSON-LD) |
| FIWARE ecosystem | Many tools available | Number of compatible tools is growing |
| Time-series data | Not supported (requires separate implementation) | Standard support via Temporal API |
| Data interoperability | Limited | High via JSON-LD |
| Recommended use | Integration with existing FIWARE systems | New development, data interoperability focus |

### Q: Can I use it without authentication?

**A:** In the development environment, it can be used without authentication by default. It is strongly recommended to enable JWT authentication in production environments.

```bash
# Without authentication (development environment)
curl -X GET "http://localhost:3000/v2/entities" \
  -H "Fiware-Service: default"

# With JWT authentication (production environment)
curl -X GET "https://api.example.com/v2/entities" \
  -H "Fiware-Service: default" \
  -H "Authorization: Bearer <access_token>"
```

### Q: Is a tenant (Fiware-Service) required?

**A:** It is not required, but if not specified, the `default` tenant will be used. It is recommended to explicitly specify a tenant in production environments.

---

## Geospatial Extensions

### Q: What are geospatial extensions?

**A:** In addition to the NGSI standard Geo queries, GeonicDB provides its own geospatial features. These are collectively referred to as "geospatial extensions."

#### Feature List

| Feature | Description | Supported APIs |
|------|------|---------|
| Geo queries | NGSI standard geospatial search | NGSIv2, NGSI-LD |
| Vector tiles | GeoJSON tile output for map display | NGSIv2, NGSI-LD |
| Spatial ID | Japan Digital Agency 3D Spatial ID support | NGSIv2, NGSI-LD |

### Q: What can Geo queries do?

**A:** You can search for entities with location information using geographic conditions.

#### Supported Geometry Types

| Type | Description | Examples |
|--------|------|-----|
| Point | A point (latitude/longitude) | Sensor location, store location |
| Polygon | A polygon | Building area, administrative boundary |
| LineString | A line | Road, river |

#### Supported Spatial Relationships (georel)

| Relationship | Description | Usage Example |
|------|------|--------|
| `near` | Distance from a specified point | "Sensors within 1km of current location" |
| `within` | Contained within a range | "Buildings within this district" |
| `contains` | Contains a range | "Areas that contain this point" |
| `intersects` | Intersects with | "Areas that intersect with this road" |
| `disjoint` | Separated from | "Entities outside this district" |
| `equals` | Matches exactly | "Entities at the same location" |

#### Usage Examples

```bash
# Search for sensors within 1km of Tokyo Station (139.7671, 35.6812)
curl -X GET "http://localhost:3000/v2/entities?type=Sensor&georel=near;maxDistance:1000&geometry=point&coords=139.7671,35.6812" \
  -H "Fiware-Service: default"

# Search for entities within a polygon
curl -X GET "http://localhost:3000/v2/entities?georel=within&geometry=polygon&coords=139.7,35.6,139.8,35.6,139.8,35.7,139.7,35.7,139.7,35.6" \
  -H "Fiware-Service: default"
```

### Q: What are vector tiles?

**A:** A feature that outputs entity location information in GeoJSON tile format for map applications.

#### Features

- **Tile coordinate system**: Web Mercator (z/x/y format)
- **Clustering**: Automatically aggregates points based on zoom level
- **TileJSON support**: Can integrate with map libraries such as MapLibre GL JS

#### Endpoints

```bash
# Get TileJSON metadata
curl -X GET "http://localhost:3000/v2/tiles.json" \
  -H "Fiware-Service: default"

# Get tile (example: z=14, x=14552, y=6451)
curl -X GET "http://localhost:3000/v2/tiles/14/14552/6451.geojson" \
  -H "Fiware-Service: default"
```

#### Usage Example with MapLibre GL JS

```javascript
map.addSource('entities', {
  type: 'geojson',
  data: 'http://localhost:3000/v2/tiles/14/14552/6451.geojson'
});

map.addLayer({
  id: 'entity-points',
  type: 'circle',
  source: 'entities',
  paint: {
    'circle-radius': 6,
    'circle-color': '#007cbf'
  }
});
```

### Q: What is Spatial ID?

**A:** A feature that supports the "3D Spatial Identifier" specification established by Japan's Digital Agency/IPA. It enables unique identification of 3D space including altitude (floor) in addition to latitude and longitude.

#### Spatial ID Format

```text
z/f/x/y

z: Zoom level (0–25)
f: Floor (index in the altitude direction, negative values allowed)
x: X tile coordinate
y: Y tile coordinate
```

#### Usage Examples

```text
25/0/29805582/13235296  → A specific point on the ground floor
25/1/29805582/13235296  → One floor above the same point
25/-1/29805582/13235296 → Underground at the same point
```

#### Functions

| Operation | Description |
|------|------|
| Coordinates to Spatial ID conversion | Calculate Spatial ID from latitude, longitude, and altitude |
| Spatial ID to bounding box | Get the 3D extent represented by a Spatial ID |
| Spatial ID expansion | Enumerate child Spatial IDs from a parent Spatial ID |

#### Use Cases

- Indoor positioning (floor identification within buildings)
- Drone flight path management
- Integration with 3D city models
- Underground facility management

### Q: How do I configure a GeoProperty?

**A:** To store location information in an entity, set the coordinates in GeoJSON format in the `location` attribute.

#### NGSIv2 Format

```json
{
  "id": "Sensor001",
  "type": "Sensor",
  "location": {
    "type": "geo:json",
    "value": {
      "type": "Point",
      "coordinates": [139.7671, 35.6812]
    }
  }
}
```

#### NGSI-LD Format

```json
{
  "id": "urn:ngsi-ld:Sensor:001",
  "type": "Sensor",
  "location": {
    "type": "GeoProperty",
    "value": {
      "type": "Point",
      "coordinates": [139.7671, 35.6812]
    }
  }
}
```

**Note**: Coordinates are in `[longitude, latitude]` order (GeoJSON standard).

---

## Security

### Q: What authentication methods are supported?

**A:** The following authentication methods are supported.

| Method | Description |
|------|------|
| JWT Bearer Token | Recommended. User authentication and role-based access control |
| IP whitelist | Restrict allowed IPs per tenant |
| API Key (X-Api-Key) | Lightweight authentication for IoT devices and third-party integrations |

### Q: What types of roles (permissions) are there?

**A:** There are 4 types of roles.

| Role | Permissions |
|--------|------|
| `super_admin` | Platform management only (`/admin/*`, `/auth/*`). Cannot access data APIs (returns 403) |
| `tenant_admin` | Management of assigned tenants, user management |
| `user` | Read/write entities (can be restricted by policy) |
| `api_key` | Scope-based access via X-Api-Key header (origin/entity-type restrictions) |

See Authentication and Authorization for details.

### Q: Is HTTPS required?

**A:** It is required in production environments. When deploying to AWS, API Gateway automatically provides HTTPS.

---

## Related Documentation

- [API Specification](./api-reference/endpoints.md)
- [FIWARE Orion Comparison](./migration/compatibility-matrix.md)
- [Development and Deployment Guide](./getting-started/installation.md)
- Authentication and Authorization
