---
title: AI 連携の使用例
description: Python（Claude SDK / OpenAI SDK）と curl（MCP）を使った Vela OS と AI エージェントの連携コード例。
outline: deep
---

# AI 連携の使用例

このページでは、さまざまなアプローチで AI エージェントと Vela OS を連携する実装例を紹介します。

## Python + Claude API

Anthropic Python SDK と Vela のツール定義を使用:

```python
import anthropic
import requests
import json

VELA_API = "https://api.vela.geolonia.com"
API_KEY = "YOUR_API_KEY"

# ステップ 1: Vela からツール定義を取得
tools = requests.get(f"{VELA_API}/tools.json").json()["tools"]

# ステップ 2: Claude クライアントを作成しツール付きでリクエスト送信
client = anthropic.Anthropic()
response = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=1024,
    tools=tools,
    messages=[
        {"role": "user", "content": "温度センサーの一覧を取得して"}
    ]
)

# ステップ 3: Claude のレスポンスからツール呼び出しを処理
for block in response.content:
    if block.type == "tool_use":
        tool_name = block.name
        tool_input = block.input

        # Vela API に対してツール呼び出しを実行
        result = requests.post(
            f"{VELA_API}/v2/entities",
            headers={
                "Authorization": f"Bearer {API_KEY}",
                "Content-Type": "application/json"
            },
            params={"type": "TemperatureSensor"}
        )

        print(f"ツール: {tool_name}")
        print(f"入力: {json.dumps(tool_input, indent=2)}")
        print(f"結果: {result.json()}")
```

## Python + OpenAI API

OpenAI Python SDK と Vela のツール定義を Function Calling 形式に変換して使用:

```python
import openai
import requests
import json

VELA_API = "https://api.vela.geolonia.com"
API_KEY = "YOUR_API_KEY"

# ステップ 1: ツール定義を取得して変換
tools_data = requests.get(f"{VELA_API}/tools.json").json()
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

# ステップ 2: OpenAI クライアントを作成してリクエスト送信
client = openai.OpenAI()
response = client.chat.completions.create(
    model="gpt-4",
    tools=openai_tools,
    messages=[
        {"role": "user", "content": "渋谷駅周辺のセンサーを検索して"}
    ]
)

# ステップ 3: Function Call を処理
for choice in response.choices:
    if choice.message.tool_calls:
        for tool_call in choice.message.tool_calls:
            function_name = tool_call.function.name
            arguments = json.loads(tool_call.function.arguments)

            print(f"関数: {function_name}")
            print(f"引数: {json.dumps(arguments, indent=2)}")
```

## curl + MCP

curl を使って Vela の MCP サーバーと直接やり取り:

### MCP セッション初期化

```bash
curl -X POST https://api.vela.geolonia.com/mcp \
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

### 利用可能なツール一覧取得

```bash
curl -X POST https://api.vela.geolonia.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }'
```

### ツール呼び出し（エンティティ一覧取得）

```bash
curl -X POST https://api.vela.geolonia.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "entities",
      "arguments": {
        "action": "list",
        "type": "TemperatureSensor",
        "limit": 10
      }
    }
  }'
```

### MCP 経由でエンティティ作成

```bash
curl -X POST https://api.vela.geolonia.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "entities",
      "arguments": {
        "action": "create",
        "entity": {
          "id": "urn:ngsi-ld:TemperatureSensor:001",
          "type": "TemperatureSensor",
          "temperature": 25.5,
          "location": {
            "type": "Point",
            "coordinates": [139.6917, 35.6895]
          }
        }
      }
    }
  }'
```

## llms.txt をコンテキストとして取得

あらゆる AI 連携は llms.txt エンドポイントを取得して API を理解することから始められます:

```python
import requests

# LLM 向け最適化ドキュメントを取得
llms_txt = requests.get("https://api.vela.geolonia.com/").text

# LLM のシステムコンテキストとして使用
print(f"API ドキュメント長: {len(llms_txt)} 文字")
```

## 次のステップ

- [概要](/ja/ai-integration/overview) — AI 連携アーキテクチャの概要
- [MCP サーバー](/ja/ai-integration/mcp-server) — MCP 設定の詳細
- [tools.json](/ja/ai-integration/tools-json) — ツール定義スキーマリファレンス
