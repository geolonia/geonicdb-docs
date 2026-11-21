---
title: "NGSI-LD API"
description: "NGSI-LD API reference"
outline: deep
---
# NGSI-LD API

> このドキュメントは [API.md](./endpoints.md) から分離されました。主要な API 仕様については [API.md](./endpoints.md) を参照してください。

***

NGSI-LD は JSON-LD ベースのコンテキスト情報管理 API です。

> **注意:** NGSI-LD API は ETSI GS CIM 009 仕様に従い、`Fiware-ServicePath` ヘッダーを無視します。階層は `scope` エンティティプロパティと `scopeQ` クエリパラメータによって管理されます。`servicePath` と `scope` は独立した概念であり、自動的に同期されることはありません([INTEROPERABILITY.md](../core-concepts/ngsiv2-vs-ngsild.md#3-scope-scope-hierarchy) を参照)。これは認可(#1323)にも適用されます: `servicePath` リソース属性を持つ XACML ポリシーは NGSI-LD リクエストでは常に `/` を参照するため、`Fiware-ServicePath` は **NGSI-LD においてアクセス制御や分離境界として使用できません** — 代わりに `scope` / `entityType` ポリシー制約を使用してください([AUTH.md](../reference/auth.md) を参照)。
>
> **Scope 文字セット (#1189 / #3524):** 各 scope セグメントは文字で始まり、その後は `[A-Za-z0-9._-]` に一致する必要があります(POSIX portable trailing set; GeonicDB extension of clause 4.18)。セグメントは数字、`.`、`_`、または `-` で始めることはできません。これに違反する文字列 — 例えば `;` `+` `#` 半角スペースを含むもの、または先頭の `/` が欠けているもの — は `scopeQ` の衝突と潜在的な問題を防ぐために `400 BadRequestData` で拒否されます。詳細は [INTEROPERABILITY.md → Scope Character Set](../core-concepts/ngsiv2-vs-ngsild.md#scope-character-set-geonicdb-独自拡張) を参照してください。
>
> **エンティティフィールド文字セット (#1209 / #1211):** `id` は `A-Z a-z 0-9 . _ - :` を受け付けます(`:` は NGSI-LD URN 形式用、先頭の `-` は不可); `type` は **POSIX portable short names** (`A-Z a-z 0-9 . _ -`、先頭の `-` は不可)**または絶対 IRI**(例: `https://uri.fiware.org/ns/data-models#WeatherObserved`、`urn:ngsi-ld:Type:Sensor`)を受け付けます; **属性名は short names (`A-Z a-z 0-9 _`) または絶対 IRI を受け付けます** (#1649 — canonical 保存で保存キーが FQN になりうるため。NGSIv2 経路は従来どおり短縮名のみ)。3 つのフィールドすべてが 256 文字に制限されています。違反は `400 BadRequestData` を返します。**型名 (`type`) は active `@context` で term ⇄ URI 展開される (ETSI GS CIM 009 §5.5.7、#1613)** — `@context` がマップする term と対応する FQN は同一 type に解決し (書き込みで canonical 正規化・読み出しで応答 context に compact)、どの context もマップしない短縮名 `Temperature` は core `@vocab` の `.../default-context/Temperature` に展開され絶対 IRI `https://example.com/Temperature` とは別 type になる。型を伴うクエリ/作成で `@context` が解決不能なら `504 LdContextNotAvailable`。**属性名 (attribute name) も active `@context` で term ⇄ URI 展開され、canonical 形で保存される (#1649)** — リクエスト `@context` がマップする term は FQN で保存され、core 語彙 (`location` / `observedAt` 等) と未定義 term は短縮名のまま保存される (保存形不変)。応答はリクエスト `@context` で compact されるため、**別の `@context` の同義 term で書いた属性も引ける** (clause 5.5.7 の "if and only if" 完全形)。**破壊的変更**: `@context` がマップする属性を **`@context` 無し**で引くと `default-context/<名前>` = 別属性を指すため `404` になる (旧: 短縮名の verbatim 保存ゆえに引けた)。移行前データは `npm run migrate:attr-names -- --apply` で変換する。Detail: [INTEROPERABILITY.md → Entity Field Character Set](../core-concepts/ngsiv2-vs-ngsild.md#entity-field-character-set-id--type--attribute-name--geonicdb-独自拡張)。
>
> **注意:** NGSIv2 と NGSI-LD のエンティティは完全に分離されています。NGSIv2 経由で作成されたエンティティは NGSI-LD からは見えず、その逆も同様です(各エンティティの `protocol` フィールド、#964)。

## HEAD リクエスト

実装された ETSI NGSI-LD 取得操作に対する成功した `HEAD` リクエストは、ボディ、`Content-Length`、または `Content-Range` なしで `204 No Content` を返します。条件付きリクエストが一致する場合は `304 Not Modified` を返します。HEAD レスポンスの成功を確認する際は `204` を受け入れ、レスポンスボディやレンジメタデータが必要な場合は `GET` を使用してください。[ETSI TS 104 176 V1.1.1, clause 5](https://www.etsi.org/deliver/etsi_ts/104100_104199/104176/01.01.01_60/ts_104176v010101p.pdf#page=21) を参照してください。

## 仕様準拠

このドキュメントは **[ETSI GS CIM 009 V1.9.1 (2025-07)](https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/01.09.01_60/gs_CIM009v010901p.pdf)** を参照仕様としています。GeonicDB は仕様のサブセットを実装しており、適合性は自己宣言ではなく固定された ETSI Test Suite に対して帯域外で測定されます([geonicdb-compliance](https://github.com/geolonia/geonicdb-compliance) を参照)。各機能の詳細については、以下の ETSI 仕様セクションを参照してください:

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

| Status                       | Feature                                                                          | Notes / Tracking                                                                                                                                                                                                                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Implemented                  | `orderBy` (shared parser + entity/temporal query)                                | Implemented by #1661 / #1662 / #1663                                                                                                                                                                                                                                                                          |
| Implemented                  | NGSI-LD core `@context` v1.9 update                                              | Implemented by #1665                                                                                                                                                                                                                                                                                          |
| Implemented                  | Property `valueType` member                                                      | Implemented by #1666                                                                                                                                                                                                                                                                                          |
| Implemented                  | Batch operations (`create` / `upsert` / `update` / `merge` / `delete` / `query`) | Implemented scope tracked in #1580                                                                                                                                                                                                                                                                            |
| Implemented                  | Geo-queries                                                                      | Implemented scope tracked in #1580                                                                                                                                                                                                                                                                            |
| Implemented                  | EntityMap                                                                        | Implemented scope tracked in #1580                                                                                                                                                                                                                                                                            |
| Implemented                  | `GET /info/sourceIdentity`                                                       | Returns a `ContextSourceIdentity` (clause 5.15 / 5.2.40) including the mandatory `contextSourceAlias` / `contextSourceUptime` / `contextSourceTimeAt` members. Implemented by #1731                                                                                                                           |
| Partial / Known difference   | Entity Purge                                                                     | Spec form `DELETE /entities` (clause 5.6.21, binding 6.4.3.3) is supported; `POST /entityOperations/purge` is a **GeonicDB extension** (no such resource in the spec). Known `keep`/`drop` behavior differences (#1660)                                                                                       |
| Partial / Known difference   | Snapshot API                                                                     | **GeonicDB extension**; not the ETSI Snapshot module (clause 5.16 / data type 5.2.41) — same name, different shape, distinguishable by input form (#1667)                                                                                                                                                     |
| Partial / Known difference   | Distributed Operations                                                           | Implemented, but interoperability pass-rate remains low; improvement continues (#1664 / #1580)                                                                                                                                                                                                                |
| Not implemented (known gaps) | `ngsildproof` signature attributes                                               | Tier3 / out of scope in #1580                                                                                                                                                                                                                                                                                 |
| Partial / Known difference   | `splitEntities`                                                                  | Explicit `true` defers q/geo/scope/attrs until after aggregation for federated EntityMap queries (#4034 / TS 104 175 §10.4.3.4). Value-less form remains GeonicDB type-grouping. Deployment default when omitted is local filter application (`false`). Full distributed-ops matrix still tracked under #1580 |
| Not implemented (known gaps) | Backward-compatibility version negotiation                                       | Tier3 / out of scope in #1580                                                                                                                                                                                                                                                                                 |

> 注意: GeonicDB は機械可読な適合性宣言を提供しません。ETSI GS CIM 009 が適合性クラスモデルを定義していないためです(#1585)。合格率は [geonicdb-compliance](https://github.com/geolonia/geonicdb-compliance) の固定測定実行を通じて帯域外で公開されています。

### コンテンツネゴシエーションと @context

NGSI-LD API は `Accept` ヘッダーによるコンテンツネゴシエーションをサポートしています。

以下の表は ETSI の取得エンドポイント(`/entities`、`/subscriptions`、`/temporal` など)について説明しています。

| Accept Header          | Response Format | @context Handling                            |
| ---------------------- | --------------- | -------------------------------------------- |
| *(absent)*             | JSON            | `@context` is returned via the `Link` header |
| `*/*`                  | JSON            | `@context` is returned via the `Link` header |
| `application/ld+json`  | JSON-LD         | `@context` is included in the response body  |
| `application/json`     | JSON            | `@context` is returned via the `Link` header |
| `application/geo+json` | GeoJSON         | `@context` is included in the response body  |

**ネゴシエーションルール(ETSI GS CIM 009 - 6.3.4、#1734 / #1727):**[clause 6 text](https://cim.etsi.org/NGSI-LD/official/clause-6.html) を参照してください。


1. **`Accept` ヘッダーが存在しない(または空の)場合、ワイルドカード受け入れとして扱われます**(IETF RFC 9110 §12.5.1)。すべての ETSI 取得エンドポイントで、これは候補順序により `application/json` に解決されます。これは clause 6.3.4 が要求する通りです:*「Accept ヘッダーが存在しない場合、`application/json` が仮定されるものとする。」*
   
2. 標準的な候補セットを持つ ETSI 取得エンドポイントで、`Accept` ヘッダーが複数のサポートされる表現に展開される場合、候補リストの順序 `application/json` → `application/ld+json` → `application/geo+json` は重要であり、**最初にマッチしたものが選ばれます**。したがって、`Accept: */*` ― `curl`、`python-requests`、およびほとんどの HTTP クライアントのデフォルト ― は、これらの ETSI エンドポイントでは JSON-LD ではなく `application/json` に解決されます。
   
3. 相対的な `q` 値(IETF RFC 7231 §5.3.2、メディアレンジの特異性を含む:`type/subtype` > `type/*` > `*/*`)はそのリスト順序を**上書き**します。`Accept: application/json;q=0.1, application/ld+json;q=1` は JSON-LD を返し、`Accept: application/json, */*` は明示的なメディアタイプがワイルドカードよりも特定的であるため、プレーン JSON を返します。
   
4. `application/geo+json` は、GeoJSON ボディをレンダリングできるエンドポイント ― `GET /entities`、`GET /entities/{entityId}`、および `POST /entityOperations/query`(#1783)― でのみ候補となります。Clause 6.3.4 は「Retrieve Entity」(5.7.1)と「Query Entity」(5.7.2)の両方を GeoJSON 対象として挙げており、Query Entity は `GET /entities` またはこの POST のいずれかで呼び出すことができます。それ以外の場所では選択時に無視され、他に受け入れ可能なものがない場合は `406` を返します。

> \*\*破壊的変更(#1734):\*\*この修正前は、`Accept` ヘッダーが存在しない場合と `Accept: */*` の場合は `application/ld+json` に解決され、レスポンスはボディにトップレベルの `@context` を含んでいました。現在はこれらは `application/json` に解決され、`@context` は `Link` ヘッダーに移動します。JSON-LD を必要とするクライアントは、明示的に `Accept: application/ld+json` を送信する必要があります。公式 CLI(`geonic`)と npm SDK(`@geolonia/geonicdb-sdk`)はすでにこれを行っており、影響を受けません。

ネゴシエートされたタイプが `application/json` の場合、レスポンスには `Link` ヘッダーが含まれます:

```http
Link: <https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.9.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"
```

**406 Not Acceptable(#1693):** NGSI-LD GET(取得)エンドポイントおよび `POST /entityOperations/query` で、`Accept` ヘッダーが利用可能な表現のいずれにもネゴシエートできない場合、Context Brokerは(ETSI GS CIM 009 - 6.3.2 / 6.3.4)に従い、静かに JSON を提供する代わりに `406 Not Acceptable` を返します。ProblemDetails ボディ(`type: https://uri.etsi.org/ngsi-ld/errors/NotAcceptable`)は、`availableRepresentations` にパス固有のネゴシエート可能なメディアタイプをリストします:通常は `application/json` / `application/ld+json`(エンティティエンドポイントと `POST /entityOperations/query` では `application/geo+json` も追加、#1783)。たとえば、`Accept: application/xml` または `text/csv` は `406` を返します。`Accept` ヘッダーが存在しないか空の場合は、ワイルドカード受け入れとして扱われ、各エンドポイントの最優先の利用可能な表現に解決されるため、`406` は返されません。

**リクエストボディの `@context`(書き込み操作、#1583 / #1599 / #2065):**ボディを持つ**すべて**の `POST` / `PATCH` / `PUT` において、`Content-Type` が `@context` の供給方法を決定します。Clause 6.3.5 はリソースではなく動詞を指定しているため、これはエンティティレベルの書き込み、単一属性の書き込み、バッチ操作、時系列書き込み、サブスクリプション、csourceRegistrations、および csourceSubscriptions すべてをカバーします:

| Request `Content-Type` | `@context` in body | Behavior                                                                                                                                                                                                                                                      |
| ---------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `application/ld+json`  | **Required**       | Omitting `@context` returns `400 BadRequestData` (ETSI GS CIM 009 clause 6.3.5). A JSON-LD document without a context has undefined attribute-name semantics.                                                                                                 |
| `application/json`     | **Rejected**       | Clause 6.3.5: "if the request payload body (as JSON) contains a `@context` term, then an HTTP error response of type BadRequestData shall be raised." Supply the context via the `Link` header instead; with neither, the core `@context` applies implicitly. |

**混在は禁止(#1924)。** Clause 6.3.5 は「混在は許可されない、すなわち、オプションの混在は HTTP レスポンスエラーを引き起こすものとする。」と締めくくっています。両方向とも `POST` / `PATCH` / `PUT` で `400 BadRequestData` を返します:

| Request                                       | Result                     |
| --------------------------------------------- | -------------------------- |
| `application/ld+json` + JSON-LD `Link` header | `400 BadRequestData`       |
| `application/json` + body `@context`          | `400 BadRequestData`       |
| `application/ld+json`, no `@context` anywhere | `400 BadRequestData`       |
| `application/ld+json` + body `@context` only  | accepted                   |
| `application/json` + `Link` header only       | accepted                   |
| `application/json`, no `@context` anywhere    | accepted (core `@context`) |

このチェックは NGSI-LD ルーターのエントリで一度実行されるため、**すべて**のボディを持つ NGSI-LD 書き込み ― エンティティレベル、単一属性、バッチ、時系列、サブスクリプション、csourceRegistrations、および csourceSubscriptions すべて ― をカバーします。`POST /ngsi-ld/v1/jsonldContexts` は除外されます:そのボディはコンテキスト宣言ではなく JSON-LD コンテキストドキュメント*そのもの*です。`application/merge-patch+json` は clause 6.3.5 の文言の範囲外(`application/json` と `application/ld+json` のみを指定)であり、したがって混在ルールの対象ではありません。

**配列ボディは要素ごとにチェックされます(#2069)。** バッチボディは「**それぞれが NGSI-LD Entity を表す** 1 つ以上の JSON-LD ドキュメントを含む JSON-LD 配列」(clause 5.6.7.3)であるため、各要素はそれ自身の JSON-LD ドキュメントであり、それぞれ独自の `@context` を必要とします。したがって、違反はリクエストではなくその要素に属します:これは **`207 Multi-Status`** レスポンスの `errors` 配列内の `BatchEntityError` として報告され、残りの要素は引き続き処理されます。`Link` ヘッダー違反のみ ― これはどの単一要素にも帰属できない ― はリクエストレベルの `400` のままです。ETSI 適合性スイートはまさにこの分割を測定しています(`003_06_01` / `003_08_01` は `207` を期待、`003_09_01` は `400` を期待)。

`POST /entityOperations/delete` は除外されます:clause 5.6.10.3 はその入力を「**Entity ID(URI)** のリストを含む JSON-LD 配列」と定義しており、文字列要素には `@context` を持たせる場所がありません。除外は**要素の形状**によって決定され、パスによってではありません。

| Batch request                                                             | Result                                                              |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `application/ld+json`, every element carries `@context`                   | accepted                                                            |
| `application/ld+json`, some elements lack `@context`                      | `207` — those elements fail with `BadRequestData`, the rest succeed |
| `application/ld+json`, no element carries `@context`                      | `207` — every element fails with `BadRequestData`                   |
| `application/json`, some elements carry `@context`                        | `207` — those elements fail with `BadRequestData`                   |
| `application/ld+json` + JSON-LD `Link` header                             | `400 BadRequestData` (request-level)                                |
| `POST /entityOperations/delete` (array of ID strings), any `Content-Type` | accepted                                                            |

**互換性に関する注意。** これまで `application/json` とボディの `@context` を送信していたクライアント(`@context` は静かに無視されていました)は、現在 `400` を受け取ります。それらを `application/ld+json` に切り替えるか、コンテキストを `Link` ヘッダーに移動してください。同様に、`application/ld+json` *かつ* `Link` ヘッダーを送信するクライアントは、書き込み時に `Link` ヘッダーを削除する必要があります。

**破壊的変更(#2065 / #1599)。** この変更前は「`application/ld+json` はボディの `@context` を必要とする」ルールは 6 つのエンティティレベルエンドポイントにのみ配線されていました。`POST /entityOperations/*`、`POST`/`PATCH /subscriptions`、`POST`/`PATCH /csourceRegistrations`、`POST`/`PATCH /csourceSubscriptions`、時系列書き込み、および両方の `POST` クエリ操作は、コンテキストのない JSON-LD を `200` / `201` / `204` で受け入れていました。現在はこれらは `400`(または配列ボディの場合は `207`)を返します。これらのエンドポイントで `Content-Type: application/ld+json` を送信するクライアントは、インラインの `@context` を含めるか、`application/json` に切り替えて `Link` ヘッダー経由でコンテキストを供給する必要があります。

**レスポンスの `@context` はリクエスト単独で決定されます(#1733)。** ETSI GS CIM 009 clause 5.5.7 によれば、「用語の圧縮または展開を実行するために使用される `@context` は、各 API 呼び出しによって提供されたもの(またはその欠如時のデフォルト `@context`)であり、**以前に提供された可能性のある他の `@context` ではない**」、そして clause 5.5.5 は、`@context` を持たない入力には「最低限…コア `@context`」を与えることを要求しています。したがって:


* 読み取りが JSON-LD `Link` ヘッダー経由でコンテキストを提供する場合、レスポンスはそれで圧縮されます。`POST` クエリ操作(`/entityOperations/query`、`/temporal/entityOperations/query`)では、ソースは他の POST と同様に clause 6.3.5 に従います:`application/ld+json` の場合、`@context` はリクエスト**ボディ**から来て、`application/json` の場合は `Link` ヘッダーから来ます(#1786)。これが配線される前は、これらのエンドポイントではボディの `@context` が無視され、クエリのタイプ/属性名が間違った語彙の下で展開されていました ― これは**ゼロ件の結果**として表面化し、エラーではありませんでした。
  
* 読み取りがコンテキストを提供しない場合、レスポンスは **NGSI-LD コア `@context` のみ**で圧縮されます。コア `@context` が圧縮できないエンティティタイプと属性名は、**完全修飾 URI** としてレンダリングされます(clause 5.5.7:「実装は完全修飾名をレンダリングするものとする」)。
  
* Context Brokerはエンティティ `type` からコンテキストを推測することはありません(Smart Data Models / Custom Data Model)。ドメイン語彙を取得するには、読み取り時にその語彙の `@context` を渡してください。
  
* **短縮名は、リクエストの `@context` の下で同じ URI に展開される場合にのみ使用されます(#1787)。** リクエストの `@context` がその短縮名を*異なる
* IRI にマッピングする場合(シャドーイング)、それは「マッチする用語」ではなく、決して出力されません ― Context Brokerは次の圧縮形式(ラウンドトリップする `prefix:suffix` コンパクト IRI)に進み、最終的に完全修飾 URI に至ります。例:コンテキストなしで書き込まれた属性(URI `https://uri.etsi.org/ngsi-ld/default-context/name`)を、`"name": "https://example.org/vocab#name"` を定義するコンテキストで読み返すと、`ngsi-ld:default-context/name` としてレンダリングされ、**`name` ではありません** ― `name` を返すとクライアントは `example.org/vocab#name` として読み取ってしまいます。これは JSON-LD 1.1 [IRI Compaction Algorithm](https://www.w3.org/TR/json-ld11-api/#iri-compaction) を反映しており、エンティティタイプと属性名の両方に適用されます。
  
* **シャドーイングチェックは短縮名のエンティティタイプにも適用されます(#1876)。** コンテキストなしで書き込まれたタイプは、裸の正規名として保存され、Context Brokerは以前、読み取りの `@context` をまったく参照せずに、コア `@vocab` を削除してそれらをレンダリングしていました。現在は、読み取りが供給する場合は常にそれを参照します:コンテキストなしで作成された `Building` を、`"Building": "https://example.org/vocab#Building"` を定義するコンテキストで読み返すと、`ngsi-ld:default-context/Building` としてレンダリングされます。`@context` を提供しない(またはコアのみを提供する)読み取りは、古い高速パスを維持し、リモートコンテキストを決してフェッチしません。同じルールが `csourceRegistrations`、`csourceSubscriptions`、および `subscriptions` レスポンス内のタイプセレクタにも適用されます。
  
* **曖昧な `@context` ドキュメントは `400 BadRequestData` で拒否されます(#1878)。***キー*がパススルー形式の絶対 IRI(`https://…`、`urn:…`、またはプレフィックスが未定義の `prefix:suffix`)である用語を定義し、それを**異なる** IRI にマッピングするコンテキストは、Context Brokerが clause 5.5.7 を満たす方法を残しません:フォールバックするはずの完全修飾名でさえ、そのコンテキストの下では別の何かを意味します。このようなリクエストは、静かに誤読された名前で応答するのではなく、拒否されます。これは狭く ― `{"ex": "https://ex/ns#", "ex:Name": "https://ex/ns#Name"}`(プレフィックスが同じコンテキストで定義されているコンパクト IRI キー)と `{"https://ex/X": "https://ex/X"}`(それ自体にマッピングされたキー)は両方ともまだ受け入れられます。

**作成/更新時の `@context` 保持(#1620 / #1633 / #1637):** 書き込み時に提供された `@context`(`application/ld+json` の場合はボディ、`application/json` の場合は `Link` ヘッダー)は、`contextRef` としてエンティティと共に保存されます。これは **URL、URL 配列、インラインコンテキストオブジェクト(用語 → IRI マップ)、および混合配列**をカバーします。#1733 以降、これはレスポンスをレンダリングする際に**保存された属性の完全修飾名を復元するためにのみ**使用されます ― レスポンスの `@context` を決定することはありません。**更新セマンティクス(#1637、ETSI GS CIM 009 clause 5.6.18 Replace / 5.6.17 Merge / 5.6.2 Update Attributes):**


* **Replace ファミリー**(`PUT /entities/{id}`、バッチアップサート `options=replace`):リクエストが保存可能な `@context` を持つ場合、保存された `contextRef` を**上書き**します。省略された場合、またはコアのみの場合(`extractContextRef` が undefined を返す、#1620)、保存された値は**そのまま**です(省略は削除ではありません)。
  
* **Merge ファミリー**(`PATCH /entities/{id}`、`PATCH /attrs`、`POST /attrs`、バッチアップサートデフォルト / update / merge):**存在しない場合に設定** ― 欠落している `contextRef` は補充されます。既存のものは決して上書きされません。

JSON `null` はエンティティ PATCH で `@context` を解除しません(`@context` は Attribute ではありません。エンティティマージは `urn:ngsi-ld:null` を使用します、clause 5.5.12)。インラインコンテキストを参照可能な `jsonldContexts` URL としてホスティングすること(`application/json` `Link` ヘッダーがそれらを運べるように)は範囲外です。シリアライズされたサイズが `MAX_CONTEXT_INLINE_BYTES`(8 KiB)を超えるインライン `@context`、または `MAX_CONTEXT_ARRAY`(10)エントリを超える `@context` 配列は、`400 BadRequestData` で拒否されます。

### 自然言語照合(lang + orderBy)

`lang` パラメータと `orderBy` を組み合わせることで、指定された言語のロケールに基づいて結果をソートできます。たとえば、`lang=ja` はソートに日本語照合順序を適用します。

### Entity Operations (NGSI-LD)

> **ETSI GS CIM 009 Reference**: Section 5.6 - Entity Operations

#### Retrieve Entity List

```http
GET /ngsi-ld/v1/entities
```

**Request Headers**

```http
Accept: application/ld+json
Link: <https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"
```

**Query Parameters**

| Parameter        | Type           | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Default     |
| ---------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `id`             | string         | Filter by entity ID (comma-separated for multiple, URI format)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | -           |
| `limit`          | integer        | Number of results to retrieve                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 20          |
| `offset`         | integer        | Offset (max: 10000)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 0           |
| `pageToken`      | string         | Keyset continuation token (default sort only). Send back the previous response's `NGSILD-Next`. Mutually exclusive with `offset`; invalid with `orderBy`. See [API.md §Keyset Pagination](./endpoints.md#keyset-pagination-pagetoken-1435) (#1435)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | -           |
| `orderBy`        | string         | Entity Ordering Language expression (ETSI GS CIM 009 V1.9.1 §4.23 / 5.2.43) — see [Entity Ordering (orderBy)](#entity-ordering-orderby) below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | -           |
| `orderDirection` | string         | Sort direction (`asc`, `desc`) for the legacy notation (see below). Ignored when `orderBy` carries explicit `;`-direction operators                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `asc`       |
| `type`           | string         | Filter by entity type                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | -           |
| `typePattern`    | string         | Regular expression pattern for entity type, evaluated **verbatim** (no implicit `*`→`.*` conversion). Combining with `type` is an **AND** (both must match) — unlike NGSIv2 where they are mutually exclusive (#2105/#2122). Applied to federated (remote) results before merging as well (#2134). **GeonicDB 独自拡張**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | -           |
| `idPattern`      | string         | Regular expression pattern for entity ID                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | -           |
| `q`              | string         | Filter by attribute value. Supports trailing path into compound values (`address[city]=="Berlin"`) and LanguageProperty all-languages (`street[*]=="Grand Place"`) per clause 4.9 (#3333 / #3675). For reserved `@vocab` metadata `valueType` / `objectType` (#3840 / #3857, entity and temporal): short names and expanded IRIs are equivalent (e.g. `name.valueType=="String"` matches `name.valueType==https://uri.etsi.org/ngsi-ld/default-context/String`); request `@context` aliases are resolved the same way on entity/temporal reads; `!=` / `!~=` on those members requires the member to exist (an attribute without `valueType` does not match `name.valueType!="Number"`, clause 7.2.3 / ETSI 019\_34\_04). Other dotted `!=` paths keep the historical missing-as-match behaviour. **Subscription `q` matching** uses the subscription's `jsonldContext` (else core) — there is no per-notification request `@context` for alias resolution (#3857)                                                                                                                                                                                                                                        | -           |
| `jsonKeys`       | string         | Comma-separated attribute names whose values are treated as opaque JSON (not expanded as JSON-LD) when evaluating `q` trailing paths (clause 4.9 / Table 6.4.3.2-1, #3333)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | -           |
| `attrs`          | string         | Attribute names to retrieve (comma-separated)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | -           |
| `pick`           | string         | Attribute names to retrieve, in the **NGSI-LD Attribute Projection Language** (ETSI GS CIM 009 clause 4.21). Mutually exclusive with `omit` and `attrs`. Entity members `id` / `type` / `scope` may be listed. Syntax violations return `400 BadRequestData` (#2277)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | -           |
| `omit`           | string         | Attribute names (or Entity members `id` / `type` / `scope`) to exclude, same projection language as `pick`. Mutually exclusive with `pick` and `attrs`. The result may no longer be a valid NGSI-LD Entity (#2275)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | -           |
| `scopeQ`         | string         | Scope query (e.g., `/Madrid`, `/Madrid/#`, `/Madrid/+`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | -           |
| `lang`           | string         | Language filter for LanguageProperty (BCP 47, comma-separated / q-value ranking, `*` for any supported language). Converts the attribute to a Property `{value, lang}` and drops `languageMap`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | -           |
| `georel`         | string         | Geo-query operator                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | -           |
| `geometry`       | string         | Geometry type                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | -           |
| `coordinates`    | string         | Coordinates                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | -           |
| `spatialId`      | string         | Filter by spatial ID (ZFXY format) (see [Spatial ID Search](./endpoints.md#spatial-id-search))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | -           |
| `spatialIdDepth` | integer        | Depth of spatial ID hierarchy expansion (0-4)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 0           |
| `crs`            | string         | Coordinate reference system (see [Coordinate Reference System (CRS)](./endpoints.md#coordinate-reference-system-crs)). URN format also accepted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `EPSG:4326` |
| `geoproperty`    | string         | GeoProperty name to use for geo-queries                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `location`  |
| `format`         | string         | Output format (`normalized`, `concise`, `keyValues`, `simplified`, `geojson`). `format` is prioritized over `options`. Unknown values are rejected with `400 InvalidRequest`. `geojson` can also be specified with `Accept: application/geo+json` header                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | -           |
| `expandValues`   | string         | Attribute names to expand (comma-separated, returns expanded values)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | -           |
| `options`        | string         | `keyValues` / `simplified`, `concise`, `entityMap`, `sysAttrs` (output system attributes). Comma-separated tokens. **Unknown tokens are rejected with `400 InvalidRequest`** (ETSI GS CIM 009 - 6.3.20, #1664)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | -           |
| `count`          | boolean        | `true` returns the `NGSILD-Results-Count` header; `false` is accepted and omits it; any other lexical value returns `400 BadRequestData` (ETSI GS CIM 009 Table 6.3.13-1 declares `count` as Boolean, #1904)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | -           |
| `splitEntities`  | flag / boolean | **Value-less** (`?splitEntities`): group the response into per-type arrays (GeonicDB 独自拡張). **Explicit `true`** (`?splitEntities=true` / batch body `splitEntities: true`): ETSI TS 104 175 §10.4.3.4 distributed mode — assume Entities may be split across Context Sources; remove `q` / geoQ / scopeQ / attrs selection before forwarding, apply them after aggregation (#4034). Standalone query parameter (not an `options` token). `false` / omitted keeps local filter application. **Type omission (#4034):** when `splitEntities=true` is used without a type/id selector and federation is enabled, GeonicDB complements the internal type list from **Context Source Registration declared concrete `entityTypes` only** (not `*`). If **no concrete type** can be complemented (e.g. only `*` registrations), the request fails with **400**. When at least one concrete type is complemented, local Entities whose type is not among those declared types (and types covered only by `*`) are **silently excluded** from candidacy and federation forwarding — no per-entity error or notice. Prefer an explicit `type` / `id` / `entities[]` selector when you need a precise candidate set | -           |
| `local`          | boolean        | `true` answers from local data only (no Context Source Registration is considered as matching; ETSI GS CIM 009 Table 6.3.18-1). `localOnly` is a backward-compatible alias. Non-Boolean values return `400 BadRequestData` (#2008)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `false`     |

> **GeoJSON 属性/型名のコンパクション (#1788 サブ項目 6):** `format=geojson` (または `Accept: application/geo+json`) がネゴシエートされた場合、Feature の `properties` キーおよび `properties.type` は JSON 表現と同じリクエスト-`@context` ルールでコンパクトされます (ETSI GS CIM 009 clause 5.5.7 — 上記の [Content Negotiation and @context](#content-negotiation-and-context) を参照)。この修正以前は、`toNgsiLd` (JSON) は名前をコンパクトする一方、GeoJSON トランスフォーマーは保存された (canonical/FQN) 名をそのまま出力していたため、同じエンティティが `Accept` に応じて異なる属性名を持つことがありました。コンパクトされるのは出力される `properties` キーのみです。`geometry` として選択される属性は**保存された**属性名と照合されるため、ジオメトリ選択はコンパクションの影響を受けません。
>
> **トップレベル `geometry` 選択 — `geometryProperty` (#2046):** ETSI GS CIM 009 clause 4.5.16.1 は選択アルゴリズムを定義しています。`geometryProperty` クエリパラメータは Feature `geometry` として使用する GeoProperty を指定し、**「このパラメータが存在しない場合、デフォルト名 `location` が使用される」**としています。パラメータ値はタームであり、保存された (canonical/FQN) 属性名と照合される前にリクエスト `@context` で展開されます — `@context` で定義された短縮名を渡すと、属性が FQN として保存されている場合でも機能します。エンティティに指定された GeoProperty が存在しない場合、または値が有効な GeoJSON ジオメトリオブジェクトでない場合、`geometry` は `null` になります (clause 4.5.16.1)。`location` へのフォールバックは**行われません**。同じ配線が 3 つの GeoJSON 対応バインディングすべてに適用されます — `GET /entities`、`GET /entities/{entityId}`、および `POST /entityOperations/query`。
>
> `geometryProperty` は **`geoproperty` とは異なるパラメータ**です (Table 6.4.3.2-1 は両方を定義しています)。`geometryProperty` は GeoJSON トップレベルの `geometry` を選択し、`geoproperty` はジオクエリがフィルタする GeoProperty を指定します。clauses 5.7.1 および 5.7.2 によると、*「`geometryProperty` パラメータが存在し、Accept Header が `application/geo+json` に設定されていない場合、BadRequestData タイプのエラーが発生する」* — したがって、GeoJSON 以外のレスポンスで指定すると、silent に無視されるのではなく `400 BadRequestData` が返されます。(GeonicDB は `?format=geojson` でも GeoJSON をレンダリングするため、チェックは「このレスポンスは GeoJSON か」であり、「Accept ヘッダーが厳密に geo+json か」ではありません。)
>
> **選択された GeoProperty は `properties` にも表示されます (#2046):** clause 4.5.16.2 は `properties` を\*「各 Property に対して 1 つのメンバー (**選択された GeoProperty を含む**)」\*と定義しており、annex C.2.3 の例では `geometry` と `properties.location` が並んで表示されています。この修正以前、GeonicDB はジオメトリ属性を `properties` から除外していたため、`location` が GeoJSON レスポンスから消えていました。現在は仕様が要求するとおり、両方の場所で出力されます。Clause 4.5.17.1 は簡略化された GeoJSON 表現に対して同じルールを述べています。
>
> **`pick` / `omit` は clause 4.21 の文法で検証する (#2277)**: ETSI GS CIM 009 clause 4.21
> *NGSI-LD Attribute Projection Language* は射影パラメータの文法を ABNF で定める。
>
> ```abnf
> orOp             = %x7C / %x2C                                 ; | ,
> ProjectionTerm   = AttrName *1(LinkedEntityTerm) *(orOp ProjectionTerm)
> LinkedEntityTerm = %x7B ProjectionTerm %x7D                    ; {ProjectionTerm}
> ```
>
> 従来 GeonicDB は `pick` / `omit` を素の `split(',')` で読んでおり、文法違反
> (`id;name` / `id,,name` / `id,locatedAt{name` / `id,locatedAt{{name}` / `id,locatedAt{,name}` /
> `id,locatedAt{}`) が **400 にならず、silent に「射影なし」へ落ちて**いた
> (`id,,name` は一覧クエリで 5xx になっていた)。現在はいずれも `400 BadRequestData` を返す。
>
> * `,` と `|` はどちらも orOp。`pick=name|category` は正当。
> * `AttrName` は clause 4.9 の `unicodeLetter *TermChar` (`TermChar` = 文字 / 数字 / `_`)。
>   **GeonicDB はこれに加えて絶対 IRI も受理する** — #1649 以降、属性名は canonical (FQN) で
>   保存されるため `pick=https://uri.etsi.org/ngsi-ld/default-context/name` は正当な指定。
> * Entity member の `id` / `type` / `scope` は `AttrName` の形を満たすので従来どおり書ける。
> * **`LinkedEntityTerm` (波括弧) は `join` が無ければ `400 BadRequestData`**、
>   ネスト深さが `joinLevel` を超えても `400` (clause 5.7.1.4 / 5.7.2.4)。
>   **`join=inline` / `join=flat` と併用するとリンク先へ射影が適用される (#2291)** —
>   inline は `entity` / `entityList`(および keyValues の置換値)へ、flat は配列末尾の
>   リンク先エンティティへ、`{...}` 内の ProjectionTerm を再帰適用する。
>   `omit=observation{humidity}` のように LinkedEntityTerm 付きの omit は親の Relationship を
>   残し、リンク先から指定属性だけを外す(親名だけの `omit=observation` は従来どおり親から除去)。
>
> **`pick` / `omit` は Entity member (`id` / `type` / `scope`) にも効く (#2275)**: Table 6.4.3.2-1 /
> 6.5.3.1-1 は各値が Entity member であると定める。4.5.1 の「正規形 Entity は id/type 必須」は
> 射影の禁止ではない。単体取得で射影後に member が残らなければ `404 ResourceNotFound`
> (Query は `200`)。`omit` ∩ `attrs` は `400 BadRequestData`。

> **未知クエリパラメータは `400 InvalidRequest` (#2278。#1664 の逸脱を解消)**: ETSI GS CIM 009 - 6.3.20 は
> 「operation と両立しないパラメータ」に `400 InvalidRequest` を返すべき (should) としている。
> 従来 GeonicDB は `options` の**値** (トークン) だけを検証し、**未知のクエリパラメータ名**は
> silent に無視していた (#1664 時点の意図的逸脱)。#2278 でこれを解消し、
> `GET /entities` / `GET /temporal/entities` / `GET /types` / `GET /attributes` / `GET /subscriptions` は
> 許可集合に無いパラメータ名を `400 InvalidRequest` で弾く。
> **挙動変更**: `/types` / `/attributes` / `/subscriptions` の `?type=` は照合に使われず silent に無視されていたが、
> これらのオペレーションでは未定義のパラメータなので `400` になる。
> 許可集合は **当該リソースの ETSI Query parameters 表 ∪ GeonicDB 独自拡張** で、

> `localOnly` / `csf` / `spatialId` / `join` / `crs` / `pageToken` / `orderBy` / `orderDirection` /
> `orderByDistance` / `splitEntities` / `typePattern` / `spatialIdDepth` は引き続き受理される。
> 仕様が定義しているが GeonicDB が未実装のパラメータ (`containedBy` / `entityMap` 等) も
> 許可側に置く (operation と "incompatible" ではないため)。
> **MCP / A2A は対象外** — clause 6.3.20 は HTTP バインディングの規定であり、両者はその binding ではない。
>
> **「広すぎるクエリ」は `400 BadRequestData` (#2278 / #2290)**: clause 5.7.2.4 / 5.7.4.4 は
> `GET /entities` / `GET /temporal/entities` と、同じ操作の POST バインディング
> (`POST /entityOperations/query` = clause 6.23.3.1、`POST /temporal/entityOperations/query` = clause 6.24.3.1)
> について
> *"At least one of the following input data shall be provided: a) selector of Entity Types;
> b) list of Attribute names, including at least one non-system Attribute; c) NGSI-LD Query,
> including at least one non-system Attribute; d) NGSI-LD GeoQuery; e) local scope ...
> If none of the above is provided, then an error of type BadRequestData shall be raised (too wide query)."*
> と定める。**`id` / `idPattern` だけの指定は免除にならない** (clause 5.7.2.3)。
> POST では `type: "Query"` はリクエスト型の sentinel であり、Entity Type セレクタには数えない。
> 免除 (e) local scope は POST でもクエリパラメータ `local=true` (clause 6.3.18)。
> **破壊的変更**: 絞り込みの無い一覧 (`GET /entities`、`GET /entities?count=true`、
> `GET /entities?id=...`、`GET /temporal/entities` の id / timerel だけ、
> `POST /entityOperations/query` および `POST /temporal/entityOperations/query` の id だけの body) は `400 BadRequestData` になる。全件を取りたい場合は
> **`local=true`** (免除条件 e) を付けるか、`type=` / `entities[].type` / `attrs` / `q` / `geoQ` 等の絞り込みを指定する。

##### Entity Ordering (orderBy)

> **ETSI GS CIM 009 V1.9.1 Reference**: §4.23 Entity Ordering Language / §5.2.43 OrderingParams

`orderBy` は v1.9.1 Entity Ordering Language を受理する (#1580 / #1661):

```text
orderBy = AttrName [";" directionOp] *("," AttrName [";" directionOp])
directionOp = asc | desc | dist-asc | dist-desc
```


* **方向付き単一キー**: `orderBy=temperature;desc` (デフォルトの方向は `asc`)。`directionOp` は大文字小文字を区別しない (`;DESC` も受理される)。
  
* **複合キー** (カンマ区切り、同順位の場合は左から右に評価される): `orderBy=type;asc,temperature;desc`。
  
* **パス**: ドット記法 (`name.observedAt`) とブラケット記法 (`address[city]`、同等のドットパスに正規化される) が受理される; entity メンバー `id` / `type` / `scope` も使用可能。
  
* **距離ソート**: `dist-asc` / `dist-desc` は GeoProperties の距離でソートする; `orderBy=geo:distance` (`near` geo-query と共に) は `$geoNear` 距離ソートパスを経由する。
  
* **文法違反** (例: `;ascending`、空の項、末尾カンマ、不正なブラケット) は `400 BadRequestData` を返す。構文的に有効だが**存在しない属性はエラーではない** — §4.23.2 混合型順序付けに従い、属性が欠けている entity は最後にソートされる。
  
* 式ごとに最大 **20** 個の順序付け項 (`SECURITY.MAX_ORDER_BY_TERMS`); それを超えると `400` を返す。
  
* 同じ構文はバッチクエリ (`POST /entityOperations/query`) および temporal クエリエンドポイントで受理される。temporal クエリは追加で、`orderBy` と `aggrMethods` の組み合わせを拒否し、暗号化されたテナントでの属性値ソートを `400` で拒否する。

> **レガシー記法 (GeonicDB、非推奨)**: v1.9.1 以前の記法 — `orderBy=!attr` (降順を示す先頭の `!`) と個別の `orderDirection` パラメータの組み合わせ — は後方互換性のためにまだ受理され、コントローラー境界で正規文法に変換される (明示的な `orderDirection` は `!` より優先される)。新しいクライアントは `;`-direction 構文を使用すべきである。

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

> **`count` が受理する値 (#1904)**: `count` は ETSI GS CIM 009 Table 6.3.13-1 に従い **Boolean** である。
> `count=true` は `NGSILD-Results-Count` ヘッダーを設定する; **`count=false` は受理され**、単にそれを省略する
> (200、エラーではない)。その他の値 — `yes`、`1`、`True`、空 — は Boolean の字句形式ではないため
> **`400 BadRequestData`** を返す。これは全ての NGSI-LD リストエンドポイント (entities、batch query、
> attributes、csourceSubscriptions、entityMaps、jsonldContexts、registrations、snapshots、subscriptions、
> types、temporal) に適用される。NGSIv2 は `options=count` を使用し、影響を受けない。

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

> **予約済み Core Context 非具象化 Property 名 (#2522 / #2538)**: ETSI GS CIM 009 clause 4.5.1 は Core Context 非具象化 Property を Attribute 名として使用することを禁止しています。GeonicDB は entity / batch / temporal 書き込みパス (MCP/A2A temporal ツールを含む) において、`400 BadRequestData` で (compact 名または Core FQN `https://uri.etsi.org/ngsi-ld/<name>`、大文字小文字を区別) を拒否します: `createdAt` / `modifiedAt` / `deletedAt` / `expiresAt` / `observedAt` / `lastUsedAt` / `datasetId` / `instanceId` / `unitCode` / `valueType` / `lang` / `entityIdSealed` / `entityTypeSealed`。Entity レベルの `expiresAt` は ISO 8601 TTL 文字列として許可されたままです (clause 4.22)。`options=sysAttrs` レスポンスからの `createdAt` / `modifiedAt` / `deletedAt` / `expiresAt` の ISO 文字列エコーは、システム属性として無視されます (ユーザー Attribute として扱われません)。近似名 (`observed_at`、`ObservedAt`、`https://example.org/observedAt`、…) は受け入れられます。**Attribute 内部メンバー** で同じトークンを持つもの (例: Property `observedAt` / `unitCode` / `datasetId` / `valueType`) は有効なメタデータとして残り、拒否されません。予約名 Attribute を既に保存している既存の entity は、システム値が要求されていない場合 GET で返し続けます。`options=sysAttrs` (または entity レベルの `expiresAt`) が同じキーのシステム値を出力する場合、システム値が優先されます。`DELETE /entities/{id}/attrs/{reservedName}` と temporal attribute DELETE は許可されたままなので、クライアントはレガシー Attribute をクリーンアップできます。
>
> **Sub-attributes (#1581)**: attribute はユーザー定義の sub-attribute (Property of Property、Relationship of Property など — ETSI GS CIM 009 clause 4.5) を持つことができます。例: `"airQualityLevel": { "type": "Property", "value": 2, "accuracy": { "type": "Property", "value": 0.9 } }`。1 レベルの sub-attribute が保存され、読み取り時に (normalized および concise で) 返されます。より深いネスト (sub-attribute 自身の sub-attribute) は保持されません。
>
> **Concise メタデータと再帰的 sub-attributes (#1761 / #1779 / #3838)**: concise 出力では、予約済みメタデータは実際に保存されているものから復元されます: `observedAt`、`unitCode`、`valueType`、および書き込み時にそれを保持する attribute タイプの `datasetId` (ETSI GS CIM 009 clause 4.5.2.3)。`GeoProperty` と `LanguageProperty` は現在書き込み時に `datasetId` を保持しないため、これらのタイプでは normalized および concise 出力の両方から `datasetId` が欠落します (#1795 で追跡中)。これは取り込み側の制限であり、concise フォーマットの制限ではありません。`unitCode` は ETSI が明示的に禁止している unitless タイプ (`Relationship`、`ListRelationship`、`LanguageProperty`、`VocabProperty`、`JsonProperty`; clauses 4.5.3.3 / 4.5.22.3 / 4.5.18.3 / 4.5.20.3 / 4.5.24.3) では省略されます。Sub-attributes は concise 表現で再帰的にシリアライズされます: 自身の sub-attributes を持たない sub-Property は bare 値に折りたたまれ、sub-Relationship は `type` **なし** でエンベロープを保持します (`{ "object": ... }` — #3838 / ETSI 018\_23)。トップレベルの concise Relationship / LanguageProperty / JsonProperty / VocabProperty / List\* も同様に推測可能な `type` を省略します。メタデータのない GeoProperty は bare GeoJSON です。
>
> **Multi-target Relationship (#1615)**: `Relationship.object` は単一の URI または **URI の配列** (ETSI `oneOf: string | array`) を受け入れます。例: `"locatedAt": { "type": "Relationship", "object": ["urn:ngsi-ld:City:Paris", "urn:ngsi-ld:City:Lyon"] }`。配列形式 (1 から `MAX_QUERY_ATTRS` URI、デフォルト 50) は配列として保存および返されます。
>
> **Sub-attribute 名と term 展開 (#1788 sub-item 4)**: Sub-attribute 名は、Attribute および Entity Type 名と同じ term ⇄ URI 等価性の対象となります (ETSI GS CIM 009 clause 5.5.7 — "Property, Relationship or Type names")。短縮名はリクエスト `@context` で展開され、Fully Qualified Name として保存され、レスポンスは **そのリクエストによって提供された `@context`** を使用してそれをコンパクト化します (clause 5.5.5)。したがって、sub-attribute 名は短縮名 (`^[A-Za-z0-9_]+$`) または絶対 IRI のいずれかとして与えることができます。絶対 IRI ではないドット付き名前 (例: `unit.code`) は依然として `400 BadRequestData` で拒否されます。予約済み attribute メンバー (`observedAt`、`unitCode`、`datasetId`、`valueType`) はこの意味での名前 **ではなく**、決して変換されません。同じ attribute の 2 つの sub-attribute 名が同じ出力名にレンダリングされる場合、その attribute は代わりに保存された名前でレンダリングされます (データ保存がコンパクト化に勝つ — トップレベル attribute 名と同じルール)。これは normalized および concise 出力、単一 attribute 取得 (`GET /entities/{entityId}/attrs/{attrName}`)、およびサブスクリプション通知に適用されます。
>
> **Concise 入力 (#1793 / #3838)**: Concise / mixed attribute ボディ (bare Property 値、typeless `{ "value": … }` / `{ "object": … }`、bare GeoJSON) は、`options=concise` を **要求せずに** Create / Append / Update Attributes / Replace Entity / Merge Entity / Replace Attribute で受け入れられます (ETSI 001\_16 / 010\_13 / 011\_10 / 054\_05 / 055\_04 / 056\_11)。`options=concise` は明示的なエイリアスとして受け入れられたままです。attribute オブジェクトのメンバーで予約済みのもの以外は、ユーザー定義の sub-attributes として取り込まれ、clause 4.5.2.3 に一致します。bare スカラー (`"accuracy": 0.5`) は sub-Property になり、オブジェクト形式 (`"providedBy": {"object": "urn:..."}`) は値メンバーから型付けされます。Append のオプション語彙は `noOverwrite` のみのままです (clause 5.6.3) — concise はボディから推測され、オプションからではありません。
>
> **VocabProperty 値と term 展開 (#1788 sub-item 5)**: ETSI GS CIM 009 clause 5.5.7 は "Property, Relationship or Type names **and VocabProperty values**" を term ⇄ URI 等価性の対象としてリストしています。短縮名として与えられた `vocab` 値はリクエスト `@context` で展開され、Fully Qualified Name として保存され、レスポンスはそのリクエストによって提供された `@context` を使用してそれをコンパクト化します — これは Attribute および Entity Type 名に適用されるルールと全く同じです。`vocabMap` の場合、**値** のみが変換されます。キーは言語タグであり、term ではありません。sub-attribute として現れる VocabProperty は同じ方法で変換されます。クエリは次のようになります: `q=fuel=="diesel"` は正規の FQN で保存された entity にマッチし、同じ entity は別の term を同じ URI にマップする別の `@context` を通じて見つかります。クエリ側の拡大は **VocabProperty に制限** されます (attribute ドキュメントの `type` が条件の一部)。したがって、plain Property での値比較は影響を受けません。
>
> **Attribute `valueType` (#1580 / #3740)**: オプションのメンバー `valueType` (ETSI GS CIM 009 clause 4.5.2; ETSI TS 104 175 clause 5.2.5) は、`Property`、`GeoProperty`、`ListProperty`、`LanguageProperty`、`JsonProperty`、`VocabProperty` で書き込み時に保存され、読み取り時に (normalized および concise 表現で) 保持されます。空文字列は `400 BadRequestData` で拒否されます。`LanguageProperty` では `"langString"` と等しくなければならず (clause 5.2.6.4.6)、そうでなければ `400 BadRequestData` です。`Relationship` と `ListRelationship` には `valueType` がありません: 1 つ供給すると `400 BadRequestData` になります。(`unitCode` は `Property` のみのままです。)
>
> **ListRelationship `objectList` (#3837 / #3855)**: ETSI TS 104 175 clause 5.2.37 / GS CIM 009 clause 4.5.22 によると、`objectList` は URI 文字列の配列または `{"object": "<URI>"}` オブジェクトの配列 (混在しない) を受け入れます。**Normalized** レスポンス (および normalized 通知 / temporal インスタンス、`previousObjectList` を含む) は常にオブジェクト形式を返します。**Concise** と **keyValues** は文字列配列形式を保持します。単一要素 `["urn:ngsi-ld:null"]` または `[{"object":"urn:ngsi-ld:null"}]` は attribute を削除します (clause 4.5.0 / 4.5.22.2)。同じ URI / 配列 / max-`MAX_QUERY_ATTRS` (50) チェックは **sub-attributes** の `objectList` にも適用されます (#3855)。非 URI 文字列、非配列、および max 超えリストは `400 BadRequestData` です。
>
> **Concise 複数 attribute 配列要素はオブジェクト (#2573)**: ETSI GS CIM 009 clause 4.5.2.3 / 4.5.5 は、複数インスタンス concise attributes が JSON-LD **オブジェクトの配列** であることを要求します。したがって、GeonicDB は `GET ?options=concise` および concise 通知で各複数 attribute インスタンスを常にオブジェクトとしてレンダリングします (例: デフォルト Property インスタンス `{ "value": 42 }`、bare `42` ではない)。clause 4.5.2.3 最初の形式の bare 値短縮は依然として **単一インスタンス** attributes にのみ適用されます。書き込み時 (`options=concise`) では、すべての配列要素が最初に分類されます: すべて attribute 形状 → 複数 attribute (`datasetId` なしでデフォルトインスタンスは最大 1 つ)。すべて plain → Property 配列値。**mixed → `400 BadRequestData`** (順序非依存)。`[55, {"value":54,"datasetId":"..."}]` のような手書きレガシー形状は拒否されます — `[{"value":55},{"value":54,"datasetId":"..."}]` として書き直すか、Property 配列値が意図されている場合は `{"value":[...]}` を使用してください。
>
> **Foreign value メンバー (#2525)**: 宣言された attribute タイプに属さない値運搬メンバー (例: `Property` での `object` / `languageMap` / `json` / `vocab` / `valueList` / `objectList`、または `LanguageProperty` での `value`) は、すべての完全形式 **Entity API** 書き込みパス (create / append / update attributes / replace entity / replace attribute / batch) で `400 BadRequestData` で拒否されます。これは ETSI GS CIM 009 clause 4.5.2.2 (および他の attribute タイプの対応する "shall never be present" リスト) と clause 5.5.4 に従います。`previousValue` などの同一タイプ出力専用メンバーは Table 5.2.5-2 に従って無視されたままです (拒否されません)。`VocabProperty` の `vocabMap` は GeonicDB 拡張として受け入れられます (Table 5.2.35-1 は `vocab` のみをリスト)。**Temporal API 書き込みパスはここではカバーされません** (別の attribute-instance スキーマを使用します。Temporal セクション / 追跡問題を参照)。
>
> **Foreign 出力専用メンバー (#2533)**: 別の attribute タイプに属する `previous*` / `entity` / `entityList` メンバー (例: `Property` での `previousObject` / `entity`、または `Relationship` での `previousValue`) は、**短縮名** で送信された場合、Entity API 書き込みパスで同様に `400 BadRequestData` で拒否されます (clause 4.5.2.2 Prohibited + clause 5.5.4)、**concise** 入力を含む (normalized と同じ差分セット)。同一タイプ出力専用メンバーは **無視** されます (Table 5.2.x-2 / clause 4.5.3.2 / 4.5.22.2): Property/GeoProperty/TemporalProperty `previousValue`、Relationship `previousObject`+`entity`、LanguageProperty `previousLanguageMap`、JsonProperty `previousJson`、VocabProperty `previousVocab` (および GeonicDB 拡張 `previousVocabMap`)、ListProperty `previousValueList`、ListRelationship `previousObjectList`+`entityList`。短縮名 attribute オブジェクトは保存されません。`@context` term 展開後にのみそれらの名前に到達する入力 (インラインエイリアスまたはメンバーキーとしての絶対 IRI) は依然としてメタデータに永続化される可能性がありますが、**読み取りはそれらを決して返しません** (normalized および concise) — これは、それらの名前を sub-attributes / メタデータキーとして既に保存している **既存のドキュメント** にも適用されます: **マイグレーションも警告もありません**。そのようなキーは、すべての retrieve/query レスポンスから単に消えます。このドロップは意図的です (これは #2533 防御の読み取り側の半分であり、レガシー汚染も中和します)。それらのエイリアス / IRI 形式の書き込み側拒否 (`observedAt` / `unitCode` / `datasetId` などの正当な NGSI-LD メンバーの許可リスト) は #2572 で追跡されています。**Temporal API 書き込みパスはカバーされていません** (#2525 と同じ除外)。**MCP / A2A** は HTTP と同じリーフ差分セット (`listPresentForeignValueMembers`) を使用し、宣言された `type` が不明であっても、`ALL_ATTRIBUTE_VALUE_MEMBERS` のうち 2 つ以上を提示する attribute オブジェクトを追加で拒否します (#2532)。Concise **配列** (複数 attribute) 形式は #2573 (HTTP) でカバーされます。MCP/A2A 配列形式は依然として #2570 です。
> **Transient Entity (expiresAt)**

entity に `expiresAt` フィールド (ISO 8601 形式) を指定することで、有効期限を持つ Transient Entity として作成されます。有効期限は将来の日付である必要があります。

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "id": "urn:ngsi-ld:Room:temp-001",
  "type": "Room",
  "temperature": { "type": "Property", "value": 23.5 },
  "expiresAt": "2030-01-01T00:00:00Z"
}
```

**Response**

* Status: `201 Created`
  
* Status: `409 AlreadyExists` 同じ ID を持つ entity が既に存在する場合 (タイプに関係なく)
  
* Header: `Location: /ngsi-ld/v1/entities/urn:ngsi-ld:Room:001`

> **注**: Entity ID はテナントおよびServicePathスコープ内で一意です。同じ ID で異なるタイプの entity を作成すると `409 AlreadyExists` が返されます。詳細は [Entity ID Uniqueness](./endpoints.md#entity-id-uniqueness-geonicdb-extension) を参照してください。

> **GeoProperty 高度付き座標 (#1584)**: GeoProperty 値は GeoJSON ジオメトリ (RFC 7946) です。position は 2 要素 `[longitude, latitude]` または 3 要素 `[longitude, latitude, altitude]` の場合があります — オプションの第 3 要素 (altitude/elevation) は受け入れられ、読み戻し時に保持されます。空間インデックスおよび geo-queries には longitude/latitude のみが使用されます。3 要素を超える position は `400 BadRequestData` を返します (RFC 7946 §3.1.1 は position を 3 要素を超えて拡張することを推奨していません)。WGS84 以外の `crs` クエリパラメータが座標変換をトリガーする場合でも、altitude は保持されます: longitude/latitude のみが再投影され、altitude は変更されずに引き継がれます (これらの CRS には垂直データムがないため、altitude は再投影不変です) (#1595)。

#### 単一 Entity の取得

```http
GET /ngsi-ld/v1/entities/{entityId}
```

**Query Parameters**

| Parameter | Type   | Description                                                                                                                                                                                                                                                                                                                                                         |
| --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`    | string | Entity type, or an Entity Type Selection (ETSI GS CIM 009 clause 4.17: `A,B` / `A\|B` / `(A;B)`, `;` = AND). A single type name is limited to 256 characters, a selection to 2000 characters / 50 distinct types. If the entity matches no alternative, `404`. If several entities with the same id still match after narrowing, `409 TooManyResults` (#3756) |
| `attrs`   | string | Attribute names to retrieve (comma-separated)                                                                                                                                                                                                                                                                                                                       |
| `pick`    | string | Attribute names to retrieve, in the **NGSI-LD Attribute Projection Language** (ETSI GS CIM 009 clause 4.21). Mutually exclusive with `omit` and `attrs`. Entity members `id` / `type` / `scope` may be listed. Syntax violations return `400 BadRequestData` (#2277)                                                                                                |
| `omit`    | string | Attribute names (or Entity members `id` / `type` / `scope`) to exclude, same projection language as `pick`. Mutually exclusive with `pick` and `attrs`. The result may no longer be a valid NGSI-LD Entity (#2275)                                                                                                                                                  |
| `lang`    | string | Language filter for LanguageProperty (BCP 47)                                                                                                                                                                                                                                                                                                                       |
| `format`  | string | Output format (`normalized`, `concise`, `keyValues`, `simplified`, `geojson`). `format` is prioritized over `options`. Unknown values are rejected with `400 InvalidRequest`. `geojson` can also be specified with `Accept: application/geo+json` header                                                                                                            |
| `options` | string | `keyValues`, `concise`, `sysAttrs`                                                                                                                                                                                                                                                                                                                                  |

> **単一取得での GeoJSON 出力 (#1759)**: `format=geojson` (または `Accept: application/geo+json`) は `Content-Type: application/geo+json` で GeoJSON **Feature** オブジェクトを返します。対照的に、`GET /ngsi-ld/v1/entities` は GeoJSON **FeatureCollection** を返します。リストエンドポイントと同様に、`properties` キーと `properties.type` はリクエスト `@context` でコンパクト化されます (#1788 サブ項目 6、上記の [Retrieve Entity List](#retrieve-entity-list) の下の注を参照)。

> **`attrs` と 404 (#1619)**: `attrs` が指定され、entity が要求された attributes の **いずれも** 持っていない場合、`404 Not Found` が返されます (ETSI GS CIM 009 clause 5.7.1 / OpenAPI `Query.attrs`: "If the Entity does not have any of the Attributes in attrs, then a 404 Not Found shall be retrieved")。これは単一 entity 取得に適用されます。list/query エンドポイントは代わりに空のコレクション (`200`) を返します。

> **パス `{entityId}` URI 検証 (#1692)**: すべての NGSI-LD by-id エンドポイント (entities、subscriptions、csourceRegistrations、temporal entities、jsonldContexts) で、構文的に有効な URI ではないパス id (例: `not-a-uri`) は、存在チェックの **前に** `400 BadRequestData` で拒否されます — 決して `404` にはなりません (ETSI GS CIM 009 clause 5.7.1 / 5.8.3: URI 有効性は資源ルックアップの前にチェックされます)。存在しない有効な URI は通常通り `404 Not Found` を返します。

#### Entity の置き換え

```http
PUT /ngsi-ld/v1/entities/{entityId}
```

entity のすべての attributes を置き換えます。リクエストボディに含まれていない Attributes は削除されます。ボディに `scope` を含めると entity の scope が置き換えられます。省略すると既存の scope が保持されます。単一の文字列または文字列の配列を渡します。`scope: null` または `scope: []` を送信すると、明示的に scope が解除されます (**GeonicDB 拡張**、`docs/INTEROPERABILITY.md` を参照)。

**Response**: `204 No Content`

#### Entity の更新

```http
PATCH /ngsi-ld/v1/entities/{entityId}
```

**Merge-Patch セマンティクス** (ETSI GS CIM 009 clause 5.6.17 / 5.5.12):


* 言及されていない attributes および attribute メンバーは保持されます。マージは任意の深さで適用されます (RFC 7396 オブジェクトレベル置換ではない): `value` / `json` / `languageMap` オブジェクトはキーごとにマージされ、`unitCode` / `observedAt` / sub-attributes などのメタデータはフラグメントで名前が付けられない限り保持されます。
  
* `urn:ngsi-ld:null` はそのメンバーを削除します。LanguageProperty は `languageMap: { "@none": "urn:ngsi-ld:null" }` で削除されます。`datasetId` がない場合、デフォルトインスタンスのみが削除されます (clause 5.6.5.4)。`datasetId` 自体を `urn:ngsi-ld:null` に設定することは `400 BadRequestData` です。
  
* **`vocabMap` NGSI-LD Null (GeonicDB 独自拡張 / #2545)**: `vocabMap` 自体は ETSI Table 5.2.35-1 に含まれていません(`vocab` のみが含まれています)。GeonicDB は `vocabMap` を多言語 vocab 値メンバーとして受け入れます。属性全体の Null は `languageMap` と同じマップ形式を使用します(clause 4.5.0 / 4.5.18 の先例):`vocabMap: { "@none": "urn:ngsi-ld:null" }`。マージ / 部分更新時、この形式は属性を削除します(clause 5.5.12 / 5.5.8 / 5.6.4)。作成 / 追加 / 置換時は `400 BadRequestData` で拒否されます(clause 5.5.4)。単純な文字列 `vocabMap: "urn:ngsi-ld:null"` はスキーマ無効のままです(`z.record`)。エントリレベルの `{ "en": "urn:ngsi-ld:null" }` は属性全体の Null ではありません(`languageMap` エントリマージと同じ境界)。
  
* 空のエンティティ id(パス正規化後の `PATCH /ngsi-ld/v1/entities/`)は `400 BadRequestData` です(clause 5.6.17.4)。


* エンティティのいずれかの型(型リストはセットであり、順序は関係ありません)に対してアクティブなカスタムデータモデルが属性を `required: true` としてマークしており、その属性が消失する場合、代わりに `400 Bad Request` を返します(**GeonicDB 拡張**、#3454)。[Multiple entity types](./endpoints.md#entity-validation) を参照してください。
  
* ボディに `scope` を含めるとエンティティの scope が置き換えられます。省略すると既存の scope が保持されます。単一の文字列または文字列の配列を渡します。`scope: null` または `scope: []` を送信すると、明示的に scope が解除されます(**GeonicDB 拡張**、`docs/INTEROPERABILITY.md` を参照)。
  
* クエリパラメータ `options=keyValues`(または `simplified`)を指定すると、keyValues 入力形式が選択されます。Concise / mixed ボディは `options=concise` **なしで**受け入れられます(#3838)。このオプションは互換性のある明示的なフラグとして残ります。

**レスポンス**: `204 No Content`

#### Add Attributes

```http
POST /ngsi-ld/v1/entities/{entityId}
Content-Type: application/ld+json
```

**クエリパラメータ**

| Parameter             | Description                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| `options=noOverwrite` | Do not overwrite existing attributes (existing attributes are preserved, only new attributes are added) |

**レスポンス**: `204 No Content`

#### Partial Update of Multiple Attributes

```http
PATCH /ngsi-ld/v1/entities/{entityId}/attrs
Content-Type: application/ld+json
```

エンティティの複数の属性を部分的に更新します。リクエストボディに含まれる属性のみが更新され、含まれない属性は保持されます。このエンドポイントは現在、ボディ内の `scope` フィールドには対応して**いません** — scope を更新するには、代わりに `PATCH /entities/{entityId}`(Update Entity)または `PUT /entities/{entityId}`(Replace Entity)を使用してください。

**リクエストボディ**

```json
{
  "temperature": {
    "type": "Property",
    "value": 25.0
  }
}
```

**レスポンス**: `204 No Content`

#### Delete Entity

```http
DELETE /ngsi-ld/v1/entities/{entityId}
```

**レスポンス**: `204 No Content`

#### Retrieve All Attributes of an Entity

```http
GET /ngsi-ld/v1/entities/{entityId}/attrs
```

エンティティのすべての属性を取得します。

**レスポンス**: `200 OK`

#### Retrieve Single Attribute

```http
GET /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
```

エンティティの特定の属性を取得します。

**クエリパラメータ**(ETSI TS 104 175 clause 10.4.4):

| Parameter   | Description                                                                                                                                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `type`      | Entity type selector: a type name or an Entity Type Selection (clause 4.17: `A,B` / `A\|B` / `(A;B)`). If the entity's type does not match, `404 Not Found` is returned. If several entities with the same id still match after narrowing, `409 TooManyResults` (#3756). |
| `lang`      | Language filter (clause 4.15). A `LanguageProperty` is returned as a `Property` whose `value` is the matching `languageMap` entry, with a `lang` sub-property naming the chosen language.                                                                                      |
| `datasetId` | Selects the attribute instance(s) by `datasetId` (`@none` selects the default instance).                                                                                                                                                                                       |

**レスポンス**: `200 OK`

**エラー**: 次の場合に `404 Not Found`(`ResourceNotFound`):


* エンティティまたは属性が存在しない
  
* `type` が指定されており、エンティティの型と一致しない
  
* `datasetId` が指定されており、一致するインスタンスがない
  
* `datasetId` が指定されて**おらず**、属性にデフォルトインスタンス(`datasetId` のないインスタンス)がない

> **移行(#3741)**: `datasetId` を持つインスタンスのみを持つ属性は、以前は `datasetId` なしで取得された場合に `200` を返していました。現在は `404` を返します。`?datasetId=<id>` で取得してください。デフォルトインスタンスが存在する場合、動作は変更されていません(複数のインスタンスがある場合、すべてのインスタンスが配列として返されます)。

#### Retrieve Attribute Value

```http
GET /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}/value
```

特定の属性の**値のみ**を取得します (ETSI TS 104 176 clause 7.6.3.1 / TS 104 175 clause 10.4.4)。レスポンスボディは JSON プリミティブ、オブジェクト、または配列であり、JSON-LD Attribute Fragment では**ありません**。`Content-Type` は常に `application/json` です。

**クエリパラメータ** (Retrieve Single Attribute と同じ選択セマンティクス):

| Parameter   | Description                                                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `type`      | Entity type selector                                                                                                          |
| `lang`      | Language filter: a `LanguageProperty` yields the selected language string (or string array) instead of the full `languageMap` |
| `datasetId` | Selects the attribute instance(s) by `datasetId`                                                                              |

**レスポンス**: `200 OK` と値のみ。

**エラー**:


* `400 Bad Request` `entityId` が有効な URI でない場合
  
* `404 Not Found` エンティティまたは属性が不明な場合 (Retrieve Single Attribute と同じケース)
  
* `406 Not Acceptable` `Accept` に `application/json` が含まれていない場合 (このエンドポイントは JSON のみ。`application/ld+json` のみは拒否されます)

#### Set Attribute Value

```http
PUT /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}/value
Content-Type: application/json
```

既存の属性インスタンスの**値のみ**を設定します (ETSI TS 104 176 clause 7.6.3.2 / TS 104 175 clause 10.2.6)。既存の属性の `type` は保持されます。リクエストボディは値のみの Attribute Fragment (JSON プリミティブ、オブジェクト、または配列) です。

**クエリパラメータ**:

| Parameter    | Description                                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `type`       | Entity type selector                                                                                                                     |
| `datasetId`  | Selects the attribute instance to update (`@none` = default instance)                                                                    |
| `observedAt` | DateTime. When the Attribute already had `observedAt`, this value replaces it; if the query is omitted, existing `observedAt` is removed |

**レスポンス**: `204 No Content`。

**エラー**:


* `400 BadRequestData` `entityId` / 属性名が無効な場合、またはターゲット属性が `scope` の場合
  
* `400 InvalidRequest` ボディが有効な JSON でない場合、または `null` / `"urn:ngsi-ld:null"` の場合 (`JsonProperty` を除く)
  
* `404 Not Found` エンティティまたは属性インスタンスが不明で、かつ一致する排他的/リダイレクト登録が適用されない場合
  
* `409 Conflict` 排他的/リダイレクト Context Source Registration が一致するが、その `operations` に `setAttributeValue` が含まれていない場合 (#3864)

> **フェデレーション (#3864):** Set Attribute Value は同じ形式の HTTP リクエスト
> (`PUT .../attrs/{attr}/value`、値のみの JSON ボディ、`datasetId` / `observedAt` / `type` クエリ) として転送されます。
> 登録の `operations` ゲートは個別の名前 `setAttributeValue` のみです。
> ETSI TS 104 175 V1.1.1 Table 9.2-1 / CIM 009 Table 4.20-1 にはこの操作はリストされていません。
> GeonicDB は暫定的な名前として `setAttributeValue` を使用し、
> `updateOps` / `redirectionOps` / `updateAttrs` / `replaceAttrs` には**含めません**。ETSI が後で別の
> 名前を採用した場合、GeonicDB はエイリアスを追加します。

#### Overwrite Attribute (PUT)

```http
PUT /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
Content-Type: application/ld+json
```

指定された属性を新しい値で完全に上書きします。属性が存在しない場合は `404 Not Found` を返します。

> **`scope` は置き換え可能な属性ではありません (#3841 / ETSI 055\_03\_05)**: `/entities/{id}/attrs/scope` に対する `PUT` / `POST` / `PATCH` (コンパクト名、Core FQN `https://uri.etsi.org/ngsi-ld/scope`、またはその IRI に展開される request-`@context` エイリアス) は、存在チェックの前に `400 BadRequestData` を返します (ETSI GS CIM 009 clause 5.6.19.4 / 5.6.4.4)。`scope` はエンティティメンバーです (clause 4.18)。これを変更するには、`PATCH` / `POST /entities/{id}/attrs` で `scope` メンバーを送信します (またはエンティティレベルの置換)。削除するには、`DELETE /entities/{id}/attrs/scope` を使用します (clause 5.6.5)。

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

指定された属性を新しい値で置き換えます。上記の PUT と同じ `scope` 拒否があります (#3841)。

**リクエストボディ**

```json
{
  "type": "Property",
  "value": 25.0
}
```

**レスポンス**: `204 No Content`

#### 属性の部分更新

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

> **注意**: エンティティまたは属性が存在しない場合、`404 Not Found` が返されます (ETSI GS CIM 009 V1.9.1 clause 5.6.4)。この操作は既存の属性の部分更新のみを実行し、新しい属性を作成しません。ターゲット属性 `scope` (Core FQN / `@context` エイリアスを含む) は clause 5.6.4.4 に従って `400 BadRequestData` で拒否されます — 上記の PUT の注意を参照してください (#3841)。

**Entity Fragment のセマンティクス** (clause 5.6.4 — *「部分更新は Entity Fragment で提供された要素のみを変更し、残りはそのままにします」*)

リクエストボディは *Entity Fragment* です: 変更したい要素のみを含める必要があります。送信しないメンバーはそのまま残るため、Context Brokerが既に保存しているものをエコーバックする必要はありません。

> 以下のフラグメントは**議論中のメンバーのみ**を示しています。すべての `application/ld+json` リクエストと同様に、実際のリクエストボディにはインライン `@context` も含まれます ([Content Negotiation and @context](#content-negotiation-and-context) を参照)。`application/json` の場合、コンテキストは代わりに `Link` ヘッダーを介して提供されます。


* **value メンバーは省略可能です。** `value` / `object` / `languageMap` / `json` / `vocab` / `vocabMap` (GeonicDB 拡張) / `valueList` / `objectList` はすべてオプションです。メタデータまたはサブ属性のみを含むフラグメントは有効であり、保存されている値と属性タイプは保持されます。

  ```json
  { "observedAt": "2026-08-06T18:30:00.000Z" }
  ```

  ```json
  { "providedBy": { "type": "Relationship", "object": "urn:ngsi-ld:Person:JohnDoe" } }
  ```


* **`type` は省略可能です。** フラグメントが value メンバーを含む場合、属性タイプはそれから推論されます (`object` → `Relationship`、`languageMap` → `LanguageProperty`、`json` → `JsonProperty`、`valueList` → `ListProperty`、`objectList` → `ListRelationship`、`vocab` / `vocabMap` (GeonicDB 拡張) → `VocabProperty`、GeoJSON 形式の `value` → `GeoProperty`、それ以外は `Property`)。フラグメントが value メンバーを含まない場合、保存されている属性タイプが保持されます。

  ```json
  { "languageMap": { "fr": "Grand Place", "es": "Gran Lugar" } }
  ```


* **送信する要素の検証は変更されていません。** 無効な `observedAt`、不正な形式の `languageMap`、非 URI の `object` などは、依然として `400 BadRequestData` を返します。


* **`application/ld+json` では `@context` は依然として必須です (#1927)。** value メンバーを省略できることは、`@context` には拡張されません: ETSI GS CIM 009 clause 6.3.5 は、`Content-Type` が `application/ld+json` の場合、`POST` / `PUT` / `PATCH` ボディの `@context` はペイロード自体から取得することを要求しており、それがないボディは `400 BadRequestData` を返します。`application/json` の場合は、代わりに `Link` ヘッダーを介して提供してください。これは、エンティティレベルのエンドポイントとまったく同じように、単一属性エンドポイントにも適用されます。


* **NGSI-LD Null は属性を削除します** (#2419 / ETSI 012\_05)。Clause 5.6.4.4 は **clause 5.5.8** の部分更新アルゴリズムを要求しており、これは値が NGSI-LD Null である Fragment メンバーを削除します (`datasetId` インスタンスは **clause 5.6.5** に委ねられます)。例えば `PATCH .../attrs/{attrName}` で `{ "type": "Property", "value": "urn:ngsi-ld:null" }` を送信すると、その属性 (または選択されたインスタンス) が削除され、`204` が返されます。これは `DELETE .../attrs/{attrName}` と同じ結果です。

  > **認証に関する注意**: XACML アクションは **HTTP メソッド** (`method`) に対してマッチングされます。`PATCH` を許可し `DELETE` のみを拒否するポリシーは、属性の破壊を**防ぎません** — クライアントは依然として `PATCH` + NGSI-LD Null で属性を削除できます (そして、エンティティレベルの `PATCH .../attrs` は既に `removeAttributes` を呼び出すことができます)。削除をブロックするには、`DELETE` だけでなく `PATCH` (および Null を受け入れる他の書き込みメソッド) も拒否してください。

> **PUT / POST は異なります。** 同じパスに対する `PUT` と `POST` は *Replace Attribute* (clause 5.6.19 — *「既存の属性インスタンスを完全に置き換える」*) です。これらは完全な属性を必要とします: value メンバーを省略すると `400 BadRequestData` が返され、提供されないメンバーは保持されるのではなく削除されます。

#### 属性の削除

```http
DELETE /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
```

**クエリパラメータ**

| Parameter   | Type    | Description                                         |
| ----------- | ------- | --------------------------------------------------- |
| `datasetId` | string  | datasetId of the multi-attribute instance to delete |
| `deleteAll` | boolean | If `true`, deletes all instances                    |

**レスポンス**: `204 No Content`

> **注意 (インスタンス選択、clause 5.6.5.4)**: `datasetId` が省略された場合、操作は**デフォルトインスタンス** (つまり `datasetId` を持たないインスタンス) をターゲットとします。属性にデフォルトインスタンスがない場合 (保存されているすべてのインスタンスが `datasetId` を持つ場合)、リクエストは `404 ResourceNotFound` を返します。そのようなインスタンスを削除するには、その `datasetId` を渡すか、`deleteAll=true` を渡してください。これは、属性が現在インスタンスの配列として保存されているか、単一のオブジェクトとして保存されているかに関係なく適用されます: 1 つのインスタンスに削減された属性は単一のオブジェクトにアンラップされ、アンラップは `datasetId` を持つインスタンスをデフォルトインスタンスに変換しません (#2177)。
>
> **注意**: **最後に残った属性** を削除することは許可されており、`204` を返します。NGSI-LD (ETSI GS CIM 009) は、エンティティが少なくとも 1 つの属性を保持することを要求していません — `id`/`type` のみで構成されるエンティティは有効であり、削除後も残ります。

> **注意 (GeonicDB 拡張)**: エンティティのタイプの**いずれか**に対してアクティブなカスタムデータモデルが属性を `required: true` とマークしている場合、これは `400 Bad Request` を返します — ただし、削除が属性を完全に削除する場合のみです (つまり、最後に残ったマルチ属性インスタンス、または `deleteAll` リクエスト)。タイプリストはセットです: 順序は重要ではなく、最初のタイプではないモデルでも削除をブロックします (#3454)。別のインスタンスが残っている間に `datasetId` で 1 つのインスタンスを削除すると、通常どおり `204` が返されます。同じルールがマージパッチ `urn:ngsi-ld:null` による削除にも適用されます。`required: false` の属性、および `isActive: false` のモデル上の属性は、依然として削除できます。
>
> 作成、更新、追加、置換時には、タイプリスト内のすべてのアクティブなモデルが一緒に適用されます。必須属性は和集合です。同じ属性名に対する制約は積集合です。いずれのモデルでも定義されていない属性は、解決されたすべてのモデルが `additionalProperties: false` である場合にのみ拒否されます。`ngsiType`、正規化された `valueType`、または `defaultValue` (両方が定義され、値が異なる) に関する不一致は `400 BadRequestData` となり、メッセージは両方のモデルを名指しします。`PATCH /custom-data-models/{type}?dryRun=true` はマルチタイプエンティティをカウントしますが、プレビューは候補モデル単独をチェックします — 他のタイプのモデルを組み合わせません。詳細: [Entity Validation](./endpoints.md#entity-validation)。

### マルチ属性 (datasetId)

> **ETSI GS CIM 009 リファレンス**: セクション 4.5.3 - Multi-Attribute

NGSI-LD では、同じ属性名に対して複数のインスタンスを保持できます。各インスタンスは `datasetId` (URI 形式) によって区別されます。`datasetId` を持たないインスタンスは「デフォルトインスタンス」と呼ばれ、属性ごとに最大 1 つまで存在できます。

#### 作成 (CREATE)

エンティティを作成する際、属性を配列形式で指定することで複数のインスタンスを作成できます。

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

上記の例では、`speed` 属性に対して 3 つのインスタンスがあります: GPS からの 1 つ、OBD からの 1 つ、そしてデフォルトインスタンスです。

#### 取得 (RETRIEVE)

エンティティを取得する際、マッチするインスタンスは **複数のインスタンスがマッチした場合のみ配列として** 返されます (ETSI GS CIM 009 clause 4.5.5.1)。単一のマッチするインスタンス — `?datasetId=` フィルタの後、またはインスタンスが削除された後を含む — は、単一の Attribute 要素として返され、1 要素の配列にはなりません (#2272)。`join` / `joinLevel` と組み合わせると、マッチする Relationship インスタンスのみが辿られます (#3668; [リンクされたエンティティの取得](#linked-entity-retrieval-joinjoinlevel) を参照)。

`keyValues` (簡略化) 形式では、マルチ属性は **複数のインスタンスがマッチした場合のみ**、`datasetId` をキーとする **`dataset` マップ** として返され、デフォルトインスタンス (`datasetId` を持たないもの) は JSON-LD キーワード `@none` でキー付けされます (ETSI GS CIM 009 clause 4.5.4 / 4.5.5.1, #1930 / #2272)。単一のマッチするインスタンスは素の値のままです。

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

`@none` キーはデフォルトインスタンスが存在する場合のみ存在します。同じ形式が `Relationship`、`ListProperty`、`ListRelationship` にも適用されます (clause 4.5.4 EXAMPLE 13 / 15 / 19)。`normalized` と `concise` も単一のマッチするマルチ属性インスタンスを折りたたみます; 配列は複数のマッチに対してのみ残ります。これは Attribute-instance 配列 (clause 4.5.5.1) であり、`ListProperty` / `ListRelationship` の値配列ではありません。

> \#1930 以前は、デフォルトインスタンス (存在しない場合は最初のインスタンス) のみが返されていたため、`keyValues` は `normalized` よりも暗黙的に少ない情報しか公開していませんでした。`keyValues` マルチ属性を読み取るクライアントは、現在 `dataset` を展開する必要があります。

#### 更新 (UPDATE)

単一属性エンドポイント (`PATCH` / `PUT` / `POST /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}`) では、操作はリクエストボディ内の `datasetId` によって選択された **1 つの属性インスタンス** をターゲットとします (ETSI GS CIM 009 clauses 5.6.4 / 5.6.19)。同じ属性の他のインスタンスはそのまま残されます (#1819)。

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

`PATCH` は提供されたメンバーを選択されたインスタンスにマージします (clause 5.6.4 — 提供されていないメンバーはそのまま残されます); `PUT` / `POST` は選択されたインスタンスを完全に置き換えます (clause 5.6.19)。

##### エンティティレベルの更新 (#1909)

**エンティティレベル** の更新操作は同じルールでインスタンスを選択しますが、**`ResourceNotFound` ゲートがありません** — 既存のインスタンスにマッチしない `datasetId` は、拒否されるのではなく **新しいインスタンスとして追加されます**。これは ETSI GS CIM 009 clause 5.5.8 の汎用パッチアルゴリズムに従っています: `datasetId` を持つメンバーは、`datasetId` が同じ場合のみ置き換えられ、*「そうでなければ、Fragment のメンバーはターゲットに新しいインスタンスとして追加されます」*。リクエストがターゲットとしないインスタンスはそのまま残されます。

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

エンティティレベルの更新では、作成時(条項 4.5.5)と同様に、属性を**インスタンスの配列**として提供することもできます。`datasetId` を省略できる要素は最大で 1 つです(デフォルトインスタンス)。複数省略すると `400 BadRequestData` になります。

#### 削除 (DELETE)

属性を削除する場合、`datasetId` クエリパラメータを指定すると特定のインスタンスのみが削除されます。`deleteAll=true` を指定するとすべてのインスタンスが削除されます。両方を省略すると**デフォルトインスタンス**(`datasetId` を持たないもの)が対象となり、存在しない場合は `404 ResourceNotFound` が返されます — 上記の [Delete Attribute](#delete-attribute) の注記を参照してください。

```http
DELETE /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}?datasetId=urn:ngsi-ld:dataset:gps
DELETE /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}?deleteAll=true
```

***

### バッチ操作 (NGSI-LD)

> **注意**: バッチ操作は 1 リクエストあたり最大 **1,000** エンティティまで処理できます。1,000 を超えるリクエストは `400 Bad Request` エラーになります。

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

#### バッチアップサート

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

* 作成されたエンティティが存在: `201 Created` (ボディ = **作成された**エンティティ ID のみの配列)
  
* すべてのエンティティが既に存在し更新された: `204 No Content`
  
* 部分的に成功 / エンティティ毎のエラー: `207 Multi-Status`

> **注意 (#2420 / ETSI 5.2.16)**: `207` ボディには常に BatchResult メンバーの
> `success` (成功した入力ごとに 1 つの ID) と `errors` (失敗した入力ごとに 1 つのエントリ) が含まれます。
> GeonicDB はエンティティ ID を分類するための拡張として `created` と `updated` を含みます。
> 重複するエンティティ ID は配列の順序で処理されます (clause 5.5.11.2)。`207` では、
> 同じ ID が `success` または `errors` に繰り返し出現する、または両方の配列に出現する可能性があります。
> クライアントは結果を集約する際に両方の配列とそのエントリを保持する必要があります。
> フェデレーテッドされた `207` で、繰り返された ID のどの入力が成功したかを識別できない場合、
> Context Brokerはこれらの曖昧な入力をエラーとして報告します。繰り返された ID を持つ暗号化書き込みの場合、
> 共有デッドラインがキールックアップ、暗号処理、キュー待機をカバーします。期限切れは
> 書き込みが送信されなかった入力に対して `ServiceUnavailable` を返し、コミットされた結果を保持します。
> 繰り返された ID を含む `207` を再試行する前に、エンティティを取得して保存されている状態を確認してください。
>
> **注意 (GeonicDB / #2420)**: デフォルト (マージ) と `options=replace` モードの両方は
> バルク書き込みを介して実行されます (重複する ID は最初にラウンドに分割されます)。無効な要素は
> エンティティごとの `207` エラーとして報告されます (リクエストレベルの `400` ではありません)、clause 5.6.8 / #2069 スタイルの
> 要素の帰属と一致します。デフォルトの **update** モードでは、既存のエンティティのタイプリストは
> ペイロードからの新しいタイプと**マージ**されます (clause 5.6.8.4 → 5.6.2.4 / #2455; タイプは
> 決して削除されません)。`options=replace` では、エンティティは `entityType` を含めて**完全に置換**されます (clause 5.6.18.4); 新しいタイプには宛先タイプの認可が必要です
> (`requireAuthzForNovelTypes`)。`scope` は 3 状態のセマンティクスに従います
> (`omitted`=保持、`null`/`[]`=解除、array=設定)。

#### バッチ更新

```http
POST /ngsi-ld/v1/entityOperations/update
```

**レスポンス**

* すべて成功: `204 No Content`
  
* 部分的に成功: `207 Multi-Status`

> **注意 (#2455)**: ペイロード `type` は文字列または空でない文字列配列にすることができます (Table 5.2.4)。新しいエンティティタイプは clause 5.6.9 → 5.6.2 / 5.6.3 に従って追加されます (`/attrs` と同じセマンティクス)。

#### バッチ削除

```http
POST /ngsi-ld/v1/entityOperations/delete
Content-Type: application/json
```

> **操作ごとの上限 (#3828)**: batch delete は **すべてのプランで 1 リクエストあたり最大 100 個のエンティティ ID** を受け付けます (`SECURITY.MAX_BATCH_DELETE_SIZE`)。この上限はプランの `maxBatchSize` / `customQuotas` とは独立しており、それらを介して引き上げることはできません。有効な制限 = `min(plan limit, 100)`。削除はエンティティごとに実行され、1 リクエストで 1,000 件は 29 秒の API Gateway タイムアウトを超過します (staging で測定)。上限を超えると `400 Bad Request` と `cannot exceed the per-operation limit` が返されます。同じ上限は `POST /ngsi-ld/v1/temporal/entityOperations/delete` にも適用されます。

**Request Body**

```json
[
  "urn:ngsi-ld:Room:001",
  "urn:ngsi-ld:Room:002"
]
```

**Response**

* すべて成功: `204 No Content`
  
* 部分的成功: `207 Multi-Status`

#### Entity Purge

```http
DELETE /ngsi-ld/v1/entities
```

Bulk purge はセレクタベースの削除と属性の変更をサポートします (ETSI GS CIM 009 clause 5.6.21 / 6.4.3.3)。

**Query Parameters**

| Parameter                                                                  | Type    | Description                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                                                                     | string  | Entity type selector (`*` supported)                                                                                                                                                                                                                                                                                                                  |
| `id` / `idPattern`                                                         | string  | Optional **refinements** (not sufficient alone — same contract as GET list / #2290)                                                                                                                                                                                                                                                                   |
| `q`                                                                        | string  | NGSI-LD query selector                                                                                                                                                                                                                                                                                                                                |
| `georel` / `geometry` / `coordinates` / `geoproperty` / `geometryProperty` | string  | Geo selector. On **this purge endpoint only**, `geometryProperty` is accepted as an alias of `geoproperty` (Table 6.4.3.3-1 lists both, but a purge has no GeoJSON response for a top-level `geometry` to select). On the GeoJSON-eligible read endpoints it is a **different** parameter — see [Retrieve Entity List](#retrieve-entity-list) (#2046) |
| `scopeQ`                                                                   | string  | Optional **refinement** (not sufficient alone — `scopeQ` alone → 400)                                                                                                                                                                                                                                                                                 |
| `attrs`                                                                    | csv     | Selector matching entities that have **any of** the listed attributes (OR, clause 5.6.21.4). Must include at least one **non-system** attribute name                                                                                                                                                                                                  |
| `keep`                                                                     | csv     | Keep listed attributes and remove the others. Counts as an attribute-name selector (clause 5.6.21.4). Must include at least one **non-system** attribute name                                                                                                                                                                                         |
| `drop`                                                                     | csv     | Remove only listed attributes. Same selector / non-system rules as `keep`                                                                                                                                                                                                                                                                             |
| `local` / `localOnly`                                                      | boolean | Local-only scope flag. `local=true` alone is allowed (clause 5.6.21.4 local scope); it is not an entity-match filter                                                                                                                                                                                                                                  |

**Validation / guards**

* `type`、`attrs`、`keep`、`drop`、`q`、`georel` のうち少なくとも 1 つが必要、**または** `local=true` (`id` / `idPattern` / `scopeQ` のみは 400 で拒否されます)
  
* `attrs` / `keep` / `drop` は少なくとも 1 つの非システム属性をリストする必要があります (`keep=createdAt` のみ → 400)。GET too-wide ガードと共有ヘルパー (`hasNonSystemAttribute`)
  
* `keep` と `drop` を同時に指定することはできません。空の `keep=` / `drop=` は 400 で拒否されます
  
* 未知のクエリパラメータは `400 InvalidRequest` で拒否されます
  
* `attrs` / `keep` / `drop` 内の属性名はリクエストの `@context` に対して展開されます

> **警告 (`keep` / `drop` のみ):** `keep` と `drop` はエンティティセレクタであり、単なる属性変更フラグではありません。\
> `DELETE /entities?keep=name` (`type` / `id` / … なし) は **204** を返し、呼び出し元が変更を許可されている **テナント内のすべてのエンティティ** から `name` 以外のすべての属性を削除します (ETSI 5.6.21.4 bullet 2 / #2432)。\
> 同じ影響範囲は `origin/main` の `?type=*&keep=name` で既に到達可能でした。テナント全体の属性削除を意図しない場合は、明示的な `type` / `q` / `id` による絞り込みを推奨します。

**Response**

* 成功: `204 No Content`

> **注意:** GeonicDB は distributed operations (context source への purge 転送) をサポートしません。purge は常にローカルストレージに対して実行されます (`csf` は受理されますが転送は行われません)。

> **GeonicDB 独自拡張 (後方互換):** `POST /ngsi-ld/v1/entityOperations/purge` も引き続き利用可能です。絞り込みに使えるのは body の `type` / `q` / `geoQ` のみです。**`typePattern` を body に積むと `400 BadRequestData`** になります (#2156) — 黙って無視すると「パターンで絞ったつもりが `type` 全件を消す」ことになるため、破壊的操作では silent 無視ではなく loud 拒否に倒しています。MCP `batch` ツールの `purge` / A2A `batch` スキルの `purge` も同じく拒否します。この拡張ルートには `DELETE /entities` 相当の too-wide セレクタガードがありません(既存の非対称。#2432 では悪化させていません)。

#### Batch Query

```http
POST /ngsi-ld/v1/entityOperations/query
Content-Type: application/json
```

**Request Body**

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

body は `orderBy` (v1.9.1 Entity Ordering Language、例: `"orderBy": "temperature;desc"` — [Entity Ordering (orderBy)](#entity-ordering-orderby) を参照) と、レガシーの `orderDirection` (`asc` / `desc`) も受け付けます。文字列でない `orderBy` または無効な `orderDirection` は `400` で拒否されます (#1681)。

body 内の `datasetId` (文字列 CSV または `string[]`) は、`GET ?datasetId=` と同じ clause 4.5.5.1 multi-attribute view として受け付けられます — join collection の前を含みます (#3668)。以前は body フィールドは無視されていました。既に送信しているクライアントは、フィルタされた Attribute インスタンス (および小さくなった `join=flat` リンクセット) を見ることになります。

> **Too wide query (#2290)**: これは Query Entities の POST バインディングです (clause 6.23.3.1 → 5.7.2.4)。`entities[].id` / `idPattern` のみ、または `type: "Query"` のみを指定した body は `400 BadRequestData` になります — `GET /entities?id=...` と同じ契約です。`entities[].type` / `attrs` (非システム属性を含む) / `q` / `geoQ` を追加するか、`?local=true` を渡してください。

**Response**: エンティティの配列

> **GeoJSON 出力 (#1783)**: ETSI GS CIM 009 clause 6.3.4 は、この操作が実装する「Query Entity」(clause 5.7.2) を GeoJSON 対応操作の中にリストしています。`format=geojson` (クエリパラメータ) または `Accept: application/geo+json` をネゴシエートすると、`Content-Type: application/geo+json` で GeoJSON **FeatureCollection** を返します。これは `GET /ngsi-ld/v1/entities` と**同じ形式**です (同じ `NgsiLdGeoJsonTransformer`、同じページネーションヘッダー: `Link` / `NGSILD-Results-Count`)。`geometryProperty` パラメータは、`GET /entities` と全く同じように、ここでトップレベルの `geometry` を選択します (#2046、[Retrieve Entity List](#retrieve-entity-list) の注記を参照)。`splitEntities` (型でグループ化されたネストされた配列) は FeatureCollection として表現できないため、GeoJSON がそれよりも優先されます。これは `GET /entities` が既に適用しているのと同じ優先順位です。リストおよび単一取得エンドポイントと同様に、`properties` キーと `properties.type` はリクエストの `@context` で圧縮されます (#1788 サブ項目 6、上記の [Retrieve Entity List](#retrieve-entity-list) の注記を参照)。

#### Batch Merge

```http
POST /ngsi-ld/v1/entityOperations/merge
Content-Type: application/ld+json
```

Merge-Patch セマンティクスを使用して、複数のエンティティに対してバルク更新を実行します。既存の属性はマージされ、リクエストに含まれていない属性は保持されます。値として `urn:ngsi-ld:null` を指定すると、その属性が削除されます。

**Request Body**

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

**Query Parameters**

| Parameter             | Description                          |
| --------------------- | ------------------------------------ |
| `options=noOverwrite` | Do not overwrite existing attributes |

**Response**

* すべて成功: `204 No Content`
  
* 部分的に成功: `207 Multi-Status`

***

### 時系列バッチ操作 (NGSI-LD)

> **ETSI GS CIM 009 リファレンス**: セクション 5.6.12-5.6.19 - エンティティの時系列表現

時系列エンティティのバッチ操作。リクエストあたり最大 **1,000** エンティティを処理できます。

> **注**: 時系列 entityOperations の create / upsert / delete は ETSI GS CIM 009 仕様に含まれていない GeonicDB 拡張です。query のみが仕様準拠です。これらの拡張は、時系列データの一括取り込みの効率を向上させるために提供されています。

> **DB タイムアウトがバッチを中止する (#2542)**: `create` / `upsert` / `delete` の要素を処理中にデータベースクエリタイムアウト(`maxTimeMS` 超過)が発生した場合、残りの**未試行**要素は中止され、`207 Multi-Status` の `errors` 配列に type `https://uri.etsi.org/ngsi-ld/errors/ServiceUnavailable` と `detail` が `Not attempted:` で始まる形式で報告されます — 実際にタイムアウトした要素の `detail` とは異なります。何も成功しなかった場合でもレスポンスは `207` です(全体の `503` にはなりません)。`success` にリストされたエンティティはコミットされています。**`errors` にリストされたエンティティ ID のみを再試行してください**。`create` / `upsert` では、時系列書き込みは追加専用であるため、既に成功したエンティティを再送信すると時系列インスタンスが重複します。`delete` では、既に削除されたエンティティを再送信すると単に見つからないと報告されます(データは重複しません)。

#### 時系列バッチ作成

```http
POST /ngsi-ld/v1/temporal/entityOperations/create
Content-Type: application/ld+json
```

時系列エンティティを一括作成します。リクエストボディは時系列エンティティの配列です。

**レスポンス**: すべて成功した場合は `201 Created`、部分的な失敗の場合は `207 Multi-Status`

#### 時系列バッチアップサート

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

POST ベースの時系列クエリ。クエリ条件はリクエストボディで指定します。

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

**レスポンス**: 追加の時系列ページが利用可能な場合は `Link` ヘッダー付きの `200 OK`

#### 時系列クエリパラメータ

以下のクエリパラメータは、時系列エンティティの GET エンドポイントで使用できます。

| Parameter        | Type    | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`           | string  | Filter by entity type                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `typePattern`    | string  | Regular expression pattern for entity type, evaluated **verbatim** (no implicit `*`→`.*` conversion, matching the `typePattern` discipline used elsewhere, e.g. csourceSubscriptions, #2105). Combining with `type` is an **AND** (both must match) — NGSI-LD design decision is `type`/`typePattern` combine as AND, unlike NGSIv2 where `type`/`typePattern` are mutually exclusive (#2105). **GeonicDB 独自拡張** (#2115)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `timerel`        | string  | Temporal relationship operator (`after`, `before`, `between`). Values outside these three are rejected with `400 BadRequestData`, at **every** entry point — single retrieval, list, `POST /temporal/entityOperations/query` and attribute delete (#2266)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `timeAt`         | string  | Reference time. **ISO 8601 is the recommended form** (clause 4.6.3); the broker accepts any value `Date` can parse, matching `TemporalService.validateTimeParameters`. Unparsable values, and values longer than `SECURITY.MAX_TIME_FIELD_LENGTH` (50), are rejected with `400 BadRequestData` at every entry point (#2310); until then the single-retrieval entry accepted an unparsable value and turned it into an `Invalid Date` comparison, surfacing as `404`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `endTimeAt`      | string  | End time (required when `timerel=between`). Same acceptance rule as `timeAt` (ISO 8601 recommended; actually accepted iff `Date` can parse it). **Format and length are validated only when `timerel=between`** — matching `TemporalService.validateTimeParameters`, so a stray `endTimeAt` on `before`/`after` is ignored rather than newly rejected (#2310); whether it is *required*, ordered after `timeAt`, and within the maximum span stays a per-operation rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `timeproperty`   | string  | Temporal Property compared by `timerel` / `timeAt` / `endTimeAt` (ETSI GS CIM 009 Table 5.2.21-1 / clause 4.11): `observedAt` (default), `createdAt`, `modifiedAt`, `deletedAt`. Unknown values — including `expiresAt`, which is a Temporal Property in clause 4.8 but **not** in Table 5.2.21-1 — are `400 BadRequestData` at every entry point (GET list, GET by-id, POST query, attribute delete, MCP, A2A) (#2267). Instances that do not carry the selected property (e.g. `deletedAt` on a living instance) are **non-matching** (empty / 404); they are not a 400. **Non-default `timeproperty` (§ `deletedAt`) constrains the query to instances that convey that property** — a query with `timeproperty=deletedAt` (even without `timerel`) only returns instances carrying `deletedAt`, never living instances that merely lack it (clause 4.11 last sentence, #2434)                                                                                                                                                                                                                                |
| `firstN`         | integer | Select the earliest N instances per attribute (positive, capped at 30)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `lastN`          | integer | Select the latest N instances per attribute (positive, capped at 1000)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `offsetN`        | integer | Skip instances per attribute in the paging direction (default 0)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `format`         | string  | Representation format (ETSI GS CIM 009 - 6.3.12). One of `temporalValues` (simplified temporal representation, clause 4.5.9) or `aggregatedValues` (aggregated representation, clause 4.5.19); `simplified` is accepted as a synonym of `temporalValues` (GeonicDB extension). **Unknown values are rejected with `400 InvalidRequest`** (#1814). `POST /temporal/entityOperations/query` supports the same values as the GET form (clause 6.24.3.1: *"The behaviour of this clause mirrors the one in clause 6.18.3.2"*, #1816). **When both `format` and `options` are present, `format` takes precedence** (6.3.12).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `options`        | string  | Deprecated alternative to `format` (6.3.12). `temporalValues` / `simplified`: Simplified temporal representation (`[value, timestamp]` pairs), `aggregatedValues`: Aggregation representation (**`aggrMethods` is required when `aggregatedValues` is specified via `options` or `format`**), `sysAttrs`: include system temporal attributes (see below, #1817). Unknown tokens are rejected with `400 InvalidRequest` (6.3.20). The raw value must not exceed **200 characters** or **12 comma-separated values**; exceeding either returns `400 InvalidRequest` (#2031)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `orderBy`        | string  | v1.9.1 Entity Ordering Language (see [Entity Ordering (orderBy)](#entity-ordering-orderby)). Combining with `aggrMethods` returns `400`; attribute-value sorting on encrypted tenants returns `400` (#1681)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `orderDirection` | string  | Legacy sort direction — `asc` / `desc` only; other values return `400` (#1681)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `scopeQ`         | string  | Scope query (clause 4.19 / Table 6.18.3.2-1). **GET** `/temporal/entities` takes it as a **query parameter**; **POST** `/temporal/entityOperations/query` takes it as a **request-body** member (Table 5.2.23-1 / clause 6.24.3.1 mirrors 6.18.3.2). Filters temporal results by the **current** entity `scope` in the entities collection (#2597). Temporal attribute documents do not persist scope; deleted or temporal-only entities (no entities doc) are **non-matching** (fail-closed, same class as #1336). Invalid charset / term limits follow the same rules as entity `scopeQ` (#2583) → `400 BadRequestData`. Non-string `scopeQ` on POST body → `400 BadRequestData`. Authz-constrained subjects combine the readable filter and `scopeQ` in **one** entities distinct before the `AUTH.MAX_READABLE_ENTITY_IDS` cap (#2597 L1/L2). There is **no scope-specific Mongo index**; residual filtering is in-memory after the match stage — same class as entity-list `scopeQ`, not a new regression. **Behaviour change**: before #2597, `scopeQ` was accepted but silently ignored (full result set) |
| `q`              | string  | NGSI-LD Query Language filter (clause 4.9). Supports trailing path (`address[city]=="Berlin"`) and LanguageProperty `[*]` (`street[*]=="Grand Place"`) (#3333 / #3675). Reserved `@vocab` metadata `valueType` / `objectType` follow the same rules as entity `q` (#3840 / #3857): short names and expanded IRIs are equivalent; request `@context` aliases are resolved on GET/POST temporal query; `!=` / `!~=` on those members require the member to exist (clause 7.2.3). Other dotted `!=` paths keep the historical missing-as-match behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `jsonKeys`       | string  | Comma-separated attribute names whose values are treated as opaque JSON (not expanded as JSON-LD) when evaluating `q` trailing paths (clause 4.9 / Table 6.18.3.2-1, #3333)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

**時系列ページ**は、デフォルトで最も古いインスタンスから開始し、属性あたり最大 30 インスタンスです。最も古い方からページングする場合は `firstN` を、最も新しい方からページングする場合は `lastN` を指定してください。返されるインスタンスは時系列順に表示されます。

単一エンティティの時系列 GET で時間範囲を指定し、一致する属性インスタンスが見つからない場合、`404 ResourceNotFound` を返します。エンティティに時系列履歴がある場合、`detail` は `No attribute instances match the temporal query in the requested time range: <entityId>` と表示されます。時系列履歴がない場合、`detail` は `Temporal entity not found: <entityId>` と表示されます。これは標準レスポンスと集計レスポンスの両方に適用されます。

**時間範囲スパン制限 (GeonicDB 独自拡張)**: **リスト/クエリ**読み取りパス(`GET /temporal/entities`、`POST /temporal/entityOperations/query`)および**集計**(単一エンティティ GET で `aggrMethods` を**使用する**場合を含む)での `timerel=between` は、**732 日**(`TEMPORAL.MAX_TIMESPAN_DAYS`、= 366×2)を超えるスパンを `400 BadRequestData` で拒否します。これによりスキャンウィンドウが制限されます(OWASP API4:2023)。非集計パスではレスポンスサイズは `limit` / `lastN` で制限されます。**集計されたリストレスポンス**(`GET /temporal/entities` / `POST /temporal/entityOperations/query` での `aggrMethods`)には、**エンティティレベルの** `limit` / `offset` (デフォルトページサイズ 20; 条項 5.5.9 / 5.7.4.4 / #2509)と `AGGREGATION_MAX_TIME_MS` も適用されます。各エンティティ内の期間配列は切り捨てられません(条項 4.5.19)。**期間数のハードキャップ (#2524 / #2555)**: 非ゼロの `aggrPeriodDuration` は、(1) 任意の**マージされた** `(entityId, attributeName)` が **`TEMPORAL.MAX_AGGR_PERIODS=1000`** 期間を超える場合、または (2) エンティティ/属性全体の**ページ合計**期間数が **`TEMPORAL.MAX_AGGR_PERIODS_TOTAL=20000`** (`DEFAULT_LIMIT × MAX_AGGR_PERIODS`)を超える場合、**`403 TooManyResults`** で拒否します。**`timerel=between` かつ `timeproperty` が省略または `observedAt` の場合**、属性ごとの上限は `floor(window/duration)+1` により DB 前にもチェックされます。データ駆動の `$group` プローブは非ゼロ期間(`between` を含む)では常に実行され、属性ごとの最大値とページ合計の両方をチェックします。回避策: `attrs` で絞り込み、`limit` を減らし、`aggrPeriodDuration` を長くする、または `offset` でシフトします。プローブ自体の MongoDB `$group` コストは変わりません(フォローアップ #2556)。上限を超える正当なパスは 2 回スキャンする可能性があります(`maxTimeMS` バジェット ×2)。`PT0S` / 省略された期間は単一期間のままです(#2109)。`Link` の `total` パラメータと `NGSILD-Results-Count`(`count=true` の場合)の両方は、ページ長ではなく**一致するエンティティの総数**を報告します(条項 6.3.13)。**`aggrMethods` なしの単一エンティティ GET**(`GET /temporal/entities/{id}`)および**属性削除**(`DELETE /temporal/entities/{id}/attrs/{attr}`)では、スパン制限は**適用されません**(#2310 / #2312)。削除では、日付の妥当性、`timerel`/`timeAt` のペアリング、および `endTimeAt > timeAt` は依然として適用されます。

```bash
# Retrieve the latest 10 temporal data instances
curl "http://localhost:3000/ngsi-ld/v1/temporal/entities/urn:ngsi-ld:Sensor:001?lastN=10" \
  -H "Fiware-Service: myservice"
```

#### ページネーション `Link` (`rel="next"` / `"prev"`

、clause 6.3.10)

リスト操作(`GET /entities`、`GET /temporal/entities`、`POST /entityOperations/query`、`POST /temporal/entityOperations/query`、およびその他の NGSI-LD コレクション)は、次/前のページポインタを RFC 8288 link-values としてシリアライズします。各ページネーション link-value には、元のリクエストから生成されたメディアタイプ(ネゴシエートされた `Content-Type`)に**正確に**設定された `type` が含まれます。JSON-LD `@context` リンクは異なる契約であり、`type="application/ld+json"` を保持します。

```http
Link: <http://localhost:3000/ngsi-ld/v1/temporal/entities?limit=2&offset=2>; rel="next"; type="application/ld+json"
```

#### 時系列ページネーション(TS 104 176 §6.4.7.3)

**マイグレーション(#3976)。** `200 OK` を読み取り、以前の `206` と `Content-Range` の代わりに `Link` リレーションシップ `intervalafter` と `intervalbefore` に従ってください。最も古い 10 個のインスタンスには `firstN=10` を使用し、以前のデフォルトである最新の 10 個のインスタンスには `lastN=10` を使用します。マイグレーション後、進行中のページネーションを初期リクエストから再開してください。Link に従う際は、元のメソッドとヘッダーを使用してください。POST の場合は、元のリクエストボディも送信してください。リンクの URL `offsetN` は `temporalQ.offsetN` よりも優先されます。

時系列リンクとエンティティ `next` / `prev` リンクは同じレスポンスに現れることがあります。レスポンスが間隔全体をカバーする場合、時系列ページネーションリンクは含まれません。

#### 時系列レスポンスフォーマットオプション

`options=temporalValues`(または `options=simplified`)を指定すると、各属性が `values` 配列(`[value, timestamp]` のペア)を持つ簡略化されたフォーマットで返されます。

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

#### システム時系列属性(`options=sysAttrs`

)

ETSI GS CIM 009 clause 6.3.11 は、`/temporal/entities/` および**そのすべてのサブリソース**、ならびに clause 5.7.4 の POST クエリにおいて `options=sysAttrs` のサポートを要求しています。リクエストされた場合、**正規化された**表現の各属性インスタンスは、システム生成された時系列属性 `createdAt` / `modifiedAt`(および時系列 TTL が設定されている場合は `expiresAt`)を保持します:

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

Context Brokerが保持していない値は単に省略されます — clause 6.3.11 は\*「実装は、システム生成された時系列属性を保持していない場合、エラーを発生させてはならない。」\*と述べています。同じ理由で、`sysAttrs` は簡略化された(`temporalValues`、clause 4.5.9 の `[value, timestamp]` ペア)および集約された(clause 4.5.19)表現に対して**受け入れられ無視されます**(決して `400` にはなりません)。これらの表現の構造には、システム属性を保持する場所がないためです。

#### 時系列レスポンスにおける名前の圧縮(#1975 / #1788)

時系列レスポンスの**属性名とエンティティ `type`** の両方は、*そのリクエスト*によって提供された `@context` で圧縮されます(ETSI GS CIM 009 clause 5.5.7 / 5.5.5)。属性名は #1975 以降圧縮されています。エンティティ `type` は #1788 サブアイテム 2 まで保存された(完全修飾された)形式で返されていました — 書き込み時に `normalizeTypeName` で正規化されるため、書き込み時に使用された短い名前が読み取り時に返される短い名前となり、同じ短い名前が `?type=` で一致します。

リクエストが `@context` を提供しない場合(またはコアコンテキストのみの場合)、圧縮先が存在しないため、名前は完全修飾 URI としてレンダリングされます — これは clause 5.5.7 のフォールバックであり、欠陥ではありません。#1975 以前に書き込まれた属性名(レガシー、逐語的ストレージ)は、書き込み時に使用された `@context` が記録されていないため、保存されたままの形式で返されます。

#### `observedAt` 表現の忠実性(#2271)

`observedAt` は、**クライアントが書き込み時に提供した文字列表現と正確に同じ形式で**返されます。ETSI GS CIM 009 clause 4.6.3 は、DateTime の小数秒コンポーネントを*オプション*としているため、`2020-09-01T12:03:00Z` と `2020-09-01T12:03:00.000Z` は両方とも同じ瞬間の有効な表現であり、仕様は正規形式を指定していません。したがって、GeonicDB は一方を他方に正規化しません:`...:00Z` と書き込めば `...:00Z` を読み取ります。`...:00.123456Z` と書き込めば、6 桁すべての小数桁を読み取ります。

時間ベースのフィルタリング(`timerel` / `timeAt` / `endTimeAt`)、順序付け、および `lastN` は、瞬間が BSON `Date` として保存されているため、ミリ秒精度で動作することに注意してください。元の精度を保持するのは*表現*のみです。#2271 以前に書き込まれたインスタンスは、元の表現が記録されていないため、正規形式 `...ss.sssZ` で返されます。

#### スコープの時系列進化(#2434)

`scope` エンティティメンバー(clause 4.18 — 単一値は `string`、複数値は JSON 配列)も時系列コレクションに永続化されるため、エンティティのスコープの進化を Temporal API を介して取得できます。


* **`scope` を含む時系列作成 / 属性追加**(`POST /temporal/entities`、`POST /temporal/entities/{id}/attrs`)は、スコープを\*\*`value` がスコープ配列である単一の `Property` インスタンス\*\*として保存します(clause 4.5.7 EXAMPLE)。`observedAt` は書き込み時刻です — スコープは時点のメンバーシップであり、一連の観測ではないため、クライアントの `observedAt` は想定されていません。

`scope: null` / `scope: []` を送信すると何も記録されません。

* **`DELETE /entities/{id}/attrs/scope` (条項 5.6.5)** も **削除インスタンス**(墓標)を記録します:これは、`value` が文字列 `"urn:ngsi-ld:null"`(配列ではない)であり、`deletedAt` が設定された(条項 4.5.7 / 4.18、#3337)`Property` です。同じセンチネル値は、スコープ付きエンティティが削除または期限切れになった場合にも書き込まれます。他の削除インスタンスと同様に、正規化表現では **`observedAt` が省略されます**(時間的参照は `deletedAt` 自体です)。`temporalValues` 形式では、ペアは `["urn:ngsi-ld:null", <deletedAt>]` になります。空配列では「スコープが空だった」と「スコープが削除された」を区別できません。
  
* **`timeproperty=deletedAt`** は `deletedAt` を持つインスタンスのみを返すため(上記の `timeproperty` 行を参照)、削除されたスコープは **墓標のみ** の結果になります:`scope` は `value` `"urn:ngsi-ld:null"` と `deletedAt` を保持し、生存属性(例:`fuelLevel`)は `deletedAt` を持たないため除外されます。
  
* **現在エンティティのマテリアライゼーション(GeonicDB 拡張、A'-1)** — `scope` を含む本文を持つ時系列作成は、現在のエンティティを `create-if-absent` しようとします(そのため、直後に `GET /entities/{id}` と `DELETE /entities/{id}/attrs/scope` が機能します)。エンティティは **`scope` メンバーのみ** で作成されます(他の属性はありません);エンティティが既に存在する場合はそのまま残されます(`AlreadyExists` は暗黙的にスキップされます)。その他のマテリアライゼーション失敗は **書き込みを失敗させます** — 単一作成は 4xx/5xx を返し、時系列履歴は書き込まれません;バッチ作成/アップサートおよび MCP の `batch_create` / `batch_upsert` は、失敗したエンティティを `207` の `errors[]` にマップし、そのエンティティの時系列書き込みをスキップします(他のエンティティは続行されます)。マテリアライゼーション失敗の暗黙的スキップは拒否されています(#2434 セキュリティレビュー):そうしないと時系列履歴のみが残り、後で再 POST すると時系列 `AlreadyExists` に遭遇し、リトライが永続的にブロックされます。`scope` **なし** の時系列作成は、現在のエンティティをマテリアライズ **しません**。HTTP の ID 指定/バッチ作成/バッチアップサートおよび MCP の create / `batch_create` / `batch_upsert` に適用されます(#2434 / #2758 / #2796 / #2814)。

#### 時系列集約クエリ(単一エンティティ)

集約クエリは、`aggrMethods` および `aggrPeriodDuration` クエリパラメータを使用して、時系列エンティティ GET エンドポイントで実行できます。リスト取得エンドポイントと単一エンティティ取得エンドポイントの両方で利用可能です。
`options` または `format` を介して集約表現を要求するには、`aggrMethods` と共に `options=aggregatedValues` または `format=aggregatedValues` を指定します。

> **GeonicDB 拡張(後方互換性)**:ETSI は、`aggrMethods` は *「`aggregatedValues` が `format` または `options` パラメータに存在する場合のみ適用可能」* と述べていますが、それなしで提供された場合に何が起こるかは定義していません。GeonicDB は歴史的な動作を維持しています:**`format` も `options` も表現キーワードを持たない場合、`aggrMethods` の存在は `aggregatedValues` を暗示します**。いずれかのパラメータが表現キーワードを持つとすぐに、解決された表現のみがレスポンスを駆動します — したがって、`format=temporalValues&options=aggregatedValues&aggrMethods=sum` は集約ではなく、*簡略化された* 時系列表現を返します(ETSI テスト `021_19_02`)。

> **`POST /temporal/entityOperations/query` も集約します(#1816)**:条項 6.24.3.1 は、この操作が *「条項 6.18.3.2 のものを反映する」*(GET 形式)と述べているため、同じパラメータと同じ検証で集約がサポートされます。仕様で定義されたパラメータの場所は、リクエスト本文の `temporalQ` オブジェクト(`aggrMethods` / `aggrPeriodDuration`、表 5.2.21-1)です;クエリ文字列もフォールバックとして受け入れられます(公式 CLI が送信する形式、geolonia/geonicdb-cli#188)が、本文が優先されます。#2030 がここで発行していた `NGSILD-Warning`(warn-code 199)は削除されました — リクエストは無視されなくなりました。

| Parameter            | Type   | Description                                                                                                                                                                                                                                                                                                                                                       |
| -------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aggrMethods`        | string | Aggregation methods (comma-separated): `totalCount`, `distinctCount`, `sum`, `avg`, `min`, `max`, `stddev`, `sumsq`                                                                                                                                                                                                                                               |
| `aggrPeriodDuration` | string | ISO 8601 duration (e.g., `PT1H` for 1 hour). Optional (Table 5.2.21-1 cardinality 0..1). When omitted it defaults to `PT0S`, which is interpreted as a single period spanning the whole time range of the query. For a non-zero duration the first period starts at the attribute's **earliest observation**, not a calendar boundary (clause 4.5.19 / #2271 (d)) |

**例**:`GET /ngsi-ld/v1/temporal/entities/{entityId}?aggrMethods=avg&aggrPeriodDuration=PT1H&timerel=after&timeAt=2024-01-01T00:00:00Z&options=aggregatedValues`

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

形式は ETSI GS CIM 009 条項 4.5.19.0 に従います:**要求された集約メソッドごとに 1 つのメンバーがあり、メソッド名でキー付けされ**、その値は期間ごとに 1 つの要素を持つ配列であり、**各期間は正確に 3 つの要素の配列** です — 集約値、開始 `DateTime`、終了 `DateTime`。複数のメソッドを要求する(`aggrMethods=avg,max`)と、それぞれ 1 つのメンバーが生成されます:

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

> **破壊的変更(#1815)**:この変更前、GeonicDB は独自の形式(`{"values": [{"@value": {"avg": 21.0}, "observedAt": ..., "endAt": ...}]}`)を返していました。`values[].@value` を解析していたクライアントは、上記のメソッドキー付きメンバーに切り替える必要があります。
>
> **注**:`aggrPeriodDuration` はオプションです。省略する(または `PT0S` / `P0D` を渡す)と、ETSI GS CIM 009 表 5.2.21-1 および条項 4.5.19.1 に従い、クエリの時間範囲全体を単一の期間として集約します。
>
> **注**:`aggrMethods` なしで `aggregatedValues` を指定する(`options=aggregatedValues` または `format=aggregatedValues` のいずれか)と、`400 Bad Request` エラーが返されます。

> **注**:集約クエリは **暗号化されたテナントではサポートされていません**(つまり `encryptionEnabled: true` のテナント)。属性値は保存時に暗号化されるため、MongoDB の集約パイプラインは暗号化されたデータに対して数値演算を実行できません。暗号化されたテナントで集約をリクエストすると `400 Bad Request` が返されます。復号化された値を取得してアプリケーション層で集約を実行するには、`temporalValues` エンドポイントを使用してください。

***

### Entity Type 操作 (NGSI-LD)

#### 型リストの取得

> **ETSI GS CIM 009 Reference**: clause 5.7.4 - Retrieve Available Entity Types

```http
GET /ngsi-ld/v1/types
```

**Parameters**: `limit`、`offset`、`details`

`details` を指定しない場合、レスポンスは単なる配列ではなく **`EntityTypeList` オブジェクト** (ETSI OpenAPI v1.8.1) です:

**Response** (200、`details` 未指定):

```json
{
  "id": "urn:ngsi-ld:EntityTypeList:34kj2l4-a8s7-...",
  "type": "EntityTypeList",
  "typeList": ["Room", "Sensor"],
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.9.jsonld"
}
```

`details=true` (または `options=details`) を指定すると、代わりに `EntityType` オブジェクトの配列が返されます:

**Response** (200、`details=true`):

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

**Header**: 合計カウントは `NGSILD-Results-Count` で返される (`count=true` の場合)

#### 型詳細の取得

```http
GET /ngsi-ld/v1/types/{typeName}
```

**Response** (200):

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
>
> **パス型名の解決 (#1736)**: `{typeName}` はリクエスト `@context`(`Link` ヘッダー)を基準に保存形 (canonical) へ解決してから照合されます (ETSI GS CIM 009 clause 5.5.7)。作成に使ったのと同じ `@context` の同じ短縮名を渡せば、保存形が FQN であっても一致します(一覧の `?type=` と同じ規律)。

**Error**: 404 (型が存在しない場合)

### 属性操作 (NGSI-LD)

#### 属性リストの取得

> **ETSI GS CIM 009 Reference**: clause 5.7.6 - Retrieve Available Attributes

```http
GET /ngsi-ld/v1/attributes
```

**Parameters**: `limit`、`offset`、`details`

`details` を指定しない場合、レスポンスは単なる配列ではなく **`AttributeList` オブジェクト** (ETSI OpenAPI v1.8.1) となります:

**Response** (200、`details` 未指定):

```json
{
  "id": "urn:ngsi-ld:AttributeList:98fj3k2-b1c4-...",
  "type": "AttributeList",
  "attributeList": ["temperature", "pressure"],
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.9.jsonld"
}
```

`details=true` (または `options=details`) を指定した場合、代わりに `Attribute` オブジェクトの配列が返されます:

**Response** (200、`details=true`):

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

> **名前の compaction (#1977) と `id` の FQN 化 (#1989)**: `attributeList` の属性名、および `details=true` 時の `attributeName` / `typeNames` は、**そのリクエストが渡した `@context`**(`Link` ヘッダー)を基準に compact して返されます (ETSI GS CIM 009 clause 5.5.7 / 5.7.9)。`id` は compact されず**保存名から復元した FQN** を返します(Table 5.2.28-1: "Full URI of attribute name"。例: `@context` 無しで属性 `temperature` の `id` は `https://uri.etsi.org/ngsi-ld/default-context/temperature`)。

**Header**: 合計カウントは `NGSILD-Results-Count` で返されます (`count=true` の場合)

#### 属性詳細の取得

```http
GET /ngsi-ld/v1/attributes/{attrName}
```

**Response** (200):

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

> **名前の compaction (#1977) と `id` の FQN 化 (#1989)**: `attributeName` / `typeNames` は、**そのリクエストが渡した `@context`**(`Link` ヘッダー)を基準に compact して返されます (ETSI GS CIM 009 clause 5.5.7 / 5.7.10)。`id` は compact されず**保存名から復元した FQN** を返します(Table 5.2.28-1: "Full URI of attribute name"。例: `@context` 無しで属性 `temperature` の `id` は `https://uri.etsi.org/ngsi-ld/default-context/temperature`)。
>
> **属性の同一性 (#2002)**: `{attrName}` はリクエスト `@context` を基準に FQN へ展開し、**その FQN と一致する保存属性のみ**が集計されます (ETSI GS CIM 009 clause 5.5.7 / Table 5.2.28-1)。同じ保存名 (例: `temperature`) を持ちながら別の `@context` で書かれ別の FQN を持つ属性が同居していても、**書き込み時 `@context` を解決できる限り**混同されません(解決できない場合の例外は直下の #2070 を参照)。FQN 一致が無い場合のみ保存名の候補一致にフォールバックします(純 legacy テナントとの後方互換)。
>
> **到達不能な書き込み時 `@context` の扱い (#2070)**: 書き込み時 `@context` の解決は fail-soft (解決に失敗すると保存名をそのまま FQN とみなす) なので、解決の成否を区別しないと「本当に FQN が一致した」ものと「たまたま保存名が要求綴りと文字列一致しただけ」のものを取り違えます。`@context` を解決できなかった保存属性は、FQN 一致・候補名一致どちらの all-or-nothing 判定の母数にも含めず、**モードに関わらず常に候補名一致で集計へ merge** されます。これにより、同じ応答に確定した FQN 一致が別の保存属性で 1 件でもあるだけで、外部 `@context` が一時的に到達不能な寄与源が集計から丸ごと落ちる、という silent under-count を防いでいます。
>
> **この規律にはトレードオフがあります。** `@context` を解決できない以上、その寄与源が要求属性と同じ FQN へ展開されたのかは**決められません**(決めるための情報が存在しません)。したがって「解決できていれば**別の FQN** だった寄与源」も、保存名の綴りが要求名の候補と一致すれば merge されます。取れる選択は「常に merge する(一致したはずの寄与源を落とさない代わりに、別物だったはずが混ざる)」か「FQN モードでは除外する(別物だったはずを混ぜない代わりに、一致したはずを落とす = #2070 の症状そのもの)」の 2 つで、**どちらも到達性で応答が変わります**。GeonicDB は発見系の応答が「存在するものを列挙する」意味論であることから、取りこぼしを避ける前者を採っています。この境界の実挙動は `tests/e2e/features/ngsi-ld/attr-discovery-etsi-compliance.feature` の `@issue-2070-tradeoff` シナリオが両方向とも固定しています。
>
> **registration 側も同じ規律 (#2063)**: 応答の `typeNames` / `attributeTypes` には Context Source Registration 由来の寄与も含まれますが、こちらも同じ FQN の同一性で照合されます。registration の `propertyNames` / `relationshipNames` は verbatim 保存 + 登録時 `@context` (#1890) なので、**その登録の `@context` で展開した FQN** が要求 FQN と一致するものだけが寄与します。同じ綴りを宣言していても別 FQN へ展開される registration は混入せず、逆に**別の綴り (別 `@context` の別名) でも同じ FQN へ展開されれば寄与します**。FQN 一致が 1 件も無い場合のみ候補名一致へフォールバックします(ローカル属性側と同じフォールバック規律)。registration の `@context` を解決できない場合の扱いも、直上の「到達不能な書き込み時 `@context` の扱い (#2070)」とローカル属性側と同一です — 判定母数から外し、候補名一致で常に merge します。

**Error**: 404 (属性が存在しない場合)

***

### サブスクリプション (NGSI-LD)

> **ETSI GS CIM 009 リファレンス**: セクション 5.8 - サブスクリプション操作

#### サブスクリプションの作成

```http
POST /ngsi-ld/v1/subscriptions
Content-Type: application/ld+json
```

> **エンティティセレクタワイルドカード**: `entities[].type` は `"*"` を受け入れ、**すべて**のエンティティタイプに対する通知をリクエストします (ETSI GS CIM 009 Table 5.2.33-1, #2102)。正確な文字列 `"*"` のみがワイルドカードです。他のセレクタフィールド (`id` / `idPattern` / `typePattern`) は依然として適用されます (AND)。同じワイルドカードセマンティクスが `/ngsi-ld/v1/csourceSubscriptions` にも適用され、その `entities` は同じ `EntitySelector` です (csource サブスクリプションは `Subscription` タイプを再利用します、Table 5.2.12-1; clause 5.12 はサブスクリプション側の `EntitySelector` と登録側の `EntityInfo` を区別しています; #2149) — `type: "*"` の csource サブスクリプションは、宣言された任意のタイプの登録変更時に発火し、その `typePattern` は依然として AND で絞り込みます。
>
> **エンティティセレクタタイプ検証 (#2158 / #2171)**: `entities[].type` は **clause 4.17 に従った有効なタイプ選択文字列**でなければなりません — 以下を参照 — または正確なワイルドカード `"*"` です。`"**"`, `" *"` または `"*Sensor"` のような値は `400 BadRequestData` で拒否されます。これらは有効な選択文字列でもワイルドカードでもなく、#2158 以前はそれらが受け入れられ、発火することのないサブスクリプションとして保存されていました。同じルールが `/ngsi-ld/v1/csourceSubscriptions` にも適用されます (共有セレクタスキーマ)。NGSIv2 サブスクリプションセレクタは、より厳格な v2 タイプ文字セットで検証されます (#2124)。
>
> **エンティティタイプ選択言語 (clause 4.17, #2171)**: Table 5.2.33-1 は「clause 4.17 に従った有効なタイプ選択文字列」を参照しており、これは単一のタイプ名ではなく、論理和/論理積の文法です:
>
> ```abnf
> EntityTypes  = OrEntityType *(orOp OrEntityType)
> OrEntityType = "(" EntityType *(";" EntityType) ")" / EntityType
> andOp = ";"    orOp = "|" / ","
> ```
>
> `Building|House` と `Building,House` は *Building **または** House* を意味します; `(Home;Vehicle)` は *Home **かつ** Vehicle* を意味します; `(Home;Vehicle)|Motorhome` は両方を組み合わせます。GeonicDB は選択文字列を解析し、書き込み時にリクエストの `@context` で**各終端記号**を正規化し、レスポンスではリクエストの `@context` で各終端記号を圧縮し (clause 5.5.7、したがって `GET` は書き込んだ内容を返します)、サブスクリプションおよび csource-subscription マッチャーで式を評価します。GeonicDB エンティティは正確に 1 つのタイプを持つため、2 つの**異なる**タイプの論理積が満たされることはありません; したがって `(Home;Vehicle)|Motorhome` は `Motorhome` に対してのみ発火します。
>
> ABNF の外側の形式は `400 BadRequestData` で拒否されます: 末尾または繰り返された演算子 (`Building|`, `Building,,House`)、不均衡またはネストされたグループ (`(Building`, `(Home;(A;B))`)、グループ外の `andOp` (`Building;House`)、および式に混在したワイルドカード (`*|Building`)。
>
> **絶対 IRI との曖昧性**: clause 4.17 NOTE は `,` `;` `(` `)` が合法的な URI 文字であり、短い名前のみを推奨していることを指摘しています。GeonicDB はこれを**常に演算子を構造として読み取る**ことで解決します — したがって `, ; ( )` を含む絶対 IRI は、セレクタ内の単一のエンティティタイプとして書き込むことはできません。#2171 以前は動作が分かれていました (`urn:a,urn:b` は単一のタイプとして受け入れられ、`urn:a|urn:b` は拒否されました); 仕様が推奨するように、短い名前を使用してください。
>
> **認可は終端記号ごとに評価されます** (#2268): 選択文字列は XACML リクエストが構築される前に終端記号に展開され、**すべての**終端記号が許可されなければなりません (all-Permit、バッチ操作 #1325 と同じ形式)。したがって、拒否されたタイプを論理和に混ぜる (`SecretType|PublicType`) ことは、`Deny(entityType == "SecretType")` ルールをバイパスしません。同じ展開が、`entities` を省略した `PATCH` ボディで使用される保存値パス (#2005) およびサブスクリプション読み取りリダクション (#2140) にも適用されます — セレクタは、その**すべての**終端記号が読み取り可能な場合にのみリダクションを生き残ります。
>
> **終端記号数の制限** (#2285): 単一のセレクタは最大 **50 個の異なるエンティティタイプ**を指定できます (`SECURITY.MAX_TYPE_SELECTION_TERMINALS`); それ以上は `400 BadRequestData` です。`type` の 256 文字制限 (`MAX_ENTITY_TYPE_LENGTH`) は独立して適用されます — 短い名前では終端記号数の制限が 2 つのうちより厳しい方になります (50 個の 2 ～ 3 文字の終端記号は \~190 文字に収まります) が、長い名前では文字制限が先に到達します。この制限は、#2268 以降、セレクタが**終端記号ごとに** 1 つの認可ターゲットを生成し、これらのターゲットはポリシー決定の前、およびボディ検証の実行前に積極的に構築されるために存在します。セレクタが合計で `MAX_SUBSCRIPTION_ENTITIES x MAX_TYPE_SELECTION_TERMINALS` を超えるターゲットに展開されるリクエストは、同様に切り捨てられるのではなく `400` で拒否されます — all-Permit 評価からターゲットを削除すると、それが緩和されることになります。その合計制限は NGSIv2 サブスクリプション (セレクタをまったく展開しない) にも適用されるため、NGSIv2 API の `subject.entities` も現在 `MAX_SUBSCRIPTION_ENTITIES` に制限されています — 以前は制限がなく、受け入れレイヤーと事前検証認可レイヤーが一致しないことになっていました。
>
> **NGSIv2 サブスクリプションは除外されます**: 選択言語は NGSI-LD の概念であるため、NGSIv2 API を通じて作成されたサブスクリプションは完全一致タイプマッチングを維持します (`"*"` ワイルドカード、#2102 と同じ非対称性)。
>
> `POST /ngsi-ld/v1/temporal/entityOperations/query` は**異なる**スキーマを使用し、`*` を含む `entities[].type` は GeonicDB グロブとして解釈されます (別個のテスト済み機能); そのパスはこの検証の影響を受けません。
>
> **`notification.format`**: `normalized` (デフォルト) / `concise` / `keyValues`。`simplified` は `keyValues` の ETSI 同義語として受け入れられ (Table 5.2.14.1-1, #2103)、取り込み時に `keyValues` に正規化されます (`GET` は `keyValues` を返します)。

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

**MQTT 通知ペイロード (#3341)**

clause 7.2 は MQTT メッセージを `{"metadata","body"}` として定義しています。GeonicDB は、`endpoint.receiverInfo` が省略されているか空の場合、従来のトップレベル Notification(`id` / `type` / `subscriptionId` / `data`)を保持するため、既存のサブスクリプションライバーは引き続き動作します。
`receiverInfo` に接続パラメータ(`MQTT-QoS` / `MQTT-Version`、大文字小文字を区別しない)以外のエントリが少なくとも 1 つ含まれている場合、公開される JSON は clause 7.2 のエンベロープになります。これら 2 つのキーのみのエントリは、従来のトップレベルメッセージを保持します:


* `body` は Notification です(`accept` が `application/geo+json` の場合は GeoJSON `FeatureCollection`)。
  
* `metadata["Content-Type"]` は `endpoint.accept` で、デフォルトは `application/json` です。
  
* そのタイプが `application/json` の場合、`@context` は `metadata.Link`(HTTP Link ヘッダー構文)であり、`body` のメンバーではありません。`application/ld+json` は `@context` を body に保持します。`application/geo+json` は clause 6.3.8 に従います:`@context` は body に留まりますが、`receiverInfo` に `Prefer: body=json` が含まれている場合は `metadata.Link` に移動します。
  
* 各 `receiverInfo` のキー/値は `metadata` にコピーされます。`Link` エントリは生成されたコンテキスト Link に追加されます(カンマ区切り)。重複キー:最後のものが優先されます。`MQTT-QoS` と `MQTT-Version` は接続パラメータ(`notifierInfo`)であり、`receiverInfo` に含まれていても `metadata` にはコピーされません。

NGSIv2 MQTT 通知は変更されていません(これらはこのバインディングではありません)。

**MQTT notifierInfo 設定**

| Key            | Value                    | Description           |
| -------------- | ------------------------ | --------------------- |
| `MQTT-Version` | `mqtt3.1.1` or `mqtt5.0` | MQTT protocol version |
| `MQTT-QoS`     | `0`, `1`, or `2`         | QoS level             |

**Web Push 通知の例 (#3014 — GeonicDB 拡張)**

HTTPS Push Service URL は URI スキームで HTTP コールバックと区別できないため、`endpoint.webpush`(およびオプションの書き込み時 `protocol: "webpush"`)で Web Push 配信を選択します。
`uri` はブラウザの `PushSubscription.toJSON().endpoint` と等しくなります。GET レスポンスは `endpoint.webpush` を返しますが、`protocol` は**省略**されます(MQTT と同様)。`keys.auth` は `******` としてマスクされます。
`keys.p256dh` はマスクされません。`csourceSubscriptions` は `webpush` を `400` で拒否します。

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "type": "Subscription",
  "entities": [{ "type": "Room" }],
  "watchedAttributes": ["temperature"],
  "notification": {
    "format": "normalized",
    "endpoint": {
      "uri": "https://fcm.googleapis.com/fcm/send/....",
      "protocol": "webpush",
      "webpush": {
        "keys": {
          "p256dh": "<87-char base64url>",
          "auth": "<22-char base64url>"
        },
        "urgency": "normal"
      }
    }
  }
}
```

> **`notification` は閉じた構造です (#2066)。** ETSI GS CIM 009 Table 5.2.14-1(NotificationParams)はそのメンバーを網羅的に列挙しており、NGSIv2 のみの `httpCustom` / `http` / `mqtt` は含まれていません(MQTT 配信は代わりに `notification.endpoint.uri` の `mqtt://` / `mqtts://` スキームで選択され、上記に示されています)。GeonicDB はさらに、文書化された拡張として `endpoint.webpush` / `endpoint.protocol` を受け入れます(#3014)。そのテーブルの外側の `notification` の他のメンバーは、作成時と `PATCH` 時の両方で `400 BadRequestData` を返します(これは同じリクエストスキーマを再利用する `/ngsi-ld/v1/csourceSubscriptions` にも適用されます)— 以前はそのようなメンバーは Zod のデフォルト(strip)検証によって静かに削除され、リクエストは成功していました

> `201` / `204` で応答する一方で、値は痕跡なく削除されました。Subscription の **トップレベル** JSON-LD 語彙拡張は影響を受けません。`notification` のみが閉じられます。
>
> `join` / `joinLevel` (Table 5.2.14.1-1) は **notification ペイロードに適用されます** (#2104)。`inline` は各 Relationship のターゲットを `entity` / `entityList` メンバーとして埋め込み、`flat` はターゲットを notification の `data` 配列に追加し、`@none` (デフォルト) は何も解決しません。`joinLevel` はデフォルトで `1` であり、`join` と一緒にのみ意味を持ちます。最大値はクエリパラメータと同じ (`5`) ですが、**最大値を超える値の処理は異なります**。クエリパラメータは `400` で拒否します(読み取りは要求された深さを尊重するか失敗します)が、`notification.joinLevel` は最大値に **クランプされます** — subscription は長期間存続するリソースであり、notification 時に拒否すると、作成時に受け入れられた値に対して配信を黙って削除することになります。両方のメンバーは永続化され、`GET /subscriptions{,/{id}}` によって返されます — 設定されていないメンバーはデフォルト値で具体化されません。notification 内のリンクされたエンティティは、**subscription 作成者の** 行レベル読み取り述語によってフィルタリングされます。その述語を決定できない場合、join はゼロのリンクされたエンティティに解決され、notification は引き続き配信されます([AUTH.md](../reference/auth.md) を参照)。出力専用メンバー (`status`、`timesSent`、`timesFailed`、`lastNotification`、`lastFailure`、`lastSuccess`) は、作成/更新時に提供された場合、clause 5.2.14.2 (「implementations shall ignore them」) に従って受け入れられ **無視されます** — これらは決して拒否されません。クエリ/取得時には、表現の一部として生成されます (clause 5.2.14.2 「shall generate」) — 特に `timesFailed` は常に存在します(配信失敗がない場合は `0`。内部的にカウンタは `timesFailure` として保存され、出力時に ETSI 名にマッピングされます、#2103)。`timesSent` と `lastNotification` は notification が送信される直前に書き込まれます。`status`、`lastSuccess`、`lastFailure`、`timesFailed` はエンドポイントが応答した後に書き込まれます (clause 5.8.6 ステップ順序、#3526)。送信前の書き込みが失敗した場合でも notification は送信され、カウンタは 1 つ少なくなります。

**Subscription 拡張フィールド**

| Field                           | Type                         | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cooldown`                      | integer                      | Minimum interval between notifications (seconds). Positive integers only. Will not re-notify within the specified number of seconds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `notificationTrigger`           | string\[]                    | Event types that trigger notifications. `entityCreated`, `entityUpdated`, `entityChanged`, `entityDeleted`, `attributeCreated`, `attributeUpdated`, `attributeDeleted`. `entityChanged` is only triggered when attribute values actually change (updates with the same value are ignored)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `showChanges`                   | boolean                      | If `true`, includes type-specific previous-members in notification attributes (`normalized` / `concise`): `previousValue` (Property/GeoProperty/TemporalProperty), `previousObject` (Relationship), `previousLanguageMap`, `previousVocab`/`previousVocabMap` (GeonicDB extension for `vocabMap` shape), `previousValueList`, `previousObjectList`, `previousJson`. `keyValues` cannot represent sub-attributes, so previous-members are omitted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `notification.onlyChangedAttrs` | boolean                      | If `true`, includes only attributes that have actually changed in the notification payload. Can be combined with `notification.attributes`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `notification.pick`             | string\[]                    | Unified NGSI-LD projection (ETSI GS CIM 009 clause 4.21): attribute names to **include** in the notification payload. Maps to the same internal include projection as `notification.attributes` / `attrs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `notification.omit`             | string\[]                    | Unified NGSI-LD projection (ETSI GS CIM 009 clause 4.21): attribute names to **exclude** from the notification payload. Maps to the same internal exclude projection as `notification.exceptAttrs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `jsonldContext`                 | string (dereferenceable URI) | JSON-LD `@context` URI used when sending notifications (ETSI GS CIM 009 Table 5.2.12-1). If omitted, the field **is initialized** with the `@context` applied to the subscription — at creation, or on a later `PATCH` that updates at least one subscription field, **regardless of which of those updatable members that `PATCH` carries** (#2029 / #2040). A `PATCH` carrying only `@context` updates nothing and is still rejected with `400 BadRequestData` — the initialization is applied **after** the empty-update guard, so declaring a vocabulary alone never turns an empty update into a success — falling back to the NGSI-LD core context when none carried one. Initialization happens **once**: an already-set value (explicit or initialized) is never overwritten by a later `PATCH`, and a `PATCH` declaring only the core context does not change it (clause 5.8.1.4: "the `jsonldContext` field shall be **initialized** with the `@context` applicable for the Subscription"). The initialized value is returned by `GET` (#2041). **When the applied `@context` is not already a single URI** (an array, or an inline object), GeonicDB stores it as an `ImplicitlyCreated` `@context` (clause 5.13.1) and initializes this field with that entry's dereferenceable self-hosted URL — the field is typed `String (Dereferenceable URI)`, so the array itself cannot be the value, and a broker that has to notify with `Content-Type: application/json` needs the array to live at a URL (#2250). The matching vocabulary used by the subscription's type selectors is **not** affected. It is delivered with every notification and compacts both the entity type and the attribute names in `data[]` (one resolved value drives all three; see "Notification `@context`" below) |
| `expiresAt`                     | string (ISO 8601)            | Subscription expiration time                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `autoDisabledAt`                | string (ISO 8601)            | **GeonicDB extension (#3080).** Present when the broker automatically set the subscription to `inactive` because delivery failures continued for `NOTIFICATION_AUTO_PAUSE_AFTER_MS` (default 1 hour) without a success. Cleared when the subscription is set back to `active` (`isActive: true`). Distinguishes broker auto-pause from a manual `isActive: false` pause. Rendered `status` is `paused` (ETSI Table 5.2.12-1) while stored status is `inactive`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

**Notification `@context`** (#1841 / #1788、ETSI GS CIM 009 clause 5.3.1 / 5.8.1.4 / 5.8.6)

*どの `@context` が使用されるか。* 異なる受け入れ形式を持つ 2 つの異なるもの:

| Source                                                                     | Accepted shape                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `jsonldContext` (explicit)                                                 | **a single dereferenceable URI string only** — a non-URI string, an inline object or an array is rejected with `400 BadRequestData` at create/update time (the field is typed `z.string()`, and non-URI strings are rejected by an explicit absolute-IRI check)          |
| the subscription request `@context` (used when `jsonldContext` is omitted) | whatever a request `@context` may be: a URI, an **inline object**, or an **array** mixing both. A one-element URI array is folded to that URI (#2344). Other non-URI shapes are hosted as an `ImplicitlyCreated` `@context` and referenced by URL (#2250, clause 5.13.1) |
| neither present                                                            | the NGSI-LD core `@context` (clause 5.5.5)                                                                                                                                                                                                                               |

*GeonicDB がどのように配信するか。* GeonicDB 自体が添付するコンテキストは **正確に 1 回** 配信されます — ボディと `Link` ヘッダーの両方に同時に含まれることはありません。2 つのソースがあると、受信者がアクティブな `@context` について意見が一致しない可能性があるためです:

| `notification.endpoint.accept`                                                                    | Delivery                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `application/ld+json`                                                                             | `@context` member in the notification body                                                                                                                                                                                                                 |
| `application/json` (default)                                                                      | `Link` header (`rel="http://www.w3.org/ns/json-ld#context"`)                                                                                                                                                                                               |
| `application/geo+json`                                                                            | `@context` member in the body; `Link` header instead when `receiverInfo` carries `Prefer: body=json` (clause 6.3.8, #1762)                                                                                                                                 |
| MQTT without `receiverInfo` (or empty)                                                            | `@context` member in the body (backward compatible; MQTT has no headers)                                                                                                                                                                                   |
| MQTT whose `receiverInfo` has an entry other than `MQTT-QoS` / `MQTT-Version` (#3341, clause 7.2) | message is `{"metadata","body"}`. `application/json`: `@context` as `metadata.Link`. `application/ld+json`: `@context` on `body`. `application/geo+json`: same Prefer rule as HTTP, carried in `metadata`. Those two keys alone do not select the envelope |
| `httpCustom` (`payload` / `json`)                                                                 | neither — the body is defined entirely by the user                                                                                                                                                                                                         |

**`accept: application/geo+json` (#1762、#3732)。** ボディは通常の `Notification` (`id`、`type: "Notification"`、`subscriptionId`、`notifiedAt`、...) であり、その `data` は GeoJSON `FeatureCollection` です (ETSI TS 104 175 clause 5.2.6.9.1)。`@context` はその `FeatureCollection` の内部に配置されます (`Prefer: body=json` では省略され、`Link` ヘッダーに移動します — ただし、解決された `@context` にインラインオブジェクトが含まれている場合、`Link` は運べないため、`data["@context"]` に残ります)。`features[].properties` は `notification.format` に従います (`showChanges` の `previous*` メンバーを含む)。**Breaking (#3732)**: `FeatureCollection` は以前はトップレベルでした。完全なペイロードについては [SUBSCRIPTIONS.md → GeoJSON notifications](../features/ngsi-subscriptions.md) を参照してください。

`Link` ヘッダーが完全に運べない解決済み `@context` (インラインオブジェクト、または URL とインラインオブジェクトを混在させた配列 — どちらも上記のリクエスト `@context` を通じてのみ到達可能) は、`application/json` の場合でもボディに配置されます。`Link` は URI しか参照できず、URL 部分だけを出力すると、インラインで定義された用語が黙って削除されることになります。

「正確に 1 回」は **GeonicDB 自身のコンテキスト配信** を制約するものであり、notification 全体を制約するものではありません。`notification.endpoint.receiverInfo` は独自の `Link` ヘッダーを追加する場合があり、これは生成されたコンテキスト `Link` に追加されます (置き換えることはありません)。したがって、ボディの `@context` とカスタム `Link` ヘッダーは共存できます。

`data[]` の属性名は同じ `@context` で圧縮されます (clause 5.5.7)。したがって、notification とその `@context` で発行された `GET` は属性を同じように綴ります。完全修飾 IRI として保存された名前は圧縮されます。裸の保存名は変更されずに渡されます。

NGSIv2 subscriptions は `@context` メンバーや `Link` ヘッダーを受信しません。

**`q` / `geoQ` によるフィルタリング**

* `q` と `geoQ` は、`GET /ngsi-ld/v1/entities` と同じ述語ビルダーで評価され、どのエンティティ変更が notification を発火するかを制限します
  
* `geoQ.coordinates` は文字列または GeoJSON 形式の配列を受け入れます。`LineString` / `Polygon` に使用されるネストされた形式を含みます。`geoQ.geoproperty` は GeoProperty を選択します (デフォルトは `location`)
  
* `EntityDeleted` notifications は `q` / `geoQ` でフィルタリングされません (エンティティがもはや存在しないため、述語を評価できません)。完全なセマンティクスと制限については [SUBSCRIPTIONS.md](../features/ngsi-subscriptions.md) を参照してください
  

**検証**

* `watchedAttributes` と `timeInterval` は相互排他です。両方を同時に指定すると `400 Bad Request` が返されます (ETSI GS CIM 009 V1.9.1 clause 5.8.1)
  
* `throttling` と `timeInterval` は相互排他です (異なる動作モード)。両方を指定すると `400 Bad Request` が返されます (#1618)

**定期的な通知 (`timeInterval`)** (#1764)


* `timeInterval` を持つサブスクリプションは、属性が変更されたかどうかに関わらず**定期的に**通知されます (ETSI GS CIM 009 clause 5.8)。各通知には、**その時点で**サブスクリプションに一致するエンティティセットが含まれます。
  
* このようなサブスクリプションは**定期的のみ**です: エンティティの変更はトリガーしません。これが `watchedAttributes` と `timeInterval` が相互排他である理由です。
  
* 最初の通知は、サブスクリプション作成時ではなく、作成後 1 `timeInterval` 経過後に送信されます。
  
* `timeInterval` は永続化され、`GET /subscriptions/{id}` によって返されます。
  
* 各定期通知には最大 100 個のエンティティが含まれます (`PERIODIC_NOTIFICATION.MAX_ENTITIES_PER_NOTIFICATION`)。定期通知にはクライアント指定の `limit` がないため、結果サイズはサーバー側で制限されます。
  
* **実行時の粒度は異なります。** スタンドアロンモードでは、スイープが 1 秒ごとに実行されるため、短い間隔が守られます。AWS Lambda では、スイープは EventBridge Schedule によって駆動され、その**最小粒度は 1 分**であるため、60 未満の `timeInterval` は実質的に 60 秒になります。
  
* 通知プロジェクションセレクタは、**include** ファミリー (`notification.pick` / `notification.attributes` / `notification.attrs`) と **exclude** ファミリー (`notification.omit` / `notification.exceptAttrs`) に分かれます。各ファミリーごとに最大 1 つのセレクタのみを指定でき、include セレクタを exclude セレクタと組み合わせることはできません (`pick`/`omit` は ETSI GS CIM 009 clause 4.21 に従って相互排他)。違反すると `400 Bad Request` が返されます (#1627)
  
* `notification.pick` は内部の include プロジェクション (= `attributes`/`attrs`) にマッピングされ、`notification.omit` は内部の exclude プロジェクション (= `exceptAttrs`) にマッピングされます; 両方とも実際に通知ペイロードに適用されます (#1627、#1618 で追加された一時的な `400` 拒否を置き換え)
  
* `PATCH` では、通知プロジェクションは JSON Merge Patch (RFC 7396 / ETSI GS CIM 009 clause 5.8.2) に従います: セレクタを**省略**すると既存のプロジェクションが保持され、**配列**を送信すると置き換えられ、**`null`** を送信する (例: `"pick": null` / `"omit": null` / `"exceptAttrs": null`) とプロジェクションがクリアされ、通知は再びすべての属性を含むようになります。`null` は明確なシグナルであるため、include/exclude の排他性チェックから除外されるので、`pick: null` を `omit` 値と組み合わせて、include プロジェクションをクリアし、同じリクエストで exclude プロジェクションを設定できます。空配列 `[]` はクリア機構では**ありません** — すべてのセレクタは非空配列を必要とするため、クリアには `null` を使用してください (#1635)
  
* `jsonldContext` は単一の参照解決可能な URI 文字列でなければなりません (ETSI GS CIM 009 Table 5.2.12-1)。非 URI 文字列は `400 BadRequestData` を返します; 参照解決の失敗 (DNS/到達不可ホスト) は `504 LdContextNotAvailable` を返します; SSRF ブロックされた宛先は依然として `400 BadRequestData` を返します
  
* 無効な `q` (解析不可能な条件) と無効な `geoQ` (不明な `georel`、範囲外の座標、または `georel`/`geometry`/`coordinates` が一緒に指定されていない) は `400 Bad Request` を返します。
  以前はこれらは `201` で受け入れられ、その後無視されていました

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

> **行レベル読み取り認可 (#2140):** 行レベル読み取り述語 (カスタム XACML ポリシー) によって制限されたサブジェクトの場合、サブスクリプション読み取り (`GET /ngsi-ld/v1/subscriptions(/{subscriptionId})`、`GET /ngsi-ld/v1/csourceSubscriptions(/{subscriptionId})`) は `entities` から読み取り不可能な具体的な型セレクタを編集し、読み取り不可能な型のみを監視するサブスクリプションを非表示にし (リストの省略 / id による読み取りでは `404`)、編集後に `count` / ページネーションを計算します — CSR 読み取りと同じルールです (#2084)。型に依存しないサブスクリプション (`watchedAttributes` のみ、`type: "*"`、`id`/`idPattern`/`typePattern` のみのセレクタ) は影響を受けません。制限のないサブジェクトには変更はありません。[AUTH.md](../reference/auth.md) を参照してください (#2140)。

#### サブスクリプションの取得

```http
GET /ngsi-ld/v1/subscriptions/{subscriptionId}
```

**通知ステータスフィールド (読み取り専用)**

| Field                            | Type    | Description                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `notification.status`            | string  | `ok` or `failed`                                                                                                                                                                                                                                                                                                                                  |
| `notification.lastNotification`  | string  | Date and time of last notification sent (ISO 8601)                                                                                                                                                                                                                                                                                                |
| `notification.lastFailure`       | string  | Date and time of last notification failure (ISO 8601)                                                                                                                                                                                                                                                                                             |
| `notification.lastFailureReason` | string  | Reason for the last failure (e.g., `HTTP 500: Internal Server Error`, or `asyncDrop:<reason>` when a notification was discarded before delivery — GeonicDB extension, #3870). Cleared on success. Quota async drops update `lastFailure` / `lastFailureReason` only; they do not set `notification.status` to `failed` or increment `timesFailed` |
| `notification.lastSuccess`       | string  | Date and time of last successful notification (ISO 8601)                                                                                                                                                                                                                                                                                          |
| `notification.timesSent`         | integer | Number of notifications sent                                                                                                                                                                                                                                                                                                                      |
| `notification.timesFailed`       | integer | Number of failed notification deliveries; always generated, `0` when there are no failures (clause 5.2.14.2, #2103)                                                                                                                                                                                                                               |

> **エンティティセレクタは保存された形式でラウンドトリップします (#2067)。** `GET` は各 `entities[]` 要素を、実際に保存されたセレクタ — `id` / `idPattern` / `type` / `typePattern` — を使用して返し、`typePattern` を `type` に折りたたんだり、型セレクタが指定されていない場合に `type: "*"` を作成したりする代わりに返します。取得した本文を再度 `POST` すると、元のセレクタが再現されます; 以前は `^Sensor` のような `typePattern` が `type: "^Sensor"` としてレンダリングされていたため、レスポンスを再生するとパターンセレクタの代わりにリテラル型名が作成されました (`typePattern` は **GeonicDB 拡張**です — [SUBSCRIPTIONS.md → Entity Specification](../features/ngsi-subscriptions.md#entity-specification) を参照)。
> 同じ修正により、値が保存されていない場合、`notification.endpoint.accept` / `receiverInfo` がレスポンスから省略され、`null` としてレンダリングされなくなりました — `PATCH` で送り返された保存された `null` は、以前は `400` で失敗していました。なぜなら、`accept` は列挙値の 1 つまたは欠如のみを受け入れ、`null` は受け入れないためです。

**再試行動作**: 通知配信が失敗した場合、一時的なエラー (5xx、429、ネットワークエラー) に対して指数バックオフ (1 秒、2 秒、4 秒) で最大 3 回の再試行が実行されます。ほとんどの 4xx エラー (408/429 は一時的として扱われる) に対しては再試行は実行されません。一時的な障害が成功した配信なしで `NOTIFICATION_AUTO_PAUSE_AFTER_MS` (デフォルト 1 時間) の間続いた場合、Context Brokerはサブスクリプションを `inactive` に設定し、`autoDisabledAt` を記録し、マッチング/エンキューを停止し、現在の SQS メッセージを消費します (#3080)。`PATCH { "isActive": true }` で再開してください。

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

認証が有効になっている場合 (デフォルト)、サブスクリプションの更新 (PATCH) および削除 (DELETE) 操作は `createdBy` フィールドに基づいて所有権検証を実行します。作成者以外のユーザーがこれらの操作を試みると `404 Not Found` を受け取ります (サブスクリプションが全く存在しない場合と同様であるため、外部からは違いを観察できません)。`createdBy` が**ない**サブスクリプション (そのフィールドが存在する前に作成されたもの) も、管理者以外には `404 Not Found` を返します (#2161)。`super_admin` および `tenant_admin` ロールは、この検証をバイパスできます。詳細については、[AUTH.md](../reference/auth.md) を参照してください。

***

### 登録 (NGSI-LD)

NGSI-LD では、外部コンテキストプロバイダーは Context Source Registrations として登録されます。

#### 登録の作成

```http
POST /ngsi-ld/v1/csourceRegistrations
Content-Type: application/ld+json
```

> **`endpoint` はベース URI (`{apiRoot}`) を指定する。** ETSI GS CIM 009 clause 6.2 は全リソース URI が `{apiRoot}/ngsi-ld/v1/` の下に来ると規定しており、`/ngsi-ld/v1/...` は転送する側 (GeonicDB) が付ける。転送先が NGSI-LD として扱われるか NGSIv2 として扱われるかは **`endpoint` の文字列ではなく、登録を作成した API** で決まる — `/ngsi-ld/v1/csourceRegistrations` で作った登録は NGSI-LD として、`/v2/registrations` で作った登録は NGSIv2 として転送される (#1763)。`endpoint` の**パスプレフィクス**は転送 URL に保たれる (#1879) — `http://host/broker-a/` を登録すると転送先は `http://host/broker-a/ngsi-ld/v1/entities` になり、パスベースでルーティングする API ゲートウェイ配下の context source を登録できる。互換のため、`endpoint` が API ルート (`/ngsi-ld/v1` または `/v2`) で終わる場合はそれを `{apiRoot}` の一部とみなさず取り除く — 既に `http://host/ngsi-ld/v1` の形で登録済みの registration は従来どおり転送される (`/ngsi-ld/v1/ngsi-ld/v1/entities` にはならない)。

**Request Body**

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
    "startAt": "2020-01-01T00:00:00Z",
    "endAt": "2030-12-31T23:59:59Z"
  },
  "location": {
    "type": "Polygon",
    "coordinates": [[[139.5, 35.5], [140.0, 35.5], [140.0, 36.0], [139.5, 36.0], [139.5, 35.5]]]
  },
  "expiresAt": "2040-12-31T23:59:59.000Z",
  "mode": "inclusive"
}
```

**Request Fields**

| Field                 | Type                | Required | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------- | ------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                  | string (URI)        | -        | Client-settable registration identifier. If provided it is used as-is; re-registering an existing `id` returns `409 Conflict`. If omitted, the server generates a `urn:ngsi-ld:ContextSourceRegistration:{uuid}`.                                                                                                                                                                                                                                                                                                                                                         |
| `type`                | string              | ✓        | Fixed: `ContextSourceRegistration`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `registrationName`    | string              | -        | Registration name                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `description`         | string              | -        | Registration description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `endpoint`            | string              | ✓        | Provider endpoint URL                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `information`         | array               | ✓        | Provided information (entities, propertyNames, relationshipNames)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `observationInterval` | object              | -        | Observation interval — `{ "startAt": ISO8601, "endAt"?: ISO8601 }` (ETSI GS CIM 009 clause 5.2.11). The legacy GeonicDB member names `start` / `end` are still accepted on write and normalized to `startAt` / `endAt`, but responses always use the spec names (#2274)                                                                                                                                                                                                                                                                                                   |
| `managementInterval`  | object              | -        | Management interval — same shape as `observationInterval`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `location`            | GeoJSON             | -        | Geographic scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `scope`               | string or string\[] | -        | Registration scope hierarchy (ETSI GS CIM 009 Table 5.2.9-1 / clause 4.18). Single value is returned as a string; multiple values as a JSON array. Sending `scope: null` or `scope: []` explicitly unsets the scope (**GeonicDB extension**, same as entities)                                                                                                                                                                                                                                                                                                            |
| `expiresAt`           | string              | -        | Expiration time (ISO 8601 format)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `status`              | string              | -        | **GeonicDB extension.** Lifecycle flag (`active` / `inactive`); `inactive` registrations are excluded from federation forwarding and from type/attribute discovery. Defaults to `active`. Note that ETSI GS CIM 009 Table 5.2.9-2 reserves `status` for a read-only distributed-operation health value (`ok` / `failed`), so the response only carries this member when it is `inactive` (#2274)                                                                                                                                                                          |
| `mode`                | string              | -        | Mode (`inclusive` / `exclusive` / `redirect` / `auxiliary`). Exclusive overlap rules (#3274) are documented under write-forwarding registration modes below                                                                                                                                                                                                                                                                                                                                                                                                               |
| `operations`          | string\[]           | -        | Supported API operations (ETSI GS CIM 009 clause 4.20). Any operation names are accepted, e.g. group names (`federationOps`) or individual operations (`retrieveEntity`, `createBatch`, `setAttributeValue`). When omitted it is stored/returned as absent and treated as the implicit default `federationOps` (the field is not materialized into the response). **`setAttributeValue`** (#3864) is a GeonicDB interim individual name for Set Attribute Value forwarding — it is not in ETSI Table 9.2-1 / 4.20-1 and is not covered by `updateOps` / `redirectionOps`. |

**Response**

* Status: `201 Created`
  
* Header: `Location: /ngsi-ld/v1/csourceRegistrations/{registrationId}`
  
* Status: `409 Conflict` — クライアントが指定した `id` を持つ登録が既に存在します

#### 登録リストの取得

```http
GET /ngsi-ld/v1/csourceRegistrations
```

**Query Parameters**

| Parameter                                             | Type    | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Default |
| ----------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `id`                                                  | string  | Comma-separated Context Source Registration ids (NGSI-LD URIs)                                                                                                                                                                                                                                                                                                                                                                                                                            | -       |
| `type`                                                | string  | Entity type selector. Expanded with the request `@context` before matching                                                                                                                                                                                                                                                                                                                                                                                                                | -       |
| `attrs`                                               | string  | Comma-separated attribute names (`propertyNames` / `relationshipNames`). Expanded with the request `@context` before matching                                                                                                                                                                                                                                                                                                                                                             | -       |
| `q`                                                   | string  | Simple property equality against Context Source Properties: `name==value` (quoted forms `name=="value"` / `name=='value'` are also accepted). Compound expressions — inequality operators (`!=`, `>`, …), `;` (AND), `\|` (OR), parentheses — are **not** supported and return `400 BadRequestData`, as do syntactically invalid values (clause 5.10.2.4). The property name must match `[A-Za-z_][\w]*` and the value is a single string / number literal (see the `q` note below) | -       |
| `georel` / `geometry` / `coordinates` / `geoproperty` | string  | NGSI-LD geoquery (clause 4.10). `georel`, `geometry` and `coordinates` must be supplied together; invalid values return `400 BadRequestData`                                                                                                                                                                                                                                                                                                                                              | -       |
| `scopeQ`                                              | string  | Scope query against the registration's `scope` member (clause 4.19 / 5.10.2). Same operators as entity `scopeQ` (`/#`, `/+`, `;` AND **with parentheses**, `,`/`\|` OR). Requires another selector (`type`, `attrs`, `q`, geoquery, or `id`) — `scopeQ` alone is not sufficient (too-wide query)                                                                                                                                                                                    | -       |
| `timerel` / `timeAt` / `endTimeAt` / `timeproperty`   | string  | NGSI-LD temporal query (clause 4.11). See the temporal scoping note below                                                                                                                                                                                                                                                                                                                                                                                                                 | -       |
| `options`                                             | string  | `sysAttrs` to include `createdAt` / `modifiedAt` in the response (clause 6.3.11)                                                                                                                                                                                                                                                                                                                                                                                                          | -       |
| `limit`                                               | integer | Number of results to retrieve                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 20      |
| `offset`                                              | integer | Offset                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 0       |
| `count`                                               | string  | `true` to return the total count in `NGSILD-Results-Count`                                                                                                                                                                                                                                                                                                                                                                                                                                | -       |

> **範囲が広すぎるクエリ (#2304 / #2442)。** ETSI GS CIM 009 clause 5.10.2.4 は、`id` / `type` / `attrs` / `q` / 地理クエリ (`georel` / `geometry` / `coordinates`) のいずれも指定されていない場合に `400 BadRequestData` を必須としています。`limit` / `offset` / `count` / 時間クエリ / `local=true` のみでは**不十分**です (Query Entities とは異なり、CSR ディスカバリーにはローカルスコープの免除はありません)。具体的な `id` リストは十分です (ETSI 037\_10\_01; 以前の #2304 の文言では `id` を不十分として扱っていましたが、#2442 で修正されました)。clause 5.7.2.4 とは異なり、`attrs` / `q` は非システム属性を必要と**しません**。
>
> **`q` は単純な等価性のみ (#2442 / #2627)。** CSR ディスカバリーでは、`q` 条件は **Context Source Properties** — 登録ドキュメントの追加のトップレベルメンバー — と一致し、エンティティ属性とは一致しません (ETSI GS CIM 009 clause 5.10.2.4: "the conditions specified by the context source query filter match the respective Context Source Properties")。単純な等価性形式 `name==value` のみが実装されています。不等号演算子、`;` (AND)、`|` (OR)、括弧で囲まれた複合式は `400 BadRequestData` で拒否されます — エントリ検証時に実行と同じ契約で拒否されるため、受け入れられた式が後で拒否されることはありません。これは意図的なものです: 固定された ETSI スイート (`334dd6d0`) では、CSR ディスカバリーは `q` を正確に 2 つのケース — `037_10_02` (`csourceProperty1=="aValue"`、単純な等価性) と `037_03_02` (構文的に無効 → 400) — で演習し、両方とも合格します。完全な clause 4.9 文法は、エンティティ `q` 実装と同じコストがかかり、そのパーサーはエンティティストレージの形状 (`attributes.<name>.value` ドットパス、datasetId エイリアスセット) に結合されており、登録プロパティには転送されません。スイートが複合式を要求する場合、または別の `csf` パラメーター (Table 6.8.3.2-1; ここでは未実装) が取り上げられる場合に再検討してください。
>
> **`q` 値の文法は狭い (#2442 / #2627)。** プロパティ名は `[A-Za-z_][\w]*` と一致する必要があります (ASCII ワード文字のみ — `foo:bar`、ドット付き、ハイフン付き、Unicode またはその他の非 `\w` 名は一致しません)。値は単一のスカラーです: 空白 / `()` / `;` / `|` / `&` を含まない引用符なしの実行、または引用符付きの `"..."` / `'...'` 文字列。マッチングは文字列等価性です。数値として字句解析される値は、数値として格納されたプロパティとも一致します (`buildRegistrationPropertyQueryFilter` は `Number` 候補を追加します)。ブール値はリテラル文字列としてのみ一致します。オブジェクト / 配列 Context Source Properties は対象にできません。
>
> **空 / 空白のみの `q` は存在しないものとして扱われる (#2442 / #2304)。** `listRegistrations` は `q.trim().length > 0` の場合にのみ `q` フィルタを構築するため、`q=` と空白のみを含む `q` の両方はセレクタではありません: `q=` 単独では `400 BadRequestData` を返します (範囲が広すぎるクエリ、clause 5.10.2.4 — セレクタが残っていない)。一方、`type=Building&q=` は `200` を返し、`type` フィルタのみを適用します。既存の E2E はこれをガードしています ("空 / 空白の type・attrs・q はセレクタとして数えない")。
>
> **地理クエリ Polygon リング (#2442 / ETSI 037\_07\_02)。** `GET /csourceRegistrations` のみで、最初 / 最後の座標が異なる単一リング Polygon は、地理フィルタが実行される前に閉じられたものとして扱われます (最初の頂点が追加されます)。エンティティ / サブスクリプションの地理クエリは、閉じられていないリングを `400 BadRequestData` で拒否します — 緩和は ETSI スイートのペイロードに一致させるために CSR ディスカバリーに限定されています。

> **時間スコープ (#2274)。** clause 5.10.2.4 により、時間クエリが**存在しない**場合は `observationInterval` / `managementInterval` を**持たない**登録のみが考慮される。時間クエリが存在する場合、関連する interval がクエリ期間と**重複する**登録のみが返される:`timeproperty=observedAt` (デフォルト) は `observationInterval` とマッチし、`timeproperty=createdAt` / `modifiedAt` / `deletedAt` は `managementInterval` とマッチする。関連する interval を持たない登録は決してマッチしない。interval の端点は inclusive であり、`endAt` が欠落している場合は interval は open-ended を意味する。
>
> **システム属性 (#2274)。** `createdAt` / `modifiedAt` は `options=sysAttrs` が指定された場合のみ返される (clause 6.3.11)。未知の `options` トークンは `400 InvalidRequest` で拒否される (clause 6.3.20)。
>
> **`type` と `attrs` は AND で組み合わされる (#1892)。** 両方を指定すると「その型を提供し、**かつ** その属性を提供する」登録だけが返る (以前は OR だった)。`id` も他の条件と AND。
>
> **`@context` による term ⇄ URI 変換 (#1800 / #1890)。** ETSI GS CIM 009 clause 5.5.7 に従い、`type` / `attrs` はリクエストの `@context` (`Link` ヘッダ) で展開してから照合し、応答の `information[].entities[].type` / `propertyNames` / `relationshipNames` はリクエストの `@context` で compact して返す。したがって登録時と別の `@context` を使っても、同じ URI を指す term でヒットし、その `@context` の語彙で返る。完全修飾 URI での照会も可能。
>
> 属性名の照合インデックスは **登録時の表記と展開後の URI の両方**を保持する。federation の転送マッチ (`findMatchingRegistrations`) 側の展開は #1899 (PR #1996) で実装済みで、別 `@context` の同義 term でもヒットする。両持ちは登録済みデータの後方互換のために維持する。
>
> **転送先の照合で `type` を省略した場合 (#1994)。** `GET /ngsi-ld/v1/entities/{id}`(かつローカルに当該エンティティが存在しない)や一覧クエリで `type` を指定しないとき、照合する型は**未確定**として扱われ、**型で絞らずに全 active 登録が転送候補**になる。
>
> **制限付き principal も同じ候補集合を得る (#2003)。** 以前は「行レベルの読み取り述語 (`readableEntityFilter`) を持つ制限付き principal では従来の保守的な照合を維持する」という例外があった — リモートエンティティがこの述語を通らず、候補集合を広げると読めないはずの型のエンティティが混ざりうるためである。#2003 でリモート結果にも同じ述語を適用するようになったため、この例外は撤去された。制限付き principal でも通常どおりの照合が行われ、返ったエンティティのうち述語が許さない行は応答に載らない。**ただし照合後に、読めない型しか宣言していない登録は転送候補から外れる** — 転送してしまうと、プロバイダー障害時の `NGSILD-Warning: 199` に載る `endpoint` / registration id や、`exclusive` 登録に対する Via ループ検出の 508 から、その登録の存在が観測できてしまうため。型を宣言しない登録 (`entities` 省略 / `'*'`) は型情報を持たないので従来どおり転送される。`ContextSourceRegistration` に保存される `'*'` は「**登録側**が任意の型を受け付ける」ことを表す値であり、「照合側の型が未確定」を意味しない — 両者を同一視すると、`entities` を省略した登録にしか当たらず、`entities: [{"type": "Sensor"}]` のように**型を宣言した登録へは一度も転送されない**。`type` はオプション (clause 5.7.1 / 5.7.2 — 一覧クエリは `attrs` / `q` / `georel` だけでも成立する) なので、省略できることが前提となる。`type` を明示した場合の絞り込みは従来どおり効く。

**Response Example**

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
    ]
  }
]
```

#### Retrieve Registration

```http
GET /ngsi-ld/v1/csourceRegistrations/{registrationId}
```

#### Update Registration

```http
PATCH /ngsi-ld/v1/csourceRegistrations/{registrationId}
```

**Request Body**

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "endpoint": "http://new-provider:8080/"
}
```

**Response**: `204 No Content`

> **部分更新 (#2442 / clause 5.5.8 / 5.9.3.4)。** body は Context Source Registration Fragment である:フラグメントで指定されたメンバーは更新または追加され、フラグメントから省略されたメンバーは保持される。Context Source Properties (Table 5.2.9-1 を超える追加のトップレベルメンバー) も同じルールに従う — `csourceProperty1` のみを送信する PATCH は、保存されている他のプロパティを削除**しない**。`expiresAt` は正規の有効期限メンバーであり、レガシーエイリアス `expires` も作成 / 更新時に受け入れられる。

#### Delete Registration

```http
DELETE /ngsi-ld/v1/csourceRegistrations/{registrationId}
```

**Response**: `204 No Content`

#### Ownership Verification (GeonicDB Extension)

認証が有効な場合(デフォルト)、登録更新 (PATCH) および削除 (DELETE) 操作は `createdBy` フィールドに基づいて所有権検証を行う。作成者以外のユーザーがこれらの操作を試みると `404 Not Found` を受け取る(登録が全く存在しない場合と同じため、外部から違いは観測できない)。`createdBy` を**持たない**登録(そのフィールドが存在する前に作成された)も非管理者には `404 Not Found` を返す (#2161)。`super_admin` および `tenant_admin` ロールはこの検証をバイパスできる。詳細は [AUTH.md](../reference/auth.md) を参照。

#### CSR Advanced Fields (ETSI GS CIM 009 V1.9.1)

Context Source Registration では以下の高度なフィールドがサポートされている:

| Field                | Type                       | Description                                                                                                                                                                             |
| -------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cacheDuration`      | string (ISO 8601 duration) | Cache duration for responses from the context source                                                                                                                                    |
| `refreshRate`        | string (ISO 8601 duration) | Interval for periodic refresh to the context source                                                                                                                                     |
| `timeout`            | integer (ms)               | Request timeout to the context source. Only returned when it was explicitly set (#2274)                                                                                                 |
| `contextSourceAlias` | string                     | Alias name for the context source                                                                                                                                                       |
| `contextSourceInfo`  | object\[]                  | Additional metadata for the context source                                                                                                                                              |
| `operationGroup`     | string\[]                  | Operation groups: `federationOps`, `retrieveOps`, `updateOps`, `redirectionOps`                                                                                                         |
| `operations`         | string\[]                  | Supported API operations (ETSI GS CIM 009 clause 4.20). Accepts arbitrary operation names — group names (`federationOps`) or individual operations (`retrieveEntity`, `createBatch`, …) |

### 分散オペレーション情報

#### Broker Identity の取得

```http
GET /ngsi-ld/v1/info/sourceIdentity
```

コンテキストブローカーの identity 情報を返します。分散環境におけるContext Broker識別に使用されます。

**Authentication**: 必須(保護対象)。`sourceIdentity` はContext Brokerの `endpoint` URL とソフトウェアバージョンを公開するため、フィンガープリンティングを制限するために認証の背後に配置されます。

**Response**: `200 OK` (`application/ld+json`)

`ContextSourceIdentity` (ETSI GS CIM 009 clause 5.2.40) を返します。必須メンバー:

| Member                | Type   | Description                                                                                                                                                                                                                                                                                                                                              |
| --------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contextSourceAlias`  | string | RFC 7230 pseudonym (token). GeonicDB returns the same pseudonym as its `Via` header (`BROKER_ID`) for loop identification (clause 6.3.18)                                                                                                                                                                                                                |
| `contextSourceUptime` | string | ISO 8601 duration. Calculated from deployment start time: `BROKER_START_TIME` is preferred; if missing/invalid/future, process start time is used                                                                                                                                                                                                        |
| `contextSourceTimeAt` | string | Current UTC DateTime in ISO 8601 format (millisecond precision, trailing `Z`)                                                                                                                                                                                                                                                                            |
| `contextSourceExtras` | object | **Implementation-specific configuration data** (`name` / `description` / `endpoint` / `supportedApi` / `supportedOperations` / `registrationMode` / `version`). Table 5.2.40-1 defines this member as "raw un-expandable JSON which shall not be interpreted as JSON-LD using the supplied @context" — the core `@context` declares it as `@type: @json` |

> **Breaking change (#1798)**: これらの実装固有メンバーは以前は**トップレベル**で返されていました。現在は `contextSourceExtras` 配下に配置されています。トップレベルは厳密に Table 5.2.40-1 のメンバーセットになっています。古い配置では、コア `@context` v1.9 の下でセマンティック的に誤ったトリプルを生成していました — `endpoint` は `ngsi-ld:endpoint` (**CSourceRegistration** エンドポイント用の用語)に展開され、`description` は `dcterms:description` に展開されていました。

レスポンス例:

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.9.jsonld",
  "id": "urn:ngsi-ld:ContextSourceIdentity:geonicdb-staging",
  "type": "ContextSourceIdentity",
  "contextSourceAlias": "geonicdb-staging",
  "contextSourceUptime": "PT2H3M4S",
  "contextSourceTimeAt": "2026-08-05T12:34:56.789Z",
  "contextSourceExtras": {
    "name": "GeonicDB",
    "description": "FIWARE Orion-compatible Context Broker running on AWS Lambda. Supports NGSIv2 and NGSI-LD APIs for IoT/smart city context data management.",
    "endpoint": "https://geonicdb.geolonia.com",
    "supportedApi": ["ngsi-ld-v1", "ngsiv2"],
    "supportedOperations": ["federationOps", "retrieveOps", "updateOps", "redirectionOps"],
    "registrationMode": ["inclusive", "exclusive", "redirect", "auxiliary"],
    "version": "0.16.0"
  }
}
```

> **Note (#1585)**: `GET /ngsi-ld/v1/info/conformance` エンドポイントは以前公開されていましたが、**削除されました**。ETSI GS CIM 009 (v1.8.1 / v1.9.1) は conformance-class モデルも `/info/conformance` オペレーションも定義していません — 唯一の規範的な `/info/*` リソースは `/info/sourceIdentity` です。このパスは現在、他の存在しない NGSI-LD リソースと同じように動作します:認証/認可されたリクエストは `404 Not Found` を受け取ります;`AUTH_ENABLED=true` でテナントに対する明示的な `role=anonymous` XACML Permit がない場合、未認証リクエストはルーティング前に `403` で拒否されます(そのような Permit が存在する場合、ルーティングが進み、削除されたパスは `404` を返します)。以前の公開・未認証の `200` レスポンスは廃止されました。適合性は out-of-band で(Orion-LD / Stellio / Scorpio と同じ方法で、[geonicdb-compliance](https://github.com/geolonia/geonicdb-compliance) の固定された ETSI Test Suite 測定値を通じて)表明されます。

#### 分散クエリパラメータ

| Parameter   | Type    | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `local`     | boolean | If `true`, **no Context Source Registration is considered as matching**, so the operation is answered from local data only (ETSI GS CIM 009 Table 6.3.18-1). Applies to `GET /entities`, `GET /entities/{entityId}`, `POST /entityOperations/query`, `GET /types`, `GET /types/{typeName}`, `GET /attributes` and `GET /attributes/{attrId}`. `local` is a **Boolean**: any lexical value other than `true` / `false` returns `400 BadRequestData` (#2008) |
| `localOnly` | boolean | Alias of `local`, kept for backward compatibility. When both are present, `local` wins (#2008)                                                                                                                                                                                                                                                                                                                                                             |
| `csf`       | string  | Context Source Filter expression (e.g., `name==value`, `endpoint~=pattern`)                                                                                                                                                                                                                                                                                                                                                                                |

> **`local` 受け入れ値 (#2008)**: これが実装される前は、`localOnly` のみが尊重され、仕様で定められた `local` は**転送に全く影響しませんでした** — `local=true` を指定したリクエストでも登録された Context Source に到達していました。`POST /entityOperations/query` はどちらの名前も尊重しませんでした。転送は現在単一の場所 (`@api/ngsild/utils/local-scope`) で決定されるため、すべての読み取りパスが同じ方法で応答します。非 Boolean 値は以前は黙って無視されていました(したがって転送されていました);現在は `400 BadRequestData` を返し、`DELETE /entities` が既に行っていたことと一致します。
>
> **`/types/` と `/attributes/` も (#2036)**: 規範的な表現は\*「Context Source Registration は一致するものとして考慮されない」*であり、*「転送しない」\*ではありません。これらのディスカバリーエンドポイントは外部へのリクエストを送信しませんが、登録宣言された型と属性名をレスポンスにマージします — `local=true` の場合、その登録由来データは現在除外されます。
>
> `/temporal/entities/` と `/temporal/entityOperations/` は `local` を受け入れますが、現在は no-op です:時系列読み取りパスにはフェデレーション配線がないため、既にローカルのみになっています。
>
> **非 HTTP エントリーポイントはデフォルトを反転 (#2072)**: MCP ツールと A2A スキルは、`local="false"` が明示的に渡され、かつそれらのクエリアクション (`entities` list / search\_by\_location / search\_by\_attribute、`batch` query) でのみ Context Source に転送*しません*。`local` は HTTP バインディング用に定義されているため、非 HTTP サーフェスでのローカルのみのデフォルトは適合性の逸脱ではありません;両方のサーフェスは同期リクエスト/レスポンスであり、転送は AI クライアントを要求していないプロバイダーのラウンドトリップレイテンシに晒すことになります。ID による取得はそこではローカルのみのままです — #2092 は HTTP の ID 指定パスの認可ホールを閉じました(リモートのみのエンティティが現在行レベルの読み取り述語を通過します)ので、MCP / A2A からの ID 指定転送はもはやそれによってブロックされていませんが、未実装のままです。`docs/AI_INTEGRATION.md` を参照してください。

#### 分散オペレーションレスポンスヘッダー

| Header           | Description                                                                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NGSILD-Warning` | Warning message set when some context sources fail during federation (ETSI GS CIM 009 - 6.3.6), or when forwarding was skipped due to loop detection (6.3.17/6.3.18, warn-code 199) |
| `Via`            | Loop detection header for distributed operations (ETSI GS CIM 009 - 6.3.18 / RFC 7230). The broker appends its own pseudonym as `1.1 <BROKER_ID>` to forwarded requests             |

#### 書き込み転送 (#1709)

読み取りだけでなく、**NGSI-LD の書き込みも一致する Context Source Registration へ転送される**
(ETSI GS CIM 009 - 6.3.x)。対象は次の 5 経路:

| 操作                                                      | 転送先                                                              |
| ------------------------------------------------------- | ---------------------------------------------------------------- |
| `POST /ngsi-ld/v1/entities`                             | `POST {apiRoot}/ngsi-ld/v1/entities`                             |
| `PUT /ngsi-ld/v1/entities/{entityId}`                   | `PUT {apiRoot}/ngsi-ld/v1/entities/{entityId}`                   |
| `PATCH /ngsi-ld/v1/entities/{entityId}/attrs`           | `PATCH {apiRoot}/ngsi-ld/v1/entities/{entityId}/attrs`           |
| `DELETE /ngsi-ld/v1/entities/{entityId}`                | `DELETE {apiRoot}/ngsi-ld/v1/entities/{entityId}`                |
| `DELETE /ngsi-ld/v1/entities/{entityId}/attrs/{attrId}` | `DELETE {apiRoot}/ngsi-ld/v1/entities/{entityId}/attrs/{attrId}` |

属性削除の**インスタンス選択条件** (`?datasetId=` / `?deleteAll=true`、ETSI GS CIM 009 clause 5.6.5.4) は
転送先のクエリにもそのまま載る。落とすと「ローカルは指定インスタンス・転送先は既定インスタンス」を
消す silent な分岐になるため (どちらも 204 を返すのでクライアントからは観測できない)。
redirect モードでも同じ条件を透過プロキシ先の DELETE に載せる(クライアントへ `redirectUrl` は返さない)。**NGSI-LD の登録にだけ載せる** — `datasetId` / `deleteAll` は多重属性 (clause 4.5.5) の概念で NGSIv2 には存在しないため。

**転送するのはこの 5 経路だけ** (#2072 と同じ opt-in 規律)。`EntityService` の書き込みメソッドは
NGSIv2 の単体書き込み・NGSI-LD の batch (`entityOperations/*`) / merge patch (`PATCH /entities/{id}`) /
append からも呼ばれるが、それらは**従来どおりローカルのみ**で Context Source へは転送しない。
「どの入口が転送しうるか」を呼び出し側のコードから静的に読める状態に保つための設計であり、
配線範囲を広げるときは `Via` 伝播・`NGSILD-Warning` 配線・回帰 E2E をセットで足すこと
(#2448 で POST create / PUT replace を追加した際もこの規律に従った)。

> **#3248:** `PUT /entities/{entityId}` (Replace Entity) も #2195 と同型で、ローカル複製が
> 無くても exclusive / redirect registration があれば Context Source へ転送する
> (`D007_01_red`)。**inclusive のみ**・registration 無しのローカル不在は従来どおり `404`
> (inclusive で転送すると local NotFound + provider 成功が 2 ターゲット 207 になるため)。

登録モードごとの扱いは読み取りと同じ規約に揃えてある:


* **inclusive**: ローカルと Context Source の**両方**に適用する。Context Source へ送る属性は exclusive / redirect が請求したあとの残余のうち、その inclusive の `propertyNames` / `relationshipNames` に一致する分だけ(宣言が空なら残余の全部)。一致する残余が空なら呼ばない (#3286 / clause 5.6.2.4 / 5.6.7.4 / 5.6.8.4 / 5.6.9.4 / 5.6.20.4 ほか)
  
* **exclusive**: Context Source にのみ適用し、**ローカルは書き換えない** (データは外部にしか無い)
  
* **redirect**: 単体書き込み・読み取りとも透過プロキシ (一致した Context Source **全件**へ転送、#3244)。
  旧来の `redirectUrl` / `404+Location` は #2830 で廃止 (#2444 以降の書き込みと同型)
  
* **auxiliary**: ローカルのみ (auxiliary は書き込み転送対象外)

> **exclusive 登録時の重複拒否 (#3274 / clause 4.3.6.3 / 5.9.2):**
> 保存後の `mode` が `exclusive` になる create、および `mode` / `information` を含む PATCH で、
> **entity id を明示したセレクタ**について、同一 tenant/servicePath 内の active な
> exclusive / redirect と Entity ID + 属性集合が交差するとき `409 Conflict`
> (`type: https://uri.etsi.org/ngsi-ld/errors/Conflict`) を返す。
> 照合に type は使わない(同一 id なら type が違っても衝突)。属性未宣言は全属性請求として扱い、部分交差でも拒否する。
> **GeonicDB 独自拡張として** clause 4.3.6.3 の「exclusive は entity id 必須・Attributes 必須」を強制しない
> (ETSI 033\_01\_02 および既存 fixture との互換のための緩和)。type のみ / idPattern のみの
> exclusive、および属性未宣言の exclusive は従来どおり `201` で受理する。重複検査の対象も
> **id を明示したセレクタのみ**。新規が `redirect` のときは登録間の重複検査をしない
> (複数 redirect の重なりは仕様上許可)。同時登録の check-then-insert はベストエフォートで、
> 検出できない場合は従来どおり一致した全件へ fan-out する。既存の重複データに対する
> マイグレーションは行わない。

> **Delete Entity (#3316 / #3389 / clause 5.6.6.4):**
> `DELETE /entities/{id}` は一致した exclusive / redirect の全件と、`deleteEntity` を許可する inclusive の全件へ転送する。
> ローカルにエンティティがあればそれも削除する (`The input data shall be used to remove the entity locally if it exists`)。
> このローカル削除は provider の成否より先に確定する。全ターゲット成功なら `204`。
> provider が失敗したとき(未許可 operation の Conflict、HTTP エラー、到達不能)も、ローカルにあったエンティティは削除済みで、
> 応答は `207` (BatchOperationResult) になる。`deleteEntity` を許可しない exclusive / redirect は呼ばず Conflict として計上する。
> 許可しない inclusive は転送も失敗計上もしない。
> ローカルに無く Context Source だけが持つ場合はローカル削除をしない(404 にもしない)。

> **一部属性だけの exclusive / redirect / inclusive (#3245 / #3268 / #3286 / clause 4.3.6.3 / 5.6.2.4):**
> registration が `propertyNames` / `relationshipNames` で一部属性だけを宣言しているとき、
> Create / Replace / Update Attributes (`PATCH /entities/{id}/attrs`) / Merge Entity
> (`PATCH /entities/{id}`) および **batch create / upsert / update / merge**
> (`POST /entityOperations/{create,upsert,update,merge}`) は**登録属性だけを Context Source へ送り、未登録属性はローカルに書く**。
> **inclusive** は exclusive / redirect が取ったあとの残余のうち宣言一致分だけを受け取る(宣言空なら残余全部)。残余が空、または宣言と一致する属性が無ければその inclusive は呼ばない。
> この並存転送は属性分割を行う単体および batch 経路 (Create / Replace / Update Attributes / Merge / Append、および batch create / upsert / update / merge) に加え、ローカル不在の単体 Update / Merge にも適用する(#3316)。ローカル不在の単体 Update / Merge は inclusive の残余だけを送り、exclusive / redirect は全属性のまま転送する。ローカルエンティティは作らない(作ると local 404 と provider 成功が 207 になる)。
> `PATCH|PUT|DELETE /entities/{id}/attrs/{attrName}` は clause 5.6.4.4 / 5.6.5.4 / 5.6.19.4 の単一属性操作で、exclusive / redirect 一致時に inclusive を呼ばない。batch delete は対象外。
> Delete Entity は属性分割ではなく、一致した proxied 全件と supported inclusive 全件へ転送し、ローカルは存在すれば消す(上記 Delete Entity)。
> CS への POST は registration 単位で 1 回にまとめる。属性未宣言の exclusive(全属性請求)は従来どおり転送のみでローカルには書かない。
> **batch のローカル不在 Update / Merge は属性分割しない** — 全属性を Context Source へ送り、この経路ではローカル作成しない。
> **batch upsert `options=replace`** は単体 Replace と同型で、残余属性が空でもローカル置換する。

**`operations` 未サポート時 (#3247 / #3271 / ETSI GS CIM 009 clause 5.6.1.4・5.6.7–5.6.10 ほか):**

照合された Context Source Registration の `operations`(省略時は既定 `federationOps`)が
当該書き込み操作をカバーしないとき、Context Brokerは provider を呼ばない。
`redirectionOps` と既定 `federationOps` は `createBatch` / `upsertBatch` / `updateBatch` /
`deleteBatch` / `mergeBatch` を含まない。

| 経路                           | mode                         | 応答                                                                                                                                                                                                                                                                                                               |
| ---------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 単体書き込み                       | **exclusive** / **redirect** | `409 Conflict`（Problem Details `type: https://uri.etsi.org/ngsi-ld/errors/Conflict`）。ターゲットが 2 件以上なら `207 Multi-Status` の UpdateResult / 同等構造に Conflict を載せる。ただし `DELETE /entities/{id}` はローカルにエンティティがあれば provider の成否に関わらず削除する。未許可・HTTP 失敗・到達不能とローカル削除成功が混ざるときは `207` (BatchOperationResult) を返す (#3316 / #3389) |
| 単体書き込み                       | **inclusive**                | 転送しない・失敗にも計上しない。ローカル書き込みのみ行い `201` / `204` を返す（`NGSILD-Warning` は付けない）                                                                                                                                                                                                                                           |
| batch (`entityOperations/*`) | **exclusive** / **redirect** | 全体は `207 Multi-Status` のまま、要素の `errors[].error` に Conflict（`type` / `title` のみ。BatchProblemDetails に `status` は載せない）。ローカルには書かない                                                                                                                                                                                  |
| batch (`entityOperations/*`) | **inclusive**                | 転送しない・失敗にも計上しない。ローカル書き込みのみ行い `201` / `204` を返す                                                                                                                                                                                                                                                                   |
| いずれか                         | **auxiliary**                | 従来どおり書き込み転送なし                                                                                                                                                                                                                                                                                                    |

単体および batch (create / upsert / update / merge) 書き込みで inclusive へ送る属性は exclusive / redirect が請求したあとの残余のうち宣言一致分。一致が空ならその inclusive は呼ばない (#3286)。inclusive 単独でも宣言があるときは宣言一致分だけを送り、宣言空は従来どおり全属性を送る。

転送リクエストには読み取りと同じ `Via` ヘッダ (`1.1 <BROKER_ID>`) が付き、ループ検出も
同じ規約で効く (下記)。

**転送先の失敗は握り潰さない:**


* **inclusive** (ローカルにも書く) — 部分成功なので `NGSILD-Warning: 199 - "Context Source
  {endpoint} (registration: {id}) responded with error: ..."` を付けて返す。書式は読み取り側の
  `failedProviders` 由来の 199 と同一
  
* **exclusive** (ローカルを書かない) で **1 つも成功しなかった場合は `502 ContextProviderError`** を返す (エラー応答なので詳細は ProblemDetails に載る。`NGSILD-Warning` は付かない)。
  ローカルを書き換えていない以上その書き込みはどこにも適用されておらず、204 を返すと
  「削除したはずのデータがローカルに残り続け、登録を外した瞬間に再び読める」状態になるため
  (読み取り側 exclusive の `failOnProviderError` と同じ判断)
  
* **Context Source が 207 Multi-Status を返した場合** (#3246 / #3269 / #3304): 単体書き込み転送では失敗
  ターゲットとして扱い、Context Brokerも **207** に集約する。`response.ok` が 207 でも true になるため、

未処理だと黙って 204 になる。本文を読めるときは要素へ畳む (#3304):

* 属性系: CS の UpdateResult の `notUpdated` を、呼んだ registration の `registrationId` 付きで
  Context Brokerの UpdateResult へ載せる。`updated` にあり `notUpdated` に無い属性は失敗にしない。
  送った属性名と一致しない要素は捨て、本文に無い送出属性は従来の汎用失敗にする。
  送った属性名が空のターゲットは本文を信用しない。
  
* エンティティ系: CS の BatchOperationResult の `errors` を `registrationId` 付きで載せる。
  要素の `entityId` がリクエストの entityId と 1 件でも違うときは本文ごとフォールバックする。
  
* purge (`DELETE /entities`) は本文を読まない。集約キーが型名や `purge` と一致しても畳まず、
  ターゲット失敗 1 件のまま。
  
* 空 body・非 JSON・期待形でない・失敗要素 0 件・reason/title/detail に制御文字があるときは、
  従来どおりターゲット失敗 1 件。
  
* **受信側の `notUpdated` 行数上限** (#4033): `SECURITY.MAX_UPDATE_RESULT_NOT_UPDATED`
  (= `2 × MAX_BATCH_SIZE`)。同一属性名で `Already exists` と exclusive/redirect 除外が並びうるため、
  属性数天井の 2 倍。旧受信側 (`MAX_BATCH_SIZE`) と混在すると明細が汎用 Multi-Status に落ちるので、
  **上流の受信側を先に更新する**こと。先行更新で防げるのは「旧上限を超え、新上限には収まる」場合だけ。
  破棄条件は属性名ごとではなく **`notUpdated` の総行数**が `2 × MAX_BATCH_SIZE` を超えること
  (同名理由の増加や複数転送先の積み上げで総行数が新上限を超えうる)。上限内の同名複数行は受理する。
  `updated` / エンティティ系 `errors` の上限は従来どおり `MAX_BATCH_SIZE`。
  batch (`entityOperations/*`) は要素単位の BatchResult を読む (#2446)。Context Brokerが返す 207 本文の形は
  エンドポイント種別による (下表)。batch 要素エラーで Context Source が実 HTTP ステータス (4xx/5xx) や 207 を返したときは
  ETSI 型を合成せず `errors[].error.type` を `about:blank` にする (#3266。title は HTTP reason
  phrase、detail は `Context provider responded with HTTP {n}`)。到達不能は従来どおり
  `ContextProviderError`。

**単体書き込み distributed 207 の本文形 (#3269 / ETSI GS CIM 009 5.2.16 / 5.2.18):**

| エンドポイント                                                  | 本文形                                         | 備考                                                                             |
| -------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------ |
| `POST /entities`                                         | BatchOperationResult (`success` / `errors`) | `errors[].error.status` を含む (D001\_03)                                         |
| `PATCH /entities/{id}` (Merge Entity)                    | BatchOperationResult                        | 同上。Null 削除が内部で `removeAttributes` / `deleteAttribute` を通っても入口はエンティティ系なので形は変えない |
| `PUT /entities/{id}` (Replace Entity)                    | BatchOperationResult                        | 同上                                                                             |
| `DELETE /entities/{id}`                                  | BatchOperationResult                        | `errors[].error.status` を含む (D002\_02)                                         |
| `DELETE /entities` (Purge)                               | BatchOperationResult                        | 同上                                                                             |
| `POST /entities/{id}/attrs`                              | UpdateResult (`updated` / `notUpdated`)     | `notUpdated[].registrationId` (5.2.19)。status は載せない                            |
| `PATCH /entities/{id}/attrs`                             | UpdateResult                                | 同上。scope 由来 notUpdated と distributed 失敗は同一 UpdateResult にマージ                   |
| `PATCH` / `PUT` / `DELETE /entities/{id}/attrs/{attrId}` | UpdateResult                                | 同上                                                                             |

`updated` / `notUpdated[].attributeName` の表記 (#3269 / #4023 / ETSI GS CIM 009 §5.2.18 / §6.3.6):

| 由来                                  | 表記                                            | 理由                        |
| ----------------------------------- | --------------------------------------------- | ------------------------- |
| distributed 成功・失敗                   | リクエスト `@context` で展開した FQN                    | §6.3.6 の 207 本文は FQN      |
| noOverwrite skip (`Already exists`) | リクエスト `@context` で展開した FQN                    | §5.2.18 / #2419 / 010\_04 |
| exclusive/redirect 除外               | FQN（保存時 `@context` 優先、無ければリクエスト）              | #4023                     |
| scope 未適用 / scope だけの失敗             | Core FQN `https://uri.etsi.org/ngsi-ld/scope` | 属性ではなくエンティティ級フィールド        |

**競合リトライ後の exclusive 再照合 (#4023):** 通常更新(`options=noOverwrite` 無し)で
ローカル書き込みが版競合したあと、再試行前に exclusive/redirect を再照合する。該当した要求属性は
ローカルへ書かない。転送はリクエスト内で一度のまま。転送先結果が無ければ `409 Conflict`、
転送先結果があれば既存の `207` 集約に載せる。`noOverwrite` は除外理由を 207 の `notUpdated` に載せる。
Merge / PATCH の更新失敗時に未試行の Null 削除は `Not attempted` として同じ 207 に載る。

> **#2195:** exclusive / redirect registration が一致すれば、ローカル複製が無くても
> Context Source へ書き込みを転送する (読み取り側 `getEntity` と同じ構造)。
> inclusive のみ・registration 無しのローカル不在は従来どおり `404`。

#### ループ検出 (#1664)

ETSI GS CIM 009 - 6.3.17 / 6.3.18 に基づき、受信リクエストの `Via` ヘッダに自Context Brokerの
pseudonym (`BROKER_ID`、既定 `geonicdb`)が含まれる場合はループと判定する:


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
  
* Via チェーンの長さはカスケード深度 (`FEDERATION.MAX_CASCADING_DEPTH`、既定 3)の
  判定にも使われる
  
* **federation する各デプロイには一意の `BROKER_ID` を設定すること** (`docs/ENV.md`)。
  両方既定値のままだと相互に false positive のループ検出になる

#### CSR 変更通知

Context Source Registration が作成、更新、または削除されると、マッチする CSource Subscription の通知エンドポイントへ自動的に通知が送信される (ETSI GS CIM 009 - 5.11)。通知には変更の種類を示す `Ngsild-Trigger` ヘッダが含まれる (`csourceRegistration-created`、`csourceRegistration-updated`、`csourceRegistration-deleted`)。

通知ペイロードの `type` は `ContextSourceNotification` である (ETSI GS CIM 009 Table 5.3.2-1)。GeonicDB は `id` に対して既存の URI 契約 (`urn:ngsi-ld:Notification:<...>`)を保持する。これは仕様が有効な URI を要求するが固定プレフィックスを義務付けていないため有効である。

#### 分散型タイプ・属性ディスカバリ

`/ngsi-ld/v1/types` および `/ngsi-ld/v1/attributes` エンドポイントは、ローカルエンティティに加えて、Context Source Registrations に登録されたエンティティタイプと属性を返します(ETSI GS CIM 009 - 5.9.3.3)。

> **行レベルの読み取り認可は、registration 由来の貢献にも適用されます(#2079)。** 行レベルの読み取り述語によって制限されたサブジェクト(カスタム XACML ポリシー、[AUTH.md](../reference/auth.md#policy-to-filter-query-rewriting-for-list-queries-1337--1369) を参照)の場合、registration で宣言されたタイプ/属性名は、宣言されたタイプが読み取り可能である可能性がある場合にのみレスポンスに貢献します — registration を使用して、サブジェクトが読み取りアクセス権を持たないタイプの存在や属性名を知ることはできません。`/types/{typeName}` および `/attributes/{attrId}` は、唯一の一致する貢献が読み取り不可能なタイプを宣言する registration である場合、`404` にフォールスルーします。**いかなる**エンティティタイプも宣言しない registration(`entities` の省略、`type: "*"`、または `id`/`idPattern` のみのセレクター — #1594 のワイルドカード形式)は、タイプ情報を持たないため、その属性名は依然として貢献します。提供される `typeNames` のみが読み取り可能なタイプに絞り込まれます。制限のないサブジェクト(デフォルトの `user` / `tenant_admin` / `super_admin` ロール)には変更はありません。
>
> **CSR ドキュメント自体の読み取りは、同じ述語によって編集されます(#2084)。** `GET /ngsi-ld/v1/csourceRegistrations` および `GET /ngsi-ld/v1/csourceRegistrations/{registrationId}` は、`information[].entities[]` から読み取り不可能な具体的なタイプセレクターを削除し、読み取り不可能なタイプのみを宣言する information エントリーを削除し、完全に編集されたドキュメントをリストから省略し(`count` とページネーションは編集後に計算)、ID による読み取りでそれらに対して `404` を返します。`?type=` / `?attrs=` は編集されたドキュメントに対して再マッチングされるため、読み取り不可能なタイプセレクター経由でのみマッチした registration はまったく表示されません。タイプに依存しない registration(`entities` の省略、`type: "*"`、`id`/`idPattern` のみのセレクター)は、タイプ情報を持たないため影響を受けません。制限のないサブジェクトには変更はありません。完全なルールについては [AUTH.md](../reference/auth.md) (#2084) を参照してください。
>
> **Registration タイプセレクターは、discovery エンドポイントがそれらを読み取る際に正規化されます(#2086)。** 上記の述語は、**保存された**タイプ名を XACML マッチャー値と完全な文字列一致で比較します。NGSI-LD registrations は書き込み時に正規化されて保存されます(`normalizeTypeName`、#1700)が、**NGSIv2 registrations(`POST`/`PATCH /v2/registrations`)は `dataProvided.entities[].type` をそのまま保存します** — NGSIv2 にはアクティブな `@context` がないため、展開ルールがありません。registrations はプロトコル間で可視化されるため、NGSIv2 から `https://uri.etsi.org/ngsi-ld/default-context/Sensor` として登録されたタイプは、`Deny entityType == Sensor` ルールと文字列一致せず(過剰な許可)、一方 `/types/Sensor` および `/attributes/{attr}` はまったく一致しませんでした(サイレント `404`)。discovery エンドポイントは、読み取り時点で **core** ボキャブラリーを使用して registration タイプセレクターを正規化するようになったため、認可述語、完全一致検索、およびレンダリングされたタイプ名はすべて同じ値を参照します。**保存された**形式は変更されず、`GET /v2/registrations` は依然としてそのままのタイプを返します(属性名に対する #1890 と同じ規律) — 正規化は、永続化される内容ではなく、マッチングに使用される値に適用されます。変換は既に正規化された値に対して不動点であるため、既存のデータは移行なしでカバーされます。

### EntityMap 操作

> **ETSI GS CIM 009 リファレンス**: セクション 5.14 - Entity Map

NGSI-LD EntityMap は、クエリ結果をマップとして保存し、後でエンティティ ID による効率的なアクセスを可能にする機能です。

#### EntityMap 形式でエンティティを取得

`GET /ngsi-ld/v1/entities` のクエリパラメータに `options=entityMap` を指定すると、エンティティ ID をキーとするオブジェクトとしてレスポンスが返されます。

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

#### EntityMap の作成

```http
GET /ngsi-ld/v1/entityMaps?type=TemperatureSensor
```

```http
POST /ngsi-ld/v1/entityMaps
Content-Type: application/json

{"type":"Query","entities":[{"type":"TemperatureSensor"}]}
```

type、attributes、query、geo query、または `local=true` を指定します。GET は URL 内のセレクタを使用します。POST では `type: "Query"` のボディを使用して、ローカル検索と Context Source 転送に同じセレクタを使用します。GeonicDB はレガシーな URL セレクタ POST (`POST /entityMaps?type=...` にオプションの `expiresAt` ボディを含む形式)も受け入れます。**この形式も一致する Context Sources に連携します**。ローカルエンティティのみに作成を制限するには `local=true` を使用します。`typePattern` のみを使用する、または他のセレクタがないローカル専用クエリにも `local=true` を使用してください。`typePattern` は **GeonicDB 独自拡張**で、逐語的な正規表現です(暗黙の `*`→`.*` 変換はありません)。`type` と組み合わせると **AND** になり(両方が一致する必要があります)、エンティティリストの規則に従います(#2105/#2122)。

GET と POST は `201 Created` を返し、マップの URL が `Location` と `NGSILD-EntityMap` に含まれます。レスポンスは、選択された各エンティティ ID を `entityMap` 内のソースにマッピングします。マップは `expiresAt` で期限切れになります。新しく作成されたマップは自動クリーンアップの対象となります。`linkedMaps` は一致するコンテキストソースが保持するマップを識別します。返された location を後続のクエリで `NGSILD-EntityMap` リクエストヘッダとして使用します。新しいマップは `GET /entities?entityMap=true` と元のセレクタでも要求できます。

`entityIds` と `totalCount` は GeonicDB 互換性フィールドです。`entityMap` と `linkedMaps` はソースとそのマップへの ETSI マッピングを提供します。

以前に GET を使用してマップをリストしていた場合は、各マップの作成時に返された `Location` を保存し、それを使用して ID でマップを取得してください。単一マップの取得、更新、削除では、管理者以外の呼び出し元に対して所有権が強制されます。作成には呼び出し元が読み取り可能なエンティティのみが含まれます。

#### EntityMap の取得

```http
GET /ngsi-ld/v1/entityMaps/{entityMapId}
```

**レスポンス**: `200 OK` / `404 Not Found`

> 他の principal が作成した EntityMap には **`404`** を返します(#1963)。`403` にすると「その id の EntityMap は存在する」と分かってしまい、存在自体が漏れるためです。

#### EntityMap の更新

```http
PATCH /ngsi-ld/v1/entityMaps/{entityMapId}
Content-Type: application/ld+json
```

**レスポンス**: `204 No Content`

期限切れのマップを更新すると `404` が返されます。アクティブなマップに過去の `expiresAt` を設定すると、即座に期限切れになります。

#### EntityMap の削除

```http
DELETE /ngsi-ld/v1/entityMaps/{entityMapId}
```

**レスポンス**: `204 No Content`

### リンクされたエンティティの取得 (join/joinLevel)

エンティティ取得エンドポイント(`GET /ngsi-ld/v1/entities` および `GET /ngsi-ld/v1/entities/{entityId}`)では、`join` および `joinLevel` クエリパラメータを使用してリンクされたエンティティを取得できます。同じ 2 つのメンバーは、サブスクリプションでも `notification.join` / `notification.joinLevel` として利用可能であり(表 5.2.14.1-1、#2104)、通知ペイロード内で同じように動作します。

| Parameter   | Type    | Description                                                                                                                                                             |
| ----------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `join`      | string  | Linked entity retrieval mode: `inline` (nested inside Relationship) or `flat` (appended to result array)                                                                |
| `joinLevel` | integer | Depth of linked entity resolution (default: 1, max: 5). Values above the maximum are rejected with 400 to prevent resource exhaustion from exponential link resolution. |

`join=inline` と `join=flat` の両方は、**リクエストごとに `joinLevel` 再帰全体にわたる**展開幅を 10000 (`NGSI_LD.MAX_JOIN_NODES`、#3656 / #3939)に制限します。これを超えると `400 Bad Request` で拒否されます。`joinLevel`、`limit`、またはリレーションシップの数を減らしてください。


* **`join=inline`**: 上限は**レンダリングされたリンクエンティティの総数**です。同じリンクエンティティは一度取得されますが、すべての参照でレンダリングされるため、カウントは結果ページ全体で展開された参照の数になります(例:`limit=1000` でそれぞれ 2 つのリンクがある場合は 2000)。
  
* **`join=flat`**: 上限は**すべての解決深度にわたって取得されたリンクエンティティの累積数**です(レンダリングの増幅はありません。追加されたリンクセット自体がレスポンスの幅です)。各深度内で、リンクターゲット ID は重複排除されます。**別の深度で再取得された同じ ID は再びカウントされます**(例:R→A×5000→B→A×5000 のサイクルを `joinLevel=3` で実行すると、一意な ID は 5001 個のみですが、10001 回の取得が累積され、400 を返します)。レベルごとの予算 6000 × `joinLevel=2` も同様に合計で 10000 を超え、400 を返します。

上限を超えるサブスクリプションの `notification.join=inline` または `notification.join=flat` は拒否されません。通知はリンクされたエンティティなしで配信されます。

> **移行 (#3939):** 以前は 10000 を超えるリンクエンティティ(再帰的な `joinLevel` 深度全体を含む)を持つフラット結合結果で `200` を返していたリクエストは、現在 `400` を返します。同じことが `join=flat` を持つ `POST /entityOperations/query` にも適用されます。`joinLevel` / `limit` を下げるか、Relationship のファンアウトを減らしてください — これは `join=inline` (#3656)と同じ緩和策です。

> **`datasetId` と join (#3668):** `datasetId` が指定されている場合(条項 4.5.5.1)、join は**返された Attribute インスタンス**のみに従います(ETSI GS CIM 009 条項 5.7.1.5 / 5.7.2.5)。一致しない Relationship インスタンスは取得されず、inline レンダー上限にカウントされず、`join=flat` の下に追加されません。同じルールは各 `joinLevel` および `POST /entityOperations/query` で再帰的に適用されます。[Multi-Attribute (datasetId)](#multi-attribute-datasetid) も参照してください。

**使用例**

```bash
# inline mode - linked entities are nested inside the Relationship
curl "https://api.example.com/ngsi-ld/v1/entities?type=Room&join=inline&joinLevel=2" \
  -H "Fiware-Service: smartcity"

# flat mode - linked entities are appended to the result array
curl "https://api.example.com/ngsi-ld/v1/entities/urn:ngsi-ld:Room:001?join=flat&joinLevel=1" \
  -H "Fiware-Service: smartcity"
```

**出力形式** (ETSI GS CIM 009 条項 4.5.23.2、#2222)

`inline` は、アノテーション付き Relationship に `entity` サブメンバーを追加し、リンクされたエンティティを**囲んでいるレスポンスと同じ表現形式**(normalized / concise)で保持します。埋め込まれたエンティティは独自の `@context` を持ちません — それは親ドキュメントの一部であり、スタンドアロンの JSON-LD ドキュメントではありません。

```jsonc
// normalized
"refLinked": {
  "type": "Relationship",
  "object": "urn:ngsi-ld:Linked:001",
  "entity": { "id": "urn:ngsi-ld:Linked:001", "type": "Linked",
              "marker": { "type": "Property", "value": "ok" } }
}
```

`keyValues`(簡略化)では、Relationship 自体が `entity` メンバーを獲得するのではなく、リンクされたエンティティの簡略化された表現によって**置き換えられます**(条項 4.5.3 EXAMPLE 9):

```jsonc
// keyValues
"refLinked": { "id": "urn:ngsi-ld:Linked:001", "type": "Linked", "marker": "ok" }
```

`flat` は、リンクされたエンティティを独立したエンティティとして結果配列に追加します(そのため、それ自体の `@context` を**持ちます**)。Relationship 自体は手つかずのまま — `entity` メンバーを獲得せず、すでに持っていた `datasetId` / サブ属性は保持されます。

**どのリンクが辿られるか (#2225)**

3 つすべてのリンク形式が、`inline` と `flat` の両方で、マルチ属性インスタンスとして現れる場合も含めて辿られます(条項 4.5.5):

| Attribute                                                            | Link member  | `inline` output member                                     |
| -------------------------------------------------------------------- | ------------ | ---------------------------------------------------------- |
| `Relationship` with a single `object` URI                            | `object`     | `entity` — the linked entity                               |
| `Relationship` with an `object` **array** (clause 4.5.3 allows both) | `object[]`   | `entity` — an **array**, in `object` order                 |
| `ListRelationship`                                                   | `objectList` | `entityList` — an **ordered array**, in `objectList` order |

メンバー名は属性タイプに従います:仕様は `ListRelationship` での `entity` と `Relationship` での `entityList` を禁止しています。順序は常に属性自身の `object` / `objectList` から来るものであり、ターゲットが偶然取得される順序から来るものではありません。

`keyValues` では、置換値に同じ区別が適用されます:単一の `object` は 1 つの簡略化されたオブジェクトによって置き換えられ(EXAMPLE 9)、`object` 配列 / `objectList` は簡略化されたオブジェクトの**順序付き配列**によって置き換えられます(EXAMPLE 17)。マルチ属性インスタンスは条項 4.5.4 の `dataset` マップを保持し、`datasetId` ごとの値のみが置き換えられます。

```jsonc
// normalized, ListRelationship (#3837 / clause 4.5.22.2 — objectList is {"object": URI}[])
"route": {
  "type": "ListRelationship",
  "objectList": [
    { "object": "urn:ngsi-ld:City:002" },
    { "object": "urn:ngsi-ld:City:001" }
  ],
  "entityList": [
    { "id": "urn:ngsi-ld:City:002", "type": "City", "cityName": { "type": "Property", "value": "Rotterdam" } },
    { "id": "urn:ngsi-ld:City:001", "type": "City", "cityName": { "type": "Property", "value": "Antwerp" } }
  ]
}

// keyValues, same attribute (clause 4.5.3 EXAMPLE 17)
"route": [
  { "id": "urn:ngsi-ld:City:002", "type": "City", "cityName": "Rotterdam" },
  { "id": "urn:ngsi-ld:City:001", "type": "City", "cityName": "Antwerp" }
]
```

解決できないターゲット(存在しない、または下記の読み取り述語によってフィルタされたもの)は、単純に `entityList` / `entity` から欠落します。ターゲットが何も解決されない場合、メンバー自体が完全に省略されるため、空の配列が「読み取り不可」を意味するために使用されることはありません。

> **`entityList` は `objectList` と位置的に整列していません。** 一部のターゲットが解決され、他が解決されない場合、配列は**圧縮**されます — `objectList: [c, b, a]` で `b` が読み取り不可の場合、`entityList: [C, A]` が生成されます。エントリは `id` で照合し、インデックスでは決して照合しないでください。(仕様では既に両者が乖離することを許可しています:「以前に遭遇した」ターゲットも同様に省略されます。)同じことが、複数ターゲットの `Relationship` に対する `entity` の配列形式にも適用されます。
>
> **認可 (#2213)**: リンクされたエンティティは、リンク元エンティティと**同じ行レベルの読み取り述語**の下で解決されます。特定のエンティティタイプの読み取りをポリシーで拒否された呼び出し元は、どの `joinLevel` であっても、`Relationship` を通じてそのタイプのエンティティを受け取りません。リンク自体(読み取り可能なエンティティ上の `Relationship` `object` URI)は依然として返されます — ターゲットエンティティのコンテンツのみが保留されます。[AUTH.md](../reference/auth.md#aggregate-and-derived-reads-over-entities-1370--1955) を参照してください。

### Context Source Registration Subscriptions

NGSI-LD では、Context Source Registration Subscriptions (CSR subscriptions) は、コンテキストソース登録への変更を監視するサブスクリプションを管理します。

> **通知はサブスクリプション作成者の読み取り述語によって編集されます (#2133)。** CSR subscriptions は作成者 (`createdBy`) を保存します。配信される CSR ドキュメントは、`GET /ngsi-ld/v1/csourceRegistrations` (#2084) と同じ行レベルの編集を通過し、作成者の現在のポリシーで評価されます。読み取り不可能な型セレクタを介してのみマッチする通知は配信されません。保存された作成者を持たないサブスクリプション(この変更前に作成されたもの)、または作成者がアクティブなユーザーでなくなった場合、通知は **受信されません**(フェイルクローズ。構造化された警告 `CSOURCE_NOTIFICATION_RLS_*` がログに記録されます)。[AUTH.md](../reference/auth.md) (#2133) を参照してください。

#### CSR Subscription の作成

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

| Field               | Type                         | Required | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------- | ---------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                | URI                          | -        | Client-provided subscription id (ETSI GS CIM 009 Table 5.2.12-1). If omitted, the broker assigns `urn:ngsi-ld:CSourceSubscription:{uuid}`. A second `POST` with the same `id` returns `409 AlreadyExists` (#2315)                                                                                                                                                                                                                                                      |
| `type`              | string                       | ✓        | Fixed: `Subscription`                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `entities`          | array                        | ✓        | Target entities to monitor (type, id, idPattern)                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `notification`      | object                       | ✓        | Notification settings (endpoint.uri is required)                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `description`       | string                       | -        | Subscription description                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `watchedAttributes` | array                        | -        | List of attributes to monitor                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `expiresAt`         | string                       | -        | Expiration time (ISO 8601 format)                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `throttling`        | number                       | -        | Notification interval (seconds)                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `isActive`          | boolean                      | -        | Active state (default: true)                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `jsonldContext`     | string (dereferenceable URI) | -        | JSON-LD `@context` used when sending `ContextSourceNotification`s (#2025, ETSI GS CIM 009 Table 5.2.12-1 / clause 5.8.1.4). If omitted, the `@context` applied to this csource subscription at create/update time is used, falling back to the NGSI-LD core context. Must be a single absolute IRI that GeonicDB can resolve — otherwise `400 BadRequestData`. Returned by `GET` when set                                                                              |
| `q`                 | string                       | -        | Filter on Context Source Properties (ETSI GS CIM 009 clause 5.11.2.4 / #2762). Only simple equality (`name==value`) is supported — same contract as discovery `GET /csourceRegistrations?q=` (#2442). Applied as a notification filter against the registration's additional properties                                                                                                                                                                                |
| `geoQ`              | object                       | -        | Geo filter on the registration's `location` (default `geoproperty`) — clause 5.11.2.4 / #2762. Evaluated in-app on create/update/delete notification matching (including before-state for `newlyMatching` / `noLongerMatching`). **Supported for CSR notification filtering: `geometry: Point` with `georel: near` (maxDistance/minDistance) or `equals` only** — other combinations are rejected with `400` at create/update (in-app evaluator has no Mongo 2dsphere) |
| `temporalQ`         | object                       | -        | Temporal filter on `observationInterval` / `managementInterval` (`timeproperty` selects which) — clause 5.11.2.4 / #2762. Overlap semantics match discovery (clause 5.10.2.4). **When omitted, only registrations without time intervals match** (absence rule — not "pass all")                                                                                                                                                                                       |
| `scopeQ`            | string                       | -        | Filter on the registration's `scope` member (clause 5.11.2.4 / #2844). Same operators as entity/discovery `scopeQ`. Evaluated in-app on create/update/delete notification matching                                                                                                                                                                                                                                                                                     |

`watchedAttributes` と `notification.attributes` は、`csourceRegistrations` 属性名と同じ `@context` 用語 ⇄ URI ルールに従います (#1890 / #1900)。名前は書き込み時の `@context` でそのまま保存されます。GET レスポンスはリクエストの `@context` を使用してそれらを圧縮します。CSR 通知のマッチングは、エイリアスセットの交差(そのまま ∪ 正規)を使用します。

結果として生成される `ContextSourceNotification` の `@context` は、通常のサブスクリプション通知と同じ配信ルールに従います (#2025 / #1841)。`notification.endpoint.accept: application/ld+json` はそれをボディに配置し、`application/json` は `Link` ヘッダーに配置し、**両方には決してなりません**。#2025 以前は、コア `@context` は `accept` に関係なく常にボディに配置され、提供された `jsonldContext` は暗黙的に破棄されていました。

**レスポンス**

* ステータス: `201 Created`
  
* ヘッダー: `Location: /ngsi-ld/v1/csourceSubscriptions/{subscriptionId}`
  
* ステータス: `409 Conflict` — 同じクライアント提供の `id` を持つサブスクリプションが既に存在します (#2315)

#### CSR Subscription リストの取得

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
    "status": "active"
  }
]
```

**レスポンスフィールド**

| Field      | Type    | Description                                                                                                                                                                                                                                        |
| ---------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`   | string  | Read-only. `active` \| `paused` \| `expired` (ETSI GS CIM 009 Table 5.2.12-1, #2440). `paused` when created/updated with `isActive: false`; `expired` once `expiresAt` has passed, derived at read time regardless of the stored value |
| `isActive` | boolean | Only present (and `false`) when `status` is not `active` (#2452) — mirrors the input field, omitted on the common case                                                                                                                             |

#### CSR Subscription の取得

```http
GET /ngsi-ld/v1/csourceSubscriptions/{subscriptionId}
```

#### CSR サブスクリプションを更新

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

ETSI GS CIM 009 clause 5.13 (*Storing, Managing and Serving @contexts*) に準拠した JSON-LD コンテキスト管理 API。ユーザー定義の JSON-LD コンテキストの登録と管理を可能にします。

保存されたコンテキストは 3 種類のいずれかを持ちます (clause 5.13.1)。仕様の語彙は大文字で表され、**レスポンスはそれを使用します** (#2250):

| `kind`              | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Served on demand?                                                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `Hosted`            | Explicitly added by a client (`POST /jsonldContexts`). Add @context **always** creates `Hosted` (clause 5.13.2.4); a client-supplied `kind` is rejected with `400` (#2297)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Yes                                                                                                                                        |
| `ImplicitlyCreated` | Created by the broker as a side effect of a client request — the auto-generated `@context` of a custom data model, or a subscription `@context` that is not already a dereferenceable URI (2+ element arrays / inline objects; clause 5.13.1, #2250 / #2344)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Yes                                                                                                                                        |
| `Cached`            | Fetched / recorded by the broker from an external URL for its own use (not creatable via Add @context, #2297). **GeonicDB extension (#2418):** on subscription (and csource subscription) write paths, a successful remote `@context` fetch is persisted as `Cached` so notification compaction can resolve it without outbound fetch (hot path `#1680`). Cap: **`CONTEXT_RESOLVER.MAX_CACHED_PER_TENANT` (500)** records per tenant+servicePath. When the cap is reached, new URLs are not cached; notification attribute/type names for those subscriptions may stay expanded (FQN) until capacity is available **and** a subsequent subscription or csource-subscription write fetches and caches the context. Deleting an entry alone does not re-cache existing subscriptions. **TTL (#2628):** each Cached record gets `expiresAt = now + CONTEXT_RESOLVER.CACHED_CONTEXT_TTL_MS` (default 24h). Authenticated lookup and `@context` resolution re-fetch when expired; failure keeps the stale snapshot and warns (no Mongo TTL delete). The unauthenticated serve endpoint and List never re-fetch — they return the stale snapshot. Legacy rows without `expiresAt` use `createdAt + TTL` (+ deterministic jitter). | **No** — `422 OperationNotSupported` (clause 5.13.4.4). Metadata is still available with `details=true` (includes `expiresAt` when Cached) |

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

クライアントが提供する `kind` フィールドは `400 BadRequestData` で拒否されます — clause 5.13.2.4 はすべての Add @context エントリを `Hosted` としてフラグします (#2297)。

**レスポンス**

* ステータス: `201 Created`
  
* ヘッダー: `Location: /ngsi-ld/v1/jsonldContexts/{contextId}`

> **`Location` 内の `{contextId}` は、パスセグメントが必要とする範囲を超えてパーセントエンコードされません (#2250)。**
> `:` と `@` は RFC 3986 §3.3 の下で `pchar` であり、そのまま出力されるため、ヘッダーは
> `Location: /ngsi-ld/v1/jsonldContexts/urn:ngsi-ld:JsonLdContext:<uuid>` となります。これらをエンコードすると
> 通常のクライアントのラウンドトリップが壊れます: `Location` から id を取り出し、次の URL を構築する際にパスセグメントとしてエンコードするクライアントは `urn%253A…` を送信することになり、サーバー側で 1 回デコードしても元に戻らず、リクエストは `400 BadRequestData` で拒否されます。
> パスを壊す可能性のある文字 (`/`、`?`、`#`、空白、制御文字) は依然としてパーセントエンコードされます。同じことが `POST /ngsi-ld/v1/csourceRegistrations` と `POST /ngsi-ld/v1/csourceSubscriptions` の `Location` にも適用されます。

#### JSON-LD コンテキストリストの取得

```http
GET /ngsi-ld/v1/jsonldContexts
```

**クエリパラメータ**

| Parameter | Type    | Description                                                                                                                                                                                                                                                                                                                                                                          | Default |
| --------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| `limit`   | integer | Maximum number of results                                                                                                                                                                                                                                                                                                                                                            | 20      |
| `offset`  | integer | Number of results to skip                                                                                                                                                                                                                                                                                                                                                            | 0       |
| `details` | string  | `true` or `false`. Any other value is rejected with `400 BadRequestData` (#2250)                                                                                                                                                                                                                                                                                                     | `false` |
| `kind`    | string  | Filter by stored context kind. Accepts the specification vocabulary `Cached` / `Hosted` / `ImplicitlyCreated` (clause 5.13.3.3) and, for backward compatibility, the lowercase forms this implementation stores (`cached` / `hosted` / `implicitlyCreated`). Both are normalized to the stored value before filtering; any other value is rejected with `400 BadRequestData` (#2250) | —       |

**レスポンス**: `200 OK`

デフォルトでは、ボディは **URL のリスト** です (clause 5.13.3.1)。各 URL は対応する `@context` をダウンロードするために使用できます:

```json
[
  "http://localhost:3000/ngsi-ld/v1/jsonldContexts/urn:ngsi-ld:JsonLdContext:6f1b...",
  "https://example.org/custom-context.jsonld"
]
```

`details=true` の場合、ボディはメタデータオブジェクトのリストです (clause 5.13.3.5):

```json
[
  {
    "URL": "http://localhost:3000/ngsi-ld/v1/jsonldContexts/urn:ngsi-ld:JsonLdContext:6f1b...",
    "localId": "urn:ngsi-ld:JsonLdContext:6f1b...",
    "kind": "Hosted",
    "createdAt": "2026-08-15T00:00:00.000Z"
  }
]
```

`URL` は **レコードが URL を持つ場合のコンテキストの元の URL** です (`Cached` では必須、clause 5.13.3.1); 値によって登録されたコンテキストは、このContext Brokerの配信 URL を取得します。`localId` は登録時に `Location` で返される識別子です。

#### JSON-LD コンテキストの取得

```http
GET /ngsi-ld/v1/jsonldContexts/{contextId}
```

**クエリパラメータ**

| Parameter | Type   | Description                                                                                                                                                                                    | Default |
| --------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `details` | string | `true` returns metadata about the `@context` (same shape as the list above) instead of its content (clause 5.13.4.3). `true` or `false`; any other value is rejected with `400 BadRequestData` | `false` |

**レスポンスボディ**

`details` なしの場合、ボディは**保存された `@context` ドキュメント自体**です(clause 6.30.3.1 — "a JSON object that has a root node named `@context`")。そのため、URL は任意の JSON-LD プロセッサによって直接参照解決できます:

```json
{
  "@context": {
    "Temperature": "https://example.org/ontology#Temperature"
  }
}
```

登録時に `@context` サブツリー外で提供された情報は破棄されます(clause 5.13.2.3)。ボディは両方の表現で同一です:ここでの `@context` はペイロードであり、NGSI-LD エンベロープ宣言ではないため、`application/json` の `Link` ヘッダーに移動されることは**ありません**。

`Cached` コンテキストの**コンテンツ**の提供は `422 OperationNotSupported` で拒否されます(clause 5.13.1 / 5.13.4.4);その**メタデータ**(`details=true`)はすべての種類で返されます。

**キャッシュヘッダー**

レスポンスには以下のキャッシュ関連ヘッダーが含まれます:

| Header          | Description                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------ |
| `ETag`          | MD5 hash of the context body                                                                     |
| `Last-Modified` | Creation date and time of the context                                                            |
| `Cache-Control` | `public, max-age=3600`                                                                           |
| `Vary`          | Includes `Link` and `Accept` — response `@context` placement depends on these request dimensions |

**表現に関する注意(#1838 / #2250):** ボディは表現によって変化しなくなりました — 両方とも保存された `@context` ドキュメントです。`Vary` と表現をシードにした `ETag` は、`Content-Type` とレスポンスの `Link` ヘッダーが表現ごとに異なるため保持されます(RFC 9110 §8.8.1: entity-tag は*選択された*表現を識別します)。`Vary` を無視する共有キャッシュは、同じ `contextId` URL の表現を混在させる可能性があります(相互運用性のリスクであり、テナントリークではありません — `contextId` はグローバルに一意であり、エンドポイントは認証されていません)。

**条件付きリクエスト**

| Request Header      | Behavior                                                          |
| ------------------- | ----------------------------------------------------------------- |
| `If-None-Match`     | Returns `304 Not Modified` if the ETag matches                    |
| `If-Modified-Since` | Returns `304 Not Modified` if no changes since the specified date |

**レスポンス**: `200 OK` / `304 Not Modified`

#### JSON-LD Context の削除

```http
DELETE /ngsi-ld/v1/jsonldContexts/{contextId}
```

**クエリパラメータ**

| Parameter | Type    | Required | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------- | ------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reload`  | boolean | No       | Optional flag (ETSI GS CIM 009 clause 5.13.5.4 / Table 6.30.3.2-1). **When provided**, values other than `true`/`false` are `400 BadRequestData` before the identifier lookup. `reload=true` on a Hosted or ImplicitlyCreated `@context` is `400 BadRequestData` and the stored entry is left intact. `reload=true` on a Cached `@context` currently **deletes** the entry (`204`) — re-download from the original URL is not implemented. When omitted or `false`, the `@context` is deleted. |

**レスポンス**: `204 No Content` / `400 BadRequestData` / `404 Not Found`

## HTTP キャッシュコントロール

NGSI-LD GET エンドポイントは、エンドポイントクラスごとにキャッシュ関連ヘッダーを返します:

### データエンドポイント(entities、subscriptions、csourceRegistrations、csourceSubscriptions)— RFC 7232 + RFC 7234 の完全サポート

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

### メタエンドポイント(types、attributes)— Cache-Control + Vary のみ(ETag なし / 304 なし)

| Header          | Value                                                                                 | Purpose                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Cache-Control` | `private, max-age=60, stale-while-revalidate=120`                                     | Shared/intermediate cache storage is forbidden; private cache can reuse briefly with background revalidation. |
| `Vary`          | `NGSILD-Tenant, Fiware-Service, Fiware-ServicePath, Authorization, X-Api-Key, Accept` | Same tenant/auth isolation as data endpoints.                                                                 |

メタエンドポイントは `ETag` / `Last-Modified` を返さず、`If-None-Match` / `If-Modified-Since` 条件付きリクエストもサポートしていません。クライアントは代わりに `max-age` / `stale-while-revalidate` ディレクティブに依存する必要があります。

### エラーレスポンス(#1821)

RFC 9110 §15.1 のヒューリスティックにキャッシュ可能なセットのエラーステータス(404、405、410、414、501)は、集中エラーハンドラから `Cache-Control: no-store` を受け取るため、共有キャッシュ(CloudFront Error Caching Minimum TTL など)がエンティティ GET のクロステナント存在オラクルを保存できません。一般的な 400 レスポンスはヒューリスティックにキャッシュ可能ではなく、オーバーライドも受けません。

> **注意**: `/ngsi-ld/v1/jsonldContexts/{contextId}` には、追加のコンテキスト固有のキャッシュセマンティクスがあります — 上記の JSON-LD Context Management セクションを参照してください。

完全なセマンティクスについては、[API.md §HTTP Cache Control](./endpoints.md#http-cache-control-etag--conditional-requests) を参照してください。

***

## エンドポイント一覧

ETSI NGSI-LD 互換の Context Broker API。

### 共通仕様


* **Content-Type**: `application/ld+json` または `application/json`
  
* **認証**: `AUTH_ENABLED=false` でない限り必須
  
* **テナント分離**: `NGSILD-Tenant` または `Fiware-Service` ヘッダー
  
* **ページネーション**: `limit`/`offset` パラメータ。総カウントは `NGSILD-Results-Count` ヘッダーを通じて返されますが、**`count=true` がリクエストされた場合のみ**です (ETSI GS CIM 009 §5.5.6)。count がリクエストされない場合、Context Brokerはカウントクエリをスキップし、代わりに `NGSILD-Next` / `Link` (`rel="next"`) を通じて追加ページを示します (#1434)。
  
* **OPTIONS メソッド**: すべての NGSI-LD エンドポイントは OPTIONS メソッドをサポートします。`Allow` および `Accept-Patch` ヘッダーを含む 204 レスポンスを返します
  
* **405 Method Not Allowed**: 許可されていない HTTP メソッドに対して 405 レスポンスを返します (RFC 7807 ProblemDetails フォーマット、`Allow` ヘッダー付き)
  
* **406 Not Acceptable**: GET エンドポイントは、利用可能な表現にネゴシエートできない `Accept` ヘッダーを、`availableRepresentations` をリストした 406 ProblemDetails で拒否します (ETSI GS CIM 009 - 6.3.2 / 6.3.4, #1693)。[コンテンツネゴシエーション](#content-negotiation-and-context) を参照してください
  
* **パス id 検証**: id ベースのエンドポイント (entities、subscriptions、csourceRegistrations、temporal entities、jsonldContexts) において、有効な URI でないパス id は、存在チェックの前に `400 BadRequestData` を返します (#1692)
  
* **エラーフォーマット**: NGSI-LD エラーレスポンスは RFC 7807 ProblemDetails フォーマット (`application/json`) で返されます

### エンティティ操作

| Endpoint                                                 | Method | Description                                              | Success | Error              | Pagination    |
| -------------------------------------------------------- | ------ | -------------------------------------------------------- | ------- | ------------------ | ------------- |
| `/ngsi-ld/v1/entities`                                   | GET    | Retrieve entity list                                     | 200     | 400, 401, 406      | ✅ (max: 1000) |
| `/ngsi-ld/v1/entities`                                   | POST   | Create entity                                            | 201     | 400, 401, 409, 415 | -             |
| `/ngsi-ld/v1/entities`                                   | DELETE | Purge entities / attribute-level purge (`keep` / `drop`) | 204     | 400, 401           | -             |
| `/ngsi-ld/v1/entities/{entityId}`                        | GET    | Retrieve entity                                          | 200     | 400, 401, 404, 406 | -             |
| `/ngsi-ld/v1/entities/{entityId}`                        | PUT    | Replace entity                                           | 204     | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/entities/{entityId}`                        | PATCH  | Update entity (merge patch)                              | 204     | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/entities/{entityId}`                        | POST   | Add attributes                                           | 204/207 | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/entities/{entityId}`                        | DELETE | Delete entity                                            | 204     | 400, 401, 404      | -             |
| `/ngsi-ld/v1/entities/{entityId}/attrs`                  | GET    | Retrieve all attributes of entity                        | 200     | 400, 401, 404, 406 | -             |
| `/ngsi-ld/v1/entities/{entityId}/attrs`                  | POST   | Add attributes                                           | 204     | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/entities/{entityId}/attrs`                  | PATCH  | Partial attribute update                                 | 204/207 | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}`       | GET    | Retrieve single attribute                                | 200     | 400, 401, 404, 406 | -             |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}/value` | GET    | Retrieve Attribute Value only                            | 200     | 400, 401, 404, 406 | -             |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}/value` | PUT    | Set Attribute Value only                                 | 204     | 400, 401, 404, 409 | -             |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}`       | POST   | Replace attribute                                        | 204     | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}`       | PUT    | Replace attribute                                        | 204     | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}`       | PATCH  | Partial attribute update                                 | 204     | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/entities/{entityId}/attrs/{attrName}`       | DELETE | Delete attribute                                         | 204     | 400, 401, 404      | -             |

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
| `/ngsi-ld/v1/csourceSubscriptions`                  | POST   | Create CSR subscription   | 201     | 400, 401, 409, 415 | -             |
| `/ngsi-ld/v1/csourceSubscriptions/{subscriptionId}` | GET    | Retrieve CSR subscription | 200     | 401, 404, 406      | -             |
| `/ngsi-ld/v1/csourceSubscriptions/{subscriptionId}` | PATCH  | Update CSR subscription   | 204     | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/csourceSubscriptions/{subscriptionId}` | DELETE | Delete CSR subscription   | 204     | 401, 404           | -             |

### 分散操作情報

| Endpoint                          | Method | Description              | Success | Error |
| --------------------------------- | ------ | ------------------------ | ------- | ----- |
| `/ngsi-ld/v1/info/sourceIdentity` | GET    | Retrieve broker identity | 200     | 406   |

### JSON-LD Context 管理

| Endpoint                                 | Method | Description              | Success | Error                   | Pagination    |
| ---------------------------------------- | ------ | ------------------------ | ------- | ----------------------- | ------------- |
| `/ngsi-ld/v1/jsonldContexts`             | GET    | JSON-LD context list     | 200     | 400, 401, 406           | ✅ (max: 1000) |
| `/ngsi-ld/v1/jsonldContexts`             | POST   | Register JSON-LD context | 201     | 400, 401, 409, 415      | -             |
| `/ngsi-ld/v1/jsonldContexts/{contextId}` | GET    | Serve JSON-LD context    | 200     | 400, 401, 404, 406, 422 | -             |
| `/ngsi-ld/v1/jsonldContexts/{contextId}` | DELETE | Delete JSON-LD context   | 204     | 400, 401, 404           | -             |

### EntityMap 操作

| Endpoint                               | Method | Description        | Success | Error              | Pagination |
| -------------------------------------- | ------ | ------------------ | ------- | ------------------ | ---------- |
| `/ngsi-ld/v1/entityMaps`               | GET    | Create EntityMap   | 201     | 400, 401, 403, 406 | -          |
| `/ngsi-ld/v1/entityMaps`               | POST   | Create EntityMap   | 201     | 400, 401, 403, 415 | -          |
| `/ngsi-ld/v1/entityMaps/{entityMapId}` | GET    | Retrieve EntityMap | 200     | 401, 404, 406      | -          |
| `/ngsi-ld/v1/entityMaps/{entityMapId}` | PATCH  | Update EntityMap   | 204     | 400, 401, 404, 415 | -          |
| `/ngsi-ld/v1/entityMaps/{entityMapId}` | DELETE | Delete EntityMap   | 204     | 401, 404           | -          |

### Snapshot 操作

> **GeonicDB 独自拡張 (非 ETSI 準拠, #1667):** GeonicDB の Snapshot API は ETSI GS CIM 009 v1.9.1 の optional Snapshot module (clause 5.16 / 6.36-6.38) と**同名だが別物**です。ETSI の Snapshot は「クエリ結果の凍結ビュー」を非同期実行で作る横断機構であるのに対し、GeonicDB の Snapshot はエンティティのコピー & リストア機構です。ETSI 準拠のクライアントはこのエンドポイントを ETSI Snapshot として扱わないでください。
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
> **将来の共存パス:** 仕様形の `POST /snapshots` は `snapshotQueries` メンバが必須、GeonicDB 形は `{description, entityTypes, entityIds}` であり、入力形で判別可能です。将来 ETSI 準拠実装を同一 path に追加する migration path は塞がれていません。

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
> * **capture (`POST /snapshots`)** — 取り込むのは、その principal が `GET /ngsi-ld/v1/entities` で読める行だけです。scope / owner で読めないエンティティは snapshot に入りません (`entityCount` にも数えられません)。読める行が 1 件も無い principal は 403 になります。
> * **clone (`POST /snapshots/{id}/clone`)** — 書き戻すのは、その principal が `POST /ngsi-ld/v1/entities` で書ける行だけです。復元内容 (snapshot 行) と上書き先の既存行の**両方**が Permit される必要があります。
> * **snapshot 自体の変更 (PATCH / DELETE)** — 作成者のみ。他者の snapshot は 403 です (`super_admin` / `tenant_admin` は従来どおり全件操作できます)。
> * **purge (`DELETE /snapshots`)** — 非管理者は**自分が作成した** snapshot だけを削除します。

> **`entityTypes` フィルタの型名 (#2125):** `POST /snapshots` の `entityTypes` は、`?type=` と同じく**リクエストの `@context`** (`Link` ヘッダ) で正規化してから保存形と照合します。短縮名 `Room` と、それが展開される `https://uri.etsi.org/ngsi-ld/default-context/Room` は同一の型として扱われ、どちらの表記でも同じエンティティが capture されます (ETSI GS CIM 009 clause 4.4 / 5.5.7)。別の名前空間の同名 IRI は別の型であり、一致しません。

### Import Jobs (GeonicDB 拡張, #3830)

> NDJSON アップロード + FIFO キューによる非同期バルクインポート。同期バッチ upsert の 429 / API Gateway 29s 制限を回避します。認可は `POST /ngsi-ld/v1/entityOperations/upsert` として評価されます (`/admin` 配下ではありません)。ワーカー処理は #3872、S3 `ImportJobsBucket` は #3875 (AWS プライマリリージョンは `IMPORT_JOBS_BUCKET_NAME` を配線、空の場合 → 503)。ジョブの作成 / 開始は依然として HTTP レート制限ウィンドウを消費します。ワーカーによって書き込まれるエンティティは消費しません (ジョブ専用のプラン クォータは #3872)。
>
> **Upload PUT:** クライアントは PUT 時に `Content-Type: application/x-ndjson` を**必ず**送信する必要があります (NDJSON インポート ペイロードの慣例。AWS SDK presigner はデフォルトで `content-type` に署名しません)。ローカル `file://` アップロード URL (スタンドアロン) ではヘッダーは不要です。

| Endpoint                                        | Method | Description                             | Success | Error                             | Pagination |
| ----------------------------------------------- | ------ | --------------------------------------- | ------- | --------------------------------- | ---------- |
| `/ngsi-ld/v1/jobs/imports`                      | POST   | Create job + presigned upload URL       | 201     | 400, 401, 403, 413, 429, 503      | -          |
| `/ngsi-ld/v1/jobs/imports/{jobId}/upload-parts` | POST   | Get presigned URLs for multipart upload | 200     | 400, 401, 403, 404, 409, 503      | -          |
| `/ngsi-ld/v1/jobs/imports/{jobId}`              | GET    | Job status / progress                   | 200     | 401, 403, 404                     | -          |
| `/ngsi-ld/v1/jobs/imports/{jobId}`              | DELETE | Cancel job                              | 204     | 401, 403, 404, 409                | -          |
| `/ngsi-ld/v1/jobs/imports/{jobId}/start`        | POST   | Verify upload + enqueue                 | 202     | 400, 401, 403, 404, 409, 413, 503 | -          |
| `/ngsi-ld/v1/jobs/imports/{jobId}/errors`       | GET    | Presigned GET for errors NDJSON         | 200     | 401, 403, 404, 503                | -          |

### 分割アップロード (Multipart Upload)

5 GiB を超えるファイルをアップロードする場合、自動的に分割アップロード (Multipart Upload) になります。


1. `POST /ngsi-ld/v1/jobs/imports` でジョブを作成します。このとき、`declaredBytes` にファイル全体のサイズを指定します。5 GiB を超える場合、レスポンスには `upload` の代わりに `multipart` オブジェクト (`uploadId`、`partSizeBytes`、`partCount`) が含まれます。
   
2. `POST /ngsi-ld/v1/jobs/imports/{jobId}/upload-parts` を呼び出して、分割アップロード用の署名付き URL (Presigned URL) のリストを取得します。
   
   * リクエストボディ: `{"partNumbers": [1, 2, 3]}` (最大 100 件まで指定可能)
     
   * 応答には `parts` 配列が含まれ、各要素に `partNumber` と `upload` (`url`、`expiresAt`) が入っています。
     
3. `partSizeBytes` でファイルを分割し、各パートを対応する `url` へ `PUT` します。パート番号は 1 始まりで、パート N のバイト範囲は `[ (N-1)*partSizeBytes , min(N*partSizeBytes, declaredBytes) )` です。最終パートだけ残バイト数 (`partSizeBytes` 未満可) にし、それ以外のパートはちょうど `partSizeBytes` に揃えます。
   
4. すべてのパーツのアップロードが完了したら、`POST /ngsi-ld/v1/jobs/imports/{jobId}/start` を呼び出してジョブを開始します。

※ `start` 呼び出し時に、パート数・合計バイト数・パートサイズの不一致は 400 BadRequestData になります。宣言サイズまたはプラン上限の超過は 413 PayloadTooLarge、未アップロード・状態不正は 409 Conflict になります。

### バッチ操作

| Endpoint                              | Method | Description                                                                       | Success | Error         | Pagination    |
| ------------------------------------- | ------ | --------------------------------------------------------------------------------- | ------- | ------------- | ------------- |
| `/ngsi-ld/v1/entityOperations/create` | POST   | Batch create (max: 1000)                                                          | 200/201 | 400, 401, 415 | -             |
| `/ngsi-ld/v1/entityOperations/upsert` | POST   | Batch upsert (max: 1000)                                                          | 204/207 | 400, 401, 415 | -             |
| `/ngsi-ld/v1/entityOperations/update` | POST   | Batch update (max: 1000)                                                          | 200/204 | 400, 401, 415 | -             |
| `/ngsi-ld/v1/entityOperations/delete` | POST   | Batch delete (max: **100** on every plan, `SECURITY.MAX_BATCH_DELETE_SIZE` #3828) | 200/204 | 400, 401, 415 | -             |
| `/ngsi-ld/v1/entityOperations/query`  | POST   | Batch query                                                                       | 200     | 400, 401, 415 | ✅ (max: 1000) |
| `/ngsi-ld/v1/entityOperations/merge`  | POST   | Batch merge patch (max: 1000)                                                     | 204/207 | 400, 401, 415 | -             |
| `/ngsi-ld/v1/entityOperations/purge`  | POST   | Bulk entity purge (GeonicDB 独自拡張, backward compatibility)                         | 204     | 400, 401, 415 | -             |

### Temporal API (時系列データ)

Temporal の履歴は Entity API の書き込みによって**デフォルトでは**自動記録されません。次のいずれかの取り込み経路を使用してください: (1) Temporal API エンドポイントへの明示的な書き込み (単一またはバッチ)、(2) `appendToTemporal` を使用してエンティティ変更時に追記する ReactiveCore ルール、または (3) `TEMPORAL_ENTITY_DUAL_WRITE=true` を設定 (GeonicDB 拡張、オプトイン; `docs/ENV.md` を参照) することで、Core Entity API の**書き込みと削除**が Temporal Evolution に二重書き込みされます (削除は clause 4.5.7/4.5.8 に従い `urn:ngsi-ld:null` + `deletedAt` トゥームストーンとして記録され、EntityExpiryService による TTL 期限切れも含まれます — #2527 / #2780)。

**(3) が ON の場合の二重書き込みスコープ** (NGSI-LD のみ): 単一エンティティの `POST /entities`、`PUT /entities/{id}`、`PATCH /entities/{id}`、`POST|PATCH|PUT .../attrs` (単一属性の置換/更新を含む)、バッチの `entityOperations/create|upsert|update|merge|delete`、および `entityOperations/purge` / `DELETE /entities` のパージセレクタ。Core Entity API の**削除** (エンティティ削除、属性削除、バッチ削除、パージ) は `urn:ngsi-ld:null` + `deletedAt` トゥームストーンとして二重書き込みされます (clause 4.5.7/4.5.8)。同じテナント + servicePath に対して有効な `appendToTemporal` ルールが存在する場合、(3) はスキップされます (ルールが優先)。

**二重書き込みされないもの:** NGSIv2 Entity API の書き込み、および Temporal API 自身の `DELETE` 操作 (履歴削除 — Core API の削除記録とは異なります)。TTL 期限切れ (EntityExpiryService) はフラグが ON の場合に**二重書き込みされます** (#2780)。

| Endpoint                                                                 | Method | Description                                                                                                                       | Success | Error              | Pagination    |
| ------------------------------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------ | ------------- |
| `/ngsi-ld/v1/temporal/entities`                                          | GET    | Retrieve temporal entity list                                                                                                     | 200     | 400, 401, 406      | ✅ (max: 1000) |
| `/ngsi-ld/v1/temporal/entities`                                          | POST   | Create (201) or upsert (204) temporal entity — clause 5.6.11: an existing id appends the given attribute instances instead of 409 | 201/204 | 400, 401, 415      | -             |
| `/ngsi-ld/v1/temporal/entities/{entityId}`                               | GET    | Retrieve temporal entity                                                                                                          | 200     | 400, 401, 404, 406 | -             |
| `/ngsi-ld/v1/temporal/entities/{entityId}`                               | PATCH  | Merge attributes of temporal entity                                                                                               | 204     | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/temporal/entities/{entityId}`                               | DELETE | Delete temporal entity                                                                                                            | 204     | 400, 401, 404      | -             |
| `/ngsi-ld/v1/temporal/entities/{entityId}/attrs`                         | POST   | Add attribute instance                                                                                                            | 204     | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/temporal/entities/{entityId}/attrs/{attrName}`              | DELETE | Delete attribute instance(s) — supports `datasetId` and `deleteAll` query params (clause 5.6.5.4)                                 | 204     | 400, 401, 404      | -             |
| `/ngsi-ld/v1/temporal/entities/{entityId}/attrs/{attrName}/{instanceId}` | PATCH  | Modify attribute instance                                                                                                         | 204     | 400, 401, 404      | -             |
| `/ngsi-ld/v1/temporal/entities/{entityId}/attrs/{attrName}/{instanceId}` | DELETE | Delete attribute instance                                                                                                         | 204     | 400, 401, 404      | -             |
| `/ngsi-ld/v1/temporal/entityOperations/create`                           | POST   | Temporal batch create (max: 1000)                                                                                                 | 201/207 | 400, 401, 415      | -             |
| `/ngsi-ld/v1/temporal/entityOperations/upsert`                           | POST   | Temporal batch upsert (max: 1000)                                                                                                 | 204/207 | 400, 401, 415      | -             |
| `/ngsi-ld/v1/temporal/entityOperations/delete`                           | POST   | Temporal batch delete                                                                                                             | 204/207 | 400, 401, 415      | -             |
| `/ngsi-ld/v1/temporal/entityOperations/query`                            | POST   | Temporal batch query                                                                                                              | 200     | 400, 401, 415      | ✅ (max: 1000) |

> **Temporal 属性削除のインスタンス選択 (#2436, clause 5.6.5.4)**: `DELETE /ngsi-ld/v1/temporal/entities/{entityId}/attrs/{attrName}` はその属性の履歴インスタンスを削除します。スコープは Core Entity の属性削除と同様です: `?datasetId=` はその `datasetId` を持つインスタンスのみを削除; `?deleteAll=true` は `datasetId` に関係なくすべてのインスタンスを削除; 両方を省略すると**デフォルトインスタンス** (`datasetId` を持たないもの) のみを対象とし、存在しない場合は `404 ResourceNotFound` を返します。`?instanceId=` (このエンドポイントに対する GeonicDB 拡張) は単一のインスタンスを直接選択し、`datasetId`/`deleteAll` の影響を受けません。同じ選択が MCP `temporal` ツールの `delete_attribute` アクションおよび同等の A2A スキルパラメータの `?datasetId=`/`deleteAll` にも適用されます。
>
> **属性名の保存形と compaction (#1975)**: temporal の属性名も entity 側 (#1649) と同じ canonical 形 (`compactIri(core @context, expandTerm(書き込み @context, 名前))`) で保存されます。単一/batch の create・`POST .../attrs`・`PATCH` (merge) の全書き込み経路が対象で、書き込み時にリクエスト `@context` がマップする term は FQN で保存されます。GET / query / 集約応答は**そのリクエストが渡した `@context`** を基準に属性名を compact して返します (ETSI GS CIM 009 clause 5.5.7)。`orderBy`・`attrs` セレクタ・属性削除 (`DELETE .../attrs/{attrName}`)・インスタンス修正 (`PATCH .../attrs/{attrName}/{instanceId}`) のパス属性名も同じ正規化と候補照合 (保存形の union の OR) を通るため、ある `@context` で書いた属性を**別の `@context` の同義 term** で引く・並び替える・削除できます。属性名は短縮名 (`A-Za-z0-9_`) に加え**絶対 IRI もそのまま受理**します (従来は短縮名限定でした)。
>
> **既知の制限**: temporal は書き込み時 `@context` を保存していないため一括移行ができません。**#1975 適用前 (移行前) の既存データは verbatim 保存のまま**残り、応答でも保存形をそのまま返します (compact されません)。読み取り・クエリ・削除は保存形の候補集合 (verbatim ∪ canonical) の OR で照合するため、legacy データにも当たり続けます。
