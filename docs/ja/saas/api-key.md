---
title: API キー
description: geonic CLI を使用して GeonicDB SaaS の API キーを作成する方法 — オンボーディングフローのステップ 5。
outline: deep
---

# API キー

SaaS オンボーディングフローのステップ 5：`geonic` CLI を使用して、アプリケーションの GeonicDB API リクエストを認証するための API キーを作成します。

::: tip SaaS オンボーディングフローのステップ 5
1. ~~[Contact Sales（お問い合わせ）](/ja/saas/sign-up)~~
2. ~~[Geolonia からの連絡 + 認証情報の提供](/ja/saas/onboarding)~~
3. ~~アカウント情報の提供~~
4. ~~[テナント管理ユーザーの作成](/ja/saas/tenant-admin-user)~~
5. **API キーの作成** ← *現在のステップ*
6. [最初の API 呼び出し](/ja/saas/first-call)
:::

## 前提条件

- `geonic` CLI のインストールと設定完了 — [テナント管理ユーザー](/ja/saas/tenant-admin-user) を参照
- `tenant_admin` または `super_admin` ユーザーとしてログイン済み

## API キーの作成

`geonic admin api-keys create` コマンドで新しい API キーを作成します：

```bash
geonic admin api-keys create '{
  "name": "my-app-key",
  "tenantId": "my-company"
}'
```

コマンドの出力に新しい API キーの値が表示されます。**コピーして安全な場所に保管してください** — 初回以降は表示されません。

成功した場合の出力例：

```json
{
  "id": "key_01abc...",
  "name": "my-app-key",
  "tenantId": "my-company",
  "value": "gdb_live_xxxxxxxxxxxxxxxxxxxx",
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

### よくあるエラーと対処

| エラー | 原因 | 対処 |
|-------|------|------|
| `401 Unauthorized` | 認証トークンが無効または期限切れ | `geonic auth login` で再ログイン |
| `403 Forbidden` | 必要な権限（`tenant_admin` / `super_admin`）がない | 管理者に権限の付与を依頼 |
| `409 Conflict` | 同名の API キーが既に存在する | 別の名前を使用するか、既存のキーを削除してから再作成 |

### レートリミット付きキーの作成

```bash
geonic admin api-keys create '{
  "name": "my-sensor-key",
  "tenantId": "my-company",
  "rateLimit": { "perMinute": 120 }
}'
```

### 既存の API キー一覧を確認

```bash
geonic admin api-keys list
```

## API キーの使い方

すべての API 呼び出しで、`x-api-key` リクエストヘッダーに API キーを含めてください：

```bash
export GEONICDB_API_KEY="YOUR_API_KEY"
export GEONICDB_TENANT="my-company"

curl -X GET "https://geonicdb.geolonia.com/v2/entities" \
  -H "x-api-key: $GEONICDB_API_KEY" \
  -H "Fiware-Service: $GEONICDB_TENANT"
```

::: info API URL について
GeonicDB SaaS の API エンドポイント `https://geonicdb.geolonia.com` は、現在のプレビュー期間中に変更される場合があります。変更がある場合はアカウント担当者からご連絡いたします。
:::

### 必須ヘッダー

| ヘッダー | 説明 | 例 |
|---------|------|-----|
| `x-api-key` | GeonicDB API キー | `x-api-key: gdb_live_...` |
| `Fiware-Service` | テナント名 | `Fiware-Service: my-company` |
| `Fiware-ServicePath` | スコープパス（省略可、デフォルト `/`） | `Fiware-ServicePath: /sensors` |

## セキュリティのベストプラクティス

- **API キーをバージョン管理にコミットしない**こと
- **環境変数**を使ってランタイムにキーを注入する
- **定期的にキーをローテーション** — `geonic admin api-keys update` を使用
- **漏洩したキーは直ちに削除** — `geonic admin api-keys delete <id>` を使用

## 次のステップ

API キーが準備できたら、最初の API 呼び出しを行って設定を確認します。

→ [最初の API 呼び出し](/ja/saas/first-call)
