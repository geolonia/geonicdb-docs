---
title: "API Common Specification"
description: "GeonicDB API common specification, authentication, and query parameters"
outline: deep
---
# GeonicDB Context Broker API ドキュメント

これは AWS Lambda 上で動作する FIWARE Orion 互換の Context Broker の API ドキュメントです。NGSIv2 と NGSI-LD の両方の API をサポートしています。

## 目次


* [概要](#overview)
  
* [認証とマルチテナンシー](#認証とマルチテナンシー)
  
* [ページネーション](#ページネーション)
  
* [認証 API](#認証-api)
  
* [メタエンドポイント](#meta-endpoints)
  
* [NGSIv2 API](#ngsiv2-api) (→ [API\_NGSIV2.md](./ngsiv2.md))
  
* [NGSI-LD API](#ngsi-ld-api) (→ [API\_NGSILD.md](./ngsild.md))
  
* [クエリ言語](#クエリ言語)
  
* [ジオクエリ](#geo-queries)
  
* [空間 ID 検索](#空間-id-検索)
  
* [GeoJSON 出力](#geojson-出力)
  
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

* [NGSIv2 / NGSI-LD 相互運用ガイド](../core-concepts/ngsiv2-vs-ngsild.md) - 両 API 間の相互運用性、型マッピング、ベストプラクティス
  
* [WebSocket イベントストリーミング](../features/subscriptions.md) - リアルタイムイベントサブスクリプション、実装例、ベストプラクティス

### ベース URL

```text
https://{api-gateway-url}/{stage}
```

### サポートされている API

| API Version | Base Path     | Content-Type          |
| ----------- | ------------- | --------------------- |
| NGSIv2      | `/v2`         | `application/json`    |
| NGSI-LD     | `/ngsi-ld/v1` | `application/ld+json` |

### 末尾のスラッシュ (#1582)

末尾の単一スラッシュは正規化されて削除されます (Orion-LD 互換): `/ngsi-ld/v1/entities/` は `/ngsi-ld/v1/entities` として扱われ、`/health/` や `/version/` などの運用エンドポイントはスラッシュのない形式と同じように応答します。実際の API リクエストに対する**末尾のダブルスラッシュ** (`//`) は `400 BadRequest` で拒否されます。仕様 (ETSI GS CIM 009、NGSIv2) では末尾スラッシュ付きパスは定義されていませんが、これらを正規化することで、スラッシュを追加するクライアント/テストスイートとの相互運用性が向上し、ロードバランサーまたはモニターが末尾スラッシュ付きで設定されている場合のヘルスチェックの誤報を回避できます。

> **注意 (CORS プリフライト)**: 非 API パス (`/version`、`/health` など) に対する `OPTIONS` リクエストは、パス正規化の前に CORS レイヤーによって直接 `204` で応答されるため、そのようなパスへの末尾 `//` の `OPTIONS` プリフライトは `400` ではなく `204` を返します。プリフライトはリクエストボディを持たず、データ/認可の決定も行わないため、これは無害です。データパス (`/ngsi-ld/*`、`/v2/*`) に対する `OPTIONS` は他のメソッドと同様に正規化されます。

### OPTIONS メソッド

`OPTIONS` メソッドはすべてのエンドポイントでサポートされています。CORS プリフライトリクエストに応答して、許可されたメソッドとヘッダーに関する情報を返します。

#### レスポンス形式

OPTIONS リクエストは以下のヘッダーと共に `204 No Content` を返します:

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

> **注意**: `If-None-Match` / `If-Modified-Since` は `Access-Control-Allow-Headers` に明示的にリストされているため、ブラウザの HTTP キャッシュ自動再検証と SDK の条件付きリクエストをプリフライト拒否なしでクロスオリジンで発行できます (#1065)。

### エンティティ ID の一意性 (GeonicDB 拡張)

> **GeonicDB 拡張**: この動作は、同じ ID を持つが異なる型のエンティティが共存できる標準 NGSIv2 仕様とは異なります。

GeonicDB では、エンティティ ID は**テナント** (`Fiware-Service`) と**ServicePath** (`Fiware-ServicePath`) のスコープ内で一意です。エンティティ `type` は一意性制約の**一部ではありません**。

**主な動作:**


* 既存のエンティティと同じ ID を持つエンティティを作成すると (異なる `type` であっても) `409 AlreadyExists` が返される
  
* バッチアップサート操作は `entityId` のみでエンティティをマッチング (型は上書き可能)
  
* 同じ ID のエンティティ間の型の曖昧性解消のための NGSIv2 `?type=` クエリパラメータは適用されなくなった

この設計は、エンティティ ID が URI であり本質的に一意である NGSI-LD 仕様に準拠しています。エンティティ ID は、テナント、servicePath、プロトコルごとに一意です。NGSIv2 と NGSI-LD のエンティティは完全に分離されており、同じエンティティ ID が各プロトコルで独立して存在できます。

***

## 認証とマルチテナンシー

### 必須ヘッダー

すべてのリクエストには、以下のヘッダーを含めることを推奨します:

| Header                             | Required    | Description                                                                                                                             | Default                              |
| ---------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `Fiware-Service` / `NGSILD-Tenant` | Recommended | Tenant name (alphanumeric and underscores only)                                                                                         | `default`                            |
| `Fiware-ServicePath`               | NGSIv2 only | Hierarchical path within the tenant (starts with `/`). **Ignored by NGSI-LD API** — use `scope` property and `scopeQ` parameter instead | `/` (equivalent to `/#` for queries) |
| `Fiware-Correlator`                | Optional    | Correlation ID for request tracing                                                                                                      | Auto-generated                       |

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

[FIWARE Orion 仕様](https://fiware-orion.readthedocs.io/en/1.3.0/user/service_path/index.html) に準拠しています。

#### 基本形式


* `/` で始まる絶対パスのみが許可されます
  
* 英数字とアンダースコアのみが許可されます
  
* 最大 10 階層、各階層は最大 50 文字まで

```bash
# Retrieve entities at a specific path
curl "http://localhost:3000/v2/entities" \
  -H "Fiware-Service: smartcity" \
  -H "Fiware-ServicePath: /Madrid/Gardens"
```

#### 階層検索 (`/#`

)

`/#` サフィックスを使用すると、指定されたパスとそのすべての子パスを検索できます(**クエリ操作のみ**)。

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

#### デフォルト動作

| Operation                     | When Header is Omitted | Description                |
| ----------------------------- | ---------------------- | -------------------------- |
| Query (GET)                   | `/`                    | Search root path only      |
| Write (POST/PUT/PATCH/DELETE) | `/`                    | Create/update in root path |

**注意**: 書き込み操作では、単一の非階層パスのみを使用できます。`/#` または複数パスを指定するとエラーになります。

***

## ページネーション

すべてのリスト型 API エンドポイントでページネーションがサポートされています。

### パラメーター

| Parameter   | Description                                                                                                                                                                          | Default | Maximum               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | --------------------- |
| `limit`     | Maximum number of results to return                                                                                                                                                  | 20      | 1000 (Admin API: 100) |
| `offset`    | Number of results to skip                                                                                                                                                            | 0       | 10000                 |
| `pageToken` | Opaque continuation token from the previous response's next-page header (`Fiware-Next-Token` / `NGSILD-Next`). Enables **keyset pagination** on the default sort — see below (#1435) | -       | -                     |

### レスポンスヘッダー

各 API タイプに対して、総数を示すヘッダーが返されます:

| API         | Header Name            | Condition                                                                |
| ----------- | ---------------------- | ------------------------------------------------------------------------ |
| NGSIv2      | `Fiware-Total-Count`   | Only when requested via `options=count` (opt-in per FIWARE NGSIv2 spec)  |
| NGSI-LD     | `NGSILD-Results-Count` | Only when requested via `count=true` (opt-in per ETSI GS CIM 009 §5.5.6) |
| Admin API   | `X-Total-Count`        | Always returned                                                          |
| Catalog API | `X-Total-Count`        | Always returned                                                          |

> NGSI エンティティリストエンドポイントは、カウントが要求されない場合、カウントクエリを完全にスキップします。さらなるページは、`Link` (`rel="next"`) / next-page token で示されます (#1434)。

### Link ヘッダー

すべてのリストエンドポイントは、[RFC 8288](https://www.rfc-editor.org/rfc/rfc8288) に準拠した `Link` ヘッダーを返し、次のページ (`rel="next"`) と前のページ (`rel="prev"`) の URL を提供します。結果が単一ページに収まる場合、`Link` ヘッダーは返されません。

```http
Link: <https://api.example.com/v2/entities?limit=10&offset=20>; rel="next", <https://api.example.com/v2/entities?limit=10&offset=0>; rel="prev"
```

### Keyset ページネーション (`pageToken`

、#1435)

エンティティリストエンドポイント (NGSIv2 `/v2/entities`、NGSI-LD `/ngsi-ld/v1/entities`) は、**デフォルトソート** (`createdAt` 昇順、次に `_id`) で **keyset (seek) ページネーション** をサポートしています。これにより、深いオフセットページの線形 `skip` コストを回避できます。


* 各レスポンスの next-page token (`Fiware-Next-Token` / `NGSILD-Next`) は、最後に返されたエンティティの位置をエンコードします。これを**不透明**なものとして扱ってください — 自分でデコードまたは構築しないでください。
  
* 次のページを取得するには、`pageToken` クエリパラメータを介してそれを送り返します。Context Brokerは、`skip` ではなく、インデックス範囲スキャン (`O(log n)`) で次のページを解決します。
  
* keyset パスでは、`Link` `rel="next"` URL は `offset` の代わりに `pageToken` を含みます (keyset は前方のみなので、`rel="prev"` はありません)。

```bash
# Page 1 — read the Fiware-Next-Token response header
curl -i "http://localhost:3000/v2/entities?limit=100" -H "Fiware-Service: smartcity"

# Page 2 — send that token back as pageToken
curl "http://localhost:3000/v2/entities?limit=100&pageToken=<token-from-page-1>" \
  -H "Fiware-Service: smartcity"
```

注意事項と制約:


* `offset`/`limit` は完全にサポートされており、変更はありません。`pageToken` は追加機能であり、keyset は送り返した場合にのみアクティブになります。
  
* `pageToken` はデフォルトソートに対してのみ有効です。`orderBy` (または距離順の geo-query) と組み合わせると `400` が返されます。
  
* `pageToken` と `offset` は相互に排他的です (両方が提供された場合は `400`)。
  
* `pageToken` を再利用しながら、ページ間でフィルターパラメータ (`q`、`mq`、`type`、…) を変更すると、結果は未定義になります (行をスキップまたは繰り返す可能性があります) — これは標準的な keyset の注意事項です。
  
* `options=count` / `count=true` は、(トークン位置とは独立して) 完全な総数を返します。

### 検証

無効なページネーションパラメータは `400 Bad Request` を返します:

| Error Condition                 | Error Message                                               |
| ------------------------------- | ----------------------------------------------------------- |
| Negative limit                  | `Invalid limit: must not be negative`                       |
| Negative offset                 | `Invalid offset: must not be negative`                      |
| limit=0                         | `Invalid limit: must be greater than 0`                     |
| Exceeds maximum                 | `Invalid limit: must not exceed 1000`                       |
| Non-numeric                     | `Invalid limit: must be a valid integer`                    |
| Invalid `pageToken`             | `Invalid pageToken`                                         |
| `pageToken` + `offset` together | `offset and pageToken must not be used together`            |
| keyset `pageToken` + `orderBy`  | `pageToken is only valid for default sort (remove orderBy)` |

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


* `offset` が総数を超える場合、空の配列が返されます (エラーではありません)
  
* FIWARE Orion 仕様に準拠しています

***

## HTTP キャッシュコントロール (ETag / 条件付きリクエスト)

GET エンドポイントは、エンドポイントクラスに基づいてキャッシュ関連のヘッダーを返します。クライアントは、[RFC 7232](https://datatracker.ietf.org/doc/html/rfc7232) および [RFC 7234](https://datatracker.ietf.org/doc/html/rfc7234) に準拠して、これらを使用して変更されていないレスポンスボディの転送をスキップできます。

### エンドポイントクラス

| Class        | Endpoints                                                                                                                                                                                                                                                                         | Validator (ETag/Last-Modified)                                        | Conditional Requests                              | Cache-Control                                     |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------- |
| **Data**     | `/v2/entities` (list, single, attrs, attrs/{name}, attrs/{name}/value), `/v2/subscriptions`, `/v2/registrations`, `/ngsi-ld/v1/entities` (list, single, attrs, attrs/{name}), `/ngsi-ld/v1/subscriptions`, `/ngsi-ld/v1/csourceRegistrations`, `/ngsi-ld/v1/csourceSubscriptions` | ✓                                                                     | ✓ (`If-None-Match` / `If-Modified-Since` → `304`) | `private, no-cache`                               |
| **Temporal** | `/ngsi-ld/v1/temporal/entities` (list, single, including aggregation)                                                                                                                                                                                                             | ✗ (no ETag — time-series aggregation lacks cheap monotonic validator) | ✗                                                 | `private, no-cache`                               |
| **Meta**     | `/v2/types`, `/ngsi-ld/v1/types`, `/ngsi-ld/v1/attributes` (list and single)                                                                                                                                                                                                      | ✗ (no ETag, no Last-Modified)                                         | ✗ (no `304` support)                              | `private, max-age=60, stale-while-revalidate=120` |

すべてのキャッシュ制御されたレスポンスは同じ `Vary` ヘッダーを共有します:`NGSILD-Tenant, Fiware-Service, Fiware-ServicePath, Authorization, X-Api-Key, Accept, x-cadde-options`(テナント + 認証 + コンテンツネゴシエーション + CADDE オプションの分離、CloudFront のような共有キャッシュに必要)。

### レスポンスヘッダー(データエンドポイント)

| Header          | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ETag`          | Weak entity tag (`W/"..."`, RFC 7232 §2.3.2 weak validator). Generation always mixes a **resource scope** (`path + Accept + representation + resolved tenant + servicePath`) into the seed so that different endpoints, Accept formats, **tenants**, or **service paths** produce distinct ETags even when the underlying state is identical. The tenant / servicePath slots come from the **resolved `TenantContext`** produced by `extractTenantContext` (CADDE `x-cadde-options` merge included) — raw request headers are not re-read (#1835). The tenant / servicePath seed defends against cross-tenant ETag collision even if `Vary` is mishandled by an intermediate cache. <br>• **NGSI-LD entity list** (`GET /ngsi-ld/v1/entities`, non-federated, non-geoNear, non-materialized): lightweight validator derived from `total count + max(modifiedAt)` with a scope that also includes the full query string, computed **without fetching entity bodies** so `If-None-Match` is evaluated and `304` returned before the heavy query (#1261). Federated / geoNear / join / splitEntities / entityMap paths fall back to the streaming digest below. <br>• **Other lists** (NGSIv2 entities, subscriptions, registrations, csource\*): streaming digest of each element's `id + modifiedAt`, combined with the total count and the resource scope. <br>• **Single resources**: hash of `modifiedAt` combined with the resource scope. |
| `Last-Modified` | RFC 1123 HTTP-date of the latest `modifiedAt` in the result set.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `Cache-Control` | `private, no-cache` — `private` forbids storage in shared / intermediate caches (CloudFront, ISP proxies, corporate proxies). `no-cache` forces revalidation before reuse from a private cache.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `Vary`          | `NGSILD-Tenant, Fiware-Service, Fiware-ServicePath, Authorization, X-Api-Key, Accept, x-cadde-options`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

### レスポンスヘッダー(メタエンドポイント)

| Header          | Description                                                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Cache-Control` | `private, max-age=60, stale-while-revalidate=120` — shared/intermediate cache storage is forbidden; private cache can reuse briefly with background revalidation. |
| `Vary`          | Same as data endpoints.                                                                                                                                           |

メタエンドポイントは意図的に `ETag` / `Last-Modified` を省略しています。これは、それらのコンテンツが集約クエリから派生しており、安価な単調バリデーターを持たないためです。クライアントは条件付きリクエストではなく、プライベートキャッシュの `max-age` ウィンドウに依存する必要があります。

### 条件付きリクエスト(データエンドポイントのみ)

クライアントは条件付きリクエストヘッダーを送信して、結果が変更されていない場合に `304 Not Modified`(空のボディ)を受信できます:

| Request Header                   | Behavior                                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| `If-None-Match: <ETag>`          | Server compares with current `ETag`. If matched, returns `304`. Wildcard `*` always matches. |
| `If-Modified-Since: <HTTP-date>` | Server compares with current `Last-Modified`. If unchanged, returns `304`.                   |

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

### 注記


* ETag は弱い(`W/`)です — バイト単位の一致ではなく、セマンティックな等価性を伝えます。同じデータで属性の順序が異なる 2 つのレスポンスは、同じ ETag を共有します。
  
* ETag 生成には、リソースパスと `Accept` ヘッダーがシードに含まれます。異なるエンドポイントと異なるコンテンツネゴシエーションは、基盤となる状態(例:空のリスト)が同一であっても、常に異なる ETag を生成し、エンドポイント間または Accept 間のキャッシュポイズニングを防ぎます。
  
* `304` レスポンスは `ETag`、`Last-Modified`、`Cache-Control`、`Vary`、および CORS ヘッダーを保持します。
  
* 条件付き評価は、ステータス `200` の `GET` および `HEAD` リクエストに適用されます。`HEAD` は空のボディで `GET` と同じヘッダーを返し(RFC 7231 §4.3.2)、`200` の場合でもボディを転送せずに軽量な再検証を可能にします。
  
* キャッシュ制御は以下に適用されます:
  
  * **NGSIv2**: `/v2/entities`(リスト / 単一 / attrs / attrs+name / attrs+name+value)、`/v2/subscriptions`、`/v2/registrations`、`/v2/types`
    
  * **NGSI-LD Data**: `/ngsi-ld/v1/entities`(リスト / 単一 / attrs / attrs+name)、`/ngsi-ld/v1/subscriptions`、`/ngsi-ld/v1/csourceRegistrations`、`/ngsi-ld/v1/csourceSubscriptions`
    
  * **NGSI-LD Meta**: `/ngsi-ld/v1/types`、`/ngsi-ld/v1/attributes`
    
  * **NGSI-LD Temporal**: `/ngsi-ld/v1/temporal/entities`(リストと単一、`Cache-Control` のみ — `ETag` / `Last-Modified` なし)

### クライアント駆動のキャッシュ制御

クライアントは `Cache-Control` リクエストヘッダーを送信して、キャッシュ動作に影響を与えることができます:

| Request Header             | Server Behavior                                                                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `Cache-Control: no-store`  | Server overrides response `Cache-Control` to `no-store` (CDN/intermediary cache suppression hint).                                 |
| `Cache-Control: no-cache`  | Server makes no special override; the endpoint's default policy still applies (data → revalidation; meta → `max-age=60` etc).      |
| `Cache-Control: max-age=N` | Reserved for edge-cache layer (Phase 3 / CloudFront). The Lambda server itself is stateless and does not interpret this directive. |

### エラーレスポンスのキャッシング (#1821)

RFC 9110 §15.1 は、ヒューリスティックにキャッシュ可能なステータスコードを 200、203、204、206、300、301、308、404、405、410、414、501 と定義しています。このうちエラーステータスは 404、405、410、414、501 です。明示的な `Cache-Control` ディレクティブがない場合、共有キャッシュ(例えば CloudFront Error Caching Minimum TTL)はこれらのレスポンスをヒューリスティックに保存する可能性があります。テナントスコープのエンティティ GET において、別のテナントからキャッシュされた 404 が存在オラクル(CWE-525 クラス)になる可能性があります。

GeonicDB のエラーハンドラは、生成するすべてのヒューリスティックにキャッシュ可能なエラーに `Cache-Control: no-store` を設定します。ほとんどの 400 クラスのエラーはヒューリスティックにキャッシュ可能ではないため、上書きされません。エラーハンドラはこれらのレスポンスに独自の `Vary` を追加しません(CORS レイヤーは引き続き `Vary: Origin` を追加します)。

| Status                      | Error-handler `Cache-Control` |
| --------------------------- | ----------------------------- |
| 404 / 405 / 410 / 414 / 501 | `no-store`                    |
| 400 / 401 / 403 / 409 / …   | (no override)                 |

***

## 認証 API

認証機能により、ユーザー認証とアクセス制御が可能になります。

### 有効化

認証はデフォルトで無効になっています。以下の環境変数で有効にすることができます。

**注意**: `AUTH_ENABLED=false` の場合、認証関連のエンドポイント(`/auth/*`、`/me`、`/me/*`、`/admin/*`)は 404 を返します。

**重要**: 認証はデフォルトで有効になっています(明示的な `AUTH_ENABLED=false` によってのみ無効化され、これはローカル開発を目的としています)。有効な間、NGSI API エンドポイント(`/v2/*`、`/ngsi-ld/*`、`/catalog/*`)へのアクセスには認証が必要です。認証なしでアクセスすると `401 Unauthorized` エラーが返されます。

| Environment Variable     | Default | Description                                                 |
| ------------------------ | ------- | ----------------------------------------------------------- |
| `AUTH_ENABLED`           | `false` | Enable authentication                                       |
| `JWT_SECRET`             | -       | Secret for JWT token signing (32+ characters recommended)   |
| `JWT_EXPIRES_IN`         | `1h`    | Access token expiration                                     |
| `JWT_REFRESH_EXPIRES_IN` | `7d`    | Refresh token expiration                                    |
| `SUPER_ADMIN_EMAIL`      | -       | Super admin email address set via environment variable      |
| `SUPER_ADMIN_PASSWORD`   | -       | Super admin password set via environment variable           |
| `ADMIN_ALLOWED_IPS`      | -       | IPs/CIDRs allowed to access the Admin API (comma-separated) |

### ロールと権限

| Role           | Description          | Permissions                                                                                                                                          |
| -------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `super_admin`  | Super administrator  | `/admin/*`, `/auth/*`, `/me/*`, monitoring endpoints only. **Cannot** access data APIs (`/v2/*`, `/ngsi-ld/*`, `/catalog*`, `/rules*`) — returns 403 |
| `tenant_admin` | Tenant administrator | Manage users within their own tenant                                                                                                                 |
| `user`         | General user         | View own profile and change password only                                                                                                            |

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

| Parameter        | Type             | Required | Description                                                                                                                                   |
| ---------------- | ---------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `email`          | string           | Yes      | Email address                                                                                                                                 |
| `password`       | string           | Yes      | Password                                                                                                                                      |
| `tenantId`       | string           | No       | Tenant UUID. Issues a JWT scoped to that tenant. Mutually exclusive with `tenantName`                                                         |
| `tenantName`     | string           | No       | Tenant name (#1223). Resolved server-side to a tenant UUID. Mutually exclusive with `tenantId`                                                |
| `resourceScopes` | ResourceScope\[] | No       | Entity-level access control scopes. Full access if omitted. See [AUTH.md](../reference/auth.md#resource-scopesgeonicdb-extension) for details |

**テナント解決の優先順位**:

1. `body.tenantId` (UUID、最優先)
   
2. `body.tenantName` (サーバー側で UUID に解決、#1223)
   
3. `NGSILD-Tenant` / `Fiware-Service` ヘッダー (名前により UUID に解決)
   
4. プライマリテナント (`user.tenantId`) — 何も指定されていない場合のフォールバック

`tenantId` と `tenantName` は **相互排他的** です — 両方を指定すると `400 Bad Request` が返されます。ヘッダー値は `^[a-z0-9_]+$` に一致する必要があります。テナント名は、`tenants.name` の部分一意インデックスにより、アクティブ/非アクティブテナント間で一意性が保証されます (ソフト削除されたテナントは除外、#1223)。

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
  "refreshToken": "<refresh_token>",
  "tenantId": "<optional_target_tenant_id>"
}
```


* `tenantId` (オプション): 別 tenant scope へシームレスに切り替える。ユーザーが対象 tenant に active な membership を持つ必要がある。`super_admin` の場合は無視される。
  
* 切替不可 (membership なし / inactive / tenant inactive) → `403 Forbidden`
  
* `refreshToken` 自体が無効 / 期限切れ → `401 Unauthorized`
  
* `user.isActive=false` (アカウント無効化) → `401 Unauthorized`

**レスポンス**: ログインと同じ形式。

`availableTenants` は **ユーザーが 1 つ以上の active membership を持つ場合のみ含まれる** (`super_admin` や membership 0 件のユーザーでは省略される)。クライアントは存在しない可能性を考慮して扱うこと。

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

**注意**: パスワードを変更すると、既存のすべてのアクセストークンとリフレッシュトークンが無効化されます。新しいトークンを取得するには、再度ログインしてください。

### ログアウト

```http
POST /auth/logout
Authorization: Bearer <accessToken>
```

すべてのセッションを無効化します。このユーザーに対して発行されたすべてのアクセストークンとリフレッシュトークンが即座に無効化されます。

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

**DPoP トークンバインディング**(オプション): [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) に従って ECDSA P-256 proof JWT を含む `DPoP` ヘッダーを含めます。これが存在する場合、レスポンスの `token_type` は `"DPoP"` になり、JWT には proof キーにバインドする `cnf.jkt` クレームが含まれます。サーバーは DPoP-Nonce (RFC 9449 §8) を要求します — 最初のリクエストは `DPoP-Nonce` ヘッダーとともに `400 use_dpop_nonce` を返します。proof の `nonce` クレームに nonce を含めて再試行してください。詳細は [AUTH.md](../reference/auth.md#dpop-token-binding-rfc-9449) を参照してください。

### Admin API

Admin API は、`super_admin` または `tenant_admin` ロールを持つユーザーのみがアクセスできます。

#### ユーザー一覧

```http
GET /admin/users
Authorization: Bearer <accessToken>
```

**クエリパラメータ**

| Parameter  | Description                             |
| ---------- | --------------------------------------- |
| `tenantId` | Filter by tenant ID (super\_admin only) |
| `role`     | Filter by role                          |
| `limit`    | Number of results to retrieve           |
| `offset`   | Offset                                  |

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
  "primaryTenantId": "tenant-456"
}
```

**招待モード (#1532)** — `passwordResetRequired: true` を設定し(`password` は省略)、サーバーが生成した一時的なワンタイムパスワードでアカウントを作成し、初回ログイン時にパスワード変更を強制します:

```json
{
  "email": "newuser@example.com",
  "role": "user",
  "primaryTenantId": "tenant-456",
  "passwordResetRequired": true
}
```

`201` レスポンスには `temporaryPassword` と `expiresAt`(デフォルト TTL 7 日)が含まれ、`Cache-Control: no-store` が付与されます。`password` と `passwordResetRequired: true` を同時に送信すると `400` で拒否されます。初回ログインのワンショットフローについては [AUTH.md](../reference/auth.md) を参照してください。

#### ユーザーパスワードのリセット

**既存**ユーザー(例:パスワードを忘れた場合)に対して新しい一時パスワードを発行し、次回ログイン時に変更を強制します:

```http
POST /admin/users/{userId}/reset-password
Authorization: Bearer <accessToken>
```

`{ userId, temporaryPassword, expiresAt, passwordResetRequired, message }` を `Cache-Control: no-store` と共に返します。認可:`super_admin`(すべてのユーザー)/ `tenant_admin`(自分のテナント内のユーザー)。

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

ここで `password` を設定すると、**保留中の強制パスワード変更がクリアされ**(#1566)、**ユーザーの既存のパスワード派生セッションが取り消されます** — 管理者が選択したパスワードは即座に使用可能になり、ユーザーは次回ログイン時にリセットを求められません。

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

> **注意**: テナント名は小文字の英数字とアンダースコアのみを含む必要があります (`^[a-z0-9_]+$`)。

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

**カスケード削除**: テナントが削除されると、関連するすべてのデータ (エンティティ、サブスクリプション、登録、ルール、ポリシー、ユーザー、メンバーシップ、および全 16 コレクション) が自動的にカスケード削除されます。削除が開始される前に、テナントは自動的に無効化され、新しい API リクエストがブロックされます。

#### テナントの有効化/無効化

```http
POST /admin/tenants/{tenantId}/activate
POST /admin/tenants/{tenantId}/deactivate
Authorization: Bearer <accessToken>
```

### カスタムデータモデル管理

> **注意**: カスタムデータモデル API は `/custom-data-models` に移動しました。詳細は [Custom Data Models API](#custom-data-models-api) セクションを参照してください。

### IP 制限

**SaaS 利用者の方へ**: これは tenant 設定 API 経由で設定されます。詳細は Geolonia サポートにお問い合わせください。

`ADMIN_ALLOWED_IPS` 環境変数を設定することで、Admin API (`/admin/*`) へのアクセスを特定の IP アドレスに制限できます:

```bash
# Single IP
ADMIN_ALLOWED_IPS=192.168.1.100

# Multiple IPs
ADMIN_ALLOWED_IPS=192.168.1.100,10.0.0.50

# CIDR notation
ADMIN_ALLOWED_IPS=192.168.1.0/24,10.0.0.0/8
```

許可されていない IP からのアクセスは `403 Forbidden` エラーになります。

#### テナントごとの IP 制限

個別の IP 制限をテナントごとに設定できます。テナントレベルの設定が存在する場合、グローバル設定 (`ADMIN_ALLOWED_IPS`) よりも優先されます。

```http
GET /admin/tenants/{tenantId}/ip-restrictions
PUT /admin/tenants/{tenantId}/ip-restrictions
DELETE /admin/tenants/{tenantId}/ip-restrictions
Authorization: Bearer <accessToken>
```

スコープは `admin` (Admin API のみ) または `all` (すべての API) のいずれかです。詳細は [AUTH.md](../reference/auth.md#per-tenant-ip-restrictions) を参照してください。

### ルールエンジン管理 (tenant\_admin)

エンティティの変更を自動的に処理するルールを管理します。`tenant_admin` ロールが必要です。認証が有効になっている場合 (デフォルト)、`super_admin` は `/rules*` エンドポイントにアクセスできません。


* **[REACTIVCORE\_RULES.md](../features/reactivcore-rules.md)** - ユーザーガイド (使用例、Admin API など)

#### ルール一覧

```http
GET /rules
Authorization: Bearer <accessToken>
```

**クエリパラメータ**

| Parameter     | Description                                  |
| ------------- | -------------------------------------------- |
| `limit`       | Number of results (default: 20, max: 100)    |
| `offset`      | Offset (default: 0)                          |
| `servicePath` | Filter by service path                       |
| `isActive`    | Filter by active/inactive (`true` / `false`) |

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

ルールアクション (`createEntity`、`updateAttribute`、`deleteAttribute`) は、プロトコル境界を越えて操作するためのオプションの `protocol` フィールドをサポートしています。`createEntity` アクションは、階層制御のための `servicePath` および `scope` フィールドもサポートしています。

| Field         | Actions                                        | Type                         | Description                                                 |
| ------------- | ---------------------------------------------- | ---------------------------- | ----------------------------------------------------------- |
| `protocol`    | createEntity, updateAttribute, deleteAttribute | `'ngsiv2' \| 'ngsild'` | Target protocol (default: inherit from trigger)             |
| `servicePath` | createEntity                                   | `string`                     | Target servicePath for NGSIv2 (supports template variables) |
| `scope`       | createEntity                                   | `string[]`                   | Target scope for NGSI-LD (supports template variables)      |

プロトコルを跨ぐ場合、servicePath ↔ scope は自動的にマッピングされます。テンプレート変数 `${trigger.protocol}`、`${trigger.servicePath}`、`${trigger.scope}`、`${trigger.service}` はトリガーエンティティのコンテキストを参照します。

詳細な例とマッピングルールについては、**[REACTIVCORE\_RULES.md](../features/reactivcore-rules.md)** を参照してください。

***

## OAuth 2.0 API (M2M 認証)

OAuth 2.0 Client Credentials Grant フローを使用した Machine-to-Machine (M2M) 認証がサポートされています。

**主要エンドポイント:**

* `POST /oauth/token` - トークン取得 (Basic 認証)
  
* `POST /admin/oauth-clients` - クライアント作成 (管理者)
  
* `GET /admin/oauth-clients` - クライアント一覧 (管理者)
  
* `POST /admin/oauth-clients/{clientId}/regenerate-secret` - シークレット再生成 (管理者)
  
* `POST /me/oauth-clients` - 自分のクライアント作成 (セルフサービス)
  
* `GET /me/oauth-clients` - 自分のクライアント一覧 (セルフサービス)
  
* `DELETE /me/oauth-clients/{clientId}` - 自分のクライアント削除 (セルフサービス)
  
* `POST /me/oauth-clients/{clientId}/regenerate-secret` - 自分のシークレット再生成 (セルフサービス)

**有効化:** OAuth 2.0 は認証が有効である限り常に利用可能です (デフォルト)。`OAUTH_ENABLED` 環境変数は #1982 で削除されました — コードベースに読み取り箇所がありませんでした。

**利用可能なスコープ:**

| Scope                      | Description                                          | `user` | `tenant_admin` | `super_admin` |
| -------------------------- | ---------------------------------------------------- | :----: | :------------: | :-----------: |
| `read:entities`            | Read entities                                        |    ✅   |        ✅       |       ✅       |
| `write:entities`           | Write entities (create/update/delete only)           |    ✅   |        ✅       |       ✅       |
| `read:subscriptions`       | Read subscriptions                                   |    ✅   |        ✅       |       ✅       |
| `write:subscriptions`      | Write subscriptions (create/update/delete only)      |    ✅   |        ✅       |       ✅       |
| `read:registrations`       | Read registrations                                   |    ✅   |        ✅       |       ✅       |
| `write:registrations`      | Write registrations (create/update/delete only)      |    ✅   |        ✅       |       ✅       |
| `read:rules`               | Read rules                                           |    ✅   |        ✅       |       ✅       |
| `write:rules`              | Write rules (create/update/delete only)              |    ✅   |        ✅       |       ✅       |
| `read:custom-data-models`  | Read custom data models                              |    ✅   |        ✅       |       ✅       |
| `write:custom-data-models` | Write custom data models (create/update/delete only) |    ✅   |        ✅       |       ✅       |
| `admin:users`              | User management API                                  |    ❌   |        ✅       |       ✅       |
| `admin:policies`           | Policy management API                                |    ❌   |        ✅       |       ✅       |
| `admin:oauth-clients`      | OAuth client management API                          |    ❌   |        ✅       |       ✅       |
| `admin:metrics`            | Metrics API                                          |    ❌   |        ✅       |       ✅       |
| `admin:tenants`            | Tenant management API                                |    ❌   |        ❌       |       ✅       |
| `permanent`                | Token never expires                                  |    —   |        —       |       —       |
| `jwt`                      | JWT format token                                     |    —   |        —       |       —       |

> Role 列は、セルフサービス (`/me/oauth-clients`) 経由でリクエスト可能なスコープを示しています。管理者が作成したクライアント (`/admin/oauth-clients`) はこれらの制限を受けません。

**Resource Scopes:** `POST /oauth/token` で `resource_scopes` パラメータ (JSON 文字列) を指定すると、エンティティレベルのアクセス制御を持つトークンが発行されます。詳細は [AUTH.md](../reference/auth.md#resource-scopesgeonicdb-extension) を参照してください。

**詳細:** [AUTH.md](../reference/auth.md) の OAuth 2.0 セクションを参照してください。

***

## API Key Token Exchange (Browser SDK)

ブラウザベースのアプリケーションは、Nonce + Proof of Work を介して API キーを短期間有効なセッション JWT と交換できます。

**主要エンドポイント:**

* `POST /auth/nonce` - Nonce + PoW チャレンジをリクエスト (API キー + Origin ヘッダーが必要)
  
* `POST /oauth/token` (`grant_type=api_key`) - API キー + nonce + PoW proof をセッション JWT と交換

**JavaScript SDK:** `npm install @geolonia/geonicdb-sdk` — トークン交換、DPoP、WebSocket、再接続を自動的に処理します。

**セキュリティレイヤー:** Origin 検証 → HMAC Nonce (60 秒 TTL) → Proof of Work → 短期間有効な JWT (1 時間)

**詳細:** AUTH.md の [API Key Token Exchange](../reference/auth.md#api-key-token-exchange-browser-sdk) セクションと SDK ドキュメントで完全な API リファレンスを参照してください。

***

## Meta エンドポイント

Meta エンドポイントは認証を必要とせず、システムステータスと API 情報を提供します。

### API ドキュメント (llms.txt 形式)

```http
GET /llms.txt
```

AI フレンドリーな [llms.txt](https://llmstxt.org/) 形式で API ドキュメントを返します。AI エージェントや LLM が理解しやすいように構造化された Markdown 形式を使用します。

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
  
* OpenAPI バージョン: 3.0.3

### バージョン情報

```http
GET /version
```

FIWARE Orion 互換のバージョン情報を返します。

GeonicDB 固有の `extensions.vectorSearch` オブジェクトは、接続された MongoDB デプロイメントが Atlas Vector Search (`$vectorSearch` / `listSearchIndexes`) をサポートしているかどうかを報告します。環境機能に基づいて RAG および埋め込み機能をゲートするために使用されます。

| Field                                   | Type                    | Description                                                    |
| --------------------------------------- | ----------------------- | -------------------------------------------------------------- |
| `extensions.vectorSearch.available`     | boolean                 | `true` when Atlas Vector Search is reachable                   |
| `extensions.vectorSearch.serverVersion` | string \| omitted | MongoDB server version (from `buildInfo`); omitted on failure  |
| `extensions.vectorSearch.checkedAt`     | string (ISO 8601)       | Timestamp the capability was last probed                       |
| `extensions.vectorSearch.reason`        | string \| omitted | Failure reason when `available=false` (e.g. `CommandNotFound`) |

機能プローブはメモリ内に 5 分間キャッシュされるため、負荷がかかっている状況でも `/version` 自体は低コストのままです。

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
  },
  "extensions": {
    "vectorSearch": {
      "available": true,
      "serverVersion": "7.0.5",
      "checkedAt": "2026-05-19T12:34:56.000Z"
    }
  }
}
```

### NGSI-LD API Discovery

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

すべてのヘルスチェックエンドポイントは、マルチリージョン HA サポートのために `region` と `regionRole` を返します。Route 53 フェイルオーバーはこれらのエンドポイントを監視し、プライマリが `503` を返すとセカンダリに切り替えます。

#### 基本ヘルス

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

Kubernetes / Route 53 の Liveness プローブ用。サービスが実行中かどうかをチェックします。

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

Kubernetes / Route 53 の Readiness プローブ用。MongoDB の接続性をチェックし、オプションで DynamoDB、EventBridge、および WebSocket 配信パスのディープヘルスチェックを実行します。

**環境変数によるディープヘルスチェックの有効化**

| Environment Variable            | Description                                                                         |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `HEALTH_CHECK_DYNAMODB=true`    | Add DynamoDB DescribeTable connectivity check                                       |
| `HEALTH_CHECK_EVENTBRIDGE=true` | Add EventBridge DescribeEventBus connectivity check                                 |
| `HEALTH_CHECK_WEBSOCKET=false`  | Opt out of the WebSocket `$connect` synthetic probe (enabled by default; see below) |

EventStreaming が有効な場合(`WS_API_ENDPOINT` が設定されている場合)、Readiness プローブは WebSocket `$connect` 合成プローブも自動的に実行します。これは、実際の WebSocket API を通じて Upgrade リクエスト(トークンなし)を送信し、5xx の場合にサービスを unhealthy としてマークします。これにより、REST チェックでは見逃すサイレント WS パスの障害を検出します。通常、設定は不要で、EventStreaming が無効またはスタンドアロンモードの場合は自動的にスキップされます。プローブを一時的に無効にするには(例: WS インシデントの調査中)、`HEALTH_CHECK_WEBSOCKET=false` を設定してください。

**レスポンス**

* 成功: `200 OK` と `status: "healthy"`
  
* 失敗: `503 Service Unavailable` と `status: "unhealthy"`

**レスポンス例(ディープヘルスチェック有効時)**

```json
{
  "status": "healthy",
  "timestamp": "2026-01-25T10:30:00Z",
  "region": "ap-northeast-1",
  "regionRole": "primary",
  "checks": {
    "mongodb": { "status": "healthy", "latencyMs": 12 },
    "dynamodb": { "status": "healthy", "latencyMs": 8 },
    "eventbridge": { "status": "healthy", "latencyMs": 15 },
    "websocket": { "status": "healthy", "latencyMs": 42 }
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

FIWARE Orion 互換形式でサーバーの運用統計を返します。認証が有効な場合(デフォルト)、認証されたユーザーのみがこのエンドポイントにアクセスできます。

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

サブスクリプションと登録のキャッシュ統計を返します。認証が有効な場合(デフォルト)、認証されたユーザーのみがこのエンドポイントにアクセスできます。

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

Prometheus 公開形式でメトリクスを返します。認証が有効な場合(デフォルト)、認証されたユーザーのみがこのエンドポイントにアクセスできます。Kubernetes 環境での監視や Grafana ダッシュボードとの統合に使用できます。

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

**提供されるツール**: `list_entities`、`get_entity`、`search_by_location`、`search_by_attribute`、`create_entity`、`update_entity`、`delete_entity`、`list_entity_types`、`get_temporal_data`、`subscribe`

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

認証が有効になっている場合(デフォルト)、Bearer トークン(JWT)が必要です。テナントアクセス制御も適用されます。

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

注意: 認証が有効になっている場合(デフォルト)、`headers` が必要です。

詳細については、[AI\_INTEGRATION.md](../ai-integration/overview.md) を参照してください。

##### A2A (Agent-to-Agent Protocol)

```http
GET /.well-known/agent-card.json
```

A2A エージェントカード。このエージェントの機能、スキル、認証について説明します。認証は不要です。

```http
POST /a2a
Content-Type: application/json
Authorization: Bearer <token>
Fiware-Service: <tenant>  (optional, falls back to default tenant)
```

エージェント間通信のための A2A JSON-RPC 2.0 エンドポイント。有効になっている場合(デフォルト)は認証が必要です。サポートされているメソッド:

* `message/send` — メッセージを送信し、同期レスポンスを受信
  
* `tasks/get` — タスクの現在の状態を取得
  
* `tasks/list` — フィルタリングとページネーションを使用してタスクを一覧表示
  
* `tasks/cancel` — タスクのキャンセルをリクエスト

5 つのスキルが利用可能: entities、batch、temporal、config、admin(MCP ツールと同じ)。

詳細については、[AI\_INTEGRATION.md](../ai-integration/overview.md) を参照してください。

#### テナント別メトリクス(Admin API)

```http
GET /admin/metrics
Authorization: Bearer <accessToken>
```

テナントとServicePath別にメトリクスを返します。`super_admin` ロールが必要です。

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

NGSIv2 API の詳細については、[API\_NGSIV2.md](./ngsiv2.md) を参照してください。

***

## NGSI-LD API

NGSI-LD API の詳細については、[API\_NGSILD.md](./ngsild.md) を参照してください。

***

## クエリ言語

`q` パラメータを使用して、属性値によるフィルタリングが可能です。

### 基本構文

| Operator | Description                        | Example               |
| -------- | ---------------------------------- | --------------------- |
| `==`     | Equal to                           | `temperature==23`     |
| `!=`     | Not equal to                       | `status!=inactive`    |
| `>`      | Greater than                       | `temperature>20`      |
| `<`      | Less than                          | `temperature<30`      |
| `>=`     | Greater than or equal to           | `temperature>=20`     |
| `<=`     | Less than or equal to              | `temperature<=30`     |
| `..`     | Range                              | `temperature==20..30` |
| `~=`     | Pattern match (regular expression) | `name~=Room.*`        |

### 複数の条件

AND 条件はセミコロン (`;`) で結合します:

```text
q=temperature>20;pressure<800
```

OR 条件はパイプ (`|`) で結合します (`;` は `|` よりも優先順位が高くなります):

```text
q=temperature==23|temperature==35
q=temperature>25;humidity<40|status==active
```

### 範囲クエリ

`==` 演算子と `..` を組み合わせて範囲フィルタリング (境界を含む) を行います:

```text
q=temperature==20..30    # 20 or above and 30 or below
```

### 文字列マッチング

```text
q=status~=act     # Partial match (regular expression)
q=name==Room1     # Exact match
```

***

## 地理クエリ

位置情報を持つエンティティは、空間的にクエリすることができます。

### パラメータ

| Parameter  | Description                                                                                                                                                                                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `georel`   | Spatial relationship (coveredBy, within, intersects, disjoint, equals)                                                                                                                                                                                                                                                    |
| `geometry` | Geometry type. NGSIv2: `point`, `multipoint`, `linestring`, `multilinestring`, `polygon`, `multipolygon`, `line`, `box` (case-insensitive). NGSI-LD: the six GeoJSON names `Point`, `MultiPoint`, `LineString`, `MultiLineString`, `Polygon`, `MultiPolygon` (exact case). The `Multi*` variants are accepted since #1696 |
| `coords`   | Coordinates (NGSIv2: latitude,longitude format; NGSI-LD: longitude,latitude format; multiple points separated by semicolons)                                                                                                                                                                                              |

> **注**: `georel`、`geometry`、`coords` (または NGSI-LD では `coordinates`) はすべて一緒に指定する必要があります。一部のみを指定すると `400 Bad Request` が返されます (ETSI GS CIM 009 V1.9.1 clause 4.10)。

### 座標フォーマット

NGSIv2 では、座標は **緯度,経度** の順序で指定されます(NGSIv2 仕様に準拠)。NGSI-LD では、座標は **経度,緯度** の順序で指定されます(GeoJSON 標準に準拠)。

> **重要**: NGSIv2 における緯度,経度の順序は、GeoJSON 標準(経度,緯度)からの逸脱です。これは NGSI-LD で修正され、GeoJSON と同じ経度,緯度の順序が使用されます。API を使用する際は、使用している API バージョンに対応した正しい順序で座標を指定してください。

```text
# NGSIv2 (latitude,longitude)
coords=35.6812,139.7671              # Single point
coords=34,138;34,141;37,141;37,138;34,138  # Polygon (semicolon-separated)

# NGSI-LD (longitude,latitude)
coordinates=[139.7671,35.6812]       # Single point
```

#### ポリゴンリングの閉鎖 (#1644)

`Polygon` リング — 保存された GeoProperty / `geo:json` 属性値内または geo クエリ内のいずれであっても —
は閉じている必要があります:最初と最後の位置は **すべての要素で等しい** 必要があります。3 要素の
位置(`[経度, 緯度, 高度]`、RFC 7946 §3.1.6)の場合、これには高度も含まれます。この
チェックは NGSI-LD と NGSIv2 のパス間で共有されるため、両方の API が同じルールを適用します。

> **注意(軽微な破壊的変更、#1644)**: NGSIv2 は以前、リングの閉鎖を検証する際に経度/緯度のみを比較し、最初と最後の位置が高度において異なるリングを黙って受け入れていました。このようなリングは現在、NGSI-LD の動作と一致するように `400 Bad Request`("must be closed")で拒否されます。2 要素(2D)座標を送信するクライアントは影響を受けません。

### エリア検索(coveredBy / within)

ポリゴン内のエンティティを検索:

```http
GET /v2/entities?georel=coveredBy&geometry=polygon&coords=34,138;34,141;37,141;37,138;34,138
```

### 交差検索(intersects)

ジオメトリと交差するエンティティを検索:

```http
GET /v2/entities?georel=intersects&geometry=box&coords=35.67,139.76;35.69,139.78
```

### 非交差検索(disjoint)

ジオメトリと交差しないエンティティを検索:

```http
GET /v2/entities?georel=disjoint&geometry=polygon&coords=34,138;34,141;37,141;37,138;34,138
```

### 近接検索 (near)

指定された座標から一定距離内のエンティティを検索します。

#### パラメータ

| Parameter         | Description                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `maxDistance`     | Maximum distance (meters)                                                                                    |
| `minDistance`     | Minimum distance (meters)                                                                                    |
| `orderByDistance` | When set to `true`, sorts results by distance and attaches distance information (`@distance`) to each entity |

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

NGSI-LD では、パラメータは `==` を使用して指定します:

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

| Feature        | NGSIv2                                          | NGSI-LD                                           | Description            |
| -------------- | ----------------------------------------------- | ------------------------------------------------- | ---------------------- |
| Max distance   | `georel=near;maxDistance:5000`                  | `georel=near;maxDistance==5000`                   | `:` vs `==` difference |
| Min distance   | `georel=near;minDistance:1000`                  | `georel=near;minDistance==1000`                   | `:` vs `==` difference |
| Distance range | `georel=near;minDistance:500;maxDistance:10000` | `georel=near;minDistance==500;maxDistance==10000` | `:` vs `==` difference |

> **構文が異なる理由**: NGSIv2 はパラメータ値を指定するために `:` を使用しますが、NGSI-LD は ETSI 仕様に従って `==` を使用します。API を呼び出す際は、使用している API バージョンに対応した構文を使用してください。

#### 距離ソートと距離情報

`orderByDistance=true` パラメータを指定すると、以下の機能が有効になります:


1. **距離ソート**: 結果は指定された座標からの距離の昇順でソートされます
   
2. **距離情報**: 各エンティティに `@distance` 属性が追加され、指定された座標からの距離(メートル単位)が返されます

この機能は MongoDB の `$geoNear` 集約パイプラインを使用して実装されています。

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

`orderDirection=desc` を併用して、距離の降順(遠い順)でソートします:

```http
GET /v2/entities?georel=near;maxDistance:5000&geometry=point&coords=35.6812,139.7671&orderByDistance=true&orderDirection=desc
```

#### 制限事項


* **ポイントジオメトリのみ**: `geometry=point` (NGSIv2) または `geometry=Point` (NGSI-LD) のみがサポートされています

### エラー処理

geo-query パラメータが無効な場合、`400 Bad Request` が返されます。

| Error Condition                       | Example Error Message                                                                                                               |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Invalid `georel` value                | `Invalid georel: xxx. Supported values: near, coveredBy, within, contains, intersects, disjoint, equals`                            |
| Invalid `geometry` value              | `Unsupported geometry type: xxx. Supported types: point, multipoint, polygon, multipolygon, linestring, multilinestring, line, box` |
| Insufficient coordinates (Point)      | `Point geometry requires at least 2 coordinates, but got 1`                                                                         |
| Insufficient coordinates (Polygon)    | `Polygon geometry requires at least 4 coordinate pairs (8 values), but got 6 values`                                                |
| Insufficient coordinates (LineString) | `LineString geometry requires at least 2 coordinate pairs (4 values), but got 2 values`                                             |
| Insufficient coordinates (Box)        | `Box geometry requires 2 coordinate pairs (4 values), but got 2 values`                                                             |
| Invalid coordinate value              | `Invalid coordinate value: xxx`                                                                                                     |
| Latitude out of range                 | `Latitude out of range: 91. Must be between -90 and 90.`                                                                            |
| Longitude out of range                | `Longitude out of range: 181. Must be between -180 and 180.`                                                                        |
| `near` without distance               | `The 'near' georel requires maxDistance and/or minDistance modifier`                                                                |
| `near` with non-Point geometry        | `The 'near' georel requires Point geometry, but 'polygon' was provided`                                                             |

***

## 空間 ID 検索

日本のデジタル庁 / IPA が定める 3D 空間識別規格(ZFXY 形式)に基づく空間検索をサポートします。

### ZFXY 形式

| Element | Description                           | Range      |
| ------- | ------------------------------------- | ---------- |
| Z       | Zoom level                            | 0-28       |
| F       | Vertical direction (altitude level)   | Integer    |
| X       | East-west direction (longitude tile)  | 0 to 2^z-1 |
| Y       | North-south direction (latitude tile) | 0 to 2^z-1 |

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

`spatialIdDepth` パラメータを指定すると、指定された空間 ID を中心とした周囲のタイルに検索を拡張します。

```http
# depth=1: Expands to a 3x3 tile grid (9 tiles)
GET /v2/entities?spatialId=20/0/929593/410773&spatialIdDepth=1

# depth=2: Expands to a 5x5 tile grid (25 tiles)
GET /v2/entities?spatialId=20/0/929593/410773&spatialIdDepth=2
```

| spatialIdDepth | Expansion Range     | Tile Count |
| -------------- | ------------------- | ---------- |
| 0 (default)    | Specified tile only | 1          |
| 1              | 3x3                 | 9          |
| 2              | 5x5                 | 25         |
| 3              | 7x7                 | 49         |
| 4              | 9x9                 | 81         |

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

`options=geojson` パラメータまたは `Accept: application/geo+json` ヘッダーを使用します:

```http
# options parameter
GET /v2/entities?type=Store&options=geojson

# Accept header
GET /v2/entities?type=Store
Accept: application/geo+json
```

### NGSI-LD での使用方法

`format=geojson` パラメータまたは `Accept: application/geo+json` ヘッダーを使用します:

```http
# format parameter
GET /ngsi-ld/v1/entities?type=Store&format=geojson

# Accept header
GET /ngsi-ld/v1/entities?type=Store
Accept: application/geo+json
```

`POST /ngsi-ld/v1/entityOperations/query`(バッチクエリ)は、同じ `format=geojson` / `Accept: application/geo+json` ネゴシエーションをサポートし、`GET /ngsi-ld/v1/entities` と同じ形式の FeatureCollection を返します(#1783 — ETSI GS CIM 009 clause 6.3.4 は、GeoJSON 対象操作の中に "Query Entity"、clause 5.7.2 をリストしています)。`GET /ngsi-ld/v1/entities/{entityId}`(単一取得)は、FeatureCollection ではなく単一の **Feature** を返します — [API\_NGSILD.md](./ngsild.md#retrieve-single-entity) を参照してください。

NGSI-LD では、`properties` キーと `properties.type` はリクエストの `@context` に対してコンパクト化されます — これは JSON 表現をコンパクト化するのと同じルールです(ETSI GS CIM 009 clause 5.5.7、#1788)。

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

NGSI-LD で GeoJSON を出力する際、`@context` は FeatureCollection レベルに含まれます:

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


* `location` 属性を持たないエンティティは `geometry: null` として出力されます
  
* GeoJSON 出力は `keyValues` オプションと併用できます
  
* Polygon、LineString、MultiPoint などのジオメトリタイプがサポートされています

***

## 座標参照系 (CRS)

座標参照系を指定することで、異なる測地系間で座標を変換できます。

### サポートされている CRS

| CRS          | EPSG      | Description                          | Use Case                          |
| ------------ | --------- | ------------------------------------ | --------------------------------- |
| WGS84        | EPSG:4326 | World Geodetic System 1984 (default) | GPS, international standard       |
| JGD2011      | EPSG:6668 | Japanese Geodetic Datum 2011         | High-precision surveying in Japan |
| Web Mercator | EPSG:3857 | Web Mercator projection              | Google Maps, OpenStreetMap, etc.  |

### CRS の指定方法

#### NGSIv2

`crs` クエリパラメータを使用して EPSG コードを指定します:

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

CRS を指定したリクエストに対するレスポンスには `Content-Crs` ヘッダーが含まれます:

```text
Content-Crs: EPSG:6668
```

NGSI-LD で URN 形式が指定された場合、URN 形式で返されます:

```text
Content-Crs: urn:ogc:def:crs:EPSG::6668
```

### 座標の入出力

#### クエリ実行時(入力)

地理クエリの座標は指定された CRS で解釈されます:

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

| Conversion           | Accuracy                                                       |
| -------------------- | -------------------------------------------------------------- |
| WGS84 ↔ JGD2011      | Several cm to tens of cm                                       |
| WGS84 ↔ Web Mercator | Depends on calculation precision (within ±85 degrees latitude) |

### サポートされているジオメトリタイプ

CRS 変換は、GeoProperty / `geo:json` ロケーション値で使用されるすべての GeoJSON ジオメトリタイプに適用されます:`Point`、`LineString`、`Polygon`、`MultiPoint`、`MultiLineString`、`MultiPolygon` (#1641)。すべての位置は要素ごとに再投影されるため、高度のパススルー (#1595) はマルチジオメトリのバリアントにも均一に適用されます。`GeometryCollection` は変換不可能であり、WGS84 以外の `crs` が指定された場合は `400 Bad Request` を返します。

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

| Error                    | HTTP Code | Description                                                |
| ------------------------ | --------- | ---------------------------------------------------------- |
| Unsupported CRS          | 400       | Specified CRS code is not supported                        |
| Invalid CRS format       | 400       | Invalid CRS format specified                               |
| Coordinates out of range | 400       | Coordinates exceeding ±85 degrees latitude in Web Mercator |

### 制限事項


* Web Mercator (EPSG:3857) は緯度 ±85 度を超える領域をサポートしていません
  
* すべての座標は内部的に WGS84 で保存されます
  
* 座標変換には [proj4](https://github.com/proj4js/proj4js) ライブラリが使用されます

### 参考文献


* [OGC API Features CRS Extension](https://docs.ogc.org/is/18-058r1/18-058r1.html)
  
* [EPSG Geodetic Parameter Registry](https://epsg.io/)
  
* [ETSI NGSI-LD CRS Specification](https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/01.08.01_60/gs_CIM009v010801p.pdf)

***

## Data Catalog API

エンティティタイプ情報を DCAT-AP 形式で出力し、CKAN harvest 互換エンドポイントを提供します。

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

| Parameter | Description                    |
| --------- | ------------------------------ |
| `limit`   | Number of datasets to retrieve |
| `offset`  | Number of datasets to skip     |

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

| Parameter | Description                   | Default |
| --------- | ----------------------------- | ------- |
| `limit`   | Number of samples to retrieve | 5       |

### CKAN 互換 API

CKAN データカタログハーベスターと互換性のある API を提供します。

#### パッケージリスト

```http
GET /catalog/ckan/package_list
```

すべてのパッケージ(データセット)の ID のリストを取得します。

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

リソース情報を含むパッケージのページネーションされたリストを取得します。

**クエリパラメータ**

| Parameter | Description                    |
| --------- | ------------------------------ |
| `limit`   | Number of packages to retrieve |
| `offset`  | Number of packages to skip     |

詳細については、外部統合ドキュメントを参照してください。

***

## CADDE 統合

CADDE (Connector Architecture for Decentralized Data Exchange) コネクタとの統合機能を提供します。

### 概要

CADDE は、異なるセクター間でのデータ共有を可能にする日本のデータ交換アーキテクチャです。この Context Broker は CADDE コネクタからのリクエストを受け入れ、来歴情報を含むレスポンスを返します。

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

| Configuration Item | Default | Description                                                   |
| ------------------ | ------- | ------------------------------------------------------------- |
| `enabled`          | `false` | Enable CADDE functionality                                    |
| `authEnabled`      | `false` | Enable Bearer authentication                                  |
| `defaultProvider`  | -       | Default provider ID                                           |
| `jwtIssuer`        | -       | Expected issuer (`iss`) claim for JWT validation              |
| `jwtAudience`      | -       | Expected audience (`aud`) claim for JWT validation            |
| `jwksUrl`          | -       | JWKS endpoint URL for signature verification (HTTPS required) |

設定は MongoDB に保存されるため、デプロイ後に API 経由で動的に変更できます。

### リクエストヘッダー

CADDE コネクタからのリクエストには、以下のヘッダーが含まれます:

| Header                      | Required | Description                               |
| --------------------------- | -------- | ----------------------------------------- |
| `x-cadde-resource-url`      | -        | URL of the resource being accessed        |
| `x-cadde-resource-api-type` | -        | API type (e.g., `api/ngsi`)               |
| `x-cadde-provider`          | -        | Data provider ID                          |
| `x-cadde-options`           | -        | Additional options (tenant headers, etc.) |

### x-cadde-options フォーマット

テナント情報やその他の詳細は、`x-cadde-options` ヘッダーで指定できます:

```text
x-cadde-options: Fiware-Service:smartcity, Fiware-ServicePath:/sensors
```

このヘッダーで指定された値は、通常の HTTP ヘッダーよりも優先されます。

### 来歴レスポンスヘッダー

CADDE リクエストへのレスポンスには、以下の来歴ヘッダーが含まれます:

| Header                            | Description                                                |
| --------------------------------- | ---------------------------------------------------------- |
| `x-cadde-provenance-id`           | Unique identifier for the request (uses Fiware-Correlator) |
| `x-cadde-provenance-timestamp`    | Response generation time (ISO 8601 format)                 |
| `x-cadde-provenance-provider`     | Data provider ID                                           |
| `x-cadde-provenance-resource-url` | URL of the resource accessed                               |

### 認証

`CADDE_AUTH_ENABLED=true` の場合、CADDE リクエストには Bearer 認証が必要です:

```http
Authorization: Bearer <token>
```

トークンが存在しない場合、`401 Unauthorized` エラーが返されます。

#### JWT 検証(オプション)

`CADDE_JWKS_URL` を設定すると、Bearer トークンの完全な JWT 検証が有効になります:

| Feature                     | Description                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| **Signature verification**  | Supports RS256 or ES256 algorithms. Automatically fetches public keys from the JWKS endpoint |
| **Expiration verification** | Validates the `exp` (expiration) claim and rejects expired tokens                            |
| **Issued-at verification**  | Validates the `iat` (issued-at) claim and rejects tokens issued in the future                |
| **Issuer verification**     | Validates the `iss` claim if `CADDE_JWT_ISSUER` is configured                                |
| **Audience verification**   | Validates the `aud` claim if `CADDE_JWT_AUDIENCE` is configured                              |

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

| Error                           | Description                                           |
| ------------------------------- | ----------------------------------------------------- |
| `Malformed JWT token`           | Invalid token format                                  |
| `Invalid token signature`       | Invalid signature                                     |
| `Token has expired`             | Token has expired                                     |
| `Invalid token issuer`          | Issuer claim does not match                           |
| `Invalid token audience`        | Audience claim does not match                         |
| `Unsupported signing algorithm` | Unsupported algorithm (other than RS256/ES256)        |
| `Unable to fetch signing keys`  | Failed to access the JWKS endpoint                    |
| `Signing key not found`         | The key with the specified kid does not exist in JWKS |

**注:** `jwksUrl` が設定されていない場合、トークンの存在のみがチェックされます(後方互換性のため)。

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

CADDE connector v4 仕様に準拠した専用エンドポイント(CADDE 設定が有効な場合のみ利用可能、`PUT /admin/cadde` で設定)。

参考: <https://github.com/CADDE-sip/connector>

#### エンドポイント一覧

| Method | Path                     | Description                                            |
| ------ | ------------------------ | ------------------------------------------------------ |
| GET    | `/cadde/api/v4/catalog`  | Catalog search (cross-domain search / detailed search) |
| GET    | `/cadde/api/v4/entities` | NGSI data exchange                                     |

#### カタログ検索 (`/cadde/api/v4/catalog`

)

`x-cadde-search` ヘッダーを使用して検索タイプを指定:

| Search Type         | Header Value             | Description                                                                     |
| ------------------- | ------------------------ | ------------------------------------------------------------------------------- |
| Cross-domain search | `x-cadde-search: meta`   | Returns dataset list in CKAN format (keyword filtering via `q` parameter)       |
| Detailed search     | `x-cadde-search: detail` | Returns details of an individual dataset (specified via `id` or `fq` parameter) |

CADDE 固有のフィールドがレスポンスに追加されます:

* `caddec_dataset_id_for_detail`: 詳細検索用のデータセット ID
  
* `caddec_provider_id`: プロバイダ ID(`CADDE_DEFAULT_PROVIDER` が設定されている場合)
  
* `caddec_resource_type`: リソースタイプ (`api/ngsi`)

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

#### NGSI データ交換 (`/cadde/api/v4/entities`

)

`x-cadde-resource-url` ヘッダーからクエリパラメータを解析してエンティティを取得します。

| Header                      | Required | Description                                                                     |
| --------------------------- | -------- | ------------------------------------------------------------------------------- |
| `x-cadde-resource-url`      | Yes      | Resource URL (containing type, id, q, attrs, limit, offset as query parameters) |
| `x-cadde-resource-api-type` | -        | Response format: `api/ngsi` (default) or `api/ngsi-ld`                          |
| `x-cadde-provider`          | -        | Data provider ID                                                                |

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

CADDE v4 エンドポイントは GeonicDB 認証 (`requireAuth`) をバイパスします。認証は CADDE JWT 検証 (`processCaddeRequestAsync`) によって処理されます。

### 参考文献


* [CADDE (Cross-sector Data Exchange Infrastructure)](https://www.data-ex.jp/)
  
* [CADDE-sip/connector](https://github.com/CADDE-sip/connector)
  
* [DATA-EX](https://data-ex.jp/)

***

## イベントストリーミング

WebSocket API Gateway を使用したリアルタイムエンティティ変更ストリーミング。`EVENT_STREAMING_ENABLED=true` で有効化されます。

### 接続

```text
wss://{api-id}.execute-api.{region}.amazonaws.com/{stage}?tenant={tenantName}
```

### クライアントメッセージ

| Action      | Description                           |
| ----------- | ------------------------------------- |
| `subscribe` | Set filters by entity type/ID pattern |
| `ping`      | Keep-alive (`pong` response)          |

### サーバーイベント

| Type            | Description           |
| --------------- | --------------------- |
| `entityCreated` | An entity was created |
| `entityUpdated` | An entity was updated |
| `entityDeleted` | An entity was deleted |

詳細については、[イベントストリーミングドキュメント](../features/subscriptions.md) を参照してください。

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
Content-Type は `application/json` です(ETSI GS CIM 009 仕様に準拠するため、RFC 7807 の `application/problem+json` ではなく標準 JSON MIME タイプが使用されます)。

```json
{
  "type": "https://uri.etsi.org/ngsi-ld/errors/ResourceNotFound",
  "title": "Resource Not Found",
  "status": 404,
  "detail": "Entity urn:ngsi-ld:Room:001 not found"
}
```

### HTTP ステータスコード

| Code  | Description                                       |
| ----- | ------------------------------------------------- |
| `200` | Success (with data)                               |
| `201` | Created successfully                              |
| `204` | Success (no data)                                 |
| `207` | Partial success (batch operations)                |
| `400` | Bad request                                       |
| `403` | Forbidden (authorization error)                   |
| `404` | Resource not found                                |
| `405` | Method not allowed (NGSI-LD, with `Allow` header) |
| `409` | Conflict (already exists, etc.)                   |
| `500` | Internal server error                             |

***

## 実装状況

### 実装済み機能

| Feature                                               | NGSIv2 | NGSI-LD |
| ----------------------------------------------------- | ------ | ------- |
| Entity CRUD                                           | Yes    | Yes     |
| Attribute operations                                  | Yes    | Yes     |
| Direct attribute value retrieval/update               | Yes    | -       |
| Batch operations                                      | Yes    | Yes     |
| Subscriptions (HTTP notifications)                    | Yes    | Yes     |
| Subscriptions (MQTT notifications)                    | Yes    | Yes     |
| Event streaming (WebSocket)                           | Yes    | Yes     |
| Entity types                                          | Yes    | -       |
| Query language (q parameter)                          | Yes    | Yes     |
| Sorting (orderBy, orderDirection)                     | Yes    | Yes     |
| Metadata control (metadata / sysAttrs)                | Yes    | Yes     |
| Geo-queries (coveredBy, within, intersects, disjoint) | Yes    | Yes     |
| Spatial ID search (ZFXY format)                       | Yes    | Yes     |
| GeoJSON output                                        | Yes    | Yes     |
| Coordinate Reference System (CRS) conversion          | Yes    | Yes     |
| Multi-tenancy                                         | Yes    | Yes     |
| Pagination                                            | Yes    | Yes     |
| keyValues format                                      | Yes    | Yes     |
| Registrations                                         | Yes    | Yes     |
| Context providers (federation/query forwarding)       | Yes    | Yes     |
| Context providers (update forwarding)                 | Yes    | Yes     |
| CADDE integration                                     | Yes    | Yes     |
| Authentication API (JWT-based)                        | Yes    | Yes     |
| User/tenant management API                            | Yes    | Yes     |
| `/version` endpoint                                   | Yes    | -       |
| `/.well-known/ngsi-ld`                                | -      | Yes     |
| Health check (`/health`)                              | Yes    | Yes     |

### 制限事項

| Feature                             | Status    | Notes                                                                                               |
| ----------------------------------- | --------- | --------------------------------------------------------------------------------------------------- |
| `near` geo-query (proximity search) | Supported | Point geometry only; supports distance sorting and distance information with `orderByDistance=true` |
| `minDistance` / `maxDistance`       | Supported | Specified in meters                                                                                 |

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

### エンティティを取得する

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

### サブスクリプションを作成する

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

### NGSI-LD エンティティを作成する

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

このセクションでは、すべての GeonicDB API エンドポイントのページネーション、認証/認可、およびステータスコード情報を要約しています。

### API カテゴリ

| API Category   | Base Path     | Authentication                          | Content-Type          |
| -------------- | ------------- | --------------------------------------- | --------------------- |
| Meta/Health    | `/`           | Not required\*†                         | `application/json`    |
| Authentication | `/auth`       | Not required                            | `application/json`    |
| User           | `/me`         | Required                                | `application/json`    |
| NGSIv2         | `/v2`         | Required\*                              | `application/json`    |
| NGSI-LD        | `/ngsi-ld/v1` | Required\*                              | `application/ld+json` |
| Admin          | `/admin`      | Required (super\_admin / tenant\_admin) | `application/json`    |
| Catalog        | `/catalog`    | Required\*                              | `application/json`    |

\* `AUTH_ENABLED=false` の場合、認証は不要です

† `/statistics`、`/cache/statistics`、`/metrics` は認証が有効な場合(デフォルト)に認証が必要です

### パブリックエンドポイント (Meta/Health)

認証なしでアクセス可能なエンドポイント。

| Endpoint                       | Method | Description                                                     | Success | Error         |
| ------------------------------ | ------ | --------------------------------------------------------------- | ------- | ------------- |
| `/llms.txt`                    | GET    | API documentation (llms.txt)                                    | 200     | -             |
| `/version`                     | GET    | FIWARE Orion-compatible version information                     | 200     | -             |
| `/health`                      | GET    | Basic health check                                              | 200     | -             |
| `/health/live`                 | GET    | Kubernetes liveness probe                                       | 200     | -             |
| `/health/ready`                | GET    | Kubernetes readiness probe                                      | 200     | 503           |
| `/.well-known/ngsi-ld`         | GET    | NGSI-LD API discovery                                           | 200     | -             |
| `/api.json`                    | GET    | API reference (JSON)                                            | 200     | -             |
| `/openapi.json`                | GET    | OpenAPI 3.0 specification                                       | 200     | -             |
| `/statistics`                  | GET    | FIWARE Orion-compatible statistics (authentication required)    | 200     | 401           |
| `/cache/statistics`            | GET    | Cache statistics (authentication required)                      | 200     | 401           |
| `/metrics`                     | GET    | Prometheus metrics (authentication required)                    | 200     | 401           |
| `/tools.json`                  | GET    | AI tool definitions (Claude Tool Use / OpenAI Function Calling) | 200     | -             |
| `/.well-known/ai-plugin.json`  | GET    | AI plugin manifest                                              | 200     | -             |
| `/mcp`                         | POST   | MCP (Model Context Protocol) Streamable HTTP endpoint           | 200     | 400, 405, 500 |
| `/.well-known/agent-card.json` | GET    | A2A Agent Card                                                  | 200     | -             |

### AI Agent エンドポイント (AUTH\_ENABLED=false でない限り認証が必要)

| Endpoint | Method | Description                                | Success | Error              |
| -------- | ------ | ------------------------------------------ | ------- | ------------------ |
| `/a2a`   | POST   | A2A (Agent-to-Agent) JSON-RPC 2.0 endpoint | 200     | 400, 401, 405, 500 |

### 認証エンドポイント


* `/auth/*` は `AUTH_ENABLED=false` の場合のみ利用できません
  
* `/oauth/token` は認証が有効な場合 (デフォルト) に利用可能です。`OAUTH_ENABLED` 変数は #1982 で削除されました

| Endpoint        | Method | Description                                                                                       | Success | Error         |
| --------------- | ------ | ------------------------------------------------------------------------------------------------- | ------- | ------------- |
| `/auth/login`   | POST   | User login (JWT)                                                                                  | 200     | 400, 401      |
| `/auth/refresh` | POST   | Token refresh (optional `tenantId` for tenant switching)                                          | 200     | 400, 401, 403 |
| `/auth/logout`  | POST   | Logout (invalidate all sessions, authentication required)                                         | 204     | 401           |
| `/auth/nonce`   | POST   | Nonce + PoW challenge for API key token exchange                                                  | 200     | 400           |
| `/oauth/token`  | POST   | OAuth token acquisition (M2M: `grant_type=client_credentials`, Browser SDK: `grant_type=api_key`) | 200     | 400, 401      |

### SDK

JavaScript SDK は npm パッケージとして利用可能です: `npm install @geolonia/geonicdb-sdk`

SDK は完全なパブリック API を提供します: `login()`、`setCredentials()`、エンティティ CRUD、`request()`、`connect()`、`reconnect()`、`disconnect()`、`isConnected()`、`subscribe()`、`on()`/`off()` イベントリスナー (`tokenRefresh` イベントを含む)。詳細については SDK ドキュメントを参照してください。

### ユーザーエンドポイント

認証されたユーザーが自身の情報を管理するためのエンドポイント。

| Endpoint       | Method | Description          | Success | Error    | Minimum Role |
| -------------- | ------ | -------------------- | ------- | -------- | ------------ |
| `/me`          | GET    | Retrieve own profile | 200     | 401      | user         |
| `/me/password` | POST   | Change password      | 204     | 400, 401 | user         |

### NGSIv2 / NGSI-LD エンドポイント

詳細なエンドポイント仕様については、以下を参照してください:

* [NGSIv2 API リファレンス](./ngsiv2.md)
  
* [NGSI-LD API リファレンス](./ngsild.md)

### Admin API

テナントとユーザーを管理するための API です。エンドポイントは `super_admin` または `tenant_admin` ロールを必要とします(`tenant_admin` は自テナントのスコープのみ)。

#### テナント管理

| Endpoint                                    | Method | Description                                              | Success   | Error                   | Pagination     |
| ------------------------------------------- | ------ | -------------------------------------------------------- | --------- | ----------------------- | -------------- |
| `/admin/tenants`                            | GET    | List tenants                                             | 200       | 400, 401, 403           | Yes (max: 100) |
| `/admin/tenants`                            | POST   | Create tenant                                            | 201       | 400, 401, 403, 409      | -              |
| `/admin/tenants/{tenantId}`                 | GET    | Get tenant                                               | 200       | 401, 403, 404           | -              |
| `/admin/tenants/{tenantId}`                 | PATCH  | Update tenant                                            | 204       | 400, 401, 403, 404, 409 | -              |
| `/admin/tenants/{tenantId}`                 | DELETE | Delete tenant (Crypto-Shredding with `?shred=true`)      | 204 / 200 | 400, 401, 403, 404      | -              |
| `/admin/tenants/{tenantId}/deletion-report` | GET    | Get deletion report                                      | 200       | 401, 403, 404           | -              |
| `/admin/tenants/{tenantId}/activate`        | POST   | Activate tenant                                          | 204       | 401, 403, 404           | -              |
| `/admin/tenants/{tenantId}/deactivate`      | POST   | Deactivate tenant                                        | 204       | 401, 403, 404           | -              |
| `/admin/tenants/{tenantId}/ip-restrictions` | GET    | Get tenant IP restrictions                               | 200       | 401, 403, 404           | -              |
| `/admin/tenants/{tenantId}/ip-restrictions` | PUT    | Update tenant IP restrictions                            | 200       | 400, 401, 403, 404      | -              |
| `/admin/tenants/{tenantId}/ip-restrictions` | DELETE | Delete tenant IP restrictions                            | 204       | 401, 403, 404           | -              |
| `/admin/tenants/{tenantId}/users`           | GET    | List tenant members (tenant\_admin: own tenant only)     | 200       | 401, 403, 404           | Yes (max: 100) |
| `/admin/tenants/{tenantId}/users/{userId}`  | PUT    | Add user to tenant (tenant\_admin: own tenant only)      | 200       | 400, 401, 403, 404      | -              |
| `/admin/tenants/{tenantId}/users/{userId}`  | DELETE | Remove user from tenant (tenant\_admin: own tenant only) | 204       | 400, 401, 403, 404      | -              |

#### ユーザー管理

| Endpoint                           | Method | Description                                             | Success | Error                   | Pagination     |
| ---------------------------------- | ------ | ------------------------------------------------------- | ------- | ----------------------- | -------------- |
| `/admin/users`                     | GET    | List users                                              | 200     | 400, 401, 403           | Yes (max: 100) |
| `/admin/users`                     | POST   | Create user                                             | 201     | 400, 401, 403, 409      | -              |
| `/admin/users/{userId}`            | GET    | Get user                                                | 200     | 401, 403, 404           | -              |
| `/admin/users/{userId}`            | PATCH  | Update user                                             | 204     | 400, 401, 403, 404, 409 | -              |
| `/admin/users/{userId}`            | DELETE | Delete user                                             | 204     | 401, 403, 404           | -              |
| `/admin/users/{userId}/activate`   | POST   | Activate user                                           | 204     | 401, 403, 404           | -              |
| `/admin/users/{userId}/deactivate` | POST   | Deactivate user                                         | 204     | 401, 403, 404           | -              |
| `/admin/users/{userId}/unlock`     | POST   | Unlock login                                            | 200     | 400, 401, 403, 404      | -              |
| `/admin/users/{userId}/tenants`    | GET    | List tenants the user belongs to (self or super\_admin) | 200     | 401, 403                | Yes (max: 100) |

#### デプロイメントルーティング管理 (super\_admin のみ)

ホスト名を MongoDB クラスター/データベースにマッピングし、大規模なテナントを専用クラスター上に分離できます(#1775 / Epic #1485)。運用ランブックについては DEDICATED\_CLUSTER\_ONBOARDING.md を参照してください。

| Endpoint                        | Method | Description                                                                                | Success | Error                   | Pagination     |
| ------------------------------- | ------ | ------------------------------------------------------------------------------------------ | ------- | ----------------------- | -------------- |
| `/admin/deployments`            | GET    | List deployment routing rows (filter: `enabled=true\|false`; disabled rows included) | 200     | 400, 401, 403           | Yes (max: 100) |
| `/admin/deployments`            | POST   | Create a deployment routing row                                                            | 201     | 400, 401, 403, 409      | -              |
| `/admin/deployments/{hostname}` | GET    | Get a deployment routing row (bypasses the routing cache)                                  | 200     | 400, 401, 403, 404      | -              |
| `/admin/deployments/{hostname}` | PATCH  | Update a deployment routing row                                                            | 200     | 400, 401, 403, 404, 409 | -              |
| `/admin/deployments/{hostname}` | DELETE | Delete a deployment routing row                                                            | 204     | 400, 401, 403, 404, 409 | -              |

**リクエストボディ (POST)**

| Field                 | Required                             | Description                                                                                                                                                                                                                           |
| --------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hostname`            | Yes                                  | DNS name. Normalised to lowercase to match how the `Host` header is resolved                                                                                                                                                          |
| `databaseName`        | Yes                                  | MongoDB database name (alphanumerics, `-`, `_`; max 63)                                                                                                                                                                               |
| `defaultQuotaPlan`    | Yes                                  | `FREE` \| `STANDARD` \| `PREMIUM` \| `ENTERPRISE` \| `CUSTOM`                                                                                                                                                 |
| `mongodbUriSecretArn` | Either this or `mongodbUri`          | Secrets Manager reference. **Use the secret *name*** (e.g. `geonicdb/deployments/<name>`) in multi-region production — a full ARN embeds a region the failover Lambda cannot resolve. Full ARNs are accepted for single-region setups |
| `mongodbUri`          | Either this or `mongodbUriSecretArn` | Plaintext connection string. Rejected with 400 when `MONGODB_ENFORCE_SECRETS=true`                                                                                                                                                    |
| `rateLimitTableName`  | No                                   | Per-deployment rate-limit table override                                                                                                                                                                                              |
| `enabled`             | No                                   | Defaults to `true`. Only enabled rows are routed                                                                                                                                                                                      |
| `metadata`            | No                                   | Free-form object (max 4 KB serialized, max 5 levels deep)                                                                                                                                                                             |

`PATCH` は `hostname` を除く同じフィールドを受け付けます(不変 — 新しい行を作成して古い行を削除することで名前を変更します)。`mongodbUri` / `mongodbUriSecretArn` / `rateLimitTableName` / `metadata` をクリアするには `null` を送信してください。

**レスポンス**

プレーンテキストの `mongodbUri` は**決して返されません**。レスポンスは `mongodbUriConfigured` (boolean) と `mongodbUriSecretArn` のみを公開します。

```json
{
  "hostname": "ohashi.geonicdb.example.com",
  "databaseName": "ohashi",
  "defaultQuotaPlan": "ENTERPRISE",
  "enabled": true,
  "mongodbUriSecretArn": "geonicdb/deployments/ohashi",
  "mongodbUriConfigured": false,
  "rateLimitTableName": null,
  "metadata": { "owner": "ops" },
  "createdAt": 1753000000000,
  "updatedAt": 1753000000000
}
```

**使用不可能な行を防ぐための拒否**

| Status | Condition                                                                                                                                                                                                                                                                         |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | Reserved subdomain — such a row is never routed even if it exists (#633)                                                                                                                                                                                                          |
| 409    | Hostname listed in `DEFAULT_DEPLOYMENT_HOSTNAMES` — the env list wins and the row would be silently shadowed (#1291)                                                                                                                                                              |
| 400    | Plaintext `mongodbUri` while `MONGODB_ENFORCE_SECRETS=true` (#1086)                                                                                                                                                                                                               |
| 400    | No connection source at all (neither secret reference nor URI)                                                                                                                                                                                                                    |
| 409    | Hostname already registered (conditional write; concurrent creates cannot overwrite each other)                                                                                                                                                                                   |
| 409    | Deleting or disabling the deployment serving the current request — it would make every API on that host, including this admin API, return 404. Perform the operation from another hostname                                                                                        |
| 409    | `PATCH` optimistic-lock conflict — the row was modified or deleted between read and write. Re-read and retry. Updates are conditional on `updatedAt`, so a concurrent `PATCH` cannot silently overwrite another, and a `PATCH` racing a `DELETE` cannot resurrect the deleted row |

**リスト境界**: ストアは順序付き範囲クエリを持たないプレーンなキーバリューコレクションであるため、リストはソートとページングの前にリポジトリレベルの上限(`DEPLOYMENTS.ADMIN.MAX_SCAN_ITEMS`)まで行を読み取ります。上限に達した場合、レスポンスは `X-Deployment-List-Truncated: true` を含み、サーバーは警告をログに記録します — リストが黙って不完全になることはありません。

**キャッシュの収束**: ルーティングキャッシュはインスタンスごとです。書き込み後、他のウォームインスタンスやバックグラウンドワーカーは、最大 5 分間(`DEPLOYMENTS.CACHE_TTL_MS`)前の設定を提供し続ける可能性があります。書き込みレスポンスはこれを示す `notice` フィールドを含みます。`DELETE` は `X-Deployment-Cache-Notice` ヘッダーでそれを返します。

#### ポリシー管理 (XACML 3.0 Authorization、super\_admin / tenant\_admin)

| Endpoint                                | Method | Description           | Success | Error              | Pagination     |
| --------------------------------------- | ------ | --------------------- | ------- | ------------------ | -------------- |
| `/admin/policies`                       | GET    | List policies         | 200     | 400, 401, 403      | Yes (max: 100) |
| `/admin/policies`                       | POST   | Create policy         | 201     | 400, 401, 403, 409 | -              |
| `/admin/policies/{policyId}`            | GET    | Get policy            | 200     | 401, 403, 404      | -              |
| `/admin/policies/{policyId}`            | PATCH  | Partial policy update | 200     | 400, 401, 403, 404 | -              |
| `/admin/policies/{policyId}`            | PUT    | Replace policy        | 200     | 400, 401, 403, 404 | -              |
| `/admin/policies/{policyId}`            | DELETE | Delete policy         | 204     | 401, 403, 404      | -              |
| `/admin/policies/{policyId}/activate`   | POST   | Activate policy       | 200     | 401, 403, 404      | -              |
| `/admin/policies/{policyId}/deactivate` | POST   | Deactivate policy     | 200     | 401, 403, 404      | -              |

ポリシー Target `resources` で利用可能な **Resource Attributes**:

| attributeId     | Description                                   | Source                                    |
| --------------- | --------------------------------------------- | ----------------------------------------- |
| `path`          | HTTP request path (e.g. `/v2/entities/Room1`) | Request                                   |
| `tenantService` | Tenant service name (`Fiware-Service` header) | Request                                   |
| `servicePath`   | Service path (`Fiware-ServicePath` header)    | Request                                   |
| `scope`         | NGSI-LD entity scope (comma-separated)        | Entity context                            |
| `entityId`      | Target entity ID (e.g. `Room1`)               | Entity context                            |
| `entityType`    | Target entity type (e.g. `Room`)              | Request (auto-extracted) / Entity context |
| `entityOwner`   | Entity creator's userId (`createdBy` field)   | Entity context                            |

> `entityType` は HTTP リクエストからパスレベルで自動的に抽出されます — `?type=` クエリパラメータまたはリクエストボディの `type` / `@type` フィールドから — エンティティレベルのチェックなしでエンティティタイプベースのアクセス制御を可能にします。`entityId`、`entityOwner`、`scope` はエンティティレベルの認可チェック(`requireEntityAuthz` 経由)でのみ利用可能です。`scope` は NGSI-LD エンティティのスコープ配列がカンマ区切り文字列として結合されたもので、柔軟なマッチングには `string-regexp` または `glob` を使用してください。

#### OAuth クライアント管理

| Endpoint                          | Method | Description         | Success | Error              | Pagination     |
| --------------------------------- | ------ | ------------------- | ------- | ------------------ | -------------- |
| `/admin/oauth-clients`            | GET    | List OAuth clients  | 200     | 400, 401, 403      | Yes (max: 100) |
| `/admin/oauth-clients`            | POST   | Create OAuth client | 201     | 400, 401, 403      | -              |
| `/admin/oauth-clients/{clientId}` | GET    | Get OAuth client    | 200     | 401, 403, 404      | -              |
| `/admin/oauth-clients/{clientId}` | PATCH  | Update OAuth client | 200     | 400, 401, 403, 404 | -              |
| `/admin/oauth-clients/{clientId}` | DELETE | Delete OAuth client | 204     | 401, 403, 404      | -              |

#### セルフサービス OAuth クライアント管理

ユーザーは自分自身の OAuth クライアントを管理できます。ユーザーあたり最大 5 クライアントです。オプションの `policyId` はクライアントを既存の XACML ポリシーにバインドします。

| Endpoint                                         | Method | Description                       | Success | Error              | Pagination     |
| ------------------------------------------------ | ------ | --------------------------------- | ------- | ------------------ | -------------- |
| `/me/oauth-clients`                              | GET    | List own OAuth clients            | 200     | 400, 401           | Yes (max: 100) |
| `/me/oauth-clients`                              | POST   | Create own OAuth client           | 201     | 400, 401, 403      | -              |
| `/me/oauth-clients/{clientId}`                   | PATCH  | Update own OAuth client (partial) | 200     | 400, 401, 403, 404 | -              |
| `/me/oauth-clients/{clientId}`                   | DELETE | Delete own OAuth client           | 204     | 400, 401, 403, 404 | -              |
| `/me/oauth-clients/{clientId}/regenerate-secret` | POST   | Regenerate own client secret      | 200     | 400, 401, 403, 404 | -              |

#### API キー管理

`X-Api-Key` ヘッダー経由の認証用 API キーを管理します。新しいキーはプレーン UUID 形式(`randomUUID()`)を使用します。`gdb_` プレフィックス付きの既存のキーは引き続き有効です。保存時は SHA-256 でハッシュ化されます。平文のキーは作成時とリフレッシュ時のみ返されます。リスト/取得レスポンスは `"key": "******"` を返します。オプションの `policyId` フィールドはキーを既存の XACML ポリシーにバインドします(評価時にバインドされたポリシーの target はバイパスされます)。`policyId` がない場合、キーはテナントポリシー + ロールデフォルト(api\_key = All Deny)にフォールバックします。

| Endpoint                          | Method | Description                  | Success | Error              | Pagination     |
| --------------------------------- | ------ | ---------------------------- | ------- | ------------------ | -------------- |
| `/admin/api-keys`                 | POST   | Create API key               | 201     | 400, 401, 403      | -              |
| `/admin/api-keys`                 | GET    | List API keys                | 200     | 400, 401, 403      | Yes (max: 100) |
| `/admin/api-keys/{keyId}`         | GET    | Get API key                  | 200     | 401, 403, 404      | -              |
| `/admin/api-keys/{keyId}`         | PATCH  | Update API key               | 204     | 400, 401, 403, 404 | -              |
| `/admin/api-keys/{keyId}`         | DELETE | Delete API key               | 204     | 401, 403, 404      | -              |
| `/admin/api-keys/{keyId}/refresh` | POST   | Refresh (regenerate) API key | 200     | 401, 403, 404      | -              |

#### セルフサービス API キー管理

ユーザーは自分自身の API キーを管理できます。ユーザーあたり最大 5 キーです。

| Endpoint                       | Method | Description                      | Success | Error              | Pagination     |
| ------------------------------ | ------ | -------------------------------- | ------- | ------------------ | -------------- |
| `/me/api-keys`                 | POST   | Create own API key               | 201     | 400, 401, 403      | -              |
| `/me/api-keys`                 | GET    | List own API keys                | 200     | 400, 401, 403      | Yes (max: 100) |
| `/me/api-keys/{keyId}`         | PATCH  | Update own API key (partial)     | 200     | 400, 401, 403, 404 | -              |
| `/me/api-keys/{keyId}`         | DELETE | Delete own API key               | 204     | 400, 401, 403, 404 | -              |
| `/me/api-keys/{keyId}/refresh` | POST   | Refresh (regenerate) own API key | 200     | 401, 403, 404      | -              |

#### CADDE 設定管理

API 経由で CADDE(分野横断データ交換基盤)設定を管理します。設定は MongoDB に保存され、環境変数は不要です。

| Endpoint       | Method | Description                          | Success | Error         | Pagination |
| -------------- | ------ | ------------------------------------ | ------- | ------------- | ---------- |
| `/admin/cadde` | GET    | Get CADDE configuration              | 200     | 401, 403      | -          |
| `/admin/cadde` | PUT    | Update CADDE configuration (upsert)  | 200     | 400, 401, 403 | -          |
| `/admin/cadde` | DELETE | Delete CADDE configuration (disable) | 204     | 401, 403      | -          |

**リクエストボディ(PUT)**

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

| Field             | Type    | Required | Description                                   |
| ----------------- | ------- | -------- | --------------------------------------------- |
| `enabled`         | boolean | Yes      | Enable/disable CADDE functionality            |
| `authEnabled`     | boolean | Yes      | Enable/disable Bearer authentication          |
| `defaultProvider` | string  | -        | Default provider ID                           |
| `jwtIssuer`       | string  | -        | JWT issuer claim validation value             |
| `jwtAudience`     | string  | -        | JWT audience claim validation value           |
| `jwksUrl`         | string  | -        | JWKS public key endpoint URL (HTTPS required) |

#### ルールエンジン管理

| Endpoint                     | Method | Description     | Success | Error              | Pagination     |
| ---------------------------- | ------ | --------------- | ------- | ------------------ | -------------- |
| `/rules`                     | GET    | List rules      | 200     | 400, 401, 403      | Yes (max: 100) |
| `/rules`                     | POST   | Create rule     | 201     | 400, 401, 403, 409 | -              |
| `/rules/{ruleId}`            | GET    | Get rule        | 200     | 401, 403, 404      | -              |
| `/rules/{ruleId}`            | PATCH  | Update rule     | 204     | 400, 401, 403, 404 | -              |
| `/rules/{ruleId}`            | DELETE | Delete rule     | 204     | 401, 403, 404      | -              |
| `/rules/{ruleId}/activate`   | POST   | Activate rule   | 200     | 401, 403, 404      | -              |
| `/rules/{ruleId}/deactivate` | POST   | Deactivate rule | 200     | 401, 403, 404      | -              |

### カスタムデータモデル API

テナント固有のカスタムデータモデルを管理するための API です。JWT 認証が必要で、XACML ポリシーベースの認可により、`tenant_admin` および `user` ロールがテナント内のカスタムデータモデルを管理できます。

**関連ドキュメント**: [SMART\_DATA\_MODELS.md](../features/smart-data-models.md)

| Endpoint                     | Method | Description              | Success | Error              | Pagination     |
| ---------------------------- | ------ | ------------------------ | ------- | ------------------ | -------------- |
| `/custom-data-models`        | GET    | List custom data models  | 200     | 400, 401, 403      | Yes (max: 100) |
| `/custom-data-models`        | POST   | Create custom data model | 201     | 400, 401, 403, 409 | -              |
| `/custom-data-models/{type}` | GET    | Get custom data model    | 200     | 401, 403, 404      | -              |
| `/custom-data-models/{type}` | PATCH  | Update custom data model | 200     | 400, 401, 403, 404 | -              |
| `/custom-data-models/{type}` | DELETE | Delete custom data model | 204     | 401, 403, 404      | -              |

#### エンティティの検証

カスタムデータモデルが定義されると、エンティティの作成または更新時に自動的に検証が実行されます。検証は `isActive: true` のモデルにのみ適用されます。

**検証チェック:**

| Check                 | Description                                                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Additional properties | When `additionalProperties: false`, attributes not defined in `propertyDetails` are rejected (default: `true` — allows any attributes) |
| Required fields       | Whether attributes with `required: true` are present                                                                                   |
| Type check            | Type validation based on `valueType` (string, number, integer, boolean, array, object, GeoJSON)                                        |
| minLength / maxLength | String length constraints                                                                                                              |
| minimum / maximum     | Numeric range constraints                                                                                                              |
| pattern               | Regular expression pattern match                                                                                                       |
| enum                  | List of permitted values                                                                                                               |

検証に失敗すると `400 Bad Request` が返されます:

```json
{
  "error": "BadRequest",
  "description": "Entity validation failed: temperature: Value (150) exceeds maximum (100)"
}
```

#### 一意制約(複合一意性)

カスタムデータモデルは `uniqueConstraints` を宣言できます。これは、その型のエンティティ間で値が一意でなければならない属性の組み合わせです(テナントとServicePathでスコープされます)。一意性は**データベースレベルでサーバー側**に強制されます(MongoDB の部分一意インデックス)。そのため、競合状態が発生せず、クライアントの規約に依存しません。

```json
{
  "type": "RoomReservation",
  "domain": "SmartBuilding",
  "description": "Room reservation",
  "propertyDetails": {
    "room": { "ngsiType": "Property", "valueType": "string", "example": "R1" },
    "date": { "ngsiType": "Property", "valueType": "string", "example": "2026-07-15" },
    "startTime": { "ngsiType": "Property", "valueType": "string", "example": "10:00" }
  },
  "uniqueConstraints": [
    { "name": "no-double-booking", "fields": ["room", "date", "startTime"] }
  ]
}
```

**ルール:**


* `name`: モデル内で一意、英数字で開始し、その後は文字、数字、ハイフン、アンダースコアを使用可能(最大 64 文字)
  
* `fields`: 1\~8 個の属性名、それぞれがスカラー型の `valueType`(`string`、`number`、`integer`、`boolean`、`uri`、`datetime`)で `propertyDetails` に宣言されている必要があります。`array` / `object` / `geojson` は使用できません
  
* モデルごとに最大 10 個の制約
  
* 制約は、宣言されたすべてのフィールドを持つエンティティにのみ適用されます。いずれかのフィールドが欠落しているエンティティは免除されます
  
* 制約はモデルの `isActive` フラグに関係なく強制され、モデルが削除されると削除されます
  
* `uniqueConstraints` を更新すると、リスト全体が置き換えられます(すべての制約を削除するには `[]` を送信してください)
  
* 既存のエンティティがすでに違反している場合、制約の追加は `400` で失敗します。まず重複を解決してください

**違反レスポンス:** 制約された組み合わせを重複させるエンティティの作成または更新は、違反した制約名とともに `409 AlreadyExists` を返します:

```json
{
  "error": "AlreadyExists",
  "description": "Entity already exists: violates unique constraint 'no-double-booking' on fields [room, date, startTime]"
}
```

NGSI-LD リクエストは、同等の Problem Details レスポンス(`type: https://uri.etsi.org/ngsi-ld/errors/AlreadyExists`)を受信します。バッチ操作では、`errors` 配列内のエンティティごとに違反が報告されます。

> **注意**: 属性暗号化が有効になっているテナントの場合、属性値は暗号文として保存されるため、一意制約は平文値の重複を検出できません。

#### 自動 JSON Schema 生成

カスタムデータモデルが作成または更新されると、`propertyDetails` から JSON Schema(Draft 2020-12)が自動的に生成され、レスポンスの `jsonSchema` フィールドに含まれます。また、`jsonSchema` を手動で指定することも可能です。

#### プロパティ @context(JSON-LD 語彙マッピング)

`propertyDetails` の各プロパティには、JSON-LD 語彙マッピング用の HTTP(S) URL を含むオプションの `@context` フィールドを含めることができます。これにより、自動生成された URI の代わりに、よく知られた語彙(例: schema.org)を使用できます。

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


* `@context` を持つプロパティ → 指定された URL が JSON-LD コンテキストで使用されます
  
* `@context` を持たないプロパティ → **このContext Broker自身のベース URL** 上で自動生成された URL (`{brokerBaseUrl}/vocab/{tenantId}/{propertyName}`、#1984)、[`GET /vocab/{tenantId}/{term}`](#vocabulary-endpoint) で参照可能。`{brokerBaseUrl}` の取得元については [Broker base URL resolution](#broker-base-url-resolution) を参照してください
  
* プロパティ URI はエンティティタイプに依存しません(同じプロパティ名はテナント内で同じ URI を共有します)
  
* `@context` は HTTP(S) URL でなければなりません(URN は受け付けられません)

#### @context の解決 (#1733)

NGSI-LD レスポンスのレンダリングに使用される `@context` は、リクエストが提供したもの**のみ**です。何も提供されない場合、NGSI-LD コア `@context` のみが使用され、それで圧縮できない用語は完全修飾 URI としてレンダリングされます(ETSI GS CIM 009 clause 5.5.5 / 5.5.7、<https://cim.etsi.org/NGSI-LD/official/clause-5.html>)。

したがって、カスタムデータモデルの `contextUrl` は自動的にレスポンスに追加**されません**。その語彙でレスポンスを圧縮するには、読み取り時に渡してください(JSON-LD `Link` ヘッダー)。

#### Vocabulary エンドポイント

自動生成された vocabulary IRI はこのContext Brokerによって提供されるため、参照解決が可能です。

| Endpoint                   | Method | Description                                                                                                                                   | Auth          | Success | Error |
| -------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------- | ----- |
| `/vocab/{tenantId}/{term}` | GET    | JSON-LD (`application/ld+json`) self-description of an auto-generated vocabulary term (`@id`, `rdfs:Class`, `rdfs:label`, `rdfs:isDefinedBy`) | None (public) | 200     | 400   |

報告される `@id` は、生成された `@context` に書き込まれる IRI とまったく同じように構築されます。

##### Broker ベース URL の解決

Context Brokerが発行するすべての自己参照 URL — vocabulary IRI、カスタムデータモデルの `contextUrl`、および `/llms.txt` と `/openapi.json` の例 — は、1 つのリゾルバー(`resolveSelfBaseUrl`)から次の順序で構築されます:

| Priority | Source                                  | Notes                                                                                                                                                                                                              |
| -------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1        | **`API_BASE_URL` environment variable** | Injected at deploy time from the SAM template parameter **`ApiBaseUrl`** (`infrastructure/template.yaml` → the Lambda's `API_BASE_URL`), which the deploy workflow populates from SSM. Constant per deployment     |
| 2        | Request **`Host`** header               | Used only when `API_BASE_URL` is unset. Scheme comes from `X-Forwarded-Proto` (loopback hosts default to `http`, others to `https`); API Gateway default URLs (`*.execute-api.*`) also get the stage path appended |
| 3        | `http://{HOST_NAME}:{PORT}`             | Local development fallback when there is no request context                                                                                                                                                        |

**vocabulary IRI を生成するすべてのデプロイメントで `ApiBaseUrl` を設定してください。** vocabulary IRI は永続的な識別子です。優先度 2 では、値はリクエストが到着したホスト名に依存するため、複数のホスト名で到達可能なContext Broker(例: テナントごとのワイルドカードサブドメイン)は、同じ用語に対して異なる IRI を生成することになります。ワイルドカードのみのデプロイメントでは、`ApiBaseUrl` はデフォルトで未設定のままです(`.github/workflows/deploy-env.yml`)。

vocabulary IRI は**識別子**であるため、その場で書き換えられることはありません。モデルの `propertyDetails` が変更され `@context` が再生成される場合、そのモデルがすでに使用している名前空間が引き継がれます。したがって、#1984 より前に作成されたモデルは、元の(`https://example.com/vocab/...`)IRI を保持し、それらの下で書き込まれたエンティティとの自己整合性を維持します。

### Catalog API

| Endpoint                               | Method | Description         | Success | Error    | Pagination      |
| -------------------------------------- | ------ | ------------------- | ------- | -------- | --------------- |
| `/catalog`                             | GET    | Get DCAT-AP catalog | 200     | 401      | -               |
| `/catalog/datasets`                    | GET    | List datasets       | 200     | 400, 401 | Yes (max: 1000) |
| `/catalog/datasets/{datasetId}`        | GET    | Get dataset         | 200     | 401, 404 | -               |
| `/catalog/datasets/{datasetId}/sample` | GET    | Get sample data     | 200     | 401, 404 | -               |

### Event Streaming API

WebSocket を使用したリアルタイムエンティティ変更ストリーミング。`EVENT_STREAMING_ENABLED=true` で有効化されます。

| Endpoint                                                                  | Protocol  | Description                                                                  |
| ------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------- |
| `wss://{api-id}.execute-api.{region}.amazonaws.com/{stage}?tenant={name}` | WebSocket | Stream entity change events (authentication sent via `Authorization` header) |

詳細については、[Event Streaming Documentation](../features/subscriptions.md) を参照してください。

### アクセス権限の概要

| API Category                                   | user             | tenant\_admin    | super\_admin      |
| ---------------------------------------------- | ---------------- | ---------------- | ----------------- |
| Public endpoints                               | Yes              | Yes              | Yes               |
| `/auth/*`                                      | Yes              | Yes              | Yes               |
| `/me/*`                                        | Yes              | Yes              | Yes               |
| `/statistics`, `/metrics`, `/cache/statistics` | Yes              | Yes              | Yes               |
| `/v2/*`                                        | Yes (own tenant) | Yes (own tenant) | Denied (403)      |
| `/ngsi-ld/*`                                   | Yes (own tenant) | Yes (own tenant) | Denied (403)      |
| `/catalog/*`                                   | Yes (own tenant) | Yes (own tenant) | Denied (403)      |
| `/admin/policies`, `/admin/policy-sets`        | No               | Yes (own tenant) | Yes (all tenants) |
| `/admin/*` (other)                             | No               | No               | Yes               |
| `/custom-data-models`                          | Yes (own tenant) | Yes (own tenant) | Denied (403)      |
| `/rules`                                       | No               | Yes (own tenant) | Denied (403)      |
| WebSocket                                      | Yes (own tenant) | Yes (own tenant) | Denied (403)      |

***

## 関連リンク


* [FIWARE NGSI v2 Specification](https://fiware.github.io/specifications/ngsiv2/stable/)
  
* [ETSI NGSI-LD Specification](https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/01.06.01_60/gs_CIM009v010601p.pdf)
  
* [FIWARE Orion Context Broker Documentation](https://fiware-orion.readthedocs.io/)
  
* [IPA 空間 ID ガイドライン](https://www.ipa.go.jp/digital/architecture/guidelines/4dspatio-temporal-guideline.html)
  
* [デジタル庁 空間 ID](https://www.digital.go.jp/policies/mobility_and_infrastructure/spatial-id)
  
* [RFC 7946 GeoJSON](https://datatracker.ietf.org/doc/html/rfc7946)
