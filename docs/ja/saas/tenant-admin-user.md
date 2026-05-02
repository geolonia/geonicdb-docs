---
title: テナント管理ユーザー
description: geonic CLI を使用して GeonicDB SaaS テナントの管理ユーザーを作成する方法。
outline: deep
---

# テナント管理ユーザー

SaaS オンボーディングフローのステップ 4：`geonic` CLI を使用してテナントを作成し、API キーとアクセス制御を管理するための管理ユーザーを作成します。

::: tip SaaS オンボーディングフローのステップ 4
1. ~~[Contact Sales（お問い合わせ）](/ja/saas/sign-up)~~
2. ~~[Geolonia からの連絡 + 認証情報の提供](/ja/saas/onboarding)~~
3. ~~アカウント情報の提供~~
4. **テナント管理ユーザーの作成** ← *現在のステップ*
5. [API キーの作成](/ja/saas/api-key)
6. [最初の API 呼び出し](/ja/saas/first-call)
:::

## 前提条件

- `geonic` CLI のインストール — インストール手順は [CLI リファレンス](/ja/reference/cli) を参照
- [オンボーディング](/ja/saas/onboarding) ステップで受け取った Admin エンドポイント URL、管理者ユーザー名、管理者パスワード

## CLI のインストール

```bash
npm install -g @geolonia/geonicdb-cli
```

インストールを確認：

```bash
geonic --version
```

## CLI の設定

CLI が GeonicDB Admin API エンドポイントを参照するように設定します：

```bash
geonic config set url https://your-geonicdb-admin.example.com
```

`https://your-geonicdb-admin.example.com` は Geolonia から提供された Admin エンドポイント URL に置き換えてください。

## 管理者認証情報でログイン

```bash
geonic auth login
```

プロンプトが表示されたら、オンボーディング時に提供された **管理者ユーザー名** と **管理者パスワード** を入力します。

## テナントの作成

組織のテナントがまだ作成されていない場合は、以下のコマンドで作成します：

```bash
geonic admin tenants create '{
  "id": "my-company",
  "displayName": "My Company"
}'
```

`my-company` は任意のテナント識別子に置き換えてください（半角英数字とハイフンのみ使用可能）。

テナントが作成されたことを確認：

```bash
geonic admin tenants list
```

成功した場合の出力例：

```json
[
  { "id": "my-company", "displayName": "My Company", "createdAt": "2026-01-01T00:00:00.000Z" }
]
```

::: details テナント作成でエラーが出た場合
| エラー | 原因 | 対処 |
|-------|------|------|
| `401 Unauthorized` | 認証トークンが無効または期限切れ | `geonic auth login` で再ログイン |
| `409 Conflict` | 同じ ID のテナントが既に存在する | 別のテナント ID を使用するか、既存テナントを確認 |
:::

## テナント管理ユーザーの作成

テナントに `tenant_admin` ロールを持つユーザーを作成します：

```bash
read -s -p "Password: " ADMIN_PASS && \
geonic admin users create '{
  "username": "admin@my-company.com",
  "password": "'"$ADMIN_PASS"'",
  "tenantId": "my-company",
  "roles": ["tenant_admin"]
}' && \
unset ADMIN_PASS
```

::: tip
`read -s` を使うことでパスワードが画面に表示されず、シェル履歴にも残りません。`tenant_admin` ロールは、テナントの API キー、エンティティ、サブスクリプションに対する完全な管理権限を付与します。
:::

ユーザーが作成されたことを確認：

```bash
geonic admin users list
```

成功した場合の出力例：

```json
[
  {
    "username": "admin@my-company.com",
    "tenantId": "my-company",
    "roles": ["tenant_admin"],
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
]
```

::: details ユーザー作成でエラーが出た場合
| エラー | 原因 | 対処 |
|-------|------|------|
| `401 Unauthorized` | 認証トークンが無効または期限切れ | `geonic auth login` で再ログイン |
| `409 Conflict` | 同じユーザー名が既に存在する | 別のユーザー名を使用するか、既存ユーザーを確認 |
| `400 Bad Request` | リクエスト形式が不正（JSON 構文エラー等） | JSON の形式を確認してから再実行 |
:::

## 次のステップ

テナントと管理ユーザーの設定が完了しました。次に API リクエストの認証に使用する API キーを作成します。

→ [API キーの作成](/ja/saas/api-key)
