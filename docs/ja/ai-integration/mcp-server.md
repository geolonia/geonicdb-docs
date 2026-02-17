---
title: MCP サーバー
description: GeonicDB は Model Context Protocol (MCP) サーバーエンドポイントを提供し、Claude Desktop や VS Code Copilot 等の MCP クライアントから直接接続できます。
outline: deep
---

# MCP サーバー

GeonicDB は [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) をサポートしており、MCP 対応 AI クライアントから直接 Context Broker に接続してデータ操作を行えます。

## エンドポイント詳細

| 項目 | 値 |
|------|-----|
| **エンドポイント** | `POST /mcp` |
| **トランスポート** | Streamable HTTP（JSON レスポンスモード） |
| **プロトコルバージョン** | 2025-03-26 |
| **動作モード** | ステートレス（Lambda 対応） |
| **認証** | JWT Bearer トークン（`AUTH_ENABLED=true` 時） |

## Claude Desktop 設定

### SaaS（認証あり）

Claude Desktop の MCP 設定に以下を追加してください:

```json
{
  "mcpServers": {
    "geonicdb": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://api.geonicdb.geolonia.com/mcp",
        "--header",
        "Authorization: Bearer YOUR_API_KEY"
      ]
    }
  }
}
```

`YOUR_API_KEY` を実際の JWT トークンに置き換えてください。

### ローカル開発（認証なし）

認証を無効にしたローカル開発環境の場合:

```json
{
  "mcpServers": {
    "geonicdb": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://localhost:3000/mcp"
      ]
    }
  }
}
```

## 利用可能なツール

MCP サーバーは **8つのツール** を公開しており、`action` パラメータで操作を選択します:

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

## テナントとサービスパス

### テナント選択

各ツールは `tenant` パラメータを受け付けます:

- **認証無効時**: 省略すると `default` テナントが使用されます
- **認証有効時**: 省略するとログインユーザーのテナントがデフォルト。`super_admin` は任意のテナントにアクセス可能。`tenant_admin` / `user` は自テナントのみ。

### サービスパス

`entities`、`types`、`attributes`、`batch`、`temporal` ツールは `servicePath` パラメータを受け付け、階層的なスコープでエンティティを管理できます:

```text
# /hello パスのエンティティ
servicePath: "/hello"

# 階層検索: /Madrid/Gardens とその子パス全て
servicePath: "/Madrid/Gardens/#"

# 複数パス指定（最大10、カンマ区切り）
servicePath: "/park1, /park2"
```

::: warning
書き込み操作（create, update, delete）では単一の非階層パスのみ使用できます。`/#` サフィックスやカンマ区切りのパスは読み取り操作でのみサポートされます。
:::

## curl での動作確認

MCP エンドポイントを直接テストできます:

```bash
curl -X POST https://api.geonicdb.geolonia.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": {"name": "curl-test", "version": "1.0.0"}
    }
  }'
```

## 制限事項

- **ステートレスモード**: AWS Lambda の制約により SSE ストリーミングは使用できません。すべてのリクエストは JSON レスポンスで返されます。
- **セッション管理なし**: 各リクエストは独立して処理されます。`GET /mcp`（SSE）および `DELETE /mcp`（セッション終了）は HTTP 405 を返します。
- **認証**: `AUTH_ENABLED=true` 時は有効な Bearer トークンが必要です。`AUTH_ENABLED=false` 時は認証不要です。

## 次のステップ

- [llms.txt](/ja/ai-integration/llms-txt) — LLM 向け最適化ドキュメントエンドポイント
- [tools.json](/ja/ai-integration/tools-json) — Function Calling 用ツール定義スキーマ
- [使用例](/ja/ai-integration/examples) — 実装例
