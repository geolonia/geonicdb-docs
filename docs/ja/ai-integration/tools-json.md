---
title: "tools.json"
description: "AI tool definitions (tools.json)"
outline: deep
---
# AI 統合

GeonicDB は複数の AI 指向インターフェースを提供しており、AI エージェント(Claude、GPT-4、Gemini など)が API を簡単に利用できるようになっています。

## エンドポイント一覧

| Endpoint                          | Format              | Description                                                 |
| --------------------------------- | ------------------- | ----------------------------------------------------------- |
| `GET /llms.txt`                   | Markdown (llms.txt) | API documentation for LLMs                                  |
| `GET /tools.json`                 | JSON                | Claude Tool Use / OpenAI Function Calling compatible schema |
| `GET /.well-known/ai-plugin.json` | JSON                | AI plugin manifest                                          |
| `GET /openapi.json`               | JSON                | OpenAPI 3.0 specification                                   |
| `GET /api.json`                   | JSON                | API reference                                               |

## Tool Use スキーマ (`/tools.json`

)

Claude Tool Use および OpenAI Function Calling と互換性のあるツール定義を提供します。

### 利用可能なツール (5 つのツール)

各ツールは `action` および `resource` パラメータを介して操作を選択します。

| Tool Name  | Resource                                             | Action                                                                                                                                                               | Description                                                                                                                                                                     |
| ---------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entities` | entities (default), types, attributes                | list, get, create, update, delete, replace, search\_by\_location, search\_by\_attribute, get\_info, get\_all, append, patch\_all, patch                              | IoT entity, type, and attribute management                                                                                                                                      |
| `batch`    | -                                                    | create, upsert, update, merge, delete, query, purge                                                                                                                  | Bulk entity operations (up to 1,000 items)                                                                                                                                      |
| `temporal` | -                                                    | get, query, create, delete, add\_attributes, delete\_attribute, merge, modify\_instance, delete\_instance, batch\_create, batch\_upsert, batch\_delete, batch\_query | Time-series data management                                                                                                                                                     |
| `config`   | rules, jsonld\_contexts, data\_models, cadde\_config | list, get, create, update, delete, activate, deactivate, list\_domains, list\_models, get\_model, generate\_template                                                 | ReactiveCore Rules, JSON-LD context, Smart Data Models, custom data model management, template generation, and CADDE configuration management (super\_admin, get/update/delete) |
| `admin`    | users, tenants, policies                             | list, get, create, update, delete, activate, deactivate, change\_password                                                                                            | User, tenant, and policy management (authentication required)                                                                                                                   |

### 時系列表現パラメータ (#2032 / #2033)

`temporal` ツールは HTTP Temporal API と同じ表現パラメータを受け入れ、そのレスポンスは HTTP (#2033) と**同じ表現レイヤー**を経由します:

| Parameter            | Description                                                                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format`             | `temporalValues` (simplified temporal representation, ETSI clause 4.5.9) or `aggregatedValues` (clause 4.5.19; requires `aggrMethods`). Takes precedence over `options` (clause 6.3.12). Not supported for `batch_query`. |
| `options`            | Comma-separated: `temporalValues` / `simplified` / `aggregatedValues` / `sysAttrs`. Unknown tokens are rejected.                                                                                                          |
| `aggrMethods`        | `totalCount`, `distinctCount`, `sum`, `avg`, `min`, `max`, `stddev`, `sumsq` (comma-separated). Requires `aggrPeriodDuration`.                                                                                            |
| `aggrPeriodDuration` | ISO 8601 duration for the aggregation period (e.g. `PT1H`).                                                                                                                                                               |

MCP/A2A を共有表現レイヤー経由でルーティングすることの影響(**以前の生の出力に依存していたクライアントには破壊的変更**):


* システム時系列属性 (`createdAt` / `modifiedAt` / `expiresAt`) は、`options=sysAttrs` が要求された場合**のみ**返されます (条項 6.3.11)。以前は無条件に返されていました。
  
