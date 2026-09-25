---
title: "AI Integration Examples"
description: "AI integration code examples"
outline: deep
---
# AI 統合

GeonicDB は複数の AI 指向インターフェースを提供し、AI エージェント (Claude、GPT-4、Gemini など) が API を簡単に利用できるようにします。

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

| Tool Name  | Resource                                      | Action                                                                                                                                                               | Description                                                                                                                                                                                                                                                                                                          |
| ---------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entities` | entities (default), types, attributes         | list, get, create, update, delete, replace, search\_by\_location, search\_by\_attribute, get\_info, get\_all, append, patch\_all, patch                              | IoT entity, type, and attribute management                                                                                                                                                                                                                                                                           |
| `batch`    | -                                             | create, upsert, update, merge, delete, query, purge                                                                                                                  | Bulk entity operations (up to 1,000 items)                                                                                                                                                                                                                                                                           |
| `temporal` | -                                             | get, query, create, delete, add\_attributes, delete\_attribute, merge, modify\_instance, delete\_instance, batch\_create, batch\_upsert, batch\_delete, batch\_query | Time-series data management                                                                                                                                                                                                                                                                                          |
| `config`   | rules, jsonld\_contexts, custom\_data\_models | list, get, create, update, delete, activate, deactivate, generate\_template                                                                                          | ReactiveCore Rules, JSON-LD context, and custom data model management (including template generation). The Smart Data Models catalog (`data_models`) and CADDE configuration (`cadde_config`) are **not** exposed here — the catalog is A2A-only and CADDE is super\_admin-only via the HTTP Admin API / CLI (#2209) |
| `admin`    | users, policies                               | list, get, create, update, delete, activate, deactivate, unlock, change\_password                                                                                    | User and XACML policy management (authentication required). Tenant administration is **not** exposed here — the MCP tool has no `tenants` resource; use the HTTP Admin API (`/admin/tenants`) (#2229)                                                                                                                |

### Temporal 表現パラメータ (#2032 / #2033)

`temporal` ツールは HTTP Temporal API と同じ表現パラメータを受け入れ、そのレスポンスは HTTP (#2033) と**同じ表現レイヤー**を通過します:

| Parameter            | Description                                                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `format`             | `temporalValues` (simplified temporal representation, ETSI clause 4.5.9) or `aggregatedValues` (clause 4.5.19; requires `aggrMethods`). Takes precedence over `options` (clause 6.3.12).                     |
| `options`            | Comma-separated: `temporalValues` / `simplified` / `aggregatedValues` / `sysAttrs`. Unknown tokens are rejected.                                                                                             |
| `aggrMethods`        | `totalCount`, `distinctCount`, `sum`, `avg`, `min`, `max`, `stddev`, `sumsq` (comma-separated).                                                                                                              |
| `aggrPeriodDuration` | ISO 8601 duration for the aggregation period (e.g. `PT1H`). Optional (ETSI Table 5.2.21-1 cardinality 0..1); when omitted it defaults to `PT0S`, a single period spanning the whole time range of the query. |

### Temporal マルチインスタンス `values[]` 書き込みエンベロープ (#2717)

MCP `temporal` は、ETSI GS CIM 009 clause 4.5.9 の簡略化された temporal 表現 (`{ type, values: [...] }`) を反映したマルチインスタンス短縮形式を受け入れます:

```json
{
  "temperature": {
    "type": "Property",
    "values": [
      { "value": 22.5, "observedAt": "2026-01-01T00:00:00Z" },
      { "value": 23.0, "observedAt": "2026-01-01T01:00:00Z", "datasetId": "urn:ngsi-ld:Dataset:1" }
    ]
  }
}
```


* 親オブジェクトのキー: **`type` (オプション) および `values` (必須) のみ**。その他の親キー (`observedAt`、`datasetId`、`unitCode`、…) は実行可能なメッセージとともに **400** を返します (#2717)。
  
* `observedAt` / `datasetId` は親ではなく、**各インスタンス**に配置してください。
  
* `unitCode` / その他の予約されたメタデータは、MCP temporal 書き込みパス (単一属性またはインスタンス) ではまだ実装されていません。#2722 で追跡されています。

### MCP `temporal` バッチアクションと DB タイムアウト中止 (#2542)

`batch_create` / `batch_upsert` / `batch_delete` は、HTTP temporal バッチエンドポイントとそのサービスを共有し、その **DB タイムアウト中止** (GeonicDB 拡張) を含みます: 要素の処理中にデータベースクエリタイムアウト (`maxTimeMS` 超過、`ServiceUnavailable`) が発生すると、残りの**未試行**要素が中止され、`errors` 配列に次のように返されます:

```json
{
  "success": ["urn:ngsi-ld:Sensor:1"],
  "errors": [
    { "entityId": "urn:ngsi-ld:Sensor:2", "error": "operation exceeded time limit" },
    { "entityId": "urn:ngsi-ld:Sensor:3", "error": "Not attempted: an earlier entity in this batch timed out at the database, so processing stopped before this entity was tried. Retry these entity IDs later." }
  ]
}
```

`Not attempted:` プレフィックスは、未試行要素と実際にタイムアウトした要素 (ドライバー由来のメッセージを持つ) を区別するものです。`success` にリストされたエンティティはコミットされます。**`errors` にリストされた entityId のみを再試行してください**。`batch_create` / `batch_upsert` の場合、temporal 書き込みは追加専用であるため、既に成功したエンティティを再送信すると、その temporal インスタンスが重複します。`batch_delete` の場合、既に削除されたエンティティを再送信すると、単に見つからないと報告されます (データは重複しません)。HTTP API は、ProblemDetails 型のエラー (`type` `https://uri.etsi.org/ngsi-ld/errors/ServiceUnavailable`、同じ `detail` テキスト) を含む `207 Multi-Status` として同じ分割を返します。

