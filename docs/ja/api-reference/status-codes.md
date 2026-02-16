---
title: ステータスコード
description: GeonicDB の全 API エンドポイントで使用される HTTP ステータスコードとエラーレスポンスフォーマット。
outline: deep
---

# ステータスコード

このページでは、GeonicDB API で使用されるすべての HTTP ステータスコードとエラーレスポンスフォーマットを解説します。

## 成功レスポンス

| ステータスコード | 説明 | 使用箇所 |
|---------------|------|---------|
| `200 OK` | リクエスト成功 | GET リクエスト、ログイン、一部の更新 |
| `201 Created` | リソース作成完了 | エンティティ、サブスクリプション等の POST 作成 |
| `204 No Content` | 成功、レスポンスボディなし | DELETE、PATCH、PUT 操作 |
| `207 Multi-Status` | 部分的成功（NGSI-LD バッチ） | 結果が混在するバッチ操作 |

### 201 Created — Location ヘッダー

リソースが作成されると、`Location` ヘッダーに新しいリソースの URL が含まれます：

```text
HTTP/1.1 201 Created
Location: /v2/entities/urn:ngsi-ld:Room:001
```

## クライアントエラー

### 400 Bad Request

リクエスト構文の不正またはバリデーションエラー。

| シナリオ | エラーメッセージ |
|---------|---------------|
| 必須フィールドの欠落 | `{field} is required` |
| 不正な JSON | `Invalid JSON` |
| 不正なエンティティ ID | `Invalid entity id` |
| 不正な属性値 | `Invalid attribute value` |
| 不正なページネーションパラメータ | `limit must be a valid integer` |
| 不正なジオクエリ | `Invalid georel value` |
| 不正な座標 | 緯度/経度が範囲外 |

### 401 Unauthorized

認証エラー — 認証情報が欠落しているか不正。

| シナリオ | エラーメッセージ |
|---------|---------------|
| Authorization ヘッダーなし | `Authorization header required` |
| 不正なトークン | `Invalid token` |
| 有効期限切れのトークン | `Token expired` |
| 不正な認証情報 | `Invalid credentials` |
| 無効化されたユーザー | `User is deactivated` |
| 無効化されたテナント | `Tenant is deactivated` |

### 403 Forbidden

認可エラー — 認証済みだが権限不足。

| シナリオ | エラーメッセージ |
|---------|---------------|
| 不十分なロール | `Forbidden` |
| IP 制限 | `Access denied from this IP` |
| クロステナントアクセス | `Access denied to this tenant` |
| XACML ポリシー拒否 | `Access denied by policy` |

### 404 Not Found

リソースが存在しない。

| シナリオ | エラーメッセージ |
|---------|---------------|
| エンティティが見つからない | `Entity not found` |
| サブスクリプションが見つからない | `Subscription not found` |
| 属性が見つからない | `Attribute not found` |
| ユーザーが見つからない | `User not found` |
| テナントが見つからない | `Tenant not found` |
| ポリシーが見つからない | `Policy {policyId} not found` |

### 405 Method Not Allowed

エンドポイントでサポートされていない HTTP メソッド。レスポンスには許可されたメソッドを示す `Allow` ヘッダーが含まれます。

### 409 Conflict

リソースの競合。

| シナリオ | エラーメッセージ |
|---------|---------------|
| エンティティが既に存在 | `Entity already exists` |
| メールアドレスが既に存在 | `Email already exists` |
| テナント名が既に使用中 | `Tenant name already exists` |
| 複数のエンティティがマッチ | `More than one entity matches the query` |

### 411 Content-Length Required

リクエストに `Content-Length` ヘッダーが必要。

### 413 Request Entity Too Large

リクエストボディがサイズ制限を超過。

### 415 Unsupported Media Type

不正な `Content-Type` ヘッダー。

| API | 期待される Content-Type |
|-----|-----------------------|
| NGSIv2 | `application/json` |
| NGSI-LD | `application/ld+json` または `application/json` |

## サーバーエラー

### 500 Internal Server Error

予期しないサーバーエラー。

### 502 Bad Gateway

フェデレーションエラー — コンテキストプロバイダーがエラーを返したか、到達不能。

| シナリオ | エラーメッセージ |
|---------|---------------|
| 接続失敗 | `Failed to connect to context provider` |
| プロバイダーエラー | `Context provider returned error` |

### 503 Service Unavailable

サービスが準備できていない（例: JSON-LD コンテキストが利用不可）。

### 504 Gateway Timeout

コンテキストプロバイダーへのリクエストがタイムアウト。

## エラーレスポンスフォーマット

### NGSIv2 フォーマット

```json
{
  "error": "BadRequest",
  "description": "Invalid entity id",
  "details": {}
}
```

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `error` | string | はい | エラーコード |
| `description` | string | はい | エラーの説明 |
| `details` | object | いいえ | 追加のエラー詳細 |

### NGSI-LD フォーマット（RFC 7807 ProblemDetails）

