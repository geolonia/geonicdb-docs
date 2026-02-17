---
title: エンドポイント
description: GeonicDB の共通 API 仕様 — ヘッダー、コンテンツタイプ、CORS、テナントヘッダー、全 API エンドポイントの一覧。
outline: deep
---

# エンドポイント

このページでは、ヘッダー、コンテンツタイプ、完全なエンドポイントリファレンスなど、すべての GeonicDB API エンドポイントに共通する仕様を説明します。

## API カテゴリ

| カテゴリ | ベースパス | 認証 | Content-Type |
|---------|-----------|------|--------------|
| メタ / ヘルス | `/` | 不要 | `application/json` |
| 認証 | `/auth` | 不要 | `application/json` |
| ユーザー | `/me` | 必要 | `application/json` |
| NGSIv2 | `/v2` | 必要* | `application/json` |
| NGSI-LD | `/ngsi-ld/v1` | 必要* | `application/ld+json` |
| 管理 | `/admin` | 必要（super_admin） | `application/json` |
| カタログ | `/catalog` | 必要* | `application/json` |

\* 認証は `AUTH_ENABLED=true` の場合のみ必要。

## 共通ヘッダー

### リクエストヘッダー

| ヘッダー | 必須 | デフォルト | 説明 |
|---------|------|-----------|------|
| `Content-Type` | POST/PUT/PATCH で必要 | — | `application/json`（NGSIv2）または `application/ld+json`（NGSI-LD） |
| `Fiware-Service` | 推奨 | `default` | テナント識別子 |
| `Fiware-ServicePath` | 推奨 | `/` | 階層サービスパス |
| `Fiware-Correlator` | 任意 | 自動生成 | 分散トレーシング用のリクエスト相関 ID |
| `Authorization` | 認証有効時 | — | `Bearer {access_token}` |

### CORS ヘッダー

すべてのレスポンスに CORS ヘッダーが含まれます：

```text
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Fiware-Service, Fiware-ServicePath, Authorization, Link
Access-Control-Expose-Headers: Location, Fiware-Correlator, Fiware-Total-Count, NGSILD-Results-Count, X-Total-Count, Link
```

### OPTIONS メソッド

すべてのエンドポイントは CORS プリフライトリクエスト用の `OPTIONS` メソッドをサポートし、許可されたメソッドとヘッダーを含む `204 No Content` を返します。

NGSI-LD エンドポイントでは、追加で `Accept-Patch` ヘッダーが返されます：

```text
Accept-Patch: application/json, application/ld+json, application/merge-patch+json
```

## パブリックエンドポイント（メタ / ヘルス）

以下のエンドポイントは認証不要です。

| エンドポイント | メソッド | 説明 |
|-------------|--------|------|
| `/` | GET | llms.txt 形式の API ドキュメント（Markdown） |
| `/version` | GET | FIWARE Orion 互換のバージョン情報 |
| `/health` | GET | 基本的なヘルスチェック |
| `/health/live` | GET | Kubernetes liveness プローブ |
| `/health/ready` | GET | Kubernetes readiness プローブ（MongoDB チェック） |
| `/.well-known/ngsi-ld` | GET | NGSI-LD API ディスカバリ |
| `/api.json` | GET | JSON 形式の API リファレンス |
| `/openapi.json` | GET | OpenAPI 3.0 仕様 |
| `/statistics` | GET | FIWARE Orion 互換のサーバー統計 |
| `/cache/statistics` | GET | サブスクリプション・登録キャッシュ統計 |
| `/metrics` | GET | Prometheus exposition フォーマットのメトリクス |
| `/tools.json` | GET | AI ツール定義（Claude Tool Use / OpenAI Function Calling） |
| `/.well-known/ai-plugin.json` | GET | AI プラグインマニフェスト |
| `/mcp` | POST | MCP（Model Context Protocol）Streamable HTTP エンドポイント |

## NGSIv2 エンドポイント