### Temporal `modify_instance` と属性タイプ (#2311)

HTTP `PATCH /ngsi-ld/v1/temporal/entities/{entityId}/attrs/{attrName}/{instanceId}` (ETSI GS CIM 009 clause 5.6.14) はボディの `type` を受け付け、属性インスタンスのタイプを置き換えます (`input.type ?? oldDoc.type`)。MCP `temporal` ツールはそのフィールドを `type` ではなく **`attrType`** として公開します:

| Parameter  | Meaning                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `type`     | Entity type **filter** (query / batch\_query). Never written as an attribute type.                                                    |
| `attrType` | Attribute type for `modify_instance` (`Property`, `Relationship`, `GeoProperty`, …). Validated with the same schema as the HTTP body. |

`type: "FuelProbe"` を `modify_instance` に渡しても、属性タイプがエンティティタイプ名に書き換えられては**いけません**。既存の属性タイプを保持するには `attrType` を省略してください(部分更新)。

A2A はこの操作を実装していません。

MCP/A2A を共有表現レイヤー経由でルーティングすることの影響(**以前の生出力に依存していたクライアントには破壊的変更**):


* システム時系列属性 (`createdAt` / `modifiedAt` / `expiresAt`) は `options=sysAttrs` がリクエストされた場合**のみ**返されます (clause 6.3.11)。以前は無条件で返されていました。
  
* 内部の `attrNameForm` マーカーは出力されなくなりました — これは API 契約の一部ではありませんでした。
  
* `instanceId` **は**引き続き返されます: これは clause 4.5.7 で定義された表現メンバーであり、modify/delete instance 操作 (clause 5.6.14) で必要とされます。
  
* 属性名とタイプ名は clause 5.5.7 の圧縮を経ます。MCP/A2A はリクエストの `@context` を提供しないため、絶対 IRI として保存された名前は完全修飾 URI としてレンダリングされます (clause 5.5.7 のフォールバック)。これは HTTP がコアのみのリクエスト `@context` に対して行うのと全く同じです。

A2A `temporal` スキルは `get` / `query` / `list` アクションに対して同じ形式を返します。

