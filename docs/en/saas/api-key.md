---
title: API Key
description: How to obtain and use your GeonicDB SaaS API key for authenticating API requests.
outline: deep
---

# API Key

Every GeonicDB SaaS API request must be authenticated with an API key. This page explains how to obtain, use, and manage your keys.

## Obtaining Your API Key

GeonicDB SaaS API keys are issued by Geolonia during onboarding.

::: info Console not yet available
The self-service API key management console (`app.geonicdb.com`) is currently **Coming Soon**. During the preview period, keys are provided directly by your Geolonia account manager.
:::

**To get your API key:**

1. Complete the account request at [https://www.geolonia.com/contact/](https://www.geolonia.com/contact/)
2. After your account is provisioned, Geolonia will provide your initial API key via the invitation email
3. Store the key securely — it will not be shown again after initial delivery

**To rotate or request a new key:**

Contact your Geolonia account manager at [https://www.geolonia.com/contact/](https://www.geolonia.com/contact/).

## Using Your API Key

Include the API key in the `x-api-key` request header for every API call:

```bash
curl -X GET "https://geonicdb.geolonia.com/v2/entities" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: YOUR_TENANT"
```

::: info API URL note
The GeonicDB SaaS API endpoint `https://geonicdb.geolonia.com` is subject to change during the current preview period. Your account manager will notify you of any updates.
:::

### Required Headers

| Header | Description | Example |
|--------|-------------|---------|
| `x-api-key` | Your GeonicDB API key | `x-api-key: gdb_live_...` |
| `Fiware-Service` | Tenant name | `Fiware-Service: my-company` |
| `Fiware-ServicePath` | Scope path (optional, default `/`) | `Fiware-ServicePath: /sensors` |

### Example: Create an Entity

```bash
curl -X POST "https://geonicdb.geolonia.com/v2/entities" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: YOUR_TENANT" \
  -d '{
    "id": "urn:ngsi-ld:Sensor:001",
    "type": "Sensor",
    "temperature": {
      "type": "Number",
      "value": 22.5
    }
  }'
```

## API Key Scopes

GeonicDB API keys support the following permission levels:

| Scope | Permissions |
|-------|------------|
| `read` | GET operations only (list, get entities, subscriptions) |
| `readwrite` | GET + POST + PATCH + PUT + DELETE on entities and subscriptions |
| `admin` | Full access including tenant configuration |

Key scope is configured by your Geolonia account manager at provisioning time. The `readwrite` scope is the default for new accounts.

## Security Best Practices

- **Never commit API keys** to version control
- **Use environment variables** to inject keys at runtime:
  ```bash
  export GEONICDB_API_KEY="YOUR_API_KEY"
  curl -H "x-api-key: $GEONICDB_API_KEY" ...
  ```
- **Rotate keys regularly** — contact your account manager to issue a replacement
- **Use read-only keys** for public-facing applications that only need to query data
- **Revoke compromised keys immediately** — contact Geolonia if you suspect a key has been leaked

## Troubleshooting

| Error | Cause | Resolution |
|-------|-------|------------|
| `401 Unauthorized` | Missing or invalid `x-api-key` header | Verify the key value and header name |
| `403 Forbidden` | Key does not have permission for the requested operation | Request a key with the required scope |
| `404 Not Found` | Tenant not found or key not associated with the tenant | Verify `Fiware-Service` header matches your tenant name |

## Next Steps

- [First API Call](/en/saas/first-call) — Detailed walkthrough with code samples in multiple languages
- [First Entity Tutorial](/en/saas/first-entity) — CRUD operations step-by-step
- [Console](/en/saas/console) — Console overview (Coming Soon)
