---
title: "Quotas & Plans"
description: "GeonicDB quota system and plans"
outline: deep
---
# GeonicDB クォータシステム

GeonicDB は、テナント毎のレート制限とストレージクォータを管理するための包括的なクォータシステムを提供します。

## 概要

クォータシステムは 3 つの主要コンポーネントで構成されています:


1. **レート制限システム** - DynamoDB ベースのトークンバケットアルゴリズムを使用した API リクエスト制限
   
2. **ストレージクォータシステム** - MongoDB に基づくエンティティ/サブスクリプション/レジストレーション/時系列データのカウント制限
   
3. **モニタリング & 管理システム** - 使用状況の追跡、アラート配信、および管理 API

## クォータプラン

GeonicDB は 4 つの標準プランとカスタムプランを提供しています:

### FREE プラン (評価および開発用)

**レート制限:**

* 毎分: 60 リクエスト (1 req/sec)
  
* 毎時: 1,000 リクエスト
  
* 毎日: 10,000 リクエスト
  
* バースト許容量: 10 リクエスト

**ストレージクォータ:**

* エンティティ: 1,000
  
* サブスクリプション: 10
  
* レジストレーション: 5
  
* 時系列データポイント: 10,000

**制限:**

* 最大リクエストボディサイズ: 512KB
  
* 最大レスポンスボディサイズ: 5MB
  
* 最大バッチオペレーションサイズ: 50

### STANDARD プラン (小規模本番環境用)

**レート制限:**

* 毎分: 600 リクエスト (10 req/sec)
  
* 毎時: 10,000 リクエスト
  
* 毎日: 100,000 リクエスト
  
* バースト許容量: 100 リクエスト

**ストレージクォータ:**

* エンティティ: 10,000
  
* サブスクリプション: 100
  
* レジストレーション: 50
  
* 時系列データポイント: 100,000

**制限:**

* 最大リクエストボディサイズ: 1MB
  
* 最大レスポンスボディサイズ: 10MB
  
* 最大バッチオペレーションサイズ: 100

### PREMIUM プラン (中規模本番環境)

**レート制限:**

* 1 分あたり: 3,000 リクエスト (50 req/sec)
  
* 1 時間あたり: 50,000 リクエスト
  
* 1 日あたり: 500,000 リクエスト
  
* バースト許容量: 500 リクエスト

**ストレージクォータ:**

* エンティティ: 100,000
  
* サブスクリプション: 500
  
* レジストレーション: 200
  
* 時系列データポイント: 1,000,000

**制限:**

* 最大リクエストボディサイズ: 5MB
  
* 最大レスポンスボディサイズ: 50MB
  
* 最大バッチオペレーションサイズ: 500

### ENTERPRISE プラン (大規模本番環境)

**レート制限:**

* 1 分あたり: 12,000 リクエスト (200 req/sec)
  
* 1 時間あたり: 200,000 リクエスト
  
* 1 日あたり: 2,000,000 リクエスト
  
* バースト許容量: 2,000 リクエスト

**ストレージクォータ:**

* エンティティ: 1,000,000
  
* サブスクリプション: 2,000
  
* レジストレーション: 1,000
  
* 時系列データポイント: 10,000,000

**制限:**

* 最大リクエストボディサイズ: 10MB
  
* 最大レスポンスボディサイズ: 100MB
  
* 最大バッチオペレーションサイズ: 1,000

### CUSTOM プラン

任意の値を設定できるカスタムプランです。管理 API を使用して個別に設定します。

## レート制限

### トークンバケットアルゴリズム

GeonicDB は 3 つのスライディングウィンドウ(分/時/日)で動作するトークンバケットアルゴリズムを使用します:


1. トークンはエンドポイントの重みに基づいてリクエストごとに消費されます
   
2. リクエストは 3 つすべてのウィンドウに十分なトークンがある場合にのみ許可されます
   
3. トークンは各時間ウィンドウの切り替わり時に自動的に補充されます

### エンドポイントの重み

異なるエンドポイントには処理コストに基づいて異なる重みが割り当てられます:

| Operation           | Weight    | Example                                    |
| ------------------- | --------- | ------------------------------------------ |
| GET                 | 1         | `GET /v2/entities`                         |
| POST (single)       | 3         | `POST /v2/entities`                        |
| PATCH/PUT           | 2         | `PATCH /v2/entities/{id}`                  |
| DELETE              | 2         | `DELETE /v2/entities/{id}`                 |
| Batch operations    | 5 × count | `POST /v2/op/update` with 10 entities = 50 |
| Temporal operations | 2         | `POST /ngsi-ld/v1/temporal/entities`       |

### バースト許容量

各プランには短期間の急激なトラフィックスパイクを処理するためのバースト許容量があります。これにより一時的に制限を超えることができます。

### レスポンスヘッダー

レート制限が有効な場合、NGSIv2、NGSI-LD、および Catalog API エンドポイントからのレスポンスには、現在のレート制限ステータスを示すヘッダーが含まれます:

```http
X-RateLimit-Limit-Minute: 600
X-RateLimit-Remaining-Minute: 450
X-RateLimit-Reset-Minute: 1707648000

X-RateLimit-Limit-Hour: 10000
X-RateLimit-Remaining-Hour: 8500
X-RateLimit-Reset-Hour: 1707651600

X-RateLimit-Limit-Day: 100000
X-RateLimit-Remaining-Day: 95000
X-RateLimit-Reset-Day: 1707734400
```

### レート制限を超えた場合の動作

レート制限を超えた場合:


* **HTTP ステータスコード**: `429 Too Many Requests`
  
* **Retry-After ヘッダー**: 次のリクエストが許可されるまでの秒数
  
* **エラーメッセージ**: `{"error": "TooManyRequests", "description": "Rate limit exceeded"}`

### パブリック(非認証)エンドポイントのレート制限 (#1075)

認証なしでアクセス可能なパブリックエンドポイントは、テナントごとの `QUOTAS.PLANS` とは独立した IP ベースのトークンバケットによって保護されます。これにより、OAuth の `client_id+secret` ブルートフォースや重い JSON 生成(`/openapi.json` など)による DoS がブロックされます。

| Category                  | Endpoints                                                                                                                                       | Per minute | Per hour | Per day | Burst |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------: | -------: | ------: | ----: |
| `metadata`                | `/openapi.json`, `/api.json`, `/tools.json`, `/llms.txt`, `/.well-known/ai-plugin.json`, `/.well-known/agent-card.json`, `/.well-known/ngsi-ld` |         30 |      300 |   1,000 |    10 |
| `oauth` (per IP)          | `/oauth/token`                                                                                                                                  |         20 |      100 |     500 |     5 |
| `oauth` (per `client_id`) | `/oauth/token`                                                                                                                                  |         10 |       60 |     200 |     2 |
| `auth`                    | `/auth/refresh`, `/auth/nonce`                                                                                                                  |         30 |      200 |   1,000 |     5 |

注意事項:


* `/auth/login` はこの制限の対象では**ありません**。`LoginProtectionService`(メール + IP ベースの段階的ロックアウト)によって保護されています。
  
* `/health`、`/health/live`、`/health/ready`、`/version` はこの制限の対象では**ありません**(ヘルスチェックポーリング用)。
  
* バケットストア(DynamoDB / MongoDB)が利用できない場合、リクエストは通過が許可されます。インフラストラクチャエラーでパブリックサーフェスをオフラインにしないよう、失敗時にクローズしません。
  
* デフォルト値は `src/config/defaults.ts` の `PUBLIC_RATE_LIMIT` に集中管理されています。

## ストレージクォータ

### リソースタイプ

クォータは 4 つのタイプのリソースに対して設定されます:


1. **Entities** - NGSIv2/NGSI-LD エンティティの総数
   
2. **Subscriptions** - アクティブなサブスクリプションの総数
   
3. **Registrations** - コンテキストソース登録の総数
   
4. **Temporal data points** - 時系列データポイントの総数

### 事前チェック

ストレージクォータは作成操作の**前に**チェックされます:


* バッチ操作の場合、すべてのエンティティがクォータ内に収まる場合にのみ実行が進行します
  
* 1 つでもクォータを超える場合、操作全体が拒否されます(オール・オア・ナッシング)

### レスポンスヘッダー

NGSIv2、NGSI-LD、および Catalog API のエンドポイントには、現在のストレージ使用状況を示すヘッダーが含まれます:

