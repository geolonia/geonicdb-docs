---
title: "Quotas & Plans"
description: "GeonicDB quota system and plans"
outline: deep
---
# GeonicDB Quota System

GeonicDB provides a comprehensive quota system for managing per-tenant rate limits and storage quotas.

## Overview

The quota system consists of three main components:

1. **Rate Limiting System** - API request limiting using a fixed-window counter backed by DynamoDB or MongoDB
2. **Storage Quota System** - Count limits on entities/subscriptions/registrations/temporal data based on MongoDB
3. **Monitoring & Management System** - Usage tracking, alert delivery, and management API

## Quota Plans

GeonicDB offers four standard plans and a custom plan:

### FREE Plan (for evaluation and development)

**Rate Limits:**
- Per minute: 60 weight units (equivalent to 1 req/sec only for weight-1 GETs — see [Endpoint Weights](#endpoint-weights))
- Per hour: 1,000 weight units
- Per day: 10,000 weight units
- Burst allowance: 10 weight units

**Storage Quotas:**
- Entities: 1,000
- Subscriptions: 10
- Registrations: 5
- Temporal data points: 10,000

**Limits:**
- Maximum request body size: 512KB
- Maximum response body size: 5MB
- Maximum batch operation size: 50

### STANDARD Plan (small-scale production)

**Rate Limits:**
- Per minute: 600 weight units (equivalent to 10 req/sec only for weight-1 GETs)
- Per hour: 10,000 weight units
- Per day: 100,000 weight units
- Burst allowance: 100 weight units

**Storage Quotas:**
- Entities: 10,000
- Subscriptions: 100
- Registrations: 50
- Temporal data points: 100,000

**Limits:**
- Maximum request body size: 1MB
- Maximum response body size: 10MB
- Maximum batch operation size: 100

### PREMIUM Plan (medium-scale production)

**Rate Limits:**
- Per minute: 3,000 weight units (equivalent to 50 req/sec only for weight-1 GETs)
- Per hour: 50,000 weight units
- Per day: 500,000 weight units
- Burst allowance: 500 weight units

**Storage Quotas:**
- Entities: 100,000
- Subscriptions: 500
- Registrations: 200
- Temporal data points: 1,000,000

**Limits:**
- Maximum request body size: 5MB
- Maximum response body size: 50MB
- Maximum batch operation size: 500

### ENTERPRISE Plan (large-scale production)

**Rate Limits:**
- Per minute: 12,000 weight units (equivalent to 200 req/sec only for weight-1 GETs)
- Per hour: 200,000 weight units
- Per day: 2,000,000 weight units
- Burst allowance: 2,000 weight units

**Storage Quotas:**
- Entities: 1,000,000
- Subscriptions: 2,000
- Registrations: 1,000
- Temporal data points: 10,000,000

**Limits:**
- Maximum request body size: 10MB
- Maximum response body size: 100MB
- Maximum batch operation size: 1,000

### CUSTOM Plan

A custom plan that allows any values to be configured. Set individually using the management API.

## Rate Limiting

### Fixed-Window Counter

GeonicDB uses a **fixed-window counter** over three windows (minute/hour/day). Window
boundaries are absolute: the current time is truncated to the minute/hour/day boundary
(`getWindowTimestamp()` in `src/core/quotas/rate-limit/rate-limit.service.ts`), and that
truncated timestamp identifies the window.

1. Each request consumes an allowance equal to the endpoint weight
2. A request is permitted only when all three windows have sufficient allowance remaining
3. When a window rolls over, its remaining allowance is **reset to the full limit** —
   it is not gradually refilled

> ⚠️ This is **not** a token bucket, and the windows are **not** sliding. There is no
> gradual refill: crossing a window boundary restores the entire allowance at once
> (`trySlowPathConsumeMongo()` in `src/infrastructure/mongodb-kv/rate-limit.ts` assigns
> `remainingMinute = limits.minute - weight` on rotation). Assuming a refill model leads
> to wrong conclusions — see #1806, where a flaky test was misdiagnosed on that basis.

### Endpoint Weights

Different endpoints are assigned different weights based on their processing cost:

| Operation | Weight | Example |
|------|------|-----|
| GET | 1 | `GET /v2/entities` |
| POST (single) | 3 | `POST /v2/entities` |
| PATCH/PUT | 2 | `PATCH /v2/entities/{id}` |
| DELETE | 2 | `DELETE /v2/entities/{id}` |
| Batch operations | 5 × count | `POST /v2/op/update` with 10 entities = 50 |
| Temporal read | 2 | `GET /ngsi-ld/v1/temporal/entities` |
| Temporal write (POST collection) | 3 | `POST /ngsi-ld/v1/temporal/entities` |

The incoming request path is matched against these endpoint templates by
`resolveEndpointWeight()` (`src/core/quotas/rate-limit/rate-limit.constants.ts`),
which treats each `{placeholder}` as a single path segment. This means a concrete
production path such as `/v2/entities/urn:ngsi-ld:Store:001` correctly resolves to
the `GET /v2/entities/{id}` weight instead of falling back to `DEFAULT_WEIGHT` (#1521).

### Burst Allowance

Each plan has a burst allowance to handle sudden traffic spikes in short periods. This allows temporarily exceeding the limit.

### Response Headers

When rate limiting is enabled, responses from NGSIv2, NGSI-LD, and Catalog API endpoints include headers indicating the current rate limit status:

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

### Behavior When Rate Limit Is Exceeded

When the rate limit is exceeded:

- **HTTP status code**: `429 Too Many Requests`
- **Retry-After header**: Number of seconds until the next request is permitted
- **Error message**: `{"error": "TooManyRequests", "description": "Rate limit exceeded"}`

### Public (Unauthenticated) Endpoint Rate Limit (#1075)

Public endpoints reachable without authentication are protected by a separate
IP-based fixed-window counter independent of per-tenant `QUOTAS.PLANS`. This blocks
OAuth `client_id+secret` brute-force and DoS via heavy JSON generation
(`/openapi.json` etc.).

| Category | Endpoints | Per minute | Per hour | Per day | Burst |
|----------|-----------|-----------:|---------:|--------:|------:|
| `metadata` | `/openapi.json`, `/api.json`, `/tools.json`, `/llms.txt`, `/.well-known/ai-plugin.json`, `/.well-known/agent-card.json`, `/.well-known/ngsi-ld` | 30 | 300 | 1,000 | 10 |
| `oauth` (per IP) | `/oauth/token` | 20 | 100 | 500 | 5 |
| `oauth` (per `client_id`) | `/oauth/token` | 10 | 60 | 200 | 2 |
| `auth` | `/auth/refresh`, `/auth/nonce` | 30 | 200 | 1,000 | 5 |

Notes:

- `/auth/login` is **not** subject to this limit; it is protected by `LoginProtectionService` (email + IP based progressive lockout).
- `/health`, `/health/live`, `/health/ready`, `/version` are **not** subject to this limit (intended for health-check polling).
- When the bucket store (DynamoDB / MongoDB) is unavailable, the request is allowed through; we do not fail-close on infrastructure error to avoid taking the public surface offline.
- Defaults are centralised in `PUBLIC_RATE_LIMIT` in `src/config/defaults.ts`.

## Per-Tenant Concurrency Limit (#1510 / Epic #1485)

req/s の rate-limit だけでは「per-query コスト × 同時実行数」を bound できない。1 テナントが
多数の重いリクエストを**同時に**投げると、Lambda 予約枠 (#1508) や DB 接続を占有し、他テナントの
公平性が損なわれる。これを補うため、**テナント毎の同時 in-flight リクエスト数**に上限を設ける。

- **常時有効 (feature flag なし)**。有限な MongoDB を 1 テナントの同時大量リクエストから守るため、
  リミットは常に効いている必要がある。全データプレーンリクエストにスロット取得/解放の 1 往復
  (DynamoDB / standalone は Mongo) が加わるが、これは DB 保護の代償。
- 上限はプラン別 `rateLimit.maxConcurrency` (FREE=5 / STANDARD=20 / PREMIUM=50 / ENTERPRISE=100、
  `src/config/defaults.ts`)。`customQuotas.rateLimit.maxConcurrency` で per-tenant 調整 (暴走テナントを
  絞る / 大口テナントを緩める)。正の値は**実行時に最大 1000 (`QUOTAS.CONCURRENCY.MAX_CONCURRENCY`) へ
  クランプ**される (探索コストと Lambda 同時実行の現実的上限)。**`maxConcurrency` が 0 のプラン/テナントは
  無制限** (acquire が即 no-op、DDB アクセスなし) — 特定テナントだけ無効化したい場合に使える。
- **キーは per-tenant** (`Fiware-Service` / テナント名のみ。servicePath は含めない — servicePath 回しでの
  回避を防ぐ)。`scopeKeyToDeployment` でデプロイメント間も分離。
- **方式: 固定スロット lease セマフォ (方式D)**。テナントごとに `0..max-1` の固定スロットを持ち、
  リクエストは空き (または lease 失効) スロットを 1 つ条件付き書き込みで排他取得する。
  - **overshoot なし**: 各スロットは条件付き書き込みで排他されるため、同時保持は最大 `max`。
  - **恒久ロックアウトなし**: Lambda timeout/kill で解放が漏れても、lease (`CONCURRENCY.LEASE_MS`=35s)
    失効で他リクエストが再取得できる (自己修復)。DynamoDB TTL はストレージ掃除用。
- 上限超過は **429 TooManyRequests** (`recordQuotaViolation('concurrency')`)。
- カウンタは rate-limit と同じ `RateLimitBucketsTable` (`pk=<tenant>#concurrency` / `sk=slot`) を流用
  (新テーブル不要、IAM 既存)。standalone は Mongo `concurrencySlots` コレクション (unique index + TTL)。
- **fail-open**: スロットストア障害時はリクエストを通す (`metric: 'ConcurrencyInfrastructureFailure'` /
  `'ConcurrencyCheckTransientFailure'`。rate-limit とは別系統メトリクス)。
- 定数は `QUOTAS.CONCURRENCY` (`src/config/defaults.ts`)。
- **補足**: `/auth`・`/me`・`/admin`・`/oauth` の制御プレーン経路は #1507 で別 Lambda 関数
  (ControlPlaneHandler) に分離済みで、本 per-tenant concurrency 上限の対象外 (認証後のデータプレーンのみ)。
  制御プレーンの compute 隔離は #1507
  (関数分離) の守備範囲。

## DB 過負荷 circuit-breaker (#1492 P3 / Epic #1485)

**機能フラグを持たない（常時有効）。設定する環境変数はない。**

### 位置づけ

7-21 のインシデント (1 テナントの非効率クエリが MongoDB の CPU を焼き切り、巻き添えで
`/auth/login` を含む全 API が 500) に対する**最後の安全弁**であって第一防衛線ではない。
根治は #1486-1490 の index 硬化 (docs examined を bound)、入口制御は #1508 (Lambda 予約同時実行 +
API GW throttling) と #1510 (テナント毎同時実行上限)。本 breaker はそれらをすり抜けた過負荷が
起きたときに、**制御プレーンを生かしたままデータプレーンだけを落とす**。

### なぜ機能フラグを置かないか

当初は「誤発火が怖い」という理由で opt-in の環境変数を用意していたが、**判定ロジック上その心配が成立しない**ため撤去した。

3 シグナルのうち「リクエストが失敗していなくても立ちうる」のは **ticket 枯渇だけ**で、残る 2 つ（`maxTimeMS` 超過 / 接続エラー）はどちらも**実際に失敗した件数**である。**2 つ以上**を要求している以上、成立する組み合わせには必ずどちらかが含まれる — つまり **breaker は「窓内に実際の失敗が閾値以上ある」ときにしか開かない**。それは誤発火ではなく縮退すべき状態そのものなので、止める必要が生じにくい。

加えて、**環境変数を増やすこと自体にコストがある**（運用担当の選択肢と学習コストが増え、設定ミスの余地が広がる）。提供プランは数通りに絞る方針であり、DB 自衛の縮退はプランや環境で差をつける性質のものでもない。

常時有効にしたことで判定は**データプレーンの全リクエスト**で走るが、**平時のコストは 0** である。ticket サンプル (`serverStatus`) を取りに行くのは「失敗シグナルがちょうど 1 つ」のときだけで、2 シグナル成立が条件である以上それ以外では ticket が判定を変え得ないため（0 なら 1 にしか届かず、2 なら ticket 抜きで既に成立）。失敗が 1 件も無い通常運転では DB に一切問い合わせない。

閾値 (`QUOTAS.DB_OVERLOAD_BREAKER`) を調整したい場合はコード変更 + デプロイで行う。トレードオフとして「コンソールで env を切って即停止」はできないが、上記のとおり停止の必要性が低いため許容する。「実際の失敗が無ければ開かない」ことは unit test で直接固定している。

### 検知 — 単一指標にしない

MongoDB 公式は過負荷指標として WiredTiger の concurrency ticket キューを推奨する (CPU% は
遅行指標)。ただし MongoDB 7.0+ は動的チケットで内部 back-pressure を持つため、ticket 飽和だけでは
「重いが正常に捌けている」状態と区別できない。**3 シグナルのうち 2 つ以上**が成立して初めて開く:

| # | シグナル | 取得方法 | コスト |
|---|---|---|---|
| 1 | WiredTiger ticket 枯渇 (空き比率 ≤ `TICKET_EXHAUSTION_RATIO`) | `serverStatus` を `SAMPLE_INTERVAL_MS` 間隔で取得 | DB 往復あり (間隔で bound) |
| 2 | `maxTimeMS` 超過 (503) が窓内で `TIMEOUT_THRESHOLD` 件以上 | プロセス内カウンタ | ゼロ |
| 3 | serverSelection / 接続エラーが窓内で `CONNECTION_ERROR_THRESHOLD` 件以上 | プロセス内カウンタ | ゼロ |

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

## Storage Quotas

### Resource Types

Quotas are configured for four types of resources:

1. **Entities** - Total number of NGSIv2/NGSI-LD entities
2. **Subscriptions** - Total number of active subscriptions
3. **Registrations** - Total number of context source registrations
4. **Temporal data points** - Total number of time-series data points

### Pre-Check

Storage quotas are checked **before** create operations:

- For batch operations, execution proceeds only when all entities fit within the quota
- If even one would exceed the quota, the entire operation is rejected (all-or-nothing)

### Response Headers

NGSIv2, NGSI-LD, and Catalog API endpoints include headers indicating the current storage usage:

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

**Target endpoints**: These headers are returned by all endpoints of the NGSIv2, NGSI-LD, and Catalog APIs. Using the [management API](#management-api) (`/admin/tenants/{tenantId}/quotas`) allows you to retrieve more detailed quota information.

### Behavior When Storage Quota Is Exceeded

When the storage quota is exceeded:

- **HTTP status code**: `507 Insufficient Storage`
- **Error message**: Includes the resource type and current usage
- **Example**: `{"error": "InsufficientStorage", "description": "Entity quota exceeded (10000/10000)", "details": {"resourceType": "entities", "current": 10000, "limit": 10000}}`

## Monitoring and Alerts

### Rate Limit Infrastructure Failure Metrics (#1419)

Rate limit checks are **fail-open**: if the bucket store (DynamoDB / MongoDB) errors, the
request is allowed rather than blocked. To keep this failure mode observable, every
swallowed error is logged with a structured `metric` marker suitable for CloudWatch
Metric Filters:

- `metric: "RateLimitInfrastructureFailure"` — **permanent** errors that will not
  self-recover (`ValidationException`, `SerializationException`,
  `ResourceNotFoundException`, `AccessDeniedException`; list in
  `QUOTAS.RATE_LIMIT_PERMANENT_ERROR_NAMES`, `src/config/defaults.ts`). These indicate a
  code or configuration bug — rate limiting is silently disabled fleet-wide until fixed.
  **This marker should be wired to a high-severity CloudWatch alarm.**
- `metric: "RateLimitCheckTransientFailure"` — throttling, timeouts, and other
  transient store errors.

Background: three consecutive DynamoDB expression bugs (#1385) were hidden for days by an
undifferentiated fail-open catch. The classification lives in
`src/core/quotas/rate-limit/rate-limit-failure.ts` and is shared by the tenant and public
rate-limit paths.

Exception (#1685): on the Mongo (standalone) path, rate-limit bucket atomicity relies on
`insertOne` + duplicate-key retry against the unique index `idx_rate_limit_bucket_unique` —
without it, duplicate buckets silently bypass rate limiting. The index is therefore listed
in `MONGODB.CRITICAL_INDEXES`, and a failure to create it **fails closed** (the connection
is refused at index initialization) rather than falling through to the fail-open runtime path.

### Usage Snapshots

The system periodically records usage snapshots to DynamoDB:

- Rate limit utilization (minute/hour/day)
- Storage resource utilization
- Timestamp and tenant information
- Retained for 90 days (TTL)

### Alert Thresholds

Each tenant has two alert levels:

- **Warning**: Default at 80% usage
- **Critical**: Default at 95% usage

### Alert Delivery

When a configured threshold is exceeded:

1. An alert message is recorded in the log
2. If a Webhook URL is configured, an alert is sent via HTTP POST
3. The same alert is not resent within 1 hour (debounce feature)

### Webhook Payload

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

アプリ層の quota / rate-limit は **fail-open**（バケットストア障害時はリクエストを通す）なので、
DB が過負荷の瞬間ほど防壁が抜ける。これを補うため、**DB に依存しないインフラ層のハード上限**を
`infrastructure/template.yaml` に配線している。1 テナントの重負荷が同時実行 / 接続を通じて
MongoDB を焼き切る爆発半径（2026-07-21 のインシデント: CPU 97-98%、`/auth/login` まで 500）を
構造的に限定するのが狙い。いずれも **opt-in**（未設定＝現状挙動）。

### SAM パラメータ

| パラメータ | 既定 | 用途 |
|---|---|---|
| `ApiReservedConcurrency` | `-1`（未設定） | ApiHandler（データプレーン）Lambda の予約同時実行数。同時実行を N に縛ると DB へ飛ぶ同時クエリが構造的に頭打ちになる（= Apache MaxClients 相当）。 |
| `ControlPlaneReservedConcurrency` | `-1`（未設定） | ControlPlaneHandler（auth/admin/me/oauth）Lambda の予約同時実行数（#1507）。データプレーンの同時実行飽和から独立して認証を生き残らせる枠。`ApiReservedConcurrency` と**合算**で Atlas 接続上限を較正する。 |
| `ApiThrottlingRateLimit` | `0`（未設定） | API Gateway ステージの定常スロットリング（req/s、全クライアント合算）。Lambda 起動前にバーストを平滑化。`MethodSettings` の `/*` = `*/*`（全メソッド全リソース）の共有バケットに適用し、制御プレーン（`/auth` 等）も同バケットを共有する。 |
| `ApiThrottlingBurstLimit` | `0`（未設定） | 同バースト容量。`ApiThrottlingRateLimit` とセットで指定（片方だけは CFN Rule で拒否）。ステージ全体（`/*` = `*/*`）の共有バケットに適用（#1539 で制御プレーン専用 per-resource 化は revert）。 |
| `EnableOverloadAlarms` | `'false'` | 過負荷 CloudWatch アラーム + SNS トピックを作成するか。既定 `'false'`（prod など未指定環境は無変更）、有効化する環境で `'true'`。 |
| `ApiConcurrencyAlarmThreshold` | `40` | `ConcurrentExecutions` アラームの閾値。`ApiReservedConcurrency` の ~80% を目安に環境ごとに設定（#1507 で staging=Reserved 40 に再配分したため staging は 32）。 |
| `AlarmNotificationEmail` | `''` | アラーム通知先メール。空なら SNS サブスクリプションなし（トピックへは発火するが通知先なし＝サイレント）。有効化環境では設定推奨。 |

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

**staging 実測例**（M10 = 接続上限 ~1490/ノード、`MONGODB_MAX_POOL_SIZE=5`、単一デフォルトデプロイメント前提）:
`ApiReservedConcurrency=40` / `ControlPlaneReservedConcurrency=10` / `ApiThrottlingRateLimit=300` / `ApiThrottlingBurstLimit=600` / `EnableOverloadAlarms=true`。
`#1507` で auth/admin を別関数に分離したため、**予約枠は合算で見る**（データプレーン 40 + 制御プレーン 10 = 50）。
`#1508` の「DB を守る同時実行上限（50）」を維持するよう合算固定で配分している（auth は低ボリュームなので 10 で足りる）。
2 関数化で Mongo/secret の warmup 接続がやや増えるため、合算 × maxPool × (1 + DEPLOYMENTS_MAX_CONNECTIONS)
が Atlas 接続上限内か確認する。まず投入し `Throttles` / `5XXError` / 接続数を見て調整する。

> **入口 throttling は現状ステージ全体のみ（#1524 の per-resource 化は #1539 で revert）**: #1507 で
> compute（Lambda 関数）は分離済みだが、**API Gateway の throttling は依然としてステージ全体
> （`MethodSettings` の `/*` = `*/*`、`ApiThrottlingRateLimit`/`BurstLimit`）の共有バケット1つ**である。
> #1524 は制御プレーン 5 resource に独立バケットを割り当てようとしたが、API GW は**ワイルドカード
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
> 専用コンテナのコールドスタート（INIT + Atlas TLS/SCRAM ~3s）に当たりやすくなる（従来はウォームな
> データプレーンコンテナに相乗りできた）。#1440 の top-level-await warmup で緩和されるが皆無ではない。
> デプロイ後に login p99 を監視すること。

### 過負荷アラーム（AWS ネイティブ指標）

`EnableOverloadAlarms='true'` のとき、SNS トピック `geonicdb-<env>-overload-alarms` と以下の
CloudWatch アラームを作成する:

| アラーム | 指標 | 意味 |
|---|---|---|
| `geonicdb-<env>-api-handler-throttles` | Lambda `Throttles` > 0 | 予約 / アカウント同時実行上限に到達（入口飽和の一次シグナル） |
| `geonicdb-<env>-api-handler-concurrency` | Lambda `ConcurrentExecutions` ≥ `ApiConcurrencyAlarmThreshold` | 予約上限への接近（先行指標） |
| `geonicdb-<env>-control-plane-handler-throttles` | Lambda `Throttles` > 0（#1507） | 制御プレーン関数が予約 / アカウント上限に到達（認証飽和） |
| `geonicdb-<env>-api-5xx` | API GW `5XXError` ≥ 25 / 5分 | 503（maxTimeMS 超過 / 過負荷）・500 の多発 |
| `geonicdb-<env>-waf-blocked` | WAFV2 `BlockedRequests` ≥ 1000 / 5分 | per-IP フラッド等、入口圧の早期シグナル |
| `geonicdb-<env>-subscription-matcher-errors` | Lambda `Errors` ≥ 5 / 5分 × 3期間（#1560） | 購読マッチングが継続失敗（15 分以上） |
| `geonicdb-<env>-rule-processor-errors` | Lambda `Errors` ≥ 5 / 5分 × 3期間（#1560） | ReactiveCore Rules が継続失敗（15 分以上） |
| `geonicdb-<env>-notification-sender-errors` | Lambda `Errors` ≥ 5 / 5分 × 3期間（#1560） | 購読通知の配信が継続失敗（15 分以上） |
| `geonicdb-<env>-ws-broadcast-errors` | Lambda `Errors` ≥ 5 / 5分 × 3期間（#1560） | WebSocket 配信が継続失敗（15 分以上） |
| `geonicdb-<env>-expiry-sweeper-errors` | Lambda `Errors` ≥ 5 / 5分 × 3期間（#1561） | TTL 失効の `EntityDeleted` 発行（expiry sweeper）が継続失敗（15 分以上） |

> **#1560 の教訓**: バックグラウンドワーカーは「静かに死ぬ」。リクエスト経路と違い失敗を
> 訴えるユーザーがいないため、メトリクスに監視が無い限り永久に発覚しない。
> `change-stream-processor` は **2026-03-08 から 141 日間 成功率 0%**（約 60 万回の失敗）
> だったが、#1508 のアラームが api-handler / control-plane-handler しか見ていなかったため
> 誰にも気づかれなかった。**新しいワーカーを追加したら必ずこの表と `template.yaml` に
> `Errors` アラームを追加すること**（`tests/unit/infrastructure/sam-template.test.ts` が
> テンプレートからワーカーを自動抽出して漏れを検出する）。
>
> 閾値は絶対数ではなく「継続性」で判定する（5 件/5分 × 3 期間連続）。短時間で収まる一過性の
> リトライ可能エラー（EventBridge / SQS の再配送で回復するもの）は通常この条件を満たさないため
> 発報しにくい。**ただし「絶対に誤報しない」わけではない** — 再試行可能なエラーであっても
> 15 分以上継続し各 5 分間で 5 件以上発生すれば、同じアラームが発火する（CodeRabbit 指摘）。
> 発報時は「恒久停止」と決めつけず、まずエラー内容とリトライ状況を確認すること。
>
> **このアラームで検知できないもの（既知の限界。レビューで指摘された点を正直に記す）**:
>
> 1. **通知先が未設定なら発火しても誰にも届かない** — `EnableOverloadAlarms=true` でも
>    `AlarmNotificationEmail` が空なら SNS トピックに購読者がゼロで、CloudWatch を人が
>    開かない限り気づけない。**staging は現在この状態**。#1560 の 141 日はまさに
>    「メトリクスは出ていたが誰も見ていなかった」事故なので、**通知先の設定は
>    アラーム追加と同じロールアウトで行う必要がある**（未設定のままではこの観測性修正は
>    半分しか配線されていない）。
>    なお #1560 のインシデント自体は閾値を満たしていた（約 3 失敗/分 = 15 件/5分 ≥ 5 が
>    3 期間連続 → 約 15 分で ALARM）。届かないだけ。
> 2. **低トラフィックのワーカーは 100% 失敗でも閾値に届かない** — 1 分あたり 1 件未満の
>    細い流量なら 5 件/5分 に達しない。「恒久停止を投入初日に検知できる」のは
>    継続的な流量があるワーカーに限る。
> 3. **起動回数ゼロの死は原理的に見えない** — イベントソースが無効化・誤設定されて
>    そもそも呼ばれないと `Errors` のデータポイントが 1 件も出ず、
>    `TreatMissingData: notBreaching`（`Errors` に対しては正しい設定）のため無反応になる。
>    別の形の「静かな死」は依然として残る。

### TTL 失効 (expiresAt) expiry sweeper（#1561）

MongoDB の TTL monitor による物理削除は `EntityService` を経由しないため、TTL 失効時の
`EntityDeleted` はワーカー (`expiry-sweeper`, `rate(1 minute)`) がアプリ側で発行する
（旧 CDC change-stream ワーカーが唯一の観測点だったが #1560 で撤去済み — 復活は二重発行になる）。

| 設定値 | 定数 (`src/config/defaults.ts` の `ENTITY_EXPIRY`) | 値 |
|---|---|---|
| TTL 猶予期間 | `TTL_GRACE_SECONDS` | 300 秒（`idx_entity_ttl` の `expireAfterSeconds`。失効から sweeper が claim できなくなる = Mongo が物理削除するまでの猶予） |
| sweep 間隔 | `SWEEP_INTERVAL_SECONDS` | 60 秒（Lambda の `rate(1 minute)` と一致） |
| 1 回の cap | `SWEEP_BATCH_CAP` | 1000 件（**走査全体の合計**。超過分は次回 sweep に持ち越し、cap 到達は `logger.warn` で可視化） |
| 1 回の時間予算 | `SWEEP_TIME_BUDGET_MS` | 20,000 ms（**走査全体の合計**。Lambda Timeout 30 秒の手前で自発的に打ち切る。残した deployment 数は `skippedDeployments` として返し warn） |

cap と時間予算は **per-deployment ではなく走査全体で共有**する。per-deployment にすると失効件数・
通知ファンアウト・Mongo 接続負荷が deployment 数だけ乗算されるため。

**不変条件**: `TTL_GRACE_SECONDS` > `SWEEP_INTERVAL_SECONDS`（逆転すると sweeper が次に走る前に
Mongo が物理削除してしまい、`EntityDeleted` が無音で欠落する）。unit テストで固定している。

### 既知の限界と挙動変更

- **at-most-once**: claim (soft-delete) から publish までの間にクラッシュすると、そのエンティティは
  `deletedAt` が既に設定されているため再 claim されず、通知は失われる（二重通知を避けるための
  trade-off）。欠落量は sweep の戻り値 `publishFailures` に**実測値**が入る — publisher の batch 経路は
  例外を投げず drop するため、呼び出し側の `try/catch` では 1 件も数えられない（`BatchPublishResult.dropped`
  を使う）。
- **同一 ID の再作成が最大 300 秒ブロックされる**: 失効エンティティは猶予期間中 physically 残るため、
  コアの一意制約 `idx_entity_unique_v3`（`{tenant, servicePath, entityId}`、`deletedAt` を含まない）が
  同一 ID の作成を `409 AlreadyExists` で弾く。**GET は 404 を返すのに作成は 409 になる**窓が、従来の
  TTL monitor 巡回間隔（~60 秒）から猶予期間（300 秒）へ広がる。
- **deployment 一覧の取得は時間予算の外**: `listEnabledDeployments()` は DynamoDB のフルスキャンで、
  スキャン自体は `SWEEP_TIME_BUDGET_MS` に含まれない。deployment が十分多いとスキャンだけで予算を
  使い切り、その run では deployment を 1 件も処理できない（この場合は専用の warn ログが出る。
  無音にはならない）。ページ単位で budget-aware にする（継続カーソルを次回 run へ引き継ぐ）のは follow-up。
- **通知ファンアウト上限は本 sweeper のスコープ外**（#1544 未実装。既存 `purgeEntities` の cap 10,000 より
  小さい範囲に収まるため新しいリスククラスではない）。
- **TTL 猶予期間の反映は index failure メトリクスの監視が前提**: 既存コレクションへの `expireAfterSeconds`
  変更は `collMod` で行うが、失敗は**非 critical** として記録されるため `/health` は緑のままになる。
  `/health` の `indexes.totalFailureCount` を監視していないと「猶予期間を設定したつもりで効いていない」
  状態に気付けない（この場合 sweeper が claim する前に Mongo が物理削除し、`EntityDeleted` が無音で欠落する）。

### Atlas 側アラーム（CloudWatch では取得不可 — 別途必須）

**MongoDB Atlas のメトリクス（System CPU / WiredTiger ticket キュー / 接続数）は CloudWatch に
来ない**（Atlas の CloudWatch 連携は別途有償統合が必要）。DB 内部の過負荷は Atlas 側のアラート
機能で設定する。MongoDB 7.0 は WiredTiger tickets（read/write 各最大 128）で内部 admission control
を持ち、公式は **queued read/write tickets を過負荷の主指標**として推奨している。推奨アラート:

- **Query Targeting: Scanned Objects / Returned** が高い（非効率クエリ = collection scan の兆候）
- **System: CPU (User) %** が高止まり
- **Connections %** がクラスタ上限に接近
- （可能なら）queued read/write tickets の増加

これらは Atlas Project の Alerts 設定（UI / Admin API）で構成し、通知先（Slack / email / PagerDuty 等）に
配線する。本 PR のスコープ外。

## Management API

### Get Quota Information

```http
GET /admin/tenants/{tenantId}/quotas
```

**Response:**
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

### Update Quota Settings

```http
PUT /admin/tenants/{tenantId}/quotas
```

**Request body:**
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

### Configure Custom Quotas

```http
PUT /admin/tenants/{tenantId}/quotas
```

**Request body:**
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

### Capacity Admission Check (#1509 / Epic #1485)

To prevent manual quota misconfiguration from saturating the cluster (the direct
trigger of the 2026-07-21 incident was a single tenant's `perMinute` being raised
without any validation), `PUT /admin/tenants/{tenantId}/quotas` runs a
**single-tenant capacity admission check** before persisting the change.

Model (per-tenant guardrail — the aggregate across all tenants is **not** evaluated):

```text
demand  = effective.perMinute × REPRESENTATIVE_WEIGHT
allowed = CLUSTER_CAPACITY_WEIGHTED_PER_MIN × MAX_SINGLE_TENANT_SHARE
demand > allowed  →  400 BadRequest (rejected)
```

The check is evaluated against the **effective** quota (the request body merged
over the tenant's existing settings), so a partial update is validated using the
resulting values.

**Override (要承認):** a `super_admin` may deliberately exceed the guardrail by
setting `acknowledgeOvercommit: true`. The override is recorded with a
high-severity audit log. `tenant_admin` cannot override (and, in practice, cannot
update quotas at all — modification requires `super_admin`).

```json
{
  "quotaPlan": "CUSTOM",
  "customQuotas": { "rateLimit": { "perMinute": 1000000 } },
  "acknowledgeOvercommit": true
}
```

> **Calibration note:** `REPRESENTATIVE_WEIGHT` and `CLUSTER_CAPACITY_WEIGHTED_PER_MIN`
> are **conservative placeholder guardrails**, not measured cluster capacity. The
> `ENDPOINT_WEIGHTS` on which the model rests are heuristic and awaiting empirical
> calibration (Atlas profiler / explain / p95 CPU time) as the second half of #1509.
> Tune the capacity via the environment variables below to match the real cluster.

### Get Usage History

```http
GET /admin/tenants/{tenantId}/usage?startDate=2026-02-01&endDate=2026-02-10&limit=100
```

**Response:**
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

## Environment Variables

### SAM Template

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

### Environment Variables

- `RATE_LIMIT_ENABLED`: Enable/disable rate limiting (default: `true` — unset/any other value is treated as enabled; only an explicit opt-out acts as an emergency kill switch — matched after trimming whitespace and lowercasing, so `false`/`FALSE`/`" false "` all disable it, #1516)
- `RATE_LIMIT_TABLE_NAME`: DynamoDB rate limit table name
- `USAGE_STATS_TABLE_NAME`: DynamoDB usage statistics table name
- `QUOTA_ALERT_WEBHOOK_URL`: Webhook URL for alert delivery (optional)

**Capacity admission check (#1509):**

- `QUOTA_ADMISSION_ENABLED`: Enable/disable the quota capacity admission check (default: `true`; set to `false` to disable)
- `CLUSTER_CAPACITY_WEIGHTED_PER_MIN`: Cluster's budgeted capacity in weighted requests per minute (default: `300000`). Tune to the real cluster capacity.
- `QUOTA_MAX_SINGLE_TENANT_SHARE`: Maximum fraction (0..1) of cluster capacity a single tenant's quota may claim (default: `0.5`)
- `QUOTA_ADMISSION_REPRESENTATIVE_WEIGHT`: Conservative endpoint weight used to estimate a tenant's demand (default: `5`; should track the heaviest `ENDPOINT_WEIGHTS` value)

## Access Control

### Permission Levels

- **super_admin**: Can view and modify quotas for all tenants
- **tenant_admin**: Can view quotas for their own tenant (read-only). Modification requires `super_admin`
- **user**: No access to the quota management API

### Authentication

All quota management APIs require authentication:

```http
Authorization: Bearer <JWT_TOKEN>
```

## Best Practices

### Choosing a Quota Plan

1. **Development/Testing**: Start with the FREE plan
2. **Small-scale production**: STANDARD plan
3. **Medium-scale production**: PREMIUM plan
4. **Large-scale production**: ENTERPRISE plan
5. **Special requirements**: Configure individually with the CUSTOM plan

### Alert Configuration

- **Warning**: Threshold to consider expanding capacity (default 80%)
- **Critical**: Threshold requiring immediate action (default 95%)
- Configure a Webhook URL to receive real-time notifications

### Monitoring

- Check response headers regularly
- Analyze trends with the usage history API
- Monitor alert logs

## Troubleshooting

### 429 Too Many Requests

**Cause**: Rate limit exceeded

**Resolution**:
1. Wait the number of seconds specified in the `Retry-After` header
2. Reduce request frequency
3. Leverage batch operations to reduce the number of requests
4. Consider upgrading the plan

### 507 Insufficient Storage

**Cause**: Storage quota exceeded

**Resolution**:
1. Delete unnecessary entities/subscriptions/registrations
2. Shorten the retention period for temporal data
3. Consider upgrading the plan

### Quota Headers Not Displayed

**Cause**: Rate limiting may be disabled

**Resolution**:
1. Check the `RATE_LIMIT_ENABLED` environment variable
2. Check the SAM template parameters
3. Verify that the DynamoDB table is deployed correctly

## Input Validation Limits

GeonicDB enforces input length and count limits to prevent abuse and ensure system stability.

### Authentication & Login Protection

#### Per-Account Login Protection

Existing per-account brute-force protection (see [AUTH.md](../reference/auth.md)):

- Maximum failed login attempts per account: **5** within **15 minutes**
- Account lock duration: **15 minutes** after threshold is reached
- Progressive delay: Exponential backoff starting at **2 seconds** (2^(n-2))

#### Per-IP Login Protection (#900)

Prevents password spray attacks across multiple accounts from a single IP:

| Parameter | Value |
|-----------|-------|
| Maximum failed attempts per IP | **20** within **5 minutes** |
| IP lock duration | **15 minutes** |
| Record TTL | **1 hour** (auto-deleted) |

- **HTTP status**: `429 Too Many Requests` with `Retry-After: 900`
- Successful logins do NOT reset the IP counter (prevents timing-based enumeration)
- Error message: `"Too many failed login attempts from this IP. Please try again later."`

### Tenant Resource Limits

#### Users per Tenant (#901)

| Parameter | Default |
|-----------|---------|
| Maximum users per tenant | **100** |

- Checked on user creation only
- Per-tenant override via `tenant.settings.maxUsers`
- **HTTP status**: `400 Bad Request`
- Error message: `"User limit reached for this tenant (current: N, limit: M)"`

#### Policies per Tenant (#912)

| Parameter | Default |
|-----------|---------|
| Maximum policies per tenant | **50** |

- Per-tenant override via `tenant.settings.maxPolicies`
- **HTTP status**: `400 Bad Request`
- Error message: `"Policy limit reached for this tenant (current: N, limit: M)"`

#### Admin User Operations Rate Limit (#905)

Prevents create-delete cycle attacks on the Admin API:

| Parameter | Value |
|-----------|-------|
| Window | **10 minutes** |
| Maximum operations per window | **1,000** (create + delete combined) |

- Applied per tenant on `createUser` and `deleteUser`
- `super_admin` is exempt
- **HTTP status**: `429 Too Many Requests`
- Error message: `"Too many user management operations. Limit: 1000 per 10 minutes."`

### XACML Policy Input Limits (#912)

| Field | Max Length |
|-------|-----------|
| `policyId` / `policySetId` / `ruleId` | 256 characters |
| `description` | 2,000 characters |
| `attributeId` | 256 characters |
| `matchValue` | 2,000 characters |
| `expression` (condition) | 5,000 characters |
| `timezone`, `startTime`, `endTime` | 50 characters |
| IP/CIDR entry in `allowedIps` | 50 characters |

| Collection | Max Count |
|------------|-----------|
| Rules per policy | 100 |
| Conditions per rule | 50 |
| Policies per policy set | 100 |

### Email Address Validation (#903)

- Maximum length: **254 characters** (RFC 5321 compliance)
- Applied to: user creation, user update, login
- **HTTP status**: `400 Bad Request`

### Subscription Endpoint URI/URL (#913)

- Maximum length: **2,048 characters**
- Applied to: NGSI-LD `notification.endpoint.uri`, NGSIv2 `notification.http.url` / `notification.httpCustom.url` / `notification.mqtt.url`
- **HTTP status**: `400 Bad Request`

### Input Validation Limits (General)

GeonicDB enforces comprehensive input validation across all API endpoints. Exceeding any limit returns `400 Bad Request`.

#### String Length Limits

| Category | Example Fields | Max Length |
|----------|---------------|-----------|
| Entity ID | `entityId`, `id` | 256 |
| Entity Type | `type` | 256 |
| Attribute Name | `attrName`, attribute keys | 256 |
| Generic ID | `subscriptionId`, `registrationId`, `ruleId` | 256 |
| Name fields | `name`, `subscriptionName` | 256 |
| Description fields | `description` | 2,000 |
| URL fields | `endpoint`, `provider.http.url` | 2,048 |
| Query strings | `q`, `mq`, `scopeQ`, `csf` | 2,000 |
| Regex patterns | `idPattern`, `typePattern` | 200 |
| georel | `georel` | 100 |
| geometry | `geometry` | 50 |
| coords | `coords`, `coordinates` | 2,000 |
| orderBy | `orderBy` | 500 |
| options | `options` | 200 |
| lang | `lang` | 50 |
| scope | `scope` (string) | 500 |
| unitCode | `unitCode` | 50 |

#### Array Element Count Limits

| Array Field | Max Elements |
|------------|-------------|
| `attrs`, `pick`, `omit`, `expandValues` | 50 |
| `watchedAttributes` | 100 |
| `notification.attrs` / `exceptAttrs` | 100 |
| `subject.entities` / `entities` | 100 |
| Batch operation `entities` | 100 (MAX_BATCH_SIZE) |
| `propertyNames` / `relationshipNames` | 100 |
| `receiverInfo` / `notifierInfo` | 50 |
| `contextSourceInfo` | 50 |
| `operationGroup` | 20 |
| `scope` (array) | 20 |
| `@context` (array) | 10 |

#### Numeric Upper Bounds

| Field | Max Value |
|-------|-----------|
| `throttling` | 86,400 (24 hours, in seconds) |
| `timeout` | 30,000 (30 seconds, in ms) |
| `lastN` | 1,000 |

#### Header Validation

| Header | Max Length |
|--------|-----------|
| Bearer / DPoP token | 8,192 |
| Link (@context URL) | 2,048 |
| Fiware-ServicePath (per element) | 256 |
| Tenant name (Fiware-Service) | 64 |

#### Path Parameter Validation

Resource IDs in URL paths are also validated for length.

| Parameter | Max Length | Applicable APIs |
|-----------|-----------|-----------------|
| `entityId` | 256 | NGSIv2, NGSI-LD |
| `attrName` | 256 | NGSIv2, NGSI-LD |
| `subscriptionId` | 256 | NGSIv2, NGSI-LD |
| `registrationId` | 256 | NGSIv2, NGSI-LD |
| `instanceId` | 256 | NGSI-LD Temporal |
| `entityMapId` | 256 | NGSI-LD Entity Maps |
| `contextId` | 256 | NGSI-LD JSON-LD Contexts |
| `snapshotId` | 256 | NGSI-LD Snapshots |
| `ruleId` | 256 | Rules API |
| `typeName` | 256 | NGSIv2/NGSI-LD Types |
| `datasetId` | 256 | Catalog API |

#### AttributeValue Nesting Depth Limit

- Maximum depth: **10**
- Beyond the limit, only primitive types (string, number, boolean, null) are accepted
- **HTTP status**: `400 Bad Request` when nesting exceeds the limit

#### MQTT Notification Fields

| Field | Max Length |
|-------|-----------|
| `topic` | 1,024 |
| `user` / `passwd` | 256 |

#### HTTP Custom Notification Fields

| Field | Max Length |
|-------|-----------|
| Header key | 256 |
| Header value | 4,096 |
| Query string value | 2,048 |
| `payload` | 51,200 (50KB) |

#### Admin API Validation

| Field | Max Length / Value |
|-------|-------------------|
| Tenant `name` | 64 |
| Tenant `maxUsers` | 10,000 |
| Tenant `description` | 2,000 |
| Tenant `allowedServices` | 50 elements, each 256 chars |
| User `password` | 128 (also minimum 12) |
| Policy `priority` | 0–1,000 |
| Policy `subjects` / `resources` / `actions` array | 50 elements each |
| API key `policyId` / `tenantId` | 256 |
| API key origin | 2,048 |
| OAuth client `name` | 256 |
| OAuth client `description` | 2,000 |
| Path parameters (`tenantId`, `userId`, `policyId`, `keyId`, `clientId`) | 256 |

#### Auth & OAuth API Validation

| Field | Max Length |
|-------|-----------|
| Login `password` | 128 |
| Login `tenantId` | 256 |
| Refresh token | 8,192 |
| Password reset `token` | 2,048 |
| OAuth `scope` | 2,000 |
| OAuth `client_secret` | 512 |
| OAuth `nonce` / `proof` | 512 |

#### Custom Quota Upper Bounds

When configuring custom quotas via the Admin API, the following maximum values apply:

| Field | Max Value |
|-------|-----------|
| `rateLimit.perMinute` | 1,000,000 |
| `rateLimit.perHour` | 10,000,000 |
| `rateLimit.perDay` | 100,000,000 |
| `rateLimit.burstAllowance` | 100,000 |
| `storage.maxEntities` | 100,000,000 |
| `storage.maxSubscriptions` | 1,000,000 |
| `storage.maxRegistrations` | 1,000,000 |
| `storage.maxTemporalDataPoints` | 1,000,000,000 |
| `limits.maxRequestBodyBytes` | 100MB (104,857,600) |
| `limits.maxResponseBodyBytes` | 1GB (1,073,741,824) |
| `limits.maxBatchSize` | 10,000 |

#### Rules API Validation

| Field | Max Length / Value |
|-------|-------------------|
| Rule `name` | 256 |
| Rule `description` | 2,000 |
| Rule `priority` | 0–1,000 |
| Rule `cooldownSeconds` | 86,400 (24h) |
| Condition `attributeName` | 256 |
| Condition `pattern` | 200 |
| Condition `timezone` / `startTime` / `endTime` | 50 |
| Action `entityId` | 256 |
| Action `entityType` | 256 |
| Action `url` (webhook) | 2,048 |
| Action `message` | 2,000 |
| `conditions` / `actions` array | 50 elements each |
| `entityTypes` array | 100 elements |

#### Custom Data Models API Validation

| Field | Max Length / Value |
|-------|-------------------|
| Model `type` | 256 |
| Model `domain` | 256 |
| Model `description` | 2,000 |
| Property `valueType` | 256 |
| Property `description` | 2,000 |
| Validation `minLength` / `maxLength` | 10,000 |
| Validation `enum` array | 100 elements |

#### Catalog / CADDE / Vocabulary API Validation

| Field | Max Length |
|-------|-----------|
| Catalog `q` (keyword) | 2,000 |
| Catalog `id` (package/dataset) | 256 |
| CADDE query params (`type`, `id`, `q`) | Same as NGSI limits |
| Vocabulary `tenantId` | 64 |
| Vocabulary `term` | 256 |

#### MCP Admin Tools Validation

MCP tools enforce the same limits as the HTTP Admin API at the tool input layer:

| Field | Validation |
|-------|-----------|
| `email` | Valid email format, max 254 chars |
| `password` | 12–128 chars |
| `id` / `policyId` / `tenant` | Max 256 chars |
| `description` | Max 2,000 chars |
| `priority` | 0–1,000 |

All limit violations return:
- **HTTP status**: `400 Bad Request`
- **Error format**: `{ "error": "BadRequest", "description": "field exceeds maximum length of N" }`

### Storage Quota Fix: `/v2/op/update` (#902)

The storage quota check for batch operations (`/v2/op/update`) now correctly identifies entity-creation operations:

- **`append` / `appendStrict`**: Counted as entity creation — consumes storage quota
- **`update` / `delete` / `replace`**: NOT counted as entity creation — no storage quota impact

Previously, all `/v2/op/update` requests were incorrectly counted against the entity creation quota regardless of `actionType`.

## Related Documentation

- Development & Deployment Guide - Infrastructure setup
- [Authentication & Authorization](../reference/auth.md) - Tenant/user management, access control
