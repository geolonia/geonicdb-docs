---
title: "GeonicDB Context Broker API Documentation"
---

# GeonicDB Context Broker API Documentation

AWS Lambda 上で動作する FIWARE Orion 互換の Context Broker API ドキュメントです。NGSIv2 および NGSI-LD の両方の API をサポートしています。

## 目次

- [概要](#概要)
- [認証とマルチテナンシー](#認証とマルチテナンシー)
- [ページネーション](#ページネーション)
- [認証 API](#認証-api)
- [メタエンドポイント](#メタエンドポイント)
- [NGSIv2 API](#ngsiv2-api)（→ [API_NGSIV2.md](./ngsiv2.md)）
- [NGSI-LD API](#ngsi-ld-api)（→ [API_NGSILD.md](./ngsild.md)）
- [クエリ言語](#クエリ言語)
- [ジオクエリ](#ジオクエリ)
- [空間 ID 検索](#空間id検索)
- [GeoJSON 出力](#geojson出力)
- [ベクトルタイル](#ベクトルタイル)
- [座標参照系（CRS）](#座標参照系crs)
- [データカタログ API](#データカタログ-api)
- [CADDE 連携](#cadde連携)
- [イベントストリーミング](#イベントストリーミング)
- [エラーレスポンス](#エラーレスポンス)
- [実装状況](#実装状況)

---

## 概要

この Context Broker は、FIWARE NGSI（Next Generation Service Interface）仕様に準拠した RESTful API を提供します。

**📖 関連ドキュメント:**
- [NGSIv2 / NGSI-LD 相互互換性ガイド](../core-concepts/ngsiv2-vs-ngsild.md) - 両 API の相互運用性、型マッピング、ベストプラクティス
- [WebSocket イベントストリーミング](../features/subscriptions.md) - リアルタイムイベント購読、実装例、ベストプラクティス

### ベース URL

```text
https://{api-gateway-url}/{stage}
```

### サポートする API

| API バージョン | ベースパス | Content-Type |
|--------------|-----------|--------------|
| NGSIv2 | `/v2` | `application/json` |
| NGSI-LD | `/ngsi-ld/v1` | `application/ld+json` |

### OPTIONS メソッド

すべてのエンドポイントで `OPTIONS` メソッドがサポートされています。CORS プリフライトリクエストに対して、許可されるメソッドとヘッダーの情報を返します。

#### レスポンス形式

OPTIONS リクエストは `204 No Content` を返し、以下のヘッダーを含みます：

```http
OPTIONS /v2/entities/urn:ngsi-ld:Room:Room1

HTTP/1.1 204 No Content
Allow: GET, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Fiware-Service, Fiware-ServicePath, Authorization
Access-Control-Max-Age: 86400
```

NGSI-LD エンドポイントでは、追加で `Accept-Patch` ヘッダーも返されます：

```http
OPTIONS /ngsi-ld/v1/entities/urn:ngsi-ld:Room:Room1

HTTP/1.1 204 No Content
Allow: GET, PUT, PATCH, DELETE, OPTIONS
Accept-Patch: application/json, application/ld+json, application/merge-patch+json
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, NGSILD-Tenant, Fiware-Service, Link, Authorization
Access-Control-Max-Age: 86400
```

---

## 認証とマルチテナンシー

### 必須ヘッダー

すべてのリクエストには以下のヘッダーを含めることを推奨します：

| ヘッダー | 必須 | 説明 | デフォルト |
|---------|------|------|-----------|
| `Fiware-Service` | 推奨 | テナント名（英数字とアンダースコアのみ） | `default` |
| `Fiware-ServicePath` | 推奨 | テナント内の階層パス（`/`で始まる） | `/`（クエリ時は`/#`相当） |
| `Fiware-Correlator` | 任意 | リクエスト追跡用の相関 ID | 自動生成 |

### 使用例

```bash
curl -X GET "https://api.example.com/v2/entities" \
  -H "Fiware-Service: smartcity" \
  -H "Fiware-ServicePath: /buildings/floor1"
```

### テナント分離

- 異なる `Fiware-Service` のデータは完全に分離されます
- 同じテナント内でも `Fiware-ServicePath` でデータを階層的に整理できます
- テナント名は自動的に小文字に変換されます

### サービスパス仕様

[FIWARE Orion 仕様](https://fiware-orion.readthedocs.io/en/1.3.0/user/service_path/index.html)に準拠しています。

#### 基本形式

- `/` で始まる絶対パスのみ使用可能
- 英数字とアンダースコアのみ使用可能
- 最大 10 階層、各レベル最大 50 文字

```bash
# 特定パスのエンティティを取得
curl "http://localhost:3000/v2/entities" \
  -H "Fiware-Service: smartcity" \
  -H "Fiware-ServicePath: /Madrid/Gardens"
```

#### 階層検索（/#）

`/#` サフィックスを使用すると、指定パスとその子パスすべてを検索できます（**クエリ操作のみ**）。

```bash
# /Madrid/Gardens とその子パス全てを検索
curl "http://localhost:3000/v2/entities" \
  -H "Fiware-Service: smartcity" \
  -H "Fiware-ServicePath: /Madrid/Gardens/#"
```

#### 複数パス指定（カンマ区切り）

カンマで区切って複数のパスを同時に検索できます（最大 10 パス、**クエリ操作のみ**）。

```bash
# /park1 と /park2 の両方を検索
curl "http://localhost:3000/v2/entities" \
  -H "Fiware-Service: smartcity" \
  -H "Fiware-ServicePath: /park1, /park2"
```

#### デフォルト動作

| 操作 | ヘッダー省略時 | 説明 |
|------|---------------|------|
| クエリ（GET） | `/` | ルートパスのみ検索 |
| 書き込み（POST/PUT/PATCH/DELETE） | `/` | ルートパスに作成・更新 |

**注意**: 書き込み操作では、単一の非階層パスのみ使用できます。`/#` や複数パスを指定するとエラーになります。

---

## ページネーション

すべてのリスト系 API エンドポイントでページネーションがサポートされています。

### パラメータ

| パラメータ | 説明 | デフォルト | 最大値 |
|-----------|------|-----------|-------|
| `limit` | 返却する最大件数 | 20 | 1000（Admin API は 100） |
| `offset` | スキップする件数 | 0 | - |

### レスポンスヘッダー

各 API タイプで総件数を示すヘッダーが返却されます：

| API | ヘッダー名 | 条件 |
|-----|-----------|------|
| NGSIv2 | `Fiware-Total-Count` | 常に返却（全リストエンドポイント） |
| NGSI-LD | `NGSILD-Results-Count` | 常に返却 |
| Admin API | `X-Total-Count` | 常に返却 |
| Catalog API | `X-Total-Count` | 常に返却 |

### Link ヘッダー

すべてのリスト系エンドポイントは [RFC 8288](https://www.rfc-editor.org/rfc/rfc8288) に準拠した `Link` ヘッダーを返却し、次ページ (`rel="next"`) および前ページ (`rel="prev"`) の URL を提供します。結果が 1 ページに収まる場合、`Link` ヘッダーは返却されません。

```text
Link: <https://api.example.com/v2/entities?limit=10&offset=20>; rel="next", <https://api.example.com/v2/entities?limit=10&offset=0>; rel="prev"
```

### バリデーション

無効なページネーションパラメータは `400 Bad Request` を返します：

| エラー条件 | エラーメッセージ |
|-----------|-----------------|
| 負の limit | `Invalid limit: must not be negative` |
| 負の offset | `Invalid offset: must not be negative` |
| limit=0 | `Invalid limit: must be greater than 0` |
| 最大値超過 | `Invalid limit: must not exceed 1000` |
| 数値以外 | `Invalid limit: must be a valid integer` |

### 使用例

```bash
# 2 ページ目を取得（1 ページ 10 件）
curl "http://localhost:3000/v2/entities?limit=10&offset=10" \
  -H "Fiware-Service: smartcity"

# 総件数ヘッダー付きで取得
curl "http://localhost:3000/v2/entities?limit=10&options=count" \
  -H "Fiware-Service: smartcity"
```

### 注意事項

- `offset` が総件数を超えた場合、空の配列が返されます（エラーではありません）
- FIWARE Orion 仕様に準拠しています

---

## 認証 API

認証機能を使用して、ユーザー認証とアクセス制御を行うことができます。

### 有効化

認証機能はデフォルトで無効です。以下の環境変数で有効化できます。

**注意**: `AUTH_ENABLED=false` の場合、認証関連のエンドポイント（`/auth/*`, `/me`, `/me/*`, `/admin/*`）は 404 を返します。

**重要**: `AUTH_ENABLED=true` の場合、NGSI API エンドポイント（`/v2/*`, `/ngsi-ld/*`, `/catalog/*`）へのアクセスには認証が必要です。認証なしでアクセスすると `401 Unauthorized` エラーが返されます。

| 環境変数 | デフォルト | 説明 |
|----------|-----------|------|
| `AUTH_ENABLED` | `false` | 認証機能の有効化 |
| `JWT_SECRET` | - | JWT トークン署名用シークレット（32 文字以上推奨） |
| `JWT_EXPIRES_IN` | `1h` | アクセストークンの有効期限 |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | リフレッシュトークンの有効期限 |
| `SUPER_ADMIN_EMAIL` | - | 環境変数で設定するスーパー管理者のメールアドレス |
| `SUPER_ADMIN_PASSWORD` | - | 環境変数で設定するスーパー管理者のパスワード |
| `ADMIN_ALLOWED_IPS` | - | 管理 API へのアクセスを許可する IP/CIDR（カンマ区切り） |

### ロールと権限

| ロール | 説明 | 権限 |
|--------|------|------|
| `super_admin` | スーパー管理者 | 全テナント・全ユーザーの管理、テナント作成/削除 |
| `tenant_admin` | テナント管理者 | 自テナント内のユーザー管理 |
| `user` | 一般ユーザー | 自分のプロファイル閲覧・パスワード変更のみ |

### ログイン

```http
POST /auth/login
Content-Type: application/json
```

**リクエストボディ**

```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**レスポンス例**

```json
{
  "accessToken": "<access_token>",
  "refreshToken": "<refresh_token>",
  "expiresIn": 3600,
  "tokenType": "Bearer",
  "user": {
    "id": "user-123",
    "email": "user@example.com",
    "role": "tenant_admin",
    "tenantId": "tenant-456"
  }
}
```

### トークンリフレッシュ

```http
POST /auth/refresh
Content-Type: application/json
```

**リクエストボディ**

```json
{
  "refreshToken": "<refresh_token>"
}
```

**レスポンス**: ログインと同じ形式

### 現在のユーザー情報取得

```http
GET /me
Authorization: Bearer <accessToken>
```

**レスポンス例**

```json
{
  "id": "user-123",
  "email": "user@example.com",
  "role": "tenant_admin",
  "tenantId": "tenant-456",
  "tenantName": "My Organization"
}
```

### パスワード変更

```http
POST /me/password
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**リクエストボディ**

```json
{
  "currentPassword": "OldPassword123!",
  "newPassword": "NewSecurePassword456!"
}
```

**レスポンス**: `204 No Content`

**注意**: パスワード変更後、既存のアクセストークンとリフレッシュトークンは全て無効化されます。再度ログインして新しいトークンを取得してください。

### ログアウト

```http
POST /auth/logout
Authorization|---------------|---------|------|------|--------|-----------|
| `/me` | GET | Get own profile | 200 | 401 | user |
| `/me/password` | POST | Change password | 204 | 400, 401 | user |

### NGSIv2 / NGSI-LD Endpoints

For detailed endpoint specifications, refer to:
- [NGSIv2 API Reference](./ngsiv2.md)
- [NGSI-LD API Reference](./ngsild.md)

### Admin API

Tenant and user management API. Only accessible by `super_admin` role.

#### Tenant Management

| Endpoint | Method | Description | Success | Error | Pagination |
|---------------|---------|------|------|--------|-----------------|
| `/admin/tenants` | GET | List tenants | 200 | 400, 401, 403 | ✅ (max: 100) |
| `/admin/tenants` | POST | Create tenant | 201 | 400, 401, 403, 409 | - |
| `/admin/tenants/{tenantId}` | GET | Get tenant | 200 | 401, 403, 404 | - |
| `/admin/tenants/{tenantId}` | PATCH | Update tenant | 204 | 400, 401, 403, 404, 409 | - |
| `/admin/tenants/{tenantId}` | DELETE | Delete tenant | 204 | 401, 403, 404 | - |
| `/admin/tenants/{tenantId}/activate` | POST | Activate tenant | 204 | 401, 403, 404 | - |
| `/admin/tenants/{tenantId}/deactivate` | POST | Deactivate tenant | 204 | 401, 403, 404 | - |
| `/admin/tenants/{tenantId}/ip-restrictions` | GET | Get tenant IP restrictions | 200 | 401, 403, 404 | - |
| `/admin/tenants/{tenantId}/ip-restrictions` | PUT | Update tenant IP restrictions | 200 | 400, 401, 403, 404 | - |
| `/admin/tenants/{tenantId}/ip-restrictions` | DELETE | Delete tenant IP restrictions | 204 | 401, 403, 404 | - |

#### User Management

| Endpoint | Method | Description | Success | Error | Pagination |
|---------------|---------|------|------|--------|-----------------|
| `/admin/users` | GET | List users | 200 | 400, 401, 403 | ✅ (max: 100) |
| `/admin/users` | POST | Create user | 201 | 400, 401, 403, 409 | - |
| `/admin/users/{userId}` | GET | Get user | 200 | 401, 403, 404 | - |
| `/admin/users/{userId}` | PATCH | Update user | 204 | 400, 401, 403, 404, 409 | - |
| `/admin/users/{userId}` | DELETE | Delete user | 204 | 401, 403, 404 | - |
| `/admin/users/{userId}/activate` | POST | Activate user | 204 | 401, 403, 404 | - |
| `/admin/users/{userId}/deactivate` | POST | Deactivate user | 204 | 401, 403, 404 | - |
| `/admin/users/{userId}/unlock` | POST | Unlock login | 200 | 400, 401, 403, 404 | - |

#### Policy Management (XACML 3.0 Authorization)

| Endpoint | Method | Description | Success | Error | Pagination |
|---------------|---------|------|------|--------|-----------------|
| `/admin/policies` | GET | List policies | 200 | 400, 401, 403 | ✅ (max: 100) |
| `/admin/policies` | POST | Create policy | 201 | 400, 401, 403, 409 | - |
| `/admin/policies/{policyId}` | GET | Get policy | 200 | 401, 403, 404 | - |
| `/admin/policies/{policyId}` | PATCH | Update policy (partial) | 200 | 400, 401, 403, 404 | - |
| `/admin/policies/{policyId}` | PUT | Replace policy | 200 | 400, 401, 403, 404 | - |
| `/admin/policies/{policyId}` | DELETE | Delete policy | 204 | 401, 403, 404 | - |
| `/admin/policies/{policyId}/activate` | POST | Activate policy | 200 | 401, 403, 404 | - |
| `/admin/policies/{policyId}/deactivate` | POST | Deactivate policy | 200 | 401, 403, 404 | - |

#### OAuth Client Management

| Endpoint | Method | Description | Success | Error | Pagination |
|---------------|---------|------|------|--------|-----------------|
| `/admin/oauth-clients` | GET | List OAuth clients | 200 | 400, 401, 403 | ✅ (max: 100) |
| `/admin/oauth-clients` | POST | Create OAuth client | 201 | 400, 401, 403 | - |
| `/admin/oauth-clients/{clientId}` | GET | Get OAuth client | 200 | 401, 403, 404 | - |
| `/admin/oauth-clients/{clientId}` | PATCH | Update OAuth client | 200 | 400, 401, 403, 404 | - |
| `/admin/oauth-clients/{clientId}` | DELETE | Delete OAuth client | 204 | 401, 403, 404 | - |

#### CADDE Configuration Management

Manage CADDE (Cross-domain Data Exchange) configuration via API. Configuration is stored in MongoDB; no environment variables required.

| Endpoint | Method | Description | Success | Error | Pagination |
|---------------|---------|------|------|--------|-----------------|
| `/admin/cadde` | GET | Get CADDE configuration | 200 | 401, 403 | - |
| `/admin/cadde` | PUT | Update CADDE configuration (upsert) | 200 | 400, 401, 403 | - |
| `/admin/cadde` | DELETE | Delete CADDE configuration (disable) | 204 | 401, 403 | - |

**Request Body (PUT)**

```json
{
  "enabled": true,
  "authEnabled": true,
  "defaultProvider": "provider-001",
  "jwtIssuer": "https://auth.example.com",
  "jwtAudience": "my-api",
  "jwksUrl": "https://auth.example.com/.well-known/jwks.json"
}
```http

| Field | Type | Required | Description |
|-----------|------|------|------|
| `enabled` | boolean | ✅ | Enable/disable CADDE features |
| `authEnabled` | boolean | ✅ | Enable/disable Bearer authentication |
| `defaultProvider` | string | - | Default provider ID |
| `jwtIssuer` | string | - | JWT issuer claim validation value |
| `jwtAudience` | string | - | JWT audience claim validation value |
| `jwksUrl` | string | - | JWKS public key endpoint URL (HTTPS required) |

#### Rule Engine Management

| Endpoint | Method | Description | Success | Error | Pagination |
|---------------|---------|------|------|--------|-----------------|
| `/rules` | GET | List rules | 200 | 400, 401, 403 | ✅ (max: 100) |
| `/rules` | POST | Create rule | 201 | 400, 401, 403, 409 | - |
| `/rules/{ruleId}` | GET | Get rule | 200 | 401, 403, 404 | - |
| `/rules/{ruleId}` | PATCH | Update rule | 204 | 400, 401, 403, 404 | - |
| `/rules/{ruleId}` | DELETE | Delete rule | 204 | 401, 403, 404 | - |
| `/rules/{ruleId}/activate` | POST | Activate rule | 200 | 401, 403, 404 | - |
| `/rules/{ruleId}/deactivate` | POST | Deactivate rule | 200 | 401, 403, 404 | - |

### Custom Data Models API

API for managing tenant-specific custom data models. JWT authentication is required, and XACML policy-based authorization allows `tenant_admin` and `user` roles to manage custom data models within their tenant.

**Related Documentation**: [SMART_DATA_MODELS.md](../features/smart-data-models.md)

| Endpoint | Method | Description | Success | Error | Pagination |
|---------------|---------|------|------|--------|-----------------|
| `/custom-data-models` | GET | List custom data models | 200 | 400, 401, 403 | ✅ (max: 100) |
| `/custom-data-models` | POST | Create custom data model | 201 | 400, 401, 403, 409 | - |
| `/custom-data-models/{type}` | GET | Get custom data model | 200 | 401, 403, 404 | - |
| `/custom-data-models/{type}` | PATCH | Update custom data model | 200 | 400, 401, 403, 404 | - |
| `/custom-data-models/{type}` | DELETE | Delete custom data model | 204 | 401, 403, 404 | - |

#### Entity Validation

When a custom data model is defined, validation is automatically performed during entity creation and updates. Validation is only applied to models with `isActive: true`.

**Validation Checks:**

| Check Item | Description |
|------------|------|
| Required fields | Whether attributes with `required: true` exist |
| Type checking | Type validation based on `valueType` (string, number, integer, boolean, array, object, GeoJSON) |
| minLength / maxLength | String length constraints |
| minimum / maximum | Numeric range constraints |
| pattern | Regular expression pattern matching |
| enum | List of allowed values |

On validation failure, returns `400 Bad Request`:

```json
{
  "error": "BadRequest",
  "description": "Entity validation failed: temperature: Value (150) exceeds maximum (100)"
}
```http

#### JSON Schema Auto-Generation

When creating or updating a custom data model, a JSON Schema (Draft 2020-12) is automatically generated from `propertyDetails` and included in the `jsonSchema` field of the response. Manual specification of `jsonSchema` is also possible.

#### @context Resolution Extension

In NGSI-LD responses, if `contextUrl` is set in the custom data model, the custom context is automatically included in the entity's `@context` (returned as an array with the core context).

### Catalog API

| Endpoint | Method | Description | Success | Error | Pagination |
|---------------|---------|------|------|--------|-----------------|
| `/catalog` | GET | Get DCAT-AP catalog | 200 | 401 | - |
| `/catalog/datasets` | GET | List datasets | 200 | 400, 401 | ✅ (max: 1000) |
| `/catalog/datasets/{datasetId}` | GET | Get dataset | 200 | 401, 404 | - |
| `/catalog/datasets/{datasetId}/sample` | GET | Get sample data | 200 | 401, 404 | - |

### Vector Tiles API

| Endpoint | Method | Description | Success | Error |
|---------------|---------|------|------|--------|
| `/v2/tiles` | GET | Get TileJSON metadata (NGSIv2) | 200 | 401 |
| `/v2/tiles/{z}/{x}/{y}.geojson` | GET | Get GeoJSON tile (NGSIv2) | 200 | 400, 401 |
| `/ngsi-ld/v1/tiles` | GET | Get TileJSON metadata (NGSI-LD) | 200 | 401 |
| `/ngsi-ld/v1/tiles/{z}/{x}/{y}.geojson` | GET | Get GeoJSON tile (NGSI-LD) | 200 | 400, 401 |

### Event Streaming API

Real-time entity change streaming using WebSocket. Enabled with `EVENT_STREAMING_ENABLED=true`.

| Endpoint | Protocol | Description |
|---------------|-----------|------|
| `wss://{api-id}.execute-api.{region}.amazonaws.com/{stage}?tenant={name}` | WebSocket | Stream entity change events (authentication via `Authorization` header) |

For details, refer to the [Event Streaming documentation](../features/subscriptions.md).

### Access Permissions Summary

| API Category | user | tenant_admin | super_admin |
|-------------|------|--------------|-------------|
| Public endpoints | ✅ | ✅ | ✅ |
| `/auth/*` | ✅ | ✅ | ✅ |
| `/me/*` | ✅ | ✅ | ✅ |
| `/v2/*` | ✅ (own tenant) | ✅ (own tenant) | ✅ (all tenants) |
| `/ngsi-ld/*` | ✅ (own tenant) | ✅ (own tenant) | ✅ (all tenants) |
| `/catalog/*` | ✅ (own tenant) | ✅ (own tenant) | ✅ (all tenants) |
| `/admin/*` | ❌ | ❌ | ✅ |
| `/custom-data-models` | ✅ (own tenant) | ✅ (own tenant) | ✅ (all tenants) |
| `/rules` | ❌ | ✅ (own tenant) | ✅ (all tenants) |
| WebSocket | ✅ (own tenant) | ✅ (own tenant) | ✅ (all tenants) |

---

## Related Links

- [FIWARE NGSI v2 Specification](https://fiware.github.io/specifications/ngsiv2/stable/)
- [ETSI NGSI-LD Specification](https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/01.06.01_60/gs_CIM009v010601p.pdf)
- [FIWARE Orion Context Broker Documentation](https://fiware-orion.readthedocs.io/)
- [IPA Spatial ID Guidelines](https://www.ipa.go.jp/digital/architecture/guidelines/4dspatio-temporal-guideline.html)
- [Digital Agency Spatial ID](https://www.digital.go.jp/policies/mobility_and_infrastructure/spatial-id)
- [RFC 7946 GeoJSON](https://datatracker.ietf.org/doc/html/rfc7946)