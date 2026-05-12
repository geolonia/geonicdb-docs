---
title: "tools.json"
description: "AI tool definitions (tools.json)"
outline: deep
---
# AI インテグレーション

GeonicDB は、AI エージェント (Claude、GPT-4、Gemini など) が API を簡単に利用できるように、複数の AI 向けインターフェースを提供しています。

## エンドポイント一覧

| エンドポイント | フォーマット | 説明 |
|---------------|------|------|
| `GET /llms.txt` | Markdown (llms.txt) | LLM 向け API ドキュメント |
| `GET /tools.json` | JSON | Claude Tool Use / OpenAI Function Calling 互換スキーマ |
| `GET /.well-known/ai-plugin.json` | JSON | AI プラグインマニフェスト |
| `GET /openapi.json` | JSON | OpenAPI 3.0 仕様 |
| `GET /api.json` | JSON | API リファレンス |

## Tool Use スキーマ (`/tools.json`
)

Claude Tool Use および OpenAI Function Calling と互換性のあるツール定義を提供します。

### 利用可能なツール (5 つのツール)

各ツールは `action` および `resource` パラメータで操作を選択します。

| ツール名 | リソース | アクション | 説明 |
|---------|---------|-----------|------|
| `entities` | entities (デフォルト)、types、attributes | list、get、create、update、delete、replace、search_by_location、search_by_attribute、get_info、get_all、append、patch_all、patch | IoT エンティティ、タイプ、属性の管理 |
| `batch` | - | create、upsert、update、merge、delete、query、purge | 一括エンティティ操作 (最大 1,000 アイテム) |
| `temporal` | - | get、query、create、delete、add_attributes、delete_attribute、merge、modify_instance、delete_instance、batch_create、batch_upsert、batch_delete、batch_query | 時系列データ管理 |
| `config` | rules、jsonld_contexts、data_models、cadde_config | list、get、create、update、delete、activate、deactivate、list_domains、list_models、get_model、generate_template | ReactiveCore ルール、JSON-LD コンテキスト、Smart Data Models、カスタムデータモデル管理、テンプレート生成、および CADDE 設定管理 (super_admin、get/update/delete) |
| `admin` | users、tenants、policies | list、get、create、update、delete、activate、deactivate、change_password | ユーザー、テナント、ポリシー管理 (認証が必要) |

### NGSI-LD 属性タイプの自動検出

MCP ツールは、属性値から NGSI-LD タイプを自動的に推論します:

| 値のパターン | 検出されるタイプ | 例 |
|------------|-----------|-----|
| `urn:` で始まる文字列 | `Relationship` | `"urn:ngsi-ld:Building:001"` |
| GeoJSON オブジェクト (Point、Polygon、LineString、MultiPoint、MultiPolygon、MultiLineString) | `GeoProperty` | `{"type": "Point", "coordinates": [139.7, 35.6]}` |
| `languageMap` フィールドを含むオブジェクト | `LanguageProperty` | `{"languageMap": {"en": "Hello", "ja": "こんにちは"}}` |
| その他すべての値 | `Property` | `25.5`、`"text"`、`true`、`[1, 2, 3]` |

タイプを明示的に指定することもできます:
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

## AI プラグインマニフェスト (`/.well-known/ai-plugin.json`
)

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

GeonicDB は [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) をサポートしています。MCP 互換の AI クライアント (Claude Desktop など) は、コンテキストブローカーに直接接続できます。

### 概要

- **エンドポイント**: `POST /mcp`
- **トランスポート**: Streamable HTTP (JSON レスポンスモード)
- **プロトコルバージョン**: 2025-03-26
- **動作モード**: ステートレス (Lambda 互換)
- **認証**: `AUTH_ENABLED=true` の場合、JWT Bearer トークンによるアクセス制御とテナント分離が適用されます

### Claude Desktop の設定



### ローカル開発 (認証なし)

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

> **注意**: `--transport http-only` が必要です。GeonicDB は Streamable HTTP (POST) のみをサポートしており、SSE は利用できません。`--allow-http` は `http://` URL に必要です (本番環境の `https://` では不要です)。



### 本番環境 (JWT 認証を使用)

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



### 本番環境 (API キー認証を使用)

API キーには有効期限がなく、Claude Desktop などの長期間使用する統合に推奨されます。

**ステップ 1: GeonicDB CLI のインストール**

```bash
npm install -g @geolonia/geonicdb-cli
```

**ステップ 2: ログインと CLI の設定**

