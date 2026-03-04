---
title: "FAQ"
description: "Frequently Asked Questions"
outline: deep
---
# Frequently Asked Questions (FAQ)

A collection of frequently asked questions and answers about GeonicDB.

## Table of Contents

- [Data Volume and Performance](#data-volume-and-performance)
- [Differences from FIWARE Orion](#differences-from-fiware-orion)
- [Deployment and Operations](#deployment-and-operations)
- [API Usage](#api-usage)
- [Geospatial Extensions](#geospatial-extensions)
- [Security](#security)

---

## Data Volume and Performance

### Q: Is there a data volume limit?

**A:** GeonicDB itself has no explicit data volume limit. It depends on MongoDB's scaling capabilities.

#### Hard Limits (System Constraints)

| Constraint | Value | Description |
|------|-----|------|
| Maximum items per request | 1,000 | Pagination `limit` limit (FIWARE Orion compatible) |
| Admin API maximum items | 100 | Management API pagination limit |
| API Gateway timeout | 29 seconds | AWS-side limitation |
| Lambda timeout | 15 minutes | For Lambda functions like batch processing |

#### Operational Guidelines

| Data Scale | Recommended Environment |
|-----------|---------|
| Up to 100,000 entities | MongoDB Atlas M10–M30 |
| Up to 1 million entities | MongoDB Atlas M30–M50 |
| Over 1 million entities | MongoDB Atlas M50+ and consider sharding |

### Q: When do queries become slow?

**A:** Query performance may degrade in the following cases.

#### Queries That Utilize Indexes (Fast)

- Search by entity ID
- Filtering by entity type
- Geo queries (`georel`, `geometry`, `coordinates`)
- Sorting by last update time (`modifiedAt`)
- Time-series data search using `observedAt`
#### Queries Requiring Caution (Potentially Slow)

| Query Pattern | Reason | Mitigation |
|--------------|------|------|
| Partial match search on attribute values | Index not utilized | Use exact matches when possible |
| Complex combinations of `q` filters | May result in full scan | Narrow down filter conditions |
| Wide-range Geo search | Too many candidates | Limit search area |
| Retrieving all records without `limit` | High memory consumption | Always use pagination |

### Q: What should I be aware of with Temporal data?

**A:** Temporal data volume increases rapidly: entity count × attribute count × time intervals.

#### Recommended Settings

```bash
# Configure automatic deletion of old data (TTL)
# expireAfterSeconds can be set in MongoDB Atlas collection settings
```







#### Data Volume Estimation Example

```text
1,000 entities x 10 attributes x 1-minute interval x 24 hours x 30 days
= approximately 430 million records/month
```







For handling large amounts of temporal data, consider integrating with dedicated time-series databases (TimescaleDB, InfluxDB).

---

## Differences from FIWARE Orion

### Q: Is it compatible with FIWARE Orion?

**A:** The NGSIv2 API has high compatibility. For details, see the [FIWARE Orion comparison document](./migration/compatibility-matrix.md).

#### Compatible Features

- NGSIv2 entity CRUD operations
- Subscriptions (notifications)
- Geo queries
- Batch operations
- Registrations (Context Provider)

#### GeonicDB-Specific Features

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

### Q: Where can it be deployed?

**A:** It runs in the following environments.

| Environment | Description |
|------|------|
| AWS Lambda + API Gateway | Recommended. Serverless with auto-scaling |
| Local (`npm start`) | For development/testing. Uses in-memory MongoDB |
| Docker | Can run in any container environment |

### Q: Which MongoDB should I use?

**A:** We recommend one of the following.

| Service | Features |
|---------|------|
| MongoDB Atlas | Recommended. Fully managed, auto-scaling |
| Self-hosted MongoDB | Full control but high operational overhead |

> **Note**: MongoDB 8.0 or later is required (for Time Series Collection support). Amazon DocumentDB is not supported as it does not support Time Series Collections.

### Q: What are the cost estimates?

**A:** With serverless architecture, you pay only for what you use.

| Component | Small-scale (100k requests/month) | Medium-scale (1M requests/month) |
|--------------|---------------------------|----------------------------|
| Lambda | ~$5 | ~$20 |
| API Gateway | ~$4 | ~$35 |
| MongoDB Atlas (M10) | ~$60 | ~$60 |
| **Total** | **~$70/month** | **~$115/month** |

* Actual costs vary by region, data volume, and request patterns.

---

## API Usage

### Q: Should I use NGSIv2 or NGSI-LD?

**A:** Choose based on your use case.

| Aspect | NGSIv2 | NGSI-LD |
|------|--------|---------|
| Learning curve | Low | Moderate (requires understanding JSON-LD) |
| FIWARE ecosystem | Rich tooling | Growing tool support |
| Temporal data | Not supported (requires separate implementation) | Natively supported via Temporal API |
| Data interoperability | Limited | High compatibility via JSON-LD |
| Recommended for | Integration with existing FIWARE systems | New development, emphasis on data interoperability |

### Q: Can it be used without authentication?

**A:** By default, authentication is disabled in development environments. It is strongly recommended to enable JWT authentication in production.

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

**A:** Not required, but if not specified, the `default` tenant is used. It is recommended to explicitly specify a tenant in production.

---

## Geospatial Extensions

### Q: What are geospatial extensions?

**A:** In addition to NGSI standard Geo queries, these are geospatial features uniquely provided by GeonicDB. Collectively, they are called "geospatial extensions."

#### Features List

| Feature | Description | Supported API |
|------|------|---------|
| Geo queries | NGSI standard geospatial search | NGSIv2, NGSI-LD |
| Vector tiles | GeoJSON tile output for map display | NGSIv2, NGSI-LD |
| Spatial ID | Support for Japan's Digital Agency 3D Spatial ID | NGSI-LD |

### Q: What can I do with Geo queries?

**A:** You can search entities with location information using geographic conditions.

#### Supported Geometry Types

| Type | Description | Example |
|--------|------|-----|
| Point | Point (latitude/longitude) | Sensor location, store location |
| Polygon | Polygon | Building area, administrative district |
| LineString | Line | Road, river |

#### Supported Spatial Relations (georel)

| Relation | Description | Use Case |
|------|------|--------|
| `near` | Distance from specified point | "Sensors within 1km of current location" |
| `within` | Contained within range | "Buildings within this area" |
| `contains` | Contains range | "Areas containing this point" |
| `intersects` | Intersects | "Areas intersecting this road" |
| `disjoint` | Disjoint | "Entities outside this area" |
| `equals` | Exactly matches | "Entities at the same location" |

#### Usage Example

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
- **Clustering**: Automatically aggregates points according to zoom level
- **TileJSON support**: Can integrate with map libraries like MapLibre GL JS

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

**A:** A feature that supports the "3D Spatial Identifier" specification defined by Japan's Digital Agency and IPA. It can uniquely identify 3D space including altitude (elevation) in addition to latitude and longitude.

#### Spatial ID Format

```text
z/f/x/y

z: Zoom level (0–25)
f: Floor (index in the altitude direction, negative values allowed)
x: X tile coordinate
y: Y tile coordinate
```















#### Usage Example

```text
25/0/29805582/13235296  → A specific point on the ground floor
25/1/29805582/13235296  → One floor above the same point
25/-1/29805582/13235296 → Underground at the same point
```









#### Functions

| Operation | Description |
|------|------|
| Coordinates to Spatial ID conversion | Calculate Spatial ID from latitude, longitude, altitude |
| Spatial ID to bounding box | Get 3D range represented by Spatial ID |
| Spatial ID expansion | Enumerate child Spatial IDs from parent Spatial ID |

#### Use Cases

- Indoor positioning (floor identification within buildings)
- Drone flight path management
- Integration with 3D city models
- Underground facility management

### Q: How to set GeoProperty?

**A:** To store location information in an entity, set coordinates in GeoJSON format in the `location` attribute.

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
| IP Whitelist | Restrict allowed IPs per tenant |
| API Key | Support planned for the future |

### Q: What are the types of roles (permissions)?

**A:** There are three types of roles.

| Role | Permissions |
|--------|------|
| `super_admin` | Manage all tenants, system configuration |
| `tenant_admin` | Manage assigned tenants, user management |
| `user` | Read/write entities (can be restricted by policies) |

For details, see Authentication and Authorization.

### Q: Is HTTPS required?

**A:** Required in production environments. When deploying to AWS, API Gateway automatically provides HTTPS.

---

## Related Documentation

- [API Specification](./api-reference/endpoints.md)
- [FIWARE Orion Comparison](./migration/compatibility-matrix.md)
- [Development and Deployment Guide](./getting-started/installation.md)
- Authentication and Authorization