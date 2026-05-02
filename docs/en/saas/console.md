---
title: Console
description: Overview of the GeonicDB SaaS management console at app.geonicdb.com — currently Coming Soon.
outline: deep
---

# Console

The GeonicDB management console is the web interface for managing your SaaS account, tenants, and API keys.

::: warning Coming Soon
The console at **app.geonicdb.com** is currently under active development and **not yet publicly available**.

During the current preview period, use the **`geonic` CLI** to manage your account, tenants, and API keys. For operations not yet supported by the CLI, [contact your Geolonia account manager](https://www.geolonia.com/contact/).
:::

## What the Console Will Offer

When released, the console will provide:

### Account Management

- View and manage your organization profile
- Invite and manage team members
- Set role-based access control (RBAC) per user

### Tenant Management

- Create and configure tenants
- Set per-tenant quotas and limits
- View tenant usage metrics (entity count, API call volume, storage)

### API Key Management

- Generate new API keys
- Set key scopes (read-only, read-write, admin)
- Rotate and revoke keys
- View per-key usage logs

### Monitoring Dashboard

- Real-time API call metrics
- Entity count and type distribution
- Subscription status overview
- Error rate and latency graphs

### Data Explorer

- Browse entities across tenants
- Run ad-hoc NGSIv2 queries in the UI
- View and manage active subscriptions
- Export data as JSON or CSV

## Use the CLI in the Meantime

Until the console is available, manage your account using the **`geonic` CLI**:

| Action | CLI Command |
|--------|-------------|
| Create a tenant | `geonic admin tenants create` |
| Create a user | `geonic admin users create` |
| Issue an API key | `geonic admin api-keys create` |
| Rotate an API key | `geonic admin api-keys update <id>` |
| List API keys | `geonic admin api-keys list` |

→ [Tenant Admin User](/en/saas/tenant-admin-user) — CLI guide for tenant and user setup

→ [API Key](/en/saas/api-key) — CLI guide for creating API keys

For actions not yet supported via the CLI, contact your Geolonia account manager at [https://www.geolonia.com/contact/](https://www.geolonia.com/contact/).

## Next Steps

- [Tenant Admin User](/en/saas/tenant-admin-user) — Create users via the CLI
- [API Key](/en/saas/api-key) — Create API keys via the CLI
- [First API Call](/en/saas/first-call) — Make your first request
- [Sign Up](/en/saas/sign-up) — Request a GeonicDB SaaS account
