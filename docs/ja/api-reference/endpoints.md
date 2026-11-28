---
title: "API Common Specification"
description: "GeonicDB API common specification, authentication, and query parameters"
outline: deep
---
# GeonicDB Context Broker API ドキュメント

これは AWS Lambda 上で動作する FIWARE Orion 互換の Context Broker の API ドキュメントです。NGSIv2 と NGSI-LD API の両方をサポートしています。

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

単一の末尾スラッシュは正規化されて削除されます (Orion-LD 互換): `/ngsi-ld/v1/entities/` は `/ngsi-ld/v1/entities` として扱われ、`/health/` や `/version/` などの運用エンドポイントは、スラッシュなしの形式と同じように応答します。実際の API リクエストでの**末尾のダブルスラッシュ** (`//`) は `400 BadRequest` で拒否されます。仕様 (ETSI GS CIM 009、NGSIv2) では末尾スラッシュ付きパスは定義されていませんが、これらを正規化することで、スラッシュを追加するクライアント/テストスイートとの相互運用性が向上し、ロードバランサーまたはモニターが末尾スラッシュ付きで設定されている場合のヘルスチェックの誤検知を回避できます。

> **注意 (CORS プリフライト)**: API 以外のパス (例: `/version`、`/health`) に対する `OPTIONS` リクエストは、パス正規化の前に CORS レイヤーによって直接 `204` で応答されるため、そのようなパスへの末尾 `//` を含む `OPTIONS` プリフライトは `400` ではなく `204` を返します。プリフライトはリクエストボディを持たず、データ/認可の決定も行わないため、これは無害です。データパス (`/ngsi-ld/*`、`/v2/*`) での `OPTIONS` は他のメソッドと同様に正規化されます。

### OPTIONS メソッド

`OPTIONS` メソッドはすべてのエンドポイントでサポートされています。CORS プリフライトリクエストに応答して、許可されたメソッドとヘッダーに関する情報を返します。

#### レスポンスフォーマット

OPTIONS リクエストは、以下のヘッダーを含む `204 No Content` を返します:

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

