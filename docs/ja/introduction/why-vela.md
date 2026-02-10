---
title: なぜ Vela を選ぶのか？
description: Vela OS と FIWARE Orion Context Broker の詳細比較。アーキテクチャ、AI サポート、地理空間機能などの主要な違いを解説。
outline: deep
---

# なぜ Vela を選ぶのか？

Vela OS は FIWARE Orion のモダンな代替として、クラウドネイティブ、AI 駆動、地理空間ワークロードに最適化して設計されています。このページでは主要な違いを解説します。

## 概要比較

| 項目 | Vela OS | FIWARE Orion |
|------|---------|--------------|
| **実装言語** | TypeScript / Node.js | C++ |
| **アーキテクチャ** | サーバーレス（AWS Lambda） | モノリシック（Docker） |
| **データベース** | MongoDB Atlas | MongoDB |
| **API サポート** | NGSIv2 + NGSI-LD（単一インスタンス） | NGSIv2（Orion）または NGSI-LD（Orion-LD） |
| **スケーリング** | 自動（Lambda） | 手動（コンテナオーケストレーション） |
| **料金体系** | 従量課金 | 固定インフラコスト |
| **ライセンス** | GPL v3.0 | AGPL v3.0 |

## 9つの主要な差別化ポイント

### 1. サーバーレスアーキテクチャ

Vela は AWS Lambda 上で動作します。サーバーのプロビジョニング、パッチ適用、スケーリングは不要です。Lambda がトラフィックの急増を自動処理し、実際の API 呼び出しに対してのみ課金されます。

| | Vela OS | Orion |
|---|---------|-------|
| デプロイ | AWS Lambda + API Gateway | Docker コンテナ |
| スケーリング | 自動、リクエスト単位 | 手動、コンテナ単位 |
| コストモデル | 呼び出し単位課金 | 固定サーバーコスト |
| メンテナンス | AWS が管理 | セルフマネージド |

### 2. AI ネイティブ設計

Vela は 4 つの AI 連携エンドポイントを標準搭載しています。プラグインや外部ツールは不要です。

| エンドポイント | 用途 | Orion 対応 |
|---------------|------|-----------|
| `POST /mcp` | Claude Desktop / AI エージェント向け MCP サーバー | ❌ |
| `GET /` | llms.txt — LLM が読める形式の API ドキュメント | ❌ |
| `GET /tools.json` | Claude / OpenAI 向けツール定義 | ❌ |
| `GET /openapi.json` | OpenAPI 3.0 仕様 | ✅ |

Vela では、AI アシスタントが標準化されたツールインターフェースを通じて IoT エンティティを直接クエリ、作成、管理できます。

### 3. 地理空間拡張

標準的な NGSI ジオクエリに加え、Vela は日本固有の空間機能とモダンな地図連携を提供します。

| 機能 | Vela OS | Orion |
|------|---------|-------|
| 標準ジオクエリ（near, within, intersects 等） | ✅ | ✅ |
| 空間 ID（ZFXY）— デジタル庁標準 | ✅ | ❌ |
| ベクトルタイル（TileJSON 3.0） | ✅ | ❌ |
| GeoJSON 出力 | ✅ | ✅ |
| CRS 変換 | ✅ | ❌ |
| 地図表示用自動クラスタリング | ✅ | ❌ |

### 4. CADDE 連携（分野間データ連携基盤）

Vela は日本の分野間データ連携基盤（CADDE）をネイティブサポートし、政府データシステムとの相互運用を実現します。

- `x-cadde-*` リクエストヘッダーによるリソース識別
- 来歴情報ヘッダー（`x-cadde-provenance-*`）
- CADDE コネクタ向け Bearer 認証

FIWARE Orion は CADDE に対応していません。

### 5. デュアル API（NGSIv2 + NGSI-LD）

Orion は NGSIv2 のみ、Orion-LD は NGSI-LD のみをサポートしています。Vela は**同一インスタンス上で両方をサポート**し、完全なクロス API 相互運用を実現します。