```bash
# Set the server URL
geonic config set url https://geonicdb.geolonia.com

# Log in (interactive prompt)
geonic auth login
```

**ステップ 3: API キーの作成**

```bash
geonic me api-keys create \
  --name "claude-desktop" \
  --scopes "read:entities,write:entities,read:subscriptions,write:subscriptions,read:registrations,write:registrations" \
  --origins "*" \
  --service <your-tenant-name> \
  --save
```

> **重要**: API キー (`gdb_` プレフィックスの文字列) は作成時に一度だけ表示されます。安全に保管してください。`--save` フラグは、自動使用のために CLI 設定にキーを保存します。

API キーで利用可能なスコープ:

| スコープ | 説明 |
|---|---|
| `read:entities` | エンティティ、タイプ、属性の読み取り |
| `write:entities` | エンティティの作成、更新、削除 |
| `read:subscriptions` | サブスクリプションの読み取り |
| `write:subscriptions` | サブスクリプションの作成、更新、削除 |
| `read:registrations` | コンテキストソース登録の読み取り |
| `write:registrations` | 登録の作成、更新、削除 |

**ステップ 4: Claude Desktop の設定**

Claude Desktop の設定ファイルを編集します:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
```json
{
  "mcpServers": {
    "geonicdb": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://geonicdb.geolonia.com/mcp",
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

**ステップ 5: Claude Desktop の再起動**

設定を保存した後、Claude Desktop を完全に終了して再起動してください。GeonicDB MCP サーバーが利用可能なツールに表示されるはずです。



### API キーの管理

```bash
# List your API keys
geonic me api-keys list

# Delete an API key
geonic me api-keys delete <key-id>
```

### テナントの指定

各ツールには、操作の対象テナントを指定するための `tenant` パラメータがあります。

- **認証が無効の場合**: 省略すると、`default` テナントが使用されます。
- **認証が有効の場合**: 省略すると、ログイン中のユーザーのテナントがデフォルトとして使用されます。`super_admin` はデータツールを使用できません (403 を返します)。代わりに `tenant_admin` または `user` ロールを使用してください。ただし、`tenant_admin`/`user` は自分のテナントにのみアクセスできます。

### ServicePathの指定

`entities`、`types`、`attributes`、`batch`、`temporal` の各ツールには、階層的なスコープ内でエンティティを管理できる `servicePath` パラメータがあります。



### 基本形式

- **形式**: `/` で始まるパス (例: `/hello`、`/city/sensors`)
- **デフォルト**: 省略した場合、ルートパス `/` が使用されます
- **ユースケース**: 同じテナント内でエンティティをグループ化または分離するために使用されます

```yaml
# Get entities under the /hello path
entities tool:
  action: "list"
  tenant: "my-tenant"
  servicePath: "/hello"
```



### 階層検索 (`/#`
)

`/#` サフィックスを使用すると、指定されたパスとそのすべての子パスを検索します。

```yaml
# Search /Madrid/Gardens and its child paths (e.g., /Madrid/Gardens/ParqueNorte)
entities tool:
  action: "list"
  tenant: "my-tenant"
  servicePath: "/Madrid/Gardens/#"
```



### 複数パスの指定 (カンマ区切り)

カンマで区切ることで、複数のパス (最大 10 パス) を同時に検索できます。

```yaml
# Search both /park1 and /park2
entities tool:
  action: "list"
  tenant: "my-tenant"
  servicePath: "/park1, /park2"
```

**注意**: 書き込み操作 (作成、更新、削除) は、単一の非階層パスのみをサポートします。

### NGSI-LD クエリパラメータ

`entities` ツールは、NGSI-LD クエリパラメータの完全なセットをサポートしています:

| パラメータ | 説明 | 例 |
|---|---|---|
| `idList` | 一括取得用のカンマ区切りエンティティ ID | `"urn:ngsi-ld:Room:001,urn:ngsi-ld:Room:002"` |
| `idPattern` | エンティティ ID にマッチする正規表現パターン | `"Room.*"` |
| `orderBy` | 属性またはシステムフィールドでソート。降順の場合は `!` を接頭辞として付ける | `"createdAt"`、`"!modifiedAt"` |
| `orderDirection` | ソート方向 (`!` 接頭辞の代替) | `"asc"`、`"desc"` |
| `sysAttrs` | システム属性 (`createdAt`、`modifiedAt`) を結果に含める | `true` |
| `pick` | 含める属性名のカンマ区切りリスト | `"temperature,humidity"` |
| `omit` | 除外する属性名のカンマ区切りリスト | `"status"` |
| `scopeQ` | スコープクエリ式 | `"/Madrid/Gardens"` |
| `lang` | LanguageProperty 値の言語フィルタ | `"ja"` |
| `geoproperty` | ジオクエリ用の GeoProperty 属性名 (デフォルト: `location`) | `"observationArea"` |
| `spatialId` | ZFXY 形式の空間 ID | `"18/232814/103224"` |
| `spatialIdDepth` | 空間 ID 階層検索の深さ | `2` |

