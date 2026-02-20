---
title: "変更履歴"
description: "GeonicDB の変更履歴"
outline: deep
---
# 変更履歴

このプロジェクトのすべての重要な変更は、このファイルに記録されます。

このフォーマットは [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に基づいており、
このプロジェクトは [Semantic Versioning](https://semver.org/lang/ja/) に準拠しています。

## [Unreleased]

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
