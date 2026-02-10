---
title: セットアップ
description: Vela OS SaaS API へのアクセス方法 — エンドポイント URL、API キー設定、推奨 HTTP クライアント、SDK の提供予定。
outline: deep
---

# セットアップ

Vela OS はマネージド SaaS サービスとして提供されます。ソフトウェアのインストールは不要 — HTTP API コールでアクセスできます。

## API エンドポイント

| API | ベース URL |
|-----|----------|
| **NGSIv2** | `https://api.vela.geolonia.com/v2/` |
| **NGSI-LD** | `https://api.vela.geolonia.com/ngsi-ld/v1/` |
| **Admin** | `https://api.vela.geolonia.com/admin/` |
| **MCP** | `https://api.vela.geolonia.com/mcp` |
| **データカタログ** | `https://api.vela.geolonia.com/catalog/` |
| **ヘルスチェック** | `https://api.vela.geolonia.com/health` |
| **バージョン** | `https://api.vela.geolonia.com/version` |

## API キー

すべての API リクエストには認証用の `x-api-key` ヘッダーが必要です。

::: tip 準備中
API キーの登録機能は現在準備中です。利用可能になり次第、以下の手順で取得できます：

1. Vela OS ダッシュボードでサインアップ
2. プロジェクトを作成
3. API キーを生成
4. `x-api-key` ヘッダーでキーを使用
:::

### 認証ヘッダー

すべてのリクエストに API キーを含めます：

```bash
curl https://api.vela.geolonia.com/v2/entities \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: myproject"
```

### テナント分離

`Fiware-Service` ヘッダーでテナント（プロジェクト）を指定します。テナント間でデータは完全に分離されます。

```bash
# テナント A のデータ
curl https://api.vela.geolonia.com/v2/entities \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: tenant-a"

# テナント B のデータ（完全に別）
curl https://api.vela.geolonia.com/v2/entities \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: tenant-b"
```

## 推奨 HTTP クライアント

### curl（コマンドライン）

Vela とのやり取りの最もシンプルな方法です。このドキュメントの全サンプルは curl を使用しています。

```bash
# 接続確認
curl https://api.vela.geolonia.com/version
```

### Postman

[Postman](https://www.postman.com/) は API 探索用のグラフィカルインターフェースを提供します：

1. ベース URL を `https://api.vela.geolonia.com` に設定
2. ヘッダーを追加：
   - `x-api-key`: API キー
   - `Fiware-Service`: テナント名
   - `Content-Type`: `application/json`（POST/PATCH/PUT 時）
3. OpenAPI 仕様をインポートしてリクエストテンプレートを自動生成：
   ```text
   https://api.vela.geolonia.com/openapi.json
   ```

### HTTPie

[HTTPie](https://httpie.io/) は curl のユーザーフレンドリーな代替ツールです：

```bash
# インストール
pip install httpie

# リクエスト例
http GET https://api.vela.geolonia.com/v2/entities \
  x-api-key:YOUR_API_KEY \
  Fiware-Service:myproject
```

### VS Code REST Client

[REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) 拡張機能を使えば、VS Code から直接 HTTP リクエストを送信できます：

```http
### 全エンティティを取得
GET https://api.vela.geolonia.com/v2/entities
x-api-key: YOUR_API_KEY
Fiware-Service: myproject
```

## AI エージェント連携

### Claude Desktop（MCP）

Claude Desktop を Vela の MCP サーバーに接続して、AI によるデータ操作を実現します：

```json
{
  "mcpServers": {
    "vela": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://api.vela.geolonia.com/mcp",
        "--header",
        "x-api-key: YOUR_API_KEY",
        "--header",
        "Fiware-Service: myproject"
      ]
    }
  }
}
```

### OpenAI / Claude API（tools.json）

AI API で使用するツール定義を取得します：

```bash
curl https://api.vela.geolonia.com/tools.json
```

返される JSON は Claude Tool Use や OpenAI Function Calling のツール定義としてそのまま使用できます。

## SDK（将来予定）

::: info 計画中
以下の言語の公式 SDK を計画しています：

- **JavaScript / TypeScript**（npm）
- **Python**（pip）
- **Go**（module）

SDK が利用可能になるまでは、REST API と標準 HTTP クライアントをご利用ください。
:::

## レート制限

::: tip 準備中
レート制限の詳細は SaaS サービスの開始時に公開されます。API は標準的な HTTP 429（Too Many Requests）レスポンスと `Retry-After` ヘッダーを使用します。
:::

## 次のステップ

- [はじめてのエンティティ](/ja/getting-started/first-entity) — エンティティの作成と管理
- [デモアプリ](/ja/getting-started/demo-app) — インタラクティブなデモアプリケーション
- [クイックスタート](/ja/introduction/quick-start) — CRUD の高速ウォークスルー