- NGSIv2 でエンティティを作成 → NGSI-LD で取得可能
- NGSI-LD でエンティティを作成 → NGSIv2 で取得可能
- 統一された内部フォーマットがすべての変換を自動処理

これにより、既存の NGSIv2 アプリケーションと新しい NGSI-LD サービスが共存でき、段階的な移行が可能です。

### 6. 組み込みエンタープライズ認証

Vela は完全な認証・認可システムを内蔵しています。Orion は外部コンポーネント（Keyrock、Wilma PEP Proxy）が必要です。

| 機能 | Vela OS | Orion |
|------|---------|-------|
| JWT 認証 | ✅ 組み込み | ❌ Keyrock が必要 |
| RBAC（3 ロール） | ✅ 組み込み | ❌ PEP Proxy が必要 |
| XACML ポリシーセット | ✅ 組み込み | ❌ |
| OIDC 外部 IdP | ✅ 組み込み | ❌ |
| IP ホワイトリスト | ✅ 組み込み | ❌ |
| OAuth 2.0（M2M） | ✅ 組み込み | ❌ Keyrock が必要 |

### 7. リアルタイム WebSocket ストリーミング

Vela は標準的な HTTP Webhook や MQTT 配信に加え、WebSocket ベースのイベントストリーミングによるリアルタイムのエンティティ変更通知を提供します。

| 通知チャネル | Vela OS | Orion |
|-------------|---------|-------|
| HTTP Webhook | ✅ | ✅ |
| MQTT（QoS 0/1/2, TLS） | ✅ | ✅ |
| WebSocket ストリーミング | ✅ | ❌ |
| SQS FIFO（順序保証配信） | ✅ | ❌ |
| Dead Letter Queue | ✅ | ❌ |

### 8. データカタログ

Vela は EU およびオープンデータ標準と互換性のある組み込みデータカタログ API を搭載しています。

| 機能 | Vela OS | Orion |
|------|---------|-------|
| DCAT-AP JSON-LD カタログ | ✅ | ❌ |
| CKAN 互換 API | ✅ | ❌ |
| CKAN ハーベスタ対応 | ✅ | ❌ |
| データセットサンプルエンドポイント | ✅ | ❌ |

### 9. SaaS API アクセス

Vela OS はマネージド SaaS として利用できます。デプロイ、インフラ、メンテナンスは不要。API を呼び出すだけです。

| | Vela OS | Orion |
|---|---------|-------|
| SaaS 提供 | ✅ | ❌ |
| セルフホスト | AWS Lambda | Docker / Kubernetes |
| 導入手順 | API キー + curl | Clone → Docker Compose → 設定 |

## Vela を選ぶべきケース

以下のニーズがある場合、Vela OS が最適です：

- **サーバーレス / オートスケーリング** — 可変トラフィック、従量課金
- **AI 連携** — IoT データと LLM エージェントの連携
- **デュアル API** — NGSIv2 + NGSI-LD の共存
- **日本標準** — CADDE、空間 ID（ZFXY）
- **組み込み認証** — 外部 ID 管理のセットアップ不要
- **リアルタイムストリーミング** — ブラウザベースのダッシュボード向け WebSocket
- **データカタログ** — DCAT-AP / CKAN 連携

## Orion を選ぶべきケース

以下のニーズがある場合は FIWARE Orion が適しています：

- **オンプレミスデプロイ** — エアギャップ環境や規制環境
- **既存 FIWARE エコシステム** — Keyrock、Wilma、Cygnus 等との密連携
- **Docker / Kubernetes** — 標準的なコンテナオーケストレーション
- **マルチクラウド** — AWS、GCP、Azure、ハイブリッド環境

## 次のステップ

- [アーキテクチャ](/ja/introduction/architecture) — Vela の構成を理解する
- [クイックスタート](/ja/introduction/quick-start) — 最初の API コールを試す
- Orion から Vela への移行 — ステップバイステップの移行ガイド
