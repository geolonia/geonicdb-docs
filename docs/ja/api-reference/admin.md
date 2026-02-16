---
title: Admin API
description: GeonicDB Admin API リファレンス -- 認証、ユーザー管理、テナント管理、XACML ポリシー、OAuth クライアント、メトリクス、セキュリティ設定。
outline: deep
---

# Admin API

Admin API は GeonicDB の管理操作を提供します。認証、ユーザー・テナント管理、ポリシーベースの認可、OAuth クライアント管理、システムメトリクスなどが含まれます。すべての管理エンドポイントは `https://api.geonicdb.geolonia.com` をベース URL として提供されます。

## 概要

GeonicDB はロールベースアクセス制御を備えた **JWT ベースの認証**を採用しています。アクセスを制御する3つの組み込みロールがあります。

| ロール | 説明 | スコープ |
|--------|------|----------|
| `super_admin` | プラットフォーム全体へのフルアクセス | 全テナント、全操作 |
| `tenant_admin` | テナントレベルの管理 | 割り当てられたテナントのみ |
| `user` | 標準 API アクセス | 割り当てられたテナントとサービスパス内のデータ操作 |

### 認証フロー

```text
┌────────┐         ┌──────────────┐         ┌──────────┐
│ Client │──POST──▶│ /auth/login  │──JWT────▶│  Admin   │
│        │         │              │          │  APIs    │
│        │◀─token──│  (verify     │          │          │
│        │  pair   │   credentials)│          │          │
└────┬───┘         └──────────────┘         └────┬─────┘
     │                                           │
     │  Authorization: Bearer <access_token>     │
     │──────────────────────────────────────────▶│
     │                                           │
     │◀──── Response (200 / 403 / 401) ─────────│
     │                                           │
     │  POST /auth/refresh  { refresh_token }    │
     │──────────────────────────────────────────▶│
     │◀──── New access_token ────────────────────│
└────┘                                     └─────┘
```

1. クライアントが `POST /auth/login` に認証情報を送信し、アクセストークンとリフレッシュトークンを受け取ります。
2. アクセストークンは後続のリクエストで `Authorization: Bearer` ヘッダーに含めます。
3. アクセストークンの有効期限が切れた場合、クライアントはリフレッシュトークンを使って `POST /auth/refresh` を呼び出し、新しいアクセストークンを取得します。

## 認証エンドポイント

### ログイン

メールアドレスとパスワードで認証し、JWT トークンペアを受け取ります。

```bash
curl -X POST https://api.geonicdb.geolonia.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "SecureP@ssw0rd!"
  }'
```

**レスポンス** `200 OK`

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "user": {
    "id": "usr_01HQ3XJKM0000000000000001",
    "email": "admin@example.com",
    "role": "super_admin",
    "tenants": ["smartcity", "production"]
  }
}
```

### トークンのリフレッシュ

リフレッシュトークンを使用して、再認証なしで新しいアクセストークンを取得します。

```bash
curl -X POST https://api.geonicdb.geolonia.com/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refresh_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

**レスポンス** `200 OK`

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

### 現在のユーザーを取得

現在認証されているユーザーのプロフィールを取得します。

```bash
curl https://api.geonicdb.geolonia.com/me \
  -H "Authorization: Bearer <access_token>"
```

**レスポンス** `200 OK`

```json
{
  "id": "usr_01HQ3XJKM0000000000000001",
  "email": "admin@example.com",
  "name": "Admin User",
  "role": "super_admin",
  "tenants": ["smartcity", "production"],
  "last_login": "2026-02-10T08:30:00Z",
  "created_at": "2025-06-01T00:00:00Z"
}
```

### パスワード変更

現在認証されているユーザーのパスワードを変更します。

```bash
curl -X POST https://api.geonicdb.geolonia.com/me/password \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "current_password": "OldP@ssw0rd!",
    "new_password": "NewSecureP@ss123!"
  }'
```

**レスポンス** `204 No Content`

## ユーザー管理

プラットフォームのユーザーを管理します。`super_admin` または `tenant_admin` ロールが必要です。

::: tip
`tenant_admin` ユーザーは、自分に割り当てられたテナント内のユーザーのみ管理できます。
:::

### ユーザー一覧

```bash
curl "https://api.geonicdb.geolonia.com/admin/users?limit=20&offset=0" \
  -H "Authorization: Bearer <access_token>"
```

