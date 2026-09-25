---
title: "NGSI-LD API"
description: "NGSI-LD API reference"
outline: deep
---
# NGSI-LD API

> このドキュメントは [API.md](./endpoints.md) から分離されました。メイン API 仕様については [API.md](./endpoints.md) を参照してください。

***

NGSI-LD は JSON-LD ベースのコンテキスト情報管理 API です。

> **注意:** NGSI-LD API は ETSI GS CIM 009 仕様に従い `Fiware-ServicePath` ヘッダーを無視します。階層は `scope` エンティティプロパティと `scopeQ` クエリパラメーターで管理されます。`servicePath` と `scope` は独立した概念であり、自動的に同期されることはありません ([INTEROPERABILITY.md](../core-concepts/ngsiv2-vs-ngsild.md#3-scope-scope-hierarchy) を参照)。これは認可 (#1323) にも適用されます: `servicePath` リソース属性を持つ XACML ポリシーは NGSI-LD リクエストでは常に `/` を参照するため、`Fiware-ServicePath` **は NGSI-LD でのアクセス制御や分離境界として使用できません** — 代わりに `scope` / `entityType` ポリシー制約を使用してください ([AUTH.md](../reference/auth.md) を参照)。
>
> **Scope 文字セット (#1189):** 各 scope セグメントは `[A-Za-z0-9._-]` (POSIX Portable Filename Character Set; GeonicDB による NGSI-LD 仕様セット `[A-Za-z0-9_]` の拡張) にマッチする必要があり、セグメントの最初の文字は `-` であってはいけません。これに違反する文字列 — 例えば `;` `+` `#` 半角スペースを含むもの、または先頭の `/` が欠けているもの — は `scopeQ` の衝突とサイレントな落とし穴を防ぐために `400 BadRequestData` で拒否されます。[INTEROPERABILITY.md → Scope Character Set](../core-concepts/ngsiv2-vs-ngsild.md#scope-character-set-geonicdb-独自拡張) を参照してください。
>
> **Entity フィールド文字セット (#1209 / #1211):** `id` は `A-Z a-z 0-9 . _ - :` を受け付けます (`:` は NGSI-LD URN 形式用、先頭の `-` は不可); `type` は **POSIX portable 短縮名** (`A-Z a-z 0-9 . _ -`、先頭の `-` は不可) **または絶対 IRI** (例: `https://uri.fiware.org/ns/data-models#WeatherObserved`、`urn:ngsi-ld:Type:Sensor`) を受け付けます; **属性名は短縮名 (`A-Z a-z 0-9 _`) または絶対 IRI を受け付けます** (#1649 — canonical 保存で保存キーが FQN になりうるため。NGSIv2 経路は従来どおり短縮名のみ)。3 つのフィールドはすべて 256 文字に制限されています。違反は `400 BadRequestData` を返します。**型名 (`type`) は active `@context` で term ⇄ URI 展開される (ETSI GS CIM 009 §5.5.7、#1613)** — `@context` がマップする term と対応する FQN は同一 type に解決し (書き込みで canonical 正規化・読み出しで応答 context に compact)、どの context もマップしない短縮名 `Temperature` は core `@vocab` の `.../default-context/Temperature` に展開され絶対 IRI `https://example.com/Temperature` とは別 type になる。型を伴うクエリ/作成で `@context` が解決不能なら `504 LdContextNotAvailable`。**属性名 (attribute name) も active `@context` で term ⇄ URI 展開され、canonical 形で保存される (#1649)** — リクエスト `@context` がマップする term は FQN で保存され、core 語彙 (`location` / `observedAt` 等) と未定義 term は短縮名のまま保存される (保存形不変)。応答はリクエスト `@context` で compact されるため、**別の `@context` の同義 term で書いた属性も引ける** (clause 5.5.7 の "if and only if" 完全形)。**破壊的変更**: `@context` がマップする属性を **`@context` 無し**で引くと `default-context/<名前>` = 別属性を指すため `404` になる (旧: 短縮名の verbatim 保存ゆえに引けた)。移行前データは `npm run migrate:attr-names -- --apply` で変換する。Detail: [INTEROPERABILITY.md → Entity Field Character Set](../core-concepts/ngsiv2-vs-ngsild.md#entity-field-character-set-id--type--attribute-name--geonicdb-独自拡張).
>
> **注意:** NGSIv2 と NGSI-LD のエンティティは完全に分離されています。NGSIv2 で作成されたエンティティは NGSI-LD からは見えず、その逆も同様です (各エンティティの `protocol` フィールド、#964)。

## 仕様への準拠

このドキュメントは **[ETSI GS CIM 009 V1.9.1 (2025-07)](https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/01.09.01_60/gs_CIM009v010901p.pdf)** をリファレンス仕様としています。GeonicDB は仕様のサブセットを実装しています; 準拠は自己宣言ではなく、固定された ETSI Test Suite に対して帯域外で測定されます ([geonicdb-compliance](https://github.com/geolonia/geonicdb-compliance) を参照)。各機能の詳細については、以下の ETSI 仕様セクションを参照してください:

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

> 注意: GeonicDB は機械可読な準拠宣言を提供していません。これは ETSI GS CIM 009 が準拠クラスモデルを定義していないためです (#1585)。合格率は [geonicdb-compliance](https://github.com/geolonia/geonicdb-compliance) の固定された測定実行を通じて帯域外で公開されています。

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

**ネゴシエーションルール (ETSI GS CIM 009 - 6.3.4、#1734 / #1727):** [clause 6 text](https://cim.etsi.org/NGSI-LD/official/clause-6.html) を参照してください。


1. **欠落している(または空の)`Accept` ヘッダーはワイルドカード受け入れとして扱われます**(IETF RFC 9110 §12.5.1)。すべての ETSI 取得エンドポイントで、これは候補順序により `application/json` に解決されます。これは clause 6.3.4 が要求する通りです:*「Accept ヘッダーが存在しない場合、`application/json` が想定されるものとします。」*
   
2. 標準の候補セットを持つ ETSI 取得エンドポイントで、`Accept` ヘッダーが複数のサポートされる表現に展開される場合、候補リストの順序 `application/json` → `application/ld+json` → `application/geo+json` は重要であり、**最初のマッチが優先されます**。したがって、`Accept: */*`(これは `curl`、`python-requests`、およびほとんどの HTTP クライアントのデフォルトです)は、それらの ETSI エンドポイントで JSON-LD ではなく `application/json` に解決されます。
   
3. 相対的な `q` 値(IETF RFC 7231 §5.3.2、メディアレンジの特定性を含む:`type/subtype` > `type/*` > `*/*`)は、そのリスト順序を**上書き**します。`Accept: application/json;q=0.1, application/ld+json;q=1` は JSON-LD を生成します。`Accept: application/json, */*` は、明示的なメディアタイプがワイルドカードよりも特定的であるため、プレーンな JSON を生成します。
   
4. `application/geo+json` は、GeoJSON ボディをレンダリングできるエンドポイント(`GET /entities`、`GET /entities/{entityId}`、および `POST /entityOperations/query`(#1783))でのみ候補になります。Clause 6.3.4 は「Retrieve Entity」(5.7.1)と「Query Entity」(5.7.2)の両方を GeoJSON 対応として挙げており、Query Entity は `GET /entities` またはこの POST のいずれかで呼び出すことができます。それ以外の場所では選択のために無視され、他に受け入れ可能なものがない場合は `406` を返します。

> **破壊的変更 (#1734):** この修正前は、欠落している `Accept` ヘッダーと `Accept: */*` は `application/ld+json` に解決されていたため、レスポンスはボディにトップレベルの `@context` を含んでいました。現在はこれらは `application/json` に解決され、`@context` は `Link` ヘッダーに移動します。JSON-LD を必要とするクライアントは `Accept: application/ld+json` を明示的に送信する必要があります。公式 CLI(`geonic`)と npm SDK(`@geolonia/geonicdb-sdk`)は既にそうしており、影響を受けません。

ネゴシエートされたタイプが `application/json` の場合、レスポンスには `Link` ヘッダーが含まれます:

```http
Link: <https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.9.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"
```

**406 Not Acceptable (#1693):** NGSI-LD GET(取得)エンドポイントおよび `POST /entityOperations/query` で、`Accept` ヘッダーが利用可能な表現のいずれにもネゴシエートできない場合、Context Brokerは暗黙的に JSON を提供する代わりに `406 Not Acceptable`(ETSI GS CIM 009 - 6.3.2 / 6.3.4)を返します。ProblemDetails ボディ(`type: https://uri.etsi.org/ngsi-ld/errors/NotAcceptable`)は、`availableRepresentations` にパス固有のネゴシエート可能なメディアタイプをリストします:通常は `application/json` / `application/ld+json`(エンティティエンドポイントと `POST /entityOperations/query` では `application/geo+json` を含む、#1783)。例えば、`Accept: application/xml` や `text/csv` は `406` を返します。欠落または空の `Accept` ヘッダーはワイルドカード受け入れとして扱われ、各エンドポイントの最優先の利用可能な表現に解決されるため、`406` を返しません。

**リクエストボディの `@context`(書き込み操作、#1583 / #1599 / #2065):** ボディを含む**すべて**の `POST` / `PATCH` / `PUT` について、`Content-Type` が `@context` の供給方法を決定します。Clause 6.3.5 はリソースではなく動詞を指定しているため、これにはエンティティレベルの書き込み、単一属性の書き込み、バッチ操作、時間的書き込み、subscriptions、csourceRegistrations、csourceSubscriptions が同様に含まれます:

| Request `Content-Type` | `@context` in body | Behavior                                                                                                                                                                                                                                                      |
| ---------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `application/ld+json`  | **Required**       | Omitting `@context` returns `400 BadRequestData` (ETSI GS CIM 009 clause 6.3.5). A JSON-LD document without a context has undefined attribute-name semantics.                                                                                                 |
| `application/json`     | **Rejected**       | Clause 6.3.5: "if the request payload body (as JSON) contains a `@context` term, then an HTTP error response of type BadRequestData shall be raised." Supply the context via the `Link` header instead; with neither, the core `@context` applies implicitly. |

**混在は禁止 (#1924)。** Clause 6.3.5 は「混在は許可されません。すなわち、オプションを混在させると HTTP レスポンスエラーが発生します。」と結んでいます。両方向とも `POST` / `PATCH` / `PUT` で `400 BadRequestData` を返します:

| Request                                       | Result                     |
| --------------------------------------------- | -------------------------- |
| `application/ld+json` + JSON-LD `Link` header | `400 BadRequestData`       |
| `application/json` + body `@context`          | `400 BadRequestData`       |
| `application/ld+json`, no `@context` anywhere | `400 BadRequestData`       |
| `application/ld+json` + body `@context` only  | accepted                   |
| `application/json` + `Link` header only       | accepted                   |
| `application/json`, no `@context` anywhere    | accepted (core `@context`) |

チェックは NGSI-LD ルーターエントリで一度実行されるため、**すべて**のボディを含む NGSI-LD 書き込み(エンティティレベル、単一属性、バッチ、時間的、subscriptions、csourceRegistrations、csourceSubscriptions)をカバーします。`POST /ngsi-ld/v1/jsonldContexts` は免除されています:そのボディはコンテキスト宣言ではなく JSON-LD コンテキストドキュメント*そのもの*です。`application/merge-patch+json` は clause 6.3.5 の文言の外側にあり(`application/json` と `application/ld+json` のみを指定しています)、したがって混在ルールの対象ではありません。

**配列ボディは要素ごとにチェックされます (#2069)。** バッチボディは「**それぞれが NGSI-LD Entity を表す** 1 つ以上の JSON-LD ドキュメントを含む JSON-LD Array」(clause 5.6.7.3)であるため、各要素はそれ自身の JSON-LD ドキュメントであり、独自の `@context` が必要です。したがって、違反はリクエストではなくその要素に属します:これは **`207 Multi-Status`** レスポンスの `errors` 配列内の `BatchEntityError` として報告され、残りの要素は引き続き処理されます。`Link` ヘッダー違反のみ(これは単一の要素に帰属できません)はリクエストレベルの `400` のままです。ETSI 適合性スイートはまさにこの分割を測定します(`003_06_01` / `003_08_01` は `207` を期待し、`003_09_01` は `400` を期待します)。

`POST /entityOperations/delete` は免除されています:clause 5.6.10.3 はその入力を「**Entity IDs (URIs)** のリストを含む JSON-LD Array」と定義しており、文字列要素には `@context` を含める場所がありません。免除は**要素の形状**によって決定され、パスによってではありません。

| Batch request                                                             | Result                                                              |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `application/ld+json`, every element carries `@context`                   | accepted                                                            |
| `application/ld+json`, some elements lack `@context`                      | `207` — those elements fail with `BadRequestData`, the rest succeed |
| `application/ld+json`, no element carries `@context`                      | `207` — every element fails with `BadRequestData`                   |
| `application/json`, some elements carry `@context`                        | `207` — those elements fail with `BadRequestData`                   |
| `application/ld+json` + JSON-LD `Link` header                             | `400 BadRequestData` (request-level)                                |
| `POST /entityOperations/delete` (array of ID strings), any `Content-Type` | accepted                                                            |

**互換性に関する注意。** 以前にボディ `@context` を含む `application/json` を送信していたクライアント(`@context` は暗黙的に無視されていました)は、現在 `400` を受け取ります。それらを `application/ld+json` に切り替えるか、コンテキストを `Link` ヘッダーに移動してください。同様に、`application/ld+json` *と* `Link` ヘッダーを送信するクライアントは、書き込み時に `Link` ヘッダーを削除する必要があります。

**破壊的変更 (#2065 / #1599)。** この変更前は、「`application/ld+json` はボディ `@context` を必要とする」ルールは 6 つのエンティティレベルエンドポイントにのみ接続されていました。`POST /entityOperations/*`、`POST`/`PATCH /subscriptions`、`POST`/`PATCH /csourceRegistrations`、`POST`/`PATCH /csourceSubscriptions`、時間的書き込み、および両方の `POST` クエリ操作は、コンテキストのない JSON-LD を `200` / `201` / `204` で受け入れていました。これらは現在 `400`(または配列ボディの場合は `207`)を返します。これらのエンドポイントで `Content-Type: application/ld+json` を送信するクライアントは、インライン `@context` を含める必要があります。または `application/json` に切り替えて、`Link` ヘッダーを介してコンテキストを供給してください。

**レスポンス `@context` はリクエストのみによって決定されます (#1733)。** ETSI GS CIM 009 clause 5.5.7 によると、「用語の圧縮または拡張を実行するために使用される `@context` は、各 API 呼び出しによって提供されるもの(または欠落している場合はデフォルトの `@context`)であり、**以前に提供された可能性のある他の `@context` ではありません**」とあり、clause 5.5.5 では、いかなる `@context` も持たない入力には「最低限 … Core `@context`」を与えることを要求しています。したがって:


* 読み取りが JSON-LD `Link` ヘッダーを介してコンテキストを提供する場合、レスポンスはそれで圧縮されます。`POST` クエリ操作(`/entityOperations/query`、`/temporal/entityOperations/query`)については、ソースは他の POST と同様に clause 6.3.5 に従います:`application/ld+json` の場合、`@context` はリクエスト**ボディ**から取得され、`application/json` の場合は `Link` ヘッダーから取得されます(#1786)。これが接続される前は、これらのエンドポイントでボディ `@context` は無視され、クエリのタイプ/属性名が間違った語彙で展開されていました。これは**ゼロ結果**としてエラーではなく表面化していました。
  
* 読み取りがいずれも提供しない場合、レスポンスは **NGSI-LD core `@context` のみ**で圧縮されます。core `@context` が圧縮できないエンティティタイプと属性名は、**完全修飾 URI** としてレンダリングされます(clause 5.5.7:「実装は Fully Qualified Names をレンダリングするものとします」)。
  
* Context Brokerはエンティティ `type` からコンテキストを推測しません(Smart Data Models / Custom Data Model)。ドメイン語彙を取得するには、読み取り時にその語彙の `@context` を渡してください。
  
* **短縮名は、リクエストの `@context` の下で同じ URI に展開される場合にのみ使用されます (#1787)。** リクエストの `@context` がその短縮名を*異なる
* IRI にマッピングしている場合(シャドーイング)、それは「一致する用語」ではなく、決して出力されません。Context Brokerは次の圧縮形式(ラウンドトリップする `prefix:suffix` compact IRI)にフォールスルーし、最終的に完全修飾 URI になります。例:コンテキストなしで書き込まれた属性(URI `https://uri.etsi.org/ngsi-ld/default-context/name`)を、`"name": "https://example.org/vocab#name"` を定義するコンテキストで読み戻すと、`ngsi-ld:default-context/name` としてレンダリングされ、`name` では**ありません**。`name` を返すと、クライアントはそれを `example.org/vocab#name` として読み取ることになります。これは JSON-LD 1.1 の [IRI Compaction Algorithm](https://www.w3.org/TR/json-ld11-api/#iri-compaction) を反映しており、エンティティタイプと属性名の両方に適用されます。
  
* **シャドーイングチェックは短縮名のエンティティタイプにも適用されます (#1876)。** コンテキストなしで書き込まれたタイプは、ベアな正規名として保存され、Context Brokerは読み取りの `@context` をまったく参照せずに core `@vocab` を削除してレンダリングしていました。現在は、読み取りがコンテキストを提供する場合は常にそれを参照します:コンテキストなしで作成された `Building` を、`"Building": "https://example.org/vocab#Building"` を定義するコンテキストで読み戻すと、`ngsi-ld:default-context/Building` としてレンダリングされます。`@context` を提供しない(または core のみを提供する)読み取りは、古い高速パスを維持し、リモートコンテキストを取得しません。同じルールは、`csourceRegistrations`、`csourceSubscriptions`、`subscriptions` レスポンス内のタイプセレクター内にも適用されます。
  
* **曖昧な `@context` ドキュメントは `400 BadRequestData` で拒否されます (#1878)。** *キー*がパススルー形式の絶対 IRI(`https://…`、`urn:…`、またはプレフィックスが未定義の `prefix:suffix`)である用語を定義し、それを**異なる** IRI にマッピングするコンテキストは、Context Brokerが clause 5.5.7 を満たす方法を残しません:フォールバックする完全修飾名でさえ、そのコンテキストの下では別の意味を持ちます。このようなリクエストは、暗黙的に誤読された名前で応答されるのではなく、拒否されます。これは限定的です。`{"ex": "https://ex/ns#", "ex:Name": "https://ex/ns#Name"}`(プレフィックスが同じコンテキストで定義されている compact IRI キー)と `{"https://ex/X": "https://ex/X"}`(それ自体にマッピングされたキー)は、両方とも引き続き受け入れられます。

**作成/更新 `@context` の保存 (#1620 / #1633 / #1637):** 書き込み時に提供される `@context`(`application/ld+json` の場合はボディ、`application/json` の場合は `Link` ヘッダー)は、エンティティと共に `contextRef` として保存されます。これは **URL、URL 配列、インラインコンテキストオブジェクト(用語 → IRI マップ)、および混合配列**をカバーします。#1733 以降、これはレスポンスをレンダリングする際に**保存された属性の完全修飾名を回復するためにのみ**使用されます。レスポンス `@context` を決定することはありません。**更新セマンティクス (#1637、ETSI GS CIM 009 clause 5.6.18 Replace / 5.6.17 Merge / 5.6.2 Update Attributes):**


* **Replace ファミリー**(`PUT /entities/{id}`、batch upsert `options=replace`):リクエストが保存可能な `@context` を含む場合、保存された `contextRef` を**上書き**します。省略された場合、または core のみの場合(`extractContextRef` が undefined を返す、#1620)、保存された値は**そのまま**にされます(省略は削除ではありません)。
  
* **Merge ファミリー**(`PATCH /entities/{id}`、`PATCH /attrs`、`POST /attrs`、batch upsert default / update / merge):**存在しない場合に設定** — 欠落している `contextRef` はバックフィルされますが、既存のものは決して上書きされません。

JSON `null` はエンティティ PATCH で `@context` を解除しません(`@context` は Attribute ではありません。エンティティマージは `urn:ngsi-ld:null` を使用します、clause 5.5.12)。インラインコンテキストを参照可能な `jsonldContexts` URL としてホスティングすること(`application/json` `Link` ヘッダーがそれらを含めることができるように)は範囲外です。シリアライズされたサイズが `MAX_CONTEXT_INLINE_BYTES`(8 KiB)を超えるインライン `@context`、または `MAX_CONTEXT_ARRAY`(10)エントリを超える `@context` 配列は、`400 BadRequestData` で拒否されます。

### 自然言語照合 (lang + orderBy)

`lang` パラメータと `orderBy` を組み合わせることで、指定された言語のロケールに基づいて結果をソートできます。例えば、`lang=ja` はソートに日本語の照合順序を適用します。

### Entity Operations (NGSI-LD)

> **ETSI GS CIM 009 Reference**: Section 5.6 - Entity Operations

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

| Parameter        | Type    | Description                                                                                                                                                                                                                                                                                                          | Default     |
| ---------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `id`             | string  | Filter by entity ID (comma-separated for multiple, URI format)                                                                                                                                                                                                                                                       | -           |
| `limit`          | integer | Number of results to retrieve                                                                                                                                                                                                                                                                                        | 20          |
| `offset`         | integer | Offset (max: 10000)                                                                                                                                                                                                                                                                                                  | 0           |
| `pageToken`      | string  | Keyset continuation token (default sort only). Send back the previous response's `NGSILD-Next`. Mutually exclusive with `offset`; invalid with `orderBy`. See [API.md §Keyset Pagination](./endpoints.md#keyset-pagination-pagetoken-1435) (#1435)                                                                   | -           |
| `orderBy`        | string  | Entity Ordering Language expression (ETSI GS CIM 009 V1.9.1 §4.23 / 5.2.43) — see [Entity Ordering (orderBy)](#entity-ordering-orderby) below                                                                                                                                                                        | -           |
| `orderDirection` | string  | Sort direction (`asc`, `desc`) for the legacy notation (see below). Ignored when `orderBy` carries explicit `;`-direction operators                                                                                                                                                                                  | `asc`       |
| `type`           | string  | Filter by entity type                                                                                                                                                                                                                                                                                                | -           |
| `typePattern`    | string  | Regular expression pattern for entity type, evaluated **verbatim** (no implicit `*`→`.*` conversion). Combining with `type` is an **AND** (both must match) — unlike NGSIv2 where they are mutually exclusive (#2105/#2122). Applied to federated (remote) results before merging as well (#2134). **GeonicDB 独自拡張** | -           |
| `idPattern`      | string  | Regular expression pattern for entity ID                                                                                                                                                                                                                                                                             | -           |
| `q`              | string  | Filter by attribute value                                                                                                                                                                                                                                                                                            | -           |
| `attrs`          | string  | Attribute names to retrieve (comma-separated)                                                                                                                                                                                                                                                                        | -           |
| `pick`           | string  | Attribute names to retrieve, in the **NGSI-LD Attribute Projection Language** (ETSI GS CIM 009 clause 4.21). Mutually exclusive with `omit` and `attrs`. Entity members `id` / `type` / `scope` may be listed. Syntax violations return `400 BadRequestData` (#2277)                                                 | -           |
| `omit`           | string  | Attribute names (or Entity members `id` / `type` / `scope`) to exclude, same projection language as `pick`. Mutually exclusive with `pick` and `attrs`. The result may no longer be a valid NGSI-LD Entity (#2275)                                                                                                   | -           |
| `scopeQ`         | string  | Scope query (e.g., `/Madrid`, `/Madrid/#`, `/Madrid/+`)                                                                                                                                                                                                                                                              | -           |
| `lang`           | string  | Language filter for LanguageProperty (BCP 47, comma-separated / q-value ranking, `*` for any supported language). Converts the attribute to a Property `{value, lang}` and drops `languageMap`                                                                                                                       | -           |
| `georel`         | string  | Geo-query operator                                                                                                                                                                                                                                                                                                   | -           |
| `geometry`       | string  | Geometry type                                                                                                                                                                                                                                                                                                        | -           |
| `coordinates`    | string  | Coordinates                                                                                                                                                                                                                                                                                                          | -           |
| `spatialId`      | string  | Filter by spatial ID (ZFXY format) (see [Spatial ID Search](./endpoints.md#spatial-id-search))                                                                                                                                                                                                                       | -           |
| `spatialIdDepth` | integer | Depth of spatial ID hierarchy expansion (0-4)                                                                                                                                                                                                                                                                        | 0           |
| `crs`            | string  | Coordinate reference system (see [Coordinate Reference System (CRS)](./endpoints.md#coordinate-reference-system-crs)). URN format also accepted                                                                                                                                                                      | `EPSG:4326` |
| `geoproperty`    | string  | GeoProperty name to use for geo-queries                                                                                                                                                                                                                                                                              | `location`  |
| `format`         | string  | Output format (`normalized`, `concise`, `keyValues`, `simplified`, `geojson`). `format` is prioritized over `options`. Unknown values are rejected with `400 InvalidRequest`. `geojson` can also be specified with `Accept: application/geo+json` header                                                             | -           |
| `expandValues`   | string  | Attribute names to expand (comma-separated, returns expanded values)                                                                                                                                                                                                                                                 | -           |
| `options`        | string  | `keyValues` / `simplified`, `concise`, `entityMap`, `sysAttrs` (output system attributes). Comma-separated tokens. **Unknown tokens are rejected with `400 InvalidRequest`** (ETSI GS CIM 009 - 6.3.20, #1664)                                                                                                       | -           |
| `count`          | boolean | `true` returns the `NGSILD-Results-Count` header; `false` is accepted and omits it; any other lexical value returns `400 BadRequestData` (ETSI GS CIM 009 Table 6.3.13-1 declares `count` as Boolean, #1904)                                                                                                         | -           |
| `splitEntities`  | flag    | Split response into arrays grouped by entity type (GeonicDB 独自拡張; standalone query parameter, not an `options` token)                                                                                                                                                                                                | -           |
| `local`          | boolean | `true` answers from local data only (no Context Source Registration is considered as matching; ETSI GS CIM 009 Table 6.3.18-1). `localOnly` is a backward-compatible alias. Non-Boolean values return `400 BadRequestData` (#2008)                                                                                   | `false`     |

> **GeoJSON 属性/型名のコンパクト化 (#1788 サブ項目 6):** `format=geojson` (または `Accept: application/geo+json`) がネゴシエートされた場合、Feature の `properties` キーと `properties.type` は JSON 表現と同じリクエスト `@context` ルールでコンパクト化されます (ETSI GS CIM 009 clause 5.5.7 — 上記の [Content Negotiation and @context](#content-negotiation-and-context) を参照)。この修正以前は、`toNgsiLd` (JSON) は名前をコンパクト化していましたが、GeoJSON トランスフォーマーは保存された (canonical/FQN) 名をそのまま出力していたため、同じエンティティが `Accept` によって異なる属性名を持つ可能性がありました。コンパクト化されるのは出力された `properties` キーのみです。`geometry` として選択された属性は**保存された**属性名と照合されるため、ジオメトリ選択はコンパクト化の影響を受けません。
>
> **トップレベル `geometry` の選択 — `geometryProperty` (#2046):** ETSI GS CIM 009 clause 4.5.16.1 は選択アルゴリズムを定義しています。`geometryProperty` クエリパラメータは Feature の `geometry` として使用する GeoProperty を指定し、**「このパラメータが存在しない場合、デフォルト名として `location` が使用されなければならない」**とされています。パラメータ値は term なので、保存された (canonical/FQN) 属性名と照合される前にリクエスト `@context` で展開されます — 属性が FQN として保存されている場合でも、`@context` で定義された短縮名を渡すことができます。エンティティが指定された GeoProperty を持たない場合、または値が有効な GeoJSON geometry オブジェクトでない場合、`geometry` は `null` になります (clause 4.5.16.1)。`location` へのフォールバックは**行われません**。同じ仕組みは 3 つの GeoJSON 対応バインディング — `GET /entities`、`GET /entities/{entityId}`、`POST /entityOperations/query` — すべてに適用されます。
>
> `geometryProperty` は **`geoproperty` とは異なるパラメータです** (Table 6.4.3.2-1 は両方を定義しています)。`geometryProperty` は GeoJSON トップレベルの `geometry` を選択し、`geoproperty` は geo-query がフィルタリングする GeoProperty を指定します。clauses 5.7.1 と 5.7.2 によれば、*「`geometryProperty` パラメータが存在し、Accept Header が `application/geo+json` に設定されていない場合、BadRequestData 型のエラーが発生しなければならない」* — したがって、GeoJSON 以外のレスポンスで指定すると、黙って無視されるのではなく `400 BadRequestData` が返されます。(GeonicDB は `?format=geojson` でも GeoJSON をレンダリングするため、チェックは「このレスポンスは GeoJSON か」であり、「Accept ヘッダーが正確に geo+json か」ではありません。)
>
> **選択された GeoProperty も `properties` に出現します (#2046):** clause 4.5.16.2 は `properties` を *「各 Property に対して 1 つのメンバー (**選択された GeoProperty を含む**)」* と定義しており、annex C.2.3 の例では `geometry` と `properties.location` が並んで表示されています。この修正以前、GeonicDB は `properties` からジオメトリ属性を除外していたため、`location` が GeoJSON レスポンスから消えていました。現在は仕様の要求どおり、両方の場所に出力されます。Clause 4.5.17.1 は簡略化された GeoJSON 表現に対しても同じルールを述べています。
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

`orderBy` は v1.9.1 Entity Ordering Language を受け付ける (#1580 / #1661):

```text
orderBy = AttrName [";" directionOp] *("," AttrName [";" directionOp])
directionOp = asc | desc | dist-asc | dist-desc
```


* **方向指定付き単一キー**: `orderBy=temperature;desc` (デフォルトの方向は `asc`)。`directionOp` は大文字小文字を区別しない (`;DESC` も受け付けられる)。
  
* **複合キー** (カンマ区切り、タイブレーカーとして左から右に評価される): `orderBy=type;asc,temperature;desc`。
  
* **パス**: ドット記法 (`name.observedAt`) とブラケット記法 (`address[city]`、同等のドットパスに正規化される) を受け付ける。エンティティメンバー `id` / `type` / `scope` も使用できる。
  
* **距離ソート**: `dist-asc` / `dist-desc` は GeoProperties の距離でソートする。`orderBy=geo:distance` (`near` geo-query と共に) は `$geoNear` 距離ソートパスを経由する。
  
* **文法違反** (例: `;ascending`、空の項、末尾のカンマ、不正なブラケット) は `400 BadRequestData` を返す。構文的に有効だが **存在しない属性はエラーではない** — §4.23.2 の混合型順序付けに従い、属性が欠けているエンティティは最後にソートされる。
  
* 1 つの式あたり最大 **20** 個の順序付け項 (`SECURITY.MAX_ORDER_BY_TERMS`)。それを超えると `400` を返す。
  
* 同じ構文がバッチクエリ (`POST /entityOperations/query`) と temporal クエリエンドポイントで受け付けられる。Temporal クエリでは、さらに `orderBy` と `aggrMethods` の組み合わせを拒否し、暗号化されたテナントでの属性値ソートを `400` で拒否する。

> **レガシー記法 (GeonicDB、非推奨)**: v1.9.1 以前の記法 — `orderBy=!attr` (降順を示す先頭の `!`) と別パラメータ `orderDirection` の組み合わせ — は、後方互換性のためにまだ受け付けられ、コントローラ境界で正規文法に変換される (明示的な `orderDirection` は `!` よりも優先される)。新しいクライアントは `;`-方向構文を使用すべきである。

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

> **`count` 受け付け値 (#1904)**: `count` は ETSI GS CIM 009 Table 6.3.13-1 に従って **Boolean** である。
> `count=true` は `NGSILD-Results-Count` ヘッダーを設定する。**`count=false` は受け付けられる** が、単にそれを省略する
> (200、エラーではない)。その他の値 — `yes`、`1`、`True`、空 — は Boolean の字句形式ではなく
> **`400 BadRequestData`** を返す。これはすべての NGSI-LD 一覧エンドポイント (entities、batch query、
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

> **予約済み Core Context 非具象化 Property 名 (#2522 / #2538)**: ETSI GS CIM 009 clause 4.5.1 は、Core Context 非具象化 Properties を Attribute 名として使用することを禁止しています。GeonicDB は、entity / batch / temporal 書き込みパスで (コンパクト名または Core FQN `https://uri.etsi.org/ngsi-ld/<name>`、大文字小文字を区別) を `400 BadRequestData` で拒否します (MCP/A2A temporal ツールを含む): `createdAt` / `modifiedAt` / `deletedAt` / `expiresAt` / `observedAt` / `lastUsedAt` / `datasetId` / `instanceId` / `unitCode` / `valueType` / `lang` / `entityIdSealed` / `entityTypeSealed`。Entity レベルの `expiresAt` は ISO 8601 TTL 文字列として引き続き許可されます (clause 4.22)。`options=sysAttrs` レスポンスからの `createdAt` / `modifiedAt` / `deletedAt` / `expiresAt` の ISO 文字列エコーは、システム属性として無視されます (ユーザー Attributes として扱われません)。ニアミスの名前 (`observed_at`、`ObservedAt`、`https://example.org/observedAt`、…) は受け入れられます。同じトークンを持つ **Attribute 内部メンバー** (例: Property `observedAt` / `unitCode` / `datasetId` / `valueType`) は有効なメタデータとして残り、拒否されません。予約名 Attribute をすでに保存している既存のエンティティは、システム値が要求されていない場合、GET で引き続きそれを返します。`options=sysAttrs` (または entity レベルの `expiresAt`) が同じキーのシステム値を出力する場合、システム値が優先されます。`DELETE /entities/{id}/attrs/{reservedName}` および temporal attribute DELETE は引き続き許可されており、クライアントはレガシー Attributes をクリーンアップできます。
>
> **サブ属性 (#1581)**: 属性はユーザー定義のサブ属性を持つことができます (Property of Property、Relationship of Property など — ETSI GS CIM 009 clause 4.5)、例: `"airQualityLevel": { "type": "Property", "value": 2, "accuracy": { "type": "Property", "value": 0.9 } }`。1 レベルのサブ属性が保存され、読み取り時に返されます (正規化および簡潔)。より深いネスト (サブ属性自身のサブ属性) は保持されません。
>
> **簡潔メタデータと再帰的サブ属性 (#1761 / #1779)**: 簡潔出力では、予約済みメタデータは実際に保存されているものから復元されます: `observedAt`、`unitCode`、`valueType`、および書き込み時にそれを保持する属性タイプの `datasetId` (ETSI GS CIM 009 clause 4.5.2.3)。`GeoProperty` および `LanguageProperty` は現在書き込み時に `datasetId` を保持しないため、`datasetId` はこれらのタイプの正規化および簡潔出力の両方から欠落しています (#1795 で追跡)。これは取り込み側の制限であり、簡潔フォーマットの制限ではありません。`unitCode` は、ETSI が明示的に禁止している単位のないタイプでは省略されます (`Relationship`、`ListRelationship`、`LanguageProperty`、`VocabProperty`、`JsonProperty`; clauses 4.5.3.3 / 4.5.22.3 / 4.5.18.3 / 4.5.20.3 / 4.5.24.3)。サブ属性は簡潔表現で再帰的にシリアライズされます: 独自のサブ属性を持たないサブ Property は単なる値に折りたたまれ、サブ Relationship はそのエンベロープを保持します (`{ "type": "Relationship", "object": ... }`)。
>
> **マルチターゲット Relationship (#1615)**: `Relationship.object` は単一の URI または **URI の配列** (ETSI `oneOf: string | array`) を受け入れます、例: `"locatedAt": { "type": "Relationship", "object": ["urn:ngsi-ld:City:Paris", "urn:ngsi-ld:City:Lyon"] }`。配列形式 (1 から `MAX_QUERY_ATTRS` URIs、デフォルト 50) は配列として保存および返されます。
>
> **サブ属性名と用語展開 (#1788 サブ項目 4)**: サブ属性名は、Attribute および Entity Type 名と同じ用語 ⇄ URI 等価性の対象となります (ETSI GS CIM 009 clause 5.5.7 — "Property, Relationship or Type names")。短い名前はリクエスト `@context` で展開され、完全修飾名として保存され、レスポンスは **そのリクエストによって提供された `@context`** を使用してコンパクト化します (clause 5.5.5)。したがって、サブ属性名は短い名前 (`^[A-Za-z0-9_]+$`) または絶対 IRI のいずれかとして指定できます。絶対 IRI ではないドット付き名前 (例: `unit.code`) は依然として `400 BadRequestData` で拒否されます。予約済み属性メンバー (`observedAt`、`unitCode`、`datasetId`、`valueType`) はこの意味での名前では **なく**、決して変換されません。同じ属性の 2 つのサブ属性名が同じ出力名にレンダリングされる場合、その属性は保存された名前でレンダリングされます (データ保存がコンパクト化に勝る — トップレベル属性名と同じルール)。これは、正規化および簡潔出力、単一属性取得 (`GET /entities/{entityId}/attrs/{attrName}`)、サブスクリプション通知に適用されます。
>
> **簡潔入力はサブ属性を運ぶ (#1793)**: `options=concise` (`PATCH /entities/{entityId}/attrs`、`PATCH /entities/{entityId}`、`PUT /entities/{entityId}`) では、予約済みメンバー以外の属性オブジェクトのメンバーは、ユーザー定義のサブ属性として取り込まれ、clause 4.5.2.3 (サブ属性は簡潔表現で再帰的にシリアライズされる) と一致します。単なるスカラー (`"accuracy": 0.5`) はサブ Property になり、オブジェクト形式 (`"providedBy": {"object": "urn:..."}`) はトップレベル簡潔入力と同じ推論を使用して値メンバーから型付けされます。以前は、4 つの予約済みメンバーのみが残ったため、簡潔を読み取ってそれを書き戻すと、すべてのユーザー定義サブ属性が静かにドロップされました。`POST /entities/{entityId}/attrs` (追加) は `options=concise` を受け入れないことに注意してください — そのオプション語彙は `noOverwrite` のみです (clause 5.6.3)。
>
> **VocabProperty 値と用語展開 (#1788 サブ項目 5)**: ETSI GS CIM 009 clause 5.5.7 は "Property, Relationship or Type names **and VocabProperty values**" を用語 ⇄ URI 等価性の対象としてリストしています。短い名前として指定された `vocab` 値は、リクエスト `@context` で展開され、完全修飾名として保存され、レスポンスはそのリクエストによって提供された `@context` を使用してコンパクト化します — Attribute および Entity Type 名に適用されるのとまったく同じルールです。`vocabMap` の場合、**値** のみが変換されます。キーは言語タグであり、用語ではありません。サブ属性として表示される VocabProperty は同じ方法で変換されます。クエリはこれに従います: `q=fuel=="diesel"` は正規 FQN で保存されたエンティティと一致し、同じエンティティは別の用語を同じ URI にマッピングする異なる `@context` を通じて見つかります。クエリ側の拡張は **VocabProperty に制限されています** (属性ドキュメントの `type` は条件の一部です)、したがって、プレーン Properties の値比較は影響を受けません。
>
> **Property `valueType` (#1580)**: オプションの Property メンバー `valueType` (ETSI GS CIM 009 clause 4.5.2) は書き込み時に保存され、読み取り時に保持されます (正規化および簡潔表現)。空の文字列は `400 BadRequestData` で拒否されます。
>
> **簡潔マルチ属性配列要素はオブジェクトです (#2573)**: ETSI GS CIM 009 clause 4.5.2.3 / 4.5.5 は、マルチインスタンス簡潔属性を JSON-LD **オブジェクトの配列** にすることを要求しています。したがって、GeonicDB は常に各マルチ属性インスタンスを `GET ?options=concise` および簡潔通知でオブジェクトとしてレンダリングします (例: デフォルト Property インスタンス `{ "value": 42 }`、単なる `42` ではない)。clause 4.5.2.3 第 1 形式の単なる値の短縮は、依然として **単一インスタンス** 属性にのみ適用されます。書き込み時 (`options=concise`)、すべての配列要素が最初に分類されます: すべて属性形状 → マルチ属性 (`datasetId` なしのデフォルトインスタンスは最大 1 つ); すべてプレーン → Property 配列値; **混在 → `400 BadRequestData`** (順序に依存しない)。`[55, {"value":54,"datasetId":"..."}]` のような手書きのレガシー形状は拒否されます — `[{"value":55},{"value":54,"datasetId":"..."}]` として書き直すか、Property 配列値が意図されている場合は `{"value":[...]}` を使用します。
>
> **外部値メンバー (#2525)**: 宣言された属性タイプに属さない値を運ぶメンバー (例: `Property` 上の `object` / `languageMap` / `json` / `vocab` / `valueList` / `objectList`、または `LanguageProperty` 上の `value`) は、すべての完全形式 **Entity API** 書き込みパス (作成 / 追加 / 属性更新 / エンティティ置換 / 属性置換 / バッチ) で `400 BadRequestData` で拒否されます。これは、ETSI GS CIM 009 clause 4.5.2.2 (および他の属性タイプの対応する "shall never be present" リスト) および clause 5.5.4 に従います。`previousValue` などの同じタイプの出力専用メンバーは、Table 5.2.5-2 に従って引き続き無視されます (拒否されません)。`VocabProperty` 上の `vocabMap` は GeonicDB 拡張として受け入れられます (Table 5.2.35-1 は `vocab` のみをリストしています)。**Temporal API 書き込みパスはここではカバーされていません** (別の属性インスタンススキーマを使用します。Temporal セクション / 追跡問題を参照してください)。
>
> **外部出力専用メンバー (#2533)**: 別の属性タイプに属する `previous*` / `entity` / `entityList` メンバー (例: `Property` 上の `previousObject` / `entity`、または `Relationship` 上の `previousValue`) は、**短い名前** で送信された場合、Entity API 書き込みパスで同様に `400 BadRequestData` で拒否されます (clause 4.5.2.2 Prohibited + clause 5.5.4)、**簡潔** 入力を含みます (正規化と同じ差分セット)。同じタイプの出力専用メンバーは **無視されます** (Table 5.2.x-2 / clause 4.5.3.2 / 4.5.22.2): Property/GeoProperty/TemporalProperty `previousValue`、Relationship `previousObject`+`entity`、LanguageProperty `previousLanguageMap`、JsonProperty `previousJson`、VocabProperty `previousVocab` (および GeonicDB 拡張 `previousVocabMap`)、ListProperty `previousValueList`、ListRelationship `previousObjectList`+`entityList`。短い名前の属性オブジェクトは保存されません。`@context` 用語展開後にこれらの名前に着地する入力 (インラインエイリアスまたはメンバーキーとしての絶対 IRI) は、メタデータに保持される可能性がありますが、**読み取りは決してそれらを返しません** (正規化および簡潔) — これは、これらの名前をサブ属性 / メタデータキーとしてすでに保存している **既存のドキュメント** にも適用されます: **移行も警告もありません**。そのようなキーは、すべての取得/クエリレスポンスから単に消えます。そのドロップは意図的です (これは #2533 防御の読み取り側の半分であり、レガシー汚染も中和します)。これらのエイリアス/IRI 形式の書き込み側拒否 (`observedAt` / `unitCode` / `datasetId` などの正当な NGSI-LD メンバーの許可リスト) は #2572 で追跡されています。**Temporal API 書き込みパスはカバーされていません** (#2525 と同じ除外)。**MCP / A2A** は、HTTP と同じリーフ差分セット (`listPresentForeignValueMembers`) を使用し、宣言された `type` が不明な場合でも、`ALL_ATTRIBUTE_VALUE_MEMBERS` の 2 つ以上を提示する属性オブジェクトを追加で拒否します (#2532)。簡潔 **配列** (マルチ属性) 形式は #2573 (HTTP) でカバーされています。MCP/A2A 配列形式は引き続き #2570 です。
> **一時エンティティ (expiresAt)**

エンティティに `expiresAt` フィールド (ISO 8601 形式) を指定することで、有効期限を持つ一時エンティティとして作成されます。有効期限は将来の日付である必要があります。

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

* ステータス: `201 Created`
  
* ステータス: `409 AlreadyExists` (同じ ID を持つエンティティがすでに存在する場合、タイプに関係なく)
  
* ヘッダー: `Location: /ngsi-ld/v1/entities/urn:ngsi-ld:Room:001`

> **注**: Entity ID は、テナントおよびServicePathスコープ内で一意です。同じ ID で異なるタイプのエンティティを作成すると、`409 AlreadyExists` が返されます。詳細については、[Entity ID Uniqueness](./endpoints.md#entity-id-uniqueness-geonicdb-extension) を参照してください。

> **高度を持つ GeoProperty 座標 (#1584)**: GeoProperty 値は GeoJSON ジオメトリです (RFC 7946)。位置は 2 要素 `[longitude, latitude]` または 3 要素 `[longitude, latitude, altitude]` である可能性があります — オプションの 3 番目の要素 (高度/標高) は受け入れられ、読み取り時に保持されます。空間インデックスおよびジオクエリには、経度/緯度のみが使用されます。3 要素を超える位置は `400 BadRequestData` を返します (RFC 7946 §3.1.1 は 3 要素を超える位置の拡張を推奨していません)。非 WGS84 `crs` クエリパラメーターが座標変換をトリガーした場合でも、高度は保持されます: 経度/緯度のみが再投影され、高度は変更されずに持ち越されます (これらの CRS には垂直データムがないため、高度は再投影不変です) (#1595)。

#### 単一エンティティの取得

```http
GET /ngsi-ld/v1/entities/{entityId}
```

**クエリパラメーター**

| Parameter | Type   | Description                                                                                                                                                                                                                                                          |
| --------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`    | string | Entity type                                                                                                                                                                                                                                                          |
| `attrs`   | string | Attribute names to retrieve (comma-separated)                                                                                                                                                                                                                        |
| `pick`    | string | Attribute names to retrieve, in the **NGSI-LD Attribute Projection Language** (ETSI GS CIM 009 clause 4.21). Mutually exclusive with `omit` and `attrs`. Entity members `id` / `type` / `scope` may be listed. Syntax violations return `400 BadRequestData` (#2277) |
| `omit`    | string | Attribute names (or Entity members `id` / `type` / `scope`) to exclude, same projection language as `pick`. Mutually exclusive with `pick` and `attrs`. The result may no longer be a valid NGSI-LD Entity (#2275)                                                   |
| `lang`    | string | Language filter for LanguageProperty (BCP 47)                                                                                                                                                                                                                        |
| `format`  | string | Output format (`normalized`, `concise`, `keyValues`, `simplified`, `geojson`). `format` is prioritized over `options`. Unknown values are rejected with `400 InvalidRequest`. `geojson` can also be specified with `Accept: application/geo+json` header             |
| `options` | string | `keyValues`, `concise`, `sysAttrs`                                                                                                                                                                                                                                   |

> **単一取得での GeoJSON 出力 (#1759)**: `format=geojson` (または `Accept: application/geo+json`) は、`Content-Type: application/geo+json` を持つ GeoJSON **Feature** オブジェクトを返します。対照的に、`GET /ngsi-ld/v1/entities` は GeoJSON **FeatureCollection** を返します。リストエンドポイントと同様に、`properties` キーおよび `properties.type` はリクエスト `@context` でコンパクト化されます (#1788 サブ項目 6、上記の [Retrieve Entity List](#retrieve-entity-list) の下の注を参照してください)。

> **`attrs` と 404 (#1619)**: `attrs` が提供され、エンティティが要求された属性の **いずれも** 持っていない場合、`404 Not Found` が返されます (ETSI GS CIM 009 clause 5.7.1 / OpenAPI `Query.attrs`: "If the Entity does not have any of the Attributes in attrs, then a 404 Not Found shall be retrieved")。これは単一エンティティ取得に適用されます。リスト/クエリエンドポイントは代わりに空のコレクション (`200`) を返します。

> **パス `{entityId}` URI 検証 (#1692)**: すべての NGSI-LD by-id エンドポイント (entities、subscriptions、csourceRegistrations、temporal entities、jsonldContexts) で、構文的に有効な URI ではないパス id (例: `not-a-uri`) は、存在チェックの **前に** `400 BadRequestData` で拒否されます — `404` を生成することはありません (ETSI GS CIM 009 clause 5.7.1 / 5.8.3: URI の有効性はリソースルックアップの前にチェックされます)。存在しない有効な URI は通常どおり `404 Not Found` を返します。

#### エンティティの置換

```http
PUT /ngsi-ld/v1/entities/{entityId}
```

エンティティのすべての属性を置き換えます。リクエストボディに含まれていない属性は削除されます。ボディに `scope` を含めると、エンティティのスコープが置き換えられます。省略すると、既存のスコープが保持されます。単一の文字列または文字列の配列のいずれかを渡します。`scope: null` または `scope: []` を送信すると、スコープが明示的に解除されます (**GeonicDB 拡張**、`docs/INTEROPERABILITY.md` を参照してください)。

**レスポンス**: `204 No Content`

#### エンティティの更新

```http
PATCH /ngsi-ld/v1/entities/{entityId}
```

**マージパッチセマンティクス** (ETSI GS CIM 009 clause 5.6.17 / 5.5.12):


* 言及されていない属性および属性メンバーは保持されます。マージは任意の深さで適用されます (RFC 7396 オブジェクトレベル置換ではありません): `value` / `json` / `languageMap` オブジェクトはキーごとにマージされ、`unitCode` / `observedAt` / サブ属性などのメタデータは、フラグメントで指定されない限り保持されます。
  
* `urn:ngsi-ld:null` はそのメンバーを削除します。LanguageProperty は `languageMap: { "@none": "urn:ngsi-ld:null" }` で削除されます。`datasetId` がない場合、デフォルトインスタンスのみが削除されます (clause 5.6.5.4)。`datasetId` 自体を `urn:ngsi-ld:null` に設定すると、`400 BadRequestData` になります。
  
* **`vocabMap` NGSI-LD Null (GeonicDB 独自拡張 / #2545)**: `vocabMap` 自体は ETSI Table 5.2.35-1 にはありません (`vocab` のみがあります)。GeonicDB は `vocabMap` を多言語 vocab 値メンバーとして受け入れます。属性全体の Null は `languageMap` と同じマップ形式を使用します (clause 4.5.0 / 4.5.18 の前例): `vocabMap: { "@none": "urn:ngsi-ld:null" }`。マージ / 部分更新では、この形式は Attribute を削除します (clause 5.5.12 / 5.5.8 / 5.6.4)。作成 / 追加 / 置換では、`400 BadRequestData` で拒否されます (clause 5.5.4)。単なる文字列 `vocabMap: "urn:ngsi-ld:null"` はスキーマ無効のままです (`z.record`)。エントリレベル `{ "en": "urn:ngsi-ld:null" }` は属性全体の Null ではありません (`languageMap` エントリマージと同じ境界)。
  
* 空のエンティティ id (パス正規化後の `PATCH /ngsi-ld/v1/entities/`) は `400 BadRequestData` です (clause 5.6.17.4)。
  
* エンティティのタイプに対してカスタムデータモデルが定義されており、`required: true` 属性が消失する場合、これは代わりに `400 Bad Request` を返します (**GeonicDB 拡張**)。


* ボディに `scope` を含めると、エンティティのスコープが置き換えられます。省略すると、既存のスコープが保持されます。単一の文字列または文字列の配列を渡します。`scope: null` または `scope: []` を送信すると、明示的にスコープが解除されます(**GeonicDB 拡張**、`docs/INTEROPERABILITY.md` を参照)。
  
* クエリパラメータ `options=keyValues` または `options=concise` を指定すると、簡略化された入力形式を使用できます。

**レスポンス**: `204 No Content`

#### 属性の追加

```http
POST /ngsi-ld/v1/entities/{entityId}
Content-Type: application/ld+json
```

**クエリパラメータ**

| Parameter             | Description                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| `options=noOverwrite` | Do not overwrite existing attributes (existing attributes are preserved, only new attributes are added) |

**レスポンス**: `204 No Content`

#### 複数属性の部分更新

```http
PATCH /ngsi-ld/v1/entities/{entityId}/attrs
Content-Type: application/ld+json
```

エンティティの複数の属性を部分的に更新します。リクエストボディに含まれる属性のみが更新されます。含まれない属性は保持されます。このエンドポイントは現在、ボディ内の `scope` フィールドを処理**しません** — スコープを更新するには、代わりに `PATCH /entities/{entityId}` (エンティティの更新) または `PUT /entities/{entityId}` (エンティティの置換) を使用してください。

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

#### エンティティの削除

```http
DELETE /ngsi-ld/v1/entities/{entityId}
```

**レスポンス**: `204 No Content`

#### エンティティの全属性の取得

```http
GET /ngsi-ld/v1/entities/{entityId}/attrs
```

エンティティの全属性を取得します。

**レスポンス**: `200 OK`

#### 単一属性の取得

```http
GET /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}
```

エンティティの特定の属性を取得します。

**レスポンス**: `200 OK`

#### 属性の上書き (PUT)

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

#### 属性の置換

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

> **注意**: エンティティまたは属性が存在しない場合、`404 Not Found` が返されます(ETSI GS CIM 009 V1.9.1 clause 5.6.4)。この操作は既存の属性の部分更新のみを実行し、新しい属性を作成しません。

**Entity Fragment のセマンティクス** (clause 5.6.4 — *"部分更新は Entity Fragment で提供された要素のみを変更し、残りはそのままにします"*)

リクエストボディは *Entity Fragment* です。変更したい要素のみを含める必要があります。送信しないメンバーはそのまま残されるため、Context Brokerが既に保存している内容をエコーバックする必要はありません。

> 以下のフラグメントは**議論中のメンバーのみ**を示しています。すべての `application/ld+json` リクエストと同様に、実際のリクエストボディにはインライン `@context` も含まれます([Content Negotiation and @context](#content-negotiation-and-context) を参照)。`application/json` の場合、コンテキストは `Link` ヘッダーを介して提供されます。


* **value メンバーは省略可能です。** `value` / `object` / `languageMap` / `json` / `vocab` / `vocabMap` (GeonicDB 拡張) / `valueList` / `objectList` はすべてオプションです。メタデータまたはサブ属性のみを含むフラグメントは有効であり、保存された値と属性タイプは保持されます。

  ```json
  { "observedAt": "2026-08-06T18:30:00.000Z" }
  ```

  ```json
  { "providedBy": { "type": "Relationship", "object": "urn:ngsi-ld:Person:JohnDoe" } }
  ```


* **`type` は省略可能です。** フラグメントが value メンバーを含む場合、属性タイプはそれから推測されます(`object` → `Relationship`、`languageMap` → `LanguageProperty`、`json` → `JsonProperty`、`valueList` → `ListProperty`、`objectList` → `ListRelationship`、`vocab` / `vocabMap` (GeonicDB 拡張) → `VocabProperty`、GeoJSON 形式の `value` → `GeoProperty`、それ以外は `Property`)。フラグメントが value メンバーを含まない場合、保存された属性タイプが維持されます。

  ```json
  { "languageMap": { "fr": "Grand Place", "es": "Gran Lugar" } }
  ```


* **送信する要素の検証は変更されません。** 無効な `observedAt`、不正な形式の `languageMap`、URI ではない `object` などは、依然として `400 BadRequestData` を返します。


* **`application/ld+json` では `@context` は依然として必須です(#1927)。** value メンバーの省略が許可されても、`@context` には拡張されません。ETSI GS CIM 009 clause 6.3.5 は、`Content-Type` が `application/ld+json` の場合、`POST` / `PUT` / `PATCH` ボディの `@context` がペイロード自体から提供されることを要求しており、それがないボディは `400 BadRequestData` を返します。`application/json` の場合は、代わりに `Link` ヘッダーを介して提供してください。これは、エンティティレベルのエンドポイントと同様に、単一属性エンドポイントにも適用されます。


* **NGSI-LD Null は属性を削除します** (#2419 / ETSI 012\_05)。Clause 5.6.4.4 は **clause 5.5.8** の部分更新アルゴリズムを要求しており、これは値が NGSI-LD Null である Fragment メンバーを削除します(`datasetId` インスタンスは **clause 5.6.5** に委ねられます)。したがって、`PATCH .../attrs/{attrName}` で例えば `{ "type": "Property", "value": "urn:ngsi-ld:null" }` を送信すると、その属性(または選択されたインスタンス)が削除され、`204` が返されます。これは `DELETE .../attrs/{attrName}` と同じ結果です。

  > **認可に関する注意**: XACML アクションは **HTTP メソッド** (`method`) にマッチされます。`PATCH` を許可し `DELETE` のみを拒否するポリシーは、属性の破壊を防ぐことは**できません**。クライアントは `PATCH` + NGSI-LD Null で属性を削除でき(エンティティレベルの `PATCH .../attrs` は既に `removeAttributes` を呼び出すことができます)、削除をブロックするには、`DELETE` と同様に `PATCH`(および Null を受け入れる他の書き込みメソッド)も拒否してください。

> **PUT / POST は異なります。** 同じパスでの `PUT` と `POST` は *Replace Attribute*(clause 5.6.19 — *"既存の属性インスタンスを完全に置き換える"*)です。これらは完全な属性を必要とします。value メンバーを省略すると `400 BadRequestData` が返され、提供されないメンバーは保持されるのではなく削除されます。

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

> **注意(インスタンス選択、clause 5.6.5.4)**: `datasetId` が省略された場合、操作は**デフォルトインスタンス**を対象とします。これは `datasetId` を持たないインスタンスです。属性にデフォルトインスタンスがない場合(保存されているすべてのインスタンスが `datasetId` を持つ場合)、リクエストは `404 ResourceNotFound` を返します。そのようなインスタンスを削除するには、その `datasetId` を渡すか、`deleteAll=true` を渡してください。これは、属性が現在インスタンスの配列として保存されているか、単一のオブジェクトとして保存されているかに関係なく適用されます。1 つのインスタンスに減らされた属性は単一のオブジェクトにアンラップされ、アンラップは `datasetId` を持つインスタンスをデフォルトインスタンスに変えません(#2177)。
>
> **注意**: **最後の残りの属性**を削除することは許可されており、`204` を返します。NGSI-LD (ETSI GS CIM 009) は、エンティティが少なくとも 1 つの属性を保持することを要求していません。`id`/`type` のみで構成されるエンティティは有効であり、削除後も残ります。

> **注意(GeonicDB 拡張)**: エンティティのタイプに対してカスタムデータモデルが定義されており、属性が `required: true` とマークされている場合、これは `400 Bad Request` を返します。ただし、削除によって属性が完全に削除される場合のみです(つまり、最後の残りのマルチ属性インスタンス、または `deleteAll` リクエスト)。別のインスタンスが残っている間に `datasetId` で 1 つのインスタンスを削除すると、通常どおり `204` が返されます。同じルールがマージパッチ `urn:ngsi-ld:null` による削除にも適用されます。`required: false` の属性、および `isActive: false` のモデル上の属性は、引き続き削除できます。

### Multi-Attribute (datasetId)

> **ETSI GS CIM 009 Reference**: Section 4.5.3 - Multi-Attribute

NGSI-LD では、同じ属性名に対して複数のインスタンスを保持できます。各インスタンスは `datasetId` (URI 形式) によって区別されます。`datasetId` を持たないインスタンスは「デフォルトインスタンス」と呼ばれ、1 つの属性につき最大 1 つまで存在できます。

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

上記の例では、`speed` 属性に対して 3 つのインスタンスがあります:GPS からの 1 つ、OBD からの 1 つ、そしてデフォルトインスタンスです。

#### 取得 (RETRIEVE)

エンティティを取得する際、マッチするインスタンスは **複数のインスタンスがマッチした場合のみ配列として** 返されます (ETSI GS CIM 009 clause 4.5.5.1)。単一のマッチするインスタンス — `?datasetId=` フィルタの後や、インスタンスが削除された後を含む — は、1 要素の配列ではなく、単一の Attribute 要素として返されます (#2272)。

`keyValues` (簡略) 形式では、multi-attribute は **複数のインスタンスがマッチした場合のみ**、`datasetId` をキーとする **`dataset` マップ** として返され、デフォルトインスタンス (`datasetId` を持たないもの) は JSON-LD キーワード `@none` をキーとします (ETSI GS CIM 009 clause 4.5.4 / 4.5.5.1、#1930 / #2272)。単一のマッチするインスタンスは素の値のままです。

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

`@none` キーはデフォルトインスタンスが存在する場合のみ存在します。同じ形式は `Relationship`、`ListProperty`、`ListRelationship` にも適用されます (clause 4.5.4 EXAMPLE 13 / 15 / 19)。`normalized` と `concise` も単一のマッチする multi-attribute インスタンスを折りたたみます;配列は複数のマッチに対してのみ残ります。これは Attribute-instance 配列 (clause 4.5.5.1) であり、`ListProperty` / `ListRelationship` の値配列ではありません。

> \#1930 以前は、デフォルトインスタンス (または、それがない場合は最初のインスタンス) のみが返されていたため、`keyValues` は `normalized` よりも少ない情報を暗黙的に公開していました。`keyValues` の multi-attributes を読み取るクライアントは、現在 `dataset` をアンラップする必要があります。

#### 更新 (UPDATE)

単一属性エンドポイント (`PATCH` / `PUT` / `POST /ngsi-ld/v1/entities/{entityId}/attrs/{attrName}`) では、操作はリクエストボディ内の `datasetId` によって選択される **1 つの属性インスタンス** をターゲットとします (ETSI GS CIM 009 clauses 5.6.4 / 5.6.19)。同じ属性の他のインスタンスはそのまま残されます (#1819)。

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

`PATCH` は提供されたメンバーを選択されたインスタンスにマージします (clause 5.6.4 — 提供されないメンバーはそのまま残ります);`PUT` / `POST` は選択されたインスタンスを完全に置き換えます (clause 5.6.19)。

##### エンティティレベルの更新 (#1909)

**エンティティレベル** の更新操作は同じルールでインスタンスを選択しますが、**`ResourceNotFound` ゲートがありません** — 既存のインスタンスにマッチしない `datasetId` は拒否されるのではなく、**新しいインスタンスとして追加** されます。これは ETSI GS CIM 009 clause 5.5.8 の汎用パッチアルゴリズムに従います:`datasetId` を持つメンバーは、`datasetId` が同じ場合のみ置き換えられ、*「それ以外の場合、Fragment のメンバーは新しいインスタンスとしてターゲットに追加される」* とされています。リクエストがターゲットとしないインスタンスはそのまま残されます。

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

属性は、作成時(4.5.5 項)と同様に、エンティティレベルの更新において **インスタンスの配列** として提供することもできます。`datasetId` を省略できるのは最大 1 つの要素(デフォルトインスタンス)のみであり、複数の要素で省略すると `400 BadRequestData` になります。

#### 削除 (DELETE)

属性を削除する際、`datasetId` クエリパラメータを指定すると、特定のインスタンスのみが削除されます。`deleteAll=true` を指定すると、すべてのインスタンスが削除されます。両方を省略すると **デフォルトインスタンス**(`datasetId` を持たないもの)が対象となり、存在しない場合は `404 ResourceNotFound` が返されます — 上記の [Delete Attribute](#delete-attribute) の注記を参照してください。

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
  
* 部分的な成功: `207 Multi-Status`

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

* 作成されたエンティティが存在する場合: `201 Created` (ボディ = **作成された**エンティティ ID のみの配列)
  
* すべてのエンティティが既に存在し、更新された場合: `204 No Content`
  
* 部分的な成功 / エンティティごとのエラー: `207 Multi-Status`

> **注意 (#2420 / ETSI 5.2.16)**: `207` のボディには常に BatchResult メンバーの
> `success` (正常に作成または更新された ID の和集合) と `errors` が含まれます。GeonicDB は拡張として `created` と `updated` **も**返すため、クライアントはどの ID が新規だったかを判別できます。
> 1 つのペイロード内の重複エンティティ ID は、出現ラウンドごとに配列順で処理されます
> (clause 5.5.11.2) — これらは単独で `207` を生成しません。
>
> **注意 (GeonicDB / #2420)**: デフォルト (マージ) モードと `options=replace` モードの両方は、
> バルク書き込みを介して実行されます (重複 ID は最初にラウンドに分割されます)。無効な要素は
> エンティティごとの `207` エラーとして報告されます (リクエストレベルの `400` ではありません)、clause 5.6.8 / #2069 スタイルの要素帰属に一致します。デフォルトの **update** モードでは、既存エンティティのタイプリストはペイロードからの新しいタイプと**マージ**されます (clause 5.6.8.4 → 5.6.2.4 / #2455; タイプは削除されません)。`options=replace` では、エンティティは `entityType` を含めて**完全に置換**されます (clause 5.6.18.4); 新しいタイプには宛先タイプの認可が必要です (`requireAuthzForNovelTypes`)。`scope` は 3 状態セマンティクスに従います (`omitted`=保持、`null`/`[]`=未設定、array=設定)。

#### バッチ更新

```http
POST /ngsi-ld/v1/entityOperations/update
```

**レスポンス**

* すべて成功: `204 No Content`
  
* 部分的な成功: `207 Multi-Status`

> **注意 (#2455)**: ペイロードの `type` は文字列または空でない文字列配列のいずれかです (Table 5.2.4)。新しいエンティティタイプは clause 5.6.9 → 5.6.2 / 5.6.3 に従って追加されます (`/attrs` と同じセマンティクス)。

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
  
* 部分成功: `207 Multi-Status`

#### Entity Purge

```http
DELETE /ngsi-ld/v1/entities
```

Bulk purge はセレクタベースの削除と属性変更をサポートします (ETSI GS CIM 009 clause 5.6.21 / 6.4.3.3)。

**クエリパラメータ**

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

**検証 / ガード**

* `type`、`attrs`、`keep`、`drop`、`q`、`georel` のうち少なくとも 1 つが必要、**または** `local=true` (`id` / `idPattern` / `scopeQ` 単独は 400 で拒否されます)
  
* `attrs` / `keep` / `drop` は少なくとも 1 つの非システム属性をリストする必要があります (`keep=createdAt` 単独 → 400)。GET の too-wide ガードと共通のヘルパー (`hasNonSystemAttribute`)
  
* `keep` と `drop` は同時に指定できません; 空の `keep=` / `drop=` は 400 で拒否されます
  
* 未知のクエリパラメータは `400 InvalidRequest` で拒否されます
  
* `attrs` / `keep` / `drop` 内の属性名はリクエストの `@context` に対して展開されます

> **警告 (`keep` / `drop` 単独):** `keep` と `drop` はエンティティセレクタであり、単なる属性変更フラグではありません。\
> `DELETE /entities?keep=name` (`type` / `id` / … なし) は **204** を返し、呼び出し元が変更を許可されている**テナント内のすべてのエンティティ**から `name` 以外のすべての属性を削除します (ETSI 5.6.21.4 bullet 2 / #2432)。\
> 同じ影響範囲は `origin/main` 上の `?type=*&keep=name` によってすでに到達可能でした。テナント全体の属性削除を意図しない場合は、明示的な `type` / `q` / `id` による絞り込みを推奨します。

**レスポンス**

* 成功: `204 No Content`

> **注意:** GeonicDB は distributed operations (context source への purge 転送) をサポートしません。purge は常にローカルストレージに対して実行されます (`csf` は受理されますが転送は行われません)。

> **GeonicDB 独自拡張 (後方互換):** `POST /ngsi-ld/v1/entityOperations/purge` も引き続き利用可能です。絞り込みに使えるのは body の `type` / `q` / `geoQ` のみです。**`typePattern` を body に積むと `400 BadRequestData`** になります (#2156) — 黙って無視すると「パターンで絞ったつもりが `type` 全件を消す」ことになるため、破壊的操作では silent 無視ではなく loud 拒否に倒しています。MCP `batch` ツールの `purge` / A2A `batch` スキルの `purge` も同じく拒否します。この拡張ルートには `DELETE /entities` 相当の too-wide セレクタガードがありません(既存の非対称。#2432 では悪化させていません)。

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

ボディは `orderBy` (v1.9.1 Entity Ordering Language、例: `"orderBy": "temperature;desc"` — [Entity Ordering (orderBy)](#entity-ordering-orderby) を参照) とレガシーの `orderDirection` (`asc` / `desc`) も受け付けます。文字列でない `orderBy` または無効な `orderDirection` は `400` で拒否されます (#1681)。

> **Too wide query (#2290)**: これは Query Entities の POST バインディングです (clause 6.23.3.1 → 5.7.2.4)。`entities[].id` / `idPattern` のみ、または `type: "Query"` のみを指定したボディは `400 BadRequestData` になります — `GET /entities?id=...` と同じ契約です。`entities[].type` / `attrs` (非システム属性を含む) / `q` / `geoQ` を追加するか、`?local=true` を渡してください。

**レスポンス**: エンティティの配列

> **GeoJSON 出力 (#1783)**: ETSI GS CIM 009 clause 6.3.4 は「Query Entity」(clause 5.7.2) — この操作が実装しています — を GeoJSON 対象操作の中にリストしています。`format=geojson` (クエリパラメータ) または `Accept: application/geo+json` でネゴシエーションすると、`Content-Type: application/geo+json` で GeoJSON **FeatureCollection** が返されます。これは `GET /ngsi-ld/v1/entities` と**同じ形状**です (同じ `NgsiLdGeoJsonTransformer`、同じページネーションヘッダー: `Link` / `NGSILD-Results-Count`)。`geometryProperty` パラメータは、`GET /entities` と全く同じようにトップレベルの `geometry` を選択します (#2046、[Retrieve Entity List](#retrieve-entity-list) 下の注記を参照)。`splitEntities` (型でグループ化されたネストした配列) は FeatureCollection として表現できないため、GeoJSON が優先されます — `GET /entities` がすでに適用しているのと同じ優先順位です。リストおよび単一取得エンドポイントと同様に、`properties` キーと `properties.type` はリクエストの `@context` で圧縮されます (#1788 サブ項目 6、上記の [Retrieve Entity List](#retrieve-entity-list) 下の注記を参照)。

#### Batch Merge

```http
POST /ngsi-ld/v1/entityOperations/merge
Content-Type: application/ld+json
```

Merge-Patch セマンティクスを使用して、複数のエンティティに対して一括更新を実行します。既存の属性はマージされ、リクエストに含まれていない属性は保持されます。値として `urn:ngsi-ld:null` を指定すると、その属性が削除されます。

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

* すべて成功:`204 No Content`
  
* 部分的成功:`207 Multi-Status`

***

### 時系列バッチオペレーション (NGSI-LD)

> **ETSI GS CIM 009 リファレンス**: セクション 5.6.12-5.6.19 - エンティティの時系列表現

時系列エンティティのバッチオペレーション。1 回のリクエストで最大 **1,000** 個のエンティティを処理できます。

> **注意**: temporal entityOperations の create / upsert / delete は GeonicDB 拡張機能であり、ETSI GS CIM 009 仕様には含まれていません。query のみが仕様準拠です。これらの拡張機能は、時系列データの一括取り込みの効率を向上させるために提供されています。

> **DB タイムアウトによるバッチの中断 (#2542)**: `create` / `upsert` / `delete` の要素の処理中にデータベースクエリタイムアウト(`maxTimeMS` 超過)が発生した場合、残りの**未試行**要素は中断され、`207 Multi-Status` の `errors` 配列に type `https://uri.etsi.org/ngsi-ld/errors/ServiceUnavailable` および `detail` が `Not attempted:` で始まる形式で報告されます — 実際にタイムアウトした要素の `detail` とは異なります。何も成功しなかった場合でも、レスポンスは `207` です(全体的な `503` にはなりません)。`success` にリストされているエンティティはコミット済みです。**`errors` にリストされているエンティティ ID のみを再試行してください**。`create` / `upsert` の場合、時系列書き込みは追記専用であるため、既に成功したエンティティを再送信すると時系列インスタンスが重複します。`delete` の場合、既に削除されたエンティティを再送信すると、単に見つからないと報告されます(データは重複しません)。

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

**レスポンス**: 完全な時系列表現が 1 つのレスポンスに収まる場合(`lastN` なし、かつデフォルトの属性ごとの上限が切り捨てられなかった場合)は `200 OK`。クライアントが `lastN` を要求した場合、またはデフォルトの上限が実際に履歴を切り捨てた場合は `Content-Range` ヘッダー付きの `206 Partial Content`(下記の [Partial Content (`206`) and `Content-Range`](#partial-content-206-and-content-range-clause-6310) を参照)。空の結果および集約表現(`aggrMethods`)も `200 OK` です。

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
| `lastN`          | integer | Return only the latest N instances per attribute (1–1000; exceeding 1000 returns 400, ETSI GS CIM 009 Section 5.6.12)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `format`         | string  | Representation format (ETSI GS CIM 009 - 6.3.12). One of `temporalValues` (simplified temporal representation, clause 4.5.9) or `aggregatedValues` (aggregated representation, clause 4.5.19); `simplified` is accepted as a synonym of `temporalValues` (GeonicDB extension). **Unknown values are rejected with `400 InvalidRequest`** (#1814). `POST /temporal/entityOperations/query` supports the same values as the GET form (clause 6.24.3.1: *"The behaviour of this clause mirrors the one in clause 6.18.3.2"*, #1816). **When both `format` and `options` are present, `format` takes precedence** (6.3.12).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `options`        | string  | Deprecated alternative to `format` (6.3.12). `temporalValues` / `simplified`: Simplified temporal representation (`[value, timestamp]` pairs), `aggregatedValues`: Aggregation representation (**`aggrMethods` is required when `aggregatedValues` is specified via `options` or `format`**), `sysAttrs`: include system temporal attributes (see below, #1817). Unknown tokens are rejected with `400 InvalidRequest` (6.3.20). The raw value must not exceed **200 characters** or **12 comma-separated values**; exceeding either returns `400 InvalidRequest` (#2031)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `orderBy`        | string  | v1.9.1 Entity Ordering Language (see [Entity Ordering (orderBy)](#entity-ordering-orderby)). Combining with `aggrMethods` returns `400`; attribute-value sorting on encrypted tenants returns `400` (#1681)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `orderDirection` | string  | Legacy sort direction — `asc` / `desc` only; other values return `400` (#1681)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `scopeQ`         | string  | Scope query (clause 4.19 / Table 6.18.3.2-1). **GET** `/temporal/entities` takes it as a **query parameter**; **POST** `/temporal/entityOperations/query` takes it as a **request-body** member (Table 5.2.23-1 / clause 6.24.3.1 mirrors 6.18.3.2). Filters temporal results by the **current** entity `scope` in the entities collection (#2597). Temporal attribute documents do not persist scope; deleted or temporal-only entities (no entities doc) are **non-matching** (fail-closed, same class as #1336). Invalid charset / term limits follow the same rules as entity `scopeQ` (#2583) → `400 BadRequestData`. Non-string `scopeQ` on POST body → `400 BadRequestData`. Authz-constrained subjects combine the readable filter and `scopeQ` in **one** entities distinct before the `AUTH.MAX_READABLE_ENTITY_IDS` cap (#2597 L1/L2). There is **no scope-specific Mongo index**; residual filtering is in-memory after the match stage — same class as entity-list `scopeQ`, not a new regression. **Behaviour change**: before #2597, `scopeQ` was accepted but silently ignored (full result set) |

**lastN パラメータ**

`lastN` を指定すると、時系列データの最新 N 個のインスタンスのみが返されます。`timerel`/`timeAt` と組み合わせることで、時間範囲内の最新 N 個のインスタンスを取得できます。最大値は属性ごとに **1000** です。それより大きい値は `400` を返します。選択されたインスタンスは**古い順**(clause 4.5.9 EXAMPLE / #2271 (c))で返されます — `lastN` は最新の N 個を選択するだけで、配列を逆順にはしません。

**デフォルトインスタンス上限 (#1437 / #2360)**: メモリ使用量の無制限化を防ぐため、`lastN` が**指定されていない**場合、Context Brokerは属性ごとに最大 **10** 個の最新インスタンスを返します。クエリがこの方法で上限に達した場合、レスポンスには `NGSILD-Warning`(warn-code 199)が付与されます。より多く取得するには、`timeAt`/`endTimeAt` を絞り込むか、明示的な `lastN`(≤1000)を設定してください。明示的な `lastN` はそのまま適用され、切り捨て警告は生成**されません**。

**時間範囲スパン制限 (GeonicDB 独自拡張)**: **リスト/クエリ**読み取りパス(`GET /temporal/entities`、`POST /temporal/entityOperations/query`)および**集約**(`aggrMethods` を含む単一エンティティ GET)での `timerel=between` は、**732 日**(`TEMPORAL.MAX_TIMESPAN_DAYS`、= 366×2)より長いスパンを `400 BadRequestData` で拒否します。これによりスキャンウィンドウが制限されます(OWASP API4:2023)。レスポンスサイズは、非集約パスでは `limit` / `lastN` によって上限が設定されます。**集約リストレスポンス**(`GET /temporal/entities` / `POST /temporal/entityOperations/query` での `aggrMethods`)にも、**エンティティレベル**の `limit` / `offset`(デフォルトページサイズ 20; clause 5.5.9 / 5.7.4.4 / #2509)および `AGGREGATION_MAX_TIME_MS` が適用されます。各エンティティ内の期間配列は切り捨てられません(clause 4.5.19)。**期間数ハード上限 (#2524 / #2555)**: 非ゼロの `aggrPeriodDuration` は、(1)**マージされた**`(entityId, attributeName)` が **`TEMPORAL.MAX_AGGR_PERIODS=1000`** 期間を超える場合、または (2) エンティティ/属性全体の**ページ合計**期間が **`TEMPORAL.MAX_AGGR_PERIODS_TOTAL=20000`**(`DEFAULT_LIMIT × MAX_AGGR_PERIODS`)を超える場合、**`403 TooManyResults`** で拒否します。**`timerel=between` かつ `timeproperty` が省略/`observedAt`** の場合、属性ごとの上限も DB 前に `floor(window/duration)+1` で確認されます。データ駆動型の `$group` プローブは、非ゼロ期間(`between` を含む)で常に実行され、属性ごとの最大値とページ合計の両方をチェックします。回避策: `attrs` で絞り込む、`limit` を減らす、`aggrPeriodDuration` を長くする、または `offset` でシフトする。MongoDB `$group` のプローブ自体のコストは変わりません(フォローアップ #2556)。正当な上限超過パスでは 2 回スキャンする可能性があります(`maxTimeMS` バジェット ×2)。`PT0S` / 省略された期間は単一期間のままです(#2109)。`Link` の `total` パラメータと `NGSILD-Results-Count`(`count=true` の場合)の両方が、ページ長ではなく**マッチした総エンティティ数**を報告します(clause 6.3.13)。**`aggrMethods` なしの単一エンティティ GET**(`GET /temporal/entities/{id}`)および**属性削除**(`DELETE /temporal/entities/{id}/attrs/{attr}`)には、スパン制限は適用**されません**(#2310 / #2312)。日付の妥当性、`timerel`/`timeAt` のペアリング、および `endTimeAt > timeAt` は削除時にも適用されます。

```bash
# Retrieve the latest 10 temporal data instances
curl "http://localhost:3000/ngsi-ld/v1/temporal/entities/urn:ngsi-ld:Sensor:001?lastN=10" \
  -H "Fiware-Service: myservice"
```

#### ページネーション `Link`(`rel="next"` / `"prev"`

、clause 6.3.10)

リスト操作 (`GET /entities`、`GET /temporal/entities`、`POST /entityOperations/query`、`POST /temporal/entityOperations/query`、およびその他の NGSI-LD コレクション) は、次/前ページポインタを RFC 8288 link-values としてシリアライズします。各ページネーション link-value には、元のリクエストから得られたメディアタイプ (ネゴシエートされた `Content-Type`) に**正確に**設定された `type` が含まれます。JSON-LD `@context` リンクは異なる契約であり、`type="application/ld+json"` を保持します。

```http
Link: <http://localhost:3000/ngsi-ld/v1/temporal/entities?limit=2&offset=2>; rel="next"; type="application/ld+json"
```

#### 部分コンテンツ (`206`) と `

Content-Range` (条項 6.3.10)

**2 つのレイヤー (混同しないこと):**


1. **ETSI GS CIM 009 V1.9.1 条項 6.3.10** — 実装は、完全な時間的表現を一度に返せない場合、`206 Partial Content` を使用**しなければなりません** (shall)。そこでの `lastN` の文言は、そのケース (「この場合」) におけるページネーション**方向**であり、無条件の「`lastN` が存在 → 206」というルールではありません。
   
2. **GeonicDB A1 (#2343)** — このContext Brokerは、クライアントが `lastN` を渡した場合、**または**デフォルトの属性ごとの上限が実際に履歴を切り詰めた場合 (`lastN` がデフォルトの 10 になる場合) に、`Content-Range` 付きの `206` を返します。どちらも真でない場合、応答は `Content-Range` なしの `200 OK` です。空の結果と集約された表現 (`aggrMethods`) は、`lastN` が設定されていても `200` のままです。これは、`Content-Range` を構築するためのインスタンスタイムスタンプが存在しないためです。

**再現 (A1、切り詰めなし):** 属性ごとに 10 個未満のインスタンスを持つ時間的エンティティを作成し、`GET /temporal/entities/{id}?lastN=10` を実行します。GeonicDB は、保存されたすべてのインスタンスが応答に収まっているにもかかわらず、`lastN` が存在していたため、`Content-Range` 付きの **`206`** で応答します。条項 6.3.10 のみでは、ここでは `200` も許可されます (完全な表現が一度に返される)。

> **ETSI スイート注記 (#2506):** ピン `334dd6d0` において、スイートはこの選択について矛盾しています:`020_05_02` (lastN が存在、切り詰めなし → **200** を期待) 対 `020_13_02` (lastN が存在、切り詰めなし → **206** を期待)。GeonicDB は A1 を維持し (そのピンに対してスコア最適)、争点のあるケースを `geolonia/geonicdb-compliance` の `triage.json` に `spec-ambiguous` として記録します。アップストリーム:[ngsi-ld-test-suite#106](https://forge.etsi.org/rep/cim/ngsi-ld-test-suite/-/work_items/106)。

時間的読み取り — `GET /temporal/entities`、`GET /temporal/entities/{entityId}` および `POST /temporal/entityOperations/query` — は、上記の A1 ルールを適用します。

```http
HTTP/1.1 206 Partial Content
Content-Range: date-time 2020-01-01T01:00:00.000Z-2020-01-01T04:00:00.000Z/*
```

ヘッダー内のタイムスタンプは、`timeproperty` によって選択された時間的プロパティ (デフォルトは `observedAt`) から取得されます。したがって、`timeproperty=createdAt` クエリは、`observedAt` ではなく `createdAt` の境界を報告します (#2267)。

値は `date-time <range-start>-<range-end>/<size>` です:

| Request                                   | range-start                                                                                                   | range-end                              | size                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------------------- |
| `lastN` present (paginates **backwards**) | `timeAt` for `timerel=before`, `endTimeAt` for `between`, otherwise the most recent timestamp in the response | least recent timestamp in the response | the requested `lastN` |
| `lastN` absent (paginates **forwards**)   | `timeAt` for `timerel=after` / `between`, otherwise the least recent timestamp in the response                | most recent timestamp in the response  | `*`                   |

`200` は、`Content-Range` を導出できない場合にも返されます:応答がインスタンスをまったく持たない場合、または**集約された**表現 (`aggrMethods`、条項 4.5.19) であり、インスタンスタイムスタンプではなく集約値を報告する場合です。

`206` は成功ステータスであるため、`fetch` の `response.ok` と axios のデフォルトの 2xx 検証は変更なく機能し続けます。`status === 200` を比較するクライアントは更新する必要があります。

> `unit` トークンは `date-time` です。条項 6.3.10 の文章では `DateTime` と綴られていますが、ETSI 適合性スイート (`020_13` / `021_15` / `021_16`) は大文字小文字を区別する比較で `date-time` をアサートしており、適合性を決定するのはスイートです。

#### 時間的応答フォーマットオプション

`options=temporalValues` (または `options=simplified`) を指定すると、各属性が `values` 配列 (`[value, timestamp]` のペア) を持つ簡略化されたフォーマットで返されます。

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

#### システム時間的属性 (`options=sysAttrs`

)

ETSI GS CIM 009 条項 6.3.11 は、`/temporal/entities/` および**そのすべてのサブリソース**、ならびに条項 5.7.4 の POST クエリにおいて、`options=sysAttrs` のサポートを要求しています。要求された場合、**正規化された**表現の各属性インスタンスは、システム生成の時間的属性 `createdAt` / `modifiedAt` (および時間的 TTL が設定されている場合は `expiresAt`) を持ちます:

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

Context Brokerが保持していない値は単に省略されます — 条項 6.3.11 では *"実装はシステム生成の時間属性を保持していない場合、エラーを発生させてはならない"* と述べられています。同じ理由で、`sysAttrs` は簡略化表現(`temporalValues`、条項 4.5.9 の `[value, timestamp]` ペア)および集約表現(条項 4.5.19)では **受け入れられ、無視されます**(決して `400` にはなりません)。これらの表現には構造上、システム属性を運ぶ場所がありません。

#### 時間レスポンスにおける名前の短縮 (#1975 / #1788)

時間レスポンスにおける **属性名とエンティティ `type` の両方** は、*そのリクエスト* で提供された `@context` で短縮されます(ETSI GS CIM 009 条項 5.5.7 / 5.5.5)。属性名は #1975 以降短縮されています。エンティティ `type` は #1788 のサブ項目 2 まで保存された(完全修飾)形式で返されていました — 書き込みは `normalizeTypeName` で正規化されるため、書き込み時に使用された短縮名が読み取り時に返される短縮名となり、同じ短縮名が `?type=` で一致します。

リクエストが `@context` を提供しない場合(またはコアコンテキストのみの場合)、短縮先がないため、名前は完全修飾 URI としてレンダリングされます — これは条項 5.5.7 のフォールバックであり、欠陥ではありません。#1975 以前に書き込まれた属性名(レガシー、逐語的ストレージ)は、保存されたまま返されます。なぜなら、それらが書き込まれた際の `@context` は記録されていないからです。

#### `observedAt` 表現の忠実性 (#2271)

`observedAt` は **クライアントが書き込み時に提供した文字列表現と正確に同じもの** で返されます。ETSI GS CIM 009 条項 4.6.3 は、DateTime の小数秒コンポーネントを *オプション* としているため、`2020-09-01T12:03:00Z` と `2020-09-01T12:03:00.000Z` は同じ瞬間を表す有効な表現であり、仕様は正規形式を指定していません。したがって、GeonicDB は一方を他方に正規化しません: `...:00Z` と書き込めば `...:00Z` を読み戻し、`...:00.123456Z` と書き込めば 6 桁の小数すべてを読み戻します。

時間ベースのフィルタリング(`timerel` / `timeAt` / `endTimeAt`)、順序付け、および `lastN` は、瞬間が BSON の `Date` として保存されるため、ミリ秒精度で動作することに注意してください。*表現* のみが元の精度を保持します。#2271 以前に書き込まれたインスタンスは、元の表現が記録されていないため、正規の `...ss.sssZ` 形式で返されます。

#### スコープの時間的進化 (#2434)

`scope` エンティティメンバー(条項 4.18 — 単一値は `string`、複数値は JSON 配列)は時間コレクションにも永続化されるため、エンティティのスコープの進化を Temporal API 経由で取得できます。


* **`scope` を伴う時間作成 / 属性追加**(`POST /temporal/entities`、`POST /temporal/entities/{id}/attrs`)は、スコープを **`value` がスコープ配列である単一の `Property` インスタンス** として保存します(条項 4.5.7 EXAMPLE)。`observedAt` は書き込み時刻です — スコープは時点でのメンバーシップであり、観測の系列ではないため、クライアントの `observedAt` は期待されません。`scope: null` / `scope: []` を送信すると何も記録されません。
  
* **`DELETE /entities/{id}/attrs/scope`(条項 5.6.5)** も **削除インスタンス**(トゥームストーン)を記録します: `value: []` と `deletedAt` が設定された `Property` です(条項 4.5.7)。他の削除インスタンスと同様に、正規化された表現では **`observedAt` が省略されます**(時間参照は `deletedAt` 自体です) — ETSI `020_19` と一致します。`temporalValues` 形式では、ペアは `[[], <deletedAt>]` です(ETSI `020_20`)。
  
* **`timeproperty=deletedAt`** は `deletedAt` を持つインスタンスのみを返します(上記の `timeproperty` 行を参照)。したがって、削除されたスコープは **トゥームストーンのみ** の結果となります: `scope` は `value: []` と `deletedAt` を保持し、生存している属性(`fuelLevel` など)は `deletedAt` を伝えないため除外されます。
  
* **現在エンティティの実体化(GeonicDB 拡張、A'-1)** — 本体に `scope` を含む時間作成は、現在エンティティの `create-if-absent` を試みます(`GET /entities/{id}` と `DELETE /entities/{id}/attrs/scope` が直後に動作するように)。エンティティは **`scope` メンバーのみ** で作成されます(他の属性はありません)。エンティティが既に存在する場合は手を付けずに残されます(`AlreadyExists` は静かにスキップされます)。他の実体化の失敗は **書き込みを失敗させます** — 単一作成は時間履歴を書き込まずに 4xx/5xx を返します。バッチ作成 / アップサートおよび MCP の `batch_create` / `batch_upsert` は、失敗したエンティティを `207` の `errors[]` にマップし、そのエンティティの時間書き込みをスキップします(他のエンティティは続行)。実体化失敗の静かなスキップは拒否されます(#2434 セキュリティレビュー): そうしないと時間履歴だけが残り、後の再 POST が時間的な `AlreadyExists` に遭遇し、リトライが永久にブロックされます。`scope` を **含まない** 時間作成は現在エンティティを実体化 **しません**。HTTP の by-id / バッチ作成 / バッチアップサートおよび MCP の create / `batch_create` / `batch_upsert` に適用されます(#2434 / #2758 / #2796 / #2814)。

#### 時間集約クエリ(単一エンティティ)

集約クエリは、`aggrMethods` および `aggrPeriodDuration` クエリパラメータを使用して、時間エンティティ GET エンドポイントで実行できます。リスト取得エンドポイントと単一エンティティ取得エンドポイントの両方で利用可能です。
`options` または `format` 経由で集約表現をリクエストするには、`options=aggregatedValues` または `format=aggregatedValues` を `aggrMethods` と一緒に指定します。

> **GeonicDB 拡張(後方互換性)**: ETSI は `aggrMethods` が *"`aggregatedValues` が `format` または `options` パラメータに存在する場合のみ適用可能"* と述べていますが、それらなしで提供された場合に何が起こるかは定義していません。GeonicDB は従来の動作を維持しています: **`format` も `options` も表現キーワードを含まない場合、`aggrMethods` の存在は `aggregatedValues` を暗示します**。いずれかのパラメータが表現キーワードを含むとすぐに、解決された表現のみがレスポンスを駆動します — したがって、`format=temporalValues&options=aggregatedValues&aggrMethods=sum` は集約ではなく、*簡略化* 時間表現を返します(ETSI テスト `021_19_02`)。

> **`POST /temporal/entityOperations/query` も集約します(#1816)**: 条項 6.24.3.1 では、この操作が *"条項 6.18.3.2 のものを反映している"*(GET 形式)と述べられているため、同じパラメータと同じ検証で集約がサポートされます。パラメータの仕様定義の場所は、リクエスト本体の `temporalQ` オブジェクト(`aggrMethods` / `aggrPeriodDuration`、表 5.2.21-1)です。クエリ文字列もフォールバックとして受け入れられます(公式 CLI が送信する形式、geolonia/geonicdb-cli#188)。本体が優先されます。#2030 がここで出力していた `NGSILD-Warning`(warn-code 199)は削除されました — リクエストはもはや無視されません。

| Parameter            | Type   | Description                                                                                                                                                                                                                                                                                                                                                       |
| -------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aggrMethods`        | string | Aggregation methods (comma-separated): `totalCount`, `distinctCount`, `sum`, `avg`, `min`, `max`, `stddev`, `sumsq`                                                                                                                                                                                                                                               |
| `aggrPeriodDuration` | string | ISO 8601 duration (e.g., `PT1H` for 1 hour). Optional (Table 5.2.21-1 cardinality 0..1). When omitted it defaults to `PT0S`, which is interpreted as a single period spanning the whole time range of the query. For a non-zero duration the first period starts at the attribute's **earliest observation**, not a calendar boundary (clause 4.5.19 / #2271 (d)) |

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

この形状は ETSI GS CIM 009 clause 4.5.19.0 に従います:**要求された集約メソッドごとに 1 つのメンバーがあり、メソッド名でキー指定されます**。その値は期間ごとに 1 つの要素を持つ配列であり、**各期間は正確に 3 つの要素の配列**です — 集約された値、開始 `DateTime`、終了 `DateTime`。複数のメソッドを要求する (`aggrMethods=avg,max`) と、それぞれ 1 つのメンバーが生成されます:

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

> **BREAKING (#1815)**:この変更以前、GeonicDB は独自の形状 (`{"values": [{"@value": {"avg": 21.0}, "observedAt": ..., "endAt": ...}]}`) を返していました。`values[].@value` を解析していたクライアントは、上記のメソッドキー指定されたメンバーに切り替える必要があります。
>
> **注意**: `aggrPeriodDuration` はオプションです。これを省略する(または `PT0S` / `P0D` を渡す)と、ETSI GS CIM 009 Table 5.2.21-1 および clause 4.5.19.1 に従い、クエリの時間範囲全体が単一の期間として集約されます。
>
> **注意**: `aggrMethods` なしで `aggregatedValues` を指定する(`options=aggregatedValues` または `format=aggregatedValues`)と、`400 Bad Request` エラーが返されます。

> **注意**:集約クエリは **暗号化されたテナントではサポートされていません**(`encryptionEnabled: true` のテナント)。属性値は保存時に暗号化されているため、MongoDB 集約パイプラインは暗号化されたデータに対して数値演算を実行できません。暗号化されたテナントで集約を要求すると `400 Bad Request` が返されます。`temporalValues` エンドポイントを使用して復号化された値を取得し、アプリケーション層で集約を実行してください。

***

### エンティティ型操作 (NGSI-LD)

#### 型リストの取得

> **ETSI GS CIM 009 リファレンス**: clause 5.7.4 - Retrieve Available Entity Types

```http
GET /ngsi-ld/v1/types
```

**パラメーター**: `limit`, `offset`, `details`

`details` を指定しない場合、レスポンスは生の配列ではなく **`EntityTypeList` オブジェクト** (ETSI OpenAPI v1.8.1) です:

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

> **破壊的変更 (#1694)**: 従来は `details` 未指定でも上記の詳細配列を返していましたが、ETSI OpenAPI v1.8.1 準拠のため `details` 未指定時のレスポンスを `EntityTypeList` オブジェクトに変更しました。配列形式が必要なクライアントは `details=true` を指定してください。

> **名前の compaction (#1977) と `id` の FQN 化 (#1989)**: `typeList` の型名、および `details=true` 時の `typeName` / `attributeNames` は、**そのリクエストが渡した `@context`**(`Link` ヘッダー)を基準に compact して返されます (ETSI GS CIM 009 clause 5.5.7 / 5.7.5)。`id` は compact されず**保存名から復元した FQN**を返します — Table 5.2.25-1 が `id` を "Fully Qualified Name (FQN) of the entity type being described"、`typeName` を "short name if contained in @context" と**別の値**として定義しているためです(例: `@context` 無しで型 `Room` の `id` は `https://uri.etsi.org/ngsi-ld/default-context/Room`。`location` / `value` 等の core 組み込み語彙は `@vocab` ではなく `https://uri.etsi.org/ngsi-ld/<名前>` へ展開されます)。
>
> **既知の制限 (#1975 で部分解消)**: temporal コレクション由来の属性名のうち、**#1975 で canonical 保存されたもの**([Temporal API](#temporal-api-time-series-data) 参照)はここでも応答 `@context` で compact され、`id` も FQN へ復元されます。それ以前 (移行前) に verbatim 保存された属性名は、書き込み時の `@context` を保存していないため compact / FQN 化されず、保存形のまま返ります。

**ヘッダー**: 総件数は `NGSILD-Results-Count` で返されます (`count=true` の場合)

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

> **名前の compaction (#1977) と `id` の FQN 化 (#1989)**: `typeName` と `attributeDetails[].attributeName` は、**そのリクエストが渡した `@context`**(`Link` ヘッダー)を基準に compact して返されます (ETSI GS CIM 009 clause 5.5.7 / 5.7.6)。`id` / `attributeDetails[].id` は compact されず**保存名から復元した FQN**を返します — Table 5.2.26-1 / 5.2.28-1 が `id` を FQN("Full URI of attribute name")、`typeName` / `attributeName` を短縮名と**別の値**として定義しているためです(例: `@context` 無しで型 `Room` の `id` は `https://uri.etsi.org/ngsi-ld/default-context/Room`、属性 `temperature` の `id` は `https://uri.etsi.org/ngsi-ld/default-context/temperature`)。`attributeDetails[].attributeName` は #1977 で追加したフィールドです(Table 5.2.26-1 は要素を `id` / `type` / `attributeName` / `attributeTypes` と定めています)。
>
> **既知の制限 (#1975 で部分解消)**: temporal コレクション由来の属性名のうち、**#1975 で canonical 保存されたもの**([Temporal API](#temporal-api-time-series-data) 参照)はここでも応答 `@context` で compact され、`id` も FQN へ復元されます。それ以前 (移行前) に verbatim 保存された属性名は、書き込み時の `@context` を保存していないため compact / FQN 化されず、保存形のまま返ります。
>
> **パス型名の解決 (#1736)**: `{typeName}` はリクエスト `@context`(`Link` ヘッダー)を基準に保存形 (canonical) へ解決してから照合されます (ETSI GS CIM 009 clause 5.5.7)。作成に使ったのと同じ `@context` の同じ短縮名を渡せば、保存形が FQN であっても一致します(一覧の `?type=` と同じ規律)。

**エラー**: 404 (型が存在しない場合)

### 属性操作 (NGSI-LD)

#### 属性リストの取得

> **ETSI GS CIM 009 Reference**: clause 5.7.6 - Retrieve Available Attributes

```http
GET /ngsi-ld/v1/attributes
```

**パラメータ**: `limit`, `offset`, `details`

`details` を指定しない場合、レスポンスは素の配列ではなく **`AttributeList` オブジェクト** (ETSI OpenAPI v1.8.1) になります:

**レスポンス** (200, `details` 未指定):

```json
{
  "id": "urn:ngsi-ld:AttributeList:98fj3k2-b1c4-...",
  "type": "AttributeList",
  "attributeList": ["temperature", "pressure"],
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.9.jsonld"
}
```

`details=true` (または `options=details`) を指定した場合、代わりに `Attribute` オブジェクトの配列が返されます:

**レスポンス** (200, `details=true`):

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

**ヘッダー**: 合計カウントは `NGSILD-Results-Count` で返されます (`count=true` の場合)

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
>
> **属性の同一性 (#2002)**: `{attrName}` はリクエスト `@context` を基準に FQN へ展開し、**その FQN と一致する保存属性のみ**が集計されます (ETSI GS CIM 009 clause 5.5.7 / Table 5.2.28-1)。同じ保存名(例: `temperature`)を持ちながら別の `@context` で書かれ別の FQN を持つ属性が同居していても、**書き込み時 `@context` を解決できる限り**混同されません(解決できない場合の例外は直下の #2070 を参照)。FQN 一致が無い場合のみ保存名の候補一致にフォールバックします(純 legacy テナントとの後方互換)。
>
> **到達不能な書き込み時 `@context` の扱い (#2070)**: 書き込み時 `@context` の解決は fail-soft(解決に失敗すると保存名をそのまま FQN とみなす)なので、解決の成否を区別しないと「本当に FQN が一致した」ものと「たまたま保存名が要求綴りと文字列一致しただけ」のものを取り違えます。`@context` を解決できなかった保存属性は、FQN 一致・候補名一致どちらの all-or-nothing 判定の母数にも含めず、**モードに関わらず常に候補名一致で集計へ merge**されます。これにより、同じ応答に確定した FQN 一致が別の保存属性で 1 件でもあるだけで、外部 `@context` が一時的に到達不能な寄与源が集計から丸ごと落ちる、という silent under-count を防いでいます。
>
> **この規律にはトレードオフがあります。** `@context` を解決できない以上、その寄与源が要求属性と同じ FQN へ展開されたのかは**決められません**(決めるための情報が存在しません)。したがって「解決できていれば**別の FQN** だった寄与源」も、保存名の綴りが要求名の候補と一致すれば merge されます。取れる選択は「常に merge する(一致したはずの寄与源を落とさない代わりに、別物だったはずが混ざる)」か「FQN モードでは除外する(別物だったはずを混ぜない代わりに、一致したはずを落とす = #2070 の症状そのもの)」の 2 つで、**どちらも到達性で応答が変わります**。GeonicDB は発見系の応答が「存在するものを列挙する」意味論であることから、取りこぼしを避ける前者を採っています。この境界の実挙動は `tests/e2e/features/ngsi-ld/attr-discovery-etsi-compliance.feature` の `@issue-2070-tradeoff` シナリオが両方向とも固定しています。
>
> **registration 側も同じ規律 (#2063)**: 応答の `typeNames` / `attributeTypes` には Context Source Registration 由来の寄与も含まれますが、こちらも同じ FQN の同一性で照合されます。registration の `propertyNames` / `relationshipNames` は verbatim 保存 + 登録時 `@context`(#1890)なので、**その登録の `@context` で展開した FQN** が要求 FQN と一致するものだけが寄与します。同じ綴りを宣言していても別 FQN へ展開される registration は混入せず、逆に**別の綴り(別 `@context` の別名)でも同じ FQN へ展開されれば寄与します**。FQN 一致が 1 件も無い場合のみ候補名一致へフォールバックします(ローカル属性側と同じフォールバック規律)。registration の `@context` を解決できない場合の扱いも、直上の「到達不能な書き込み時 `@context` の扱い (#2070)」とローカル属性側と同一です — 判定母数から外し、候補名一致で常に merge します。

**エラー**: 404(属性が存在しない場合)

***

### サブスクリプション (NGSI-LD)

> **ETSI GS CIM 009 リファレンス**: セクション 5.8 - サブスクリプション操作

#### サブスクリプションの作成

```http
POST /ngsi-ld/v1/subscriptions
Content-Type: application/ld+json
```

> **エンティティセレクターのワイルドカード**: `entities[].type` は `"*"` を受け入れ、**すべての**エンティティタイプの通知をリクエストします (ETSI GS CIM 009 表 5.2.33-1、#2102)。完全一致の文字列 `"*"` のみがワイルドカードです。他のセレクターフィールド (`id` / `idPattern` / `typePattern`) は引き続き適用されます (AND)。
> 同じワイルドカードセマンティクスは `/ngsi-ld/v1/csourceSubscriptions` にも適用されます。その `entities` は同じ `EntitySelector` です (csource サブスクリプションは `Subscription` タイプを再利用します、表 5.2.12-1; 条項 5.12 はサブスクリプション側の `EntitySelector` と登録側の `EntityInfo` を区別します; #2149) — `type: "*"` を持つ csource サブスクリプションは、宣言されたあらゆるタイプの登録変更で発火し、その `typePattern` は引き続き AND で絞り込みます。
>
> **エンティティセレクタータイプのバリデーション (#2158 / #2171)**: `entities[].type` は**条項 4.17 に従った有効なタイプ選択文字列**でなければなりません — 下記を参照 — または完全一致のワイルドカード `"*"` です。
> `"**"`, `" *"` または `"*Sensor"` のような値は `400 BadRequestData` で拒否されます。これらは有効な選択文字列でもワイルドカードでもなく、#2158 以前は受け入れられて、発火しないサブスクリプションとして保存されていました。同じルールが `/ngsi-ld/v1/csourceSubscriptions` にも適用されます (共有セレクタースキーマ)。NGSIv2 サブスクリプションセレクターは、より厳格な v2 タイプ文字セットでバリデーションされます (#2124)。
>
> **エンティティタイプ選択言語 (条項 4.17、#2171)**: 表 5.2.33-1 は「条項 4.17 に従った有効なタイプ選択文字列」を参照しています。これは単一のタイプ名ではなく、選言/連言文法です:
>
> ```abnf
> EntityTypes  = OrEntityType *(orOp OrEntityType)
> OrEntityType = "(" EntityType *(";" EntityType) ")" / EntityType
> andOp = ";"    orOp = "|" / ","
> ```
>
> `Building|House` と `Building,House` は *Building **または** House* を意味します; `(Home;Vehicle)` は *Home **かつ** Vehicle* を意味します; `(Home;Vehicle)|Motorhome` は両方を組み合わせます。GeonicDB は選択文字列を解析し、書き込み時にリクエストの `@context` で**各終端**を正規化し、応答時にリクエストの `@context` で各終端を圧縮し (条項 5.5.7、したがって `GET` は書いた内容を返します)、サブスクリプションおよび csource-サブスクリプションマッチャーで式を評価します。
> GeonicDB エンティティは正確に 1 つのタイプを持つため、2 つの**異なる**タイプの連言は決して満たされません; したがって `(Home;Vehicle)|Motorhome` は `Motorhome` でのみ発火します。
>
> ABNF 外の形式は `400 BadRequestData` で拒否されます: 末尾または重複した演算子 (`Building|`, `Building,,House`)、不均衡またはネストされたグループ (`(Building`, `(Home;(A;B))`)、グループ外の `andOp` (`Building;House`)、および式に混在したワイルドカード (`*|Building`)。
>
> **絶対 IRI の曖昧性**: 条項 4.17 NOTE は `,` `;` `(` `)` が正当な URI 文字であり、短い名前を推奨するだけであることを指摘しています。GeonicDB はこれを**常に演算子を構造として読み取る**ことで解決します — したがって `, ; ( )` を含む絶対 IRI は、セレクター内の単一のエンティティタイプとして記述できません。#2171 以前は動作が分かれていました (`urn:a,urn:b` は単一のタイプとして受け入れられましたが、`urn:a|urn:b` は拒否されました); 仕様が推奨するように短い名前を使用してください。
>
> **認可は終端ごとに評価されます** (#2268): 選択文字列は XACML リクエストが構築される前にその終端に展開され、**すべての**終端が許可されなければなりません (all-Permit、バッチ操作 #1325 と同じ形式)。したがって、拒否されたタイプを選言に混在させても (`SecretType|PublicType`) `Deny(entityType == "SecretType")` ルールをバイパスすることはできません。同じ展開が、`entities` を省略した `PATCH` 本文で使用される保存値パス (#2005) と、サブスクリプション読み取りの編集 (#2140) にも適用されます — セレクターは、**すべての**終端が読み取り可能な場合にのみ編集を乗り越えます。
>
> **終端数の制限** (#2285): 単一のセレクターは最大で**50 個の異なるエンティティタイプ**を指定できます (`SECURITY.MAX_TYPE_SELECTION_TERMINALS`); それ以上は `400 BadRequestData` です。`type` の 256 文字制限 (`MAX_ENTITY_TYPE_LENGTH`) は独立してバインドされます — 短い名前の場合、終端数制限が 2 つのうち厳しい方になります (50 個の 2〜3 文字の終端が約 190 文字に収まります)、一方、長い名前の場合、文字制限が先に達します。この制限が存在するのは、#2268 以降、セレクターが**終端ごとに**1 つの認可ターゲットを生成し、それらのターゲットがポリシー決定の前、本文バリデーションの実行前に熱心に構築されるためです。セレクターが合計で `MAX_SUBSCRIPTION_ENTITIES x MAX_TYPE_SELECTION_TERMINALS` を超えるターゲットに展開されるリクエストは、同様に切り捨てではなく `400` で拒否されます — all-Permit 評価からターゲットを削除すると、それが緩くなります。この合計制限は NGSIv2 サブスクリプション (セレクターを全く展開しません) にも適用されるため、NGSIv2 API の `subject.entities` は現在 `MAX_SUBSCRIPTION_ENTITIES` に制限されています — 以前は制限がなく、受け入れ層と事前バリデーション認可層が一致しないままでした。
>
> **NGSIv2 サブスクリプションは除外されます**: 選択言語は NGSI-LD の概念であるため、NGSIv2 API を通じて作成されたサブスクリプションは完全一致タイプマッチングを保持します (`"*"` ワイルドカードと同じ非対称性、#2102)。
>
> `POST /ngsi-ld/v1/temporal/entityOperations/query` は**異なる**スキーマを使用しており、`*` を含む `entities[].type` は GeonicDB グロブとして解釈されます (これは異なるテスト済み機能です); そのパスはこのバリデーションの影響を受けません。
>
> **`notification.format`**: `normalized` (デフォルト) / `concise` / `keyValues`。`simplified` は `keyValues` の ETSI 同義語として受け入れられ (表 5.2.14.1-1、#2103)、取り込み時に `keyValues` に正規化されます (`GET` は `keyValues` を返します)。

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

NGSI-LD では、エンドポイント URI で `mqtt://` または `mqtts://` スキームを使用し、トピックをパスとして指定します。MQTT 固有の設定は `notifierInfo` で指定します。

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

**Web Push 通知の例 (#3014 — GeonicDB 拡張)**

HTTPS Push Service URL は URI スキームで HTTP コールバックと区別できないため、
`endpoint.webpush`(およびオプションの書き込み時 `protocol: "webpush"`)が Web Push 配信を選択します。
`uri` はブラウザの `PushSubscription.toJSON().endpoint` と等しくなります。GET レスポンスは
`endpoint.webpush` を返しますが、`protocol` は **省略** されます(MQTT と同じ)。`keys.auth` は `******` としてマスクされます;
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

> **`notification` は閉じた構造です (#2066)。** ETSI GS CIM 009 Table 5.2.14-1
> (NotificationParams) はそのメンバーを網羅的に列挙しており、NGSIv2 のみの
> `httpCustom` / `http` / `mqtt` は含まれていません(MQTT 配信は代わりに `notification.endpoint.uri` の `mqtt://` /
> `mqtts://` スキームで選択されます、上記参照)。GeonicDB は追加で
> `endpoint.webpush` / `endpoint.protocol` を文書化された拡張として受け入れます (#3014)。そのテーブル外の `notification` の他のメンバーは
> 作成時と `PATCH` 時の両方で `400 BadRequestData` を返します(これは
> `/ngsi-ld/v1/csourceSubscriptions` にも適用され、同じリクエストスキーマを再利用します)— 以前はそのような
> メンバーは Zod のデフォルト(strip)検証によって静かに取り除かれ、リクエストは
> `201` / `204` で成功しましたが、値は痕跡なく削除されていました。Subscription の **トップレベル**
> JSON-LD 語彙拡張は影響を受けません;閉じているのは `notification` のみです。
>
> `join` / `joinLevel` (Table 5.2.14.1-1) は **通知ペイロードに適用されます** (#2104):`inline`
> は各 Relationship のターゲットを `entity` / `entityList` メンバーとして埋め込み、`flat` はターゲットを
> 通知の `data` 配列に追加し、`@none`(デフォルト)は何も解決しません。`joinLevel` のデフォルトは `1`
> で、`join` と一緒にのみ意味を持ちます;最大値はクエリパラメータと同じ(`5`)ですが、
> **最大値を超えた値の処理は異なります**:クエリパラメータは `400` で拒否します
> (読み取りは要求された深さを尊重するか失敗します)が、`notification.joinLevel` は最大値に **クランプ** されます
> — サブスクリプションは長期間存在するリソースであり、通知時に拒否すると
> 作成時に受け入れられた値に対して配信が黙って削除されることになります。両方のメンバーは永続化され、`GET /subscriptions{,/{id}}` によって返されます — 設定されていないメンバーはデフォルト値で実体化されません。通知内のリンクされたエンティティは、**サブスクリプション
> 作成者の** 行レベル読み取り述語によってフィルタリングされます;その述語が決定できない場合、結合はゼロの
> リンクされたエンティティに解決され、通知は引き続き配信されます([AUTH.md](../reference/auth.md) を参照)。
> 出力専用メンバー(`status`、`timesSent`、`timesFailed`、`lastNotification`、`lastFailure`、
> `lastSuccess`)は、作成/更新時に提供されても clause 5.2.14.2 に従って **無視** されます
> ("implementations shall ignore them")— 決して拒否されません。クエリ/取得時には表現の一部として
> 生成されます(clause 5.2.14.2 "shall generate")— 特に
> `timesFailed` は常に存在します(失敗した配信がない場合は `0`;内部的にカウンターは
> `timesFailure` として保存され、出力時に ETSI 名にマッピングされます、#2103)。

**サブスクリプション拡張フィールド**

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

**通知 `@context`** (#1841 / #1788、ETSI GS CIM 009 clause 5.3.1 / 5.8.1.4 / 5.8.6)

*どの `@context` が使用されるか。* 異なる許容形式を持つ2つの別個のもの:

| Source                                                                     | Accepted shape                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `jsonldContext` (explicit)                                                 | **a single dereferenceable URI string only** — a non-URI string, an inline object or an array is rejected with `400 BadRequestData` at create/update time (the field is typed `z.string()`, and non-URI strings are rejected by an explicit absolute-IRI check)          |
| the subscription request `@context` (used when `jsonldContext` is omitted) | whatever a request `@context` may be: a URI, an **inline object**, or an **array** mixing both. A one-element URI array is folded to that URI (#2344). Other non-URI shapes are hosted as an `ImplicitlyCreated` `@context` and referenced by URL (#2250, clause 5.13.1) |
| neither present                                                            | the NGSI-LD core `@context` (clause 5.5.5)                                                                                                                                                                                                                               |

*GeonicDB がどのように配信するか。* GeonicDB 自身が付与するコンテキストは **厳密に1回** 配信されます — ボディと `Link` ヘッダの両方に同時に含まれることはありません。2つのソースがあると、受信者がアクティブな `@context` について意見が食い違う可能性があるためです:

| `notification.endpoint.accept`    | Delivery                                                                                                                   |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `application/ld+json`             | `@context` member in the notification body                                                                                 |
| `application/json` (default)      | `Link` header (`rel="http://www.w3.org/ns/json-ld#context"`)                                                               |
| `application/geo+json`            | `@context` member in the body; `Link` header instead when `receiverInfo` carries `Prefer: body=json` (clause 6.3.8, #1762) |
| MQTT endpoints                    | `@context` member in the body (MQTT has no headers)                                                                        |
| `httpCustom` (`payload` / `json`) | neither — the body is defined entirely by the user                                                                         |

**`accept: application/geo+json` (#1762)。** Clause 5.2.15 では3つの `accept` 値の1つとしてリストされ、clause 6.3.8 では通知バインディングでカバーされています。そのため、**ボディは GeoJSON としてレンダリング** されます(単にメディアタイプのラベルが付けられるだけではありません):通知されたエンティティが `features[]` である `FeatureCollection` で、`subscriptionId` / `notifiedAt` / `triggerReason` は RFC 7946 §6.1 の外部メンバーとして保持されます。Notification メンバーの `id` と `type: "Notification"` は省略されます(GeoJSON は `type` を予約しています)。また、`notification.format` は適用されません — `properties` は簡略化された値を運ぶため、`showChanges` の `previous*` メンバーはこの表現では利用できません。完全なペイロードについては [SUBSCRIPTIONS.md → GeoJSON notifications](../features/ngsi-subscriptions.md) を参照してください。

`Link` ヘッダが完全には運べない解決済み `@context`(インラインオブジェクト、または URL とインラインオブジェクトを混在させた配列 — どちらもリクエスト `@context` を通じてのみ到達可能)は、`application/json` の場合でもボディに配置されます:`Link` は URI のみを参照でき、URL 部分だけを出力するとインラインで定義された用語が黙って削除されてしまいます。

「厳密に1回」は **GeonicDB 自身のコンテキスト配信** を制約するものであり、通知全体を制約するものではありません:`notification.endpoint.receiverInfo` は独自の `Link` ヘッダを追加することができ、それは生成されたコンテキスト `Link` に追加されます(置き換えられることはありません)。したがって、ボディの `@context` とカスタム `Link` ヘッダは共存できます。

`data[]` 内の属性名は同じ `@context` でコンパクト化されます(clause 5.5.7)。そのため、通知とその `@context` で発行された `GET` は属性を同じようにスペルします。完全修飾 IRI として保存された名前はコンパクト化されます。そのまま保存された名前は変更されずに渡されます。

NGSIv2 サブスクリプションは `@context` メンバーまたは `Link` ヘッダを受け取りません。

**`q` / `geoQ` によるフィルタリング**

* `q` と `geoQ` は、通知をトリガーするエンティティ変更を制限します。評価は `GET /ngsi-ld/v1/entities` と同じ述語ビルダーで行われます
  
* `geoQ.coordinates` は文字列または GeoJSON 形式の配列を受け入れます。`LineString` / `Polygon` に使用されるネストされた形式を含みます。`geoQ.geoproperty` は GeoProperty を選択します(デフォルトは `location`)
  
* `EntityDeleted` 通知は `q` / `geoQ` でフィルタリングされません(エンティティはもう存在しないため、述語を評価できません)。完全なセマンティクスと制限については [SUBSCRIPTIONS.md](../features/ngsi-subscriptions.md) を参照してください

**検証**

* `watchedAttributes` と `timeInterval` は相互排他的です。両方を同時に指定すると `400 Bad Request` が返されます(ETSI GS CIM 009 V1.9.1 clause 5.8.1)
  
* `throttling` と `timeInterval` は相互排他的です(異なる動作モード)。両方を指定すると `400 Bad Request` が返されます(#1618)

**定期通知(`timeInterval`)** (#1764)


* `timeInterval` を持つサブスクリプションは、属性が変更されたかどうかに関わらず **定期的に** 通知されます(ETSI GS CIM 009 clause 5.8)。各通知は、**その時点で** サブスクリプションに一致するエンティティセットを運びます。
  
* このようなサブスクリプションは **定期専用** です:エンティティの変更はそれをトリガーしません。これが `watchedAttributes` と `timeInterval` が相互排他的である理由です。
  
* 最初の通知はサブスクリプションが作成されてから1 `timeInterval` 後に送信され、作成時には送信されません。
  
* `timeInterval` は永続化され、`GET /subscriptions/{id}` によって返されます。
  
* 各定期通知は最大 100 個のエンティティを運びます(`PERIODIC_NOTIFICATION.MAX_ENTITIES_PER_NOTIFICATION`)。定期通知にはクライアント指定の `limit` がないため、結果サイズはサーバー側で制限されます。
  
* **実行時の粒度は異なります。** スタンドアロンモードではスイープは毎秒実行されるため、短い間隔が守られます。AWS Lambda では、スイープは EventBridge Schedule によって駆動され、その **最小粒度は1分** であるため、60 未満の `timeInterval` は事実上そこでは 60 秒になります。
  
* 通知投影セレクタは **include** ファミリー(`notification.pick` / `notification.attributes` / `notification.attrs`)と **exclude** ファミリー(`notification.omit` / `notification.exceptAttrs`)に分かれます。各ファミリーごとに最大1つのセレクタを指定でき、include セレクタと exclude セレクタを組み合わせることはできません(`pick`/`omit` は ETSI GS CIM 009 clause 4.21 により相互排他的です)。違反すると `400 Bad Request` が返されます(#1627)
  
* `notification.pick` は内部 include 投影(= `attributes`/`attrs`)にマッピングされ、`notification.omit` は内部 exclude 投影(= `exceptAttrs`)にマッピングされます。両方とも実際に通知ペイロードに適用されます(#1627、#1618 で追加された一時的な `400` 拒否に取って代わります)
  
* `PATCH` での通知投影は JSON Merge Patch(RFC 7396 / ETSI GS CIM 009 clause 5.8.2)に従います:**省略** するとセレクタは既存の投影を保持し、**配列** を送信すると置き換えられ、**`null`** を送信する(例:`"pick": null` / `"omit": null` / `"exceptAttrs": null`)と投影がクリアされるため、通知は再びすべての属性を運びます。`null` は明確なシグナルであるため、include/exclude 排他性チェックから免除されます。したがって、`pick: null` を `omit` 値と組み合わせて、同じリクエストで include 投影をクリアし、exclude 投影を設定できます。空の配列 `[]` はクリアメカニズム **ではありません** — すべてのセレクタは空でない配列を必要とするため、クリアするには `null` を使用してください(#1635)
  
* `jsonldContext` は単一の参照解決可能な URI 文字列である必要があります(ETSI GS CIM 009 Table 5.2.12-1)。非 URI 文字列は `400 BadRequestData` を返します。参照解決の失敗(DNS/到達不可能なホスト)は `504 LdContextNotAvailable` を返します。SSRF ブロック対象の宛先は依然として `400 BadRequestData` を返します
  
* 無効な `q`(解析不可能な条件)と無効な `geoQ`(未知の `georel`、範囲外の座標、または `georel`/`geometry`/`coordinates` が一緒に指定されていない)は `400 Bad Request` を返します。以前はこれらは `201` で受け入れられてから無視されていました

**レスポンス**

* ステータス:`201 Created`
  
* ヘッダー:`Location: /ngsi-ld/v1/subscriptions/{subscriptionId}`

#### サブスクリプションリスト

```http
GET /ngsi-ld/v1/subscriptions
```

**クエリパラメータ**

| Parameter | Type    | Description                   | Default |
| --------- | ------- | ----------------------------- | ------- |
| `limit`   | integer | Number of results to retrieve | 20      |
| `offset`  | integer | Offset                        | 0       |

> **行レベル読み取り認可 (#2140):** 行レベル読み取り述語 (カスタム XACML ポリシー) によって制限されたサブジェクトの場合、サブスクリプション読み取り (`GET /ngsi-ld/v1/subscriptions(/{subscriptionId})`、`GET /ngsi-ld/v1/csourceSubscriptions(/{subscriptionId})`) は `entities` から読み取り不可能な具体的な型セレクタを編集し、読み取り不可能な型のみを監視するサブスクリプションを非表示にし (リストからの省略 / ID による読み取りでは `404`)、編集後に `count` / ページネーションを計算します — これは CSR 読み取り (#2084) と同じルールです。型に依存しないサブスクリプション (`watchedAttributes` のみ、`type: "*"`、`id`/`idPattern`/`typePattern` のみのセレクタ) は影響を受けません。制限のないサブジェクトには変更はありません。[AUTH.md](../reference/auth.md) を参照してください (#2140)。

#### サブスクリプションの取得

```http
GET /ngsi-ld/v1/subscriptions/{subscriptionId}
```

**通知ステータスフィールド (読み取り専用)**

| Field                            | Type    | Description                                                                                                         |
| -------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| `notification.status`            | string  | `ok` or `failed`                                                                                                    |
| `notification.lastNotification`  | string  | Date and time of last notification sent (ISO 8601)                                                                  |
| `notification.lastFailure`       | string  | Date and time of last notification failure (ISO 8601)                                                               |
| `notification.lastFailureReason` | string  | Reason for the last failure (e.g., `HTTP 500: Internal Server Error`). Cleared on success                           |
| `notification.lastSuccess`       | string  | Date and time of last successful notification (ISO 8601)                                                            |
| `notification.timesSent`         | integer | Number of notifications sent                                                                                        |
| `notification.timesFailed`       | integer | Number of failed notification deliveries; always generated, `0` when there are no failures (clause 5.2.14.2, #2103) |

> **エンティティセレクタは保存された形式でラウンドトリップします (#2067)。** `GET` は各 `entities[]` 要素を実際に保存されたセレクタ — `id` / `idPattern` / `type` / `typePattern` — を使用して返します。`typePattern` を `type` に折りたたんだり、型セレクタが指定されていない場合に `type: "*"` を作成したりする代わりにです。取得した本文を再度 `POST` すると、元のセレクタが再現されます。以前は `^Sensor` のような `typePattern` は `type: "^Sensor"` としてレンダリングされていたため、レスポンスを再生するとパターンセレクタの代わりにリテラル型名が作成されました (`typePattern` は **GeonicDB 拡張機能** です — [SUBSCRIPTIONS.md → Entity Specification](../features/ngsi-subscriptions.md#entity-specification) を参照してください)。同じ修正により、値が保存されていない場合、`notification.endpoint.accept` / `receiverInfo` を `null` としてレンダリングするのではなく、レスポンスから省略します — `PATCH` で逐語的に送り返された保存済みの `null` は、以前は `400` で失敗していました。これは `accept` が列挙値のいずれか、または不在のみを受け入れ、`null` は受け入れないためです。

**リトライ動作**: 通知配信が失敗した場合、一時的なエラー (5xx、429、ネットワークエラー) に対して指数バックオフ (1 秒、2 秒、4 秒) で最大 3 回のリトライが実行されます。ほとんどの 4xx エラーではリトライは実行されません (408/429 は一時的なものとして扱われます)。一時的な障害が `NOTIFICATION_AUTO_PAUSE_AFTER_MS` (デフォルト 1 時間) の間、配信成功なしに続く場合、Context Brokerはサブスクリプションを `inactive` に設定し、`autoDisabledAt` を記録し、マッチング/エンキューを停止し、現在の SQS メッセージを消費します (#3080)。`PATCH { "isActive": true }` で再開してください。

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

#### 所有権検証 (GeonicDB 拡張機能)

認証が有効な場合 (デフォルト)、サブスクリプションの更新 (PATCH) および削除 (DELETE) 操作は `createdBy` フィールドに基づいて所有権検証を実行します。作成者以外のユーザーがこれらの操作を試みると、`404 Not Found` を受け取ります (サブスクリプションが全く存在しない場合と同様であるため、外部からは違いを観察できません)。`createdBy` が **ない** サブスクリプション (そのフィールドが存在する前に作成されたもの) も、管理者以外には `404 Not Found` を返します (#2161)。`super_admin` および `tenant_admin` ロールはこの検証をバイパスできます。詳細については、[AUTH.md](../reference/auth.md) を参照してください。

***

### 登録 (NGSI-LD)

NGSI-LD では、外部コンテキストプロバイダーは Context Source Registrations として登録されます。

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

**リクエストフィールド**

| Field                 | Type                | Required | Description                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------- | ------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                  | string (URI)        | -        | Client-settable registration identifier. If provided it is used as-is; re-registering an existing `id` returns `409 Conflict`. If omitted, the server generates a `urn:ngsi-ld:ContextSourceRegistration:{uuid}`.                                                                                                                                                                                |
| `type`                | string              | ✓        | Fixed: `ContextSourceRegistration`                                                                                                                                                                                                                                                                                                                                                               |
| `registrationName`    | string              | -        | Registration name                                                                                                                                                                                                                                                                                                                                                                                |
| `description`         | string              | -        | Registration description                                                                                                                                                                                                                                                                                                                                                                         |
| `endpoint`            | string              | ✓        | Provider endpoint URL                                                                                                                                                                                                                                                                                                                                                                            |
| `information`         | array               | ✓        | Provided information (entities, propertyNames, relationshipNames)                                                                                                                                                                                                                                                                                                                                |
| `observationInterval` | object              | -        | Observation interval — `{ "startAt": ISO8601, "endAt"?: ISO8601 }` (ETSI GS CIM 009 clause 5.2.11). The legacy GeonicDB member names `start` / `end` are still accepted on write and normalized to `startAt` / `endAt`, but responses always use the spec names (#2274)                                                                                                                          |
| `managementInterval`  | object              | -        | Management interval — same shape as `observationInterval`                                                                                                                                                                                                                                                                                                                                        |
| `location`            | GeoJSON             | -        | Geographic scope                                                                                                                                                                                                                                                                                                                                                                                 |
| `scope`               | string or string\[] | -        | Registration scope hierarchy (ETSI GS CIM 009 Table 5.2.9-1 / clause 4.18). Single value is returned as a string; multiple values as a JSON array. Sending `scope: null` or `scope: []` explicitly unsets the scope (**GeonicDB extension**, same as entities)                                                                                                                                   |
| `expiresAt`           | string              | -        | Expiration time (ISO 8601 format)                                                                                                                                                                                                                                                                                                                                                                |
| `status`              | string              | -        | **GeonicDB extension.** Lifecycle flag (`active` / `inactive`); `inactive` registrations are excluded from federation forwarding and from type/attribute discovery. Defaults to `active`. Note that ETSI GS CIM 009 Table 5.2.9-2 reserves `status` for a read-only distributed-operation health value (`ok` / `failed`), so the response only carries this member when it is `inactive` (#2274) |
| `mode`                | string              | -        | Mode (`inclusive` / `exclusive` / `redirect` / `auxiliary`)                                                                                                                                                                                                                                                                                                                                      |
| `operations`          | string\[]           | -        | Supported API operations (ETSI GS CIM 009 clause 4.20). Any operation names are accepted, e.g. group names (`federationOps`) or individual operations (`retrieveEntity`, `createBatch`). When omitted it is stored/returned as absent and treated as the implicit default `federationOps` (the field is not materialized into the response).                                                     |

**レスポンス**

* ステータス: `201 Created`
  
* ヘッダー: `Location: /ngsi-ld/v1/csourceRegistrations/{registrationId}`
  
* ステータス: `409 Conflict` — クライアントが指定した同じ `id` を持つ登録が既に存在します

#### 登録リストの取得

```http
GET /ngsi-ld/v1/csourceRegistrations
```

**クエリパラメータ**

| Parameter                                             | Type    | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Default |
| ----------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `id`                                                  | string  | Comma-separated Context Source Registration ids (NGSI-LD URIs)                                                                                                                                                                                                                                                                                                                                                                                                                            | -       |
| `type`                                                | string  | Entity type selector. Expanded with the request `@context` before matching                                                                                                                                                                                                                                                                                                                                                                                                                | -       |
| `attrs`                                               | string  | Comma-separated attribute names (`propertyNames` / `relationshipNames`). Expanded with the request `@context` before matching                                                                                                                                                                                                                                                                                                                                                             | -       |
| `q`                                                   | string  | Simple property equality against Context Source Properties: `name==value` (quoted forms `name=="value"` / `name=='value'` are also accepted). Compound expressions — inequality operators (`!=`, `>`, …), `;` (AND), `\|` (OR), parentheses — are **not** supported and return `400 BadRequestData`, as do syntactically invalid values (clause 5.10.2.4). The property name must match `[A-Za-z_][\w]*` and the value is a single string / number literal (see the `q` note below) | -       |
| `georel` / `geometry` / `coordinates` / `geoproperty` | string  | NGSI-LD geoquery (clause 4.10). `georel`, `geometry` and `coordinates` must be supplied together; invalid values return `400 BadRequestData`                                                                                                                                                                                                                                                                                                                                              | -       |
| `scopeQ`                                              | string  | Scope query against the registration's `scope` member (clause 4.19 / 5.10.2). Same operators as entity `scopeQ` (`/#`, `/+`, `;` AND, `,`/`\|` OR). Requires another selector (`type`, `attrs`, `q`, geoquery, or `id`) — `scopeQ` alone is not sufficient (too-wide query)                                                                                                                                                                                                         | -       |
| `timerel` / `timeAt` / `endTimeAt` / `timeproperty`   | string  | NGSI-LD temporal query (clause 4.11). See the temporal scoping note below                                                                                                                                                                                                                                                                                                                                                                                                                 | -       |
| `options`                                             | string  | `sysAttrs` to include `createdAt` / `modifiedAt` in the response (clause 6.3.11)                                                                                                                                                                                                                                                                                                                                                                                                          | -       |
| `limit`                                               | integer | Number of results to retrieve                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 20      |
| `offset`                                              | integer | Offset                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 0       |
| `count`                                               | string  | `true` to return the total count in `NGSILD-Results-Count`                                                                                                                                                                                                                                                                                                                                                                                                                                | -       |

> **広すぎるクエリ (#2304 / #2442)。** ETSI GS CIM 009 clause 5.10.2.4 は、`id` / `type` / `attrs` / `q` / ジオクエリ (`georel` / `geometry` / `coordinates`) のいずれも指定されていない場合に `400 BadRequestData` を義務付けています。`limit` / `offset` / `count` / 時系列クエリ / `local=true` のみでは**不十分**です (Query Entities とは異なり、CSR ディスカバリーにはローカルスコープの免除がありません)。具体的な `id` リストは十分です (ETSI 037\_10\_01; 以前の #2304 の文言は `id` を不十分として扱っていましたが、#2442 で修正されました)。clause 5.7.2.4 とは異なり、`attrs` / `q` は非システム属性を必要と**しません**。
>
> **`q` は単純な等価性のみ (#2442 / #2627)。** CSR ディスカバリーでは、`q` 条件は **Context Source Properties** — 登録ドキュメントの追加のトップレベルメンバー — にマッチし、エンティティ属性にはマッチしません (ETSI GS CIM 009 clause 5.10.2.4: "the conditions specified by the context source query filter match the respective Context Source Properties")。単純な等価性形式 `name==value` のみが実装されています; 不等号演算子、`;` (AND)、`|` (OR)、および括弧で囲まれた複合式は `400 BadRequestData` で拒否されます — エントリ検証時に実行と同じ契約で行われるため、受け入れられた式が後で拒否されることはありません。これは意図的です: 固定された ETSI スイート (`334dd6d0`) の下では、CSR ディスカバリーは `q` を正確に 2 つのケースで演習します — `037_10_02` (`csourceProperty1=="aValue"`, 単純な等価性) と `037_03_02` (構文的に無効 → 400) — 両方ともパスします。完全な clause 4.9 文法は、エンティティ `q` 実装と同じコストがかかり、そのパーサーはエンティティストレージの形状 (`attributes.<name>.value` ドットパス、datasetId エイリアスセット) に結合されており、登録プロパティには転送されません。スイートが複合式を必要とする場合、または別の `csf` パラメータ (Table 6.8.3.2-1; ここでは未実装) が取り上げられる場合に再検討します。
>
> **`q` 値文法は狭い (#2442 / #2627)。** プロパティ名は `[A-Za-z_][\w]*` にマッチする必要があります (ASCII ワード文字のみ — `foo:bar`、ドット付き、ハイフン付き、Unicode またはその他の非 `\w` 名はマッチしません)。値は単一のスカラーです: 空白 / `()` / `;` / `|` / `&` を含まない引用符なしの連続、または引用符付き `"..."` / `'...'` 文字列。マッチングは文字列等価性です; 数値として字句解析される値は、数値として格納されたプロパティにもマッチします (`buildRegistrationPropertyQueryFilter` は `Number` 候補を追加します)。ブール値はリテラル文字列としてのみマッチします; オブジェクト / 配列 Context Source Properties はターゲットにできません。
>
> **空 / 空白のみの `q` は不在として扱われる (#2442 / #2304)。** `listRegistrations` は `q.trim().length > 0` の場合のみ `q` フィルターを構築するため、`q=` と空白のみを含む `q` の両方はセレクターではありません: `q=` 単独では `400 BadRequestData` を返します (広すぎるクエリ、clause 5.10.2.4 — セレクターが残っていない)、一方 `type=Building&q=` は `200` を返し、`type` フィルターのみを適用します。既存の E2E がこれを保護しています ("空 / 空白の type・attrs・q はセレクタとして数えない")。
>
> **ジオクエリ Polygon リング (#2442 / ETSI 037\_07\_02)。** `GET /csourceRegistrations` のみで、最初 / 最後の座標が異なる単一リング Polygon は、ジオフィルターが実行される前に閉じられたものとして扱われます (最初の頂点が追加されます)。エンティティ / サブスクリプションのジオクエリは依然として閉じられていないリングを `400 BadRequestData` で拒否します — この緩和は ETSI スイートペイロードにマッチするために CSR ディスカバリーにスコープされています。

> **時間的スコープ (#2274)。** clause 5.10.2.4 に従い、時間クエリが**ない**場合は `observationInterval` / `managementInterval` を**持たない**登録のみが考慮される。時間クエリがある場合は、関連する interval がクエリ期間と**重なる**登録のみが返される: `timeproperty=observedAt`(デフォルト)は `observationInterval` と照合され、`timeproperty=createdAt` / `modifiedAt` / `deletedAt` は `managementInterval` と照合される。関連する interval を持たない登録は決してマッチしない。interval の端点は inclusive であり、`endAt` がない場合は interval はオープンエンドである。
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

**応答例**

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

**応答**: `204 No Content`

> **部分更新 (#2442 / clause 5.5.8 / 5.9.3.4)。** ボディは Context Source Registration Fragment である: fragment で指定されたメンバーは更新または追加され、fragment から省略されたメンバーは保持される。Context Source Properties (Table 5.2.9-1 を超える追加のトップレベルメンバー) も同じルールに従う — `csourceProperty1` のみを送信する PATCH は他の保存されたプロパティを削除**しない**。`expiresAt` が正規の有効期限メンバーであり、レガシーエイリアス `expires` も作成/更新時に受け入れられる。

#### 登録の削除

```http
DELETE /ngsi-ld/v1/csourceRegistrations/{registrationId}
```

**応答**: `204 No Content`

#### 所有権検証 (GeonicDB 拡張)

認証が有効な場合 (デフォルト)、登録の更新 (PATCH) と削除 (DELETE) 操作は `createdBy` フィールドに基づく所有権検証を実行する。作成者以外のユーザーがこれらの操作を試みると `404 Not Found` を受け取る (登録が全く存在しない場合と同様であり、外部から違いは観測できない); `createdBy` を**持たない**登録 (そのフィールドが存在する前に作成された) も管理者以外には `404 Not Found` を返す (#2161)。`super_admin` および `tenant_admin` ロールはこの検証をバイパスできる。詳細は [AUTH.md](../reference/auth.md) を参照。

#### CSR 高度なフィールド (ETSI GS CIM 009 V1.9.1)

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

#### Context Broker識別情報の取得

```http
GET /ngsi-ld/v1/info/sourceIdentity
```

コンテキストブローカーの識別情報を返します。分散環境におけるContext Broker識別に使用されます。

**認証**: 必須(保護済み)。`sourceIdentity` はContext Brokerの `endpoint` URL とソフトウェアバージョンを公開するため、フィンガープリンティングを制限するために認証の背後に配置されています。

**レスポンス**: `200 OK` (`application/ld+json`)

`ContextSourceIdentity` (ETSI GS CIM 009 clause 5.2.40) を返します。必須メンバー:

| Member                | Type   | Description                                                                                                                                                                                                                                                                                                                                              |
| --------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contextSourceAlias`  | string | RFC 7230 pseudonym (token). GeonicDB returns the same pseudonym as its `Via` header (`BROKER_ID`) for loop identification (clause 6.3.18)                                                                                                                                                                                                                |
| `contextSourceUptime` | string | ISO 8601 duration. Calculated from deployment start time: `BROKER_START_TIME` is preferred; if missing/invalid/future, process start time is used                                                                                                                                                                                                        |
| `contextSourceTimeAt` | string | Current UTC DateTime in ISO 8601 format (millisecond precision, trailing `Z`)                                                                                                                                                                                                                                                                            |
| `contextSourceExtras` | object | **Implementation-specific configuration data** (`name` / `description` / `endpoint` / `supportedApi` / `supportedOperations` / `registrationMode` / `version`). Table 5.2.40-1 defines this member as "raw un-expandable JSON which shall not be interpreted as JSON-LD using the supplied @context" — the core `@context` declares it as `@type: @json` |

> **破壊的変更 (#1798)**: これらの実装固有のメンバーは以前は**トップレベル**で返されていました。現在は `contextSourceExtras` の下に配置されています。トップレベルは Table 5.2.40-1 のメンバーセットと完全に一致します。古い配置では、コア `@context` v1.9 の下でセマンティック的に誤ったトリプルが生成されていました — `endpoint` は `ngsi-ld:endpoint` (**CSourceRegistration** のエンドポイントを表す用語)に展開され、`description` は `dcterms:description` に展開されていました。

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

> **注記 (#1585)**: `GET /ngsi-ld/v1/info/conformance` エンドポイントは以前公開されていましたが、**削除されました**。ETSI GS CIM 009 (v1.8.1 / v1.9.1) は適合性クラスモデルや `/info/conformance` オペレーションを定義しておらず、規範的な `/info/*` リソースは `/info/sourceIdentity` のみです。このパスは現在、他の存在しない NGSI-LD リソースと同じように動作します:認証/認可されたリクエストは `404 Not Found` を受け取ります。`AUTH_ENABLED=true` でテナントに対する明示的な `role=anonymous` XACML Permit がない場合、未認証のリクエストはルーティング前に `403` で拒否されます(そのような Permit が存在する場合、ルーティングが続行され、削除されたパスは `404` を返します)。以前の公開された未認証の `200` レスポンスは廃止されました。適合性は [geonicdb-compliance](https://github.com/geolonia/geonicdb-compliance) における固定された ETSI Test Suite 測定値を介してアウトオブバンドで表明されており、Orion-LD / Stellio / Scorpio と同じ方法です。

#### 分散クエリパラメータ

| Parameter   | Type    | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `local`     | boolean | If `true`, **no Context Source Registration is considered as matching**, so the operation is answered from local data only (ETSI GS CIM 009 Table 6.3.18-1). Applies to `GET /entities`, `GET /entities/{entityId}`, `POST /entityOperations/query`, `GET /types`, `GET /types/{typeName}`, `GET /attributes` and `GET /attributes/{attrId}`. `local` is a **Boolean**: any lexical value other than `true` / `false` returns `400 BadRequestData` (#2008) |
| `localOnly` | boolean | Alias of `local`, kept for backward compatibility. When both are present, `local` wins (#2008)                                                                                                                                                                                                                                                                                                                                                             |
| `csf`       | string  | Context Source Filter expression (e.g., `name==value`, `endpoint~=pattern`)                                                                                                                                                                                                                                                                                                                                                                                |

> **`local` 受け入れ値 (#2008)**: これが実装される前は、`localOnly` のみが尊重され、仕様で名付けられた `local` は**転送に全く影響を与えませんでした** — `local=true` を指定したリクエストでも登録された Context Source に到達していました。`POST /entityOperations/query` はどちらの名前も尊重していませんでした。転送は現在、単一の場所 (`@api/ngsild/utils/local-scope`) で決定されるため、すべての読み取りパスが同じ方法で応答します。Boolean 以外の値は以前は黙って無視されていました(したがって転送されていました)が、現在は `400 BadRequestData` を返し、`DELETE /entities` が既に行っていたことと一致します。
>
> **`/types/` と `/attributes/` も (#2036)**: 規範的な文言は\*「Context Source Registration は一致するものとして考慮されない」*であり、*「転送しない」\*ではありません。これらのディスカバリーエンドポイントはアウトバウンドリクエストを送信しませんが、登録で宣言されたタイプと属性名をレスポンスにマージします — `local=true` の場合、その登録由来のデータは現在除外されます。
>
> `/temporal/entities/` と `/temporal/entityOperations/` は `local` を受け入れますが、現在は no-op です:時系列読み取りパスにはフェデレーション配線がないため、既にローカルのみです。
>
> **非 HTTP エントリーポイントはデフォルトを反転 (#2072)**: MCP ツールと A2A スキルは、`local="false"` が明示的に渡されない限り Context Source へ転送*しません*。また、クエリアクション (`entities` リスト / search\_by\_location / search\_by\_attribute、`batch` クエリ) でのみ転送します。`local` は HTTP バインディングのために定義されているため、非 HTTP サーフェスでのローカルのみのデフォルトは適合性からの逸脱ではありません。両方のサーフェスは同期的なリクエスト/レスポンスであり、転送は AI クライアントを要求していないプロバイダーのラウンドトリップレイテンシーにさらすことになります。ID による取得はそこではローカルのみのままです — #2092 は HTTP の ID によるパスでの認可の穴を閉じました(リモートのみのエンティティが行レベルの読み取り述語を通過するようになりました)ので、MCP / A2A からの ID による転送はもはやそれによってブロックされていませんが、未実装のままです。`docs/AI_INTEGRATION.md` を参照してください。

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

属性削除の**インスタンス選択条件** (`?datasetId=` / `?deleteAll=true`、ETSI GS CIM 009 clause 5.6.5.4) は転送先のクエリにもそのまま載る。落とすと「ローカルは指定インスタンス・転送先は既定インスタンス」を消す silent な分岐になるため (どちらも 204 を返すのでクライアントからは観測できない)。redirect モードで返す `redirectUrl` にも同じ条件を保つ。**NGSI-LD の登録にだけ載せる** — `datasetId` / `deleteAll` は多重属性 (clause 4.5.5) の概念で NGSIv2 には存在しないため。

**転送するのはこの 5 経路だけ** (#2072 と同じ opt-in 規律)。`EntityService` の書き込みメソッドは NGSIv2 の単体書き込み・NGSI-LD の batch (`entityOperations/*`) / merge patch (`PATCH /entities/{id}`) / append からも呼ばれるが、それらは**従来どおりローカルのみ**で Context Source へは転送しない。「どの入口が転送しうるか」を呼び出し側のコードから静的に読める状態に保つための設計であり、配線範囲を広げるときは `Via` 伝播・`NGSILD-Warning` 配線・回帰 E2E をセットで足すこと (#2448 で POST create / PUT replace を追加した際もこの規律に従った)。

> **#2448 の scope 限定:** `PUT /entities/{entityId}` (Replace Entity) の転送は、ローカルに既存の複製が**ある**場合にのみ動く。update/delete が持つ「ローカル複製が無くても exclusive / redirect registration があれば転送する」(下記 #2195) の対称は replace には**まだ実装していない** — Replace はローカル存在確認 (`repository.get`) が先に走り、無ければ 404 になる。

登録モードごとの扱いは読み取りと同じ規約に揃えてある:


* **inclusive**: ローカルと Context Source の**両方**に適用する
  
* **exclusive**: Context Source にのみ適用し、**ローカルは書き換えない** (データは外部にしか無い)
  
* **redirect**: 適用せず、`redirectUrl` を添えた `404` を返す (読み取り側と同じ運び方)
  
* **auxiliary**: ローカルのみ (auxiliary は読み取り専用)

転送リクエストには読み取りと同じ `Via` ヘッダ (`1.1 <BROKER_ID>`) が付き、ループ検出も同じ規約で効く (下記)。

**転送先の失敗は握り潰さない:**


* **inclusive** (ローカルにも書く) — 部分成功なので `NGSILD-Warning: 199 - "Context Source {endpoint} (registration: {id}) responded with error: ..."` を付けて返す。書式は読み取り側の `failedProviders` 由来の 199 と同一
  
* **exclusive** (ローカルを書かない) で **1 つも成功しなかった場合は `502 ContextProviderError`** を返す (エラー応答なので詳細は ProblemDetails に載る。`NGSILD-Warning` は付かない)。ローカルを書き換えていない以上その書き込みはどこにも適用されておらず、204 を返すと「削除したはずのデータがローカルに残り続け、登録を外した瞬間に再び読める」状態になるため (読み取り側 exclusive の `failOnProviderError` と同じ判断)

> **#2195:** exclusive / redirect registration が一致すれば、ローカル複製が無くても Context Source へ書き込みを転送する (読み取り側 `getEntity` と同じ構造)。inclusive のみ・registration 無しのローカル不在は従来どおり `404`。

#### Loop Detection (#1664)

ETSI GS CIM 009 - 6.3.17 / 6.3.18 に基づき、受信リクエストの `Via` ヘッダに自Context Brokerの pseudonym (`BROKER_ID`、既定 `geonicdb`) が含まれる場合はループと判定する:


* **inclusive / auxiliary registration**: 転送をスキップしてローカル結果のみ返し、`NGSILD-Warning: 199 - "Loop detected: ..."` を付与する (`200 OK`)
  
* **exclusive / redirect registration**: データが外部ソースにしか存在せず転送すると無限ループになるため **`508 Loop Detected`** を返す (ProblemDetails `type: https://uri.etsi.org/ngsi-ld/errors/LoopDetected` — 508 用の型は ETSI エラー型 registry に未定義のため、413 系と同じ規約で GeonicDB が割り当てた安定識別子)
  
* Via のパースは RFC 7230 準拠 (comment / received-protocol / ポート番号を除去して pseudonym を比較)。CloudFront / ALB 等の中間装置が挿入する Via エントリが混在しても正しく検出する
  
* ループ判定は深度判定より**先**に行われる (長い Via チェーンの本物のループでも silent local-only にならず 508 / Warning 199 の正しいシグナルが出る)
  
* **注意:** CDN / ALB / 企業 proxy 等の中間装置が挿入する Via エントリも深度にカウントされる (エントリがContext Brokerか proxy かは判別不能)。proxy 段数が深いデプロイ構成では実効カスケード段数がその分減るため、必要に応じて `FEDERATION.MAX_CASCADING_DEPTH` の引き上げを検討すること
  
* Via チェーンの長さはカスケード深度 (`FEDERATION.MAX_CASCADING_DEPTH`、既定 3) の判定にも使われる
  
* **federation する各デプロイには一意の `BROKER_ID` を設定すること** (`docs/ENV.md`)。両方既定値のままだと相互に false positive のループ検出になる

#### CSR Change Notifications

Context Source Registration が作成、更新、または削除されると、一致する CSource Subscription の通知エンドポイントに自動的に通知が送信される (ETSI GS CIM 009 - 5.11)。通知には変更の種類を示す `Ngsild-Trigger` ヘッダが含まれる (`csourceRegistration-created`、`csourceRegistration-updated`、`csourceRegistration-deleted`)。

通知ペイロードの `type` は `ContextSourceNotification` である (ETSI GS CIM 009 Table 5.3.2-1)。GeonicDB は `id` に対して既存の URI 規約 (`urn:ngsi-ld:Notification:<...>`) を維持する。これは仕様が有効な URI を要求するが固定プレフィックスを義務付けていないため有効である。

#### Distributed Type and Attribute Discovery

`/ngsi-ld/v1/types` および `/ngsi-ld/v1/attributes` エンドポイントは、ローカルエンティティに加えて Context Source Registration に登録されたエンティティタイプと属性を返す (ETSI GS CIM 009 - 5.9.3.3)。

> **行レベル読み取り認可は registration 由来の貢献にも適用される (#2079)。** 行レベル読み取り述語 (カスタム XACML ポリシー、[AUTH.md](../reference/auth.md#policy-to-filter-query-rewriting-for-list-queries-1337--1369) 参照) によって制限されたサブジェクトに対しては、registration が宣言するタイプ / 属性名は、宣言されたタイプが妥当に読み取り可能である場合にのみレスポンスに貢献する — registration を使用してサブジェクトが読み取りアクセス権を持たないタイプの存在や属性名を知ることはできない。`/types/{typeName}` および `/attributes/{attrId}` は、唯一の一致する貢献が読み取り不可能なタイプを宣言する registration である場合、`404` にフォールスルーする。**エンティティタイプを宣言しない** registration (`entities` の省略、`type: "*"`、または `id`/`idPattern` のみのセレクタ — #1594 のワイルドカード形式) は、タイプ情報を持たないため、引き続き属性名を貢献する。提供される `typeNames` のみが読み取り可能なタイプに絞り込まれる。制限のないサブジェクト (デフォルトの `user` / `tenant_admin` / `super_admin` ロール) には変更はない。
>
> **CSR ドキュメント自体の読み取りは同じ述語によって編集される (#2084)。** `GET /ngsi-ld/v1/csourceRegistrations` および `GET /ngsi-ld/v1/csourceRegistrations/{registrationId}` は、読み取り不可能な具体的なタイプセレクタを `information[].entities[]` からドロップし、読み取り不可能なタイプのみを宣言する information エントリをドロップし、完全に編集されたドキュメントをリストから除外し (編集後に `count` とページネーションが計算される)、それらに対して id による読み取りでは `404` を返す。`?type=` / `?attrs=` は編集されたドキュメントに対して再マッチングされるため、読み取り不可能なタイプセレクタ経由でのみマッチした registration は全く表示されない。タイプ非依存の registration (`entities` の省略、`type: "*"`、`id`/`idPattern` のみのセレクタ) はタイプ情報を持たないため影響を受けない。制限のないサブジェクトには変更はない。完全なルールについては [AUTH.md](../reference/auth.md) (#2084) を参照。
>
> **Registration のタイプセレクタは、discovery エンドポイントがそれらを読み取る場所で正規化される (#2086)。** 上記の述語は、**保存された**タイプ名を正確な文字列等価性によって XACML マッチャー値と比較する。NGSI-LD registration は書き込み時に正規化されて保存される (`normalizeTypeName`、#1700) が、**NGSIv2 registration (`POST`/`PATCH /v2/registrations`) は `dataProvided.entities[].type` をそのまま保存する** — NGSIv2 にはアクティブな `@context` が無いため、展開ルールが無い。registration はプロトコル間で可視であるため、NGSIv2 から `https://uri.etsi.org/ngsi-ld/default-context/Sensor` として登録されたタイプは `Deny entityType == Sensor` ルールと文字列マッチせず (過剰な許可)、一方で `/types/Sensor` および `/attributes/{attr}` はそれと全くマッチしなかった (silent `404`)。discovery エンドポイントは、それらを読み取る時点で registration のタイプセレクタを**コア**語彙で正規化するため、認可述語、完全一致ルックアップ、レンダリングされたタイプ名はすべて同じ値を参照する。**保存された**形式は変更されず、`GET /v2/registrations` は引き続きそのままのタイプを返す (属性名の #1890 と同じ規律) — 正規化は永続化される内容ではなく、マッチングに使用される値に適用される。変換は既に正規化された値に対する不動点であるため、既存データは移行なしでカバーされる。

### EntityMap 操作

> **ETSI GS CIM 009 リファレンス**: セクション 5.14 - Entity Map

NGSI-LD EntityMap は、クエリ結果をマップとして保存し、後でエンティティ ID による効率的なアクセスを可能にする機能です。

#### EntityMap 形式でエンティティを取得

`GET /ngsi-ld/v1/entities` のクエリパラメータに `options=entityMap` を指定すると、レスポンスがエンティティ ID をキーとするオブジェクトとして返されます。

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

`GET /ngsi-ld/v1/entities` が受け付けるエンティティセレクタクエリパラメータ (`type`、`idPattern`、`q`、`attrs`、`georel`/`geometry`/`coordinates`、`geoproperty`、`scopeQ`、`lang`) は、EntityMap がキャプチャするエンティティを定義するためにここでも受け付けられます。さらに:

| Parameter     | Type   | Description                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `typePattern` | string | Regular expression pattern for entity type, evaluated **verbatim** (no implicit `*`→`.*` conversion). Combining with `type` is an **AND** (both must match, same discipline as the temporal `typePattern` extension, #2105). An empty value (`typePattern=`) is treated as if the parameter were omitted: it is not applied to the query and not echoed in `query` (same handling as the other selector parameters). **GeonicDB 独自拡張** (#2116) |

**レスポンス**: `201 Created`、作成された EntityMap の URL が `Location` ヘッダーに含まれます

> **`query` は正規化/折りたたまれた形式ではなく、保存された(入力)形式をエコーします (#2116)**: 永続化され返される `query` オブジェクトは、要求された内容を正確に反映します — `query.type` はカンマ区切りの入力形式(配列ではなく、展開されていない)であり、`typePattern` は `type` に折りたたまれ**ません**。#2116 以前は、`typePattern` のみのセレクタ(例: `^Sensor`)に対するレスポンスの `query` を再生すると、`type: "^Sensor"` が生成され、パターンセレクタがリテラル型名に静かに変換されてしまいました(#1800 と同じクラスのバグ)。
>
> **認可 (#1955)**: EntityMap の背後にあるクエリは、**`GET /ngsi-ld/v1/entities` と同じ行レベル述語**で実行されるため、`entityIds` と `totalCount` は読み取りが許可された行のみをカバーします。読み取り可能な行がないサブジェクトは `403` を受け取ります。既存の EntityMap の**読み出し**は所有者ガードで保護されます (#1963 — 下記)。

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

エンティティ取得エンドポイント(`GET /ngsi-ld/v1/entities` および `GET /ngsi-ld/v1/entities/{entityId}`)では、`join` および `joinLevel` クエリパラメータを使用してリンクされたエンティティを取得できます。同じ 2 つのメンバーはサブスクリプションでも `notification.join` / `notification.joinLevel` として利用可能で
(Table 5.2.14.1-1, #2104)、通知ペイロード内で同じように動作します。

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

**出力形式** (ETSI GS CIM 009 clause 4.5.23.2, #2222)

`inline` は、アノテーション付き Relationship にリンクされたエンティティを保持する `entity` サブメンバーを追加します。これは**囲んでいるレスポンスと同じ表現形式**(normalized / concise)で表現されます。埋め込まれたエンティティは独自の `@context` を持ちません — これは親ドキュメントの一部であり、スタンドアロンの JSON-LD ドキュメントではありません。

```jsonc
// normalized
"refLinked": {
  "type": "Relationship",
  "object": "urn:ngsi-ld:Linked:001",
  "entity": { "id": "urn:ngsi-ld:Linked:001", "type": "Linked",
              "marker": { "type": "Property", "value": "ok" } }
}
```

`keyValues`(簡略化形式)では、Relationship 自体が `entity` メンバーを獲得するのではなく、リンクされたエンティティの簡略化表現によって**置き換えられます**(clause 4.5.3 EXAMPLE 9):

```jsonc
// keyValues
"refLinked": { "id": "urn:ngsi-ld:Linked:001", "type": "Linked", "marker": "ok" }
```

`flat` は、リンクされたエンティティを独立したエンティティとして結果配列に追加します(したがって、独自の `@context` を**持ちます**)。Relationship 自体は変更されません — `entity` メンバーを獲得せず、既に持っていた `datasetId` / サブ属性は保持されます。

**どのリンクがたどられるか (#2225)**

3 つすべてのリンク形式が、`inline` と `flat` の両方でたどられます。これにはマルチ属性インスタンスとして現れる場合も含まれます(clause 4.5.5):

| Attribute                                                            | Link member  | `inline` output member                                     |
| -------------------------------------------------------------------- | ------------ | ---------------------------------------------------------- |
| `Relationship` with a single `object` URI                            | `object`     | `entity` — the linked entity                               |
| `Relationship` with an `object` **array** (clause 4.5.3 allows both) | `object[]`   | `entity` — an **array**, in `object` order                 |
| `ListRelationship`                                                   | `objectList` | `entityList` — an **ordered array**, in `objectList` order |

メンバー名は属性タイプに従います:仕様は `ListRelationship` での `entity` と `Relationship` での `entityList` を禁止しています。順序は常に属性自身の `object` / `objectList` から来るものであり、ターゲットがたまたまフェッチされた順序からは来ません。

`keyValues` では、同じ区別が置換値に適用されます:単一の `object` は 1 つの簡略化オブジェクトに置き換えられ(EXAMPLE 9)、`object` 配列 / `objectList` は簡略化オブジェクトの**順序付き配列**に置き換えられます(EXAMPLE 17)。マルチ属性インスタンスは clause 4.5.4 の `dataset` マップを保持し、`datasetId` ごとの値のみが置き換えられます。

```jsonc
// normalized, ListRelationship
"route": {
  "type": "ListRelationship",
  "objectList": ["urn:ngsi-ld:City:002", "urn:ngsi-ld:City:001"],
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

解決できないターゲット(存在しない、または下記の読み取り述語によってフィルタリングされた)は、単に `entityList` / `entity` から欠落します。ターゲットが解決されない場合、メンバーは完全に省略されるため、空の配列が「読み取り不可」を意味するために使用されることはありません。

> **したがって `entityList` は `objectList` と位置的に整列していません。** 一部のターゲットが解決され、他が解決されない場合、配列は**圧縮されます** — `b` が読み取り不可の場合、`objectList: [c, b, a]` は `entityList: [C, A]` になります。エントリはインデックスではなく `id` で照合してください。(仕様はすでに 2 つが乖離することを許可しています:「以前に遭遇した」ターゲットも同様に省略されます。)同じことが、マルチターゲット `Relationship` の配列形式の `entity` にも適用されます。
>
> **認可 (#2213)**:リンクされたエンティティは、以下と**同じ行レベルの読み取り述語**の下で解決されます

> エンティティのリンク。特定のエンティティタイプの読み取りを拒否するポリシーを持つ呼び出し元は、任意の `joinLevel` において Relationship を通じてそのタイプのエンティティを受け取ることはありません。リンク自体(読み取り可能なエンティティ上の `Relationship` `object` URI)は引き続き返されます — ターゲットエンティティのコンテンツのみが保留されます。[AUTH.md](../reference/auth.md#aggregate-and-derived-reads-over-entities-1370--1955) を参照してください。

### Context Source Registration Subscriptions

NGSI-LD では、Context Source Registration Subscriptions (CSR subscriptions) は、コンテキストソース登録の変更を監視するサブスクリプションを管理します。

> **通知はサブスクリプション作成者の読み取り述語によって編集されます (#2133)。** CSR subscriptions は作成者 (`createdBy`) を保存します。配信される CSR ドキュメントは、`GET /ngsi-ld/v1/csourceRegistrations` (#2084) と同じ行レベルの編集を通過し、作成者の現在のポリシーで評価されます。読み取り不可能な型セレクタを介してのみ一致する通知は配信されません。保存された作成者がいないサブスクリプション (この変更前に作成されたもの) や、作成者がアクティブなユーザーでなくなった場合は、通知を**一切**受け取りません (フェイルクローズ; 構造化された警告 `CSOURCE_NOTIFICATION_RLS_*` がログに記録されます)。詳細は [AUTH.md](../reference/auth.md) (#2133) を参照してください。

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

`watchedAttributes` と `notification.attributes` は、`csourceRegistrations` の属性名と同じ `@context` 用語 ⇄ URI ルールに従います (#1890 / #1900): 名前は書き込み時の `@context` でそのまま保存されます。GET レスポンスではリクエストの `@context` を使用して圧縮されます。CSR 通知のマッチングでは、エイリアスセットの積集合 (逐語的 ∪ 正規) を使用します。

結果として得られる `ContextSourceNotification` の `@context` は、通常のサブスクリプション通知と同じ配信ルールに従います (#2025 / #1841): `notification.endpoint.accept: application/ld+json` はそれをボディに配置し、`application/json` は `Link` ヘッダーに配置し、**決して両方には配置しません**。#2025 以前は、コア `@context` は `accept` に関係なく常にボディに配置され、提供された `jsonldContext` は黙って破棄されていました。

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

#### CSR Subscription を更新

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

#### CSR Subscription を削除

```http
DELETE /ngsi-ld/v1/csourceSubscriptions/{subscriptionId}
```

**レスポンス**: `204 No Content`

### JSON-LD コンテキスト管理

ETSI GS CIM 009 clause 5.13 (*Storing, Managing and Serving @contexts*) に準拠した JSON-LD コンテキスト管理 API です。ユーザー定義の JSON-LD コンテキストの登録と管理を可能にします。

保存されたコンテキストは 3 種類のいずれかを持ちます (clause 5.13.1)。仕様の語彙は大文字表記であり、**レスポンスはそれを使用します** (#2250):

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

クライアントが提供した `kind` フィールドは `400 BadRequestData` で拒否されます — clause 5.13.2.4 はすべての Add @context エントリを `Hosted` としてフラグ付けします (#2297)。

**レスポンス**

* ステータス: `201 Created`
  
* ヘッダー: `Location: /ngsi-ld/v1/jsonldContexts/{contextId}`

> **`Location` 内の `{contextId}` は、パスセグメントが必要とする範囲を超えてパーセントエンコードされません (#2250)。**
> `:` と `@` は RFC 3986 §3.3 の `pchar` であり、そのまま出力されるため、ヘッダーは
> `Location: /ngsi-ld/v1/jsonldContexts/urn:ngsi-ld:JsonLdContext:<uuid>` のようになります。これらをエンコードすると
> 通常のクライアントのラウンドトリップが破綻します: クライアントが `Location` から id を取り出し、
> 次の URL を構築する際にパスセグメントとしてエンコードすると `urn%253A…` を送信することになり、
> サーバー側の 1 回のデコードでは元に戻せず、リクエストは `400 BadRequestData` で拒否されます。
> パスを破壊する可能性のある文字 (`/`、`?`、`#`、空白、制御文字) は引き続きパーセントエンコードされます。同じことが
> `POST /ngsi-ld/v1/csourceRegistrations` と `POST /ngsi-ld/v1/csourceSubscriptions` の `Location` にも適用されます。

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

`details=true` を指定すると、ボディはメタデータオブジェクトのリストになります (clause 5.13.3.5):

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

`URL` は **レコードが持つ場合のコンテキストの元の URL** です (`Cached` では必須、clause 5.13.3.1)。値によって登録されたコンテキストには、このContext Brokerの配信 URL が設定されます。`localId` は登録時に `Location` で返される識別子です。

#### JSON-LD コンテキストの取得

```http
GET /ngsi-ld/v1/jsonldContexts/{contextId}
```

**クエリパラメータ**

| Parameter | Type   | Description                                                                                                                                                                                    | Default |
| --------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `details` | string | `true` returns metadata about the `@context` (same shape as the list above) instead of its content (clause 5.13.4.3). `true` or `false`; any other value is rejected with `400 BadRequestData` | `false` |

**レスポンスボディ**

`details` がない場合、ボディは**保存された `@context` ドキュメント自体**です(6.30.3.1 項 — "a JSON object that has a root node named `@context`")。そのため、URL は任意の JSON-LD プロセッサによって直接参照解決できます:

```json
{
  "@context": {
    "Temperature": "https://example.org/ontology#Temperature"
  }
}
```

登録時に `@context` サブツリーの外部で提供された情報は破棄されます(5.13.2.3 項)。ボディは両方の表現で同一です:ここでの `@context` はペイロードであり、NGSI-LD エンベロープ宣言ではないため、`application/json` の場合でも `Link` ヘッダーに移動されることは**ありません**。

`Cached` コンテキストの**コンテンツ**の提供は `422 OperationNotSupported` で拒否されます(5.13.1 / 5.13.4.4 項);その**メタデータ**(`details=true`)はすべての種類に対して返されます。

**キャッシュヘッダー**

レスポンスには以下のキャッシュ関連ヘッダーが含まれます:

| Header          | Description                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------ |
| `ETag`          | MD5 hash of the context body                                                                     |
| `Last-Modified` | Creation date and time of the context                                                            |
| `Cache-Control` | `public, max-age=3600`                                                                           |
| `Vary`          | Includes `Link` and `Accept` — response `@context` placement depends on these request dimensions |

**表現に関する注記 (#1838 / #2250):** ボディは表現によって変化しなくなりました — 両方とも保存された `@context` ドキュメントです。`Vary` と表現ベースの `ETag` は、`Content-Type` とレスポンスの `Link` ヘッダーが表現ごとに異なるため維持されています(RFC 9110 §8.8.1:エンティティタグは*選択された*表現を識別します)。`Vary` を無視する共有キャッシュは、同じ `contextId` URL に対して表現を混在させる可能性があります(相互運用性のリスクであり、テナント漏洩ではありません — `contextId` はグローバルに一意であり、エンドポイントは認証されていません)。

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

**クエリパラメータ**

| Parameter | Type    | Required | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------- | ------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reload`  | boolean | No       | Optional flag (ETSI GS CIM 009 clause 5.13.5.4 / Table 6.30.3.2-1). **When provided**, values other than `true`/`false` are `400 BadRequestData` before the identifier lookup. `reload=true` on a Hosted or ImplicitlyCreated `@context` is `400 BadRequestData` and the stored entry is left intact. `reload=true` on a Cached `@context` currently **deletes** the entry (`204`) — re-download from the original URL is not implemented. When omitted or `false`, the `@context` is deleted. |

**レスポンス**: `204 No Content` / `400 BadRequestData` / `404 Not Found`

## HTTP キャッシュ制御

NGSI-LD GET エンドポイントはエンドポイントクラスごとにキャッシュ関連ヘッダーを返します:

### データエンドポイント (entities、subscriptions、csourceRegistrations、csourceSubscriptions) — 完全な RFC 7232 + RFC 7234 サポート

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

### メタエンドポイント (types、attributes) — Cache-Control + Vary のみ (ETag なし / 304 なし)

| Header          | Value                                                                                 | Purpose                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Cache-Control` | `private, max-age=60, stale-while-revalidate=120`                                     | Shared/intermediate cache storage is forbidden; private cache can reuse briefly with background revalidation. |
| `Vary`          | `NGSILD-Tenant, Fiware-Service, Fiware-ServicePath, Authorization, X-Api-Key, Accept` | Same tenant/auth isolation as data endpoints.                                                                 |

メタエンドポイントは `ETag` / `Last-Modified` を返さず、`If-None-Match` / `If-Modified-Since` 条件付きリクエストをサポートしません。クライアントは代わりに `max-age` / `stale-while-revalidate` ディレクティブに依存する必要があります。

### エラーレスポンス (#1821)

RFC 9110 §15.1 のヒューリスティックにキャッシュ可能なセット(404、405、410、414、501)に含まれるエラーステータスは、集中エラーハンドラから `Cache-Control: no-store` を受け取るため、共有キャッシュ(CloudFront Error Caching Minimum TTL など)がエンティティ GET でテナント間の存在オラクルを保存できません。一般的な 400 レスポンスはヒューリスティックにキャッシュ可能ではなく、オーバーライドを受け取りません。

> **注記**: `/ngsi-ld/v1/jsonldContexts/{contextId}` には、追加のコンテキスト固有のキャッシュセマンティクスがあります — 上記の JSON-LD Context Management セクションを参照してください。

完全なセマンティクスについては、[API.md §HTTP Cache Control](./endpoints.md#http-cache-control-etag--conditional-requests) を参照してください。

***

## エンドポイントリスト

ETSI NGSI-LD 互換 Context Broker API。

### 共通仕様


* **Content-Type**: `application/ld+json` または `application/json`
  
* **Authentication**: `AUTH_ENABLED=false` でない限り必須
  
* **Tenant Isolation**: `NGSILD-Tenant` または `Fiware-Service` ヘッダー
  
* **Pagination**: `limit`/`offset` パラメータ。合計カウントは `NGSILD-Results-Count` ヘッダー経由で返されますが、**`count=true` がリクエストされた場合のみ**です (ETSI GS CIM 009 §5.5.6)。count がリクエストされない場合、Context Brokerはカウントクエリをスキップし、代わりに `NGSILD-Next` / `Link` (`rel="next"`) 経由で次のページを示します (#1434)。
  
* **OPTIONS Method**: すべての NGSI-LD エンドポイントは OPTIONS メソッドをサポートします。`Allow` および `Accept-Patch` ヘッダーを含む 204 レスポンスを返します
  
* **405 Method Not Allowed**: 許可されていない HTTP メソッドに対して 405 レスポンスを返します (RFC 7807 ProblemDetails 形式、`Allow` ヘッダー付き)
  
* **406 Not Acceptable**: GET エンドポイントは、利用可能な表現にネゴシエートできない `Accept` ヘッダーを、`availableRepresentations` をリストした 406 ProblemDetails で拒否します (ETSI GS CIM 009 - 6.3.2 / 6.3.4, #1693)。[Content Negotiation](#content-negotiation-and-context) を参照
  
* **Path id validation**: id 別エンドポイント (entities、subscriptions、csourceRegistrations、temporal entities、jsonldContexts) では、有効な URI でない path id は存在チェックの前に `400 BadRequestData` を返します (#1692)
  
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

| Endpoint                               | Method | Description             | Success | Error              | Pagination    |
| -------------------------------------- | ------ | ----------------------- | ------- | ------------------ | ------------- |
| `/ngsi-ld/v1/entityMaps`               | GET    | Retrieve EntityMap list | 200     | 400, 401, 406      | ✅ (max: 1000) |
| `/ngsi-ld/v1/entityMaps`               | POST   | Create EntityMap        | 201     | 400, 401, 403, 415 | -             |
| `/ngsi-ld/v1/entityMaps/{entityMapId}` | GET    | Retrieve EntityMap      | 200     | 401, 404, 406      | -             |
| `/ngsi-ld/v1/entityMaps/{entityMapId}` | PATCH  | Update EntityMap        | 204     | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/entityMaps/{entityMapId}` | DELETE | Delete EntityMap        | 204     | 401, 404           | -             |

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
> * **capture (`POST /snapshots`)** — 取り込むのは、その principal が `GET /ngsi-ld/v1/entities` で読める行だけです。scope / owner で読めないエンティティは snapshot に入りません(`entityCount` にも数えられません)。読める行が 1 件も無い principal は 403 になります。
> * **clone (`POST /snapshots/{id}/clone`)** — 書き戻すのは、その principal が `POST /ngsi-ld/v1/entities` で書ける行だけです。復元内容 (snapshot 行) と上書き先の既存行の**両方**が Permit される必要があります。
> * **snapshot 自体の変更 (PATCH / DELETE)** — 作成者のみ。他者の snapshot は 403 です(`super_admin` / `tenant_admin` は従来どおり全件操作できます)。
> * **purge (`DELETE /snapshots`)** — 非管理者は**自分が作成した** snapshot だけを削除します。

> **`entityTypes` フィルタの型名 (#2125):** `POST /snapshots` の `entityTypes` は、`?type=` と同じく**リクエストの `@context`** (`Link` ヘッダ) で正規化してから保存形と照合します。短縮名 `Room` と、それが展開される `https://uri.etsi.org/ngsi-ld/default-context/Room` は同一の型として扱われ、どちらの表記でも同じエンティティが capture されます (ETSI GS CIM 009 clause 4.4 / 5.5.7)。別の名前空間の同名 IRI は別の型であり、一致しません。

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

Temporal 履歴は Entity API の書き込みによって**デフォルトでは**自動記録されません。次のいずれかの取り込み経路を使用してください:(1) Temporal API エンドポイントへの明示的な書き込み(単一またはバッチ)、(2) エンティティ変更時に `appendToTemporal` を使用する ReactiveCore ルール、または (3) `TEMPORAL_ENTITY_DUAL_WRITE=true` を設定(GeonicDB 拡張、オプトイン; `docs/ENV.md` 参照)すると Core Entity API の**書き込みと削除**が Temporal Evolution へ二重書き込みされます(削除は clause 4.5.7/4.5.8 に従い `urn:ngsi-ld:null` + `deletedAt` トゥームストーンとして記録され、EntityExpiryService による TTL 期限切れも含まれます — #2527 / #2780)。

**(3) が ON の場合の二重書き込み範囲**(NGSI-LD のみ): 単一エンティティの `POST /entities`、`PUT /entities/{id}`、`PATCH /entities/{id}`、`POST|PATCH|PUT .../attrs`(単一属性の置換/更新を含む)、バッチの `entityOperations/create|upsert|update|merge|delete`、および `entityOperations/purge` / `DELETE /entities` purge セレクタ。Core Entity API の**削除**(エンティティ削除、属性削除、バッチ削除、purge)は `urn:ngsi-ld:null` + `deletedAt` トゥームストーンとして二重書き込みされます(clause 4.5.7/4.5.8)。同じ tenant + servicePath に対して有効な `appendToTemporal` ルールが存在する場合、(3) はスキップされます(ルールが優先されます)。

**二重書き込みされないもの:** NGSIv2 Entity API の書き込み、および Temporal API 自身の `DELETE` 操作(履歴削除 — Core API 削除の記録とは異なります)。TTL 期限切れ(EntityExpiryService)はフラグが ON の場合**二重書き込みされます**(#2780)。

| Endpoint                                                                 | Method | Description                                                                                                                       | Success                           | Error              | Pagination    |
| ------------------------------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------ | ------------- |
| `/ngsi-ld/v1/temporal/entities`                                          | GET    | Retrieve temporal entity list                                                                                                     | 200 (206 when lastN or truncated) | 400, 401, 406      | ✅ (max: 1000) |
| `/ngsi-ld/v1/temporal/entities`                                          | POST   | Create (201) or upsert (204) temporal entity — clause 5.6.11: an existing id appends the given attribute instances instead of 409 | 201/204                           | 400, 401, 415      | -             |
| `/ngsi-ld/v1/temporal/entities/{entityId}`                               | GET    | Retrieve temporal entity                                                                                                          | 200 (206 when lastN or truncated) | 400, 401, 404, 406 | -             |
| `/ngsi-ld/v1/temporal/entities/{entityId}`                               | PATCH  | Merge attributes of temporal entity                                                                                               | 204                               | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/temporal/entities/{entityId}`                               | DELETE | Delete temporal entity                                                                                                            | 204                               | 400, 401, 404      | -             |
| `/ngsi-ld/v1/temporal/entities/{entityId}/attrs`                         | POST   | Add attribute instance                                                                                                            | 204                               | 400, 401, 404, 415 | -             |
| `/ngsi-ld/v1/temporal/entities/{entityId}/attrs/{attrName}`              | DELETE | Delete attribute instance(s) — supports `datasetId` and `deleteAll` query params (clause 5.6.5.4)                                 | 204                               | 400, 401, 404      | -             |
| `/ngsi-ld/v1/temporal/entities/{entityId}/attrs/{attrName}/{instanceId}` | PATCH  | Modify attribute instance                                                                                                         | 204                               | 400, 401, 404      | -             |
| `/ngsi-ld/v1/temporal/entities/{entityId}/attrs/{attrName}/{instanceId}` | DELETE | Delete attribute instance                                                                                                         | 204                               | 400, 401, 404      | -             |
| `/ngsi-ld/v1/temporal/entityOperations/create`                           | POST   | Temporal batch create (max: 1000)                                                                                                 | 201/207                           | 400, 401, 415      | -             |
| `/ngsi-ld/v1/temporal/entityOperations/upsert`                           | POST   | Temporal batch upsert (max: 1000)                                                                                                 | 204/207                           | 400, 401, 415      | -             |
| `/ngsi-ld/v1/temporal/entityOperations/delete`                           | POST   | Temporal batch delete                                                                                                             | 204/207                           | 400, 401, 415      | -             |
| `/ngsi-ld/v1/temporal/entityOperations/query`                            | POST   | Temporal batch query                                                                                                              | 200 (206 when lastN or truncated) | 400, 401, 415      | ✅ (max: 1000) |

> **Temporal 属性削除インスタンス選択(#2436、clause 5.6.5.4)**: `DELETE /ngsi-ld/v1/temporal/entities/{entityId}/attrs/{attrName}` はその属性の履歴インスタンスを削除し、Core Entity 属性削除と同様にスコープされます:`?datasetId=` はその `datasetId` を持つインスタンスのみを削除;`?deleteAll=true` は `datasetId` に関係なくすべてのインスタンスを削除;両方を省略すると**デフォルトインスタンス**(`datasetId` を持たないもの)のみを対象とし、存在しない場合は `404 ResourceNotFound` を返します。`?instanceId=`(このエンドポイントの GeonicDB 拡張)は単一のインスタンスを直接選択し、`datasetId`/`deleteAll` の影響を受けません。同じ選択が MCP `temporal` ツールの `delete_attribute` アクションおよび同等の A2A スキルパラメータの `?datasetId=`/`deleteAll` にも適用されます。
>
> **属性名の保存形と compaction (#1975)**: temporal の属性名も entity 側 (#1649) と同じ canonical 形 (`compactIri(core @context, expandTerm(書き込み @context, 名前))`) で保存されます。単一/batch の create・`POST .../attrs`・`PATCH` (merge) の全書き込み経路が対象で、書き込み時にリクエスト `@context` がマップする term は FQN で保存されます。GET / query / 集約応答は**そのリクエストが渡した `@context`** を基準に属性名を compact して返します (ETSI GS CIM 009 clause 5.5.7)。`orderBy`・`attrs` セレクタ・属性削除 (`DELETE .../attrs/{attrName}`)・インスタンス修正 (`PATCH .../attrs/{attrName}/{instanceId}`) のパス属性名も同じ正規化と候補照合 (保存形の union の OR) を通るため、ある `@context` で書いた属性を**別の `@context` の同義 term**で引く・並び替える・削除できます。属性名は短縮名 (`A-Za-z0-9_`) に加え**絶対 IRI もそのまま受理**します(従来は短縮名限定でした)。
>
> **既知の制限**: temporal は書き込み時 `@context` を保存していないため一括移行ができません。**#1975 適用前 (移行前) の既存データは verbatim 保存のまま**残り、応答でも保存形をそのまま返します(compact されません)。読み取り・クエリ・削除は保存形の候補集合(verbatim ∪ canonical)の OR で照合するため、legacy データにも当たり続けます。