```http
X-Storage-Quota-Entities-Used: 5000
X-Storage-Quota-Entities-Limit: 10000
X-Storage-Quota-Subscriptions-Used: 50
X-Storage-Quota-Subscriptions-Limit: 100
X-Storage-Quota-Registrations-Used: 25
X-Storage-Quota-Registrations-Limit: 50
X-Storage-Quota-TemporalDataPoints-Used: 50000
X-Storage-Quota-TemporalDataPoints-Limit: 100000
```

**対象エンドポイント**: これらのヘッダーは、NGSIv2、NGSI-LD、および Catalog API のすべてのエンドポイントによって返されます。管理 API (`/admin/tenants/{tenantId}/quotas`) を使用すると、より詳細なクォータ情報を取得できます。詳細は [Authentication & Authorization](../reference/auth.md#quota-management) を参照してください。

### ストレージクォータを超過した場合の動作

ストレージクォータを超過した場合:


* **HTTP ステータスコード**: `507 Insufficient Storage`
  
* **エラーメッセージ**: リソースタイプと現在の使用状況を含みます
  
* **例**: `{"error": "InsufficientStorage", "description": "Entity quota exceeded (10000/10000)", "details": {"resourceType": "entities", "current": 10000, "limit": 10000}}`

## 監視とアラート

### 使用状況スナップショット

システムは定期的に使用状況スナップショットを DynamoDB に記録します:


* レート制限の使用率(分/時間/日)
  
* ストレージリソースの使用率
  
* タイムスタンプとテナント情報
  
* 90 日間保持(TTL)

### アラートしきい値

各テナントには 2 つのアラートレベルがあります:


* **Warning**: デフォルトで使用率 80%
  
* **Critical**: デフォルトで使用率 95%

### アラート配信

設定されたしきい値を超えた場合:


1. アラートメッセージがログに記録されます
   
2. Webhook URL が設定されている場合、HTTP POST 経由でアラートが送信されます
   
3. 同じアラートは 1 時間以内に再送信されません(デバウンス機能)

### Webhook ペイロード

```json
{
  "id": "rateLimit.perMinute.warning.tenant1#/",
  "tenantService": "tenant1#/",
  "alertType": "rateLimit",
  "resourceType": "perMinute",
  "severity": "warning",
  "message": "Rate limit perMinute usage is high (85%)",
  "currentValue": 510,
  "limitValue": 600,
  "utilizationPercent": 85,
  "timestamp": 1707645123456
}
```

## Management API

### クォータ情報の取得

```http
GET /admin/tenants/{tenantId}/quotas
```

**レスポンス:**

```json
{
  "tenantId": "tenant-1",
  "tenantName": "tenant1",
  "quotaPlan": "STANDARD",
  "customQuotas": null,
  "alertThresholds": {
    "rateLimitWarning": 80,
    "rateLimitCritical": 95,
    "storageWarning": 80,
    "storageCritical": 95
  },
  "currentUsage": {
    "rateLimit": {
      "minute": { "limit": 600, "used": 150, "remaining": 450, "usagePercent": 25, "resetAt": 1707648000 },
      "hour": { "limit": 10000, "used": 1500, "remaining": 8500, "usagePercent": 15, "resetAt": 1707651600 },
      "day": { "limit": 100000, "used": 5000, "remaining": 95000, "usagePercent": 5, "resetAt": 1707734400 }
    },
    "storage": {
      "entities": { "used": 5000, "limit": 10000, "usagePercent": 50 },
      "subscriptions": { "used": 50, "limit": 100, "usagePercent": 50 },
      "registrations": { "used": 25, "limit": 50, "usagePercent": 50 },
      "temporalDataPoints": { "used": 50000, "limit": 100000, "usagePercent": 50 }
    }
  }
}
```

### クォータ設定を更新

```http
PUT /admin/tenants/{tenantId}/quotas
```

**リクエストボディ:**

```json
{
  "quotaPlan": "PREMIUM",
  "alertThresholds": {
    "rateLimitWarning": 85,
    "rateLimitCritical": 98,
    "storageWarning": 85,
    "storageCritical": 98
  }
}
```

### カスタムクォータを設定

```http
PUT /admin/tenants/{tenantId}/quotas
```

**リクエストボディ:**

```json
{
  "quotaPlan": "CUSTOM",
  "customQuotas": {
    "rateLimit": {
      "perMinute": 1200,
      "perHour": 20000,
      "perDay": 200000,
      "burstAllowance": 200
    },
    "storage": {
      "maxEntities": 50000,
      "maxSubscriptions": 200,
      "maxRegistrations": 100,
      "maxTemporalDataPoints": 500000
    },
    "limits": {
      "maxRequestBodyBytes": 2097152,
      "maxResponseBodyBytes": 20971520,
      "maxBatchSize": 200
    }
  }
}
```

### 使用履歴を取得

```http
GET /admin/tenants/{tenantId}/usage?startDate=2026-02-01&endDate=2026-02-10&limit=100
```

**レスポンス:**

```json
{
  "tenantId": "tenant-1",
  "tenantName": "tenant1",
  "startDate": "2026-02-01",
  "endDate": "2026-02-10",
  "snapshots": [
    {
      "tenantService": "tenant1#/",
      "timestamp": 1707645123456,
      "date": "2026-02-10",
      "rateLimit": { ... },
      "storage": { ... }
    }
  ]
}
```

## 環境変数

### SAM テンプレート

```yaml
Parameters:
  RateLimitEnabled:
    Type: String
    Default: 'true'
    Description: Enable rate limiting for API requests

  QuotaAlertWebhookUrl:
    Type: String
    Default: ''
    Description: Webhook URL for quota violation alerts
```

### 環境変数


* `RATE_LIMIT_ENABLED`: レート制限の有効化/無効化(デフォルト: `true`)
  
* `RATE_LIMIT_TABLE_NAME`: DynamoDB レート制限テーブル名
  
* `USAGE_STATS_TABLE_NAME`: DynamoDB 使用統計テーブル名
  
* `QUOTA_ALERT_WEBHOOK_URL`: アラート配信用 Webhook URL(オプション)

## アクセス制御

### 権限レベル


* **super\_admin**: すべてのテナントのクォータを閲覧および変更可能
  
* **tenant\_admin**: 自身のテナントのクォータを閲覧および変更可能
  
* **user**: クォータ管理 API へのアクセス権限なし

### 認証

すべてのクォータ管理 API は認証が必要です:

```http
Authorization: Bearer <JWT_TOKEN>
```

## ベストプラクティス

### クォータプランの選択


1. **開発/テスト**: FREE プランから始める
   
2. **小規模本番環境**: STANDARD プラン
   
3. **中規模本番環境**: PREMIUM プラン
   
4. **大規模本番環境**: ENTERPRISE プラン
   
5. **特別な要件**: CUSTOM プランで個別に設定

### アラート設定


* **Warning**: 容量拡大を検討する閾値(デフォルト 80%)
  
* **Critical**: 即座の対応が必要な閾値(デフォルト 95%)
  
* リアルタイム通知を受信するために Webhook URL を設定

### モニタリング


* レスポンスヘッダーを定期的に確認
  
* 使用履歴 API でトレンドを分析
  
* アラートログを監視

## トラブルシューティング

### 429 Too Many Requests

**原因**: レート制限を超過しました

**解決方法**:

1. `Retry-After` ヘッダーで指定された秒数だけ待機する
   
2. リクエスト頻度を減らす
   
3. バッチ操作を活用してリクエスト数を減らす
   
4. プランのアップグレードを検討する

### 507 Insufficient Storage

**原因**: ストレージクォータを超過しました

**解決方法**:

1. 不要なエンティティ/サブスクリプション/登録を削除する
   
2. 時系列データの保持期間を短縮する
   
3. プランのアップグレードを検討する

### クォータヘッダーが表示されない

**原因**: レート制限が無効になっている可能性があります

**解決方法**:

1. `RATE_LIMIT_ENABLED` 環境変数を確認する
   
2. SAM テンプレートパラメータを確認する
   
3. DynamoDB テーブルが正しくデプロイされていることを確認する

## 入力検証の制限

GeonicDB は、不正使用を防止し、システムの安定性を確保するために、入力長とカウントの制限を適用しています。

### 認証とログイン保護

#### アカウント単位のログイン保護

既存のアカウント単位のブルートフォース保護([AUTH.md](../reference/auth.md) を参照):


* アカウントあたりの最大ログイン失敗回数:**15 分**以内に **5 回**
  
* アカウントロック期間:閾値に達してから **15 分間**
  
* 段階的遅延:**2 秒**から始まる指数バックオフ(2^(n-2))

#### IP 単位のログイン保護(#900)

単一の IP から複数のアカウントに対するパスワードスプレー攻撃を防止します:

| Parameter                      | Value                       |
| ------------------------------ | --------------------------- |
| Maximum failed attempts per IP | **20** within **5 minutes** |
| IP lock duration               | **15 minutes**              |
| Record TTL                     | **1 hour** (auto-deleted)   |


* **HTTP ステータス**: `429 Too Many Requests` と `Retry-After: 900`
  
* ログイン成功時に IP カウンターはリセット**されません**(タイミングベースの列挙を防止)
  
* エラーメッセージ:`"Too many failed login attempts from this IP. Please try again later."`

### テナントリソース制限

#### テナントあたりのユーザー数 (#901)

| Parameter                | Default |
| ------------------------ | ------- |
| Maximum users per tenant | **100** |


* ユーザー作成時のみチェック
  
* `tenant.settings.maxUsers` によるテナントごとのオーバーライド
  
* **HTTP ステータス**: `400 Bad Request`
  
* エラーメッセージ: `"User limit reached for this tenant (current: N, limit: M)"`

#### テナントあたりのポリシー数 (#912)

| Parameter                   | Default |
| --------------------------- | ------- |
| Maximum policies per tenant | **50**  |


* `tenant.settings.maxPolicies` によるテナントごとのオーバーライド
  
* **HTTP ステータス**: `400 Bad Request`
  
* エラーメッセージ: `"Policy limit reached for this tenant (current: N, limit: M)"`

#### 管理者ユーザー操作のレート制限 (#905)

Admin API での作成-削除サイクル攻撃を防止します:

| Parameter                     | Value                                |
| ----------------------------- | ------------------------------------ |
| Window                        | **10 minutes**                       |
| Maximum operations per window | **1,000** (create + delete combined) |


* `createUser` と `deleteUser` に対してテナントごとに適用
  
* `super_admin` は除外
  
* **HTTP ステータス**: `429 Too Many Requests`
  
* エラーメッセージ: `"Too many user management operations. Limit: 1000 per 10 minutes."`

### XACML ポリシー入力制限 (#912)

| Field                                 | Max Length       |
| ------------------------------------- | ---------------- |
| `policyId` / `policySetId` / `ruleId` | 256 characters   |
| `description`                         | 2,000 characters |
| `attributeId`                         | 256 characters   |
| `matchValue`                          | 2,000 characters |
| `expression` (condition)              | 5,000 characters |
| `timezone`, `startTime`, `endTime`    | 50 characters    |
| IP/CIDR entry in `allowedIps`         | 50 characters    |

| Collection              | Max Count |
| ----------------------- | --------- |
| Rules per policy        | 100       |
| Conditions per rule     | 50        |
| Policies per policy set | 100       |

### メールアドレスの検証 (#903)


* 最大長: **254 文字** (RFC 5321 準拠)
  
* 適用対象: ユーザー作成、ユーザー更新、ログイン
  
* **HTTP ステータス**: `400 Bad Request`

### サブスクリプションエンドポイント URI/URL (#913)


* 最大長: **2,048 文字**
  
* 適用対象: NGSI-LD `notification.endpoint.uri`、NGSIv2 `notification.http.url` / `notification.httpCustom.url` / `notification.mqtt.url`
  
* **HTTP ステータス**: `400 Bad Request`

### 入力検証の制限(一般)

GeonicDB はすべての API エンドポイントで包括的な入力検証を実施します。いずれかの制限を超えると `400 Bad Request` が返されます。

#### 文字列長の制限

| Category           | Example Fields                               | Max Length |
| ------------------ | -------------------------------------------- | ---------- |
| Entity ID          | `entityId`, `id`                             | 256        |
| Entity Type        | `type`                                       | 256        |
| Attribute Name     | `attrName`, attribute keys                   | 256        |
| Generic ID         | `subscriptionId`, `registrationId`, `ruleId` | 256        |
| Name fields        | `name`, `subscriptionName`                   | 256        |
| Description fields | `description`                                | 2,000      |
| URL fields         | `endpoint`, `provider.http.url`              | 2,048      |
| Query strings      | `q`, `mq`, `scopeQ`, `csf`                   | 2,000      |
| Regex patterns     | `idPattern`, `typePattern`                   | 200        |
| georel             | `georel`                                     | 100        |
| geometry           | `geometry`                                   | 50         |
| coords             | `coords`, `coordinates`                      | 2,000      |
| orderBy            | `orderBy`                                    | 500        |
| options            | `options`                                    | 200        |
| lang               | `lang`                                       | 50         |
| scope              | `scope` (string)                             | 500        |
| unitCode           | `unitCode`                                   | 50         |

#### 配列要素数の制限

| Array Field                             | Max Elements           |
| --------------------------------------- | ---------------------- |
| `attrs`, `pick`, `omit`, `expandValues` | 50                     |
| `watchedAttributes`                     | 100                    |
| `notification.attrs` / `exceptAttrs`    | 100                    |
| `subject.entities` / `entities`         | 100                    |
| Batch operation `entities`              | 100 (MAX\_BATCH\_SIZE) |
| `propertyNames` / `relationshipNames`   | 100                    |
| `receiverInfo` / `notifierInfo`         | 50                     |
| `contextSourceInfo`                     | 50                     |
| `operationGroup`                        | 20                     |
| `scope` (array)                         | 20                     |
| `@context` (array)                      | 10                     |

#### 数値の上限

| Field        | Max Value                     |
| ------------ | ----------------------------- |
| `throttling` | 86,400 (24 hours, in seconds) |
| `timeout`    | 30,000 (30 seconds, in ms)    |
| `lastN`      | 1,000                         |

#### ヘッダー検証

| Header                           | Max Length |
| -------------------------------- | ---------- |
| Bearer / DPoP token              | 8,192      |
| Link (@context URL)              | 2,048      |
| Fiware-ServicePath (per element) | 256        |
| Tenant name (Fiware-Service)     | 64         |

#### パスパラメータ検証

URL パス内のリソース ID も長さが検証されます。

| Parameter        | Max Length | Applicable APIs          |
| ---------------- | ---------- | ------------------------ |
| `entityId`       | 256        | NGSIv2, NGSI-LD          |
| `attrName`       | 256        | NGSIv2, NGSI-LD          |
| `subscriptionId` | 256        | NGSIv2, NGSI-LD          |
| `registrationId` | 256        | NGSIv2, NGSI-LD          |
| `instanceId`     | 256        | NGSI-LD Temporal         |
| `entityMapId`    | 256        | NGSI-LD Entity Maps      |
| `contextId`      | 256        | NGSI-LD JSON-LD Contexts |
| `snapshotId`     | 256        | NGSI-LD Snapshots        |
| `ruleId`         | 256        | Rules API                |
| `typeName`       | 256        | NGSIv2/NGSI-LD Types     |
| `datasetId`      | 256        | Catalog API              |

#### AttributeValue ネスト深度制限


* 最大深度:**10**
  
* 制限を超えると、プリミティブ型(文字列、数値、真偽値、null)のみが受け入れられます
  
* **HTTP ステータス**:ネストが制限を超えた場合は `400 Bad Request`

#### MQTT 通知フィールド

| Field             | Max Length |
| ----------------- | ---------- |
| `topic`           | 1,024      |
| `user` / `passwd` | 256        |

#### HTTP カスタム通知フィールド

| Field              | Max Length    |
| ------------------ | ------------- |
| Header key         | 256           |
| Header value       | 4,096         |
| Query string value | 2,048         |
| `payload`          | 51,200 (50KB) |

#### Admin API の検証

| Field                                                                   | Max Length / Value          |
| ----------------------------------------------------------------------- | --------------------------- |
| Tenant `name`                                                           | 64                          |
| Tenant `maxUsers`                                                       | 10,000                      |
| Tenant `description`                                                    | 2,000                       |
| Tenant `allowedServices`                                                | 50 elements, each 256 chars |
| User `password`                                                         | 128 (also minimum 12)       |
| Policy `priority`                                                       | 0–1,000                     |
| Policy `subjects` / `resources` / `actions` array                       | 50 elements each            |
| API key `policyId` / `tenantId`                                         | 256                         |
| API key origin                                                          | 2,048                       |
| OAuth client `name`                                                     | 256                         |
| OAuth client `description`                                              | 2,000                       |
| Path parameters (`tenantId`, `userId`, `policyId`, `keyId`, `clientId`) | 256                         |

#### Auth & OAuth API の検証

| Field                   | Max Length |
| ----------------------- | ---------- |
| Login `password`        | 128        |
| Login `tenantId`        | 256        |
| Refresh token           | 8,192      |
| Password reset `token`  | 2,048      |
| OAuth `scope`           | 2,000      |
| OAuth `client_secret`   | 512        |
| OAuth `nonce` / `proof` | 512        |

#### カスタムクォータの上限

Admin API を介してカスタムクォータを設定する場合、以下の最大値が適用されます:

| Field                           | Max Value           |
| ------------------------------- | ------------------- |
| `rateLimit.perMinute`           | 1,000,000           |
| `rateLimit.perHour`             | 10,000,000          |
| `rateLimit.perDay`              | 100,000,000         |
| `rateLimit.burstAllowance`      | 100,000             |
| `storage.maxEntities`           | 100,000,000         |
| `storage.maxSubscriptions`      | 1,000,000           |
| `storage.maxRegistrations`      | 1,000,000           |
| `storage.maxTemporalDataPoints` | 1,000,000,000       |
| `limits.maxRequestBodyBytes`    | 100MB (104,857,600) |
| `limits.maxResponseBodyBytes`   | 1GB (1,073,741,824) |
| `limits.maxBatchSize`           | 10,000              |

#### Rules API の検証

| Field                                          | Max Length / Value |
| ---------------------------------------------- | ------------------ |
| Rule `name`                                    | 256                |
| Rule `description`                             | 2,000              |
| Rule `priority`                                | 0–1,000            |
| Rule `cooldownSeconds`                         | 86,400 (24h)       |
| Condition `attributeName`                      | 256                |
| Condition `pattern`                            | 200                |
| Condition `timezone` / `startTime` / `endTime` | 50                 |
| Action `entityId`                              | 256                |
| Action `entityType`                            | 256                |
| Action `url` (webhook)                         | 2,048              |
| Action `message`                               | 2,000              |
| `conditions` / `actions` array                 | 50 elements each   |
| `entityTypes` array                            | 100 elements       |

#### Custom Data Models API の検証

| Field                                | Max Length / Value |
| ------------------------------------ | ------------------ |
| Model `type`                         | 256                |
| Model `domain`                       | 256                |
| Model `description`                  | 2,000              |
| Property `valueType`                 | 256                |
| Property `description`               | 2,000              |
| Validation `minLength` / `maxLength` | 10,000             |
| Validation `enum` array              | 100 elements       |

#### Catalog / CADDE / Vocabulary API の検証

| Field                                  | Max Length          |
| -------------------------------------- | ------------------- |
| Catalog `q` (keyword)                  | 2,000               |
| Catalog `id` (package/dataset)         | 256                 |
| CADDE query params (`type`, `id`, `q`) | Same as NGSI limits |
| Vocabulary `tenantId`                  | 64                  |
| Vocabulary `term`                      | 256                 |

#### MCP Admin Tools の検証

MCP ツールは、ツール入力レイヤーにおいて HTTP Admin API と同じ制限を適用します:

| Field                        | Validation                        |
| ---------------------------- | --------------------------------- |
| `email`                      | Valid email format, max 254 chars |
| `password`                   | 12–128 chars                      |
| `id` / `policyId` / `tenant` | Max 256 chars                     |
| `description`                | Max 2,000 chars                   |
| `priority`                   | 0–1,000                           |

すべての制限違反は以下を返します:

* **HTTP ステータス**: `400 Bad Request`
  
* **エラー形式**: `{ "error": "BadRequest", "description": "field exceeds maximum length of N" }`

### ストレージクォータの修正: `/v2/op/update` (#902)

バッチ操作 (`/v2/op/update`) のストレージクォータチェックが、エンティティ作成操作を正しく識別するようになりました:


* **`append` / `appendStrict`**: エンティティ作成としてカウント — ストレージクォータを消費
  
* **`update` / `delete` / `replace`**: エンティティ作成としてカウントされない — ストレージクォータへの影響なし

以前は、すべての `/v2/op/update` リクエストが `actionType` に関係なく、エンティティ作成クォータに対して誤ってカウントされていました。

## 関連ドキュメント


* Development & Deployment Guide - Infrastructure setup
  
* [認証と認可](../reference/auth.md) - テナント/ユーザー管理、アクセス制御
