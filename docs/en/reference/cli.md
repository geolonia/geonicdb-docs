---
title: "CLI リファレンス"
description: "GeonicDB CLI (geonic) コマンドリファレンス"
outline: deep
---
# CLI リファレンス

`@geolonia/geonicdb-cli` (`geonic` コマンド) は GeonicDB のコマンドライン・インターフェースです。NGSI-LD エンティティ、サブスクリプション、レジストレーション、時系列データ、バッチ操作、管理機能などへの完全なアクセスを提供します。

- **リポジトリ**: [geolonia/geonicdb-cli](https://github.com/geolonia/geonicdb-cli)
- **ランタイム**: Node.js >= 20
- **パッケージ**: `@geolonia/geonicdb-cli`
## 目次

- [インストール](#インストール)
- [クイックスタート](#クイックスタート)
- [グローバルオプション](#グローバルオプション)
- [設定とプロファイル](#設定とプロファイル)
  - [設定ファイル](#設定ファイル)
  - [プロファイル管理](#プロファイル管理)
  - [環境変数](#環境変数)
  - [オプションの優先順位](#オプションの優先順位)
- [認証](#認証)
  - [メール / パスワードログイン](#メール--パスワードログイン)
  - [OAuth 2.0 クライアントクレデンシャル](#oauth-20-クライアントクレデンシャル)
  - [トークンの自動更新](#トークンの自動更新)
  - [ログアウト](#ログアウト)
- [入力形式](#入力形式)
- [出力形式](#出力形式)
- [コマンドリファレンス](#コマンドリファレンス)
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
  - [health](#health)
  - [version](#version)
  - [me](#me)
  - [help](#help)
- [シェル補完](#シェル補完)

---

## インストール

```bash
npm install -g @geolonia/geonicdb-cli
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

すべてのコマンドで使用可能です。優先順位については[オプションの優先順位](#オプションの優先順位)を参照してください。

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

---

## 設定とプロファイル

### 設定ファイル

CLI は設定を `~/.config/geonic/config.json` に保存します。`GEONIC_CONFIG_DIR` 環境変数でディレクトリをオーバーライドできます。

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
















**設定キー**: `url`、`service`、`token`、`refreshToken`、`format`、`apiKey`
#### `geonic config set <key> <value>`
設定値を保存します。機密値 (`token`、`refreshToken`、`apiKey`) は出力時にマスクされます。

#### `geonic config get <key>`
設定値を取得します。

#### `geonic config list`
現在のプロファイルのすべての設定値を表示します。

#### `geonic config delete <key>`
設定値を削除します。

### プロファイル管理

複数の接続プロファイル (例: 本番環境、ステージング、開発環境) を管理します。デフォルトプロファイルは `default` という名前で、削除できません。

#### `geonic profile list`
すべてのプロファイルを一覧表示します。アクティブなプロファイルには `*` のマークが付きます。

#### `geonic profile use <name>`
アクティブなプロファイルを切り替えます。

#### `geonic profile create <name>`
新しい空のプロファイルを作成します。

#### `geonic profile delete <name>`
プロファイルを削除します。`default` プロファイルは削除できません。

#### `geonic profile show [name]`
プロファイル設定を表示します。デフォルトではアクティブなプロファイルが対象です。機密値はマスクされます。

### 環境変数

| 変数 | 説明 |
|----------|-------------|
| `GDB_EMAIL` | ログイン用のメールアドレス |
| `GDB_PASSWORD` | ログイン用のパスワード |
| `GDB_OAUTH_CLIENT_ID` | OAuth クライアントクレデンシャルのクライアント ID |
| `GDB_OAUTH_CLIENT_SECRET` | OAuth クライアントクレデンシャルのクライアントシークレット |
| `GDB_API_KEY` | API キー (`--api-key` と同等) |
| `GEONIC_CONFIG_DIR` | 設定ディレクトリパスをオーバーライド |

### オプションの優先順位

値は以下の順序で解決されます (優先度が高い順):

1. CLI フラグ (`--url`、`--token` など)
2. 設定ファイル (プロファイル設定)
3. デフォルト値

---

## 認証

### メール / パスワードログイン

```bash
geonic auth login
```



ターミナルで実行する場合、CLI はメールアドレスとパスワードを対話的に入力するよう促します。非対話環境では、`GDB_EMAIL` と `GDB_PASSWORD` 環境変数を設定してください。

CLI は `POST /auth/login` を呼び出し、受信した `accessToken` と `refreshToken` を設定ファイルに保存します。

### OAuth 2.0 クライアントクレデンシャル

```bash
geonic auth login --client-credentials \
  --client-id <id> \
  --client-secret <secret> \
  --scope "read write"
```






OAuth 2.0 クライアントクレデンシャルフロー (`POST /oauth/token`) を使用します。クライアント ID とシークレットは、`GDB_OAUTH_CLIENT_ID` と `GDB_OAUTH_CLIENT_SECRET` 環境変数でも設定できます。

| オプション | 説明 |
|--------|-------------|
| `--client-credentials` | クライアントクレデンシャルフローを使用 |
| `--client-id <id>` | OAuth クライアント ID |
| `--client-secret <secret>` | OAuth クライアントシークレット |
| `--scope <scopes>` | OAuth スコープ (スペース区切り) |
| `--tenant-id <id>` | スコープ付き認証のテナント ID |

### トークンの自動更新

リクエストが 401 Unauthorized を返し、`refreshToken` が利用可能な場合、CLI は `POST /auth/refresh` 経由でトークンを自動的に更新し、リクエストを再試行します。

### ログアウト

```bash
geonic auth logout
```



保存されたトークンをクリアし、サーバーにベストエフォートでログアウト通知を送信します。

---

## 入力形式

`[json]` 引数を受け取るコマンドは、複数の入力方法をサポートします。CLI は自動的にソースを検出します。

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



### 対話モード

CLI がターミナルに接続されており、JSON 引数が指定されていない場合、対話型 `json>` プロンプトが開きます。括弧のバランスが取れると、入力が自動送信されます。

---

## 出力形式

`--format` または `geonic config set format <fmt>` で設定します。

| 形式 | 説明 |
|--------|-------------|
| `json` (デフォルト) | 整形された JSON |
| `table` | ASCII テーブル (配列は列として、オブジェクトはキー・値ペアとして表示) |
| `geojson` | GeoJSON FeatureCollection (`location` 属性をジオメトリに変換) |

`--count` を使用すると、`NGSILD-Results-Count` レスポンスヘッダーが `Count: N` として表示されます。

---

## コマンドリファレンス

### `entities`
NGSI-LD コンテキストエンティティ (`/ngsi-ld/v1/entities`) を管理します。

#### `geonic entities list`
オプションのフィルタを使用してエンティティを一覧表示します。

| オプション | 説明 |
|--------|-------------|
| `--type <type>` | エンティティタイプでフィルタ |
| `--id-pattern <pat>` | エンティティ ID パターン (正規表現) でフィルタ |
| `--query <q>` | NGSI クエリ式 (例: `temperature>30`) |
| `--attrs <a,b>` | 返す属性のカンマ区切りリスト |
| `--georel <rel>` | 地理的関係 (例: `near;maxDistance==1000`) |
| `--geometry <geo>` | ジオメトリタイプ (例: `Point`、`Polygon`) |
| `--coords <coords>` | 地理クエリの座標 |
| `--spatial-id <zfxy>` | 空間 ID フィルタ (ZFXY タイル形式、例: `15/0/29101/12903`) |
| `--limit <n>` | 結果の最大数 |
| `--offset <n>` | スキップする結果の数 |
| `--order-by <field>` | ソートフィールド |
| `--count` | レスポンスに総数を含める |
| `--key-values` | 簡易キー・値形式で返す |

```bash
# List all Room entities
geonic entities list --type Room

# Geo-query: entities near a point
geonic entities list --georel "near;maxDistance==1000" --geometry Point --coords "35.68,139.76"

# Query expression with pagination
geonic entities list --query "temperature>25" --limit 10 --offset 0 --count
```










#### `geonic entities get <id>`
ID で単一のエンティティを取得します。

| オプション | 説明 |
|--------|-------------|
| `--key-values` | 簡易キー・値形式で返す |

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
すべてのエンティティ属性を置換します (`PUT /entities/{id}/attrs`)。

#### `geonic entities upsert [json]`
エンティティを作成または更新します (`POST /entityOperations/upsert`)。

#### `geonic entities delete <id>`
エンティティを削除します。

---

### `entities attrs`
エンティティの個別属性を管理します。

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

コンテキストサブスクリプション (`/ngsi-ld/v1/subscriptions`) を管理します。エイリアス: `sub`。

| コマンド | 説明 |
|---------|-------------|
| `geonic sub list` | サブスクリプションを一覧表示 |
|