**時系列リクエストパラメータはすべてのエントリーポイントで同一に解釈されます (#2099 / #2156)。**
HTTP、MCP `temporal.get` / `query` / `batch_query`、および A2A `temporal.get` / `query` / `list` はすべて `timerel` / `timeAt` / `endTimeAt` / `timeproperty` / `lastN` / `attrs` / `format` / `options` / `aggrMethods` / `aggrPeriodDuration` を同じリゾルバー経由でルーティングするため、どれも黙って無視されることはありません。A2A クライアントに対して特筆すべき 2 つの影響:


* **存在しないエンティティに対する `temporal.get` は大きなエラーになります** (`Entity not found: <id>`)。以前は空の `entities` 配列を持つ `200` でした — 「見つからない」と「読み取れない」は区別できませんでした。
  
* **切り詰めが報告されます。** デフォルトの `lastN` 上限が属性の履歴を切り詰めた場合、HTTP API は `NGSILD-Warning: 199 …` を設定します。MCP と A2A にはヘッダーがないため、同じテキストがレスポンスオブジェクトの `warnings` 配列で返されます。その不在は何も切り詰められなかったことを意味します。

`sysAttrs` は A2A でブール値として引き続き動作し、`options: "sysAttrs"` (ETSI GS CIM 009 clause 6.3.11) も受け付けられます。

### NGSI-LD 属性タイプの自動検出

MCP ツールは属性値から NGSI-LD タイプを自動的に推論します:

| Value Pattern                                                                          | Detected Type      | Example                                           |
| -------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------- |
| String starting with `urn:`                                                            | `Relationship`     | `"urn:ngsi-ld:Building:001"`                      |
| GeoJSON object (Point, Polygon, LineString, MultiPoint, MultiPolygon, MultiLineString) | `GeoProperty`      | `{"type": "Point", "coordinates": [139.7, 35.6]}` |
| Object containing a `languageMap` field                                                | `LanguageProperty` | `{"languageMap": {"en": "Hello", "ja": "こんにちは"}}` |
| All other values                                                                       | `Property`         | `25.5`, `"text"`, `true`, `[1, 2, 3]`             |

タイプを明示的に指定することもできます:

* `{"type": "Property", "value": 25.5}`
  
* `{"type": "Relationship", "object": "urn:ngsi-ld:Building:001"}`
  
* `{"type": "GeoProperty", "value": {"type": "Point", "coordinates": [139.7, 35.6]}}`

### サブ属性と予約メンバー (#2049)

属性は**ユーザー定義のサブ属性**(Property of Property / Relationship of Property、ETSI GS CIM 009 clause 4.5) と**予約メンバー** `observedAt`、`unitCode`、`datasetId`、`valueType` を持つことができます。**MCP / A2A `entities` (およびバッチ) 書き込み**は、HTTP NGSI-LD API と全く同じルールでこれらを永続化します:

```json
{
  "temperature": {
    "type": "Property",
    "value": 25.5,
    "observedAt": "2026-08-11T00:00:00.000Z",
    "unitCode": "CEL",
    "accuracy": { "type": "Property", "value": 0.9 },
    "calibratedBy": { "type": "Relationship", "object": "urn:ngsi-ld:Sensor:1" }
  }
}
```

注意事項:


* **例外 — MCP `temporal` 書き込み (#2722):** `attrMetadata` 経由の `unitCode` / その他の予約メタデータは MCP temporal (単一属性パスまたは `values[]` インスタンス) では**配線されていません**。各**インスタンス**の `datasetId` / `observedAt` は動作します。`values[]` エンベロープの親キーは拒否されます (#2717)。上記の例が `temporal` ツールに適用されると想定しないでください。
  
* `unitCode` と `valueType` は `Property` のみで受け付けられます (entities / HTTP)。他の属性タイプ (`Relationship`、`ListRelationship`、`LanguageProperty`、`VocabProperty`、`JsonProperty`、`GeoProperty`、`ListProperty`、`TemporalProperty`) はそれらを持たず (clause 4.5.2 / 4.5.3.3 / 4.5.18.3 / 4.5.20.3 / 4.5.22.3 / 4.5.24.3)、ドロップされます。
  
* サブ属性名は属性名と同じルールに従います: 短い名前 (`^[A-Za-z0-9_]+$`) または絶対 IRI。それ以外 (例えば `unit.code`) は拒否されます。NGSI-LD コア語彙の絶対 IRI は正規形式で保存されるため、`https://uri.etsi.org/ngsi-ld/default-context/accuracy` は `accuracy` として保存され、読み戻されます (clause 5.5.7)。
  
* **1 つの名前が「HTTP と同じルール」の例外でした: `__proto__`。** これは `^[A-Za-z0-9_]+$` にマッチします。#2059 以降、MCP と A2A はこれを自身のプロパティとして永続化し、#2100 以降 HTTP NGSI-LD 書き込みパスも `validateNgsiLdBody` 経由で同様に行います (Zod のオブジェクト再構築はそうでなければキーを黙ってドロップします)。
  
* 1 レベルのネストが保持されます。サブ属性自身の `observedAt` とより深いネストは保持されません。
  
* サブ属性は MCP と A2A の読み取りが返す簡略化された (keyValues) 表現には現れません。それらを読み戻すには正規化表現を使用した HTTP NGSI-LD API を使用してください。

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

API 検出情報を提供します。

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

**`auth` に関する注意**: ai-plugin.json の `auth` ブロックは、機械可読形式で単一のスキームのみを表現できます — ここでは Bearer (`authorization_type: "bearer"`) です。X-Api-Key と OAuth 2.0 クライアントクレデンシャルの代替手段は、人間が読める `instructions` テキスト内でのみ言及されています。サポートされているすべてのスキームの完全な機械可読定義については、`/openapi.json` の `securitySchemes` (`BearerAuth`、`ApiKeyAuth`、`DPoPAuth`、`basicAuth`) を使用してください。これが認証定義の信頼できる情報源です。

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
  
* **トランスポート**: ストリーム可能な HTTP (JSON レスポンスモード)
  
* **プロトコルバージョン**: 2025-03-26
  
* **動作モード**: ステートレス (Lambda 互換)
  
* **認証**: 認証が有効 (デフォルト) の場合、アクセス制御とテナント分離は JWT Bearer トークンによって実施されます

### Claude Desktop 設定

#### ローカル開発(認証なし)

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

> **注意**: GeonicDB は Streamable HTTP (POST) のみをサポートしており SSE は利用できないため、`--transport http-only` が必要です。`http://` URL の場合は `--allow-http` が必要です(本番環境の `https://` では不要)。

#### 本番環境(JWT 認証あり)

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

JWT トークンは `/auth/login` エンドポイントから取得できます。JWT トークンは有効期限があり、定期的な更新が必要です。

#### 本番環境(API キー認証あり)

API キーは有効期限がなく、Claude Desktop のような長期的な統合に推奨されます。

**ステップ 1: GeonicDB CLI をインストール**

```bash
npm install -g @geolonia/geonicdb-cli
```

**ステップ 2: CLI にログインして設定**

```bash
# Set the server URL
geonic config set url https://geonicdb.example.com

# Log in (interactive prompt)
geonic auth login
```

**ステップ 3: API キーを作成**

```bash
geonic me api-keys create \
  --name "claude-desktop" \
  --origins "*" \
  --save
```

> **重要**: API キー(`gdb_` プレフィックス付き文字列)は作成時に一度だけ表示されます。安全に保管してください。`--save` フラグは、自動使用のために CLI 設定にキーを保存します。

API キーは XACML 認可モデルの下でデフォルトでは全て拒否されます。次の2つの方法のいずれかでアクセスを許可します:


* `--policy <policyId>` を使用して作成時にポリシーをバインド(個人ポリシーは `geonic me policies create` で作成)
  
* テナント管理者に `role=api_key` をターゲットとするテナントポリシーを作成してもらう

どちらもない場合、MCP ツール呼び出しは拒否されます。

**ステップ 4: Claude Desktop を設定**

Claude Desktop 設定ファイルを編集します:


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

> **注意**: `env` の値を実際の API キーとテナント名に置き換えてください。環境変数を使用することで、認証情報を `args` 配列から分離できます。

**ステップ 5: Claude Desktop を再起動する**

設定を保存した後、Claude Desktop を完全に終了して再起動してください。GeonicDB MCP サーバーが利用可能なツールとして表示されます。

#### Claude Code

Claude Code は Streamable HTTP をネイティブにサポートしています — `mcp-remote` プロキシは不要です:

```bash
# Production (with API key)
claude mcp add --transport http geonicdb https://geonicdb.example.com/mcp \
  --header "X-Api-Key: gdb_your_api_key" \
  --header "NGSILD-Tenant: your-tenant-name"

# Local development (no auth)
claude mcp add --transport http geonicdb-local http://localhost:3000/mcp
```

#### その他の MCP クライアント (Cursor、VS Code など)

Streamable HTTP 対応の MCP クライアントは直接接続できます:


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


* **認証が無効な場合**: 省略すると、`default` テナントが使用されます。
  
* **認証が有効な場合**: 省略すると、ログインユーザーのテナントがデフォルトとして使用されます。`super_admin` はデータツールを使用できません (403 を返します)。代わりに `tenant_admin` または `user` ロールを使用してください。ただし、`tenant_admin`/`user` は自分のテナントのみにアクセスできます。これは、認証されていない (匿名の) 呼び出し元にも適用されます (#2186): `tenant` は省略するか、呼び出し元自身のテナント (`Fiware-Service` ヘッダーから取得) と一致する必要があります — 異なるテナントを指定すると拒否されます (`Access denied`)。`tenant` を省略する (または呼び出し元自身のテナントを指定する) ことは、そのテナントが実際に `Fiware-Service` から解決できる場合にのみ許可されます。テナントコンテキストを持たない匿名の呼び出し元 — つまり、ヘッダーが存在しないテナントを指定している場合 — も `Access denied` で拒否され、`default` テナントへのフォールバックは**行われません**。

### ServicePathの指定

**データツールは `servicePath` をサポートしていません (#1608)。** NGSI-LD には `Fiware-ServicePath` の概念がなく、MCP データツール (`entities`、`batch`、`temporal`、および `types`/`attributes` リソースを含む) は NGSI-LD API 上で動作するため、すべてのデータはルートパス `/` の下に保存されます (HTTP NGSI-LD API と一致)。これらのツールの `servicePath` パラメータは非推奨です: ルート以外の値はエラーで拒否されます。

エンティティを階層的にグループ化または分離するには、代わりにエンティティの `scope` 属性を使用してください。検索には、`entities` ツールが `scopeQ` クエリパラメータを受け付けます (`batch` および `temporal` ツールには `scopeQ` 引数はありません):

```yaml
# Search entities under the /Madrid/Gardens scope and its children
entities tool:
  action: "list"
  tenant: "my-tenant"
  scopeQ: "/Madrid/Gardens/#"
```

**例外 — `config` ツールのルール操作**: ReactiveCore Rules は `servicePath` をファーストクラスフィールドとして使用するため、`config` ツールはルールの `list` (オプションのフィルターとして) および `create` 操作でこれを受け付けます (他のルール操作では無視されます)。値はトリムされ、空文字列はデフォルトで `/` になり、結果は `/^\/[\w/]*$/` に一致する単一の正確なパス (例: `/sensors`) でなければなりません — 階層的な `/#` やカンマ区切りの複数パス値は、ルールが正確な `servicePath` の等価性で一致するため拒否されます (#1607/#1608)。

### NGSI-LD クエリパラメータ

`entities` ツールは NGSI-LD クエリパラメータの全セットをサポートしています:

| Parameter        | Description                                                                                                                                                                                                                                             | Example                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `idList`         | Comma-separated entity IDs for bulk retrieval                                                                                                                                                                                                           | `"urn:ngsi-ld:Room:001,urn:ngsi-ld:Room:002"`       |
| `idPattern`      | Regex pattern to match entity IDs                                                                                                                                                                                                                       | `"Room.*"`                                          |
| `typePattern`    | Regex pattern to match entity types, evaluated **verbatim** (no implicit `*`→`.*` conversion). Combined with `type` as an **AND** (both must match, #2105/#2122). **GeonicDB 独自拡張**                                                                     | `"Sensor.*"`                                        |
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
| `local`          | Distributed operation control (#2072). **Non-HTTP entrypoints do not forward by default** — pass `"false"` to opt in to querying registered Context Sources. See below.                                                                                 | `"false"`                                           |

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

`batch` ツールの `query` アクションも `orderBy`、`orderDirection`、`sysAttrs`、`typePattern`、`local` をサポートしています。`temporal` ツールの `query` および `batch_query` アクションも `typePattern` をサポートしています(`type` と AND として組み合わせ)。`batch` ツールの `purge` は `typePattern` を受け付けません — HTTP `DELETE /ngsi-ld/v1/entities` のスコープと同様に、黙って無視されるのではなく拒否されます。

**A2A スキルは同じ `typePattern` を受け付けます (#2156)。** `entities` (`list`、`search_by_location`、
`search_by_attribute`)、`batch` (`query`)、および `temporal` (`query` / `list`) は、同じセマンティクス(逐語的な正規表現、`type` との AND)でそれを適用します。`batch` の `purge` はそれを拒否します。HTTP
`POST /ngsi-ld/v1/entityOperations/purge` でリクエストボディに配置された場合も同様です — そこでそれを黙って無視すると、呼び出し元が要求したよりも**広い**セットを削除することになります。

### 分散オペレーション / Context Sources (`local`

) — #2072

HTTP NGSI-LD API はデフォルトで登録された Context Sources にクエリを転送し、それを抑制するために `local=true` を受け付けます(ETSI GS CIM 009 clause 6.3.18 / Table 6.3.18-1)。
**MCP ツールと A2A スキルはそのデフォルトを反転させます:オプトインしない限り、ローカルデータのみをクエリします。**

| `local`             | Behaviour                                                              |
| ------------------- | ---------------------------------------------------------------------- |
| omitted             | Local data only (no Context Source is considered as matching)          |
| `"true"` / `true`   | Local data only (same as omitted)                                      |
| `"false"` / `false` | Forward to matching Context Source Registrations and merge the results |
| anything else       | Rejected — `local must be "true" or "false"`                           |

デフォルトが異なる理由:`local` は HTTP バインディング用に定義されており、MCP / A2A はそのバインディングではないため、ローカルのみのデフォルトはコンプライアンス違反ではありません。両方とも**同期リクエスト/レスポンス**のサーフェスであり、転送はプロバイダーのラウンドトリップを追加するため、AI クライアントが容易にタイムアウトに達する可能性があります。転送を明示的にすることで、エージェントが要求していない分散オペレーションをトリガーすることを防ぎます。

転送可能なオペレーション:

| Surface        | Forwards when `local="false"`                       | Always local-only                                                                                |
| -------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| MCP `entities` | `list`, `search_by_location`, `search_by_attribute` | `get` (by id), `create`, `update`, `delete`, `replace`, and the `types` / `attributes` resources |
| MCP `batch`    | `query`                                             | `create`, `upsert`, `update`, `merge`, `delete`, `purge`                                         |
| MCP `temporal` | —                                                   | all actions                                                                                      |
| A2A `entities` | `list`, `search_by_location`, `search_by_attribute` | same as MCP `entities`                                                                           |
| A2A `batch`    | `query`                                             | same as MCP `batch`                                                                              |

転送できないアクションに `local` を渡す場合、または異なるメカニズム(#2008 / #2036)を通じて登録宣言された名前をマージする `types` / `attributes` リソースに渡す場合(MCP は配線しません)は、暗黙的に無視されるのではなく**拒否**されるため、クライアントが転送していないのに転送したと信じることはありません。

認可は転送によって変更されません:呼び出し元のポリシー(#2003)から派生した行レベルの読み取り述語は、ローカルエンティティだけでなくリモートエンティティにも適用されるため、特定のエンティティタイプ / スコープ / 所有者に制限されたプリンシパルは、ローカルで読み取れない Context Source エンティティを決して見ることはありません。

**ID による取得(`entities` / `get`)は現時点ではローカルのみです。** リモートのみのエンティティはローカル認可コンテキストを持たないため、`entityType` を条件とした `Deny` は HTTP の ID による経路でそれらを見逃していました;#2092 は `FederationService.getEntity` 内のリモートエンティティに同じ行レベルの読み取り述語(#2003)を適用することでそれを閉じました。したがって、MCP / A2A からの ID による転送は認可の穴によってブロックされなくなりましたが、実装されていません — それを追加するには、HTTP コントローラーが使用する同じ `resolveReadableEntityFilter` 配線が必要です。時系列の読み取りパスには連携配線がまったくなく、`docs/API_NGSILD.md` の既存の注記と一致しています。

```yaml
# Query local storage AND every matching Context Source
entities tool:
  action: "list"
  type: "Sensor"
  local: "false"
```

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
  
* **セッション管理なし**: 各リクエストは独立して処理されます。`GET /mcp` (SSE) と `DELETE /mcp` (セッション終了)は 405 を返します。
  
* **認証**: 認証が有効な場合(デフォルト)、Bearer トークンが必要です。明示的に `AUTH_ENABLED=false` を指定すると、認証なしで動作が続行されます。
  
* **OAuth スコープ**: OAuth トークンを使用する場合、各 MCP ツールオペレーションに対応する OAuth スコープが必要です(例:`read:entities` はエンティティの読み取り用、`write:entities` は書き込み用)。スコープ制限は JWT RBAC トークンには適用されません。
  
* **分散オペレーションはオプトイン**: HTTP API とは異なり、MCP / A2A は `local="false"` が渡されない限り Context Sources に転送せず、上記のクエリアクションのみが対象です(#2072)。
  
* **レート制限**: MCP エンドポイントは、REST API と同じレート制限、ストレージクォータ、リクエストボディサイズ制限の対象となります。

## JSON Schema とカスタムデータモデル

カスタムデータモデルは、作成時に自動的に JSON Schema (Draft 2020-12) が生成されます。この JSON Schema は、以下の目的で AI ツールによって活用できます。

**`additionalProperties` フィールド**: エンティティが `propertyDetails` で定義されていない属性を持つことができるかどうかを制御します。デフォルトは `true` です(任意の追加属性を許可し、NGSI-LD のセマンティクスに従います)。厳格な検証を強制するには `false` に設定します — 定義された属性のみが受け入れられます。AI エージェントは、エンティティを作成する際にこのフィールドをチェックして、追加の属性が許可されているかどうかを判断する必要があります。

**`uniqueConstraints` フィールド**: 複合ユニーク属性の組み合わせ(例:`[{"name": "one-booking-per-slot", "fields": ["room", "date", "startTime"]}]`)を宣言し、データベースのユニークインデックスを介してサーバー側で強制されます。エンティティの作成/更新が制約された組み合わせと重複する場合、API は違反した制約名とともに `409 AlreadyExists` を返します。AI エージェントは、エンティティを作成する前にデータモデルの `uniqueConstraints` をチェックし、"violates unique constraint" を含む 409 をデータの競合(異なる値を選択)として扱い、エンティティ ID の衝突として扱わないようにする必要があります。

複合制約は正確なタプルに一致するため、重複する**値**を拒否しますが、重複する**範囲**を拒否することはありません。上記の例では、同じ部屋で同じ時刻に開始する 2 番目の予約を拒否しますが、後で開始して重複する予約(10:00-11:00 vs 10:30-11:30)は拒否しません。制約が範囲全体をカバーするようにするには、予約を共有の固定長グリッド(例:毎時/毎半時に開始する 30 分スロット)に整列させ、予約の `[start, end)` が重複するグリッドスロットごとに 1 つのエンティティを保存します — 開始スロットだけでなく — そして、それらのスロットを共有 id 属性でグループ化します。これは、すべての予約が同じグリッドとスロットルールに対して生成された場合にのみ衝突を保証します:グリッドに整列されていない間隔、または一貫性のないスロットセット(例:開始スロットのみ)は、実際の重複を見逃すか、実際には重複していないスロットで衝突する可能性があります。任意の、グリッド化されていない間隔の重複には、常に別のアプリケーションレベルのチェックが必要です。提供していない保証にちなんで制約に名前を付ける(開始時刻のみのタプルに対する `no-double-booking` など)と、エージェントや開発者が独自の重複チェックをスキップすることになります。

### AI ツールを使用したユースケースの例

**エンティティ作成時のスキーマ参照**: AI エージェントは、`config` ツールの `custom_data_models` リソースを使用してカスタムデータモデルを取得し、`jsonSchema` フィールドを参照して、正しい型と検証ルールに準拠したエンティティを生成できます。

```yaml
# 1. Retrieve the JSON Schema for the custom data model
config tool:
  action: "get"
  resource: "custom_data_models"
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

### エンティティテンプレートの生成

`config` ツールの `generate_template` アクションを使用すると、カスタムデータモデルから NGSI-LD エンティティテンプレートを自動的に生成できます。

```yaml
# Generate a template
config tool:
  resource: "custom_data_models"
  action: "generate_template"
  type: "TemperatureSensor"
```

**レスポンスの例:**

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

テンプレートは、以下の優先順位で値を決定します:

1. 定義されている場合は `defaultValue`
   
2. 定義されている場合は `example` 値
   
3. `valueType` に基づくデフォルト値(string → `""`、number → `0`、boolean → `false` など)

AI エージェントは、このテンプレートをベースとして使用し、ユーザーの指示に従って値を変更してエンティティを作成できます。

### OpenAPI 仕様との動的統合

`/openapi.json` エンドポイントは、認証されたユーザーのテナントに関連付けられたカスタムデータモデルの JSON Schema を `components/schemas` に動的に追加します。これにより、OpenAPI 仕様を参照する AI ツールやコード生成ツールが、テナント固有のデータモデルを自動的に認識できるようになります。

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

### 語彙マッピングのための @context プロパティ

`propertyDetails` 内の各プロパティには、HTTP(S) URL を持つオプションの `@context` フィールドを含めることができます。属性を定義する際は、[schema.org](https://schema.org/docs/full.html) で一致する語彙を確認し、それを `@context` 値として設定してください。

```yaml
# Create a model with schema.org vocabulary
config tool:
  resource: "custom_data_models"
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

自動生成される語彙 IRI は**このContext Broker自身のベース URL** (#1984) 上に存在し、`GET /vocab/{tenantId}/{term}` を介して参照解決可能です。ホスト名ごとのデータベースにルーティングされたリクエスト (#1291) では、ベース URL は**そのデプロイメントの登録されたホスト名** (#3190) になります。これは、そのホストだけがコンテキストを保持するデータベースを提供するためです。それ以外の場合は、`API_BASE_URL` 環境変数から取得され、これは SAM テンプレートパラメータ **`ApiBaseUrl`** (`infrastructure/template.yaml`) からデプロイ時に注入されます。設定されていない場合はリクエストの `Host` ヘッダーにフォールバックします。IRI がホスト名をまたいで安定するように `ApiBaseUrl` を設定してください。[API.md → Broker base URL resolution](../api-reference/endpoints.md#broker-base-url-resolution) を参照してください。

プロパティ URI はエンティティタイプに依存しません。同じプロパティ名(例: `email`)は、同じテナント内の異なるエンティティタイプ間で同じ URI を共有します。

### @context の解決 (#1733)

NGSI-LD レスポンスをレンダリングするために使用される `@context` は、リクエストが提供したもの**のみ**です。提供されなかった場合、NGSI-LD コア `@context` のみが使用され、それがコンパクト化できない用語は完全修飾 URI としてレンダリングされます(ETSI GS CIM 009 clause 5.5.5 / 5.5.7)。

### クエリ内の属性名 (#1998)

MCP と A2A は NGSI-LD **コア語彙**を使用します。どちらもリクエスト `@context` を持ちません。属性名の引数は、Context Brokerが保存するのと同じ正規形式に正規化されるため、コア語彙内の絶対 IRI は保存されたキーに解決されます:

| Parameter                                         | Absolute IRI accepted?                         | Why                                                                                                                                                                                                         |
| ------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `attrs`, `pick`, `omit`, `orderBy`, `geoproperty` | **Yes** — resolved to the canonical stored key | Outside the `q` grammar, so the clause 5.5.7 term ⇄ URI equivalence applies                                                                                                                                 |
| `q` (and A2A `search_by_attribute`'s `query`)     | **No** — rejected with an error                | ETSI GS CIM 009 clause 4.9 defines `AttrName = unicodeLetter *TermChar` where `TermChar` is a letter, digit, or `_`. An absolute IRI contains `:` and `/`, so it is not a well-formed attribute name in `q` |

したがって、`attrs=https://uri.etsi.org/ngsi-ld/default-context/temperature` は `temperature` 属性を返しますが、`q` 内の同じ IRI は、サイレントな空の結果ではなく、すべてのエントリ(HTTP、MCP、A2A を問わず)で明示的なエラーになります。

MCP `config` ツールを通じて作成または更新されたカスタムデータモデルは、HTTP 経由で作成されたものと**同じ自動生成 `@context`** を取得します(#1986)。`contextUrl` が省略された場合、`propertyDetails` から JSON-LD コンテキストが生成され、`/ngsi-ld/v1/jsonldContexts/` に登録され、その URL が `contextUrl` として保存されます。Context Broker自身のパブリック URL は、**HTTP コントローラーと同じ優先順位**で解決されます(#2075 / #3190):登録されたデプロイメントホスト名(ホスト名ベースのルーティングがホスト名ごとのデータベースに到達した場合)→ `API_BASE_URL` → MCP リクエスト自身の `Host` ヘッダー → ローカルサーバーアドレス。MCP ツールハンドラー自体は HTTP イベントを受信しませんが、サーバーはリクエストごとに再構築されます(`POST /mcp` 自体が HTTP 呼び出しです)。そのため、そのリクエストのイベントは、イベントなしで解決されるのではなく、代わりに `config` ツールにスレッド化されます。`API_BASE_URL` を設定していないデプロイメント(例: SSM パラメータが欠落している環境)は、常に `http://localhost:3000` にフォールバックするのではなく、リクエスト自身の `Host` から構築された `contextUrl` を取得するようになりました。

カスタムデータモデルの `contextUrl` は自動的には注入されません。モデルの語彙を必要とする AI エージェントは、データモデルから `contextUrl` を読み取り、JSON-LD `Link` ヘッダーを介して読み取り時にそれを渡す必要があります。コンテキストなしで返される完全修飾 URI は、それ自体が明確なセマンティック識別子です。

## AI コーディングアシスタントを使った JavaScript SDK

GeonicDB JavaScript SDK (`@geolonia/geonicdb-sdk`) は AI 支援開発を想定して設計されています。npm パッケージには完全な TypeScript 型宣言が含まれているため、AI コーディングアシスタント (Claude Code、Cursor、GitHub Copilot など) が追加の設定なしで自動的に完全な公開 API を検出できます。

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

別途のドキュメント URL や特別な設定は不要です。TypeScript プロジェクトでは、完全な型チェックと IDE の自動補完がすぐに利用できます。詳細は SDK ドキュメントを参照してください。

## A2A (Agent-to-Agent Protocol) サポート

GeonicDB は [A2A (Agent-to-Agent) プロトコル](https://google.github.io/A2A/) をサポートしており、標準化されたエージェント間通信を通じて他の AI エージェントがコンテキストブローカーとやり取りできるようにします。

### エンドポイント

| Endpoint                       | Method | Description                                                     |
| ------------------------------ | ------ | --------------------------------------------------------------- |
| `/.well-known/agent-card.json` | GET    | Agent Card — describes capabilities, skills, and authentication |
| `/a2a`                         | POST   | JSON-RPC 2.0 endpoint for A2A operations                        |

### サポートされているメソッド (フェーズ 1)

| JSON-RPC Method | Description                                       |
| --------------- | ------------------------------------------------- |
| `message/send`  | Send a message and receive a synchronous response |
| `tasks/get`     | Retrieve current state of a task                  |
| `tasks/list`    | List tasks with filtering and pagination          |
| `tasks/cancel`  | Request task cancellation                         |

### スキル

A2A は MCP 経由で利用可能な同じ 5 つのツールにマッピングされます:

| Skill ID   | Description                                                                                                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entities` | NGSI-LD entity CRUD, geo-spatial/attribute search                                                                                                                                 |
| `batch`    | Bulk create, upsert, update, delete operations                                                                                                                                    |
| `temporal` | Time-series data management                                                                                                                                                       |
| `config`   | Reactive rules, JSON-LD contexts, Smart Data Models catalog                                                                                                                       |
| `admin`    | User and XACML policy management (`resource`: `users` / `policies`)。未知の `resource` は `users` にフォールバックせず loud に拒否される (#2242)。テナント管理はここには無い — HTTP Admin API (`/admin/tenants`) を使う |

**`config` の `resource` 語彙は MCP と意図的に異なります (#2228)。**

| 入口               | 受け付ける `resource`                                   | 到達できるもの                             |
| ---------------- | -------------------------------------------------- | ----------------------------------- |
| A2A `config` スキル | `rules` / `jsonld_contexts` / `data_models`        | Smart Data Models **カタログ** (読み取り専用) |
| MCP `config` ツール | `rules` / `jsonld_contexts` / `custom_data_models` | テナント定義の**カスタムデータモデル**               |

A2A から custom data models は操作できません(MCP `config` ツールまたは HTTP `/custom-data-models` を使う)。逆に Smart Data Models カタログは A2A からのみ引けます。**未知の `resource` は `rules` にフォールバックせず loud に拒否されます** — 修正前は `default:` で `handleRules` に落ちていたため、`resource: "custom_data_models"` を送ったクライアントは「データモデルを操作したつもりで rules を操作」していました。この語彙は Agent Card (`/.well-known/agent-card.json`) の `config` スキル説明にも ``Accepted `resource` values: ...`` として機械可読な形で宣言されています。

**`servicePath` は データスキルでは `/` に固定されます (#2219)。** `entities` / `batch` / `temporal` に非 root の `servicePath` を渡すと、MCP の同等ツール (#1608) と同じ文言で拒否されます — NGSI-LD には Fiware-ServicePath の概念が仕様上存在せず (ETSI GS CIM 009)、HTTP NGSI-LD API は常に `/` へ正規化するため、申告を尊重すると **HTTP からは到達できないエンティティ**を作れてしまうからです。`config` の ReactiveCore Rules は `servicePath` を第一級フィールドとして持つため、従来どおり非 root を受け付けます。

### 認証

A2A は REST API と同じ認証方式を使用します:

* **Bearer JWT**: `Authorization: Bearer <token>` ヘッダー
  
* **API Key**: `X-Api-Key: <key>` ヘッダー
  
* **OAuth 2.0**: `POST /oauth/token` によるクライアントクレデンシャルフロー
  
* **DPoP**: `Authorization: DPoP <token>` + `DPoP` proof ヘッダー (有効な場合)

`Fiware-Service` ヘッダーによるテナント指定を推奨します(未指定時はデフォルトテナントにフォールバック)。

**Authorization (#1651)**: A2A の entities/batch/temporal スキルは、REST / MCP と **同一の entity-level / list-level 認可**を通ります(`checkEntityOwnership` / `requireListReadAuthz` / `requireAuthz` を合成イベントで無改変に呼ぶ実装を共有)。`entityType` / `entityOwner` / `scope` による制約は A2A 経由でも等しく強制され、一覧は読めない行を除外し、by-id 操作は DB の実属性で判定されます。到達には `/a2a` への path-level 許可が必要です — `tenant_admin` は既定ポリシーで許可され(`/mcp` と対称)、`user` / `oauth_client` / `api_key` はテナント管理者がバインドしたポリシーで `/a2a` を明示許可する必要があります(`super_admin` は data tool を使えません)。

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

A2A と MCP は相互補完的です:

* **MCP** はツール呼び出し用 — AI エージェントが GeonicDB をツールとして使用します
  
* **A2A** はエージェント間通信用 — AI エージェントが GeonicDB をピアエージェントとして連携します

両方とも同じ基盤サービスレイヤーを共有し、同じ 5 つのスキル/ツールカテゴリをサポートします。

## 参考文献


* [Claude Tool Use](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)
  
* [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
  
* [Model Context Protocol](https://modelcontextprotocol.io/)
  
* [A2A Protocol](https://google.github.io/A2A/)
  
* [llms.txt](https://llmstxt.org/)
