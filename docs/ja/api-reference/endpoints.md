---
title: "API 共通仕様"
description: "GeonicDB API の共通仕様・認証・クエリパラメータ"
outline: deep
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
- [空間ID検索](#空間id検索)
- [GeoJSON出力](#geojson出力)
- [ベクトルタイル](#ベクトルタイル)
- [座標参照系（CRS）](#座標参照系crs)
- [データカタログ API](#データカタログ-api)
- [CADDE連携](#cadde連携)
- [イベントストリーミング](#イベントストリーミング)
- [エラーレスポンス](#エラーレスポンス)
- [実装状況](#実装状況)

---

## 概要

このContext Brokerは、FIWARE NGSI（Next Generation Service Interface）仕様に準拠したRESTful APIを提供します。

**📖 関連ドキュメント:**
- [NGSIv2 / NGSI-LD 相互互換性ガイド](../core-concepts/ngsiv2-vs-ngsild.md) - 両APIの相互運用性、型マッピング、ベストプラクティス
- [WebSocket イベントストリーミング](../features/subscriptions.md) - リアルタイムイベント購読、実装例、ベストプラクティス

### ベースURL

```text
https://{api-gateway-url}/{stage}
```

### サポートするAPI

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
| `Fiware-Correlator` | 任意 | リクエスト追跡用の相関ID | 自動生成 |

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

[FIWARE Orion仕様](https://fiware-orion.readthedocs.io/en/1.3.0/user/service_path/index.html)に準拠しています。

#### 基本形式

- `/` で始まる絶対パスのみ使用可能
- 英数字とアンダースコアのみ使用可能
- 最大10階層、各レベル最大50文字

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

カンマで区切って複数のパスを同時に検索できます（最大10パス、**クエリ操作のみ**）。

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

すべてのリスト系APIエンドポイントでページネーションがサポートされています。

### パラメータ

| パラメータ | 説明 | デフォルト | 最大値 |
|-----------|------|-----------|-------|
| `limit` | 返却する最大件数 | 20 | 1000（Admin APIは100） |
| `offset` | スキップする件数 | 0 | - |

### レスポンスヘッダー

各APIタイプで総件数を示すヘッダーが返却されます：

| API | ヘッダー名 | 条件 |
|-----|-----------|------|
| NGSIv2 | `Fiware-Total-Count` | 常に返却（全リストエンドポイント） |
| NGSI-LD | `NGSILD-Results-Count` | 常に返却 |
| Admin API | `X-Total-Count` | 常に返却 |
| Catalog API | `X-Total-Count` | 常に返却 |

### Link ヘッダー

すべてのリスト系エンドポイントは [RFC 8288](https://www.rfc-editor.org/rfc/rfc8288) に準拠した `Link` ヘッダーを返却し、次ページ (`rel="next"`) および前ページ (`rel="prev"`) の URL を提供します。結果が1ページに収まる場合、`Link` ヘッダーは返却されません。

```text
Link: <https://api.example.com/v2/entities?limit=10&offset=20>; rel="next", <https://api.example.com/v2/entities?limit=10&offset=0>; rel="prev"
```

### バリデーション

無効なページネーションパラメータは `400 Bad Request` を返します：

| エラー条件 | エラーメッセージ |
|-----------|-----------------|
| 負のlimit | `Invalid limit: must not be negative` |
| 負のoffset | `Invalid offset: must not be negative` |
| limit=0 | `Invalid limit: must be greater than 0` |
| 最大値超過 | `Invalid limit: must not exceed 1000` |
| 数値以外 | `Invalid limit: must be a valid integer` |

### 使用例

```bash
# 2ページ目を取得（1ページ10件）
curl "http://localhost:3000/v2/entities?limit=10&offset=10" \
  -H "Fiware-Service: smartcity"

# 総件数ヘッダー付きで取得
curl "http://localhost:3000/v2/entities?limit=10&options=count" \
  -H "Fiware-Service: smartcity"
```

### 注意事項

- `offset`が総件数を超えた場合、空の配列が返されます（エラーではありません）
- FIWARE Orion仕様に準拠しています

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
| `JWT_SECRET` | - | JWTトークン署名用シークレット（32文字以上推奨） |
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
Authorization: Bearer <accessToken>
```

全セッションを無効化します。このユーザーに対して発行された全てのアクセストークンとリフレッシュトークンが即座に無効化されます。

**レスポンス**: `204 No Content`

### 管理 API

管理 API は `super_admin` または `tenant_admin` ロールを持つユーザーのみアクセス可能です。

#### ユーザー一覧

```http
GET /admin/users
Authorization: Bearer <accessToken>
```

**クエリパラメータ**

| パラメータ | 説明 |
|-----------|------|
| `tenantId` | テナントIDでフィルタ（super_admin のみ） |
| `role` | ロールでフィルタ |
| `limit` | 取得件数 |
| `offset` | オフセット |

#### ユーザー作成

```http
POST /admin/users
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**リクエストボディ**

```json
{
  "email": "newuser@example.com",
  "password": "SecurePassword123!",
  "role": "user",
  "tenantId": "tenant-456"
}
```

#### ユーザー取得

```http
GET /admin/users/{userId}
Authorization: Bearer <accessToken>
```

#### ユーザー更新

```http
PATCH /admin/users/{userId}
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**リクエストボディ**

```json
{
  "email": "updated@example.com",
  "role": "tenant_admin"
}
```

#### ユーザー削除

```http
DELETE /admin/users/{userId}
Authorization: Bearer <accessToken>
```

#### ユーザー有効化/無効化

```http
POST /admin/users/{userId}/activate
POST /admin/users/{userId}/deactivate
Authorization: Bearer <accessToken>
```

#### ログインロック解除

ブルートフォース保護によりロックされたアカウントを解除します。

```http
POST /admin/users/{userId}/unlock
Authorization: Bearer <accessToken>
```

**レスポンス (200):**

```json
{
  "userId": "abc123",
  "email": "user@example.com",
  "locked": false,
  "failedCount": 0,
  "message": "Account login lock has been cleared"
}
```

### テナント管理（super_admin のみ）

#### テナント一覧

```http
GET /admin/tenants
Authorization: Bearer <accessToken>
```

#### テナント作成

```http
POST /admin/tenants
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**リクエストボディ**

```json
{
  "name": "New Organization",
  "settings": {
    "maxUsers": 100,
    "allowedServices": ["*"]
  }
}
```

#### テナント取得

```http
GET /admin/tenants/{tenantId}
Authorization: Bearer <accessToken>
```

#### テナント更新

```http
PATCH /admin/tenants/{tenantId}
Authorization: Bearer <accessToken>
Content-Type: application/json
```

#### テナント削除

```http
DELETE /admin/tenants/{tenantId}
Authorization: Bearer <accessToken>
```

**注意**: ユーザーが存在するテナントは削除できません。

#### テナント有効化/無効化

```http
POST /admin/tenants/{tenantId}/activate
POST /admin/tenants/{tenantId}/deactivate
Authorization: Bearer <accessToken>
```

### カスタムデータモデル管理

> **注意**: カスタムデータモデル API は `/custom-data-models` に移動しました。詳細は [Custom Data Models API](#custom-data-models-api) セクションを参照してください。

### IP 制限

`ADMIN_ALLOWED_IPS` 環境変数を設定すると、管理 API (`/admin/*`) へのアクセスを特定の IP アドレスからのみ許可できます：

```bash
# 単一 IP
ADMIN_ALLOWED_IPS=192.168.1.100

# 複数 IP
ADMIN_ALLOWED_IPS=192.168.1.100,10.0.0.50

# CIDR 表記
ADMIN_ALLOWED_IPS=192.168.1.0/24,10.0.0.0/8
```

許可されていない IP からのアクセスは `403 Forbidden` エラーになります。

#### テナント別 IP 制限

テナントごとに独自の IP 制限を設定できます。テナント設定が存在する場合はグローバル設定（`ADMIN_ALLOWED_IPS`）よりも優先されます。

```http
GET /admin/tenants/{tenantId}/ip-restrictions
PUT /admin/tenants/{tenantId}/ip-restrictions
DELETE /admin/tenants/{tenantId}/ip-restrictions
Authorization: Bearer <accessToken>
```

スコープは `admin`（管理 API のみ）と `all`（全 API）の2種類です。詳細は AUTH.md を参照してください。

### Rule Engine 管理（super_admin, tenant_admin）

エンティティ変更を自動処理するルールを管理します。super_admin は全テナントのルールを管理でき、tenant_admin は自テナントのルールのみ管理できます。

- 📘 **REACTIVCORE_RULES.md** - ユーザー向けガイド（使用例、Admin API等）

#### ルール一覧

```http
GET /rules
Authorization: Bearer <accessToken>
```

**クエリパラメータ**

| パラメータ | 説明 |
|-----------|------|
| `limit` | 取得件数（デフォルト: 20、最大: 100） |
| `offset` | オフセット（デフォルト: 0） |
| `servicePath` | サービスパスでフィルタ |
| `isActive` | 有効/無効でフィルタ（`true` / `false`） |

#### ルール作成

```http
POST /rules
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**リクエストボディ**

```json
{
  "ruleId": "high-temperature-alert",
  "name": "高温警告",
  "description": "温度が30度を超えたら警告属性を追加",
  "conditions": [
    {
      "type": "entityType",
      "entityTypes": ["TemperatureSensor"]
    },
    {
      "type": "value",
      "attributeName": "temperature",
      "operator": ">",
      "value": 30
    }
  ],
  "actions": [
    {
      "type": "updateAttribute",
      "entityId": "${entity.id}",
      "attributeName": "alert",
      "value": "HIGH_TEMPERATURE"
    }
  ],
  "priority": 10
}
```

#### ルール取得

```http
GET /rules/{ruleId}
Authorization: Bearer <accessToken>
```

#### ルール更新

```http
PATCH /rules/{ruleId}
Authorization: Bearer <accessToken>
Content-Type: application/json
```

レスポンス：`204 No Content`

#### ルール削除

```http
DELETE /rules/{ruleId}
Authorization: Bearer <accessToken>
```

#### ルール有効化/無効化

```http
POST /rules/{ruleId}/activate
POST /rules/{ruleId}/deactivate
Authorization: Bearer <accessToken>
```

---

## OAuth 2.0 API（M2M認証）

OAuth 2.0 Client Credentials Grant フローを使用した、Machine-to-Machine（M2M）認証をサポートしています。

**主要エンドポイント:**
- `POST /oauth/token` - トークン取得（Basic認証）
- `POST /admin/oauth-clients` - クライアント作成（Admin）
- `GET /admin/oauth-clients` - クライアント一覧（Admin）
- `POST /admin/oauth-clients/{clientId}/regenerate-secret` - シークレット再生成（Admin）

**有効化:** 環境変数 `OAUTH_ENABLED=true`（デフォルト: `true`）

**利用可能なスコープ:**
- リソーススコープ: `read:entities`, `write:entities`, `read:subscriptions`, `write:subscriptions`, など
- 管理スコープ: `admin:users`, `admin:tenants`, `admin:policies`
- 特殊スコープ: `permanent`（無期限トークン）, `jwt`（JWT API アクセス）

**詳細:** AUTH.md の OAuth 2.0 セクションを参照してください。

---

## メタエンドポイント

メタエンドポイントは認証不要で、システムの状態や API 情報を提供します。

### API ドキュメント（llms.txt形式）

```http
GET /llms.txt
```

AI フレンドリーな [llms.txt](https://llmstxt.org/) 形式で API ドキュメントを返します。Markdown 形式で、AIエージェントや LLM が API を理解しやすい構造になっています。

**レスポンス**
- Content-Type: `text/markdown; charset=utf-8`

### API ドキュメント（JSON形式）

```http
GET /api.json
```

API エンドポイントの一覧を JSON 形式で返します。

**レスポンス例**

```json
{
  "name": "GeonicDB",
  "version": "1.0.0",
  "documentation": {
    "llms_txt": "/llms.txt",
    "openapi": "/openapi.json",
    "full": "https://github.com/geolonia/geonicdb/blob/main/docs/API.md"
  },
  "apis": {
    "ngsiv2": { "basePath": "/v2", "endpoints": {...} },
    "ngsi-ld": { "basePath": "/ngsi-ld/v1", "endpoints": {...} }
  }
}
```

### OpenAPI 仕様

```http
GET /openapi.json
```

OpenAPI 3.0 仕様を JSON 形式で返します。Swagger UI や各種 API クライアント生成ツールで利用できます。

**レスポンス**
- Content-Type: `application/json`
- OpenAPI バージョン: 3.0.3

### バージョン情報

```http
GET /version
```

FIWARE Orion 互換のバージョン情報を返します。

**レスポンス例**

```json
{
  "orion": {
    "version": "1.0.0",
    "uptime": "0 d, 1 h, 30 m, 45 s",
    "git_hash": "787ae22",
    "compile_time": "2026-01-25T00:00:00Z",
    "compiled_by": "vela",
    "compiled_in": "aws-lambda",
    "release_date": "2026-01-25",
    "machine": "x64",
    "doc": "https://github.com/geolonia/geonicdb"
  },
  "vendor": {
    "name": "Geolonia Inc.",
    "url": "https://geolonia.com"
  }
}
```

### NGSI-LD API ディスカバリ

```http
GET /.well-known/ngsi-ld
```

NGSI-LD API のサポート情報を返します。

**レスポンス例**

```json
{
  "serverVersion": "1.0.0",
  "supportedApiVersions": ["v1"],
  "supportedFeatures": ["entities", "subscriptions", "batchOperations"]
}
```

### ヘルスチェック

#### 基本ヘルス

```http
GET /health
```

サービスの基本的な稼働状態を返します。

**レスポンス例**

```json
{
  "status": "healthy",
  "timestamp": "2026-01-25T10:30:00Z"
}
```

#### Liveness プローブ

```http
GET /health/live
```

Kubernetes の Liveness プローブ用。サービスが実行中かどうかを確認します。

**レスポンス**
- 成功: `200 OK`
- ステータス: `healthy`

#### Readiness プローブ

```http
GET /health/ready
```

Kubernetes の Readiness プローブ用。MongoDB への接続を含むサービスの準備状態を確認します。

**レスポンス**
- 成功: `200 OK` with `status: "healthy"`
- 失敗: `503 Service Unavailable` with `status: "unhealthy"`

### 統計情報・メトリクス

FIWARE Orion 互換の統計情報エンドポイントと Prometheus 形式のメトリクスエンドポイントを提供します。

#### 統計情報

```http
GET /statistics
Authorization: Bearer <token>
```

サーバーの稼働統計情報を FIWARE Orion 互換の形式で返します。認証が有効な場合（`AUTH_ENABLED=true`）、認証済みユーザーのみアクセス可能です。

**レスポンス例**

```json
{
  "uptime_in_secs": 3600,
  "measuring_interval_in_secs": 3600,
  "counters": {
    "jsonRequests": 1500,
    "noPayloadRequests": 200,
    "requests": {
      "entities": 1000,
      "subscriptions": 300,
      "registrations": 200
    },
    "notifications": {
      "sent": 500,
      "failed": 10
    }
  },
  "timing": {
    "totalRequestTime": { "total": 15000, "count": 1700, "mean": 8.82 },
    "dbTime": { "total": 5000, "count": 1700, "mean": 2.94 }
  },
  "notifQueue": {
    "size": 5,
    "in": 510,
    "out": 505
  }
}
```

#### キャッシュ統計

```http
GET /cache/statistics
Authorization: Bearer <token>
```

サブスクリプションおよびレジストレーションのキャッシュ統計を返します。認証が有効な場合（`AUTH_ENABLED=true`）、認証済みユーザーのみアクセス可能です。

**レスポンス例**

```json
{
  "subscriptions": {
    "count": 50,
    "inserts": 100,
    "updates": 25,
    "removes": 50,
    "refreshes": 10
  },
  "registrations": {
    "count": 20,
    "inserts": 30,
    "updates": 5,
    "removes": 10,
    "refreshes": 5
  }
}
```

#### Prometheus メトリクス

```http
GET /metrics
Authorization: Bearer <token>
```

Prometheus 形式（exposition format）でメトリクスを返します。認証が有効な場合（`AUTH_ENABLED=true`）、認証済みユーザーのみアクセス可能です。Kubernetes 環境での監視や Grafana ダッシュボードとの連携に使用できます。

**レスポンス**
- Content-Type: `text/plain; version=0.0.4`

**レスポンス例**

```text
# HELP vela_uptime_seconds Server uptime in seconds
# TYPE vela_uptime_seconds gauge
vela_uptime_seconds 3600

# HELP vela_entities_total Total number of entities
# TYPE vela_entities_total gauge
vela_entities_total 1000

# HELP vela_subscriptions_total Total number of subscriptions
# TYPE vela_subscriptions_total gauge
vela_subscriptions_total 50

# HELP vela_registrations_total Total number of registrations
# TYPE vela_registrations_total gauge
vela_registrations_total 20

# HELP vela_http_requests_total Total HTTP requests
# TYPE vela_http_requests_total counter
vela_http_requests_total{endpoint="entities"} 1000
vela_http_requests_total{endpoint="subscriptions"} 300

# HELP vela_notifications_sent_total Total notifications sent
# TYPE vela_notifications_sent_total counter
vela_notifications_sent_total 500

# HELP vela_notifications_failed_total Total notifications failed
# TYPE vela_notifications_failed_total counter
vela_notifications_failed_total 10
```

#### AI インテグレーション

##### AI ツール定義

```http
GET /tools.json
```

Claude Tool Use / OpenAI Function Calling 互換のツール定義を JSON 形式で返します。AI エージェントがAPIをツールとして利用するためのスキーマです。

**提供ツール**: `list_entities`, `get_entity`, `search_by_location`, `search_by_attribute`, `create_entity`, `update_entity`, `delete_entity`, `list_entity_types`, `get_temporal_data`, `subscribe`

##### AI プラグインマニフェスト

```http
GET /.well-known/ai-plugin.json
```

AI プラグインマニフェストを返します。API の概要、ツール定義 URL、OpenAPI 仕様 URL 等を含みます。

##### MCP (Model Context Protocol)

```http
POST /mcp
Content-Type: application/json
Accept: application/json, text/event-stream
```

MCP Streamable HTTP エンドポイント。MCP 対応 AI クライアント（Claude Desktop 等）から直接接続できます。ステートレスモード（JSON レスポンス）で動作し、上記 10 ツールすべてを MCP tools/call で利用可能です。

`AUTH_ENABLED=true` の場合、Bearer トークン（JWT）による認証が必要です。テナントアクセス制御も適用されます。

**Claude Desktop 設定例**:
```json
{
  "mcpServers": {
    "vela": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://localhost:3000/mcp",
        "--header",
        "Authorization: Bearer <your-jwt-token>"
      ]
    }
  }
}
```
※ `headers` は `AUTH_ENABLED=true` の場合のみ必要です。

詳細は [AI_INTEGRATION.md](../ai-integration/overview.md) を参照してください。

#### テナント別メトリクス（Admin API）

```http
GET /admin/metrics
Authorization: Bearer <accessToken>
```

テナントおよびサービスパス別のメトリクスを返します。`super_admin` ロールが必要です。

**レスポンス例**

```json
{
  "services": {
    "smartcity": {
      "subservs": {
        "/": {
          "entityCount": 500,
          "subscriptionCount": 20,
          "registrationCount": 10
        },
        "/sensors": {
          "entityCount": 300,
          "subscriptionCount": 15,
          "registrationCount": 5
        }
      }
    }
  }
}
```

---

## NGSIv2 API

NGSIv2 API の詳細は [API_NGSIV2.md](./ngsiv2.md) を参照してください。

---

## NGSI-LD API

NGSI-LD API の詳細は [API_NGSILD.md](./ngsild.md) を参照してください。

---

## クエリ言語

`q` パラメータで属性値によるフィルタリングが可能です。

### 基本構文

| 演算子 | 説明 | 例 |
|--------|------|-----|
| `==` | 等しい | `temperature==23` |
| `!=` | 等しくない | `status!=inactive` |
| `>` | より大きい | `temperature>20` |
| `<` | より小さい | `temperature<30` |
| `>=` | 以上 | `temperature>=20` |
| `<=` | 以下 | `temperature<=30` |
| `..` | 範囲 | `temperature==20..30` |
| `~=` | パターンマッチ（正規表現） | `name~=Room.*` |

### 複数条件

セミコロン（`;`）で AND 条件を結合：

```text
q=temperature>20;pressure<800
```

パイプ（`|`）で OR 条件を結合（`;` は `|` より優先度が高い）：

```text
q=temperature==23|temperature==35
q=temperature>25;humidity<40|status==active
```

### 範囲クエリ

`==` 演算子と `..` を組み合わせて範囲フィルタリング（境界値を含む）：

```text
q=temperature==20..30    # 20以上30以下
```

### 文字列マッチング

```text
q=status~=act     # 部分一致（正規表現）
q=name==Room1     # 完全一致
```

---

## ジオクエリ

位置情報を持つエンティティを空間的にクエリできます。

### パラメータ

| パラメータ | 説明 |
|-----------|------|
| `georel` | 空間関係（coveredBy, within, intersects, disjoint, equals） |
| `geometry` | ジオメトリタイプ（point, polygon, line, box） |
| `coords` | 座標（NGSIv2: 緯度,経度 形式、NGSI-LD: 経度,緯度 形式、複数点はセミコロン区切り） |

> **注意**: `georel`、`geometry`、`coords`（NGSI-LDでは`coordinates`）は全て同時に指定する必要があります。一部のみ指定した場合は `400 Bad Request` が返されます（ETSI GS CIM 009 V1.9.1 clause 4.10）。

### 座標の指定形式

NGSIv2では **緯度,経度** の順序で指定します（NGSIv2仕様準拠）。NGSI-LDでは **経度,緯度** の順序です（GeoJSON標準に準拠）。

> **⚠️ 重要**: NGSIv2 の緯度,経度 順序は GeoJSON 標準（経度,緯度）からの逸脱です。NGSI-LD ではこの問題が修正され、GeoJSON と同じ経度,緯度 順序を使用します。API を使用する際は、使用している API バージョンに応じて座標順序を正しく指定してください。

```text
# NGSIv2（緯度,経度）
coords=35.6812,139.7671              # 単一点
coords=34,138;34,141;37,141;37,138;34,138  # ポリゴン（セミコロン区切り）

# NGSI-LD（経度,緯度）
coordinates=[139.7671,35.6812]       # 単一点
```

### 領域内検索（coveredBy / within）

ポリゴン内のエンティティを検索：

```http
GET /v2/entities?georel=coveredBy&geometry=polygon&coords=34,138;34,141;37,141;37,138;34,138
```

### 交差検索（intersects）

ジオメトリと交差するエンティティを検索：

```http
GET /v2/entities?georel=intersects&geometry=box&coords=35.67,139.76;35.69,139.78
```

### 非交差検索（disjoint）

ジオメトリと交差しないエンティティを検索：

```http
GET /v2/entities?georel=disjoint&geometry=polygon&coords=34,138;34,141;37,141;37,138;34,138
```

### 近接検索（near）

指定座標から一定距離内のエンティティを検索します。

#### パラメータ

| パラメータ | 説明 |
|-----------|------|
| `maxDistance` | 最大距離（メートル） |
| `minDistance` | 最小距離（メートル） |
| `orderByDistance` | `true` を指定すると距離順でソートし、各エンティティに距離情報（`@distance`）を付与 |

#### 基本的な使用例（NGSIv2）

```http
# 東京駅から5km以内のエンティティを検索
GET /v2/entities?georel=near;maxDistance:5000&geometry=point&coords=35.6812,139.7671

# 東京駅から100km以上離れたエンティティを検索
GET /v2/entities?georel=near;minDistance:100000&geometry=point&coords=35.6812,139.7671

# ドーナツ型検索（500m〜10kmの範囲）
GET /v2/entities?georel=near;minDistance:500;maxDistance:10000&geometry=point&coords=35.6812,139.7671
```

#### NGSI-LDでの使用例

NGSI-LDでは `==` を使用してパラメータを指定します：

```http
# 東京駅から5km以内のエンティティを検索
GET /ngsi-ld/v1/entities?georel=near;maxDistance==5000&geometry=Point&coordinates=[139.7671,35.6812]

# 東京駅から100km以上離れたエンティティを検索
GET /ngsi-ld/v1/entities?georel=near;minDistance==100000&geometry=Point&coordinates=[139.7671,35.6812]

# ドーナツ型検索（500m〜10kmの範囲）
GET /ngsi-ld/v1/entities?georel=near;minDistance==500;maxDistance==10000&geometry=Point&coordinates=[139.7671,35.6812]
```

#### georel 構文の比較表

NGSIv2 と NGSI-LD では georel パラメータの修飾子構文が異なります：

| 機能 | NGSIv2 | NGSI-LD | 説明 |
|------|--------|---------|------|
| 最大距離指定 | `georel=near;maxDistance:5000` | `georel=near;maxDistance==5000` | `:` vs `==` の違い |
| 最小距離指定 | `georel=near;minDistance:1000` | `georel=near;minDistance==1000` | `:` vs `==` の違い |
| 距離範囲指定 | `georel=near;minDistance:500;maxDistance:10000` | `georel=near;minDistance==500;maxDistance==10000` | `:` vs `==` の違い |

> **構文の違いの理由**: NGSIv2 では `:` を使用してパラメータ値を指定しますが、NGSI-LD では ETSI 仕様に従い `==` を使用します。API を呼び出す際は、使用している API バージョンに対応する構文を使用してください。

#### 距離順ソートと距離情報の取得

`orderByDistance=true` パラメータを指定すると、以下の機能が有効になります：

1. **距離順ソート**: 結果が指定座標からの距離の昇順でソートされます
2. **距離情報の付与**: 各エンティティに `@distance` 属性が追加され、指定座標からの距離（メートル）が返却されます

この機能は MongoDB の `$geoNear` aggregation pipeline を使用して実装されています。

##### NGSIv2での使用例

```http
# 東京駅から5km以内のエンティティを距離順で取得
GET /v2/entities?georel=near;maxDistance:5000&geometry=point&coords=35.6812,139.7671&orderByDistance=true
```

レスポンス例：
```json
[
  {
    "id": "Store1",
    "type": "Store",
    "name": { "type": "Text", "value": "Tokyo Store" },
    "location": {
      "type": "geo:json",
      "value": { "type": "Point", "coordinates": [139.7671, 35.6812] }
    },
    "@distance": { "type": "Number", "value": 0 }
  },
  {
    "id": "Store2",
    "type": "Store",
    "name": { "type": "Text", "value": "Nearby Store" },
    "location": {
      "type": "geo:json",
      "value": { "type": "Point", "coordinates": [139.77, 35.685] }
    },
    "@distance": { "type": "Number", "value": 512.35 }
  }
]
```

##### NGSI-LDでの使用例

```http
# 東京駅から5km以内のエンティティを距離順で取得
GET /ngsi-ld/v1/entities?georel=near;maxDistance==5000&geometry=Point&coordinates=[139.7671,35.6812]&orderByDistance=true
```

##### 降順ソート

`orderDirection=desc` を併用すると、距離の降順（遠い順）でソートできます：

```http
GET /v2/entities?georel=near;maxDistance:5000&geometry=point&coords=35.6812,139.7671&orderByDistance=true&orderDirection=desc
```

#### 制限事項

- **Pointジオメトリのみ対応**: `geometry=point` (NGSIv2) または `geometry=Point` (NGSI-LD) のみサポート

### エラーハンドリング

ジオクエリのパラメータが不正な場合、`400 Bad Request` が返されます。

| エラー条件 | エラーメッセージ例 |
|-----------|------------------|
| 無効な `georel` 値 | `Invalid georel: xxx. Supported values: near, coveredBy, within, contains, intersects, disjoint, equals` |
| 無効な `geometry` 値 | `Unsupported geometry type: xxx. Supported types: point, polygon, linestring, line, box` |
| 座標数不足（Point） | `Point geometry requires at least 2 coordinates, but got 1` |
| 座標数不足（Polygon） | `Polygon geometry requires at least 4 coordinate pairs (8 values), but got 6 values` |
| 座標数不足（LineString） | `LineString geometry requires at least 2 coordinate pairs (4 values), but got 2 values` |
| 座標数不足（Box） | `Box geometry requires 2 coordinate pairs (4 values), but got 2 values` |
| 座標値が不正 | `Invalid coordinate value: xxx` |
| 緯度が範囲外 | `Latitude out of range: 91. Must be between -90 and 90.` |
| 経度が範囲外 | `Longitude out of range: 181. Must be between -180 and 180.` |
| `near` で距離未指定 | `The 'near' georel requires maxDistance and/or minDistance modifier` |
| `near` でPoint以外 | `The 'near' georel requires Point geometry, but 'polygon' was provided` |

---

## 空間ID検索

デジタル庁/IPAが策定した3次元空間識別規格（ZFXY形式）に基づく空間検索をサポートしています。

### ZFXY形式

| 要素 | 説明 | 範囲 |
|-----|------|-----|
| Z | ズームレベル | 0-28 |
| F | 鉛直方向（高度レベル） | 整数 |
| X | 東西方向（経度タイル） | 0 〜 2^z-1 |
| Y | 南北方向（緯度タイル） | 0 〜 2^z-1 |

形式: `{z}/{f}/{x}/{y}` (例: `20/0/929593/410773`)

### NGSIv2での使用

```http
GET /v2/entities?spatialId=20/0/929593/410773
```

### NGSI-LDでの使用

```http
GET /ngsi-ld/v1/entities?spatialId=20/0/929593/410773
```

### 階層展開（spatialIdDepth）

`spatialIdDepth` パラメータを指定すると、指定した空間IDを中心に周囲のタイルに展開して検索します。

```http
# depth=1: 3x3タイル（9タイル）に展開
GET /v2/entities?spatialId=20/0/929593/410773&spatialIdDepth=1

# depth=2: 5x5タイル（25タイル）に展開
GET /v2/entities?spatialId=20/0/929593/410773&spatialIdDepth=2
```

| spatialIdDepth | 展開範囲 | タイル数 |
|----------------|---------|---------|
| 0（デフォルト） | 指定タイルのみ | 1 |
| 1 | 3x3 | 9 |
| 2 | 5x5 | 25 |
| 3 | 7x7 | 49 |
| 4 | 9x9 | 81 |

### 使用例

```bash
# 東京駅付近（ズームレベル20）のエンティティを検索
curl "http://localhost:3000/v2/entities?spatialId=20/0/929592/410773" \
  -H "Fiware-Service: smartcity"

# 周囲3x3タイルに展開して検索
curl "http://localhost:3000/v2/entities?spatialId=20/0/929592/410773&spatialIdDepth=1" \
  -H "Fiware-Service: smartcity"
```

---

## GeoJSON出力

エンティティをRFC 7946準拠のGeoJSON FeatureCollection形式で出力できます。

### NGSIv2での使用

`options=geojson` パラメータまたは `Accept: application/geo+json` ヘッダーを使用します：

```http
# optionsパラメータ
GET /v2/entities?type=Store&options=geojson

# Acceptヘッダー
GET /v2/entities?type=Store
Accept: application/geo+json
```

### NGSI-LDでの使用

`format=geojson` パラメータまたは `Accept: application/geo+json` ヘッダーを使用します：

```http
# formatパラメータ
GET /ngsi-ld/v1/entities?type=Store&format=geojson

# Acceptヘッダー
GET /ngsi-ld/v1/entities?type=Store
Accept: application/geo+json
```

### レスポンス形式

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "Store1",
      "geometry": {
        "type": "Point",
        "coordinates": [139.6917, 35.6895]
      },
      "properties": {
        "type": "Store",
        "name": "東京店",
        "category": "retail"
      }
    },
    {
      "type": "Feature",
      "id": "Store2",
      "geometry": {
        "type": "Point",
        "coordinates": [139.7454, 35.6586]
      },
      "properties": {
        "type": "Store",
        "name": "品川店",
        "category": "retail"
      }
    }
  ]
}
```

### NGSI-LDでの@context

NGSI-LDでGeoJSON出力する場合、`@context`がFeatureCollectionレベルに含まれます：

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "type": "FeatureCollection",
  "features": [...]
}
```

### Content-Type

GeoJSON出力時のレスポンスヘッダー：

```text
Content-Type: application/geo+json
```

### 使用例

```bash
# NGSIv2でGeoJSON出力
curl "http://localhost:3000/v2/entities?type=Store&options=geojson" \
  -H "Fiware-Service: smartcity"

# NGSI-LDでGeoJSON出力（formatパラメータ）
curl "http://localhost:3000/ngsi-ld/v1/entities?type=Store&format=geojson" \
  -H "Fiware-Service: smartcity"

# NGSI-LDでGeoJSON出力（Acceptヘッダー）
curl "http://localhost:3000/ngsi-ld/v1/entities?type=Store" \
  -H "Fiware-Service: smartcity" \
  -H "Accept: application/geo+json"

# 空間ID検索とGeoJSON出力を組み合わせ
curl "http://localhost:3000/v2/entities?spatialId=20/0/929592/410773&options=geojson" \
  -H "Fiware-Service: smartcity"
```

### 注意事項

- `location` 属性がないエンティティは `geometry: null` として出力されます
- GeoJSON出力では `keyValues` オプションと同時に使用できます
- Polygon、LineString、MultiPoint等のジオメトリタイプもサポートされます

---

## ベクトルタイル

エンティティをXYZタイルスキームに基づいたGeoJSONベクトルタイルとして出力できます。大量のエンティティを効率的に地図上に表示するために最適化されています。

### エンドポイント

| エンドポイント | 説明 |
|---------------|------|
| `GET /v2/tiles` | TileJSONメタデータ（NGSIv2） |
| `GET /v2/tiles/{z}/{x}/{y}.geojson` | GeoJSONタイル（NGSIv2） |
| `GET /ngsi-ld/v1/tiles` | TileJSONメタデータ（NGSI-LD） |
| `GET /ngsi-ld/v1/tiles/{z}/{x}/{y}.geojson` | GeoJSONタイル（NGSI-LD） |

### TileJSONメタデータ

TileJSON 3.0仕様に準拠したメタデータを返します：

```bash
curl "http://localhost:3000/v2/tiles" \
  -H "Fiware-Service: smartcity"
```

**レスポンス例**

```json
{
  "tilejson": "3.0.0",
  "tiles": ["http://localhost:3000/v2/tiles/{z}/{x}/{y}.geojson"],
  "name": "GeonicDB Vector Tiles",
  "description": "GeoJSON vector tiles for NGSI entities",
  "minzoom": 0,
  "maxzoom": 22,
  "bounds": [-180, -85.051129, 180, 85.051129],
  "center": [0, 0, 2]
}
```

### GeoJSONタイル取得

XYZ座標を指定してタイル内のエンティティをGeoJSON形式で取得します：

```bash
# 東京周辺のズームレベル14タイル
curl "http://localhost:3000/v2/tiles/14/14549/6451.geojson" \
  -H "Fiware-Service: smartcity"
```

**クエリパラメータ**

| パラメータ | 説明 |
|-----------|------|
| `type` | エンティティタイプでフィルタ |
| `attrs` | 出力する属性をカンマ区切りで指定 |

**使用例**

```bash
# 特定タイプのエンティティのみ取得
curl "http://localhost:3000/v2/tiles/14/14549/6451.geojson?type=Store" \
  -H "Fiware-Service: smartcity"

# 特定の属性のみ取得
curl "http://localhost:3000/v2/tiles/14/14549/6451.geojson?attrs=name,category" \
  -H "Fiware-Service: smartcity"
```

**レスポンス例**

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "Store1",
      "geometry": {
        "type": "Point",
        "coordinates": [139.7671, 35.6812]
      },
      "properties": {
        "entityId": "Store1",
        "entityType": "Store",
        "name": "東京駅店"
      }
    }
  ],
  "totalCount": 1,
  "tileCoordinates": {
    "z": 14,
    "x": 14549,
    "y": 6451
  }
}
```

### クラスタリング

タイル内のエンティティ数が閾値（デフォルト: 1000）を超えた場合、自動的にクラスタリングされます。クラスタリング時は、タイル内の全エンティティの重心座標を持つ単一のクラスタFeatureが返されます。

**クラスタリング時のレスポンス例**

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "cluster-14-14549-6451",
      "geometry": {
        "type": "Point",
        "coordinates": [139.7654, 35.6798]
      },
      "properties": {
        "cluster": true,
        "point_count": 1523,
        "entityTypes": {
          "Store": 850,
          "Restaurant": 673
        }
      }
    }
  ],
  "totalCount": 1523,
  "tileCoordinates": {
    "z": 14,
    "x": 14549,
    "y": 6451
  },
  "clustered": true
}
```

**レスポンスヘッダー**

| ヘッダー | 説明 |
|---------|------|
| `X-Tile-Mode` | `individual`（個別エンティティ）または `clustered`（クラスタリング） |
| `X-Total-Count` | タイル内の総エンティティ数 |

### 設定

| 環境変数 | デフォルト | 説明 |
|----------|-----------|------|
| `MAX_ENTITIES_PER_REQUEST` | `1000` | クラスタリングを行う閾値（この値以上でクラスタリング） |

### 参考

- [TileJSON 3.0 Specification](https://github.com/mapbox/tilejson-spec/tree/master/3.0.0)
- [RFC 7946 GeoJSON](https://datatracker.ietf.org/doc/html/rfc7946)
- [XYZ Tile Scheme](https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames)

---

## 座標参照系（CRS）

座標参照系（Coordinate Reference System）を指定することで、異なる測地系間で座標変換を行うことができます。

### 対応CRS

| CRS | EPSG | 説明 | 用途 |
|-----|------|------|------|
| WGS84 | EPSG:4326 | 世界測地系1984（デフォルト） | GPS、国際標準 |
| JGD2011 | EPSG:6668 | 日本測地系2011 | 日本国内の高精度測量 |
| Web Mercator | EPSG:3857 | Webメルカトル図法 | Google Maps, OpenStreetMap等 |

### CRSの指定方法

#### NGSIv2

`crs` クエリパラメータで EPSG コードを指定します：

```http
# JGD2011座標で取得
GET /v2/entities?type=Store&crs=EPSG:6668

# Web Mercator座標で取得
GET /v2/entities?type=Store&crs=EPSG:3857
```

#### NGSI-LD

NGSI-LD では EPSG 短縮形式と URN 形式の両方をサポートします：

```http
# EPSG短縮形式
GET /ngsi-ld/v1/entities?type=Store&crs=EPSG:6668

# URN形式（ETSI準拠）
GET /ngsi-ld/v1/entities?type=Store&crs=urn:ogc:def:crs:EPSG::6668
```

### レスポンスヘッダー

CRSを指定したリクエストへのレスポンスには、`Content-Crs` ヘッダーが含まれます：

```text
Content-Crs: EPSG:6668
```

NGSI-LD で URN 形式を指定した場合は、URN 形式で返却されます：

```text
Content-Crs: urn:ogc:def:crs:EPSG::6668
```

### 座標の入出力

#### クエリ時（入力）

ジオクエリの座標は指定したCRSで解釈されます：

```http
# JGD2011座標で近傍検索
GET /v2/entities?georel=near;maxDistance:5000&geometry=point&coords=35.6812,139.7671&crs=EPSG:6668
```

#### エンティティ作成時

エンティティ作成時に `crs` パラメータを指定すると、入力座標が指定CRSとして解釈され、内部的にWGS84に変換されて保存されます：

```bash
# Web Mercator座標でエンティティを作成
curl -X POST "http://localhost:3000/v2/entities?crs=EPSG:3857" \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -d '{
    "id": "Store1",
    "type": "Store",
    "location": {
      "type": "geo:json",
      "value": {
        "type": "Point",
        "coordinates": [15559764.8, 4252367.9]
      }
    }
  }'
```

#### レスポンス時（出力）

取得時に `crs` パラメータを指定すると、座標が指定CRSに変換されて返却されます：

```bash
# JGD2011座標で取得
curl "http://localhost:3000/v2/entities/Store1?crs=EPSG:6668" \
  -H "Fiware-Service: smartcity"
```

### 座標変換の精度

| 変換 | 精度 |
|------|------|
| WGS84 ↔ JGD2011 | 数cm〜十数cm程度 |
| WGS84 ↔ Web Mercator | 計算精度に依存（緯度±85度内） |

### 使用例

#### NGSIv2での使用例

```bash
# JGD2011座標でエンティティを作成
curl -X POST "http://localhost:3000/v2/entities?crs=EPSG:6668" \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -d '{
    "id": "TokyoTower",
    "type": "Landmark",
    "name": { "type": "Text", "value": "東京タワー" },
    "location": {
      "type": "geo:json",
      "value": {
        "type": "Point",
        "coordinates": [139.745438, 35.658581]
      }
    }
  }'

# Web Mercator座標で取得
curl "http://localhost:3000/v2/entities/TokyoTower?crs=EPSG:3857" \
  -H "Fiware-Service: smartcity"
```

#### NGSI-LDでの使用例

```bash
# URN形式でCRSを指定してエンティティを作成
curl -X POST "http://localhost:3000/ngsi-ld/v1/entities?crs=urn:ogc:def:crs:EPSG::6668" \
  -H "Content-Type: application/ld+json" \
  -H "Fiware-Service: smartcity" \
  -d '{
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
    "id": "urn:ngsi-ld:Landmark:TokyoTower",
    "type": "Landmark",
    "name": { "type": "Property", "value": "東京タワー" },
    "location": {
      "type": "GeoProperty",
      "value": {
        "type": "Point",
        "coordinates": [139.745438, 35.658581]
      }
    }
  }'

# JGD2011座標で一覧取得
curl "http://localhost:3000/ngsi-ld/v1/entities?type=Landmark&crs=EPSG:6668" \
  -H "Fiware-Service: smartcity"
```

### エラー

| エラー | HTTPコード | 説明 |
|--------|-----------|------|
| Unsupported CRS | 400 | サポートされていないCRSコードを指定 |
| Invalid CRS format | 400 | 不正なCRS形式を指定 |
| Coordinates out of range | 400 | Web Mercatorで緯度±85度を超える座標 |

### 制限事項

- Web Mercator（EPSG:3857）は緯度±85度を超える領域をサポートしていません
- 内部的にはすべての座標をWGS84で保存します
- 座標変換には [proj4](https://github.com/proj4js/proj4js) ライブラリを使用しています

### 参考情報

- [OGC API Features CRS Extension](https://docs.ogc.org/is/18-058r1/18-058r1.html)
- [EPSG Geodetic Parameter Registry](https://epsg.io/)
- [ETSI NGSI-LD CRS Specification](https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/01.08.01_60/gs_CIM009v010801p.pdf)

---

## データカタログ API

エンティティタイプ情報を DCAT-AP 形式で出力し、CKAN ハーベスト対応エンドポイントを提供します。

### DCAT-AP カタログ

```http
GET /catalog
```

DCAT-AP 形式のカタログ全体を JSON-LD で出力します。

**レスポンス例**

```json
{
  "@context": {
    "dcat": "http://www.w3.org/ns/dcat#",
    "dct": "http://purl.org/dc/terms/",
    "foaf": "http://xmlns.com/foaf/0.1/"
  },
  "@type": "dcat:Catalog",
  "@id": "urn:ngsi-ld:Catalog:default",
  "dct:title": "Context Data Catalog",
  "dct:publisher": {
    "@type": "foaf:Organization",
    "foaf:name": "GeonicDB"
  },
  "dcat:dataset": [...]
}
```

### データセット一覧

```http
GET /catalog/datasets
```

データセット一覧を DCAT 形式で出力します。

**クエリパラメータ**

| パラメータ | 説明 |
|-----------|------|
| `limit` | 取得するデータセット数 |
| `offset` | スキップするデータセット数 |

### 個別データセット

```http
GET /catalog/datasets/{datasetId}
```

個別のデータセット（エンティティタイプ）の詳細情報を出力します。

### サンプルデータ

```http
GET /catalog/datasets/{datasetId}/sample
```

データセットのサンプルデータを取得します。

**クエリパラメータ**

| パラメータ | 説明 | デフォルト |
|-----------|------|-----------|
| `limit` | 取得するサンプル数 | 5 |

### CKAN 互換 API

CKAN のデータカタログハーベスタと互換性のある API を提供します。

#### パッケージ一覧

```http
GET /catalog/ckan/package_list
```

すべてのパッケージ（データセット）の ID 一覧を取得します。

**レスポンス例**

```json
{
  "success": true,
  "result": ["room", "sensor"]
}
```

#### パッケージ詳細

```http
GET /catalog/ckan/package_show?id={package_id}
```

特定のパッケージの詳細情報を取得します。

**レスポンス例**

```json
{
  "success": true,
  "result": {
    "id": "room",
    "name": "room",
    "title": "Room",
    "num_resources": 2,
    "resources": [
      {
        "id": "room-0",
        "url": "/v2/entities?type=Room",
        "format": "JSON"
      }
    ]
  }
}
```

#### パッケージ一覧（リソース付き）

```http
GET /catalog/ckan/current_package_list_with_resources
```

ページネーション対応のパッケージ一覧（リソース情報付き）を取得します。

**クエリパラメータ**

| パラメータ | 説明 |
|-----------|------|
| `limit` | 取得するパッケージ数 |
| `offset` | スキップするパッケージ数 |

詳細は 外部連携ドキュメント を参照してください。

---

## CADDE連携

CADDE（Connector Architecture for Decentralized Data Exchange / 分野間データ連携基盤）コネクタとの連携機能を提供します。

### 概要

CADDEは、異なる分野間でのデータ連携を実現する日本のデータ連携アーキテクチャです。本Context BrokerはCADDEコネクタからのリクエストを受け付け、来歴情報（プロベナンス）を付与したレスポンスを返します。

### 有効化

CADDE機能はデフォルトで無効です。Admin API (`PUT /admin/cadde`) を使用して設定を管理します：

```bash
# CADDE設定を有効化
curl -X PUT "https://api.example.com/admin/cadde" \
  -H "Authorization: Bearer <super_admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "authEnabled": false,
    "defaultProvider": "my-provider"
  }'
```

| 設定項目 | デフォルト | 説明 |
|----------|-----------|------|
| `enabled` | `false` | CADDE機能の有効化 |
| `authEnabled` | `false` | Bearer認証の有効化 |
| `defaultProvider` | - | デフォルトプロバイダID |
| `jwtIssuer` | - | JWT検証時の期待されるissuer（iss）クレーム |
| `jwtAudience` | - | JWT検証時の期待されるaudience（aud）クレーム |
| `jwksUrl` | - | 署名検証用のJWKSエンドポイントURL（HTTPS必須） |

設定はMongoDBに保存されるため、デプロイ後にAPI経由で動的に変更可能です。

### リクエストヘッダー

CADDEコネクタからのリクエストには以下のヘッダーが含まれます：

| ヘッダー | 必須 | 説明 |
|---------|------|------|
| `x-cadde-resource-url` | - | アクセス対象のリソースURL |
| `x-cadde-resource-api-type` | - | APIタイプ（例: `api/ngsi`） |
| `x-cadde-provider` | - | データ提供者ID |
| `x-cadde-options` | - | 追加オプション（テナントヘッダー等） |

### x-cadde-options形式

`x-cadde-options` ヘッダーでテナント情報等を指定できます：

```text
x-cadde-options: Fiware-Service:smartcity, Fiware-ServicePath:/sensors
```

このヘッダーで指定された値は、通常のHTTPヘッダーよりも優先されます。

### 来歴（プロベナンス）レスポンスヘッダー

CADDEリクエストに対するレスポンスには、以下の来歴ヘッダーが付与されます：

| ヘッダー | 説明 |
|---------|------|
| `x-cadde-provenance-id` | リクエストの一意識別子（Fiware-Correlatorを使用） |
| `x-cadde-provenance-timestamp` | レスポンス生成時刻（ISO 8601形式） |
| `x-cadde-provenance-provider` | データ提供者ID |
| `x-cadde-provenance-resource-url` | アクセスされたリソースURL |

### 認証

`CADDE_AUTH_ENABLED=true` の場合、CADDEリクエストにはBearer認証が必要です：

```text
Authorization: Bearer <token>
```

トークンが存在しない場合、`401 Unauthorized` エラーが返されます。

#### JWT検証（オプション）

`CADDE_JWKS_URL` を設定すると、Bearerトークンの完全なJWT検証が有効になります：

| 機能 | 説明 |
|------|------|
| **署名検証** | RS256またはES256アルゴリズムをサポート。JWKSエンドポイントから公開鍵を自動取得 |
| **有効期限検証** | `exp`（有効期限）クレームを検証し、期限切れトークンを拒否 |
| **発行時刻検証** | `iat`（発行時刻）クレームを検証し、未来に発行されたトークンを拒否 |
| **issuer検証** | `CADDE_JWT_ISSUER` が設定されている場合、`iss` クレームを検証 |
| **audience検証** | `CADDE_JWT_AUDIENCE` が設定されている場合、`aud` クレームを検証 |

**設定例：**

```bash
# Admin API経由で完全なJWT検証を有効化
curl -X PUT "https://api.example.com/admin/cadde" \
  -H "Authorization: Bearer <super_admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "authEnabled": true,
    "jwtIssuer": "https://auth.example.com",
    "jwtAudience": "my-api",
    "jwksUrl": "https://auth.example.com/.well-known/jwks.json"
  }'
```

**エラーレスポンス：**

JWT検証失敗時は、詳細なエラーメッセージが返されます：

| エラー | 説明 |
|--------|------|
| `Malformed JWT token` | トークン形式が不正 |
| `Invalid token signature` | 署名が無効 |
| `Token has expired` | トークンが有効期限切れ |
| `Invalid token issuer` | issuerクレームが一致しない |
| `Invalid token audience` | audienceクレームが一致しない |
| `Unsupported signing algorithm` | サポートされていないアルゴリズム（RS256/ES256以外） |
| `Unable to fetch signing keys` | JWKSエンドポイントへのアクセスに失敗 |
| `Signing key not found` | 指定されたkidの鍵がJWKSに存在しない |

**注意：** `jwksUrl` が設定されていない場合、トークンの存在確認のみが行われます（後方互換性のため）。

### 使用例

```bash
# CADDEヘッダー付きでエンティティを取得
curl "http://localhost:3000/v2/entities" \
  -H "x-cadde-resource-url: http://localhost:3000/v2/entities" \
  -H "x-cadde-resource-api-type: api/ngsi" \
  -H "x-cadde-provider: provider-001" \
  -H "x-cadde-options: Fiware-Service:smartcity, Fiware-ServicePath:/"

# レスポンスヘッダー例:
# x-cadde-provenance-id: 550e8400-e29b-41d4-a716-446655440000
# x-cadde-provenance-timestamp: 2026-01-26T12:00:00.000Z
# x-cadde-provenance-provider: provider-001
# x-cadde-provenance-resource-url: https://localhost/v2/entities
```

### NGSI-LD APIでの使用

NGSI-LD APIでも同様にCADDEヘッダーを使用できます：

```bash
curl "http://localhost:3000/ngsi-ld/v1/entities" \
  -H "x-cadde-resource-url: http://localhost:3000/ngsi-ld/v1/entities" \
  -H "x-cadde-resource-api-type: api/ngsi-ld" \
  -H "x-cadde-provider: ld-provider" \
  -H "x-cadde-options: Fiware-Service:smartcity"
```

### CADDE Connector v4 API

CADDEコネクタv4仕様に準拠した専用エンドポイントです（CADDE設定が有効時のみ利用可能、`PUT /admin/cadde` で設定）。

参考: https://github.com/CADDE-sip/connector

#### エンドポイント一覧

| Method | Path | Description |
|--------|------|-------------|
| GET | `/cadde/api/v4/catalog` | カタログ検索（横断検索/詳細検索） |
| GET | `/cadde/api/v4/entities` | NGSIデータ交換 |

#### カタログ検索（`/cadde/api/v4/catalog`）

`x-cadde-search` ヘッダーで検索タイプを指定します：

| 検索タイプ | ヘッダー値 | 説明 |
|-----------|-----------|------|
| 横断検索 | `x-cadde-search: meta` | データセット一覧をCKAN形式で返却（`q`パラメータでキーワードフィルタ可能） |
| 詳細検索 | `x-cadde-search: detail` | 個別データセットの詳細を返却（`id`または`fq`パラメータで指定） |

レスポンスにはCADDE固有フィールドが追加されます：
- `caddec_dataset_id_for_detail`: 詳細検索用のデータセットID
- `caddec_provider_id`: プロバイダID（`CADDE_DEFAULT_PROVIDER`が設定されている場合）
- `caddec_resource_type`: リソースタイプ（`api/ngsi`）

```bash
# 横断検索
curl "http://localhost:3000/cadde/api/v4/catalog?q=sensor" \
  -H "x-cadde-search: meta" \
  -H "x-cadde-resource-url: https://example.com/cadde/api/v4/catalog" \
  -H "Fiware-Service: smartcity"

# 詳細検索
curl "http://localhost:3000/cadde/api/v4/catalog?id=sensor" \
  -H "x-cadde-search: detail" \
  -H "x-cadde-resource-url: https://example.com/cadde/api/v4/catalog" \
  -H "Fiware-Service: smartcity"
```

#### NGSIデータ交換（`/cadde/api/v4/entities`）

`x-cadde-resource-url` ヘッダーからクエリパラメータを解析してエンティティを取得します。

| ヘッダー | 必須 | 説明 |
|---------|------|------|
| `x-cadde-resource-url` | ✅ | リソースURL（type, id, q, attrs, limit, offset をクエリパラメータとして含む） |
| `x-cadde-resource-api-type` | - | レスポンス形式：`api/ngsi`（デフォルト）または `api/ngsi-ld` |
| `x-cadde-provider` | - | データ提供者ID |

```bash
# NGSIv2形式でエンティティを取得
curl "http://localhost:3000/cadde/api/v4/entities" \
  -H "x-cadde-resource-url: https://example.com/v2/entities?type=Sensor&q=temperature>20" \
  -H "x-cadde-resource-api-type: api/ngsi" \
  -H "x-cadde-provider: provider-001" \
  -H "Fiware-Service: smartcity"

# NGSI-LD形式でエンティティを取得
curl "http://localhost:3000/cadde/api/v4/entities" \
  -H "x-cadde-resource-url: https://example.com/ngsi-ld/v1/entities?type=Sensor" \
  -H "x-cadde-resource-api-type: api/ngsi-ld" \
  -H "x-cadde-provider: provider-001" \
  -H "Fiware-Service: smartcity"
```

#### エラーレスポンス形式

CADDE v4エンドポイントのエラーレスポンスは以下の形式です：

```json
{ "detail": "Resource not found", "status": 404 }
```

#### 認証

CADDE v4エンドポイントはGeonicDBの認証（`requireAuth`）をバイパスします。認証はCADDE JWT検証（`processCaddeRequestAsync`）が担当します。

### 参考情報

- [CADDE（分野間データ連携基盤）](https://www.cio.go.jp/cadde)
- [CADDE-sip/connector](https://github.com/CADDE-sip/connector)
- [DATA-EX](https://data-ex.jp/)

---

## イベントストリーミング

WebSocket API Gateway を使用したリアルタイムのエンティティ変更ストリーミングです。`EVENT_STREAMING_ENABLED=true` で有効になります。

### 接続

```text
wss://{api-id}.execute-api.{region}.amazonaws.com/{stage}?tenant={tenantName}
```

### クライアントメッセージ

| アクション | 説明 |
|-----------|------|
| `subscribe` | エンティティタイプ/IDパターンでフィルタ設定 |
| `ping` | キープアライブ（`pong` 応答） |

### サーバーイベント

| タイプ | 説明 |
|--------|------|
| `entityCreated` | エンティティが作成された |
| `entityUpdated` | エンティティが更新された |
| `entityDeleted` | エンティティが削除された |

詳細は [Event Streaming ドキュメント](../features/subscriptions.md) を参照してください。

---

## エラーレスポンス

### NGSIv2 エラー形式

```json
{
  "error": "NotFound",
  "description": "The requested entity has not been found"
}
```

### NGSI-LD エラー形式 (RFC 7807 ProblemDetails)

NGSI-LD API のエラーレスポンスは [RFC 7807](https://tools.ietf.org/html/rfc7807) ProblemDetails 形式で返されます。
Content-Type は `application/json` です（ETSI GS CIM 009 仕様に準拠するため、RFC 7807 の `application/problem+json` ではなく標準 JSON MIME タイプを使用します）。

```json
{
  "type": "https://uri.etsi.org/ngsi-ld/errors/ResourceNotFound",
  "title": "Resource Not Found",
  "status": 404,
  "detail": "Entity urn:ngsi-ld:Room:001 not found"
}
```

### HTTP ステータスコード

| コード | 説明 |
|--------|------|
| `200` | 成功（データあり） |
| `201` | 作成成功 |
| `204` | 成功（データなし） |
| `207` | 部分成功（バッチ操作） |
| `400` | 不正なリクエスト |
| `403` | アクセス禁止（認可エラー） |
| `404` | リソースが見つからない |
| `405` | メソッド不許可（NGSI-LD、`Allow` ヘッダー付き） |
| `409` | 競合（既に存在する等） |
| `500` | サーバー内部エラー |

---

## 実装状況

### 実装済み機能

| 機能 | NGSIv2 | NGSI-LD |
|------|--------|---------|
| エンティティ CRUD | ✅ | ✅ |
| 属性操作 | ✅ | ✅ |
| 属性値の直接取得・更新 | ✅ | - |
| バッチ操作 | ✅ | ✅ |
| サブスクリプション（HTTP通知） | ✅ | ✅ |
| サブスクリプション（MQTT通知） | ✅ | ✅ |
| イベントストリーミング（WebSocket） | ✅ | ✅ |
| エンティティタイプ | ✅ | - |
| クエリ言語 (q パラメータ) | ✅ | ✅ |
| ソート (orderBy, orderDirection) | ✅ | ✅ |
| メタデータ制御 (metadata / sysAttrs) | ✅ | ✅ |
| ジオクエリ (coveredBy, within, intersects, disjoint) | ✅ | ✅ |
| 空間ID検索 (ZFXY形式) | ✅ | ✅ |
| GeoJSON出力 | ✅ | ✅ |
| 座標参照系（CRS）変換 | ✅ | ✅ |
| マルチテナンシー | ✅ | ✅ |
| ページネーション | ✅ | ✅ |
| keyValues 形式 | ✅ | ✅ |
| 登録（Registrations） | ✅ | ✅ |
| コンテキストプロバイダー（フェデレーション/クエリ転送） | ✅ | ✅ |
| コンテキストプロバイダー（更新転送） | ✅ | ✅ |
| CADDE連携 | ✅ | ✅ |
| 認証 API（JWT ベース） | ✅ | ✅ |
| ユーザー・テナント管理 API | ✅ | ✅ |
| `/version` エンドポイント | ✅ | - |
| `/.well-known/ngsi-ld` | - | ✅ |
| ヘルスチェック (`/health`) | ✅ | ✅ |

### 制限事項

| 機能 | 状態 | 備考 |
|------|------|------|
| `near` ジオクエリ（近接検索） | ✅ 対応 | Pointジオメトリのみ、`orderByDistance=true` で距離ソート・距離情報返却対応 |
| `minDistance` / `maxDistance` | ✅ 対応 | メートル単位で指定 |

---

## 使用例

### cURL を使用したエンティティ作成

```bash
curl -X POST "https://api.example.com/v2/entities" \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -H "Fiware-ServicePath: /buildings" \
  -d '{
    "id": "Room1",
    "type": "Room",
    "temperature": { "type": "Float", "value": 23.5 },
    "humidity": { "type": "Float", "value": 60.0 }
  }'