* 内部的な `attrNameForm` マーカーは出力されなくなりました — これは API 契約の一部ではありませんでした。
  
* `instanceId` **は**依然として返されます:これは条項 4.5.7 で定義された表現メンバーであり、modify/delete インスタンス操作 (条項 5.6.14) に必要です。
  
* 属性および型名は条項 5.5.7 の圧縮処理を経由します。MCP/A2A はリクエスト `@context` を提供しないため、絶対 IRI として保存された名前は完全修飾 URI としてレンダリングされます (条項 5.5.7 のフォールバック)。これは HTTP がコアのみのリクエスト `@context` に対して行うのと全く同じです。

A2A `temporal` スキルは、その `get` / `query` / `list` アクションに対して同じ形状を返します。

### 自動 NGSI-LD 属性型検出

MCP ツールは属性値から NGSI-LD 型を自動的に推論します:

| Value Pattern                                                                          | Detected Type      | Example                                           |
| -------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------- |
| String starting with `urn:`                                                            | `Relationship`     | `"urn:ngsi-ld:Building:001"`                      |
| GeoJSON object (Point, Polygon, LineString, MultiPoint, MultiPolygon, MultiLineString) | `GeoProperty`      | `{"type": "Point", "coordinates": [139.7, 35.6]}` |
| Object containing a `languageMap` field                                                | `LanguageProperty` | `{"languageMap": {"en": "Hello", "ja": "こんにちは"}}` |
| All other values                                                                       | `Property`         | `25.5`, `"text"`, `true`, `[1, 2, 3]`             |

型を明示的に指定することもできます:

* `{"type": "Property", "value": 25.5}`
  
* `{"type": "Relationship", "object": "urn:ngsi-ld:Building:001"}`
  
* `{"type": "GeoProperty", "value": {"type": "Point", "coordinates": [139.7, 35.6]}}`

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
      "Authorization": "Bearer token (required unless AUTH_ENABLED=false)"
    }
  }
}
```

## AI Plugin Manifest (`/.well-known/ai-plugin.json`

)

API 発見情報を提供します。

```json
{
  "schema_version": "v1",
  "name_for_human": "GeonicDB",
  "name_for_model": "geonicdb",
  "description_for_human": "FIWARE Orion-compatible Context Broker for IoT data",
  "description_for_model": "GeonicDB is a FIWARE Orion-compatible Context Broker...",
  "auth": {
    "type": "service_http",
    "instructions": "Provide a JWT Bearer token in the Authorization header, or an API key in the X-Api-Key header. OAuth 2.0 client credentials flow is also supported via POST /oauth/token.",
    "authorization_type": "bearer"
  },
  "api": { "type": "openapi", "url": "/openapi.json" },
  "tools": { "url": "/tools.json" },
  "mcp": { "url": "/mcp", "transport": "streamable-http" },
  "a2a": { "url": "/a2a", "agentCard": "/.well-known/agent-card.json" }
}
```

**`auth` に関する注意**: ai-plugin.json の `auth` ブロックは、機械可読形式で単一のスキームのみを表現できます — ここでは Bearer (`authorization_type: "bearer"`) です。X-Api-Key および OAuth 2.0 クライアント資格情報の代替手段は、人間が読める `instructions` テキストでのみ言及されています。サポートされているすべてのスキームの完全な機械可読定義については、`/openapi.json` の `securitySchemes` (`BearerAuth`、`ApiKeyAuth`、`DPoPAuth`、`basicAuth`) を使用してください。これが認証定義の信頼できる情報源です。

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

GeonicDB は [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) をサポートしています。MCP 互換の AI クライアント (Claude Desktop など) は、コンテキストブローカーに直接接続できます。

### 概要


* **エンドポイント**: `POST /mcp`
  
* **トランスポート**: ストリーマブル HTTP (JSON レスポンスモード)
  
* **プロトコルバージョン**: 2025-03-26
  
* **動作モード**: ステートレス (Lambda 互換)
  
* **認証**: 認証が有効化されている場合 (デフォルト)、アクセス制御とテナント分離は JWT Bearer トークンを介して実施されます

### Claude Desktop の設定

#### ローカル開発（認証なし）

```json
{
  "mcpServers": {
    "geonicdb": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://localhost:3000/mcp",
        "--transport",
        "http-only",
        "--allow-http"
      ]
    }
  }
}
```

> **注意**: `--transport http-only` は必須です。GeonicDB は Streamable HTTP (POST) のみをサポートしており、SSE は利用できません。`--allow-http` は `http://` URL に必要です（本番環境の `https://` では不要です）。

