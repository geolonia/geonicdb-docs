---
title: "Compatibility Matrix"
description: "Compatibility comparison with FIWARE Orion"
outline: deep
---
# GeonicDB vs FIWARE Orion Feature Comparison

This document compares the features of GeonicDB and FIWARE Orion Context Broker.

## Overview

| Item | GeonicDB | FIWARE Orion |
|------|-------------------|--------------|
| **Implementation Language** | TypeScript/Node.js | C++ |
| **Architecture** | Serverless (AWS Lambda) | Monolithic (Docker) |
| **Database** | MongoDB Atlas | MongoDB |
| **License** | AGPL v3.0 | AGPL v3.0 |
| **Supported APIs** | NGSIv2 + NGSI-LD | NGSIv2 (Orion) / NGSI-LD (Orion-LD) |
| **Scalability** | Auto-scaling (Lambda) | Manual scaling (Container) |
| **Cost** | Pay-per-use | Fixed infrastructure cost |

## API Support Status

### NGSIv2 API

| Feature | GeonicDB | FIWARE Orion | Notes |
|------|:------------------:|:------------:|------|
| `POST /v2/entities` | ✅ | ✅ | Create entity |
| `GET /v2/entities` | ✅ | ✅ | List entities |
| `GET /v2/entities/{id}` | ✅ | ✅ | Get entity |
| `DELETE /v2/entities/{id}` | ✅ | ✅ | Delete entity |
| `PATCH /v2/entities/{id}/attrs` | ✅ | ✅ | Update attributes |
| `POST /v2/entities/{id}/attrs` | ✅ | ✅ | Add attributes |
| `PUT /v2/entities/{id}/attrs` | ✅ | ✅ | Replace attributes |
| `GET /v2/entities/{id}/attrs/{attr}` | ✅ | ✅ | Get attribute |
| `PUT /v2/entities/{id}/attrs/{attr}` | ✅ | ✅ | Update attribute |
| `DELETE /v2/entities/{id}/attrs/{attr}` | ✅ | ✅ | Delete attribute |
| `GET /v2/entities/{id}/attrs/{attr}/value` | ✅ | ✅ | Get attribute value directly |
| `PUT /v2/entities/{id}/attrs/{attr}/value` | ✅ | ✅ | Update attribute value directly |
| `POST /v2/op/update` | ✅ | ✅ | Batch update |
| `POST /v2/op/query` | ✅ | ✅ | Batch query |
| `POST /v2/op/notify` | ✅ | ✅ | Receive notification |
| `GET /v2/types` | ✅ | ✅ | List entity types |
| `GET /v2/types/{type}` | ✅ | ✅ | Get entity type |
| `POST /v2/subscriptions` | ✅ | ✅ | Create subscription |
| `GET /v2/subscriptions` | ✅ | ✅ | List subscriptions |
| `GET /v2/subscriptions/{id}` | ✅ | ✅ | Get subscription |
| `PATCH /v2/subscriptions/{id}` | ✅ | ✅ | Update subscription |
| `DELETE /v2/subscriptions/{id}` | ✅ | ✅ | Delete subscription |
| `POST /v2/registrations` | ✅ | ✅ | Create registration |
| `GET /v2/registrations` | ✅ | ✅ | List registrations |
| `GET /v2/registrations/{id}` | ✅ | ✅ | Get registration |
| `PATCH /v2/registrations/{id}` | ✅ | ✅ | Update registration |
| `DELETE /v2/registrations/{id}` | ✅ | ✅ | Delete registration |
| `GET /version` | ✅ | ✅ | Version information |

### NGSI-LD API

