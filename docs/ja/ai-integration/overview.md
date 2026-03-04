---
title: "AI 連携 概要"
description: "GeonicDB の AI ネイティブ機能概要"
outline: deep
---
# AI 統合

GeonicDB は、AI エージェント (Claude、GPT-4、Gemini など) が簡単に API を利用できるように、複数の AI 指向インターフェースを提供しています。

## エンドポイント一覧

| エンドポイント | フォーマット | 説明 |
|---------------|------|------|
| `GET /llms.txt` | Markdown (llms.txt) | LLM 向け API ドキュメント |
| `GET /tools.json` | JSON | Claude Tool Use / OpenAI Function Calling 互換スキーマ |
| `GET /.well-known/ai-plugin.json` | JSON | AI プラグインマニフェスト |
| `GET /openapi.json` | JSON | OpenAPI 3.0 仕様 |
| `GET /api.json` | JSON | API リファレンス |

## Tool Use スキーマ (`/tools.json`)

Claude Tool Use および OpenAI Function Calling と互換性のあるツール定義を提供します。

### 利用可能なツール (5 つのツール)

各ツールは `action` および `resource` パラメータを介して操作を選択します。

| ツール名 | リソース | アクション | 説明 |
|---------|---------|-----------|------|
| `entities` | entities (デフォルト)、types、attributes | list、get、create、update、delete、replace、search_by_location、search_by_attribute、get_info、get_all、append、patch_all、patch | IoT エンティティ、タイプ、属性の管理 |
| `batch` | - | create、upsert、update、merge、delete、query、purge | 一括エンティティ操作 (最大 1,000 アイテム) |
| `temporal` | - | get、query、create、delete、add_attributes、delete_attribute、merge、modify_instance、delete_instance、batch_create、batch_upsert、batch_delete、batch_query | 時系列データ管理 |
| `config` | rules、jsonld_contexts、data_models、cadde_config | list、get、create、update、delete、activate、deactivate、list_domains、list_models、get_model、generate_template | ReactiveCore ルール、JSON-LD コンテキスト、Smart Data Models、カスタムデータモデル管理、テンプレート生成、および CADDE 設定管理 (super_admin、get/update/delete) |
| `admin` | users、tenants、policies | list、get、create、update、delete、activate、deactivate、change_password | ユーザー、テナント、ポリシー管理 (認証が必要) |

### 自動 NGSI-LD 属性タイプ検出

MCP ツールは属性値から NGSI-LD タイプを自動的に推論します:

| 値のパターン | 検出されるタイプ | 例 |
|------------|-----------|-----|
| `urn:` で始まる文字列 | `Relationship` | `"urn:ngsi-ld:Building:001"` |
| GeoJSON オブジェクト (Point、Polygon、LineString、MultiPoint、MultiPolygon、MultiLineString) | `GeoProperty` | `{"type": "Point", "coordinates": [139.7, 35.6]}` |
| `languageMap` フィールドを含むオブジェクト | `LanguageProperty` | `{"languageMap": {"en": "Hello", "ja": "こんにちは"}}` |
| その他すべての値 | `Property` | `25.5`、`"text"`、`true`、`[1, 2, 3]` |

タイプを明示的に指定することもできます:
- `{"type": "Property", "value": 25.5}`- `{"type": "Relationship", "object": "urn:ngsi-ld:Building:001"}`- `{"type": "GeoProperty", "value": {"type": "Point", "coordinates": [139.7, 35.6]}}`
### レスポンス構造

```json
{
  "schemaVersion": "1.0.0",
  "apiVersion": "1.0.0",
  "name": "GeonicDB",
  "description": "FIWARE Orion-compatible Context Broker API tools",
  "baseUrl": "https://api.example.com",
  "tools": [
    {
      "name": "entities",
      "description": "Manage IoT entities (sensors, devices, etc.)...",
      "input_schema": {
        "type": "object",
        "properties": { "action": { "type": "string", "enum": ["list", "get", ...] }, ... },
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




























## AI プラグインマニフェスト (`/.well-known/ai-plugin.json`)

API 検出情報を提供します。

```json
{
  "schema_version": "v1",
  "name_for_human": "GeonicDB",
  "name_for_model": "geonicdb",
  "description_for_human": "FIWARE Orion-compatible Context Broker for IoT data",
  "description_for_model": "GeonicDB is a FIWARE Orion-compatible Context Broker...",
  "auth": { "type": "none" },
  "api": { "type": "openapi", "url": "/openapi.json" },
  "tools": { "url": "/tools.json" }
}
```












## 使用例

### Python + Claude API

```python
import anthropic
import requests

