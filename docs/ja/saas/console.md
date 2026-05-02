---
title: コンソール
description: GeonicDB SaaS 管理コンソール（app.geonicdb.com）の概要 — 現在 Coming Soon。
outline: deep
---

# コンソール

GeonicDB 管理コンソールは、SaaS アカウント、テナント、API キーを管理するための Web インターフェースです。

::: warning Coming Soon
`app.geonicdb.com` のコンソールは現在開発中のため、**まだ一般提供されていません**。

現在のプレビュー期間中は、アカウント設定と API キー管理は Geolonia のアカウント担当者が直接サポートします。サポートが必要な場合は [Geolonia へお問い合わせ](https://www.geolonia.com/contact/) ください。
:::

## コンソールで提供予定の機能

リリース後、コンソールでは以下の機能が利用できます：

### アカウント管理

- 組織プロファイルの表示・編集
- チームメンバーの招待・管理
- ユーザーごとの役割ベースアクセス制御（RBAC）設定

### テナント管理

- テナントの作成・設定
- テナントごとのクォータと制限の設定
- テナント使用状況の表示（エンティティ数、API 呼び出し量、ストレージ）

### API キー管理

- 新しい API キーの生成
- キースコープの設定（読み取り専用、読み書き、管理者）
- キーのローテーションと無効化
- キーごとの使用ログの表示

### モニタリングダッシュボード

- リアルタイム API 呼び出しメトリクス
- エンティティ数と種別の分布
- 通知設定のステータス概要
- エラー率とレイテンシのグラフ

### データエクスプローラー

- テナント横断でエンティティを閲覧
- UI 上での NGSIv2 アドホッククエリの実行
- アクティブな通知設定の表示・管理
- JSON または CSV 形式でのデータエクスポート

## 現在は CLI をご利用ください

コンソールが利用可能になるまで、**`geonic` CLI** でアカウントを管理できます：

| 操作 | CLI コマンド |
|------|------------|
| テナントの作成 | `geonic admin tenants create` |
| ユーザーの作成 | `geonic admin users create` |
| API キーの発行 | `geonic admin api-keys create` |
| API キーのローテーション | `geonic admin api-keys update <id>` |
| API キー一覧の確認 | `geonic admin api-keys list` |

→ [テナント管理ユーザー](/ja/saas/tenant-admin-user) — テナントとユーザー設定の CLI ガイド

→ [API キー](/ja/saas/api-key) — API キー作成の CLI ガイド

CLI でまだサポートされていない操作については、[https://www.geolonia.com/contact/](https://www.geolonia.com/contact/) から Geolonia のアカウント担当者にお問い合わせください。

## 次のステップ

- [テナント管理ユーザー](/ja/saas/tenant-admin-user) — CLI でユーザーを作成
- [API キー](/ja/saas/api-key) — CLI で API キーを作成
- [最初の API 呼び出し](/ja/saas/first-call) — 最初のリクエストを送る
- [サインアップ](/ja/saas/sign-up) — GeonicDB SaaS アカウントの申請
