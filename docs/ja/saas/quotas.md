---
title: "Quotas & Plans"
description: "GeonicDB quota system and plans"
outline: deep
---
# GeonicDB クォータシステム

GeonicDB は、テナントごとのレート制限とストレージクォータを管理するための包括的なクォータシステムを提供します。

## 概要

クォータシステムは、3 つの主要コンポーネントで構成されています:


1. **レート制限システム** - DynamoDB または MongoDB を使用した固定ウィンドウカウンターによる API リクエスト制限
   
2. **ストレージクォータシステム** - MongoDB に基づくエンティティ/サブスクリプション/登録/時系列データの数制限
   
3. **監視・管理システム** - 使用状況追跡、アラート配信、および管理 API

## クォータプラン

GeonicDB は、4 つの標準プランとカスタムプランを提供しています:

> **プラン名。** `FREE` / `STANDARD` / `PREMIUM` / `ENTERPRISE` は、
> 顧客向けの `T0` / `T5` / `T30` / `T40` に対応します(マッピングとクラスター階層については
> QUOTA\_OPERATIONS.md §1 を参照してください)。
>
> **値は #2082 で引き上げられました**。顧客向けプランシートと以前の実装のうち、より高い方に合わせたため、**テナントの
> 有効な制限が引き下げられることはありませんでした**。シートが低かった残りの 3 つのセル(T0 users / T0 batch size / T5 users)は、シートを
> 実装に合わせて引き上げることで解決されたため、**以下の値は現在
> [customer/PLAN\_QUOTAS.md](./customer/PLAN_QUOTAS.md) §2/§4 とセルごとに一致しています**。
>
> ⚠️ **同じ数値が 4 箇所に存在します。1 つの PR で 4 箇所すべてを変更してください** — 決して
> 1 箇所だけを変更しないでください。そうしないと #2082 が再発します(どちらが正式かを誰も判断できなくなります):
>
> 1. `QUOTAS.PLANS`(`src/config/defaults.ts`)— 実装であり、正式なソース
> 2. [customer/PLAN\_QUOTAS.md](./customer/PLAN_QUOTAS.md) §2/§4 — 顧客向け
> 3. **このセクション** — 開発者リファレンス
> 4. QUOTA\_OPERATIONS.md §1.1 — 運用ランブック
>
> **`Maximum batch operation size` は現在、プランごとに適用されます**(#2082)。以前は
> そうではありませんでした:`QUOTAS.PLANS[*].limits.maxBatchSize` は定義され、Admin API は
> `customQuotas.limits.maxBatchSize` を受け入れていましたが、それを読み取るコードはありませんでした — 有効な上限は、すべてのプランで一律
> `SECURITY.MAX_BATCH_SIZE` でした。`SECURITY.MAX_BATCH_SIZE`(**1000**)は現在、
> Zod スキーマで使用されるプランに依存しない絶対的な上限のみとなっています。プランごとの値は
> `handlers/api/index.ts` で `getMaxBatchSize()` を介して適用され、
> `cannot exceed the plan limit` で拒否されます。
>
> **`Maximum users` は現在、プランにリンクされています**(#2082)。明示的な `settings.maxUsers` は
> プランのデフォルトよりも優先されるため、テナントごとのアドオンはプラン変更によって上書きされません。

### 技術的制限:最大エンティティドキュメントサイズ(#2517)

プランのストレージ数とは独立:**`QUOTAS.MAX_ENTITY_DOCUMENT_BYTES` = 1 MiB**
(1 つのエンティティドキュメントの BSON サイズ)。作成/置換時には `EntityRepository` で適用されます
(合成候補の `BSON.calculateObjectSize`)。追加/マージ時にはアトミックな `$expr` + `$bsonSize`
プリイメージガードで適用されます。**413 `RequestEntityTooLarge`** で拒否されます。スナップショット復元は
`EntityRepository` をバイパスし、**意図的に除外**されます(祖父条項による復元)。

顧客向けサマリー:[`docs/customer/PLAN_QUOTAS.md`](./customer/PLAN_QUOTAS.md)
(以下の詳細セクションと表現を同期してください)。

注意:PREMIUM/ENTERPRISE のリクエストボディ制限は 5MB/10MB であるため、リクエストは
ボディチェックを通過しても、結果のドキュメントが 1 MiB を超えると永続化時に 413 が発生する可能性があります。

**暗号化されたテナント(#2517 SECREVIEW4):** 置換(`append:false`)は、
M2 に必要な場合のみ暗号化します。**現在の**ドキュメントがすでに 1 MiB 制限内である場合、過大な
属性ペイロードは `encryptAttributes` の**前に**拒否されます(廃棄される
バイトを DEK ローテーションにカウントしないようにします)。現在のドキュメントがすでに制限を超えている場合、早期
ペイロードチェックはスキップされるため、縮小置換はアトミック縮小
`$expr` ガードを介して成功できます。

**1 つのバッチ内の同じエンティティ ID:** `SECURITY.MAX_ENTITY_BATCH_OCCURRENCE_ROUNDS`(8)。1 つのリクエスト内で同じ ID がより多く
出現すると、書き込み前に **400** で拒否されます
(リクエストレベルの無効な入力 — 207 を返す書き込み後のエンティティごとのエラーとは異なります)。
重複 ID をラウンド分割する**すべての**バッチアップサートエントリーポイントに適用されます:
NGSIv2 `/v2/op/update`、NGSI-LD `entityOperations/upsert`(マージおよび `options=replace`)、
MCP バッチアップサート、および A2A バッチアップサート。

### T0 / FREE プラン(評価および開発用)

**レート制限:**

* 毎分: 3,000 ウェイトユニット(weight-1 GET のみの場合 50 req/sec に相当 — [Endpoint Weights](#endpoint-weights) を参照)
  
* 毎時: 50,000 ウェイトユニット
  
* 毎日: 500,000 ウェイトユニット
  
* バースト許容量: 500 ウェイトユニット
  
* 最大同時実行数: 6 (`ceil(50 × 0.084 × 1.2)`、#3118 / #3113 `read-one` p50)
  
* 1 日あたりの最大通知数: 50,000(#1544; #3118 の後、意図的に `perDay` に紐付けていません)

**ストレージクォータ:**

* エンティティ: 5,000
  
* サブスクリプション: 10
  
* レジストレーション: 5
  
* 時系列データポイント: 10,000

**制限:**

* 最大リクエストボディサイズ: 512KB
  
* 最大レスポンスボディサイズ: 5MB
  
* 最大バッチオペレーションサイズ: 100
  
* 最大ユーザー数: 100

### T5 / STANDARD プラン(小規模本番環境用)

**レート制限:**

* 毎分: 48,000 ウェイトユニット(weight-1 GET のみの場合 800 req/sec に相当)
  
* 毎時: 800,000 ウェイトユニット
  
* 毎日: 8,000,000 ウェイトユニット
  
* バースト許容量: 8,000 ウェイトユニット
  
* 最大同時実行数: 81 (`ceil(800 × 0.084 × 1.2)`)
  
* 1 日あたりの最大通知数: 800,000(#1544; #3118 の後、意図的に `perDay` に紐付けていません)

**ストレージクォータ:**

* エンティティ: 1,000,000
  
* サブスクリプション: 100
  
* レジストレーション: 50
  
* 時系列データポイント: 2,000,000

**制限:**

* 最大リクエストボディサイズ: 1MB
  
* 最大レスポンスボディサイズ: 10MB
  
* 最大バッチオペレーションサイズ: 100
  
* 最大ユーザー数: 100

### T30 / PREMIUM プラン (中規模本番環境 / 専用クラスタ)

**レート制限:**

* 毎分: 60,000 ウェイトユニット (weight-1 GET のみの場合 **1,000** req/sec 相当 —
  公開されたソフト上限 #3137; ステージング GW は #3132 以降 2000 だが、1,500 は公開不可;
  生の値を ×10 すると 1,500)
  
* 毎時: 1,000,000 ウェイトユニット
  
* 毎日: 10,000,000 ウェイトユニット
  
* バースト許容量: 10,000 ウェイトユニット
  
* 最大同時実行数: 101 (`ceil(1000 × 0.084 × 1.2)`、**< ApiReservedConcurrency** を維持する必要あり — 本番 160 / ステージング 256)
  
* 1 日あたりの最大通知数: 1,500,000 (#1544; #3118 以前の値を保持)

**ストレージクォータ:**

* エンティティ: 50,000,000 (専用クラスタ — Atlas M30 相当の Mongo 分離; エントリは引き続き共有; #3141 / #3138)
  
* サブスクリプション: 1,000
  
* レジストレーション: 500
  
* 時系列データポイント: 100,000,000

**制限:**

* 最大リクエストボディサイズ: 5MB
  
* 最大レスポンスボディサイズ: 50MB
  
* 最大バッチ操作サイズ: 500
  
* 最大ユーザー数: 100

### T40 / ENTERPRISE プラン (大規模本番環境 / 専用クラスター)

**レート制限:**

* 分あたり: 60,000 ウェイトユニット (weight-1 GET のみの場合 **1,000** req/sec 相当 —
  PREMIUM と同じ公開ソフトシーリング #3137; 生の ×10 は 3,000 — 共有エントリでは到達不可能、#3132 コールド)
  
* 時間あたり: 1,000,000 ウェイトユニット
  
* 日あたり: 10,000,000 ウェイトユニット
  
* バースト許容量: 10,000 ウェイトユニット
  
* 最大同時実行数: 101 (`ceil(1000 × 0.084 × 1.2)`、**< ApiReservedConcurrency** — 本番 160 / ステージング 256)
  
* 日あたり最大通知数: 3,000,000 (#1544; #3118 以前の値で保持)

**ストレージクォータ:**

* エンティティ: 250,000,000 (Mongo 分離のため専用クラスターが必要 — DEDICATED\_CLUSTER\_ONBOARDING.md / #1492 / #3141 を参照; エントリは #3138 まで共有のまま)。エンティティ + 時系列の上限の同時充填は **M50 推奨** (M40 \~1 TB はステージング avgObjSize \~933 B からの BSON+インデックスサイジングでタイト)
  
* サブスクリプション: 2,000
  
* レジストレーション: 1,000
  
* 時系列データポイント: 1,000,000,000

**制限:**

* 最大リクエストボディサイズ: 10MB
  
* 最大レスポンスボディサイズ: 100MB
  
* 最大バッチオペレーションサイズ: 1,000
  
* 最大ユーザー数: 1,000

> **#3137 公開 rps ルール (裁可 2026-09-15; #3118 の "GW=1000 が上限" という文言に優先):**
> 共有環境が両方の条件下で提供できるもののみを公開:
> (1) 継続的負荷下での**単テナント成功率 100%**、および (2) **他テナント無影響**
> (共有テナントへの測定可能な 429/5xx ブラスト半径なし)。#3132 以降、ステージングエントリは
> `ApiThrottlingRateLimit=2000` / `ApiReservedConcurrency=256` だが、PREMIUM/ENTERPRISE の**公開ソフト
> シーリング**は **1,000 req/s** (`perMinute` 60,000) のまま。
> **`read-one open` (ウォームアップ 2)** (#3132) で測定: 1,000 rps = 100%; 1,500 rps = 95.6% で
> ConcurrentExecutions は 256 にピン留めされ、共有テナントへ \~73k API GW 5xx — したがって 1,500 は
> 継続的**または**バーストとして公開不可能。他の weight-1 GET (list / `types` / `attrs`)
> はクォータウェイト相当のみ; 到達可能な rps は測定されるまで未検証として扱う。
> ENTERPRISE 生 ×10 (3,000) は共有エントリでは到達不可能のまま。専用クラスター
> プランは **Mongo (Atlas) 分離のみ**を意味; エントリ (GW + 予約同時実行数) は
> 依然として共有 — 未公開のエントリパフォーマンスを "専用クラスター" に帰属させないこと
> (#3138)。`production.json` は別の本番カットオーバーまで #3117 エントリのまま。
>
> `maxConcurrency ≈ ceil(publishedRps × 0.084 × 1.2)` は #3113 `read-one` p50 を使用; すべてのプランは
> `ApiReservedConcurrency` (本番 160 / ステージング 256) **未満**に留まる。Epic #3112 rev.3
> 暫定同時実行数値 (STANDARD 64 / PREMIUM 120 / ENTERPRISE 240) は
> reserved ≈320 を想定しており、#3117 以降は**無効**。
>
> テナントの到達可能 rps ≈ `maxConcurrency / latency` (そして公開ソフトシーリング / GW シェアを超えない)。ウェイトユニット予算は依然として適用; カスタマーシートの req/s 数値は
> weight-1 GET 相当。

### CUSTOM プラン

任意の値を設定できるカスタムプラン。管理 API を使用して個別に設定します。

## レート制限

### 固定ウィンドウカウンター

GeonicDB は 3 つのウィンドウ (分/時間/日) にわたって**固定ウィンドウカウンター**を使用します。ウィンドウ
境界は絶対的です: 現在時刻は分/時間/日境界に切り捨てられ
(`src/core/quotas/rate-limit/rate-limit.service.ts` の `getWindowTimestamp()`)、その
切り捨てられたタイムスタンプがウィンドウを識別します。


1. 各リクエストはエンドポイントウェイトに等しい許容量を消費
   
2. リクエストは 3 つのウィンドウすべてに十分な許容量が残っている場合のみ許可される
   
3. ウィンドウが切り替わると、残りの許容量は**全制限にリセット**される —
   段階的に補充されるわけではない

> ⚠️ これは**トークンバケットではなく**、ウィンドウは**スライドしません**。段階的な
> 補充はありません: ウィンドウ境界を越えると許容量全体が一度に復元されます
> (`src/infrastructure/mongodb-kv/rate-limit.ts` の `trySlowPathConsumeMongo()` はローテーション時に
> `remainingMinute = limits.minute - weight` を割り当てます)。補充モデルを想定すると
> 誤った結論につながります — #1806 を参照。そこではフレーキーなテストがその根拠に基づいて誤診されました。

### Counter Key — どのテナントが課金されるか (#2221)

counter key は `<tenant>#<servicePath>` であり、**`<tenant>` は呼び出し元が宣言したテナントではなく、リクエストが承認されたテナントです**。

| Route class                                          | Tenant charged                                                            | Why                                                                                                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Data plane (`/v2/**`, `/ngsi-ld/**`, `/rules/**`, …) | the `Fiware-Service` / `NGSILD-Tenant` header value                       | `checkTenantAccess` has already verified that the caller belongs to that tenant                                                            |
| `/custom-data-models/**`                             | the tenant resolved from the caller's **access token** (`actor.tenantId`) | this route deliberately **skips** `checkTenantAccess` (it is an admin API keyed on `actor.tenantId`), so the header is **unverified** here |

`/custom-data-models` の場合、ヘッダーは counter のために単に無視されるだけでなく、同じ解決されたテナントがプランのルックアップ、リクエスト/レスポンスサイズ制限、`X-RateLimit-*` レスポンスヘッダー、および API コールメトリクスに使用されるため、すべての会計ディメンションが承認決定で使用されたのと同じテナントを指定します。監査ログもこれを使用しますが、このルートでは不活性です: `resolveAuditAction` は `/custom-data-models` パスをマッピングしないため、そもそもここで監査エントリは発行されません。

そのルートでヘッダーをキーにすると、呼び出し元が (a) **別の**テナントを指定することでそのテナントの counter を消費し、(b) リクエストごとに異なるテナントを指定してキーを分散させることで**自身の**制限を回避し、(c) 存在しないテナントを指定することでチェックを完全にスキップする(プランのルックアップが `null` を返し、ブロック全体がバイパスされる)ことが可能になります。

> テナントごとの**同時実行**制限は依然として `/custom-data-models` を除外しています (#1510)。その除外の元々の理由である検証されていないキーはもはや適用されませんが、これを有効にするとこのルートで新しい `429` が導入されることになり、これは正当性の修正ではなく容量ポリシーの決定です。

### Endpoint Weights

異なるエンドポイントには、処理コストに基づいて異なるウェイトが割り当てられます:

| Operation                        | Weight    | Example                                    |
| -------------------------------- | --------- | ------------------------------------------ |
| GET                              | 1         | `GET /v2/entities`                         |
| POST (single)                    | 3         | `POST /v2/entities`                        |
| PATCH/PUT                        | 2         | `PATCH /v2/entities/{id}`                  |
| DELETE                           | 2         | `DELETE /v2/entities/{id}`                 |
| Batch operations                 | 5 × count | `POST /v2/op/update` with 10 entities = 50 |
| Temporal read                    | 2         | `GET /ngsi-ld/v1/temporal/entities`        |
| Temporal write (POST collection) | 3         | `POST /ngsi-ld/v1/temporal/entities`       |

受信したリクエストパスは、`resolveEndpointWeight()` (`src/core/quotas/rate-limit/rate-limit.constants.ts`) によってこれらのエンドポイントテンプレートと照合され、各 `{placeholder}` を単一のパスセグメントとして扱います。これは、`/v2/entities/urn:ngsi-ld:Store:001` のような具体的な本番パスが `DEFAULT_WEIGHT` にフォールバックするのではなく、`GET /v2/entities/{id}` のウェイトに正しく解決されることを意味します (#1521)。

### Burst Allowance

各プランには、短期間の突然のトラフィックスパイクを処理するためのバースト許容量があります。これにより、一時的に制限を超えることが可能になります。

このバースト許容量は、レート制限における事実上のソフトリミットとして常に機能してきました — *拒否*境界は名目上の制限だけでなく、`perMinute/perHour/perDay + burstAllowance` です。#1571 で変更されたのは**可観測性**のみです: バースト許容量内にいる間に名目上の制限を超えることが、`X-Quota-Soft-Exceeded` レスポンスヘッダーを介して表面化されるようになりました。以下の [Soft Limits (Grace Band)](#soft-limits-grace-band-1571) を参照してください。

### Response Headers

レート制限が有効な場合、NGSIv2、NGSI-LD、および Catalog API エンドポイントからのレスポンスには、現在のレート制限ステータスを示すヘッダーが含まれます:

```http
X-RateLimit-Limit-Minute: 600
X-RateLimit-Remaining-Minute: 450
X-RateLimit-Reset-Minute: 1707648000

X-RateLimit-Limit-Hour: 10000
X-RateLimit-Remaining-Hour: 8500
X-RateLimit-Reset-Hour: 1707651600

X-RateLimit-Limit-Day: 100000
X-RateLimit-Remaining-Day: 95000
X-RateLimit-Reset-Day: 1707734400
```

### レート制限を超えた場合の動作

レート制限を超えた場合(つまり、名目上の制限だけでなく、バーストを含む上限 — [Soft Limits (Grace Band)](#soft-limits-grace-band-1571) を参照):


* **HTTP ステータスコード**: `429 Too Many Requests`
  
* **Retry-After ヘッダー**: 次のリクエストが許可されるまでの秒数
  
* **エラーメッセージ**: `{"error": "TooManyRequests", "description": "Rate limit exceeded"}`

### 公開(非認証)エンドポイントのレート制限 (#1075)

認証なしで到達可能な公開エンドポイントは、テナントごとの `QUOTAS.PLANS` とは独立した IP ベースの固定ウィンドウカウンタで保護されます。これにより、OAuth `client_id+secret` のブルートフォースや重い JSON 生成(`/openapi.json` など)による DoS をブロックします。

| Category                    | Endpoints                                                                                                                                       | Per minute | Per hour | Per day | Burst |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------: | -------: | ------: | ----: |
| `metadata`                  | `/openapi.json`, `/api.json`, `/tools.json`, `/llms.txt`, `/.well-known/ai-plugin.json`, `/.well-known/agent-card.json`, `/.well-known/ngsi-ld` |         30 |      300 |   1,000 |    10 |
| `oauth` (per IP)            | `/oauth/token` (`grant_type=api_key` **以外**)                                                                                                    |         20 |      100 |     500 |     5 |
| `oauth` (per `client_id`)   | 同上                                                                                                                                              |         10 |       60 |     200 |     2 |
| `apiKeyExchange`            | `/auth/nonce`, `/oauth/token` (`grant_type=api_key`)                                                                                            |        600 |    6,000 |  60,000 |    50 |
| `auth`                      | `/auth/refresh`                                                                                                                                 |        300 |    3,000 |  30,000 |    50 |
| `publicDereference` (#3199) | `GET /vocab/:tenantId/:term`, `GET /ngsi-ld/v1/jsonldContexts/:contextId`                                                                       |        120 |    2,000 |  20,000 |    20 |

`publicDereference` は `metadata` とは別のバケットであり、フェデレーションピアや RDF クローラによる大量の語彙 / `@context` 参照が 30/分 のメタデータ上限に到達しないようにします。日次クォータは意図的にサブリニア(`perDay < perHour × 24`、`auth` / `apiKeyExchange` と同じ比率ファミリー)です。目的は DB 負荷の減衰のみであり、存在オラクル制御はレート制限のスコープ外です(同じ情報は既に非認証の `jsonldContexts` 経由で到達可能です)。

#### なぜ `apiKeyExchange` を分けたか

`oauth` の 20/分 は上表の用途どおり **`client_id+secret` のオフラインなしブルートフォース対策**として決めた値で、守る対象は「人が設定しうる秘密」である。だが同じバケットが `grant_type=api_key` にも掛かっていた。こちらの脅威モデルは違う:

|             | `client_credentials` | `grant_type=api_key`                                     |
| ----------- | -------------------- | -------------------------------------------------------- |
| 秘密の強度       | 人が設定しうる secret       | `randomBytes(API_KEY.KEY_LENGTH=32)` の hex = **256 bit** |
| 1 リクエストのコスト | なし                   | **PoW** (`POW.DIFFICULTY=16`、平均 65,536 ハッシュ)             |
| 追加の縛り       | なし                   | **origin 制限**（常に検証。`allowedOrigins` 未設定は拒否）              |

> **DPoP は上表の根拠に数えていない** — `OAuthController.handleApiKeyExchange` は proof が提示されれば必ず検証するが、**未提示を拒否するのは API キーの `dpopRequired` が `true` のときだけ**。したがって「全 API キー交換が DPoP で守られている」とは書けない。総当たり耐性は**鍵長 256 bit と PoW** が担う。

総当たり耐性は鍵長で既に確保されており、この枠が実際に縛っていたのは正当なクライアントだけだった。

**何が壊れていたか。** レート制限の識別子は `sourceIp`(`getClientIp`)なので、NAT やキャリアの CGNAT の内側では**その出口 IP を共有する全クライアントが 1 つのバケットを食い合う**。SDK のクライアントは確立時に `/auth/nonce` → PoW → `/oauth/token` の **2 往復**を必ず踏み、`OAUTH.DEFAULT_OAUTH_TOKEN_EXPIRES_IN`(3,600 秒)ごとに再取得する。旧値では:

> **1 つの出口 IP の背後で維持できる SDK クライアントは、恒久的に約 105 台**(`oauth.perHour` 100 + burst 5)が上限。

社員 100 人規模のオフィスが 1 つの NAT から使うだけで詰まる。データプレーンは最下位の FREE プランでも 300/分・5,000/時(`QUOTAS.PLANS.FREE.rateLimit`)あるのに、その入口が 20/分 という**本体より 1〜2 桁細い入口**が前に立っていた。

**実測(2026-09-02 / staging)**: 1 IP から `POST /auth/nonce` を 200 並列:

| 応答  | 件数 | 内訳                                                                                                                                        |
| --- | -: | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 500 | 93 | Lambda スロットル（`Throttles`=93 / `ConcurrentExecutions` max=88 / `Errors`=0）。**スロットルは 429 ではなく HTTP 500 `InternalServerErrorException` で返る** |
| 429 | 72 | 旧 `auth` カテゴリの IP 別レート制限（`Retry-After: 34`）                                                                                               |
| 400 | 35 | ハンドラ到達（= 有効な鍵なら 200）。旧 `auth.perMinute` 30 + burst 5 に一致                                                                                  |

**1 セッション = このバケットを 2 消費する。** `/auth/nonce` と `/oauth/token` は同じキー(`__public:apiKeyExchange:ip:<ip>`)を共有するため、上表の値はクライアント数としては半分で読む:

| 窓 | 上限（+ burst） | 維持できるクライアント数 / IP |
| - | ----------: | ----------------: |
| 分 |         650 |               325 |
| 時 |       6,050 |         **3,025** |
| 日 |      60,050 |            30,025 |

トークン TTL は 3,600 秒なので、「時」の 3,025 が **1 つの出口 IP の背後で維持できるクライアント数**(旧値 約 105 台の約 29 倍)。

**カテゴリ判定は fail-closed。** `grant_type` は `resolveOAuthRateLimitCategory`(`handlers/api/index.ts`)が判定し、body が壊れている・`grant_type` が文字列でないなどで抽出できないときは**厳しい方(`oauth`)に倒す**。

**判定と実処理は同じパーサを使う**(`@api/oauth/oauth.body` の `parseOAuthTokenBody`)。非対応の Content-Type が**明示されている**場合は推測せず拒否する(`Content-Type: text/plain` + `grant_type=api_key` を urlencoded として推測すると、明示的に非対応の型を送るだけで緩い枠を選ばせられる。RFC 6749 §4.4 もトークン要求に `application/x-www-form-urlencoded` を要求している)。推測は **Content-Type が未指定のときだけ**。「同じ条件式を書く」だけでは不十分で、2 実装あった間は次の入力で迂回できた:

```text
Content-Type: application/x-www-form-urlencoded
grant_type=api_key&grant_type=client_credentials&client_id=victim&client_secret=guess
```

旧判定側は `URLSearchParams.get()` の**先勝ち**で `api_key`(緩い枠 + `client_id` 別バケットをスキップ)、controller 側は `entries()` 上書きの**後勝ち**で `client_credentials` を実行していた。Content-Type 未指定時の解析順(判定側は urlencoded のみ / controller は JSON 優先)にも同じ乖離があった。回帰ガードは `tests/unit/handlers/api/oauth-rate-limit-category.test.ts`。

`/auth/nonce` も `apiKeyExchange` に含める。このエンドポイントは body の `api_key` を必須とする **API キー交換専用の入口**で、直後の `/oauth/token` と 1 対 1 で消費されるため、別枠にすると 2 往復のうち片方だけが先に枯れる。

#### `/auth/refresh` も同じカテゴリエラーだった

リフレッシュトークンは `JwtService.verifyRefreshToken` が検証する**署名済み JWT**（任意で DPoP 鍵バインド)なので、署名鍵なしには作れない。総当たりが成立しない相手に `client_id+secret` 対策由来の 30/分 を掛けていた。

`authConfig.jwtExpiresIn` の既定は `'1h'` なので 1 セッション = 1 時間に 1 消費。旧値では **1 つの出口 IP の背後で維持できるユーザーセッションは約 205**（社員 300 人のオフィスが 1 つの NAT からアプリを使うだけで詰まる)。3,000/時 へ引き上げ、**約 3,050 セッション/時/IP**（`apiKeyExchange` の実効 3,025 と同じ桁)にした。

`/auth/login` はこの枠の対象外で `LoginProtectionService` が別途保護する。あちらは**推測可能なパスワード**が相手なので、厳しい制限のままが正しい。

Notes:


* `/auth/login` はこの制限の対象では**ない**。これは `LoginProtectionService` (email + IP ベースの段階的ロックアウト)によって保護される。
  
* `/health`、`/health/live`、`/health/ready`、`/version` はこの制限の対象では**ない**(ヘルスチェックポーリング用)。
  
* バケットストア (DynamoDB / MongoDB) が利用不可能な場合、リクエストは通過を許可される。パブリックサーフェスをオフラインにしないよう、インフラストラクチャエラーでフェイルクローズしない。
  
* デフォルト値は `src/config/defaults.ts` の `PUBLIC_RATE_LIMIT` に集約されている。
  
* 上表の Lambda スロットル (HTTP 500) はこのレート制限とは**別の壁**で、予約同時実行数 (`ControlPlaneReservedConcurrency`) の話。カテゴリ分離では直らない。

## テナント毎同時実行数上限 (#1510 / Epic #1485)

req/s の rate-limit だけでは「per-query コスト × 同時実行数」を bound できない。1 テナントが多数の重いリクエストを**同時に**投げると、Lambda 予約枠 (#1508) や DB 接続を占有し、他テナントの公平性が損なわれる。これを補うため、**テナント毎の同時 in-flight リクエスト数**に上限を設ける。


* **常時有効 (feature flag なし)**。有限な MongoDB を 1 テナントの同時大量リクエストから守るため、リミットは常に効いている必要がある。全データプレーンリクエストにスロット取得/解放の 1 往復 (DynamoDB / standalone は Mongo) が加わるが、これは DB 保護の代償。
  
* 上限はプラン別 `rateLimit.maxConcurrency` (FREE=6 / STANDARD=81 / PREMIUM=101 / ENTERPRISE=101、`src/config/defaults.ts`)。`customQuotas.rateLimit.maxConcurrency` で per-tenant 調整 (暴走テナントを絞る / 大口テナントを緩める)。正の値は**実行時に最大 1000 (`QUOTAS.CONCURRENCY.MAX_CONCURRENCY`) へクランプ**される (探索コストと Lambda 同時実行の現実的上限)。**`maxConcurrency` が 0 のプラン/テナントは無制限** (acquire が即 no-op、DDB アクセスなし) — 特定テナントだけ無効化したい場合に使える。
  
* **キーは per-tenant** (`Fiware-Service` / テナント名のみ。servicePath は含めない — servicePath 回しでの回避を防ぐ)。`scopeKeyToDeployment` でデプロイメント間も分離。
  
* **方式: 固定スロット lease セマフォ (方式D)**。テナントごとに `0..max-1` の固定スロットを持ち、リクエストは空き (または lease 失効) スロットを 1 つ条件付き書き込みで排他取得する。
  
  * **overshoot なし**: 各スロットは条件付き書き込みで排他されるため、同時保持は最大 `max`。
    
  * **恒久ロックアウトなし**: Lambda timeout/kill で解放が漏れても、lease (`CONCURRENCY.LEASE_MS`=35s) 失効で他リクエストが再取得できる (自己修復)。DynamoDB TTL はストレージ掃除用。
    
* 上限超過は **429 TooManyRequests** (`recordQuotaViolation('concurrency')`)。
  
* カウンタは rate-limit と同じ `RateLimitBucketsTable` (`pk=<tenant>#concurrency#{slot % N}` / `sk=slot`、N = min(`CONCURRENCY.SHARD_COUNT`, max)、#3125) を流用 (新テーブル不要、IAM 既存)。standalone は Mongo `concurrencySlots` コレクション (unique index + TTL)。シャード化はテナント単位 hot partition → DDB ThrottlingException → SDK 再試行レイテンシ → Lambda 予約枠飽和 → HTTP 500 の連鎖を防ぐ。DynamoDB SDK の `maxAttempts` は `QUOTAS.DDB_MAX_ATTEMPTS` (=2、SDK 既定 3 より短い) に短縮するが、**これ単独では hot partition は消えない** — pk シャード化とセットで採用する。値 2 は #3129 の staging 1 vs 2 A/B(独立テナント再実測)で確定(下記)。concurrency / rate-limit / token-invalidation / deployment / streaming client / api-call-metrics / failover-state / monitoring で**同じ定数に統一**(意図的非対称は残さない)。デプロイ直後はレガシー `pk=<tenant>#concurrency` (無接尾辞) の lease が最大 \~35s 残るため、新旧 pk が一時的に共存しうる (lease 失効で自然消滅。永続移行は不要)。

#### staging 実測 (#3125, 2026-09-13) — read-one open 同日 A/B

条件: `tests/load/run.mjs` / target `https://geonicdb.geolonia.com` / ENTERPRISE 使い捨てテナント (`maxConcurrency=500`) / open `--stages 400,600 --duration 12 --warmup 2` / Atlas 冷却後 (`ConnectionsMax` ≲ 180) / WAF RateLimitPerIP 一時 2e6。baseline = 当時 staging 本番コード、after = 本修正の一時デプロイ(計測後にコード・WAF とも復元)。

|                                                     | 400 rps ok% | 600 rps ok% | 600 ×500 | 600 p99 | ConcurrentMax | `#concurrency` fail-open / DDB ThrottlingException | Lambda Throttles |
| --------------------------------------------------- | ----------: | ----------: | -------: | ------: | ------------: | -------------------------------------------------- | ---------------: |
| **before** (unsharded pk)                           |        100% |   **78.7%** | **1534** | 2516 ms |     (予約枠張り付き) | ≥50 / ≥50                                          |           576+75 |
| **after** (`#concurrency#{slot%N}` + maxAttempts=2) |        100% |    **100%** |    **0** |  225 ms |        **61** | **0 / 0**                                          |            **0** |

成果物: `/tmp/section9/s9-3125/measure/readone-open-before.json` / `readone-open-after.json`。コールドデプロイ直後の汚染 run は `readone-open-after-cold-invalid.*` として除外(Atlas 接続枯渇・#3117 注意どおり)。#3117 の前日実測 (600 rps で \~14% 500) も同型。本 A/B で因果が `#concurrency` hot partition であることを再確認し、修正で連鎖が切れることを示した。

#### staging 実測 (#3129, 2026-09-13) — maxAttempts 1 vs 2(独立テナント再実測)

条件: `tests/load/run.mjs` / target `https://geonicdb.geolonia.com` / **値ごとに使い捨て ENTERPRISE テナントを分離** / open `--stages 200,400,600,800 --duration 12 --warmup 2` (200/400 はランプ。比較対象は 600) / Atlas 冷却後 (`ConnectionsMax` ≲ 200) / WAF RateLimitPerIP 一時 2e6 / 一時 `UpdateFunctionCode`(計測後 baseline・WAF 復元)。

|                               | テナント           |  600 ok% | 600 ×500 | 800 ×500 | Lambda Throttles | hour 残（800 後） |
| ----------------------------- | -------------- | -------: | -------: | -------: | ---------------: | ------------: |
| **maxAttempts=2**（先行・独立）      | `lt3129ma2_*`  | **100%** |    **0** |    **0** |            **0** |        \~271k |
| **maxAttempts=1**（先行・独立・長冷却後） | `lt3129ma1f_*` | **100%** |    **0** |    **0** |            **0** |        \~271k |

**初回同一テナント順次計測は棄却**: 先に ma2→続けて ma1 を同一テナントで回すと、hour 残量の減少と Atlas 汚染(`Server selection timed out` + ConcurrentMax=160)が後段に乗り、「1 側だけ 500×37 / Throttle×29」に見える。これは **maxAttempts 効果ではなく順序・共有予算の交絡**(CodeRabbit 指摘どおり)。再実測では独立テナント + 各値を「冷却後の一次計測」として揃えた。

2→1 の連続デプロイ直後に測った ma1(二次)は Atlas 汚染で無効(`ma1-second-*-polluted`)。成果物: `/tmp/section9/s9-3129/measure/revalidate/ma2-first-open.json` / `ma1-first-open.json` / `revalidate-summary.json`。

**結論**: 制御条件下では 600 rps の HTTP 500 / Lambda Throttles に 1 vs 2 の差は出ない。それでも **2 を採用**する — 一過性 DDB throttle の再試行 1 回分を残し、SDK 既定 3 より短くする(#3125 の意図を維持)。1 への短縮はクライアント可視の改善が無く、吸収余地だけ失う。


* **fail-open**: スロットストア障害時はリクエストを通す (`metric: 'ConcurrencyInfrastructureFailure'` / `'ConcurrencyCheckTransientFailure'`。rate-limit とは別系統メトリクス)。
  
* 定数は `QUOTAS.DDB_MAX_ATTEMPTS`(旧 `CONCURRENCY.DDB_MAX_ATTEMPTS` から昇格、#3129)。
  
* **補足**: `/auth`・`/me`・`/admin`・`/oauth` の制御プレーン経路は #1507 で別 Lambda 関数 (ControlPlaneHandler) に分離済みで、本 per-tenant concurrency 上限の対象外 (認証後のデータプレーンのみ)。制御プレーンの compute 隔離は #1507 (関数分離) の守備範囲。

## DB 過負荷 circuit-breaker (#1492 P3 / Epic #1485)

**機能フラグを持たない(常時有効)。設定する環境変数はない。**

### 位置づけ

7-21 のインシデント (1 テナントの非効率クエリが MongoDB の CPU を焼き切り、巻き添えで
`/auth/login` を含む全 API が 500) に対する**最後の安全弁**であって第一防衛線ではない。
根治は #1486-1490 の index 硬化 (docs examined を bound)、入口制御は #1508 (Lambda 予約同時実行 +
API GW throttling) と #1510 (テナント毎同時実行上限)。本 breaker はそれらをすり抜けた過負荷が
起きたときに、**制御プレーンを生かしたままデータプレーンだけを落とす**。

### なぜ機能フラグを置かないか

当初は「誤発火が怖い」という理由で opt-in の環境変数を用意していたが、**判定ロジック上その心配が成立しない**ため撤去した。

3 シグナルのうち「リクエストが失敗していなくても立ちうる」のは **ticket 枯渇だけ**で、残る 2 つ(`maxTimeMS` 超過 / 接続エラー)はどちらも**実際に失敗した件数**である。**2 つ以上**を要求している以上、成立する組み合わせには必ずどちらかが含まれる — つまり **breaker は「窓内に実際の失敗が閾値以上ある」ときにしか開かない**。それは誤発火ではなく縮退すべき状態そのものなので、止める必要が生じにくい。

加えて、**環境変数を増やすこと自体にコストがある**(運用担当の選択肢と学習コストが増え、設定ミスの余地が広がる)。提供プランは数通りに絞る方針であり、DB 自衛の縮退はプランや環境で差をつける性質のものでもない。

常時有効にしたことで判定は**データプレーンの全リクエスト**で走るが、**平時のコストは 0** である。ticket サンプル (`serverStatus`) を取りに行くのは「失敗シグナルがちょうど 1 つ」のときだけで、2 シグナル成立が条件である以上それ以外では ticket が判定を変え得ないため(0 なら 1 にしか届かず、2 なら ticket 抜きで既に成立)。失敗が 1 件も無い通常運転では DB に一切問い合わせない。

閾値 (`QUOTAS.DB_OVERLOAD_BREAKER`) を調整したい場合はコード変更 + デプロイで行う。トレードオフとして「コンソールで env を切って即停止」はできないが、上記のとおり停止の必要性が低いため許容する。「実際の失敗が無ければ開かない」ことは unit test で直接固定している。

### 検知 — 単一指標にしない

MongoDB 公式は過負荷指標として WiredTiger の concurrency ticket キューを推奨する (CPU% は
遅行指標)。ただし MongoDB 7.0+ は動的チケットで内部 back-pressure を持つため、ticket 飽和だけでは
「重いが正常に捌けている」状態と区別できない。**3 シグナルのうち 2 つ以上**が成立して初めて開く:

| # | シグナル                                                         | 取得方法                                        | コスト                 |
| - | ------------------------------------------------------------ | ------------------------------------------- | ------------------- |
| 1 | WiredTiger ticket 枯渇 (空き比率 ≤ `TICKET_EXHAUSTION_RATIO`)      | `serverStatus` を `SAMPLE_INTERVAL_MS` 間隔で取得 | DB 往復あり (間隔で bound) |
| 2 | `maxTimeMS` 超過 (503) が窓内で `TIMEOUT_THRESHOLD` 件以上            | プロセス内カウンタ                                   | ゼロ                  |
| 3 | serverSelection / 接続エラーが窓内で `CONNECTION_ERROR_THRESHOLD` 件以上 | プロセス内カウンタ                                   | ゼロ                  |

2 と 3 は**既に起きた失敗を数えるだけ**なので DB に一切問い合わせない。1 のみ `serverStatus` を
使うが、**breaker が開いている間もサンプリング間隔を縮めない** (過負荷中に監視クエリで追い打ちを
かけない)。`serverStatus` 自体にも `maxTimeMS` を付けて breaker がハングしないようにしている。

### fail-safe の向き

**シグナルが取れない / 判定が失敗したら閉じたまま (= 通す)。** 監視の一時的な失敗を全面障害へ
増幅させない。ticket が取得できない場合はシグナル 1 を「不明」として扱い、**成立に数えない** —
したがって監視だけが壊れている状況では開かない。

ただし「DB に接続できない」場合は ticket が取れないだけでなく**リクエストが実際に失敗している**ので、
その失敗がシグナル 2/3 として記録され 2 つ揃えば開く。fail-safe は「シグナル不足で開かない」であって
「失敗の証拠が揃っても開かない」ではない。

### 何を落とし、何を落とさないか

**落とすのはデータプレーンだけ。** これは主として**判定を置く位置**で保証している —
`/health` `/version` `/.well-known/**` と公開メタデータは `routeMetaRequest` が、`/auth/**`
`/oauth/**` `/me/**` `/admin/**` は各ルータが、いずれも breaker の判定より前で return する
(制御プレーンは #1507 で別 Lambda 関数にも分離済み)。

**例外は 1 つだけ**: `/statistics` `/cache/statistics` `/metrics` は認証・認可を通ったあと
**breaker の判定より後**のブロックで処理されるため、位置による保証が効かない。これらは
`isPostAuthOpsPath()` で明示的に除外する — **障害の最中にこそ状況を観測したい**経路であり、
breaker がここを 429 にすると診断手段を自分で奪うことになる。この除外は (位置で守れている
他の経路と違い) **実際に到達する**ので、E2E で「breaker が開いていても `/statistics` が 200」を
固定し、除外を外す変異で赤くなることを実測している。

> **この判定を現在位置より前へ移動しないこと。** 移動した瞬間、7-21 で失われた `/auth/login` を
> breaker 自身が落とすようになる。`tests/e2e/features/common/db-overload-breaker.feature` が
> 「過負荷中でも login / health / admin が 200」を固定している。

落としたリクエストは **429 TooManyRequests + `Retry-After`** (`recordQuotaViolation('dbOverload')`)。
判定は**認証・認可の後、レート制限の前**に置く — 未認証の相手にサービスの過負荷状態を教えず、
かつ開いている間は DynamoDB へのレート制限往復すら省く。

### 状態遷移

`closed` → (2 シグナル成立) → `open` → (`OPEN_DURATION_MS` 経過) → `half-open`
→ (許可された probe が回復を観測) `closed` / (まだ過負荷) `open`。

**通過率は half-open にいる間の全リクエストに適用する。** probe に選ばれなかったリクエストは
落とすが**状態は half-open のまま**留まり、次のリクエストにも同じ確率が掛かる。閉じるのは
「**許可された probe が回復を観測した**」ときだけ — こうしないと、1 回目を遮断しても 2 回目が
無条件に通って全開放され、回復直後に同じ波形で再飽和しうる。

**状態は実行環境ローカル**で、共有ストアを使わない。過負荷時に「breaker の状態を読むために別ストアを
叩く」ことがそれ自体レイテンシと障害点になるため。shedding は全コンテナ一斉ではなく徐々に効く。

### 定数

`QUOTAS.DB_OVERLOAD_BREAKER` (`src/config/defaults.ts`) のみ。**有効/無効を解決する設定モジュールは存在しない**
— breaker は機能フラグを持たず常時有効で、閾値の変更はコード変更 + デプロイで行う (理由は上記「なぜ機能フラグを置かないか」)。

**#3117 での閾値引き下げ (TIMEOUT/CONNECTION 5→3, OPEN 10s→15s)**: 入口 (API GW 1000 rps) を広げた分、
DB が落ちる前に絞る意図。一方でコールド接続のハンドシェイクテールは未根治のため、デプロイ直後など
一過性の失敗が閾値に届きやすく、**誤遮断のリスクが上がる**点に注意(上記 staging 節の注記と同じ)。

## Storage Quotas

### リソースタイプ

クォータは 4 種類のリソースに対して設定されます:


1. **Entities** - NGSIv2/NGSI-LD エンティティの総数
   
2. **Subscriptions** - アクティブなサブスクリプションの総数
   
3. **Registrations** - コンテキストソース登録の総数
   
4. **Temporal data points** - 時系列データポイントの総数

### Temporal Data Point ごとの BSON サイズ上限 (#2513)

上記のストレージクォータは**ドキュメント**をカウントし、バイト数ではありません。これとは別に、各 temporal データポイント(1 つの MongoDB ドキュメント)は `TEMPORAL.MAX_DATA_POINT_BSON_BYTES`(**64 KiB**、全プラン)に制限され、挿入直前(暗号化や `location` / `expiresAt` などの派生フィールドの後)に構築されたドキュメントに対して `BSON.calculateObjectSize` で測定されます。これは受入ガードであり、テナント全体のバイトバジェットではありません(バイトバジェットは #1559 で待機中)。

**エントリーポイント別の拒否形式:**

| Entry                                                                      | HTTP status / type                                                                                                                                                                                    |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single HTTP write (`POST /temporal/entities`, `…/attrs`, `PATCH` instance) | **413** `RequestEntityTooLarge`                                                                                                                                                                       |
| Batch (`POST /temporal/entityOperations/create` / `upsert`)                | **207** with per-entity error typed as `RequestEntityTooLarge` (same type URI as single-write 413; #2544)                                                                                             |
| MCP (`/mcp`) / A2A (`/a2a`)                                                | **HTTP 200**. MCP returns a tool result with `isError: true`; A2A returns an error message. The size-exceeded text appears in that payload, but neither path exposes `errorCode` (do not assume 413). |

**Metrics:** この上限を超えると、`recordQuotaViolation('requestSize')` を介して `requestSizeExceeded` が増分されます。このカウンターは**粒度が混在**しています — HTTP ボディサイズの拒否は**リクエストごと**ですが、temporal のデータポイントごとの拒否は**データポイントごと**です。`addAttributeInstances` / マルチポイントビルドの場合、バッチが失敗する前にすべてのオーバーサイズドキュメントが測定されるため、1 回の呼び出しで N 個のオーバーサイズポイントがあるとカウンターが **N** 回増分されます(その後、最初のサイズエラーが再スローされ、何も挿入されません)。

**暗号化テナント:** 測定されるドキュメントは**保存**形式です。エンベロープ暗号化は `value` を base64 暗号文フィールド(約 1.33 倍の拡張)に置き換えるため、実効的な平文の上限は低くなります — 目安として約 **48 KiB** です。

**レガシーのオーバーサイズポイント:** PATCH は完全な保存ドキュメントを再構築し、その**再構築された** BSON サイズが 64 KiB 以下の場合にのみ許可されます。`value` の縮小が通常の修正方法ですが、他の削減(例えば `attrMetadata` のクリア)もカウントされます — `observedAt` のみの PATCH でオーバーサイズの再構築が残る場合でも 413 が返されます。エラーメッセージは、リクエストボディサイズではなく、**保存されたデータポイントサイズ**を参照します。

**カウントとサイズの両方が拒否する場合の優先順位**: ハンドラーのカウントベースのストレージクォータチェックが最初に実行されます → **507** `InsufficientStorage`。サイズは挿入時にのみチェックされるため、既にポイント数を超えているリクエストは BSON ガードに到達しません。

### 事前チェック

ストレージクォータは作成操作の**前に**チェックされます:


* バッチ操作の場合、すべてのエンティティがクォータ内に収まる場合にのみ実行が進行します
  
* 1 つでもクォータを超える場合、操作全体が拒否されます(オール・オア・ナッシング)

#### エンティティ数の受入には、`countDocuments` ではなく近似カウンターを使用します (#3155)

ENTERPRISE スケールの `maxEntities`(#3141 以降は 250M)では、共有 `entities` コレクションに対するライブの `countDocuments` は、3 秒のインタラクティブ `maxTimeMS` 内に完了できません — `docs/PERFORMANCE_ASSESSMENT.md` のカウントラダーは、10M のマッチしたドキュメントから `MaxTimeMSExpired` が始まることを測定しており、関係はおおよそ線形です(スキャンを回避するインデックス形状はありません。250M に外挿すると約 75〜95 秒)。そのスケールでのリクエストごとの `countDocuments` は、テナントが実際に制限に近いかどうかに関係なく、大規模テナントのすべての書き込みを 503 でフェイルクローズさせます。

エンティティ受入(`StorageQuotaRepository.getEntityCount`)は、代わりにテナントごとの近似カウンター(`entityCounters` コレクション、`_id` = テナント名)を読み取ります。これは段階的に維持されます: 物理的なドキュメント数を変更するすべての書き込みパス(`create`、`batchCreate`、`batchUpsert`、`batchReplace`、`delete`(ハード)、`deleteMany`、`deleteDuplicates`)は、リクエストされたカウントではなく、**実際の** MongoDB 書き込み結果(`insertedCount` / `deletedCount` / `upsertedIds` サイズ)によってカウンターを調整します — したがって、部分的な `ordered:false` バッチ失敗も正しくカウントされます。TTL ベースの物理的な有効期限切れ(MongoDB のネイティブ TTL モニター on `idx_entity_ttl`)にはアプリケーションフックがなく、リアルタイムでデクリメント**されません**。これはカウンターを上方(過剰カウント)にのみドリフトさせ、受入のためのフェイルクローズ方向です(テナントがクォータを超えることを決して許しません)。

コールドテナント(まだカウンタードキュメントがない — 例えば、この機能がデプロイされた直後の既存テナント)は、元の `countDocuments` パスに一度だけフォールバックし、結果から遅延的にカウンターをシードするため、テナントごとの最初の受入チェックのみがフルスキャンコストを支払います。ドリフト(TTL 有効期限切れおよび見逃されたエッジケースから)は、`QuotaMonitoringSweeper`(`rate(1 hour)`)によって修正されます。これは、クライアント可視のリクエストパスの外で実行されるため、はるかに大きな `maxTimeMS`(`QUOTAS.ENTITY_COUNTER_RECONCILE_MAX_TIME_MS`、4 分)で再カウントし、カウンターを正式な値に `$set` します。

使用状況表示(`getStorageUsage`、管理クォータ情報エンドポイントと同じスイーパーで使用)は、同じカウンター対応パスを通じてエンティティを読み取ります — subscriptions/registrations(小さな上限、≤2000/≤1000)と temporal(既にバケット最適化済み、以下を参照)のみが、直接 `countDocuments` を使用します。

### レスポンスヘッダー

`X-Storage-Quota-*` レスポンスヘッダーは**実装されていません**。ヘッダービルダー (`buildStorageQuotaHeaders`) は未使用のコードとしてのみ存在し、削除されました (#2604)。現在の使用状況と制限は、NGSIv2 / NGSI-LD / Catalog のレスポンスヘッダーからではなく、[management API](#management-api) (`GET /admin/tenants/{tenantId}/quotas`) から利用可能です。

レスポンスヘッダーが後で実装される場合、それは公開 API 契約の変更であり、明示的な設計決定が必要です(使用カウントがタイムアウトした場合の fail-closed と fail-open の選択を含む)。

### ストレージクォータを超過した場合の動作

ストレージクォータは**ソフトリミット**です (#1571): プランの名目上の制限を超える使用は、拒否される前の猶予上限まで許可されます。2 段階モデルについては、以下の [Soft Limits (Grace Band)](#soft-limits-grace-band-1571) を参照してください。猶予上限を超える使用のみが拒否されます:


* **HTTP ステータスコード**: `507 Insufficient Storage`
  
* **エラーメッセージ**: リソースタイプ、現在の使用状況、プランの名目上の制限、実際に適用された猶予上限を含みます
  
* **例**: `{"error": "InsufficientStorage", "description": "Storage quota exceeded for entities. Current: 12000, Limit: 10000 (soft limit; grace ceiling 12000), Requested: 1", "details": {"resourceType": "entities", "current": 12000, "limit": 10000}}`
  — `details.limit` は常にプランの**名目上の**制限であり、猶予上限ではないことに注意してください。上限はメッセージテキストにのみ表示されます。

### 時系列データポイントクォータと Entity デュアルライト (#2508)

`maxTemporalDataPoints` は Temporal Evolution インスタンスを上限制限します。`TEMPORAL_ENTITY_DUAL_WRITE=true` の場合、Entity API の書き込みもこのクォータを消費します。オーバーフロー時でも **Entity 書き込みは成功** (2xx) します。時系列への追記のみがドロップされ、警告ログと `recordQuotaViolation('storageQuotaDropped')` が記録されます。これは `storageQuotaExceeded` (507 拒否) とは別にカウントされます。上限に達した後は履歴にギャップが生じます。Entity API のステータスコードではなく、クォータメトリクス / アラートを監視してください。長期稼働デプロイメントでは `TEMPORAL_DATA_RETENTION_DAYS` (TTL) との組み合わせを推奨します。

**バッチデュアルライト承認 (#2549):** デュアルライトを遅延実行するバッチ Entity 書き込み (`entityOperations/update`・`merge`、MCP `replace`、および既存の create/upsert/bulk-update バッチパス) では、時系列クォータはバッチ内の属性ポイント数の合計で **1 回だけ** チェックされます (`maybeRecordTemporalEvolutionBatch`)。この単一の承認が失敗した場合 (クォータ超過または count の `maxTimeMS` 超過)、**バッチ全体のデュアルライトがドロップ** されます。同一リクエスト内の前半のエンティティに対する部分的な時系列追記は行われません。(エンティティ単位の Entity 書き込みは引き続き成功します。) #2549 以前は、`entityOperations/update`・`merge` と MCP `replace` はエンティティ単位で承認していたため、同一リクエスト内の前半のエンティティは残りのクォータがなくなるまで履歴を追記できました。Create/upsert バッチパスは既に全か無かの承認契約を使用していました。#2549 は遅延パスをこれに合わせました。

時系列ポイントの承認は、`countDocuments` を **`maxTimeMS` のみ** で使用します (`getTemporalDataPointCountForAdmission`)。`$limit` は **追加しないでください** — MongoDB 8.0 ではバケットレベルのカウント最適化が無効化され、クォータ未満のテナントが遅くなります (#2508 SECREVIEW4)。カウントがタイムアウトした場合、HTTP 承認は **503** で拒否し、`recordQuotaViolation('storageQuotaCheckTimedOut')` を記録します。Entity→Temporal デュアルライトがカウントタイムアウトでドロップされた場合も同じカウンターがインクリメントされます (Entity 書き込みは引き続き成功)。507 拒否と `storageQuotaDropped` の両方とは別です。使用状況表示 (`getStorageUsage`) は時系列カウントに同じ `maxTimeMS` を適用します (`$limit` なし) (#2562)。タイムアウトは fail-closed で伝播し (管理クォータ / 監視 → 503)、部分的な使用状況オブジェクトは返しません。

レート制限 (上記) は **インバウンド** API リクエストを制限します。#1544 まで、**アウトバウンド** 通知ファンアウトを制限する次元はありませんでした。少数の書き込みリクエストが、多数の一致エンティティを持つサブスクリプション、または多数のサブスクリプションをトリガーし、プランに紐付いた上限なしに無制限の HTTP/MQTT 通知配信にファンアウトする可能性がありました。

> **これらの値はエンジニアリングデフォルトであり、価格調整の対象です** (#1544 の裁可待ち、2026-08-15)。意図的に顧客向け `docs/customer/PLAN_QUOTAS.md` にはまだ公開 **していません** — #1544 では、この数値は ENTERPRISE サブスクリプション制限の再設計と合わせて決定する必要があると述べられています。この批准前に定数を変更しても、顧客に見えるコミットメントの変更にはなりません。


* **新しいクォータ次元**: `rateLimit.maxNotificationsPerDay` (`QUOTAS.PLANS[*]`、`src/config/defaults.ts`) — FREE=50,000 / STANDARD=800,000 / PREMIUM=1,500,000 / ENTERPRISE=3,000,000 (各プランの `rateLimit.perDay` と同じ値。1 回の通知配信のコスト — EventBridge + Lambda ×3 + SQS + Webhook 宛先への egress + CloudWatch Logs — は 1 回のインバウンド書き込みリクエストと同じオーダーであるため。この制限の意図は、通知駆動コストがインバウンドリクエスト駆動コストを上回らないようにすることです)。`customQuotas.rateLimit.maxNotificationsPerDay` で上書き可能 (非負、最大 100,000,000 — [カスタムクォータの設定](#configure-custom-quotas) を参照)。`0` はそのテナントのすべての通知配信を明示的に停止します。
  
* **ウィンドウ**: UTC カレンダー日 (`YYYY-MM-DD`)、7 日間の TTL を持つ MongoDB 日次バケット (`notificationCounters`、コントロールプレーン側) で追跡されます。
  
* **消費ポイント**: 送信直前、通知ファンアウトパス上 (トリガーとなる書き込み上ではない)。**インプロセスリトライ** (`retryWithBackoff`) は、ゲートがリトライループの外側にあるため、バジェットを 1 回だけ消費します。**Lambda パス上の SQS 再配信は再度消費します** — `deliverNotification` はすべてのインプロセスリトライが失敗した後に例外をスローし、それが SQS を再配信させ、再配信されたメッセージは再度ゲートに入ります。正確に 1 回のアカウンティングは、at-least-once キューをまたいで達成できません。カウンターは配信の上限であり、個別通知の下限です。カウンターは **ゲートを通過して実際にディスパッチされた** 通知に対してのみ進みます — クォータが拒否した通知はカウントされないため、保存された値は制限を超えてインフレートせず、コスト見積もりに直接使用できます。その後失敗したディスパッチもカウントされます。ファンアウトコスト (Lambda 実行時間、アウトバウンド試行) は既に発生しているためです。
  
* **超過時の動作**: 通知は **ドロップ** され、警告がログに記録され (`Notification dropped: daily notification quota exceeded`)、メトリクス (`notificationQuotaExceeded`) が発行されます。**サブスクリプション自体は無効化されません** — クォータ枯渇時の無効化は、コストガードレールを意図したものに対して大きな可用性ブラスト半径となります。通知配信はトリガーとなる API リクエストの外で発生するため、この拒否に対する HTTP レスポンスはありません。
  
* **fail-open**: カウンターストアが利用不可の場合、通知は許可されます — インフラストラクチャの瞬断で通知配信をオフラインにしないよう、レート制限 (#1492) で既に行われているのと同じ選択です。
  
* **可観測性**: `GET /admin/tenants/{tenantId}/quotas` の `currentUsage` には、`rateLimit` と `storage` に加えて 3 番目の独立した次元が含まれます: `notifications.day = {used, limit, remaining, usagePercent, date}`。
  
* **スコープ**: 通常のサブスクリプション通知 (HTTP/MQTT、Lambda およびスタンドアロンパス) **およびコンテキストソースサブスクリプション通知** (`csource-notification.service.ts`、独自の `fetch` で登録変更を外部エンドポイントにファンアウトする) の両方。後者を除外すると、`csourceSubscription` が同じ制限の無制限バイパスになります。
  
* **既知の制限**: この上限は HTTP/MQTT 経由のサブスクリプション通知配信にのみ適用されます。WebSocket/SSE イベント配信は別のメカニズムであり、この制限の対象外です。

### テナント毎の通知同時実行数 (#2269 / #1544 AC3)

遅い webhook 宛先が**他のテナント**への通知配信を遅延させてはなりません。`NOTIFICATION.MAX_CONCURRENT` はプロセス / Lambda 呼び出しの制限であり、**テナントの次元がありません**。第二の制御プレーンがなければ、1 つのテナントの遅い HTTPS ラウンドトリップがすべての送信中スロットを占有する可能性があります。

| Control                                    | Scope                                                                 | Exceed behavior          |
| ------------------------------------------ | --------------------------------------------------------------------- | ------------------------ |
| `NOTIFICATION.MAX_CONCURRENT` (default 10) | Process / invocation                                                  | Chunks the SQS batch     |
| `rateLimit.maxNotificationConcurrency`     | Per tenant (Dynamo/Mongo lease slots, pk `#notification-concurrency`) | **drop + warn + metric** |

| Plan             | `maxNotificationConcurrency` |
| ---------------- | ---------------------------- |
| FREE (T0)        | 2                            |
| STANDARD (T5)    | 5                            |
| PREMIUM (T30)    | 10                           |
| ENTERPRISE (T40) | 20                           |


* **名前空間の分離**: 通知スロットは `#notification-concurrency` を使用し、API パスの `#concurrency` (#1510) とは異なります。一方を埋めることでもう一方が枯渇してはなりません。
  
* **順序**: 同時実行スロットは 1 日の通知クォータを消費する**前に**取得します。これにより、同時実行数の低下が 1 日のカウンターを膨張させることがなくなります。
  
* **パス**: Lambda の `notifier.ts`、スタンドアロンの `notification-delivery.ts`、および csource の `csource-notification.service.ts` はすべて `acquireNotificationSendSlot` / `withNotificationSendSlot` を共有します。
  
* **リース**: `NOTIFICATION.CONCURRENCY.LEASE_MS` (150s) は `TIMEOUT_MS` × リトライ + バックオフをカバーし、送信中のものが盗まれないようにします。
  
* ストア障害時は **fail-open** (#1510 / 1 日の通知クォータと同じ)。
  
* **顧客向けの `PLAN_QUOTAS.md` にはまだ記載されていません** — 公平性制御であり、販売されるクォータ行ではありません (`defaults.ts` の `maxNotificationsPerDay` と同じ例外注記)。

`TIMEOUT_MS` 自体はこの変更では 30000 ms のままです。これを下げることは別の互換性判断です (フォローアップ)。

## ソフトリミット (グレースバンド) (#1571)

> **GeonicDB 拡張機能。** これは NGSIv2/NGSI-LD で義務付けられているものではありません — これは GeonicDB が `docs/customer/PLAN_QUOTAS.md` §5 で行ったコミットメント (「上限は安定運用の目安であり、超過した瞬間にご利用が停止するものではありません」) を履行する方法です。

ストレージクォータとレート制限は、単一のハードカットオフではなく、**2 段階**の受付チェックを適用します:

| Stage      | Condition                       | Behavior                                                                           |
| ---------- | ------------------------------- | ---------------------------------------------------------------------------------- |
| Normal     | usage ≤ nominal limit           | Admitted. No signal.                                                               |
| Grace band | nominal limit < usage ≤ ceiling | **Admitted.** `X-Quota-Soft-Exceeded` response header + warn log + metrics counter |
| Rejected   | usage > ceiling                 | Rejected, same as before (`507` / `429`)                                           |

**グレースバンドは無制限ではありません。** ハード上限は依然として適用されるため、これは #1485 (テナントごとの同時実行数 / DB 過負荷ブレーカー) の DB 保護保証や #1454 の結果サイズ強化を損なうものではありません — グレースバンドは短期間のバーストを吸収しますが、持続的なクォータ超過の使用を許可するものではありません。

### 各次元ごとの上限の計算方法


* **ストレージ (entities / subscriptions / registrations / temporalDataPoints)**: 上限は `Math.floor(nominal limit × QUOTAS.SOFT_LIMIT.STORAGE_GRACE_MULTIPLIER)` です (`src/config/defaults.ts`、multiplier = `1.2`、つまり 20% のグレース)。結果が切り捨てられるため、グレースバンドは名目上の制限が小さいほど絶対値で縮小します — 最小の実際のプラン値は T0 の `maxSubscriptions=10` で、これでも非ゼロの上限 (`12`) が得られます。人為的に小さい制限 (例: テスト内) のみが、グレースバンドを完全に切り捨てる可能性があります。`StorageQuotaService.checkQuota()` (`src/core/quotas/storage/storage-quota.service.ts`) で適用されます。
* **レート制限 (minute/hour/day)**: **拒否境界は移動していません**。[Burst Allowance](#burst-allowance) で述べたように、`perMinute/perHour/perDay + burstAllowance` が常に実効上限でした — グレースバンド (名目上の制限を超えたが、バースト許容範囲内) は以前から存在していましたが、観測可能ではありませんでした。#1571 は、その既存のバンドへの可視性を追加するだけです。3 つのウィンドウすべてが評価され、グレースバンド内にある最も細かい粒度のものが報告されます (`src/core/quotas/rate-limit/rate-limit.service.ts` の `resolveSoftExceededWindow()`)。
* **テナントごとの同時実行数は対象外で変更なし。** `docs/customer/PLAN_QUOTAS.md` §4 はすでに同時実行数を「超過分は一時的に待機・再試行の対象になります」と説明しており、既存の `429 + Retry-After` の動作 (`QUOTAS.CONCURRENCY.RETRY_AFTER_SECONDS`、[Per-Tenant Concurrency Limit](#per-tenant-concurrency-limit-1510--epic-1485) を参照) がすでにこれを満たしています。これをグレースバンドに拡大すると、#1485 のために導入された DoS 強化が損なわれます。

### `X-Quota-Soft-Exceeded` レスポンスヘッダー

グレースバンド内で受け入れられたリクエストのレスポンスに付加されます。値は、名目上の制限を超えた次元のカンマ区切りリストです:

```http
# only storage entities dimension is over its nominal limit
X-Quota-Soft-Exceeded: entities

# both the per-minute rate limit and the subscriptions dimension are over
X-Quota-Soft-Exceeded: rateLimit.minute,subscriptions
```


* ストレージ次元はリソースタイプ名を使用します: `entities`、`subscriptions`、`registrations`、`temporalDataPoints`。
* レート制限次元にはプレフィックスが付きます: `rateLimit.minute`、`rateLimit.hour`、`rateLimit.day`。
* **拒否されたリクエストは決してこのヘッダーを持ちません** — 拒否はヘッダーが組み立てられる前に `507`/`429` エラーパスへショートサーキットするため、このヘッダーは名目上の制限を超えたにもかかわらず `2xx` レスポンスにのみ表示されます。
* ヘッダー名自体は定数 `QUOTAS.SOFT_LIMIT.SOFT_EXCEEDED_HEADER` (`src/config/defaults.ts`) です。

### 持続的なクォータ超過使用の運用シグナル

単一のグレースバンド受付は想定され、無害です。このヘッダーを*継続的に*持つテナントは、プランアップグレードまたはカスタムクォータ調整の候補です。これを一時的なバーストと区別できるようにするため:


* すべてのグレースバンド受付は `warn` レベルのログ行を出力します (ストレージ: `storage-quota.service.ts`; レート制限: `handlers/api/index.ts`)。
* すべてのグレースバンド受付は、`quotas.rateLimitSoftExceeded` / `quotas.storageQuotaSoftExceeded` (`src/core/metrics/metrics.service.ts`) でもカウントされます。これらは既存の拒否カウンター (`rateLimitExceeded` / `storageQuotaExceeded`) とは**意図的に分離**されています — それらをマージすると、「実際に拒否されたリクエスト数」と「単にグレースバンド内にあったリクエスト数」を区別できなくなります。

持続的なパターンがプランアップグレードの会話を必要とする*時期*を決定することは、運用/営業プロセスであり、このセクションが規定するものではありません。

## モニタリングとアラート

### Rate Limit Bucket Sharding (#3115)

高 rps テナントは以前、すべての `UpdateItem` を単一の DynamoDB アイテム (`pk={tenant}#unified`, `sk=dayTs`) に集中させていました。パーティションスループット (\~1,000 WCU/s) に加えて `MAX_SLOW_PATH_RETRY=1` が `ThrottlingException` / 競合の枯渇を引き起こし、PREMIUM/ENTERPRISE パブリッシュターゲットを大幅に下回る `RateLimitCheckTransientFailure` **fail-open** が発生していました (ステージング環境で closed-bearer \~800 rps クラスで測定)。

**現在の設計** (`QUOTAS.RATE_LIMIT_SHARD_COUNT`、デフォルト **8**):


* 有効なシャード数: `min(configured N, floor(min(minute,hour,day) / REPRESENTATIVE_WEIGHT))` により、小さなカスタム / E2E クォータは単一パーティションに留まり (weight-bump vs sum のミスマッチを回避)、`N × floor(global/N) ≤ global` となります
  
* 書き込みキー: `pk={tenant}#unified#{shardId}` (`shardId` ∈ `0..N-1`)、ランダム開始 + シャード単位の拒否時に最大 `RATE_LIMIT_SHARD_PROBES` の **追加** プローブ (総試行回数 = `1 + PROBES`、N にクランプ)
  
* シャード単位の名目上限: `floor(global/N)` により `N × perShard ≤ global` となります; 有効な書き込み上限は `min(global, max(floor(global/N), weight))` であるため、大きな weight でも 1 つのシャードに収まります
  
* `getRateLimitInfo` はすべてのシャード **および** レガシー `pk={tenant}#unified` を合計します (読み取り専用; 新しい書き込みはレガシーに触れません)。**未アクセス (不在) のシャードはシャード単位の完全な残量としてカウント** されます — これらをスキップすると、まだすべてのシャードに到達していないテナントの残量が過小報告されます
  
* `N > 1` での消費成功は、`getInfo` と同じ合計残量を返します (soft-limit / ヘッダー精度); `N = 1` は単一バケットの残量を直接返します
  
* **デプロイ / マイグレーション**: レガシー `#unified` の残量は新しいシャードキーに **コピーされません**。デプロイ後、新しい消費は `#unified#{shardId}` のみに触れるため、既存のテナントは実質的に新しいシャードプールからスタートします (その日のウィンドウの残りに対して完全なクォータへの一時的な **緩和** — 無制限の拡張ではなく、プラン制限にクランプされます)。レガシーアイテムは TTL が期限切れになるまで `getInfo` で読み取り可能であり、クランプまで合計残量を一時的に膨張させる可能性があります; オペレーターはデプロイ日に rate-limit アカウンティングの一度限りのソフトリセットを予期する必要があります

関連するが別の問題: テナント単位の並行スロットは **同じテーブル** 上で `pk={tenant}#concurrency#{slot % N}` を使用します (`N = min(CONCURRENCY.SHARD_COUNT, max)`、#3125)。#3125 以前の単一 pk 形式 `pk={tenant}#concurrency` はレガシーのみです (デプロイ後のリース TTL \~35s)。

### Rate Limit Infrastructure Failure Metrics (#1419)

Rate limit チェックは **fail-open** です: バケットストア (DynamoDB / MongoDB) がエラーを起こした場合、リクエストはブロックされるのではなく許可されます。この障害モードを観測可能に保つために、すべての抑制されたエラーは CloudWatch Metric Filters に適した構造化された `metric` マーカーでログに記録されます:


* `metric: "RateLimitInfrastructureFailure"` — 自己回復しない **永続的な** エラー (`ValidationException`、`SerializationException`、`ResourceNotFoundException`、`AccessDeniedException`; `QUOTAS.RATE_LIMIT_PERMANENT_ERROR_NAMES`、`src/config/defaults.ts` のリスト)。これらはコードまたは設定のバグを示します — rate limiting は修正されるまでフリート全体で静かに無効化されます。**このマーカーは高重要度の CloudWatch アラームに接続する必要があります。**
  
* `metric: "RateLimitCheckTransientFailure"` — スロットリング、タイムアウト、およびその他の一時的なストアエラー。

背景: 3 つの連続した DynamoDB 式のバグ (#1385) は、無差別な fail-open catch によって数日間隠されていました。分類は `src/core/quotas/rate-limit/rate-limit-failure.ts` に存在し、テナントおよびパブリック rate-limit パスで共有されています。

例外 (#1685): Mongo (スタンドアロン) パスでは、rate-limit バケットのアトミック性は `insertOne` + 一意インデックス `idx_rate_limit_bucket_unique` に対する重複キーリトライに依存しています — これがないと、重複バケットは静かに rate limiting をバイパスします。したがって、このインデックスは `MONGODB.CRITICAL_INDEXES` にリストされ、作成の失敗は **fail closed** します (インデックス初期化時に接続が拒否される) fail-open ランタイムパスに落ちるのではなく。

### Usage Snapshots

システムは定期的に使用状況スナップショットを DynamoDB に記録します:


* Rate limit 使用率 (minute/hour/day)
  
* ストレージリソース使用率
  
* タイムスタンプとテナント情報
  
* 90 日間保持 (TTL)

### Alert Thresholds

各テナントには 2 つのアラートレベルがあります:


* **Warning**: デフォルトで 80% 使用
  
* **Critical**: デフォルトで 95% 使用

### アラート配信

設定されたしきい値を超えた場合:


1. アラートメッセージがログに記録される
   
2. Webhook URL が設定されている場合、HTTP POST でアラートが送信される
   
3. 同じアラートは 1 時間以内に再送信されない(デバウンス機能)

### Webhook ペイロード

```json
{
  "id": "rateLimit.perMinute.warning.tenant1#/",
  "tenantService": "tenant1#/",
  "alertType": "rateLimit",
  "resourceType": "perMinute",
  "severity": "warning",
  "message": "Rate limit perMinute usage is high (85%)",
  "currentValue": 510,
  "limitValue": 600,
  "utilizationPercent": 85,
  "timestamp": 1707645123456
}
```

## Ingress Control (Infrastructure Layer, #1508 / Epic #1485)

アプリ層の quota / rate-limit は **fail-open**(バケットストア障害時はリクエストを通す)なので、DB が過負荷の瞬間ほど防壁が抜ける。これを補うため、**DB に依存しないインフラ層のハード上限**を `infrastructure/template.yaml` に配線している。1 テナントの重負荷が同時実行 / 接続を通じて MongoDB を焼き切る爆発半径(2026-07-21 のインシデント: CPU 97-98%、`/auth/login` まで 500)を構造的に限定するのが狙い。いずれも **opt-in**(未設定=現状挙動)。

### SAM パラメータ

| パラメータ                             | 既定           | 用途                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ApiReservedConcurrency`          | `-1`（未設定）    | ApiHandler（データプレーン）Lambda の予約同時実行数。同時実行を N に縛ると DB へ飛ぶ同時クエリが構造的に頭打ちになる（= Apache MaxClients 相当）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `ControlPlaneReservedConcurrency` | `-1`（未設定）    | ControlPlaneHandler（auth/admin/me/oauth）Lambda の予約同時実行数（#1507）。データプレーンの同時実行飽和から独立して認証を生き残らせる枠。**Atlas 接続上限の較正には使わない**（#3010 / #3122 — 接続予算は `GeonicDB/Atlas` `ConnectionsMax` の実測とティア上限 80% アラームで見る）。                                                                                                                                                                                                                                                                                                                                                              |
| `ApiThrottlingRateLimit`          | `0`（未設定）     | API Gateway ステージの定常スロットリング（req/s、全クライアント合算）。Lambda 起動前にバーストを平滑化。`MethodSettings` の `/*` = `*/*`（全メソッド全リソース）の共有バケットに適用し、制御プレーン（`/auth` 等）も同バケットを共有する。                                                                                                                                                                                                                                                                                                                                                                                                               |
| `ApiThrottlingBurstLimit`         | `0`（未設定）     | 同バースト容量。`ApiThrottlingRateLimit` とセットで指定（片方だけは CFN Rule で拒否）。ステージ全体（`/*` = `*/*`）の共有バケットに適用（#1539 で制御プレーン専用 per-resource 化は revert）。                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ~~`EnableTenantFairShare`~~       | —            | **撤去済み (#3188)。テナント別 fair-share は現在「未実装」。** #3176 V1' (PR #3182) は共有 GW のテナント別 Usage Plan throttle を狙ったが、#3183 (CFN Rule と秘密値注入方式の不整合で deploy 破壊) と #3186 (SAM が `Auth.ApiKeyRequired` / `ApiKeySourceType` の `Fn::If` を評価できず `apiKeyRequired=true` を焼き込み staging 全体が 403) の 2 度の事故を経て、#3188 でパラメータ・Rule・Condition・UsagePlan/ApiKey/UsagePlanKey・authorizer 関数・`Auth` ブロックごと撤去した。**現在テナント別の入口制御は存在せず、API Gateway ステージの合算 throttle (`ApiThrottlingRateLimit` / `ApiThrottlingBurstLimit`) と アプリ層の #1510 concurrency / 重み付き rate-limit のみが効く。** 再設計の要件は #3192 で追跡する。 |
| `EnableOverloadAlarms`            | `'false'`    | 過負荷 CloudWatch アラーム + SNS トピックを作成するか。既定 `'false'`（prod など未指定環境は無変更）、有効化する環境で `'true'`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `ApiConcurrencyAlarmThreshold`    | `40`（CFN既定値） | `ConcurrentExecutions` アラームの閾値。`ApiReservedConcurrency` の \~80% を目安に環境ごとに設定（2026-08-29 #2916 で staging は Reserved 200 に再較正したため staging は 160。この表の値は CFN テンプレートの Default であり staging の実値ではない点に注意）。                                                                                                                                                                                                                                                                                                                                                                  |
| `AlarmNotificationEmail`          | `''`         | 過負荷アラーム SNS トピックへの **メール購読のみ** を制御する。空ならメール `AWS::SNS::Subscription` を作らないだけであり、トピック自体や他経路の購読（ChatOps）とは独立。設定するとデプロイ後に購読確認メールが届く。                                                                                                                                                                                                                                                                                                                                                                                                                                  |

> **staging の現状 (#3012)**: `EnableOverloadAlarms=true`。`AlarmNotificationEmail` は未設定(メール購読なし)だが、**アラームはサイレントではない** — `geonicdb-infra-cdk` の `GeonicDbChatbotAlerts-staging` が SNS トピック `geonicdb-staging-overload-alarms` を購読し、AWS Chatbot 経由で Slack `#alerts-geonicdb` に配信する。実測例: 2026-09-02 22:18 JST の control-plane Throttles ALARM が同チャンネルへ到着(Slack TS `1788355123.039949` / SNS 購読 ARN `…:141fa370-ebd1-47b9-842d-ad9e198def31`)。「メール未設定 = 通知先ゼロ」と読んではいけない。

### 較正式(Reserved と Atlas 接続上限)

Lambda は 1 リクエスト = 1 実行環境で、各環境が自前の Mongo 接続プールを持つ。接続総量の目安:

```text
接続総量 ≈ MONGODB_MAX_POOL_SIZE × (1 + DEPLOYMENTS_MAX_CONNECTIONS) × ウォーム Lambda 数
```

この式は N を決める根拠には使わない — 下記の通り 2026-09-03 の実測でこの式による見積もりと実接続数が大きく乖離することが判明している。式は**安全上の上限チェック**(選んだ N が Atlas 接続上限を超えていないか)にのみ用い、**N 自体は実測した通常運用の同時実行数を基準に較正する**(下記「staging の現行値と、それを決めた実測」):

```text
N × MONGODB_MAX_POOL_SIZE × (1 + DEPLOYMENTS_MAX_CONNECTIONS) ≲ Atlas 接続上限（ノードあたり）
かつ  N ≤ アカウント同時実行上限 − 他関数の予約分
```

### staging の現行値と、それを決めた実測(2026-09-13 JST #3132 GW/予約再サイジング)

`ApiReservedConcurrency=256` / `ControlPlaneReservedConcurrency=32`(合算 **288**) / `ApiConcurrencyAlarmThreshold=205` / `ApiThrottlingRateLimit=2000` / `ApiThrottlingBurstLimit=4000` / `EnableOverloadAlarms=true`。**`production.json` は未変更**(prod 反映は月曜以降・#3123 系)。

> **#3132 の決め方**: 合算コールドとウォーム open をペアで測り、恒久値は proven OK 側に置く。
>
> * 合算コールド: **288 OK** (api256+cp32) / **352 NG** (api320+cp32、500/504 多発)。S3 以降は打ち切り
> * Atlas ConnectionsMax ピーク **1124/1500 (74.9%)** @ コールド帯 — 90% 持続打ち切りには未達だが S352 失敗で梯子停止
> * read-one open(予約 256・一時 GW 5000・WAF 緩和・maxConcurrency 1000): **200 / 1000 rps = 100%**。**1500 rps = 95.6%**(okRps 1434; ConcurrentExecutions が 256 に張り付き Lambda Throttles)。厳密 100% の硬安定ではないが、PREMIUM 1,500 看板の入口(GW)は 2000 で開ける
> * **ドッグフーディング波及(実測)**: Phase2 の 22:26–22:35 JST 帯に API GW `5XXError` が約 **73,000** 件規模。共有 staging の他利用者(geonicdb-livedeck 等)で「データ取得に失敗: Load failed」を観測。**`ApiReservedConcurrency=256` 恒久化後も、1,500 rps 相当の負荷では他テナントに 429/5xx が波及しうる**(共有ステージの単一予約枠が爆発半径)。入口復元後は収束。優先度づけ・fair-share は **未実装**(#3176 の V1 は #3188 で撤去、再設計は **#3192**)。専用 GW / バケット分離は **#3138**。公表 rps の再同期(ソフト天井 1,000 据え置き)は **#3137**
> * ENTERPRISE **3,000** rps は合算コールドが 352 で落ちるため本サイクル不可 → follow-up **#3138**
> * CP は **32** 据え置き(データプレーン比で機械的に上げない)
> * デプロイ安全ガードの合算上限は **288**(proven OK。0.8×288 だと恒久 api=256 が落ちる)

### staging 再実測（2026-09-15 JST #3138 — Phase0→S288→S352 同型連鎖）

> **トリガー**: アイドル単発コールドでは非再現。#3132 と同型の **Phase0 ウォーム負荷 → ≈44s → S288 → settle → S352** で再現。
>
> * S352 失敗率 **61.6%**（217/352）。ゲート（≥10%）通過。
> * 帰属 **(a) Mongo TLS/接続**: Unexpected error の **95%** が
>   `Client network socket disconnected before secure TLS connection was established`。
>   (b) GW 29s 504∈\[28s,31s]=0、(d) DDB/breaker=0。
> * Atlas ConnectionsMax 帯は **1136**（5 分粒度のため S288/S352 の峰は分離不可）。
> * **コード対応 (#3138)**: 初回 connect 前スタガー `CONNECT_STAGGER_MAX_MS=1500`、
>   リトライ backoff 上限 500→1500、TLS disconnect / pool checkout を接続経路限定で再試行対象に追加。
>   `SERVER_SELECTION_TIMEOUT_MS` 引き上げは不採用（GW 天井接近）。候補2（GW バケット分離）は #3137 系で並行可。

### staging の履歴（2026-09-12/13 JST #3117 入口引き上げ → #3132 で上書き）

当時: `ApiReservedConcurrency=160` / `ControlPlaneReservedConcurrency=32`（合算 **192**）/
`ApiConcurrencyAlarmThreshold=128` / `ApiThrottlingRateLimit=1000` / `ApiThrottlingBurstLimit=2000`。

> **#3117 の決め方**: 契約プラン総和からの逆算ではなく、staging 実測で安定上限を探す。
>
> * 合算コールド: 256 OK / 320 NG → 予約合算 ≤ `floor(256×0.8)=204`（当時の恒久 192）
> * meta-version closed: **\~1960 rps** まで 100%（一時 GW 2000）。read-one open: **400 rps 100%** /
>   600 rps で **\~14% HTTP 500**（因果: `#concurrency` パーティションの DDB ThrottlingException →
>   レイテンシ悪化 → Lambda `ConcurrentExecutions`=予約枠張り付き → Lambda Throttles → API GW が
>   500 に変換。修正は **#3125** — pk を `#concurrency#{slot % N}` にシャード化し、SDK
>   `maxAttempts` を 2 に短縮。**#3129** で独立テナント 1 vs 2 を再実測し、制御下では
>   600 rps の HTTP 500 差は出ないことを確認したうえで、一過性 throttle 吸収のため **2 を統一採用**。
>   **2026-09-13 同日 A/B (#3125)**: before 600 rps ok 78.7% (500×1534) → after **100%** (500×0)、
>   ConcurrentMax 160張り付き→61、`ConcurrencyCheckTransientFailure` ≥50→0。
>   `#unified` レート制限バケットの fail-open は別問題で **#3115**）
> * 入口は **1000 rps**（旧 300 の 3.3 倍。read-one 安定帯の上、DDB 痛点の手前〜同程度の余裕）
> * CP は実測ピーク 1〜3 のまま **32**（データプレーン比で機械的に上げない）
> * DB overload breaker: `TIMEOUT`/`CONNECTION` 閾値 5→3、`OPEN_DURATION` 10s→15s（入口拡大に合わせ早期遮断）。
>   **注 (#3117)**: ハンドシェイクテールは未根治（#3011 は暫定緩和）のまま入口を 3.3 倍にしたため、
>   スケールアウト直後の一過性 `maxTimeMS` / serverSelection 失敗でも閾値 3 に届きやすく、
>   **誤って早期遮断（データプレーン 429）しやすくなる副作用**がある。恒久対策は接続テールの根治か、
>   誤遮断が観測されたときの閾値再較正。

### staging の履歴（2026-09-03 再較正 → #3117 で上書き）

当時: `ApiReservedConcurrency=80` / `ControlPlaneReservedConcurrency=32`（合算 **112**）/
`ApiConcurrencyAlarmThreshold=64` / `ApiThrottlingRateLimit=300` / `ApiThrottlingBurstLimit=600`。

> **接続数の較正式で値を決めてはいけない（2026-09-03 に実測で否定された）。**
> 式は「合算 288 × maxPool 5 = 1,440 なので上限 \~1,490 に対しまだ余裕」と見積もっていたが、
> **Atlas の実接続数は予約枠と無関係に基線 160〜180** だった（CloudWatch `GeonicDB/Atlas`
> の `ConnectionsMax`、**5 分粒度**の中央値。日次最大は 275〜543 だが、その山は
> ほぼ負荷試験の時刻に一致するスパイクで、定常値ではない）。式が数えているのは api + control-plane の
> 2 関数だけで、`MONGODB_MAX_POOL_SIZE` は Globals（全 12 関数）に効いており、
> WS / subscription / rules 系とアイドル保持分が外側にいる。**予約枠を上下させても
> この数字はほとんど動かない**ので、判断材料にならない。

**値の根拠（すべて実測）**

| 観点                                                          | 実測                                                                                                                                                                 | 効き方                                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| 通常運用の同時実行（日次最大, 8/20〜9/3）                                   | api **8〜25** / control-plane **2〜10**                                                                                                                              | 現行値はこの約 3 倍                                                                     |
| 旧値での throttle                                               | api 40 → 8/25 に 602 件・8/28 に 224 件、control-plane 10 → 8/30 に 414 件                                                                                                 | **旧値には戻さない**                                                                    |
| Atlas CPU（日次最大）                                             | **16〜55%**                                                                                                                                                         | 2026-07-21 のインシデント（97-98%）には遠い                                                  |
| Atlas 接続数                                                   | 基線 **160〜180**（5 分粒度の中央値）/ 日次最大 275〜543（試験時のスパイク）                                                                                                                  | 予約枠を 288 → 112 に下げても基線は変わらない                                                    |
| 一斉コールドスタート（2026-09-03, fix 前）                               | control-plane **88** 並列でクライアント可視の `MongoServerSelectionError`（**32** 並列コールドでは 0 件）                                                                                 | 当時の上げる方向の崖。Atlas 容量上限ではない（下記）                                                   |
| 一斉コールドスタート（2026-09-12, #3011 リトライ後 / #3116）                 | CP 単独 **32〜120** すべて HTTP 到達・Mongo 500=0・Throttles=0。ただし **88 以上で初回 5s タイムアウトが再発**しリトライが吸収（88:19/88、112:29、120:39）。合算は当時枠 **api80+cp32=112** 同時コールドで成功（当時 160 未測定） | ガード上限は実測安全確認値 120 そのものではなく `floor(120×0.8)=96`（アラーム \~80% 慣行）。**暫定緩和であり根治ではない** |
| 一斉コールドスタート（2026-09-12/13, #3117）                            | 合算 **api+cp = 160 / 192 / 256** すべてクライアント可視 OK（mongoTimeouts=0）。**320 で API GW 504 + 500 多発**（max≈29.3s = API GW 天井）。#3011 リトライ WARN は継続                           | 合算ガードを `floor(256×0.8)=204` に差し替え。`SERVER_SELECTION_TIMEOUT_MS` 引き上げは不採用（天井接近）  |
| Atlas ConnectionsMax（2026-09-12/13 JST, #3117, M10 上限 1500） | 1 分ピーク **1232 @ 00:53 JST**（合算コールド **320** 帯）。絶対ピーク **1489 @ 00:58 JST**（コールド梯子の**後**の meta-version 負荷。**特定 sum 単独ではない**）。M10 上限の **99%**                          | API GW/Lambda タイムアウトとは**別資源**。運用ガードは #3122。帰属を一時測定ログだけに残さない                     |
| ウォーム時の処理能力                                                  | 88 並列で全件成功・**平均 0.20 秒**（冷えた 200 並列は平均 9.36 秒）                                                                                                                     | 枠より「温まっているか」が支配的                                                                |

api 80 / control-plane 32 は通常ピークの約 3 倍で、旧値で観測された throttle を再発させず、
かつ #1508 の「爆発半径を絞る」意図を回復する。

> **2026-09-03 の 88 破綻は Atlas の容量上限ではなかった。** 同時刻の Atlas は CPU 22% / 接続 439（上限 \~1,490）で
> 余裕があった。壊れたのは「**多数のコンテナが同時に初回接続する際のハンドシェイクのテールが
> `MONGODB.POOL.SERVER_SELECTION_TIMEOUT_MS`（5,000ms）を超える**」ためで、一過性かつ自己回復する。
> エラーのスタックは `handlers/api/index.ts` の `Promise.all([..., getMongoClient()])` を指す。
> 経路は 2 つあり、0 始まり index が異なる:
>
> * **リクエスト経路**（`handler` 本体）: `resolveJwtSecret` / `resolveEtagSecret` / `resolveSuperAdminSecret` /
>   `resolveWebPushVapidSecrets` / `getMongoClient` → **index 4**（2026-09-03 当時は VAPID 無しで index 3。#3033 で挿入）
> * **コールドスタート warmup**（`startColdStartWarmup`）: 上記に加え `resolveWsHealthProbeSecrets` が先に入るため
>   `getMongoClient` は **index 5**
>
> **#3011（2026-09-05）はコールド接続失敗時の 1 回リトライを入れた暫定緩和であり、根治ではない。**
> 2026-09-12 の再実測（#3116）ではクライアント可視の Mongo 500 は 120 まで消えたが、
> **初回タイムアウト自体は 88 以上で発生し続けている**（リトライが吸収しているだけ）。
> `SERVER_SELECTION_TIMEOUT_MS` の引き上げは、120 並列で既に latency max ≈ 21s
> （API Gateway 29s に接近）のため採用しない（待ちを延ばすと天井に近づく）。
> 合算同時コールドは **#3117（2026-09-12/13）で実測済み**: 256 OK / 320 NG。
>
> **デプロイ安全ガード**（`template-deploy-safety.test.ts`）:
>
> * **staging**: `ControlPlaneReservedConcurrency ≤ 96`（`floor(実測クライアント安全確認 120 × 0.8)`）、
>   `ApiReservedConcurrency + ControlPlaneReservedConcurrency ≤ 288`（#3132 合算コールド proven OK）
> * **prod**: control-plane 同左、合算 ≤ `floor(256×0.8)=204`（#3117。staging の 288 は共有しない。
>   `#3123` の prod 実測まで）
>
> 保証が要るなら測定する（手順: api と control-plane の枠をそれぞれ対象値へ一時変更 →
> デプロイ／設定更新で全コールド化 → 初期化ログ／メトリクスでコールド状態を確認する（確認できない
> 場合は「コールドスタートを実測確認」ではなく「コールドスタートを試行」と記載する。
> Reserved concurrency は実行環境を事前初期化しないため、15〜20 分放置しただけでは
> 全実行環境がコールドである保証にならない）→ api・control-plane 両経路へ同時に負荷を
> かける（api 側はデータプレーン経路、control-plane 側は `POST /auth/nonce` 等）→
> 双方で `Throttles=0` かつ Mongo 系 500 が 0 なら実証。**`POST /auth/nonce` のみを
> 叩く測定は control-plane 枠しか使わないため合算値の検証にはならない** — その場合は
> 結論を「control-plane 限定」と明記する）。
> **api と control-plane は合算で見る。** 両者は同一のコードバンドル（`ControlPlaneHandlerFunction` も
> `CodeUri: ../src/handlers/api/`）で、共通初期化（`handlers/api/index.ts` の
> `Promise.all([..., getMongoClient()])`）まで到達する通常リクエストは、経路に関わらず
> data-plane の `getMongoClient()` を await する（CORS preflight、公開レート制限超過、
> 認証・OAuth のボディサイズ超過はこの共通初期化より前で応答が返るため対象外）。
> したがって Atlas から見た初回接続要求は、共通初期化まで到達するリクエストに関しては
> 常に両関数の合算になる。

**前提と適用範囲（重要）**


* **Atlas のティア依存**。上記はすべて staging の `geonicdb-staging`（**M10**）の測定値。
  プランを変えたら再実測すること。別に Flex のパイロットクラスタ
  （`geonicdb-staging-pilot`、CFN スタック `GeonicDbAtlasFlexCluster-staging`）が存在するが、
  **負荷時の接続数（実測で最大 543）は Flex の上限を超える**ため、切り替えるなら本節の値は全て無効。
  
* **prod にも同じ入口パラメータを適用する（#3117）**。`infrastructure/parameters/production.json` で
  `ApiReservedConcurrency=160` / `ControlPlaneReservedConcurrency=32` 等を primary / secondary 両リージョンに置く
  （下記 prod 節）。`MONGODB_MAX_POOL_SIZE` は prod 10 / staging 5 なので、同じ枠でも prod は接続数が約 2 倍になりうる
  — 接続余裕の結論は #3123 の prod 実測まで保留。
  
* WS 系（`ws-connect` 等 4 関数）にも予約枠は無い。**本節の値は WS 同時接続数を縛らない**
  （2026-08-28 のベンチでは api 枠 40 のまま 500 接続を全て捌けている）。

投入後は `Throttles` / `5XXError` / Atlas の CPU・接続数を見て調整する。

> **入口 throttling は現状ステージ全体のみ（#1524 の per-resource 化は #1539 で revert）**: #1507 で
> compute（Lambda 関数）は分離済みだが、**API Gateway の throttling は依然としてステージ全体
> （`MethodSettings` の `/*` = `*/*`、`ApiThrottlingRateLimit`/`BurstLimit`）の共有バケット1つ**である。
> \#1524 は制御プレーン 5 resource に独立バケットを割り当てようとしたが、API GW は**ワイルドカード
> method（`'*'`/`'ANY'`）を特定 ResourcePath に指定できず**（特定パスは具体 verb のみ、ワイルドカードは
> `*/*` 全体のみ）、`ANY` プロキシ統合である制御プレーン path を per-resource で throttle できずデプロイ
> 不能だった。このため #1539 で stage-wide に戻した。
> **残る限界（要注意）**: 共有バケットのため、**データプレーン `/*` のフラッドが `ApiThrottling` 枠を
> 食い尽くすと `/auth` 等の制御プレーン要求も API GW 入口の 429 で共倒れしうる**。ただし #1507 の
> compute 分離により Lambda 同時実行と DB は別 `ReservedConcurrentExecutions` で守られるため
> **「認証全停止」にはならない**（入口層の隔離が失われているだけで、Lambda 枠は生存）。

> **監視の盲点**: API GW の 429 は Lambda 手前で返るため、`geonicdb-<env>-control-plane-handler-throttles`（Lambda `Throttles`）アラームは **API GW 429 を捕捉しない**。データプレーン `/*`・制御プレーン path とも現状 429 は未アラーム。
> **follow-up**: (1) API GW 入口の per-resource 制御プレーン throttling の正しい再設計（具体 verb 列挙 / 制御プレーンを別 API・別ステージに分離 / Usage Plan 等）。(2) アクセスログ（`$context.status=429`）に対する 429 専用 Metric Filter/アラーム。(3) フラッド時の暫定緩和として WAF rate-based rule。
>
> **auth コールドスタートのトレードオフ**: 制御プレーンは低ボリュームなため、分離後は `/auth/login` が専用コンテナのコールドスタート（INIT + Atlas TLS/SCRAM \~3s）に当たりやすくなる（従来はウォームなデータプレーンコンテナに相乗りできた）。#1440 の top-level-await warmup で緩和されるが皆無ではない。デプロイ後に login p99 を監視すること。

### prod の現行値と、それを決めた実測（2026-09-12/13 JST #3117、平常ピーク根拠は #3009）

`ApiReservedConcurrency=160` / `ControlPlaneReservedConcurrency=32`（合算 **192**）/ `ApiConcurrencyAlarmThreshold=128` / `ApiThrottlingRateLimit=1000` / `ApiThrottlingBurstLimit=2000`。
`infrastructure/parameters/production.json` に置き、primary / secondary 両リージョンに同じ値を適用する（フェイルオーバー時に secondary が primary と同じ容量を持つ必要があるため）。
**入口の数字は staging 実測（#3113/#3117）で決めた安定上限を採用**する。prod Atlas は M20（接続上限 **3,000**/ノード — 公式。旧 docs の「M20 \~1,500」は M10 の誤記）。
**コールド合算・API GW 入口**の staging 安全値は prod にも安全側に転用できるが、**Atlas 接続は別** — `MONGODB_MAX_POOL_SIZE` が staging 5 / prod 10 のため、同じ同時実行でも接続数は約 2 倍になりうる（本節「前提と適用範囲」）。staging 絶対ピーク 1489 に pool 比とマージンを載せると `1489×2×1.25=3722 > 3000` となり、「M20 余裕あり」は反転しうる。
`template-deploy-safety.test.ts` はこの外挿を**偽の安心として通さない**（pool 差込みで M20 超過をアサート）。**#3123 の prod 実測までは接続余裕の結論を過信しない。**
平常ピークとの倍率根拠は下表（#3009）。

| 観点                               | 実測（本番 953082826936）                                                                             | 効き方                                          |
| -------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 通常運用の同時実行（日次最大, 8/24〜9/7）        | api **13〜30**（30 は 8/26 の通知一括配信日、平常 13〜19）/ control-plane **1〜3** / secondary の api 1〜9         | 予約 160 は実測ピークの **5.3 倍**                     |
| API Gateway リクエスト（1 分粒度, 直近 7 日） | 中央値 190 req/分、p99 397、最大 **699**（≈ 11.7 rps）。secondary は最大 162                                  | throttling 1000 rps は実測ピークの **85 倍**、顧客を締めない |
| Lambda アカウント枠                    | 1000（未予約 ≥ 100 要件）。合算 192 + 他関数予約後も未予約 ≫ 100                                                    | 合算 192 は枠の 19%                               |
| Atlas                            | **M20**（自動スケーリング上限 M30）、接続数 p50 231 / 最大 711（**M20 上限 3,000**/ノード）、CPU 日次最大 17〜35%（8/26 のみ 78%） | 較正式は判断材料にしない。実測: 予約の有無と無関係に基線は動かない (#3010)   |
| staging 入口実測 (#3117)             | meta \~1960 rps / read-one 安定 \~400–520 rps / 合算コールド 256 OK・320 NG                              | 入口 1000 / 予約 160 の直接根拠                       |
| 旧状態 (#3009)                      | 予約 80 / GW 300。その前は予約なし（アカウント枠まで無制限）                                                            | #3117 で引き上げ                                  |

**判断の型**（裁可 2026-09-12 / Epic #3112）: 2026-09-03 の「インフラをプランに合わせて引き上げない」は**無効化**。プラン上限×10 を進めるため、実測に基づき入口を先に広げる（本変更）。admission check 緩和 (#3114) とレート制限バケット (#3115) は入口の後続。

値を変えるときは `tests/unit/infrastructure/template-deploy-safety.test.ts` の prod ガード（予約 ≥ 実測ピーク × 2、閾値 = 予約の 75〜85%、control-plane ≤ `floor(120×0.8)=96`、合算 ≤ **204**（#3117 `floor(256×0.8)`。staging の #3132 合算 288 とは分離。`#3123` の prod 実測まで staging 値を流用しない）、throttling は整数で実測 rps × 10 以上）とこの表を一緒に更新する。

### 過負荷アラーム（AWS ネイティブ指標）

`EnableOverloadAlarms='true'` のとき、SNS トピック `geonicdb-<env>-overload-alarms` と以下の
CloudWatch アラームを作成する:

| アラーム                                             | 指標                                                             | 意味                                                       |
| ------------------------------------------------ | -------------------------------------------------------------- | -------------------------------------------------------- |
| `geonicdb-<env>-api-handler-throttles`           | Lambda `Throttles` > 0                                         | 予約 / アカウント同時実行上限に到達（入口飽和の一次シグナル）                         |
| `geonicdb-<env>-api-handler-concurrency`         | Lambda `ConcurrentExecutions` ≥ `ApiConcurrencyAlarmThreshold` | 予約上限への接近（先行指標）                                           |
| `geonicdb-<env>-control-plane-handler-throttles` | Lambda `Throttles` > 0（#1507）                                  | 制御プレーン関数が予約 / アカウント上限に到達（認証飽和）                           |
| `geonicdb-<env>-api-5xx`                         | API GW `5XXError` − `GeonicDB/Sla QuotaRejections` ≥ 25 / 5分   | 503（maxTimeMS 超過 / 過負荷）・500 の多発。**クォータ拒否 (507) は控除**（下記） |
| `geonicdb-<env>-waf-blocked`                     | WAFV2 `BlockedRequests` ≥ 1000 / 5分                            | per-IP フラッド等、入口圧の早期シグナル                                  |
| `geonicdb-<env>-subscription-matcher-errors`     | Lambda `Errors` ≥ 5 / 5分 × 3期間（#1560）                          | 購読マッチングが継続失敗（15 分以上）                                     |
| `geonicdb-<env>-rule-processor-errors`           | Lambda `Errors` ≥ 5 / 5分 × 3期間（#1560）                          | ReactiveCore Rules が継続失敗（15 分以上）                         |
| `geonicdb-<env>-notification-sender-errors`      | Lambda `Errors` ≥ 5 / 5分 × 3期間（#1560）                          | 購読通知の配信が継続失敗（15 分以上）                                     |
| `geonicdb-<env>-ws-broadcast-errors`             | Lambda `Errors` ≥ 5 / 5分 × 3期間（#1560）                          | WebSocket 配信が継続失敗（15 分以上）                                |
| `geonicdb-<env>-expiry-sweeper-errors`           | Lambda `Errors` ≥ 5 / 5分 × 3期間（#1561）                          | TTL 失効の `EntityDeleted` 発行（expiry sweeper）が継続失敗（15 分以上）  |

#### クォータ枯渇アラーム（GeonicDB 独自指標、#2894）

上の表は AWS ネイティブ指標のアラーム。クォータ枯渇は EMF で `GeonicDB` 名前空間に
出しており、`QuotaMonitoringSweeper` が `rate(1 hour)` で全アクティブテナントを走査して
発火させる。

| アラーム                                    | 指標                                                   | severity | 意味                        |
| --------------------------------------- | ---------------------------------------------------- | -------- | ------------------------- |
| `geonicdb-<env>-quota-storage-warning`  | `GeonicDB QuotaStorageWarning` ≥ 1                   | p3       | テナントがストレージクォータの 80% に到達   |
| `geonicdb-<env>-quota-storage-critical` | `GeonicDB QuotaStorageCritical` ≥ 1                  | p3       | テナントがストレージクォータの 95% に到達   |
| `geonicdb-<env>-quota-rejections`       | `GeonicDB/Sla QuotaRejections`（geonicdb-infra-cdk 側） | p3       | 上限超過により書き込みが 507 で拒否されている |

##### deployment 別の指標 (#3084)

上の EMF 指標は `Deployment` dimension (= Host。deployment 行が無い既定 DB は `default`) 付きでも出る。
同じ 1 行から無次元 (上表のアラームが参照) と `Deployment` 付きの両系列が取り込まれるので、
既存アラームは変わらず、インスタンス別の状況表示 (geonicdb-operations#144) はこちらを読む。
tenant 単位の dimension は付けない (テナント数が多くカーディナリティが膨らむ。tenant はログの
`tenantService` に残る)。

| 指標 (`GeonicDB` 名前空間)                           | dimension                    | 出す場所                                  | 意味                                                                                                                                                   |
| ---------------------------------------------- | ---------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QuotaStorageWarning` / `QuotaStorageCritical` | `Deployment`                 | quota-monitoring sweeper (毎時)         | 80% / 95% 帯に到達したテナントがいる                                                                                                                              |
| `QuotaStorageUtilization` (Percent)            | `Deployment`, `ResourceType` | quota-monitoring sweeper (毎時)         | resourceType 別の利用率。値は `current / limit` の実勢で **100% を超える** (1,200,007 / 1,000,000 → 120)。判定用の `utilizationPercent` (100 で飽和) は同じ EMF 行の property に残す |
| `QuotaRejections`                              | `Deployment`                 | API エラーハンドラ (507 InsufficientStorage) | 上限超過で拒否した書き込み件数。`GeonicDB/Sla QuotaRejections` (Metric Filter、SLA 集計用) とは別系列                                                                         |
| `RateLimitRejections`                          | `Deployment`                 | API エラーハンドラ (429)                     | レート制限で拒否した件数 (geonicdb-operations#87 の「429 はどこにも数えられていない」)                                                                                           |
| `NotificationDeliveryFailures`                 | `Deployment`                 | notification-sender                   | 再試行の末に配信失敗した通知件数                                                                                                                                     |

対応するログ行 (`Request error` の `deployment` / `path` / `method`、`Notification failed after retries` の
`deployment` / `tenant`、`[QuotaAlert]` の `deployment`) から購読・テナントまで辿れる。EMF レコードには
`errorCode` キーを載せない — SLA Metric Filter (`$.errorCode = InsufficientStorage`) と二重計上になるため。

> **評価窓 (#2912)**: EMF は超過時の sweep でのみ出る。`Period: 3600` /
> `EvaluationPeriods: 2` / `DatapointsToAlarm: 1` / `TreatMissingData: notBreaching`
> (sweeper の `rate(1 hour)` と結合)。`Period: 300` のままだと missing 期間が偽 OK になり
> 1 時間ごとに ALARM↔OK を往復する。`TreatMissingData: ignore` は解消後に ALARM が固着する
> ため使わない。sweeper のスケジュールを変えるときは Period も同時に変えること。
>
> **severity が 3 つとも p3 である理由 (#2902)**: severity タグはステータスページが
> 「ページをどれだけ赤くするか」を決めるために読む。テナントが自分のプラン上限に近づく／
> 超えるのは **そのテナントの契約の話であって、GeonicDB の障害ではない**。
>
> 当初 critical は p1(= outage)、warning は p2(= degraded) だった。2026-08-28 に
> staging のステータスページが「Service disruption」と表示されたが、サービスは 100% 正常で、
> 実際に起きていたのは 1 テナントが temporalDataPoints を使い切ったことだけだった。
>
> 判断基準はこう考えると単純: **既に上限を超えて書き込みを拒否されている
> `quota-rejections` が p3 なのだから、その手前で鳴るアラームがそれより重いことはありえない。**
> 80% と 95% の区別はアラーム名と Slack 本文で伝わる。
>
> **api-5xx がクォータ拒否を控除する理由 (#2902)**: この指標はメトリクス演算
> `m1 - FILL(m2, 0)` で評価する。`m1` は API GW `5XXError`、`m2` は
> `GeonicDB/Sla QuotaRejections`(geonicdb-infra-cdk がログのメトリクスフィルタから生成)。
>
> 控除しないと、テナント 1 件がプラン上限を超えただけで p1 が鳴る。2026-08-28 の本番が
> まさにこれで、5XX も quota-rejections も 38/5分ちょうど——同一の事象を、p3 の advisory と
> p1 の outage として二重に数えていた。ステータスページが赤くなるだけでなく、**既に ALARM
> なので本物の 5XX が来ても状態遷移が起きず、通知が飛ばない**。クォータ超過が続く間、
> 5XX 監視は事実上停止する。SLA 側は ops#51 / ops#52 で同じ除外を入れている。
>
> `FILL(m2, 0)` は `GeonicDB/Sla` 名前空間が存在しない環境での退行防止。メトリクスが無い
> 場合、式は `m1` に縮退し、従来どおりの生 5XX 判定に戻る(本番実データで両方確認済み:
> メトリクスあり 38−38=0 / メトリクスなし 38)。**アラームが無言で死ぬことはない。**
>
> **#1560 の教訓**: バックグラウンドワーカーは「静かに死ぬ」。リクエスト経路と違い失敗を
> 訴えるユーザーがいないため、メトリクスに監視が無い限り永久に発覚しない。
> `change-stream-processor` は **2026-03-08 から 141 日間 成功率 0%**(約 60 万回の失敗)
> だったが、#1508 のアラームが api-handler / control-plane-handler しか見ていなかったため
> 誰にも気づかれなかった。**新しいワーカーを追加したら必ずこの表と `template.yaml` に
> `Errors` アラームを追加すること**(tests/unit/infrastructure/sam-template.test.ts\` が
> テンプレートからワーカーを自動抽出して漏れを検出する)。
>
> 閾値は絶対数ではなく「継続性」で判定する(5 件/5分 × 3 期間連続)。短時間で収まる一過性の
> リトライ可能エラー(EventBridge / SQS の再配送で回復するもの) は通常この条件を満たさないため
> 発報しにくい。**ただし「絶対に誤報しない」わけではない** — 再試行可能なエラーであっても
> 15 分以上継続し各 5 分間で 5 件以上発生すれば、同じアラームが発火する (CodeRabbit 指摘)。
> 発報時は「恒久停止」と決めつけず、まずエラー内容とリトライ状況を確認すること。
>
> **このアラームで検知できないもの(既知の限界。レビューで指摘された点を正直に記す)**:
>
> 1. **メール購読と ChatOps 購読は別物** — `AlarmNotificationEmail` が空でも、SNS トピックへの
>    メール `Subscription` が無いだけである。staging は `GeonicDbChatbotAlerts-staging`

> （AWS Chatbot → `#alerts-geonicdb`）が別途購読しており、発火は Slack に届く（#3012）。
> 逆に ChatOps 未配線の環境でメールも空なら、トピックへ publish されても人が気づかない。
> \#1560 の 141 日は「メトリクスは出ていたが誰も見ていなかった」事故なので、**何らかの通知経路（ChatOps またはメール）をアラーム追加と同じロールアウトで用意する**必要がある。
> なお #1560 のインシデント自体は閾値を満たしていた（約 3 失敗/分 = 15 件/5 分 ≥ 5 が 3 期間連続 → 約 15 分で ALARM）。当時は届く経路が無かった。
> 2\. **低トラフィックのワーカーは 100% 失敗でも閾値に届かない** — 1 分あたり 1 件未満の細い流量なら 5 件/5 分 に達しない。「恒久停止を投入初日に検知できる」のは継続的な流量があるワーカーに限る。
> 3\. **起動回数ゼロの死は原理的に見えない** — イベントソースが無効化・誤設定されてそもそも呼ばれないと `Errors` のデータポイントが 1 件も出ず、`TreatMissingData: notBreaching`（`Errors` に対しては正しい設定）のため無反応になる。別の形の「静かな死」は依然として残る。

### TTL 失効 (expiresAt) expiry sweeper（#1561）

MongoDB の TTL monitor による物理削除は `EntityService` を経由しないため、TTL 失効時の `EntityDeleted` はワーカー (`expiry-sweeper`, `rate(1 minute)`) がアプリ側で発行する（旧 CDC change-stream ワーカーが唯一の観測点だったが #1560 で撤去済み — 復活は二重発行になる）。

| 設定値      | 定数 (`src/config/defaults.ts` の `ENTITY_EXPIRY`) | 値                                                                                                        |
| -------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| TTL 猶予期間 | `TTL_GRACE_SECONDS`                             | 300 秒（`idx_entity_ttl` の `expireAfterSeconds`。失効から sweeper が claim できなくなる = Mongo が物理削除するまでの猶予）          |
| sweep 間隔 | `SWEEP_INTERVAL_SECONDS`                        | 60 秒（Lambda の `rate(1 minute)` と一致）                                                                      |
| 1 回の cap | `SWEEP_BATCH_CAP`                               | 1000 件（**走査全体の合計**。超過分は次回 sweep に持ち越し、cap 到達は `logger.warn` で可視化）                                        |
| 1 回の時間予算 | `SWEEP_TIME_BUDGET_MS`                          | 20,000 ms（**走査全体の合計**。Lambda Timeout 30 秒の手前で自発的に打ち切る。残した deployment 数は `skippedDeployments` として返し warn） |

cap と時間予算は **per-deployment ではなく走査全体で共有**する。per-deployment にすると失効件数・通知ファンアウト・Mongo 接続負荷が deployment 数だけ乗算されるため。

**不変条件**: `TTL_GRACE_SECONDS` > `SWEEP_INTERVAL_SECONDS`（逆転すると sweeper が次に走る前に Mongo が物理削除してしまい、`EntityDeleted` が無音で欠落する）。unit テストで固定している。

### 既知の限界と挙動変更


* **at-most-once**: claim (soft-delete) から publish までの間にクラッシュすると、そのエンティティは `deletedAt` が既に設定されているため再 claim されず、通知は失われる（二重通知を避けるための trade-off）。欠落量は sweep の戻り値 `publishFailures` に**実測値**が入る — publisher の batch 経路は例外を投げず drop するため、呼び出し側の `try/catch` では 1 件も数えられない（`BatchPublishResult.dropped` を使う）。
  
* **同一 ID の再作成が最大 300 秒ブロックされる**: 失効エンティティは猶予期間中 physically 残るため、コアの一意制約 `idx_entity_unique_v3`（`{tenant, servicePath, entityId}`、`deletedAt` を含まない）が同一 ID の作成を `409 AlreadyExists` で弾く。**GET は 404 を返すのに作成は 409 になる**窓が、従来の TTL monitor 巡回間隔（\~60 秒）から猶予期間（300 秒）へ広がる。
  
* **deployment 一覧の取得は時間予算の外**: `listEnabledDeployments()` は DynamoDB のフルスキャンで、スキャン自体は `SWEEP_TIME_BUDGET_MS` に含まれない。deployment が十分多いとスキャンだけで予算を使い切り、その run では deployment を 1 件も処理できない（この場合は専用の warn ログが出る。無音にはならない）。ページ単位で budget-aware にする（継続カーソルを次回 run へ引き継ぐ）のは follow-up。
  
* **通知ファンアウト上限は本 sweeper のスコープ外**（#1544 で [Notification Fan-out Quota](#notification-fan-out-quota-1544) として実装したが、その消費点は**購読通知の送信直前**であり本 sweeper の経路ではない。既存 `purgeEntities` の cap 10,000 より小さい範囲に収まるため新しいリスククラスではない）。
  
* **TTL 猶予期間の反映は index failure メトリクスの監視が前提**: 既存コレクションへの `expireAfterSeconds` 変更は `collMod` で行うが、失敗は**非 critical** として記録されるため `/health` は緑のままになる。`/health` の `indexes.totalFailureCount` を監視していないと「猶予期間を設定したつもりで効いていない」状態に気付けない（この場合 sweeper が claim する前に Mongo が物理削除し、`EntityDeleted` が無音で欠落する）。

### Atlas 接続の運用アラーム（reserved 非依存 — #3122）

**接続予算は予約同時実行とは別資源**（#3010）。較正式 `N × pool` で導出せず、CloudWatch `GeonicDB/Atlas` / `ConnectionsMax` を**ティア上限の 80%** で監視する。

| 環境         | 共有クラスタ | 上限/ノード | アラーム `geonicdb-<env>-atlas-connections` |
| ---------- | ------ | -----: | --------------------------------------: |
| staging    | M10    |   1500 |                           **1200**（80%） |
| production | M20    |   3000 |                           **2400**（80%） |

仕組み: `geonicdb-infra-cdk` の Atlas metrics poller が Atlas Admin API を 5 分周期で読み、EMF で `GeonicDB/Atlas` に出す（有償の Atlas–CloudWatch 統合は使っていない）。SNS `geonicdb-<env>-overload-alarms` → runbook [atlas-cluster-health](https://github.com/geolonia/geonicdb-operations/blob/main/docs/runbooks/atlas-cluster-health.md)。

**コールド梯子の直後に負荷を掛けると接続が積み上がる**（#3117 実測）:合算コールド 320 帯で ConnectionsMax **1232**、その直後の meta-version 負荷で **1489**（M10 の 99%、特定 sum 単独ではない）。負荷試験ではステージ間で `ConnectionsMax` を見てティア上限に余裕を残すこと — 手順は `tests/load/README.md`。

> **旧記述の訂正**: 「Atlas メトリクスは CloudWatch に来ないので Atlas UI アラート必須」は、staging のポーラー導入後は当てはまらない。WiredTiger ticket キューなどポーラーがまだ出していない指標は、引き続き Atlas 側アラートが補完になる。

### Atlas 側アラーム（ポーラー未カバー指標）

MongoDB 7.0 は WiredTiger tickets（read/write 各最大 128）で内部 admission control を持ち、公式は **queued read/write tickets を過負荷の主指標**として推奨している。ポーラーがまだ出していない指標は Atlas Project の Alerts（UI / Admin API）で補う:


* **Query Targeting: Scanned Objects / Returned** が高い（非効率クエリ = collection scan の兆候）
  
* （可能なら）queued read/write tickets の増加

CPU / Connections / Disk / Replication lag / Oplog window は上記の CloudWatch アラームを正とする。

## Management API

### クォータ情報を取得

```http
GET /admin/tenants/{tenantId}/quotas
```

**レスポンス:**

```json
{
  "tenantId": "tenant-1",
  "tenantName": "tenant1",
  "quotaPlan": "STANDARD",
  "customQuotas": null,
  "alertThresholds": {
    "rateLimitWarning": 80,
    "rateLimitCritical": 95,
    "storageWarning": 80,
    "storageCritical": 95
  },
  "currentUsage": {
    "rateLimit": {
      "minute": { "limit": 600, "used": 150, "remaining": 450, "usagePercent": 25, "resetAt": 1707648000 },
      "hour": { "limit": 10000, "used": 1500, "remaining": 8500, "usagePercent": 15, "resetAt": 1707651600 },
      "day": { "limit": 100000, "used": 5000, "remaining": 95000, "usagePercent": 5, "resetAt": 1707734400 }
    },
    "storage": {
      "entities": { "used": 5000, "limit": 10000, "usagePercent": 50 },
      "subscriptions": { "used": 50, "limit": 100, "usagePercent": 50 },
      "registrations": { "used": 25, "limit": 50, "usagePercent": 50 },
      "temporalDataPoints": { "used": 50000, "limit": 100000, "usagePercent": 50 }
    },
    "notifications": {
      "day": { "used": 12000, "limit": 800000, "remaining": 788000, "usagePercent": 2, "date": "2026-08-15" }
    }
  }
}
```

### クォータ設定を更新

```http
PUT /admin/tenants/{tenantId}/quotas
```

**リクエストボディ:**

```json
{
  "quotaPlan": "PREMIUM",
  "alertThresholds": {
    "rateLimitWarning": 85,
    "rateLimitCritical": 98,
    "storageWarning": 85,
    "storageCritical": 98
  }
}
```

### カスタムクォータを設定

```http
PUT /admin/tenants/{tenantId}/quotas
```

**リクエストボディ:**

```json
{
  "quotaPlan": "CUSTOM",
  "customQuotas": {
    "rateLimit": {
      "perMinute": 1200,
      "perHour": 20000,
      "perDay": 200000,
      "burstAllowance": 200,
      "maxNotificationsPerDay": 200000
    },
    "storage": {
      "maxEntities": 50000,
      "maxSubscriptions": 200,
      "maxRegistrations": 100,
      "maxTemporalDataPoints": 500000
    },
    "limits": {
      "maxRequestBodyBytes": 2097152,
      "maxResponseBodyBytes": 20971520,
      "maxBatchSize": 200
    }
  }
}
```

### 容量承認チェック（#1509 / Epic #1485）

クラスターの飽和を引き起こす手動のクォータ設定ミスを防ぐため（2026-07-21 インシデントの直接的なトリガーは、単一テナントの `perMinute` が検証なしで引き上げられたことでした）、`PUT /admin/tenants/{tenantId}/quotas` は変更を永続化する前に**単一テナント容量承認チェック**を実行します。

モデル（テナントごとのガードレール — すべてのテナントの集計は評価**されません**）：

```text
demand  = effective.perMinute
allowed = CLUSTER_CAPACITY_WEIGHTED_PER_MIN × MAX_SINGLE_TENANT_SHARE
demand > allowed  →  400 BadRequest (rejected)
```

`perMinute` はすでに**分あたりの重み単位**で表されています（レートリミッターはそれに対して `calculateWeight()` 単位を消費します）。#3114 は以前の `× REPRESENTATIVE_WEIGHT` の二重カウントを削除しました。

チェックは**有効な**クォータ（リクエストボディをテナントの既存設定にマージしたもの）に対して評価されるため、部分的な更新は結果として得られる値を使用して検証されます。

**オーバーライド（要承認）：** `super_admin` は `acknowledgeOvercommit: true` を設定することで、意図的にガードレールを超えることができます。オーバーライドは高重要度の監査ログに記録されます。`tenant_admin` はオーバーライドできません（また、実際にはクォータを全く更新できません — 変更には `super_admin` が必要です）。

```json
{
  "quotaPlan": "CUSTOM",
  "customQuotas": { "rateLimit": { "perMinute": 1000000 } },
  "acknowledgeOvercommit": true
}
```

> **較正に関する注意（#3114）：** `CLUSTER_CAPACITY_WEIGHTED_PER_MIN` は**プレースホルダーのガードレール予算**であり、測定された Atlas スループットではありません。現在の値 `600000` で `MAX_SINGLE_TENANT_SHARE=0.5` とすると `maxPerMinute=300000` となり、#3118 ENTERPRISE/PREMIUM `perMinute` に対するレガシーの約 5 倍のマージン（`300000/60000`）が維持されます（共有 API GW は公開 rps を 1000 に制限しています; 生の ×10 ENTERPRISE は 180000 でした）。病的な値（例: `perMinute=1_000_000`）は依然として拒否されます。`ENDPOINT_WEIGHTS` は経験的な較正（#1509）を待つ間、ヒューリスティックのままです。定数は**コンパイル時のもので — 環境で調整可能ではありません**（[Environment Variables](#environment-variables) を参照）。手順: QUOTA\_OPERATIONS.md。
>
> 専用クラスターのバインディング / plan×tier の導出は引き続き #1492 / #1559 です。

### 使用履歴の取得

```http
GET /admin/tenants/{tenantId}/usage?startDate=2026-02-01&endDate=2026-02-10&limit=100
```

**レスポンス：**

```json
{
  "tenantId": "tenant-1",
  "tenantName": "tenant1",
  "startDate": "2026-02-01",
  "endDate": "2026-02-10",
  "snapshots": [
    {
      "tenantService": "tenant1#/",
      "timestamp": 1707645123456,
      "date": "2026-02-10",
      "rateLimit": { ... },
      "storage": { ... }
    }
  ]
}
```

## 環境変数

### SAM テンプレート

```yaml
Parameters:
  RateLimitEnabled:
    Type: String
    Default: 'true'
    Description: Enable rate limiting for API requests

  QuotaAlertWebhookUrl:
    Type: String
    Default: ''
    Description: Webhook URL for quota violation alerts
```

### 環境変数


* `RATE_LIMIT_ENABLED`: レート制限の有効/無効を設定(デフォルト: `true` — 未設定/その他の値は有効として扱われます。明示的なオプトアウトのみが緊急停止スイッチとして機能します — 空白をトリミングし小文字化した後にマッチするため、`false`/`FALSE`/`" false "` はすべて無効化します、#1516)
  
* `RATE_LIMIT_TABLE_NAME`: DynamoDB レート制限テーブル名
  
* `USAGE_STATS_TABLE_NAME`: DynamoDB 使用統計テーブル名
  
* `QUOTA_ALERT_WEBHOOK_URL`: アラート配信用の Webhook URL (オプション)

**容量受付チェック (#1509 / #1983): 環境変数による調整は不可。**

> ⚠️ **これらはコンパイル時定数であり、環境変数ではありません (#1983)。** このドキュメントの初期版では `QUOTA_ADMISSION_ENABLED`、`CLUSTER_CAPACITY_WEIGHTED_PER_MIN`、`QUOTA_MAX_SINGLE_TENANT_SHARE`、`QUOTA_ADMISSION_REPRESENTATIVE_WEIGHT` が調整可能な環境変数としてリストされていました。これらは **`infrastructure/template.yaml` に配線されたことはなく**、設定してもデプロイ環境では効果がなく、#1983 で `process.env` の読み取りが完全に削除されました。**これらの名前を設定しても何も起こりません。** これはインシデント時に最も重要で、失敗モードは「変数を設定し、再デプロイし、なぜ何も変わらないのか疑問に思う」というものです。

現在の値は `QUOTAS.ADMISSION` (`src/config/defaults.ts`) に存在し、コード変更 + デプロイによってのみ変更されます:

| Constant                            | Value    | Meaning                                                                            |
| ----------------------------------- | -------- | ---------------------------------------------------------------------------------- |
| `ENABLED`                           | `true`   | Admission check is always on — there is no kill switch                             |
| `CLUSTER_CAPACITY_WEIGHTED_PER_MIN` | `600000` | Cluster's budgeted capacity in weighted units/min (#3114)                          |
| `MAX_SINGLE_TENANT_SHARE`           | `0.5`    | Max fraction of that capacity one tenant's quota may claim                         |
| `REPRESENTATIVE_WEIGHT`             | `5`      | Max `ENDPOINT_WEIGHTS` value (record only; not multiplied into demand since #3114) |

これらは **プレースホルダーのガードレールであり、測定された Atlas 容量ではありません**。意図された方向性は、環境変数を再導入するのではなく、**プラン × クラスタ層** から導出することです (#1559)。キャリブレーション手順については QUOTA\_OPERATIONS.md を、専用クラスタバインディングについては #1492 を参照してください。

## アクセス制御

### 権限レベル


* **super\_admin**: すべてのテナントのクォータを表示および変更可能
  
* **tenant\_admin**: 自分のテナントのクォータを表示可能 (読み取り専用)。変更には `super_admin` が必要
  
* **user**: クォータ管理 API へのアクセス権なし

### 認証

すべてのクォータ管理 API は認証が必要です:

```http
Authorization: Bearer <JWT_TOKEN>
```

## ベストプラクティス

### クォータプランの選択


1. **開発/テスト**: FREE プランから始める
   
2. **小規模本番環境**: STANDARD プラン
   
3. **中規模本番環境**: PREMIUM プラン
   
4. **大規模本番環境**: ENTERPRISE プラン
   
5. **特別な要件**: CUSTOM プランで個別に設定

### アラート設定


* **Warning**: 容量拡張を検討する閾値(デフォルト 80%)
  
* **Critical**: 即座の対応が必要な閾値(デフォルト 95%)
  
* リアルタイム通知を受信するために Webhook URL を設定

### 監視


* レスポンスヘッダーを定期的に確認
  
* 使用履歴 API でトレンドを分析
  
* アラートログを監視

## トラブルシューティング

### 429 Too Many Requests

**原因**: レート制限を超過

**解決方法**:

1. `Retry-After` ヘッダーで指定された秒数待機
   
2. リクエスト頻度を削減
   
3. バッチ操作を活用してリクエスト数を削減
   
4. プランのアップグレードを検討

### 507 Insufficient Storage

**原因**: ストレージクォータを超過 — 使用量がプランの公称制限だけでなく [猶予上限](#soft-limits-grace-band-1571) を超過しました。(公称制限と上限の間の使用は `X-Quota-Soft-Exceeded` ヘッダー付きで許可され、拒否されません。)

**解決方法**:

1. 不要なエンティティ/サブスクリプション/レジストレーションを削除
   
2. 時系列データの保持期間を短縮
   
3. プランのアップグレードを検討

### クォータヘッダーが表示されない

**原因**: レート制限が無効化されている可能性

**解決方法**:

1. `RATE_LIMIT_ENABLED` 環境変数を確認
   
2. SAM テンプレートパラメータを確認
   
3. DynamoDB テーブルが正しくデプロイされているか検証

## 入力検証制限

GeonicDB は、悪用を防ぎシステムの安定性を確保するために、入力長とカウント制限を適用します。

### 認証 & ログイン保護

#### アカウント毎のログイン保護

既存のアカウント毎のブルートフォース保護([AUTH.md](../reference/auth.md) を参照):


* アカウント毎の最大ログイン失敗回数:**15 分**以内に **5 回**
  
* アカウントロック期間:閾値に達してから **15 分間**
  
* 段階的遅延:**2 秒**から始まる指数バックオフ(2^(n-2))

#### IP 毎のログイン保護(#900)

単一の IP から複数のアカウントに対するパスワードスプレー攻撃を防止:

| Parameter                      | Value                       |
| ------------------------------ | --------------------------- |
| Maximum failed attempts per IP | **20** within **5 minutes** |
| IP lock duration               | **15 minutes**              |
| Record TTL                     | **1 hour** (auto-deleted)   |


* **HTTP ステータス**:`429 Too Many Requests` と `Retry-After: 900`
  
* ログイン成功時に IP カウンターはリセットされない(タイミングベースの列挙を防止)
  
* エラーメッセージ:`"Too many failed login attempts from this IP. Please try again later."`

### テナントリソース制限

#### テナント毎のユーザー数(#901)

| Parameter                | Default                                                                |
| ------------------------ | ---------------------------------------------------------------------- |
| Maximum users per tenant | **the tenant's plan value** — 100 for T0/T5/T30, 1,000 for T40 (#2082) |


* ユーザー作成時のみチェック
  
* `tenant.settings.maxUsers` によるテナント毎のオーバーライド - 明示的な値がプランのデフォルトに優先
  
* **HTTP ステータス**:`400 Bad Request`
  
* エラーメッセージ:`"User limit reached for this tenant (current: N, limit: M)"`

#### テナント毎のポリシー数(#912)

| Parameter                   | Default |
| --------------------------- | ------- |
| Maximum policies per tenant | **50**  |


* `tenant.settings.maxPolicies` によるテナント毎のオーバーライド
  
* **HTTP ステータス**:`400 Bad Request`
  
* エラーメッセージ:`"Policy limit reached for this tenant (current: N, limit: M)"`

#### 管理者ユーザー操作レート制限(#905)

Admin API での作成・削除サイクル攻撃を防止:

| Parameter                     | Value                                |
| ----------------------------- | ------------------------------------ |
| Window                        | **10 minutes**                       |
| Maximum operations per window | **1,000** (create + delete combined) |


* `createUser` と `deleteUser` に対してテナント毎に適用
  
* `super_admin` は免除
  
* **HTTP ステータス**:`429 Too Many Requests`
  
* エラーメッセージ:`"Too many user management operations. Limit: 1000 per 10 minutes."`

### XACML ポリシー入力制限(#912)

| Field                                 | Max Length       |
| ------------------------------------- | ---------------- |
| `policyId` / `policySetId` / `ruleId` | 256 characters   |
| `description`                         | 2,000 characters |
| `attributeId`                         | 256 characters   |
| `matchValue`                          | 2,000 characters |
| `expression` (condition)              | 5,000 characters |
| `timezone`, `startTime`, `endTime`    | 50 characters    |
| IP/CIDR entry in `allowedIps`         | 50 characters    |

| Collection              | Max Count |
| ----------------------- | --------- |
| Rules per policy        | 100       |
| Conditions per rule     | 50        |
| Policies per policy set | 100       |

### メールアドレスの検証 (#903)


* 最大長:**254 文字**(RFC 5321 準拠)
  
* 適用対象:ユーザー作成、ユーザー更新、ログイン
  
* **HTTP ステータス**:`400 Bad Request`

### サブスクリプションエンドポイント URI/URL (#913)


* 最大長:**2,048 文字**
  
* 適用対象:NGSI-LD `notification.endpoint.uri`、NGSIv2 `notification.http.url` / `notification.httpCustom.url` / `notification.mqtt.url`
  
* **HTTP ステータス**:`400 Bad Request`

### 入力検証の制限(一般)

GeonicDB はすべての API エンドポイントにわたって包括的な入力検証を実施します。いずれかの制限を超えると `400 Bad Request` が返されます。

#### 文字列長の制限

| Category           | Example Fields                               | Max Length |
| ------------------ | -------------------------------------------- | ---------- |
| Entity ID          | `entityId`, `id`                             | 256        |
| Entity Type        | `type`                                       | 256        |
| Attribute Name     | `attrName`, attribute keys                   | 256        |
| Generic ID         | `subscriptionId`, `registrationId`, `ruleId` | 256        |
| Name fields        | `name`, `subscriptionName`                   | 256        |
| Description fields | `description`                                | 2,000      |
| URL fields         | `endpoint`, `provider.http.url`              | 2,048      |
| Query strings      | `q`, `mq`, `scopeQ`, `csf`                   | 2,000      |
| Regex patterns     | `idPattern`, `typePattern`                   | 200        |
| georel             | `georel`                                     | 100        |
| geometry           | `geometry`                                   | 50         |
| coords             | `coords`, `coordinates`                      | 2,000      |
| orderBy            | `orderBy`                                    | 500        |
| options            | `options`                                    | 200        |
| lang               | `lang`                                       | 50         |
| scope              | `scope` (string)                             | 500        |
| unitCode           | `unitCode`                                   | 50         |

#### 配列要素数の制限

| Array Field                                                         | Max Elements                                    |
| ------------------------------------------------------------------- | ----------------------------------------------- |
| `attrs`, `pick`, `omit`, `expandValues`                             | 50                                              |
| `watchedAttributes`                                                 | 100                                             |
| `notification.attrs` / `exceptAttrs`                                | 100                                             |
| `subject.entities` / `entities`                                     | 100                                             |
| Batch operation `entities`                                          | 100 (MAX\_BATCH\_SIZE)                          |
| `propertyNames` / `relationshipNames`                               | 100                                             |
| `receiverInfo` / `notifierInfo`                                     | 50                                              |
| `contextSourceInfo`                                                 | 50                                              |
| `operationGroup`                                                    | 20                                              |
| `scope` (array)                                                     | 20                                              |
| `@context` (array)                                                  | 10                                              |
| `scopeQ` OR alternatives / total terms (`\|` / `,` / `;` 分割後) | 50 (`QUERY_LIMITS.MAX_QUERY_CONDITIONS`, #2583) |

> エンティティドキュメントの BSON サイズは**バイト**制限です(要素数ではありません)。詳細は
> [Entity document size (#2517)](#entity-document-size-2517) を参照してください。

#### 数値の上限

| Field        | Max Value                     |
| ------------ | ----------------------------- |
| `throttling` | 86,400 (24 hours, in seconds) |
| `timeout`    | 30,000 (30 seconds, in ms)    |
| `lastN`      | 1,000                         |

#### エンティティドキュメントサイズ (#2517)

保存される各エンティティ(`entities` コレクション内の MongoDB ドキュメント)は **≤ 1 MiB BSON** である必要があります(`QUOTAS.MAX_ENTITY_DOCUMENT_BYTES`)。この制限は**プランごとの HTTP リクエストボディクォータとは独立しています** — PREMIUM (5 MB) または ENTERPRISE (10 MB) リクエストが入口審査を通過しても、結果として生成されるドキュメントが 1 MiB を超える場合、**413 `RequestEntityTooLarge`** を受け取る可能性があります。すでに制限に達しているドキュメントの成長は拒否されます(既存の読み取り/削除/縮小は引き続き許可されます)。暗号化されたテナントでは、現在のドキュメントがまだ制限内にある場合、置換は暗号化**前**にオーバーサイズの属性ペイロードを拒否します(KMS / DEK ローテーション節約のため)。現在のドキュメントがすでに制限を超えている場合、縮小置換はアトミック縮小ガードを介して実行されます。
同じエンティティ ID は、1 つのバッチ upsert 内で最大 `SECURITY.MAX_ENTITY_BATCH_OCCURRENCE_ROUNDS` (8) 回まで出現できます — それを超えると、書き込みの前に **400** エラーとなります。これは NGSIv2 `/v2/op/update`、NGSI-LD `entityOperations/upsert`(merge および replace)、MCP、および A2A バッチ upsert のすべてに適用されます。スナップショット復元は意図的にこのガードをバイパスします(`snapshot.repository.ts` を参照)。

#### ヘッダー検証

| Header                           | Max Length |
| -------------------------------- | ---------- |
| Bearer / DPoP token              | 8,192      |
| Link (@context URL)              | 2,048      |
| Fiware-ServicePath (per element) | 256        |
| Tenant name (Fiware-Service)     | 64         |

#### パスパラメータ検証

URL パス内のリソース ID も長さが検証されます。

| Parameter        | Max Length | Applicable APIs          |
| ---------------- | ---------- | ------------------------ |
| `entityId`       | 256        | NGSIv2, NGSI-LD          |
| `attrName`       | 256        | NGSIv2, NGSI-LD          |
| `subscriptionId` | 256        | NGSIv2, NGSI-LD          |
| `registrationId` | 256        | NGSIv2, NGSI-LD          |
| `instanceId`     | 256        | NGSI-LD Temporal         |
| `entityMapId`    | 256        | NGSI-LD Entity Maps      |
| `contextId`      | 256        | NGSI-LD JSON-LD Contexts |
| `snapshotId`     | 256        | NGSI-LD Snapshots        |
| `ruleId`         | 256        | Rules API                |
| `typeName`       | 256        | NGSIv2/NGSI-LD Types     |
| `datasetId`      | 256        | Catalog API              |

#### AttributeValue のネスト深度制限


* 最大深度:**10**
  
* 制限を超えると、プリミティブ型 (string、number、boolean、null) のみが受け入れられます
  
* **HTTP ステータス**:`400 Bad Request` ネストが制限を超えた場合

#### MQTT 通知フィールド

| Field             | Max Length |
| ----------------- | ---------- |
| `topic`           | 1,024      |
| `user` / `passwd` | 256        |

#### HTTP カスタム通知フィールド

| Field              | Max Length    |
| ------------------ | ------------- |
| Header key         | 256           |
| Header value       | 4,096         |
| Query string value | 2,048         |
| `payload`          | 51,200 (50KB) |

#### Admin API 検証

| Field                                                                   | Max Length / Value          |
| ----------------------------------------------------------------------- | --------------------------- |
| Tenant `name`                                                           | 64                          |
| Tenant `maxUsers`                                                       | 10,000                      |
| Tenant `description`                                                    | 2,000                       |
| Tenant `allowedServices`                                                | 50 elements, each 256 chars |
| User `password`                                                         | 128 (also minimum 12)       |
| Policy `priority`                                                       | 0–1,000                     |
| Policy `subjects` / `resources` / `actions` array                       | 50 elements each            |
| API key `policyId` / `tenantId`                                         | 256                         |
| API key origin                                                          | 2,048                       |
| OAuth client `name`                                                     | 256                         |
| OAuth client `description`                                              | 2,000                       |
| Path parameters (`tenantId`, `userId`, `policyId`, `keyId`, `clientId`) | 256                         |

#### Auth & OAuth API 検証

| Field                   | Max Length |
| ----------------------- | ---------- |
| Login `password`        | 128        |
| Login `tenantId`        | 256        |
| Refresh token           | 8,192      |
| Password reset `token`  | 2,048      |
| OAuth `scope`           | 2,000      |
| OAuth `client_secret`   | 512        |
| OAuth `nonce` / `proof` | 512        |

#### カスタムクォータの上限

Admin API を介してカスタムクォータを構成する場合、以下の最大値が適用されます:

| Field                              | Max Value           |
| ---------------------------------- | ------------------- |
| `rateLimit.perMinute`              | 1,000,000           |
| `rateLimit.perHour`                | 10,000,000          |
| `rateLimit.perDay`                 | 100,000,000         |
| `rateLimit.burstAllowance`         | 100,000             |
| `rateLimit.maxNotificationsPerDay` | 100,000,000         |
| `storage.maxEntities`              | 1,000,000,000       |
| `storage.maxSubscriptions`         | 1,000,000           |
| `storage.maxRegistrations`         | 1,000,000           |
| `storage.maxTemporalDataPoints`    | 1,000,000,000       |
| `limits.maxRequestBodyBytes`       | 100MB (104,857,600) |
| `limits.maxResponseBodyBytes`      | 1GB (1,073,741,824) |
| `limits.maxBatchSize`              | 10,000              |

#### Rules API 検証

| Field                                          | Max Length / Value |
| ---------------------------------------------- | ------------------ |
| Rule `name`                                    | 256                |
| Rule `description`                             | 2,000              |
| Rule `priority`                                | 0–1,000            |
| Rule `cooldownSeconds`                         | 86,400 (24h)       |
| Condition `attributeName`                      | 256                |
| Condition `pattern`                            | 200                |
| Condition `timezone` / `startTime` / `endTime` | 50                 |
| Action `entityId`                              | 256                |
| Action `entityType`                            | 256                |
| Action `url` (webhook)                         | 2,048              |
| Action `message`                               | 2,000              |
| `conditions` / `actions` array                 | 50 elements each   |
| `entityTypes` array                            | 100 elements       |

#### カスタムデータモデル API 検証

| Field                                | Max Length / Value |
| ------------------------------------ | ------------------ |
| Model `type`                         | 256                |
| Model `domain`                       | 256                |
| Model `description`                  | 2,000              |
| Property `valueType`                 | 256                |
| Property `description`               | 2,000              |
| Validation `minLength` / `maxLength` | 10,000             |
| Validation `enum` array              | 100 elements       |

#### Catalog / CADDE / Vocabulary API Validation

| Field                                  | Max Length          |
| -------------------------------------- | ------------------- |
| Catalog `q` (keyword)                  | 2,000               |
| Catalog `id` (package/dataset)         | 256                 |
| CADDE query params (`type`, `id`, `q`) | Same as NGSI limits |
| Vocabulary `tenantId`                  | 64                  |
| Vocabulary `term`                      | 256                 |

#### MCP Admin Tools Validation

MCP ツールは HTTP Admin API と同じ制限をツール入力層で適用します:

| Field                        | Validation                        |
| ---------------------------- | --------------------------------- |
| `email`                      | Valid email format, max 254 chars |
| `password`                   | 12–128 chars                      |
| `id` / `policyId` / `tenant` | Max 256 chars                     |
| `description`                | Max 2,000 chars                   |
| `priority`                   | 0–1,000                           |

すべての制限違反は以下を返します:

* **HTTP ステータス**: `400 Bad Request`
  
* **エラー形式**: `{ "error": "BadRequest", "description": "field exceeds maximum length of N" }`

### どのバッチアクションがエンティティストレージクォータを消費するか (#902 / #2183 / #2185)

操作がエンティティストレージクォータを消費するのは、エンティティを**作成**できる場合です。バッチ更新の場合、これは upsert パスに到達するかどうかで決まります:
`EntityService.batchUpdateEntities()` は `append` / `appendStrict` / `update` を `batchUpsert()` に送信します(これは `upsert: true` を伴う `bulkWrite` であり、存在しない id は挿入されます)。一方、`replace` / `delete` のみをエンティティごとのループ (`replaceEntityAttributes` / `deleteEntity`) に送信します。


* **`append` / `appendStrict` / `update`**: エンティティ作成としてカウントされる — ストレージクォータを消費
  
* **`replace` / `delete`**: カウントされない — これらは新しいエンティティを挿入しない
  
* 未知の `actionType` は作成として扱われます(フェイルクローズ); リクエストはその後のバリデーションで拒否されます

同じルールがすべてのエントリポイントに適用されます。MCP / A2A `batch` ツールは `create` / `upsert` / `merge` と `update` を同じ upsert パスにマッピングするため、これらは HTTP `/v2/op/update` と同等にクォータを消費します。`update` が除外されるのは、その `actionType` が upsert しない値のいずれかである場合のみです — 分類器は HTTP パスと `batchActionTypeCreatesEntities()` を共有しているため、それは `"replace"` または `"delete"` です。実際には `"replace"` のみが到達可能です: MCP `batch` ツールのスキーマは `actionType: "update" | "append" | "replace"` を受け入れるため、`"delete"` はディスパッチされる前に入力バリデーションで拒否されます(A2A `batch` スキルには `update` アクションがまったくありません)。

履歴: `/v2/op/update` は元々 `actionType` に関係なく**すべての**リクエストをカウントしていました; #902 はこれを `append` / `appendStrict` に絞りました。これは狭すぎました — `update` も upsert するため、#2185 (HTTP) と #2183 (MCP `batch` `update` / `merge`) が「作成できるか?」ルールを復元し、すべてのエントリポイントで共有される単一のヘルパーに決定を移すまでカウントされないままでした。

### JSON-RPC バッチボディ (#2182)

`/mcp` は JSON-RPC バッチとして**トップレベル JSON 配列**を受け入れ、すべての要素を実行します。したがって、クォータ分類は各要素を検査し、制限をチェックする前にリソースディメンションごとおよびテナントごとに消費量を**合計**します。合計がない場合、各書き込みを独自の配列要素でラップすると、合計が制限を超えていても各要素が独自のチェックを通過します(使用量はまだ書き込まれていません)。プランレベルの `maxBatchSize` も同じ方法で要素全体で合計されます。

## 関連ドキュメント


* Quota Operations Guide - 運用ランブック: クォータの引き上げ/診断、plan↔tier↔constant マッピング、キャリブレーション手順


* Development & Deployment Guide - インフラストラクチャセットアップ
  
* [Authentication & Authorization](../reference/auth.md) - テナント/ユーザー管理、アクセスコントロール
