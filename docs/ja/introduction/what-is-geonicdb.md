---
title: GeonicDB とは？
description: GeonicDB の概要 — AWS Lambda 上で動作する FIWARE Orion 互換のサーバーレス Context Broker。デュアル API、AI ネイティブ設計、地理空間拡張機能を搭載。
outline: deep
---

# GeonicDB とは？

GeonicDB は **AWS Lambda** 上で動作し、**MongoDB Atlas** をデータストアとする **FIWARE Orion 互換の Context Broker** です。単一のデプロイで **NGSIv2** と **NGSI-LD** の両方の API を完全サポートし、IoT やスマートシティのコンテキストデータをシームレスに管理できます。

## 主な特長

- **サーバーレスアーキテクチャ** — AWS Lambda によるオートスケーリングと従量課金。インフラ管理は不要です。
- **デュアル API サポート** — NGSIv2 と NGSI-LD を同時にサポート。一方の API で作成したエンティティをもう一方から取得できます。
- **AI ネイティブ設計** — MCP（Model Context Protocol）サーバー、llms.txt、tools.json、OpenAPI 3.0 エンドポイントを標準搭載。AI エージェントがデータに直接アクセスできます。
- **地理空間拡張** — 空間 ID（ZFXY）、GeoJSON 出力、ベクトルタイル（TileJSON 3.0）、CRS 変換をビルトインサポート。
- **エンタープライズ認証** — JWT + RBAC + XACML ポリシーベース認可 + OIDC 外部 IdP 連携を、外部コンポーネントなしで提供。
- **リアルタイムストリーミング** — WebSocket イベントストリーミングと MQTT ネイティブサポート。
- **データカタログ** — DCAT-AP / CKAN 互換 API によるオープンデータポータル連携。
- **日本政府標準対応** — CADDE（分野間データ連携基盤）コネクタおよびデジタル庁/IPA 空間 ID ガイドライン対応。
- **FIWARE エコシステム互換** — FIWARE Orion のドロップイン代替として、既存の FIWARE エコシステムと互換性があります。

## 仕組み

GeonicDB は **AWS API Gateway** 経由で API リクエストを受信し、**AWS Lambda** 関数にルーティングします。Lambda 関数は NGSI リクエスト（エンティティ CRUD、サブスクリプション、ジオクエリ、フェデレーション）を処理し、データを **MongoDB Atlas** に保存します。

```text
クライアントリクエスト
    ↓
API Gateway（HTTP / WebSocket）
    ↓
AWS Lambda（GeonicDB）
    ↓
MongoDB Atlas
```

サブスクリプション通知は **EventBridge** と **SQS FIFO** キューを介して非同期に処理され、HTTP Webhook、MQTT、WebSocket チャネルによる順序保証された信頼性の高い配信を実現します。

## デュアル API: NGSIv2 と NGSI-LD

FIWARE Orion（NGSIv2 のみ）や Orion-LD（NGSI-LD のみ）とは異なり、GeonicDB は**同一インスタンス上で両方の API をサポート**します。統一された内部エンティティフォーマットにより、完全な相互運用が可能です。

| 機能 | NGSIv2 | NGSI-LD |
|------|--------|---------|
| エンティティ CRUD | `/v2/entities` | `/ngsi-ld/v1/entities` |
| サブスクリプション | `/v2/subscriptions` | `/ngsi-ld/v1/subscriptions` |
| バッチ操作 | `/v2/op/update`, `/v2/op/query` | `/ngsi-ld/v1/entityOperations/*` |
| 登録 | `/v2/registrations` | `/ngsi-ld/v1/csourceRegistrations` |
| クロス API アクセス | ✅ | ✅ |

NGSIv2 で書き込んだデータを NGSI-LD で読み取ることが可能で、その逆も同様です。フォーマット変換は自動的に処理されます。

## AI ネイティブ連携

GeonicDB は AI エージェントとの連携を最初から想定して設計されています：

- **MCP サーバー**（`POST /mcp`）— Claude Desktop などの MCP クライアントと互換性のある Streamable HTTP トランスポート
- **llms.txt**（`GET /`）— LLM 向けに最適化された人間可読の API ドキュメント
- **tools.json**（`GET /tools.json`）— Claude Tool Use および OpenAI Function Calling 互換のツール定義
- **OpenAPI 3.0**（`GET /openapi.json`）— 標準 API 仕様

これらのエンドポイントにより、AI アシスタントはカスタム統合コードなしで IoT データのクエリ、作成、管理が可能です。

## 技術スタック

| コンポーネント | テクノロジー |
|----------------|-------------|
| ランタイム | Node.js 20.x, TypeScript |
| クラウド | AWS Lambda, API Gateway, EventBridge, SQS |
| データベース | MongoDB Atlas 8.0+（Time Series Collections） |
| 通知 | HTTP Webhook, MQTT（QoS 0/1/2）, WebSocket |
| 可観測性 | OpenTelemetry, AWS X-Ray, Prometheus メトリクス |
| ライセンス | GPL v3.0 |

## SaaS アクセス

GeonicDB はマネージド SaaS サービスとして利用できます。インストールやインフラ構築は不要です。

- **API エンドポイント**: `https://api.geonicdb.geolonia.com/v2/`
- **NGSI-LD エンドポイント**: `https://api.geonicdb.geolonia.com/ngsi-ld/v1/`

::: tip 準備中
API キーの登録機能は現在準備中です。詳細が決まり次第お知らせします。
:::

## 次のステップ

- [なぜ GeonicDB を選ぶのか？](/ja/introduction/why-geonicdb) — FIWARE Orion との比較
- [アーキテクチャ](/ja/introduction/architecture) — システムアーキテクチャの詳細
- [クイックスタート](/ja/introduction/quick-start) — 数分で最初の API コールを試す