| エンドポイント | メソッド | 説明 |
|-------------|--------|------|
| `/v2/entities` | GET | エンティティ一覧 |
| `/v2/entities` | POST | エンティティ作成 |
| `/v2/entities/{id}` | GET | エンティティ取得 |
| `/v2/entities/{id}` | DELETE | エンティティ削除 |
| `/v2/entities/{id}/attrs` | GET | エンティティ属性取得 |
| `/v2/entities/{id}/attrs` | POST | エンティティ属性追加 |
| `/v2/entities/{id}/attrs` | PATCH | エンティティ属性更新 |
| `/v2/entities/{id}/attrs` | PUT | エンティティ属性置換 |
| `/v2/entities/{id}/attrs/{attr}` | GET | 属性取得 |
| `/v2/entities/{id}/attrs/{attr}` | PUT | 属性更新 |
| `/v2/entities/{id}/attrs/{attr}` | DELETE | 属性削除 |
| `/v2/entities/{id}/attrs/{attr}/value` | GET | 属性値取得 |
| `/v2/entities/{id}/attrs/{attr}/value` | PUT | 属性値更新 |
| `/v2/subscriptions` | GET | サブスクリプション一覧 |
| `/v2/subscriptions` | POST | サブスクリプション作成 |
| `/v2/subscriptions/{id}` | GET | サブスクリプション取得 |
| `/v2/subscriptions/{id}` | PATCH | サブスクリプション更新 |
| `/v2/subscriptions/{id}` | DELETE | サブスクリプション削除 |
| `/v2/registrations` | GET | 登録一覧 |
| `/v2/registrations` | POST | 登録作成 |
| `/v2/registrations/{id}` | GET | 登録取得 |
| `/v2/registrations/{id}` | PATCH | 登録更新 |
| `/v2/registrations/{id}` | DELETE | 登録削除 |
| `/v2/types` | GET | エンティティタイプ一覧 |
| `/v2/types/{typeName}` | GET | エンティティタイプ取得 |
| `/v2/op/update` | POST | バッチ更新 |
| `/v2/op/query` | POST | バッチクエリ |
| `/v2/op/notify` | POST | 通知受信 |
| `/v2/tiles` | GET | TileJSON メタデータ |
| `/v2/tiles/{z}/{x}/{y}.geojson` | GET | GeoJSON ベクトルタイル |

## NGSI-LD エンドポイント

