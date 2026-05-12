---
title: "Authentication Guide"
description: "GeonicDB authentication and authorization guide"
outline: deep
---
# 認証・認可ガイド

このドキュメントは、GeonicDB の認証・認可機能の全体像、セットアップ、および管理について説明します。

## 目次


* [概要](#overview)
  
* [認証アーキテクチャ](#認証アーキテクチャ)
  
* [初期セットアップ](#初期セットアップ)
  
* [ユーザー・テナント管理](#user--tenant-management)
  
* [API Key 認証](#api-key-authentication)
  
  * [API Key トークン交換 (Browser SDK)](#api-key-token-exchange-browser-sdk)
    
  * [DPoP トークンバインディング (RFC 9449)](#dpop-トークンバインディング-rfc-9449)
    
* [OAuth 2.0 M2M 認証](#oauth-20-m2m-認証)
  
* [OIDC 外部 IdP 認証](#oidc-外部-idp-認証)
  
* [XACML ポリシーベース認可](#xacml-ポリシーベース認可)
  
* [認証シナリオリファレンス](#認証シナリオリファレンス)
  
* [トラブルシューティング](#トラブルシューティング)

***

## 概要

GeonicDB は JWT ベースの認証・認可機能を提供します。

### ロール設定

| Role           | Description            | Permissions                                                                                                                                                                                           |
| -------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `super_admin`  | Platform administrator | `/admin/*`, `/auth/*`, `/me/*`, monitoring endpoints (`/statistics`, `/metrics`, `/cache/statistics`) only. **Cannot** access data APIs (`/v2/*`, `/ngsi-ld/*`, `/catalog*`, `/rules*`) — returns 403 |
| `tenant_admin` | Tenant administrator   | Full access within the assigned tenant (admin + data APIs)                                                                                                                                            |
| `user`         | General user           | Read-only by default (GET only). Custom XACML policies can grant write access                                                                                                                         |
| `anonymous`    | Unauthenticated user   | Denied by default. Explicit XACML Permit policy required. No feature flag needed (#748)                                                                                                               |

> **注意**: `super_admin` は SaaS セキュリティのため、プラットフォーム管理操作に制限されています。
> 顧客データの分離が強制されます — `super_admin` 資格情報を持つ Geolonia スタッフは、テナントのエンティティデータにアクセスできません。
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

GeonicDB の認証と認可は、以下のレイヤーで構成されています。

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
[5. Authorization (AuthZ)] XACML policy-based authorization (when AUTH_ENABLED=true)
  ↓                → XacmlService.evaluate()
[6. Endpoint Processing]
```

### 環境変数

| Variable                        | Default                                       | Description                                                                                     |
| ------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `AUTH_ENABLED`                  | `false`                                       | Enable JWT authentication                                                                       |
| `JWT_SECRET`                    | `development-secret-key-change-in-production` | Secret for JWT signing                                                                          |
| `JWT_EXPIRES_IN`                | `1h`                                          | Access token expiration                                                                         |
| `JWT_REFRESH_EXPIRES_IN`        | `7d`                                          | Refresh token expiration                                                                        |
| `SUPER_ADMIN_EMAIL`             | -                                             | Super Admin email address via environment variable                                              |
| `SUPER_ADMIN_PASSWORD`          | -                                             | Super Admin password via environment variable                                                   |
| `ADMIN_ALLOWED_IPS`             | -                                             | Allowed IPs for Admin API access (CIDR)                                                         |
| `OAUTH_ENABLED`                 | ~~`false`~~                                   | **Deprecated**: OAuth 2.0 is always enabled when `AUTH_ENABLED=true`. This variable is ignored. |
| `OIDC_ENABLED`                  | `false`                                       | Enable OIDC external IdP authentication                                                         |
| `OIDC_ISSUER`                   | -                                             | OIDC Issuer URL                                                                                 |
| `OIDC_AUDIENCE`                 | -                                             | OIDC Audience (aud claim)                                                                       |
| `TOKEN_INVALIDATION_TABLE_NAME` | -                                             | DynamoDB table name for token invalidation (in-memory when not set)                             |

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

* データベースには保存されない(メモリ内のみ)
  
* サーバー再起動後も同じ認証情報で利用可能
  
* パスワードを変更するには環境変数を更新してサーバーを再起動する必要がある

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

### CADDE 設定管理(super\_admin のみ)

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

| Endpoint                           | Method | Description      |
| ---------------------------------- | ------ | ---------------- |
| `/admin/users`                     | GET    | Get user list    |
| `/admin/users`                     | POST   | Create user      |
| `/admin/users/{userId}`            | GET    | Get user         |
| `/admin/users/{userId}`            | PATCH  | Update user      |
| `/admin/users/{userId}`            | DELETE | Delete user      |
| `/admin/users/{userId}/activate`   | POST   | Activate user    |
| `/admin/users/{userId}/deactivate` | POST   | Deactivate user  |
| `/admin/users/{userId}/unlock`     | POST   | Clear login lock |

#### テナント存在検証

`tenantId` を持つユーザーを作成または更新する際、システムは指定されたテナントが存在することを検証します。テナントが存在しない場合、`400 Bad Request` エラーが返されます。


* **POST /admin/users**: `tenantId` は既存のテナントを参照する必要があります(`super_admin` ユーザーを除く。これらはテナントを持ちません)
  
* **PATCH /admin/users/{userId}**: `tenantId` を変更する場合、対象のテナントが存在する必要があります。`tenantId` を `null` に設定することは検証なしで許可されます。

### テナントメンバーシップ管理

FIWARE Keyrock Organization モデルに準拠し、単一のユーザーは複数のテナントに所属できます。メンバーシップはユーザー作成時に自動的に作成されます。

| Endpoint                                   | Method | Description                    | Authorization                               |
| ------------------------------------------ | ------ | ------------------------------ | ------------------------------------------- |
| `/admin/tenants/{tenantId}/users`          | GET    | List tenant members            | `tenant_admin` (own tenant) / `super_admin` |
| `/admin/tenants/{tenantId}/users/{userId}` | PUT    | Add user to tenant             | `tenant_admin` (own tenant) / `super_admin` |
| `/admin/tenants/{tenantId}/users/{userId}` | DELETE | Remove user from tenant        | `tenant_admin` (own tenant) / `super_admin` |
| `/admin/users/{userId}/tenants`            | GET    | List tenants a user belongs to | Self / `super_admin`                        |

#### テナントスコープログイン

ログイン時に `tenantId` を指定することで、そのテナントにスコープされた JWT トークンを取得できます。テナントはリクエストボディまたは HTTP ヘッダーで指定できます。

```bash
# Login with tenantId in request body
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password12345",
    "tenantId": "target-tenant-id"
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

1. `body.tenantId` — テナント ID の直接指定(最優先)
   
2. `NGSILD-Tenant` / `Fiware-Service` ヘッダー — テナント名で解決
   
3. プライマリテナント(`user.tenantId`) — どちらも指定されていない場合のフォールバック

**動作:**

* `tenantId` を指定した場合:メンバーシップを確認した後、そのテナントにスコープされたトークンを発行
  
* `NGSILD-Tenant` / `Fiware-Service` ヘッダーを指定した場合:テナント名で解決します。テナント名が見つからない場合または無効な形式の場合(`^[a-z0-9_]+$` に一致する必要があります)、`400 Bad Request` を返します
  
* テナント指定なしの場合:プライマリテナント(`user.tenantId`)のトークンを発行します。ユーザーが複数のテナントに所属している場合、レスポンスに `availableTenants` リストが含まれます
  
* ユーザーが所属していないテナントを指定した場合:`403 Forbidden`

#### メンバーシップのライフサイクル


* **ユーザー作成時**:`POST /admin/users` によりメンバーシップが自動的に作成されます
  
* **追加登録**:`PUT /admin/tenants/{tenantId}/users/{userId}` により別のテナントに追加
  
* **テナント削除時**:すべてのテナント関連データがカスケード削除されます(entities、subscriptions、registrations、temporalEntities、snapshots、rules、policies、OAuth クライアント、データモデル、ユーザー、メンバーシップなど — 全 16 コレクション)
  
* **ユーザー削除時**:ユーザーに関連するすべてのメンバーシップが自動的に削除されます

### テナント毎の CORS 許可オリジン (#1069)

GeonicDB はリクエストの `Origin` ヘッダーをテナントレベルのホワイトリストに対して検証します。これは API-Key の `allowedOrigins` の上に重ねられ、匿名、JWT、API-Key リクエストのいずれにも適用されます。GeonicDB はマルチテナント Context Broker であるため、許可オリジンは環境変数で固定することは**できません** — 実行時に管理 API を通じてテナント毎に設定する必要があります。

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

| Value                              | Behavior                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Field absent                       | All origins allowed (backward compat — existing tenants unaffected).                                    |
| `[]` (explicit empty array)        | All origins denied.                                                                                     |
| `["*"]`                            | All origins allowed. Requests without `Origin` header (curl / S2S / CLI) also pass.                     |
| `["https://app.example.com", ...]` | Exact match only (max 50 entries; protocol + host + port). Requests without `Origin` header are denied. |

#### 適用


* **プリフライト (OPTIONS)** はオリジン検証されません (CORS 仕様:テナントヘッダーはプリフライトにありません)。常にリクエストの `Origin` をエコーバックし、204 を返します。
  
* **実際のリクエスト**は `optionalAuth(event, tenantService)` (データ API) または `requireAuth(event)` (管理 / `/auth/logout`) を通過します。オリジンが一致しない場合、リクエストは `403 Forbidden` で拒否され、ボディは `Origin not allowed for this tenant` となります。
  
* 403 レスポンスには依然として `Access-Control-Allow-Origin` のエコーバック + `Vary: Origin` が含まれるため、ブラウザは実際のエラーをクライアントに表示します (そうでなければ開発者は一般的な Network エラーを見ることになります)。
  
* `super_admin` ユーザー (`tenantId: null`) はオリジン検証をスキップします — 彼らはテナントスコープの上で動作します。

#### API Key の `allowedOrigins` とのレイヤリング

API Key が使用される場合、両方のチェックが適用されます:


1. **テナントレベル**: `tenant.settings.allowedOrigins` を満たす必要があります。
   
2. **API-Key レベル**: `apiKey.allowedOrigins` を満たす必要があります (既存の動作、変更なし)。

最も制限的なものが優先されます。

### テナント毎の IP 制限

テナント毎に固有の IP アドレス制限を設定できます。グローバル設定 (`ADMIN_ALLOWED_IPS`) に加えて、テナントレベルでのきめ細かなアクセス制御が可能です。

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

テナントに IP 制限が設定されていない場合、グローバル設定 (`ADMIN_ALLOWED_IPS` 環境変数) が適用されます。テナントレベルの設定が存在する場合は、そちらが優先されます。

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

API キーは、オリジンとレート制限の組み込み制限、および `policyId` を介したオプションの XACML ポリシーバインディングを備えた、よりシンプルな認証メカニズムを提供します。

### 認証ヘッダー

```http
X-Api-Key: <UUID or gdb_-prefixed key>
```

**優先順位**: `Authorization: Bearer` と `X-Api-Key` ヘッダーの両方が存在する場合、Bearer トークンが優先されます。API キーは、Bearer トークンが提供されていない場合のフォールバックとしてのみ使用されます。

### キー形式


* **新しいキー**: プレーンな UUID (`randomUUID()`) — 例: `550e8400-e29b-41d4-a716-446655440000`
  
* **レガシーキー**: `gdb_` プレフィックスを持つ既存のキーは引き続き動作します (下位互換性あり)
  
* **ストレージ**: キーの SHA-256 ハッシュのみがデータベースに保存されます。平文のキーは、作成時と更新時にのみ返されます。
  
* **マスキング**: リストと取得レスポンスは、実際のキーの代わりに `"key": "******"` を返します

### 制限事項

| Field              | Description                                                                                                                                                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Origin**         | `allowedOrigins` — list of permitted URL origins (or `*` for any). At least 1 required. Max 20 entries. Enforced at runtime.                                                                                                                          |
| **Policy Binding** | `policyId` — optional. Binds the key to an existing XACML policy. The bound policy's target is bypassed during evaluation (only rules are evaluated). Without `policyId`, the key falls back to tenant policies + role default (api\_key = All Deny). |
| **Rate Limit**     | `rateLimit.perMinute` — requests per minute (1–1000, default: 60).                                                                                                                                                                                    |

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

ユーザーは管理者権限なしで自身の API キーを作成および管理できます。

| Endpoint                       | Method | Description                                                  |
| ------------------------------ | ------ | ------------------------------------------------------------ |
| `/me/api-keys`                 | POST   | Create own API key                                           |
| `/me/api-keys`                 | GET    | List own API keys                                            |
| `/me/api-keys/{keyId}`         | PATCH  | Update own API key (partial)                                 |
| `/me/api-keys/{keyId}`         | DELETE | Delete own API key                                           |
| `/me/api-keys/{keyId}/refresh` | POST   | Refresh (regenerate) own API key — returns new plaintext key |

**制限事項:**

* 1 ユーザーあたり最大 **5 個のキー**
  
* `allowedOrigins` は作成時に必須(空でない配列; すべてのオリジンを許可する場合は `["*"]` を使用)
  
* `policyId` は任意 — 指定する場合、参照されるポリシーは既に存在しており、同じユーザーによって作成されている必要があります
  
* `tenantId` は `super_admin` には必須(未指定の場合は 400); `tenant_admin` は省略可能(セッションから自動導出)

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

> **注意:** `keyId` は自動生成されます (UUID)。`tenantId` は `super_admin` の場合は必須です。`tenant_admin` は省略可能です (セッションから自動的に導出されます)。`policyId` はオプションです。省略した場合、認可はテナントポリシーとロールのデフォルトにフォールバックします。ID (`keyId`、`policyId`) はテナントごとに一意です。

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

> **注意:** `keyPrefix` フィールドは削除されました。`key` フィールドは、作成時とリフレッシュ時のみプレーンテキストで返されます。リスト/取得レスポンスでは `"key": "******"` が返されます。
>
> **後方互換性:** `gdb_` プレフィックスを持つ既存のキーは有効なまま動作し続けます。新しく作成されたキーのみが UUID 形式を使用します。

#### API キーをリフレッシュする

```bash
curl -X POST http://localhost:3000/me/api-keys/{keyId}/refresh \
  -H "Authorization: Bearer <accessToken>"
```

キーの値を再生成します。古いキーは直ちに無効化されます。レスポンスには新しいプレーンテキストのキーが含まれます (作成レスポンスと同じ形式)。

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

デフォルトでは、API キーには `Deny` ポリシー (`__default_api_key`、優先度 -2) が適用されます。権限を付与するには、まず XACML ポリシーを作成し、`policyId` フィールドを介して API キーにバインドします。

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

> **注意:** `policyId` と `ruleId` は省略された場合、自動生成されます (UUID)。ID はテナントごとに一意です — 異なるテナントは同じ ID を独立して使用できます。

`policyId` が指定されている場合、バインドされたポリシーの `target` は評価時にバイパスされ、ポリシーの `rules` のみが評価されます。これにより、単一のポリシーをターゲットの競合なしに複数の資格情報間で共有できます。

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

セルフサービスキーの場合、`PATCH /me/api-keys/{keyId}` を使用します — `policyId` は認証されたユーザーが作成したポリシーを参照する必要があります:

```bash
curl -X PATCH http://localhost:3000/me/api-keys/{keyId} \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"policyId": "my-readonly-policy"}'
```

### API キー トークン交換 (Browser SDK)

ブラウザベースのアプリケーションでは、キー漏洩のリスクがあるため、API キーを `X-Api-Key` ヘッダーで直接使用することはできません。代わりに、GeonicDB は Nonce + Proof of Work を介して API キーを短期有効な セッション JWT に変換するトークン交換フローを提供します。

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


1. **Origin バリデーション**: Nonce は HMAC を介してリクエスト Origin にバインドされます。Origin が一致しない場合は拒否されます
   
2. **HMAC Nonce**: ステートレスで、サーバーシークレットで署名され、タイムスタンプ + Origin + keyId を含みます。TTL は 60 秒です
   
3. **Proof of Work**: SHA-256 ベース、難易度=4 (先頭 4 ビットがゼロ)。外部依存なしで自動化された悪用を防ぎます
   
4. **短期有効 JWT**: `api_key_session` タイプ、1 時間で有効期限切れ、policyId を埋め込みます

#### JavaScript SDK

GeonicDB は、トークン交換フロー全体を自動的に処理する npm パッケージ (`@geolonia/geonicdb-sdk`) として JavaScript SDK を提供します:

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

SDK は nonce 取得、PoW 解決、トークン更新を透過的に処理します。

#### 外部トークン注入

外部で Bearer JWT ログインを使用する場合 (例: アプリケーションレベルのログインフロー)、`setCredentials()` を介して SDK にトークンを注入し、`on('tokenRefresh', cb)` でトークン更新同期のためのコールバックを登録します:

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

> **注意**: `setCredentials()` が `tokenType: 'Bearer'` と `refreshToken` で呼び出された場合、以降のすべての API 呼び出しと `connect()` は DPoW/PoW を完全にバイパスします。トークン更新は `/auth/refresh` を使用するため、PoW の再計算は不要です。

詳細については SDK ドキュメントを参照してください。

### DPoP トークンバインディング (RFC 9449)

GeonicDB は [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) に準拠した DPoP (Demonstration of Proof-of-Possession) をサポートし、トークンをクライアントが保持する暗号鍵にバインドします。これにより、トークンの盗難とリプレイ攻撃のリスクが排除されます。JWT が傍受されたとしても、対応する秘密鍵がなければ使用できません。

#### 仕組み


1. **鍵ペアの生成**: クライアントは ECDSA P-256 鍵ペアを生成します (SDK は `crypto.subtle.generateKey` を `extractable: false` で使用)
   
2. **DPoP プルーフによるトークン交換**: クライアントは `POST /oauth/token` 時にプルーフ JWT を含む `DPoP` ヘッダーを送信
   
3. **トークンバインディング**: サーバーはプルーフを検証し、発行する JWT に JWK Thumbprint ([RFC 7638](https://datatracker.ietf.org/doc/html/rfc7638)) を `cnf.jkt` として埋め込みます
   
4. **リクエストごとのプルーフ**: 各 API リクエストには新しい DPoP プルーフが含まれます。サーバーはプルーフの `jkt` がトークンの `cnf.jkt` と一致することを検証します

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

GeonicDB は RFC 9449 セクション 8 に準拠したサーバー提供のナンスを実装し、事前計算された DPoP プルーフを防止します。ナンスハンドシェイクは透過的に行われます:


1. クライアントは `nonce` クレームなしで DPoP プルーフを送信
   
2. サーバーは `error: "use_dpop_nonce"` と `DPoP-Nonce` レスポンスヘッダーを含む `400` を返します
   
3. クライアントは `nonce` クレームにサーバーナンスを含む新しい DPoP プルーフを作成
   
4. サーバーはナンスを検証してトークンを発行します。レスポンスには後続のリクエスト用の新しい `DPoP-Nonce` が含まれます

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

DPoP バインドトークンを使用する API リクエストにもナンスが必要です。サーバーは成功レスポンスごとに `DPoP-Nonce` ヘッダーを返し、`use_dpop_nonce` メッセージを含む `401` エラー時にも返します。

#### DPoP プルーフ JWT 構造

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

トークン交換時に `DPoP` ヘッダーが送信されない場合(`dpopRequired` が `false` の場合)、サーバーはバインディングなしの標準的な `Bearer` トークンを発行します。これにより DPoP をサポートしないクライアントとの後方互換性が維持されます。

| DPoP Header    | `dpopRequired` | Result                                      |
| -------------- | -------------- | ------------------------------------------- |
| Present, valid | `false`        | `token_type: "DPoP"` with `cnf.jkt` binding |
| Present, valid | `true`         | `token_type: "DPoP"` with `cnf.jkt` binding |
| Absent         | `false`        | `token_type: "Bearer"` (no binding)         |
| Absent         | `true`         | `400 invalid_dpop_proof` (rejected)         |

> **注意**: すべての DPoP バウンドリクエスト(トークン交換と API 呼び出し)は nonce ハンドシェイクに参加します。JavaScript SDK はこれを透過的に処理します。

#### SDK DPoP サポート

JavaScript SDK (`@geolonia/geonicdb-sdk`) は `crypto.subtle` が利用可能な場合、自動的に DPoP を有効にします:


* 初期化時に抽出不可能な ECDSA P-256 鍵ペアを生成
  
* トークン交換と API リクエストに DPoP プルーフを添付
  
* `crypto.subtle` がない環境では Bearer モードにフォールバック
  
* トークン交換と API リクエストの両方で `use_dpop_nonce` リトライを自動的に処理
  
* WebSocket 接続は接続後の `dpop_bind` メッセージをプルーフ検証に使用

利用可能なすべてのメソッドについては、完全な SDK API リファレンスを参照してください。

#### DPoP と HTTP キャッシュの相互作用 (#1052)

DPoP は HTTP キャッシュフローの 3 つのポイントに関係します:


1. **`Vary` における DPoP プルーフ JWT?** — いいえ。プルーフにはリクエストごとの `jti` と `iat` が含まれるため、`Vary` に追加するとすべてのリクエストがキャッシュミスになります。`Authorization` のバウンドアクセストークンが重要なキャッシュキーのディメンションです。プルーフは個別に検証され、ボディコンテンツには影響しません。
   
2. **`304 Not Modified` における `DPoP-Nonce`** — はい、パススルーされます。キャッシュコントロールミドルウェアは 304 レスポンスヘッダー(`evaluateConditionalRequest`)で `DPoP-Nonce` をホワイトリストに登録します。サーバーが nonce をローテートすると、`304` でも最新の nonce が配信されるため、クライアントが遅れることはありません。このパススルーがないと、`304` を受信したクライアントは古い nonce でリトライし、次のリクエストで `401 + use_dpop_nonce` に遭遇します。
   
3. **DPoP 認証の失敗** — 古いまたは欠落した DPoP プルーフは、`evaluateConditionalRequest` が実行される前に `requireAuth` で拒否されます([ポリシー伝播遅延](#policy-propagation-delay--http-cache-integrity-1050) でハンドラーの順序を参照)。古い `If-None-Match` は以前の有効なセッションから `304` を再表示することはできません — レスポンスは `401` であり、`304` ではありません。

セキュリティモデルについては SECURITY.md — DPoP & Cache Integrity を参照してください。

***

## OAuth 2.0 M2M 認証

GeonicDB は OAuth 2.0 Client Credentials フローを介したマシン間(M2M)認証をサポートしています。

### 概要

OAuth 2.0 Client Credentials フローは、サーバー間通信やバックグラウンドジョブなどのマシン間(M2M)シナリオに最適化された認証方法です。

### OAuth 2.0 を使用するタイミング


* **マシン間通信**: API 間の呼び出し
  
* **バックグラウンドジョブ**: ユーザーインタラクションなしのバッチ処理
  
* **サービス間統合**: マイクロサービス間の認証
  
* **CI/CD パイプライン**: 自動デプロイメントおよびテストにおける API アクセス
  
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

ユーザーは管理者権限なしで独自の OAuth クライアントを作成および管理できます。セルフサービスで作成されたクライアントはユーザーにスコープされ、ロールベースの制限が適用されます。

| Endpoint                                         | Method | Description                       |
| ------------------------------------------------ | ------ | --------------------------------- |
| `/me/oauth-clients`                              | POST   | Create own OAuth client           |
| `/me/oauth-clients`                              | GET    | List own OAuth clients            |
| `/me/oauth-clients/{clientId}`                   | PATCH  | Update own OAuth client (partial) |
| `/me/oauth-clients/{clientId}`                   | DELETE | Delete own OAuth client           |
| `/me/oauth-clients/{clientId}/regenerate-secret` | POST   | Regenerate own client secret      |

**制限事項:**

* ユーザーあたり最大 **5 クライアント**
  
* `policyId` はオプションです — 指定する場合、参照されるポリシーは既に存在し、同じユーザーによって作成されている必要があります。省略した場合、認可はテナントポリシー + ロールデフォルト(`user` デフォルトは GET のみの Permit)にフォールバックします
  
* `clientSecret` は作成時と再生成時にのみ返されます — 安全に保管してください

**PATCH で更新可能なフィールド**(`PATCH /me/oauth-clients/{clientId}`):

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

**レスポンスの例:**

```json
{
  "access_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "read:entities write:entities"
}
```

### レート制限(#1075)

`POST /oauth/token` は**クライアント IP** ごと、および **`client_id`** ごとにレート制限されており、`client_id+client_secret` ペアのオフラインブルートフォース攻撃を防ぎます。

| Bucket          | Per minute | Per hour | Per day | Burst |
| --------------- | ---------: | -------: | ------: | ----: |
| Per IP          |         20 |      100 |     500 |     5 |
| Per `client_id` |         10 |       60 |     200 |     2 |

両方のバケットがリクエストを許可する必要があります。いずれかを超過すると `429 Too Many Requests` が `Retry-After` ヘッダーとともに返されます。同じ IP ごとのスキームは `/auth/refresh` と `/auth/nonce`(`PUBLIC_RATE_LIMIT` の `auth` カテゴリ)も保護します。
完全な設定については [QUOTAS.md — Public (Unauthenticated) Endpoint Rate Limit](../saas/quotas.md#public-unauthenticated-endpoint-rate-limit-1075) を参照してください。

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

> **スコープ階層**: `write:X` は `read:X` を**含意しません** — スコープは独立しています。これにより、公開お問い合わせフォームなどの書き込み専用のユースケースが可能になります。`admin:X` は `read:X` と `write:X` の両方を含意します。`admin:*` スコープを持つ OAuth トークンは Admin API にアクセスでき、通常の JWT ロールベース認証をバイパスします。通常の JWT トークン(`scope` フィールドなし)は、後方互換性のためスコープチェックをスキップします。
>
> **セルフサービスのロール制限(`/me/oauth-clients`)**: ユーザーは自分のロールで許可されたスコープのみをリクエストできます。`user` はリソーススコープのみをリクエストできます。`tenant_admin` は `admin:tenants` を除く `admin:*` スコープを追加でリクエストできます。`super_admin` はすべてのスコープをリクエストできます。

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


1. クライアントが外部 IdP から ID トークンを取得する
   
2. GeonicDB API リクエストに `Authorization: Bearer <id_token>` を含める
   
3. GeonicDB が OIDC Discovery + JWKS を介して署名を検証する
   
4. メールアドレス(`email` クレーム)によって GeonicDB DB 内でユーザーを検索する
   
5. ユーザーが存在する場合、認証が成功する

### サポートされている IdP


* Google
  
* Microsoft Entra ID(Azure AD)
  
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

### ターゲットマッチングセマンティクス

`subjects`、`resources`、`actions` 配列内:

* **同じ `attributeId`**: OR(いずれかの一致で満たされる)— 例: `[{method: POST}, {method: PATCH}]` は POST **または** PATCH にマッチ
  
* **異なる `attributeId`**: AND(すべてが一致する必要がある)— 例: `[{role: user}, {userId: u1}]` は両方を必要とする
  
* **カテゴリ間**(`subjects` + `resources` + `actions`): AND

### マッチ関数 (GeonicDB 拡張を含む)

ポリシーの Target 内の AttributeMatch で利用可能な `matchFunction` 値:

| matchFunction   | Description                              | XACML 3.0                        |
| --------------- | ---------------------------------------- | -------------------------------- |
| `string-equal`  | Exact match (default)                    | Standard                         |
| `string-regexp` | Regular expression match                 | Standard (`string-regexp-match`) |
| `glob`          | Glob pattern match (`*`, `**` supported) | **GeonicDB extension**           |

**自動 glob 検出 (GeonicDB 拡張)**: `matchFunction` が省略された場合、`matchValue` に `*` が含まれていれば自動的に `glob` として処理されます。それ以外の場合は `string-equal` が適用されます。

**XACML XML エクスポート**: `glob` は XACML 3.0 仕様に存在しないため、エクスポート時には正規表現に変換され `string-regexp-match` として出力されます。

### 暗黙的なポリシー階層

GeonicDB は以下の暗黙的なポリシーを適用します (DB ルックアップをスキップ):

| Priority             | Role           | Behavior                                            |
| -------------------- | -------------- | --------------------------------------------------- |
| Custom policies (0+) | any            | Custom XACML policies always override defaults      |
| 0                    | `super_admin`  | Management APIs always Permit. Data APIs Deny (403) |
| 0                    | `tenant_admin` | Always Permit (all APIs within own tenant)          |
| -1                   | `user`         | GET → Permit, all other methods → Deny (readonly)   |
| -2                   | `api_key`      | All Deny (explicit Permit policy required)          |
| -3                   | `anonymous`    | All Deny (explicit Permit policy required)          |

> **重要**: カスタム XACML ポリシー (優先度 0 以上) は常にロールのデフォルトを上書きします。`user` に書き込みアクセスを許可するには、優先度 ≥ 0 の Permit ポリシーを作成してください。
>
> **同順位の場合の処理**: 優先度が等しい場合、決定論的な結果を得るためにポリシーは `policyId` の辞書順で評価されます。テナントのカスタムポリシー (DB に保存) はロールのデフォルトと結合され、一緒にソートされます。

### リソース属性

ポリシー Target 内の `resources` で利用可能な属性は以下の通りです:

| attributeId            | Description                                                                  | Source                                                                     |
| ---------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `path`                 | HTTP request path (e.g. `/v2/entities/Room1`)                                | Request                                                                    |
| `tenantService`        | Tenant service name (`Fiware-Service` header)                                | Request                                                                    |
| `servicePath`          | Service path (`Fiware-ServicePath` header, e.g. `/devices`, `/opendata`)     | Request                                                                    |
| `scope`                | NGSI-LD entity scope (comma-separated, e.g. `/Madrid/parks,/Madrid/gardens`) | Entity context                                                             |
| `entityId`             | Target entity ID (e.g. `Room1`)                                              | Entity context / Subscription `entities[].id`                              |
| `entityType`           | Target entity type (e.g. `Room`)                                             | Request (auto-extracted) / Entity context / Subscription `entities[].type` |
| `entityOwner`          | Entity creator's userId (`createdBy` field)                                  | Entity context                                                             |
| `entityIdPattern`      | Subscription target id pattern (e.g. `urn:ngsi-ld:Sensor:.*`)                | Subscription `entities[].idPattern`                                        |
| `notificationEndpoint` | Subscription notification endpoint URI (e.g. `https://hooks.example.com/x`)  | Subscription `notification.endpoint.uri`                                   |

> **注意**: `entityId`、`entityOwner`、および `scope` は、エンティティレベルの認可チェック (`requireEntityAuthz` 経由) でのみ利用可能です。`entityType` は HTTP リクエストからパスレベルで自動的に抽出されます — `?type=` クエリパラメータまたはリクエストボディの `type` / `@type` フィールドから — これにより、エンティティレベルのチェックなしでエンティティタイプベースのアクセス制御が可能になります。`servicePath` は `Fiware-ServicePath` ヘッダーから自動的に抽出され、パスレベルとエンティティレベルの両方のチェックで利用可能です — 階層的なパスマッチングのために glob パターン (例: `/opendata/**`) をサポートします。`scope` は NGSIv2 の `servicePath` の NGSI-LD 版でエンティティレベルでの相当物です — エンティティが複数の scope 値を持つ場合 (例: `["/Madrid/parks", "/Madrid/gardens"]`)、それらはカンマ区切りの文字列として結合され、`string-regexp` または `glob` でのマッチングに使用されます。**NGSI-LD サブスクリプション作成 (`POST /ngsi-ld/v1/subscriptions`)**: リテラルの `body.type === "Subscription"` は `entityType` には**注入されません** — 代わりに、PIP は **サブスクリプションターゲット** を `entities[]` から、**通知送信先** を `notification.endpoint.uri` から抽出します。`entities[]` に複数の要素が含まれる場合、要素ごとに 1 つの AuthzRequest が構築され、リクエストが成功するためには**すべてが Permit でなければなりません** (全 Permit セマンティクス)。これにより、タイプベースのポリシー (「匿名ユーザーは `ActivityLog` のみサブスクリプションライブ可能」) と URI ベースのポリシー (「サブスクリプションは `https://*.example.com/**` にのみ通知を送信可能」、SSRF / データ流出に対する防御) を記述できます。詳細は下記の [サブスクリプション PIP 属性](#サブスクリプション-pip-属性) を参照してください。

### パスレベル vs エンティティレベルの認可

GeonicDB は2段階の認可モデルを使用します。各段階では XACML 評価を使用しますが、**`NotApplicable` に対するデフォルトの判断は設計上異なります**。

| Stage        | Middleware             | Triggered when                                             | NotApplicable behavior |
| ------------ | ---------------------- | ---------------------------------------------------------- | ---------------------- |
| Path-level   | `requireAuthz()`       | Every authenticated request                                | **Deny (fail-closed)** |
| Entity-level | `requireEntityAuthz()` | Entity CRUD with concrete entity (after path-level passes) | **Permit (fail-open)** |

#### なぜパスレベルはフェイルクローズなのか

適用可能なポリシーがない場合、リクエストは拒否されなければなりません。そうでなければ、特権のないユーザーがポリシーで明示的に許可されていない任意のパスを呼び出すことができてしまいます。デフォルトロールポリシー(`__default_user`、`__default_api_key` など)は、パス段階で常に少なくとも1つの適用可能なルールが存在することを保証します。

#### なぜエンティティレベルはフェイルオープンなのか(設計上)

`requireEntityAuthz()` が実行される時点で、パス段階は**既に Permit を生成しています**。エンティティレベルの評価は、リクエストをゼロから再認可するのではなく、**追加の**制約(例:所有者のみ、スコープベース)を適用することを目的としています。

エンティティレベルがフェイルクローズの場合、テナントがエンティティ対象のポリシーを持っていないリクエストは全て拒否されてしまいます — パスが既に許可されているにもかかわらず。これは、全てのテナントが CRUD を機能させるためだけにデフォルト許可のエンティティポリシーを書くことを強制することになり、エラーが発生しやすく、レイヤリングの意図に反します。

**結果**:属性ベースのきめ細かい制御(例:「ユーザーは自分が作成したエンティティのみを変更できる」)には、エンティティレベルでの**明示的な Deny ルール**が必要です。ルールが欠落している場合、拒否**されません** — ターゲットが一致しない Permit、または明示的な Deny のみが有効になります。

#### 例:所有者のみの更新の強制

`PATCH /v2/entities/{id}/attrs` をエンティティの所有者に制限するには、明示的な Deny を記述します:

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

このような明示的なルールがない場合、エンティティレベルの評価は `NotApplicable` を返し、リクエストは許可されます(パス段階で既に許可されているため)。

### WebSocket 認可 (WS ⊂ GET)

WebSocket サブスクリプションとブロードキャストは、`GET` のサブセットである**読み取り専用ストリーム**として評価されます。`authorizeWs()` PIP (`src/core/auth/policy/policy.pip.ts`) は、各 WebSocket リクエストを**2回**評価します — 1回目は `action.method = 'WS'`、2回目は `action.method = 'GET'` で — そして**両方**の評価が `Permit` を返した場合にのみアクセスを許可します。

この不変条件は、ポリシー作成者にとって2つの実用的な結果をもたらします:


1. **`GET` を Deny するポリシーは自動的に `WS` を Deny します。** ルールに `WS` を繰り返す必要はありません。2回目の評価が同じ Deny を拾います。
   
2. **`WS` のみをターゲットとするポリシーは、通常、設定ミスです。** 2回目の評価が `GET` にフォールバックするため、`WS` のみを拒否しても基盤データは保護されません — クライアントは `GET /v2/entities/...` 経由で依然としてデータを読み取ることができます。逆に、`GET` も許可されていない場合、`WS` のみを許可することは無意味です。

#### 作成ガイダンス

特定のロール/テナントに対してストリーミングを制限したい場合は、`GET` に対してルールを記述してください(または `actions` を完全に省略して、ルールがすべてのメソッドに適用されるようにしてください)。ルールが*両方*に適用されなければならない場合にのみ `WS` を記述してください:

```json
{
  "actions": [
    { "attributeId": "method", "matchValue": "WS" },
    { "attributeId": "method", "matchValue": "GET" }
  ]
}
```

#### 検出

`PolicyService.validateWsGetSymmetry()` (#1085) は、ルールの `actions` に `method = 'WS'` (`string-equal`) が含まれているが、対応する `'GET'` エントリがない場合に `WARN` ログを出力します。これはすべての書き込みパスで実行されます: `createPolicy`、`updatePolicy`、`updatePolicySystem`、および `updatePolicyForUser` (セルフサービス `/me/policies` 更新を含む)。後方互換性を維持するためにポリシーは依然として受け入れられます — 警告はルールを見直すためのシグナルです。

```text
[WARN] PolicyService — Policy rule 'ws-only-deny' targets method='WS' without an explicit 'GET'
counterpart. WebSocket authorization evaluates both WS and GET, so WS-only rules typically do not
restrict the data path that GET serves.
```

#### ブロードキャスト時のエンティティごとの属性 (#1107)

WebSocket ブロードキャスター (`src/handlers/websocket/broadcaster.ts`、`src/core/streaming/local-ws-server.ts`) が、変更イベントを接続に配信するかどうかを決定する際、以下のエンティティごとの属性を AuthzRequest に注入します:

| attributeId   | Source                                                      | Use case                                              |
| ------------- | ----------------------------------------------------------- | ----------------------------------------------------- |
| `entityType`  | `EntityChangeEvent.entity.type`                             | "Only forward `ActivityLog` events to clients"        |
| `entityId`    | `EntityChangeEvent.entity.id`                               | "Forward only `urn:ngsi-ld:Room:42` events"           |
| `entityOwner` | `EntityChangeEvent.entity.owner` (the entity's `createdBy`) | "Forward only events for entities the recipient owns" |

`entityOwner` 属性は、`${subject.userId}` テンプレート展開と組み合わせることで、単一の XACML ポリシー内で**ユーザーごとの「自分のみ」配信フィルター**を表現できます:

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

> **キャッシュに関する注意**: ブロードキャスターは、単一のブロードキャスト内で `(role, policyId, userId)` ごとに認可決定をキャッシュします — 所有者ベースのポリシーは、固定された entityType/entityOwner でもユーザーごとの決定を生成するため、`userId` はキーに含まれなければなりません。同じ userId を持つマルチデバイスユーザーは、1つのイベント内でキャッシュされた決定を共有します。
>
> **`entity.owner` のソース**: 変更イベントを公開する際に `EntityService` によって透過的に設定されます。これはエンティティの `createdBy` フィールド(認証されたユーザーによって `POST` 時に設定)から取得されます — `createdBy` を持たないエンティティ(レガシー / バッチ / 非認証書き込み)は `owner` なしでイベントを発行し、その場合、所有者ベースのルールはマッチせず、次のルールが適用されます。

### サブスクリプション PIP 属性

`POST /ngsi-ld/v1/subscriptions` (NGSI-LD サブスクリプション作成) の場合、PIP はサブスクリプション本文から取得した 3 つの追加リソース属性を注入します。**なお、リテラル `body.type === "Subscription"` は意図的に `entityType` として公開されません**:

| attributeId            | Source field                | Use case                                                                                                  |
| ---------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------- |
| `entityType`           | `entities[].type`           | "Anonymous can only subscribe to `ActivityLog`"                                                           |
| `entityId`             | `entities[].id`             | "Allow subscribing only to `urn:ngsi-ld:Room:1`"                                                          |
| `entityIdPattern`      | `entities[].idPattern`      | "Allow subscribing only when the pattern matches `urn:ngsi-ld:Sensor:.*`"                                 |
| `notificationEndpoint` | `notification.endpoint.uri` | "Notifications may only be sent to `https://*.example.com/**`" — defence against SSRF / data exfiltration |

#### マルチエンティティ全許可セマンティクス

`entities[]` に複数の要素が含まれている場合、PEP は**要素ごとに 1 つの AuthzRequest を評価**し、リクエストは**すべて**の AuthzRequest が `Permit` を返した場合にのみ許可されます。単一の `Deny` / `NotApplicable` / `Indeterminate` が発生すると、リクエスト全体が短絡評価されて `403 Forbidden` になります。これにより、「最初の要素は問題なさそうだから、残りを紛れ込ませる」というバイパスを防ぎます:

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

このポリシーは、サブスクリプション対象タイプが `ActivityLog` *かつ*通知エンドポイントが `*.example.com` 上にある場合にのみ許可します。`resources` 内の異なる `attributeId` は AND 結合されます ([Target Matching Semantics](#target-matching-semantics) を参照)。

> **スコープ外 (#1104)**: `PATCH /ngsi-ld/v1/subscriptions/{id}` は、この同じ書き換えをまだ適用して**いません** — レガシーの単一 AuthzRequest パスがまだ使用されています。したがって、サブスクリプションの更新は、新しいターゲット/通知エンドポイントではなく、パス/ロールに対してのみ評価されます。脅威モデルで必要な場合は、これをフォローアップとして追跡してください。

### テンプレート変数 (GeonicDB 拡張)

`matchValue` は `${subject.<attributeId>}` テンプレート変数をサポートしており、評価時にリクエスト主体の属性値に解決されます。これにより、ユーザー ID をハードコーディングすることなく「所有者のみ」アクセスなどの動的ポリシーを実現できます。

| Template            | Resolves to             |
| ------------------- | ----------------------- |
| `${subject.userId}` | Requesting user's ID    |
| `${subject.email}`  | Requesting user's email |
| `${subject.role}`   | Requesting user's role  |

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

このポリシーは、匿名ユーザーが `/opendata/` ServicePath配下(ネストされたパス `/opendata/sensors` など含む)のエンティティを読み取ることを許可します。グロブパターン `/**` は 0 個以上のパスセグメントにマッチします。

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

このポリシーは、`scope` が `/Madrid` 自体またはその配下の子パス(例:`["/Madrid/parks"]`)であるエンティティへの読み取りアクセスを許可します。エンティティスコープは配列として保存され、カンマ区切りの文字列にシリアライズされる(例:`"/Madrid/parks,/Madrid/gardens"`)ため、意図しない部分一致を避けるために境界を意識した `string-regexp` パターン(`(^|,)` と `(,|$)` アンカーを使用)を推奨します。単一値の完全一致の場合、`string-equal` が直接機能します(例:`matchValue: "/Madrid"`)。

### デフォルトポリシー

GeonicDB には以下のデフォルトポリシーが設定されています:


* **Admin API**:`super_admin` のみアクセス可能
  
* **Rules API**:`super_admin` または `tenant_admin` がアクセス可能
  
* **NGSI API**:明示的なポリシーが必要(`user` ロール)

### 匿名アクセスポリシー (GeonicDB 拡張)

GeonicDB は、テナント管理者が設定することで、データ API への匿名(認証なし)アクセスをサポートします。これは、認証を必要とせずに公開データ(例:気象観測、オープンデータセット)を公開する際に便利です。

#### 前提条件


1. **明示的な Permit ポリシーを作成する**:`role=anonymous` をターゲットとして、必要なアクセスレベルを設定します(#748 以降、機能フラグは不要)

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


* **フェイルクローズ**:明示的な Permit ポリシーがない場合、すべての匿名リクエストは拒否されます(403)。
  
* **ポリシーなし = 拒否**:匿名アクセスは常に明示的な XACML Permit ポリシーを必要とします。
  
* **管理 API には決してアクセスできない**:ポリシーに関係なく、匿名ユーザーは `/admin/*`、`/auth/*`、または `/me/*` エンドポイントにアクセスできません。
  
* **テナント分離**:匿名リクエストには `Fiware-Service` ヘッダーを含める必要があります。匿名ユーザーは指定されたテナントに紐付けられ、他のテナントのデータにはアクセスできません。
  
* **取り消し可能**:XACML Permit ポリシーを削除することで、すべての匿名アクセスを即座にブロックできます。

***

## ポリシー伝播遅延と HTTP キャッシュの整合性 (#1050)

XACML ポリシーが `/admin/policies` 経由で追加、変更、または削除された場合、Lambda インスタンスがキャッシュされた評価結果を提供し続ける小さな時間枠が存在します。

### キャッシュレイヤー


1. **`PolicyService` インスタンスキャッシュ (TTL: `AUTH.POLICY_CACHE_TTL_MS` = 60s)** — Lambda インスタンスごとのインメモリキャッシュで、`findActivePoliciesForTenant(tenantId)` の結果を保持します。同じ Lambda インスタンス内でのポリシーの作成/更新/削除操作で無効化されますが、他の Lambda インスタンスは TTL の期限切れに依存します。
   
2. **データエンドポイントに HTTP / CDN キャッシュなし** — すべてのデータエンドポイントは `Cache-Control: private, no-cache` を返します (#1047)。共有キャッシュはこれらのレスポンスを保存してはならず、プライベートキャッシュでさえも再検証しなければなりません。したがって、ポリシーの変更は、次のリクエストが新しい PolicyService キャッシュを持つ Lambda に到達すると同時に伝播します (≤ 60s)。

### 最悪ケースの伝播遅延


* **単一の Lambda インスタンス**: 即座 (同じ書き込みでキャッシュが無効化されます)。
  
* **複数の Lambda インスタンス**: すべてのインスタンスが変更を取り込むまで最大 `POLICY_CACHE_TTL_MS` (デフォルト 60s)。

これはほとんどの認可変更に対して許容可能です。即座の取り消しが必要な場合は、Lambda インスタンスを再起動するか、ユーザーのトークンをローテーションして再認証を強制してください。

### ポリシー取り消し後の HTTP キャッシュ整合性

ハンドラーは、`tests/unit/handlers/api/index.test.ts` のユニットテストの `#1050` リグレッションテストによって固定された、この固定順序でミドルウェアを評価します:

```text
extractAuthContext → optionalAuth → checkTenantAccess → requireAuthz (XACML PEP)
  → controller (200 + ETag)
  → evaluateConditionalRequest (200 → 304 if If-None-Match matches)
```

`requireAuthz` が `ForbiddenError` をスローした場合 (ポリシーが取り消された場合)、レスポンスは `catch` ブロックを通過し、直接 `4xx` を返します — `evaluateConditionalRequest` は**呼び出されません**。したがって、クライアントが取り消し前の古い ETag を使用して `If-None-Match` を送信したとしても、サーバーは `403` を返し、決して `304` を返しません。古いビューが再び表示されることはありません。

### 運用上の推奨事項


* **監査上重要な取り消し**は、トークン無効化 ([Token Invalidation](#token-invalidation) を参照) と組み合わせて、ユーザーを強制的にログアウトさせ、進行中のキャッシュされたレスポンスがクライアントによって信頼されるのを防ぐ必要があります。
  
* **ポリシーのホットフィックス** (≤ 60s の伝播) は、ほとんどの運用変更に十分です。ポリシー変更を伝える際には、伝播の期待値を文書化してください。

***

## リソーススコープ (非推奨)

> **#748 で削除**: リソーススコープ (JWT 内の `resourceScopes`、`checkResourceScopes()`、`filterByResourceScopes()`) は、XACML 認可統合の一環として削除されました。きめ細かいアクセス制御には XACML ポリシーを使用してください。

***

## テナントごとの機能フラグ (非推奨)

> **#748 で削除**: テナント機能フラグ (`apiKeysEnabled`、`oauthClientsEnabled`、`anonymousAccessEnabled`) は削除されました。認可は現在、ロールベースのデフォルトを持つ XACML ポリシーによって完全に処理されます:
>
> * API キー: デフォルトで拒否、明示的な XACML 許可ポリシーが必要
> * OAuth クライアント: 常に利用可能 (機能フラグゲートなし)
> * 匿名アクセス: デフォルトで拒否、明示的な XACML 許可ポリシーが必要 (機能フラグは不要)

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

## トークン無効化

GeonicDB はユーザーごとのトークン無効化メカニズムを提供します。

### 無効化の仕組み

ユーザーごとにタイムスタンプ (`invalidatedBefore`) が保持され、「この時刻より前に発行されたトークンは無効」となります。トークンの `iat` (発行時刻) がこのタイムスタンプより早い場合、トークンは無効と判断されます。

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

### WebSocket トークンの再検証

WebSocket 接続では、接続確立時に JWT の `exp` (有効期限) が DynamoDB に保存されます。その後のメッセージ受信時に `exp` が再検証され、トークンが期限切れの場合は `401` が返されます (OWASP API2:2023 準拠)。


* 接続時: `connect` ハンドラが `ConnectionRecord` に `tokenExp` を保存します
  
* メッセージ受信時: `default` ハンドラが `tokenExp` と現在時刻を比較します

***

## ブルートフォース攻撃対策

GeonicDB には、ログインエンドポイント (`POST /auth/login`) および OAuth トークンエンドポイント (`POST /oauth/token`) に対するブルートフォース攻撃防止機能が含まれています (OWASP API2:2023 準拠)。

### 動作仕様

#### ログインエンドポイント (`POST /auth/login`

)

メールアドレスごとにログイン失敗回数を追跡し、以下のルールに従って応答します:

| Failure count                  | Response                | Wait time until next attempt  |
| ------------------------------ | ----------------------- | ----------------------------- |
| 1st                            | `401 Unauthorized`      | None                          |
| 2nd                            | `401 Unauthorized`      | 2 seconds (progressive delay) |
| 3rd                            | `401 Unauthorized`      | 4 seconds (progressive delay) |
| 4th                            | `401 Unauthorized`      | 8 seconds (progressive delay) |
| 5th and beyond (locked)        | `429 Too Many Requests` | 60 seconds (lock)             |
| While locked (even correct PW) | `429 Too Many Requests` | Remaining seconds             |
| Successful login               | Counter reset           | —                             |

> **注意**: 待機時間内に再試行すると `429 Too Many Requests` が返されます (`Retry-After` ヘッダー付き)。段階的な遅延は次のリクエスト (`checkLoginAllowed`) で適用され、失敗レスポンス自体は `401` です。

#### OAuth トークンエンドポイント (`POST /oauth/token`

)

`client_id` ごとに認証失敗回数を追跡します。動作ルールはログインエンドポイントと同じです (段階的遅延 + アカウントロック)。


* **追跡キー**: `LoginProtectionService` を `oauth:<clientId>` の形式で共有
  
* **成功時**: カウンターリセット
  
* **無効なクライアント**: 認証失敗として記録

### 設計原則


* **メールアドレスベース**: IP アドレスは VPN やプロキシで簡単に回避できるため、メールアドレスごとに追跡
  
* **Lambda 最適化**: Lambda の課金コストを回避するため、`sleep()` 遅延ではなく `429 + Retry-After` ヘッダーで応答
  
* **自動クリーンアップ**: MongoDB TTL インデックスにより、試行記録は 1 時間後に自動的に削除
  
* **アクティベート・デアクティベートとは独立**: ブルートフォース攻撃対策は自動的なセキュリティメカニズムであり、管理者による手動の有効化・無効化操作とは別に管理

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

GeonicDB は、OWASP API1:2023 (Broken Object Level Authorization) への対策として、Subscription と Registration の所有権検証を提供します。

### 概要

NGSI 仕様はテナント分離 (`Fiware-Service` ヘッダー) のみでアクセス制御を行いますが、マルチユーザーテナント環境では課題があります:同じテナント内のユーザーが他のユーザーのリソースを操作できてしまいます。GeonicDB は `createdBy` フィールドを導入し、書き込み操作時に所有権を検証します。

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
   
2. **更新/削除時**: リクエストユーザーの ID が `createdBy` と照合されます
   
   * 一致: 操作が許可されます
     
   * 不一致: `403 Forbidden` を返します
     
   * `createdBy` が設定されていない (既存データ): 後方互換性のため操作が許可されます
     
3. **管理者バイパス**: `super_admin`/`tenant_admin` は所有権チェックをスキップします
   
4. **認証が無効な場合**: `AUTH_ENABLED=false` の場合、所有権チェックはスキップされます

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

* ログイン失敗が多すぎる (ブルートフォース保護)
  
* アカウントがロックされている

**解決方法:**

* `Retry-After` ヘッダーに示された秒数待ってから、再試行する
  
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
  
* XACML ポリシーによって拒否されている

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
  
* 開発ガイド - API 仕様 (ページネーション、ステータスコード) とデプロイ
  
* [XACML 3.0 Specification](https://docs.oasis-open.org/xacml/3.0/xacml-3.0-core-spec-os-en.html) - 公式 XACML 3.0 仕様
