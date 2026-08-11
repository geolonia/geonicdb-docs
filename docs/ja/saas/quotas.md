---
title: "Quotas & Plans"
description: "GeonicDB quota system and plans"
outline: deep
---
# GeonicDB クォータシステム

GeonicDB は、テナントごとのレート制限とストレージクォータを管理するための包括的なクォータシステムを提供します。

## 概要

クォータシステムは 3 つの主要コンポーネントで構成されています:


1. **レート制限システム** - DynamoDB または MongoDB を基盤とした固定ウィンドウカウンターを使用した API リクエスト制限
   
2. **ストレージクォータシステム** - MongoDB に基づくエンティティ/サブスクリプション/レジストレーション/時系列データの数制限
   
3. **モニタリング & 管理システム** - 使用状況追跡、アラート配信、管理 API

## クォータプラン

GeonicDB は 4 つの標準プランとカスタムプランを提供しています:

### FREE プラン (評価および開発用)

**レート制限:**

* 毎分: 60 ウェイトユニット (weight-1 の GET のみの場合、1 リクエスト/秒に相当 — [エンドポイントウェイト](#endpoint-weights) を参照)
  
* 毎時: 1,000 ウェイトユニット
  
* 毎日: 10,000 ウェイトユニット
  
* バースト許容量: 10 ウェイトユニット

**ストレージクォータ:**

* エンティティ: 1,000
  
* サブスクリプション: 10
  
* レジストレーション: 5
  
* 時系列データポイント: 10,000

**制限:**

* 最大リクエストボディサイズ: 512KB
  
* 最大レスポンスボディサイズ: 5MB
  
* 最大バッチ操作サイズ: 50

### STANDARD プラン (小規模本番環境用)

**レート制限:**

* 毎分: 600 ウェイトユニット (weight-1 の GET のみの場合、10 リクエスト/秒に相当)
  
* 毎時: 10,000 ウェイトユニット
  
* 毎日: 100,000 ウェイトユニット
  
* バースト許容量: 100 ウェイトユニット

**ストレージクォータ:**

* エンティティ: 10,000
  
* サブスクリプション: 100
  
* レジストレーション: 50
  
* 時系列データポイント: 100,000

**制限:**

* 最大リクエストボディサイズ: 1MB
  
* 最大レスポンスボディサイズ: 10MB
  
* 最大バッチ操作サイズ: 100

### PREMIUM プラン(中規模本番環境)

**レート制限:**

* 毎分: 3,000 ウェイトユニット(weight-1 GET のみの場合 50 req/sec 相当)
  
* 毎時: 50,000 ウェイトユニット
  
* 毎日: 500,000 ウェイトユニット
  
* バースト許容量: 500 ウェイトユニット

**ストレージクォータ:**

* エンティティ: 100,000
  
* サブスクリプション: 500
  
* レジストレーション: 200
  
* 時系列データポイント: 1,000,000

**制限:**

* 最大リクエストボディサイズ: 5MB
  
* 最大レスポンスボディサイズ: 50MB
  
* 最大バッチ操作サイズ: 500

### ENTERPRISE プラン(大規模本番環境)

**レート制限:**

* 毎分: 12,000 ウェイトユニット(weight-1 GET のみの場合 200 req/sec 相当)
  
* 毎時: 200,000 ウェイトユニット
  
* 毎日: 2,000,000 ウェイトユニット
  
* バースト許容量: 2,000 ウェイトユニット

**ストレージクォータ:**

* エンティティ: 1,000,000
  
* サブスクリプション: 2,000
  
* レジストレーション: 1,000
  
* 時系列データポイント: 10,000,000

**制限:**

* 最大リクエストボディサイズ: 10MB
  
* 最大レスポンスボディサイズ: 100MB
  
* 最大バッチ操作サイズ: 1,000

### CUSTOM プラン

任意の値を設定できるカスタムプランです。管理 API を使用して個別に設定します。

## レート制限

### Fixed-Window Counter

GeonicDB は 3 つのウィンドウ(分/時/日)にわたる **fixed-window counter** を使用します。ウィンドウの境界は絶対的です:現在時刻は分/時/日の境界に切り捨てられ(`src/core/quotas/rate-limit/rate-limit.service.ts` の `getWindowTimestamp()`)、その切り捨てられたタイムスタンプがウィンドウを識別します。


1. 各リクエストはエンドポイントのウェイトに等しい許容量を消費します
   
2. リクエストは、3 つすべてのウィンドウに十分な残り許容量がある場合にのみ許可されます
   
3. ウィンドウがロールオーバーすると、その残り許容量は**完全な制限値にリセット**されます — 徐々に補充されるわけではありません

> ⚠️ これは **token bucket ではなく**、ウィンドウは**スライディングではありません**。段階的な補充はありません:ウィンドウの境界を越えると、許容量全体が一度に復元されます(`src/infrastructure/mongodb-kv/rate-limit.ts` の `trySlowPathConsumeMongo()` はローテーション時に `remainingMinute = limits.minute - weight` を割り当てます)。補充モデルを仮定すると誤った結論につながります — #1806 を参照してください。そこでは、不安定なテストがその前提に基づいて誤診断されました。

### エンドポイントの重み

各エンドポイントには、処理コストに基づいて異なる重みが割り当てられます:

| Operation                        | Weight    | Example                                    |
| -------------------------------- | --------- | ------------------------------------------ |
| GET                              | 1         | `GET /v2/entities`                         |
| POST (single)                    | 3         | `POST /v2/entities`                        |
| PATCH/PUT                        | 2         | `PATCH /v2/entities/{id}`                  |
| DELETE                           | 2         | `DELETE /v2/entities/{id}`                 |
| Batch operations                 | 5 × count | `POST /v2/op/update` with 10 entities = 50 |
| Temporal read                    | 2         | `GET /ngsi-ld/v1/temporal/entities`        |
| Temporal write (POST collection) | 3         | `POST /ngsi-ld/v1/temporal/entities`       |

受信リクエストパスは、`resolveEndpointWeight()` (`src/core/quotas/rate-limit/rate-limit.constants.ts`) によってこれらのエンドポイントテンプレートと照合されます。この関数は各 `{placeholder}` を単一のパスセグメントとして扱います。これにより、`/v2/entities/urn:ngsi-ld:Store:001` のような具体的な本番パスは、`DEFAULT_WEIGHT` にフォールバックすることなく、正しく `GET /v2/entities/{id}` の重みに解決されます (#1521)。

### バースト許容量

各プランには、短期間の急激なトラフィックスパイクを処理するためのバースト許容量があります。これにより、一時的に制限を超えることができます。

### レスポンスヘッダー

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

レート制限を超えた場合:


* **HTTP ステータスコード**: `429 Too Many Requests`
  
* **Retry-After ヘッダー**: 次のリクエストが許可されるまでの秒数
  
* **エラーメッセージ**: `{"error": "TooManyRequests", "description": "Rate limit exceeded"}`

### パブリック(未認証)エンドポイントのレート制限 (#1075)

認証なしでアクセス可能なパブリックエンドポイントは、テナントごとの `QUOTAS.PLANS` とは独立した IP ベースの固定ウィンドウカウンターによって保護されています。これにより、OAuth の `client_id+secret` のブルートフォース攻撃や、重い JSON 生成(`/openapi.json` など)による DoS をブロックします。

| Category                  | Endpoints                                                                                                                                       | Per minute | Per hour | Per day | Burst |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------: | -------: | ------: | ----: |
| `metadata`                | `/openapi.json`, `/api.json`, `/tools.json`, `/llms.txt`, `/.well-known/ai-plugin.json`, `/.well-known/agent-card.json`, `/.well-known/ngsi-ld` |         30 |      300 |   1,000 |    10 |
| `oauth` (per IP)          | `/oauth/token`                                                                                                                                  |         20 |      100 |     500 |     5 |
| `oauth` (per `client_id`) | `/oauth/token`                                                                                                                                  |         10 |       60 |     200 |     2 |
| `auth`                    | `/auth/refresh`, `/auth/nonce`                                                                                                                  |         30 |      200 |   1,000 |     5 |

注意事項:


* `/auth/login` はこの制限の対象**ではありません**。これは `LoginProtectionService` (メール + IP ベースの段階的ロックアウト)によって保護されています。
  
* `/health`、`/health/live`、`/health/ready`、`/version` はこの制限の対象**ではありません**(ヘルスチェックポーリングを目的としています)。
  
* バケットストア(DynamoDB / MongoDB)が利用できない場合、リクエストは許可されます。パブリックサーフェスをオフラインにしないために、インフラストラクチャエラー時にフェイルクローズしません。
  
* デフォルト値は `src/config/defaults.ts` の `PUBLIC_RATE_LIMIT` に集約されています。

## テナント毎の同時実行数制限 (#1510 / Epic #1485)

req/s の rate-limit だけでは「per-query コスト × 同時実行数」を bound できない。1 テナントが多数の重いリクエストを**同時に**投げると、Lambda 予約枠 (#1508) や DB 接続を占有し、他テナントの公平性が損なわれる。これを補うため、**テナント毎の同時 in-flight リクエスト数**に上限を設ける。


* **常時有効 (feature flag なし)**。有限な MongoDB を 1 テナントの同時大量リクエストから守るため、リミットは常に効いている必要がある。全データプレーンリクエストにスロット取得 / 解放の 1 往復 (DynamoDB / standalone は Mongo) が加わるが、これは DB 保護の代償。
  
* 上限はプラン別 `rateLimit.maxConcurrency` (FREE=5 / STANDARD=20 / PREMIUM=50 / ENTERPRISE=100、`src/config/defaults.ts`)。`customQuotas.rateLimit.maxConcurrency` で per-tenant 調整 (暴走テナントを絞る / 大口テナントを緩める)。正の値は**実行時に最大 1000 (`QUOTAS.CONCURRENCY.MAX_CONCURRENCY`) へクランプ**される (探索コストと Lambda 同時実行の現実的上限)。**`maxConcurrency` が 0 のプラン / テナントは無制限** (acquire が即 no-op、DDB アクセスなし) — 特定テナントだけ無効化したい場合に使える。
  
* **キーは per-tenant** (`Fiware-Service` / テナント名のみ。servicePath は含めない — servicePath 回しでの回避を防ぐ)。`scopeKeyToDeployment` でデプロイメント間も分離。
  
* **方式: 固定スロット lease セマフォ (方式D)**。テナントごとに `0..max-1` の固定スロットを持ち、リクエストは空き (または lease 失効) スロットを 1 つ条件付き書き込みで排他取得する。
  
  * **overshoot なし**: 各スロットは条件付き書き込みで排他されるため、同時保持は最大 `max`。
    
  * **恒久ロックアウトなし**: Lambda timeout/kill で解放が漏れても、lease (`CONCURRENCY.LEASE_MS`=35s) 失効で他リクエストが再取得できる (自己修復)。DynamoDB TTL はストレージ掃除用。
    
* 上限超過は **429 TooManyRequests** (`recordQuotaViolation('concurrency')`)。
  
* カウンタは rate-limit と同じ `RateLimitBucketsTable` (`pk=<tenant>#concurrency` / `sk=slot`) を流用 (新テーブル不要、IAM 既存)。standalone は Mongo `concurrencySlots` コレクション (unique index + TTL)。
  
* **fail-open**: スロットストア障害時はリクエストを通す (`metric: 'ConcurrencyInfrastructureFailure'` / `'ConcurrencyCheckTransientFailure'`。rate-limit とは別系統メトリクス)。
  
* 定数は `QUOTAS.CONCURRENCY` (`src/config/defaults.ts`)。
  
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

## ストレージクォータ

### リソースタイプ

クォータは 4 つのタイプのリソースに対して設定されます:


1. **Entities** - NGSIv2/NGSI-LD エンティティの総数
   
2. **Subscriptions** - アクティブなサブスクリプションの総数
   
3. **Registrations** - コンテキストソース登録の総数
   
4. **Temporal data points** - 時系列データポイントの総数

### 事前チェック

ストレージクォータは、作成操作の**前に**チェックされます:


* バッチ操作の場合、すべてのエンティティがクォータ内に収まる場合にのみ実行が進行します
  
* 1 つでもクォータを超える場合、操作全体が拒否されます(オールオアナッシング)

### レスポンスヘッダー

NGSIv2、NGSI-LD、および Catalog API エンドポイントには、現在のストレージ使用状況を示すヘッダーが含まれます:

```http
X-Storage-Quota-Entities-Used: 5000
X-Storage-Quota-Entities-Limit: 10000
X-Storage-Quota-Subscriptions-Used: 50
X-Storage-Quota-Subscriptions-Limit: 100
X-Storage-Quota-Registrations-Used: 25
X-Storage-Quota-Registrations-Limit: 50
X-Storage-Quota-TemporalDataPoints-Used: 50000
X-Storage-Quota-TemporalDataPoints-Limit: 100000
```

**対象エンドポイント**: これらのヘッダーは、NGSIv2、NGSI-LD、および Catalog API のすべてのエンドポイントによって返されます。[management API](#management-api) (`/admin/tenants/{tenantId}/quotas`) を使用すると、より詳細なクォータ情報を取得できます。

### ストレージクォータを超えた場合の動作

ストレージクォータを超えた場合:


* **HTTP ステータスコード**: `507 Insufficient Storage`
  
* **エラーメッセージ**: リソースタイプと現在の使用状況が含まれます
  
* **例**: `{"error": "InsufficientStorage", "description": "Entity quota exceeded (10000/10000)", "details": {"resourceType": "entities", "current": 10000, "limit": 10000}}`

## 監視とアラート

### レート制限インフラストラクチャ障害メトリクス (#1419)

レート制限チェックは **fail-open** です。バケットストア (DynamoDB / MongoDB) がエラーになった場合、リクエストはブロックされずに許可されます。この障害モードを観測可能に保つため、すべての無視されたエラーは CloudWatch Metric Filters に適した構造化された `metric` マーカーでログに記録されます。


* `metric: "RateLimitInfrastructureFailure"` — 自動回復しない **永続的** エラー (`ValidationException`、`SerializationException`、`ResourceNotFoundException`、`AccessDeniedException`。リストは `QUOTAS.RATE_LIMIT_PERMANENT_ERROR_NAMES`、`src/config/defaults.ts` にあります)。これらはコードまたは設定のバグを示しており、修正されるまでレート制限がフリート全体でサイレントに無効化されます。**このマーカーは高重要度の CloudWatch アラームに配線する必要があります。**
  
* `metric: "RateLimitCheckTransientFailure"` — スロットリング、タイムアウト、およびその他の一時的なストアエラー。

背景: 3 件連続の DynamoDB 式バグ (#1385) が、無差別な fail-open キャッチによって数日間隠されていました。分類は `src/core/quotas/rate-limit/rate-limit-failure.ts` にあり、テナントおよびパブリックのレート制限パスで共有されています。

例外 (#1685): Mongo (スタンドアロン) パスでは、レート制限バケットの原子性は `insertOne` + ユニークインデックス `idx_rate_limit_bucket_unique` に対する重複キーリトライに依存しています。これがないと、重複バケットがレート制限をサイレントにバイパスします。したがって、このインデックスは `MONGODB.CRITICAL_INDEXES` にリストされており、作成に失敗すると fail-open ランタイムパスにフォールスルーするのではなく、**fail-closed** になります (インデックス初期化時に接続が拒否されます)。

### 使用状況スナップショット

システムは定期的に使用状況スナップショットを DynamoDB に記録します。


* レート制限使用率 (分/時/日)
  
* ストレージリソース使用率
  
* タイムスタンプとテナント情報
  
* 90 日間保持 (TTL)

### アラート閾値

各テナントには 2 つのアラートレベルがあります。


* **Warning**: デフォルトは使用率 80%
  
* **Critical**: デフォルトは使用率 95%

### アラート配信

設定された閾値を超えた場合:


1. アラートメッセージがログに記録されます
   
2. Webhook URL が設定されている場合、HTTP POST 経由でアラートが送信されます
   
3. 同じアラートは 1 時間以内に再送信されません (デバウンス機能)

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

## Ingress Control (インフラストラクチャ層、#1508 / Epic #1485)

アプリ層の quota / rate-limit は **fail-open** (バケットストア障害時はリクエストを通す) なので、DB が過負荷の瞬間ほど防壁が抜ける。これを補うため、**DB に依存しないインフラ層のハード上限** を `infrastructure/template.yaml` に配線している。1 テナントの重負荷が同時実行 / 接続を通じて MongoDB を焼き切る爆発半径 (2026-07-21 のインシデント: CPU 97-98%、`/auth/login` まで 500) を構造的に限定するのが狙い。いずれも **opt-in** (未設定=現状挙動)。

### SAM パラメータ

| パラメータ                             | 既定        | 用途                                                                                                                                                   |
| --------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ApiReservedConcurrency`          | `-1`（未設定） | ApiHandler（データプレーン）Lambda の予約同時実行数。同時実行を N に縛ると DB へ飛ぶ同時クエリが構造的に頭打ちになる（= Apache MaxClients 相当）。                                                      |
| `ControlPlaneReservedConcurrency` | `-1`（未設定） | ControlPlaneHandler（auth/admin/me/oauth）Lambda の予約同時実行数（#1507）。データプレーンの同時実行飽和から独立して認証を生き残らせる枠。`ApiReservedConcurrency` と**合算**で Atlas 接続上限を較正する。     |
| `ApiThrottlingRateLimit`          | `0`（未設定）  | API Gateway ステージの定常スロットリング（req/s、全クライアント合算）。Lambda 起動前にバーストを平滑化。`MethodSettings` の `/*` = `*/*`（全メソッド全リソース）の共有バケットに適用し、制御プレーン（`/auth` 等）も同バケットを共有する。 |
| `ApiThrottlingBurstLimit`         | `0`（未設定）  | 同バースト容量。`ApiThrottlingRateLimit` とセットで指定（片方だけは CFN Rule で拒否）。ステージ全体（`/*` = `*/*`）の共有バケットに適用（#1539 で制御プレーン専用 per-resource 化は revert）。                 |
| `EnableOverloadAlarms`            | `'false'` | 過負荷 CloudWatch アラーム + SNS トピックを作成するか。既定 `'false'`（prod など未指定環境は無変更）、有効化する環境で `'true'`。                                                               |
| `ApiConcurrencyAlarmThreshold`    | `40`      | `ConcurrentExecutions` アラームの閾値。`ApiReservedConcurrency` の \~80% を目安に環境ごとに設定（#1507 で staging=Reserved 40 に再配分したため staging は 32）。                      |
| `AlarmNotificationEmail`          | `''`      | アラーム通知先メール。空なら SNS サブスクリプションなし（トピックへは発火するが通知先なし＝サイレント）。有効化環境では設定推奨。                                                                                  |

> **staging の現状**: `EnableOverloadAlarms=true` だが `AlarmNotificationEmail` 未設定のため
> **アラームはサイレント**（発火してもメール通知なし）。運用開始時に通知先メール（または ChatOps 連携の
> SNS サブスクリプション）を設定すること。設定するとデプロイ後に購読確認メールが届く。

### 較正式（Reserved と Atlas 接続上限）

Lambda は 1 リクエスト = 1 実行環境で、各環境が自前の Mongo 接続プールを持つ。接続総量の目安:

```text
接続総量 ≈ MONGODB_MAX_POOL_SIZE × (1 + DEPLOYMENTS_MAX_CONNECTIONS) × ウォーム Lambda 数
```

したがって予約同時実行数 N は次を満たすように選ぶ:

```text
N × MONGODB_MAX_POOL_SIZE × (1 + DEPLOYMENTS_MAX_CONNECTIONS) ≲ Atlas 接続上限（ノードあたり）
かつ  N ≤ アカウント同時実行上限 − 他関数の予約分
```

**staging 実測例**（M10 = 接続上限 \~1490/ノード、`MONGODB_MAX_POOL_SIZE=5`、単一デフォルトデプロイメント前提）:
`ApiReservedConcurrency=40` / `ControlPlaneReservedConcurrency=10` / `ApiThrottlingRateLimit=300` / `ApiThrottlingBurstLimit=600` / `EnableOverloadAlarms=true`。
`#1507` で auth/admin を別関数に分離したため、**予約枠は合算で見る**（データプレーン 40 + 制御プレーン 10 = 50）。
`#1508` の「DB を守る同時実行上限（50）」を維持するよう合算固定で配分している（auth は低ボリュームなので 10 で足りる）。
2 関数化で Mongo/secret の warmup 接続がやや増えるため、合算 × maxPool × (1 + DEPLOYMENTS\_MAX\_CONNECTIONS)
が Atlas 接続上限内か確認する。まず投入し `Throttles` / `5XXError` / 接続数を見て調整する。

> **入口 throttling は現状ステージ全体のみ（#1524 の per-resource 化は #1539 で revert）**: #1507 で
> compute（Lambda 関数）は分離済みだが、**API Gateway の throttling は依然としてステージ全体
> （`MethodSettings` の `/*` = `*/*`、`ApiThrottlingRateLimit`/`BurstLimit`）の共有バケット 1 つ**である。
> \#1524 は制御プレーン 5 resource に独立バケットを割り当てようとしたが、API GW は**ワイルドカード
> method（`'*'`/`'ANY'`）を特定 ResourcePath に指定できず**（特定パスは具体 verb のみ、ワイルドカードは
> `*/*` 全体のみ）、`ANY` プロキシ統合である制御プレーン path を per-resource で throttle できずデプロイ
> 不能だった。このため #1539 で stage-wide に戻した。
> **残る限界（要注意）**: 共有バケットのため、**データプレーン `/*` のフラッドが `ApiThrottling` 枠を
> 食い尽くすと `/auth` 等の制御プレーン要求も API GW 入口の 429 で共倒れしうる**。ただし #1507 の
> compute 分離により Lambda 同時実行と DB は別 `ReservedConcurrentExecutions` で守られるため
> **「認証全停止」にはならない**（入口層の隔離が失われているだけで、Lambda 枠は生存）。
> **監視の盲点**: API GW の 429 は Lambda 手前で返るため、`geonicdb-<env>-control-plane-handler-throttles`
> （Lambda `Throttles`）アラームは **API GW 429 を捕捉しない**。データプレーン `/*`・制御プレーン path とも
> 現状 429 は未アラーム。
> **follow-up**: (1) API GW 入口の per-resource 制御プレーン throttling の正しい再設計
> （具体 verb 列挙 / 制御プレーンを別 API・別ステージに分離 / Usage Plan 等）。(2) アクセスログ
> （`$context.status=429`）に対する 429 専用 Metric Filter/アラーム。(3) フラッド時の暫定緩和として
> WAF rate-based rule。
>
> **auth コールドスタートのトレードオフ**: 制御プレーンは低ボリュームなため、分離後は `/auth/login` が
> 専用コンテナのコールドスタート（INIT + Atlas TLS/SCRAM \~3s）に当たりやすくなる（従来はウォームな
> データプレーンコンテナに相乗りできた）。#1440 の top-level-await warmup で緩和されるが皆無ではない。
> デプロイ後に login p99 を監視すること。

### 過負荷アラーム（AWS ネイティブ指標）

`EnableOverloadAlarms='true'` のとき、SNS トピック `geonicdb-<env>-overload-alarms` と以下の CloudWatch アラームを作成する:

| アラーム                                             | 指標                                                             | 意味                                                      |
| ------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------- |
| `geonicdb-<env>-api-handler-throttles`           | Lambda `Throttles` > 0                                         | 予約 / アカウント同時実行上限に到達（入口飽和の一次シグナル）                        |
| `geonicdb-<env>-api-handler-concurrency`         | Lambda `ConcurrentExecutions` ≥ `ApiConcurrencyAlarmThreshold` | 予約上限への接近（先行指標）                                          |
| `geonicdb-<env>-control-plane-handler-throttles` | Lambda `Throttles` > 0（#1507）                                  | 制御プレーン関数が予約 / アカウント上限に到達（認証飽和）                          |
| `geonicdb-<env>-api-5xx`                         | API GW `5XXError` ≥ 25 / 5分                                    | 503（maxTimeMS 超過 / 過負荷）・500 の多発                         |
| `geonicdb-<env>-waf-blocked`                     | WAFV2 `BlockedRequests` ≥ 1000 / 5分                            | per-IP フラッド等、入口圧の早期シグナル                                 |
| `geonicdb-<env>-subscription-matcher-errors`     | Lambda `Errors` ≥ 5 / 5分 × 3期間（#1560）                          | 購読マッチングが継続失敗（15 分以上）                                    |
| `geonicdb-<env>-rule-processor-errors`           | Lambda `Errors` ≥ 5 / 5分 × 3期間（#1560）                          | ReactiveCore Rules が継続失敗（15 分以上）                        |
| `geonicdb-<env>-notification-sender-errors`      | Lambda `Errors` ≥ 5 / 5分 × 3期間（#1560）                          | 購読通知の配信が継続失敗（15 分以上）                                    |
| `geonicdb-<env>-ws-broadcast-errors`             | Lambda `Errors` ≥ 5 / 5分 × 3期間（#1560）                          | WebSocket 配信が継続失敗（15 分以上）                               |
| `geonicdb-<env>-expiry-sweeper-errors`           | Lambda `Errors` ≥ 5 / 5分 × 3期間（#1561）                          | TTL 失効の `EntityDeleted` 発行（expiry sweeper）が継続失敗（15 分以上） |

> **#1560 の教訓**: バックグラウンドワーカーは「静かに死ぬ」。リクエスト経路と違い失敗を訴えるユーザーがいないため、メトリクスに監視が無い限り永久に発覚しない。`change-stream-processor` は **2026-03-08 から 141 日間 成功率 0%**（約 60 万回の失敗）だったが、#1508 のアラームが api-handler / control-plane-handler しか見ていなかったため誰にも気づかれなかった。**新しいワーカーを追加したら必ずこの表と `template.yaml` に `Errors` アラームを追加すること**（`tests/unit/infrastructure/sam-template.test.ts` がテンプレートからワーカーを自動抽出して漏れを検出する）。
>
> 閾値は絶対数ではなく「継続性」で判定する（5 件 / 5 分 × 3 期間連続）。短時間で収まる一過性のリトライ可能エラー（EventBridge / SQS の再配送で回復するもの）は通常この条件を満たさないため発報しにくい。**ただし「絶対に誤報しない」わけではない** — 再試行可能なエラーであっても 15 分以上継続し各 5 分間で 5 件以上発生すれば、同じアラームが発火する（CodeRabbit 指摘）。発報時は「恒久停止」と決めつけず、まずエラー内容とリトライ状況を確認すること。
>
> **このアラームで検知できないもの（既知の限界。レビューで指摘された点を正直に記す）**:
>
> 1. **通知先が未設定なら発火しても誰にも届かない** — `EnableOverloadAlarms=true` でも `AlarmNotificationEmail` が空なら SNS トピックに購読者がゼロで、CloudWatch を人が開かない限り気づけない。**staging は現在この状態**。#1560 の 141 日はまさに「メトリクスは出ていたが誰も見ていなかった」事故なので、**通知先の設定はアラーム追加と同じロールアウトで行う必要がある**（未設定のままではこの観測性修正は半分しか配線されていない）。
>    なお #1560 のインシデント自体は閾値を満たしていた（約 3 失敗 / 分 = 15 件 / 5 分 ≥ 5 が 3 期間連続 → 約 15 分で ALARM）。届かないだけ。
> 2. **低トラフィックのワーカーは 100% 失敗でも閾値に届かない** — 1 分あたり 1 件未満の細い流量なら 5 件 / 5 分 に達しない。「恒久停止を投入初日に検知できる」のは継続的な流量があるワーカーに限る。
> 3. **起動回数ゼロの死は原理的に見えない** — イベントソースが無効化・誤設定されてそもそも呼ばれないと `Errors` のデータポイントが 1 件も出ず、`TreatMissingData: notBreaching`（`Errors` に対しては正しい設定）のため無反応になる。別の形の「静かな死」は依然として残る。

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
  
* **通知ファンアウト上限は本 sweeper のスコープ外**（#1544 未実装。既存 `purgeEntities` の cap 10,000 より小さい範囲に収まるため新しいリスククラスではない）。
  
* **TTL 猶予期間の反映は index failure メトリクスの監視が前提**: 既存コレクションへの `expireAfterSeconds` 変更は `collMod` で行うが、失敗は**非 critical** として記録されるため `/health` は緑のままになる。`/health` の `indexes.totalFailureCount` を監視していないと「猶予期間を設定したつもりで効いていない」状態に気付けない（この場合 sweeper が claim する前に Mongo が物理削除し、`EntityDeleted` が無音で欠落する）。

### Atlas 側アラーム（CloudWatch では取得不可 — 別途必須）

**MongoDB Atlas のメトリクス（System CPU / WiredTiger ticket キュー / 接続数）は CloudWatch に来ない**（Atlas の CloudWatch 連携は別途有償統合が必要）。DB 内部の過負荷は Atlas 側のアラート機能で設定する。MongoDB 7.0 は WiredTiger tickets（read/write 各最大 128）で内部 admission control を持ち、公式は **queued read/write tickets を過負荷の主指標**として推奨している。推奨アラート:


* **Query Targeting: Scanned Objects / Returned** が高い（非効率クエリ = collection scan の兆候）
  
* **System: CPU (User) %** が高止まり
  
* **Connections %** がクラスタ上限に接近
  
* （可能なら）queued read/write tickets の増加

これらは Atlas Project の Alerts 設定（UI / Admin API）で構成し、通知先（Slack / email / PagerDuty 等）に配線する。本 PR のスコープ外。

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

### カスタムクォータの設定

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
      "burstAllowance": 200
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

### 容量受入チェック (#1509 / Epic #1485)

手動でのクォータの誤設定によるクラスタの飽和を防ぐため(2026-07-21 インシデントの直接的なトリガーは、単一テナントの `perMinute` が検証なしで引き上げられたことでした)、`PUT /admin/tenants/{tenantId}/quotas` は変更を永続化する前に **単一テナント容量受入チェック** を実行します。

モデル (テナントごとのガードレール — すべてのテナントにわたる集約は評価 **されません**):

```text
demand  = effective.perMinute × REPRESENTATIVE_WEIGHT
allowed = CLUSTER_CAPACITY_WEIGHTED_PER_MIN × MAX_SINGLE_TENANT_SHARE
demand > allowed  →  400 BadRequest (rejected)
```

チェックは **有効な** クォータ(テナントの既存設定にリクエストボディをマージしたもの)に対して評価されるため、部分的な更新は結果の値を使用して検証されます。

**オーバーライド (要承認):** `super_admin` は `acknowledgeOvercommit: true` を設定することで、意図的にガードレールを超えることができます。このオーバーライドは高重要度の監査ログに記録されます。`tenant_admin` はオーバーライドできません(また、実際にはクォータを更新することもできません — 変更には `super_admin` が必要です)。

```json
{
  "quotaPlan": "CUSTOM",
  "customQuotas": { "rateLimit": { "perMinute": 1000000 } },
  "acknowledgeOvercommit": true
}
```

> **調整に関する注意:** `REPRESENTATIVE_WEIGHT` と `CLUSTER_CAPACITY_WEIGHTED_PER_MIN` は **保守的なプレースホルダーガードレール** であり、測定されたクラスタ容量ではありません。モデルが依拠する `ENDPOINT_WEIGHTS` はヒューリスティックであり、#1509 の後半として実証的な調整(Atlas プロファイラー / explain / p95 CPU 時間)を待っています。実際のクラスタに合わせて、以下の環境変数で容量を調整してください。

### 使用履歴の取得

```http
GET /admin/tenants/{tenantId}/usage?startDate=2026-02-01&endDate=2026-02-10&limit=100
```

**レスポンス:**

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


* `RATE_LIMIT_ENABLED`: レート制限の有効化/無効化 (デフォルト: `true` — 未設定/その他の値は有効として扱われます。明示的なオプトアウトのみが緊急停止スイッチとして機能します — 空白のトリミングと小文字化の後にマッチングされるため、`false`/`FALSE`/`" false "` はすべて無効化します、#1516)
  
* `RATE_LIMIT_TABLE_NAME`: DynamoDB レート制限テーブル名
  
* `USAGE_STATS_TABLE_NAME`: DynamoDB 使用統計テーブル名
  
* `QUOTA_ALERT_WEBHOOK_URL`: アラート配信用の Webhook URL (オプション)

**容量受付チェック (#1509):**


* `QUOTA_ADMISSION_ENABLED`: クォータ容量受付チェックの有効化/無効化 (デフォルト: `true`、無効化する場合は `false` に設定)
  
* `CLUSTER_CAPACITY_WEIGHTED_PER_MIN`: クラスターの予算容量 (重み付きリクエスト数/分) (デフォルト: `300000`)。実際のクラスター容量に合わせて調整してください。
  
* `QUOTA_MAX_SINGLE_TENANT_SHARE`: 単一テナントのクォータが占有できるクラスター容量の最大割合 (0..1) (デフォルト: `0.5`)
  
* `QUOTA_ADMISSION_REPRESENTATIVE_WEIGHT`: テナントの需要を推定するために使用される保守的なエンドポイント重み (デフォルト: `5`、最も重い `ENDPOINT_WEIGHTS` 値を追跡する必要があります)

## アクセス制御

### 権限レベル


* **super\_admin**: すべてのテナントのクォータを表示および変更できます
  
* **tenant\_admin**: 自分のテナントのクォータを表示できます (読み取り専用)。変更には `super_admin` が必要です
  
* **user**: クォータ管理 API へのアクセス権がありません

### 認証

すべてのクォータ管理 API には認証が必要です:

```http
Authorization: Bearer <JWT_TOKEN>
```

## ベストプラクティス

### クォータプランの選択


1. **開発/テスト**: FREE プランから始めましょう
   
2. **小規模本番環境**: STANDARD プラン
   
3. **中規模本番環境**: PREMIUM プラン
   
4. **大規模本番環境**: ENTERPRISE プラン
   
5. **特別な要件**: CUSTOM プランで個別に設定

### アラート設定


* **Warning**: 容量拡張を検討するしきい値 (デフォルト 80%)
  
* **Critical**: 即座の対応が必要なしきい値 (デフォルト 95%)
  
* リアルタイム通知を受信するために Webhook URL を設定してください

### 監視


* レスポンスヘッダーを定期的にチェック
  
* 使用履歴 API でトレンドを分析
  
* アラートログを監視

## トラブルシューティング

### 429 Too Many Requests

**原因**: レート制限を超過しました

**解決方法**:

1. `Retry-After` ヘッダーで指定された秒数だけ待機する
   
2. リクエスト頻度を減らす
   
3. バッチ操作を活用してリクエスト数を削減する
   
4. プランのアップグレードを検討する

### 507 Insufficient Storage

**原因**: ストレージクォータを超過しました

**解決方法**:

1. 不要なエンティティ / サブスクリプション / 登録を削除する
   
2. 時系列データの保持期間を短縮する
   
3. プランのアップグレードを検討する

### クォータヘッダーが表示されない

**原因**: レート制限が無効になっている可能性があります

**解決方法**:

1. `RATE_LIMIT_ENABLED` 環境変数を確認する
   
2. SAM テンプレートパラメータを確認する
   
3. DynamoDB テーブルが正しくデプロイされていることを確認する

## 入力検証の制限

GeonicDB は、悪用を防止し、システムの安定性を確保するために、入力の長さと数の制限を適用します。

### 認証とログイン保護

#### アカウント単位のログイン保護

既存のアカウント単位のブルートフォース保護([AUTH.md](../reference/auth.md) を参照):


* アカウントごとの最大ログイン失敗回数:**15 分間**に **5 回**
  
* アカウントロック期間:閾値到達後 **15 分間**
  
* 段階的遅延:**2 秒**から始まる指数バックオフ(2^(n-2))

#### IP 単位のログイン保護(#900)

単一の IP から複数のアカウントに対するパスワードスプレー攻撃を防止します:

| Parameter                      | Value                       |
| ------------------------------ | --------------------------- |
| Maximum failed attempts per IP | **20** within **5 minutes** |
| IP lock duration               | **15 minutes**              |
| Record TTL                     | **1 hour** (auto-deleted)   |


* **HTTP ステータス**: `429 Too Many Requests` と `Retry-After: 900`
  
* ログイン成功時に IP カウンターはリセットされません(タイミングベースの列挙を防止)
  
* エラーメッセージ:`"Too many failed login attempts from this IP. Please try again later."`

### テナントリソース制限

#### テナントあたりのユーザー数 (#901)

| Parameter                | Default |
| ------------------------ | ------- |
| Maximum users per tenant | **100** |


* ユーザー作成時のみチェック
  
* `tenant.settings.maxUsers` によるテナントごとのオーバーライド
  
* **HTTP ステータス**: `400 Bad Request`
  
* エラーメッセージ: `"User limit reached for this tenant (current: N, limit: M)"`

#### テナントあたりのポリシー数 (#912)

| Parameter                   | Default |
| --------------------------- | ------- |
| Maximum policies per tenant | **50**  |


* `tenant.settings.maxPolicies` によるテナントごとのオーバーライド
  
* **HTTP ステータス**: `400 Bad Request`
  
* エラーメッセージ: `"Policy limit reached for this tenant (current: N, limit: M)"`

#### 管理ユーザー操作のレート制限 (#905)

Admin API での作成-削除サイクル攻撃を防止します:

| Parameter                     | Value                                |
| ----------------------------- | ------------------------------------ |
| Window                        | **10 minutes**                       |
| Maximum operations per window | **1,000** (create + delete combined) |


* `createUser` と `deleteUser` に対してテナントごとに適用
  
* `super_admin` は除外
  
* **HTTP ステータス**: `429 Too Many Requests`
  
* エラーメッセージ: `"Too many user management operations. Limit: 1000 per 10 minutes."`

### XACML ポリシー入力制限 (#912)

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


* 最大長: **254 文字** (RFC 5321 準拠)
  
* 適用対象: ユーザー作成、ユーザー更新、ログイン
  
* **HTTP ステータス**: `400 Bad Request`

### サブスクリプションエンドポイント URI/URL (#913)


* 最大長: **2,048 文字**
  
* 適用対象: NGSI-LD `notification.endpoint.uri`、NGSIv2 `notification.http.url` / `notification.httpCustom.url` / `notification.mqtt.url`
  
* **HTTP ステータス**: `400 Bad Request`

### 入力検証の制限 (全般)

GeonicDB はすべての API エンドポイントで包括的な入力検証を実施します。いずれかの制限を超えると `400 Bad Request` が返されます。

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

| Array Field                             | Max Elements           |
| --------------------------------------- | ---------------------- |
| `attrs`, `pick`, `omit`, `expandValues` | 50                     |
| `watchedAttributes`                     | 100                    |
| `notification.attrs` / `exceptAttrs`    | 100                    |
| `subject.entities` / `entities`         | 100                    |
| Batch operation `entities`              | 100 (MAX\_BATCH\_SIZE) |
| `propertyNames` / `relationshipNames`   | 100                    |
| `receiverInfo` / `notifierInfo`         | 50                     |
| `contextSourceInfo`                     | 50                     |
| `operationGroup`                        | 20                     |
| `scope` (array)                         | 20                     |
| `@context` (array)                      | 10                     |

#### 数値の上限

| Field        | Max Value                     |
| ------------ | ----------------------------- |
| `throttling` | 86,400 (24 hours, in seconds) |
| `timeout`    | 30,000 (30 seconds, in ms)    |
| `lastN`      | 1,000                         |

#### ヘッダーの検証

| Header                           | Max Length |
| -------------------------------- | ---------- |
| Bearer / DPoP token              | 8,192      |
| Link (@context URL)              | 2,048      |
| Fiware-ServicePath (per element) | 256        |
| Tenant name (Fiware-Service)     | 64         |

#### パスパラメータの検証

URL パス内のリソース ID も長さの検証が行われます。

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
  
* **HTTP ステータス**:ネストが制限を超えた場合 `400 Bad Request`

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

#### Admin API の検証

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

#### Auth & OAuth API の検証

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

Admin API 経由でカスタムクォータを設定する場合、以下の最大値が適用されます:

| Field                           | Max Value           |
| ------------------------------- | ------------------- |
| `rateLimit.perMinute`           | 1,000,000           |
| `rateLimit.perHour`             | 10,000,000          |
| `rateLimit.perDay`              | 100,000,000         |
| `rateLimit.burstAllowance`      | 100,000             |
| `storage.maxEntities`           | 100,000,000         |
| `storage.maxSubscriptions`      | 1,000,000           |
| `storage.maxRegistrations`      | 1,000,000           |
| `storage.maxTemporalDataPoints` | 1,000,000,000       |
| `limits.maxRequestBodyBytes`    | 100MB (104,857,600) |
| `limits.maxResponseBodyBytes`   | 1GB (1,073,741,824) |
| `limits.maxBatchSize`           | 10,000              |

#### Rules API の検証

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

#### Custom Data Models API の検証

| Field                                | Max Length / Value |
| ------------------------------------ | ------------------ |
| Model `type`                         | 256                |
| Model `domain`                       | 256                |
| Model `description`                  | 2,000              |
| Property `valueType`                 | 256                |
| Property `description`               | 2,000              |
| Validation `minLength` / `maxLength` | 10,000             |
| Validation `enum` array              | 100 elements       |

#### Catalog / CADDE / Vocabulary API の検証

| Field                                  | Max Length          |
| -------------------------------------- | ------------------- |
| Catalog `q` (keyword)                  | 2,000               |
| Catalog `id` (package/dataset)         | 256                 |
| CADDE query params (`type`, `id`, `q`) | Same as NGSI limits |
| Vocabulary `tenantId`                  | 64                  |
| Vocabulary `term`                      | 256                 |

#### MCP Admin Tools の検証

MCP ツールは、ツール入力レイヤーで HTTP Admin API と同じ制限を適用します:

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

### ストレージクォータの修正: `/v2/op/update` (#902)

バッチ操作 (`/v2/op/update`) のストレージクォータチェックが、エンティティ作成操作を正しく識別するようになりました:


* **`append` / `appendStrict`**: エンティティ作成としてカウント — ストレージクォータを消費
  
* **`update` / `delete` / `replace`**: エンティティ作成としてカウントされない — ストレージクォータに影響なし

以前は、すべての `/v2/op/update` リクエストが `actionType` に関係なく、エンティティ作成クォータに対して誤ってカウントされていました。

## 関連ドキュメント


* 開発・デプロイメントガイド - インフラストラクチャのセットアップ
  
* [認証と認可](../reference/auth.md) - テナント/ユーザー管理、アクセス制御
