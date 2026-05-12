---
title: "CLI Reference"
description: "GeonicDB CLI (geonic) command reference"
outline: deep
---
# CLI リファレンス

`@geolonia/geonicdb-cli` (`geonic` コマンド) は GeonicDB のコマンドラインインターフェースです。NGSI-LD エンティティ、サブスクリプション、レジストレーション、時系列データ、バッチ操作、管理機能などへの完全なアクセスを提供します。


* **リポジトリ**: [geolonia/geonicdb-cli](https://github.com/geolonia/geonicdb-cli)
  
* **ランタイム**: Node.js >= 20
  
* **パッケージ**: `@geolonia/geonicdb-cli`

## 目次


* [インストール](#インストール)
  
* [クイックスタート](#クイックスタート)
  
* [グローバルオプション](#グローバルオプション)
  
* [設定とプロファイル](#設定とプロファイル)
  
  * [設定ファイル](#設定ファイル)
    
  * [プロファイル管理](#プロファイル管理)
    
  * [環境変数](#環境変数)
    
  * [オプション解決順序](#option-resolution-order)
    
* [認証](#認証)
  
  * [メール / パスワードログイン](#メール--パスワードログイン)
    
  * [OAuth 2.0 クライアント認証情報](#oauth-20-client-credentials)
    
  * [トークン自動更新](#トークン自動更新)
    
  * [ログアウト](#ログアウト)
    
* [入力形式](#input-format)
  
* [出力形式](#output-format)
  
* [ドライラン](#ドライラン)
  
* [更新通知](#update-notifier)
  
* [コマンドリファレンス](#コマンドリファレンス)
  
  * [entities](#entities)
    
  * [entities attrs](#entities-attrs)
    
  * [entityOperations (batch)](#entityoperations-batch)
    
  * [subscriptions (sub)](#subscriptions-sub)
    
  * [registrations (reg)](#registrations-reg)
    
  * [types](#types)
    
  * [temporal](#temporal)
    
  * [snapshots](#snapshots)
    
  * [rules](#rules)
    
  * [custom-data-models (models)](#custom-data-models-models)
    
  * [catalog](#catalog)
    
  * [admin](#admin)
    
    * [admin tenants](#admin-tenants)
      
    * [admin users](#admin-users)
      
    * [admin policies](#admin-policies)
      
    * [admin oauth-clients](#admin-oauth-clients)
      
    * [admin api-keys](#admin-api-keys)
      
    * [admin cadde](#admin-cadde)
      
  * [health](#health)
    
  * [version](#version)
    
  * [me](#me)
    
    * [me oauth-clients](#me-oauth-clients)
      
    * [me api-keys](#me-api-keys)
      
  * [help](#help)
    
* [シェル補完](#shell-completion)

***

## インストール

```bash
npm install -g @geolonia/geonicdb-cli
```

または npx で直接実行します:

```bash
npx @geolonia/geonicdb-cli <command>
```

## クイックスタート

```bash
# Configure the server URL
geonic config set url https://your-geonicdb-server.example.com

# Login
geonic auth login

# Create an entity
geonic entities create '{
  "id": "urn:ngsi-ld:Room:001",
  "type": "Room",
  "temperature": { "type": "Property", "value": 23.5 }
}'

# List entities
geonic entities list --type Room

# Get an entity
geonic entities get urn:ngsi-ld:Room:001
```

***

## グローバルオプション

すべてのコマンドで使用できます。優先順位のルールについては [Option Resolution Order](#option-resolution-order) を参照してください。

| Option                 | Description                                                                |
| ---------------------- | -------------------------------------------------------------------------- |
| `-u, --url <url>`      | GeonicDB server base URL                                                   |
| `-s, --service <name>` | Tenant name (`NGSILD-Tenant` header)                                       |
| `--token <token>`      | Authentication token                                                       |
| `-p, --profile <name>` | Named profile to use                                                       |
| `--api-key <key>`      | API key authentication                                                     |
| `-f, --format <fmt>`   | Output format: `json`, `table`, `geojson`                                  |
| `--no-color`           | Disable colored output                                                     |
| `-v, --verbose`        | Show HTTP request/response details on stderr (sensitive values are masked) |
| `--dry-run`            | Print the equivalent `curl` command without executing the request          |

***

## 設定とプロファイル

### 設定ファイル

CLI は設定を `~/.config/geonic/config.json` に保存します。`GEONIC_CONFIG_DIR` 環境変数でディレクトリを上書きできます。

```json
{
  "version": 2,
  "currentProfile": "default",
  "profiles": {
    "default": {
      "url": "http://localhost:3000",
      "format": "json"
    },
    "production": {
      "url": "https://geonicdb.example.com",
      "service": "my-tenant"
    }
  }
}
```

**設定キー**: `url`、`service`、`token`、`refreshToken`、`format`、`apiKey`、`clientId`、`clientSecret`

#### `geonic config set <key> <value>`

設定値を保存します。機密性の高い値(`token`、`refreshToken`、`apiKey`、`clientId`、`clientSecret`)は出力でマスクされます。

#### `geonic config get <key>`

設定値を取得します。

#### `geonic config list`

現在のプロファイルのすべての設定値を表示します。

#### `geonic config delete <key>`

設定値を削除します。

### プロファイル管理

複数の接続プロファイル(例:本番、ステージング、開発)を管理します。デフォルトのプロファイルは `default` という名前で、削除できません。

#### `geonic profile list`

すべてのプロファイルを一覧表示します。アクティブなプロファイルは `*` でマークされます。

#### `geonic profile use <name>`

アクティブなプロファイルを切り替えます。

#### `geonic profile create <name>`

新しい空のプロファイルを作成します。

#### `geonic profile delete <name>`

プロファイルを削除します。`default` プロファイルは削除できません。

#### `geonic profile show [name]`

プロファイル設定を表示します。デフォルトではアクティブなプロファイルが対象です。機密性の高い値はマスクされます。

### 環境変数

| Variable                  | Description                            |
| ------------------------- | -------------------------------------- |
| `GDB_EMAIL`               | Email address for login                |
| `GDB_PASSWORD`            | Password for login                     |
| `GDB_OAUTH_CLIENT_ID`     | OAuth Client Credentials client ID     |
| `GDB_OAUTH_CLIENT_SECRET` | OAuth Client Credentials client secret |
| `GDB_API_KEY`             | API key (equivalent to `--api-key`)    |
| `GEONIC_CONFIG_DIR`       | Override config directory path         |
| `NO_UPDATE_NOTIFIER`      | Disable the update notifier            |

### オプションの解決順序

値は次の順序で解決されます(優先度の高い順):


1. CLI フラグ(`--url`、`--token` など)
   
2. 設定ファイル(プロファイル設定)
   
3. デフォルト値

***

## 認証

### メール / パスワードログイン

```bash
geonic auth login
```

ターミナルで実行する場合、CLI はメールとパスワードを対話的に要求します。非対話環境では、`GDB_EMAIL` と `GDB_PASSWORD` 環境変数を設定してください。

CLI は `POST /auth/login` を呼び出し、受信した `accessToken` と `refreshToken` を設定ファイルに保存します。

### OAuth 2.0 Client Credentials

```bash
geonic auth login --client-credentials \
  --client-id <id> \
  --client-secret <secret> \
  --scope "read write"
```

OAuth 2.0 Client Credentials フロー(`POST /oauth/token`)を使用します。クライアント ID とシークレットは、`GDB_OAUTH_CLIENT_ID` と `GDB_OAUTH_CLIENT_SECRET` 環境変数でも設定できます。

| Option                     | Description                         |
| -------------------------- | ----------------------------------- |
| `--client-credentials`     | Use Client Credentials flow         |
| `--client-id <id>`         | OAuth client ID                     |
| `--client-secret <secret>` | OAuth client secret                 |
| `--scope <scopes>`         | OAuth scopes (space-separated)      |
| `--tenant-id <id>`         | Tenant ID for scoped authentication |

### トークン自動更新

リクエストが 401 Unauthorized を返し、`refreshToken` が利用可能な場合、CLI は自動的に `POST /auth/refresh` 経由でトークンを更新し、リクエストを再試行します。

`clientId` と `clientSecret` が設定に保存されている場合(例:`geonic me oauth-clients create --save` 経由)、CLI はトークンの期限が切れると自動的に Client Credentials フローを使用して再認証します。

### ログアウト

```bash
geonic auth logout
```

保存されたトークンをクリアし、ベストエフォートでサーバーにログアウト通知を送信します。

***

## 入力フォーマット

`[json]` 引数を受け入れるコマンドは、複数の入力方法をサポートしています。CLI は自動的にソースを検出します:

### インライン JSON / JSON5

```bash
geonic entities create '{"id": "urn:ngsi-ld:Room:001", "type": "Room"}'
```

JSON5 がサポートされています:引用符なしのキー、シングルクォート、末尾のカンマ、コメントが使用できます。

```bash
geonic entities create '{id: "urn:ngsi-ld:Room:001", type: "Room",}'
```

### ファイル入力(`@` プレフィックス)

```bash
geonic entities create @entity.json
```

### 標準入力(パイプ)

```bash
cat entity.json | geonic entities create
```

明示的な `-` マーカーも後方互換性のためにサポートされています:

```bash
cat entity.json | geonic entities create -
```

### インタラクティブモード

CLI がターミナルに接続されており、JSON 引数が提供されていない場合、インタラクティブな `json>` プロンプトが開きます。入力は括弧のバランスが取れると自動的に送信されます。

***

## 出力フォーマット

`--format` または `geonic config set format <fmt>` で設定します。

| Format           | Description                                                           |
| ---------------- | --------------------------------------------------------------------- |
| `json` (default) | Pretty-printed JSON                                                   |
| `table`          | ASCII table (arrays as columns, objects as key-value pairs)           |
| `geojson`        | GeoJSON FeatureCollection (converts `location` attribute to geometry) |

`--count` を使用すると、`NGSILD-Results-Count` レスポンスヘッダーが `Count: N` として表示されます。

***

## ドライラン

任意のコマンドで `--dry-run` を使用すると、リクエストを実行する代わりに同等の `curl` コマンドを出力します。出力はコピーしてターミナルで直接実行できます。

```bash
$ geonic entities list --type Sensor --dry-run
curl \
  -H 'Content-Type: application/ld+json' \
  -H 'Accept: application/ld+json' \
  -H 'Authorization: Bearer <token>' \
  'http://localhost:3000/ngsi-ld/v1/entities?type=Sensor'
```

本文を含む POST を含むすべての操作で動作します:

```bash
$ geonic entities create '{"id":"Room1","type":"Room"}' --dry-run
curl \
  -X POST \
  -H 'Content-Type: application/ld+json' \
  -H 'Accept: application/ld+json' \
  -d '{"id":"Room1","type":"Room"}' \
  'http://localhost:3000/ngsi-ld/v1/entities'
```

***

## アップデート通知

CLI は 24 時間ごとに新しいバージョンをチェックし、アップデートが利用可能な場合に通知ボックスを表示します。このチェックは CI 環境および非 TTY 端末ではスキップされます。`NO_UPDATE_NOTIFIER=1` を設定することで無効化できます。

***

## コマンドリファレンス

### `entities`

NGSI-LD コンテキストエンティティ (`/ngsi-ld/v1/entities`) を管理します。

#### `geonic entities list`

オプションのフィルタを使用してエンティティをリストします。

| Option                | Description                                                    |
| --------------------- | -------------------------------------------------------------- |
| `--type <type>`       | Filter by entity type                                          |
| `--id-pattern <pat>`  | Filter by entity ID pattern (regex)                            |
| `--query <q>`         | NGSI query expression (e.g., `temperature>30`)                 |
| `--attrs <a,b>`       | Comma-separated list of attributes to return                   |
| `--georel <rel>`      | Geo-relation (e.g., `near;maxDistance==1000`)                  |
| `--geometry <geo>`    | Geometry type (e.g., `Point`, `Polygon`)                       |
| `--coords <coords>`   | Coordinates for geo-query                                      |
| `--spatial-id <zfxy>` | Spatial ID filter (ZFXY tile format, e.g., `15/0/29101/12903`) |
| `--limit <n>`         | Maximum number of results                                      |
| `--offset <n>`        | Number of results to skip                                      |
| `--order-by <field>`  | Sort field                                                     |
| `--count`             | Include total count in response                                |
| `--count-only`        | Only show the total count without listing entities             |
| `--key-values`        | Return simplified key-value format                             |

```bash
# List all Room entities
geonic entities list --type Room

# Geo-query: entities near a point
geonic entities list --georel "near;maxDistance==1000" --geometry Point --coords "[139.7671,35.6812]"

# Query expression with pagination
geonic entities list --query "temperature>25" --limit 10 --offset 0 --count

# Get only the total count (no entity data)
geonic entities list --type Sensor --count-only
```

#### `geonic entities get <id>`

ID によって単一のエンティティを取得します。

| Option         | Description                        |
| -------------- | ---------------------------------- |
| `--key-values` | Return simplified key-value format |

#### `geonic entities create [json]`

新しいエンティティを作成します。

```bash
geonic entities create '{
  "id": "urn:ngsi-ld:Room:001",
  "type": "Room",
  "temperature": { "type": "Property", "value": 23.5 },
  "location": {
    "type": "GeoProperty",
    "value": { "type": "Point", "coordinates": [139.76, 35.68] }
  }
}'
```

#### `geonic entities update <id> [json]`

エンティティ属性を部分的に更新します (`PATCH /entities/{id}/attrs`)。

```bash
geonic entities update urn:ngsi-ld:Room:001 '{"temperature": {"type": "Property", "value": 25.0}}'
```

#### `geonic entities replace <id> [json]`

すべてのエンティティ属性を置き換えます (`PUT /entities/{id}/attrs`)。

#### `geonic entities upsert [json]`

エンティティを作成または更新します (`POST /entityOperations/upsert`)。

#### `geonic entities delete <id>`

エンティティを削除します。

***

### `entities attrs`

エンティティの個別の属性を管理します。

| Command                                                     | Description                 |
| ----------------------------------------------------------- | --------------------------- |
| `geonic entities attrs list <entityId>`                     | List all attributes         |
| `geonic entities attrs get <entityId> <attrName>`           | Get a specific attribute    |
| `geonic entities attrs add <entityId> [json]`               | Add attributes              |
| `geonic entities attrs update <entityId> <attrName> [json]` | Update a specific attribute |
| `geonic entities attrs delete <entityId> <attrName>`        | Delete a specific attribute |

```bash
# Get the temperature attribute
geonic entities attrs get urn:ngsi-ld:Room:001 temperature

# Update an attribute
geonic entities attrs update urn:ngsi-ld:Room:001 temperature '{"type": "Property", "value": 26.0}'
```

***

### `entityOperations` (batch)

エンティティのバッチ操作 (`/ngsi-ld/v1/entityOperations`)。エイリアス: `batch`。

| Command                      | HTTP                            | Description                        |
| ---------------------------- | ------------------------------- | ---------------------------------- |
| `geonic batch create [json]` | POST `/entityOperations/create` | Create multiple entities           |
| `geonic batch upsert [json]` | POST `/entityOperations/upsert` | Create or update multiple entities |
| `geonic batch update [json]` | POST `/entityOperations/update` | Update multiple entities           |
| `geonic batch delete [json]` | POST `/entityOperations/delete` | Delete multiple entities           |
| `geonic batch query [json]`  | POST `/entityOperations/query`  | Query entities by POST             |
| `geonic batch merge [json]`  | POST `/entityOperations/merge`  | Merge multiple entities            |

```bash
# Batch create entities from a file
geonic batch create @entities.json

# Batch upsert from stdin
cat entities.json | geonic batch upsert
```

***

### `subscriptions` (sub)

コンテキストサブスクリプションを管理します (`/ngsi-ld/v1/subscriptions`)。エイリアス: `sub`。

| Command                         | Description           |
| ------------------------------- | --------------------- |
| `geonic sub list`               | List subscriptions    |
| `geonic sub get <id>`           | Get a subscription    |
| `geonic sub create [json]`      | Create a subscription |
| `geonic sub update <id> [json]` | Update a subscription |
| `geonic sub delete <id>`        | Delete a subscription |

**`sub list` オプション**: `--limit <n>`, `--offset <n>`, `--count`

```bash
geonic sub create '{
  "type": "Subscription",
  "entities": [{"type": "Room"}],
  "watchedAttributes": ["temperature"],
  "notification": {
    "endpoint": { "uri": "https://webhook.example.com/notify" }
  }
}'
```

***

### `registrations` (reg)

コンテキストソース登録を管理します (`/ngsi-ld/v1/csourceRegistrations`)。エイリアス: `reg`。

| Command                         | Description           |
| ------------------------------- | --------------------- |
| `geonic reg list`               | List registrations    |
| `geonic reg get <id>`           | Get a registration    |
| `geonic reg create [json]`      | Create a registration |
| `geonic reg update <id> [json]` | Update a registration |
| `geonic reg delete <id>`        | Delete a registration |

**`reg list` オプション**: `--limit <n>`, `--offset <n>`, `--count`

***

### `types`

利用可能なエンティティタイプを照会します (`/ngsi-ld/v1/types`)。

| Command                       | Description                     |
| ----------------------------- | ------------------------------- |
| `geonic types list`           | List all entity types           |
| `geonic types get <typeName>` | Get details for a specific type |

***

### `temporal`

時系列エンティティデータを管理します(`/ngsi-ld/v1/temporal`)。

#### `geonic temporal entities list`

時系列エンティティを一覧表示します。

| Option                 | Description                                     |
| ---------------------- | ----------------------------------------------- |
| `--type <type>`        | Filter by entity type                           |
| `--attrs <a,b>`        | Attributes to return                            |
| `--query <q>`          | NGSI query expression                           |
| `--georel <rel>`       | Geo-relation                                    |
| `--geometry <geo>`     | Geometry type                                   |
| `--coords <coords>`    | Coordinates                                     |
| `--time-rel <rel>`     | Temporal relation: `before`, `after`, `between` |
| `--time-at <time>`     | Start time (ISO 8601)                           |
| `--end-time-at <time>` | End time (ISO 8601)                             |
| `--last-n <n>`         | Return last N temporal values                   |
| `--limit <n>`          | Maximum number of results                       |
| `--offset <n>`         | Number of results to skip                       |
| `--count`              | Include total count                             |

```bash
# Get temperature history for the last hour
geonic temporal entities get urn:ngsi-ld:Room:001 \
  --attrs temperature \
  --time-rel after \
  --time-at 2026-01-01T00:00:00Z
```

#### `geonic temporal entities get <id>`

エンティティの時系列表現を取得します。

**オプション**: `--attrs`、`--time-rel`、`--time-at`、`--end-time-at`、`--last-n`

#### `geonic temporal entities create [json]`

時系列エンティティを作成します。

#### `geonic temporal entities delete <id>`

時系列エンティティを削除します。

#### `geonic temporal entityOperations query [json]`

POST で集計サポート付きの時系列エンティティをクエリします。

| Option                     | Description                                          |
| -------------------------- | ---------------------------------------------------- |
| `--aggr-methods <methods>` | Aggregation methods (e.g., `totalCount,sum,avg`)     |
| `--aggr-period <period>`   | Aggregation period duration (ISO 8601, e.g., `PT1H`) |

```bash
# Hourly average temperature
geonic temporal entityOperations query @query.json \
  --aggr-methods avg \
  --aggr-period PT1H
```

***

### `snapshots`

エンティティスナップショットを管理します。

| Command                        | Description           |
| ------------------------------ | --------------------- |
| `geonic snapshots list`        | List snapshots        |
| `geonic snapshots get <id>`    | Get a snapshot        |
| `geonic snapshots create`      | Create a new snapshot |
| `geonic snapshots delete <id>` | Delete a snapshot     |
| `geonic snapshots clone <id>`  | Clone a snapshot      |

**`snapshots list` オプション**: `--limit <n>`、`--offset <n>`

***

### `rules`

ReactiveCore Rules を管理します。詳細は [ReactiveCore Rules](../features/reactivcore-rules.md) を参照してください。

| Command                           | Description       |
| --------------------------------- | ----------------- |
| `geonic rules list`               | List all rules    |
| `geonic rules get <id>`           | Get a rule        |
| `geonic rules create [json]`      | Create a rule     |
| `geonic rules update <id> [json]` | Update a rule     |
| `geonic rules delete <id>`        | Delete a rule     |
| `geonic rules activate <id>`      | Activate a rule   |
| `geonic rules deactivate <id>`    | Deactivate a rule |

***

### `custom-data-models` (models)

カスタムデータモデルを管理します。エイリアス: `models`。

| Command                            | Description          |
| ---------------------------------- | -------------------- |
| `geonic models list`               | List all data models |
| `geonic models get <id>`           | Get a data model     |
| `geonic models create [json]`      | Create a data model  |
| `geonic models update <id> [json]` | Update a data model  |
| `geonic models delete <id>`        | Delete a data model  |

***

### `catalog`

DCAT-AP データカタログを閲覧します。

| Command                               | Description                 |
| ------------------------------------- | --------------------------- |
| `geonic catalog get`                  | Get the catalog             |
| `geonic catalog datasets list`        | List datasets               |
| `geonic catalog datasets get <id>`    | Get a dataset               |
| `geonic catalog datasets sample <id>` | Get a sample from a dataset |

***

### `admin`

管理操作。`tenant_admin` または `super_admin` ロールが必要です。詳細は [Authentication & Authorization Guide](./auth.md) を参照してください。

#### `admin tenants`

| Command                                   | Description         |
| ----------------------------------------- | ------------------- |
| `geonic admin tenants list`               | List tenants        |
| `geonic admin tenants get <id>`           | Get a tenant        |
| `geonic admin tenants create [json]`      | Create a tenant     |
| `geonic admin tenants update <id> [json]` | Update a tenant     |
| `geonic admin tenants delete <id>`        | Delete a tenant     |
| `geonic admin tenants activate <id>`      | Activate a tenant   |
| `geonic admin tenants deactivate <id>`    | Deactivate a tenant |

#### `admin users`

| Command                                 | Description          |
| --------------------------------------- | -------------------- |
| `geonic admin users list`               | List users           |
| `geonic admin users get <id>`           | Get a user           |
| `geonic admin users create [json]`      | Create a user        |
| `geonic admin users update <id> [json]` | Update a user        |
| `geonic admin users delete <id>`        | Delete a user        |
| `geonic admin users activate <id>`      | Activate a user      |
| `geonic admin users deactivate <id>`    | Deactivate a user    |
| `geonic admin users unlock <id>`        | Unlock a locked user |

#### `admin policies`

XACML ポリシー管理。詳細は [XACML Policy-Based Authorization](./auth.md#xacml-policy-based-authorization) を参照してください。

| Command                                    | Description         |
| ------------------------------------------ | ------------------- |
| `geonic admin policies list`               | List policies       |
| `geonic admin policies get <id>`           | Get a policy        |
| `geonic admin policies create [json]`      | Create a policy     |
| `geonic admin policies update <id> [json]` | Update a policy     |
| `geonic admin policies delete <id>`        | Delete a policy     |
| `geonic admin policies activate <id>`      | Activate a policy   |
| `geonic admin policies deactivate <id>`    | Deactivate a policy |

#### `admin oauth-clients`

OAuth 2.0 クライアント管理。詳細は [OAuth 2.0 M2M Authentication](./auth.md#oauth-20-m2m-authentication) を参照してください。

| Command                                         | Description            |
| ----------------------------------------------- | ---------------------- |
| `geonic admin oauth-clients list`               | List OAuth clients     |
| `geonic admin oauth-clients get <id>`           | Get an OAuth client    |
| `geonic admin oauth-clients create [json]`      | Create an OAuth client |
| `geonic admin oauth-clients update <id> [json]` | Update an OAuth client |
| `geonic admin oauth-clients delete <id>`        | Delete an OAuth client |

#### `admin api-keys`

API キー管理。`tenant_admin` または `super_admin` ロールが必要です。詳細は [API Key Authentication](./auth.md#api-key-authentication) を参照してください。

| Command                                    | Description       |
| ------------------------------------------ | ----------------- |
| `geonic admin api-keys list`               | List API keys     |
| `geonic admin api-keys get <id>`           | Get an API key    |
| `geonic admin api-keys create [json]`      | Create an API key |
| `geonic admin api-keys update <id> [json]` | Update an API key |
| `geonic admin api-keys delete <id>`        | Delete an API key |

**`admin api-keys list` オプション**: `--limit <n>`、`--offset <n>`、`--count`、`--tenant-id <id>` (super\_admin のみ)

```bash
# Create an API key with policy binding
geonic admin api-keys create '{
  "name": "my-sensor-key",
  "tenantId": "my-tenant",
  "allowedOrigins": ["https://example.com"],
  "policyId": "sensor-writer",
  "rateLimit": { "perMinute": 120 }
}'

# List API keys for a specific tenant (super_admin)
geonic admin api-keys list --tenant-id my-tenant

# Update an API key
geonic admin api-keys update gdb_abc123 '{"name": "renamed-key", "isActive": false}'
```

**スキーマの作成**:

| Field            | Type      | Required           | Description                                                                                                                                                 |
| ---------------- | --------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`           | string    | Yes                | Key name (1–100 chars)                                                                                                                                      |
| `tenantId`       | string    | Yes (super\_admin) | Target tenant ID. Required for super\_admin. Optional for tenant\_admin (defaults to their own tenant)                                                      |
| `allowedOrigins` | string\[] | Yes                | CORS origins (min 1, max 20). Use `["*"]` for all                                                                                                           |
| `policyId`       | string    | No                 | Bind to an existing XACML policy (target bypassed). If omitted, authorization falls back to tenant policies, then role defaults (`api_key` default is Deny) |
| `rateLimit`      | object    | No                 | `{ perMinute: number }` (1–1000, default: 60)                                                                                                               |

> **注意**: 平文の API キーは、作成レスポンスの `key` フィールドに一度だけ返されます。安全に保管してください。

#### `admin cadde`

CADDE (Connector Architecture for Decentralized Data Exchange) 設定管理。

| Command                         | Description           |
| ------------------------------- | --------------------- |
| `geonic admin cadde get`        | Get CADDE settings    |
| `geonic admin cadde set [json]` | Set CADDE settings    |
| `geonic admin cadde delete`     | Delete CADDE settings |

***

### `health`

```bash
geonic health
```

サーバーのヘルスステータスを確認します(`GET /health`)。

### `version`

```bash
geonic version
```

CLI バージョンとサーバーバージョンを表示します(`GET /version`)。

### `me`

現在認証されているユーザーを表示し、ユーザーリソースを管理します。

```bash
geonic me
```

現在のユーザー情報、JWT トークンの有効期限(期限切れの場合は赤、5 分以内に期限切れの場合は黄色)、およびアクティブなプロファイル名を表示します。

#### `me oauth-clients`

自分自身の OAuth クライアント(`/me/oauth-clients`)を管理します。`admin oauth-clients` とは異なり、管理者権限は必要ありません — 認証された任意のユーザーが自分自身のクライアントを管理できます。

| Command                                 | Description               |
| --------------------------------------- | ------------------------- |
| `geonic me oauth-clients list`          | List your OAuth clients   |
| `geonic me oauth-clients create [json]` | Create a new OAuth client |
| `geonic me oauth-clients delete <id>`   | Delete an OAuth client    |

**`me oauth-clients create` オプション**:

| Option                | Description                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--name <name>`       | Client name                                                                                                                                                  |
| `--policy <policyId>` | Bind to an existing XACML policy (target bypassed). If omitted, authorization falls back to tenant policies, then role defaults (`user` default is GET-only) |
| `--save`              | Save credentials to config for automatic re-authentication                                                                                                   |

```bash
# Create an OAuth client with flags
geonic me oauth-clients create --name my-ci-bot --policy bot-access

# Create and save credentials for auto-reauth
geonic me oauth-clients create --name my-ci-bot --save

# Create from JSON
geonic me oauth-clients create '{"name":"my-bot","policyId":"bot-access"}'
```

`--save` が使用されると、CLI は直ちに Client Credentials グラントを実行し、`clientId`、`clientSecret`、および結果として得られる `token` を設定に保存します。その後のトークンの有効期限切れは自動的に処理されます。

#### `me api-keys`

自分自身の API キー(`/me/api-keys`)を管理します。`admin api-keys` とは異なり、管理者権限は必要ありません — 認証された任意のユーザーが自分自身のキーを管理できます。ユーザーあたり 5 つのキーに制限されています。

| Command                              | Description          |
| ------------------------------------ | -------------------- |
| `geonic me api-keys list`            | List your API keys   |
| `geonic me api-keys create [json]`   | Create a new API key |
| `geonic me api-keys delete <key-id>` | Delete an API key    |

**`me api-keys list` オプション**: `--limit <n>`、`--offset <n>`、`--count`

```bash
# Create a personal API key
geonic me api-keys create '{
  "name": "my-dev-key",
  "allowedOrigins": ["http://localhost:3000"],
  "policyId": "dev-access"
}'

# List your API keys
geonic me api-keys list

# Delete an API key
geonic me api-keys delete gdb_abc123
```

> **注意**: 平文の API キーは、作成レスポンスの `key` フィールドで一度だけ返されます。安全に保管してください。

### `help`

段階的な詳細を持つ WP-CLI スタイルのヘルプ。

```bash
geonic help                    # All commands overview
geonic help entities           # Command group details
geonic help entities list      # Subcommand details with options and examples
geonic help admin tenants      # Nested command help
```

`--help` フラグはすべてのコマンドでも機能します。

***

## Shell 補完

### Bash

```bash
eval "$(geonic cli completions bash)"
```

永続化するには `~/.bashrc` に追加してください。

### Zsh

```bash
eval "$(geonic cli completions zsh)"
```

永続化するには `~/.zshrc` に追加してください。

補完は、サブコマンド名、オプションフラグ、および `--format` 値の候補(`json`、`table`、`geojson`)をサポートします。

***

## コマンドツリー

```text
geonic
├── config
│   ├── set <key> <value>
│   ├── get <key>
│   ├── list
│   └── delete <key>
├── profile
│   ├── list
│   ├── use <name>
│   ├── create <name>
│   ├── delete <name>
│   └── show [name]
├── auth
│   ├── login [--client-credentials] [--client-id] [--client-secret] [--scope] [--tenant-id]
│   └── logout
├── me
│   ├── (default: show current user info)
│   ├── oauth-clients
│   │   ├── list
│   │   ├── create [json] [--name] [--scopes] [--save]
│   │   └── delete <id>
│   └── api-keys
│       ├── list [--limit] [--offset] [--count]
│       ├── create [json]
│       └── delete <id>
├── entities
│   ├── list [options]
│   ├── get <id> [--key-values]
│   ├── create [json]
│   ├── update <id> [json]
│   ├── replace <id> [json]
│   ├── upsert [json]
│   ├── delete <id>
│   └── attrs
│       ├── list <entityId>
│       ├── get <entityId> <attrName>
│       ├── add <entityId> [json]
│       ├── update <entityId> <attrName> [json]
│       └── delete <entityId> <attrName>
├── entityOperations (alias: batch)
│   ├── create [json]
│   ├── upsert [json]
│   ├── update [json]
│   ├── delete [json]
│   ├── query [json]
│   └── merge [json]
├── subscriptions (alias: sub)
│   ├── list [--limit] [--offset] [--count]
│   ├── get <id>
│   ├── create [json]
│   ├── update <id> [json]
│   └── delete <id>
├── registrations (alias: reg)
│   ├── list [--limit] [--offset] [--count]
│   ├── get <id>
│   ├── create [json]
│   ├── update <id> [json]
│   └── delete <id>
├── types
│   ├── list
│   └── get <typeName>
├── temporal
│   ├── entities
│   │   ├── list [options]
│   │   ├── get <id> [options]
│   │   ├── create [json]
│   │   └── delete <id>
│   └── entityOperations
│       └── query [json] [--aggr-methods] [--aggr-period]
├── snapshots
│   ├── list [--limit] [--offset]
│   ├── get <id>
│   ├── create
│   ├── delete <id>
│   └── clone <id>
├── rules
│   ├── list
│   ├── get <id>
│   ├── create [json]
│   ├── update <id> [json]
│   ├── delete <id>
│   ├── activate <id>
│   └── deactivate <id>
├── custom-data-models (alias: models)
│   ├── list
│   ├── get <id>
│   ├── create [json]
│   ├── update <id> [json]
│   └── delete <id>
├── catalog
│   ├── get
│   └── datasets
│       ├── list
│       ├── get <id>
│       └── sample <id>
├── admin
│   ├── tenants
│   │   ├── list / get / create / update / delete
│   │   ├── activate / deactivate
│   ├── users
│   │   ├── list / get / create / update / delete
│   │   ├── activate / deactivate / unlock
│   ├── policies
│   │   ├── list / get / create / update / delete
│   │   ├── activate / deactivate
│   ├── oauth-clients
│   │   └── list / get / create / update / delete
│   ├── api-keys
│   │   └── list / get / create / update / delete
│   └── cadde
│       └── get / set / delete
├── health
├── version
├── help [<args...>]
└── cli
    ├── completions bash / zsh
    └── version
```
