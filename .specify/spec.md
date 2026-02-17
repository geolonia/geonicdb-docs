# Feature Specification: GeonicDB Documentation Site

**Feature Branch**: `main`
**Created**: 2026-02-10
**Status**: Draft
**Input**: GeonicDB (FIWARE Orion 互換 Context Broker) の公式ドキュメントサイト構築

## User Scenarios & Testing *(mandatory)*

### User Story 1 - FIWARE 開発者が Orion からの移行を検討する (Priority: P1)

FIWARE Orion を現在使用している開発者が、GeonicDB への移行メリット・互換性・手順を理解し、移行判断を下せるドキュメントサイトを提供する。Orion との機能比較表、API 互換性マトリクス、移行ガイドを中心に、技術的な意思決定に必要な情報を網羅する。

**Why this priority**: GeonicDB の最大の差別化ポイントは Orion 互換でありながらサーバーレス・AI ネイティブであること。Orion ユーザーの移行が最も直接的な採用パスであり、この層への訴求が最優先。

**Independent Test**: Migration セクションにアクセスし、Orion → GeonicDB の API 互換性マトリクスと移行手順が閲覧でき、NGSIv2/NGSI-LD 両方の互換性情報が確認できる。

**Acceptance Scenarios**:

1. **Given** FIWARE 開発者がサイトにアクセスする, **When** Introduction ページを開く, **Then** GeonicDB の概要と Orion との主要な違い（サーバーレス、AI ネイティブ、デュアル API）が一目で理解できる
2. **Given** FIWARE 開発者が移行を検討している, **When** Migration セクションを開く, **Then** Orion → GeonicDB 移行ガイドと API 互換性マトリクス（NGSIv2/NGSI-LD 全エンドポイント対応状況）が閲覧できる
3. **Given** 開発者が API 仕様を確認したい, **When** API Reference セクションを開く, **Then** NGSIv2・NGSI-LD・Admin API のエンドポイント一覧、パラメータ、レスポンス例が閲覧できる

---

### User Story 2 - スマートシティ担当者が導入を検討する (Priority: P2)

自治体・企業のスマートシティ担当者（非エンジニア含む）が、GeonicDB の概要・ユースケース・日本政府標準対応（CADDE、空間ID）を理解し、導入検討の材料を得られるドキュメントサイトを提供する。

**Why this priority**: 日本市場での採用拡大にはスマートシティ担当者への訴求が重要。CADDE・空間ID など日本固有の標準対応は GeonicDB の独自強み。

**Independent Test**: Introduction と Japan Standards セクションにアクセスし、CADDE 連携と空間ID (ZFXY) の説明が日本語で閲覧できる。

**Acceptance Scenarios**:

1. **Given** スマートシティ担当者がサイトにアクセスする, **When** 日本語でサイトを閲覧する, **Then** GeonicDB の概要、ユースケース、日本政府標準対応が日本語で理解できる
2. **Given** 担当者が CADDE 連携を確認したい, **When** Japan Standards セクションを開く, **Then** CADDE 分野間データ連携基盤との連携方法と空間ID (ZFXY) サポートの説明が閲覧できる
3. **Given** 担当者がデモを見たい, **When** Getting Started セクションを開く, **Then** デモアプリ（geonicdb-demo-app）への導線があり、具体的な活用イメージが掴める

---

### User Story 3 - AI/ML エンジニアが MCP/LLM 連携を試す (Priority: P2)

AI/ML エンジニアが GeonicDB の MCP サーバー機能、llms.txt、tools.json を活用して、AI エージェントから IoT データを操作する方法を理解し、実装できるドキュメントを提供する。

**Why this priority**: AI ネイティブは GeonicDB の主要な差別化要素。MCP 対応の Context Broker は市場にないため、この機能のドキュメントは採用を左右する。

**Independent Test**: AI Integration セクションにアクセスし、MCP サーバーの設定方法、Claude Desktop での接続手順、tools.json の使用例が閲覧できる。

**Acceptance Scenarios**:

