---
title: "API Common Specification"
description: "GeonicDB API common specification, authentication, and query parameters"
outline: deep
---
# GeonicDB Context Broker API ドキュメント

これは AWS Lambda 上で動作する FIWARE Orion 互換 Context Broker の API ドキュメントです。NGSIv2 と NGSI-LD の両方の API をサポートしています。

## 目次

- [概要](#概要)
- [認証とマルチテナンシー](#認証とマルチテナンシー)
- [ページネーション](#ページネーション)
- [認証 API](#認証-api)
- [メタエンドポイント](#メタエンドポイント)
- [NGSIv2 API](#ngsiv2-api) (→ [API_NGSIV2.md](./ngsiv2.md))
- [NGSI-LD API](#ngsi-ld-api) (→ [API_NGSILD.md](./ngsild.md))
- [クエリ言語](#クエリ言語)
- [地理空間クエリ](#地理空間クエリ)
- [空間 ID 検索](#空間-id-検索)
- [GeoJSON 出力](#geojson-出力)
- [ベクトルタイル](#ベクトルタイル)
- [座標参照系 (CRS)](#座標参照系-crs)
- [データカタログ API](#データカタログ-api)
- [CADDE 連携](#cadde-連携)
- [イベントストリーミング](#イベントストリーミング)
- [エラーレスポンス](#エラーレスポンス)
- [実装状況](#実装状況)

---

## 概要

この Context Broker は、FIWARE NGSI (Next Generation Service Interface) 仕様に準拠した RESTful API を提供します。

**関連ドキュメント:**
- [NGSIv2 / NGSI-LD 相互運用ガイド](../core-concepts/ngsiv2-vs-ngsild.md) - 両 API の相互運用性、型マッピング、ベストプラクティス
- [WebSocket イベントストリーミング](../features/subscriptions.md) - リアルタイムイベントサブスクリプション、実装例、ベストプラクティス

### ベース URL

```text
https://{api-gateway-url}/{stage}
```



### サポートされている API

| API バージョン | ベースパス | Content-Type |
|-------------|-----------|--------------|
| NGSIv2 | `/v2` | `application/json` |
| NGSI-LD | `/ngsi-ld/v1` | `application/ld+json` |

### OPTIONS メソッド

`OPTIONS` メソッドは全てのエンドポイントでサポートされています。CORS プリフライトリクエストに応答して、許可されているメソッドとヘッダーの情報を返します。

#### レスポンス形式

OPTIONS リクエストは `204 No Content` と以下のヘッダーを返します:

```http
OPTIONS /v2/entities/urn:ngsi-ld:Room:Room1

HTTP/1.1 204 No Content
Allow: GET, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Fiware-Service, Fiware-ServicePath, Authorization
Access-Control-Max-Age: 86400
```










NGSI-LD エンドポイントでは、追加で `Accept-Patch` ヘッダーも返されます:

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











### エンティティ ID の一意性 (GeonicDB 拡張)

> **GeonicDB 拡張**: この動作は、同じ ID で異なるタイプのエンティティを共存させることができる標準 NGSIv2 仕様とは異なります。

GeonicDB では、エンティティ ID は **テナント** (`Fiware-Service`) と **ServicePath** (`Fiware-ServicePath`) のスコープ内で一意です。エンティティの `type` は一意性制約の一部では**ありません**。

**主な動作:**

- 既存のエンティティと同じ ID でエンティティを作成すると (`type` が異なる場合でも) `409 AlreadyExists` が返されます
- バッチアップサート操作は `entityId` のみでエンティティをマッチングします (type は上書き可能)
- 同一 ID エンティティ間の型の曖昧性を解消するための NGSIv2 の `?type=` クエリパラメータは適用されなくなりました

この設計は、エンティティ ID が URI であり本質的に一意である NGSI-LD 仕様に準拠しています。両 API で ID の一意性を強制することで、GeonicDB は NGSIv2/NGSI-LD の相互運用性のための一貫したデータモデルを提供します。

---

## 認証とマルチテナンシー

### 必須ヘッダー

すべてのリクエストには、以下のヘッダーの指定が推奨されます:

| ヘッダー | 必須 | 説明 | デフォルト |
|--------|----------|-------------|---------|
| `Fiware-Service` | 推奨 | テナント名 (英数字とアンダースコアのみ) | `default` |
| `Fiware-ServicePath` | 推奨 | テナント内の階層パス (`/` で開始) | `/` (クエリでは `/#` と同等) |
| `Fiware-Correlator` | オプション | リクエストトレーシング用の相関 ID | 自動生成 |

### 使用例

```bash
curl -X GET "https://api.example.com/v2/entities" \
  -H "Fiware-Service: smartcity" \
  -H "Fiware-ServicePath: /buildings/floor1"
```





### テナント分離

- 異なる `Fiware-Service` 値のデータは完全に分離されます
- 同じテナント内では、`Fiware-ServicePath` を使用してデータを階層的に整理できます
- テナント名は自動的に小文字に変換されます

### ServicePathの仕様

[FIWARE Orion 仕様](https://fiware-orion.readthedocs.io/en/1.3.0/user/service_path/index.html)に準拠しています。

#### 基本形式

- `/` で始まる絶対パスのみ許可されます
- 英数字とアンダースコアのみ使用できます
- 最大 10 階層、各階層は最大 50 文字

```bash
# Retrieve entities at a specific path
curl "http://localhost:3000/v2/entities" \
  -H "Fiware-Service: smartcity" \
  -H "Fiware-ServicePath: /Madrid/Gardens"
```






#### 階層検索 (`/#`)

`/#` 接尾辞を使用すると、指定されたパスとすべての子パスを検索できます (**クエリ操作のみ**)。

```bash
# Search /Madrid/Gardens and all its child paths
curl "http://localhost:3000/v2/entities" \
  -H "Fiware-Service: smartcity" \
  -H "Fiware-ServicePath: /Madrid/Gardens/#"
```






#### 複数パス (カンマ区切り)

カンマで区切って複数のパスを同時に検索できます (最大 10 パス、**クエリ操作のみ**)。

```bash
# Search both /park1 and /park2
curl "http://localhost:3000/v2/entities" \
  -H "Fiware-Service: smartcity" \
  -H "Fiware-ServicePath: /park1, /park2"
```






#### デフォルト動作

| 操作 | ヘッダー省略時 | 説明 |
|-----------|------------------------|-------------|
| クエリ (GET) | `/` | ルートパスのみを検索 |
| 書き込み (POST/PUT/PATCH/DELETE) | `/` | ルートパスで作成/更新 |

**注意**: 書き込み操作では、単一の非階層パスのみ使用できます。`/#` や複数パスを指定するとエラーが返されます。

---

## ページネーション

すべてのリスト型 API エンドポイントでページネーションがサポートされています。

### パラメータ

| パラメータ | 説明 | デフォルト | 最大 |
|-----------|-------------|---------|---------|
| `limit` | 返す結果の最大数 | 20 | 1000 (管理 API: 100) |
| `offset` | スキップする結果の数 | 0 | - |

### レスポンスヘッダー

各 API タイプに応じて、総数を示すヘッダーが返されます:

| API | ヘッダー名 | 条件 |
|-----|-------------|-----------|
| NGSIv2 | `Fiware-Total-Count` | 常に返される (全リストエンドポイント) |
| NGSI-LD | `NGSILD-Results-Count` | 常に返される |
| 管理 API | `X-Total-Count` | 常に返される |
| カタログ API | `X-Total-Count` | 常に返される |

### Link ヘッダー

すべてのリストエンドポイントは [RFC 8288](https://www.rfc-editor.org/rfc/rfc8288) に準拠した `Link` ヘッダーを返し、次ページ (`rel="next"`) と前ページ (`rel="prev"`) の URL を提供します。結果が 1 ページに収まる場合、`Link` ヘッダーは返されません。

```http
Link: <https://api.example.com/v2/entities?limit=10&offset=20>; rel="next", <https://api.example.com/v2/entities?limit=10&offset=0>; rel="prev"
```



### バリデーション

無効なページネーションパラメータは `400 Bad Request` を返します:

| エラー条件 | エラーメッセージ |
|-----------------|---------------|
| 負の limit | `Invalid limit: must not be negative` |
| 負の offset | `Invalid offset: must not be negative` |
| limit=0 | `Invalid limit: must be greater than 0` |
| 最大値超過 | `Invalid limit: must not exceed 1000` |
| 非数値 | `Invalid limit: must be a valid integer` |

### 使用例

```bash
# Retrieve the second page (10 results per page)
curl "http://localhost:3000/v2/entities?limit=10&offset=10" \
  -H "Fiware-Service: smartcity"

# Retrieve with total count header
curl "http://localhost:3000/v2/entities?limit=10&options=count" \
  -H "Fiware-Service: smartcity"
```









### 注意事項

- `offset` が総数を超える場合、空の配列が返されます (エラーではありません)
- FIWARE Orion 仕様に準拠しています

---

## 認証 API

認証機能により、ユーザー認証とアクセス制御が可能になります。

### 有効化

認証はデフォルトで無効です。以下の環境変数で有効化できます。

**注意**: `AUTH_ENABLED=false` の場合、認証関連エンドポイント (`/auth/*`、`/me`、`/me/*`、`/admin/*`) は 404 を返します。

**重要**: `AUTH_ENABLED=true` の場合、NGSI API エンドポイント (`/v2/*`、`/ngsi-ld/*`、`/catalog/*`) へのアクセスには認証が必要です。認証なしでアクセスすると `401 Unauthorized` エラーが返されます。

| 環境変数 | デフォルト | 説明 |
|----------------------|---------|-------------|
| `AUTH_ENABLED` | `false` | 認証を有効化 |
| `JWT_SECRET` | - | JWT トークン署名用のシークレット (32 文字以上推奨) |
| `JWT_EXPIRES_IN` | `1h` | アクセストークンの有効期限 |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | リフレッシュトークンの有効期限 |
| `SUPER_ADMIN_EMAIL` | - | 環境変数で設定されるスーパー管理者のメールアドレス |
| `SUPER_ADMIN_PASSWORD` | - | 環境変数で設定されるスーパー管理者のパスワード |
| `ADMIN_ALLOWED_IPS` | - | 管理 API へのアクセスを許可する IP/CIDR (カンマ区切り) |

### ロールと権限

| ロール | 説明 | 権限 |
|------|-------------|-------------|
| `super_admin` | スーパー管理者 | `/admin/*`、`/auth/*`、`/me/*`、監視エンドポイントのみ。データ API (`/v2/*`、`/ngsi-ld/*`、`/catalog*`、`/rules*`) にはアクセス**できません** — 403 を返します |
| `tenant_admin` | テナント管理者 | 自身のテナント内のユーザーを管理 |
| `user` | 一般ユーザー | 自身のプロフィール表示とパスワード変更のみ |

### ログイン

```http
POST /auth/login
Content-Type: application/json
```




**リクエストボディ**

```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "tenantId": "target-tenant-id",
  "resourceScopes": [
    { "entityTypes": ["TemperatureSensor"], "ops": ["read", "write"] },
    { "entityTypes": ["HumiditySensor"], "attrs": ["humidity"], "ops": ["read"] }
  ]
}
```











| パラメータ | タイプ | 必須 | 説明 |
|-----------|------|----------|-------------|
| `email` | string | はい | メールアドレス |
| `password` | string | はい | パスワード |
| `tenantId` | string | いいえ | 指定した場合、そのテナントにスコープされた JWT を発行。省略時は主テナントがデフォルト |
| `resourceScopes` | ResourceScope[] | いいえ | エンティティレベルのアクセス制御スコープ。省略時はフルアクセス。詳細は AUTH.md を参照 |

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

### 現在のユーザー情報の取得

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
**注意**: パスワード変更後、既存のすべてのアクセストークンとリフレッシュトークンは無効化されます。新しいトークンを取得するために再度ログインしてください。

### ログアウト

```http
POST /auth/logout
Authorization: Bearer <accessToken>
```




すべてのセッションを無効化します。このユーザーに対して発行されたすべてのアクセストークンとリフレッシュトークンが即座に無効化されます。

**レスポンス**: __| `/admin/policies` | POST | ポリシーを作成 | 201 | 400, 401, 403, 409 | - |
| `/admin/policies/{policyId}` | GET | ポリシーを取得 | 200 | 401, 403, 404 | - |
| `/admin/policies/{policyId}` | PATCH | ポリシーを部分更新 | 200 | 400, 401, 403, 404 | - |
| `/admin/policies/{policyId}` | PUT | ポリシーを置換 | 200 | 400, 401, 403, 404 | - |
| `/admin/policies/{policyId}` | DELETE | ポリシーを削除 | 204 | 401, 403, 404 | - |
| `/admin/policies/{policyId}/activate` | POST | ポリシーを有効化 | 200 | 401, 403, 404 | - |
| `/admin/policies/{policyId}/deactivate` | POST | ポリシーを無効化 | 200 | 401, 403, 404 | - |

ポリシー Target `resources` で利用可能な **Resource Attributes**:

| attributeId | 説明 | ソース |
|-------------|-------------|--------|
| `path` | HTTP リクエストパス (例: `/v2/entities/Room1`) | リクエスト |
| `tenantService` | テナントサービス名 (`Fiware-Service` ヘッダー) | リクエスト |
| `entityId` | 対象エンティティ ID (例: `Room1`) | エンティティコンテキスト |
| `entityType` | 対象エンティティタイプ (例: `Room`) | リクエスト (自動抽出) / エンティティコンテキスト |
| `entityOwner` | エンティティ作成者の userId (`createdBy` フィールド) | エンティティコンテキスト |

> `entityType` は HTTP リクエストのパスレベルで自動的に抽出されます — `?type=` クエリパラメータまたはリクエストボディの `type` / `@type` フィールドから — エンティティレベルのチェックなしにエンティティタイプベースのアクセス制御を可能にします。`entityId` と `entityOwner` は、エンティティレベルの認可チェック (`requireEntityAuthz` 経由) でのみ利用可能です。

#### OAuth クライアント管理

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|----------|--------|-------------|---------|-------|------------|
| `/admin/oauth-clients` | GET | OAuth クライアント一覧を取得 | 200 | 400, 401, 403 | あり (最大: 100) |
| `/admin/oauth-clients` | POST | OAuth クライアントを作成 | 201 | 400, 401, 403 | - |
| `/admin/oauth-clients/{clientId}` | GET | OAuth クライアントを取得 | 200 | 401, 403, 404 | - |
| `/admin/oauth-clients/{clientId}` | PATCH | OAuth クライアントを更新 | 200 | 400, 401, 403, 404 | - |
| `/admin/oauth-clients/{clientId}` | DELETE | OAuth クライアントを削除 | 204 | 401, 403, 404 | - |

#### セルフサービス OAuth クライアント管理

ユーザーは自身の OAuth クライアントを管理できます。ユーザーあたり最大 5 クライアント。ロールによるスコープ制限が適用されます。

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|----------|--------|-------------|---------|-------|------------|
| `/me/oauth-clients` | GET | 自身の OAuth クライアント一覧を取得 | 200 | 400, 401 | あり (最大: 100) |
| `/me/oauth-clients` | POST | 自身の OAuth クライアントを作成 | 201 | 400, 401, 403 | - |
| `/me/oauth-clients/{clientId}` | DELETE | 自身の OAuth クライアントを削除 | 204 | 400, 401, 403, 404 | - |
| `/me/oauth-clients/{clientId}/regenerate-secret` | POST | 自身のクライアントシークレットを再生成 | 200 | 400, 401, 403, 404 | - |

#### API キー管理

`X-Api-Key` ヘッダー経由での認証用 API キーを管理します。キーは `gdb_` プレフィックス + 64 文字の 16 進数を使用します。保存時は SHA-256 でハッシュ化されます。`features.apiKeysEnabled` テナントフラグによって制御されます (デフォルトで有効; 無効化されると、作成と認証は 403 で拒否されます)。

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|----------|--------|-------------|---------|-------|------------|
| `/admin/api-keys` | POST | API キーを作成 | 201 | 400, 401, 403 | - |
| `/admin/api-keys` | GET | API キー一覧を取得 | 200 | 400, 401, 403 | あり (最大: 100) |
| `/admin/api-keys/{keyId}` | GET | API キーを取得 | 200 | 401, 403, 404 | - |
| `/admin/api-keys/{keyId}` | PATCH | API キーを更新 | 204 | 400, 401, 403, 404 | - |
| `/admin/api-keys/{keyId}` | DELETE | API キーを削除 | 204 | 401, 403, 404 | - |

#### セルフサービス API キー管理

ユーザーは自身の API キーを管理できます。ユーザーあたり最大 5 キー。

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|----------|--------|-------------|---------|-------|------------|
| `/me/api-keys` | POST | 自身の API キーを作成 | 201 | 400, 401, 403 | - |
| `/me/api-keys` | GET | 自身の API キー一覧を取得 | 200 | 400, 401, 403 | あり (最大: 100) |
| `/me/api-keys/{keyId}` | DELETE | 自身の API キーを削除 | 204 | 400, 401, 403, 404 | - |

#### CADDE 設定管理

API 経由で CADDE (分野間データ連携基盤) 設定を管理します。設定は MongoDB に保存され、環境変数は不要です。

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|----------|--------|-------------|---------|-------|------------|
| `/admin/cadde` | GET | CADDE 設定を取得 | 200 | 401, 403 | - |
| `/admin/cadde` | PUT | CADDE 設定を更新 (upsert) | 200 | 400, 401, 403 | - |
| `/admin/cadde` | DELETE | CADDE 設定を削除 (無効化) | 204 | 401, 403 | - |

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










| フィールド | タイプ | 必須 | 説明 |
|-------|------|----------|-------------|
| `enabled` | boolean | はい | CADDE 機能の有効化/無効化 |
| `authEnabled` | boolean | はい | Bearer 認証の有効化/無効化 |
| `defaultProvider` | string | - | デフォルトプロバイダー ID |
| `jwtIssuer` | string | - | JWT issuer クレーム検証値 |
| `jwtAudience` | string | - | JWT audience クレーム検証値 |
| `jwksUrl` | string | - | JWKS 公開鍵エンドポイント URL (HTTPS 必須) |

#### ルールエンジン管理

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|----------|--------|-------------|---------|-------|------------|
| `/rules` | GET | ルール一覧を取得 | 200 | 400, 401, 403 | あり (最大: 100) |
| `/rules` | POST | ルールを作成 | 201 | 400, 401, 403, 409 | - |
| `/rules/{ruleId}` | GET | ルールを取得 | 200 | 401, 403, 404 | - |
| `/rules/{ruleId}` | PATCH | ルールを更新 | 204 | 400, 401, 403, 404 | - |
| `/rules/{ruleId}` | DELETE | ルールを削除 | 204 | 401, 403, 404 | - |
| `/rules/{ruleId}/activate` | POST | ルールを有効化 | 200 | 401, 403, 404 | - |
| `/rules/{ruleId}/deactivate` | POST | ルールを無効化 | 200 | 401, 403, 404 | - |

### カスタムデータモデル API

テナント固有のカスタムデータモデルを管理するための API です。JWT 認証が必要です。XACML ポリシーベースの認可により、`tenant_admin` と `user` ロールが自テナント内でカスタムデータモデルを管理できます。

**関連ドキュメント**: [SMART_DATA_MODELS.md](../features/smart-data-models.md)

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|----------|--------|-------------|---------|-------|------------|
| `/custom-data-models` | GET | カスタムデータモデル一覧を取得 | 200 | 400, 401, 403 | あり (最大: 100) |
| `/custom-data-models` | POST | カスタムデータモデルを作成 | 201 | 400, 401, 403, 409 | - |
| `/custom-data-models/{type}` | GET | カスタムデータモデルを取得 | 200 | 401, 403, 404 | - |
| `/custom-data-models/{type}` | PATCH | カスタムデータモデルを更新 | 200 | 400, 401, 403, 404 | - |
| `/custom-data-models/{type}` | DELETE | カスタムデータモデルを削除 | 204 | 401, 403, 404 | - |

#### エンティティ検証

カスタムデータモデルが定義されている場合、エンティティの作成・更新時に自動的に検証が実行されます。検証は `isActive: true` を持つモデルにのみ適用されます。

**検証チェック:**

| チェック | 説明 |
|-------|-------------|
| 必須フィールド | `required: true` の属性が存在するか |
| タイプチェック | `valueType` に基づくタイプ検証 (string, number, integer, boolean, array, object, GeoJSON) |
| minLength / maxLength | 文字列長の制約 |
| minimum / maximum | 数値範囲の制約 |
| pattern | 正規表現パターンマッチ |
| enum | 許可される値のリスト |

検証失敗時は `400 Bad Request` を返します:

```json
{
  "error": "BadRequest",
  "description": "Entity validation failed: temperature: Value (150) exceeds maximum (100)"
}
```






#### 自動 JSON スキーマ生成

カスタムデータモデルが作成または更新されると、`propertyDetails` から JSON スキーマ (Draft 2020-12) が自動的に生成され、レスポンスの `jsonSchema` フィールドに含まれます。`jsonSchema` を手動で指定することも可能です。

#### @context 解決拡張

NGSI-LD レスポンスにおいて、カスタムデータモデルに `contextUrl` が設定されている場合、カスタムコンテキストがエンティティの `@context` に自動的に含まれます (コアコンテキストと共に配列として返されます)。

### カタログ API

| エンドポイント | メソッド | 説明 | 成功 | エラー | ページネーション |
|----------|--------|-------------|---------|-------|------------|
| `/catalog` | GET | DCAT-AP カタログを取得 | 200 | 401 | - |
| `/catalog/datasets` | GET | データセット一覧を取得 | 200 | 400, 401 | あり (最大: 1000) |
| `/catalog/datasets/{datasetId}` | GET | データセットを取得 | 200 | 401, 404 | - |
| `/catalog/datasets/{datasetId}/sample` | GET | サンプルデータを取得 | 200 | 401, 404 | - |

### ベクタータイル API

| エンドポイント | メソッド | 説明 | 成功 | エラー |
|----------|--------|-------------|---------|-------|
| `/v2/tiles` | GET | TileJSON メタデータを取得 (NGSIv2) | 200 | 401 |
| `/v2/tiles/{z}/{x}/{y}.geojson` | GET | GeoJSON タイルを取得 (NGSIv2) | 200 | 400, 401 |
| `/ngsi-ld/v1/tiles` | GET | TileJSON メタデータを取得 (NGSI-LD) | 200 | 401 |
| `/ngsi-ld/v1/tiles/{z}/{x}/{y}.geojson` | GET | GeoJSON タイルを取得 (NGSI-LD) | 200 | 400, 401 |

### イベントストリーミング API

WebSocket を使用したリアルタイムエンティティ変更スト