```json
{
  "type": "https://uri.etsi.org/ngsi-ld/errors/InvalidRequest",
  "title": "Invalid Request",
  "status": 400,
  "detail": "Invalid entity id"
}
```

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `type` | string | はい | エラータイプ URI（ETSI NGSI-LD 仕様） |
| `title` | string | はい | エラータイトル |
| `status` | integer | はい | HTTP ステータスコード |
| `detail` | string | はい | エラーの説明 |

### NGSI-LD エラータイプ

| エラータイプ URI | ステータス | 説明 |
|----------------|----------|------|
| `https://uri.etsi.org/ngsi-ld/errors/InvalidRequest` | 400 | 不正なリクエスト |
| `https://uri.etsi.org/ngsi-ld/errors/ResourceNotFound` | 404 | リソースが見つからない |
| `https://uri.etsi.org/ngsi-ld/errors/AlreadyExists` | 409 | リソースが既に存在 |
| `https://uri.etsi.org/ngsi-ld/errors/OperationNotSupported` | 403 | 操作がサポートされていない |
| `https://uri.etsi.org/ngsi-ld/errors/MethodNotAllowed` | 405 | メソッドが許可されていない |
| `https://uri.etsi.org/ngsi-ld/errors/LdContextNotAvailable` | 503 | JSON-LD コンテキストが利用不可 |

### OAuth 2.0 フォーマット（RFC 6749）

`/oauth/token` エンドポイントは RFC 6749 エラーフォーマットを返します：

```json
{
  "error": "invalid_client",
  "error_description": "Client authentication failed"
}
```

| エラーコード | 説明 |
|------------|------|
| `invalid_request` | 必須パラメータの欠落または不正な値 |
| `invalid_client` | クライアント認証の失敗 |
| `invalid_grant` | グラントが不正または期限切れ |
| `unauthorized_client` | このグラントタイプに対してクライアントが認可されていない |
| `unsupported_grant_type` | グラントタイプがサポートされていない |
| `invalid_scope` | リクエストされたスコープが不正または許可されていない |

## エンドポイント別ステータスコード一覧

### NGSIv2 Entity API

| エンドポイント | 成功 | エラー |
|-------------|------|--------|
| `GET /v2/entities` | 200 | 400, 401 |
| `POST /v2/entities` | 201 | 400, 401, 409, 415 |
| `GET /v2/entities/{id}` | 200 | 400, 401, 404 |
| `DELETE /v2/entities/{id}` | 204 | 401, 404 |
| `PATCH /v2/entities/{id}/attrs` | 204 | 400, 401, 404, 415 |
| `POST /v2/entities/{id}/attrs` | 204 | 400, 401, 404, 415 |
| `PUT /v2/entities/{id}/attrs` | 204 | 400, 401, 404, 415 |

### NGSI-LD Entity API

| エンドポイント | 成功 | エラー |
|-------------|------|--------|
| `GET /ngsi-ld/v1/entities` | 200 | 400, 401, 405 |
| `POST /ngsi-ld/v1/entities` | 201 | 400, 401, 405, 409, 415 |
| `GET /ngsi-ld/v1/entities/{id}` | 200 | 400, 401, 404 |
| `DELETE /ngsi-ld/v1/entities/{id}` | 204 | 401, 404 |
| `PATCH /ngsi-ld/v1/entities/{id}` | 204 | 400, 401, 404, 415 |

### NGSI-LD Batch API

| エンドポイント | 成功 | エラー |
|-------------|------|--------|
| `POST /ngsi-ld/v1/entityOperations/create` | 201 (207) | 400, 401, 415 |
| `POST /ngsi-ld/v1/entityOperations/upsert` | 204 (207) | 400, 401, 415 |
| `POST /ngsi-ld/v1/entityOperations/update` | 204 (207) | 400, 401, 415 |
| `POST /ngsi-ld/v1/entityOperations/delete` | 204 (207) | 400, 401, 415 |
| `POST /ngsi-ld/v1/entityOperations/query` | 200 | 400, 401, 415 |

::: tip
バッチ操作は、一部の項目が成功し他が失敗した場合に `207 Multi-Status` を返します。レスポンスボディに各項目の詳細が含まれます。
:::

### Auth API

| エンドポイント | 成功 | エラー |
|-------------|------|--------|
| `POST /auth/login` | 200 | 400, 401 |
| `POST /auth/refresh` | 200 | 400, 401 |
| `GET /me` | 200 | 401 |
| `POST /me/password` | 204 | 400, 401 |
| `POST /oauth/token` | 200 | 400, 401 |

### Admin API

| エンドポイント | 成功 | エラー |
|-------------|------|--------|
| `GET /admin/tenants` | 200 | 400, 401, 403 |
| `POST /admin/tenants` | 201 | 400, 401, 403, 409 |
| `GET /admin/users` | 200 | 400, 401, 403 |
| `POST /admin/users` | 201 | 400, 401, 403, 409 |
| `GET /admin/policies` | 200 | 400, 401, 403 |
| `POST /admin/policies` | 201 | 400, 401, 403, 409 |

## 次のステップ

- [エンドポイント](/ja/api-reference/endpoints) — 完全なエンドポイントリファレンス
- [ページネーション](/ja/api-reference/pagination) — ページネーション仕様