# Fetch the tool schema
tools = requests.get("https://geonicdb.example.com/tools.json").json()["tools"]

# Use the tools with Claude
client = anthropic.Anthropic()
response = client.messages.create(
    model="claude-sonnet-4-20250514",
    tools=tools,
    messages=[{"role": "user", "content": "Get a list of temperature sensors"}]
)
```















### Python + OpenAI API

```python
import openai
import requests

# Fetch the tool schema and convert to OpenAI format
tools_data = requests.get("https://geonicdb.example.com/tools.json").json()
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

client = openai.OpenAI()
response = client.chat.completions.create(
    model="gpt-4",
    tools=openai_tools,
    messages=[{"role": "user", "content": "Search for sensors near Shibuya Station"}]
)
```

























## MCP (Model Context Protocol) サポート

GeonicDB は [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) をサポートしています。MCP 互換の AI クライアント (Claude Desktop など) はコンテキストブローカーに直接接続できます。

### 概要

- **エンドポイント**: `POST /mcp`- **トランスポート**: Streamable HTTP (JSON レスポンスモード)
- **プロトコルバージョン**: 2025-03-26
- **動作モード**: ステートレス (Lambda 互換)
- **認証**: `AUTH_ENABLED=true` の場合、JWT Bearer トークンを介してアクセス制御とテナント分離が適用されます

### Claude Desktop 設定

#### ローカル開発 (認証なし)

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













#### 本番環境 (認証あり)

```json
{
  "mcpServers": {
    "geonicdb": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://your-api-endpoint.example.com/mcp",
        "--header",
        "Authorization: Bearer <your-jwt-token>"
      ]
    }
  }
}
```















JWT トークンは `/auth/login` エンドポイントから取得できます。

### テナント指定

各ツールには操作対象のテナントを指定するための `tenant` パラメータがあります。

- **認証が無効な場合**: 省略すると `default` テナントが使用されます。
- **認証が有効な場合**: 省略すると、ログインユーザーのテナントがデフォルトとして使用されます。`super_admin` は任意のテナントにアクセスできますが、`tenant_admin`/`user` は自分のテナントのみにアクセスできます。

### サービスパス指定

`entities`、`types`、`attributes`、`batch`、`temporal` ツールには、階層的なスコープ内でエンティティを管理できる `servicePath` パラメータがあります。

#### 基本フォーマット

- **フォーマット**: `/` で始まるパス (例: `/hello`、`/city/sensors`)
- **デフォルト**: 省略すると、すべてのパスが検索されます (`/#` と同等)
- **用途**: 同じテナント内でエンティティをグループ化または分離するために使用されます

```yaml
# Get entities under the /hello path
entities tool:
  action: "list"
  tenant: "my-tenant"
  servicePath: "/hello"
```







#### 階層検索 (`/#`)

`/#` サフィックスを使用すると、指定されたパスとそのすべての子パスが検索されます。

```yaml
# Search /Madrid/Gardens and its child paths (e.g., /Madrid/Gardens/ParqueNorte)
entities tool:
  action: "list"
  tenant: "my-tenant"
  servicePath: "/Madrid/Gardens/#"
```







#### 複数パス指定 (カンマ区切り)

カンマで区切って複数のパスを同時に検索できます (最大 10 パス)。

```yaml
# Search both /park1 and /park2
entities tool:
  action: "list"
  tenant: "my-tenant"
  servicePath: "/park1, /park2"
```







**注意**: 書き込み操作 (create、update、delete) は単一の非階層パスのみをサポートします。

### 検証