```

### エンティティの取得

```bash
curl -X GET "https://api.example.com/v2/entities/Room1" \
  -H "Fiware-Service: smartcity" \
  -H "Fiware-ServicePath: /buildings"
```

### 条件付きクエリ

```bash
curl -X GET "https://api.example.com/v2/entities?type=Room&q=temperature>25" \
  -H "Fiware-Service: smartcity"
```

### ジオクエリ（ポリゴン内検索）

```bash
curl -X GET "https://api.example.com/v2/entities?type=Place&georel=coveredBy&geometry=polygon&coords=34,138;34,141;37,141;37,138;34,138" \
  -H "Fiware-Service: smartcity"
```

### サブスクリプションの作成

```bash
curl -X POST "https://api.example.com/v2/subscriptions" \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -d '{
    "description": "High temperature alert",
    "subject": {
      "entities": [{ "type": "Room" }],
      "condition": {
        "attrs": ["temperature"],
        "expression": { "q": "temperature>30" }
      }
    },
    "notification": {
      "http": { "url": "https://webhook.example.com/alert" },
      "attrs": ["temperature", "id"]
    }
  }'
```

### NGSI-LD エンティティの作成

```bash
curl -X POST "https://api.example.com/ngsi-ld/v1/entities" \
  -H "Content-Type: application/ld+json" \
  -H "Fiware-Service: smartcity" \
  -d '{
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
    "id": "urn:ngsi-ld:Room:001",
    "type": "Room",
    "temperature": { "type": "Property", "value": 23.5 }
  }'
