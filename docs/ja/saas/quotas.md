---
title: "Quotas & Plans"
description: "GeonicDB quota system and plans"
outline: deep
---
# GeonicDB クォータシステム

GeonicDB は、テナントごとのレート制限とストレージクォータを管理するための包括的なクォータシステムを提供します。

## 概要

クォータシステムは 3 つの主要コンポーネントで構成されています:


1. **レート制限システム** - DynamoDB または MongoDB をバックエンドとした固定ウィンドウカウンターを使用した API リクエスト制限
   
2. **ストレージクォータシステム** - MongoDB ベースのエンティティ / サブスクリプション / 登録 / 時系列データの数量制限
   
3. **モニタリング & 管理システム** - 使用状況の追跡、アラート配信、および管理 API

## クォータプラン

GeonicDB は 4 つの標準プランと 1 つのカスタムプランを提供しています:

> **プラン名。** `FREE` / `STANDARD` / `PREMIUM` / `ENTERPRISE` は、顧客向けの `T0` / `T5` / `T30` / `T40` に対応しています(マッピングとクラスタティアについては QUOTA\_OPERATIONS.md §1 を参照してください)。
>
> **値は #2082 で引き上げられました。** 顧客向けプランシートと以前の実装の間で高い方に合わせられたため、**テナントの有効制限が引き下げられることはありませんでした**。シートの値が低かった残りの 3 つのセル(T0 ユーザー数 / T0 バッチサイズ / T5 ユーザー数)は、シートを実装に合わせて引き上げることで解決されたため、**以下の値は現在 [customer/PLAN\_QUOTAS.md](./customer/PLAN_QUOTAS.md) §2/§4 とセル単位で一致しています**。
>
> ⚠️ **同じ数値が 4 箇所に存在します。1 つの PR で 4 箇所すべてを変更してください** — 1 箇所だけを変更すると #2082 が再発します(どちらが正式な値か誰も判断できなくなります):
>
> 1. `QUOTAS.PLANS` (`src/config/defaults.ts`) — 実装であり、正式な値
> 2. [customer/PLAN\_QUOTAS.md](./customer/PLAN_QUOTAS.md) §2/§4 — 顧客向け
> 3. **このセクション** — 開発者向けリファレンス
> 4. QUOTA\_OPERATIONS.md §1.1 — 運用ランブック
>
> **`Maximum batch operation size` はプランごとに適用されるようになりました**(#2082)。以前は適用されていませんでした:`QUOTAS.PLANS[*].limits.maxBatchSize` は定義されており、Admin API は `customQuotas.limits.maxBatchSize` を受け付けていましたが、コードはそれを読み取っていませんでした — 有効な上限はすべてのプランで一律 `SECURITY.MAX_BATCH_SIZE` でした。`SECURITY.MAX_BATCH_SIZE`(**1000**)は現在、Zod スキーマで使用されるプランに依存しない絶対上限となっており、プランごとの値は `handlers/api/index.ts` で `getMaxBatchSize()` を介して適用され、`cannot exceed the plan limit` でリジェクトされます。
>
> **#3828**: SAM パラメータ `MaxBatchSize`(環境変数 `MAX_BATCH_SIZE`)は #2082 以降も 100 がデフォルトだったため、ステージングと本番環境で上限が 100 に固定され、**100 を超えるプラン値(および `customQuotas.limits.maxBatchSize`)は一度も有効になりませんでした**。テンプレートのデフォルトは現在上限(1000)と等しくなっています。環境変数はそれを下げることしかできません(緊急スロットル)。同時に STANDARD(100 → 1,000)と PREMIUM(500 → 1,000)が引き上げられ、**すべての有料プランが上限と等しくなりました**(ステージング M30 での A/B テスト:1,000 エンティティの upsert は 100 エンティティのものと同じ Atlas CPU を消費し、リクエストあたり ≤ 3.2 秒)。FREE は 100 のままです。
>
> **バッチ削除は個別に上限が設定されています**(`SECURITY.MAX_BATCH_DELETE_SIZE` = **100**、プランに依存せず、`customQuotas` で引き上げ不可)。有効な削除制限 = `min(プラン制限, 100)`。ステージング(Atlas M30)で測定:1,000 エンティティのバッチ upsert は ≤ 3.2 秒で完了しますが、1,000 件のバッチ削除は 29 秒の API Gateway タイムアウトを超えます(Lambda が削除を続けている間に 504)。NGSIv2 `actionType: delete`、NGSI-LD `entityOperations/delete`、`temporal/entityOperations/delete`、および MCP / A2A `batch.delete` / `temporal.batch_delete` に適用され、400 `cannot exceed the per-operation limit` でリジェクトされます。
>
> **`Maximum users` はプランにリンクされるようになりました**(#2082)。明示的な `settings.maxUsers` は依然としてプランのデフォルトよりも優先されるため、テナントごとのアドオンはプラン変更によって上書きされません。

### 技術的制限:最大エンティティドキュメントサイズ(#2517)

プランのストレージカウントとは独立:**`QUOTAS.MAX_ENTITY_DOCUMENT_BYTES` = 1 MiB**(1 つのエンティティドキュメントの BSON サイズ)。作成 / 置換時に `EntityRepository` で適用され(`$expr` + `$bsonSize` 事前イメージガード)。**413 `RequestEntityTooLarge`** でリジェクトされます。スナップショット復元は `EntityRepository` をバイパスし、**意図的に免除されています**(祖父復元)。

顧客向け概要:[`docs/customer/PLAN_QUOTAS.md`](./customer/PLAN_QUOTAS.md)(以下の詳細セクションと文言を同期させてください)。

注意:PREMIUM/ENTERPRISE のリクエストボディ制限は 5MB/10MB であるため、リクエストがボディチェックをパスしても、結果のドキュメントが 1 MiB を超える場合、永続化時に 413 を受け取る可能性があります。

**暗号化されたテナント(#2517 SECREVIEW4):** replace(`append:false`)は、M2 に必要な場合のみ暗号化します。**現在の**ドキュメントがすでに 1 MiB 制限内にある場合、過大な属性ペイロードは `encryptAttributes` の**前に**リジェクトされます(破棄されたバイトを DEK ローテーションにカウントしないようにするため)。現在のドキュメントがすでに制限を超えている場合、早期ペイロードチェックはスキップされ、縮小 replace がアトミック縮小 `$expr` ガードを介して成功できるようにします。

**1 つのバッチ内の同じエンティティ id:** `SECURITY.MAX_ENTITY_BATCH_OCCURRENCE_ROUNDS`(8)。1 つのリクエスト内で同じ id がこれより多く出現すると、書き込み前に **400** でリジェクトされます(リクエストレベルの無効な入力 — 207 を返す書き込み後のエンティティごとのエラーとは異なります)。重複 id をラウンド分割する**すべての**バッチ upsert エントリポイントに適用されます:NGSIv2 `/v2/op/update`、NGSI-LD `entityOperations/upsert`(merge および `options=replace`)、MCP バッチ upsert、および A2A バッチ upsert。

### インポートジョブ (#3872)

専用ディメンション(レート制限ウィンドウから引き出されない)。プランごとの `maxConcurrent` / `maxFileBytes` / `entitiesPerSecond` は以下の各プランの下に記載されています。
ワーカーは各ジョブに対して独立して `entitiesPerSecond` を適用します。同時実行ジョブは、同じテナントに対して合計でこのレートを超えることができます。

ワーカー書き込みの認可には、**ジョブ作成時にキャプチャされたアクタースナップショット**が使用されます。
実行中のロールダウングレード、ユーザー削除、または API キー失効は**再チェックされません**。処理を停止するにはジョブをキャンセルしてください。**テナント無効化**は、各ワーカー呼び出しの開始時にキャッシュされていないテナントルックアップ(ソフト削除されたテナントを含む)を介してチェックされます。ジョブは `failed` とマークされ(アクティブスロットが解放される)、ACK されます。キャンセルは必要ありません(無効化後、テナントユーザーには利用できない可能性があります)。**デプロイメントホスト名が解決できない(見つからない)**ジョブは、実行されずに ACK されます(DB 間フォールバックなし。他のイベントコンシューマーと同じポリシー)。`queued`/`running` のまま、テナントが再有効化され、オペレーターがそれらを `cancel` するまでアクティブスロットを保持する可能性があります。自動回収はありません。デプロイメント**ルックアップエラー**は例外をスローします。ハンドラーはレコードを `batchItemFailures` に入れ、SQS が再配信します。
**既知の制限(ハード削除):** `DELETE /tenants/:id` を暗号シュレッドなしで実行すると、クリーンアップ後にテナントドキュメントが物理的に削除されます。すでにジョブドキュメントをロードしたワーカーは、テナントルックアップから `null` を受け取り、「欠落テナント→続行」ポリシー(作成時の `AUTH_ENABLED=false` と整合)の下で 1 スライス分続行する可能性があります。ソフト削除は `includeDeleted` でカバーされています。
**エンティティクォータの動作(インポートジョブのアップサートスライス):** エンティティ数の上限に近い場合、`batchUpsert` は書き込み前に依然として `entities.length` を予約します(#3669)。それが `InsufficientStorageError`(同期バッチパスでの HTTP 507)を発生させる場合、インポートワーカーは**アップサートスライスを分割し、再試行ごとに同じ予約セマンティクスを保ちながら再帰的に再試行します**。残りのヘッドルームに収まる行は続行され、単一行の粒度で依然として失敗する行のみが `failed` としてカウントされ、`errors.ndjson` にエンティティごとのレコードが記録されます(サイレントなデータ損失はありません)。予約は更新を含む行をカウントするため、`current >= ceiling`(ここで `ceiling = floor(limit * STORAGE_GRACE_MULTIPLIER)`)の場合、単一の更新行でも 507 を返します。ヘッドルームがゼロ(`current >= ceiling`)の場合、分割再試行はショートサーキットし、残りの行をエンティティごとのエラー行とともに即座に失敗としてマークします。
分割再試行が進行中で Lambda の残り時間が `REQUEUE_REMAINING_MS` を下回った場合、または一部のサブレンジが成功した後に再試行可能なインフラストラクチャエラーが発生した場合、ワーカーは確認されたプレフィックスをチェックポイントし、そのオフセットから再試行します(未解決の行を自動的に失敗にはしません)。

### T0 / FREE プラン(評価および開発用)

**レート制限:**

* 分あたり: 3,000 重み単位(重み 1 の GET のみの場合、50 req/sec に相当 — [エンドポイント重み](#endpoint-weights)を参照)
  
* 時間あたり: 180,000 重み単位(#3876: `perMinute × 60`; 以前は 50,000)
  
* 日あたり: 1,800,000 重み単位(#3876: `perHour × 10`)
  
* バースト許容量: 500 重み単位
  
* 最大同時実行数: 6 (`ceil(50 × 0.084 × 1.2)`、#3118 / #3113 `read-one` p50)
  
* 日あたりの最大通知数: 50,000 (#1544; #3118 以降、意図的に `perDay` に紐付けられていません)

**ストレージクォータ:**

* エンティティ: 5,000
  
* サブスクリプション: 10
  
* レジストレーション: 5
  
* 時系列データポイント: 10,000

**制限:**

* 最大リクエストボディサイズ: 512KB
  
* 最大レスポンスボディサイズ: 5MB
  
* 最大バッチ操作サイズ: 100
  
* 最大ユーザー数: 100

**インポートジョブ (#3872):**

* maxConcurrent: 1
  
* maxFileBytes: 100 MiB
  
* entitiesPerSecond: 50

### T5 / STANDARD プラン (小規模本番環境)

**レート制限:**

* 分あたり: 48,000 ウェイトユニット (重み 1 の GET のみの場合、800 req/sec 相当)
  
* 時間あたり: 2,880,000 ウェイトユニット (#3876: `perMinute × 60`; 以前は 800,000 — 時間枠が公開されている分単位の予算を下回らなくなりました)
  
* 日あたり: 28,800,000 ウェイトユニット (#3876: `perHour × 10`)
  
* バースト許容量: 8,000 ウェイトユニット
  
* 最大同時実行数: 81 (`ceil(800 × 0.084 × 1.2)`)
  
* 1 日あたりの最大通知数: 800,000 (#1544; #3118 以降、意図的に `perDay` とは連動していません)

**ストレージクォータ:**

* エンティティ: 1,000,000
  
* サブスクリプション: 100
  
* レジストレーション: 50
  
* 時系列データポイント: 2,000,000

**制限:**

* 最大リクエストボディサイズ: 1MB
  
* 最大レスポンスボディサイズ: 10MB
  
* 最大バッチ操作サイズ: 1,000 (#3828: 100 から引き上げ)
  
* 最大ユーザー数: 100

**インポートジョブ (#3872):**

* maxConcurrent: 1
  
* maxFileBytes: 1 GiB
  
* entitiesPerSecond: 200

### T30 / PREMIUM プラン (中規模本番環境 / 専用クラスタ)

**レート制限:**

* 分あたり: 60,000 ウェイトユニット (重み 1 の GET のみの場合、**1,000** req/sec 相当 —
  公開されたソフト上限 #3137; ステージング GW は #3132 以降 2000 ですが、1,500 は公開不可;
  生の ×10 は 1,500 になります)
  
* 時間あたり: 3,600,000 ウェイトユニット (#3876: `perMinute × 60`; 以前は 1,000,000 — STANDARD より上の階層を維持)
  
* 日あたり: 36,000,000 ウェイトユニット (#3876: `perHour × 10`)
  
* バースト許容量: 10,000 ウェイトユニット
  
* 最大同時実行数: 101 (`ceil(1000 × 0.084 × 1.2)`、**< ApiReservedConcurrency** を維持する必要があります — 本番 172 / ステージング 256)
  
* 1 日あたりの最大通知数: 1,500,000 (#1544; #3118 以前の値を保持)

**ストレージクォータ:**

* エンティティ: 50,000,000 (専用クラスタ — Atlas M30 相当の Mongo 分離; エントリは依然として共有; #3141 / #3138)
  
* サブスクリプション: 1,000
  
* レジストレーション: 500
  
* 時系列データポイント: 100,000,000

**制限:**

* 最大リクエストボディサイズ: 5MB
  
* 最大レスポンスボディサイズ: 50MB
  
* 最大バッチ操作サイズ: 1,000 (#3828: 500 から引き上げ)
  
* 最大ユーザー数: 100

**インポートジョブ (#3872):**

* maxConcurrent: 2
  
* maxFileBytes: 5 GiB
  
* entitiesPerSecond: 500

### T40 / ENTERPRISE プラン (大規模本番環境 / 専用クラスタ)

**レート制限:**

* 分あたり: 60,000 ウェイトユニット (重み 1 の GET のみの場合 **1,000** req/sec 相当 —
  PREMIUM と同じ公表ソフトシーリング #3137; 生の ×10 は 3,000 — 共有エントリでは到達不可能、#3132 コールド)
  
* 時間あたり: 3,600,000 ウェイトユニット (#3876: `perMinute × 60`; 以前は 1,000,000 — PREMIUM と同じ)
  
* 日あたり: 36,000,000 ウェイトユニット (#3876: `perHour × 10`)
  
* バースト許容量: 10,000 ウェイトユニット
  
* 最大同時実行数: 101 (`ceil(1000 × 0.084 × 1.2)`、**< ApiReservedConcurrency** — 本番 172 / ステージング 256)
  
* 1 日あたりの最大通知数: 3,000,000 (#1544; #3118 以前の値で維持)

**ストレージクォータ:**

* エンティティ: 250,000,000 (Mongo 分離のため専用クラスタが必要 — DEDICATED\_CLUSTER\_ONBOARDING.md / #1492 / #3141 を参照; エントリは #3138 まで共有のまま)。エンティティと時系列の上限の同時充填は **M50 推奨** (M40 \~1 TB はステージングの avgObjSize \~933 B からの BSON+インデックスサイジングでギリギリ)
  
* サブスクリプション: 2,000
  
* レジストレーション: 1,000
  
* 時系列データポイント: 1,000,000,000

**制限:**

* 最大リクエストボディサイズ: 10MB
  
* 最大レスポンスボディサイズ: 100MB
  
* 最大バッチオペレーションサイズ: 1,000
  
* 最大ユーザー数: 1,000

**インポートジョブ (#3872):**

* maxConcurrent: 5
  
* maxFileBytes: 10 GiB
  
* entitiesPerSecond: 1000

> **#3137 published-rps ルール (裁可 2026-09-15; #3118 の "GW=1000 が上限" という表現に取って代わる):**
> 公表するのは共有環境が両方の条件下で提供できるもののみ:
> (1) **単テナント成功率 100%** 持続負荷下、および (2) **他テナント無影響**
> (同居テナントへの測定可能な 429/5xx 影響範囲なし)。#3132 以降、ステージングエントリは
> `ApiThrottlingRateLimit=2000` / `ApiReservedConcurrency=256` だが、PREMIUM/ENTERPRISE の **公表ソフトシーリング** は **1,000 req/s** (`perMinute` 60,000) のまま。**`read-one open` (ウォームアップ 2)** (#3132) で測定: 1,000 rps = 100%; 1,500 rps = 95.6% で ConcurrentExecutions は 256 に固定され、同居テナントへの \~73k API GW 5xx — したがって 1,500 は持続 **または** バーストとして公表不可。その他の重み 1 の GET (list / `types` / `attrs`) はクォータウェイトの等価物のみ; 到達可能な rps は測定されるまで未検証として扱う。ENTERPRISE の生 ×10 (3,000) は共有エントリでは到達不可能のまま。専用クラスタプランは **Mongo (Atlas) 分離のみ** を意味する; エントリ (GW + 予約済み同時実行数) はまだ共有 — 未公表のエントリパフォーマンスを「専用クラスタ」に帰属させないこと (#3138)。`production.json` は GW **2000** rps / バースト **4000** (#3265; ステージング同値) および `ApiReservedConcurrency` 172 を設定 (#3132 / #4017 の予約は維持。入口の 5000 は #3265 裁可でステージング同値へ戻した)。本番反映はマージ + デプロイ後。公表プランレート (1,000 rps) は不変。
>
> `maxConcurrency ≈ ceil(publishedRps × 0.084 × 1.2)` #3113 `read-one` p50 を使用; すべてのプランは `ApiReservedConcurrency` (本番 172 / ステージング 256) を **下回る**。Epic #3112 rev.3 の暫定同時実行数値 (STANDARD 64 / PREMIUM 120 / ENTERPRISE 240) は予約済み ≈320 を想定しており、#3117 以降は **無効**。
>
> テナントの到達可能 rps ≈ `maxConcurrency / レイテンシ` (そして公表ソフトシーリング / GW シェアを決して上回らない)。ウェイトユニット予算は依然として適用される; 顧客シートの req/s 数値は重み 1 の GET 相当。

### CUSTOM プラン

任意の値を設定できるカスタムプラン。管理 API を使用して個別に設定します。

## レート制限

### 固定ウィンドウカウンター

GeonicDB は 3 つのウィンドウ (分/時/日) に対して**固定ウィンドウカウンター**を使用します。ウィンドウの境界は絶対的です。現在時刻は分/時/日の境界に切り捨てられ (`src/core/quotas/rate-limit/rate-limit.service.ts` の `getWindowTimestamp()`)、その切り捨てられたタイムスタンプがウィンドウを識別します。


1. 各リクエストはエンドポイントの重みに等しい許容量を消費します
   
2. バケットは真実のソースとして**使用量** (`usedMinute` / `usedHour` / `usedDay`) を格納します (#3832)。リクエストは、3 つのウィンドウすべてで `used + weight <= currentLimit` の場合にのみ許可されます。残りの許容量は、チェック/読み取りのたびに `limit - used` として導出されます
   
3. 分/時のウィンドウがロールオーバーすると、その `used` は**リクエストの重みにリセット**されます (日のウィンドウは `dayTs` キーを変更することでリセットされます)。段階的な補充はありません
   
4. ウィンドウの途中でテナント制限を変更すると、即座に効果が現れます。制限を引き上げると、`used` を変更せずに残量が増加します。制限を引き下げると即座に適用されます (そして `used` が既に新しい制限を超えている場合は拒否されます)

> ⚠️ これは**トークンバケットではなく**、ウィンドウは**スライディングではありません**。段階的な補充はありません。ウィンドウの境界を越えると、現在のリクエストから `used` が再開されます (`trySlowPathConsumeMongo()` は分のローテーション時に `usedMinute = weight` を設定します)。補充モデルを仮定すると誤った結論に至ります — #1806 を参照してください。そこでは、その根拠に基づいて不安定なテストが誤診されました。リーダーは `used*` のみのバケットを受け入れます (#3852)。`remaining*` の二重書き込みと `RATE_LIMIT_REMAINING_DUAL_WRITE` フラグは**削除されました** (#3852)。consume / migrate / repair / slow-path は `used*` のみを書き込みます。古いバケットの古い `remaining*` は、`used*` が存在する場合、読み取り時に無視されます。**ロールバックフロア: `v0.29.0` より前にはロールバックしないでください** (フラグ削除) — 依然として二重書き込みするか、すべてのバケットで `remaining*` を必要とする古いビルドは、used\*-only ライターから乖離する可能性があります。`v0.28.0` 以降の互換性のあるリーダーは、すでに used\*-only を有効として扱っています。

### カウンターキー — どのテナントに課金されるか (#2221)

カウンターキーは `<tenant>#<servicePath>` であり、**`<tenant>` は呼び出し元が宣言したテナントではなく、リクエストが認可されたテナント**です。

| Route class                                          | Tenant charged                                                            | Why                                                                                                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Data plane (`/v2/**`, `/ngsi-ld/**`, `/rules/**`, …) | the `Fiware-Service` / `NGSILD-Tenant` header value                       | `checkTenantAccess` has already verified that the caller belongs to that tenant                                                            |
| `/custom-data-models/**`                             | the tenant resolved from the caller's **access token** (`actor.tenantId`) | this route deliberately **skips** `checkTenantAccess` (it is an admin API keyed on `actor.tenantId`), so the header is **unverified** here |

`/custom-data-models` の場合、ヘッダーはカウンターに対して単に無視されるだけではありません。解決された同じテナントが、プランのルックアップ、リクエスト/レスポンスのサイズ制限、`X-RateLimit-*` レスポンスヘッダー、および API 呼び出しメトリクスに使用されるため、すべてのアカウンティングディメンションは、認可決定が使用したのと同じテナントを指定します。監査ログもこれを使用しますが、このルートでは不活性です。`resolveAuditAction` は `/custom-data-models` パスをマッピングしないため、そもそもここでは監査エントリは発行されません。

このルートをヘッダーでキー付けすると、呼び出し元は (a) 別のテナントを指定することで**別の**テナントのカウンターを枯渇させ、(b) リクエストごとに異なるテナントを指定してキーを分散させることで**自身の**制限を回避し、(c) 存在しないテナントを指定することでチェック自体をスキップできます (プランのルックアップが `null` を返し、ブロック全体がバイパスされます)。

> テナントごとの**同時実行数**制限は、依然として `/custom-data-models` を除外しています (#1510)。その除外の元々の理由 — 未検証のキー — はもはや適用されませんが、これを有効にすると、このルートに新しい `429` が導入されることになり、それは正確性の修正というよりも容量ポリシーの決定です。

### エンドポイントの重み

異なるエンドポイントには、処理コストに基づいて異なる重みが割り当てられています:

| Operation                        | Weight    | Example                                                                                                                                                 |
| -------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET                              | 1         | `GET /v2/entities`                                                                                                                                      |
| POST (single)                    | 3         | `POST /v2/entities`                                                                                                                                     |
| PATCH/PUT                        | 2         | `PATCH /v2/entities/{id}`                                                                                                                               |
| DELETE                           | 2         | `DELETE /v2/entities/{id}`                                                                                                                              |
| Batch operations                 | 3 × count | `POST /v2/op/update` with 10 entities = 30 (#3829: was 5×; aligned with single POST)                                                                    |
| Temporal read                    | 2         | `GET /ngsi-ld/v1/temporal/entities`                                                                                                                     |
| Temporal write (POST collection) | 3         | `POST /ngsi-ld/v1/temporal/entities`                                                                                                                    |
| Temporal batch write             | 5 × count | `POST .../temporal/entityOperations/{create,upsert,delete}` (#3876: staging M30 A/B ≈1.78× entity-batch CPU → round(3×1.78)=5; **breaking** vs prior 1) |
| Temporal batch query             | 2 × count | `POST .../temporal/entityOperations/query` (#3876: aligned with GET /temporal)                                                                          |

受信リクエストパスは、`resolveEndpointWeight()` (`src/core/quotas/rate-limit/rate-limit.constants.ts`) によってこれらのエンドポイントテンプレートと照合されます。これは各 `{placeholder}` を単一のパスセグメントとして扱います。これは、`/v2/entities/urn:ngsi-ld:Store:001` のような具体的な本番パスが、`DEFAULT_WEIGHT` にフォールバックするのではなく、`GET /v2/entities/{id}` の重みに正しく解決されることを意味します (#1521)。

### バースト許容量

各プランには、短期間の突然のトラフィックスパイクに対処するためのバースト許容量があります。これにより、一時的に制限を超えることが可能になります。

このバースト許容量は、常にレート制限の事実上のソフトリミットでした — *拒否*の境界は、名目上の制限だけでなく `perMinute/perHour/perDay + burstAllowance` です。#1571 で変更されたのは**可観測性**のみです。バースト許容量の範囲内にありながら名目上の制限を超えることが、`X-Quota-Soft-Exceeded` レスポンスヘッダーを介して表面化されるようになりました。以下の [ソフトリミット (グレースバンド)](#soft-limits-grace-band-1571) を参照してください。

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

レート制限を超えた場合(つまり、単なる公称制限ではなく、バースト込みの上限を超えた場合 — [ソフトリミット(グレースバンド)](#soft-limits-grace-band-1571) を参照):


* **HTTP ステータスコード**: `429 Too Many Requests`
  
* **Retry-After ヘッダー**: 次のリクエストが許可されるまでの秒数
  
* **エラーメッセージ**: `{"error": "TooManyRequests", "description": "Rate limit exceeded"}`

### Public (Unauthenticated) Endpoint Rate Limit (#1075)

認証なしで到達可能な Public エンドポイントは、テナントごとの `QUOTAS.PLANS` とは独立した IP ベースの固定ウィンドウカウンターによって保護されています。これにより、OAuth `client_id+secret` のブルートフォース攻撃や重い JSON 生成 (`/openapi.json` など) を介した DoS をブロックします。

| Category                    | Endpoints                                                                                                                                       | Per minute | Per hour | Per day | Burst |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------: | -------: | ------: | ----: |
| `metadata`                  | `/openapi.json`, `/api.json`, `/tools.json`, `/llms.txt`, `/.well-known/ai-plugin.json`, `/.well-known/agent-card.json`, `/.well-known/ngsi-ld` |         30 |      300 |   1,000 |    10 |
| `oauth` (per IP)            | `/oauth/token` (`grant_type=api_key` **以外**)                                                                                                    |         20 |      100 |     500 |     5 |
| `oauth` (per `client_id`)   | 同上                                                                                                                                              |         10 |       60 |     200 |     2 |
| `apiKeyExchange`            | `/auth/nonce`, `/oauth/token` (`grant_type=api_key`)                                                                                            |        600 |    6,000 |  60,000 |    50 |
| `auth`                      | `/auth/refresh`                                                                                                                                 |        300 |    3,000 |  30,000 |    50 |
| `publicDereference` (#3199) | `GET /vocab/:tenantId/:term`, `GET /ngsi-ld/v1/jsonldContexts/:contextId`                                                                       |        120 |    2,000 |  20,000 |    20 |

`publicDereference` は `metadata` とは別のバケットなので、フェデレーションピアや RDF クローラーによる大量のボキャブラリ / `@context` の逆参照が 30/分 の metadata 上限に影響しません。日次クォータは意図的にサブリニア (`perDay < perHour × 24`、`auth` / `apiKeyExchange` と同じ比率ファミリー) に設定されています。目的は DB 負荷の軽減のみであり、存在確認オラクルの制御はレート制限の対象外です (同じ情報は既に認証なしの `jsonldContexts` を介して到達可能です)。

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

`authConfig.jwtExpiresIn` の既定は `'1h'` なので 1 セッション = 1 時間に 1 消費。旧値では **1 つの出口 IP の背後で維持できるユーザーセッションは約 205**(社員 300 人のオフィスが 1 つの NAT からアプリを使うだけで詰まる)。3,000/時 へ引き上げ、**約 3,050 セッション/時/IP**(`apiKeyExchange` の実効 3,025 と同じ桁)にした。

`/auth/login` はこの枠の対象外で `LoginProtectionService` が別途保護する。あちらは**推測可能なパスワード**が相手なので、厳しい制限のままが正しい。

Notes:


* `/auth/login` はこの制限の対象**外**。`LoginProtectionService` により保護されています (email + IP ベースの段階的ロックアウト)。
  
* `/health`、`/health/live`、`/health/ready`、`/version` はこの制限の対象**外**です (ヘルスチェックポーリング用)。
  
* バケットストア (DynamoDB / MongoDB) が利用不可の場合、リクエストは許可されます。インフラストラクチャエラー時にパブリックサーフェスをオフラインにしないよう、フェイルクローズしません。
  
* デフォルト値は `src/config/defaults.ts` の `PUBLIC_RATE_LIMIT` に集約されています。
  
* 上表の Lambda スロットル (HTTP 500) はこのレート制限とは**別の壁**で、予約同時実行数 (`ControlPlaneReservedConcurrency`) の話。カテゴリ分離では直らない。

## テナント毎の同時実行数制限 (#1510 / Epic #1485)

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

クォータは 4 種類のリソースに対して設定されています：


1. **Entities** - NGSIv2/NGSI-LD エンティティの総数
   
2. **Subscriptions** - アクティブなサブスクリプションの総数
   
3. **Registrations** - コンテキストソース登録の総数
   
4. **Temporal data points** - 時系列データポイントの総数

### Temporal Data Point ごとの BSON サイズ上限 (#2513)

上記のストレージクォータは**ドキュメント**数をカウントし、バイト数ではありません。独立して、各 temporal データポイント(1 つの MongoDB ドキュメント)は、`TEMPORAL.MAX_DATA_POINT_BSON_BYTES`(**64 KiB**、全プラン)に制限され、挿入直前(暗号化および `location` / `expiresAt` などの派生フィールドの後)に構築されたドキュメントに対して `BSON.calculateObjectSize` で測定されます。これは受付時のガードであり、テナント全体のバイト予算ではありません(バイト予算は #1559 を待っています)。

**エントリポイントごとのリジェクト形式:**

| Entry                                                                      | HTTP status / type                                                                                                                                                                                    |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single HTTP write (`POST /temporal/entities`, `…/attrs`, `PATCH` instance) | **413** `RequestEntityTooLarge`                                                                                                                                                                       |
| Batch (`POST /temporal/entityOperations/create` / `upsert`)                | **207** with per-entity error typed as `RequestEntityTooLarge` (same type URI as single-write 413; #2544)                                                                                             |
| MCP (`/mcp`) / A2A (`/a2a`)                                                | **HTTP 200**. MCP returns a tool result with `isError: true`; A2A returns an error message. The size-exceeded text appears in that payload, but neither path exposes `errorCode` (do not assume 413). |

**メトリクス:** この上限を超えると、`recordQuotaViolation('requestSize')` を介して `requestSizeExceeded` がインクリメントされます。このカウンターは**粒度が混在**しています — HTTP ボディサイズのリジェクトは**リクエストごと**ですが、temporal のデータポイントごとのリジェクトは**データポイントごと**です。`addAttributeInstances` / マルチポイント構築の場合、バッチが失敗する前にすべての過大なドキュメントが測定されるため、1 回の呼び出しで N 個の過大なポイントがあると、カウンターが **N** 回インクリメントされます(その後、最初のサイズエラーが再スローされ、何も挿入されません)。

**暗号化テナント:** 測定されるドキュメントは**保存**形式です。エンベロープ暗号化により、`value` が base64 暗号文フィールドに置き換えられます(\~1.33× 拡張)。そのため、有効な平文の上限は低くなり、経験則として約 **48 KiB** です。

**レガシーな過大ポイント:** PATCH は完全な保存ドキュメントを再構築し、その**再構築された** BSON サイズが 64 KiB 以下の場合にのみ許可されます。`value` を縮小するのが通常の修正方法ですが、他の削減(たとえば `attrMetadata` のクリア)もカウントされます — 過大な再構築を残す `observedAt` のみの PATCH は依然として 413 を返します。エラーメッセージは、リクエストボディサイズではなく、**保存されたデータポイントサイズ**を参照します。

**カウントとサイズの両方がリジェクトする場合の優先順位**: ハンドラーのカウントベースのストレージクォータチェックが最初に実行されます → **507** `InsufficientStorage`。サイズは挿入時にのみチェックされるため、すでにポイント数を超えているリクエストは BSON ガードに到達しません。

### 事前チェック

ストレージクォータは作成操作の**前に**チェックされます:


* バッチ操作の場合、すべてのエンティティがクォータ内に収まる場合にのみ実行が進行します
  
* 1 つでもクォータを超える場合、操作全体が拒否されます(all-or-nothing)

#### エンティティ数の許可には、`countDocuments` ではなく近似カウンタが使用されます(#3155)

ENTERPRISE スケールの `maxEntities`(#3141 以降は 250M)では、共有 `entities` コレクションに対するライブ `countDocuments` は 3s のインタラクティブ `maxTimeMS` 内で完了できません — `docs/PERFORMANCE_ASSESSMENT.md` のカウントラダーでは、10M マッチドキュメントから `MaxTimeMSExpired` が測定され、関係はほぼ線形です(インデックス形状ではスキャンを回避できません; 250M への外挿は \~75–95s です)。
そのスケールでのリクエストごとの `countDocuments` は、テナントが実際に制限に近いかどうかに関係なく、大規模テナントのすべての書き込みを 503 で失敗クローズさせます。

エンティティ許可(`StorageQuotaRepository.getEntityCount`)は、代わりにテナントごとの近似カウンタ(`entityCounters` コレクション、`_id` = テナント名)を読み取ります。これは段階的に維持されます。作成パス(`create`、`batchCreate`、`batchUpsert`、`batchReplace`)は、書き込み前にカウンタに意図された数を**予約**し、後で実際に作成された数に**決済**します(#3669)。
**アトミック予約パス**(ウォームカウンタ)では、同時作成がグレース上限をオーバーシュートすることはできません。カウンタシードが失敗した場合、許可は**非アトミック**な `countDocuments` チェック(`reserved = 0`)にフォールバックします; そのフォールバックはライターをシリアライズ**しない**ため、同時作成が一時的に上限を超える可能性があります(#3669 以前と同じ失敗オープン幅)。実行中の予約は別の `reserved` フィールドで追跡されます; `reservedAt` は予約ウェーブの開始を記録します(すべての `tryReserve` ではなく、`reserved` が 0 から正になる場合のみ設定)。毎時スイーパーは、`reserved > 0` かつそのウェーブ開始が `QUOTAS.ENTITY_RESERVATION_STALE_MS` より新しい間は調整を**スキップ**します。ウェーブがウィンドウより古くなった後でも、スイーパーは `countDocuments` を実行し、`count` を `max(baseline.count, actual + reserved)` に CAS 更新しますが、`reserved` を**クリアしません**。これにより、継続的な作成が毎時ドリフト補正を枯渇させることはできません; リークした `reserved` 自体の再利用はここではスコープ外です(予約ごとの台帳ではありません — #3669 設計で拒否)。削除パス(ハード `delete` / `deleteMany` / `deleteDuplicates`)は、実際の MongoDB `deletedCount` で `$inc` します。部分的な `ordered:false` バッチ失敗は、実際に作成されたサイズに決済されます。予約が実行中の間、`usage.entities`(管理クォータ情報)には予約されたスロットが一時的に含まれる場合があります。
TTL ベースの物理的有効期限(MongoDB のネイティブ TTL モニター `idx_entity_ttl` 上)には、アプリケーションフックがなく、リアルタイムでデクリメント**されません**; これはカウンタを上向きにドリフトさせるだけです(過剰カウント)。これは許可の失敗クローズ方向であり(テナントがクォータをすり抜けることは決して許さない)。

コールドテナント(まだカウンタドキュメントがない — 例: この機能展開直後の既存テナント)は、元の `countDocuments` パスに一度フォールバックし、結果から遅延してカウンタをシードするため、テナントごとの最初の許可チェックのみがフルスキャンコストを支払います。ドリフト(TTL 有効期限と見逃されたエッジケースから)は、`QuotaMonitoringSweeper`(`rate(1 hour)`)によって修正されます。これは、クライアントから見えるリクエストパスの外で実行されるため、はるかに大きな `maxTimeMS`(`QUOTAS.ENTITY_COUNTER_RECONCILE_MAX_TIME_MS`、4 分)で再カウントし、カウンタを権威ある値に `$set` します(**新しい**予約が実行中の場合のみスキップ)。

使用状況表示(`getStorageUsage`、管理クォータ情報エンドポイントと同じスイーパーで使用)は、同じカウンタ認識パスを通じてエンティティ**と**時系列データポイントを読み取ります — サブスクリプション/レジストレーション(小さな上限、≤2000/≤1000)のみが、このパスで直接 `countDocuments` を使用します。[時系列データポイントクォータ](#temporal-data-point-quota-and-entity-dual-write-2508)を参照してください。

### レスポンスヘッダー

`X-Storage-Quota-*` レスポンスヘッダーは**実装されていません**。ヘッダービルダー(`buildStorageQuotaHeaders`)は未使用のコードとしてのみ存在し、削除されました(#2604)。
現在の使用状況と制限は、NGSIv2 / NGSI-LD / Catalog レスポンスヘッダーからではなく、[管理 API](#management-api)(`GET /admin/tenants/{tenantId}/quotas`)から利用できます。

レスポンスヘッダーが後で接続される場合、それは公開 API コントラクト変更であり、明示的な設計決定が必要です(使用状況カウントがタイムアウトした場合の失敗クローズと失敗オープンを含む)。

### ストレージクォータ超過時の動作

ストレージクォータは**ソフトリミット**です(#1571): プランの公称制限を超える使用は、拒否される前にグレース上限まで許可されます。2 層モデルについては、以下の[ソフトリミット(グレースバンド)](#soft-limits-grace-band-1571)を参照してください。
グレース上限を超えた使用のみが拒否されます:


* **HTTP ステータスコード**: `507 Insufficient Storage`
  
* **エラーメッセージ**: リソースタイプ、現在の使用状況、プランの公称制限、実際に適用されたグレース上限が含まれます
  
* **例**: `{"error": "InsufficientStorage", "description": "Storage quota exceeded for entities. Current: 12000, Limit: 10000 (soft limit; grace ceiling 12000), Requested: 1", "details": {"resourceType": "entities", "current": 12000, "limit": 10000}}`
  — `details.limit` は常にプランの**公称**制限であり、グレース上限ではないことに注意してください; 上限はメッセージテキストにのみ表示されます。

### Temporal データポイントクォータと Entity デュアルライト (#2508)

`maxTemporalDataPoints` は Temporal Evolution インスタンスに上限を設けます。`TEMPORAL_ENTITY_DUAL_WRITE=true` の場合、Entity API の書き込みもこのクォータを消費します。オーバーフロー時でも **Entity の書き込みは成功します** (2xx)。temporal への追記のみがドロップされ、warn ログと `recordQuotaViolation('storageQuotaDropped')` が記録されます。これは `storageQuotaExceeded` (507 拒否) とは別にカウントされます。上限に達した後は、履歴にギャップが生じます。Entity API のステータスコードではなく、クォータメトリクス / アラートを監視してください。長期稼働のデプロイメントでは `TEMPORAL_DATA_RETENTION_DAYS` (TTL) との併用を推奨します。

**バッチデュアルライト承認 (#2549):** デュアルライトを遅延させる Entity のバッチ書き込み (`entityOperations/update`・`merge`、MCP `replace`、および既存の create/upsert/bulk-update バッチパス) について、temporal クォータはバッチ内の属性ポイントの合計で **一度だけ** チェックされます (`maybeRecordTemporalEvolutionBatch`)。その単一の承認が失敗した場合 (クォータ超過または count の `maxTimeMS` 超過)、**バッチ全体のデュアルライトがドロップされます** — 同じリクエスト内の前方の Entity に対する部分的な temporal 追記は行われません。(Entity ごとの Entity 書き込みは引き続き成功します。) #2549 以前は、`entityOperations/update`・`merge` と MCP `replace` は Entity ごとに承認されていたため、残りクォータが尽きるまで同じリクエスト内の前方の Entity は履歴を追記できました。Create/upsert バッチパスは既に全成功または全失敗の承認契約を使用していました。#2549 は遅延パスをこれに合わせます。

temporal ポイントの承認 (`getTemporalDataPointCountForAdmission`) は、`temporalCounters` (#3908 / #3250) 内の **テナントごとの近似カウンター** を使用します。これは `entityCounters` (#3155) と同じ形式です。ウォームリードは O(1) です。コールドミスの場合、パスはインタラクティブな `maxTimeMS` (3s) を持つ `countDocuments` にフォールバックし、カウンターをシードし、タイムアウト時にはテナントごとのリコンサイラー (EventBridge、`dimension: temporalDataPoints`) を起動します。Insert / delete パスは同期的にカウンターを `$inc` します (ベストエフォート)。`modifyAttributeInstance` はしません (ネットゼロ)。`reserve` / `settle` は temporal には **使用されません** (Entity とは異なり、#3669)。

以前のプロセスローカル TTL キャッシュ (#3229) は削除されました。これはコンテナ間のスタンピードを防ぐことができず、大規模テナントではカウントが 3s を超えると毎回の書き込みでタイムアウトしていました。本番環境の Atlas (2026 年 9 月) での計測では、そのカウントは **平均 232 ms** (\~40k バケット) でした。3s を超える成長は #3908 が Sendai で観測したものです。

1 時間ごとの `QuotaMonitoringSweeper` は、短い予算 (`QUOTAS.TEMPORAL_COUNTER_RECONCILE_MAX_TIME_MS`、60s) で temporal カウンターを調整します。タイムアウト時には、より長い `ENTITY_COUNTER_RECONCILE_MAX_TIME_MS` (240s) を使用する同じテナントごとのリコンサイラーを起動します。`countDocuments` に `$limit` を **追加しないでください** — MongoDB 8.0 ではバケットレベルのカウント最適化が無効になります (#2508 SECREVIEW4)。

インタラクティブなコールドカウントがタイムアウトした場合 (`MaxTimeMSExpired`)、HTTP 承認は **その 1 回のチェックをスキップして書き込みを通します** (fail-open、#3910 / #3908)。`recordQuotaViolation('storageQuotaCheckTimedOut')` を記録し、テナントとリソースタイプを含む warning をログに記録します。タイムアウト後、同じテナントとリソースタイプはその Lambda コンテナ内で `QUOTAS.ADMISSION_COUNT_TIMEOUT_SKIP_MS` (60 秒) の間再カウントされません。他のカウント失敗 (例: 接続エラー) は依然として **503** で拒否します (fail-closed、#2602 / #2603)。使用状況表示 (`getStorageUsage`) は同じカウンター認識パスを使用します。そこでのコールドタイムアウトは fail-closed のまま (admin quotas / monitoring → 503)、部分的な使用状況オブジェクトは返しません。テナントクリーンアップは `entityCounters` と `temporalCounters` の両方を削除します (`_id` = テナント名)。

レート制限 (上記) は **インバウンド** API リクエストを制限します。#1544 まで、**アウトバウンド** 通知のファンアウトを制限するディメンションはありませんでした — 少数の書き込みリクエストが、多数のマッチする Entity を持つサブスクリプション、または多数のサブスクリプションをトリガーし、プランに紐付く上限なしで無制限の数の HTTP/MQTT 通知配信にファンアウトする可能性がありました。

> **これらの値はエンジニアリングのデフォルトであり、価格設定の調整の対象です** (#1544 の裁可待ち、2026-08-15)。意図的に顧客向けの `docs/customer/PLAN_QUOTAS.md` には **まだ公開されていません** — #1544 では、ENTERPRISE のサブスクリプション制限の再設計と合わせて数値を確定する必要があると述べています。その批准前に定数を変更しても、顧客に対する可視的なコミットメント変更にはなりません。


* **新しいクォータディメンション**: `rateLimit.maxNotificationsPerDay` (`QUOTAS.PLANS[*]`、`src/config/defaults.ts`) — FREE=50,000 / STANDARD=800,000 / PREMIUM=1,500,000 / ENTERPRISE=3,000,000 (各プランの `rateLimit.perDay` と同じ値。1 回の通知配信のコスト — EventBridge + Lambda ×3 + SQS + webhook 宛先への egress + CloudWatch Logs — は 1 回のインバウンド書き込みリクエストと同じオーダーのため。この制限の意図は、通知駆動のコストがインバウンドリクエスト駆動のコストを上回らないようにすることです)。`customQuotas.rateLimit.maxNotificationsPerDay` で上書き可能 (非負、最大 100,000,000 — [Configure Custom Quotas](#configure-custom-quotas) を参照)。`0` は明示的にそのテナントのすべての通知配信を停止します。
  
* **ウィンドウ**: UTC カレンダー日 (`YYYY-MM-DD`)、MongoDB の日次バケット (`notificationCounters`、コントロールプレーン側) で追跡され、7 日間の TTL があります。
  
* **消費ポイント**: 送信直前、通知ファンアウトパス上 (トリガーする書き込み時ではない)。**プロセス内リトライ** (`retryWithBackoff`) は予算を 1 回消費します。ゲートがリトライループの外側にあるためです。**Lambda パス上の SQS 再配信は再度消費します** — `deliverNotification` はすべてのプロセス内リトライが失敗した後に throw し、それが SQS に再配信させ、再配信されたメッセージは再度ゲートに入ります。at-least-once キューをまたいで exactly-once のアカウンティングは達成できません。カウンターは配信の上限であり、個別通知の下限です。
  カウンターは **ゲートを通過して実際にディスパッチされた** 通知に対してのみ進みます — クォータが拒否した通知は決してカウントされないため、保存された値は制限を超えてインフレートすることはなく、コスト見積もりに直接使用できます。その後失敗したディスパッチも引き続きカウントされます。ファンアウトコスト (Lambda 実行時間、アウトバウンド試行) が既に発生しているためです。
  **デッドライン遅延 (#3925 / #3947)**: notification-sender は `BatchSize: 1` を使用します (1 invocation = 1 notification。同じサブスクリプションは FIFO グループでシリアライズ)。Lambda の残り時間が 1 回の試行予算 (`NOTIFICATION.DEADLINE.ATTEMPT_BUDGET_MS`) 未満の場合、sender は試行を開始せず、partial batch failure を介してレコードを返します

再配信。クォータ、送信スロット、およびサブスクリプションステータスは、これらの延期されたレコードに対して**変更されません**。30秒のタイムアウト失敗は SQS 再配信(Visibility 120秒)によって再試行され、予算がなくなった場合のプロセス内での追加試行は行われません。3回の受信で DLQ に送られます(高速な一時的失敗では最大4回のプロセス内試行が行われます)。

* **超過時の動作**: 通知は**ドロップ**され、警告がログに記録され(`Notification dropped: daily notification quota exceeded`)、メトリック(`notificationQuotaExceeded`)が発行されます。**サブスクリプション自体は無効化されません** — クォータ枯渇時の無効化は、コストガードレールとして意図されているものに対して大きな可用性への影響範囲になります。通知配信はトリガー API リクエストの外部で行われるため、この拒否に対する HTTP レスポンスはありません。
  
* **fail-open**: カウンターストアが利用できない場合、通知は許可されます — これはレート制限(#1492)で既に行われた選択と同じで、インフラストラクチャの一時的な障害で通知配信をオフラインにすることを避けるためです。
  
* **可観測性**: `GET /admin/tenants/{tenantId}/quotas` の `currentUsage` には、`rateLimit` と `storage` に加えて3番目の独立したディメンションが含まれます:
  `notifications.day = {used, limit, remaining, usagePercent, date}`。
  
* **スコープ**: 通常のサブスクリプション通知(HTTP/MQTT、Lambda およびスタンドアロンパス)**およびコンテキストソースサブスクリプション通知**(`csource-notification.service.ts`、これは独自の `fetch` を使用して登録変更を外部エンドポイントに展開します)の両方。後者を除外すると、`csourceSubscription` が同じ制限の無制限のバイパスになります。
  
* **既知の制限**: この上限は HTTP/MQTT 経由のサブスクリプション通知配信にのみ適用されます。WebSocket/SSE イベント配信は別のメカニズムであり、この制限の対象ではありません。

### テナント毎の通知並行性(#2269 / #1544 AC3)

遅い webhook 宛先が**他のテナント**への通知配信を遅延させてはなりません。`NOTIFICATION.MAX_CONCURRENT` はプロセス / Lambda 呼び出し制限であり、**テナントディメンションはありません**。第二の制御プレーンがなければ、1つのテナントの遅い HTTPS ラウンドトリップがすべての送信中スロットを占有する可能性があります。

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


* **名前空間の分離**: 通知スロットは `#notification-concurrency` を使用し、API パスの `#concurrency`(#1510)とは区別されます。一方を埋めることで他方を枯渇させてはなりません。
  
* **順序**: 並行性スロットを**先に**取得してから、日次通知クォータを消費します。これにより、並行性のドロップが日次カウンターを膨らませることがないようにします。
  
* **パス**: Lambda の `notifier.ts`、スタンドアロンの `notification-delivery.ts`、および csource の `csource-notification.service.ts` はすべて `acquireNotificationSendSlot` / `withNotificationSendSlot` を共有します。
  
* **リース**: `NOTIFICATION.CONCURRENCY.LEASE_MS`(150秒)は `TIMEOUT_MS` × 再試行 + バックオフをカバーするため、送信中の送信が奪われることはありません。
  
* ストア障害時の **fail-open**(#1510 / 日次通知クォータと同じ)。
  
* 顧客向けの **`PLAN_QUOTAS.md` にはまだ含まれていません** — 公平性制御であり、販売されたクォータ行ではありません(`defaults.ts` の `maxNotificationsPerDay` と同じ例外注記)。

`TIMEOUT_MS` 自体はこの変更では 30000 ms のままです。それを下げることは別の互換性判断です(フォローアップ)。

### 非同期ドロップカウンター（`currentUsage.asyncDrops`

）（#3835）

クォータを超過した API リクエストは HTTP ステータス（`429` / `413` / `507`）を受け取ります。
成功したリクエストの**後**に実行される処理（通知、ルールアクション、エンティティ変更の publish）には呼び出し元がありません — 従来これらのパスは警告ログとプロセス全体のメトリックのみを書き込んでいました。ステージング環境では、STANDARD テナントが並行処理により数百の通知を失っていましたが、テナントから見えるカウントはありませんでした。

`GET /admin/tenants/{tenantId}/quotas` に加算式の `currentUsage.asyncDrops` が含まれるようになりました:

| Field                       | Meaning                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| `retentionDays`             | Same window as notification daily counters (`QUOTAS.NOTIFICATION_USAGE.TTL_DAYS`, 7 UTC days) |
| `date`                      | Current UTC date (`YYYY-MM-DD`)                                                               |
| `reasons[].reason`          | Drop reason (see table below)                                                                 |
| `reasons[].today` / `total` | Counts for today and over the retention window                                                |
| `reasons[].lastOccurredAt`  | Last drop timestamp (ISO-8601), or `null`                                                     |
| `reasons[].days[]`          | Per-UTC-day `{date, count}` inside the retention window                                       |

| `reason`                      | When it increments                                                           |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `notificationConcurrency`     | Per-tenant concurrent notification send slots exhausted (#2269)              |
| `notificationDaily`           | Daily notification fan-out quota (#1544)                                     |
| `notificationPayloadTooLarge` | Expanded `httpCustom` notification body exceeds size budget                  |
| `ruleActionQuota`             | Rule `createEntity` / `appendToTemporal` hit entity / temporal / BSON limits |
| `eventTooLarge`               | Entity-change event degraded to fit PutEvents budget (#3833)                 |

記録は**ベストエフォート**で、短いタイムアウト（`QUOTAS.ASYNC_DROPS.RECORD_TIMEOUT_MS`、300 ms）が設定されています。これにより、コントロールプレーンへの書き込みが遅い場合でも、ドロップ判定後に Lambda がフリーズすることがありません。
記録の失敗がドロップパスをブロックすることはありません。カウンターはコントロールプレーンの Mongo（`asyncDropCounters`）に保存され、`notificationCounters` と同じ構造です。これらは `GET .../usage` の履歴スナップショットには**含まれません**（これらは rateLimit / storage の時系列のまま）。

クォータの**制限**自体は変更されていません。この機能はサイレントドロップを可視化するだけです。

#### アラート（`alertThresholds.asyncDrops*`

）（#3869）

`PUT /admin/tenants/{id}/quotas` の `alertThresholds` に **絶対件数**の閾値を additive で追加する
（rateLimit / storage の利用率 `%` とは単位が違う — 破棄には「上限」が無く、件数そのものが信号）:

| Field                | Default | Meaning                                                                              |
| -------------------- | ------- | ------------------------------------------------------------------------------------ |
| `asyncDropsWarning`  | `1`     | 当日 (UTC) の全 reason 合計 ≥ この値で warning。Zod `min(1)`（0 は拒否）                             |
| `asyncDropsCritical` | `100`   | 同上で critical（critical 優先、warning は出さない）。`asyncDropsWarning <= asyncDropsCritical` 必須 |

判定は hourly sweeper（`QuotaMonitoringService` → `MonitoringService.checkAndSendAlerts`）が
既存の webhook / 1 時間デバウンス経路で送る。`alertType` は `asyncDrops`、`resourceType` は `today`。

#### サブスクリプション `lastFailure`

（#3870）

通知の同時・日次・httpCustom payload 超過で **webhook 未試行**の破棄が起きたとき、対象購読の
`notification.lastFailure` / `notification.lastFailureReason`（値は `asyncDrop:<reason>`）だけを更新する。


* **触らない**: `notification.status` / `timesFailure` / `failingSince` / auto-pause（#3080）
  
* **間引き**: 購読あたり `QUOTAS.ASYNC_DROPS.SUBSCRIPTION_LAST_FAILURE_THROTTLE_MS`（既定 60s）に 1 回。
  プロセス内 Map は **await 前に先行 set**（書き込み中の同時破棄が repository まで通らない）。
  repository 例外時のみ Map を巻き戻す。timeout 勝ちでは set を維持。Mongo 条件付き update も併用。
  記録は `RECORD_TIMEOUT_MS` 付き best-effort
  
* **servicePath**: 購読ドキュメントの `servicePath` を exact scope に使う（イベント側と食い違うと無言欠落）
  
* **ETSI 解釈**: GS CIM 009 の `notification.status` は配送試行の結果とみなし、未試行のクォータ破棄は
  `failed` にしない（GeonicDB 独自拡張。docs / OpenAPI に明記）
  
* CSource 購読も同契約

Console UI: geonicdb-console#286。

## ソフトリミット (グレースバンド) (#1571)

> **GeonicDB 拡張機能。** これは NGSIv2/NGSI-LD によって義務付けられているものではありません — これは GeonicDB が `docs/customer/PLAN_QUOTAS.md` §5 (「上限は安定運用の目安であり、超過した瞬間にご利用が停止するものではありません」) で行ったコミットメントを果たす方法です。

ストレージクォータとレート制限は、単一のハードカットオフではなく、**2 段階** のアドミッションチェックを適用します:

| Stage      | Condition                       | Behavior                                                                           |
| ---------- | ------------------------------- | ---------------------------------------------------------------------------------- |
| Normal     | usage ≤ nominal limit           | Admitted. No signal.                                                               |
| Grace band | nominal limit < usage ≤ ceiling | **Admitted.** `X-Quota-Soft-Exceeded` response header + warn log + metrics counter |
| Rejected   | usage > ceiling                 | Rejected, same as before (`507` / `429`)                                           |

**グレースバンドは無制限ではありません。** ハード上限は依然として強制されるため、これは #1485 (テナントごとの同時実行数 / DB 過負荷ブレーカー) の DB 保護保証や #1454 の結果サイズ強化を損なうものではありません — グレースバンドは短期間のバーストを吸収するものであり、持続的なクォータ超過使用を許可するものではありません。

### 次元ごとに上限がどのように計算されるか


* **ストレージ (entities / subscriptions / registrations / temporalDataPoints)**: 上限は `Math.floor(nominal limit × QUOTAS.SOFT_LIMIT.STORAGE_GRACE_MULTIPLIER)` です (`src/config/defaults.ts`、multiplier = `1.2`、つまり 20% のグレース)。結果は floor されるため、より小さい公称制限の場合、グレースバンドは絶対的な意味で縮小します — 最小の実際のプラン値は T0 の `maxSubscriptions=10` で、これでも非ゼロの上限 (`12`) が得られます。人為的に小さい制限 (テストなど) のみが、グレースバンドを完全に floor することができます。`StorageQuotaService.checkQuota()` (`src/core/quotas/storage/storage-quota.service.ts`) で強制されます。
  
* **レート制限 (minute/hour/day)**: **拒否境界は移動していません**。[Burst Allowance](#burst-allowance) の下で述べたように、`perMinute/perHour/perDay + burstAllowance` は常に有効な上限でした — グレースバンド (公称制限を超えているが、まだバースト許容範囲内) は以前から存在していましたが、観測可能ではありませんでした。#1571 は、その既存のバンドへの可視性を追加するだけです。3 つのウィンドウすべてが評価され、グレースバンド内にある最も細かい粒度のものが報告されます (`resolveSoftExceededWindow()` in `src/core/quotas/rate-limit/rate-limit.service.ts`)。
  
* **テナントごとの同時実行数は対象外であり、変更されていません。** `docs/customer/PLAN_QUOTAS.md` §4 は、同時実行数を「超過分は一時的に待機・再試行の対象になります」として既に説明しており、既存の `429 + Retry-After` 動作 (`QUOTAS.CONCURRENCY.RETRY_AFTER_SECONDS`、[Per-Tenant Concurrency Limit](#per-tenant-concurrency-limit-1510--epic-1485) を参照) が既にこれを満たしています。これをグレースバンドに拡大すると、#1485 のために導入された DoS 強化が損なわれます。

### `X-Quota-Soft-Exceeded` レスポンスヘッダー

グレースバンド内で許可されたリクエストのレスポンスに添付されます。値は、公称制限を超えていた次元のカンマ区切りリストです:

```http
# only storage entities dimension is over its nominal limit
X-Quota-Soft-Exceeded: entities

# both the per-minute rate limit and the subscriptions dimension are over
X-Quota-Soft-Exceeded: rateLimit.minute,subscriptions
```


* ストレージ次元はリソースタイプ名を使用します: `entities`、`subscriptions`、`registrations`、`temporalDataPoints`。
  
* レート制限次元にはプレフィックスが付きます: `rateLimit.minute`、`rateLimit.hour`、`rateLimit.day`。
  
* **拒否されたリクエストはこのヘッダーを持ちません** — 拒否はヘッダーが組み立てられる前に `507`/`429` エラーパスにショートサーキットするため、このヘッダーは公称制限を超えたにもかかわらず `2xx` レスポンスにのみ表示されます。
  
* ヘッダー名自体は定数 `QUOTAS.SOFT_LIMIT.SOFT_EXCEEDED_HEADER` (`src/config/defaults.ts`) です。

### 持続的なクォータ超過使用のための運用シグナル

単一のグレースバンドアドミッションは予想され、無害です。このヘッダーを *持続的に* 持つテナントは、プランアップグレードまたはカスタムクォータ調整の候補です。これを一度限りのバーストと区別できるようにするために:


* すべてのグレースバンドアドミッションは `warn` レベルのログ行を出力します (ストレージ: `storage-quota.service.ts`、レート制限: `handlers/api/index.ts`)。
  
* すべてのグレースバンドアドミッションは、`quotas.rateLimitSoftExceeded` / `quotas.storageQuotaSoftExceeded` (`src/core/metrics/metrics.service.ts`) でもカウントされます。これらは既存の拒否カウンター (`rateLimitExceeded` / `storageQuotaExceeded`) とは **意図的に分離** されています — これらをマージすると、「実際に拒否されたリクエストの数」と「グレースバンド内にあっただけのリクエストの数」を区別することができなくなります。

持続的なパターンが *いつ* プランアップグレードの会話を必要とするかを決定することは、運用/営業プロセスであり、このセクションが規定するものではありません。

## モニタリングとアラート

### レート制限バケットシャーディング (#3115)

高 rps テナントは以前、すべての `UpdateItem` を単一の DynamoDB アイテム (`pk={tenant}#unified`、`sk=dayTs`) に集中させていました。パーティションスループット (\~1,000 WCU/s) に加えて `MAX_SLOW_PATH_RETRY=1` により、`ThrottlingException` / 競合の枯渇が発生し、PREMIUM/ENTERPRISE の公開目標を大幅に下回る状態で `RateLimitCheckTransientFailure` **フェイルオープン** になりました (ステージング環境で closed-bearer \~800 rps クラスで測定)。

**現在の設計** (`QUOTAS.RATE_LIMIT_SHARD_COUNT`、デフォルト **8**):


* 有効なシャード数: `min(configured N, floor(min(minute,hour,day) / weightHeadroom))`。テナントバケットは `weightHeadroom = REPRESENTATIVE_WEIGHT × getMaxBatchSize(plan)` を使用し (#3659; FREE での最大バッチ重み増加を回避)、パブリックバケットはデフォルトの `REPRESENTATIVE_WEIGHT` を維持します。小規模なカスタム / E2E クォータは単一パーティションに留まり (重み増加と合計のミスマッチを回避)、`N × floor(global/N) ≤ global` となります。`weightHeadroom` の変更 (例: FREE N 8→7) を日中に行うと、元の #3115 シャード展開と同じクラスの会計のずれが発生します — 日次ウィンドウキーは再マッピングされません; オペレーターはその日の残り期間に一度だけ残量のソフトリセットが発生することを想定する必要があります
  
* 書き込みキー: `pk={tenant}#unified#{shardId}` (`shardId` ∈ `0..N-1`)、ランダムスタート + シャードごとの拒否時に最大 `RATE_LIMIT_SHARD_PROBES` 回の **追加** プローブ (合計試行回数 = `1 + PROBES`、N にクランプ)
  
* シャードごとの名目上限: `floor(global/N)` なので `N × perShard ≤ global`; 有効な書き込み上限は `min(global, max(floor(global/N), weight))` なので、大きな重みでも 1 つのシャードに収まります
  
* `getRateLimitInfo` はすべてのシャード **に加えて** レガシーの `pk={tenant}#unified` (読み取り専用; 新しい書き込みはレガシーには触れない) を合計します。**触れられていない (存在しない) シャードはシャードごとの完全な残量としてカウントされます** — それらをスキップすると、まだすべてのシャードに到達していないテナントの残量が過小報告されます
  
* `N > 1` での消費成功は `getInfo` と同じ合計残量を返します (ソフトリミット / ヘッダー精度); `N = 1` は単一バケットの残量を直接返します
  
* **デプロイ / 移行**: レガシー `#unified` の残量は新しいシャードキーに **コピーされません**。デプロイ後、新しい消費は `#unified#{shardId}` のみに触れるため、既存のテナントは事実上、新しいシャードプールから開始します (一時的な **緩和** で日次ウィンドウの残り期間は完全なクォータに向かいます — 無制限の拡張ではなく、プラン制限にクランプされます)。レガシーアイテムは TTL が期限切れになるまで `getInfo` で読み取り可能であり、クランプまで合計残量が一時的に膨らむ可能性があります; オペレーターはデプロイ当日にレート制限会計の一度だけのソフトリセットを想定する必要があります

関連するが別物: テナントごとの同時実行スロットは **同じテーブル** で `pk={tenant}#concurrency#{slot % N}` を使用します (`N = min(CONCURRENCY.SHARD_COUNT, max)`、#3125)。#3125 以前の単一 pk 形式 `pk={tenant}#concurrency` はレガシー専用です (デプロイ後のリース TTL \~35秒)。

### レート制限インフラストラクチャ障害メトリクス (#1419)

レート制限チェックは **フェイルオープン** です: バケットストア (DynamoDB / MongoDB) がエラーになった場合、リクエストはブロックされるのではなく許可されます。この障害モードを観察可能に保つために、すべての抑制されたエラーは CloudWatch Metric Filters に適した構造化された `metric` マーカーでログに記録されます:


* `metric: "RateLimitInfrastructureFailure"` — 自己回復しない **永続的** エラー (`ValidationException`、`SerializationException`、`ResourceNotFoundException`、`AccessDeniedException`; リストは `QUOTAS.RATE_LIMIT_PERMANENT_ERROR_NAMES`、`src/config/defaults.ts` にあります)。これらはコードまたは設定のバグを示しており、修正されるまでレート制限はフリート全体で静かに無効化されます。**このマーカーは高重要度の CloudWatch アラームに接続する必要があります。**
  
* `metric: "RateLimitCheckTransientFailure"` — スロットリング、タイムアウト、およびその他の一時的なストアエラー。

背景: 3 つの連続した DynamoDB 式のバグ (#1385) は、無差別なフェイルオープンキャッチによって何日も隠されていました。分類は `src/core/quotas/rate-limit/rate-limit-failure.ts` にあり、テナントとパブリックのレート制限パスで共有されています。

例外 (#1685): Mongo (スタンドアロン) パスでは、レート制限バケットの原子性は `insertOne` + ユニークインデックス `idx_rate_limit_bucket_unique` に対する重複キー再試行に依存しています — それがないと、重複バケットがレート制限を静かにバイパスします。したがって、インデックスは `MONGODB.CRITICAL_INDEXES` にリストされており、作成に失敗すると、フェイルオープンランタイムパスに移行するのではなく、**フェイルクローズ** (インデックス初期化時に接続が拒否される) になります。

### 使用状況スナップショット

システムは定期的に使用状況スナップショットを DynamoDB に記録します:


* レート制限使用率 (分/時/日)
  
* ストレージリソース使用率
  
* タイムスタンプとテナント情報
  
* 90 日間保持 (TTL)

### アラートしきい値

各テナントには 2 つのアラートレベルがあります:


* **警告**: デフォルトで使用率 80%
  
* **重大**: デフォルトで使用率 95%

### アラート配信

設定された閾値を超えた場合:


1. アラートメッセージがログに記録される
   
2. Webhook URL が設定されている場合、HTTP POST 経由でアラートが送信される
   
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

アプリ層の quota / rate-limit は **fail-open**(バケットストア障害時はリクエストを通す)なので、
DB が過負荷の瞬間ほど防壁が抜ける。これを補うため、**DB に依存しないインフラ層のハード上限**を
`infrastructure/template.yaml` に配線している。1 テナントの重負荷が同時実行 / 接続を通じて
MongoDB を焼き切る爆発半径(2026-07-21 のインシデント: CPU 97-98%、`/auth/login` まで 500)を
構造的に限定するのが狙い。いずれも **opt-in**(未設定=現状挙動)。

### SAM パラメータ

| パラメータ                                         | 既定           | 用途                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ApiReservedConcurrency`                      | `-1`（未設定）    | ApiHandler（データプレーン）Lambda の予約同時実行数。同時実行を N に縛ると DB へ飛ぶ同時クエリが構造的に頭打ちになる（= Apache MaxClients 相当）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `ControlPlaneReservedConcurrency`             | `-1`（未設定）    | ControlPlaneHandler（auth/admin/me/oauth）Lambda の予約同時実行数（#1507）。データプレーンの同時実行飽和から独立して認証を生き残らせる枠。**Atlas 接続上限の較正には使わない**（#3010 / #3122 — 接続予算は `GeonicDB/Atlas` `ConnectionsMax` の実測と、現ティア上限に対する割合 `ConnectionsPercentOfCapMax` の 80% アラームで見る）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `SubscriptionMatcherReservedConcurrency`      | `-1`（未設定）    | **#3439。** SubscriptionMatcher Lambda の予約同時実行数。まとめ書き（仙台の `TransitManagement` は 5 分ごとに 50〜100 件）のたびに matcher が同数だけ同時に起動し、それぞれが primary に新しい TLS 接続を張って、ハンドシェイクの切断とプール待ち 10 秒で一部が失敗していた（2026-10-01 から毎日）。上限は同時に動く実行環境の数を抑えるもので、接続数そのものの上限ではない（環境ごとに接続プールとドライバの監視用接続があり、warm に保たれる保証も無い）。一度に新しく張る接続が約 100 環境分から 10 環境分に減る見込み。処理能力も見積もりで、warm な 1 回が約 35 ms（p50）なら 10 で毎秒 200 件を超える。どちらもデプロイ後に実測で確かめる。小さく保つ（テストで 5〜20 に固定）。上限を超えた非同期イベントは Lambda がキューに保って再試行する（最大 6 時間、その後は DLQ）。滞留はアラーム `geonicdb-<env>-subscription-matcher-event-age`（`AsyncEventAge` 最大が 10 分超）で検知する。staging / production とも `10`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `WsBroadcastReservedConcurrency`              | `-1`（未設定）    | **#3705。** WsBroadcast Lambda の予約同時実行数。v0.24.0 では同時実行が最大 29〜41 だったが、v0.25 で配信前のセッション再検証が MongoDB を引くようになり Duration が約 30 倍に延びて同時実行が 80〜242 まで増え、新規 TLS 接続の殺到で `MongoNetworkError` / `MongoWaitQueueTimeoutError` が出た。上限は実行環境の数を抑えるもので、接続数そのものの上限ではない。上限を超えた非同期イベントは Lambda がキューに保って再試行する（最大 6 時間、その後は DLQ）ので、通常は **WebSocket 通知の遅延**として現れる（処理が追いつかずキューから削除された場合や 6 時間で期限切れになった場合はライブ通知として届かず、DLQ の確認と再処理が要りうる）。滞留はアラーム `geonicdb-<env>-ws-broadcast-event-age`（`AsyncEventAge` 最大が 10 分超）で検知する。staging は matcher と同じ `10`（負荷試験用途で遅延を許容）、production は `20`。本番の 1 分ごとの `ConcurrentExecutions` 最大が 10 を超える分が毎日 264〜417 分あるため。デプロイ後の実測（`AsyncEventAge` / `Throttles` / Atlas Connections）で調整する（テストで 5〜20 に固定）。                                                                                                                                                                                                                                                                                                                                                           |
| `RuleProcessorReservedConcurrency`            | `-1`（未設定）    | **#3705。** RuleProcessor Lambda の予約同時実行数。1 クライアントの一括書き込みでエンティティ変更イベントごとに起動し、staging では同時実行が 17〜28 から 580 まで増えて各々が MongoDB に接続、Atlas が自動スケール上限まで上がった。上限を超えた非同期イベントは Lambda がキューに保って再試行する（最大 6 時間）ため、**ReactiveCore Rules のアクション（webhook / エンティティ書き込み / temporal）が遅れうる**（キューから削除された場合や期限切れの場合は実行されず、DLQ の確認と再処理が要りうる）。滞留はアラーム `geonicdb-<env>-rule-processor-event-age`（`AsyncEventAge` 最大が 10 分超）で検知する。staging は `10`、production は `20`（本番の 1 分ごとの `ConcurrentExecutions` 最大が 10 を超える分が毎日 264〜417 分、流体モデルで上限 10 だと毎日 43〜67 分の滞留、20 なら 3〜4 分）。デプロイ後の実測で調整する（テストで 5〜20 に固定）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `NotificationSenderReservedConcurrency`       | `-1`（未設定）    | **#3931。** NotificationSender Lambda の予約同時実行数。SQS ESM の `ScalingConfig.MaximumConcurrency` も同じ値で結ぶ（予約 `<` MaximumConcurrency だと throttle でバッチが VisibilityTimeout 分戻るだけになり、`maxReceiveCount` 3 で処理ゼロのまま DLQ 行き）。上限は実行環境の数を抑えるもので、接続数そのものの上限ではない。通知キューは FIFO なので実効の並列はアクティブな MessageGroup 数との min になる。`-1` = 両方省略（現状どおり）。0 / 1 は CFN Rule で拒否（0 は全 invoke throttle、1 は ESM 下限 2 未満）。「-1 禁止」Rule は付けない（既存デプロイが更新 fail になる）。staging は `10`、production は測定後の別 PR。ロールバックは値を `-1` に戻して再デプロイ（Reserved と ScalingConfig が同時に外れる）。VisibilityTimeout 120 / LEASE\_MS / deadline は #3925 の領分で変えない。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `RuleProcessorEventRoute`                     | `direct`     | **#3768。** RuleProcessor へエンティティ変更イベントを届ける経路。`direct` = EventBridge からの非同期直接呼び出し（従来）、`sqs` = EventBridge → SQS（`RuleProcessorQueue`）→ Lambda のバッチ、`dual` = 両方の Rule が有効（すべてのイベントが 2 回処理される。切り替えの中継専用）。一括インポートで実行環境と MongoDB 接続がイベント数に比例して増えるのを、キューと `MaximumConcurrency`（`RuleProcessorReservedConcurrency` と同値）で頭打ちにする。2 つの EventBridge Rule は互いに依存が無く CloudFormation が並列に更新するため、`direct` ⇔ `sqs` を 1 回で切り替えると State の反映順は保証されず、両方 DISABLED の数秒にイベントが落ちうる（一致する Rule が無いイベントは EventBridge が捨てる）。欠落させない切り替えは `direct` → `dual` → `sqs`（戻すときは `sqs` → `dual` → `direct`）の 2 段。`sqs` / `dual` では `RuleProcessorReservedConcurrency` を -1 にできない（`MaximumConcurrency` が外れて上限なしになるため、CFN Rule で拒否）。ESM とキューは常に残すので `direct` へ戻しても滞留分は処理される。`sqs` のときはキューの滞留をアラーム `geonicdb-<env>-rule-processor-queue-age`（最古メッセージ 600 秒 × 3 期間）、DLQ への流入を `geonicdb-<env>-rule-processor-dlq-inflow` が検知する。standard キューなので at-least-once で順序は保証されない（直接経路も同じ）。staging.json / production.json とも `sqs`。                                                                                     |
| `RuleProcessorSqsBatchSize`                   | `10`         | **#3768。** `sqs` 経路の BatchSize（1〜100）。11 以上は `RuleProcessorSqsBatchingWindowSeconds` を 1 以上にする（CFN Rule で拒否）。1 件の評価は最大 5 秒（soft watchdog）、関数 Timeout は 60 秒。通常の評価は 1 件あたり数十 ms なので 50 件でも収まるが、全件が watchdog に当たる最悪ケースでは Timeout を超え、締切ガードが未着手分を再配信する（欠落はしないが再配信のたびに受信回数が増え、3 回で DLQ へ送られる）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `RuleProcessorSqsBatchingWindowSeconds`       | `0`          | **#3768。** `sqs` 経路の MaximumBatchingWindowInSeconds（0〜300）。0 ならバッチ待機時間を追加しない（キューのポーリングや滞留による遅延は残る）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `SubscriptionMatcherEventRoute`               | `direct`     | **#3768。** SubscriptionMatcher へイベントを届ける経路。`direct` = EventBridge からの非同期直接呼び出し（従来）、`sqs` = EventBridge → SQS（`SubscriptionMatcherQueue`）→ Lambda のバッチ、`dual` = 両方の Rule が有効（すべてのイベントが 2 回処理される。切り替えの中継専用）。対象はエンティティ変更と RuleNotification（#3786）の両方。`RuleProcessorEventRoute` と同じ理由で、`direct` ⇔ `sqs` を 1 回で切り替えると両方 DISABLED の数秒にイベントが落ちうるため、欠落させない切り替えは `direct` → `dual` → `sqs`（戻すときは逆順）の 2 段。`sqs` / `dual` では `SubscriptionMatcherReservedConcurrency` を -1 にできない（`MaximumConcurrency` が外れて上限なしになるため、CFN Rule で拒否）。0 と 1 も拒否する（0 は全 invoke を throttle、1 は ESM の下限 2 未満）。キューの滞留はアラーム `geonicdb-<env>-subscription-matcher-queue-age`（最古メッセージ 600 秒 × 3 期間）、DLQ への流入は `geonicdb-<env>-subscription-matcher-dlq-inflow` が検知する。standard キューなので at-least-once で順序は保証されない（直接経路も同じ）。Timeout などでバッチ全体が再配信されたときの重複防止は**無条件ではない**: エンティティ変更経路は claim 窓が効く。通知キュー（FIFO）の重複排除は最初の送信から 5 分窓。**RuleNotification 経路は claim しない**ため、最初の送信から 5 分を超えて再配信されると FIFO 窓も外れ、通知が重複しうる。VisibilityTimeout 240 秒は「1 回の再可視化までの待ち」であり、再配信までの総時間を制限しない。staging.json / production.json とも `sqs`。 |
| `SubscriptionMatcherSqsBatchSize`             | `10`         | **#3768。** `sqs` 経路の BatchSize（1〜100）。11 以上は `SubscriptionMatcherSqsBatchingWindowSeconds` を 1 以上にする（CFN Rule で拒否）。1 イベントの fanout は p99 で 24 秒に達しうる（関数 Timeout 30 秒）ので、大きくするときは `subscription-matcher-duration-p99` と DLQ 流入を見る。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `SubscriptionMatcherSqsBatchingWindowSeconds` | `0`          | **#3768。** `sqs` 経路の MaximumBatchingWindowInSeconds（0〜60）。0 ならバッチ待機時間を追加しない（キューのポーリングや滞留による遅延は残る）。上限 60 は VisibilityTimeout（Timeout 30 × 6 + 60 = 240 秒）を FIFO 重複排除の 5 分窓より短く保つため。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `WsBroadcastEventRoute`                       | `direct`     | **#3768 / #3819。** WsBroadcast へイベントを届ける経路。`direct` = EventBridge からの非同期直接呼び出し（従来）、`sqs` = EventBridge → SQS（`WsBroadcastQueue`）→ Lambda のバッチ。対象はエンティティ変更と `WsBroadcastContinued`（#3173）。**`dual` は持たない** — WS はクライアントへ直接送るため dual だと同じメッセージが 2 通届き、打ち切り継続（`WsBroadcastContinued`、hop 上限 20）が経路ごとに増幅しうる。切替は `direct` ⇔ `sqs` を 1 回のデプロイで行う。2 つの Rule は互いに DependsOn が無く CFN が並列更新するため、反映順により数秒の欠落（両方 DISABLED）または短時間の二重配信（両方 ENABLED）がありうる。WS はベストエフォートのライブ通知で、クライアントは再接続・再取得する（二重も欠落も許容）。`sqs` では `WsBroadcastReservedConcurrency` を -1 にできない（`MaximumConcurrency` が外れて上限なしになるため、CFN Rule で拒否）。0 と 1 も拒否する。キューの滞留はアラーム `geonicdb-<env>-ws-broadcast-queue-age`、DLQ への流入は `geonicdb-<env>-ws-broadcast-dlq-inflow` が検知する。standard キューなので at-least-once で順序は保証されない。バッチ経由のため配信が 1〜2 秒遅れうる。staging.json のみ `sqs`（本番切替は別途）。                                                                                                                                                                                                                                              |
| `WsBroadcastSqsBatchSize`                     | `10`         | **#3768 / #3819。** `sqs` 経路の BatchSize（1〜100）。11 以上は `WsBroadcastSqsBatchingWindowSeconds` を 1 以上にする（CFN Rule で拒否）。1 イベントの fanout は p99 で 24 秒に達しうる（関数 Timeout 30 秒）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `WsBroadcastSqsBatchingWindowSeconds`         | `0`          | **#3768 / #3819。** `sqs` 経路の MaximumBatchingWindowInSeconds（0〜60）。0 ならバッチ待機時間を追加しない（キューのポーリングや滞留による遅延は残る。`WsBroadcastEventRoute=sqs` での 1〜2 秒遅れは別途ありうる）。上限 60 は VisibilityTimeout（Timeout 30 × 6 + 60 = 240 秒）を matcher と同型に保つため。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `ApiThrottlingRateLimit`                      | `0`（未設定）     | API Gateway ステージの定常スロットリング（req/s、全クライアント合算）。Lambda 起動前にバーストを平滑化。`MethodSettings` の `/*` = `*/*`（全メソッド全リソース）の共有バケットに適用し、制御プレーン（`/auth` 等）も同バケットを共有する。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `ApiThrottlingBurstLimit`                     | `0`（未設定）     | 同バースト容量。`ApiThrottlingRateLimit` とセットで指定（片方だけは CFN Rule で拒否）。ステージ全体（`/*` = `*/*`）の共有バケットに適用（#1539 で制御プレーン専用 per-resource 化は revert）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `FairShareWafAction`                          | `'Count'`    | **#3192。** `ApiWafWebAcl` のテナント fair-share（`RateLimitPerNgsildTenant` / `RateLimitPerFiwareService`）の Action。`Block` で既存 `RateLimitExceeded` の 429、`Count` は同じルールを評価するが遮断しない（無効化）。ルール自体は常に作る。切替は `AWS::WAFv2::WebACL` 上の `Fn::If` で、このリソースは SAM 変換対象ではない（#3186 の `samtranslator` バグは `AWS::Serverless::Api` の `Auth` 限定）。共有 staging は `infrastructure/parameters/staging.json` で `Block`。本番は `Count`（計測していない入口を締めない）。緊急時はデプロイなしで `node scripts/fair-share-waf.mjs emergency --live ...`。その実機変更は次のデプロイで戻るとは限らない（CloudFormation は WebACL のプロパティが変わったときだけ更新する）。戻すときは同じコマンドを `--action` にこのパラメータの値を付けて実行し、同じ `--region` / `--name` / `--id` を付けた `verify --live --parameters infrastructure/parameters/<env>.json` で確かめる（`--parameters` が無いと期待値はテンプレート既定の `Count` になる）。戻すまで、デプロイ後の `verify --live`（`deploy-env.yml`）は Action の食い違いで失敗する。Count のまま続けるなら `infrastructure/parameters/<env>.json` の `FairShareWafAction` を変える。                                                                                                                                               |
| `FairShareWafLimit`                           | `60000`      | 60 秒窓のリクエスト数。既定は公表ソフト天井 1000 rps × 60 秒（#3132: 1000 rps は他テナント無影響、1500 rps は波及）。`NGSILD-Tenant` と `Fiware-Service` は別カウンタ。ヘッダが無いリクエストは集計されない。プラン差はアプリ層 `QUOTAS.PLANS`。`Block` にするときは窓レート（Limit/60）を `ApiThrottlingRateLimit` より下にする。同じか上だとステージの 429 が先で、テナント別ルールは隣を守らない。staging / production とも窓レート 1000 rps ＜ ステージ 2000 rps（#3265: prod は staging 同値。Action は本番 `Count`・staging `Block`）。ヘッダ値は未認証なので、他テナント名を載せる DoS は WAF でも旧 Usage Plan でも止まらない（#3181 の unverified バケット分離とは別）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ~~`EnableTenantFairShare`~~                   | —            | **撤去済み (#3188)。** Usage Plan / authorizer Lambda / HMAC / リクエスト中の API Gateway 管理 API は復活させない。入口の fair-share は上の WAF パラメータ。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `EnableOverloadAlarms`                        | `'false'`    | 過負荷 CloudWatch アラーム + SNS トピックを作成するか。既定 `'false'`（prod など未指定環境は無変更）、有効化する環境で `'true'`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `ApiConcurrencyAlarmThreshold`                | `40`（CFN既定値） | `ConcurrentExecutions` アラームの閾値。`ApiReservedConcurrency` の \~80% を目安に環境ごとに設定（2026-08-29 #2916 で staging は Reserved 200 に再較正したため staging は 160。この表の値は CFN テンプレートの Default であり staging の実値ではない点に注意）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `AlarmNotificationEmail`                      | `''`         | 過負荷アラーム SNS トピックへの **メール購読のみ** を制御する。空ならメール `AWS::SNS::Subscription` を作らないだけであり、トピック自体や他経路の購読（ChatOps）とは独立。設定するとデプロイ後に購読確認メールが届く。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

> **staging の現状 (#3012)**: `EnableOverloadAlarms=true`。`AlarmNotificationEmail` は未設定(メール購読なし)だが、
> **アラームはサイレントではない** — `geonicdb-infra-cdk` の `GeonicDbChatbotAlerts-staging` が
> SNS トピック `geonicdb-staging-overload-alarms` を購読し、AWS Chatbot 経由で Slack `#alerts-geonicdb` に配信する。
> 実測例: 2026-09-02 22:18 JST の control-plane Throttles ALARM が同チャンネルへ到着
> (Slack TS `1788355123.039949` / SNS 購読 ARN `…:141fa370-ebd1-47b9-842d-ad9e198def31`)。
> 「メール未設定 = 通知先ゼロ」と読んではいけない。

### 較正式(Reserved と Atlas 接続上限)

Lambda は 1 リクエスト = 1 実行環境で、各環境が自前の Mongo 接続プールを持つ。接続総量の目安:

```text
接続総量 ≈ MONGODB_MAX_POOL_SIZE × (1 + DEPLOYMENTS_MAX_CONNECTIONS) × ウォーム Lambda 数
```

この式は N を決める根拠には使わない — 下記の通り 2026-09-03 の実測でこの式による見積もりと
実接続数が大きく乖離することが判明している。式は**安全上の上限チェック**(選んだ N が
Atlas 接続上限を超えていないか)にのみ用い、**N 自体は実測した通常運用の同時実行数を基準に
較正する**(下記「staging の現行値と、それを決めた実測」):

```text
N × MONGODB_MAX_POOL_SIZE × (1 + DEPLOYMENTS_MAX_CONNECTIONS) ≲ Atlas 接続上限（ノードあたり）
かつ  N ≤ アカウント同時実行上限 − 他関数の予約分
```

### staging の現行値と、それを決めた実測（2026-09-13 JST #3132 GW/予約再サイジング）

`ApiReservedConcurrency=256` / `ControlPlaneReservedConcurrency=32`（合算 **288**）/
`ApiConcurrencyAlarmThreshold=205` / `ApiThrottlingRateLimit=2000` / `ApiThrottlingBurstLimit=4000` /
`EnableOverloadAlarms=true`。**`production.json` は未変更**（prod 反映は月曜以降・#3123 系）。

> **#3132 の決め方**: 合算コールドとウォーム open をペアで測り、恒久値は proven OK 側に置く。
>
> * 合算コールド: **288 OK** (api256+cp32) / **352 NG** (api320+cp32、500/504 多発)。S3 以降は打ち切り
> * Atlas ConnectionsMax ピーク **1124/1500 (74.9%)** @ コールド帯 — 90% 持続打ち切りには未達だが S352 失敗で梯子停止
> * read-one open（予約 256・一時 GW 5000・WAF 緩和・maxConcurrency 1000）:
>   **200 / 1000 rps = 100%**。**1500 rps = 95.6%**（okRps 1434; ConcurrentExecutions が 256 に張り付き
>   Lambda Throttles）。厳密 100% の硬安定ではないが、PREMIUM 1,500 看板の入口（GW）は 2000 で開ける
> * **ドッグフーディング波及（実測）**: Phase2 の 22:26–22:35 JST 帯に API GW `5XXError` が約 **73,000** 件規模。
>   共有 staging の他利用者（geonicdb-livedeck 等）で「データ取得に失敗: Load failed」を観測。
>   **`ApiReservedConcurrency=256` 恒久化後も、1,500 rps 相当の負荷では他テナントに 429/5xx が波及しうる**
>   （共有ステージの単一予約枠が爆発半径）。入口のテナント fair-share は **#3192**
>   （WAF レートベース。staging は `FairShareWafAction=Block`、上限 60000/60s。
>   プラン差はアプリ層のまま）。専用 GW / バケット分離は **#3138**。公表 rps の再同期（ソフト天井 1,000 据え置き）は **#3137**
> * ENTERPRISE **3,000** rps は合算コールドが 352 で落ちるため本サイクル不可 → follow-up **#3138**
> * CP は **32** 据え置き（データプレーン比で機械的に上げない）
> * デプロイ安全ガードの合算上限は **288**（proven OK。0.8×288 だと恒久 api=256 が落ちる）

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
> * **後続 (#3820)**: スタガー上限は env `MONGODB_CONNECT_STAGGER_MAX_MS` で上書き可。
>   API は既定 1500 のまま。イベントコンシューマー 3 関数は `300`（hostname 別クライアント分の
>   嵐散らしは残しつつコールド待ちを縮小。0 にはしない）。

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
>   prod 実測 (#3123) は 7 日間で余裕だったが、1 週間分のため staging 値は流用しない）
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
  — 接続余裕の結論は #3123 の prod 実測（7 日間で最大 1,095 / 上限 3,000）でも 1 週間分の観測にとどまるため断言しない（下記 prod 節）。
  
* WS 系（`ws-connect` 等 4 関数）にも予約枠は無い。**本節の値は WS 同時接続数を縛らない**
  （2026-08-28 のベンチでは api 枠 40 のまま 500 接続を全て捌けている）。

**WS 同時接続 + fanout 配信の段階計測（2026-11-05 / staging / #3173 / `tests/load/ws-fanout.mjs`）**

新規接続レート 50/秒（API Gateway の quota は 500/秒・burst 引き上げ不可）、miya テナント 1 つに全接続を張り、
`entityCreated` を 1 件発火して全接続への到達時間を測定（イベント POST 開始 → 受信、同一マシンの時計）。
計測前から他の利用者の接続が約 44 本あった（DynamoDB 接続テーブル）。

|         同時接続 | 接続失敗 |                      配信 p50 / p99 |                       欠落 | 備考                                                           |
| -----------: | ---: | --------------------------------: | -----------------------: | ------------------------------------------------------------ |
|        1,000 |    0 |     2.5〜3.8 s / 4.6〜6.2 s（3 イベント） |                        0 | ws-broadcast 同時実行 最大 9                                       |
| 5,000（継続配信前） |    0 | 12.4〜15.1 s / 23.5〜25.1 s（3 イベント） | **イベント 2 件目で 206（4.1%）** | ws-broadcast 同時実行 10（予約上限）、Throttles 16、Errors 2、最大実行 25.4 s |
| 5,000（継続配信後） |    0 |         16.6〜17.3 s / 30.1〜31.1 s |  1〜2（410 で削除された接続、#3795） | 継続 1 ホップ。Truncated 0、Errors 0、Throttles 14                   |
|       10,000 |    0 |         24.0〜38.1 s / 47.4〜62.7 s |                    **0** | 継続 最大 2 ホップ。Truncated 0、Errors 0、Throttles 22                |
|       15,000 |    0 |         37.4〜44.5 s / 70.4〜81.3 s |                  0〜1（同上） | 継続 最大 3 ホップ。Truncated 0、Errors 0、Throttles 21                |


* **接続側は 5,000 まで失敗 0**(ws-connect / ws-default のエラー・スロットル 0)。接続数の天井はまだ見えていない。
  
* **天井は ws-broadcast の配信時間。** 配信は接続数にほぼ線形で、1 回の実行で約 210 接続/秒
  (5,000 本 = 約 23.5 秒)。Lambda Timeout 30 秒から打ち切りマージン 5 秒(`WS_BROADCAST_TRUNCATED`、#3679)を引いた
  約 25 秒で打ち切られ、1 回の実行の打ち切り点は **約 4,800 接続**(5,000 接続の試験では `sent=4794`)。
  実測のログ: `sent=4794 unsent=206 truncated=true durationMs=23519`。
  打ち切り分の再配信: event 2(0 始まり、3 件目)も別の実行で `sent=3244 gone=967 unsent=777`(`total=4988`、`truncated=true`)と打ち切ったが、
  クライアント側は全接続が受信した。`gone=967` はこの event 2 の実行の値で、再試行前後の値と `gone` の理由は未調査。
  
* **継続配信 (#3173)**: 打ち切られた残りは `WsBroadcastContinued`(接続を `connectionId` 昇順に並べ、最後に起動した ID を cursor にして
  同じ bus へ再投入)で別の実行へ引き継ぐ。1 ホップ = 1 実行で、1 イベントが覆える接続数は
  約 4,800 × (`BROADCAST_CONTINUATION_MAX_HOPS` + 1)。ホップ上限(既定 20)超過か再投入の失敗のときだけ従来どおり打ち切り(throw)。
  予約同時実行 (staging 10 / production 20) のもとでは、継続は後続イベントの実行と枠を奪い合うため、
  末尾の接続ほど遅れる。継続配信後の staging 実測は下記(2026-11-05、新規接続 50/秒、各 3 イベント)。


* **継続配信は効いた。** 5,000 / 10,000 / 15,000 のすべてで、打ち切りは継続で引き継がれ、`WsBroadcastTruncated`(ホップ上限到達または継続の再投入失敗)は 0、
  ws-broadcast の Errors は 0、`failed`(PostToConnection の 429 等)は 0、クライアント側の重複は 0。
  1 実行の配信速度は約 210 接続/秒で一定で、配信完了時間は接続数にほぼ線形(5,000 で約 30 s、10,000 で約 60 s、15,000 で約 80 s)。
  
* **同時実行は予約上限 10 に達する**(最大 10、Throttles 14〜22)。Lambda の非同期再試行で吸収されたことと、Throttles に起因する欠落がなかったことは未確認(クライアントの受信数・欠落数では因果を確認できない)。
  
* **欠落 1〜2 件は配信の打ち切りではなく、試験クライアントでは open だった対象に `PostToConnection` の `GoneException` が返り、DynamoDB レコードが削除された**ことによる
  (5,000 と 15,000 で発生、10,000 では 0)。該当の接続は試験終了までクライアントで open のままだった。根本原因は未確定で、#3795 の調査に委ねる。
  
* 5,000 の 1 回目の配信完了は約 30 s で、試験の待ち時間(既定 30 s)の境界に当たる。10,000 以降は `--settle` を 120〜240 s に延ばして測った。
  
* **接続側は 15,000 まで失敗 0**。ws-connect / ws-default / ws-disconnect のエラー・スロットルは 0。
  
* **20,000 は、手元 macOS の一時ポートの上限で届かなかった(サーバーの天井ではない)。** 単一プロセスでは 18,000 接続を試行した時点で 16,369 件が接続成功・1,631 件が失敗(失敗率 9.06%)となって中断した
  (`connect_error` 1,631 件、すべてクライアントの 1006。16,369 + 他のソケット約 15 本 = 16,384 = 一時ポート 49152〜65535)。
  **「接続先 IP を分ければ越えられる」は誤りだった**: `ws-fanout.mjs --procs 6`(子 6 本が API Gateway の別々の IP 6 個へ接続先を固定、各 IP に約 2,600 本)で
  20,000 を試したが、**16,358 接続・失敗 214 で停止基準(1%)に達して中断**した(ramp 途中の判定は 1.17%。ramp 完了時点の最終値は 214 / (16,358 + 214) = 1.29%)。単一プロセス・接続先 1 IP の結果とほぼ同じで、
  macOS の一時ポートは接続先 IP ごとでなく**送信元 IP 全体で 16,384 本**である(子 6 本の接続先 IP の内訳は均等で、偏りによる失敗ではない)。
  **この run は接続段階で中断したため、配信結果(`entityCreated` が全接続へ届いたか・欠落・重複・到達時間)は未測定。** 以下はサーバー側の健全性のみで、配信の成否を示すものではない。
  この時点(16,358 接続)でサーバー側は健全: ws-broadcast Errors 0(Throttles 9、最大同時実行 10)、ws-connect / ws-default / ws-disconnect の Errors・Throttles 0、
  API Gateway の ExecutionError / IntegrationError 0(ConnectCount 16,414)。後始末は `remainingOpen` 0、接続テーブルも平常(41 件)に戻った。
  **この Mac の送信元(IPv4 は en0 の 1 個)から測れる上限は約 16,300 接続。** 20,000 以上は送信元 IP を増やす(別マシン / EC2)しかなく、**未測定**。
  `--procs` は 1 プロセスの CPU・メモリを分散するためには有効だが、一時ポートの上限は越えられない。
  20,000 以上のサーバー側の天井(予約同時実行 10、配信時間の線形増: 15,000 で p99 約 80 秒)は未実測。
  
* 継続配信前の試験は停止基準(欠落 1% 超)に該当したため 20,000 へ進まなかった。継続配信後の結果は上記。
  
* **#3926(storage-side cursor / ページ取得)**: PR-2 で `queryByTenantPage` に切替。1 worker 保持量は
  `STREAMING.BROADCAST_CONNECTION_PAGE_SIZE`(500)に有界。継続は既読接続を再取得しない。
  **staging 前後比較はマージ後に計測する**(条件は上記 #3173 の 5,000 / 15,000 に揃える)。
  併記する指標: 成功/drop/重複、`WsBroadcastContinued` / `WsBroadcastTruncated`、queue age、
  ws-connections テーブルの `ConsumedReadCapacityUnits` と Query 回数(`WsConnectionQueryPages`)、
  Lambda max memory。接続一覧の負荷は DynamoDB として測り、Atlas と混同しない。
  
* **全接続を一斉に切ると ws-disconnect がスロットルされる**(1,000 本で同時実行 678・Throttles 276。
  `ws-fanout.mjs` は既定 100/秒で段階的に切る。5,000 本ではスロットル 0)。
  クライアントが一斉に切断する状況(障害復旧時の再接続など)で接続レコードが残る可能性がある。
  
* 結果の再現: `GEONIC_TOKEN=<jwt> node tests/load/ws-fanout.mjs --api-url <url> --ws-url <wss url> --tenant <name> --conns 5000 --rate 50`

投入後は `Throttles` / `5XXError` / Atlas の CPU・接続数を見て調整する。

> **入口 throttling は現状ステージ全体のみ(#1524 の per-resource 化は #1539 で revert)**: #1507 で
> compute(Lambda 関数)は分離済みだが、**API Gateway の throttling は依然としてステージ全体
> (`MethodSettings` の `/*` = `*/*`、`ApiThrottlingRateLimit`/`BurstLimit`)の共有バケット 1 つ**である。
> \#1524 は制御プレーン 5 resource に独立バケットを割り当てようとしたが、API GW は**ワイルドカード
> method(`'*'`/`'ANY'`)を特定 ResourcePath に指定できず**(特定パスは具体 verb のみ、ワイルドカードは
> `*/*` 全体のみ)、`ANY` プロキシ統合である制御プレーン path を per-resource で throttle できずデプロイ
> 不能だった。このため #1539 で stage-wide に戻した。
> **残る限界(要注意)**: 共有バケットのため、**データプレーン `/*` のフラッドが `ApiThrottling` 枠を
> 食い尽くすと `/auth` 等の制御プレーン要求も API GW 入口の 429 で共倒れしうる**。ただし #1507 の
> compute 分離により Lambda 同時実行と DB は別 `ReservedConcurrentExecutions` で守られるため
> **「認証全停止」にはならない**(入口層の隔離が失われているだけで、Lambda 枠は生存)。
> **監視の盲点**: API GW の 429 は Lambda 手前で返るため、`geonicdb-<env>-control-plane-handler-throttles`
> (Lambda `Throttles`)アラームは **API GW 429 を捕捉しない**。データプレーン `/*`・制御プレーン path とも
> 現状 429 は未アラーム。
> **follow-up**: (1) API GW 入口の per-resource 制御プレーン throttling の正しい再設計
> (具体 verb 列挙 / 制御プレーンを別 API・別ステージに分離 / Usage Plan 等)。(2) アクセスログ
> (`$context.status=429`)に対する 429 専用 Metric Filter/アラーム。(3) フラッド時の暫定緩和として
> WAF rate-based rule。
>
> **auth コールドスタートのトレードオフ**: 制御プレーンは低ボリュームなため、分離後は `/auth/login` が
> 専用コンテナのコールドスタート(INIT + Atlas TLS/SCRAM \~3s)に当たりやすくなる(従来はウォームな
> データプレーンコンテナに相乗りできた)。#1440 の top-level-await warmup で緩和されるが皆無ではない。
> デプロイ後に login p99 を監視すること。

### prod の現行値と、それを決めた実測（2026-09-12/13 JST #3117、平常ピーク根拠は #3009)

`ApiReservedConcurrency=160` / `ControlPlaneReservedConcurrency=32`(合算 **192**)/ `ApiConcurrencyAlarmThreshold=128` / `ApiThrottlingRateLimit=1000` / `ApiThrottlingBurstLimit=2000`。`infrastructure/parameters/production.json` に置き、primary / secondary 両リージョンに同じ値を適用する(フェイルオーバー時に secondary が primary と同じ容量を持つ必要があるため)。**入口の数字は staging 実測(#3113/#3117)で決めた安定上限を採用**する。prod Atlas は M20(接続上限 **3,000**/ノード — 公式。旧 docs の「M20 \~1,500」は M10 の誤記)。**コールド合算・API GW 入口**の staging 安全値は prod にも安全側に転用できるが、**Atlas 接続は別** — `MONGODB_MAX_POOL_SIZE` が staging 5 / prod 10 のため、同じ同時実行でも接続数は約 2 倍になりうる(本節「前提と適用範囲」)。staging 絶対ピーク 1489 に pool 比とマージンを載せると `1489×2×1.25=3722 > 3000` となり、「M20 余裕あり」は反転しうる。`template-deploy-safety.test.ts` はこの外挿を**偽の安心として通さない**(pool 差込みで M20 超過をアサート)。**prod 実測 (#3123) の最大は 1,095 で外挿の約 1/3 だが、観測は 1 週間分のため接続余裕の結論を過信しない**(下記「#3117 後の prod 観測」)。平常ピークとの倍率根拠は下表(#3009)。

| 観点                               | 実測（本番 953082826936）                                                                             | 効き方                                          |
| -------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 通常運用の同時実行（日次最大, 8/24〜9/7）        | api **13〜30**（30 は 8/26 の通知一括配信日、平常 13〜19）/ control-plane **1〜3** / secondary の api 1〜9         | 予約 160 は実測ピークの **5.3 倍**                     |
| API Gateway リクエスト（1 分粒度, 直近 7 日） | 中央値 190 req/分、p99 397、最大 **699**（≈ 11.7 rps）。secondary は最大 162                                  | throttling 1000 rps は実測ピークの **85 倍**、顧客を締めない |
| Lambda アカウント枠                    | 1000（未予約 ≥ 100 要件）。合算 192 + 他関数予約後も未予約 ≫ 100                                                    | 合算 192 は枠の 19%                               |
| Atlas                            | **M20**（自動スケーリング上限 M30）、接続数 p50 231 / 最大 711（**M20 上限 3,000**/ノード）、CPU 日次最大 17〜35%（8/26 のみ 78%） | 較正式は判断材料にしない。実測: 予約の有無と無関係に基線は動かない (#3010)   |
| staging 入口実測 (#3117)             | meta \~1960 rps / read-one 安定 \~400–520 rps / 合算コールド 256 OK・320 NG                              | 入口 1000 / 予約 160 の直接根拠                       |
| 旧状態 (#3009)                      | 予約 80 / GW 300。その前は予約なし（アカウント枠まで無制限）                                                            | #3117 で引き上げ                                  |

**判断の型**(裁可 2026-09-12 / Epic #3112): 2026-09-03 の「インフラをプランに合わせて引き上げない」は**無効化**。プラン上限×10 を進めるため、実測に基づき入口を先に広げる(本変更)。admission check 緩和 (#3114) とレート制限バケット (#3115) は入口の後続。

値を変えるときは `tests/unit/infrastructure/template-deploy-safety.test.ts` の prod ガード(予約 ≥ 実測ピーク × 2、閾値 = 予約の 75〜85%、control-plane ≤ `floor(120×0.8)=96`、合算 ≤ **204**(#3117 `floor(256×0.8)`。staging の #3132 合算 288 とは分離。`#3123` の 7 日間実測は余裕だったが 1 週間分のため staging 値は流用しない)、throttling は整数で実測 rps × 10 以上)とこの表を一緒に更新する。

### #3117 後の prod 観測(#3123。2026-10-27 00:00〜11-03 00:00 JST の暦日 7 日間)

v0.20.0(2026-09-28 JST デプロイ)の入口引き上げ後。値は JST 暦日ごとの日次最大(Sum は日次合計)。**予約 160 に対し api 同時実行の最大は 27**(ap-northeast-1, 週 p99 ≈ 7.6)、ap-northeast-3 は最大 15。入口は実測ピークの 5.9 倍の余裕を保っている。

| 指標                                                       | 実測（7 日）                       | 上限・閾値                       |
| -------------------------------------------------------- | ----------------------------- | --------------------------- |
| api-handler `ConcurrentExecutions`（ap-northeast-1, 日次最大） | 18〜27                         | 予約 160 / アラーム 128           |
| api-handler（ap-northeast-3, 日次最大）                        | 6〜15                          | 予約 160                      |
| control-plane-handler（ap-northeast-1, 日次最大）              | 1〜2                           | 予約 32                       |
| Lambda `Throttles`（api 両リージョン・control-plane）             | 0                             | –                           |
| Atlas `ConnectionsMax`（日次最大）                             | 758〜1,095（11/2 が最大）           | M20 上限 3,000                |
| Atlas `ConnectionsPercentOfCapMax`（日次最大）                 | 36.5〜43.3%                    | アラーム 80%                    |
| Atlas `CpuUserPercentMax`（日次最大）                          | 51〜63%                        | アラーム 70% / auto-scaling 75% |
| API GW `Count`（ap-northeast-1, 日次合計）                     | 22.4〜24.7 万 / 日（7 日計 約 162 万） | –                           |
| API GW `5XXError` / `4XXError`（7 日計）                     | 約 370 / 約 6,400               | –                           |


* **アラーム**: `api-handler-concurrency`(128)・`api-handler-throttles`・`atlas-cpu`・`atlas-connections`・`api-5xx` は ALARM 遷移 0 回(誤報・未達なし)。`api-4xx-rate` は 10/27 に 6 回。
* **接続数**: staging 外挿 `1489×2×1.25=3722` に対し実測最大は 1,095(上限 3,000 の 36.5%)。pool 差(5→10)を織り込んでも、この 7 日間は M20 上限に届かない。なお `ConnectionsPercentOfCapMax` は別系列(poller 取得)で、同じ日の `ConnectionsMax ÷ 3,000` と一致しない(分母・観測点の定義は未確認)。どちらも閾値 80% の手前。
* **CPU が最も余裕の薄い資源**: 日次最大 51〜63%(週内で上昇傾向)で、アラーム 70% の手前。次の天井は同時実行や接続でなく DB CPU。temporal 書き込みの admission count は #3229(closed)で対応済みだが、以降の推移は継続して見る。
* **`api-latency-p99`(1000 ms)は 7 日間で ALARM 遷移 263 回(OK 遷移 262 回)**。日別 51 / 43 / 32 / 23 / 41 / 55 / 18。設定は `Period: 300` × `EvaluationPeriods: 3`(`DatapointsToAlarm` 未指定)だが、実際の履歴では ALARM と OK が 1〜数分間隔で往復している(例: 11/2 16:07〜16:18 JST に 1 分間隔の遷移が 6 回。設定から想定される復帰時間より短く、原因は #3743 で調べる)。API GW Latency p99 の日次値は 1.7〜2.4 秒で、閾値 1000 ms を常時近く超えている。同時実行・接続とは無関係で入口パラメータの再較正対象ではないが、**アラームとして機能していない**ため別 issue (#3743) で扱う。
* **結論**: 同時実行は予約枠 160 に対し最大 27 と余裕があり、接続数は staging 外挿 3,722 に対し実測最大 1,095(約 29%)と大きく下回った。入口パラメータの再較正は不要。ただし観測は 1 週間分で接続余裕は断言しない。取得は CloudWatch `AWS/Lambda` / `AWS/ApiGateway` / `GeonicDB/Atlas`(`ClusterName=geonicdb-production`)の読み取りのみ。

### 過負荷アラーム（AWS ネイティブ指標）

`EnableOverloadAlarms='true'` のとき、SNS トピック `geonicdb-<env>-overload-alarms` と以下の CloudWatch アラームを作成する:

| アラーム                                               | 指標                                                                                                      | 意味                                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `geonicdb-<env>-api-handler-throttles`             | Lambda `Throttles` > 0                                                                                  | 予約 / アカウント同時実行上限に到達（入口飽和の一次シグナル）                                                    |
| `geonicdb-<env>-api-handler-concurrency`           | Lambda `ConcurrentExecutions` ≥ `ApiConcurrencyAlarmThreshold`                                          | 予約上限への接近（先行指標）                                                                      |
| `geonicdb-<env>-control-plane-handler-throttles`   | Lambda `Throttles` > 0（#1507）                                                                           | 制御プレーン関数が予約 / アカウント上限に到達（認証飽和）                                                      |
| `geonicdb-<env>-api-5xx`                           | API GW `5XXError` − `GeonicDB/Sla QuotaRejections` ≥ 25 / 5分                                            | 503（maxTimeMS 超過 / 過負荷）・500 の多発。**クォータ拒否 (507) は控除**（下記）                            |
| `geonicdb-<env>-waf-blocked`                       | WAFV2 `BlockedRequests`（Rule=ALL）− `RateLimitPerNgsildTenant` − `RateLimitPerFiwareService` ≥ 1000 / 5分 | per-IP フラッド等、入口圧の早期シグナル。**テナント fair-share の Block は控除**（専用の `waf-fair-share-*` が見る） |
| `geonicdb-<env>-waf-fair-share-ngsild-tenant`      | WAFV2 `BlockedRequests` ≥ 1000 / 5分、Rule=`RateLimitPerNgsildTenant`                                     | `NGSILD-Tenant` fair-share の Block（#3192）。`FairShareWafAction=Count` の間は増えない        |
| `geonicdb-<env>-waf-fair-share-fiware-service`     | WAFV2 `BlockedRequests` ≥ 1000 / 5分、Rule=`RateLimitPerFiwareService`                                    | `Fiware-Service` fair-share の Block（#3192）。`FairShareWafAction=Count` の間は増えない       |
| `geonicdb-<env>-subscription-matcher-errors`       | Lambda `Errors` ≥ 5 / 5分 × 3期間（#1560）                                                                   | 購読マッチングが継続失敗（15 分以上）                                                                |
| `geonicdb-<env>-subscription-matcher-event-age`    | Lambda `AsyncEventAge` 最大 > 10 分 / 5分 × 3期間中 2（#3439）                                                   | 購読マッチングの非同期イベントが滞留（予約同時実行の上限に詰まっている。DB の遅延・タイムアウト）                                  |
| `geonicdb-<env>-subscription-matcher-duration-p99` | Lambda `Duration` p99 > 24000ms / 5分 × 3期間（#3688 / #3173 C5）                                            | Timeout (30s) の 80% 近接。Errors アラームより前に fanout 天井を検知する先行指標                           |
| `geonicdb-<env>-rule-processor-errors`             | Lambda `Errors` ≥ 5 / 5分 × 3期間（#1560）                                                                   | ReactiveCore Rules が継続失敗（15 分以上）                                                    |
| `geonicdb-<env>-notification-sender-errors`        | Lambda `Errors` ≥ 5 / 5分 × 3期間（#1560）                                                                   | 購読通知の配信が継続失敗（15 分以上）                                                                |
| `geonicdb-<env>-ws-broadcast-errors`               | Lambda `Errors` ≥ 5 / 5分 × 3期間（#1560）                                                                   | WebSocket 配信が継続失敗（15 分以上）                                                           |
| `geonicdb-<env>-ws-broadcast-duration-p99`         | Lambda `Duration` p99 > 24000ms / 5分 × 3期間（#3688 / #3173 C5）                                            | Timeout (30s) の 80% 近接。`WsBroadcastTruncated` の前兆                                   |
| `geonicdb-<env>-expiry-sweeper-errors`             | Lambda `Errors` ≥ 5 / 5分 × 3期間（#1561）                                                                   | TTL 失効の `EntityDeleted` 発行（expiry sweeper）が継続失敗（15 分以上）                             |

#### fanout 観測性 EMF（#3688 / #3173 C5）

matcher / broadcaster の fanout は Errors アラームだけでは件数と所要が見えない。以下を `GeonicDB` 名前空間へ EMF で出す（tenant は properties のみ。dimension にしない）。Duration p99 アラーム閾値は `FANOUT_OBSERVABILITY.DURATION_P99_ALARM_THRESHOLD_MS` (= Timeout 30s × 0.8 = 24000ms)。Timeout を変えるときは定数と template の Threshold を同時更新。

| 指標 (`GeonicDB` 名前空間)                | Unit         | 出す場所                 | 意味                                                                                                                     |
| ----------------------------------- | ------------ | -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `SubscriptionMatcherNotifiable`     | Count        | subscription-matcher | 配信対象件数（entity 経路は claim 成功数、rule 経路は deliverable 数。rule は claim しない）                                                   |
| `SubscriptionMatcherSent`           | Count        | subscription-matcher | SQS enqueue 成功件数                                                                                                       |
| `SubscriptionMatcherFailed`         | Count        | subscription-matcher | prepare + enqueue 失敗件数                                                                                                 |
| `SubscriptionMatcherSqsBatchFailed` | Count        | subscription-matcher | `SendMessageBatch` 由来の失敗件数のみ (`Failed` / Successful 欠落 / SDK reject)。サイズ超過フォールバックの単独 `SendMessage` 失敗と prepare 失敗は含まない |
| `SubscriptionMatcherDuration`       | Milliseconds | subscription-matcher | matcher fanout 所要時間                                                                                                    |
| `WsBroadcastNotifiable`             | Count        | ws-broadcast         | 認可後の配信対象接続数                                                                                                            |
| `WsBroadcastSent`                   | Count        | ws-broadcast         | PostToConnection 成功件数 (`GoneException` は含まない)                                                                          |
| `WsBroadcastFailed`                 | Count        | ws-broadcast         | 送信ワーカーの失敗件数（`PostToConnection` reject、ペイロード生成失敗、`GoneException` 後の接続レコード削除失敗など。settled reject の総数）                     |
| `WsBroadcastDuration`               | Milliseconds | ws-broadcast         | broadcast fanout 所要時間                                                                                                  |
| `WsBroadcastTruncated`              | Count        | ws-broadcast         | 残り時間不足で打ち切った未送信件数 (#3679)                                                                                              |
| `WsBroadcastCleanupTruncated`       | Count        | ws-broadcast         | dead 接続切断の打ち切り件数 (#3688; C3 では warn のみだった)                                                                             |
| `WsBroadcastContinued`              | Count        | ws-broadcast         | 打ち切った残りを `WsBroadcastContinued` として再投入した未送信件数 (#3173)。`hop` を property に持つ                                             |
| `WsConnectionQueryPages`            | Count        | ws-broadcast         | 1 実行内の接続一覧 Query 回数 (#3926)。2 回以上のときだけ発行                                                                               |

#### クォータ枯渇アラーム（GeonicDB 独自指標、#2894）

上の表は AWS ネイティブ指標のアラーム。クォータ枯渇は EMF で `GeonicDB` 名前空間に出しており、`QuotaMonitoringSweeper` が `rate(1 hour)` で全アクティブテナントを走査して発火させる。

| アラーム                                    | 指標                                                   | severity | 意味                        |
| --------------------------------------- | ---------------------------------------------------- | -------- | ------------------------- |
| `geonicdb-<env>-quota-storage-warning`  | `GeonicDB QuotaStorageWarning` ≥ 1                   | p3       | テナントがストレージクォータの 80% に到達   |
| `geonicdb-<env>-quota-storage-critical` | `GeonicDB QuotaStorageCritical` ≥ 1                  | p3       | テナントがストレージクォータの 95% に到達   |
| `geonicdb-<env>-quota-rejections`       | `GeonicDB/Sla QuotaRejections`（geonicdb-infra-cdk 側） | p3       | 上限超過により書き込みが 507 で拒否されている |

##### deployment 別の指標 (#3084)

上の EMF 指標は `Deployment` dimension (= Host。deployment 行が無い既定 DB は `default`) 付きでも出る。同じ 1 行から無次元 (上表のアラームが参照) と `Deployment` 付きの両系列が取り込まれるので、既存アラームは変わらず、デプロイメント別の状況表示 (geonicdb-operations#144) はこちらを読む。tenant 単位の dimension は付けない (テナント数が多くカーディナリティが膨らむ。tenant はログの `tenantService` に残る)。

| 指標 (`GeonicDB` 名前空間)                           | dimension                    | 出す場所                                  | 意味                                                                                                                                                   |
| ---------------------------------------------- | ---------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QuotaStorageWarning` / `QuotaStorageCritical` | `Deployment`                 | quota-monitoring sweeper (毎時)         | 80% / 95% 帯に到達したテナントがいる                                                                                                                              |
| `QuotaStorageUtilization` (Percent)            | `Deployment`, `ResourceType` | quota-monitoring sweeper (毎時)         | resourceType 別の利用率。値は `current / limit` の実勢で **100% を超える** (1,200,007 / 1,000,000 → 120)。判定用の `utilizationPercent` (100 で飽和) は同じ EMF 行の property に残す |
| `QuotaRejections`                              | `Deployment`                 | API エラーハンドラ (507 InsufficientStorage) | 上限超過で拒否した書き込み件数。`GeonicDB/Sla QuotaRejections` (Metric Filter、SLA 集計用) とは別系列                                                                         |
| `RateLimitRejections`                          | `Deployment`                 | API エラーハンドラ (429)                     | レート制限で拒否した件数 (geonicdb-operations#87 の「429 はどこにも数えられていない」)                                                                                           |
| `NotificationDeliveryFailures`                 | `Deployment`                 | notification-sender                   | 再試行の末に配信失敗した通知件数                                                                                                                                     |
| `NotificationDeadlineDeferred`                 | `Deployment`                 | notification-sender                   | Lambda 残り時間不足で未着手のまま再配信へ回した通知件数 (#3925)                                                                                                              |

対応するログ行 (`Request error` の `deployment` / `path` / `method`、`Notification failed after retries` の `deployment` / `tenant`、`[QuotaAlert]` の `deployment`) から購読・テナントまで辿れる。EMF レコードには `errorCode` キーを載せない — SLA Metric Filter (`$.errorCode = InsufficientStorage`) と二重計上になるため。

> **評価窓 (#2912)**: EMF は超過時の sweep でのみ出る。`Period: 3600` / `EvaluationPeriods: 2` / `DatapointsToAlarm: 1` / `TreatMissingData: notBreaching`（sweeper の `rate(1 hour)` と結合）。`Period: 300` のままだと missing 期間が偽 OK になり 1 時間ごとに ALARM↔OK を往復する。`TreatMissingData: ignore` は解消後に ALARM が固着するため使わない。sweeper のスケジュールを変えるときは Period も同時に変えること。
>
> **severity が 3 つとも p3 である理由 (#2902)**: severity タグはステータスページが「ページをどれだけ赤くするか」を決めるために読む。テナントが自分のプラン上限に近づく／超えるのは **そのテナントの契約の話であって、GeonicDB の障害ではない**。
>
> 当初 critical は p1（= outage）、warning は p2（= degraded）だった。2026-08-28 に staging のステータスページが「Service disruption」と表示されたが、サービスは 100% 正常で、実際に起きていたのは 1 テナントが temporalDataPoints を使い切ったことだけだった。
>
> 判断基準はこう考えると単純: **既に上限を超えて書き込みを拒否されている `quota-rejections` が p3 なのだから、その手前で鳴るアラームがそれより重いことはありえない。** 80% と 95% の区別はアラーム名と Slack 本文で伝わる。
>
> **api-5xx がクォータ拒否を控除する理由 (#2902)**: この指標はメトリクス演算 `m1 - FILL(m2, 0)` で評価する。`m1` は API GW `5XXError`、`m2` は `GeonicDB/Sla QuotaRejections`（geonicdb-infra-cdk がログのメトリクスフィルタから生成）。

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
> `Errors` アラームを追加すること**(`tests/unit/infrastructure/sam-template.test.ts` が
> テンプレートからワーカーを自動抽出して漏れを検出する)。
>
> 閾値は絶対数ではなく「継続性」で判定する(5 件/5分 × 3 期間連続)。短時間で収まる一過性の
> リトライ可能エラー(EventBridge / SQS の再配送で回復するもの)は通常この条件を満たさないため
> 発報しにくい。**ただし「絶対に誤報しない」わけではない** — 再試行可能なエラーであっても
> 15 分以上継続し各 5 分間で 5 件以上発生すれば、同じアラームが発火する(CodeRabbit 指摘)。
> 発報時は「恒久停止」と決めつけず、まずエラー内容とリトライ状況を確認すること。
>
> **このアラームで検知できないもの(既知の限界。レビューで指摘された点を正直に記す)**:
>
> 1. **メール購読と ChatOps 購読は別物** — `AlarmNotificationEmail` が空でも、SNS トピックへの
>    メール `Subscription` が無いだけである。staging は `GeonicDbChatbotAlerts-staging`
>    (AWS Chatbot → `#alerts-geonicdb`)が別途購読しており、発火は Slack に届く(#3012)。
>    逆に ChatOps 未配線の環境でメールも空なら、トピックへ publish されても人が気づかない。
>    \#1560 の 141 日は「メトリクスは出ていたが誰も見ていなかった」事故なので、**何らかの通知経路
>    (ChatOps またはメール)をアラーム追加と同じロールアウトで用意する**必要がある。
>    なお #1560 のインシデント自体は閾値を満たしていた(約 3 失敗/分 = 15 件/5分 ≥ 5 が
>    3 期間連続 → 約 15 分で ALARM)。当時は届く経路が無かった。
> 2. **低トラフィックのワーカーは 100% 失敗でも閾値に届かない** — 1 分あたり 1 件未満の
>    細い流量なら 5 件/5分 に達しない。「恒久停止を投入初日に検知できる」のは
>    継続的な流量があるワーカーに限る。
> 3. **起動回数ゼロの死は原理的に見えない** — イベントソースが無効化・誤設定されて
>    そもそも呼ばれないと `Errors` のデータポイントが 1 件も出ず、
>    `TreatMissingData: notBreaching`(`Errors` に対しては正しい設定)のため無反応になる。
>    別の形の「静かな死」は依然として残る。

### TTL 失効 (expiresAt) expiry sweeper(#1561)

MongoDB の TTL monitor による物理削除は `EntityService` を経由しないため、TTL 失効時の
`EntityDeleted` はワーカー (`expiry-sweeper`, `rate(1 minute)`) がアプリ側で発行する
(旧 CDC change-stream ワーカーが唯一の観測点だったが #1560 で撤去済み — 復活は二重発行になる)。

| 設定値      | 定数 (`src/config/defaults.ts` の `ENTITY_EXPIRY`) | 値                                                                                                        |
| -------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| TTL 猶予期間 | `TTL_GRACE_SECONDS`                             | 300 秒（`idx_entity_ttl` の `expireAfterSeconds`。失効から sweeper が claim できなくなる = Mongo が物理削除するまでの猶予）          |
| sweep 間隔 | `SWEEP_INTERVAL_SECONDS`                        | 60 秒（Lambda の `rate(1 minute)` と一致）                                                                      |
| 1 回の cap | `SWEEP_BATCH_CAP`                               | 1000 件（**走査全体の合計**。超過分は次回 sweep に持ち越し、cap 到達は `logger.warn` で可視化）                                        |
| 1 回の時間予算 | `SWEEP_TIME_BUDGET_MS`                          | 20,000 ms（**走査全体の合計**。Lambda Timeout 30 秒の手前で自発的に打ち切る。残した deployment 数は `skippedDeployments` として返し warn） |

cap と時間予算は **per-deployment ではなく走査全体で共有**する。per-deployment にすると失効件数・
通知ファンアウト・Mongo 接続負荷が deployment 数だけ乗算されるため。

**不変条件**: `TTL_GRACE_SECONDS` > `SWEEP_INTERVAL_SECONDS`(逆転すると sweeper が次に走る前に
Mongo が物理削除してしまい、`EntityDeleted` が無音で欠落する)。unit テストで固定している。

### 既知の限界と挙動変更


* **at-most-once**: claim (soft-delete) から publish までの間にクラッシュすると、そのエンティティは
  `deletedAt` が既に設定されているため再 claim されず、通知は失われる(二重通知を避けるための
  trade-off)。欠落量は sweep の戻り値 `publishFailures` に**実測値**が入る — publisher の batch 経路は
  例外を投げず drop するため、呼び出し側の `try/catch` では 1 件も数えられない(`BatchPublishResult.dropped`
  を使う)。
  
* **同一 ID の再作成が最大 300 秒ブロックされる**: 失効エンティティは猶予期間中 physically 残るため、
  コアの一意制約 `idx_entity_unique_v3`(`{tenant, servicePath, entityId}`、`deletedAt` を含まない)が
  同一 ID の作成を `409 AlreadyExists` で弾く。**GET は 404 を返すのに作成は 409 になる**窓が、従来の
  TTL monitor 巡回間隔(\~60 秒)から猶予期間(300 秒)へ広がる。
  
* **deployment 一覧の取得は時間予算の外**: `listEnabledDeployments()` は DynamoDB のフルスキャンで、
  スキャン自体は `SWEEP_TIME_BUDGET_MS` に含まれない。deployment が十分多いとスキャンだけで予算を
  使い切り、その run では deployment を 1 件も処理できない(この場合は専用の warn ログが出る。
  無音にはならない)。ページ単位で budget-aware にする(継続カーソルを次回 run へ引き継ぐ)のは follow-up。
  
* **通知ファンアウト上限は本 sweeper のスコープ外**(#1544 で
  [Notification Fan-out Quota](#notification-fan-out-quota-1544) として実装したが、その消費点は
  **購読通知の送信直前**であり本 sweeper の経路ではない。既存 `purgeEntities` の cap 10,000 より
  小さい範囲に収まるため新しいリスククラスではない)。
  
* **TTL 猶予期間の反映は index failure メトリクスの監視が前提**: 既存コレクションへの `expireAfterSeconds`
  変更は `collMod` で行うが、失敗は**非 critical** として記録されるため `/health` は緑のままになる。
  `/health` の `indexes.totalFailureCount` を監視していないと「猶予期間を設定したつもりで効いていない」
  状態に気付けない(この場合 sweeper が claim する前に Mongo が物理削除し、`EntityDeleted` が無音で欠落する)。

### Atlas 接続の運用アラーム（reserved 非依存 — #3122）

**接続予算は予約同時実行とは別資源**（#3010）。較正式 `N × pool` で導出せず、
CloudWatch `GeonicDB/Atlas` / `ConnectionsPercentOfCapMax`（**現在のティア上限に対する割合**）を
**80%** で監視する。アラーム `geonicdb-<env>-atlas-connections` は 5 分 × 2 期間連続（10 分）で 80% を超えると鳴る。

auto-scaling でティアが変わっても閾値は追従する（geonicdb-infra-cdk#218 以降。それまでは
`ConnectionsMax` の固定値で、ティアが上がると早すぎ（上限に対する割合が低いうちに鳴る）、
下がると鳴らなかった）。
クラスタが IDLE でない間は、現ティアと auto-scaling 最小ティアのうち **低い方の上限**で割る
（スケールのローリング中は小さいノードが残るため）。スケールだけでなくメンテナンスや設定変更中も
IDLE ではないので、その間は M20 でも **M10 の上限の 80%（1200 接続）** で鳴る。
auto-scaling のないクラスタ（専用クラスタの一部）は常に現ティアの上限で割る。

| 環境         | 共有クラスタ（例） | 上限/ノード | 80% の目安 |
| ---------- | --------- | -----: | ------: |
| staging    | M10       |   1500 |    1200 |
| production | M20       |   3000 |    2400 |

仕組み: `geonicdb-infra-cdk` の Atlas metrics poller が Atlas Admin API を 5 分周期で読み、
EMF で `GeonicDB/Atlas` に出す（有償の Atlas–CloudWatch 統合は使っていない）。
SNS `geonicdb-<env>-overload-alarms` → runbook
[atlas-cluster-health](https://github.com/geolonia/geonicdb-operations/blob/main/docs/runbooks/atlas-cluster-health.md)。

**コールド梯子の直後に負荷を掛けると接続が積み上がる**（#3117 実測）:
合算コールド 320 帯で ConnectionsMax **1232**、その直後の meta-version 負荷で
**1489**（M10 の 99%、特定 sum 単独ではない）。負荷試験ではステージ間で
`ConnectionsMax` を見てティア上限に余裕を残すこと — 手順は
`tests/load/README.md`。

> **旧記述の訂正**: 「Atlas メトリクスは CloudWatch に来ないので Atlas UI アラート必須」は、
> staging のポーラー導入後は当てはまらない。WiredTiger ticket キューなどポーラーが
> まだ出していない指標は、引き続き Atlas 側アラートが補完になる。

### Atlas 側アラーム（ポーラー未カバー指標）

MongoDB 7.0 は WiredTiger tickets（read/write 各最大 128）で内部 admission control
を持ち、公式は **queued read/write tickets を過負荷の主指標**として推奨している。
ポーラーがまだ出していない指標は Atlas Project の Alerts（UI / Admin API）で補う:


* **Query Targeting: Scanned Objects / Returned** が高い（非効率クエリ = collection scan の兆候）
  
* （可能なら）queued read/write tickets の増加

CPU / Connections / Disk / Replication lag / Oplog window は上記の CloudWatch アラームを正とする。

## Management API

### クォータ情報の取得

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
    },
    "asyncDrops": {
      "retentionDays": 7,
      "date": "2026-08-15",
      "reasons": [
        {
          "reason": "notificationConcurrency",
          "today": 12,
          "total": 40,
          "lastOccurredAt": "2026-08-15T10:22:01.000Z",
          "days": [
            { "date": "2026-08-15", "count": 12 },
            { "date": "2026-08-14", "count": 28 }
          ]
        }
      ]
    }
  }
}
```

### クォータ設定の更新

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

### 容量受付チェック（#1509 / Epic #1485）

手動のクォータ設定ミスによるクラスタの飽和を防ぐため（2026-07-21 インシデントの直接的なトリガーは、単一テナントの `perMinute` が検証なしに引き上げられたこと）、`PUT /admin/tenants/{tenantId}/quotas` は変更を永続化する前に **単一テナント容量受付チェック** を実行します。

モデル（テナント毎のガードレール — 全テナントの集計は評価 **されません**）：

```text
demand  = effective.perMinute
allowed = CLUSTER_CAPACITY_WEIGHTED_PER_MIN × MAX_SINGLE_TENANT_SHARE
demand > allowed  →  400 BadRequest (rejected)
```

`perMinute` は既に **1 分あたりの重み単位** で表されています（レートリミッターは `calculateWeight()` 単位をそれに対して消費します）。#3114 は以前の `× REPRESENTATIVE_WEIGHT` の二重カウントを削除しました。

チェックは **有効な** クォータ（リクエストボディをテナントの既存設定にマージしたもの）に対して評価されるため、部分的な更新は結果の値を使用して検証されます。

**オーバーライド（要承認）：** `super_admin` は `acknowledgeOvercommit: true` を設定することで、意図的にガードレールを超えることができます。オーバーライドは高重要度の監査ログに記録されます。`tenant_admin` はオーバーライドできません（実際には、クォータをまったく更新できません — 変更には `super_admin` が必要です）。

```json
{
  "quotaPlan": "CUSTOM",
  "customQuotas": { "rateLimit": { "perMinute": 1000000 } },
  "acknowledgeOvercommit": true
}
```

> **キャリブレーション注記（#3114）：** `CLUSTER_CAPACITY_WEIGHTED_PER_MIN` は **プレースホルダーガードレール予算** であり、測定された Atlas スループットではありません。現在の値 `600000` と `MAX_SINGLE_TENANT_SHARE=0.5` により `maxPerMinute=300000` となり、#3118 ENTERPRISE/PREMIUM `perMinute` に対するレガシーの約 5 倍のマージン（`300000/60000`）が維持されます（共有 API GW は公開 rps を 1000 に制限；生の ×10 ENTERPRISE は 180000 でした）。病的な値（例：`perMinute=1_000_000`）は依然として拒否されます。`ENDPOINT_WEIGHTS`：entity batch=3（#3829）；temporal batch write=5 / query=2（#3876 M30 A/B ≈1.78×）。絶対値 GET=1 の正規化は未解決のままです（#1509；single\@450 rps は共有 GW で中止されました）。時間ウィンドウは `perMinute × 60` です（#3876）。定数は **コンパイル時 — 環境調整不可** です（[環境変数](#environment-variables) を参照）。手順：QUOTA\_OPERATIONS.md。
>
> 専用クラスタバインディング / plan×tier 派生は #1492 / #1559 のままです。

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


* `RATE_LIMIT_ENABLED`: レート制限の有効化/無効化(デフォルト: `true` — 未設定/その他の値は有効として扱われます。明示的なオプトアウトのみが緊急停止スイッチとして機能します — 空白のトリミングと小文字化の後にマッチするため、`false`/`FALSE`/`" false "` はすべて無効化します、#1516)
  
* `RATE_LIMIT_TABLE_NAME`: DynamoDB レート制限テーブル名
  
* `USAGE_STATS_TABLE_NAME`: DynamoDB 使用統計テーブル名
  
* `QUOTA_ALERT_WEBHOOK_URL`: アラート配信用の Webhook URL (オプション)

**キャパシティ受入チェック(#1509 / #1983): 環境変数で調整不可。**

> ⚠️ **これらはコンパイル時定数であり、環境変数ではありません(#1983)。** このドキュメントの以前のリビジョンでは `QUOTA_ADMISSION_ENABLED`、`CLUSTER_CAPACITY_WEIGHTED_PER_MIN`、`QUOTA_MAX_SINGLE_TENANT_SHARE`、`QUOTA_ADMISSION_REPRESENTATIVE_WEIGHT` を調整可能な環境変数としてリストしていました。これらは **`infrastructure/template.yaml` に配線されたことがなく**、設定してもデプロイされた環境では何の効果もなく、#1983 で `process.env` の読み取りが完全に削除されました。**これらの名前を設定しても何も起こりません。** これはインシデント時に最も重要で、障害モードは「変数を設定し、再デプロイし、なぜ何も変わらないのか疑問に思う」となります。

現在の値は `QUOTAS.ADMISSION` (`src/config/defaults.ts`) に存在し、コード変更 + デプロイによってのみ変更されます:

| Constant                            | Value    | Meaning                                                                                                                                                  |
| ----------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENABLED`                           | `true`   | Admission check is always on — there is no kill switch                                                                                                   |
| `CLUSTER_CAPACITY_WEIGHTED_PER_MIN` | `600000` | Cluster's budgeted capacity in weighted units/min (#3114)                                                                                                |
| `MAX_SINGLE_TENANT_SHARE`           | `0.5`    | Max fraction of that capacity one tenant's quota may claim                                                                                               |
| `REPRESENTATIVE_WEIGHT`             | `5`      | Max `ENDPOINT_WEIGHTS` value (#3876: temporal batch write; record only; not multiplied into demand since #3114). Also feeds `resolveShardWeightHeadroom` |

これらは **プレースホルダーのガードレールであり、測定された Atlas キャパシティではありません**。意図される方向性は、環境変数を再導入するのではなく、**プラン × クラスタ階層** からそれらを導出することです(#1559)。キャリブレーション手順については QUOTA\_OPERATIONS.md を、専用クラスタバインディングについては #1492 を参照してください。

## アクセス制御

### 権限レベル


* **super\_admin**: すべてのテナントのクォータを表示および変更可能
  
* **tenant\_admin**: 自分のテナントのクォータを表示可能(読み取り専用)。変更には `super_admin` が必要
  
* **user**: クォータ管理 API へのアクセス権なし

### 認証

すべてのクォータ管理 API には認証が必要です:

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

**原因**: レート制限超過

**解決方法**:

1. `Retry-After` ヘッダーで指定された秒数待機
   
2. リクエスト頻度を削減
   
3. バッチ操作を活用してリクエスト数を削減
   
4. プランのアップグレードを検討

### 507 Insufficient Storage

**原因**: ストレージクォータ超過 — 使用量がプランの公称制限だけでなく、[猶予上限](#soft-limits-grace-band-1571)を超えました。(公称制限と上限の間の使用量は、`X-Quota-Soft-Exceeded` ヘッダー付きで許可され、拒否されません。)

**解決方法**:

1. 不要なエンティティ/サブスクリプション/登録を削除
   
2. 時系列データの保持期間を短縮
   
3. プランのアップグレードを検討

### クォータヘッダーが表示されない

**原因**: レート制限が無効になっている可能性があります

**解決方法**:

1. `RATE_LIMIT_ENABLED` 環境変数を確認
   
2. SAM テンプレートパラメータを確認
   
3. DynamoDB テーブルが正しくデプロイされていることを確認

## 入力検証制限

GeonicDB は、悪用を防止しシステムの安定性を確保するために、入力長とカウント制限を適用します。

### 認証とログイン保護

#### アカウント別ログイン保護

既存のアカウント別ブルートフォース保護 ([AUTH.md](../reference/auth.md) を参照):


* アカウント別の最大ログイン失敗回数:**15 分**以内に **5 回**
  
* アカウントロック期間:閾値到達後 **15 分間**
  
* 段階的遅延:**2 秒**から始まる指数バックオフ (2^(n-2))

#### IP 別ログイン保護 (#900)

単一 IP から複数アカウントに対するパスワードスプレー攻撃を防止:

| Parameter                      | Value                       |
| ------------------------------ | --------------------------- |
| Maximum failed attempts per IP | **20** within **5 minutes** |
| IP lock duration               | **15 minutes**              |
| Record TTL                     | **1 hour** (auto-deleted)   |


* **HTTP ステータス**:`429 Too Many Requests` と `Retry-After: 900`
  
* ログイン成功時は IP カウンターをリセットしない(タイミングベースの列挙を防止)
  
* エラーメッセージ:`"Too many failed login attempts from this IP. Please try again later."`

### テナントリソース制限

#### テナント別ユーザー数 (#901)

| Parameter                | Default                                                                |
| ------------------------ | ---------------------------------------------------------------------- |
| Maximum users per tenant | **the tenant's plan value** — 100 for T0/T5/T30, 1,000 for T40 (#2082) |


* ユーザー作成時のみチェック
  
* `tenant.settings.maxUsers` によるテナント別オーバーライド — 明示的な値がプランのデフォルトより優先
  
* **HTTP ステータス**:`400 Bad Request`
  
* エラーメッセージ:`"User limit reached for this tenant (current: N, limit: M)"`

#### テナント別ポリシー数 (#912)

| Parameter                   | Default |
| --------------------------- | ------- |
| Maximum policies per tenant | **50**  |


* `tenant.settings.maxPolicies` によるテナント別オーバーライド
  
* **HTTP ステータス**:`400 Bad Request`
  
* エラーメッセージ:`"Policy limit reached for this tenant (current: N, limit: M)"`

#### 管理ユーザー操作レート制限 (#905)

Admin API での作成・削除サイクル攻撃を防止:

| Parameter                     | Value                                |
| ----------------------------- | ------------------------------------ |
| Window                        | **10 minutes**                       |
| Maximum operations per window | **1,000** (create + delete combined) |


* `createUser` と `deleteUser` にテナント別に適用
  
* `super_admin` は除外
  
* **HTTP ステータス**:`429 Too Many Requests`
  
* エラーメッセージ:`"Too many user management operations. Limit: 1000 per 10 minutes."`

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

### Email Address Validation (#903)


* 最大長:**254 文字** (RFC 5321 準拠)
  
* 適用先:ユーザー作成、ユーザー更新、ログイン
  
* **HTTP ステータス**:`400 Bad Request`

### Subscription Endpoint URI/URL (#913)


* 最大長:**2,048 文字**
  
* 適用先:NGSI-LD `notification.endpoint.uri`、NGSIv2 `notification.http.url` / `notification.httpCustom.url` / `notification.mqtt.url`
  
* **HTTP ステータス**:`400 Bad Request`

### 入力検証の制限(全般)

GeonicDB はすべての API エンドポイントで包括的な入力検証を実施します。いずれかの制限を超えた場合は `400 Bad Request` を返します。

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

> エンティティドキュメントの BSON サイズは **バイト** 単位の制限です(要素数ではありません)。[エンティティドキュメントサイズ (#2517)](#エンティティドキュメントサイズ-2517) を参照してください。

#### 数値の上限

| Field        | Max Value                     |
| ------------ | ----------------------------- |
| `throttling` | 86,400 (24 hours, in seconds) |
| `timeout`    | 30,000 (30 seconds, in ms)    |
| `lastN`      | 1,000                         |

#### エンティティドキュメントサイズ (#2517)

保存される各エンティティ(`entities` コレクション内の MongoDB ドキュメント)は **≤ 1 MiB BSON** (`QUOTAS.MAX_ENTITY_DOCUMENT_BYTES`)でなければなりません。この制限は **プラン毎の HTTP リクエストボディクォータとは独立しています** — PREMIUM (5 MB) または ENTERPRISE (10 MB) のリクエストは入口での受付を通過しても、結果のドキュメントが 1 MiB を超える場合は **413 `RequestEntityTooLarge`** を受け取る可能性があります。既に制限に達しているドキュメントの増加は拒否されます(祖父条項による読み取り/削除/縮小は引き続き許可されます)。暗号化されたテナントでは、現在のドキュメントがまだ制限内にある場合、置換は暗号化 **前** にサイズ超過の属性ペイロードを拒否します(KMS / DEK ローテーションの節約);現在のドキュメントが既に制限を超えている場合、縮小置換はアトミック縮小ガードを介して進行します。同じエンティティ ID は 1 つのバッチアップサートで最大 `SECURITY.MAX_ENTITY_BATCH_OCCURRENCE_ROUNDS` (8) 回まで出現できます — これを超えると書き込み前に **400** となります。これは NGSIv2 `/v2/op/update`、NGSI-LD `entityOperations/upsert`(マージおよび置換)、MCP、および A2A バッチアップサートすべてに適用されます。スナップショットリストアは意図的にこのガードをバイパスします(`snapshot.repository.ts` を参照)。

**大きな blob (#3833):** 数百キロバイトの値を埋め込む代わりに、オブジェクトストレージ + エンティティ上の URL 参照を推奨します(FIWARE / Smart Data Models スタイル)。変更イベントは AWS EventBridge(GeonicDB の安全マージン後 ≤ \~230 KiB の有効バジェット)を経由します。サイズ超過のイベントはドロップされるのではなく **劣化** されます(属性本体が削除され、コンシューマは現在の状態を再読み込み) — ただし `showChanges` / 以前の値は不完全になる可能性があります。[サブスクリプション → 大きな属性値](../features/ngsi-subscriptions.md#large-attribute-values-and-eventbridge-size-3833) を参照してください。

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


* 最大深度: **10**
  
* 制限を超えると、プリミティブ型 (string、number、boolean、null) のみが受け入れられます
  
* **HTTP ステータス**: ネストが制限を超えると `400 Bad Request`

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

#### カタログ / CADDE / Vocabulary API 検証

| Field                                  | Max Length          |
| -------------------------------------- | ------------------- |
| Catalog `q` (keyword)                  | 2,000               |
| Catalog `id` (package/dataset)         | 256                 |
| CADDE query params (`type`, `id`, `q`) | Same as NGSI limits |
| Vocabulary `tenantId`                  | 64                  |
| Vocabulary `term`                      | 256                 |

#### MCP Admin Tools 検証

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

### どのバッチアクションがエンティティストレージクォータを消費するか (#902 / #2183 / #2185)

操作がエンティティストレージクォータを消費するのは、エンティティを**作成**できる場合です。バッチ更新の場合、これはリクエストが upsert パスに到達するかどうかで決まります:
`EntityService.batchUpdateEntities()` は `append` / `appendStrict` / `update` を `batchUpsert()` に送信します (`upsert: true` の `bulkWrite` なので、存在しない id は挿入されます)。`replace` / `delete` のみがエンティティごとのループ (`replaceEntityAttributes` / `deleteEntity`) に送信されます。


* **`append` / `appendStrict` / `update`**: エンティティ作成としてカウント — ストレージクォータを消費
  
* **`replace` / `delete`**: カウントしない — これらは新しいエンティティを挿入しない
  
* 未知の `actionType` は作成として扱われます (fail-closed);リクエストはその後の検証で拒否されます

同じルールがすべてのエントリーポイントに適用されます。MCP / A2A の `batch` ツールは `create` / `upsert` / `merge` および `update` を同じ upsert パスにマッピングするため、HTTP の `/v2/op/update` と同等にクォータを消費します。`update` は、その `actionType` が非 upsert 値の 1 つである場合にのみ除外されます — 分類子は HTTP パスと `batchActionTypeCreatesEntities()` を共有するため、それは `"replace"` または `"delete"` です。実際には `"replace"` のみが到達可能です: MCP の `batch` ツールスキーマは `actionType: "update" | "append" | "replace"` を受け入れるため、`"delete"` はディスパッチされる前に入力検証で拒否されます (A2A の `batch` スキルには `update` アクションがまったくありません)。

履歴: `/v2/op/update` は元々、`actionType` に関係なく**すべての**リクエストをカウントしていました; #902 はこれを `append` / `appendStrict` に絞り込みました。しかしこれは狭すぎました — `update` も upsert するため、#2185 (HTTP) と #2183 (MCP `batch` の `update` / `merge`) まで カウントされないままでした。これらは「作成できるか?」ルールを復元し、すべてのエントリーポイントで共有される単一のヘルパーに決定を移しました。

### JSON-RPC バッチボディ (#2182)

`/mcp` は JSON-RPC バッチとして**トップレベルの JSON 配列**を受け入れ、すべての要素を実行します。したがって、クォータ分類は各要素を検査し、リソースディメンションごとおよびテナントごとの消費を**合計**してから制限をチェックします。合計がなければ、各書き込みを独自の配列要素でラップすることで、各要素が独自のチェックを通過してしまいます (使用量はまだ書き込まれていません) が、合計は制限を超えます。プランレベルの `maxBatchSize` も同じ方法で要素全体にわたって合計されます。

## 関連ドキュメント


* Quota Operations Guide - Ops ランブック: クォータの引き上げ/診断、plan↔tier↔constant マッピング、キャリブレーション手順


* Development & Deployment Guide - インフラストラクチャセットアップ
  
* [Authentication & Authorization](../reference/auth.md) - テナント/ユーザー管理、アクセス制御