| エンドポイント | メソッド | 説明 |
|-------------|--------|------|
| `/ngsi-ld/v1/entities` | GET | エンティティ一覧 |
| `/ngsi-ld/v1/entities` | POST | エンティティ作成 |
| `/ngsi-ld/v1/entities/{id}` | GET | エンティティ取得 |
| `/ngsi-ld/v1/entities/{id}` | PUT | エンティティ置換 |
| `/ngsi-ld/v1/entities/{id}` | PATCH | エンティティ更新（Merge-Patch） |
| `/ngsi-ld/v1/entities/{id}` | POST | 属性追加 |
| `/ngsi-ld/v1/entities/{id}` | DELETE | エンティティ削除 |
| `/ngsi-ld/v1/entities/{id}/attrs` | GET | 全属性取得 |
| `/ngsi-ld/v1/entities/{id}/attrs` | PATCH | 属性部分更新 |
| `/ngsi-ld/v1/entities/{id}/attrs/{attr}` | GET | 属性取得 |
| `/ngsi-ld/v1/entities/{id}/attrs/{attr}` | PUT | 属性置換 |
| `/ngsi-ld/v1/entities/{id}/attrs/{attr}` | POST | 属性置換 |
| `/ngsi-ld/v1/entities/{id}/attrs/{attr}` | PATCH | 属性部分更新 |
| `/ngsi-ld/v1/entities/{id}/attrs/{attr}` | DELETE | 属性削除 |
| `/ngsi-ld/v1/subscriptions` | GET | サブスクリプション一覧 |
| `/ngsi-ld/v1/subscriptions` | POST | サブスクリプション作成 |
| `/ngsi-ld/v1/subscriptions/{id}` | GET | サブスクリプション取得 |
| `/ngsi-ld/v1/subscriptions/{id}` | PATCH | サブスクリプション更新 |
| `/ngsi-ld/v1/subscriptions/{id}` | DELETE | サブスクリプション削除 |
| `/ngsi-ld/v1/csourceRegistrations` | GET | コンテキストソース登録一覧 |
| `/ngsi-ld/v1/csourceRegistrations` | POST | 登録作成 |
| `/ngsi-ld/v1/csourceRegistrations/{id}` | GET | 登録取得 |
| `/ngsi-ld/v1/csourceRegistrations/{id}` | PATCH | 登録更新 |
| `/ngsi-ld/v1/csourceRegistrations/{id}` | DELETE | 登録削除 |
| `/ngsi-ld/v1/types` | GET | エンティティタイプ一覧 |
| `/ngsi-ld/v1/types/{typeName}` | GET | エンティティタイプ取得 |
| `/ngsi-ld/v1/attributes` | GET | 属性一覧 |
| `/ngsi-ld/v1/attributes/{attrName}` | GET | 属性情報取得 |
| `/ngsi-ld/v1/entityOperations/create` | POST | バッチ作成 |
| `/ngsi-ld/v1/entityOperations/upsert` | POST | バッチ upsert |
| `/ngsi-ld/v1/entityOperations/update` | POST | バッチ更新 |
| `/ngsi-ld/v1/entityOperations/delete` | POST | バッチ削除 |
| `/ngsi-ld/v1/entityOperations/query` | POST | バッチクエリ |
| `/ngsi-ld/v1/entityOperations/merge` | POST | バッチマージ |
| `/ngsi-ld/v1/entityOperations/purge` | POST | バッチパージ |
| `/ngsi-ld/v1/temporal/entities` | GET | テンポラルエンティティ一覧 |
| `/ngsi-ld/v1/temporal/entities` | POST | テンポラルエンティティ作成 |
| `/ngsi-ld/v1/temporal/entities/{id}` | GET | テンポラルエンティティ取得 |
| `/ngsi-ld/v1/temporal/entities/{id}` | PATCH | テンポラルエンティティ更新 |
| `/ngsi-ld/v1/temporal/entities/{id}` | DELETE | テンポラルエンティティ削除 |
| `/ngsi-ld/v1/jsonldContexts` | GET | JSON-LD コンテキスト一覧 |
| `/ngsi-ld/v1/jsonldContexts` | POST | JSON-LD コンテキスト登録 |
| `/ngsi-ld/v1/jsonldContexts/{id}` | GET | JSON-LD コンテキスト取得 |
| `/ngsi-ld/v1/jsonldContexts/{id}` | DELETE | JSON-LD コンテキスト削除 |
| `/ngsi-ld/v1/snapshots` | GET | スナップショット一覧 |
| `/ngsi-ld/v1/snapshots` | POST | スナップショット作成 |
| `/ngsi-ld/v1/snapshots/{id}` | GET | スナップショット取得 |
| `/ngsi-ld/v1/snapshots/{id}` | PATCH | スナップショット更新 |
| `/ngsi-ld/v1/snapshots/{id}` | DELETE | スナップショット削除 |
| `/ngsi-ld/v1/snapshots/{id}/clone` | POST | スナップショットクローン |
| `/ngsi-ld/v1/info/sourceIdentity` | GET | ソース ID |
| `/ngsi-ld/v1/info/conformance` | GET | 適合性情報 |
| `/ngsi-ld/v1/tiles` | GET | TileJSON メタデータ |
| `/ngsi-ld/v1/tiles/{z}/{x}/{y}.geojson` | GET | GeoJSON ベクトルタイル |

## 認証エンドポイント

