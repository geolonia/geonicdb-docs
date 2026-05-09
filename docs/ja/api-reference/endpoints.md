---
title: "API Common Specification"
description: "GeonicDB API common specification, authentication, and query parameters"
outline: deep
---
# GeonicDB Context Broker API ドキュメント

これは AWS Lambda 上で動作する FIWARE Orion 互換 Context Broker の API ドキュメントです。NGSIv2 と NGSI-LD の両方の API をサポートしています。

## 目次


* [概要](#overview)
  
* [認証とマルチテナンシー](#認証とマルチテナンシー)
  
* [ページネーション](#ページネーション)
  
* [認証 API](#認証-api)
  
* [メタエンドポイント](#メタエンドポイント)
  
* [NGSIv2 API](#ngsiv2-api) (→ [API\_NGSIV2.md](./ngsiv2.md))
  
* [NGSI-LD API](#ngsi-ld-api) (→ [API\_NGSILD.md](./ngsild.md))
  
* [クエリ言語](#クエリ言語)
  
* [ジオクエリ](#ジオクエリ)
  
* [空間 ID 検索](#空間-id-検索)
  
* [GeoJSON 出力](#geojson-出力)
  
* [ベクトルタイル](#vector-tiles)
  
* [座標参照系 (CRS)](#座標参照系-crs)
  
* [データカタログ API](#data-catalog-api)
  
* [CADDE 統合](#cadde-統合)
  
* [イベントストリーミング](#イベントストリーミング)
  
* [エラーレスポンス](#エラーレスポンス)
  
* [実装状況](#実装状況)

***

## 概要

この Context Broker は、FIWARE NGSI (Next Generation Service Interface) 仕様に準拠した RESTful API を提供します。

**関連ドキュメント:**

* [NGSIv2 / NGSI-LD 相互運用ガイド](../core-concepts/ngsiv2-vs-ngsild.md) - 両 API 間の相互運用性、型のマッピング、およびベストプラクティス
  
* [WebSocket イベントストリーミング](../features/subscriptions.md) - リアルタイムイベントサブスクリプション、実装例、およびベストプラクティス

### ベース URL

```text
https://{api-gateway-url}/{stage}
```

### サポートされる API

| API バージョン | ベースパス         | Content-Type          |
| --------- | ------------- | --------------------- |
| NGSIv2    | `/v2`         | `application/json`    |
| NGSI-LD   | `/ngsi-ld/v1` | `application/ld+json` |

### OPTIONS メソッド

The `OPTIONS` メソッドはすべてのエンドポイントでサポートされています。これは CORS プリフライトリクエストに応じて、許可されたメソッドとヘッダーに関する情報を返します。

#### レスポンス形式

OPTIONS リクエストは `204 No Content` を次のヘッダーと共に返します:

```http
OPTIONS /v2/entities/urn:ngsi-ld:Room:Room1

HTTP/1.1 204 No Content
Allow: GET, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Fiware-Service, Fiware-ServicePath, Authorization, If-None-Match, If-Modified-Since
Access-Control-Max-Age: 86400
```

NGSI-LD エンドポイントの場合、追加の `Accept-Patch` ヘッダーも返されます:

```http
OPTIONS /ngsi-ld/v1/entities/urn:ngsi-ld:Room:Room1

HTTP/1.1 204 No Content
Allow: GET, PUT, PATCH, DELETE, OPTIONS
Accept-Patch: application/json, application/ld+json, application/merge-patch+json
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, NGSILD-Tenant, Fiware-Service, Link, Authorization, If-None-Match, If-Modified-Since
Access-Control-Max-Age: 86400
```

> **注記**: `If-None-Match` / `If-Modified-Since` は `Access-Control-Allow-Headers` に明示的にリストされているため、ブラウザの HTTP キャッシュ自動再検証と SDK 条件付きリクエストがプリフライト拒否なしにクロスオリジンで発行できます (#1065)。

### エンティティ ID の一意性 (GeonicDB 拡張)

> **GeonicDB 拡張**: この動作は標準の NGSIv2 仕様とは異なります。標準仕様では、同じ ID でも異なる型を持つエンティティが共存することが許可されています。

GeonicDB では、エンティティ ID は **テナント** (`Fiware-Service`) と **ServicePath** (`Fiware-ServicePath`) のスコープ内で一意です。エンティティの `type` は一意性制約の **一部ではありません**。

**主な動作:**


* 既存のエンティティと同じ ID を持つエンティティを作成すると (異なる `type` であっても) `409 AlreadyExists` を返します
  
* &#x20;のみでエンティティを照合します (型は上書き可能)
  
`entityId` のみでエンティティを照合します (型は上書き可能)
  
* NGSIv2 の `?type=` クエリパラメータ (同じ ID を持つエンティティ間の型による曖昧性解消のため) は適用されなくなりました

この設計は NGSI-LD 仕様に沿ったものであり、エンティティ ID は URI であり本質的に一意です。エンティティ ID は、テナント、servicePath、およびプロトコルごとに一意です。NGSIv2 と NGSI-LD のエンティティは完全に分離されており、同じエンティティ ID が各プロトコルで独立して存在できます。

***

## 認証とマルチテナンシー

### 必須ヘッダー

すべてのリクエストには以下のヘッダーを含めることが推奨されます:

| ヘッダー                               | 必須        | 説明                                                                                          | デフォルト               |
| ---------------------------------- | --------- | ------------------------------------------------------------------------------------------- | ------------------- |
| `Fiware-Service` / `NGSILD-Tenant` | 推奨        | テナント名(英数字とアンダースコアのみ)                                                                        | `default`           |
| `Fiware-ServicePath`               | NGSIv2 のみ | テナント内の階層パス(`/` で始まる)。**NGSI-LD API では無視されます** — 代わりに `scope` プロパティと `scopeQ` パラメータを使用してください | `/`(クエリでは `/#` と同等) |
| `Fiware-Correlator`                | オプション     | リクエストトレーシングのための相関 ID                                                                        | 自動生成                |

### 使用例

```bash
curl -X GET "https://api.example.com/v2/entities" \
  -H "Fiware-Service: smartcity" \
  -H "Fiware-ServicePath: /buildings/floor1"
```

### テナント分離


* 異なる `Fiware-Service` 値のデータは完全に分離されます
  
* 同じテナント内では、`Fiware-ServicePath` を使用してデータを階層的に整理できます
  
* テナント名は自動的に小文字に変換されます

### ServicePathの仕様

Conforms to the [FIWARE Orion 仕様](https://fiware-orion.readthedocs.io/en/1.3.0/user/service_path/index.html)に準拠しています。

#### 基本形式


* &#x20;で始まる絶対パスのみが許可されます
  
`/`英数字とアンダースコアのみが許可されます
  
* 最大 10 レベル、1レベルあたり最大 50 文字
* 階層検索(

```bash
# Retrieve entities at a specific path
curl "http://localhost:3000/v2/entities" \
  -H "Fiware-Service: smartcity" \
  -H "Fiware-ServicePath: /Madrid/Gardens"
```

#### 階層検索(`/#`

)

&#x20;サフィックスを使用すると、指定されたパスとそのすべての子パスを検索できます(`/#` サフィックスを使用すると、指定されたパスとそのすべての子パスを検索できます(**クエリ操作のみ**)。

```bash
# Search /Madrid/Gardens and all its child paths
curl "http://localhost:3000/v2/entities" \
  -H "Fiware-Service: smartcity" \
  -H "Fiware-ServicePath: /Madrid/Gardens/#"
```

#### 複数パス(カンマ区切り)

カンマで区切ることで、複数のパスを同時に検索できます(最大 10 パス、**クエリ操作のみ**)。

```bash
# Search both /park1 and /park2
curl "http://localhost:3000/v2/entities" \
  -H "Fiware-Service: smartcity" \
  -H "Fiware-ServicePath: /park1, /park2"
```

#### デフォルトの動作

| 操作                          | ヘッダーが省略された場合 | 説明          |
| --------------------------- | ------------ | ----------- |
| クエリ(GET)                    | `/`          | ルートパスのみを検索  |
| 書き込み(POST/PUT/PATCH/DELETE) | `/`          | ルートパスに作成/更新 |

**注意**: 書き込み操作では、単一の非階層パスのみを使用できます。`/#` または複数パスを指定するとエラーになります。

***

## ページネーション

ページネーションは、すべてのリスト型 API エンドポイントでサポートされています。

### パラメータ

| パラメータ    | 説明         | デフォルト | 最大値                   |
| -------- | ---------- | ----- | --------------------- |
| `limit`  | 返される結果の最大数 | 20    | 1000 (Admin API: 100) |
| `offset` | スキップする結果の数 | 0     | -                     |

### レスポンスヘッダー

各 API タイプには、合計カウントを示すヘッダーが返されます:

| API         | ヘッダー名                  | 条件                     |
| ----------- | ---------------------- | ---------------------- |
| NGSIv2      | `Fiware-Total-Count`   | 常に返される(すべてのリストエンドポイント) |
| NGSI-LD     | `NGSILD-Results-Count` | 常に返される                 |
| Admin API   | `X-Total-Count`        | 常に返される                 |
| Catalog API | `X-Total-Count`        | 常に返される                 |

### Link ヘッダー

すべてのリストエンドポイントは `Link` ヘッダーを返します。これは [RFC 8288](https://www.rfc-editor.org/rfc/rfc8288) に準拠しており、次のページ(`rel="next"`)と前のページ(`rel="prev"`)の URL を提供します。結果が単一ページに収まる場合、`Link` ヘッダーは返されません。

```http
Link: <https://api.example.com/v2/entities?limit=10&offset=20>; rel="next", <https://api.example.com/v2/entities?limit=10&offset=0>; rel="prev"
```

### バリデーション

無効なページネーションパラメータは `400 Bad Request` を返します:

| エラー条件     | エラーメッセージ                                 |
| --------- | ---------------------------------------- |
| 負の limit  | `Invalid limit: must not be negative`    |
| 負の offset | `Invalid offset: must not be negative`   |
| limit=0   | `Invalid limit: must be greater than 0`  |
| 最大値を超過    | `Invalid limit: must not exceed 1000`    |
| 数値以外      | `Invalid limit: must be a valid integer` |

### 使用例

```bash
# Retrieve the second page (10 results per page)
curl "http://localhost:3000/v2/entities?limit=10&offset=10" \
  -H "Fiware-Service: smartcity"

# Retrieve with total count header
curl "http://localhost:3000/v2/entities?limit=10&options=count" \
  -H "Fiware-Service: smartcity"
```

### 注記


* もし `offset` が合計カウントを超えた場合、空の配列が返されます(エラーではありません)
  
* FIWARE Orion 仕様に準拠しています

***

## HTTP キャッシュ制御 (ETag / 条件付きリクエスト)

GET エンドポイントは、エンドポイントクラスに基づいてキャッシュ関連のヘッダーを返します。クライアントはこれらを使用して、変更されていないレスポンスボディの転送をスキップできます。これは [RFC 7232](https://datatracker.ietf.org/doc/html/rfc7232) および [RFC 7234](https://datatracker.ietf.org/doc/html/rfc7234) に準拠しています。

### エンドポイントクラス

| クラス       | エンドポイント                                                                                                                                                                                                                                                                           | バリデーター (ETag/Last-Modified)            | 条件付きリクエスト                                          | Cache-Control                            |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------- | ---------------------------------------- |
| **データ**   | `/v2/entities` (list, single, attrs, attrs/{name}, attrs/{name}/value)、 `/v2/subscriptions`、 `/v2/registrations`、 `/ngsi-ld/v1/entities` (list, single, attrs, attrs/{name})、 `/ngsi-ld/v1/subscriptions`、 `/ngsi-ld/v1/csourceRegistrations`、 `/ngsi-ld/v1/csourceSubscriptions` | ✓                                      | ✓ ( `If-None-Match` / `If-Modified-Since` → `304`) | `private, no-cache`                      |
| **時系列** | `/ngsi-ld/v1/temporal/entities` (list, single、集約を含む)                                                                                                                                                                                                                              | ✗ (ETag なし — 時系列集約には安価な単調バリデーターがありません) | ✗                                                  | `private, no-cache`                      |
| **メタ**    | `/v2/types`、 `/ngsi-ld/v1/types`、 `/ngsi-ld/v1/attributes` (list および single)                                                                                                                                                                                                      | ✗ (ETag なし、Last-Modified なし)           | ✗ ( `304` サポートなし)                                  | `max-age=60, stale-while-revalidate=120` |

すべてのキャッシュ制御されたレスポンスは同じ `Vary` ヘッダーを共有します: `Fiware-Service, Fiware-ServicePath, Authorization, X-Api-Key, Accept` (テナント + 認証 + コンテンツネゴシエーション分離、CloudFront のような共有キャッシュに必要)

### レスポンスヘッダー (データエンドポイント)

| ヘッダー            | 説明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ETag`          | 弱いエンティティタグ ( `W/"..."`、RFC 7232 §2.3.2 弱いバリデーター)。生成時には常に **リソーススコープ** ( `path + Accept + tenant + Fiware-ServicePath`) をシードに混ぜ込むため、異なるエンドポイント、Accept フォーマット、 **テナント**、または **ServicePath** は、基盤となる状態が同一であっても異なる ETag を生成します。 `tenant` スロットは最初に `NGSILD-Tenant` を読み取り、 `Fiware-Service` にフォールバックします。これは `extractTenantContext` の優先順位と一致します。テナント / servicePath シードは、中間キャッシュによって `Vary` が誤って処理された場合でも、テナント間の ETag 衝突を防ぎます。 <br>• **リスト**: 各要素の `id + modifiedAt` のストリーミングダイジェストを、合計カウントとリソーススコープと組み合わせます。 <br>• **単一リソース**: `modifiedAt` のハッシュをリソーススコープと組み合わせます。 |
| `Last-Modified` | 結果セット内の最新の `modifiedAt` の RFC 1123 HTTP-date。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `Cache-Control` | `private, no-cache` — `private` は共有 / 中間キャッシュ (CloudFront、ISP プロキシ、企業プロキシ) への保存を禁止します。 `no-cache` はプライベートキャッシュからの再利用前に再検証を強制します。                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `Vary`          | `Fiware-Service, Fiware-ServicePath, Authorization, X-Api-Key, Accept`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

### レスポンスヘッダー (メタエンドポイント)

| ヘッダー            | 説明                                                                 |
| --------------- | ------------------------------------------------------------------ |
| `Cache-Control` | `max-age=60, stale-while-revalidate=120` — バックグラウンド再検証を伴う短期キャッシング。 |
| `Vary`          | データエンドポイントと同じ。                                                     |

メタエンドポイントは意図的に `ETag` / `Last-Modified` を省略しています。これは、そのコンテンツが安価な単調バリデーターを持たない集約クエリから派生しているためです。クライアントは条件付きリクエストではなく `max-age` に依存する必要があります。

### 条件付きリクエスト (データエンドポイントのみ)

クライアントは条件付きリクエストヘッダーを送信して、結果が変更されていない場合に `304 Not Modified` (空のボディ) を受信できます:

| リクエストヘッダー                        | 動作                                                               |
| -------------------------------- | ---------------------------------------------------------------- |
| `If-None-Match: <ETag>`          | サーバーは現在の `ETag` と比較します。一致した場合、 `304` を返します。ワイルドカード `*` は常に一致します。 |
| `If-Modified-Since: <HTTP-date>` | サーバーは現在の `Last-Modified` と比較します。変更されていない場合、 `304` を返します。         |

両方のヘッダーが存在する場合、RFC 7232 §6 に従って `If-None-Match` が優先されます。

### 例

```bash
# Initial request — server returns 200 with ETag
curl -i "http://localhost:3000/v2/entities" -H "Fiware-Service: smartcity"
# HTTP/1.1 200 OK
# ETag: W/"d41d8cd98f00b204"
# Last-Modified: Sun, 26 Apr 2026 00:00:00 GMT
# ...body...

# Subsequent request with If-None-Match — server returns 304 with empty body
curl -i "http://localhost:3000/v2/entities" \
  -H "Fiware-Service: smartcity" \
  -H 'If-None-Match: W/"d41d8cd98f00b204"'
# HTTP/1.1 304 Not Modified
# ETag: W/"d41d8cd98f00b204"
# Last-Modified: Sun, 26 Apr 2026 00:00:00 GMT
```

### 注意事項


* ETag は弱い ( `W/`) です — バイト単位の同一性ではなく、意味的な等価性を伝えます。同じデータで属性の順序が異なる 2 つのレスポンスは、同じ ETag を共有します。
  
* ETag 生成には、リソースパスと `Accept` ヘッダーがシードに含まれます。異なるエンドポイントと異なるコンテンツネゴシエーションは、基盤となる状態 (例: 空のリスト) が同一であっても、常に異なる ETag を生成し、エンドポイント間または Accept 間のキャッシュポイズニングを防ぎます。
  
* `304` レスポンスは `ETag`、 `Last-Modified`、 `Cache-Control`、 `Vary`、および CORS ヘッダーを保持します。
  
* 条件付き評価は、ステータスが `GET` および `HEAD` リクエストに適用されます。 `200`。 `HEAD` は `GET` と同じヘッダーを空のボディで返します (RFC 7231 §4.3.2)。これにより、 `200` の場合でもボディを転送せずに軽量な再検証が可能になります。
  
* キャッシュ制御は以下に適用されます:
  
  * **NGSIv2**: `/v2/entities` (list / single / attrs / attrs+name / attrs+name+value)、 `/v2/subscriptions`、 `/v2/registrations`、 `/v2/types`
    
  * **NGSI-LD データ**: `/ngsi-ld/v1/entities` (list / single / attrs / attrs+name)、 `/ngsi-ld/v1/subscriptions`、 `/ngsi-ld/v1/csourceRegistrations`、 `/ngsi-ld/v1/csourceSubscriptions`
    
  * **NGSI-LD メタ**: `/ngsi-ld/v1/types`、 `/ngsi-ld/v1/attributes`
    
  * **NGSI-LD 時系列**: `/ngsi-ld/v1/temporal/entities` (list および single、 `Cache-Control` のみ —  `ETag` / `Last-Modified` なし)

### クライアント駆動キャッシュ制御

クライアントは `Cache-Control` リクエストヘッダーを送信して、キャッシング動作に影響を与えることができます:

| リクエストヘッダー                  | サーバーの動作                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `Cache-Control: no-store`  | サーバーはレスポンスの `Cache-Control` を `no-store` にオーバーライドします (CDN / 中間キャッシュ抑制ヒント)。              |
| `Cache-Control: no-cache`  | サーバーは特別なオーバーライドを行いません。エンドポイントのデフォルトポリシーが引き続き適用されます (データ → 再検証; メタ → `max-age=60` など)。   |
| `Cache-Control: max-age=N` | エッジキャッシュレイヤー (フェーズ 3 / CloudFront) 用に予約されています。Lambda サーバー自体はステートレスであり、このディレクティブを解釈しません。 |

***

## 認証 API

認証機能により、ユーザー認証とアクセス制御が可能になります。

### 有効化

認証はデフォルトで無効になっています。以下の環境変数で有効にすることができます。

**注意**: `AUTH_ENABLED=false` の場合、認証関連のエンドポイント(`/auth/*`、`/me`、`/me/*`、`/admin/*`)は 404 を返します。

**重要**: `AUTH_ENABLED=true` の場合、NGSI API エンドポイント(`/v2/*`、`/ngsi-ld/*`、`/catalog/*`)へのアクセスには認証が必要です。認証なしでアクセスすると `401 Unauthorized` エラーを返します。

| 環境変数                     | デフォルト   | 説明                                    |
| ------------------------ | ------- | ------------------------------------- |
| `AUTH_ENABLED`           | `false` | 認証を有効化                                |
| `JWT_SECRET`             | -       | JWT トークン署名用のシークレット(32文字以上推奨)          |
| `JWT_EXPIRES_IN`         | `1h`    | アクセストークンの有効期限                         |
| `JWT_REFRESH_EXPIRES_IN` | `7d`    | リフレッシュトークンの有効期限                       |
| `SUPER_ADMIN_EMAIL`      | -       | 環境変数で設定されるスーパー管理者のメールアドレス             |
| `SUPER_ADMIN_PASSWORD`   | -       | 環境変数で設定されるスーパー管理者のパスワード               |
| `ADMIN_ALLOWED_IPS`      | -       | Admin API へのアクセスを許可する IP/CIDR(カンマ区切り) |

### ロールと権限

| ロール            | 説明      | 権限                                                                                                                    |
| -------------- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| `super_admin`  | スーパー管理者 | `/admin/*`、`/auth/*`、`/me/*`、監視エンドポイントのみ。**アクセス不可** データ API(`/v2/*`、`/ngsi-ld/*`、`/catalog*`、`/rules*`)には — 403 を返します |
| `tenant_admin` | テナント管理者 | 自分のテナント内のユーザーを管理                                                                                                      |
| `user`         | 一般ユーザー  | 自分のプロフィール表示とパスワード変更のみ                                                                                                 |

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

| パラメータ            | 型                | 必須  | 説明                                                           |
| ---------------- | ---------------- | --- | ------------------------------------------------------------ |
| `email`          | string           | Yes | メールアドレス                                                      |
| `password`       | string           | Yes | パスワード                                                        |
| `tenantId`       | string           | No  | 指定した場合、そのテナントにスコープされた JWT を発行します。省略した場合はプライマリテナントがデフォルトになります |
| `resourceScopes` | ResourceScope\[] | No  | エンティティレベルのアクセス制御スコープ。省略した場合はフルアクセス。詳細は AUTH.md を参照してください     |

**テナントヘッダーのサポート**: ボディ内の `tenantId` の代わりに、`NGSILD-Tenant` または `Fiware-Service` ヘッダーでテナントを指定できます(テナント名で解決されます)。優先順位: `body.tenantId` > ヘッダー > プライマリテナント。ヘッダー値は `^[a-z0-9_]+$` と一致する必要があります。

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

### 現在のユーザー情報を取得

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

### パスワードの変更

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

**注意**: パスワードを変更すると、既存のすべてのアクセストークンとリフレッシュトークンが無効化されます。新しいトークンを取得するため、再度ログインしてください。

### ログアウト

```http
POST /auth/logout
Authorization: Bearer <accessToken>
```

すべてのセッションを無効化します。このユーザーに対して発行されたすべてのアクセストークンとリフレッシュトークンは直ちに無効化されます。

**レスポンス**: `204 No Content`

### API Key トークン交換

#### Nonce の取得

```http
POST /auth/nonce
Content-Type: application/json
Origin: https://example.com

{"api_key": "gdb_your_api_key_here"}
```

**レスポンス**: `200 OK`

```json
{
  "nonce": "base64url_timestamp.hmac_signature",
  "challenge": "sha256_challenge_string",
  "difficulty": 4
}
```

#### トークンの交換

```http
POST /oauth/token
Content-Type: application/json
Origin: https://example.com

{
  "grant_type": "api_key",
  "api_key": "gdb_your_api_key_here",
  "nonce": "received_nonce",
  "proof": "42"
}
```

**レスポンス**: `200 OK`

```json
{
  "access_token": "<session_jwt>",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "read:entities write:entities"
}
```

**DPoP トークンバインディング** (オプション): ECDSA P-256 証明 JWT を含む `DPoP` ヘッダーを含めます ([RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) に準拠)。存在する場合、レスポンスの `token_type` は `"DPoP"` になり、JWT には証明鍵にバインドする `cnf.jkt` クレームが含まれます。サーバーは DPoP-Nonce (RFC 9449 §8) を要求します。最初のリクエストは `400 use_dpop_nonce` と `DPoP-Nonce` ヘッダーを返します。証明の `nonce` クレームに nonce を含めて再試行してください。詳細は AUTH.md を参照してください。

### 管理 API

管理 API は、`super_admin` または `tenant_admin` ロールを持つユーザーのみがアクセスできます。

#### ユーザー一覧

```http
GET /admin/users
Authorization: Bearer <accessToken>
```

**クエリパラメータ**

| パラメータ      | 説明                                |
| ---------- | --------------------------------- |
| `tenantId` | テナント ID でフィルタリング(super\_admin のみ) |
| `role`     | ロールでフィルタリング                       |
| `limit`    | 取得する結果の数                          |
| `offset`   | オフセット                             |

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

#### ユーザーの有効化/無効化

```http
POST /admin/users/{userId}/activate
POST /admin/users/{userId}/deactivate
Authorization: Bearer <accessToken>
```

#### ログインのロック解除

ブルートフォース保護によってロックされたアカウントのロックを解除します。

```http
POST /admin/users/{userId}/unlock
Authorization: Bearer <accessToken>
```

**レスポンス(200):**

```json
{
  "userId": "abc123",
  "email": "user@example.com",
  "locked": false,
  "failedCount": 0,
  "message": "Account login lock has been cleared"
}
```

### テナント管理 (super\_admin のみ)

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
  "name": "new_organization",
  "settings": {
    "maxUsers": 100,
    "allowedServices": ["*"]
  }
}
```

> **注意**: テナント名には小文字の英数字とアンダースコアのみ使用できます (`^[a-z0-9_]+$`)。

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

**カスケード削除**: テナントが削除されると、関連するすべてのデータ (エンティティ、サブスクリプション、登録、ルール、ポリシー、ユーザー、メンバーシップ、および全 16 コレクション) が自動的にカスケード削除されます。削除が開始される前に、テナントは自動的に非アクティブ化され、新しい API リクエストがブロックされます。

#### テナントのアクティブ化/非アクティブ化

```http
POST /admin/tenants/{tenantId}/activate
POST /admin/tenants/{tenantId}/deactivate
Authorization: Bearer <accessToken>
```

### カスタムデータモデル管理

> **注意**: カスタムデータモデル API は `/custom-data-models` に移動しました。詳細については、[カスタムデータモデル API](#カスタムデータモデル-api) セクションを参照してください。

### IP 制限

&#x20;環境変数を設定することで、Admin API (`ADMIN_ALLOWED_IPS`) へのアクセスを特定の IP アドレスに制限できます:`/admin/*`) へのアクセスを特定の IP アドレスに制限できます:

```bash
# Single IP
ADMIN_ALLOWED_IPS=192.168.1.100

# Multiple IPs
ADMIN_ALLOWED_IPS=192.168.1.100,10.0.0.50

# CIDR notation
ADMIN_ALLOWED_IPS=192.168.1.0/24,10.0.0.0/8
```

許可されていない IP からのアクセスは、`403 Forbidden` エラーになります。

#### テナント毎の IP 制限

個別の IP 制限はテナント毎に設定できます。テナントレベルの設定が存在する場合、グローバル設定 (`ADMIN_ALLOWED_IPS`) より優先されます。

```http
GET /admin/tenants/{tenantId}/ip-restrictions
PUT /admin/tenants/{tenantId}/ip-restrictions
DELETE /admin/tenants/{tenantId}/ip-restrictions
Authorization: Bearer <accessToken>
```

スコープは `admin` (Admin API のみ) または `all` (すべての API) のいずれかです。詳細については AUTH.md を参照してください。

### ルールエンジン管理 (tenant\_admin)

エンティティの変更を自動的に処理するルールを管理します。`tenant_admin` ロールが必要です;`super_admin` は `/rules*` エンドポイントにアクセスできません。条件:`AUTH_ENABLED=true`。


* **REACTIVCORE\_RULES.md** - ユーザーガイド(使用例、Admin API など)

#### ルール一覧

```http
GET /rules
Authorization: Bearer <accessToken>
```

**クエリパラメータ**

| パラメータ         | 説明                           |
| ------------- | ---------------------------- |
| `limit`       | 結果の数(デフォルト: 20、最大: 100)      |
| `offset`      | オフセット(デフォルト: 0)              |
| `servicePath` | ServicePathでフィルタ                  |
| `isActive`    | 有効/無効でフィルタ(`true` / `false`) |

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
  "name": "High Temperature Warning",
  "description": "Add a warning attribute when temperature exceeds 30 degrees",
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

レスポンス: `204 No Content`

#### ルール削除

```http
DELETE /rules/{ruleId}
Authorization: Bearer <accessToken>
```

#### ルールの有効化/無効化

```http
POST /rules/{ruleId}/activate
POST /rules/{ruleId}/deactivate
Authorization: Bearer <accessToken>
```

#### クロスプロトコルアクション

ルールアクション(`createEntity`、`updateAttribute`、`deleteAttribute`)は、プロトコル境界を越えて操作するためのオプションの `protocol` フィールドをサポートしています。`createEntity` アクションは、階層制御のための `servicePath` および `scope` フィールドもサポートしています。

| フィールド         | アクション                                          | タイプ                          | 説明                                     |
| ------------- | ---------------------------------------------- | ---------------------------- | -------------------------------------- |
| `protocol`    | createEntity, updateAttribute, deleteAttribute | `'ngsiv2' \| 'ngsild'` | 対象プロトコル(デフォルト: トリガーから継承)               |
| `servicePath` | createEntity                                   | `string`                     | NGSIv2 の対象 servicePath (テンプレート変数をサポート) |
| `scope`       | createEntity                                   | `string[]`                   | NGSI-LD の対象スコープ(テンプレート変数をサポート)         |

プロトコルをまたぐ場合、servicePath ↔ scope が自動的にマッピングされます。テンプレート変数 `${trigger.protocol}`、`${trigger.servicePath}`、`${trigger.scope}`、`${trigger.service}` はトリガーエンティティのコンテキストを参照します。

詳細な例とマッピングルールについては、**REACTIVCORE\_RULES.md** を参照してください。

***

## OAuth 2.0 API (M2M 認証)

OAuth 2.0 Client Credentials Grant フローを使用した Machine-to-Machine (M2M) 認証がサポートされています。

**主要なエンドポイント:**

* `POST /oauth/token` - トークン取得 (Basic 認証)
  
* `POST /admin/oauth-clients` - クライアント作成 (管理者)
  
* `GET /admin/oauth-clients` - クライアント一覧 (管理者)
  
* `POST /admin/oauth-clients/{clientId}/regenerate-secret` - シークレット再生成 (管理者)
  
* `POST /me/oauth-clients` - 自身のクライアント作成 (セルフサービス)
  
* `GET /me/oauth-clients` - 自身のクライアント一覧 (セルフサービス)
  
* `DELETE /me/oauth-clients/{clientId}` - 自身のクライアント削除 (セルフサービス)
  
* `POST /me/oauth-clients/{clientId}/regenerate-secret` - 自身のシークレット再生成 (セルフサービス)

**有効化:** OAuth 2.0 は常に有効です `AUTH_ENABLED=true`。`OAUTH_ENABLED` 環境変数は非推奨となり、無視されます。

**利用可能なスコープ:**

| スコープ                       | 説明                           | `user` | `tenant_admin` | `super_admin` |
| -------------------------- | ---------------------------- | :----: | :------------: | :-----------: |
| `read:entities`            | エンティティの読み取り                  |    ✅   |        ✅       |       ✅       |
| `write:entities`           | エンティティの書き込み (作成/更新/削除のみ)     |    ✅   |        ✅       |       ✅       |
| `read:subscriptions`       | サブスクリプションの読み取り               |    ✅   |        ✅       |       ✅       |
| `write:subscriptions`      | サブスクリプションの書き込み (作成/更新/削除のみ)  |    ✅   |        ✅       |       ✅       |
| `read:registrations`       | 登録の読み取り                      |    ✅   |        ✅       |       ✅       |
| `write:registrations`      | 登録の書き込み (作成/更新/削除のみ)         |    ✅   |        ✅       |       ✅       |
| `read:rules`               | ルールの読み取り                     |    ✅   |        ✅       |       ✅       |
| `write:rules`              | ルールの書き込み (作成/更新/削除のみ)        |    ✅   |        ✅       |       ✅       |
| `read:custom-data-models`  | カスタムデータモデルの読み取り              |    ✅   |        ✅       |       ✅       |
| `write:custom-data-models` | カスタムデータモデルの書き込み (作成/更新/削除のみ) |    ✅   |        ✅       |       ✅       |
| `admin:users`              | ユーザー管理 API                   |    ❌   |        ✅       |       ✅       |
| `admin:policies`           | ポリシー管理 API                   |    ❌   |        ✅       |       ✅       |
| `admin:oauth-clients`      | OAuth クライアント管理 API           |    ❌   |        ✅       |       ✅       |
| `admin:metrics`            | メトリクス API                    |    ❌   |        ✅       |       ✅       |
| `admin:tenants`            | テナント管理 API                   |    ❌   |        ❌       |       ✅       |
| `permanent`                | トークンが無期限                     |    —   |        —       |       —       |
| `jwt`                      | JWT 形式トークン                   |    —   |        —       |       —       |

> ロール列は、セルフサービス (`/me/oauth-clients`) 経由でリクエストできるスコープを示します。管理者が作成したクライアント (`/admin/oauth-clients`) はこれらの制限の対象外です。

**リソーススコープ:** Specifying the `resource_scopes` パラメータ (JSON 文字列) を `POST /oauth/token` で指定すると、エンティティレベルのアクセス制御を持つトークンが発行されます。詳細は AUTH.md を参照してください。

**詳細:** AUTH.md の OAuth 2.0 セクションを参照してください。

***

## API キートークン交換 (ブラウザ SDK)

ブラウザベースのアプリケーションは、Nonce + Proof of Work を介して API キーを短時間有効なセッション JWT に交換できます。

**主要なエンドポイント:**

* `POST /auth/nonce` - Nonce + PoW チャレンジのリクエスト (API キー + Origin ヘッダーが必要)
  
* `POST /oauth/token` (`grant_type=api_key`) - API キー + nonce + PoW 証明をセッション JWT に交換

**JavaScript SDK:** `npm install @geolonia/geonicdb-sdk` — トークン交換、DPoP、WebSocket、再接続を自動的に処理します。

**セキュリティレイヤー:** Origin 検証 → HMAC Nonce (60秒 TTL) → Proof of Work → 短時間有効な JWT (1時間)

**詳細:** AUTH.md の API キートークン交換セクションと、完全な API リファレンスについては SDK ドキュメントを参照してください。

***

## メタエンドポイント

メタエンドポイントは認証が不要で、システムステータスと API 情報を提供します。

### API ドキュメント (llms.txt 形式)

```http
GET /llms.txt
```

AI フレンドリーな [llms.txt](https://llmstxt.org/) 形式で API ドキュメントを返します。AI エージェントや LLM が簡単に理解できるように構造化された Markdown 形式を使用しています。

**レスポンス**

* Content-Type: `text/markdown; charset=utf-8`

### API ドキュメント (JSON 形式)

```http
GET /api.json
```

JSON 形式で API エンドポイントのリストを返します。

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

JSON 形式で OpenAPI 3.0 仕様を返します。Swagger UI や各種 API クライアント生成ツールで使用できます。

**レスポンス**

* Content-Type: `application/json`
  
* OpenAPI version: 3.0.3

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
    "compiled_by": "geonicdb",
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

### NGSI-LD API ディスカバリー

```http
GET /.well-known/ngsi-ld
```

NGSI-LD API サポート情報を返します。

**レスポンス例**

```json
{
  "serverVersion": "1.0.0",
  "supportedApiVersions": ["v1"],
  "supportedFeatures": ["entities", "subscriptions", "batchOperations"]
}
```

### ヘルスチェック

すべてのヘルスチェックエンドポイントは `region` と `regionRole` を返し、マルチリージョン HA サポートを提供します。Route 53 フェイルオーバーはこれらのエンドポイントを監視し、プライマリが `503` を返すとセカンダリに切り替わります。

#### 基本ヘルスチェック

```http
GET /health
```

サービスの基本的な動作ステータスを返します。

**レスポンス例**

```json
{
  "status": "healthy",
  "timestamp": "2026-01-25T10:30:00Z",
  "region": "ap-northeast-1",
  "regionRole": "primary"
}
```

#### Liveness プローブ

```http
GET /health/live
```

Kubernetes / Route 53 の liveness プローブ用。サービスが実行中かどうかをチェックします。

**レスポンス例**

```json
{
  "status": "healthy",
  "timestamp": "2026-01-25T10:30:00Z",
  "region": "ap-northeast-1",
  "regionRole": "primary"
}
```

#### Readiness プローブ

```http
GET /health/ready
```

Kubernetes / Route 53 の readiness プローブ用。MongoDB の接続性をチェックし、オプションで DynamoDB と EventBridge の詳細なヘルスチェックを実行します。

**環境変数による詳細ヘルスチェックの有効化**

| 環境変数                            | 説明                                      |
| ------------------------------- | --------------------------------------- |
| `HEALTH_CHECK_DYNAMODB=true`    | DynamoDB DescribeTable 接続性チェックを追加       |
| `HEALTH_CHECK_EVENTBRIDGE=true` | EventBridge DescribeEventBus 接続性チェックを追加 |

**レスポンス**

* 成功: `200 OK` と `status: "healthy"`
  
* 失敗: `503 Service Unavailable` と `status: "unhealthy"`

**レスポンス例(詳細ヘルスチェック有効時)**

```json
{
  "status": "healthy",
  "timestamp": "2026-01-25T10:30:00Z",
  "region": "ap-northeast-1",
  "regionRole": "primary",
  "checks": {
    "mongodb": { "status": "healthy", "latencyMs": 12 },
    "dynamodb": { "status": "healthy", "latencyMs": 8 },
    "eventbridge": { "status": "healthy", "latencyMs": 15 }
  },
  "totalLatencyMs": 35
}
```

### 統計とメトリクス

FIWARE Orion 互換の統計エンドポイントと Prometheus 形式のメトリクスエンドポイントを提供します。

#### 統計

```http
GET /statistics
Authorization: Bearer <token>
```

FIWARE Orion 互換形式でサーバーの運用統計を返します。認証が有効な場合(`AUTH_ENABLED=true`)、認証されたユーザーのみがこのエンドポイントにアクセスできます。

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

サブスクリプションと登録のキャッシュ統計を返します。認証が有効な場合(`AUTH_ENABLED=true`)、認証されたユーザーのみがこのエンドポイントにアクセスできます。

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

Prometheus エクスポジション形式でメトリクスを返します。認証が有効な場合(`AUTH_ENABLED=true`)、認証されたユーザーのみがこのエンドポイントにアクセスできます。Kubernetes 環境でのモニタリングや Grafana ダッシュボードとの統合に使用できます。

**レスポンス**

* Content-Type: `text/plain; version=0.0.4`

**レスポンス例**

```text
# HELP geonicdb_uptime_seconds Server uptime in seconds
# TYPE geonicdb_uptime_seconds gauge
geonicdb_uptime_seconds 3600

# HELP geonicdb_entities_total Total number of entities
# TYPE geonicdb_entities_total gauge
geonicdb_entities_total 1000

# HELP geonicdb_subscriptions_total Total number of subscriptions
# TYPE geonicdb_subscriptions_total gauge
geonicdb_subscriptions_total 50

# HELP geonicdb_registrations_total Total number of registrations
# TYPE geonicdb_registrations_total gauge
geonicdb_registrations_total 20

# HELP geonicdb_http_requests_total Total HTTP requests
# TYPE geonicdb_http_requests_total counter
geonicdb_http_requests_total{endpoint="entities"} 1000
geonicdb_http_requests_total{endpoint="subscriptions"} 300

# HELP geonicdb_notifications_sent_total Total notifications sent
# TYPE geonicdb_notifications_sent_total counter
geonicdb_notifications_sent_total 500

# HELP geonicdb_notifications_failed_total Total notifications failed
# TYPE geonicdb_notifications_failed_total counter
geonicdb_notifications_failed_total 10
```

#### AI 統合

##### AI ツール定義

```http
GET /tools.json
```

Claude Tool Use / OpenAI Function Calling と互換性のある JSON 形式でツール定義を返します。これは AI エージェントが API をツールとして使用するためのスキーマです。

**提供されるツール**: `list_entities`, `get_entity`, `search_by_location`, `search_by_attribute`, `create_entity`, `update_entity`, `delete_entity`, `list_entity_types`, `get_temporal_data`, `subscribe`

##### AI プラグインマニフェスト

```http
GET /.well-known/ai-plugin.json
```

AI プラグインマニフェストを返します。API の概要、ツール定義 URL、OpenAPI 仕様 URL などが含まれます。

##### MCP (Model Context Protocol)

```http
POST /mcp
Content-Type: application/json
Accept: application/json, text/event-stream
```

MCP ストリーム可能な HTTP エンドポイント。MCP 互換の AI クライアント(Claude Desktop など)から直接接続できます。ステートレスモード(JSON レスポンス)で動作し、MCP tools/call 経由で 5 つのツールすべてが利用可能です。

When `AUTH_ENABLED=true` の場合、Bearer トークン(JWT)による認証が必要です。テナントアクセス制御も適用されます。

**Claude Desktop 設定例**:

```json
{
  "mcpServers": {
    "geonicdb": {
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

注: `headers` が必要なのは `AUTH_ENABLED=true` の場合のみです。

詳細については、[AI\_INTEGRATION.md](../ai-integration/overview.md) を参照してください。

##### A2A (Agent-to-Agent Protocol)

```http
GET /.well-known/agent-card.json
```

A2A エージェントカード。このエージェントの機能、スキル、および認証について記述します。認証は不要です。

```http
POST /a2a
Content-Type: application/json
Authorization: Bearer <token>
Fiware-Service: <tenant>  (optional, falls back to default tenant)
```

エージェント間通信のための A2A JSON-RPC 2.0 エンドポイント。`AUTH_ENABLED=true` の場合は認証が必要です。サポートされるメソッド:

* `message/send` — メッセージを送信し、同期レスポンスを受信
  
* `tasks/get` — タスクの現在の状態を取得
  
* `tasks/list` — フィルタリングとページネーションを使用してタスクを一覧表示
  
* `tasks/cancel` — タスクのキャンセルをリクエスト

5 つのスキルが利用可能: entities、batch、temporal、config、admin(MCP ツールと同じ)。

詳細については、[AI\_INTEGRATION.md](../ai-integration/overview.md) を参照してください。

#### テナント毎のメトリクス(Admin API)

```http
GET /admin/metrics
Authorization: Bearer <accessToken>
```

テナントとServicePath毎のメトリクスを返します。`super_admin` ロールが必要です。

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

***

## NGSIv2 API

NGSIv2 API の詳細については、[API\_NGSIV2.md](./ngsiv2.md)を参照してください。

***

## NGSI-LD API

NGSI-LD API の詳細については、[API\_NGSILD.md](./ngsild.md)を参照してください。

***

## クエリ言語

属性値によるフィルタリングは、`q`パラメータを使用して可能です。

### 基本構文

| 演算子  | 説明            | 例                     |
| ---- | ------------- | --------------------- |
| `==` | 等しい           | `temperature==23`     |
| `!=` | 等しくない         | `status!=inactive`    |
| `>`  | より大きい         | `temperature>20`      |
| `<`  | より小さい         | `temperature<30`      |
| `>=` | 以上            | `temperature>=20`     |
| `<=` | 以下            | `temperature<=30`     |
| `..` | 範囲            | `temperature==20..30` |
| `~=` | パターンマッチ(正規表現) | `name~=Room.*`        |

### 複数条件

AND 条件はセミコロン(`;`)で結合します:

```text
q=temperature>20;pressure<800
```

OR 条件はパイプ(`|`)で結合します(`;`は`|`よりも優先されます):

```text
q=temperature==23|temperature==35
q=temperature>25;humidity<40|status==active
```

### 範囲クエリ

Combine the `==`演算子と`..`を組み合わせて範囲フィルタリングを行います(境界値を含む):

```text
q=temperature==20..30    # 20 or above and 30 or below
```

### 文字列マッチング

```text
q=status~=act     # Partial match (regular expression)
q=name==Room1     # Exact match
```

***

## ジオクエリ

位置情報を持つエンティティは、空間的にクエリできます。

### パラメータ

| パラメータ      | 説明                                                         |
| ---------- | ---------------------------------------------------------- |
| `georel`   | 空間関係(coveredBy、within、intersects、disjoint、equals)          |
| `geometry` | ジオメトリタイプ(point、polygon、line、box)                           |
| `coords`   | 座標(NGSIv2: 緯度,経度 形式; NGSI-LD: 経度,緯度 形式; 複数のポイントはセミコロンで区切る) |

> **注意**: `georel`、`geometry`、および`coords`(または NGSI-LD では`coordinates`)はすべて一緒に指定する必要があります。一部のみを指定すると`400 Bad Request`が返されます(ETSI GS CIM 009 V1.9.1 clause 4.10)。

### 座標形式

NGSIv2 では、座標は**緯度,経度**の順序で指定されます(NGSIv2 仕様に準拠)。NGSI-LD では、座標は**経度,緯度**の順序です(GeoJSON 標準に準拠)。

> **重要**: NGSIv2 の緯度,経度 の順序は、GeoJSON 標準(経度,緯度)からの逸脱です。これは NGSI-LD で修正され、GeoJSON と同じ 経度,緯度 の順序を使用します。API を使用する際は、使用している API バージョンに対応した正しい順序で座標を指定してください。

```text
# NGSIv2 (latitude,longitude)
coords=35.6812,139.7671              # Single point
coords=34,138;34,141;37,141;37,138;34,138  # Polygon (semicolon-separated)

# NGSI-LD (longitude,latitude)
coordinates=[139.7671,35.6812]       # Single point
```

### エリア検索 (coveredBy / within)

ポリゴン内のエンティティを検索:

```http
GET /v2/entities?georel=coveredBy&geometry=polygon&coords=34,138;34,141;37,141;37,138;34,138
```

### 交差検索 (intersects)

ジオメトリと交差するエンティティを検索:

```http
GET /v2/entities?georel=intersects&geometry=box&coords=35.67,139.76;35.69,139.78
```

### 非交差検索 (disjoint)

ジオメトリと交差しないエンティティを検索:

```http
GET /v2/entities?georel=disjoint&geometry=polygon&coords=34,138;34,141;37,141;37,138;34,138
```

### 近接検索 (near)

指定された座標から一定距離内のエンティティを検索します。

#### パラメータ

| パラメータ             | 説明                                                      |
| ----------------- | ------------------------------------------------------- |
| `maxDistance`     | 最大距離(メートル)                                              |
| `minDistance`     | 最小距離(メートル)                                              |
| `orderByDistance` | 設定すると`true`、結果を距離順にソートし、距離情報(`@distance`)を各エンティティに付加します |

#### 基本的な使い方 (NGSIv2)

```http
# Search for entities within 5km of Tokyo Station
GET /v2/entities?georel=near;maxDistance:5000&geometry=point&coords=35.6812,139.7671

# Search for entities more than 100km from Tokyo Station
GET /v2/entities?georel=near;minDistance:100000&geometry=point&coords=35.6812,139.7671

# Donut-shaped search (500m to 10km range)
GET /v2/entities?georel=near;minDistance:500;maxDistance:10000&geometry=point&coords=35.6812,139.7671
```

#### NGSI-LD での使い方

NGSI-LD では、`==`を使用してパラメータを指定します:

```http
# Search for entities within 5km of Tokyo Station
GET /ngsi-ld/v1/entities?georel=near;maxDistance==5000&geometry=Point&coordinates=[139.7671,35.6812]

# Search for entities more than 100km from Tokyo Station
GET /ngsi-ld/v1/entities?georel=near;minDistance==100000&geometry=Point&coordinates=[139.7671,35.6812]

# Donut-shaped search (500m to 10km range)
GET /ngsi-ld/v1/entities?georel=near;minDistance==500;maxDistance==10000&geometry=Point&coordinates=[139.7671,35.6812]
```

#### georel 構文の比較

georel パラメータ修飾子の構文は NGSIv2 と NGSI-LD で異なります:

| 機能   | NGSIv2                                          | NGSI-LD                                           | 説明             |
| ---- | ----------------------------------------------- | ------------------------------------------------- | -------------- |
| 最大距離 | `georel=near;maxDistance:5000`                  | `georel=near;maxDistance==5000`                   | `:` と `==` の違い |
| 最小距離 | `georel=near;minDistance:1000`                  | `georel=near;minDistance==1000`                   | `:` と `==` の違い |
| 距離範囲 | `georel=near;minDistance:500;maxDistance:10000` | `georel=near;minDistance==500;maxDistance==10000` | `:` と `==` の違い |

> **構文が異なる理由**: NGSIv2 では`:`を使用してパラメータ値を指定しますが、NGSI-LD では ETSI 仕様に従って`==`を使用します。API を呼び出す際は、使用している API バージョンに対応した構文を使用してください。

#### 距離ソートと距離情報

パラメータを指定すると、以下の機能が有効になります:`orderByDistance=true` parameter enables the following features:


1. **距離ソート**: 結果は指定された座標からの距離の昇順でソートされます
   
2. **距離情報**: 各エンティティに`@distance`属性が追加され、指定された座標からの距離(メートル単位)が返されます

この機能は MongoDB の`$geoNear`集約パイプラインを使用して実装されています。

##### NGSIv2 での使い方

```http
# Retrieve entities within 5km of Tokyo Station sorted by distance
GET /v2/entities?georel=near;maxDistance:5000&geometry=point&coords=35.6812,139.7671&orderByDistance=true
```

レスポンス例:

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

##### NGSI-LD での使い方

```http
# Retrieve entities within 5km of Tokyo Station sorted by distance
GET /ngsi-ld/v1/entities?georel=near;maxDistance==5000&geometry=Point&coordinates=[139.7671,35.6812]&orderByDistance=true
```

##### 降順ソート

使用 `orderDirection=desc` を組み合わせて、距離の降順(最も遠いものから)でソートします:

```http
GET /v2/entities?georel=near;maxDistance:5000&geometry=point&coords=35.6812,139.7671&orderByDistance=true&orderDirection=desc
```

#### 制限事項


* **Point ジオメトリのみ**: `geometry=point` (NGSIv2) または `geometry=Point` (NGSI-LD) のみがサポートされています

### エラー処理

ジオクエリパラメータが無効な場合、`400 Bad Request` が返されます。

| エラー条件                            | エラーメッセージの例                                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 無効な `georel` 値                   | `Invalid georel: xxx. Supported values: near, coveredBy, within, contains, intersects, disjoint, equals` |
| 無効な `geometry` 値                 | `Unsupported geometry type: xxx. Supported types: point, polygon, linestring, line, box`                 |
| 座標が不足しています (Point)               | `Point geometry requires at least 2 coordinates, but got 1`                                              |
| 座標が不足しています (Polygon)             | `Polygon geometry requires at least 4 coordinate pairs (8 values), but got 6 values`                     |
| 座標が不足しています (LineString)          | `LineString geometry requires at least 2 coordinate pairs (4 values), but got 2 values`                  |
| 座標が不足しています (Box)                 | `Box geometry requires 2 coordinate pairs (4 values), but got 2 values`                                  |
| 無効な座標値                           | `Invalid coordinate value: xxx`                                                                          |
| 緯度が範囲外です                         | `Latitude out of range: 91. Must be between -90 and 90.`                                                 |
| 経度が範囲外です                         | `Longitude out of range: 181. Must be between -180 and 180.`                                             |
| `near` で距離が指定されていません             | `The 'near' georel requires maxDistance and/or minDistance modifier`                                     |
| `near` が Point 以外のジオメトリと使用されています | `The 'near' georel requires Point geometry, but 'polygon' was provided`                                  |

***

## 空間 ID 検索

日本のデジタル庁 / IPA が策定した 3D 空間識別標準(ZFXY 形式)に基づく空間検索をサポートします。

### ZFXY 形式

| 要素 | 説明          | 範囲         |
| -- | ----------- | ---------- |
| Z  | ズームレベル      | 0-28       |
| F  | 垂直方向(高度レベル) | 整数         |
| X  | 東西方向(経度タイル) | 0 to 2^z-1 |
| Y  | 南北方向(緯度タイル) | 0 to 2^z-1 |

形式:`{z}/{f}/{x}/{y}`(例:`20/0/929593/410773`)

### NGSIv2 での使用方法

```http
GET /v2/entities?spatialId=20/0/929593/410773
```

### NGSI-LD での使用方法

```http
GET /ngsi-ld/v1/entities?spatialId=20/0/929593/410773
```

### 階層展開(spatialIdDepth)

Specifying the `spatialIdDepth`パラメータを指定すると、指定した空間 ID を中心とした周囲のタイルに検索を展開します。

```http
# depth=1: Expands to a 3x3 tile grid (9 tiles)
GET /v2/entities?spatialId=20/0/929593/410773&spatialIdDepth=1

# depth=2: Expands to a 5x5 tile grid (25 tiles)
GET /v2/entities?spatialId=20/0/929593/410773&spatialIdDepth=2
```

| spatialIdDepth | 展開範囲    | タイル数 |
| -------------- | ------- | ---- |
| 0(デフォルト)       | 指定タイルのみ | 1    |
| 1              | 3x3     | 9    |
| 2              | 5x5     | 25   |
| 3              | 7x7     | 49   |
| 4              | 9x9     | 81   |

### 使用例

```bash
# Search for entities near Tokyo Station (zoom level 20)
curl "http://localhost:3000/v2/entities?spatialId=20/0/929592/410773" \
  -H "Fiware-Service: smartcity"

# Search with expansion to surrounding 3x3 tiles
curl "http://localhost:3000/v2/entities?spatialId=20/0/929592/410773&spatialIdDepth=1" \
  -H "Fiware-Service: smartcity"
```

***

## GeoJSON 出力

エンティティは RFC 7946 準拠の GeoJSON FeatureCollection 形式で出力できます。

### NGSIv2 での使用方法

Use the `options=geojson`パラメータまたは`Accept: application/geo+json`ヘッダーを使用します:

```http
# options parameter
GET /v2/entities?type=Store&options=geojson

# Accept header
GET /v2/entities?type=Store
Accept: application/geo+json
```

### NGSI-LD での使用方法

Use the `format=geojson`パラメータまたは`Accept: application/geo+json`ヘッダーを使用します:

```http
# format parameter
GET /ngsi-ld/v1/entities?type=Store&format=geojson

# Accept header
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
        "name": "Tokyo Store",
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
        "name": "Shinagawa Store",
        "category": "retail"
      }
    }
  ]
}
```

### NGSI-LD における @context

NGSI-LD で GeoJSON を出力する場合、`@context` は FeatureCollection レベルに含まれます:

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "type": "FeatureCollection",
  "features": [...]
}
```

### Content-Type

GeoJSON 出力のレスポンスヘッダー:

```http
Content-Type: application/geo+json
```

### 使用例

```bash
# GeoJSON output in NGSIv2
curl "http://localhost:3000/v2/entities?type=Store&options=geojson" \
  -H "Fiware-Service: smartcity"

# GeoJSON output in NGSI-LD (format parameter)
curl "http://localhost:3000/ngsi-ld/v1/entities?type=Store&format=geojson" \
  -H "Fiware-Service: smartcity"

# GeoJSON output in NGSI-LD (Accept header)
curl "http://localhost:3000/ngsi-ld/v1/entities?type=Store" \
  -H "Fiware-Service: smartcity" \
  -H "Accept: application/geo+json"

# Combine spatial ID search with GeoJSON output
curl "http://localhost:3000/v2/entities?spatialId=20/0/929592/410773&options=geojson" \
  -H "Fiware-Service: smartcity"
```

### 注意事項


* &#x20;属性を持たないエンティティは `location` として出力されます`geometry: null`
  
* GeoJSON 出力は `keyValues` オプションと組み合わせて使用できます
  
* Polygon、LineString、MultiPoint などのジオメトリタイプがサポートされています

***

## ベクタータイル

エンティティは XYZ タイル方式に基づいて GeoJSON ベクタータイルとして出力できます。地図上に大量のエンティティを効率的に表示するために最適化されています。

### エンドポイント

| エンドポイント                                     | 説明                       |
| ------------------------------------------- | ------------------------ |
| `GET /v2/tiles`                             | TileJSON メタデータ (NGSIv2)  |
| `GET /v2/tiles/{z}/{x}/{y}.geojson`         | GeoJSON タイル (NGSIv2)     |
| `GET /ngsi-ld/v1/tiles`                     | TileJSON メタデータ (NGSI-LD) |
| `GET /ngsi-ld/v1/tiles/{z}/{x}/{y}.geojson` | GeoJSON タイル (NGSI-LD)    |

### TileJSON メタデータ

TileJSON 3.0 仕様に準拠したメタデータを返します:

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

### GeoJSON タイルの取得

XYZ 座標を指定して、タイル内のエンティティを GeoJSON 形式で取得します:

```bash
# Zoom level 14 tile around Tokyo
curl "http://localhost:3000/v2/tiles/14/14549/6451.geojson" \
  -H "Fiware-Service: smartcity"
```

**クエリパラメータ**

| パラメータ   | 説明                    |
| ------- | --------------------- |
| `type`  | エンティティタイプでフィルタリング     |
| `attrs` | カンマ区切りリストとして出力する属性を指定 |

**使用例**

```bash
# Retrieve only a specific entity type
curl "http://localhost:3000/v2/tiles/14/14549/6451.geojson?type=Store" \
  -H "Fiware-Service: smartcity"

# Retrieve only specific attributes
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
        "name": "Tokyo Station Store"
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

タイル内のエンティティ数が閾値(デフォルト:1000)を超えると、自動的にクラスタリングされます。クラスタリングされた場合、タイル内のすべてのエンティティの重心座標を持つ単一のクラスタ Feature が返されます。

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

| ヘッダー            | 説明                                                |
| --------------- | ------------------------------------------------- |
| `X-Tile-Mode`   | `individual` (個別エンティティ) または `clustered` (クラスタリング) |
| `X-Total-Count` | タイル内のエンティティの総数                                    |

### 設定

| 環境変数                       | デフォルト  | 説明                           |
| -------------------------- | ------ | ---------------------------- |
| `MAX_ENTITIES_PER_REQUEST` | `1000` | クラスタリングの閾値(この値以上でクラスタリングが発生) |

### 参考文献


* [TileJSON 3.0 仕様](https://github.com/mapbox/tilejson-spec/tree/master/3.0.0)
  
* [RFC 7946 GeoJSON](https://datatracker.ietf.org/doc/html/rfc7946)
  
* [XYZ Tile Scheme](https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames)

***

## 座標参照系 (CRS)

座標参照系を指定することで、異なる測地系間で座標を変換できます。

### サポートされている CRS

| CRS          | EPSG      | 説明                 | ユースケース                       |
| ------------ | --------- | ------------------ | ---------------------------- |
| WGS84        | EPSG:4326 | 世界測地系 1984 (デフォルト) | GPS、国際標準                     |
| JGD2011      | EPSG:6668 | 日本測地系 2011         | 日本における高精度測量                  |
| Web Mercator | EPSG:3857 | Web メルカトル図法        | Google Maps、OpenStreetMap など |

### CRS の指定方法

#### NGSIv2

&#x20;クエリパラメータを使用して EPSG コードを指定します:`crs` query parameter:

```http
# Retrieve with JGD2011 coordinates
GET /v2/entities?type=Store&crs=EPSG:6668

# Retrieve with Web Mercator coordinates
GET /v2/entities?type=Store&crs=EPSG:3857
```

#### NGSI-LD

NGSI-LD は EPSG 短縮形式と URN 形式の両方をサポートしています:

```http
# EPSG short form
GET /ngsi-ld/v1/entities?type=Store&crs=EPSG:6668

# URN format (ETSI-compliant)
GET /ngsi-ld/v1/entities?type=Store&crs=urn:ogc:def:crs:EPSG::6668
```

### レスポンスヘッダー

CRS を指定したリクエストに対するレスポンスには、`Content-Crs` ヘッダーが含まれます:

```text
Content-Crs: EPSG:6668
```

NGSI-LD で URN 形式が指定されている場合、URN 形式で返されます:

```text
Content-Crs: urn:ogc:def:crs:EPSG::6668
```

### 座標の入出力

#### クエリ時(入力)

ジオクエリの座標は、指定された CRS で解釈されます:

```http
# Proximity search with JGD2011 coordinates
GET /v2/entities?georel=near;maxDistance:5000&geometry=point&coords=35.6812,139.7671&crs=EPSG:6668
```

#### エンティティ作成時

エンティティ作成時に `crs` パラメータを指定すると、入力座標が指定された CRS として解釈され、内部的に WGS84 に変換されて保存されます:

```bash
# Create entity with Web Mercator coordinates
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

#### 取得時(出力)

取得時に `crs` パラメータを指定すると、指定された CRS に変換された座標が返されます:

```bash
# Retrieve with JGD2011 coordinates
curl "http://localhost:3000/v2/entities/Store1?crs=EPSG:6668" \
  -H "Fiware-Service: smartcity"
```

### 座標変換の精度

| 変換                   | 精度                  |
| -------------------- | ------------------- |
| WGS84 ↔ JGD2011      | 数 cm から数十 cm        |
| WGS84 ↔ Web Mercator | 計算精度に依存(緯度 ±85 度以内) |

### 使用例

#### NGSIv2 での使用

```bash
# Create entity with JGD2011 coordinates
curl -X POST "http://localhost:3000/v2/entities?crs=EPSG:6668" \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -d '{
    "id": "TokyoTower",
    "type": "Landmark",
    "name": { "type": "Text", "value": "Tokyo Tower" },
    "location": {
      "type": "geo:json",
      "value": {
        "type": "Point",
        "coordinates": [139.745438, 35.658581]
      }
    }
  }'

# Retrieve with Web Mercator coordinates
curl "http://localhost:3000/v2/entities/TokyoTower?crs=EPSG:3857" \
  -H "Fiware-Service: smartcity"
```

#### NGSI-LD での使用

```bash
# Create entity specifying CRS in URN format
curl -X POST "http://localhost:3000/ngsi-ld/v1/entities?crs=urn:ogc:def:crs:EPSG::6668" \
  -H "Content-Type: application/ld+json" \
  -H "Fiware-Service: smartcity" \
  -d '{
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
    "id": "urn:ngsi-ld:Landmark:TokyoTower",
    "type": "Landmark",
    "name": { "type": "Property", "value": "Tokyo Tower" },
    "location": {
      "type": "GeoProperty",
      "value": {
        "type": "Point",
        "coordinates": [139.745438, 35.658581]
      }
    }
  }'

# Retrieve list with JGD2011 coordinates
curl "http://localhost:3000/ngsi-ld/v1/entities?type=Landmark&crs=EPSG:6668" \
  -H "Fiware-Service: smartcity"
```

### エラー

| エラー            | HTTP コード | 説明                         |
| -------------- | -------- | -------------------------- |
| サポートされていない CRS | 400      | 指定された CRS コードはサポートされていません  |
| 無効な CRS フォーマット | 400      | 無効な CRS フォーマットが指定されました     |
| 座標が範囲外         | 400      | Web Mercator で緯度±85度を超える座標 |

### 制限事項


* Web Mercator (EPSG:3857) は緯度±85度を超える領域をサポートしていません
  
* すべての座標は内部的に WGS84 で保存されます
  
* 座標変換には [proj4](https://github.com/proj4js/proj4js) ライブラリが使用されます

### 参考文献


* [OGC API Features CRS Extension](https://docs.ogc.org/is/18-058r1/18-058r1.html)
  
* [EPSG Geodetic Parameter Registry](https://epsg.io/)
  
* [ETSI NGSI-LD CRS Specification](https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/01.08.01_60/gs_CIM009v010801p.pdf)

***

## Data Catalog API

DCAT-AP 形式でエンティティタイプ情報を出力し、CKAN harvest 互換エンドポイントを提供します。

### DCAT-AP カタログ

```http
GET /catalog
```

DCAT-AP 形式でカタログ全体を JSON-LD として出力します。

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

DCAT 形式でデータセットの一覧を出力します。

**クエリパラメータ**

| パラメータ    | 説明             |
| -------- | -------------- |
| `limit`  | 取得するデータセットの数   |
| `offset` | スキップするデータセットの数 |

### 個別データセット

```http
GET /catalog/datasets/{datasetId}
```

個別データセット(エンティティタイプ)の詳細情報を出力します。

### サンプルデータ

```http
GET /catalog/datasets/{datasetId}/sample
```

データセットのサンプルデータを取得します。

**クエリパラメータ**

| パラメータ   | 説明         | デフォルト |
| ------- | ---------- | ----- |
| `limit` | 取得するサンプルの数 | 5     |

### CKAN 互換 API

CKAN データカタログハーベスターと互換性のある API を提供します。

#### パッケージリスト

```http
GET /catalog/ckan/package_list
```

すべてのパッケージ(データセット)の ID リストを取得します。

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

#### リソース付きパッケージリスト

```http
GET /catalog/ckan/current_package_list_with_resources
```

リソース情報を含むパッケージのページ分割されたリストを取得します。

**クエリパラメータ**

| パラメータ    | 説明            |
| -------- | ------------- |
| `limit`  | 取得するパッケージの数   |
| `offset` | スキップするパッケージの数 |

詳細については、外部統合ドキュメントを参照してください。

***

## CADDE 統合

CADDE (Connector Architecture for Decentralized Data Exchange) コネクタとの統合機能を提供します。

### 概要

CADDE は、異なるセクター間でのデータ共有を可能にする日本のデータ交換アーキテクチャです。この Context Broker は CADDE コネクタからのリクエストを受け取り、来歴情報を含むレスポンスを返します。

### 有効化

CADDE 機能はデフォルトで無効になっています。Admin API (`PUT /admin/cadde`) を使用して設定を管理します:

```bash
# Enable CADDE configuration
curl -X PUT "https://api.example.com/admin/cadde" \
  -H "Authorization: Bearer <super_admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "authEnabled": false,
    "defaultProvider": "my-provider"
  }'
```

| 設定項目              | デフォルト   | 説明                                    |
| ----------------- | ------- | ------------------------------------- |
| `enabled`         | `false` | CADDE 機能を有効化                          |
| `authEnabled`     | `false` | Bearer 認証を有効化                         |
| `defaultProvider` | -       | デフォルトプロバイダー ID                        |
| `jwtIssuer`       | -       | JWT 検証のための期待される発行者 (`iss`) クレーム       |
| `jwtAudience`     | -       | JWT 検証のための期待されるオーディエンス (`aud`) クレーム   |
| `jwksUrl`         | -       | 署名検証のための JWKS エンドポイント URL (HTTPS が必要) |

設定は MongoDB に保存されるため、デプロイ後に API を介して動的に変更できます。

### リクエストヘッダー

CADDE コネクターからのリクエストには、以下のヘッダーが含まれます:

| ヘッダー                        | 必須 | 説明                      |
| --------------------------- | -- | ----------------------- |
| `x-cadde-resource-url`      | -  | アクセスされるリソースの URL        |
| `x-cadde-resource-api-type` | -  | API タイプ (例: `api/ngsi`) |
| `x-cadde-provider`          | -  | データプロバイダー ID            |
| `x-cadde-options`           | -  | 追加オプション (テナントヘッダーなど)    |

### x-cadde-options フォーマット

テナント情報やその他の詳細は、`x-cadde-options` ヘッダーで指定できます:

```text
x-cadde-options: Fiware-Service:smartcity, Fiware-ServicePath:/sensors
```

このヘッダーで指定された値は、通常の HTTP ヘッダーよりも優先されます。

### 来歴レスポンスヘッダー

CADDE リクエストへのレスポンスには、以下の来歴ヘッダーが含まれます:

| ヘッダー                              | 説明                                  |
| --------------------------------- | ----------------------------------- |
| `x-cadde-provenance-id`           | リクエストの一意識別子 (Fiware-Correlator を使用) |
| `x-cadde-provenance-timestamp`    | レスポンス生成時刻 (ISO 8601 形式)             |
| `x-cadde-provenance-provider`     | データプロバイダー ID                        |
| `x-cadde-provenance-resource-url` | アクセスされたリソースの URL                    |

### 認証

の場合、`CADDE_AUTH_ENABLED=true`、CADDE リクエストには Bearer 認証が必要です:

```http
Authorization: Bearer <token>
```

トークンが存在しない場合、`401 Unauthorized` エラーが返されます。

#### JWT 検証(オプション)

Setting `CADDE_JWKS_URL` を設定すると、Bearer トークンの完全な JWT 検証が有効になります:

| 機能            | 説明                                                              |
| ------------- | --------------------------------------------------------------- |
| **署名検証**      | RS256 または ES256 アルゴリズムをサポートします。JWKS エンドポイントから公開鍵を自動的に取得します      |
| **有効期限検証**    | Validates the `exp`(有効期限)クレームを検証し、期限切れのトークンを拒否します               |
| **発行時刻検証**    | Validates the `iat`(発行時刻)クレームを検証し、未来に発行されたトークンを拒否します            |
| **発行者検証**     | Validates the `iss` クレームを検証します(`CADDE_JWT_ISSUER` が設定されている場合)   |
| **オーディエンス検証** | Validates the `aud` クレームを検証します(`CADDE_JWT_AUDIENCE` が設定されている場合) |

**設定例:**

```bash
# Enable full JWT validation via Admin API
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

**エラーレスポンス:**

JWT 検証が失敗した場合、詳細なエラーメッセージが返されます:

| エラー                             | 説明                               |
| ------------------------------- | -------------------------------- |
| `Malformed JWT token`           | 無効なトークン形式                        |
| `Invalid token signature`       | 無効な署名                            |
| `Token has expired`             | トークンの有効期限が切れています                 |
| `Invalid token issuer`          | 発行者クレームが一致しません                   |
| `Invalid token audience`        | オーディエンスクレームが一致しません               |
| `Unsupported signing algorithm` | サポートされていないアルゴリズム(RS256/ES256 以外) |
| `Unable to fetch signing keys`  | JWKS エンドポイントへのアクセスに失敗しました        |
| `Signing key not found`         | 指定された kid のキーが JWKS に存在しません      |

**注意:** If `jwksUrl` が設定されていない場合、トークンの存在のみがチェックされます(後方互換性のため)。

### 使用例

```bash
# Retrieve entities with CADDE headers
curl "http://localhost:3000/v2/entities" \
  -H "x-cadde-resource-url: http://localhost:3000/v2/entities" \
  -H "x-cadde-resource-api-type: api/ngsi" \
  -H "x-cadde-provider: provider-001" \
  -H "x-cadde-options: Fiware-Service:smartcity, Fiware-ServicePath:/"

# Example response headers:
# x-cadde-provenance-id: 550e8400-e29b-41d4-a716-446655440000
# x-cadde-provenance-timestamp: 2026-01-26T12:00:00.000Z
# x-cadde-provenance-provider: provider-001
# x-cadde-provenance-resource-url: https://localhost/v2/entities
```

### NGSI-LD API での使用

CADDE ヘッダーは NGSI-LD API でも使用できます:

```bash
curl "http://localhost:3000/ngsi-ld/v1/entities" \
  -H "x-cadde-resource-url: http://localhost:3000/ngsi-ld/v1/entities" \
  -H "x-cadde-resource-api-type: api/ngsi-ld" \
  -H "x-cadde-provider: ld-provider" \
  -H "x-cadde-options: Fiware-Service:smartcity"
```

### CADDE Connector v4 API

CADDE コネクタ v4 仕様に準拠した専用エンドポイント(CADDE 設定が有効な場合のみ利用可能。設定は `PUT /admin/cadde` で行います)。

参照: <https://github.com/CADDE-sip/connector>

#### エンドポイント一覧

| メソッド | パス                       | 説明                |
| ---- | ------------------------ | ----------------- |
| GET  | `/cadde/api/v4/catalog`  | カタログ検索(横断検索/詳細検索) |
| GET  | `/cadde/api/v4/entities` | NGSI データ交換        |

#### カタログ検索(`/cadde/api/v4/catalog`

)

&#x20;ヘッダーを使用して検索タイプを指定します:`x-cadde-search` ヘッダー:

| 検索タイプ | ヘッダー値                    | 説明                                               |
| ----- | ------------------------ | ------------------------------------------------ |
| 横断検索  | `x-cadde-search: meta`   | CKAN 形式でデータセットリストを返します(`q` パラメータによるキーワードフィルタリング) |
| 詳細検索  | `x-cadde-search: detail` | 個別データセットの詳細を返します(`id` または `fq` パラメータで指定)         |

レスポンスには CADDE 固有のフィールドが追加されます:

* `caddec_dataset_id_for_detail`: 詳細検索用のデータセット ID
  
* `caddec_provider_id`: プロバイダ ID(`CADDE_DEFAULT_PROVIDER` が設定されている場合)
  
* `caddec_resource_type`: リソースタイプ(`api/ngsi`)

```bash
# Cross-domain search
curl "http://localhost:3000/cadde/api/v4/catalog?q=sensor" \
  -H "x-cadde-search: meta" \
  -H "x-cadde-resource-url: https://example.com/cadde/api/v4/catalog" \
  -H "Fiware-Service: smartcity"

# Detailed search
curl "http://localhost:3000/cadde/api/v4/catalog?id=sensor" \
  -H "x-cadde-search: detail" \
  -H "x-cadde-resource-url: https://example.com/cadde/api/v4/catalog" \
  -H "Fiware-Service: smartcity"
```

#### NGSI データ交換(`/cadde/api/v4/entities`

)

&#x20;ヘッダーからクエリパラメータを解析してエンティティを取得します。`x-cadde-resource-url` ヘッダーからクエリパラメータを解析してエンティティを取得します。

| ヘッダー                        | 必須  | 説明                                                    |
| --------------------------- | --- | ----------------------------------------------------- |
| `x-cadde-resource-url`      | Yes | リソース URL(type、id、q、attrs、limit、offset をクエリパラメータとして含む) |
| `x-cadde-resource-api-type` | -   | レスポンス形式: `api/ngsi`(デフォルト)または `api/ngsi-ld`           |
| `x-cadde-provider`          | -   | データプロバイダ ID                                           |

```bash
# Retrieve entities in NGSIv2 format
curl "http://localhost:3000/cadde/api/v4/entities" \
  -H "x-cadde-resource-url: https://example.com/v2/entities?type=Sensor&q=temperature>20" \
  -H "x-cadde-resource-api-type: api/ngsi" \
  -H "x-cadde-provider: provider-001" \
  -H "Fiware-Service: smartcity"

# Retrieve entities in NGSI-LD format
curl "http://localhost:3000/cadde/api/v4/entities" \
  -H "x-cadde-resource-url: https://example.com/ngsi-ld/v1/entities?type=Sensor" \
  -H "x-cadde-resource-api-type: api/ngsi-ld" \
  -H "x-cadde-provider: provider-001" \
  -H "Fiware-Service: smartcity"
```

#### エラーレスポンス形式

CADDE v4 エンドポイントのエラーレスポンスは以下の形式です:

```json
{ "detail": "Resource not found", "status": 404 }
```

#### 認証

CADDE v4 エンドポイントは GeonicDB 認証(`requireAuth`)をバイパスします。認証は CADDE JWT 検証(`processCaddeRequestAsync`)で処理されます。

### 参考


* [CADDE(分野間データ連携基盤)](https://www.data-ex.jp/)
  
* [CADDE-sip/connector](https://github.com/CADDE-sip/connector)
  
* [DATA-EX](https://data-ex.jp/)

***

## イベントストリーミング

WebSocket API Gateway を使用したリアルタイムエンティティ変更ストリーミング。`EVENT_STREAMING_ENABLED=true`で有効化。

### 接続

```text
wss://{api-id}.execute-api.{region}.amazonaws.com/{stage}?tenant={tenantName}
```

### クライアントメッセージ

| アクション       | 説明                          |
| ----------- | --------------------------- |
| `subscribe` | エンティティタイプ / ID パターンでフィルタを設定 |
| `ping`      | キープアライブ(`pong` レスポンス)       |

### サーバーイベント

| タイプ             | 説明             |
| --------------- | -------------- |
| `entityCreated` | エンティティが作成されました |
| `entityUpdated` | エンティティが更新されました |
| `entityDeleted` | エンティティが削除されました |

詳細については、[イベントストリーミングドキュメント](../features/subscriptions.md)を参照してください。

***

## エラーレスポンス

### NGSIv2 エラーフォーマット

```json
{
  "error": "NotFound",
  "description": "The requested entity has not been found"
}
```

### NGSI-LD エラーフォーマット (RFC 7807 ProblemDetails)

NGSI-LD API エラーレスポンスは [RFC 7807](https://tools.ietf.org/html/rfc7807) ProblemDetails フォーマットで返されます。
Content-Type は `application/json` です(ETSI GS CIM 009 仕様に準拠するため、RFC 7807 の `application/problem+json` の代わりに標準 JSON MIME タイプが使用されます)。

```json
{
  "type": "https://uri.etsi.org/ngsi-ld/errors/ResourceNotFound",
  "title": "Resource Not Found",
  "status": 404,
  "detail": "Entity urn:ngsi-ld:Room:001 not found"
}
```

### HTTP ステータスコード

| コード   | 説明                                     |
| ----- | -------------------------------------- |
| `200` | 成功(データあり)                              |
| `201` | 作成成功                                   |
| `204` | 成功(データなし)                              |
| `207` | 部分的成功(バッチ操作)                           |
| `400` | 不正なリクエスト                               |
| `403` | 禁止(認証エラー)                              |
| `404` | リソースが見つかりません                           |
| `405` | メソッドが許可されていません(NGSI-LD、`Allow` ヘッダーあり) |
| `409` | 競合(既に存在する、など)                          |
| `500` | 内部サーバーエラー                              |

***

## 実装状況

### 実装済み機能

| 機能                                              | NGSIv2 | NGSI-LD |
| ----------------------------------------------- | ------ | ------- |
| Entity CRUD                                     | Yes    | Yes     |
| 属性操作                                            | Yes    | Yes     |
| 属性値の直接取得/更新                                     | Yes    | -       |
| バッチ操作                                           | Yes    | Yes     |
| サブスクリプション (HTTP 通知)                             | Yes    | Yes     |
| サブスクリプション (MQTT 通知)                             | Yes    | Yes     |
| イベントストリーミング (WebSocket)                         | Yes    | Yes     |
| エンティティタイプ                                       | Yes    | -       |
| クエリ言語 (q パラメータ)                                 | Yes    | Yes     |
| ソート (orderBy, orderDirection)                   | Yes    | Yes     |
| メタデータ制御 (metadata / sysAttrs)                   | Yes    | Yes     |
| 地理クエリ (coveredBy, within, intersects, disjoint) | Yes    | Yes     |
| 空間 ID 検索 (ZFXY 形式)                              | Yes    | Yes     |
| GeoJSON 出力                                      | Yes    | Yes     |
| 座標参照系 (CRS) 変換                                  | Yes    | Yes     |
| マルチテナンシー                                        | Yes    | Yes     |
| ページネーション                                        | Yes    | Yes     |
| keyValues 形式                                    | Yes    | Yes     |
| レジストレーション                                       | Yes    | Yes     |
| コンテキストプロバイダー (フェデレーション/クエリ転送)                   | Yes    | Yes     |
| コンテキストプロバイダー (更新転送)                             | Yes    | Yes     |
| CADDE 統合                                        | Yes    | Yes     |
| 認証 API (JWT ベース)                                | Yes    | Yes     |
| ユーザー/テナント管理 API                                 | Yes    | Yes     |
| `/version` エンドポイント                              | Yes    | -       |
| `/.well-known/ngsi-ld`                          | -      | Yes     |
| ヘルスチェック (`/health`)                             | Yes    | Yes     |

### 制限事項

| 機能                            | ステータス | 備考                                                  |
| ----------------------------- | ----- | --------------------------------------------------- |
| `near` 地理クエリ (近接検索)           | サポート  | Point ジオメトリのみ; 距離ソートおよび距離情報を `orderByDistance=true` |
| `minDistance` / `maxDistance` | サポート  | メートル単位で指定                                           |

***

## 使用例

### cURL でエンティティを作成する

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

### ジオクエリ(ポリゴンエリア検索)

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

***

## エンドポイントリファレンス

このセクションでは、すべての GeonicDB API エンドポイントのページネーション、認証/認可、およびステータスコード情報を要約します。

### API カテゴリ

| API カテゴリ       | ベースパス         | 認証                                | Content-Type          |
| -------------- | ------------- | --------------------------------- | --------------------- |
| Meta/Health    | `/`           | 不要\*†                             | `application/json`    |
| Authentication | `/auth`       | 不要                                | `application/json`    |
| User           | `/me`         | 必要                                | `application/json`    |
| NGSIv2         | `/v2`         | 必要\*                              | `application/json`    |
| NGSI-LD        | `/ngsi-ld/v1` | 必要\*                              | `application/ld+json` |
| Admin          | `/admin`      | 必要 (super\_admin / tenant\_admin) | `application/json`    |
| Catalog        | `/catalog`    | 必要\*                              | `application/json`    |

\* 認証は不要です:`AUTH_ENABLED=false`

† `/statistics`、`/cache/statistics`、`/metrics` は認証が必要です:`AUTH_ENABLED=true`

### 公開エンドポイント (メタ/ヘルス)

認証なしでアクセス可能なエンドポイント。

| エンドポイント                        | メソッド | 説明                                                   | 成功  | エラー           |
| ------------------------------ | ---- | ---------------------------------------------------- | --- | ------------- |
| `/llms.txt`                    | GET  | API ドキュメント (llms.txt)                                | 200 | -             |
| `/version`                     | GET  | FIWARE Orion 互換バージョン情報                               | 200 | -             |
| `/health`                      | GET  | 基本ヘルスチェック                                            | 200 | -             |
| `/health/live`                 | GET  | Kubernetes liveness プローブ                             | 200 | -             |
| `/health/ready`                | GET  | Kubernetes readiness プローブ                            | 200 | 503           |
| `/.well-known/ngsi-ld`         | GET  | NGSI-LD API ディスカバリー                                  | 200 | -             |
| `/api.json`                    | GET  | API リファレンス (JSON)                                    | 200 | -             |
| `/openapi.json`                | GET  | OpenAPI 3.0 仕様                                       | 200 | -             |
| `/statistics`                  | GET  | FIWARE Orion 互換統計情報 (認証が必要)                          | 200 | 401           |
| `/cache/statistics`            | GET  | キャッシュ統計情報 (認証が必要)                                    | 200 | 401           |
| `/metrics`                     | GET  | Prometheus メトリクス (認証が必要)                             | 200 | 401           |
| `/tools.json`                  | GET  | AI ツール定義 (Claude Tool Use / OpenAI Function Calling) | 200 | -             |
| `/.well-known/ai-plugin.json`  | GET  | AI プラグインマニフェスト                                       | 200 | -             |
| `/mcp`                         | POST | MCP (Model Context Protocol) Streamable HTTP エンドポイント | 200 | 400, 405, 500 |
| `/.well-known/agent-card.json` | GET  | A2A Agent Card                                       | 200 | -             |

### AI エージェントエンドポイント (AUTH\_ENABLED=true の場合は認証が必要)

| エンドポイント | メソッド | 説明                                        | 成功  | エラー                |
| ------- | ---- | ----------------------------------------- | --- | ------------------ |
| `/a2a`  | POST | A2A (Agent-to-Agent) JSON-RPC 2.0 エンドポイント | 200 | 400, 401, 405, 500 |

### 認証エンドポイント


* `/auth/*` は次の場合のみ利用可能`AUTH_ENABLED=true`
  
* `/oauth/token` は次の場合に利用可能`AUTH_ENABLED=true` (常に有効;`OAUTH_ENABLED` は非推奨)

| エンドポイント         | メソッド | 説明                                                                                  | 成功  | エラー      |
| --------------- | ---- | ----------------------------------------------------------------------------------- | --- | -------- |
| `/auth/login`   | POST | ユーザーログイン (JWT)                                                                      | 200 | 400, 401 |
| `/auth/refresh` | POST | トークン更新                                                                              | 200 | 400, 401 |
| `/auth/logout`  | POST | ログアウト (すべてのセッションを無効化、認証が必要)                                                         | 204 | 401      |
| `/auth/nonce`   | POST | API キートークン交換のための Nonce + PoW チャレンジ                                                  | 200 | 400      |
| `/oauth/token`  | POST | OAuth トークン取得 (M2M:`grant_type=client_credentials`、Browser SDK:`grant_type=api_key`) | 200 | 400, 401 |

### SDK

JavaScript SDK は npm パッケージとして利用可能です:`npm install @geolonia/geonicdb-sdk`

SDK は完全な公開 API を提供します:`login()`、`setCredentials()`、エンティティ CRUD、`request()`、`connect()`、`reconnect()`、`disconnect()`、`isConnected()`、`subscribe()`、`on()`/`off()` イベントリスナー (`tokenRefresh` イベントを含む)。詳細は SDK ドキュメントを参照してください。

### ユーザーエンドポイント

認証されたユーザーが自分の情報を管理するためのエンドポイント。

| エンドポイント        | メソッド | 説明           | 成功  | エラー      | 最小ロール |
| -------------- | ---- | ------------ | --- | -------- | ----- |
| `/me`          | GET  | 自分のプロフィールを取得 | 200 | 401      | user  |
| `/me/password` | POST | パスワード変更      | 204 | 400, 401 | user  |

### NGSIv2 / NGSI-LD エンドポイント

詳細なエンドポイント仕様については、以下を参照してください:

* [NGSIv2 API リファレンス](./ngsiv2.md)
  
* [NGSI-LD API リファレンス](./ngsild.md)

### Admin API

テナントとユーザーを管理するための API です。エンドポイントには、`super_admin` または `tenant_admin` ロールが必要です(`tenant_admin` は自テナントスコープのみ)。

#### テナント管理

| エンドポイント                                     | メソッド   | 説明                                      | 成功        | エラー                     | ページネーション       |
| ------------------------------------------- | ------ | --------------------------------------- | --------- | ----------------------- | -------------- |
| `/admin/tenants`                            | GET    | テナント一覧                                  | 200       | 400, 401, 403           | Yes (max: 100) |
| `/admin/tenants`                            | POST   | テナント作成                                  | 201       | 400, 401, 403, 409      | -              |
| `/admin/tenants/{tenantId}`                 | GET    | テナント取得                                  | 200       | 401, 403, 404           | -              |
| `/admin/tenants/{tenantId}`                 | PATCH  | テナント更新                                  | 204       | 400, 401, 403, 404, 409 | -              |
| `/admin/tenants/{tenantId}`                 | DELETE | テナント削除(Crypto-Shredding: `?shred=true`) | 204 / 200 | 400, 401, 403, 404      | -              |
| `/admin/tenants/{tenantId}/deletion-report` | GET    | 削除レポート取得                                | 200       | 401, 403, 404           | -              |
| `/admin/tenants/{tenantId}/activate`        | POST   | テナント有効化                                 | 204       | 401, 403, 404           | -              |
| `/admin/tenants/{tenantId}/deactivate`      | POST   | テナント無効化                                 | 204       | 401, 403, 404           | -              |
| `/admin/tenants/{tenantId}/ip-restrictions` | GET    | テナント IP 制限取得                            | 200       | 401, 403, 404           | -              |
| `/admin/tenants/{tenantId}/ip-restrictions` | PUT    | テナント IP 制限更新                            | 200       | 400, 401, 403, 404      | -              |
| `/admin/tenants/{tenantId}/ip-restrictions` | DELETE | テナント IP 制限削除                            | 204       | 401, 403, 404           | -              |
| `/admin/tenants/{tenantId}/users`           | GET    | テナントメンバー一覧(tenant\_admin: 自テナントのみ)      | 200       | 401, 403, 404           | Yes (max: 100) |
| `/admin/tenants/{tenantId}/users/{userId}`  | PUT    | テナントにユーザーを追加(tenant\_admin: 自テナントのみ)    | 200       | 400, 401, 403, 404      | -              |
| `/admin/tenants/{tenantId}/users/{userId}`  | DELETE | テナントからユーザーを削除(tenant\_admin: 自テナントのみ)   | 204       | 400, 401, 403, 404      | -              |

#### ユーザー管理

| エンドポイント                            | メソッド   | 説明                                     | 成功  | エラー                     | ページネーション       |
| ---------------------------------- | ------ | -------------------------------------- | --- | ----------------------- | -------------- |
| `/admin/users`                     | GET    | ユーザー一覧                                 | 200 | 400, 401, 403           | Yes (max: 100) |
| `/admin/users`                     | POST   | ユーザー作成                                 | 201 | 400, 401, 403, 409      | -              |
| `/admin/users/{userId}`            | GET    | ユーザー取得                                 | 200 | 401, 403, 404           | -              |
| `/admin/users/{userId}`            | PATCH  | ユーザー更新                                 | 204 | 400, 401, 403, 404, 409 | -              |
| `/admin/users/{userId}`            | DELETE | ユーザー削除                                 | 204 | 401, 403, 404           | -              |
| `/admin/users/{userId}/activate`   | POST   | ユーザー有効化                                | 204 | 401, 403, 404           | -              |
| `/admin/users/{userId}/deactivate` | POST   | ユーザー無効化                                | 204 | 401, 403, 404           | -              |
| `/admin/users/{userId}/unlock`     | POST   | ログインロック解除                              | 200 | 400, 401, 403, 404      | -              |
| `/admin/users/{userId}/tenants`    | GET    | ユーザーが所属するテナント一覧(self または super\_admin) | 200 | 401, 403                | Yes (max: 100) |

#### ポリシー管理(XACML 3.0 認可、super\_admin / tenant\_admin)

| エンドポイント                                 | メソッド   | 説明       | 成功  | エラー                | ページネーション       |
| --------------------------------------- | ------ | -------- | --- | ------------------ | -------------- |
| `/admin/policies`                       | GET    | ポリシー一覧   | 200 | 400, 401, 403      | Yes (max: 100) |
| `/admin/policies`                       | POST   | ポリシー作成   | 201 | 400, 401, 403, 409 | -              |
| `/admin/policies/{policyId}`            | GET    | ポリシー取得   | 200 | 401, 403, 404      | -              |
| `/admin/policies/{policyId}`            | PATCH  | ポリシー部分更新 | 200 | 400, 401, 403, 404 | -              |
| `/admin/policies/{policyId}`            | PUT    | ポリシー置換   | 200 | 400, 401, 403, 404 | -              |
| `/admin/policies/{policyId}`            | DELETE | ポリシー削除   | 204 | 401, 403, 404      | -              |
| `/admin/policies/{policyId}/activate`   | POST   | ポリシー有効化  | 200 | 401, 403, 404      | -              |
| `/admin/policies/{policyId}/deactivate` | POST   | ポリシー無効化  | 200 | 401, 403, 404      | -              |

**リソース属性** でポリシー Target に利用可能 `resources`:

| attributeId     | 説明                                    | ソース                         |
| --------------- | ------------------------------------- | --------------------------- |
| `path`          | HTTP リクエストパス(例: `/v2/entities/Room1`) | Request                     |
| `tenantService` | テナントサービス名(`Fiware-Service` ヘッダー)      | Request                     |
| `servicePath`   | ServicePath(`Fiware-ServicePath` ヘッダー)     | Request                     |
| `scope`         | NGSI-LD エンティティスコープ(カンマ区切り)            | Entity context              |
| `entityId`      | 対象エンティティ ID(例: `Room1`)               | エンティティコンテキスト                |
| `entityType`    | 対象エンティティタイプ (例: `Room`)               | リクエスト (自動抽出) / エンティティコンテキスト |
| `entityOwner`   | エンティティ作成者の userId (`createdBy` フィールド) | エンティティコンテキスト                |

> `entityType` は、パスレベルで HTTP リクエストから自動的に抽出されます — `?type=` クエリパラメータまたはリクエストボディの `type` / `@type` フィールドから — エンティティレベルのチェックなしでエンティティタイプベースのアクセス制御を可能にします。`entityId`、`entityOwner`、および `scope` は、エンティティレベルの認可チェック (`requireEntityAuthz` 経由) でのみ利用可能です。`scope` は、NGSI-LD エンティティのスコープ配列をカンマ区切り文字列として結合したものです — 柔軟なマッチングには `string-regexp` または `glob` を使用してください。

#### OAuth クライアント管理

| エンドポイント                           | メソッド   | 説明             | 成功  | エラー                | ページネーション       |
| --------------------------------- | ------ | -------------- | --- | ------------------ | -------------- |
| `/admin/oauth-clients`            | GET    | OAuth クライアント一覧 | 200 | 400, 401, 403      | Yes (max: 100) |
| `/admin/oauth-clients`            | POST   | OAuth クライアント作成 | 201 | 400, 401, 403      | -              |
| `/admin/oauth-clients/{clientId}` | GET    | OAuth クライアント取得 | 200 | 401, 403, 404      | -              |
| `/admin/oauth-clients/{clientId}` | PATCH  | OAuth クライアント更新 | 200 | 400, 401, 403, 404 | -              |
| `/admin/oauth-clients/{clientId}` | DELETE | OAuth クライアント削除 | 204 | 401, 403, 404      | -              |

#### セルフサービス OAuth クライアント管理

ユーザーは自身の OAuth クライアントを管理できます。ユーザーあたり最大 5 クライアント。オプションの `policyId` は、クライアントを既存の XACML ポリシーにバインドします。

| エンドポイント                                          | メソッド   | 説明                       | 成功  | エラー                | ページネーション       |
| ------------------------------------------------ | ------ | ------------------------ | --- | ------------------ | -------------- |
| `/me/oauth-clients`                              | GET    | 自身の OAuth クライアント一覧       | 200 | 400, 401           | Yes (max: 100) |
| `/me/oauth-clients`                              | POST   | 自身の OAuth クライアント作成       | 201 | 400, 401, 403      | -              |
| `/me/oauth-clients/{clientId}`                   | PATCH  | 自身の OAuth クライアント更新 (部分的) | 200 | 400, 401, 403, 404 | -              |
| `/me/oauth-clients/{clientId}`                   | DELETE | 自身の OAuth クライアント削除       | 204 | 400, 401, 403, 404 | -              |
| `/me/oauth-clients/{clientId}/regenerate-secret` | POST   | 自身のクライアントシークレット再生成       | 200 | 400, 401, 403, 404 | -              |

#### API キー管理

&#x20;ヘッダー経由の認証用 API キーを管理します。新しいキーはプレーン UUID 形式 (`X-Api-Key` ヘッダー経由の認証用 API キーを管理します。新しいキーはプレーン UUID 形式 (`randomUUID()`) を使用します。`gdb_` プレフィックスを持つ既存のキーは有効なままです。ストレージには SHA-256 ハッシュ化されます。プレーンテキストキーは作成時とリフレッシュ時にのみ返されます。一覧/取得レスポンスは `"key": "******"` を返します。オプションの `policyId` フィールドは、キーを既存の XACML ポリシーにバインドします (バインドされたポリシーのターゲットは評価中にバイパスされます)。`policyId` がない場合、キーはテナントポリシー + ロールデフォルト (api\_key = All Deny) にフォールバックします。

| エンドポイント                           | メソッド   | 説明                 | 成功  | エラー                | ページネーション       |
| --------------------------------- | ------ | ------------------ | --- | ------------------ | -------------- |
| `/admin/api-keys`                 | POST   | API キー作成           | 201 | 400, 401, 403      | -              |
| `/admin/api-keys`                 | GET    | API キー一覧           | 200 | 400, 401, 403      | Yes (max: 100) |
| `/admin/api-keys/{keyId}`         | GET    | API キー取得           | 200 | 401, 403, 404      | -              |
| `/admin/api-keys/{keyId}`         | PATCH  | API キー更新           | 204 | 400, 401, 403, 404 | -              |
| `/admin/api-keys/{keyId}`         | DELETE | API キー削除           | 204 | 401, 403, 404      | -              |
| `/admin/api-keys/{keyId}/refresh` | POST   | API キーリフレッシュ (再生成) | 200 | 401, 403, 404      | -              |

#### セルフサービス API キー管理

ユーザーは自分の API キーを管理できます。ユーザーあたり最大 5 個のキーまでです。

| エンドポイント                        | メソッド   | 説明                 | 成功  | エラー                | ページネーション       |
| ------------------------------ | ------ | ------------------ | --- | ------------------ | -------------- |
| `/me/api-keys`                 | POST   | 自分の API キーを作成      | 201 | 400, 401, 403      | -              |
| `/me/api-keys`                 | GET    | 自分の API キーを一覧表示    | 200 | 400, 401, 403      | Yes (max: 100) |
| `/me/api-keys/{keyId}`         | PATCH  | 自分の API キーを更新(部分)  | 200 | 400, 401, 403, 404 | -              |
| `/me/api-keys/{keyId}`         | DELETE | 自分の API キーを削除      | 204 | 400, 401, 403, 404 | -              |
| `/me/api-keys/{keyId}/refresh` | POST   | 自分の API キーを更新(再生成) | 200 | 401, 403, 404      | -              |

#### CADDE 設定管理

API 経由で CADDE(分野間データ連携基盤)設定を管理します。設定は MongoDB に保存され、環境変数は不要です。

| エンドポイント        | メソッド   | 説明                  | 成功  | エラー           | ページネーション |
| -------------- | ------ | ------------------- | --- | ------------- | -------- |
| `/admin/cadde` | GET    | CADDE 設定を取得         | 200 | 401, 403      | -        |
| `/admin/cadde` | PUT    | CADDE 設定を更新(upsert) | 200 | 400, 401, 403 | -        |
| `/admin/cadde` | DELETE | CADDE 設定を削除(無効化)    | 204 | 401, 403      | -        |

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

| フィールド             | 型       | 必須  | 説明                             |
| ----------------- | ------- | --- | ------------------------------ |
| `enabled`         | boolean | Yes | CADDE 機能を有効化/無効化               |
| `authEnabled`     | boolean | Yes | Bearer 認証を有効化/無効化              |
| `defaultProvider` | string  | -   | デフォルトプロバイダー ID                 |
| `jwtIssuer`       | string  | -   | JWT 発行者クレーム検証値                 |
| `jwtAudience`     | string  | -   | JWT オーディエンスクレーム検証値             |
| `jwksUrl`         | string  | -   | JWKS 公開鍵エンドポイント URL (HTTPS 必須) |

#### ルールエンジン管理

| エンドポイント                      | メソッド   | 説明       | 成功  | エラー                | ページネーション       |
| ---------------------------- | ------ | -------- | --- | ------------------ | -------------- |
| `/rules`                     | GET    | ルールを一覧表示 | 200 | 400, 401, 403      | Yes (max: 100) |
| `/rules`                     | POST   | ルールを作成   | 201 | 400, 401, 403, 409 | -              |
| `/rules/{ruleId}`            | GET    | ルールを取得   | 200 | 401, 403, 404      | -              |
| `/rules/{ruleId}`            | PATCH  | ルールを更新   | 204 | 400, 401, 403, 404 | -              |
| `/rules/{ruleId}`            | DELETE | ルールを削除   | 204 | 401, 403, 404      | -              |
| `/rules/{ruleId}/activate`   | POST   | ルールを有効化  | 200 | 401, 403, 404      | -              |
| `/rules/{ruleId}/deactivate` | POST   | ルールを無効化  | 200 | 401, 403, 404      | -              |

### カスタムデータモデル API

テナント固有のカスタムデータモデルを管理するための API。JWT 認証が必要で、XACML ポリシーベースの認可により、`tenant_admin` および `user` ロールが自身のテナント内でカスタムデータモデルを管理できます。

**関連ドキュメント**: [SMART\_DATA\_MODELS.md](../features/smart-data-models.md)

| エンドポイント                      | メソッド   | 説明              | 成功  | エラー                | ページネーション     |
| ---------------------------- | ------ | --------------- | --- | ------------------ | ------------ |
| `/custom-data-models`        | GET    | カスタムデータモデルの一覧取得 | 200 | 400, 401, 403      | はい (最大: 100) |
| `/custom-data-models`        | POST   | カスタムデータモデルの作成   | 201 | 400, 401, 403, 409 | -            |
| `/custom-data-models/{type}` | GET    | カスタムデータモデルの取得   | 200 | 401, 403, 404      | -            |
| `/custom-data-models/{type}` | PATCH  | カスタムデータモデルの更新   | 200 | 400, 401, 403, 404 | -            |
| `/custom-data-models/{type}` | DELETE | カスタムデータモデルの削除   | 204 | 401, 403, 404      | -            |

#### エンティティの検証

カスタムデータモデルが定義されると、エンティティの作成または更新時に自動的に検証が実行されます。検証は、`isActive: true` を持つモデルにのみ適用されます。

**検証チェック:**

| チェック                  | 説明                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 追加プロパティ               |  の場合、`additionalProperties: false` で定義されていない属性は拒否されます (デフォルト: `propertyDetails` — 任意の属性を許可)`true` — allows any attributes)                 |
| 必須フィールド               |  を持つ属性が存在するかどうか`required: true` are present                                                                                                |
| 型チェック                 |  に基づく型の検証 (string, number, integer, boolean, array, object, GeoJSON)`valueType` (string, number, integer, boolean, array, object, GeoJSON) |
| minLength / maxLength | 文字列長の制約                                                                                                                                    |
| minimum / maximum     | 数値範囲の制約                                                                                                                                    |
| pattern               | 正規表現パターンマッチ                                                                                                                                |
| enum                  | 許可される値のリスト                                                                                                                                 |

検証失敗時は `400 Bad Request` を返します:

```json
{
  "error": "BadRequest",
  "description": "Entity validation failed: temperature: Value (150) exceeds maximum (100)"
}
```

#### 自動 JSON Schema 生成

カスタムデータモデルが作成または更新されると、`propertyDetails` から JSON Schema (Draft 2020-12) が自動生成され、レスポンスの `jsonSchema` フィールドに含まれます。`jsonSchema` を手動で指定することも可能です。

#### @context プロパティ (JSON-LD 語彙マッピング)

&#x20;の各プロパティには、JSON-LD 語彙マッピングのためのオプションの `propertyDetails` フィールドを含めることができます (HTTP(S) URL)。これにより、自動生成される URI の代わりに、よく知られた語彙 (例: schema.org) を使用できます。`@context` field with an HTTP(S) URL for JSON-LD vocabulary mapping. This allows using well-known vocabularies (e.g., schema.org) instead of auto-generated URIs.

```json
{
  "propertyDetails": {
    "email": {
      "ngsiType": "Property",
      "valueType": "string",
      "example": "taro@example.com",
      "@context": "https://schema.org/email"
    },
    "name": {
      "ngsiType": "Property",
      "valueType": "string",
      "example": "田中太郎"
    }
  }
}
```


* &#x20;を持つプロパティ → 指定された URL が JSON-LD コンテキストで使用されます
  
`@context` → the specified URL is used in the JSON-LD context
  
* &#x20;を持たないプロパティ → 自動生成される URL (`@context`)
  
`https://geonicdb.geolonia.com/vocab/{tenantId}/{propertyName}`)
  
* プロパティ URI はエンティティタイプに依存しません (同じプロパティ名はテナント内で同じ URI を共有します)
  
* `@context` は HTTP(S) URL である必要があります (URN は受け付けられません)

#### @context 解決拡張

NGSI-LD レスポンスにおいて、カスタムデータモデルに `contextUrl` が設定されている場合、カスタムコンテキストは自動的にエンティティの `@context` に含まれます (コアコンテキストと共に配列として返されます)。

### カタログ API

| エンドポイント                                | メソッド | 説明              | 成功  | エラー      | ページネーション      |
| -------------------------------------- | ---- | --------------- | --- | -------- | ------------- |
| `/catalog`                             | GET  | DCAT-AP カタログの取得 | 200 | 401      | -             |
| `/catalog/datasets`                    | GET  | データセットの一覧取得     | 200 | 400, 401 | はい (最大: 1000) |
| `/catalog/datasets/{datasetId}`        | GET  | データセットの取得       | 200 | 401, 404 | -             |
| `/catalog/datasets/{datasetId}/sample` | GET  | サンプルデータの取得      | 200 | 401, 404 | -             |

### ベクタータイル API

| エンドポイント                                 | メソッド | 説明                          | 成功  | エラー      |
| --------------------------------------- | ---- | --------------------------- | --- | -------- |
| `/v2/tiles`                             | GET  | TileJSON メタデータの取得 (NGSIv2)  | 200 | 401      |
| `/v2/tiles/{z}/{x}/{y}.geojson`         | GET  | GeoJSON タイルの取得 (NGSIv2)     | 200 | 400, 401 |
| `/ngsi-ld/v1/tiles`                     | GET  | TileJSON メタデータの取得 (NGSI-LD) | 200 | 401      |
| `/ngsi-ld/v1/tiles/{z}/{x}/{y}.geojson` | GET  | GeoJSON タイルの取得 (NGSI-LD)    | 200 | 400, 401 |

### Event Streaming API

WebSocket を使用したリアルタイムエンティティ変更ストリーミング。`EVENT_STREAMING_ENABLED=true`で有効化されます。

| エンドポイント                                                                   | プロトコル     | 説明                                                |
| ------------------------------------------------------------------------- | --------- | ------------------------------------------------- |
| `wss://{api-id}.execute-api.{region}.amazonaws.com/{stage}?tenant={name}` | WebSocket | エンティティ変更イベントをストリーミング(認証は`Authorization`ヘッダー経由で送信) |

詳細については、[Event Streaming Documentation](../features/subscriptions.md)を参照してください。

### アクセス権限の概要

| API カテゴリ                                     | user        | tenant\_admin | super\_admin |
| -------------------------------------------- | ----------- | ------------- | ------------ |
| 公開エンドポイント                                    | Yes         | Yes           | Yes          |
| `/auth/*`                                    | Yes         | Yes           | Yes          |
| `/me/*`                                      | Yes         | Yes           | Yes          |
| `/statistics`、`/metrics`、`/cache/statistics` | Yes         | Yes           | Yes          |
| `/v2/*`                                      | Yes (自テナント) | Yes (自テナント)   | Denied (403) |
| `/ngsi-ld/*`                                 | Yes (自テナント) | Yes (自テナント)   | Denied (403) |
| `/catalog/*`                                 | Yes (自テナント) | Yes (自テナント)   | Denied (403) |
| `/admin/policies`、`/admin/policy-sets`       | No          | Yes (自テナント)   | Yes (全テナント)  |
| `/admin/*`(その他)                              | No          | No            | Yes          |
| `/custom-data-models`                        | Yes (自テナント) | Yes (自テナント)   | Denied (403) |
| `/rules`                                     | No          | Yes (自テナント)   | Denied (403) |
| WebSocket                                    | Yes (自テナント) | Yes (自テナント)   | Denied (403) |

***

## 関連リンク


* [FIWARE NGSI v2 仕様](https://fiware.github.io/specifications/ngsiv2/stable/)
  
* [ETSI NGSI-LD 仕様](https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/01.06.01_60/gs_CIM009v010601p.pdf)
  
* [FIWARE Orion Context Broker ドキュメント](https://fiware-orion.readthedocs.io/)
  
* [IPA 空間 ID ガイドライン](https://www.ipa.go.jp/digital/architecture/guidelines/4dspatio-temporal-guideline.html)
  
* [デジタル庁空間 ID](https://www.digital.go.jp/policies/mobility_and_infrastructure/spatial-id)
  
* [RFC 7946 GeoJSON](https://datatracker.ietf.org/doc/html/rfc7946)