| Feature | GeonicDB | FIWARE Orion-LD | Notes |
|------|:------------------:|:---------------:|------|
| `POST /ngsi-ld/v1/entities` | ✅ | ✅ | Create entity |
| `GET /ngsi-ld/v1/entities` | ✅ | ✅ | List entities |
| `GET /ngsi-ld/v1/entities/{id}` | ✅ | ✅ | Get entity |
| `PUT /ngsi-ld/v1/entities/{id}` | ✅ | ✅ | Replace entity |
| `PATCH /ngsi-ld/v1/entities/{id}` | ✅ | ✅ | Update entity (supports merge-patch+json, urn:ngsi-ld:null, keyValues/concise input) |
| `POST /ngsi-ld/v1/entities/{id}` | ✅ | ✅ | Add attributes |
| `DELETE /ngsi-ld/v1/entities/{id}` | ✅ | ✅ | Delete entity |
| `GET /ngsi-ld/v1/entities/{id}/attrs` | ✅ | ✅ | Get all attributes |
| `GET /ngsi-ld/v1/entities/{id}/attrs/{attr}` | ✅ | ✅ | Get attribute |
| `POST /ngsi-ld/v1/entities/{id}/attrs/{attr}` | ✅ | ✅ | Replace attribute |
| `PATCH /ngsi-ld/v1/entities/{id}/attrs/{attr}` | ✅ | ✅ | Partial update of attribute |
| `DELETE /ngsi-ld/v1/entities/{id}/attrs/{attr}` | ✅ | ✅ | Delete attribute |
| `POST /ngsi-ld/v1/entityOperations/create` | ✅ | ✅ | Batch create |
| `POST /ngsi-ld/v1/entityOperations/upsert` | ✅ | ✅ | Batch create/update |
| `POST /ngsi-ld/v1/entityOperations/update` | ✅ | ✅ | Batch update |
| `POST /ngsi-ld/v1/entityOperations/delete` | ✅ | ✅ | Batch delete |
| `POST /ngsi-ld/v1/entityOperations/query` | ✅ | ✅ | Batch query |
| `POST /ngsi-ld/v1/subscriptions` | ✅ | ✅ | Create subscription |
| `GET /ngsi-ld/v1/subscriptions` | ✅ | ✅ | List subscriptions |
| `GET /ngsi-ld/v1/subscriptions/{id}` | ✅ | ✅ | Get subscription |
| `PATCH /ngsi-ld/v1/subscriptions/{id}` | ✅ | ✅ | Update subscription |
| `DELETE /ngsi-ld/v1/subscriptions/{id}` | ✅ | ✅ | Delete subscription |
| `POST /ngsi-ld/v1/csourceRegistrations` | ✅ | ✅ | Create registration |
| `GET /ngsi-ld/v1/csourceRegistrations` | ✅ | ✅ | List registrations |
| `GET /ngsi-ld/v1/csourceRegistrations/{id}` | ✅ | ✅ | Get registration |
| `PATCH /ngsi-ld/v1/csourceRegistrations/{id}` | ✅ | ✅ | Update registration |
| `DELETE /ngsi-ld/v1/csourceRegistrations/{id}` | ✅ | ✅ | Delete registration |
| `POST /ngsi-ld/v1/csourceSubscriptions` | ✅ | ❌ | Create CSR subscription (*) |
| `GET /ngsi-ld/v1/csourceSubscriptions` | ✅ | ❌ | List CSR subscriptions (*) |
| `GET /ngsi-ld/v1/csourceSubscriptions/{id}` | ✅ | ❌ | Get CSR subscription (*) |
| `PATCH /ngsi-ld/v1/csourceSubscriptions/{id}` | ✅ | ❌ | Update CSR subscription (*) |
| `DELETE /ngsi-ld/v1/csourceSubscriptions/{id}` | ✅ | ❌ | Delete CSR subscription (*) |
| `GET /ngsi-ld/v1/attributes` | ✅ | ✅ | List attributes |
| `GET /ngsi-ld/v1/attributes/{attrName}` | ✅ | ✅ | Get attribute details |
| `GET /.well-known/ngsi-ld` | ✅ | ✅ | API discovery |
| JSON-LD @context support | ✅ | ✅ | Linked Data context |
| **Temporal API** | ✅ | ⚠️ Limited | Time series data management |
| **JSON-LD context management** | ✅ | ✅ | `/ngsi-ld/v1/jsonldContexts` |
| **EntityMap operations** | ✅ | ❌ | Entity mapping and transformation |
| **Snapshot operations** | ✅ | ❌ | Point-in-time snapshots |
| **Conformance information** | ✅ | ✅ | `/ngsi-ld/v1/info/conformance` |
| **Source identity** | ✅ | ✅ | `/ngsi-ld/v1/info/sourceIdentity` |
| **Vector tiles** | ✅ | ❌ | `/ngsi-ld/v1/tiles` GeoJSON vector tiles |

