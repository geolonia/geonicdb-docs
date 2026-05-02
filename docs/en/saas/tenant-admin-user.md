---
title: Tenant Admin User
description: How to create a tenant admin user for your GeonicDB SaaS tenant using the geonic CLI.
outline: deep
---

# Tenant Admin User

Step 4 of the SaaS onboarding flow: use the `geonic` CLI to create a tenant and assign an admin user who will manage API keys and access control.

::: tip Step 4 of the SaaS onboarding flow
1. ~~[Contact Sales](/en/saas/sign-up)~~
2. ~~[Geolonia contacts you + credentials delivered](/en/saas/onboarding)~~
3. ~~Account credentials delivered~~
4. **Create a tenant admin user** ← *you are here*
5. [Create an API key](/en/saas/api-key)
6. [First API call](/en/saas/first-call)
:::

## Prerequisites

- `geonic` CLI installed — see [CLI Reference](/en/reference/cli) for installation instructions
- Admin endpoint URL, admin username, and admin password from the [Onboarding](/en/saas/onboarding) step

## Install the CLI

```bash
npm install -g @geolonia/geonicdb-cli
```

Verify the installation:

```bash
geonic --version
```

## Configure the CLI

Point the CLI at your GeonicDB Admin API endpoint:

```bash
geonic config set url https://your-geonicdb-admin.example.com
```

Replace `https://your-geonicdb-admin.example.com` with the Admin endpoint URL provided by Geolonia.

## Log in with Admin Credentials

```bash
geonic auth login
```

When prompted, enter the **admin username** and **admin password** delivered during onboarding.

## Create a Tenant

If a tenant has not yet been created for your organization, create one now:

```bash
geonic admin tenants create '{
  "id": "my-company",
  "displayName": "My Company"
}'
```

Replace `my-company` with your desired tenant identifier (lowercase alphanumeric and hyphens only).

To confirm the tenant was created:

```bash
geonic admin tenants list
```

## Create a Tenant Admin User

Create a user with the `tenant_admin` role for your tenant:

```bash
geonic admin users create '{
  "username": "admin@my-company.com",
  "password": "ChangeMe123!",
  "tenantId": "my-company",
  "roles": ["tenant_admin"]
}'
```

::: tip
Use a strong password for the admin user. The `tenant_admin` role grants full control over the tenant's API keys, entities, and subscriptions.
:::

To confirm the user was created:

```bash
geonic admin users list
```

## What's Next

Your tenant and admin user are now set up. Proceed to create an API key for authenticating API requests.

→ [Create an API Key](/en/saas/api-key)
