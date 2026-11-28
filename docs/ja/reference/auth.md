---
title: "Authentication Guide"
description: "GeonicDB authentication and authorization guide"
outline: deep
---
# 認証と認可ガイド

このドキュメントでは、GeonicDB の認証と認可機能の全体像、セットアップ、および管理について説明します。

## 目次


* [概要](#overview)
  
* [認証アーキテクチャ](#認証アーキテクチャ)
  
* [初期セットアップ](#初期セットアップ)
  
* [ユーザーとテナント管理](#user--tenant-management)
  
* [API キー認証](#api-キー認証)
  
  * [API キートークン交換(Browser SDK)](#api-key-token-exchange-browser-sdk)
    
  * [DPoP トークンバインディング(RFC 9449)](#dpop-token-binding-rfc-9449)
    
* [OAuth 2.0 M2M 認証](#oauth-20-m2m-認証)
  
* [現在のプリンシパル(`GET /me`)](#current-principal-get-me)
  
* [OIDC 外部 IdP 認証](#oidc-外部-idp-認証)
  
* [XACML ポリシーベース認可](#xacml-ポリシーベース認可)
  
* [認証シナリオリファレンス](#認証シナリオリファレンス)
  
* [トラブルシューティング](#トラブルシューティング)

***

## 概要

GeonicDB は JWT ベースの認証と認可機能を提供します。

### ロール構成

| Role             | Description                                                                 | Permissions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `platform_admin` | Geolonia operator; IAM-exchanged token (`POST /auth/platform-token`, #3495) | Only `/admin/deployments*`, `/admin/users` (super\_admin rows), `/admin/metrics`, and `/me`. Tenants, API keys, policies, quotas, IP restrictions, CADDE, memberships, and other admin APIs return 403 (#3817). Same data-API deny-fence as `super_admin`. Can assign `super_admin` only. Not a row you can assign with `POST /admin/users`.                                                                                                                                                    |
| `super_admin`    | Customer's top administrator (Geolonia may operate it under contract)       | `/admin/*`, `/auth/*`, `/me/*`, monitoring endpoints (`/statistics`, `/metrics`, `/cache/statistics`) only. **Cannot** access data APIs (`/v2/*`, `/ngsi-ld/*`, `/catalog*`, `/rules*`) — returns 403. Can assign `tenant_admin` and `user` only; **cannot** create, delete, or demote another `super_admin` (`platform_admin` does that). **Cannot** call platform APIs such as `/admin/deployments` (`isPlatformAdmin` stays the environment principal, or an IAM-exchanged `platform_admin`) |
| `tenant_admin`   | Tenant administrator                                                        | Full access within the assigned tenant (admin + data APIs)                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `user`           | General user                                                                | Read-only by default (GET only). Custom XACML policies can grant write access                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `anonymous`      | Unauthenticated user                                                        | Denied by default. Explicit XACML Permit policy required. No feature flag needed (#748)                                                                                                                                                                                                                                                                                                                                                                                                         |

> **注**: `super_admin` は SaaS セキュリティのためプラットフォーム管理操作に制限されています。
> 顧客データの分離が強制されます — `super_admin` 資格情報を持つ Geolonia スタッフは、テナントエンティティデータにアクセスできません。
> 詳細は [#674](https://github.com/geolonia/geonicdb/issues/674) を参照してください。

4 つの階層があります: `platform_admin`(Geolonia) / `super_admin`(顧客の最上位管理者; Geolonia が契約下で操作することもあります) / `tenant_admin` / `user`。`deployment_admin` は削除され、`super_admin` に置き換えられました(#3807; 互換性期間はありません — `deployment_admin` の入力は 400 になります)。

権限チェックは、呼び出し元で `role` を比較する代わりに、`src/core/auth/role-predicates.ts` の `isDeploymentAdmin` / `isPlatformAdmin` / `isAdminSurfacePrincipal` を呼び出します。`isDeploymentAdmin` / `DEPLOYMENT_ADMIN_ROLES` は `super_admin` のみです(#3817)。`isAdminSurfacePrincipal` はそのセットに加えて `platform_admin` です(Admin API エントリ(データ API の checkTenantAccess の横断許可は super\_admin のみ。#3817))。`isPlatformAdmin` は `role === platform_admin` または環境プリンシパル(`role` が `super_admin` で id が `ENV_SUPER_ADMIN_USER_ID`)です。デプロイメントデータベースに格納された `super_admin` 行はプラットフォームプリンシパルではありません。`/admin/deployments` は `isPlatformAdmin` を使用します(#3458)。データ API の拒否フェンスは `DATA_API_DENY_FENCE_ROLES`(`super_admin`、`platform_admin`)と一致します。どのロールを誰が割り当てまたは管理できるかは、同じモジュール内の `ASSIGNABLE_ROLES_BY_ACTOR` で定義されています: `super_admin` → `tenant_admin`、`user`; `platform_admin` → `super_admin`; `tenant_admin` → `user`。`super_admin` は、同じレベルの `super_admin` を作成、削除、または降格することはできません。

### platform\_admin の制限(#3459 ステージ ⑤ / #3817、常に強制)

`platform_admin` は `/admin/deployments*`、顧客の `super_admin`(`/admin/users` は `super_admin` 行に限定)、および `/admin/metrics` のみを保持します; `/auth/*` と `/me` は `/admin` の外にあり、影響を受けません。テナント、API キー、OAuth クライアント、ポリシー、クォータ、IP 制限、CADDE、メンバーシップ、およびその他のロールのユーザー行は `super_admin` に属し、`platform_admin` には 403 を返します。モード切り替えはありません: 以前の `PLATFORM_ADMIN_NARROW_MODE` env は削除され、まだ設定されていても無視されます(`warn` を設定しても広範なアクセスは復元されません — コードを戻すことによってのみロールバックできます)。拒否された操作は `platform_admin narrowed operation denied` というログと、監査イベント `PLATFORM_ADMIN_NARROWED_DENIED`(ステータス 403)を書き込みます。パスチェックは `PolicyService.authorize` にあるため、HTTP、MCP、A2A、および WebSocket のすべてがこれを強制します; ロールチェックは `UserService` にあります。`role` なしで `/admin/users` をリストアップすると `super_admin` に制限されます; 明示的な他の `role` フィルタは空のリストを返します。`/admin/users/{userId}/tenants`(メンバーシップ)は、どのターゲットに対しても拒否されます。環境 `super_admin` プリンシパルはここでは変更されません(ステージ ⑥)。IAM はローカルで再現できないため、この動作は E2E ではなくユニットテストで固定されています。

### プラットフォーム管理トークン(`POST /auth/platform-token`

)

SigV4(このメソッドのみの API Gateway `AWS_IAM`)は、許可された IAM 呼び出し元を 15 分間の Bearer アクセストークンと交換します。`refreshToken` はありません。`sub` と `user.id` は、トリムなしの `requestContext.identity.userArn` です。許可リストは、`geonicdb-<env>` JSON シークレットの `PLATFORM_ADMIN_ARNS` キーです: それらの userArn 文字列の JSON 配列、またはそのような JSON 配列を保持する文字列(1 回解析され、同じ方法でチェックされます)。カンマ区切りリストではなく、SAM パラメータでもありません。未設定、空、読み取り不可、無効な JSON、または空でない文字列の配列でない場合、userArn が欠落しているか、リストにない場合と同じ 403 ですべてを拒否します。ヘッダーまたはボディで ARN を提供することはできません。`userArn` のない呼び出しは、シークレットが読み取られる前に拒否されます。拒否された呼び出しは、理由と呼び出し元の `userArn` のみを含む `platform admin token denied` をログに記録し、監査イベント `PLATFORM_ADMIN_TOKEN_DENIED`(アクター id = `userArn` または `unknown`、`clientIp`、`correlator`)を書き込みます; 許可リストの内容は決してログに記録されません。成功した呼び出しは `PLATFORM_ADMIN_TOKEN_ISSUE` を書き込みます。`event.resource` は `/auth/platform-token` でなければなりません; 他のリソーステンプレートは同じ 403 です。

このメソッドは `Auth.InvokeRole` を `NONE` に設定します。呼び出し元は `execute-api:Invoke` のみを受け取ります。`lambda:InvokeFunction` を付与しないでください。省略されたデフォルトは `CALLER_CREDENTIALS` で、そのアクションを必要とし、呼び出し元が偽造された `identity.userArn` で Lambda を直接呼び出し、API Gateway IAM 認証をバイパスできるようにします。

引き受けられたロールの `userArn` は `arn:aws:sts::<account>:assumed-role/<role-name>/<session>` であり、IAM ロール ARN ではありません。一致にはセッション名が含まれ、正確です。SSO パーミッションセットの場合、セッション名はユーザーのサインイン名なので、エントリは 1 人の人物です。`sts:AssumeRole` で取得されたロール(例: CI GitHub OIDC ロール)の場合、呼び出し元がセッション名を選択するため、1 つのセッション ARN をリストに記載することは、実際にはそのロールを引き受けることができるすべての人を信頼することになります。ロールの信頼ポリシーで `sts:RoleSessionName` を固定するか、そのエントリをロール全体への信頼として扱うかのどちらかです。SSO パーミッションセットを再構築すると、ロール名の 16 進数が変わるため、リストされているすべての ARN が一致しなくなります。API リソースポリシー([geonicdb-infra-cdk#220](https://github.com/geolonia/geonicdb-infra-cdk/issues/220))はパス修飾ロール ARN を使用します; その文字列は `userArn` と一致しません。

このトークンで作成された API キー、OAuth クライアント、およびグローバルポリシーは、15 分後も残ります。トークン自体は依然として署名、有効期限、`type: access`、およびトークン無効化フロアを通過します。`GET /me` は ARN を `id` として、`role: platform_admin` として、そして null のテナントフィールドを返します — ARN をユーザー行として検索しません。`platform_admin` は `super_admin` 行を作成および管理します(#3807)ので、15 分間のトークンは永続的な `super_admin` ログインを生成できます: 選択したパスワードで `super_admin` ユーザーを作成するか、既存の `super_admin` のパスワードをリセットして一時パスワードを受け取ることができます。いずれにせよ、結果はリフレッシュトークンを持つ通常の `super_admin` ログインであり、15 分間のトークンが期限切れになった後も機能し続けます(#3621)。これがアカウントが顧客に引き渡される方法です。これを確認するには、アクター id が ARN である `USER_CREATE`、`USER_UPDATE`、および `USER_PASSWORD_RESET` 監査エントリを探してください。

呼び出し元の削除は即座には行われません。`PLATFORM_ADMIN_ARNS` から ARN を削除すると、各ウォーム Lambda の Secrets Manager キャッシュが期限切れになった後(最大 5 分)にのみ新しいトークンが停止します。すでに発行されたトークンは許可リストに対して再度チェックされないため、期限が切れるまで(最大 15 分)有効なままです。新しいトークンを一度に停止するには、IAM 側で対処し、ARN の削除に加えてそれを行います。SSO パーミッションセットからユーザーを削除するか、ロールから `execute-api:Invoke` を削除しても、すでに存在する IAM ロールセッションは終了しません; SSO ロールセッションは最大 12 時間続く可能性があり、その `userArn` がまだリストされている間は、新しい 15 分間のトークンを取得し続けることができます。IAM で管理するロール(例: CI OIDC ロール)の場合、ロールに対して、既存のセッションをスコープとしたトークンルート上の `execute-api:Invoke` に対する明示的な Deny をアタッチします(例: 条件 `aws:TokenIssueTime` が今より早い、これは IAM コンソールの「アクティブなセッションを取り消す」が追加するもの、または `aws:userid` がセッションと一致する)。SSO ロール(`AWSReservedSSO_*`)は IAM で編集できず、「アクティブなセッションを取り消す」はそれに適用されません。SSO の場合、IAM Identity Center でユーザーのアクティブなセッションを削除し、適用されるポリシーを通じて、トークンルート上の `execute-api:Invoke` に対する Deny を追加します: パーミッションセットのインラインポリシー(その後、ロールが取得できるようにパーミッションセットを再プロビジョニングします)、SCP、または API Gateway リソースポリシー(その後、ステージを再デプロイします; リソースポリシーは API のすべてのメソッドをカバーするため、Deny をトークンルートにスコープします)。Identity Center セッションを削除するだけでは、すでに発行された STS 認証情報は取り消されません。1 人を停止するには、`aws:userid` を一致させます。これは、引き受けられたロールの場合、`<role id>:<session name>`(SSO の場合、`<role id>:<sign-in name>`)です。このために `aws:PrincipalArn` を使用しないでください: 引き受けられたロールの場合、それはロール ARN であり、セッション ARN ではないため、セッション ARN は決して一致せず、Deny は何もせずに黙っています。一方、ロール ARN はそのロールを使用するすべての人を停止します。ロール全体を停止するつもりのときだけ `aws:PrincipalArn` を使用してください。その後、効果があったことを確認します: 古いセッションでの SigV4 `POST /auth/platform-token` は API Gateway から 403 を返します。すでに発行された GeonicDB トークンは、期限が切れるまで(最大 15 分)有効なままです。最悪の場合、削除された呼び出し元は、許可リストの変更後約 20 分間 `platform_admin` トークンを使い続けます: 最大 5 分間のシークレットキャッシュ、プラス最後に取得したトークンの最大 15 分間。その制限は `platform_admin` トークン自体のみをカバーします。呼び出し元がそれで作成したものは、これらのステップでは取り消されず、別途見つけて削除する必要があります。監査ログで、アクター id が呼び出し元の ARN であるエントリを検索し、その後、環境スーパー管理者として、または別の `platform_admin`(`super_admin` は `super_admin` ユーザーを管理できません)として: `POST /admin/users/{userId}/deactivate` で作成またはリセットしたユーザーを無効化し(これにより、キー、クライアント、およびトークンも取り消されます)、`DELETE /admin/api-keys/{keyId}` で API キーを削除し、`DELETE /admin/oauth-clients/{clientId}` で OAuth クライアントを削除し、`POST /admin/policies/{policyId}/deactivate` または `DELETE /admin/policies/{policyId}` でポリシーを無効化または削除します。トークンを使用した `POST /auth/logout` は、その ARN のトークンを無効にしますが、トークン保持者のみがそれを呼び出すことができます。自分以外の ARN のトークンを即座に無効化する管理 API はありません; 必要な場合は、最初に `invalidateAllUserTokens` を呼び出す監査されたエントリポイントを追加してください。`JWT_SECRET` をローテーションすると、すべてのプリンシパルのすべてのトークンが無効になります。

ステージングチェック(IAM はローカルサーバーでは再現できません): userArn が配列にあるロールを引き受け、空のボディで SigV4 `POST /auth/platform-token` を実行し、200 と `expiresIn: 900` を期待します。その Bearer トークンで `GET /admin/deployments` が成功します。`GET /ngsi-ld/v1/entities` は 403 を返します。userArn が配列にない呼び出し元は、トークンルートから 403 を受け取ります。これは、欠落している userArn と同じボディです。呼び出し元ロールが制御プレーン関数に対する `lambda:InvokeFunction` を持たないことを確認します。このステージングチェックは、この変更においてライブ IAM プリンシパルに対して実行されていません。

### プロビジョニングチェーン (#3459 ステージ ④)

各ロールは、その一段階下のロールのみを作成します。これは運用ルールであり、実装上の制限ではありません:`super_admin` は `user` も作成できます (`ASSIGNABLE_ROLES_BY_ACTOR`)。運用者は単にそうしないだけです。`platform_admin` は `super_admin` のみを割り当てることができます。運用者はこのために環境変数 `SUPER_ADMIN_*` パスワードを共有しません。これはステージ ⑥ まで互換性プリンシパルとしてのみ残ります。

| Step | Who                                             | Does                                                                                                               | Credential                          |
| ---- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| 1    | `platform_admin` (IAM-exchanged token)          | Creates the deployment row (`/admin/deployments`, `writeMode`) and the customer's `super_admin` of that deployment | `POST /auth/platform-token` (SigV4) |
| 2    | `super_admin` (one personal account per person) | Creates tenants and their first `tenant_admin`                                                                     | Login with its own password         |
| 3    | `tenant_admin`                                  | Creates users and API keys in its tenant                                                                           | Login                               |

各ステップでは、パスワードではなく招待フロー (#1532) で次のアカウントを引き渡します:`passwordResetRequired: true` は一時パスワードを一度だけ返し (`Cache-Control: no-store`、有効期限 7 日間)、それは最初のログイン時に実際のパスワードを設定するためにのみ使用できます。ログイン名 (メール) と一時パスワードは異なるチャネルを通じて送信してください。

```bash
# 1. platform_admin: exchange the IAM session for a 15-minute token (the shell holds the AWS SSO session)
PT=$(awscurl --service execute-api --region ap-northeast-1 -X POST "https://<control-host>/auth/platform-token" | jq -r .accessToken)

#    ... and invite the customer's super_admin. The Host header selects the deployment DB.
curl -sS -X POST "https://<deployment-host>/admin/users" -H "Authorization: Bearer $PT" -H 'Content-Type: application/json' \
  -d '{"email":"person@example.com","role":"super_admin","passwordResetRequired":true}'
#    → { "id", "role": "super_admin", "temporaryPassword", "expiresAt" }

# 2. super_admin (after its first login): tenant, then the tenant's first tenant_admin
curl -sS -X POST "https://<deployment-host>/admin/tenants" -H "Authorization: Bearer $DT" -H 'Content-Type: application/json' -d '{"name":"acme","description":"Acme"}'
curl -sS -X POST "https://<deployment-host>/admin/users"   -H "Authorization: Bearer $DT" -H 'Content-Type: application/json' \
  -d '{"email":"owner@acme.example","role":"tenant_admin","primaryTenantId":"<tenant-id>","passwordResetRequired":true}'
```

`super_admin` を引き渡すということは、その `super_admin` 行のメールとパスワードを変更することを意味します。`platform_admin` がこれを行います。`super_admin` は別の `super_admin` を作成、削除、または降格することはできず、`/admin/deployments` を呼び出すこともデータ API にアクセスすることもできません。このチェーンは `tests/e2e/features/auth/role-provisioning-chain.feature` によって固定されています (IAM はローカルで再現できないため、最上位のステップでは環境変数のプリンシパルを使用しています)。

### `super_admin` を顧客に引き渡す (`platform_admin` → 顧客の `super_admin`

)

引き渡しは、既存の `super_admin` 行のメールとパスワードの変更であり、`platform_admin` によって行われます (最初にパスワードをリセットし、次に `PATCH /admin/users/{userId}` でメールを変更します。#3811)。それ以外は何も作成されません。パスワードリセットとメール変更 (ユーザー以外の誰かによって行われる) の両方が、前の保持者のログイン状態 (トークン) を無効化するため、Geolonia のセッションは機能しなくなります。パスワードを最初にリセットすることで、メール変更が失敗した場合でも古いパスワードはすでに無効になっています。両方の操作が成功した後にのみ、新しいログイン名と一時パスワードを異なるチャネルを通じて顧客に送信してください。

引き渡しに次の 2 つのステップを追加してください:


1. **引き渡し前に作成された API キーと OAuth クライアントは、引き渡し後も有効なままです。** ログイン状態のみがパスワードリセットとメール変更によって無効化されます。Geolonia が作成し、その値を Geolonia が確認したキーとクライアントは、引き続き使用可能です。引き渡し時に、顧客にリスト (`GET /admin/api-keys`、`GET /admin/oauth-clients`。秘密の値は含めない) を提供し、Geolonia に値を保持させたくないものをローテーションしてもらってください。両方のリスト API はデフォルトで最初のページのみを返します:各 API について、次のページがなくなるまで `Link` ヘッダーの `rel="next"` リンクをたどり、リストから認証情報が漏れないようにしてください。
   
2. **監査ログには引き渡し前後で同じユーザー id が表示されます。** 境界は、アクターが `platform_admin` (ARN) で、`resourceId` が引き渡されたユーザーの id である `USER_UPDATE` エントリ (`PATCH /admin/users/{userId}`) です。`USER_UPDATE` はメール以外の更新もカバーするため、そのユーザーのエントリの中から、メール変更リクエストに対応するものを選択してください (上記のステップのリクエスト時刻と一致させます。パスワードリセットは別の `USER_PASSWORD_RESET` エントリです)。そのエントリの日時を引き渡し記録に記録してください。

新しい `super_admin` を作成して古いものを無効化することで引き渡さないでください。ユーザーを無効化すると、そのユーザーが作成した API キーと OAuth クライアントも停止します (#3513)。そのため、顧客のアプリケーションがすでに使用しているキーが停止してしまいます。既存の行のメールとパスワードを変更することが使用すべき方法です。

### 認証フロー

```text
┌─────────┐     POST /auth/login      ┌─────────┐
│  Client │ ─────────────────────────▶│  Server │
└─────────┘                           └─────────┘
     │                                      │
     │◀──── accessToken + refreshToken ─────│
     │                                      │
     │   Authorization: Bearer <token>      │
     │ ────────────────────────────────────▶│
     │                                      │
     │◀─────────── API Response ────────────│
     │                                      │
     │     POST /auth/logout               │
     │ ────────────────────────────────────▶│
     │        (invalidate all tokens)        │
     │◀──────────── 204 ───────────────────│
```

***

## 認証アーキテクチャ

GeonicDB の認証と認可は、以下のレイヤーで構成されています。

```text
Request
  ↓
[1. Token Extraction] Retrieve token from Authorization: DPoP/Bearer <token> or X-Api-Key header
  ↓
[2. Authentication (AuthN)] Token verification (attempted in the following order)
  │               2a. Authorization: Bearer <token> → Internal JWT / OIDC verification
  │               2b. X-Api-Key header → API Key verification (SHA-256 hash lookup)
  │                   → Origin check
  │               2c. Internal JWT (HS256) verification → authentication completes immediately on success
  │               2d. OIDC external IdP verification (only when OIDC_ENABLED=true)
  │                   → Signature verification via OIDC Discovery + JWKS (RS256/ES256)
  │                   → Search GeonicDB DB user by email address
  ↓                → requireAuth() / requireAdminAuth() / requireSuperAdminAuth()
[3. IP Restriction]  Admin endpoints only: restriction via ADMIN_ALLOWED_IPS
  ↓
[4. Tenant Isolation] Match Fiware-Service header against user's tenantId
  ↓                → checkTenantAccess()
[5. Authorization (AuthZ)] XACML policy-based authorization (while authentication is enabled)
  ↓                → XacmlService.evaluate()
[6. Endpoint Processing]
```

### 環境変数

| Variable                        | Default | Description                                                                                                                                                                                                |
| ------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_ENABLED`                  | `true`  | Built-in authentication. **Only an explicit `false` disables it** (#1981) — intended for local development only. Never set to `false` on an internet-reachable deployment.                                 |
| `JWT_SECRET`                    | (none)  | Secret for JWT signing (single-key mode). Empty or whitespace-only fails init with HTTP 500 when auth is on and `JWT_KEYS` is not configured (#3522). Optional when `JWT_KEYS` + `JWT_ACTIVE_KID` are set. |
| `JWT_KEYS`                      | -       | (#1449) JSON `{kid: secret}` map for multi-key rotation. See [JWT Key Rotation](#jwt-key-rotation-1449)                                                                                                    |
| `JWT_ACTIVE_KID`                | -       | (#1449) `kid` used to sign new tokens (must exist in `JWT_KEYS`)                                                                                                                                           |
| `JWT_EXPIRES_IN`                | `1h`    | Access token expiration                                                                                                                                                                                    |
| `JWT_REFRESH_EXPIRES_IN`        | `7d`    | Refresh token expiration (max `30d`, #3594). Invalidation record TTL tracks `max(7d, max(refresh, 30d) + access)` so shortening refresh still covers previously issued tokens.                             |
| `SUPER_ADMIN_EMAIL`             | -       | Super Admin email address via environment variable                                                                                                                                                         |
| `SUPER_ADMIN_PASSWORD`          | -       | Super Admin password via environment variable                                                                                                                                                              |
| `ADMIN_ALLOWED_IPS`             | -       | Allowed IPs for Admin API access (CIDR)                                                                                                                                                                    |
| `OIDC_ENABLED`                  | `false` | Enable OIDC external IdP authentication                                                                                                                                                                    |
| `OIDC_ISSUER_URL`               | -       | OIDC Issuer URL                                                                                                                                                                                            |
| `OIDC_AUDIENCE`                 | -       | **Required when OIDC is enabled.** Expected `aud` claim (registered client ID). Empty / whitespace-only is rejected at startup (#3933)                                                                     |
| `OIDC_EMAIL_CLAIM`              | `email` | JWT claim with the user email (non-`email` disables email auto-link; #3932)                                                                                                                                |
| `OIDC_REQUIRE_EMAIL_VERIFIED`   | `true`  | Require `email_verified===true` for first-time email link (#3932). `false` = Entra-style pre-link only                                                                                                     |
| `TOKEN_INVALIDATION_TABLE_NAME` | -       | DynamoDB table name for token invalidation (in-memory when not set)                                                                                                                                        |

***

## アクセストークンのデプロイメントバインディング (#3642)

JWT 署名鍵は環境のすべてのデプロイメントで共有されるため、`access` トークンには `dep` クレーム(それを発行したデプロイメントのホスト名)が含まれます(デフォルトデプロイメントでは省略されます)。トークンは発行された場所でのみ受け入れられます:

| Issued by                                                                    | Accepted at                    | Notes                                                                                                    |
| ---------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| same deployment                                                              | that deployment                |                                                                                                          |
| default deployment (no `dep`)                                                | non-default deployments        | **`super_admin` only** (provisioning model); other roles are rejected (`platform_admin` excepted, below) |
| non-default deployment A                                                     | default or another non-default | rejected for every role                                                                                  |
| role `platform_admin` (whoever issued it — in practice the IAM-issued token) | everywhere                     | exempt from the binding for any `dep`                                                                    |

`refresh`、`client_credentials`、`api_key_session` トークンは影響を受けません(これらはデプロイメントのデータベースで検索されます)。

**ロールアウトの影響:** この変更*前*に発行されたアクセストークンには `dep` がないため、非デフォルトデプロイメントでは、リリース前の `tenant_admin` / `user` アクセストークンは、有効期限が切れる(`JWT_EXPIRES_IN`、デフォルト 1h)まで、それを発行したデプロイメントであっても `401` で拒否されます。`401` で更新するクライアント(SDK)は自動的に回復します。bearer トークンを直接使用しているクライアントは、`POST /auth/refresh` を呼び出すか、再度ログインする必要があります。その後、新しいアクセストークンには `dep` が含まれます。

## JWT 鍵ローテーション (#1449)

JWT はサーバー内で完結する対称鍵 (HS256) で署名される。既定では単一の `JWT_SECRET` で
署名・検証するため、鍵を漏洩などで即ローテすると **既発行トークンが一斉に無効化** され、
全アクティブセッションが切断される。これを避けるため、`kid` (Key ID) 付きの複数鍵を
サポートする (HS256 のまま・非破壊)。

### 仕組み


* `JWT_KEYS`: `kid` → secret の JSON マップ。例: `{"2026-07":"secretA","2026-10":"secretB"}`
  
* `JWT_ACTIVE_KID`: **署名** に使う `kid` (`JWT_KEYS` に存在必須)。トークン header に `kid` が入る。
  
* `JWT_KEYS` 内の**すべての鍵は検証に有効** — active = 署名 + 検証、その他 = 検証のみ (retiring / next)。
  
* `JWT_KEYS` / `JWT_ACTIVE_KID` 未設定時は `JWT_SECRET` を単一鍵として使う (`kid` なし・従来動作)。
  
* 本機能導入前に発行された `kid` なしトークンは `JWT_SECRET` (legacy) で検証され続ける (移行期の非破壊)。

### ローテ手順


1. **next 鍵を追加**: `JWT_KEYS` に新しい `kid` を追加してデプロイ (検証に有効化。署名はまだ旧鍵)。
   
2. **active を切り替え**: `JWT_ACTIVE_KID` を新 `kid` に変更してデプロイ。新規トークンは新鍵で署名され、
   旧 `kid` のトークンは **retiring として検証され続ける** ため既存セッションは切れない。
   
3. **retiring 鍵を撤去**: 旧トークンの有効期限 (`JWT_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN`) 経過後、
   旧 `kid` を `JWT_KEYS` から外してデプロイ。以降その `kid` のトークンのみ段階的に失効する。

> **`JWT_SECRET` (legacy) の扱い**: マルチキー運用でも `JWT_SECRET` は必須ではないが、設定されている限り
> **`kid` を持たない旧トークン (本機能導入前に発行) を検証し続ける** (移行期の非破壊性)。導入前のトークンが
> 全て失効した後は、`kid`-less トークンの受理を止めるために `JWT_SECRET` を削除する (署名は `JWT_ACTIVE_KID`
> の鍵で行われるため single-key へ戻すのでなければ削除して差し支えない)。DPoP / ログイン nonce の HMAC も
> active 鍵を使うため、削除して差し支えない (#3545)。ローテーション直後の in-flight nonce (DPoP ≤300s /
> ログイン ≤60s) は再発行される。単一キー運用に戻す場合は `JWT_KEYS`/`JWT_ACTIVE_KID` を外し `JWT_SECRET` を残す。

> Production では `JWT_KEYS` / `JWT_ACTIVE_KID` も単一 JSON 環境シークレット (`geonicdb-<env>`) の
> キーとして解決される (`JWT_SECRET` と同経路、#1449)。

> **ウォームな Lambda への伝播 (#3579)。** `resolveJwtSecret()` は env シークレットを
> `HA.SECRETS_MANAGER.CACHE_TTL_MS` (5 分) ごとに取り直す。`JWT_SECRET` / `JWT_KEYS` / `JWT_ACTIVE_KID` の
> 値が変わると認証設定のキャッシュと署名・検証用の `JwtService` が作り直されるので、シークレットを更新すると
> 再デプロイなしで最長 5 分で全コンテナが新しい鍵セットで署名・検証する (Secrets Manager の呼び出しは増えない)。
> 単一 `JWT_SECRET` の差し替えは旧トークンを即座に無効にする — 既存セッションを切らずに替えるなら上記の
> `JWT_KEYS` 手順を使う。

> **空の署名鍵は起動しない (#3522)。** 認証が有効(`AUTH_ENABLED` 未設定を含む)で、有効な
> `JWT_KEYS` + `JWT_ACTIVE_KID` も `JWT_SECRET` も無いとき、`resolveJwtSecret()` は例外を投げ、
> リクエストは 500 になる(`/health` も含む)。空白だけの `JWT_SECRET` も空と同じ。32 文字未満は
> 警告のみで起動は続ける。`npm start` は未設定時にプロセス限りのランダム鍵を生成して警告する。
> その鍵は再起動で消える。

***

## 初期セットアップ

### 1. 環境変数の設定

認証を有効にするために、以下の環境変数を設定します。

```bash
# Required settings
export AUTH_ENABLED=true
export JWT_SECRET=your-very-secure-secret-key-at-least-32-characters

# Super Admin settings (required for initial setup)
export SUPER_ADMIN_EMAIL=admin@example.com
export SUPER_ADMIN_PASSWORD=YourSecurePassword123!

# Optional settings
export JWT_EXPIRES_IN=1h              # Access token expiration (default: 1h)
export JWT_REFRESH_EXPIRES_IN=7d      # Refresh token expiration (default: 7d)
export ADMIN_ALLOWED_IPS=10.0.0.0/8,192.168.1.0/24  # Admin API access restriction
```

### 2. ローカル開発環境の起動

```bash
# Start the server with environment variables set
AUTH_ENABLED=true \
JWT_SECRET=development-secret-key-32chars \
SUPER_ADMIN_EMAIL=admin@localhost \
SUPER_ADMIN_PASSWORD=adminpass123 \
npm start
```

### 3. AWS Lambda へのデプロイ

SAM テンプレートに以下のパラメータを設定します:

```yaml
Parameters:
  AuthEnabled:
    Type: String
    Default: "true"
  JwtSecret:
    Type: String
    NoEcho: true  # Hide secret value
  SuperAdminEmail:
    Type: String
  SuperAdminPassword:
    Type: String
    NoEcho: true
```

### Super Admin の登録

Super Admin を登録する方法は 2 つあります。

#### 方法 1: 環境変数による設定(推奨)

環境変数を使用して最初の Super Admin を設定します。

```bash
export SUPER_ADMIN_EMAIL=admin@example.com
export SUPER_ADMIN_PASSWORD=YourSecurePassword123!
```

**特徴:**

* データベースには保存されない(メモリ上のみ)
  
* サーバー再起動後も同じ認証情報で利用可能
  
* パスワード変更には環境変数の更新とサーバーの再起動が必要

#### 方法 2: Admin API による追加登録

既存の Super Admin としてログイン後、Admin API を使用して新しい Super Admin を作成できます。

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "YourSecurePassword123!"
  }'
```

***

## ユーザー & テナント管理

詳細については、Admin API ドキュメントを参照してください。

### デプロイメントルーティング管理 (environment super admin または platform\_admin のみ)

ホスト名 → MongoDB クラスタルーティング行。これらはすべてのデプロイメントにまたがります。すべてのメソッドは environment super admin — `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` から生成されたプリンシパルで、その id は `super-admin` です — または `POST /auth/platform-token` (#3495) からの `platform_admin` トークンを必要とします。デプロイメントデータベースに保存されている `super_admin` ユーザーは同じロールを持ちますが、403 を受け取ります (#3458); `tenant_admin` も同様です。それ以外の場合、そのユーザーは他のすべてのデプロイメントのクラスタ配線を読み取りまたは変更できてしまいます。[API.md](../api-reference/endpoints.md#deployment-routing-management-super_admin-only) および DEDICATED\_CLUSTER\_ONBOARDING.md を参照してください。

| Endpoint                        | Method | Description                     |
| ------------------------------- | ------ | ------------------------------- |
| `/admin/deployments`            | GET    | List deployment routing rows    |
| `/admin/deployments`            | POST   | Create a deployment routing row |
| `/admin/deployments/{hostname}` | GET    | Get a deployment routing row    |
| `/admin/deployments/{hostname}` | PATCH  | Update a deployment routing row |
| `/admin/deployments/{hostname}` | DELETE | Delete a deployment routing row |

平文の `mongodbUri` は決して返されません。現在のリクエストを処理しているデプロイメントを削除または無効化することは、409 で拒否されます (自己ロックアウトガード)。

### CADDE 設定管理 (super\_admin のみ)

| Endpoint       | Method | Description                          |
| -------------- | ------ | ------------------------------------ |
| `/admin/cadde` | GET    | Get CADDE configuration              |
| `/admin/cadde` | PUT    | Update CADDE configuration (upsert)  |
| `/admin/cadde` | DELETE | Delete CADDE configuration (disable) |

CADDE 設定はデプロイメントの MongoDB `settings` コレクション (`_id: 'cadde'`) に保存されます。これは `CADDE_ENABLED` などの環境変数によって制御されて**いません** (`docs/INTEGRATIONS.md` を参照)。CADDE を有効にすると、GeonicDB XACML 行レベルフィルタなしで、デプロイメント内で**オプトインしたテナント**に対して `/cadde/api/v4/*` が公開されます (#2469); 存在しないまたは無効化されたテナントは 403 `Access denied: no applicable policy` を返します (#3576)。`settings.caddeEnabled: true` を持つテナントのみが提供されます; 未設定または `false` の場合は同じ 403 を返します (#3580、#3628 以降オプトイン; 認証が有効な場合のみ適用されます) — CADDE および XACML を参照してください。

### テナント管理

| Endpoint                                    | Method | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/admin/tenants`                            | GET    | Get tenant list                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `/admin/tenants`                            | POST   | Create tenant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `/admin/tenants/{tenantId}`                 | GET    | Get tenant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `/admin/tenants/{tenantId}`                 | PATCH  | Update tenant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `/admin/tenants/{tenantId}`                 | DELETE | Delete tenant (`?shred=true` for Crypto-Shredding)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `/admin/tenants/{tenantId}/deletion-report` | GET    | Get deletion report (Crypto-Shredding)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `/admin/tenants/{tenantId}/activate`        | POST   | Activate tenant. Restores access for unexpired access tokens without re-login or token revocation; expired access tokens are not revived (a still-valid refresh token can issue a new one). API keys are not governed by JWT expiry and become usable again without re-issue                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `/admin/tenants/{tenantId}/deactivate`      | POST   | Deactivate tenant. Data operations made with existing access tokens, API keys, or anonymous access, and new WebSocket connections, to that tenant are rejected with 403. Members of that tenant are also rejected with 403 (`Access denied: tenant is inactive`) on `/admin/**`, `/me/**`, `/auth/logout` and `/auth/dpop-bind` (#3542); switching to another active tenant with `POST /auth/refresh` and `tenantId` still works. Open WebSocket connections to the tenant are closed on a best-effort basis (#3543): the standalone server sends close code `1008` with reason `Tenant deactivated`; on AWS the connection is removed with API Gateway `DeleteConnection`, which cannot carry a close code or reason. If closing fails, the connection may stay open, but no event of an inactive tenant is delivered to it. Subscription notifications for the tenant (including periodic, context source, `notification.join`, rule `sendNotification` and Web Push) are not delivered while it is inactive. ReactiveCore Rules are not evaluated for the tenant while inactive (incl. `webhook`); evaluation resumes on activate (#3596). Subscriptions keep their `status` and nothing is revoked, so after `activate` notifications resume on the next event or period; WebSocket clients have to reconnect (the SDK reconnects automatically, up to 10 attempts). `super_admin` is exempt only from the HTTP `isActive` check (its data API access is still denied by the deny-fence); its WebSocket connections to an inactive tenant are rejected too. Other instances observe the change within `CACHE.TENANT_TTL_MS` (30s). `activate` restores access for unexpired access tokens without re-login or token revocation; expired access tokens are not revived (a still-valid refresh token can issue a new one). API keys are not governed by JWT expiry and become usable again without re-issue |
| `/admin/tenants/{tenantId}/ip-restrictions` | GET    | Get tenant IP restrictions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `/admin/tenants/{tenantId}/ip-restrictions` | PUT    | Update tenant IP restrictions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `/admin/tenants/{tenantId}/ip-restrictions` | DELETE | Delete tenant IP restrictions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

### ユーザー管理

| Endpoint                               | Method | Description                                                                                  |
| -------------------------------------- | ------ | -------------------------------------------------------------------------------------------- |
| `/admin/users`                         | GET    | Get user list                                                                                |
| `/admin/users`                         | POST   | Create user                                                                                  |
| `/admin/users/{userId}`                | GET    | Get user                                                                                     |
| `/admin/users/{userId}`                | PATCH  | Update user                                                                                  |
| `/admin/users/{userId}`                | DELETE | Delete user                                                                                  |
| `/admin/users/{userId}/activate`       | POST   | Activate user                                                                                |
| `/admin/users/{userId}/deactivate`     | POST   | Deactivate user                                                                              |
| `/admin/users/{userId}/unlock`         | POST   | Clear login lock                                                                             |
| `/admin/users/{userId}/reset-password` | POST   | Issue a temporary password + force change on next login (#1532)                              |
| `/admin/users/{userId}/invite`         | POST   | Re-send invite email with a fresh set-password link (#1322; GeonicDB extension)              |
| `/admin/users/{userId}/invite`         | DELETE | Revoke outstanding invite / set-password tokens (#1322; GeonicDB extension)                  |
| `/auth/forgot-password`                | POST   | Accept a password recovery request by email (#3996; GeonicDB extension)                      |
| `/auth/set-password`                   | GET    | Minimal HTML page to set a password from an invite or reset link (#1322; GeonicDB extension) |
| `/auth/set-password`                   | POST   | Consume a one-time invite or reset token and set `newPassword` (#1322; GeonicDB extension)   |

#### パスワード回復をリクエストする

デプロイメントホストに `{"email":"user@your-company.com"}` を含む認証なしの `POST /auth/forgot-password` を送信します。有効なリクエストは、アドレスがリンクを受信できない場合や IP またはアドレスがレート制限されている場合でも、空の `202 Accepted` を返します。

メールで送信されたリンクを開いて新しいパスワードを設定します。リンクは1回のみ使用可能で、1時間後に期限切れになります。新しい回復リンクは、同じユーザーの以前の回復リンクを無効化します。既存のパスワードとセッションは、回復リンクが消費されるまで使用可能です。

対象ユーザーは、リンク経由でパスワードを設定した後、管理者が `reset-password` 経由で一時パスワードを発行した後、またはパスワードを直接設定した後、および必須の初回ログイン時を含め、自分自身でパスワードを変更した後に、パスワード変更メールを受信します。変更が予期しない場合は、管理者に連絡してください。

AWS では、HTTP、リフレッシュ、および WebSocket 用のセッションリーダーを最初にデプロイします。Atlas の MongoDB クライアントロール ARN リストからパスワード回復とパスワード通知ワーカーロールを登録し、SAM パラメータ `PasswordRecoveryEnabled` を有効にする前に SES パーミッションを確認してください。送信配信には `MailProvider=ses` を設定します。スタンドアロンはデフォルトで回復を有効にし、設定されたメールプロバイダーを使用します。

#### 初回ログイン時の強制パスワード変更 (#675 / #1321 / #1532)

管理者は、ユーザーが初回ログイン時に置き換える必要がある **一時パスワード** を発行してユーザーをオンボードします。強制は **単発** です。一時パスワードは、新しいパスワードを設定する唯一の機能を持つブートストラップ資格情報であり、使用可能なトークンを生成しないため、エンティティの読み取りや API キーの発行はできません。

**注意:** 一時パスワードは2つのケースでサーバー生成されます: (a) `"passwordResetRequired": true` でユーザーを作成する場合(招待)、または (b) 既存のユーザーに対して `reset-password` を呼び出す場合。`passwordResetRequired` **なし** でユーザーを作成すると、提供された `password` が直接設定され、変更を強制 **しません**(非破壊的)。

#### 招待リンク(メール)— GeonicDB 拡張 (#1322 / #3892)

一時パスワードを管理者に表示する代わりに、`"delivery": "link"` でユーザーを作成します。Context Brokerは1回限りの set-password トークンを発行し(SHA-256 としてのみ保存)、リンクをメール送信し(スタンドアロンでは InMemory アウトボックス / `MAIL_PROVIDER=memory`、`MAIL_PROVIDER=ses` の場合は `SesMailSender` 経由で AWS SES)、`expiresAt` とともに `invite.delivery: "sent"|"failed"` を返します(メール送信失敗時でもユーザー作成は成功します)。**`sent` の意味:** `MAIL_PROVIDER=ses` の場合、`"sent"` は SES が `SendEmail` リクエストを **受け入れた** ことを意味します(`SesMailSender` は `delivered: true` を設定)。これはメールボックスへの配信を保証 **しません**(後続のバウンス/苦情により、`invite.delivery` が `"sent"` のままでもメッセージがドロップされる可能性があります)。**失敗時クローズ(LogOnly):** `MAIL_PROVIDER=none`(または aws でプロバイダー未設定 — SAM デフォルト `none`)は常に `delivery: "failed"` を返します — 実際のプロバイダーに何も渡されなかった場合、`"sent"` にはなりません。SES 送信エラー(パーミッション境界前の AccessDenied、MessageRejected など)も `failed` にマップされます。`POST /admin/users/{userId}/invite` は **メール優先** です。既存のアカウントを INVITED に切り替える前に配信を試みます(プレースホルダーパスワード + セッション取り消し)。メール送信失敗時は、既存のパスワード/セッションはそのまま維持されます。非アクティブ化 / 削除 / **メール変更** / **管理者 `reset-password`** / 管理者パスワード PATCH は、未処理の招待トークンを取り消します。非アクティブなユーザーと、メールがユーザーと一致しなくなったトークンは、`POST /auth/set-password` を完了できません(`400 invalid_or_expired_token`)。招待者は `/auth/set-password?token=...`(HTML ページは CSP nonce、`X-Frame-Options: DENY`、パスワードフィールドに `name=` なしの `method="post"` を使用して JS オフ時にパスワードがクエリに漏洩しないようにし、`history.replaceState` で URL からトークンを削除し、`location.pathname` 経由で投稿します(API Gateway ステージプレフィックス `/prod` などがリクエストパスに残ります))または `{token,newPassword}` で `POST /auth/set-password` を開きます。無効 / 期限切れ / すでに使用済み / 非アクティブユーザー / メール不一致のトークンはすべて `error: "invalid_or_expired_token"` で `400` を返します。リンク元はデプロイメントホスト名(**常に `https`**)または `API_BASE_URL` を使用し、リクエストの `Host` ヘッダーは使用しません。どちらもない非スタンドアロンは失敗時クローズします(503)。**ロックアウト:** `POST /auth/set-password` は **IP のみ** のロックアウトを使用します(`IpLoginProtection` + `/auth/refresh` / `/auth/platform-token` と共有される公開 `auth` レート制限バケット)。メール `loginAttempts` を参照または増分 **しません** — 招待者のメールを知っていても、攻撃者が `/auth/login` の失敗を通じて set-password を凍結できないようにします(REVISE4)。レスポンスボディには監査 `resourceId` 用の `userId` が含まれます(この認証なしパスでは actor は不明のままです)。

**既知の制限事項:**

* **L2:** 生のトークンが GET クエリ文字列に表示されるため、API Gateway アクセスログとブラウザ履歴(`replaceState` 前)がそれを保持する可能性があります。将来の変更では、URL `#fragment` に移動する可能性があります。
  
* **L4:** LogOnly での aws(`MAIL_PROVIDER=none` / 未設定)では、`delivery:"link"` での作成は常に 201 + `invite.delivery:"failed"` を返します — **招待メールは送信されませんでした**。後で `MailProvider=ses` に切り替えても(SES ID + パーミッション境界後、infra-cdk#246)、これらのユーザーに遡及的にメール送信 **されません**。管理者は再送信するために `POST /admin/users/{userId}/invite` を呼び出す必要があります。(プロバイダーが配信できない場合の将来的な fail-fast 400 は、新しいスタック状態の INVITED 作成を減らすでしょう。)
  
* **L5:** 非 INVITED アクティブユーザーの再招待: 招待者がメール成功後と `repository.update` 完了前の短い期間に新しいリンクをクリックすると、CAS が 409 で失敗し、トークンが消費されます — 管理者は再招待する必要があります。
  
* **L6:** `resolveSelfBaseUrl` は、非招待セルフ URL に対して依然として `X-Forwarded-Proto` を信頼します。招待リンクはデプロイメントホスト名に対して `https` を強制します。Host インジェクション E2E は `resolveInviteLinkBaseUrl` をプロセス内で呼び出し、完全な HTTP Host パスを実行しません。
  
* **取り消し競合:** メール変更 / `reset-password` は、ユーザー更新後の別の書き込みで設定トークンを取り消します。**メール変更** または **非アクティブ化** 後に取り消しが失敗した場合、set-password は、`createdAt` がユーザーの現在の `passwordSetupTokenCutoffAt`(カットオフ透かし)より前のトークンを引き続き拒否します。**`reset-password`** 後に取り消しが失敗した場合、ユーザーの `passwordResetRequiredAt`(リセットサイクル透かし)より前のトークンを拒否します。
  
* **再招待無効化:** 再招待メールの送信失敗でも、そのユーザーの以前の未処理招待トークンは無効化されます(メール優先発行パスは送信前に新しいトークンを発行します。`delivery:failed` の場合、以前の有効なリンクはすでに置き換えられています)。

```bash
curl -X POST http://localhost:3000/admin/users \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","role":"user","primaryTenantId":"<tenant-id>","delivery":"link"}'
# → 201 { ..., "passwordResetRequired": true, "invite": { "delivery": "sent" }, "expiresAt": "..." }

curl -X POST http://localhost:3000/auth/set-password \
  -H "Content-Type: application/json" \
  -d '{"token":"<from-email>","newPassword":"<new-password>"}'
# → 200
```

**1. 管理者がアカウントを発行** — 作成時(招待)または後で(リセット)

```bash
# (a) Invite: create + issue a temporary password in one call.
#     Do NOT send `password` — the server generates the temporary one (sending both → 400).
curl -X POST http://localhost:3000/admin/users \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","role":"user","primaryTenantId":"<tenant-id>","passwordResetRequired":true}'
# → 201 (Cache-Control: no-store)
#   { "id", ..., "passwordResetRequired": true, "temporaryPassword", "expiresAt" }

# (b) Reset an existing user (forgotten password / re-issue):
curl -X POST http://localhost:3000/admin/users/{userId}/reset-password \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# → { "userId", "temporaryPassword", "expiresAt", "passwordResetRequired": true, "message": ... }
```


* 認可: `super_admin`(すべてのユーザー)/ `tenant_admin`(自分のテナント内のユーザー)。
  
* 一時パスワードは **1回のみ** 表示され、レスポンスには `Cache-Control: no-store` が含まれます。`PASSWORD_POLICY.TEMP_PASSWORD_VALIDITY_DAYS`(デフォルト **7日間**)後に期限切れになります。`reset-password` はユーザーの既存セッションを無効化します(招待は新しいユーザーを作成するため、無効化するセッションはありません)。

**2. ユーザーが一時パスワードでログインし、新しいパスワードを設定(1回の呼び出し)**

```bash
# Without newPassword → 409, no token issued:
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"<temporaryPassword>"}'
# → 409 { "error": "PasswordResetRequired", ... }

# With newPassword → sets the password and returns fresh tokens in the same response:
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"<temporaryPassword>","newPassword":"<newPassword>"}'
# → 200 { "accessToken", "refreshToken", ... }   (no re-login needed)
```

**機械可読エラーキー** (`error` フィールド。CLI/SDK はメッセージではなくこれで分岐します):

| Status | `error`                    | Meaning                                                                                                     |
| ------ | -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `409`  | `PasswordResetRequired`    | Temp password valid; submit `newPassword` to complete login                                                 |
| `403`  | `TemporaryPasswordExpired` | Temp password expired (or issue timestamp missing → fail-closed); ask admin to re-issue                     |
| `400`  | `BadRequest`               | `newPassword` equals the temp password, violates the password policy, or was sent when no reset is required |

**保証**


* パスワードが変更されるまでトークンは発行されません(フェイルクローズ)。ビジネス分岐は一時パスワードが検証された**後**に発生するため、アカウント状態が未認証の呼び出し元に漏洩することはありません。
  
* 同時完了は比較および設定更新によって保護されます(敗者側には `409 Conflict`)。
  
* `refreshToken()` も強制変更が保留中のユーザーを拒否します(多層防御)。
  
* リセットはユーザーの**パスワード由来の JWT セッションのみ**を無効化します — 彼らの API キー / OAuth クライアントは動作し続けます。侵害の疑いがある場合は、それらを個別に取り消すか、ユーザーを `deactivate` してください。
  
* `PATCH /admin/users/{userId}` でパスワードを直接設定すると、強制変更状態が**クリア**され、**ユーザーの既存のパスワード由来セッションが取り消されます**(#1566):管理者が選択したパスワードはすぐに使用可能になり、ユーザーは次回ログイン時にリセットを促されなくなり、以前のパスワードで発行された古いトークンは動作しなくなります(`reset-password` / `changePassword` と一貫)。

`POST /admin/users/{userId}/deactivate` (MCP の `admin` ツールの `deactivate` アクションは同じ `setUserActive(false)` を呼び出します)は、ユーザーの未処理アクセストークンを無効化し、`tenantId: null` を含むすべてのテナントにわたってそのユーザーが作成したすべての API キーと OAuth クライアントに `isActive: false` を設定します(#3513)。`POST /admin/users/{userId}/activate` はそれらを元に戻しません。管理者は `PATCH /admin/api-keys/{keyId}` または `PATCH /admin/oauth-clients/{clientId}` (`isActive: true`)で特定の認証情報を復元するか、新しいものを作成します。未処理の `api_key_session` トークンはリクエストごとにキーに対してチェックされます(#3523)。非アクティブ化はそれらを即座に無効化します。ユーザーまたはキーを再アクティブ化しても、その非アクティブ化以前に発行されたセッションは復元されません。クライアントは新しいトークンを交換する必要があります。

#### テナント存在検証

`primaryTenantId` を持つユーザーを作成または更新する際、システムは指定されたテナントが存在することを検証します。テナントが存在しない場合、`400 Bad Request` エラーが返されます。


* **POST /admin/users**: `primaryTenantId` は既存のテナントを参照する必要があります(`super_admin` ユーザーを除く。これはテナントを持ちません)
  
* **PATCH /admin/users/{userId}**: `primaryTenantId` を変更する場合、対象テナントが存在する必要があります。`primaryTenantId` を `null` に設定することは検証なしで許可されます。
  
* **PATCH /admin/users/{userId}**: `isActive` は受け付けられません(400)。`POST /admin/users/{userId}/activate` または `POST /admin/users/{userId}/deactivate` を使用してください(#3516)。
  
* **PATCH /admin/users/{userId}**: `tenant_admin` または `user` の `role` は、**更新後のプライマリテナントにおけるユーザーのメンバーシップ**にも書き込まれます(#3552)。これは非デプロイメント管理者の有効ロールが `membership.role` であるためです(#3527 / #3546)。他のテナントのメンバーシップは変更されません(`PUT /admin/tenants/{tenantId}/users/{userId}` を使用してください)。プライマリテナントにメンバーシップ行がない場合、作成されません。`isActive` は変更されません。`super_admin` はメンバーシップをそのまま残します。メンバーシップのロールが変更された場合、ユーザードキュメントの `role` が既に同じであっても、ユーザーの既存トークンは取り消されます。

### テナントメンバーシップ管理

FIWARE Keyrock Organization モデルに準拠し、単一のユーザーは複数のテナントに所属できます。メンバーシップはユーザー作成時に自動的に作成されます。

| Endpoint                                   | Method | Description                    | Authorization                               |
| ------------------------------------------ | ------ | ------------------------------ | ------------------------------------------- |
| `/admin/tenants/{tenantId}/users`          | GET    | List tenant members            | `tenant_admin` (own tenant) / `super_admin` |
| `/admin/tenants/{tenantId}/users/{userId}` | PUT    | Add user to tenant             | `tenant_admin` (own tenant) / `super_admin` |
| `/admin/tenants/{tenantId}/users/{userId}` | DELETE | Remove user from tenant        | `tenant_admin` (own tenant) / `super_admin` |
| `/admin/users/{userId}/tenants`            | GET    | List tenants a user belongs to | Self / `super_admin`                        |

#### テナントスコープログイン

ログイン時にテナントを指定することで、そのテナントにスコープされた JWT トークンを取得できます。テナントはリクエストボディ(`tenantId` または `tenantName`)または HTTP ヘッダーで指定できます。

```bash
# Login with tenantId in request body (UUID)
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password12345",
    "tenantId": "target-tenant-id"
  }'

# Login with tenantName in request body (#1223 — name resolves to tenant ID server-side)
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password12345",
    "tenantName": "my_tenant"
  }'

# Login with NGSILD-Tenant header (resolved by tenant name)
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -H "NGSILD-Tenant: my_tenant" \
  -d '{
    "email": "user@example.com",
    "password": "password12345"
  }'
```

**テナント解決の優先順位:**

1. `body.tenantId` — 直接テナント ID 指定(最優先)
   
2. `body.tenantName` — ボディ内のテナント名、サーバー側で解決(#1223)
   
3. `NGSILD-Tenant` / `Fiware-Service` ヘッダー — テナント名で解決
   
4. プライマリテナント(`user.tenantId`)— 何も指定されていない場合のフォールバック

`tenantId` と `tenantName` はリクエストボディ内で**相互排他的**です — 両方を指定すると `400 Bad Request` が返されます。

テナント名の一意性は、`tenants.name` の部分ユニークインデックス(論理削除されたテナントを除外、#1223)によってシステム全体で強制されます。これは、`Fiware-Service`、`NGSILD-Tenant`、`body.tenantName` 間で名前ベースの解決が曖昧にならないようにするための前提条件です。

**動作:**

* `tenantId` を指定した場合:メンバーシップを確認した後、そのテナントにスコープされたトークンを発行
  
* `tenantName` を指定した場合(ボディまたはヘッダー):テナント名でテナントを解決します。テナント名が見つからない場合、または無効な形式(ヘッダーの場合は `^[a-z0-9_]+$` にマッチする必要があります)の場合、`400 Bad Request` を返します
  
* テナント指定なしの場合:そのテナントに**アクティブなメンバーシップ**がある場合のみ、プライマリテナント(`user.tenantId`)のトークンを発行します。トークンロールは `membership.role` であり、ユーザードキュメントの `role` ではありません。`super_admin` はこのプライマリメンバーシップチェックから免除されます(その `primaryTenantId` は通常 null です)が、プライマリテナント id が設定されている場合でも、それは**アクティブな**テナントを参照する必要があります(非アクティブの場合は `401`)。ユーザーが複数のテナントに所属している場合、レスポンスには `availableTenants` リストが含まれます
  
* ユーザーが所属していないテナントを指定した場合:`403 Forbidden`(`super_admin` を含む — リクエストされた `tenantId` は決して黙って無視されません)
  
* プライマリメンバーシップが存在しないまたは非アクティブ(テナント指定なし):`403 Forbidden` で `Your primary tenant membership is no longer active. Specify a tenant you belong to.`

#### メンバーシップのライフサイクル


* **ユーザー作成時**:`POST /admin/users` でメンバーシップが自動的に作成されます
  
* **追加登録**:`PUT /admin/tenants/{tenantId}/users/{userId}` で別のテナントに追加
  
* **メンバーシップ削除時**:削除されたテナントがユーザーの `primaryTenantId` である場合、最も古い `createdAt` を持つ残りのアクティブなメンバーシップに再割り当てされます(メンバーシップは削除後に再読み込みされます。ユーザー更新は `primaryTenantId` が削除されたテナントと一致することを条件としており、これにより同時実行の競合が狭められます)。2 つの削除が同時に実行されるわずかなウィンドウでは、`primaryTenantId` がメンバーシップ行のないテナントを指すことがあります。その場合、テナントなしログインは `403` でクローズ失敗します。削除後の再読み込みで残りのメンバーシップがゼロであることが判明した場合、呼び出しは `400` を返します(削除前の唯一テナントガードと同じ TOCTOU クラス)。アクセス取り消し(#886)は、再割り当てが失敗しても常に実行されます。ユーザードキュメントの `role` は変更されません。呼び出し元のレスポンスは成功時に `204` のままです(他のテナントは開示されません)。ユーザーの唯一のテナントを削除することは引き続き拒否されます
  
* **レガシーユーザー(メンバーシップ行なし)**:自動メンバーシップ前に作成されたユーザー(2026-02-20、#527)は、テナントなしログイン時にクローズ失敗します(`403`)。欠落している行は取り消しと区別がつかないため、メンバーシップ行は**バックフィル**されません。`PUT /admin/tenants/{tenantId}/users/{userId}` のみでアクセスを復元してください
  
* **テナント削除時**:すべてのテナント関連データがカスケード削除されます(entities、subscriptions、registrations、temporalEntities、snapshots、rules、policies、OAuth clients、data models、users、memberships など — 全 16 コレクション)
  
* **ユーザー削除時**:ユーザーに関連するすべてのメンバーシップが自動的に削除されます

### テナント単位の CORS 許可オリジン (#1069)

GeonicDB はリクエストの `Origin` ヘッダーをテナントレベルのホワイトリストと照合して検証します。これは API-Key の `allowedOrigins` の上に重ねられ、匿名、JWT、API-Key リクエストのすべてに適用されます。GeonicDB はマルチテナント Context Broker であるため、許可されたオリジンを環境変数で固定することは**できません**。ランタイムで管理 API を通じてテナントごとに設定する必要があります。

#### エンドポイント

標準のテナント設定エンドポイントを使用します:

```http
PATCH /admin/tenants/{tenantId}
Content-Type: application/json
Authorization: Bearer <super_admin token>

{
  "settings": {
    "allowedOrigins": ["https://app.example.com", "https://admin.example.com"]
  }
}
```

#### `allowedOrigins` の意味

| Value                              | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Field absent                       | All origins allowed (backward compat — existing tenants unaffected).                                                                                                                                                                                                                                                                                                                                                              |
| `[]` (explicit empty array)        | All origins denied.                                                                                                                                                                                                                                                                                                                                                                                                               |
| `["*"]`                            | All origins allowed. Requests without `Origin` header (curl / S2S / CLI) also pass.                                                                                                                                                                                                                                                                                                                                               |
| `["https://app.example.com", ...]` | Exact match (max 50 entries; protocol + host + port). Requests without `Origin` header are denied.                                                                                                                                                                                                                                                                                                                                |
| `["https://*.example.com", ...]`   | Subdomain wildcard. `*` must be the leading host label and matches **one or more** labels — `https://a.example.com` and `https://a.b.example.com` match, the apex `https://example.com` does not (add an exact entry if needed). Scheme and port must match exactly, and lookalike domains (`https://evil-example.com`) do not match. Intended for CI/CD deploy previews (e.g. Cloudflare Pages `https://*.<project>.pages.dev`). |

#### 実施


* **プリフライト (OPTIONS)** はオリジン検証されません (CORS 仕様:テナントヘッダーはプリフライトに含まれません)。常にリクエストの `Origin` をエコーバックし、204 を返します。
  
* **実際のリクエスト**は `optionalAuth(event, tenantService)` (データ API) または `requireAuth(event)` (管理 / `/auth/logout`) を通過します。オリジンが一致しない場合、リクエストは `403 Forbidden` で拒否され、ボディは `Origin not allowed for this tenant` となります。
  
* 403 レスポンスには依然として `Access-Control-Allow-Origin` のエコーバック + `Vary: Origin` が含まれるため、ブラウザは実際のエラーをクライアントに表示できます (そうでなければ開発者には一般的な Network エラーが表示されます)。
  
* `super_admin` ユーザー (`tenantId: null`) はオリジン検証をスキップします — テナントスコープの上位で動作します。

#### API Key の `allowedOrigins` との重ね合わせ

API Key が使用される場合、両方のチェックが適用されます:


1. **テナントレベル**: `tenant.settings.allowedOrigins` を満たす必要があります。
   
2. **API-Key レベル**: `apiKey.allowedOrigins` を満たす必要があります (既存の動作、変更なし)。

最も制限的なものが優先されます。

#### geonicdb-console ステージング (`console.geonicdb.geolonia.com`

) (#2022)

[geonicdb-console](https://github.com/geolonia/geonicdb-console) ステージングは、パスワードログイン + `/auth/dpop-bind` (RFC 9449) を使用して `https://console.geonicdb.geolonia.com` から実際のバックエンド (`https://geonicdb.geolonia.com`) に接続します。HTTP ミドルウェアの変更は不要です:


* **CORS プリフライト**はコンソールのオリジンをエコーバックし、すでに `Authorization` と `DPoP` を許可しています (`src/config/defaults.ts` の `CORS_ALLOW_HEADERS`)。
  
* **実際のリクエスト**は認証フェーズで `tenant.settings.allowedOrigins` (および該当する場合は API-key の `allowedOrigins`) によってゲートされます。

専用ステージング QA テナント (慣例的に `console-qa`) について。**これが意味を持つ前にテナントが存在している必要があります** — 2026-08-11 時点では、`https://geonicdb.geolonia.com` 上でまだプロビジョニングされていません。まずプロビジョニングし (`geonicdb-infra-cdk/scripts/provision-tenants.sh`)、次に確認します:

| `settings.allowedOrigins`                | Action needed                                                                                             |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Field absent (`undefined`)               | None — backward-compat all-allow                                                                          |
| `["*"]`                                  | None                                                                                                      |
| `["https://*.geonicdb.geolonia.com"]`    | None — covers `console.geonicdb.geolonia.com`                                                             |
| Explicit list without the console origin | Add `https://console.geonicdb.geolonia.com` (or the wildcard above) via `PATCH /admin/tenants/{tenantId}` |

デプロイされた環境に対して検証します。プリフライトはコンソールのオリジンをエコーし、`Authorization` と `DPoP` の両方をリストする必要があります:

```bash
curl -sSD - -o /dev/null -X OPTIONS https://geonicdb.geolonia.com/auth/dpop-bind \
  -H 'Origin: https://console.geonicdb.geolonia.com' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: authorization,dpop,content-type' \
  | grep -i '^access-control-'
```

プリフライトはテナント非依存なので、単独で応答します。以下のテナントプローブは**テナントがプロビジョニングされて初めて解釈可能**です:

```bash
curl -sS https://geonicdb.geolonia.com/v2/entities \
  -H 'Origin: https://console.geonicdb.geolonia.com' \
  -H 'Fiware-Service: console-qa'
```

| Response body                                  | Meaning                                                                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `Origin not allowed`                           | Origin check **rejected** — add the console origin to `allowedOrigins`                                               |
| `Access denied` (403)                          | Origin check **passed**; only authorization rejected the anonymous caller (expected)                                 |
| `Invalid tenant header value` / 400 / NotFound | **Not an Origin verdict** — the tenant does not exist. Provision it and re-run; do not read this as "origin is fine" |

3 行目は fail-open トラップです:プロビジョニングされていないテナントはオリジンチェックにまったく到達しないため、`Origin not allowed` が存在しないことは何も証明しません。

テナントの現在の設定を直接読み取るには、super-admin トークンで `GET /admin/tenants` を実行し、`settings.allowedOrigins` を確認します。

`Access-Control-Allow-Credentials` は意図的に**設定されていません** — コンソールはヘッダーベースの Bearer + DPoP を使用し、Cookie は使用しません。

### テナント別 IP 制限

テナントごとに固有の IP アドレス制限を設定できます。グローバル設定 (`ADMIN_ALLOWED_IPS`) に加えて、テナントレベルでのきめ細かいアクセス制御が可能です。

#### エンドポイント

| Endpoint                                    | Method | Description                                       |
| ------------------------------------------- | ------ | ------------------------------------------------- |
| `/admin/tenants/{tenantId}/ip-restrictions` | GET    | Get IP restriction settings                       |
| `/admin/tenants/{tenantId}/ip-restrictions` | PUT    | Update IP restriction settings                    |
| `/admin/tenants/{tenantId}/ip-restrictions` | DELETE | Delete IP restriction settings (reset to default) |

#### スコープ

| Scope   | Description                                        |
| ------- | -------------------------------------------------- |
| `admin` | Restrict access to the Admin API (`/admin/*`) only |
| `all`   | Restrict access to all API endpoints               |

#### フォールバック動作

テナントに IP 制限が設定されていない場合、グローバル設定 (`ADMIN_ALLOWED_IPS` 環境変数) が適用されます。テナントレベルの設定が存在する場合は、それが優先されます。

#### リクエスト例

**IP 制限設定の取得:**

```bash
curl -X GET http://localhost:3000/admin/tenants/{tenantId}/ip-restrictions \
  -H "Authorization: Bearer <accessToken>"
```

**レスポンス例:**

```json
{
  "tenantId": "abc123",
  "tenantName": "my-tenant",
  "ipRestrictions": {
    "enabled": false,
    "allowedIps": [],
    "scope": "admin"
  },
  "globalFallback": null
}
```

**IP 制限設定の更新:**

```bash
curl -X PUT http://localhost:3000/admin/tenants/{tenantId}/ip-restrictions \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "allowedIps": ["192.168.1.0/24", "10.0.0.1"],
    "scope": "admin"
  }'
```

**IP 制限設定の削除:**

```bash
curl -X DELETE http://localhost:3000/admin/tenants/{tenantId}/ip-restrictions \
  -H "Authorization: Bearer <accessToken>"
```

***

## API キー認証

GeonicDB は、JWT/OAuth トークンの軽量な代替手段として API キーベースの認証をサポートしています。API キーは、公開統合、ブラウザベースのアプリケーション、完全な OAuth 認証情報が不要なシナリオに最適です。

### 概要

API キーは、オリジンおよびレート制限の組み込み制約と、`policyId` を介したオプションの XACML ポリシーバインディングを備えた、よりシンプルな認証メカニズムを提供します。

### 認証ヘッダー

```http
X-Api-Key: <UUID or gdb_-prefixed key>
```

**優先順位**: `Authorization: Bearer` と `X-Api-Key` の両方のヘッダーが存在する場合、Bearer トークンが優先されます。API キーは、Bearer トークンが提供されていない場合にのみフォールバックとして使用されます。

### キー形式


* **新しいキー**: プレーン UUID (`randomUUID()`) — 例: `550e8400-e29b-41d4-a716-446655440000`
  
* **レガシーキー**: `gdb_` プレフィックスを持つ既存のキーは引き続き動作します (後方互換性あり)
  
* **ストレージ**: キーの SHA-256 ハッシュのみがデータベースに保存されます。平文のキーは、作成時と更新時にのみ返されます。
  
* **マスキング**: リストおよび取得のレスポンスは、実際のキーの代わりに `"key": "******"` を返します

### 制限事項

| Field              | Description                                                                                                                                                                                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Origin**         | `allowedOrigins` — list of permitted URL origins, subdomain wildcards (`https://*.example.com`), or `*` for any. At least 1 required. Max 20 entries. Enforced at runtime. Wildcard semantics are the same as the tenant-level list (see [`allowedOrigins` Semantics](#allowedorigins-semantics)). |
| **Policy Binding** | `policyId` — optional. Binds the key to an existing XACML policy. The bound policy is evaluated with its policy-level target and its rules. Without `policyId`, the key falls back to tenant policies + role default (api\_key = All Deny).                                                        |
| **Rate Limit**     | `rateLimit.perMinute` — requests per minute (1–1000, default: 60).                                                                                                                                                                                                                                 |

### API キー管理(管理者)

管理者は任意のユーザーの API キーを管理できます。

| Endpoint                          | Method | Description                                              |
| --------------------------------- | ------ | -------------------------------------------------------- |
| `/admin/api-keys`                 | POST   | Create API key (returns raw key in response)             |
| `/admin/api-keys`                 | GET    | List API keys (paginated, `X-Total-Count` header)        |
| `/admin/api-keys/{keyId}`         | GET    | Get API key details                                      |
| `/admin/api-keys/{keyId}`         | PATCH  | Update API key                                           |
| `/admin/api-keys/{keyId}`         | DELETE | Delete API key                                           |
| `/admin/api-keys/{keyId}/refresh` | POST   | Refresh (regenerate) API key — returns new plaintext key |

### セルフサービス API キー管理

ユーザーは管理者権限なしで自分自身の API キーを作成および管理できます。

| Endpoint                       | Method | Description                                                  |
| ------------------------------ | ------ | ------------------------------------------------------------ |
| `/me/api-keys`                 | POST   | Create own API key                                           |
| `/me/api-keys`                 | GET    | List own API keys                                            |
| `/me/api-keys/{keyId}`         | PATCH  | Update own API key (partial)                                 |
| `/me/api-keys/{keyId}`         | DELETE | Delete own API key                                           |
| `/me/api-keys/{keyId}/refresh` | POST   | Refresh (regenerate) own API key — returns new plaintext key |

**制限事項:**

* テナントごとのユーザーあたり最大 **5 個のキー**
  
* `allowedOrigins` は作成時に必須(非空配列;すべてのオリジンを許可するには `["*"]` を使用、サブドメインワイルドカードには `https://*.example.com` を使用)
  
* `policyId` はオプション — 指定する場合、参照されるポリシーは既に存在し、同じユーザーによって作成されている必要があります
  
* `tenantId` は `super_admin` には必須(欠落時は 400);`tenant_admin` は省略可能(セッションから自動導出)

> **オーナー上限(#1363 / #1376 / #3564)。** **personal スコープ**のバインドポリシーを持つセルフサービス認証情報(API キーまたは OAuth クライアント)は、同じリクエストがそのオーナーに対して **Permit** である場合にのみ **Permit** となります。認可時、バインドされた `personal` ポリシーが存在し、認証情報の判定が Permit の場合、リクエストはオーナーの ID でオーナーの有効セット(**deny-fence + テナントポリシー + オーナーのロールデフォルト**)に対して再評価されます。オーナーが **Deny**、**NotApplicable**、または **Indeterminate** の場合、認証情報も拒否されます。これにより、(a) 制限されたユーザーが自己作成した `Permit` をバインドすることでテナント `Deny` を回避した #1363 バイパス、および (b) `user` が personal ポリシー経由で `USER_DEFAULT` 外の操作(例:`POST /rules`、`POST /mcp`、`/a2a`)を委任できた #3564 の穴の両方が塞がれます。`role=api_key` / `oauth_client` を Permit するテナントポリシーは、personal バインド認証情報に対してこの上限を引き上げ**ません**(#3544 およびリスト読み取りと同じ F1);オーナーをターゲットにした Permit(`role=user` / `userId` / `email`)は引き上げます。管理者発行の認証情報は `tenant` スコープポリシーをバインドし、影響を受けません。バインドされていないキーは、テナントポリシー + `API_KEY_DEFAULT` のみで評価されます。
>
> **Personal バインドパスフェンス(#3544)。** オーナー上限とは独立して、**personal スコープ**ポリシーにバインドされた認証情報は、`TENANT_POLICY_ALLOWED_PATH_PREFIXES`(`/v2/`、`/ngsi-ld/`、`/catalog`、`/rules`、`/custom-data-models`、`/mcp`、`/a2a`)外のパスでは常に **Deny** となります。ただし `GET /me`(認証情報イントロスペクション、#3577 / #3481 — オーナー `user` も `/me/**` に到達できるため、イントロスペクションを免除してもオーナーを超えて認証情報を広げることはありません)は除きます。`/admin/**`(または他の許可リスト外パス)で `role=api_key` / `oauth_client` を Permit するテナントポリシーは、personal バインド認証情報に対してこのフェンスを引き上げ**ません**。管理者発行のテナントバインドキーおよびバインドされていないキーは影響を受けません。これにより、#3529(書き込み時パス検証のみ)が残した残留穴が塞がれます:DB に既に保存されているレガシーの穴あき personal ポリシー、および将来の書き込み検証ギャップは、personal バインド認証情報に対して、`user` が許可リストの下で到達できる範囲を超えたアクセスを付与できません。
>
> バインドされた `personal` ポリシーの作成者がユーザーとして解決できない場合(ユーザーが削除された、作成者が API キーまたは OAuth クライアントである、または作成者がユーザーレコードを持たない環境 super admin である)、認証情報はすべてのリクエストで拒否され、リストは何も返しません(#3481)。環境 super admin はいずれにせよデータ API で拒否されるため、その認証情報は personal ポリシーから何も得られません。
>
> **リスト読み取り**(タイプレス `GET /entities`、#1337/#1369 のポリシーからフィルタへの行レベルセキュリティパスを使用)の場合、同じオーナー上限が二値拒否ではなく**フィルタ交差**として適用されます(#1376 / #3564):認証情報の読み取り可能エンティティフィルタはオーナーの読み取り可能エンティティフィルタ(オーナーセット = deny-fence + テナント + ロールデフォルト)と交差され、認証情報は包括的な 403 ではなく、オーナーが見ることができる行を正確に見ます(例:オーナーの許可された `entityType` にフィルタリング)。ポイント判定は上限として同じオーナー有効セットを使用します(#3564)。
>
> オーナールックアップ自体は **確定的不在**と**一時的 I/O 障害**を区別します(#2341)、`loadBoundPolicy` に合わせて。削除されたオーナー(`UserRepository.getById` が `null` を返す)はフェイルクローズ:ポイント判定は `Deny`(`matchedPolicyId: __bound_policy_owner_unresolved`)、リスト読み取りは `kind:'none'` です。Mongo 切断またはレプリカセットフェイルオーバーは**再スロー**され、その不在に折り込まれません:リスト読み取りは、そうでなければ `unrestricted`(user GET デフォルト)または `kind:'none'` を合成し、通知パスは後者を `SUBSCRIPTION_NOTIFICATION_RLS_DENIED` にマップします — 永久ドロップ、再試行されません。リトライ可能な I/O エラーは `deriveSubscriberReadFilter` の `'unresolved'` ブランチに到達します(#2289)ので、Lambda は再配信できます。したがって、HTTP 呼び出し元は同じ障害に対して **403**(権限拒否のように見える)ではなく **500**(再試行)を見ます。

**PATCH 更新可能フィールド**(`PATCH /me/api-keys/{keyId}`):

| Field            | Type                 | Description                                                  |
| ---------------- | -------------------- | ------------------------------------------------------------ |
| `name`           | string               | Key name                                                     |
| `allowedOrigins` | string\[]            | Allowed origins (min 1 entry)                                |
| `policyId`       | string \| null | Policy binding (must be created by you, or `null` to unbind) |
| `rateLimit`      | object               | Rate limit override                                          |
| `dpopRequired`   | boolean              | Require DPoP proof                                           |
| `isActive`       | boolean              | Activate / deactivate the key                                |

### リクエスト例

#### API キーの作成

```bash
curl -X POST http://localhost:3000/admin/api-keys \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Public Dashboard",
    "allowedOrigins": ["https://dashboard.example.com"],
    "rateLimit": { "perMinute": 120 }
  }'
```

> **注意:** `keyId` は自動生成されます (UUID)。`tenantId` は `super_admin` には必須です。`tenant_admin` は省略可能です (セッションから自動導出されます)。`policyId` はオプションです。省略された場合、認可はテナントポリシー + ロールのデフォルトにフォールバックします。ID (`keyId`、`policyId`) はテナントごとに一意です。

**レスポンス** (`201 Created`、`Location: /admin/api-keys/{keyId}`):

```json
{
  "keyId": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Public Dashboard",
  "key": "550e8400-e29b-41d4-a716-446655440000 (plaintext key, shown only at creation and refresh)",
  "allowedOrigins": ["https://dashboard.example.com"],
  "policyId": "dashboard-readonly",
  "rateLimit": { "perMinute": 120 },
  "isActive": true,
  "tenantId": "my-tenant-id",
  "createdBy": "user-uuid",
  "lastUsedAt": null,
  "createdAt": "2026-03-07T00:00:00.000Z",
  "updatedAt": "2026-03-07T00:00:00.000Z"
}
```

> **注意:** `keyPrefix` フィールドは削除されました。`key` フィールドは作成時と更新時にのみ平文で返されます。リスト / 取得レスポンスでは `"key": "******"` として返されます。
>
> **後方互換性:** `gdb_` プレフィックスを持つ既存のキーは有効なままで、引き続き動作します。新しく作成されるキーのみが UUID 形式を使用します。

#### API キーの更新

```bash
curl -X POST http://localhost:3000/me/api-keys/{keyId}/refresh \
  -H "Authorization: Bearer <accessToken>"
```

キーの値を再生成します。古いキーは直ちに無効化されます。レスポンスには新しい平文のキーが含まれます (作成レスポンスと同じ形式)。

#### API キーの使用

```bash
curl -X GET http://localhost:3000/v2/entities?type=TemperatureSensor \
  -H "X-Api-Key: 550e8400-e29b-41d4-a716-446655440000" \
  -H "Fiware-Service: mytenant"
```

### デフォルトと制限

| Parameter                    | Value                        |
| ---------------------------- | ---------------------------- |
| Max keys per user per tenant | 5                            |
| Max allowed origins          | 20                           |
| Default rate limit           | 60 requests/minute           |
| Max rate limit               | 1000 requests/minute         |
| Key length                   | 32 bytes (64 hex characters) |

### ポリシーバインディング (`policyId`

)

デフォルトでは、API キーには `Deny` ポリシー (`__default_api_key`、優先度 -2) が設定されています。権限を付与するには、まず XACML ポリシーを作成し、`policyId` フィールドを介して API キーにバインドします。

#### ワークフロー

```bash
# 1. Create a policy (policyId is auto-generated when omitted)
curl -X POST http://localhost:3000/admin/policies \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "rules": [{ "ruleId": "permit", "effect": "Permit" }]
  }'
# Response: { "policyId": "550e8400-...", ... }

# 2. Create API key with policyId binding
curl -X POST http://localhost:3000/admin/api-keys \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sensor key",
    "allowedOrigins": ["*"],
    "policyId": "<policyId from step 1>"
  }'
```

> **注意:** `policyId` と `ruleId` は省略時に自動生成 (UUID) されます。ID はテナントごとに一意です — 異なるテナントは同じ ID を独立して使用できます。

`policyId` が指定されている場合、バインドされたポリシーはポリシーレベルの `target` とその `rules` で評価されます。ポリシーレベルの target は削除されません。

#### 動作

| `policyId`            | Behavior                                                  |
| --------------------- | --------------------------------------------------------- |
| Specified (valid)     | Bound policy is evaluated (policy-level target and rules) |
| Specified (not found) | 400 error at creation/update                              |
| `null` or omitted     | Tenant policies + role default (api\_key = All Deny)      |

#### ポリシーバインディングの更新

`PATCH /admin/api-keys/{keyId}` を使用して、ポリシーバインディングを変更または削除します (管理者):

```bash
# Change the bound policy
curl -X PATCH http://localhost:3000/admin/api-keys/{keyId} \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"policyId": "new-policy"}'

# Remove policy binding (revert to default Deny)
curl -X PATCH http://localhost:3000/admin/api-keys/{keyId} \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"policyId": null}'
```

セルフサービスキーの場合は、`PATCH /me/api-keys/{keyId}` を使用します — `policyId` は認証されたユーザーによって作成されたポリシーを参照する必要があります:

```bash
curl -X PATCH http://localhost:3000/me/api-keys/{keyId} \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"policyId": "my-readonly-policy"}'
```

### API キートークン交換 (Browser SDK)

ブラウザベースのアプリケーションでは、キーの露出リスクのため、API キーを `X-Api-Key` ヘッダーで直接使用することはできません。代わりに、GeonicDB は Nonce + Proof of Work を介して API キーを短命のセッション JWT に変換するトークン交換フローを提供します。

#### フロー

```text
Browser                              GeonicDB
  │                                      │
  │  POST /auth/nonce                    │
  │  Headers: Origin: <origin>           │
  │  Body: { api_key }                   │
  │ ──────────────────────────────────►  │
  │  { nonce, challenge, difficulty }    │
  │ ◄──────────────────────────────────  │
  │                                      │
  │  [Solve PoW: SHA256(challenge+n)]    │
  │                                      │
  │  POST /oauth/token                   │
  │  Headers: Origin: <origin>           │
  │  Body: { grant_type: "api_key",      │
  │          api_key, nonce, proof }     │
  │ ──────────────────────────────────►  │
  │  { access_token, token_type,         │
  │    expires_in, scope }               │
  │ ◄──────────────────────────────────  │
  │                                      │
  │  GET /v2/entities                    │
  │  Authorization: Bearer <JWT>         │
  │ ──────────────────────────────────►  │
```

#### セキュリティレイヤー


1. **Origin 検証**: Nonce は HMAC を介してリクエスト Origin に紐付けられ、Origin が一致しない場合は拒否されます
   
2. **HMAC Nonce**: ステートレス、アクティブな JWT 署名鍵 (`JWT_KEYS[JWT_ACTIVE_KID]` または `JWT_SECRET`、#3545) で署名され、タイムスタンプ + Origin + keyId を含みます。TTL は 60 秒
   
3. **Proof of Work**: SHA-256 ベース、難易度 = 4 (先頭 4 ビットがゼロ)。外部依存なしで自動化された悪用を防止します
   
4. **短命の JWT**: `api_key_session` タイプ、1 時間で期限切れ
   
5. **ライブキーチェック**: すべてのリクエストで API キーをリロードします (`X-Api-Key` と同じ無効化エポックキャッシュ)。欠落、非アクティブ、削除、ローテーション、または人間によって作成されていないキーの場合、セッションを拒否します。`policyId` と `tenantId` はキードキュメントから取得されます。無効化とローテーションは `sessionInvalidatedBefore` を設定します。キーを再度オンにしてもこれはクリアされないため、以前のセッションは無効のままとなり、新しい交換が必要になります。JS SDK は HTTP 401 を再試行し、設定された API キーを再度交換します。これはキー自体が引き続き検証される間のみ成功します。ポリシーの変更は 403 となり、再試行されません。同じセッションはすでに新しい `policyId` を参照します。

#### JavaScript SDK

GeonicDB は、トークン交換フロー全体を自動的に処理する JavaScript SDK を npm パッケージ (`@geolonia/geonicdb-sdk`) として提供します:

```javascript
import GeonicDB from '@geolonia/geonicdb-sdk';

const db = new GeonicDB({
  apiKey: 'gdb_your_api_key_here',
  tenant: 'your-tenant',
  baseUrl: 'https://your-geonicdb-instance'
});

db.getEntities({ type: 'TemperatureSensor' }).then(function(entities) {
  console.log(entities);
});
```

SDK は nonce の取得、PoW の解決、トークンの更新を透過的に処理します。

#### 外部トークンインジェクション

外部で Bearer JWT ログインを使用する場合 (例: アプリケーションレベルのログインフロー)、`setCredentials()` を介してトークンを SDK に注入し、`on('tokenRefresh', cb)` でトークン更新の同期のためのコールバックを登録します:

```javascript
var db = new GeonicDB({ tenant: 'my-tenant', baseUrl: 'https://...' });

// Inject tokens obtained from an external login flow
db.setCredentials({
  token: loginResponse.accessToken,
  tokenType: 'Bearer',
  expiresIn: loginResponse.expiresIn,
  refreshToken: loginResponse.refreshToken
});

// Sync refreshed tokens to application state (e.g., localStorage)
db.on('tokenRefresh', function(creds) {
  saveToStorage({ accessToken: creds.token, refreshToken: creds.refreshToken });
});
```

> **注意**: `setCredentials()` が `tokenType: 'Bearer'` と `refreshToken` で呼び出されると、その後のすべての API 呼び出しと `connect()` は DPoP/PoW を完全にバイパスします。トークンの更新は `/auth/refresh` を使用するため、PoW の再計算は必要ありません。

詳細については SDK ドキュメントを参照してください。

### DPoP Token Binding (RFC 9449)

GeonicDB は [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) に基づく DPoP (Demonstration of Proof-of-Possession) をサポートしており、トークンをクライアントが保持する暗号鍵にバインドします。これによりトークンの盗難とリプレイのリスクが排除されます — JWT が傍受されても、対応する秘密鍵なしでは使用できません。

#### 仕組み


1. **鍵ペアの生成**: クライアントは ECDSA P-256 鍵ペアを生成します (SDK は `extractable: false` を指定した `crypto.subtle.generateKey` を使用)
   
2. **DPoP 証明によるトークン交換**: クライアントは `POST /oauth/token` 時に証明 JWT を含む `DPoP` ヘッダーを送信します
   
3. **トークンのバインド**: サーバーは証明を検証し、JWK Thumbprint ([RFC 7638](https://datatracker.ietf.org/doc/html/rfc7638)) を `cnf.jkt` として発行された JWT に埋め込みます
   
4. **リクエストごとの証明**: 各 API リクエストには新しい DPoP 証明が含まれます。サーバーは証明の `jkt` がトークンの `cnf.jkt` と一致することを検証します

#### DPoP フロー

```text
Browser                              GeonicDB
  │                                      │
  │  [Generate ECDSA P-256 key pair]     │
  │                                      │
  │  POST /oauth/token                   │
  │  Headers: Origin: <origin>           │
  │           DPoP: <proof JWT>          │
  │  Body: { grant_type: "api_key",      │
  │          api_key, nonce, proof }      │
  │ ──────────────────────────────────►  │
  │  { access_token (cnf.jkt bound),    │
  │    token_type: "DPoP", ... }         │
  │ ◄──────────────────────────────────  │
  │                                      │
  │  GET /v2/entities                    │
  │  Authorization: DPoP <JWT>           │
  │  DPoP: <new proof JWT>              │
  │ ──────────────────────────────────►  │
  │  [Verify proof jkt == token cnf.jkt] │
```

#### DPoP-Nonce (RFC 9449 Section 8)

GeonicDB は RFC 9449 Section 8 に基づくサーバー提供の nonce を実装し、事前計算された DPoP 証明を防ぎます。nonce ハンドシェイクは透過的に行われます:


1. クライアントは `nonce` クレームなしで DPoP 証明を送信します
   
2. サーバーは `error: "use_dpop_nonce"` と `DPoP-Nonce` レスポンスヘッダーを含む `400` を返します
   
3. クライアントは `nonce` クレームにサーバー nonce を含む新しい DPoP 証明を作成します
   
4. サーバーは nonce を検証してトークンを発行します。レスポンスには後続のリクエスト用の新しい `DPoP-Nonce` が含まれます

```text
Browser                              GeonicDB
  │                                      │
  │  POST /oauth/token                   │
  │  DPoP: <proof (no nonce)>            │
  │ ──────────────────────────────────►  │
  │  400 { error: "use_dpop_nonce" }     │
  │  DPoP-Nonce: <server-nonce>          │
  │ ◄──────────────────────────────────  │
  │                                      │
  │  POST /oauth/token                   │
  │  DPoP: <proof (nonce: server-nonce)> │
  │ ──────────────────────────────────►  │
  │  200 { access_token, token_type }    │
  │  DPoP-Nonce: <next-nonce>            │
  │ ◄──────────────────────────────────  │
```

nonce はステートレス (アクティブな JWT 署名鍵 — `JWT_KEYS[JWT_ACTIVE_KID]` または `JWT_SECRET`、#3545 — を使用した HMAC ベース) で、TTL は 300 秒です。データベースストレージは不要です。RFC 9449 §8 に従い、nonce は予測不可能 (署名鍵を使用した HMAC) であり、最近発行された値と正確に一致する必要があります (HMAC 検証 + TTL ウィンドウ)。nonce は DPoP 鍵 (`jkt`) または発行クライアントにバインド**されません** — §8 はそのバインディングを要求していません (#3561)。

DPoP バインドトークンを使用する API リクエストも nonce を必要とします。サーバーは成功したすべてのレスポンスと `use_dpop_nonce` メッセージを含む `401` エラーで `DPoP-Nonce` ヘッダーを返します。

#### `htu` 検証とローカル HTTP 開発

各 DPoP 証明には、サーバーが再構築するリクエスト URL と一致する必要がある `htu` (HTTP URI) クレームが含まれています。サーバーはスキームを `X-Forwarded-Proto` (本番環境では API Gateway / CloudFront によって `https` に設定される) から導出し、そのヘッダーが存在しない場合はデフォルトで `https` になります。

このデフォルトはプロキシなしの**ローカル HTTP 開発**を破壊します: SDK は `baseUrl` から `htu` に署名します (例: `http://localhost:3001/oauth/token`)、一方サーバーは `https://localhost:3001/...` を再構築し、永続的な `htu_mismatch` (400) を引き起こして DPoP トークン交換をブロックします (#1153)。

HTTP でローカル開発するには、サーバーを localhost モードで実行してください (`npm start` は無条件に有効化します — ENV.md を参照)。その場合のみ、**そして `Host` ヘッダーがループバック** (`localhost` / `127.0.0.0/8` / `[::1]`、ポートはオプション、大文字小文字を区別しない) の場合のみ、サーバーはスキームを `http` として導出し、SDK の `http` `baseUrl` と一致します。`X-Forwarded-Proto` が存在する場合は、常に優先されます。本番環境 (Lambda) では localhost モードは決してアクティブにならないため、攻撃者が `Host: localhost` を偽装しても導出されるスキームをダウングレードできません — 両方の条件が成立する必要があります (AND)。

#### DPoP 証明 JWT 構造

```json
// Header
{
  "typ": "dpop+jwt",
  "alg": "ES256",
  "jwk": { "kty": "EC", "crv": "P-256", "x": "...", "y": "..." }
}

// Payload
{
  "jti": "<unique identifier>",
  "htm": "POST",
  "htu": "https://api.example.com/oauth/token",
  "iat": 1710000000,
  "nonce": "<server-issued DPoP-Nonce>",
  "ath": "<SHA-256 hash of access token>"  // Only for API requests, not token exchange
}
```

| Claim   | Description                                                    |
| ------- | -------------------------------------------------------------- |
| `jti`   | Unique proof identifier (replay prevention)                    |
| `htm`   | HTTP method of the request                                     |
| `htu`   | HTTP URI of the request (scheme + host + path)                 |
| `iat`   | Issued-at timestamp (max age: 120 seconds)                     |
| `nonce` | Server-issued DPoP-Nonce (required when server enforces nonce) |
| `ath`   | Access token hash (required when using with a bound token)     |

#### `dpopRequired` フラグ

API キーは作成時に `dpopRequired: true` を設定することで DPoP を強制できます:

```bash
curl -X POST https://api.example.com/admin/api-keys \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "secure-key", "allowedOrigins": ["https://app.example.com"], "dpopRequired": true}'
```

`dpopRequired` が `true` の場合、有効な `DPoP` ヘッダーなしでトークン交換を行うと `400 invalid_dpop_proof` が返されます。

#### Bearer フォールバック

トークン交換時に `DPoP` ヘッダーが送信されず(かつ `dpopRequired` が `false` の場合)、サーバーはバインディングなしの標準 `Bearer` トークンを発行します。これにより、DPoP をサポートしていないクライアントとの下位互換性が維持されます。

| DPoP Header    | `dpopRequired` | Result                                      |
| -------------- | -------------- | ------------------------------------------- |
| Present, valid | `false`        | `token_type: "DPoP"` with `cnf.jkt` binding |
| Present, valid | `true`         | `token_type: "DPoP"` with `cnf.jkt` binding |
| Absent         | `false`        | `token_type: "Bearer"` (no binding)         |
| Absent         | `true`         | `400 invalid_dpop_proof` (rejected)         |

> **注意**: すべての DPoP バウンドリクエスト(トークン交換と API 呼び出し)は nonce ハンドシェイクに参加します。JavaScript SDK はこれを透過的に処理します。

#### SDK DPoP サポート

JavaScript SDK (`@geolonia/geonicdb-sdk`) は `crypto.subtle` が利用可能な場合に自動的に DPoP を有効にします:


* 初期化時に抽出不可能な ECDSA P-256 鍵ペアを生成
  
* トークン交換と API リクエストに DPoP 証明を添付
  
* `crypto.subtle` のない環境では Bearer モードにフォールバック
  
* トークン交換と API リクエストの両方で `use_dpop_nonce` リトライを自動的に処理
  
* WebSocket 接続は接続後の `dpop_bind` メッセージを使用して証明検証を行います

利用可能なすべてのメソッドについては、完全な SDK API リファレンスを参照してください。

#### DPoP と HTTP キャッシュの相互作用 (#1052)

DPoP は HTTP キャッシュフローの 3 つのポイントに影響します:


1. **`Vary` における DPoP 証明 JWT?** — いいえ。証明にはリクエストごとの `jti` と `iat` が含まれているため、これを `Vary` に追加するとすべてのリクエストがキャッシュミスになります。`Authorization` のバウンドされたアクセストークンが重要なキャッシュキーの次元です。証明は個別に検証され、本文コンテンツには影響しません。
   
2. **`304 Not Modified` における `DPoP-Nonce`** — はい、パススルーされます。キャッシュ制御ミドルウェアは 304 レスポンスヘッダー(`evaluateConditionalRequest`)で `DPoP-Nonce` をホワイトリストに登録します。サーバーが nonce をローテーションすると、`304` でも最新の nonce が配信されるため、クライアントが遅れることはありません。このパススルーがないと、`304` を受信したクライアントは古い nonce で再試行し、次のリクエストで `401 + use_dpop_nonce` に遭遇します。
   
3. **DPoP 認証失敗** — 古いまたは欠落している DPoP 証明は、`evaluateConditionalRequest` が実行される前に `requireAuth` で拒否されます([ポリシー伝播遅延](#policy-propagation-delay--http-cache-integrity-1050) のハンドラー順序を参照)。古い `If-None-Match` が以前の有効なセッションから `304` を復活させることはできません — レスポンスは `401` であり、決して `304` にはなりません。

セキュリティモデルについては SECURITY.md — DPoP & Cache Integrity を参照してください。

#### パスワードログインセッションバインディング (`POST /auth/dpop-bind`

)

上記の DPoP フローは **API キー**交換 (`/oauth/token`) を通じて取得されたトークンをバインドします。これは SDK がデータプレーンアクセスに使用するパスです。**人間の管理者**がメール/パスワードでサインインする管理コンソールはそのパスを経由しません — `POST /auth/login` はプレーンな Bearer セッショントークンを発行します。そのセッショントークンを保護するため(例: ブラウザストレージからの XSS 盗難に対して)、セッションは `POST /auth/dpop-bind` を介して DPoP 送信者制約トークンにアップグレードできます。

API キーフローとは異なり、Proof-of-Work は不要です(ユーザーは既にパスワードで認証済み)。リプレイ保護は同じ `DPoP-Nonce` ハンドシェイクを再利用します。

```text
1. POST /auth/login (email/password)            → Bearer access + refresh (no cnf)
2. Client generates a non-extractable ECDSA P-256 key pair
3. POST /auth/dpop-bind
   Authorization: Bearer <access>
   DPoP: <proof JWT>            (htm=POST, htu=.../auth/dpop-bind)
   → 401 + DPoP-Nonce  (first call without nonce)
   → retry proof with nonce
   → { accessToken, refreshToken, tokenType: "DPoP", ... }   (both tokens carry cnf.jkt)
4. Subsequent requests: Authorization: DPoP <token> + per-request DPoP proof
5. POST /auth/refresh: when the refresh token carries cnf.jkt, a DPoP proof is REQUIRED;
   the re-issued tokens stay bound to the same jkt.
```

注意:


* DPoP バウンドアクセストークンは `Authorization: Bearer` スキームでは使用**できません** — `requireAuth` は Bearer として提示された `cnf.jkt` トークンを `401` で拒否します。
  
* **ユーザーセッションのみ (#3579)。** API キーセッション (`grant_type=api_key`)、`client_credentials` トークン、または直接の `X-Api-Key` プリンシパルは `400 DPoP binding is only available for user sessions` を受け取ります。これらをバインドすると、キーの `policyId` なしで、かつリクエストごとのキーチェック外 (#3523) でユーザータイプのトークンを再発行することになります。マシンプリンシパルは発行時に DPoP を取得します: `dpopRequired` を持つ API キーを DPoP 証明と共に `/oauth/token` で交換します。JS SDK はパスワード `login()` の後にのみ `/auth/dpop-bind` を呼び出すため、影響を受けません。
  
* GeonicDB が発行していないトークン(外部 OIDC トークン)を使用した `Authorization: DPoP` は `401` で拒否されます: 証明をチェックするための `cnf.jkt` が存在しません (#3579)。
  

* クライアントキーペアは非抽出可能(`extractable: false`)にし、IndexedDB に永続化することで、リロード後も存続し、注入されたスクリプトによってエクスポートできないようにする必要があります。トークン値自体は `localStorage` に残しておくことができます:一度バインドされれば、盗まれたトークンは秘密鍵なしでは役に立ちません。
  
* これはファーストパーティ管理コンソール(例: geonicdb-console)を対象としています。サードパーティアプリの場合は、上記のスコープ付き API キー + DPoP モデルを推奨します。

***

## OAuth 2.0 M2M 認証

GeonicDB は OAuth 2.0 Client Credentials フローによるマシン間(M2M)認証をサポートしています。

### 概要

OAuth 2.0 Client Credentials フローは、サーバー間通信やバックグラウンドジョブなどのマシン間(M2M)シナリオに最適化された認証方式です。

### OAuth 2.0 を使用するタイミング


* **マシン間通信**: API 間呼び出し
  
* **バックグラウンドジョブ**: ユーザー操作なしのバッチ処理
  
* **サービス間統合**: マイクロサービス間の認証
  
* **CI/CD パイプライン**: 自動デプロイメントおよびテストにおける API アクセス
  
* **きめ細かなアクセス制御**: スコープベースの権限管理が必要な場合

### OAuth 2.0 と JWT 認証の違い

| Item                       | OAuth 2.0 Client Credentials                                    | JWT Authentication                                    |
| -------------------------- | --------------------------------------------------------------- | ----------------------------------------------------- |
| **Authentication subject** | Client application (machine)                                    | User (human)                                          |
| **Token acquisition**      | `POST /oauth/token`                                             | `POST /auth/login`                                    |
| **Credentials**            | Client ID + Client Secret (Basic auth)                          | Email + Password                                      |
| **Access control**         | Scope-based                                                     | Role-based                                            |
| **Token expiration**       | Short-lived (default: 1 hour; unlimited with `permanent` scope) | Access token: 1 hour, Refresh token: 7 days           |
| **Refresh token**          | None (re-request when expired)                                  | Available (can be refreshed via `POST /auth/refresh`) |

### OAuth クライアント管理

| Endpoint                                            | Method | Description              |
| --------------------------------------------------- | ------ | ------------------------ |
| `/admin/oauth-clients`                              | GET    | Get OAuth client list    |
| `/admin/oauth-clients`                              | POST   | Create OAuth client      |
| `/admin/oauth-clients/{clientId}`                   | GET    | Get OAuth client         |
| `/admin/oauth-clients/{clientId}`                   | PATCH  | Update OAuth client      |
| `/admin/oauth-clients/{clientId}`                   | DELETE | Delete OAuth client      |
| `/admin/oauth-clients/{clientId}/regenerate-secret` | POST   | Regenerate Client Secret |

### セルフサービス OAuth クライアント管理

ユーザーは管理者権限なしで自分の OAuth クライアントを作成および管理できます。セルフサービスで作成されたクライアントは、ユーザーにスコープされ、ロールベースの制限の対象となります。

| Endpoint                                         | Method | Description                       |
| ------------------------------------------------ | ------ | --------------------------------- |
| `/me/oauth-clients`                              | POST   | Create own OAuth client           |
| `/me/oauth-clients`                              | GET    | List own OAuth clients            |
| `/me/oauth-clients/{clientId}`                   | PATCH  | Update own OAuth client (partial) |
| `/me/oauth-clients/{clientId}`                   | DELETE | Delete own OAuth client           |
| `/me/oauth-clients/{clientId}/regenerate-secret` | POST   | Regenerate own client secret      |

**制限事項:**

* テナントごとのユーザーあたり最大 **5 個のクライアント**
  
* `policyId` はオプションです — 指定する場合、参照されるポリシーは既に存在し、同じユーザーによって作成されている必要があります。省略した場合、認可はテナントポリシー + ロールデフォルト(`user` デフォルトは GET のみの Permit)にフォールバックします
  
* `clientSecret` は作成時と再生成時にのみ返されます — 安全に保管してください

**PATCH 更新可能フィールド**(`PATCH /me/oauth-clients/{clientId}`):

| Field         | Type                 | Description                                                  |
| ------------- | -------------------- | ------------------------------------------------------------ |
| `name`        | string               | Client name                                                  |
| `description` | string               | Client description                                           |
| `policyId`    | string \| null | Policy binding (must be created by you, or `null` to unbind) |
| `isActive`    | boolean              | Activate / deactivate the client                             |

### トークンリクエスト

```bash
curl -X POST https://api.example.com/oauth/token \
  -u "$CLIENT_ID:$CLIENT_SECRET" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&scope=read:entities write:entities"
```

**レスポンス例:**

```json
{
  "access_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "read:entities write:entities"
}
```

### レート制限 (#1075)

`POST /oauth/token` は **クライアント IP** ごと、および **`client_id`** ごとにレート制限されており、`client_id+client_secret` ペアのオフラインなしブルートフォースを防ぎます。

| Bucket          | Per minute | Per hour | Per day | Burst |
| --------------- | ---------: | -------: | ------: | ----: |
| Per IP          |         20 |      100 |     500 |     5 |
| Per `client_id` |         10 |       60 |     200 |     2 |

両方のバケットがリクエストを許可する必要があります。いずれかを超過すると `429 Too Many Requests` が `Retry-After` ヘッダーとともに返されます。同じ IP ごとのスキームは `/auth/refresh` と `/auth/nonce` (`PUBLIC_RATE_LIMIT` の `auth` カテゴリ) も保護します。完全な設定については [QUOTAS.md — Public (Unauthenticated) Endpoint Rate Limit](../saas/quotas.md#public-unauthenticated-endpoint-rate-limit-1075) を参照してください。

### スコープシステム

| Scope                      | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `user` | `tenant_admin` | `super_admin` |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----: | :------------: | :-----------: |
| `read:entities`            | Read entities                                                                                                                                                                                                                                                                                                                                                                                                                                                               |    ✅   |        ✅       |       ✅       |
| `write:entities`           | Write entities (create/update/delete only)                                                                                                                                                                                                                                                                                                                                                                                                                                  |    ✅   |        ✅       |       ✅       |
| `read:subscriptions`       | Read subscriptions                                                                                                                                                                                                                                                                                                                                                                                                                                                          |    ✅   |        ✅       |       ✅       |
| `write:subscriptions`      | Write subscriptions (create/update/delete only)                                                                                                                                                                                                                                                                                                                                                                                                                             |    ✅   |        ✅       |       ✅       |
| `read:registrations`       | Read registrations                                                                                                                                                                                                                                                                                                                                                                                                                                                          |    ✅   |        ✅       |       ✅       |
| `write:registrations`      | Write registrations (create/update/delete only)                                                                                                                                                                                                                                                                                                                                                                                                                             |    ✅   |        ✅       |       ✅       |
| `read:rules`               | Read rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |    ✅   |        ✅       |       ✅       |
| `write:rules`              | Write rules (create/update/delete only)                                                                                                                                                                                                                                                                                                                                                                                                                                     |    ✅   |        ✅       |       ✅       |
| `read:custom-data-models`  | Read custom data models                                                                                                                                                                                                                                                                                                                                                                                                                                                     |    ✅   |        ✅       |       ✅       |
| `write:custom-data-models` | Write custom data models (create/update/delete only)                                                                                                                                                                                                                                                                                                                                                                                                                        |    ✅   |        ✅       |       ✅       |
| `admin:users`              | Access to user management API (`/admin/users`)                                                                                                                                                                                                                                                                                                                                                                                                                              |    ❌   |        ✅       |       ✅       |
| `admin:policies`           | Access to policy management API (`/admin/policies`, `/admin/policy-sets`)                                                                                                                                                                                                                                                                                                                                                                                                   |    ❌   |        ✅       |       ✅       |
| `admin:oauth-clients`      | Access to OAuth client management API (`/admin/oauth-clients`)                                                                                                                                                                                                                                                                                                                                                                                                              |    ❌   |        ✅       |       ✅       |
| `admin:metrics`            | Access to metrics API (`/admin/metrics`). Read only for `tenant_admin` — resetting the counters (`DELETE`, or `?reset=true`) is restricted to the environment super admin (id `super-admin`) or `platform_admin` (#3495). A `super_admin` stored in a deployment database receives 403. With `AUTH_ENABLED=false`, `/admin/*` is 404 and `GET /statistics?reset=true` is 403 (synthetic actor id `anonymous`). A custom XACML policy cannot grant the reset (#2236 / #3463) |    ❌   |        ✅       |       ✅       |
| `admin:tenants`            | Access to tenant management API (`/admin/tenants`)                                                                                                                                                                                                                                                                                                                                                                                                                          |    ❌   |        ❌       |       ✅       |
| `permanent`                | Set token to never expire (no expiration)                                                                                                                                                                                                                                                                                                                                                                                                                                   |    —   |        —       |       —       |
| `jwt`                      | JWT format token                                                                                                                                                                                                                                                                                                                                                                                                                                                            |    —   |        —       |       —       |

> **スコープの階層**: `write:X` は `read:X` を意味**しません** — スコープは独立しています。これにより、公開連絡フォームなどの書き込み専用ユースケースが可能になります。`admin:X` は `read:X` と `write:X` の両方を意味します。`admin:*` スコープを持つ OAuth トークンは Admin API にアクセスでき、通常の JWT ロールベース認証をバイパスします。通常の JWT トークン (`scope` フィールドなし) は下位互換性のためスコープチェックをスキップします。
>
> **セルフサービス (`/me/oauth-clients`) のロール制限**: ユーザーは自分のロールで許可されたスコープのみをリクエストできます。`user` はリソーススコープのみをリクエストできます。`tenant_admin` は `admin:tenants` を除く `admin:*` スコープを追加でリクエストできます。`super_admin` はすべてのスコープをリクエストできます。

***

## 現在のプリンシパル (`GET /me`

)

`/me/**` は認証 (`requireAuth`) を必要とし、その後 XACML を評価します (`requireAuthz`, #3577)。人間のロール (`user` / `tenant_admin` / `super_admin`) はデフォルトで `/me/**` Permit を持ちます。`api_key` / `oauth_client` はデフォルトで `GET /me` Permit のみを持ちます (クレデンシャルのイントロスペクション, #3481)。`/me/**` に対するカスタム `Deny` (`super_admin` が書き込み可能。パスなし Deny は `tenant_admin` も作成可能) は、HTTP `/me` に対して MCP/A2A セルフサービスと同じ方法で適用されます。レスポンスの形状は認証されたプリンシパルに依存します。ユーザーセッションは変更されません。プリンシパルのテナントが無効化されている間、`GET /me` (および他のすべての `/me/**` ルート) は **403** `Access denied: tenant is inactive` を返します (#3542)。

ユーザー (または環境のスーパー管理者) は既存のプロファイルを受け取ります: `id`、`email`、`role`、`tenantId`、`tenantName`、`availableTenants`。

API キー (`X-Api-Key`、または Bearer `api_key_session` トークン。`role: api_key`) はキードキュメントの所有者を返します。キーハッシュは含まれません。

```json
{
  "principal": "api_key",
  "keyId": "7610a684-....",
  "name": "geonicai-chat",
  "tenantId": "ed945710-....",
  "tenantName": "miya",
  "createdBy": "64052d34-....",
  "policyId": null
}
```

OAuth クライアントクレデンシャルトークン (`role: oauth_client`) は以下を返します:

```json
{
  "principal": "oauth_client",
  "clientId": "....",
  "tenantId": "ed945710-....",
  "tenantName": "miya",
  "createdBy": "64052d34-...."
}
```

`createdBy` は、所有ユーザーを持たない管理者作成のクライアント、およびフィールドが存在する前に書き込まれた作成者を持たない API キーのドキュメントの場合、`null` です。このプロパティは常に存在します。`tenantName` は、クレデンシャルがテナントを持たない場合、またはテナントが存在しなくなった場合、`null` です。

欠落または非アクティブなキー / クライアントは **401** `User not found` を返します。たまたま `apikey:` で始まる id を持つ `user` は、キーとしてではなく、ユーザーとして解決されます。

`GET /me` は API キーおよび OAuth クライアントプリンシパルに開かれている唯一の `/me` ルートです (#3481)。`/me/password`、`/me/api-keys`、`/me/oauth-clients`、および `/me/policies` は `role: api_key` (`api_key_session` トークンを含む) および `role: oauth_client` に対して **403** を返します。そうでなければ、制限されたキーが個人ポリシーを作成し、それを自分で発行した子キーにバインドして、自分自身の制限を解除できてしまいます。

作成者自体が API キー (`apikey:`) または OAuth クライアント (`oauth_`) であるキーまたは OAuth クライアントは、バインドされたポリシーに関係なく、認証時に拒否されます (#3484)。拒否は `X-Api-Key`、API キートークン交換 (`POST /auth/nonce` および `grant_type=api_key` を使用した `POST /oauth/token`)、`client_credentials` グラント、およびすでに発行されたクライアントクレデンシャルアクセストークンをカバーします。Admin API を通じてこれらの行をリスト、非アクティブ化、削除することは引き続き機能します。`api_key_session` トークンは、キーの `createdBy` が非人間になるか、キーが非アクティブ、削除、またはローテーションされた次のリクエストで拒否されます (#3523)。

## OIDC 外部 IdP 認証

GeonicDB は OIDC (OpenID Connect) に準拠した外部 IdP による認証をサポートしています。

### 有効化

```bash
export AUTH_ENABLED=true
export OIDC_ENABLED=true
export OIDC_ISSUER_URL=https://accounts.google.com
export OIDC_AUDIENCE=your-client-id.apps.googleusercontent.com
# default: require email_verified for first-time email link (#3932)
export OIDC_REQUIRE_EMAIL_VERIFIED=true
```

`OIDC_AUDIENCE` は `OIDC_ENABLED=true` の場合は **必須** です。GeonicDB に登録された OIDC クライアント ID (ID トークンの `aud` クレームに表示される値) に設定してください。空または空白のみの値は `AuthService` / `OidcService` の構築時にフェイルクローズドとなります (認証を構築する最初のリクエストは設定が修正されるまで 500 を返します) (#3933)。

### 移行 (#3933)

以前に `OIDC_ENABLED=true` で実行し `OIDC_AUDIENCE` を未設定のままにしていた場合は、アップグレード **前に** 登録されたクライアント ID に設定してください。`aud` にその値が含まれないトークンは拒否されます。OIDC が無効なデプロイメントは影響を受けません。

### Audience / azp プロファイル (#3933)

GeonicDB は `aud` クレーム (文字列または配列) が `OIDC_AUDIENCE` を **含む** 場合に ID トークンを受け入れます。`azp` クレームは **検証されません** — OIDC Core 1.0 errata set 2 §2 は azp を使用する拡張機能が実装されていない場合に `azp` を無視することを推奨しており、いくつかの IdP (Google ハイブリッド、Auth0、Entra、Keycloak アクセストークン) は通常 `azp` ≠ GeonicDB オーディエンスを発行します。

### 動作 (#3932)


1. クライアントは外部 IdP から **ID トークン** を取得します (不透明なアクセストークンではありません)
   
2. GeonicDB API リクエストに `Authorization: Bearer <id_token>` を含めます
   
3. GeonicDB は OIDC Discovery + JWKS を介して署名を検証し、`aud` に `OIDC_AUDIENCE` が含まれることを確認します ([OIDC Core 1.0 §3.1.3.7](https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation))。`sub` クレームは空でない文字列 (≤255) である必要があります。検証時にメールクレームは **必須ではありません** (事前リンクされたサブジェクトはメールなしで認証されます)。自動リンクのための欠落 / `email_verified` の処理は署名検証では **行われません**。これは以下のプリンシパル解決の一部です
   
4. **プリンシパル解決 (安定した `(iss, sub)` が優先)**:
   
   * GeonicDB ユーザーがトークンと一致する `oidcIssuer`/`oidcSub` を既に持っている場合 → そのユーザーとして認証します (`email_verified` は不要、メールクレームが欠落している場合があります)。別のローカルユーザーとの衝突チェックは `OIDC_EMAIL_CLAIM` が標準の `email` で `email_verified===true` の場合にのみ実行されます
     
   * それ以外の場合、**メール自動リンク** は次のすべての条件を満たす場合にのみ許可されます: `OIDC_EMAIL_CLAIM` が標準の `email`、`OIDC_REQUIRE_EMAIL_VERIFIED=true`、および `email_verified === true` (厳密なブール値 — 文字列 `"true"` は拒否されます)。ユーザーはメールで検索されます。成功すると GeonicDB はそのユーザーに `(iss, sub)` を CAS バインドします。既に異なる `sub` にバインドされているユーザーは拒否されます
     
   * それ以外の場合 (事前リンクなし、または Entra / カスタムクレームモード) → 拒否します。**サイレントなメールフォールバックはありません**
     
5. 解決されたユーザーが存在し、アクティブで、強制的なパスワード変更が保留されていない場合、認証は成功します
   
6. リクエストはユーザーのプライマリテナント (`primaryTenantId`) にスコープされます。ユーザーはそのテナントで **アクティブなメンバーシップ** を保持している必要があり、有効なロールはメンバーシップのロール (`membership.role`) であり、`user.role` ではありません — テナントなしのログインおよび `/auth/refresh` と同じルールです (#3546)。アクティブなプライマリテナントメンバーシップがない場合、トークンは拒否されます (401/403)。`PUT /admin/tenants/{tenantId}/users/{userId}` でアクセスを復元してください。`super_admin` にはメンバーシップがなく、免除されます
   
7. プライマリテナントはアクティブである必要があります

WebSocket 接続は同じ解決を使用します。ライブセッションの再チェックは `userId` + 同じアクティビティ / メンバーシップ / テナントガードを使用します (接続後、メールはサブジェクトキーではありません)。

### `(iss, sub)` の事前リンク (管理者)

`PATCH /admin/users/{userId}` は `oidcIssuer` と `oidcSub` を受け入れます (両方を設定するか、両方を `null` にしてリンク解除します)。


* リンクの設定 (非 null ペア): **クロステナント管理者のみ** (`super_admin` / `platform_admin` — `managesAcrossTenants`)。`tenant_admin` はリンクを設定できません (ハイジャックリスク)
  
* リンク解除 (`null`/`null`): `tenant_admin` は自分のテナント内のユーザーのリンクを解除できます (IdP アカウントが再作成された場合に必要)

### 移行 / IdP ノート

| IdP                                                              | Typical setup                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google / Auth0 (issues `email_verified`)                         | Keep `OIDC_REQUIRE_EMAIL_VERIFIED=true` (default). Pre-register the GeonicDB user by email; first successful verified token CAS-binds `(iss, sub)`                                                                                                                                                   |
| **Microsoft Entra ID** (ID tokens usually omit `email_verified`) | Set `OIDC_REQUIRE_EMAIL_VERIFIED=false`. Email auto-link is then **disabled**. A cross-tenant admin must `PATCH` each user with that user's Entra token `iss` and `sub` (OIDC subject — **not** the directory object id / `oid` claim; per-app `sub` from the ID token) before Bearer ID tokens work |
| Custom `OIDC_EMAIL_CLAIM` (e.g. `upn`, `preferred_username`)     | Email auto-link is always disabled (`email_verified` only vouches for the standard `email` claim per OIDC Core §5.1). Pre-link `(iss, sub)` is required                                                                                                                                              |

破壊的変更 (#3932): 以前は未検証 / 欠落した `email_verified` がローカルメールと一致することのみで認証されたトークンは、この変更後は拒否されます。

### ID トークンクレーム検証 (#3934)

GeonicDB は **OIDC ID トークン** のみを受け入れます (IdP JWKS で検証される任意の JWT は受け入れません)。クレームはランタイムでチェックされます — TypeScript の型だけがゲートとして使用されることはありません。ヘッダー `typ` が `at+jwt` / `application/at+jwt` ([RFC 9068](https://www.rfc-editor.org/rfc/rfc9068.html) Access Token) の場合、ペイロードクレームが通過する場合でも `wrong_token_profile` として拒否されます。

| Claim | Rule                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------ |
| `iss` | Non-empty string; must equal Discovery `issuer`                                                                    |
| `sub` | Non-empty string, length ≤ `AUTH.OIDC_MAX_SUB_LENGTH` (#3932). Invalid → `missing_sub`                             |
| `aud` | String or string array that includes `OIDC_AUDIENCE` (#3933). Wrong type / missing / mismatch → `invalid_audience` |
| `exp` | Finite number (JSON number, not string/null). Rejected when `now >= exp + skew`                                    |
| `iat` | Finite number (required by the ID Token profile)                                                                   |
| `nbf` | Optional. If present: finite number; rejected when `now < nbf - skew`                                              |

**クロックスキュー** のデフォルトは `src/config/defaults.ts` の `AUTH.OIDC_CLOCK_SKEW_SECONDS` (**60 秒**) です。`exp` と `nbf` の両方に適用されるため、`nbf ≈ iat` を発行する IdP (例: Keycloak) は、Context Brokerクロックが数秒遅れている場合でも拒否されません。

**破壊的変更 (#3934):** 以前は欠落 / `null` / 文字列 `exp`、欠落した `iat`、非文字列の `iss`/`sub`、またはクロックスキュー許容範囲を超えて未来の `nbf` で通過したトークンは拒否されるようになりました。アップグレード前に IdP マッパーが数値の `exp`/`iat` (および使用される場合は `nbf`) を発行することを確認してください。

参照: [OIDC ID Token Validation](https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation)、[RFC 7519 `nbf`](https://www.rfc-editor.org/rfc/rfc7519#section-4.1.5)。

### サポートされている IdP


* Google
  
* Microsoft Entra ID (Azure AD) — 事前リンク + `OIDC_REQUIRE_EMAIL_VERIFIED=false` が必要です (上記参照)
  
* Auth0
  
* その他の OIDC 準拠 IdP

***

## XACML ポリシーベース認可

GeonicDB は XACML 3.0 準拠のポリシーベースアクセス制御をサポートしています。

### XACML ポリシー Zod 制限 (#2712)

Write-path Zod 上限は `/admin/policies`、`/me/policies`、および MCP `admin` ポリシー形状に適用されます (SoT: `src/config/defaults.ts` の `SECURITY.MAX_POLICY_*`):

| Dimension                                          | Cap                                  |
| -------------------------------------------------- | ------------------------------------ |
| `rules`                                            | `MAX_POLICY_RULES` (10)              |
| `target.subjects` / `resources` / `actions` (each) | `MAX_POLICY_TARGET_MATCHES` (15)     |
| `conditions` per rule                              | `MAX_POLICY_CONDITIONS_PER_RULE` (5) |

これらは**配列アイテム数**の制限です。個別の文字列 `.max()` 制限は Zod の UTF-16 コードユニットセマンティクスを使用します。これらは `MAX_AUTHENTICATED_CONTROL_PLANE_REQUEST_BODY_BYTES` (1 MiB UTF-8) とバイト単位で整合していま**せん**。マルチバイトペイロードは Zod 上限以下であっても 1 MiB を超える可能性があります — HTTP ボディ上限は `/me`/`/admin` の絶対的なセーフティネットとして機能します。

**破壊的変更の非対称性:** 上限の引き上げは非破壊的ですが、**引き下げは破壊的**です。PDP 評価は保存されたポリシーを Zod を通じて再検証しないため、オーバーサイズのドキュメントは引き続き認可を行いますが、完全な形状を再送信する `PATCH`/`PUT`/`POST` は **400** を返します。

**15 マッチの根拠 (#2712):** 部分的なステージング Admin API サンプル (1 つの可視テナントのみ) では `resources` 最大値が **9** でした; 15 は 1.67× のマージンです。他のすべてのテナントおよびグローバル (`tenantId: null`) ポリシーは測定され**ませんでした** — 以下の監査を実行した後にデプロイしてください。

**デプロイ前監査 (読み取り専用)。** 編集不可能になるポリシーにフラグを立てます:

```javascript
// mongosh — run per DB that has a `policies` collection
// $isArray で保護: 保存済みの非配列値で $size が監査全体を止めないようにする
const asArray = (expr) => ({
  $cond: [{ $isArray: expr }, expr, []],
});
db.policies.aggregate([
  { $project: {
      policyId: 1, tenantId: 1,
      rulesCount: { $size: asArray('$rules') },
      maxMatches: { $max: [
        { $size: asArray('$target.subjects') },
        { $size: asArray('$target.resources') },
        { $size: asArray('$target.actions') },
        { $max: { $map: { input: asArray('$rules'), as: 'r', in: { $size: asArray('$$r.target.subjects') } } } },
        { $max: { $map: { input: asArray('$rules'), as: 'r', in: { $size: asArray('$$r.target.resources') } } } },
        { $max: { $map: { input: asArray('$rules'), as: 'r', in: { $size: asArray('$$r.target.actions') } } } },
      ]},
      maxConditions: { $max: { $map: {
        input: asArray('$rules'), as: 'r',
        in: { $size: asArray('$$r.conditions') },
      }}},
  }},
  { $match: { $or: [
    { rulesCount: { $gt: 10 } },
    { maxMatches: { $gt: 15 } },
    { maxConditions: { $gt: 5 } },
  ]}},
])
```

### ポリシー管理

| Endpoint                                | Method | Description             |
| --------------------------------------- | ------ | ----------------------- |
| `/admin/policies`                       | GET    | Get policy list         |
| `/admin/policies`                       | POST   | Create policy           |
| `/admin/policies/{policyId}`            | GET    | Get policy              |
| `/admin/policies/{policyId}`            | PATCH  | Update policy (partial) |
| `/admin/policies/{policyId}`            | PUT    | Replace policy          |
| `/admin/policies/{policyId}`            | DELETE | Delete policy           |
| `/admin/policies/{policyId}/activate`   | POST   | Activate policy         |
| `/admin/policies/{policyId}/deactivate` | POST   | Deactivate policy       |

> **`policyId` / `policySetId` 命名規則 (#1628)。** クライアント指定 ID には URL エンコーディングが必要な文字 (非 ASCII、スペース、`%`) が含まれる場合があります。そのようなポリシーをアドレス指定する際はパス内で ID をパーセントエンコードしてください — API Gateway は `event.path` をパーセントエンコードして配信し、サーバーは正確に 1 回デコードします。したがって、二重エンコードされたセグメントは単一エンコード値に解決されます (`a%2520b` は ID が文字通り `a%20b` であるポリシーをアドレス指定します)。不正なエスケープ (`a%b`) は、コントローラーが `400` を返す前に PDP でフェイルクローズされ `Indeterminate` → `403` となります — `/admin/policies/{id}` と `/me/policies/{id}` の両方で発生します (後者は #3577 / #3609 以降 `requireAuthz` を通過します) (#3592 / #3608; エントリーポイントを `400` に整合させることは #3602 で追跡されています)。文字通り `%` を含む ID は以前は生の形式でアドレス指定可能でしたが、現在は二重エンコードが必要です (`50%-rule` は `50%25-rule` としてアドレス指定されます)。作成時に返される `Location` ヘッダーは既にパーセントエンコードされているため、そのまま従うことで動作しますが、以下に示す 2 つの ID 形状は除きます。
>
> 2 つの ID 形状は API を通じて到達不可能であり、避けるべきです:
>
> * `/` を含む ID (`policyId` と `policySetId` の両方) — ルートパターンは単一のパスセグメント (`[^/]+`) にマッチし、API Gateway がパス内の `%2F` を正規化する方法は環境に依存します。
> * 正確な `policyId` `import` — `POST /admin/policies/import` が `/admin/policies/{policyId}` ルートをシャドウします。(任意の 1 文字をパーセントエンコードする、例えば `%69mport` は `{policyId}` ルートにフォールスルーして到達します。) この衝突は `policyId` に特有です; `policySetId` には `import` ルートがないため、`import` の `policySetId` は到達可能です。
>
> `policyId` と `policySetId` は現在、長さのみ (最大 256 文字) で検証され、文字クラスでは検証されません。

### ターゲットマッチングセマンティクス

`subjects`、`resources`、`actions` 配列内において:

* **同じ `attributeId`**: OR(いずれかがマッチすれば満たされる) — 例: `[{method: POST}, {method: PATCH}]` は POST **または** PATCH にマッチ
  
* **異なる `attributeId`**: AND(すべてマッチする必要がある) — 例: `[{role: user}, {userId: u1}]` は両方が必要
  
* **カテゴリをまたぐ場合**(`subjects` + `resources` + `actions`): AND

#### XACML XML インポートサブセット (#3228)

`POST /admin/policies/import` は、上記のフラットモデルに損失なくマッピングできる XACML 3.0 `<Target>` のサブセットのみを受け付けます([XACML 3.0 §7.6](https://docs.oasis-open.org/xacml/3.0/xacml-3.0-core-spec-os-en.html))。仕様では、`AnyOf` 要素は AND、1つの `AnyOf` 内の `AllOf` 要素は OR、1つの `AllOf` 内の `Match` 要素は AND です。フラットモデルは、1つの `attributeId` 内では OR、`attributeId` をまたぐ場合は AND です。Target(ポリシーレベルまたはルールレベル)は、以下のすべてが満たされる場合にのみ保存されます:


* 各 `AllOf` が正確に1つの `Match` を含む
  
* 1つの `AnyOf` 内のすべての `Match` が同じカテゴリと `attributeId` を共有する
  
* 同じ `attributeId` が複数の `AnyOf` に出現しない(subject、resource、action をまたぐ場合を含む)
  
* `MatchId` が正確に `urn:oasis:names:tc:xacml:1.0:function:string-equal` または `urn:oasis:names:tc:xacml:1.0:function:string-regexp-match` である。その他の関数(id に単に `regexp` を含むもの(`string-starts-with`、`integer-greater-than`、…)を含む)は、`string-equal` として保存されるのではなく拒否されます

その他の形式は **400** です。これには、`method=GET` と `path=/v2/entities` を AND で結ぶ `AllOf`、同じ `attributeId` が複数の `AnyOf` 要素に分割されている場合、未知のカテゴリ、`AttributeValue` または `AttributeDesignator` が欠けている `Match` が含まれます。エラー詳細は、作成者に対して選言を別々の Rule に分割するよう指示します:`Rule単位のTargetに分割してください`。インポートは、その形式をデカルト積(`actions=[GET,POST]` × `resources=[...]`)に展開しません。展開すると XML が述べていなかった組み合わせ(例: `POST /v2/entities`)を Permit することになるためです。

**破壊的変更。** この変更前にエクスポートされた XML は、各マッチ値を独自の `AnyOf` に配置していました。標準の XACML PDP はそれを値の AND(GET and POST)として読み取り、再インポート時に **400** を返すようになります。エクスポートは `attributeId` ごとに1つの `AnyOf` を、値ごとに1つの `AllOf` を書き込むようになり、属性内では OR となります。

**スコープ。** `parseXacmlToPolicy` は `scope` を設定しません。したがって、`POST /admin/policies/import` は常に `scope=tenant` を保存します(`createPolicy` は省略されたスコープをデフォルトで `tenant` にします)。インポートされたポリシーは、単一の API キーではなく、テナント内のすべてのプリンシパルに適用されます。個人用ポリシーは `POST /me/policies` で作成されます。インポートルートにはスコープパラメータがありません。

#### XACML 条件、優先度、およびインポート制限 (#3578)

Rule `conditions`(`time-range` / `ip-range` / `custom`)およびポリシー `priority` は、この実装では損失のない XACML 3.0 表現を持たないため、エクスポートは GeonicDB 拡張名前空間 `urn:geolonia:geonicdb:xacml:extension:conditions` にそれらを書き込み、インポートは正確にその形式を読み戻します:

```xml
<Policy xmlns="urn:oasis:names:tc:xacml:3.0:core:schema:wd-17" xmlns:gdb="urn:geolonia:geonicdb:xacml:extension:conditions" gdb:Priority="50" PolicyId="..." RuleCombiningAlgId="...">
  <Rule RuleId="allow-internal" Effect="Permit">
    <gdb:Conditions xmlns:gdb="urn:geolonia:geonicdb:xacml:extension:conditions">
      <gdb:Condition Type="ip-range">
        <gdb:AllowedIp>192.168.1.0/24</gdb:AllowedIp>
      </gdb:Condition>
      <gdb:Condition Type="time-range" StartTime="09:00" EndTime="18:00" Timezone="Asia/Tokyo"/>
      <gdb:Condition Type="custom"><gdb:Expression>...</gdb:Expression></gdb:Condition>
    </gdb:Conditions>
  </Rule>
</Policy>
```

\#3578 以前は、エクスポートは Rule `conditions` とポリシー `priority` を削除し、インポートはそれらを無視していました。ラウンドトリップにより、条件付き Permit が無条件 Permit に変わり、`priority` がデフォルトの `100` にリセットされました。`100` では、ポリシーはロールデフォルトと優先度グループを共有し、それらによってシャドウされる可能性があります。インポートは現在 **400** で拒否します:


* 標準 XACML `<Condition>` を含む Rule(`<Apply>` 式は内部モデルにマッピングされず、削除すると Rule が拡大する)
  
* 上記の名前空間宣言のない `<gdb:Conditions>`、Rule ごとに複数存在する場合、または `<gdb:Condition>` / `<gdb:AllowedIp>` / `<gdb:Expression>` 以外の要素またはテキストがある場合
  
* `POST /admin/policies` と同じ Zod `ConditionSchema` に失敗する条件(タイプ、フィールド長、最大 `MAX_POLICY_CONDITIONS_PER_RULE`)
  
* `0..MAX_POLICY_PRIORITY` 範囲の整数でない `gdb:Priority`
  
* `gdb:Conditions` / `gdb:Condition` / `gdb:AllowedIp` / `gdb:Expression` 以外の名前空間プレフィックス付き要素。非 ASCII プレフィックスも含まれます。例は `<xacml:Condition>`、`<x:Target>`、`<gdb:Target>`、および別のプレフィックス下の拡張です。パーサーはプレフィックスなしの XACML 名のみを読み取るため、そのような要素は削除され、Rule が拡大されます
  
* 閉じられていない `<Target>` または複数の `<Target>` を持つ Policy または Rule。Target を削除すると、Rule がすべてのリクエストに適用されることになります
  
* パーサーが読み取らない位置にある `<Target>` または `gdb:` 要素。Policy `<Target>` は最初の `<Rule>` の前にのみ読み取られます。その境界はタグ名によって見つけられるため、`<RuleExtra/>` は Policy ヘッダーを終了しません。`gdb:` 要素は Rule の `<gdb:Conditions>` 内でのみ読み取られます。例えば、Rules の後に配置された Policy `<Target>`、または `<gdb:Condition>` の外側にある `gdb:AllowedIp` は、削除される代わりに **400** となります
  
* `</Policy>` のない `<Policy>`、または `</Policy>` の後に空白以外がある場合。`>` の前に空白がある `</Policy >` は受け入れられます。Policy の後に配置された `<Rule>` は、そのルールの1つとしてインポートされません
  
* 属性が不正な形式(引用符なしの値、属性間に空白なし、余分なテキスト)であるか、名前が重複している開始タグ(XML 1.0 §3.1 は重複属性を禁止)。属性は XML パーサーが読み取るように、`NAME="..."` または `NAME='...'` として順番に消費されます。別の単一引用符値内に書かれた `RuleId="..."` / `Effect="..."` は、属性ではなくその値の一部です。#3578 以前は、実際の属性として読み取られていました:`<Rule RuleId="r" X='a Effect="Permit"' Effect="Deny"/>` は `Permit` としてインポートされました
  
* XML コメント、CDATA セクション、`DOCTYPE`、および先頭の `<?xml ...?>` 宣言以外の処理命令。パーサーはテキストを直接スキャンするため、コメントアウトされた `<Rule ... Effect="Permit"/>` は実際のルールとしてインポートされ、コメント内の `</Policy>` は Policy を早期に終了させます。エクスポートはこれらの構造を書き込みません
  
* 閉じタグのない `<Rule>`、または `RuleId` / `Effect="Permit|Deny"` のないもの。これらは以前は黙ってスキップされていました
  
* `SECURITY.MAX_XACML_IMPORT_BYTES`(1 MiB)より大きいドキュメント、または `SECURITY.MAX_XACML_ELEMENT_COUNT`(20000)より多い `<` 文字を持つもの

インポートは、属性値とテキスト(`Description`、`AttributeValue`、`gdb:AllowedIp`、`gdb:Expression`)において、文字参照を正確に1回デコードします。5つの事前定義エンティティ(`&lt;` `&gt;` `&quot;` `&apos;` `&amp;`)および数値参照(`&#80;` / `&#x50;`)を受け入れます。未知のエンティティ、単独の `&`、XML `Char` でない数値参照、または属性値内の `<` は **400** です。#3578 以前は、テキストはまだエスケープされた状態で保存されていたため、`a&b` の `matchValue` はラウンドトリップ後に `a&amp;b` として戻ってきました。`RuleId` や `AttributeId` などの属性値はまったくデコードされていませんでした。

インポートパーサーは `indexOf` でスキャンするため、その時間は入力に対して線形です。以前のパーサーはネストされた `[\s\S]*?` 正規表現から構築されており、閉じられていない `<Rule ...>` 開始タグの連続により超線形になりました:8 KiB で約 1 秒、16 KiB で 16 秒。1 MiB / 20000 の上限は、Zod 制限が許可する最大のポリシーより上に設定されています。条件のみの場合、そのポリシーは約 264 KB と 10,144 要素にエクスポートされます。完全なターゲットの場合は約 856 KB と 14,620 要素です。したがって、作成できるすべてのポリシーをエクスポートして再度インポートできます。

`ip-range` `allowedIps` エントリは、すべての書き込みパス(HTTP、MCP、XACML インポート)で検証されます。エントリは IPv4 アドレス、またはプレフィックスが `0..32` の整数である IPv4 CIDR でなければならず、すべてのオクテットは 1-3 桁の10進数で書かれる必要があります。その他は **400** です:任意の IPv6 アドレスまたは CIDR、`10..0.0/24`、`/33`、`/-1`、空のプレフィックス `/`、`/8.5`、または非 IP 文字列。PDP はそのようなエントリを「マッチなし」として評価するため、それらを使用した Deny ルールは黙って発動しませんでした。#3600 以降、そのようなエントリを持つ保存された Deny は、`Indeterminate`(フェイルクローズ)として評価されます。単一の IPv6 アドレスも拒否されます。PDP は非 CIDR エントリを `sourceIp` とプレーン文字列として比較するため、異なる書き方をされた同じアドレス(`2001:DB8::1` / `2001:db8:0::1`)はマッチしません。PDP とテナント IP 制限は現在 `core/auth/ip/cidr.ts` を共有しています。そのモジュールは `/0` マスクを `0` として計算します。古い PDP ローカルの `~((1 << 32) - 1)` は、JS のシフト数が mod 32 で取得されるため、`0xFFFFFFFF` を返していました。その結果、`0.0.0.0/0` は以前は `0.0.0.0` のみに正確にマッチしていました。

**省略または空の `subjects` / `resources` / `actions`**: そのカテゴリはスキップされ、そのカテゴリに対する**すべての**リクエストにマッチします。これは XACML 3.0 の空 `<Target/>` セマンティクス(`policy.pdp.ts` の `matchTarget`)です:`resources` / `actions` のみ(`subjects` なし)のポリシーは**正当な**リソースのみ / アクションのみのポリシーです — テナント内の**すべての**サブジェクト(`anonymous` と `tenant_admin` を含む)に適用されます。空の配列(`"subjects": []`)は、フィールドを省略した場合と同じように扱われます。

#### subjects 省略の罠 (#2934)

カスタムポリシーは、**優先度グループごとの first-applicable**、次に**グループ間の deny-overrides**(適用可能な任意のグループからの Deny が勝つ)を使用してロールデフォルトと組み合わされます。Deny を持つポリシーで `subjects` を省略すると、Deny がすべてのロールに適用され、ロールデフォルトの Permit をオーバーライドします — `tenant_admin` を含みます。

```json
{
  "policyId": "readonly-paths-missing-subjects",
  "description": "INTENDED for api_key only — but subjects omitted",
  "target": {
    "resources": [
      {"attributeId": "path", "matchValue": "/v2/**", "matchFunction": "glob"},
      {"attributeId": "path", "matchValue": "/ngsi-ld/**", "matchFunction": "glob"}
    ]
  },
  "ruleCombiningAlgorithm": "first-applicable",
  "rules": [
    {
      "ruleId": "allow-read",
      "effect": "Permit",
      "target": {
        "actions": [
          {"attributeId": "method", "matchValue": "GET"}
        ]
      }
    },
    {"ruleId": "deny-others", "effect": "Deny"}
  ]
}
```

上記のポリシーでは、`tenant_admin` の POST は拒否されます。カスタムポリシーがマッチし（`subjects` フィルタなし）、`deny-others` が発火し、クロスグループの deny-overrides が `tenant_admin` のデフォルト Permit を上回ります。修正方法: ポリシーがプリンシパルのサブセットを対象とする場合は、常に `subjects` を設定してください。例: `[{"attributeId": "role", "matchValue": "api_key"}]`。

[docs/customer/QUICKSTART.md](./customer/QUICKSTART.md)（MCP / DPoP ポリシーレシピ）および [INSTRUCTION.md appendix D.2](./customer/INSTRUCTION.md) も参照してください。

#### 作成時の API 警告なし (#2934)

GeonicDB は、ポリシーの作成/更新時に `subjects` が省略された場合、警告フィールドまたはヘッダーを返し**ません**。理由:


1. **リソースのみ / アクションのみのポリシーは有効な XACML です** — 作成時の警告は意図的な形式に対しても発火し、オペレーターにそれを無視するよう訓練することになります。
   
2. 警告ボディフィールドまたはヘッダーの追加は **公開 API サーフェスの変更** です。静的解析では検出できないランタイムデータの落とし穴に対しては、優先度低のドキュメントが適切なレイヤーです (#2921)。
   
3. リポジトリ内に管理 UI がないため、ソフト警告を表示する手段がありません。Admin API が書き込みパスのままです。

`subjects` を必須にし**ない**でください — それは正当なリソースのみ / アクションのみのポリシーを壊すことになります（破壊的変更）。

### Match 関数 (GeonicDB 拡張を含む)

ポリシーの Target 内の AttributeMatch で利用可能な `matchFunction` 値:

> **`path` × `string-regexp` (#3610, deprecated)。** `matchValue` に `%3A` / `%40` 以外の percent-escape (hex 大文字小文字無関係; 例: `%53`, `%20`) を含む `path` に対する `string-regexp` は、create / update / XACML import / MCP 時に **400** で拒否されます。これは、pattern 側と actual 側の encoding を網羅的に比較できず、Deny が静かに見逃される可能性があるためです。`string-equal` または `glob` (どちらも正規化形式で比較) を使用してください。注意: `glob` は XACML へのエクスポート時に `string-regexp-match` として出力されるため、`%20` を含む glob は unsafe regexp としてラウンドトリップされ、再インポート時に拒否されます。既に保存されているポリシーは従来通り評価を継続し、ポリシー + パターンごとに 1 回 (256 個の異なるエントリ後に再発行) 警告をログに記録します (`policyId` を含み、matchValue は決して含まない)。
>
> **制限 (best-effort)。** 検出は文字通り記述された `%HH` のみを対象とします。同じテキストを構築する regexp 表記 (`\x25`, `[%]`, `%(?:)53`, `%5{1}3`, …) や、`${subject.*}` テンプレートの展開値にのみ現れる `%XX` は **捕捉しません**。path **Deny** には `glob` / `string-equal` を使用してください。また: そのような値を既に含む保存済みポリシーに対する **以降のあらゆる** PATCH/PUT は 400 で失敗します — 無関係なフィールド (例: `description`) のみに触れる場合でも — 検証がマージされたドキュメント全体に対して実行されるためです。ポリシー **セット** は `tenant_admin` を含むすべてのロールで検証されます (保存された `target` にそれを含むポリシーセットの `description` のみの PUT も 400 です)。ポリシーに対する `tenant_admin` の場合、既存の 403 ("string-regexp is not allowed for path attributes") が引き続き優先されます。

| matchFunction   | Description                              | XACML 3.0                        |
| --------------- | ---------------------------------------- | -------------------------------- |
| `string-equal`  | Exact match (default)                    | Standard                         |
| `string-regexp` | Regular expression match                 | Standard (`string-regexp-match`) |
| `glob`          | Glob pattern match (`*`, `**` supported) | **GeonicDB extension**           |

**自動 glob 検出 (GeonicDB 拡張)**: `matchFunction` が省略された場合、`matchValue` に `*` が含まれていれば自動的に `glob` として処理されます。それ以外の場合は `string-equal` が適用されます。

**XACML XML エクスポート**: `glob` は XACML 3.0 仕様に存在しないため、エクスポート時に正規表現に変換され、`string-regexp-match` として出力されます。同じ `attributeId` の値は、値ごとに 1 つの `AllOf` を持つ 1 つの `AnyOf` になります (#3228); [XACML XML import subset](#xacml-xml-import-subset-3228) を参照してください。

#### `string-regexp` パターン制約 (#1935)

`string-regexp` の `matchValue` は **書き込み時** に検証されます — `POST/PATCH/PUT /admin/policies`、`POST /admin/policies/import` (XACML XML)、`/me/policies`、およびポリシーセットエンドポイントで。パターンは以下の場合に **400** で拒否されます:


* **200 文字** を超える、
  
* 空、または空白のみを含む、
  
* 構文的に正しい正規表現でない、
  
* `(a+)+` のようなネストした量指定子を含む (ReDoS リスク)、
  
* 10 個を超える選択肢、または 5 個を超える後方参照を含む、
  
* 無制限繰り返しグループへの後方参照を使用し、隣接する重複する繰り返しが次数 3+ に達する (例: `(.*)(.*)\1x`, `^(\d+)(\d+)\1$`) (#3935)。

> これらの制限は **GeonicDB 拡張** であり、XACML 3.0 の要件ではありません。仕様が定義しているのは以下の評価時動作です (`Indeterminate` on evaluation error)。

パターンが **評価時** に評価不可能であることが判明した場合、XACML 3.0 §7.6 (Target evaluation) に従って match は **`Indeterminate`** として評価されます ("never matches" ではありません)。`Indeterminate` は Rule (§7.11) および Policy (§7.12) に伝播し、最終的に **fail-closed として `Deny`** に解決され、list-query の行フィルタ (policy-to-filter) は同じリクエストに対して "no readable rows" (403) に低下します。

評価時 `Indeterminate` に達する 3 つの状況:


1. **`${subject.*}` テンプレート展開** が評価不可能なパターンを生成する (書き込み時検証は *未展開* 文字列のみを検査できる)。
   
2. **書き込み時検証が存在する前に保存されたポリシー**、またはサービスレイヤーをバイパスするパスによって書き込まれたポリシー (例: `scripts/backup-import.ts` は生の `insertMany` でドキュメントを復元する)。既存のドキュメントに対して移行は実行されません — 評価時 `Indeterminate` がそれらをカバーします。
   
3. **PDP が評価できないエントリを `ip-range` `allowedIps` に含む保存済み `Deny` ルール** (#3600) — IPv6 アドレス / CIDR、範囲外のプレフィックス、または #3578 の書き込み時チェック前に保存された非 IP 文字列。他のエントリが送信元 IP と一致しない場合、ルールは `Indeterminate` (エントリごとの一致優先度: Match > Indeterminate > NoMatch) となり、fail-closed として `Deny` に解決されます (list 読み取り: 403)。そのようなエントリを含む `Permit` ルールは `NotApplicable` のまま (権限拡大なし)、IPv6 送信元 IP に対して与えられた有効な IPv4 CIDR は "no match" のまま、`sourceIp` が存在しない場合は変更されません。PR #3584 の `db.policies.find` クエリを使用してデプロイ前に保存済みポリシーを監査してください。

> 評価不可能なパターンを "never matches" として扱うことは、`Permit` ルールに対しては fail-closed ですが、**`Deny` ルールに対しては fail-open** です — 拒否が静かに適用されなくなります。`${subject.*}` テンプレートは、展開後のパターンが 200 文字制限内に収まるよう十分短く保ってください。

### 暗黙的ポリシー階層

GeonicDB は以下の暗黙的ポリシーを適用します (DB ルックアップをスキップ):

| Priority             | Role           | Behavior                                            |
| -------------------- | -------------- | --------------------------------------------------- |
| Custom policies (0+) | any            | Custom XACML policies always override defaults      |
| 0                    | `super_admin`  | Management APIs always Permit. Data APIs Deny (403) |
| 0                    | `tenant_admin` | Always Permit (all APIs within own tenant)          |
| -1                   | `user`         | GET → Permit, all other methods → Deny (readonly)   |
| -2                   | `api_key`      | All Deny (explicit Permit policy required)          |
| -3                   | `anonymous`    | All Deny (explicit Permit policy required)          |

> **重要**: カスタム XACML ポリシー (priority 0 以上) は常にロールデフォルトを上書きします。`user` に書き込みアクセスを許可するには、priority ≥ 0 の Permit ポリシーを作成してください。
>
> **タイブレーク**: 優先度が同じ場合、ポリシーは決定的な結果のために `policyId` の辞書順で評価されます。テナントカスタムポリシー (DB に保存) はロールデフォルトと結合され、一緒にソートされます。

### Resource 属性

ポリシー Target 内の `resources` で以下の属性が利用可能です:

| attributeId            | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Source                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `path`                 | HTTP request path (e.g. `/v2/entities/Room1`). Compared in **canonical form** (#3592): each path segment is `decodeURIComponent`'d once, then `/` → `%2F` and `%` → `%25` are re-escaped so segment boundaries and literal `%` stay stable. `string-equal` / `glob` matchValues are canonicalized the same way (`urn%3A…` ≡ `urn:…`). Glob `**` uses `[\s\S]*` so decoded newlines (`%0A` / `%0D` / `%E2%80%A8` / `%C2%85`) still match (`.` would fail-open). `string-regexp` only rewrites `%3A`/`%40` in the pattern, and the PDP evaluates against **four** actuals — raw, canonical, mixed (JS line terminators re-encoded), and colon-at (raw with the same `%3A`/`%40` rewrite as the pattern) — Match if any matches (Deny 空振り防止; a **Permit** regexp can also Match on raw / colon-at). Glob `%2A` decodes to `*` and becomes a wildcard; use `string-regexp` for a literal `*`. Undecodable actual paths (`%ZZ`) yield Indeterminate → Deny (fail-closed). | Request                                                                       |
| `tenantService`        | Tenant service name (`Fiware-Service` header). **Exception — `/custom-data-models`:** resolved from the authenticated actor's tenant, not from the header (see note below)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Request                                                                       |
| `servicePath`          | Service path (NGSIv2: resolved `TenantContext.servicePath` after CADDE `x-cadde-options` merge, e.g. `/devices`, `/opendata`. NGSI-LD: always `/` — the header is not part of the NGSI-LD spec, see note)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Request (resolved tenant)                                                     |
| `scope`                | NGSI-LD entity scope (comma-separated, e.g. `/Madrid/parks,/Madrid/gardens`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Entity context                                                                |
| `entityId`             | Target entity ID (e.g. `Room1`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Entity context / Subscription `entities[].id`                                 |
| `entityType`           | Target entity type (e.g. `Room`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Request (auto-extracted) / Entity context / Subscription `entities[].type`    |
| `entityOwner`          | Entity creator's userId (`createdBy` field)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Entity context                                                                |
| `entityIdPattern`      | Subscription target id pattern (e.g. `urn:ngsi-ld:Sensor:.*`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Subscription `entities[].idPattern` (NGSIv2: `subject.entities[].idPattern`)  |
| `notificationEndpoint` | Subscription notification endpoint URI (e.g. `https://hooks.example.com/x`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Subscription `notification.endpoint.uri` (NGSIv2: notification channel `url`) |

> **`string-regexp` の path 比較は非推奨 (deprecated, #3610)。** %3A/%40 以外の percent-escape を含む pattern は書き込み時 400 (既存の保存値は評価のみ継続し warn)。

> **Path Deny には `string-equal` または `glob` を推奨 (#3592 / #3608)。** `string-regexp` の path 比較は評価でも **best-effort** であり、pattern 側と actual 側の percent-encoding の組み合わせを原理的に尽くせない (例: pattern の `%53` と actual の素の `S`)。セキュリティ上重要な path Deny は正準化が対称な `string-equal` / `glob` で書き、`string-regexp` は他属性や補助条件向けに留める。

> **注意**: `entityId` はエンティティレベルの認可チェック (`requireEntityAuthz` 経由) でのみ利用可能です。`entityOwner` および `scope` はエンティティレベルのチェック **および、#1369 以降、list 読み取りクエリに対する行レベルフィルタとして動作します** — [Policy-to-filter query rewriting](#policy-to-filter-query-rewriting-for-list-queries-1337--1369) を参照してください。`entityType` は HTTP リクエストからパスレベルで自動的に抽出されます — `?type=` クエリパラメータ、リクエストボディの `type` / `@type` フィールド、または (#3690 以降) `/custom-data-models/{type}` の `{type}` パスセグメント (GET/PATCH/DELETE; 予約された `missing-types` セグメントは除外) から。type 別 custom-data-models ルートでは、パスセグメントが `?type=` / body より優先されるため、呼び出し元は認可属性を偽装できません。**by-id エンティティルート (`/entities/{id}` およびその配下) では、DB に保存されている実際の `entityType` でエンティティレベルで認可が実施されます** (#1324) — クライアント提供の `?type=` パラメータはルックアップフィルタとしてのみ使用され、認可属性としては決して使用されません。[Entity-level authorization for by-id routes](#entity-level-authorization-for-by-id-routes-1324-1336) を参照してください。NGSIv2 の `servicePath` は **解決された `TenantContext`** (`extractTenantContext`) から取得され、既に CADDE `x-cadde-options` オーバーライドが適用されています — PIP は HTTP パスで生の `Fiware-ServicePath` ヘッダーを **再読み取りしません** (#1862; キャッシュキーに対する #1835 と同じクラス)。パスレベルとエンティティレベルの両方のチェックで利用可能 — 階層パスマッチングのための glob パターン (例: `/opendata/**`) をサポートします。**NGSI-LD リクエストの場合、`servicePath` は常に `/` として評価されます** (#1323): NGSI-LD 仕様 (ETSI GS CIM 009) には `Fiware-ServicePath` の概念がなく、テナントミドルウェアはそれを `/` に正規化し、データレイヤーはすべての NGSI-LD エンティティを `servicePath: '/'` に保存します。生のヘッダー値を認可リクエストに注入すると、データアクセスがそれを完全に無視する一方で、呼び出し元が独自の認可属性を選択できるようになってしまいます — したがって servicePath ベースのポリシーは **NGSI-LD では分離境界として使用できません**。NGSI-LD での階層ベースの制御には、`scope` 属性 (エンティティレベル) を使用してください; テナント内のプロジェクトレベルの分離には、`entityType` / `entityId` 制約を使用してください。`scope` は、エンティティレベルにおける NGSIv2 の `servicePath` に相当する NGSI-LD の属性です — エンティティが複数の scope 値 (例: `["/Madrid/parks", "/Madrid/gardens"]`) を持つ場合、それらはカンマ区切り文字列として結合され、`string-regexp` または `glob` でマッチングされます。**Subscription の書き込み** (`POST`/`PATCH` on `/ngsi-ld/v1/subscriptions`, `/ngsi-ld/v1/csourceSubscriptions` および `/v2/subscriptions`, #1104 / #2005): リテラルの `body.type === "Subscription"` は `entityType` に **注入されません** — 代わりに、PIP は `entities[]` (NGSIv2: `subject.entities[]`) から **subscription target** を、`notification.endpoint.uri` (NGSIv2: 設定された通知チャネルの `url`) から **notification destination** を抽出します。`PATCH` では、属性は **更新後の有効値** (宣言値、それ以外は保存値) に基づいて解決されます。`entities[]` が複数の要素を含む場合、要素ごとに 1 つの AuthzRequest が構築され、リクエストが成功するには **すべてが Permit でなければなりません** (all-Permit セマンティクス)。これにより、type ベースのポリシー ("anonymous は `ActivityLog` にのみ subscribe できる") および URI ベースのポリシー ("subscription は `https://*.example.com/**` にのみ通知を POST できる"、SSRF / データ流出に対する防御) を記述できます。以下の [Subscription PIP attributes](#subscription-pip-attributes) を参照してください。**バッチ操作** (`POST /ngsi-ld/v1/entityOperations/*`, `POST /v2/op/update`): body 内の **異なるエンティティ type ごと** に 1 つの AuthzRequest が構築され (delete: エンティティ ID ごと)、同じ all-Permit セマンティクスが適用されます — [Batch operation authorization](#batch-operation-authorization-1325) を参照してください。**`/custom-data-models` — `tenantService` はヘッダーではなく actor から取得されます** (#2215): このルートは `actor.tenantId` でキー付けされた admin API であるため、ハンドラーは意図的に `checkTenantAccess` (`Fiware-Service` ヘッダーを呼び出し元のテナントに結び付けるチェック) をスキップします。したがって、このルートではヘッダーは **未検証** であり、それを PDP に渡すと呼び出し元が独自の認可属性を選択できるようになります: `tenantService` を条件とする **Deny** は静かにマッチしなくなり (認可バイパス)、`tenantService` を条件とする **Permit** はマッチしなくなります (過剰拒否)。PIP には代わりに `actor.tenantId` から解決されたテナントが与えられるため、`tenantService` ポリシーは他のすべてのルートと同じようにここでも動作します。テナントを持たない principal、または解決不可能な `tenantId` は、属性を欠いた状態で評価されるのではなく、**403** で拒否されます (fail-closed)。**どのロールも免除されません** — `super_admin` も actor から解決されます。実際の `super_admin` はこのルートに到達できません (上書き不可能な priority -1 の deny-fence が `/custom-data-models/**` を拒否します)、また `AUTH_ENABLED=false` のときに使用される合成 `super_admin` はテナントを持たないため、そのロールに対するヘッダーフォールバックは、成功できないパスで未検証入力を再導入するだけです。**このルートでは `servicePath` は `/` に固定されます** (#2221): custom data models は servicePath によって全くパーティション化されておらず、ルートは `Fiware-ServicePath` を決して読み取らないため、生のヘッダーを認可リクエストに残すことは、呼び出し元に 2 番目の自己選択属性を渡すだけです — 上記の `tenantService` と同じ fail-open の形状、1 次元上です。したがって、`servicePath` を条件とするポリシーはここでは常に `/` に対して評価され、ヘッダーを変更しても回避できません; このルートでは依然として分離境界として使用できませんが、逆の理由です (値は固定であり、呼び出し元が選択するものではありません)。**Type 別ルートはパスから `entityType` を注入します** (#3690): `GET`/`PATCH`/`DELETE /custom-data-models/{type}` (および対応する MCP `get`/`update`/`delete`/`generate_template` アクション、その合成パスには既に `{type}` が含まれています) は、パスセグメントから `resource.entityType` を取得します — 以前は `?type=` / `body.type` のみが読み取られていたため、typed Deny/Permit ルールは by-type 書き込みで静かに NoMatch しました。パス値は `?type=` に勝ち、`PATCH /custom-data-models/Secret?type=Public` の偽装をブロックします。**`sourceUrl` create はフェッチ後に解決された `type` で認可を再評価します** (#3683 A, 2-stage PEP): stage 1 はパスレベルのリクエストで実行され、未認可の呼び出し元が fetcher を消費しないようにします; stage 2 は `body: { type: <fetched> }` で実際のイベントをクローンし (`?type=` をクリア)、同じ `requireAuthz` / MCP `mcpRequirePathAuthz` を呼び出します。`body.type` / MCP `type` が省略された場合、stage 1 は空の `entityType` を参照します。**allow-list** ポリシーのみに依存するテナント — 特定の `entityType` を必要とする target を持つ `Permit`、パス全体の Permit なし — は、stage 1 が評価できるオプションの `type` ヒント (#3696) も送信しない限り、**stage 1 で 403** を受け取ります。ヒントはフェッチされたモデル `type` と一致する必要があり、そうでない場合、stage-2 authz 後にリクエストは **400** で失敗します (解決された type に対する Deny は依然として **403** を返し、永続化しません)。回避策として allow-list の上に裸のパス全体 Permit を追加 **しないでください** — それは許可されていない type がフェッチ前に stage 1 を通過できるようにしてしまいます。

### パスレベル vs エンティティレベル認可

GeonicDB は 2 段階の認可モデルを使用します。両方の段階で XACML 評価を使用し、#1324 以降**両方ともフェイルクローズ**です。同じ実施ポイントは MCP と A2A ツールエンドポイントもカバーします — [MCP / A2A ツール認可](#mcp--a2a-tool-authorization-1610--1651--1672) を参照してください。

| Stage               | Middleware                                          | Triggered when                                                                                            | Non-Permit behavior                                                                                          |
| ------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Path-level          | `requireAuthz()`                                    | Every authenticated request, except by-id entity routes and list reads (which delegate to the rows below) | `Deny` / `NotApplicable` / `Indeterminate` → **403 (fail-closed)**                                           |
| Entity-level        | `requireEntityAuthz()` (via `checkEntityOwnership`) | By-id entity routes — path-level is skipped and this is the single enforcement point (#1324)              | `Deny` / `NotApplicable` / `Indeterminate` → **403 (fail-closed)**                                           |
| List-level          | `requireListReadAuthz()`                            | List read queries (#1337/#1369)                                                                           | Derived row filter: `unrestricted` → no filter, partial → only readable rows, `none` → **403 (fail-closed)** |
| Subscription-update | `requireSubscriptionUpdateAuthz()`                  | `PATCH` on a subscription by id — path-level is skipped and this is the single enforcement point (#2005)  | `Deny` / `NotApplicable` / `Indeterminate` → **403 (fail-closed)**                                           |

#### パスレベルがフェイルクローズである理由

適用可能なポリシーがない場合、リクエストは拒否されなければなりません。そうでなければ、特権のないユーザーがポリシーで明示的に許可されていない任意のパスを呼び出すことができてしまいます。デフォルトロールポリシー(`__default_user`、`__default_api_key` など)により、パス段階で常に少なくとも 1 つの適用可能なルールが存在することが保証されます。

#### エンティティレベルもフェイルクローズ (#1324)

エンティティレベル評価は歴史的にフェイルオープンでした。パス段階で既に Permit が生成されており、この段階では**追加の**制約(所有者のみ、スコープベース)のみが適用されるという前提に基づいていました。その前提は、ID によるエンティティルートが**パスレベル PEP をスキップ**し、単一の実施ポイントとしてエンティティレベルに委任し始めたときに崩れました — そこでの `NotApplicable` は、追加の制約の欠落ではなく、不正なアクセスになります。#1324 以降、`requireEntityAuthz()` は `Deny`、`NotApplicable`、`Indeterminate` のいずれも `403` で拒否します([ID によるルートのエンティティレベル認可](#entity-level-authorization-for-by-id-routes-1324-1336) も参照)。MCP / A2A の合成イベントチェックは同じ実装を再利用するため、同じフェイルクローズ動作を継承します。

これは、CRUD を機能させ続けるためだけにテナントがエンティティ対象ポリシーを書くことを強制するものではありません:決定的なデフォルトを持つロール(`user`、`tenant_admin`、`super_admin`)は、データ API で常に Permit または Deny を生成し、`NotApplicable` に到達することはありません。空のルールデフォルトを持つプリンシパル(`api_key`、`anonymous`、`oauth_client`)のみが `NotApplicable` に到達し、それらに対してはクローズが正しい答えです(ポリシーなし = アクセスなし)。

**結果**: 属性ベースの細粒度制御(例:「ユーザーは自分が作成したエンティティのみを変更できる」)には、ロールデフォルトよりも高い優先度で**明示的な Deny ルール**が必要です — そうでなければ、ロールデフォルトの Permit がエンティティレベルでも適用されます。

#### 例: 所有者のみの更新の実施

`PATCH /v2/entities/{id}/attrs` をエンティティ所有者に制限するには、明示的な Deny を記述します:

```json
{
  "description": "Users can only modify entities they own",
  "ruleCombiningAlgorithm": "first-applicable",
  "rules": [
    {
      "ruleId": "deny-non-owner",
      "effect": "Deny",
      "target": {
        "subjects": [{ "attributeId": "role", "matchValue": "user" }],
        "actions": [{ "attributeId": "method", "matchValue": "PATCH" }],
        "resources": [
          { "attributeId": "path", "matchValue": "/v2/entities/**", "matchFunction": "glob" }
        ]
      },
      "condition": {
        "function": "string-not-equal",
        "args": ["${subject.userId}", "${resource.entityOwner}"]
      }
    }
  ]
}
```

このような明示的なルールがない場合、ロールデフォルト(`__default_user`、`/v2/**` で Permit)がエンティティレベルで適用され、リクエストは許可されます。

### WebSocket 認可 (WS ⊂ GET)

WebSocket サブスクリプションとブロードキャストは、`GET` のサブセットである **読み取り専用ストリーム** として評価されます。`authorizeWs()` PIP (`src/core/auth/policy/policy.pip.ts`) は、各 WebSocket リクエストを **2 回** 評価します — 1 回は `action.method = 'WS'` で、もう 1 回は `action.method = 'GET'` で — そして **両方** の評価が `Permit` を返す場合にのみアクセスを許可します。

#### 読み取りフレームは `/ngsi-ld/v1/entities` です (#2284)

両方の評価は `resource.path = /ngsi-ld/v1/entities` を持ちます。WebSocket は **NGSI-LD リーダー** です:配信されるイベントは NGSI-LD 正規化され、サブスクリプションの `@context` で圧縮されます (#2026 / #2044)、`entityTypes` セレクターはその `@context` で正規化されます (#2055)、そして #2284 以降、NGSI-LD エンティティの変更のみがブロードキャストされます ([EVENT\_STREAMING.md](../features/subscriptions.md#websocket-is-an-ngsi-ld-reader-2284) を参照)。フレームは、同じプリンシパルが HTTP 経由で使用する読み取りパスと一致する必要があります — フレームをカバーしない `path` グロブはターゲットセットから完全に除外され、`Permit` を提供しません。これが PR #2204 で正当なリクエストが `kind: 'none'` に崩壊することを測定した方法です (#2205)。

\#2284 までフレームは `/v2/entities`、つまり **NGSIv2** 読み取りパスでしたが、同じソケット上の表現とマッチングは NGSI-LD でした。フレームの移動から 2 つのことが生じ、それらは意図的に一緒に出荷されました — 配信フィルターのみまたはフレームのみを変更すると、#2205 の事故を再現します:


* **`/v2/**` のみにスコープされたカスタムポリシーに対する破壊的変更。** そのようなルールは WebSocket リクエストをターゲットにしなくなり、サブスクリプションライブが拒否されます。ロールのデフォルト (`user`、`tenant_admin`) は `/v2/**` と `/ngsi-ld/**` の両方を許可するため、影響を受けません。同じサブジェクトに対して `/ngsi-ld/**` (または `/ngsi-ld/v1/entities`) に一致するルールを追加し、`entityType` / `entityOwner` / `scope` 条件を変更しないで修正してください。
  
* **フォールバックではなく、移行診断。** 新しいフレームの下で `subscribe` が拒否された場合、`authorizeWs()` は `/v2/entities` の下で再評価し、*それ
* が許可されていた場合 (両方の `WS` と `GET`)、ロール、ポリシー ID、エンティティタイプとともに `WS_AUTHZ_FRAME_MIGRATION_REQUIRED` を `WARN` レベルでログに記録します。決定は `Deny` のままです — レガシーフレームを受け入れると、NGSIv2 読み取りに制限されたプリンシパルが NGSI-LD エンティティを受信できるようになり、これは閉じられている境界です。追加の評価はサブスクリプションライブ時にのみ実行されます。イベントごとの配信拒否はそれに対して支払いをせず、ログも記録しません。診断内の失敗は飲み込まれます:観察は決して決定された `Deny` を拒否されたプロミスに変えてはなりません。

##### フレーム変更は双方向に作用します — 制限ポリシーは `/ngsi-ld/**` をターゲットにする必要があります

ターゲットマッチングは異なる `attributeId` 間で AND を取るため、`path: /v2/**` と `entityType: X` をペアにするポリシー — 以下の `ws-self-only-feed` の例を含む、#2284 より前に書かれたすべての **制限的な** WebSocket ポリシーの形状 — は新しいフレームの下で `NoMatch` → `NotApplicable` になります。`NotApplicable` グループはグループ間の `deny-overrides` 結合の前にドロップされるため、残るのはロールのデフォルト (`__default_user` / `__default_tenant_admin` は `/ngsi-ld/**` を許可) です:**制限が消え、ソケットはテナント内のそのタイプのすべてのエンティティを受信し始めます。** PR #2324 で `ws-self-only` フィクスチャを使用して測定されました — サブスクリプションライバーは別のユーザーによって作成されたエンティティを受信しました。

したがって、フレームの移動には 2 つの方向があり、そのうちの 1 つだけが拒否です:

| Legacy policy intent                                                     | New frame alone                                                                 |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| **Grant** WS (`Permit` under a `/v2/**` glob)                            | falls out of target → denied (diagnosed by `WS_AUTHZ_FRAME_MIGRATION_REQUIRED`) |
| **Restrict** WS (`Deny` / trailing `default-deny` under a `/v2/**` glob) | falls out of target → **delivery widens**                                       |

拡大方向は認可の後退であるため、`authorizeWs()` はレガシー `/v2/entities` フレームの下で明示的な `Deny` を尊重する移行的なセーフティネットを備えていました。**そのセーフティネットは [#2326](https://github.com/geolonia/geonicdb/issues/2326) で削除されました**、移行が完了した後:レガシーフレームが実際に拒否することは観察されなかった (`WS_AUTHZ_LEGACY_FRAME_DENY` は一度も発火しなかった) ため、許可されたリクエストは現在 NGSI-LD フレームのみで決定され、4 回ではなく 2 回の PDP 評価のコストがかかります。

**したがって、`/v2/**` のみにスコープされた制限ポリシーは、WebSocket 配信を制限しなくなりました。** 制限ポリシーを `/ngsi-ld/**` にスコープしてください — 上記の移行ノートを参照してください。`WS_AUTHZ_FRAME_MIGRATION_REQUIRED` 診断は、許可方向についてまだカバーしています。

この不変条件は、ポリシー作成者にとって 2 つの実用的な結果をもたらします:


1. **`GET` を Deny するポリシーは自動的に `WS` を Deny します。** ルールで `WS` を繰り返す必要はありません。2 回目の評価は同じ Deny を拾います。
   
2. **`WS` のみをターゲットにするポリシーは、通常は設定ミスです。** 2 回目の評価は `GET` にフォールバックするため、`WS` のみを拒否しても基盤となるデータは保護されません — クライアントは依然として `GET /ngsi-ld/v1/entities/...` 経由でそれを読み取ることができます。逆に、`GET` も許可されていない場合、`WS` のみを許可することは意味がありません。

#### 不変条件が適用される場所:サブスクリプションライブと配信、接続ではない (#1271)

`authorizeWs()` (WS ⊂ GET) チェックは、API Gateway パス (`handlers/websocket/default.ts` サブスクリプションライブ、`handlers/websocket/broadcaster.ts` 配信) とローカルパス (`core/streaming/local-ws-server.ts`) の両方で、**サブスクリプションライブされた `entityType` ごとに** 2 つのポイントで実行されます:


* **サブスクリプションライブ** — クライアントが `{ "action": "subscribe", "entityTypes": [...] }` を送信すると、各タイプは `authorizeWs(..., { entityType })` で認可されます。ポリシーが許可しないタイプは拒否されます。
  
* **配信** — 各イベントがプッシュされる前に、接続はイベントの具体的な `entityType` (および `entityOwner`/`scope`) で再認可されます。許可されたイベントのみが配信されます。

**接続はデータ認可を実行 *しません*。** `$connect` (API GW) とローカルアップグレードハンドラーは **認証とテナント一致のみ** を検証します — `authorizeWs` を評価しません。これにより、単一の `entityType` にスコープされたキー (例:`entityType = PollVote` のみを許可するポリシー、タイプのない `GET /ngsi-ld/v1/entities` は **なし**) が WebSocket を開き、そのタイプを受信できます。WS ⊂ GET の不変条件は、**サブスクリプションライブと配信でタイプごとの `authorizeWs` を通過しない限り、イベントは配信されない** ため、保持されます — タイプに対する GET を持たないプリンシパルは、ソケットが開いていてもそのタイプの何も受信しません。

> **接続時の 403 は XACML ではありません (#2867)。** ボディ `"Access denied"` (「`"Access denied by policy"`」なし) での `$connect` 拒否は、**テナント解決が失敗した** (間違ったデプロイメント DB、テナント名の不一致、または不明な `?deployment=` ホスト名) ことを意味します — ポリシー拒否ではありません。PDP/`authorizeWs` はサブスクリプションライブと配信でのみ実行されます。専用デプロイメントは、共有 execute-api WebSocket URL で `?deployment=<registered-hostname>` を渡す必要があります (SDK は `GET /sdk/v1/streaming` が `deployment` フィールドを返す場合、これを自動的に追加します)。

`ip-range` およびその他の `environment` ポリシー条件は、**データレイヤーで** WS に依然として適用されます:接続時のソース IP は接続レコード (`sourceIp`) に保存され、サブスクリプションライブ/配信の `authorizeWs` 呼び出しに渡されるため、IP スコープのポリシーはそこで評価されます (接続時ではありません)。`sourceIp` が利用できない場合、それは存在しないものとして扱われ、`ip-range` 条件はクローズドフェイル (拒否) します。

> 何も受信できないプリンシパルの接続 (すべてのタイプが拒否された) は、接続時には依然として受け入れられますが、事実上不活性です — イベントを受信しません。

#### 作成ガイダンス

特定のロール/テナントのストリーミングを制限したい場合は、`GET` に対してルールを記述してください (またはルールがすべてのメソッドに適用されるように `actions` を省略してください)。ルールが *両方* に適用される必要がある場合にのみ `WS` に言及してください:

```json
{
  "actions": [
    { "attributeId": "method", "matchValue": "WS" },
    { "attributeId": "method", "matchValue": "GET" }
  ]
}
```

#### 検出

`PolicyService.validateWsGetSymmetry()` (#1085) は、ルールの `actions` が `method = 'WS'` (`string-equal`) を含むが、一致する `'GET'` エントリがない場合、`WARN` ログを出力します。これはすべての書き込みパスで実行されます:`createPolicy`、`updatePolicy`、`updatePolicySystem`、および `updatePolicyForUser` (セルフサービス `/me/policies` 更新を含む)。ポリシーは下位互換性を保つために依然として受け入れられます — 警告はルールを再検討するシグナルです。

```text
[WARN] PolicyService — Policy rule 'ws-only-deny' targets method='WS' without an explicit 'GET'
counterpart. WebSocket authorization evaluates both WS and GET, so WS-only rules typically do not
restrict the data path that GET serves.
```

#### ブロードキャスト時のエンティティごとの属性 (#1107 / #1383)

WebSocket ブロードキャスター (`src/handlers/websocket/broadcaster.ts`、`src/core/streaming/local-ws-server.ts`) が変更イベントを接続に配信するかどうかを決定する際、次のエンティティごとの属性を AuthzRequest に注入します:

| attributeId   | Source                                                      | Use case                                                  |
| ------------- | ----------------------------------------------------------- | --------------------------------------------------------- |
| `entityType`  | `EntityChangeEvent.entity.type`                             | "Only forward `ActivityLog` events to clients"            |
| `entityId`    | `EntityChangeEvent.entity.id`                               | "Forward only `urn:ngsi-ld:Room:42` events"               |
| `entityOwner` | `EntityChangeEvent.entity.owner` (the entity's `createdBy`) | "Forward only events for entities the recipient owns"     |
| `scope`       | `EntityChangeEvent.entity.scope`, comma-joined (#1383)      | "Only forward events for entities scoped under `/public`" |

`entityOwner` 属性は、`${subject.userId}` テンプレート展開と組み合わせて、単一の XACML ポリシーで **ユーザーごとの「セルフオンリー」配信フィルター** を表現できます:

```jsonc
// Each user receives only updates to entities they created
{
  "policyId": "ws-self-only-feed",
  "target": {
    "subjects": [{ "attributeId": "role", "matchValue": "user" }],
    // #2284: the WebSocket frame is the NGSI-LD read path. A `/v2/**` glob here no longer
    // targets WebSocket requests, so this restriction would stop applying (see below).
    "resources": [
      { "attributeId": "path", "matchValue": "/ngsi-ld/**", "matchFunction": "glob" },
      { "attributeId": "entityType", "matchValue": "GeoJSON" }
    ]
  },
  "ruleCombiningAlgorithm": "first-applicable",
  "rules": [
    // Allow the user to create their own entity (no owner exists at POST time)
    { "ruleId": "permit-write", "effect": "Permit",
      "target": { "actions": [
        { "attributeId": "method", "matchValue": "POST" },
        { "attributeId": "method", "matchValue": "PATCH" },
        { "attributeId": "method", "matchValue": "PUT" }
      ] }
    },
    // For WS / GET, only forward entities the subject owns
    { "ruleId": "permit-self-read", "effect": "Permit",
      "target": { "resources": [
        { "attributeId": "entityOwner", "matchValue": "${subject.userId}" }
      ] }
    },
    { "ruleId": "default-deny", "effect": "Deny" }
  ]
}
```

> **キャッシュに関する注意**: ブロードキャスターは、単一のブロードキャスト内で `(role, policyId, userId)` ごとに認可決定をキャッシュします。`userId` がキーに含まれる必要があるのは、オーナーベースのポリシーが固定された entityType/entityOwner であっても、ユーザーごとの決定を生成するためです。同じ userId を持つマルチデバイスユーザーは、1 つのイベント内でキャッシュされた決定を共有します。
>
> **`entity.owner` のソース**: 変更イベントを公開する際に、共有の `buildChangeEventEntity()` ビルダー (#1383) を介して、`EntityService` によって (およびスナップショットクローンパブリッシャー #1563 によって) 透過的に設定されます。AWS では、これは API 起源の書き込みに対する**唯一の**イベントパブリッシャーです (#1560 は MongoDB change-stream プロセッサを削除しました。これは実質的に使われていない 2 番目のパブリッシャーでした)。ローカル / スタンドアロンでは、インプロセスの Change Stream ウォッチャーがサブスクリプション / ルールに同じビルダーを使用し、WebSocket はアプリパスから `emitEntityChange` に従います。これはエンティティの `createdBy` フィールド (認証されたユーザーによって `POST` 時に設定されます) から取得されます。`createdBy` を持たないエンティティ (レガシー / バッチ / 未認証の書き込み) は `owner` なしでイベントを発行し、その場合、オーナーベースのルールは一致せず、次のルールが適用されます。
>
> **TTL 有効期限削除は、アプリ側のスイーパー (#1561) を介して `EntityDeleted` を発行します。** MongoDB の TTL モニターは依然として `EntityService` の外部で物理削除を行いますが、`EntityExpiryService` が最初にソフト削除された行を要求し、`createEventPublisher()` を通じて公開します。これにより、古い change-stream の `delete` ブランチが確実に保持できなかった、使用可能な `id` / `type` / `owner` / `scope` が提供されます。[EVENT\_STREAMING.md](../features/subscriptions.md) および [QUOTAS.md](../saas/quotas.md#ttl-失効-expiresat-expiry-sweeper1561) を参照してください。
>
> **その他の EntityService バイパスパス (#1563)**: スナップショットクローンは `EntityCreated` / `EntityUpdated` を**発行します**。テナントカスケード削除および無効な地理情報の隔離は**発行しません** (フラッド / インフラ修復)。決定はコードコメントおよび SECURITY.md / [EVENT\_STREAMING.md](../features/subscriptions.md) に記載されています。
>
> **ブロードキャスト時の `scope` (#1383)**: 格納されたエンティティの `scope` から設定され、エンティティレベルのチェックおよびリストクエリ行フィルター (#1369) と同じ**カンマ結合文字列セマンティクス**で照合されます。配信境界は、サブジェクトが `GET` リストを介して読み取れるものと同一です。スコープのないエンティティ (欠落 / `null` / `[]`) は `''` として評価されます。マルチスコープエンティティのサブツリーマッチングには、境界を認識した `string-regexp` パターン (例: `(^|,)/public(/[^,]*)?(,|$)`) を推奨します。

### サブスクリプション PIP 属性

サブスクリプションは **継続的な読み取り** であるため、ターゲットと宛先の制限は作成時だけでなく、すべての書き込み時に保持される必要があります。#2005 以降、PIP は **6 つのサブスクリプション書き込みセルすべて** をカバーし、そのすべてにおいてリテラル `body.type === "Subscription"` は意図的に `entityType` として公開 **されません**:

| Resource                     | Create                                  | Update                                        |
| ---------------------------- | --------------------------------------- | --------------------------------------------- |
| NGSI-LD subscriptions        | `POST /ngsi-ld/v1/subscriptions`        | `PATCH /ngsi-ld/v1/subscriptions/{id}`        |
| Context source subscriptions | `POST /ngsi-ld/v1/csourceSubscriptions` | `PATCH /ngsi-ld/v1/csourceSubscriptions/{id}` |
| NGSIv2 subscriptions         | `POST /v2/subscriptions`                | `PATCH /v2/subscriptions/{id}`                |

| attributeId            | Source field (NGSI-LD / csource) | Source field (NGSIv2)                                             | Use case                                                                                                  |
| ---------------------- | -------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `entityType`           | `entities[].type`                | `subject.entities[].type`                                         | "Anonymous can only subscribe to `ActivityLog`"                                                           |
| `entityId`             | `entities[].id`                  | `subject.entities[].id`                                           | "Allow subscribing only to `urn:ngsi-ld:Room:1`"                                                          |
| `entityIdPattern`      | `entities[].idPattern`           | `subject.entities[].idPattern`                                    | "Allow subscribing only when the pattern matches `urn:ngsi-ld:Sensor:.*`"                                 |
| `notificationEndpoint` | `notification.endpoint.uri`      | `notification.http` / `httpCustom` / `mqtt` / `mqttCustom` `.url` | "Notifications may only be sent to `https://*.example.com/**`" — defence against SSRF / data exfiltration |

`?type=` はこれらのパスでの認可属性として **決して** 使用されません。コントローラーはそれも `body.type` もサブスクリプションが監視する対象を決定するために使用しないため、これを受け入れると呼び出し側が `?type=Public` を宣言しながら実際には `Secret` にサブスクリプションライブすることを許してしまいます。

#### 部分更新は更新後の有効値で評価されます(#2005)

`PATCH` は部分更新であるため、上記の属性は **「本文が宣言する値、そうでなければすでに保存されている値」** として解決されます:


* 本文が `entities`(NGSIv2: `subject`)を宣言 → 宣言されたターゲットが評価されます(許可されたサブスクリプションを制限されたタイプに切り替えることはできません);
  
* 本文がそれらを省略 → **保存された** ターゲットが評価されます(説明や通知エンドポイントのみを変更することで、現在制限されているタイプをターゲットとするサブスクリプションを維持することはできません);
  
* どちらもターゲットを生成しない → 単一の空のターゲットが評価され、フェイルクローズドとなります。

絞り込みは許可されます。制限されたタイプをターゲットとするサブスクリプションは、許可されたタイプに `PATCH` で縮小できます。これは更新後の値が評価されるためです。

保存された値が必要であるため、`PATCH` セルはパスレベル PEP からコントローラー(`requireSubscriptionUpdateAuthz`)へ決定を委譲します。これは ID によるエンティティルートがエンティティレベルの認可に委譲するのと同じ方法です。保存されたタイプはすでに正規化されており、リクエストの `@context` に対して再正規化 **されません**。クライアントが宣言したタイプのみが正規化されます(#1613)。

#### PEP はサブスクリプションコントローラーと同じ `@context` を解決します(#1657)

クライアントが宣言したタイプは評価前に正規化されるため(#1613)、PEP はコントローラーが保存する際に使用するのと **同じ** アクティブな `@context` を選択する必要があります。そうしないと、呼び出し側が制限されたタイプを許可されているように見える用語にエイリアスできてしまいます(「認可は `AliasType` を見て、ストレージは `SecretType` を見る」)。#1772 / #1924 以降、供給ルールは **1 箇所**(`selectActiveContextRef`)で適用される条項 6.3.5 であり、コントローラーと PEP の両方で使用されます。`application/ld+json` は本文の `@context` を取り、`application/json` は `Link` ヘッダーを取り、両者を混在させると 400 になります。ルートごとの分岐が残っていないため、コントローラーが `@context` ソースを変更しても PEP と暗黙的に非同期化することはできません。

`tests/e2e/features/auth/subscription-write-authz.feature` は両方の供給形式についてこれを固定します。制限されたタイプの IRI にエイリアスされた用語は、ld+json 本文の `@context` 経由で到着しても、`application/json` の `Link` ヘッダー経由で到着しても拒否されます。

#### マルチエンティティの全 Permit セマンティクス

`entities[]` に複数の要素が含まれる場合、PEP は **要素ごとに 1 つの AuthzRequest を評価** し、リクエストは **すべての** AuthzRequest が `Permit` を返す場合にのみ許可されます。1 つでも `Deny` / `NotApplicable` / `Indeterminate` があると、リクエスト全体が `403 Forbidden` にショートサーキットされます。これにより「最初の要素は問題なく見えるので、残りを忍び込ませる」というバイパスが防止されます:

```jsonc
// All elements must satisfy the policy. With a policy that permits only ActivityLog,
// this body is rejected because { type: "Building" } is not permitted.
{
  "type": "Subscription",
  "entities": [{ "type": "ActivityLog" }, { "type": "Building" }],
  "notification": { "endpoint": { "uri": "http://localhost:1028/notify" } }
}
```

#### 例: タイプベース + URI ベースの制御の組み合わせ

```json
{
  "policyId": "anon-subscribe-activity-only",
  "target": {
    "subjects": [{ "attributeId": "role", "matchValue": "anonymous" }],
    "resources": [{ "attributeId": "path", "matchValue": "/ngsi-ld/v1/subscriptions" }],
    "actions": [{ "attributeId": "method", "matchValue": "POST" }]
  },
  "ruleCombiningAlgorithm": "first-applicable",
  "rules": [
    {
      "ruleId": "allow-activitylog-to-internal-hooks",
      "effect": "Permit",
      "target": {
        "resources": [
          { "attributeId": "entityType", "matchValue": "ActivityLog" },
          { "attributeId": "notificationEndpoint", "matchValue": "https://*.example.com/**", "matchFunction": "glob" }
        ]
      }
    },
    { "ruleId": "deny-rest", "effect": "Deny" }
  ]
}
```

このポリシーは、サブスクリプションターゲットタイプが `ActivityLog` *かつ* 通知エンドポイントが `*.example.com` 上にある場合 *のみ* 許可します。`resources` 内の異なる `attributeId` は AND 結合されます([ターゲットマッチングセマンティクス](#ターゲットマッチングセマンティクス) を参照)。

> **ポリシーターゲティングの注意**: `/ngsi-ld/v1/subscriptions` に完全一致で `path` に対して書かれたポリシーは、作成呼び出しのみをカバーします。更新もカバーするには、グロブ(`/ngsi-ld/v1/subscriptions**`)を使用してください。`*` は `/` を越えません。

### バッチ操作の認可 (#1325)

バッチ操作は単一のリクエストに複数のエンティティを含むため、単一の `entityType` ではリクエスト全体を表すことができません。PIP はリクエストボディから **distinct なエンティティタイプ** ごとに 1 つの認可ターゲットを抽出し、PEP はサブスクリプションと同じ **all-Permit セマンティクス** でそれらを評価します:すべてのターゲットが `Permit` を返す必要があり、そうでない場合はバッチ全体が `403 Forbidden` で拒否されます。

対象エンドポイント (すべて `POST`):

| Endpoint                                                                              | Body shape                        | Targets                                                                                                |
| ------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `/ngsi-ld/v1/entityOperations/create` / `upsert` / `update` / `merge`                 | Entity array                      | One per distinct `type` / `@type` (multi-type arrays supported)                                        |
| `/ngsi-ld/v1/temporal/entityOperations/create` / `upsert`                             | Entity array                      | Same as above                                                                                          |
| `/ngsi-ld/v1/entityOperations/delete`, `/ngsi-ld/v1/temporal/entityOperations/delete` | Entity ID (URI string) array      | One per distinct `entityId`, with `entityType` fixed to `""` (the type is unknown without a DB lookup) |
| `/v2/op/update`                                                                       | `{ actionType, entities: [...] }` | One per distinct `entities[].type`                                                                     |

例: `entityType: EVChargingStation` に対してのみ `POST` を許可するポリシーの場合、`EVChargingStation` エンティティのみを含むバッチ upsert は成功しますが、単一の `Sensor` エンティティが混在するバッチは全体として拒否されます — 何も書き込まれません。

**Fail-closed ルール**:


* タイプを判定できない要素 (欠落した `type`、NGSIv2 の id のみの更新、非オブジェクト要素)、パース不可能なボディ、および `MAX_BATCH_SIZE` を超えるボディは、`entityType: ""` を持つターゲットとして評価されます。これはタイプ制約付き Permit ルールにマッチすることはなく、`?type=` クエリパラメータはこれらのターゲットのフォールバックとして **意図的に使用されません** (そうでなければ `?type=<allowed>` を追加することで制約をバイパスできてしまいます)。
  
* `path` / `method` のみを制約するポリシー (`entityType` マッチなし) は影響を受けません:注入された `entityType` 値に関係なくマッチするため、制約のない API キーは以前と全く同じように動作します。
  
* **Batch delete** ボディはタイプ情報のない ID 配列であるため、タイプ制約のみのポリシーはバッチ削除を許可できません。`entityId` ベースのルール (glob パターンサポート、例: `urn:ngsi-ld:EVChargingStation:*`) を追加するか、単一エンティティの `DELETE` リクエストを代わりに使用してください。

> **注記 (#1325/#1337/#1369)**: 読み取り側のバッチエンドポイント `POST /ngsi-ld/v1/entityOperations/query` および `POST /v2/op/query` は **リストレベル認可** によって処理されます:読み取り可能エンティティフィルタ (entityType / scope / entityOwner) がポリシーセットから導出されてクエリに組み込まれます;宣言されたタイプは固定属性として折り畳まれます (許可されていない宣言タイプは依然として 403 を返します) — [ポリシーからフィルタへのクエリ書き換え](#policy-to-filter-query-rewriting-for-list-queries-1337--1369) を参照してください。
>
> **セットベース削除 (`purge`) もリストレベルです (#1679)**: `DELETE /ngsi-ld/v1/entities` (clause 5.6.21) および GeonicDB 拡張 `POST /ngsi-ld/v1/entityOperations/purge` は、id セットではなく *述語* によってターゲットを選択するため、上記の all-Permit バッチ評価は適用されません。両方とも同じ読み取り可能エンティティフィルタ (entityType / scope / entityOwner) を導出し、削除クエリに組み込むため、**サブジェクトが削除を許可されていない行は述語から除外され、残存します**;削除可能な行が全くないサブジェクトは `403` を受け取ります。パスレベルのボディ抽出 (`type`) だけでは *不十分* です — それはクライアントが宣言したタイプのみを見て、保存された `scope` / `entityOwner` は決して見ません。同じ配線が、コントローラをバイパスする非 HTTP エントリポイントにも適用されます:MCP `batch` ツール (`action: "purge"`) および A2A `batch` スキル (`action: "purge"`)。
>
> **例外 — 宣言されたタイプが単一の信頼できる操作対象タイプでない場合、折り畳まれ *ません* (#1653/#1656/#2061)**: **NGSIv2 `POST /v2/op/query`** では、実際にマッチするタイプはボディの `entities[].type` / `typePattern` (複数の仕様) に存在し、コントローラは `?type=` / ボディトップレベルの `type` を無視します;そして、リスト読み取りでの **カンマ区切りの `?type=A,B`** はコントローラによって要素ごとに分割されます。いずれかを単一の固定属性として折り畳むと、導出されたフィルタを `unrestricted` に崩壊させる可能性があります (その折り畳まれた値が無条件に許可されている場合) が、コントローラは *異なる* タイプセットにマッチします — permit-by-default + point-deny ポリシーの下で禁止された行をリークします。これらのルートでは `entityType` は **自由変数** として保持され、導出された行レベル述語が代わりにすべての仕様にわたって適用されます。
>
> **discovery ルートは `?type=` を全く折り畳みません (#2061)** — 単一のトークンでさえも。`GET /ngsi-ld/v1/types`、`/types/{typeName}`、`/attributes`、`/attributes/{attrId}`、`/v2/types`、および `/v2/types/{typeName}` は、**パスパラメータ** (詳細) または **すべての読み取り可能エンティティ** (リスト) からマッチするものを決定します;いずれも `?type=` を読み取りません。それを折り畳むと `?type=<readable>` によって導出されたフィルタが `unrestricted` に崩壊し、読み取り不可能なタイプの存在、`entityCount`、および属性名がリークします — #1370 が閉じたリークを再び開くことになります。したがって、これら 6 つのルートでの `?type=<denied>` は高速 `403` を生成しなくなりました:レスポンスは `?type=` なしの同じリクエストと同一です (行フィルタされた `200`、またはサブジェクトが読み取れないタイプの場合は `404`)。これが正しい結果です — ETSI GS CIM 009 はこれらの操作に対して `type` パラメータを定義していないため、古い `403` はコントローラが決して参照しない値によって駆動された誤った拒否でした。`/ngsi-ld/v1/temporal/entities` および `/ngsi-ld/v1/entityMaps` は実際のマッチフィルタとして `?type=` を **使用する** (`params.type` → `typeList`) ため、折り畳みを維持します。
>
> これら 6 つのルート以外では、単一の `?type=Denied` (カンマなし) は依然として折り畳まれます (高速 `403`)。

### by-id ルートのエンティティレベル認可 (#1324, #1336)

**by-id エンティティルート** — `/ngsi-ld/v1/entities/{id}` (および `/attrs`、`/attrs/{attrName}`)、`/v2/entities/{id}` (および `/attrs`、`/attrs/{attrName}`、`/attrs/{attrName}/value`)、および **temporal by-id ルート** `/ngsi-ld/v1/temporal/entities/{id}` (および `/attrs`、`/attrs/{attrName}`、`/attrs/{attrName}/{instanceId}`) (#1336) — の場合、パスレベル PEP はスキップされ、**エンティティレベル認可が単一の適用ポイント** となります。データに触れる前に、コントローラは DB からエンティティの実際の属性をロードし、以下で完全なポリシーセットを評価します:

| Attribute     | Source                                                                                                                                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entityType`  | **Actual type stored in the DB** — never the client-supplied `?type=` parameter (that is only a lookup filter). If the entity does not exist, `entityType` is evaluated as `""` (matches no type-constrained Permit rule). |
| `entityId`    | Path parameter                                                                                                                                                                                                             |
| `entityOwner` | `createdBy` of the stored entity                                                                                                                                                                                           |
| `scope`       | `scope` of the stored entity                                                                                                                                                                                               |

結果:


* **タイプ制約キーは by-id 操作で機能します。** `entityType: SalesTarget` に対して `GET` を許可するポリシーは、`GET /ngsi-ld/v1/entities/urn:ngsi-ld:SalesTarget:1` を直接許可するようになりました。#1324 以前はこれは常に拒否に至りました (パスレベル評価には `entityType` がありませんでした)、そして回避策は URN プレフィックス `path` glob ルールでした — これらは依然として機能しますが、もはや必要ありません。
  
* **エンティティレベルの決定は fail-closed です**: `NotApplicable` → `403`。決定的なデフォルトを持つロール (`user`、`tenant_admin`、`super_admin`) は影響を受けません (それらのデフォルトポリシーは常に決定を生成します);`api_key` / `anonymous` / `oauth_client` (空ルールデフォルト) の場合、これは正しい閉じた動作です。制約付きキーの下で存在しないエンティティは `403` を返します (存在は開示されません)。
  
* **`?type=` は認可属性を偽造できません。** `GET /entities/{sensorId}?type=AllowedType` は拒否されます:DB ルックアップ (宣言されたタイプでフィルタされる) は何も見つけず、リクエストは `entityType: ""` で評価されます — クエリパラメータフォールバックはエンティティレベル評価のために意図的に抑制されます (#1325 と同じバイパス防止)。
  
* Deny フェンス (例: super\_admin データ API フェンス) は影響を受けません — エンティティレベル評価はパスレベルと同じポリシーセットを実行します。
  
* **Temporal by-id ルートは `entities` コレクションから認可属性を取得します** (#1336) — temporal コレクションは owner/scope を保存しません。エンティティがそこにもはや存在しない場合 (履歴を保持したまま削除された、または temporal API だけで作成された)、owner と scope は利用できず、リクエストはそれらなしで評価されます。
  
* **その場合でも `entityType` は削除 *されません
* (#2157)。** それは temporal 履歴自身の `metadata.entityType` から解決され、タイプなし評価 **に加えて** 評価されます (両方が Permit でなければなりません)、そのため `entityType` をターゲットとする Deny ルールは依然として **temporal-only** エンティティにマッチします (`entities` にドキュメントがなく履歴のみを持つもの — `POST /ngsi-ld/v1/temporal/entities` の通常の結果であり、scope を持つボディを除いて `entities` に書き込むことはありません。ただし #2434 A'-1 を介して 1 つを実体化 **します**)。#2157 以前は、属性は単純に存在せず、タイプ制約 Deny ルールは `NoMatch` となり、permit-by-default ポリシーは `GET /ngsi-ld/v1/temporal/entities/{id}`、MCP `temporal.get`、または A2A `temporal.get` を通じて禁止された履歴を読み取りました — 一方 *リスト
* ルートは同じ行を隠しました (それらは `entities` から導出された読み取り可能な `entityId` セットによってフィルタされます)。フォールバックは、その read/by-id 非対称性を fail-closed 方向で閉じます;リストルートは意図的に **拡大されませんでした**。これはすべての temporal by-id 操作 (get / delete / attrs / instance) および temporal **batch** 形式に適用されるため、`batch_delete` は by-id delete が拒否する行に到達できません (パリティ不変条件)。1 つの id に対する複数の記録されたタイプは、それらの *すべて
* が許可される必要があります。
  
* **フォールバックは常により多く拒否し、決して少なく拒否しません。** タイプなしリクエストが解決されたタイプと並行して依然として評価されるため、タイプを解決できなかったときに拒否されたサブジェクトは拒否されたままです:#1336 の意図的な fail-closed ルール — タイプ制約サブジェクトはエンティティボディがもはや存在しない履歴に到達できない — はそのまま保持されます。(タイプなし評価を追加する代わりに置き換えると、そのケースを `403` から `200` へ静かに反転させます;`tests/e2e/features/auth/temporal-entity-authz.feature` で測定)。
  
* **temporal-only エンティティの Owner / scope は評価不可能のまま** — temporal コレクションはどちらも記録しないため、owner および scope 制約ルールは依然としてそれらの行にバインドできません (#2157 による変更なし;以下の既知の制限を参照)。

### リストクエリのためのポリシーからフィルタへのクエリ書き換え (#1337 / #1369)

**リスト読み取りクエリ** — `GET /ngsi-ld/v1/entities`、`GET /v2/entities`、`POST /ngsi-ld/v1/entityOperations/query`、`POST /v2/op/query`、および (#1370 以降) 集約読み取り `GET /ngsi-ld/v1/types`、`GET /ngsi-ld/v1/attributes`、`GET /v2/types`、`GET /ngsi-ld/v1/temporal/entities` — に対して、パスレベルの PEP はスキップされ、**リストレベルの認可** がサブジェクトの有効なポリシーセットから *readable entity predicate* を導出し、それを MongoDB フィルタ(行レベルセキュリティ)に組み込みます。ページネーション、`NGSILD-Results-Count` / `Fiware-Total-Count`、およびリスト ETag はフィルタの後に計算されるため、常にサブジェクトが読み取れる内容と一致します。

導出は **`entityType`、`scope`、`entityOwner` を自由変数とする記号的 PDP 評価** です (#1369 はこれを `entityType` 単独から拡張しました):エンティティ `E` が導出された述語にマッチするのは、`entityType: E.type`、`scope: E.scope.join(',')`、`entityOwner: E.createdBy` で評価された同じリクエストが Permitted となる場合に限ります。3 つのルール結合アルゴリズムすべてと 2 段階結合(優先度グループごとの first-applicable + グループ間の deny-overrides)が、ルールの順序を含めて正確に再現されます。

リクエストが **タイプを宣言** する場合(`?type=` / `body.type`)、`entityType` は自由変数セットから離れ、宣言された値を持つ固定属性として畳み込まれます — #649 のセマンティクスを保持(許可されていない宣言されたタイプは依然として `403` を返す)しながら、scope/owner の行フィルタは **依然として適用されます**:タイプを宣言しても scope/owner ベースの制限をバイパスすることはできません。`null` / `undefined` の属性のみが自由変数になります (#1384)。**宣言されたタイプは、それが単一の権威ある操作対象タイプである場合にのみ畳み込まれます**:`POST /v2/op/query`(その実際のタイプは body の `entities[].type` / `typePattern` 仕様)、ディスカバリルート `GET /ngsi-ld/v1/types(/{typeName})?`、`GET /ngsi-ld/v1/attributes(/{attrId})?`、`GET /v2/types(/{typeName})?` (#2061) — これらのコントローラは `?type=` に対してマッチングを全く行わず(名前指定の詳細ルートは **パス** パラメータでマッチし、単純なリストルートは読み取り可能なすべての行を集約する)、したがって宣言された `?type=` はコントローラが実際に返す行に観測可能な影響を与えず、それを畳み込むと単一の読み取り可能な `?type=` 値で導出されたフィルタが `unrestricted` に崩壊し、他のすべてのタイプの存在/カウント/属性名のリークが開いたままになります。そしてコントローラが正規化する(`split(',') → trim → drop-empty`)が生の値と同一の単一トークン以外のものになる `?type=` — カンマ区切りの `A,B`、空白パディングされた `" Secret"`、または空白のみの `" "`(コントローラはこれをタイプフィルタなし = すべてのタイプに変換する)— に対して、`entityType` は **自由変数** として保持されるため、導出された行レベル述語はすべての仕様に対して強制され、畳み込まれて `unrestricted` に崩壊することはありません (#1653/#1656/#2061)。空文字列の fail-closed マーカー(`''`、`body.type: ""` から)は例外です:これは **自由変数にされず** — 依然として `kind:'none'` → `403` に畳み込まれます (#1384)、したがって `body.type: ""` はリスト全体の deny をエスケープするために使用できません。**リクエスト上の空文字列値 — 解決不可能な属性のための fail-closed マーカー (#1324/#1325)、例えば `body.type: ""` — はリスト全体を closed に失敗させます(`403`)**:固定値として畳み込むことはできません。なぜなら、データクエリは空の値で行を制限しないからです(畳み込むと制約された Deny ルールが空になり — リーク)、そしてマーカーを無視することなく自由として扱うこともできません。これは *リクエスト* の宣言された属性値のみに適用されます:ポリシー **ルール** の `scope` / `entityOwner` 上の `matchValue: ""` (スコープなし/オーナーなしの行にマッチ)は影響を受けず、導出された行フィルタでそれらの行にマッチし続けます。

結果:

| Derivation result                           | Behavior                                                                                                       |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Unconditional Permit, no deny contributions | No filter (unchanged behavior — e.g. `tenant_admin`, plain `user` role)                                        |
| Some readable rows                          | `200` with only readable entities (**was `403`** for type/scope/owner-constrained subjects before #1337/#1369) |
| No readable rows                            | `403` fail-closed (unchanged — e.g. policy-less `api_key` / `anonymous`)                                       |

結果:


* **タイプ制約されたキーは `?type=` なしでリストできます。** `entityType: SalesTarget` に対してのみ許可されたキーは、SalesTarget エンティティのみを含む `200` を取得します。#1337 以前はこれは常に `403` でした。
  
* **明示的な Deny ルールは、そのタイプをリスト結果から隠すようになりました。** `entityType: Secret` に対して `GET` を拒否するテナントポリシー(ロールデフォルトより上の優先度、例えば `priority: 10`)は、`user` のタイプなしリストから Secret エンティティを削除します — 以前は deny は by-id / by-type リクエストに対してのみ機能していました。
  
* **オーナーのみの読み取りがリストで機能します** (#1369)。`entityOwner: ${subject.userId}` で `GET` を許可するルール(+ deny-others)は、すべてのリストを「私が作成した行のみ」に変換し、正しいカウントヘッダーを持ちます。MongoDB への変換は保存された `createdBy` フィールドをターゲットにします。空文字列にマッチする条件は、`createdBy` を持たないドキュメントにもマッチします(PDP は欠落したオーナーを `''` として評価します)。
  
* **スコープベースの読み取りがリストで機能します** (#1369)。スコープルールは、PDP がエンティティレベルチェックに使用するのと同じ **カンマ結合されたスコープ文字列** に対してマッチされます(上記の `scope` 属性の注記を参照) — マルチスコープエンティティのサブツリーマッチングには `(^|,)/public(/[^,]*)?(,|$)` のような境界認識 `string-regexp` パターンを推奨します。変換は `$expr` を介して MongoDB で結合文字列セマンティクスを再現します。スコープのないエンティティ(`scope` が欠落 / `null` / `[]`)は `''` にマッチするルールにマッチします。地理クエリ(`$geoNear`)は `$match` ステージと同じ述語を適用するため、距離でソートされた結果とそのカウントは同一にフィルタされます。
  
* 環境条件(`time-range` / `ip-range`)と `${subject.*}` テンプレートはリクエスト時に畳み込まれます。未解決のテンプレート (#1939)、無効な正規表現 (#1935)、および Deny ルールの評価不可能な `ip-range` エントリ (#3600)は `Indeterminate` となり、導出を「読み取り可能な行なし」(403)に短絡させます。これは PDP が到達するのと同じ fail-closed の結果です。
  
* **`entityId` / `entityIdPattern` によって制約されたルールはリストレベルでは発火しません**(それらは空の値に対して評価されます。パスレベルの評価が行ったのと正確に同じです)— by-id リクエストはエンティティレベルの認可によってカバーされます (#1324)。
  
* **フェデレーション結果(コンテキストプロバイダ)も同じ導出された述語によってフィルタされます (#2003)** — リモートエンティティは MongoDB に触れず、`entityReadFilterToMongo` を直接通過できないため、どのように行われるかについては下記の補足を参照してください。

> **動作変更の注記 (#1369)**:`scope` / `entityOwner` によって制約されたポリシーは、以前はリストリクエストに対して発火しませんでした(両方の属性が `''` として評価されました)。これらは現在、行フィルタとして機能します。特に、`actions` を書き込みメソッドに制限しない「オーナーのみの **書き込み**」ポリシーは、リストパスに適用されると読み取りも行フィルタします — そのようなポリシーを意図したメソッドにスコープしてください(`actions: [{"attributeId": "method", "matchValue": "PATCH"}, ...]`)。
>
> **フォローアップのステータス**:#1369 が延期した `/ngsi-ld/v1/types` / `/ngsi-ld/v1/attributes` の集約と時系列リストクエリは #1370 / #1488 で完了しました。EntityMap 作成は #1955 で、EntityMap **読み取り** は #1963 で(下記の表を参照)。#1369 からのすべてのフォローアップは現在クローズされています。
>
> **フェデレーション(コンテキストプロバイダ)結果も同じ述語を通過するようになりました (#2003)。** `ContextSourceRegistration` フォワーディングからマージされたリモートエンティティは MongoDB に触れないため、上記の導出されたフィルタ — MongoDB クエリに組み込まれる — はそれらに対して実行されませんでした:`entityType` / `scope` / `entityOwner` によって制限されたプリンシパルは、以前は **完全でフィルタされていない** リモート結果を見ていました。`entityMayBeRead()`(`policy.filter.ts`)は、`entityReadFilterToMongo` の JS ミラーであり、3 つの自由変数次元すべてを **具体的な値** に対して評価します — `entityTypeMayBeReadable()`(さらに下の登録存在チェック。これは `scope` / `entityOwner` を「マッチする可能性がある」として扱います。なぜなら、登録はそれらの具体的な値を持たないからです)とは異なり、リモートエンティティ **は** 実際のデータの行であるため、値を持たない次元は、`createdBy` / `scope` を持たないローカルドキュメントに使用されるのと同じ実際の値 `''` に畳み込まれます — 「マッチする可能性がある」ではありません。`FederationService.filterRemoteEntitiesByReadFilter()` は、inclusive/auxiliary マージの前、および exclusive モードでこれを適用します。リモートレスポンスは `type` を **そのまま** 運びます(正規化された保存形式とは異なり)、フィルタは #2086 が使用するのと同じ `createStoredTypeCanonicalizer()` でそれを最初に正規化します — そうしないと、`Deny entityType == Sensor` ルールは FQN 化されたリモートタイプを静かに見逃します(#2086 クラスのリーク)。コア `@context` が解決できない場合、リモート結果は正規化されずに比較されるのではなく、**完全に削除されます**(fail-closed)。これにより、#2003 は #1994 の `probeEntityType` ガードを削除することもできました。これは行レベル制限されたプリンシパルを登録マッチングのための保守的なタイプ抑制候補セットに保持していました。制限されたプリンシパルは現在、**通常の** 登録マッチングを経て、その後 `narrowRegistrationsByReadableType()` がプリンシパルが読み取れない **のみ** のタイプを宣言する候補を削除します(`entityTypeMayBeReadable()` を使用、ディスカバリエンドポイントが使用するのと同じ存在チェック)。マージされたエンティティのみをフィルタリングするだけでは十分ではありません:転送されたが読み取り不可能な登録は、プロバイダの失敗時に発生する `199` 警告を通じて、その `endpoint` と登録 id をリークします。そして — `exclusive` 登録の場合 — Via ループ検出によって発生する `508` を通じてもリークします。タイプを全く宣言しない登録(`entityTypes` が空または `'*'`)はタイプ情報を持たず、依然として転送されます。削除された登録は宣言するタイプのエンティティのみを供給できたはずであり、それらは行レベル述語によって削除されるため、このナローイングによってエンティティの可視性は変わりません。コア `@context` が解決できない場合、転送は全く行われず、レスポンスは結果が部分的であることを示す `199` 警告を運びます(clause 6.3.6)— 意図的に登録を名指しすることは **ありません**。
>
> **By-id フェッチもカバーされます (#2092)。** リモートにのみ存在するエンティティの `GET /ngsi-ld/v1/entities/{id}` はエンティティレベルの認可 (#1324/#1336)を通り、`getEntityAuthzContext` はそのようなエンティティに対してローカルで何も見つけません — PDP は `entityType` なしで評価されるため、タイプベースの `Deny` はその時点では発火しません(修正前は `200` を返すことが測定されました)。#2092 はこれを #2003 と同じ行レベル述語でクローズします:すべてのフェデレーション by-id 読み取りパス(NGSI-LD `GET /entities/{id}`、`/attrs`、`/attrs/{attrName}`、NGSIv2 `GET /v2/entities/{id}`、`/attrs`、`/attrs/{attrName}`、`/attrs/{attrName}/value`)は、遅延導出されたフィルタ(`deriveRemoteEntityReadFilter`)を `FederationService.getEntity` に渡し、これがリモートエンティティに `entityMayBeRead()`(タイプを最初に正規化)を、転送候補に `narrowRegistrationsByReadableType()` を適用します。導出は、クライアントが `?type=` を宣言した場合でも意図的に `entityType` を **自由変数** として保持します — 宣言されたタイプは検索フィルタのみです (#1324)、呼び出し元が `Deny` をオフターゲットに誘導することを許してはなりません。読み取り不可能なリモートのみのエンティティは `404` を返します(非存在と区別できず、リスト結果に存在しないことと一致します)。導出は少なくとも 1 つの転送候補登録がマッチする場合にのみ実行されるため、登録を持たないテナントは追加のポリシー作業を支払いません。MCP / A2A `get` アクションは非フェデレーション `EntityService` を使用し(`ENTITY_FORWARDING_ACTIONS` に `get` はありません)、リモートエンティティに到達しません。

#### エンティティに対する集約および派生読み取り (#1370 / #1955)

`entities` コレクションを読み取るエンドポイントは **同じ導出された述語** を適用する必要があります。そうしないと、エンティティエンドポイントが隠す行が他のエンドポイントを通じて観測可能になります(#1376 パリティ不変条件)。上記のリストエンドポイント以外に:

| Endpoint                                                                                         | What the predicate protects                                                                              | Wiring                                                                                                                          |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `GET /ngsi-ld/v1/types`, `/v2/types`, `/ngsi-ld/v1/attributes`                                   | Existence of a type / attribute, and their counts                                                        | #1370 / #1488 / #2061 (closed a `?type=` fold that let a single readable type collapse the derived filter and re-open the leak) |
| `GET /ngsi-ld/v1/temporal/entities`                                                              | Readable `entityId` set (temporal rows carry no owner/scope)                                             | #1370                                                                                                                           |
| `POST /ngsi-ld/v1/snapshots`, `.../clone`, `DELETE /ngsi-ld/v1/snapshots`                        | Rows copied into / restored from a snapshot                                                              | #1945                                                                                                                           |
| `GET /ngsi-ld/v1/entityMaps`, `POST /ngsi-ld/v1/entityMaps`                                      | The `entityIds` set stored in the EntityMap and its `totalCount`                                         | #1955                                                                                                                           |
| `GET /ngsi-ld/v1/entityMaps/{id}`, `PATCH`, `DELETE`                                             | The **stored** `entityIds` / `totalCount` of an EntityMap created by another principal                   | #1963 (owner guard)                                                                                                             |
| `GET /ngsi-ld/v1/entities{,/{id}}?join=flat\|inline`                                       | Entities reached by following `Relationship` objects (Linked Entity Retrieval, clause 4.5.23)            | #2213                                                                                                                           |
| `GET /catalog{,/**}` (DCAT / datasets / sample / CKAN)                                           | Dataset existence, `entityCount`, attribute schema, spatial bbox, and `sample` entity bodies             | #2465 / #2468 / #2471 / #2472                                                                                                   |
| Notification payloads of subscriptions with `notification.join`                                  | Entities reached by following `Relationship` / `ListRelationship` targets **into the notification body** | #2104                                                                                                                           |
| Notification payloads of entity subscriptions (`/ngsi-ld/v1/subscriptions`, `/v2/subscriptions`) | The **primary notified entity itself** — id, type and attribute values in `data[]`                       | #2205                                                                                                                           |

ETSI EntityMap 作成は呼び出し元の読み取り権限を使用します。GET を認可すると、`/ngsi-ld/v1/entityMaps` での GET または HEAD を通じて、および `GET /ngsi-ld/v1/entities?entityMap=true` を通じて、時間制限付きマップの作成も許可されます。フェデレーションクエリの場合、Context Brokerはマッチするコンテキストソースからマップをリクエストできます。マップは、呼び出し元の現在の権限を通過する ID とリンクのみを公開します。

> **CADDE v4 はこのマトリックスから明示的に除外されています (#2469)。** `/cadde/api/v4/entities` および `/cadde/api/v4/catalog` は GeonicDB プリンシパルを持ちません — それらは CADDE 独自の JWT で認証します(または `authEnabled: false` の場合は認証なし)、**XACML 行レベル読み取りフィルタを適用しません**。`Deny(entityType == X)` のようなテナントポリシーを含みます。他のデータ API と共有されるのはテナント境界のみです:リクエストされたテナントは存在し、アクティブでなければなりません(`checkTenantAccess`、#3576)。これは意図的です:CADDE はデプロイメント全体のオプトインデータ交換ゲート(`PUT /admin/cadde`、デフォルトで `enabled: false`)であり、その信頼モデルは契約レベル(リソース URL / コネクタ認証)であり、GeonicDB 内部のプリンシパルごとの行制御ではありません。#1376 パリティ不変条件(「プリンシパル P の制限は P が使用できるすべての形状で保持される」)は、このパスに GeonicDB プリンシパル P が存在しないため適用されません。CADDE and XACML を参照してください。
>
> **リンクエンティティ取得(`join`)は、呼び出し元が要求していない行に Relationship をたどります (#2213)。** `join=flat` / `join=inline` は `Relationship` 属性のターゲットを解決し、それらをレスポンス配列に追加するか、`entity` サブ属性として埋め込みます。これらのターゲットは、呼び出し元が `?type=` で宣言したタイプでは **ありません** — それらは、リンクするエンティティが指すものです。#2213 まで、解決は `EntityRepository.getMany()` を通じて実行されました。これはテナント / servicePath / プロトコル / ソフト削除境界を持っていましたが、**行レベル述語はありませんでした**。したがって、`entityType == Secret` を拒否されたサブジェクトは、それにリンクする読み取り可能なエンティティをリクエストすることで、`Secret` エンティティを完全に読み取ることができました。1 つの `Relationship` で述語を回避するのに十分でした — #2003(フェデレーション結果)と同じ「2 つのパスがどの行が読み取り可能かで一致しない」クラスです。
>
> **同じ穴が通知にも存在します (#2104)。** `notification.join` は Relationship ターゲットを通知ボディに解決しますが、そこには HTTP リクエストがなく、したがって述語を導出する `actor` がありません。述語は **サブスクリプション作成者**(`createdBy`)から `deriveSubscriberReadFilter()` で導出されます — #2133 が CSource 通知のために導入したヘルパーで、2 つのパスが乖離しないように共有されています(いずれかの場所で有効なロールまたは `super_admin` `tenantId` を間違えると、「HTTP が隠すものが通知に現れる」ことになります)。ただし、`'skip'` の結果は異なるマッピングがされます:CSource 通知は述語が決定不能な場合に **送信されません** が、`notification.join` は `'skip'` を `{ kind: 'none' }` にマッピングします — リンクされたエンティティはゼロ、通知は依然として配信されます。`join` は追加の表現であるため、決定不能な述語が静かに配信を停止してはなりません。リンクされたデータを保留することが fail-closed 部分です。
>
> **通知対象エンティティ自体も述語を通過する (#2205)。** 上記の #2104 は `notification.join` が *到達* する行をカバーしていますが、通知が実際に対象とするエンティティはフィルタリングされていませんでした。書き込みパスでもフィルタリングできませんでした: サブスクリプションの書き込みは **サブスクリプションリソースパス** をフレームとして認可されるため (`buildSubscriptionAuthzRequests`)、`/ngsi-ld/v1/entities**` にスコープされたポリシーは、サブスクリプションが作成されるときのターゲットセットの一部にすらなりません — エンティティ読み取りで `entityType == Secret` を拒否されたサブジェクトでも、`Secret` (または `type: "*"`) のサブスクリプションを作成し、それらのエンティティを通知として受信できました。*書き込み* 認可をエンティティ読み取りパスに再フレーム化することは修正にはなりません: PR #2204 で測定されたように、パス glob によるサブスクリプション書き込みを許可するカスタムポリシーは、読み取りフレームの下でターゲットから外れ、**Permit をまったく提供しない** ため、`kind: 'none'` に崩壊し、正当な `201` を `403` に変えてしまいます。代わりに配信時形式が使用されます — `#2140` 読み取り、`#2133` CSource 通知、WebSocket のイベントごとの `authorizeWs` (#1107 / #1383) と同じ形式です: サブスクリプションは書き込み時に許可され、**すべての配信** は作成者の現在の述語に対して判定されます。判定は `entityTypeMayBeReadable()` ではなく `entityMayBeRead()` を使用します(実際の行の 3 つの自由次元すべて) — 通知本文はエンティティの内容を運ぶため、型次元のみを見ると `entityOwner` / `scope` 制限されたサブジェクトに行がリークします。読み取りフレームパスはサブスクリプション自身の `protocol` に従います(`NOTIFICATION.READ_FRAME_PATH`: `/ngsi-ld/v1/entities` または `/v2/entities`)ので、合成イベントはプリンシパルの HTTP 読み取りと同じターゲットセットに到達します。述語は配信ごとに再導出されるため、これは `#2005` が残した 2 つのギャップも閉じます: 制限が厳しくなる前に作成されたサブスクリプションは、次の `PATCH` までグランドファザリングされるのではなく再判定され、`scope` / `entityOwner` 制限は具体的な型セレクタにも適用されます(サブスクリプション PIP はそれらの属性を構築しません)。ゲートは **`claimNotificationSlot` の前** に実行されます — 抑制されたサブスクリプションはそのスロットリング / クールダウンウィンドウを消費してはならず、そうでないと述語が後で許可したときに通知が永久に消えてしまいます。
>
> `'skip'`(決定不能な述語)は **配信しない** を意味し、`notification.join` の「リンクされたエンティティがゼロ」ではなく CSource 通知と一致します: ここで保留されるものは通知 *そのもの* です。フェイルクローズセルは作成者のプリンシパル種別に依存します。**ユーザー** 作成者の場合、それらは上記の #2133 にリストされた共有のものです — 保存された `createdBy` がない、作成者がアクティブなユーザーに解決されない、通知されたテナントでの作成者のメンバーシップが取り消されているか存在しない、解決不能なテナント、エンティティ読み取りを完全に拒否する述語。**クレデンシャル** 作成者(`api_key` / `oauth_client`、#2282)の場合、ユーザードキュメントとメンバーシップのセルはまったく適用されません — それらはクレデンシャルドキュメントから評価され、そのドキュメントが欠落している、取り消されている(`isActive: false`)、または別のテナントに属している場合、保存されたプリンシパル種別が id の形状と一致しない場合、種別が保存されていない場合(#2282 以前に書き込まれたサブスクリプション)、または導出された述語がエンティティ読み取りを完全に拒否する場合にのみフェイルクローズします。**許可ポリシーにバインドされた有効でアクティブな API キーは抑制原因ではありません** — そのサブスクリプションは、そのキーが HTTP 経由で読み取ることができるすべての行を受信します。**動作変更**: `createdBy` のないレガシーサブスクリプションは、`AUTH_ENABLED=true` デプロイメントで識別可能なプリンシパルによって再作成されるまで通知の受信を停止します; `securityEvent` 警告ログ(`SUBSCRIPTION_NOTIFICATION_RLS_SKIPPED`)により、これは運用上可視化されます。API キーと OAuth クライアント作成者は最初は同じバケットにありました — ユーザードキュメントがないため、`UserRepository.getById('apikey:<keyId>')` が `null` を返し、導出は `'skip'` に落ち、つまり **API キーで作成されたサブスクリプションは `201` / `status: active` を報告しながらまったく何も受信しませんでした**。#2282 はそれらをフェイルオープンではなく *評価可能* にしました: サブスクリプションは作成者のプリンシパル種別を保存し(`createdByRole`、`/subscriptions` と `/csourceSubscriptions` の両方で永続化)、導出は **HTTP 認証が構築するのと同じアクター** をクレデンシャルドキュメントから再構築します — `apikey:<keyId>` / `apikey-<keyId>@internal` / `role: api_key` / キーの `tenantId`、または OAuth クライアントの `clientId` / `role: oauth_client`、`policyId` はクレデンシャルドキュメントから読み取られるため、ポリシーの再バインドはサブスクリプション時に凍結されるのではなく、次の配信で有効になります。種別は `createdBy` の `apikey:` 接頭辞から推測されることはありません(その形状と衝突する `user.id` は、そうでなければクレデンシャルのポリシーで評価されることになります — 「推測されたプリンシパル種別」クラス)ので、#2282 以前に書き込まれたサブスクリプションはフェイルクローズのままです。取り消された(`isActive: false`)、削除された、**クロステナント** のクレデンシャルもフェイルクローズのままであり、id の形状と一致しない保存された種別も同様です。`AUTH_ENABLED=false` の場合、ゲートは不活性であり、HTTP 読み取りパスがそこで制限されないのとまったく同じです。
>
> 同じゲートは #2253 のプロトコル分離を運び、両方の配信ルート(Lambda `matcher` とスタンドアロンのインプロセスサービス)と両方のイベント種別(エンティティ変更とルールトリガー通知)が **1 つ** の関数を通過します — 最初のカットはエンティティ変更の半分のみを配線し、ルールトリガー通知を無防備のままにしました。これは独自の修正内で再現された #1376 の「残された 1 つのセル」クラスです。
>
> 述語は現在 `deriveLinkedEntityReadFilter()` によって導出され、`joinLevel` の **すべての** 再帰レベルで `getMany()` の Mongo フィルタに構成されます。これは意図的に、周囲のクエリに対して `requireListReadAuthz()` が返したフィルタでは **ありません**: 宣言された `?type=A` があると、その導出は `entityType` をリテラル `A` に折り畳みます(しばしば `unrestricted` に崩壊します)が、これは型 `B` のリンクされたエンティティについては何も語りません。`deriveRemoteEntityReadFilter()` (#2092) のように、`entityType` を自由変数のままにします; それとは異なり、`entityId` も折り畳まれ **ません**。なぜなら、join には 1 つではなく多数のターゲットがあるからです。`kind: 'none'` はリクエスト全体を失敗させるのではなく、リンクされたエンティティがゼロになります — リンクするエンティティはすでに認可されており、`join` パラメータを `403` に変えることは過剰な拒否になります。

> **Context Source Registration 派生の `/types` と `/attributes` への貢献には別のメカニズムが必要でした (#2079)。** 上記の行は `entities` コレクションの読み取りをカバーしていますが、`GET /ngsi-ld/v1/types(/{typeName})?` と `/ngsi-ld/v1/attributes(/{attrId})?` も **Context Source Registrations によって宣言された** 型名と属性名をレスポンスにマージします(ETSI GS CIM 009 - 5.9.3.3)。登録は `entities` 行ではないため、`readableEntityFilter` / `entityReadFilterToMongo` をまったく通過しません — #1370 のエンティティ派生貢献に対するリーククロージャは、登録派生パスを開いたままにしました: 型制約されたサブジェクトは、*任意の* 登録によって宣言された任意の型の存在(および属性名)を知ることができ、`/types/{typeName}` は、登録がそれを宣言したという理由だけで、サブジェクトが単一のエンティティも読み取れない型に対して `200` を返しました。`entityTypeMayBeReadable()` (`policy.filter.ts`) は、`entityType` 次元に制限された `entityReadFilterToMongo` の JS ミラーです(登録が具体的な値を持つ唯一の次元; `scope` / `entityOwner` は、登録がどちらも運ばないため「一致する可能性がある」として扱われます) — サブジェクトが読み取ることが不可能な登録派生の型/属性名をドロップするために使用されます。`/types/{typeName}` と `/attributes/{attrId}` は、ターゲット型に読み取り可能な可能性がまったくない場合、登録を介して存在をリークするのではなく `404` に折り畳まれます。制約のないサブジェクト(`readableEntityFilter === undefined`)には変更はありません。

> **述語は保存された文字列を比較するため、保存形式が一致する必要があります (#2086)。** `entityTypeMayBeReadable()` は登録の宣言された型名をマッチャー値と完全な文字列等価性で照合します — `entities` 行の Mongo 側の `{entityType: <matcher>}` 比較と同じ土台です。これは両側が同じ正規化を経た場合にのみ成立します。NGSI-LD 登録はそうします(書き込み時の `normalizeTypeName`、#1700); **NGSIv2 登録はしません** — `POST`/`PATCH /v2/registrations` は、NGSIv2 にアクティブな `@context` がないため、型をそのまま保存します。登録はプロトコル間で可視であるため、v2 登録された `https://uri.etsi.org/ngsi-ld/default-context/Sensor` は `Deny entityType == Sensor` ルールをすり抜けましたが、同じ型のエンティティは正しく隠されました。したがって、発見エンドポイントは、消費時点で登録型セレクタをコアボキャブラリーで正規化します(両方のコントローラの `listRegistrationsSafely`)ので、述語、`/types/{typeName}` ルックアップ、レスポンス型名はすべて同じ文字列で評価されます。保存形式は意図的にそのまま残されます: NGSIv2 エンティティもそのまま保存され、`findMatchingRegistrations` は完全な文字列で照合するため、保存形式を反転すると NGSIv2 フェデレーション転送が黙って壊れ、`GET /v2/registrations` が不可逆的に変更されます(#1890 は属性名に対して同じ決定を下しました)。
>
> **Context Source Registration ドキュメント自体の読み取りも述語を通過します (#2084)。** #2079 は登録派生の `/types` と `/attributes` への *貢献* を絞り込みましたが、供給ソース — `GET /ngsi-ld/v1/csourceRegistrations(/{registrationId})?` と `GET /v2/registrations(/{registrationId})?` — は依然として CSR ドキュメント全体を返しました: CSR リストリクエストには具体的な `entityType` がないため、型 Deny はポイント認可で発火せず、CSR 読み取りを許可するポリシーを持つサブジェクト(`user` ロールデフォルトの GET Permit、または型 Deny を持つデフォルト許可のカスタムポリシー)は、読み取れない型の登録の存在、宣言された型名、プロバイダー `endpoint` URL を読み取ることができました。読み取りパスは現在、同じ行レベル述語(`requireListReadAuthz`)を導出し、**編集** します: 読み取り不可能な具体的型セレクタは `information[].entities[]` からドロップされ、読み取り不可能な型のみを宣言する情報エントリは完全にドロップされ、すべてのエントリがドロップされたドキュメントはリストから除外され、ID による読み取りでは `404` を返します。ルールは発見エンドポイントが使用するのと同じ関数です(`redactInformationForRead` — 同じ関数を呼び出すことで、発見と CSR 読み取りの可視性が分岐しないようにします)、正規化された型値で判定されます(#2086)が、レスポンスは保存形式を保持します。リスト `count` とページネーションは **編集後** に計算されます(編集前のカウントは隠された登録の存在をリークします)、`?type=` / `?attrs=` は編集されたドキュメントに対して再照合されます(読み取り不可能なセレクタのみを介して、またはドロップされたエントリの属性のみを介して照合されたドキュメントは、まったく表示されてはいけません — その表示自体が編集が削除したものをリークします)。`?attrs=` の再照合は、そのままの名前 ∪ 正規名を判定します(各エントリの保存された名前を登録の書き込み時 `@context` で展開、#2141)ので、その照合面は Mongo ユニオンインデックス(#1890)を反映します — これがないと、正規形式のみで照合するクエリ(FQN、または別の `@context` からの同義語項)は、制約のないサブジェクトには結果を返しますが、制約されたサブジェクトには `0` 結果を返します。編集されたリストも、`count` / `total` が最初のページを超えて正確であるように、コレクションをページごとにスキャンします(OOM 安全キャップで境界が設定され、切り捨て時に警告あり)(#2141)。`GET /ngsi-ld/v1/csourceRegistrations` は、宣言された `?type=` をポイント認可に折り畳む代わりに、常に行レベル述語に委ねます: 読み取り可能な型で照合された CSR は、依然として読み取り不可能なセレクタを *含む* ことができるため、折り畳むと述語が `unrestricted` に崩壊し、照合されたマルチタイプドキュメントが編集されずに返されます(#1653/#1656 の宣言型 ≠ 実際の内容クラス)。動作変更: エンティティ型許可リストに制限されたサブジェクト(#2079 ポリシー形状)は以前 CSR リストで `403` を受け取りました; 現在は読み取り可能な(または型のない)型のみを宣言する登録のみで `200` を受け取ります — #1370 がエンティティリストに対して行ったのと同じフェイルクローズ→フィルタリング遷移です。csource-subscription 通知チャネルもカバーされています(#2133、以下)。
>
> **csource-subscription 通知によって配信される CSR ドキュメントは、サブスクリプション作成者の述語によって編集されます (#2133)。** 通知チャネル(`csource-notification.service.ts` — CSR ドキュメントは登録の作成/更新/削除時にサブスクリプションライバーエンドポイントに完全に POST されます)は、#2084 の編集を完全にバイパスしていました。Csource サブスクリプションは現在、作成者を保存し(`createdBy`、エンティティサブスクリプションと同じ形状)、配信時には作成者の **現在の** 有効ポリシーセットを使用して、HTTP CSR 読み取りと同じ行レベル述語を導出します(合成認可パターン、#1610 を介して呼び出される `requireListReadAuthz`) — パリティ不変条件は「作成者 P が `GET /ngsi-ld/v1/csourceRegistrations` で見るものは、P のサブスクリプションが通知されるものです」。照合は **編集された** ビューに対して評価されます(読み取り不可能な型セレクタのみを介して照合された通知はまったく到着してはいけません — その到着自体がその型を宣言する CSR が存在することをリークします)、すべてのエントリが編集された登録は配信されません。**これらすべては認証が有効な場合にのみ適用されます。** `AUTH_ENABLED=false` の場合、語るべき行レベル述語はありません — `optionalAuth` はすべてのリクエストに対して `super_admin` を合成するため、HTTP CSR 読み取りはすべてのドキュメントを編集せずに返します。通知パスは同じ条件で短絡し、編集せずに配信します; そこで通知を抑制すること(保存された作成者は `anonymous` であり、これはユーザーに解決されません)は、まさに上記のパリティ不変条件を可用性の方向で壊すことになります。以下のすべては `AUTH_ENABLED=true` デプロイメントについて説明しています。

述語に使用されるロールは、ユーザードキュメントのグローバル `role` ではなく、**通知されたテナントにスコープされた** 作成者のロールです: `super_admin` は通過し、そうでなければ通知されたテナントのメンバーシップ行が決定します。3 つのケースは異なり、混同してはいけません: **アクティブ** なメンバーシップ行はその `role` を提供します; 存在するが **非アクティブ**(取り消された)なメンバーシップ行はフェイルクローズします; **メンバーシップ行がまったくない** 場合は `user.role` にフォールバックし、作成者の `primaryTenantId` が通知されたテナントである場合にのみです(自動メンバーシップ以前のレガシーユーザー、または再ポイントされた `primaryTenantId`)。テナントレスログインはそのフォールバックを使用しません(#3527): プライマリテナントのメンバーシップが欠落しているか非アクティブな場合は 403 を返し、トークンロールは `membership.role` です。*別の* テナントの欠落した行は、取り消されたケースと同様にフェイルクローズします。これは #1201(「非 `super_admin` の有効ロールは常に `membership.role` です」)を反映しており、これは重要です。なぜなら、`PATCH /admin/users/{id}` は `role` をプライマリテナントの既存のメンバーシップにのみ同期し(#3552)、他のテナントのメンバーシップには同期しないからです。

Fail-closed セル (**通知は送信されない**、構造化された警告ログあり): `createdBy` が保存されていないサブスクリプション (この変更前に作成されたレガシードキュメント — `CSOURCE_NOTIFICATION_RLS_SKIPPED_LEGACY`)、アクティブなユーザーに解決できない **user** 作成者 (削除 / 非アクティブ化されたユーザー — `CSOURCE_NOTIFICATION_RLS_OWNER_UNRESOLVED`; #2282 以降、`api_key` / `oauth_client` 作成者はこのセルに **含まれません** — 代わりに資格情報ドキュメントから解決され、それが欠落、取り消し、または別のテナントからのものである場合のみ fail closed となります — `CSOURCE_NOTIFICATION_RLS_CREDENTIAL_UNRESOLVED`)、通知されたテナントでのメンバーシップは存在するが取り消されている (`isActive: false`) **user** 作成者、および `primaryTenantId` ではないテナントでメンバーシップ行が **ない** **user** 作成者 (メンバーシップはユーザー専用の概念です; 資格情報作成者は資格情報ドキュメントの `tenantId` によってスコープされます) (両方 — `CSOURCE_NOTIFICATION_RLS_MEMBERSHIP_MISSING`; テナントレス `POST /auth/login` (#3527) および `refreshToken` は同じプリンシパルに対して `403` を返します)。注意: このセルには上記で説明したレガシーの行なしケースは **含まれません**: メンバーシップ行がなく、`primaryTenantId` が通知されたテナントである作成者は `user.role` にフォールバックし、通知 **されます**。テナントレスログインはそうではありません: 同じレガシー行は 403 で fail-closed となります。`PUT /admin/tenants/{tenantId}/users/{userId}` で復元してください; バックフィルはありません。また fail-closed: 解決不可能なテナント (`CSOURCE_NOTIFICATION_RLS_TENANT_UNRESOLVED`)、および述語が CSR 読み取りを完全に拒否する作成者。**動作変更**: レガシー csource サブスクリプション (`createdBy` が存在する前に作成されたもの) は、識別可能なユーザーによって再作成されるまで通知の受信を停止します; 警告ログによりこれが運用上可視化されます。

> **サブスクリプションドキュメントの読み取りも述語を通過します (#2140)。** `GET /ngsi-ld/v1/subscriptions(/{subscriptionId})`、`GET /v2/subscriptions(/{subscriptionId})`、および `GET /ngsi-ld/v1/csourceSubscriptions(/{subscriptionId})` にも同じ穴が存在していました: サブスクリプションリストリクエストは具体的な `entityType` を持たないため、タイプ Deny はポイント認可時に発動せず、タイプ Deny を持つサブジェクトは、読み取れないタイプを監視しているサブスクリプションの存在、宣言されたタイプ名、および **通知エンドポイント URL** を読み取ることができました。読み取りパスは現在、同じ行レベル述語を導出し、CSR ルールの正確なミラーで編集します (`subscription-read-redaction.ts` — タイプに依存しない判断は `informationEntryIsTypeAgnostic` をミラーします): 読み取り不可能な具体的なタイプセレクターはセレクターリスト (`subject.entities` / `entities`) から削除され、読み取り不可能な具体的なタイプのみを宣言するサブスクリプションはリストから省略され、ID による読み取りでは `404` を返し、タイプに依存しないサブスクリプション (セレクターなし、`type: "*"`、`id`/`idPattern`/`typePattern` のみのセレクター、`watchedAttributes` のみのサブスクリプション) は影響を受けません。リストの `count` とページネーションは編集後に計算され、`?type=` は常に行述語に延期されます (これらのコントローラーはマッチングに `?type=` を使用しないため、それを折りたたむと述語が `unrestricted` に崩壊します — #2084 finding-1 クラス)、述語は `ETag` シードに混合されます。サブスクリプションは 1 つのプロトコル共有コレクションに保存されるため、NGSI-LD と NGSIv2 の両方の入口は同じように編集します。更新 / 削除の認可は変更されません (`requireSubscriptionUpdateAuthz` / 所有権チェックはサブスクリプションの有効な値を評価し、このパスを通過しません)。

注意:


* **EntityMap 作成はコレクションの GET、HEAD、POST をリストレベル PEP に委任し**、実際のリクエストで行述語を導出するため、読み取り可能な行がないサブジェクトは `403` (fail-closed) を取得し、宣言された `?type=` はスコープ / 所有者の制限をバイパスできません。
  
* **既存の EntityMap の読み取りは所有者ガード (#1963) と現在の読み取り述語を適用します**。`EntityMapDocument` は `createdBy` フィールドを取得しました; 非管理者プリンシパル (`super_admin` / `tenant_admin` 以外のすべて) は、**自分自身が作成した** EntityMap のみを読み取り、更新、削除できます。`createdBy` がないレガシー行は非管理者には見えません — **fail-closed**、#1945 (スナップショット) に従います。当時、これは `SubscriptionService.checkOwnership` との意図的な違いであり、未知の所有者を通過させていました; **#2161 はそのギャップを閉じました**ので、サブスクリプションと登録もレガシードキュメントで fail closed となります (下記の所有権セクションを参照)。

  コントローラーは読み取り者の現在の読み取り述語を導出します。サービスは保存された ID を現在の権限に対してフィルタリングし、可視 ID から `totalCount` を再計算します。読み取りアクセスの取り消しは、所有者に返される ID とカウントを変更できます。

  **非所有者は `404` を取得し、`403` ではありません** — `403` はその ID を持つ EntityMap が存在することを確認し、これは #1370 が閉じたのと同じ存在リーククラスです。ガードはフェッチしてから拒否するのではなく、**Mongo クエリ内** (`{tenant, entityMapId, createdBy}`) で適用されるため、「存在するがあなたのものではない」と「存在しない」が分岐できるコードパスはありません。

  `PATCH` / `DELETE` は同じようにガードされます: 読み取りパスのみを閉じると、非管理者が別のプリンシパルの EntityMap を変更または削除できるようになります (CLAUDE.md Authorization Change Checklist 2 — すべての実施パスを配線する)。
  

* EntityMap の認可セマンティクスは **ETSI GS CIM 009 で規定されていません**（clause 5.2.32 / 6.3.16 はリソースを定義していますが、そのアクセス制御は定義していません）。そのため、2 つの操作は仕様で定義された異なる類似物に従います：
  
  * **作成** (`POST`) は兄弟パス `GET /entities` に従います：読み取り不可能な行を除外し、成功を返します（`403` は *すべての
* 行が読み取り不可能な場合のみ）。
    
  * **既存の EntityMap の読み取り / 更新 / 削除** はスナップショット所有者ガード (#1945) の形式に従います — `createdBy` によってスコープされ、`createdBy` を持たないレガシー行は非管理者から隠されます — ただし、スナップショットの `403` ではなく `404` を返します。これは #1963 が所有者を Mongo クエリに組み込むためです（以下を参照）。
    
* \#1955 が元々カバーしていたベクタータイルエンドポイントは #1961 (PR #1965) で **完全に削除されました**。そのパスでの認可 / キャッシュ / 正規化の繰り返しミスは、その根拠の一部でした。

#### カタログ読み取り認証情報 (#2465 / #2468 / #2472)

`/catalog/**` は **行データ** を返し、メタデータのみのインデックスではありません：`sample` は完全なエンティティボディであり、データセットメタデータは正確な `entityCount`、属性スキーマ、空間 bbox を公開します。したがって、行レベル認可はエンティティリスト読み取りと **同じ述語** を使用します (#1376 パリティ)。#2465 / #2468 以降、`CatalogService` はパスが `GET /v2/entities` である合成イベントで `requireListReadAuthz` を介してその述語を導出します（ハンドラは `/catalog/**` を `apiType: 'ngsiv2'` として抽出します — #2471 を参照）。

**設計によりフェイルクローズ。** カスタムポリシーが `/catalog/**` のみを Permit し（エンティティリストパスは Permit しない）認証情報でも、カタログルートのパスレベル `requireAuthz` は通過しますが、合成導出は `kind:'none'` を生成し、`requireListReadAuthz` は **403** をスローします。`/catalog/**` Permit を十分とみなす二重パス導出は #2465 の穴を再び開きます（`/v2/**` に対して書かれた entityType / servicePath Deny がカタログで静かにミスします）。

**オープンデータポータルレシピ**（コード変更なし — 既存の XACML で表現）：

同じプリンシパル（`api_key` / `oauth_client` / `anonymous`）に両方を付与：


1. `Permit` — `path: /catalog/**`, `method: GET`（パスレベルの到達可能性）
   
2. `Permit` — `path: /v2/entities`, `method: GET`（行フィルタ導出ソース）

選択されたタイプのみを公開するには、(2) に `entityType` 条件を追加します。同じ条件がカタログ行フィルタになるため、カタログと `GET /v2/entities` は **同じ行** を見ます。これにより、それらのタイプに対する直接的な `GET /v2/entities` も許可されます — カタログはすでに同等のデータを配布しているため、これは追加の露出ではありません。

バウンドポリシーの例（`/me/policies` してから API キー / OAuth クライアントに `policyId` を設定。ポリシーレベルの `target` はルールと一緒に評価されます）：

```json
{
  "policyId": "portal-catalog-publictype",
  "target": {
    "resources": [
      { "attributeId": "path", "matchValue": "/catalog/**", "matchFunction": "glob" },
      { "attributeId": "path", "matchValue": "/v2/entities", "matchFunction": "string-equal" }
    ]
  },
  "ruleCombiningAlgorithm": "first-applicable",
  "rules": [
    {
      "ruleId": "permit-catalog",
      "effect": "Permit",
      "target": {
        "resources": [{ "attributeId": "path", "matchValue": "/catalog/**", "matchFunction": "glob" }],
        "actions": [{ "attributeId": "method", "matchValue": "GET" }]
      }
    },
    {
      "ruleId": "permit-v2-entities-public",
      "effect": "Permit",
      "target": {
        "resources": [
          { "attributeId": "path", "matchValue": "/v2/entities", "matchFunction": "string-equal" },
          { "attributeId": "entityType", "matchValue": "PublicType", "matchFunction": "string-equal" }
        ],
        "actions": [{ "attributeId": "method", "matchValue": "GET" }]
      }
    },
    { "ruleId": "deny-others", "effect": "Deny" }
  ]
}
```

匿名ポータルは `role=anonymous`（および必要に応じて `anonymousAccessEnabled`）で同じ形式を使用します。`/catalog/**` のみを Permit してカタログが 200 を返すことを期待 **しないで** ください。

> **スコープ外。** `sample` / `entityCount` を省略するメタデータのみのカタログ（カタログ ≠ エンティティ読み取り）は別の製品設計になります。現在の需要はありません (#2472)。

### MCP / A2A ツール認可 (#1610 / #1651 / #1672)

MCP サーバー (`POST /mcp`) と A2A JSON-RPC エンドポイント (`POST /a2a`) は、HTTP コントローラーをバイパスするエンティティ / バッチ / 時系列データツールを公開します。これらは個別の認可実装を持って**いません**。各ツール呼び出しは最小限の合成 `APIGatewayProxyEvent` を構築し、HTTP レイヤーと**同じ共有強制関数**— `checkEntityOwnership` (エンティティレベル、ID による)、`requireListReadAuthz` (リストレベル行フィルタリング)、および `requireAuthz` (ポイントチェック)— を `@api/shared/authz/synthetic-authz` (MCP の場合は `src/api/mcp/tools/authz.ts`) 経由で呼び出します。したがって、カスタムポリシーの `entityType` / `entityOwner` / `scope` 制約は、HTTP、MCP (#1610)、および A2A (#1651) 全体で同一に強制され、Deny / NotApplicable の結果はフェイルクローズされます。


* **ID によるツール操作は、DB に保存されている実際の `entityType` で認可されます**— クライアントが提供する `type` 引数は認可属性として使用されることはありません(後続のデータアクセスのための検索フィルターとしてのみ残ります)。これは HTTP の ID によるルートと同じルールです([#1324](#entity-level-authorization-for-by-id-routes-1324-1336))。これにより、偽造された `type` がエンティティ検索をミスさせ、permit-by-default ポリシーの下で `entityType: ""` 評価にリクエストが滑り込むタイプスプーフバイパスを閉じます(A2A: #1651、MCP: #1672)。
  
* **到達可能性は別個のパスレベルの懸念事項です**: `/mcp` と `/a2a` は `tenant_admin` デフォルトポリシーによって許可され、テナントポリシーパス許可リスト (`TENANT_POLICY_ALLOWED_PATH_PREFIXES`、`src/core/auth/policy/policy.defaults.ts`) に含まれているため、テナント管理者はカスタム Permit ポリシーを使用して `user` / `api_key` / `oauth_client` プリンシパルにこれらを付与できます。`/mcp` / `/a2a` のパスレベル Permit は、エンドポイントを到達可能にするだけです— 上記のツールごとのエンティティレベル / リストレベルチェックは、すべてのデータ操作に依然として適用されます。
  
* **管理ツールには `tenant_admin` ロールが必要です**: 管理 / 設定管理ツール(ユーザー / ポリシー / ルール)は、MCP と A2A の両方でロールゲートされているため、データツール用に `/mcp` / `/a2a` を付与されたプリンシパルは、ユーザーを列挙したり、ポリシー / ルールを読み取ったりすることはできません。


* **ロールゲートはポリシー評価の代替ではありません(#2223)。** MCP の `config` ツールの `custom_data_models` リソースは、以前は `requireAdminRole` + テナント解決で停止し、**カスタム XACML ポリシーを評価しませんでした**: `/mcp` は `resource.path = "/mcp"` としてパスレベルで認可されるため、`/custom-data-models` に対して記述された `Deny` は決して適用されず、HTTP 経由でデータモデルから制限された `tenant_admin` は、MCP を通じてそれらを作成 / 更新 / 削除することができました。現在は対応する HTTP ルート (`GET|POST /custom-data-models`、`GET|PATCH|DELETE /custom-data-models/{type}`) の合成イベントを構築し、HTTP ハンドラーが呼び出すのと同じ `requireAuthz` を呼び出すため、同じポリシーが両方のエントリポイントを決定します。HTTP ルート (#2215) と同様に、`resource.tenantService` は**アクター**から解決され、呼び出し側が宣言した値からは決して解決されません— MCP では、テナントは `tenant` 引数から取得され、`resolveToolTenant` はそれがアクター自身のテナントであることをすでに検証しています。`resource.servicePath` は、HTTP ルートがそれを折りたたむのと同じ理由で `/` に折りたたまれます (#2221): `resolveToolTenant` が返す値は呼び出し側の `servicePath` 引数から来るため、そのままにしておくと、`servicePath` を条件とする Deny をその引数を変更することで回避できてしまいます— `tenantService` の穴、一次元上です。


* **このパスではまだ利用できない属性が 1 つあります: `environment.sourceIp`。** 合成イベントは設計上ソース IP を運びません (#1610— MCP / A2A 呼び出しコンテキストは IP を伝播せず、値を捏造するのはさらに悪いでしょう)、`ip-range` 条件はそれなしでは `false` と評価されます。したがって、`/custom-data-models/**` に対して記述された `ip-range` を条件とする **Deny** は MCP パスでは発火しませんが、同じポリシーは HTTP 経由では発火します。これはすべての合成イベントチェックのプロパティです(この変更以前から存在し、エンティティ / バッチ / 時系列ツールに等しく適用されます)が、`/custom-data-models` ポリシーが MCP から評価されるようになったことで、ここで新たに到達可能になりました。`POST /mcp` 自体のパスレベル認可は実際のクライアント IP を引き続き認識するため、**エンドポイント**の IP 制限は影響を受けません— ツールのターゲットリソースではなく、そこで IP 制限を表現してください。


* **同じ配線が両方のエントリポイントで `rules` と `jsonld_contexts` をカバーします (#2244)。** #2223 は `custom_data_models` ブランチのみを配線しました。同じツールの兄弟ブランチはそのまま残されました— `handleRuleAction` は `requireAdminRole` で停止し、`handleJsonLdContextsAction` はロールゲートを全く持っていなかったため、`/mcp` のパスレベル `Permit` のみを保持するプリンシパルは JSON-LD コンテキストの作成 / 削除に到達しました。A2A の `config` スキルは、読み取り専用の `rules` / `jsonld_contexts` ハンドラーで同じギャップを持っていました。4 つすべてが、MCP と A2A が乖離しないように、1 つの共有マッピング (`@api/shared/authz/config-authz-target`) を通じて合成イベントを構築するようになりました:

  | action                    | rules                                                | jsonld\_contexts                                |
  | ------------------------- | ---------------------------------------------------- | ----------------------------------------------- |
  | `list`                    | `GET /rules`                                         | `GET /ngsi-ld/v1/jsonldContexts`                |
  | `get`                     | `GET /rules/{ruleId}`                                | `GET /ngsi-ld/v1/jsonldContexts/{contextId}`    |
  | `create`                  | `POST /rules`                                        | `POST /ngsi-ld/v1/jsonldContexts`               |
  | `update`                  | `PATCH /rules/{ruleId}`                              | —                                               |
  | `delete`                  | `DELETE /rules/{ruleId}`                             | `DELETE /ngsi-ld/v1/jsonldContexts/{contextId}` |
  | `activate` / `deactivate` | `POST /rules/{ruleId}/activate`\|`/deactivate` | —                                               |


* **`servicePath` は、HTTP に合わせてリソースごとに異なる処理をされます。** ReactiveCore ルールは `servicePath` をファーストクラスフィールドとして保持し、HTTP ルートは `Fiware-ServicePath` 派生値を `requireAuthz` に直接渡すため、MCP / A2A パスは呼び出し側の `servicePath` を変更せずに渡します— ここでそれを `/` に折りたたむこと (`custom_data_models` が行うように、#2221) は、HTTP 経由で機能する `servicePath` を条件とする Deny がツールパスで静かに失敗することになります。JSON-LD コンテキストは折りたたみを全く必要としません: `buildAuthzRequest` は、すべての NGSI-LD パスに対してすでに `resource.servicePath` を `/` に正規化しています (#1323 / #1862)。


* **`jsonld_contexts` にロールゲートは追加されませんでした。** HTTP ルートにもありません— 誰が何をできるかはポリシーのみで決定されます (デフォルトの `__default_user` ポリシーは `/ngsi-ld/**` のすべてのメソッドを `Permit` するため、制限されていない `user` も HTTP 経由でコンテキストを作成できます)。ツールを `tenant_admin` でゲートすると、HTTP 経由で成功する操作が MCP 経由で失敗することになり、これはパリティ不変性の逆です。


* 上記の `environment.sourceIp` の注意事項は、これらのリソースにも適用されます。


* **`admin` ツール (MCP) と `admin` スキル (A2A) は `/admin/**` と同じポリシーを評価します (#3566)。** これらは以前、ロールゲート (`requireAdminRole` / `requireA2AAdminRole`) とサービスレイヤーテナントチェックで停止し、XACML を評価しませんでした。そのため、`/admin/policies/*` または `/admin/users/*` に対して記述された `Deny` (例: `super_admin` によってテナントに注入された) は HTTP 経由では適用されましたが、MCP / A2A 経由では適用されませんでした。すべてのユーザー / ポリシーアクションは現在、1 つの共有マッピング (`@api/shared/authz/admin-authz-target`) を通じて対応する HTTP ルートで `requireAuthz` を呼び出します:

  | action                    | users                                                  | policies                                                  |
  | ------------------------- | ------------------------------------------------------ | --------------------------------------------------------- |
  | `list`                    | `GET /admin/users`                                     | `GET /admin/policies`                                     |
  | `get`                     | `GET /admin/users/{id}`                                | `GET /admin/policies/{id}`                                |
  | `create`                  | `POST /admin/users`                                    | `POST /admin/policies`                                    |
  | `update`                  | `PATCH /admin/users/{id}`                              | `PATCH /admin/policies/{id}`                              |
  | `change_password`         | `PATCH /admin/users/{id}`                              | —                                                         |
  | `delete`                  | `DELETE /admin/users/{id}`                             | `DELETE /admin/policies/{id}`                             |
  | `activate` / `deactivate` | `POST /admin/users/{id}/activate`\|`/deactivate` | `POST /admin/policies/{id}/activate`\|`/deactivate` |
  | `unlock`                  | `POST /admin/users/{id}/unlock`                        | —                                                         |


* **セルフサービスは `/me` サーフェスで評価されます。** `super_admin` でも `tenant_admin` でもないプリンシパルが**自身の** ID に対してアクションを実行する場合、`get` / `update` / `change_password` は代わりに `GET /me` / `PATCH /me` / `POST /me/password` にマップされます。`PATCH /me` には HTTP ルートがありません。これは、デフォルトの `/me/**` `Permit` および `/me/**` のカスタム `Deny` ルールの決定サーフェスとしてのみ使用される疑似パスです。デフォルトポリシーは意図的に `/admin/users/**` に拡張**されません**— それは HTTP の `/admin/users/**` ルートも `user` に開放することになります。ターゲットが本当に呼び出し側であるかどうかは、依然として `UserService` によって強制されます。管理ロール、他のユーザーの ID、および ID なしの呼び出しは `/admin/users…` マッピングを維持します。
  
* HTTP `/me` と MCP/A2A セルフサービスは同じ XACML 決定サーフェスを共有します (#3577)。
  
* テナント IP 制限スコープ `'admin'` (`isIpAllowedForTenant(…, 'admin')`) は、MCP / A2A 管理呼び出しにまだ適用されていません。これは合成イベントへのソース IP 伝播に依存します (#3530 G4)。

ツールインベントリと A2A の詳細については [AI\_INTEGRATION.md](../ai-integration/overview.md) を参照してください。

### テンプレート変数 (GeonicDB 拡張機能)

`matchValue` は `${subject.<attributeId>}` テンプレート変数をサポートしており、評価時にリクエストのサブジェクトの属性値に解決されます。これにより、ユーザー ID をハードコーディングすることなく「オーナーのみ」のアクセスのような動的なポリシーを実現できます。

| Template              | Resolves to                                              |
| --------------------- | -------------------------------------------------------- |
| `${subject.userId}`   | Requesting user's ID                                     |
| `${subject.email}`    | Requesting user's email                                  |
| `${subject.role}`     | Requesting user's role                                   |
| `${subject.tenantId}` | Requesting user's tenant ID (`''` for global principals) |

**これらの 4 つのみが解決可能な属性です**(`src/core/auth/policy/policy.pdp.ts` の `SUBJECT_ATTRIBUTE_IDS`)。それ以外の名前 — 例えば `${subject.userID}` のようなタイプミス、または `${subject.id}` / `${subject.name}` — は、すべてのポリシー書き込みパス(作成 / 更新 / ポリシーセット / XACML インポート)で**書き込み時に `400` で拒否されます**([#1939](#unresolved-subject-templates-1939))。

#### 未解決の `${subject.*}` テンプレート (#1939)

\#1939 以前は、解決不可能なテンプレートはその `matchValue` が**スキップ**され、囲んでいるグループを `NoMatch` にし、ルールを `NotApplicable` にしました。`Permit` ルールの場合、それは権限を削除する(安全)ことになりますが、**`Deny` ルールの場合、拒否が黙って適用されなくなり**(フェイルオープン) — そして書き込み API は `201` を返したため、ポリシー作成者にはシグナルがありませんでした。

現在、2 つのレイヤーがこれを閉じており、上記の `string-regexp` の扱いをミラーリングしています:


1. **書き込み時** — 任意の `matchValue` 内の未知のサブジェクト属性(`matchFunction` に関係なく)は `400` となります。
   
2. **評価時** — 未解決のテンプレートは処理不可能な `AttributeDesignator` となり、XACML 3.0 §7.6 に従って **`Indeterminate`** と評価され、フェイルクローズで `Deny` に解決されます(そしてリストクエリの行フィルタでは「読み取り可能な行なし」/ `403` になります)。このレイヤーは、書き込み時の検証が存在する前に保存されたポリシーや、サービス層をバイパスするパス(例: `scripts/backup-import.ts`)によって復元されたドキュメントをカバーします。

> これは XACML の `MustBePresent=false` ケース(空のバッグ → マッチなし)**ではありません**。解決可能な 4 つの属性はすべて `AuthzRequest` で必須であるため、テンプレートが解決に失敗するのは、属性 ID 自体が存在しない場合のみです — これは値の欠如ではなく、オーサリングエラーです。

#### 例: エンティティオーナーのみのポリシー

```json
{
  "description": "Users can only operate on entities they created",
  "ruleCombiningAlgorithm": "first-applicable",
  "rules": [
    {
      "effect": "Permit",
      "target": {
        "resources": [
          { "attributeId": "entityOwner", "matchValue": "${subject.userId}" }
        ]
      }
    },
    {
      "effect": "Deny"
    }
  ]
}
```

> `policyId` と `ruleId` は省略時に自動生成されます。

このポリシーは、`entityOwner`(エンティティの `createdBy` 値)がリクエストしているユーザーの `userId` と一致する場合のみアクセスを許可します。それ以外のすべてのリクエストは拒否されます。

#### 例: ServicePathベースのアクセス制御

```json
{
  "description": "Allow anonymous read access to /opendata/ service path",
  "target": {
    "subjects": [{ "attributeId": "role", "matchValue": "anonymous" }],
    "resources": [{ "attributeId": "servicePath", "matchValue": "/opendata/**" }],
    "actions": [{ "attributeId": "method", "matchValue": "GET" }]
  },
  "rules": [{ "ruleId": "permit-read", "effect": "Permit" }],
  "priority": 100
}
```

このポリシーは、匿名ユーザーが `/opendata/` ServicePath下のエンティティ(ネストされたパス `/opendata/sensors` などを含む)を読み取ることを許可します。グロブパターン `/**` は 0 個以上のパスセグメントにマッチします。

> **NGSIv2 のみ (#1323)**: このパターンが機能するのは、NGSIv2 が `Fiware-ServicePath` によってエンティティを保存およびフィルタリングするためです。NGSI-LD リクエストでは、`servicePath` 属性は常に `/` です(ヘッダーは仕様がなく、データ層によって無視されます)。したがって、上記のようなポリシーは NGSI-LD リクエストには決してマッチしません — 設計によるものです。代わりに NGSI-LD には `scope` / `entityType` 制約を使用してください。

#### 例: NGSI-LD スコープベースのアクセス制御

```json
{
  "description": "Allow read access only to entities scoped under /Madrid",
  "ruleCombiningAlgorithm": "first-applicable",
  "rules": [
    {
      "ruleId": "allow-madrid-read",
      "effect": "Permit",
      "target": {
        "resources": [
          { "attributeId": "scope", "matchValue": "(^|,)/Madrid(/[^,]*)?(,|$)", "matchFunction": "string-regexp" }
        ],
        "actions": [{ "attributeId": "method", "matchValue": "GET" }]
      }
    },
    { "ruleId": "deny-all", "effect": "Deny" }
  ],
  "priority": 50
}
```

このポリシーは、`scope` が `/Madrid` 自体またはその下の子パス(例: `["/Madrid/parks"]`)であるエンティティへの読み取りアクセスを許可します。エンティティのスコープは配列として保存され、カンマ区切りの文字列にシリアライズされる(例: `"/Madrid/parks,/Madrid/gardens"`)ため、意図しない部分マッチを避けるために、境界を認識する `string-regexp` パターン(`(^|,)` および `(,|$)` アンカーを使用)を推奨します。単一値の完全一致の場合、`string-equal` が直接機能します(例: `matchValue: "/Madrid"`)。

#### NGSI-LD スコープ認可: 3 つの実用的なパターン (#1659)

NGSI-LD の書き込み操作では、`scope` が欠如している場合(`missing` / `null` / `[]`)があります。その場合、認可はスコープ属性を `''`(空文字列)として評価します。意図的に次のいずれかのポリシースタイルを選択できます:


1. **許可リスト (厳格)**: 特定のスコープのみを許可し (例: `/Public`)、それ以外は fail-closed 動作に依存する。\
   結果: スコープ未設定の書き込みは拒否される (`403`)。
   
2. **拒否リスト + フォールバック許可**: 特定の禁止スコープを拒否し (例: `/Secret`)、他の書き込みは許可する。\
   結果: スコープ未設定の書き込みは許可される (`201`)。
   
3. **明示的な未設定制御**: `matchValue: ''` の明示的なルールを追加して、スコープなしエンティティを意図的に許可または拒否する。

#### Read=OR / Write=AND スコープセマンティクス (#1659)


* **読み取りパス (既存の動作)**: スコープマッチングは、保存されたカンマ区切りのスコープ文字列を使用する (OR セマンティクス)。\
  例: `["/Public", "/Secret"]` は `/Public` リーダーに対して読み取り可能。
  
* **書き込み先 (作成/移動)**: 各スコープ要素は独立した AuthzRequest として評価され、すべてが `Permit` でなければならない (`evaluateAllPermit`、AND セマンティクス)。\
  例: `Permit(POST, scope~/Public)` のみの場合、`["/Public", "/Secret"]` の書き込みは拒否される (`403`)。

この非対称性は意図的なものである: 読み取りの可視性は部分的 (OR) でよいが、書き込みはすべての宛先スコープに対して承認されなければならない (AND)。複数の書き込みスコープを 1 つのカンマ区切りの承認リクエストに折りたたんではならない。

#### バッチ書き込みは本文だけでなく既存エンティティを評価する (#1678)

バッチ書き込み操作 (`POST /ngsi-ld/v1/entityOperations/{upsert,update,merge,delete}`) は既に存在するエンティティを変更するため、リクエスト本文だけでは承認入力として十分ではない。本文で宣言されたターゲット (`entityType` は #1325 による、宛先 `scope` は #1659 による) に加えて、GeonicDB は本文内のすべての `id` を単一のプロジェクションクエリで解決し、**保存されたエンティティの実際の `entityType`、`entityOwner` (`createdBy`) および `scope`** を評価する — by-id パス (`checkEntityOwnership`) が使用するのと同じ属性である。


* **All-Permit**: いずれかの要素が `Permit` でない場合、書き込みが発生する前にリクエスト全体が `403` で拒否される (部分適用なし)。これは `/v2/op/update` のバッチセマンティクス (#1325) および NGSI-LD サブスクリプション作成 (#1104) と一致する。
  
* **移動セマンティクス**: *ソース
* スコープ (保存済み) とすべての *宛先
* スコープ要素 (本文、要素ごとの AND) がすべて許可されなければならない。
  
* **作成は除外**: まだ存在しない id は作成として扱われ、本文で宣言された属性のみが適用される。
  
* **曖昧な id** (1 つの id に対して複数のドキュメント、ユニークインデックスが欠落している場合のみ可能) は、一致する**すべての**ドキュメントに対して `Permit` を必要とする (fail-closed)。
  
* **非 HTTP 呼び出し元**: MCP ツールと A2A スキルは HTTP コントローラーをバイパスするため、同じ実行ヘルパー (`syntheticCheckBatchEntityAuthz`) を呼び出す。したがって、ポリシーとして表現された制限は、HTTP、MCP、A2A で同一に保持される。

実際の結果: `Deny when scope ~ /Secret` のようなポリシーは、`PATCH /entities/{id}` をブロックするのとまったく同じように、`/Secret` 下に保存されたエンティティに対する `entityOperations/update` をブロックするようになった。#1678 以前は、バッチ形式がそれを暗黙的にバイパスしていた。

> **ステータスコードに関する注意**: NGSI-LD (ETSI GS CIM 009) は承認失敗を定義していない — `207 Multi-Status` はエンティティごとの*操作*エラー (NotFound / BadRequestData) 用であり、表 6.3.2-1 には AccessDenied エラータイプがない。したがって、GeonicDB はリクエストレベルの `403` を返す。部分適用で `207` を返すと、バッチ形式での同じ制限が by-id 形式よりも弱くなり、承認パリティ不変条件 (#1376) が壊れることになる。

#### 承認決定はそれが行われたドキュメントに固定される (#1943)

保存されたエンティティの評価 (#1678) は保証の半分に過ぎない。承認クエリと書き込みは 2 つの別々のラウンドトリップであるため、その間に第三者が**エンティティをハード削除し、異なるプリンシパルが同じ id で再作成する**ことができる。2 つのステップ間にリンクがないと、PDP が見たことのない `entityOwner` / `scope` を持つドキュメントに書き込みが着地する — 個々のステップがすべて正しく動作していても、承認バイパスとなる。

GeonicDB は、評価されたドキュメントの identity を書き込みに引き継ぐことでこれを防ぐ:


* `getEntityAuthzContexts()` は、`entityOwner` / `scope` / `entityType` と共に、一致する各ドキュメントの **`_id`** を返す。
  
* `checkBatchEntityAuthz()` は、それらの `_id` を**承認ピン** (`EntityAuthzPins`) として、エンティティ id をキーとして返す。
  
* その決定から派生するすべての書き込みは、ピンを MongoDB フィルタに追加する: `_id ∈ {評価された ids}`。承認ステップで**存在しない**と見なされた id (作成として扱われる) は、既存のドキュメントと一致することのない述語を取得し、書き込みを**挿入のみ**にする — そのため、競合ウィンドウ内で作成されたドキュメントも暗黙的に更新されることはない。

**なぜ `_id` であって `createdBy` やバージョンカウンターではないのか。** `createdBy` は挿入時 (`EntityRepository.create`) にのみ書き込まれ、更新されることはないため、ドキュメントの所有者は不変である; 所有者が変更される唯一の方法は削除 + 再作成であり、常に新しい `_id` が生成される。したがって、`_id` をピン留めすることで所有者の次元を正確に閉じることができる。`createdBy` をピン留めしても不十分である: `batchCreate` は `createdBy` をまったく設定しないため、所有者のないドキュメントが別の所有者のないドキュメントに置き換えられても等しいと比較される。バージョンカウンター (`EntityDocument.version`、すでに存在し、すべての書き込みパスで維持されている) は**意図的に使用されない**: 書き込みと競合する*インプレース*変更 — `scope` の移動を含む — は、書き込みが最初に発生した直列順序と等価であり、承認違反ではない。バージョンピン留めは、無害な並行更新を競合に変換するだけで、バルクパスの文書化された最終書き込み勝利動作を後退させる。

**「Deny での部分適用なし」契約との関係。** その契約 (#1325 / #1678 / #1928 / #1932) は*承認決定*に関するものであり、依然として事前に評価され、依然として書き込み前にリクエストレベルの `403` をもたらす。ピンの不一致は Deny ではない — 書き込み時に検出される並行性の競合であり、ETSI GS CIM 009 が `207 Multi-Status` + `BatchOperationResult` のエンティティごとのエラーでモデル化しているものである。セキュリティ関連の保証は無条件であり、両方の形式で保持される: **書き込みは、PDP が評価しなかったドキュメントには決して着地しない。** バルクパスでは、不一致要素はエンティティユニークインデックス (`idx_entity_unique_v3`) で失敗し、エンティティごとのエラーとして報告される; エンティティごとのループパス (`entityOperations/{update,merge,delete}`、`actionType=replace|delete` を持つ `/v2/op/update`) では、何にも一致せず、既存の `ResourceNotFound` エンティティごとのエラーとして表示される。いずれの場合も、その要素は何も永続化しない。

**エンティティごとの `detail` は、原因が明白な場合にのみ原因を示す。** ピン留めされたバルク操作での重複キー失敗には、少なくとも 3 つの原因がある: 上記の TOCTOU スワップ; ソフト削除または期限切れになったドキュメント (バルク *replace* フィルタはライブ述語を持つが、承認クエリは意図的に持たない、#1678 による — これは競合をまったく必要としない); および、承認が存在しないと見なしたときに 1 つのペイロード内に同じエンティティ id が 2 回出現する場合。書き込みエラーは一般にそれらを区別できないため、競合の文言 — およびリトライの提案 — は、原因が確実な場合にのみ追加される: ピンセットが空の場合 (承認がドキュメントを見なかったため、その後何かが id を要求したに違いない)、または書き込みフィルタがライブ述語を持たない場合 (`batchUpsert`)、重複キーはピン留めされたドキュメントが消失したことしか意味しない。空でないピンを持つ `batchReplace` では、メッセージは単純な「エンティティは既に存在します」というテキストのままである。なぜなら、ソフト削除または期限切れのドキュメントで失敗している書き込みをリトライするように呼び出し元に指示すると、永久にループするからである。生の MongoDB メッセージは、いかなる場合も返されない。インデックス名とキー値が別のテナントまたは所有者のスロット内のドキュメントの存在を開示するからである。

**バルクパスの結果は `idx_entity_unique_v3` に依存する。** 「何も永続化しない」が成立するのは、ピン留めされた upsert の挿入試行がエンティティユニークインデックスと衝突するためである。そのインデックスが存在しない場合 — 上記で説明した曖昧な id を生成するのと同じ劣化状態 — 挿入は成功し、失敗する代わりに同じ `entityId` に対して *2 番目の*ドキュメントを追加する。セキュリティ不変条件は依然として保持される (書き込みは PDP が評価しなかったドキュメントには着地しなかった) が、要素はもはや no-op ではない。エンティティごとのループパスはインデックスに依存しない: 何にも一致せず、いずれにせよ `ResourceNotFound` を返す。同じ理由で、マージセマンティクスと暗号化エンベロープを供給するバルクプリフェッチは、書き込みと同じピンでフィルタリングされる — そうしないと、その劣化モードでは、スワップされたドキュメントから読み取られた属性が生き残ったドキュメントに書き込まれる可能性がある。

パージはクエリ選択ドキュメント世代を使用する (#4199): 各ミューテーションは `_id`、正確なServicePath、保存された id/type、version および modifiedAt をピン留めし、元のテナント/プロトコル/クエリスコープを保持する。完全削除は、`deleteOne` モデルと `verboseResults: true` を持つ 1 つのターゲットバウンド `MongoClient.bulkWrite` API 呼び出しを使用する; 明示的なモデルごとの削除成功のみがイベントとレガシー Temporal トゥームストーンを供給する。ドライバーはコマンドをバッチ処理したり結果カーソルをフェッチしたりする可能性があるため、これは 1 回の物理的なラウンドトリップの主張ではない。暗号化された keep/drop は既存のシーケンシャルフォールバックを保持する: 成功したイメージは、元のエラーが後で再スローされる前に通知され、後のプランは試行されない。このパージ世代ガードは、上記で説明したバルク upsert/replace 最終書き込み勝利契約とは別物である。

まだカバーされていない (別途追跡中): 時系列バッチ書き込み (承認属性は `entities` コレクションにあるが、書き込みは `temporal` コレクションをターゲットとするため、`_id` ピンは適用されない)、および単一エンティティの by-id パス (同じ read-then-write 構造を持つ)。

#### 同じルールが NGSIv2 バッチと Temporal バッチに適用される (#1928)

上記の契約は NGSI-LD 固有ではない。さらに 2 つのバッチ形式が同じ方法で保存されたエンティティを評価する:


* **`POST /v2/op/update`** (すべての `actionType` 値: `append` / `appendStrict` / `update` / `replace` / `delete`)。NGSIv2 には `scope` 概念がないため、`entityOwner` / `entityType` の次元のみが適用される — 宛先スコープ AND 評価はない。
  
* **`POST /ngsi-ld/v1/temporal/entityOperations/{upsert,delete}`**。時系列コレクションは `owner` / `scope` を保存しないため — 時系列 by-id ルートがそうするように (#1336) — 承認属性は **entities** コレクション (`createdBy` / `scope` / `entityType`) から読み取られる。

両方とも最初の書き込みの前に評価されるため、いずれかの要素に対する `Deny` はリクエスト全体を `403` で拒否し、何も永続化しない。MCP 時系列バッチツールは HTTP コントローラーをバイパスするため、同じヘルパー (`syntheticCheckBatchEntityAuthz`) を呼び出す。

\#1928 以前は、両方の形式が認証されたアクターを完全に破棄していた: `PATCH /v2/entities/{id}/attrs` または `PATCH /ngsi-ld/v1/temporal/entities/{id}` を `403` でブロックしたポリシーは、同一の書き込みをバッチエンドポイント経由で送信することでバイパスされ、`204` が返された。

> **既知の制限 (#1928 / #1941 / #2434 では変更なし)**: `scope` メンバーなしで時系列 API を通じて作成されたエンティティは、entities コレクションにドキュメントを持たないため、所有者が記録されない。そのようなエンティティには所有者ベースの制限がない — バッチ形式*および* by-id 形式の両方で、承認パリティが保持される。時系列のみのエンティティへの所有権の付与は別途追跡されている。`scope` を持つ時系列作成は現在のエンティティを実体化する (#2434 A'-1) ため、スコープを持つ時系列のみの作成は**所有者なし**ではない — 実体化されたドキュメントは、作成プリンシパルを `createdBy` として記録する。

#### Temporal 履歴の作成は既存エンティティへの書き込みである (#1941)

`POST /ngsi-ld/v1/temporal/entities` と `POST /ngsi-ld/v1/temporal/entityOperations/create` は作成のように見えるが、ターゲット id が既に **entities** コレクションにドキュメントを持っている場合、*他人の*エンティティに履歴を書き込む。#1941 以降、両方とも最初の書き込みの前に保存された `entityOwner` / `scope` / `entityType` — すべての時系列ルートがそうするように entities コレクションから読み取られる (#1336) — を評価する。

このギャップは見逃しやすかった。唯一の既存のガード `temporalEntityExists` は **temporal** コレクションのみを検査するからである。したがって、バイパスウィンドウは正確に「entities に外部所有のドキュメントがあり**かつ**まだ temporal ドキュメントがない」という状態だった: `AlreadyExists` なし、所有権チェックなし、`201`。`PATCH /ngsi-ld/v1/temporal/entities/{id}` から `403` を受け取ったプリンシパルは、`create` を通じて同じエンティティの履歴を捏造できた — #1363 / #1325 / #1678 / #1928 / #1932 ファミリーのリクエスト形式パリティ破損。

バッチ作成はエンティティごとの*操作*エラーに対して `207 Multi-Status` を返すが、承認はループの**前に**リクエスト全体に対して評価される: いずれかの要素に対する `Deny` は、すべてを `403` で拒否し、何も永続化しない。要素ごとにスコアリングすると、バッチ形式が by-id 形式よりも弱くなり、修正されている欠陥そのものである。

entities コレクションドキュメントがない id は依然としてスキップされるため、真に時系列のみのエンティティ (`scope` メンバーを持たないもの) は以前とまったく同じように作成される。スコープを持つ本文は 1 つの例外である (#2434 / #2758 / #2796 / #2814 A'-1):
HTTP by-id `POST /temporal/entities`、HTTP `entityOperations/create` / `upsert`、および MCP `create` /
`batch_create` / `batch_upsert` はすべて現在のエンティティを実体化するため、`GET /entities/{id}` と

`DELETE /entities/{id}/attrs/scope` は直後に動作します。
MCP / A2A のパスレベル authz は、HTTP の `targetsFromEntityArray` / `extractScopeFieldFromBody` が評価するのと同じ宛先 `scope` を (`buildTemporalCreatePathAuthzBody` を介して) 渡さなければなりません。そうでなければ、A'-1 は HTTP が拒否する Deny scope を永続化してしまいます(#2796 / #2814)。バッチパスでは、1つのエンティティの実体化失敗はそのエンティティの `207` `errors[]` エントリにマッピングされ、その時系列書き込みはスキップされます(他のエンティティは継続します)。A2A の `temporal` スキル(`create`)も同じヘルパーを呼び出します。

#### 通知受信は書き込みであり、例外ではない(`POST /v2/op/notify`

、#1932)

`POST /v2/op/notify` は通知受信エンドポイントです:上流のContext Brokerまたはコンテキストプロバイダーが `{ subscriptionId, data: [...] }` ペイロードを送信し、GeonicDB はローカルエンティティに `data[]` を追加します。#1932 以降、`data[]` 内のすべての要素について、最初の書き込みの前に**保存された** `entityOwner` / `entityType` を評価します。これは `actionType: append` を伴う `POST /v2/op/update` とまったく同じです。NGSIv2 仕様も Orion API もこのエンドポイントの認可を定義していないため、選択は GeonicDB に委ねられています。決定ルールはパリティ不変性です(#1376):


* **呼び出し元はポリシーによって評価されるプリンシパルであり、匿名のワイヤではありません。** `/v2/op/notify` は特別な認証契約を持ちません — 他のすべてのデータルートと同様に `optionalAuth` を通過します。つまり:`AUTH_ENABLED=false` の場合、すべてのリクエストは `super_admin` として扱われます。`AUTH_ENABLED=true` の場合、資格情報付きのリクエストは独自のプリンシパルになり、資格情報なしのリクエストは `role=anonymous` になります。デフォルトポリシーはパスステージで Deny しますが、カスタム `Permit` で許可することができます。どのプリンシパルになっても、ID ベースのルートが見るのと同じプリンシパルです。テナントポリシーが他の誰かが所有するエンティティへの書き込みを拒否する場合、その拒否は意図的なものであり、このリクエストを含むすべてのリクエスト形式で保持されなければなりません。
  
* **通知はリクエストの*形式*であり、権限レベルではありません。** これを免除すると、同じポリシーが `/v2/op/notify` では `PATCH /v2/entities/{id}/attrs` よりも弱くなります — これは #1363 / #1325 / #1678 / #1928 とまったく同じ欠陥クラスです。強制されない場合、エンドポイントに到達できるすべてのプリンシパルは、テナントに対する汎用書き込みプリミティブを保持することになります。
  
* **`subscriptionId` は決して認可入力ではありません。** これは呼び出し元が提供する自由形式の文字列(`Ngsiv2NotifySchema`)であるため、そこから権限を導出すること — 例えば「登録されたサブスクリプションを指定する人を信頼する」 — は構造的にフェイルオープンになります。認証されたアクターと保存されたエンティティ属性のみが使用されます。また、それと照合するものは何もありません:この ID は**通知を送信したContext Broker上の**サブスクリプションを識別し、受信するContext Brokerはその記録を保持していません。サブスクリプション由来の認可はここでは単に安全でないだけでなく、操作するデータがありません。

作成は影響を受けません:保存されたドキュメントがない ID は作成としてスキップされるため、新しいエンティティを導入する通知は以前とまったく同じように動作します。ブロックされるのは、ポリシーが保護する**既存の**エンティティの上書きです。上流のContext Brokerが所有していないエンティティを上書きできるようにしたいデプロイメントは、欠落したチェックに依存するのではなく、ポリシーでそれを明示する必要があります(例えば、`/v2/op/notify` 上のその `userId` に対する `Permit` ルール)。

**認可ルックアップは書き込みが触れるもののスーパーセットでなければなりません。** 認可属性を解決するプロジェクションクエリは、読み取りパスが適用する「ライブ」述語(`deletedAt` / `expiresAt`)を意図的に省略します。なぜなら、バッチ書き込みフィルターもそれらを適用しないためです。認可ルックアップが任意の述語(テナント / servicePath / プロトコル / ソフト削除 / 有効期限 / タイプ)において書き込みよりも狭い場合、影響を受けるドキュメントは認可にとって*存在しない*ように見え、作成として扱われ、チェックを完全にスキップします — これはサイレントなフェイルオープンです。過剰な包含は無害です:認可が見ることができるが読み取りができないドキュメントは、その後も `404` として返されます。

### デフォルトポリシー

GeonicDB は以下のロールデフォルトポリシーを構成します(信頼できる情報源:`src/core/auth/policy/policy.defaults.ts`):


* **`super_admin`**: 管理 API (`/admin/**`)、読み取り専用の統計/メトリクス、および `/me/**` で Permit。拒否フェンス(優先度 `-1`、上書き不可)がデータ API (`/v2/**`、`/ngsi-ld/**`、`/catalog/**`、`/rules/**`、`/custom-data-models/**`、`/mcp`)をブロックします — プラットフォーム管理者はテナントデータに触れることができません。`/a2a` はフェンスにリストされていませんが、デフォルトの Permit もないため、フェイルクローズドパスステージで同様に拒否されます。
  
* **`tenant_admin`**: すべてのデータ API、AI ツールエンドポイント `/mcp` および `/a2a` (#1651)、およびテナントスコープの管理 API で Permit(すべてのメソッド)。
  
* **`user`**: NGSI API (`/v2/**`、`/ngsi-ld/**`)で Permit(CRUD)。`/catalog/**`、`/rules/**`、`/custom-data-models/**`、および `/mcp` では `GET` のみ。さらに `/me/**` と読み取り専用の統計/メトリクスエンドポイント。MCP ツールコールトランスポートは `POST /mcp`、A2A は `POST /a2a` であることに注意してください — **どちらも `user` デフォルトではカバーされません**(`GET /mcp` のみ。`/a2a` は全くカバーされません)。したがって、`user` が MCP / A2A ツールを呼び出すには、`api_key` / `oauth_client` と同様に、カスタム Permit ポリシーが必要です。
  
* **`api_key` / `oauth_client`**: デフォルトでは `GET /me` Permit のみ(資格情報イントロスペクション、#3481 / #3577)。他のすべてのパスは `NotApplicable` と評価され、明示的な Permit ポリシーがバインドされるまで、フェイルクローズド PEP によって `403` で拒否されます(明示的な XACML `Deny` ではありません。[パスレベル vs エンティティレベル認可](#パスレベル-vs-エンティティレベル認可) を参照してください)。`path=/me` に対するカスタム `Deny` は、イントロスペクション Permit を上書きします。
  
* **`anonymous`**: 空ルールデフォルト(`rules: []`) — デフォルト `Permit` なし。明示的な Permit ポリシーが作成されるまで、すべてのリクエストは `NotApplicable` → PEP `403` となります。

`tenant_admin` によって作成されたカスタムテナントポリシーは、許可リスト `TENANT_POLICY_ALLOWED_PATH_PREFIXES` (`/v2/`、`/ngsi-ld/`、`/catalog`、`/rules`、`/custom-data-models`、`/mcp`、`/a2a`)内のパスのみをターゲットにできます — これは、MCP / A2A ツールアクセス(`POST /mcp` / `POST /a2a`)が `user` / `api_key` / `oauth_client` プリンシパルに付与される方法でもあります([MCP / A2A ツール認可](#mcp--a2a-tool-authorization-1610--1651--1672) を参照してください)。同じ許可リストは、`personal` スコープポリシーにバインドされた資格情報に対するパスフェンスとして実行時に強制されます(#3544)。ただし `GET /me` は例外です(資格情報イントロスペクションは免除されるため、個人バインドキーは自分自身のプリンシパルを読み取ることができます)。上記の [セルフサービス API キー管理](#セルフサービス-api-キー管理) を参照してください。個人バインドキーを介して MCP / A2A を使用するには、さらに所有者自身がその操作を許可されている必要があります(#3564):`user` デフォルトは `GET /mcp` のみをカバーし、`/a2a` はカバーしないため、テナントポリシーは所有者(`role=user` / `userId` / `email`)を Permit する必要があります — `role=api_key` Permit だけでは個人バインドを解除できません。

ポリシーレベルの `target` に `path` リソースが必要です。または — そのターゲットに `path` がない場合 — すべての `Permit` ルールに必要です(#3529)。これは、`/admin/policies` および `/admin/policies/import` への `tenant_admin` の書き込み、および `/me/policies`(作成とマージ更新)への `user` / `tenant_admin` の書き込みに適用されます。`path` のない `Permit` ルールはすべてのパスにマッチするため、パススコープの `Permit` の隣に配置すると、「どこかに少なくとも1つのパス」チェックを満たしながら、許可リスト外のパスを引き続き認可していました。`Deny` ルールは免除されます:パスのない `Deny` はアクセスを狭めるだけです。ポリシーレベルのターゲットにすでに `path` がある場合、ルールレベルのターゲットはそれを繰り返す必要はありません。なぜなら、そのターゲットはルールと共に評価されるためです(バインドされたポリシーはポリシーレベルのターゲットを削除しません)。`super_admin` は免除されます。すでに保存されているポリシーは、次の更新まで再チェックされません。

### 匿名アクセスポリシー (GeonicDB 拡張)

GeonicDB は、テナント管理者によって設定された場合、データ API への匿名(未認証)アクセスをサポートします。これは、認証を必要とせずに公開データ(例:気象観測、オープンデータセット)を公開するのに便利です。

#### 前提条件


1. **明示的な Permit ポリシーを作成する**: `role=anonymous` を対象に、希望するアクセスレベルを設定します(#748 以降、機能フラグは不要)

#### セットアップ

```bash
# Create a policy allowing anonymous read access
curl -X POST http://localhost:3000/admin/policies \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Allow anonymous read access to WeatherObserved entities",
    "target": {
      "subjects": [{"attributeId": "role", "matchValue": "anonymous"}],
      "resources": [
        {"attributeId": "path", "matchValue": "/v2/**", "matchFunction": "glob"},
        {"attributeId": "entityType", "matchValue": "WeatherObserved"}
      ]
    },
    "ruleCombiningAlgorithm": "first-applicable",
    "rules": [
      {"effect": "Permit", "target": {"actions": [{"attributeId": "method", "matchValue": "GET"}]}},
      {"effect": "Deny"}
    ]
  }'

# 3. Anonymous access (no Authorization header)
curl http://localhost:3000/v2/entities?type=WeatherObserved \
  -H "Fiware-Service: mytenant"
```

ブラウザ / Node アプリの場合、SDK は `anonymous: true` オプションを介して同じフローをサポートします(トークン取得なし、`Authorization` ヘッダーなし)。`docs/SDK.md` を参照してください。

```javascript
const db = new GeonicDB({
  baseUrl: 'http://localhost:3000',
  tenant: 'mytenant',
  anonymous: true,
});
const entities = await db.getEntities({ type: 'WeatherObserved' });
```

#### セキュリティモデル


* **フェイルクローズ**: 明示的な Permit ポリシーがない場合、すべての匿名リクエストは拒否されます(403)。
  
* **ポリシーなし = 拒否**: 匿名アクセスには常に明示的な XACML Permit ポリシーが必要です。
  
* **管理 API には決してアクセスできない**: 匿名ユーザーは、ポリシーに関係なく `/admin/*`、`/auth/*`、または `/me/*` エンドポイントにアクセスできません。
  
* **テナント分離**: 匿名リクエストには `Fiware-Service` ヘッダーを含める必要があります。匿名ユーザーは指定されたテナントにバインドされ、他のテナントのデータにアクセスできません。
  
* **取り消し可能**: XACML Permit ポリシーを削除すると、すべての匿名アクセスを即座にブロックできます。
  
* **認証情報が提示されたが無効 → 401、匿名ではない(#2794)**: `optionalAuth`(データ API / `/custom-data-models` / MCP / A2A)は、認証情報が欠落している場合は `role=anonymous` として扱いますが、提示された **あらゆる** `Authorization` または `X-Api-Key` ヘッダー(空の Bearer / 不正な形式のスキームを含む)が検証に失敗した場合は `401 Authentication required` を返します。失敗した認証情報を匿名にダウングレードすると、以前は `403 Access denied: no applicable policy` として表示され、401 をキーとするクライアントのリフレッシュロジックがブロックされ、匿名 Permit ポリシーを黙って許可する可能性がありました。

***

## ポリシー伝播遅延と HTTP キャッシュ整合性 (#1050 / #3299)

XACML ポリシーが `/admin/policies` 経由で追加、変更、または削除されると、すべての Lambda インスタンスは、新しい無効化エポックを読み取ることができる次のリクエスト時にメモリ内ポリシーキャッシュを破棄します。

### キャッシュレイヤー


1. **`PolicyService` インスタンスキャッシュ (TTL: `AUTH.POLICY_CACHE_TTL_MS` = 60秒、バックストップ)** — `findActivePoliciesForTenant` とバインドポリシー検索の Lambda インスタンスごとのメモリ内キャッシュ。作成/更新/削除/有効化/無効化が成功すると、コントロールプレーンコレクション `policyInvalidations` 内のデプロイメントスコープのモノトニックエポックが増加します(`$inc` upsert、#3299)。キャッシュヒットは、保存されたエポックが現在のものと一致する場合にのみ提供されます。不一致の場合はエントリが削除され、リポジトリから再読み込みされます。TTL は、エポックが変更されていない間もエントリを削除します。エポック読み取りが失敗した場合、キャッシュはバイパスされ、ポリシーはリポジトリから読み込まれるため、古い Permit が返されることはありません。
   
2. **API キー検証キャッシュ (TTL: `CACHE.API_KEY_VERIFY_TTL_MS` = 30秒、バックストップ)** — `keyHash` → 検証結果(否定的な結果を含む)の Lambda インスタンスごとのキャッシュ。すべての API キーの作成/更新/削除/ローテーション/メンバーシップ取り消し、およびテナントカスケード削除は、コントロールプレーンコレクション `apiKeyInvalidations` 内のデプロイメントスコープのモノトニックエポックを増加させます(#3325)。ヒットは、保存されたエポックが現在のものと一致する場合にのみ提供されます。それ以外の場合、エントリは再読み込みされます。エポック読み取りが失敗した場合、キャッシュはバイパスされます。増加が失敗した場合、書き込みリクエストは失敗します(サイレントな TTL フォールバックなし)— データベース書き込みが既に適用されている可能性があるため、エラーレスポンスは書き込みがロールバックされたことを意味しません。
   
3. **データエンドポイントの HTTP / CDN キャッシュなし** — すべてのデータエンドポイントは `Cache-Control: private, no-cache` を返します(#1047)。共有キャッシュはこれらのレスポンスを保存してはならず、プライベートキャッシュでさえ再検証しなければなりません。ポリシー変更は、エポック増加が可視化された後の次のリクエストで伝播し、TTL 有効期限の後ではありません。

### 最悪ケース伝播遅延


* **単一 Lambda インスタンス**: 即座(同じ書き込みでローカルキャッシュクリアとエポック増加)。
  
* **複数 Lambda インスタンス**: エポックドキュメントが可視化された後の次のリクエスト。60秒の TTL は、エポックが変更されていない場合のバックストップにすぎません。

ポリシーの厳格化を有効にするために Lambda を再起動する必要はありません。トークンの無効化は、すでに発行された認証情報を削除する方法として残ります([Token Invalidation](#token-invalidation) を参照)。

### ポリシー取り消し後の HTTP キャッシュ整合性

ハンドラーは、`tests/unit/handlers/api/index.test.ts` のユニットテストの `#1050` リグレッションテストで固定されたこの順序でミドルウェアを評価します:

```text
extractAuthContext → optionalAuth → checkTenantAccess → requireAuthz (XACML PEP)
  → controller (200 + ETag)
  → evaluateConditionalRequest (200 → 304 if If-None-Match matches)
```

`requireAuthz` が `ForbiddenError` をスローした場合(ポリシーが取り消された)、レスポンスは `catch` ブロックを通過し、`4xx` を直接返します — `evaluateConditionalRequest` は**呼び出されません**。したがって、クライアントが取り消し前の古い ETag で `If-None-Match` を送信しても、サーバーは `403` を返し、決して `304` を返しません。古いビューは再浮上できません。

### 運用上の推奨事項


* **監査上重要な取り消し**は、トークンの無効化とペアにする必要があります([Token Invalidation](#token-invalidation) を参照)。これにより、ユーザーを強制的にログアウトさせ、実行中のキャッシュされたレスポンスがクライアントによって信頼されることを防ぎます。
  
* **ポリシーホットフィックス**は、無効化エポックが増加した後の次のリクエストで有効になります(#3299)。60秒の TTL は、もはやインスタンス間の伝播を制限しません。

***

## リソーススコープ

> **#748 で削除済み**(JWT 埋め込みの `resourceScopes` と評価 middleware)。細粒度制御は XACML ポリシーを使う。残骸クリーンアップは #2263。

***

## テナントごとの機能フラグ(非推奨)

> **#748 で削除**: テナント機能フラグ(`apiKeysEnabled`、`oauthClientsEnabled`、`anonymousAccessEnabled`)は削除されました。認可は現在、ロールベースのデフォルトを持つ XACML ポリシーによって完全に処理されます:
>
> * API キー: デフォルトで Deny、明示的な XACML Permit ポリシーが必要
> * OAuth クライアント: 常に利用可能(機能フラグゲートなし)
> * 匿名アクセス: デフォルトで Deny、明示的な XACML Permit ポリシーが必要(機能フラグ不要)

***

## 認証シナリオリファレンス

### ロール別アクセス権限サマリー

| API Category                                   | anonymous           | user                                       | tenant\_admin                          | super\_admin      |
| ---------------------------------------------- | ------------------- | ------------------------------------------ | -------------------------------------- | ----------------- |
| Public endpoints                               | ✅                   | ✅                                          | ✅                                      | ✅                 |
| `/statistics`, `/cache/statistics`, `/metrics` | ❌ (401)             | ✅ (auth required)                          | ✅ (auth required)                      | ✅ (auth required) |
| `/auth/*`                                      | ❌ (401)             | ✅                                          | ✅                                      | ✅                 |
| `/me/*`                                        | ❌ (401)             | ✅                                          | ✅                                      | ✅                 |
| `/v2/*`                                        | ⚠️ Policy-dependent | 📖 Read-only (own tenant)                  | ✅ (own tenant)                         | ❌ Denied (403)    |
| `/ngsi-ld/*`                                   | ⚠️ Policy-dependent | 📖 Read-only (own tenant)                  | ✅ (own tenant)                         | ❌ Denied (403)    |
| `/catalog/*`                                   | ⚠️ Policy-dependent | 📖 Read-only (own tenant)                  | ✅ (own tenant)                         | ❌ Denied (403)    |
| `/admin/users`                                 | ❌ (403)             | ❌                                          | ✅ (`user` role within own tenant only) | ✅ (all users)     |
| `/admin/policies`, `/admin/policy-sets`        | ❌ (403)             | ❌                                          | ✅ (own tenant)                         | ✅ (all tenants)   |
| `/admin/cadde`                                 | ❌ (403)             | ❌                                          | ❌                                      | ✅                 |
| `/custom-data-models`                          | ❌ (403)             | 📖 Read-only (own tenant)                  | ✅ (own tenant)                         | ✅ (all tenants)   |
| `/admin/*` (others)                            | ❌ (403)             | ❌ (OAuth: accessible with `admin:*` scope) | ❌                                      | ✅                 |
| `/rules`                                       | ⚠️ Policy-dependent | 📖 Read-only (own tenant)                  | ✅ (own tenant)                         | ❌ Denied (403)    |
| WebSocket                                      | ❌ (403)             | ✅ (own tenant)                             | ✅ (own tenant)                         | ❌ Denied (403)    |

> **⚠️ ポリシー依存**: `role=anonymous` をターゲットとする明示的な XACML Permit ポリシーが必要です。これがない場合、403 を返します。
>
> **カタログ認証情報 (#2472)。** `/catalog/**` に対するパスレベルの `Permit` だけでは、`api_key` / `oauth_client` / `anonymous` には不十分です。カタログは、合成された `GET /v2/entities` 評価 (#2465 / #2471) から行フィルターを導出します。一致する entities の Permit がない場合、導出は `kind:'none'` となり、カタログは **403** を返します。[カタログ読み取り認証情報](#catalog-read-credentials-2465--2468--2472) を参照してください。

### 一般的な認証シナリオ

#### シナリオ 1: 認証無効 (`AUTH_ENABLED=false`

)

すべてのエンドポイントは認証なしでアクセス可能です。

#### シナリオ 2: JWT 認証

```bash
# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password12345"}'

# API request
curl -X GET http://localhost:3000/v2/entities \
  -H "Authorization: Bearer <access_token>" \
  -H "Fiware-Service: mytenant"
```

#### シナリオ 3: OAuth 2.0 M2M 認証

```bash
# Obtain token
curl -X POST http://localhost:3000/oauth/token \
  -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d "grant_type=client_credentials&scope=read:entities"

# API request
curl -X GET http://localhost:3000/v2/entities \
  -H "Authorization: Bearer <access_token>" \
  -H "Fiware-Service: mytenant"
```

#### シナリオ 4: API Key 認証

```bash
# Create an API key (via admin or self-service)
curl -X POST http://localhost:3000/me/api-keys \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My App Key",
    "allowedOrigins": ["*"]
  }'

# API request with API key
curl -X GET http://localhost:3000/v2/entities \
  -H "X-Api-Key: gdb_<key_from_creation_response>" \
  -H "Fiware-Service: mytenant"
```

#### シナリオ 5: OIDC 外部 IdP 認証

```bash
# Obtain ID token from external IdP (e.g., Google)
# API request
curl -X GET http://localhost:3000/v2/entities \
  -H "Authorization: Bearer <id_token_from_google>" \
  -H "Fiware-Service: mytenant"
```

#### シナリオ 6: 匿名アクセス (認証なし)

```bash
# No Authorization header needed
# Requires: XACML Permit policy for role=anonymous (no feature flag needed since #748)
curl -X GET http://localhost:3000/v2/entities?type=WeatherObserved \
  -H "Fiware-Service: mytenant"
```

***

## トークン無効化

GeonicDB はユーザーごとのトークン無効化メカニズムを提供します。

### 無効化の仕組み

ユーザーごとにタイムスタンプ (`invalidatedBefore`) が保持されます — 「この時刻より前に発行されたトークンは無効」。トークンの `iat` (発行時刻) がこのタイムスタンプより前の場合、トークンは無効と判定されます。

### 無効化が発生するタイミング

| Action                                | Effect                                                                        |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| `POST /auth/logout`                   | Immediately invalidates all access tokens and refresh tokens for that user    |
| `POST /me/password` (password change) | Invalidates all existing tokens after the password change (re-login required) |

### ストレージ

| Environment       | Storage        | Configuration                                                      |
| ----------------- | -------------- | ------------------------------------------------------------------ |
| AWS Lambda        | DynamoDB table | Specified via `TOKEN_INVALIDATION_TABLE_NAME` environment variable |
| Local development | In-memory Map  | Used automatically when environment variable is not set            |

DynamoDB テーブルには TTL が設定されており (7 日間)、リフレッシュトークンの有効期限を超えたレコードは自動的に削除されます。

### 注意事項


* OAuth 2.0 Client Credentials トークンはトークン無効化の対象外です
  
* ログアウト後に再度ログインすると新しいトークンが発行されます
  
* ログアウト直後 (同じ秒以内) の再ログインは安全です: JWT の `iat` は 1 秒単位の精度を持つため、新たに発行されたトークンは無効化の閾値を超えて `iat` が進められ (`iat = max(now, invalidatedBefore)`、最大 1 秒先まで)、無効化ウィンドウに捕捉されません。逆に、各無効化書き込みは閾値をエスカレートし (`max(now + 1, current + 1)`)、進められたトークンも後続のログアウトによって確実に無効化されます (#1351)

### WebSocket トークン再検証

WebSocket 接続の場合、接続が確立されたときに JWT の `exp` (有効期限) が DynamoDB に保存されます。その後のメッセージ受信時に `exp` が再検証され、トークンが期限切れの場合は `401` が返されます (OWASP API2:2023 準拠)。


* 接続時: `connect` ハンドラーが `ConnectionRecord` に `tokenExp` を保存します
  
* メッセージ受信時: `default` ハンドラーが `tokenExp` と現在時刻を比較します

***

## ブルートフォース保護

GeonicDB は、ログインエンドポイント (`POST /auth/login`) と OAuth トークンエンドポイント (`POST /oauth/token`) に対するブルートフォース攻撃防止機能を備えています (OWASP API2:2023 準拠)。

### 動作仕様

#### ログインエンドポイント (`POST /auth/login`

)

メールアドレスごとにログイン失敗回数を追跡し、以下のルールで応答します:

| Failure count                  | Response                | Wait time until next attempt  |
| ------------------------------ | ----------------------- | ----------------------------- |
| 1st                            | `401 Unauthorized`      | None                          |
| 2nd                            | `401 Unauthorized`      | 2 seconds (progressive delay) |
| 3rd                            | `401 Unauthorized`      | 4 seconds (progressive delay) |
| 4th                            | `401 Unauthorized`      | 8 seconds (progressive delay) |
| 5th and beyond (locked)        | `429 Too Many Requests` | 60 seconds (lock)             |
| While locked (even correct PW) | `429 Too Many Requests` | Remaining seconds             |
| Successful login               | Counter reset           | —                             |

> **注意**: 待機時間内に再試行すると `429 Too Many Requests` (と `Retry-After` ヘッダー) が返されます。段階的遅延は次のリクエスト (`checkLoginAllowed`) で適用され、失敗レスポンス自体は `401` です。

#### OAuth トークンエンドポイント (`POST /oauth/token`

)

`client_id` ごとに認証失敗回数を追跡します。動作ルールはログインエンドポイントと同じです (段階的遅延 + アカウントロック)。


* **追跡キー**: `oauth:<clientId>` の形式で `LoginProtectionService` を共有
  
* **成功時**: カウンターリセット
  
* **非アクティブクライアント**: 認証失敗として記録

### 設計原則


* **メールベース**: IP アドレスは VPN/プロキシで簡単にバイパスできるため、メールアドレスごとに追跡
  
* **Lambda 最適化**: `sleep()` による遅延の代わりに `429 + Retry-After` ヘッダーで応答 (Lambda の課金コストを回避)
  
* **自動クリーンアップ**: 試行記録は MongoDB TTL インデックスにより 1 時間後に自動削除
  
* **有効化/無効化とは独立**: ブルートフォース保護は自動化されたセキュリティメカニズムであり、管理者による手動の有効化/無効化操作とは別に管理

### 管理者によるロック解除

アカウントがロックされた場合、管理者は以下のエンドポイントでロックを解除できます:

```bash
POST /admin/users/{userId}/unlock
Authorization: Bearer <accessToken>
```

**レスポンス例:**

```json
{
  "userId": "abc123",
  "email": "user@example.com",
  "locked": false,
  "failedCount": 0,
  "message": "Account login lock has been cleared"
}
```

### 設定値

| Parameter                        | Default | Description                                                         |
| -------------------------------- | ------- | ------------------------------------------------------------------- |
| `MAX_FAILED_ATTEMPTS`            | 5       | Maximum number of failures before lock                              |
| `LOCK_DURATION_SECONDS`          | 60      | Lock duration (seconds)                                             |
| `ATTEMPT_WINDOW_SECONDS`         | 900     | Attempt window (15 minutes)                                         |
| `PROGRESSIVE_DELAY_BASE_SECONDS` | 2       | Base value for progressive delay (seconds) — delay = base × 2^(n-2) |
| `ATTEMPT_RECORD_TTL_SECONDS`     | 3600    | Automatic deletion of attempt records (1 hour)                      |

***

## 所有権検証 (GeonicDB 拡張)

GeonicDB は、OWASP API1:2023 (Broken Object Level Authorization) への対策として、Subscription と Registration の所有権検証を提供します。

### 概要

NGSI 仕様では、テナント分離 (`Fiware-Service` ヘッダー) のみでアクセス制御を行いますが、マルチユーザーテナント環境では課題があります:同じテナント内のユーザーが他のユーザーのリソースを操作できてしまいます。GeonicDB は `createdBy` フィールドを導入し、書き込み操作時に所有権を検証します。

### 対象リソース

| Resource                                                               | Target Operations      |
| ---------------------------------------------------------------------- | ---------------------- |
| Subscription (`/v2/subscriptions`, `/ngsi-ld/v1/subscriptions`)        | UPDATE, DELETE         |
| Registration (`/v2/registrations`, `/ngsi-ld/v1/csourceRegistrations`) | UPDATE, DELETE         |
| Context source subscription (`/ngsi-ld/v1/csourceSubscriptions`)       | UPDATE, DELETE (#2188) |
| Custom data model (`/custom-data-models`)                              | UPDATE, DELETE (#2198) |

> \*\*カスタムデータモデルは #2198 で追加されました。\*\*作成時に `createdBy` を保存していましたが、`CustomDataModelService.updateDataModel` / `deleteDataModel` は `repository.get` による存在チェックのみを行っていたため、テナントへの書き込み権限を持つすべてのプリンシパルが他のユーザーのモデルを更新または削除できました — また、削除により自動生成された JSON-LD コンテキストと一意制約インデックスも削除されます。ルートガード (`requireAuth + checkTenantAccess + requireAuthz`) はテナント境界とパス / メソッド認可を強制しますが、**リソースごとの所有権は強制しません**。現在、これらは他の 3 つのリソースとまったく同じ契約に従っています。**1 つの相違点 (#2189): サブスクリプション、レジストレーション、csource-subscriptions では、所有者の不一致は `404` を返します (`createdBy` が欠落している場合と同じ) が、カスタムデータモデルは `403` を維持します** — カスタムデータモデルは行レベルの読み取り述語の対象ではないため、その存在は制限された呼び出し元から隠されず、閉じるべき存在オラクルもありません。他の 3 つについては、`404` と `403` は異なります (`403` はドキュメントが存在することを明らかにする) ため、`404` に統一されます。テナント全体の共有スキーマは、`tenant_admin` として編集することで引き続き可能です。このガードは MCP エントリポイント (`src/api/mcp/tools/config.tools.ts`) もカバーしており、同じサービスメソッドを呼び出します。
>
> **コンテキストソースサブスクリプションは #2188 で追加されました。**`createdBy` を保存していました (#2133) が、`CSourceSubscriptionService.updateSubscription` / `deleteSubscription` は所有権チェックを全く実行せず、`actor` さえ渡されていなかったため、テナント内の認証されたすべてのプリンシパルが他のユーザーの CSR サブスクリプションを更新または削除できました。現在、これらは他の 2 つのリソースと同じ契約に従っています (管理者バイパス / `createdBy` の欠落 → `404` / 所有者の不一致 → `404` (#2189 以降))。`requireSubscriptionUpdateAuthz` (#2005) はこれを**カバーしません**: これは *更新後の有効な値* がサブスクリプションライブ可能かどうかを評価するものであり、呼び出し元が他のユーザーのサブスクリプションを変更できるかどうかを評価するものではありません。
>
> **注**: 読み取り操作 (GET/LIST) は、所有権チェック自体によって制限されません。NGSI 仕様に準拠したテナント分離が適用され、また — #2140 (サブスクリプション) / #2084 (レジストレーション) 以降 — 読み取りは行レベルの読み取り述語を通過し、プリンシパルが読み取れないエンティティタイプを宣言しているドキュメントを編集または非表示にします。

### ロール別の動作

| Role           | Own resource | Other's resource        | createdBy not set (legacy)               |
| -------------- | ------------ | ----------------------- | ---------------------------------------- |
| `super_admin`  | ✅ Operable   | ✅ Operable (bypass)     | ✅ Operable                               |
| `tenant_admin` | ✅ Operable   | ✅ Operable (bypass)     | ✅ Operable                               |
| `user`         | ✅ Operable   | ❌ 404 Not Found (#2189) | ❌ 404 Not Found (**fail-closed**, #2161) |

> カスタムデータモデルの場合、`user` に一致する「他のユーザーのリソース」セルは `403 Forbidden` を返します (`404` ではありません); 上記 #2198 の相違点に関する注記を参照してください。

### 動作仕様


1. **作成時**: リソースが作成されると、認証されたユーザーの ID が自動的に `createdBy` フィールドに記録されます
   
2. **更新/削除時**: リクエストしているユーザーの ID が `createdBy` と照合されます
   
   * 一致: 操作が許可されます
     
   * 不一致: `404 Not Found` を返します(**「そのようなドキュメントは存在しない」と区別不可能**、#2189)
     
   * `createdBy` が設定されていない(このフィールドが存在する前に作成されたレガシーデータ): 非管理者に対して `404 Not Found` を返します(#2161)
     
3. **管理者バイパス**: `super_admin`/`tenant_admin` は所有権チェックをスキップします — ただし、以下のフェンスに関する注意事項を参照してください:
   認証が有効な場合、`super_admin` はこれらのエンドポイントに全く到達しないため、実際にこれらのリソースを管理できる唯一の管理者は `tenant_admin` です
   
4. **認証が無効な場合**: `AUTH_ENABLED=false` の場合、所有権チェックはスキップされます

> **`super_admin` バイパスはデータ API では到達不可能です(認証が有効な場合)。**
> `SUPER_ADMIN_DATA_API_DENY_FENCE`(`policy.defaults.ts`)は、`super_admin` に対して `/v2/**`、`/ngsi-ld/**`、
> `/catalog/**`、`/rules/**` をハード拒否します。これはカスタムポリシーが解除できない拒否優先フェンスです
> — プラットフォーム管理者はテナントデータに触れることができてはなりません。所有権チェックの
> `actor.role === 'super_admin'` による早期リターンは、したがって `AUTH_ENABLED=false`
> (すべてのリクエストが合成 `super_admin` になる)の場合、または内部呼び出し元からの場合にのみ実行されます。以下の行は
> 「所有権チェック自体が何をするか」として読んでください。エンドツーエンドの到達可能性としてではありません。
>
> **レガシードキュメントはフェイルクローズされ、ステータスコードは `403` ではなく `404` です(#2161)。** #2161 以前、
> ガードは `doc.createdBy && doc.createdBy !== actor.id` と読んでいたため、`createdBy` が**ない**ドキュメントは
> 条件全体を false にし、テナント内の*任意の*認証されたプリンシパルがそれを更新または削除できました
> (「不明な所有者は通過」)。これには 2 つの問題がありました。第一に、それ自体が Broken Object Level
> Authorization の脆弱性です。第二に、#2140 / #2084 が読み取りを行レベル述語を通過させるようにすると、
> タイプを拒否されたプリンシパルは `GET` では `404` を取得しますが、まったく同じドキュメントに対して
> `DELETE` では `204` を取得します — この違い自体がドキュメントの存在を明らかにします(**存在オラクル**)、
> 呼び出し元がそれを破壊できることに加えて。レガシードキュメントに対して `404` を返すことで、所有権チェック自体が
> 「そのようなドキュメントは存在しない」と区別不可能になり、両方が閉じられます。`403` ではそうなりません:存在を確認し、
> \#1370 が閉じたのと同じリーククラスであり、#1963(entityMaps)が `404` を選択したのと同じ理由です。(#1945(snapshots)は
> レガシー行に対して同じ**フェイルクローズ**呼び出しを行いましたが、`403` を維持しました — `SnapshotService.checkSnapshotOwnership`
> は `ForbiddenError` を返します; #1963 のみが所有者を Mongo クエリに折り込んで、「存在するがあなたのものではない」と
> 「存在しない」が分岐できないようにしました。)
>
> **#2189 が閉じたもの。** 上記の `404` は、当初レガシー(`createdBy` が不在)セルにのみ適用されました。
> 隣接する 2 つのパスは、呼び出し元が読み取れない可能性があるドキュメントに対して依然として `403` を返し、
> したがってその存在を明らかにしていました。両方とも現在 #2189 によって閉じられています:
>
> * **所有者の不一致。** 別のユーザーによって作成されたドキュメントは `403` を返しましたが、存在しない id は
>   `404` を返します — `403` 自体がドキュメントの存在を確認しました。所有者の不一致は現在 `404` を返し、
>   存在しない id と一致するため、非所有者は両者を区別できません。(`#2005` 更新承認も
>   既存のドキュメントに対して評価されるため、ポリシーで拒否されたサブスクリプションライバーも `404` を観察します。)
> * **NGSI-LD `PATCH` ルート。** サブスクリプション更新承認(`requireSubscriptionUpdateAuthz`,
>   \#2005)は、以前は所有権チェックの*前に*既存のドキュメントで評価されていたため、そのポリシーで拒否された
>   プリンシパルは `createdBy` に関係なく `403` を取得していました。所有権チェックは現在最初に実行されるため、
>   非所有者はポリシーが参照される前に `404` を取得します。
>
> 残りの非対称性 — 呼び出し元が読み取り*できる*レガシードキュメントは `GET` に対して `200` で応答しますが、
> `DELETE` に対しては `404` で応答します — は意図的かつ安全です(書き込みを拒否します)が、「見えない」わけではありません:呼び出し元は依然として
> `GET` を介してリソースの存在を知ることができます。これは書き込みパスオラクルのスコープ外です(`GET` は設計上、
> 許可されたプリンシパルが読み取り可能です)。
>
> **運用上の結果**: `createdBy` が存在する前に作成されたサブスクリプションとレジストレーションは、通常のユーザーによって
> 更新または削除できなくなりました — 元々作成した人によっても、保存されたドキュメントに照合する所有者が
> 含まれていないためです。`tenant_admin` はそれらのドキュメントへのフルアクセスを保持します
> (意図されたエスケープハッチ — `super_admin` は上記のフェンス注記により不可);認証されたプリンシパルの下で
> リソースを再作成すると、通常のセルフサービス管理が復元されます。

### エラーレスポンス

サブスクリプション / レジストレーション / csource-subscriptions の場合、所有者の不一致は
存在しない id と区別できないため、NGSIv2 / NGSI-LD エラーエンベロープは `404` と同じです:

```json
{
  "error": "NotFound",
  "description": "Subscription not found: {subscriptionId}"
}
```

ステータスコード: `404 Not Found`

カスタムデータモデルは `403 Forbidden` を保持します:

```json
{
  "error": "Forbidden",
  "description": "You do not have permission to modify this resource"
}
```

ステータスコード: `403 Forbidden`

***

## トラブルシューティング

### レート制限エラー (429 Too Many Requests)

**考えられる原因:**

* ログイン失敗回数が多すぎる (ブルートフォース保護)
  
* アカウントがロックされている

**解決方法:**

* `Retry-After` ヘッダーに示された秒数だけ待機してから再試行する
  
* ロックされている場合は、管理者に `POST /admin/users/{userId}/unlock` でロック解除を依頼する

### 認証エラー (401 Unauthorized)

**考えられる原因:**

* トークンが無効または期限切れ
  
* `JWT_SECRET` が正しく設定されていない
  
* ユーザーが無効化されている
  
* ログアウト後またはパスワード変更後のトークン (すでに無効化済み)

**解決方法:**

```bash
# Check token expiration
jwt decode <access_token>

# Re-login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password12345"}'
```

### 認可エラー (403 Forbidden)

**考えられる原因:**

* ロールが不十分
  
* テナントが一致しない
  
* テナントが無効化されている (既存のトークンを含む); データ、`/me/**`、`/admin/**` リクエストに適用 (#3542)
  
* XACML ポリシーによって拒否された

**解決方法:**

* ユーザーのロールを確認する
  
* `Fiware-Service` ヘッダーがユーザーのテナントと一致していることを確認する
  
* ポリシー設定を確認する

### Admin API アクセスエラー

**考えられる原因:**

* `super_admin` ロールではない (JWT 認証を使用している場合)
  
* OAuth トークンに必要な `admin:*` スコープがない
  
* IP アドレスが `ADMIN_ALLOWED_IPS` に含まれていない

**解決方法:**

```bash
# Re-login as Super Admin
# Check IP restrictions
echo $ADMIN_ALLOWED_IPS
# For OAuth: check the client's policyId and bound policy
```

***

## 関連ドキュメント


* [API 共通仕様](../api-reference/endpoints.md) - 一般的な API 仕様
  
* 開発ガイド - API 仕様 (ページネーション、ステータスコード) とデプロイメント
  
* [XACML 3.0 仕様](https://docs.oasis-open.org/xacml/3.0/xacml-3.0-core-spec-os-en.html) - 公式 XACML 3.0 仕様