```yaml
# List entities sorted by creation time (newest first) with system attributes
entities tool:
  action: "list"
  type: "Sensor"
  orderBy: "!createdAt"
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

`batch` ツールの `query` アクションも `orderBy`、`orderDirection`、`sysAttrs` をサポートしています。

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
- **セッション管理なし**: 各リクエストは独立して処理されます。`GET /mcp` (SSE) と `DELETE /mcp` (セッション終了) は 405 を返します。
- **認証**: `AUTH_ENABLED=true` の場合、Bearer トークンが必要です。`AUTH_ENABLED=false` の場合、認証なしで動作します。
- **OAuth スコープ**: OAuth トークンを使用する場合、各 MCP ツール操作に対応する OAuth スコープが必要です (例: エンティティの読み取りには `read:entities`、書き込みには `write:entities`)。スコープ制限は JWT RBAC トークンには適用されません。
- **レート制限**: MCP エンドポイントは、REST API と同じレート制限、ストレージクォータ、リクエストボディサイズ制限の対象となります。

## JSON Schema とカスタムデータモデル

カスタムデータモデルは作成時に自動的に JSON Schema (Draft 2020-12) が生成されます。この JSON Schema は AI ツールで以下の目的に利用できます。

**`additionalProperties` フィールド**: エンティティが `propertyDetails` で定義されていない属性を持つことができるかを制御します。デフォルトは `true` (NGSI-LD のセマンティクスに従い、追加属性を許可) です。`false` に設定すると厳密な検証が適用され、定義された属性のみが受け入れられます。AI エージェントはエンティティ作成時にこのフィールドを確認して、追加属性が許可されているかを判断する必要があります。

### AI ツールでの使用例

**エンティティ作成時のスキーマ参照**: AI エージェントは `config` ツールの `data_models` リソースを使用してカスタムデータモデルを取得し、`jsonSchema` フィールドを参照することで、正しい型と検証ルールに準拠したエンティティを生成できます。

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

`config` ツールの `generate_template` アクションを使用することで、カスタムデータモデルから NGSI-LD エンティティテンプレートを自動生成できます。

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
1. `defaultValue` が定義されている場合はその値
2. `example` の値が定義されている場合はその値
3. `valueType` に基づくデフォルト値 (string → `""`、number → `0`、boolean → `false` など)

AI エージェントはこのテンプレートをベースとして、ユーザーの指示に従って値を変更し、エンティティを作成できます。

### OpenAPI 仕様との動的統合

`/openapi.json` エンドポイントは、認証されたユーザーのテナントに関連付けられたカスタムデータモデルの JSON Schema を `components/schemas` に動的に追加します。これにより、OpenAPI 仕様を参照する AI ツールやコード生成ツールは、テナント固有のデータモデルを自動的に認識できるようになります。

```bash
# Retrieve the OpenAPI specification with authentication (includes custom schemas)
curl https://api.example.com/openapi.json \
  -H "Authorization: Bearer <accessToken>"