```bash
# Start the local server
npm start

# MCP initialize
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
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



















### 制限事項

- **ステートレスモード**: Lambda 環境の制約により、SSE ストリーミングは利用できません。すべてのリクエストは JSON レスポンスとして返されます。
- **セッション管理なし**: 各リクエストは独立して処理されます。`GET /mcp` (SSE) および `DELETE /mcp` (セッション終了) は 405 を返します。
- **認証**: `AUTH_ENABLED=true` の場合、Bearer トークンが必要です。`AUTH_ENABLED=false` の場合、認証なしで操作が行われます。
- **OAuth スコープ**: OAuth トークンを使用する場合、各 MCP ツール操作に対応する OAuth スコープが必要です (例: エンティティの読み取りには `read:entities`、書き込みには `write:entities`)。JWT RBAC トークンにはスコープ制限は適用されません。
- **レート制限**: MCP エンドポイントは、REST API と同じレート制限、ストレージクォータ、リクエストボディサイズ制限の対象となります。

## JSON スキーマとカスタムデータモデル

カスタムデータモデルは作成時に自動的に JSON スキーマ (Draft 2020-12) が生成されます。この JSON スキーマは、AI ツールによって以下の目的で活用できます。

### AI ツールでの使用例

**エンティティ作成時のスキーマ参照**: AI エージェントは `config` ツールの `data_models` リソースを使用してカスタムデータモデルを取得し、`jsonSchema` フィールドを参照して、正しいタイプと検証ルールに適合するエンティティを生成できます。

```yaml
# 1. Retrieve the JSON Schema for the custom data model
config tool:
  action: "get"
  resource: "data_models"
  type: "TemperatureSensor"

# 2. Create an entity based on the JSON Schema
entities tool:
  action: "create"
  entity:
    id: "urn:ngsi-ld:TemperatureSensor:001"
    type: "TemperatureSensor"
    temperature: 23.5  # within minimum: -50, maximum: 100 range
    unit: "Celsius"    # enum: ["Celsius", "Fahrenheit", "Kelvin"]
```
















**検証エラーの自動修正**: エンティティ作成時に検証エラーが返された場合、AI エージェントは JSON スキーマを参照してエラーの原因を特定し、有効な値に修正できます。

### エンティティテンプレート生成

`generate_template` ツールの `config` アクションを使用すると、カスタムデータモデルから NGSI-LD エンティティテンプレートを自動生成できます。

```yaml
# Generate a template
config tool:
  resource: "data_models"
  action: "generate_template"
  type: "TemperatureSensor"
```







**レスポンス例:**

```json
{
  "id": "urn:ngsi-ld:TemperatureSensor:550e8400-e29b-41d4-a716-446655440000",
  "type": "TemperatureSensor",
  "@context": [
    "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
    "https://example.com/contexts/temperature-sensor.jsonld"
  ],
  "temperature": {
    "type": "Property",
    "value": 20.0
  },
  "unit": {
    "type": "Property",
    "value": "Celsius"
  }
}
```


















テンプレートは以下の優先順位で値を決定します:
1. `defaultValue` が定義されている場合はそれを使用
2. `example` 値が定義されている場合はそれを使用
3. `valueType` に基づくデフォルト値 (string → `""`、number → `0`、boolean → `false` など)

AI エージェントはこのテンプレートをベースとして、ユーザーの指示に従って値を変更し、エンティティを作成できます。

### OpenAPI 仕様との動的統合

`/openapi.json` エンドポイントは、認証されたユーザーのテナントに関連付けられたカスタムデータモデルの JSON スキーマを `components/schemas` に動的に追加します。これにより、OpenAPI 仕様を参照する AI ツールやコード生成ツールが、テナント固有のデータモデルを自動的に認識できるようになります。

```bash
# Retrieve the OpenAPI specification with authentication (includes custom schemas)
curl https://api.example.com/openapi.json \
  -H "Authorization: Bearer <accessToken>"
```





カスタムデータモデルの JSON スキーマはレスポンスの `components.schemas` に追加されます:

```json
{
  "components": {
    "schemas": {
      "Entity": { "..." },
      "TemperatureSensor": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": "TemperatureSensor",
        "type": "object",
        "properties": {
          "temperature": { "type": "number", "minimum": -50, "maximum": 100 }
        }
      }
    }
  }
}
```

















### @context 解決拡張

NGSI-LD API を介してエンティティを取得する際、カスタムデータモデルに `contextUrl` が設定されている場合、カスタムコンテキストがレスポンスの `@context` に自動的に含まれます。Smart Data Models コンテキストと同様に、AI エージェントはこの `@context` を使用してエンティティのセマンティック情報を解釈できます。

## 参考資料

- [Claude Tool Use](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [llms.txt](https://llmstxt.org/)