**レスポンス** `200 OK`

```json
{
  "users": [
    {
      "id": "usr_01HQ3XJKM0000000000000001",
      "email": "admin@example.com",
      "name": "Admin User",
      "role": "super_admin",
      "tenants": ["smartcity", "production"],
      "status": "active",
      "created_at": "2025-06-01T00:00:00Z",
      "updated_at": "2026-01-15T12:00:00Z"
    },
    {
      "id": "usr_01HQ3XJKM0000000000000002",
      "email": "operator@example.com",
      "name": "City Operator",
      "role": "user",
      "tenants": ["smartcity"],
      "status": "active",
      "created_at": "2025-07-10T00:00:00Z",
      "updated_at": "2025-07-10T00:00:00Z"
    }
  ],
  "total": 2,
  "limit": 20,
  "offset": 0
}
```

`limit` および `offset` パラメータの詳細は[ページネーション](/ja/api-reference/pagination)を参照してください。

### ユーザー作成

```bash
curl -X POST https://api.geonicdb.geolonia.com/admin/users \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "name": "New User",
    "password": "InitialP@ss123!",
    "role": "user",
    "tenants": ["smartcity"]
  }'
```

**レスポンス** `201 Created`

```json
{
  "id": "usr_01HQ3XJKM0000000000000003",
  "email": "newuser@example.com",
  "name": "New User",
  "role": "user",
  "tenants": ["smartcity"],
  "status": "active",
  "created_at": "2026-02-10T09:00:00Z"
}
```

### ユーザー更新

```bash
curl -X PATCH https://api.geonicdb.geolonia.com/admin/users/usr_01HQ3XJKM0000000000000003 \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Name",
    "role": "tenant_admin",
    "tenants": ["smartcity", "demo"]
  }'
```

**レスポンス** `200 OK`

```json
{
  "id": "usr_01HQ3XJKM0000000000000003",
  "email": "newuser@example.com",
  "name": "Updated Name",
  "role": "tenant_admin",
  "tenants": ["smartcity", "demo"],
  "status": "active",
  "updated_at": "2026-02-10T09:30:00Z"
}
```

### ユーザー削除

```bash
curl -X DELETE https://api.geonicdb.geolonia.com/admin/users/usr_01HQ3XJKM0000000000000003 \
  -H "Authorization: Bearer <access_token>"
```

**レスポンス** `204 No Content`

### ユーザーの有効化 / 無効化

```bash
# 無効化
curl -X POST https://api.geonicdb.geolonia.com/admin/users/usr_01HQ3XJKM0000000000000003/deactivate \
  -H "Authorization: Bearer <access_token>"

# 有効化
curl -X POST https://api.geonicdb.geolonia.com/admin/users/usr_01HQ3XJKM0000000000000003/activate \
  -H "Authorization: Bearer <access_token>"
```

**レスポンス** `200 OK`

```json
{
  "id": "usr_01HQ3XJKM0000000000000003",
  "status": "inactive",
  "updated_at": "2026-02-10T10:00:00Z"
}
```

無効化されたユーザーはログインや API 呼び出しができなくなります。データと設定は保持されます。

## テナント管理

テナント（組織）を管理します。`super_admin` ロールが必要です。

### テナント一覧

```bash
curl "https://api.geonicdb.geolonia.com/admin/tenants?limit=20&offset=0" \
  -H "Authorization: Bearer <access_token>"
```

**レスポンス** `200 OK`

```json
{
  "tenants": [
    {
      "id": "tnt_01HQ3XJKM0000000000000001",
      "name": "smartcity",
      "display_name": "Smart City Project",
      "status": "active",
      "plan": "standard",
      "settings": {
        "max_entities": 1000000,
        "max_subscriptions": 500,
        "retention_days": 365
      },
      "created_at": "2025-06-01T00:00:00Z",
      "updated_at": "2026-01-20T00:00:00Z"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

### テナント作成

```bash
curl -X POST https://api.geonicdb.geolonia.com/admin/tenants \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "production",
    "display_name": "Production Environment",
    "plan": "enterprise",
    "settings": {
      "max_entities": 5000000,
      "max_subscriptions": 2000,
      "retention_days": 730
    }
  }'
