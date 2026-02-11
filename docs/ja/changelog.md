---
title: 変更履歴
description: Vela OS の変更履歴
outline: deep
---

# 変更履歴

このプロジェクトのすべての重要な変更は、このファイルに記録されます。

このフォーマットは [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に基づいており、
このプロジェクトは [Semantic Versioning](https://semver.org/lang/ja/) に準拠しています。

## [Unreleased]

### Added
- ReactiveCore Rules - パターンマッチング、条件式、アクションを備えた自動エンティティ処理ルールエンジン (#344, #378, #379, #380, #381, #383, #384, #389)
  - エンティティタイプ、ID、属性名のパターンマッチング
  - 論理演算子（AND/OR）を使用した条件式
  - 複数のアクション: createEntity、updateEntity、deleteEntity、sendNotification
  - 無限ループ防止機構
  - リアルタイムイベント処理のためのChange Stream統合
  - `npm start` によるローカルテストサポート
- SaaSローンチ向けの包括的なクォータシステム (#356, #391)
  - リクエストクォータ（レート制限、日次/月次制限）
  - ストレージクォータ（エンティティ/属性数）
  - DynamoDBによるリアルタイム監視
  - テナント固有のクォータ設定
  - レート制限レスポンスのRetry-Afterヘッダー
- MCP (Model Context Protocol) サーバー統合 (#392)
  - AI駆動型エンティティ管理のための5つの統合ツール
  - エンティティCRUD操作
  - バッチ操作
  - 時系列クエリ
  - JSON-LDコンテキスト管理
  - 管理操作
- Smart Data Modelsサポート (#347, #368, #373)
  - プロパティ詳細を含む19の標準データモデル
  - AI駆動型エンティティ作成ガイダンス
  - 全モデルのpropertyDetailsメタデータ
- 全APIエンドポイントのZod v4ランタイム型検証 (#358)
- CADDE（データ連携）サービス統合
- セキュリティ強化のためのテナント単位のIPホワイトリスト
- ベクタータイル生成API
- 時系列データのTemporal API
- エンティティスナップショット機能
- JSON-LDコンテキスト管理
- データカタログAPI（CKAN/DCAT互換）
- 新規ユーザー向けQUICKSTART.mdガイド (#372)
- 包括的なAWSデプロイ手順を含むDEPLOYMENT.md (#382)
- VelaOS取扱説明書（docs/instruction.md）とPDF生成スクリプト（npm run docs:pdf） (#400)
- instruction.md の全サンプルを検証する E2E テスト（tests/e2e/features/common/instruction.feature） (#400)

### Changed
- Node.js要件を >=24.13.0 にアップグレード
- MongoDBを7.1.0にアップグレード
- テストフレームワークをCucumber.js（Gherkin日本語）に移行
- 設定値を `src/config/defaults.ts` に集約 (#355)
- MCPツールを8つから5つに統合し、保守性を向上 (#392)
- バージョン番号を集約し、package.jsonからインポート (#393)

### Fixed
- ローカルサーバーのMongoDBシャットダウンエラーを抑制 (#394)
- クォータシステムのバグ修正: Retry-Afterヘッダー、負数カウントバイパス、時間単位の不一致 (#391)
- NGSI-LDスキーマ検証を強化 (#365, #366, #367, #370)
- NGSI-LD URIパターンの不整合を解決 (#364)
- セキュリティ脆弱性に対処（ReDoS防止、入力検証）
- ルールエンジンのエッジケース: 空のsubscriptionIds、マクロ置換、エンティティタイプ解決

### Security
- エンティティID（256文字）、タイプ（256文字）、属性名（256文字）の長さ制限を追加 (#353, #369)
- テナント単位のIPベースのアクセス制限
- ロールベースのアクセス制御を備えたJWT認証（super_admin、tenant_admin、user）
- ReDoS（正規表現サービス拒否）防止
- 全APIエンドポイントの入力検証

## [0.1.0] - 2026-02-11

### Added
- VelaOS初回リリース - AWS Lambda上で動作するFIWARE Orion互換Context Broker
- NGSIv2 API実装
  - エンティティCRUD操作
  - サブスクリプション
  - レジストレーション
  - バッチ操作
  - クエリ言語サポート（q、mqパラメータ）
- NGSI-LD API実装
  - エンティティ操作
  - サブスクリプション
  - コンテキストソースレジストレーション
  - バッチ操作
  - クエリ言語サポート（q、scopeQ、pick、omit、langパラメータ）
- NGSIv2とNGSI-LD API間の完全な相互運用性
- Fiware-Serviceヘッダーによるマルチテナンシーサポート
- コンテキストプロバイダ転送によるフェデレーション機能
- 空間IDを使用した地理空間クエリサポート
- JWT認証・認可
- テナントおよびユーザー管理のための管理API
- レプリカセット対応のMongoDBストレージ
- SAMテンプレートによるAWS Lambdaデプロイ
- サブスクリプションマッチングのためのEventBridge統合
- 通知配信のためのSQS FIFOキュー
- 通知のためのMQTTサポート
- 包括的なE2Eテストスイート（Cucumber.js）
- 単体テストカバレッジ ~99%（Jest）
- インメモリMongoDBを使用したローカル開発サーバー（`npm start`）

[unreleased]: https://github.com/geolonia/vela/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/geolonia/vela/releases/tag/v0.1.0