1. **Given** AI エンジニアが MCP 連携に興味がある, **When** AI Integration セクションを開く, **Then** MCP サーバー (`POST /mcp`) の設定方法と Claude Desktop 接続手順が閲覧できる
2. **Given** AI エンジニアが Tool Use を実装したい, **When** AI Integration ページの tools.json セクションを見る, **Then** 8ツールの一覧と Python + Claude API / OpenAI API のコード例が閲覧できる
3. **Given** AI エンジニアが llms.txt を確認したい, **When** AI Integration ページを見る, **Then** llms.txt 標準の説明と `GET /` で取得できる API ドキュメント形式が理解できる

---

### User Story 4 - 初めての開発者がクイックスタートで GeonicDB SaaS を試す (Priority: P1)

プログラミング経験はあるが FIWARE を知らない開発者が、GeonicDB SaaS の API エンドポイントに対してリクエストを送り、最初のエンティティ CRUD を体験できるチュートリアルを提供する。

**Why this priority**: 初回体験の品質が採用率を左右するため最優先。SaaS なのでインストール不要で即座に試せる点を訴求。

**Independent Test**: Getting Started セクションにアクセスし、Quick Start の手順に従って SaaS API にリクエストを送り、エンティティの作成・取得ができる。

**Acceptance Scenarios**:

1. **Given** 開発者がサイトにアクセスする, **When** Getting Started → Quick Start を開く, **Then** SaaS API エンドポイントに対する curl コマンド例が表示され、コピー&ペーストで即座に実行できる
2. **Given** 開発者が API キーを取得した, **When** First Entity チュートリアルを開く, **Then** NGSIv2 でのエンティティ作成・取得・更新・削除の curl コマンド例（SaaS エンドポイント向け）が閲覧でき、実行できる
3. **Given** 開発者が NGSI-LD も試したい, **When** Core Concepts → NGSIv2 vs NGSI-LD セクションを開く, **Then** 同じエンティティを両 API で操作する比較例が閲覧できる

---

### User Story 5 - 開発者が Features の詳細仕様を調べる (Priority: P2)

GeonicDB の各機能（Subscriptions、Federation、Geo/ZFXY、Vector Tiles、Temporal、Catalog、Smart Data Models、Snapshots）の詳細仕様を調べる開発者に、包括的なリファレンスを提供する。

**Why this priority**: 機能の詳細仕様は開発中に繰り返し参照されるため、網羅性と正確性が重要。

**Independent Test**: Features セクションにアクセスし、Subscriptions の仕様（HTTP/MQTT/WebSocket、スロットリング、マクロ置換）が閲覧できる。

**Acceptance Scenarios**:

1. **Given** 開発者がサブスクリプションを設定したい, **When** Features → Subscriptions ページを開く, **Then** HTTP Webhook、MQTT、WebSocket イベントストリーミングの設定例と仕様が閲覧できる
2. **Given** 開発者がフェデレーションを構成したい, **When** Features → Federation ページを開く, **Then** コンテキスト登録、分散クエリ転送、ループ検出 (Via)、警告ヘッダーの仕様が閲覧できる
3. **Given** 開発者が地理空間機能を使いたい, **When** Features → Geo/ZFXY ページを開く, **Then** ジオクエリ演算子、空間ID (ZFXY)、ベクトルタイル、GeoJSON 出力の仕様が閲覧できる

---

### User Story 6 - 開発者がセキュリティ設定を行う (Priority: P3, Coming Soon)

GeonicDB の認証・認可機能（JWT、OAuth/OIDC、RBAC、XACML、IP制限）を設定する開発者に、セキュリティ設定ガイドを提供する。

**Why this priority**: エンタープライズ導入にはセキュリティドキュメントが不可欠。ただし初回体験より後のフェーズ。

**Independent Test**: Security セクションにアクセスし、JWT 認証設定、RBAC ロール定義、XACML ポリシー例が閲覧できる。

**Acceptance Scenarios**:

1. **Given** 開発者が認証を有効にしたい, **When** Security → JWT セクションを開く, **Then** AUTH_ENABLED=true の設定方法、ログイン API、トークン管理が閲覧できる
2. **Given** 開発者が RBAC を設定したい, **When** Security → RBAC セクションを開く, **Then** super_admin, tenant_admin, user の3ロールの権限マトリクスと設定例が閲覧できる
3. **Given** 開発者が XACML ポリシーを定義したい, **When** Security → XACML セクションを開く, **Then** ポリシーセットの定義例と属性ベースのアクセス制御の設定方法が閲覧できる

