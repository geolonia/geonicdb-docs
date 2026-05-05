---
title: "Changelog"
description: "GeonicDB changelog"
outline: deep
---
# 変更履歴

このプロジェクトのすべての重要な変更は、このファイルに記録されます。

このフォーマットは [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に基づいており、
このプロジェクトは [Semantic Versioning](https://semver.org/lang/ja/) に準拠しています。

## [Unreleased]

### 2026-05-05
- **修正**: SDK の `db.request()` が空ボディ + JSON Content-Type のレスポンスで `SyntaxError: Unexpected end of JSON input` を投げて落ちる問題 (issue #1145) (#1146)
  - 背景: NGSI-LD `POST /entities` (201) など仕様上ボディが空のレスポンスでも、サーバ実装は `Content-Type: application/ld+json` を付けて返している。SDK 側 `db.request()` は Content-Type が `json` を含むと無条件に `res.json()` を呼ぶため、空ボディで SyntaxError を投げていた (`db.createEntity` 等の専用メソッドは body を読まないので影響なし、`db.request()` 経由で同パスを叩くと壊れる、という非対称が問題)
  - 修正: `db.request()` を空ボディに堅牢化。`Content-Length: 0` を短絡 + `text()` で先に読んで空文字なら null を返す形に変更
  - 追加: `tests/unit/sdk/index.test.ts` に 201 + 空 body + JSON Content-Type / Content-Length: 0 の 2 件の regression テスト
  - 残課題: NGSI-LD spec / RFC 9110 上は空ボディに `Content-Type` を付けない方が望ましい。サーバ側 (`entities.controller.ts` ほか) は別 issue で spec 準拠化する
- 🚨 **破壊的変更**: Custom Data Models の `valueType` 入力契約導入により観測可能な挙動変更が 3 点 (issue #1131) (#1147)
  - **未知の `valueType` を含む Custom Data Model の作成は 400 で拒否される**: 旧は任意文字列を受理して後段で silent skip。新は Zod の preprocess + enum で正準形 (9 値) に解決できないと作成時に 400。`String` / `GeoJSON` / `text` / `int` / `bool` / `json` / `geo` / `GeoJSON Point` 等の旧 alias は **入力時に自動正規化されるので影響なし**。完全に未知の値 (タイポ等) のみ影響を受ける
  - **既存モデルに未知 `valueType` が残っている場合、エンティティ書き込みが 400 になる**: 旧は `validation.service` の switch default で silent skip (fail-open) → 不正データも保存可。新は `Unsupported valueType '<v>' in data model definition` で ValidationError (fail-closed)。API 経由で作成された既存モデルは preprocess を当時通っていれば該当しない。**影響を受けるのは直接 DB に書き込まれた壊れたモデルのみ**。リリース前に `propertyDetails.*.valueType` を点検して未知値の有無を確認することを推奨
  - **`datetime` / `uri` valueType の値が新たにバリデーションされる**: 旧は該当 case が無く skip (= どんな文字列も保存可)。新は `datetime` が **RFC 3339 strict** (T リテラル + 秒必須 + タイムゾーン必須)、`uri` が `URL` コンストラクタで形式検証。`schema-generator.service.ts` が出力する JSON Schema の `format: 'date-time'` (RFC 3339) と検証ルールが整合する
  - SemVer: 観測可能な挙動変更を含むため **minor バンプ (0.8.0)** を推奨
- **修正**: Custom Data Models の `valueType` に入力契約を導入し、コンポーネント間の挙動の食い違いを解消 (issue #1131) (#1147)
  - 背景: #595 で `validation.service` の case mismatch を `toLowerCase()` で吸収したが、Zod スキーマには enum 制約がなく、`schema-generator` / `mcp tool` は依然として小文字厳密一致だったため、PascalCase / 独自表記 (`'GeoJSON Point'`) / タイポを silent skip するか挙動分岐するかが箇所ごとに違っていた
  - 修正:
    - **`src/core/custom-data-models/value-type.ts`** を新設し `VALUE_TYPES` 9 値 (`string`, `number`, `integer`, `boolean`, `array`, `object`, `geojson`, `uri`, `datetime`) と `normalizeValueType()` を single source of truth として提供
    - **Zod スキーマ** (`ExtendedPropertyDetailSchema.valueType`) を `preprocess(toLowerCase + alias) → z.enum(VALUE_TYPES)` に変更。後方互換: `String` / `GeoJSON` / `text` / `int` / `bool` / `json` / `geo` / `GeoJSON Point` 等を入力時に自動正規化、未知値は 400
    - **`validation.service.ts`** が `normalizeValueType` を経由するように変更し、`uri` / `datetime` のケースを追加。未知 valueType は silent skip ではなく `logger.warn` を出すように変更
    - **`schema-generator.service.ts`** / **MCP tool (`config.tools.ts`)** も `normalizeValueType` 経由で正規化してから switch するように変更
    - **OpenAPI 例** (`meta.controller.ts`): `'GeoJSON Point'` → `'geojson'` に修正
    - **`docs/INSTRUCTION.md`** のフィールド表で `valueType` の正準形と alias の扱いを明記
  - 追加: `tests/unit/core/custom-data-models/value-type.test.ts` (純粋関数の網羅), `custom-data-model.schemas.test.ts` の `property valueType enum (#1131)` セクション (canonical 9 値受理 + alias preprocess + 未知値拒否)
- 🚨 **破壊的変更**: `POST /ngsi-ld/v1/entityOperations/upsert` で既存エンティティの `scope` が反映されるようになる (issue #1133) (#1148)
  - 旧: リクエストボディに `scope` が含まれていてもサーバ側で silently drop されていた (バグ)
  - 新: NGSI-LD §5.6.10 / §5.6.4 仕様どおり scope も置換 / 反映される
  - 影響: GET したエンティティのレスポンスをそのまま再 upsert する round-trip パターンを使っているクライアントは、これまで無視されていた `scope` がそのまま反映される。元データと同じ scope を返している限り no-op だが、レスポンスの `scope` を加工してから送り戻していた場合は要点検
  - SemVer: バグ修正の側面が強いが「これまで無視されていたフィールドが反映される」という観測可能な挙動変更
- **修正**: `POST /ngsi-ld/v1/entityOperations/upsert` で既存エンティティの `scope` が silently drop されていた問題 (issue #1133) (#1148)
  - 背景: `batch.controller.ts` の upsert は、既存エンティティに対して `replaceEntityAttributes(tenant, id, entity.attributes)` と **`attributes` だけ** を渡しており、リクエストボディに含まれる `scope` (および `expiresAt`) はサーバ側で 204 / 207 で成功扱いになる一方で実際には反映されない silent failure を起こしていた。NGSI-LD 1.6 §5.6.10 (Upsert) で `options=replace` は §5.6.4 (Replace Entity) 等価とされ、scope を含む全置換が期待される
  - 修正:
    - **`entity.repository.update()`** の options に `scope?: string[] | null` を追加 (encrypted / non-encrypted 両 path)
    - **`entity.service.updateEntityAttributes()` / `replaceEntityAttributes()`** に `scope` オプションを追加し repository へ伝搬
    - **`batch.controller.ts` の `batchUpsert`**: 既存エンティティ更新時に `entity.scope` を service に渡す (replace / merge 両モード)
  - 後方互換: `entity.scope === undefined` (リクエストボディに scope を含めない場合) は既存値を維持。明示配列で置換、`null` でフィールドを unset
  - 追加: `batch.controller.test.ts` に regression テスト 2 件 (replace / merge 両モードで scope が `entity.service` に伝搬されることを保証)
- 🚨 **破壊的変更 (軽微)**: SDK の URL クエリ文字列のエンコーディングが微妙に変わる (#1149)
  - 旧: `encodeURIComponent` でフィールドごとに直列化
  - 新: `URLSearchParams` ベースに refactor (DRY 化のため)
  - 影響を受ける文字: 半角スペース `%20` → `+` / `'` 素通し → `%27` / `!` `*` `(` `)` `~` 素通し → `%21` `%2A` `%28` `%29` `%7E`
  - サーバ側 (GeonicDB 本体) は両形式を解釈するので **通常は実害なし**。プロキシ / WAF が strict matching している環境では影響しうる
  - 公開メソッドのシグネチャは追加のみで完全後方互換 (新パラメータはすべて optional)
- **改善**: SDK のクエリパラメータ表面を NGSI-LD §5.7.2 (Query Entities) に揃えて拡充 (issue #1132) (#1149)
  - 背景: `db.getEntities()` 等は `type / limit / offset / q` の 4 パラメータしか URL に乗せておらず、サーバが実装している `scopeQ` / `georel` / `geometry` / `coordinates` / `attrs` / `pick` / `omit` / `lang` / `orderBy` / `count` 等を SDK 経由で使えなかった。実アプリで scope に基づくフィルタが必要になり (geonicdb-gis 関連)、SDK を諦めて `db.request()` で素のパスを組み立てる回避が必要だった
  - 修正:
    - **`src/sdk/types.ts`**: `GetEntitiesParams` を拡張し `scopeQ`, `georel`, `geometry`, `coordinates`, `attrs`, `pick`, `omit`, `lang`, `orderBy`, `orderDirection`, `orderByDistance`, `count`, `geoproperty` を追加。`CountEntitiesParams` / `GetTemporalEntitiesParams` / `SubscribeOptions` / `SubscriptionMessage` にも `scopeQ` を追加
    - **`src/sdk/index.ts`**: `URLSearchParams` ベースの汎用ビルダ `buildPathWithParams()` を導入し、`buildEntitiesPath()` / `count()` / `getTemporalEntities()` を全て経由させる。今後パラメータ追加は型に書くだけで自動的に URL に乗る (一箇所追加すれば終わるよう DRY 化)
    - **`src/sdk/websocket.ts`**: `subscribe(options)` が `scopeQ` を受け、サブスクリプションメッセージに添える (サーバ側未対応バージョンでは無視される)
    - **`src/sdk/README.md`**: `getEntities()` の例にコメント形式で全パラメータを列挙
  - 後方互換: 既存呼び出し (`{ type, limit, offset, q }` のみ) は完全に動作。新パラメータは optional 追加
  - 追加: `tests/unit/sdk/index.test.ts` に regression テスト 3 件

## [0.7.1] — 2026-05-02

### 2026-05-02
- **修正**: SDK 公開パッケージの d.ts root が strict tsconfig で named import を解決できない問題 (issue #1127)
  - 背景: PR #1124 (#1118 の修正) で `geonicdb.d.ts` を `export * from './index'` の wildcard re-export に変更したが、`src/sdk/package.json` の `files: ["geonicdb.*"]` は **意図的な single-file 配信** (#877) のため `./index.d.ts` 等の per-file d.ts は npm パッケージに含まれない。strict tsconfig (`verbatimModuleSyntax`, `strict` 等) の consumer から見ると wildcard が空に解決され、`AuthorizationError` を含む全 named export が消えていた (locus サンプル開発で `import { AuthorizationError } from '@geolonia/geonicdb-sdk'` がモジュール解決エラーになり発覚)
  - 修正: `scripts/build-sdk.ts` の d.ts 生成を hardcoded export 列挙形式に戻した。ただし TypeScript AST (`typescript` の `createSourceFile`) で `src/sdk/index.ts` を走査して export 一覧を **build 時に自動収集** するため、新規 export 追加時に build-sdk.ts を後追い修正する必要なし (drift 自動防止)
  - **検証強化** (回帰防止): 既存の `dist/sdk/` 直読みではなく、`npm pack` の tarball を抽出した上で
    - 公開ファイルから `geonicdb.d.ts` / `geonicdb.{cjs,mjs,iife.js}` が含まれていることを検証
    - **strict tsconfig 環境を再現** した consumer プロジェクトを `tmpdir` に組み立て、`tsc --project` で実コンパイルし、各エラークラス / public type の named import (`import { ... }` および `import type { ... }`) が **TS2614 にならないこと** を assertion
    - 公開 d.ts に `export * from` 形式が混入しないことを正規表現で禁止
    - `src/sdk/index.ts` ソースの export 名と公開 d.ts の export 名が一致することを drift guard で検証
  - ドキュメント: `docs/SDK.md` / `src/sdk/README.md` に「TypeScript」節を追加し、strict tsconfig でも named import が解決できる旨を明記

## [0.7.0] — 2026-05-02

### 2026-05-02
- **改善**: ReactiveCore Rules の SLO 超過に対する協調キャンセルを実装 (issue #1122) (#1123)
  - 背景: PR #1121 で導入した `RuleProcessorFunction` の `Promise.race` ベースの soft timeout は、wait を打ち切るだけで `ruleEngine.processEntityChange()` の裏での実行は継続していた。Lambda hard timeout (30s) で最終的に止まるが、SLO (`MAX_RULE_EXECUTION_TIME_MS = 5s`) を超えた処理が走り続け、unintended な entity 作成 / webhook 発火を起こし得た (CodeRabbit 指摘)
  - 対応: `RuleEngineService.processEntityChange(event, signal?)` に optional `AbortSignal` を追加。ルール評価ループ・アクション実行ループの境界で `signal.throwIfAborted()` をチェックし、新しいルール / アクションの開始を阻止する。`executeWebhookAction` は `AbortSignal.any([外部 signal, 内部 timeout signal])` で外部 signal と既存の内部 timeout を合成し、HTTP fetch も中断するようにした
  - `handlers/rules/processor.ts` で `AbortController` を作成し、SLO 超過で `controller.abort()` を呼ぶ。span 上は abort されたかを区別して ERROR を記録 (`aborted` フラグを log に出す)
  - 既存の `entity.service` / `temporal.service` の各メソッドへの signal threading は影響範囲が広いため別 issue に切り出し、本対応では「ループ境界で次の処理を始めない」までを保証する。in-flight の DB 操作は完走させる
  - 関連: `src/core/rules/rule-engine.service.ts`、`src/handlers/rules/processor.ts`、`tests/unit/core/rules/rule-engine.service.test.ts` (signal 経由の協調キャンセル 4 ケース追加)、`tests/unit/handlers/rules/processor.test.ts` (signal 経由の abort/log/span 検証 2 ケース追加)
- **修正**: SDK 公開 d.ts (`@geolonia/geonicdb-sdk` の `geonicdb.d.ts`) からエラークラスが silently 落ちていた問題 (issue #1118) (#1124)
  - 原因: `scripts/build-sdk.ts` が `geonicdb.d.ts` を hardcoded な export 列挙で書き出しており、`src/sdk/index.ts` で `errors.ts` から再エクスポートしている `GeonicDBError` / `AuthenticationError` / `AuthorizationError` / `NotFoundError` / `ConflictError` / `ValidationError` / `RateLimitError` / `NetworkError` が含まれていなかった。runtime バンドル (cjs / mjs) では正しく export されていたが、TypeScript からは `import { AuthorizationError } from '@geolonia/geonicdb-sdk'` でモジュール解決エラーになっていた
  - 修正: `scripts/build-sdk.ts` の d.ts 生成を `export * from './index'; export { default } from './index';` に変更し、`src/sdk/index.ts` の named export を全て自動転送する。今後 index に export を追加してもこのスクリプトの修正は不要
  - 回帰防止: `tests/unit/sdk/build-artifacts.test.ts` を新設。`geonicdb.d.ts` が wildcard 形式であること、`index.d.ts` でエラークラスが `errors.ts` から re-export 形で公開されていること、runtime CJS / ESM 両バンドルでエラークラスが constructor として呼び出せ Error サブクラスかつ `GeonicDBError` を共通基底とすることを検証 (ESM は子プロセス経由で評価)
- **追加**: ReactiveCore Rules のアクションテンプレートで `${now()}` / `${uuid()}` 等の関数を呼べるようにした (issue #1120) (#1125)
  - 背景: 既存の `${path}` 解決は `entity.id` / `attribute.<name>.value` / `trigger.*` のみを参照する path 限定で、サーバー時刻や一意 ID を生成する手段がなかった。`urn:ngsi-ld:ActivityLog:${entity.id}` のような決定的な entityId しか作れず、同一エンティティの複数回 update から派生 entity を生成すると id 衝突で 2 回目以降が失敗していた
  - 修正: `rule-engine.service.ts` の `substituteTemplate` を拡張し、`${name(args)}` 形式を関数呼び出しとして解釈する。実装した関数は副作用なし・外部 I/O なしの whitelist のみ:
    - `${now()}` / `${now('iso')}` → ISO 8601 タイムスタンプ
    - `${now('unix')}` → UNIX 秒
    - `${now('unix-ms')}` → UNIX ミリ秒
    - `${uuid()}` → RFC 4122 v4 UUID
  - 安全性: 引数パーサは単純なクォート付き文字列リテラルのみ受け付ける。未対応の関数名・フォーマットは literal として残し warn ログを出す (発火を止めない)
  - ドキュメント: `docs/REACTIVCORE_RULES.md` の Template Variables セクションに「Template Functions」サブセクションを追加。append-only ActivityLog の実用例も掲載
  - テスト: `rule-engine.service.test.ts` の `template substitution` describe に 10 シナリオを追加 (各関数の戻り値形式、複数関数の同時展開、path 参照との混在、未知関数 / 不正フォーマットの literal 保持、`createEntity` での `${uuid()}` 一意性)

### 2026-05-01
- **修正**: 本番 (Lambda) で ReactiveCore Rules が一切発火しない問題 (issue #1119) (#1121)
  - 原因: `entity.service` から EventBridge へ publish される `EntityCreated/Updated/Deleted` イベントを listen する Rule consumer Lambda が `infrastructure/template.yaml` に存在せず、Rules 発火経路が `ChangeStreamProcessorFunction` の `Schedule: rate(1 minute)` 起動 → MongoDB Change Stream tail だけに依存していた。本番 Lambda 環境ではこの経路が静かに失敗しており Rules が一切実行されなかった (locus サンプル開発時に発覚)
  - 修正: 新規 Lambda `RuleProcessorFunction` (`src/handlers/rules/processor.ts`) を SubscriptionMatcher と同じ EventBridgeRule で `EntityCreated/Updated/Deleted` を listen させ、`RuleEngineService.processEntityChange` を駆動する。`ChangeStreamProcessorFunction` 側からは rule engine 呼び出しを撤去 (二重発火防止)
  - **E2E でこのバグを検出できなかった反省を反映**: 既存の `tests/e2e/support/rule-execution-helper.ts` (`triggerRuleExecution`) が `ruleEngine.processEntityChange` を直接呼んでおり EventBridge 経路を完全にスキップしていたため、template.yaml の配線喪失を E2E で気付けなかった。以下の検出策を追加:
    - `tests/e2e/support/hooks.ts` に `@rules-auto-fire` タグ専用ブリッジを追加。`getLocalEventBus().on('entityChange', ...)` で本番 handler `handlers/rules/processor.handler` を直接呼び、entity 作成 API → EventBridge 相当 → RuleProcessor Lambda → ruleEngine の経路を丸ごと貫通させる
    - `tests/e2e/features/auth/rules-auto-fire.feature` で「entity 作成 API のみで Rule action が自動実行される」シナリオを 2 つ追加 (`triggerRuleExecution` を介さない再現テスト)
    - `tests/unit/infrastructure/sam-template.test.ts` で `infrastructure/template.yaml` の最小構造を検証 (RuleProcessorFunction / SubscriptionMatcherFunction / WsBroadcastFunction が EventBridgeRule で 3 種の detail-type を listen していることを機械的に確認)
    - `tests/unit/handlers/rules/processor.test.ts` で新規 handler 単体の挙動 (3 種イベント委譲・secondary region スキップ・エラー握り潰し・タイムアウト) を検証
  - 関連: `src/handlers/rules/processor.ts` (新規)、`src/handlers/streams/change-stream.ts` (rule engine 呼び出しを除去)、`infrastructure/template.yaml` (`RuleProcessorFunction` 追加)、`tests/e2e/support/hooks.ts` / `tests/e2e/features/auth/rules-auto-fire.feature` / `tests/unit/infrastructure/sam-template.test.ts` / `tests/unit/handlers/rules/processor.test.ts`

## [0.6.0] — 2026-05-01

### 2026-05-01
- **認可**: WebSocket 配信時の XACML AuthzRequest に `entityOwner` / `entityId` を inject (issue #1107) (#1116)
  - `src/handlers/websocket/broadcaster.ts` の `filterByAuthz` と `src/core/streaming/local-ws-server.ts` の `broadcastEventAsync` を改修。各コネクションに対する `authorizeWs()` 呼び出しに、配信対象 entity の `entityOwner` (createdBy) / `entityId` / `entityType` を渡す。これまで `entityType` のみだったため、「**自分が所有する entity の更新だけ受信する**」per-user 通知フィルタが XACML カスタムポリシーで書けなかった
  - これに伴い `EntityChangeEvent.entity` に optional な `owner?: string` を追加。`entity.service.ts` の publish 経路 (CREATE/UPDATE/DELETE 各種) で entity の `createdBy` を transparent に伝播する。`InternalEntity.createdBy` も追加 (内部用; NGSI トランスフォーマでは出力されない)
  - `WsEntityContext` インターフェースを `policy.pip.ts` に追加。`buildWsAuthzRequest` / `authorizeWs` の 5 番目の引数を `entityType?: string` から `entityContext?: WsEntityContext` (`{ entityType?, entityId?, entityOwner? }`) に変更。`WS ⊂ GET` 評価時に entityOwner も両方の AuthzRequest に inject される
  - 認可キャッシュキーを `role:policyId` → `role:policyId:userId` に拡張。`subject.userId == entityOwner` 形式のポリシーは role/policyId が同じでも userId 単位で decision が分岐するため。同一ユーザーがマルチデバイス接続している場合のみキャッシュ再利用される
  - 新しいユースケース: 「自分宛のイベントだけ受信」(チャット, 通知)、「自分が所有する entity の subscribe」(マイページフィード)、locus サンプルの「自分が編集した GeoJSON の activity だけ流れる」フィード等が XACML カスタムポリシーで実現可能
  - 関連: `src/infrastructure/eventbridge/client.ts` (`EntityChangeEvent.entity.owner`)、`src/core/entities/entity.types.ts` (`InternalEntity.createdBy`)、`src/core/entities/entity.repository.ts` (`toInternalEntity` 経由で createdBy 伝搬)、`src/core/entities/entity.service.ts` (CREATE/UPDATE/DELETE 各 publish で `entity.owner` を inject)、`src/core/auth/policy/policy.pip.ts` (`WsEntityContext`, `buildWsAuthzRequest`, `authorizeWs`)、`src/handlers/websocket/broadcaster.ts` / `src/core/streaming/local-ws-server.ts` (キャッシュキー + entityOwner 引き渡し)、`docs/AUTH.md` / `docs/EVENT_STREAMING.md` 追記、`tests/unit/core/auth/policy/policy.pip.test.ts` / `tests/unit/handlers/websocket/broadcaster.test.ts` / `tests/unit/core/entities/entity.service.test.ts` (happy / unhappy 計 12 ケース追加)、`tests/e2e/features/common/websocket.feature` (owner-based WS フィルタの 1 シナリオ追加)
- **ReactiveCore Rules**: `eventType` 条件を追加 (issue #1103) (#1115)
  - Rule の `conditions` に `{type: "eventType", eventTypes: ["create" | "update" | "delete"]}` を指定できるようにした。EntityCreated / EntityUpdated / EntityDeleted の発火元を Rule 側でフィルタできる。サンプルアプリ `geonicdb-locus` (GeoJSON コラボ編集) の「作成時のみ ActivityLog を生成」「削除時のみクリーンアップ」というよくあるパターンが直接書けるようになる
  - これまで `change` 条件 (`changedAttributes` 参照) では CREATE と DELETE を区別できず (両者とも `changedAttributes` が undefined)、自然な書き方ができなかった
  - 既存の `entityType` / `value` / `change` / `and` / `or` / `not` などと自由に組み合わせ可能。`{type: "not", condition: {type: "eventType", eventTypes: ["delete"]}}` で「削除以外」も書ける
  - 関連: `src/core/rules/rule.types.ts` (`EventTypeCondition` / `RuleEventType` 追加)、`src/core/rules/rule-engine.service.ts` (`evaluateEventTypeCondition` 追加 — `EntityCreated`→`create` 等のマッピング)、`src/api/shared/schemas/rule.schemas.ts` (`EventTypeConditionSchema` を discriminatedUnion に追加)、`docs/REACTIVCORE_RULES.md` 追記、`tests/unit/core/rules/rule-engine.service.test.ts` / `tests/unit/api/shared/schemas/rule.schemas.test.ts` (happy / unhappy シナリオ追加)、`tests/e2e/features/auth/rules.feature` (発火・非発火・複数指定・バリデーションのシナリオ追加)
- **ReactiveCore Rules**: CEL 評価コンテキストに `previous.attribute.<name>` を露出 (issue #1106) (#1114)
  - `src/core/rules/rule-engine.service.ts` の `evaluateCelExpressionCondition` で、`RuleEvaluationContext.previousEntity` の属性を `previous.attribute.<name>.value` / `previous.attribute.<name>.type` として CEL 環境にバインド。これまで `previousEntity` は内部的に保持されていたが CEL からは参照できなかった
  - 振る舞い: `EntityCreated` 時 `previous.attribute` は空オブジェクト (`{}`)、`EntityUpdated` 時は更新前の属性スナップショット、`EntityDeleted` 時は最終状態。空オブジェクトに対する直接プロパティ参照 (`previous.attribute.x.value`) は CEL が `No such key` を throw するため、`has()` ガードを推奨 (例: `has(previous.attribute.temperature) && previous.attribute.temperature.value <= 30 && attribute.temperature.value > 30`)
  - これにより「閾値クロス検出」「`draft` → `published` 等の状態遷移検出」「設定変更の監査ログ」「idempotent 更新の誤発火回避」など、現在値だけでは表現できないルールが直接記述可能になる。`change` 条件タイプの「何から何に変化したか不明」「同値再 update で誤発火」という限界を補完する
  - `docs/REACTIVCORE_RULES.md` の CEL Context Variables 表に `previous.attribute.<name>.value` / `.type` の行と `has()` ガードの注意書き、及び 4 種の使用例 (閾値クロス・状態遷移・新規属性追加検出・型変化検出) を追加
  - テスト: `tests/unit/core/rules/rule-engine.service.test.ts` に 12 ケース追加 (Boolean 状態遷移 / 閾値クロス成功 + 既に超過時の発火抑制 / 値変化 / `draft→published` ワークフロー / EntityCreated 時 `has(previous.*)` が false / has ガードによる安全なスキップ / 直接アクセスでの catch / EntityDeleted 時の previous 露出 / 新規追加属性検出 / type フィールドアクセス)。E2E は `tests/e2e/features/auth/rules.feature` に閾値クロス・状態遷移の 2 シナリオを追加
- **SDK**: anonymous モードを追加 (issue #1105) (#1113)
  - `new GeonicDB({ anonymous: true, tenant, baseUrl })` で token 取得・`Authorization` ヘッダ送信を完全にスキップしてリクエストできるようにした。サーバー側 (`optionalAuth`) で `role: 'anonymous'` として通り、`anonymous` ロールに対する XACML カスタムポリシーが認可判定する。GeoJSON 公開ビューア / BI ダッシュボード / 公的データ可視化のような「未登録閲覧者にも公開リソースを返したい」公開アプリで、ログインフォームを挟まずに SDK が使えるようになる
  - `apiKey` と同時指定はコンストラクタで throw (token 取得経路と相互排他)。`login()` / `setCredentials()` で認証付きへ昇格でき、`logout()` で再び anonymous へ戻る (`db.isAnonymous()` で現在状態を確認可能)
  - anonymous リクエストの 401 / 403 はトークン再取得ループに入らず透過。XACML Deny がそのまま呼び出し側に届く
  - WebSocket は `connect()` 時点で明示的に throw (サーバー `local-ws-server.ts` が token 必須)。WS の anonymous 対応は別 issue へ送る
  - 関連: `src/sdk/auth.ts` (`AuthManager._anonymous` / `isAnonymous()` / `request()` 分岐), `src/sdk/index.ts` (オプション透過 / `db.isAnonymous()`), `src/sdk/types.ts` (`GeonicDBOptions.anonymous`), `src/sdk/websocket.ts` (anonymous 時の `connect()` ガード), `tests/unit/sdk/auth.test.ts` / `tests/unit/sdk/index.test.ts` (happy 4 / unhappy 5 シナリオ追加)、`docs/SDK.md`、`src/sdk/README.md`
- **認可**: NGSI-LD Subscription 作成時に購読対象属性を XACML AuthzRequest へ inject (issue #1104) (#1112)
  - `POST /ngsi-ld/v1/subscriptions` の認可判定で、これまで `body.type === "Subscription"` がそのまま `resource.entityType` に乗っていた問題を修正。代わりに `entities[]` 各要素から購読対象の `entityType` / `entityId` / `entityIdPattern` を抽出し、`notification.endpoint.uri` を `resource.notificationEndpoint` として inject する (#1112)
  - `entities[]` が複数要素を持つ場合は **all-Permit セマンティクス**で評価。1 件でも非許可 (Deny / NotApplicable / Indeterminate) があれば全体を Deny する。最初の要素だけ許可しておけば後続を抜けられる、という抜け穴を防ぐ (#1112)
  - 新しい resource 属性で「`anonymous` は `entityType=ActivityLog` の購読のみ許可」「`notificationEndpoint` が `https://*.example.com/**` の subscription のみ許可 (SSRF / データ持ち出し対策)」のような型ベース・URI ベース制御が XACML カスタムポリシーで書けるようになる (#1112)
  - 関連: `src/core/auth/policy/policy.types.ts` (AuthzRequest.resource 拡張)、`src/core/auth/policy/policy.pip.ts` (`extractSubscriptionAuthzAttributes` / `buildSubscriptionAuthzRequests` 追加)、`src/core/auth/policy/policy.pdp.ts` (`entityIdPattern` / `notificationEndpoint` 属性対応)、`src/api/shared/middleware/authz.middleware.ts` (subscription 用 all-Permit 評価パス)、`docs/AUTH.md` 追記 (#1112)
  - locus サンプルアプリ (#1103) で「ActivityLog 以外の subscription を弾く」厳密ポリシーが書けるようになる (#1112)
- **セキュリティ**: PoW 難易度を 4 → 16 ビットに引き上げ (issue #1093) (#1110)
  - `src/config/defaults.ts` の `PROOF_OF_WORK.DIFFICULTY` を `4` → `16` に変更。平均 SHA256 計算回数 16 → 65,536 で GPU バースト bot の単発成功コストを引き上げ
  - 1 次防御は IP / OAuth client_id ベースのレート制限 (#1075)。PoW は副次防御だが、4 ビットでは最新 GPU で数 μs で解けるため抑止力として弱く、16 ビットへ引き上げ
  - SDK (`src/sdk/pow.ts`) は `difficulty` パラメータ可変対応済 (`MAX_ITERATIONS=1M`、Web Crypto バッチ処理) のためクライアント互換性影響なし。サーバ側 `MAX_PROOF_VALUE: 1_000_000` 内で 99.99999% の確率で proof が見つかる
  - テスト: `tests/unit/core/auth/pow/pow.service.test.ts` の `default difficulty` 期待値と探索条件 (先頭 16 ビット 0) を更新
- **セキュリティ**: `MONGODB_ENFORCE_SECRETS=true` で `MONGODB_URI` 環境変数経路を fail-closed に禁止 (issue #1086) (#1111)
  - `src/infrastructure/mongodb/client.ts` の `getMongoUriAsync()` を改修。`HA.SECRETS_MANAGER.MONGODB_ENFORCE_SECRETS` (env 由来、`@config/defaults`) が真のとき:
    - `MONGODB_URI_ARN` 未設定なら起動時に throw (ARN 必須)
    - ARN 設定済だが Secrets Manager 取得失敗時も throw (env フォールバックなし)
  - SAM template (`infrastructure/template.yaml`) の `ApiHandlerFunction` Environment で `MONGODB_ENFORCE_SECRETS: 'true'` を設定し、Lambda 本番デプロイをデフォルト hardened 化。Docker Smoke E2E / ローカル `npm start` / dev/test では未設定のまま env URI で起動可能。Docker / EC2 で本番運用する場合は運用者が明示的に `MONGODB_ENFORCE_SECRETS=true` を設定する
  - 当初 `NODE_ENV=production` で判定 → Docker Smoke E2E が壊れる → `AWS_LAMBDA_FUNCTION_NAME` 判定に変更 → CodeRabbit 指摘で「ランタイム種別ではなく中央設定 flag に」と最終的に再変更
  - メモリダンプ / CloudWatch ログ汚染で平文認証情報が露出する経路を塞ぐ fail-closed 設計。`docs/SECURITY.md` に挙動マトリクスを追記
  - テスト: `tests/unit/infrastructure/mongodb.test.ts` に `getMongoUriAsync` の 5 ケース (enforce + ARN 未設定・enforce + fetch 失敗・enforce + secret 取得・unset env フォールバック × 2) を追加

### 2026-04-30
- **セキュリティ**: Lambda IAM の `kms:CreateKey` に Condition を追加し用途・タグを強制 (issue #1071) (#1108)
  - `infrastructure/template.yaml` の `ApiHandlerFunction.Policies` 内 `kms:CreateKey` Statement に `Condition` を追加: `kms:KeyUsage = ENCRYPT_DECRYPT` / `kms:KeySpec = SYMMETRIC_DEFAULT` / `aws:RequestTag/geonicdb:purpose = envelope-encryption` を強制し、未知タグキーは `ForAllValues:StringEquals` の `aws:TagKeys` で `geonicdb:tenantId` / `geonicdb:purpose` のみに制限。`Null: aws:RequestTag/geonicdb:tenantId = false` で tenant 所有情報のないキー作成を禁止
  - `Resource` は AWS 仕様上 `kms:CreateKey` (new-resource action) では `'*'` 必須のため変更しない。代わりに `kms:TagResource` を別 Statement として `arn:aws:kms:${AWS::Region}:${AWS::AccountId}:key/*` で許可し、`CreateKeyCommand` の `Tags` パラメータ適用に必要な権限を Region/Account 制限付きで付与
  - 実コード (`src/infrastructure/kms/key-manager.ts createTenantKey()`) は既に上記タグ・KeyUsage・KeySpec で発行しているため非破壊。compromised Lambda が署名鍵・非対称鍵・無タグキー・tenantId 不明のキーを量産する経路を抑止
- **セキュリティ**: API Gateway `GatewayResponses` の `Access-Control-Allow-Origin` を Parameter 化 (issue #1088) (#1108)
  - 新 Parameter `GatewayResponseAllowOrigin` を追加 (デフォルト `*` で互換維持)。`infrastructure/template.yaml` の `DEFAULT_4XX` / `DEFAULT_5XX` で `!Sub "'${GatewayResponseAllowOrigin}'"` を参照
  - 本番デプロイ時は `--parameter-overrides GatewayResponseAllowOrigin='https://app.example.com'` で許可 origin に限定可能。Lambda 経由の通常応答は `src/api/shared/middleware/cors.middleware.ts` の origin echo back + `tenant.allowedOrigins` で制御 (#1069 で導入済)
  - これにより Lambda が呼ばれない API Gateway 直返しエラー応答経由でのエラーボディ漏洩経路 (任意 origin からの fetch) を本番で塞げるようにする
- **セキュリティ**: XACML ポリシー登録時に WS ⊂ GET 不変条件違反を WARN ログで検出 (issue #1085) (#1109)
  - `PolicyService.validateWsGetSymmetry()` を追加。`createPolicy` / `updatePolicy` / `updatePolicySystem` / `updatePolicyForUser` の各経路で、`rule.target.actions` に `attributeId === 'method'` かつ `matchValue === 'WS'` (`string-equal`) のエントリがあり、同じ rule に `'GET'` が含まれていない場合に WARN ログを出力
  - `authorizeWs()` (`src/core/auth/policy/policy.pip.ts`) は WS と GET を両方評価し両方 Permit でないと許可しない設計のため、WS-only ルールは管理者意図と実挙動が乖離しやすい (例: 「WS だけ Deny」を意図しても GET 経由でデータが取得可能)。reject ではなく WARN に留めることで既存ポリシーとの後方互換を維持
  - `docs/AUTH.md` に「WebSocket Authorization (WS ⊂ GET)」セクションを追加し、不変条件・推奨記法・WARN ログの読み方を明示
  - テスト: `tests/unit/core/auth/policy/policy.service.test.ts` に 7 ケース (WS-only / WS+GET / GET-only / glob matchFunction / 非 method attributeId / actions なし / updatePolicy・updatePolicySystem 経由) を追加

- **セキュリティ**: 公開エンドポイントレート制限の部分失敗時のロールバック実装 (issue #1075 follow-up) (#1102)
  - 旧挙動: `consumeBucket()` で 3 つの時間窓（minute/hour/day）を `Promise.all` で並列更新していたため、一部の窓で例外（DDB / Mongo の一時障害等）が発生した場合、成功した窓だけトークンが消費されたまま残り、後続リクエストがその窓を不当に削られる「過大カウント」が発生していた。また制限超過拒否時にも、拒否された窓以外で消費が成立しているケースがあり同様の不整合が起きていた
  - 対応:
    - `Promise.allSettled` で 3 窓を並列更新し、(a) 一部 throw 時は **値が非負で fulfilled** な窓だけを負 weight で `updateBucket` し直してトークンを返却（ロールバック）した上で元の例外を再 throw、(b) 制限超過拒否時にも拒否された窓以外で消費が成立した窓を同様にロールバック
    - **negative-value guard**: `updateBucket` は条件失敗時に負値を fulfilled として返すが、その場合 DDB の SET / Mongo の $inc は実行されず消費は成立していない。これを誤ってロールバックすると過大トークンが加算されるため、ロールバック対象は `r.value >= 0` の fulfilled 結果のみに限定（CodeRabbit 指摘 #1102 の追加修正）
    - DDB の `ConditionExpression: remainingTokens - :consumed >= 0` は負 `:consumed` を常に満たすため `SET remainingTokens = remainingTokens - (-weight)` で加算復元される。Mongo の `$inc: { remainingTokens: -tokensToConsume }` も負 `tokensToConsume` で `+weight` の `$inc` として正しく動作することを確認済み
    - ロールバック自体が失敗した場合は黙って許容（過大カウント方向の安全な失敗モード）。Promise.all reject 時は呼び出し側 (`enforcePublicRateLimit`) で fail-open 扱いとなり公開エンドポイントを落とさない
  - テスト: 既存 11 ケースに加え、ロールバック挙動を検証する 6 ケースを追加（一部 throw 時の正しいロールバック対象選択、negative-value 混在時のロールバック対象除外回帰テスト、全窓 throw 時のロールバック発火なし、ロールバック失敗時の握り潰し、制限超過拒否時の整合性確保、全成功時のロールバック非発火）
  - PR #1101 への CodeRabbit レビュー指摘 (`src/core/quotas/rate-limit/public-rate-limit.service.ts` lines 97-101) への follow-up

- **セキュリティ**: 公開（未認証）エンドポイントに IP ベースのレート制限を導入 (issue #1075) (#1101)
  - 旧挙動: `/.well-known/ai-plugin.json` `/.well-known/agent-card.json` `/.well-known/ngsi-ld` `/openapi.json` `/api.json` `/tools.json` `/llms.txt` および `/oauth/token` `/auth/refresh` `/auth/nonce` には一切のレート制限が掛かっておらず、テナント単位の `checkRateLimit()` も認証後にしか発火しないため事実上無制限だった。OAuth `client_id+secret` のオフラインなしブルートフォース、重い JSON 生成 (`/openapi.json` 等) の連打による Lambda 同時実行枠枯渇 (DoS) が成立していた (#1101)
  - 対応 (#1101):
    - `src/core/quotas/rate-limit/public-rate-limit.service.ts` を新設し、既存の `providers.rateLimit` (DynamoDB / MongoDB トークンバケット) を再利用しつつ IP / OAuth `client_id` 別バケットでレート制限を行う `checkPublicRateLimit()` / `checkOAuthClientRateLimit()` を追加
    - `src/handlers/api/index.ts` に `enforcePublicRateLimit()` ヘルパーと `isPublicMetadataPath()` / `extractOAuthClientId()` を追加し、メタデータ系・OAuth・auth refresh / nonce のディスパッチ前に呼び出す。`/auth/login` は既存の `LoginProtectionService` で保護されているため除外、`/health` `/version` は監視ポーリング用途のため除外
    - **早期発火**: 公開パスのレート制限チェックを `Promise.all([resolveJwtSecret(), getMongoClient()])` および `resolveHostnameContext()` よりも前に実行し、レート制限超過時に JWT 秘密の解決・Mongo 接続・ホスト名 DDB 参照を全てスキップ。これによりレート超過リクエストの Lambda CPU 消費とコールドスタート待機を最小化
    - `src/config/defaults.ts` に `PUBLIC_RATE_LIMIT` を新設しカテゴリ別 (metadata / oauth / auth) のデフォルト値を集約。OAuth は IP 別バケットに加えて `client_id` 別バケットも併用してパスワードスプレー対策。`DISCOVERY` 定数に `OPENAPI_JSON_PATH` / `API_JSON_PATH` / `NGSI_LD_WELL_KNOWN_PATH` を追加してパス文字列を集約
    - バケットストア障害時は安全側に倒さず通過させる (公開エンドポイントを落とさない)。`TooManyRequestsError` 経由で 429 + `Retry-After` ヘッダを返す
  - テスト: `tests/unit/core/quotas/rate-limit/public-rate-limit.service.test.ts` に 11 ケース、`tests/unit/handlers/api/index.test.ts` に「公開エンドポイントのレート制限 (#1075)」13 ケースを追加 (Basic Auth / form-urlencoded / JSON ボディからの `client_id` 抽出、429 + Retry-After、`/auth/refresh` と `/auth/nonce` 両方の確認、`/health` `/auth/login` の除外、ストア障害フォールバック) (#1101)

- **セキュリティ**: PBKDF2 反復回数を `NODE_ENV` 依存から固定定数に変更 (issue #1073) (#1100)
  - 旧挙動: `process.env.NODE_ENV === 'test'` の三項演算で iter=1000 / 100000 を切り替えていたため、CI/CD や Lambda 環境変数の誤設定で `NODE_ENV=test` が混入すると本番ハッシュ計算が 100 倍弱体化する経路があった
  - 修正: `src/config/defaults.ts` に `PASSWORD_HASH` ブロックを新設し、`PBKDF2_ITERATIONS: 100000` (本番固定値) / `KEY_LENGTH` / `SALT_LENGTH` / `DIGEST` を集約。`password.service.ts` は `NODE_ENV` を一切参照しない
  - テスト用オーバーライドは独立した環境変数 `PASSWORD_HASH_ITERATIONS_TEST` を明示設定した時のみ有効化 (正の整数チェック)。Jest / Cucumber 両セットアップでこの変数を `'1000'` に設定
  - 起動時 (初回 hash 呼び出し時) に反復回数を INFO ログに出力し、誤設定の回帰を CloudWatch から検知可能化
  - テスト: `password.service.test.ts` に新規 6 ケース (override 適用 / 不正値拒否 / NODE_ENV 非依存性) を追加

- **[Breaking] WebSocket 認証**: URL クエリパラメータ `?token=` 経路を完全廃止 (issue #1072) (#1099)
  - 旧挙動: `extractWebSocketToken()` (`src/handlers/websocket/connect.ts`) と `extractLocalWebSocketToken()` (`src/core/streaming/local-ws-server.ts`) が `Authorization` ヘッダ / `Sec-WebSocket-Protocol` に加え、フォールバックとして `?token=<jwt>` URL クエリも受領していた (deprecation warning ログのみで実利用許可) (#1099)
  - 攻撃面: URL に乗ったトークンはリバースプロキシ / WAF / LB のアクセスログに記録され、ブラウザ履歴やキャッシュにも残存。`Referer` ヘッダ経由で外部に漏洩する経路もあり (Referrer-Policy 未設定と相乗) (#1099)
  - 対応: query token 抽出ロジックを auth flow の最先頭に移動して **fail-closed** 化。クエリに `token` が含まれていれば、たとえ有効な `Authorization` ヘッダや `Sec-WebSocket-Protocol` が併送されていても warn ログを残した上で `null` を返し、1008 / 401 で接続を拒否する。URL は既に上流プロキシのログに記録された後なので、トークンは漏洩済みとして扱う (#1099)
  - クライアント影響: 既存クライアントはトークンを以下のいずれかに移行する必要がある (#1099)
    - **Node.js / 自前 WebSocket クライアント**: `Authorization: Bearer <token>` ヘッダ
    - **ブラウザ**: 標準の `WebSocket` API は任意ヘッダ設定不可のため、`new WebSocket(url, ['access_token', token])` 形式の `Sec-WebSocket-Protocol` サブプロトコル
  - 関連プロジェクト確認: `@geolonia/geonicdb-sdk` (`src/sdk/websocket.ts`) は既に `Sec-WebSocket-Protocol` 採用済 → SDK ユーザ (geonicdb-pulse / geonicdb-voice) はノーオペで移行可能。geonicdb-cli / geonicdb-app-template は WebSocket 未使用、geonicdb-demo-app の `use-geonicdb-stream.ts` も query token 未使用 (#1099)
  - ドキュメント更新: `docs/EVENT_STREAMING.md`、`docs/INSTRUCTION.md` (7.2 接続方法 / 7.6 実装例)、`src/api/shared/controllers/meta.controller.ts` (`/llms.txt` の Event Streaming セクション・`/api.json` の `eventStreaming.auth`) から `&token=...` の記述を除去し、ヘッダ 2 経路に書き換え。`?token=` 経由の接続は拒否される旨を明示 (#1099)
  - テスト: `tests/unit/handlers/websocket/connect.test.ts` / `tests/unit/core/streaming/local-ws-server.test.ts` に「クエリ `?token=` だけの接続は 401 / 1008 で拒否される」「ヘッダと query token を併送しても query があれば fail-closed」回帰テストを追加。warn ログ送出も spy で固定。既存テストは Bearer ヘッダ送信に書き換え。E2E `tests/e2e/step-definitions/common/websocket.steps.ts` の `connectWebSocket` ヘルパーも `Authorization` ヘッダ送信に変更し、url/options 構築は `buildLocalWsConnection` ヘルパーに共通化 (#1099)

### 2026-04-29
- **CORS / セキュリティ**: Origin echo back + テナント単位 `allowedOrigins` でトークン漏洩・CSRF 経路を遮断 (issue #1069) (#1097)
  - 旧挙動: `Access-Control-Allow-Origin: '*'` を返しつつ `Authorization` / `X-Api-Key` / `DPoP` を `Access-Control-Allow-Headers` に含めていたため、攻撃者制御のサイトからブラウザに乗ったユーザの Bearer トークン / API Key 付きリクエストを送らせる経路が成立していた (CSRF + トークン漏洩懸念) (#1097)
  - 環境変数による単一ホワイトリストは GeonicDB がマルチテナント・データ連携基盤 (Context Broker) であるため不適切。許可 origin はテナント運用者がランタイムに DB 越しで設定できる設計に変更 (#1097)
  - **データモデル拡張**: `TenantSettings.allowedOrigins?: string[]` を追加 (`src/core/auth/tenant/tenant.types.ts`)。`undefined` = 後方互換で全許可、`[]` = 全 deny、`['*']` = 全許可、`[origin1, ...]` = 完全一致。最大 50 個 (`TENANT.MAX_ALLOWED_ORIGINS`) (#1097)
  - **CORS middleware の echo back 化** (`src/api/shared/middleware/cors.middleware.ts`): `Access-Control-Allow-Origin` をリクエストの `Origin` ヘッダ echo back に変更し、`Vary: Origin` を必ず付与。CDN / ブラウザキャッシュで origin 別レスポンスが混ざらないようにする (#1097)
  - **認証層での fail-close** (`src/core/auth/origin/origin-check.ts` 新設、`src/api/shared/middleware/auth.middleware.ts` に統合): preflight (OPTIONS) は origin 検証なしで通過させ、実 request の認証フェーズで `validateOriginForTenant()` が違反を 403 で fail-close する。data API は `optionalAuth(event, tenantService)` で、admin API / `/auth/logout` は `requireAuth(event)` で `user.tenantId` から tenant を引いて検証 (#1097)
  - **エラー時も CORS ヘッダ echo back**: 403 を返すケースでも `Access-Control-Allow-Origin` / `Vary: Origin` を付ける。echo back しないとブラウザはレスポンスを完全ブロックして「Network error」になり、運用者にも原因が見えないため (#1097)
  - **共通 OriginSchema 切り出し**: API Key の `OriginSchema` を `src/api/admin/schemas/origin.schemas.ts` に共通化し、API Key と Tenant の両方で再利用 (#1097)
  - **Admin API**: `PATCH /admin/tenants/{tenantId}` の `settings.allowedOrigins` で CRUD 可能 (zod `OriginSchema.array().max(50)` バリデーション) (#1097)
  - **super_admin はテナントに紐付かない (tenantId=null) ため origin 検証 skip**。認証無効モード (`AUTH_ENABLED=false`) も従来通り origin 検証 skip — IP 制限と同じ扱い (#1097)
  - テスト: `validateOriginForTenant` unit test (13 ケース)、`cors.middleware.test` を echo back / Vary / extractRequestOrigin で更新 (28 ケース)、`auth.middleware.test` に origin 検証 13 ケース追加。`cors-comprehensive.feature` に `@issue-1069` シナリオ 10 件追加 (origin echo back / preflight 通過 / tenant allow/deny / wildcard / 空配列 / Origin 不在 / 後方互換) (#1097)
  - 関連プロジェクト影響: geonicdb-cli は `Origin` ヘッダを送らないため API Key / Bearer 認証で動作するが、絞り込み済みテナントには CLI 利用者が `Origin` ヘッダ付与か `*` 許可が必要。geonicdb-pulse / voice / demo-app は SDK 経由で `Origin` 自動付与のため、本番テナントの `allowedOrigins` に `https://*.geolonia.com` 等の登録運用が必要 (#1097)

- **セキュリティ監査バッチ**: 総合監査 (#1068) の互換性影響なし issue 5 件を一括対応 (#1098)
  - `TestPasswordHasher` を `tests/` 配下に移動。本番モジュールから SHA-256 / salt なしのテスト用ハッシャー export を削除し、誤注入経路を排除 (#1077)
  - ログイン失敗経路 (user not found / env super admin password mismatch) にダミー PBKDF2 検証を追加。timing-based user enumeration を防ぐため、応答時間を均等化 (#1095)
  - `loadBoundPolicy()` のテナント不一致 / global→tenant 違反バインドを `error` レベル + `errorCode` / `securityEvent` 構造化フィールドに昇格。CloudWatch メトリクスフィルタで検知可能化 (#1081)
  - `validateAllowedPath()` にパストラバーサル拒否 (`..`, `//`, `/./`) を追加。string-prefix チェックでの誤評価を防御層として完全排除。テスト 6 ケース追加 (#1083)
  - `docs/AUTH.md` に「Path-Level vs Entity-Level Authorization」節を追加。`requireAuthz` (fail-closed) と `requireEntityAuthz` (fail-open) の設計判断と運用上の含意 (owner-only ポリシーは明示的 Deny ルールが必要) を明文化 (#1076)

### 2026-04-28
- **CORS 修正**: `Access-Control-Allow-Headers` に `If-None-Match` / `If-Modified-Since` を追加 (#1065)
  - 旧設定では cross-origin リクエストにこれら 2 ヘッダーが allow されていなかったため、ブラウザの HTTP cache auto-revalidation と SDK の `_cachedRequest` が CORS preflight (OPTIONS) で reject され、INM 付き GET を送ることができなかった (#1065)
  - 結果として PR #1060 (SDK invalidation 削除) / #1062 (CORS expose ETag) / #1063 (Cache-Control: no-cache strip) という 3 段の修正が揃っていても、INM そのものがブラウザから出ないため 304 経路全体が機能していなかった (incident 2026-04-28: pulse で SDK cache が効かない現象の最終真因) (#1065)
  - 修正: `src/config/defaults.ts` に `CORS_ALLOW_HEADERS` 定数を新設し `If-None-Match` / `If-Modified-Since` を含めた完全な allow-list を集約。`cors.middleware.ts` と `infrastructure/template.yaml` (Cors.AllowHeaders / GatewayResponses) は同定数に同期 (#1065)
  - 検証方法: `curl -X OPTIONS -H 'Access-Control-Request-Headers: if-none-match' <endpoint>/ngsi-ld/v1/entities` で `If-None-Match` が allow-headers に含まれることを確認 (#1065)
  - テスト: cors.middleware.test に `If-None-Match` / `If-Modified-Since` の allow ケースを追加。cors-comprehensive.feature に `@issue-1065` シナリオ 2 件追加 (#1065)

- **デプロイ可視化**: `/version` エンドポイントの `git_hash` フィールドにコミット SHA を埋め込み (#1064)
  - `infrastructure/template.yaml` に `GitHash` パラメータを追加し、Lambda 環境変数 `GIT_HASH` として注入 (#1064)
  - `deploy-env.yml` で `GitHash=${{ github.sha }}` を SAM パラメータに渡す (staging / prod 両経路対応) (#1064)
  - 用途: staging / prod でデプロイ済みのコミットを `curl /version` で即時確認できるようにする。デプロイ問題の切り分けが従来 CloudFormation event log まで遡らないと判明しなかったが、これで一発で分かる (#1064)

- **条件付きリクエスト修正**: `Cache-Control: no-cache` リクエストヘッダーを INM 評価から除外 (#1063)
  - 旧挙動: `fresh` パッケージが RFC 2616 §14.9.4 に従いリクエストの `Cache-Control: no-cache` を "force reload" として扱い、`If-None-Match` 一致でも 304 を返さず常に 200 + body を返却していた (#1063)
  - ブラウザは特定の context (ハードリロード後の継続フェッチ等) で `Cache-Control: no-cache` を fetch に自動付与するため、SDK が明示的に `If-None-Match` を送っていてもサーバが 304 を返さなくなり、SDK の帯域節約が常に死ぬ問題が発生 (incident 2026-04-28: pulse で SDK キャッシュが効いているように見えて毎回 200 が返る現象の真因) (#1063)
  - 修正: `evaluateConditionalRequest` の `normalizeRequestHeaders` でリクエストヘッダーから `cache-control` を除外。SDK の明示的な `If-None-Match` 送信 = 「同じなら 304 で OK」という意思表示なので、ブラウザ自動付与の `Cache-Control: no-cache` で 304 を抑制しないのが正しい (#1063)
  - `Cache-Control: no-store` (CDN bypass 意図) は引き続き `honorClientNoStore` で適切に扱う (本修正は INM 評価のみ影響) (#1063)
  - テスト: `evaluateConditionalRequest` unit test に Cache-Control: no-cache + INM / + IMS の 2 ケース追加。`http-cache-control.feature` に NGSIv2 単一 entity / NGSI-LD list の 2 シナリオ追加 (#1063)

- **CORS 修正**: `Access-Control-Expose-Headers` に複数のレスポンスヘッダーを追加 (#1062)
  - **ETag / Vary**: 旧設定では `ETag` が CORS で隠され、ブラウザ JS から `res.headers.get('etag')` が `null` を返していたため、SDK がキャッシュエントリを作れず `If-None-Match` も送れず、304 帯域節約パスが完全に機能していなかった (incident 2026-04-28: pulse で SDK キャッシュが一切効かなかった真因) (#1062)
  - **Content-Crs**: NGSI-LD / NGSIv2 の geo response で CRS を通知するヘッダー。ブラウザクライアントが座標系を判別するために必要 (#1062)
  - **Fiware-Next-Token**: NGSIv2 ページネーション継続トークン。クライアントが次ページをリクエストするために必要 (#1062)
  - **NGSILD-Warning**: NGSI-LD federation warning。クライアントに警告を通知するために必要 (#1062)
  - **Retry-After**: 429 rate limit / 503 retry-after 案内。クライアントが retry 戦略を決めるために必要 (#1062)
  - `Cache-Control` / `Last-Modified` / `Content-Type` 等は CORS-safelisted なので expose 不要 (#1062)
  - 漏れ検出: 全エンドポイント response header を grep して CORS expose リストと突合し、missing 4 件 (Content-Crs / Fiware-Next-Token / NGSILD-Warning / Retry-After) を発見・追加 (#1062)
  - 設定値は `src/config/defaults.ts` の `CORS_EXPOSE_HEADERS` (`as const` 配列) に集約 (#1062)

- **セキュリティ**: Dependabot アラート 13 件を一括解消 (#1061)
  - 直接依存 (overrides 経由): `hono` ^4.12.14, `@hono/node-server` ^1.19.13 — JSX SSR HTML injection / cookie name 検証 / IPv4-mapped IPv6 / serveStatic / toSSG path traversal を解消 (#1061)
  - 間接依存 (overrides 追加): `protobufjs@<8` ^7.5.5 (任意コード実行), `basic-ftp` ^5.3.1 (CRLF injection / DoS), `follow-redirects` ^1.16.0 (Authorization ヘッダーリーク), `uuid` ^14.0.0 (バッファ境界) (#1061)
  - `npm audit` で 0 vulnerabilities を確認 (#1061)

- **SDK パフォーマンス修正**: WebSocket entity events での自動キャッシュ無効化を削除 (#1060)
  - 旧実装: `entityCreated` / `entityUpdated` / `entityDeleted` 受信時に SDK が `_invalidateCacheForEntityEvent()` で全 entities cache エントリを `deleteWhere` で削除していた (#1060)
  - 削除すると ETag も失われ、次回読み取りで `If-None-Match` が送られず、サーバは毎回 full `200` body を返却 → 304 帯域節約パスが完全に死んでいた (#1060)
  - data エンドポイントは `Cache-Control: private, no-cache` で毎回 revalidation されるため、cache を残しても安全 (server 側 ETag マッチで 304 / 200 が自動的に振り分けられる) (#1060)
  - 結果: pulse 等のリアルタイム監視アプリで WebSocket 受信中にキャッシュが効くようになり、unchanged data の再取得が 304 で済むようになる (#1060)
  - 明示的に全クリアしたい場合は `clearCache()` を呼ぶ (公開 API なので未変更)。`clearCache()` で `cacheInvalidated` イベントが発火するように修正 — WebSocket 経路を削除した結果、このイベントが発火しなくなる退行を回避 (#1060)

- **セキュリティ強化**: Security Audit Group 3 — 公開 vs 認証境界の網羅検証 (#1057)
  - **#1053: 公開メタエンドポイントに STATIC ポリシーを適用** — `/llms.txt`, `/api.json`, `/openapi.json`, `/tools.json`, `/.well-known/ai-plugin.json`, `/.well-known/agent-card.json` の 6 エンドポイントが `Cache-Control` を返していなかった (CDN がキャッシュ判断できず、コスト・レイテンシが悪化)。`applyCachePolicy('static')` を適用して `Cache-Control: public, max-age=3600` を返すよう修正。ただし `/openapi.json` は tenant 依存の `CustomDataModel_*` を埋め込むケースがあるため、注入された場合のみ `meta` ポリシーへフォールバック (#1057)
  - **#1053: STATIC ポリシーの Vary を最小化** — STATIC は cross-tenant で共有可能なため、`Vary` を `Accept` のみに制限。`Fiware-Service` / `Authorization` / `X-Api-Key` を含めると CDN がテナント / ユーザ毎にキャッシュ分離してしまい、STATIC の意義 (CDN 広域共有) が損なわれる (#1057)
  - **#1053: lint test 追加** — `meta.controller.test.ts` に「Cache-Control policy assignment lint」を新設。各公開エンドポイントが `public, max-age=3600` を返し、`private` / `no-cache` を含まないこと、`Vary` がテナント / 認証次元を含まないこと、`/openapi.json` の tenant スキーマありケースで `meta` フォールバックが効くことを 12 ケースで検証 (#1057)
  - **#1048: Vary 網羅性 audit + 文書化** — 現状の `Vary` (`Fiware-Service, Fiware-ServicePath, Authorization, X-Api-Key, Accept`) が網羅的であることを確認。`DPoP` (per-request)、`Accept-Language` (NGSI で使われない)、`Origin`、`X-Forwarded-For` (auth 段階で評価) を意図的に除外することを `docs/SECURITY.md` に明記 (#1057)
  - **#1052: DPoP / DPoP-Nonce × cache 検証 + 文書化** — `DPoP-Nonce` が 304 passthrough whitelist に既に含まれていることを unit test で固定。DPoP 認証失敗が `evaluateConditionalRequest` より前に評価される invariant を `docs/AUTH.md` / `docs/SECURITY.md` に明記 (#1057)
  - **ドキュメント**: `docs/SECURITY.md` に「Vary Header Coverage Audit」「DPoP / DPoP-Nonce & Cache Integrity」「Public vs Authenticated Endpoint Cache Policy Matrix」3 セクション追加。`docs/AUTH.md` に「DPoP & HTTP Cache Interaction」サブセクション追加 (#1057)

### 2026-04-28
- **セキュリティ強化**: Security Audit Group 2 — 認可整合性 (#1056)
  - **#1049: HMAC ベース ETag** — ETag 生成を `createHash` から `createHmac(algo, secret)` に変更。鍵は `ETAG_HMAC_SECRET` 環境変数から取得し、本番 (`ENVIRONMENT='prod'`) では未設定なら fail-fast で起動失敗。dev/test では documented なフォールバックを使う。これまで決定的だった ETag が攻撃者に再現不能化され、`If-None-Match` 試行による `modifiedAt` / 件数ブラインド情報リークを根本的に排除。同テナント内の正規ユーザは同じ鍵で計算されるため 304 帯域節約は維持 (#1056)
  - **#1050: XACML ポリシー Revoke 後のキャッシュ整合性** — handler の評価順 (`requireAuthz` → controller → `evaluateConditionalRequest`) を unit test で固定 (jest `invocationCallOrder` で controller 含めた順序を検証)。`requireAuthz` が throw した場合、catch 経路が 4xx を返し controller / `evaluateConditionalRequest` を経由しないため、認可剥奪後に旧 ETag の `If-None-Match` が 304 で旧 view を resurface することはない。E2E では実 ETag を取得後に認証/テナントを変更して投げ直し、4xx が返ることを検証 (#1056)
  - **テスト**: cache-control middleware unit test に HMAC 関連 6 ケース追加 (異なる secret / 同 secret stable / 環境変数 fallback / prod fail-fast / prod with secret OK)。handler unit test に `#1050` regression test 2 ケース追加 (controller 未呼び出し検証 + invocationCallOrder で順序固定)。`policy-enforcement.feature` に `@issue-1050` シナリオ 2 件追加 (実 ETag を取得 → 認証クリア / 別テナントへの切替後 INM が 304 にならず 4xx) (#1056)
  - **ドキュメント**: `docs/AUTH.md` に「Policy Propagation Delay & HTTP Cache Integrity」セクション新設 (PolicyService cache TTL: 60s 仕様化)。`docs/SECURITY.md` に「HMAC-Based ETag」「Policy Revocation & Cache Integrity」サブセクション追加。`docs/ENV.md` / `infrastructure/template.yaml` に `ETAG_HMAC_SECRET` 追加 (#1056)

### 2026-04-28
- **セキュリティ強化**: Security Audit Group 1 — Cache-Control / ETag の即値強化 (#1055)
  - **#1047: 共有キャッシュ汚染防止** — data エンドポイントの `Cache-Control` を `no-cache` から `private, no-cache` に変更。RFC 7234 §5.2.2.6 の `private` で CloudFront / 中間プロキシ / ISP プロキシでの保存を禁止し、ブラウザ等の private cache のみを許容。`Authorization` 付きレスポンスがブラウザ disk cache に乗らない問題 (Chrome/Safari の挙動) も同時に解消 (#1055)
  - **#1051: テナント間 ETag 衝突防止** — `deriveEtagScope(event)` の seed に `Fiware-Service` + `Fiware-ServicePath` を追加。Vary が壊れた中間キャッシュ越しでも ETag 値そのものがテナント / サブテナント間で必ず異なることを保証。`Authorization` / `X-Api-Key` は seed に含めない (同テナント内の別ユーザは 304 で帯域節約できるべきで、テナント seed が認可境界として十分) (#1055)
  - **テスト** (#1055): cache-control middleware unit test に scope 検証 4 ケース追加 (cross-tenant / cross-servicePath / case-insensitive header lookup)。`http-cache-control.feature` に `@issue-1047` シナリオ 3 件、`@issue-1051` シナリオ 3 件追加
  - **ドキュメント** (#1055): `docs/API.md`, `docs/API_NGSIV2.md`, `docs/API_NGSILD.md`, `docs/INSTRUCTION.md`, `docs/SECURITY.md` に `private, no-cache` ポリシーと tenant-scoped ETag を反映

### 2026-04-27
- **セキュリティ / バグ修正**: HTTP キャッシュコントロール監査で検出した 4 件のバグを修正 (#1054)
  - **B-1: Accept ヘッダー違いで body が異なるのに ETag 同一** — `Accept: application/json` (257B) と `application/ld+json` (476B、`@context` 含む) で body は明確に異なるが ETag が完全一致する weak validator 違反 (RFC 7232 §2.3.3)。shared cache が cross-Accept で 304 を返し、クライアントが間違った形式の body を replay する誤動作を確認 (#1054)
  - **B-2: 別エンドポイント間で空リスト ETag が衝突** — `/v2/subscriptions` と `/ngsi-ld/v1/csourceRegistrations` 等が共に空 (count=0) のとき同一 ETag。subscription の ETag を csourceRegistrations の `If-None-Match` に投げると 304 が返り、URL を cache key に使わない中間層で誤配信されうる (#1054)
  - **B-3: HEAD メソッドが 405** — RFC 7231 §4.3.2 違反。HEAD は GET 対応リソースで MUST サポートだが、ルーティング層で全 GET エンドポイントが 405 を返していた (#1054)
  - **B-4: temporal endpoint が cache control middleware の管轄外** — `/ngsi-ld/v1/temporal/entities` 系が `Cache-Control` も `Vary` も付けずに返していた (#1054)
  - **対策実装** (#1054):
    - `cache-control.middleware.ts` — `deriveEtagScope(event)` を新設し、ETag 計算 seed に `path + Accept` を混ぜることで B-1 / B-2 を一括解消。`createListEtagBuilder(scope)` / `generateEntityEtag(scope, modifiedAt)` シグネチャ変更
    - 全 controller (NGSIv2/NGSI-LD の entities / subscriptions / registrations / csource-subscriptions) が `deriveEtagScope(event)` を渡すよう更新
    - `handlers/api/index.ts` — HEAD リクエストを内部で GET にフォールバックし、`addCorsHeaders` ラッパーで最終 body を抑止 (成功・エラー両経路)
    - `temporal.controller.ts` の GET 4 経路に `applyCachePolicy('data')` を適用
    - `local-server.ts` — Express の自動 ETag 生成を `app.set('etag', false)` で無効化。ローカル開発でも本番 (API Gateway + Lambda) と同じ挙動を再現
    - **追加カバレッジ**: NGSIv2 / NGSI-LD の attribute-level GET エンドポイント (`/v2/entities/{id}/attrs`, `/v2/entities/{id}/attrs/{name}`, `/v2/entities/{id}/attrs/{name}/value`, `/ngsi-ld/v1/entities/{id}/attrs/{name}`) も `applyCacheHeaders` 経由で ETag/Last-Modified/Cache-Control/Vary を返すよう追加。Express auto-ETag 無効化に伴うキャッシュ無し状態を回避
  - **テスト** (#1054): cache-control middleware unit test に scope 検証 11 ケース追加。`http-cache-control.feature` に B-1 / B-2 / B-3 / B-4 シナリオ 7 件追加。`head-requests.feature` を 200 期待形に書き換え (HEAD が GET 等価で動作することを検証)
  - **ドキュメント** (#1054): `docs/API.md` に Temporal クラス追加、ETag scope (path + Accept) の説明追加、HEAD サポート明記、attribute-level エンドポイント追加

## [0.4.0] — 2026-04-27

### 2026-04-27
- **Feature**: SDK クライアントキャッシュ Phase A — `@geolonia/geonicdb-sdk` に in-memory cache + ETag/304 自動ハンドリング + リクエスト重複排除 + ETag ベースの `poll()` API を追加 (#1043)
  - `src/sdk/cache.ts` — `SdkCache` (LRU、`maxEntries` 制限、URL+method キーで `etag` / `lastModified` / `data` / `headers` を保持) (#1043)
  - `src/sdk/auth.ts` `request()` — GET / HEAD では cache 経由で `If-None-Match` / `If-Modified-Since` を自動付与し、304 受信時は cached body を 200 として透過的に返却。304 で更新された validator を cache に再反映 (#1043)
  - 同一 path への in-flight 重複リクエストを 1 つにまとめる dedup を追加 (#1043)
  - `src/sdk/index.ts` — `db.poll(params, { interval, onData, onNoChange, onError })` を新設。ETag を比較して未変更時は転送ゼロ。`handle.stop()` で停止。`interval` の入力検証あり (#1043)
  - WebSocket の `entityCreated` / `entityUpdated` / `entityDeleted` 受信時にキャッシュを自動無効化 (#1043)
  - 認証コンテキスト (`login()` / `setCredentials()` / `logout()`) の切替時に cache + in-flight dedup を自動破棄 — クロスユーザー漏洩対策 (#1043)
  - `GeonicDBOptions` に `cache` / `cacheMaxEntries`、`GeonicDBEventMap` に `cacheHit` / `cacheMiss` / `cacheInvalidated` を追加 (#1043)
  - SDK 設定値 (`SDK_CACHE_MAX_ENTRIES_DEFAULT` / `SDK_POLL_INTERVAL_MS_DEFAULT`) を `src/config/defaults.ts` に集約 (#1043)
  - `docs/SDK.md` / `src/sdk/README.md` 更新 (#1043)
  - Phase B (Service Worker + オフラインファースト) は #1044 で対応予定 (#1043)
- **Chore**: 依存関係の一括アップデート — 12個の Dependabot PR をまとめて適用
  - npm: `@cucumber/cucumber` 12.8.1→12.8.2, `eslint` 10.2.0→10.2.1, `mongodb` 7.1.1→7.2.0, `@opentelemetry/auto-instrumentations-node` 0.72.0→0.73.0, `@opentelemetry/exporter-trace-otlp-http` 0.214.0→0.215.0, `typescript-eslint` 8.58.2→8.59.0, `@aws-sdk/*` 3.1032.0→3.1037.0 (9パッケージ)
  - GitHub Actions: `docker/setup-qemu-action` v3→v4, `docker/setup-buildx-action` v3→v4, `docker/login-action` v3→v4, `docker/metadata-action` v5→v6, `docker/build-push-action` v6→v7
  - `typescript-eslint` 8.59.0 で新しく検出された `no-unnecessary-type-assertion` を `eslint --fix` で一括修正、`no-base-to-string` 違反を `isSimpleValue` の型ガード化で解消、未使用 import 3件を削除
- **Fix**: `GET /v2/entities/{entityId}` および `GET /ngsi-ld/v1/entities/{entityId}` に entity-level XACML 認可チェック (`checkEntityOwnership`) が抜けていた既存問題を修正 (#1028)
  - XACML 統合 (#748) リファクタリング後の漏れ。他の操作 (PATCH/PUT/DELETE/属性取得) では呼ばれていたが、GET 単一取得だけ不在だった (#1028)
  - 影響: entity-level policy (`resource.entityId` / `resource.entityOwner` ベース) が GET で無視され、Phase 2 の cache control と組み合わさると認可剥奪後も 304 で古いキャッシュが返るリスクがあった (#1028)
  - 修正: NGSIv2 / NGSI-LD の `getEntity` で `await this.checkEntityOwnership(...)` を呼ぶよう追加。E2E に「entity-level Deny → 403」「Permit → ETag → policy 更新で Deny → If-None-Match で 403 (304 ではない)」の 2 シナリオ追加 (#1028)
  - 同時に entity-ownership.feature と instruction.feature の `deny-non-owner-write` ポリシーで `target.actions` が指定されておらず GET にも誤って Deny が効いてしまっていた既存の policy 設計の不備を修正。`PATCH/PUT/DELETE` のみに限定 (#1028)
- **Feature**: HTTP キャッシュコントロール Phase 2 — レスポンスに `Cache-Control` / `Vary` ヘッダーを付与し、エンドポイント別ポリシーとクライアント主導 `no-store` 上書きをサポート (#989)
  - data API (entities / subscriptions / registrations / csourceSubscriptions): `Cache-Control: no-cache` (#989)
  - meta API (types / attributes): `Cache-Control: max-age=60, stale-while-revalidate=120` (#989)
  - 全レスポンスに `Vary: Fiware-Service, Fiware-ServicePath, Authorization, Accept` を付与し、CloudFront 等のエッジキャッシュでテナント分離を保証 (#989)
  - クライアントが `Cache-Control: no-store` リクエストヘッダーを送信した場合、レスポンスの `Cache-Control` を `no-store` で上書き (#989)
  - `applyCachePolicy()` ヘルパー追加。ETag を持たない API (types / attributes) にも Cache-Control + Vary を一貫して適用 (#989)
- **Feature**: HTTP キャッシュコントロール Phase 1 — GET エンドポイントに `ETag` / `Last-Modified` を導入し、`If-None-Match` / `If-Modified-Since` による条件付きリクエスト (304 Not Modified) をサポート (#1026)
  - 対象: `/v2/entities`, `/v2/subscriptions`, `/v2/registrations`, `/ngsi-ld/v1/entities`, `/ngsi-ld/v1/subscriptions`, `/ngsi-ld/v1/csourceRegistrations`, `/ngsi-ld/v1/csourceSubscriptions` の一覧 / 単一取得 (#1026)
  - リスト用 ETag は各要素の `id + modifiedAt` のストリーミングハッシュ + 総件数のダイジェスト (RFC 7232 §2.3.2 weak validator として正確)、単一用 ETag は `modifiedAt` のハッシュ (#1026)
  - `fresh` モジュールで RFC 7232 準拠の評価（弱い ETag、ワイルドカード、HTTP-date）(#1026)
  - 304 レスポンスは ETag / Last-Modified / Cache-Control / Vary / CORS / 相関 ID / トレースを保持 (#1026)
- **Feature**: A2A (Agent-to-Agent) プロトコル Phase 1 対応 (#1025)
  - `GET /.well-known/agent-card.json` — Agent Card 配信（5スキル: entities, batch, temporal, config, admin） (#1025)
  - `POST /a2a` — JSON-RPC 2.0 エンドポイント。`message/send`, `tasks/get`, `tasks/list`, `tasks/cancel` メソッドに対応 (#1025)
  - MongoDB `a2aTasks` コレクションによる Task 状態管理（ライフサイクル: submitted → working → completed/failed/canceled、TTL 30日） (#1025)
  - 既存 MCP ツール 5つを A2A スキルにマッピング。サービス層を直接呼び出し (#1025)
  - `@a2a-js/sdk` v0.3.13 を活用（`JsonRpcTransportHandler` + `DefaultRequestHandler`） (#1025)

## [0.3.0] — 2026-04-24

### 2026-04-24
- **Feature**: カスタムデータモデルに `additionalProperties` フィールドを追加。`false` 指定でモデル未定義の属性を拒否する厳格モードを有効化。デフォルトは `true`（NGSI-LD の自然な挙動を維持） (#1007)
- **Feature**: SDK に型付きエラークラスを導入。`GeonicDBError` 基底クラスと `AuthenticationError`, `AuthorizationError`, `NotFoundError`, `ConflictError`, `ValidationError`, `RateLimitError`, `NetworkError` を追加。`instanceof` でエラー種別を判定可能に (#1008)
- **Feature**: SDK WebSocket イベント（`entityCreated`/`entityUpdated`/`entityDeleted`）に `entity` フィールドを追加。`id` + `type` + `data` から構築した完全な NGSI-LD エンティティオブジェクトを直接取得可能に (#1009)
- **Feature**: SDK に `debug` オプションを追加。有効時に HTTP リクエスト/レスポンス、WebSocket 接続・イベント、トークンリフレッシュをコンソールにログ出力 (#1010)

### 2026-04-23
- **Feature**: ReactiveCore Rules のクロスプロトコル エンティティ生成 (#1004)
  - `createEntity` / `updateAttribute` / `deleteAttribute` アクションに `protocol` フィールドを追加（NGSIv2 ↔ NGSI-LD の壁を越えた操作が可能に）
  - `createEntity` に `servicePath` / `scope` フィールドを追加（ターゲットの階層パスを制御）
  - servicePath ↔ scope の自動マッピング（NGSIv2 `/sensors` → NGSI-LD `["/sensors"]`）
  - `${trigger.protocol}`, `${trigger.servicePath}`, `${trigger.scope}`, `${trigger.service}` テンプレート変数を追加
  - Change Stream ハンドラが EntityDocument の `protocol` / `scope` をルールエンジンに伝播するよう修正
- **Improve**: WAF カスタムルール（RateLimitPerIP, SizeRestrictionBody10MB）にカスタムレスポンスを追加。アプリケーション互換の JSON エラーボディと適切な HTTP ステータスコード（429/413）を返すように改善 (#986)
- **Feature**: WAF ロギング設定を追加。BLOCK/COUNT アクションのみ記録し、マネージドルールのブロック原因をトレース可能に (#986)

### 2026-04-21
- **Fix**: WAF `SizeRestrictionBody10MB` ルールの `OversizeHandling: MATCH` により 8KB 超のリクエストが全て 403 Forbidden になる問題を修正 (#983)

### 2026-04-18
- **Breaking**: NGSIv2 と NGSI-LD のエンティティ分離・仕様準拠 (#966)
  - **プロトコルベースのエンティティ分離**: NGSIv2 で作成したエンティティは NGSIv2 からのみ、NGSI-LD で作成したエンティティは NGSI-LD からのみアクセス可能に
  - NGSI-LD API で `Fiware-ServicePath` ヘッダーを無視するよう修正（ETSI GS CIM 009 仕様準拠）
  - servicePath と scope を独立した概念として維持
  - NGSIv2 `servicePath` built-in attribute を追加（`?attrs=servicePath` で取得可能）
  - 既存エンティティ（`protocol` フィールドなし）は NGSI-LD 扱い

### 2026-04-14
- **Release**: SDK v0.2.0 — `count()` と `requestRaw()` メソッドを追加 (#928)
- **Change**: SDK ライセンスを AGPL-3.0 から MIT に変更（本体は AGPL-3.0 のまま） (#942)
- **Remove**: 内蔵 SDK 配信エンドポイント（`/sdk/v1/geonicdb.js`, `/sdk/v1/geonicdb.d.ts`）を削除。npm / unpkg CDN から取得する方式に統一 (#942)

### 2026-04-10
- **Fix**: ユニークインデックスをテナントスコープ化 — policies, policySets, apiKeys, oauthClients, rules の ID がテナント内で一意に変更。異なるテナント間で同一 ID を使用可能に (#896)
- **Feature**: MCP ツールの NGSI-LD クエリパラメータを大幅拡張 (#898)
  - `entities` ツール: `idList`, `idPattern`, `orderBy`, `orderDirection`, `sysAttrs`, `pick`, `omit`, `scopeQ`, `lang`, `geoproperty`, `spatialId`, `spatialIdDepth` を追加
  - `batch` ツールの `query` アクション: `orderBy`, `orderDirection`, `sysAttrs` を追加
  - `entityToKeyValues` に `sysAttrs`（`createdAt`/`modifiedAt` 出力）と `distance` 出力を追加
  - `orderBy` の `!` プレフィックスによる降順指定をサポート
  - CSV パラメータの空要素フィルタリングを追加
  - MCP ツールを NGSI-LD に統一（NGSIv2 固有パラメータ `mq`, `typePattern` を削除）
  - `/tools.json` AI ディスカバリーエンドポイントを同期

### 2026-04-09
- SDK を TypeScript で書き直し、npm パッケージ `@geolonia/geonicdb-sdk` として公開可能に
- Types/Attributes Discovery, Temporal API, Batch Operations の convenience methods を追加 (#832)
- `setCredentials()` の `expiresIn: 0` が無視されるバグを修正 (#876)

### 2026-04-08
- **Feature**: カスタムデータモデルの JSON-LD `@context` URI 改善 (#858)
  - `propertyDetails` に `@context` フィールドを追加（既存語彙 URL の指定が可能に）
  - 自動生成 URI を URN → URL に移行（`https://geonicdb.geolonia.com/vocab/{tenantId}/{propertyName}`）
  - 属性 URI をエンティティタイプから独立させ、テナント内で再利用可能に
  - MCP ツール / llms.txt / openapi.json に schema.org 語彙サジェスト指示を追加

### 2026-04-07
- **Fix**: 不正な GeoJSON データが存在する場合のインデックス初期化失敗を自動回復 — 問題のあるエンティティを隔離して `2dsphere` インデックスを再構築 (#857)
- **Fix**: WAF `EC2MetaDataSSRF_BODY` ルールが `allowedOrigins` 内の `localhost` URL を SSRF として誤検知しブロックする問題を修正 (#848)
- **Fix**: WAF `CrossSiteScripting_BODY` ルールが `allowedOrigins` 内の URL を XSS と誤検知し API キー作成が 403 になる問題を修正 (#846)

### 2026-04-05
- **Breaking**: `onTokenRefresh(callback)` を廃止し `on('tokenRefresh', cb)` イベントに統一 (#831)
- **Change**: `request()` がエラーチェック + JSON パース済みの値を返すように変更（生 Response → `Promise<Object|string|null>`） (#831)
- **Feature**: `GET /sdk/v1/geonicdb.d.ts` エンドポイントを追加 — TypeScript 型定義を配信 (#831)
- **Docs**: `setCredentials()` で Bearer + refreshToken を指定すると DPoP/PoW を完全にバイパスする旨を明記 (#831)

### 2026-04-04
- **Feature**: JavaScript SDK に公開 API メソッドを追加 — 内部メソッドへの依存を排除 (#830)
  - `setCredentials()`: 外部認証トークンの注入（Bearer JWT セッション等） (#830)
  - `onTokenRefresh(callback)`: トークンリフレッシュ時のコールバック登録 (#830)
  - `request(method, path, body)`: 認証付き汎用 API リクエスト (#830)
  - `reconnect()`: WebSocket 強制再接続 (#830)
  - `isConnected()`: WebSocket 接続状態の確認 (#830)
  - WebSocket ライフサイクルイベント追加: `connected`, `disconnected`, `reconnecting` (#830)
  - SDK ファイル冒頭に JSDoc 型定義を埋め込み — AI コーディングアシスタントが自動的に全 API を把握可能 (#830)

### 2026-04-01
- **Fix**: WAF `SizeRestrictions_BODY` ルールがリクエストボディ 8KB 以上で 403 Forbidden を返す問題を修正 (#813)
  - `AWSManagedRulesCommonRuleSet` から `SizeRestrictions_BODY` を除外
  - 代替としてカスタム 10MB ボディサイズ制限ルールを追加（API Gateway REST API 上限と一致）

### 2026-03-25
- **Feature**: `POST /me/api-keys/{keyId}/refresh` & `POST /admin/api-keys/{keyId}/refresh` で API キーのローテーション機能を追加 (#798)
- **Breaking**: `keyPrefix` フィールドを `ApiKeyPublic` レスポンスから削除 (#798)
- **Breaking**: 新規 API キーの `keyId` を `gdb_` + UUID 形式から素の UUID 形式に変更（既存キーは後方互換で維持） (#798)
- **Change**: API キー一覧・詳細レスポンスに `key: "******"` マスク表示を追加 (#798)
- **Perf**: コールドスタート時の初期化を並列化 — 最大 1000ms 短縮 (#775)
  - `handlers/api/index.ts` で `resolveJwtSecret()` と `getMongoClient()` を `Promise.all` で並列実行
  - Secrets Manager 解決（〜100-500ms）と MongoDB 接続確立（〜500-1000ms）を直列から並列に変更
- **Security**: `updatePolicy` の TOCTOU 競合状態を Optimistic Locking で修正 (#784) (#793)
  - `Policy`/`PolicyDocument`/`PolicyPublic` に `version: number` フィールドを追加
  - `PolicyRepository.updatePolicy()` にバージョンフィルタ（`findOneAndUpdate` で `version` 一致確認）を追加
  - バージョン不一致時に `ConflictError` (409) を返す
  - 既存ドキュメント（`version` フィールドなし）は `version: 0` として移行互換対応
- **Security**: `permit-overrides` 結合アルゴリズムを `super_admin` 以外に禁止（defense in depth） (#785) (#793)
  - `validateCombiningAlgorithm()` に `actorRole` パラメータを追加
  - `tenant_admin`/`user` が `permit-overrides` を指定した場合 `ForbiddenError` (403) を返す
  - 更新時に `ruleCombiningAlgorithm` を指定しない場合も既存値（有効アルゴリズム）を検証

### 2026-03-24
- **Perf**: テナントデータ二重取得の排除 (#776)
  - `handlers/api/index.ts` のリクエストボディサイズチェックで `tenantData` を直接更新するよう修正
  - レート制限無効かつリクエストボディあり時に、ボディチェックとレスポンスサイズチェックで計2回発生していた `TenantRepository.getByName()` を1回に削減
- **Perf**: policyId バインドポリシーのキャッシュ追加 (#777)
  - `PolicyCache` に `getPolicy/setPolicy` メソッドを追加（TTL: 60秒）
  - `PolicyService.loadBoundPolicy()` でキャッシュを参照し、カスタムポリシーを持つテナントの認証フローで MongoDB ラウンドトリップを削減
- **Perf**: API Gateway gzip 圧縮を有効化（MinimumCompressionSize: 1024）(#791)
  - 1KB 以上のレスポンスを自動 gzip 圧縮 — Entity リスト等で 60〜75% の転送量削減
- **Perf**: Lambda アーキテクチャを ARM64 (Graviton2) へ移行 (#791)
  - 全 Lambda 関数を arm64 に統一 — 約 20% の CPU 処理速度向上
- **Perf**: Lambda メモリサイズを 256MB → 512MB に引き上げ (#791)
  - CPU 割り当て倍増により JSON シリアライズ・MongoDB クエリ・XACML 評価を高速化
- **Perf**: esbuild Minify を有効化してバンドルサイズを削減 (#791)
  - 全 Lambda ハンドラのコードバンドルを minify — 推定 30〜50% サイズ削減、コールドスタート短縮
- **Security Fix**: path 属性に対する `string-regexp` matchFunction を禁止 (#788)
  - `validateNonEscalatingPolicy` 内でポリシーレベル・ルールレベル両方の path 属性に `matchFunction: 'string-regexp'` が指定された場合に `ForbiddenError` を返すよう修正
  - 正規表現によるパスプレフィックス制約バイパスを防止（代替: `glob` を使用）
- **Security Fix**: API Key 更新時の `policyId` バリデーションに `minPriority` チェックを追加 (#788)
  - `ApiKeyService.updateKey()` で `validatePolicyId()` に `ROLE_MIN_PRIORITY[actor.role]` を渡すよう修正
  - `tenant_admin` が priority < 10 のポリシーを API Key にバインドできる権限昇格を防止
- **Fix**: `DELETE /me/policies/{policyId}` で tenant_admin が自分のポリシーを削除できない問題を修正 (#790)
  - tenant_admin の場合、`createdBy` 一致 または テナントスコープ一致（`tenantId` 一致）でアクセス許可
  - 旧データ（`createdBy: null`）も tenant_admin は削除・更新・取得可能に
  - GET・PATCH も同一ロジックで統一（`checkOwnershipOrTenantScope` 導入）
- **Fix**: DPoP Nonce リトライ時の 400 エラーをブラウザコンソールから排除 (#758)
  - `POST /auth/nonce` レスポンスに `dpop_nonce` フィールドを追加（RFC 9449 §8 準拠）
  - SDK が事前取得した `dpop_nonce` を使って最初から nonce 付き DPoP proof を送信
  - ページロード後初回のトークン取得で発生していた `400 use_dpop_nonce` ハンドシェイクを回避

### 2026-03-23
- **Feature**: PATCH /me/api-keys/{keyId} と PATCH /me/oauth-clients/{clientId} を実装 (#791)
  - 自分が作成した API キー・OAuth クライアントの属性を部分更新可能に
  - 更新可能フィールド（API キー）: `name`, `allowedOrigins`, `policyId`, `rateLimit`, `dpopRequired`, `isActive`
  - 更新可能フィールド（OAuth クライアント）: `name`, `description`, `policyId`, `isActive`
  - `policyId` バインドは `createdBy === actor.id` チェック済み — 自分が作成したポリシーのみ許可
  - API キー作成時（POST /me/api-keys）にも `policyId` 指定が可能に

### 2026-03-21
- **Breaking**: API キー・OAuth クライアントのフィールド変更 (#759)
  - API キー: `allowedScopes`, `allowedEntityTypes`, `permissions` フィールドを削除、`policyId`（オプション）を追加
  - OAuth クライアント: `clientName` を `name` にリネーム、`allowedScopes` を削除、`policyId`（オプション）を追加
  - 自動生成ポリシー（`__apikey_*` プレフィックス、`buildAutoPolicy`、`syncAutoPolicy`）を廃止
  - `policyId` で既存の XACML ポリシーをクレデンシャルに紐付け可能（紐付けポリシーの Target はバイパス）
  - `policyId` 未指定時はテナントポリシー + ロールデフォルトにフォールバック
- **Fix**: XACML Target の同一 `attributeId` 複数値が OR 評価されるように修正 (#756)
  - 同一 `attributeId` 内の複数 `matchValue` を OR（いずれかマッチ）で評価
  - 異なる `attributeId` 間は AND（全てマッチ必須）を維持
  - これにより `actions` に `POST` と `PATCH` を並記して複数メソッドを許可可能に

### 2026-03-20
- **Feature**: API キー作成時に XACML ポリシーを自動生成する (#749)
  - `permissions` フィールド（`read`/`write`/`create`/`update`/`delete`）を指定するだけで XACML ポリシーが自動生成
  - `write` は `create` + `update` + `delete` のエイリアス
  - `allowedEntityTypes` との連動でエンティティタイプ制限付きポリシーも自動生成
  - API キー削除時にポリシーも連動削除
  - `permissions` 未指定時は既存動作と同一（デフォルト Deny）
- **Feature**: XACML resource 属性に `servicePath` を追加 (#750)
  - `Fiware-ServicePath` ヘッダーの値をポリシー評価に使用可能に
  - glob パターン（例: `/opendata/**`）でサービスパス階層のアクセス制御が可能
  - 正規表現マッチ（`string-regexp`）にも対応
- **Feature**: XACML 認可一元化 — 5層の認可ロジックを統合 (#748)
  - ロールごとのデフォルトフォールバックポリシーを追加: user (readonly), api_key (全Deny), anonymous (全Deny)
  - entity-type ミドルウェアを廃止（`allowedEntityTypes` フィールドは ApiKey モデルに残存）
  - テナントフィーチャーフラグを全廃（`apiKeysEnabled`, `oauthClientsEnabled`, `anonymousAccessEnabled`）
  - scope/resource-scope ミドルウェアを廃止（XACML ポリシーに統合）
  - **破壊的変更**: user ロール（ポリシーなし）は GET のみ Permit、api_key ロール（ポリシーなし）は全 Deny
  - **破壊的変更**: 未認証リクエストは 401 ではなく 403 を返す（anonymous として XACML 評価）

### 2026-03-19
- **Fix**: `api_key` ロールでポリシー未マッチ時に 403 エラーが返される問題を修正 (#744)
  - テナントに anonymous 用ポリシーのみ存在する場合、`api_key` ロールのリクエストが `NotApplicable` → `Deny` に変換されていた
  - `api_key` ロールはスコープベースのアクセス制御（`allowedScopes` / `allowedEntityTypes`）で制限済みのため、XACML ポリシー未マッチ時は `Permit` にフォールバックするように変更
  - 明示的な `Deny` ポリシーは引き続き有効

### 2026-03-18
- **Feature**: テナント単位の匿名アクセスポリシーをサポート (#730)
  - `anonymous` ロールを追加し、未認証リクエストにポリシー評価を適用
  - テナントフィーチャーフラグ `anonymousAccessEnabled`（デフォルト: false）でオプトイン制御
  - `optionalAuth()` ミドルウェア追加: 認証トークンがあれば検証、なければ匿名アクターとして通過
  - 匿名アクセスはポリシーで明示的に Permit されない限り Deny（fail-closed）
  - テナント管理者が XACML ポリシーで `role=anonymous` 向けのアクセス制御を定義可能
- **Fix**: SDK のエンティティ API パスを NGSIv2 (`/v2/entities`) から NGSI-LD (`/ngsi-ld/v1/entities`) に修正 (#728)
  - 全 CRUD メソッド (createEntity, getEntities, getEntity, updateEntity, deleteEntity) のパスを修正
  - Content-Type / Accept ヘッダーを `application/ld+json` に変更
  - エラーレスポンスの `detail` フィールド（NGSI-LD 形式）に対応
- **Fix**: API Gateway レベルの CORS 設定に DPoP ヘッダーを追加 (#726)
  - `template.yaml` の `Cors.AllowHeaders` / `GatewayResponses` (4XX/5XX) に `DPoP` を追加
  - Lambda に到達しないプリフライト/エラーレスポンスでもブラウザから DPoP 送信可能に
- **Fix**: CORS ヘッダーに DPoP 関連ヘッダーを追加 (RFC 9449) (#725)
  - `Access-Control-Allow-Headers` に `DPoP` を追加（ブラウザからの DPoP proof 送信を許可）
  - `Access-Control-Expose-Headers` に `DPoP-Nonce` を追加（クライアント JS での nonce 読み取りを許可）

### 2026-03-17
- **Breaking**: `write:X` スコープが `read:X` を暗黙的に含まなくなった (#723)
  - 問い合わせフォームなどの write-only ユースケースで、読み取りアクセスを防止
  - `admin:X` → `read:X` / `write:X` の包含は維持
  - 読み書き両方必要な場合は `read:X write:X` を明示的に付与すること
- **Fix**: ユーザー作成・更新時に指定された `tenantId` のテナント存在確認を追加 (#722)
  - 存在しないテナントIDでユーザーを作成すると 400 エラーを返す
  - ユーザー更新時のテナント移動先も同様に検証（`null` への変更は許可）
  - `UserService` に `TenantService` を注入しバリデーション層で整合性を担保

### 2026-03-12
- **Fix**: ログイン時のテナントヘッダー（`NGSILD-Tenant` / `Fiware-Service`）フォーマット検証を追加 (issue #708) (#711)
  - 不正な形式のヘッダー値で 400 エラーを返す
- **Fix**: テナント名フォーマットバリデーションを Zod スキーマに追加 (issue #709) (#711)
  - `POST /admin/tenants` および `PATCH /admin/tenants/{tenantId}` で `^[a-z0-9_]+$` を強制
  - 大文字・ハイフン・スペース等を含む名前は 400 エラー
- **Feat**: ログイン時の `NGSILD-Tenant` / `Fiware-Service` ヘッダーによるテナント指定をサポート (issue #710) (#711)
  - 優先順位: `body.tenantId` > `NGSILD-Tenant` ヘッダー > プライマリテナント
  - ヘッダー値からテナント名でテナントを解決（存在しない場合は 400 エラー）

### 2026-03-10
- **Feat**: DPoP (Demonstration of Proof-of-Possession) トークンバインド (#707)
  - RFC 9449 準拠: ECDSA P-256 鍵ペアによるトークン所有証明
  - `/oauth/token` で DPoP proof 付きトークン交換 → `token_type: "DPoP"` + JWT `cnf.jkt` バインド
  - API リクエストごとに DPoP proof を検証（`htm`/`htu`/`ath` チェック）
  - `dpopRequired` API キーフラグ: DPoP proof なしのトークン交換を拒否
  - SDK: `crypto.subtle` で非抽出鍵ペア生成、自動 proof 付与
  - WebSocket: Post-Connect DPoP binding (`dpop_bind` メッセージ)
  - DPoP-Nonce (RFC 9449 §8): サーバー発行 nonce によるプリコンピュート防止。ステートレス HMAC 方式（TTL: 300秒）
  - `use_dpop_nonce` エラーコード + `DPoP-Nonce` レスポンスヘッダーによる自動リトライフロー
  - Bearer フォールバック: DPoP 非対応クライアントは従来通り Bearer トークンで動作

### 2026-03-09
- **Fix**: `POST /admin/api-keys` で `tenantId` を必須バリデーションに変更 (#704)
  - super_admin が `tenantId` なしでキーを作成すると 400 エラーを返す
  - スキーマレベルで `null` / 空文字を拒否（`tenant_admin` は省略可、セッションから自動設定）
  - サービス層で super_admin の `tenantId` 必須チェックを追加

### 2026-03-08
- **Feat**: JS SDK + API キートークン交換エンドポイント (#689)
  - `POST /auth/nonce`: Nonce + Proof of Work チャレンジ発行（API キー + Origin バインド）
  - `POST /oauth/token` (`grant_type=api_key`): API キー → セッション JWT 交換
  - `GET /sdk/v1/geonicdb.js`: ブラウザ用 JavaScript SDK 配信
  - セキュリティ多層構造: Origin 検証 → HMAC Nonce → PoW → 短命 JWT（1h）
- **Fix**: `allowedOrigins: []`（空配列）で作成された API キーが一切使用不能になるバグを修正 (issue #678) (#687)
  - Create/Update 両スキーマに `.min(1)` バリデーションを追加
  - 全オリジン許可には `["*"]` を使用
- **Feat**: APIキーの `allowedEntityTypes` ランタイムエンフォースメント (#688)
  - エンティティ作成・取得・更新・削除時にAPIキーの許可タイプを検証
  - 一覧取得時に `type` フィルタを自動注入
  - バッチ操作で全エンティティタイプを一括検証
  - NGSIv2・NGSI-LD 両APIに対応

### 2026-03-07
- **BREAKING**: `super_admin` ロールの権限をプラットフォーム管理操作（`/admin/*`, `/auth/*`）のみに制限 (#674)
  - データ API（`/v2/*`, `/ngsi-ld/*`, `/catalog*`, `/rules*`）へのアクセスは 403 Forbidden
  - MCP ツールのデータ操作も同様に拒否
  - `AUTH_ENABLED=false` 時の匿名 super_admin は従来通りアクセス可能（後方互換）
- **Feat**: APIキー認証基盤の追加 (`/admin/api-keys`, `/me/api-keys`) (#676)
- **Feat**: テナント単位フィーチャーフラグ (`features.apiKeysEnabled`, `features.oauthClientsEnabled`) の追加 (#676)
- **Feat**: X-Api-Key ヘッダーによる認証のサポート (#676)
- **BREAKING**: `OAUTH_ENABLED` 環境変数の廃止（OAuth は `AUTH_ENABLED=true` なら常に有効） (#676)

### 2026-03-06
- **Fix**: 認証無効時に `/me` エンドポイントが匿名ユーザー情報を返すように修正 (#663)
- **Feat**: `limit=0` と `count` の組み合わせによるカウントのみクエリをサポート (#664)
- **Feat**: XACML AuthzRequest に entityType 自動抽出を追加 (#665)
  - PIP 拡張: `?type=` クエリパラメータまたはリクエストボディの `type`/`@type` フィールドから entityType を自動抽出
  - パスレベル認可（`requireAuthz`）でもエンティティタイプに基づくアクセス制御が可能に
  - E2E テスト追加: エンティティタイプによる書き込み拒否・読み取り拒否シナリオ
- **Fix**: `PATCH /entities/{id}/attrs` で新規属性の追加が可能に & NGSI-LD orderBy テスト追加 (#666)
- **Feat**: XACML エンティティ単位のオーナーシップ制御 (#650)
  - `EntityDocument` に `createdBy` フィールドを追加（エンティティ作成者の記録）
  - PIP（Policy Information Point）拡張: `buildAuthzRequest` にエンティティコンテキスト（`entityId`/`entityType`/`entityOwner`）を渡せるように
  - PDP（Policy Decision Point）拡張: リソース属性 `entityId`/`entityType`/`entityOwner` のマッチング対応
  - `${subject.userId}` 等のテンプレート変数展開（XACML AttributeDesignator 相当の簡略化実装）
  - `requireEntityAuthz` ヘルパー関数追加（エンティティレベル PEP）
  - 後方互換性: 全フィールド optional、既存ポリシー・既存エンティティへの影響なし

### 2026-03-05
- **Feat**: ユーザー自身による OAuth Client Credentials セルフサービス (#642)
  - `POST /me/oauth-clients` — 自分用の OAuth クライアントを作成（シークレットは作成時のみ返却）
  - `GET /me/oauth-clients` — 自分が作成したクライアント一覧を取得
  - `DELETE /me/oauth-clients/:id` — 自分が作成したクライアントを削除
  - `POST /me/oauth-clients/:id/regenerate-secret` — クライアントシークレットの再生成
  - ユーザーあたり最大5クライアント、ロールベースのスコープ制限（user ロールは resource スコープのみ）
  - `OAuthClient` に `createdBy` フィールドを追加（所有者追跡）

### 2026-03-03
- **Docs**: CLI リファレンス (`docs/CLI.md`) を追加 (#632)
  - `@geolonia/geonicdb-cli` (`geonic` コマンド) の全コマンドリファレンス
  - インストール、認証、設定・プロファイル管理、入出力フォーマット
  - entities, batch, subscriptions, registrations, temporal, snapshots, rules, admin 等の全コマンド

### 2026-03-02
- **Fix**: Custom Data Model バリデーションの複数の不具合を修正 (#597)
  - `validateValueType()` の case mismatch を修正（PascalCase `"String"` 等が lowercase `'string'` と不一致で型チェックが無効化されていた）
  - `batchCreateEntities` / `batchUpsertEntities` にカスタムデータモデルバリデーションを追加（type 別キャッシュ付き）
  - `getActiveDataModel()` のフェイルオープン動作を修正（DB 障害時にバリデーションをスキップせずエラーを伝播）

### 2026-02-28
- **Feat**: Crypto-Shredding と削除完了レポート生成 (#554)
  - `DELETE /admin/tenants/{tenantId}?shred=true` で暗号化テナントの Crypto-Shredding を実行
  - KMS CMK の DisableKey → ScheduleKeyDeletion → 全テナントデータ物理削除 → テナント論理削除
  - 削除完了レポート自動生成（ISMAP/ISO 27001/NIST SP 800-88 準拠）
  - `GET /admin/tenants/{tenantId}/deletion-report` でレポート取得
  - CloudTrail 監査イベント取得（best-effort）
  - テナント論理削除（`status: 'deleted'`）とクエリからの自動除外
- **Infra**: 単一リージョン Staging デプロイ対応 (#571)
  - `HasSecondaryRegion` 条件追加: `SecondaryRegion=""` 時に `AWS::DynamoDB::Table` を使用
  - 3テーブル (DeploymentsTable, TokenInvalidationTable, UsageStatisticsTable) の単一リージョン版を追加
  - 環境変数・IAM ポリシー参照をネスト `!If` で切り替え
- **Infra**: Staging パラメータファイル追加 (#572)
  - `infrastructure/parameters/staging.json` を新規作成 (`Environment: staging`, `LogLevel: INFO`)
- **CI**: `ci.yml` に `workflow_call` トリガー追加 (#573)
  - CD ワークフロー (`deploy.yml`) から CI パイプラインを再利用可能に
- **CI**: CD パイプライン `deploy.yml` 新規作成 (#574, #575)
  - Staging: `main` マージで自動デプロイ（OIDC 認証、ヘルスチェック、デプロイ記録）
  - Production: `v*.*.*` タグで手動承認付きマルチリージョンデプロイ（Primary → Secondary → Route53）
  - `ci.yml` から `push: [main]` トリガーを削除（`deploy.yml` 経由の `workflow_call` に統合）

### 2026-02-27
- **Perf**: KMS Decrypt DEK キャッシュと並列数制限の導入 (#578)
  - 復号済み DEK をキャッシュし、同一エンベロープの繰り返し KMS DecryptCommand 呼び出しを排除
  - `ConcurrencyLimiter` により KMS API 並列呼び出しを制限（デフォルト: 10）
  - `entity.repository.ts`, `temporal.repository.ts`, `snapshot.repository.ts` のバッチ復号に適用
- **Feat**: 暗号化テナントでの時系列集計リクエストにランタイムチェックを追加 (#579)
  - `aggrMethod` パラメータ指定時に暗号化テナントを検出して 400 Bad Request を返却
  - 代替手段: `temporalValues` エンドポイントで復号後データを取得し、アプリケーション層で集計
- **BREAKING**: エンティティ ID の一意制約をテナントスコープ内で `entityId` 単独に変更 (#580)
  - インデックスを `(tenant, servicePath, entityId, entityType)` → `(tenant, servicePath, entityId)` に変更
  - 同一 ID で異なる type のエンティティ作成は `409 AlreadyExists` を返却
  - バッチ Upsert は `entityId` のみでマッチ（type の上書きが可能）
  - NGSIv2 の `?type=` パラメータによる type disambiguation を廃止
  - NGSI-LD の ID 一意セマンティクスと統一（GeonicDB 独自拡張）
- **Feat**: テナント単位 KMS CMK 導入と Envelope Encryption の実装 (#553)
  - テナント作成時に AWS KMS CMK を自動生成（`encryptionEnabled: true` 設定時）
  - エンティティ `attributes` フィールドを AES-256-GCM Envelope Encryption で暗号化
  - データキーキャッシュ（TTL/カウント/バイト制限）による KMS API 呼び出し最適化
  - テナント削除時の KMS 鍵無効化・削除スケジュール（Crypto-Shredding 対応）
  - 暗号化/非暗号化テナントの後方互換共存
  - Temporal/Snapshot リポジトリの暗号化統合
  - SAM テンプレート: KMS IAM ポリシー、DynamoDB SSE 設定、`EncryptionEnabled` パラメータ追加
  - 依存追加: `@aws-sdk/client-kms`

### 2026-02-25
- **Feat**: マルチリージョン HA アーキテクチャ Phase 1+2 (#557)
  - Active-Passive 構成 (Primary: ap-northeast-1, Secondary: ap-northeast-3)
  - ヘルスチェック強化: `/health`, `/health/live`, `/health/ready` に `region`, `regionRole` を追加
  - `/health/ready` を DynamoDB/EventBridge 深層チェック対応に拡張 (Route 53 フェイルオーバー用)
  - MongoDB クライアントに `readPreference`, `writeConcern`, `readConcern`, `retryWrites` の HA オプション追加
  - EventBridge イベントに `sourceRegion` メタデータを自動注入
  - Change Stream プロセッサのセカンダリリージョン自動無効化
  - Secrets Manager 統合 (JWT シークレット / MongoDB URI の安全な管理)
  - SAM テンプレート: `RegionRole` パラメータ、DynamoDB GlobalTable (3テーブル)、WAF、条件付きリソース
  - Route 53 フェイルオーバースタック (`infrastructure/template-route53.yaml`)
  - フェイルオーバー自動化 Lambda + SNS 通知
  - 依存追加: `@aws-sdk/client-secrets-manager`, `@aws-sdk/client-sns`
- **Feat**: テナント削除時の全関連データ連鎖削除を実装 (#556)
  - `DELETE /admin/tenants/{tenantId}` で全16コレクションのテナントデータを連鎖削除
  - Deactivate-first パターン: 削除前にテナントを自動的に `isActive: false` に設定
  - ユーザー存在チェック撤廃: ユーザーが存在するテナントも一括削除可能に
  - 削除順序: subscriptions → registrations → entities → snapshots → 設定 → 認証 → users → memberships
  - 各コレクションの削除件数を監査ログに記録
  - `TenantDataCleanupService` を独立サービスとして分離（Phase 2-3 Crypto-Shredding 拡張対応）

### 2026-02-24
- **Feat**: ReactiveCore Rules に `appendToTemporal` アクションタイプを追加 (#549)
  - エンティティ変更時にルールベースで Temporal API (Time Series Collection) へ自動追記
  - `attributes` で記録対象の属性を明示的に指定可能（省略時は `changedAttributes` を使用）
  - `TemporalService.recordEntityChange()` を内部的に呼び出し

### 2026-02-21
- **Fix**: minimatch ReDoS 脆弱性を修正 (Dependabot #5) (#537)
  - `minimatch` の npm override を追加し全インスタンスを `^10.2.1` に統一
  - ajv@6.12.6 (eslint devDependency) は 6.x 系にパッチなし、tolerable_risk として dismiss

### 2026-02-20
- **Feat**: リソーススコープ付きトークン Phase 1 (#536)
  - JWT にリソーススコープを埋め込み、エンティティタイプ/ID パターン/属性/操作レベルの細粒度アクセス制御を実現
  - `POST /auth/login` に `resourceScopes` パラメータ追加
  - OAuth `POST /oauth/token` に `resource_scopes` パラメータ追加
  - 書き込み操作の事前チェック（`checkResourceScopes`）: 許可外のエンティティ書き込みを 403 で拒否
  - 読み取りレスポンスの事後フィルタ（`filterByResourceScopes`）: 許可外のエンティティ/属性を除外
  - 後方互換: `resourceScopes` なし = 従来通りフルアクセス
- **Feat**: XACML ポリシー管理の tenant_admin 開放 (#531)
  - `/admin/policies` と `/admin/policy-sets` を `tenant_admin` に開放
  - ルーティング層の認証を `requireSuperAdminAuth` → `requireAdminAuth` に変更
  - サービス層の既存テナントスコープ制御により安全に制限（自テナントのみ）
  - `tenant_admin` が自テナントの `user` ロール向け XACML ポリシーを管理可能に
- **Feat**: マルチテナントメンバーシップ + テナントスコープトークン (#527)
  - FIWARE Keyrock Organization モデル準拠: 1ユーザーが複数テナントに所属可能
  - `tenant_memberships` コレクション追加（`userId + tenantId` ユニーク制約）
  - テナントメンバーシップ管理 API 4エンドポイント追加（PUT/DELETE/GET members, GET user tenants）
  - テナントスコープログイン: `POST /auth/login` に `tenantId` パラメータ追加
  - ユーザー作成時に自動メンバーシップ作成、テナント/ユーザー削除時にカスケード削除
  - JWT `tenantId` 単一値を維持し、既存認可ミドルウェアへの影響ゼロ
- **Feat**: `tenant_admin` が自テナント内のユーザー管理（CRUD）を実行可能に (#527)
  - FIWARE Keyrock の Organization Owner と同等の権限委譲モデルを採用
  - `/admin/users` パスの認証を `requireSuperAdminAuth` → `requireAdminAuth` に変更
  - サービス層の既存権限チェック（`checkCanCreateUser` 等）により安全に制限
  - `tenant_admin` は `user` ロールのみ作成可能（`super_admin` / `tenant_admin` 作成は 403）
  - 他テナントのユーザーへの操作は禁止（既存のテナント分離ロジック）

### 2026-02-19
- **Fix**: 認証付きローカルサーバー動作検証で発見されたバグ6件を修正 (#524)
  - ローカルサーバーに `express.urlencoded()` ミドルウェアを追加（OAuth フォームエンコードリクエスト対応）
  - XACML PDP の `matchFunction` 未指定時に glob パターン（`*` を含む matchValue）を自動検出するよう修正
  - XACML XML インポートで AttributeDesignator の属性順序に依存しないパーサーに改修
  - `PATCH /admin/policies/{policyId}` ルートを追加（405 → 200）
  - OAuth クライアントレスポンスのフィールド名を `client_secret` → `clientSecret` に統一（Admin API camelCase 規約）
  - ブルートフォース保護の `recordFailedAttempt()` からプログレッシブ遅延を削除（`checkLoginAllowed()` でのみ遅延を適用）
- **Fix**: XACML 仕様準拠レビューで発見された不適合を修正 (#524)
  - XACML エクスポートで glob matchFunction を `string-regexp-match` に正規表現変換して出力（XACML 3.0 に glob 関数は存在しないため）
  - glob 自動検出を GeonicDB 独自拡張として明示的にドキュメント化
- **Fix**: XACML ポリシー PDP の glob `/**` パターンがベースパス自体にマッチしないバグを修正
  - `/v2/entities/**` が `/v2/entities` にマッチしなかった問題 — 標準 glob 仕様では `/**` は「0個以上のパスセグメント」を意味する
  - `policy.pdp.ts` の glob 変換ロジックを `/.*` → `(/.*)?` に修正
- **Test**: XACML セキュリティ E2E テスト 22 シナリオ追加（`xacml-security.feature`）
  - バッチ操作・NGSI-LD 固有エンドポイント・PATCH/PUT/DELETE メソッド施行
  - ポリシー無効化・動的変更・クロス API 漏洩防止
  - ポリシー優先度競合・デフォルト決定エッジケース・email 属性制御
  - `/rules` エンドポイント施行・テナント分離 + XACML 複合テスト

### 2026-02-18
- **Fix**: E2Eテストで見逃された仕様準拠バグ10件を修正 (#520)
  - **[BREAKING]** NGSIv2 `Fiware-Total-Count` ヘッダーが `options=count` 指定時のみ返されるよう修正（仕様: NGSIv2 spec "Pagination" section）(#520)
  - **[BREAKING]** NGSI-LD `NGSILD-Results-Count` ヘッダーが `count=true` 指定時のみ返されるよう修正（仕様: ETSI GS CIM 009）(#520)
  - NGSIv2 `POST /v2/op/query` に `options=values`/`options=unique` サポートを追加（仕様: NGSIv2 spec "Representation Formats"）(#520)
  - NGSIv2 `POST /v2/op/query` に `orderBy` サポートを追加（仕様: NGSIv2 spec "Ordering Results"）(#520)
  - NGSIv2 `POST /v2/op/query` に `expression.mq` サポートを追加（仕様: NGSIv2 spec "Batch Operations"）(#520)
  - NGSIv2 `POST /v2/op/notify` を Zod スキーマバリデーションに移行（`Ngsiv2NotifySchema` 適用）(#520)
  - NGSIv2 `GET /v2/types?options=values` がタイプ名文字列配列を返すよう修正（仕様: NGSIv2 spec "Entity Types"）(#520)
  - NGSI-LD temporal controller の `AlreadyExistsError` → `AlreadyExistsLdError` に修正（仕様: ETSI GS CIM 009 §5.5.1）(#520)
  - NGSI-LD コントローラーのエラータイプを ETSI 仕様に準拠: JSON パースエラーは `InvalidRequest`、データバリデーションエラーは `BadRequestData`（仕様: ETSI GS CIM 009 §5.5.1, Orion-LD/Stellio 互換）(#520)
  - NGSI-LD batch 207 レスポンスの Content-Type を `application/json` に修正（仕様: ETSI GS CIM 009 §5.6.7/5.6.8）(#520)

- **Fix**: ReactiveCore Rules の条件評価でエンティティレベルフィールド（`id`, `type`）を `attributeName` に指定できるよう修正（Issue #513）(#516)
  - `value` 条件と `pattern` 条件で `attributeName: "id"` / `"type"` をサポート (#516)
  - PATCH 後にルールアクションが実行されない問題を解消 (#516)
- **Security**: OWASP API Security 一括修正 — 8件のセキュリティ指摘対応 (#515)
  - クロステナント Subscription 通知データ漏洩を修正 — `findMatchingSubscriptions` にテナントフィルタ追加 (#515)
  - MCP ツールの OAuth スコープ検証・XACML 認可バイパスを修正 — `requireMcpScope` 追加、エンドポイントをレート制限後に移動 (#515)
  - OAuth token エンドポイントにブルートフォース保護を追加 — `LoginProtectionService` を `clientId` ベースで適用 (#515)
  - CSource 通知・Rule Webhook・Registration に DNS Rebinding 対策（`validateResolvedDns`）追加 (#515)
  - `/admin/cadde`, `/admin/metrics`, `/rules`, `/custom-data-models` に OAuth スコープ要求を追加 (#515)
  - PasswordSchema を `PASSWORD_POLICY.MIN_LENGTH` に統一、`SUPER_ADMIN_PASSWORD` 最低長チェック追加、WebSocket メッセージにトークン再検証追加 (#515)
  - クエリパラメータにリソース制限追加 — IDリスト100件、ポリゴン頂点1000、クエリ条件50上限 (#515)
  - Temporal/Federation の正規表現パターンに ReDoS 対策（`validateRegexPattern`）追加 (#515)
- **Security**: OWASP API Security M-3〜M-7 — リソース枯渇・レート制限バイパス防止 (#495)
  - Pagination offset 上限追加（MAX_OFFSET: 10000、API4対策）(M-3)
  - Temporal API `timerel=between` の時間範囲上限追加（366日、API4対策）(M-4)
  - OAuth scope ミドルウェアのセキュリティ設計を明確化（JWT RBAC/OAuth scope分離、API5対策）(M-5)
  - Subscription throttling 最小値チェック追加（MIN_THROTTLING_SECONDS: 1、API6対策）(M-6)
  - 通知の並行送信をチャンク化（MAX_CONCURRENT: 10、API4/API6対策）(M-7)
- **Security**: SSRF脆弱性一括修正 — IPv4-mapped IPv6バイパス、DNS Rebinding、通知/コンテキストURL検証 (#490, #493, #495)
  - IPv4-mapped/compatible IPv6アドレスによるSSRFバイパスを防止（`[::ffff:127.0.0.1]`等）(#490)
  - IPv6 ULA（fc00::/7）アドレスをブロック対象に追加 (#490)
  - `validateResolvedDns()` によるDNS Rebinding攻撃対策を追加 (#493)
  - フェデレーション（Context Provider）のfetch前にDNS解決結果を検証 (#493)
  - 通知送信（notifier）にSSRFバリデーションを追加、プライベートIPへの送信を阻止 (#495 M-1)
  - NGSI-LD `@context` URLにdefense-in-depthバリデーションを追加 (#495 M-2)
- **Tests**: SSRF防御のユニットテスト追加（IPv4-mapped IPv6、DNS Rebinding、通知SSRF）(#490, #493, #495)
- **Tests**: E2Eシナリオ追加（IPv4-mapped IPv6 / ULAでのサブスクリプション・レジストレーション拒否）(#490)

### 2026-02-17
- **Security**: `validateExternalUrl` の SSRF バイパス脆弱性を修正 (#490)
  - IPv4-mapped IPv6 アドレス（`[::ffff:127.0.0.1]` 等）による内部ネットワークアクセスをブロック
  - 10進数/8進数/16進数 IPv4 表記のバイパスに対するテストを追加（Node.js URL パーサーの正規化で防御済み）
  - IPv6 unique-local アドレス（`fc00::/7`）をブロック対象に追加
- **Security**: template.yaml デフォルト値のセキュリティ強化 (#491)
  - `AuthEnabled` のデフォルトを `false` → `true` に変更（認証デフォルト有効化）
  - `AuthzDefaultDecision` のデフォルトを `Permit` → `Deny` に変更（fail-closed）
  - `getAuthzDefaultDecision()` のフォールバックを `Deny` に変更（環境変数未設定時もfail-closed）
  - `AUTH_ENABLED=false` 明示設定時に警告ログを出力
- **Security**: 本番環境でのスタックトレース漏洩防止 (#494)
  - `NODE_ENV=production` 時はエラーログからスタックトレースを除外
  - クライアントレスポンスには内部情報を含めない（既存動作を維持）
- **Security**: OWASP API Security Top 10:2023 監査指摘 MEDIUM 7件を修正 (#475, #476, #477, #478, #479, #481, #482)
  - Policy/PolicySet のテナントスコープチェック追加（BOLA 対策, #475）
  - ストレージクォータを作成時に強制（エンティティ/サブスクリプション/レジストレーション, #476）
  - リクエストボディサイズのプラン別制限を強制（#477）
  - `/admin/oauth-clients` に `requireScope('admin:oauth-clients')` を適用（BFLA 対策, #478）
  - Webhook URL テンプレート置換後の SSRF 検証を追加（#479）
  - `/statistics`, `/cache/statistics`, `/metrics` エンドポイントを認証必須化（#481）
  - `/oauth/token` を API Gateway Event に登録（#482）
- **Security**: OWASP API Security Top 10:2023 監査指摘の MEDIUM 4件を修正 (#474)
  - JWT署名検証に `timingSafeEqual` を使用（タイミング攻撃防止）
  - スーパー管理者パスワード比較に `timingSafeEqual` を使用（タイミング攻撃防止）
  - XACMLポリシーの `string-regexp` マッチに ReDoS 検証を追加
  - 予期しないエラーの内部メッセージ漏洩を防止（汎用メッセージに統一）
- **Security**: Subscription/Registration オーナーシップ検証機能を追加（OWASP API1:2023 対策）(#467)
  - `createdBy` フィールドによるリソースオーナーシップ追跡
  - write操作（UPDATE/DELETE）時に作成者とリクエストユーザーを照合
  - `super_admin`/`tenant_admin` はオーナーシップチェックをバイパス
  - `createdBy` 未設定の既存データは後方互換で誰でも操作可能
  - read操作（GET/LIST）は制限なし（NGSI仕様準拠のテナント隔離のみ）
- **Tests**: オーナーシップ検証のユニットテスト追加（Subscription/Registration サービス）(#467)
- **Tests**: オーナーシップ検証のE2Eテスト追加（ownership.feature: 4シナリオ）(#467)

### 2026-02-16
- **Security**: WebSocket認証トークンをURLクエリパラメータから`Authorization`ヘッダー / `Sec-WebSocket-Protocol`ヘッダーへ移行（#464）(#472)
  - `Authorization: Bearer <token>` ヘッダー（推奨）
  - `Sec-WebSocket-Protocol: access_token, <token>` ヘッダー（ブラウザクライアント向け）
  - クエリパラメータは後方互換として維持（deprecation warning付き）
- **Security**: レスポンスボディサイズ制限の適用（#466）(#472)
  - テナントのクォータプラン別 `maxResponseBodyBytes` をAPIハンドラで強制
  - 制限超過時に `ResponseTooLargeError` (413) を返却
- **Security**: フェデレーション（Context Provider）レスポンスのスキーマ検証強化（#468）(#472)
  - `Content-Length` ヘッダーによるレスポンスサイズ検証（上限5MB）
  - JSONネスト深度制限（最大10階層）
  - レスポンス内エンティティ数制限（最大1000件、超過分は切り詰め）
- **Security**: トークン無効化（ブラックリスト）機能を追加（OWASP API2:2023 対策）(#460)
  - `POST /auth/logout` エンドポイント追加（全セッション無効化）
  - パスワード変更時に既存トークンを自動無効化
  - ユーザー単位の無効化タイムスタンプ方式（DynamoDB / インメモリフォールバック）
  - リフレッシュトークンの無効化チェック追加
- **Security**: OWASP API2:2023 (Broken Authentication) 対応のブルートフォース保護機能を追加 (#459)
  - メールアドレスベースのログイン試行回数追跡
  - プログレッシブ遅延（2回目以降: 2秒→4秒→8秒）
  - 自動アカウントロック（5回失敗後、60秒間ロック）
  - ロック中は正しいパスワードでもログイン不可
  - ログイン成功時にカウンターを自動リセット
  - Lambda最適化: `429 Too Many Requests` + `Retry-After` ヘッダーで応答（sleep不使用）
- **API**: `POST /admin/users/{userId}/unlock` エンドポイント追加（管理者によるロック解除）(#459)
- **Infrastructure**: `loginAttempts` コレクション追加（email ユニークインデックス + TTL 自動クリーンアップ）(#459)
- **Tests**: ユニットテスト追加（service, repository, controller, auth.service統合）、E2Eテスト追加（brute-force.feature）(#459)
- **Security**: JWT `verifyToken()` に `alg` ヘッダー明示チェックを追加（`alg:none` 攻撃対策）(#462, #469)
- **Security**: デフォルトパスワード最小長を 8→12 文字に強化（NIST SP 800-63B 準拠）(#463, #469)
- **Security**: HTTP セキュリティヘッダー追加: `X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Strict-Transport-Security`(#465, #469)
- **Security**: フェデレーションリクエストに `redirect: manual` を設定し、リダイレクト先を `validateExternalUrl()` で SSRF 再検証（最大1回）(#461, #469)
- **Feature**: デプロイメント設定の読み取り専用解決機能を追加 (#458)
  - DynamoDB `geonicdb-deployments` テーブルからホスト名ベースのデプロイメント設定を取得
  - キャッシュ付きService（5分TTL、ネガティブキャッシュ対応）
  - DynamoDB障害時はnullフォールバックで既存動作を維持
- **Feature**: `ConnectionManager` クラスを追加（マルチデータベース接続管理）(#458)
- **Feature**: ホスト名抽出ミドルウェアをリクエストパイプラインに組み込み (#458)
- **Infrastructure**: SAMテンプレートに `DeploymentsTable` DynamoDBリソースとIAMポリシーを追加 (#458)
- **Security**: Admin APIエンドポイントにOAuthスコープベースのアクセス制御を追加 (#457)
  - `admin:users` スコープでユーザー管理API (`/admin/users`) にアクセス可能
  - `admin:tenants` スコープでテナント管理API (`/admin/tenants`) にアクセス可能
  - `admin:policies` スコープでポリシー管理API (`/admin/policies`) にアクセス可能
  - OAuthトークンはスコープベース、通常JWTはロールベースで後方互換性を維持
- **Tests**: Admin routesスコープ強制ユニットテスト23件追加、E2Eの`@wip`タグ2件を解除 (#457)
- **Feature**: GeonicDBをnpmパッケージとして利用可能に (#453)
  - `createServer()` プログラマティックAPIでサーバーをプログラムから起動・停止
  - `npx geonicdb` CLIコマンドでスタンドアロン起動
  - `--proxy` オプションで非マッチURLをアプリ側dev serverに透過転送（URL重複時はGeonicDB優先）
  - `--silent` オプションでコンソール出力抑制
- **Build**: `tsc-alias` 導入でビルド時にパスエイリアスを相対パスに解決 (#453)
- **Package**: `bin`, `types`, `files`, `peerDependencies` 設定でnpmパッケージ対応 (#453)

### 2026-02-15
- **Documentation**: `docs/INSTRUCTION.md` のカスタムデータモデルセクション（14.9）を大幅に拡充 (#445)
  - `isActive` フラグの詳細な説明を追加（バリデーション、OpenAPI、一覧取得への影響）
  - Smart Data Models との違いを明記（用途、バリデーション、管理方法の比較表）
  - バリデーションの詳細とタイミングを追加（部分バリデーション、required チェック、エラー形式）
  - 既存エンティティへの影響を説明（データモデル作成・更新時の挙動）
  - 制限事項とベストプラクティスを追加（ReDoS 対策、推奨値、段階的ロールアウト）
  - エラーハンドリングの詳細を追加（ステータスコード、409 Conflict、エラーメッセージの読み方）
- **API**: `/admin/cadde` エンドポイント追加（GET/PUT/DELETE）(#439)
- **Backend**: CADDE設定をMongoDB管理に移行、環境変数を廃止 (#439)
- **MCP**: CADDE設定をconfig toolsに追加 (#439)
- **Critical**: OpenAPI/メタ情報の完全欠落を修正 (#418)
  - Snapshots API (7エンドポイント) を `meta.controller.ts` に追加
  - Quotas/Usage API (3エンドポイント) を `meta.controller.ts` に追加
  - APIドキュメント・OpenAPI仕様・AI Toolsドキュメントに反映
- **Documentation**: NGSIv2 ドキュメント拡充 (`docs/API_NGSIV2.md`) (#418)
  - `id`, `typePattern`, `options=upsert/append/keyValues` パラメータ追加
  - HTTPエラー 411/413/422 のドキュメント追加
  - `orderBy`/`metadata` の仕様差異を「GeonicDB 独自拡張」として明記
- **Documentation**: NGSI-LD ドキュメント拡充 (`docs/API_NGSILD.md`) (#418)
  - Multi-Attribute (datasetId) の全操作詳述 (CREATE/UPDATE/RETRIEVE/DELETE)
  - Temporal API `lastN` パラメータ追加
  - `id` 複数指定、`NGSILD-EntityMap` ヘッダー追加
  - `NGSILD-Results-Count` ヘッダーの記述修正（「常に返却」）
- **Documentation**: REACTIVCORE_RULES.md チュートリアル修正 (#418)
  - 古い構文 (`trigger`/`action`) を正しい構文 (`conditions`/`actions`) に修正
- **Testing**: instruction.feature 拡充 (31 → 46シナリオ) (#418)
  - セクション10 (時系列データ管理) のテストシナリオ追加
  - セクション5.4 (NGSIv2属性操作) のテストシナリオ追加
  - セクション9.3 (バッチ全アクション) のテストシナリオ追加
  - セクション3.7 (NGSI-LD q パラメータ検索) のテストシナリオ追加
  - INSTRUCTION.md との整合性を60%から大幅に向上
- **Testing**: spec-compliance.feature 拡充 (#418)
  - NGSIv2: 4シナリオ追加 (orderBy, Subscription throttling, Batch appendStrict)
  - NGSI-LD: 8シナリオ追加 (Multi-Attribute CRUD, Subscription/Registration PATCH, lastN)
- **Bug Fix**: `api.json` temporal section のメソッド不整合修正 (#418)
  - `/temporal/entities/{entityId}` に PATCH メソッド追加
  - `/temporal/.../attrs/{attrName}/{instanceId}` に DELETE メソッド追加
- **Bug Fix**: OpenAPI spec 修正 (#418)
  - temporal attribute instance の DELETE operation 追加
  - 未定義タグ4件追加 (NGSI-LD Attributes, Info, JSON-LD Context Management, Rules)
- **Bug Fix**: コメント・パス参照修正 (#418)
  - `rules.feature`: `docs/RULES.md` → `docs/REACTIVCORE_RULES.md`
  - `instruction.feature`: セクション番号ずれ修正
- **Bug Fix**: NGSIv2 appendStrict 仕様準拠修正 (#418)
  - 既存属性を含む場合に422 Unprocessableを返すように修正（仕様準拠）
  - 従来は既存属性を黙って上書きする仕様違反の動作だった
  - バッチ操作の全件失敗時に422を返すように修正
  - 仕様違反のテストを削除、仕様準拠のテストを追加
- **Bug Fix**: Change Stream の watch オプションに `fullDocument: 'updateLookup'` を追加 (#442)
  - update 操作時に `fullDocument: null` となりルールエンジンが発火しなかった問題を修正
  - `src/local-server.ts`（ローカル開発サーバー）と `src/handlers/streams/change-stream.ts`（Lambda ハンドラー）の両方を修正
  - ユニットテストに `fullDocument: 'updateLookup'` オプションの検証を追加
- **Testing**: ユニットテストカバレッジを大幅に向上 (#440)
  - Lines: 90.97% → 99.08%（+8.11ポイント）
  - Statements: 90.68% → 98.84%（+8.16ポイント）
  - Branches: 84.05% → 93.99%（+9.94ポイント）
  - Functions: 91.75% → 96.88%（+5.13ポイント）
  - テスト数: 6015件（200スイート）
- **Testing**: 新規テストファイル追加 (#440)
  - Admin API: tenants, policies, metrics, users, oauth-clients コントローラーテスト、routes テスト
  - MCP: entity.tools, batch.tools, config.tools, admin.tools テスト拡充
  - NGSI-LD: tiles, attributes, types, entity-maps, snapshots コントローラーテスト拡充
  - NGSIv2: tiles コントローラーテスト、entities.controller 追加カバレッジ
  - Core: rules, subscriptions, custom-data-models, auth, geo, temporal サービステスト拡充
  - Handlers: matcher, notifier テスト拡充
  - Infrastructure: template-parser, mqtt client, audit logger テスト拡充
- **Documentation**: CLAUDE.md にカバレッジ検証の必須チェックリストを追加 (#440)
  - Pre-Push Verification セクション追加
  - Documentation Update Checklist にカバレッジ検証を追加
  - Endpoint Implementation Checklist にカバレッジ確認ステップを追加
- **依存関係**: `eslint` を 9.39.2 → 10.0.0 にメジャーアップグレード (#438)
- **依存関係**: `typescript-eslint` を 8.55.0 → 8.55.1-alpha.4 に更新（ESLint 10 対応 canary 版）(#438)
- **依存関係**: `@typescript-eslint/eslint-plugin`、`@typescript-eslint/parser` を直接依存から削除（`typescript-eslint` ラッパーに統合）(#438)

### 2026-02-14
- **Infrastructure**: Lambda Runtime を `nodejs20.x` → `nodejs24.x` に更新（Node.js 24 LTS に統一）(#437)
- **CI**: Dependabot で `@types/node` のメジャーバージョンアップを抑制（LTS以外への更新を防止）(#437)
- **Branding**: プロダクト名を VelaOS から GeonicDB に変更 (#436)
  - ソースコード、ドキュメント、テスト全体のリネーム
  - Prometheus メトリクスプレフィックス: `vela_` → `geonicdb_`
  - DynamoDB テーブル名デフォルト: `vela-rate-limits` → `geonicdb-rate-limits`
  - GitHub リポジトリ URL: `geolonia/vela` → `geolonia/geonicdb`
- **依存関係**: AWS SDK グループを 3.985.0 → 3.990.0 に更新 (#435)
  - `@aws-sdk/client-apigatewaymanagementapi`, `client-dynamodb`, `client-eventbridge`, `client-sqs`, `lib-dynamodb`
- **依存関係**: OpenTelemetry グループを更新 (#435)
  - `sdk-node` 0.211.0 → 0.212.0, `exporter-trace-otlp-http` 0.211.0 → 0.212.0
  - `sdk-trace-base`, `resources`, `context-async-hooks` 2.5.0 → 2.5.1
- **依存関係**: `typescript-eslint` グループを 8.54.0 → 8.55.0 に更新 (#435)
- **依存関係**: `@types/node` を 25.2.2 → 24.10.13 にダウングレード（Node 24 ランタイムに合わせて v24 系に変更）(#435)
- **Changed**: プロジェクトライセンスを GPL-3.0 から AGPL-3.0 に変更 (#424)
  - `LICENSE.md` を AGPL-3.0 全文に差替え
  - 全ソースファイル（530+ファイル）のライセンスヘッダーを一括更新
  - `package.json`、`README.md`、`CLAUDE.md`、各ドキュメントのライセンス記述を更新
  - OpenAPI仕様のライセンス情報を更新
  - E2Eテストのライセンス検証シナリオを更新
- **Enhancement**: ローカル開発サーバーのポートを柔軟に設定可能に (#423)
  - `--port` CLI引数対応（`npm start -- --port 3001`）
  - `PORT` 環境変数対応（`PORT=3001 npm start`）
  - デフォルトポート（3000）が使用中の場合、自動的に空きポートを選択（最大10ポート探索）
  - ポートフォールバック時にコンソールへ警告メッセージを表示
  - git worktree との併用で複数インスタンスの同時起動が可能に
- **Added**: CEL式でカスタム関数 `distance()`, `within()`, `now()`, `dayOfWeek()` を利用可能に (#422)
  - `distance(location1, location2)` — Haversine formula による2点間距離計算（メートル）
  - `within(location, polygon)` — Ray casting による Point-in-Polygon 判定
  - `now()` — 現在UTC時刻（ISO 8601文字列）
  - `dayOfWeek()` — 現在の曜日（0=日〜6=土、UTCベース）
- **Changed**: CEL評価を `evaluate()` から `Environment` ベースに切り替え、カスタム関数登録に対応 (#422)
- **Documentation**: `docs/REACTIVCORE_RULES.md` にカスタム関数の仕様・使用例を追加 (#422)
- **Testing**: ユニットテスト32件、E2Eテスト5シナリオを追加 (#422)
- **Feature**: テナントごとに独自の IP アドレス制限を設定可能に (#395)
  - GET/PUT/DELETE `/admin/tenants/:tenantId/ip-restrictions` エンドポイント追加
  - `admin`（管理APIのみ）と `all`（全API）の2つのスコープに対応
  - テナント設定未設定時はグローバル設定（`ADMIN_ALLOWED_IPS`）にフォールバック
  - 既存の認証ミドルウェアをテナント対応に更新
- **Added**: ReactiveCore Rules に CEL (Common Expression Language) 式条件タイプを追加 (#387)
  - `celExpression` 条件タイプ: 複雑な計算、文字列操作、複数属性評価が可能
  - CEL コンテキスト変数: `entity.id`, `entity.type`, `attribute.<name>.value`, `attribute.<name>.type`
  - 式の最大長制限 (1000文字)、構文バリデーション、非 boolean 結果のハンドリング
  - `@marcbachmann/cel-js` ライブラリ使用 (ゼロ依存、TypeScript 対応)
- **OpenAPI**: `CelExpressionCondition` スキーマを `/openapi.json` に追加 (#387)
- **Documentation**: `docs/REACTIVCORE_RULES.md` に CEL 式条件の仕様・使用例を追加 (#387)

### 2026-02-13
- **Documentation**: ReactiveCore Rules に不快指数（DI）による熱中症アラート通知の使用例を追加 (#419)
  - `docs/REACTIVCORE_RULES.md` — 例6: CEL式による不快指数計算、sendNotification/Webhookアクション
  - `docs/INSTRUCTION.md` — セクション13.7 例4: ステップバイステップの導入手順
- **Testing**: 不快指数アラートのE2Eテストシナリオを7件追加（`@rules-discomfort-index`タグ）(#419)
  - WARNING（DI > 75）/DANGER（DI > 80）レベルのルール実行テスト
  - 閾値以下でのルール非トリガー確認
  - 優先度制御と範囲条件（75 < DI <= 80）の動作確認
  - sendNotification/webhookアクションの構成検証
- **Added**: CADDEコネクタv4 API エンドポイントを追加 (#409)
  - `GET /cadde/api/v4/catalog` — カタログ検索（横断検索/詳細検索）
  - `GET /cadde/api/v4/entities` — NGSIデータ交換（NGSIv2/NGSI-LD形式対応）
- **Added**: カタログ横断検索（`x-cadde-search: meta`）— キーワードフィルタ付きCKAN形式レスポンス (#409)
- **Added**: カタログ詳細検索（`x-cadde-search: detail`）— データセット個別取得 (#409)
- **Added**: CADDE固有メタデータフィールド（`caddec_dataset_id_for_detail`、`caddec_provider_id`、`caddec_resource_type`）(#409)
- **Added**: `x-cadde-resource-url` からクエリパラメータ解析によるエンティティ取得 (#409)
- **Added**: `x-cadde-resource-api-type` による NGSIv2/NGSI-LD レスポンス形式切替 (#409)
- **Added**: CADDE v4エンドポイントの来歴ヘッダー（provenance headers）付与 (#409)
- **Added**: CADDEエラーレスポンス形式（`{ detail, status }`）(#409)
- **Added**: `x-cadde-search` ヘッダー定数を `CADDE_HEADERS` に追加 (#409)
- **Infrastructure**: SAM テンプレートに CADDE v4 APIルートを追加 (#409)
- **OpenAPI**: `/openapi.json` に Rule Engine の詳細スキーマを追加 (#410)
  - `RulePublic`、`CreateRuleInput`、`UpdateRuleInput` スキーマを追加
  - `RuleCondition`（8種類の条件型）、`RuleAction`（5種類のアクション型）スキーマを追加
  - `/rules` 系エンドポイントの定義を `$ref` によるスキーマ参照に更新
- **BREAKING CHANGE**: カスタムデータモデル管理エンドポイントを `/admin/data-models` から `/custom-data-models` に変更 (#376)
  - テナント固有のリソースのため Admin API から独立した API として再編成
  - ルートパスの変更に伴い、エンドポイントは `/custom-data-models` および `/custom-data-models/:type` に
- **BREAKING CHANGE**: Phase 2 の自動生成機能（`POST /admin/data-models/generate`）を削除 (#376)
  - AI ツールを使った生成機能は Phase 3 で再設計予定
- **Changed**: 認証・認可の変更 (#376)
  - `requireAdminAuth()` から `requireAuth()` + XACML ポリシーベース認可に変更
  - `tenant_admin` および `user` ロールもテナント内のカスタムデータモデルを管理可能（ポリシー設定による）
- **Added**: カスタムデータモデル管理機能 Phase 1 (#376)
  - `GET /custom-data-models` - データモデル一覧取得
  - `POST /custom-data-models` - データモデル作成
  - `GET /custom-data-models/:type` - データモデル取得
  - `PATCH /custom-data-models/:type` - データモデル更新
  - `DELETE /custom-data-models/:type` - データモデル削除
  - テナントごとに独自のデータモデルを定義可能
  - Version 管理機能（作成時 = 1、更新時に自動インクリメント）
  - 19 種類の既存 Smart Data Models に加えて、カスタムデータモデルをサポート
- **Added**: ExtendedPropertyDetail 型定義 - PropertyDetail を拡張し defaultValue、validation、indexed をサポート (#376)
- **Added**: MCP ツールに custom data models 統合 (#376)
  - `config` ツールの `data_models` リソースに新アクション追加
  - list, get, create, update, delete（認証必須）
  - Smart Data Models（カタログ）とカスタムデータモデル（テナント固有）を統合検索
- **Added**: Phase 3 - エンティティバリデーション・@context 解決拡張・JSON Schema 生成 (#376)
  - カスタムデータモデルに基づくエンティティの自動バリデーション（作成・更新時）
  - 型チェック（string, number, integer, boolean, array, object, GeoJSON）
  - バリデーションルール: minLength, maxLength, minimum, maximum, pattern, enum
  - 必須フィールド（`required`）チェック
  - NGSI-LD @context 解決をカスタムデータモデルの `contextUrl` に拡張
  - カスタムデータモデルから JSON Schema (Draft 2020-12) を自動生成
  - `jsonSchema` フィールドをカスタムデータモデルレスポンスに追加
- **Added**: Phase 4 - エンティティテンプレート生成・OpenAPI 動的統合 (#376)
  - MCP `config` ツールに `generate_template` アクション追加 - カスタムデータモデルからエンティティテンプレートを自動生成
  - テンプレートは `defaultValue`、`example`、`valueType` に基づきプレースホルダ値を含む NGSI-LD 形式で生成
  - `contextUrl` が定義されている場合は `@context` も自動付与
  - OpenAPI 仕様 (`/openapi.json`) にカスタムデータモデルの JSON Schema を動的統合
  - 認証済みユーザーのテナントに紐づくアクティブなカスタムデータモデルが `components/schemas` に自動追加
- **Tests**: E2E テスト 7 シナリオ追加（CRUD、ページネーション、権限、テナント分離、バリデーション、フィルタリング、バージョニング）(#376)

### 2026-02-11
- **Documentation**: ドキュメントを30ファイルから17ファイルに統合（43%削減）(#405)
  - PAGINATION.md、STATUS_CODES.md、DEPLOYMENT.md を DEVELOPMENT.md に統合
  - WEBAPP_INTEGRATION.md を EVENT_STREAMING.md に統合
  - CATALOG.md、TELEMETRY.md を INTEGRATIONS.md に統合
  - AUTH_ADMIN.md、AUTH_OAUTH.md、AUTH_SCENARIOS.md を AUTH.md に統合
  - API_ENDPOINTS*.md を API.md、API_NGSIV2.md、API_NGSILD.md に統合
  - RULES.md を REACTIVCORE_RULES.md にリネーム
  - SUBSCRIPTIONS.md を新規作成 - HTTP/MQTT 通知の実践例を含む包括的ガイド
- **BREAKING**: `AUTHZ_ENABLED` 環境変数を削除。XACMLポリシー評価は `AUTH_ENABLED=true` の場合に自動的に有効化されるよう変更 (#403)
- **Changed**: `/rules` エンドポイントは `AUTH_ENABLED` 設定に関わらずアクセス可能に（`/v2/*` および `/ngsi-ld/*` エンドポイントと同様）(#403)

### 2026-02-10
- **MCP**: MCP ツール構造を再編成 - 8ツールから5ツールに統合して保守性を向上 (#402)
- `rules` と `contexts`（JSON-LD コンテキストと Smart Data Models）を新しい `config` ツールに移動 (#402)
- `admin` ツールはユーザー、テナント、ポリシーの管理のみに集中 (#402)

### 2026-02-08
- **BREAKING**: Rules API を `/admin/rules` から `/rules` に移動し、XACML ベースの認可を導入 (#401)
- Rules エンドポイントはロールベース認証ではなく XACML ポリシーで保護されるようになり、きめ細かなアクセス制御が可能に (#401)

### 2026-02-07
- **Documentation**: GeonicDB 取扱説明書（docs/INSTRUCTION.md）を追加 (#400)
- PDF 生成スクリプトを追加（`npm run docs:pdf`）(#400)
- INSTRUCTION.md の全サンプルを検証する E2E テスト（tests/e2e/features/common/instruction.feature）を追加 (#400)

### 2026-02-05
- **Fixed**: ローカルサーバーの MongoDB シャットダウン時のエラーメッセージを抑制 (#394)

### 2026-02-04
- **Changed**: バージョン番号を集約し、package.json からインポートするよう変更 (#393)

### 2026-02-03
- **Added**: MCP (Model Context Protocol) サーバー統合 (#392)
  - AI 駆動型エンティティ管理のための5つの統合ツール
  - エンティティ CRUD 操作
  - バッチ操作
  - 時系列クエリ
  - JSON-LD コンテキスト管理
  - 管理操作

### 2026-02-02
- **Fixed**: クォータシステムのバグ修正 (#391)
  - Retry-After ヘッダーの修正
  - 負数カウントバイパスの修正
  - 時間単位の不一致を解決

### 2026-02-01
- **Added**: ReactiveCore Rules - パターンマッチング、条件式、アクションを備えた自動エンティティ処理ルールエンジン (#389)
  - エンティティタイプ、ID、属性名のパターンマッチング
  - 論理演算子（AND/OR）を使用した条件式
  - 複数のアクション: createEntity、updateEntity、deleteEntity、sendNotification
  - 無限ループ防止機構
  - リアルタイムイベント処理のための Change Stream 統合
  - `npm start` によるローカルテストサポート

### 2026-01-28
- **Documentation**: 包括的な AWS デプロイ手順を含む DEPLOYMENT.md を追加 (#382)

### 2026-01-25
- **Added**: Smart Data Models サポートを強化 (#373)
  - プロパティ詳細を含む19の標準データモデル
  - AI 駆動型エンティティ作成ガイダンス
  - 全モデルの propertyDetails メタデータ

### 2026-01-24
- **Documentation**: 新規ユーザー向け QUICKSTART.md ガイドを追加 (#372)

### 2026-01-23
- **Fixed**: NGSI-LD スキーマ検証を強化 (#370)

### 2026-01-22
- **Security**: エンティティ ID（256文字）、タイプ（256文字）、属性名（256文字）の長さ制限を追加 (#369)

### 2026-01-20
- **Fixed**: NGSI-LD URI パターンの不整合を解決 (#364)

### 2026-01-18
- **Added**: 全 API エンドポイントの Zod v4 ランタイム型検証を追加 (#358)

### 2026-01-17
- **Changed**: 設定値を `src/config/defaults.ts` に集約 (#357)

### 2026-01-16
- **Added**: SaaS ローンチ向けの包括的なクォータシステム (#356)
  - リクエストクォータ（レート制限、日次/月次制限）
  - ストレージクォータ（エンティティ/属性数）
  - DynamoDB によるリアルタイム監視
  - テナント固有のクォータ設定
  - レート制限レスポンスの Retry-After ヘッダー

### 初期実装（〜2026-01-15）
- GeonicDB 初回実装 - AWS Lambda 上で動作する FIWARE Orion 互換 Context Broker
- NGSIv2 API 実装
  - エンティティ CRUD 操作
  - サブスクリプション
  - レジストレーション
  - バッチ操作
  - クエリ言語サポート（q、mq パラメータ）
- NGSI-LD API 実装
  - エンティティ操作
  - サブスクリプション
  - コンテキストソースレジストレーション
  - バッチ操作
  - クエリ言語サポート（q、scopeQ、pick、omit、lang パラメータ）
- NGSIv2 と NGSI-LD API 間の完全な相互運用性
- Fiware-Service ヘッダーによるマルチテナンシーサポート
- コンテキストプロバイダ転送によるフェデレーション機能
- 空間 ID を使用した地理空間クエリサポート
- JWT 認証・認可
- テナントおよびユーザー管理のための管理 API
- レプリカセット対応の MongoDB ストレージ
- SAM テンプレートによる AWS Lambda デプロイ
- サブスクリプションマッチングのための EventBridge 統合
- 通知配信のための SQS FIFO キュー
- 通知のための MQTT サポート
- 包括的な E2E テストスイート（Cucumber.js）
- 単体テストカバレッジ 〜99%（Jest）
- インメモリ MongoDB を使用したローカル開発サーバー（`npm start`）
- Node.js 要件: >=24.13.0
- MongoDB 要件: 7.1.0
- テストフレームワーク: Cucumber.js（Gherkin 日本語）
- ベクタータイル生成 API
- 時系列データの Temporal API
- エンティティスナップショット機能
- JSON-LD コンテキスト管理
- データカタログ API（CKAN/DCAT 互換）
- CADDE（データ連携）サービス統合
- セキュリティ強化のためのテナント単位の IP ホワイトリスト
- ReDoS（正規表現サービス拒否）防止
- 全 API エンドポイントの入力検証

[unreleased]: https://github.com/geolonia/geonicdb/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/geolonia/geonicdb/releases/tag/v0.1.0
