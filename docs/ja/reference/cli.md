---
title: "CLI Reference"
description: "GeonicDB CLI (geonic) command reference"
outline: deep
---
# CLI リファレンス

`@geolonia/geonicdb-cli` (`geonic` コマンド) は GeonicDB のためのコマンドラインインターフェースです。NGSI-LD エンティティ、サブスクリプション、登録、時系列データ、バッチ操作、管理機能などへのフルアクセスを提供します。

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
  - [オプション解決順序](#オプション解決順序)
- [認証](#認証)
  - [メール / パスワードログイン](#メール--パスワードログイン)
  - [OAuth 2.0 クライアント認証情報](#oauth-20-クライアント認証情報)
  - [トークン自動更新](#トークン自動更新)
  - [ログアウト](#ログアウト)
- [入力形式](#入力形式)
- [出力形式](#出力形式)
- [ドライラン](#ドライラン)
- [更新通知](#更新通知)
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
- [シェル補完](#シェル補完)

---

## インストール

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

すべてのコマンドで使用可能です。優先順位のルールについては [オプション解決順序](#オプションの解決順序) を参照してください。

| オプション | 説明 |
|--------|-------------|
| `-u, --url <url>` | GeonicDB サーバーのベース URL |
| `-s, --service <name>` | テナント名 (`NGSILD-Tenant` ヘッダー) |
| `--token <token>` | 認証トークン |
| `-p, --profile <name>` | 使用する名前付きプロファイル |
| `--api-key <key>` | API キー認証 |
| `-f, --format <fmt>` | 出力形式: `json`、`table`、`geojson` |
| `--no-color` | 色付き出力を無効化 |
| `-v, --verbose` | HTTP リクエスト/レスポンスの詳細を stderr に表示 (機密値はマスクされます) |
| `--dry-run` | リクエストを実行せずに同等の `curl` コマンドを出力 |

---

## 設定とプロファイル

### 設定ファイル

CLI は `~/.config/geonic/config.json` に設定を保存します。`GEONIC_CONFIG_DIR` 環境変数でディレクトリを上書きできます。

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

**設定キー**: `url`, `service`, `token`, `refreshToken`, `format`, `apiKey`, `clientId`, `clientSecret`
#

### `geonic config set <key> <value>`
設定値を保存します。機密性の高い値(`token`, `refreshToken`, `apiKey`, `clientId`, `clientSecret`)は出力時にマスクされます。

#

### `geonic config get <key>`
設定値を取得します。

#

### `geonic config list`
現在のプロファイルのすべての設定値を表示します。

#

### `geonic config delete <key>`
設定値を削除します。

### プロファイル管理

複数の接続プロファイル(例:本番環境、ステージング環境、開発環境)を管理します。デフォルトのプロファイルは `default` という名前で、削除できません。

#

### `geonic profile list`
すべてのプロファイルをリスト表示します。アクティブなプロファイルは `*` でマークされます。

#

### `geonic profile use <name>`
アクティブなプロファイルを切り替えます。

#

### `geonic profile create <name>`
新しい空のプロファイルを作成します。

#

### `geonic profile delete <name>`
プロファイルを削除します。`default` プロファイルは削除できません。

#

### `geonic profile show [name]`
プロファイル設定を表示します。デフォルトではアクティブなプロファイルが対象です。機密性の高い値はマスクされます。

### 環境変数

| 変数 | 説明 |
|----------|-------------|
| `GDB_EMAIL` | ログイン用メールアドレス |
| `GDB_PASSWORD` | ログイン用パスワード |
| `GDB_OAUTH_CLIENT_ID` | OAuth Client Credentials のクライアント ID |
| `GDB_OAUTH_CLIENT_SECRET` | OAuth Client Credentials のクライアントシークレット |
| `GDB_API_KEY` | API キー(`--api-key` と同等) |
| `GEONIC_CONFIG_DIR` | 設定ディレクトリパスを上書き |
| `NO_UPDATE_NOTIFIER` | 更新通知を無効化 |

### オプションの解決順序

値は次の順序で解決されます(優先度の高い順):

1. CLI フラグ(`--url`, `--token` など)
2. 設定ファイル(プロファイル設定)
3. デフォルト値

---

## 認証

### メール / パスワード ログイン

```bash
geonic auth login
```

ターミナルで実行する場合、CLI はメールアドレスとパスワードを対話形式で入力するよう促します。非対話環境では、`GDB_EMAIL` と `GDB_PASSWORD` 環境変数を設定してください。

CLI は `POST /auth/login` を呼び出し、受信した `accessToken` と `refreshToken` を設定ファイルに保存します。

### OAuth 2.0 クライアント認証情報

```bash
geonic auth login --client-credentials \
  --client-id <id> \
  --client-secret <secret> \
  --scope "read write"
```

OAuth 2.0 クライアント認証情報フロー (`POST /oauth/token`) を使用します。クライアント ID とシークレットは、`GDB_OAUTH_CLIENT_ID` と `GDB_OAUTH_CLIENT_SECRET` 環境変数でも設定可能です。

| オプション | 説明 |
|--------|-------------|
| `--client-credentials` | クライアント認証情報フローを使用 |
| `--client-id <id>` | OAuth クライアント ID |
| `--client-secret <secret>` | OAuth クライアント シークレット |
| `--scope <scopes>` | OAuth スコープ (スペース区切り) |
| `--tenant-id <id>` | スコープ認証用のテナント ID |

### トークンの自動更新

リクエストが 401 Unauthorized を返し、`refreshToken` が利用可能な場合、CLI は自動的に `POST /auth/refresh` 経由でトークンを更新し、リクエストを再試行します。

設定ファイルに `clientId` と `clientSecret` が保存されている場合 (例: `geonic me oauth-clients create --save` 経由)、CLI はトークンの有効期限が切れたときに自動的にクライアント認証情報フローを使用して再認証します。

### ログアウト

```bash
geonic auth logout
```

保存されたトークンをクリアし、ベストエフォートでサーバーにログアウト通知を送信します。

---

## 入力フォーマット

`[json]` 引数を受け付けるコマンドは、複数の入力方法をサポートしています。CLI は入力元を自動検出します:

### インライン JSON / JSON5

```bash
geonic entities create '{"id": "urn:ngsi-ld:Room:001", "type": "Room"}'
```

JSON5 をサポート: クォートなしのキー、シングルクォート、末尾のカンマ、コメントが使用可能です。

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

CLI がターミナルに接続されていて、JSON 引数が提供されていない場合、対話形式の `json>` プロンプトが開きます。ブラケットがバランスしたときに入力が自動送信されます。

---

## 出力フォーマット

`--format` または `geonic config set format <fmt>` で設定します。

| フォーマット | 説明 |
|--------|-------------|
| `json` (デフォルト) | 整形された JSON |
| `table` | ASCII テーブル (配列は列、オブジェクトはキー・バリュー ペアとして表示) |
| `geojson` | GeoJSON FeatureCollection (`location` 属性をジオメトリに変換) |

`--count` を使用する場合、`NGSILD-Results-Count` レスポンスヘッダーが `Count: N` として表示されます。

---

## ドライラン

任意のコマンドで `--dry-run` を使用すると、リクエストを実行する代わりに、同等の `curl` コマンドを出力します。出力はコピーしてターミナルで直接実行できます。

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

## 更新通知

CLI は 24 時間ごとに新しいバージョンをチェックし、アップデートが利用可能な場合に通知ボックスを表示します。チェックは CI 環境および非 TTY ターミナルではスキップされます。`NO_UPDATE_NOTIFIER=1` を設定することで無効化できます。

---

## コマンドリファレンス

### `entities`
NGSI-LD コンテキストエンティティ (`/ngsi-ld/v1/entities`) を管理します。

#

### `geonic entities list`
オプションのフィルタを使用してエンティティをリストします。

| オプション | 説明 |
|--------|-------------|
| `--type <type>` | エンティティタイプでフィルタ |
| `--id-pattern <pat>` | エンティティ ID パターンでフィルタ (正規表現) |
| `--query <q>` | NGSI クエリ式 (例: `temperature>30`) |
| `--attrs <a,b>` | 返す属性のカンマ区切りリスト |
| `--georel <rel>` | ジオリレーションシップ (例: `near;maxDistance==1000`) |
| `--geometry <geo>` | ジオメトリタイプ (例: `Point`、`Polygon`) |
| `--coords <coords>` | ジオクエリの座標 |
| `--spatial-id <zfxy>` | 空間 ID フィルタ (ZFXY タイル形式、例: `15/0/29101/12903`) |
| `--limit <n>` | 最大結果数 |
| `--offset <n>` | スキップする結果数 |
| `--order-by <field>` | ソートフィールド |
| `--count` | レスポンスに合計カウントを含める |
| `--count-only` | エンティティをリストせず合計カウントのみを表示 |
| `--key-values` | 簡略化されたキー・バリュー形式で返す |

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

#

### `geonic entities get <id>`
ID で単一のエンティティを取得します。

| オプション | 説明 |
|--------|-------------|
| `--key-values` | 簡略化されたキー・バリュー形式で返す |

#

### `geonic entities create [json]`
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

#

### `geonic entities update <id> [json]`
エンティティ属性を部分的に更新します (`PATCH /entities/{id}/attrs`)。

```bash
geonic entities update urn:ngsi-ld:Room:001 '{"temperature": {"type": "Property", "value": 25.0}}'
```

#

### `geonic entities replace <id> [json]`
すべてのエンティティ属性を置き換えます (`PUT /entities/{id}/attrs`)。

#

### `geonic entities upsert [json]`
エンティティを作成または更新します (`POST /entityOperations/upsert`)。

#

### `geonic entities delete <id>`
エンティティを削除します。

---

### `entities attrs`
エンティティの個別の属性を管理します。

| コマンド | 説明 |
|---------|-------------|
| `geonic entities attrs list <entityId>` | すべての属性をリスト |
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

### `entityOperations`
 (バッチ)

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

### `subscriptions`
 (sub)

コンテキストサブスクリプション (`/ngsi-ld/v1/subscriptions`) を管理します。エイリアス: `sub`。

| コマンド | 説明 |
|---------|-------------|
| `geonic sub list` | サブスクリプションの一覧表示 |
| `geonic sub get <id>` | サブスクリプションの取得 |
| `geonic sub create [json]` | サブスクリプションの作成 |
| `geonic sub update <id> [json]` | サブスクリプションの更新 |
| `geonic sub delete <id>` | サブスクリプションの削除 |

**`sub list` オプション**: `--limit <n>`、`--offset <n>`、`--count`
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

---

### `registrations`
 (reg)

コンテキストソース登録 (`/ngsi-ld/v1/csourceRegistrations`) を管理します。エイリアス: `reg`。

| コマンド | 説明 |
|---------|-------------|
| `geonic reg list` | 登録の一覧表示 |
| `geonic reg get <id>` | 登録の取得 |
| `geonic reg create [json]` | 登録の作成 |
| `geonic reg update <id> [json]` | 登録の更新 |
| `geonic reg delete <id>` | 登録の削除 |

**`reg list` オプション**: `--limit <n>`、`--offset <n>`、`--count`
---

### `types`
利用可能なエンティティタイプを照会します (`/ngsi-ld/v1/types`)。

| コマンド | 説明 |
|---------|-------------|
| `geonic types list` | すべてのエンティティタイプの一覧表示 |
| `geonic types get <typeName>` | 特定のタイプの詳細を取得 |

---

### `temporal`
時系列エンティティデータを管理します (`/ngsi-ld/v1/temporal`)。

#

### `geonic temporal entities list`
時系列エンティティの一覧を取得します。

| オプション | 説明 |
|--------|-------------|
| `--type <type>` | エンティティタイプでフィルタリング |
| `--attrs <a,b>` | 返却する属性 |
| `--query <q>` | NGSI クエリ式 |
| `--georel <rel>` | 地理的関係 |
| `--geometry <geo>` | ジオメトリタイプ |
| `--coords <coords>` | 座標 |
| `--time-rel <rel>` | 時間的関係: `before`、`after`、`between` |
| `--time-at <time>` | 開始時刻 (ISO 8601) |
| `--end-time-at <time>` | 終了時刻 (ISO 8601) |
| `--last-n <n>` | 最新の N 個の時系列値を返却 |
| `--limit <n>` | 結果の最大数 |
| `--offset <n>` | スキップする結果の数 |
| `--count` | 合計カウントを含める |

```bash
# Get temperature history for the last hour
geonic temporal entities get urn:ngsi-ld:Room:001 \
  --attrs temperature \
  --time-rel after \
  --time-at 2026-01-01T00:00:00Z
```

#

### `geonic temporal entities get <id>`
エンティティの時系列表現を取得します。

**オプション**: `--attrs`、`--time-rel`、`--time-at`、`--end-time-at`、`--last-n`
#

### `geonic temporal entities create [json]`
時系列エンティティを作成します。

#

### `geonic temporal entities delete <id>`
時系列エンティティを削除します。

#

### `geonic temporal entityOperations query [json]`
集約サポート付きで POST による時系列エンティティのクエリを実行します。

| オプション | 説明 |
|--------|-------------|
| `--aggr-methods <methods>` | 集約メソッド (例: `totalCount,sum,avg`) |
| `--aggr-period <period>` | 集約期間 (ISO 8601、例: `PT1H`) |

```bash
# Hourly average temperature
geonic temporal entityOperations query @query.json \
  --aggr-methods avg \
  --aggr-period PT1H
```

---

### `snapshots`
エンティティスナップショットを管理します。

| コマンド | 説明 |
|---------|-------------|
| `geonic snapshots list` | スナップショットの一覧を取得 |
| `geonic snapshots get <id>` | スナップショットを取得 |
| `geonic snapshots create` | 新しいスナップショットを作成 |
| `geonic snapshots delete <id>` | スナップショットを削除 |
| `geonic snapshots clone <id>` | スナップショットをクローン |

**`snapshots list` のオプション**: `--limit <n>`、`--offset <n>`
---

### `rules`
ReactiveCore ルールを管理します。詳細は ReactiveCore Rules を参照してください。

| コマンド | 説明 |
|---------|-------------|
| `geonic rules list` | すべてのルールを一覧表示 |
| `geonic rules get <id>` | ルールを取得 |
| `geonic rules create [json]` | ルールを作成 |
| `geonic rules update <id> [json]` | ルールを更新 |
| `geonic rules delete <id>` | ルールを削除 |
| `geonic rules activate <id>` | ルールを有効化 |
| `geonic rules deactivate <id>` | ルールを無効化 |

---

### `custom-data-models` (models)

カスタムデータモデルを管理します。エイリアス: `models`。

| コマンド | 説明 |
|---------|-------------|
| `geonic models list` | すべてのデータモデルを一覧表示 |
| `geonic models get <id>` | データモデルを取得 |
| `geonic models create [json]` | データモデルを作成 |
| `geonic models update <id> [json]` | データモデルを更新 |
| `geonic models delete <id>` | データモデルを削除 |

---

### DCAT-AP

DCAT-AP データカタログを参照します。

| コマンド | 説明 |
|---------|-------------|
| `geonic catalog get` | カタログを取得する |
| `geonic catalog datasets list` | データセットを一覧表示する |
| `geonic catalog datasets get <id>` | データセットを取得する |
| `geonic catalog datasets sample <id>` | データセットからサンプルを取得する |

---

### `admin`
管理操作。`tenant_admin` または `super_admin` ロールが必要です。詳細は認証・認可ガイドを参照してください。

#

### `admin tenants`
| コマンド | 説明 |
|---------|-------------|
| `geonic admin tenants list` | テナント一覧を取得 |
| `geonic admin tenants get <id>` | テナントを取得 |
| `geonic admin tenants create [json]` | テナントを作成 |
| `geonic admin tenants update <id> [json]` | テナントを更新 |
| `geonic admin tenants delete <id>` | テナントを削除 |
| `geonic admin tenants activate <id>` | テナントを有効化 |
| `geonic admin tenants deactivate <id>` | テナントを無効化 |

#

### `admin users`
| コマンド | 説明 |
|---------|-------------|
| `geonic admin users list` | ユーザー一覧を取得 |
| `geonic admin users get <id>` | ユーザーを取得 |
| `geonic admin users create [json]` | ユーザーを作成 |
| `geonic admin users update <id> [json]` | ユーザーを更新 |
| `geonic admin users delete <id>` | ユーザーを削除 |
| `geonic admin users activate <id>` | ユーザーを有効化 |
| `geonic admin users deactivate <id>` | ユーザーを無効化 |
| `geonic admin users unlock <id>` | ロックされたユーザーをアンロック |

#

### `admin policies`
XACML ポリシー管理。詳細は XACML ポリシーベース認可を参照してください。

| コマンド | 説明 |
|---------|-------------|
| `geonic admin policies list` | ポリシー一覧を取得 |
| `geonic admin policies get <id>` | ポリシーを取得 |
| `geonic admin policies create [json]` | ポリシーを作成 |
| `geonic admin policies update <id> [json]` | ポリシーを更新 |
| `geonic admin policies delete <id>` | ポリシーを削除 |
| `geonic admin policies activate <id>` | ポリシーを有効化 |
| `geonic admin policies deactivate <id>` | ポリシーを無効化 |

#

### `admin oauth-clients`
OAuth 2.0 クライアント管理。詳細は OAuth 2.0 M2M 認証を参照してください。

| コマンド | 説明 |
|---------|-------------|
| `geonic admin oauth-clients list` | OAuth クライアント一覧を取得 |
| `geonic admin oauth-clients get <id>` | OAuth クライアントを取得 |
| `geonic admin oauth-clients create [json]` | OAuth クライアントを作成 |
| `geonic admin oauth-clients update <id> [json]` | OAuth クライアントを更新 |
| `geonic admin oauth-clients delete <id>` | OAuth クライアントを削除 |

#

### `admin api-keys`
API キー管理。`tenant_admin` または `super_admin` ロールが必要です。詳細は API キー認証を参照してください。

| コマンド | 説明 |
|---------|-------------|
| `geonic admin api-keys list` | API キー一覧を取得 |
| `geonic admin api-keys get <id>` | API キーを取得 |
| `geonic admin api-keys create [json]` | API キーを作成 |
| `geonic admin api-keys update <id> [json]` | API キーを更新 |
| `geonic admin api-keys delete <id>` | API キーを削除 |

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
| `tenantId` | string | はい (super_admin) | 対象テナント ID。super_admin には必須。tenant_admin の場合はオプション (省略時は自身のテナント) |
| `allowedOrigins` | string[] | はい | CORS オリジン (最小 1、最大 20)。すべて許可する場合は `["*"]` を使用 |
| `policyId` | string | いいえ | 既存の XACML ポリシーにバインド (ターゲットはバイパスされます)。省略した場合、認可はテナントポリシー、次にロールのデフォルトにフォールバック (`api_key` のデフォルトは拒否) |
| `rateLimit` | object | いいえ | `{ perMinute: number }` (1~1000、デフォルト: 60) |

> **注意**: 平文の API キーは作成レスポンスの `key` フィールドで一度だけ返されます。安全に保管してください。

#

### `admin cadde`
CADDE (Connector Architecture for Decentralized Data Exchange) 設定管理。

| コマンド | 説明 |
|---------|-------------|
| `geonic admin cadde get` | CADDE 設定を取得 |
| `geonic admin cadde set [json]` | CADDE 設定を設定 |
| `geonic admin cadde delete` | CADDE 設定を削除 |

---

### `health`
```bash
geonic health
```

サーバーのヘルス状態を確認します (`GET /health`)。

### `version`
```bash
geonic version
```

CLI のバージョンとサーバーのバージョンを表示します (`GET /version`)。

### `me`
現在認証されているユーザーを表示し、ユーザーリソースを管理します。

```bash
geonic me
```

現在のユーザー情報、JWT トークンの有効期限 (期限切れの場合は赤、5 分以内に期限切れの場合は黄色)、およびアクティブなプロファイル名を表示します。

#

### `me oauth-clients`
自分の OAuth クライアントを管理します (`/me/oauth-clients`)。`admin oauth-clients` とは異なり、管理者権限は不要で、認証されたユーザーは誰でも自分のクライアントを管理できます。

| コマンド | 説明 |
|---------|-------------|
| `geonic me oauth-clients list` | OAuth クライアント一覧を表示 |
| `geonic me oauth-clients create [json]` | 新しい OAuth クライアントを作成 |
| `geonic me oauth-clients delete <id>` | OAuth クライアントを削除 |

**`me oauth-clients create` のオプション**:

| オプション | 説明 |
|--------|-------------|
| `--name <name>` | クライアント名 |
| `--policy <policyId>` | 既存の XACML ポリシーにバインド (ターゲットはバイパスされる)。省略した場合、認可はテナントポリシー、次にロールのデフォルト (`user` のデフォルトは GET のみ) にフォールバックされます |
| `--save` | 認証情報を設定ファイルに保存し、自動再認証を有効化 |

```bash
# Create an OAuth client with flags
geonic me oauth-clients create --name my-ci-bot --policy bot-access

# Create and save credentials for auto-reauth
geonic me oauth-clients create --name my-ci-bot --save

# Create from JSON
geonic me oauth-clients create '{"name":"my-bot","policyId":"bot-access"}'
```

`--save` が使用された場合、CLI は即座に Client Credentials グラントを実行し、`clientId`、`clientSecret`、および取得した `token` を設定ファイルに保存します。以降のトークン期限切れは自動的に処理されます。

#

### `me api-keys`
自分の API キーを管理します (`/me/api-keys`)。`admin api-keys` とは異なり、管理者権限は不要で、認証されたユーザーは誰でも自分のキーを管理できます。1 ユーザーあたり 5 つのキーに制限されています。

| コマンド | 説明 |
|---------|-------------|
| `geonic me api-keys list` | API キー一覧を表示 |
| `geonic me api-keys create [json]` | 新しい API キーを作成 |
| `geonic me api-keys delete <key-id>` | API キーを削除 |

**`me api-keys list` のオプション**: `--limit <n>`、`--offset <n>`、`--count`
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
WP-CLI スタイルのヘルプで、段階的に詳細を表示します。

```bash
geonic help                    # All commands overview
geonic help entities           # Command group details
geonic help entities list      # Subcommand details with options and examples
geonic help admin tenants      # Nested command help
```

`--help` フラグは、すべてのコマンドでも使用できます。

---

## シェル補完

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

補完機能は、サブコマンド名、オプションフラグ、および `--format` の値候補 (`json`、`table`、`geojson`) をサポートしています。

---

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