#### 本番環境（JWT 認証あり）

```json
{
  "mcpServers": {
    "geonicdb": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://your-api-endpoint.example.com/mcp",
        "--transport",
        "http-only",
        "--header",
        "Authorization: Bearer <your-jwt-token>"
      ]
    }
  }
}
```

JWT トークンは `/auth/login` エンドポイントから取得できます。JWT トークンには有効期限があり、定期的な更新が必要です。

#### 本番環境（API キー認証あり）

API キーは有効期限がなく、Claude Desktop のような長期間使用される統合に推奨されます。

**ステップ 1: GeonicDB CLI のインストール**

```bash
npm install -g @geolonia/geonicdb-cli
```

**ステップ 2: ログインと CLI の設定**

```bash
# Set the server URL
geonic config set url https://geonicdb.example.com

# Log in (interactive prompt)
geonic auth login
```

**ステップ 3: API キーの作成**

```bash
geonic me api-keys create \
  --name "claude-desktop" \
  --origins "*" \
  --save
```

> **重要**: API キー（`gdb_` で始まる文字列）は作成時に一度だけ表示されます。安全に保管してください。`--save` フラグを使用すると、CLI の設定にキーが保存され、自動的に使用されるようになります。

API キーは XACML 認可モデルの下でデフォルトですべて拒否されます。次の 2 つの方法のいずれかでアクセスを許可してください：


* `--policy <policyId>` で作成時にポリシーをバインドする（`geonic me policies create` で作成した個人ポリシー）
  
* テナント管理者に `role=api_key` をターゲットとするテナントポリシーを作成してもらう

いずれも設定しない場合、MCP ツールの呼び出しは拒否されます。

**ステップ 4: Claude Desktop の設定**

Claude Desktop の設定ファイルを編集します：


* **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
  
* **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "geonicdb": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://geonicdb.example.com/mcp",
        "--header",
        "X-Api-Key:${GEONIC_API_KEY}",
        "--header",
        "NGSILD-Tenant:${GEONIC_SERVICE}",
        "--transport",
        "http-only"
      ],
      "env": {
        "GEONIC_API_KEY": "gdb_your_api_key_here",
        "GEONIC_SERVICE": "your-tenant-name"
      }
    }
  }
}
```

> **注意**: `env` の値を実際の API キーとテナント名に置き換えてください。環境変数を使用することで、認証情報を `args` 配列の外に保持できます。

**ステップ 5: Claude Desktop を再起動**

設定を保存した後、Claude Desktop を完全に終了して再起動してください。GeonicDB MCP サーバーが利用可能なツールに表示されるはずです。

#### Claude Code

Claude Code は Streamable HTTP をネイティブでサポートしているため、`mcp-remote` プロキシは不要です:

```bash
# Production (with API key)
claude mcp add --transport http geonicdb https://geonicdb.example.com/mcp \
  --header "X-Api-Key: gdb_your_api_key" \
  --header "NGSILD-Tenant: your-tenant-name"