```

カスタムデータモデルの JSON Schema は、レスポンスの `components.schemas` に追加されます:

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

### 語彙マッピングのための Property @context

`propertyDetails` の各プロパティには、HTTP(S) URL を持つオプションの `@context` フィールドを含めることができます。属性を定義する際は、[schema.org](https://schema.org/docs/full.html) で一致する語彙を確認し、それを `@context` の値として設定してください。

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

生成される JSON-LD `@context` は以下のようになります:

```json
{
  "@context": {
    "SurveyResponse": "https://geonicdb.geolonia.com/vocab/{tenantId}/SurveyResponse",
    "email": "https://schema.org/email",
    "name": "https://geonicdb.geolonia.com/vocab/{tenantId}/name"
  }
}
```

プロパティ URI はエンティティタイプに依存しません — 同じプロパティ名 (例: `email`) は、同じテナント内の異なるエンティティタイプ間で同じ URI を共有します。

### @context 解決の拡張

NGSI-LD API を介してエンティティを取得する際、カスタムデータモデルに `contextUrl` が設定されている場合、カスタムコンテキストがレスポンスの `@context` に自動的に含まれます。Smart Data Models のコンテキストと同様に、AI エージェントはこの `@context` を使用してエンティティのセマンティック情報を解釈できます。

## AI コーディングアシスタントを使用した JavaScript SDK

GeonicDB JavaScript SDK (`@geolonia/geonicdb-sdk`) は AI 支援開発向けに設計されています。npm パッケージには完全な TypeScript 型宣言が含まれているため、AI コーディングアシスタント (Claude Code、Cursor、GitHub Copilot など) は追加設定なしで完全なパブリック API を自動的に認識できます。

### AI ツールが SDK から学習する内容

| 情報 | ソース |
|------------|--------|
| コンストラクタオプション | `GeonicDBOptions` 型 |
| メソッドシグネチャ (17 メソッド) | TypeScript 宣言 |
| 認証情報の型 | `CredentialsOptions`、`RefreshedCredentials` 型 |
| クエリパラメータ | `GetEntitiesParams` 型 |
| サブスクリプションオプション | `SubscribeOptions` 型 |
| イベントペイロード | `EntityEvent`、`ReconnectingEvent` 型 |
| 全 10 種類のイベントタイプ | 型宣言内に文書化 |

### 動作の仕組み

1. 開発者が SDK をインストール: `npm install @geolonia/geonicdb-sdk`2. 開発者が SDK をインポート: `import GeonicDB from '@geolonia/geonicdb-sdk'`3. AI がパッケージから TypeScript 宣言を読み取り
4. AI が文書化された API を使用して正しいコードを生成

別途ドキュメント URL や特別な設定は不要です。TypeScript プロジェクトでは、すぐに完全な型チェックと IDE のオートコンプリートが利用できます。詳細は SDK ドキュメントを参照してください。

## A2A (Agent-to-Agent プロトコル) サポート

GeonicDB は [A2A (Agent-to-Agent) プロトコル](https://google.github.io/A2A/)をサポートしており、他の AI エージェントが標準化されたエージェント間通信を通じてコンテキストブローカーと対話できるようにします。

### エンドポイント

| エンドポイント | メソッド | 説明 |
|----------|--------|-------------|
| `/.well-known/agent-card.json` | GET | エージェントカード — 機能、スキル、認証方法を記述 |
| `/a2a` | POST | A2A 操作用の JSON-RPC 2.0 エンドポイント |

### サポートされているメソッド (フェーズ 1)

| JSON-RPC メソッド | 説明 |
|-----------------|-------------|
| `message/send` | メッセージを送信し、同期レスポンスを受信 |
| `tasks/get` | タスクの現在の状態を取得 |
| `tasks/list` | フィルタリングとページネーションによるタスク一覧取得 |
| `tasks/cancel` | タスクのキャンセルをリクエスト |

### スキル

A2A は MCP で利用可能な同じ 5 つのツールにマッピングされます:

| スキル ID | 説明 |
|----------|-------------|
| `entities` | NGSI-LD エンティティの CRUD、地理空間/属性検索 |
| `batch` | 一括作成、アップサート、更新、削除操作 |
| `temporal` | 時系列データ管理 |
| `config` | リアクティブルール、JSON-LD コンテキスト、データモデル |
| `admin` | ユーザー、テナント、ポリシー管理 |

### 認証

A2A は REST API と同じ認証方法を使用します:
- **Bearer JWT**: `Authorization: Bearer <token>` ヘッダー
- **API キー**: `X-Api-Key: <key>` ヘッダー
- **OAuth 2.0**: `POST /oauth/token` を介したクライアントクレデンシャルフロー
- **DPoP**: `Authorization: DPoP <token>` + `DPoP` プルーフヘッダー (有効時)

`Fiware-Service` ヘッダーによるテナント指定を推奨します(未指定時はデフォルトテナントにフォールバック)。

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

A2A と MCP は補完的な関係にあります:
- **MCP** はツール呼び出し用 — AI エージェントが GeonicDB をツールとして使用
- **A2A** はエージェント間通信用 — AI エージェントが GeonicDB とピアエージェントとして協調

両者は同じ基盤サービス層を共有し、同じ 5 つのスキル/ツールカテゴリをサポートします。

## 参考資料

- [Claude Tool Use](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [A2A Protocol](https://google.github.io/A2A/)
- [llms.txt](https://llmstxt.org/)