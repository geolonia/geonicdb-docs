---
title: tools.json
description: Vela OS は Claude Tool Use および OpenAI Function Calling と互換性のあるツール定義を tools.json エンドポイントで提供します。
outline: deep
---

# tools.json

Vela OS は `tools.json` エンドポイントで **Claude Tool Use** および **OpenAI Function Calling** と互換性のあるツール定義を提供します。AI エージェントはこのスキーマを取得し、手動設定なしで構造化された API 呼び出しを行えます。

## エンドポイント

| 項目 | 値 |
|------|-----|
| **URL** | `GET /tools.json` |
| **形式** | JSON |
| **認証** | 不要 |

## レスポンス構造

```json
{
  "schemaVersion": "1.0.0",
  "apiVersion": "1.0.0",
  "name": "VelaOS",
  "description": "FIWARE Orion-compatible Context Broker API tools",
  "baseUrl": "https://api.vela.geolonia.com",
  "tools": [
    {
      "name": "entities",
      "description": "Manage IoT entities (sensors, devices, etc.)...",
      "input_schema": {
        "type": "object",
        "properties": {
          "action": {
            "type": "string",
            "enum": ["list", "get", "create", "update", "delete", "replace", "search_by_location", "search_by_attribute"]
          }
        },
        "required": ["action"]
      }
    }
  ],
  "authentication": {
    "type": "header",
    "headers": {
      "Fiware-Service": "Tenant name",
      "Fiware-ServicePath": "Hierarchical path (default: /)",
      "Authorization": "Bearer token (when AUTH_ENABLED=true)"
    }
  }
}
```

## ツール定義（8ツール）

各ツールは `action` パラメータで操作を選択します:

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

> **注:** `admin` ツールの操作には管理者権限が必要です。適切な認証トークンを使用してください。

## Claude Tool Use での利用

レスポンスの `tools` 配列は Anthropic API にそのまま渡せます:

```python
import anthropic
import requests

# ツール定義を取得
tools_response = requests.get("https://api.vela.geolonia.com/tools.json")
tools = tools_response.json()["tools"]

# Claude で使用
client = anthropic.Anthropic()
response = client.messages.create(
    model="claude-sonnet-4-20250514",
    tools=tools,
    messages=[{"role": "user", "content": "温度センサーの一覧を取得して"}]
)
```

## OpenAI Function Calling での利用

ツール定義を OpenAI の形式に変換する必要があります:

```python
import openai
import requests

# ツール定義を取得して変換
tools_data = requests.get("https://api.vela.geolonia.com/tools.json").json()
openai_tools = [
    {
        "type": "function",
        "function": {
            "name": tool["name"],
            "description": tool["description"],
            "parameters": tool["input_schema"],
        }
    }
    for tool in tools_data["tools"]
]

# OpenAI で使用
client = openai.OpenAI()
response = client.chat.completions.create(
    model="gpt-4",
    tools=openai_tools,
    messages=[{"role": "user", "content": "渋谷駅周辺のセンサーを検索して"}]
)
```

## AI プラグインマニフェスト

Vela は API ディスカバリ用の AI プラグインマニフェストも提供しています:

```bash
curl https://api.vela.geolonia.com/.well-known/ai-plugin.json
```

```json
{
  "schema_version": "v1",
  "name_for_human": "VelaOS",
  "name_for_model": "vela",
  "description_for_human": "FIWARE Orion-compatible Context Broker for IoT data",
  "description_for_model": "VelaOS is a FIWARE Orion-compatible Context Broker...",
  "auth": { "type": "none" },
  "api": { "type": "openapi", "url": "/openapi.json" },
  "tools": { "url": "/tools.json" }
}
```

## 次のステップ

- [使用例](/ja/ai-integration/examples) — 完全な実装例
- [MCP サーバー](/ja/ai-integration/mcp-server) — MCP プロトコルによる直接連携
- [llms.txt](/ja/ai-integration/llms-txt) — LLM 向け最適化ドキュメントエンドポイント