| エンドポイント | メソッド | 説明 | 認証 |
|-------------|--------|------|------|
| `/auth/login` | POST | ユーザーログイン（JWT） | 不要 |
| `/auth/refresh` | POST | トークンリフレッシュ | 不要 |
| `/oauth/token` | POST | OAuth トークン（M2M） | Basic Auth |

## 管理エンドポイント

すべての管理エンドポイントは `super_admin` ロールが必要です。

| エンドポイント | メソッド | 説明 |
|-------------|--------|------|
| `/admin/tenants` | GET/POST | テナント一覧 / 作成 |
| `/admin/tenants/{id}` | GET/PATCH/DELETE | テナント取得 / 更新 / 削除 |
| `/admin/tenants/{id}/activate` | POST | テナント有効化 |
| `/admin/tenants/{id}/deactivate` | POST | テナント無効化 |
| `/admin/users` | GET/POST | ユーザー一覧 / 作成 |
| `/admin/users/{id}` | GET/PATCH/DELETE | ユーザー取得 / 更新 / 削除 |
| `/admin/users/{id}/activate` | POST | ユーザー有効化 |
| `/admin/users/{id}/deactivate` | POST | ユーザー無効化 |
| `/admin/policies` | GET/POST | ポリシー一覧 / 作成 |
| `/admin/policies/{id}` | GET/PUT/DELETE | ポリシー取得 / 置換 / 削除 |
| `/admin/policies/{id}/activate` | POST | ポリシー有効化 |
| `/admin/policies/{id}/deactivate` | POST | ポリシー無効化 |
| `/admin/policies/{id}/export` | GET | XACML XML エクスポート |
| `/admin/policies/import` | POST | XACML XML インポート |
| `/admin/policy-sets` | GET/POST | ポリシーセット一覧 / 作成 |
| `/admin/policy-sets/{id}` | GET/PUT/DELETE | ポリシーセット取得 / 置換 / 削除 |
| `/admin/oauth-clients` | GET/POST | OAuth クライアント一覧 / 作成 |
| `/admin/oauth-clients/{id}` | GET/PATCH/DELETE | OAuth クライアント取得 / 更新 / 削除 |
| `/admin/oauth-clients/{id}/regenerate-secret` | POST | クライアントシークレット再生成 |
| `/admin/metrics` | GET/DELETE | メトリクス取得 / リセット |

## カタログエンドポイント

| エンドポイント | メソッド | 説明 |
|-------------|--------|------|
| `/catalog` | GET | DCAT-AP カタログ |
| `/catalog/datasets` | GET | データセット一覧 |
| `/catalog/datasets/{id}` | GET | データセット取得 |
| `/catalog/datasets/{id}/sample` | GET | サンプルデータ取得 |
| `/catalog/ckan/package_list` | GET | CKAN パッケージ一覧 |
| `/catalog/ckan/package_show` | GET | CKAN パッケージ詳細 |
| `/catalog/ckan/current_package_list_with_resources` | GET | リソース付き CKAN パッケージ一覧 |

## ロールベースアクセス

| API カテゴリ | user | tenant_admin | super_admin |
|-------------|------|--------------|-------------|
| パブリックエンドポイント | はい | はい | はい |
| `/auth/*` | はい | はい | はい |
| `/me/*` | はい | はい | はい |
| `/v2/*` | 自テナント | 自テナント | 全テナント |
| `/ngsi-ld/*` | 自テナント | 自テナント | 全テナント |
| `/catalog/*` | 自テナント | 自テナント | 全テナント |
| `/admin/*` | 不可 | 不可 | はい |

## 次のステップ

- [NGSIv2 API](/ja/api-reference/ngsiv2) — NGSIv2 API の詳細リファレンス
- [NGSI-LD API](/ja/api-reference/ngsild) — NGSI-LD API の詳細リファレンス
- [Admin API](/ja/api-reference/admin) — 認証と管理
- [ページネーション](/ja/api-reference/pagination) — ページネーション仕様
- [ステータスコード](/ja/api-reference/status-codes) — HTTP ステータスコードとエラーフォーマット
