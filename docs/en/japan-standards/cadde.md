---
title: CADDE Integration
description: Vela OS integrates with CADDE (Connector Architecture for Decentralized Data Exchange), Japan's cross-domain data exchange infrastructure.
outline: deep
---

# CADDE Integration

Vela OS integrates with **CADDE** (Connector Architecture for Decentralized Data Exchange), a Japanese data exchange infrastructure that enables cross-domain data sharing between different data providers and consumers.

## What is CADDE?

CADDE is an architecture developed under Japan's digital policy framework to facilitate data exchange across different domains — government, transportation, environment, healthcare, and more. It provides:

- **Decentralized data exchange** between providers and consumers
- **Provenance tracking** for data lineage and audit
- **Standard authentication** through Bearer tokens and JWT
- **Metadata propagation** through HTTP headers

## How Vela Supports CADDE

Vela OS acts as a **CADDE-compatible data provider**. When a CADDE connector sends a data request, Vela processes the CADDE-specific headers, validates authentication (if enabled), and returns data with provenance information.

### Request Flow

```text
CADDE Consumer
    ↓
CADDE Connector (Broker)
    ↓ (x-cadde-* headers)
Vela OS (Data Provider)
    ↓ (x-cadde-provenance-* headers)
CADDE Connector
    ↓
CADDE Consumer
```

## CADDE Request Headers

When a CADDE connector accesses Vela, it includes the following headers:

| Header | Required | Description |
|--------|----------|-------------|
| `x-cadde-resource-url` | No | Original resource URL being accessed |
| `x-cadde-resource-api-type` | No | API type (e.g., `api/ngsi`) |
| `x-cadde-provider` | No | Data provider identifier |
| `x-cadde-options` | No | Key-value options (semicolon-separated) |
| `Authorization` | Conditional | `Bearer <token>` (when CADDE auth is enabled) |

A request is identified as a CADDE request when **any** `x-cadde-*` header is present.

## CADDE Response Headers (Provenance)

Vela automatically adds provenance headers to responses for CADDE requests:

| Header | Description | Example |
|--------|-------------|---------|
| `x-cadde-provenance-id` | Unique request ID (uses Fiware-Correlator) | `a1b2c3d4-...` |
| `x-cadde-provenance-timestamp` | ISO 8601 response timestamp | `2026-02-10T12:00:00.000Z` |
| `x-cadde-provenance-provider` | Data provider identifier | `provider-001` |
| `x-cadde-provenance-resource-url` | Actual resource URL accessed | `https://api.vela.geolonia.com/v2/entities` |

## Configuration

CADDE functionality is configured through environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `CADDE_ENABLED` | `false` | Enable CADDE functionality |
| `CADDE_AUTH_ENABLED` | `false` | Require Bearer token authentication for CADDE requests |
| `CADDE_DEFAULT_PROVIDER` | — | Default provider ID when not specified in request |
| `CADDE_JWT_ISSUER` | — | Expected JWT issuer (`iss` claim) for token validation |
| `CADDE_JWT_AUDIENCE` | — | Expected JWT audience (`aud` claim) for token validation |
| `CADDE_JWKS_URL` | — | URL for fetching JWKS public keys for JWT signature verification |

## Authentication

When `CADDE_AUTH_ENABLED=true`, Vela validates the Bearer token from the `Authorization` header:

1. **JWT decoding** — The token is decoded and its structure validated
2. **Signature verification** — The signature is verified against public keys from the configured JWKS endpoint
3. **Claims validation** — Issuer (`iss`), audience (`aud`), and expiration (`exp`) are checked
4. **JWKS caching** — Public keys are cached (5-minute TTL) to minimize network requests

Supported JWT algorithms include RSA (RS256, RS384, RS512) and ECDSA (ES256, ES384, ES512).

## Example: CADDE Request

```bash
curl https://api.vela.geolonia.com/v2/entities?type=AirQualityObserved \
  -H "x-cadde-resource-url: https://data.example.jp/air-quality" \
  -H "x-cadde-resource-api-type: api/ngsi" \
  -H "x-cadde-provider: tokyo-env-agency" \
  -H "Authorization: Bearer YOUR_CADDE_TOKEN"
```

The response will include standard NGSI data plus CADDE provenance headers:

```text
HTTP/1.1 200 OK
x-cadde-provenance-id: a1b2c3d4-e5f6-7890-abcd-ef1234567890
x-cadde-provenance-timestamp: 2026-02-10T12:00:00.000Z
x-cadde-provenance-provider: tokyo-env-agency
x-cadde-provenance-resource-url: https://api.vela.geolonia.com/v2/entities?type=AirQualityObserved
Content-Type: application/json

[...]
```

## Next Steps

- [Spatial ID / ZFXY](/en/japan-standards/spatial-id-zfxy) — 3D spatial identification standard
- [Smart City Cases](/en/japan-standards/smart-city-cases) — Smart city use cases with Vela
