---
title: API Key
description: How to create a GeonicDB SaaS API key using the geonic CLI — Step 5 of the onboarding flow.
outline: deep
---

# API Key

Step 5 of the SaaS onboarding flow: use the `geonic` CLI to create an API key for authenticating your application's requests to the GeonicDB API.

::: tip Step 5 of the SaaS onboarding flow
1. ~~[Contact Sales](/en/saas/sign-up)~~
2. ~~[Geolonia contacts you + review & approval](/en/saas/onboarding)~~
3. ~~Account credentials delivered~~
4. ~~[Create a tenant admin user](/en/saas/tenant-admin-user)~~
5. **Create an API key** ← *you are here*
6. [First API call](/en/saas/first-call)
:::

## Prerequisites

- `geonic` CLI installed and configured — see [Tenant Admin User](/en/saas/tenant-admin-user)
- Logged in as a `tenant_admin` or `super_admin` user

## Create an API Key

Use the `geonic admin api-keys create` command to create a new API key:

```bash
geonic admin api-keys create '{
  "name": "my-app-key",
  "tenantId": "my-company"
}'
```

The command outputs the new API key value. **Copy and store it securely** — it will not be shown again.

### Create a Key with Rate Limiting

```bash
geonic admin api-keys create '{
  "name": "my-sensor-key",
  "tenantId": "my-company",
  "rateLimit": { "perMinute": 120 }
}'
```

### List Existing API Keys

```bash
geonic admin api-keys list
```

## Using Your API Key

Include the API key in the `x-api-key` request header for every API call:

```bash
export GEONICDB_API_KEY="YOUR_API_KEY"
export GEONICDB_TENANT="my-company"

curl -X GET "https://geonicdb.geolonia.com/v2/entities" \
  -H "x-api-key: $GEONICDB_API_KEY" \
  -H "Fiware-Service: $GEONICDB_TENANT"
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

## Security Best Practices

- **Never commit API keys** to version control
- **Use environment variables** to inject keys at runtime
- **Rotate keys regularly** using `geonic admin api-keys update`
- **Delete compromised keys immediately** using `geonic admin api-keys delete <id>`

## What's Next

With your API key ready, make your first API call to verify the setup.

→ [First API Call](/en/saas/first-call)