> **Note on csourceSubscriptions**
> Context Source Registration (CSR) subscription feature is defined in ETSI GS CIM 009 specification. GeonicDB provides a specification-compliant implementation, but it is currently not implemented in Orion-LD (planned for future implementation, see: [Orion-LD Issue #280](https://github.com/FIWARE/context.Orion-LD/issues/280)).

### NGSI-LD Attribute Types

| Feature | GeonicDB | FIWARE Orion-LD | Notes |
|------|:------------------:|:---------------:|------|
| Property | ✅ | ✅ | Basic attribute |
| Relationship | ✅ | ✅ | Inter-entity relationship |
| GeoProperty | ✅ | ✅ | Geospatial attribute |
| LanguageProperty | ✅ | ✅ | Multilingual attribute |
| JsonProperty | ✅ | ✅ | JSON value attribute |
| VocabProperty | ✅ | ✅ | Vocabulary attribute (vocab/vocabMap) |
| ListProperty | ✅ | ✅ | List value attribute |
| ListRelationship | ✅ | ✅ | List relationship attribute |
| TemporalProperty | ✅ | ✅ | Temporal attribute |
| **Multi-attribute** | ✅ | ✅ | Multiple instances via datasetId |
| `datasetId` query parameter | ✅ | ✅ | Delete specific instance |
| `deleteAll` query parameter | ✅ | ✅ | Delete all instances |

### NGSI-LD Output Formats

| Feature | GeonicDB | FIWARE Orion-LD | Notes |
|------|:------------------:|:---------------:|------|
| normalized | ✅ | ✅ | Full format (default) |
| concise | ✅ | ✅ | Concise format (omits type) |
| keyValues / simplified | ✅ | ✅ | Values only |

## Query Features

| Feature | GeonicDB | FIWARE Orion | Notes |
|------|:------------------:|:------------:|------|
| **Simple Query Language (q)** | ✅ | ✅ | |
| Comparison operators (`==`, `!=`, `<`, `>`, `<=`, `>=`) | ✅ | ✅ | |
| Logical operators (`;` AND, `\|` OR) | ✅ | ✅ | |
| Range query (`..`) | ✅ | ✅ | |
| Pattern match (`~=`) | ✅ | ✅ | Regex support |
| `idPattern` (regex) | ✅ | ✅ | |
| `typePattern` (regex) | ✅ | ✅ | |
| **Scope query (NGSI-LD)** | ✅ | ✅ | |
| `scopeQ` parameter | ✅ | ✅ | Hierarchical scope-based entity classification and search |
| Exact match (`/path`) | ✅ | ✅ | |
| All descendants (`/path/#`) | ✅ | ✅ | |
| Direct children (`/path/+`) | ✅ | ✅ | |
| OR condition (`;`) | ✅ | ✅ | |
| **Pagination** | ✅ | ✅ | |
| `limit` parameter | ✅ (max: 1000) | ✅ (max: 1000) | |
| `offset` parameter | ✅ | ✅ | |
| **Output format** | | | |
| `keyValues` | ✅ | ✅ | Simplified format |
| `values` | ✅ | ✅ | Values only |
| `unique` | ✅ | ✅ | Remove duplicates with `values` |
| `sysAttrs` | ✅ | ✅ | Include system attributes (dateCreated, dateModified) |
| `normalized` (default) | ✅ | ✅ | Full format |
| **Attribute selection** | | | |
| `attrs` parameter | ✅ | ✅ | Include attributes |
| `metadata` parameter | ✅ | ✅ | Control metadata output (on/off) |
| **Sorting** | | | |
| `orderBy` parameter | ✅ | ✅ | Sort by entityId, entityType, modifiedAt |
| `orderDirection` parameter | ✅ | ✅ | Specify sort direction asc/desc |

## Geospatial Features

| Feature | GeonicDB | FIWARE Orion | Notes |
|------|:------------------:|:------------:|------|
| **Geo-query** | ✅ | ✅ | |
| `georel=near` | ✅ | ✅ | Point geometry only, no distance sorting |
| `georel=within` | ✅ | ✅ | |
| `georel=coveredBy` | ✅ | ✅ | |
| `georel=intersects` | ✅ | ✅ | |
| `georel=disjoint` | ✅ | ✅ | |
| `georel=equals` | ✅ | ✅ | |
| `georel=contains` | ✅ | ✅ | |
| **Geometry types** | | | |
| Point | ✅ | ✅ | |
| LineString | ✅ | ✅ | |
| Polygon | ✅ | ✅ | |
| Box | ✅ | ✅ | Bounding box (2 points define rectangle) |
| MultiPoint |