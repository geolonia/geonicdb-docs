---
title: SaaS クイックスタート
description: GeonicDB SaaS 6 ステップオンボーディングフローの概要 — お問い合わせから最初の API 呼び出しまで。
outline: deep
---

# SaaS クイックスタート

GeonicDB SaaS は **Sales-led（担当者主導）の招待制** オンボーディングモデルを採用しています。このページでは、アクセス申請から最初の API 呼び出しまでの 6 ステップの全体フローを説明します。

::: tip 招待制アクセス
GeonicDB SaaS は現在 **招待制の限定リリース** として提供されています。セルフサービスのサインアップはありません。アクセスを申請するには [Geolonia へお問い合わせ](https://www.geolonia.com/contact/) ください。
:::

## 6 ステップ オンボーディングフロー

```text
┌──────────────────────────────────────────────────────────────────┐
│  ステップ 1  お問い合わせ（Contact Sales）  →  sign-up.md        │
│  ステップ 2  Geolonia からの連絡           →  onboarding.md      │
│  ステップ 3  認証情報の提供               →  onboarding.md       │
│  ステップ 4  テナント管理ユーザー作成     →  tenant-admin-user.md (CLI) │
│  ステップ 5  API キー作成                 →  api-key.md     (CLI) │
│  ステップ 6  最初の API 呼び出し          →  first-call.md       │
└──────────────────────────────────────────────────────────────────┘
```

### ステップ 1 — お問い合わせ（Contact Sales）

Geolonia の Web サイトからお問い合わせを送信します。ユースケース、組織、希望リージョンを記入してください。

→ [サインアップ](/ja/saas/sign-up)

### ステップ 2 — Geolonia からの連絡

Geolonia は申請内容を確認し（通常 1〜2 営業日以内）、ユースケースを確認して承認の連絡をします。

→ [オンボーディング](/ja/saas/onboarding)

### ステップ 3 — アカウント情報の提供

テナントのプロビジョニングが完了すると、Geolonia から Admin API エンドポイント URL、管理者ユーザー名、一時パスワード、テナント名が送付されます。

→ [オンボーディング](/ja/saas/onboarding)

### ステップ 4 — テナント管理ユーザーの作成（CLI）

`geonic` CLI を使用して、提供された認証情報でログインし、組織のテナント管理ユーザーを作成します。

→ [テナント管理ユーザー](/ja/saas/tenant-admin-user)

### ステップ 5 — API キーの作成（CLI）

`geonic` CLI を使用して、アプリケーションの API リクエストを認証するための API キーを作成します。

→ [API キー](/ja/saas/api-key)

### ステップ 6 — 最初の API 呼び出し

API キーを使用して GeonicDB API に最初のリクエストを送信し、設定が正しく動作していることを確認します。

→ [最初の API 呼び出し](/ja/saas/first-call)

## 次のステップ

6 ステップを完了したら、GeonicDB SaaS のその他の機能を試してみましょう：

- [コンソール](/ja/saas/console) — 管理コンソールの概要（Coming Soon）
- [デモアプリ](/ja/saas/demo-app) — ライブデモアプリケーションを試す
- [最初のエンティティ](/ja/saas/first-entity) — ステップバイステップの CRUD チュートリアル
