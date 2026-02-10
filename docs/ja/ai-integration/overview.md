---
title: AI 連携 概要
description: Vela OS は AI ネイティブ Context Broker として、MCP サーバー、llms.txt、tools.json など複数の AI 向けインターフェースを提供します。
outline: deep
---

# AI 連携 概要

Vela OS は **AI ネイティブ Context Broker** として設計されており、AI エージェント（Claude、GPT-4、Gemini 等）がカスタム統合コードなしで IoT コンテキストデータを検出・クエリ・管理できる複数の標準化インターフェースを提供します。

## AI 連携の3本柱

Vela OS は3つの補完的な AI インターフェースを公開しています:

| エンドポイント | 形式 | 用途 |
|---------------|------|------|
| `GET /` | Markdown ([llms.txt](https://llmstxt.org/)) | LLM 向けに最適化された API ドキュメント |
| `GET /tools.json` | JSON | Claude Tool Use / OpenAI Function Calling 向けツール定義 |
| `POST /mcp` | JSON-RPC ([MCP](https://modelcontextprotocol.io/)) | Model Context Protocol による直接通信 |

さらに、標準的な機械可読仕様も利用可能です:

| エンドポイント | 形式 | 用途 |
|---------------|------|------|
| `GET /openapi.json` | JSON | OpenAPI 3.0 仕様 |
| `GET /.well-known/ai-plugin.json` | JSON | AI プラグイン検出用マニフェスト |

## AI エージェントによる Vela の利用フロー

### 1. ディスカバリ

AI エージェントはまず `GET /`（llms.txt）または `GET /tools.json` を取得して Vela の機能を把握します。これらのエンドポイントは、利用可能な操作・パラメータ・認証要件をエージェントが理解できる形式で記述しています。

### 2. インタラクション

エージェントは2つの経路で Vela と連携します:

- **MCP プロトコル** — `POST /mcp` 経由で Model Context Protocol を使用。Claude Desktop 等の MCP 対応クライアントに最適で、8つの組み込みツールを備えた構造化ツール呼び出しインターフェースを提供します。
- **直接 API 呼び出し** — `tools.json` や `openapi.json` のスキーマを使って NGSIv2 / NGSI-LD エンドポイントを直接呼び出します。

### 3. データ操作

どちらの経路でも、NGSI 操作の全範囲を実行できます:

- エンティティの**クエリ**（タイプ・ID・属性・位置・時系列）
- エンティティの**作成**（NGSI-LD 属性型の自動検出付き）
- エンティティの**更新**（追加・パッチ・置換）
- エンティティ変更の**サブスクリプション**（Webhook、MQTT、WebSocket）
- テナント・ユーザー・アクセスポリシーの**管理**（認証必須）

## 利用可能な MCP ツール

Vela の MCP サーバーは **8つのツール** を公開しており、各ツールは `action` パラメータで操作を選択します:

| ツール | アクション | 説明 |
|--------|-----------|------|
| `entities` | list, get, create, update, delete, replace, search_by_location, search_by_attribute | IoT エンティティ管理 |
| `types` | list, get | エンティティタイプ照会 |
| `attributes` | list, get_info, get_all, get, append, patch_all, replace, patch, delete | エンティティ属性管理 |
| `batch` | create, upsert, update, merge, delete, query, purge | 一括操作（最大1,000件） |
| `temporal` | get, query, create, delete, add_attributes, delete_attribute, merge, modify_instance, delete_instance, batch_create, batch_upsert, batch_delete, batch_query | 時系列データ管理 |
| `jsonld_contexts` | list, get, create, delete | JSON-LD コンテキスト管理 |
| `admin` | list, get, create, update, delete, activate, deactivate, change_password | ユーザー・テナント・ポリシー管理（認証必須） |
| `data_models` | list_domains, list_models, get_model | Smart Data Models カタログ閲覧 |

## NGSI-LD 属性型の自動検出

MCP ツール経由でエンティティを作成・更新する際、Vela は値から NGSI-LD 属性型を自動推論します:

| 値のパターン | 検出される型 | 例 |
|------------|-----------|-----|
| `urn:` で始まる文字列 | `Relationship` | `"urn:ngsi-ld:Building:001"` |
| GeoJSON オブジェクト（Point, Polygon 等） | `GeoProperty` | `{"type": "Point", "coordinates": [139.7, 35.6]}` |
| `languageMap` フィールドを含むオブジェクト | `LanguageProperty` | `{"languageMap": {"en": "Hello", "ja": "こんにちは"}}` |
| その他すべての値 | `Property` | `25.5`, `"text"`, `true`, `[1, 2, 3]` |

明示的に型を指定することも可能です:

```json
{"type": "Property", "value": 25.5}
{"type": "Relationship", "object": "urn:ngsi-ld:Building:001"}
{"type": "GeoProperty", "value": {"type": "Point", "coordinates": [139.7, 35.6]}}
```

## 認証

`AUTH_ENABLED=true` の場合、AI エージェントは認証情報を含める必要があります:

- **MCP**: `POST /mcp` リクエストの `Authorization` ヘッダーに JWT Bearer トークンを含める
- **直接 API**: 各リクエストに `Authorization: Bearer <token>` ヘッダーを含める
- **テナント分離**: 各ツールは `tenant` パラメータを受け付けます。認証済みユーザーは割り当てられたテナントがデフォルト。`super_admin` は任意のテナントにアクセス可能。

## 次のステップ

- [MCP サーバー](/ja/ai-integration/mcp-server) — Claude Desktop 等の MCP アクセス設定
- [llms.txt](/ja/ai-integration/llms-txt) — LLM 向け最適化ドキュメントエンドポイント
- [tools.json](/ja/ai-integration/tools-json) — ツール定義スキーマの詳細
- [使用例](/ja/ai-integration/examples) — Python SDK を使った実装例
