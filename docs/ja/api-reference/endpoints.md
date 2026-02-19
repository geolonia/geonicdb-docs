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
- [空間 ID 検索](#空間-id-検索)
- [GeoJSON 出力](#geojson-出力)
- [ベクトルタイル](#ベクトルタイル)
- [座標参照系（CRS）](#座標参照系crs)
- [データカタログ API](#データカタログ-api)
- [CADDE 連携](#cadde-連携)
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
| `Fiware-ServicePath` | 推奨 | テナント内の階層パス（`/` で始まる） | `/`（クエリ時は `/#` 相当） |
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
| `super_admin` | スーパー管理者 | 全テナント・全ユーザーの管理、テナント作成 / 削除 |
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

**注意**: パスワード変更後、既存のアクセストークン# API リファレンス

| エンドポイント | メソッド | 説明 | 成功 | エラー | 必要なロール |
|---------------|---------|------|------|--------|-------------|
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

#### ポリシー管理 (XACML 3.0 認可)

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/admin/policies` | GET | ポリシー一覧取得 | 200 | 400, 401, 403 | ✅ (max: 100) |
| `/admin/policies` | POST | ポリシー作成 | 201 | 400, 401, 403, 409 | - |
| `/admin/policies/{policyId}` | GET | ポリシー取得 | 200 | 401, 403, 404 | - |
| `/admin/policies/{policyId}` | PATCH | ポリシー更新 (部分) | 200 | 400, 401, 403, 404 | - |
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

CADDE (分野間データ連携基盤) の設定を API 経由で管理します。設定は MongoDB に保存され、環境変数は不要です。

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|---------------|---------|------|------|--------|-----------------|
| `/admin/cadde` | GET | CADDE 設定取得 | 200 | 401, 403 | - |
| `/admin/cadde` | PUT | CADDE 設定更新 (upsert) | 200 | 400, 401, 403 | - |
| `/admin/cadde` | DELETE | CADDE 設定削除 (無効化) | 204 | 401, 403 | - |

**リクエストボディ (PUT)**

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
| `enabled` | boolean | ✅ | CADDE 機能の有効 / 無効 |
| `authEnabled` | boolean | ✅ | Bearer 認証の有効 / 無効 |
| `defaultProvider` | string | - | デフォルトプロバイダ ID |
| `jwtIssuer` | string | - | JWT issuer クレーム検証値 |
| `jwtAudience` | string | - | JWT audience クレーム検証値 |
| `jwksUrl` | string | - | JWKS 公開鍵エンドポイント URL (HTTPS 必須) |

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
| 型チェック | `valueType` に基づく型検証 (string, number, integer, boolean, array, object, GeoJSON) |
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

NGSI-LD レスポンスにおいて、カスタムデータモデルに `contextUrl` が設定されている場合、エンティティの `@context` にカスタムコンテキストが自動的に含まれます (コアコンテキストと配列で返却)。

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
| `wss://{api-id}.execute-api.{region}.amazonaws.com/{stage}?tenant={name}` | WebSocket | エンティティ変更イベントのストリー