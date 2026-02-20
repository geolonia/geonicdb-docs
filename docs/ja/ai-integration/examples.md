---
title: "AI 連携サンプル"
description: "AI 連携コード例"
outline: deep
---
# AI インテグレーション

GeonicDB は、AI エージェント（Claude、GPT-4、Gemini 等）がAPIを簡単に利用できるように、複数のAI向けインターフェースを提供しています。

## エンドポイント一覧

| エンドポイント | 形式 | 説明 |
|---------------|------|------|
| `GET /llms.txt` | Markdown (llms.txt) | LLM 向け API ドキュメント |
| `GET /tools.json` | JSON | Claude Tool Use / OpenAI Function Calling 互換スキーマ |
| `GET /.well-known/ai-plugin.json` | JSON | AI プラグインマニフェスト |
| `GET /openapi.json` | JSON | OpenAPI 3.0 仕様 |
| `GET /api.json` | JSON | API リファレンス |

## Tool Use スキーマ (`/tools.json`)

Claude Tool Use および OpenAI Function Calling と互換性のあるツール定義を提供します。

### 提供ツール（5 ツール）

各ツールは `action` と `resource` パラメータで操作を選択します。

| ツール名 | リソース | アクション | 説明 |
|---------|---------|-----------|------|
| `entities` | entities (default), types, attributes | list, get, create, update, delete, replace, search_by_location, search_by_attribute, get_info, get_all, append, patch_all, patch | IoT エンティティ・タイプ・属性管理 |
| `batch` | - | create, upsert, update, merge, delete, query, purge | エンティティ一括操作（最大 1,000 件） |
| `temporal` | - | get, query, create, delete, add_attributes, delete_attribute, merge, modify_instance, delete_instance, batch_create, batch_upsert, batch_delete, batch_query | 時系列データ管理 |
| `config` | rules, jsonld_contexts, data_models, cadde_config | list, get, create, update, delete, activate, deactivate, list_domains, list_models, get_model, generate_template | ReactiveCore Rules・JSON-LD コンテキスト・Smart Data Models・カスタムデータモデル管理・テンプレート生成・CADDE 設定管理（super_admin、get/update/delete） |
| `admin` | users, tenants, policies | list, get, create, update, delete, activate, deactivate, change_password | ユーザー・テナント・ポリシー管理（認証必須） |

### NGSI-LD 属性型の自動検出

MCP ツールは属性値から自動的に NGSI-LD 型を推論します：

| 値のパターン | 検出される型 | 例 |
|------------|-----------|-----|
| `urn:` で始まる文字列 | `Relationship` | `"urn:ngsi-ld:Building:001"` |
| GeoJSON オブジェクト (Point, Polygon, LineString, MultiPoint, MultiPolygon, MultiLineString) | `GeoProperty` | `{"type": "Point", "coordinates": [139.7, 35.6]}` |
| `languageMap` フィールドを含むオブジェクト | `LanguageProperty` | `{"languageMap": {"en": "Hello", "ja": "こんにちは"}}` |
| その他すべての値 | `Property` | `25.5`, `"text"`, `true`, `[1, 2, 3]` |

明示的に型を指定することも可能です：
- `{"type": "Property", "value": 25.5}`
- `{"type": "Relationship", "object": "urn:ngsi-ld:Building:001"}`
- `{"type": "GeoProperty", "value": {"type": "Point", "coordinates": [139.7, 35.6]}}`

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

API のディスカバリ情報を提供します。

```json
{
  "schema_version": "v1",
  "name_for_human": "GeonicDB",
  "name_for_model": "vela",
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

# ツールスキーマを取得
tools = requests.get("https://vela.example.com/tools.json").json()["tools"]

# Claude でツールを使用
client = anthropic.Anthropic()
response = client.messages.create(
    model="claude-sonnet-4-20250514",
    tools=tools,
    messages=[{"role": "user", "content": "温度センサーの一覧を取得して"}]
)
```

### Python + OpenAI API

```python
import openai
import requests

# ツールスキーマを取得し、OpenAI 形式に変換
tools_data = requests.get("https://vela.example.com/tools.json").json()
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
    messages=[{"role": "user", "content": "渋谷駅周辺のセンサーを検索して"}]
)
```

## MCP (Model Context Protocol) サポート

GeonicDB は [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) をサポートしています。MCP 対応 AI クライアント（Claude Desktop 等）から直接コンテキストブローカーに接続できます。

### 概要

- **エンドポイント**: `POST /mcp`
- **トランスポート**: Streamable HTTP (JSON レスポンスモード)
- **プロトコルバージョン**: 2025-03-26
- **動作モード**: ステートレス（Lambda 対応）
- **認証**: `AUTH_ENABLED=true` 時は JWT Bearer トークンによるアクセス制御・テナント分離

### Claude Desktop 設定

#### ローカル開発（認証なし）

```json
{
  "mcpServers": {
    "vela": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://localhost:3000/mcp"
      ]
    }
  }
}
```

#### 本番環境（認証あり）

