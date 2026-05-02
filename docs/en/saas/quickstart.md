---
title: SaaS Quickstart
description: Overview of the 6-step GeonicDB SaaS onboarding flow — from Contact Sales to your first API call.
outline: deep
---

# SaaS Quickstart

GeonicDB SaaS uses a **Sales-led, invitation-only** onboarding model. This page gives you an overview of the complete 6-step flow from requesting access to making your first API call.

::: tip Invitation-only access
GeonicDB SaaS is currently in a **controlled release**. There is no self-service sign-up. [Contact Geolonia](https://www.geolonia.com/contact/) to request access.
:::

## The 6-Step Onboarding Flow

```text
┌────────────────────────────────────────────────────────────────┐
│  Step 1  Contact Sales         →  sign-up.md                  │
│  Step 2  Geolonia contacts you →  onboarding.md               │
│  Step 3  Credentials delivered →  onboarding.md               │
│  Step 4  Create tenant admin   →  tenant-admin-user.md  (CLI) │
│  Step 5  Create API key        →  api-key.md            (CLI) │
│  Step 6  First API call        →  first-call.md               │
└────────────────────────────────────────────────────────────────┘
```

### Step 1 — Contact Sales

Submit a contact request through the Geolonia website. Describe your use case, organization, and region preference.

→ [Sign Up](/en/saas/sign-up)

### Step 2 — Geolonia Contacts You

Geolonia reviews your request (typically within 1–2 business days) and reaches out to discuss your use case and confirm approval.

→ [Onboarding](/en/saas/onboarding)

### Step 3 — Account Credentials Delivered

Once your tenant is provisioned, Geolonia delivers your Admin API endpoint URL, admin username, temporary password, and tenant name.

→ [Onboarding](/en/saas/onboarding)

### Step 4 — Create a Tenant Admin User (CLI)

Use the `geonic` CLI to log in with the delivered credentials and create a tenant admin user for your organization.

→ [Tenant Admin User](/en/saas/tenant-admin-user)

### Step 5 — Create an API Key (CLI)

Use the `geonic` CLI to create an API key for authenticating your application's API requests.

→ [API Key](/en/saas/api-key)

### Step 6 — First API Call

Use your API key to send your first request to the GeonicDB API and verify that everything is working.

→ [First API Call](/en/saas/first-call)

## What's Next

After completing the 6 steps, explore more of what GeonicDB SaaS has to offer:

- [Console](/en/saas/console) — Management console overview (Coming Soon)
- [Demo App](/en/saas/demo-app) — Try the live demo application
- [First Entity Tutorial](/en/saas/first-entity) — Step-by-step CRUD tutorial
