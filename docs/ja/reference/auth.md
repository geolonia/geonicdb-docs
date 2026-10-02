---
title: "Authentication Guide"
description: "GeonicDB authentication and authorization guide"
outline: deep
---
# 認証と認可ガイド

このドキュメントは、GeonicDB の認証と認可機能の全体像、セットアップ、および管理について説明します。

## 目次


* [概要](#overview)
  
* [認証アーキテクチャ](#認証アーキテクチャ)
  
* [初期セットアップ](#初期セットアップ)
  
* [ユーザーとテナント管理](#user--tenant-management)
  
* [API Key 認証](#api-key-authentication)
  
  * [API Key トークン交換 (Browser SDK)](#api-key-トークン交換-browser-sdk)
    
  * [DPoP トークンバインディング (RFC 9449)](#dpop-トークンバインディング-rfc-9449)
    
* [OAuth 2.0 M2M 認証](#oauth-20-m2m-認証)
  
* [OIDC 外部 IdP 認証](#oidc-外部-idp-認証)
  
* [XACML ポリシーベース認可](#xacml-ポリシーベース認可)
  
* [認証シナリオリファレンス](#認証シナリオリファレンス)
  
* [トラブルシューティング](#トラブルシューティング)

***

## 概要

GeonicDB は JWT ベースの認証と認可機能を提供します。

### ロール設定

| Role           | Description            | Permissions                                                                                                                                                                                           |
| -------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `super_admin`  | Platform administrator | `/admin/*`, `/auth/*`, `/me/*`, monitoring endpoints (`/statistics`, `/metrics`, `/cache/statistics`) only. **Cannot** access data APIs (`/v2/*`, `/ngsi-ld/*`, `/catalog*`, `/rules*`) — returns 403 |
| `tenant_admin` | Tenant administrator   | Full access within the assigned tenant (admin + data APIs)                                                                                                                                            |
| `user`         | General user           | Read-only by default (GET only). Custom XACML policies can grant write access                                                                                                                         |
| `anonymous`    | Unauthenticated user   | Denied by default. Explicit XACML Permit policy required. No feature flag needed (#748)                                                                                                               |

> **注意**: `super_admin` は SaaS セキュリティのため、プラットフォーム管理操作に制限されています。
> 顧客データの分離が強制されます — `super_admin` 認証情報を持つ Geolonia スタッフはテナントのエンティティデータにアクセスできません。
> 詳細は [#674](https://github.com/geolonia/geonicdb/issues/674) を参照してください。

### 認証フロー

```text
┌─────────┐     POST /auth/login      ┌─────────┐
│  Client │ ─────────────────────────▶│  Server │
└─────────┘                           └─────────┘
     │                                      │
     │◀──── accessToken + refreshToken ─────│
     │                                      │
     │   Authorization: Bearer <token>      │
     │ ────────────────────────────────────▶│
     │                                      │
     │◀─────────── API Response ────────────│
     │                                      │
     │     POST /auth/logout               │
     │ ────────────────────────────────────▶│
     │        (invalidate all tokens)        │
     │◀──────────── 204 ───────────────────│
```

***

## 認証アーキテクチャ

GeonicDB の認証と認可は以下のレイヤーで構成されています。

```text
Request
  ↓
[1. Token Extraction] Retrieve token from Authorization: DPoP/Bearer <token> or X-Api-Key header
  ↓
[2. Authentication (AuthN)] Token verification (attempted in the following order)
  │               2a. Authorization: Bearer <token> → Internal JWT / OIDC verification
  │               2b. X-Api-Key header → API Key verification (SHA-256 hash lookup)
  │                   → Origin check
  │               2c. Internal JWT (HS256) verification → authentication completes immediately on success
  │               2d. OIDC external IdP verification (only when OIDC_ENABLED=true)
  │                   → Signature verification via OIDC Discovery + JWKS (RS256/ES256)
  │                   → Search GeonicDB DB user by email address
  ↓                → requireAuth() / requireAdminAuth() / requireSuperAdminAuth()
[3. IP Restriction]  Admin endpoints only: restriction via ADMIN_ALLOWED_IPS
  ↓
[4. Tenant Isolation] Match Fiware-Service header against user's tenantId
  ↓                → checkTenantAccess()
[5. Authorization (AuthZ)] XACML policy-based authorization (while authentication is enabled)
  ↓                → XacmlService.evaluate()
[6. Endpoint Processing]
```

### 環境変数

| Variable                        | Default                                       | Description                                                                                                                                                                |
| ------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_ENABLED`                  | `true`                                        | Built-in authentication. **Only an explicit `false` disables it** (#1981) — intended for local development only. Never set to `false` on an internet-reachable deployment. |
| `JWT_SECRET`                    | `development-secret-key-change-in-production` | Secret for JWT signing (single-key mode)                                                                                                                                   |
| `JWT_KEYS`                      | -                                             | (#1449) JSON `{kid: secret}` map for multi-key rotation. See [JWT Key Rotation](#jwt-key-rotation-1449)                                                                    |
| `JWT_ACTIVE_KID`                | -                                             | (#1449) `kid` used to sign new tokens (must exist in `JWT_KEYS`)                                                                                                           |
| `JWT_EXPIRES_IN`                | `1h`                                          | Access token expiration                                                                                                                                                    |
| `JWT_REFRESH_EXPIRES_IN`        | `7d`                                          | Refresh token expiration                                                                                                                                                   |
| `SUPER_ADMIN_EMAIL`             | -                                             | Super Admin email address via environment variable                                                                                                                         |
| `SUPER_ADMIN_PASSWORD`          | -                                             | Super Admin password via environment variable                                                                                                                              |
| `ADMIN_ALLOWED_IPS`             | -                                             | Allowed IPs for Admin API access (CIDR)                                                                                                                                    |
| `OIDC_ENABLED`                  | `false`                                       | Enable OIDC external IdP authentication                                                                                                                                    |
| `OIDC_ISSUER`                   | -                                             | OIDC Issuer URL                                                                                                                                                            |
| `OIDC_AUDIENCE`                 | -                                             | OIDC Audience (aud claim)                                                                                                                                                  |
| `TOKEN_INVALIDATION_TABLE_NAME` | -                                             | DynamoDB table name for token invalidation (in-memory when not set)                                                                                                        |

***

## JWT キーローテーション (#1449)

JWT はサーバー内で完結する対称鍵 (HS256) で署名される。既定では単一の `JWT_SECRET` で
署名・検証するため、鍵を漏洩などで即ローテすると **既発行トークンが一斉に無効化** され、
全アクティブセッションが切断される。これを避けるため、`kid` (Key ID) 付きの複数鍵を
サポートする (HS256 のまま・非破壊)。

### 仕組み


* `JWT_KEYS`: `kid` → secret の JSON マップ。例: `{"2026-07":"secretA","2026-10":"secretB"}`
  
* `JWT_ACTIVE_KID`: **署名** に使う `kid` (`JWT_KEYS` に存在必須)。トークン header に `kid` が入る。
  
* `JWT_KEYS` 内の**すべての鍵は検証に有効** — active = 署名 + 検証、その他 = 検証のみ (retiring / next)。
  
* `JWT_KEYS` / `JWT_ACTIVE_KID` 未設定時は `JWT_SECRET` を単一鍵として使う (`kid` なし・従来動作)。
  
* 本機能導入前に発行された `kid` なしトークンは `JWT_SECRET` (legacy) で検証され続ける (移行期の非破壊)。

### ローテ手順


1. **next 鍵を追加**: `JWT_KEYS` に新しい `kid` を追加してデプロイ (検証に有効化。署名はまだ旧鍵)。
   
2. **active を切り替え**: `JWT_ACTIVE_KID` を新 `kid` に変更してデプロイ。新規トークンは新鍵で署名され、
   旧 `kid` のトークンは **retiring として検証され続ける** ため既存セッションは切れない。
   
3. **retiring 鍵を撤去**: 旧トークンの有効期限 (`JWT_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN`) 経過後、
   旧 `kid` を `JWT_KEYS` から外してデプロイ。以降その `kid` のトークンのみ段階的に失効する。

> **`JWT_SECRET` (legacy) の扱い**: マルチキー運用でも `JWT_SECRET` は必須ではないが、設定されている限り
> **`kid` を持たない旧トークン (本機能導入前に発行) を検証し続ける** (移行期の非破壊性)。導入前のトークンが
> 全て失効した後は、`kid`-less トークンの受理を止めるために `JWT_SECRET` を削除する (署名は `JWT_ACTIVE_KID`
> の鍵で行われるため single-key へ戻すのでなければ削除して差し支えない)。単一キー運用に戻す場合は
> `JWT_KEYS`/`JWT_ACTIVE_KID` を外し `JWT_SECRET` を残す。

> Production では `JWT_KEYS` / `JWT_ACTIVE_KID` も単一 JSON 環境シークレット (`geonicdb-<env>`) の
> キーとして解決される (`JWT_SECRET` と同経路、#1449)。

***

## 初期セットアップ

### 1. 環境変数の設定

認証を有効にするため、以下の環境変数を設定します。

```bash
# Required settings
export AUTH_ENABLED=true
export JWT_SECRET=your-very-secure-secret-key-at-least-32-characters

# Super Admin settings (required for initial setup)
export SUPER_ADMIN_EMAIL=admin@example.com
export SUPER_ADMIN_PASSWORD=YourSecurePassword123!

# Optional settings
export JWT_EXPIRES_IN=1h              # Access token expiration (default: 1h)
export JWT_REFRESH_EXPIRES_IN=7d      # Refresh token expiration (default: 7d)
export ADMIN_ALLOWED_IPS=10.0.0.0/8,192.168.1.0/24  # Admin API access restriction
```

### 2. ローカル開発環境の起動

```bash
# Start the server with environment variables set
AUTH_ENABLED=true \
JWT_SECRET=development-secret-key-32chars \
SUPER_ADMIN_EMAIL=admin@localhost \
SUPER_ADMIN_PASSWORD=adminpass123 \
npm start
```

### 3. AWS Lambda へのデプロイ

SAM テンプレートに以下のパラメータを設定します:

```yaml
Parameters:
  AuthEnabled:
    Type: String
    Default: "true"
  JwtSecret:
    Type: String
    NoEcho: true  # Hide secret value
  SuperAdminEmail:
    Type: String
  SuperAdminPassword:
    Type: String
    NoEcho: true
```

### スーパー管理者の登録

スーパー管理者を登録する方法は 2 つあります。

#### 方法 1: 環境変数による設定(推奨)

環境変数を使用して最初のスーパー管理者を設定します。

```bash
export SUPER_ADMIN_EMAIL=admin@example.com
export SUPER_ADMIN_PASSWORD=YourSecurePassword123!
```

**特徴:**

* データベースには保存されない(メモリ上のみ)
  
* サーバー再起動後も同じ認証情報で利用可能
  
* パスワードの変更には環境変数の更新とサーバーの再起動が必要

#### 方法 2: Admin API による追加登録

既存のスーパー管理者としてログイン後、Admin API を使用して新しいスーパー管理者を作成できます。

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "YourSecurePassword123!"
  }'
```

***

## ユーザーとテナントの管理

詳細については、Admin API ドキュメントを参照してください。

### デプロイメントルーティング管理(super\_admin のみ)

ホスト名 → MongoDB クラスタールーティング行。これらはすべてのデプロイメントにまたがるため、`tenant_admin` は読み取りアクセスも拒否されます。そうしないと、テナント管理者が他のすべてのデプロイメントのクラスター配線を読み取ることができてしまいます。[API.md](../api-reference/endpoints.md#deployment-routing-management-super_admin-only) および DEDICATED\_CLUSTER\_ONBOARDING.md を参照してください。

| Endpoint                        | Method | Description                     |
| ------------------------------- | ------ | ------------------------------- |
| `/admin/deployments`            | GET    | List deployment routing rows    |
| `/admin/deployments`            | POST   | Create a deployment routing row |
| `/admin/deployments/{hostname}` | GET    | Get a deployment routing row    |
| `/admin/deployments/{hostname}` | PATCH  | Update a deployment routing row |
| `/admin/deployments/{hostname}` | DELETE | Delete a deployment routing row |

平文の `mongodbUri` は返されません。現在のリクエストを処理しているデプロイメントの削除または無効化は 409 で拒否されます(自己ロックアウトガード)。

### CADDE 設定管理(super\_admin のみ)

| Endpoint       | Method | Description                          |
| -------------- | ------ | ------------------------------------ |
| `/admin/cadde` | GET    | Get CADDE configuration              |
| `/admin/cadde` | PUT    | Update CADDE configuration (upsert)  |
| `/admin/cadde` | DELETE | Delete CADDE configuration (disable) |

CADDE 設定はデプロイメントの MongoDB `settings` コレクション(`_id: 'cadde'`)に保存されます。これは `CADDE_ENABLED` などの環境変数によって制御されて**いません**(`docs/INTEGRATIONS.md` を参照)。CADDE を有効にすると、GeonicDB XACML 行レベルフィルター(#2469)なしで、デプロイメント内の**すべてのテナント**に対して `/cadde/api/v4/*` が公開されます。CADDE と XACML を参照してください。

### テナント管理

| Endpoint                                    | Method | Description                                        |
| ------------------------------------------- | ------ | -------------------------------------------------- |
| `/admin/tenants`                            | GET    | Get tenant list                                    |
| `/admin/tenants`                            | POST   | Create tenant                                      |
| `/admin/tenants/{tenantId}`                 | GET    | Get tenant                                         |
| `/admin/tenants/{tenantId}`                 | PATCH  | Update tenant                                      |
| `/admin/tenants/{tenantId}`                 | DELETE | Delete tenant (`?shred=true` for Crypto-Shredding) |
| `/admin/tenants/{tenantId}/deletion-report` | GET    | Get deletion report (Crypto-Shredding)             |
| `/admin/tenants/{tenantId}/activate`        | POST   | Activate tenant                                    |
| `/admin/tenants/{tenantId}/deactivate`      | POST   | Deactivate tenant                                  |
| `/admin/tenants/{tenantId}/ip-restrictions` | GET    | Get tenant IP restrictions                         |
| `/admin/tenants/{tenantId}/ip-restrictions` | PUT    | Update tenant IP restrictions                      |
| `/admin/tenants/{tenantId}/ip-restrictions` | DELETE | Delete tenant IP restrictions                      |

### ユーザー管理

| Endpoint                               | Method | Description                                                     |
| -------------------------------------- | ------ | --------------------------------------------------------------- |
| `/admin/users`                         | GET    | Get user list                                                   |
| `/admin/users`                         | POST   | Create user                                                     |
| `/admin/users/{userId}`                | GET    | Get user                                                        |
| `/admin/users/{userId}`                | PATCH  | Update user                                                     |
| `/admin/users/{userId}`                | DELETE | Delete user                                                     |
| `/admin/users/{userId}/activate`       | POST   | Activate user                                                   |
| `/admin/users/{userId}/deactivate`     | POST   | Deactivate user                                                 |
| `/admin/users/{userId}/unlock`         | POST   | Clear login lock                                                |
| `/admin/users/{userId}/reset-password` | POST   | Issue a temporary password + force change on next login (#1532) |

#### 初回ログイン時の強制パスワード変更 (#675 / #1321 / #1532)

管理者は **一時パスワード** を発行することでユーザーをオンボードし、ユーザーは初回ログイン時にそれを置き換える必要があります。適用は **1 回限り** です。一時パスワードはブートストラップ用の認証情報であり、新しいパスワードを設定する機能のみを持ちます。使用可能なトークンを発行することはないため、エンティティの読み取りや API キーの発行はできません。

**注意:** 一時パスワードがサーバーで生成されるケースは 2 つあります。(a) `"passwordResetRequired": true` でユーザーを作成する場合(招待)、または (b) 既存のユーザーに対して `reset-password` を呼び出す場合(忘れたパスワードのリセット方法でもあります)。`passwordResetRequired` **なし** でユーザーを作成すると、提供された `password` が直接設定され、変更を強制 **しません**(非破壊的)。

**1. 管理者がアカウントを発行** — 作成時(招待)または事後(リセット)のいずれか

```bash
# (a) Invite: create + issue a temporary password in one call.
#     Do NOT send `password` — the server generates the temporary one (sending both → 400).
curl -X POST http://localhost:3000/admin/users \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","role":"user","primaryTenantId":"<tenant-id>","passwordResetRequired":true}'
# → 201 (Cache-Control: no-store)
#   { "id", ..., "passwordResetRequired": true, "temporaryPassword", "expiresAt" }

# (b) Reset an existing user (forgotten password / re-issue):
curl -X POST http://localhost:3000/admin/users/{userId}/reset-password \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# → { "userId", "temporaryPassword", "expiresAt", "passwordResetRequired": true, "message": ... }
```


* Authorization: `super_admin`(すべてのユーザー)/ `tenant_admin`(自分のテナント内のユーザー)。
  
* 一時パスワードは **1 回のみ** 表示され、レスポンスには `Cache-Control: no-store` が付与されます。有効期限は `PASSWORD_POLICY.TEMP_PASSWORD_VALIDITY_DAYS`(デフォルトは **7 日間**)です。`reset-password` はユーザーの既存セッションを無効化します(招待は新規ユーザーを作成するため、無効化するセッションはありません)。

**2. ユーザーが一時パスワードでログインし、新しいパスワードを設定(1 回の呼び出し)**

```bash
# Without newPassword → 409, no token issued:
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"<temporaryPassword>"}'
# → 409 { "error": "PasswordResetRequired", ... }

# With newPassword → sets the password and returns fresh tokens in the same response:
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"<temporaryPassword>","newPassword":"<newPassword>"}'
# → 200 { "accessToken", "refreshToken", ... }   (no re-login needed)
```

**機械可読エラーキー**(`error` フィールド。CLI/SDK はメッセージではなくこれで分岐します):

| Status | `error`                    | Meaning                                                                                                     |
| ------ | -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `409`  | `PasswordResetRequired`    | Temp password valid; submit `newPassword` to complete login                                                 |
| `403`  | `TemporaryPasswordExpired` | Temp password expired (or issue timestamp missing → fail-closed); ask admin to re-issue                     |
| `400`  | `BadRequest`               | `newPassword` equals the temp password, violates the password policy, or was sent when no reset is required |

**保証**


* パスワードが変更されるまでトークンは発行されません(フェイルクローズ)。ビジネスロジックの分岐は一時パスワードの検証 **後** に行われるため、アカウント状態が認証されていない呼び出し元に漏洩することはありません。
  
* 同時完了は compare-and-set 更新によって保護されます(敗者には `409 Conflict`)。
  
* `refreshToken()` も強制変更が保留中のユーザーを拒否します(多層防御)。
  
* リセットはユーザーの **パスワード由来の JWT セッションのみ** を無効化します — API キー / OAuth クライアントは動作し続けます。侵害が疑われる場合は、それらを個別に取り消すか、ユーザーを `deactivate` してください。
  
* `PATCH /admin/users/{userId}` でパスワードを直接設定すると、強制変更状態が **クリア** され、ユーザーの既存のパスワード由来セッションが **取り消されます** (#1566)。管理者が選択したパスワードはすぐに使用可能になり、ユーザーは次回ログイン時にリセットを求められなくなり、以前のパスワードで発行された古いトークンは動作しなくなります(`reset-password` / `changePassword` と一貫性があります)。

#### テナント存在検証

`tenantId` を持つユーザーを作成または更新する際、システムは指定されたテナントが存在することを検証します。テナントが存在しない場合、`400 Bad Request` エラーが返されます。


* **POST /admin/users**: `tenantId` は既存のテナントを参照する必要があります(`super_admin` ユーザーは例外で、テナントを持ちません)
  
* **PATCH /admin/users/{userId}**: `tenantId` を変更する際、ターゲットテナントは存在する必要があります。`tenantId` を `null` に設定することは検証なしで許可されます。

### テナントメンバーシップ管理

FIWARE Keyrock Organization モデルに準拠し、単一のユーザーは複数のテナントに所属できます。メンバーシップはユーザー作成時に自動的に作成されます。

| Endpoint                                   | Method | Description                    | Authorization                               |
| ------------------------------------------ | ------ | ------------------------------ | ------------------------------------------- |
| `/admin/tenants/{tenantId}/users`          | GET    | List tenant members            | `tenant_admin` (own tenant) / `super_admin` |
| `/admin/tenants/{tenantId}/users/{userId}` | PUT    | Add user to tenant             | `tenant_admin` (own tenant) / `super_admin` |
| `/admin/tenants/{tenantId}/users/{userId}` | DELETE | Remove user from tenant        | `tenant_admin` (own tenant) / `super_admin` |
| `/admin/users/{userId}/tenants`            | GET    | List tenants a user belongs to | Self / `super_admin`                        |

#### テナントスコープログイン

ログイン時にテナントを指定することで、そのテナントにスコープされた JWT トークンを取得できます。テナントはリクエストボディ(`tenantId` または `tenantName`)または HTTP ヘッダーで指定できます。

```bash
# Login with tenantId in request body (UUID)
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password12345",
    "tenantId": "target-tenant-id"
  }'

# Login with tenantName in request body (#1223 — name resolves to tenant ID server-side)
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password12345",
    "tenantName": "my_tenant"
  }'

# Login with NGSILD-Tenant header (resolved by tenant name)
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -H "NGSILD-Tenant: my_tenant" \
  -d '{
    "email": "user@example.com",
    "password": "password12345"
  }'
```

**テナント解決の優先順位:**

1. `body.tenantId` — 直接テナント ID 指定(最優先)
   
2. `body.tenantName` — ボディ内のテナント名、サーバー側で解決(#1223)
   
3. `NGSILD-Tenant` / `Fiware-Service` ヘッダー — テナント名で解決
   
4. プライマリテナント(`user.tenantId`)— 何も指定されていない場合のフォールバック

`tenantId` と `tenantName` はリクエストボディ内で**相互排他的**です — 両方を指定すると `400 Bad Request` が返されます。

テナント名の一意性は、`tenants.name` の部分一意インデックスによってシステム全体で強制されます(ソフト削除されたテナントを除く、#1223)。これは、`Fiware-Service`、`NGSILD-Tenant`、および `body.tenantName` 全体で名前ベースの解決を明確にするための前提条件です。

**動作:**

* `tenantId` が指定されている場合:メンバーシップを確認した後、そのテナントにスコープされたトークンを発行
  
* `tenantName` が指定されている場合(ボディまたはヘッダー):テナント名でテナントを解決します。テナント名が見つからない場合、または無効な形式の場合(ヘッダーの場合は `^[a-z0-9_]+$` に一致する必要があります)、`400 Bad Request` を返します
  
* テナント指定がない場合:プライマリテナント(`user.tenantId`)のトークンを発行します。ユーザーが複数のテナントに所属している場合、レスポンスには `availableTenants` リストが含まれます
  
* ユーザーが所属していないテナントを指定した場合:`403 Forbidden`

#### メンバーシップのライフサイクル


* **ユーザー作成時**:`POST /admin/users` を介してメンバーシップが自動的に作成されます
  
* **追加登録**:`PUT /admin/tenants/{tenantId}/users/{userId}` を介して別のテナントに追加
  
* **テナント削除時**:すべてのテナント関連データがカスケード削除されます(entities、subscriptions、registrations、temporalEntities、snapshots、rules、policies、OAuth clients、data models、users、memberships など — 全 16 コレクション)
  
* **ユーザー削除時**:ユーザーに関連付けられたすべてのメンバーシップが自動的に削除されます

### テナント別 CORS Allowed Origins (#1069)

GeonicDB はリクエストの `Origin` ヘッダーをテナントレベルのホワイトリストに対して検証します。これは API-Key の `allowedOrigins` の上に重ねられ、匿名、JWT、および API-Key リクエストのすべてに適用されます。GeonicDB はマルチテナント Context Broker であるため、allowed origins を環境変数で固定することは**できません** — ランタイムで管理 API を通じてテナントごとに設定する必要があります。

#### エンドポイント

標準のテナント設定エンドポイントを使用します:

```http
PATCH /admin/tenants/{tenantId}
Content-Type: application/json
Authorization: Bearer <super_admin token>

{
  "settings": {
    "allowedOrigins": ["https://app.example.com", "https://admin.example.com"]
  }
}
```

#### `allowedOrigins` のセマンティクス

| Value                              | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Field absent                       | All origins allowed (backward compat — existing tenants unaffected).                                                                                                                                                                                                                                                                                                                                                              |
| `[]` (explicit empty array)        | All origins denied.                                                                                                                                                                                                                                                                                                                                                                                                               |
| `["*"]`                            | All origins allowed. Requests without `Origin` header (curl / S2S / CLI) also pass.                                                                                                                                                                                                                                                                                                                                               |
| `["https://app.example.com", ...]` | Exact match (max 50 entries; protocol + host + port). Requests without `Origin` header are denied.                                                                                                                                                                                                                                                                                                                                |
| `["https://*.example.com", ...]`   | Subdomain wildcard. `*` must be the leading host label and matches **one or more** labels — `https://a.example.com` and `https://a.b.example.com` match, the apex `https://example.com` does not (add an exact entry if needed). Scheme and port must match exactly, and lookalike domains (`https://evil-example.com`) do not match. Intended for CI/CD deploy previews (e.g. Cloudflare Pages `https://*.<project>.pages.dev`). |

#### 実施


* **Preflight (OPTIONS)** は origin 検証されません (CORS 仕様: テナントヘッダーは preflight に含まれません)。常にリクエストの `Origin` をエコーバックし、204 を返します。
  
* **実際のリクエスト** は `optionalAuth(event, tenantService)` (データ API) または `requireAuth(event)` (管理 / `/auth/logout`) を通過します。origin が一致しない場合、リクエストは `403 Forbidden` で拒否され、ボディには `Origin not allowed for this tenant` が返されます。
  
* 403 レスポンスには `Access-Control-Allow-Origin` のエコーバック + `Vary: Origin` が含まれるため、ブラウザは実際のエラーをクライアントに表示できます (そうでなければ開発者には一般的な Network エラーが表示されます)。
  
* `super_admin` ユーザー (`tenantId: null`) は origin 検証をスキップします — 彼らはテナントスコープの上で動作します。

#### API Key `allowedOrigins` との階層化

API Key が使用される場合、両方のチェックが適用されます:


1. **テナントレベル**: `tenant.settings.allowedOrigins` を満たす必要があります。
   
2. **API-Key レベル**: `apiKey.allowedOrigins` を満たす必要があります (既存の動作、変更なし)。

最も制限的なものが優先されます。

#### geonicdb-console staging (`console.geonicdb.geolonia.com`

) (#2022)

[geonicdb-console](https://github.com/geolonia/geonicdb-console) staging は `https://console.geonicdb.geolonia.com` から実際のバックエンド (`https://geonicdb.geolonia.com`) に、パスワードログイン + `/auth/dpop-bind` (RFC 9449) を使用して接続します。HTTP ミドルウェアの変更は必要ありません:


* **CORS preflight** はコンソールの origin をエコーバックし、すでに `Authorization` と `DPoP` を許可しています (`src/config/defaults.ts` の `CORS_ALLOW_HEADERS`)。
  
* **実際のリクエスト** は認証フェーズで `tenant.settings.allowedOrigins` (および該当する場合は API-key の `allowedOrigins`) によってゲートされます。

専用の staging QA テナント (慣例では `console-qa`) の場合。**これが意味を持つには、テナントが存在している必要があります** — 2026-08-11 時点では、まだ `https://geonicdb.geolonia.com` にプロビジョニングされていません。まずプロビジョニングを行い (`geonicdb-infra-cdk/scripts/provision-tenants.sh`)、その後確認してください:

| `settings.allowedOrigins`                | Action needed                                                                                             |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Field absent (`undefined`)               | None — backward-compat all-allow                                                                          |
| `["*"]`                                  | None                                                                                                      |
| `["https://*.geonicdb.geolonia.com"]`    | None — covers `console.geonicdb.geolonia.com`                                                             |
| Explicit list without the console origin | Add `https://console.geonicdb.geolonia.com` (or the wildcard above) via `PATCH /admin/tenants/{tenantId}` |

デプロイされた環境に対して検証してください。preflight はコンソールの origin をエコーバックし、`Authorization` と `DPoP` の両方をリストする必要があります:

```bash
curl -sSD - -o /dev/null -X OPTIONS https://geonicdb.geolonia.com/auth/dpop-bind \
  -H 'Origin: https://console.geonicdb.geolonia.com' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: authorization,dpop,content-type' \
  | grep -i '^access-control-'
```

preflight はテナント非依存であるため、独立して応答します。以下のテナントプローブは**テナントがプロビジョニングされた後にのみ解釈可能**です:

```bash
curl -sS https://geonicdb.geolonia.com/v2/entities \
  -H 'Origin: https://console.geonicdb.geolonia.com' \
  -H 'Fiware-Service: console-qa'
```

| Response body                                  | Meaning                                                                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `Origin not allowed`                           | Origin check **rejected** — add the console origin to `allowedOrigins`                                               |
| `Access denied` (403)                          | Origin check **passed**; only authorization rejected the anonymous caller (expected)                                 |
| `Invalid tenant header value` / 400 / NotFound | **Not an Origin verdict** — the tenant does not exist. Provision it and re-run; do not read this as "origin is fine" |

3 行目は fail-open トラップです: プロビジョニングされていないテナントは origin チェックに到達しないため、`Origin not allowed` がないことは何も証明しません。

テナントの現在の設定を直接読み取るには、super-admin トークンで `GET /admin/tenants` を実行し、`settings.allowedOrigins` を検査してください。

`Access-Control-Allow-Credentials` は意図的に**設定されていません** — コンソールはクッキーではなく、ヘッダーベースの Bearer + DPoP を使用します。

### テナント毎の IP 制限

テナント毎に固有の IP アドレス制限を設定できます。グローバル設定(`ADMIN_ALLOWED_IPS`)に加えて、テナントレベルでのきめ細かいアクセス制御が可能です。

#### エンドポイント

| Endpoint                                    | Method | Description                                       |
| ------------------------------------------- | ------ | ------------------------------------------------- |
| `/admin/tenants/{tenantId}/ip-restrictions` | GET    | Get IP restriction settings                       |
| `/admin/tenants/{tenantId}/ip-restrictions` | PUT    | Update IP restriction settings                    |
| `/admin/tenants/{tenantId}/ip-restrictions` | DELETE | Delete IP restriction settings (reset to default) |

#### スコープ

| Scope   | Description                                        |
| ------- | -------------------------------------------------- |
| `admin` | Restrict access to the Admin API (`/admin/*`) only |
| `all`   | Restrict access to all API endpoints               |

#### フォールバック動作

テナントに IP 制限が設定されていない場合、グローバル設定(`ADMIN_ALLOWED_IPS` 環境変数)が適用されます。テナントレベルの設定が存在する場合は、そちらが優先されます。

#### リクエスト例

**IP 制限設定の取得:**

```bash
curl -X GET http://localhost:3000/admin/tenants/{tenantId}/ip-restrictions \
  -H "Authorization: Bearer <accessToken>"
```

**レスポンス例:**

```json
{
  "tenantId": "abc123",
  "tenantName": "my-tenant",
  "ipRestrictions": {
    "enabled": false,
    "allowedIps": [],
    "scope": "admin"
  },
  "globalFallback": null
}
```

**IP 制限設定の更新:**

```bash
curl -X PUT http://localhost:3000/admin/tenants/{tenantId}/ip-restrictions \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "allowedIps": ["192.168.1.0/24", "10.0.0.1"],
    "scope": "admin"
  }'
```

**IP 制限設定の削除:**

```bash
curl -X DELETE http://localhost:3000/admin/tenants/{tenantId}/ip-restrictions \
  -H "Authorization: Bearer <accessToken>"
```

***

## API キー認証

GeonicDB は JWT/OAuth トークンの軽量な代替手段として API キーベースの認証をサポートしています。API キーは公開統合、ブラウザベースのアプリケーション、完全な OAuth 認証情報が不要なシナリオに最適です。

### 概要

API キーは、オリジンとレート制限の組み込み制限、および `policyId` を介したオプションの XACML ポリシーバインディングを備えた、よりシンプルな認証メカニズムを提供します。

### 認証ヘッダー

```http
X-Api-Key: <UUID or gdb_-prefixed key>
```

**優先順位**: `Authorization: Bearer` と `X-Api-Key` ヘッダーの両方が存在する場合、Bearer トークンが優先されます。API キーは Bearer トークンが提供されていない場合のフォールバックとしてのみ使用されます。

### キーフォーマット


* **新しいキー**: プレーン UUID(`randomUUID()`)— 例:`550e8400-e29b-41d4-a716-446655440000`
  
* **レガシーキー**: `gdb_` プレフィックス付きの既存のキーは引き続き動作します(後方互換性あり)
  
* **ストレージ**: キーの SHA-256 ハッシュのみがデータベースに保存されます。平文のキーは作成時とリフレッシュ時にのみ返されます。
  
* **マスキング**: リストと取得のレスポンスは、実際のキーの代わりに `"key": "******"` を返します

### 制限事項

| Field              | Description                                                                                                                                                                                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Origin**         | `allowedOrigins` — list of permitted URL origins, subdomain wildcards (`https://*.example.com`), or `*` for any. At least 1 required. Max 20 entries. Enforced at runtime. Wildcard semantics are the same as the tenant-level list (see [`allowedOrigins` Semantics](#allowedorigins-semantics)). |
| **Policy Binding** | `policyId` — optional. Binds the key to an existing XACML policy. The bound policy's target is bypassed during evaluation (only rules are evaluated). Without `policyId`, the key falls back to tenant policies + role default (api\_key = All Deny).                                              |
| **Rate Limit**     | `rateLimit.perMinute` — requests per minute (1–1000, default: 60).                                                                                                                                                                                                                                 |

### API キー管理(管理者)

管理者は任意のユーザーの API キーを管理できます。

| Endpoint                          | Method | Description                                              |
| --------------------------------- | ------ | -------------------------------------------------------- |
| `/admin/api-keys`                 | POST   | Create API key (returns raw key in response)             |
| `/admin/api-keys`                 | GET    | List API keys (paginated, `X-Total-Count` header)        |
| `/admin/api-keys/{keyId}`         | GET    | Get API key details                                      |
| `/admin/api-keys/{keyId}`         | PATCH  | Update API key                                           |
| `/admin/api-keys/{keyId}`         | DELETE | Delete API key                                           |
| `/admin/api-keys/{keyId}/refresh` | POST   | Refresh (regenerate) API key — returns new plaintext key |

### セルフサービス API キー管理

ユーザーは管理者権限なしで自分自身の API キーを作成・管理できます。

| Endpoint                       | Method | Description                                                  |
| ------------------------------ | ------ | ------------------------------------------------------------ |
| `/me/api-keys`                 | POST   | Create own API key                                           |
| `/me/api-keys`                 | GET    | List own API keys                                            |
| `/me/api-keys/{keyId}`         | PATCH  | Update own API key (partial)                                 |
| `/me/api-keys/{keyId}`         | DELETE | Delete own API key                                           |
| `/me/api-keys/{keyId}/refresh` | POST   | Refresh (regenerate) own API key — returns new plaintext key |

**制限事項:**

* ユーザーあたり最大 **5 個のキー**
  
* 作成時に `allowedOrigins` が必須(非空配列; すべてのオリジンを許可する場合は `["*"]` を使用、サブドメインワイルドカードの場合は `https://*.example.com` を使用)
  
* `policyId` はオプション — 指定する場合、参照されるポリシーは既に存在している必要があり、同じユーザーによって作成されている必要があります
  
* `tenantId` は `super_admin` に必須(欠落時は 400); `tenant_admin` は省略可能(セッションから自動導出)

> **オーナー制限の継承 (#1363 / #1376)。** **personal スコープ**のバインドされたポリシーを持つセルフサービス認証情報(API キーまたは OAuth クライアント)は、そのオーナーに課せられた制限を超えることはできません。認可時、バインドされた `personal` ポリシーが存在する場合、リクエストはオーナーの ID でテナントポリシーに対して再評価されます; オーナーが**拒否**される場合(例えば、`role=user`/`userId` をターゲットとする `tenant_admin` ポリシーがオーナーを特定の `Fiware-ServicePath` または読み取り専用に制限している場合)、認証情報も拒否されます。これにより、制限されたユーザーが自作の無制約の `Permit` を自分のキー/クライアントにバインドすることでテナント `Deny` を回避できるバイパスが閉じられます。管理者が発行した認証情報は `tenant` スコープのポリシーをバインドし、影響を受けません。
>
> **リスト読み取り**(#1337/#1369 のポリシーからフィルタへの行レベルセキュリティパスを使用する、型なし `GET /entities`)の場合、オーナー制限はバイナリ拒否ではなく**フィルタ交差**として適用されます(#1376): 認証情報の読み取り可能エンティティフィルタはオーナーの読み取り可能エンティティフィルタと交差され、認証情報はオーナーが見ることができる行を正確に見ることができます(例: オーナーの許可された `entityType` にフィルタされる)、一律 403 ではありません。これにより、リスト読み取りのパリティは認証情報を過度に制限するのではなく、オーナーとの一貫性を保ちます。
>
> オーナー検索自体は、`loadBoundPolicy` と同様に、**決定論的不在**を**一時的な I/O 障害**から区別します(#2341)。削除されたオーナー(`UserRepository.getById` が `null` を返す)は `role=user` / 空のメールとしてフェイルクローズされます。Mongo 切断またはレプリカセットフェイルオーバーは**再スロー**され、その不在に折り畳まれません: リスト読み取りは他の場合 `unrestricted` (user GET デフォルト)または `kind:'none'` を合成し、通知パスは後者を `SUBSCRIPTION_NOTIFICATION_RLS_DENIED` にマップします — 永久的なドロップで、再試行されません。再試行可能な I/O エラーは `deriveSubscriberReadFilter` の `'unresolved'` ブランチ(#2289)に到達するため、Lambda は再配信できます。したがって HTTP 呼び出し元は同じブリップに対して**403**(パーミッション拒否のように見える)ではなく**500**(再試行)を受け取ります。

**PATCH 更新可能フィールド**(`PATCH /me/api-keys/{keyId}`):

| Field            | Type                 | Description                                                  |
| ---------------- | -------------------- | ------------------------------------------------------------ |
| `name`           | string               | Key name                                                     |
| `allowedOrigins` | string\[]            | Allowed origins (min 1 entry)                                |
| `policyId`       | string \| null | Policy binding (must be created by you, or `null` to unbind) |
| `rateLimit`      | object               | Rate limit override                                          |
| `dpopRequired`   | boolean              | Require DPoP proof                                           |
| `isActive`       | boolean              | Activate / deactivate the key                                |

### リクエスト例

#### API Key を作成する

```bash
curl -X POST http://localhost:3000/admin/api-keys \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Public Dashboard",
    "allowedOrigins": ["https://dashboard.example.com"],
    "rateLimit": { "perMinute": 120 }
  }'
```

> **注意:** `keyId` は自動生成されます (UUID)。`tenantId` は `super_admin` に必須です。`tenant_admin` は省略可能です (セッションから自動導出されます)。`policyId` はオプションです。省略された場合、認可はテナントポリシー + ロールデフォルトにフォールバックします。ID (`keyId`、`policyId`) はテナントごとに一意です。

**レスポンス** (`201 Created`、`Location: /admin/api-keys/{keyId}`):

```json
{
  "keyId": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Public Dashboard",
  "key": "550e8400-e29b-41d4-a716-446655440000 (plaintext key, shown only at creation and refresh)",
  "allowedOrigins": ["https://dashboard.example.com"],
  "policyId": "dashboard-readonly",
  "rateLimit": { "perMinute": 120 },
  "isActive": true,
  "tenantId": "my-tenant-id",
  "createdBy": "user-uuid",
  "lastUsedAt": null,
  "createdAt": "2026-03-07T00:00:00.000Z",
  "updatedAt": "2026-03-07T00:00:00.000Z"
}
```

> **注意:** `keyPrefix` フィールドは削除されました。`key` フィールドは作成時とリフレッシュ時のみプレーンテキストとして返されます。リスト/取得レスポンスでは `"key": "******"` が返されます。
>
> **後方互換性:** `gdb_` プレフィックスを持つ既存のキーは有効なままであり、引き続き動作します。新しく作成されたキーのみが UUID 形式を使用します。

#### API Key をリフレッシュする

```bash
curl -X POST http://localhost:3000/me/api-keys/{keyId}/refresh \
  -H "Authorization: Bearer <accessToken>"
```

キー値を再生成します。古いキーは直ちに無効化されます。レスポンスには新しいプレーンテキストキーが含まれます (作成レスポンスと同じ形式)。

#### API Key を使用する

```bash
curl -X GET http://localhost:3000/v2/entities?type=TemperatureSensor \
  -H "X-Api-Key: 550e8400-e29b-41d4-a716-446655440000" \
  -H "Fiware-Service: mytenant"
```

### デフォルトと制限

| Parameter           | Value                        |
| ------------------- | ---------------------------- |
| Max keys per user   | 5                            |
| Max allowed origins | 20                           |
| Default rate limit  | 60 requests/minute           |
| Max rate limit      | 1000 requests/minute         |
| Key length          | 32 bytes (64 hex characters) |

### ポリシーバインディング (`policyId`

)

デフォルトでは、API キーには `Deny` ポリシー (`__default_api_key`、優先度 -2) が設定されています。権限を付与するには、まず XACML ポリシーを作成し、次に `policyId` フィールドを介して API キーにバインドします。

#### ワークフロー

```bash
# 1. Create a policy (policyId is auto-generated when omitted)
curl -X POST http://localhost:3000/admin/policies \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "rules": [{ "ruleId": "permit", "effect": "Permit" }]
  }'
# Response: { "policyId": "550e8400-...", ... }

# 2. Create API key with policyId binding
curl -X POST http://localhost:3000/admin/api-keys \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sensor key",
    "allowedOrigins": ["*"],
    "policyId": "<policyId from step 1>"
  }'
```

> **注:** `policyId` と `ruleId` は省略すると自動生成されます (UUID)。ID はテナントごとに一意です。異なるテナントは同じ ID を独立して使用できます。

`policyId` が指定されている場合、バインドされたポリシーの `target` は評価中にバイパスされ、ポリシーの `rules` のみが評価されます。これにより、単一のポリシーをターゲットの競合なしに複数の認証情報間で共有できます。

#### 動作

| `policyId`            | Behavior                                             |
| --------------------- | ---------------------------------------------------- |
| Specified (valid)     | Bound policy rules are evaluated (target bypassed)   |
| Specified (not found) | 400 error at creation/update                         |
| `null` or omitted     | Tenant policies + role default (api\_key = All Deny) |

#### ポリシーバインディングの更新

`PATCH /admin/api-keys/{keyId}` を使用して、ポリシーバインディングを変更または削除します (管理者):

```bash
# Change the bound policy
curl -X PATCH http://localhost:3000/admin/api-keys/{keyId} \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"policyId": "new-policy"}'

# Remove policy binding (revert to default Deny)
curl -X PATCH http://localhost:3000/admin/api-keys/{keyId} \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"policyId": null}'
```

セルフサービスキーの場合は、`PATCH /me/api-keys/{keyId}` を使用します。`policyId` は認証されたユーザーによって作成されたポリシーを参照する必要があります:

```bash
curl -X PATCH http://localhost:3000/me/api-keys/{keyId} \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"policyId": "my-readonly-policy"}'
```

### API Key トークン交換 (Browser SDK)

ブラウザベースのアプリケーションでは、鍵の露出リスクがあるため、API キーを `X-Api-Key` ヘッダーで直接使用することはできません。代わりに、GeonicDB は Nonce + Proof of Work を介して API キーを短期間有効なセッション JWT に変換するトークン交換フローを提供します。

#### フロー

```text
Browser                              GeonicDB
  │                                      │
  │  POST /auth/nonce                    │
  │  Headers: Origin: <origin>           │
  │  Body: { api_key }                   │
  │ ──────────────────────────────────►  │
  │  { nonce, challenge, difficulty }    │
  │ ◄──────────────────────────────────  │
  │                                      │
  │  [Solve PoW: SHA256(challenge+n)]    │
  │                                      │
  │  POST /oauth/token                   │
  │  Headers: Origin: <origin>           │
  │  Body: { grant_type: "api_key",      │
  │          api_key, nonce, proof }     │
  │ ──────────────────────────────────►  │
  │  { access_token, token_type,         │
  │    expires_in, scope }               │
  │ ◄──────────────────────────────────  │
  │                                      │
  │  GET /v2/entities                    │
  │  Authorization: Bearer <JWT>         │
  │ ──────────────────────────────────►  │
```

#### セキュリティレイヤー


1. **Origin 検証**: Nonce は HMAC を介してリクエスト Origin に紐付けられ、Origin が一致しない場合は拒否されます
   
2. **HMAC Nonce**: ステートレス、サーバーシークレットで署名され、timestamp + Origin + keyId を含みます。TTL は 60 秒
   
3. **Proof of Work**: SHA-256 ベース、difficulty=4 (先頭 4 ビットがゼロ)。外部依存なしで自動化された悪用を防止します
   
4. **短期間有効な JWT**: `api_key_session` タイプ、1 時間で期限切れ、policyId を埋め込み

#### JavaScript SDK

GeonicDB は npm パッケージ (`@geolonia/geonicdb-sdk`) として JavaScript SDK を提供しており、トークン交換フロー全体を自動的に処理します:

```javascript
import GeonicDB from '@geolonia/geonicdb-sdk';

const db = new GeonicDB({
  apiKey: 'gdb_your_api_key_here',
  tenant: 'your-tenant',
  baseUrl: 'https://your-geonicdb-instance'
});

db.getEntities({ type: 'TemperatureSensor' }).then(function(entities) {
  console.log(entities);
});
```

SDK は nonce の取得、PoW の解決、トークンの更新を透過的に処理します。

#### 外部トークンのインジェクション

外部で Bearer JWT ログインを使用する場合(例:アプリケーションレベルのログインフロー)、`setCredentials()` を介してトークンを SDK に注入し、`on('tokenRefresh', cb)` でトークン更新の同期のためのコールバックを登録します:

```javascript
var db = new GeonicDB({ tenant: 'my-tenant', baseUrl: 'https://...' });

// Inject tokens obtained from an external login flow
db.setCredentials({
  token: loginResponse.accessToken,
  tokenType: 'Bearer',
  expiresIn: loginResponse.expiresIn,
  refreshToken: loginResponse.refreshToken
});

// Sync refreshed tokens to application state (e.g., localStorage)
db.on('tokenRefresh', function(creds) {
  saveToStorage({ accessToken: creds.token, refreshToken: creds.refreshToken });
});
```

> **注意**: `setCredentials()` が `tokenType: 'Bearer'` と `refreshToken` で呼び出された場合、以降のすべての API 呼び出しと `connect()` は DPoP/PoW を完全にバイパスします。トークンの更新は `/auth/refresh` を使用するため、PoW の再計算は不要です。

詳細については SDK ドキュメントを参照してください。

### DPoP トークンバインディング (RFC 9449)

GeonicDB は [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) に準拠した DPoP (Demonstration of Proof-of-Possession) をサポートし、トークンをクライアントが保持する暗号鍵にバインドします。これによりトークンの盗難とリプレイのリスクが排除されます — JWT が傍受されても、対応する秘密鍵がなければ使用できません。

#### 動作原理


1. **鍵ペア生成**: クライアントは ECDSA P-256 鍵ペアを生成します (SDK は `crypto.subtle.generateKey` を `extractable: false` で使用)
   
2. **DPoP 証明を用いたトークン交換**: クライアントは `POST /oauth/token` の際に証明 JWT を含む `DPoP` ヘッダーを送信
   
3. **トークンバインディング**: サーバーは証明を検証し、JWK Thumbprint ([RFC 7638](https://datatracker.ietf.org/doc/html/rfc7638)) を発行した JWT の `cnf.jkt` として埋め込みます
   
4. **リクエストごとの証明**: 各 API リクエストには新しい DPoP 証明が含まれます; サーバーは証明の `jkt` がトークンの `cnf.jkt` と一致することを検証します

#### DPoP フロー

```text
Browser                              GeonicDB
  │                                      │
  │  [Generate ECDSA P-256 key pair]     │
  │                                      │
  │  POST /oauth/token                   │
  │  Headers: Origin: <origin>           │
  │           DPoP: <proof JWT>          │
  │  Body: { grant_type: "api_key",      │
  │          api_key, nonce, proof }      │
  │ ──────────────────────────────────►  │
  │  { access_token (cnf.jkt bound),    │
  │    token_type: "DPoP", ... }         │
  │ ◄──────────────────────────────────  │
  │                                      │
  │  GET /v2/entities                    │
  │  Authorization: DPoP <JWT>           │
  │  DPoP: <new proof JWT>              │
  │ ──────────────────────────────────►  │
  │  [Verify proof jkt == token cnf.jkt] │
```

#### DPoP-Nonce (RFC 9449 セクション 8)

GeonicDB は RFC 9449 セクション 8 に従ってサーバー提供の nonce を実装し、事前計算された DPoP 証明を防止します。nonce ハンドシェイクは透過的に行われます:


1. クライアントは `nonce` クレームなしで DPoP 証明を送信
   
2. サーバーは `error: "use_dpop_nonce"` と `DPoP-Nonce` レスポンスヘッダーを含む `400` を返却
   
3. クライアントは `nonce` クレームにサーバー nonce を含む新しい DPoP 証明を作成
   
4. サーバーは nonce を検証してトークンを発行; レスポンスには後続リクエスト用の新しい `DPoP-Nonce` が含まれます

```text
Browser                              GeonicDB
  │                                      │
  │  POST /oauth/token                   │
  │  DPoP: <proof (no nonce)>            │
  │ ──────────────────────────────────►  │
  │  400 { error: "use_dpop_nonce" }     │
  │  DPoP-Nonce: <server-nonce>          │
  │ ◄──────────────────────────────────  │
  │                                      │
  │  POST /oauth/token                   │
  │  DPoP: <proof (nonce: server-nonce)> │
  │ ──────────────────────────────────►  │
  │  200 { access_token, token_type }    │
  │  DPoP-Nonce: <next-nonce>            │
  │ ◄──────────────────────────────────  │
```

nonce はステートレス (HMAC ベース) で、TTL は 300 秒です。データベースストレージは不要です。

DPoP バインドされたトークンを使用する API リクエストにも nonce が必要です。サーバーはすべての成功レスポンスと `use_dpop_nonce` メッセージを含む `401` エラーで `DPoP-Nonce` ヘッダーを返却します。

#### `htu` 検証とローカル HTTP 開発

各 DPoP 証明は、サーバーが再構築するリクエスト URL と一致する必要がある `htu` (HTTP URI) クレームを含みます。サーバーはスキームを `X-Forwarded-Proto` (本番環境では API Gateway / CloudFront によって `https` に設定) から導出し、そのヘッダーが存在しない場合はデフォルトで `https` を使用します。

このデフォルト設定は、プロキシなしの**ローカル HTTP 開発**を妨げます: SDK は `baseUrl` から `htu` に署名します (例: `http://localhost:3001/oauth/token`) が、サーバーは `https://localhost:3001/...` を再構築するため、永続的な `htu_mismatch` (400) が発生し、DPoP トークン交換がブロックされます (#1153)。

HTTP でローカル開発を行うには、サーバーを localhost モードで実行してください (`npm start` は無条件で有効化 — ENV.md を参照)。その場合のみ、**かつ `Host` ヘッダーがループバック** (`localhost` / `127.0.0.0/8` / `[::1]`、ポートはオプション、大文字小文字区別なし) である場合のみ、サーバーはスキームを `http` として導出し、SDK の `http` `baseUrl` と一致します。`X-Forwarded-Proto` が存在する場合は常に優先されます。本番環境 (Lambda) では localhost モードは決してアクティブにならないため、攻撃者が `Host: localhost` を偽装しても導出スキームをダウングレードできません — 両方の条件が成立する必要があります (AND)。

#### DPoP 証明 JWT 構造

```json
// Header
{
  "typ": "dpop+jwt",
  "alg": "ES256",
  "jwk": { "kty": "EC", "crv": "P-256", "x": "...", "y": "..." }
}

// Payload
{
  "jti": "<unique identifier>",
  "htm": "POST",
  "htu": "https://api.example.com/oauth/token",
  "iat": 1710000000,
  "nonce": "<server-issued DPoP-Nonce>",
  "ath": "<SHA-256 hash of access token>"  // Only for API requests, not token exchange
}
```

| Claim   | Description                                                    |
| ------- | -------------------------------------------------------------- |
| `jti`   | Unique proof identifier (replay prevention)                    |
| `htm`   | HTTP method of the request                                     |
| `htu`   | HTTP URI of the request (scheme + host + path)                 |
| `iat`   | Issued-at timestamp (max age: 120 seconds)                     |
| `nonce` | Server-issued DPoP-Nonce (required when server enforces nonce) |
| `ath`   | Access token hash (required when using with a bound token)     |

#### `dpopRequired` フラグ

API キーは、作成時に `dpopRequired: true` を設定することで DPoP を強制できます:

```bash
curl -X POST https://api.example.com/admin/api-keys \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "secure-key", "allowedOrigins": ["https://app.example.com"], "dpopRequired": true}'
```

`dpopRequired` が `true` の場合、有効な `DPoP` ヘッダーなしでトークン交換を行うと `400 invalid_dpop_proof` が返されます。

#### Bearer フォールバック

トークン交換時に `DPoP` ヘッダーが送信されない場合(かつ `dpopRequired` が `false` の場合)、サーバーはバインディングなしの標準的な `Bearer` トークンを発行します。これにより、DPoP をサポートしないクライアントとの下位互換性が維持されます。

| DPoP Header    | `dpopRequired` | Result                                      |
| -------------- | -------------- | ------------------------------------------- |
| Present, valid | `false`        | `token_type: "DPoP"` with `cnf.jkt` binding |
| Present, valid | `true`         | `token_type: "DPoP"` with `cnf.jkt` binding |
| Absent         | `false`        | `token_type: "Bearer"` (no binding)         |
| Absent         | `true`         | `400 invalid_dpop_proof` (rejected)         |

> **注意**: すべての DPoP バインドリクエスト(トークン交換と API 呼び出し)は nonce ハンドシェイクに参加します。JavaScript SDK はこれを透過的に処理します。

#### SDK DPoP サポート

JavaScript SDK (`@geolonia/geonicdb-sdk`) は、`crypto.subtle` が利用可能な場合に自動的に DPoP を有効にします:


* 初期化時に抽出不可能な ECDSA P-256 キーペアを生成
  
* トークン交換と API リクエストに DPoP プルーフを添付
  
* `crypto.subtle` がない環境では Bearer モードにフォールバック
  
* トークン交換と API リクエストの両方で `use_dpop_nonce` リトライを自動的に処理
  
* WebSocket 接続は、プルーフ検証のために接続後の `dpop_bind` メッセージを使用

利用可能なすべてのメソッドについては、完全な SDK API リファレンスを参照してください。

#### DPoP & HTTP キャッシュの相互作用 (#1052)

DPoP は HTTP キャッシュフローの 3 つのポイントに関わります:


1. **`Vary` における DPoP プルーフ JWT?** — いいえ。プルーフにはリクエストごとの `jti` と `iat` が含まれているため、`Vary` に追加するとすべてのリクエストがキャッシュミスになります。`Authorization` のバインドされたアクセストークンが重要なキャッシュキーディメンションです。プルーフは別途検証され、本文コンテンツには影響しません。
   
2. **`304 Not Modified` における `DPoP-Nonce`** — はい、パススルーされます。キャッシュ制御ミドルウェアは、304 レスポンスヘッダー(`evaluateConditionalRequest`)で `DPoP-Nonce` をホワイトリスト化します。サーバーが nonce をローテートする場合、`304` でも最新の nonce を配信するため、クライアントが遅れることはありません。このパススルーがない場合、`304` を受信したクライアントは古い nonce で再試行し、次のリクエストで `401 + use_dpop_nonce` に遭遇します。
   
3. **DPoP 認証失敗** — 古い、または欠落した DPoP プルーフは、`evaluateConditionalRequest` が実行される前に `requireAuth` で拒否されます([ポリシー伝播遅延](#policy-propagation-delay--http-cache-integrity-1050) でハンドラーの順序を参照)。古い `If-None-Match` は、以前の有効なセッションからの `304` を復活させることはできません — レスポンスは `401` であり、`304` にはなりません。

セキュリティモデルについては SECURITY.md — DPoP & Cache Integrity を参照してください。

#### パスワードログインセッションバインディング (`POST /auth/dpop-bind`

)

上記の DPoP フローは、**API キー**交換(`/oauth/token`)を通じて取得されたトークンをバインドします。これは、SDK がデータプレーンアクセスに使用するパスです。**人間の管理者**がメール/パスワードでサインインする管理コンソールは、このパスを経由しません — `POST /auth/login` はプレーンな Bearer セッショントークンを発行します。そのセッショントークンを(例えば、ブラウザストレージからの XSS 盗難に対して)保護するために、セッションは `POST /auth/dpop-bind` を介して DPoP 送信者制約トークンにアップグレードできます。

API キーフローとは異なり、Proof-of-Work は必要ありません(ユーザーはすでにパスワードで認証済みです)。リプレイ保護は同じ `DPoP-Nonce` ハンドシェイクを再利用します。

```text
1. POST /auth/login (email/password)            → Bearer access + refresh (no cnf)
2. Client generates a non-extractable ECDSA P-256 key pair
3. POST /auth/dpop-bind
   Authorization: Bearer <access>
   DPoP: <proof JWT>            (htm=POST, htu=.../auth/dpop-bind)
   → 401 + DPoP-Nonce  (first call without nonce)
   → retry proof with nonce
   → { accessToken, refreshToken, tokenType: "DPoP", ... }   (both tokens carry cnf.jkt)
4. Subsequent requests: Authorization: DPoP <token> + per-request DPoP proof
5. POST /auth/refresh: when the refresh token carries cnf.jkt, a DPoP proof is REQUIRED;
   the re-issued tokens stay bound to the same jkt.
```

注意事項:


* DPoP バインドアクセストークンは `Authorization: Bearer` スキームでは使用**できません** — `requireAuth` は、Bearer として提示された `cnf.jkt` トークンを `401` で拒否します。
  
* クライアントキーペアは抽出不可能(`extractable: false`)にし、IndexedDB に永続化することで、リロード後も存続しながら、注入されたスクリプトによるエクスポートを防ぐ必要があります。トークン値自体は `localStorage` に残すことができます:一度バインドされれば、盗まれたトークンは秘密鍵なしでは役に立ちません。
  
* これは、ファーストパーティ管理コンソール(例: geonicdb-console)を対象としています。サードパーティアプリの場合は、上記で説明したスコープ付き API キー + DPoP モデルを使用してください。

***

## OAuth 2.0 M2M 認証

GeonicDB は OAuth 2.0 Client Credentials フローを介したマシン間 (M2M) 認証をサポートしています。

### 概要

OAuth 2.0 Client Credentials フローは、サーバー間通信やバックグラウンドジョブなどのマシン間 (M2M) シナリオに最適化された認証方法です。

### OAuth 2.0 を使用する場合


* **マシン間通信**: API 間呼び出し
  
* **バックグラウンドジョブ**: ユーザーの操作なしでのバッチ処理
  
* **サービス間統合**: マイクロサービス間の認証
  
* **CI/CD パイプライン**: 自動化されたデプロイメントとテストでの API アクセス
  
* **きめ細かいアクセス制御**: スコープベースの権限管理が必要な場合

### OAuth 2.0 と JWT 認証の違い

| Item                       | OAuth 2.0 Client Credentials                                    | JWT Authentication                                    |
| -------------------------- | --------------------------------------------------------------- | ----------------------------------------------------- |
| **Authentication subject** | Client application (machine)                                    | User (human)                                          |
| **Token acquisition**      | `POST /oauth/token`                                             | `POST /auth/login`                                    |
| **Credentials**            | Client ID + Client Secret (Basic auth)                          | Email + Password                                      |
| **Access control**         | Scope-based                                                     | Role-based                                            |
| **Token expiration**       | Short-lived (default: 1 hour; unlimited with `permanent` scope) | Access token: 1 hour, Refresh token: 7 days           |
| **Refresh token**          | None (re-request when expired)                                  | Available (can be refreshed via `POST /auth/refresh`) |

### OAuth クライアント管理

| Endpoint                                            | Method | Description              |
| --------------------------------------------------- | ------ | ------------------------ |
| `/admin/oauth-clients`                              | GET    | Get OAuth client list    |
| `/admin/oauth-clients`                              | POST   | Create OAuth client      |
| `/admin/oauth-clients/{clientId}`                   | GET    | Get OAuth client         |
| `/admin/oauth-clients/{clientId}`                   | PATCH  | Update OAuth client      |
| `/admin/oauth-clients/{clientId}`                   | DELETE | Delete OAuth client      |
| `/admin/oauth-clients/{clientId}/regenerate-secret` | POST   | Regenerate Client Secret |

### セルフサービス OAuth クライアント管理

ユーザーは管理者権限なしで独自の OAuth クライアントを作成・管理できます。セルフサービスで作成されたクライアントは、ユーザーにスコープされ、ロールベースの制限に従います。

| Endpoint                                         | Method | Description                       |
| ------------------------------------------------ | ------ | --------------------------------- |
| `/me/oauth-clients`                              | POST   | Create own OAuth client           |
| `/me/oauth-clients`                              | GET    | List own OAuth clients            |
| `/me/oauth-clients/{clientId}`                   | PATCH  | Update own OAuth client (partial) |
| `/me/oauth-clients/{clientId}`                   | DELETE | Delete own OAuth client           |
| `/me/oauth-clients/{clientId}/regenerate-secret` | POST   | Regenerate own client secret      |

**制限事項:**

* ユーザーあたり最大 **5 クライアント**
  
* `policyId` はオプションです — 指定された場合、参照されるポリシーは既に存在し、同じユーザーによって作成されている必要があります。省略された場合、認可はテナントポリシー + ロールデフォルト (`user` デフォルトは GET のみの Permit) にフォールバックします
  
* `clientSecret` は作成時と再生成時にのみ返されます — 安全に保管してください

**PATCH 更新可能フィールド** (`PATCH /me/oauth-clients/{clientId}`):

| Field         | Type                 | Description                                                  |
| ------------- | -------------------- | ------------------------------------------------------------ |
| `name`        | string               | Client name                                                  |
| `description` | string               | Client description                                           |
| `policyId`    | string \| null | Policy binding (must be created by you, or `null` to unbind) |
| `isActive`    | boolean              | Activate / deactivate the client                             |

### トークンリクエスト

```bash
curl -X POST https://api.example.com/oauth/token \
  -u "$CLIENT_ID:$CLIENT_SECRET" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&scope=read:entities write:entities"
```

**レスポンス例:**

```json
{
  "access_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "read:entities write:entities"
}
```

### レート制限 (#1075)

`POST /oauth/token` は **クライアント IP** ごとおよび **`client_id`** ごとにレート制限されており、`client_id+client_secret` ペアのオフラインブルートフォース攻撃を防止します。

| Bucket          | Per minute | Per hour | Per day | Burst |
| --------------- | ---------: | -------: | ------: | ----: |
| Per IP          |         20 |      100 |     500 |     5 |
| Per `client_id` |         10 |       60 |     200 |     2 |

両方のバケットがリクエストを許可する必要があります。どちらかを超過すると `429 Too Many Requests` が `Retry-After` ヘッダーと共に返されます。同じ IP ごとのスキームは `/auth/refresh` と `/auth/nonce` (`PUBLIC_RATE_LIMIT` の `auth` カテゴリ)も保護します。完全な設定については [QUOTAS.md — Public (Unauthenticated) Endpoint Rate Limit](../saas/quotas.md#public-unauthenticated-endpoint-rate-limit-1075) を参照してください。

### スコープシステム

| Scope                      | Description                                                                                                                                                                                               | `user` | `tenant_admin` | `super_admin` |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----: | :------------: | :-----------: |
| `read:entities`            | Read entities                                                                                                                                                                                             |    ✅   |        ✅       |       ✅       |
| `write:entities`           | Write entities (create/update/delete only)                                                                                                                                                                |    ✅   |        ✅       |       ✅       |
| `read:subscriptions`       | Read subscriptions                                                                                                                                                                                        |    ✅   |        ✅       |       ✅       |
| `write:subscriptions`      | Write subscriptions (create/update/delete only)                                                                                                                                                           |    ✅   |        ✅       |       ✅       |
| `read:registrations`       | Read registrations                                                                                                                                                                                        |    ✅   |        ✅       |       ✅       |
| `write:registrations`      | Write registrations (create/update/delete only)                                                                                                                                                           |    ✅   |        ✅       |       ✅       |
| `read:rules`               | Read rules                                                                                                                                                                                                |    ✅   |        ✅       |       ✅       |
| `write:rules`              | Write rules (create/update/delete only)                                                                                                                                                                   |    ✅   |        ✅       |       ✅       |
| `read:custom-data-models`  | Read custom data models                                                                                                                                                                                   |    ✅   |        ✅       |       ✅       |
| `write:custom-data-models` | Write custom data models (create/update/delete only)                                                                                                                                                      |    ✅   |        ✅       |       ✅       |
| `admin:users`              | Access to user management API (`/admin/users`)                                                                                                                                                            |    ❌   |        ✅       |       ✅       |
| `admin:policies`           | Access to policy management API (`/admin/policies`, `/admin/policy-sets`)                                                                                                                                 |    ❌   |        ✅       |       ✅       |
| `admin:oauth-clients`      | Access to OAuth client management API (`/admin/oauth-clients`)                                                                                                                                            |    ❌   |        ✅       |       ✅       |
| `admin:metrics`            | Access to metrics API (`/admin/metrics`). Read only for `tenant_admin` — resetting the counters (`DELETE`, or `?reset=true`) is `super_admin` only and cannot be granted by a custom XACML policy (#2236) |    ❌   |        ✅       |       ✅       |
| `admin:tenants`            | Access to tenant management API (`/admin/tenants`)                                                                                                                                                        |    ❌   |        ❌       |       ✅       |
| `permanent`                | Set token to never expire (no expiration)                                                                                                                                                                 |    —   |        —       |       —       |
| `jwt`                      | JWT format token                                                                                                                                                                                          |    —   |        —       |       —       |

> **スコープ階層**: `write:X` は `read:X` を**暗黙的に含みません** — スコープは独立しています。これにより、公開お問い合わせフォームなどの書き込み専用のユースケースが可能になります。`admin:X` は `read:X` と `write:X` の両方を暗黙的に含みます。`admin:*` スコープを持つ OAuth トークンは Admin API にアクセスでき、通常の JWT ロールベース認証をバイパスします。通常の JWT トークン(`scope` フィールドなし)は、後方互換性のためスコープチェックをスキップします。
>
> **セルフサービス(`/me/oauth-clients`)のロール制限**: ユーザーは自分のロールで許可されたスコープのみをリクエストできます。`user` はリソーススコープのみをリクエストできます。`tenant_admin` は `admin:tenants` を除く `admin:*` スコープも追加でリクエストできます。`super_admin` はすべてのスコープをリクエストできます。

***

## OIDC 外部 IdP 認証

GeonicDB は OIDC (OpenID Connect) に準拠した外部 IdP による認証をサポートしています。

### 有効化

```bash
export AUTH_ENABLED=true
export OIDC_ENABLED=true
export OIDC_ISSUER=https://accounts.google.com
export OIDC_AUDIENCE=your-client-id.apps.googleusercontent.com
```

### 動作


1. クライアントは外部 IdP から ID トークンを取得します
   
2. GeonicDB API リクエストに `Authorization: Bearer <id_token>` を含めます
   
3. GeonicDB は OIDC Discovery + JWKS を介して署名を検証します
   
4. メールアドレス(`email` クレーム)で GeonicDB DB 内のユーザーを検索します
   
5. ユーザーが存在する場合、認証が成功します

### サポートされている IdP


* Google
  
* Microsoft Entra ID (Azure AD)
  
* Auth0
  
* その他の OIDC 準拠 IdP

***

## XACML ポリシーベース認可

GeonicDB は XACML 3.0 準拠のポリシーベースアクセス制御をサポートしています。

### XACML ポリシー Zod 制限 (#2712)

`/admin/policies`、`/me/policies`、および MCP `admin` ポリシー形状の書き込みパス Zod 上限(信頼できる情報源:`src/config/defaults.ts` の `SECURITY.MAX_POLICY_*`):

| Dimension                                          | Cap                                  |
| -------------------------------------------------- | ------------------------------------ |
| `rules`                                            | `MAX_POLICY_RULES` (10)              |
| `target.subjects` / `resources` / `actions` (each) | `MAX_POLICY_TARGET_MATCHES` (15)     |
| `conditions` per rule                              | `MAX_POLICY_CONDITIONS_PER_RULE` (5) |

これらは**配列アイテム数**の制限です。個別の文字列 `.max()` 制限は Zod の UTF-16 コードユニットセマンティクスを使用します。これらは `MAX_AUTHENTICATED_CONTROL_PLANE_REQUEST_BODY_BYTES`(1 MiB UTF-8)とバイトアラインメントされて**いません**。マルチバイトペイロードは Zod 上限内でも 1 MiB を超える可能性があります — HTTP ボディ上限は `/me`/`/admin` の絶対的な安全網として残ります。

**破壊的変更の非対称性:** 上限を上げることは非破壊的ですが、**下げることは破壊的**です。PDP 評価は保存されたポリシーを Zod を通じて再検証しないため、サイズ超過ドキュメントは引き続き認可を行いますが、完全な形状を再送信する `PATCH`/`PUT`/`POST` は **400** を返します。

**15 マッチの根拠 (#2712):** 部分的なステージング Admin API サンプル(1 つの可視テナントのみ)では `resources` の最大値が **9** でした; 15 は 1.67 倍のマージンです。他のすべてのテナントおよびグローバル(`tenantId: null`)ポリシーは測定されて**いません** — 以下の監査を実行した後にデプロイしてください。

**デプロイ前監査(読み取り専用)。** 編集不可能になるポリシーにフラグを立てます:

```javascript
// mongosh — run per DB that has a `policies` collection
// $isArray で保護: 保存済みの非配列値で $size が監査全体を止めないようにする
const asArray = (expr) => ({
  $cond: [{ $isArray: expr }, expr, []],
});
db.policies.aggregate([
  { $project: {
      policyId: 1, tenantId: 1,
      rulesCount: { $size: asArray('$rules') },
      maxMatches: { $max: [
        { $size: asArray('$target.subjects') },
        { $size: asArray('$target.resources') },
        { $size: asArray('$target.actions') },
        { $max: { $map: { input: asArray('$rules'), as: 'r', in: { $size: asArray('$$r.target.subjects') } } } },
        { $max: { $map: { input: asArray('$rules'), as: 'r', in: { $size: asArray('$$r.target.resources') } } } },
        { $max: { $map: { input: asArray('$rules'), as: 'r', in: { $size: asArray('$$r.target.actions') } } } },
      ]},
      maxConditions: { $max: { $map: {
        input: asArray('$rules'), as: 'r',
        in: { $size: asArray('$$r.conditions') },
      }}},
  }},
  { $match: { $or: [
    { rulesCount: { $gt: 10 } },
    { maxMatches: { $gt: 15 } },
    { maxConditions: { $gt: 5 } },
  ]}},
])
```

### ポリシー管理

| Endpoint                                | Method | Description             |
| --------------------------------------- | ------ | ----------------------- |
| `/admin/policies`                       | GET    | Get policy list         |
| `/admin/policies`                       | POST   | Create policy           |
| `/admin/policies/{policyId}`            | GET    | Get policy              |
| `/admin/policies/{policyId}`            | PATCH  | Update policy (partial) |
| `/admin/policies/{policyId}`            | PUT    | Replace policy          |
| `/admin/policies/{policyId}`            | DELETE | Delete policy           |
| `/admin/policies/{policyId}/activate`   | POST   | Activate policy         |
| `/admin/policies/{policyId}/deactivate` | POST   | Deactivate policy       |

> **`policyId` / `policySetId` の命名 (#1628)。** クライアント提供の ID には URL エンコーディングが必要な文字(非 ASCII、スペース、`%`)が含まれる場合があります。そのようなポリシーをアドレス指定する際は、パス内の ID をパーセントエンコードしてください — API Gateway は `event.path` をパーセントエンコードされた状態で配信し、サーバーは正確に 1 回デコードします。したがって、二重エンコードされたセグメントは単一エンコードされた値に解決され(`a%2520b` は ID が文字通り `a%20b` であるポリシーをアドレス指定します)、不正なエスケープ(`a%b`)は `400` を返します。文字通り `%` を含む ID は以前は生の形式でアドレス指定可能でしたが、現在は二重エンコードする必要があります(`50%-rule` は `50%25-rule` としてアドレス指定されます); 有効なエスケープではない生の `%` は、解決する代わりに現在 `400` を返します。作成時に返される `Location` ヘッダーはすでにパーセントエンコードされているため、それをそのまま追跡することは機能しますが、以下にリストされている 2 つの ID 形状を除きます。
>
> 2 つの ID 形状は API を通じて到達不可能なままであり、避けるべきです:
>
> * `/` を含む ID(`policyId` と `policySetId` の両方) — ルートパターンは単一のパスセグメント(`[^/]+`)にマッチし、API Gateway がパス内の `%2F` を正規化する方法は環境依存です。
> * 正確な `policyId` `import` — `POST /admin/policies/import` は `/admin/policies/{policyId}` ルートをシャドウします。(任意の 1 文字をパーセントエンコードすると、例えば `%69mport` は `{policyId}` ルートにフォールスルーして到達します。)この衝突は `policyId` に固有です; `policySetId` には `import` ルートがないため、`import` という `policySetId` は到達可能です。
>
> `policyId` および `policySetId` は現在、長さのみ(最大 256 文字)で検証され、文字クラスでは検証されていません。

### ターゲットマッチングのセマンティクス

`subjects`、`resources`、`actions` 配列内では:

* **同じ `attributeId`**: OR (いずれかのマッチで満たされる) — 例: `[{method: POST}, {method: PATCH}]` は POST **または** PATCH にマッチ
  
* **異なる `attributeId`**: AND (すべてがマッチする必要がある) — 例: `[{role: user}, {userId: u1}]` は両方が必要
  
* **カテゴリ間** (`subjects` + `resources` + `actions`): AND

#### XACML XML インポートサブセット (#3228)

`POST /admin/policies/import` は、上記のフラットモデルにロスレスでマッピングできる XACML 3.0 `<Target>` のサブセットのみを受け付けます ([XACML 3.0 §7.6](https://docs.oasis-open.org/xacml/3.0/xacml-3.0-core-spec-os-en.html))。仕様では、`AnyOf` 要素は AND、1 つの `AnyOf` 内の `AllOf` 要素は OR、1 つの `AllOf` 内の `Match` 要素は AND です。フラットモデルは 1 つの `attributeId` 内では OR、`attributeId` 間では AND です。Target (ポリシーレベルまたはルールレベル) は、以下のすべてが成り立つ場合にのみ保存されます:


* 各 `AllOf` が正確に 1 つの `Match` を含む
  
* 1 つの `AnyOf` 内のすべての `Match` が同じカテゴリと `attributeId` を共有する
  
* 同じ `attributeId` が複数の `AnyOf` に出現しない (subject、resource、action 間を含む)
  
* `MatchId` が正確に `urn:oasis:names:tc:xacml:1.0:function:string-equal` または `urn:oasis:names:tc:xacml:1.0:function:string-regexp-match` である。id に単に `regexp` を含む (`string-starts-with`、`integer-greater-than`、…) など、その他の関数は `string-equal` として保存されるのではなく拒否されます

その他の形状は **400** です。これには、`method=GET` と `path=/v2/entities` を AND する `AllOf`、複数の `AnyOf` 要素に分割された同じ `attributeId`、未知のカテゴリ、`AttributeValue` または `AttributeDesignator` が欠けている `Match` が含まれます。エラー詳細は、作成者に論理和を別々の Rule に分割するよう指示します: `Rule単位のTargetに分割してください`。インポートは、その形状をデカルト積 (`actions=[GET,POST]` × `resources=[...]`) に展開しません。これは、XML が述べていない組み合わせ (例: `POST /v2/entities`) を Permit することになります。

**Breaking.** この変更前にエクスポートされた XML は、各マッチ値を独自の `AnyOf` に配置していました。標準の XACML PDP はそれを値の AND (GET and POST) として読み取り、再インポートは現在 **400** を返します。エクスポートは `attributeId` ごとに 1 つの `AnyOf` を、値ごとに 1 つの `AllOf` を書き込みます。これは属性内で OR になります。

**Scope.** `parseXacmlToPolicy` は `scope` を設定しません。したがって、`POST /admin/policies/import` は常に `scope=tenant` を保存します (`createPolicy` は省略された scope を `tenant` にデフォルト設定します)。インポートされたポリシーは、単一の API キーではなく、テナント内のすべてのプリンシパルに適用されます。個人ポリシーは `POST /me/policies` で作成されます。インポートルートには scope パラメータがありません。

**省略または空の `subjects` / `resources` / `actions`**: そのカテゴリはスキップされ、そのカテゴリの**すべての**リクエストにマッチします。これは XACML 3.0 の空の `<Target/>` セマンティクス (`policy.pdp.ts` の `matchTarget`) です: `resources` / `actions` のみ (`subjects` なし) のポリシーは**正当な**リソースのみ / アクションのみのポリシーです — テナント内の**すべての** subject (`anonymous` と `tenant_admin` を含む) に適用されます。空の配列 (`"subjects": []`) は、フィールドを省略した場合と同じように扱われます。

#### subjects 省略の罠 (#2934)

カスタムポリシーは、**優先度グループごとの first-applicable**、次に**グループ間の deny-overrides** (適用可能なグループからの Deny が勝つ) を使用してロールデフォルトと組み合わされます。Deny を持つポリシーで `subjects` を省略すると、Deny はすべてのロールに適用され、ロールデフォルトの Permit をオーバーライドします — `tenant_admin` を含みます。

```json
{
  "policyId": "readonly-paths-missing-subjects",
  "description": "INTENDED for api_key only — but subjects omitted",
  "target": {
    "resources": [
      {"attributeId": "path", "matchValue": "/v2/**", "matchFunction": "glob"},
      {"attributeId": "path", "matchValue": "/ngsi-ld/**", "matchFunction": "glob"}
    ]
  },
  "ruleCombiningAlgorithm": "first-applicable",
  "rules": [
    {
      "ruleId": "allow-read",
      "effect": "Permit",
      "target": {
        "actions": [
          {"attributeId": "method", "matchValue": "GET"}
        ]
      }
    },
    {"ruleId": "deny-others", "effect": "Deny"}
  ]
}
```

上記のポリシーでは、`tenant_admin` の POST は Denied になります: カスタムポリシーがマッチし (`subjects` フィルタなし)、`deny-others` が発火し、グループ間の deny-overrides が `tenant_admin` デフォルトの Permit に勝ちます。修正: ポリシーがプリンシパルのサブセット向けである場合は、常に `subjects` を設定してください。例: `[{"attributeId": "role", "matchValue": "api_key"}]`。

[docs/customer/QUICKSTART.md](./customer/QUICKSTART.md) (MCP / DPoP ポリシーレシピ) および [INSTRUCTION.md appendix D.2](./customer/INSTRUCTION.md) も参照してください。

#### 作成時 API 警告なし (#2934)

GeonicDB は、ポリシーの作成 / 更新時に `subjects` が省略されても、警告フィールドやヘッダーを**返しません**。理由:


1. **リソースのみ / アクションのみのポリシーは有効な XACML です** — 作成時の警告は意図的な形状で発火し、オペレーターがそれを無視するようトレーニングすることになります。
   
2. 警告のボディフィールドまたはヘッダーを追加することは**パブリック API サーフェスの変更**です; Priority Low のドキュメントは、静的解析では見えない実行時データの落とし穴に対する適切なレイヤーです (#2921)。
   
3. リポジトリ内に Admin UI がないため、ソフト警告を表示できません; Admin API が書き込みパスのままです。

`subjects` を必須にし**ない**でください — それは正当なリソースのみ / アクションのみのポリシーを壊すことになります (破壊的変更)。

### マッチ関数 (GeonicDB 拡張を含む)

ポリシーの Target 内の AttributeMatch で使用可能な `matchFunction` の値:

| matchFunction   | Description                              | XACML 3.0                        |
| --------------- | ---------------------------------------- | -------------------------------- |
| `string-equal`  | Exact match (default)                    | Standard                         |
| `string-regexp` | Regular expression match                 | Standard (`string-regexp-match`) |
| `glob`          | Glob pattern match (`*`, `**` supported) | **GeonicDB extension**           |

**自動 glob 検出 (GeonicDB 拡張)**: `matchFunction` が省略されている場合、`matchValue` に `*` が含まれていれば自動的に `glob` として処理されます。それ以外の場合は `string-equal` が適用されます。

**XACML XML エクスポート**: `glob` は XACML 3.0 仕様に存在しないため、エクスポート時には正規表現に変換され、`string-regexp-match` として出力されます。同じ `attributeId` の値は 1 つの `AnyOf` にまとめられ、値ごとに 1 つの `AllOf` が作られます (#3228)。[XACML XML インポートサブセット](#xacml-xml-import-subset-3228) を参照してください。

#### `string-regexp` パターン制約 (#1935)

`string-regexp` の `matchValue` は **書き込み時** に検証されます — `POST/PATCH/PUT /admin/policies`、`POST /admin/policies/import` (XACML XML)、`/me/policies`、およびポリシーセットエンドポイントで検証されます。パターンは以下の場合に **400** でリジェクトされます:


* **200 文字** を超える場合、
  
* 空または空白文字のみを含む場合、
  
* 構文的に有効な正規表現ではない場合、
  
* `(a+)+` のようなネストされた量指定子を含む場合 (ReDoS リスク)、
  
* 10 個を超える選択肢または 5 個を超える後方参照を含む場合。

> これらの制限は **GeonicDB 拡張** であり、XACML 3.0 の要件ではありません。仕様が定義しているのは、以下の評価時動作 (評価エラー時の `Indeterminate`) です。

パターンが **評価時** に評価不可能であることが判明した場合、XACML 3.0 §7.6 (Target 評価) に従い、マッチは「マッチしない」ではなく **`Indeterminate`** として評価されます。`Indeterminate` は Rule (§7.11) と Policy (§7.12) に伝播し、最終的に **fail-closed として `Deny`** に解決されます。また、リストクエリの行フィルター (policy-to-filter) は同じリクエストに対して「読み取り可能な行なし」(403) に劣化します。

評価時に `Indeterminate` に到達する状況は 2 つあります:


1. **`${subject.*}` テンプレート展開** が評価不可能なパターンを生成する場合 (書き込み時検証は *展開前* の文字列しか検査できません)。
   
2. **書き込み時検証が存在する前に保存されたポリシー**、またはサービス層をバイパスするパス (例: `scripts/backup-import.ts` は生の `insertMany` でドキュメントを復元します) によって書き込まれたポリシー。既存のドキュメントに対してマイグレーションは実行されません — 評価時の `Indeterminate` がそれらをカバーします。

> 評価不可能なパターンを「マッチしない」として扱うことは、`Permit` ルールに対しては fail-closed ですが、**`Deny` ルールに対しては fail-open** です — 拒否が静かに適用されなくなります。`${subject.*}` テンプレートは、展開後のパターンが 200 文字制限内に収まるよう十分に短く保ってください。

### 暗黙のポリシー階層

GeonicDB は以下の暗黙のポリシーを適用します (DB ルックアップをスキップ):

| Priority             | Role           | Behavior                                            |
| -------------------- | -------------- | --------------------------------------------------- |
| Custom policies (0+) | any            | Custom XACML policies always override defaults      |
| 0                    | `super_admin`  | Management APIs always Permit. Data APIs Deny (403) |
| 0                    | `tenant_admin` | Always Permit (all APIs within own tenant)          |
| -1                   | `user`         | GET → Permit, all other methods → Deny (readonly)   |
| -2                   | `api_key`      | All Deny (explicit Permit policy required)          |
| -3                   | `anonymous`    | All Deny (explicit Permit policy required)          |

> **重要**: カスタム XACML ポリシー (優先度 0 以上) は常にロールのデフォルトをオーバーライドします。`user` に書き込みアクセスを付与するには、優先度 ≥ 0 の Permit ポリシーを作成してください。
>
> **タイブレーク**: 優先度が等しい場合、決定論的な結果のために `policyId` の辞書順でポリシーが評価されます。テナントカスタムポリシー (DB に保存) はロールデフォルトと組み合わされ、一緒にソートされます。

### リソース属性

ポリシー Target 内の `resources` で使用可能な属性は以下の通りです:

| attributeId            | Description                                                                                                                                                                                               | Source                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `path`                 | HTTP request path (e.g. `/v2/entities/Room1`)                                                                                                                                                             | Request                                                                       |
| `tenantService`        | Tenant service name (`Fiware-Service` header). **Exception — `/custom-data-models`:** resolved from the authenticated actor's tenant, not from the header (see note below)                                | Request                                                                       |
| `servicePath`          | Service path (NGSIv2: resolved `TenantContext.servicePath` after CADDE `x-cadde-options` merge, e.g. `/devices`, `/opendata`. NGSI-LD: always `/` — the header is not part of the NGSI-LD spec, see note) | Request (resolved tenant)                                                     |
| `scope`                | NGSI-LD entity scope (comma-separated, e.g. `/Madrid/parks,/Madrid/gardens`)                                                                                                                              | Entity context                                                                |
| `entityId`             | Target entity ID (e.g. `Room1`)                                                                                                                                                                           | Entity context / Subscription `entities[].id`                                 |
| `entityType`           | Target entity type (e.g. `Room`)                                                                                                                                                                          | Request (auto-extracted) / Entity context / Subscription `entities[].type`    |
| `entityOwner`          | Entity creator's userId (`createdBy` field)                                                                                                                                                               | Entity context                                                                |
| `entityIdPattern`      | Subscription target id pattern (e.g. `urn:ngsi-ld:Sensor:.*`)                                                                                                                                             | Subscription `entities[].idPattern` (NGSIv2: `subject.entities[].idPattern`)  |
| `notificationEndpoint` | Subscription notification endpoint URI (e.g. `https://hooks.example.com/x`)                                                                                                                               | Subscription `notification.endpoint.uri` (NGSIv2: notification channel `url`) |

> **注**: `entityId` はエンティティレベルの認可チェック (`requireEntityAuthz` 経由) でのみ使用可能です。`entityOwner` と `scope` はエンティティレベルのチェックで使用可能であり、**#1369 以降、リスト読み取りクエリで行レベルフィルターとしても機能します** — [リストクエリのポリシーtoフィルタークエリ書き換え](#policy-to-filter-query-rewriting-for-list-queries-1337--1369) を参照してください。`entityType` は HTTP リクエストからパスレベルで自動的に抽出されます — `?type=` クエリパラメータまたはリクエストボディの `type` / `@type` フィールドから抽出されます。**ID 指定のエンティティルート (`/entities/{id}` およびその下位) では、DB に保存されている実際の `entityType` を使用してエンティティレベルで認可が実施されます** (#1324) — クライアントが提供する `?type=` パラメータはルックアップフィルターとしてのみ使用され、認可属性としては決して使用されません。[ID 指定ルートのエンティティレベル認可](#entity-level-authorization-for-by-id-routes-1324-1336) を参照してください。NGSIv2 の `servicePath` は **解決された `TenantContext`** (`extractTenantContext`) から取得され、これはすでに CADDE `x-cadde-options` のオーバーライドを適用しています — PIP は HTTP パスで生の `Fiware-ServicePath` ヘッダーを再読み取り **しません** (#1862、キャッシュキーに対する #1835 と同じクラス)。パスレベルとエンティティレベルの両方のチェックで使用可能 — 階層的パスマッチング用の glob パターン (例: `/opendata/**`) をサポートします。**NGSI-LD リクエストの場合、`servicePath` は常に `/` として評価されます** (#1323): NGSI-LD 仕様 (ETSI GS CIM 009) には `Fiware-ServicePath` の概念がなく、テナントミドルウェアはそれを `/` に正規化し、データレイヤーはすべての NGSI-LD エンティティを `servicePath: '/'` に保存します。生のヘッダー値を認可リクエストに注入すると、データアクセスがそれを完全に無視する一方で、呼び出し側が独自の認可属性を選択できることになります — そのため servicePath ベースのポリシーは **NGSI-LD で分離境界として使用できません**。NGSI-LD で階層ベースの制御を行うには、`scope` 属性 (エンティティレベル) を使用してください。テナント内のプロジェクトレベルの分離には、`entityType` / `entityId` 制約を使用してください。`scope` はエンティティレベルでの NGSIv2 の `servicePath` に相当する NGSI-LD の属性です — エンティティが複数のスコープ値を持つ場合 (例: `["/Madrid/parks", "/Madrid/gardens"]`)、`string-regexp` または `glob` でのマッチングのためにカンマ区切り文字列として結合されます。**サブスクリプション書き込み** (`/ngsi-ld/v1/subscriptions`、`/ngsi-ld/v1/csourceSubscriptions`、`/v2/subscriptions` への `POST`/`PATCH`、#1104 / #2005): リテラルの `body.type === "Subscription"` は `entityType` に注入 **されません** — 代わりに、PIP は `entities[]` (NGSIv2: `subject.entities[]`) から **サブスクリプションターゲット** を抽出し、`notification.endpoint.uri` (NGSIv2: 設定された通知チャネルの `url`) から **通知先** を抽出します。`PATCH` では、属性は **更新後の有効値** (宣言された値、それ以外の場合は保存された値) で解決されます。`entities[]` に複数の要素が含まれる場合、要素ごとに 1 つの AuthzRequest が構築され、リクエストが成功するには **すべてが Permit である必要があります** (all-Permit セマンティクス)。これにより、タイプベースのポリシー (「匿名は `ActivityLog` のみサブスクリプションライブ可能」) と URI ベースのポリシー (「サブスクリプションは `https://*.example.com/**` にのみ通知を投稿可能」、SSRF / データ流出に対する防御) を記述できます。以下の [サブスクリプション PIP 属性](#subscription-pip-attributes) を参照してください。**バッチ操作** (`POST /ngsi-ld/v1/entityOperations/*`、`POST /v2/op/update`): ボディ内の **異なるエンティティタイプごと** (削除: エンティティ ID ごと) に 1 つの AuthzRequest が構築され、同じ all-Permit セマンティクスが適用されます — [バッチ操作認可](#batch-operation-authorization-1325) を参照してください。**`/custom-data-models` — `tenantService` はヘッダーではなくアクターから取得されます** (#2215): このルートは `actor.tenantId` をキーとする管理 API であるため、ハンドラーは意図的に `checkTenantAccess` (呼び出し元のテナントに `Fiware-Service` ヘッダーを紐付けるチェック) をスキップします。したがって、このルートでヘッダーは **検証されず**、それを PDP に渡すと呼び出し側が独自の認可属性を選択できることになります: `tenantService` を条件とする **Deny** は静かにマッチしなくなり (認可バイパス)、`tenantService` を条件とする **Permit** はマッチしなくなります (過剰拒否)。PIP には代わりに `actor.tenantId` から解決されたテナントが渡されるため、`tenantService` ポリシーは他のすべてのルートと同じようにここでも動作します。テナントを持たないプリンシパル、または解決不可能な `tenantId` を持つプリンシパルは、属性が欠落した状態で評価されるのではなく **403** でリジェクトされます (fail-closed)。**ロールは免除されません** — `super_admin` もアクターから解決されます。実際の `super_admin` はこのルートにまったく到達できず (オーバーライド不可の優先度 -1 の deny-fence が `/custom-data-models/**` を拒否します)、`AUTH_ENABLED=false` 時に使用される合成 `super_admin` にはテナントがないため、そのロールに対するヘッダーフォールバックは、成功しないパスで検証されていない入力を再導入するだけです。**このルートでは `servicePath` は `/` に固定されます** (#2221): カスタムデータモデルは servicePath でまったくパーティション分割されておらず、ルートは `Fiware-ServicePath` を決して読み取らないため、認可リクエストに生のヘッダーを残すと、呼び出し側に 2 つ目の自己選択属性を渡すだけになります — 上記の `tenantService` と同じ fail-open の形状で、1 次元上です。したがって、`servicePath` を条件とするポリシーは常にここでは `/` に対して評価され、ヘッダーを変更しても回避できません。このルートでは分離境界として使用可能ではありませんが、理由は逆です (値が呼び出し側選択ではなく固定)。

### パスレベル vs エンティティレベルの認可

GeonicDB は2段階の認可モデルを使用します。両方の段階で XACML 評価を使用し、#1324 以降**両方ともフェイルクローズ**です。同じ実施ポイントは MCP および A2A ツールエンドポイントもカバーします — [MCP / A2A ツール認可](#mcp--a2a-tool-authorization-1610--1651--1672) を参照してください。

| Stage               | Middleware                                          | Triggered when                                                                                            | Non-Permit behavior                                                                                          |
| ------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Path-level          | `requireAuthz()`                                    | Every authenticated request, except by-id entity routes and list reads (which delegate to the rows below) | `Deny` / `NotApplicable` / `Indeterminate` → **403 (fail-closed)**                                           |
| Entity-level        | `requireEntityAuthz()` (via `checkEntityOwnership`) | By-id entity routes — path-level is skipped and this is the single enforcement point (#1324)              | `Deny` / `NotApplicable` / `Indeterminate` → **403 (fail-closed)**                                           |
| List-level          | `requireListReadAuthz()`                            | List read queries (#1337/#1369)                                                                           | Derived row filter: `unrestricted` → no filter, partial → only readable rows, `none` → **403 (fail-closed)** |
| Subscription-update | `requireSubscriptionUpdateAuthz()`                  | `PATCH` on a subscription by id — path-level is skipped and this is the single enforcement point (#2005)  | `Deny` / `NotApplicable` / `Indeterminate` → **403 (fail-closed)**                                           |

#### パスレベルがフェイルクローズである理由

適用可能なポリシーがない場合、リクエストは拒否されなければなりません。そうでなければ、権限のないユーザーがポリシーで明示的に許可されていない任意のパスを呼び出すことができてしまいます。デフォルトロールポリシー(`__default_user`、`__default_api_key` など)により、パス段階には常に少なくとも1つの適用可能なルールがあることが保証されます。

#### エンティティレベルもフェイルクローズ(#1324)

エンティティレベルの評価は歴史的にフェイルオープンでした。これは、パス段階がすでに許可を生成しており、この段階は**追加の**制約(所有者のみ、スコープベース)のみを適用するという前提に基づいていました。しかし、ID によるエンティティルートが**パスレベル PEP をスキップ**し、単一の実施ポイントとしてエンティティレベルに委任するようになったとき、この前提は崩れました — そこでの `NotApplicable` は追加の制約の欠如ではなく、不正なアクセスになってしまいます。#1324 以降、`requireEntityAuthz()` は `Deny`、`NotApplicable`、`Indeterminate` のいずれも `403` で拒否します([ID によるルートのエンティティレベル認可](#entity-level-authorization-for-by-id-routes-1324-1336) も参照)。MCP / A2A の合成イベントチェックは同じ実装を再利用するため、同じフェイルクローズ動作を継承します。

これは、CRUD を機能させ続けるためにテナントがエンティティを対象としたポリシーを書くことを強制するものではありません:決定的なデフォルトを持つロール(`user`、`tenant_admin`、`super_admin`)は、データ API で常に許可または拒否を生成し、`NotApplicable` には到達しません。空のルールデフォルトを持つプリンシパル(`api_key`、`anonymous`、`oauth_client`)のみが `NotApplicable` にフォールスルーし、それらにとってクローズが正しい答えです(ポリシーなし = アクセスなし)。

**結果**:属性ベースのきめ細かい制御(例:「ユーザーは自分が作成したエンティティのみを変更できる」)には、ロールデフォルトよりも高い優先度で**明示的な拒否ルール**が必要です — そうしないと、ロールデフォルトの許可がエンティティレベルでも適用されます。

#### 例:所有者のみの更新の実施

`PATCH /v2/entities/{id}/attrs` をエンティティ所有者に制限するには、明示的な拒否を記述します:

```json
{
  "description": "Users can only modify entities they own",
  "ruleCombiningAlgorithm": "first-applicable",
  "rules": [
    {
      "ruleId": "deny-non-owner",
      "effect": "Deny",
      "target": {
        "subjects": [{ "attributeId": "role", "matchValue": "user" }],
        "actions": [{ "attributeId": "method", "matchValue": "PATCH" }],
        "resources": [
          { "attributeId": "path", "matchValue": "/v2/entities/**", "matchFunction": "glob" }
        ]
      },
      "condition": {
        "function": "string-not-equal",
        "args": ["${subject.userId}", "${resource.entityOwner}"]
      }
    }
  ]
}
```

このような明示的なルールがない場合、ロールデフォルト(`__default_user`、`/v2/**` での許可)がエンティティレベルで適用され、リクエストは許可されます。

### WebSocket 認可 (WS ⊂ GET)

WebSocket サブスクリプションとブロードキャストは、`GET` のサブセットである**読み取り専用ストリーム**として評価されます。`authorizeWs()` PIP (`src/core/auth/policy/policy.pip.ts`) は、各 WebSocket リクエストを**2回**評価します — 1回は `action.method = 'WS'` で、もう1回は `action.method = 'GET'` で — そして**両方**の評価が `Permit` を返した場合のみアクセスを許可します。

#### 読み取りフレームは `/ngsi-ld/v1/entities` です (#2284)

両方の評価は `resource.path = /ngsi-ld/v1/entities` を持ちます。WebSocket は **NGSI-LD リーダー**です:配信されるイベントは NGSI-LD 正規化され、サブスクリプションの `@context` で圧縮されます (#2026 / #2044)、`entityTypes` セレクタはその `@context` で正規化されます (#2055)、そして #2284 以降は NGSI-LD エンティティの変更のみがブロードキャストされます ([EVENT\_STREAMING.md](../features/subscriptions.md#websocket-is-an-ngsi-ld-reader-2284) を参照)。フレームは、同じプリンシパルが HTTP 経由で使用する読み取りパスと一致する必要があります — フレームをカバーしない `path` グロブは、ターゲットセットから完全に外れ、`Permit` を提供しないため、PR #2204 で正当なリクエストが `kind: 'none'` に崩壊することを測定しました (#2205)。

\#2284 まで、フレームは `/v2/entities`、すなわち **NGSIv2** 読み取りパスでしたが、同じソケット上の表現とマッチングは NGSI-LD でした。移動から2つのことが続き、それらは意図的に一緒に出荷されました — 配信フィルタのみまたはフレームのみを変更すると、#2205 の事故が再現されます:


* **`/v2/**` のみにスコープされたカスタムポリシーに対する破壊的変更。** このようなルールは WebSocket リクエストをターゲットにしなくなり、サブスクリプションライブは拒否されます。ロールデフォルト (`user`、`tenant_admin`) は `/v2/**` と `/ngsi-ld/**` の両方を許可し、影響を受けません。同じ subject に対して `/ngsi-ld/**` (または `/ngsi-ld/v1/entities`) にマッチするルールを追加し、`entityType` / `entityOwner` / `scope` 条件は変更しないで修正してください。
  
* **フォールバックではなく、移行診断。** 新しいフレームの下で `subscribe` が拒否されると、`authorizeWs()` は `/v2/entities` の下で再評価し、*それ*が許可した場合 (両方の `WS` と `GET`)、ロール、ポリシー ID、エンティティタイプを含む `WS_AUTHZ_FRAME_MIGRATION_REQUIRED` を `WARN` でログに記録します。決定は `Deny` のままです — レガシーフレームを受け入れると、NGSIv2 読み取りに制限されたプリンシパルが NGSI-LD エンティティを受信できるようになり、これは閉じられている境界です。追加の評価はサブスクリプションライブ時にのみ実行されます; イベントごとの配信拒否はそれに対して支払わず、ログにも記録しません。診断内の失敗は飲み込まれます:観測は、決定された `Deny` を拒否された promise に変えてはなりません。

##### フレーム変更は両方向に作用します — 制限ポリシーは `/ngsi-ld/**` をターゲットにする必要があります

ターゲットマッチングは異なる `attributeId` 間で AND 結合されるため、ターゲットが `path: /v2/**` と `entityType: X` をペアにするポリシー — #2284 以前に書かれたすべての**制限的な** WebSocket ポリシーの形状で、以下の `ws-self-only-feed` の例を含む — は、新しいフレームの下で `NoMatch` → `NotApplicable` になります。`NotApplicable` グループは、グループ間の `deny-overrides` 結合の前にドロップされるため、残るのはロールデフォルト (`__default_user` / `__default_tenant_admin` は `/ngsi-ld/**` を許可) です:**制限が消失し、ソケットはテナント内のそのタイプのすべてのエンティティを受信し始めます。** これは PR #2324 で `ws-self-only` フィクスチャを使用して測定されました — サブスクリプションライバーは別のユーザーによって作成されたエンティティを受信しました。

したがって、フレームの移動には2つの方向があり、そのうちの1つだけが拒否です:

| Legacy policy intent                                                     | New frame alone                                                                 |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| **Grant** WS (`Permit` under a `/v2/**` glob)                            | falls out of target → denied (diagnosed by `WS_AUTHZ_FRAME_MIGRATION_REQUIRED`) |
| **Restrict** WS (`Deny` / trailing `default-deny` under a `/v2/**` glob) | falls out of target → **delivery widens**                                       |

拡大方向は認可の退行であるため、`authorizeWs()` はレガシー `/v2/entities` フレームの下での明示的な `Deny` を尊重する移行的なセーフティネットを持っていました。**そのセーフティネットは [#2326](https://github.com/geolonia/geonicdb/issues/2326) で削除されました**、移行が完了した後:レガシーフレームが実際に拒否することは観測されなかったため (`WS_AUTHZ_LEGACY_FRAME_DENY` は発火しませんでした)、許可されたリクエストは現在 NGSI-LD フレームのみによって決定され、4回ではなく2回の PDP 評価でコストがかかります。

**したがって、`/v2/**` のみにスコープされた制限ポリシーは、WebSocket 配信を制限しなくなりました。** 制限ポリシーを `/ngsi-ld/**` にスコープしてください — 上記の移行注意を参照してください。これは `WS_AUTHZ_FRAME_MIGRATION_REQUIRED` 診断が許可方向についてまだカバーしています。

この不変条件には、ポリシー作成者にとって2つの実用的な結果があります:


1. **`GET` を Deny するポリシーは自動的に `WS` を Deny します。** ルール内で `WS` を繰り返す必要はありません; 2回目の評価は同じ Deny を拾います。
   
2. **`WS` のみをターゲットにするポリシーは、通常、設定ミスです。** 2回目の評価は `GET` にフォールバックするため、`WS` のみを拒否しても基礎データは保護されません — クライアントは `GET /ngsi-ld/v1/entities/...` 経由でまだ読み取ることができます。逆に、`WS` のみを許可することは、`GET` も許可されていない場合は無意味です。

#### 不変条件が適用される場所:接続ではなく、サブスクリプションライブと配信 (#1271)

`authorizeWs()` (WS ⊂ GET) チェックは、**サブスクリプションライブされた `entityType` ごとに**2つのポイントで実行されます、API Gateway パス (`handlers/websocket/default.ts` サブスクリプションライブ、`handlers/websocket/broadcaster.ts` 配信) とローカルパス (`core/streaming/local-ws-server.ts`) の両方で:


* **サブスクリプションライブ** — クライアントが `{ "action": "subscribe", "entityTypes": [...] }` を送信すると、各タイプは `authorizeWs(..., { entityType })` で認可されます。ポリシーが許可しないタイプは拒否されます。
  
* **配信** — 各イベントがプッシュされる前に、接続はイベントの具体的な `entityType` (および `entityOwner`/`scope`) で再認可されます。許可されたイベントのみが配信されます。

**接続はデータ認可を実行*しません*。** `$connect` (API GW) とローカルアップグレードハンドラは**認証とテナントマッチのみ**を検証します — `authorizeWs` を評価しません。これにより、単一の `entityType` にスコープされたキー (例:ポリシーが `entityType = PollVote` のみを許可し、タイプなしの `GET /ngsi-ld/v1/entities` は**ない**) が WebSocket を開き、そのタイプを受信できます。WS ⊂ GET 不変条件は保持されます。なぜなら、**サブスクリプションライブと配信でタイプごとの `authorizeWs` を通過しない限り、イベントは配信されない**からです — タイプに対する GET を持たないプリンシパルは、ソケットが開いていても、そのタイプの何も受信しません。

> **接続時の 403 は XACML ではありません (#2867)。** 本文 `"Access denied"` (「`"Access denied by policy"`」なし) を含む `$connect` 拒否は、**テナント解決の失敗** (間違った deployment DB、テナント名の不一致、または不明な `?deployment=` ホスト名) を意味します — ポリシー拒否ではありません。PDP/`authorizeWs` はサブスクリプションライブと配信でのみ実行されます。専用デプロイメントは、共有 execute-api WebSocket URL で `?deployment=<registered-hostname>` を渡す必要があります (SDK は `GET /sdk/v1/streaming` が `deployment` フィールドを返すときに自動的にこれを追加します)。

`ip-range` およびその他の `environment` ポリシー条件は、**データレイヤーで** WS にまだ適用されます:接続時のソース IP は接続レコード (`sourceIp`) に保存され、サブスクリプションライブ/配信の `authorizeWs` 呼び出しに渡されるため、IP スコープポリシーはそこで評価されます (接続時ではありません)。`sourceIp` が利用できない場合、それは不在として扱われ、`ip-range` 条件は閉じた状態で失敗します (拒否)。

> 何も受信できないプリンシパルの接続 (すべてのタイプが拒否される) は接続時に受け入れられますが、実質的に不活性です — イベントを受信しません。

#### 作成ガイダンス

特定のロール/テナントのストリーミングを制限したい場合は、`GET` に対してルールを記述します (または `actions` を完全に省略してルールがすべてのメソッドに適用されるようにします)。`WS` は、ルールが*両方*に適用される必要がある場合にのみ言及してください:

```json
{
  "actions": [
    { "attributeId": "method", "matchValue": "WS" },
    { "attributeId": "method", "matchValue": "GET" }
  ]
}
```

#### 検出

`PolicyService.validateWsGetSymmetry()` (#1085) は、ルールの `actions` に `method = 'WS'` (`string-equal`) が含まれているが、対応する `'GET'` エントリがない場合、`WARN` ログを出力します。これはすべての書き込みパスで実行されます:`createPolicy`、`updatePolicy`、`updatePolicySystem`、および `updatePolicyForUser` (セルフサービス `/me/policies` 更新を含む)。ポリシーは下位互換性を保つためにまだ受け入れられます — 警告はルールを再検討するための信号です。

```text
[WARN] PolicyService — Policy rule 'ws-only-deny' targets method='WS' without an explicit 'GET'
counterpart. WebSocket authorization evaluates both WS and GET, so WS-only rules typically do not
restrict the data path that GET serves.
```

#### ブロードキャスト時のエンティティごとの属性 (#1107 / #1383)

WebSocket ブロードキャスター (`src/handlers/websocket/broadcaster.ts`、`src/core/streaming/local-ws-server.ts`) が変更イベントを接続に配信するかどうかを決定するとき、AuthzRequest に次のエンティティごとの属性を注入します:

| attributeId   | Source                                                      | Use case                                                  |
| ------------- | ----------------------------------------------------------- | --------------------------------------------------------- |
| `entityType`  | `EntityChangeEvent.entity.type`                             | "Only forward `ActivityLog` events to clients"            |
| `entityId`    | `EntityChangeEvent.entity.id`                               | "Forward only `urn:ngsi-ld:Room:42` events"               |
| `entityOwner` | `EntityChangeEvent.entity.owner` (the entity's `createdBy`) | "Forward only events for entities the recipient owns"     |
| `scope`       | `EntityChangeEvent.entity.scope`, comma-joined (#1383)      | "Only forward events for entities scoped under `/public`" |

`entityOwner` 属性は、`${subject.userId}` テンプレート展開と組み合わせることで、単一の XACML ポリシーで**ユーザーごとの「自分のみ」配信フィルタ**を表現できます:

```jsonc
// Each user receives only updates to entities they created
{
  "policyId": "ws-self-only-feed",
  "target": {
    "subjects": [{ "attributeId": "role", "matchValue": "user" }],
    // #2284: the WebSocket frame is the NGSI-LD read path. A `/v2/**` glob here no longer
    // targets WebSocket requests, so this restriction would stop applying (see below).
    "resources": [
      { "attributeId": "path", "matchValue": "/ngsi-ld/**", "matchFunction": "glob" },
      { "attributeId": "entityType", "matchValue": "GeoJSON" }
    ]
  },
  "ruleCombiningAlgorithm": "first-applicable",
  "rules": [
    // Allow the user to create their own entity (no owner exists at POST time)
    { "ruleId": "permit-write", "effect": "Permit",
      "target": { "actions": [
        { "attributeId": "method", "matchValue": "POST" },
        { "attributeId": "method", "matchValue": "PATCH" },
        { "attributeId": "method", "matchValue": "PUT" }
      ] }
    },
    // For WS / GET, only forward entities the subject owns
    { "ruleId": "permit-self-read", "effect": "Permit",
      "target": { "resources": [
        { "attributeId": "entityOwner", "matchValue": "${subject.userId}" }
      ] }
    },
    { "ruleId": "default-deny", "effect": "Deny" }
  ]
}
```

> **キャッシングに関する注意**: ブロードキャスターは、単一のブロードキャスト内で `(role, policyId, userId)` ごとに認可決定をキャッシュします — `userId` がキーに含まれる必要があるのは、オーナーベースのポリシーが固定された entityType/entityOwner であってもユーザーごとの決定を生成するためです。同じ userId を持つマルチデバイスユーザーは、1 つのイベント内でキャッシュされた決定を共有します。
>
> **`entity.owner` のソース**: 変更イベントの公開時に `EntityService` (およびスナップショットクローンパブリッシャー #1563) によって透過的に入力され、共有の `buildChangeEventEntity()` ビルダー (#1383) を経由します。AWS では、これは API 起因の書き込みに対する**唯一の**イベントパブリッシャーです (#1560 で MongoDB change-stream プロセッサーが削除されました。これは死んだ第 2 のパブリッシャーでした)。local/standalone では、インプロセスの Change Stream ウォッチャーがサブスクリプション/ルールに対して同じビルダーを使用し、WebSocket は引き続きアプリパスから `emitEntityChange` に従います。これはエンティティの `createdBy` フィールド (認証されたユーザーによって `POST` 時に設定) から取得されます — `createdBy` のないエンティティ (レガシー/バッチ/非認証書き込み) は `owner` なしでイベントを発行し、その場合オーナーベースのルールはマッチせず、次のルールが適用されます。
>
> **TTL 失効削除は、アプリ側のスイーパー (#1561) を介して `EntityDeleted` を発行します。** MongoDB の TTL モニターは依然として `EntityService` の外部で物理削除を行いますが、`EntityExpiryService` が最初にソフト削除された行を要求し、`createEventPublisher()` を通じて公開します — 古い change-stream の `delete` ブランチが確実に運ばなかった使用可能な `id` / `type` / `owner` / `scope` です。[EVENT\_STREAMING.md](../features/subscriptions.md) および [QUOTAS.md](../saas/quotas.md#ttl-失効-expiresat-expiry-sweeper1561) を参照してください。
>
> **その他の EntityService バイパスパス (#1563)**: スナップショットクローンは `EntityCreated` / `EntityUpdated` を**発行します**。テナントカスケード削除と無効な地理情報の隔離は**発行しません**(フラッド/インフラ修復) — 決定はコードコメントと SECURITY.md / [EVENT\_STREAMING.md](../features/subscriptions.md) にあります。
>
> **ブロードキャスト時の `scope` (#1383)**: 保存されたエンティティの `scope` から入力され、エンティティレベルのチェックおよびリストクエリ行フィルター (#1369) と同じ**カンマ結合文字列セマンティクス**でマッチングされます — 配信境界は、サブジェクトが `GET` リストを介して読み取れるものと同一です。スコープのないエンティティ (欠落 / `null` / `[]`) は `''` として評価されます。マルチスコープエンティティのサブツリーマッチングには、境界を意識した `string-regexp` パターン (例: `(^|,)/public(/[^,]*)?(,|$)`) を推奨します。

### Subscription PIP 属性

サブスクリプションは **継続的な読み取り** であるため、ターゲットと送信先の制限は作成時だけでなく、すべての書き込みで保持される必要があります。#2005 以降、PIP は **6 つすべてのサブスクリプション書き込みセル** をカバーし、それらすべてにおいてリテラル `body.type === "Subscription"` は意図的に `entityType` として公開されて **いません**。

| Resource                     | Create                                  | Update                                        |
| ---------------------------- | --------------------------------------- | --------------------------------------------- |
| NGSI-LD subscriptions        | `POST /ngsi-ld/v1/subscriptions`        | `PATCH /ngsi-ld/v1/subscriptions/{id}`        |
| Context source subscriptions | `POST /ngsi-ld/v1/csourceSubscriptions` | `PATCH /ngsi-ld/v1/csourceSubscriptions/{id}` |
| NGSIv2 subscriptions         | `POST /v2/subscriptions`                | `PATCH /v2/subscriptions/{id}`                |

| attributeId            | Source field (NGSI-LD / csource) | Source field (NGSIv2)                                             | Use case                                                                                                  |
| ---------------------- | -------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `entityType`           | `entities[].type`                | `subject.entities[].type`                                         | "Anonymous can only subscribe to `ActivityLog`"                                                           |
| `entityId`             | `entities[].id`                  | `subject.entities[].id`                                           | "Allow subscribing only to `urn:ngsi-ld:Room:1`"                                                          |
| `entityIdPattern`      | `entities[].idPattern`           | `subject.entities[].idPattern`                                    | "Allow subscribing only when the pattern matches `urn:ngsi-ld:Sensor:.*`"                                 |
| `notificationEndpoint` | `notification.endpoint.uri`      | `notification.http` / `httpCustom` / `mqtt` / `mqttCustom` `.url` | "Notifications may only be sent to `https://*.example.com/**`" — defence against SSRF / data exfiltration |

`?type=` はこれらのパスの認可属性として **決して** 使用されません。コントローラーはそれも `body.type` もサブスクリプションが何を監視するかを決定するために使用しないため、これを受け入れると、実際には `Secret` をサブスクリプションライブしながら呼び出し元が `?type=Public` を宣言できてしまいます。

#### 部分更新は更新後の有効値で評価されます(#2005)

`PATCH` は部分更新であるため、上記の属性は **「本文が宣言する値、それ以外の場合はすでに保存されている値」** として解決されます。


* 本文が `entities` (NGSIv2: `subject`) を宣言 → 宣言されたターゲットが評価されます(許可されたサブスクリプションを制限されたタイプに切り替えることはできません);
  
* 本文がそれらを省略 → **保存された** ターゲットが評価されます(説明または通知エンドポイントのみに触れることで、現在制限されているタイプをターゲットとするサブスクリプションを存続させることはできません);
  
* どちらもターゲットを生成しない → 単一の空のターゲットが評価され、フェイルクローズドとなります。

絞り込みは許可されています。制限されたタイプをターゲットとするサブスクリプションは、更新後の値が評価されるため、許可されたタイプに `PATCH` で縮小できます。

保存された値が必要なため、`PATCH` セルはパスレベルの PEP からコントローラー(`requireSubscriptionUpdateAuthz`)に決定を委譲します。これは、ID によるエンティティルートがエンティティレベルの認可に委譲するのと同じ方法です。保存されたタイプはすでに正規化されており、リクエストの `@context` に対して再正規化されることは **ありません**。クライアントが宣言したタイプのみが再正規化されます(#1613)。

#### PEP はサブスクリプションコントローラーと同じ `@context` を解決します(#1657)

クライアントが宣言したタイプは評価前に正規化されるため(#1613)、PEP はコントローラーが保存する **同じ** アクティブな `@context` を選択する必要があります。そうでなければ、呼び出し元は制限されたタイプを許可されているように見える用語にエイリアスできてしまいます(「認可は `AliasType` を見て、ストレージは `SecretType` を見る」)。#1772 / #1924 以降、供給ルールは **1 つの** 場所(`selectActiveContextRef`)で適用される条項 6.3.5 であり、コントローラーと PEP の両方で使用されます。`application/ld+json` は本文の `@context` を取得し、`application/json` は `Link` ヘッダーを取得し、2 つを混在させると 400 になります。ルートごとの分岐が残っていないため、コントローラーが `@context` ソースを変更しても、PEP を黙って非同期化することはできません。

`tests/e2e/features/auth/subscription-write-authz.feature` は両方の供給形式に対してこれを固定します。制限されたタイプの IRI にエイリアスされた用語は、ld+json 本文の `@context` 経由で到着するか、`application/json` の `Link` ヘッダー経由で到着するかにかかわらず拒否されます。

#### 複数エンティティの全 Permit セマンティクス

`entities[]` が複数の要素を含む場合、PEP は **要素ごとに 1 つの AuthzRequest を評価** し、リクエストは **すべての** AuthzRequest が `Permit` を返した場合にのみ許可されます。単一の `Deny` / `NotApplicable` / `Indeterminate` がリクエスト全体を `403 Forbidden` に短絡させます。これにより、「最初の要素は問題なく見えるので、残りを紛れ込ませる」というバイパスが防止されます。

```jsonc
// All elements must satisfy the policy. With a policy that permits only ActivityLog,
// this body is rejected because { type: "Building" } is not permitted.
{
  "type": "Subscription",
  "entities": [{ "type": "ActivityLog" }, { "type": "Building" }],
  "notification": { "endpoint": { "uri": "http://localhost:1028/notify" } }
}
```

#### 例: タイプベース + URI ベースの制御の組み合わせ

```json
{
  "policyId": "anon-subscribe-activity-only",
  "target": {
    "subjects": [{ "attributeId": "role", "matchValue": "anonymous" }],
    "resources": [{ "attributeId": "path", "matchValue": "/ngsi-ld/v1/subscriptions" }],
    "actions": [{ "attributeId": "method", "matchValue": "POST" }]
  },
  "ruleCombiningAlgorithm": "first-applicable",
  "rules": [
    {
      "ruleId": "allow-activitylog-to-internal-hooks",
      "effect": "Permit",
      "target": {
        "resources": [
          { "attributeId": "entityType", "matchValue": "ActivityLog" },
          { "attributeId": "notificationEndpoint", "matchValue": "https://*.example.com/**", "matchFunction": "glob" }
        ]
      }
    },
    { "ruleId": "deny-rest", "effect": "Deny" }
  ]
}
```

このポリシーは、サブスクリプションのターゲットタイプが `ActivityLog` で *かつ* 通知エンドポイントが `*.example.com` にある場合に *のみ* 許可します。`resources` 内の異なる `attributeId` は AND 結合されます([ターゲットマッチングセマンティクス](#target-matching-semantics) を参照)。

> **ポリシーターゲティングに関する注意**: `/ngsi-ld/v1/subscriptions` との完全一致で `path` に対して記述されたポリシーは、作成呼び出しのみをカバーします。更新もカバーするには、グロブ(`/ngsi-ld/v1/subscriptions**`)を使用してください — `*` は `/` を越えません。

### バッチ操作の認可 (#1325)

バッチ操作は単一のリクエストで複数のエンティティを運ぶため、単一の `entityType` ではリクエスト全体を表現できません。PIP はリクエストボディから **異なるエンティティタイプごと** に 1 つの認可ターゲットを抽出し、PEP はサブスクリプションと同じ **all-Permit セマンティクス** でそれらを評価します:すべてのターゲットが `Permit` を返す必要があり、そうでない場合はバッチ全体が `403 Forbidden` で拒否されます。

対象エンドポイント (すべて `POST`):

| Endpoint                                                                              | Body shape                        | Targets                                                                                                |
| ------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `/ngsi-ld/v1/entityOperations/create` / `upsert` / `update` / `merge`                 | Entity array                      | One per distinct `type` / `@type` (multi-type arrays supported)                                        |
| `/ngsi-ld/v1/temporal/entityOperations/create` / `upsert`                             | Entity array                      | Same as above                                                                                          |
| `/ngsi-ld/v1/entityOperations/delete`, `/ngsi-ld/v1/temporal/entityOperations/delete` | Entity ID (URI string) array      | One per distinct `entityId`, with `entityType` fixed to `""` (the type is unknown without a DB lookup) |
| `/v2/op/update`                                                                       | `{ actionType, entities: [...] }` | One per distinct `entities[].type`                                                                     |

例: `entityType: EVChargingStation` に対してのみ `POST` を許可するポリシーの場合、`EVChargingStation` エンティティのみを含むバッチ upsert は成功しますが、1 つの `Sensor` エンティティが混在するバッチは全体として拒否されます — 何も書き込まれません。

**Fail-closed ルール**:


* タイプが判定できない要素 (欠落した `type`、NGSIv2 の ID のみの更新、非オブジェクト要素)、パース不可能なボディ、および `MAX_BATCH_SIZE` を超えるボディは、`entityType: ""` を持つターゲットとして評価されます。これはタイプ制約付き Permit ルールに決してマッチせず、`?type=` クエリパラメータはこれらのターゲットのフォールバックとして意図的に **使用されません** (そうでないと `?type=<allowed>` を追加することで制約をバイパスできてしまいます)。
  
* `path` / `method` のみを制約するポリシー (`entityType` マッチなし) は影響を受けません:注入された `entityType` 値に関係なくマッチするため、制約のない API キーは以前と全く同じように動作します。
  
* **バッチ削除** のボディはタイプ情報のない ID 配列であるため、タイプ制約のみのポリシーはバッチ削除を許可できません。`entityId` ベースのルール (glob パターンサポート、例: `urn:ngsi-ld:EVChargingStation:*`) を追加するか、代わりに単一エンティティの `DELETE` リクエストを使用してください。

> **注 (#1325/#1337/#1369)**: 読み取り側のバッチエンドポイント `POST /ngsi-ld/v1/entityOperations/query` および `POST /v2/op/query` は **リストレベル認可** で処理されます:読み取り可能エンティティフィルタ (entityType / scope / entityOwner) がポリシーセットから導出され、クエリに組み込まれます;宣言されたタイプは固定属性として折り込まれます (許可されていない宣言タイプは依然として 403 を返します) — [ポリシーからフィルタへのクエリ書き換え](#policy-to-filter-query-rewriting-for-list-queries-1337--1369) を参照してください。
>
> **集合ベースの削除 (`purge`) もリストレベルです (#1679)**: `DELETE /ngsi-ld/v1/entities` (clause 5.6.21) および GeonicDB 拡張 `POST /ngsi-ld/v1/entityOperations/purge` は、ID セットではなく *述語* でターゲットを選択するため、上記の all-Permit バッチ評価は適用されません。両方とも同じ読み取り可能エンティティフィルタ (entityType / scope / entityOwner) を導出し、削除クエリに組み込むため、**サブジェクトが削除を許可されていない行は述語から除外されて生き残ります**;削除可能な行が全くないサブジェクトは `403` を受け取ります。パスレベルのボディ抽出 (`type`) だけでは *不十分* です — クライアントが宣言したタイプのみを見て、保存された `scope` / `entityOwner` を見ることはありません。同じ配線が、コントローラをバイパスする非 HTTP エントリポイントにも適用されます: MCP `batch` ツール (`action: "purge"`) および A2A `batch` スキル (`action: "purge"`)。
>
> **例外 — 宣言されたタイプが単一の権威的な操作対象タイプでない場合、折り込まれ *ません* (#1653/#1656/#2061)**: **NGSIv2 `POST /v2/op/query`** の場合、実際にマッチするタイプはボディの `entities[].type` / `typePattern` (複数の仕様) に存在し、コントローラは `?type=` / ボディトップレベルの `type` を無視します;そして **カンマ区切りの `?type=A,B`** をリスト読み取りで使用すると、コントローラによって要素ごとに分割されます。どちらかを単一の固定属性として折り込むと、導出されたフィルタを `unrestricted` に崩壊させる可能性があります (その折り込まれた値が無条件に許可されている場合)、一方でコントローラは *異なる* タイプセットをマッチさせます — permit-by-default + point-deny ポリシーの下で禁止された行をリークします。これらのルートでは `entityType` は **自由変数** として保持され、導出された行レベル述語が代わりにすべての仕様にわたって強制されます。
>
> **ディスカバリルートは `?type=` を一切折り込みません (#2061)** — 単一トークンであっても。`GET /ngsi-ld/v1/types`、`/types/{typeName}`、`/attributes`、`/attributes/{attrId}`、`/v2/types` および `/v2/types/{typeName}` は、**パスパラメータ** (詳細) または **すべての読み取り可能エンティティ** (リスト) からマッチ対象を決定します;いずれも `?type=` を読み取りません。それを折り込むと `?type=<readable>` が導出されたフィルタを `unrestricted` に崩壊させ、読み取り不可能なタイプの存在、`entityCount`、および属性名をリークします — #1370 が閉じたリークを再び開くことになります。その結果、これら 6 つのルートでの `?type=<denied>` は高速な `403` を生成しなくなりました:レスポンスは `?type=` なしの同じリクエストと同一です (行フィルタされた `200`、またはサブジェクトが読み取れないタイプの場合は `404`)。これが正しい結果です — ETSI GS CIM 009 はこれらの操作に対して `type` パラメータを定義していないため、古い `403` はコントローラが決して参照しない値によって駆動される誤った拒否でした。`/ngsi-ld/v1/temporal/entities` および `/ngsi-ld/v1/entityMaps` は実際のマッチフィルタとして `?type=` を **使用します** (`params.type` → `typeList`)、したがってそれを折り込み続けます。
>
> これら 6 つのルート以外では、単一の `?type=Denied` (カンマなし) は依然として折り込まれます (高速 `403`)。

### by-id ルートのエンティティレベル認可 (#1324, #1336)

**by-id エンティティルート** — `/ngsi-ld/v1/entities/{id}` (および `/attrs`、`/attrs/{attrName}`)、`/v2/entities/{id}` (および `/attrs`、`/attrs/{attrName}`、`/attrs/{attrName}/value`)、および **temporal by-id ルート** `/ngsi-ld/v1/temporal/entities/{id}` (および `/attrs`、`/attrs/{attrName}`、`/attrs/{attrName}/{instanceId}`) (#1336) — に対して、パスレベル PEP はスキップされ、**エンティティレベル認可が単一の強制ポイント** となります。データに触れる前に、コントローラは DB からエンティティの実際の属性をロードし、次の情報で完全なポリシーセットを評価します:

| Attribute     | Source                                                                                                                                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entityType`  | **Actual type stored in the DB** — never the client-supplied `?type=` parameter (that is only a lookup filter). If the entity does not exist, `entityType` is evaluated as `""` (matches no type-constrained Permit rule). |
| `entityId`    | Path parameter                                                                                                                                                                                                             |
| `entityOwner` | `createdBy` of the stored entity                                                                                                                                                                                           |
| `scope`       | `scope` of the stored entity                                                                                                                                                                                               |

結果:


* **タイプ制約付きキーは by-id 操作で機能します。** `entityType: SalesTarget` に対して `GET` を許可するポリシーは、`GET /ngsi-ld/v1/entities/urn:ngsi-ld:SalesTarget:1` を直接許可するようになりました。#1324 以前はこれは常に拒否に落ちていました (パスレベル評価には `entityType` がありませんでした)、そして回避策は URN プレフィックス `path` glob ルールでした — これらは依然として機能しますが、もはや必要ありません。
  
* **エンティティレベルの決定は fail-closed です**: `NotApplicable` → `403`。決定的なデフォルトを持つロール (`user`、`tenant_admin`、`super_admin`) は影響を受けません (それらのデフォルトポリシーは常に決定を生成します);`api_key` / `anonymous` / `oauth_client` (空ルールデフォルト) の場合、これが正しいクローズド動作です。制約付きキーの下で存在しないエンティティは `403` を返します (存在は開示されません)。
  
* **`?type=` は認可属性を偽造できません。** `GET /entities/{sensorId}?type=AllowedType` は拒否されます: DB ルックアップ (宣言されたタイプでフィルタされた) は何も見つけず、リクエストは `entityType: ""` で評価されます — クエリパラメータのフォールバックはエンティティレベル評価では意図的に抑制されています (#1325 と同じバイパス防止)。
  
* Deny フェンス (例: super\_admin データ API フェンス) は影響を受けません — エンティティレベル評価はパスレベルと同じポリシーセットを実行します。
  
* **Temporal by-id ルートは認可属性を `entities` コレクションから取得します** (#1336) — temporal コレクションは owner/scope を保存しません。エンティティがそこにもう存在しない場合 (履歴を保持したまま削除された、または temporal API 単独で作成された)、owner と scope は利用できず、リクエストはそれらなしで評価されます。
  
* **その場合でも `entityType` は削除され *ません
* (#2157)。** それは temporal 履歴自身の `metadata.entityType` から解決され、typeless 評価 **に加えて** 評価されます (両方が Permit する必要があります)、したがって `entityType` をターゲットとする Deny ルールは依然として **temporal-only** エンティティ (履歴はあるが `entities` にドキュメントがないもの — `POST /ngsi-ld/v1/temporal/entities` の通常の結果、これは `entities` に書き込むことはありませんが、scope を運ぶボディは例外で、#2434 A'-1 によって **実体化されます**) にマッチします。#2157 以前は、属性は単に存在せず、タイプ制約付き Deny ルールは `NoMatch` となり、permit-by-default ポリシーは `GET /ngsi-ld/v1/temporal/entities/{id}`、MCP `temporal.get`、または A2A `temporal.get` を通じて禁止された履歴を読み取りました — 一方 *リスト
* ルートは同じ行を隠しました (それらは `entities` から導出された読み取り可能な `entityId` セットでフィルタされます)。フォールバックは fail-closed 方向でその read/by-id 非対称性を閉じます;リストルートは意図的に **広げられませんでした**。これはすべての temporal by-id 操作 (get / delete / attrs / instance) および temporal **batch** シェイプに適用されるため、`batch_delete` は by-id delete が拒否する行に到達できません (パリティ不変)。1 つの ID に対して複数の記録されたタイプがある場合、*すべて
* が許可される必要があります。
  
* **フォールバックは常により多く拒否し、決してより少なく拒否しません。** typeless リクエストは解決されたタイプと並行して依然として評価されるため、タイプを解決できなかったときに拒否されたサブジェクトは拒否され続けます:#1336 の意図的な fail-closed ルール — タイプ制約付きサブジェクトは、エンティティボディがもう存在しない履歴に到達できない — は逐語的に保持されます。(typeless 評価を追加する代わりに置き換えると、そのケースが `403` から `200` へ静かに反転しました;`tests/e2e/features/auth/temporal-entity-authz.feature` で測定されました。)
  
* **temporal-only エンティティの owner / scope は評価不可能なままです** — temporal コレクションはどちらも記録しないため、owner および scope 制約付きルールは依然としてそれらの行にバインドできません (#2157 による変更なし;以下の既知の制限を参照してください)。

### リストクエリに対するポリシーからフィルターへのクエリ書き換え (#1337 / #1369)

**リスト読み取りクエリ** — `GET /ngsi-ld/v1/entities`、`GET /v2/entities`、`POST /ngsi-ld/v1/entityOperations/query`、`POST /v2/op/query`、および (#1370 以降) 集約読み取り `GET /ngsi-ld/v1/types`、`GET /ngsi-ld/v1/attributes`、`GET /v2/types`、`GET /ngsi-ld/v1/temporal/entities` — に対しては、パスレベルの PEP はスキップされ、**リストレベルの認可** がサブジェクトの有効なポリシーセットから *読み取り可能エンティティ述語* を導出し、それを MongoDB フィルター (行レベルセキュリティ) に組み込みます。ページネーション、`NGSILD-Results-Count` / `Fiware-Total-Count`、およびリスト ETag はフィルター適用後に計算されるため、常にサブジェクトが読み取れる内容と一致します。

導出は **`entityType`、`scope`、`entityOwner` を自由変数とするシンボリック PDP 評価** です (#1369 はこれを `entityType` 単独から拡張しました): エンティティ `E` は、同じリクエストが `entityType: E.type`、`scope: E.scope.join(',')`、`entityOwner: E.createdBy` で評価されたときに Permitted となる場合に限り、導出された述語にマッチします。3 つのルール結合アルゴリズムすべてと 2 段階結合 (優先度グループごとの first-applicable + グループ横断 deny-overrides) は、ルールの順序を含めて正確に再現されます。

リクエストが **型を宣言** する場合 (`?type=` / `body.type`)、`entityType` は自由変数セットから外れ、宣言された値を持つ固定属性として折りたたまれます — これは #649 のセマンティクスを保持します (許可されていない宣言型でも `403` が返ります) が、スコープ/オーナーの行フィルターは **依然として適用されます**: 型を宣言してもスコープ/オーナーベースの制限をバイパスすることはできません。`null` / `undefined` の属性のみが自由変数になります (#1384)。**宣言型が折りたたまれるのは、それが単一の権威ある操作対象型である場合のみです**: `POST /v2/op/query` (実際の型は body の `entities[].type` / `typePattern` 仕様) の場合; ディスカバリールート `GET /ngsi-ld/v1/types(/{typeName})?`、`GET /ngsi-ld/v1/attributes(/{attrId})?`、`GET /v2/types(/{typeName})?` (#2061) の場合 — これらのコントローラーは `?type=` に対してまったくマッチしません (名前指定の詳細ルートは **パス** パラメーターでマッチし、裸のリストルートはすべての読み取り可能な行を集約します)。そのため宣言された `?type=` はコントローラーが実際に返す行に観測可能な影響を与えず、それを折りたたむと単一の読み取り可能な `?type=` 値が導出フィルターを `unrestricted` に崩壊させる一方で、他のすべての型の存在/カウント/属性名のリークが開いたままになります; またコントローラーが正規化 (`split(',') → trim → drop-empty`) して元の値と同一の単一トークン以外のものになる `?type=` — カンマ区切りの `A,B`、空白パディングされた `" Secret"`、または空白のみの `" "` (コントローラーはこれを型フィルター *なし* = すべての型に変換します) — の場合、`entityType` は **自由変数** として保持され、導出された行レベル述語はすべての仕様にわたって適用されます。折りたたまれて `unrestricted` に崩壊することはありません (#1653/#1656/#2061)。空文字列のフェイルクローズマーカー (`''`、`body.type: ""` から) は例外です: これは **自由変数にされません** — 依然として `kind:'none'` → `403` に折りたたまれます (#1384)。そのため `body.type: ""` はリスト全体の deny をエスケープするために使用できません。**リクエスト上の空文字列値 — 解決不可能な属性のフェイルクローズマーカー (#1324/#1325)、例えば `body.type: ""` — はリスト全体をクローズド失敗させます (`403`)**: これは固定値として折りたたむことができません。なぜならデータクエリは空の値で行を制限しないからです (折りたたむと制約された Deny ルールが空白になり、リークが発生します)。また、マーカーを無視せずに自由変数として扱うこともできません。これは *リクエスト* の宣言属性値のみに適用されます: `scope` / `entityOwner` に `matchValue: ""` を持つポリシー **ルール** (スコープなし/オーナーなしの行にマッチ) は影響を受けず、導出された行フィルター内でそれらの行にマッチし続けます。

結果:

| Derivation result                           | Behavior                                                                                                       |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Unconditional Permit, no deny contributions | No filter (unchanged behavior — e.g. `tenant_admin`, plain `user` role)                                        |
| Some readable rows                          | `200` with only readable entities (**was `403`** for type/scope/owner-constrained subjects before #1337/#1369) |
| No readable rows                            | `403` fail-closed (unchanged — e.g. policy-less `api_key` / `anonymous`)                                       |

影響:


* **型制約されたキーは `?type=` なしでリストできます。** `entityType: SalesTarget` のみに許可されたキーは、SalesTarget エンティティのみを含む `200` を取得します。#1337 以前はこれは常に `403` でした。
  
* **明示的な Deny ルールは、リスト結果から該当する型を隠すようになりました。** `entityType: Secret` に対する `GET` を拒否するテナントポリシー (ロールデフォルトより上の優先度、例: `priority: 10`) は、`user` の型なしリストから Secret エンティティを削除します — 以前は deny は by-id / by-type リクエストでのみ機能していました。
  
* **オーナー専用読み取りがリストで機能します** (#1369)。`entityOwner: ${subject.userId}` で `GET` を許可するルール (+ deny-others) は、すべてのリストを「自分が作成した行のみ」に変換し、正確なカウントヘッダーを含みます。MongoDB 変換は保存された `createdBy` フィールドをターゲットにします; 空文字列にマッチする条件は `createdBy` がないドキュメントにもマッチします (PDP は欠落しているオーナーを `''` として評価します)。
  
* **スコープベースの読み取りがリストで機能します** (#1369)。スコープルールは、PDP がエンティティレベルのチェックで使用するのと同じ **カンマ結合されたスコープ文字列** に対してマッチされます (上記の `scope` 属性注記を参照) — マルチスコープエンティティに対するサブツリーマッチングには、`(^|,)/public(/[^,]*)?(,|$)` のような境界認識型の `string-regexp` パターンを推奨します。変換は `$expr` 経由で MongoDB で結合文字列セマンティクスを再現します; スコープのないエンティティ (`scope` が欠落 / `null` / `[]`) は `''` にマッチするルールにマッチします。ジオクエリ (`$geoNear`) は `$match` ステージと同じ述語を適用するため、距離ソート結果とそのカウントは同一にフィルタリングされます。
  
* 環境条件 (`time-range` / `ip-range`) および `${subject.*}` テンプレートはリクエスト時に折りたたまれます; 解決されないテンプレート (#1939) および無効な正規表現 (#1935) は `Indeterminate` となり、導出を「読み取り可能な行なし」(403) にショートサーキットします。これは PDP が到達するのと同じフェイルクローズの結果です。
  
* **`entityId` / `entityIdPattern` によって制約されたルールはリストレベルでは発火しません** (これらは空の値に対して評価されます。パスレベル評価と全く同じです) — by-id リクエストはエンティティレベルの認可 (#1324) でカバーされます。
  
* **フェデレーション結果 (コンテキストプロバイダー) も同じ導出述語でフィルタリングされます (#2003)** — リモートエンティティは MongoDB に触れることがなく、`entityReadFilterToMongo` を直接通過できないため、方法については以下の補足を参照してください。

> **動作変更に関する注記 (#1369)**: `scope` / `entityOwner` によって制約されたポリシーは、以前はリストリクエストで発火することはありませんでした (両方の属性が `''` として評価されました)。現在は行フィルターとして機能します。特に、`actions` を書き込みメソッドに制限していない「オーナー専用 **書き込み**」ポリシーは、リストパスに適用されると読み取りも行フィルタリングします — そのようなポリシーは意図されたメソッドにスコープを設定してください (`actions: [{"attributeId": "method", "matchValue": "PATCH"}, ...]`)。
>
> **フォローアップステータス**: #1369 で延期された `/ngsi-ld/v1/types` / `/ngsi-ld/v1/attributes` 集約および時系列リストクエリは #1370 / #1488 で完了しました; EntityMap 作成は #1955 で、EntityMap **読み取り** は #1963 で完了しました (下の表を参照)。#1369 からのすべてのフォローアップは現在クローズされています。
>
> **フェデレーション (コンテキストプロバイダー) 結果も同じ述語を通過するようになりました (#2003)。** `ContextSourceRegistration` 転送からマージされたリモートエンティティは MongoDB に触れないため、上記の導出フィルター — MongoDB クエリに組み込まれるもの — はそれらに対して実行されませんでした: `entityType` / `scope` / `entityOwner` によって制限されたプリンシパルは、以前は **フィルタリングされていない完全な** リモート結果を見ていました。`entityMayBeRead()` (`policy.filter.ts`) は `entityReadFilterToMongo` の JS ミラーで、3 つの自由変数次元すべてを **具体的な値** に対して評価します — `entityTypeMayBeReadable()` (さらに下にある登録存在チェック。これは登録が具体的な値を持たないため `scope` / `entityOwner` を「マッチする可能性がある」として扱います) とは異なり、リモートエンティティ **は** 実データの行であるため、値を持たない次元は、`createdBy` / `scope` を持たないローカルドキュメントで使用される実際の値 `''` と同じ値に折りたたまれます — 「マッチする可能性がある」にはなりません。`FederationService.filterRemoteEntitiesByReadFilter()` は、inclusive/auxiliary マージの前および exclusive モードでこれを適用します。リモートレスポンスは `type` を **そのまま** 運びます (正規化された保存形式とは異なります)。そのため、フィルターは #2086 で使用されるのと同じ `createStoredTypeCanonicalizer()` でまず正規化します — そうしないと `Deny entityType == Sensor` ルールは FQN 化されたリモート型を黙ってミスします (#2086 クラスのリーク)。コア `@context` が解決できない場合、リモート結果は正規化されずに比較されるのではなく、**完全にドロップされます** (フェイルクローズ)。これにより #2003 は、行レベル制限されたプリンシパルを保守的な型抑制候補セットに保つ #1994 `probeEntityType` ガードを削除することもできました。制限されたプリンシパルは現在 **通常の** 登録マッチングを通過し、その後 `narrowRegistrationsByReadableType()` がプリンシパルが読み取れない型 **のみ** を宣言する候補をドロップします (`entityTypeMayBeReadable()` を使用。ディスカバリーエンドポイントが使用するのと同じ存在チェック)。マージされたエンティティだけをフィルタリングしても十分ではありません: 転送されたが読み取り不可能な登録は、プロバイダー失敗時に発生する `199` 警告、および — `exclusive` 登録の場合 — Via ループ検出によって発生する `508` を通じて、その `endpoint` と登録 id をリークします。型をまったく宣言しない登録 (`entityTypes` が空または `'*'`) は型情報を運ばず、依然として転送されます。エンティティの可視性はこの絞り込みによって変更されません。なぜなら、ドロップされた登録は宣言する型のエンティティのみを供給できたはずであり、それらはいずれにせよ行レベル述語によって削除されるからです。コア `@context` が解決できない場合、転送はまったく行われず、レスポンスは結果が部分的であることを示す `199` 警告を運びます (条項 6.3.6) — 意図的に登録を **名指ししません**。
>
> **By-id 取得もカバーされています (#2092)。** リモートにのみ存在するエンティティに対する `GET /ngsi-ld/v1/entities/{id}` はエンティティレベル認可 (#1324/#1336) を通過し、`getEntityAuthzContext` はそのようなエンティティに対してローカルで何も見つけません — PDP は `entityType` なしで評価されるため、型ベースの `Deny` はその時点では発火しません (修正前は `200` を返すことが測定されていました)。#2092 は #2003 と同じ行レベル述語でこれをクローズします: すべてのフェデレーション by-id 読み取りパス (NGSI-LD `GET /entities/{id}`、`/attrs`、`/attrs/{attrName}`; NGSIv2 `GET /v2/entities/{id}`、`/attrs`、`/attrs/{attrName}`、`/attrs/{attrName}/value`) は、遅延導出されたフィルター (`deriveRemoteEntityReadFilter`) を `FederationService.getEntity` に渡します。これはリモートエンティティに対して `entityMayBeRead()` (型は最初に正規化) を適用し、転送候補に対して `narrowRegistrationsByReadableType()` を適用します。導出は意図的に、クライアントが `?type=` を宣言した場合でも `entityType` を **自由変数** として保持します — 宣言型は検索フィルターのみです (#1324) ので、呼び出し元が `Deny` をターゲットから外すことを許してはなりません。読み取り不可能なリモート専用エンティティは `404` を生成します (非存在と区別できず、リスト結果に存在しないことと一致します); 導出は、少なくとも 1 つの転送候補登録がマッチした場合にのみ実行されるため、登録のないテナントは追加のポリシー作業を支払いません。MCP / A2A `get` アクションは非フェデレーション `EntityService` を使用し (`ENTITY_FORWARDING_ACTIONS` に `get` はありません)、リモートエンティティに到達することはありません。

#### エンティティに対する集約および派生読み取り (#1370 / #1955)

`entities` コレクションを読み取るすべてのエンドポイントは、**同じ導出述語** を適用する必要があります。そうしないと、エンティティエンドポイントが隠す行が他のエンドポイントを通じて観測可能になります (#1376 パリティ不変条件)。上記のリストエンドポイントを超えて:

| Endpoint                                                                                         | What the predicate protects                                                                              | Wiring                                                                                                                          |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `GET /ngsi-ld/v1/types`, `/v2/types`, `/ngsi-ld/v1/attributes`                                   | Existence of a type / attribute, and their counts                                                        | #1370 / #1488 / #2061 (closed a `?type=` fold that let a single readable type collapse the derived filter and re-open the leak) |
| `GET /ngsi-ld/v1/temporal/entities`                                                              | Readable `entityId` set (temporal rows carry no owner/scope)                                             | #1370                                                                                                                           |
| `POST /ngsi-ld/v1/snapshots`, `.../clone`, `DELETE /ngsi-ld/v1/snapshots`                        | Rows copied into / restored from a snapshot                                                              | #1945                                                                                                                           |
| `POST /ngsi-ld/v1/entityMaps`                                                                    | The `entityIds` set stored in the EntityMap and its `totalCount`                                         | #1955                                                                                                                           |
| `GET /ngsi-ld/v1/entityMaps{,/{id}}`, `PATCH`, `DELETE`                                          | The **stored** `entityIds` / `totalCount` of an EntityMap created by another principal                   | #1963 (owner guard)                                                                                                             |
| `GET /ngsi-ld/v1/entities{,/{id}}?join=flat\|inline`                                       | Entities reached by following `Relationship` objects (Linked Entity Retrieval, clause 4.5.23)            | #2213                                                                                                                           |
| `GET /catalog{,/**}` (DCAT / datasets / sample / CKAN)                                           | Dataset existence, `entityCount`, attribute schema, spatial bbox, and `sample` entity bodies             | #2465 / #2468 / #2471 / #2472                                                                                                   |
| Notification payloads of subscriptions with `notification.join`                                  | Entities reached by following `Relationship` / `ListRelationship` targets **into the notification body** | #2104                                                                                                                           |
| Notification payloads of entity subscriptions (`/ngsi-ld/v1/subscriptions`, `/v2/subscriptions`) | The **primary notified entity itself** — id, type and attribute values in `data[]`                       | #2205                                                                                                                           |

> **CADDE v4 は明示的にこのマトリックスの外です (#2469)。** `/cadde/api/v4/entities` と `/cadde/api/v4/catalog` は GeonicDB プリンシパルを持ちません — これらは CADDE 独自の JWT で認証します (または `authEnabled: false` の場合は認証なし) ので、`Deny(entityType == X)` のようなテナントポリシーを含め、**XACML 行レベル読み取りフィルターを適用しません**。これは意図的です: CADDE はデプロイメント全体のオプトインデータ交換ゲート (`PUT /admin/cadde`、デフォルトで `enabled: false`) であり、その信頼モデルは契約レベル (リソース URL / コネクター認証) であり、GeonicDB 内部のプリンシパルごとの行制御ではありません。#1376 パリティ不変条件 (「プリンシパル P の制限は P が使用できるすべての形状にわたって保持される」) は、このパスに GeonicDB プリンシパル P が存在しないため適用されません。CADDE と XACML を参照してください。
>
> **リンクエンティティ取得 (`join`) は Relationship を辿って呼び出し元が要求していない行に到達します (#2213)。** `join=flat` / `join=inline` は `Relationship` 属性のターゲットを解決し、レスポンス配列に追加するか、`entity` サブ属性として埋め込みます。これらのターゲットは呼び出し元が `?type=` で宣言した型 **ではありません** — リンクエンティティが指すものです。#2213 まで、解決は `EntityRepository.getMany()` を通過していました。これはテナント / servicePath / プロトコル / 論理削除境界を持っていましたが **行レベル述語はありませんでした**。そのため、`entityType == Secret` を拒否されたサブジェクトは、それにリンクする読み取り可能なエンティティをリクエストすることで、`Secret` エンティティを完全に読み取ることができました。述語を回避するには 1 つの `Relationship` で十分でした — #2003 (フェデレーション結果) と同じ「2 つのパスがどの行が読み取り可能かについて一致しない」クラスです。
>
> **同じ穴が通知にも存在します (#2104)。** `notification.join` は Relationship ターゲットを通知本文に解決します。そこには HTTP リクエストがなく、したがって述語を導出する `actor` もありません。述語は **サブスクリプション作成者** (`createdBy`) から `deriveSubscriberReadFilter()` で導出されます — これは #2133 が CSource 通知のために導入したヘルパーで、2 つのパスがずれないように共有されています (いずれかの場所で有効ロールまたは `super_admin` `tenantId` を間違えると「HTTP が隠すものが通知に現れる」ことになります)。`'skip'` の結果は異なるマッピングがされます: CSource 通知は述語が決定不可能な場合に **送信されません** が、`notification.join` は `'skip'` を `{ kind: 'none' }` にマップします — リンクエンティティはゼロ、通知は依然として配信されます。`join` は追加の表現であるため、決定不可能な述語が配信を黙って停止してはなりません; リンクデータを差し控えることがフェイルクローズ部分です。
>
> **通知対象エンティティ自体も述語を通過する (#2205)。** 上記の #2104 は `notification.join` が *到達する* 行をカバーします。通知が実際に対象とするエンティティはフィルタリングされていませんでした。書き込みパスでもフィルタリングできませんでした。サブスクリプション書き込みは **サブスクリプションリソースパス** をフレームとして認可されます (`buildSubscriptionAuthzRequests`)。そのため、`/ngsi-ld/v1/entities**` にスコープされたポリシーは、サブスクリプション作成時にターゲットセットの一部にすらなりません。つまり、エンティティ読み取りで `entityType == Secret` を拒否されたサブジェクトが、`Secret` (または `type: "*"`) のサブスクリプションを作成し、それらのエンティティを通知として受信できてしまいます。*書き込み* 認可をエンティティ読み取りパスに再フレーミングすることは修正になりません。PR #2204 で測定されたように、パス glob によってサブスクリプション書き込みを許可するカスタムポリシーは、読み取りフレームの下でターゲットから外れ、**Permit を全く供給せず**、`kind: 'none'` に崩れて正当な `201` を `403` に変えてしまいます。代わりに配信時フォームが使用されます。これは `#2140` 読み取り、`#2133` CSource 通知、および WebSocket のイベントごとの `authorizeWs` (#1107 / #1383) と同じ形状です。サブスクリプションは書き込み時に許可され、**すべての配信** が作成者の現在の述語に対して判定されます。判定には `entityTypeMayBeReadable()` ではなく `entityMayBeRead()` (実際の行の 3 つの自由次元すべて) が使用されます。通知本文にはエンティティの内容が含まれるため、型次元のみを見ると `entityOwner` / `scope` で制限されたサブジェクトに行がリークしてしまいます。読み取りフレームパスはサブスクリプション自身の `protocol` に従います (`NOTIFICATION.READ_FRAME_PATH`: `/ngsi-ld/v1/entities` または `/v2/entities`)。そのため、合成イベントはプリンシパルの HTTP 読み取りと同じターゲットセットに到達します。述語は配信ごとに再導出されるため、これは `#2005` が開いたままにした 2 つのギャップも閉じます。制限が厳格化される前に作成されたサブスクリプションは、次の `PATCH` まで権利確定されるのではなく再判定され、`scope` / `entityOwner` 制限は具体的な型セレクタにも適用されます (サブスクリプション PIP はこれらの属性を構築しません)。ゲートは `claimNotificationSlot` の **前** に実行されます。抑制されたサブスクリプションはスロットリング / クールダウンウィンドウを消費してはなりません。そうでなければ、述語が後で許可しても通知は永久に消えてしまいます。
>
> `'skip'` (決定不可能な述語) は **配信しない** を意味し、`notification.join` の「リンクされたエンティティがゼロ」ではなく CSource 通知に一致します。ここで保留されるものは通知 *そのもの* です。fail-closed セルは作成者のプリンシパル種別に依存します。**ユーザー** 作成者の場合、上記 #2133 にリストされた共有セルです。保存された `createdBy` がない、作成者がアクティブユーザーに解決されない、作成者の通知対象テナントへのメンバーシップが取り消されているまたは存在しない、テナントが解決できない、および述語がエンティティ読み取りを完全に拒否する場合です。**クレデンシャル** 作成者 (`api_key` / `oauth_client`、#2282) の場合、ユーザードキュメントとメンバーシップセルは全く適用されません。代わりにクレデンシャルドキュメントから評価され、そのドキュメントが欠落している、取り消されている (`isActive: false`)、または異なるテナントに属している場合、保存されたプリンシパル種別が id 形状と一致しない場合、種別が保存されていない場合 (#2282 以前に書き込まれたサブスクリプション)、または導出された述語がエンティティ読み取りを完全に拒否する場合にのみ fail-closed となります。**許可ポリシーにバインドされた有効でアクティブな API キーは抑制原因ではありません** — そのサブスクリプションは、そのキーが HTTP 経由で読み取れるすべての行を受信します。**動作変更**: `createdBy` がないレガシーサブスクリプションは、`AUTH_ENABLED=true` デプロイメントで識別可能なプリンシパルによって再作成されるまで通知の受信を停止します。`securityEvent` 警告ログ (`SUBSCRIPTION_NOTIFICATION_RLS_SKIPPED`) がこれを運用上可視化します。API キーと OAuth クライアント作成者は当初同じバケットにありました。それらにはユーザードキュメントがないため、`UserRepository.getById('apikey:<keyId>')` は `null` を返し、導出は `'skip'` に落ち、つまり **API キーで作成されたサブスクリプションは `201` / `status: active` を報告しながらも何も受信しませんでした**。#2282 はそれらを fail-open ではなく *評価可能* にしました。サブスクリプションは作成者のプリンシパル種別を保存し (`createdByRole`、`/subscriptions` と `/csourceSubscriptions` の両方で永続化)、導出は **HTTP 認証が構築するのと同じアクター** をクレデンシャルドキュメントから再構築します — `apikey:<keyId>` / `apikey-<keyId>@internal` / `role: api_key` / キーの `tenantId`、または OAuth クライアントの `clientId` / `role: oauth_client` です。`policyId` はクレデンシャルドキュメントから読み取られるため、ポリシーの再バインドはサブスクリプション時に固定されるのではなく次の配信で有効になります。種別は `createdBy` の `apikey:` プレフィックスから推測されることはありません (その形状と衝突する `user.id` は、そうでなければクレデンシャルのポリシーで評価されてしまう — 「推測されたプリンシパル種別」クラス)。そのため、#2282 以前に書き込まれたサブスクリプションは fail-closed のままです。取り消された (`isActive: false`)、削除された、および **クロステナント** のクレデンシャルも fail-closed のままです。保存された種別が id 形状と一致しない場合も同様です。`AUTH_ENABLED=false` の場合、ゲートは不活性です。これは HTTP 読み取りパスがそこで制限されないのとまったく同じです。
>
> 同じゲートが #2253 のプロトコル分離を担い、両方の配信ルート (Lambda `matcher` とスタンドアロンのインプロセスサービス) および両方のイベント種別 (エンティティ変更とルールトリガー通知) が **1 つ** の関数を通過します。最初のカットはエンティティ変更の半分だけを配線し、ルールトリガー通知は保護されないままでした。これは #1376 「1 つのセルが残された」クラスが、その修正自体の内部で再現されたものです。
>
> 述語は現在 `deriveLinkedEntityReadFilter()` によって導出され、`joinLevel` の **すべての** 再帰レベルで `getMany()` の Mongo フィルタに構成されます。これは意図的に、周辺クエリに対して `requireListReadAuthz()` が返したフィルタ **ではありません**。`?type=A` が宣言されている場合、その導出は `entityType` をリテラル `A` に畳み込みます (多くの場合 `unrestricted` に崩れる) が、これは型 `B` のリンクされたエンティティについては何も語りません。`deriveRemoteEntityReadFilter()` (#2092) と同様に、`entityType` を自由変数として保持します。それとは異なり、`entityId` も畳み込まれ **ません**。join には 1 つではなく多くのターゲットがあるためです。`kind: 'none'` はリクエスト全体を失敗させるのではなく、リンクされたエンティティがゼロになります。リンクしているエンティティはすでに認可されており、`join` パラメータを `403` に変えることは過剰拒否になります。

> **Context Source Registration 由来の `/types` および `/attributes` への貢献には別のメカニズムが必要でした (#2079)。** 上記の行は `entities` コレクションの読み取りをカバーしますが、`GET /ngsi-ld/v1/types(/{typeName})?` および `/ngsi-ld/v1/attributes(/{attrId})?` も **Context Source Registration によって宣言された** 型名と属性名をレスポンスにマージします (ETSI GS CIM 009 - 5.9.3.3)。登録は `entities` 行ではないため、`readableEntityFilter` / `entityReadFilterToMongo` を全く通過しません。#1370 のエンティティ由来の貢献に対するリーククロージャは、登録由来のパスを開いたままにしました。型制約されたサブジェクトは、*任意の* 登録によって宣言された型の存在 (および属性名) を知ることができ、`/types/{typeName}` は、サブジェクトが単一のエンティティも読み取れない型に対して `200` を返しました。純粋に登録がそれを宣言したという理由だけです。`entityTypeMayBeReadable()` (`policy.filter.ts`) は、`entityType` 次元に制限された `entityReadFilterToMongo` の JS ミラーです (登録が具体的な値を持つ唯一の次元。`scope` / `entityOwner` は「一致する可能性がある」として扱われます。登録はどちらも持たないため)。これは、サブジェクトが読み取り不可能な登録由来の型 / 属性名を削除するために使用されます。`/types/{typeName}` および `/attributes/{attrId}` は、ターゲット型に読み取り可能な可能性が全くない場合、登録経由で存在をリークするのではなく `404` に崩れます。制約のないサブジェクト (`readableEntityFilter === undefined`) には変更はありません。

> **述語は保存された文字列を比較するため、保存形式が一致する必要があります (#2086)。** `entityTypeMayBeReadable()` は、登録の宣言された型名をマッチャー値と正確な文字列等価性で照合します。これは、`entities` 行に対する Mongo 側の `{entityType: <matcher>}` 比較と同じ基盤です。これは、両側が同じ正規化を経た場合にのみ成立します。NGSI-LD 登録はそうします (書き込み時の `normalizeTypeName`、#1700)。**NGSIv2 登録はしません** — `POST`/`PATCH /v2/registrations` は型をそのまま保存します。NGSIv2 にはアクティブな `@context` がないためです。登録はプロトコル間で可視であるため、v2 で登録された `https://uri.etsi.org/ngsi-ld/default-context/Sensor` は `Deny entityType == Sensor` ルールをすり抜けましたが、その同じ型のエンティティは正しく非表示になりました。したがって、ディスカバリーエンドポイントは、消費時点で登録型セレクタをコア語彙で正規化します (両方のコントローラーの `listRegistrationsSafely`)。そのため、述語、`/types/{typeName}` ルックアップ、およびレスポンス型名はすべて同じ文字列で評価されます。保存形式は意図的にそのままにされています。NGSIv2 エンティティもそのまま保存され、`findMatchingRegistrations` は正確な文字列で照合するため、保存形式を反転すると NGSIv2 フェデレーション転送が黙って壊れ、`GET /v2/registrations` が不可逆的に変更されます (#1890 は属性名について同じ決定を下しました)。
>
> **Context Source Registration ドキュメント自体の読み取りも述語を通過します (#2084)。** #2079 は `/types` および `/attributes` への登録由来の *貢献* を絞りましたが、供給元 — `GET /ngsi-ld/v1/csourceRegistrations(/{registrationId})?` および `GET /v2/registrations(/{registrationId})?` — はまだ CSR ドキュメントをそのまま返していました。CSR リストリクエストには具体的な `entityType` がないため、型 Deny はポイント認可で発火せず、CSR 読み取りを許可するポリシー (`user` ロールのデフォルト GET Permit、または型 Deny を持つデフォルト許可のカスタムポリシー) を持つサブジェクトは、読み取れない型の登録の存在、宣言された型名、およびプロバイダ `endpoint` URL を読み取ることができました。読み取りパスは現在、同じ行レベル述語 (`requireListReadAuthz`) を導出し、**編集** します。読み取り不可能な具体的な型セレクタは `information[].entities[]` から削除され、読み取り不可能な型のみを宣言する情報エントリは完全に削除され、すべてのエントリが削除されたドキュメントはリストから省略され、id による読み取りでは `404` を返します。ルールは、ディスカバリーエンドポイントが使用するのと同じ関数です (`redactInformationForRead` — 同じ関数を呼び出すことで、ディスカバリーと CSR 読み取りの可視性が分岐しないようにします)。正規化された型値 (#2086) で判定されますが、レスポンスは保存形式を保持します。リスト `count` とページネーションは編集 **後** に計算されます (編集前のカウントは非表示の登録の存在をリークします)。`?type=` / `?attrs=` は編集されたドキュメントに対して再照合されます (読み取り不可能なセレクタを介してのみ照合されたドキュメント、または削除されたエントリの属性を介してのみ照合されたドキュメントは、全く表示されてはなりません。その出現自体が編集が削除したものをリークします)。`?attrs=` 再照合は、そのまま ∪ 正規名を判定します (各エントリの保存された名前を登録の書き込み時 `@context` で展開、#2141)。そのため、その照合サーフェスは Mongo ユニオンインデックス (#1890) をミラーします。これがないと、正規形式のみで照合するクエリ (FQN、または別の `@context` からの同義語項) は、制約のないサブジェクトには結果を返しますが、制限されたサブジェクトには `0` 結果を返します。編集されたリストは、コレクションをページごとにスキャンします (OOM 安全キャップで制限され、切り捨て時に警告)。そのため、`count` / `total` は最初のページを超えても正確なままです (#2141)。`GET /ngsi-ld/v1/csourceRegistrations` は、宣言された `?type=` を常にポイント認可ではなく行レベル述語に委譲します。読み取り可能な型によって照合された CSR は、読み取り不可能なセレクタを *含む* ことができるため、畳み込みは述語を `unrestricted` に崩壊させ、照合されたマルチタイプドキュメントを編集なしで返します (#1653/#1656 宣言型 ≠ 実際の内容クラス)。動作変更: エンティティ型許可リストに制限されたサブジェクト (#2079 ポリシー形状) は、以前は CSR リストで `403` を取得しました。現在は、読み取り可能な (またはない) 型のみを宣言する登録のみで `200` を取得します。#1370 がエンティティリストに対して行った fail-closed → フィルタリング移行と同じです。csource-subscription 通知チャネルもカバーされています (#2133、下記)。
>
> **csource-subscription 通知によって配信される CSR ドキュメントは、サブスクリプション作成者の述語によって編集されます (#2133)。** 通知チャネル (`csource-notification.service.ts` — CSR ドキュメントは、登録の作成 / 更新 / 削除時にサブスクリプションライバーエンドポイントに完全に POST されます) は、以前は #2084 編集を完全にバイパスしていました。Csource サブスクリプションは現在、作成者を保存します (`createdBy`、エンティティサブスクリプションと同じ形状)。配信時に、作成者の **現在の** 有効なポリシーセットが HTTP CSR 読み取りと同じ行レベル述語を導出するために使用されます (合成 authz パターン、#1610 を通じて呼び出される `requireListReadAuthz`)。パリティ不変量は「作成者 P が `GET /ngsi-ld/v1/csourceRegistrations` で見るものは、P のサブスクリプションが通知されるもの」です。照合は **編集された** ビューに対して評価されます (読み取り不可能な型セレクタを介してのみ照合された通知は全く到着してはなりません。その到着自体がその型を宣言する CSR が存在することをリークします)。すべてのエントリが編集された登録は配信されません。**これらすべては認証が有効な場合にのみ適用されます。** `AUTH_ENABLED=false` では、語るべき行レベル述語がありません。`optionalAuth` はすべてのリクエストに対して `super_admin` を合成するため、HTTP CSR 読み取りはすべてのドキュメントを編集なしで返します。通知パスは同じ条件で短絡し、編集なしで配信します。そこで通知を抑制すること (保存された作成者は `anonymous` であり、ユーザーに解決されない) は、可用性方向で上記のパリティ不変量自体を壊すことになります。以下のすべては `AUTH_ENABLED=true` デプロイメントを説明しています。

述語に使用されるロールは、ユーザードキュメント上のグローバル `role` ではなく、**通知対象テナントにスコープされた** 作成者のロールです。`super_admin` は通過し、それ以外の場合は通知対象テナントのメンバーシップ行が決定します。3 つのケースは区別され、混同してはなりません。**アクティブ** なメンバーシップ行はその `role` を提供します。存在するが **非アクティブ** (取り消された) なメンバーシップ行は fail-closed になります。**メンバーシップ行が全くない** 場合は `user.role` にフォールバックし、作成者の `primaryTenantId` が通知対象テナントである場合にのみです (自動メンバーシップより前のレガシーユーザー、または再ポイントされた `primaryTenantId` — デフォルトログインが `user.role` トークンを発行する同じプリンシパル)。*異なる* テナントに対して欠落している行は、取り消されたケースと同様に fail-closed になります。これは #1201 (「非 `super_admin` の有効なロールは常に `membership.role`」) をミラーします。これが重要なのは、`PATCH /admin/users/{id}` がメンバーシップに触れずにユーザードキュメントのロールを更新するためです。

Fail-closed セル(**通知は送信されません**、構造化された警告ログが記録されます): `createdBy` が保存されていないサブスクリプション(この変更前に作成されたレガシー文書 — `CSOURCE_NOTIFICATION_RLS_SKIPPED_LEGACY`)、アクティブなユーザーに解決できない **user** 作成者(削除/無効化されたユーザー — `CSOURCE_NOTIFICATION_RLS_OWNER_UNRESOLVED`; #2282 以降、`api_key` / `oauth_client` 作成者はこのセルに**含まれません** — これらは代わりに認証情報ドキュメントから解決され、それが欠落している、取り消されている、または別のテナントからのものである場合にのみ fail-closed となります — `CSOURCE_NOTIFICATION_RLS_CREDENTIAL_UNRESOLVED`)、通知されるテナントでのメンバーシップは存在するが取り消されている(`isActive: false`) **user** 作成者、および `primaryTenantId` ではないテナントにメンバーシップ行が**ない** **user** 作成者(メンバーシップはユーザーのみの概念です; 認証情報作成者は認証情報ドキュメントの `tenantId` によってスコープされます)(両方とも — `CSOURCE_NOTIFICATION_RLS_MEMBERSHIP_MISSING`; `refreshToken` は同じプリンシパルに対して `403` を返します)。このセルには上記で説明したレガシーの行なしケースは**含まれません**: メンバーシップ行がなく、`primaryTenantId` が通知されるテナントである作成者は `user.role` にフォールバックし、**通知されます**。同様に fail-closed となるもの: 解決不可能なテナント(`CSOURCE_NOTIFICATION_RLS_TENANT_UNRESOLVED`)、および述語が CSR 読み取りを完全に拒否する作成者。**動作の変更**: レガシー csource サブスクリプション(`createdBy` が存在する前に作成されたもの)は、識別可能なユーザーによって再作成されるまで通知の受信を停止します; 警告ログによりこれが運用上可視化されます。

> **サブスクリプションドキュメントの読み取りも述語を通過します(#2140)。** 同じ欠陥が `GET /ngsi-ld/v1/subscriptions(/{subscriptionId})`、`GET /v2/subscriptions(/{subscriptionId})`、および `GET /ngsi-ld/v1/csourceSubscriptions(/{subscriptionId})` に存在していました: サブスクリプションリストリクエストは具体的な `entityType` を持たないため、type Deny はポイント認可時に発動せず、type Deny を持つサブジェクトは、読み取れない型を監視しているサブスクリプションの存在、宣言された型名、および**通知エンドポイント URL** を読み取ることができました。読み取りパスは同じ行レベル述語を導出し、CSR ルールの完全な鏡像で編集するようになりました(`subscription-read-redaction.ts` — 型に依存しない判定は `informationEntryIsTypeAgnostic` を鏡像化します): 読み取り不可能な具体的な型セレクターはセレクターリストから削除され(`subject.entities` / `entities`)、読み取り不可能な具体的な型のみを宣言するセレクターを持つサブスクリプションはリストから除外され、ID による読み取りでは `404` を返し、型に依存しないサブスクリプション(セレクターなし、`type: "*"`、`id`/`idPattern`/`typePattern` のみのセレクター、`watchedAttributes` のみのサブスクリプション)は影響を受けません。リストの `count` とページネーションは編集後に計算され、`?type=` は常に行述語に委ねられ(これらのコントローラーはマッチングに `?type=` を使用しないため、それを折り畳むと述語が `unrestricted` に崩壊します — #2084 の finding-1 クラス)、述語は `ETag` シードに混合されます。サブスクリプションは 1 つのプロトコル共有コレクションに保存されるため、NGSI-LD と NGSIv2 の両方のエントランスが同一に編集します。更新/削除の認可は変更されません(`requireSubscriptionUpdateAuthz` / 所有権チェックはサブスクリプションの有効な値を評価し、このパスを通過しません)。

注記:


* **EntityMap 作成はパスレベル PEP を保持します**(これはリソースを作成する `POST` です)。さらに実際のリクエストで行述語を導出するため、読み取り可能な行がないサブジェクトは `403` を取得し(fail-closed)、宣言された `?type=` はスコープ/所有者の制限をバイパスできません。
  
* **既存の EntityMap の読み取りは所有者ガードを使用し、再導出された行述語を使用しません(#1963)**。`EntityMapDocument` は `createdBy` フィールドを獲得しました; 非管理者プリンシパル(`super_admin` / `tenant_admin` 以外)は、**自分自身が作成した** EntityMap のみを読み取り、更新、削除できます。`createdBy` がないレガシー行は非管理者には不可視です — **fail-closed**、#1945(スナップショット)に従います。当時、これは `SubscriptionService.checkOwnership` との意図的な違いであり、未知の所有者を通過させていました; **#2161 はそのギャップを閉じました**ので、サブスクリプションと登録も現在はレガシー文書で fail closed します(以下の所有権セクションを参照)。

  なぜ所有者ガードを使用し、保存された `entityIds` と読み取り者の読み取り可能セットを交差させないのか: 作成時に既に**読み取り者自身の**導出された述語を通じてフィルタリングされている(#1955)ため、所有者は構造上、自分自身のマップ内のすべての id を見ることが許可されています — 再度フィルタリングすることは冗長であり、`GET` ごとに追加の `entities` クエリのコストがかかり、読み取り者ごとに `totalCount`(元のクエリの合計)の意味が変わってしまいます。

  **非所有者は `403` ではなく `404` を取得します** — `403` はその id を持つ EntityMap が存在することを確認してしまい、これは #1370 が閉じた存在リーククラスと同じです。ガードは取得してから拒否するのではなく、**Mongo クエリ内部**(`{tenant, entityMapId, createdBy}`)で適用されるため、「存在するが自分のものではない」と「存在しない」が分岐できるコードパスはありません。

  `PATCH` / `DELETE` は同一にガードされます: 読み取りパスのみを閉じると、非管理者が別のプリンシパルの EntityMap を変更または削除できる状態が残ります(CLAUDE.md Authorization Change Checklist 2 — すべての実施パスを配線する)。
  
* EntityMap 認可セマンティクスは **ETSI GS CIM 009 で指定されていません**(clause 5.2.32 / 6.3.16 はリソースを定義していますが、そのアクセス制御は定義していません)ので、2 つの操作は異なる仕様定義のアナログに従います:
  

* **作成** (`POST`) は兄弟パス `GET /entities` に従います: 読み取り不可能な行を除外し、成功を返します (*すべて*の行が読み取り不可能な場合のみ `403` を返します)。
  
* **既存の EntityMap の読み取り / 更新 / 削除**は、スナップショット所有者ガード (#1945) と同じ形式に従います — `createdBy` でスコープ化され、`createdBy` を持たないレガシー行は非管理者から隠されます — ただし、スナップショットの `403` ではなく `404` を返します。これは #1963 が所有者を Mongo クエリに組み込むためです (以下を参照)。
  
* \#1955 が元々カバーしていたベクタータイルエンドポイントは、#1961 (PR #1965) で**完全に削除されました**。そのパスでの繰り返される認可 / キャッシュ / 正規化のミスが、その理由の一部でした。

#### カタログ読み取り認証情報 (#2465 / #2468 / #2472)

`/catalog/**` は**行データ**を返し、メタデータのみのインデックスではありません: `sample` は完全なエンティティボディであり、データセットメタデータは正確な `entityCount`、属性スキーマ、および空間的な bbox を公開します。したがって、行レベルの認可は、エンティティリスト読み取り (#1376 パリティ) と**同じ述語**を使用します。#2465 / #2468 以降、`CatalogService` は、パスが `GET /v2/entities` である合成イベントで `requireListReadAuthz` を介してその述語を導出します (ハンドラーは `/catalog/**` を `apiType: 'ngsiv2'` として抽出します — #2471 を参照)。

**設計によりフェイルクローズ。** カスタムポリシーが `/catalog/**` のみを Permit する (エンティティリストパスは Permit しない) 認証情報は、カタログルートでのパスレベルの `requireAuthz` は通過しますが、合成導出により `kind:'none'` が生成され、`requireListReadAuthz` は **403** をスローします。`/catalog/**` の Permit を十分とみなす二重パス導出は、#2465 の穴を再び開くことになります (`/v2/**` に対して書かれた entityType / servicePath の Deny がカタログで静かに見逃されます)。

**オープンデータポータルのレシピ** (コード変更なし — 既存の XACML で表現):

同じプリンシパル (`api_key` / `oauth_client` / `anonymous`) に以下の両方を付与します:


1. `Permit` — `path: /catalog/**`, `method: GET` (パスレベルの到達可能性)
   
2. `Permit` — `path: /v2/entities`, `method: GET` (行フィルター導出ソース)

選択されたタイプのみを公開するには、(2) に `entityType` 条件を追加します。同じ条件がカタログ行フィルターになるため、カタログと `GET /v2/entities` は**同じ行**を表示します。これにより、それらのタイプに対する直接の `GET /v2/entities` も許可されます — カタログはすでに同等のデータを配布しているため、これは追加の公開ではありません。

バインドポリシーの例 (`/me/policies` を経由してから API キー / OAuth クライアントに `policyId` を設定。バインドされると、ポリシー `target` はバイパスされ、`rules` のみが実行されます):

```json
{
  "policyId": "portal-catalog-publictype",
  "target": {
    "resources": [
      { "attributeId": "path", "matchValue": "/catalog/**", "matchFunction": "glob" },
      { "attributeId": "path", "matchValue": "/v2/entities", "matchFunction": "string-equal" }
    ]
  },
  "ruleCombiningAlgorithm": "first-applicable",
  "rules": [
    {
      "ruleId": "permit-catalog",
      "effect": "Permit",
      "target": {
        "resources": [{ "attributeId": "path", "matchValue": "/catalog/**", "matchFunction": "glob" }],
        "actions": [{ "attributeId": "method", "matchValue": "GET" }]
      }
    },
    {
      "ruleId": "permit-v2-entities-public",
      "effect": "Permit",
      "target": {
        "resources": [
          { "attributeId": "path", "matchValue": "/v2/entities", "matchFunction": "string-equal" },
          { "attributeId": "entityType", "matchValue": "PublicType", "matchFunction": "string-equal" }
        ],
        "actions": [{ "attributeId": "method", "matchValue": "GET" }]
      }
    },
    { "ruleId": "deny-others", "effect": "Deny" }
  ]
}
```

匿名ポータルは、`role=anonymous` (および必要に応じて `anonymousAccessEnabled`) を持つ同じ形式を使用します。`/catalog/**` 単独を Permit して、カタログが 200 を返すことを期待**しないでください**。

> **スコープ外。** `sample` / `entityCount` を省略するメタデータのみのカタログ (つまりカタログ ≠ エンティティ読み取り) は、別の製品設計になります。現在、需要はありません (#2472)。

### MCP / A2A ツール認可 (#1610 / #1651 / #1672)

MCP サーバー (`POST /mcp`) と A2A JSON-RPC エンドポイント (`POST /a2a`) は、HTTP コントローラーをバイパスするエンティティ / バッチ / 時系列データツールを公開しています。これらは**個別の認可実装を持ちません**:各ツール呼び出しは最小限の合成 `APIGatewayProxyEvent` を構築し、HTTP 層と**同じ共有実行関数**を呼び出します — `checkEntityOwnership`(エンティティレベル、ID 別)、`requireListReadAuthz`(リストレベル行フィルタリング)、および `requireAuthz`(ポイントチェック)— `@api/shared/authz/synthetic-authz` 経由で(MCP の場合は `src/api/mcp/tools/authz.ts`)。したがって、カスタムポリシーの `entityType` / `entityOwner` / `scope` 制約は、HTTP、MCP(#1610)、A2A(#1651)で同一に適用され、Deny / NotApplicable の結果はフェイルクローズドです。


* **ID 別ツール操作は DB に保存されている実際の `entityType` で認可されます** — クライアントが提供する `type` 引数は認可属性として使用されることはありません(後続のデータアクセスのルックアップフィルタとしてのみ機能します)。これは HTTP の ID 別ルートと同じルールです([#1324](#entity-level-authorization-for-by-id-routes-1324-1336))。これにより、偽造された `type` がエンティティルックアップを失敗させ、デフォルト許可ポリシーの下で `entityType: ""` 評価にリクエストが滑り込むタイプスプーフバイパスが閉じられます(A2A: #1651、MCP: #1672)。
  
* **到達可能性は別個のパスレベルの懸念事項です**: `/mcp` と `/a2a` は `tenant_admin` デフォルトポリシーによって許可され、テナントポリシーのパス許可リスト(`TENANT_POLICY_ALLOWED_PATH_PREFIXES`、`src/core/auth/policy/policy.defaults.ts`)に含まれているため、テナント管理者はカスタム Permit ポリシーで `user` / `api_key` / `oauth_client` プリンシパルにそれらを付与できます。`/mcp` / `/a2a` のパスレベル Permit はエンドポイントを到達可能にするだけです — 上記のツールごとのエンティティレベル / リストレベルチェックは、すべてのデータ操作に引き続き適用されます。
  
* **管理ツールには `tenant_admin` ロールが必要です**: 管理 / 設定管理ツール(ユーザー / ポリシー / ルール)は、MCP と A2A の両方でロールゲートされているため、データツール用に `/mcp` / `/a2a` を付与されたプリンシパルは、ユーザーを列挙したり、ポリシー / ルールを読み取ったりすることはできません。


* **ロールゲートはポリシー評価の代替ではありません(#2223)。** MCP の `config` ツールの `custom_data_models` リソースは、以前は `requireAdminRole` + テナント解決で止まり、**カスタム XACML ポリシーを評価しませんでした**: `/mcp` はパスレベルで `resource.path = "/mcp"` として認可されるため、`/custom-data-models` に対して書かれた `Deny` は適用されず、HTTP 経由でデータモデルから制限された `tenant_admin` は、MCP 経由でそれらを作成 / 更新 / 削除できました。現在は対応する HTTP ルート(`GET|POST /custom-data-models`、`GET|PATCH|DELETE /custom-data-models/{type}`)用の合成イベントを構築し、HTTP ハンドラーが呼び出すのと同じ `requireAuthz` を呼び出すため、同じポリシーが両方のエントリーポイントを決定します。HTTP ルート(#2215)と同様に、`resource.tenantService` は**アクター**から解決され、呼び出し元が宣言した値からは解決されません — MCP では、テナントは `tenant` 引数から取得され、`resolveToolTenant` はすでにそれがアクター自身のテナントであることを検証しています。`resource.servicePath` は HTTP ルートがそれを折りたたむのと同じ理由で `/` に折りたたまれます(#2221): `resolveToolTenant` が返す値は呼び出し元の `servicePath` 引数から来るため、それを残すと `servicePath` 条件付き Deny がその引数を変更することで回避される可能性があります — 一次元上の `tenantService` の穴です。


* **このパスではまだ利用できない属性が 1 つあります: `environment.sourceIp`。** 合成イベントは設計上ソース IP を持ちません(#1610 — MCP / A2A 呼び出しコンテキストは伝播せず、値を捏造するのはさらに悪化します)。`ip-range` 条件はそれなしでは `false` と評価されます。したがって、`/custom-data-models/**` に対して書かれた `ip-range` 条件付き **Deny** は MCP パスでは発動しませんが、同じポリシーは HTTP 経由では発動します。これはすべての合成イベントチェックの特性です(この変更より前から存在し、エンティティ / バッチ / 時系列ツールにも同様に適用されます)が、`/custom-data-models` ポリシーが MCP から評価されるようになったため、ここで新たに到達可能になります。`POST /mcp` 自体のパスレベル認可は実際のクライアント IP を参照するため、**エンドポイント**の IP 制限は影響を受けません — ツールのターゲットリソースではなく、そこで IP 制限を表現してください。


* **同じ配線は両エントリーポイントの `rules` と `jsonld_contexts` をカバーします(#2244)。** #2223 は `custom_data_models` ブランチのみを配線しました。同じツールの兄弟ブランチはそのまま残されました — `handleRuleAction` は `requireAdminRole` で止まり、`handleJsonLdContextsAction` にはロールゲートがまったくなかったため、`/mcp` のパスレベル `Permit` のみを保持するプリンシパルが JSON-LD コンテキストの作成 / 削除に到達しました。A2A の `config` スキルも、読み取り専用の `rules` / `jsonld_contexts` ハンドラーに同じギャップがありました。4 つすべてが 1 つの共有マッピング(`@api/shared/authz/config-authz-target`)を通じて合成イベントを構築するため、MCP と A2A が乖離することはありません:

  | action                    | rules                                                | jsonld\_contexts                                |
  | ------------------------- | ---------------------------------------------------- | ----------------------------------------------- |
  | `list`                    | `GET /rules`                                         | `GET /ngsi-ld/v1/jsonldContexts`                |
  | `get`                     | `GET /rules/{ruleId}`                                | `GET /ngsi-ld/v1/jsonldContexts/{contextId}`    |
  | `create`                  | `POST /rules`                                        | `POST /ngsi-ld/v1/jsonldContexts`               |
  | `update`                  | `PATCH /rules/{ruleId}`                              | —                                               |
  | `delete`                  | `DELETE /rules/{ruleId}`                             | `DELETE /ngsi-ld/v1/jsonldContexts/{contextId}` |
  | `activate` / `deactivate` | `POST /rules/{ruleId}/activate`\|`/deactivate` | —                                               |


* **`servicePath` はリソースごとに異なる方法で処理され、HTTP と一致します。** ReactiveCore ルールは `servicePath` をファーストクラスフィールドとして保持し、HTTP ルートは `Fiware-ServicePath` 派生値を `requireAuthz` に直接渡すため、MCP / A2A パスは呼び出し元の `servicePath` を変更せずに渡します — ここで(`custom_data_models` が行うように、#2221)それを `/` に折りたたむと、HTTP 経由で機能する `servicePath` 条件付き Deny がツールパスで静かにミスします。JSON-LD コンテキストは折りたたみをまったく必要としません: `buildAuthzRequest` はすでにすべての NGSI-LD パスに対して `resource.servicePath` を `/` に正規化しています(#1323 / #1862)。


* **`jsonld_contexts` にロールゲートは追加されませんでした。** HTTP ルートにもありません — 誰が何をできるかはポリシーのみによって決定されます(デフォルトの `__default_user` ポリシーは `/ngsi-ld/**` のすべてのメソッドを `Permit` するため、制限のない `user` は HTTP 経由でもコンテキストを作成できます)。ツールを `tenant_admin` でゲートすると、HTTP 経由で成功する操作が MCP 経由で失敗することになり、これは逆のパリティ不変条件です。


* 上記の `environment.sourceIp` の注意事項は、これらのリソースにも適用されます。

ツールのインベントリと A2A の詳細については、[AI\_INTEGRATION.md](../ai-integration/overview.md) を参照してください。

### テンプレート変数 (GeonicDB 拡張)

`matchValue` は `${subject.<attributeId>}` テンプレート変数をサポートしており、評価時にリクエストサブジェクトの属性値に解決されます。これにより、ユーザー ID をハードコーディングすることなく「所有者のみ」アクセスのような動的なポリシーが実現できます。

| Template              | Resolves to                                              |
| --------------------- | -------------------------------------------------------- |
| `${subject.userId}`   | Requesting user's ID                                     |
| `${subject.email}`    | Requesting user's email                                  |
| `${subject.role}`     | Requesting user's role                                   |
| `${subject.tenantId}` | Requesting user's tenant ID (`''` for global principals) |

**解決可能な属性はこれら 4 つのみです**(`src/core/auth/policy/policy.pdp.ts` の `SUBJECT_ATTRIBUTE_IDS`)。それ以外の名前 — `${subject.userID}` のようなタイプミスや、`${subject.id}` / `${subject.name}` — は、すべてのポリシー書き込みパス(作成 / 更新 / ポリシーセット / XACML インポート)において**書き込み時に `400` で拒否されます**([#1939](#unresolved-subject-templates-1939))。

#### 未解決の `${subject.*}` テンプレート (#1939)

\#1939 以前は、解決不可能なテンプレートによってその `matchValue` が**スキップ**され、囲んでいるグループが `NoMatch` になり、ルールが `NotApplicable` になりました。`Permit` ルールの場合は特権を削除する(安全)が、**`Deny` ルールの場合は拒否が静かに適用されなくなり**(フェイルオープン)— そして書き込み API は `201` を返すため、ポリシー作成者には何の通知もありませんでした。

2 つのレイヤーが現在これを閉じており、上記の `string-regexp` の扱いを反映しています:


1. **書き込み時** — 任意の `matchValue` 内の未知のサブジェクト属性(`matchFunction` に関係なく)は `400` です。
   
2. **評価時** — 未解決のテンプレートは処理不可能な `AttributeDesignator` であり、XACML 3.0 §7.6 に従って **`Indeterminate`** として評価され、フェイルクローズで `Deny` に解決されます(そしてリストクエリの行フィルターでは「読み取り可能な行なし」/ `403` になります)。このレイヤーは、書き込み時検証が存在する前に保存されたポリシーや、サービスレイヤーをバイパスするパス(例: `scripts/backup-import.ts`)によって復元されたドキュメントをカバーします。

> これは XACML の `MustBePresent=false` ケース(空のバッグ → マッチなし)**ではありません**。解決可能な 4 つの属性はすべて `AuthzRequest` で必須であるため、テンプレートが解決に失敗するのは属性 ID 自体が存在しない場合のみです — これは作成エラーであり、値の欠如ではありません。

#### 例: エンティティ所有者のみポリシー

```json
{
  "description": "Users can only operate on entities they created",
  "ruleCombiningAlgorithm": "first-applicable",
  "rules": [
    {
      "effect": "Permit",
      "target": {
        "resources": [
          { "attributeId": "entityOwner", "matchValue": "${subject.userId}" }
        ]
      }
    },
    {
      "effect": "Deny"
    }
  ]
}
```

> `policyId` と `ruleId` は省略時に自動生成されます。

このポリシーは、`entityOwner`(エンティティの `createdBy` 値)がリクエストユーザーの `userId` と一致する場合にのみアクセスを許可します。その他のすべてのリクエストは拒否されます。

#### 例: ServicePathベースのアクセス制御

```json
{
  "description": "Allow anonymous read access to /opendata/ service path",
  "target": {
    "subjects": [{ "attributeId": "role", "matchValue": "anonymous" }],
    "resources": [{ "attributeId": "servicePath", "matchValue": "/opendata/**" }],
    "actions": [{ "attributeId": "method", "matchValue": "GET" }]
  },
  "rules": [{ "ruleId": "permit-read", "effect": "Permit" }],
  "priority": 100
}
```

このポリシーは、匿名ユーザーが `/opendata/` ServicePath配下のエンティティ(`/opendata/sensors` のようなネストされたパスを含む)を読み取ることを許可します。グロブパターン `/**` はゼロ個以上のパスセグメントにマッチします。

> **NGSIv2 のみ (#1323)**: このパターンが機能するのは、NGSIv2 が `Fiware-ServicePath` によってエンティティを保存およびフィルタリングするためです。NGSI-LD リクエストでは `servicePath` 属性は常に `/` です(ヘッダーは仕様がなく、データレイヤーによって無視されます)ため、上記のようなポリシーは NGSI-LD リクエストにマッチすることはありません — 設計上そうなっています。代わりに NGSI-LD には `scope` / `entityType` 制約を使用してください。

#### 例: NGSI-LD スコープベースのアクセス制御

```json
{
  "description": "Allow read access only to entities scoped under /Madrid",
  "ruleCombiningAlgorithm": "first-applicable",
  "rules": [
    {
      "ruleId": "allow-madrid-read",
      "effect": "Permit",
      "target": {
        "resources": [
          { "attributeId": "scope", "matchValue": "(^|,)/Madrid(/[^,]*)?(,|$)", "matchFunction": "string-regexp" }
        ],
        "actions": [{ "attributeId": "method", "matchValue": "GET" }]
      }
    },
    { "ruleId": "deny-all", "effect": "Deny" }
  ],
  "priority": 50
}
```

このポリシーは、`scope` が `/Madrid` 自体、またはその配下の子パス(例: `["/Madrid/parks"]`)であるエンティティへの読み取りアクセスを許可します。エンティティのスコープは配列として保存され、カンマ区切りの文字列にシリアライズされる(例: `"/Madrid/parks,/Madrid/gardens"`)ため、意図しない部分一致を避けるために境界を意識した `string-regexp` パターン(`(^|,)` と `(,|$)` アンカーを使用)を優先してください。単一値の完全一致には、`string-equal` が直接機能します(例: `matchValue: "/Madrid"`)。

#### NGSI-LD スコープ認可: 3 つの実用的パターン (#1659)

NGSI-LD 書き込み操作の場合、`scope` は欠如している(`missing` / `null` / `[]`)可能性があります。その場合、認可はスコープ属性を `''`(空文字列)として評価します。次のいずれかのポリシースタイルを意図的に選択できます:


1. **許可リスト (厳格)**: 特定のスコープ (例: `/Public`) のみを許可し、それ以外についてはフェイルクローズ動作に依存します。\
   結果: スコープ未設定の書き込みは拒否されます (`403`)。
   
2. **拒否リスト + フォールバック許可**: 特定の禁止スコープ (例: `/Secret`) を拒否し、他の書き込みを許可します。\
   結果: スコープ未設定の書き込みは許可されます (`201`)。
   
3. **明示的な未設定制御**: `matchValue: ''` に対する明示的なルールを追加して、スコープなしエンティティを意図的に許可または拒否します。

#### Read=OR / Write=AND スコープセマンティクス (#1659)


* **読み取りパス (既存の動作)**: スコープマッチングは、保存されたカンマ区切りのスコープ文字列を使用します (OR セマンティクス)。\
  例: `["/Public", "/Secret"]` は `/Public` リーダーによって読み取り可能です。
  
* **書き込み先 (作成/移動)**: 各スコープ要素は独立した AuthzRequest として評価され、すべてが `Permit` でなければなりません (`evaluateAllPermit`、AND セマンティクス)。\
  例: `Permit(POST, scope~/Public)` のみの場合、`["/Public", "/Secret"]` への書き込みは拒否されます (`403`)。

この非対称性は意図的なものです: 読み取りの可視性は部分的 (OR) でよいですが、書き込みはすべての宛先スコープに対して認可される必要があります (AND)。複数の書き込みスコープを 1 つのカンマ区切り認可リクエストに折りたたむことは決してしないでください。

#### バッチ書き込みは本文だけでなく既存のエンティティを評価する (#1678)

バッチ書き込み操作 (`POST /ngsi-ld/v1/entityOperations/{upsert,update,merge,delete}`) は既に存在するエンティティを変更するため、リクエスト本文だけでは十分な認可入力ではありません。本文で宣言されたターゲット (#1325 による `entityType`、#1659 による宛先 `scope`) に加えて、GeonicDB は本文内のすべての `id` を単一のプロジェクションクエリで解決し、**保存されたエンティティの実際の `entityType`、`entityOwner` (`createdBy`)、および `scope`** を評価します — これは by-id パス (`checkEntityOwnership`) が使用するのと同じ属性です。


* **全許可**: いずれかの要素が `Permit` でない場合、書き込みが発生する前にリクエスト全体が `403` で拒否されます (部分適用なし)。これは `/v2/op/update` バッチセマンティクス (#1325) および NGSI-LD サブスクリプション作成 (#1104) と一致します。
  
* **移動セマンティクス**: *ソース
* スコープ (保存済み) とすべての *宛先
* スコープ要素 (本文、要素ごとの AND) がすべて許可されている必要があります。
  
* **作成は除外**: まだ存在しない id は作成として扱われ、本文で宣言された属性のみが適用されます。
  
* **曖昧な id** (1 つの id に対して複数のドキュメント、ユニークインデックスが欠落している場合にのみ可能) は、**すべて**の一致するドキュメントに対して `Permit` が必要です (フェイルクローズ)。
  
* **非 HTTP 呼び出し元**: MCP ツールと A2A スキルは HTTP コントローラーをバイパスするため、同じ実施ヘルパー (`syntheticCheckBatchEntityAuthz`) を呼び出します。ポリシーとして表現された制限は、HTTP、MCP、および A2A を通じて同一に保持されます。

実用上の結果: `Deny when scope ~ /Secret` のようなポリシーは、`PATCH /entities/{id}` をブロックするのとまったく同じように、`/Secret` 下に保存されたエンティティに対する `entityOperations/update` をブロックするようになりました。#1678 以前はバッチ形式が暗黙的にこれをバイパスしていました。

> **ステータスコードの注記**: NGSI-LD (ETSI GS CIM 009) は認可失敗を定義していません — `207 Multi-Status` はエンティティごとの*操作*エラー (NotFound / BadRequestData) 用であり、表 6.3.2-1 には AccessDenied エラータイプがありません。したがって GeonicDB はリクエストレベルの `403` を返します。部分適用で `207` を返すと、by-id 形式よりもバッチ形式で同じ制限が弱くなり、認可パリティ不変条件を破壊します (#1376)。

#### 認可決定はそれが行われたドキュメントに固定される (#1943)

保存されたエンティティを評価すること (#1678) は保証の半分に過ぎません。認可クエリと書き込みは 2 つの別々のラウンドトリップであるため、その間に第三者が**エンティティをハードデリートし、別のプリンシパルが同じ id で再作成する**ことができます。2 つのステップ間にリンクがなければ、書き込みは PDP が決して見ていない `entityOwner` / `scope` を持つドキュメントに着地します — これは、個々のステップがすべて正しく動作していても、認可バイパスになります。

GeonicDB は、評価されたドキュメントの識別情報を書き込みに持ち込むことで、これを閉じます:


* `getEntityAuthzContexts()` は、一致する各ドキュメントの **`_id`** を `entityOwner` / `scope` / `entityType` と共に返します。
  
* `checkBatchEntityAuthz()` は、それらの `_id` を**認可ピン** (`EntityAuthzPins`) として、エンティティ id ごとにキー付けして返します。
  
* その決定から派生したすべての書き込みは、MongoDB フィルターにピンを追加します: `_id ∈ {evaluated ids}`。認可ステップが**存在しない**と見なした id (作成として扱われる) は、既存のドキュメントと一致することのない述語を取得し、書き込みを**挿入のみ**にします — したがって、競合ウィンドウ内で作成されたドキュメントも暗黙的に更新されません。

**なぜ `createdBy` やバージョンカウンターではなく `_id` なのか。** `createdBy` は挿入時 (`EntityRepository.create`) にのみ書き込まれ、更新されることはないため、ドキュメントの所有者は不変です; 所有者が変更できる唯一の方法は削除 + 再作成であり、これは常に新しい `_id` を生成します。したがって `_id` をピン留めすることで、所有者の次元を正確に閉じます。`createdBy` をピン留めしても閉じません: `batchCreate` は `createdBy` をまったく設定しないため、所有者なしのドキュメントが別の所有者なしのドキュメントに置き換えられた場合、等しいと比較されます。バージョンカウンター (`EntityDocument.version`、既に存在し、すべての書き込みパスで維持されています) は**意図的に使用されていません**: 書き込みと競合する*インプレース*変更 — `scope` 移動を含む — は、書き込みが最初に発生した順序と等価であるため、認可違反ではありません。バージョンのピン留めは、良性の並行更新を競合に変換するだけで、バルクパスの文書化されたラストライトウィンズ動作を後退させます。

**「Deny での部分適用なし」契約との関係。** その契約 (#1325 / #1678 / #1928 / #1932) は*認可決定*に関するもので、これは依然として事前に評価され、書き込み前にリクエストレベルの `403` を返します。ピンの不一致は Deny ではありません — これは書き込み時に検出される並行性競合であり、ETSI GS CIM 009 が `207 Multi-Status` + `BatchOperationResult` エンティティごとのエラーでモデル化しているものです。セキュリティ関連の保証は無条件であり、両方の形式で保持されます: **書き込みは PDP が評価していないドキュメントに決して着地しません。** バルクパスでは、不一致要素はエンティティユニークインデックス (`idx_entity_unique_v3`) で失敗し、エンティティごとのエラーとして報告されます; エンティティごとのループパス (`entityOperations/{update,merge,delete}`、`actionType=replace|delete` を伴う `/v2/op/update`) では、何も一致せず、既存の `ResourceNotFound` エンティティごとのエラーとして表面化します。いずれにしても、その要素は何も永続化しません。

**エンティティごとの `detail` は、原因が明確な場合にのみ原因を示します。** ピン留めされたバルク操作での重複キー失敗には、少なくとも 3 つの原因があります: 上記の TOCTOU スワップ; ソフトデリートまたは期限切れになったドキュメント (バルク*置換*フィルターはライブ述語を運びますが、認可クエリは #1678 に従って意図的に運びません — これは競合をまったく必要としません); および、認可が存在しないと見なしたときに、1 つのペイロード内に同じエンティティ id が 2 回出現する場合。書き込みエラーは一般的にこれらを区別できないため、競合の文言 — および再試行の提案 — は、原因が確実な場合にのみ追加されます: ピンセットが空の場合 (認可はドキュメントを見なかったため、その後何かが id を要求したに違いありません)、または書き込みフィルターがライブ述語を運ばない場合 (`batchUpsert`) では、重複キーはピン留めされたドキュメントが消えたことしか意味しません。`batchReplace` で空でないピンの場合、メッセージは「エンティティは既に存在します」というプレーンなテキストのままです。なぜなら、ソフトデリートまたは期限切れのドキュメントで失敗している書き込みを再試行するよう呼び出し元に伝えることは、永遠にループするからです。生の MongoDB メッセージはいかなる場合も返されません。インデックス名とキー値は、別のテナントまたは所有者のスロット内のドキュメントの存在を開示するためです。

**バルクパスの結果は `idx_entity_unique_v3` に依存します。** 「何も永続化しない」は、ピン留めされた upsert の挿入試行がエンティティユニークインデックスと衝突するために成立します。そのインデックスが存在しない場合 — 上記で説明した曖昧な id を生成するのと同じ劣化状態では — 挿入は成功し、失敗する代わりに同じ `entityId` に対して*2 番目*のドキュメントを追加します。セキュリティ不変条件は依然として成立します (書き込みは PDP が評価していないドキュメントに着地しませんでした) が、要素はもはや no-op ではありません。エンティティごとのループパスはインデックスに依存しません: 何も一致せず、いずれにしても `ResourceNotFound` を返します。同じ理由で、マージセマンティクスと暗号化エンベロープを供給するバルク事前フェッチは、書き込みと同じピンでフィルタリングされます — そうでなければ、その劣化モードで、スワップされたドキュメントから読み取られた属性が生き残ったものに書き込まれる可能性があります。

まだカバーされていないもの (別途追跡): 時系列バッチ書き込み (認可属性は `entities` コレクションに存在しますが、書き込みは `temporal` コレクションをターゲットとするため、`_id` ピンは適用されません)、`purgeEntities` (述語で選択された id はピン留めされていない `deleteMany` に渡されます)、および単一エンティティの by-id パス (同じ読み取り-書き込み構造を持ちます)。

#### 同じルールが NGSIv2 バッチと時系列バッチに適用される (#1928)

上記の契約は NGSI-LD 固有ではありません。さらに 2 つのバッチ形式が、保存されたエンティティを同じ方法で評価します:


* **`POST /v2/op/update`** (すべての `actionType` 値: `append` / `appendStrict` / `update` / `replace` / `delete`)。NGSIv2 には `scope` の概念がないため、`entityOwner` / `entityType` の次元のみが適用されます — 宛先スコープの AND 評価はありません。
  
* **`POST /ngsi-ld/v1/temporal/entityOperations/{upsert,delete}`**。時系列コレクションは `owner` / `scope` を保存しないため — 時系列 by-id ルートが行うのとまったく同じように (#1336) — 認可属性は **entities** コレクション (`createdBy` / `scope` / `entityType`) から読み取られます。

両方とも最初の書き込みの前に評価されるため、いずれかの要素での `Deny` はリクエスト全体を `403` で拒否し、何も永続化しません。MCP 時系列バッチツールは HTTP コントローラーをバイパスするため、同じヘルパー (`syntheticCheckBatchEntityAuthz`) を呼び出します。

\#1928 以前は、両方の形式が認証されたアクターを完全に破棄していました: `PATCH /v2/entities/{id}/attrs` または `PATCH /ngsi-ld/v1/temporal/entities/{id}` を `403` でブロックしたポリシーは、同一の書き込みをバッチエンドポイント経由で送信することでバイパスされ、`204` を返していました。

> **既知の制限 (#1928 / #1941 / #2434 によって変更なし)**: `scope` メンバーなしで時系列 API 経由で作成されたエンティティは、entities コレクションにドキュメントがないため、記録された所有者がありません。そのようなエンティティには所有者ベースの制限がありません — バッチ形式*および* by-id 形式の両方で同様であるため、認可パリティは保持されます。時系列のみのエンティティに所有権を付与することは別途追跡されています。`scope` を*運ぶ*時系列作成は現在のエンティティを具体化します (#2434 A'-1)。したがって、スコープを運ぶ時系列のみの作成は所有者なし**ではありません** — 具体化されたドキュメントは、作成プリンシパルを `createdBy` として記録します。

#### 時系列履歴の作成は既存のエンティティへの書き込みである (#1941)

`POST /ngsi-ld/v1/temporal/entities` および `POST /ngsi-ld/v1/temporal/entityOperations/create` は作成のように見えますが、ターゲット id が **entities** コレクションに既にドキュメントを持っている場合、*他人の*エンティティに履歴を書き込みます。#1941 以降、両方とも最初の書き込みの前に、保存された `entityOwner` / `scope` / `entityType` を評価します — すべての時系列ルートが行うように (#1336)、entities コレクションから読み取られます。

このギャップは見逃しやすいものでした。なぜなら、既存の唯一のガード `temporalEntityExists` は **temporal** コレクションのみを検査するからです。したがって、バイパスウィンドウは正確に「entities が外部所有のドキュメントを持っているが、**かつ** temporal ドキュメントがまだない」でした: `AlreadyExists` なし、所有権チェックなし、`201`。`PATCH /ngsi-ld/v1/temporal/entities/{id}` から `403` を受け取ったプリンシパルは、`create` を通じて同じエンティティの履歴を捏造できました — これは #1363 / #1325 / #1678 / #1928 / #1932 ファミリーのリクエスト形式パリティ破壊です。

バッチ作成はエンティティごとの*操作*エラーに対して `207 Multi-Status` を返しますが、認可はループの**前に**リクエスト全体に対して評価されます: いずれかの要素での `Deny` はすべてを `403` で拒否し、何も永続化しません。要素ごとにスコアリングすると、by-id 形式よりもバッチ形式が弱くなり、これは修正される欠陥です。

entities コレクションドキュメントのない id は依然としてスキップされるため、真に時系列のみのエンティティ (`scope` メンバーのないもの) は以前とまったく同じように作成されます。スコープを運ぶ本文は唯一の例外です (#2434 / #2758 / #2796 / #2814 A'-1):
HTTP by-id `POST /temporal/entities`、HTTP `entityOperations/create` / `upsert`、および MCP `create` /
`batch_create` / `batch_upsert` はすべて、`GET /entities/{id}` と
`DELETE /entities/{id}/attrs/scope` が直後に機能するように現在のエンティティを具体化します。
MCP / A2A パスレベル authz は、同じ宛先 `scope` (`buildTemporalCreatePathAuthzBody` 経由) を渡す必要があります

HTTP `targetsFromEntityArray` / `extractScopeFieldFromBody` が評価を行います — そうでなければ A'-1 が HTTP が拒否する Deny スコープを永続化してしまいます(#2796 / #2814)。バッチパスでは、1 つのエンティティのマテリアライゼーション失敗はそのエンティティの `207` `errors[]` エントリにマッピングされ、その時間的書き込みをスキップします(他のエンティティは継続)。A2A `temporal` スキル(`create`)も同じヘルパーを呼び出します。

#### 通知取得は書き込みであり、例外ではない(`POST /v2/op/notify`

、#1932)

`POST /v2/op/notify` は通知取得エンドポイントです:上流のContext Brokerまたはコンテキストプロバイダーが `{ subscriptionId, data: [...] }` ペイロードを投稿し、GeonicDB はローカルエンティティに `data[]` を追加します。#1932 以降、これは最初の書き込みの前に `data[]` のすべての要素の**保存された** `entityOwner` / `entityType` を評価します。これは `actionType: append` を使用した `POST /v2/op/update` とまったく同じです。NGSIv2 仕様も Orion API もこのエンドポイントの認可を定義していないため、選択は GeonicDB に委ねられています。決定的なルールはパリティ不変条件です(#1376):


* **呼び出し元はポリシーによって評価されるプリンシパルであり、匿名のワイヤーではありません。** `/v2/op/notify` には特別な認証契約はありません — 他のすべてのデータルートと同様に `optionalAuth` を通過します。これは次を意味します:`AUTH_ENABLED=false` の場合、すべてのリクエストは `super_admin` として扱われます。`AUTH_ENABLED=true` の場合、資格情報のあるリクエストは独自のプリンシパルになり、資格情報のないものは `role=anonymous` になります。これはデフォルトポリシーがパスステージで拒否しますが、カスタム `Permit` で許可できます。どのプリンシパルになっても、それは ID ベースのルートが見るものと同じプリンシパルです。テナントポリシーが他の誰かが所有するエンティティへの書き込みを拒否する場合、その拒否は意図的なものであり、このリクエスト形状を含むすべてのリクエスト形状で維持されなければなりません。
  
* **通知はリクエストの*形状*であり、許可レベルではありません。** これを免除すると、同じポリシーが `/v2/op/notify` に対して `PATCH /v2/entities/{id}/attrs` よりも弱くなります — これは #1363 / #1325 / #1678 / #1928 のまさに欠陥クラスです。強制されない場合、エンドポイントに到達できる任意のプリンシパルがテナント全体に対する普遍的な書き込みプリミティブを保持します。
  
* **`subscriptionId` は決して認可の入力ではありません。** これは呼び出し元が提供する自由形式の文字列(`Ngsiv2NotifySchema`)であるため、そこから許可を導出すること — 例えば「登録されたサブスクリプションの名前を指定した者を信頼する」 — は構造上フェイルオープンになります。認証されたアクターと保存されたエンティティ属性のみが使用されます。また、それを照合する対象が何もないことにも注意してください:この ID は**通知を送信したContext Broker上の**サブスクリプションを識別するものであり、受信側のContext Brokerはそれに関する記録を保持していません。サブスクリプション派生の認可はここでは単に安全でないだけでなく、操作するデータがありません。

作成は影響を受けません:保存されたドキュメントのない ID は作成としてスキップされるため、新しいエンティティを導入する通知は以前とまったく同じように動作します。ブロックされるのは、ポリシーが保護する**既存の**エンティティの上書きです。上流のContext Brokerが所有していないエンティティを上書きできるようにしたいデプロイメントは、チェックの欠如に依存するのではなく、ポリシーでそれを明示的に示さなければなりません(例えば、`/v2/op/notify` でその `userId` に対する `Permit` ルール)。

**認可ルックアップは書き込みが触れるものの上位集合でなければなりません。** 認可属性を解決するプロジェクションクエリは、読み取りパスが適用する「ライブ」述語(`deletedAt` / `expiresAt`)を意図的に省略します。これは、バッチ書き込みフィルターもそれらを適用しないためです。認可ルックアップが任意の述語(テナント / servicePath / プロトコル / 論理削除 / 有効期限 / タイプ)で書き込みよりも狭い場合、影響を受けるドキュメントは認可にとって*不在*に見え、作成として扱われ、チェックを完全にスキップします — これは暗黙のフェイルオープンです。過剰包含は無害です:認可が見えるが読み取りができないドキュメントは、その後も `404` として返されます。

### デフォルトポリシー

GeonicDB は以下のロールデフォルトポリシーを設定します(信頼できる情報源:`src/core/auth/policy/policy.defaults.ts`):


* **`super_admin`**: 管理 API(`/admin/**`)、読み取り専用の統計/メトリクス、および `/me/**` で Permit。拒否フェンス(優先度 `-1`、上書き不可)がデータ API(`/v2/**`、`/ngsi-ld/**`、`/catalog/**`、`/rules/**`、`/custom-data-models/**`、`/mcp`)をブロックします — プラットフォーム管理者はテナントデータに触れることができません。`/a2a` はフェンスにリストされていませんが、デフォルトの Permit もないため、フェイルクローズドパスステージによって同様に拒否されます。
  
* **`tenant_admin`**: すべてのデータ API、AI ツールエンドポイント `/mcp` および `/a2a`(#1651)、およびテナントスコープの管理 API で Permit(すべてのメソッド)。
  
* **`user`**: NGSI API(`/v2/**`、`/ngsi-ld/**`)で Permit(CRUD)。`/catalog/**`、`/rules/**`、`/custom-data-models/**`、および `/mcp` では `GET` のみ。さらに `/me/**` と読み取り専用の統計/メトリクスエンドポイント。MCP ツール呼び出しトランスポートは `POST /mcp` で、A2A は `POST /a2a` であることに注意してください — **どちらも `user` デフォルトではカバーされません**(`GET /mcp` のみ。`/a2a` はまったくなし)。したがって、`user` が MCP / A2A ツールを呼び出すにはカスタム Permit ポリシーが必要です。これは `api_key` / `oauth_client` と同じです。
  
* **`api_key` / `anonymous` / `oauth_client`**: 空ルールデフォルト(`rules: []`) — デフォルトの `Permit` がないため、すべてのリクエストは `NotApplicable` と評価され、フェイルクローズド PEP によって `403` で拒否されます(明示的な XACML `Deny` ではありません。[パスレベル vs エンティティレベル認可](#path-level-vs-entity-level-authorization)を参照)。明示的な Permit ポリシーがバインドされるまで、事実上アクセスはありません。

`tenant_admin` によって作成されたカスタムテナントポリシーは、許可リスト `TENANT_POLICY_ALLOWED_PATH_PREFIXES`(`/v2/`、`/ngsi-ld/`、`/catalog`、`/rules`、`/custom-data-models`、`/mcp`、`/a2a`)内のパスのみをターゲットにできます — これは MCP / A2A ツールアクセス(`POST /mcp` / `POST /a2a`)が `user` / `api_key` / `oauth_client` プリンシパルに付与される方法でもあります([MCP / A2A ツール認可](#mcp--a2a-tool-authorization-1610--1651--1672)を参照)。

### 匿名アクセスポリシー (GeonicDB 拡張)

GeonicDB は、テナント管理者が設定することで、データ API への匿名(認証なし)アクセスをサポートします。これは、認証を必要とせずに公開データ(例:気象観測、オープンデータセット)を公開する場合に便利です。

#### 前提条件


1. **明示的な Permit ポリシーを作成する**: `role=anonymous` をターゲットとして、必要なアクセスレベルを設定します(#748 以降、機能フラグは不要)

#### セットアップ

```bash
# Create a policy allowing anonymous read access
curl -X POST http://localhost:3000/admin/policies \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Allow anonymous read access to WeatherObserved entities",
    "target": {
      "subjects": [{"attributeId": "role", "matchValue": "anonymous"}],
      "resources": [
        {"attributeId": "path", "matchValue": "/v2/**", "matchFunction": "glob"},
        {"attributeId": "entityType", "matchValue": "WeatherObserved"}
      ]
    },
    "ruleCombiningAlgorithm": "first-applicable",
    "rules": [
      {"effect": "Permit", "target": {"actions": [{"attributeId": "method", "matchValue": "GET"}]}},
      {"effect": "Deny"}
    ]
  }'

# 3. Anonymous access (no Authorization header)
curl http://localhost:3000/v2/entities?type=WeatherObserved \
  -H "Fiware-Service: mytenant"
```

ブラウザ / Node アプリの場合、SDK は `anonymous: true` オプションを介して同じフローをサポートします(トークン取得なし、`Authorization` ヘッダーなし)。`docs/SDK.md` を参照してください。

```javascript
const db = new GeonicDB({
  baseUrl: 'http://localhost:3000',
  tenant: 'mytenant',
  anonymous: true,
});
const entities = await db.getEntities({ type: 'WeatherObserved' });
```

#### セキュリティモデル


* **フェイルクローズ**: 明示的な Permit ポリシーがない場合、すべての匿名リクエストは拒否されます(403)。
  
* **ポリシーなし = 拒否**: 匿名アクセスは常に明示的な XACML Permit ポリシーを必要とします。
  
* **管理 API には決してアクセスできない**: 匿名ユーザーは、ポリシーに関係なく `/admin/*`、`/auth/*`、または `/me/*` エンドポイントにアクセスできません。
  
* **テナント分離**: 匿名リクエストには `Fiware-Service` ヘッダーを含める必要があります。匿名ユーザーは指定されたテナントに紐付けられ、他のテナントのデータにはアクセスできません。
  
* **取り消し可能**: XACML Permit ポリシーを削除することで、すべての匿名アクセスを即座にブロックできます。
  
* **認証情報が提示されたが無効 → 401、匿名ではない (#2794)**: `optionalAuth` (データ API / `/custom-data-models` / MCP / A2A) は、認証情報が欠落している場合は `role=anonymous` として扱いますが、**提示された** `Authorization` または `X-Api-Key` ヘッダー(空の Bearer / 不正なスキームを含む)が検証に失敗した場合は `401 Authentication required` を返します。失敗した認証情報を匿名にダウングレードすると、以前は `403 Access denied: no applicable policy` として表面化していましたが、これは 401 をキーとするクライアントのリフレッシュロジックをブロックし、匿名 Permit ポリシーを黙ってグラントする可能性がありました。

***

## ポリシー伝播遅延と HTTP キャッシュ整合性 (#1050)

XACML ポリシーが `/admin/policies` 経由で追加、変更、または削除された場合、Lambda インスタンスがキャッシュされた評価を提供し続ける小さな時間枠が存在します。

### キャッシュレイヤー


1. **`PolicyService` インスタンスキャッシュ (TTL: `AUTH.POLICY_CACHE_TTL_MS` = 60s)** — `findActivePoliciesForTenant(tenantId)` の結果を Lambda インスタンスごとにメモリ内キャッシュします。同じ Lambda インスタンス内でのポリシーの作成/更新/削除操作時に無効化されますが、他の Lambda インスタンスは TTL 期限切れに依存します。
   
2. **データエンドポイントに HTTP / CDN キャッシュなし** — すべてのデータエンドポイントは `Cache-Control: private, no-cache` を返します (#1047)。共有キャッシュはこれらのレスポンスを保存してはならず、プライベートキャッシュでも再検証が必要です。したがって、ポリシー変更は、次のリクエストが新しい PolicyService キャッシュを持つ Lambda に到達するとすぐに伝播します (≤ 60s)。

### 最悪ケースの伝播遅延


* **単一 Lambda インスタンス**: 即座 (同じ書き込みでキャッシュが無効化されます)。
  
* **複数 Lambda インスタンス**: すべてのインスタンスが変更を取得するまで最大 `POLICY_CACHE_TTL_MS` (デフォルト 60s)。

これは、ほとんどの認可変更に対して許容されます。即座の取り消しには、Lambda インスタンスを再起動するか、ユーザーのトークンをローテーションして再認証を強制してください。

### ポリシー取り消し後の HTTP キャッシュ整合性

ハンドラーは、`tests/unit/handlers/api/index.test.ts` のユニットテストの `#1050` リグレッションテストによって固定された順序で middleware を評価します:

```text
extractAuthContext → optionalAuth → checkTenantAccess → requireAuthz (XACML PEP)
  → controller (200 + ETag)
  → evaluateConditionalRequest (200 → 304 if If-None-Match matches)
```

`requireAuthz` が `ForbiddenError` をスローした場合 (ポリシーが取り消された場合)、レスポンスは `catch` ブロックを通過し、直接 `4xx` を返します — `evaluateConditionalRequest` は**呼び出されません**。したがって、クライアントが取り消し前の古い ETag と共に `If-None-Match` を送信しても、サーバーは `403` を返し、`304` を返すことはありません。古いビューが再び表面化することはできません。

### 運用上の推奨事項


* **監査上重要な取り消し**は、トークン無効化 ([Token Invalidation](#token-invalidation) を参照) と組み合わせて、ユーザーを強制的にログアウトさせ、実行中のキャッシュされたレスポンスがクライアントによって信頼されるのを防ぐ必要があります。
  
* **ポリシーのホットフィックス** (≤ 60s 伝播) は、ほとんどの運用変更に対して十分です。ポリシー変更を伝達する際には、伝播の期待値を文書化してください。

***

## リソーススコープ

> **#748 で削除済み**(JWT 埋め込みの `resourceScopes` と評価 middleware)。細粒度制御は XACML ポリシーを使う。残骸クリーンアップは #2263。

***

## テナントごとのフィーチャーフラグ (非推奨)

> **#748 で削除**: テナントのフィーチャーフラグ (`apiKeysEnabled`、`oauthClientsEnabled`、`anonymousAccessEnabled`) は削除されました。認可は現在、ロールベースのデフォルトを持つ XACML ポリシーによって完全に処理されます:
>
> * API キー: デフォルトで拒否、明示的な XACML 許可ポリシーが必要
> * OAuth クライアント: 常に利用可能 (フィーチャーフラグゲートなし)
> * 匿名アクセス: デフォルトで拒否、明示的な XACML 許可ポリシーが必要 (フィーチャーフラグ不要)

***

## 認証シナリオリファレンス

### ロール別アクセス権限サマリー

| API Category                                   | anonymous           | user                                       | tenant\_admin                          | super\_admin      |
| ---------------------------------------------- | ------------------- | ------------------------------------------ | -------------------------------------- | ----------------- |
| Public endpoints                               | ✅                   | ✅                                          | ✅                                      | ✅                 |
| `/statistics`, `/cache/statistics`, `/metrics` | ❌ (401)             | ✅ (auth required)                          | ✅ (auth required)                      | ✅ (auth required) |
| `/auth/*`                                      | ❌ (401)             | ✅                                          | ✅                                      | ✅                 |
| `/me/*`                                        | ❌ (401)             | ✅                                          | ✅                                      | ✅                 |
| `/v2/*`                                        | ⚠️ Policy-dependent | 📖 Read-only (own tenant)                  | ✅ (own tenant)                         | ❌ Denied (403)    |
| `/ngsi-ld/*`                                   | ⚠️ Policy-dependent | 📖 Read-only (own tenant)                  | ✅ (own tenant)                         | ❌ Denied (403)    |
| `/catalog/*`                                   | ⚠️ Policy-dependent | 📖 Read-only (own tenant)                  | ✅ (own tenant)                         | ❌ Denied (403)    |
| `/admin/users`                                 | ❌ (403)             | ❌                                          | ✅ (`user` role within own tenant only) | ✅ (all users)     |
| `/admin/policies`, `/admin/policy-sets`        | ❌ (403)             | ❌                                          | ✅ (own tenant)                         | ✅ (all tenants)   |
| `/admin/cadde`                                 | ❌ (403)             | ❌                                          | ❌                                      | ✅                 |
| `/custom-data-models`                          | ❌ (403)             | 📖 Read-only (own tenant)                  | ✅ (own tenant)                         | ✅ (all tenants)   |
| `/admin/*` (others)                            | ❌ (403)             | ❌ (OAuth: accessible with `admin:*` scope) | ❌                                      | ✅                 |
| `/rules`                                       | ⚠️ Policy-dependent | 📖 Read-only (own tenant)                  | ✅ (own tenant)                         | ❌ Denied (403)    |
| WebSocket                                      | ❌ (403)             | ✅ (own tenant)                             | ✅ (own tenant)                         | ❌ Denied (403)    |

> **⚠️ ポリシー依存**: `role=anonymous` をターゲットとする明示的な XACML Permit ポリシーが必要です。これがない場合は 403 を返します。
>
> **Catalog credentials (#2472).** `/catalog/**` へのパスレベルの `Permit` だけでは `api_key` / `oauth_client` / `anonymous` に対して十分ではありません。Catalog は合成された `GET /v2/entities` 評価 (#2465 / #2471) からその行フィルターを導出します。一致する entities Permit がない場合、導出は `kind:'none'` となり、catalog は **403** を返します。[Catalog read credentials](#catalog-read-credentials-2465--2468--2472) を参照してください。

### 一般的な認証シナリオ

#### シナリオ 1: 認証無効 (`AUTH_ENABLED=false`

)

すべてのエンドポイントは認証なしでアクセス可能です。

#### シナリオ 2: JWT 認証

```bash
# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password12345"}'

# API request
curl -X GET http://localhost:3000/v2/entities \
  -H "Authorization: Bearer <access_token>" \
  -H "Fiware-Service: mytenant"
```

#### シナリオ 3: OAuth 2.0 M2M 認証

```bash
# Obtain token
curl -X POST http://localhost:3000/oauth/token \
  -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d "grant_type=client_credentials&scope=read:entities"

# API request
curl -X GET http://localhost:3000/v2/entities \
  -H "Authorization: Bearer <access_token>" \
  -H "Fiware-Service: mytenant"
```

#### シナリオ 4: API Key 認証

```bash
# Create an API key (via admin or self-service)
curl -X POST http://localhost:3000/me/api-keys \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My App Key",
    "allowedOrigins": ["*"]
  }'

# API request with API key
curl -X GET http://localhost:3000/v2/entities \
  -H "X-Api-Key: gdb_<key_from_creation_response>" \
  -H "Fiware-Service: mytenant"
```

#### シナリオ 5: OIDC 外部 IdP 認証

```bash
# Obtain ID token from external IdP (e.g., Google)
# API request
curl -X GET http://localhost:3000/v2/entities \
  -H "Authorization: Bearer <id_token_from_google>" \
  -H "Fiware-Service: mytenant"
```

#### シナリオ 6: 匿名アクセス (認証なし)

```bash
# No Authorization header needed
# Requires: XACML Permit policy for role=anonymous (no feature flag needed since #748)
curl -X GET http://localhost:3000/v2/entities?type=WeatherObserved \
  -H "Fiware-Service: mytenant"
```

***

## トークンの無効化

GeonicDB はユーザーごとのトークン無効化メカニズムを提供します。

### 無効化の仕組み

ユーザーごとにタイムスタンプ(`invalidatedBefore`)が管理されます。これは「この時刻より前に発行されたトークンは無効」を意味します。トークンの `iat`(発行時刻)がこのタイムスタンプより早い場合、トークンは無効と判定されます。

### 無効化が発生するタイミング

| Action                                | Effect                                                                        |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| `POST /auth/logout`                   | Immediately invalidates all access tokens and refresh tokens for that user    |
| `POST /me/password` (password change) | Invalidates all existing tokens after the password change (re-login required) |

### ストレージ

| Environment       | Storage        | Configuration                                                      |
| ----------------- | -------------- | ------------------------------------------------------------------ |
| AWS Lambda        | DynamoDB table | Specified via `TOKEN_INVALIDATION_TABLE_NAME` environment variable |
| Local development | In-memory Map  | Used automatically when environment variable is not set            |

DynamoDB テーブルには TTL が設定されており(7 日間)、リフレッシュトークンの有効期限を超えたレコードは自動的に削除されます。

### 注意事項


* OAuth 2.0 Client Credentials トークンはトークン無効化の対象外です
  
* ログアウト後に再度ログインすると新しいトークンが発行されます
  
* ログアウト直後の再ログイン(同じ秒内)は安全です。JWT の `iat` は 1 秒精度であるため、新しく発行されたトークンの `iat` は無効化のしきい値を超えて進められ(`iat = max(now, invalidatedBefore)`、最大で 1 秒先)、無効化ウィンドウに捕捉されません。逆に、各無効化の書き込みはしきい値をエスカレートし(`max(now + 1, current + 1)`)、進められたトークンも後続のログアウトによって確実に無効化されます(#1351)

### WebSocket トークンの再検証

WebSocket 接続の場合、接続が確立されると JWT の `exp`(有効期限)が DynamoDB に保存されます。その後のメッセージ受信時に `exp` が再検証され、トークンが期限切れの場合は `401` が返されます(OWASP API2:2023 準拠)。


* 接続時:`connect` ハンドラが `ConnectionRecord` に `tokenExp` を保存します
  
* メッセージ受信時:`default` ハンドラが `tokenExp` と現在時刻を比較します

***

## ブルートフォース保護

GeonicDB には、ログインエンドポイント (`POST /auth/login`) と OAuth トークンエンドポイント (`POST /oauth/token`) に対するブルートフォース攻撃防止機能が含まれています (OWASP API2:2023 準拠)。

### 動作仕様

#### ログインエンドポイント (`POST /auth/login`

)

メールアドレスごとにログイン失敗回数を追跡し、以下のルールで応答します:

| Failure count                  | Response                | Wait time until next attempt  |
| ------------------------------ | ----------------------- | ----------------------------- |
| 1st                            | `401 Unauthorized`      | None                          |
| 2nd                            | `401 Unauthorized`      | 2 seconds (progressive delay) |
| 3rd                            | `401 Unauthorized`      | 4 seconds (progressive delay) |
| 4th                            | `401 Unauthorized`      | 8 seconds (progressive delay) |
| 5th and beyond (locked)        | `429 Too Many Requests` | 60 seconds (lock)             |
| While locked (even correct PW) | `429 Too Many Requests` | Remaining seconds             |
| Successful login               | Counter reset           | —                             |

> **注意**: 待機時間内に再試行すると `429 Too Many Requests` が返されます (`Retry-After` ヘッダー付き)。段階的な遅延は次のリクエスト (`checkLoginAllowed`) で適用され、失敗応答自体は `401` です。

#### OAuth トークンエンドポイント (`POST /oauth/token`

)

`client_id` ごとに認証失敗回数を追跡します。動作ルールはログインエンドポイントと同じです (段階的な遅延 + アカウントロック)。


* **追跡キー**: `oauth:<clientId>` 形式で `LoginProtectionService` を共有
  
* **成功時**: カウンターをリセット
  
* **非アクティブなクライアント**: 認証失敗として記録

### 設計原則


* **メールベース**: IP アドレスは VPN/プロキシで簡単にバイパスできるため、メールアドレスごとに追跡
  
* **Lambda 最適化**: `sleep()` 遅延の代わりに `429 + Retry-After` ヘッダーで応答 (Lambda の課金コストを回避するため)
  
* **自動クリーンアップ**: MongoDB TTL インデックスにより、試行記録は 1 時間後に自動削除
  
* **有効化/無効化から独立**: ブルートフォース保護は自動化されたセキュリティメカニズムであり、管理者による手動の有効化/無効化操作とは別に管理

### 管理者によるロック解除

アカウントがロックされた場合、管理者は以下のエンドポイントでロックを解除できます:

```bash
POST /admin/users/{userId}/unlock
Authorization: Bearer <accessToken>
```

**レスポンス例:**

```json
{
  "userId": "abc123",
  "email": "user@example.com",
  "locked": false,
  "failedCount": 0,
  "message": "Account login lock has been cleared"
}
```

### 設定値

| Parameter                        | Default | Description                                                         |
| -------------------------------- | ------- | ------------------------------------------------------------------- |
| `MAX_FAILED_ATTEMPTS`            | 5       | Maximum number of failures before lock                              |
| `LOCK_DURATION_SECONDS`          | 60      | Lock duration (seconds)                                             |
| `ATTEMPT_WINDOW_SECONDS`         | 900     | Attempt window (15 minutes)                                         |
| `PROGRESSIVE_DELAY_BASE_SECONDS` | 2       | Base value for progressive delay (seconds) — delay = base × 2^(n-2) |
| `ATTEMPT_RECORD_TTL_SECONDS`     | 3600    | Automatic deletion of attempt records (1 hour)                      |

***

## 所有権検証 (GeonicDB 拡張)

GeonicDB は、OWASP API1:2023 (Broken Object Level Authorization) の対策として、Subscription と Registration に対する所有権検証を提供します。

### 概要

NGSI 仕様では、テナント分離 (`Fiware-Service` ヘッダー) のみでアクセス制御を行いますが、マルチユーザーテナント環境では課題があります: 同じテナント内のユーザーが他のユーザーのリソースを操作できてしまいます。GeonicDB は `createdBy` フィールドを導入し、書き込み操作時に所有権を検証します。

### 対象リソース

| Resource                                                               | Target Operations      |
| ---------------------------------------------------------------------- | ---------------------- |
| Subscription (`/v2/subscriptions`, `/ngsi-ld/v1/subscriptions`)        | UPDATE, DELETE         |
| Registration (`/v2/registrations`, `/ngsi-ld/v1/csourceRegistrations`) | UPDATE, DELETE         |
| Context source subscription (`/ngsi-ld/v1/csourceSubscriptions`)       | UPDATE, DELETE (#2188) |
| Custom data model (`/custom-data-models`)                              | UPDATE, DELETE (#2198) |

> \*\*カスタムデータモデルは #2198 で追加されました。\*\*作成時に `createdBy` を保存しますが、`CustomDataModelService.updateDataModel` / `deleteDataModel` は `repository.get` 経由での存在確認のみを行っていたため、テナントへの書き込み権限を持つ任意のプリンシパルが他のユーザーのモデルを更新または削除できました。削除すると自動生成された JSON-LD コンテキストと一意制約インデックスも削除されます。ルートガード(`requireAuth + checkTenantAccess + requireAuthz`)はテナント境界とパス/メソッドの認可を強制しますが、**リソースごとの所有権は強制しません**。現在は他の 3 つのリソースとまったく同じ契約に従います。**1 つの相違点(#2189):サブスクリプション、レジストレーション、csource-subscriptions では、所有者の不一致は(`createdBy` が欠落している場合と同様に)`404` を返しますが、カスタムデータモデルは `403` を維持します** — カスタムデータモデルは行レベルの読み取り述語の対象ではないため、その存在は制限された呼び出し元から隠されず、閉じるべき存在オラクルもありません。他の 3 つについては、`404` と `403` は異なります(`403` はドキュメントが存在することを明らかにします)ので、`404` に統一されます。テナント全体で共有されるスキーマは、`tenant_admin` として編集することで引き続き可能です。ガードは MCP エントリポイント(`src/api/mcp/tools/config.tools.ts`)もカバーしており、これは同じサービスメソッドを呼び出します。
>
> **コンテキストソースサブスクリプションは #2188 で追加されました。**`createdBy` を保存しますが(#2133)、`CSourceSubscriptionService.updateSubscription` / `deleteSubscription` は所有権チェックを一切実行せず、`actor` さえ渡されていなかったため、テナント内の任意の認証されたプリンシパルが他のユーザーの CSR サブスクリプションを更新または削除できました。現在は他の 2 つのリソースと同じ契約に従います(admin バイパス / `createdBy` 欠落 → `404` / 所有者不一致 → `404`、#2189 以降)。`requireSubscriptionUpdateAuthz`(#2005)はこれをカバー**しません**:これは*更新後の有効値*がサブスクリプションライブ可能かどうかを評価するものであり、呼び出し元が他人のサブスクリプションを変更できるかどうかを評価するものではありません。
>
> **注意**:読み取り操作(GET/LIST)は所有権チェック自体によって制限されません。NGSI 仕様に準拠したテナント分離が適用され、また — #2140(サブスクリプション)/ #2084(レジストレーション)以降 — 読み取りはさらに行レベルの読み取り述語を通過し、プリンシパルが読み取れないエンティティタイプを宣言しているドキュメントを編集または非表示にします。

### ロール別の動作

| Role           | Own resource | Other's resource        | createdBy not set (legacy)               |
| -------------- | ------------ | ----------------------- | ---------------------------------------- |
| `super_admin`  | ✅ Operable   | ✅ Operable (bypass)     | ✅ Operable                               |
| `tenant_admin` | ✅ Operable   | ✅ Operable (bypass)     | ✅ Operable                               |
| `user`         | ✅ Operable   | ❌ 404 Not Found (#2189) | ❌ 404 Not Found (**fail-closed**, #2161) |

> カスタムデータモデルの場合、`user` に一致する「他人のリソース」セルは(`404` ではなく)`403 Forbidden` を返します。上記の #2198 の下にある相違点の注記を参照してください。

### 動作仕様


1. **作成時**: リソースが作成されると、認証されたユーザーの ID が自動的に `createdBy` フィールドに記録されます
   
2. **更新/削除時**: リクエストしたユーザーの ID が `createdBy` と照合されます
   
   * 一致: 操作が許可されます
     
   * 不一致: `404 Not Found` を返します(**「そのようなドキュメントは存在しない」と区別不可能**、#2189)
     
   * `createdBy` が設定されていない(このフィールドが存在する前に作成されたレガシーデータ): 非管理者に対して `404 Not Found` を返します(#2161)
     
3. **管理者バイパス**: `super_admin`/`tenant_admin` は所有権チェックをスキップします — ただし、以下のフェンスノートを参照してください:
   認証が有効な場合、`super_admin` はこれらのエンドポイントに全く到達しないため、実際にこれらのリソースを管理できる唯一の管理者は `tenant_admin` です
   
4. **認証が無効な場合**: `AUTH_ENABLED=false` の場合、所有権チェックはスキップされます

> **`super_admin` バイパスはデータ API では到達不可能です(認証が有効な場合)。**
> `SUPER_ADMIN_DATA_API_DENY_FENCE`(`policy.defaults.ts`)は、`super_admin` に対して `/v2/**`、`/ngsi-ld/**`、
> `/catalog/**`、`/rules/**` をハード拒否します。これはカスタムポリシーでも解除できない deny-overrides フェンスです
> — プラットフォーム管理者はテナントデータに触れることができてはなりません。所有権チェックの
> `actor.role === 'super_admin'` による早期リターンは、したがって `AUTH_ENABLED=false` の場合
> (すべてのリクエストが合成 `super_admin` になる)または内部呼び出し元からの場合のみ実行されます。以下の行は
> 「所有権チェック自体が行うこと」として読んでください。エンドツーエンドの到達可能性としてではありません。
>
> **レガシードキュメントはフェイルクローズドで、ステータスコードは `404` であり、`403` ではありません(#2161)。** #2161 以前、
> ガードは `doc.createdBy && doc.createdBy !== actor.id` と読み取っていたため、`createdBy` が**ない**ドキュメントは
> 条件全体を false にし、テナント内の*任意の*認証されたプリンシパルがそれを更新または削除できました
> (「不明な所有者は通過する」)。これには 2 つの問題がありました。第一に、それ自体が Broken Object Level
> Authorization の脆弱性でした。第二に、#2140 / #2084 が読み取りを行レベル述語を通過させるようにすると、
> タイプを拒否されたプリンシパルは `GET` では `404` を取得するものの、まったく同じドキュメントに対して
> `DELETE` では `204` を取得していました — その差異自体がドキュメントの存在を明らかにし(**存在オラクル**)、
> 呼び出し元がそれを破壊できることの上に成り立っていました。レガシードキュメントに対して `404` を返すことで、所有権チェック自体が
> 「そのようなドキュメントは存在しない」と区別不可能になり、両方を閉じます。`403` はそうではありません: それは存在を確認し、
> \#1370 が閉じたのと同じリーククラスであり、#1963(entityMaps)が `404` を選択したのと同じ理由です。(#1945(snapshots)は
> レガシー行に対して同じ**フェイルクローズド**の呼び出しを行いましたが、`403` を保持しました — `SnapshotService.checkSnapshotOwnership`
> は `ForbiddenError` を返します; #1963 のみが所有者を Mongo クエリに組み込んで、「存在するがあなたのものではない」と
> 「存在しない」が分岐できないようにしました。)
>
> **#2189 が閉じたもの。** 上記の `404` は当初、レガシー(`createdBy` が存在しない)セルのみに適用されていました。
> 2 つの隣接するパスは、呼び出し元が読み取れない可能性のあるドキュメントに対して依然として `403` を返し、
> したがってその存在を明らかにしていました。両方とも現在 #2189 によって閉じられています:
>
> * **所有者の不一致。** 別のユーザーによって作成されたドキュメントは `403` を返しましたが、存在しない id は
>   `404` を返します — `403` 自体がドキュメントの存在を確認していました。所有者の不一致は現在 `404` を返し、
>   存在しない id と一致するため、所有者でない者は両者を区別できません。(`#2005` の更新認可も
>   既存のドキュメントに対して評価されるため、ポリシーで拒否されたサブスクリプションライバーも `404` を観察します。)
> * **NGSI-LD `PATCH` ルート。** サブスクリプション更新認可(`requireSubscriptionUpdateAuthz`、
>   \#2005)は、所有権チェックの*前に*既存のドキュメントに対して評価されていたため、そのポリシーによって拒否された
>   プリンシパルは `createdBy` に関係なく `403` を取得していました。所有権チェックが現在最初に適用されるため、
>   所有者でない者はポリシーが相談される前に `404` を取得します。
>
> 残りの非対称性 — 呼び出し元が*読み取れる*レガシードキュメントは `GET` に `200` で応答するが
> `DELETE` には `404` で応答する — は意図的かつ安全です(書き込みを拒否します)が、「不可視」ではありません: 呼び出し元は
> `GET` を介してリソースの存在を知ることができます。これは書き込みパスオラクルの範囲外です(`GET` は設計上
> 許可されたプリンシパルに対して読み取り可能です)。
>
> **運用上の影響**: `createdBy` が存在する前に作成されたサブスクリプションとレジストレーションは、通常のユーザーによって
> 更新または削除できなくなります — 元々それらを作成した人を含めて、保存されたドキュメントには照合する所有者が記録されていないためです。`tenant_admin` はそれらの
> ドキュメントへの完全なアクセスを保持します(意図されたエスケープハッチ — `super_admin` は上記のフェンスノートに従ってできません); 認証されたプリンシパルの下で
> リソースを再作成すると、通常のセルフサービス管理が復元されます。

### エラーレスポンス

サブスクリプション / レジストレーション / csource-subscriptions の場合、所有者の不一致は
存在しない id と区別不可能なので、NGSIv2 / NGSI-LD エラーエンベロープは `404` と同じです:

```json
{
  "error": "NotFound",
  "description": "Subscription not found: {subscriptionId}"
}
```

ステータスコード: `404 Not Found`

カスタムデータモデルは `403 Forbidden` を保持します:

```json
{
  "error": "Forbidden",
  "description": "You do not have permission to modify this resource"
}
```

ステータスコード: `403 Forbidden`

***

## トラブルシューティング

### レート制限エラー (429 Too Many Requests)

**考えられる原因:**

* ログイン失敗回数が多すぎる (ブルートフォース攻撃保護)
  
* アカウントがロックされている

**解決方法:**

* `Retry-After` ヘッダーに示されている秒数だけ待機してから再試行する
  
* ロックされている場合は、管理者に `POST /admin/users/{userId}/unlock` でロックを解除してもらう

### 認証エラー (401 Unauthorized)

**考えられる原因:**

* トークンが無効または期限切れ
  
* `JWT_SECRET` が正しく設定されていない
  
* ユーザーまたはテナントが無効化されている
  
* ログアウトまたはパスワード変更後のトークン (既に無効化されている)

**解決方法:**

```bash
# Check token expiration
jwt decode <access_token>

# Re-login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password12345"}'
```

### 認可エラー (403 Forbidden)

**考えられる原因:**

* ロールが不十分
  
* テナントが一致しない
  
* XACML ポリシーによる拒否

**解決方法:**

* ユーザーのロールを確認する
  
* `Fiware-Service` ヘッダーがユーザーのテナントと一致することを確認する
  
* ポリシー設定を確認する

### 管理 API アクセスエラー

**考えられる原因:**

* `super_admin` ロールではない (JWT 認証を使用している場合)
  
* OAuth トークンに必要な `admin:*` スコープがない
  
* IP アドレスが `ADMIN_ALLOWED_IPS` に含まれていない

**解決方法:**

```bash
# Re-login as Super Admin
# Check IP restrictions
echo $ADMIN_ALLOWED_IPS
# For OAuth: check the client's policyId and bound policy
```

***

## 関連ドキュメント


* [API 共通仕様](../api-reference/endpoints.md) - 一般的な API 仕様
  
* 開発ガイド - API 仕様 (ページネーション、ステータスコード) とデプロイメント
  
* [XACML 3.0 仕様](https://docs.oasis-open.org/xacml/3.0/xacml-3.0-core-spec-os-en.html) - 公式 XACML 3.0 仕様