---

### Edge Cases

- VitePress ビルドが GeonicDB 本体 docs/ の日本語 Markdown（大量の表・コードブロック）で失敗する場合のフォールバック
- GeonicDB 本体の docs/ が更新された際にドキュメントサイトとの同期が遅延する場合のユーザー体験
- OpenAPI spec (`GET /openapi.json`) から API リファレンスを自動生成する際、レスポンスが大きすぎてビルドが遅くなる場合
- 日英切り替え時に翻訳が未完了のページがある場合の表示（フォールバック言語の扱い）
- 外部リンク（GeonicDB GitHub リポジトリ、FIWARE 公式等）が404になった場合の検知

## Requirements *(mandatory)*

### Functional Requirements

#### サイト基盤

- **FR-001**: System MUST VitePress (Vite ベース) でドキュメントサイトをビルドし、静的サイトとして配信できること
- **FR-002**: System MUST 日本語・英語の2言語に対応し、VitePress の i18n 機能で言語切り替えできること（英語がプライマリ、日本語は翻訳）
- **FR-003**: System MUST レスポンシブデザインでデスクトップ・モバイル両方で閲覧可能であること
- **FR-004**: System MUST サイト内全文検索を提供すること（VitePress 組み込み検索 or Algolia DocSearch）
- **FR-005**: System MUST ダークモード・ライトモードの切り替えに対応すること（VitePress 標準機能）

#### コンテンツ管理

- **FR-010**: System MUST GeonicDB 本体の `docs/` ディレクトリ（25ファイル、約12,000行）を Single Source of Truth として取り込むビルドスクリプトを提供すること
- **FR-011**: System MUST ビルド時に GeonicDB 本体 `docs/` から VitePress 形式に変換・コピーする仕組みを持つこと
- **FR-012**: System MUST ドキュメントサイト独自コンテンツ（チュートリアル、導入事例、概要ページ）を geonicdb-docs リポジトリ側で管理できること
- **FR-013**: System MUST GeonicDB 本体更新への追随メカニズム（CI/CD or ビルドスクリプト）を設計に組み込むこと
- **FR-014**: System MUST GeonicDB 本体からの取り込みコンテンツとサイト独自コンテンツが視覚的に統一されること

#### Section 1: Introduction

- **FR-020**: System MUST "What is GeonicDB?" ページで GeonicDB の概要（AWS Lambda 上の FIWARE Orion 互換 Context Broker）を説明すること
- **FR-021**: System MUST "Why GeonicDB?" ページで Orion との主要な違い9項目（サーバーレス、AI ネイティブ、地理空間拡張、日本政府標準、デュアル API、エンタープライズ認証、リアルタイム、データカタログ、3ステップ起動）を説明すること
- **FR-022**: System MUST Architecture ページで Lambda → API Gateway → MongoDB Atlas のアーキテクチャ図と src/ ディレクトリ構造を説明すること
- **FR-023**: System MUST Quick Start ページで SaaS API エンドポイントに対するリクエスト手順を提供すること（API キー発行方法は Coming Soon / プレースホルダー）

#### Section 2: Getting Started

- **FR-030**: System MUST Getting Started ページで SaaS API へのアクセス方法（エンドポイント URL、API キー取得手順）を提供すること（API キー発行方法は Coming Soon / プレースホルダー）
- **FR-031**: System MUST First Entity チュートリアルで NGSIv2 によるエンティティ CRUD の curl コマンド例を提供すること
- **FR-032**: System MUST Demo App ページで geonicdb-demo-app（React + MapLibre GL JS）への導線と概要を提供すること

#### Section 3: Core Concepts

- **FR-040**: System MUST NGSI Data Model ページで Entity, Attribute, Metadata の基本概念を説明すること
- **FR-041**: System MUST Multi-Tenancy ページで Fiware-Service / Fiware-ServicePath ヘッダーによるテナント分離を説明すること
- **FR-042**: System MUST NGSIv2 vs NGSI-LD ページで両 API の違い、相互運用性、Unified Internal Format を説明すること
- **FR-043**: System MUST Query Language ページで q パラメータ（比較・論理・範囲・パターン演算子）、mq、scopeQ、pick/omit、lang を説明すること

