---
title: "Authentication Guide"
description: "GeonicDB authentication and authorization guide"
outline: deep
---
# 認証と認可ガイド

このドキュメントでは、GeonicDB の認証と認可機能の全体像、セットアップ、および管理について説明します。

## 目次


* [概要](#overview)
  
* [認証アーキテクチャ](#認証アーキテクチャ)
  
* [初期セットアップ](#初期セットアップ)
  
* [ユーザーとテナント管理](#user--tenant-management)
  
* [API キー認証](#api-キー認証)
  
  * [API キートークン交換 (Browser SDK)](#api-key-token-exchange-browser-sdk)
    
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

> **注意**: `super_admin` は SaaS セキュリティのためプラットフォーム管理操作に制限されています。
> 顧客データの分離が強制されており、`super_admin` 資格情報を持つ Geolonia スタッフはテナントのエンティティデータにアクセスできません。
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

GeonicDB の認証・認可は以下のレイヤーで構成されています。

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

## JWT 鍵ローテーション (#1449)

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

認証を有効にするために、以下の環境変数を設定します。

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

SAM テンプレートで以下のパラメータを設定します:

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

* データベースに保存されません(メモリ内のみ)
  
* サーバー再起動後も同じ認証情報で利用可能
  
* パスワードを変更するには、環境変数を更新してサーバーを再起動する必要があります

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

### デプロイメントルーティング管理 (super\_admin のみ)

ホスト名 → MongoDB クラスタルーティング行。これらはすべてのデプロイメントにまたがるため、`tenant_admin` は読み取りアクセスも拒否されます — そうでなければ、テナント管理者が他のすべてのデプロイメントのクラスタ配線を読み取ることができてしまいます。[API.md](../api-reference/endpoints.md#deployment-routing-management-super_admin-only) および DEDICATED\_CLUSTER\_ONBOARDING.md を参照してください。

| Endpoint                        | Method | Description                     |
| ------------------------------- | ------ | ------------------------------- |
| `/admin/deployments`            | GET    | List deployment routing rows    |
| `/admin/deployments`            | POST   | Create a deployment routing row |
| `/admin/deployments/{hostname}` | GET    | Get a deployment routing row    |
| `/admin/deployments/{hostname}` | PATCH  | Update a deployment routing row |
| `/admin/deployments/{hostname}` | DELETE | Delete a deployment routing row |

平文の `mongodbUri` は決して返されません。現在のリクエストを処理しているデプロイメントの削除または無効化は、409 で拒否されます (自己ロックアウト防止)。

### CADDE 構成管理 (super\_admin のみ)

| Endpoint       | Method | Description                          |
| -------------- | ------ | ------------------------------------ |
| `/admin/cadde` | GET    | Get CADDE configuration              |
| `/admin/cadde` | PUT    | Update CADDE configuration (upsert)  |
| `/admin/cadde` | DELETE | Delete CADDE configuration (disable) |

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

管理者はユーザーに**一時パスワード**を発行してオンボーディングを行い、ユーザーは初回ログイン時にそれを置き換える必要があります。強制は**単発**です。一時パスワードはブートストラップ認証情報であり、その唯一の機能は新しいパスワードを設定することです。使用可能なトークンを生成することはないため、エンティティの読み取りや API キーの発行はできません。

**注意:** 一時パスワードは 2 つのケースでサーバー生成されます。(a) `"passwordResetRequired": true` でユーザーを作成する場合(招待)、または (b) 既存ユーザーに対して `reset-password` を呼び出す場合(忘れたパスワードのリセット方法でもあります)。`passwordResetRequired` **なし**でユーザーを作成すると、指定された `password` が直接設定され、変更は**強制されません**(非破壊的)。

**1. 管理者がアカウントを発行する** — 作成時(招待)またはその後(リセット)

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


* 認可: `super_admin`(すべてのユーザー) / `tenant_admin`(自分のテナント内のユーザー)。
  
* 一時パスワードは**一度だけ**表示され、レスポンスには `Cache-Control: no-store` が付きます。`PASSWORD_POLICY.TEMP_PASSWORD_VALIDITY_DAYS`(デフォルト **7 日間**)後に期限切れになります。`reset-password` はユーザーの既存セッションを無効化します(招待は新規ユーザーを作成するため、無効化するセッションはありません)。

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

**機械可読エラーキー**(`error` フィールド; CLI/SDK はメッセージではなくこれで分岐します):

| Status | `error`                    | Meaning                                                                                                     |
| ------ | -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `409`  | `PasswordResetRequired`    | Temp password valid; submit `newPassword` to complete login                                                 |
| `403`  | `TemporaryPasswordExpired` | Temp password expired (or issue timestamp missing → fail-closed); ask admin to re-issue                     |
| `400`  | `BadRequest`               | `newPassword` equals the temp password, violates the password policy, or was sent when no reset is required |

**保証**


* パスワードが変更されるまでトークンは発行されません(フェイルクローズド)。ビジネス分岐は一時パスワードが検証された**後**に発生するため、アカウント状態は認証されていない呼び出し元に漏洩することはありません。
  
* 同時完了は compare-and-set 更新によって保護されます(敗者は `409 Conflict`)。
  
* `refreshToken()` も強制変更待ちのユーザーを拒否します(多層防御)。
  
* リセットはユーザーの**パスワード由来の JWT セッションのみ**を無効化します — API キー / OAuth クライアントは動作し続けます。侵害が疑われる場合は、それらを個別に取り消すか、ユーザーを `deactivate` してください。
  
* `PATCH /admin/users/{userId}` 経由でパスワードを直接設定すると、強制変更状態が**クリア**され、**ユーザーの既存のパスワード由来セッションが取り消されます**(#1566)。管理者が選択したパスワードは即座に使用可能になり、ユーザーは次回ログイン時にリセットを求められなくなり、以前のパスワードで発行された古いトークンは動作しなくなります(`reset-password` / `changePassword` と一貫性があります)。

#### テナント存在検証

`tenantId` を指定してユーザーを作成または更新する場合、システムは指定されたテナントが存在することを検証します。テナントが存在しない場合、`400 Bad Request` エラーが返されます。


* **POST /admin/users**: `tenantId` は既存のテナントを参照する必要があります(`super_admin` ユーザーは除外。テナントを持ちません)
  
* **PATCH /admin/users/{userId}**: `tenantId` を変更する場合、対象テナントが存在する必要があります。`tenantId` を `null` に設定することは検証なしで許可されます。

### テナントメンバーシップ管理

FIWARE Keyrock Organization モデルに準拠し、1 人のユーザーは複数のテナントに所属できます。メンバーシップはユーザー作成時に自動的に作成されます。

| Endpoint                                   | Method | Description                    | Authorization                               |
| ------------------------------------------ | ------ | ------------------------------ | ------------------------------------------- |
| `/admin/tenants/{tenantId}/users`          | GET    | List tenant members            | `tenant_admin` (own tenant) / `super_admin` |
| `/admin/tenants/{tenantId}/users/{userId}` | PUT    | Add user to tenant             | `tenant_admin` (own tenant) / `super_admin` |
| `/admin/tenants/{tenantId}/users/{userId}` | DELETE | Remove user from tenant        | `tenant_admin` (own tenant) / `super_admin` |
| `/admin/users/{userId}/tenants`            | GET    | List tenants a user belongs to | Self / `super_admin`                        |

#### テナントスコープログイン

ログイン時にテナントを指定することで、そのテナントにスコープされた JWT トークンを取得できます。テナントはリクエストボディ (`tenantId` または `tenantName`) または HTTP ヘッダーで指定できます。

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

1. `body.tenantId` — 直接テナント ID 指定(最高優先度)
   
2. `body.tenantName` — ボディ内のテナント名、サーバー側で解決 (#1223)
   
3. `NGSILD-Tenant` / `Fiware-Service` ヘッダー — テナント名で解決
   
4. プライマリテナント (`user.tenantId`) — 何も指定されていない場合のフォールバック

`tenantId` と `tenantName` はリクエストボディ内で**相互排他的**です — 両方を指定すると `400 Bad Request` が返されます。

テナント名の一意性は、`tenants.name` 上の部分ユニークインデックスによってシステム全体で強制されます(ソフト削除されたテナントを除く、#1223)。これは、`Fiware-Service`、`NGSILD-Tenant`、および `body.tenantName` 全体で名前ベースの解決が曖昧にならないようにするための前提条件です。

**動作:**

* `tenantId` が指定されている場合:メンバーシップを確認後、そのテナントにスコープされたトークンを発行
  
* `tenantName` が指定されている場合(ボディまたはヘッダー):テナント名でテナントを解決します。テナント名が見つからない、または無効な形式(ヘッダーの場合は `^[a-z0-9_]+$` に一致する必要があります)の場合は `400 Bad Request` を返します
  
* テナント指定がない場合:プライマリテナント (`user.tenantId`) のトークンを発行します。ユーザーが複数のテナントに所属している場合、レスポンスには `availableTenants` リストが含まれます
  
* ユーザーが所属していないテナントを指定した場合:`403 Forbidden`

#### メンバーシップのライフサイクル


* **ユーザー作成時**:`POST /admin/users` 経由でメンバーシップが自動的に作成されます
  
* **追加登録**:`PUT /admin/tenants/{tenantId}/users/{userId}` 経由で別のテナントに追加
  
* **テナント削除時**:すべてのテナント関連データがカスケード削除されます(entities、subscriptions、registrations、temporalEntities、snapshots、rules、policies、OAuth clients、data models、users、memberships など — 全 16 コレクション)
  
* **ユーザー削除時**:そのユーザーに関連するすべてのメンバーシップが自動的に削除されます

### テナント単位の CORS 許可オリジン (#1069)

GeonicDB はリクエストの `Origin` ヘッダーをテナントレベルのホワイトリストに対して検証します。これは API-Key の `allowedOrigins` の上に重ねられ、匿名、JWT、API-Key リクエストすべてに適用されます。GeonicDB はマルチテナント Context Broker であるため、許可されたオリジンを環境変数で固定することは**できません** — 実行時に管理 API を通じてテナント単位で設定する必要があります。

#### エンドポイント

標準のテナント設定エンドポイントを使用してください:

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

#### 適用


* **プリフライト (OPTIONS)** はオリジン検証されません (CORS 仕様: プリフライトにはテナントヘッダーがありません)。常にリクエストの `Origin` をエコーバックし、204 を返します。
  
* **実際のリクエスト**は `optionalAuth(event, tenantService)` (データ API) または `requireAuth(event)` (管理 / `/auth/logout`) を通過します。オリジンが一致しない場合、リクエストは `403 Forbidden` で拒否され、ボディには `Origin not allowed for this tenant` が返されます。
  
* 403 レスポンスには依然として `Access-Control-Allow-Origin` のエコーバック + `Vary: Origin` が含まれるため、ブラウザは実際のエラーをクライアントに表示できます (そうでなければ開発者は一般的な Network エラーを見ることになります)。
  
* `super_admin` ユーザー (`tenantId: null`) はオリジン検証をスキップします — 彼らはテナントスコープより上で動作します。

#### API Key の `allowedOrigins` との重ね合わせ

API Key が使用される場合、両方のチェックが適用されます:


1. **テナントレベル**: `tenant.settings.allowedOrigins` を満たす必要があります。
   
2. **API-Key レベル**: `apiKey.allowedOrigins` を満たす必要があります (既存の動作、変更なし)。

最も制限的なものが優先されます。

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

GeonicDB は、JWT/OAuth トークンに代わる軽量な選択肢として API キーベースの認証をサポートしています。API キーは、公開統合、ブラウザベースのアプリケーション、完全な OAuth 認証情報が不要なシナリオに最適です。

### 概要

API キーは、オリジンとレート制限のための組み込み制限を持つ、よりシンプルな認証メカニズムを提供し、`policyId` を介したオプションの XACML ポリシーバインディングが可能です。

### 認証ヘッダー

```http
X-Api-Key: <UUID or gdb_-prefixed key>
```

**優先度**: `Authorization: Bearer` ヘッダーと `X-Api-Key` ヘッダーの両方が存在する場合、Bearer トークンが優先されます。API キーは、Bearer トークンが提供されていない場合のフォールバックとしてのみ使用されます。

### キー形式


* **新しいキー**: プレーン UUID(`randomUUID()`)— 例:`550e8400-e29b-41d4-a716-446655440000`
  
* **レガシーキー**: `gdb_` プレフィックス付きの既存のキーは引き続き動作します(後方互換性あり)
  
* **ストレージ**: キーの SHA-256 ハッシュのみがデータベースに保存されます。平文のキーは、作成時とリフレッシュ時にのみ返されます。
  
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
  
* `allowedOrigins` は作成時に必須(空でない配列; すべてのオリジンを許可する場合は `["*"]` を使用、サブドメインワイルドカードの場合は `https://*.example.com` を使用)
  
* `policyId` はオプション — 指定する場合、参照されるポリシーは既に存在し、同じユーザーによって作成されている必要があります
  
* `tenantId` は `super_admin` では必須(欠落時は 400 エラー); `tenant_admin` は省略可能(セッションから自動導出)

> **所有者制限の継承(#1363 / #1376)**。**personal スコープ**のバインドポリシーを持つセルフサービス資格情報(API キーまたは OAuth クライアント)は、その所有者に課せられた制限を超えることはできません。認可時に、バインドされた `personal` ポリシーが存在する場合、リクエストは所有者の ID でテナントポリシーに対して再評価されます; 所有者が**拒否**される場合(例: `role=user`/`userId` をターゲットとする `tenant_admin` ポリシーが所有者を特定の `Fiware-ServicePath` または読み取り専用に制限する場合)、資格情報も拒否されます。これにより、制限されたユーザーが自分自身のキー/クライアントに自作の制約のない `Permit` をバインドすることでテナント `Deny` を回避できるという抜け穴が閉じられます。管理者が発行した資格情報は `tenant` スコープのポリシーをバインドし、影響を受けません。
>
> **リスト読み取り**(タイプレス `GET /entities`、#1337/#1369 のポリシーからフィルタへの行レベルセキュリティパスを使用)の場合、所有者制限はバイナリ拒否ではなく**フィルタ交差**として適用されます(#1376): 資格情報の読み取り可能エンティティフィルタは所有者の読み取り可能エンティティフィルタと交差され、資格情報は所有者が見ることができる行と正確に同じものを見ます(例: 所有者が許可された `entityType` にフィルタリングされる)、一律の 403 ではありません。これにより、リスト読み取りの整合性が、資格情報を過度に制限するのではなく、所有者と一貫性を保ちます。

**PATCH で更新可能なフィールド**(`PATCH /me/api-keys/{keyId}`):

| Field            | Type                 | Description                                                  |
| ---------------- | -------------------- | ------------------------------------------------------------ |
| `name`           | string               | Key name                                                     |
| `allowedOrigins` | string\[]            | Allowed origins (min 1 entry)                                |
| `policyId`       | string \| null | Policy binding (must be created by you, or `null` to unbind) |
| `rateLimit`      | object               | Rate limit override                                          |
| `dpopRequired`   | boolean              | Require DPoP proof                                           |
| `isActive`       | boolean              | Activate / deactivate the key                                |

### リクエスト例

#### API キーを作成する

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

> **注意:** `keyId` は自動生成されます (UUID)。`tenantId` は `super_admin` に必須です。`tenant_admin` は省略可能です (セッションから自動取得されます)。`policyId` はオプションです — 省略された場合、認可はテナントポリシー + ロールのデフォルトにフォールバックします。ID (`keyId`、`policyId`) はテナントごとに一意です。

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

> **注意:** `keyPrefix` フィールドは削除されました。`key` フィールドは作成時とリフレッシュ時のみプレーンテキストで返されます。リスト/取得レスポンスでは `"key": "******"` が返されます。
>
> **後方互換性:** `gdb_` プレフィックスを持つ既存のキーは有効なままで、引き続き動作します。新しく作成されるキーのみ UUID 形式を使用します。

#### API キーをリフレッシュする

```bash
curl -X POST http://localhost:3000/me/api-keys/{keyId}/refresh \
  -H "Authorization: Bearer <accessToken>"
```

キーの値を再生成します。古いキーは即座に無効化されます。レスポンスには新しいプレーンテキストキーが含まれます (作成レスポンスと同じ形式)。

#### API キーを使用する

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

> **注意:** `policyId` と `ruleId` は省略された場合、自動生成 (UUID) されます。ID はテナントごとに一意です — 異なるテナントは同じ ID を独立して使用できます。

`policyId` が指定されている場合、評価時にバインドされたポリシーの `target` はバイパスされ、ポリシーの `rules` のみが評価されます。これにより、単一のポリシーをターゲットの競合なしに複数の認証情報間で共有できます。

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

セルフサービスキーの場合は、`PATCH /me/api-keys/{keyId}` を使用します — `policyId` は認証済みユーザーによって作成されたポリシーを参照する必要があります:

```bash
curl -X PATCH http://localhost:3000/me/api-keys/{keyId} \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"policyId": "my-readonly-policy"}'
```

### API Key Token Exchange (Browser SDK)

ブラウザベースのアプリケーションでは、キーの露出リスクがあるため、API キーを `X-Api-Key` ヘッダーで直接使用することはできません。代わりに、GeonicDB は Nonce + Proof of Work を介して API キーを短命のセッション JWT に変換するトークン交換フローを提供しています。

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


1. **Origin 検証**: Nonce は HMAC を介してリクエストの Origin に紐付けられ、Origin が一致しない場合は拒否されます
   
2. **HMAC Nonce**: ステートレスで、サーバーシークレットで署名され、timestamp + Origin + keyId を含みます。TTL は 60 秒
   
3. **Proof of Work**: SHA-256 ベース、difficulty=4 (先頭 4 ビットがゼロ)。外部依存なしで自動化された悪用を防止します
   
4. **短命の JWT**: `api_key_session` タイプ、1 時間で期限切れ、policyId を埋め込み

#### JavaScript SDK

GeonicDB は、トークン交換フロー全体を自動的に処理する JavaScript SDK を npm パッケージ (`@geolonia/geonicdb-sdk`) として提供しています:

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

SDK は、nonce の取得、PoW の解決、トークンの更新を透過的に処理します。

#### 外部トークンインジェクション

外部で Bearer JWT ログインを使用する場合(例: アプリケーションレベルのログインフロー)、`setCredentials()` を介してトークンを SDK に注入し、`on('tokenRefresh', cb)` でトークン更新の同期用のコールバックを登録します:

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

> **注意**: `setCredentials()` が `tokenType: 'Bearer'` と `refreshToken` で呼び出されると、以降のすべての API 呼び出しと `connect()` は DPoP/PoW を完全にバイパスします。トークンの更新には `/auth/refresh` を使用するため、PoW の再計算は不要です。

詳細については、SDK ドキュメントを参照してください。

### DPoP トークンバインディング (RFC 9449)

GeonicDB は [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) に準拠した DPoP (Demonstration of Proof-of-Possession) をサポートし、トークンをクライアントが保持する暗号鍵にバインドします。これによりトークンの盗難とリプレイ攻撃のリスクが排除されます — JWT が傍受されても、対応する秘密鍵なしでは使用できません。

#### 仕組み


1. **鍵ペアの生成**: クライアントは ECDSA P-256 鍵ペアを生成します (SDK は `crypto.subtle.generateKey` を `extractable: false` で使用)
   
2. **DPoP 証明によるトークン交換**: クライアントは `POST /oauth/token` 時に証明 JWT を含む `DPoP` ヘッダーを送信します
   
3. **トークンバインディング**: サーバーは証明を検証し、JWK サムプリント ([RFC 7638](https://datatracker.ietf.org/doc/html/rfc7638)) を発行する JWT の `cnf.jkt` に埋め込みます
   
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

#### DPoP-Nonce (RFC 9449 Section 8)

GeonicDB は RFC 9449 Section 8 に従ってサーバー提供のナンスを実装し、事前計算された DPoP 証明を防ぎます。ナンスハンドシェイクは透過的に行われます:


1. クライアントは `nonce` クレームなしで DPoP 証明を送信します
   
2. サーバーは `error: "use_dpop_nonce"` と `DPoP-Nonce` レスポンスヘッダーを含む `400` を返します
   
3. クライアントは `nonce` クレームにサーバーナンスを含む新しい DPoP 証明を作成します
   
4. サーバーはナンスを検証してトークンを発行します; レスポンスには後続のリクエスト用の新しい `DPoP-Nonce` が含まれます

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

ナンスはステートレス (HMAC ベース) で、TTL は 300 秒です。データベースストレージは不要です。

DPoP バインドトークンを使用する API リクエストにもナンスが必要です。サーバーはすべての成功レスポンスと `use_dpop_nonce` メッセージを含む `401` エラー時に `DPoP-Nonce` ヘッダーを返します。

#### `htu` 検証とローカル HTTP 開発

各 DPoP 証明には、サーバーが再構築するリクエスト URL と一致する必要がある `htu` (HTTP URI) クレームが含まれます。サーバーはスキームを `X-Forwarded-Proto` から導出し (本番環境では API Gateway / CloudFront によって `https` に設定されます)、そのヘッダーが存在しない場合はデフォルトで `https` になります。

このデフォルトはプロキシなしの**ローカル HTTP 開発**を破壊します: SDK は `baseUrl` (例: `http://localhost:3001/oauth/token`) から `htu` に署名しますが、サーバーは `https://localhost:3001/...` を再構築するため、持続的な `htu_mismatch` (400) が発生し、DPoP トークン交換がブロックされます (#1153)。

HTTP 経由でローカル開発するには、localhost モードを有効にします (`ALLOW_LOCALHOST=true`; 開発用 `docker-compose.yml` はこれを設定し、`npm start` は無条件で有効にします — ENV.md を参照)。その場合に限り、**かつ `Host` ヘッダーがループバックの場合のみ** (`localhost` / `127.0.0.0/8` / `[::1]`、ポートは任意、大文字小文字を区別しない)、サーバーはスキームを `http` として導出し、SDK の `http` `baseUrl` と一致します。`X-Forwarded-Proto` が存在する場合は常に優先されます。本番環境 (Lambda) では localhost モードは決してアクティブにならないため、攻撃者が `Host: localhost` を偽装しても導出されるスキームをダウングレードできません — 両方の条件が成立する必要があります (AND)。

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

`dpopRequired` が `true` の場合、有効な `DPoP` ヘッダーなしでトークン交換を行うと `400 invalid_dpop_proof` が返されます。

#### Bearer フォールバック

トークン交換時に `DPoP` ヘッダーが送信されない場合(かつ `dpopRequired` が `false` の場合)、サーバーはバインディングなしの標準 `Bearer` トークンを発行します。これにより DPoP をサポートしないクライアントとの後方互換性が維持されます。

| DPoP Header    | `dpopRequired` | Result                                      |
| -------------- | -------------- | ------------------------------------------- |
| Present, valid | `false`        | `token_type: "DPoP"` with `cnf.jkt` binding |
| Present, valid | `true`         | `token_type: "DPoP"` with `cnf.jkt` binding |
| Absent         | `false`        | `token_type: "Bearer"` (no binding)         |
| Absent         | `true`         | `400 invalid_dpop_proof` (rejected)         |

> **注意**: すべての DPoP バインドリクエスト(トークン交換と API 呼び出し)は nonce ハンドシェイクに参加します。JavaScript SDK はこれを透過的に処理します。

#### SDK DPoP サポート

JavaScript SDK (`@geolonia/geonicdb-sdk`) は `crypto.subtle` が利用可能な場合、自動的に DPoP を有効にします:


* 初期化時に抽出不可能な ECDSA P-256 鍵ペアを生成
  
* トークン交換と API リクエストに DPoP プルーフを添付
  
* `crypto.subtle` がない環境では Bearer モードにフォールバック
  
* トークン交換と API リクエストの両方で `use_dpop_nonce` リトライを自動処理
  
* WebSocket 接続は接続後の `dpop_bind` メッセージをプルーフ検証に使用

利用可能なすべてのメソッドについては完全な SDK API リファレンスを参照してください。

#### DPoP と HTTP キャッシュの相互作用 (#1052)

DPoP は HTTP キャッシュフローの 3 つのポイントに影響します:


1. **DPoP プルーフ JWT を `Vary` に含めるか?** — いいえ。プルーフにはリクエストごとの `jti` と `iat` が含まれているため、`Vary` に追加するとすべてのリクエストがキャッシュミスになります。`Authorization` 内のバインドされたアクセストークンが重要なキャッシュキーの次元であり、プルーフは個別に検証され、ボディコンテンツには影響しません。
   
2. **`304 Not Modified` での `DPoP-Nonce`** — はい、パススルーされます。キャッシュコントロールミドルウェアは 304 レスポンスヘッダー(`evaluateConditionalRequest`)で `DPoP-Nonce` をホワイトリストに登録します。サーバーが nonce をローテーションする場合、`304` でも最新の nonce が配信されるため、クライアントが遅れることはありません。このパススルーがない場合、`304` を受信したクライアントは古い nonce でリトライし、次のリクエストで `401 + use_dpop_nonce` に遭遇します。
   
3. **DPoP 認証失敗** — 古いまたは欠落している DPoP プルーフは `evaluateConditionalRequest` が実行される前に `requireAuth` で拒否されます([ポリシー伝播遅延](#policy-propagation-delay--http-cache-integrity-1050) でハンドラーの順序を参照)。古い `If-None-Match` は以前の有効なセッションからの `304` を復活させることはできません — レスポンスは `401` であり、決して `304` ではありません。

セキュリティモデルについては SECURITY.md — DPoP & Cache Integrity を参照してください。

#### パスワードログインセッションバインディング (`POST /auth/dpop-bind`

)

上記の DPoP フローは **API キー**交換(`/oauth/token`)を通じて取得されたトークンをバインドします。これは SDK がデータプレーンアクセスに使用するパスです。**人間の管理者**がメール/パスワードでサインインする管理コンソールはこのパスを経由しません — `POST /auth/login` はプレーンな Bearer セッショントークンを発行します。このセッショントークンを保護するために(例: ブラウザストレージからの XSS 盗難に対して)、`POST /auth/dpop-bind` を介してセッションを DPoP 送信者制約トークンにアップグレードできます。

API キーフローとは異なり、Proof-of-Work は不要です(ユーザーは既にパスワードで認証済み)。リプレイ保護は同じ `DPoP-Nonce` ハンドシェイクを再利用します。

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


* DPoP バインドアクセストークンは `Authorization: Bearer` スキームでは使用**できません** — `requireAuth` は `cnf.jkt` トークンが Bearer として提示された場合、`401` で拒否します。
  
* クライアントの鍵ペアは抽出不可能(`extractable: false`)にし、IndexedDB に永続化する必要があります。これによりリロード後も存続し、注入されたスクリプトによるエクスポートを防ぎます。トークン値自体は `localStorage` に残すことができます:一度バインドされると、盗まれたトークンは秘密鍵なしでは無用です。
  
* これはファーストパーティ管理コンソール(例: geonicdb-console)を対象としています。サードパーティアプリの場合は、上記で説明したスコープ付き API キー + DPoP モデルを推奨します。

***

## OAuth 2.0 M2M 認証

GeonicDB は OAuth 2.0 Client Credentials フローを介したマシン間 (M2M) 認証をサポートしています。

### 概要

OAuth 2.0 Client Credentials フローは、サーバー間通信やバックグラウンドジョブなどのマシン間 (M2M) シナリオに最適化された認証方法です。

### OAuth 2.0 を使用するタイミング


* **マシン間通信**: API 間の呼び出し
  
* **バックグラウンドジョブ**: ユーザーインタラクションなしのバッチ処理
  
* **サービス間統合**: マイクロサービス間の認証
  
* **CI/CD パイプライン**: 自動デプロイおよびテストにおける API アクセス
  
* **きめ細かなアクセス制御**: スコープベースの権限管理が必要な場合

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

ユーザーは管理者権限なしで自分自身の OAuth クライアントを作成および管理できます。セルフサービスで作成されたクライアントは、ユーザーにスコープされ、ロールベースの制限の対象となります。

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
  
* `clientSecret` は作成時と再生成時にのみ返されます — 安全に保管してください

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

`POST /oauth/token` は **クライアント IP** ごとおよび **`client_id`** ごとにレート制限されており、`client_id+client_secret` のペアに対するオフライン総当たり攻撃を防ぎます。

| Bucket          | Per minute | Per hour | Per day | Burst |
| --------------- | ---------: | -------: | ------: | ----: |
| Per IP          |         20 |      100 |     500 |     5 |
| Per `client_id` |         10 |       60 |     200 |     2 |

両方のバケットがリクエストを許可する必要があります。どちらかを超過すると、`Retry-After` ヘッダー付きの `429 Too Many Requests` が返されます。同じ IP ごとのスキームは `/auth/refresh` および `/auth/nonce`(`PUBLIC_RATE_LIMIT` の `auth` カテゴリ)も保護します。
完全な設定については、[QUOTAS.md — Public (Unauthenticated) Endpoint Rate Limit](../saas/quotas.md#public-unauthenticated-endpoint-rate-limit-1075) を参照してください。

### スコープシステム

| Scope                      | Description                                                               | `user` | `tenant_admin` | `super_admin` |
| -------------------------- | ------------------------------------------------------------------------- | :----: | :------------: | :-----------: |
| `read:entities`            | Read entities                                                             |    ✅   |        ✅       |       ✅       |
| `write:entities`           | Write entities (create/update/delete only)                                |    ✅   |        ✅       |       ✅       |
| `read:subscriptions`       | Read subscriptions                                                        |    ✅   |        ✅       |       ✅       |
| `write:subscriptions`      | Write subscriptions (create/update/delete only)                           |    ✅   |        ✅       |       ✅       |
| `read:registrations`       | Read registrations                                                        |    ✅   |        ✅       |       ✅       |
| `write:registrations`      | Write registrations (create/update/delete only)                           |    ✅   |        ✅       |       ✅       |
| `read:rules`               | Read rules                                                                |    ✅   |        ✅       |       ✅       |
| `write:rules`              | Write rules (create/update/delete only)                                   |    ✅   |        ✅       |       ✅       |
| `read:custom-data-models`  | Read custom data models                                                   |    ✅   |        ✅       |       ✅       |
| `write:custom-data-models` | Write custom data models (create/update/delete only)                      |    ✅   |        ✅       |       ✅       |
| `admin:users`              | Access to user management API (`/admin/users`)                            |    ❌   |        ✅       |       ✅       |
| `admin:policies`           | Access to policy management API (`/admin/policies`, `/admin/policy-sets`) |    ❌   |        ✅       |       ✅       |
| `admin:oauth-clients`      | Access to OAuth client management API (`/admin/oauth-clients`)            |    ❌   |        ✅       |       ✅       |
| `admin:metrics`            | Access to metrics API (`/admin/metrics`)                                  |    ❌   |        ✅       |       ✅       |
| `admin:tenants`            | Access to tenant management API (`/admin/tenants`)                        |    ❌   |        ❌       |       ✅       |
| `permanent`                | Set token to never expire (no expiration)                                 |    —   |        —       |       —       |
| `jwt`                      | JWT format token                                                          |    —   |        —       |       —       |

> **スコープ階層**: `write:X` は `read:X` を暗黙的に含み**ません** — スコープは独立しています。これにより、公開お問い合わせフォームなどの書き込み専用ユースケースが可能になります。`admin:X` は `read:X` と `write:X` の両方を暗黙的に含みます。`admin:*` スコープを持つ OAuth トークンは、通常の JWT ロールベース認証をバイパスして Admin API にアクセスできます。通常の JWT トークン(`scope` フィールドなし)は、後方互換性のためスコープチェックをスキップします。
>
> **セルフサービスのロール制限 (`/me/oauth-clients`)**: ユーザーは自分のロールで許可されたスコープのみをリクエストできます。`user` はリソーススコープのみをリクエストできます。`tenant_admin` はさらに `admin:tenants` を除く `admin:*` スコープをリクエストできます。`super_admin` はすべてのスコープをリクエストできます。

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


1. クライアントが外部 IdP から ID トークンを取得する
   
2. GeonicDB API リクエストに `Authorization: Bearer <id_token>` を含める
   
3. GeonicDB は OIDC Discovery + JWKS 経由で署名を検証する
   
4. メールアドレス(`email` クレーム)で GeonicDB DB 内のユーザーを検索する
   
5. ユーザーが存在する場合、認証が成功する

### サポートされている IdP


* Google
  
* Microsoft Entra ID (Azure AD)
  
* Auth0
  
* その他の OIDC 準拠 IdP

***

## XACML ポリシーベース認可

GeonicDB は XACML 3.0 準拠のポリシーベースアクセス制御をサポートしています。

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

> **`policyId` / `policySetId` の命名 (#1628)。** クライアントが指定する ID には、URL エンコードが必要な文字(非 ASCII、スペース、`%`)が含まれる場合があります。そのようなポリシーにアクセスする際は、パス内の ID をパーセントエンコードしてください — API Gateway は `event.path` をパーセントエンコードされた状態で渡し、サーバーは正確に 1 回だけデコードします。したがって、二重エンコードされたセグメントは単一エンコードされた値に解決されます(`a%2520b` は ID が文字通り `a%20b` であるポリシーをアドレス指定します)、また不正な形式のエスケープ(`a%b`)は `400` を返します。文字通り `%` を含む ID は以前は生の形式でアドレス可能でしたが、現在は二重エンコードが必要です(`50%-rule` は `50%25-rule` としてアドレス指定されます); 有効なエスケープではない生の `%` は、解決される代わりに `400` を返すようになりました。作成時に返される `Location` ヘッダーは既にパーセントエンコードされているため、そのまま従えば機能しますが、以下に示す 2 つの ID 形状を除きます。
>
> 2 つの ID 形状は API を通じてアクセスできないため、避けるべきです:
>
> * `/` を含む ID(`policyId` と `policySetId` の両方) — ルートパターンは単一のパスセグメント(`[^/]+`)にマッチし、API Gateway がパス内の `%2F` を正規化する方法は環境依存です。
> * 正確に `import` という `policyId` — `POST /admin/policies/import` が `/admin/policies/{policyId}` ルートをシャドウします。(任意の 1 文字をパーセントエンコードすると、例えば `%69mport` は `{policyId}` ルートにフォールスルーしてアクセスできます。)この衝突は `policyId` に固有です; `policySetId` には `import` ルートがないため、`import` という `policySetId` はアクセス可能です。
>
> `policyId` と `policySetId` は現在、長さのみ(最大 256 文字)検証されており、文字クラスの検証は行われていません。

### ターゲットマッチングセマンティクス

`subjects`、`resources`、`actions` 配列内で:

* **同じ `attributeId`**: OR(いずれかのマッチで満たされる) — 例: `[{method: POST}, {method: PATCH}]` は POST **または** PATCH にマッチ
  
* **異なる `attributeId`**: AND(すべてマッチする必要がある) — 例: `[{role: user}, {userId: u1}]` は両方が必要
  
* **カテゴリ間**(`subjects` + `resources` + `actions`): AND

### マッチ関数(GeonicDB 拡張を含む)

ポリシーの Target 内の AttributeMatch で利用可能な `matchFunction` 値:

| matchFunction   | Description                              | XACML 3.0                        |
| --------------- | ---------------------------------------- | -------------------------------- |
| `string-equal`  | Exact match (default)                    | Standard                         |
| `string-regexp` | Regular expression match                 | Standard (`string-regexp-match`) |
| `glob`          | Glob pattern match (`*`, `**` supported) | **GeonicDB extension**           |

**自動 glob 検出(GeonicDB 拡張)**: `matchFunction` が省略された場合、`matchValue` に `*` が含まれていれば自動的に `glob` として処理されます。それ以外の場合は、`string-equal` が適用されます。

**XACML XML エクスポート**: `glob` は XACML 3.0 仕様に存在しないため、正規表現に変換され、エクスポート時に `string-regexp-match` として出力されます。

#### `string-regexp` パターン制約 (#1935)

`string-regexp` の `matchValue` は**書き込み時**に検証されます — `POST/PATCH/PUT /admin/policies`、`POST /admin/policies/import`(XACML XML)、`/me/policies`、およびポリシーセットエンドポイントで検証されます。パターンは以下の場合に **400** で拒否されます:


* **200 文字**を超える、
  
* 空または空白のみを含む、
  
* 構文的に有効な正規表現ではない、
  
* `(a+)+` のようなネストされた量指定子を含む(ReDoS リスク)、
  
* 10 を超える選択肢または 5 を超える後方参照を含む。

> これらの制限は **GeonicDB 拡張**であり、XACML 3.0 の要件ではありません。仕様が定義しているのは、以下の評価時の動作です(評価エラー時の `Indeterminate`)。

パターンが**評価時**に評価不可能であることが判明した場合、マッチは XACML 3.0 §7.6(Target 評価)に従って\*\*`Indeterminate`\*\* に評価されます(「マッチしない」ではありません)。`Indeterminate` は Rule(§7.11)および Policy(§7.12)に伝播し、最終的に**フェイルクローズとして `Deny`** に解決され、リストクエリの行フィルタ(policy-to-filter)は同じリクエストに対して「読み取り可能な行なし」(403)に劣化します。

2 つの状況が評価時の `Indeterminate` に到達します:


1. **`${subject.*}` テンプレート展開**が評価不可能なパターンを生成する(書き込み時の検証は*展開前*の文字列しか検査できません)。
   
2. **書き込み時検証が存在する前に保存されたポリシー**、またはサービスレイヤーをバイパスするパスで書き込まれたポリシー(例: `scripts/backup-import.ts` は生の `insertMany` でドキュメントを復元します)。既存のドキュメントに対してマイグレーションは実行されません — 評価時の `Indeterminate` がそれらをカバーします。

> 評価不可能なパターンを「マッチしない」として扱うことは、`Permit` ルールではフェイルクローズですが、**`Deny` ルールではフェイルオープン**です — 拒否が黙って適用されなくなります。展開されたパターンが 200 文字制限内に収まるように、`${subject.*}` テンプレートを十分に短く保ってください。

### 暗黙的ポリシー階層

GeonicDB は以下の暗黙的ポリシーを適用します(DB ルックアップをスキップ):

| Priority             | Role           | Behavior                                            |
| -------------------- | -------------- | --------------------------------------------------- |
| Custom policies (0+) | any            | Custom XACML policies always override defaults      |
| 0                    | `super_admin`  | Management APIs always Permit. Data APIs Deny (403) |
| 0                    | `tenant_admin` | Always Permit (all APIs within own tenant)          |
| -1                   | `user`         | GET → Permit, all other methods → Deny (readonly)   |
| -2                   | `api_key`      | All Deny (explicit Permit policy required)          |
| -3                   | `anonymous`    | All Deny (explicit Permit policy required)          |

> **重要**: カスタム XACML ポリシー(優先度 0 以上)は常にロールのデフォルトをオーバーライドします。`user` に書き込みアクセスを付与するには、優先度 ≥ 0 の Permit ポリシーを作成してください。
>
> **タイブレーク**: 優先度が等しい場合、ポリシーは決定論的な結果のために `policyId` で辞書順に評価されます。テナントのカスタムポリシー(DB に保存)はロールのデフォルトと結合され、一緒にソートされます。

### リソース属性

ポリシー Target 内の `resources` で次の属性が利用可能です:

| attributeId            | Description                                                                                                                                                                                               | Source                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `path`                 | HTTP request path (e.g. `/v2/entities/Room1`)                                                                                                                                                             | Request                                                                       |
| `tenantService`        | Tenant service name (`Fiware-Service` header)                                                                                                                                                             | Request                                                                       |
| `servicePath`          | Service path (NGSIv2: resolved `TenantContext.servicePath` after CADDE `x-cadde-options` merge, e.g. `/devices`, `/opendata`. NGSI-LD: always `/` — the header is not part of the NGSI-LD spec, see note) | Request (resolved tenant)                                                     |
| `scope`                | NGSI-LD entity scope (comma-separated, e.g. `/Madrid/parks,/Madrid/gardens`)                                                                                                                              | Entity context                                                                |
| `entityId`             | Target entity ID (e.g. `Room1`)                                                                                                                                                                           | Entity context / Subscription `entities[].id`                                 |
| `entityType`           | Target entity type (e.g. `Room`)                                                                                                                                                                          | Request (auto-extracted) / Entity context / Subscription `entities[].type`    |
| `entityOwner`          | Entity creator's userId (`createdBy` field)                                                                                                                                                               | Entity context                                                                |
| `entityIdPattern`      | Subscription target id pattern (e.g. `urn:ngsi-ld:Sensor:.*`)                                                                                                                                             | Subscription `entities[].idPattern` (NGSIv2: `subject.entities[].idPattern`)  |
| `notificationEndpoint` | Subscription notification endpoint URI (e.g. `https://hooks.example.com/x`)                                                                                                                               | Subscription `notification.endpoint.uri` (NGSIv2: notification channel `url`) |

> **注意**: `entityId` はエンティティレベルの認可チェック(`requireEntityAuthz` 経由)でのみ利用可能です。`entityOwner` と `scope` はエンティティレベルのチェック**で利用可能であり、#1369 以降は、リスト読み取りクエリに対する行レベルフィルタとしても機能します** — [ポリシーからフィルタクエリへの書き換え](#policy-to-filter-query-rewriting-for-list-queries-1337--1369)を参照してください。`entityType` は、パスレベルで HTTP リクエストから自動的に抽出されます — `?type=` クエリパラメータまたはリクエストボディの `type` / `@type` フィールドから抽出されます。**ID 指定のエンティティルート(`/entities/{id}` およびその配下)では、認可は DB に保存されている実際の `entityType` を使用してエンティティレベルで実施されます**(#1324) — クライアント提供の `?type=` パラメータは検索フィルタとしてのみ使用され、認可属性としては使用されません。[ID 指定ルートのエンティティレベル認可](#entity-level-authorization-for-by-id-routes-1324-1336)を参照してください。NGSIv2 の `servicePath` は**解決済みの `TenantContext`**(`extractTenantContext`)から取得され、すでに CADDE `x-cadde-options` のオーバーライドが適用されています — PIP は HTTP パス上で生の `Fiware-ServicePath` ヘッダーを再読み込み**しません**(#1862; キャッシュキーの #1835 と同じクラス)。パスレベルとエンティティレベルの両方のチェックで利用可能 — 階層的なパスマッチングのための glob パターン(例: `/opendata/**`)をサポートします。**NGSI-LD リクエストでは、`servicePath` は常に `/` として評価されます**(#1323): NGSI-LD 仕様(ETSI GS CIM 009)には `Fiware-ServicePath` の概念がなく、テナントミドルウェアはこれを `/` に正規化し、データレイヤーはすべての NGSI-LD エンティティを `servicePath: '/'` で保存します。生のヘッダー値を認可リクエストに注入すると、呼び出し側が独自の認可属性を選択できる一方で、データアクセスはそれを完全に無視することになります — したがって、servicePath ベースのポリシーは **NGSI-LD 上で分離境界として使用できません**。NGSI-LD で階層ベースの制御を行うには、代わりに `scope` 属性(エンティティレベル)を使用してください。テナント内のプロジェクトレベルの分離には、`entityType` / `entityId` 制約を使用してください。`scope` は、エンティティレベルにおける NGSIv2 の `servicePath` の NGSI-LD 相当です — エンティティが複数のスコープ値を持つ場合(例: `["/Madrid/parks", "/Madrid/gardens"]`)、それらはカンマ区切りの文字列として結合され、`string-regexp` または `glob` とのマッチングに使用されます。**サブスクリプション書き込み**(`/ngsi-ld/v1/subscriptions`、`/ngsi-ld/v1/csourceSubscriptions`、`/v2/subscriptions` に対する `POST`/`PATCH`、#1104 / #2005): リテラルの `body.type === "Subscription"` は `entityType` に注入**されません** — 代わりに、PIP は `entities[]`(NGSIv2: `subject.entities[]`)から**サブスクリプションターゲット**を抽出し、`notification.endpoint.uri`(NGSIv2: 設定された通知チャネルの `url`)から**通知送信先**を抽出します。`PATCH` では、属性は**更新後の有効値**(宣言された値、それ以外は保存されている値)で解決されます。`entities[]` に複数の要素が含まれている場合、要素ごとに 1 つの AuthzRequest が構築され、リクエストが成功するには**すべてが Permit を返さなければなりません**(全 Permit セマンティクス)。これにより、タイプベースのポリシー(「匿名ユーザーは `ActivityLog` のみサブスクリプションライブ可能」)および URI ベースのポリシー(「サブスクリプションは `https://*.example.com/**` にのみ通知を送信可能」、SSRF / データ流出に対する防御)を記述できます。以下の[サブスクリプション PIP 属性](#subscription-pip-attributes)を参照してください。**バッチ操作**(`POST /ngsi-ld/v1/entityOperations/*`、`POST /v2/op/update`): ボディ内の**異なるエンティティタイプごと**に 1 つの AuthzRequest が構築され(削除の場合: エンティティ ID ごと)、同じ全 Permit セマンティクスが適用されます — [バッチ操作の認可](#batch-operation-authorization-1325)を参照してください。

### パスレベル vs エンティティレベル認可

GeonicDB は2段階認可モデルを使用します。両方の段階で XACML 評価を使用し、#1324 以降**両方ともフェイルクローズド**になっています。同じ実施ポイントは MCP および A2A ツールエンドポイントもカバーします — [MCP / A2A ツール認可](#mcp--a2a-tool-authorization-1610--1651--1672)を参照してください。

| Stage               | Middleware                                          | Triggered when                                                                                            | Non-Permit behavior                                                                                          |
| ------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Path-level          | `requireAuthz()`                                    | Every authenticated request, except by-id entity routes and list reads (which delegate to the rows below) | `Deny` / `NotApplicable` / `Indeterminate` → **403 (fail-closed)**                                           |
| Entity-level        | `requireEntityAuthz()` (via `checkEntityOwnership`) | By-id entity routes — path-level is skipped and this is the single enforcement point (#1324)              | `Deny` / `NotApplicable` / `Indeterminate` → **403 (fail-closed)**                                           |
| List-level          | `requireListReadAuthz()`                            | List read queries (#1337/#1369)                                                                           | Derived row filter: `unrestricted` → no filter, partial → only readable rows, `none` → **403 (fail-closed)** |
| Subscription-update | `requireSubscriptionUpdateAuthz()`                  | `PATCH` on a subscription by id — path-level is skipped and this is the single enforcement point (#2005)  | `Deny` / `NotApplicable` / `Indeterminate` → **403 (fail-closed)**                                           |

#### なぜパスレベルがフェイルクローズドなのか

適用可能なポリシーがない場合、リクエストは拒否されなければなりません。そうでなければ、特権のないユーザーがポリシーで明示的に許可されていない任意のパスを呼び出すことができてしまいます。デフォルトロールポリシー(`__default_user`、`__default_api_key` など)により、パス段階では常に少なくとも1つの適用可能なルールが存在することが保証されます。

#### エンティティレベルもフェイルクローズド (#1324)

エンティティレベル評価は歴史的にフェイルオープンでしたが、これはパス段階で既に許可が出ており、この段階では**追加的な**制約(所有者のみ、スコープベース)のみを適用するという前提に基づいていました。この前提は、by-id エンティティルートが**パスレベル PEP をスキップ**し、エンティティレベルを単一の実施ポイントとして委譲し始めたときに破綻しました — そこで `NotApplicable` が返されると、追加制約の欠如ではなく、不正アクセスになってしまいます。#1324 以降、`requireEntityAuthz()` は `Deny`、`NotApplicable`、`Indeterminate` のすべてを同様に `403` で拒否します([by-id ルートのエンティティレベル認可](#entity-level-authorization-for-by-id-routes-1324-1336)も参照してください)。MCP / A2A の合成イベントチェックはこれと同じ実装を再利用するため、同じフェイルクローズド動作を継承します。

これは CRUD を機能させ続けるためだけにテナントがエンティティターゲットのポリシーを書くことを強制するものではありません:決定的なデフォルトを持つロール(`user`、`tenant_admin`、`super_admin`)は、データ API で常に許可または拒否を生成し、`NotApplicable` には決して到達しません。空ルールデフォルトを持つプリンシパル(`api_key`、`anonymous`、`oauth_client`)のみが `NotApplicable` にフォールスルーし、それらにとってクローズドが正しい答えです(ポリシーなし = アクセスなし)。

**結果**: 属性ベースのきめ細かい制御(例:「ユーザーは自分が作成したエンティティのみを変更できる」)には、ロールデフォルトより高い優先度で**明示的な拒否ルール**が必要です — そうでなければ、ロールデフォルトの許可がエンティティレベルでも適用されます。

#### 例: 所有者のみの更新実施

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

このような明示的なルールがない場合、ロールデフォルト(`__default_user`、`/v2/**` で許可)がエンティティレベルで適用され、リクエストは許可されます。

### WebSocket 認可 (WS ⊂ GET)

WebSocket サブスクリプションとブロードキャストは、`GET` のサブセットである **読み取り専用ストリーム** として評価されます。`authorizeWs()` PIP (`src/core/auth/policy/policy.pip.ts`) は、各 WebSocket リクエストを **2 回** 評価します — 1 回は `action.method = 'WS'`、もう 1 回は `action.method = 'GET'` で — **両方** の評価が `Permit` を返す場合にのみアクセスを許可します。

この不変条件は、ポリシー作成者にとって 2 つの実用的な結果をもたらします:


1. **`GET` を拒否するポリシーは自動的に `WS` を拒否します。** ルールで `WS` を繰り返す必要はありません。2 回目の評価が同じ拒否を拾います。
   
2. **`WS` 単独をターゲットとするポリシーは、通常、設定ミスです。** 2 回目の評価は `GET` にフォールバックするため、`WS` のみを拒否しても基礎データは保護されません — クライアントは `GET /v2/entities/...` 経由でそれを読み取ることができます。逆に、`WS` のみを許可することは、`GET` も許可されていない場合は無意味です。

#### 不変条件が適用される場所: サブスクリプションライブと配信、接続ではない (#1271)

`authorizeWs()` (WS ⊂ GET) チェックは、API Gateway パス (`handlers/websocket/default.ts` サブスクリプションライブ、`handlers/websocket/broadcaster.ts` 配信) とローカルパス (`core/streaming/local-ws-server.ts`) の両方で、**サブスクリプションライブされた `entityType` ごと** に 2 つのポイントで実行されます:


* **サブスクリプションライブ** — クライアントが `{ "action": "subscribe", "entityTypes": [...] }` を送信すると、各タイプは `authorizeWs(..., { entityType })` で認可されます。ポリシーが許可しないタイプは拒否されます。
  
* **配信** — 各イベントがプッシュされる前に、接続はイベントの具体的な `entityType` (および `entityOwner`/`scope`) で再認可されます。許可されたイベントのみが配信されます。

**接続はデータ認可を実行 *しません*。** `$connect` (API GW) とローカルアップグレードハンドラーは **認証とテナント一致のみ** を検証します — `authorizeWs` を評価しません。これにより、単一の `entityType` にスコープされたキー (例: `entityType = PollVote` のみを許可するポリシーで、タイプなしの `GET /v2/entities` は **なし**) が WebSocket を開いてそのタイプを受信できます。WS ⊂ GET 不変条件は保持されます。なぜなら、**サブスクリプションライブと配信時のタイプごとの `authorizeWs` をパスしない限り、イベントは配信されない** からです — あるタイプに対して GET がないプリンシパルは、ソケットが開いていても、そのタイプの何も受信しません。

`ip-range` やその他の `environment` ポリシー条件は、**データレイヤーで** WS に引き続き適用されます: 接続時のソース IP は接続レコード (`sourceIp`) に保存され、サブスクリプションライブ/配信の `authorizeWs` 呼び出しに渡されるため、IP スコープポリシーはそこで評価されます (接続時ではありません)。`sourceIp` が利用できない場合、それは欠如として扱われ、`ip-range` 条件はクローズドで失敗します (拒否)。

> プリンシパルが何も受信できない接続 (すべてのタイプが拒否) は、接続時には受け入れられますが、実質的に不活性です — イベントを受信しません。

#### 作成ガイダンス

特定のロール/テナントに対してストリーミングを制限したい場合は、`GET` に対してルールを記述します (または `actions` を完全に省略してルールがすべてのメソッドに適用されるようにします)。ルールが *両方* に適用される必要がある場合にのみ `WS` を言及してください:

```json
{
  "actions": [
    { "attributeId": "method", "matchValue": "WS" },
    { "attributeId": "method", "matchValue": "GET" }
  ]
}
```

#### 検出

`PolicyService.validateWsGetSymmetry()` (#1085) は、ルールの `actions` に `method = 'WS'` (`string-equal`) が含まれているが、一致する `'GET'` エントリがない場合に `WARN` ログを出力します。これは、すべての書き込みパスで実行されます: `createPolicy`、`updatePolicy`、`updatePolicySystem`、および `updatePolicyForUser` (セルフサービス `/me/policies` 更新を含む)。ポリシーは下位互換性を保つために引き続き受け入れられます — 警告はルールを再検討するための信号です。

```text
[WARN] PolicyService — Policy rule 'ws-only-deny' targets method='WS' without an explicit 'GET'
counterpart. WebSocket authorization evaluates both WS and GET, so WS-only rules typically do not
restrict the data path that GET serves.
```

#### ブロードキャスト時のエンティティごとの属性 (#1107 / #1383)

WebSocket ブロードキャスター (`src/handlers/websocket/broadcaster.ts`、`src/core/streaming/local-ws-server.ts`) が変更イベントを接続に配信するかどうかを決定するとき、次のエンティティごとの属性を AuthzRequest に注入します:

| attributeId   | Source                                                      | Use case                                                  |
| ------------- | ----------------------------------------------------------- | --------------------------------------------------------- |
| `entityType`  | `EntityChangeEvent.entity.type`                             | "Only forward `ActivityLog` events to clients"            |
| `entityId`    | `EntityChangeEvent.entity.id`                               | "Forward only `urn:ngsi-ld:Room:42` events"               |
| `entityOwner` | `EntityChangeEvent.entity.owner` (the entity's `createdBy`) | "Forward only events for entities the recipient owns"     |
| `scope`       | `EntityChangeEvent.entity.scope`, comma-joined (#1383)      | "Only forward events for entities scoped under `/public`" |

`entityOwner` 属性は、`${subject.userId}` テンプレート展開と組み合わせることで、単一の XACML ポリシーで **ユーザーごとの「自分のみ」配信フィルター** を表現できます:

```jsonc
// Each user receives only updates to entities they created
{
  "policyId": "ws-self-only-feed",
  "target": {
    "subjects": [{ "attributeId": "role", "matchValue": "user" }],
    "resources": [
      { "attributeId": "path", "matchValue": "/v2/**", "matchFunction": "glob" },
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

> **キャッシュに関する注意**: ブロードキャスターは、単一のブロードキャスト内で `(role, policyId, userId)` ごとに認可決定をキャッシュします — オーナーベースのポリシーは、固定された entityType/entityOwner であってもユーザーごとの決定を生成するため、`userId` はキーに含まれる必要があります。同じ userId を持つマルチデバイスユーザーは、1 つのイベント内でキャッシュされた決定を共有します。
>
> **`entity.owner` のソース**: 変更イベントを公開する際に `EntityService` によって透過的に設定されます。共有の `buildChangeEventEntity()` ビルダー (#1383) を介して行われます。AWS では、これが **唯一の** イベントパブリッシャーです (#1560 で MongoDB change-stream プロセッサが削除されました。これは機能していない 2 番目のパブリッシャーでした)。ローカル/スタンドアロンでは、インプロセスの Change Stream ウォッチャーが同じビルダーを使用します。これはエンティティの `createdBy` フィールド (認証されたユーザーによって `POST` で設定) から取得されます — `createdBy` のないエンティティ (レガシー/バッチ/未認証書き込み) は `owner` なしでイベントを発行します。この場合、オーナーベースのルールは一致せず、次のルールが適用されます。
>
> **TTL 有効期限削除は使用可能なイベントを発行しません。** MongoDB の TTL モニターは、`EntityService` を経由せずに `expiresAt` 期限切れドキュメントを削除します。
>
> * **AWS では**: 何も公開されません。これは一度も機能していません — 削除された change-stream プロセッサの `delete` ブランチは pre-images (#1383) と pre-image 有効化 (#1411) を必要としていましたが、両方ともそのワーカーがすでに停止した *後* に導入されました (#1560)。

> * **ローカル / スタンドアロンの場合**: インプロセスの Change Stream ウォッチャーは `EntityDeleted` を発行しますが、MongoDB の `delete` 変更イベントには `documentKey`(ObjectId)のみが含まれるため、イベントは `id: 'unknown'` / `type: 'unknown'` で構築され、`owner` / `scope` は含まれません。サブスクリプションライバーはエンティティに帰属できない削除を受け取り、owner / scope ベースのルールはマッチできません。
>
> いずれの場合も、owner / scope ベースのルールとサブスクリプションは TTL 期限切れに対して有効に動作しません。#1560 のフォローアップとして #1561 で追跡されています(アプリケーション所有の期限切れスイーパーで、ドキュメントが削除される前に読み取ることで両方の環境で修正されます)。
>
> **ブロードキャスト時の `scope`(#1383)**: 保存されたエンティティの `scope` から取得され、エンティティレベルのチェックやリストクエリの行フィルタ(#1369)と同じ**カンマ結合文字列セマンティクス**でマッチングされます — 配信境界は、サブジェクトが `GET` リストを介して読み取れる内容と同一です。スコープなしエンティティ(欠落 / `null` / `[]`)は `''` として評価されます。マルチスコープエンティティでのサブツリーマッチングには、境界を認識する `string-regexp` パターン(例: `(^|,)/public(/[^,]*)?(,|$)`)を使用してください。

### Subscription PIP 属性

サブスクリプションは **継続的な読み取り** であるため、ターゲットと宛先の制限はそれに対するすべての書き込み(作成時だけでなく)で保持されなければなりません。#2005 以降、PIP は **6 つすべてのサブスクリプション書き込みセル** をカバーし、それらすべてにおいてリテラル `body.type === "Subscription"` は意図的に `entityType` として公開 **されません**:

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

`?type=` はこれらのパスでの認可属性として **決して** 使用されません: コントローラはサブスクリプションが何を監視するかを決定するために、それも `body.type` も使用しないため、これを受け入れると、呼び出し元が `?type=Public` を宣言しながら実際には `Secret` をサブスクリプションライブすることができてしまいます。

#### 部分更新は更新後の有効値で評価されます(#2005)

`PATCH` は部分更新であるため、上記の属性は **「ボディが宣言する値、それ以外の場合はすでに保存されている値」** として解決されます:


* ボディが `entities` (NGSIv2: `subject`) を宣言 → 宣言されたターゲットが評価されます(許可されたサブスクリプションを制限されたタイプに切り替えることはできません);
  
* ボディがそれらを省略 → **保存された** ターゲットが評価されます(説明や通知エンドポイントのみを変更して、現在制限されているタイプをターゲットとするサブスクリプションを維持することはできません);
  
* どちらもターゲットを生成しない → 単一の空のターゲットが評価され、これは失敗クローズとなります。

絞り込みは許可されます: 制限されたタイプをターゲットとするサブスクリプションは、更新後の値が評価されるため、許可されたタイプに `PATCH` で絞り込むことができます。

保存された値が必要であるため、`PATCH` セルはパスレベル PEP からコントローラ(`requireSubscriptionUpdateAuthz`)への決定を委譲します。これは、ID によるエンティティルートがエンティティレベルの認可に委譲するのと同じ方法です。保存されたタイプはすでに正規化されており、リクエスト `@context` に対して再正規化 **されません**。クライアントが宣言したタイプのみが再正規化されます(#1613)。

#### PEP はサブスクリプションコントローラと同じ `@context` を解決します(#1657)

クライアントが宣言したタイプは評価前に正規化されます(#1613)。そのため、PEP はコントローラが保存する **同じ** アクティブな `@context` を選択する必要があります。そうでなければ、呼び出し元が制限されたタイプを許可されたように見える用語にエイリアスできてしまいます(「認可は `AliasType` を見て、ストレージは `SecretType` を見る」)。#1772 / #1924 以降、供給ルールは **1 つの** 場所(`selectActiveContextRef`)で適用される条項 6.3.5 であり、コントローラと PEP の両方で使用されます: `application/ld+json` はボディの `@context` を取得し、`application/json` は `Link` ヘッダーを取得し、両者の混在は 400 となります。ルートごとの分岐が残っていないため、コントローラが `@context` ソースを変更しても PEP と暗黙的に非同期化することはできません。

`tests/e2e/features/auth/subscription-write-authz.feature` は、両方の供給形式についてこれを固定します: 制限されたタイプの IRI にエイリアスされた用語は、ld+json ボディの `@context` 経由で到着する場合でも、`application/json` の `Link` ヘッダー経由で到着する場合でも拒否されます。

#### マルチエンティティの全 Permit セマンティクス

`entities[]` に複数の要素が含まれている場合、PEP は **要素ごとに 1 つの AuthzRequest を評価** し、**すべての** AuthzRequest が `Permit` を返す場合にのみリクエストが許可されます。単一の `Deny` / `NotApplicable` / `Indeterminate` がリクエスト全体を `403 Forbidden` にショートサーキットします。これにより、「最初の要素は問題なく見えるので、残りを紛れ込ませる」というバイパスを防ぎます:

```jsonc
// All elements must satisfy the policy. With a policy that permits only ActivityLog,
// this body is rejected because { type: "Building" } is not permitted.
{
  "type": "Subscription",
  "entities": [{ "type": "ActivityLog" }, { "type": "Building" }],
  "notification": { "endpoint": { "uri": "http://localhost:1028/notify" } }
}
```

#### 例: タイプベースと URI ベースの制御の組み合わせ

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

このポリシーは、サブスクリプションのターゲットタイプが `ActivityLog` *かつ* 通知エンドポイントが `*.example.com` 上にある場合 *のみ* 許可します。`resources` 内の異なる `attributeId` は AND 結合されます([ターゲットマッチングセマンティクス](#ターゲットマッチングセマンティクス) を参照)。

> **ポリシーターゲティングに関する注意**: `/ngsi-ld/v1/subscriptions` に完全一致する `path` に対して記述されたポリシーは、作成呼び出しのみをカバーします。更新もカバーするには、glob (`/ngsi-ld/v1/subscriptions**`) を使用してください — `*` は `/` を越えません。

### バッチ操作の認可 (#1325)

バッチ操作は単一のリクエストに複数のエンティティを含むため、単一の `entityType` ではリクエスト全体を表すことができません。PIP はリクエストボディから**異なるエンティティタイプごと**に 1 つの認可ターゲットを抽出し、PEP はサブスクリプションと同じ**全 Permit セマンティクス**でそれらを評価します。すべてのターゲットが `Permit` を返さなければならず、そうでない場合はバッチ全体が `403 Forbidden` で拒否されます。

対象エンドポイント(すべて `POST`):

| Endpoint                                                                              | Body shape                        | Targets                                                                                                |
| ------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `/ngsi-ld/v1/entityOperations/create` / `upsert` / `update` / `merge`                 | Entity array                      | One per distinct `type` / `@type` (multi-type arrays supported)                                        |
| `/ngsi-ld/v1/temporal/entityOperations/create` / `upsert`                             | Entity array                      | Same as above                                                                                          |
| `/ngsi-ld/v1/entityOperations/delete`, `/ngsi-ld/v1/temporal/entityOperations/delete` | Entity ID (URI string) array      | One per distinct `entityId`, with `entityType` fixed to `""` (the type is unknown without a DB lookup) |
| `/v2/op/update`                                                                       | `{ actionType, entities: [...] }` | One per distinct `entities[].type`                                                                     |

例:`entityType: EVChargingStation` に対してのみ `POST` を許可するポリシーの場合、`EVChargingStation` エンティティのみを含むバッチアップサートは成功しますが、単一の `Sensor` エンティティが混在するバッチは全体として拒否され、何も書き込まれません。

**フェイルクローズドルール**:


* 型を判定できない要素(`type` の欠落、NGSIv2 の id のみの更新、オブジェクトでない要素)、解析不能なボディ、および `MAX_BATCH_SIZE` を超えるボディは、`entityType: ""` を持つターゲットとして評価されます。これは型制約付き Permit ルールには決してマッチせず、`?type=` クエリパラメータはこれらのターゲットのフォールバックとして意図的に**使用されません**(そうでなければ `?type=<allowed>` を追加することで制約がバイパスされます)。
  
* `path` / `method` のみを制約するポリシー(`entityType` マッチなし)は影響を受けません。これらは注入された `entityType` 値に関係なくマッチするため、制約のない API キーは以前とまったく同じように動作します。
  
* **バッチ削除**のボディは型情報を持たない ID 配列であるため、型制約のみのポリシーではバッチ削除を許可できません。`entityId` ベースのルール(グロブパターンサポート、例:`urn:ngsi-ld:EVChargingStation:*`)を追加するか、代わりに単一エンティティの `DELETE` リクエストを使用してください。

> **注 (#1325/#1337/#1369)**:読み取り側のバッチエンドポイント `POST /ngsi-ld/v1/entityOperations/query` および `POST /v2/op/query` は**リストレベル認可**によって処理されます。読み取り可能エンティティフィルタ(entityType / scope / entityOwner)がポリシーセットから導出され、クエリに組み込まれます。宣言された型は固定属性として折り込まれます(許可されていない宣言型は依然として 403 を返します)— [ポリシーからフィルタへのクエリリライト](#policy-to-filter-query-rewriting-for-list-queries-1337--1369) を参照してください。
>
> **セットベースの削除(`purge`)もリストレベルです (#1679)**:`DELETE /ngsi-ld/v1/entities`(clause 5.6.21)および GeonicDB 拡張 `POST /ngsi-ld/v1/entityOperations/purge` は、id セットではなく*述語*によってターゲットを選択するため、上記の全 Permit バッチ評価は適用されません。両方とも同じ読み取り可能エンティティフィルタ(entityType / scope / entityOwner)を導出し、削除クエリに組み込むため、**サブジェクトが削除を許可されていない行は述語から除外され、残存します**。削除可能な行がまったくないサブジェクトは `403` を受け取ります。パスレベルのボディ抽出(`type`)だけでは*不十分*です — それはクライアントが宣言した型しか見ず、保存されている `scope` / `entityOwner` は決して見ません。同じ配線がコントローラをバイパスする非 HTTP エントリポイントにも適用されます:MCP `batch` ツール(`action: "purge"`)および A2A `batch` スキル(`action: "purge"`)。
>
> **例外 — 宣言された型が単一の権威ある操作型でない場合は折り込まれません (#1653/#1656)**:**NGSIv2 `POST /v2/op/query`** の場合、実際にマッチする型はボディの `entities[].type` / `typePattern`(複数の仕様)に存在し、コントローラは `?type=` / ボディトップレベルの `type` を無視します。また、リスト読み取りでの**カンマ区切りの `?type=A,B`** はコントローラによって要素ごとに分割されます。これらのいずれかを単一の固定属性として折り込むと、コントローラが*異なる*型セットをマッチさせている間に、導出されたフィルタを `unrestricted`(その折り込まれた値が無条件に許可されている場合)に崩壊させてしまい、デフォルト許可 + ポイント拒否ポリシーの下で禁止された行がリークします。これらのルートでは `entityType` は**自由変数**のままにされ、導出された行レベル述語が代わりにすべての仕様にわたって適用されます。単一の `?type=Denied`(カンマなし)は依然として折り込まれます(高速 `403`)。

### id ベースルートのエンティティレベル認可 (#1324, #1336)

**id ベースエンティティルート** — `/ngsi-ld/v1/entities/{id}`(および `/attrs`、`/attrs/{attrName}`)、`/v2/entities/{id}`(および `/attrs`、`/attrs/{attrName}`、`/attrs/{attrName}/value`)、および**時系列 id ベースルート** `/ngsi-ld/v1/temporal/entities/{id}`(および `/attrs`、`/attrs/{attrName}`、`/attrs/{attrName}/{instanceId}`) (#1336) — については、パスレベル PEP はスキップされ、**エンティティレベル認可が唯一の適用ポイント**となります。データに触れる前に、コントローラは DB からエンティティの実際の属性をロードし、次の内容で完全なポリシーセットを評価します:

| Attribute     | Source                                                                                                                                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entityType`  | **Actual type stored in the DB** — never the client-supplied `?type=` parameter (that is only a lookup filter). If the entity does not exist, `entityType` is evaluated as `""` (matches no type-constrained Permit rule). |
| `entityId`    | Path parameter                                                                                                                                                                                                             |
| `entityOwner` | `createdBy` of the stored entity                                                                                                                                                                                           |
| `scope`       | `scope` of the stored entity                                                                                                                                                                                               |

結果:


* **型制約キーは id ベース操作で機能します。** `entityType: SalesTarget` に対して `GET` を許可するポリシーは、`GET /ngsi-ld/v1/entities/urn:ngsi-ld:SalesTarget:1` を直接許可するようになりました。#1324 以前はこれは常に拒否にフォールスルーし(パスレベル評価には `entityType` がありませんでした)、回避策は URN プレフィックスの `path` グロブルールでした — これらは依然として機能しますが、もはや必要ありません。
  
* **エンティティレベルの決定はフェイルクローズドです**:`NotApplicable` → `403`。決定的なデフォルトを持つロール(`user`、`tenant_admin`、`super_admin`)は影響を受けません(そのデフォルトポリシーは常に決定を生成します)。`api_key` / `anonymous` / `oauth_client`(空ルールデフォルト)の場合、これは正しいクローズド動作です。制約付きキーの下で存在しないエンティティは `403` を返します(存在は開示されません)。
  
* **`?type=` は認可属性を偽造できません。** `GET /entities/{sensorId}?type=AllowedType` は拒否されます:DB ルックアップ(宣言された型でフィルタリング)は何も見つけず、リクエストは `entityType: ""` で評価されます — クエリパラメータのフォールバックはエンティティレベル評価に対して意図的に抑制されています(#1325 と同じバイパス防止)。
  
* 拒否フェンス(例:super\_admin のデータ API フェンス)は影響を受けません — エンティティレベル評価はパスレベルと同じポリシーセットを実行します。
  
* **時系列 id ベースルートは `entities` コレクションから認可属性を取得します** (#1336) — 時系列コレクションには owner/scope が保存されていません。エンティティがそこに存在しなくなった場合(履歴を保持したまま削除された、または時系列 API のみで作成された)、リクエストは `entityType` なしで評価されます — type/owner/scope 制約付きサブジェクトに対してはフェイルクローズドですが、無条件 Permit を持つサブジェクト(例:`tenant_admin`)は依然として履歴にアクセスできます。

### リストクエリのためのポリシーからフィルターへのクエリ書き換え (#1337 / #1369)

**リスト読み取りクエリ** — `GET /ngsi-ld/v1/entities`、`GET /v2/entities`、`POST /ngsi-ld/v1/entityOperations/query`、`POST /v2/op/query`、および(#1370 以降)集約読み取り `GET /ngsi-ld/v1/types`、`GET /ngsi-ld/v1/attributes`、`GET /v2/types`、`GET /ngsi-ld/v1/temporal/entities` — の場合、パスレベルの PEP はスキップされ、**リストレベルの認可**はサブジェクトの有効なポリシーセットから*読み取り可能なエンティティの述語*を導出し、それを MongoDB フィルター(行レベルセキュリティ)に組み込みます。ページネーション、`NGSILD-Results-Count` / `Fiware-Total-Count`、およびリスト ETag はフィルター適用後に計算されるため、常にサブジェクトが読み取れる内容と一貫性があります。

導出は、**`entityType`、`scope`、および `entityOwner` を自由変数とするシンボリック PDP 評価**です(#1369 では `entityType` のみから拡張されました):エンティティ `E` が導出された述語に一致するのは、`entityType: E.type`、`scope: E.scope.join(',')`、`entityOwner: E.createdBy` で評価された同じリクエストが Permitted となる場合のみです。3 つのルール結合アルゴリズムすべてと 2 段階結合(優先度グループごとの first-applicable + グループ間の deny-overrides)は、ルールの順序を含めて正確に再現されます。

リクエストが**タイプを宣言する**場合(`?type=` / `body.type`)、`entityType` は自由変数セットから外れ、宣言された値を持つ固定属性として折り畳まれます — #649 のセマンティクスを保持(許可されていない宣言されたタイプは依然として `403` を返す)しつつ、スコープ/オーナーの行フィルターは**依然として適用されます**:タイプの宣言はスコープ/オーナーベースの制限をバイパスできません。`null` / `undefined` 属性のみが自由変数になります(#1384)。**宣言されたタイプが折り畳まれるのは、それが単一の権威ある操作対象タイプである場合のみです**:`POST /v2/op/query`(実際のタイプは本文の `entities[].type` / `typePattern` 仕様)および `?type=` がコントローラーによって正規化(`split(',') → trim → drop-empty`)され、生の値と同一の単一トークン以外のもの — カンマ区切りの `A,B`、空白パディングされた `" Secret"`、または空白のみの `" "`(コントローラーがタイプフィルターなし = すべてのタイプに変換)— になる場合、`entityType` は**自由変数**として保持され、導出された行レベル述語がすべての仕様に対して強制されます。折り畳まれて `unrestricted` に崩壊することはありません(#1653/#1656)。空文字列のフェイルクローズドマーカー(`''`、`body.type: ""` から)は例外です:これは**自由変数にされません** — 依然として `kind:'none'` → `403` に折り畳まれます(#1384)。したがって `body.type: ""` はリスト全体の拒否をエスケープするために使用できません。**リクエスト上の空文字列値 — 解決不可能な属性のフェイルクローズドマーカー(#1324/#1325)、例: `body.type: ""` — はリスト全体をクローズド(`403`)で失敗させます**:固定値として折り畳むことはできません。データクエリは空の値で行を制限しないためです(折り畳むと制約された Deny ルールが空になり、リークが発生します)。また、マーカーを無視せずに自由変数として扱うこともできません。これは*リクエストの*宣言された属性値のみに適用されます:ポリシー**ルール**の `scope` / `entityOwner` での `matchValue: ""` (スコープなし/オーナーなしの行に一致)は影響を受けず、導出された行フィルターでそれらの行に一致し続けます。

結果:

| Derivation result                           | Behavior                                                                                                       |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Unconditional Permit, no deny contributions | No filter (unchanged behavior — e.g. `tenant_admin`, plain `user` role)                                        |
| Some readable rows                          | `200` with only readable entities (**was `403`** for type/scope/owner-constrained subjects before #1337/#1369) |
| No readable rows                            | `403` fail-closed (unchanged — e.g. policy-less `api_key` / `anonymous`)                                       |

結果:


* **タイプ制約されたキーは `?type=` なしでリストできます。** `entityType: SalesTarget` のみに許可されたキーは、SalesTarget エンティティのみを含む `200` を取得します。#1337 以前は常に `403` でした。
  
* **明示的な Deny ルールは、リスト結果からそのタイプを隠すようになりました。** `entityType: Secret` の `GET` を拒否するテナントポリシー(ロールデフォルトより上の優先度、例: `priority: 10`)は、`user` のタイプなしリストから Secret エンティティを削除します — 以前は deny は by-id / by-type リクエストでのみ機能していました。
  
* **オーナーのみの読み取りがリストで機能します**(#1369)。`entityOwner: ${subject.userId}` で `GET` を許可するルール(+ deny-others)は、すべてのリストを「私が作成した行のみ」に変換し、正しいカウントヘッダーを提供します。MongoDB 変換は保存された `createdBy` フィールドをターゲットにします。空文字列に一致する条件は、`createdBy` を持たないドキュメントにも一致します(PDP は欠落しているオーナーを `''` として評価します)。
  
* **スコープベースの読み取りがリストで機能します**(#1369)。スコープルールは、PDP がエンティティレベルチェックに使用するのと同じ**カンマ結合されたスコープ文字列**に対して一致されます(上記の `scope` 属性の注記を参照) — マルチスコープエンティティでのサブツリーマッチングには、`(^|,)/public(/[^,]*)?(,|$)` のような境界認識 `string-regexp` パターンを推奨します。変換は、`$expr` 経由で MongoDB で結合文字列のセマンティクスを再現します。スコープのないエンティティ(`scope` が欠落/ `null` / `[]`)は、`''` に一致するルールに一致します。ジオクエリ(`$geoNear`)は、`$match` ステージと同じ述語を適用するため、距離ソートされた結果とそのカウントは同じようにフィルタリングされます。
  
* 環境条件(`time-range` / `ip-range`)と `${subject.*}` テンプレートはリクエスト時に折り畳まれます。未解決のテンプレート(#1939)および無効な正規表現(#1935)は `Indeterminate` となり、導出を「読み取り可能な行なし」(403)にショートサーキットします。これは PDP が到達するのと同じフェイルクローズドの結果です。
  
* **`entityId` / `entityIdPattern` によって制約されたルールはリストレベルでは発火しません**(これらは空の値に対して評価されます。パスレベル評価と全く同じです) — by-id リクエストはエンティティレベル認可(#1324)でカバーされます。
  
* フェデレーション結果(コンテキストプロバイダー)は導出されたフィルターの対象ではありません — フィルターはローカルストレージクエリに適用されます。

> **動作変更の注記(#1369)**:`scope` / `entityOwner` によって制約されたポリシーは、以前はリストリクエストで発火しませんでした(両方の属性は `''` として評価されました)。これらは現在、行フィルターとして機能します。特に、`actions` を書き込みメソッドに制限しない「オーナーのみ**書き込み**」ポリシーは、リストパスに適用されると読み取りも行フィルタリングします — このようなポリシーは意図されたメソッドにスコープしてください(`actions: [{"attributeId": "method", "matchValue": "PATCH"}, ...]`)。
>
> **フォローアップステータス**:#1369 で延期された `/ngsi-ld/v1/types` / `/ngsi-ld/v1/attributes` 集約と時系列リストクエリは #1370 / #1488 で完了しました。#1955 での EntityMap 作成と #1963 での EntityMap **読み取り**(下の表を参照)。#1369 のすべてのフォローアップは現在クローズされています。

#### エンティティに対する集約および派生読み取り (#1370 / #1955)

`entities` コレクションを読み取るエンドポイントは、**同じ導出された述語**を適用する必要があります。そうでなければ、エンティティエンドポイントが隠す行が他のエンドポイントを通じて観察可能になります(#1376 パリティ不変条件)。上記のリストエンドポイント以外に:

| Endpoint                                                                  | What the predicate protects                                                            | Wiring              |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------- |
| `GET /ngsi-ld/v1/types`, `/v2/types`, `/ngsi-ld/v1/attributes`            | Existence of a type / attribute, and their counts                                      | #1370 / #1488       |
| `GET /ngsi-ld/v1/temporal/entities`                                       | Readable `entityId` set (temporal rows carry no owner/scope)                           | #1370               |
| `POST /ngsi-ld/v1/snapshots`, `.../clone`, `DELETE /ngsi-ld/v1/snapshots` | Rows copied into / restored from a snapshot                                            | #1945               |
| `POST /ngsi-ld/v1/entityMaps`                                             | The `entityIds` set stored in the EntityMap and its `totalCount`                       | #1955               |
| `GET /ngsi-ld/v1/entityMaps{,/{id}}`, `PATCH`, `DELETE`                   | The **stored** `entityIds` / `totalCount` of an EntityMap created by another principal | #1963 (owner guard) |

注記:


* **EntityMap 作成はパスレベルの PEP を保持します**(これはリソースを作成する `POST` です)。さらに、実際のリクエストで行述語を導出するため、読み取り可能な行がないサブジェクトは `403`(フェイルクローズド)を取得し、宣言された `?type=` はスコープ/オーナー制限をバイパスできません。
  
* **既存の EntityMap の読み取りは、再導出された行述語ではなく、オーナーガードを使用します(#1963)**。`EntityMapDocument` は `createdBy` フィールドを獲得しました。非管理者プリンシパル(`super_admin` / `tenant_admin` 以外のすべて)は、**自分自身が作成した** EntityMap のみを読み取り、更新、削除できます。`createdBy` を持たないレガシー行は非管理者には見えません — **フェイルクローズド**、これは #1945 がスナップショットに対して行ったのと同じ、`SubscriptionService.checkOwnership`(「不明なオーナーはパススルー」)からの意図的な違いです。

  保存された `entityIds` をリーダーの読み取り可能なセットと交差させるのではなく、オーナーガードを使用する理由:作成はすでに**リーダー自身の**導出された述語を通じてフィルタリングしています(#1955)。したがって、オーナーは構造上、自分のマップ内のすべての ID を見ることが許可されています — 再度フィルタリングすることは冗長であり、`GET` ごとに追加の `entities` クエリのコストがかかり、`totalCount`(元のクエリの合計)の意味がリーダーごとに変わることになります。

  **非オーナーは `403` ではなく `404` を取得します** — `403` はその ID を持つ EntityMap が存在することを確認することになり、これは #1370 がクローズしたのと同じ存在リーククラスです。ガードは、フェッチしてから拒否するのではなく、**Mongo クエリ内部**(`{tenant, entityMapId, createdBy}`)で適用されるため、「存在するが自分のものではない」と「存在しない」が分岐できるコードパスはありません。

  `PATCH` / `DELETE` は同じようにガードされます:読み取りパスのみをクローズすると、非管理者が別のプリンシパルの EntityMap を変更または削除できるようになります(CLAUDE.md Authorization Change Checklist 2 — すべての強制パスを接続)。
  
* EntityMap 認可セマンティクスは **ETSI GS CIM 009 で指定されていません**(clause 5.2.32 / 6.3.16 はリソースを定義していますが、そのアクセス制御は定義していません)。したがって、2 つの操作は異なる仕様定義の類似物に従います:
  
  * **作成**(`POST`)は兄弟パス `GET /entities` に従います:読み取り不可能な行を除外し、成功を返します(*行が読み取り可能でない*場合のみ `403`)。
    
  * **既存の EntityMap の読み取り/更新/削除**はスナップショットオーナーガード(#1945)に従います:`createdBy` でスコープされ、非オーナーには `404`、`createdBy` のないレガシー行は非管理者から隠されます(#1963)。
    
* \#1955 が元々カバーしていたベクタータイルエンドポイントは、#1961 (PR #1965)で**完全に削除されました**。そのパスでの繰り返しの認可/キャッシュ/正規化のミスが理由の一部でした。

### MCP / A2A ツール認可 (#1610 / #1651 / #1672)

MCP サーバー(`POST /mcp`)と A2A JSON-RPC エンドポイント(`POST /a2a`)は、HTTP コントローラーをバイパスするエンティティ/バッチ/時系列データツールを公開します。これらは**別個の認可実装を持ちません**:各ツール呼び出しは最小限の合成 `APIGatewayProxyEvent` を構築し、HTTP レイヤーと**同じ共有強制関数** — `checkEntityOwnership`(エンティティレベル、by-id)、`requireListReadAuthz`(リストレベル行フィルタリング)、および `requireAuthz`(ポイントチェック)— を `@api/shared/authz/synthetic-authz` 経由で呼び出します(MCP の場合は `src/api/mcp/tools/authz.ts`)。したがって、カスタムポリシーでの `entityType` / `entityOwner` / `scope` 制約は、HTTP、MCP (#1610)、および A2A (#1651)全体で同じように強制され、Deny / NotApplicable 結果はフェイルクローズドです。


* **By-id ツール操作は DB に保存されている実際の `entityType` で認可します** — クライアント提供の `type` 引数は認可属性として使用されることはありません(後続のデータアクセスのための検索フィルターとしてのみ残ります)。これは HTTP by-id ルートと同じルールです([#1324](#entity-level-authorization-for-by-id-routes-1324-1336))。これにより、偽造された `type` がエンティティ検索をミスさせ、permit-by-default ポリシーの下で `entityType: ""` 評価にリクエストが滑り込むタイプスプーフバイパスをクローズします(A2A: #1651、MCP: #1672)。
  
* **到達可能性は別の、パスレベルの関心事です**:`/mcp` と `/a2a` は `tenant_admin` デフォルトポリシーによって許可され、テナントポリシーパス許可リスト(`TENANT_POLICY_ALLOWED_PATH_PREFIXES`、`src/core/auth/policy/policy.defaults.ts`)に含まれています。したがって、テナント管理者はカスタム Permit ポリシーで `user` / `api_key` / `oauth_client` プリンシパルにこれらを付与できます。`/mcp` / `/a2a` でのパスレベル Permit は、エンドポイントを到達可能にするだけです — 上記のツールごとのエンティティレベル/リストレベルチェックは、すべてのデータ操作に依然として適用されます。
  
* **管理ツールは `tenant_admin` ロールを要求します**:管理/構成管理ツール(ユーザー/ポリシー/ルール)は、MCP と A2A の両方でロールゲートされているため、データツールのために `/mcp` / `/a2a` を付与されたプリンシパルは、ユーザーを列挙したり、ポリシー/ルールを読み取ったりできません。

ツールインベントリと A2A の詳細については、[AI\_INTEGRATION.md](../ai-integration/overview.md) を参照してください。

### テンプレート変数 (GeonicDB 拡張)

`matchValue` は `${subject.<attributeId>}` テンプレート変数をサポートしており、評価時にリクエストサブジェクトの属性値に解決されます。これにより、ユーザー ID をハードコードすることなく「所有者のみ」アクセスのような動的ポリシーを実現できます。

| Template              | Resolves to                                              |
| --------------------- | -------------------------------------------------------- |
| `${subject.userId}`   | Requesting user's ID                                     |
| `${subject.email}`    | Requesting user's email                                  |
| `${subject.role}`     | Requesting user's role                                   |
| `${subject.tenantId}` | Requesting user's tenant ID (`''` for global principals) |

**これらの 4 つのみが解決可能な属性です**(`src/core/auth/policy/policy.pdp.ts` の `SUBJECT_ATTRIBUTE_IDS`)。それ以外の名前 — `${subject.userID}` のようなタイプミスや、`${subject.id}` / `${subject.name}` — は、すべてのポリシー書き込みパス(作成 / 更新 / ポリシーセット / XACML インポート)において**書き込み時に `400` で拒否されます**([#1939](#unresolved-subject-templates-1939))。

#### 未解決の `${subject.*}` テンプレート (#1939)

\#1939 以前は、解決不可能なテンプレートにより、その `matchValue` が**スキップ**され、それを含むグループが `NoMatch` となり、ルールが `NotApplicable` となりました。`Permit` ルールの場合は権限を削除する(安全)ですが、**`Deny` ルールの場合は拒否が静かに適用されなくなり**(フェイルオープン)— そして書き込み API は `201` を返すため、ポリシー作成者には通知がありませんでした。

これを閉じるために、上記の `string-regexp` の扱いを反映した 2 つの層が追加されました:


1. **書き込み時** — 任意の `matchValue`(`matchFunction` に関係なく)内の未知のサブジェクト属性は `400` となります。
   
2. **評価時** — 未解決のテンプレートは処理不可能な `AttributeDesignator` となり、XACML 3.0 §7.6 に従って\*\*`Indeterminate`\*\* と評価され、フェイルクローズで `Deny` に解決されます(そしてリストクエリの行フィルターでは「読み取り可能な行なし」/ `403` となります)。この層は、書き込み時検証が存在する前に保存されたポリシーや、サービス層をバイパスするパス(例:`scripts/backup-import.ts`)で復元されたドキュメントをカバーします。

> これは XACML の `MustBePresent=false` のケース(空のバッグ → マッチなし)**ではありません**。解決可能な 4 つの属性はすべて `AuthzRequest` で必須であるため、テンプレートが解決に失敗するのは属性 ID 自体が存在しない場合のみです — これは作成エラーであり、値の不在ではありません。

#### 例:エンティティ所有者のみのポリシー

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

#### 例:ServicePathベースのアクセス制御

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

このポリシーは、匿名ユーザーが `/opendata/` ServicePath配下のエンティティ(`/opendata/sensors` のようなネストされたパスを含む)を読み取ることを許可します。glob パターン `/**` はゼロ個以上のパスセグメントにマッチします。

> **NGSIv2 のみ (#1323)**:このパターンは、NGSIv2 が `Fiware-ServicePath` によってエンティティを保存およびフィルタリングするため機能します。NGSI-LD リクエストでは `servicePath` 属性は常に `/` です(ヘッダーは仕様がなく、データ層によって無視されます)ため、上記のようなポリシーは NGSI-LD リクエストにマッチしません — これは設計によるものです。代わりに NGSI-LD には `scope` / `entityType` 制約を使用してください。

#### 例:NGSI-LD スコープベースのアクセス制御

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

このポリシーは、`scope` が `/Madrid` 自体またはその配下の子パス(例:`["/Madrid/parks"]`)であるエンティティへの読み取りアクセスを許可します。エンティティスコープは配列として保存され、カンマ区切りの文字列にシリアライズされる(例:`"/Madrid/parks,/Madrid/gardens"`)ため、意図しない部分一致を避けるために境界を認識する `string-regexp` パターン(`(^|,)` と `(,|$)` アンカーを使用)を推奨します。単一値の完全一致には、`string-equal` が直接機能します(例:`matchValue: "/Madrid"`)。

#### NGSI-LD スコープ認可:3 つの実用的なパターン (#1659)

NGSI-LD 書き込み操作では、`scope` が不在(`missing` / `null` / `[]`)の場合があります。その場合、認可はスコープ属性を `''`(空文字列)として評価します。以下のポリシースタイルのいずれかを意図的に選択できます:


1. **Allowlist (strict)**: 特定のスコープのみを許可し(例: `/Public`)、それ以外については fail-closed 動作に依存します。\
   結果: scope-unset の書き込みは拒否されます(`403`)。
   
2. **Denylist + fallback Permit**: 特定の禁止スコープを拒否し(例: `/Secret`)、他の書き込みを許可します。\
   結果: scope-unset の書き込みは許可されます(`201`)。
   
3. **Explicit unset control**: `matchValue: ''` に対する明示的なルールを追加して、スコープのないエンティティを意図的に許可または拒否します。

#### Read=OR / Write=AND スコープセマンティクス (#1659)


* **Read パス (既存の動作)**: スコープマッチングは、保存されたカンマ結合のスコープ文字列を使用します(OR セマンティクス)。\
  例: `["/Public", "/Secret"]` は `/Public` リーダーによって読み取り可能です。
  
* **Write 宛先 (create/move)**: 各スコープ要素は独立した AuthzRequest として評価され、すべてが `Permit` でなければなりません(`evaluateAllPermit`、AND セマンティクス)。\
  例: `Permit(POST, scope~/Public)` のみの場合、`["/Public", "/Secret"]` の書き込みは拒否されます(`403`)。

この非対称性は意図的です: 読み取りの可視性は部分的(OR)でも構いませんが、書き込みはすべての宛先スコープに対して承認されなければなりません(AND)。複数の書き込みスコープを 1 つのカンマ結合の承認リクエストに折りたたんではなりません。

#### バッチ書き込みは Body だけでなく既存のエンティティを評価する (#1678)

バッチ書き込み操作(`POST /ngsi-ld/v1/entityOperations/{upsert,update,merge,delete}`)は既に存在するエンティティを変更するため、リクエスト body だけでは承認入力として不十分です。body で宣言されたターゲット(#1325 による `entityType`、#1659 による宛先 `scope`)に加えて、GeonicDB は body 内のすべての `id` を単一の projection クエリで解決し、**保存されたエンティティの実際の `entityType`、`entityOwner`(`createdBy`)および `scope`** を評価します — これは by-id パス(`checkEntityOwnership`)が使用するのと同じ属性です。


* **All-Permit**: いずれかの要素が `Permit` でない場合、リクエスト全体は書き込みが発生する前に `403` で拒否されます(部分適用なし)。これは `/v2/op/update` バッチセマンティクス(#1325)および NGSI-LD サブスクリプション作成(#1104)と一致します。
  
* **Move セマンティクス**: *ソース
* スコープ(保存済み)とすべての *宛先
* スコープ要素(body、要素ごとの AND)がすべて許可されなければなりません。
  
* **Creates は免除**: まだ存在しない ids は作成として扱われ、body で宣言された属性のみが適用されます。
  
* **曖昧な ids**(1 つの id に対して複数のドキュメント、unique インデックスが欠落している場合のみ可能)は、**すべての**一致するドキュメントに対して `Permit` が必要です(fail-closed)。
  
* **非 HTTP 呼び出し元**: MCP ツールと A2A スキルは HTTP コントローラーをバイパスするため、同じ実施ヘルパー(`syntheticCheckBatchEntityAuthz`)を呼び出します。ポリシーとして表現された制限は、HTTP、MCP、A2A で同一に保持されます。

実際の結果: `Deny when scope ~ /Secret` のようなポリシーは、`PATCH /entities/{id}` をブロックするのとまったく同じように、`/Secret` の下に保存されたエンティティに対する `entityOperations/update` をブロックするようになりました。#1678 以前では、バッチ形式がそれを黙ってバイパスしていました。

> **ステータスコードに関する注意**: NGSI-LD (ETSI GS CIM 009) は承認失敗を定義していません — `207 Multi-Status` はエンティティごとの *operation* エラー(NotFound / BadRequestData)用であり、Table 6.3.2-1 には AccessDenied エラータイプがありません。したがって、GeonicDB はリクエストレベルの `403` を返します。部分適用で `207` を返すと、バッチ形式での同じ制限が by-id 形式よりも弱くなり、承認パリティの不変条件(#1376)が破られます。

#### 承認決定はそれが行われたドキュメントに固定される (#1943)

保存されたエンティティを評価すること(#1678)は保証の半分に過ぎません。承認クエリと書き込みは 2 つの別々のラウンドトリップであるため、その間に第三者が**エンティティをハード削除し、別のプリンシパルが同じ id で再作成する**ことができます。2 つのステップ間にリンクがない場合、書き込みは PDP が一度も見たことのない `entityOwner` / `scope` を持つドキュメントに着地します — すべての個別ステップが正しく動作していても、承認バイパスになります。

GeonicDB は、評価されたドキュメントの識別情報を書き込みに引き継ぐことでこれを閉じます:


* `getEntityAuthzContexts()` は、`entityOwner` / `scope` / `entityType` と共に、一致する各ドキュメントの **`_id`** を返します。
  
* `checkBatchEntityAuthz()` は、それらの `_id` を **authorization pins**(`EntityAuthzPins`)として、エンティティ id でキー付けして返します。
  
* その決定から派生したすべての書き込みは、MongoDB フィルタに pin を追加します: `_id ∈ {evaluated ids}`。承認ステップが **非存在** と見なした ids(作成として扱われる)は、既存のドキュメントに決して一致しない述語を取得し、書き込みを **insert-only** にします — したがって、レースウィンドウ内で作成されたドキュメントも黙って更新されません。

**なぜ `_id` で、`createdBy` やバージョンカウンタではないのか。** `createdBy` は insert 時(`EntityRepository.create`)にのみ書き込まれ、更新されることはないため、ドキュメントの所有者は不変です。所有者が変更される唯一の方法は delete + recreate であり、これは常に新しい `_id` を生成します。したがって、`_id` を固定することで所有者の次元を正確に閉じます。`createdBy` を固定しても閉じません: `batchCreate` は `createdBy` をまったく設定しないため、所有者のないドキュメントが別の所有者のないドキュメントに置き換えられた場合、等しいと比較されます。バージョンカウンタ(`EntityDocument.version`、既に存在し、すべての書き込みパスで維持されています)は**意図的に使用されません**: 書き込みと競合する *in-place* の変更 — `scope` の移動を含む — は、書き込みが最初に発生したシリアル順序と同等であるため、承認違反ではありません。バージョン固定は、無害な並行更新を競合に変換するだけで、バルクパスのドキュメント化された last-write-wins 動作を退化させます。

**「Deny 時の部分適用なし」契約との関係。** その契約(#1325 / #1678 / #1928 / #1932)は *承認決定* に関するものであり、依然として事前に評価され、書き込み前にリクエストレベルの `403` を生成します。pin の不一致は Deny ではありません — 書き込み時に検出される並行性競合であり、これはまさに ETSI GS CIM 009 が `207 Multi-Status` + `BatchOperationResult` のエンティティごとのエラーでモデル化しているものです。セキュリティ関連の保証は無条件であり、両方の形式で保持されます: **書き込みは PDP が評価しなかったドキュメントには決して着地しません。** バルクパスでは、不一致の要素はエンティティ unique インデックス(`idx_entity_unique_v3`)で失敗し、エンティティごとのエラーとして報告されます。エンティティごとのループパス(`entityOperations/{update,merge,delete}`、`actionType=replace|delete` の `/v2/op/update`)では、何も一致せず、既存の `ResourceNotFound` エンティティごとのエラーとして表面化します。いずれにしても、その要素は何も永続化しません。

**エンティティごとの `detail` は、原因が明確な場合にのみ原因を示します。** 固定されたバルク操作での重複キー失敗には、少なくとも 3 つの原因があります: 上記の TOCTOU スワップ。ソフト削除または期限切れになったドキュメント(バルク *replace* フィルタは live 述語を運びますが、承認クエリは意図的に運びません、#1678 による — これはレースをまったく必要としません)。承認が非存在と見なしたときに、1 つのペイロードに同じエンティティ id が 2 回出現する場合。書き込みエラーは一般にそれらを区別できないため、競合の文言 — および再試行の提案 — は、原因が確実な場合にのみ追加されます: pin セットが空の場合(承認がドキュメントを見なかったため、その後何かが id を要求したに違いない)、または書き込みフィルタが live 述語を運ばない場合(`batchUpsert`)、重複キーは固定されたドキュメントがなくなったことのみを意味します。非空の pin を持つ `batchReplace` では、メッセージは単純な「entity already exists」テキストのままです。なぜなら、ソフト削除または期限切れのドキュメントで失敗している書き込みを再試行するように呼び出し元に伝えると、永久にループするからです。生の MongoDB メッセージは、インデックス名とキー値が別のテナントまたは所有者のスロット内のドキュメントの存在を開示するため、いかなる場合も返されません。

**バルクパスの結果は `idx_entity_unique_v3` に依存します。** 「何も永続化しない」は、固定された upsert の insert 試行がエンティティ unique インデックスと衝突するために成り立ちます。そのインデックスが存在しない場合 — 上記で説明した曖昧な ids を生成するのと同じ劣化状態 — insert は成功し、失敗する代わりに同じ `entityId` に対して *2 番目の* ドキュメントを追加します。セキュリティ不変条件は依然として保持されます(書き込みは PDP が評価していないドキュメントには着地しませんでした)が、要素はもはや no-op ではありません。エンティティごとのループパスはインデックスに依存しません: 何も一致せず、いずれにしても `ResourceNotFound` を返します。同じ理由で、merge セマンティクスと暗号化エンベロープに供給されるバルク pre-fetch は、書き込みと同じ pins でフィルタリングされます — さもなければ、その劣化モードでは、スワップされたドキュメントから読み取られた属性が生き残ったドキュメントに書き込まれる可能性があります。

まだカバーされていない(個別に追跡中): temporal バッチ書き込み(承認属性は `entities` コレクションに存在し、書き込みは `temporal` コレクションをターゲットとするため、`_id` pin は適用されません)、`purgeEntities`(述語で選択された ids が固定されていない `deleteMany` に渡されます)、および単一エンティティの by-id パス(同じ read-then-write 構造を持っています)。

#### 同じルールが NGSIv2 バッチと Temporal バッチに適用される (#1928)

上記の契約は NGSI-LD 固有ではありません。さらに 2 つのバッチ形式が、同じ方法で保存されたエンティティを評価します:


* **`POST /v2/op/update`**(すべての `actionType` 値: `append` / `appendStrict` / `update` / `replace` / `delete`)。NGSIv2 には `scope` 概念がないため、`entityOwner` / `entityType` の次元のみが適用されます — 宛先スコープの AND 評価はありません。
  
* **`POST /ngsi-ld/v1/temporal/entityOperations/{upsert,delete}`**。temporal コレクションは `owner` / `scope` を保存しないため — temporal by-id ルートがまさに行うように(#1336) — 承認属性は **entities** コレクション(`createdBy` / `scope` / `entityType`)から読み取られます。

両方とも最初の書き込みの前に評価されるため、いずれかの要素に対する `Deny` はリクエスト全体を `403` で拒否し、何も永続化しません。MCP temporal バッチツールは HTTP コントローラーをバイパスするため、同じヘルパー(`syntheticCheckBatchEntityAuthz`)を呼び出します。

\#1928 以前では、両方の形式が認証されたアクターを完全に破棄していました: `PATCH /v2/entities/{id}/attrs` または `PATCH /ngsi-ld/v1/temporal/entities/{id}` を `403` でブロックしたポリシーは、同一の書き込みをバッチエンドポイント経由で送信することでバイパスされ、`204` が返されていました。

> **既知の制限(#1928 / #1941 では変更なし)**: temporal API 単独で作成されたエンティティは、entities コレクションにドキュメントを持たず、したがって所有者が記録されていません。そのようなエンティティは所有者ベースの制限を持ちません — バッチ形式 *および* by-id 形式の両方で同様であるため、承認パリティは保持されます。temporal のみのエンティティへの所有権の付与は、個別に追跡されています。

#### Temporal 履歴の作成は既存のエンティティへの書き込みである (#1941)

`POST /ngsi-ld/v1/temporal/entities` と `POST /ngsi-ld/v1/temporal/entityOperations/create` は作成のように見えますが、ターゲット id が既に **entities** コレクションにドキュメントを持っている場合、*他の誰かの* エンティティに履歴を書き込みます。#1941 以降、両方とも最初の書き込みの前に、保存された `entityOwner` / `scope` / `entityType` を評価します — すべての temporal ルートが行うように(#1336)、entities コレクションから読み取られます。

このギャップは見逃しやすいものでした。なぜなら、唯一の既存のガードである `temporalEntityExists` は、**temporal** コレクション単独を検査するからです。したがって、バイパスウィンドウはまさに「entities に外部所有のドキュメントがあり **かつ** まだ temporal ドキュメントがない」でした: `AlreadyExists` なし、所有権チェックなし、`201`。`PATCH /ngsi-ld/v1/temporal/entities/{id}` から `403` を受け取ったプリンシパルは、`create` を通じて同じエンティティの履歴を捏造できました — #1363 / #1325 / #1678 / #1928 / #1932 ファミリーのリクエスト形式パリティブレークです。

バッチ create はエンティティごとの *operation* エラーに対して `207 Multi-Status` を返しますが、承認はループ **の前に** リクエスト全体に対して評価されます: いずれかの要素に対する `Deny` はすべてを `403` で拒否し、何も永続化しません。要素ごとにスコア付けすると、バッチ形式が by-id 形式よりも弱くなり、それが修正されている欠陥です。

entities-collection ドキュメントを持たない ids は依然としてスキップされるため、真に temporal のみのエンティティは以前とまったく同じように作成されます。MCP `temporal` ツール(`create` / `batch_create`)と A2A `temporal` スキル(`create`)は HTTP コントローラーをバイパスするため、同じヘルパーを呼び出します。

#### 通知受信は書き込みであり、免除ではない(`POST /v2/op/notify`

、#1932)

`POST /v2/op/notify` は通知受信エンドポイントです。上流のContext Brokerまたはコンテキストプロバイダが `{ subscriptionId, data: [...] }` ペイロードを POST し、GeonicDB は `data[]` をローカルエンティティに追加します。#1932 以降、最初の書き込みの前に `data[]` の各要素の**保存済み**の `entityOwner` / `entityType` を評価します。これは `actionType: append` を指定した `POST /v2/op/update` と全く同じです。NGSIv2 仕様も Orion API もこのエンドポイントの認可を定義していないため、選択は GeonicDB に委ねられています。決定ルールはパリティ不変条件 (#1376) です:


* **呼び出し元はポリシーによって評価されるプリンシパルであり、匿名の通信路ではありません。** `/v2/op/notify` は特別な認証契約を持ちません。他のすべてのデータルートと同様に `optionalAuth` を通過します。つまり、`AUTH_ENABLED=false` の場合、すべてのリクエストは `super_admin` として扱われます。`AUTH_ENABLED=true` の場合、資格情報付きリクエストは独自のプリンシパルになり、資格情報なしリクエストは `role=anonymous` になります。デフォルトポリシーではパスステージで Deny されますが、カスタム `Permit` で許可できます。どのプリンシパルが結果であっても、ID 指定ルートが見るのと同じプリンシパルです。テナントポリシーが他の誰かが所有するエンティティへの書き込みを拒否する場合、その拒否は意図的なものであり、このリクエスト形状を含むすべてのリクエスト形状で維持される必要があります。
  
* **通知はリクエストの*形状*であり、権限レベルではありません。** これを免除すると、同じポリシーが `/v2/op/notify` に対しては `PATCH /v2/entities/{id}/attrs` よりも弱くなり、#1363 / #1325 / #1678 / #1928 と全く同じ欠陥クラスになります。強制されない場合、エンドポイントに到達できるプリンシパルはテナント全体に対する普遍的な書き込みプリミティブを保持します。
  
* **`subscriptionId` は認可入力として使用されません。** これは呼び出し元が提供する自由形式の文字列 (`Ngsiv2NotifySchema`) であるため、そこから権限を導出すること(例:「登録されたサブスクリプションを指名する者を信頼する」)は、構造的にフェイルオープンになります。認証されたアクターと保存されたエンティティ属性のみが使用されます。また、マッチングする対象がないことにも注意してください。この ID は**通知を送信したContext Broker上の**サブスクリプションを識別するものであり、受信Context Brokerはそれに関する記録を持ちません。サブスクリプション由来の認可はここでは安全でないだけでなく、操作するデータが存在しません。

作成は影響を受けません。保存されたドキュメントがない ID は作成としてスキップされるため、新しいエンティティを導入する通知は以前と全く同じように動作します。ブロックされるのは、ポリシーが保護する**既存の**エンティティの上書きです。上流のContext Brokerが所有していないエンティティを上書きできるようにしたいデプロイメントは、欠落したチェックに依存するのではなく、ポリシーでそれを明示する必要があります(例:その `userId` に対する `/v2/op/notify` の `Permit` ルール)。

**認可ルックアップは書き込みが触れる範囲のスーパーセットでなければなりません。** 認可属性を解決するプロジェクションクエリは、読み取りパスが適用する「ライブ」述語 (`deletedAt` / `expiresAt`) を意図的に省略します。バッチ書き込みフィルタもそれらを適用しないためです。認可ルックアップが書き込みよりも狭い述語(テナント / servicePath / プロトコル / 論理削除 / 有効期限 / タイプ)を持つ場合、影響を受けるドキュメントは認可に対して*不在*に見え、作成として扱われ、チェックを完全にスキップします。これは静かなフェイルオープンです。過剰包含は無害です。認可が見ることができるが読み取りができないドキュメントは、その後も `404` として返されます。

### デフォルトポリシー

GeonicDB は以下のロールデフォルトポリシーを構成します(信頼できる情報源:`src/core/auth/policy/policy.defaults.ts`):


* **`super_admin`**: 管理 API (`/admin/**`)、読み取り専用の統計/メトリクス、および `/me/**` で Permit。拒否フェンス(優先度 `-1`、上書き不可)がデータ API (`/v2/**`、`/ngsi-ld/**`、`/catalog/**`、`/rules/**`、`/custom-data-models/**`、`/mcp`)をブロックします。プラットフォーム管理者はテナントデータに触れることができません。`/a2a` はフェンスにリストされていませんが、デフォルトの Permit もないため、フェイルクローズドパスステージによって同様に拒否されます。
  
* **`tenant_admin`**: すべてのデータ API、AI ツールエンドポイント `/mcp` および `/a2a` (#1651)、およびテナントスコープの管理 API で Permit(すべてのメソッド)。
  
* **`user`**: NGSI API (`/v2/**`、`/ngsi-ld/**`)で Permit(CRUD)。`/catalog/**`、`/rules/**`、`/custom-data-models/**`、および `/mcp` では `GET` のみ。さらに `/me/**` と読み取り専用の統計/メトリクスエンドポイント。MCP ツール呼び出しトランスポートは `POST /mcp`、A2A は `POST /a2a` であることに注意してください。**どちらも `user` デフォルトではカバーされません**(`GET /mcp` のみ。`/a2a` は全くありません)。したがって、`user` が MCP / A2A ツールを呼び出すには、`api_key` / `oauth_client` と同様に、カスタム Permit ポリシーが必要です。
  
* **`api_key` / `anonymous` / `oauth_client`**: 空ルールデフォルト(`rules: []`)。デフォルトの `Permit` がないため、すべてのリクエストは `NotApplicable` と評価され、フェイルクローズド PEP によって `403` で拒否されます(明示的な XACML `Deny` ではありません。[パスレベル vs エンティティレベル認可](#パスレベル-vs-エンティティレベル認可) を参照)。明示的な Permit ポリシーがバインドされるまで、事実上アクセスできません。

`tenant_admin` が作成するカスタムテナントポリシーは、許可リスト `TENANT_POLICY_ALLOWED_PATH_PREFIXES` (`/v2/`、`/ngsi-ld/`、`/catalog`、`/rules`、`/custom-data-models`、`/mcp`、`/a2a`)内のパスのみをターゲットにできます。これは、MCP / A2A ツールアクセス(`POST /mcp` / `POST /a2a`)を `user` / `api_key` / `oauth_client` プリンシパルに付与する方法でもあります([MCP / A2A ツール認可](#mcp--a2a-tool-authorization-1610--1651--1672) を参照)。

### 匿名アクセスポリシー (GeonicDB 拡張)

GeonicDB は、テナント管理者によって設定された場合、データ API への匿名(認証なし)アクセスをサポートします。これは、認証を必要とせずに公開データ(例:気象観測、オープンデータセット)を公開する場合に便利です。

#### 前提条件


1. **明示的な Permit ポリシーを作成する**: `role=anonymous` を対象として、希望するアクセスレベルを設定します(#748 以降、機能フラグは不要)

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
  
* **ポリシーなし = 拒否**: 匿名アクセスには常に明示的な XACML Permit ポリシーが必要です。
  
* **管理 API にはアクセス不可**: 匿名ユーザーは、ポリシーに関係なく `/admin/*`、`/auth/*`、または `/me/*` エンドポイントにアクセスできません。
  
* **テナント分離**: 匿名リクエストには `Fiware-Service` ヘッダーが必要です。匿名ユーザーは指定されたテナントに紐付けられ、他のテナントのデータにはアクセスできません。
  
* **取り消し可能**: XACML Permit ポリシーを削除すると、すべての匿名アクセスを即座にブロックできます。

***

## ポリシー伝播遅延と HTTP キャッシュの整合性 (#1050)

XACML ポリシーが `/admin/policies` 経由で追加、変更、または削除される際、Lambda インスタンスがキャッシュされた評価結果を提供し続ける可能性がある小さな時間枠が存在します。

### キャッシュレイヤー


1. **`PolicyService` インスタンスキャッシュ (TTL: `AUTH.POLICY_CACHE_TTL_MS` = 60s)** — Lambda インスタンスごとのインメモリキャッシュで、`findActivePoliciesForTenant(tenantId)` の結果を保持します。同一の Lambda インスタンス内でのポリシー作成/更新/削除操作時に無効化されますが、他の Lambda インスタンスは TTL の有効期限に依存します。
   
2. **データエンドポイントの HTTP / CDN キャッシュなし** — すべてのデータエンドポイントは `Cache-Control: private, no-cache` を返します (#1047)。共有キャッシュはこれらのレスポンスを保存してはならず、プライベートキャッシュであっても再検証が必要です。そのため、ポリシー変更は、新しい PolicyService キャッシュを持つ Lambda に次のリクエストが到達するとすぐに伝播します (≤ 60s)。

### 最悪ケースの伝播遅延


* **単一の Lambda インスタンス**: 即座 (同じ書き込みでキャッシュが無効化されます)。
  
* **複数の Lambda インスタンス**: すべてのインスタンスが変更を反映するまで最大 `POLICY_CACHE_TTL_MS` (デフォルト 60s)。

これはほとんどの認可変更において許容範囲です。即座の取り消しが必要な場合は、Lambda インスタンスを再起動するか、ユーザーのトークンをローテーションして強制的に再認証を行ってください。

### ポリシー取り消し後の HTTP キャッシュの整合性

ハンドラーは、`tests/unit/handlers/api/index.test.ts` のユニットテストの `#1050` リグレッションテストによって固定された、この固定順序でミドルウェアを評価します:

```text
extractAuthContext → optionalAuth → checkTenantAccess → requireAuthz (XACML PEP)
  → controller (200 + ETag)
  → evaluateConditionalRequest (200 → 304 if If-None-Match matches)
```

`requireAuthz` が `ForbiddenError` をスローした場合 (ポリシーが取り消された場合)、レスポンスは `catch` ブロックを通過し、`4xx` を直接返します — `evaluateConditionalRequest` は**呼び出されません**。したがって、クライアントが取り消し前の古い ETag を含む `If-None-Match` を送信しても、サーバーは `403` を返し、`304` は返しません。古いビューが再表示されることはありません。

### 運用上の推奨事項


* **監査上重要な取り消し**は、トークンの無効化([トークンの無効化](#token-invalidation)を参照)と組み合わせて、ユーザーを強制的にログアウトさせ、実行中のキャッシュされたレスポンスがクライアントによって信頼されるのを防ぐ必要があります。
  
* **ポリシーのホットフィックス** (≤ 60s の伝播) は、ほとんどの運用変更において十分です。ポリシー変更を伝える際には、伝播の期待値を文書化してください。

***

## リソーススコープ (非推奨)

> **#748 で削除**: リソーススコープ (JWT 内の `resourceScopes`、`checkResourceScopes()`、`filterByResourceScopes()`) は、XACML 認可統合の一環として削除されました。きめ細かいアクセス制御には、代わりに XACML ポリシーを使用してください。

***

## テナントごとの機能フラグ (非推奨)

> **#748 で削除**: テナント機能フラグ (`apiKeysEnabled`、`oauthClientsEnabled`、`anonymousAccessEnabled`) は削除されました。認可は現在、ロールベースのデフォルトを持つ XACML ポリシーによって完全に処理されます:
>
> * API キー: デフォルトは拒否、明示的な XACML 許可ポリシーが必要
> * OAuth クライアント: 常に利用可能 (機能フラグゲートなし)
> * 匿名アクセス: デフォルトは拒否、明示的な XACML 許可ポリシーが必要 (機能フラグ不要)

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

> **⚠️ ポリシー依存**: `role=anonymous` をターゲットとする明示的な XACML Permit ポリシーが必要です。それがない場合は 403 を返します。

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

#### シナリオ 6: 匿名アクセス(認証なし)

```bash
# No Authorization header needed
# Requires: XACML Permit policy for role=anonymous (no feature flag needed since #748)
curl -X GET http://localhost:3000/v2/entities?type=WeatherObserved \
  -H "Fiware-Service: mytenant"
```

***

## トークン無効化

GeonicDB はユーザーごとのトークン無効化メカニズムを提供します。

### 無効化の仕組み

ユーザーごとにタイムスタンプ (`invalidatedBefore`) が保持されます。これは「この時刻より前に発行されたトークンは無効」を意味します。トークンの `iat` (発行時刻) がこのタイムスタンプより前の場合、そのトークンは無効と判断されます。

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

DynamoDB テーブルには TTL が設定されており (7 日間)、リフレッシュトークンの有効期限を超えたレコードは自動的に削除されます。

### 注意事項


* OAuth 2.0 Client Credentials トークンはトークン無効化の対象外です
  
* ログアウト後の再ログインでは新しいトークンが発行されます
  
* ログアウト直後 (同じ秒以内) の再ログインは安全です。JWT の `iat` は 1 秒精度であるため、新しく発行されたトークンは無効化の閾値を超えて `iat` を進めます (`iat = max(now, invalidatedBefore)`、最大で 1 秒先まで)。したがって、無効化ウィンドウに引っかかりません。逆に、各無効化書き込みは閾値を引き上げるため (`max(now + 1, current + 1)`)、進められたトークンも後続のログアウトによって確実に無効化されます (#1351)

### WebSocket トークン再検証

WebSocket 接続では、接続確立時に JWT の `exp` (有効期限) が DynamoDB に保存されます。後続のメッセージ受信時に `exp` が再検証され、トークンが期限切れの場合は `401` が返されます (OWASP API2:2023 準拠)。


* 接続時:`connect` ハンドラが `ConnectionRecord` に `tokenExp` を保存します
  
* メッセージ受信時:`default` ハンドラが `tokenExp` と現在時刻を比較します

***

## ブルートフォース保護

GeonicDB はログインエンドポイント (`POST /auth/login`) と OAuth トークンエンドポイント (`POST /oauth/token`) に対するブルートフォース攻撃防止機能を含んでいます (OWASP API2:2023 準拠)。

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


* **追跡キー**: `oauth:<clientId>` の形式で `LoginProtectionService` を共有
  
* **成功時**: カウンターリセット
  
* **非アクティブクライアント**: 認証失敗として記録

### 設計原則


* **メールベース**: IP アドレスは VPN/プロキシで簡単に回避できるため、メールアドレスごとに追跡
  
* **Lambda 最適化**: `sleep()` 遅延の代わりに `429 + Retry-After` ヘッダーで応答 (Lambda の請求コストを回避するため)
  
* **自動クリーンアップ**: 試行記録は MongoDB TTL インデックスにより 1 時間後に自動削除
  
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

GeonicDB は、OWASP API1:2023 (Broken Object Level Authorization) への対策として、Subscription と Registration に対する所有権検証を提供します。

### 概要

NGSI 仕様ではテナント分離 (`Fiware-Service` ヘッダー) のみによってアクセス制御を行いますが、マルチユーザーのテナント環境では課題があります。同一テナント内のユーザーが他のユーザーのリソースを操作できてしまいます。GeonicDB は `createdBy` フィールドを導入し、書き込み操作時に所有権を検証します。

### 対象リソース

| Resource                                                               | Target Operations |
| ---------------------------------------------------------------------- | ----------------- |
| Subscription (`/v2/subscriptions`, `/ngsi-ld/v1/subscriptions`)        | UPDATE, DELETE    |
| Registration (`/v2/registrations`, `/ngsi-ld/v1/csourceRegistrations`) | UPDATE, DELETE    |

> **注意**: 読み取り操作 (GET/LIST) は制限されません。NGSI 仕様に準拠したテナント分離のみが適用されます。

### ロール別の動作

| Role           | Own resource | Other's resource    | createdBy not set                |
| -------------- | ------------ | ------------------- | -------------------------------- |
| `super_admin`  | ✅ Operable   | ✅ Operable (bypass) | ✅ Operable                       |
| `tenant_admin` | ✅ Operable   | ✅ Operable (bypass) | ✅ Operable                       |
| `user`         | ✅ Operable   | ❌ 403 Forbidden     | ✅ Operable (backward compatible) |

### 動作仕様


1. **作成時**: リソースが作成されると、認証されたユーザーの ID が自動的に `createdBy` フィールドに記録されます
   
2. **更新/削除時**: リクエストしたユーザーの ID が `createdBy` と照合されます
   
   * 一致: 操作が許可されます
     
   * 不一致: `403 Forbidden` を返します
     
   * `createdBy` が設定されていない (既存データ): 後方互換性のため操作が許可されます
     
3. **管理者バイパス**: `super_admin`/`tenant_admin` は所有権チェックをスキップします
   
4. **認証が無効の場合**: `AUTH_ENABLED=false` の場合、所有権チェックはスキップされます

### エラーレスポンス

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

* ログイン失敗の回数が多すぎる(ブルートフォース攻撃保護)
  
* アカウントがロックされている

**解決方法:**

* `Retry-After` ヘッダーに示された秒数を待ってから再試行する
  
* ロックされている場合は、管理者に `POST /admin/users/{userId}/unlock` を使用してロックを解除してもらう

### 認証エラー (401 Unauthorized)

**考えられる原因:**

* トークンが無効または期限切れ
  
* `JWT_SECRET` が正しく設定されていない
  
* ユーザーまたはテナントが無効化されている
  
* ログアウトまたはパスワード変更後のトークン(すでに無効化されている)

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
  
* `Fiware-Service` ヘッダーがユーザーのテナントと一致していることを確認する
  
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
  
* 開発ガイド - API 仕様(ページネーション、ステータスコード)とデプロイメント
  
* [XACML 3.0 仕様](https://docs.oasis-open.org/xacml/3.0/xacml-3.0-core-spec-os-en.html) - 公式 XACML 3.0 仕様
