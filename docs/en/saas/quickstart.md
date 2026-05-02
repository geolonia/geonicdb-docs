---
title: SaaS Quickstart
description: Get from account request to your first GeonicDB API call in 5 minutes — a Sales-led onboarding guide.
outline: deep
---

# SaaS Quickstart

This guide walks you through the complete path from requesting a GeonicDB SaaS account to making your first API call.

::: tip Invitation-only access
GeonicDB SaaS is currently in a **controlled release**. Access is invitation-based and managed by the Geolonia team. [Contact Geolonia](https://www.geolonia.com/contact/) to request an account.
:::

## Overview

```text
┌──────────────────────────────────────────────────────────┐
│  1. Request access  →  Contact Geolonia                  │
│  2. Receive invite  →  Activate your account             │
│  3. Open console    →  app.geonicdb.com (Coming Soon)    │
│  4. Get API key     →  Copy from invitation email        │
│  5. First API call  →  GET /v2/entities                  │
└──────────────────────────────────────────────────────────┘
```

The entire process — from approved account to a working API call — takes about 5 minutes once you have your credentials.

## Step 1: Request Access

GeonicDB SaaS is not open for self-service sign-up. To get started:

1. Go to [https://www.geolonia.com/contact/](https://www.geolonia.com/contact/)
2. Select **GeonicDB SaaS** as the inquiry type
3. Describe your use case (environment data, IoT, smart city, etc.)
4. Geolonia will respond within 1–2 business days

Once approved, you will receive an invitation email with account setup instructions.

## Step 2: Activate Your Account

Follow the instructions in the invitation email to:

- Set a password for your GeonicDB SaaS account
- Confirm your tenant name (e.g., `my-company`)

You will also receive your **API key** directly — keep it secure.

## Step 3: Access the Console

The GeonicDB management console is available at **app.geonicdb.com**.

::: warning Coming Soon
The self-service console at `app.geonicdb.com` is currently under development and not yet publicly available. Your Geolonia account manager will guide you through account setup during onboarding.
:::

See [Console](/en/saas/console) for details on what the console will offer.

## Step 4: Get Your API Key

Your API key is provided during onboarding. If you need to rotate or retrieve it:

- Contact your Geolonia account manager
- Or use the console once it becomes available

See [API Key](/en/saas/api-key) for details.

## Step 5: Make Your First API Call

With your API key, send a request to the GeonicDB API:

```bash
export GEONICDB_API_KEY="YOUR_API_KEY"
export GEONICDB_TENANT="YOUR_TENANT"

curl -X GET "https://geonicdb.geolonia.com/v2/entities" \
  -H "x-api-key: $GEONICDB_API_KEY" \
  -H "Fiware-Service: $GEONICDB_TENANT"
```

::: info API URL note
The GeonicDB SaaS API endpoint `https://geonicdb.geolonia.com` is subject to change during the current preview period. Your account manager will notify you of any updates.
:::

You should receive a `200 OK` with an empty array `[]` if your tenant has no entities yet.

## What's Next

- [Sign Up](/en/saas/sign-up) — Detailed account request process
- [Console](/en/saas/console) — Management console overview
- [API Key](/en/saas/api-key) — API key management
- [First API Call](/en/saas/first-call) — Detailed walkthrough with code samples
- [First Entity Tutorial](/en/saas/first-entity) — Step-by-step entity CRUD tutorial