```json
{
  "mcpServers": {
    "vela": {
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

JWT トークンは `/auth/login` エンドポイントで取得できます。

### テナント指定

各ツールには `tenant` パラメータがあり、操作対象のテナントを指定できます。

- **認証無効時**: 省略すると `default` テナントが使用されます。
- **認証有効時**: 省略するとログインユーザーのテナントがデフォルトになります。`super_admin` は任意のテナントにアクセスできますが、`tenant_admin`/`user` は自テナントのみアクセス可能です。

### サービスパス指定

`entities`、`types`、`attributes`、`batch`、`temporal` ツールには `servicePath` パラメータがあり、階層的なスコープでエンティティを管理できます。

#### 基本形式

- **形式**: `/` で始まるパス（例: `/hello`、`/city/sensors`）
- **デフォルト**: 省略すると全パスを検索します（`/#` 相当）
- **用途**: 同一テナント内でエンティティをグループ化・分離する場合に使用

```yaml
# /hello パスのエンティティを取得
entities ツール:
  action: "list"
  tenant: "my-tenant"
  servicePath: "/hello"
```

#### 階層検索（/#）

`/#` サフィックスを使用すると、指定パスとその子パスすべてを検索できます。

```yaml
# /Madrid/Gardens とその子パス（/Madrid/Gardens/ParqueNorte 等）を検索
entities ツール:
  action: "list"
  tenant: "my-tenant"
  servicePath: "/Madrid/Gardens/#"
```

#### 複数パス指定（カンマ区切り）

カンマで区切って複数のパスを同時に検索できます（最大10パス）。

```yaml
# /park1 と /park2 の両方を検索
entities ツール:
  action: "list"
  tenant: "my-tenant"
  servicePath: "/park1, /park2"
```

**注意**: 書き込み操作（create, update, delete）では単一の非階層パスのみ使用できます。

### 動作確認

```bash
# ローカルサーバー起動
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

- **ステートレスモード**: Lambda 環境の制約により、SSE ストリーミングは使用できません。すべてのリクエストは JSON レスポンスで返されます。
- **セッション管理なし**: 各リクエストは独立して処理されます。`GET /mcp`（SSE）および `DELETE /mcp`（セッション終了）は 405 を返します。
- **認証**: `AUTH_ENABLED=true` 時は Bearer トークンが必要です。`AUTH_ENABLED=false` 時は認証なしで動作します。
- **OAuth スコープ**: OAuth トークン使用時、各 MCP ツール操作に対応する OAuth スコープが必要です（例: エンティティ読取は `read:entities`、書込は `write:entities`）。JWT RBAC トークンにはスコープ制限は適用されません。
- **レート制限**: MCP エンドポイントは REST API と同一のレート制限・ストレージクォータ・リクエストボディサイズ制限が適用されます。

## JSON Schema とカスタムデータモデル

カスタムデータモデルは作成時に JSON Schema (Draft 2020-12) が自動生成されます。この JSON Schema は AI ツールから以下の用途で活用できます。

### AI ツールでの活用例

**エンティティ作成時のスキーマ参照**: AI エージェントは `config` ツールの `data_models` リソースでカスタムデータモデルを取得し、`jsonSchema` フィールドを参照することで、正しい型・バリデーションルールに従ったエンティティを生成できます。

```yaml
# 1. カスタムデータモデルの JSON Schema を取得
config ツール:
  action: "get"
  resource: "data_models"
  type: "TemperatureSensor"

# 2. JSON Schema に基づいてエンティティを作成
entities ツール:
  action: "create"
  entity:
    id: "urn:ngsi-ld:TemperatureSensor:001"
    type: "TemperatureSensor"
    temperature: 23.5  # minimum: -50, maximum: 100 の範囲内
    unit: "Celsius"    # enum: ["Celsius", "Fahrenheit", "Kelvin"]
```

**バリデーションエラーの自動修正**: エンティティ作成時にバリデーションエラーが返された場合、AI エージェントは JSON Schema を参照してエラーの原因を特定し、正しい値に修正できます。

### エンティティテンプレート生成

`config` ツールの `generate_template` アクションを使用すると、カスタムデータモデルから NGSI-LD 形式のエンティティテンプレートを自動生成できます。

```yaml
# テンプレートを生成
config ツール:
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
1. `defaultValue` が定義されている場合はその値
2. `example` が定義されている場合はその値
3. `valueType` に基づくデフォルト値（string → `""`, number → `0`, boolean → `false` 等）

AI エージェントはこのテンプレートをベースに、ユーザーの指示に応じて値を変更してエンティティを作成できます。

### OpenAPI 仕様への動的統合

`/openapi.json` エンドポイントは、認証済みユーザーのテナントに紐づくカスタムデータモデルの JSON Schema を `components/schemas` に動的に追加します。これにより、OpenAPI 仕様を参照する AI ツールやコード生成ツールが、テナント固有のデータモデルを自動的に認識できます。

```bash
# 認証付きで OpenAPI 仕様を取得（カスタムスキーマ含む）
curl https://api.example.com/openapi.json \
  -H "Authorization: Bearer <accessToken>"
```

レスポンスの `components.schemas` にカスタムデータモデルの JSON Schema が追加されます:

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

NGSI-LD API でエンティティを取得する際、カスタムデータモデルに `contextUrl` が設定されていると、レスポンスの `@context` にカスタムコンテキストが自動的に含まれます。Smart Data Models のコンテキストと同様に、AI エージェントはこの `@context` を利用してエンティティの意味的な情報を解釈できます。

## 参考資料

- [Claude Tool Use](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [llms.txt](https://llmstxt.org/)