#### Section 4: API Reference

- **FR-050**: System MUST NGSIv2 API リファレンスで全エンドポイント（entities, types, subscriptions, registrations, batch operations）を一覧し、リクエスト/レスポンス例を提供すること
- **FR-051**: System MUST NGSI-LD API リファレンスで全エンドポイント（entities, types, attributes, subscriptions, csourceRegistrations, csourceSubscriptions, entityOperations, temporal, jsonldContexts, entityMaps, snapshots）を一覧し、リクエスト/レスポンス例を提供すること
- **FR-052**: System MUST Admin API リファレンスでテナント・ユーザー・OAuth クライアント管理 API を一覧すること
- **FR-053**: System MUST Pagination ページで limit/offset パラメータとカウントヘッダー（Fiware-Total-Count, NGSILD-Results-Count, X-Total-Count）を説明すること
- **FR-054**: System MUST Status Codes ページで各エンドポイントの全ステータスコード（200/201/204/400/401/403/404/409/422）を一覧すること
- **FR-055**: System SHOULD OpenAPI spec (`GET /openapi.json`) からの API リファレンス自動生成を検討し、既存ドキュメントとの統合方針を定めること

#### Section 5: Features

- **FR-060**: System MUST Subscriptions ページで HTTP Webhook、MQTT (QoS 0/1/2, TLS)、WebSocket イベントストリーミング、パターンマッチ、スロットリング、マクロ置換を説明すること
- **FR-061**: System MUST Federation ページでコンテキストソース登録、分散クエリ転送、結果統合、CSR変更通知、ループ検出 (Via)、警告ヘッダー (NGSILD-Warning)、モード（inclusive/exclusive/redirect/auxiliary）を説明すること
- **FR-062**: System MUST Geo/ZFXY ページでジオクエリ演算子（coveredBy, within, intersects, disjoint, equals, contains, near）、空間ID (ZFXY)、GeoJSON 出力、CRS 変換を説明すること
- **FR-063**: System MUST Vector Tiles ページで TileJSON 3.0 準拠ベクトルタイル出力、自動クラスタリング、`/ngsi-ld/v1/tiles` エンドポイントを説明すること
- **FR-064**: System MUST Temporal ページで Temporal API、MongoDB Time Series Collection、TTL データ保持ポリシー、バッチ操作を説明すること
- **FR-065**: System MUST Catalog ページで DCAT-AP JSON-LD カタログ、CKAN 互換 API、CADDE 連携を説明すること
- **FR-066**: System MUST Smart Data Models ページで FIWARE Smart Data Models サポート、@context 自動補完、ドメイン・モデル閲覧を説明すること
- **FR-067**: System MUST Snapshots ページでエンティティのポイントインタイム・スナップショット作成・復元を説明すること

#### Section 6: AI Integration

- **FR-070**: System MUST MCP Server ページで `POST /mcp` エンドポイント、Streamable HTTP トランスポート、ステートレスモード、JWT 認証、Claude Desktop 設定例を提供すること
- **FR-071**: System MUST llms.txt ページで `GET /` で取得できる LLM 向け API ドキュメント形式を説明すること
- **FR-072**: System MUST tools.json ページで 8ツール（entities, types, attributes, batch, temporal, jsonld_contexts, admin, data_models）の一覧と Claude Tool Use / OpenAI Function Calling 互換スキーマを説明すること
- **FR-073**: System MUST 活用例ページで Python + Claude API / OpenAI API のコード例を提供すること
- **FR-074**: System MUST NGSI-LD 属性型の自動検出（Property, Relationship, GeoProperty, LanguageProperty）の仕様を説明すること

#### Section 7: Security (Coming Soon)

- **FR-080**: System SHOULD Security セクションのトップページに「Coming Soon」を表示し、SaaS 提供開始後に詳細ドキュメントを公開する旨を記載すること
- **FR-081**: System SHOULD 将来的に JWT 認証、OAuth/OIDC、RBAC、XACML、IP制限の各ページを公開すること（SaaS 認証基盤の設計確定後）

#### Section 8: Japan Standards