```

**レスポンス** `201 Created`

```json
{
  "id": "tnt_01HQ3XJKM0000000000000002",
  "name": "production",
  "display_name": "Production Environment",
  "status": "active",
  "plan": "enterprise",
  "settings": {
    "max_entities": 5000000,
    "max_subscriptions": 2000,
    "retention_days": 730
  },
  "created_at": "2026-02-10T09:00:00Z"
}
```

### テナント更新

```bash
curl -X PATCH https://api.geonicdb.geolonia.com/admin/tenants/tnt_01HQ3XJKM0000000000000002 \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "display_name": "Production (Primary)",
    "settings": {
      "max_entities": 10000000
    }
  }'
```

**レスポンス** `200 OK`

### テナント削除

```bash
curl -X DELETE https://api.geonicdb.geolonia.com/admin/tenants/tnt_01HQ3XJKM0000000000000002 \
  -H "Authorization: Bearer <access_token>"
```

**レスポンス** `204 No Content`

::: danger
テナントを削除すると、関連するすべてのエンティティ、サブスクリプション、レジストレーションが完全に削除されます。この操作は取り消すことができません。
:::

### テナントの有効化 / 無効化

```bash
# 無効化
curl -X POST https://api.geonicdb.geolonia.com/admin/tenants/tnt_01HQ3XJKM0000000000000002/deactivate \
  -H "Authorization: Bearer <access_token>"

# 有効化
curl -X POST https://api.geonicdb.geolonia.com/admin/tenants/tnt_01HQ3XJKM0000000000000002/activate \
  -H "Authorization: Bearer <access_token>"
```

**レスポンス** `200 OK`

```json
{
  "id": "tnt_01HQ3XJKM0000000000000002",
  "name": "production",
  "status": "inactive",
  "updated_at": "2026-02-10T10:00:00Z"
}
```

無効化されたテナントでは、すべての API リクエストが `403 Forbidden` で拒否されます。データは保持され、再有効化すると再びアクセスできます。

## ポリシー管理 (XACML 3.0)

GeonicDB は **XACML 3.0** ポリシーを使用した、きめ細かい属性ベースのアクセス制御をサポートしています。ポリシーは、サブジェクト属性（ユーザーロール、テナント）、リソース属性（エンティティタイプ、サービスパス）、アクション属性（read、write、delete）に基づいてルールを定義します。

`super_admin` ロールが必要です。

### ポリシー一覧

```bash
curl "https://api.geonicdb.geolonia.com/admin/policies?limit=20&offset=0" \
  -H "Authorization: Bearer <access_token>"