```

---

## エンドポイント一覧

このセクションでは、GeonicDB の全 API エンドポイントについて、ページネーション、認証認可、ステータスコードの情報をまとめています。

### API 分類

| API カテゴリ | ベースパス | 認証 | Content-Type |
|-------------|-----------|------|--------------|
| メタ/ヘルス | `/` | 不要*† | `application/json` |
| 認証 | `/auth` | 不要 | `application/json` |
| ユーザー | `/me` | 必須 | `application/json` |
| NGSIv2 | `/v2` | 必須* | `application/json` |
| NGSI-LD | `/ngsi-ld/v1` | 必須* | `application/ld+json` |
| Admin | `/admin` | 必須 (super_admin) | `application/json` |
| Catalog | `/catalog` | 必須* | `application/json` |

\* `AUTH_ENABLED=false` の場合は認証不要

† `/statistics`, `/cache/statistics`, `/metrics` は `AUTH_ENABLED=true` の場合認証必須

### 公開エンドポイント（メタ/ヘルス）

認証不要でアクセス可能なエンドポイントです。

| エンドポイント | メソッド | 説明 | 成功 | エラー |
|---------------|---------|------|------|--------|
| `/llms.txt` | GET | API ドキュメント (llms.txt) | 200 | - |
| `/version` | GET | FIWARE Orion 互換バージョン情報 | 200 | - |
| `/health` | GET | 基本ヘルスチェック | 200 | - |
| `/health/live` | GET | Kubernetes liveness probe | 200 | - |
| `/health/ready` | GET | Kubernetes readiness probe | 200 | 503 |
| `/.well-known/ngsi-ld` | GET | NGSI-LD API ディスカバリ | 200 | - |
| `/api.json` | GET | API リファレンス (JSON) | 200 | - |
| `/openapi.json` | GET | OpenAPI 3.0 仕様 | 200 | - |
| `/statistics` | GET | FIWARE Orion 互換統計情報（認証必須） | 200 | 401 |
| `/cache/statistics` | GET | キャッシュ統計（認証必須） | 200 | 401 |
| `/metrics` | GET | Prometheus メトリクス（認証必須） | 200 | 401 |
| `/tools.json` | GET | AI ツール定義 (Claude Tool Use / OpenAI Function Calling) | 200 | - |
| `/.well-known/ai-plugin.json` | GET | AI プラグインマニフェスト | 200 | - |
| `/mcp` | POST | MCP (Model Context Protocol) Streamable HTTP エンドポイント | 200 | 400, 405, 500 |

### 認証エンドポイント

- `/auth/*` は `AUTH_ENABLED=true` の場合のみ利用可能
- `/oauth/token` は `OAUTH_ENABLED=true` の場合のみ利用可能

| エンドポイント | メソッド | 説明 | 成功 | エラー |
|---------------|---------|------|------|--------|
| `/auth/login` | POST | ユーザーログイン（JWT） | 200 | 400, 401 |
| `/auth/refresh` | POST | トークンリフレッシュ | 200 | 400, 401 |
| `/auth/logout` | POST | ログアウト（全セッション無効化、認証必須） | 204 | 401 |
| `/oauth/token` | POST | OAuth トークン取得（M2M） | 200 | 400, 401 |

### ユーザーエンドポイント

認証済みユーザーが自身の情報を管理するエンドポイントです。

| エンドポイント | メソッド | 説明 | 成功 | エラー | 最小ロール |
|---------------|---------|------|------|--------|-----------|
| `/me` | GET | 自身のプロフィール取得 | 200 | 401 | user |
| `/me/password` | POST | パスワード変更 | 204 | 400, 401 | user |

### NGSIv2 / NGSI-LD エンドポイント

詳細なエンドポイント仕様は以下を参照してください：
- [NGSIv2 API リファレンス](./ngsiv2.md)
- [NGSI-LD API リファレンス](./ngsild.md)

### Admin API

テナントとユーザーの管理 API です。`super_admin` ロールのみアクセス可能です。

#### テナント管理

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/admin/tenants` | GET | テナント一覧取得 | 200 | 400, 401, 403 | ✅ (max: 100) |
| `/admin/tenants` | POST | テナント作成 | 201 | 400, 401, 403, 409 | - |
| `/admin/tenants/{tenantId}` | GET | テナント取得 | 200 | 401, 403, 404 | - |
| `/admin/tenants/{tenantId}` | PATCH | テナント更新 | 204 | 400, 401, 403, 404, 409 | - |
| `/admin/tenants/{tenantId}` | DELETE | テナント削除 | 204 | 401, 403, 404 | - |
| `/admin/tenants/{tenantId}/activate` | POST | テナント有効化 | 204 | 401, 403, 404 | - |
| `/admin/tenants/{tenantId}/deactivate` | POST | テナント無効化 | 204 | 401, 403, 404 | - |
| `/admin/tenants/{tenantId}/ip-restrictions` | GET | テナント IP 制限取得 | 200 | 401, 403, 404 | - |
| `/admin/tenants/{tenantId}/ip-restrictions` | PUT | テナント IP 制限更新 | 200 | 400, 401, 403, 404 | - |
| `/admin/tenants/{tenantId}/ip-restrictions` | DELETE | テナント IP 制限削除 | 204 | 401, 403, 404 | - |

#### ユーザー管理

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/admin/users` | GET | ユーザー一覧取得 | 200 | 400, 401, 403 | ✅ (max: 100) |
| `/admin/users` | POST | ユーザー作成 | 201 | 400, 401, 403, 409 | - |
| `/admin/users/{userId}` | GET | ユーザー取得 | 200 | 401, 403, 404 | - |
| `/admin/users/{userId}` | PATCH | ユーザー更新 | 204 | 400, 401, 403, 404, 409 | - |
| `/admin/users/{userId}` | DELETE | ユーザー削除 | 204 | 401, 403, 404 | - |
| `/admin/users/{userId}/activate` | POST | ユーザー有効化 | 204 | 401, 403, 404 | - |
| `/admin/users/{userId}/deactivate` | POST | ユーザー無効化 | 204 | 401, 403, 404 | - |
| `/admin/users/{userId}/unlock` | POST | ログインロック解除 | 200 | 400, 401, 403, 404 | - |

#### ポリシー管理（XACML 3.0 認可）

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/admin/policies` | GET | ポリシー一覧取得 | 200 | 400, 401, 403 | ✅ (max: 100) |
| `/admin/policies` | POST | ポリシー作成 | 201 | 400, 401, 403, 409 | - |
| `/admin/policies/{policyId}` | GET | ポリシー取得 | 200 | 401, 403, 404 | - |
| `/admin/policies/{policyId}` | PATCH | ポリシー更新（部分） | 200 | 400, 401, 403, 404 | - |
| `/admin/policies/{policyId}` | PUT | ポリシー置換 | 200 | 400, 401, 403, 404 | - |
| `/admin/policies/{policyId}` | DELETE | ポリシー削除 | 204 | 401, 403, 404 | - |
| `/admin/policies/{policyId}/activate` | POST | ポリシー有効化 | 200 | 401, 403, 404 | - |
| `/admin/policies/{policyId}/deactivate` | POST | ポリシー無効化 | 200 | 401, 403, 404 | - |

#### OAuth クライアント管理

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/admin/oauth-clients` | GET | OAuth クライアント一覧取得 | 200 | 400, 401, 403 | ✅ (max: 100) |
| `/admin/oauth-clients` | POST | OAuth クライアント作成 | 201 | 400, 401, 403 | - |
| `/admin/oauth-clients/{clientId}` | GET | OAuth クライアント取得 | 200 | 401, 403, 404 | - |
| `/admin/oauth-clients/{clientId}` | PATCH | OAuth クライアント更新 | 200 | 400, 401, 403, 404 | - |
| `/admin/oauth-clients/{clientId}` | DELETE | OAuth クライアント削除 | 204 | 401, 403, 404 | - |

#### CADDE 設定管理

CADDE（分野間データ連携基盤）の設定をAPI経由で管理します。設定はMongoDBに保存され、環境変数は不要です。

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/admin/cadde` | GET | CADDE 設定取得 | 200 | 401, 403 | - |
| `/admin/cadde` | PUT | CADDE 設定更新（upsert） | 200 | 400, 401, 403 | - |
| `/admin/cadde` | DELETE | CADDE 設定削除（無効化） | 204 | 401, 403 | - |

**リクエストボディ（PUT）**

```json
{
  "enabled": true,
  "authEnabled": true,
  "defaultProvider": "provider-001",
  "jwtIssuer": "https://auth.example.com",
  "jwtAudience": "my-api",
  "jwksUrl": "https://auth.example.com/.well-known/jwks.json"
}
```

| フィールド | 型 | 必須 | 説明 |
|-----------|------|------|------|
| `enabled` | boolean | ✅ | CADDE機能の有効/無効 |
| `authEnabled` | boolean | ✅ | Bearer認証の有効/無効 |
| `defaultProvider` | string | - | デフォルトプロバイダID |
| `jwtIssuer` | string | - | JWT issuerクレーム検証値 |
| `jwtAudience` | string | - | JWT audienceクレーム検証値 |
| `jwksUrl` | string | - | JWKS公開鍵エンドポイントURL（HTTPS必須） |

#### Rule Engine 管理

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/rules` | GET | ルール一覧取得 | 200 | 400, 401, 403 | ✅ (max: 100) |
| `/rules` | POST | ルール作成 | 201 | 400, 401, 403, 409 | - |
| `/rules/{ruleId}` | GET | ルール取得 | 200 | 401, 403, 404 | - |
| `/rules/{ruleId}` | PATCH | ルール更新 | 204 | 400, 401, 403, 404 | - |
| `/rules/{ruleId}` | DELETE | ルール削除 | 204 | 401, 403, 404 | - |
| `/rules/{ruleId}/activate` | POST | ルール有効化 | 200 | 401, 403, 404 | - |
| `/rules/{ruleId}/deactivate` | POST | ルール無効化 | 200 | 401, 403, 404 | - |

### Custom Data Models API

テナント固有のカスタムデータモデルを管理する API です。JWT 認証が必要で、XACML ポリシーベース認可により `tenant_admin` および `user` ロールもテナント内のカスタムデータモデルを管理できます。

**関連ドキュメント**: [SMART_DATA_MODELS.md](../features/smart-data-models.md)

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/custom-data-models` | GET | カスタムデータモデル一覧取得 | 200 | 400, 401, 403 | ✅ (max: 100) |
| `/custom-data-models` | POST | カスタムデータモデル作成 | 201 | 400, 401, 403, 409 | - |
| `/custom-data-models/{type}` | GET | カスタムデータモデル取得 | 200 | 401, 403, 404 | - |
| `/custom-data-models/{type}` | PATCH | カスタムデータモデル更新 | 200 | 400, 401, 403, 404 | - |
| `/custom-data-models/{type}` | DELETE | カスタムデータモデル削除 | 204 | 401, 403, 404 | - |

#### エンティティバリデーション

カスタムデータモデルが定義されている場合、エンティティの作成・更新時に自動的にバリデーションが実行されます。バリデーションは `isActive: true` のモデルに対してのみ適用されます。

**バリデーション内容:**

| チェック項目 | 説明 |
|------------|------|
| 必須フィールド | `required: true` の属性が存在するか |
| 型チェック | `valueType` に基づく型検証（string, number, integer, boolean, array, object, GeoJSON） |
| minLength / maxLength | 文字列の長さ制限 |
| minimum / maximum | 数値の範囲制限 |
| pattern | 正規表現パターンマッチ |
| enum | 許可される値のリスト |

バリデーション失敗時は `400 Bad Request` を返します:

```json
{
  "error": "BadRequest",
  "description": "Entity validation failed: temperature: Value (150) exceeds maximum (100)"
}
```

#### JSON Schema 自動生成

カスタムデータモデル作成・更新時に、`propertyDetails` から JSON Schema (Draft 2020-12) が自動生成され、レスポンスの `jsonSchema` フィールドに含まれます。手動で `jsonSchema` を指定することも可能です。

#### @context 解決拡張

NGSI-LD レスポンスにおいて、カスタムデータモデルに `contextUrl` が設定されている場合、エンティティの `@context` にカスタムコンテキストが自動的に含まれます（コアコンテキストと配列で返却）。

### Catalog API

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/catalog` | GET | DCAT-AP カタログ取得 | 200 | 401 | - |
| `/catalog/datasets` | GET | データセット一覧取得 | 200 | 400, 401 | ✅ (max: 1000) |
| `/catalog/datasets/{datasetId}` | GET | データセット取得 | 200 | 401, 404 | - |
| `/catalog/datasets/{datasetId}/sample` | GET | サンプルデータ取得 | 200 | 401, 404 | - |

### Vector Tiles API

| エンドポイント | メソッド | 説明 | 成功 | エラー |
|---------------|---------|------|------|--------|
| `/v2/tiles` | GET | TileJSON メタデータ取得 (NGSIv2) | 200 | 401 |
| `/v2/tiles/{z}/{x}/{y}.geojson` | GET | GeoJSON タイル取得 (NGSIv2) | 200 | 400, 401 |
| `/ngsi-ld/v1/tiles` | GET | TileJSON メタデータ取得 (NGSI-LD) | 200 | 401 |
| `/ngsi-ld/v1/tiles/{z}/{x}/{y}.geojson` | GET | GeoJSON タイル取得 (NGSI-LD) | 200 | 400, 401 |

### Event Streaming API

WebSocket を使用したリアルタイムのエンティティ変更ストリーミングです。`EVENT_STREAMING_ENABLED=true` で有効化されます。

| エンドポイント | プロトコル | 説明 |
|---------------|-----------|------|
| `wss://{api-id}.execute-api.{region}.amazonaws.com/{stage}?tenant={name}` | WebSocket | エンティティ変更イベントのストリーミング（認証は `Authorization` ヘッダーで送信） |

詳細は [Event Streaming ドキュメント](../features/subscriptions.md) を参照してください。

### アクセス権限まとめ

| API カテゴリ | user | tenant_admin | super_admin |
|-------------|------|--------------|-------------|
| 公開エンドポイント | ✅ | ✅ | ✅ |
| `/auth/*` | ✅ | ✅ | ✅ |
| `/me/*` | ✅ | ✅ | ✅ |
| `/v2/*` | ✅ (自テナント) | ✅ (自テナント) | ✅ (全テナント) |
| `/ngsi-ld/*` | ✅ (自テナント) | ✅ (自テナント) | ✅ (全テナント) |
| `/catalog/*` | ✅ (自テナント) | ✅ (自テナント) | ✅ (全テナント) |
| `/admin/*` | ❌ | ❌ | ✅ |
| `/custom-data-models` | ✅ (自テナント) | ✅ (自テナント) | ✅ (全テナント) |
| `/rules` | ❌ | ✅ (自テナント) | ✅ (全テナント) |
| WebSocket | ✅ (自テナント) | ✅ (自テナント) | ✅ (全テナント) |

---

## 関連リンク

- [FIWARE NGSI v2 Specification](https://fiware.github.io/specifications/ngsiv2/stable/)
- [ETSI NGSI-LD Specification](https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/01.06.01_60/gs_CIM009v010601p.pdf)
- [FIWARE Orion Context Broker Documentation](https://fiware-orion.readthedocs.io/)
- [IPA 空間IDガイドライン](https://www.ipa.go.jp/digital/architecture/guidelines/4dspatio-temporal-guideline.html)
- [デジタル庁 空間ID](https://www.digital.go.jp/policies/mobility_and_infrastructure/spatial-id)
- [RFC 7946 GeoJSON](https://datatracker.ietf.org/doc/html/rfc7946)