# Local development (no auth)
claude mcp add --transport http geonicdb-local http://localhost:3000/mcp
```

#### その他の MCP クライアント (Cursor、VS Code など)

Streamable HTTP 対応の MCP クライアントであれば、直接接続できます:


* URL: `https://geonicdb.example.com/mcp`
  
* Headers: `X-Api-Key: gdb_...` (または `Authorization: Bearer <jwt>`) および `NGSILD-Tenant: <tenant>`

#### API キーの管理

```bash
# List your API keys
geonic me api-keys list

# Delete an API key
geonic me api-keys delete <key-id>
```

### テナントの指定

各ツールには、操作の対象テナントを指定するための `tenant` パラメータがあります。


* **認証が無効の場合**: 省略すると、`default` テナントが使用されます。
  
* **認証が有効の場合**: 省略すると、ログインしているユーザーのテナントがデフォルトとして使用されます。`super_admin` はデータツールを使用できません (403 を返します)。代わりに `tenant_admin` または `user` ロールを使用してください。ただし、`tenant_admin`/`user` は自分のテナントにのみアクセスできます。

### ServicePathの指定

**データツールは `servicePath` をサポートしていません (#1608)**。NGSI-LD には `Fiware-ServicePath` の概念がなく、MCP データツール (`entities`、`batch`、`temporal`、および `types`/`attributes` リソースを含む) は NGSI-LD API 上で動作するため、すべてのデータはルートパス `/` の下に保存されます (HTTP NGSI-LD API と一致)。これらのツールの `servicePath` パラメータは非推奨です: ルート以外の値はエラーで拒否されます。

エンティティを階層的にグループ化または分離するには、代わりにエンティティの `scope` 属性を使用してください。検索には、`entities` ツールが `scopeQ` クエリパラメータを受け付けます (`batch` および `temporal` ツールには `scopeQ` 引数はありません):

```yaml
# Search entities under the /Madrid/Gardens scope and its children
entities tool:
  action: "list"
  tenant: "my-tenant"
  scopeQ: "/Madrid/Gardens/#"
```

**例外 — `config` ツールのルール操作**: ReactiveCore Rules は `servicePath` をファーストクラスフィールドとして使用するため、`config` ツールはルールの `list` (オプションのフィルターとして) および `create` 操作でこれを受け付けます (他のルール操作では無視されます)。値はトリミングされ、空文字列はデフォルトで `/` になり、結果は `/^\/[\w/]*$/` に一致する単一の正確なパス (例: `/sensors`) である必要があります — 階層的な `/#` およびカンマ区切りの複数パス値は、ルールが正確な `servicePath` の等価性でマッチするため拒否されます (#1607/#1608)。

### NGSI-LD クエリパラメータ

`entities` ツールは NGSI-LD クエリパラメータの全セットをサポートしています:

| Parameter        | Description                                                                                                                                                                                                                                             | Example                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `idList`         | Comma-separated entity IDs for bulk retrieval                                                                                                                                                                                                           | `"urn:ngsi-ld:Room:001,urn:ngsi-ld:Room:002"`       |
| `idPattern`      | Regex pattern to match entity IDs                                                                                                                                                                                                                       | `"Room.*"`                                          |
| `orderBy`        | Entity Ordering Language (ETSI GS CIM 009 V1.9.1 §4.23): comma-separated terms with optional `;` direction (`asc`, `desc`, `dist-asc`, `dist-desc`), supports dot/bracket paths and composite sort keys. Legacy `!attr` is still accepted (deprecated). | `"temperature;desc"`, `"type;asc,temperature;desc"` |
| `orderDirection` | Legacy notation only (`asc`/`desc`), used when `orderBy` does not include `;` directions                                                                                                                                                                | `"asc"`, `"desc"`                                   |
| `sysAttrs`       | Include system attributes (`createdAt`, `modifiedAt`) in results                                                                                                                                                                                        | `true`                                              |
| `pick`           | Comma-separated attribute names to include                                                                                                                                                                                                              | `"temperature,humidity"`                            |
| `omit`           | Comma-separated attribute names to exclude                                                                                                                                                                                                              | `"status"`                                          |
| `scopeQ`         | Scope query expression                                                                                                                                                                                                                                  | `"/Madrid/Gardens"`                                 |
| `lang`           | Language filter for LanguageProperty values                                                                                                                                                                                                             | `"ja"`                                              |
| `geoproperty`    | GeoProperty attribute name for geo-queries (default: `location`)                                                                                                                                                                                        | `"observationArea"`                                 |
| `spatialId`      | Spatial ID in ZFXY format                                                                                                                                                                                                                               | `"18/232814/103224"`                                |
| `spatialIdDepth` | Depth for spatial ID hierarchical search                                                                                                                                                                                                                | `2`                                                 |

```yaml
# List entities sorted by creation time (newest first) with system attributes
entities tool:
  action: "list"
  type: "Sensor"
  orderBy: "createdAt;desc"
  sysAttrs: true
  limit: 10

# Retrieve specific entities by ID
entities tool:
  action: "list"
  idList: "urn:ngsi-ld:Room:001,urn:ngsi-ld:Room:002"

# Search with attribute projection
entities tool:
  action: "list"
  type: "Room"
  pick: "temperature,humidity"
  q: "temperature>20"
```

`batch` ツールの `query` アクションも `orderBy`、`orderDirection`、および `sysAttrs` をサポートしています。

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


* **ステートレスモード**: Lambda 環境の制約により、SSE ストリーミングは利用できません。すべてのリクエストは JSON レスポンスとして返されます。
  
* **セッション管理なし**: 各リクエストは独立して処理されます。`GET /mcp` (SSE) および `DELETE /mcp` (セッション終了) は 405 を返します。
  
* **認証**: 認証が有効な場合(デフォルト)、Bearer トークンが必要です。明示的に `AUTH_ENABLED=false` を設定すると、認証なしで動作します。
  
* **OAuth スコープ**: OAuth トークンを使用する場合、各 MCP ツール操作に対応する OAuth スコープが必要です(例: エンティティの読み取りには `read:entities`、書き込みには `write:entities`)。スコープ制限は JWT RBAC トークンには適用されません。
  
* **レート制限**: MCP エンドポイントは REST API と同じレート制限、ストレージクォータ、およびリクエストボディサイズ制限の対象となります。

## JSON Schema とカスタムデータモデル

カスタムデータモデルは作成時に自動的に JSON Schema (Draft 2020-12) が生成されます。この JSON Schema は AI ツールで以下の目的に活用できます。

**`additionalProperties` フィールド**: エンティティが `propertyDetails` で定義されていない属性を持つことができるかを制御します。デフォルトは `true` (NGSI-LD セマンティクスに従い、任意の追加属性を許可)です。`false` に設定すると厳密な検証が適用され、定義された属性のみが受け入れられます。AI エージェントはエンティティを作成する際にこのフィールドをチェックして、追加属性が許可されているかどうかを判断する必要があります。

**`uniqueConstraints` フィールド**: 複合ユニーク属性の組み合わせ(例: `[{"name": "no-double-booking", "fields": ["room", "date", "startTime"]}]`)を宣言し、データベースのユニークインデックスを介してサーバー側で強制します。エンティティの作成/更新が制約された組み合わせと重複する場合、API は違反した制約名とともに `409 AlreadyExists` を返します。AI エージェントはエンティティを作成する前にデータモデルの `uniqueConstraints` をチェックし、「violates unique constraint」を含む 409 をデータ競合(異なる値を選択)として扱い、エンティティ ID の衝突としては扱わないようにする必要があります。

### AI ツールを使用したユースケース例

**エンティティ作成時のスキーマ参照**: AI エージェントは `config` ツールの `data_models` リソースを使用してカスタムデータモデルを取得し、`jsonSchema` フィールドを参照して、正しい型と検証ルールに準拠したエンティティを生成できます。

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

**検証エラーの自動修正**: エンティティ作成時に検証エラーが返された場合、AI エージェントは JSON Schema を参照してエラーの原因を特定し、有効な値に修正できます。

### エンティティテンプレート生成

`config` ツールの `generate_template` アクションを使用して、カスタムデータモデルから NGSI-LD エンティティテンプレートを自動生成できます。

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

1. 定義されている場合は `defaultValue`
   
2. 定義されている場合は `example` の値
   
3. `valueType` に基づくデフォルト値 (string → `""`、number → `0`、boolean → `false` など)

AI エージェントはこのテンプレートをベースとして使用し、ユーザーの指示に従って値を変更してエンティティを作成できます。

### OpenAPI 仕様との動的統合

`/openapi.json` エンドポイントは、認証されたユーザーのテナントに関連付けられたカスタムデータモデルの JSON Schema を `components/schemas` に動的に追加します。これにより、OpenAPI 仕様を参照する AI ツールやコード生成ツールが、テナント固有のデータモデルを自動的に認識できるようになります。

```bash
# Retrieve the OpenAPI specification with authentication (includes custom schemas)
curl https://api.example.com/openapi.json \
  -H "Authorization: Bearer <accessToken>"
```

カスタムデータモデルの JSON Schema がレスポンスの `components.schemas` に追加されます:

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

### 語彙マッピングのための @context プロパティ

`propertyDetails` の各プロパティには、HTTP(S) URL を持つオプションの `@context` フィールドを含めることができます。属性を定義する際は、[schema.org](https://schema.org/docs/full.html) で一致する語彙を確認し、それを `@context` 値として設定してください。

```yaml
# Create a model with schema.org vocabulary
config tool:
  resource: "data_models"
  action: "create"
  type: "SurveyResponse"
  domain: "survey"
  description: "Survey response"
  propertyDetails:
    email:
      ngsiType: "Property"
      valueType: "string"
      example: "taro@example.com"
      "@context": "https://schema.org/email"   # schema.org vocabulary
    name:
      ngsiType: "Property"
      valueType: "string"
      example: "田中太郎"
      # No @context → auto-generated URL
```

生成される JSON-LD `@context` は次のようになります:

```json
{
  "@context": {
    "SurveyResponse": "https://api.example.com/vocab/{tenantId}/SurveyResponse",
    "email": "https://schema.org/email",
    "name": "https://api.example.com/vocab/{tenantId}/name"
  }
}
```

自動生成される語彙 IRI は **このContext Broker自身のベース URL** (#1984) 上に存在し、`GET /vocab/{tenantId}/{term}` 経由で参照可能です。ベース URL は `API_BASE_URL` 環境変数から取得され、これは SAM テンプレートパラメータ **`ApiBaseUrl`** (`infrastructure/template.yaml`) からデプロイ時に注入されます。未設定の場合はリクエストの `Host` ヘッダーにフォールバックします。IRI をホスト名間で安定させるために `ApiBaseUrl` を設定してください。詳細は [API.md → Broker base URL resolution](../api-reference/endpoints.md#broker-base-url-resolution) を参照してください。

プロパティ URI はエンティティタイプに依存しません — 同じプロパティ名(例: `email`)は、同じテナント内の異なるエンティティタイプ間で同じ URI を共有します。

### @context の解決 (#1733)

NGSI-LD レスポンスをレンダリングする際に使用される `@context` は、リクエストが提供したもの **のみ** です。何も提供されない場合は NGSI-LD コアの `@context` のみが使用され、それが圧縮できない用語は完全修飾 URI としてレンダリングされます(ETSI GS CIM 009 clause 5.5.5 / 5.5.7)。

カスタムデータモデルの `contextUrl` は自動的には注入されません。モデルの語彙を必要とする AI エージェントは、データモデルから `contextUrl` を読み取り、JSON-LD `Link` ヘッダー経由で読み取り時に渡す必要があります — コンテキストなしで返される完全修飾 URI は、それ自体が明確なセマンティック識別子です。

## AI コーディングアシスタント向けの JavaScript SDK

GeonicDB JavaScript SDK (`@geolonia/geonicdb-sdk`) は AI 支援開発向けに設計されています。npm パッケージには完全な TypeScript 型宣言が含まれているため、AI コーディングアシスタント(Claude Code、Cursor、GitHub Copilot など)は追加の設定なしで完全なパブリック API を自動的に検出できます。

### AI ツールが SDK から学習する内容

| Information                    | Source                                             |
| ------------------------------ | -------------------------------------------------- |
| Constructor options            | `GeonicDBOptions` type                             |
| Method signatures (17 methods) | TypeScript declarations                            |
| Credential types               | `CredentialsOptions`, `RefreshedCredentials` types |
| Query parameters               | `GetEntitiesParams` type                           |
| Subscription options           | `SubscribeOptions` type                            |
| Event payloads                 | `EntityEvent`, `ReconnectingEvent` types           |
| All 10 event types             | Documented in type declarations                    |

### 仕組み


1. 開発者が SDK をインストール: `npm install @geolonia/geonicdb-sdk`
   
2. 開発者が SDK をインポート: `import GeonicDB from '@geolonia/geonicdb-sdk'`
   
3. AI がパッケージから TypeScript 宣言を読み取る
   
4. AI がドキュメント化された API を使用して正しいコードを生成

別途のドキュメント URL や特別な設定は不要です。TypeScript プロジェクトでは、すぐに完全な型チェックと IDE オートコンプリートが利用できます。詳細は SDK ドキュメントを参照してください。

## A2A (Agent-to-Agent Protocol) サポート

GeonicDB は [A2A (Agent-to-Agent) protocol](https://google.github.io/A2A/) をサポートしており、標準化されたエージェント間通信を通じて他の AI エージェントがコンテキストブローカーと対話できるようにします。

### エンドポイント

| Endpoint                       | Method | Description                                                     |
| ------------------------------ | ------ | --------------------------------------------------------------- |
| `/.well-known/agent-card.json` | GET    | Agent Card — describes capabilities, skills, and authentication |
| `/a2a`                         | POST   | JSON-RPC 2.0 endpoint for A2A operations                        |

### サポートされているメソッド (Phase 1)

| JSON-RPC Method | Description                                       |
| --------------- | ------------------------------------------------- |
| `message/send`  | Send a message and receive a synchronous response |
| `tasks/get`     | Retrieve current state of a task                  |
| `tasks/list`    | List tasks with filtering and pagination          |
| `tasks/cancel`  | Request task cancellation                         |

### スキル

A2A は MCP 経由で利用可能な同じ 5 つのツールにマッピングされます:

| Skill ID   | Description                                       |
| ---------- | ------------------------------------------------- |
| `entities` | NGSI-LD entity CRUD, geo-spatial/attribute search |
| `batch`    | Bulk create, upsert, update, delete operations    |
| `temporal` | Time-series data management                       |
| `config`   | Reactive rules, JSON-LD contexts, data models     |
| `admin`    | User, tenant, and policy management               |

### 認証

A2A は REST API と同じ認証方式を使用します:

* **Bearer JWT**: `Authorization: Bearer <token>` ヘッダー
  
* **API Key**: `X-Api-Key: <key>` ヘッダー
  
* **OAuth 2.0**: `POST /oauth/token` 経由のクライアントクレデンシャルフロー
  
* **DPoP**: `Authorization: DPoP <token>` + `DPoP` proof ヘッダー (有効時)

`Fiware-Service` ヘッダーによるテナント指定を推奨します(未指定時はデフォルトテナントにフォールバック)。

**認可 (#1651)**: A2A の entities/batch/temporal スキルは、REST / MCP と**同一の entity-level / list-level 認可**を通ります(`checkEntityOwnership` / `requireListReadAuthz` / `requireAuthz` を合成イベントで無改変に呼ぶ実装を共有)。`entityType` / `entityOwner` / `scope` による制約は A2A 経由でも等しく強制され、一覧は読めない行を除外し、by-id 操作は DB の実属性で判定されます。到達には `/a2a` への path-level 許可が必要です — `tenant_admin` は既定ポリシーで許可され(`/mcp` と対称)、`user` / `oauth_client` / `api_key` はテナント管理者がバインドしたポリシーで `/a2a` を明示許可する必要があります(`super_admin` は data tool を使えません)。

**入力検証 (#1944)**: `message.metadata` は dispatch の前に Zod スキーマで検証されます。**構造化フィールド (`entities` / `attributes` / `entityIds`) だけがオブジェクト / 配列を取れ、それ以外のキーはすべてプリミティブ (string / number / boolean / null) のみ**です。`{"type": {"$ne": null}}` のような演算子オブジェクトはクエリ層に届く前に検証エラーとして拒否されます。

allowlist(既知キーの列挙)ではなく**値の形**で制約しているのは、`params.X` の消費点が 40 以上あり列挙漏れ 1 つで穴が空くためです。この設計により、将来ハンドラが新しい `params.X` を読み始めても注入経路は塞がったままになります。検証失敗は JSON-RPC のエラーとして返り、HTTP の 400 と同じ「拒否される」挙動になります。

**管理系スキルのロール要件 (#1651)**: `admin` スキル(users / policies)と `config` スキルの `rules` 操作は `tenant_admin` ロールを要求します(MCP と同じゲート)。`/a2a` を許可された `oauth_client` / `api_key` / `user` は、これらの管理操作ではアクセス拒否になります(entities / batch / temporal のデータ操作は上記の entity-level 認可で判定)。

**管理系スキルのテナントスコープ (#1938)**: ポリシー操作は HTTP の `/admin/policies` と**同一のテナントスコープ・権限昇格チェック**を通ります。対象は、MCP `admin` ツール `resource: policies` の `get` / `update` / `delete` / `activate` / `deactivate` と、A2A `admin` スキル `resource: policies` の `get` です(A2A のポリシー操作は `list` と `get` のみを提供し、それ以外の action は `Unsupported policies action` エラーになります)。`tenant_admin` は自テナントのポリシーのみ対象にでき、他テナントおよびグローバルポリシー(`tenantId: null`)は `super_admin` のみが扱えます。更新時のロール制限(`permit-overrides` は `super_admin` のみ / `priority` はロール別下限以上)は、更新操作を提供する **MCP の `update`** に適用されます。

### 例: メッセージの送信

```bash
curl -X POST https://your-geonicdb.example.com/a2a \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -H "Fiware-Service: mytenant" \
  -d '{
    "jsonrpc": "2.0",
    "method": "message/send",
    "id": 1,
    "params": {
      "message": {
        "role": "user",
        "parts": [{"kind": "text", "text": "List all entities of type Sensor"}],
        "metadata": {
          "skill": "entities",
          "action": "list",
          "type": "Sensor"
        }
      }
    }
  }'
```

### MCP との関係

A2A と MCP は補完的です:

* **MCP** はツール呼び出し用 — AI エージェントが GeonicDB をツールとして使用
  
* **A2A** はエージェント間通信用 — AI エージェントが GeonicDB をピアエージェントとして協力

両方とも同じ基盤となるサービスレイヤーを共有し、同じ 5 つのスキル / ツールカテゴリをサポートします。

## 参考文献


* [Claude Tool Use](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)
  
* [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
  
* [Model Context Protocol](https://modelcontextprotocol.io/)
  
* [A2A Protocol](https://google.github.io/A2A/)
  
* [llms.txt](https://llmstxt.org/)