```

**レスポンス** `200 OK`

```json
{
  "policies": [
    {
      "id": "pol_01HQ3XJKM0000000000000001",
      "name": "allow-read-smartcity",
      "description": "Allow read access to all entities in the smartcity tenant",
      "status": "active",
      "effect": "Permit",
      "target": {
        "subjects": [{ "role": "user" }],
        "resources": [{ "tenant": "smartcity", "entity_type": "*" }],
        "actions": ["read"]
      },
      "created_at": "2025-08-01T00:00:00Z",
      "updated_at": "2025-08-01T00:00:00Z"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

### ポリシー作成

```bash
curl -X POST https://api.geonicdb.geolonia.com/admin/policies \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "deny-delete-production",
    "description": "Deny delete operations in the production tenant for non-admins",
    "effect": "Deny",
    "target": {
      "subjects": [{ "role": "user" }],
      "resources": [{ "tenant": "production", "entity_type": "*" }],
      "actions": ["delete"]
    },
    "conditions": [
      {
        "attribute": "subject.role",
        "operator": "not_in",
        "value": ["super_admin", "tenant_admin"]
      }
    ]
  }'
```

**レスポンス** `201 Created`

```json
{
  "id": "pol_01HQ3XJKM0000000000000002",
  "name": "deny-delete-production",
  "status": "active",
  "effect": "Deny",
  "created_at": "2026-02-10T09:00:00Z"
}
```

### ポリシー更新

```bash
curl -X PUT https://api.geonicdb.geolonia.com/admin/policies/pol_01HQ3XJKM0000000000000002 \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "deny-delete-production",
    "description": "Updated: Deny delete operations in production for all non-admins",
    "effect": "Deny",
    "target": {
      "subjects": [{ "role": "user" }],
      "resources": [{ "tenant": "production", "entity_type": "*", "service_path": "/#" }],
      "actions": ["delete"]
    }
  }'
```

**レスポンス** `200 OK`

### ポリシー削除

```bash
curl -X DELETE https://api.geonicdb.geolonia.com/admin/policies/pol_01HQ3XJKM0000000000000002 \
  -H "Authorization: Bearer <access_token>"
```

**レスポンス** `204 No Content`

### ポリシーの有効化 / 無効化

```bash
# 無効化
curl -X POST https://api.geonicdb.geolonia.com/admin/policies/pol_01HQ3XJKM0000000000000002/deactivate \
  -H "Authorization: Bearer <access_token>"

# 有効化
curl -X POST https://api.geonicdb.geolonia.com/admin/policies/pol_01HQ3XJKM0000000000000002/activate \
  -H "Authorization: Bearer <access_token>"
```

**レスポンス** `200 OK`

### ポリシーのインポート / エクスポート

すべてのポリシーを JSON 配列としてエクスポートし、バックアップや環境間の移行に使用できます。

```bash
# エクスポート
curl https://api.geonicdb.geolonia.com/admin/policies/export \
  -H "Authorization: Bearer <access_token>" \
  -o policies-backup.json

# インポート
curl -X POST https://api.geonicdb.geolonia.com/admin/policies/import \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d @policies-backup.json
```

**エクスポートのレスポンス** `200 OK`

```json
{
  "policies": [
    {
      "name": "allow-read-smartcity",
      "description": "Allow read access to all entities in the smartcity tenant",
      "effect": "Permit",
      "target": { "..." : "..." },
      "conditions": []
    }
  ],
  "exported_at": "2026-02-10T12:00:00Z",
  "version": "1.0"
}
```

**インポートのレスポンス** `200 OK`

```json
{
  "imported": 5,
  "skipped": 1,
  "errors": []
}
```

## OAuth クライアント管理

マシン間 (M2M) 認証用の OAuth 2.0 クライアントを管理します。`super_admin` または `tenant_admin` ロールが必要です。

### OAuth クライアント一覧

```bash
curl "https://api.geonicdb.geolonia.com/admin/oauth-clients?limit=20&offset=0" \
  -H "Authorization: Bearer <access_token>"
```

**レスポンス** `200 OK`

```json
{
  "clients": [
    {
      "id": "oac_01HQ3XJKM0000000000000001",
      "client_id": "geonicdb_client_abc123",
      "name": "IoT Data Ingestion Service",
      "grant_types": ["client_credentials"],
      "scopes": ["entities:read", "entities:write"],
      "tenants": ["smartcity"],
      "status": "active",
      "created_at": "2025-09-01T00:00:00Z"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

### OAuth クライアント作成

```bash
curl -X POST https://api.geonicdb.geolonia.com/admin/oauth-clients \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "IoT Data Ingestion Service",
    "grant_types": ["client_credentials"],
    "scopes": ["entities:read", "entities:write", "subscriptions:read"],
    "tenants": ["smartcity"]
  }'
```

**レスポンス** `201 Created`

```json
{
  "id": "oac_01HQ3XJKM0000000000000002",
  "client_id": "geonicdb_client_def456",
  "client_secret": "geonicdb_secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "name": "IoT Data Ingestion Service",
  "grant_types": ["client_credentials"],
  "scopes": ["entities:read", "entities:write", "subscriptions:read"],
  "tenants": ["smartcity"],
  "status": "active",
  "created_at": "2026-02-10T09:00:00Z"
}
```

::: warning
`client_secret` は作成時に**一度だけ**返されます。安全に保管してください。紛失した場合は、シークレット再生成エンドポイントを使用してください。
:::

### OAuth クライアント更新

```bash
curl -X PATCH https://api.geonicdb.geolonia.com/admin/oauth-clients/oac_01HQ3XJKM0000000000000002 \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "IoT Ingestion Service (v2)",
    "scopes": ["entities:read", "entities:write", "subscriptions:read", "subscriptions:write"]
  }'
```

**レスポンス** `200 OK`

### OAuth クライアント削除

```bash
curl -X DELETE https://api.geonicdb.geolonia.com/admin/oauth-clients/oac_01HQ3XJKM0000000000000002 \
  -H "Authorization: Bearer <access_token>"
```

**レスポンス** `204 No Content`

### クライアントシークレットの再生成

```bash
curl -X POST https://api.geonicdb.geolonia.com/admin/oauth-clients/oac_01HQ3XJKM0000000000000002/regenerate-secret \
  -H "Authorization: Bearer <access_token>"
```

**レスポンス** `200 OK`

```json
{
  "client_id": "geonicdb_client_def456",
  "client_secret": "geonicdb_secret_yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy",
  "regenerated_at": "2026-02-10T11:00:00Z"
}
```

::: danger
シークレットを再生成すると、以前のシークレットは即座に無効になります。旧シークレットを使用しているすべてのアプリケーションがアクセスできなくなります。
:::

## OAuth トークンエンドポイント

### Client Credentials Grant

OAuth 2.0 Client Credentials フローを使用してアクセストークンを取得します。これはサービス間 (M2M) 認証の標準的なフローです。

```bash
curl -X POST https://api.geonicdb.geolonia.com/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=geonicdb_client_def456" \
  -d "client_secret=geonicdb_secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -d "scope=entities:read entities:write"
```

**レスポンス** `200 OK`

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "entities:read entities:write"
}
```

取得したアクセストークンを、後続の API 呼び出しの `Authorization` ヘッダーに使用します。

```bash
curl https://api.geonicdb.geolonia.com/v2/entities \
  -H "Authorization: Bearer <access_token>" \
  -H "Fiware-Service: smartcity"
```

## メトリクス

API 使用状況のメトリクスを表示・管理します。`super_admin` ロールが必要です。

### メトリクスの取得

```bash
curl "https://api.geonicdb.geolonia.com/admin/metrics?from=2026-02-01T00:00:00Z&to=2026-02-10T23:59:59Z" \
  -H "Authorization: Bearer <access_token>"
```

**レスポンス** `200 OK`

```json
{
  "period": {
    "from": "2026-02-01T00:00:00Z",
    "to": "2026-02-10T23:59:59Z"
  },
  "totals": {
    "requests": 1542830,
    "entities_created": 85420,
    "entities_updated": 324100,
    "queries": 1012500,
    "notifications_sent": 120810
  },
  "by_tenant": [
    {
      "tenant": "smartcity",
      "requests": 1200000,
      "entities": 450000,
      "subscriptions": 120
    },
    {
      "tenant": "production",
      "requests": 342830,
      "entities": 85000,
      "subscriptions": 45
    }
  ]
}
```

### メトリクスの削除

指定した期間のメトリクスデータを削除します。

```bash
curl -X DELETE "https://api.geonicdb.geolonia.com/admin/metrics?before=2025-12-31T23:59:59Z" \
  -H "Authorization: Bearer <access_token>"
```

**レスポンス** `200 OK`

```json
{
  "deleted_records": 52340,
  "period_before": "2025-12-31T23:59:59Z"
}
```

## ヘルスチェックとシステムエンドポイント

/health と /version エンドポイントは認証不要です。その他の管理エンドポイントには super_admin ロールが必要です。

### ヘルスチェック

```bash
curl https://api.geonicdb.geolonia.com/health
```

**レスポンス** `200 OK`

```json
{
  "status": "healthy",
  "components": {
    "api": "healthy",
    "database": "healthy",
    "eventbridge": "healthy"
  },
  "timestamp": "2026-02-10T12:00:00Z"
}
```

### バージョン

```bash
curl https://api.geonicdb.geolonia.com/version
```

**レスポンス** `200 OK`

```json
{
  "version": "2.1.0",
  "ngsiv2": "v2",
  "ngsild": "v1",
  "build": "2026-02-01T00:00:00Z"
}
```

### 統計情報

システム全体の統計情報を取得します。`super_admin` ロールが必要です。

```bash
curl https://api.geonicdb.geolonia.com/statistics \
  -H "Authorization: Bearer <access_token>"
```

**レスポンス** `200 OK`

```json
{
  "tenants": 12,
  "users": 48,
  "total_entities": 2450000,
  "total_subscriptions": 340,
  "total_registrations": 25,
  "uptime_seconds": 8640000
}
```

### Prometheus メトリクス

モニタリング連携のため、Prometheus エクスポジション形式でメトリクスを取得します。

```bash
curl https://api.geonicdb.geolonia.com/metrics \
  -H "Authorization: Bearer <access_token>"
```

**レスポンス** `200 OK` (`text/plain`)

```text
# HELP geonicdb_requests_total Total number of API requests
# TYPE geonicdb_requests_total counter
geonicdb_requests_total{method="GET",status="200"} 1250000
geonicdb_requests_total{method="POST",status="201"} 85420
# HELP geonicdb_request_duration_seconds Request duration in seconds
# TYPE geonicdb_request_duration_seconds histogram
geonicdb_request_duration_seconds_bucket{le="0.01"} 980000
geonicdb_request_duration_seconds_bucket{le="0.1"} 1300000
```

## セキュリティ設定

### IP 制限

`ADMIN_ALLOWED_IPS` 環境変数を使用して、管理 API へのアクセスを特定の IP アドレスまたは CIDR 範囲に制限できます。

```text
ADMIN_ALLOWED_IPS=203.0.113.0/24,198.51.100.50,2001:db8::/32
```

設定した場合:
- 許可された IP からのリクエストは通常どおり処理されます。
- その他の IP からのリクエストは `403 Forbidden` を返します。
- `ADMIN_ALLOWED_IPS` が未設定の場合、管理エンドポイントは任意の IP からアクセス可能です（認証は引き続き必要です）。

::: tip
JWT 認証と IP 制限を組み合わせることで、多層防御を実現できます。トークンが漏洩した場合でも、アクセスは許可されたネットワークに限定されます。
:::

### OIDC 外部 IdP 連携

GeonicDB は **OpenID Connect (OIDC)** を介した外部 ID プロバイダー (IdP) への認証委任をサポートしています。これにより、Azure AD、Google Workspace、Okta などのプロバイダーとのシングルサインオン (SSO) が可能になります。

OIDC が設定されている場合:
- ユーザーは外部 IdP を通じて認証を行います。
- IdP が ID トークンを発行し、GeonicDB がそれを検証して内部ユーザーにマッピングします。
- IdP のクレームに基づいてロールマッピングを設定できます（例: `groups` クレームを GeonicDB のロールにマッピング）。

**OIDC 設定フィールド**

| フィールド | 説明 | 例 |
|-----------|------|-----|
| `issuer` | OIDC 発行者 URL | `https://login.microsoftonline.com/{tenant}/v2.0` |
| `client_id` | IdP に登録されたクライアント ID | `abc123-def456-...` |
| `client_secret` | IdP 用のクライアントシークレット | `secret_value` |
| `redirect_uri` | IdP 認証後のコールバック URL | `https://api.geonicdb.geolonia.com/auth/oidc/callback` |
| `scopes` | 要求する OIDC スコープ | `openid profile email` |
| `role_claim` | GeonicDB ロールにマッピングする JWT クレーム | `groups` または `roles` |
| `role_mapping` | IdP クレーム値から GeonicDB ロールへのマッピング | `{"admins": "super_admin", "users": "user"}` |

### JWT トークン設定

| 設定項目 | デフォルト値 | 説明 |
|---------|-------------|------|
| アクセストークンの有効期限 | 3600秒（1時間） | アクセストークンの有効期間 |
| リフレッシュトークンの有効期限 | 604800秒（7日間） | リフレッシュトークンの有効期間 |
| 署名アルゴリズム | RS256 | RSA ベースの非対称署名 |
| 鍵のローテーション | 自動 | 鍵は定期的にローテーションされ、JWKS エンドポイントで公開鍵が提供されます |

### パスワードポリシー

パスワードは以下の要件を満たす必要があります。

| ルール | 要件 |
|--------|------|
| 最小文字数 | 12文字 |
| 大文字 | 1文字以上の大文字を含む |
| 小文字 | 1文字以上の小文字を含む |
| 数字 | 1文字以上の数字を含む |
| 特殊文字 | 1文字以上の特殊文字（`!@#$%^&*` など）を含む |
| 履歴 | 直近5回のパスワードは再利用不可 |
| ロックアウト | 5回連続でログインに失敗するとアカウントがロックされます |

## エラーレスポンス

Admin API のエラーは GeonicDB の標準エラー形式に従います。完全な一覧は[ステータスコード](/ja/api-reference/status-codes)を参照してください。

| ステータス | 説明 | 主な原因 |
|-----------|------|---------|
| `400` | Bad Request | リクエストボディまたはパラメータが不正 |
| `401` | Unauthorized | アクセストークンが未指定または期限切れ |
| `403` | Forbidden | ロール権限の不足または IP 制限 |
| `404` | Not Found | リソースが存在しない |
| `409` | Conflict | メールアドレスまたはテナント名の重複 |
| `422` | Unprocessable Entity | バリデーションエラー（脆弱なパスワードなど） |
| `429` | Too Many Requests | レート制限超過 |

**エラーレスポンスの例:**

```json
{
  "error": "Forbidden",
  "description": "User role 'user' does not have permission to access /admin/users",
  "status": 403
}
```

## エンドポイント一覧

| メソッド | エンドポイント | 必要なロール | 説明 |
|---------|--------------|-------------|------|
| `POST` | `/auth/login` | なし | 認証してトークンを取得 |
| `POST` | `/auth/refresh` | なし | アクセストークンのリフレッシュ |
| `GET` | `/me` | 認証済みユーザー | 現在のユーザープロフィールを取得 |
| `POST` | `/me/password` | 認証済みユーザー | 自身のパスワードを変更 |
| `GET` | `/admin/users` | `super_admin`, `tenant_admin` | ユーザー一覧 |
| `POST` | `/admin/users` | `super_admin`, `tenant_admin` | ユーザー作成 |
| `PATCH` | `/admin/users/:id` | `super_admin`, `tenant_admin` | ユーザー更新 |
| `DELETE` | `/admin/users/:id` | `super_admin`, `tenant_admin` | ユーザー削除 |
| `POST` | `/admin/users/:id/activate` | `super_admin`, `tenant_admin` | ユーザーの有効化 |
| `POST` | `/admin/users/:id/deactivate` | `super_admin`, `tenant_admin` | ユーザーの無効化 |
| `GET` | `/admin/tenants` | `super_admin` | テナント一覧 |
| `POST` | `/admin/tenants` | `super_admin` | テナント作成 |
| `PATCH` | `/admin/tenants/:id` | `super_admin` | テナント更新 |
| `DELETE` | `/admin/tenants/:id` | `super_admin` | テナント削除 |
| `POST` | `/admin/tenants/:id/activate` | `super_admin` | テナントの有効化 |
| `POST` | `/admin/tenants/:id/deactivate` | `super_admin` | テナントの無効化 |
| `GET` | `/admin/policies` | `super_admin` | ポリシー一覧 |
| `POST` | `/admin/policies` | `super_admin` | ポリシー作成 |
| `PUT` | `/admin/policies/:id` | `super_admin` | ポリシー更新 |
| `DELETE` | `/admin/policies/:id` | `super_admin` | ポリシー削除 |
| `POST` | `/admin/policies/:id/activate` | `super_admin` | ポリシーの有効化 |
| `POST` | `/admin/policies/:id/deactivate` | `super_admin` | ポリシーの無効化 |
| `GET` | `/admin/policies/export` | `super_admin` | 全ポリシーのエクスポート |
| `POST` | `/admin/policies/import` | `super_admin` | ポリシーのインポート |
| `GET` | `/admin/oauth-clients` | `super_admin`, `tenant_admin` | OAuth クライアント一覧 |
| `POST` | `/admin/oauth-clients` | `super_admin`, `tenant_admin` | OAuth クライアント作成 |
| `PATCH` | `/admin/oauth-clients/:id` | `super_admin`, `tenant_admin` | OAuth クライアント更新 |
| `DELETE` | `/admin/oauth-clients/:id` | `super_admin`, `tenant_admin` | OAuth クライアント削除 |
| `POST` | `/admin/oauth-clients/:id/regenerate-secret` | `super_admin`, `tenant_admin` | クライアントシークレットの再生成 |
| `POST` | `/oauth/token` | なし（クライアント認証） | OAuth トークンエンドポイント |
| `GET` | `/admin/metrics` | `super_admin` | 使用状況メトリクスの取得 |
| `DELETE` | `/admin/metrics` | `super_admin` | メトリクスデータの削除 |
| `GET` | `/health` | なし | ヘルスチェック |
| `GET` | `/version` | なし | バージョン情報 |
| `GET` | `/statistics` | `super_admin` | システム統計情報 |
| `GET` | `/metrics` | `super_admin` | Prometheus メトリクス |

## 次のステップ

- [エンドポイント](/ja/api-reference/endpoints) -- ヘッダーやベース URL を含む共通 API 仕様
- [ページネーション](/ja/api-reference/pagination) -- 大量の結果セットのページング
- [ステータスコード](/ja/api-reference/status-codes) -- HTTP ステータスコードとエラー形式のリファレンス
