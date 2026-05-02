---
title: Onboarding
description: What happens after you contact Sales — how Geolonia provisions your tenant and delivers account credentials.
outline: deep
---

# Onboarding

After you submit a contact request, Geolonia reviews your use case and provisions your GeonicDB SaaS account. This page covers Steps 2 and 3 of the onboarding flow: what Geolonia does and what you receive.

::: tip Steps 2 & 3 of the SaaS onboarding flow
1. ~~[Contact Sales](/en/saas/sign-up)~~ — already done
2. **Geolonia contacts you** — review and approval ← *you are here*
3. **Account credentials delivered** — tenant name and admin credentials ← *you are here*
4. [Create a tenant admin user](/en/saas/tenant-admin-user) — using the CLI
5. [Create an API key](/en/saas/api-key) — using the CLI
6. [First API call](/en/saas/first-call) — verify your setup
:::

## Step 2: Geolonia Contacts You

After reviewing your request (typically within **1–2 business days**), Geolonia will:

- **Confirm your use case** — ensure GeonicDB SaaS fits your requirements
- **Provision your tenant** — create an isolated tenant for your organization
- **Contact you** — via email or phone to coordinate account setup

If your request is approved, you will proceed to account credential delivery (Step 3). If additional information is needed, Geolonia will reach out with follow-up questions.

## Step 3: Account Credentials Delivered

Once your tenant is provisioned, Geolonia will send you the following credentials securely:

| Item | Description |
|------|-------------|
| **Admin endpoint URL** | The GeonicDB Admin API URL for your tenant |
| **Admin username** | Your initial super-admin or tenant-admin account |
| **Admin password** | Temporary password — change after first login |
| **Tenant name** | Your tenant identifier (e.g., `my-company`) |

::: warning Keep credentials secure
Store the delivered credentials in a password manager or secrets vault immediately. Treat the admin password as a temporary credential and rotate it after your first CLI login.
:::

### Console Access (Coming Soon)

::: warning Coming Soon
The self-service console at `app.geonicdb.com` is currently under development and **not yet publicly available**.

During the current preview period, all account setup is performed via the **`geonic` CLI**. Your Geolonia account manager will guide you through setup.
:::

## What's Next

With your credentials in hand, proceed to create your first tenant admin user via the CLI.

→ [Create a Tenant Admin User](/en/saas/tenant-admin-user)
