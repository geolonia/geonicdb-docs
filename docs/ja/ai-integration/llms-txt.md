---
title: llms.txt
description: GeonicDB はルート URL で LLM 向けに最適化された Markdown 形式の API ドキュメントを提供する llms.txt エンドポイントを実装しています。
outline: deep
---

# llms.txt

GeonicDB は [llms.txt 標準](https://llmstxt.org/) を実装しており、ルート URL で Markdown 形式の API ドキュメントを提供します。これにより LLM は API の構造を理解し、Context Broker と連携するための簡潔で構造化された概要を取得できます。

## エンドポイント

| 項目 | 値 |
|------|-----|
| **URL** | `GET /` |
| **形式** | Markdown |
| **Content-Type** | `text/markdown` |
| **認証** | 不要 |

## 仕組み

AI エージェント（または任意の HTTP クライアント）が `GET /` リクエストを送信すると、GeonicDB は以下を記述した Markdown ドキュメントを返します:

- API の目的と機能
- 利用可能なエンドポイントとパラメータ
- 認証要件
- リクエスト・レスポンスの例

このドキュメントは現在のサーバー設定に基づいて動的に生成されるため、常にアクティブな API サーフェスを反映します。

## 使い方

### 直接取得

```bash
curl https://api.geonicdb.geolonia.com/
```

レスポンスは LLM がパースして API を理解できる Markdown ドキュメントです。

### AI エージェントワークフローでの利用

AI エージェントは API 検出の第一歩として llms.txt コンテンツを取得できます:

```python
import requests

# API ドキュメントを取得
docs = requests.get("https://api.geonicdb.geolonia.com/").text

# LLM にコンテキストとして渡す
# LLM は API 構造を理解し、適切な呼び出しを生成可能
```

## なぜ llms.txt か？

従来の API ドキュメント（HTML ページ、PDF）は人間の閲覧用に設計されています。OpenAPI 仕様は機械可読ですが、LLM が効率的に処理するには冗長で複雑になりがちです。

llms.txt 形式はその中間を提供します:

- **簡潔** — AI が API を利用するために必要な情報のみ
- **構造化** — Markdown の見出しとテーブルで容易にパース可能
- **動的** — 常に現在の API 設定を反映
- **汎用** — 特別なツールなしであらゆる LLM が Markdown を処理可能

## 関連エンドポイント

| エンドポイント | 形式 | 用途 |
|---------------|------|------|
| `GET /` | Markdown（llms.txt） | LLM フレンドリーな概要 |
| `GET /tools.json` | JSON | Function Calling 向け構造化ツール定義 |
| `GET /openapi.json` | JSON | 完全な OpenAPI 3.0 仕様 |
| `GET /.well-known/ai-plugin.json` | JSON | AI プラグイン検出用マニフェスト |

## 次のステップ

- [tools.json](/ja/ai-integration/tools-json) — Claude / OpenAI 向け構造化ツール定義
- [MCP サーバー](/ja/ai-integration/mcp-server) — MCP プロトコルによる直接アクセス
- [使用例](/ja/ai-integration/examples) — 実装例
