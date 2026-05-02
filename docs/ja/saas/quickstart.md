---
title: SaaS クイックスタート
description: アカウント申請から初めての GeonicDB API 呼び出しまで 5 分でわかるオンボーディングガイド。
outline: deep
---

# SaaS クイックスタート

このガイドでは、GeonicDB SaaS アカウントの申請から最初の API 呼び出しまでの全体の流れを説明します。

::: tip 招待制アクセス
GeonicDB SaaS は現在 **招待制の限定リリース** として提供されています。アクセスは Geolonia チームによる審査・承認が必要です。アカウントを申請するには [Geolonia へお問い合わせ](https://www.geolonia.com/contact/) ください。
:::

## 全体の流れ

```text
┌──────────────────────────────────────────────────────────┐
│  1. アクセス申請   →  Geolonia へ問い合わせ              │
│  2. 招待受信       →  アカウントを有効化                  │
│  3. コンソール確認 →  app.geonicdb.com（Coming Soon）    │
│  4. API キー取得   →  招待メールからコピー                │
│  5. 初 API 呼び出し →  GET /v2/entities                  │
└──────────────────────────────────────────────────────────┘
```

認証情報が揃えば、最初の API 呼び出しまでおよそ 5 分で完了します。

## ステップ 1: アクセスを申請する

GeonicDB SaaS はセルフサービスでのサインアップには対応していません。始めるには：

1. [https://www.geolonia.com/contact/](https://www.geolonia.com/contact/) にアクセス
2. 問い合わせ種別で **GeonicDB SaaS** を選択
3. ユースケースを記入（環境データ、IoT、スマートシティなど）
4. Geolonia から 1〜2 営業日以内に返信いたします

承認されると、アカウント設定手順が記載された招待メールが届きます。

## ステップ 2: アカウントを有効化する

招待メールの手順に従って以下を設定します：

- GeonicDB SaaS アカウントのパスワードを設定
- テナント名（例：`my-company`）を確認

また、**API キー** が直接発行されます — 安全な場所に保管してください。

## ステップ 3: コンソールにアクセスする

GeonicDB の管理コンソールは `app.geonicdb.com` で提供予定です。

::: warning Coming Soon
`app.geonicdb.com` のセルフサービスコンソールは現在開発中のため、まだ一般提供されていません。現在のプレビュー期間中は、Geolonia のアカウント担当者がオンボーディング時にアカウント設定をサポートします。
:::

コンソールの機能詳細については [コンソール](/ja/saas/console) をご参照ください。

## ステップ 4: API キーを取得する

API キーはオンボーディング時に発行されます。キーのローテーションや再発行が必要な場合：

- Geolonia のアカウント担当者にご連絡ください
- または、コンソールが利用可能になった後はコンソールから管理できます

詳細は [API キー](/ja/saas/api-key) をご覧ください。

## ステップ 5: 最初の API 呼び出しを行う

API キーが手元にあれば、GeonicDB API にリクエストを送信できます：

```bash
export GEONICDB_API_KEY="YOUR_API_KEY"
export GEONICDB_TENANT="YOUR_TENANT"

curl -X GET "https://geonicdb.geolonia.com/v2/entities" \
  -H "x-api-key: $GEONICDB_API_KEY" \
  -H "Fiware-Service: $GEONICDB_TENANT"
```

::: info API URL について
GeonicDB SaaS の API エンドポイント `https://geonicdb.geolonia.com` は、現在のプレビュー期間中に変更される場合があります。変更がある場合はアカウント担当者からご連絡いたします。
:::

テナントにエンティティがまだない場合、`200 OK` と空の配列 `[]` が返ります。

## 次のステップ

- [サインアップ](/ja/saas/sign-up) — アカウント申請の詳細手順
- [コンソール](/ja/saas/console) — 管理コンソールの概要
- [API キー](/ja/saas/api-key) — API キーの管理
- [最初の API 呼び出し](/ja/saas/first-call) — コードサンプル付きの詳細ガイド
- [最初のエンティティ](/ja/saas/first-entity) — エンティティ CRUD のステップバイステップ チュートリアル