- **FR-090**: System MUST CADDE ページで分野間データ連携基盤コネクタとの連携方法（x-cadde-* ヘッダー、来歴情報、Bearer 認証）を説明すること
- **FR-091**: System MUST 空間ID/ZFXY ページでデジタル庁/IPA 空間IDガイドライン準拠の3D空間識別仕様を説明すること
- **FR-092**: System MUST スマートシティ事例ページで GeonicDB のスマートシティ・IoT ユースケースを紹介すること

#### Section 9: Migration

- **FR-110**: System MUST Orion → GeonicDB SaaS 移行ガイドで、Orion セルフホスト環境から GeonicDB SaaS への移行手順（API エンドポイント変更、認証方式の切り替え、サブスクリプション移行）を提供すること
- **FR-111**: System MUST 互換性マトリクスで NGSIv2・NGSI-LD の全エンドポイント対応状況、GeonicDB 独自機能、Orion のみの機能を一覧すること
- **FR-112**: System MUST 既知の非互換点（httpCustom.json、httpCustom.ngsi、JEXL式 が未対応）と SaaS 固有の制約事項を明記すること

#### 技術選定

- **FR-120**: System MUST VitePress（Vite ベース SSG）をフレームワークとして採用すること
- **FR-121**: 選定根拠: Vite ベースで GeonicDB 本体（TypeScript/Node.js）と技術統一、Markdown 中心のオーサリング、VitePress 組み込み i18n、Vue 3 コンポーネントによるカスタマイズ性。Docusaurus（React ベース、重い）、GitBook（プロプライエタリ、カスタマイズ制限）と比較して最適

#### API リファレンス自動生成

- **FR-130**: System SHOULD OpenAPI spec (`GET /openapi.json`) からの API ドキュメント自動生成パイプラインを構築すること
- **FR-131**: System MUST 自動生成と手動記述の API ドキュメント（API.md, API_NGSIV2.md, API_NGSILD.md）の統合方針を定めること

#### デモアプリ連携

- **FR-140**: System MUST Getting Started セクションから geonicdb-demo-app（`/home/hal/workspace/geonicdb-demo-app`）への導線を設計すること
- **FR-141**: System SHOULD デモアプリの各ページ（Dashboard, API Tutorial, Smart Building, City Map 等）への直接リンクを提供すること

### Key Entities

- **Documentation Page**: VitePress で管理される1つの Markdown ページ。タイトル、frontmatter（言語、カテゴリ、ソースパス）、本文を持つ
- **Section**: サイドバーの大分類（9セクション）。Introduction, Getting Started, Core Concepts, API Reference, Features, AI Integration, Security (Coming Soon), Japan Standards, Migration
- **Source Document**: GeonicDB 本体 `docs/` から取り込む元ドキュメント（25ファイル）。ビルドスクリプトで VitePress 形式に変換される
- **Original Content**: geonicdb-docs リポジトリ独自のコンテンツ（チュートリアル、概要、事例）。Source Document とは独立して管理

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: VitePress でサイトがビルドでき、`npm run docs:dev` でローカルプレビューが動作すること
- **SC-002**: GeonicDB 本体 `docs/` の25ファイルの内容がサイトに正しく取り込まれ、閲覧可能であること
- **SC-003**: 日英2言語の切り替えが VitePress i18n で動作し、各ページで言語選択できること
- **SC-004**: 9セクション（Introduction, Getting Started, Core Concepts, API Reference, Features, AI Integration, Security (Coming Soon), Japan Standards, Migration）が全てナビゲーションに表示されること
- **SC-005**: Orion 開発者が移行判断に必要な情報（互換性マトリクス、移行手順、非互換点）が Migration セクションに揃っていること
- **SC-006**: API リファレンス（NGSIv2, NGSI-LD, Admin API）が閲覧可能で、エンドポイント・パラメータ・レスポンス例が含まれること
- **SC-007**: Quick Start の手順に従って SaaS API エンドポイントに対してエンティティ CRUD が実行可能であること
- **SC-008**: AI Integration セクションで MCP 接続方法、tools.json スキーマ、コード例が閲覧可能であること
- **SC-009**: サイト内検索で「subscription」「CADDE」「ZFXY」等のキーワードで関連ページがヒットすること
- **SC-010**: レスポンシブデザインでモバイル表示が崩れないこと
