---
title: "NGSI-LD API"
description: "NGSI-LD API reference"
outline: deep
---
# NGSI-LD API

> このドキュメントは [API.md](./endpoints.md) から分離されました。主な API 仕様については [API.md](./endpoints.md) を参照してください。

***

NGSI-LD は JSON-LD ベースのコンテキスト情報管理 API です。

> **注意:** NGSI-LD API は ETSI GS CIM 009 仕様に従い `Fiware-ServicePath` ヘッダーを無視します。階層は `scope` エンティティプロパティと `scopeQ` クエリパラメータで管理されます。`servicePath` と `scope` は独立した概念であり、自動的に同期されることはありません ([INTEROPERABILITY.md](../core-concepts/ngsiv2-vs-ngsild.md#3-scope-scope-hierarchy) を参照)。これは認可 (#1323) にも適用されます: `servicePath` リソース属性を持つ XACML ポリシーは NGSI-LD リクエストで常に `/` を見るため、`Fiware-ServicePath` は NGSI-LD において**アクセス制御や分離境界として使用できません** — 代わりに `scope` / `entityType` ポリシー制約を使用してください ([AUTH.md](../reference/auth.md) を参照)。
>
> **Scope 文字セット (#1189):** 各 scope セグメントは `[A-Za-z0-9._-]` (POSIX Portable Filename Character Set; NGSI-LD 仕様の `[A-Za-z0-9_]` を拡張した GeonicDB 拡張) に一致する必要があり、セグメントの最初の文字は `-` であってはなりません。これに違反する文字列 — 例えば `;` `+` `#` 半角スペースを含む、または先頭の `/` が欠けているもの — は `scopeQ` の衝突やサイレントな問題を防ぐため `400 BadRequestData` で拒否されます。[INTEROPERABILITY.md → Scope Character Set](../core-concepts/ngsiv2-vs-ngsild.md#scope-character-set-geonicdb-独自拡張) を参照してください。
>
> **Entity フィールド文字セット (#1209 / #1211):** `id` は `A-Z a-z 0-9 . _ - :` を受け付けます (`:` は NGSI-LD URN 形式用、先頭の `-` は不可); `type` は **POSIX portable 短縮名** (`A-Z a-z 0-9 . _ -`、先頭の `-` は不可) **または絶対 IRI** (例: `https://uri.fiware.org/ns/data-models#WeatherObserved`, `urn:ngsi-ld:Type:Sensor`) を受け付けます; **属性名は短縮名 (`A-Z a-z 0-9 _`) または絶対 IRI を受け付けます** (#1649 — canonical 保存で保存キーが FQN になりうるため。NGSIv2 経路は従来どおり短縮名のみ)。3 つのフィールドすべてが 256 文字に制限されています。違反は `400 BadRequestData` を返します。**型名 (`type`) は active `@context` で term ⇄ URI 展開される (ETSI GS CIM 009 §5.5.7、#1613)** — `@context` がマップする term と対応する FQN は同一 type に解決し (書き込みで canonical 正規化・読み出しで応答 context に compact)、どの context もマップしない短縮名 `Temperature` は core `@vocab` の `.../default-context/Temperature` に展開され絶対 IRI `https://example.com/Temperature` とは別 type になる。型を伴うクエリ/作成で `@context` が解決不能なら `504 LdContextNotAvailable`。**属性名 (attribute name) も active `@context` で term ⇄ URI 展開され、canonical 形で保存される (#1649)** — リクエスト `@context` がマップする term は FQN で保存され、core 語彙 (`location` / `observedAt` 等) と未定義 term は短縮名のまま保存される (保存形不変)。応答はリクエスト `@context` で compact されるため、**別の `@context` の同義 term で書いた属性も引ける** (clause 5.5.7 の "if and only if" 完全形)。**破壊的変更**: `@context` がマップする属性を **`@context` 無し**で引くと `default-context/<名前>` = 別属性を指すため `404` になる (旧: 短縮名の verbatim 保存ゆえに引けた)。移行前データは `npm run migrate:attr-names -- --apply` で変換する。Detail: [INTEROPERABILITY.md → Entity Field Character Set](../core-concepts/ngsiv2-vs-ngsild.md#entity-field-character-set-id--type--attribute-name--geonicdb-独自拡張).
>
> **注意:** NGSIv2 と NGSI-LD のエンティティは完全に分離されています。NGSIv2 経由で作成されたエンティティは NGSI-LD からは見えず、その逆も同様です (各エンティティの `protocol` フィールド、#964)。

## 仕様準拠

このドキュメントは **[ETSI GS CIM 009 V1.9.1 (2025-07)](https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/01.09.01_60/gs_CIM009v010901p.pdf)** を参照仕様としています。GeonicDB は仕様のサブセットを実装しています; 適合性は自己宣言ではなく、固定された ETSI Test Suite に対して帯域外で測定されます ([geonicdb-compliance](https://github.com/geolonia/geonicdb-compliance) を参照)。各機能の詳細については、以下の ETSI 仕様セクションを参照してください:

| Feature Category            | ETSI GS CIM 009 Section            |
| --------------------------- | ---------------------------------- |
| Entity Operations           | Section 5.6                        |
| Query Operations            | Section 5.7                        |
| Subscriptions               | Section 5.8                        |
| Context Source Registration | Section 5.9                        |
| Temporal API                | Section 5.6.11-5.6.16, 5.7.3-5.7.4 |
| EntityMaps                  | Section 5.14                       |
| JSON-LD Context Management  | Section 5.13                       |
| Distributed Operations      | Section 4.3.6 (5.10-5.12)          |

### 実装状況 (v1.9.1 差分)

| Status                       | Feature                                                                          | Notes / Tracking                                                                                                                                                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Implemented                  | `orderBy` (shared parser + entity/temporal query)                                | Implemented by #1661 / #1662 / #1663                                                                                                                                                                                    |
| Implemented                  | NGSI-LD core `@context` v1.9 update                                              | Implemented by #1665                                                                                                                                                                                                    |
| Implemented                  | Property `valueType` member                                                      | Implemented by #1666                                                                                                                                                                                                    |
| Implemented                  | Batch operations (`create` / `upsert` / `update` / `merge` / `delete` / `query`) | Implemented scope tracked in #1580                                                                                                                                                                                      |
| Implemented                  | Geo-queries                                                                      | Implemented scope tracked in #1580                                                                                                                                                                                      |
| Implemented                  | EntityMap                                                                        | Implemented scope tracked in #1580                                                                                                                                                                                      |
| Implemented                  | `GET /info/sourceIdentity`                                                       | Returns a `ContextSourceIdentity` (clause 5.15 / 5.2.40) including the mandatory `contextSourceAlias` / `contextSourceUptime` / `contextSourceTimeAt` members. Implemented by #1731                                     |
| Partial / Known difference   | Entity Purge                                                                     | Spec form `DELETE /entities` (clause 5.6.21, binding 6.4.3.3) is supported; `POST /entityOperations/purge` is a **GeonicDB extension** (no such resource in the spec). Known `keep`/`drop` behavior differences (#1660) |
| Partial / Known difference   | Snapshot API                                                                     | **GeonicDB extension**; not the ETSI Snapshot module (clause 5.16 / data type 5.2.41) — same name, different shape, distinguishable by input form (#1667)                                                               |
| Partial / Known difference   | Distributed Operations                                                           | Implemented, but interoperability pass-rate remains low; improvement continues (#1664 / #1580)                                                                                                                          |
| Not implemented (known gaps) | `ngsildproof` signature attributes                                               | Tier3 / out of scope in #1580                                                                                                                                                                                           |
| Not implemented (known gaps) | `splitEntities`                                                                  | Tier3 / out of scope in #1580                                                                                                                                                                                           |
| Not implemented (known gaps) | Backward-compatibility version negotiation                                       | Tier3 / out of scope in #1580                                                                                                                                                                                           |

> 注意: GeonicDB は ETSI GS CIM 009 が適合クラスモデルを定義していないため、機械可読な適合性宣言を提供しません (#1585)。合格率は [geonicdb-compliance](https://github.com/geolonia/geonicdb-compliance) の固定測定実行を通じて帯域外で公開されています。

### コンテンツネゴシエーションと @context

NGSI-LD API は `Accept` ヘッダーを介したコンテンツネゴシエーションをサポートしています。

以下の表は ETSI の取得エンドポイント(`/entities`、`/subscriptions`、`/temporal` など)について説明しています。

| Accept Header          | Response Format | @context Handling                            |
| ---------------------- | --------------- | -------------------------------------------- |
| *(absent)*             | JSON            | `@context` is returned via the `Link` header |
| `*/*`                  | JSON            | `@context` is returned via the `Link` header |
| `application/ld+json`  | JSON-LD         | `@context` is included in the response body  |
| `application/json`     | JSON            | `@context` is returned via the `Link` header |
| `application/geo+json` | GeoJSON         | `@context` is included in the response body  |

**ネゴシエーションルール(ETSI GS CIM 009 - 6.3.4、#1734 / #1727):** [clause 6 text](https://cim.etsi.org/NGSI-LD/official/clause-6.html) を参照してください。


1. **`Accept` ヘッダーが存在しない(または空の)場合、ワイルドカード受け入れとして扱われます**(IETF RFC 9110 §12.5.1)。すべての ETSI 取得エンドポイントにおいて、候補順序により `application/json` に解決されます。これは clause 6.3.4 の要件と完全に一致します:*「Accept ヘッダーが存在しない場合、`application/json` が想定されるものとします。」*
   
2. 標準の候補セットを持つ ETSI 取得エンドポイントにおいて、`Accept` ヘッダーが複数のサポートされた表現に展開される場合、候補リストの順序 `application/json` → `application/ld+json` → `application/geo+json` が重要であり、**最初にマッチしたものが優先されます**。したがって、`Accept: */*`(`curl`、`python-requests`、およびほとんどの HTTP クライアントのデフォルト)は、それらの ETSI エンドポイントでは JSON-LD ではなく `application/json` に解決されます。
   
3. 相対的な `q` 値(IETF RFC 7231 §5.3.2、メディアレンジの特異性を含む:`type/subtype` > `type/*` > `*/*`)は、そのリスト順序を**上書きします**。`Accept: application/json;q=0.1, application/ld+json;q=1` は JSON-LD を生成します。`Accept: application/json, */*` は、明示的なメディアタイプがワイルドカードよりも特定的であるため、プレーン JSON を生成します。
   
4. `application/geo+json` は、GeoJSON ボディをレンダリングできるエンドポイント(`GET /entities`、`GET /entities/{entityId}`、および `POST /entityOperations/query`(#1783))でのみ候補となります。Clause 6.3.4 は「Retrieve Entity」(5.7.1)と「Query Entity」(5.7.2)の両方を GeoJSON 対応として指定しており、Query Entity は `GET /entities` またはこの POST のいずれかで呼び出すことができます。それ以外の場所では選択のために無視され、他に受け入れ可能なものがない場合は `406` を返します。

> **破壊的変更(#1734):** この修正以前は、`Accept` ヘッダーが存在しない場合と `Accept: */*` は `application/ld+json` に解決されていたため、レスポンスのボディにトップレベルの `@context` が含まれていました。現在はこれらが `application/json` に解決され、`@context` は `Link` ヘッダーに移動します。JSON-LD を必要とするクライアントは、明示的に `Accept: application/ld+json` を送信する必要があります。公式 CLI(`geonic`)と npm SDK(`@geolonia/geonicdb-sdk`)はすでにこれを行っており、影響を受けません。

ネゴシエートされたタイプが `application/json` の場合、レスポンスには `Link` ヘッダーが含まれます:

```http
Link: <https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.9.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"
```

**406 Not Acceptable (#1693):** NGSI-LD GET(取得)エンドポイントと `POST /entityOperations/query` において、`Accept` ヘッダーが利用可能な表現のいずれにもネゴシエートできない場合、Context Brokerは JSON を黙って提供する代わりに `406 Not Acceptable`(ETSI GS CIM 009 - 6.3.2 / 6.3.4)を返します。ProblemDetails ボディ(`type: https://uri.etsi.org/ngsi-ld/errors/NotAcceptable`)は、`availableRepresentations` にパス固有のネゴシエート可能なメディアタイプをリストします:通常は `application/json` / `application/ld+json`(entities エンドポイントと `POST /entityOperations/query` では `application/geo+json` も含む、#1783)。例えば、`Accept: application/xml` や `text/csv` は `406` を返します。`Accept` ヘッダーが存在しないか空の場合は、ワイルドカード受け入れとして扱われ、各エンドポイントの最優先利用可能表現に解決されるため、`406` を返しません。

**リクエストボディの `@context`(書き込み操作、#1583):** エンティティ表現またはフラグメントを運ぶリクエスト(作成、置換、属性の追加)については、`Content-Type` が `@context` の供給方法を決定します:

| Request `Content-Type` | `@context` in body | Behavior                                                                                                                                                                                                                                                      |
| ---------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `application/ld+json`  | **Required**       | Omitting `@context` returns `400 BadRequestData` (ETSI GS CIM 009 clause 6.3.5). A JSON-LD document without a context has undefined attribute-name semantics.                                                                                                 |
| `application/json`     | **Rejected**       | Clause 6.3.5: "if the request payload body (as JSON) contains a `@context` term, then an HTTP error response of type BadRequestData shall be raised." Supply the context via the `Link` header instead; with neither, the core `@context` applies implicitly. |

**混在は不可(#1924)。** Clause 6.3.5 は「混在は許可されません。つまり、オプションを混在させると HTTP レスポンスエラーになります。」で締めくくられています。両方向とも `POST` / `PATCH` / `PUT` で `400 BadRequestData` を返します:

| Request                                       | Result                     |
| --------------------------------------------- | -------------------------- |
| `application/ld+json` + JSON-LD `Link` header | `400 BadRequestData`       |
| `application/json` + body `@context`          | `400 BadRequestData`       |
| `application/ld+json` + body `@context` only  | accepted                   |
| `application/json` + `Link` header only       | accepted                   |
| `application/json`, no `@context` anywhere    | accepted (core `@context`) |

このチェックは NGSI-LD ルーターのエントリで一度実行されるため、エンティティレベル、単一属性、バッチ、時系列、サブスクリプション、csourceRegistrations、csourceSubscriptions を問わず、**すべての**ボディを運ぶ NGSI-LD 書き込みをカバーします。`POST /ngsi-ld/v1/jsonldContexts` は除外されます:そのボディは JSON-LD コンテキストドキュメント自体であり、コンテキスト宣言ではありません。`application/merge-patch+json` は clause 6.3.5 の文言の範囲外(`application/json` と `application/ld+json` のみを指定)であり、したがって混在ルールの対象ではありません。

**互換性に関する注意。** 以前に `application/json` でボディに `@context` を送信していたクライアント(`@context` は黙って無視されていました)は、現在 `400` を受け取ります。それらを `application/ld+json` に切り替えるか、コンテキストを `Link` ヘッダーに移動してください。同様に、`application/ld+json` *と* `Link` ヘッダーを送信するクライアントは、書き込み時に `Link` ヘッダーを削除する必要があります。

**レスポンスの `@context` はリクエストのみで決定されます(#1733)。** ETSI GS CIM 009 clause 5.5.7 によると、「用語のコンパクション又は展開を実行するために使用される `@context` は、各 API 呼び出しによって提供されるもの(またはその不在時のデフォルト `@context`)であり、**以前に提供された可能性のある他の `@context` ではない**」とされており、clause 5.5.5 は、`@context` を持たない入力には「最低限…コア `@context`」を与えることを要求しています。したがって:


* 読み取りが JSON-LD `Link` ヘッダーを介してコンテキストを提供する場合、レスポンスはそれでコンパクトされます。`POST` クエリ操作(`/entityOperations/query`、`/temporal/entityOperations/query`)の場合、ソースは他の POST と同様に clause 6.3.5 に従います:`application/ld+json` の場合、`@context` はリクエスト**ボディ**から取得され、`application/json` の場合は `Link` ヘッダーから取得されます(#1786)。これが配線される前は、これらのエンドポイントでボディの `@context` は無視され、クエリの type / 属性名が間違った語彙の下で展開されていました。これは**ゼロ結果**として表面化し、エラーではありませんでした。
  
* 読み取りがコンテキストを提供しない場合、レスポンスは **NGSI-LD コア `@context` のみ**でコンパクトされます。コア `@context` がコンパクトできないエンティティタイプと属性名は、**完全修飾 URI** としてレンダリングされます(clause 5.5.7:「実装は完全修飾名をレンダリングするものとします」)。
  
* Context Brokerはエンティティの `type` からコンテキストを推測しません(Smart Data Models / Custom Data Model)。ドメイン語彙を取得するには、読み取り時にその語彙の `@context` を渡します。
  
* **短縮名は、リクエストの `@context` の下で同じ URI に展開される場合にのみ使用されます(#1787)。** リクエストの `@context` がその短縮名を*異なる
* IRI にマッピングしている場合(シャドーイング)、それは「一致する用語」ではなく、決して出力されません。Context Brokerは次のコンパクション形式(ラウンドトリップする `prefix:suffix` コンパクト IRI)にフォールスルーし、最終的には完全修飾 URI にフォールスルーします。例:コンテキストなしで書き込まれた属性(URI `https://uri.etsi.org/ngsi-ld/default-context/name`)を、`"name": "https://example.org/vocab#name"` を定義するコンテキストで読み戻すと、`ngsi-ld:default-context/name` としてレンダリングされ、`name` では**ありません**。`name` を返すと、クライアントはそれを `example.org/vocab#name` として読み取ります。これは JSON-LD 1.1 の [IRI Compaction Algorithm](https://www.w3.org/TR/json-ld11-api/#iri-compaction) を反映しており、エンティティタイプと属性名の両方に適用されます。
  
* **シャドーイングチェックは短縮名のエンティティタイプにも適用されます(#1876)。** コンテキストなしで書き込まれたタイプは、ベアの正規名として保存され、Context Brokerは読み取りの `@context` を全く参照せずにコア `@vocab` を削除してレンダリングしていました。現在は、読み取りがコンテキストを提供する場合は常にそれを参照します:コンテキストなしで作成された `Building` を、`"Building": "https://example.org/vocab#Building"` を定義するコンテキストで読み戻すと、`ngsi-ld:default-context/Building` としてレンダリングされます。`@context` を提供しない読み取り(またはコアのみを提供する読み取り)は、古い高速パスを保持し、リモートコンテキストをフェッチしません。同じルールが、`csourceRegistrations`、`csourceSubscriptions`、`subscriptions` レスポンス内のタイプセレクタにも適用されます。
  
* **曖昧な `@context` ドキュメントは `400 BadRequestData` で拒否されます(#1878)。***キー*がパススルー形式の絶対 IRI(`https://…`、`urn:…`、または接頭辞が未定義の `prefix:suffix`)である用語を定義し、それを**異なる** IRI にマッピングするコンテキストは、Context Brokerが clause 5.5.7 を満たす方法を残しません:フォールバックする完全修飾名でさえ、そのコンテキスト下では別の意味を持ちます。このようなリクエストは、黙って誤読された名前で応答されるのではなく、拒否されます。これは狭い範囲です。`{"ex": "https://ex/ns#", "ex:Name": "https://ex/ns#Name"}`(接頭辞が同じコンテキストで定義されているコンパクト IRI キー)と `{"https://ex/X": "https://ex/X"}`(自分自身にマッピングされたキー)は両方ともまだ受け入れられます。

**作成時の `@context` の保持(#1620 / #1633):** 作成時に提供された `@context`(`application/ld+json` の場合はボディ、`application/json` の場合は `Link` ヘッダー)は、エンティティと共に保存されます。これは **URL、URL 配列、インラインコンテキストオブジェクト(用語 → IRI マップ)、および混合配列**をカバーします(#1633 は #1620 を拡張し、URL のみを保存していました)。#1733 以降、これはレスポンスをレンダリングする際に**保存された属性の完全修飾名を復元するためにのみ**使用され、レスポンスの `@context` を決定することはありません。これは単一(`POST /entities`)と**バッチ**(`POST /entityOperations/create`、`upsert`)の両方の作成に適用されます。**既存の**エンティティの upsert/replace では、保存されたコンテキストは保持されます(コンテキスト更新のセマンティクスは範囲外です)。シリアル化されたサイズが `MAX_CONTEXT_INLINE_BYTES`(8 KiB)を超えるインライン `@context`、または `MAX_CONTEXT_ARRAY`(10)エントリを超える `@context` 配列は、`400 BadRequestData` で拒否されます。`application/json` 読み取りの場合、`Link` ヘッダーは URL のみを運ぶことができるため、インライン語彙は `application/ld+json` ボディでのみ提供できます。

### 自然言語照合(lang + orderBy)

`lang` パラメータと `orderBy` を組み合わせることで、指定された言語のロケールに基づいて結果をソートできます。例えば、`lang=ja` は日本語の照合順序をソートに適用します。

### エンティティ操作 (NGSI-LD)

> **ETSI GS CIM 009 リファレンス**: Section 5.6 - Entity Operations

#### エンティティリストの取得

```http
GET /ngsi-ld/v1/entities
```

**リクエストヘッダー**

```http
Accept: application/ld+json
Link: <https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"
```

**クエリパラメータ**

| Parameter        | Type    | Description                                                                                                                                                                                                                                              | Default     |
| ---------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `id`             | string  | Filter by entity ID (comma-separated for multiple, URI format)                                                                                                                                                                                           | -           |
| `limit`          | integer | Number of results to retrieve                                                                                                                                                                                                                            | 20          |
| `offset`         | integer | Offset (max: 10000)                                                                                                                                                                                                                                      | 0           |
| `pageToken`      | string  | Keyset continuation token (default sort only). Send back the previous response's `NGSILD-Next`. Mutually exclusive with `offset`; invalid with `orderBy`. See [API.md §Keyset Pagination](./endpoints.md#keyset-pagination-pagetoken-1435) (#1435)       | -           |
| `orderBy`        | string  | Entity Ordering Language expression (ETSI GS CIM 009 V1.9.1 §4.23 / 5.2.43) — see [Entity Ordering (orderBy)](#entity-ordering-orderby) below                                                                                                            | -           |
| `orderDirection` | string  | Sort direction (`asc`, `desc`) for the legacy notation (see below). Ignored when `orderBy` carries explicit `;`-direction operators                                                                                                                      | `asc`       |
| `type`           | string  | Filter by entity type                                                                                                                                                                                                                                    | -           |
| `idPattern`      | string  | Regular expression pattern for entity ID                                                                                                                                                                                                                 | -           |
| `q`              | string  | Filter by attribute value                                                                                                                                                                                                                                | -           |
| `attrs`          | string  | Attribute names to retrieve (comma-separated)                                                                                                                                                                                                            | -           |
| `pick`           | string  | Attribute names to retrieve (comma-separated, mutually exclusive with `omit`)                                                                                                                                                                            | -           |
| `omit`           | string  | Attribute names to exclude (comma-separated, mutually exclusive with `pick`, `id`/`type` not allowed)                                                                                                                                                    | -           |
| `scopeQ`         | string  | Scope query (e.g., `/Madrid`, `/Madrid/#`, `/Madrid/+`)                                                                                                                                                                                                  | -           |
| `lang`           | string  | Language filter for LanguageProperty (BCP 47, comma-separated priority order, `*` for all languages)                                                                                                                                                     | -           |
| `georel`         | string  | Geo-query operator                                                                                                                                                                                                                                       | -           |
| `geometry`       | string  | Geometry type                                                                                                                                                                                                                                            | -           |
| `coordinates`    | string  | Coordinates                                                                                                                                                                                                                                              | -           |
| `spatialId`      | string  | Filter by spatial ID (ZFXY format) (see [Spatial ID Search](./endpoints.md#spatial-id-search))                                                                                                                                                           | -           |
| `spatialIdDepth` | integer | Depth of spatial ID hierarchy expansion (0-4)                                                                                                                                                                                                            | 0           |
| `crs`            | string  | Coordinate reference system (see [Coordinate Reference System (CRS)](./endpoints.md#coordinate-reference-system-crs)). URN format also accepted                                                                                                          | `EPSG:4326` |
| `geoproperty`    | string  | GeoProperty name to use for geo-queries                                                                                                                                                                                                                  | `location`  |
| `format`         | string  | Output format (`normalized`, `concise`, `keyValues`, `simplified`, `geojson`). `format` is prioritized over `options`. Unknown values are rejected with `400 InvalidRequest`. `geojson` can also be specified with `Accept: application/geo+json` header | -           |
| `expandValues`   | string  | Attribute names to expand (comma-separated, returns expanded values)                                                                                                                                                                                     | -           |
| `options`        | string  | `keyValues` / `simplified`, `concise`, `entityMap`, `sysAttrs` (output system attributes). Comma-separated tokens. **Unknown tokens are rejected with `400 InvalidRequest`** (ETSI GS CIM 009 - 6.3.20, #1664)                                           | -           |
| `count`          | boolean | `true` returns the `NGSILD-Results-Count` header; `false` is accepted and omits it; any other lexical value returns `400 BadRequestData` (ETSI GS CIM 009 Table 6.3.13-1 declares `count` as Boolean, #1904)                                             | -           |
| `splitEntities`  | flag    | Split response into arrays grouped by entity type (GeonicDB 独自拡張; standalone query parameter, not an `options` token)                                                                                                                                    | -           |
| `local`          | boolean | `true` answers from local data only (no Context Source Registration is considered as matching; ETSI GS CIM 009 Table 6.3.18-1). `localOnly` is a backward-compatible alias. Non-Boolean values return `400 BadRequestData` (#2008)                       | `false`     |

> **GeoJSON 属性/型名の圧縮 (#1788 サブ項目 6):** `format=geojson` (または `Accept: application/geo+json`) がネゴシエートされた場合、Feature の `properties` キーと `properties.type` は JSON 表現と同じリクエスト `@context` ルールで圧縮されます (ETSI GS CIM 009 clause 5.5.7 — 上記の [Content Negotiation and @context](#content-negotiation-and-context) を参照)。この修正以前は、`toNgsiLd` (JSON) は名前を圧縮していましたが、GeoJSON トランスフォーマーは保存された (正規/FQN) 名をそのまま出力していたため、同じエンティティでも `Accept` によって異なる属性名を持つ可能性がありました。`geometry` として使用される属性 (保存された名前 `location` に固定。上記の `geoproperty` クエリパラメータとは**紐付いていません**。このパラメータは地理クエリフィルタリングにのみ影響します) は、依然として**保存された**属性名と照合されます — 出力される `properties` キーのみが圧縮されるため、ジオメトリの選択は圧縮の影響を受けません。
>
> **未知クエリパラメータの扱い (仕様逸脱の明示, #1664)**: ETSI GS CIM 009 - 6.3.20 は
> 「operation と両立しないパラメータ」に `400 InvalidRequest` を返すべき (should) としている。
> GeonicDB は `options` の**値** (トークン) は厳格に検証して 400 を返すが、**未知のクエリ
> パラメータ名**は silent に無視する (should 準拠の意図的逸脱)。これは `localOnly` / `csf` /
> `spatialId` / `join` / `crs` / `pageToken` 等の GeonicDB 独自パラメータが多数存在し、
> パラメータ名の strict 化は独自拡張と衝突するため。

##### エンティティの順序付け (orderBy)

> **ETSI GS CIM 009 V1.9.1 リファレンス**: §4.23 Entity Ordering Language / §5.2.43 OrderingParams

`orderBy` は v1.9.1 Entity Ordering Language を受け付けます (#1580 / #1661):

```text
orderBy = AttrName [";" directionOp] *("," AttrName [";" directionOp])
directionOp = asc | desc | dist-asc | dist-desc
```


* **方向付き単一キー**: `orderBy=temperature;desc` (デフォルトの方向は `asc`)。`directionOp` は大文字小文字を区別しません (`;DESC` も受け付けられます)。
  
* **複合キー** (カンマ区切り、左から右へタイブレーカーとして評価): `orderBy=type;asc,temperature;desc`。
  
* **パス**: ドット記法 (`name.observedAt`) とブラケット記法 (`address[city]`、同等のドットパスに正規化される) が受け付けられます。エンティティメンバー `id` / `type` / `scope` も使用できます。
  
* **距離ソート**: `dist-asc` / `dist-desc` は GeoProperties の距離でソートします。`orderBy=geo:distance` (`near` 地理クエリと組み合わせて) は `$geoNear` 距離ソートパスを経由します。
  
* **文法違反** (例: `;ascending`、空の項、末尾のカンマ、不正なブラケット) は `400 BadRequestData` を返します。構文的に有効だが**存在しない属性はエラーではありません** — §4.23.2 の混合型順序付けに従い、属性を持たないエンティティは最後にソートされます。
  
* 式ごとに最大 **20** の順序付け項 (`SECURITY.MAX_ORDER_BY_TERMS`)。これを超えると `400` を返します。
  
* 同じ構文はバッチクエリ (`POST /entityOperations/query`) および時系列クエリエンドポイントでも受け付けられます。時系列クエリでは、さらに `orderBy` と `aggrMethods` の組み合わせを拒否し、暗号化されたテナントでの属性値ソートを `400` で拒否します。

> **レガシー記法 (GeonicDB、非推奨)**: v1.9.1 以前の記法 — `orderBy=!attr` (降順の場合は先頭に `!`) と別の `orderDirection` パラメータの組み合わせ — は後方互換性のためまだ受け付けられており、コントローラー境界で正規文法に変換されます (明示的な `orderDirection` は `!` よりも優先されます)。新しいクライアントは `;` 方向構文を使用すべきです。

**レスポンス例**

```json
[
  {
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
    "id": "urn:ngsi-ld:Room:001",
    "type": "Room",
    "temperature": {
      "type": "Property",
      "value": 23.5,
      "observedAt": "2024-01-15T10:00:00Z",
      "unitCode": "CEL"
    },
    "location": {
      "type": "GeoProperty",
      "value": {
        "type": "Point",
        "coordinates": [139.7671, 35.6812]
      }
    }
  }
]
```

**レスポンスヘッダー**

| Header                 | Description                                                                                                                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NGSILD-Results-Count` | Total count — returned only when `count=true` is requested (ETSI GS CIM 009 §5.5.6). Without it, the count query is skipped and further pages are indicated via `NGSILD-Next` / `Link` (`rel="next"`) (#1434). |

> **`count` 受け入れ可能な値 (#1904)**: `count` は ETSI GS CIM 009 Table 6.3.13-1 に基づき **Boolean** です。
> `count=true` は `NGSILD-Results-Count` ヘッダーを設定します。**`count=false` も受け入れられ**、単にそれを省略します
> (200、エラーではありません)。その他の値 — `yes`、`1`、`True`、空 — は Boolean の字句形式ではないため、
> **`400 BadRequestData`** を返します。これはすべての NGSI-LD リストエンドポイント (entities、batch query、
> attributes、csourceSubscriptions、entityMaps、jsonldContexts、registrations、snapshots、subscriptions、
> types、temporal) に適用されます。NGSIv2 は `options=count` を使用し、影響を受けません。

#### Create Entity

```http
POST /ngsi-ld/v1/entities
Content-Type: application/ld+json
```

**リクエストボディ**

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "id": "urn:ngsi-ld:Room:001",
  "type": "Room",
  "temperature": {
    "type": "Property",
    "value": 23.5,
    "unitCode": "CEL"
  },
  "isPartOf": {
    "type": "Relationship",
    "object": "urn:ngsi-ld:Building:001"
  }
}
```

> **サブ属性 (#1581)**: 属性はユーザー定義のサブ属性を持つことができます (Property of Property、Relationship of Property など — ETSI GS CIM 009 clause 4.5)。例: `"airQualityLevel": { "type": "Property", "value": 2, "accuracy": { "type": "Property", "value": 0.9 } }`。1 レベルのサブ属性が保存され、読み取り時に返されます (normalized および concise)。より深いネスト (サブ属性自身のサブ属性) は保持されません。
>
> **Concise メタデータと再帰的サブ属性 (#1761 / #1779)**: concise 出力では、予約されたメタデータが実際に保存されているものから復元されます: `observedAt`、`unitCode`、`valueType`、さらに書き込み時にそれを保持する属性タイプの場合は `datasetId` (ETSI GS CIM 009 clause 4.5.2.3)。`GeoProperty` および `LanguageProperty` は現在書き込み時に `datasetId` を保持しないため、これらのタイプでは normalized および concise 出力の両方で `datasetId` が欠落します (#1795 で追跡中)。これは取り込み側の制限であり、concise 形式の制限ではありません。`unitCode` は ETSI が明示的に禁止している単位なしのタイプ (`Relationship`、`ListRelationship`、`LanguageProperty`、`VocabProperty`、`JsonProperty`。clauses 4.5.3.3 / 4.5.22.3 / 4.5.18.3 / 4.5.20.3 / 4.5.24.3) では省略されます。サブ属性は concise 表現で再帰的にシリアル化されます: 独自のサブ属性を持たないサブ Property は値のみに折りたたまれ、サブ Relationship はエンベロープ (`{ "type": "Relationship", "object": ... }`) を保持します。
>
> **複数ターゲット Relationship (#1615)**: `Relationship.object` は単一の URI または **URI の配列** (ETSI `oneOf: string | array`) を受け入れます。例: `"locatedAt": { "type": "Relationship", "object": ["urn:ngsi-ld:City:Paris", "urn:ngsi-ld:City:Lyon"] }`。配列形式 (1 から `MAX_QUERY_ATTRS` URI、デフォルト 50) は配列として保存および返されます。
>
> **サブ属性名と用語展開 (#1788 sub-item 4)**: サブ属性名は Attribute および Entity Type 名と同じ用語 ⇄ URI 等価性の対象となります (ETSI GS CIM 009 clause 5.5.7 — "Property, Relationship or Type names")。短縮名はリクエスト `@context` で展開され Fully Qualified Name として保存され、レスポンスは **そのリクエストによって提供された `@context`** を使用してそれをコンパクトに戻します (clause 5.5.5)。したがって、サブ属性名は短縮名 (`^[A-Za-z0-9_]+$`) または絶対 IRI のいずれかで指定できます。絶対 IRI ではないドット付き名前 (例: `unit.code`) は `400 BadRequestData` で拒否されます。予約された属性メンバー (`observedAt`、`unitCode`、`datasetId`、`valueType`) はこの意味での名前では **なく**、変換されません。同じ属性の 2 つのサブ属性名が同じ出力名にレンダリングされる場合、その属性は代わりに保存された名前でレンダリングされます (データ保持がコンパクト化に勝つ — トップレベル属性名と同じルール)。これは normalized および concise 出力、単一属性取得 (`GET /entities/{entityId}/attrs/{attrName}`)、およびサブスクリプション通知に適用されます。
>
> **Concise 入力がサブ属性を運ぶ (#1793)**: `options=concise` (`PATCH /entities/{entityId}/attrs`、`PATCH /entities/{entityId}`、`PUT /entities/{entityId}`) の場合、予約されたメンバー以外の属性オブジェクトのメンバーは、clause 4.5.2.3 (サブ属性は concise 表現で再帰的にシリアル化される) に一致するユーザー定義サブ属性として取り込まれます。単純なスカラー (`"accuracy": 0.5`) はサブ Property になり、オブジェクト形式 (`"providedBy": {"object": "urn:..."}`) はトップレベル concise 入力と同じ推論を使用してその値メンバーから型付けされます。以前は 4 つの予約メンバーのみが残り、concise を読み取って書き戻すとすべてのユーザー定義サブ属性が黙って削除されました。`POST /entities/{entityId}/attrs` (append) は `options=concise` を受け入れないことに注意してください — そのオプション語彙は `noOverwrite` のみです (clause 5.6.3)。
>
> **VocabProperty 値と用語展開 (#1788 sub-item 5)**: ETSI GS CIM 009 clause 5.5.7 は "Property, Relationship or Type names **and VocabProperty values**" を用語 ⇄ URI 等価性の対象としてリストしています。短縮名として与えられた `vocab` 値はリクエスト `@context` で展開され Fully Qualified Name として保存され、レスポンスはそのリクエストによって提供された `@context` を使用してそれをコンパクトに戻します — Attribute および Entity Type 名に適用されるルールと全く同じです。`vocabMap` の場合、**値** のみが変換されます。キーは言語タグであり、用語ではありません。サブ属性として表示される VocabProperty も同じ方法で変換されます。クエリは次のようになります: `q=fuel=="diesel"` は正規の FQN で保存されたエンティティと一致し、同じエンティティは同じ URI に別の用語をマッピングする異なる `@context` を介して見つかります。クエリ側の拡大は **VocabProperty に制限されています** (属性ドキュメントの `type` が条件の一部)。したがって、プレーン Properties の値比較は影響を受けません。
>
> **Property `valueType` (#1580)**: オプションの Property メンバー `valueType` (ETSI GS CIM 009 clause 4.5.2) は書き込み時に保存され、読み取り時に保持されます (normalized および concise 表現)。空文字列は `400 BadRequestData` で拒否されます。

**Transient Entity (expiresAt)**

エンティティに `expiresAt` フィールド (ISO 8601 形式) を指定することにより、有効期限を持つ Transient Entity として作成されます。有効期限は将来の日付である必要があります。

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "id": "urn:ngsi-ld:Room:temp-001",
  "type": "Room",
  "temperature": { "type": "Property", "value": 23.5 },
  "expiresAt": "2030-01-01T00:00:00Z"
}
```

**レスポンス**

* Status: `201 Created`
  
* Status: `409 AlreadyExists` 同じ ID を持つエンティティが既に存在する場合 (タイプに関係なく)
  
* Header: `Location: /ngsi-ld/v1/entities/urn:ngsi-ld:Room:001`

> **注意**: Entity ID はテナントおよびServicePathスコープ内で一意です。同じ ID で異なるタイプのエンティティを作成すると `409 AlreadyExists` が返されます。詳細については [Entity ID Uniqueness](./endpoints.md#entity-id-uniqueness-geonicdb-extension) を参照してください。

> **GeoProperty 座標と高度 (#1584)**: GeoProperty 値は GeoJSON ジオメトリです (RFC 7946)。位置は 2 要素 `[longitude, latitude]` または 3 要素 `[longitude, latitude, altitude]` です — オプションの 3 番目の要素 (高度/標高) は受け入れられ、読み戻し時に保持されます。空間インデックスおよび geo クエリには経度/緯度のみが使用されます。3 要素を超える位置は `400 BadRequestData` を返します (RFC 7946 §3.1.1 は位置を 3 要素を超えて拡張することを推奨していません)。非 WGS84 `crs` クエリパラメータが座標変換をトリガーする場合でも高度は保持されます: 経度/緯度のみが再投影され、高度は変更されずに引き継がれます (これらの CRS には垂直基準がないため、高度は再投影不変です) (#1595)。

#### Retrieve Single Entity

```http
GET /ngsi-ld/v1/entities/{entityId}
```

**クエリパラメータ**

| Parameter | Type   | Description                                                                                                                                                                                                                                              |
| --------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`    | string | Entity type                                                                                                                                                                                                                                              |
| `attrs`   | string | Attribute names to retrieve (comma-separated)                                                                                                                                                                                                            |
| `pick`    | string | Attribute names to retrieve (comma-separated, mutually exclusive with `omit`)                                                                                                                                                                            |
| `omit`    | string | Attribute names to exclude (comma-separated, mutually exclusive with `pick`, `id`/`type` not allowed)                                                                                                                                                    |
| `lang`    | string | Language filter for LanguageProperty (BCP 47)                                                                                                                                                                                                            |
| `format`  | string | Output format (`normalized`, `concise`, `keyValues`, `simplified`, `geojson`). `format` is prioritized over `options`. Unknown values are rejected with `400 InvalidRequest`. `geojson` can also be specified with `Accept: application/geo+json` header |
| `options` | string | `keyValues`, `concise`, `sysAttrs`                                                                                                                                                                                                                       |

> **単一取得での GeoJSON 出力 (#1759)**: `format=geojson` (または `Accept: application/geo+json`) は `Content-Type: application/geo+json` で GeoJSON **Feature** オブジェクトを返します。対照的に、`GET /ngsi-ld/v1/entities` は GeoJSON **FeatureCollection** を返します。リストエンドポイントと同様に、`properties` キーおよび `properties.type` はリクエスト `@context` でコンパクト化されます (#1788 サブ項目 6、[Retrieve Entity List](#retrieve-entity-list) の下の注記を参照)。

> **`attrs` と 404 (#1619)**: `attrs` が指定され、エンティティが要求された属性を **ひとつも** 持たない場合、`404 Not Found` が返されます (ETSI GS CIM 009 clause 5.7.1 / OpenAPI `Query.attrs`: "If the Entity does not have any of the Attributes in attrs, then a 404 Not Found shall be retrieved")。これは単一エンティティの取得に適用されます。リスト / クエリエンドポイントは代わりに空のコレクション (`200`) を返します。

> **パス `{entityId}` URI 検証 (#1692)**: すべての NGSI-LD by-id エンドポイント (entities、subscriptions、csourceRegistrations、temporal entities、jsonldContexts) において、構文的に有効な URI でないパス id (例: `not-a-uri`) は、存在チェックの **前に** `400 BadRequestData` で拒否されます — `404` を返すことはありません (ETSI GS CIM 009 clause 5.7.1 / 5.8.3: URI の妥当性はリソース検索の前にチェックされます)。存在しない有効な URI は通常通り `404 Not Found` を返します。

#### Replace Entity

```http
PUT /ngsi-ld/v1/entities/{entityId}
```

エンティティのすべての属性を置き換えます。リクエストボディに含まれない属性は削除されます。ボディに `scope` を含めるとエンティティの scope が置き換えられ、省略すると既存の scope が保持されます。単一の文字列または文字列の配列のいずれかを渡します。`scope: null` または `scope: []` を送信すると、scope が明示的に解除されます (**GeonicDB 拡張**、`docs/INTEROPERABILITY.md` を参照)。

**Response**: `204 No Content`

#### Update Entity

```http
PATCH /ngsi-ld/v1/entities/{entityId}
```

**Merge-Patch セマンティクス** (ETSI GS CIM 009 Section 5.6.4):


* `Content-Type: application/merge-patch+json` を使用すると、リクエストボディに含まれない属性は保持されます (マージモード)。標準の `application/json` / `application/ld+json` では、すべての属性が置き換えられます。
  
* プロパティ値として `urn:ngsi-ld:null` を指定すると、その属性が削除されます。
  
* ボディに `scope` を含めるとエンティティの scope が置き換えられ、省略すると既存の scope が保持されます。単一の文字列または文字列の配列のいずれかを渡します。`scope: null` または `scope: []` を送信すると、scope が明示的に解除されます (**GeonicDB 拡張**、`docs/INTEROPERABILITY.md` を参照)。
  
* クエリパラメータ `options=keyValues` または `options=concise` を指定すると、簡略化された入力形式を使用できます。

**Response**: `204 No Content`

#### Add Attributes

```http
POST /ngsi-ld/v1/entities/{entityId}
Content-Type: application/ld+json
```

**Query Parameters**

| Parameter             | Description                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| `options=noOverwrite` | Do not overwrite existing attributes (existing attributes are preserved, only new attributes are added) |

**Response**: `204 No Content`

#### Partial Update of Multiple Attributes

```http
PATCH /ngsi-ld/v1/entities/{entityId}/attrs
Content-Type: application/ld+json
```

エンティティの複数の属性を部分的に更新します。リクエストボディに含まれる属性のみが更新され、含まれない属性は保持されます。このエンドポイントは現在、ボディ内の `scope` フィールドを **尊重しません** — scope を更新するには、代わりに `PATCH /entities/{entityId}` (Update Entity) または `PUT /entities/{entityId}` (Replace Entity) を使用してください。

**Request Body**

```json
{
  "temperature": {
    "type": "Property",
    "value": 25.0
  }
}
```

**Response**: `204 No Content`

#### Delete Entity

```http
DELETE /ngsi-ld/v1/entities/{entityId}
```

**Response**: `204 No Content`

#### Retrieve All Attributes of an Entity

```http
GET /ngsi-ld/v1/entities/{entityId}/attrs
```

エンティティのすべての属性を取得します。

**Response**: `200 OK`

#### Retrieve Single Attribute

```http
GET /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
```

エンティティの特定の属性を取得します。

**Response**: `200 OK`

#### Overwrite Attribute (PUT)

```http
PUT /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
Content-Type: application/ld+json
```

指定された属性を新しい値で完全に上書きします。属性が存在しない場合は `404 Not Found` を返します。

**リクエストボディ**

```json
{
  "type": "Property",
  "value": 25.0
}
```

**レスポンス**: `204 No Content`

#### Replace Attribute

```http
POST /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
Content-Type: application/ld+json
```

指定された属性を新しい値で置き換えます。

**リクエストボディ**

```json
{
  "type": "Property",
  "value": 25.0
}
```

**レスポンス**: `204 No Content`

#### Partial Update of Attribute

```http
PATCH /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
Content-Type: application/ld+json
```

**リクエストボディ**

```json
{
  "type": "Property",
  "value": 25.0
}
```

**レスポンス**: `204 No Content`

> **注意**: エンティティまたは属性が存在しない場合、`404 Not Found` が返されます (ETSI GS CIM 009 V1.9.1 clause 5.6.4)。この操作は既存の属性の部分更新のみを行い、新しい属性は作成しません。

**Entity Fragment のセマンティクス** (clause 5.6.4 — *"部分更新は Entity Fragment で提供された要素のみを変更し、残りはそのまま残します"*)

リクエストボディは *Entity Fragment* です。変更したい要素のみを含める必要があります。送信しないメンバーは変更されないため、Context Brokerが既に保存している内容をエコーバックする必要はありません。

> 以下のフラグメントは**議論中のメンバーのみ**を示しています。すべての `application/ld+json` リクエストと同様に、実際のリクエストボディにはインラインの `@context` も含まれます ([Content Negotiation and @context](#content-negotiation-and-context) を参照)。`application/json` の場合、コンテキストは `Link` ヘッダー経由で提供されます。


* **value メンバーは省略可能です。** `value` / `object` / `languageMap` / `json` / `vocab` / `vocabMap` (GeonicDB 拡張) / `valueList` / `objectList` はすべてオプションです。メタデータまたはサブ属性のみを含むフラグメントは有効であり、保存されている値と属性タイプは保持されます。

  ```json
  { "observedAt": "2026-08-06T18:30:00.000Z" }
  ```

  ```json
  { "providedBy": { "type": "Relationship", "object": "urn:ngsi-ld:Person:JohnDoe" } }
  ```


* **`type` は省略可能です。** フラグメントが value メンバーを含む場合、属性タイプはそれから推測されます (`object` → `Relationship`、`languageMap` → `LanguageProperty`、`json` → `JsonProperty`、`valueList` → `ListProperty`、`objectList` → `ListRelationship`、`vocab` / `vocabMap` (GeonicDB 拡張) → `VocabProperty`、GeoJSON 形式の `value` → `GeoProperty`、それ以外は `Property`)。フラグメントが value メンバーを含まない場合、保存されている属性タイプが保持されます。

  ```json
  { "languageMap": { "fr": "Grand Place", "es": "Gran Lugar" } }
  ```


* **送信する要素の検証は変更されません。** 無効な `observedAt`、不正な形式の `languageMap`、URI でない `object` などは、依然として `400 BadRequestData` を返します。


* **`application/ld+json` では `@context` は依然として必須です (#1927)。** value メンバーの省略が許可されているからといって、`@context` まで省略できるわけではありません。ETSI GS CIM 009 clause 6.3.5 では、`Content-Type` が `application/ld+json` の場合、`POST` / `PUT` / `PATCH` ボディの `@context` はペイロード自体から取得する必要があり、それがないボディは `400 BadRequestData` を返します。`application/json` の場合は、`Link` ヘッダー経由で提供してください。これは単一属性エンドポイントにも、エンティティレベルのエンドポイントと同様に適用されます。

> **PUT / POST は異なります。** 同じパスでの `PUT` と `POST` は *Replace Attribute* です (clause 5.6.19 — *"既存の Attribute インスタンスを完全に置き換える"*)。これらは完全な属性を必要とします。value メンバーを省略すると `400 BadRequestData` が返され、提供されなかったメンバーは保持されるのではなく削除されます。

#### Delete Attribute

```http
DELETE /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
```

**クエリパラメータ**

| Parameter   | Type    | Description                                         |
| ----------- | ------- | --------------------------------------------------- |
| `datasetId` | string  | datasetId of the multi-attribute instance to delete |
| `deleteAll` | boolean | If `true`, deletes all instances                    |

**レスポンス**: `204 No Content`

> **注意**: **最後に残った属性** を削除することは許可されており、`204` を返します。NGSI-LD (ETSI GS CIM 009) は、エンティティが少なくとも 1 つの属性を保持することを要求していません — `id`/`type` のみで構成されるエンティティは有効であり、削除後も残ります。

### マルチ属性 (datasetId)

> **ETSI GS CIM 009 リファレンス**: Section 4.5.3 - Multi-Attribute

NGSI-LD では、同じ属性名に対して複数のインスタンスを保持できます。各インスタンスは `datasetId` (URI 形式) で区別されます。`datasetId` を持たないインスタンスは「デフォルトインスタンス」と呼ばれ、属性ごとに最大 1 つまで存在できます。

#### 作成 (CREATE)

エンティティを作成する際、配列形式で属性を指定することで、複数のインスタンスを作成できます。

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "id": "urn:ngsi-ld:Vehicle:A001",
  "type": "Vehicle",
  "speed": [
    {
      "type": "Property",
      "value": 55,
      "datasetId": "urn:ngsi-ld:dataset:gps"
    },
    {
      "type": "Property",
      "value": 54.5,
      "datasetId": "urn:ngsi-ld:dataset:obd"
    },
    {
      "type": "Property",
      "value": 54.8
    }
  ]
}
```

上記の例では、`speed` 属性に 3 つのインスタンスがあります:GPS からのもの、OBD からのもの、そしてデフォルトインスタンスです。

#### 取得 (RETRIEVE)

エンティティを取得する際、マルチ属性は配列形式で返されます。

`keyValues` (簡略化) 形式では、マルチ属性は `datasetId` をキーとする **`dataset` マップ**として返され、デフォルトインスタンス (`datasetId` を持たないもの) は JSON-LD キーワード `@none` でキー付けされます (ETSI GS CIM 009 clause 4.5.4, #1930)。単一インスタンス属性は素の値のままです。

```json
{
  "id": "urn:ngsi-ld:Vehicle:A4567",
  "type": "Vehicle",
  "speed": {
    "dataset": {
      "@none": 55,
      "urn:ngsi-ld:Dataset:gps": 60,
      "urn:ngsi-ld:Dataset:obd": 61
    }
  },
  "serial": "SN-0001"
}
```

`@none` キーはデフォルトインスタンスが存在する場合にのみ存在します。同じ形式が `Relationship`、`ListProperty`、`ListRelationship` にも適用されます (clause 4.5.4 EXAMPLE 13 / 15 / 19)。`normalized` と `concise` は変更されず、インスタンスの配列を返し続けます。

> \#1930 より前は、デフォルトインスタンス (存在しない場合は最初のインスタンス) のみが返されていたため、`keyValues` は `normalized` よりも少ない情報を暗黙的に公開していました。`keyValues` マルチ属性を読み取るクライアントは、現在 `dataset` をアンラップする必要があります。

#### 更新 (UPDATE)

単一属性エンドポイント (`PATCH` / `PUT` / `POST /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}`) では、操作はリクエストボディ内の `datasetId` によって選択された **1 つの属性インスタンス**をターゲットとします (ETSI GS CIM 009 clauses 5.6.4 / 5.6.19)。同じ属性の他のインスタンスは変更されません (#1819)。

```json
{
  "type": "Property",
  "value": 60,
  "datasetId": "urn:ngsi-ld:dataset:gps"
}
```

| Body                | Target instance                                      | If it does not exist   |
| ------------------- | ---------------------------------------------------- | ---------------------- |
| `datasetId` present | the instance with the same `datasetId`               | `404 ResourceNotFound` |
| `datasetId` absent  | the default instance (the one without a `datasetId`) | `404 ResourceNotFound` |

`PATCH` は提供されたメンバーを選択されたインスタンスにマージします (clause 5.6.4 — 提供されていないメンバーはそのまま残ります);`PUT` / `POST` は選択されたインスタンスを完全に置き換えます (clause 5.6.19)。

##### エンティティレベルの更新 (#1909)

**エンティティレベル**の更新操作は同じルールでインスタンスを選択しますが、**`ResourceNotFound` ゲートがありません** — 既存のインスタンスと一致しない `datasetId` は拒否されるのではなく、**新しいインスタンスとして追加**されます。これは ETSI GS CIM 009 clause 5.5.8 の汎用パッチアルゴリズムに従っています:`datasetId` を持つメンバーは、`datasetId` が同じ場合にのみ置き換えられ、*「そうでない場合、Fragment のメンバーは新しいインスタンスとしてターゲットに追加されます」*。リクエストがターゲットとしないインスタンスは変更されません。

これは以下に適用されます:


* `POST /ngsi-ld/v1/entities/{entityId}/attrs` (Append Attributes — clause 5.6.3)
  
* `PATCH /ngsi-ld/v1/entities/{entityId}/attrs` (Update Attributes — clause 5.6.2)
  
* `PATCH /ngsi-ld/v1/entities/{entityId}` (Merge Entity — clause 5.6.17)
  
* `POST /ngsi-ld/v1/entityOperations/merge` / `update` / `upsert`

| Body value for an attribute                                 | Effect                                                    |
| ----------------------------------------------------------- | --------------------------------------------------------- |
| single instance whose `datasetId` matches a stored instance | that instance is replaced; the others are kept            |
| single instance whose `datasetId` matches nothing           | added as a new instance; existing ones are kept           |
| single instance with no `datasetId`                         | replaces the default instance if present, otherwise added |
| array of instances                                          | each element is applied by the rules above, in order      |

属性は、作成時 (4.5.5 項) と同様に、エンティティレベルの更新においても **インスタンスの配列** として提供することができます。最大で 1 つの要素が `datasetId` を省略できます (デフォルトインスタンス)。2 つ以上省略すると `400 BadRequestData` になります。

#### 削除 (DELETE)

属性を削除する際、`datasetId` クエリパラメータを指定すると特定のインスタンスのみが削除されます。`deleteAll=true` を指定するとすべてのインスタンスが削除されます。

```http
DELETE /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}?datasetId=urn:ngsi-ld:dataset:gps
DELETE /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}?deleteAll=true
```

***

### バッチ操作 (NGSI-LD)

> **注意**: バッチ操作は 1 回のリクエストで最大 **1,000** 個のエンティティを処理できます。1,000 を超えるリクエストは `400 Bad Request` エラーになります。

#### バッチ作成

```http
POST /ngsi-ld/v1/entityOperations/create
Content-Type: application/ld+json
```

**リクエストボディ**

```json
[
  {
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
    "id": "urn:ngsi-ld:Room:001",
    "type": "Room",
    "temperature": { "type": "Property", "value": 23.5 }
  },
  {
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
    "id": "urn:ngsi-ld:Room:002",
    "type": "Room",
    "temperature": { "type": "Property", "value": 21.0 }
  }
]
```

**レスポンス**

* すべて成功: `201 Created`
  
* 部分的に成功: `207 Multi-Status`

#### バッチ Upsert

```http
POST /ngsi-ld/v1/entityOperations/upsert
```

**クエリパラメータ**

| Parameter         | Description                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------ |
| `options=update`  | Merge into existing attributes (explicit form of the GeonicDB default)                     |
| `options=replace` | Replace all attributes of existing entities (full replace); omitted attributes are cleared |

> **明示的な仕様逸脱 (#1664):** ETSI GS CIM 009 5.6.8.3 の upsert 既定モードは **replace** ですが、
> GeonicDB の既定 (options 省略時) は後方互換のため **update** (マージ) です。仕様既定の挙動が
> 必要な場合は `options=replace` を明示してください。未知の options 値は `400 InvalidRequest`
> で拒否されます (6.3.20)。

**レスポンス**

* すべて成功: `204 No Content`
  
* 部分的に成功: `207 Multi-Status`

> **注意 (GeonicDB 拡張)**: 既定 (マージ) モードと `options=replace` モードの両方は、単一のバルク書き込みで実行されます。バッチ全体が事前に検証されます — 1 つの無効なエンティティがあるとバッチは `400` で失敗します (バッチ作成と同じ)。一方、エンティティごとの DB エラー (例: 異なる型の複数のエンティティにマッチする曖昧な id) は `207 Multi-Status` として報告されます。`options=replace` では、既存のエンティティの型は保持され (属性のみが置換され)、`scope` は 3 状態のセマンティクス (`省略`=保持、`null`/`[]`=未設定、配列=設定) に従います。

#### バッチ更新

```http
POST /ngsi-ld/v1/entityOperations/update
```

**レスポンス**

* すべて成功: `204 No Content`
  
* 部分的に成功: `207 Multi-Status`

#### バッチ削除

```http
POST /ngsi-ld/v1/entityOperations/delete
Content-Type: application/json
```

**リクエストボディ**

```json
[
  "urn:ngsi-ld:Room:001",
  "urn:ngsi-ld:Room:002"
]
```

**レスポンス**

* すべて成功: `204 No Content`
  
* 部分的に成功: `207 Multi-Status`

#### エンティティパージ

```http
DELETE /ngsi-ld/v1/entities
```

Bulk purge はセレクタベースの削除と属性のミューテーションをサポートします (ETSI GS CIM 009 clause 5.6.21 / 6.4.3.3)。

**クエリパラメータ**

| Parameter                                                                  | Type    | Description                                                                                 |
| -------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------- |
| `type`                                                                     | string  | Entity type selector (`*` supported)                                                        |
| `id` / `idPattern`                                                         | string  | Optional entity ID selectors                                                                |
| `q`                                                                        | string  | NGSI-LD query selector                                                                      |
| `georel` / `geometry` / `coordinates` / `geoproperty` / `geometryProperty` | string  | Geo selector (`geometryProperty` is the spec alias of `geoproperty`)                        |
| `scopeQ`                                                                   | string  | Scope selector                                                                              |
| `attrs`                                                                    | csv     | Selector matching entities that have **any of** the listed attributes (OR, clause 5.6.21.4) |
| `keep`                                                                     | csv     | Keep listed attributes and remove the others                                                |
| `drop`                                                                     | csv     | Remove only listed attributes                                                               |
| `local` / `localOnly`                                                      | boolean | Local-only scope flag (not a selector)                                                      |

**検証 / ガード**

* `type`、`attrs`、`q`、`georel` のうち少なくとも 1 つが必要です (`id` のみまたは `local` のみは拒否されます)
  
* `keep` と `drop` を同時に指定することはできません。空の `keep=` / `drop=` は 400 で拒否されます
  
* 未知のクエリパラメータは `400 InvalidRequest` で拒否されます
  
* `attrs` / `keep` / `drop` の属性名はリクエストの `@context` に対して展開されます

**レスポンス**

* 成功: `204 No Content`

> **注:** GeonicDB は distributed operations (context source への purge 転送) をサポートしません。purge は常にローカルストレージに対して実行されます (`csf` は受理されますが転送は行われません)。

> **GeonicDB 独自拡張 (後方互換):** `POST /ngsi-ld/v1/entityOperations/purge` も引き続き利用可能です。

#### Batch Query

```http
POST /ngsi-ld/v1/entityOperations/query
Content-Type: application/json
```

**リクエストボディ**

```json
{
  "type": "Room",
  "attrs": ["temperature"],
  "q": "temperature>20",
  "geoQ": {
    "georel": "within",
    "geometry": "Polygon",
    "coordinates": [[[138, 34], [141, 34], [141, 37], [138, 37], [138, 34]]]
  }
}
```

ボディは `orderBy` (v1.9.1 Entity Ordering Language、例: `"orderBy": "temperature;desc"` — [Entity Ordering (orderBy)](#entity-ordering-orderby) を参照) および従来の `orderDirection` (`asc` / `desc`) も受け付けます。文字列でない `orderBy` または無効な `orderDirection` は `400` で拒否されます (#1681)。

**レスポンス**: エンティティの配列

> **GeoJSON 出力 (#1783)**: ETSI GS CIM 009 clause 6.3.4 は "Query Entity" (clause 5.7.2) — この操作が実装するもの — を GeoJSON 対象操作の中にリストしています。`format=geojson` (クエリパラメータ) または `Accept: application/geo+json` をネゴシエートすると、`Content-Type: application/geo+json` で GeoJSON **FeatureCollection** が返され、`GET /ngsi-ld/v1/entities` と**同じ形式**になります (同じ `NgsiLdGeoJsonTransformer`、同じページネーションヘッダ: `Link` / `NGSILD-Results-Count`)。`splitEntities` (型ごとにグループ化されたネストした配列) は FeatureCollection として表現できないため、GeoJSON がそれより優先されます — これは `GET /entities` がすでに適用しているのと同じ優先順位です。リストおよび単一取得エンドポイントと同様に、`properties` キーと `properties.type` はリクエストの `@context` で圧縮されます (#1788 サブ項目 6、上記の [Retrieve Entity List](#retrieve-entity-list) の注記を参照)。

#### Batch Merge

```http
POST /ngsi-ld/v1/entityOperations/merge
Content-Type: application/ld+json
```

Merge-Patch セマンティクスを使用して複数のエンティティに対する一括更新を実行します。既存の属性はマージされ、リクエストに含まれていない属性は保持されます。値として `urn:ngsi-ld:null` を指定すると属性が削除されます。

**リクエストボディ**

```json
[
  {
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.9.jsonld",
    "id": "urn:ngsi-ld:Room:001",
    "type": "Room",
    "temperature": { "type": "Property", "value": 25.0 }
  }
]
```

**クエリパラメータ**

| Parameter             | Description                          |
| --------------------- | ------------------------------------ |
| `options=noOverwrite` | Do not overwrite existing attributes |

**レスポンス**

* すべて成功: `204 No Content`
  
* 部分的成功: `207 Multi-Status`

***

### 時系列バッチ操作 (NGSI-LD)

> **ETSI GS CIM 009 リファレンス**: セクション 5.6.12-5.6.19 - エンティティの時系列表現

時系列エンティティのバッチ操作。1 リクエストあたり最大 **1,000** エンティティを処理できます。

> **注意**: 時系列 entityOperations の create / upsert / delete は GeonicDB 拡張機能であり、ETSI GS CIM 009 仕様には含まれていません。クエリのみが仕様準拠です。これらの拡張機能は、時系列データの一括取り込みの効率を向上させるために提供されています。

#### 時系列バッチ作成

```http
POST /ngsi-ld/v1/temporal/entityOperations/create
Content-Type: application/ld+json
```

時系列エンティティを一括作成します。リクエストボディは時系列エンティティの配列です。

**レスポンス**: すべて成功した場合は `201 Created`、部分的な失敗の場合は `207 Multi-Status`

#### 時系列バッチ Upsert

```http
POST /ngsi-ld/v1/temporal/entityOperations/upsert
Content-Type: application/ld+json
```

時系列エンティティを一括作成または更新します(既存のエンティティに属性を追加します)。

**レスポンス**: すべて成功した場合は `204 No Content`、部分的な失敗の場合は `207 Multi-Status`

#### 時系列バッチ削除

```http
POST /ngsi-ld/v1/temporal/entityOperations/delete
Content-Type: application/ld+json
```

時系列エンティティを一括削除します。リクエストボディはエンティティ ID の配列です。

**レスポンス**: すべて成功した場合は `204 No Content`、部分的な失敗の場合は `207 Multi-Status`

#### 時系列バッチクエリ

```http
POST /ngsi-ld/v1/temporal/entityOperations/query
Content-Type: application/ld+json
```

POST ベースの時系列クエリ。クエリ条件はリクエストボディで指定されます。

**リクエストボディの例**:

```json
{
  "type": "TemperatureSensor",
  "temporalQ": {
    "timerel": "after",
    "timeAt": "2024-01-01T00:00:00Z"
  }
}
```

**レスポンス**: `200 OK` - 時系列エンティティの配列

#### 時系列クエリパラメータ

以下のクエリパラメータは、時系列エンティティの GET エンドポイントで使用できます。

| Parameter        | Type    | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `timerel`        | string  | Temporal relationship operator (`after`, `before`, `between`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `timeAt`         | string  | Reference time (ISO 8601 format)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `endTimeAt`      | string  | End time (required when `timerel=between`, ISO 8601 format)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `lastN`          | integer | Return only the latest N instances per attribute (1–1000; exceeding 1000 returns 400, ETSI GS CIM 009 Section 5.6.12)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `format`         | string  | Representation format (ETSI GS CIM 009 - 6.3.12). One of `temporalValues` (simplified temporal representation, clause 4.5.9) or `aggregatedValues` (aggregated representation, clause 4.5.19); `simplified` is accepted as a synonym of `temporalValues` (GeonicDB extension). **Unknown values are rejected with `400 InvalidRequest`** (#1814). On `POST /temporal/entityOperations/query`, `aggregatedValues` is **not** supported (aggregation is not implemented for that operation) and is likewise rejected with `400`. **When both `format` and `options` are present, `format` takes precedence** (6.3.12). |
| `options`        | string  | Deprecated alternative to `format` (6.3.12). `temporalValues` / `simplified`: Simplified temporal representation (`[value, timestamp]` pairs), `aggregatedValues`: Aggregation representation (**`aggrMethods` is required when `aggregatedValues` is specified via `options` or `format`**), `sysAttrs`: include system temporal attributes (see below, #1817). Unknown tokens are rejected with `400 InvalidRequest` (6.3.20). The raw value must not exceed **200 characters** or **12 comma-separated values**; exceeding either returns `400 InvalidRequest` (#2031)                                            |
| `orderBy`        | string  | v1.9.1 Entity Ordering Language (see [Entity Ordering (orderBy)](#entity-ordering-orderby)). Combining with `aggrMethods` returns `400`; attribute-value sorting on encrypted tenants returns `400` (#1681)                                                                                                                                                                                                                                                                                                                                                                                                          |
| `orderDirection` | string  | Legacy sort direction — `asc` / `desc` only; other values return `400` (#1681)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

**lastN パラメータ**

`lastN` を指定すると、時系列データの最新 N インスタンスのみが返されます。`timerel`/`timeAt` と組み合わせることで、時間範囲内の最新 N インスタンスを取得できます。最大値は属性あたり **1000** です。それより大きい値を指定すると `400` が返されます。

**デフォルトインスタンス上限 (#1437)**: 無制限のメモリ使用を防ぐため、`lastN` が指定**されていない**場合、Context Brokerは属性あたり最大 **100** の最新インスタンスを返します。この方法でクエリが制限される場合、レスポンスには `NGSILD-Warning` (warn-code 199) が含まれます。より多くのデータを取得するには、`timeAt`/`endTimeAt` を絞り込むか、明示的に `lastN` (≤1000) を設定してください。明示的な `lastN` はそのまま適用され、切り捨て警告は**生成されません**。

```bash
# Retrieve the latest 10 temporal data instances
curl "http://localhost:3000/ngsi-ld/v1/temporal/entities/urn:ngsi-ld:Sensor:001?lastN=10" \
  -H "Fiware-Service: myservice"
```

#### 時系列レスポンスフォーマットオプション

`options=temporalValues` (または `options=simplified`) を指定すると、各属性が `values` 配列 (`[value, timestamp]` のペア) を含む簡略化された形式で返されます。

**例**: `GET /ngsi-ld/v1/temporal/entities/{entityId}?options=temporalValues`

```json
{
  "id": "urn:ngsi-ld:Sensor:1",
  "type": "Sensor",
  "temperature": {
    "type": "Property",
    "values": [[20.5, "2024-01-01T10:00:00Z"], [21.0, "2024-01-01T11:00:00Z"]]
  }
}
```

#### システム時間属性 (`options=sysAttrs`

)

ETSI GS CIM 009 clause 6.3.11 は、`/temporal/entities/` および**そのすべてのサブリソース**、ならびに clause 5.7.4 の POST クエリにおいて `options=sysAttrs` のサポートを要求しています。要求された場合、**正規化**された表現の各属性インスタンスは、システムが生成した時間属性 `createdAt` / `modifiedAt`(および時間的 TTL が設定されている場合は `expiresAt`)を保持します:

```json
{
  "id": "urn:ngsi-ld:Sensor:1",
  "type": "Sensor",
  "temperature": [
    {
      "type": "Property",
      "value": 20.5,
      "observedAt": "2024-01-01T10:00:00Z",
      "instanceId": "urn:ngsi-ld:attribute:instance:...",
      "createdAt": "2024-01-01T09:00:00Z",
      "modifiedAt": "2024-01-01T09:00:00Z"
    }
  ]
}
```

Context Brokerが保持していない値は単に省略されます — clause 6.3.11 では\*「実装は、システムが生成した時間属性を保持していない場合、エラーを発生させてはならない」\*と述べられています。同じ理由で、`sysAttrs` は簡易表現(`temporalValues`、clause 4.5.9 の `[value, timestamp]` ペア)および集約表現(clause 4.5.19)に対して**受け入れられ無視されます**(決して `400` にはなりません)。これらの表現はその構造内にシステム属性を保持する場所がありません。

#### 時間レスポンスにおける名前の圧縮 (#1975 / #1788)

時間レスポンスにおける**属性名とエンティティ `type`** の両方は、*そのリクエスト*によって提供された `@context` で圧縮されます(ETSI GS CIM 009 clause 5.5.7 / 5.5.5)。属性名は #1975 以降圧縮されています。エンティティ `type` は #1788 サブアイテム 2 まで保存された(完全修飾された)形式で返されていました — 書き込みは `normalizeTypeName` でそれを正規化するため、書き込み時に使用された短い名前が読み取り時に返される短い名前となり、同じ短い名前が `?type=` でマッチします。

リクエストが `@context` を提供しない場合(またはコアコンテキストのみの場合)、圧縮先が存在しないため、名前は完全修飾 URI としてレンダリングされます — これは clause 5.5.7 のフォールバックであり、不具合ではありません。#1975 以前に書き込まれた属性名(レガシー、逐語的ストレージ)は、書き込み時に使用された `@context` が記録されていないため、保存されたままの形式で返されます。

#### 時間集約クエリ(単一エンティティ)

集約クエリは、`aggrMethods` および `aggrPeriodDuration` クエリパラメータを使用して時間エンティティ GET エンドポイントで実行できます。リスト取得エンドポイントと単一エンティティ取得エンドポイントの両方で利用可能です。
`options` または `format` 経由で集約表現を要求するには、`aggrMethods` とともに `options=aggregatedValues` または `format=aggregatedValues` を指定します。

> **GeonicDB 拡張(後方互換性)**: ETSI は `aggrMethods` が\*「`format` または `options` パラメータに `aggregatedValues` が存在する場合にのみ適用可能」*であると述べていますが、それなしで提供された場合に何が起こるかは定義していません。GeonicDB はその歴史的動作を維持しています:**`format` も `options` も表現キーワードを保持していない場合、`aggrMethods` の存在は `aggregatedValues` を暗黙的に指定します**。いずれかのパラメータが表現キーワードを保持すると、解決された表現のみがレスポンスを駆動します — したがって、`format=temporalValues&options=aggregatedValues&aggrMethods=sum` は集約ではなく*簡易\*時間表現を返します(ETSI テスト `021_19_02`)。

> **`POST /temporal/entityOperations/query` は集約しません (#2030)**: この操作では集約は実装されていません。そこで `aggrMethods` / `aggrPeriodDuration` を提供すると、集約リクエストが無視されたことを示す `NGSILD-Warning` ヘッダー(RFC 7234 warn-code 199)とともに、非集約表現で `200` が返されます — 暗黙的に削除するのではなく。公式 CLI が現在この形式を送信しているため(geolonia/geonicdb-cli#188)、これは `400` では**ありません**。集約には `format=aggregatedValues` を指定した `GET /temporal/entities` を使用してください。

| Parameter            | Type   | Description                                                                                                         |
| -------------------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| `aggrMethods`        | string | Aggregation methods (comma-separated): `totalCount`, `distinctCount`, `sum`, `avg`, `min`, `max`, `stddev`, `sumsq` |
| `aggrPeriodDuration` | string | ISO 8601 duration (e.g., `PT1H` for 1 hour). Required when `aggrMethods` is specified                               |

**例**: `GET /ngsi-ld/v1/temporal/entities/{entityId}?aggrMethods=avg&aggrPeriodDuration=PT1H&timerel=after&timeAt=2024-01-01T00:00:00Z&options=aggregatedValues`

```json
{
  "id": "urn:ngsi-ld:Sensor:1",
  "type": "Sensor",
  "temperature": {
    "type": "Property",
    "avg": [
      [21.0, "2024-01-01T10:00:00Z", "2024-01-01T11:00:00Z"]
    ]
  }
}
```

形式は ETSI GS CIM 009 clause 4.5.19.0 に従います:**要求された集約メソッドごとに 1 つのメンバーがあり、メソッド名でキー付けされ**、その値は期間ごとに 1 つの要素を持つ配列であり、**各期間は正確に 3 つの要素の配列**です — 集約された値、開始 `DateTime`、終了 `DateTime`。したがって、複数のメソッド(`aggrMethods=avg,max`)を要求すると、それぞれ 1 つのメンバーが生成されます:

```json
{
  "id": "urn:ngsi-ld:Sensor:1",
  "type": "Sensor",
  "temperature": {
    "type": "Property",
    "avg": [[21.0, "2024-01-01T10:00:00Z", "2024-01-01T11:00:00Z"]],
    "max": [[30.0, "2024-01-01T10:00:00Z", "2024-01-01T11:00:00Z"]]
  }
}
```

> **破壊的変更 (#1815)**: この変更前、GeonicDB は独自の形式 (`{"values": [{"@value": {"avg": 21.0}, "observedAt": ..., "endAt": ...}]}`) を返していました。`values[].@value` を解析していたクライアントは、上記のメソッドキー付きメンバーに切り替える必要があります。
>
> **注意**: `aggrPeriodDuration` なしで `aggrMethods` を指定すると、`400 Bad Request` エラーが返されます。
>
> **注意**: `aggrMethods` なしで `aggregatedValues` を指定すると (`options=aggregatedValues` または `format=aggregatedValues` のいずれか)、`400 Bad Request` エラーが返されます。

> **注意**: 集約クエリは **暗号化されたテナントではサポートされていません** (`encryptionEnabled: true` のテナント)。属性値は保存時に暗号化されているため、MongoDB の集約パイプラインは暗号化されたデータに対して数値演算を実行できません。暗号化されたテナントで集約をリクエストすると `400 Bad Request` が返されます。復号化された値を取得してアプリケーション層で集約を実行するには、`temporalValues` エンドポイントを使用してください。

***

### エンティティ型操作 (NGSI-LD)

#### 型リストの取得

> **ETSI GS CIM 009 Reference**: clause 5.7.4 - Retrieve Available Entity Types

```http
GET /ngsi-ld/v1/types
```

**パラメーター**: `limit`, `offset`, `details`

`details` を指定しない場合、レスポンスは生の配列ではなく **`EntityTypeList` オブジェクト** (ETSI OpenAPI v1.8.1) となります:

**レスポンス** (200, `details` 未指定):

```json
{
  "id": "urn:ngsi-ld:EntityTypeList:34kj2l4-a8s7-...",
  "type": "EntityTypeList",
  "typeList": ["Room", "Sensor"],
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.9.jsonld"
}
```

`details=true` (または `options=details`) を指定すると、代わりに `EntityType` オブジェクトの配列が返されます:

**レスポンス** (200, `details=true`):

```json
[
  {
    "id": "https://uri.etsi.org/ngsi-ld/default-context/Room",
    "type": "EntityType",
    "typeName": "Room",
    "attributeNames": ["temperature", "pressure"],
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.9.jsonld"
  }
]
```

> **破壊的変更 (#1694)**: 従来は `details` 未指定でも上記の詳細配列を返していましたが、
> ETSI OpenAPI v1.8.1 準拠のため `details` 未指定時のレスポンスを `EntityTypeList`
> オブジェクトに変更しました。配列形式が必要なクライアントは `details=true` を指定してください。

> **名前の compaction (#1977) と `id` の FQN 化 (#1989)**: `typeList` の型名、および `details=true` 時の `typeName` / `attributeNames` は、**そのリクエストが渡した `@context`**(`Link` ヘッダー)を基準に compact して返されます (ETSI GS CIM 009 clause 5.5.7 / 5.7.5)。`id` は compact されず**保存名から復元した FQN** を返します — Table 5.2.25-1 が `id` を "Fully Qualified Name (FQN) of the entity type being described"、`typeName` を "short name if contained in @context" と**別の値**として定義しているためです(例: `@context` 無しで型 `Room` の `id` は `https://uri.etsi.org/ngsi-ld/default-context/Room`。`location` / `value` 等の core 組み込み語彙は `@vocab` ではなく `https://uri.etsi.org/ngsi-ld/<名前>` へ展開されます)。
>
> **既知の制限 (#1975 で部分解消)**: temporal コレクション由来の属性名のうち、**#1975 で canonical 保存されたもの**([Temporal API](#temporal-api-time-series-data) 参照)はここでも応答 `@context` で compact され、`id` も FQN へ復元されます。それ以前 (移行前) に verbatim 保存された属性名は、書き込み時の `@context` を保存していないため compact / FQN 化されず、保存形のまま返ります。

**ヘッダー**: 総数は `NGSILD-Results-Count` で返されます (`count=true` の場合)

#### 型詳細の取得

```http
GET /ngsi-ld/v1/types/{typeName}
```

**レスポンス** (200):

```json
{
  "id": "https://uri.etsi.org/ngsi-ld/default-context/Room",
  "type": "EntityTypeInfo",
  "typeName": "Room",
  "entityCount": 5,
  "attributeDetails": [
    {
      "id": "https://uri.etsi.org/ngsi-ld/default-context/temperature",
      "type": "Attribute",
      "attributeName": "temperature",
      "attributeTypes": ["Property"]
    }
  ],
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld"
}
```

> **名前の compaction (#1977) と `id` の FQN 化 (#1989)**: `typeName` と `attributeDetails[].attributeName` は、**そのリクエストが渡した `@context`**(`Link` ヘッダー)を基準に compact して返されます (ETSI GS CIM 009 clause 5.5.7 / 5.7.6)。`id` / `attributeDetails[].id` は compact されず**保存名から復元した FQN** を返します — Table 5.2.26-1 / 5.2.28-1 が `id` を FQN("Full URI of attribute name")、`typeName` / `attributeName` を短縮名と**別の値**として定義しているためです(例: `@context` 無しで型 `Room` の `id` は `https://uri.etsi.org/ngsi-ld/default-context/Room`、属性 `temperature` の `id` は `https://uri.etsi.org/ngsi-ld/default-context/temperature`)。`attributeDetails[].attributeName` は #1977 で追加したフィールドです(Table 5.2.26-1 は要素を `id` / `type` / `attributeName` / `attributeTypes` と定めています)。
>
> **既知の制限 (#1975 で部分解消)**: temporal コレクション由来の属性名のうち、**#1975 で canonical 保存されたもの**([Temporal API](#temporal-api-time-series-data) 参照)はここでも応答 `@context` で compact され、`id` も FQN へ復元されます。それ以前 (移行前) に verbatim 保存された属性名は、書き込み時の `@context` を保存していないため compact / FQN 化されず、保存形のまま返ります。

**エラー**: 404 (型が存在しない場合)

### 属性操作 (NGSI-LD)

#### 属性リストの取得

> **ETSI GS CIM 009 Reference**: clause 5.7.6 - Retrieve Available Attributes

```http
GET /ngsi-ld/v1/attributes
```

**パラメーター**: `limit`、`offset`、`details`

`details` なしの場合、レスポンスは素の配列ではなく **`AttributeList` オブジェクト** (ETSI OpenAPI v1.8.1) です:

**レスポンス** (200、`details` 未指定):

```json
{
  "id": "urn:ngsi-ld:AttributeList:98fj3k2-b1c4-...",
  "type": "AttributeList",
  "attributeList": ["temperature", "pressure"],
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.9.jsonld"
}
```

`details=true` (または `options=details`) を指定すると、代わりに `Attribute` オブジェクトの配列が返されます:

**レスポンス** (200、`details=true`):

```json
[
  {
    "id": "https://uri.etsi.org/ngsi-ld/default-context/temperature",
    "type": "Attribute",
    "attributeName": "temperature",
    "typeNames": ["Room", "Sensor"],
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.9.jsonld"
  }
]
```

> **破壊的変更 (#1694)**: 従来は `details` 未指定でも上記の詳細配列を返していましたが、
> ETSI OpenAPI v1.8.1 準拠のため `details` 未指定時のレスポンスを `AttributeList`
> オブジェクトに変更しました。配列形式が必要なクライアントは `details=true` を指定してください。

> **名前の compaction (#1977) と `id` の FQN 化 (#1989)**: `attributeList` の属性名、および `details=true` 時の `attributeName` / `typeNames` は、**そのリクエストが渡した `@context`**(`Link` ヘッダー)を基準に compact して返されます (ETSI GS CIM 009 clause 5.5.7 / 5.7.9)。`id` は compact されず**保存名から復元した FQN**を返します(Table 5.2.28-1: "Full URI of attribute name"。例: `@context` 無しで属性 `temperature` の `id` は `https://uri.etsi.org/ngsi-ld/default-context/temperature`)。

**ヘッダー**: 総数は `NGSILD-Results-Count` で返されます (`count=true` の場合)

#### 属性詳細の取得

```http
GET /ngsi-ld/v1/attributes/{attrName}
```

**レスポンス** (200):

```json
{
  "id": "https://uri.etsi.org/ngsi-ld/default-context/temperature",
  "type": "Attribute",
  "attributeName": "temperature",
  "attributeCount": 5,
  "typeNames": ["Room", "Sensor"],
  "attributeTypes": ["Property"],
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld"
}
```

> **名前の compaction (#1977) と `id` の FQN 化 (#1989)**: `attributeName` / `typeNames` は、**そのリクエストが渡した `@context`**(`Link` ヘッダー)を基準に compact して返されます (ETSI GS CIM 009 clause 5.5.7 / 5.7.10)。`id` は compact されず**保存名から復元した FQN**を返します(Table 5.2.28-1: "Full URI of attribute name"。例: `@context` 無しで属性 `temperature` の `id` は `https://uri.etsi.org/ngsi-ld/default-context/temperature`)。

**エラー**: 404 (属性が存在しない場合)

***

### サブスクリプション (NGSI-LD)

> **ETSI GS CIM 009 リファレンス**: セクション 5.8 - サブスクリプション操作

#### サブスクリプションの作成

```http
POST /ngsi-ld/v1/subscriptions
Content-Type: application/ld+json
```

**HTTP 通知の例**

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "type": "Subscription",
  "entities": [
    { "type": "Room" }
  ],
  "watchedAttributes": ["temperature"],
  "q": "temperature>25",
  "notification": {
    "format": "normalized",
    "endpoint": {
      "uri": "https://webhook.example.com/notify",
      "accept": "application/ld+json"
    }
  }
}
```

**MQTT 通知の例**

NGSI-LD では、エンドポイント URI に `mqtt://` または `mqtts://` スキームを使用し、トピックをパスとして指定します。MQTT 固有の設定は `notifierInfo` で指定します。

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "type": "Subscription",
  "entities": [
    { "type": "Room" }
  ],
  "watchedAttributes": ["temperature"],
  "notification": {
    "format": "normalized",
    "endpoint": {
      "uri": "mqtt://broker.example.com:1883/sensors/room/temperature",
      "notifierInfo": [
        { "key": "MQTT-Version", "value": "mqtt5.0" },
        { "key": "MQTT-QoS", "value": "1" }
      ]
    }
  }
}
```

**MQTT notifierInfo 設定**

| Key            | Value                    | Description           |
| -------------- | ------------------------ | --------------------- |
| `MQTT-Version` | `mqtt3.1.1` or `mqtt5.0` | MQTT protocol version |
| `MQTT-QoS`     | `0`, `1`, or `2`         | QoS level             |

**サブスクリプション拡張フィールド**

| Field                           | Type                         | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cooldown`                      | integer                      | Minimum interval between notifications (seconds). Positive integers only. Will not re-notify within the specified number of seconds                                                                                                                                                                                                                                                                                                                                                           |
| `notificationTrigger`           | string\[]                    | Event types that trigger notifications. `entityCreated`, `entityUpdated`, `entityChanged`, `entityDeleted`, `attributeCreated`, `attributeUpdated`, `attributeDeleted`. `entityChanged` is only triggered when attribute values actually change (updates with the same value are ignored)                                                                                                                                                                                                     |
| `showChanges`                   | boolean                      | If `true`, includes type-specific previous-members in notification attributes (`normalized` / `concise`): `previousValue` (Property/GeoProperty/TemporalProperty), `previousObject` (Relationship), `previousLanguageMap`, `previousVocab`/`previousVocabMap` (GeonicDB extension for `vocabMap` shape), `previousValueList`, `previousObjectList`, `previousJson`. `keyValues` cannot represent sub-attributes, so previous-members are omitted                                              |
| `notification.onlyChangedAttrs` | boolean                      | If `true`, includes only attributes that have actually changed in the notification payload. Can be combined with `notification.attributes`                                                                                                                                                                                                                                                                                                                                                    |
| `notification.pick`             | string\[]                    | Unified NGSI-LD projection (ETSI GS CIM 009 clause 4.21): attribute names to **include** in the notification payload. Maps to the same internal include projection as `notification.attributes` / `attrs`                                                                                                                                                                                                                                                                                     |
| `notification.omit`             | string\[]                    | Unified NGSI-LD projection (ETSI GS CIM 009 clause 4.21): attribute names to **exclude** from the notification payload. Maps to the same internal exclude projection as `notification.exceptAttrs`                                                                                                                                                                                                                                                                                            |
| `jsonldContext`                 | string (dereferenceable URI) | JSON-LD `@context` URI used when sending notifications (ETSI GS CIM 009 Table 5.2.12-1). If omitted, GeonicDB uses the `@context` applied to the subscription — the one supplied at creation, **or on a later `PATCH` (#2029)** — falling back to the NGSI-LD core context when neither carried one. It is delivered with every notification and compacts both the entity type and the attribute names in `data[]` (one resolved value drives all three; see "Notification `@context`" below) |
| `expiresAt`                     | string (ISO 8601)            | Subscription expiration time                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

**通知 `@context`** (#1841 / #1788, ETSI GS CIM 009 clause 5.3.1 / 5.8.1.4 / 5.8.6)

*どの `@context` が使用されるか。* 2 つの異なるもので、それぞれ異なる受け入れ可能な形式があります:

| Source                                                                     | Accepted shape                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jsonldContext` (explicit)                                                 | **a single dereferenceable URI string only** — a non-URI string, an inline object or an array is rejected with `400 BadRequestData` at create/update time (the field is typed `z.string()`, and non-URI strings are rejected by an explicit absolute-IRI check) |
| the subscription request `@context` (used when `jsonldContext` is omitted) | whatever a request `@context` may be: a URI, an **inline object**, or an **array** mixing both                                                                                                                                                                  |
| neither present                                                            | the NGSI-LD core `@context` (clause 5.5.5)                                                                                                                                                                                                                      |

*GeonicDB がどのように配信するか。* GeonicDB 自体が付加するコンテキストは**正確に一度だけ**配信されます —
本文と `Link` ヘッダーの両方に同時に含まれることはありません。なぜなら、2 つのソースがあると受信者が有効な `@context` について一致しない可能性があるためです:

| `notification.endpoint.accept`    | Delivery                                                     |
| --------------------------------- | ------------------------------------------------------------ |
| `application/ld+json`             | `@context` member in the notification body                   |
| `application/json` (default)      | `Link` header (`rel="http://www.w3.org/ns/json-ld#context"`) |
| MQTT endpoints                    | `@context` member in the body (MQTT has no headers)          |
| `httpCustom` (`payload` / `json`) | neither — the body is defined entirely by the user           |

`Link` ヘッダーでは完全に運ぶことができない解決済みの `@context`(インラインオブジェクト、または URL とインラインオブジェクトを混在させた配列 — どちらも上記のリクエスト `@context` を通してのみ到達可能)は配置されます

`application/json` の場合でもボディに記述されます。`Link` は URI のみを参照でき、URL 部分だけを出力するとインラインで定義された用語が黙って削除されてしまいます。

「厳密に1回」は **GeonicDB 自身のコンテキスト配信** を制約するものであり、通知全体を制約するものではありません。`notification.endpoint.receiverInfo` は独自の `Link` ヘッダーを追加することができ、これは生成されたコンテキスト `Link` に追加されます(置き換えることはありません)。そのため、ボディの `@context` とカスタム `Link` ヘッダーは共存できます。

`data[]` の属性名は同じ `@context` で圧縮されます(条項 5.5.7)。そのため、通知とその `@context` で発行された `GET` は属性名を同一に綴ります。完全修飾 IRI として格納された名前は圧縮され、ベアな格納名はそのまま渡されます。

NGSIv2 サブスクリプションは `@context` メンバーや `Link` ヘッダーを受け取りません。

**`q` / `geoQ` によるフィルタリング**

* `q` と `geoQ` は、どのエンティティ変更が通知を発火するかを制限します。評価には `GET /ngsi-ld/v1/entities` と同じ述語ビルダーが使用されます
  
* `geoQ.coordinates` は文字列または GeoJSON 形式の配列を受け入れます。これには `LineString` / `Polygon` で使用されるネストされた形式が含まれます。`geoQ.geoproperty` は GeoProperty を選択します(デフォルトは `location`)
  
* `EntityDeleted` 通知は `q` / `geoQ` でフィルタリングされません(エンティティがもはや存在しないため、述語を評価できません)。完全なセマンティクスと制限については [SUBSCRIPTIONS.md](../features/ngsi-subscriptions.md) を参照してください

**検証**

* `watchedAttributes` と `timeInterval` は相互排他的です。両方を同時に指定すると `400 Bad Request` が返されます(ETSI GS CIM 009 V1.9.1 条項 5.8.1)
  
* `throttling` と `timeInterval` は相互排他的です(異なる動作モード)。両方を指定すると `400 Bad Request` が返されます(#1618)
  
* 通知プロジェクションセレクターは **include** ファミリー(`notification.pick` / `notification.attributes` / `notification.attrs`)と **exclude** ファミリー(`notification.omit` / `notification.exceptAttrs`)に分かれます。各ファミリーごとに最大1つのセレクターを指定でき、include セレクターと exclude セレクターを組み合わせることはできません(`pick` / `omit` は ETSI GS CIM 009 条項 4.21 により相互排他的)。違反すると `400 Bad Request` が返されます(#1627)
  
* `notification.pick` は内部 include プロジェクション(= `attributes` / `attrs`)にマップされ、`notification.omit` は内部 exclude プロジェクション(= `exceptAttrs`)にマップされます。両方とも実際には通知ペイロードに適用されます(#1627、#1618 で追加された一時的な `400` 拒否に優先します)
  
* `PATCH` の場合、通知プロジェクションは JSON Merge Patch (RFC 7396 / ETSI GS CIM 009 条項 5.8.2)に従います。セレクターを**省略**すると既存のプロジェクションが保持され、**配列**を送信すると置き換えられ、**`null`** を送信すると(例: `"pick": null` / `"omit": null` / `"exceptAttrs": null`)プロジェクションがクリアされ、通知は再びすべての属性を運ぶようになります。`null` は明確な信号であるため、include / exclude の排他性チェックから免除されます。したがって、`pick: null` を `omit` 値と組み合わせることで、同じリクエストで include プロジェクションをクリアし、exclude プロジェクションを設定できます。空配列 `[]` はクリアメカニズムでは**ありません**。すべてのセレクターは空でない配列を必要とするため、クリアするには `null` を使用してください(#1635)
  
* `jsonldContext` は単一の参照可能な URI 文字列でなければなりません(ETSI GS CIM 009 Table 5.2.12-1)。非 URI 文字列は `400 BadRequestData` を返します。参照の失敗(DNS / 到達不能ホスト)は `504 LdContextNotAvailable` を返します。SSRF でブロックされた宛先は引き続き `400 BadRequestData` を返します
  
* 無効な `q`(解析不可能な条件)と無効な `geoQ`(未知の `georel`、範囲外の座標、または `georel` / `geometry` / `coordinates` がまとめて指定されていない)は `400 Bad Request` を返します。以前はこれらは `201` で受け入れられ、その後無視されていました

**レスポンス**

* ステータス: `201 Created`
  
* ヘッダー: `Location: /ngsi-ld/v1/subscriptions/{subscriptionId}`

#### サブスクリプションリスト

```http
GET /ngsi-ld/v1/subscriptions
```

**クエリパラメータ**

| Parameter | Type    | Description                   | Default |
| --------- | ------- | ----------------------------- | ------- |
| `limit`   | integer | Number of results to retrieve | 20      |
| `offset`  | integer | Offset                        | 0       |

#### サブスクリプションの取得

```http
GET /ngsi-ld/v1/subscriptions/{subscriptionId}
```

**通知ステータスフィールド(読み取り専用)**

| Field                            | Type    | Description                                                                               |
| -------------------------------- | ------- | ----------------------------------------------------------------------------------------- |
| `notification.status`            | string  | `ok` or `failed`                                                                          |
| `notification.lastNotification`  | string  | Date and time of last notification sent (ISO 8601)                                        |
| `notification.lastFailure`       | string  | Date and time of last notification failure (ISO 8601)                                     |
| `notification.lastFailureReason` | string  | Reason for the last failure (e.g., `HTTP 500: Internal Server Error`). Cleared on success |
| `notification.lastSuccess`       | string  | Date and time of last successful notification (ISO 8601)                                  |
| `notification.timesSent`         | integer | Number of notifications sent                                                              |

**リトライ動作**: 通知配信が失敗した場合、一時的なエラー(5xx、ネットワークエラー)に対して指数バックオフ(1秒、2秒、4秒)で最大 3 回のリトライが実行されます。4xx エラーに対してはリトライは実行されません。

#### サブスクリプションの更新

```http
PATCH /ngsi-ld/v1/subscriptions/{subscriptionId}
```

**レスポンス**: `204 No Content`

#### サブスクリプションの削除

```http
DELETE /ngsi-ld/v1/subscriptions/{subscriptionId}
```

**レスポンス**: `204 No Content`

#### 所有権検証 (GeonicDB 拡張)

認証が有効な場合(デフォルト)、サブスクリプションの更新 (PATCH) と削除 (DELETE) 操作は `createdBy` フィールドに基づいて所有権検証を実行します。作成者以外のユーザーがこれらの操作を試みると `403 Forbidden` を受け取ります。`super_admin` と `tenant_admin` ロールはこの検証をバイパスできます。詳細については [AUTH.md](../reference/auth.md) を参照してください。

***

### 登録 (NGSI-LD)

NGSI-LD では、外部コンテキストプロバイダは Context Source Registration として登録されます。

#### 登録の作成

```http
POST /ngsi-ld/v1/csourceRegistrations
Content-Type: application/ld+json
```

> **`endpoint` はベース URI (`{apiRoot}`) を指定する。** ETSI GS CIM 009 clause 6.2 は全リソース URI が `{apiRoot}/ngsi-ld/v1/` の下に来ると規定しており、`/ngsi-ld/v1/...` は転送する側 (GeonicDB) が付ける。転送先が NGSI-LD として扱われるか NGSIv2 として扱われるかは **`endpoint` の文字列ではなく、登録を作成した API** で決まる — `/ngsi-ld/v1/csourceRegistrations` で作った登録は NGSI-LD として、`/v2/registrations` で作った登録は NGSIv2 として転送される (#1763)。`endpoint` の**パスプレフィクス**は転送 URL に保たれる (#1879) — `http://host/broker-a/` を登録すると転送先は `http://host/broker-a/ngsi-ld/v1/entities` になり、パスベースでルーティングする API ゲートウェイ配下の context source を登録できる。互換のため、`endpoint` が API ルート (`/ngsi-ld/v1` または `/v2`) で終わる場合はそれを `{apiRoot}` の一部とみなさず取り除く — 既に `http://host/ngsi-ld/v1` の形で登録済みの registration は従来どおり転送される (`/ngsi-ld/v1/ngsi-ld/v1/entities` にはならない)。

**リクエストボディ**

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "type": "ContextSourceRegistration",
  "registrationName": "Weather Data Provider",
  "description": "Provides weather data for the region",
  "endpoint": "http://context-provider:8080/",
  "information": [
    {
      "entities": [{ "type": "WeatherObserved" }],
      "propertyNames": ["temperature", "humidity"],
      "relationshipNames": ["observedBy"]
    }
  ],
  "observationInterval": {
    "start": "2020-01-01T00:00:00Z",
    "end": "2030-12-31T23:59:59Z"
  },
  "location": {
    "type": "Polygon",
    "coordinates": [[[139.5, 35.5], [140.0, 35.5], [140.0, 36.0], [139.5, 36.0], [139.5, 35.5]]]
  },
  "expiresAt": "2040-12-31T23:59:59.000Z",
  "mode": "inclusive"
}
```

**リクエストフィールド**

| Field                 | Type         | Required | Description                                                                                                                                                                                                                                                                                                                                  |
| --------------------- | ------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                  | string (URI) | -        | Client-settable registration identifier. If provided it is used as-is; re-registering an existing `id` returns `409 Conflict`. If omitted, the server generates a `urn:ngsi-ld:ContextSourceRegistration:{uuid}`.                                                                                                                            |
| `type`                | string       | ✓        | Fixed: `ContextSourceRegistration`                                                                                                                                                                                                                                                                                                           |
| `registrationName`    | string       | -        | Registration name                                                                                                                                                                                                                                                                                                                            |
| `description`         | string       | -        | Registration description                                                                                                                                                                                                                                                                                                                     |
| `endpoint`            | string       | ✓        | Provider endpoint URL                                                                                                                                                                                                                                                                                                                        |
| `information`         | array        | ✓        | Provided information (entities, propertyNames, relationshipNames)                                                                                                                                                                                                                                                                            |
| `observationInterval` | object       | -        | Observation interval (start, end)                                                                                                                                                                                                                                                                                                            |
| `managementInterval`  | object       | -        | Management interval (start, end)                                                                                                                                                                                                                                                                                                             |
| `location`            | GeoJSON      | -        | Geographic scope                                                                                                                                                                                                                                                                                                                             |
| `expiresAt`           | string       | -        | Expiration time (ISO 8601 format)                                                                                                                                                                                                                                                                                                            |
| `status`              | string       | -        | Status (`active` / `inactive`)                                                                                                                                                                                                                                                                                                               |
| `mode`                | string       | -        | Mode (`inclusive` / `exclusive` / `redirect` / `auxiliary`)                                                                                                                                                                                                                                                                                  |
| `operations`          | string\[]    | -        | Supported API operations (ETSI GS CIM 009 clause 4.20). Any operation names are accepted, e.g. group names (`federationOps`) or individual operations (`retrieveEntity`, `createBatch`). When omitted it is stored/returned as absent and treated as the implicit default `federationOps` (the field is not materialized into the response). |

**レスポンス**

* ステータス: `201 Created`
  
* ヘッダ: `Location: /ngsi-ld/v1/csourceRegistrations/{registrationId}`
  
* ステータス: `409 Conflict` — クライアントが指定した同じ `id` を持つ登録が既に存在します

#### 登録リストの取得

```http
GET /ngsi-ld/v1/csourceRegistrations
```

**クエリパラメータ**

| Parameter | Type    | Description                                                                                                                   | Default |
| --------- | ------- | ----------------------------------------------------------------------------------------------------------------------------- | ------- |
| `id`      | string  | Comma-separated Context Source Registration ids (NGSI-LD URIs)                                                                | -       |
| `type`    | string  | Entity type selector. Expanded with the request `@context` before matching                                                    | -       |
| `attrs`   | string  | Comma-separated attribute names (`propertyNames` / `relationshipNames`). Expanded with the request `@context` before matching | -       |
| `limit`   | integer | Number of results to retrieve                                                                                                 | 20      |
| `offset`  | integer | Offset                                                                                                                        | 0       |
| `count`   | string  | `true` to return the total count in `NGSILD-Results-Count`                                                                    | -       |

> **`type` と `attrs` は AND で組み合わされる (#1892)。** 両方を指定すると「その型を提供し、**かつ** その属性を提供する」登録だけが返る (以前は OR だった)。`id` も他の条件と AND。
>
> **`@context` による term ⇄ URI 変換 (#1800 / #1890)。** ETSI GS CIM 009 clause 5.5.7 に従い、`type` / `attrs` はリクエストの `@context` (`Link` ヘッダ) で展開してから照合し、応答の `information[].entities[].type` / `propertyNames` / `relationshipNames` はリクエストの `@context` で compact して返す。したがって登録時と別の `@context` を使っても、同じ URI を指す term でヒットし、その `@context` の語彙で返る。完全修飾 URI での照会も可能。
>
> 属性名の照合インデックスは **登録時の表記と展開後の URI の両方**を保持する。federation の転送マッチ (`findMatchingRegistrations`) 側の展開は #1899 (PR #1996) で実装済みで、別 `@context` の同義 term でもヒットする。両持ちは登録済みデータの後方互換のために維持する。
>
> **転送先の照合で `type` を省略した場合 (#1994)。** `GET /ngsi-ld/v1/entities/{id}`(かつローカルに当該エンティティが存在しない)や一覧クエリで `type` を指定しないとき、照合する型は**未確定**として扱われ、**型で絞らずに全 active 登録が転送候補**になる。
>
> ただし**一覧クエリについては、行レベルの読み取り述語 (`readableEntityFilter`) を持つ制限付き principal では従来の保守的な照合を維持する** — federation でマージされるリモートエンティティはこの述語を通らないため、候補集合を広げると読めないはずの型のエンティティが混ざりうるため (#2003 で追跡)。単一取得 (`/entities/{id}`) の経路にはそもそも行レベル述語が無く (`checkEntityOwnership` のみ)、`type` を明示した場合の転送は本変更以前から行われていたため、この例外は適用されない。`ContextSourceRegistration` に保存される `'*'` は「**登録側**が任意の型を受け付ける」ことを表す値であり、「照合側の型が未確定」を意味しない — 両者を同一視すると、`entities` を省略した登録にしか当たらず、`entities: [{"type": "Sensor"}]` のように**型を宣言した登録へは一度も転送されない**。`type` はオプション (clause 5.7.1 / 5.7.2 — 一覧クエリは `attrs` / `q` / `georel` だけでも成立する) なので、省略できることが前提となる。`type` を明示した場合の絞り込みは従来どおり効く。

**レスポンス例**

```json
[
  {
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
    "id": "urn:ngsi-ld:ContextSourceRegistration:csr001",
    "type": "ContextSourceRegistration",
    "endpoint": "http://context-provider:8080/",
    "information": [
      {
        "entities": [{ "type": "WeatherObserved" }],
        "propertyNames": ["temperature", "humidity"]
      }
    ],
    "status": "active"
  }
]
```

#### 登録の取得

```http
GET /ngsi-ld/v1/csourceRegistrations/{registrationId}
```

#### 登録の更新

```http
PATCH /ngsi-ld/v1/csourceRegistrations/{registrationId}
```

**リクエストボディ**

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "endpoint": "http://new-provider:8080/"
}
```

**レスポンス**: `204 No Content`

#### 登録の削除

```http
DELETE /ngsi-ld/v1/csourceRegistrations/{registrationId}
```

**レスポンス**: `204 No Content`

#### 所有権検証 (GeonicDB 拡張)

認証が有効な場合 (デフォルト)、登録の更新 (PATCH) および削除 (DELETE) 操作は `createdBy` フィールドに基づいて所有権検証を実行します。作成者以外のユーザーがこれらの操作を試みた場合、`403 Forbidden` が返されます。`super_admin` および `tenant_admin` ロールはこの検証をバイパスできます。詳細については、[AUTH.md](../reference/auth.md) を参照してください。

#### CSR 高度なフィールド (ETSI GS CIM 009 V1.9.1)

Context Source Registration では、以下の高度なフィールドがサポートされています:

| Field                | Type                       | Description                                                                                                                                                                             |
| -------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cacheDuration`      | string (ISO 8601 duration) | Cache duration for responses from the context source                                                                                                                                    |
| `refreshRate`        | string (ISO 8601 duration) | Interval for periodic refresh to the context source                                                                                                                                     |
| `timeout`            | integer (ms)               | Request timeout to the context source                                                                                                                                                   |
| `contextSourceAlias` | string                     | Alias name for the context source                                                                                                                                                       |
| `contextSourceInfo`  | object\[]                  | Additional metadata for the context source                                                                                                                                              |
| `operationGroup`     | string\[]                  | Operation groups: `federationOps`, `retrieveOps`, `updateOps`, `redirectionOps`                                                                                                         |
| `operations`         | string\[]                  | Supported API operations (ETSI GS CIM 009 clause 4.20). Accepts arbitrary operation names — group names (`federationOps`) or individual operations (`retrieveEntity`, `createBatch`, …) |

### 分散オペレーション情報

#### Context Broker識別情報の取得

```http
GET /ngsi-ld/v1/info/sourceIdentity
```

コンテキストブローカーの識別情報を返します。分散環境におけるContext Brokerの識別に使用されます。

**認証**: 必須(保護あり)。`sourceIdentity` はContext Brokerの `endpoint` URL とソフトウェアバージョンを公開するため、フィンガープリンティングを制限するため認証の背後に置かれます。

**レスポンス**: `200 OK` (`application/ld+json`)

`ContextSourceIdentity` (ETSI GS CIM 009 clause 5.2.40) を返します。必須メンバー:

| Member                | Type   | Description                                                                                                                                       |
| --------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contextSourceAlias`  | string | RFC 7230 pseudonym (token). GeonicDB returns the same pseudonym as its `Via` header (`BROKER_ID`) for loop identification (clause 6.3.18)         |
| `contextSourceUptime` | string | ISO 8601 duration. Calculated from deployment start time: `BROKER_START_TIME` is preferred; if missing/invalid/future, process start time is used |
| `contextSourceTimeAt` | string | Current UTC DateTime in ISO 8601 format (millisecond precision, trailing `Z`)                                                                     |

レスポンス例:

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.9.jsonld",
  "id": "urn:ngsi-ld:ContextSourceIdentity:geonicdb-staging",
  "type": "ContextSourceIdentity",
  "contextSourceAlias": "geonicdb-staging",
  "contextSourceUptime": "PT2H3M4S",
  "contextSourceTimeAt": "2026-08-05T12:34:56.789Z",
  "name": "GeonicDB",
  "description": "FIWARE Orion-compatible Context Broker running on AWS Lambda. Supports NGSIv2 and NGSI-LD APIs for IoT/smart city context data management.",
  "endpoint": "https://geonicdb.geolonia.com",
  "supportedApi": ["ngsi-ld-v1", "ngsiv2"],
  "supportedOperations": ["federationOps", "retrieveOps", "updateOps", "redirectionOps"],
  "registrationMode": ["inclusive", "exclusive", "redirect", "auxiliary"],
  "version": "0.16.0"
}
```

> **注意 (#1585)**: `GET /ngsi-ld/v1/info/conformance` エンドポイントは以前公開されていましたが、**削除されました**。ETSI GS CIM 009 (v1.8.1 / v1.9.1) には適合クラスモデルや `/info/conformance` オペレーションが定義されておらず、唯一の規範的な `/info/*` リソースは `/info/sourceIdentity` です。このパスは現在、存在しない他の NGSI-LD リソースと同じように動作します:認証/認可されたリクエストは `404 Not Found` を受け取ります; `AUTH_ENABLED=true` でテナントに対する明示的な `role=anonymous` XACML Permit がない場合、認証されていないリクエストはルーティング前に `403` で拒否されます(そのような Permit が存在する場合、ルーティングは続行され、削除されたパスは `404` を返します)。以前の公開・非認証 `200` レスポンスはなくなりました。適合性は Orion-LD / Stellio / Scorpio と同じ方法で、アウトオブバンドで表明されます([geonicdb-compliance](https://github.com/geolonia/geonicdb-compliance) 内の固定された ETSI Test Suite 測定値を介して)。

#### 分散クエリパラメータ

| Parameter   | Type    | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `local`     | boolean | If `true`, **no Context Source Registration is considered as matching**, so the operation is answered from local data only (ETSI GS CIM 009 Table 6.3.18-1). Applies to `GET /entities`, `GET /entities/{entityId}`, `POST /entityOperations/query`, `GET /types`, `GET /types/{typeName}`, `GET /attributes` and `GET /attributes/{attrId}`. `local` is a **Boolean**: any lexical value other than `true` / `false` returns `400 BadRequestData` (#2008) |
| `localOnly` | boolean | Alias of `local`, kept for backward compatibility. When both are present, `local` wins (#2008)                                                                                                                                                                                                                                                                                                                                                             |
| `csf`       | string  | Context Source Filter expression (e.g., `name==value`, `endpoint~=pattern`)                                                                                                                                                                                                                                                                                                                                                                                |

> **`local` 受け入れ値 (#2008)**: これが配線される前は、`localOnly` のみが尊重され、仕様で定められた名前である `local` は**転送に全く影響しませんでした** — `local=true` のリクエストも登録された Context Source に到達していました。`POST /entityOperations/query` はどちらの名前も尊重していませんでした。転送は現在、単一の場所(`@api/ngsild/utils/local-scope`)で決定されるため、すべての読み取りパスが同じ方法で応答します。Boolean 以外の値は以前は黙って無視されていました(したがって転送されていました); 現在は `400 BadRequestData` を返し、`DELETE /entities` が既に行っていたことと一致します。
>
> **`/types/` と `/attributes/` も (#2036)**: 規範的な文言は\*「Context Source Registrations は一致するものとして考慮されないものとする」*であり、*「転送しない」\*ではありません。これらの発見エンドポイントは外部へのリクエストを送信しませんが、登録で宣言された型と属性名をレスポンスにマージします — `local=true` の場合、その登録由来のデータは現在除外されます。
>
> `/temporal/entities/` と `/temporal/entityOperations/` は `local` を受け入れますが、現在は no-op です:時系列読み取りパスにはフェデレーション配線がないため、既にローカルのみです。

#### 分散オペレーションレスポンスヘッダ

| Header           | Description                                                                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NGSILD-Warning` | Warning message set when some context sources fail during federation (ETSI GS CIM 009 - 6.3.6), or when forwarding was skipped due to loop detection (6.3.17/6.3.18, warn-code 199) |
| `Via`            | Loop detection header for distributed operations (ETSI GS CIM 009 - 6.3.18 / RFC 7230). The broker appends its own pseudonym as `1.1 <BROKER_ID>` to forwarded requests             |

#### ループ検出 (#1664)

ETSI GS CIM 009 - 6.3.17 / 6.3.18 に基づき、受信リクエストの `Via` ヘッダに自Context Brokerの
pseudonym (`BROKER_ID`、既定 `geonicdb`) が含まれる場合はループと判定する:


* **inclusive / auxiliary registration**: 転送をスキップしてローカル結果のみ返し、
  `NGSILD-Warning: 199 - "Loop detected: ..."` を付与する (`200 OK`)
  
* **exclusive / redirect registration**: データが外部ソースにしか存在せず転送すると
  無限ループになるため **`508 Loop Detected`** を返す (ProblemDetails
  `type: https://uri.etsi.org/ngsi-ld/errors/LoopDetected` — 508 用の型は ETSI エラー型
  registry に未定義のため、413 系と同じ規約で GeonicDB が割り当てた安定識別子)
  
* Via のパースは RFC 7230 準拠 (comment / received-protocol / ポート番号を除去して
  pseudonym を比較)。CloudFront / ALB 等の中間装置が挿入する Via エントリが混在しても
  正しく検出する
  
* ループ判定は深度判定より**先**に行われる (長い Via チェーンの本物のループでも
  silent local-only にならず 508 / Warning 199 の正しいシグナルが出る)
  
* **注意:** CDN / ALB / 企業 proxy 等の中間装置が挿入する Via エントリも深度に
  カウントされる (エントリがContext Brokerか proxy かは判別不能)。proxy 段数が深い
  デプロイ構成では実効カスケード段数がその分減るため、必要に応じて
  `FEDERATION.MAX_CASCADING_DEPTH` の引き上げを検討すること
  

* Via チェーンの長さはカスケード深度 (`FEDERATION.MAX_CASCADING_DEPTH`、既定 3) の
  判定にも使われる
  
* **federation する各デプロイには一意の `BROKER_ID` を設定すること** (`docs/ENV.md`)。
  両方既定値のままだと相互に false positive のループ検出になる

#### CSR 変更通知

Context Source Registration が作成、更新、または削除された場合、一致する CSource Subscription の通知エンドポイントに自動的に通知が送信される (ETSI GS CIM 009 - 5.11)。通知には、変更の種類を示す `Ngsild-Trigger` ヘッダーが含まれる (`csourceRegistration-created`、`csourceRegistration-updated`、`csourceRegistration-deleted`)。

通知ペイロードの `type` は `ContextSourceNotification` である (ETSI GS CIM 009 Table 5.3.2-1)。GeonicDB は `id` に対して既存の URI 規約 (`urn:ngsi-ld:Notification:<...>`) を維持しているが、これは仕様が有効な URI を要求しているものの固定プレフィックスを義務付けていないため有効である。

#### 分散型タイプおよび属性ディスカバリ

`/ngsi-ld/v1/types` および `/ngsi-ld/v1/attributes` エンドポイントは、ローカルエンティティに加えて Context Source Registration に登録されたエンティティタイプと属性を返す (ETSI GS CIM 009 - 5.9.3.3)。

### EntityMap 操作

> **ETSI GS CIM 009 リファレンス**: Section 5.14 - Entity Map

NGSI-LD EntityMap は、クエリ結果をマップとして保存し、後でエンティティ ID による効率的なアクセスを可能にする機能です。

#### EntityMap 形式でエンティティを取得

`GET /ngsi-ld/v1/entities` のクエリパラメータに `options=entityMap` を指定すると、エンティティ ID をキーとしたオブジェクトとしてレスポンスが返されます。

```bash
curl "http://localhost:3000/ngsi-ld/v1/entities?type=Room&options=entityMap" \
  -H "Fiware-Service: myservice"
```

**レスポンス例**:

```json
{
  "urn:ngsi-ld:Room:001": {
    "id": "urn:ngsi-ld:Room:001",
    "type": "Room",
    "temperature": { "type": "Property", "value": 23.5 }
  },
  "urn:ngsi-ld:Room:002": {
    "id": "urn:ngsi-ld:Room:002",
    "type": "Room",
    "temperature": { "type": "Property", "value": 21.0 }
  }
}
```

#### EntityMap を作成

```http
POST /ngsi-ld/v1/entityMaps
Content-Type: application/ld+json
```

**レスポンス**: `201 Created`、作成された EntityMap の URL が `Location` ヘッダーに含まれます

> **認可 (#1955)**: EntityMap の背後にあるクエリは **`GET /ngsi-ld/v1/entities` と同じ行レベル述語**で実行されるため、`entityIds` と `totalCount` は読み取り権限のある行のみをカバーします。読み取り可能な行がない subject は `403` を受け取ります。既存の EntityMap の**読み出し**は所有者ガードで保護されます (#1963 — 下記)。

#### EntityMap リストを取得

```http
GET /ngsi-ld/v1/entityMaps
```

> **所有者ガード (#1963)**: 非管理者 (`super_admin` / `tenant_admin` 以外) は**自分が作成した EntityMap だけ**を読み出せます。EntityMap は「クエリ結果の entityId 集合と件数」を保存するため、制限の緩い principal が作成したものを制限の強い principal が読めると、読めない行の id と `totalCount` が観測できてしまいます。`GET` (単体・一覧) / `PATCH` / `DELETE` のすべてに同じガードが掛かります。所有者不明のレガシー行は非管理者からは見えません (fail-closed)。

**クエリパラメータ**

| Parameter | Type    | Description                                        |
| --------- | ------- | -------------------------------------------------- |
| `limit`   | integer | Maximum number of results (default: 20, max: 1000) |
| `offset`  | integer | Number of results to skip (default: 0)             |

**レスポンス**: `200 OK`

#### EntityMap を取得

```http
GET /ngsi-ld/v1/entityMaps/{entityMapId}
```

**レスポンス**: `200 OK` / `404 Not Found`

> 他 principal が作成した EntityMap には **`404`** を返します (#1963)。`403` にすると「その id の EntityMap は存在する」と分かってしまい、存在自体が漏れるためです。

#### EntityMap を更新

```http
PATCH /ngsi-ld/v1/entityMaps/{entityMapId}
Content-Type: application/ld+json
```

**レスポンス**: `204 No Content`

#### EntityMap を削除

```http
DELETE /ngsi-ld/v1/entityMaps/{entityMapId}
```

**レスポンス**: `204 No Content`

### リンクされたエンティティの取得 (join/joinLevel)

エンティティ取得エンドポイント (`GET /ngsi-ld/v1/entities` および `GET /ngsi-ld/v1/entities/{entityId}`) では、`join` および `joinLevel` クエリパラメータを使用してリンクされたエンティティを取得できます。

| Parameter   | Type    | Description                                                                                                                                                             |
| ----------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `join`      | string  | Linked entity retrieval mode: `inline` (nested inside Relationship) or `flat` (appended to result array)                                                                |
| `joinLevel` | integer | Depth of linked entity resolution (default: 1, max: 5). Values above the maximum are rejected with 400 to prevent resource exhaustion from exponential link resolution. |

**使用例**

```bash
# inline mode - linked entities are nested inside the Relationship
curl "https://api.example.com/ngsi-ld/v1/entities?type=Room&join=inline&joinLevel=2" \
  -H "Fiware-Service: smartcity"

# flat mode - linked entities are appended to the result array
curl "https://api.example.com/ngsi-ld/v1/entities/urn:ngsi-ld:Room:001?join=flat&joinLevel=1" \
  -H "Fiware-Service: smartcity"
```

### コンテキストソース登録サブスクリプション

NGSI-LD において、コンテキストソース登録サブスクリプション(CSR サブスクリプション)は、コンテキストソース登録の変更を監視するサブスクリプションを管理します。

#### CSR サブスクリプションの作成

```http
POST /ngsi-ld/v1/csourceSubscriptions
Content-Type: application/ld+json
```

**リクエストボディ**

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "type": "Subscription",
  "entities": [{ "type": "Vehicle" }],
  "notification": {
    "endpoint": {
      "uri": "http://example.com/notify"
    }
  }
}
```

**リクエストフィールド**

| Field               | Type                         | Required | Description                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------- | ---------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`              | string                       | ✓        | Fixed: `Subscription`                                                                                                                                                                                                                                                                                                                                                                     |
| `entities`          | array                        | ✓        | Target entities to monitor (type, id, idPattern)                                                                                                                                                                                                                                                                                                                                          |
| `notification`      | object                       | ✓        | Notification settings (endpoint.uri is required)                                                                                                                                                                                                                                                                                                                                          |
| `description`       | string                       | -        | Subscription description                                                                                                                                                                                                                                                                                                                                                                  |
| `watchedAttributes` | array                        | -        | List of attributes to monitor                                                                                                                                                                                                                                                                                                                                                             |
| `expiresAt`         | string                       | -        | Expiration time (ISO 8601 format)                                                                                                                                                                                                                                                                                                                                                         |
| `throttling`        | number                       | -        | Notification interval (seconds)                                                                                                                                                                                                                                                                                                                                                           |
| `isActive`          | boolean                      | -        | Active state (default: true)                                                                                                                                                                                                                                                                                                                                                              |
| `jsonldContext`     | string (dereferenceable URI) | -        | JSON-LD `@context` used when sending `ContextSourceNotification`s (#2025, ETSI GS CIM 009 Table 5.2.12-1 / clause 5.8.1.4). If omitted, the `@context` applied to this csource subscription at create/update time is used, falling back to the NGSI-LD core context. Must be a single absolute IRI that GeonicDB can resolve — otherwise `400 BadRequestData`. Returned by `GET` when set |

`watchedAttributes` および `notification.attributes` は、`csourceRegistrations` 属性名と同じ `@context` 用語 ⇄ URI ルールに従います(#1890 / #1900):名前は書き込み時の `@context` でそのまま保存されます。GET レスポンスはリクエストの `@context` を使用してそれらを圧縮します。CSR 通知マッチングはエイリアスセット交差(そのまま ∪ 正規形)を使用します。

結果として生成される `ContextSourceNotification` の `@context` は、通常のサブスクリプション通知と同じ配信ルールに従います(#2025 / #1841):`notification.endpoint.accept: application/ld+json` の場合はボディに配置し、`application/json` の場合は `Link` ヘッダーに配置し、**両方に配置することはありません**。#2025 以前は、`accept` に関係なく、コア `@context` は常にボディに配置され、指定された `jsonldContext` は暗黙的に破棄されていました。

**レスポンス**

* ステータス:`201 Created`
  
* ヘッダー:`Location: /ngsi-ld/v1/csourceSubscriptions/{subscriptionId}`

#### CSR サブスクリプションリストの取得

```http
GET /ngsi-ld/v1/csourceSubscriptions
```

**クエリパラメータ**

| Parameter | Type    | Description                   | Default |
| --------- | ------- | ----------------------------- | ------- |
| `limit`   | integer | Number of results to retrieve | 20      |
| `offset`  | integer | Offset                        | 0       |

**レスポンス例**

```json
[
  {
    "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
    "id": "urn:ngsi-ld:CSourceSubscription:sub001",
    "type": "Subscription",
    "entities": [{ "type": "Vehicle" }],
    "notification": {
      "endpoint": { "uri": "http://example.com/notify" }
    },
    "isActive": true
  }
]
```

#### CSR サブスクリプションの取得

```http
GET /ngsi-ld/v1/csourceSubscriptions/{subscriptionId}
```

#### CSR サブスクリプションの更新

```http
PATCH /ngsi-ld/v1/csourceSubscriptions/{subscriptionId}
```

**リクエストボディ**

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "description": "Updated subscription"
}
```

**レスポンス**: `204 No Content`

#### CSR サブスクリプションを削除

```http
DELETE /ngsi-ld/v1/csourceSubscriptions/{subscriptionId}
```

**レスポンス**: `204 No Content`

### JSON-LD コンテキスト管理

ETSI GS CIM 009 Section 5.12 に準拠した JSON-LD コンテキスト管理 API です。ユーザー定義 JSON-LD コンテキストの登録と管理を可能にします。

#### JSON-LD コンテキストの登録

```http
POST /ngsi-ld/v1/jsonldContexts
Content-Type: application/json
```

**リクエストボディ**

```json
{
  "@context": {
    "type": "@type",
    "id": "@id",
    "Temperature": "https://example.org/ontology#Temperature"
  }
}
```

**レスポンス**

* ステータス: `201 Created`
  
* ヘッダー: `Location: /ngsi-ld/v1/jsonldContexts/{contextId}`

#### JSON-LD コンテキストリストの取得

```http
GET /ngsi-ld/v1/jsonldContexts
```

**クエリパラメータ**

| Parameter | Type    | Description               | Default |
| --------- | ------- | ------------------------- | ------- |
| `limit`   | integer | Maximum number of results | 20      |
| `offset`  | integer | Number of results to skip | 0       |

**レスポンス**: `200 OK`

#### JSON-LD コンテキストの取得

```http
GET /ngsi-ld/v1/jsonldContexts/{contextId}
```

**キャッシュヘッダー**

レスポンスには以下のキャッシュ関連ヘッダーが含まれます:

| Header          | Description                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------ |
| `ETag`          | MD5 hash of the context body                                                                     |
| `Last-Modified` | Creation date and time of the context                                                            |
| `Cache-Control` | `public, max-age=3600`                                                                           |
| `Vary`          | Includes `Link` and `Accept` — response `@context` placement depends on these request dimensions |

**表現に関する注記 (#1838):** 逆参照されたボディはリクエストの `@context` をエコーし、`Accept` が JSON-LD でない場合にはインライン `@context` を省略することがあります。`Vary` を無視する共有キャッシュは、同じ `contextId` URL に対して異なる表現を混在させる可能性があります(相互運用性のリスクであり、テナント漏洩ではありません — `contextId` はグローバルに一意であり、エンドポイントは認証されていません)。

**条件付きリクエスト**

| Request Header      | Behavior                                                          |
| ------------------- | ----------------------------------------------------------------- |
| `If-None-Match`     | Returns `304 Not Modified` if the ETag matches                    |
| `If-Modified-Since` | Returns `304 Not Modified` if no changes since the specified date |

**レスポンス**: `200 OK` / `304 Not Modified`

#### JSON-LD コンテキストの削除

```http
DELETE /ngsi-ld/v1/jsonldContexts/{contextId}
```

**レスポンス**: `204 No Content`

## HTTP キャッシュ制御

NGSI-LD GET エンドポイントは、エンドポイントクラスごとにキャッシュ関連のヘッダーを返します:

### データエンドポイント (entities, subscriptions, csourceRegistrations, csourceSubscriptions) — 完全な RFC 7232 + RFC 7234 サポート

| Header          | Value                                                                                 | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ETag`          | `W/"..."`                                                                             | Weak validator. Generation seeds include `path + Accept + tenant + Fiware-ServicePath` (tenant = `NGSILD-Tenant` ?? `Fiware-Service`) so distinct endpoints / Accept / tenants / service paths always produce distinct ETags. **Entity list** (`GET /entities`, non-federated, non-geoNear, non-join/split/entityMap): lightweight validator derived from `total count + max(modifiedAt)` mixed with a scope that also includes the full query string, computed **without fetching entity bodies** so `If-None-Match` can be evaluated and `304` returned before the heavy query (#1261). Federated / geoNear / materialized list paths fall back to a streaming digest of each `id + modifiedAt` mixed with total count and scope. Other lists (subscriptions, registrations, csource\*): streaming digest. Single: hash of `modifiedAt` mixed with scope. |
| `Last-Modified` | RFC 1123 HTTP-date                                                                    | Timestamp of the latest `modifiedAt` in the result set.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `Cache-Control` | `private, no-cache`                                                                   | `private` blocks shared / intermediate cache storage; `no-cache` forces revalidation from the private cache.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `Vary`          | `NGSILD-Tenant, Fiware-Service, Fiware-ServicePath, Authorization, X-Api-Key, Accept` | Tenant + auth + content-negotiation isolation for shared caches.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

条件付きリクエストがサポートされています:

| Request Header                   | Behavior                                                 |
| -------------------------------- | -------------------------------------------------------- |
| `If-None-Match: <ETag>`          | Returns `304 Not Modified` (empty body) if matched.      |
| `If-Modified-Since: <HTTP-date>` | Returns `304` if the resource is unchanged.              |
| `Cache-Control: no-store`        | Server overrides response `Cache-Control` to `no-store`. |

### メタエンドポイント (types, attributes) — Cache-Control + Vary のみ (ETag なし / 304 なし)

| Header          | Value                                                                                 | Purpose                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Cache-Control` | `private, max-age=60, stale-while-revalidate=120`                                     | Shared/intermediate cache storage is forbidden; private cache can reuse briefly with background revalidation. |
| `Vary`          | `NGSILD-Tenant, Fiware-Service, Fiware-ServicePath, Authorization, X-Api-Key, Accept` | Same tenant/auth isolation as data endpoints.                                                                 |

メタエンドポイントは `ETag` / `Last-Modified` を返さず、`If-None-Match` / `If-Modified-Since` 条件付きリクエストをサポートしません。クライアントは代わりに `max-age` / `stale-while-revalidate` ディレクティブに依存する必要があります。

### エラーレスポンス (#1821)

RFC 9110 §15.1 のヒューリスティックにキャッシュ可能なセットの中のエラーステータス (404, 405, 410, 414, 501) は、集中エラーハンドラーから `Cache-Control: no-store` を受け取るため、共有キャッシュ (CloudFront Error Caching Minimum TTL など) がエンティティ GET に関するクロステナントの存在オラクルを保存できません。通常の 400 レスポンスはヒューリスティックにキャッシュ可能ではなく、オーバーライドを受け取りません。

> **注**: `/ngsi-ld/v1/jsonldContexts/{contextId}` には、追加のコンテキスト固有のキャッシュセマンティクスがあります — 上記の JSON-LD Context Management セクションを参照してください。

完全なセマンティクスについては [API.md §HTTP Cache Control](./endpoints.md#http-cache-control-etag--conditional-requests) を参照してください。

***

## エンドポイント一覧

ETSI NGSI-LD 互換の Context Broker API。

### 共通仕様


* **Content-Type**: `application/ld+json` または `application/json`
  
* **Authentication**: `AUTH_ENABLED=false` でない限り必須
  
* **Tenant Isolation**: `NGSILD-Tenant` または `Fiware-Service` ヘッダー
  
* **Pagination**: `limit`/`offset` パラメータ。合計カウントは、**`count=true` がリクエストされた場合にのみ** `NGSILD-Results-Count` ヘッダー経由で返されます (ETSI GS CIM 009 §5.5.6)。カウントがリクエストされない場合、Context Brokerはカウントクエリをスキップし、代わりに `NGSILD-Next` / `Link` (`rel="next"`) で追加ページを示します (#1434)。
  
* **OPTIONS Method**: すべての NGSI-LD エンドポイントは OPTIONS メソッドをサポートします。`Allow` および `Accept-Patch` ヘッダー付きの 204 レスポンスを返します
  
* **405 Method Not Allowed**: 許可されていない HTTP メソッドに対して 405 レスポンスを返します (RFC 7807 ProblemDetails 形式、`Allow` ヘッダー付き)
  
* **406 Not Acceptable**: GET エンドポイントは、利用可能な表現にネゴシエートできない `Accept` ヘッダーを、`availableRepresentations` をリストした 406 ProblemDetails で拒否します (ETSI GS CIM 009 - 6.3.2 / 6.3.4, #1693)。[Content Negotiation](#content-negotiation-and-context) を参照してください
  
* **Path id validation**: ID 指定エンドポイント (entities, subscriptions, csourceRegistrations, temporal entities, jsonldContexts) において、有効な URI でないパス ID は存在チェックの前に `400 BadRequestData` を返します (#1692)
  
* **Error Format**: NGSI-LD エラーレスポンスは RFC 7807 ProblemDetails 形式 (`application/json`) で返されます

### エンティティ操作

| Endpoint                                           | Method | Description                                              | Success | Error              | Pagination    |
| -------------------------------------------------- | ------ | -------------------------------------------------------- | ------- | ------------------ | ------------- |
| `/ngsi-ld/v1/entities`                             | GET    | Retrieve entity list                                     | 200     | 400, 401, 406      | ✅ (max: 1000) |
| `/ngsi-ld/v1/entities`                             | POST   | Create entity                                            | 201     | 400, 401, 409, 415 | -             |
| `/ngsi-ld/v1/entities`                             | DELETE | Purge entities / attribute-level purge (`keep` / `drop`) | 204     | 400, 401           | -             |
| `/ngsi-ld/v1/entities/{entityId}`                  | GET    | Retrieve entity                                          | 200     | 400, 401, 404, 406 | -             |
| `/ngsi-ld/v1/entities/{entityId}`                  | PUT    | Replace entity                                           | 204     | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/entities/{entityId}`                  | PATCH  | Update entity (merge patch)                              | 204     | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/entities/{entityId}`                  | POST   | Add attributes                                           | 204/207 | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/entities/{entityId}`                  | DELETE | Delete entity                                            | 204     | 400, 401, 404      | -             |
| `/ngsi-ld/v1/entities/{entityId}/attrs`            | GET    | Retrieve all attributes of entity                        | 200     | 400, 401, 404, 406 | -             |
| `/ngsi-ld/v1/entities/{entityId}/attrs`            | POST   | Add attributes                                           | 204     | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/entities/{entityId}/attrs`            | PATCH  | Partial attribute update                                 | 204/207 | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}` | GET    | Retrieve single attribute                                | 200     | 400, 401, 404, 406 | -             |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}` | POST   | Replace attribute                                        | 204     | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}` | PUT    | Replace attribute                                        | 204     | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}` | PATCH  | Partial attribute update                                 | 204     | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}` | DELETE | Delete attribute                                         | 204     | 400, 401, 404      | -             |

### タイプ操作

| Endpoint                       | Method | Description                  | Success | Error         | Pagination    |
| ------------------------------ | ------ | ---------------------------- | ------- | ------------- | ------------- |
| `/ngsi-ld/v1/types`            | GET    | Retrieve entity type list    | 200     | 400, 401, 406 | ✅ (max: 1000) |
| `/ngsi-ld/v1/types/{typeName}` | GET    | Retrieve entity type details | 200     | 401, 404, 406 | -             |

### 属性操作

| Endpoint                            | Method | Description                | Success | Error         | Pagination    |
| ----------------------------------- | ------ | -------------------------- | ------- | ------------- | ------------- |
| `/ngsi-ld/v1/attributes`            | GET    | Retrieve attribute list    | 200     | 400, 401, 406 | ✅ (max: 1000) |
| `/ngsi-ld/v1/attributes/{attrName}` | GET    | Retrieve attribute details | 200     | 401, 404, 406 | -             |

### サブスクリプション操作

| Endpoint                                     | Method | Description           | Success | Error                   | Pagination    |
| -------------------------------------------- | ------ | --------------------- | ------- | ----------------------- | ------------- |
| `/ngsi-ld/v1/subscriptions`                  | GET    | Subscription list     | 200     | 400, 401, 406           | ✅ (max: 1000) |
| `/ngsi-ld/v1/subscriptions`                  | POST   | Create subscription   | 201     | 400, 401, 415           | -             |
| `/ngsi-ld/v1/subscriptions/{subscriptionId}` | GET    | Retrieve subscription | 200     | 400, 401, 404, 406      | -             |
| `/ngsi-ld/v1/subscriptions/{subscriptionId}` | PATCH  | Update subscription   | 204     | 400, 401, 404, 409, 415 | -             |
| `/ngsi-ld/v1/subscriptions/{subscriptionId}` | DELETE | Delete subscription   | 204     | 400, 401, 404           | -             |

### コンテキストソース登録操作 (フェデレーション)

| Endpoint                                            | Method | Description           | Success | Error              | Pagination    |
| --------------------------------------------------- | ------ | --------------------- | ------- | ------------------ | ------------- |
| `/ngsi-ld/v1/csourceRegistrations`                  | GET    | Registration list     | 200     | 400, 401, 406      | ✅ (max: 1000) |
| `/ngsi-ld/v1/csourceRegistrations`                  | POST   | Create registration   | 201     | 400, 401, 409, 415 | -             |
| `/ngsi-ld/v1/csourceRegistrations/{registrationId}` | GET    | Retrieve registration | 200     | 400, 401, 404, 406 | -             |
| `/ngsi-ld/v1/csourceRegistrations/{registrationId}` | PATCH  | Update registration   | 204     | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/csourceRegistrations/{registrationId}` | DELETE | Delete registration   | 204     | 400, 401, 404      | -             |

### コンテキストソース登録サブスクリプション操作

| Endpoint                                            | Method | Description               | Success | Error              | Pagination    |
| --------------------------------------------------- | ------ | ------------------------- | ------- | ------------------ | ------------- |
| `/ngsi-ld/v1/csourceSubscriptions`                  | GET    | CSR subscription list     | 200     | 400, 401, 406      | ✅ (max: 1000) |
| `/ngsi-ld/v1/csourceSubscriptions`                  | POST   | Create CSR subscription   | 201     | 400, 401, 415      | -             |
| `/ngsi-ld/v1/csourceSubscriptions/{subscriptionId}` | GET    | Retrieve CSR subscription | 200     | 401, 404, 406      | -             |
| `/ngsi-ld/v1/csourceSubscriptions/{subscriptionId}` | PATCH  | Update CSR subscription   | 204     | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/csourceSubscriptions/{subscriptionId}` | DELETE | Delete CSR subscription   | 204     | 401, 404           | -             |

### 分散操作情報

| Endpoint                          | Method | Description              | Success | Error |
| --------------------------------- | ------ | ------------------------ | ------- | ----- |
| `/ngsi-ld/v1/info/sourceIdentity` | GET    | Retrieve broker identity | 200     | 406   |

### JSON-LD コンテキスト管理

| Endpoint                                 | Method | Description              | Success | Error              | Pagination    |
| ---------------------------------------- | ------ | ------------------------ | ------- | ------------------ | ------------- |
| `/ngsi-ld/v1/jsonldContexts`             | GET    | JSON-LD context list     | 200     | 400, 401, 406      | ✅ (max: 1000) |
| `/ngsi-ld/v1/jsonldContexts`             | POST   | Register JSON-LD context | 201     | 400, 401, 409, 415 | -             |
| `/ngsi-ld/v1/jsonldContexts/{contextId}` | GET    | Retrieve JSON-LD context | 200     | 400, 401, 404, 406 | -             |
| `/ngsi-ld/v1/jsonldContexts/{contextId}` | DELETE | Delete JSON-LD context   | 204     | 400, 401, 404      | -             |

### EntityMap 操作

| Endpoint                               | Method | Description             | Success | Error              | Pagination    |
| -------------------------------------- | ------ | ----------------------- | ------- | ------------------ | ------------- |
| `/ngsi-ld/v1/entityMaps`               | GET    | Retrieve EntityMap list | 200     | 400, 401, 406      | ✅ (max: 1000) |
| `/ngsi-ld/v1/entityMaps`               | POST   | Create EntityMap        | 201     | 400, 401, 403, 415 | -             |
| `/ngsi-ld/v1/entityMaps/{entityMapId}` | GET    | Retrieve EntityMap      | 200     | 401, 404, 406      | -             |
| `/ngsi-ld/v1/entityMaps/{entityMapId}` | PATCH  | Update EntityMap        | 204     | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/entityMaps/{entityMapId}` | DELETE | Delete EntityMap        | 204     | 401, 404           | -             |

### Snapshot 操作

> **GeonicDB 独自拡張 (非 ETSI 準拠, #1667):** GeonicDB の Snapshot API は ETSI GS CIM 009 v1.9.1
> の optional Snapshot module (clause 5.16 / 6.36-6.38) と**同名だが別物**です。ETSI の Snapshot は
> 「クエリ結果の凍結ビュー」を非同期実行で作る横断機構であるのに対し、GeonicDB の Snapshot は
> エンティティのコピー & リストア機構です。ETSI 準拠のクライアントはこのエンドポイントを
> ETSI Snapshot として扱わないでください。
>
> | 観点                             | ETSI 5.16 Snapshot                                      | GeonicDB Snapshot                                           |
> | ------------------------------ | ------------------------------------------------------- | ----------------------------------------------------------- |
> | 目的                             | クエリ結果の凍結ビュー (frozen view)                               | エンティティ集合のコピー & リストア                                         |
> | 作成入力                           | `snapshotQueries` (Query 配列) **必須**                     | `{description, entityTypes, entityIds}`                     |
> | 実行モデル                          | 非同期 (status: `Pending`→`Processing`→`Available`)        | 同期キャプチャ (status: `running`/`succeeded`/`failed`)            |
> | 参照方法                           | 任意の NGSI-LD 操作に `NGSILD-Snapshot` ヘッダを付けて snapshot 上で実行 | `GET /snapshots/{id}` + `POST /snapshots/{id}/clone` (リストア) |
> | 通知                             | `SnapshotNotification`                                  | なし                                                          |
> | `NGSILD-Snapshot` ヘッダ (6.3.22) | あり                                                      | **未対応**                                                     |
>
> **将来の共存パス:** 仕様形の `POST /snapshots` は `snapshotQueries` メンバが必須、GeonicDB 形は
> `{description, entityTypes, entityIds}` であり、入力形で判別可能です。将来 ETSI 準拠実装を同一
> path に追加する migration path は塞がれていません。

| Endpoint                                   | Method | Description              | Success | Error              | Pagination    |
| ------------------------------------------ | ------ | ------------------------ | ------- | ------------------ | ------------- |
| `/ngsi-ld/v1/snapshots`                    | GET    | Retrieve snapshot list   | 200     | 400, 401, 406      | ✅ (max: 1000) |
| `/ngsi-ld/v1/snapshots`                    | POST   | Create snapshot          | 201     | 400, 401, 403, 415 | -             |
| `/ngsi-ld/v1/snapshots`                    | DELETE | Purge own snapshots      | 200     | 401                | -             |
| `/ngsi-ld/v1/snapshots/{snapshotId}`       | GET    | Retrieve snapshot        | 200     | 401, 404, 406      | -             |
| `/ngsi-ld/v1/snapshots/{snapshotId}`       | PATCH  | Update snapshot status   | 204     | 400, 401, 403, 404 | -             |
| `/ngsi-ld/v1/snapshots/{snapshotId}`       | DELETE | Delete snapshot          | 204     | 401, 403, 404      | -             |
| `/ngsi-ld/v1/snapshots/{snapshotId}/clone` | POST   | Clone snapshot (restore) | 200     | 400, 401, 403, 404 | -             |

> **行レベル認可 (#1945):** Snapshot API はエンティティ経路と同じ行レベル認可を適用します。
>
> * **capture (`POST /snapshots`)** — 取り込むのは、その principal が `GET /ngsi-ld/v1/entities`
>   で読める行だけです。scope / owner で読めないエンティティは snapshot に入りません
>   (`entityCount` にも数えられません)。読める行が 1 件も無い principal は 403 になります。
> * **clone (`POST /snapshots/{id}/clone`)** — 書き戻すのは、その principal が
>   `POST /ngsi-ld/v1/entities` で書ける行だけです。復元内容 (snapshot 行) と
>   上書き先の既存行の**両方**が Permit される必要があります。
> * **snapshot 自体の変更 (PATCH / DELETE)** — 作成者のみ。他者の snapshot は 403 です
>   (`super_admin` / `tenant_admin` は従来どおり全件操作できます)。
> * **purge (`DELETE /snapshots`)** — 非管理者は**自分が作成した** snapshot だけを削除します。

### バッチ操作

| Endpoint                              | Method | Description                                               | Success | Error         | Pagination    |
| ------------------------------------- | ------ | --------------------------------------------------------- | ------- | ------------- | ------------- |
| `/ngsi-ld/v1/entityOperations/create` | POST   | Batch create (max: 1000)                                  | 200/201 | 400, 401, 415 | -             |
| `/ngsi-ld/v1/entityOperations/upsert` | POST   | Batch upsert (max: 1000)                                  | 204/207 | 400, 401, 415 | -             |
| `/ngsi-ld/v1/entityOperations/update` | POST   | Batch update (max: 1000)                                  | 200/204 | 400, 401, 415 | -             |
| `/ngsi-ld/v1/entityOperations/delete` | POST   | Batch delete (max: 1000)                                  | 200/204 | 400, 401, 415 | -             |
| `/ngsi-ld/v1/entityOperations/query`  | POST   | Batch query                                               | 200     | 400, 401, 415 | ✅ (max: 1000) |
| `/ngsi-ld/v1/entityOperations/merge`  | POST   | Batch merge patch (max: 1000)                             | 204/207 | 400, 401, 415 | -             |
| `/ngsi-ld/v1/entityOperations/purge`  | POST   | Bulk entity purge (GeonicDB 独自拡張, backward compatibility) | 204     | 400, 401, 415 | -             |

### Temporal API (時系列データ)

Temporal 履歴は、`POST /ngsi-ld/v1/entities`、`PATCH /ngsi-ld/v1/entities/{entityId}`、`POST/PATCH /ngsi-ld/v1/entities/{entityId}/attrs` などの Entity API 書き込みでは自動記録されません。次のいずれかの取り込みパスを使用してください:(1) Temporal API エンドポイントへの明示的な書き込み (単一またはバッチ)、または (2) ReactiveCore ルールで `appendToTemporal` を使用してエンティティ変更時に追記。

| Endpoint                                                                 | Method | Description                         | Success | Error              | Pagination    |
| ------------------------------------------------------------------------ | ------ | ----------------------------------- | ------- | ------------------ | ------------- |
| `/ngsi-ld/v1/temporal/entities`                                          | GET    | Retrieve temporal entity list       | 200     | 400, 401, 406      | ✅ (max: 1000) |
| `/ngsi-ld/v1/temporal/entities`                                          | POST   | Create temporal entity              | 201     | 400, 401, 409, 415 | -             |
| `/ngsi-ld/v1/temporal/entities/{entityId}`                               | GET    | Retrieve temporal entity            | 200     | 400, 401, 404, 406 | -             |
| `/ngsi-ld/v1/temporal/entities/{entityId}`                               | PATCH  | Merge attributes of temporal entity | 204     | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/temporal/entities/{entityId}`                               | DELETE | Delete temporal entity              | 204     | 400, 401, 404      | -             |
| `/ngsi-ld/v1/temporal/entities/{entityId}/attrs`                         | POST   | Add attribute instance              | 204     | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/temporal/entities/{entityId}/attrs/{attrName}`              | DELETE | Delete attribute instance           | 204     | 400, 401, 404      | -             |
| `/ngsi-ld/v1/temporal/entities/{entityId}/attrs/{attrName}/{instanceId}` | PATCH  | Modify attribute instance           | 204     | 400, 401, 404      | -             |
| `/ngsi-ld/v1/temporal/entityOperations/create`                           | POST   | Temporal batch create (max: 1000)   | 201/207 | 400, 401, 415      | -             |
| `/ngsi-ld/v1/temporal/entityOperations/upsert`                           | POST   | Temporal batch upsert (max: 1000)   | 204/207 | 400, 401, 415      | -             |
| `/ngsi-ld/v1/temporal/entityOperations/delete`                           | POST   | Temporal batch delete               | 204/207 | 400, 401, 415      | -             |
| `/ngsi-ld/v1/temporal/entityOperations/query`                            | POST   | Temporal batch query                | 200     | 400, 401, 415      | ✅ (max: 1000) |

> **属性名の保存形と compaction (#1975)**: temporal の属性名も entity 側 (#1649) と同じ canonical 形 (`compactIri(core @context, expandTerm(書き込み @context, 名前))`) で保存されます。単一/batch の create・`POST .../attrs`・`PATCH` (merge) の全書き込み経路が対象で、書き込み時にリクエスト `@context` がマップする term は FQN で保存されます。GET / query / 集約応答は**そのリクエストが渡した `@context`** を基準に属性名を compact して返します (ETSI GS CIM 009 clause 5.5.7)。`orderBy`・`attrs` セレクタ・属性削除 (`DELETE .../attrs/{attrName}`)・インスタンス修正 (`PATCH .../attrs/{attrName}/{instanceId}`) のパス属性名も同じ正規化と候補照合 (保存形の union の OR) を通るため、ある `@context` で書いた属性を**別の `@context` の同義 term**で引く・並び替える・削除できます。属性名は短縮名 (`A-Za-z0-9_`) に加え**絶対 IRI もそのまま受理**します(従来は短縮名限定でした)。
>
> **既知の制限**: temporal は書き込み時 `@context` を保存していないため一括移行ができません。**#1975 適用前 (移行前) の既存データは verbatim 保存のまま**残り、応答でも保存形をそのまま返します(compact されません)。読み取り・クエリ・削除は保存形の候補集合(verbatim ∪ canonical)の OR で照合するため、legacy データにも当たり続けます。
