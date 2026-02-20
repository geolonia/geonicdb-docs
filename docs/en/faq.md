---
title: "FAQ"
description: "Frequently Asked Questions"
outline: deep
---
# Frequently Asked Questions (FAQ)

This page compiles frequently asked questions and answers about GeonicDB.

## Table of Contents

- [Data Volume and Performance](#data-volume-and-performance)
- [Differences from FIWARE Orion](#differences-from-fiware-orion)
- [Deployment and Operations](#deployment-and-operations)
- [API Usage](#api-usage)
- [Geospatial Extensions](#geospatial-extensions)
- [Security](#security)

---

## Data Volume and Performance

### Q: Is there a limit on data volume?

**A:** GeonicDB itself has no explicit data volume limit. It depends on MongoDB's scaling capabilities.

#### Hard Limits (System Constraints)

| Constraint | Value | Description |
|------|-----|------|
| Maximum items per request | 1000 items | Pagination `limit` upper bound (FIWARE Orion compatible) |
| Admin API maximum items | 100 items | Pagination upper bound for administrative APIs |
| API Gateway timeout | 29 seconds | AWS-side limitation |
| Lambda timeout | 15 minutes | Lambda functions for batch processing, etc. |

#### Practical Guidelines

| Data Scale | Recommended Environment |
|-----------|---------|
| Up to 100K entities | MongoDB Atlas M10-M30 |
| Up to 1M entities | MongoDB Atlas M30-M50 |
| Over 1M entities | MongoDB Atlas M50+ with sharding consideration |

### Q: In what cases does search performance degrade?

**A:** Search performance may degrade in the following cases.

#### Queries That Utilize Indexes (Fast)

- Search by entity ID
- Filtering by entity type
- Geo queries (`georel`, `geometry`, `coordinates`)
- Sorting by modification date (`modifiedAt`)
- Time-series data search by `observedAt`

#### Queries Requiring Attention (May Be Slow)

| Query Pattern | Reason | Countermeasure |
|--------------|------|------|
| Partial match search on attribute values | Indexes are not effective | Use exact match when possible |
| Complex `q` filter combinations | May result in full scan | Narrow down filter conditions |
| Wide-area Geo search | Too many candidates | Limit search area |
| Full retrieval without `limit` | High memory consumption | Always use pagination |

### Q: What should I be aware of with Temporal data?

**A:** Time-series data volume rapidly increases with: number of entities × number of attributes × time.

#### Recommended Settings

```bash
# Set automatic deletion of old data (TTL)
# Can be configured with expireAfterSeconds in MongoDB Atlas collection settings
```

#### Data Volume Estimation Example

```text
1000 entities × 10 attributes × 1-minute interval × 24 hours × 30 days
= Approximately 430 million records/month
```

For large volumes of time-series data, consider integration with dedicated time-series databases (TimescaleDB, InfluxDB).

---

## Differences from FIWARE Orion

### Q: Is it compatible with FIWARE Orion?

**A:** The NGSIv2 API has high compatibility. For details, refer to the [FIWARE Orion Comparison Document](./migration/compatibility-matrix.md).

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

# Import to GeonicDB
curl -X POST "https://api.example.com/v2/op/update" \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: myservice" \
  -d '{"actionType": "append", "entities": '"$(cat entities.json)"'}'
```

---

## Deployment and Operations

### Q: Where can it be deployed?

**A:** It operates in the following environments.

| Environment | Description |
|------|------|
| AWS Lambda + API Gateway | Recommended. Serverless with auto-scaling |
| Local (`npm start`) | For development and testing. Uses in-memory MongoDB |
| Docker | Can run in any container environment |

### Q: What MongoDB should I use?

**A:** The following are recommended.

| Service | Features |
|---------|------|
| MongoDB Atlas | Recommended. Fully managed with auto-scaling |
| Self-hosted MongoDB | Full control but high operational overhead |

> **Note**: MongoDB 8.0 or higher is required (due to use of Time Series Collection). Amazon DocumentDB is not supported as it does not support Time Series Collections.

### Q: What are the cost guidelines?

**A:** With a serverless architecture, you are charged only for what you use.

| Component | Small Scale (100K requests/month) | Medium Scale (1M requests/month) |
|--------------|---------------------------|----------------------------|
| Lambda | ~$5 | ~$20 |
| API Gateway | ~$4 | ~$35 |
| MongoDB Atlas (M10) | ~$60 | ~$60 |
| **Total** | **~$70/month** | **~$115/month** |

※ Actual costs vary depending on region, data volume, and request patterns.

---

## API Usage

### Q: Should I use NGSIv2 or NGSI-LD?

**A:** Choose based on your use case.

| Aspect | NGSIv2 | NGSI-LD |
|------|--------|---------|
| Learning curve | Low | Somewhat high (requires understanding of JSON-LD) |
| FIWARE ecosystem | Many tools support it | Supporting tools are increasing |
| Time-series data | Not supported (requires separate implementation) | Standard support with Temporal API |
| Data interoperability | Limited | High due to JSON-LD |
| Recommended use | Integration with existing FIWARE systems | New development, data integration priority |

### Q: Can I use it without authentication?

**A:** In development environments, it can be used without authentication by default. For production environments, enabling JWT authentication is strongly recommended.

```bash
# Without authentication (development environment)
curl -X GET "http://localhost:3000/v2/entities" \
  -H "Fiware-Service: default"

# With JWT authentication (production environment)
curl -X GET "https://api.example.com/v2/entities" \
  -H "Fiware-Service: default" \
  -H "Authorization: Bearer <access_token>"
```

### Q: Is tenant (Fiware-Service) mandatory?

**A:** Not mandatory, but if not specified, the `default` tenant is used. In production environments, it is recommended to explicitly specify the tenant.

---

## Geospatial Extensions

### Q: What are geospatial extensions?

**A:** In addition to NGSI standard Geo queries, GeonicDB provides proprietary geospatial features. These are collectively referred to as "geospatial extensions."

#### Feature List

| Feature | Description | Supported API |
|------|------|---------|
| Geo queries | NGSI standard geospatial search | NGSIv2, NGSI-LD |
| Vector tiles | GeoJSON tile output for map display | NGSIv2, NGSI-LD |
| Spatial ID | Digital Agency 3D Spatial ID support | NGSI-LD |

### Q: What can I do with Geo queries?

**A:** You can search for entities with location information using geographic conditions.

#### Supported Geometry Types

| Type | Description | Examples |
|--------|------|-----|
| Point | Point (latitude and longitude) | Sensor location, store location |
| Polygon | Polygon | Building area, administrative district |
| LineString | Line | Road, river |

#### Supported Spatial Relations (georel)

| Relation | Description | Use Case |
|------|------|--------|
| `near` | Distance from specified point | "Sensors within 1km from current location" |
| `within` | Contained within range | "Buildings within this district" |
| `contains` | Contains range | "Areas containing this point" |
| `intersects` | Intersects | "Areas intersecting this road" |
| `disjoint` | Separated | "Entities outside this district" |
| `equals` | Matches | "Entities at the same location" |

#### Usage Examples

```bash
# Search for sensors within 1km from Tokyo Station (139.7671, 35.6812)
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
- **Clustering**: Automatically groups points according to zoom level
- **TileJSON support**: Compatible with map libraries like MapLibre GL JS

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

**A:** A feature compatible with the "3D Spatial Identifier" specification formulated by the Digital Agency/IPA. It can uniquely identify 3D spaces including altitude (floor) in addition to latitude and longitude.

#### Spatial ID Format

```text
z/f/x/y

z: Zoom level (0-25)
f: Floor (altitude direction index, negative values possible)
x: X tile coordinate
y: Y tile coordinate
```

#### Usage Examples

```text
25/0/29805582/13235296  → Specific point on ground floor
25/1/29805582/13235296  → One floor above the same point
25/-1/29805582/13235296 → Underground at the same point
```

#### Features

| Operation | Description |
|------|------|
| Coordinates → Spatial ID conversion | Calculate spatial ID from latitude, longitude, altitude |
| Spatial ID → Bounding box | Get 3D range indicated by spatial ID |
| Spatial ID expansion | Enumerate child spatial IDs from parent spatial ID |

#### Use Cases

- Indoor positioning (floor identification within buildings)
- Drone flight path management
- Integration with 3D city models
- Underground facility management

### Q: How do I set GeoProperty?

**A:** To give an entity location information, set coordinates in GeoJSON format in the `location` attribute.

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
| API Key | Planned for future support |

### Q: What are the types of roles (permissions)?

**A:** There are 3 types of roles.

| Role | Permissions |
|--------|------|
| `super_admin` | Manage all tenants, system settings |
| `tenant_admin` | Manage assigned tenants, user management |
| `user` | Read/write entities (can be restricted by policies) |

For details, refer to Authentication and Authorization.

### Q: Is HTTPS required?

**A:** It is required in production environments. When deploying to AWS, API Gateway automatically provides HTTPS.

---

## Related Documents

- [API Specification](./api-reference/endpoints.md)
- [FIWARE Orion Comparison](./migration/compatibility-matrix.md)
- [Development and Deployment Guide](./getting-started/installation.md)
- Authentication and Authorization