---
title: Data Catalog
description: Expose entity metadata as DCAT-AP datasets and integrate with CKAN open data portals using Vela OS.
outline: deep
---

# Data Catalog

Vela OS includes a built-in **data catalog** that exposes entity type metadata in **DCAT-AP** (Data Catalog Vocabulary - Application Profile) format and provides **CKAN-compatible** API endpoints. This enables seamless integration with open data portals and data harvesting systems.

## Overview

- **DCAT-AP Format** — Outputs catalog metadata as JSON-LD following the EU data portal standard
- **CKAN Compatible API** — Supports CKAN harvester protocol for direct data ingestion
- **Automatic Metadata** — Generates dataset metadata automatically from entity types
- **Multi-Tenant** — Each tenant gets its own isolated catalog

## DCAT-AP Endpoints

### GET /catalog

Returns the full catalog in DCAT-AP JSON-LD format.

```bash
curl https://api.vela.geolonia.com/catalog \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Response:**

```json
{
  "@context": {
    "dcat": "http://www.w3.org/ns/dcat#",
    "dct": "http://purl.org/dc/terms/",
    "foaf": "http://xmlns.com/foaf/0.1/",
    "xsd": "http://www.w3.org/2001/XMLSchema#"
  },
  "@type": "dcat:Catalog",
  "@id": "urn:ngsi-ld:Catalog:smartcity",
  "dct:title": "Context Data Catalog",
  "dct:description": "DCAT-AP catalog for context data in tenant: smartcity",
  "dct:publisher": {
    "@type": "foaf:Organization",
    "foaf:name": "VelaOS"
  },
  "dct:language": ["ja", "en"],
  "dcat:dataset": [
    {
      "@type": "dcat:Dataset",
      "@id": "urn:ngsi-ld:Dataset:Room",
      "dct:title": "Room",
      "dct:description": "Context data for entity type: Room",
      "dcat:keyword": ["Room"],
      "dcat:distribution": [
        {
          "@type": "dcat:Distribution",
          "dcat:accessURL": "/v2/entities?type=Room",
          "dct:format": "application/json"
        },
        {
          "@type": "dcat:Distribution",
          "dcat:accessURL": "/ngsi-ld/v1/entities?type=Room",
          "dct:format": "application/ld+json"
        }
      ]
    }
  ]
}
```

### GET /catalog/datasets

List all datasets with optional pagination.

```bash
curl "https://api.vela.geolonia.com/catalog/datasets?limit=10&offset=0" \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

| Parameter | Description | Default |
|-----------|-------------|---------|
| `limit` | Number of datasets to return | All |
| `offset` | Number of datasets to skip | 0 |

### GET /catalog/datasets/{datasetId}

Get details for a specific dataset (entity type).

```bash
curl https://api.vela.geolonia.com/catalog/datasets/Room \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### GET /catalog/datasets/{datasetId}/sample

Get sample entities for a dataset.

```bash
curl "https://api.vela.geolonia.com/catalog/datasets/Room/sample?limit=3" \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

| Parameter | Description | Default |
|-----------|-------------|---------|
| `limit` | Number of sample entities | 5 |

## CKAN Compatible API

Vela OS provides CKAN-compatible endpoints that allow CKAN harvesters to directly ingest data from your context broker.

### GET /catalog/ckan/package_list

Returns all package (dataset) IDs.

```bash
curl https://api.vela.geolonia.com/catalog/ckan/package_list \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Response:**

```json
{
  "success": true,
  "result": ["room", "sensor", "device"]
}
```

### GET /catalog/ckan/package_show

Get detailed information for a specific package.

```bash
curl "https://api.vela.geolonia.com/catalog/ckan/package_show?id=room" \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Response:**

```json
{
  "success": true,
  "result": {
    "id": "room",
    "name": "room",
    "title": "Room",
    "notes": "Context data for entity type: Room",
    "num_resources": 2,
    "resources": [
      {
        "id": "room-0",
        "name": "Room (JSON)",
        "url": "/v2/entities?type=Room",
        "format": "JSON",
        "description": "Access Room entities via NGSIv2 API"
      },
      {
        "id": "room-1",
        "name": "Room (LD+JSON)",
        "url": "/ngsi-ld/v1/entities?type=Room",
        "format": "LD+JSON",
        "description": "Access Room entities via NGSI-LD API"
      }
    ],
    "tags": [
      { "name": "Room" }
    ]
  }
}
```

### GET /catalog/ckan/current_package_list_with_resources

Paginated package list with resource information.

```bash
curl "https://api.vela.geolonia.com/catalog/ckan/current_package_list_with_resources?limit=10&offset=0" \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## Endpoint Summary

| Method | Path | Description |
|--------|------|-------------|
| GET | `/catalog` | Full DCAT-AP catalog |
| GET | `/catalog/datasets` | Dataset list (DCAT) |
| GET | `/catalog/datasets/{datasetId}` | Single dataset (DCAT) |
| GET | `/catalog/datasets/{datasetId}/sample` | Sample data |
| GET | `/catalog/ckan/package_list` | CKAN: Package ID list |
| GET | `/catalog/ckan/package_show` | CKAN: Package details |
| GET | `/catalog/ckan/current_package_list_with_resources` | CKAN: Paginated list |

## CKAN Harvester Integration

To connect a CKAN portal to Vela OS:

1. In your CKAN instance, create a new harvest source
2. Set the source URL to your Vela OS catalog endpoint
3. The CKAN harvester will use `package_list` to discover datasets and `package_show` to retrieve details
4. Datasets are automatically updated when entity types change

## Multi-Tenancy

The catalog API respects multi-tenancy. Use the `Fiware-Service` header to scope the catalog to a specific tenant:

```bash
curl https://api.vela.geolonia.com/catalog \
  -H "Fiware-Service: smart_city"  \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Each tenant's catalog contains only the entity types and data belonging to that tenant.