> **注意**: `If-None-Match` / `If-Modified-Since` は `Access-Control-Allow-Headers` に明示的にリストされており、ブラウザの HTTP キャッシュ自動再検証と SDK の条件付きリクエストがプリフライト拒否なしでクロスオリジンで発行できるようになっています (#1065)。

### エンティティリストにおける NGSIv2 排他的レジストレーション

`GET /v2/entities` の場合、`dataProvided.attrs` を持つ排他的レジストレーションは、一致するエンティティの宣言された属性のみを所有します。ローカルエンティティはリストに残り、プロバイダーの宣言された属性は同じ ID と type のローカル属性と組み合わされます。プロバイダーが宣言された属性を省略した場合、空のリストを返した場合、または利用できない場合、リストはプロバイダー所有の値を省略し、利用可能なデータを HTTP 200 で返します。接続失敗、タイムアウト、アップストリームエラーは、無制限のエンティティ読み取りアクセスを持つ呼び出し元に対して、レスポンスごとに一度 `Warning: 199 - "Federation provider unavailable"` を追加します。クライアントはこの警告を使用して部分的な結果を識別できます。成功した空のレスポンスまたは省略された属性は、この警告を追加しません。

エンティティ全体の排他的レジストレーションがリストクエリに一致する場合、リストにはプロバイダーの行のみが含まれます。属性が制限された排他的プロバイダーは、行を追加し、同じ ID と type を持つ行に宣言された属性を埋めることができます。エンティティ全体の排他的プロバイダーによって提供される値が優先されます。

無制限のエンティティ読み取りアクセスを持つ呼び出し元の場合、属性が制限された排他的レジストレーションを含むクエリは、`q` と `mq` を評価する前にローカル行とプロバイダー行を組み合わせます。要求された属性、合計カウント、ページネーションは、結果として得られた一致に適用されます。到達できないプロバイダーは値を提供しません。そのプロバイダーが所有する属性のローカル値は、条件を評価する前に省略されます。

Context Brokerは、候補コレクションをデッドライン、10,000 候補フラグメント、レスポンスメモリバジェットで制限します。NGSIv2 プロバイダーが継続リンクなしでフルページを返す場合、Context Brokerは元のセレクタを使用して次のオフセットを送信します。スコープリーダーは引き続き事前合成フィルタを使用します。プロバイダーのページネーションが完了できない場合、または候補セットがこれらのバジェットを超える場合、HTTP 503 を返します。リクエストがコレクション制限を超える場合は、より狭い type または ID セレクタを使用してください。正規表現述語の場合、評価長制限を超える値は正の正規表現にも負の正規表現にも一致できませんが、他の OR 代替は引き続き一致できます。

### エンティティ ID の一意性 (GeonicDB 拡張)

> **GeonicDB 拡張**: この動作は、同じ ID で異なる type を持つエンティティの共存を許可する標準 NGSIv2 仕様とは異なります。

GeonicDB では、エンティティ ID は**テナント** (`Fiware-Service`) と**ServicePath** (`Fiware-ServicePath`) のスコープ内で一意です。エンティティ `type` は一意性制約の**一部ではありません**。

**主な動作:**


* 既存のエンティティと同じ ID を持つエンティティを作成すると (異なる `type` であっても)、`409 AlreadyExists` が返されます
  
* バッチアップサート (NGSI-LD デフォルト更新モード) は `entityId` のみで照合し、既存のリストに新しいエンティティタイプを**追加**します (置換または削除しません; ETSI GS CIM 009 5.6.8.4 → 5.6.2.4 / #2455)。NGSIv2 バッチ追加は、保存された type を引き続き保持します
  
* 同じ ID のエンティティ間の type 曖昧性解消のための NGSIv2 `?type=` クエリパラメータは適用されなくなりました

この設計は、エンティティ ID が URI であり、本質的に一意である NGSI-LD 仕様と整合しています。エンティティ ID は、テナント、servicePath、プロトコルごとに一意です。NGSIv2 と NGSI-LD のエンティティは完全に分離されており、同じエンティティ ID が各プロトコルで独立して存在できます。

***

## 認証とマルチテナンシー

### 必須ヘッダー

すべてのリクエストには以下のヘッダーを含めることを推奨します:

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


* `/` で始まる絶対パスのみ許可されます
  
* 英数字とアンダースコアのみ許可されます
  
* 最大 10 階層、各階層は最大 50 文字まで

```bash
# Retrieve entities at a specific path
curl "http://localhost:3000/v2/entities" \
  -H "Fiware-Service: smartcity" \
  -H "Fiware-ServicePath: /Madrid/Gardens"
```

#### 階層検索 (`/#`

)

`/#` 接尾辞を使用すると、指定されたパスとそのすべての子パスを検索できます(**クエリ操作のみ**)。

```bash
# Search /Madrid/Gardens and all its child paths
curl "http://localhost:3000/v2/entities" \
  -H "Fiware-Service: smartcity" \
  -H "Fiware-ServicePath: /Madrid/Gardens/#"
```

#### 複数パス(カンマ区切り)

カンマで区切ることで複数のパスを同時に検索できます(最大 10 パス、**クエリ操作のみ**)。

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

**注意**: 書き込み操作では、単一の非階層パスのみ使用できます。`/#` または複数パスを指定するとエラーになります。

***

## ページネーション

すべてのリスト型 API エンドポイントでページネーションがサポートされています。

### パラメータ

| Parameter   | Description                                                                                                                                                                          | Default | Maximum               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | --------------------- |
| `limit`     | Maximum number of results to return                                                                                                                                                  | 20      | 1000 (Admin API: 100) |
| `offset`    | Number of results to skip                                                                                                                                                            | 0       | 10000                 |
| `pageToken` | Opaque continuation token from the previous response's next-page header (`Fiware-Next-Token` / `NGSILD-Next`). Enables **keyset pagination** on the default sort — see below (#1435) | -       | -                     |

### レスポンスヘッダー

各 API タイプに対して、合計カウントを示すヘッダーが返されます:

| API         | Header Name            | Condition                                                                |
| ----------- | ---------------------- | ------------------------------------------------------------------------ |
| NGSIv2      | `Fiware-Total-Count`   | Only when requested via `options=count` (opt-in per FIWARE NGSIv2 spec)  |
| NGSI-LD     | `NGSILD-Results-Count` | Only when requested via `count=true` (opt-in per ETSI GS CIM 009 §5.5.6) |
| Admin API   | `X-Total-Count`        | Always returned                                                          |
| Catalog API | `X-Total-Count`        | Always returned                                                          |

> NGSI エンティティリストエンドポイントは、カウントがリクエストされていない場合、カウントクエリを完全にスキップします。次のページは `Link` (`rel="next"`) / next-page token によって示されます (#1434)。

### Link ヘッダー

すべてのリストエンドポイントは [RFC 8288](https://www.rfc-editor.org/rfc/rfc8288) に準拠した `Link` ヘッダーを返し、次のページ (`rel="next"`) と前のページ (`rel="prev"`) の URL を提供します。結果が 1 ページに収まる場合、`Link` ヘッダーは返されません。

NGSI-LD ページネーションリンクには、`type` Link Target Attribute も含まれます。その値は、[ETSI GS CIM 009](https://cim.etsi.org/NGSI-LD/official/clause-6.html) clause 6.3.10 で要求されているように、元のリクエストのメディアタイプ(ネゴシエートされた `Content-Type`)と**完全に一致**します。JSON-LD `@context` リンクは、レスポンスのメディアタイプに関係なく `type="application/ld+json"` を保持します。

```http
Link: <https://api.example.com/v2/entities?limit=10&offset=20>; rel="next", <https://api.example.com/v2/entities?limit=10&offset=0>; rel="prev"
```

```http
# NGSI-LD (Accept: application/json) — pagination type matches Content-Type
Link: <https://api.example.com/ngsi-ld/v1/entities?limit=10&offset=20>; rel="next"; type="application/json", <https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.9.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"
```

### Keyset Pagination (`pageToken`

, #1435)

エンティティリストエンドポイント (NGSIv2 `/v2/entities`、NGSI-LD `/ngsi-ld/v1/entities`) は、**デフォルトソート** (`createdAt` 昇順、次に `_id`) で **keyset (seek) pagination** をサポートします。これにより、深いオフセットページでの線形 `skip` コストを回避できます。


* 各レスポンスの next-page token (`Fiware-Next-Token` / `NGSILD-Next`) は、最後に返されたエンティティの位置をエンコードします。これを**不透明**なものとして扱い、自分でデコードまたは構築しないでください。
  
* 次のページを取得するには、`pageToken` クエリパラメータを介して送り返します。Context Brokerは、`skip` ではなく、インデックス範囲スキャン (`O(log n)`) で次のページを解決します。
  
* keyset パスでは、`Link` `rel="next"` URL は `offset` の代わりに `pageToken` を含みます (keyset は前方のみのため、`rel="prev"` はありません)。

```bash
# Page 1 — read the Fiware-Next-Token response header
curl -i "http://localhost:3000/v2/entities?limit=100" -H "Fiware-Service: smartcity"

# Page 2 — send that token back as pageToken
curl "http://localhost:3000/v2/entities?limit=100&pageToken=<token-from-page-1>" \
  -H "Fiware-Service: smartcity"
```

注意事項と制約:


* `offset`/`limit` は完全にサポートされており、変更されていません。`pageToken` は追加的なもので、keyset は送り返したときのみアクティブになります。
  
* `pageToken` はデフォルトソートに対してのみ有効です。`orderBy` (または距離順の geo-query) と組み合わせると `400` が返されます。
  
* `pageToken` と `offset` は相互排他的です (両方が指定された場合は `400`)。
  
* `pageToken` を再利用しながらページ間でフィルターパラメータ (`q`、`mq`、`type`、…) を変更すると、未定義の結果になります (行をスキップまたは繰り返す可能性があります) — 標準的な keyset の注意事項です。
  
* `options=count` / `count=true` は、(トークンの位置に関係なく) 完全な合計カウントを返します。

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

### 注記


* `offset` が合計カウントを超える場合、空の配列が返されます (エラーではありません)
  
* FIWARE Orion 仕様に準拠

***

## HTTP キャッシュ制御 (ETag / 条件付きリクエスト)

GET エンドポイントはエンドポイントクラスに基づいてキャッシュ関連ヘッダーを返します。クライアントはこれらを使用して、変更されていないレスポンスボディの転送をスキップでき、[RFC 7232](https://datatracker.ietf.org/doc/html/rfc7232) および [RFC 7234](https://datatracker.ietf.org/doc/html/rfc7234) に準拠します。

### エンドポイントクラス

| Class        | Endpoints                                                                                                                                                                                                                                                                         | Validator (ETag/Last-Modified)                                        | Conditional Requests                              | Cache-Control                                     |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------- |
| **Data**     | `/v2/entities` (list, single, attrs, attrs/{name}, attrs/{name}/value), `/v2/subscriptions`, `/v2/registrations`, `/ngsi-ld/v1/entities` (list, single, attrs, attrs/{name}), `/ngsi-ld/v1/subscriptions`, `/ngsi-ld/v1/csourceRegistrations`, `/ngsi-ld/v1/csourceSubscriptions` | ✓                                                                     | ✓ (`If-None-Match` / `If-Modified-Since` → `304`) | `private, no-cache`                               |
| **Temporal** | `/ngsi-ld/v1/temporal/entities` (list, single, including aggregation)                                                                                                                                                                                                             | ✗ (no ETag — time-series aggregation lacks cheap monotonic validator) | ✗                                                 | `private, no-cache`                               |
| **Meta**     | `/v2/types`, `/ngsi-ld/v1/types`, `/ngsi-ld/v1/attributes` (list and single)                                                                                                                                                                                                      | ✗ (no ETag, no Last-Modified)                                         | ✗ (no `304` support)                              | `private, max-age=60, stale-while-revalidate=120` |

すべてのキャッシュ制御されたレスポンスは同じ `Vary` ヘッダーを共有します: `NGSILD-Tenant, Fiware-Service, Fiware-ServicePath, Authorization, X-Api-Key, Accept, x-cadde-options` (テナント + 認証 + コンテンツネゴシエーション + CADDE オプションの分離、CloudFront のような共有キャッシュに必要)。

### レスポンスヘッダー (データエンドポイント)

| Header          | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ETag`          | Weak entity tag (`W/"..."`, RFC 7232 §2.3.2 weak validator). Generation always mixes a **resource scope** (`path + Accept + representation + resolved tenant + servicePath`) into the seed so that different endpoints, Accept formats, **tenants**, or **service paths** produce distinct ETags even when the underlying state is identical. The tenant / servicePath slots come from the **resolved `TenantContext`** produced by `extractTenantContext` (CADDE `x-cadde-options` merge included) — raw request headers are not re-read (#1835). The tenant / servicePath seed defends against cross-tenant ETag collision even if `Vary` is mishandled by an intermediate cache. <br>• **NGSI-LD entity list** (`GET /ngsi-ld/v1/entities`, non-federated, non-geoNear, non-materialized): lightweight validator derived from `total count + max(modifiedAt)` with a scope that also includes the full query string, computed **without fetching entity bodies** so `If-None-Match` is evaluated and `304` returned before the heavy query (#1261). Federated / geoNear / join / splitEntities / entityMap paths fall back to the streaming digest below. <br>• **Other lists** (NGSIv2 entities, subscriptions, registrations, csource\*): streaming digest of each element's `id + modifiedAt`, combined with the total count and the resource scope. <br>• **Single resources**: hash of `modifiedAt` combined with the resource scope. |
| `Last-Modified` | RFC 1123 HTTP-date of the latest `modifiedAt` in the result set.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `Cache-Control` | `private, no-cache` — `private` forbids storage in shared / intermediate caches (CloudFront, ISP proxies, corporate proxies). `no-cache` forces revalidation before reuse from a private cache.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `Vary`          | `NGSILD-Tenant, Fiware-Service, Fiware-ServicePath, Authorization, X-Api-Key, Accept, x-cadde-options`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

### レスポンスヘッダー (メタエンドポイント)

| Header          | Description                                                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Cache-Control` | `private, max-age=60, stale-while-revalidate=120` — shared/intermediate cache storage is forbidden; private cache can reuse briefly with background revalidation. |
| `Vary`          | Same as data endpoints.                                                                                                                                           |

メタエンドポイントは意図的に `ETag` / `Last-Modified` を省略しています。これは、それらのコンテンツが集約クエリから派生しており、安価な単調バリデータを持たないためです。クライアントは条件付きリクエストの代わりに、プライベートキャッシュの `max-age` ウィンドウに依存する必要があります。

### 条件付きリクエスト (データエンドポイントのみ)

クライアントは条件付きリクエストヘッダーを送信して、結果が変更されていない場合に `304 Not Modified` (空のボディ) を受信できます:

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

### 注意事項


* ETag は弱 (`W/`) です — これらはバイト単位の同一性ではなく、意味的な等価性を伝えます。同じデータでも属性の順序が異なる 2 つのレスポンスは、同じ ETag を共有します。
  
* ETag の生成にはリソースパスと `Accept` ヘッダーがシードに含まれます。異なるエンドポイントと異なるコンテンツネゴシエーションは、基礎となる状態 (例: 空のリスト) が同一であっても、常に異なる ETag を生成し、エンドポイント間または Accept 間のキャッシュポイズニングを防ぎます。
  
* `304` レスポンスは `ETag`、`Last-Modified`、`Cache-Control`、`Vary`、および CORS ヘッダーを保持します。
  
* 条件付き評価は、基礎となる `GET` または `HEAD` レスポンスのステータスが `200` の場合に適用されます。条件に一致する場合でも、軽量な再検証のために `304` を返します。
  
* 実装された ETSI NGSI-LD 取得操作に対する成功した `HEAD` リクエストは、ボディ、`Content-Length`、または `Content-Range` なしで `204 No Content` を返します。`200` をチェックするクライアントは `204` を受け入れる必要があります。部分的な結果や範囲メタデータが必要な場合は `GET` を使用してください。[ETSI TS 104 176 V1.1.1, clause 5](https://www.etsi.org/deliver/etsi_ts/104100_104199/104176/01.01.01_60/ts_104176v010101p.pdf#page=21) を参照してください。
  
* キャッシュ制御は以下に適用されます:
  
  * **NGSIv2**: `/v2/entities` (リスト / 単一 / attrs / attrs+name / attrs+name+value)、`/v2/subscriptions`、`/v2/registrations`、`/v2/types`
    
  * **NGSI-LD Data**: `/ngsi-ld/v1/entities` (リスト / 単一 / attrs / attrs+name)、`/ngsi-ld/v1/subscriptions`、`/ngsi-ld/v1/csourceRegistrations`、`/ngsi-ld/v1/csourceSubscriptions`
    
  * **NGSI-LD Meta**: `/ngsi-ld/v1/types`、`/ngsi-ld/v1/attributes`
    
  * **NGSI-LD Temporal**: `/ngsi-ld/v1/temporal/entities` (リストと単一、`Cache-Control` のみ — `ETag` / `Last-Modified` なし)

### クライアント駆動のキャッシュ制御

クライアントは `Cache-Control` リクエストヘッダーを送信して、キャッシュ動作に影響を与えることができます:

| Request Header             | Server Behavior                                                                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `Cache-Control: no-store`  | Server overrides response `Cache-Control` to `no-store` (CDN/intermediary cache suppression hint).                                 |
| `Cache-Control: no-cache`  | Server makes no special override; the endpoint's default policy still applies (data → revalidation; meta → `max-age=60` etc).      |
| `Cache-Control: max-age=N` | Reserved for edge-cache layer (Phase 3 / CloudFront). The Lambda server itself is stateless and does not interpret this directive. |

### エラーレスポンスのキャッシング (#1821)

RFC 9110 §15.1 では、ヒューリスティックにキャッシュ可能なステータスコードとして 200、203、204、206、300、301、308、404、405、410、414、501 が定義されています。これらのうちエラーステータスは 404、405、410、414、501 です。明示的な `Cache-Control` ディレクティブがない場合、共有キャッシュ(例えば CloudFront Error Caching Minimum TTL)はこれらのレスポンスをヒューリスティックに保存する可能性があります。テナントスコープのエンティティ GET において、別のテナントからキャッシュされた 404 が存在オラクル(CWE-525 クラス)になる可能性があります。

GeonicDB のエラーハンドラは、生成するすべてのヒューリスティックにキャッシュ可能なエラーに対して `Cache-Control: no-store` を設定します。ほとんどの 400 クラスのエラーはヒューリスティックにキャッシュ可能ではないため、オーバーライドされません。エラーハンドラはこれらのレスポンスに独自の `Vary` を追加しません(CORS レイヤーは引き続き `Vary: Origin` を追加します)。

| Status                      | Error-handler `Cache-Control` |
| --------------------------- | ----------------------------- |
| 404 / 405 / 410 / 414 / 501 | `no-store`                    |
| 400 / 401 / 403 / 409 / …   | (no override)                 |

***

## 認証 API

認証機能により、ユーザー認証とアクセス制御が可能になります。

### 有効化

認証はデフォルトで無効になっています。次の環境変数で有効にできます。

**注意**: `AUTH_ENABLED=false` の場合、認証関連のエンドポイント(`/auth/*`、`/me`、`/me/*`、`/admin/*`)は 404 を返します。

**重要**: 認証はデフォルトで有効になっています(明示的な `AUTH_ENABLED=false` によってのみ無効化され、これはローカル開発を想定しています)。有効な場合、NGSI API エンドポイント(`/v2/*`、`/ngsi-ld/*`、`/catalog/*`)へのアクセスには認証が必要です。認証なしでアクセスすると `401 Unauthorized` エラーが返されます。

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

| Role             | Description                     | Permissions                                                                                                                                                                                                                                                                                                                                                |
| ---------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `super_admin`    | Super administrator             | `/admin/*`, `/auth/*`, `/me/*`, monitoring endpoints only. **Cannot** access data APIs (`/v2/*`, `/ngsi-ld/*`, `/catalog*`, `/rules*`) — returns 403                                                                                                                                                                                                       |
| `platform_admin` | IAM-exchanged Geolonia operator | Only `/admin/deployments*`, `/admin/users` (`super_admin` rows), `/admin/metrics`, and `/me`. Other admin APIs (tenants, API keys, policies, …) return 403 (#3817). Same data-API deny-fence as `super_admin`. Issued only by `POST /auth/platform-token` (15 min, no refresh). Can create and manage `super_admin` only. Cannot be assigned to a DB user. |
| `tenant_admin`   | Tenant administrator            | Manage users within their own tenant                                                                                                                                                                                                                                                                                                                       |
| `user`           | General user                    | View own profile and change password only                                                                                                                                                                                                                                                                                                                  |

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
  "tenantId": "target-tenant-id"
}
```

| Parameter    | Type   | Required | Description                                                                                    |
| ------------ | ------ | -------- | ---------------------------------------------------------------------------------------------- |
| `email`      | string | Yes      | Email address                                                                                  |
| `password`   | string | Yes      | Password                                                                                       |
| `tenantId`   | string | No       | Tenant UUID. Issues a JWT scoped to that tenant. Mutually exclusive with `tenantName`          |
| `tenantName` | string | No       | Tenant name (#1223). Resolved server-side to a tenant UUID. Mutually exclusive with `tenantId` |

**テナント解決優先順位**:

1. `body.tenantId` (UUID、最優先)
   
2. `body.tenantName` (サーバー側で UUID に解決、#1223)
   
3. `NGSILD-Tenant` / `Fiware-Service` ヘッダー (名前で UUID に解決)
   
4. プライマリテナント (`user.tenantId`) — 何も指定されていない場合のフォールバック

`tenantId` と `tenantName` は **相互排他的** です — 両方を指定すると `400 Bad Request` が返されます。ヘッダー値は `^[a-z0-9_]+$` にマッチする必要があります。テナント名は `tenants.name` の部分的な一意インデックスにより、アクティブ / 非アクティブなテナント間で一意性が保証されます (ソフト削除されたテナントは除外、#1223)。

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

**レスポンス**: ログインと同じフォーマット。

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

API キー (`X-Api-Key` または `api_key_session`) と OAuth クライアント認証情報は異なるボディを使用します。ユーザーフィールドは含まれません。[AUTH.md — Current principal](../reference/auth.md#current-principal-get-me) を参照してください。

その他の `/me` ルート (`/me/password`、`/me/api-keys`、`/me/oauth-clients`、`/me/policies`) はユーザー専用です。API キーと OAuth クライアントプリンシパルは `403 Forbidden` を受け取ります。

```json
{
  "principal": "api_key",
  "keyId": "7610a684-....",
  "name": "geonicai-chat",
  "tenantId": "tenant-456",
  "tenantName": "My Organization",
  "createdBy": "user-123",
  "policyId": null
}
```

`createdBy` は、保存された API キーに作成者がいない場合は `null` になります。このプロパティは常に存在します。

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

**注意**: パスワードを変更すると、既存のすべてのアクセストークンとリフレッシュトークンが無効化されます。新しいトークンを取得するために再度ログインしてください。

### ログアウト

```http
POST /auth/logout
Authorization: Bearer <accessToken>
```

すべてのセッションを無効化します。このユーザーに対して発行されたすべてのアクセストークンとリフレッシュトークンは直ちに無効化されます。

**レスポンス**: `204 No Content`

### API Key トークン交換

#### Nonce を取得

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

#### トークンを交換

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

**DPoP トークンバインディング** (オプション): [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) に従って、ECDSA P-256 proof JWT を含む `DPoP` ヘッダーを含めます。存在する場合、レスポンスの `token_type` は `"DPoP"` になり、JWT には proof キーにバインドする `cnf.jkt` クレームが含まれます。サーバーは DPoP-Nonce (RFC 9449 §8) を要求します — 最初のリクエストは `DPoP-Nonce` ヘッダーと共に `400 use_dpop_nonce` を返します。proof の `nonce` クレームに nonce を含めて再試行してください。詳細については [AUTH.md](../reference/auth.md#dpop-token-binding-rfc-9449) を参照してください。

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

**招待モード (#1532)** — `passwordResetRequired: true` を設定し(`password` は省略)、サーバー生成のワンタイムの一時パスワードでアカウントを作成し、初回ログイン時にパスワード変更を強制します:

```json
{
  "email": "newuser@example.com",
  "role": "user",
  "primaryTenantId": "tenant-456",
  "passwordResetRequired": true
}
```

`201` レスポンスには `temporaryPassword` と `expiresAt`(デフォルト TTL 7 日)が含まれ、`Cache-Control: no-store` が付与されます。`password` と `passwordResetRequired: true` を同時に送信すると `400` で拒否されます。ワンショットの初回ログインフローについては [AUTH.md](../reference/auth.md) を参照してください。

#### ユーザーパスワードのリセット

**既存**ユーザー(例: パスワード忘れ)に対して新しい一時パスワードを発行し、次回ログイン時に変更を強制します:

```http
POST /admin/users/{userId}/reset-password
Authorization: Bearer <accessToken>
```

`{ userId, temporaryPassword, expiresAt, passwordResetRequired, message }` を `Cache-Control: no-store` とともに返します。認可: `super_admin`(すべてのユーザー)/ `tenant_admin`(自身のテナント内のユーザー)。

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

ここで `password` を設定すると、**保留中の強制パスワード変更がクリアされ** (#1566)、**ユーザーの既存のパスワード派生セッションが取り消されます** — 管理者が選択したパスワードはすぐに使用可能になり、次回ログイン時にユーザーはリセットを求められません。

`tenant_admin` または `user` の `role` は、ユーザーのプライマリテナントにおける既存のメンバーシップにも適用されます(同じリクエスト内の `primaryTenantId` 変更後)ので、次回ログイン時に有効になります (#3552)。他のテナントのメンバーシップは変更されません — それらには `PUT /admin/tenants/{tenantId}/users/{userId}` を使用してください。プライマリテナントにメンバーシップが存在しない場合、メンバーシップは作成されません。

`isActive` はこのエンドポイントでは受け付けられません (400)。有効化または無効化には `POST /admin/users/{userId}/activate` または `POST /admin/users/{userId}/deactivate` を使用してください (#3516)。

#### ユーザー削除

```http
DELETE /admin/users/{userId}
Authorization: Bearer <accessToken>
```

#### ユーザーのアクティブ化/非アクティブ化

```http
POST /admin/users/{userId}/activate
POST /admin/users/{userId}/deactivate
Authorization: Bearer <accessToken>
```

#### ログインのロック解除

ブルートフォース攻撃保護によってロックされたアカウントのロックを解除します。

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

`settings.requireDataModel` (boolean、デフォルトはオフ) — `true` の場合、すべてのエンティティタイプにアクティブなカスタムデータモデルがない限り、エンティティの作成 / 更新 / upsert は 400 で拒否されます。バッチ作成および新しいエンティティを挿入するバッチ upsert も 400 になります。バッチ更新 (`POST /ngsi-ld/v1/entityOperations/update`) とバッチマージ (`POST /ngsi-ld/v1/entityOperations/merge`) は 207 を返し、エンティティごとのエラーに拒否内容が含まれます。`isActive: false` は欠落として扱われ、明確なエラーメッセージが表示されます。読み取りとエンティティの削除は変更されません。フィールドを省略する (または `false` に設定する) と、モデルがないタイプを許可するデフォルトが維持されます。
属性の削除も同じ方法で拒否されます。`DELETE /ngsi-ld/v1/entities/{id}/attrs/{attrName}` は 400 になり、`datasetId` が 1 つのインスタンスのみを削除する場合も含まれます。バッチ属性削除 (マージ時の `urn:ngsi-ld:null`) は上記と同様に 207 になります。エンティティを削除するか、モデルを登録してクリーンアップしてください。
`super_admin` のみが `settings.requireDataModel` を設定できます (`POST` / `PATCH /admin/tenants/{tenantId}`)。

`settings.caddeEnabled` (boolean、未設定 = 公開されない) — GeonicDB 拡張 (#3580、#3628 以降はオプトイン)。`true` の場合のみ `/cadde/**` がこのテナントを提供します。未設定、`false`、または boolean 以外の値の場合は `403` `Access denied: no applicable policy` を返し、欠落または無効化されたテナントと同じボディになります。**破壊的変更:** #3628 以前は未設定のテナントが読み取り可能でした。認証が無効の場合は評価されません (未設定 = 403 ルールは認証が有効な場合にのみ適用されます)。SECURITY.md を参照してください。

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

**カスケード削除**: テナントが削除されると、関連するすべてのデータ (エンティティ、サブスクリプション、登録、ルール、ポリシー、ユーザー、メンバーシップ、およびすべての 16 コレクション) が自動的にカスケード削除されます。削除が開始される前に、テナントは自動的に無効化され、新しい API リクエストがブロックされます。無効化により、既存のアクセストークン、API キー、または匿名アクセス、CADDE v4 (`/cadde/api/v4/*`、#3576) で行われたデータ操作、および新しい WebSocket 接続が拒否され、403 が返されます (他のインスタンスでは 30 秒以内)。テナントへの開いている WebSocket 接続はベストエフォートベースで閉じられます (#3543): スタンドアロンサーバーはクローズコード `1008` と理由 `Tenant deactivated` を送信します。AWS では接続は API Gateway `DeleteConnection` で削除されますが、クローズコードや理由を伝えることはできません。閉じることに失敗した場合、接続は開いたままになる可能性がありますが、非アクティブなテナントのイベントは配信されません。テナントのサブスクリプション通知 (定期的、コンテキストソース、`notification.join`、ルール `sendNotification`、Web Push を含む) は、非アクティブな間は配信されません。ReactiveCore ルールは非アクティブな間はテナントに対して評価されません (`webhook` を含む)。[テナントのアクティブ化/非アクティブ化](#テナントのアクティブ化非アクティブ化) を参照してください (#3596)。削除によりサブスクリプションが削除されるため、何も再開されません。可逆的なケースについては [テナントのアクティブ化/非アクティブ化](#テナントのアクティブ化非アクティブ化) を参照してください。`requireAuth` における HTTP `isActive` チェックは、アクターが `tenantId` (通常は `primaryTenantId`) を持っている場合にのみ実行されます。`primaryTenantId` を持つ `super_admin` は、そのテナントが非アクティブ化された後 `/admin/**` で拒否されます。テナント ID を持たない `super_admin` / `platform_admin` はそのチェックをスキップします。データ API アクセスは依然として deny-fence によって拒否され、非アクティブなテナントへの WebSocket 接続はすべてのロールで拒否されます。アクティブ化により、有効期限が切れていないアクセストークンのアクセスが復元されます。有効期限が切れたアクセストークンは復活しません (まだ有効なリフレッシュトークンで新しいトークンを発行できます)。API キーは JWT の有効期限に制約されず、再発行なしで再び使用可能になります。トークンは取り消されません。

#### テナントのアクティブ化/非アクティブ化

```http
POST /admin/tenants/{tenantId}/activate
POST /admin/tenants/{tenantId}/deactivate
Authorization: Bearer <accessToken>
```

非アクティブ化により、そのテナントのデータ操作と新しい WebSocket 接続が 403 で拒否されます。これには、呼び出し前に発行された認証情報も含まれます。そのテナントのメンバーも `/admin/**`、`/me/**`、`/auth/logout`、`/auth/dpop-bind` で 403 で拒否されるため、テナント管理者は非アクティブな間に自分のテナントを再アクティブ化したり、キーを発行したりすることはできません (#3542)。テナントへの開いている WebSocket 接続はベストエフォートベースで閉じられます (#3543): スタンドアロンサーバーはクローズコード `1008` と理由 `Tenant deactivated` を送信します。AWS では接続は API Gateway `DeleteConnection` で削除されますが、クローズコードや理由を伝えることはできません。閉じることに失敗した場合、接続は開いたままになる可能性がありますが、非アクティブなテナントのイベントは配信されません。テナントのサブスクリプション通知 (定期的、コンテキストソース、`notification.join`、ルール `sendNotification`、Web Push を含む) は、非アクティブな間は配信されません。ReactiveCore ルールは非アクティブな間はテナントに対して評価されません (`webhook` を含む)。評価はアクティブ化時に再開されます (#3596)。サブスクリプションは `status` を保持し、何も取り消されないため、`activate` 後、次のイベントまたは期間で通知が再開されます。WebSocket クライアントは再接続する必要があります (SDK は最大 10 回まで自動的に再接続します)。デプロイメント管理者の非アクティブなテナントへの WebSocket 接続も拒否されます。`requireAuth` における HTTP `isActive` チェックは、アクターが `tenantId` を持っている場合にのみ適用されます。`primaryTenantId` が設定された `super_admin` は非アクティブ化後 `/admin/**` で拒否されますが、テナントを持たない `super_admin` / `platform_admin` はそのチェックをスキップします。データ API アクセス (NGSI、カタログ、ルール) は依然として deny-fence によって拒否されます。他のインスタンスは、テナントキャッシュ TTL (30 秒) 内に変更を適用します。アクティブ化により、新しいログインなしで有効期限が切れていないアクセストークンのアクセスが復元されます。有効期限が切れたアクセストークンには、有効なリフレッシュトークンまたは新しいログインが必要です。API キーは JWT の有効期限に制約されず、再発行なしで再び使用可能になります。

### カスタムデータモデル管理

> **注意**: カスタムデータモデル API は `/custom-data-models` に移動しました。詳細については [カスタムデータモデル API](#カスタムデータモデル-api) セクションを参照してください。

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

#### テナント毎の IP 制限

個別の IP 制限をテナント毎に設定できます。テナントレベルの設定が存在する場合は、グローバル設定 (`ADMIN_ALLOWED_IPS`) よりも優先されます。

```http
GET /admin/tenants/{tenantId}/ip-restrictions
PUT /admin/tenants/{tenantId}/ip-restrictions
DELETE /admin/tenants/{tenantId}/ip-restrictions
Authorization: Bearer <accessToken>
```

スコープは `admin` (Admin API のみ) または `all` (すべての API) のいずれかになります。詳細については [AUTH.md](../reference/auth.md#per-tenant-ip-restrictions) を参照してください。

### ルールエンジン管理 (tenant\_admin)

エンティティの変更を自動的に処理するルールを管理します。`tenant_admin` ロールが必要です。認証が有効な場合 (デフォルト)、`super_admin` は `/rules*` エンドポイントにアクセスできません。


* **[REACTIVCORE\_RULES.md](../features/reactivcore-rules.md)** - ユーザーガイド (使用例、Admin API など)

#### ルールの一覧表示

```http
GET /rules
Authorization: Bearer <accessToken>
```

**クエリパラメータ**

| Parameter     | Description                                                                                                                                                                                                                                                     |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `limit`       | Number of results (default: 20, max: 100)                                                                                                                                                                                                                       |
| `offset`      | Offset (default: 0)                                                                                                                                                                                                                                             |
| `servicePath` | Filter by service path. If omitted, defaults to the servicePath authorization was evaluated against (resolved `Fiware-ServicePath`, default `/`) rather than matching every servicePath (#2259) — see [REACTIVCORE\_RULES.md](../features/reactivcore-rules.md) |
| `isActive`    | Filter by active/inactive (`true` / `false`)                                                                                                                                                                                                                    |

#### ルールの作成

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

#### ルールの取得

```http
GET /rules/{ruleId}
Authorization: Bearer <accessToken>
```

#### ルールの更新

```http
PATCH /rules/{ruleId}
Authorization: Bearer <accessToken>
Content-Type: application/json
```

レスポンス: `204 No Content`

#### ルールの削除

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

ルールアクション (`createEntity`、`updateAttribute`、`deleteAttribute`) は、プロトコルの境界を越えて動作するためのオプションの `protocol` フィールドをサポートしています。`createEntity` アクションは、階層制御のための `servicePath` および `scope` フィールドもサポートしています。

| Field         | Actions                                        | Type                         | Description                                                 |
| ------------- | ---------------------------------------------- | ---------------------------- | ----------------------------------------------------------- |
| `protocol`    | createEntity, updateAttribute, deleteAttribute | `'ngsiv2' \| 'ngsild'` | Target protocol (default: inherit from trigger)             |
| `servicePath` | createEntity                                   | `string`                     | Target servicePath for NGSIv2 (supports template variables) |
| `scope`       | createEntity                                   | `string[]`                   | Target scope for NGSI-LD (supports template variables)      |

プロトコルをまたぐ際、servicePath ↔ scope は自動的にマッピングされます。テンプレート変数 `${trigger.protocol}`、`${trigger.servicePath}`、`${trigger.scope}`、`${trigger.service}` はトリガーエンティティのコンテキストを参照します。

詳細な例とマッピングルールについては **[REACTIVCORE\_RULES.md](../features/reactivcore-rules.md)** を参照してください。

***

## OAuth 2.0 API (M2M 認証)

OAuth 2.0 Client Credentials Grant フローを使用した Machine-to-Machine (M2M) 認証がサポートされています。

**主要なエンドポイント:**

* `POST /oauth/token` - トークン取得 (Basic 認証)
  
* `POST /admin/oauth-clients` - クライアント作成 (管理者)
  
* `GET /admin/oauth-clients` - クライアント一覧 (管理者)
  
* `POST /admin/oauth-clients/{clientId}/regenerate-secret` - シークレット再生成 (管理者)
  
* `POST /me/oauth-clients` - 自分のクライアントを作成 (セルフサービス)
  
* `GET /me/oauth-clients` - 自分のクライアント一覧 (セルフサービス)
  
* `DELETE /me/oauth-clients/{clientId}` - 自分のクライアントを削除 (セルフサービス)
  
* `POST /me/oauth-clients/{clientId}/regenerate-secret` - 自分のシークレット再生成 (セルフサービス)

**有効化:** OAuth 2.0 は認証が有効な場合 (デフォルト) に常に利用可能です。`OAUTH_ENABLED` 環境変数は #1982 で削除されました — コードベースに読み取り箇所がありませんでした。

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

> ロール列は、セルフサービス (`/me/oauth-clients`) 経由でリクエストできるスコープを示しています。管理者が作成したクライアント (`/admin/oauth-clients`) はこれらの制限を受けません。

**詳細:** [AUTH.md](../reference/auth.md) の OAuth 2.0 セクションを参照してください。

***

## API キートークン交換 (Browser SDK)

ブラウザベースのアプリケーションは、Nonce + Proof of Work を介して API キーを短期間有効なセッション JWT と交換できます。

**主要なエンドポイント:**

* `POST /auth/nonce` - Nonce + PoW チャレンジをリクエスト (API キー + Origin ヘッダーが必要)
  
* `POST /oauth/token` (`grant_type=api_key`) - API キー + nonce + PoW proof をセッション JWT と交換

**JavaScript SDK:** `npm install @geolonia/geonicdb-sdk` — トークン交換、DPoP、WebSocket、再接続を自動的に処理します。

**セキュリティレイヤー:** Origin 検証 → HMAC Nonce (60秒 TTL) → Proof of Work → 短期間有効な JWT (1時間)

**詳細:** AUTH.md の [API Key Token Exchange](../reference/auth.md#api-key-token-exchange-browser-sdk) セクションおよび SDK ドキュメントで完全な API リファレンスを参照してください。

***

## メタエンドポイント

メタエンドポイントは認証を必要とせず、システムステータスと API 情報を提供します。

### API ドキュメント (llms.txt 形式)

```http
GET /llms.txt
```

AI フレンドリーな [llms.txt](https://llmstxt.org/) 形式で API ドキュメントを返します。AI エージェントや LLM が容易に理解できるように構造化された Markdown 形式を使用します。

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

GeonicDB 固有の `extensions.vectorSearch` オブジェクトは、接続された MongoDB デプロイメントが Atlas Vector Search (`$vectorSearch` / `listSearchIndexes`) をサポートしているかどうかを報告します。環境機能に応じて RAG および埋め込み機能を制御するために使用されます。

| Field                                   | Type                    | Description                                                    |
| --------------------------------------- | ----------------------- | -------------------------------------------------------------- |
| `extensions.vectorSearch.available`     | boolean                 | `true` when Atlas Vector Search is reachable                   |
| `extensions.vectorSearch.serverVersion` | string \| omitted | MongoDB server version (from `buildInfo`); omitted on failure  |
| `extensions.vectorSearch.checkedAt`     | string (ISO 8601)       | Timestamp the capability was last probed                       |
| `extensions.vectorSearch.reason`        | string \| omitted | Failure reason when `available=false` (e.g. `CommandNotFound`) |

機能プローブは 5 分間インメモリでキャッシュされるため、`/version` 自体は負荷の高い状況でも軽量なままです。

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

#### Liveness Probe

```http
GET /health/live
```

Route 53 ヘルスチェックおよびその他の liveness probe 用です。サービスが稼働しているかどうかをチェックします。

**レスポンス例**

```json
{
  "status": "healthy",
  "timestamp": "2026-01-25T10:30:00Z",
  "region": "ap-northeast-1",
  "regionRole": "primary"
}
```

#### Readiness Probe

```http
GET /health/ready
```

Route 53 ヘルスチェックおよびその他の readiness probe 用です。MongoDB の接続性をチェックし、オプションで DynamoDB、EventBridge、および WebSocket 配信パスのディープヘルスチェックを実行します。

**環境変数によるディープヘルスチェックの有効化**

| Environment Variable            | Description                                                                         |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `HEALTH_CHECK_DYNAMODB=true`    | Add DynamoDB DescribeTable connectivity check                                       |
| `HEALTH_CHECK_EVENTBRIDGE=true` | Add EventBridge DescribeEventBus connectivity check                                 |
| `HEALTH_CHECK_WEBSOCKET=false`  | Opt out of the WebSocket `$connect` synthetic probe (enabled by default; see below) |

EventStreaming が有効化されている場合(`WS_API_ENDPOINT` が設定されている場合)、readiness probe は自動的に WebSocket `$connect` 合成プローブも実行します:実際の WebSocket API を介して Upgrade リクエスト(トークンなし)を送信し、5xx の場合はサービスを異常とマークします。これにより、REST チェックでは見逃される WebSocket パスの無音障害を検出します。通常は設定不要で、EventStreaming が無効化されている場合やスタンドアロンモードでは自動的にスキップされます。プローブを一時的に無効化するには(例: WS インシデント調査中)、`HEALTH_CHECK_WEBSOCKET=false` を設定してください。

**レスポンス**

* 成功: `200 OK` と `status: "healthy"`
  
* 失敗: `503 Service Unavailable` と `status: "unhealthy"`

**レスポンス例(ディープヘルスチェック有効化時)**

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

オプションの `reset=true` クエリパラメータは、カウンタを読み取った後にクリアします。これらのカウンタ(`counters`、`timing`、`notifQueue`)は**プロセスグローバルでテナントディメンションを持たない**ため、リクエストを処理したプロセス内でリセットを実行すると、すべてのテナントの数値が一度に消去され、テナント単位でスライスすることはできません。他のプロセスには影響しません。Lambda (#1507) では、`GET /statistics` と `GET /metrics` はデータプレーン関数で実行されます。`reset=true` は**そのリクエストを処理したデータプレーンインスタンスのみ**をクリアします。その関数の他のウォームコンテナと、`/admin/metrics` を提供するコントロールプレーン関数は、それぞれ独自のカウンタを保持します。そのため、環境のスーパー管理者(`id` `super-admin`)または `platform_admin` (#3495) に制限されています。デプロイメントデータベースに保存されている `super_admin` やその他の役割は `403` を受け取ります(#3463)。`AUTH_ENABLED=false` の場合、リクエストは合成アクター(`id` `anonymous`、`role` `super_admin`)として実行されます。このアクターは環境のプリンシパルではないため、`reset=true` は `403` を返します。`reset` なしの読み取りは影響を受けません。

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

Prometheus エクスポジション形式でメトリクスを返します。認証が有効な場合(デフォルト)、認証されたユーザーのみがこのエンドポイントにアクセスできます。これらのメトリクスは、Prometheus ベースの監視や Grafana ダッシュボードとの統合に使用できます。

この出力のリクエストおよび通知カウンタは、スクレイプを処理したデータプレーンインスタンスに属します。`DELETE /admin/metrics` はそれらに到達しません(#3241)。コレクションゲージ(`geonicdb_entities_total` およびサブスクリプションと登録の合計)は、ライブデータベースカウントです。インスタンス間で共有される時間枠内のカウントについては、`GET /admin/metrics/api-calls` を使用してください(#3207)。

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

##### Web Push VAPID 公開鍵 (#3014)

```http
GET /.well-known/webpush-vapid-key
```

`PushManager.subscribe({ applicationServerKey })` 用に `{ "publicKey": "<VAPID public key>" }` を返します。
`WEBPUSH_VAPID_*` が未設定の場合は `503` を返します。[SUBSCRIPTIONS.md](../features/ngsi-subscriptions.md#web-push-3014) および ENV.md を参照してください。

##### MCP (Model Context Protocol)

```http
POST /mcp
Content-Type: application/json
Accept: application/json, text/event-stream
```

MCP ストリーム可能 HTTP エンドポイント。MCP 互換 AI クライアント(Claude Desktop など)から直接接続できます。ステートレスモード(JSON レスポンス)で動作し、22 個のツール(粗粒度 5 個 + 細粒度 17 個、#3921)が MCP tools/call 経由で利用可能です。非管理者は tools/list で管理者ツールを見ることができません。`admin:users` または `admin:policies` を持つ `oauth_client` は tools/list で管理者ツールを見ることができますが、すべての admin/admin\_\* 呼び出しは拒否されます — 代わりに HTTP Admin API(`/admin/users`、`/admin/policies`)を使用してください。

認証が有効な場合(デフォルト)、Bearer トークン(JWT)が必要です。テナントアクセス制御も適用されます。

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

注意: 認証が有効な場合(デフォルト)、`headers` は必須です。

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

エージェント間通信用の A2A JSON-RPC 2.0 エンドポイント。認証が有効な場合(デフォルト)、認証が必要です。メソッドディスパッチは JSON-RPC メソッド名に従います(`A2A-Version` ヘッダーはハンドラーを選択しません)。

v1.0 メソッド名(proto-JSON; `A2A-Version` はオプションでハンドラーを選択しません):

* `SendMessage` — メッセージを送信し、同期レスポンスを受信
  
* `GetTask` — タスクの現在の状態を取得
  
* `ListTasks` — タスクをリスト(`{tasks, nextPageToken, pageSize, totalSize}`)
  
* `CancelTask` — タスクのキャンセルをリクエスト

Task は作成した呼び出し主体(テナント + ユーザー/API キー)にのみ可視。他主体の `id` は `GetTask` / `CancelTask` / `SendMessage(message.taskId)` のいずれも `-32001 Task not found`。`tenant_admin` も他ユーザーの Task は見えない。`role` が `anonymous` の呼び出し、またはテナントや actor ID を解決できない呼び出しは Task を保存できず、`ListTasks` は空を返す。

5 つのスキルが利用可能: entities、batch、temporal、config、admin(MCP ツールと同じ)。

詳細については、[AI\_INTEGRATION.md](../ai-integration/overview.md) を参照してください。

#### テナント別メトリクス(Admin API)

```http
GET /admin/metrics
Authorization: Bearer <accessToken>
```

テナントとServicePath別のメトリクスを返します。

**スコープ (#2217)** — `super_admin` はすべてのテナントを参照できます。その他の認証済みロールは自分自身のテナントのみを参照でき、そのテナントはアクセストークンから解決されます。`Fiware-Service` / `NGSILD-Tenant` リクエストヘッダーは、どのテナントのメトリクスが返されるかを選択**しません**(`/admin/*` はテナント境界チェックの前にディスパッチされるため、これらのヘッダーはここでは検証されません)。テナントを解決できない呼び出し元(テナントが割り当てられていない、またはテナントが存在しなくなった)は `{"services": {}}` を受け取ります — フェイルクローズ; すべてのテナントを返すフォールバックは**行いません**。

**リセット (#2236, #3241, #3463)** — `DELETE /admin/metrics` は空のボディで `204` を返します。`GET /admin/metrics?reset=true` はメトリクスを返した後、**呼び出しを処理したプロセスのみ**のインメモリカウンターをクリアします。これらのカウンターはプロセスグローバルであり、**テナント次元を持たない**ため、そのプロセス内でリセットはすべてのテナントの数値を一度に消去し、テナント単位でスライスすることはできません。したがって、両方とも環境スーパー管理者(id `super-admin`)または `platform_admin`(#3495)に制限されています; デプロイメントデータベースに格納された `super_admin`、およびその他のロール(`api_key` と `oauth_client` を含む)は `403` を受け取ります。`AUTH_ENABLED=false` の場合、`/admin/*` はこのガードの前に `404` を返します。合成アクター(`id` `anonymous`、`role` `super_admin`)は環境プリンシパルではないため、`GET /statistics?reset=true` はそのモードで `403` を返します。`reset` なしの読み取りは影響を受けず、上記で説明したテナント単位のスコープを維持します。

カウンターはモジュールメモリ(`requestCounters`、タイミング、通知キュー)です。リセットはエンティティ、サブスクリプション、または登録を削除しないため、`GET /admin/metrics` からの `entityCount`、`subscriptionCount`、および `registrationCount` はそのまま維持されます — これらはライブコレクションカウントです。

Lambda 上(#1507)では、API Gateway は `/admin/*` をコントロールプレーン関数に、`/statistics` と `/metrics` をデータプレーン関数に送信します。`/admin/metrics` を通じたリセットは、`GET /statistics` と `GET /metrics` が読み取るカウンターに**到達しません**。`GET /statistics?reset=true` は**そのリクエストを処理したデータプレーンインスタンスのみ**をクリアします。いずれかの関数の他のウォームコンテナは、コールドスタートするか、自らリセットを処理するまでそのまま維持されます。`204` は、受信プロセスがリセットを適用したことを意味します。

時間ウィンドウにわたってインスタンス間でカウントを集計する必要がある場合は、これらのインメモリカウンターの代わりに `GET /admin/metrics/api-calls`(#3207)を使用してください。まだメモリ内にあるポイントは、フラッシュ前にそのコンテナが回収されると失われます(以下の永続化を参照)。

```http
GET /admin/metrics/api-calls?tenant=<name>&from=YYYY-MM-DD&to=YYYY-MM-DD
Authorization: Bearer <accessToken>
```

時間別 API 呼び出し履歴(呼び出し回数、エラー回数、平均応答時間)を返します。`errorCount` は 4xx と 5xx のみをカウントします(`statusCode >= 400`)。304 Not Modified を含む 3xx は `byStatus` に保持され、エラーではありません(#3224)。保存されたカウントは増分であり、この定義が変更されても再計算されません。`tenant` は `super_admin` に対してのみ有効です; その他のロールは自分自身のテナントにスコープされます。

**永続化 (#3207):** カウントは Lambda コンテナごとにインメモリで集計され、各 API 呼び出しの終了時にしきい値フラッシュによって共有ストア(`USAGE_STATS_TABLE_NAME` / Mongo `apiCallMetrics`)に書き込まれます(`@config/defaults` の `FLUSH_MIN_BUCKETS` / `FLUSH_MAX_AGE_MS`)。ここでの `GET` はクエリ前に**コントロールプレーン**プロセスのインメモリバケットもフラッシュします。`#1507` 以降、データプレーンとコントロールプレーンは別々の Lambda であるため、管理者 `GET` だけではデータプレーンメモリをフラッシュできません — 呼び出し終了時のフラッシュが必要です。フラッシュが完了する前にコンテナが回収された場合、残留損失が残ります(ベストエフォートメトリクスであり、完全な監査証跡ではありません)。スタンドアロン E2E は 1 つのプロセスを共有するため、Lambda 間のギャップを検出できません。

| Situation                                                                                       | Result                                                          |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `super_admin` (with or without `tenant`)                                                        | `200` — the named tenant, or `default` when omitted             |
| Other role, `tenant` omitted or naming its own tenant                                           | `200` — that caller's own tenant                                |
| Other role, `tenant` naming a different tenant                                                  | **`403`**                                                       |
| Other role whose tenant cannot be resolved (no tenant assigned, or the tenant no longer exists) | **`403`** — fail-closed; it does **not** fall back to `default` |
| `tenant` longer than 64 characters, or containing anything outside `[a-z0-9_]`                  | `400`                                                           |

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

属性値によるフィルタリングは、`q` パラメータを使用して可能です。

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

OR 条件はパイプ (`|`) で結合します (`;` は `|` よりも優先順位が高い):

```text
q=temperature==23|temperature==35
q=temperature>25;humidity<40|status==active
```

### 範囲クエリ

`==` 演算子と `..` を組み合わせて範囲フィルタリング(境界を含む)を行います:

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

| Parameter  | Description                                                                                                                                                                                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `georel`   | Spatial relationship (coveredBy, within, intersects, disjoint, equals)                                                                                                                                                                                                                                                    |
| `geometry` | Geometry type. NGSIv2: `point`, `multipoint`, `linestring`, `multilinestring`, `polygon`, `multipolygon`, `line`, `box` (case-insensitive). NGSI-LD: the six GeoJSON names `Point`, `MultiPoint`, `LineString`, `MultiLineString`, `Polygon`, `MultiPolygon` (exact case). The `Multi*` variants are accepted since #1696 |
| `coords`   | Coordinates (NGSIv2: latitude,longitude format; NGSI-LD: longitude,latitude format; multiple points separated by semicolons)                                                                                                                                                                                              |

> **注意**: `georel`、`geometry`、および `coords` (または NGSI-LD では `coordinates`) は、すべて一緒に指定する必要があります。これらの一部のみを指定すると、`400 Bad Request` が返されます (ETSI GS CIM 009 V1.9.1 clause 4.10)。

### 座標フォーマット

NGSIv2 では、座標は **緯度,経度** の順序で指定されます (NGSIv2 仕様に準拠)。NGSI-LD では、座標は **経度,緯度** の順序です (GeoJSON 標準に準拠)。

> **重要**: NGSIv2 における緯度,経度の順序は、GeoJSON 標準 (経度,緯度) からの逸脱です。これは NGSI-LD で修正され、GeoJSON と同じ経度,緯度の順序を使用します。API を使用する際は、使用している API バージョンに対応した正しい順序で座標を指定してください。

```text
# NGSIv2 (latitude,longitude)
coords=35.6812,139.7671              # Single point
coords=34,138;34,141;37,141;37,138;34,138  # Polygon (semicolon-separated)

# NGSI-LD (longitude,latitude)
coordinates=[139.7671,35.6812]       # Single point
```

#### ポリゴンリングの閉鎖 (#1644)

`Polygon` のリング — 保存された GeoProperty / `geo:json` 属性値内であっても、ジオクエリ内であっても —
は閉じている必要があります:最初と最後の位置は、**すべての要素が等しくなければなりません**。3 要素の
位置 (`[経度, 緯度, 高度]`、RFC 7946 §3.1.6) の場合、これには高度も含まれます。この
チェックは NGSI-LD と NGSIv2 のパス間で共有されているため、両方の API が同じルールを適用します。

> **注意 (軽微な破壊的変更、#1644)**: NGSIv2 は以前、リングの閉鎖を検証する際に経度/緯度のみを比較し、最初と最後の位置が高度で異なるリングを黙認していました。そのようなリングは現在、`400 Bad Request` ("must be closed") で拒否され、NGSI-LD の動作と一致します。2 要素 (2D) 座標を送信するクライアントは影響を受けません。

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

### 分離検索 (disjoint)

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

NGSI-LD では、パラメータは `==` を使用して指定されます:

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

> **構文が異なる理由**: NGSIv2 はパラメータ値を指定するために `:` を使用しますが、NGSI-LD は ETSI 仕様に従って `==` を使用します。API を呼び出す際は、使用している API バージョンに対応する構文を使用してください。

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

`orderDirection=desc` を併用して距離の降順(最も遠いものから)でソートします:

```http
GET /v2/entities?georel=near;maxDistance:5000&geometry=point&coords=35.6812,139.7671&orderByDistance=true&orderDirection=desc
```

#### 制限事項


* **Point ジオメトリのみ**: `geometry=point` (NGSIv2) または `geometry=Point` (NGSI-LD) のみがサポートされています

### エラーハンドリング

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

日本のデジタル庁 / IPA が定める 3D 空間識別標準(ZFXY 形式)に基づく空間検索をサポートします。

### ZFXY 形式

| Element | Description                           | Range      |
| ------- | ------------------------------------- | ---------- |
| Z       | Zoom level                            | 0-28       |
| F       | Vertical direction (altitude level)   | Integer    |
| X       | East-west direction (longitude tile)  | 0 to 2^z-1 |
| Y       | North-south direction (latitude tile) | 0 to 2^z-1 |

形式:`{z}/{f}/{x}/{y}` (例:`20/0/929593/410773`)

### NGSIv2 での使用方法

```http
GET /v2/entities?spatialId=20/0/929593/410773
```

### NGSI-LD での使用方法

```http
GET /ngsi-ld/v1/entities?spatialId=20/0/929593/410773
```

### 階層拡張(spatialIdDepth)

`spatialIdDepth` パラメータを指定すると、指定された空間 ID を中心に周囲のタイルへ検索を拡張します。

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

`POST /ngsi-ld/v1/entityOperations/query` (バッチクエリ)は同じ `format=geojson` / `Accept: application/geo+json` ネゴシエーションをサポートし、`GET /ngsi-ld/v1/entities` と同じ形式の FeatureCollection を返します(#1783 — ETSI GS CIM 009 clause 6.3.4 では GeoJSON 対応操作として "Query Entity"、clause 5.7.2 がリストされています)。`GET /ngsi-ld/v1/entities/{entityId}` (単一取得)は FeatureCollection ではなく単一の **Feature** を返します — [API\_NGSILD.md](./ngsild.md#retrieve-single-entity) を参照してください。

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

### 注記


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

### 座標の入力/出力

#### クエリ時(入力)

ジオクエリの座標は指定された CRS で解釈されます:

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

| Conversion                    | Accuracy                                                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| WGS84 ↔ JGD2011               | Identity (no datum grid; both geographic lon/lat)                                                           |
| WGS84 → Web Mercator (output) | Closed-form spherical Mercator; finite for \|lat\| < 90; poles (\|lat\| ≥ 90) → 400 |
| Web Mercator → WGS84 (input)  | Closed-form inverse; easting/northing outside ±R·π (≈ ±20037508.34 m) → 400                                 |

### サポートされているジオメトリタイプ

CRS 変換は、GeoProperty / `geo:json` ロケーション値で使用されるすべての GeoJSON ジオメトリタイプに適用されます:`Point`、`LineString`、`Polygon`、`MultiPoint`、`MultiLineString`、および `MultiPolygon` (#1641)。すべての位置は要素ごとに再投影されるため、高度のパススルー (#1595) はマルチジオメトリのバリアントにも均一に適用されます。`GeometryCollection` は変換不可能であり、WGS84 以外の `crs` が指定された場合は `400 Bad Request` を返します。

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

| Error                             | HTTP Code | Description                                                              |
| --------------------------------- | --------- | ------------------------------------------------------------------------ |
| Unsupported CRS                   | 400       | Specified CRS code is not supported                                      |
| Invalid CRS format                | 400       | Invalid CRS format specified                                             |
| Coordinates out of range (input)  | 400       | EPSG:3857 easting/northing outside ±R·π (≈ ±20037508.34 m)               |
| Coordinates out of range (output) | 400       | Geographic poles (\|lat\| ≥ 90) when projecting to EPSG:3857 |

### 制限事項


* **方向の非対称性 (EPSG:3857):** 出力は |lat| < 90 を受け入れます (y は ±R·π を超える場合があります)。入力は ±R·π の範囲外の値を拒否します。したがって、`crs=EPSG:3857` GET によって返された座標は、クランプせずに同じ `crs` で書き戻すと拒否される場合があります。
  
* 地理的極点 (|lat| ≥ 90) は Web Mercator に投影できません (400)。WGS84 (`crs` 省略 / EPSG:4326) で読み取るか、保存された座標を修正することを推奨します。`crs=EPSG:3857` の場合、一致したエンティティのいずれかが緯度 ±90 を持っていると、リストクエリは応答全体に対して 400 を返します。


* すべての座標は内部的に WGS84 で保存されます
  
* 座標変換は、サポートされている 3 つの CRS (EPSG:4326 / 6668 / 3857) に対して閉形式の公式を使用します。EPSG:4326 ↔ EPSG:6668 は恒等変換として扱われます

### 参考文献


* [OGC API Features CRS Extension](https://docs.ogc.org/is/18-058r1/18-058r1.html)
  
* [EPSG Geodetic Parameter Registry](https://epsg.io/)
  
* [ETSI NGSI-LD CRS Specification](https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/01.08.01_60/gs_CIM009v010801p.pdf)

***

## Data Catalog API

エンティティタイプ情報を DCAT-AP 形式で出力し、CKAN ハーベスト互換のエンドポイントを提供します。

> **認可 (#2465 / #2472)。** Catalog は `GET /v2/entities` と同じ行レベルの読み取りフィルタを適用します。`/catalog/**` のみを許可する認証情報 (対応する `GET /v2/entities` Permit がない場合) は **403** を受け取ります — 意図的なフェイルクローズです。オープンデータポータルのレシピ: [AUTH.md — Catalog read credentials](../reference/auth.md#catalog-read-credentials-2465--2468--2472)。

### DCAT-AP カタログ

```http
GET /catalog
```

カタログ全体を DCAT-AP 形式の JSON-LD として出力します。

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

**レスポンス例**

サンプルは、データセットのプロトコルの keyValues(簡略化)表現で返されます:`id`、`type`、および属性値のみです。内部フィールド(owner、service path、システムメタデータ、保存された `@context` 参照)およびシステム属性(`dateCreated` / `createdAt` など)は含まれません。

```json
[
  { "id": "Room1", "type": "Room", "temperature": 23, "pressure": 1013 },
  { "id": "Room2", "type": "Room", "temperature": 25, "pressure": 1015 }
]
```

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

リソース情報を含むパッケージのページネーションリストを取得します。

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

設定は MongoDB に保存され、デプロイ後に API を介して動的に変更できます。

> **XACML 除外 (#2469)。** CADDE v4 パス (`/cadde/api/v4/catalog`、`/cadde/api/v4/entities`) は GeonicDB XACML ポリシーを評価しません — 行レベルの `Deny(entityType)` ルールを含みます。CADDE の有効化は、デプロイ全体のすべてのテナントに対するデータ交換ゲートです。存在しないテナントまたは無効化されたテナントは 403 `Access denied: no applicable policy` を返します (#3576)。`authEnabled: true` の場合、すべての `/cadde/**` リクエストには Bearer トークンが必要であり、`x-cadde-*` ヘッダーの有無は問いません。SECURITY.md — CADDE and XACML を参照してください。

### リクエストヘッダー

CADDE コネクタからのリクエストには、以下のヘッダーが含まれます:

| Header                      | Required | Description                               |
| --------------------------- | -------- | ----------------------------------------- |
| `x-cadde-resource-url`      | -        | URL of the resource being accessed        |
| `x-cadde-resource-api-type` | -        | API type (e.g., `api/ngsi`)               |
| `x-cadde-provider`          | -        | Data provider ID                          |
| `x-cadde-options`           | -        | Additional options (tenant headers, etc.) |

### x-cadde-options フォーマット

テナント情報およびその他の詳細は、`x-cadde-options` ヘッダーで指定できます:

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

CADDE 設定ドキュメントで `authEnabled: true` の場合、CADDE リクエストには Bearer 認証が必要です:

```http
Authorization: Bearer <token>
```

トークンが存在しない場合、`401 Unauthorized` エラーが返されます。

#### JWT 検証(オプション)

`PUT /admin/cadde` を通じて `jwksUrl` を設定すると、Bearer トークンの JWT 署名検証が有効になります。設定は MongoDB (`settings`、`_id: 'cadde'`) に保存されます — `CADDE_JWKS_URL` / `CADDE_JWT_*` 環境変数経由では**ありません**。

| Feature                     | Description                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| **Signature verification**  | Supports RS256 or ES256 algorithms. Automatically fetches public keys from the configured `jwksUrl` |
| **Expiration verification** | Validates the `exp` (expiration) claim and rejects expired tokens                                   |
| **Issued-at verification**  | Validates the `iat` (issued-at) claim and rejects tokens issued in the future                       |
| **Issuer verification**     | Validates the `iss` claim only when `jwtIssuer` is set in the CADDE settings document               |
| **Audience verification**   | Validates the `aud` claim only when `jwtAudience` is set in the CADDE settings document             |

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

**注意:** `jwksUrl` が設定されていない場合、トークンの存在のみがチェックされます(後方互換性のため)。

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

#### カタログ検索(`/cadde/api/v4/catalog`

)

`x-cadde-search` ヘッダーを使用して検索タイプを指定します:

| Search Type         | Header Value             | Description                                                                     |
| ------------------- | ------------------------ | ------------------------------------------------------------------------------- |
| Cross-domain search | `x-cadde-search: meta`   | Returns dataset list in CKAN format (keyword filtering via `q` parameter)       |
| Detailed search     | `x-cadde-search: detail` | Returns details of an individual dataset (specified via `id` or `fq` parameter) |

レスポンスに CADDE 固有のフィールドが追加されます:

* `caddec_dataset_id_for_detail`: 詳細検索用データセット ID
  
* `caddec_provider_id`: プロバイダー ID(`CADDE_DEFAULT_PROVIDER` が設定されている場合)
  
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

CADDE v4 エンドポイントは GeonicDB 認証(`requireAuth`)をバイパスします。認証は CADDE JWT 検証(`processCaddeRequestAsync`)によって処理されます。

### 参考資料


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

NGSI-LD API のエラーレスポンスは [RFC 7807](https://tools.ietf.org/html/rfc7807) ProblemDetails フォーマットで返されます。
Content-Type は `application/json` です (ETSI GS CIM 009 仕様に準拠するため、RFC 7807 の `application/problem+json` の代わりに標準 JSON MIME タイプが使用されます)。

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

このセクションでは、すべての GeonicDB API エンドポイントのページネーション、認証/認可、およびステータスコード情報をまとめています。

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

| Endpoint                         | Method | Description                                                                                                                                 | Success   | Error         |
| -------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------- |
| `/llms.txt`                      | GET    | API documentation (llms.txt)                                                                                                                | 200       | -             |
| `/version`                       | GET    | FIWARE Orion-compatible version information                                                                                                 | 200       | -             |
| `/health`                        | GET    | Basic health check                                                                                                                          | 200       | -             |
| `/health/live`                   | GET    | Liveness probe                                                                                                                              | 200       | -             |
| `/health/ready`                  | GET    | Readiness probe                                                                                                                             | 200       | 503           |
| `/.well-known/ngsi-ld`           | GET    | NGSI-LD API discovery                                                                                                                       | 200       | -             |
| `/api.json`                      | GET    | API reference (JSON)                                                                                                                        | 200       | -             |
| `/openapi.json`                  | GET    | OpenAPI 3.0 specification                                                                                                                   | 200       | -             |
| `/statistics`                    | GET    | FIWARE Orion-compatible statistics (authentication required; `reset=true` is environment super admin or `platform_admin` only, #3463/#3495) | 200       | 401, 403      |
| `/cache/statistics`              | GET    | Cache statistics (authentication required)                                                                                                  | 200       | 401           |
| `/metrics`                       | GET    | Prometheus metrics (authentication required)                                                                                                | 200       | 401           |
| `/tools.json`                    | GET    | AI tool definitions (Claude Tool Use / OpenAI Function Calling)                                                                             | 200       | -             |
| `/.well-known/ai-plugin.json`    | GET    | AI plugin manifest                                                                                                                          | 200       | -             |
| `/.well-known/webpush-vapid-key` | GET    | Web Push VAPID public key (#3014)                                                                                                           | 200 / 503 | -             |
| `/mcp`                           | POST   | MCP (Model Context Protocol) Streamable HTTP endpoint                                                                                       | 200       | 400, 405, 500 |
| `/.well-known/agent-card.json`   | GET    | A2A Agent Card                                                                                                                              | 200       | -             |

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

SDK は完全なパブリック API を提供します: `login()`、`setCredentials()`、エンティティ CRUD、`request()`、`connect()`、`reconnect()`、`disconnect()`、`isConnected()`、`subscribe()`、`on()`/`off()` イベントリスナー (`tokenRefresh` イベントを含む)。詳細は SDK ドキュメントを参照してください。

### ユーザーエンドポイント

認証されたユーザーが自分自身の情報を管理するためのエンドポイント。

| Endpoint       | Method | Description          | Success | Error    | Minimum Role |
| -------------- | ------ | -------------------- | ------- | -------- | ------------ |
| `/me`          | GET    | Retrieve own profile | 200     | 401      | user         |
| `/me/password` | POST   | Change password      | 204     | 400, 401 | user         |

### NGSIv2 / NGSI-LD エンドポイント

詳細なエンドポイント仕様については、以下を参照してください:

* [NGSIv2 API リファレンス](./ngsiv2.md)
  
* [NGSI-LD API リファレンス](./ngsild.md)

### Admin API

テナントとユーザーを管理するための API です。エンドポイントには `super_admin` または `tenant_admin` ロールが必要です(`tenant_admin` は自テナントスコープのみ)。

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

#### デプロイメントルーティング管理(super\_admin のみ)

ホスト名を MongoDB クラスター/データベースにマッピングし、大規模テナントを専用クラスターに分離できるようにします(#1775 / Epic #1485)。運用手順については DEDICATED\_CLUSTER\_ONBOARDING.md を参照してください。

すべてのメソッドは、環境のスーパー管理者(`SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` から生成されたプリンシパル、id `super-admin`)、または `POST /auth/platform-token` からの `platform_admin` トークン(#3495)に限定されます。デプロイメントデータベースに保存された `super_admin` ユーザーは 403 を受け取ります(#3458)。

| Endpoint                        | Method | Description                                                                                | Success | Error                   | Pagination     |
| ------------------------------- | ------ | ------------------------------------------------------------------------------------------ | ------- | ----------------------- | -------------- |
| `/admin/deployments`            | GET    | List deployment routing rows (filter: `enabled=true\|false`; disabled rows included) | 200     | 400, 401, 403           | Yes (max: 100) |
| `/admin/deployments`            | POST   | Create a deployment routing row                                                            | 201     | 400, 401, 403, 409      | -              |
| `/admin/deployments/{hostname}` | GET    | Get a deployment routing row (bypasses the routing cache)                                  | 200     | 400, 401, 403, 404      | -              |
| `/admin/deployments/{hostname}` | PATCH  | Update a deployment routing row                                                            | 200     | 400, 401, 403, 404, 409 | -              |
| `/admin/deployments/{hostname}` | DELETE | Delete a deployment routing row                                                            | 204     | 400, 401, 403, 404, 409 | -              |

**リクエストボディ(POST)**

| Field                 | Required                             | Description                                                                                                                                                                                                                                                                                                                                   |
| --------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hostname`            | Yes                                  | DNS name. Normalised to lowercase to match how the `Host` header is resolved                                                                                                                                                                                                                                                                  |
| `databaseName`        | Yes                                  | MongoDB database name (alphanumerics, `-`, `_`; max 63)                                                                                                                                                                                                                                                                                       |
| `defaultQuotaPlan`    | Yes                                  | `FREE` \| `STANDARD` \| `PREMIUM` \| `ENTERPRISE` \| `CUSTOM`                                                                                                                                                                                                                                                         |
| `mongodbUriSecretArn` | Either this or `mongodbUri`          | Secrets Manager reference. **Use the secret *name*** (e.g. `geonicdb/deployments/<name>`) in multi-region production — a full ARN embeds a region the failover Lambda cannot resolve. Full ARNs are accepted for single-region setups                                                                                                         |
| `mongodbUri`          | Either this or `mongodbUriSecretArn` | Plaintext connection string. Rejected with 400 when `MONGODB_ENFORCE_SECRETS=true`                                                                                                                                                                                                                                                            |
| `rateLimitTableName`  | No                                   | Per-deployment rate-limit table override                                                                                                                                                                                                                                                                                                      |
| `enabled`             | No                                   | Defaults to `true`. Only enabled rows are routed                                                                                                                                                                                                                                                                                              |
| `writeMode`           | No                                   | `normal` (default) \| `read-only`. While `read-only`, every write to this deployment's database fails, from the API and from background workers alike: API writes return `503` with `Retry-After`, workers fail and retry later. Reads keep working. Use it for the final copy when moving or restoring a deployment's database (#3285) |
| `metadata`            | No                                   | Free-form object (max 4 KB serialized, max 5 levels deep)                                                                                                                                                                                                                                                                                     |

`PATCH` は `hostname` を除く同じフィールドを受け付けます(不変 — 新しい行を作成して古い行を削除することで名前変更します)。`mongodbUri` / `mongodbUriSecretArn` / `rateLimitTableName` / `metadata` をクリアするには `null` を送信してください。

**レスポンス**

平文の `mongodbUri` は**決して返されません**。レスポンスには `mongodbUriConfigured`(ブール値)と `mongodbUriSecretArn` のみが公開されます。

```json
{
  "hostname": "ohashi.geonicdb.example.com",
  "databaseName": "ohashi",
  "defaultQuotaPlan": "ENTERPRISE",
  "enabled": true,
  "writeMode": "normal",
  "mongodbUriSecretArn": "geonicdb/deployments/ohashi",
  "mongodbUriConfigured": false,
  "rateLimitTableName": null,
  "metadata": { "owner": "ops" },
  "createdAt": 1753000000000,
  "updatedAt": 1753000000000
}
```

**使用不可能な行を防ぐための拒否**

| Status | Condition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | Reserved subdomain — such a row is never routed even if it exists (#633)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 409    | Hostname listed in `DEFAULT_DEPLOYMENT_HOSTNAMES` — the env list wins and the row would be silently shadowed (#1291)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 400    | Plaintext `mongodbUri` while `MONGODB_ENFORCE_SECRETS=true` (#1086)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 400    | `databaseName` is a MongoDB system database (`admin`, `local`, `config`) or the platform default database (`MONGODB_DATABASE`), compared case-insensitively (#3432)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 400    | `POST`: no connection source at all (neither secret reference nor URI). `PATCH`: the update would remove the row's last connection source. A row that never had one inherits the platform cluster (`MONGODB_URI`, #1327; rows written by the geonicdb-deployments sync have this form while its `SHARED_CLUSTER_SECRET_ARN` is unset, as it is today) and can be updated normally (#3430). The sync overwrites `enabled`, `databaseName`, `defaultQuotaPlan`, `metadata` and `mongodbUriSecretArn` on its rows, so change those in its repository, not through this API                                                                                                                                                                                          |
| 409    | Hostname already registered (conditional write; concurrent creates cannot overwrite each other)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 409    | Another row already uses the same `databaseName` (case-insensitive), whatever its connection (#3432). The name must be unique across all rows: the second row would write into the first one's database, and with a separate control-plane cluster (`CONTROL_PLANE_MONGODB_URI`) the auth data (users, tenants, API keys) of every row lives in a database of that name, so two rows with the same name would share users even on different clusters. `PATCH` checks this only when it changes `databaseName`, so a write freeze, an `enabled` change or a cutover to another cluster is never blocked by it. If the listing hits `DEPLOYMENTS.ADMIN.MAX_SCAN_ITEMS` the check cannot run and the request gets `503`. Two concurrent requests are not serialized |
| 409    | Deleting or disabling the deployment serving the current request — it would make every API on that host, including this admin API, return 404. Perform the operation from another hostname                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 409    | Setting `writeMode: read-only` on the deployment serving the current request — writes on that host would stop, so undoing it could fail. Perform the operation from another hostname. Setting it back to `normal` is always allowed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 409    | `PATCH` optimistic-lock conflict — the row was modified or deleted between read and write. Re-read and retry. Updates are conditional on `updatedAt`, so a concurrent `PATCH` cannot silently overwrite another, and a `PATCH` racing a `DELETE` cannot resurrect the deleted row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

**リスト境界**: ストアは順序付き範囲クエリを持たないプレーンなキーバリューコレクションであるため、リスト操作はソートとページングの前にリポジトリレベルの上限(`DEPLOYMENTS.ADMIN.MAX_SCAN_ITEMS`)まで行を読み取ります。上限に達した場合、レスポンスには `X-Deployment-List-Truncated: true` が含まれ、サーバーは警告をログに記録します — リストが暗黙的に不完全になることはありません。

**キャッシュ収束**: ルーティングキャッシュはインスタンスごとです。書き込み後、他のウォームインスタンスやバックグラウンドワーカーは最大 30 秒間(`DEPLOYMENTS.CACHE_TTL_MS`; #3285 以前は 5 分でした)以前の設定を提供し続ける可能性があります。この境界は `writeMode` および変更された接続ターゲットにも適用されます。リフレッシュが失敗している間(例: DynamoDB スロットリング)、インスタンスは最大 5 分間(`DEPLOYMENTS.STALE_ON_ERROR_MS`)期限切れエントリを使用し続け、`Failed to refresh deployment config — serving the expired entry` をログに記録します。書き込みレスポンスにはこれを示す `notice` フィールドが含まれ、`DELETE` は `X-Deployment-Cache-Notice` ヘッダーでそれを返します。

#### ポリシー管理(XACML 3.0 認可、super\_admin / tenant\_admin)

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

ポリシー Target `resources` で利用可能な **リソース属性**:

| attributeId     | Description                                   | Source                                    |
| --------------- | --------------------------------------------- | ----------------------------------------- |
| `path`          | HTTP request path (e.g. `/v2/entities/Room1`) | Request                                   |
| `tenantService` | Tenant service name (`Fiware-Service` header) | Request                                   |
| `servicePath`   | Service path (`Fiware-ServicePath` header)    | Request                                   |
| `scope`         | NGSI-LD entity scope (comma-separated)        | Entity context                            |
| `entityId`      | Target entity ID (e.g. `Room1`)               | Entity context                            |
| `entityType`    | Target entity type (e.g. `Room`)              | Request (auto-extracted) / Entity context |
| `entityOwner`   | Entity creator's userId (`createdBy` field)   | Entity context                            |

> `entityType` は HTTP リクエストからパスレベルで自動的に抽出されます — `?type=` クエリパラメータまたはリクエストボディの `type` / `@type` フィールドから — エンティティレベルのチェックなしでエンティティタイプベースのアクセス制御を可能にします。`entityId`、`entityOwner`、`scope` はエンティティレベルの認可チェック(`requireEntityAuthz` 経由)でのみ利用可能です。`scope` は NGSI-LD エンティティのスコープ配列をカンマ区切り文字列として結合したものです — 柔軟なマッチングには `string-regexp` または `glob` を使用してください。

#### OAuth クライアント管理

| Endpoint                          | Method | Description         | Success | Error              | Pagination     |
| --------------------------------- | ------ | ------------------- | ------- | ------------------ | -------------- |
| `/admin/oauth-clients`            | GET    | List OAuth clients  | 200     | 400, 401, 403      | Yes (max: 100) |
| `/admin/oauth-clients`            | POST   | Create OAuth client | 201     | 400, 401, 403      | -              |
| `/admin/oauth-clients/{clientId}` | GET    | Get OAuth client    | 200     | 401, 403, 404      | -              |
| `/admin/oauth-clients/{clientId}` | PATCH  | Update OAuth client | 200     | 400, 401, 403, 404 | -              |
| `/admin/oauth-clients/{clientId}` | DELETE | Delete OAuth client | 204     | 401, 403, 404      | -              |

#### セルフサービス OAuth クライアント管理

ユーザーは自分自身の OAuth クライアントを管理できます。テナントごとのユーザーあたり最大 5 クライアント。オプションの `policyId` はクライアントを既存の XACML ポリシーにバインドします。

| Endpoint                                         | Method | Description                       | Success | Error              | Pagination     |
| ------------------------------------------------ | ------ | --------------------------------- | ------- | ------------------ | -------------- |
| `/me/oauth-clients`                              | GET    | List own OAuth clients            | 200     | 400, 401           | Yes (max: 100) |
| `/me/oauth-clients`                              | POST   | Create own OAuth client           | 201     | 400, 401, 403      | -              |
| `/me/oauth-clients/{clientId}`                   | PATCH  | Update own OAuth client (partial) | 200     | 400, 401, 403, 404 | -              |
| `/me/oauth-clients/{clientId}`                   | DELETE | Delete own OAuth client           | 204     | 400, 401, 403, 404 | -              |
| `/me/oauth-clients/{clientId}/regenerate-secret` | POST   | Regenerate own client secret      | 200     | 400, 401, 403, 404 | -              |

#### API キー管理

`X-Api-Key` ヘッダーによる認証用の API キーを管理します。新しいキーはプレーン UUID フォーマット(`randomUUID()`)を使用します; `gdb_` プレフィックスを持つ既存のキーは有効なままです。保存には SHA-256 ハッシュ化; 平文キーは作成時とリフレッシュ時にのみ返されます。リスト / 取得レスポンスは `"key": "******"` を返します。オプションの `policyId` フィールドはキーを既存の XACML ポリシーにバインドします(バインドされたポリシーは、そのポリシーレベルのターゲットとルールで評価されます)。`policyId` なしの場合、キーはテナントポリシー + ロールデフォルト(api\_key = All Deny)にフォールバックします。

| Endpoint                          | Method | Description                  | Success | Error              | Pagination     |
| --------------------------------- | ------ | ---------------------------- | ------- | ------------------ | -------------- |
| `/admin/api-keys`                 | POST   | Create API key               | 201     | 400, 401, 403      | -              |
| `/admin/api-keys`                 | GET    | List API keys                | 200     | 400, 401, 403      | Yes (max: 100) |
| `/admin/api-keys/{keyId}`         | GET    | Get API key                  | 200     | 401, 403, 404      | -              |
| `/admin/api-keys/{keyId}`         | PATCH  | Update API key               | 204     | 400, 401, 403, 404 | -              |
| `/admin/api-keys/{keyId}`         | DELETE | Delete API key               | 204     | 401, 403, 404      | -              |
| `/admin/api-keys/{keyId}/refresh` | POST   | Refresh (regenerate) API key | 200     | 401, 403, 404      | -              |

#### セルフサービス API キー管理

ユーザーは自分自身の API キーを管理できます。テナントごとのユーザーあたり最大 5 キー。

| Endpoint                       | Method | Description                      | Success | Error              | Pagination     |
| ------------------------------ | ------ | -------------------------------- | ------- | ------------------ | -------------- |
| `/me/api-keys`                 | POST   | Create own API key               | 201     | 400, 401, 403      | -              |
| `/me/api-keys`                 | GET    | List own API keys                | 200     | 400, 401, 403      | Yes (max: 100) |
| `/me/api-keys/{keyId}`         | PATCH  | Update own API key (partial)     | 200     | 400, 401, 403, 404 | -              |
| `/me/api-keys/{keyId}`         | DELETE | Delete own API key               | 204     | 400, 401, 403, 404 | -              |
| `/me/api-keys/{keyId}/refresh` | POST   | Refresh (regenerate) own API key | 200     | 401, 403, 404      | -              |

#### CADDE 設定管理

API 経由で CADDE(分野間データ交換基盤)設定を管理します。設定は MongoDB に保存され、環境変数は不要です。

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

**カスタムデータモデル**とは、テナント内のエンティティに対する**型ごとの検証ルールセット**です(必須属性、値の形式、許可される値)。これはエンティティ自体のデータモデルではありません — NGSI-LD / JSON-LD が既に形式と語彙を定義しており、この API はその上に検査ルールを追加します(TypeScript が JavaScript にチェックを追加する方法に似ています)。JWT 認証が必要です。XACML ポリシーベースの認可により、`tenant_admin` および `user` ロールがテナント内でカスタムデータモデルを管理できます。

**関連ドキュメント**: [SMART\_DATA\_MODELS.md](../features/smart-data-models.md)

| Endpoint                            | Method | Description                                                                                                                                   | Success | Error                   | Pagination             |
| ----------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------------- | ---------------------- |
| `/custom-data-models`               | GET    | List custom data models                                                                                                                       | 200     | 400, 401, 403           | Yes (max: 100)         |
| `/custom-data-models`               | POST   | Create custom data model (local body **or** `sourceUrl`)                                                                                      | 201     | 400, 401, 403, 409, 502 | -                      |
| `/custom-data-models/missing-types` | GET    | List entity types with no active data model (GeonicDB extension, #3477)                                                                       | 200     | 400, 401, 403           | No (capped; see below) |
| `/custom-data-models/{type}`        | GET    | Get custom data model                                                                                                                         | 200     | 401, 403, 404           | -                      |
| `/custom-data-models/{type}`        | PATCH  | Update custom data model (`?dryRun=true`: preview only, see below). Referenced models: source-owned fields → 409; `{"source": null}` detaches | 200     | 400, 401, 403, 404, 409 | -                      |
| `/custom-data-models/{type}`        | DELETE | Delete custom data model                                                                                                                      | 204     | 401, 403, 404           | -                      |

#### `sourceUrl` 登録 (GeonicDB 拡張、#3683 / #3456 A)

`POST /custom-data-models` は、ローカルモデル本体(`type`、`domain`、`description`、`propertyDetails`、…)**または** `sourceUrl`(https のみ。ローカル / E2E ではループバック http)のいずれかを受け入れます。これらは相互に排他的です。`isActive` / `uniqueConstraints` は `sourceUrl` と組み合わせることができます。サーバーは URL を取得し(SSRF 対策済み)、公開されたモデル本体を検証し、スナップショットと `source: { url, fetchedAt, sha256, etag?, version? }` を保存します。ホットパスのエンティティ検証は常に Mongo スナップショットを読み取ります — ネットワークは読み取りません。ネットワーク / アップストリーム HTTP 障害 → `502`(詳細には URL と理由が含まれます)。プライベート / ブロックされた URL(プライベート IP に解決される DNS を含む)→ `400`。無効なリモート本体 / サポートされていない Content-Type / 本体が大きすぎる → `400`。型の衝突 → `409`。認可は取得後に取得された `type` を再評価します(2 段階 PEP)。`entityType` に対して**許可リストのみ**のカスタムポリシーを持つテナント(型に条件付きで Permit、パス全体の Permit なし)は、`type` が省略された場合、ステージ 1 で `403` を受け取ります。リモートモデルと一致するオプションの `type` ヒントを送信すると、ステージ 1 が評価できます(`#3696`)。一致しないヒントは、ステージ 2 の認可後に `400` になります。回避策として単純なパス全体の Permit を追加**しないでください**(それにより許可されていない型がステージ 1 を通過してしまいます)。

**Content-Type:** 取得したレスポンスに `Content-Type` がない場合は**受け入れられます**(静的ホストは多くの場合それを省略します)。本体は依然として JSON オブジェクトとして解析される必要があります。サポートされていないメディアタイプ(例: `text/html`)→ `400`。これは、DESIGN の「`application/json`(+json)のみ」という文言に対する意図的な緩和です。

`source` を持つモデルは**参照モデル**です。`propertyDetails` / `contextUrl` / `typeIri` / `additionalProperties` / `domain` / `description` の `PATCH` は `409` を返します(`POST /custom-data-models/{type}/refresh` — #3684 — で変更するか、デタッチします)。`isActive` / `uniqueConstraints` はパッチ可能なままです。`PATCH {"source": null}` はローカルモデルにデタッチします。**同じ**リクエスト内で `source: null` とソース所有フィールドを組み合わせることも `409` です(最初にデタッチしてから編集します)— E2E `@issue-3683-detach-combo` で修正されました。**`typeIri` は作成時に固定されます**(ローカルモデルと同じ):リモートの `typeIri` 変更、または既に `typeIri` を持つモデルに `contextUrl` を導入すると、リフレッシュ時に `400` を返します — 削除して再作成してください。`typeIri` を**持たない**モデルは、リフレッシュを介して `contextUrl` を変更できます(`diff.contextUrl` に表示されます)。

`PATCH /custom-data-models/**` を Deny してモデルを凍結するテナントは、`POST .../refresh` も Deny する必要があります(または refresh をカバーする同じパス glob)— refresh は別の書き込みパスであり、PATCH のみの Deny では**カバーされません**。

#### 参照モデルをリフレッシュ(`POST /custom-data-models/{type}/refresh`

)

GeonicDB 拡張(#3684 / #3456 B)。`source.url` を再取得します(etag が保存されている場合は `If-None-Match` を使用した条件付き GET)。

| Case                      | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No `source` (local model) | `409`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 304 or sha256 unchanged   | `{ changed: false, dryRun, version, source }`. Non-`dryRun` updates `source.fetchedAt` (and etag if the 304 carries a new one; on `200`+hash match, adopts the response etag or clears it); **does not** bump `version` / `updatedAt`. `dryRun=true` writes nothing. No `diff` / `conformance`.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Body changed              | Validates remote JSON; remote `type` must equal path `{type}` else `400`. Returns `diff` (source-owned fields, including `typeIri` / `jsonSchema` presence flag) + the same `DataModelConformanceReport` as `PATCH ?dryRun=true`. `dryRun=true` does not apply; otherwise applies via the update path (`version++`, `@context`, uniqueConstraints, compensating restore) and replaces `source.sha256` / `etag` / `fetchedAt` / `version`. Optional source-owned keys **absent** on the remote body are left unchanged locally (PATCH-shaped merge; not a full replace). Remote `typeIri` change or `typeIri`↔`contextUrl` switch → `400` (delete and recreate). Plain `contextUrl` change on a model without `typeIri` is applied. |
| Upstream failure          | `502`; stored snapshot unchanged (entity validation never hits the network).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

レスポンスは常にリフレッシュラッパーです(モデル本体ではありません)。`source` はすべてのブランチに存在します。自動 / 定期的なリフレッシュはContext Brokerでは**行われません** — CLI cron / コンソール / ops を使用してください(`geonic models refresh --dry-run`)。

公開されたモデルドキュメントには、スナップショットメタデータとして `jsonSchema` が含まれる場合があります。来歴にはレスポンスフィールド `source` を使用してください。

#### 欠落している型 (GeonicDB 拡張、#3477)

`GET /ngsi-ld/v1/types` と `GET /v2/types` は存在する型をリストします。`GET /custom-data-models/missing-types` は異なる軸です:テナント内の**アクティブな**カスタムデータモデルを**持たない**ライブエンティティ型なので、`settings.requireDataModel` を安全にオンにできます。スキャンは NGSIv2 と NGSI-LD、およびすべてのServicePathをカバーします。時系列ストアにのみ存在する型、または登録にのみ存在する型は含まれません。ソフト削除された期限切れのエンティティは除外されます。この呼び出しは読み取り専用であり、エンティティを削除しません。

レスポンス内の `type` は保存された文字列です。リクエストの `@context` で圧縮されません。モデルを持たない型は `reason: "missing"` を持ちます。`isActive: false` のモデルは `reason: "inactive"` を持ちます(`requireDataModel` 拒否と同じ分類)。`canonicalType`(FQN)で一致したものを含む、アクティブなモデルは省略されます。

`scopeLimited` は、呼び出し側のエンティティリスト読み取りフィルターがスキャンされたエンティティを絞り込んだ場合に `true` になります。`truncated` は、サーバーが `maxTypes` で停止した場合に `true` になります。その場合、`types` 配列は不完全です。ページネーションはありません。

型が文字通り `missing-types` であるカスタムデータモデルは、`GET /custom-data-models/{type}` で取得できません。この静的パスは予約されているためです。

```bash
curl https://api.example.com/custom-data-models/missing-types \
  -H "Authorization: Bearer <accessToken>"
```

```json
{
  "requireDataModel": false,
  "types": [
    { "type": "LegacySensor", "reason": "missing" },
    { "type": "OldRoom", "reason": "inactive" }
  ],
  "scopeLimited": false,
  "truncated": false,
  "maxTypes": 1000
}
```

#### 更新ドライラン (GeonicDB 拡張、#2098)

データモデルを更新しても、既存のエンティティは自動的に再検証されません(以下の[エンティティ検証](#エンティティ検証)を参照)— `PATCH` で厳格化されたモデルは、既存のエンティティを次に書き込まれるまで静かに非準拠のままにすることができ、その時点で書き込みは `400` で失敗します。`PATCH /custom-data-models/{type}?dryRun=true` を使用すると、更新を適用する**前に**これをチェックできます。

`dryRun=true` の場合、更新は**適用されません** — データベース書き込み、`@context` 更新、一意制約インデックス同期はありません。代わりに、レスポンスは、その型の既存のエンティティのうち、更新されたモデルに対する検証に失敗するものの数を記述する `200` 適合性レポートです(`required` / `validation` / `additionalProperties` ルール)。スキャンには、候補の型がその型リストのどこかに現れるエンティティが含まれます(マルチタイプエンティティはカウントされます)。チェック自体は**候補モデルのみ**を使用します。エンティティの他の型からの制約の交差や `required` 属性の和集合は適用されません — その組み合わせは書き込みパスで強制され、このプレビューでは強制されません:

```bash
curl -X PATCH "https://api.example.com/custom-data-models/TemperatureSensor?dryRun=true" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{
    "propertyDetails": {
      "temperature": {
        "ngsiType": "Property",
        "valueType": "Number",
        "validation": {"maximum": 30}
      }
    }
  }'
```

```json
{
  "type": "TemperatureSensor",
  "dryRun": true,
  "conformance": {
    "scanned": 2,
    "violating": 1,
    "undetermined": 0,
    "truncated": false,
    "maxScan": 10000,
    "scopeLimited": false,
    "samples": [
      { "entityId": "Sensor001", "errors": ["temperature: Value (50) exceeds maximum (30)"] }
    ]
  }
}
```

| Field                        | Description                                                                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scanned`                    | Number of live entities of that type scanned (soft-deleted and expired entities are excluded)                                                            |
| `violating`                  | Number of scanned entities that would fail validation against the updated model                                                                          |
| `undetermined`               | Scanned entities whose conformance could not be determined (e.g. could not be decrypted) — never rounded into `violating` or "conforms"                  |
| `truncated`                  | `true` if the scan stopped early — either the scan limit (`maxScan`) or the internal time budget was reached; `scanned` is then a lower bound            |
| `maxScan`                    | The scan limit actually applied by the server. Read it from the response rather than hard-coding it — it comes from server configuration                 |
| `scopeLimited`               | `true` if the requester's row-level read authorization restricted which entities were scanned; `samples` then only cover entities the requester can read |
| `samples`                    | Up to 20 non-conformant entities, each with up to 5 violation reasons                                                                                    |
| `uniqueConstraintViolations` | Existing `uniqueConstraints` violations detected by the same pre-check used by a real update (present only when non-empty)                               |

スキャンはテナントとエンティティタイプのみでスコープされます(ServicePathやプロトコルではありません)。認可と所有権チェック(`assertOwnership`)は、実際の `PATCH` と同じです。

`dryRun=false` または省略した場合は通常の更新として動作します。その他の値(例:`?dryRun=yes`)は、更新を暗黙的に適用するのではなく `400 Bad Request` を返すため、タイプミスが誤った書き込みになることはありません。

ドライランは HTTP `PATCH` エンドポイントでのみ利用可能です — MCP の `custom_data_models` アクションと A2A には同等のオプションはありません。

スキャンは `Fiware-Service` / `NGSILD-Tenant` リクエストヘッダーからではなく、**認証されたアクター**から解決されたテナントにスコープされます(このエンドポイントは意図的に `checkTenantAccess` をスキップするため、ヘッダーは呼び出し元のテナントに対して検証されません)。

#### エンティティ検証

カスタムデータモデルが定義されている場合、エンティティの作成または更新時に自動的に検証が実行されます。検証は `isActive: true` のモデルにのみ適用されます。

**検証チェック:**

| Check                    | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Additional properties    | When `additionalProperties: false`, attributes not defined in `propertyDetails` are rejected (default: `true` — allows any attributes)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Required fields          | Whether attributes with `required: true` are present                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Type check               | Type validation based on `valueType` (`string`, `number`, `integer`, `boolean`, `array`, `object`, `geojson`, `uri`, `datetime`, `date`, `time`). `date` accepts `YYYY-MM-DD`, an RFC 3339 date-time, or a typed `Date` / `DateTime` value (schema.org Date or DateTime). `datetime` stays strict: a date without a time is rejected. `time` is an RFC 3339 full-time with a required offset, or a typed `Time` value. `ListProperty` checks that the value is an array and that each element matches `valueType`. `ListRelationship` checks that the value is an array and that each element is an NGSI-LD URI (`urn:ngsi-ld:...` or `http(s)://`) regardless of `valueType`; declaring a `valueType` other than `string` or `uri` is `400`. On array-shaped attributes (`valueType: array` — typically on `Property` — or `ngsiType` `ListProperty` / `ListRelationship`), `validation` may declare `items` / `minItems` / `maxItems` / `uniqueItems` only; top-level scalar rules (`enum`, `pattern`, `minLength`, `maxLength`, `minimum`, `maximum`) are `400` and the message points to `validation.items.<rule>`. Non-array attributes that declare array rules are also `400` |
| Attribute type (NGSI-LD) | The attribute `type` must equal `ngsiType`. A mismatch is `400` and the message names the attribute, the expected type, and the received type. A Property whose value is a Point, Polygon, or LineString is stored as GeoProperty before the check, and the declared type is gone, so that value is not a mismatch against `ngsiType` Property. A non-GeoJSON Property against `ngsiType` GeoProperty is still `400`. NGSIv2 does not compare types such as `Text` or `Number` to `ngsiType`. A model property with no `ngsiType` skips the comparison. `dryRun` counts NGSI-LD entities that would fail; entities with no `protocol` are treated as NGSI-LD                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| objectType (NGSI-LD)     | On `Relationship` / `ListRelationship`, a present `objectType` must be one of the types declared on the model (every element, when the value is an array). A mismatch is `400` and the message names the attribute, the received type, and the declared types. Omitting `objectType` is allowed and is not filled in. The referenced entity is not loaded. `objectType` on any other `ngsiType` is `400` at model registration. NGSIv2 does not compare it. `dryRun` counts NGSI-LD entities that would fail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| minLength / maxLength    | String length constraints (scalar attributes; for arrays use `items.minLength` / `items.maxLength`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| minimum / maximum        | Numeric range constraints (scalar attributes; for arrays use `items.minimum` / `items.maximum`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| pattern                  | Regular expression pattern match (scalar attributes; for arrays use `items.pattern`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| enum                     | List of permitted values (scalar attributes; for arrays use `items.enum`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| items                    | Per-element scalar rules for array-shaped attributes (`Property`+`array` / `ListProperty` / `ListRelationship`). Same shape as scalar rules; nested `items` is not allowed. Failures name the index (`attr[i]`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| minItems / maxItems      | Array length bounds (0..10000). `minItems` > `maxItems` is `400` at model registration                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| uniqueItems              | When `true`, duplicate elements are rejected (`JSON.stringify` equality, same as `enum`). Failures name the index of the first duplicate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

**複数のエンティティタイプ(NGSI-LD、#3454):** `type` はセットです(ETSI GS CIM 009 clause 4.16 / Table 5.2.4)。順序は関係ありません:`["Note","Task"]` と `["Task","Note"]` は同じチェックです。これらのタイプのうち、すべてのアクティブなモデルがまとめて適用されます:

| Rule                          | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Required                      | Union of every model's `required: true` attributes. A missing attribute is `400 BadRequestData`                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Same-name constraints         | Intersection. The value must satisfy every model that defines that attribute (`minLength`, `enum`, and the other checks above)                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `additionalProperties: false` | An attribute defined in none of the models is rejected only when **every** resolved model is strict. If any model omits the flag or sets it to `true`, the attribute is allowed                                                                                                                                                                                                                                                                                                                                                                                  |
| Disagreement                  | If the same attribute name has a different `ngsiType`, normalized `valueType`, `defaultValue` (both models define one, and the values differ), or `objectType` (both models declare one, and the match-key sets differ) the write is `400 BadRequestData`. The message names both models. A `defaultValue` or `objectType` defined on only one model is not a conflict; that model's rule is the one applied. `date` and `datetime` are different canonical types, so the same attribute declared as `date` on one model and `datetime` on another is a conflict |
| Adding a type                 | Append, merge-patch, replace, and batch upsert that grow the type list re-validate the whole entity against the resulting set                                                                                                                                                                                                                                                                                                                                                                                                                                    |

NGSIv2 エンティティは単一のタイプを持つため、そのタイプのモデルのみが適用されます。

検証の失敗は `400 Bad Request` を返します:

```json
{
  "error": "BadRequest",
  "description": "Entity validation failed: temperature: Value (150) exceeds maximum (100)"
}
```

**必須属性の削除(GeonicDB 拡張):** `required: true` を持つ属性を削除すると `400 Bad Request` を返します — NGSIv2 `DELETE /v2/entities/{id}/attrs/{attr}`、NGSI-LD `DELETE /ngsi-ld/v1/entities/{id}/attrs/{attr}`、および NGSI-LD マージパッチ削除(`urn:ngsi-ld:null`)経由で。属性全体を削除する削除のみが拒否されます:`datasetId` によって 1 つのマルチ属性インスタンスを削除し、別のインスタンスが残っている場合は、通常通り `204` を返します。`required: false` を持つ属性、および `isActive: false` のモデル上の属性は、依然として削除できます。

**`defaultValue` 自動入力(GeonicDB 拡張):** `propertyDetails.<name>.defaultValue` が設定されている場合、その属性を省略したエンティティは、完全な検証を実行する書き込み時に自動入力されます — 作成(`POST /v2/entities`、`POST /ngsi-ld/v1/entities`、`POST /ngsi-ld/v1/entityOperations/create`)、アップサート-アズ-クリエイト(`POST /v2/op/update` with `append`、`POST /ngsi-ld/v1/entityOperations/upsert|update`)、および完全な属性置換(`PUT /v2/entities/{id}/attrs`、バッチ `replace`)。部分的な更新(`PATCH .../attrs`、属性追加 `POST .../attrs`)は自動入力されません。明示的に指定された値は決して上書きされません。`required: true` と組み合わせると、属性は実質的にオプションになります。

**`indexed`(予約済み、未実装):** `propertyDetails.<name>.indexed` は受け入れられますが、現在は無視されます — MongoDB インデックスは作成されません。

**`objectType`(Relationship / ListRelationship):** `propertyDetails.<name>.objectType` はターゲットエンティティタイプを宣言します。値は短縮名、IRI、またはそれらの配列です(少なくとも 1 つ。重複、空白、および 50 項目以上は `400`)。他の `ngsiType` では拒否されます。`GET /custom-data-models` は保存されている宣言を返します。登録時の一致キーはレスポンスの一部ではありません。正確に 1 つの値の宣言は、`GET /vocab/{tenantId}/{attribute}` で `rdfs:range` としても記述されます([Term kind](#term-kind-type) を参照)。

#### 一意性制約(複合一意性)

カスタムデータモデルは `uniqueConstraints` を宣言できます — そのタイプのエンティティ間で値が一意でなければならない属性の組み合わせ(テナントとServicePathでスコープされます)。一意性は**データベースレベルでサーバー側**で強制されます(MongoDB 部分一意インデックス)。したがって、競合状態がなく、クライアントの規約に依存しません。

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


* `name`:モデル内で一意。英数字で開始し、その後は文字、数字、ハイフン、アンダースコア(最大 64 文字)
  
* `fields`:1–8 個の属性名。それぞれスカラー `valueType`(`string`、`number`、`integer`、`boolean`、`uri`、`datetime`、`date`、`time`)で `propertyDetails` に宣言されている必要があります。`array` / `object` / `geojson` は使用できません。`ListProperty` / `ListRelationship` も使用できません:これらの格納値は、`valueType` が要素タイプを指定している場合でも配列です
  
* モデルごとに最大 10 個の制約
  
* 制約は、宣言されたフィールドを**すべて**持つエンティティにのみ適用されます — いずれかのフィールドが欠けているエンティティは免除されます


* 制約はモデルの `isActive` フラグに関係なく適用され、モデルが削除されると削除されます
  
* `uniqueConstraints` を更新するとリスト全体が置き換えられます(すべての制約を削除するには `[]` を送信してください)
  
* 既存のエンティティがすでに制約に違反している場合、制約の追加は `400` で失敗します — 最初に重複を解決してください
  
* 同じモデルへの同時 PATCH:更新は `_id` / `createdBy` / `version` を固定します。別の PATCH が先にコミットされた場合、後の更新は `404` を返します(楽観的ロック)。更新が失敗した場合、unique-constraint インデックス補償は `version` が進んでいるときに現在のドキュメントに調整し、現在のドキュメントが読み取れないときは補償をスキップします(#3583)

**違反レスポンス:** 制約された組み合わせを重複させるエンティティの作成または更新は、違反した制約名とともに `409 AlreadyExists` を返します:

```json
{
  "error": "AlreadyExists",
  "description": "Entity already exists: violates unique constraint 'no-double-booking' on fields [room, date, startTime]"
}
```

NGSI-LD リクエストは同等の Problem Details レスポンスを受け取ります(`type: https://uri.etsi.org/ngsi-ld/errors/AlreadyExists`)。バッチ操作は `errors` 配列内でエンティティごとに違反を報告します。

> **注意**: 属性暗号化が有効になっているテナントの場合、属性値は暗号文として保存されるため、ユニーク制約は重複する平文値を検出できません。

#### 自動 JSON Schema 生成

POST および PATCH リクエストボディから、モデルレスポンスを再利用する場合を含め、トップレベルの `jsonSchema` フィールドを削除してください。これを含むリクエストは `400` を返します。`geonic models create`、`update`、または `apply` を使用する場合は、コマンドに渡す JSON からフィールドを削除してください。エンティティ検証ルールは `propertyDetails` に記述します。GeonicDB はローカルモデルを作成するとき、またはそのスキーマフィールドを更新するときに、これらの詳細から JSON Schema (Draft 2020-12) を生成します。レスポンスには、OpenAPI スキーマエクスポートなどのコンシューマー向けのメタデータとして `jsonSchema` が引き続き含まれます。`objectType` を宣言するプロパティは、そのスキーマに `"x-ngsi": { "objectType": <宣言された値> }` を含みます。

API の変更を本番環境にリリースする前に、API を使用する各 Console デプロイメントに対してモデル登録を検証してください。まだ `jsonSchema` を送信している Console を更新してください。エンティティタイプのみによる登録を許可するテナントの場合、Console が `sourceUrl` とともに一致する `type` ヒントを送信し、登録が成功することを確認してください。

#### Property @context (JSON-LD 語彙マッピング)

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
  
* `@context` を持たないプロパティ → **このContext Broker自身のベース URL** 上で自動生成された URL (`{brokerBaseUrl}/vocab/{tenantId}/{propertyName}`、#1984)が使用され、[`GET /vocab/{tenantId}/{term}`](#vocabulary-endpoint) 経由で参照可能です。`{brokerBaseUrl}` がどこから来るかについては、[Broker base URL resolution](#broker-base-url-resolution) を参照してください
  
* プロパティ URI はエンティティタイプに依存しません(同じプロパティ名はテナント内で同じ URI を共有します)
  
* `@context` は HTTP(S) URL でなければなりません(URN は受け付けられません)。文字 U+0000–U+0020 および DEL (U+007F) は `400` で拒否されます — これらは除去されません(#3407)。`typeIri` と同じクラスです。

#### Type IRI (`typeIri`

、#3359)

エンティティタイプはプロパティと同じ方法で IRI を取得します。自動生成された `@context` では、モデルがトップレベルの `typeIri` (HTTP(S) URL、最大 2048 文字)を設定しない限り、タイプ term は `{brokerBaseUrl}/vocab/{tenantId}/{type}` になります:

```json
{
  "type": "RoadRestriction",
  "typeIri": "https://datamodels.jp/ns/transportation/RoadRestriction",
  "propertyDetails": { "...": "..." }
}
```


* 生成された `@context` 内のタイプ term は `typeIri` になり、モデルの FQN ルックアップキー(`canonicalType`)がそれに従うため、その `@context` で書き込まれたエンティティはモデルと照合され、`?type=<typeIri>` でそれらを見つけることができます。
  
* `contextUrl` は文字 U+0000–U+0020 および DEL (U+007F) を `400` で拒否します — これらは除去されません(#3407)。スキームは制限されません。
  
* `typeIri` は `contextUrl` と組み合わせることはできません(`400`):独自の `@context` を使用する場合、タイプ IRI はそこで定義されます。
  
* **`typeIri` は作成時に固定されます。** 異なる `typeIri` を含む `PATCH`、`typeIri` なしで作成されたモデルへの `typeIri` の追加、または `typeIri` を持つモデルへの `contextUrl` の追加は `400` を返します(同じ値は受け入れられます。省略すると現在の値が保持され、`propertyDetails` が `@context` を再生成する場合も同様です)。古い FQN の下にすでに保存されているエンティティは、静かにモデルとの照合を停止します。これを変更するには、モデルを削除して再作成してください。

#### @context 解決(#1733)

NGSI-LD レスポンスをレンダリングするために使用される `@context` は、リクエストが提供したもの**のみ**です。何も提供されない場合、NGSI-LD コア `@context` のみが使用され、それが圧縮できない term は完全修飾 URI としてレンダリングされます(ETSI GS CIM 009 clause 5.5.5 / 5.5.7、<https://cim.etsi.org/NGSI-LD/official/clause-5.html>)。

したがって、カスタムデータモデルの `contextUrl` はレスポンスに自動的に追加**されません**。その語彙でレスポンスを圧縮するには、読み取り時に渡してください(JSON-LD `Link` ヘッダー)。

#### Vocabulary エンドポイント

自動生成された語彙 IRI はこのContext Brokerによって提供されるため、参照可能です。

| Endpoint                   | Method | Description                                                                                                                              | Auth          | Success | Error |
| -------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------- | ----- |
| `/vocab/{tenantId}/{term}` | GET    | JSON-LD (`application/ld+json`) self-description of an auto-generated vocabulary term (`@id`, `@type`, `rdfs:label`, `rdfs:isDefinedBy`) | None (public) | 200     | 400   |

報告される `@id` は、生成された `@context` に書き込まれる IRI とまったく同じように構築されます。

##### Term の種類(`@type`

)

エンティティタイプと属性は同じ名前空間(`{brokerBaseUrl}/vocab/{tenantId}/{term}`)を共有するため、レスポンスは `@type` を通じてそれらを区別します(#3191)。これがないと、RDF レベルの語彙アライメント(外部 Context Broker、CADDE とのフェデレーション)はクラスとプロパティを区別できません。

| Term                                                                           | `@type`        | Extra statements                                                                                              |
| ------------------------------------------------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------------------- |
| An entity type of a custom data model in that tenant                           | `rdfs:Class`   | —                                                                                                             |
| An attribute declared in exactly one model's `propertyDetails`                 | `rdf:Property` | `rdfs:domain` (the declaring model's type IRI); `rdfs:range` only when resolvable (see below)                 |
| An attribute declared in two or more models                                    | `rdf:Property` | none — multiple `rdfs:domain` values assert an *intersection* in RDFS, which is not what "either model" means |
| Anything else (unknown term, or an attribute that declares its own `@context`) | `rdfs:Class`   | —                                                                                                             |

`rdfs:range` は宣言から導出されます:`GeoProperty` → `https://purl.org/geojson/vocab#Geometry`、`LanguageProperty` → `rdf:langString`、`JsonProperty` → `rdf:JSON`、それ以外は `valueType` の XSD データ型(`string`/`number`/`integer`/`boolean`/`datetime`/`time`/`uri`/`geojson`)です。`array`、`object`、`date` には単一の XSD 対応型がない(`date` はカレンダー日付と日時の両方を受け付ける)ため、これらでは `rdfs:range` は省略されます。`VocabProperty` と `ListProperty` は `rdfs:range` を省略します(`VocabProperty` の値はボキャブラリ IRI であり、リストの `valueType` は要素型であるため、その XSD 型を出力すると誤りになります)。`Relationship` と `ListRelationship` は、`objectType` が正確に 1 つの宣言値を持つ場合にのみ `rdfs:range` を出力します(#3511)。IRI は、その属性のマッチキー内の最初の絶対 IRI(HTTP(S) などの `://` または `urn:` IRI)であり、それが存在しない場合は宣言型のボキャブラリ IRI(`{brokerBaseUrl}/vocab/{tenantId}/{objectType}` — 属性名ではなく宣言型)です。コンパクト IRI(`schema:Person`)はここでは絶対として扱われません。2 つ以上の宣言値は省略されます。なぜなら、複数の `rdfs:range` 値は RDFS で交差を主張するからです(複数の `rdfs:domain` 値が省略されるのと同じ理由)。`objectType` がない場合は、以前と同様に省略されます。ターゲットモデルの `typeIri` は検索されません。

このエンドポイントの 2 つの特性は意図的なものです:


* **未知の用語でも 200 を返し**、404 ではありません。404 を返すと、この非認証エンドポイントがテナント内に存在する型や属性を列挙するためのオラクルになってしまいます。
  
* **`description` は決して `rdfs:comment` にコピーされません。** 実際には、それらの説明は内部メモ(PII マーカー、ストレージレイアウト)を含んでおり、このエンドポイントは公開されています。

##### Broker ベース URL 解決

broker が出力するすべての自己参照 URL — ボキャブラリ IRI、カスタムデータモデルの `contextUrl`、`/llms.txt` と `/openapi.json` の例 — は、1 つのリゾルバ(`resolveSelfBaseUrl`)から次の順序で構築されます:

| Priority | Source                                                                   | Notes                                                                                                                                                                                                                                                                                                                               |
| -------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | **Registered hostname of the deployment this request routed to** (#3190) | Used whenever hostname-based routing (#1291) landed the request on a per-hostname database. That database is only reachable under its own hostname, so a URL naming any other host would not resolve                                                                                                                                |
| 2        | **`API_BASE_URL` environment variable**                                  | Injected at deploy time from the SAM template parameter **`ApiBaseUrl`** (`infrastructure/template.yaml` → the Lambda's `API_BASE_URL`), which the deploy workflow populates from SSM. Constant per deployment, so it applies to requests that land on the **default database** (`DEFAULT_DEPLOYMENT_HOSTNAMES` or an empty `Host`) |
| 3        | Request **`Host`** header                                                | Used only when `API_BASE_URL` is unset. Scheme comes from `X-Forwarded-Proto` (loopback hosts default to `http`, others to `https`); API Gateway default URLs (`*.execute-api.*`) also get the stage path appended                                                                                                                  |
| 4        | `http://{HOST_NAME}:{PORT}`                                              | Local development fallback when there is no request context                                                                                                                                                                                                                                                                         |

**優先順位 1 が存在する理由は、1 つのデプロイメントが多数のホスト名を提供し、それぞれが独自のデータベースを持つためです**(#1291)。単一のデプロイ全体の `ApiBaseUrl` は共有/デフォルトホストしか指定できないため、#3190 以前は、専用インスタンスで作成されたすべてのカスタムデータモデルは、共有ホストを指す `contextUrl` を格納していました — そこではそのコンテキストが存在せず、404 になります。したがって、リゾルバはデプロイメント行の**登録された**ホスト名(生の `Host` ヘッダーではない)を使用し、リクエストが broker にどのように到達したかに関係なく識別子を安定させます。`API_BASE_URL` がリクエストがアドバタイズすべきホストとは異なるホストを指定している場合、broker はホストペアごとに 1 回警告をログに記録します(`BaseUrl`、`#3190`)ので、その不一致は CloudWatch で確認できます。

**デフォルトデータベースからボキャブラリ IRI を発行するデプロイメントには `ApiBaseUrl` を設定してください。** ボキャブラリ IRI は永続的な識別子です。優先順位 3 では、値はリクエストが到着したホスト名に依存するため、複数のホスト名(apex + API Gateway デフォルト URL)でアクセス可能な broker は、同じ用語に対して異なる IRI を発行することになります。ワイルドカードのみのデプロイメントは、デフォルトでは `ApiBaseUrl` を未設定のままにします(`.github/workflows/deploy-env.yml`)。そのホスト名ごとのデプロイメントは優先順位 1 でカバーされます。

**既存のモデルは書き換えられません。** `contextUrl` は格納された値であるため、専用インスタンスで #3190 以前に作成されたモデルは、共有ホスト URL を保持します。`propertyDetails` のみを指定した `PATCH /custom-data-models/{type}` は、そのホストを移行**しません**:

| Stored state                           | What `propertyDetails` PATCH does to `contextUrl`                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Has `contextId` (auto-generated)       | Updates the `@context` **body in place** at the existing URL (#2094). The stored `contextUrl` string is left unchanged — a wrong shared-host URL stays wrong |
| Has `contextUrl` only (no `contextId`) | Leaves `contextUrl` alone (treated as manually set)                                                                                                          |
| Neither                                | First-time auto-generation with the current request's base URL                                                                                               |

同じ PATCH で新しい `contextUrl` を指定すると、管理されている `contextId` がクリアされ、自動生成されたコンテキストドキュメントが削除されるため、#3190 の安全な移行パスでも**ありません**。#3190 以前の専用インスタンスモデルの修復は、別の運用上の移行です(#3190 コード変更のスコープ外)。

ボキャブラリ IRI は**識別子**であるため、その場で書き換えられることはありません:モデルの `propertyDetails` が変更され、`@context` 本体がその場で更新されると、そのモデルがすでに使用している名前空間が引き継がれます。したがって、#1984 以前に作成されたモデルは、元の(`https://example.com/vocab/...`)IRI を保持し、それらの下に書き込まれたエンティティと自己整合性を保ちます。

**自動生成される `contextUrl` 自体も安定しています(#2094)。** `propertyDetails` の変更がコンテキスト本体の更新をトリガーすると、ドキュメントは既存の URL で書き換えられます — URL は変更されません。したがって、以前に配布された `contextUrl` 値は、モデル更新後も 404/504 ではなく解決し続けます。これは手動で指定された `contextUrl` 値には適用されません。GeonicDB はそのドキュメントを管理しないためです。

### Catalog API

| Endpoint                               | Method | Description         | Success | Error    | Pagination      |
| -------------------------------------- | ------ | ------------------- | ------- | -------- | --------------- |
| `/catalog`                             | GET    | Get DCAT-AP catalog | 200     | 401      | -               |
| `/catalog/datasets`                    | GET    | List datasets       | 200     | 400, 401 | Yes (max: 1000) |
| `/catalog/datasets/{datasetId}`        | GET    | Get dataset         | 200     | 401, 404 | -               |
| `/catalog/datasets/{datasetId}/sample` | GET    | Get sample data     | 200     | 401, 404 | -               |

### Event Streaming API

WebSocket を使用したリアルタイムエンティティ変更ストリーミング。`EVENT_STREAMING_ENABLED=true` で有効になります。

| Endpoint                                                                  | Protocol  | Description                                                                  |
| ------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------- |
| `wss://{api-id}.execute-api.{region}.amazonaws.com/{stage}?tenant={name}` | WebSocket | Stream entity change events (authentication sent via `Authorization` header) |

詳細については、[Event Streaming Documentation](../features/subscriptions.md) を参照してください。

### アクセス許可の概要

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
  
* [IPA Spatial ID Guidelines](https://www.ipa.go.jp/digital/architecture/guidelines/4dspatio-temporal-guideline.html)
  
* [Digital Agency Spatial ID](https://www.digital.go.jp/policies/mobility_and_infrastructure/spatial-id)
  
* [RFC 7946 GeoJSON](https://datatracker.ietf.org/doc/html/rfc7946)

NGSI-LD Snapshot は 2 つの作成形式をサポートしています:レガシー同期コピー/リストアと、非同期ローカル凍結クエリ(`snapshotQueries`、201 + Location)です。制限事項と `NGSILD-Snapshot` 読み取りについては、[Snapshot Operations](./ngsild.md#snapshot-operations) を参照してください。
