---
title: "CLI Reference"
description: "GeonicDB CLI (geonic) command reference"
outline: deep
---
# CLI リファレンス

`@geolonia/geonicdb-cli` (`geonic` コマンド) は GeonicDB のコマンドラインインターフェースです。NGSI-LD エンティティ、サブスクリプション、登録、時系列データ、バッチ操作、管理機能などへの完全なアクセスを提供します。

- **リポジトリ**: [geolonia/geonicdb-cli](https://github.com/geolonia/geonicdb-cli)
- **ランタイム**: Node.js >= 20
- **パッケージ**: `@geolonia/geonicdb-cli`## 目次

- [インストール](#installation)
- [クイックスタート](#quick-start)
- [グローバルオプション](#global-options)
- [設定とプロファイル](#configuration--profiles)
  - [設定ファイル](#configuration-file)
  - [プロファイル管理](#profile-management)
  - [環境変数](#environment-variables)
  - [オプション解決順序](#option-resolution-order)
- [認証](#authentication)
  - [メール / パスワードログイン](#email--password-login)
  - [OAuth 2.0 クライアントクレデンシャル](#oauth-20-client-credentials)
  - [トークン自動更新](#token-auto-refresh)
  - [ログアウト](#logout)
- [入力形式](#input-format)
- [出力形式](#output-format)
- [ドライラン](#dry-run)
- [更新通知](#update-notifier)
- [コマンドリファレンス](#command-reference)
  - [entities](#entities)
  - [entities attrs](#entities-attrs)
  - [entityOperations (batch)](#entityoperations-batch)
  - [subscriptions (sub)](#subscriptions-sub)
  - [registrations (reg)](#registrations-reg)
  - [types](#types)
  - [temporal](#temporal)
  - [snapshots](#snapshots)
  - [rules](#rules)
  - [custom-data-models (models)](#custom-data-models-models)
  - [catalog](#catalog)
  - [admin](#admin)
    - [admin tenants](#admin-tenants)
    - [admin users](#admin-users)
    - [admin policies](#admin-policies)
    - [admin oauth-clients](#admin-oauth-clients)
    - [admin api-keys](#admin-api-keys)
    - [admin cadde](#admin-cadde)
  - [health](#health)
  - [version](#version)
  - [me](#me)
    - [me oauth-clients](#me-oauth-clients)
    - [me api-keys](#me-api-keys)
  - [help](#help)
- [シェル補完](#shell-completion)

---## インストール

```bash
npm install -g @geolonia/geonicdb-cli
```





または npx で直接実行:

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







































---

## グローバルオプション

すべてのコマンドで利用可能。優先順位ルールについては [オプション解決順序](#option-resolution-order) を参照してください。

| オプション | 説明 |
|--------|-------------|
| `-u, --url <url>` | GeonicDB サーバーのベース URL |
| `-s, --service <name>` | テナント名 (`NGSILD-Tenant` ヘッダー) |
| `--token <token>` | 認証トークン |
| `-p, --profile <name>` | 使用する名前付きプロファイル |
| `--api-key <key>` | API キー認証 |
| `-f, --format <fmt>` | 出力形式: `json`、`table`、`geojson` |
| `--no-color` | カラー出力を無効化 |
| `-v, --verbose` | HTTP リクエスト/レスポンスの詳細を stderr に表示 (機密値はマスク) |
| `--dry-run` | リクエストを実行せずに同等の `curl` コマンドを出力 |

---## 設定とプロファイル

### 設定ファイル

CLI は設定を `~/.config/geonic/config.json` に保存します。ディレクトリを上書きするには `GEONIC_CONFIG_DIR` 環境変数を使用してください。

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































**設定キー**: `url`、`service`、`token`、`refreshToken`、`format`、`apiKey`、`clientId`、`clientSecret`#### `geonic config set <key> <value>`設定値を保存します。機密値 (`token`、`refreshToken`、`apiKey`、`clientId`、`clientSecret`) は出力時にマスクされます。

#### `geonic config get <key>`設定値を取得します。

#### `geonic config list`現在のプロファイルのすべての設定値を表示します。

#### `geonic config delete <key>`設定値を削除します。

### プロファイル管理

複数の接続プロファイル (例: 本番、ステージング、開発) を管理します。デフォルトプロファイルは `default` という名前で、削除できません。

#### `geonic profile list`すべてのプロファイルを一覧表示します。アクティブなプロファイルは `*` でマークされます。

#### `geonic profile use <name>`アクティブなプロファイルを切り替えます。

#### `geonic profile create <name>`新しい空のプロファイルを作成します。

#### `geonic profile delete <name>`プロファイルを削除します。`default` プロファイルは削除できません。

#### `geonic profile show [name]`プロファイル設定を表示します。デフォルトではアクティブなプロファイルが対象です。機密値はマスクされます。

### 環境変数

| 変数 | 説明 |
|----------|-------------|
| `GDB_EMAIL` | ログイン用のメールアドレス |
| `GDB_PASSWORD` | ログイン用のパスワード |
| `GDB_OAUTH_CLIENT_ID` | OAuth Client Credentials のクライアント ID |
| `GDB_OAUTH_CLIENT_SECRET` | OAuth Client Credentials のクライアントシークレット |
| `GDB_API_KEY` | API キー (`--api-key` と同等) |
| `GEONIC_CONFIG_DIR` | 設定ディレクトリパスを上書き |
| `NO_UPDATE_NOTIFIER` | アップデート通知を無効化 |

### オプション解決順序

値は以下の順序で解決されます (優先度の高い順):

1. CLI フラグ (`--url`、`--token` など)
2. 設定ファイル (プロファイル設定)
3. デフォルト値

---## 認証

### Email / Password ログイン

```bash
geonic auth login
```





ターミナルで実行する場合、CLI は email と password を対話的に入力するよう促します。非対話環境では、`GDB_EMAIL` と `GDB_PASSWORD` 環境変数を設定してください。

CLI は `POST /auth/login` を呼び出し、受信した `accessToken` と `refreshToken` を設定ファイルに保存します。

### OAuth 2.0 Client Credentials

```bash
geonic auth login --client-credentials \
  --client-id <id> \
  --client-secret <secret> \
  --scope "read write"
```











OAuth 2.0 Client Credentials フロー (`POST /oauth/token`) を使用します。Client ID と secret は `GDB_OAUTH_CLIENT_ID` と `GDB_OAUTH_CLIENT_SECRET` 環境変数でも設定できます。

| オプション | 説明 |
|--------|-------------|
| `--client-credentials` | Client Credentials フローを使用 |
| `--client-id <id>` | OAuth クライアント ID |
| `--client-secret <secret>` | OAuth クライアントシークレット |
| `--scope <scopes>` | OAuth スコープ (スペース区切り) |
| `--tenant-id <id>` | スコープ認証用のテナント ID |

### トークン自動更新

リクエストが 401 Unauthorized を返し、`refreshToken` が利用可能な場合、CLI は `POST /auth/refresh` 経由でトークンを自動的に更新し、リクエストを再試行します。

`clientId` と `clientSecret` が設定に保存されている場合 (例: `geonic me oauth-clients create --save` 経由)、CLI はトークンの有効期限が切れたときに Client Credentials フローを使用して自動的に再認証します。

### ログアウト

```bash
geonic auth logout
```





保存されたトークンをクリアし、サーバーにベストエフォートのログアウト通知を送信します。

---

## 入力フォーマット

`[json]` 引数を受け入れるコマンドは、複数の入力方法をサポートしています。CLI は入力元を自動検出します:

### インライン JSON / JSON5

```bash
geonic entities create '{"id": "urn:ngsi-ld:Room:001", "type": "Room"}'
```





JSON5 がサポートされています: クォートなしのキー、シングルクォート、末尾のカンマ、コメントが使用できます。

```bash
geonic entities create '{id: "urn:ngsi-ld:Room:001", type: "Room",}'
```





### ファイル入力 (`@` プレフィックス)

```bash
geonic entities create @entity.json
```





### 標準入力 (パイプ)

```bash
cat entity.json | geonic entities create
```





後方互換性のため、明示的な `-` マーカーもサポートされています:

```bash
cat entity.json | geonic entities create -
```





### 対話モード

CLI がターミナルに接続されており、JSON 引数が提供されていない場合、対話的な `json>` プロンプトが開きます。入力は括弧がバランスされると自動的に送信されます。

---## 出力形式

`--format` または `geonic config set format <fmt>` で設定します。

| 形式 | 説明 |
|--------|-------------|
| `json` (デフォルト) | 整形された JSON |
| `table` | ASCII テーブル (配列は列、オブジェクトはキーと値のペアとして表示) |
| `geojson` | GeoJSON FeatureCollection (`location` 属性をジオメトリに変換) |

`--count` を使用すると、`NGSILD-Results-Count` レスポンスヘッダーは `Count: N` として表示されます。

---

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















ボディを含む POST など、すべての操作で動作します:

```bash
$ geonic entities create '{"id":"Room1","type":"Room"}' --dry-run
curl \
  -X POST \
  -H 'Content-Type: application/ld+json' \
  -H 'Accept: application/ld+json' \
  -d '{"id":"Room1","type":"Room"}' \
  'http://localhost:3000/ngsi-ld/v1/entities'
```

















---

## アップデート通知

CLI は 24 時間ごとに新しいバージョンをチェックし、アップデートが利用可能な場合に通知ボックスを表示します。このチェックは CI 環境および非 TTY ターミナルではスキップされます。`NO_UPDATE_NOTIFIER=1` を設定することで無効化できます。

---

## コマンドリファレンス### `entities`NGSI-LD コンテキストエンティティ (`/ngsi-ld/v1/entities`) を管理します。

#### `geonic entities list`オプションのフィルタを使用してエンティティを一覧表示します。

| オプション | 説明 |
|--------|-------------|
| `--type <type>` | エンティティタイプでフィルタ |
| `--id-pattern <pat>` | エンティティ ID パターンでフィルタ (正規表現) |
| `--query <q>` | NGSI クエリ式 (例: `temperature>30`) |
| `--attrs <a,b>` | 返却する属性のカンマ区切りリスト |
| `--georel <rel>` | 地理的関係 (例: `near;maxDistance==1000`) |
| `--geometry <geo>` | ジオメトリタイプ (例: `Point`、`Polygon`) |
| `--coords <coords>` | 地理的クエリの座標 |
| `--spatial-id <zfxy>` | 空間 ID フィルタ (ZFXY タイル形式、例: `15/0/29101/12903`) |
| `--limit <n>` | 最大結果数 |
| `--offset <n>` | スキップする結果数 |
| `--order-by <field>` | ソートフィールド |
| `--count` | レスポンスに総件数を含める |
| `--count-only` | エンティティを一覧表示せずに総件数のみを表示 |
| `--key-values` | 簡略化されたキーバリュー形式で返却 |

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

























#### `geonic entities get <id>`ID で単一のエンティティを取得します。

| オプション | 説明 |
|--------|-------------|
| `--key-values` | 簡略化されたキーバリュー形式で返却 |

#### `geonic entities create [json]`新しいエンティティを作成します。

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





















#### `geonic entities update <id> [json]`エンティティの属性を部分的に更新します (`PATCH /entities/{id}/attrs`)。

```bash
geonic entities update urn:ngsi-ld:Room:001 '{"temperature": {"type": "Property", "value": 25.0}}'
```





#### `geonic entities replace <id> [json]`すべてのエンティティ属性を置き換えます (`PUT /entities/{id}/attrs`)。

#### `geonic entities upsert [json]`エンティティを作成または更新します (`POST /entityOperations/upsert`)。

#### `geonic entities delete <id>`エンティティを削除します。

---### `entities attrs`エンティティの個別属性を管理します。

| コマンド | 説明 |
|---------|-------------|
| `geonic entities attrs list <entityId>` | すべての属性を一覧表示 |
| `geonic entities attrs get <entityId> <attrName>` | 特定の属性を取得 |
| `geonic entities attrs add <entityId> [json]` | 属性を追加 |
| `geonic entities attrs update <entityId> <attrName> [json]` | 特定の属性を更新 |
| `geonic entities attrs delete <entityId> <attrName>` | 特定の属性を削除 |

```bash
# Get the temperature attribute
geonic entities attrs get urn:ngsi-ld:Room:001 temperature

# Update an attribute
geonic entities attrs update urn:ngsi-ld:Room:001 temperature '{"type": "Property", "value": 26.0}'
```













---

### `entityOperations` (batch)

エンティティのバッチ操作 (`/ngsi-ld/v1/entityOperations`)。エイリアス: `batch`。

| コマンド | HTTP | 説明 |
|---------|------|-------------|
| `geonic batch create [json]` | POST `/entityOperations/create` | 複数のエンティティを作成 |
| `geonic batch upsert [json]` | POST `/entityOperations/upsert` | 複数のエンティティを作成または更新 |
| `geonic batch update [json]` | POST `/entityOperations/update` | 複数のエンティティを更新 |
| `geonic batch delete [json]` | POST `/entityOperations/delete` | 複数のエンティティを削除 |
| `geonic batch query [json]` | POST `/entityOperations/query` | POST でエンティティをクエリ |
| `geonic batch merge [json]` | POST `/entityOperations/merge` | 複数のエンティティをマージ |

```bash
# Batch create entities from a file
geonic batch create @entities.json

# Batch upsert from stdin
cat entities.json | geonic batch upsert
```













---

### `subscriptions` (sub)

コンテキストサブスクリプションを管理 (`/ngsi-ld/v1/subscriptions`)。エイリアス: `sub`。

| コマンド | 説明 |
|---------|-------------|
| `geonic sub list` | サブスクリプションを一覧表示 |
| `geonic sub get <id>` | サブスクリプションを取得 |
| `geonic sub create [json]` | サブスクリプションを作成 |
| `geonic sub update <id> [json]` | サブスクリプションを更新 |
| `geonic sub delete <id>` | サブスクリプションを削除 |

**`sub list` オプション**: `--limit <n>`、`--offset <n>`、`--count````bash
geonic sub create '{
  "type": "Subscription",
  "entities": [{"type": "Room"}],
  "watchedAttributes": ["temperature"],
  "notification": {
    "endpoint": { "uri": "https://webhook.example.com/notify" }
  }
}'
```



















---

### `registrations` (reg)

コンテキストソース登録を管理 (`/ngsi-ld/v1/csourceRegistrations`)。エイリアス: `reg`。

| コマンド | 説明 |
|---------|-------------|
| `geonic reg list` | 登録を一覧表示 |
| `geonic reg get <id>` | 登録を取得 |
| `geonic reg create [json]` | 登録を作成 |
| `geonic reg update <id> [json]` | 登録を更新 |
| `geonic reg delete <id>` | 登録を削除 |

**`reg list` オプション**: `--limit <n>`、`--offset <n>`、`--count`---

### `types`利用可能なエンティティタイプをクエリ (`/ngsi-ld/v1/types`)。

| コマンド | 説明 |
|---------|-------------|
| `geonic types list` | すべてのエンティティタイプを一覧表示 |
| `geonic types get <typeName>` | 特定のタイプの詳細を取得 |

---### `temporal`時系列エンティティデータを管理します (`/ngsi-ld/v1/temporal`)。

#### `geonic temporal entities list`時系列エンティティを一覧表示します。

| オプション | 説明 |
|--------|-------------|
| `--type <type>` | エンティティタイプでフィルタリング |
| `--attrs <a,b>` | 返す属性 |
| `--query <q>` | NGSI クエリ式 |
| `--georel <rel>` | 地理関係 |
| `--geometry <geo>` | ジオメトリタイプ |
| `--coords <coords>` | 座標 |
| `--time-rel <rel>` | 時間関係: `before`、`after`、`between` |
| `--time-at <time>` | 開始時刻 (ISO 8601) |
| `--end-time-at <time>` | 終了時刻 (ISO 8601) |
| `--last-n <n>` | 最新 N 個の時系列値を返す |
| `--limit <n>` | 最大結果数 |
| `--offset <n>` | スキップする結果数 |
| `--count` | 総数を含める |

```bash
# Get temperature history for the last hour
geonic temporal entities get urn:ngsi-ld:Room:001 \
  --attrs temperature \
  --time-rel after \
  --time-at 2026-01-01T00:00:00Z
```













#### `geonic temporal entities get <id>`エンティティの時系列表現を取得します。

**オプション**: `--attrs`、`--time-rel`、`--time-at`、`--end-time-at`、`--last-n`#### `geonic temporal entities create [json]`時系列エンティティを作成します。

#### `geonic temporal entities delete <id>`時系列エンティティを削除します。

#### `geonic temporal entityOperations query [json]`集約サポート付きで POST により時系列エンティティをクエリします。

| オプション | 説明 |
|--------|-------------|
| `--aggr-methods <methods>` | 集約メソッド (例: `totalCount,sum,avg`) |
| `--aggr-period <period>` | 集約期間の長さ (ISO 8601、例: `PT1H`) |

```bash
# Hourly average temperature
geonic temporal entityOperations query @query.json \
  --aggr-methods avg \
  --aggr-period PT1H
```











---

### `snapshots`エンティティスナップショットを管理します。

| コマンド | 説明 |
|---------|-------------|
| `geonic snapshots list` | スナップショットを一覧表示 |
| `geonic snapshots get <id>` | スナップショットを取得 |
| `geonic snapshots create` | 新しいスナップショットを作成 |
| `geonic snapshots delete <id>` | スナップショットを削除 |
| `geonic snapshots clone <id>` | スナップショットを複製 |

**`snapshots list` オプション**: `--limit <n>`、`--offset <n>`---

### `rules`ReactiveCore ルールを管理します。詳細については ReactiveCore Rules を参照してください。

| コマンド | 説明 |
|---------|-------------|
| `geonic rules list` | すべてのルールを一覧表示 |
| `geonic rules get <id>` | ルールを取得 |
| `geonic rules create [json]` | ルールを作成 |
| `geonic rules update <id> [json]` | ルールを更新 |
| `geonic rules delete <id>` | ルールを削除 |
| `geonic rules activate <id>` | ルールを有効化 |
| `geonic rules deactivate <id>` | ルールを無効化 |

---### `custom-data-models` (models)

カスタムデータモデルを管理します。エイリアス: `models`| コマンド | 説明 |
|---------|-------------|
| `geonic models list` | すべてのデータモデルを一覧表示 |
| `geonic models get <id>` | データモデルを取得 |
| `geonic models create [json]` | データモデルを作成 |
| `geonic models update <id> [json]` | データモデルを更新 |
| `geonic models delete <id>` | データモデルを削除 |

---

### `catalog`DCAT-AP データカタログを閲覧します。

| コマンド | 説明 |
|---------|-------------|
| `geonic catalog get` | カタログを取得 |
| `geonic catalog datasets list` | データセットを一覧表示 |
| `geonic catalog datasets get <id>` | データセットを取得 |
| `geonic catalog datasets sample <id>` | データセットからサンプルを取得 |

---### `admin`管理操作。`tenant_admin` または `super_admin` ロールが必要です。詳細については、認証・認可ガイドを参照してください。

#### `admin tenants`| コマンド | 説明 |
|---------|-------------|
| `geonic admin tenants list` | テナント一覧の取得 |
| `geonic admin tenants get <id>` | テナントの取得 |
| `geonic admin tenants create [json]` | テナントの作成 |
| `geonic admin tenants update <id> [json]` | テナントの更新 |
| `geonic admin tenants delete <id>` | テナントの削除 |
| `geonic admin tenants activate <id>` | テナントの有効化 |
| `geonic admin tenants deactivate <id>` | テナントの無効化 |

#### `admin users`| コマンド | 説明 |
|---------|-------------|
| `geonic admin users list` | ユーザー一覧の取得 |
| `geonic admin users get <id>` | ユーザーの取得 |
| `geonic admin users create [json]` | ユーザーの作成 |
| `geonic admin users update <id> [json]` | ユーザーの更新 |
| `geonic admin users delete <id>` | ユーザーの削除 |
| `geonic admin users activate <id>` | ユーザーの有効化 |
| `geonic admin users deactivate <id>` | ユーザーの無効化 |
| `geonic admin users unlock <id>` | ロックされたユーザーのロック解除 |

#### `admin policies`XACML ポリシー管理。詳細については、XACML ポリシーベース認可を参照してください。

| コマンド | 説明 |
|---------|-------------|
| `geonic admin policies list` | ポリシー一覧の取得 |
| `geonic admin policies get <id>` | ポリシーの取得 |
| `geonic admin policies create [json]` | ポリシーの作成 |
| `geonic admin policies update <id> [json]` | ポリシーの更新 |
| `geonic admin policies delete <id>` | ポリシーの削除 |
| `geonic admin policies activate <id>` | ポリシーの有効化 |
| `geonic admin policies deactivate <id>` | ポリシーの無効化 |

#### `admin oauth-clients`OAuth 2.0 クライアント管理。詳細については、OAuth 2.0 M2M 認証を参照してください。

| コマンド | 説明 |
|---------|-------------|
| `geonic admin oauth-clients list` | OAuth クライアント一覧の取得 |
| `geonic admin oauth-clients get <id>` | OAuth クライアントの取得 |
| `geonic admin oauth-clients create [json]` | OAuth クライアントの作成 |
| `geonic admin oauth-clients update <id> [json]` | OAuth クライアントの更新 |
| `geonic admin oauth-clients delete <id>` | OAuth クライアントの削除 |

#### `admin api-keys`API キー管理。`tenant_admin` または `super_admin` ロールが必要です。詳細については、API キー認証を参照してください。

| コマンド | 説明 |
|---------|-------------|
| `geonic admin api-keys list` | API キー一覧の取得 |
| `geonic admin api-keys get <id>` | API キーの取得 |
| `geonic admin api-keys create [json]` | API キーの作成 |
| `geonic admin api-keys update <id> [json]` | API キーの更新 |
| `geonic admin api-keys delete <id>` | API キーの削除 |

**`admin api-keys list` オプション**: `--limit <n>`、`--offset <n>`、`--count`、`--tenant-id <id>` (super_admin のみ)

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































**作成スキーマ**:

| フィールド | 型 | 必須 | 説明 |
|-------|------|----------|-------------|
| `name` | string | はい | キー名 (1~100 文字) |
| `tenantId` | string | はい (super_admin) | 対象テナント ID。super_admin には必須。tenant_admin にはオプション (デフォルトは自分のテナント) |
| `allowedOrigins` | string[] | はい | CORS オリジン (最小 1、最大 20)。すべて許可する場合は `["*"]` を使用 |
| `policyId` | string | いいえ | 既存の XACML ポリシーにバインド (ターゲットはバイパスされます)。省略した場合、認可はテナントポリシー、次にロールのデフォルト (`api_key` のデフォルトは Deny) にフォールバックします |
| `rateLimit` | object | いいえ | `{ perMinute: number }` (1~1000、デフォルト: 60) |

> **注意**: 平文の API キーは、作成レスポンスの `key` フィールドで一度だけ返されます。安全に保管してください。

#### `admin cadde`CADDE (Connector Architecture for Decentralized Data Exchange) 設定の管理。

| コマンド | 説明 |
|---------|-------------|
| `geonic admin cadde get` | CADDE 設定を取得 |
| `geonic admin cadde set [json]` | CADDE 設定を設定 |
| `geonic admin cadde delete` | CADDE 設定を削除 |

---

### `health````bash
geonic health
```





サーバーのヘルスステータスを確認 (`GET /health`)。

### `version````bash
geonic version
```





CLI バージョンとサーバーバージョンを表示 (`GET /version`)。### `me`現在認証されているユーザーを表示し、ユーザーリソースを管理します。

```bash
geonic me
```





現在のユーザー情報、JWT トークンの有効期限(期限切れの場合は赤、5 分以内に期限切れの場合は黄色で表示)、およびアクティブなプロファイル名を表示します。

#### `me oauth-clients`自分自身の OAuth クライアント(`/me/oauth-clients`)を管理します。`admin oauth-clients` とは異なり、管理者権限は不要です。認証された任意のユーザーが自分のクライアントを管理できます。

| コマンド | 説明 |
|---------|-------------|
| `geonic me oauth-clients list` | OAuth クライアントを一覧表示 |
| `geonic me oauth-clients create [json]` | 新しい OAuth クライアントを作成 |
| `geonic me oauth-clients delete <id>` | OAuth クライアントを削除 |

**`me oauth-clients create` のオプション**:

| オプション | 説明 |
|--------|-------------|
| `--name <name>` | クライアント名 |
| `--policy <policyId>` | 既存の XACML ポリシーにバインド(ターゲットはバイパスされます)。省略した場合、認可はテナントポリシーにフォールバックし、その後ロールのデフォルトに(`user` のデフォルトは GET のみ) |
| `--save` | 自動再認証のために設定に認証情報を保存 |

```bash
# Create an OAuth client with flags
geonic me oauth-clients create --name my-ci-bot --policy bot-access

# Create and save credentials for auto-reauth
geonic me oauth-clients create --name my-ci-bot --save

# Create from JSON
geonic me oauth-clients create '{"name":"my-bot","policyId":"bot-access"}'
```



















`--save` を使用すると、CLI は直ちに Client Credentials グラントを実行し、`clientId`、`clientSecret`、および結果の `token` を設定に保存します。その後のトークン有効期限切れは自動的に処理されます。

#### `me api-keys`自分自身の API キー(`/me/api-keys`)を管理します。`admin api-keys` とは異なり、管理者権限は不要です。認証された任意のユーザーが自分のキーを管理できます。ユーザーあたり 5 つのキーに制限されます。

| コマンド | 説明 |
|---------|-------------|
| `geonic me api-keys list` | API キーを一覧表示 |
| `geonic me api-keys create [json]` | 新しい API キーを作成 |
| `geonic me api-keys delete <key-id>` | API キーを削除 |

**`me api-keys list` のオプション**: `--limit <n>`、`--offset <n>`、`--count````bash
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



























> **注意**: 平文の API キーは、作成レスポンスの `key` フィールドに一度だけ返されます。安全に保管してください。

### `help`WP-CLI スタイルのヘルプで、段階的に詳細を表示します。

```bash
geonic help                    # All commands overview
geonic help entities           # Command group details
geonic help entities list      # Subcommand details with options and examples
geonic help admin tenants      # Nested command help
```











`--help` フラグはすべてのコマンドでも使用できます。

---## シェル補完

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

補完はサブコマンド名、オプションフラグ、および `--format` の値候補 (`json`、`table`、`geojson`) をサポートしています。

---# コマンドツリー

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






















































































































