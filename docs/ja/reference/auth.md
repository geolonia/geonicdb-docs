---
title: "Authentication Guide"
description: "GeonicDB authentication and authorization guide"
outline: deep
---
# 認証と認可ガイド

このドキュメントは、GeonicDB の認証および認可機能の全体像、セットアップ、および管理について説明します。

## 目次


* [概要](#overview)
  
* [認証アーキテクチャ](#認証アーキテクチャ)
  
* [初期セットアップ](#初期セットアップ)
  
* [ユーザーとテナントの管理](#ユーザーとテナントの管理)
  
* [API キー認証](#api-キー認証)
  
  * [API キートークン交換 (Browser SDK)](#api-キートークン交換-browser-sdk)
    
  * [DPoP トークンバインディング (RFC 9449)](#dpop-トークンバインディング-rfc-9449)
    
* [OAuth 2.0 M2M 認証](#oauth-20-m2m-認証)
  
* [OIDC 外部 IdP 認証](#oidc-外部-idp-認証)
  
* [XACML ポリシーベース認可](#xacml-ポリシーベース認可)
  
* [認証シナリオリファレンス](#認証シナリオリファレンス)
  
* [トラブルシューティング](#トラブルシューティング)

***

## 概要

GeonicDB は JWT ベースの認証および認可機能を提供します。

### ロール設定

| Role           | Description            | Permissions                                                                                                                                                                                           |
| -------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `super_admin`  | Platform administrator | `/admin/*`, `/auth/*`, `/me/*`, monitoring endpoints (`/statistics`, `/metrics`, `/cache/statistics`) only. **Cannot** access data APIs (`/v2/*`, `/ngsi-ld/*`, `/catalog*`, `/rules*`) — returns 403 |
| `tenant_admin` | Tenant administrator   | Full access within the assigned tenant (admin + data APIs)                                                                                                                                            |
| `user`         | General user           | Read-only by default (GET only). Custom XACML policies can grant write access                                                                                                                         |
| `anonymous`    | Unauthenticated user   | Denied by default. Explicit XACML Permit policy required. No feature flag needed (#748)                                                                                                               |

> **注意**: `super_admin` は SaaS セキュリティのためにプラットフォーム管理操作に制限されています。
> 顧客データの分離が強制されています — `super_admin` 資格情報を持つ Geolonia スタッフはテナントのエンティティデータにアクセスできません。
> 詳細については [#674](https://github.com/geolonia/geonicdb/issues/674) を参照してください。

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

認証を有効にするために、以下の環境変数を設定してください。

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

SAM テンプレートで以下のパラメータを設定してください:

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

* データベースには保存されない(メモリ内のみ)
  
* サーバー再起動後も同じ認証情報で利用可能
  
* パスワードを変更するには、環境変数を更新してサーバーを再起動する必要がある

#### 方法 2: Admin API による追加登録

既存のスーパー管理者としてログインした後、Admin API を使用して新しいスーパー管理者を作成できます。

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

### デプロイメントルーティング管理 (super\_admin のみ)

ホスト名 → MongoDB クラスタールーティング行。これらはすべてのデプロイメントにまたがるため、`tenant_admin` は読み取りアクセスも拒否されます。そうしないと、テナント管理者が他のすべてのデプロイメントのクラスター配線を読み取ることができてしまいます。[API.md](../api-reference/endpoints.md#deployment-routing-management-super_admin-only) および DEDICATED\_CLUSTER\_ONBOARDING.md を参照してください。

| Endpoint                        | Method | Description                     |
| ------------------------------- | ------ | ------------------------------- |
| `/admin/deployments`            | GET    | List deployment routing rows    |
| `/admin/deployments`            | POST   | Create a deployment routing row |
| `/admin/deployments/{hostname}` | GET    | Get a deployment routing row    |
| `/admin/deployments/{hostname}` | PATCH  | Update a deployment routing row |
| `/admin/deployments/{hostname}` | DELETE | Delete a deployment routing row |

平文の `mongodbUri` は決して返されません。現在のリクエストを処理しているデプロイメントの削除または無効化は、409 で拒否されます(自己ロックアウトガード)。

### CADDE 設定管理 (super\_admin のみ)

| Endpoint       | Method | Description                          |
| -------------- | ------ | ------------------------------------ |
| `/admin/cadde` | GET    | Get CADDE configuration              |
| `/admin/cadde` | PUT    | Update CADDE configuration (upsert)  |
| `/admin/cadde` | DELETE | Delete CADDE configuration (disable) |

CADDE 設定は、デプロイメントの MongoDB `settings` コレクション (`_id: 'cadde'`) に保存されます。`CADDE_ENABLED` などの環境変数によって制御されることは**ありません**(`docs/INTEGRATIONS.md` を参照)。CADDE を有効にすると、GeonicDB XACML 行レベルフィルター (#2469) なしで、デプロイメント内の**すべてのテナント**に対して `/cadde/api/v4/*` が公開されます。CADDE and XACML を参照してください。

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

管理者は **一時パスワード** を発行してユーザーをオンボードし、ユーザーは初回ログイン時にそれを置き換える必要があります。強制は **1 回限り** です。一時パスワードはブートストラップ資格情報であり、その唯一の機能は新しいパスワードを設定することです。使用可能なトークンを生成することはないため、エンティティの読み取りや API キーの発行はできません。

**注意:** 一時パスワードはサーバーによって 2 つのケースで生成されます:(a) `"passwordResetRequired": true` でユーザーを作成する場合(招待)、または (b) 既存のユーザーに対して `reset-password` を呼び出す場合(忘れたパスワードをリセットする方法でもあります)。`passwordResetRequired` **なし** でユーザーを作成すると、提供された `password` が直接設定され、変更は **強制されません**(非破壊的)。

**1. 管理者がアカウントを発行する** — 作成時(招待)または作成後(リセット)

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


* 認可: `super_admin`(すべてのユーザー)/ `tenant_admin`(自分のテナント内のユーザー)。
  
* 一時パスワードは **1 回だけ** 表示され、レスポンスには `Cache-Control: no-store` が含まれます。有効期限は `PASSWORD_POLICY.TEMP_PASSWORD_VALIDITY_DAYS` 後です(デフォルト **7 日間**)。`reset-password` はユーザーの既存セッションを無効化します(招待は新規ユーザーを作成するため、無効化するセッションはありません)。

**2. ユーザーが一時パスワードでログインし、新しいパスワードを設定する(単一呼び出し)**

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

**機械可読エラーキー**(`error` フィールド。CLI/SDK はメッセージではなくこれらで分岐します):

| Status | `error`                    | Meaning                                                                                                     |
| ------ | -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `409`  | `PasswordResetRequired`    | Temp password valid; submit `newPassword` to complete login                                                 |
| `403`  | `TemporaryPasswordExpired` | Temp password expired (or issue timestamp missing → fail-closed); ask admin to re-issue                     |
| `400`  | `BadRequest`               | `newPassword` equals the temp password, violates the password policy, or was sent when no reset is required |

**保証**


* パスワードが変更されるまでトークンは発行されません(フェイルクローズ)。ビジネス分岐は一時パスワードが検証された **後** に発生するため、アカウント状態が未認証の呼び出し元に漏洩することはありません。
  
* 同時完了は比較交換更新によって保護されます(敗者には `409 Conflict`)。
  
* `refreshToken()` も強制変更が保留中のユーザーを拒否します(多層防御)。
  
* リセットはユーザーの **パスワード由来の JWT セッションのみ** を無効化します。API キー / OAuth クライアントは動作し続けます。侵害が疑われる場合は、それらを個別に取り消すか、ユーザーを `deactivate` してください。
  
* `PATCH /admin/users/{userId}` 経由でパスワードを直接設定すると、強制変更状態が **クリア** され、**ユーザーの既存のパスワード由来セッションが取り消されます** (#1566)。管理者が選択したパスワードは即座に使用可能になり、ユーザーは次回ログイン時にリセットを求められなくなり、以前のパスワードで発行された古いトークンは機能しなくなります(`reset-password` / `changePassword` と一貫性があります)。

#### テナント存在検証

`tenantId` を指定してユーザーを作成または更新する場合、システムは指定されたテナントが存在することを検証します。テナントが存在しない場合、`400 Bad Request` エラーが返されます。


* **POST /admin/users**: `tenantId` は既存のテナントを参照する必要があります(`super_admin` ユーザーを除く。これらにはテナントがありません)
  
* **PATCH /admin/users/{userId}**: `tenantId` を変更する場合、対象のテナントが存在する必要があります。`tenantId` を `null` に設定することは検証なしで許可されます。

### テナントメンバーシップ管理

FIWARE Keyrock Organization モデルに準拠し、単一のユーザーは複数のテナントに属することができます。メンバーシップはユーザー作成時に自動的に作成されます。

| Endpoint                                   | Method | Description                    | Authorization                               |
| ------------------------------------------ | ------ | ------------------------------ | ------------------------------------------- |
| `/admin/tenants/{tenantId}/users`          | GET    | List tenant members            | `tenant_admin` (own tenant) / `super_admin` |
| `/admin/tenants/{tenantId}/users/{userId}` | PUT    | Add user to tenant             | `tenant_admin` (own tenant) / `super_admin` |
| `/admin/tenants/{tenantId}/users/{userId}` | DELETE | Remove user from tenant        | `tenant_admin` (own tenant) / `super_admin` |
| `/admin/users/{userId}/tenants`            | GET    | List tenants a user belongs to | Self / `super_admin`                        |

#### テナントスコープログイン

ログイン時にテナントを指定することで、そのテナントにスコープされた JWT トークンを取得できます。テナントはリクエストボディ(`tenantId` または `tenantName`)または HTTP ヘッダーを介して指定できます。

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

テナント名の一意性は、`tenants.name` の部分ユニークインデックスによってシステム全体で強制されます(ソフト削除されたテナントを除く、#1223)。これは、`Fiware-Service`、`NGSILD-Tenant`、および `body.tenantName` 全体で名前ベースの解決を明確にする前提条件です。

**動作:**

* `tenantId` を指定した場合:メンバーシップを確認した後、そのテナントにスコープされたトークンを発行
  
* `tenantName` を指定した場合(ボディまたはヘッダー):テナント名でテナントを解決します。テナント名が見つからない、または無効な形式の場合(ヘッダーは `^[a-z0-9_]+$` に一致する必要があります)、`400 Bad Request` を返します
  
* テナント指定なしの場合:プライマリテナント(`user.tenantId`)のトークンを発行します。ユーザーが複数のテナントに属している場合、レスポンスには `availableTenants` リストが含まれます
  
* ユーザーが属していないテナントを指定した場合:`403 Forbidden`

#### メンバーシップのライフサイクル


* **ユーザー作成時**:`POST /admin/users` を介してメンバーシップが自動的に作成されます
  
* **追加登録**:`PUT /admin/tenants/{tenantId}/users/{userId}` を介して別のテナントに追加
  
* **テナント削除時**:すべてのテナント関連データがカスケード削除されます(entities、subscriptions、registrations、temporalEntities、snapshots、rules、policies、OAuth clients、data models、users、memberships など — 全 16 コレクション)
  
* **ユーザー削除時**:ユーザーに関連するすべてのメンバーシップが自動的に削除されます

### テナント毎の CORS 許可オリジン (#1069)

GeonicDB はリクエストの `Origin` ヘッダーをテナントレベルのホワイトリストに対して検証します。これは API-Key の `allowedOrigins` の上に重ねられ、匿名、JWT、API-Key リクエストすべてに適用されます。GeonicDB はマルチテナント Context Broker であるため、許可されたオリジンを環境変数で固定することは**できません** — それらは管理 API を通じて実行時にテナント毎に設定する必要があります。

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

#### 強制適用


* **プリフライト (OPTIONS)** はオリジン検証されません (CORS 仕様: テナントヘッダーはプリフライトに含まれません)。常にリクエストの `Origin` をエコーバックし、204 を返します。
  
* **実際のリクエスト**は `optionalAuth(event, tenantService)` (データ API) または `requireAuth(event)` (管理 / `/auth/logout`) を通過します。オリジンが一致しない場合、リクエストは `403 Forbidden` で拒否され、ボディには `Origin not allowed for this tenant` が返されます。
  
* 403 レスポンスには依然として `Access-Control-Allow-Origin` のエコーバック + `Vary: Origin` が含まれるため、ブラウザは実際のエラーをクライアントに表示します (そうしないと開発者は一般的な Network エラーを見ることになります)。
  
* `super_admin` ユーザー (`tenantId: null`) はオリジン検証をスキップします — 彼らはテナントスコープの上位で動作します。

#### API Key の `allowedOrigins` との階層化

API Key が使用される場合、両方のチェックが適用されます:


1. **テナントレベル**: `tenant.settings.allowedOrigins` を満たす必要があります。
   
2. **API-Key レベル**: `apiKey.allowedOrigins` を満たす必要があります (既存の動作、変更なし)。

最も制限的なものが優先されます。

#### geonicdb-console ステージング (`console.geonicdb.geolonia.com`

) (#2022)

[geonicdb-console](https://github.com/geolonia/geonicdb-console) ステージングは、パスワードログイン + `/auth/dpop-bind` (RFC 9449) を使用して `https://console.geonicdb.geolonia.com` から実際のバックエンド (`https://geonicdb.geolonia.com`) に接続します。HTTP ミドルウェアの変更は必要ありません:


* **CORS プリフライト**はコンソールのオリジンをエコーバックし、すでに `Authorization` と `DPoP` を許可しています (`src/config/defaults.ts` の `CORS_ALLOW_HEADERS`)。
  
* **実際のリクエスト**は認証フェーズで `tenant.settings.allowedOrigins` (および該当する場合は API-key の `allowedOrigins`) によってゲートされます。

専用のステージング QA テナント (慣例により `console-qa`) の場合。**これが意味を持つには、テナントが事前に存在する必要があります** — 2026-08-11 時点では `https://geonicdb.geolonia.com` にまだプロビジョニングされていません。まず (`geonicdb-infra-cdk/scripts/provision-tenants.sh` で) プロビジョニングし、その後確認してください:

| `settings.allowedOrigins`                | Action needed                                                                                             |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Field absent (`undefined`)               | None — backward-compat all-allow                                                                          |
| `["*"]`                                  | None                                                                                                      |
| `["https://*.geonicdb.geolonia.com"]`    | None — covers `console.geonicdb.geolonia.com`                                                             |
| Explicit list without the console origin | Add `https://console.geonicdb.geolonia.com` (or the wildcard above) via `PATCH /admin/tenants/{tenantId}` |

デプロイされた環境に対して検証します。プリフライトはコンソールのオリジンをエコーし、`Authorization` と `DPoP` の両方をリストする必要があります:

```bash
curl -sSD - -o /dev/null -X OPTIONS https://geonicdb.geolonia.com/auth/dpop-bind \
  -H 'Origin: https://console.geonicdb.geolonia.com' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: authorization,dpop,content-type' \
  | grep -i '^access-control-'
```

プリフライトはテナント非依存なので、独自に応答します。以下のテナントプローブは**テナントがプロビジョニングされた後にのみ解釈可能**です:

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

3 行目はフェイルオープンの罠です: プロビジョニングされていないテナントはオリジンチェックに全く到達しないため、`Origin not allowed` がないことは何も証明しません。

テナントの現在の設定を直接読み取るには、super-admin トークンで `GET /admin/tenants` を実行し、`settings.allowedOrigins` を確認します。

`Access-Control-Allow-Credentials` は意図的に**設定されていません** — コンソールは Cookie ではなく、ヘッダーベースの Bearer + DPoP を使用します。

### テナント別 IP 制限

テナントごとに固有の IP アドレス制限を設定できます。グローバル設定(`ADMIN_ALLOWED_IPS`)に加えて、テナントレベルでのきめ細かなアクセス制御が可能です。

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

テナントに IP 制限が設定されていない場合、グローバル設定(`ADMIN_ALLOWED_IPS` 環境変数)が適用されます。テナントレベルの設定が存在する場合は、それが優先されます。

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

GeonicDB は、JWT/OAuth トークンの軽量な代替手段として API キーベースの認証をサポートしています。API キーは、公開統合、ブラウザベースのアプリケーション、および完全な OAuth 認証情報が不要なシナリオに最適です。

### 概要

API キーは、オリジンとレート制限の組み込み制限を備えたシンプルな認証メカニズムを提供し、`policyId` を介したオプションの XACML ポリシーバインディングが可能です。

### 認証ヘッダー

```http
X-Api-Key: <UUID or gdb_-prefixed key>
```

**優先順位**: `Authorization: Bearer` と `X-Api-Key` ヘッダーの両方が存在する場合、Bearer トークンが優先されます。API キーは、Bearer トークンが提供されていない場合にのみフォールバックとして使用されます。

### キー形式


* **新しいキー**: プレーン UUID (`randomUUID()`) — 例: `550e8400-e29b-41d4-a716-446655440000`
  
* **レガシーキー**: `gdb_` プレフィックスを持つ既存のキーは引き続き動作します(後方互換性あり)
  
* **ストレージ**: キーの SHA-256 ハッシュのみがデータベースに保存されます。平文のキーは、作成時とリフレッシュ時にのみ返されます。
  
* **マスキング**: リストと取得のレスポンスは、実際のキーの代わりに `"key": "******"` を返します

### 制限事項

| Field              | Description                                                                                                                                                                                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Origin**         | `allowedOrigins` — list of permitted URL origins, subdomain wildcards (`https://*.example.com`), or `*` for any. At least 1 required. Max 20 entries. Enforced at runtime. Wildcard semantics are the same as the tenant-level list (see [`allowedOrigins` Semantics](#allowedorigins-semantics)). |
| **Policy Binding** | `policyId` — optional. Binds the key to an existing XACML policy. The bound policy's target is bypassed during evaluation (only rules are evaluated). Without `policyId`, the key falls back to tenant policies + role default (api\_key = All Deny).                                              |
| **Rate Limit**     | `rateLimit.perMinute` — requests per minute (1–1000, default: 60).                                                                                                                                                                                                                                 |

### API キー管理 (管理者)

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

ユーザーは管理者権限なしで自分自身の API キーを作成および管理できます。

| Endpoint                       | Method | Description                                                  |
| ------------------------------ | ------ | ------------------------------------------------------------ |
| `/me/api-keys`                 | POST   | Create own API key                                           |
| `/me/api-keys`                 | GET    | List own API keys                                            |
| `/me/api-keys/{keyId}`         | PATCH  | Update own API key (partial)                                 |
| `/me/api-keys/{keyId}`         | DELETE | Delete own API key                                           |
| `/me/api-keys/{keyId}/refresh` | POST   | Refresh (regenerate) own API key — returns new plaintext key |

**制限事項:**

* ユーザーあたり最大 **5 個のキー**
  
* `allowedOrigins` は作成時に必須 (空でない配列; すべてのオリジンを許可するには `["*"]` を使用、サブドメインワイルドカードには `https://*.example.com` を使用)
  
* `policyId` はオプション — 指定する場合、参照されるポリシーは既に存在し、同じユーザーによって作成されている必要があります
  
* `tenantId` は `super_admin` には必須 (欠落時は 400); `tenant_admin` は省略可能 (セッションから自動導出)

> **所有者制限の継承 (#1363 / #1376)。** **personal スコープ**のバインドされたポリシーを持つセルフサービス認証情報 (API キーまたは OAuth クライアント) は、その所有者に課せられた制限を超えることはできません。認可時に、バインドされた `personal` ポリシーが存在する場合、リクエストは所有者の ID でテナントポリシーに対して再評価されます; 所有者が**拒否**される場合 (例: `role=user`/`userId` をターゲットとする `tenant_admin` ポリシーが所有者を特定の `Fiware-ServicePath` または読み取り専用に制限する場合)、認証情報も拒否されます。これにより、制限されたユーザーが自分自身のキー/クライアントに自作の無制約 `Permit` をバインドすることでテナントの `Deny` を回避できていた抜け穴が塞がれます。管理者が発行した認証情報は `tenant` スコープのポリシーをバインドするため影響を受けません。
>
> **リスト読み取り** (型なしの `GET /entities`、#1337/#1369 のポリシーからフィルターへの行レベルセキュリティパスを使用) の場合、所有者制限は二者択一の拒否ではなく**フィルター積集合**として適用されます (#1376): 認証情報の読み取り可能エンティティフィルターは所有者の読み取り可能エンティティフィルターと積集合され、認証情報は所有者が見ることができる行だけを見ることができます (例: 所有者の許可された `entityType` にフィルター)、一律の 403 ではありません。これにより、認証情報を過度に制限するのではなく、所有者との一貫性を保ったリスト読み取りの同等性が保たれます。
>
> 所有者ルックアップ自体は、`loadBoundPolicy` と同様に、**決定論的不在**と**一時的な I/O 障害**を区別します (#2341)。削除された所有者 (`UserRepository.getById` が `null` を返す) は `role=user` / 空のメールとしてフェイルクローズされます。Mongo 接続の切断またはレプリカセットのフェイルオーバーは**再スロー**され、その不在に折りたたまれません: リスト読み取りは `unrestricted` (ユーザー GET のデフォルト) または `kind:'none'` を合成し、通知パスは後者を `SUBSCRIPTION_NOTIFICATION_RLS_DENIED` にマップします — 永続的なドロップで、リトライされません。リトライ可能な I/O エラーは `deriveSubscriberReadFilter` の `'unresolved'` ブランチ (#2289) に到達するため、Lambda は再配信できます。したがって HTTP 呼び出し側は、同じ一時的な障害に対して **403** (権限拒否のように見える) ではなく **500** (リトライ) を受け取ります。

**PATCH 更新可能フィールド** (`PATCH /me/api-keys/{keyId}`):

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

> **注意:** `keyId` は自動生成されます (UUID)。`tenantId` は `super_admin` では必須です。`tenant_admin` は省略可能です (セッションから自動導出されます)。`policyId` はオプションです — 省略した場合、認可はテナントポリシー + ロールデフォルトにフォールバックします。ID (`keyId`、`policyId`) はテナントごとに一意です。

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

> **注意:** `keyPrefix` フィールドは削除されました。`key` フィールドは作成時とリフレッシュ時にのみ平文で返されます。リスト/取得レスポンスでは `"key": "******"` が返されます。
>
> **後方互換性:** `gdb_` プレフィックスを持つ既存のキーは有効であり、引き続き動作します。新しく作成されたキーのみが UUID 形式を使用します。

#### API Key をリフレッシュする

```bash
curl -X POST http://localhost:3000/me/api-keys/{keyId}/refresh \
  -H "Authorization: Bearer <accessToken>"
```

キーの値を再生成します。古いキーは直ちに無効化されます。レスポンスには新しい平文のキーが含まれます (作成レスポンスと同じ形式)。

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

デフォルトでは、API キーには `Deny` ポリシー (`__default_api_key`、優先度 -2) が設定されています。権限を付与するには、まず XACML ポリシーを作成し、`policyId` フィールドを介して API キーにバインドします。

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

> **注意:** `policyId` と `ruleId` は、省略された場合は自動生成されます (UUID)。ID はテナントごとに一意です — 異なるテナントは独立して同じ ID を使用できます。

`policyId` が指定されている場合、評価時にバインドされたポリシーの `target` はバイパスされ、ポリシーの `rules` のみが評価されます。これにより、ターゲットの競合なしに、単一のポリシーを複数の資格情報間で共有できます。

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

セルフサービスキーの場合は、`PATCH /me/api-keys/{keyId}` を使用します — `policyId` は認証されたユーザーによって作成されたポリシーを参照する必要があります:

```bash
curl -X PATCH http://localhost:3000/me/api-keys/{keyId} \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"policyId": "my-readonly-policy"}'
```

### API キートークン交換 (Browser SDK)

ブラウザベースのアプリケーションでは、キーの漏洩リスクがあるため、API キーを `X-Api-Key` ヘッダーで直接使用することはできません。代わりに、GeonicDB は Nonce + Proof of Work を介して API キーを短命のセッション JWT に変換するトークン交換フローを提供します。

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


1. **Origin バリデーション**: Nonce は HMAC を介してリクエストの Origin にバインドされており、Origin が一致しない場合は拒否されます
   
2. **HMAC Nonce**: ステートレスで、サーバーシークレットで署名され、timestamp + Origin + keyId を含みます。TTL は 60 秒です
   
3. **Proof of Work**: SHA-256 ベース、difficulty=4 (4 つの先頭ゼロビット)。外部依存なしで自動化された悪用を防ぎます
   
4. **短命 JWT**: `api_key_session` タイプ、1 時間で期限切れ、policyId を埋め込みます

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

SDK は nonce の取得、PoW の解決、トークンのリフレッシュを透過的に処理します。

#### 外部トークンインジェクション

外部で Bearer JWT ログインを使用する場合(例:アプリケーションレベルのログインフロー)、`setCredentials()` を介してトークンを SDK に注入し、`on('tokenRefresh', cb)` でトークンリフレッシュの同期のためにコールバックを登録します:

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

> **注意**: `setCredentials()` が `tokenType: 'Bearer'` と `refreshToken` で呼び出された場合、すべての後続の API 呼び出しと `connect()` は DPoW/PoW を完全にバイパスします。トークン更新は `/auth/refresh` を使用するため、PoW の再計算は不要です。

詳細については、SDK ドキュメントを参照してください。

### DPoP トークンバインディング (RFC 9449)

GeonicDB は [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) に準拠した DPoP (Demonstration of Proof-of-Possession) をサポートし、トークンをクライアントが保持する暗号鍵にバインドします。これにより、トークンの盗難とリプレイ攻撃のリスクが排除されます — JWT が傍受されたとしても、対応する秘密鍵なしでは使用できません。

#### 仕組み


1. **鍵ペアの生成**: クライアントは ECDSA P-256 鍵ペアを生成します (SDK は `extractable: false` を指定した `crypto.subtle.generateKey` を使用)
   
2. **DPoP 証明によるトークン交換**: クライアントは `POST /oauth/token` の際に証明 JWT を含む `DPoP` ヘッダーを送信します
   
3. **トークンバインディング**: サーバーは証明を検証し、発行する JWT に JWK Thumbprint ([RFC 7638](https://datatracker.ietf.org/doc/html/rfc7638)) を `cnf.jkt` として埋め込みます
   
4. **リクエストごとの証明**: 各 API リクエストには新しい DPoP 証明が含まれ、サーバーは証明の `jkt` がトークンの `cnf.jkt` と一致することを検証します

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

GeonicDB は RFC 9449 セクション 8 に準拠したサーバー提供ノンスを実装し、事前計算された DPoP 証明を防ぎます。ノンスハンドシェイクは透過的に行われます:


1. クライアントは `nonce` クレームなしで DPoP 証明を送信します
   
2. サーバーは `error: "use_dpop_nonce"` と `DPoP-Nonce` レスポンスヘッダーを含む `400` を返します
   
3. クライアントは `nonce` クレームにサーバーノンスを含む新しい DPoP 証明を作成します
   
4. サーバーはノンスを検証してトークンを発行します。レスポンスには後続のリクエスト用の新しい `DPoP-Nonce` が含まれます

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

ノンスはステートレス (HMAC ベース) で、TTL は 300 秒です。データベースストレージは不要です。

DPoP バインドトークンを使用した API リクエストにもノンスが必要です。サーバーは成功レスポンスおよび `use_dpop_nonce` メッセージを含む `401` エラーごとに `DPoP-Nonce` ヘッダーを返します。

#### `htu` 検証とローカル HTTP 開発

各 DPoP 証明には `htu` (HTTP URI) クレームが含まれ、サーバーが再構築するリクエスト URL と一致する必要があります。サーバーはスキームを `X-Forwarded-Proto` (本番環境では API Gateway / CloudFront によって `https` に設定されます) から取得し、そのヘッダーが存在しない場合はデフォルトで `https` になります。

このデフォルトはプロキシなしの**ローカル HTTP 開発**を破壊します: SDK は `baseUrl` から `htu` に署名します (例: `http://localhost:3001/oauth/token`) が、サーバーは `https://localhost:3001/...` を再構築するため、永続的な `htu_mismatch` (400) が発生し、DPoP トークン交換がブロックされます (#1153)。

HTTP でローカル開発するには、サーバーを localhost モードで実行してください (`npm start` は無条件で有効にします — ENV.md を参照)。**その場合に限り、かつ `Host` ヘッダーがループバックの場合のみ** (`localhost` / `127.0.0.0/8` / `[::1]`、ポートはオプション、大文字小文字は区別されません)、サーバーはスキームを `http` として導出し、SDK の `http` `baseUrl` と一致します。`X-Forwarded-Proto` が存在する場合は常に優先されます。本番環境 (Lambda) では localhost モードは決してアクティブにならないため、攻撃者が `Host: localhost` を偽装しても導出されるスキームをダウングレードすることはできません — 両方の条件が成立する必要があります (AND)。

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

API キーは作成時に `dpopRequired: true` を設定することで DPoP を強制できます:

```bash
curl -X POST https://api.example.com/admin/api-keys \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "secure-key", "allowedOrigins": ["https://app.example.com"], "dpopRequired": true}'
```

`dpopRequired` が `true` の場合、有効な `DPoP` ヘッダーなしでのトークン交換は `400 invalid_dpop_proof` を返します。

#### Bearer フォールバック

トークン交換時に `DPoP` ヘッダーが送信されない場合(かつ `dpopRequired` が `false` の場合)、サーバーはバインディングなしの標準的な `Bearer` トークンを発行します。これにより DPoP をサポートしないクライアントとの後方互換性が維持されます。

| DPoP Header    | `dpopRequired` | Result                                      |
| -------------- | -------------- | ------------------------------------------- |
| Present, valid | `false`        | `token_type: "DPoP"` with `cnf.jkt` binding |
| Present, valid | `true`         | `token_type: "DPoP"` with `cnf.jkt` binding |
| Absent         | `false`        | `token_type: "Bearer"` (no binding)         |
| Absent         | `true`         | `400 invalid_dpop_proof` (rejected)         |

> **注意**: すべての DPoP バインド済みリクエスト(トークン交換と API 呼び出し)は nonce ハンドシェイクに参加します。JavaScript SDK はこれを透過的に処理します。

#### SDK DPoP サポート

JavaScript SDK (`@geolonia/geonicdb-sdk`) は `crypto.subtle` が利用可能な場合、自動的に DPoP を有効にします:


* 初期化時に抽出不可能な ECDSA P-256 鍵ペアを生成
  
* トークン交換と API リクエストに DPoP プルーフを付加
  
* `crypto.subtle` がない環境では Bearer モードにフォールバック
  
* トークン交換と API リクエストの両方で `use_dpop_nonce` リトライを自動的に処理
  
* WebSocket 接続は接続後の `dpop_bind` メッセージをプルーフ検証に使用

利用可能なすべてのメソッドについては、完全な SDK API リファレンスを参照してください。

#### DPoP と HTTP キャッシュの相互作用 (#1052)

DPoP は HTTP キャッシュフローの 3 つのポイントに関わります:


1. **`Vary` における DPoP プルーフ JWT** — いいえ。プルーフにはリクエストごとの `jti` と `iat` が含まれているため、`Vary` に追加するとすべてのリクエストがキャッシュミスになります。`Authorization` 内のバインドされたアクセストークンが重要なキャッシュキーの次元であり、プルーフは別途検証され、ボディコンテンツに影響しません。
   
2. **`304 Not Modified` における `DPoP-Nonce`** — はい、パススルーされます。キャッシュコントロールミドルウェアは 304 レスポンスヘッダー(`evaluateConditionalRequest`)で `DPoP-Nonce` をホワイトリストに登録します。サーバーが nonce をローテーションする場合、`304` でも最新の nonce が配信されるため、クライアントが遅れることはありません。このパススルーがない場合、`304` を受信したクライアントは古い nonce で再試行し、次のリクエストで `401 + use_dpop_nonce` に遭遇します。
   
3. **DPoP 認証の失敗** — 古い、または欠落している DPoP プルーフは、`evaluateConditionalRequest` が実行される前に `requireAuth` で拒否されます([ポリシー伝播遅延](#policy-propagation-delay--http-cache-integrity-1050) のハンドラー順序を参照)。古い `If-None-Match` が以前の有効なセッションから `304` を復活させることはできません — レスポンスは `401` であり、決して `304` ではありません。

セキュリティモデルについては SECURITY.md — DPoP & Cache Integrity を参照してください。

#### パスワードログインセッションバインディング (`POST /auth/dpop-bind`

)

上記の DPoP フローは **API キー**交換(`/oauth/token`)を通じて取得されたトークンをバインドします。これは SDK がデータプレーンアクセスに使用するパスです。**人間の管理者**がメール/パスワードでサインインする管理コンソールはこのパスを通りません — `POST /auth/login` は通常の Bearer セッショントークンを発行します。そのセッショントークンを保護するため(例: ブラウザストレージからの XSS 盗難に対して)、セッションは `POST /auth/dpop-bind` を介して DPoP 送信者制約トークンにアップグレードできます。

API キーフローとは異なり、Proof-of-Work は不要です(ユーザーはすでにパスワードで認証済み)。リプレイ保護は同じ `DPoP-Nonce` ハンドシェイクを再利用します。

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

注意:


* DPoP バインド済みアクセストークンは `Authorization: Bearer` スキームで使用**できません** — `requireAuth` は `cnf.jkt` トークンが Bearer として提示された場合、`401` で拒否します。
  
* クライアント鍵ペアは抽出不可能(`extractable: false`)にし、IndexedDB に永続化することで、リロード後も存続しながら注入されたスクリプトによるエクスポートを防ぐ必要があります。トークン値自体は `localStorage` に残すことができます: 一度バインドされると、盗まれたトークンは秘密鍵なしでは役に立ちません。
  
* これはファーストパーティ管理コンソール(例: geonicdb-console)を対象としています。サードパーティアプリの場合は、上記で説明したスコープ付き API キー + DPoP モデルを推奨します。

***

## OAuth 2.0 M2M 認証

GeonicDB は、OAuth 2.0 Client Credentials フローを介したマシン間 (M2M) 認証をサポートしています。

### 概要

OAuth 2.0 Client Credentials フローは、サーバー間通信やバックグラウンドジョブなどのマシン間 (M2M) シナリオに最適化された認証方法です。

### OAuth 2.0 を使用するタイミング


* **マシン間通信**: API 間の呼び出し
  
* **バックグラウンドジョブ**: ユーザーの操作なしのバッチ処理
  
* **サービス間統合**: マイクロサービス間の認証
  
* **CI/CD パイプライン**: 自動デプロイメントおよびテストにおける API アクセス
  
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

ユーザーは管理者権限なしで独自の OAuth クライアントを作成および管理できます。セルフサービスを介して作成されたクライアントは、ユーザーにスコープされ、ロールベースの制限の対象となります。

| Endpoint                                         | Method | Description                       |
| ------------------------------------------------ | ------ | --------------------------------- |
| `/me/oauth-clients`                              | POST   | Create own OAuth client           |
| `/me/oauth-clients`                              | GET    | List own OAuth clients            |
| `/me/oauth-clients/{clientId}`                   | PATCH  | Update own OAuth client (partial) |
| `/me/oauth-clients/{clientId}`                   | DELETE | Delete own OAuth client           |
| `/me/oauth-clients/{clientId}/regenerate-secret` | POST   | Regenerate own client secret      |

**制限事項:**

* ユーザーあたり最大 **5 クライアント**
  
* `policyId` はオプションです — 指定された場合、参照されるポリシーは既に存在し、同じユーザーによって作成されている必要があります。省略された場合、認可はテナントポリシー + ロールのデフォルト (`user` のデフォルトは GET のみの Permit) にフォールバックします
  
* `clientSecret` は作成時と再生成時にのみ返されます — 安全に保存してください

**PATCH で更新可能なフィールド** (`PATCH /me/oauth-clients/{clientId}`):

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

`POST /oauth/token` は **クライアント IP** ごとおよび **`client_id`** ごとにレート制限され、`client_id+client_secret` ペアのオフラインブルートフォースを防ぎます。

| Bucket          | Per minute | Per hour | Per day | Burst |
| --------------- | ---------: | -------: | ------: | ----: |
| Per IP          |         20 |      100 |     500 |     5 |
| Per `client_id` |         10 |       60 |     200 |     2 |

両方のバケットがリクエストを許可する必要があります。いずれかを超えると `429 Too Many Requests` が `Retry-After` ヘッダーとともに返されます。同じ IP ごとのスキームは `/auth/refresh` と `/auth/nonce` も保護します(`PUBLIC_RATE_LIMIT` の `auth` カテゴリ)。完全な設定については、[QUOTAS.md — Public (Unauthenticated) Endpoint Rate Limit](../saas/quotas.md#public-unauthenticated-endpoint-rate-limit-1075) を参照してください。

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

> **スコープ階層**: `write:X` は `read:X` を **意味しません** — スコープは独立しています。これにより、公開お問い合わせフォームなどの書き込み専用のユースケースが可能になります。`admin:X` は `read:X` と `write:X` の両方を意味します。`admin:*` スコープを持つ OAuth トークンは Admin API にアクセスでき、通常の JWT ロールベース認証をバイパスします。通常の JWT トークン(`scope` フィールドなし)は、後方互換性のためスコープチェックをスキップします。
>
> **セルフサービスのロール制限 (`/me/oauth-clients`)**: ユーザーは自分のロールで許可されたスコープのみをリクエストできます。`user` はリソーススコープのみをリクエストできます。`tenant_admin` はさらに `admin:tenants` を除く `admin:*` スコープをリクエストできます。`super_admin` はすべてのスコープをリクエストできます。

***

## OIDC 外部 IdP 認証

GeonicDB は OIDC(OpenID Connect)に準拠した外部 IdP による認証をサポートしています。

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
   
3. GeonicDB は OIDC Discovery + JWKS 経由で署名を検証します
   
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

`/admin/policies`、`/me/policies`、および MCP `admin` ポリシー形状の書き込みパス Zod 上限(信頼できる情報源:`src/config/defaults.ts` 内の `SECURITY.MAX_POLICY_*`):

| Dimension                                          | Cap                                  |
| -------------------------------------------------- | ------------------------------------ |
| `rules`                                            | `MAX_POLICY_RULES` (10)              |
| `target.subjects` / `resources` / `actions` (each) | `MAX_POLICY_TARGET_MATCHES` (15)     |
| `conditions` per rule                              | `MAX_POLICY_CONDITIONS_PER_RULE` (5) |

これらは**配列アイテム数**制限です。個別の文字列 `.max()` 制限は Zod の UTF-16 コードユニットセマンティクスを使用します。これらは `MAX_AUTHENTICATED_CONTROL_PLANE_REQUEST_BODY_BYTES`(1 MiB UTF-8)とバイトアラインされて**いません**。マルチバイトペイロードは Zod 上限内に留まりながら、依然として 1 MiB を超える可能性があります — HTTP ボディ上限が `/me`/`/admin` の絶対的なセーフティネットとして残ります。

\*\*破壊的変更の非対称性:\*\*上限を上げることは非破壊的です。**下げることは破壊的**です。PDP 評価は保存されたポリシーを Zod を通じて再検証しないため、サイズ超過のドキュメントは承認を続けますが、完全な形状を再送信する `PATCH`/`PUT`/`POST` は **400** を返します。

**15 マッチのエビデンス (#2712):**部分的なステージング Admin API サンプル(1 つの可視テナントのみ)では `resources` 最大値が **9** でした。15 は 1.67× のマージンです。他のすべてのテナントおよびグローバル(`tenantId: null`)ポリシーは測定されて**いません** — 以下の監査を実行した後にデプロイしてください。

\*\*デプロイ前監査(読み取り専用)。\*\*編集不可能になるポリシーにフラグを立てます:

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

> \*\*`policyId` / `policySetId` 命名 (#1628)。\*\*クライアント提供の ID には URL エンコードを必要とする文字(非 ASCII、スペース、`%`)が含まれる場合があります。そのようなポリシーをアドレス指定する際にはパス内の ID をパーセントエンコードしてください — API Gateway は `event.path` をパーセントエンコードして配信し、サーバーは正確に 1 回デコードします。したがって、二重エンコードされたセグメントは単一エンコードされた値に解決され(`a%2520b` は文字通り `a%20b` という ID を持つポリシーをアドレス指定します)、不正なエスケープ(`a%b`)は `400` を返します。文字通り `%` を含む ID は以前は生の形式でアドレス指定可能でしたが、現在は二重エンコードする必要があります(`50%-rule` は `50%25-rule` としてアドレス指定されます)。有効なエスケープではない生の `%` は、解決される代わりに `400` を返すようになりました。作成時に返される `Location` ヘッダーは既にパーセントエンコードされているため、それをそのまま追跡することは機能しますが、以下にリストされる 2 つの ID 形状を除きます。
>
> 2 つの ID 形状は API を通じて到達不可能なままであり、避けるべきです:
>
> * `/` を含む ID(`policyId` と `policySetId` の両方)— ルートパターンは単一のパスセグメント(`[^/]+`)にマッチし、API Gateway がパス内の `%2F` を正規化する方法は環境依存です。
> * 正確な `policyId` `import` — `POST /admin/policies/import` が `/admin/policies/{policyId}` ルートをシャドウします。(任意の 1 文字をパーセントエンコードする、例えば `%69mport` は、`{policyId}` ルートにフォールスルーし、到達します。)この衝突は `policyId` に固有です。`policySetId` には `import` ルートがないため、`import` の `policySetId` は到達可能です。
>
> `policyId` と `policySetId` は現在、長さのみ(最大 256 文字)で検証されており、文字クラスでは検証されていません。

### ターゲット マッチング セマンティクス

`subjects`、`resources`、`actions` 配列内:

* **同じ `attributeId`**: OR (いずれかのマッチで満足) — 例: `[{method: POST}, {method: PATCH}]` は POST **または** PATCH にマッチ
  
* **異なる `attributeId`**: AND (すべてマッチする必要がある) — 例: `[{role: user}, {userId: u1}]` は両方が必要
  
* **カテゴリ間** (`subjects` + `resources` + `actions`): AND

**省略または空の `subjects` / `resources` / `actions`**: そのカテゴリはスキップされ、そのカテゴリの**すべての**リクエストにマッチします。これは XACML 3.0 の空 `<Target/>` セマンティクス (`policy.pdp.ts` の `matchTarget`) です: `resources` / `actions` のみを持ち (`subjects` なし)、ポリシーは**正当な**リソースのみ / アクションのみのポリシーです — テナント内の**すべての** subjects (`anonymous` と `tenant_admin` を含む) に適用されます。空配列 (`"subjects": []`) は、フィールドを省略した場合と同じように扱われます。

#### subjects 省略の罠 (#2934)

カスタムポリシーは、**優先度グループごとの first-applicable** を使用してロールデフォルトと結合され、その後**グループ間の deny-overrides** が適用されます (適用可能な任意のグループからの Deny が勝ちます)。Deny を含むポリシーで `subjects` を省略すると、Deny はすべてのロールに適用され、ロールデフォルトの Permit をオーバーライドします — `tenant_admin` を含みます。

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

上記のポリシーでは、`tenant_admin` POST は拒否されます: カスタムポリシーがマッチし (`subjects` フィルタなし)、`deny-others` が発動し、グループ間の deny-overrides が `tenant_admin` デフォルトの Permit に勝ちます。修正: ポリシーがプリンシパルのサブセットを対象とする場合は、常に `subjects` を設定してください。例: `[{"attributeId": "role", "matchValue": "api_key"}]`。

[docs/customer/QUICKSTART.md](./customer/QUICKSTART.md) (MCP / DPoP ポリシーレシピ) および [INSTRUCTION.md appendix D.2](./customer/INSTRUCTION.md) も参照してください。

#### 作成時 API 警告なし (#2934)

GeonicDB は、ポリシー作成/更新時に `subjects` が省略された場合、警告フィールドやヘッダーを**返しません**。理由:


1. **リソースのみ / アクションのみのポリシーは有効な XACML です** — 作成時の警告は意図的な形状で発動し、オペレーターがそれを無視するように訓練することになります。
   
2. 警告ボディフィールドまたはヘッダーを追加することは、**パブリック API サーフェス変更**です; 優先度 Low のドキュメントは、静的解析では見えないランタイムデータの落とし穴に適した層です (#2921)。
   
3. リポジトリ内にソフト警告を表示する Admin UI はありません; Admin API が引き続き書き込みパスです。

`subjects` を必須に**しないでください** — それは正当なリソースのみ / アクションのみのポリシーを壊すことになります (破壊的変更)。

### Match 関数 (GeonicDB 拡張を含む)

ポリシーの Target 内の AttributeMatch で利用可能な `matchFunction` 値:

| matchFunction   | Description                              | XACML 3.0                        |
| --------------- | ---------------------------------------- | -------------------------------- |
| `string-equal`  | Exact match (default)                    | Standard                         |
| `string-regexp` | Regular expression match                 | Standard (`string-regexp-match`) |
| `glob`          | Glob pattern match (`*`, `**` supported) | **GeonicDB extension**           |

**自動 glob 検出 (GeonicDB 拡張)**: `matchFunction` が省略された場合、`matchValue` に `*` が含まれていれば自動的に `glob` として処理されます。そうでなければ `string-equal` が適用されます。

**XACML XML エクスポート**: `glob` は XACML 3.0 仕様に存在しないため、エクスポート時には正規表現に変換され、`string-regexp-match` として出力されます。

#### `string-regexp` パターン制約 (#1935)

`string-regexp` の `matchValue` は**書き込み時に**検証されます — `POST/PATCH/PUT /admin/policies`、`POST /admin/policies/import` (XACML XML)、`/me/policies`、およびポリシーセットエンドポイントにおいて。次の場合、パターンは **400** で拒否されます:


* **200 文字**を超える場合、
  
* 空または空白文字のみを含む場合、
  
* 構文的に有効な正規表現ではない場合、
  
* `(a+)+` のようなネストされた量指定子を含む場合 (ReDoS リスク)、
  
* 10 個を超える選択肢または 5 個を超える後方参照を含む場合。

> これらの制限は **GeonicDB 拡張**であり、XACML 3.0 の要件ではありません。仕様が定義しているのは、以下の評価時の動作 (評価エラー時の `Indeterminate`) です。

パターンが**評価時に**評価不可能であることが判明した場合、XACML 3.0 §7.6 (Target 評価) に従い、マッチは「決してマッチしない」ではなく **`Indeterminate`** として評価されます。`Indeterminate` は Rule (§7.11) および Policy (§7.12) に伝播し、最終的に**フェイルクローズとして `Deny`** に解決され、リストクエリの行フィルタ (policy-to-filter) は同じリクエストに対して「読み取り可能な行なし」(403) に劣化します。

評価時の `Indeterminate` に到達する状況は 2 つあります:


1. **`${subject.*}` テンプレート展開**が評価不可能なパターンを生成する場合 (書き込み時の検証は*展開前*の文字列のみを検査できます)。
   
2. **書き込み時検証が存在する前に保存されたポリシー**、またはサービス層をバイパスするパスで書き込まれたもの (例: `scripts/backup-import.ts` は生の `insertMany` でドキュメントを復元します)。既存のドキュメントに対してマイグレーションは実行されません — 評価時の `Indeterminate` がそれらをカバーします。

> 評価不可能なパターンを「決してマッチしない」として扱うことは、`Permit` ルールに対してはフェイルクローズですが、**`Deny` ルールに対してはフェイルオープン**です — 拒否が暗黙的に適用されなくなります。`${subject.*}` テンプレートは、展開後のパターンが 200 文字制限内に収まるよう十分に短く保ってください。

### 暗黙的なポリシー階層

GeonicDB は次の暗黙的なポリシーを適用します (DB ルックアップをスキップ):

| Priority             | Role           | Behavior                                            |
| -------------------- | -------------- | --------------------------------------------------- |
| Custom policies (0+) | any            | Custom XACML policies always override defaults      |
| 0                    | `super_admin`  | Management APIs always Permit. Data APIs Deny (403) |
| 0                    | `tenant_admin` | Always Permit (all APIs within own tenant)          |
| -1                   | `user`         | GET → Permit, all other methods → Deny (readonly)   |
| -2                   | `api_key`      | All Deny (explicit Permit policy required)          |
| -3                   | `anonymous`    | All Deny (explicit Permit policy required)          |

> **重要**: カスタム XACML ポリシー (優先度 0 以上) は常にロールデフォルトを上書きします。`user` に書き込みアクセスを付与するには、優先度 ≥ 0 の Permit ポリシーを作成してください。
>
> **同順位の場合**: 優先度が等しい場合、決定論的な結果を得るため、ポリシーは `policyId` の辞書順で評価されます。テナントカスタムポリシー (DB に保存) はロールデフォルトと結合され、一緒にソートされます。

### リソース属性

ポリシー Target 内の `resources` で利用可能な属性は次のとおりです:

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

> **注記**: `entityId` はエンティティレベルの認可チェック (`requireEntityAuthz` 経由) でのみ利用可能です。`entityOwner` と `scope` はエンティティレベルのチェックで利用可能であり、**#1369 以降、リスト読み取りクエリでの行レベルフィルタとしても機能します** — [ポリシーからフィルタへのクエリ書き換え](#policy-to-filter-query-rewriting-for-list-queries-1337--1369) を参照してください。`entityType` は HTTP リクエストからパスレベルで自動的に抽出されます — `?type=` クエリパラメータまたはリクエストボディの `type` / `@type` フィールドから。**ID によるエンティティルート (`/entities/{id}` およびその下) では、DB に保存された実際の `entityType` を使用してエンティティレベルで認可が強制されます** (#1324) — クライアントが提供する `?type=` パラメータは検索フィルタとしてのみ使用され、認可属性としては決して使用されません。[ID によるルートのエンティティレベル認可](#entity-level-authorization-for-by-id-routes-1324-1336) を参照してください。NGSIv2 の `servicePath` は**解決された `TenantContext`** (`extractTenantContext`) から取得され、すでに CADDE `x-cadde-options` オーバーライドが適用されています — PIP は HTTP パス上で生の `Fiware-ServicePath` ヘッダーを再読み込み**しません** (#1862; キャッシュキーの #1835 と同じクラス)。パスレベルとエンティティレベルの両方のチェックで利用可能 — 階層的なパスマッチングのための glob パターン (例: `/opendata/**`) をサポートします。**NGSI-LD リクエストでは、`servicePath` は常に `/` として評価されます** (#1323): NGSI-LD 仕様 (ETSI GS CIM 009) には `Fiware-ServicePath` 概念がなく、テナントミドルウェアはそれを `/` に正規化し、データ層はすべての NGSI-LD エンティティを `servicePath: '/'` として保存します。生のヘッダー値を認可リクエストに注入すると、データアクセスが完全に無視している間に呼び出し元が自分の認可属性を選択できてしまいます — したがって servicePath ベースのポリシーは **NGSI-LD では分離境界として使用できません**。NGSI-LD で階層ベースの制御を行うには、代わりに `scope` 属性 (エンティティレベル) を使用してください; テナント内のプロジェクトレベルの分離には、`entityType` / `entityId` 制約を使用してください。`scope` はエンティティレベルにおける NGSI-LD の NGSIv2 `servicePath` に相当します — エンティティが複数のスコープ値 (例: `["/Madrid/parks", "/Madrid/gardens"]`) を持つ場合、それらはカンマ区切りの文字列として結合され、`string-regexp` または `glob` でマッチングされます。**サブスクリプション書き込み** (`/ngsi-ld/v1/subscriptions`、`/ngsi-ld/v1/csourceSubscriptions` および `/v2/subscriptions` への `POST`/`PATCH`、#1104 / #2005): リテラル `body.type === "Subscription"` は `entityType` に注入**されません** — 代わりに、PIP は `entities[]` (NGSIv2: `subject.entities[]`) から**サブスクリプションターゲット**を、`notification.endpoint.uri` (NGSIv2: 設定された通知チャネルの `url`) から**通知先**を抽出します。`PATCH` では、属性は**更新後の有効値** (宣言値、そうでなければ保存された値) で解決されます。`entities[]` に複数の要素が含まれる場合、要素ごとに 1 つの AuthzRequest が構築され、リクエストが成功するには**それらすべてが Permit でなければなりません** (all-Permit セマンティクス)。これにより、タイプベースのポリシー (「匿名は `ActivityLog` のみサブスクリプションライブ可能」) と URI ベースのポリシー (「サブスクリプションは `https://*.example.com/**` にのみ通知を投稿可能」、SSRF / データ流出に対する防御) を記述できます。以下の [サブスクリプション PIP 属性](#サブスクリプション-pip-属性) を参照してください。**バッチ操作** (`POST /ngsi-ld/v1/entityOperations/*`、`POST /v2/op/update`): ボディ内の**各エンティティタイプごと** (削除: エンティティ ID ごと) に 1 つの AuthzRequest が構築され、同じ all-Permit セマンティクスが適用されます — [バッチ操作の認可](#batch-operation-authorization-1325) を参照してください。**`/custom-data-models` — `tenantService` はヘッダーではなくアクターから取得されます** (#2215): このルートは `actor.tenantId` をキーとする管理 API であるため、ハンドラーは意図的に `checkTenantAccess` (呼び出し元のテナントに `Fiware-Service` ヘッダーを紐付けるチェック) をスキップします。したがって、このルートではヘッダーは**検証されません**。それを PDP に渡すと、呼び出し元が自分の認可属性を選択できてしまいます: `tenantService` を条件とする **Deny** は暗黙的にマッチしなくなり (認可バイパス)、`tenantService` を条件とする **Permit** はマッチしなくなります (過剰な拒否)。代わりに、PIP には `actor.tenantId` から解決されたテナントが渡されるため、`tenantService` ポリシーは他のすべてのルートと同じように動作します。テナントを持たないプリンシパル、または解決不可能な `tenantId` は、属性が欠落した状態で評価されるのではなく、**403** で拒否されます (フェイルクローズ)。**どのロールも例外ではありません** — `super_admin` もアクターから解決されます。実際の `super_admin` はこのルートにまったく到達できず (優先度 -1 の上書き不可能な deny-fence が `/custom-data-models/**` を拒否)、`AUTH_ENABLED=false` 時に使用される合成 `super_admin` はテナントを持たないため、そのロールに対するヘッダーフォールバックは、成功しないパスに検証されていない入力を再導入するだけです。**このルートでは `servicePath` は `/` に固定されます** (#2221): カスタムデータモデルは servicePath で全く分割されておらず、ルートは決して `Fiware-ServicePath` を読み取らないため、生のヘッダーを認可リクエストに残すことは、呼び出し元に 2 番目の自己選択属性を渡すだけです — 上記の `tenantService` と同じフェイルオープンの形状ですが、1 次元上です。したがって、`servicePath` を条件とするポリシーは、ここでは常に `/` に対して評価され、ヘッダーを変更することで回避することはできません; このルートでは分離境界として使用できませんが、理由は逆です (値は固定されており、呼び出し元が選択するものではありません)。

### パスレベル vs エンティティレベルの認可

GeonicDB は 2 段階の認可モデルを使用します。両方の段階で XACML 評価を使用し、#1324 以降**両方ともフェイルクローズ**です。同じ実施ポイントは MCP および A2A ツールエンドポイントもカバーします — [MCP / A2A ツール認可](#mcp--a2a-tool-authorization-1610--1651--1672) を参照してください。

| Stage               | Middleware                                          | Triggered when                                                                                            | Non-Permit behavior                                                                                          |
| ------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Path-level          | `requireAuthz()`                                    | Every authenticated request, except by-id entity routes and list reads (which delegate to the rows below) | `Deny` / `NotApplicable` / `Indeterminate` → **403 (fail-closed)**                                           |
| Entity-level        | `requireEntityAuthz()` (via `checkEntityOwnership`) | By-id entity routes — path-level is skipped and this is the single enforcement point (#1324)              | `Deny` / `NotApplicable` / `Indeterminate` → **403 (fail-closed)**                                           |
| List-level          | `requireListReadAuthz()`                            | List read queries (#1337/#1369)                                                                           | Derived row filter: `unrestricted` → no filter, partial → only readable rows, `none` → **403 (fail-closed)** |
| Subscription-update | `requireSubscriptionUpdateAuthz()`                  | `PATCH` on a subscription by id — path-level is skipped and this is the single enforcement point (#2005)  | `Deny` / `NotApplicable` / `Indeterminate` → **403 (fail-closed)**                                           |

#### パスレベルがフェイルクローズである理由

適用可能なポリシーがない場合、リクエストは拒否されなければなりません。そうでなければ、権限のないユーザーが、ポリシーが明示的に許可していないあらゆるパスを呼び出せてしまいます。デフォルトのロールポリシー(`__default_user`、`__default_api_key` など)は、パス段階が常に少なくとも 1 つの適用可能なルールを持つことを保証します。

#### エンティティレベルもフェイルクローズ (#1324)

エンティティレベルの評価は歴史的にフェイルオープンでした。パス段階が既に許可を生成しており、この段階は**追加の**制約(オーナーのみ、スコープベース)のみを適用するという前提に基づいていました。その前提は、by-id エンティティルートが**パスレベル PEP をスキップ**し、エンティティレベルを唯一の実施ポイントとして委譲し始めたときに崩れました — そこでの `NotApplicable` は、追加制約の欠落ではなく、不正アクセスになります。#1324 以降、`requireEntityAuthz()` は `Deny`、`NotApplicable`、および `Indeterminate` のいずれも `403` で拒否します([by-id ルートのエンティティレベル認可](#entity-level-authorization-for-by-id-routes-1324-1336) も参照)。MCP / A2A の合成イベントチェックは同じ実装を再利用するため、同じフェイルクローズ動作を継承します。

これはテナントに対して、CRUD を機能させ続けるためだけにエンティティをターゲットとしたポリシーを書くことを強制するものではありません。決定的なデフォルトを持つロール(`user`、`tenant_admin`、`super_admin`)は、常にデータ API で許可または拒否を生成し、`NotApplicable` には到達しません。空ルールデフォルトを持つプリンシパル(`api_key`、`anonymous`、`oauth_client`)のみが `NotApplicable` にフォールスルーし、それらにとってはクローズが正しい答えです(ポリシーなし = アクセスなし)。

**結果**: 属性ベースのきめ細かい制御(例:「ユーザーは自分が作成したエンティティのみを変更できる」)には、ロールデフォルトより上の優先度で**明示的な拒否ルール**が必要です — そうでなければ、ロールデフォルトの許可がエンティティレベルでも適用されます。

#### 例: オーナーのみの更新実施

`PATCH /v2/entities/{id}/attrs` をエンティティオーナーに制限するには、明示的な拒否を記述します:

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

WebSocket サブスクリプションとブロードキャストは、`GET` のサブセットである**読み取り専用ストリーム**として評価されます。`authorizeWs()` PIP (`src/core/auth/policy/policy.pip.ts`) は、各 WebSocket リクエストを**2回**評価します — 1回は `action.method = 'WS'` で、もう1回は `action.method = 'GET'` で — そして**両方**の評価が `Permit` を返す場合にのみアクセスを許可します。

#### 読み取りフレームは `/ngsi-ld/v1/entities` です (#2284)

両方の評価は `resource.path = /ngsi-ld/v1/entities` を持ちます。WebSocket は **NGSI-LD リーダー**です:配信されるイベントは NGSI-LD 正規化され、サブスクリプションの `@context` で圧縮されます (#2026 / #2044)、`entityTypes` セレクターはその `@context` で正規化されます (#2055)、そして #2284 以降、NGSI-LD エンティティの変更のみがブロードキャストされます (参照: [EVENT\_STREAMING.md](../features/subscriptions.md#websocket-is-an-ngsi-ld-reader-2284))。フレームは、同じプリンシパルが HTTP 経由で使用する読み取りパスと一致する必要があります — フレームをカバーしない `path` グロブはターゲットセットから完全に外れ、`Permit` を提供しないため、これが PR #2204 で正当なリクエストが `kind: 'none'` に崩壊するのを測定した方法です (#2205)。

\#2284 まで、フレームは `/v2/entities`、つまり **NGSIv2** 読み取りパスでしたが、同じソケット上の表現とマッチングは NGSI-LD でした。これを移動することから2つのことが続き、それらは意図的に一緒に出荷されています — 配信フィルターのみまたはフレームのみを変更すると、#2205 の事故が再現されます:


* **`/v2/**` のみにスコープされたカスタムポリシーに対する破壊的変更。** そのようなルールは WebSocket リクエストをターゲットにしなくなり、サブスクリプションライブは拒否されます。ロールのデフォルト (`user`、`tenant_admin`) は `/v2/**` と `/ngsi-ld/**` の両方を許可するため、影響を受けません。同じサブジェクトに対して `/ngsi-ld/**` (または `/ngsi-ld/v1/entities`) に一致するルールを追加し、`entityType` / `entityOwner` / `scope` の条件を変更しないことで修正してください。
  
* **フォールバックではなく、移行診断。** 新しいフレームの下で `subscribe` が拒否されると、`authorizeWs()` は `/v2/entities` の下でそれを再評価し、*それ*が許可していた場合 (`WS` と `GET` の両方)、ロール、ポリシー ID、エンティティタイプとともに `WS_AUTHZ_FRAME_MIGRATION_REQUIRED` を `WARN` でログに記録します。決定は `Deny` のまま — レガシーフレームを受け入れると、NGSIv2 読み取りに制限されたプリンシパルが NGSI-LD エンティティを受信できるようになり、これは閉じられている境界です。追加の評価はサブスクリプションライブ時にのみ実行されます; イベントごとの配信拒否はそれに対して支払わず、ログに記録しません。診断内の失敗は飲み込まれます:観測は決して決定された `Deny` を拒否されたプロミスに変えてはなりません。

##### フレームの変更は両方向に作用します — 制限ポリシーは `/ngsi-ld/**` をターゲットにする必要があります

ターゲットマッチングは異なる `attributeId` 間で AND を取るため、`path: /v2/**` を `entityType: X` とペアにするポリシー — #2284 以前に書かれたすべての**制限する** WebSocket ポリシーの形状 (下記の `ws-self-only-feed` の例を含む) — は新しいフレームの下で `NoMatch` → `NotApplicable` になります。`NotApplicable` グループはグループ間の `deny-overrides` の組み合わせの前にドロップされるため、残るのはロールのデフォルト (`__default_user` / `__default_tenant_admin` は `/ngsi-ld/**` を許可) です:**制限が消え、ソケットはテナント内のそのタイプのすべてのエンティティを受信し始めます。** PR #2324 で `ws-self-only` フィクスチャを使用して測定 — サブスクリプションライバーは別のユーザーによって作成されたエンティティを受信しました。

したがって、フレームの移動には2つの方向があり、そのうちの1つだけが拒否です:

| Legacy policy intent                                                     | New frame alone                                                                 |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| **Grant** WS (`Permit` under a `/v2/**` glob)                            | falls out of target → denied (diagnosed by `WS_AUTHZ_FRAME_MIGRATION_REQUIRED`) |
| **Restrict** WS (`Deny` / trailing `default-deny` under a `/v2/**` glob) | falls out of target → **delivery widens**                                       |

拡大方向は認可の後退であるため、`authorizeWs()` はレガシー `/v2/entities` フレームの下で明示的な `Deny` を尊重する移行的なセーフティネットを持っていました。**そのセーフティネットは [#2326](https://github.com/geolonia/geonicdb/issues/2326) で削除されました**、移行が完了した後:レガシーフレームが実際に拒否されることは観察されませんでした (`WS_AUTHZ_LEGACY_FRAME_DENY` が発火することはなかった) ため、許可されたリクエストは現在 NGSI-LD フレーム単独で決定され、4回ではなく2回の PDP 評価のコストがかかります。

**したがって、`/v2/**` 単独にスコープされた制限ポリシーは、WebSocket 配信を制限しなくなりました。** 制限ポリシーを `/ngsi-ld/**` にスコープしてください — 上記の移行ノートを参照してください。`WS_AUTHZ_FRAME_MIGRATION_REQUIRED` 診断は、許可方向についてまだこれをカバーしています。

この不変条件は、ポリシー作成者にとって2つの実用的な結果をもたらします:


1. **`GET` を Deny するポリシーは自動的に `WS` も Deny します。** ルールで `WS` を繰り返す必要はありません; 2回目の評価は同じ Deny を拾います。
   
2. **`WS` 単独をターゲットとするポリシーは通常、設定ミスです。** 2回目の評価は `GET` にフォールバックするため、`WS` のみを拒否しても基礎となるデータは保護されません — クライアントは `GET /ngsi-ld/v1/entities/...` 経由でそれを読み取ることができます。逆に、`GET` も許可されていない場合、`WS` のみを許可することは意味がありません。

#### 不変条件が適用される場所:接続ではなく、サブスクリプションライブと配信 (#1271)

`authorizeWs()` (WS ⊂ GET) チェックは、API Gateway パス (`handlers/websocket/default.ts` サブスクリプションライブ、`handlers/websocket/broadcaster.ts` 配信) とローカルパス (`core/streaming/local-ws-server.ts`) の両方で、**サブスクリプションライブされた `entityType` ごと**に2つのポイントで実行されます:


* **サブスクリプションライブ** — クライアントが `{ "action": "subscribe", "entityTypes": [...] }` を送信すると、各タイプは `authorizeWs(..., { entityType })` で認可されます。ポリシーが許可しないタイプは拒否されます。
  
* **配信** — 各イベントがプッシュされる前に、接続はイベントの具体的な `entityType` (および `entityOwner`/`scope`) で再認可されます。許可されたイベントのみが配信されます。

**接続はデータ認可を実行*しません*。** `$connect` (API GW) とローカルアップグレードハンドラーは**認証とテナントマッチのみ**を検証します — `authorizeWs` を評価しません。これにより、単一の `entityType` にスコープされたキー (例:`entityType = PollVote` のみを許可するポリシー、タイプなしの `GET /ngsi-ld/v1/entities` は**なし**) が WebSocket を開き、そのタイプを受信できます。WS ⊂ GET の不変条件は保持されます。なぜなら、**サブスクリプションライブと配信でタイプごとの `authorizeWs` を通過しない限り、イベントは配信されない**からです — タイプに対して GET を持たないプリンシパルは、ソケットが開いていてもそのタイプのものを何も受信しません。

> **接続時の 403 は XACML ではありません (#2867)。** 本文 `"Access denied"` (「`"Access denied by policy"` ではない) による `$connect` 拒否は、**テナント解決が失敗した**ことを意味します (間違ったデプロイメント DB、テナント名の不一致、または不明な `?deployment=` ホスト名) — ポリシーの拒否ではありません。PDP/`authorizeWs` はサブスクリプションライブと配信時にのみ実行されます。専用デプロイメントは、共有 execute-api WebSocket URL で `?deployment=<registered-hostname>` を渡す必要があります (SDK は `GET /sdk/v1/streaming` が `deployment` フィールドを返す場合、これを自動的に追加します)。

`ip-range` やその他の `environment` ポリシー条件は、**データレイヤーで** WS に引き続き適用されます:接続時のソース IP は接続レコード (`sourceIp`) に保存され、サブスクリプションライブ/配信の `authorizeWs` 呼び出しに渡されるため、IP スコープのポリシーはそこで評価されます (接続時ではありません)。`sourceIp` が利用できない場合、それは存在しないものとして扱われ、`ip-range` 条件はクローズドで失敗します (拒否)。

> 何も受信できないプリンシパルの接続 (すべてのタイプが拒否) は、接続時には依然として受け入れられますが、事実上不活性です — イベントを受信しません。

#### 作成ガイダンス

特定のロール/テナントのストリーミングを制限したい場合は、`GET` に対してルールを記述してください (または `actions` を完全に省略して、ルールがすべてのメソッドに適用されるようにします)。ルールが*両方*に適用される必要がある場合にのみ `WS` を記載してください:

```json
{
  "actions": [
    { "attributeId": "method", "matchValue": "WS" },
    { "attributeId": "method", "matchValue": "GET" }
  ]
}
```

#### 検出

`PolicyService.validateWsGetSymmetry()` (#1085) は、ルールの `actions` に `method = 'WS'` (`string-equal`) が含まれているが、一致する `'GET'` エントリがない場合、`WARN` ログを発行します。これはすべての書き込みパスで実行されます:`createPolicy`、`updatePolicy`、`updatePolicySystem`、および `updatePolicyForUser` (セルフサービス `/me/policies` 更新を含む)。ポリシーは下位互換性を維持するために依然として受け入れられます — 警告はルールを再検討するシグナルです。

```text
[WARN] PolicyService — Policy rule 'ws-only-deny' targets method='WS' without an explicit 'GET'
counterpart. WebSocket authorization evaluates both WS and GET, so WS-only rules typically do not
restrict the data path that GET serves.
```

#### ブロードキャスト時のエンティティごとの属性 (#1107 / #1383)

WebSocket ブロードキャスター (`src/handlers/websocket/broadcaster.ts`、`src/core/streaming/local-ws-server.ts`) が接続に変更イベントを配信するかどうかを決定する際、次のエンティティごとの属性を AuthzRequest に注入します:

| attributeId   | Source                                                      | Use case                                                  |
| ------------- | ----------------------------------------------------------- | --------------------------------------------------------- |
| `entityType`  | `EntityChangeEvent.entity.type`                             | "Only forward `ActivityLog` events to clients"            |
| `entityId`    | `EntityChangeEvent.entity.id`                               | "Forward only `urn:ngsi-ld:Room:42` events"               |
| `entityOwner` | `EntityChangeEvent.entity.owner` (the entity's `createdBy`) | "Forward only events for entities the recipient owns"     |
| `scope`       | `EntityChangeEvent.entity.scope`, comma-joined (#1383)      | "Only forward events for entities scoped under `/public`" |

`entityOwner` 属性は、`${subject.userId}` テンプレート展開と組み合わせることで、単一の XACML ポリシーで**ユーザーごとの「自分のみ」配信フィルター**を表現できます:

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

> **キャッシュに関する注意**: ブロードキャスターは単一のブロードキャスト内で `(role, policyId, userId)` ごとに認可決定をキャッシュします — オーナーベースのポリシーは固定された entityType/entityOwner であってもユーザーごとの決定を生成するため、`userId` はキーに含まれている必要があります。同じ userId を持つマルチデバイスユーザーは、1 つのイベント内でキャッシュされた決定を共有します。
>
> **`entity.owner` のソース**: 変更イベントを公開する際に、共有の `buildChangeEventEntity()` ビルダー (#1383) を介して、`EntityService` (およびスナップショットクローンパブリッシャー、#1563) によって透過的に設定されます。AWS では、これは API 経由の書き込みに対する**唯一の**イベントパブリッシャーです (#1560 で MongoDB change-stream プロセッサーを削除しました。これは死んだ 2 つ目のパブリッシャーでした)。ローカル/スタンドアロンでは、インプロセスの Change Stream ウォッチャーがサブスクリプション/ルールに対して同じビルダーを使用し、一方 WebSocket はアプリパスから `emitEntityChange` に従います。これはエンティティの `createdBy` フィールド (`POST` 時に認証されたユーザーによって設定される) から取得されます — `createdBy` を持たないエンティティ (レガシー / バッチ / 認証されていない書き込み) は `owner` なしでイベントを発行し、その場合オーナーベースのルールはマッチせず、次のルールが適用されます。
>
> **TTL 有効期限削除はアプリ側スイーパー (#1561) を介して `EntityDeleted` を発行します。** MongoDB の TTL モニターは依然として `EntityService` の外部で物理的に削除しますが、`EntityExpiryService` が最初にソフト削除された行を要求し、`createEventPublisher()` を通じて公開します — 古い change-stream の `delete` ブランチが決して確実に運ばなかった、使用可能な `id` / `type` / `owner` / `scope` を含みます。[EVENT\_STREAMING.md](../features/subscriptions.md) および [QUOTAS.md](../saas/quotas.md#ttl-失効-expiresat-expiry-sweeper1561) を参照してください。
>
> **その他の EntityService バイパスパス (#1563)**: スナップショットクローンは `EntityCreated` / `EntityUpdated` を**発行します**。テナントカスケード削除および不正な geo 隔離は**発行しません** (フラッド / インフラ修復) — 決定はコードコメントおよび SECURITY.md / [EVENT\_STREAMING.md](../features/subscriptions.md) に記載されています。
>
> **ブロードキャスト時の `scope` (#1383)**: 保存されたエンティティの `scope` から設定され、エンティティレベルのチェックおよびリストクエリの行フィルター (#1369) と同じ**カンマ結合文字列セマンティクス**でマッチされます — 配信境界は、サブジェクトが `GET` リスト経由で読み取れる内容と同一です。スコープのないエンティティ (欠落 / `null` / `[]`) は `''` として評価されます。マルチスコープエンティティのサブツリーマッチングには、境界を意識した `string-regexp` パターン (例: `(^|,)/public(/[^,]*)?(,|$)`) を推奨します。

### サブスクリプション PIP 属性

サブスクリプションは **継続的な読み取り** であるため、ターゲットと送信先の制限は作成時だけでなく、すべての書き込み時に保持される必要があります。#2005 以降、PIP は **6 つのサブスクリプション書き込みセルすべて** をカバーし、それらすべてにおいてリテラル `body.type === "Subscription"` は意図的に `entityType` として公開 **されません**:

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

`?type=` はこれらのパスの認可属性として **決して** 使用されません:コントローラーはサブスクリプションが監視する対象を決定するためにそれも `body.type` も使用しないため、これを受け入れると呼び出し元が `?type=Public` を宣言しながら実際には `Secret` をサブスクリプションライブすることを許してしまいます。

#### 部分更新は更新後の有効値で評価されます(#2005)

`PATCH` は部分更新であるため、上記の属性は **「本文が宣言する値、それ以外の場合はすでに保存されている値」** として解決されます:


* 本文が `entities` (NGSIv2: `subject`) を宣言 → 宣言されたターゲットが評価されます(許可されたサブスクリプションを制限されたタイプに切り替えることはできません);
  
* 本文がそれらを省略 → **保存された** ターゲットが評価されます(説明または通知エンドポイントのみを変更することで、現在制限されているタイプをターゲットとするサブスクリプションを維持することはできません);
  
* どちらもターゲットを生成しない → 単一の空のターゲットが評価され、失敗クローズされます。

絞り込みは許可されます:制限されたタイプをターゲットとするサブスクリプションは、許可されたタイプに `PATCH` で変更できます。これは、更新後の値が評価されるためです。

保存された値が必要なため、`PATCH` セルはパスレベル PEP からコントローラー (`requireSubscriptionUpdateAuthz`) への決定を委譲します。これは、ID によるエンティティルートがエンティティレベルの認可に委譲するのと同じ方法です。保存されたタイプはすでに正規化されており、リクエストの `@context` に対して再正規化 **されません**。クライアントが宣言したタイプのみが再正規化されます(#1613)。

#### PEP はサブスクリプションコントローラーと同じ `@context` を解決します(#1657)

クライアントが宣言したタイプは評価前に正規化されるため(#1613)、PEP はコントローラーが保存する **同じ** アクティブな `@context` を選択する必要があります。そうでなければ、呼び出し元は制限されたタイプを許可されているように見える用語にエイリアスできます(「認可は `AliasType` を見て、ストレージは `SecretType` を見る」)。#1772 / #1924 以降、供給ルールは **1 つの** 場所 (`selectActiveContextRef`) で適用される条項 6.3.5 であり、コントローラーと PEP の両方で使用されます: `application/ld+json` は本文の `@context` を取り、`application/json` は `Link` ヘッダーを取り、両者を混在させると 400 になります。ルートごとの分岐が残っていないため、コントローラーがその `@context` ソースを変更しても PEP との同期が密かに外れることはありません。

`tests/e2e/features/auth/subscription-write-authz.feature` は、両方の供給形式についてこれを固定します:制限されたタイプの IRI にエイリアスされた用語は、ld+json 本文の `@context` 経由で到着しても、`application/json` の `Link` ヘッダー経由で到着しても拒否されます。

#### 複数エンティティの全 Permit セマンティクス

`entities[]` に複数の要素が含まれる場合、PEP は **要素ごとに 1 つの AuthzRequest を評価** し、リクエストは **すべての** AuthzRequest が `Permit` を返した場合にのみ許可されます。1 つでも `Deny` / `NotApplicable` / `Indeterminate` があれば、リクエスト全体が `403 Forbidden` にショートサーキットされます。これにより「最初の要素は問題なく見えるので、残りを忍び込ませる」バイパスを防ぎます:

```jsonc
// All elements must satisfy the policy. With a policy that permits only ActivityLog,
// this body is rejected because { type: "Building" } is not permitted.
{
  "type": "Subscription",
  "entities": [{ "type": "ActivityLog" }, { "type": "Building" }],
  "notification": { "endpoint": { "uri": "http://localhost:1028/notify" } }
}
```

#### 例:タイプベース + URI ベースの制御を組み合わせた場合

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

このポリシーは、サブスクリプションターゲットタイプが `ActivityLog` *かつ* 通知エンドポイントが `*.example.com` 上にある場合 *のみ* 許可します。`resources` 内の異なる `attributeId` は AND で結合されます([Target Matching Semantics](#target-matching-semantics) を参照)。

> **ポリシーターゲティングの注意**: `/ngsi-ld/v1/subscriptions` との完全一致で `path` に対して記述されたポリシーは、作成呼び出しのみをカバーします。更新もカバーするには、グロブ (`/ngsi-ld/v1/subscriptions**`) を使用してください — `*` は `/` を越えません。

### バッチ操作の認可 (#1325)

バッチ操作は単一のリクエストで複数のエンティティを運ぶため、単一の `entityType` ではリクエスト全体を表現できません。PIP はリクエストボディから**個別のエンティティタイプ**ごとに 1 つの認可ターゲットを抽出し、PEP はサブスクリプションと同じ **all-Permit セマンティクス**でそれらを評価します:すべてのターゲットが `Permit` を返さなければならず、そうでなければバッチ全体が `403 Forbidden` で拒否されます。

対象エンドポイント(すべて `POST`):

| Endpoint                                                                              | Body shape                        | Targets                                                                                                |
| ------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `/ngsi-ld/v1/entityOperations/create` / `upsert` / `update` / `merge`                 | Entity array                      | One per distinct `type` / `@type` (multi-type arrays supported)                                        |
| `/ngsi-ld/v1/temporal/entityOperations/create` / `upsert`                             | Entity array                      | Same as above                                                                                          |
| `/ngsi-ld/v1/entityOperations/delete`, `/ngsi-ld/v1/temporal/entityOperations/delete` | Entity ID (URI string) array      | One per distinct `entityId`, with `entityType` fixed to `""` (the type is unknown without a DB lookup) |
| `/v2/op/update`                                                                       | `{ actionType, entities: [...] }` | One per distinct `entities[].type`                                                                     |

例:`entityType: EVChargingStation` に対してのみ `POST` を許可するポリシーでは、`EVChargingStation` エンティティのみを含むバッチ upsert は成功しますが、単一の `Sensor` エンティティが混在するバッチは全体として拒否され、何も書き込まれません。

**フェイルクローズドルール**:


* タイプを判定できない要素(`type` がない、NGSIv2 の id のみの更新、非オブジェクト要素)、パース不可能なボディ、および `MAX_BATCH_SIZE` を超えるボディは、`entityType: ""` のターゲットとして評価されます。これはタイプ制約付き Permit ルールには決してマッチせず、`?type=` クエリパラメータはこれらのターゲットに対するフォールバックとして意図的に**使用されません**(そうしないと `?type=<allowed>` を追加することで制約をバイパスできてしまいます)。
  
* `path` / `method` のみを制約するポリシー(`entityType` マッチなし)は影響を受けません:これらは注入された `entityType` 値に関係なくマッチするため、制約のない API キーは以前と全く同じように動作します。
  
* **バッチ削除**のボディはタイプ情報を持たない ID 配列であるため、タイプ制約のみのポリシーはバッチ削除を許可できません。`entityId` ベースのルールを追加する(グロブパターンサポート、例:`urn:ngsi-ld:EVChargingStation:*`)か、代わりに単一エンティティの `DELETE` リクエストを使用してください。

> **注記 (#1325/#1337/#1369)**:読み取り側のバッチエンドポイント `POST /ngsi-ld/v1/entityOperations/query` および `POST /v2/op/query` は**リストレベル認可**によって処理されます:ポリシーセットから読み取り可能エンティティフィルタ(entityType / scope / entityOwner)が導出され、クエリに構成されます;宣言されたタイプは固定属性として組み込まれます(許可されていない宣言タイプは依然として 403 を生成します)— [ポリシーからフィルタへのクエリ書き換え](#policy-to-filter-query-rewriting-for-list-queries-1337--1369) を参照してください。
>
> **セットベースの削除(`purge`)もリストレベルです (#1679)**:`DELETE /ngsi-ld/v1/entities`(5.6.21 節)および GeonicDB 拡張 `POST /ngsi-ld/v1/entityOperations/purge` は、id セットではなく*述語*によってターゲットを選択するため、上記の all-Permit バッチ評価は適用されません。両方とも同じ読み取り可能エンティティフィルタ(entityType / scope / entityOwner)を導出し、削除クエリに構成するため、**サブジェクトが削除を許可されていない行は述語から除外され存続します**;削除可能な行を全く持たないサブジェクトは `403` を取得します。パスレベルのボディ抽出(`type`)だけでは*不十分*です — これはクライアントが宣言したタイプのみを参照し、保存された `scope` / `entityOwner` は決して参照しません。同じ配線が、コントローラーをバイパスする非 HTTP エントリポイントにも適用されます:MCP `batch` ツール(`action: "purge"`)および A2A `batch` スキル(`action: "purge"`)。
>
> **例外 — 宣言されたタイプが単一の権威ある操作タイプでない場合、折り込まれ*ません* (#1653/#1656/#2061)**:**NGSIv2 `POST /v2/op/query`** では、実際にマッチするタイプはボディの `entities[].type` / `typePattern`(複数の仕様)に存在し、コントローラーは `?type=` / ボディトップレベルの `type` を無視します;また、リスト読み取りでの**カンマ区切り `?type=A,B`** はコントローラーによって要素ごとに分割されます。これらのいずれかを単一の固定属性として折り込むと、導出されたフィルタが `unrestricted` に崩壊します(その折り込まれた値が無条件に許可されている場合)が、コントローラーは*異なる*タイプセットをマッチさせます — デフォルト許可 + ポイント拒否ポリシーの下で禁止された行がリークします。これらのルートでは `entityType` は**自由変数**として保持され、導出された行レベル述語が代わりにすべての仕様にわたって強制されます。
>
> **ディスカバリルートは `?type=` を全く折り込みません (#2061)** — 単一のトークンでさえも。`GET /ngsi-ld/v1/types`、`/types/{typeName}`、`/attributes`、`/attributes/{attrId}`、`/v2/types` および `/v2/types/{typeName}` は、**パスパラメータ**(詳細)または**すべての読み取り可能エンティティ**(リスト)からマッチするものを決定します;これらのいずれも `?type=` を読み取りません。それを折り込むと、`?type=<readable>` が導出されたフィルタを `unrestricted` に崩壊させ、読み取り不可能なタイプの存在、`entityCount`、および属性名がリークします — #1370 が閉じたリークを再び開きます。その結果、これら 6 つのルートでの `?type=<denied>` は高速 `403` を生成しなくなりました:レスポンスは `?type=` なしの同じリクエストと同一です(行フィルタされた `200`、またはサブジェクトが読み取れないタイプの場合は `404`)。これが正しい結果です — ETSI GS CIM 009 はこれらの操作に対して `type` パラメータを定義していないため、古い `403` はコントローラーが決して参照しない値によって駆動された誤った拒否でした。`/ngsi-ld/v1/temporal/entities` および `/ngsi-ld/v1/entityMaps` は `?type=` を実際のマッチフィルタとして**使用します**(`params.type` → `typeList`)ので、折り込みを維持します。
>
> これら 6 つのルート以外では、単一の `?type=Denied`(カンマなし)は依然として折り込まれます(高速 `403`)。

### by-id ルートのエンティティレベル認可 (#1324、#1336)

**by-id エンティティルート** — `/ngsi-ld/v1/entities/{id}`(および `/attrs`、`/attrs/{attrName}`)、`/v2/entities/{id}`(および `/attrs`、`/attrs/{attrName}`、`/attrs/{attrName}/value`)、および**時系列 by-id ルート** `/ngsi-ld/v1/temporal/entities/{id}`(および `/attrs`、`/attrs/{attrName}`、`/attrs/{attrName}/{instanceId}`)  (#1336) — に対して、パスレベル PEP はスキップされ、**エンティティレベル認可が単一の強制ポイント**となります。データに触れる前に、コントローラーは DB からエンティティの実際の属性をロードし、以下で完全なポリシーセットを評価します:

| Attribute     | Source                                                                                                                                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entityType`  | **Actual type stored in the DB** — never the client-supplied `?type=` parameter (that is only a lookup filter). If the entity does not exist, `entityType` is evaluated as `""` (matches no type-constrained Permit rule). |
| `entityId`    | Path parameter                                                                                                                                                                                                             |
| `entityOwner` | `createdBy` of the stored entity                                                                                                                                                                                           |
| `scope`       | `scope` of the stored entity                                                                                                                                                                                               |

結果:


* **タイプ制約付きキーは by-id 操作で機能します。**`entityType: SalesTarget` に対して `GET` を許可するポリシーは、`GET /ngsi-ld/v1/entities/urn:ngsi-ld:SalesTarget:1` を直接許可するようになりました。#1324 以前はこれは常に拒否にフォールスルーしました(パスレベル評価には `entityType` がありませんでした)、回避策は URN プレフィックス `path` グロブルールでした — これらは依然として機能しますが、もはや必要ありません。
  
* **エンティティレベルの決定はフェイルクローズドです**:`NotApplicable` → `403`。決定的なデフォルトを持つロール(`user`、`tenant_admin`、`super_admin`)は影響を受けません(それらのデフォルトポリシーは常に決定を生成します);`api_key` / `anonymous` / `oauth_client`(空ルールデフォルト)に対しては、これが正しいクローズド動作です。制約付きキーの下での存在しないエンティティは `403` を生成します(存在は開示されません)。
  
* **`?type=` は認可属性を偽造できません。**`GET /entities/{sensorId}?type=AllowedType` は拒否されます:DB ルックアップ(宣言されたタイプでフィルタ)は何も見つけず、リクエストは `entityType: ""` で評価されます — クエリパラメータフォールバックはエンティティレベル評価に対して意図的に抑制されます(#1325 と同じバイパス防止)。
  
* 拒否フェンス(例:super\_admin データ API フェンス)は影響を受けません — エンティティレベル評価はパスレベルと同じポリシーセットを実行します。
  
* **時系列 by-id ルートは `entities` コレクションから認可属性をソースします** (#1336) — 時系列コレクションは owner/scope を保存しません。エンティティがそこにもはや存在しない場合(履歴を保持して削除された、または時系列 API のみを介して作成された)、owner と scope は利用できず、リクエストはそれらなしで評価されます。
  
* **その場合でも `entityType` は削除され*ません
* (#2157)。**これは時系列履歴自身の `metadata.entityType` から解決され、タイプレス評価**に加えて**評価されます(両方が Permit でなければなりません)、そのため `entityType` をターゲットとする Deny ルールは依然として**時系列のみ**のエンティティ(`entities` に文書はないが履歴を持つもの — `POST /ngsi-ld/v1/temporal/entities` の通常の結果で、これは決して `entities` に書き込みません、ただし scope を運ぶボディは例外で、#2434 A'-1 を介して 1 つを**実体化します**)にマッチします。#2157 以前は属性が単に存在せず、タイプ制約付き Deny ルールは `NoMatch` となり、デフォルト許可ポリシーは `GET /ngsi-ld/v1/temporal/entities/{id}`、MCP `temporal.get`、または A2A `temporal.get` を介して禁止された履歴を読み取りました — 一方で*リスト*ルートは同じ行を隠しました(これらは `entities` から導出された読み取り可能 `entityId` セットでフィルタされます)。このフォールバックは、フェイルクローズド方向でその読み取り/by-id 非対称性を閉じます;リストルートは意図的に**拡大されませんでした**。これはすべての時系列 by-id 操作(get / delete / attrs / instance)および時系列**バッチ**形式に適用されるため、`batch_delete` は by-id delete が拒否する行には到達できません(パリティ不変性)。1 つの id に対して複数の記録されたタイプがある場合、*すべて*が許可される必要があります。
  
* \*\*フォールバックは常により多く拒否するだけで、決して少なくはしません。\*\*タイプレスリクエストは解決されたタイプと並行して評価されるため、タイプを解決できなかったときに拒否されたサブジェクトは拒否され続けます:#1336 の意図的なフェイルクローズドルール — タイプ制約付きサブジェクトは、エンティティボディがもはや存在しない履歴には到達できない — はそのまま保持されます。(タイプレス評価を追加する代わりに置き換えると、そのケースを `403` から `200` へ静かに反転させました;`tests/e2e/features/auth/temporal-entity-authz.feature` で測定)。
  
* **時系列のみのエンティティの Owner / scope は評価不可能なままです** — 時系列コレクションはどちらも記録しないため、owner および scope 制約付きルールは依然としてそれらの行にバインドできません(#2157 では変更なし;以下の既知の制限を参照してください)。

### リストクエリのためのポリシーからフィルタへのクエリ書き換え (#1337 / #1369)

**リスト読み取りクエリ** — `GET /ngsi-ld/v1/entities`、`GET /v2/entities`、`POST /ngsi-ld/v1/entityOperations/query`、`POST /v2/op/query`、および (#1370 以降) 集約読み取り `GET /ngsi-ld/v1/types`、`GET /ngsi-ld/v1/attributes`、`GET /v2/types`、`GET /ngsi-ld/v1/temporal/entities` — に対して、パスレベルの PEP はスキップされ、**リストレベル認可** はサブジェクトの有効なポリシーセットから *読み取り可能エンティティ述語* を導出し、それを MongoDB フィルタに組み込みます (行レベルセキュリティ)。ページネーション、`NGSILD-Results-Count` / `Fiware-Total-Count`、およびリスト ETag はフィルタの後で計算されるため、常にサブジェクトが読み取れる内容と一致します。

導出は **`entityType`、`scope`、`entityOwner` を自由変数とする記号的 PDP 評価** です (#1369 はこれを `entityType` 単独から拡張しました): エンティティ `E` は、同じリクエストが `entityType: E.type`、`scope: E.scope.join(',')`、`entityOwner: E.createdBy` で評価されて Permitted になる場合に限り、導出された述語にマッチします。3 つのルール結合アルゴリズムと 2 段階結合 (優先度グループごとの first-applicable + グループ間 deny-overrides) は、ルールの順序を含めて正確に再現されます。

リクエストが **型を宣言する** 場合 (`?type=` / `body.type`)、`entityType` は自由変数セットから外れ、宣言された値を持つ固定属性として畳み込まれます — #649 のセマンティクスを保持しつつ (許可されていない宣言型は依然として `403` を返す)、スコープ/オーナーの行フィルタは **依然として適用されます**: 型を宣言してもスコープ/オーナーベースの制限をバイパスできません。`null` / `undefined` 属性のみが自由変数になります (#1384)。**宣言型は、それが単一の権威的な操作対象型である場合にのみ畳み込まれます**: `POST /v2/op/query` の場合 (その実際の型は body の `entities[].type` / `typePattern` 仕様です); ディスカバリルート `GET /ngsi-ld/v1/types(/{typeName})?`、`GET /ngsi-ld/v1/attributes(/{attrId})?`、`GET /v2/types(/{typeName})?` (#2061) の場合 — これらのコントローラは `?type=` に対して全くマッチングしません (名前付き詳細ルートは **パス** パラメータでマッチし、素のリストルートはすべての読み取り可能行を集約します)、したがって宣言された `?type=` はコントローラが実際に返す行に対して観測可能な効果を持たず、これを畳み込むと単一の読み取り可能な `?type=` 値で導出フィルタが `unrestricted` に崩壊する一方で、他のすべての型の存在/カウント/属性名のリークが開いたままになります; そしてコントローラが正規化する (`split(',') → trim → drop-empty`) `?type=` がカンマ区切りの `A,B`、空白パディングされた `" Secret"`、または空白のみの `" "` (コントローラはこれを型フィルタなし = すべての型に変換します) のように、生の値と同一の単一トークン以外のものになる場合 — `entityType` は **自由変数** として保持され、導出された行レベル述語がすべての仕様にわたって強制されます。畳み込まれて `unrestricted` に崩壊することはありません (#1653/#1656/#2061)。空文字列のフェイルクローズドマーカー (`''`、`body.type: ""` から) は唯一の例外です: これは **自由にされません** — 依然として `kind:'none'` → `403` に畳み込まれるため (#1384)、`body.type: ""` はリスト全体の拒否をエスケープするために使用できません。**リクエスト上の空文字列値 — 解決不可能な属性のためのフェイルクローズドマーカー (#1324/#1325)、例えば `body.type: ""` — はリスト全体をクローズド失敗させます (`403`)**: 固定値として畳み込むことはできません、なぜならデータクエリは空の値で行を制限しないため (畳み込むと制約された Deny ルールが空白になり — リークします)、そしてマーカーを無視せずに自由として扱うこともできません。これは *リクエストの* 宣言属性値のみに適用されます: `scope` / `entityOwner` に `matchValue: ""` を持つポリシー **ルール** (スコープなし/オーナーなし行にマッチ) は影響を受けず、導出された行フィルタでそれらの行に引き続きマッチします。

結果:

| Derivation result                           | Behavior                                                                                                       |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Unconditional Permit, no deny contributions | No filter (unchanged behavior — e.g. `tenant_admin`, plain `user` role)                                        |
| Some readable rows                          | `200` with only readable entities (**was `403`** for type/scope/owner-constrained subjects before #1337/#1369) |
| No readable rows                            | `403` fail-closed (unchanged — e.g. policy-less `api_key` / `anonymous`)                                       |

影響:


* **型制約されたキーは `?type=` なしでリストできます。** `entityType: SalesTarget` に対してのみ許可されたキーは、SalesTarget エンティティのみを含む `200` を取得します。#1337 以前はこれは常に `403` でした。
  
* **明示的な Deny ルールは、その型をリスト結果から隠すようになりました。** `entityType: Secret` に対して `GET` を拒否するテナントポリシー (ロールデフォルトより上位の優先度で、例: `priority: 10`) は、Secret エンティティを `user` の型なしリストから削除します — 以前は deny は by-id / by-type リクエストでのみ機能していました。
  
* **オーナーのみの読み取りがリストで機能します** (#1369)。`entityOwner: ${subject.userId}` で `GET` を許可するルール (+ deny-others) は、すべてのリストを「自分が作成した行のみ」に変換し、正しいカウントヘッダーを持ちます。MongoDB 変換は保存された `createdBy` フィールドをターゲットにします; 空文字列にマッチする条件は、`createdBy` がないドキュメントにもマッチします (PDP は欠落しているオーナーを `''` として評価します)。
  
* **スコープベースの読み取りがリストで機能します** (#1369)。スコープルールは、PDP がエンティティレベルチェックで使用するものと同じ **カンマ結合されたスコープ文字列** に対してマッチされます (上記の `scope` 属性の注記を参照) — マルチスコープエンティティでのサブツリーマッチングには、`(^|,)/public(/[^,]*)?(,|$)` のような境界を認識する `string-regexp` パターンを使用することをお勧めします。変換は MongoDB で `$expr` 経由で結合文字列セマンティクスを再現します; スコープなしエンティティ (`scope` が欠落 / `null` / `[]`) は `''` にマッチするルールにマッチします。ジオクエリ (`$geoNear`) は `$match` ステージと同じ述語を適用するため、距離ソートされた結果とそのカウントは同一にフィルタされます。
  
* 環境条件 (`time-range` / `ip-range`) および `${subject.*}` テンプレートはリクエスト時に畳み込まれます; 解決されないテンプレート (#1939) および無効な正規表現 (#1935) は `Indeterminate` となり、導出を「読み取り可能な行なし」 (403) に短絡させます。これは PDP が到達するものと同じフェイルクローズド結果です。
  
* **`entityId` / `entityIdPattern` によって制約されたルールはリストレベルでは発火しません** (空の値に対して評価されます。パスレベル評価が行ったのと正確に同じです) — by-id リクエストはエンティティレベル認可によってカバーされます (#1324)。
  
* **フェデレーション結果 (コンテキストプロバイダ) も同じ導出述語によってフィルタされます (#2003)** — リモートエンティティは MongoDB に触れることがなく、`entityReadFilterToMongo` を直接通過できないため、どのように行われるかについては下記の注記を参照してください。

> **動作変更の注記 (#1369)**: `scope` / `entityOwner` によって制約されたポリシーは、以前はリストリクエストでは発火しませんでした (両方の属性が `''` として評価されました)。これらは現在、行フィルタとして機能します。特に、`actions` を書き込みメソッドに制限しない「オーナーのみの **書き込み**」ポリシーは、リストパスに適用されると読み取りも行フィルタするようになります — そのようなポリシーは意図されたメソッドにスコープしてください (`actions: [{"attributeId": "method", "matchValue": "PATCH"}, ...]`)。
>
> **フォローアップステータス**: #1369 が延期した `/ngsi-ld/v1/types` / `/ngsi-ld/v1/attributes` 集約および一時リストクエリは #1370 / #1488 で完了しました; EntityMap 作成は #1955 で、EntityMap **読み取り** は #1963 で完了しました (下記の表を参照)。#1369 からのすべてのフォローアップは現在クローズされています。
>
> **フェデレーション (コンテキストプロバイダ) 結果も同じ述語を通過するようになりました (#2003)。** `ContextSourceRegistration` 転送からマージされるリモートエンティティは MongoDB に触れることがないため、上記の導出フィルタ — MongoDB クエリに組み込まれるもの — はそれらに対して実行されませんでした: `entityType` / `scope` / `entityOwner` によって制限されたプリンシパルは、以前は **完全な、フィルタされていない** リモート結果を見ていました。`entityMayBeRead()` (`policy.filter.ts`) は `entityReadFilterToMongo` の JS ミラーで、3 つの自由変数次元すべてを **具体的な値** に対して評価します — `entityTypeMayBeReadable()` (さらに下にある登録存在チェック。`scope` / `entityOwner` を「マッチする可能性がある」として扱います。登録はそれらの具体的な値を持たないため) とは異なり、リモートエンティティ **は** 実データの行であるため、それが値を持たない次元は、ローカルドキュメントで `createdBy` がない / `scope` がない場合に使用されるものと同じ実際の値 `''` に畳み込まれます — 「マッチする可能性がある」にはなりません。`FederationService.filterRemoteEntitiesByReadFilter()` は、inclusive/auxiliary マージの前および exclusive モードでこれを適用します。リモートレスポンスは `type` を **そのまま** 運びます (正規化された保存形式とは異なります)、フィルタは最初に #2086 で使用されたものと同じ `createStoredTypeCanonicalizer()` でそれを正規化します — そうしないと `Deny entityType == Sensor` ルールは FQN されたリモート型を静かに見逃します (#2086 クラスのリーク)。コア `@context` が解決できない場合、リモート結果は正規化されずに比較されるのではなく **完全にドロップされます** (フェイルクローズド)。これにより、#2003 は #1994 の `probeEntityType` ガードを削除できました。これは行レベル制限されたプリンシパルを登録マッチングの保守的な型抑制候補セットに保持していました。制限されたプリンシパルは現在 **通常の** 登録マッチングを通過し、その後 `narrowRegistrationsByReadableType()` がプリンシパルが読み取れない型 **のみ** を宣言する候補をドロップします (`entityTypeMayBeReadable()` を使用、ディスカバリエンドポイントが使用するものと同じ存在チェック)。マージされたエンティティ単独をフィルタするだけでは不十分です: 転送されたが読み取り不可能な登録は、プロバイダ失敗時に発生する `199` 警告を通じて、その `endpoint` と登録 id をリークし、— `exclusive` 登録の場合 — Via ループ検出によって発生する `508` を通じてもリークします。型を全く宣言しない登録 (`entityTypes` が空または `'*'`) は型情報を持たず、依然として転送されます。エンティティの可視性はこのナロウイングによって変更されません。なぜなら、ドロップされた登録は宣言する型のエンティティのみを供給できたはずであり、それらは行レベル述語によっていずれにせよ削除されるからです。コア `@context` が解決できない場合、転送は全く発生せず、レスポンスは結果が部分的であることを示す `199` 警告を運びます (条項 6.3.6) — 意図的に登録を命名 **せずに**。
>
> **By-id フェッチもカバーされています (#2092)。** リモートにのみ存在するエンティティの `GET /ngsi-ld/v1/entities/{id}` はエンティティレベル認可 (#1324/#1336) を通過し、`getEntityAuthzContext` はそのようなエンティティに対してローカルに何も見つけません — PDP は `entityType` なしで評価するため、型ベースの `Deny` はその時点では発火しません (修正前は `200` を返すことが測定されていました)。#2092 は #2003 と同じ行レベル述語でこれをクローズします: すべてのフェデレーション by-id 読み取りパス (NGSI-LD `GET /entities/{id}`、`/attrs`、`/attrs/{attrName}`; NGSIv2 `GET /v2/entities/{id}`、`/attrs`、`/attrs/{attrName}`、`/attrs/{attrName}/value`) は、遅延導出されたフィルタ (`deriveRemoteEntityReadFilter`) を `FederationService.getEntity` に渡し、これはリモートエンティティに `entityMayBeRead()` (型が最初に正規化される) を適用し、転送候補に `narrowRegistrationsByReadableType()` を適用します。導出は、クライアントが `?type=` を宣言する場合でも、意図的に `entityType` を **自由変数** として保持します — 宣言された型は検索フィルタのみです (#1324) であり、呼び出し元が `Deny` をターゲット外にステアリングできるようにしてはなりません。読み取り不可能なリモートのみエンティティは `404` を返します (非存在と区別不可能、リスト結果に存在しないことと一致)。導出は、少なくとも 1 つの転送候補登録がマッチする場合にのみ実行されるため、登録を持たないテナントは追加のポリシー作業を支払いません。MCP / A2A `get` アクションは非フェデレーション `EntityService` を使用し (`ENTITY_FORWARDING_ACTIONS` に `get` はありません)、リモートエンティティに到達することはありません。

#### エンティティに対する集約および派生読み取り (#1370 / #1955)

`entities` コレクションを読み取るエンドポイントは、**同じ導出述語** を適用しなければなりません。そうしないと、エンティティエンドポイントが隠している行が他のエンドポイントを通じて観測可能になります (#1376 パリティ不変条件)。上記のリストエンドポイントを超えて:

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

> **CADDE v4 はこのマトリックスの明示的に外側にあります (#2469)。** `/cadde/api/v4/entities` および `/cadde/api/v4/catalog` は GeonicDB プリンシパルを運びません — これらは CADDE 独自の JWT で認証します (または `authEnabled: false` の場合は認証なし) そして **XACML 行レベル読み取りフィルタを決して適用しません**。`Deny(entityType == X)` などのテナントポリシーも含みます。これは意図的です: CADDE はデプロイメント全体のオプトインデータ交換ゲート (`PUT /admin/cadde`、デフォルトで `enabled: false`) であり、その信頼モデルは契約レベル (リソース URL / コネクタ認証) であり、GeonicDB 内部のプリンシパル単位の行制御ではありません。#1376 パリティ不変条件 (「プリンシパル P の制限は P が使用できるすべての形状にわたって保持される」) は適用されません。なぜなら、このパス上に GeonicDB プリンシパル P が存在しないからです。CADDE と XACML を参照してください。
>
> **リンクされたエンティティ取得 (`join`) は、呼び出し元が決して要求しなかった行に Relationship を辿ります (#2213)。** `join=flat` / `join=inline` は `Relationship` 属性のターゲットを解決し、それらをレスポンス配列に追加するか、`entity` サブ属性として埋め込みます。それらのターゲットは、呼び出し元が `?type=` で宣言した型 **ではありません** — それらはリンクしているエンティティが指し示すものです。#2213 まで、解決は `EntityRepository.getMany()` を通過していました。これはテナント / servicePath / プロトコル / ソフト削除境界を運びましたが **行レベル述語はありませんでした**。したがって、`entityType == Secret` を拒否されたサブジェクトは、それにリンクする読み取り可能なエンティティをリクエストすることで、`Secret` エンティティを完全に読み取ることができました。1 つの `Relationship` で述語を回避するのに十分でした — #2003 (フェデレーション結果) と同じ「2 つのパスがどの行が読み取り可能かについて一致しない」クラスです。
>
> **同じホールが通知にも存在します (#2104)。** `notification.join` は Relationship ターゲットを通知ボディに解決します。そこには HTTP リクエストがなく、したがって述語を導出する `actor` もありません。述語は **サブスクリプション作成者** (`createdBy`) から `deriveSubscriberReadFilter()` で導出されます — #2133 が CSource 通知のために導入したヘルパーで、2 つのパスがドリフトしないように共有されています (いずれかの場所で有効なロールまたは `super_admin` `tenantId` を間違えると、「HTTP が隠すものが通知に現れる」ことになります)。ただし、`'skip'` 結果は異なってマッピングされます: CSource 通知は述語が決定不可能な場合に **送信されません** が、`notification.join` は `'skip'` を `{ kind: 'none' }` にマッピングします — リンクされたエンティティがゼロ、通知は依然として配信されます。`join` は追加の表現であるため、決定不可能な述語は配信を静かに停止してはなりません; リンクされたデータを保留することがフェイルクローズド部分です。
>
> **通知されたエンティティ自体も述語を通過する (#2205)。** 上記の #2104 は `notification.join` が*到達する*行をカバーしていますが、通知が実際に対象としているエンティティはフィルタリングされていませんでした。書き込みパスでもフィルタリングできませんでした。サブスクリプション書き込みは**サブスクリプションリソースパス**をフレームとして認可されるため(`buildSubscriptionAuthzRequests`)、`/ngsi-ld/v1/entities**` にスコープされたポリシーは、サブスクリプションが作成される際のターゲットセットの一部にすらなりません。つまり、エンティティ読み取りで `entityType == Secret` を拒否されたサブジェクトでも、`Secret`(または `type: "*"`)のサブスクリプションを作成し、それらのエンティティを通知として受信できてしまいました。*書き込み*認可をエンティティ読み取りパスに再フレーム化することは解決策ではありません。PR #2204 で測定されたように、パス glob によってサブスクリプション書き込みを許可するカスタムポリシーは、読み取りフレームの下でターゲットから外れ、**Permit をまったく提供しない**ため、`kind: 'none'` に崩壊し、正当な `201` が `403` になってしまいます。代わりに配信時フォームが使用されます。これは `#2140` 読み取り、`#2133` CSource 通知、および WebSocket のイベントごとの `authorizeWs`(#1107 / #1383)と同じ形状です。サブスクリプションは書き込み時に許可され、**すべての配信**が作成者の現在の述語に対して判定されます。判定には `entityMayBeRead()`(実際の行の 3 つすべての自由次元)を使用し、`entityTypeMayBeReadable()` は使用しません。通知本文にはエンティティの内容が含まれるため、type 次元のみを見ると `entityOwner` / `scope` で制限されたサブジェクトに行がリークします。読み取りフレームパスはサブスクリプション自体の `protocol`(`NOTIFICATION.READ_FRAME_PATH`: `/ngsi-ld/v1/entities` または `/v2/entities`)に従うため、合成イベントはプリンシパルの HTTP 読み取りと同じターゲットセットに到達します。述語は配信ごとに再導出されるため、これにより `#2005` が残した 2 つのギャップも閉じられます。制限が厳格化される前に作成されたサブスクリプションは、次の `PATCH` まで祖父条項で保護されるのではなく再判定され、`scope` / `entityOwner` 制限は具体的な type セレクタにも適用されます(サブスクリプション PIP はこれらの属性を構築しません)。ゲートは `claimNotificationSlot` の**前に**実行されます。抑制されたサブスクリプションはスロットリング / クールダウンウィンドウを消費してはならず、そうでなければ述語が後で許可した時点で通知が永久に消失します。
>
> `'skip'`(決定不能な述語)は**配信しない**ことを意味し、`notification.join` の「リンクされたエンティティがゼロ」ではなく CSource 通知と一致します。ここで保留されるものは通知*そのもの*です。fail-closed セルは作成者のプリンシパル種別に依存します。**user** 作成者の場合、fail-closed セルは上記 #2133 でリストされた共有のものです。格納された `createdBy` がない、作成者がアクティブなユーザーに解決されない、作成者の通知対象テナントへのメンバーシップが取り消されているか存在しない、解決不能なテナント、およびエンティティ読み取りを完全に拒否する述語です。**credential** 作成者(`api_key` / `oauth_client`、#2282)の場合、user-document とメンバーシップのセルはまったく適用されません。代わりにクレデンシャルドキュメントから評価され、そのドキュメントが欠落している、取り消されている(`isActive: false`)、または別のテナントに属している場合、格納されたプリンシパル種別が id 形状と一致しない場合、種別が格納されていない場合(#2282 以前に書き込まれたサブスクリプション)、または導出された述語がエンティティ読み取りを完全に拒否する場合にのみ fail-closed になります。**許可ポリシーにバインドされた有効でアクティブな API key は抑制の原因ではありません**。そのサブスクリプションは、その key が HTTP 経由で読み取れるすべての行を受信します。**動作変更**: `createdBy` のないレガシーサブスクリプションは、`AUTH_ENABLED=true` デプロイメントで識別可能なプリンシパルによって再作成されるまで通知の受信を停止します。`securityEvent` 警告ログ(`SUBSCRIPTION_NOTIFICATION_RLS_SKIPPED`)により、これは運用上可視化されます。API key および OAuth クライアント作成者は、最初は同じバケットにありました。それらには user document がないため、`UserRepository.getById('apikey:<keyId>')` は `null` を返し、導出は `'skip'` に落ち、つまり **API key で作成されたサブスクリプションは、`201` / `status: active` を報告しながらも何も受信しませんでした**。#2282 は、それらを fail-open ではなく*評価可能*にしました。サブスクリプションは作成者のプリンシパル種別を格納し(`createdByRole`、`/subscriptions` と `/csourceSubscriptions` の両方に永続化)、導出は HTTP 認証が構築するのと**同じアクター**を credential document から再構築します。`apikey:<keyId>` / `apikey-<keyId>@internal` / `role: api_key` / key の `tenantId`、または OAuth クライアントの `clientId` / `role: oauth_client` で、`policyId` は credential document から読み取られるため、ポリシーの再バインドはサブスクリプション時に凍結されるのではなく、次の配信時に効果を発揮します。種別は `createdBy` の `apikey:` プレフィックスから推論されることはありません(その形状と衝突する `user.id` は、credential のポリシーで評価されてしまうため、「推測されたプリンシパル種別」クラスになります)。したがって、#2282 以前に書き込まれたサブスクリプションは fail-closed のままです。取り消された(`isActive: false`)、削除された、および**クロステナント**の credential も fail-closed のままであり、格納された種別が id 形状と一致しない場合も同様です。`AUTH_ENABLED=false` の場合、ゲートは不活性であり、HTTP 読み取りパスがそこで制限されないのとまったく同じです。
>
> 同じゲートは #2253 のプロトコル分離を担い、両方の配信ルート(Lambda `matcher` とスタンドアロンのインプロセスサービス)および両方のイベント種別(エンティティ変更とルールトリガー通知)が**1 つの**関数を通過します。最初のカットはエンティティ変更の半分のみを配線し、ルールトリガー通知を無防備なままにしましたが、これは #1376 の「1 つのセルが残された」クラスが、その修正内部で再現されたものです。
>
> 述語は現在 `deriveLinkedEntityReadFilter()` によって導出され、`joinLevel` の**すべての**再帰レベルで `getMany()` の Mongo フィルタに構成されます。これは意図的に、周囲のクエリのために `requireListReadAuthz()` が返したフィルタでは**ありません**。宣言された `?type=A` では、その導出は `entityType` をリテラル `A` に折りたたみ(しばしば `unrestricted` に崩壊)、type `B` のリンクされたエンティティについては何も語りません。`deriveRemoteEntityReadFilter()`(#2092)と同様に、`entityType` は自由変数のままにされます。それとは異なり、`entityId` も**折りたたまれません**。join は 1 つではなく多くのターゲットを持つためです。`kind: 'none'` はリクエスト全体を失敗させるのではなく、リンクされたエンティティがゼロになります。リンクするエンティティはすでに認可されており、`join` パラメータを `403` に変えることは過剰な拒否になります。

> **Context Source Registration 由来の `/types` および `/attributes` への寄与には別のメカニズムが必要でした (#2079)。** 上記の行は `entities` コレクションの読み取りをカバーしていますが、`GET /ngsi-ld/v1/types(/{typeName})?` および `/ngsi-ld/v1/attributes(/{attrId})?` も、**Context Source Registration によって宣言された** type 名と attribute 名をレスポンスにマージします(ETSI GS CIM 009 - 5.9.3.3)。Registration は `entities` 行ではないため、`readableEntityFilter` / `entityReadFilterToMongo` をまったく通過しません。#1370 のエンティティ由来の寄与に対するリーククロージャは、registration 由来のパスを開いたままにしました。type 制約されたサブジェクトは、*任意の* registration によって宣言された任意の type の存在(および attribute 名)を知ることができ、`/types/{typeName}` は、サブジェクトが単一のエンティティを読み取れない type に対して `200` を返しました。純粋に registration がそれを宣言していたというだけで。`entityTypeMayBeReadable()`(`policy.filter.ts`)は、`entityType` 次元に制限された `entityReadFilterToMongo` の JS ミラーです(registration が具体的な値を持つ唯一の次元。`scope` / `entityOwner` は「一致する可能性がある」として扱われます。registration はどちらも持たないため)。これは、サブジェクトが読み取れる可能性がまったくない registration 由来の type/attribute 名をドロップするために使用されます。`/types/{typeName}` および `/attributes/{attrId}` は、ターゲット type に読み取り可能性がまったくない場合、registration を介して存在をリークするのではなく、`404` に折りたたまれます。制約のないサブジェクト(`readableEntityFilter === undefined`)には変更はありません。

> **述語は格納された文字列を比較するため、格納形式は一致する必要があります (#2086)。** `entityTypeMayBeReadable()` は、registration の宣言された type 名をマッチャー値に対して正確な文字列等価性で照合します。これは、`entities` 行に対する Mongo 側の `{entityType: <matcher>}` 比較と同じ基盤です。これは、両側が同じ正規化を通過した場合にのみ成立します。NGSI-LD registration は通過します(書き込み時の `normalizeTypeName`、#1700)。**NGSIv2 registration は通過しません**。`POST`/`PATCH /v2/registrations` は type をそのまま格納します。NGSIv2 にはアクティブな `@context` がないためです。registration はプロトコル間で可視であるため、v2 で登録された `https://uri.etsi.org/ngsi-ld/default-context/Sensor` は、同じ type のエンティティが正しく隠されている間に、`Deny entityType == Sensor` ルールをすり抜けました。したがって、ディスカバリエンドポイントは、消費時点で(両方のコントローラーの `listRegistrationsSafely`)コアボキャブラリを使用して registration type セレクタを正規化するため、述語、`/types/{typeName}` ルックアップ、およびレスポンス type 名はすべて同じ文字列で評価されます。格納形式は意図的にそのまま残されています。NGSIv2 エンティティもそのまま格納され、`findMatchingRegistrations` は正確な文字列で照合するため、格納形式を反転すると、NGSIv2 フェデレーション転送が黙って壊れ、`GET /v2/registrations` が不可逆的に変わります(#1890 は attribute 名に対して同じ決定を下しました)。
>
> **Context Source Registration ドキュメント自体の読み取りも述語を通過します (#2084)。** #2079 は registration 由来の `/types` および `/attributes` への*寄与*を絞り込みましたが、供給元である `GET /ngsi-ld/v1/csourceRegistrations(/{registrationId})?` および `GET /v2/registrations(/{registrationId})?` は、依然として CSR ドキュメント全体を返していました。CSR リストリクエストには具体的な `entityType` がないため、type Deny はポイント認可で発火せず、CSR 読み取りを許可するポリシー(`user` ロールのデフォルト GET Permit、または type Deny を持つ permit-by-default カスタムポリシー)を持つサブジェクトは、読み取れない type の registration の存在、宣言された type 名、およびプロバイダー `endpoint` URL を読み取ることができました。読み取りパスは現在、同じ行レベル述語(`requireListReadAuthz`)を導出し、**編集**します。読み取り不能な具体的な type セレクタは `information[].entities[]` からドロップされ、読み取り不能な type のみを宣言する information エントリは完全にドロップされ、すべてのエントリがドロップされたドキュメントはリストから省略され、id ごとの読み取りでは `404` を返します。ルールは、ディスカバリエンドポイントが使用するのと同じ関数(`redactInformationForRead` — 同じ関数を呼び出すことで、ディスカバリと CSR 読み取りの可視性が分岐しないようにします)で、正規化された type 値(#2086)で判定され、レスポンスは格納形式を保持します。リスト `count` とページネーションは編集**後**に計算されます(編集前のカウントは隠された registration の存在をリークします)。`?type=` / `?attrs=` は編集されたドキュメントに対して再照合されます(読み取り不能なセレクタ経由でのみ一致したドキュメント、またはドロップされたエントリの attribute 経由でのみ一致したドキュメントは、まったく表示されてはなりません。その出現自体が編集が削除したものをリークします)。`?attrs=` 再照合は、そのままの名前 ∪ 正規名を判定し(各エントリの格納名を registration の書き込み時 `@context` で展開、#2141)、その照合範囲は Mongo union index(#1890)をミラーします。これがないと、正規形式でのみ一致するクエリ(FQN、または別の `@context` からの同義語項)は、制約のないサブジェクトには結果を返しますが、制限されたサブジェクトには `0` 件の結果を返します。編集されたリストは、コレクションをページごとにスキャンし(OOM 安全キャップで境界を設定し、切り詰め時に警告)、`count` / `total` が最初のページを超えても正確であるようにします(#2141)。`GET /ngsi-ld/v1/csourceRegistrations` は、宣言された `?type=` を常にポイント認可ではなく行レベル述語に委譲します。読み取り可能な type で一致した CSR は、依然として読み取り不能なセレクタを*含む*可能性があるため、折りたたむと述語が `unrestricted` に崩壊し、一致した複数 type ドキュメントが編集なしで返されます(#1653/#1656 の宣言された type ≠ 実際の内容クラス)。動作変更: エンティティ type 許可リストに制限されたサブジェクト(#2079 ポリシー形状)は、以前は CSR リストで `403` を取得しました。現在は、読み取り可能な(または type のない)type を宣言する registration のみを含む `200` を取得します。これは、#1370 がエンティティリストに対して行ったのと同じ fail-closed→フィルタリング遷移です。csource-subscription 通知チャネルもカバーされています(#2133、下記)。
>
> **csource-subscription 通知によって配信される CSR ドキュメントは、サブスクリプション作成者の述語によって編集されます (#2133)。** 通知チャネル(`csource-notification.service.ts` — CSR ドキュメントは registration の作成/更新/削除時にサブスクリプションライバーエンドポイントに完全に POST されます)は、以前は #2084 の編集を完全にバイパスしていました。Csource サブスクリプションは現在、作成者を格納し(`createdBy`、エンティティサブスクリプションと同じ形状)、配信時に作成者の**現在**の有効なポリシーセットが、HTTP CSR 読み取りと同じ行レベル述語を導出するために使用されます(`requireListReadAuthz` は合成認可パターン、#1610 を通じて呼び出されます)。パリティ不変式は「作成者 P が `GET /ngsi-ld/v1/csourceRegistrations` で見るものは、P のサブスクリプションが通知されるもの」です。照合は**編集された**ビューに対して評価されます(読み取り不能な type セレクタ経由でのみ一致した通知はまったく到着してはなりません。その到着自体が、その type を宣言する CSR の存在をリークします)。すべてのエントリが編集された registration は配信されません。**これはすべて認証が有効な場合にのみ適用されます。** `AUTH_ENABLED=false` では、語るべき行レベル述語がありません。`optionalAuth` はすべてのリクエストに対して `super_admin` を合成するため、HTTP CSR 読み取りはすべてのドキュメントを編集なしで返します。通知パスは同じ条件で短絡し、編集なしで配信します。そこで通知を抑制すること(格納された作成者は `anonymous` であり、ユーザーに解決されません)は、上記のパリティ不変式そのものを可用性の方向で壊すことになります。以下のすべては `AUTH_ENABLED=true` デプロイメントについて説明しています。

述語に使用されるロールは、user ドキュメントのグローバル `role` ではなく、作成者の**通知対象テナントにスコープされた**ロールです。`super_admin` はそのまま通過し、それ以外の場合は通知対象テナントのメンバーシップ行が決定します。3 つのケースは異なり、混同してはなりません。**アクティブな**メンバーシップ行はその `role` を供給します。存在するが**非アクティブ**(取り消された)メンバーシップ行は fail-closed になります。**メンバーシップ行がまったくない**場合は `user.role` にフォールバックしますが、作成者の `primaryTenantId` が通知対象テナントである場合に限ります(自動メンバーシップ以前のレガシーユーザー、または再ポイントされた `primaryTenantId` — デフォルトログインが `user.role` トークンを発行する同じプリンシパル)。*別の*テナントに対する欠落行は、取り消されたケースのように fail-closed になります。これは #1201(「非 `super_admin` の有効なロールは常に `membership.role` である」)をミラーします。これが重要なのは、`PATCH /admin/users/{id}` がメンバーシップに触れずに user ドキュメントのロールを更新するためです。

Fail-closed セル(**通知は送信されず**、構造化された警告ログが記録されます):保存された `createdBy` がないサブスクリプション(この変更以前に作成されたレガシードキュメント — `CSOURCE_NOTIFICATION_RLS_SKIPPED_LEGACY`)、アクティブなユーザーに解決できない **user** 作成者(削除 / 非アクティブ化されたユーザー — `CSOURCE_NOTIFICATION_RLS_OWNER_UNRESOLVED`;#2282 以降、`api_key` / `oauth_client` 作成者はこのセルには**含まれません** — これらは代わりに資格情報ドキュメントから解決され、それが欠落、取り消し、または別のテナントからのものである場合にのみ fail-closed になります — `CSOURCE_NOTIFICATION_RLS_CREDENTIAL_UNRESOLVED`)、通知されたテナント内のメンバーシップが存在するが取り消されている **user** 作成者(`isActive: false`)、および `primaryTenantId` ではないテナントにメンバーシップ行が**ない** **user** 作成者(メンバーシップはユーザーのみの概念です;資格情報作成者は資格情報ドキュメント上の `tenantId` によってスコープされます)(両方とも — `CSOURCE_NOTIFICATION_RLS_MEMBERSHIP_MISSING`;`refreshToken` は同じプリンシパルに対して `403` を返します)。このセルには、上記で説明したレガシーの行なしケースは**含まれない**ことに注意してください:`primaryTenantId` が通知されたテナントである、メンバーシップ行のない作成者は `user.role` にフォールバックし、通知**されます**。同様に fail-closed:解決不可能なテナント(`CSOURCE_NOTIFICATION_RLS_TENANT_UNRESOLVED`)、および述語が CSR 読み取りを完全に拒否する作成者。**動作の変更**:レガシー csource サブスクリプション(`createdBy` が存在する前に作成されたもの)は、識別可能なユーザーによって再作成されるまで通知を受信しなくなります;警告ログによりこれが運用上可視化されます。

> **サブスクリプションドキュメントの読み取りも述語を通過します(#2140)**。同じ穴が `GET /ngsi-ld/v1/subscriptions(/{subscriptionId})`、`GET /v2/subscriptions(/{subscriptionId})`、および `GET /ngsi-ld/v1/csourceSubscriptions(/{subscriptionId})` に存在していました:サブスクリプションリストリクエストには具体的な `entityType` が含まれないため、タイプ Deny はポイント認可時に発火せず、タイプ Deny を持つサブジェクトは、読み取れないタイプを監視しているサブスクリプションの存在、宣言されたタイプ名、および**通知エンドポイント URL** を読み取ることができました。読み取りパスは同じ行レベル述語を導出し、CSR ルールの正確なミラーで編集するようになりました(`subscription-read-redaction.ts` — タイプに依存しない判定は `informationEntryIsTypeAgnostic` をミラーします):読み取り不可能な具体的なタイプセレクターはセレクターリスト(`subject.entities` / `entities`)から削除され、読み取り不可能な具体的なタイプのみを宣言するセレクターを持つサブスクリプションはリストから省略され、ID による読み取りでは `404` を返し、タイプに依存しないサブスクリプション(セレクターなし、`type: "*"`、`id`/`idPattern`/`typePattern` のみのセレクター、`watchedAttributes` のみのサブスクリプション)は影響を受けません。リストの `count` とページネーションは編集後に計算され、`?type=` は常に行述語に委譲され(これらのコントローラーはマッチングに `?type=` を使用しないため、それを折りたたむと述語が `unrestricted` に崩壊します — #2084 finding-1 クラス)、述語は `ETag` シードに混合されます。サブスクリプションは 1 つのプロトコル共有コレクションに保存されるため、NGSI-LD と NGSIv2 の両方の入口が同じように編集します。更新 / 削除の認可は変更されていません(`requireSubscriptionUpdateAuthz` / 所有権チェックはサブスクリプションの有効な値を評価し、このパスを通過しません)。

注意事項:


* **EntityMap 作成はパスレベル PEP を維持します**(これはリソースを作成する `POST` です)。さらに、実際のリクエストで行述語を導出するため、読み取り可能な行がないサブジェクトは `403` を取得し(fail-closed)、宣言された `?type=` はスコープ / 所有者制限をバイパスできません。
  
* **既存の EntityMap の読み取りは、再導出された行述語ではなく、所有者ガードを使用します(#1963)**。`EntityMapDocument` は `createdBy` フィールドを取得しました;非管理者プリンシパル(`super_admin` / `tenant_admin` 以外のすべて)は、**自分自身が作成した** EntityMap のみを読み取り、更新、削除できます。`createdBy` がないレガシー行は非管理者には見えません — **fail-closed**、#1945(スナップショット)に従います。当時、これは `SubscriptionService.checkOwnership` との意図的な違いであり、不明な所有者を通過させていました;**#2161 がそのギャップを閉じた**ため、サブスクリプションと登録もレガシードキュメントで fail-closed になりました(以下の所有権セクションを参照)。

  保存された `entityIds` と読者の読み取り可能なセットを交差させるのではなく、所有者ガードを使用する理由:作成時にすでに**読者自身の**導出された述語を通してフィルタリングされているため(#1955)、所有者は構造上、自分自身のマップ内のすべての ID を見ることができます — 再度フィルタリングすることは冗長であり、`GET` ごとに追加の `entities` クエリのコストがかかり、読者ごとに `totalCount`(元のクエリの合計)の意味が変わります。

  **非所有者は `404` を取得し、`403` ではありません** — `403` はその ID を持つ EntityMap が存在することを確認してしまい、#1370 が閉じたのと同じ存在リーククラスになります。ガードは、フェッチしてから拒否するのではなく、**Mongo クエリの内部**(`{tenant, entityMapId, createdBy}`)で適用されるため、「存在するがあなたのものではない」と「存在しない」が分岐できるコードパスはありません。

  `PATCH` / `DELETE` は同じようにガードされています:読み取りパスのみを閉じると、非管理者が別のプリンシパルの EntityMap を変更または削除できる状態になります(CLAUDE.md Authorization Change Checklist 2 — すべての実施パスを配線する)。
  
* EntityMap 認可セマンティクスは **ETSI GS CIM 009 で指定されていません**(clause 5.2.32 / 6.3.16 はリソースを定義していますが、そのアクセス制御は定義していません)。したがって、2 つの操作は異なる仕様定義のアナログに従います:
  

* **作成** (`POST`) は兄弟パス `GET /entities` に従います。読み取り不可能な行を除外し、成功を返します (*読み取り可能な行がない
* 場合のみ `403`)。
  
* **既存の EntityMap の読み取り / 更新 / 削除** は、スナップショットのオーナーガード (#1945) の形式に従います — `createdBy` によってスコープされ、`createdBy` のないレガシー行は非管理者から隠されます — ただし、#1963 が Mongo クエリにオーナーを組み込むため (以下参照)、スナップショットの `403` ではなく `404` を返します。
  
* \#1955 が当初カバーしていたベクタタイルエンドポイントは、#1961 (PR #1965) で **完全に削除** されました。そのパスでの認可 / キャッシュ / 正規化の繰り返しの失敗が理論的根拠の一部でした。

#### カタログ読み取り認証情報 (#2465 / #2468 / #2472)

`/catalog/**` は **行データ** を返し、メタデータのみのインデックスではありません。`sample` は完全なエンティティ本体であり、データセットメタデータは正確な `entityCount`、属性スキーマ、空間 bbox を公開します。したがって、行レベルの認可はエンティティリスト読み取りと **同じ述語** を使用します (#1376 の対等性)。#2465 / #2468 以降、`CatalogService` はパスが `GET /v2/entities` である合成イベントに対して `requireListReadAuthz` を介してその述語を導出します (ハンドラーは `/catalog/**` を `apiType: 'ngsiv2'` として抽出します — #2471 を参照)。

**設計によりフェイルクローズ。** カスタムポリシーが `/catalog/**` のみを Permit する認証情報 (エンティティリストパスではない) は、カタログルートでのパスレベル `requireAuthz` を通過しますが、合成導出は `kind:'none'` を生成し、`requireListReadAuthz` は **403** をスローします。`/catalog/**` Permit を十分とみなす二重パス導出は、#2465 の穴を再び開くことになります (`/v2/**` に対して記述された entityType / servicePath Deny がカタログで静かに見逃されます)。

**オープンデータポータルレシピ** (コード変更なし — 既存の XACML で表現):

同じプリンシパル (`api_key` / `oauth_client` / `anonymous`) に両方を付与します:


1. `Permit` — `path: /catalog/**`、`method: GET` (パスレベルの到達可能性)
   
2. `Permit` — `path: /v2/entities`、`method: GET` (行フィルター導出ソース)

選択されたタイプのみを公開するには、(2) に `entityType` 条件を追加します。同じ条件がカタログ行フィルターになるため、カタログと `GET /v2/entities` は **同じ行** を表示します。これにより、それらのタイプに対する直接の `GET /v2/entities` も許可されます — カタログはすでに同等のデータを配布しているため、これは追加の露出ではありません。

バウンドポリシーの例 (`/me/policies` の後、API キー / OAuth クライアントに `policyId` を設定。バウンドされると、ポリシー `target` はバイパスされ、`rules` のみが実行されます):

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

匿名ポータルは `role=anonymous` (および必要に応じて `anonymousAccessEnabled`) で同じ形式を使用します。`/catalog/**` 単独で Permit して、カタログが 200 を返すことを期待 **しないで** ください。

> **スコープ外。** `sample` / `entityCount` を省略したメタデータのみのカタログ (つまりカタログ ≠ エンティティ読み取り) は、別の製品設計になります。現在の需要はありません (#2472)。

### MCP / A2A ツール認可 (#1610 / #1651 / #1672)

MCP サーバー (`POST /mcp`) と A2A JSON-RPC エンドポイント (`POST /a2a`) は、HTTP コントローラーをバイパスする entity / batch / temporal データツールを公開しています。これらは独立した認可実装を**持っていません**。各ツール呼び出しは最小限の合成 `APIGatewayProxyEvent` を構築し、HTTP レイヤーと**同じ共有の強制関数**を呼び出します — `checkEntityOwnership` (エンティティレベル、ID による)、`requireListReadAuthz` (リストレベルの行フィルタリング)、および `requireAuthz` (ポイントチェック) — これらは `@api/shared/authz/synthetic-authz` (MCP の場合は `src/api/mcp/tools/authz.ts`) を介して実行されます。したがって、カスタムポリシーにおける `entityType` / `entityOwner` / `scope` の制約は、HTTP、MCP (#1610)、A2A (#1651) の全体で同一に強制され、Deny / NotApplicable の結果はフェイルクローズされます。


* **ID によるツール操作は、DB に保存されている実際の `entityType` で認可されます** — クライアントが提供した `type` 引数は認可属性として使用されることはありません (それは後続のデータアクセスのためのルックアップフィルターとしてのみ残ります)。これは HTTP の ID によるルートと同じルールです ([#1324](#entity-level-authorization-for-by-id-routes-1324-1336))。これにより、偽造された `type` がエンティティルックアップを失敗させ、リクエストがデフォルト許可ポリシー下で `entityType: ""` の評価にスライドしてしまう型なりすましバイパスが閉じられます (A2A: #1651、MCP: #1672)。
  
* **到達可能性は別の、パスレベルの関心事です**: `/mcp` と `/a2a` は `tenant_admin` デフォルトポリシーによって許可され、テナントポリシーパス許可リスト (`TENANT_POLICY_ALLOWED_PATH_PREFIXES`、`src/core/auth/policy/policy.defaults.ts`) に含まれているため、テナント管理者はカスタム Permit ポリシーで `user` / `api_key` / `oauth_client` プリンシパルにこれらを付与できます。`/mcp` / `/a2a` に対するパスレベルの Permit は、エンドポイントを到達可能にするだけです — 上記のツールごとのエンティティレベル / リストレベルのチェックは、すべてのデータ操作に対して引き続き適用されます。
  
* **管理ツールには `tenant_admin` ロールが必要です**: 管理 / 構成管理ツール (users / policies / rules) は MCP と A2A の両方でロールゲートされているため、データツールのために `/mcp` / `/a2a` を付与されたプリンシパルは、ユーザーを列挙したり、ポリシー / ルールを読み取ったりすることはできません。


* **ロールゲートはポリシー評価の代替ではありません (#2223)。** MCP `config` ツールの `custom_data_models` リソースは以前、`requireAdminRole` + テナント解決で停止し、**カスタム XACML ポリシーを評価することはありませんでした**: `/mcp` は `resource.path = "/mcp"` としてパスレベルで認可されるため、`/custom-data-models` に対して書かれた `Deny` は適用されず、HTTP 経由でデータモデルから制限された `tenant_admin` でも、MCP を通じてそれらを作成 / 更新 / 削除できました。現在は、対応する HTTP ルート (`GET|POST /custom-data-models`、`GET|PATCH|DELETE /custom-data-models/{type}`) の合成イベントを構築し、HTTP ハンドラーが呼び出すのと同じ `requireAuthz` を呼び出すため、同じポリシーが両方のエントリポイントを決定します。HTTP ルート (#2215) と同様に、`resource.tenantService` は**アクター**から解決され、呼び出し側が宣言した値からは解決されません — MCP ではテナントは `tenant` 引数から来ており、`resolveToolTenant` はそれがアクター自身のテナントであることをすでに検証しています。`resource.servicePath` は、HTTP ルートがそれを折りたたむのと同じ理由で `/` に折りたたまれます (#2221): `resolveToolTenant` が返す値は呼び出し側の `servicePath` 引数から来るため、それを残すと `servicePath` を条件とした Deny をその引数を変更することで回避できてしまいます — `tenantService` の穴の、1 次元上位版です。


* **このパスではまだ利用できない属性が 1 つあります: `environment.sourceIp`。** 合成イベントは設計上ソース IP を持ちません (#1610 — MCP / A2A 呼び出しコンテキストは IP を伝播せず、値を捏造するのはさらに悪いです)。`ip-range` 条件はそれなしでは `false` に評価されます。したがって、`/custom-data-models/**` に対して書かれた `ip-range` を条件とした **Deny** は MCP パスでは発動しませんが、同じポリシーは HTTP 経由では発動します。これはすべての合成イベントチェックの特性です (この変更より前から存在し、entity / batch / temporal ツールにも等しく適用されます) が、`/custom-data-models` ポリシーが MCP から評価されるようになったことで、ここで新たに到達可能になります。`POST /mcp` 自体のパスレベル認可は依然として実際のクライアント IP を参照するため、**エンドポイント**に対する IP 制限は影響を受けません — ツールのターゲットリソースに対してではなく、そこで IP 制限を表現してください。


* **同じ配線が両方のエントリポイントで `rules` と `jsonld_contexts` をカバーします (#2244)。** #2223 は `custom_data_models` ブランチのみを配線しました。同じツールの兄弟ブランチはそのまま残されました — `handleRuleAction` は `requireAdminRole` で停止し、`handleJsonLdContextsAction` にはロールゲートがまったくなかったため、`/mcp` に対するパスレベル `Permit` のみを持つプリンシパルが JSON-LD コンテキストの作成 / 削除に到達できました。A2A `config` スキルも、その読み取り専用 `rules` / `jsonld_contexts` ハンドラーに同じギャップがありました。これら 4 つすべてが、1 つの共有マッピング (`@api/shared/authz/config-authz-target`) を通じて合成イベントを構築するため、MCP と A2A が乖離することはありません:

  | action                    | rules                                                | jsonld\_contexts                                |
  | ------------------------- | ---------------------------------------------------- | ----------------------------------------------- |
  | `list`                    | `GET /rules`                                         | `GET /ngsi-ld/v1/jsonldContexts`                |
  | `get`                     | `GET /rules/{ruleId}`                                | `GET /ngsi-ld/v1/jsonldContexts/{contextId}`    |
  | `create`                  | `POST /rules`                                        | `POST /ngsi-ld/v1/jsonldContexts`               |
  | `update`                  | `PATCH /rules/{ruleId}`                              | —                                               |
  | `delete`                  | `DELETE /rules/{ruleId}`                             | `DELETE /ngsi-ld/v1/jsonldContexts/{contextId}` |
  | `activate` / `deactivate` | `POST /rules/{ruleId}/activate`\|`/deactivate` | —                                               |


* **`servicePath` はリソースごとに異なる方法で処理され、HTTP と一致します。** ReactiveCore Rules は `servicePath` をファーストクラスフィールドとして保持し、HTTP ルートは `Fiware-ServicePath` 由来の値を `requireAuthz` に直接渡すため、MCP / A2A パスは呼び出し側の `servicePath` を変更せずに渡します — ここでそれを `/` に折りたたむこと (`custom_data_models` が行うように、#2221) は、HTTP 経由で機能する `servicePath` を条件とした Deny がツールパスで静かに失敗することになります。JSON-LD コンテキストは折りたたみをまったく必要としません: `buildAuthzRequest` はすでにすべての NGSI-LD パスに対して `resource.servicePath` を `/` に正規化しています (#1323 / #1862)。


* **`jsonld_contexts` にはロールゲートが追加されませんでした。** HTTP ルートにもありません — 誰が何をできるかはポリシーのみによって決定されます (デフォルトの `__default_user` ポリシーは `/ngsi-ld/**` のすべてのメソッドを `Permit` するため、制限のない `user` も HTTP 経由でコンテキストを作成できます)。ツールを `tenant_admin` でゲートすると、HTTP 経由で成功する操作が MCP 経由で失敗することになり、これはパリティ不変性の逆です。


* 上記の `environment.sourceIp` の注意事項は、これらのリソースにも適用されます。

ツールインベントリと A2A 固有の詳細については、[AI\_INTEGRATION.md](../ai-integration/overview.md) を参照してください。

### テンプレート変数 (GeonicDB 拡張)

`matchValue` は `${subject.<attributeId>}` テンプレート変数をサポートしており、評価時にリクエスト主体の属性値に解決されます。これにより、ユーザー ID をハードコーディングせずに「所有者のみ」アクセスのような動的ポリシーを実現できます。

| Template              | Resolves to                                              |
| --------------------- | -------------------------------------------------------- |
| `${subject.userId}`   | Requesting user's ID                                     |
| `${subject.email}`    | Requesting user's email                                  |
| `${subject.role}`     | Requesting user's role                                   |
| `${subject.tenantId}` | Requesting user's tenant ID (`''` for global principals) |

**これら 4 つだけが解決可能な属性です**(`src/core/auth/policy/policy.pdp.ts` の `SUBJECT_ATTRIBUTE_IDS`)。それ以外の名前 — `${subject.userID}` のようなタイプミス、または `${subject.id}` / `${subject.name}` — は、すべてのポリシー書き込みパス(作成 / 更新 / ポリシーセット / XACML インポート)において**書き込み時に `400` で拒否されます**([#1939](#unresolved-subject-templates-1939))。

#### 未解決の `${subject.*}` テンプレート (#1939)

\#1939 以前は、解決不可能なテンプレートはその `matchValue` が**スキップ**され、囲んでいるグループが `NoMatch` に、ルールが `NotApplicable` になりました。`Permit` ルールの場合は特権を削除するので安全ですが、**`Deny` ルールの場合は拒否が黙って適用されなくなり**(フェイルオープン)、書き込み API は `201` を返すため、ポリシー作成者には何の通知もありませんでした。

これを解決するため、上記の `string-regexp` の扱いを反映して 2 つのレイヤーが導入されました:


1. **書き込み時** — 任意の `matchValue` 内の未知の subject 属性(`matchFunction` に関係なく)は `400` になります。
   
2. **評価時** — 未解決のテンプレートは処理不可能な `AttributeDesignator` となり、XACML 3.0 §7.6 に従って **`Indeterminate`** と評価され、フェイルクローズドで `Deny` に解決されます(そしてリストクエリの行フィルタでは「読み取り可能な行なし」/ `403` になります)。このレイヤーは、書き込み時バリデーションが存在する前に保存されたポリシーや、サービスレイヤーをバイパスするパス(例: `scripts/backup-import.ts`)によって復元されたドキュメントをカバーします。

> これは XACML の `MustBePresent=false` ケース(空のバッグ → マッチなし)**ではありません**。4 つの解決可能な属性はすべて `AuthzRequest` で必須なので、テンプレートが解決に失敗するのは属性 ID 自体が存在しない場合のみです — これは値の欠如ではなく、作成エラーです。

#### 例: エンティティ所有者のみのポリシー

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

このポリシーは、`entityOwner`(エンティティの `createdBy` 値)がリクエストしているユーザーの `userId` と一致する場合にのみアクセスを許可します。その他のすべてのリクエストは拒否されます。

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

このポリシーは、匿名ユーザーが `/opendata/` ServicePath配下のエンティティ(`/opendata/sensors` のようなネストされたパスを含む)を読み取ることを許可します。グロブパターン `/**` は 0 個以上のパスセグメントにマッチします。

> **NGSIv2 のみ (#1323)**: このパターンは、NGSIv2 が `Fiware-ServicePath` でエンティティを保存・フィルタリングするため機能します。NGSI-LD リクエストでは `servicePath` 属性は常に `/` です(ヘッダーは仕様がなく、データレイヤーによって無視されます)。そのため、上記のようなポリシーは NGSI-LD リクエストには決してマッチしません — これは設計によるものです。NGSI-LD には代わりに `scope` / `entityType` 制約を使用してください。

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

このポリシーは、`scope` が `/Madrid` 自体、またはその配下の子パス(例: `["/Madrid/parks"]`)であるエンティティへの読み取りアクセスを許可します。エンティティスコープは配列として保存され、カンマ区切りの文字列にシリアライズされる(例: `"/Madrid/parks,/Madrid/gardens"`)ため、意図しない部分マッチを避けるために境界を意識した `string-regexp` パターン(`(^|,)` と `(,|$)` アンカーを使用)を推奨します。単一値の完全一致には、`string-equal` が直接使用できます(例: `matchValue: "/Madrid"`)。

#### NGSI-LD スコープ認可: 3 つの実用的なパターン (#1659)

NGSI-LD の書き込み操作では、`scope` が存在しない(`missing` / `null` / `[]`)場合があります。その場合、認可は scope 属性を `''`(空文字列)として評価します。意図的に次のいずれかのポリシースタイルを選択できます:


1. **許可リスト (厳密)**: 特定のスコープのみを許可し (例: `/Public`)、それ以外については fail-closed 動作に依存します。\
   結果: スコープ未設定の書き込みは拒否されます (`403`)。
   
2. **拒否リスト + フォールバック許可**: 特定の禁止スコープを拒否し (例: `/Secret`)、その他の書き込みを許可します。\
   結果: スコープ未設定の書き込みは許可されます (`201`)。
   
3. **明示的な未設定制御**: `matchValue: ''` の明示的なルールを追加して、スコープなしエンティティを意図的に許可または拒否します。

#### Read=OR / Write=AND スコープセマンティクス (#1659)


* **読み取りパス (既存の動作)**: スコープマッチングは保存されたカンマ結合スコープ文字列を使用します (OR セマンティクス)。\
  例: `["/Public", "/Secret"]` は `/Public` リーダーに対して読み取り可能です。
  
* **書き込み先 (作成/移動)**: 各スコープ要素は独立した AuthzRequest として評価され、すべてが `Permit` でなければなりません (`evaluateAllPermit`、AND セマンティクス)。\
  例: `Permit(POST, scope~/Public)` のみの場合、`["/Public", "/Secret"]` の書き込みは拒否されます (`403`)。

この非対称性は意図的なものです: 読み取りの可視性は部分的 (OR) でも構いませんが、書き込みはすべての宛先スコープに対して承認される必要があります (AND)。複数の書き込みスコープを 1 つのカンマ結合承認リクエストに折りたたんではなりません。

#### バッチ書き込みは本文だけでなく既存エンティティを評価する (#1678)

バッチ書き込み操作 (`POST /ngsi-ld/v1/entityOperations/{upsert,update,merge,delete}`) は既に存在するエンティティを変更するため、リクエスト本文だけでは承認入力として不十分です。本文で宣言されたターゲット (`entityType` については #1325、宛先 `scope` については #1659) に加えて、GeonicDB は本文内のすべての `id` を単一のプロジェクションクエリで解決し、**保存されたエンティティの実際の `entityType`、`entityOwner` (`createdBy`)、および `scope`** を評価します — これは by-id パス (`checkEntityOwnership`) が使用するのと同じ属性です。


* **全許可**: いずれかの要素が `Permit` でない場合、書き込みが行われる前に全体のリクエストが `403` で拒否されます (部分適用なし)。これは `/v2/op/update` バッチセマンティクス (#1325) および NGSI-LD サブスクリプション作成 (#1104) と一致します。
  
* **移動セマンティクス**: *ソース
* スコープ (保存済み) とすべての *宛先
* スコープ要素 (本文、要素ごとの AND) がすべて許可されている必要があります。
  
* **作成は除外**: まだ存在しない id は作成として扱われ、本文で宣言された属性のみが適用されます。
  
* **曖昧な id** (1 つの id に対して複数のドキュメント、一意インデックスが欠落している場合のみ可能) は、**すべての** マッチングドキュメントに対して `Permit` が必要です (fail-closed)。
  
* **非 HTTP 呼び出し元**: MCP ツールと A2A スキルは HTTP コントローラーをバイパスするため、同じ強制ヘルパー (`syntheticCheckBatchEntityAuthz`) を呼び出します。したがって、ポリシーとして表現された制限は、HTTP、MCP、A2A で同一に保持されます。

実際的な結果: `Deny when scope ~ /Secret` のようなポリシーは、`PATCH /entities/{id}` をブロックするのとまったく同じように、`/Secret` 下に保存されたエンティティに対する `entityOperations/update` をブロックするようになりました。#1678 以前は、バッチシェイプはこれを静かにバイパスしていました。

> **ステータスコードに関する注意**: NGSI-LD (ETSI GS CIM 009) は承認失敗を定義していません — `207 Multi-Status` はエンティティごとの *操作* エラー (NotFound / BadRequestData) 用であり、Table 6.3.2-1 には AccessDenied エラータイプがありません。したがって、GeonicDB はリクエストレベルの `403` を返します。部分適用で `207` を返すと、バッチシェイプでの同じ制限が by-id シェイプよりも弱くなり、承認パリティ不変条件 (#1376) が壊れます。

#### 承認決定はそれが行われたドキュメントに固定される (#1943)

保存されたエンティティを評価すること (#1678) は保証の半分に過ぎません。承認クエリと書き込みは 2 つの別々のラウンドトリップであるため、その間に第三者が**エンティティを完全削除し、別のプリンシパルが同じ id で再作成する**ことができます。2 つのステップ間にリンクがないと、PDP が見たことのない `entityOwner` / `scope` を持つドキュメントに書き込みが着地します — これは承認バイパスであり、個々のステップはすべて正しく動作していたとしてもです。

GeonicDB は、評価されたドキュメントの識別情報を書き込みに持ち越すことでこれを閉じます:


* `getEntityAuthzContexts()` は、マッチングした各ドキュメントの **`_id`** を `entityOwner` / `scope` / `entityType` と共に返します。
  
* `checkBatchEntityAuthz()` は、それらの `_id` を **承認ピン** (`EntityAuthzPins`) として、エンティティ id をキーとして返します。
  
* その決定から派生したすべての書き込みは、MongoDB フィルターにピンを追加します: `_id ∈ {評価された ids}`。承認ステップが **存在しない** と見なした id (作成として扱われる) は、既存のドキュメントとマッチすることのない述語を取得し、書き込みを **挿入のみ** にします — したがって、競合ウィンドウ内で作成されたドキュメントも静かに更新されることはありません。

**なぜ `createdBy` やバージョンカウンターではなく `_id` なのか。** `createdBy` は挿入時 (`EntityRepository.create`) にのみ書き込まれ、更新されることはないため、ドキュメントの所有者は不変です; 所有者が変更される唯一の方法は削除 + 再作成であり、これは常に新しい `_id` を生成します。したがって、`_id` をピン留めすることで所有者の次元を正確に閉じます。`createdBy` をピン留めしても閉じません: `batchCreate` は `createdBy` を全く設定しないため、所有者のないドキュメントが別の所有者のないドキュメントに置き換えられた場合、等しいと比較されます。バージョンカウンター (`EntityDocument.version`、既に存在し、すべての書き込みパスで維持されている) は **意図的に使用されていません**: 書き込みと競合する *インプレース* 変更 — `scope` 移動を含む — は、書き込みが最初に発生したシリアル順序と等価であるため、承認違反ではありません。バージョンピン留めは、良性の並行更新を競合に変換するだけで、バルクパスの文書化された last-write-wins 動作を後退させます。

**「Deny での部分適用なし」契約との関係。** その契約 (#1325 / #1678 / #1928 / #1932) は *承認決定* に関するものであり、それは依然として事前に評価され、書き込み前にリクエストレベルの `403` を生成します。ピンの不一致は Deny ではありません — これは書き込み時に検出される並行性競合であり、ETSI GS CIM 009 が `207 Multi-Status` + `BatchOperationResult` のエンティティごとのエラーでモデル化しているものです。セキュリティ関連の保証は無条件であり、両方のシェイプで保持されます: **書き込みは PDP が評価しなかったドキュメントには決して着地しません。** バルクパスでは、不一致要素はエンティティ一意インデックス (`idx_entity_unique_v3`) で失敗し、エンティティごとのエラーとして報告されます; エンティティごとのループパス (`entityOperations/{update,merge,delete}`、`/v2/op/update` で `actionType=replace|delete`) では何もマッチせず、既存の `ResourceNotFound` エンティティごとのエラーとして表面化します。いずれの場合も、その要素は何も永続化しません。

**エンティティごとの `detail` は、原因が明確な場合にのみ原因を示します。** ピン留めされたバルク操作での重複キー失敗には、少なくとも 3 つの原因があります: 上記の TOCTOU スワップ; ソフト削除または期限切れになったドキュメント (バルク *replace* フィルターはライブ述語を持ちますが、承認クエリは #1678 に従って意図的に持ちません — これには競合が全く必要ありません); および承認が存在しないと見なしたときに 1 つのペイロードに同じエンティティ id が 2 回出現する場合。書き込みエラーは一般的にこれらを区別できないため、競合の文言 — およびリトライの提案 — は原因が確実な場合にのみ追加されます: ピンセットが空の場合 (承認はドキュメントを見なかったため、その後何かが id を要求したに違いありません)、または書き込みフィルターにライブ述語がない場合 (`batchUpsert`)、重複キーはピン留めされたドキュメントが消えたことだけを意味します。空でないピンを持つ `batchReplace` では、メッセージは単純な「エンティティが既に存在します」というテキストのままです。なぜなら、ソフト削除または期限切れのドキュメントで失敗している書き込みをリトライするように呼び出し元に伝えると、永遠にループするからです。いずれの場合も、生の MongoDB メッセージは返されません。インデックス名とキー値が別のテナントまたは所有者のスロット内のドキュメントの存在を開示するためです。

**バルクパスの結果は `idx_entity_unique_v3` に依存します。** 「何も永続化しない」が成立するのは、ピン留めされた upsert の挿入試行がエンティティ一意インデックスと衝突するためです。そのインデックスが存在しない場合 — 上記の曖昧な id を生成するのと同じ劣化状態 — 挿入は成功し、失敗する代わりに同じ `entityId` に対して *2 番目の* ドキュメントを追加します。セキュリティ不変条件は依然として保持されます (書き込みは PDP が評価しなかったドキュメントには着地しませんでした) が、要素はもはや no-op ではありません。エンティティごとのループパスはインデックスに依存しません: いずれの場合も何もマッチせず、`ResourceNotFound` を返します。同じ理由で、マージセマンティクスと暗号化エンベロープに供給されるバルク事前フェッチは、書き込みと同じピンでフィルタリングされます — そうしないと、その劣化モードで、スワップされたドキュメントから読み取られた属性が存続するドキュメントに書き込まれる可能性があります。

まだカバーされていない (別途追跡): 時系列バッチ書き込み (承認属性は `entities` コレクションにあり、書き込みは `temporal` コレクションをターゲットにするため、`_id` ピンは適用されません)、`purgeEntities` (述語で選択された id がピン留めされていない `deleteMany` に渡されます)、および単一エンティティ by-id パス (同じ read-then-write 構造を持ちます)。

#### 同じルールが NGSIv2 バッチと時系列バッチに適用される (#1928)

上記の契約は NGSI-LD 固有ではありません。さらに 2 つのバッチシェイプが同じ方法で保存されたエンティティを評価します:


* **`POST /v2/op/update`** (すべての `actionType` 値: `append` / `appendStrict` / `update` / `replace` / `delete`)。NGSIv2 には `scope` の概念がないため、`entityOwner` / `entityType` の次元のみが適用されます — 宛先スコープの AND 評価はありません。
  
* **`POST /ngsi-ld/v1/temporal/entityOperations/{upsert,delete}`**。時系列コレクションは `owner` / `scope` を保存しないため、— 時系列 by-id ルートがまったく同じように行うように (#1336) — 承認属性は **entities** コレクション (`createdBy` / `scope` / `entityType`) から読み取られます。

両方とも最初の書き込みの前に評価されるため、いずれかの要素での `Deny` は全体のリクエストを `403` で拒否し、何も永続化しません。MCP 時系列バッチツールは HTTP コントローラーをバイパスするため、同じヘルパー (`syntheticCheckBatchEntityAuthz`) を呼び出します。

\#1928 以前は、両方のシェイプが認証されたアクターを完全に破棄していました: `PATCH /v2/entities/{id}/attrs` または `PATCH /ngsi-ld/v1/temporal/entities/{id}` を `403` でブロックしたポリシーは、同じ書き込みをバッチエンドポイント経由で送信することでバイパスされ、`204` を返していました。

> **既知の制限 (#1928 / #1941 / #2434 で変更なし)**: 時系列 API を通じて `scope` メンバー *なしで* 作成されたエンティティは、entities コレクションにドキュメントがないため、記録された所有者がありません。そのようなエンティティには所有者ベースの制限がありません — バッチシェイプ *および* by-id シェイプの両方で同様であるため、承認パリティは保持されます。時系列のみのエンティティに所有権を付与することは別途追跡されています。`scope` を *持つ* 時系列作成は現在のエンティティを具体化します (#2434 A'-1)。したがって、スコープを持つ時系列のみの作成は **所有者なしではありません** — 具体化されたドキュメントは作成プリンシパルを `createdBy` として記録します。

#### 時系列履歴の作成は既存エンティティへの書き込みである (#1941)

`POST /ngsi-ld/v1/temporal/entities` と `POST /ngsi-ld/v1/temporal/entityOperations/create` は作成のように見えますが、ターゲット id が **entities** コレクションに既にドキュメントを持っている場合、*他人の* エンティティに履歴を書き込みます。#1941 以降、両方とも最初の書き込みの前に、保存された `entityOwner` / `scope` / `entityType` を評価します — すべての時系列ルートが行うように (#1336)、entities コレクションから読み取ります。

このギャップは見落としやすいものでした。なぜなら、唯一の既存のガードである `temporalEntityExists` は、**temporal** コレクション単独を検査するからです。したがって、バイパスウィンドウは正確に「entities が外部所有のドキュメントを持っている **かつ** temporal ドキュメントがまだない」でした: `AlreadyExists` なし、所有権チェックなし、`201`。`PATCH /ngsi-ld/v1/temporal/entities/{id}` から `403` を受け取ったプリンシパルは、`create` を通じて同じエンティティの履歴を捏造できました — これは #1363 / #1325 / #1678 / #1928 / #1932 ファミリーのリクエストシェイプパリティブレークです。

バッチ作成はエンティティごとの *操作* エラーに対して `207 Multi-Status` を返しますが、承認はループの **前に** リクエスト全体に対して評価されます: いずれかの要素での `Deny` はすべてを `403` で拒否し、何も永続化しません。要素ごとにスコアリングすると、バッチシェイプが by-id シェイプよりも弱くなり、これが修正されている欠陥です。

entities コレクションドキュメントがない id は依然としてスキップされるため、真に時系列のみのエンティティ (`scope` メンバーがないもの) は以前とまったく同じように作成されます。スコープを持つ本文は唯一の例外です (#2434 / #2758 / #2796 / #2814 A'-1):
HTTP by-id `POST /temporal/entities`、HTTP `entityOperations/create` / `upsert`、および MCP `create` /
`batch_create` / `batch_upsert` はすべて現在のエンティティを具体化するため、`GET /entities/{id}` と
`DELETE /entities/{id}/attrs/scope` は直後に機能します。
MCP / A2A パスレベル承認は、同じ宛先 `scope` を (`buildTemporalCreatePathAuthzBody` 経由で) 渡さなければなりません

HTTP の `targetsFromEntityArray` / `extractScopeFieldFromBody` が評価を行います — そうしないと A'-1 が Deny スコープを永続化し、HTTP がそれを拒否してしまいます (#2796 / #2814)。バッチパスでは、1 つのエンティティのマテリアライゼーション失敗は、そのエンティティの `207` の `errors[]` エントリにマッピングされ、その一時的な書き込みをスキップします (他のエンティティは継続します)。A2A の `temporal` スキル (`create`) も同じヘルパーを呼び出します。

#### 通知インテークは書き込みであり、免除ではない (`POST /v2/op/notify`

、#1932)

`POST /v2/op/notify` は通知インテークエンドポイントです:上流のContext Brokerまたはコンテキストプロバイダが `{ subscriptionId, data: [...] }` ペイロードを送信し、GeonicDB はローカルエンティティに `data[]` を追加します。#1932 以降、最初の書き込みの前に `data[]` のすべての要素の**保存された** `entityOwner` / `entityType` を評価します。これは `actionType: append` での `POST /v2/op/update` と全く同じです。NGSIv2 仕様も Orion API もこのエンドポイントの認可を定義していないため、選択は GeonicDB のものです。決定ルールはパリティ不変式 (#1376) です:


* **呼び出し元はポリシーによって評価されるプリンシパルであり、匿名のワイヤーではありません。** `/v2/op/notify` は特別な認証契約を持っていません — 他のすべてのデータルートと同様に `optionalAuth` を通過します。つまり: `AUTH_ENABLED=false` の場合、すべてのリクエストは `super_admin` として扱われます。`AUTH_ENABLED=true` の場合、資格情報付きリクエストは独自のプリンシパルになり、資格情報なしのリクエストは `role=anonymous` になります。デフォルトポリシーはパスステージで Deny しますが、カスタム `Permit` で許可することができます。どのプリンシパルになっても、それは ID ベースのルートが見るのと同じプリンシパルです。テナントポリシーが他の誰かが所有するエンティティへの書き込みを拒否する場合、その拒否は意図的であり、これを含むすべてのリクエスト形状で保持されなければなりません。
  
* **通知はリクエスト*形状*であり、権限レベルではありません。** これを免除すると、`/v2/op/notify` に対して同じポリシーが `PATCH /v2/entities/{id}/attrs` よりも弱くなります — これは #1363 / #1325 / #1678 / #1928 の正確な欠陥クラスです。強制されないままにすると、エンドポイントに到達できる任意のプリンシパルがテナント全体に対する普遍的な書き込みプリミティブを保持します。
  
* **`subscriptionId` は決して認可入力ではありません。** これは呼び出し元が提供する自由形式の文字列 (`Ngsiv2NotifySchema`) であるため、そこから権限を導出すること — 例えば「登録されたサブスクリプションを指名する者を信頼する」— は構造的にフェイルオープンになります。認証されたアクターと保存されたエンティティ属性のみが使用されます。また、照合するものがないことにも注意してください: この ID は**通知を送信したContext Broker上の**サブスクリプションを識別し、受信Context Brokerはそれに関する記録を保持していません。サブスクリプション由来の認可はここでは安全でないだけでなく、操作するデータがありません。

作成は影響を受けません:保存されたドキュメントがない ID は作成としてスキップされるため、新しいエンティティを導入する通知は以前と全く同じように動作します。ブロックされるのは、ポリシーが保護する**既存の**エンティティの上書きです。上流のContext Brokerが所有していないエンティティを上書きできるようにしたいデプロイメントは、欠落したチェックに依存するのではなく、ポリシーでそう宣言する必要があります (例えば、`/v2/op/notify` でその `userId` に対する `Permit` ルール)。

**認可ルックアップは書き込みが触れるものの上位集合でなければなりません。** 認可属性を解決するプロジェクションクエリは、読み取りパスが適用する「ライブ」述語 (`deletedAt` / `expiresAt`) を意図的に省略しています。これは、バッチ書き込みフィルタもそれらを適用しないためです。認可ルックアップが任意の述語 (tenant / servicePath / protocol / soft-delete / expiry / type) において書き込みよりも狭い場合、影響を受けるドキュメントは認可にとって*存在しない*ように見え、作成として扱われ、チェックを完全にスキップします — サイレントなフェイルオープンです。過剰な包含は無害です:認可が見ることができても読み取りができないドキュメントは、その後も `404` として返されます。

### デフォルトポリシー

GeonicDB は以下のロールデフォルトポリシーを設定します (信頼できる情報源: `src/core/auth/policy/policy.defaults.ts`):


* **`super_admin`**: 管理 API (`/admin/**`)、読み取り専用統計/メトリクス、および `/me/**` で Permit。拒否フェンス (優先度 `-1`、上書き不可) がデータ API (`/v2/**`、`/ngsi-ld/**`、`/catalog/**`、`/rules/**`、`/custom-data-models/**`、`/mcp`) をブロックします — プラットフォーム管理者はテナントデータに触れることができません。`/a2a` はフェンスにリストされていませんが、デフォルトの Permit もないため、フェイルクローズパスステージによって同様に拒否されます。
  
* **`tenant_admin`**: すべてのデータ API、AI ツールエンドポイント `/mcp` および `/a2a` (#1651)、およびテナントスコープの管理 API で Permit (すべてのメソッド)。
  
* **`user`**: NGSI API (`/v2/**`、`/ngsi-ld/**`) で Permit (CRUD)。`/catalog/**`、`/rules/**`、`/custom-data-models/**`、および `/mcp` では `GET` のみ。さらに `/me/**` と読み取り専用統計/メトリクスエンドポイント。MCP ツール呼び出しトランスポートは `POST /mcp` で、A2A は `POST /a2a` です — **どちらも `user` デフォルトではカバーされていません** (`GET /mcp` のみ。`/a2a` は全くなし)。したがって、`user` が MCP / A2A ツールを呼び出すには、`api_key` / `oauth_client` と同様にカスタム Permit ポリシーが必要です。
  
* **`api_key` / `anonymous` / `oauth_client`**: 空ルールデフォルト (`rules: []`) — デフォルトの `Permit` がないため、すべてのリクエストは `NotApplicable` と評価され、フェイルクローズ PEP によって `403` で拒否されます (明示的な XACML `Deny` ではありません。[パスレベル vs エンティティレベル認可](#path-level-vs-entity-level-authorization) を参照)。明示的な Permit ポリシーがバインドされるまで、実質的にアクセスできません。

`tenant_admin` が作成するカスタムテナントポリシーは、許可リスト `TENANT_POLICY_ALLOWED_PATH_PREFIXES` (`/v2/`、`/ngsi-ld/`、`/catalog`、`/rules`、`/custom-data-models`、`/mcp`、`/a2a`) 内のパスのみをターゲットにできます — これは MCP / A2A ツールアクセス (`POST /mcp` / `POST /a2a`) を `user` / `api_key` / `oauth_client` プリンシパルに付与する方法でもあります ([MCP / A2A ツール認可](#mcp--a2a-tool-authorization-1610--1651--1672) を参照)。

### 匿名アクセスポリシー (GeonicDB 拡張)

GeonicDB は、テナント管理者によって設定された場合、データ API への匿名(認証なし)アクセスをサポートします。これは、認証を必要とせずに公開データ(例:気象観測、オープンデータセット)を公開する場合に便利です。

#### 前提条件


1. **明示的な Permit ポリシーを作成する**: `role=anonymous` をターゲットとして、希望するアクセスレベルを設定します(#748 以降、機能フラグは不要)

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

ブラウザ / Node アプリの場合、SDK は `anonymous: true` オプションを使用して同じフローをサポートします(トークン取得なし、`Authorization` ヘッダーなし)。`docs/SDK.md` を参照してください。

```javascript
const db = new GeonicDB({
  baseUrl: 'http://localhost:3000',
  tenant: 'mytenant',
  anonymous: true,
});
const entities = await db.getEntities({ type: 'WeatherObserved' });
```

#### セキュリティモデル


* **フェイルクローズド**: 明示的な Permit ポリシーがない場合、すべての匿名リクエストは拒否されます(403)。
  
* **ポリシーなし = 拒否**: 匿名アクセスには常に明示的な XACML Permit ポリシーが必要です。
  
* **管理 API は決してアクセスできない**: 匿名ユーザーは、ポリシーに関係なく `/admin/*`、`/auth/*`、または `/me/*` エンドポイントにアクセスできません。
  
* **テナント分離**: 匿名リクエストには `Fiware-Service` ヘッダーを含める必要があります。匿名ユーザーは指定されたテナントにバインドされ、他のテナントのデータにアクセスできません。
  
* **取り消し可能**: XACML Permit ポリシーを削除すると、すべての匿名アクセスを即座にブロックできます。
  
* **認証情報が提示されたが無効 → 401、匿名ではない(#2794)**: `optionalAuth`(データ API / `/custom-data-models` / MCP / A2A)は、認証情報が欠落している場合は `role=anonymous` として扱いますが、**提示された** `Authorization` または `X-Api-Key` ヘッダー(空の Bearer / 不正な形式を含む)が検証に失敗した場合は `401 Authentication required` を返します。失敗した認証情報を匿名にダウングレードすると、以前は `403 Access denied: no applicable policy` として表示され、401 をキーとするクライアントのリフレッシュロジックがブロックされ、匿名 Permit ポリシーを暗黙的に許可する可能性がありました。

***

## ポリシー伝播遅延と HTTP キャッシュの整合性 (#1050)

XACML ポリシーが `/admin/policies` 経由で追加、変更、または削除されると、Lambda インスタンスがキャッシュされた評価をまだ提供している可能性がある小さな時間枠が存在します。

### キャッシュレイヤー


1. **`PolicyService` インスタンスキャッシュ (TTL: `AUTH.POLICY_CACHE_TTL_MS` = 60s)** — `findActivePoliciesForTenant(tenantId)` の結果の Lambda インスタンスごとのインメモリキャッシュ。同じ Lambda インスタンス内でのポリシーの作成 / 更新 / 削除操作時に無効化されますが、他の Lambda インスタンスは TTL の期限切れに依存します。
   
2. **データエンドポイントには HTTP / CDN キャッシュなし** — すべてのデータエンドポイントは `Cache-Control: private, no-cache` を返します (#1047)。共有キャッシュはこれらのレスポンスを保存してはならず、プライベートキャッシュでさえも再検証が必須です。したがって、ポリシーの変更は、次のリクエストが新しい PolicyService キャッシュを持つ Lambda に到達するとすぐに (≤ 60s) 伝播されます。

### 最悪の場合の伝播遅延


* **単一の Lambda インスタンス**: 即座 (同じ書き込みでキャッシュが無効化される)。
  
* **複数の Lambda インスタンス**: すべてのインスタンスが変更を取得するまで最大 `POLICY_CACHE_TTL_MS` (デフォルト 60s)。

これはほとんどの認可変更にとって許容範囲です。即座の失効が必要な場合は、Lambda インスタンスを再起動するか、ユーザーのトークンをローテーションして強制的に再認証させてください。

### ポリシー失効後の HTTP キャッシュの整合性

ハンドラは tests/unit/handlers/api/index.test.ts のユニットテスト の `#1050` リグレッションテストでロックされたこの固定順序でミドルウェアを評価します:

```text
extractAuthContext → optionalAuth → checkTenantAccess → requireAuthz (XACML PEP)
  → controller (200 + ETag)
  → evaluateConditionalRequest (200 → 304 if If-None-Match matches)
```

`requireAuthz` が `ForbiddenError` をスローすると (ポリシーが失効)、レスポンスは `catch` ブロックを通過し、`4xx` を直接返します — `evaluateConditionalRequest` は**呼び出されません**。したがって、クライアントが失効前の古い ETag と一緒に `If-None-Match` を送信しても、サーバーは `403` を返し、決して `304` を返しません。古いビューは再浮上できません。

### 運用上の推奨事項


* **監査上重要な失効**は、トークン無効化 ([Token Invalidation](#token-invalidation) を参照) と組み合わせて、ユーザーを強制的にログアウトさせ、進行中のキャッシュされたレスポンスがクライアントによって信頼されることを防ぐべきです。
  
* **ポリシーホットフィックス** (≤ 60s の伝播) は、ほとんどの運用上の変更に対して十分です。ポリシー変更を伝達する際には、伝播の期待値を文書化してください。

***

## リソーススコープ

> **#748 で削除済み**(JWT 埋め込みの `resourceScopes` と評価 middleware)。細粒度制御は XACML ポリシーを使う。残骸クリーンアップは #2263。

***

## テナントごとの機能フラグ (非推奨)

> **#748 で削除**: テナント機能フラグ (`apiKeysEnabled`、`oauthClientsEnabled`、`anonymousAccessEnabled`) は削除されました。認可は現在、ロールベースのデフォルトを持つ XACML ポリシーによって完全に処理されます:
>
> * API キー: デフォルト拒否、明示的な XACML 許可ポリシーが必要
> * OAuth クライアント: 常に利用可能 (機能フラグゲートなし)
> * 匿名アクセス: デフォルト拒否、明示的な XACML 許可ポリシーが必要 (機能フラグ不要)

***

## 認証シナリオリファレンス

### ロール別アクセス許可サマリー

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

> **⚠️ ポリシー依存**: `role=anonymous` を対象とした明示的な XACML Permit ポリシーが必要です。これがない場合は 403 を返します。
>
> **カタログ認証情報 (#2472)。** `/catalog/**` に対するパスレベルの `Permit` だけでは `api_key` / `oauth_client` / `anonymous` には不十分です。カタログは合成された `GET /v2/entities` 評価 (#2465 / #2471) から行フィルタを導出します。一致する entities の Permit がない場合、導出は `kind:'none'` となり、カタログは **403** を返します。[Catalog read credentials](#catalog-read-credentials-2465--2468--2472) を参照してください。

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

ユーザーごとにタイムスタンプ(`invalidatedBefore`)が保持されます。「この時刻より前に発行されたトークンは無効」となります。トークンの `iat`(発行時刻)がこのタイムスタンプより前であれば、そのトークンは無効と判定されます。

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
  
* ログアウト直後(同じ秒以内)の再ログインは安全です。JWT の `iat` は 1 秒精度であるため、新しく発行されたトークンは `iat` を無効化の閾値を超えて進めます(`iat = max(now, invalidatedBefore)`、最大で未来の 1 秒)。そのため無効化のウィンドウに捕捉されません。逆に、各無効化の書き込みは閾値を引き上げます(`max(now + 1, current + 1)`)ので、先行したトークンでも後続のログアウトによって確実に無効化されます(#1351)

### WebSocket トークンの再検証

WebSocket 接続では、接続確立時に JWT の `exp`(有効期限)が DynamoDB に保存されます。その後のメッセージ受信時に `exp` が再検証され、トークンが期限切れの場合は `401` が返されます(OWASP API2:2023 準拠)。


* 接続時:`connect` ハンドラーが `ConnectionRecord` に `tokenExp` を保存します
  
* メッセージ受信時:`default` ハンドラーが `tokenExp` を現在時刻と比較します

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

> **注意**: 待機時間内に再試行すると `429 Too Many Requests` (および `Retry-After` ヘッダー) が返されます。段階的な遅延は次のリクエスト (`checkLoginAllowed`) で適用され、失敗応答自体は `401` です。

#### OAuth トークンエンドポイント (`POST /oauth/token`

)

`client_id` ごとに認証失敗回数を追跡します。動作ルールはログインエンドポイントと同じです (段階的な遅延 + アカウントロック)。


* **追跡キー**: `oauth:<clientId>` の形式で `LoginProtectionService` を共有
  
* **成功時**: カウンターリセット
  
* **非アクティブなクライアント**: 認証失敗として記録

### 設計原則


* **メールベース**: IP アドレスは VPN / プロキシで簡単にバイパスできるため、メールアドレスごとに追跡
  
* **Lambda 最適化**: `sleep()` による遅延の代わりに `429 + Retry-After` ヘッダーで応答 (Lambda 課金コストを回避するため)
  
* **自動クリーンアップ**: MongoDB TTL インデックスにより、試行記録は 1 時間後に自動削除
  
* **有効化 / 無効化から独立**: ブルートフォース保護は自動化されたセキュリティメカニズムであり、管理者による手動の有効化 / 無効化操作とは別に管理されます

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

GeonicDB は、OWASP API1:2023 (Broken Object Level Authorization) への対策として、Subscriptions および Registrations に対する所有権検証を提供します。

### 概要

NGSI 仕様では、テナント分離 (`Fiware-Service` ヘッダー) のみでアクセス制御を行いますが、マルチユーザーテナント環境では課題があります: 同じテナント内のユーザーが他のユーザーのリソースを操作できてしまいます。GeonicDB は `createdBy` フィールドを導入し、書き込み操作時に所有権を検証します。

### 対象リソース

| Resource                                                               | Target Operations      |
| ---------------------------------------------------------------------- | ---------------------- |
| Subscription (`/v2/subscriptions`, `/ngsi-ld/v1/subscriptions`)        | UPDATE, DELETE         |
| Registration (`/v2/registrations`, `/ngsi-ld/v1/csourceRegistrations`) | UPDATE, DELETE         |
| Context source subscription (`/ngsi-ld/v1/csourceSubscriptions`)       | UPDATE, DELETE (#2188) |
| Custom data model (`/custom-data-models`)                              | UPDATE, DELETE (#2198) |

> **カスタムデータモデルは #2198 で追加されました。** これらは作成時に `createdBy` を保存していましたが、`CustomDataModelService.updateDataModel` / `deleteDataModel` は `repository.get` による存在チェックのみを行っていたため、テナントへの書き込み権限を持つ任意のプリンシパルが他のユーザーのモデルを更新または削除できました — そして削除は自動生成された JSON-LD コンテキストと一意制約インデックスも削除します。ルートガード (`requireAuth + checkTenantAccess + requireAuthz`) はテナント境界とパス/メソッド認可を強制しますが、**リソースごとの所有権は強制しません**。これらは現在、他の 3 つのリソースとまったく同じ契約に従っています。**1 つの相違点 (#2189): サブスクリプション、レジストレーション、csource-subscriptions の場合、所有者の不一致は `404` を返します (欠落している `createdBy` と同じ) が、カスタムデータモデルは `403` を維持します** — カスタムデータモデルは行レベルの読み取り述語の対象ではないため、その存在は制限された呼び出し元から隠されず、閉じるべき存在オラクルもありません。他の 3 つについては、`404` と `403` は異なります (`403` はドキュメントが存在することを明らかにする) ため、それらは `404` に統一されます。テナント全体の共有スキーマは、`tenant_admin` として編集することで引き続き可能です。ガードは MCP エントリポイント (`src/api/mcp/tools/config.tools.ts`) もカバーしており、同じサービスメソッドを呼び出します。
>
> **コンテキストソースサブスクリプションは #2188 で追加されました。** これらは `createdBy` を保存していました (#2133) が、`CSourceSubscriptionService.updateSubscription` / `deleteSubscription` は所有権チェックを全く実行せず、`actor` さえ渡されなかったため、テナント内の任意の認証されたプリンシパルが他のユーザーの CSR サブスクリプションを更新または削除できました。これらは現在、他の 2 つのリソースと同じ契約に従っています (管理者バイパス / 欠落している `createdBy` → `404` / 所有者の不一致 → `404` (#2189 以降))。`requireSubscriptionUpdateAuthz` (#2005) はこれをカバー**しません**: これは *更新後の有効な値* をサブスクリプションライブできるかどうかを評価するものであり、呼び出し元が他の誰かのサブスクリプションを変更できるかどうかを評価するものではありません。
>
> **注**: 読み取り操作 (GET/LIST) は所有権チェック自体によって制限されません。NGSI 仕様に準拠したテナント分離が適用され、さらに — #2140 (サブスクリプション) / #2084 (レジストレーション) 以降 — 読み取りは行レベルの読み取り述語を通過し、プリンシパルが読み取ることができないエンティティタイプを宣言しているドキュメントを編集または非表示にします。

### ロールごとの動作

| Role           | Own resource | Other's resource        | createdBy not set (legacy)               |
| -------------- | ------------ | ----------------------- | ---------------------------------------- |
| `super_admin`  | ✅ Operable   | ✅ Operable (bypass)     | ✅ Operable                               |
| `tenant_admin` | ✅ Operable   | ✅ Operable (bypass)     | ✅ Operable                               |
| `user`         | ✅ Operable   | ❌ 404 Not Found (#2189) | ❌ 404 Not Found (**fail-closed**, #2161) |

> カスタムデータモデルの場合、`user` に一致する「他者のリソース」セルは `403 Forbidden` を返します (`404` ではありません); 上記 #2198 の相違点の注記を参照してください。

### 動作仕様


1. **作成時**: 認証済みユーザーの ID は、リソースが作成されたときに `createdBy` フィールドに自動的に記録されます
   
2. **更新/削除時**: リクエストしているユーザーの ID が `createdBy` と照合されます
   
   * 一致: 操作が許可されます
     
   * 不一致: `404 Not Found` を返します(**「そのようなドキュメントは存在しない」と区別不可能**、#2189)
     
   * `createdBy` が設定されていない(このフィールドが存在する前に作成されたレガシーデータ): 非管理者に対して `404 Not Found` を返します(#2161)
     
3. **管理者バイパス**: `super_admin`/`tenant_admin` は所有権チェックをスキップします — ただし、以下のフェンス注記を参照してください:
   認証が有効な場合、`super_admin` はこれらのエンドポイントに全く到達しないため、実際にこれらのリソースを管理できる唯一の管理者は `tenant_admin` です
   
4. **認証が無効な場合**: `AUTH_ENABLED=false` の場合、所有権チェックはスキップされます

> **データ API では `super_admin` バイパスは到達不可能です(認証が有効な場合)。**
> `SUPER_ADMIN_DATA_API_DENY_FENCE`(`policy.defaults.ts`)は `super_admin` に対して `/v2/**`、`/ngsi-ld/**`、
> `/catalog/**`、`/rules/**` をハード拒否します。これはカスタムポリシーでは解除できない deny-overrides フェンスです
> — プラットフォーム管理者はテナントデータに触れることができてはなりません。所有権チェックの
> `actor.role === 'super_admin'` の早期リターンは、したがって `AUTH_ENABLED=false` の場合
> (すべてのリクエストが合成 `super_admin` になる)または内部呼び出し元からの場合にのみ実行されます。以下の行は
> 「エンドツーエンドの到達可能性」ではなく「所有権チェック自体が行うこと」として読んでください。
>
> **レガシードキュメントは fail-closed であり、ステータスコードは `403` ではなく `404` です(#2161)。** #2161 以前は
> ガードは `doc.createdBy && doc.createdBy !== actor.id` と読み取っていたため、**`createdBy` がない**ドキュメントは
> 条件全体を false にし、テナント内の*すべての*認証済みプリンシパルがそれを更新または削除できました
> (「不明な所有者は通過する」)。これには 2 つの問題がありました。第一に、それ自体が Broken Object Level
> Authorization の脆弱性です。第二に、#2140 / #2084 が読み取りを行レベル
> 述語を通過させると、タイプを拒否されたプリンシパルは `GET` では `404` を取得しますが、まったく同じ
> ドキュメントに対する `DELETE` では `204` を取得します — この違い自体がドキュメントが存在することを明らかにします(**存在オラクル**)、その上に
> 呼び出し元がそれを破壊することを許可します。レガシードキュメントに対して `404` を返すことで、所有権チェック自体を
> 「そのようなドキュメントは存在しない」と区別不可能にし、両方を閉じます。`403` ではそうはなりません:それは存在を確認し、同じ
> リーククラス #1370 が閉じ、同じ理由で #1963(entityMaps)が `404` を選択しました。(#1945(snapshots)は
> 同じ **fail-closed** 呼び出しをレガシー行に対して行いましたが、`403` を維持しました — `SnapshotService.checkSnapshotOwnership`
> は `ForbiddenError` を返します; #1963 のみが所有者を Mongo クエリに組み込んで「存在するがあなたのものではない」
> と「存在しない」が分岐できないようにします。)
>
> **#2189 が閉じたもの。** 上記の `404` は当初、レガシー(`createdBy` が欠落)セルのみに適用されていました。
> 隣接する 2 つのパスは、呼び出し元が読み取れない可能性のあるドキュメントに対して依然として `403` を返し、
> したがってその存在を明らかにしていました。両方とも現在 #2189 によって閉じられています:
>
> * **所有者不一致。** 別のユーザーによって作成されたドキュメントは `403` を返し、存在しない id は
>   `404` を返します — `403` 自体がドキュメントが存在することを確認していました。所有者不一致は現在 `404` を返し、
>   存在しない id と一致するため、非所有者は両者を区別できません。(`#2005` 更新承認も
>   既存のドキュメントに対して評価されるため、ポリシーで拒否されたサブスクリプションライバーも `404` を観測します。)
> * **NGSI-LD `PATCH` ルート。** サブスクリプション更新承認(`requireSubscriptionUpdateAuthz`,
>   \#2005)は、所有権チェックの*前に*既存のドキュメントに対して評価されていたため、そのポリシーで拒否されたプリンシパルは
>   `createdBy` に関係なく `403` を取得していました。所有権チェックは現在最初に実行されるため、
>   非所有者はポリシーが参照される前に `404` を取得します。
>
> 残りの非対称性 — 呼び出し元が*読み取れる*レガシードキュメントは `GET` に `200` で応答しますが、
> `DELETE` には `404` で応答します — は意図的で安全です(書き込みを拒否します)が、「不可視」ではありません:呼び出し元は依然として
> `GET` を介してリソースが存在することを知ることができます。これは書き込みパスオラクルのスコープ外です(`GET` は設計上
> 許可されたプリンシパルに読み取り可能です)。
>
> **運用上の結果**: `createdBy` が存在する前に作成されたサブスクリプションとレジストレーションは、通常のユーザーによって更新または削除できなくなります — 元々作成した人を含め、
> 保存されたドキュメントには照合する所有者が記録されていないためです。`tenant_admin` はそれらの
> ドキュメントへの完全なアクセスを保持します(意図されたエスケープハッチ — 上記のフェンス注記により、`super_admin` はできません); 認証済みプリンシパルの下でリソースを再作成すると、通常のセルフサービス管理が復元されます。

### エラーレスポンス

サブスクリプション / レジストレーション / csource-subscriptions の場合、所有者不一致は
存在しない id と区別不可能であるため、NGSIv2 / NGSI-LD エラーエンベロープは `404` と同じです:

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

* ログイン失敗回数が多すぎる (ブルートフォース攻撃からの保護)
  
* アカウントがロックされている

**解決方法:**

* `Retry-After` ヘッダーに示された秒数だけ待ってから再試行する
  
* ロックされている場合は、管理者に `POST /admin/users/{userId}/unlock` を使用してロックを解除してもらう

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
  
* XACML ポリシーによって拒否されている

**解決方法:**

* ユーザーのロールを確認する
  
* `Fiware-Service` ヘッダーがユーザーのテナントと一致することを確認する
  
* ポリシー設定を確認する

### Admin API アクセスエラー

**考えられる原因:**

* `super_admin` ロールではない (JWT 認証を使用している場合)
  
* OAuth トークンに必要な `admin:*` スコープが不足している
  
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
  
* Development Guide - API 仕様 (ページネーション、ステータスコード) とデプロイメント
  
* [XACML 3.0 Specification](https://docs.oasis-open.org/xacml/3.0/xacml-3.0-core-spec-os-en.html) - 公式 XACML 3.0 仕様
