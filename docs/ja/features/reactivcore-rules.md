---
title: "ReactiveCore Rules"
description: "Reactive automation rules based on entity changes"
outline: deep
---
# ReactiveCore Rules

GeonicDB の **ReactiveCore Rules** は、エンティティの変更を自動的に検出し、定義されたルールに基づいてアクションを実行するリアクティブ自動化機能です。Change Streams を介して MongoDB の変更をリアルタイムで監視し、ルール条件が一致したときに自動処理を実行します。

## 目次


* [概要](#overview)
  
  * [主な機能](#主な機能)
    
  * [有効化](#有効化)
    
  * [ローカル開発環境でのテスト](#ローカル開発環境でのテスト)
    
  * [ユースケース](#use-cases)
    
* [アーキテクチャ](#アーキテクチャ)
  
* [ルール構造](#ルール構造)
  
* [条件](#条件)
  
* [アクション](#アクション)
  
* [テンプレート変数](#template-variables)
  
* [Rules API](#rules-api)
  
* [例](#examples)
  
* [制限事項](#limitations)
  
* [トラブルシューティング](#トラブルシューティング)

***

## 概要

### 主な機能


* **自動エンティティ処理**: エンティティの作成、更新、削除を検出し、自動的にアクションを実行
  
* **柔軟な条件設定**: 属性値、パターンマッチング、変更検出、時間範囲、エンティティタイプに基づいて条件を指定
  
* **複数のアクションサポート**: 派生エンティティの作成、属性の更新、属性の削除、通知の送信、Webhook の呼び出し
  
* **テンプレート変数**: `${entity.id}`、`${attribute.temperature.value}` などを使用して動的に値を参照
  
* **優先順位制御**: 複数のルールが一致した場合、優先順位の昇順で実行
  
* **テナント分離**: テナントごとに独立したルール管理

### 有効化

環境変数を使用して ReactiveCore Rules を有効化します(デフォルトでは無効)。

```bash
export RULES_ENABLED=true
```

> **注記 (#1304)**: ホスト名ルーティングされたデプロイメント(マルチサブドメイン構成の専用 DB)でもルールは実行されます。API 経由のエンティティ変更はリクエストスコープでイベントを発行し、発生元デプロイメントの情報(`deployment.hostname`)を運んで rules ワーカーが正しい DB のルールを評価・実行します(アクションによる派生エンティティも同じ DB に作成されます)。**制限**: デプロイメント DB への直接 DB 書き込み(API を経由しない変更)はルールをトリガーしません — change stream によるバックアップ監視はデフォルト DB のみです。

### ローカル開発環境でのテスト

次の手順に従って、ローカル開発環境で ReactiveCore Rules を試してみましょう。

#### 1. ローカルサーバーを起動する

ローカルサーバーを起動します。MongoDB は自動的にレプリカセットモードで起動し、Change Stream Watcher も自動的に有効になります。

```bash
npm start
```

起動時には、次のような出力が表示されます。

```text
━━━ ReactiveCore Rules - Change Stream Started ━━━
Watching for entity changes...
```

エンティティの変更が自動的に監視され、ルールが実行可能な状態になります。

#### 2. ルールを作成する

Rules API を使用してルールを作成します。

```bash
# Rule to create a warning entity when a temperature sensor exceeds 30 degrees
curl -X POST "http://localhost:3000/rules" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{
    "name": "High Temperature Alert",
    "description": "Automatically create a warning entity when temperature exceeds 30 degrees",
    "conditions": [
      {
        "type": "entityType",
        "entityTypes": ["TemperatureSensor"]
      },
      {
        "type": "value",
        "attributeName": "temperature",
        "operator": ">",
        "value": 30
      }
    ],
    "actions": [
      {
        "type": "createEntity",
        "entityId": "urn:ngsi-ld:Alert:${entity.id}",
        "entityType": "Alert",
        "attributes": {
          "severity": "high",
          "message": "Temperature exceeded 30°C",
          "sourceEntity": "${entity.id}"
        }
      }
    ],
    "priority": 10
  }'
```

#### 3. ルールをトリガーするためにエンティティを作成または更新する

Entity API を使用してエンティティを作成します。

```bash
# Create a sensor with a temperature of 31 degrees (rule will be triggered)
curl -X POST "http://localhost:3000/v2/entities" \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: test" \
  -d '{
    "id": "urn:ngsi-ld:TemperatureSensor:001",
    "type": "TemperatureSensor",
    "temperature": {
      "value": 31,
      "type": "Number"
    }
  }'
```

#### 4. Change Stream の出力を確認する

`npm start` を実行しているターミナルには、次のような出力が表示されます。

```text
━━━ Entity Change Detected ━━━
Event: entity.created
Entity: urn:ngsi-ld:TemperatureSensor:001 (TemperatureSensor)
Changed attributes: temperature
Executing ReactiveCore Rules...
✓ Rules processed successfully
```

#### 5. 派生エンティティが作成されたことを確認する

```bash
# Verify that the alert entity was automatically created
curl -X GET "http://localhost:3000/v2/entities?type=Alert" \
  -H "Fiware-Service: test"
```

応答例:

```json
[
  {
    "id": "urn:ngsi-ld:Alert:urn:ngsi-ld:TemperatureSensor:001",
    "type": "Alert",
    "severity": {
      "type": "Property",
      "value": "high",
      "metadata": {}
    },
    "message": {
      "type": "Property",
      "value": "Temperature exceeded 30°C",
      "metadata": {}
    },
    "sourceEntity": {
      "type": "Relationship",
      "object": "urn:ngsi-ld:TemperatureSensor:001",
      "metadata": {}
    }
  }
]
```

#### 備考


* **自動起動**: `npm start` を実行するだけで、MongoDB (レプリカセットモード) と Change Stream Watcher が自動的に起動します。
  
* **レプリカセットモード**: Change Stream には必須のため、MongoDB はレプリカセットモードで起動します (Change Stream はスタンドアロン MongoDB モードでは動作しません)。
  
* **Resume Token**: サーバーを停止して再起動しても、Change Stream の処理は中断した箇所から再開されます (resume token は MongoDB に保存されます)。
  
* **リアルタイム処理**: エンティティが作成または更新されると、Change Stream は即座にルールを実行します。
  
* **バックグラウンド実行**: Change Stream は HTTP サーバーと並行してバックグラウンドで実行されます。

### ユースケース


1. **派生エンティティの自動生成**: センサーデータから集約エンティティを自動的に作成
   
2. **属性の自動計算**: 温度と湿度から不快指数を自動的に計算して追加
   
3. **しきい値監視**: 温度が 30 度を超えたときに警告属性を自動的に追加
   
4. **時間ベースの処理**: 営業時間外にステータス属性を自動的に更新
   
5. **Webhook 統合**: エンティティの変更を外部システムに自動的に通知

***

## アーキテクチャ

```text
┌─────────────────────────────────────────────────────────────┐
│                    Entity Change Event                       │
│          (EntityCreated, EntityUpdated, EntityDeleted)       │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            │ EntityService publishes to EventBridge
                            │ (#1119: Rule firing migrated from
                            │  scheduled change-stream to EventBridge;
                            │  #1560: the CDC worker was removed, so
                            │  EntityService is the single publisher)
                            │
┌───────────────────────────▼─────────────────────────────────┐
│              Rule Processor Handler (Lambda)                 │
│              src/handlers/rules/processor.ts                 │
│                                                              │
│  - Consumes EventBridgeRule for                              │
│    EntityCreated / EntityUpdated / EntityDeleted             │
│  - Forwards EntityChangeEvent to RuleEngineService           │
│                                                              │
│  Local / standalone:                                         │
│    local-server.ts watches the MongoDB Change Stream and     │
│    invokes RuleEngineService directly. The E2E suite reuses  │
│    the production handler via `@rules-auto-fire` hook for    │
│    parity between local and Lambda paths.                    │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                   RuleEngineService                          │
│            src/core/rules/rule-engine.service.ts             │
│                                                              │
│  1. Retrieves active rules for the tenant                    │
│  2. Evaluates conditions for each rule                       │
│     - evaluateCondition() (recursive)                       │
│     - value, pattern, change, time, entityType              │
│     - and, or, not (logical operators)                      │
│  3. Sorts matched rules by priority                          │
│  4. Executes actions for each rule sequentially              │
│     - executeAction()                                       │
│     - createEntity, updateAttribute, deleteAttribute        │
│     - sendNotification, webhook, appendToTemporal           │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                  Action Execution                            │
│                                                              │
│  - EntityService: entity operations                          │
│  - TemporalService: time-series data recording              │
│  - HTTP Client: Webhook invocation                           │
│  - EventBridge: subscription notification delivery           │
└─────────────────────────────────────────────────────────────┘
```

### 処理フロー


1. **エンティティ変更検知**
   
   * Lambda 上:`EntityService` が `EntityCreated/Updated/Deleted` を EventBridge に直接パブリッシュします。`RuleProcessorFunction` は EventBridgeRule によって呼び出され、`EntityChangeEvent` を構築します
     
   * ローカル / スタンドアロン上:`local-server.ts` が MongoDB Change Stream を追跡し、**ReactiveCore Rules** 用に同じ `EntityChangeEvent` をプロセス内で構築します。サブスクリプション通知は `EntityService` → `LocalEventBusPublisher` → `emitEntityChangeForSubscription` (#2337) を使用し、AWS EventBridge パスと同じリッチペイロード (`previousAttributes` を含む) を使用します。Change Stream はもはやサブスクリプションのソースではありません — 物理削除には `fullDocument` がないため、そのパスではテナントを `'unknown'` に設定し、`entityDeleted` / `attributeDeleted` 通知を暗黙的にドロップしていました
     
   * **#1560**:レガシーの `ChangeStreamProcessorFunction` は削除されました。これは以前、Change Stream 由来のイベントを同じ EventBridge ファンアウトに再パブリッシュしていましたが、`EntityService` が直接パブリッシュを開始すると (#738)、すべての `insert`/`update`/`delete` がルールとサブスクリプションを **2 回** 発火させることになっていました。実際には 2026-03-08 以降 100% 失敗していました (再開トークンが oplog ウィンドウを超えて期限切れになり、ハンドラーにリカバリパスがありませんでした) ので、重複は実際には発生しませんでした — 壊れていたことが唯一それを防いでいました。AWS 上では、`EntityService` → `IEventPublisher` が現在唯一のパブリッシャーです。ローカル / スタンドアロンでは `LocalEventBusPublisher` がデフォルト DB のサブスクリプションソースであり、Change Stream はルール専用のままなので、2 つのパスは分離されたままです (#2337 / #1304)。リグレッションガード (`tests/unit/infrastructure/single-entity-event-publisher.test.ts`) は、2 つ目の EventBridge パブリッシャーが再出現することを禁止します

2\. **ルール評価**

* テナントと servicePath のアクティブなルールを取得します
  
* 各ルールの条件を評価します (AND 結合)
  
* マッチしたルールを優先順位順にソートします

3\. **アクション実行**

* 各ルールのアクションを順次実行します
  
* テンプレート変数を実際の値に置換します
  
* エラーが発生しても、他のアクションは実行を継続します

***

## ルール構造

### ルールインターフェース

```typescript
interface Rule {
  ruleId: string;           // Unique identifier for the rule
  name: string;             // Rule name
  description?: string;     // Description
  tenantId: string | null;  // Tenant ID (null = applies to all tenants)
  servicePath: string;      // Service path (e.g., "/sensors")
  conditions: RuleConditionUnion[];  // Array of conditions (AND-joined)
  actions: RuleActionUnion[];        // Array of actions (executed sequentially)
  isActive: boolean;        // Enabled/disabled
  priority: number;         // Priority (lower value = higher priority)
  cooldownSeconds?: number; // Cooldown period (seconds) - prevents infinite loops
  createdAt: Date;
  updatedAt: Date;
}
```

### 基本的なルールの例

```json
{
  "name": "High Temperature Warning",
  "description": "Add a warning attribute when temperature exceeds 30 degrees",
  "servicePath": "/sensors",
  "conditions": [
    {
      "type": "entityType",
      "entityTypes": ["TemperatureSensor"]
    },
    {
      "type": "value",
      "attributeName": "temperature",
      "operator": ">",
      "value": 30
    }
  ],
  "actions": [
    {
      "type": "updateAttribute",
      "entityId": "${entity.id}",
      "attributeName": "alert",
      "value": "HIGH_TEMPERATURE"
    }
  ],
  "isActive": true,
  "priority": 10
}
```

***

## 条件

条件は、ルールが一致するかどうかを決定します。複数の条件は AND で結合されます。

### JSON-LD ボキャブラリ (`@context`

) — GeonicDB 拡張 (#1973)

`POST /rules` と `PATCH /rules/{ruleId}` は、オプションの `@context` を受け入れます(リクエストボディ内、または JSON-LD `Link` ヘッダーとして。両方が提供された場合はボディが優先されます)。これは**ルール自身の条件名がどのボキャブラリで記述されているか**を宣言します。

重要な理由: NGSI-LD エンティティは、その属性名とエンティティタイプの*正規*形式で保存されます(書き込み側の `@context` を通じて展開されます)。同じ IRI を異なる用語で記述するルール — 例えば、ルールでは `warmth`、書き込み側では `temperature` と記述され、両方とも `https://example.org/vocab/temp` にマッピングされる場合 — は、`@context` がなければ**サイレントに発火しません**。エラーは発生せず、ルールは単にマッチしません。

```json
{
  "@context": { "warmth": "https://example.org/vocab/temp" },
  "name": "High temperature warning",
  "conditions": [{ "type": "change", "attributeName": "warmth" }],
  "actions": [ /* ... */ ]
}
```

GeonicDB がこれを使用して行うこと:


* 作成/更新時に、各条件の `attributeName`(`value` / `pattern` / `change`)および `entityTypes`(`entityType`)の正規形式が計算され、逐語的な値と共に `canonicalAttributeName` / `canonicalEntityTypes` として保存されます。ネストされた `and` / `or` / `not` ツリーも走査されます。
  
* 評価時、マッチングは両側で**逐語的 ∪ 正規形式**を使用します。`@context` なしで作成されたルールは正規形式を持たず、以前と全く同じように動作します — この変更は厳密なスーパーセットであるため、**既存のルールにはバックフィルが不要**です。
  
* これら 2 つのフィールドは**サーバー計算**されます。クライアントが送信した値は破棄され、再計算されます。
  
* **`@context` 自体がルールに保存されます。** 後の更新で `@context` を提供せずに `conditions` を置き換える場合、保存されたものが再利用されます(`supplied ?? stored`)。これがなければ、ルールを `GET` してそのまま `PATCH` で返す際 — `@context` は `GET` レスポンスの一部ではありません — サイレントに正規形式が削除され、ルールは他のボキャブラリのエンティティに対して一切エラーなしで発火しなくなります。これはまた、`@context` の概念を持たないエントリポイント(MCP `config` ツール)がルールをダウングレードせずに更新できることも意味します。
  
* `PATCH` で `@context` を提供すると、それと共に送信する条件に対して保存されたものが置き換えられます。これは、リクエストが `@context` を**宣言した**かどうかによって決定され、それが何に解決されたかではありません — したがって、コアコンテキストのみを宣言すると、サイレントに負けるのではなく、保存されたボキャブラリがクリアされます。これがルールをコアボキャブラリに戻す唯一の方法です。
  
* `PATCH` は、それと共に送信する `conditions` および/または `actions` に `@context` を適用します。`conditions` または `actions` の**どちらもなし**に `@context` を送信すると、サイレントに無視されるのではなく `400` で拒否されます(#2260 は、`actions` が下記の独自の正規形式を獲得した後、これを「`conditions` なし」から拡大しました — そうでなければ、`conditions` に触れずにアクションのボキャブラリをリダイレクトする方法がありませんでした)。
  
* ボディ `@context` と `Link` ヘッダーの両方が存在する場合、**ボディが優先されます — ボディがコアコンテキストのみを宣言する場合でも**。優先順位は、ボディが `@context` を持っているかどうかで決定され、それが非コアボキャブラリに解決されたかどうかではありません。
  
* **`@context` の解決中の `400` 失敗 — それらのみ — は、このエンドポイント独自のエラーボキャブラリで報告されます**(`{"error": "BadRequest"}`)、これは `/rules` からの他のすべての `400` と一致します。`400` でないものは、ステータス**と** NGSI-LD エラー識別子の両方を保持します:到達不可能な `@context` は `504` と `{"error": "https://uri.etsi.org/ngsi-ld/errors/LdContextNotAvailable"}` を返し、アウトバウンドレート制限は `429` を返します。これらを `400` に折りたたむと、クライアントが「入力が間違っています」と「後で再試行してください」を区別できなくなります。
  
* エンティティレベルのフィールド名 `"id"` と `"type"`(`value` / `pattern` 条件で使用可能)は正規化されません — これらは属性ではなく、エンティティ自体を指します。
  
* `celExpression` 条件は書き換えられません:式は不透明な文字列であり、構造化された属性名フィールドではありません。
  
* **アクションも正規化されます (#2260)**、同じルール `@context` と上記の条件と同じサーバー計算/逐語的保存パターンを使用します:`updateAttribute` / `deleteAttribute` の `attributeName`(→ `canonicalAttributeName`)、`createEntity` の `entityType`(→ `canonicalEntityType`)とその `attributes` オブジェクトのキー(→ `canonicalAttributeNames`、実際に異なるキーのみを保持する逐語的キー → 正規キーのマップ)、および `appendToTemporal` の `attributes`(→ `canonicalAttributeNames`)。条件マッチングとは異なり、書き込みには逐語的 ∪ 正規形式のユニオンではなく**単一の**保存形式が必要です — **NGSI-LD** エンティティをターゲットとする `createEntity` / `updateAttribute` / `deleteAttribute` / `appendToTemporal` は、正規形式が存在する場合はそれを使用し、逐語的にフォールバックします。**NGSIv2** 上のターゲットは常に逐語的を使用します。なぜなら NGSIv2 には `@context` の概念がなく、そこで正規化すると NGSIv2 API から属性に到達できなくなるからです。`${...}` テンプレートを含む値(例:`${entity.type}`)は決して折りたたまれません — テンプレートはアクション実行時に展開され、展開結果はすでにトリガーエンティティの保存された(正規)値であるため、リテラルテンプレート文字列を折りたたむことは意味がありません。`sendNotification` / `webhook` はエンティティ属性名やタイプを持たず、影響を受けません。`webhook` アクションの `body` は任意の JSON であり、エンティティ属性ではないため、折りたたまれません。逐語的は変更されずに保存されるため、`GET /rules/{ruleId}` → 未修正 `PATCH` のラウンドトリップはデータを失わず、条件がすでに持っていたラウンドトリップ保証と一致します。

ReactiveCore Rules は GeonicDB 拡張であるため、`/rules` は `@context` ソースを `Content-Type` に結び付ける ETSI GS CIM 009 の clause 6.3.5 ルールに拘束されません。ボディはデフォルトの `application/json` コンテンツタイプで受け入れられます。

### 条件タイプ

| Type            | Description                                   | Use Case                                         |
| --------------- | --------------------------------------------- | ------------------------------------------------ |
| `value`         | Attribute value comparison                    | `temperature > 30`                               |
| `pattern`       | Regular expression match                      | `name matches "Sensor.*"`                        |
| `change`        | Whether an attribute has changed              | `temperature was updated`                        |
| `time`          | Time range check                              | `09:00 to 18:00`                                 |
| `entityType`    | Entity type                                   | `["Sensor", "Actuator"]`                         |
| `eventType`     | Trigger event type (CREATE / UPDATE / DELETE) | `["create"]`, `["create", "delete"]`             |
| `celExpression` | CEL expression                                | Complex calculations, multi-attribute evaluation |
| `and`           | Logical AND                                   | All conditions are true                          |
| `or`            | Logical OR                                    | At least one condition is true                   |
| `not`           | Logical NOT                                   | Condition is false                               |

### 1. 値条件

属性の値を比較します。エンティティ属性名に加えて、エンティティレベルのフィールド `"id"` および `"type"` も `attributeName` に指定できます。

> **NGSI-LD マルチ属性 (GeonicDB 拡張、#2785):** 属性が複数のインスタンス (`datasetId`) を持つ場合、値 / パターン条件は `resolveDefaultInstance` によって選択された**デフォルトインスタンス** (`datasetId` なし、それ以外の場合は最初のインスタンス) を評価します。これは GeonicDB のルール評価規律であり、NGSI-LD `options=keyValues` とは同一ではありません。後者は `dataset` 構造内のすべてのデータセット (`@none` を含む) を表す場合があります。デフォルト以外のインスタンスの更新でも変更イベントは発生し、`change` 条件 (名前の一致) を満たすことができますが、`${attribute.<name>.value}` および CEL `attribute.<name>.value` は常にデフォルトインスタンスを読み取ります。インスタンスごとのセレクタ (例: `${attribute.x@datasetId}`) はスコープ外です。

```typescript
interface ValueCondition {
  type: 'value';
  attributeName: string;  // Attribute name, or "id" / "type"
  operator: '==' | '!=' | '>' | '<' | '>=' | '<=';
  value: string | number | boolean;
}
```

**例**:

```json
{
  "type": "value",
  "attributeName": "temperature",
  "operator": ">",
  "value": 30
}
```

エンティティ ID によるフィルタリングの例:

```json
{
  "type": "value",
  "attributeName": "id",
  "operator": "==",
  "value": "urn:ngsi-ld:Sensor:001"
}
```

### 2. パターン条件

属性値を正規表現と照合します。エンティティ属性名に加えて、エンティティレベルのフィールド `"id"` および `"type"` も `attributeName` に指定できます。

```typescript
interface PatternCondition {
  type: 'pattern';
  attributeName: string;  // Attribute name, or "id" / "type"
  pattern: string;  // Regular expression pattern
}
```

**例**:

```json
{
  "type": "pattern",
  "attributeName": "name",
  "pattern": "^Sensor.*"
}
```

パターンによるエンティティ ID のフィルタリングの例:

```json
{
  "type": "pattern",
  "attributeName": "id",
  "pattern": "urn:ngsi-ld:WaterLevelSensor:.*"
}
```

### 3. Change Condition

特定の属性が変更されたかどうかをチェックします。

```typescript
interface ChangeCondition {
  type: 'change';
  attributeName: string;
}
```

**例**:

```json
{
  "type": "change",
  "attributeName": "status"
}
```

### 4. Time Condition

現在時刻が指定された範囲内に収まるかどうかをチェックします。

```typescript
interface TimeCondition {
  type: 'time';
  startTime?: string;  // "HH:mm" format
  endTime?: string;    // "HH:mm" format
  timezone?: string;   // IANA timezone (e.g., "Asia/Tokyo")
}
```

**例**:

```json
{
  "type": "time",
  "startTime": "09:00",
  "endTime": "18:00",
  "timezone": "Asia/Tokyo"
}
```

### 5. Entity Type Condition

エンティティタイプをチェックします。

```typescript
interface EntityTypeCondition {
  type: 'entityType';
  entityTypes: string[];  // List of matching types
}
```

**例**:

```json
{
  "type": "entityType",
  "entityTypes": ["TemperatureSensor", "HumiditySensor"]
}
```

**型名の表記ゆれ (#2125)**: 照合は NGSI-LD core 語彙で正規化してから行われます。短縮名
`TemperatureSensor` と、それが展開される `https://uri.etsi.org/ngsi-ld/default-context/TemperatureSensor`
は**同一の型**として扱われ、どちらの表記で書いてもマッチします
(ETSI GS CIM 009 clause 4.4 の `@vocab` フォールバック)。別の名前空間の同名 IRI
(例 `https://example.org/vocab/TemperatureSensor`) は別の型であり、マッチしません。

同じ正規化はループ検出 (action が trigger と同じ型のエンティティを作る自己発火の防止) にも
適用されます。なお Rules API には `@context` の受け口が無いため、テナント固有の `@context` が
定義する term (core 語彙にない写像) は解決されません (#1973)。

### 6. Event Type Condition

変更を生成したトリガーイベントでフィルタリングします。内部イベント名(`EntityCreated` / `EntityUpdated` / `EntityDeleted`)を小文字のトークン `create` / `update` / `delete` にマッピングします。

```typescript
interface EventTypeCondition {
  type: 'eventType';
  eventTypes: Array<'create' | 'update' | 'delete'>;
}
```

**ユースケース**:


* エンティティ作成時のみアクションを実行する(例:`GeoJSON` が作成されたときのみ `ActivityLog` を書き込む)
  
* 削除時のみクリーンアップを実行する
  
* 更新によって誘発されるカスケード書き込みをスキップする

**例**:

作成のみ:

```json
{
  "type": "eventType",
  "eventTypes": ["create"]
}
```

作成または削除(更新を除外):

```json
{
  "type": "eventType",
  "eventTypes": ["create", "delete"]
}
```

`entityType` と組み合わせて特定のタイプにスコープを設定:

```json
{
  "type": "and",
  "conditions": [
    { "type": "eventType",  "eventTypes": ["create"] },
    { "type": "entityType", "entityTypes": ["GeoJSON"] }
  ]
}
```

> **注意**: UPDATE イベントでの属性レベルのフィルタリングには、`change` と組み合わせます(例:`{type: "change", attributeName: "status"}`)。CREATE / DELETE では、`changedAttributes` が未定義であるため、`change` は常に false と評価されます。

### 7. CEL Expression Condition

[Common Expression Language (CEL)](https://github.com/google/cel-spec) を使用した柔軟な条件式。複雑な計算、文字列操作、複数の属性の組み合わせ評価をサポートします。

```typescript
interface CelExpressionCondition {
  type: 'celExpression';
  expression: string;  // CEL expression (max 1000 characters)
}
```

#### CEL コンテキスト変数

| Variable                          | Description                                                                                  | Example                                            |
| --------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `entity.id`                       | Entity ID                                                                                    | `"urn:ngsi-ld:Device:001"`                         |
| `entity.type`                     | Entity type                                                                                  | `"Device"`                                         |
| `attribute.<name>.value`          | Current attribute value (default instance for multi-attribute; GeonicDB extension, #2785)    | `attribute.temperature.value` → `35`               |
| `attribute.<name>.type`           | Current attribute type                                                                       | `attribute.temperature.type` → `"Number"`          |
| `previous.attribute.<name>.value` | Pre-change attribute value (default instance for multi-attribute; GeonicDB extension, #2785) | `previous.attribute.temperature.value` → `25`      |
| `previous.attribute.<name>.type`  | Pre-change attribute type                                                                    | `previous.attribute.temperature.type` → `"Number"` |

イベントタイプ別の `previous` のセマンティクス:

| Event           | `previous.attribute`             |
| --------------- | -------------------------------- |
| `EntityCreated` | Empty object — no previous state |
| `EntityUpdated` | Pre-update attributes snapshot   |
| `EntityDeleted` | Final attributes before deletion |

> **ヒント — `has()` でガードする**: 前の状態に属性が存在しない可能性がある場合(例: `EntityCreated` 時、または新しく追加された属性の場合)、アクセスを `has()` でラップしてください:
>
> ```text
> has(previous.attribute.temperature) && previous.attribute.temperature.value <= 30 && attribute.temperature.value > 30
> ```
>
> 存在しないキーに対して `has()` を使わずに直接アクセスすると、評価エラーが発生し、それがキャッチされて `false` として扱われます。

#### 例

**属性値の比較:**

```json
{
  "type": "celExpression",
  "expression": "attribute.temperature.value > 30"
}
```

**複数の属性の組み合わせ:**

```json
{
  "type": "celExpression",
  "expression": "attribute.temperature.value > 30 && attribute.status.value == \"active\""
}
```

**不快指数の計算:**

```json
{
  "type": "celExpression",
  "expression": "0.81 * attribute.temperature.value + 0.01 * attribute.humidity.value * (0.99 * attribute.temperature.value - 14.3) + 46.3 > 75"
}
```

**エンティティ ID/タイプの条件:**

```json
{
  "type": "celExpression",
  "expression": "entity.type == \"Device\" && entity.id.startsWith(\"urn:ngsi-ld:Device:\")"
}
```

**しきい値の通過(値がしきい値を超えた瞬間のみ発火):**

```json
{
  "type": "celExpression",
  "expression": "has(previous.attribute.temperature) && previous.attribute.temperature.value <= 30 && attribute.temperature.value > 30"
}
```

冪等な更新(同じ値を再書き込み)は、`previous.attribute.temperature.value` が既に > 30 であるため発火しません。

**状態遷移(例: `draft` → `published`):**

```json
{
  "type": "celExpression",
  "expression": "has(previous.attribute.status) && previous.attribute.status.value == \"draft\" && attribute.status.value == \"published\""
}
```

**新しく追加された属性の検出:**

```json
{
  "type": "celExpression",
  "expression": "!has(previous.attribute.description) && has(attribute.description)"
}
```

**型変更を検出 (例: Text → Number):**

```json
{
  "type": "celExpression",
  "expression": "has(previous.attribute.reading) && previous.attribute.reading.type == \"Text\" && attribute.reading.type == \"Number\""
}
```

#### カスタム関数

以下のカスタム関数は CEL 式で使用できます。これらは IoT およびスマートシティのユースケースでよく必要とされる地理空間計算および時間ベースの条件評価をサポートします。

##### `distance(location1, location2)` — 2 点間の距離 (メートル単位)

Haversine 公式を使用した大円距離計算。入力は GeoJSON Point オブジェクト、出力はメートル (Number) です。

```json
{
  "type": "celExpression",
  "expression": "distance(attribute.location.value, {\"type\": \"Point\", \"coordinates\": [139.6503, 35.6762]}) < 1000"
}
```

##### `within(location, polygon)` — 点がポリゴン内にあるかのチェック

Ray casting アルゴリズムを使用した点がポリゴン内にあるかの判定。入力は GeoJSON Point と GeoJSON Polygon、出力は Boolean です。外側のリングのみがサポートされます (穴/内側のリングはサポートされません)。また、外側のリングは閉じている必要があります (開始座標と終了座標が同じでなければなりません)。

```json
{
  "type": "celExpression",
  "expression": "within(attribute.location.value, {\"type\": \"Polygon\", \"coordinates\": [[[139.6, 35.6], [139.8, 35.6], [139.8, 35.8], [139.6, 35.8], [139.6, 35.6]]]})"
}
```

ジオフェンス退出を検出するには否定演算子を使用します:

```json
{
  "type": "celExpression",
  "expression": "!within(attribute.location.value, {\"type\": \"Polygon\", \"coordinates\": [[[139.6, 35.6], [139.8, 35.6], [139.8, 35.8], [139.6, 35.8], [139.6, 35.6]]]})"
}
```

##### `now()` — 現在時刻 (ISO 8601 文字列)

現在の UTC 時刻を ISO 8601 文字列として返します。

```json
{
  "type": "celExpression",
  "expression": "now() > attribute.createdAt.value"
}
```

##### `dayOfWeek()` — 現在の曜日 (0-6、Sunday=0)

UTC ベースの曜日を数値として返します (0=Sunday、1=Monday、...、6=Saturday)。

```json
{
  "type": "celExpression",
  "expression": "dayOfWeek() >= 1 && dayOfWeek() <= 5 && attribute.temperature.value > 30"
}
```

##### 関数の組み合わせ

カスタム関数は他の CEL 演算子やコンテキスト変数と自由に組み合わせることができます:

```json
{
  "type": "celExpression",
  "expression": "distance(attribute.location.value, {\"type\": \"Point\", \"coordinates\": [139.7671, 35.6812]}) < 5000 && dayOfWeek() >= 1 && dayOfWeek() <= 5"
}
```

#### 制限事項


* 式の最大長: 1000 文字
  
* CEL はチューリング不完全です (ループや再帰がありません) ため、無限ループのリスクはありません
  
* 式は boolean を返す必要があります (boolean 以外の結果は false として扱われます)
  
* 評価エラーが発生した場合、条件は false として扱われます (例外はスローされません)
  
* カスタム関数は既存の CEL 評価タイムアウト (100ms) 内で実行されます
  
* カスタム関数への無効な入力 (例: 無効な GeoJSON) はエラーとなり、条件は false として扱われます

### 8. Logical Conditions

#### AND 条件

すべての子条件が真のときに真になります。

```json
{
  "type": "and",
  "conditions": [
    {
      "type": "value",
      "attributeName": "temperature",
      "operator": ">",
      "value": 30
    },
    {
      "type": "value",
      "attributeName": "humidity",
      "operator": "<",
      "value": 40
    }
  ]
}
```

#### OR 条件

少なくとも1つの子条件が真のときに真になります。

```json
{
  "type": "or",
  "conditions": [
    {
      "type": "value",
      "attributeName": "status",
      "operator": "==",
      "value": "critical"
    },
    {
      "type": "value",
      "attributeName": "status",
      "operator": "==",
      "value": "error"
    }
  ]
}
```

#### NOT 条件

子条件が偽のときに真になります。

```json
{
  "type": "not",
  "condition": {
    "type": "value",
    "attributeName": "enabled",
    "operator": "==",
    "value": false
  }
}
```

***

## アクション

条件が一致したときに実行される操作です。

### アクションタイプ

| Type               | Description                | Use Case                              |
| ------------------ | -------------------------- | ------------------------------------- |
| `createEntity`     | Create a new entity        | Generate derived entities             |
| `updateAttribute`  | Update an attribute        | Add calculated results                |
| `deleteAttribute`  | Delete an attribute        | Remove unnecessary attributes         |
| `sendNotification` | Send a notification        | Notify via subscription               |
| `webhook`          | Invoke a Webhook           | Integrate with external systems       |
| `appendToTemporal` | Append to the Temporal API | Automatically record time-series data |

### 1. Create Entity Action

新しいエンティティを作成します。

```typescript
interface CreateEntityAction {
  type: 'createEntity';
  entityId: string;               // Supports template variables
  entityType: string;             // Supports template variables
  attributes: Record<string, unknown>;  // Supports template variables
  protocol?: 'ngsiv2' | 'ngsild';  // Target protocol (default: inherit from trigger)
  servicePath?: string;              // Target servicePath (supports ${...} templates; validated
                           // against /^\/[\w/]*$/ at creation and again after substitution.
                           // For ngsild targets it is forced to '/' unless set explicitly — #1605)
  scope?: string[];                  // Target scope for ngsild (static values only — the API schema
                                     // rejects `${...}` templates; see NgsiLdScopeStringSchema)
}
```

**例**: 温度センサーデータから集約エンティティを作成

```json
{
  "type": "createEntity",
  "entityId": "summary-${entity.id}",
  "entityType": "TemperatureSummary",
  "attributes": {
    "sensorId": "${entity.id}",
    "currentTemperature": "${attribute.temperature.value}",
    "timestamp": "${attribute.temperature.metadata.timestamp.value}"
  }
}
```

**例**: クロスプロトコル — NGSIv2 センサーから NGSI-LD アラートを作成

```json
{
  "type": "createEntity",
  "entityId": "urn:ngsi-ld:Alert:${entity.id}",
  "entityType": "Alert",
  "protocol": "ngsild",
  "scope": ["${trigger.servicePath}"],
  "attributes": {
    "severity": { "type": "Property", "value": "high" },
    "source": { "type": "Relationship", "value": "${entity.id}" }
  }
}
```

### 2. Update Attribute Action

既存のエンティティの属性を更新します。

```typescript
interface UpdateAttributeAction {
  type: 'updateAttribute';
  entityId: string;        // Supports template variables
  attributeName: string;
  value: unknown;          // Supports template variables
  protocol?: 'ngsiv2' | 'ngsild';  // Target protocol (default: inherit from trigger)
  servicePath?: string;    // Target servicePath (supports ${...} templates; validated
                           // against /^\/[\w/]*$/ at creation and again after substitution.
                           // For ngsild targets it is forced to '/' unless set explicitly — #1605)
  scope?: string[];        // Target scope for ngsild (static values only — schema rejects `${...}`).
                           // Applied to the entity ONLY when explicitly set (never auto-derived);
                           // an empty array is ignored rather than clearing the entity's scope
}
```

**例**: 高温警告フラグを追加

```json
{
  "type": "updateAttribute",
  "entityId": "${entity.id}",
  "attributeName": "highTemperatureAlert",
  "value": true
}
```

**例**: クロスプロトコル — 以前の `createEntity` アクションによって作成された NGSI-LD ミラーエンティティを更新

```json
{
  "type": "updateAttribute",
  "entityId": "urn:ngsi-ld:Alert:${entity.id}",
  "attributeName": "acknowledged",
  "value": true,
  "protocol": "ngsild"
}
```

> **`servicePath`/`scope` の解決は `createEntity` と共有されます (#1606)**: アクションが NGSI-LD をターゲットとし、`servicePath` を明示的に設定しない場合、ターゲット `servicePath` は `'/'` に強制されます — これは `createEntity` (#1605) と同じで、HTTP NGSI-LD API がエンティティを検索する場所だからです。これがないと、同じルールエンジンによって作成された NGSI-LD ミラーをターゲットとする `updateAttribute`/`deleteAttribute` アクションは、*トリガーの* servicePath で検索し続けるため、エンティティを見つけることができません (`NotFoundError`)。以下の「Automatic servicePath ↔ scope Mapping」を参照してください — 同じテーブルがここにも適用されます。

### 3. Delete Attribute Action

エンティティから属性を削除します。

```typescript
interface DeleteAttributeAction {
  type: 'deleteAttribute';
  entityId: string;        // Supports template variables
  attributeName: string;
  protocol?: 'ngsiv2' | 'ngsild';  // Target protocol (default: inherit from trigger)
  servicePath?: string;    // Target servicePath (supports ${...} templates; validated
                           // against /^\/[\w/]*$/ at creation and again after substitution.
                           // For ngsild targets it is forced to '/' unless set explicitly — #1605)
  scope?: string[];        // Target scope for ngsild (static values only — schema rejects `${...}`; used only for
                           // servicePath auto-mapping — deleteAttribute does not itself modify scope)
}
```

**例**: 警告フラグを削除する

```json
{
  "type": "deleteAttribute",
  "entityId": "${entity.id}",
  "attributeName": "highTemperatureAlert"
}
```

### 4. Send Notification Action

サブスクリプション経由で通知を送信します。カスタムデータを指定されたサブスクリプションの通知エンドポイントに送信できます。

#### インターフェース

```typescript
interface SendNotificationAction {
  type: 'sendNotification';
  subscriptionId?: string;        // Single subscription ID
  subscriptionIds?: string[];     // Multiple subscription IDs
  message?: string;               // Optional message
  notificationData?: Record<string, unknown>;  // Custom data
}
```

**注:** `subscriptionId` または `subscriptionIds` の少なくとも 1 つを指定する必要があります。

#### 例

**単一のサブスクリプションへの通知:**

```json
{
  "type": "sendNotification",
  "subscriptionId": "urn:ngsi-ld:Subscription:sub001",
  "message": "High temperature detected"
}
```

**複数のサブスクリプションへの通知:**

```json
{
  "type": "sendNotification",
  "subscriptionIds": ["urn:ngsi-ld:Subscription:sub001", "urn:ngsi-ld:Subscription:sub002"],
  "notificationData": {
    "alertLevel": "high",
    "sensorId": "${entity.id}",
    "temperature": "${attribute.temperature.value}"
  }
}
```

#### テンプレート変数

`notificationData` では以下のテンプレート変数を使用できます:

* `${entity.id}` - エンティティ ID
  
* `${entity.type}` - エンティティタイプ
  
* `${attribute.<name>.value}` - 属性値
  
* `${attribute.<name>.metadata.<metaName>.value}` - 属性メタデータ値

#### 制限事項


* カスタムデータのサイズは 200 KB 以下である必要があります (EventBridge の制限)
  
* 指定されたサブスクリプション ID は同じテナント内に存在する必要があります
  
* 存在しないサブスクリプション ID は警告ログとともにスキップされます

### 5. Webhook Action

外部 HTTP エンドポイントを呼び出します。

```typescript
interface WebhookAction {
  type: 'webhook';
  url: string;                        // Supports template variables
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;   // Supports template variables
  body?: unknown;                     // Supports template variables
}
```

**例**: 温度データを外部 API に送信する

```json
{
  "type": "webhook",
  "url": "https://api.example.com/temperature-alerts",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer token123",
    "Content-Type": "application/json"
  },
  "body": {
    "sensorId": "${entity.id}",
    "temperature": "${attribute.temperature.value}",
    "timestamp": "${attribute.temperature.metadata.timestamp.value}"
  }
}
```

アウトバウンド `webhook` 呼び出しは、サブスクリプション通知と同じ `pinnedRequest` トランスポートを使用します
(#2932): DNS はリバインディングに対してピン留めされ、**HTTP リダイレクトは追跡されません** (`3xx` はアクションを失敗させます)。`url` は最終的なエンドポイントを指定してください。

### 6. Append to Temporal Action

エンティティ属性データを Temporal API (時系列データベース) に自動的に追記します。内部的に `TemporalService.recordEntityChange()` を呼び出して、Time Series Collection にデータを記録します。

#### インターフェース

```typescript
interface AppendToTemporalAction {
  type: 'appendToTemporal';
  attributes?: string[];  // Attribute names to record. Omitted: prefer changedAttributeSelectors
  // (instance-level diff) from the entity change event; legacy events without selectors
  // fall back to changedAttributes (name-level = all instances of those attributes).
}
```

#### 例

**特定の属性のみを記録:**

```json
{
  "type": "appendToTemporal",
  "attributes": ["temperature", "humidity"]
}
```

**変更された属性を自動的に記録 (attributes を省略):**

```json
{
  "type": "appendToTemporal"
}
```

#### 動作詳細


* `attributes` が指定されている場合: 指定された属性のみが Temporal API に記録されます
  
  * **ハイブリッドインスタンス選択 (#2818):** 指定された属性名がトリガーの
    `changedAttributeSelectors` (`{ name, datasetId? }`) に現れる場合、それらのインスタンスのみが記録されます
    (差分)。`attributes` にリストされているが、トリガーの差分には**含まれていない**名前は、
    フル属性スナップショット (すべてのインスタンス — 単純な名前セレクター) として記録されます。
    
* `attributes` が省略されている場合: エンティティ変更イベントの `changedAttributeSelectors`
  (インスタンスレベルの差分) を優先します。セレクターを持たないレガシーイベントは `changedAttributes`
  (名前レベル = それらの属性のすべてのインスタンス) にフォールバックします。
  
* Temporal への入力は、イベントの折りたたまれていない `currentAttributes` (複数属性
  配列が保持されます) から構築されます。ルール条件の評価は依然としてデフォルトインスタンス
  (`resolveDefaultInstance`) に折りたたまれます。その折りたたまれた `context.entity` は temporal には**渡されません**。
  
* 属性が `observedAt` メタデータを持つ場合、その値がタイムスタンプとして使用されます。そうでない場合は現在時刻が使用されます
  
* データは Time Series Collection に追記されます (既存のデータは保持されます)
  
* **`TEMPORAL_ENTITY_DUAL_WRITE` との相互作用 (#2508 / #2527):** この環境フラグが `true` の場合、Entity API も Temporal Evolution に二重書き込みを行います (Core API の create/update/replace/batch write パス**および delete パス**で削除トゥームストーンとして)。**テナントに有効な `appendToTemporal` ルールがある場合、二重書き込みはスキップされます** (ルールが優先 — 属性サブセット / 条件セマンティクスを含む)。チェックは粗い粒度です (tenant + servicePath; ルールのエンティティタイプ条件はスキップ判定のために評価されません)。EntityExpiryService による TTL 期限切れ (GC) も、フラグがオンの場合はトゥームストーンとして二重書き込みされます (#2780)。

#### ユースケース


1. **IoT センサーデータの自動アーカイブ**: 温度や湿度センサーの値が更新されるたびに、自動的に時系列データとして記録します
   
2. **閾値違反時のスナップショット記録**: 特定の条件が満たされた場合にのみ時系列データを記録します (条件と組み合わせて使用)
   
3. **選択的な属性記録**: すべての属性ではなく、特定の属性のみを効率的に記録します

***

## クロスプロトコルエンティティ作成

ルールエンジンはプロトコル境界を越えたエンティティ作成をサポートします。例えば、NGSIv2 センサーの変更が NGSI-LD エンティティの作成をトリガーでき、その逆も可能です。

### 概要

GeonicDB はプロトコル分離を強制します: NGSIv2 エンティティは NGSIv2 API 経由でのみアクセス可能であり、NGSI-LD エンティティは NGSI-LD API 経由でのみアクセス可能です。ルールエンジンは、アクションがトリガーエンティティのプロトコルとは異なるターゲット `protocol` を指定できるようにすることで、このギャップを埋めます。

### クロスプロトコルのアクションフィールド

| Field         | Actions                                                                                                                                                                                                            | Type                         | Default                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `protocol`    | createEntity, updateAttribute, deleteAttribute                                                                                                                                                                     | `'ngsiv2' \| 'ngsild'` | Inherited from trigger                                                                                         |
| `servicePath` | createEntity, updateAttribute, deleteAttribute                                                                                                                                                                     | `string`                     | Inherited/auto-mapped for ngsiv2 targets; **forced to `'/'` for ngsild targets unless explicitly set** (#1605) |
| `scope`       | createEntity (applied to the created entity); updateAttribute (**applied only when explicitly set on the action** — never auto-derived); deleteAttribute (used only for `servicePath` auto-mapping, never applied) | `string[]`                   | createEntity: inherited or auto-mapped / updateAttribute: explicit only                                        |

>

### ⚠️ セキュリティ: クロスプロトコル配置は認可境界を変更します
>
> **NGSI-LD の認可は `scope` によって表現され、`servicePath` ではありません。** NGSI-LD API は
> `resource.servicePath` を `'/'` に固定します(`policy.pip.ts`; #964 を参照)。そのため、グループを
> `servicePath` で制限するポリシーは **NGSI-LD エンティティを保護しません** — これらのルールが作成するミラーも含みます。
> 非ルート NGSIv2 トリガーから作成されたミラーが現在 `servicePath: '/'` に配置される(#1605 — そうしなければ HTTP API が全くアクセスできない)ため、`servicePath` でデータを分割するテナントは、そのデータを制限するために **scope ベース** のポリシーを追加する必要があります。エンジンは非ルートトリガーパスからターゲットを再配置するたびに
> `metric: RuleCrossProtocolRelocation`(WARN)をログに記録するため、変更は観測可能です。
>
> **`updateAttribute` の `scope` は置換であり、`scope` は認可属性です。**
> そのため、`updateAttribute` は **アクションが明示的に設定した場合のみ** `scope` を適用します — トリガーから自動導出されることはありません。自動導出すると、「1 つの属性を更新」が既存のエンティティを静かに再分類することになります(例えば、`['/private/hr']` でスコープされたエンティティが `/foo` のルールに触れると
> `['/foo']` になり、その後 `/private/**` をキーとする `Deny` ルールと行レベルフィルターが適用されなくなります)。
> HTTP パスとは異なり、ルールエンジンにはスコープ遷移のための認可チェックポイントがありません。
>
> **ルールエンジンは環境権限で動作します** — 書き込むエンティティに対して XACML 評価を実行しません。ルールを作成できるプリンシパルは、**同じテナント** 内の任意のエンティティにアクセスできます
> (テナント分離自体はバイパスできません: `service` は常にトリガーから取得されます)。
> `POST /rules` を適切に制限してください。エンジンレベルのエンティティごとの認可は別途追跡されています。
>
> **#1606**: `updateAttribute`/`deleteAttribute` は、`createEntity` と全く同じ関数を通じて `servicePath`/`scope` を解決します
> (個別/重複したロジックはありません)。これは #1605 のため重要です: このルールエンジンによって作成された NGSI-LD エンティティは、アクションが明示的にオーバーライドしない限り常に `servicePath: '/'` に存在します — そのため、そのエンティティをターゲットとする後続の `updateAttribute`/
> `deleteAttribute` は同じ `'/'` に解決する必要があります。そうでなければ、エンティティを見つけられず静かに失敗します
> (`NotFoundError`、`metric: 'RuleActionFailure'` でログに記録されます — 下記の「可観測性」を参照)。

### 自動 servicePath ↔ scope マッピング

プロトコル間を横断する際、階層システムは自動的にマッピングされます:

| Direction              | Condition                    | Mapping                                                     |
| ---------------------- | ---------------------------- | ----------------------------------------------------------- |
| NGSIv2 → NGSI-LD       | trigger `servicePath != '/'` | `scope = [trigger.servicePath]`, target `servicePath = '/'` |
| NGSI-LD → NGSIv2       | `scope` has elements         | `servicePath = scope[0]`                                    |
| Root servicePath `'/'` | (always)                     | No scope generated                                          |

アクションに明示的な `servicePath` または `scope` を指定すると、自動マッピングがオーバーライドされます。テンプレート変数(`${trigger.servicePath}`、`${trigger.scope}`)をカスタムマッピングロジックに使用できます。

> **NGSI-LD エンティティは、アクションが明示的にオーバーライドしない限り、常に `servicePath: '/'` に作成されます(#1605)。**
> NGSI-LD HTTP API には `Fiware-ServicePath` の概念がありません — 常にルートパスで読み書きします
> (`tenant.middleware.ts` の `apiType: 'ngsild'` 処理、#964 による: "servicePath と scope は独立した概念")。NGSI-LD エンティティの階層は `scope` を通じてのみ表現されます。
> `protocol: "ngsild"` の `createEntity` アクションが明示的に非ルートの `servicePath` を設定した場合、結果のエンティティは **`GET`/`DELETE /ngsi-ld/v1/entities/{id}` から到達不可能** になります(`servicePath: '/'` のみを読み取る)
> 内部的には完全に可視である(例: MCP ツール経由)にもかかわらずです。`servicePath` をデフォルトにして、
> 代わりに `scope`(トリガーの `servicePath` から自動マッピングされるか、明示的に設定)を使用して階層を表現することを推奨します。

### 例: NGSIv2 センサー → NGSI-LD アラート

```json
{
  "name": "Cross-protocol temperature alert",
  "conditions": [
    { "type": "entityType", "entityTypes": ["TemperatureSensor"] },
    { "type": "value", "attributeName": "temperature", "operator": ">", "value": 35 }
  ],
  "actions": [{
    "type": "createEntity",
    "protocol": "ngsild",
    "entityId": "urn:ngsi-ld:Alert:heat-${entity.id}",
    "entityType": "Alert",
    "scope": ["${trigger.servicePath}"],
    "attributes": {
      "severity": { "type": "Property", "value": "high" },
      "source": { "type": "Relationship", "value": "${entity.id}" },
      "temperature": { "type": "Property", "value": "${attribute.temperature.value}" }
    }
  }]
}
```

### 例: NGSI-LD エンティティ → NGSIv2 ミラー

```json
{
  "name": "NGSI-LD to NGSIv2 mirror",
  "conditions": [
    { "type": "entityType", "entityTypes": ["Device"] }
  ],
  "actions": [{
    "type": "createEntity",
    "protocol": "ngsiv2",
    "entityId": "v2-${entity.id}",
    "entityType": "DeviceMirror",
    "attributes": {
      "source": "${entity.id}",
      "status": "mirrored"
    }
  }]
}
```

### 制限事項


* **複数のスコープ**: scope → servicePath のマッピング時には、最初の要素 (`scope[0]`) のみが使用されます。servicePath は単一の文字列であるためです
  
* **ルート servicePath**: `'/'` は scope にマッピングされません (NGSI-LD では意味を持たないため)
  
* **後方互換性**: `protocol` が省略された場合、アクションはトリガーエンティティのプロトコルを継承します (既存の動作)
  
* **NGSI-LD servicePath は `'/'` に強制されます**: `protocol: "ngsild"` の `createEntity` アクションの場合、`servicePath` はトリガーの servicePath に関係なく `'/'` がデフォルトとなります — 階層は代わりに `scope` で表現する必要があります。このようなアクションに対して明示的に非ルートの `servicePath` を設定することは可能ですが、NGSI-LD HTTP API からエンティティにアクセスできなくなります (#1605)

***

## テンプレート変数

動的変数をアクション値に埋め込むことができます。

### 構文

`${path.to.value}` の形式で記述します。

### 利用可能なパス

| Path                                       | Description                                                                       | Example                                                      |
| ------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `${entity.id}`                             | Entity ID                                                                         | `"Sensor001"`                                                |
| `${entity.type}`                           | Entity type                                                                       | `"TemperatureSensor"`                                        |
| `${attribute.<name>.value}`                | Attribute value (default instance for multi-attribute; GeonicDB extension, #2785) | `${attribute.temperature.value}` → `25.5`                    |
| `${attribute.<name>.type}`                 | Attribute type                                                                    | `${attribute.temperature.type}` → `"Number"`                 |
| `${attribute.<name>.metadata.<key>.value}` | Metadata value                                                                    | `${attribute.temperature.metadata.unit.value}` → `"Celsius"` |
| `${trigger.protocol}`                      | Trigger entity's protocol                                                         | `"ngsiv2"` or `"ngsild"`                                     |
| `${trigger.servicePath}`                   | Trigger entity's servicePath                                                      | `"/Madrid/Sensors"`                                          |
| `${trigger.scope}`                         | Trigger entity's scope array (JSON)                                               | `["/Madrid/Sensors"]`                                        |
| `${trigger.service}`                       | Trigger entity's tenant service                                                   | `"smartcity"`                                                |

### 例

#### 派生エンティティ ID の生成

```json
{
  "entityId": "summary-${entity.id}"
}
```

`entity.id` が `"Sensor001"` の場合、これは `"summary-Sensor001"` になります。

#### 属性値のコピー

```json
{
  "attributes": {
    "originalTemperature": "${attribute.temperature.value}",
    "sensor": "${entity.id}"
  }
}
```

#### 動的 Webhook URL

```json
{
  "url": "https://api.example.com/sensors/${entity.id}/alerts"
}
```

### テンプレート関数

パス解決に加えて、アクションテンプレートは `${name(args)}` の形式で純粋関数の小さなホワイトリストを呼び出すことができます。サーバーのウォールクロック時間のスタンプや、派生エンティティでの一意の ID 生成(例:追記専用の `ActivityLog` レコード)に便利です。

| Function                     | Returns                                | Example                                  |
| ---------------------------- | -------------------------------------- | ---------------------------------------- |
| `${now()}` / `${now('iso')}` | ISO 8601 timestamp (ms precision, UTC) | `"2026-05-02T01:23:45.678Z"`             |
| `${now('unix')}`             | UNIX timestamp in seconds              | `"1746148225"`                           |
| `${now('unix-ms')}`          | UNIX timestamp in milliseconds         | `"1746148225678"`                        |
| `${uuid()}`                  | RFC 4122 v4 UUID                       | `"6f1c43b8-7c5e-4f12-9a2b-2d3a4f5c6e7d"` |

**注意事項**


* 関数は**ルール発火ごと**に評価されます — すべてのイベントは新しい値を作成します(そのため `${uuid()}` は派生エンティティごとに真に一意であり、`${now()}` はルール登録時ではなく評価の瞬間を反映します)。
  
* 引数パーサーは単純なカンマ区切りのリテラル文字列(`'iso'`、`"unix"`)のみを処理します。ネストされた式、数値演算、`${now(entity.id)}` のような参照はサポートされていません — これらは代わりに CEL `celExpression` 条件で計算し、結果をエンティティ属性として公開してください。
  
* 未知の関数名とサポートされていない引数値は、プレースホルダーテキストをそのまま残します(例:`${notAFunction()}` はリテラルのまま)。ルール作成者がタイプミスを修正できるように警告がログに記録されます。
  
* パス解決と関数呼び出しは共存します:`https://example.com/log?id=${uuid()}&entity=${entity.id}` は期待通りに動作します。

#### 追記専用 ActivityLog の例

```json
{
  "type": "createEntity",
  "entityId": "urn:ngsi-ld:ActivityLog:${uuid()}",
  "entityType": "ActivityLog",
  "attributes": {
    "target": "${entity.id}",
    "action": "create",
    "createdAt": "${now()}"
  }
}
```

すべてのエンティティ作成イベントは新しい `ActivityLog` インスタンスを生成します — entityId の衝突もクールダウンの競合もありません。

***

## Rules API

### ルール一覧

```http
GET /rules
Authorization: Bearer <accessToken>
```

**認可**: XACML ポリシーベース (`tenant_admin` ロールが必要。認証が有効な場合 (デフォルト)、`super_admin` は `/rules*` エンドポイントにアクセスできません)

**クエリパラメータ**

| Parameter     | Description                                                                                                                                                                                                                                                                                                                                                                               |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `limit`       | Number of results to retrieve (default: 20, max: 100)                                                                                                                                                                                                                                                                                                                                     |
| `offset`      | Offset (default: 0)                                                                                                                                                                                                                                                                                                                                                                       |
| `servicePath` | Filter by service path. Must match `/^\/[\w/]*$/` (a single, non-hierarchical path — see "servicePath syntax" below); `400 Bad Request` otherwise (#1607). **If omitted, defaults to the servicePath authorization was evaluated against** — the resolved `Fiware-ServicePath` (default `/`) — rather than matching every servicePath (#2259; see "servicePath default resolution" below) |
| `isActive`    | Filter by enabled/disabled (`true` / `false`)                                                                                                                                                                                                                                                                                                                                             |

**レスポンス**: `200 OK`

```json
[
  {
    "ruleId": "high-temperature-alert",
    "name": "High Temperature Warning",
    "description": "Add a warning attribute when temperature exceeds 30 degrees",
    "tenantId": "smartcity",
    "servicePath": "/sensors",
    "conditions": [...],
    "actions": [...],
    "isActive": true,
    "priority": 10,
    "createdAt": "2026-02-10T00:00:00.000Z",
    "updatedAt": "2026-02-10T00:00:00.000Z"
  }
]
```

**レスポンスヘッダー**


* `X-Total-Count`: 結果の総数
  
* `Link`: ページネーションリンク

### ルールを作成

```http
POST /rules
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**リクエストボディ**

```json
{
  "ruleId": "high-temperature-alert",
  "name": "High Temperature Warning",
  "description": "Add a warning attribute when temperature exceeds 30 degrees",
  "conditions": [
    {
      "type": "entityType",
      "entityTypes": ["TemperatureSensor"]
    },
    {
      "type": "value",
      "attributeName": "temperature",
      "operator": ">",
      "value": 30
    }
  ],
  "actions": [
    {
      "type": "updateAttribute",
      "entityId": "${entity.id}",
      "attributeName": "alert",
      "value": "HIGH_TEMPERATURE"
    }
  ],
  "priority": 10
}
```

ルールの `servicePath` は、`servicePath` クエリパラメータまたは `Fiware-ServicePath` ヘッダーから取得されます(クエリパラメータが優先されます)。どちらも指定されていない場合は、デフォルトで `/` になります。

**レスポンス**: `201 Created` / `400 Bad Request`(`servicePath` の検証に失敗した場合。以下の「servicePath 構文」を参照)

#### servicePath 構文 (#1607)

ルールの `servicePath` は `/^\/[\w/]*$/` にマッチしなければなりません。つまり、先頭の `/` の後に任意の数の英数字、アンダースコア、および `/` が続く形式です。**ハイフンやその他の句読点は許可されず**、単一の非階層パスでなければなりません(カンマ区切りの複数パス、末尾の `/#` は不可)。`POST /rules` と `GET /rules?servicePath=...` の両方でこの検証が適用されます(NGSIv2 データ書き込みが使用する同じ検証 `parseServicePathHeader()` を使用)。

これは、一般的な NGSIv2 書き込みパス検証よりも 1 つの点で厳格です。階層的な `/#` は明示的に拒否されます。`parseServicePathHeader()` は通常それをリテラルパスセグメントとして受け入れますが、ここでは拒否されます。ルールは常に 1 つの `servicePath` に厳密にマッチします。`rule.repository.ts` の `findActiveRulesForTenant()` と `listRules` フィルターは両方とも**完全な文字列一致**で比較し、プレフィックス/階層による比較は決して行いません。そのため、`/#` サフィックスまたはカンマ区切りの `servicePath` は、実際には受信したエンティティ変更にマッチすることはありません。これを受け入れると、作成時に大声で失敗する代わりに、発火することのないルール(`POST /rules`)やフィルターが常に空を返すリスト(`GET /rules`)が静かに生成されることになります。

**ルールの `servicePath` は、それをトリガーする NGSIv2 書き込みで使用される `Fiware-ServicePath` と厳密にマッチしなければなりません。** たとえば、`servicePath: "/sensors"` で作成されたルールは、トリガーイベントが `servicePath: "/sensors"` を持つエンティティ変更に対してのみ発火します。`/sensors/indoor`、`/`、または省略(デフォルトで `/` になる)では発火しません。

#### servicePath デフォルト解決 (#2259)

`/rules` は、リクエストの*有効な* `servicePath` を、認可と実際の操作の両方で同じ方法で解決します。2 つの独立したデフォルト入力ではなく、**単一の**解決ポイント(`resolveRulesRequestServicePath`)です。リクエストが値を宣言している場合(`servicePath` クエリパラメータ)、それが検証され(上記の「servicePath 構文」を参照)、両方に使用されます。宣言していない場合は、両方とも `Fiware-ServicePath` から解決された servicePath(デフォルトは `/`)にフォールバックします。これは、XACML ポリシーエンジンがリクエストを評価する際に使用するのと同じ値です。

**破壊的変更**: #2259 以前は、`servicePath` クエリパラメータなしの `GET /rules` は**すべての** servicePath からルールを返していましたが、認可は依然として単一の `Fiware-ServicePath` 由来の値に対して評価されていました。つまり、`servicePath` スコープの Deny ポリシーは、クエリパラメータを省略するだけでバイパスできました。`GET /rules` は、パラメータが省略された場合、その単一の解決された servicePath のルールのみを返すようになりました。異なる servicePath 下のルールを表示するには、`?servicePath=...`(または一致する `Fiware-ServicePath` ヘッダー)を明示的に渡してください。その同じ値が認可でも評価されます。`POST /rules`(新しいルールが格納される servicePath)は、既に持っていたのと同じ優先順位を保持します(クエリパラメータ、次にヘッダー、次に `/`)が、1 つの例外があります。**明示的に空の** `?servicePath=` は、「指定なし」ではなく「ルートパス `/`」を意味するようになりました。以前は空の値は `Fiware-ServicePath` にフォールスルーしていましたが、現在は両側が 1 つの解決ポイントを通過するため、リストフィルターが常に読み取ってきた方法(#1607)と同じ方法で読み取られます。認可は同じ `/` に対して評価されるため、これによって 2 つが分割されることはありません。

#### ID による操作は、ルールに格納された servicePath に対して認可される (#2283)

上記の解決は、*クライアント*が servicePath を提供する操作(`GET /rules`、`POST /rules`)をカバーしています。ID による操作 — `GET`、`PATCH`、`DELETE /rules/{ruleId}` および `POST /rules/{ruleId}/activate|deactivate` — はそうではありません。ルールは既に存在するため、その servicePath は**ルールに格納されているもの**です。

したがって、これらの操作は**2 回**認可されます。


1. パスレベル:リクエストから解決された servicePath に対して(以前と同様)、および
   
2. ルールレベル:ルールがロードされた後、書き込みが行われる前に、データベースから読み取られた `rule.servicePath` に対して。

両方が許可しなければなりません。`servicePath: /secret` で拒否されたプリンシパルは、`Fiware-ServicePath: /open`(または `?servicePath=/open`)を送信することで、`/secret` に格納されたルールを読み取ったり変更したりすることはできなくなりました。#2283 以前は、ID による検索は `ruleId` + `tenantId` のみでフィルタリングされていたため、認可は触れているルールとは何の関係もない servicePath を評価していました。

ルールレベルのチェックは `RuleService` 内にあるため、HTTP API、MCP `config` ツール、および

A2A `config` スキル。`404` の動作は変更されていません。呼び出し元のテナントに存在しないルールは引き続き `404` を返し、存在するが許可されていないルールは `403` を返します。ID による問い合わせ自体は servicePath によって**フィルタされない**ため、クライアントは自分のルールを取得するためにヘッダーを一致させる必要はありません。

> **制限事項 — `servicePath` スコープのポリシーは ID による経路を制約しません。** `GET`/`PATCH`/`DELETE` `/rules/{ruleId}` および有効化/無効化の経路は、`ruleId`(+ テナント)のみでルールを検索します。これらは servicePath によってフィルタされることはありませんが、これらの経路の認証は、*リクエスト*が解決された servicePath に対して評価されます。そのため、`/open` で許可されたプリンシパルは、その `ruleId` を指定することで `/secret` に保存されたルールを読み取ったり削除したりできます。これは上記で修正されたものとは異なる根本原因です。ルールの servicePath は保存された値であり、クライアントが提供したものではないため、これを閉じるにはエンティティレベルの認証(読み込まれたルール自身の `servicePath` に対して評価する)が必要です。これはエンティティに対する `checkEntityOwnership` と同じ形式です。[#2283](https://github.com/geolonia/geonicdb/issues/2283) で追跡されています。

MCP `config` ツールの `rules`/`list` アクションと A2A `config` スキルの `rules`/`list` アクションは同じルールに従います。省略された `servicePath` 引数は、すべての servicePath からルールを返すのではなく、その呼び出しの認証が評価された servicePath をデフォルトとします。

### ルールを取得

```http
GET /rules/:ruleId
Authorization: Bearer <accessToken>
```

**レスポンス**: `200 OK` / `404 Not Found`

### ルールを更新

```http
PATCH /rules/:ruleId
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**リクエストボディ**

```json
{
  "name": "Updated rule name",
  "description": "Updated description",
  "conditions": [...],
  "actions": [...],
  "priority": 5
}
```

**レスポンス**: `204 No Content` / `404 Not Found`

### ルールを削除

```http
DELETE /rules/:ruleId
Authorization: Bearer <accessToken>
```

**レスポンス**: `204 No Content` / `404 Not Found`

### ルールの有効化/無効化

```http
POST /rules/:ruleId/activate
POST /rules/:ruleId/deactivate
Authorization: Bearer <accessToken>
```

**レスポンス**: `200 OK` / `404 Not Found`

***

## 例

### 例 1: 高温アラート

温度が 30 度を超えると、自動的に警告属性を追加します。

```json
{
  "ruleId": "high-temperature-alert",
  "name": "High Temperature Alert",
  "conditions": [
    {
      "type": "entityType",
      "entityTypes": ["TemperatureSensor"]
    },
    {
      "type": "value",
      "attributeName": "temperature",
      "operator": ">",
      "value": 30
    }
  ],
  "actions": [
    {
      "type": "updateAttribute",
      "entityId": "${entity.id}",
      "attributeName": "alert",
      "value": "HIGH_TEMPERATURE"
    },
    {
      "type": "updateAttribute",
      "entityId": "${entity.id}",
      "attributeName": "alertTimestamp",
      "value": "${attribute.temperature.metadata.timestamp.value}"
    }
  ],
  "priority": 10
}
```

### 例 2: 営業時間外の自動ステータス更新

営業時間外(18:00 から 09:00)に、自動的にステータスを「closed」に設定します。

```json
{
  "ruleId": "after-hours-status",
  "name": "After-Hours Status",
  "conditions": [
    {
      "type": "entityType",
      "entityTypes": ["Store"]
    },
    {
      "type": "or",
      "conditions": [
        {
          "type": "time",
          "startTime": "18:00",
          "endTime": "23:59",
          "timezone": "Asia/Tokyo"
        },
        {
          "type": "time",
          "startTime": "00:00",
          "endTime": "09:00",
          "timezone": "Asia/Tokyo"
        }
      ]
    }
  ],
  "actions": [
    {
      "type": "updateAttribute",
      "entityId": "${entity.id}",
      "attributeName": "status",
      "value": "closed"
    }
  ],
  "priority": 5
}
```

### 例 3: 派生エンティティの自動生成

センサーデータから日次サマリーエンティティを自動的に生成します。

```json
{
  "ruleId": "daily-summary",
  "name": "Daily Summary Generation",
  "conditions": [
    {
      "type": "entityType",
      "entityTypes": ["TemperatureSensor"]
    },
    {
      "type": "change",
      "attributeName": "temperature"
    }
  ],
  "actions": [
    {
      "type": "createEntity",
      "entityId": "summary-${entity.id}",
      "entityType": "DailySummary",
      "attributes": {
        "sensorId": "${entity.id}",
        "sensorType": "${entity.type}",
        "currentTemperature": "${attribute.temperature.value}",
        "unit": "${attribute.temperature.metadata.unit.value}",
        "timestamp": "${attribute.temperature.metadata.timestamp.value}"
      }
    }
  ],
  "priority": 20
}
```

### 例 4: 外部 API への Webhook 通知

温度変化を外部モニタリングシステムに通知します。

```json
{
  "ruleId": "external-monitoring",
  "name": "External Monitoring Notification",
  "conditions": [
    {
      "type": "entityType",
      "entityTypes": ["TemperatureSensor"]
    },
    {
      "type": "change",
      "attributeName": "temperature"
    }
  ],
  "actions": [
    {
      "type": "webhook",
      "url": "https://monitoring.example.com/api/sensors/${entity.id}/events",
      "method": "POST",
      "headers": {
        "Authorization": "Bearer YOUR_API_TOKEN",
        "X-Sensor-Type": "${entity.type}"
      },
      "body": {
        "event": "temperature_change",
        "sensorId": "${entity.id}",
        "temperature": "${attribute.temperature.value}",
        "unit": "celsius",
        "timestamp": "${attribute.temperature.metadata.timestamp.value}"
      }
    }
  ],
  "priority": 15
}
```

### 例 5: 複雑な条件 (AND + OR)

温度が 30 度以上で、かつ湿度が 80% 以上、または時刻が 12:00 から 15:00 の間である場合に警告を発します。

```json
{
  "ruleId": "complex-alert",
  "name": "Complex Condition Alert",
  "conditions": [
    {
      "type": "entityType",
      "entityTypes": ["WeatherStation"]
    },
    {
      "type": "value",
      "attributeName": "temperature",
      "operator": ">=",
      "value": 30
    },
    {
      "type": "or",
      "conditions": [
        {
          "type": "value",
          "attributeName": "humidity",
          "operator": ">=",
          "value": 80
        },
        {
          "type": "time",
          "startTime": "12:00",
          "endTime": "15:00",
          "timezone": "Asia/Tokyo"
        }
      ]
    }
  ],
  "actions": [
    {
      "type": "updateAttribute",
      "entityId": "${entity.id}",
      "attributeName": "heatIndexAlert",
      "value": "EXTREME"
    }
  ],
  "priority": 5
}
```

### 例 6: 不快指数による熱中症アラート通知 (CEL 式 + 通知)

温度と湿度から**不快指数**をリアルタイムで評価し、閾値を超えた際にサブスクリプション経由で通知を送信する実用的な例です。

**不快指数の計算式:**

```text
DI = 0.81 × T + 0.01 × H × (0.99 × T − 14.3) + 46.3
```


* T: 温度 (°C)
  
* H: 相対湿度 (%)

**不快指数の参考レベル:**

| Discomfort Index | Perceived sensation                |
| ---------------- | ---------------------------------- |
| \~55             | Cold                               |
| 55\~60           | Chilly                             |
| 60\~65           | No particular sensation            |
| 65\~70           | Comfortable                        |
| 70\~75           | Not hot                            |
| **75\~80**       | **Somewhat hot** ← Alert threshold |
| 80\~85           | Hot with perspiration              |
| 85\~             | Unbearably hot                     |

#### ステップ 1: 通知サブスクリプションを作成する

まず、アラート通知を受信するためのサブスクリプションを作成します。

```bash
# Create an NGSIv2 subscription
curl -X POST "http://localhost:3000/v2/subscriptions" \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{
    "description": "Discomfort index alert notification",
    "subject": {
      "entities": [
        { "idPattern": ".*", "type": "WeatherStation" }
      ],
      "condition": {
        "attrs": ["temperature", "humidity"]
      }
    },
    "notification": {
      "http": {
        "url": "https://alerts.example.com/discomfort-index"
      },
      "attrs": ["temperature", "humidity", "discomfortLevel"]
    }
  }'
```

レスポンスの `Location` ヘッダーからサブスクリプション ID を取得します (例: `urn:ngsi-ld:Subscription:abc123`)。

#### ステップ 2: 不快指数アラートルールを作成する

CEL 式を使用して不快指数を計算し、75 を超えた際にアクションを実行するルールを作成します。

```bash
curl -X POST "http://localhost:3000/rules" \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{
    "ruleId": "discomfort-index-alert",
    "name": "Discomfort Index Alert",
    "description": "Set a warning level and send a notification when the discomfort index exceeds 75",
    "conditions": [
      {
        "type": "entityType",
        "entityTypes": ["WeatherStation"]
      },
      {
        "type": "or",
        "conditions": [
          { "type": "change", "attributeName": "temperature" },
          { "type": "change", "attributeName": "humidity" }
        ]
      },
      {
        "type": "celExpression",
        "expression": "0.81 * attribute.temperature.value + 0.01 * attribute.humidity.value * (0.99 * attribute.temperature.value - 14.3) + 46.3 > 75"
      }
    ],
    "actions": [
      {
        "type": "updateAttribute",
        "entityId": "${entity.id}",
        "attributeName": "discomfortLevel",
        "value": "WARNING"
      },
      {
        "type": "sendNotification",
        "subscriptionId": "urn:ngsi-ld:Subscription:abc123",
        "message": "Discomfort index has exceeded the threshold",
        "notificationData": {
          "alertType": "DISCOMFORT_INDEX",
          "stationId": "${entity.id}",
          "temperature": "${attribute.temperature.value}",
          "humidity": "${attribute.humidity.value}",
          "level": "WARNING"
        }
      }
    ],
    "priority": 10,
    "cooldownSeconds": 600
  }'
```

**このルールの要点:**


* **条件 1 (entityType)**: `WeatherStation` 型のエンティティのみを対象とする
  
* **条件 2 (or + change)**: `temperature` または `humidity` が変化したときのみ評価する(不要な再評価を回避)
  
* **条件 3 (celExpression)**: 不快指数の計算式を直接 CEL で記述し、75 を超えるかチェックする
  
* **アクション 1 (updateAttribute)**: エンティティに `discomfortLevel` 属性を追加する
  
* **アクション 2 (sendNotification)**: サブスクリプション経由でアラート通知を送信する
  
* **cooldownSeconds: 600**: 10 分間のクールダウンにより、過剰な通知配信を防止する

#### ステップ 3: 危険レベル (DI > 80) の Webhook 通知ルールを追加する

不快指数がさらに高い場合に、Webhook 経由で緊急通知を送信する追加のルールを作成します。

```json
{
  "ruleId": "discomfort-index-danger",
  "name": "Discomfort Index Danger Alert",
  "description": "Send an emergency notification when the discomfort index exceeds 80",
  "conditions": [
    {
      "type": "entityType",
      "entityTypes": ["WeatherStation"]
    },
    {
      "type": "celExpression",
      "expression": "0.81 * attribute.temperature.value + 0.01 * attribute.humidity.value * (0.99 * attribute.temperature.value - 14.3) + 46.3 > 80"
    }
  ],
  "actions": [
    {
      "type": "updateAttribute",
      "entityId": "${entity.id}",
      "attributeName": "discomfortLevel",
      "value": "DANGER"
    },
    {
      "type": "webhook",
      "url": "https://api.example.com/emergency/heatstroke-alert",
      "method": "POST",
      "headers": {
        "Content-Type": "application/json",
        "Authorization": "Bearer YOUR_API_TOKEN"
      },
      "body": {
        "severity": "DANGER",
        "stationId": "${entity.id}",
        "stationType": "${entity.type}",
        "temperature": "${attribute.temperature.value}",
        "humidity": "${attribute.humidity.value}",
        "message": "Heat stroke danger level: Temperature ${attribute.temperature.value}°C, Humidity ${attribute.humidity.value}%"
      }
    }
  ],
  "priority": 5,
  "cooldownSeconds": 300
}
```

**注意:** このルールは `priority: 5` であり、Example 6 の `priority: 10` よりも高い優先度です。したがって、DI > 80 の場合、`DANGER` が最初に設定されますが、その後の `WARNING` 更新によって上書きされないよう注意が必要です。同じエンティティに対して両方のルールがマッチした場合、優先度の昇順で実行されるため、順序は `DANGER` → `WARNING` となります。これを回避するには、WARNING ルールの CEL 式に上限条件を追加します:

```json
{
  "type": "celExpression",
  "expression": "0.81 * attribute.temperature.value + 0.01 * attribute.humidity.value * (0.99 * attribute.temperature.value - 14.3) + 46.3 > 75 && 0.81 * attribute.temperature.value + 0.01 * attribute.humidity.value * (0.99 * attribute.temperature.value - 14.3) + 46.3 <= 80"
}
```

#### ステップ 4: 動作を検証する

```bash
# Temperature 27°C, Humidity 75% → Discomfort index ≈ 77.5 (WARNING)
curl -X POST "http://localhost:3000/v2/entities" \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -d '{
    "id": "urn:ngsi-ld:WeatherStation:shibuya-001",
    "type": "WeatherStation",
    "temperature": { "value": 27, "type": "Number" },
    "humidity": { "value": 75, "type": "Number" },
    "location": { "value": "35.6595,139.7004", "type": "Text" }
  }'

# Verify that discomfortLevel was automatically added
curl -s "http://localhost:3000/v2/entities/urn:ngsi-ld:WeatherStation:shibuya-001" \
  -H "Fiware-Service: smartcity" | jq '.discomfortLevel'
# → { "type": "Text", "value": "WARNING", "metadata": {} }

# Update temperature to 33°C → Discomfort index ≈ 86.8 (DANGER)
curl -X PATCH "http://localhost:3000/v2/entities/urn:ngsi-ld:WeatherStation:shibuya-001/attrs" \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -d '{
    "temperature": { "value": 33, "type": "Number" }
  }'

# Verify that discomfortLevel was updated to DANGER
curl -s "http://localhost:3000/v2/entities/urn:ngsi-ld:WeatherStation:shibuya-001" \
  -H "Fiware-Service: smartcity" | jq '.discomfortLevel'
# → { "type": "Text", "value": "DANGER", "metadata": {} }
```

***

## 無限ループの防止

ReactiveCore Rules は、ルールが無限ループに陥ることを防ぐために、複数の保護メカニズムを実装しています。

### 1. Action Entity Type Exclusion (Self-Trigger Prevention)

**制限**: ルールのアクションによって作成されたエンティティタイプは、同じルールのトリガーターゲットから**自動的に除外**されます。

**動作**:

* ルールのアクション(`createEntity`)によって作成されたエンティティタイプを抽出します
  
* 変更イベント内のエンティティタイプがアクションで指定されたタイプと一致する場合、そのルールの実行はブロックされます

**例**:

```json
{
  "ruleId": "sensor-alert-rule",
  "name": "Temperature Sensor Warning",
  "conditions": [
    {
      "type": "entityType",
      "entityTypes": ["TemperatureSensor"]
    },
    {
      "type": "value",
      "attributeName": "temperature",
      "operator": ">",
      "value": 30
    }
  ],
  "actions": [
    {
      "type": "createEntity",
      "entityId": "Alert:${entity.id}",
      "entityType": "Alert",  // ← Creates an Alert entity
      "attributes": {
        "severity": "high"
      }
    }
  ]
}
```

このルール:

* ✅ `TemperatureSensor` エンティティへの変更時に実行されます
  
* ❌ `Alert` エンティティへの変更時には実行されません(自己トリガー防止)

**利点**:

* ルールが作成したエンティティによって再トリガーされることを防ぎます
  
* 意図しない連鎖反応を自動的に防止します
  
* 明示的な条件設定なしでループを回避します

### 2. Execution Counter (Per Entity, Per Time Window)

**制限**: 単一のエンティティに対して、単一のルールは**1分間に最大 10 回**まで実行できます。

```typescript
// Default configuration (src/config/defaults.ts)
RULE_ENGINE.MAX_EXECUTIONS_PER_WINDOW = 10;  // Maximum executions
RULE_ENGINE.EXECUTION_WINDOW_SECONDS = 60;   // Time window (seconds)
```

**動作**:

* ルールごと、エンティティごとに実行回数を追跡します
  
* 時間ウィンドウ内で最大値に達した場合、それ以降の実行をブロックします
  
* カウンターは時間ウィンドウが終了すると自動的にリセットされます

### 3. Loop Detection (Circular Rule Chains)

**制限**: ルール実行チェーンの深さは最大 **5 レベル**に制限されています。

```typescript
// Default configuration (src/config/defaults.ts)
RULE_ENGINE.MAX_CHAIN_DEPTH = 5;
```

**動作**:

* ルール A → エンティティ更新 → ルール B → エンティティ更新 → ルール C のようなチェーンを追跡します
  
* 実行チェーン内で同じルールが 2 回出現した場合(循環)、実行はブロックされます
  
* チェーンの深さが最大値を超えた場合、実行はブロックされます

**例**:

```text
Rule A (temperature sensor) → creates Alert entity
  → Rule B (Alert) → creates notification entity
    → Rule C (notification) → creates log entity
      → Rule D (log) → ... (OK: up to depth 5)
        → Rule E (Alert) → triggers Rule B (NG: circular detected)
```

### 4. Cooldown Period

各ルールに対して**最小実行間隔**を設定できます。

```json
{
  "ruleId": "temperature-alert",
  "name": "Temperature Alert",
  "conditions": [ ... ],
  "actions": [ ... ],
  "cooldownSeconds": 300  // 5-minute cooldown
}
```

**デフォルト値**: `cooldownSeconds` が指定されていない場合、デフォルトのクールダウンとして **60 秒**が適用されます。

```typescript
// Default configuration (src/config/defaults.ts)
RULE_ENGINE.DEFAULT_COOLDOWN_SECONDS = 60;
```

**動作**:

* ルールごとにエンティティごとの最終実行時刻を追跡
  
* クールダウン期間内の場合は実行をブロック
  
* クールダウン期間が経過すると再び実行可能になる

**ユースケース**:

* 頻繁に変化するセンサーデータのアラート通知の制御
  
* 過剰な Webhook 呼び出しの防止
  
* 外部システムへの負荷の軽減

> **アクションの結果に関わらずクールダウンは消費される (#1606)**: クールダウン/実行ウィンドウのカウンターは、ルールが実行対象として選択されるとすぐに、つまりアクションが実行される*前に*更新されます (`trackExecution()`)。ルール内のすべてのアクションが失敗し続ける場合(例: 誤って設定された `entityId` テンプレート、または存在しないクロスプロトコルターゲット)でも、ルールはマッチするイベントごとにクールダウンを消費します — 実際には何も起こらなかったからといって、より早く再試行されることはありません。現在のところ、実行履歴(発火ごとの成功/失敗)をクエリ可能な形式では保持していません。何度も何度も静かに失敗しているルールを検出するには、構造化ログフィールドの `metric: 'RuleActionFailure'` / `metric: 'RuleExecutionFailure'` を使用してください(以下の「アクション実行エラー」を参照)。クエリ可能な履歴は #1606 のフォローアップとして追跡されています。

### ループ防止のベストプラクティス


1. **エンティティタイプを明確に区別する**: アクションエンティティタイプ除外機能が自動的に適用されます

   ```json
   // Rule 1: Sensor → creates Alert entity
   {
     "conditions": [{"type": "entityType", "entityTypes": ["Sensor"]}],
     "actions": [{"type": "createEntity", "entityType": "Alert", ...}]
   }
   // Changes to Alert entities will not trigger this rule (automatically excluded)
   ```

2\. **変更条件を使用する**: 属性が実際に変更された場合にのみトリガーする

```json
{
  "type": "change",
  "attributeName": "temperature"
}
```

3\. **cooldownSeconds を設定する**: 高頻度の実行が予想される場合は、適切なクールダウンを設定する

```json
{
  "cooldownSeconds": 300  // 5 minutes
}
```

4\. **ルールの優先度を適切に設定する**: 意図しない連鎖を防ぐために実行順序を制御する

***

## 制限事項

### 現在の制限事項


1. **トランザクション非対応**: 複数のアクション実行中にエラーが発生しても、ロールバックは実行されません
   
2. **条件評価のパフォーマンス**: ルール数が多い場合、評価に時間がかかる可能性があります
   
3. **テンプレート変数の型チェック非対応**: 実行時エラーが発生する可能性があります

### パフォーマンスに関する考慮事項


* ルール数が多い場合、エンティティ変更ごとの処理時間が増加します
  
* 不要なルールを無効化してください(`isActive: false`)
  
* 実行順序を最適化するために優先度を適切に設定してください
  
* 高頻度で変更されるエンティティに対してルールを設定する際は注意が必要です
  
* **ループ防止**: 無限ループは、アクションエンティティタイプ除外、実行カウンター、ループ検出、クールダウン期間のメカニズムにより自動的に防止されます

***

## トラブルシューティング

### ルールが実行されない

**チェックリスト**:


1. `RULES_ENABLED=true` が設定されていますか?
   
2. ルールが有効になっていますか(`isActive: true`)?
   
3. 条件が正しく一致していますか(特にエンティティタイプ)?
   
4. servicePath は一致していますか?
   
5. Change Stream Handler は動作していますか?

**デバッグ**:

ログを確認してください。

```bash
# Search for RuleEngineService logs
grep "RuleEngineService" /var/log/lambda.log
```

### テンプレート変数が展開されない

**チェックリスト**:


1. 変数パスは正しいですか(例: `${entity.id}`、`${attribute.temperature.value}`)?
   
2. 参照されている属性は存在しますか?
   
3. 大文字と小文字の違いに注意してください

**例**:


* ❌ `${Entity.ID}` → ✅ `${entity.id}`
  
* ❌ `${temperature.value}` → ✅ `${attribute.temperature.value}`

### Webhook の失敗

**チェックリスト**:


1. URL は正しいですか?
   
2. 外部 API に到達可能ですか(ネットワーク、ファイアウォール)?
   
3. Authorization ヘッダーは正しいですか?
   
4. Content-Type は正しいですか?
   
5. リクエストボディの形式は正しいですか?

**デバッグ**:

エラーメッセージについてログを確認してください。

```bash
# Search for Webhook errors
grep "Webhook execution failed" /var/log/lambda.log
```

### 無限ループ

ルールのアクションが別のルールの条件に一致し、無限ループを引き起こす可能性があります。

**対策**:


1. ルール条件を慎重に設計する
   
2. `change` 条件を使用して、特定の属性変更のみでトリガーする
   
3. エンティティタイプを分離する(例:派生エンティティには異なるタイプを使用)

### アクション実行エラー

**チェックリスト**:


1. エンティティ ID は存在するか(updateAttribute、deleteAttribute の場合)?
   
2. 属性名は正しいか?
   
3. 値の型は正しいか(例:数値属性に文字列値を設定していないか)?
   
4. テナントと servicePath は正しいか? NGSI-LD をターゲットとするクロスプロトコル `updateAttribute`/`deleteAttribute` の場合、アクションが明示的にオーバーライドしない限り、ターゲット `servicePath` は `'/'` に強制されることに注意してください(#1605/#1606)— 上記の「クロスプロトコルエンティティ作成」を参照してください。

**可観測性(#1606)**: アクション/ルール実行の失敗は構造化されたエラーとしてログに記録されます(暗黙的に無視されません)— 1 つのアクションの失敗は他のアクション/ルールの実行を停止しませんが、各失敗は以下の情報とともにログに記録されます:


* `logger.error('Failed to execute action', { ruleId, actionType, entityId, error, metric: 'RuleActionFailure' })` — アクションごとの失敗(例:不正な `servicePath` 解決による `NotFoundError`)。ここでの `entityId` は*生の*、テンプレート展開されていないアクション定義値です。解決された entityId とターゲット `servicePath`/`protocol` は、`executeUpdateAttributeAction`/`executeDeleteAttributeAction` 内から別途ログに記録されます(`logger.info('Updating entity
  attribute', ...)` / `logger.info('Deleting entity attribute', ...)`)。これは変更呼び出しの直前に行われます。
  
* `logger.error('Failed to execute rule actions', { ruleId, error, metric: 'RuleExecutionFailure' })` — ルールレベルの失敗(例:アクションごとの try/catch の外側での予期しない例外)。

失敗しているルールを見つけるには、ログで `metric: "RuleActionFailure"` または `metric: "RuleExecutionFailure"` を検索してください。専用のルール実行履歴コレクション/API はまだありません — これはログベースの可観測性のみです。

***

## 技術仕様(GeonicDB ルール仕様 v1.0)

**ステータス**: ドラフト
**バージョン**: 1.0.0
**最終更新日**: 2026-02-10
**著者**: GeonicDB 開発チーム

### 概要

このドキュメントは、NGSI ベースのコンテキストブローカーにおけるエンティティ変更を処理するための GeonicDB Rule Engine フォーマットを規定します。この仕様は、IoT およびスマートシティアプリケーション向けに最適化された、Event-Condition-Action(ECA)パターンに従った JSON ベースのルールフォーマットを定義します。

### 1. はじめに

#### 1.1 目的

GeonicDB Rule Engine は、FIWARE 互換のコンテキストブローカーにおけるエンティティ変更の自動処理を可能にします。ルールは、エンティティが作成、更新、または削除されたときにアクションをトリガーする条件を定義します。

#### 1.2 設計原則


* **JSON フォーマット**: すべてのルールは標準 JSON を使用して定義されます
  
* **ECA パターン**: リアクティブ処理のための Event-Condition-Action アーキテクチャ
  
* **NGSI 対応**: NGSI エンティティ属性とメタデータのネイティブサポート
  
* **組み合わせ可能**: 任意のネストが可能な論理演算子(AND、OR、NOT)をサポートする条件
  
* **型安全**: 条件とアクションの判別共用体型
  
* **テンプレート駆動**: `${...}` 構文を使用した動的な値置換

#### 1.3 用語


* **ルール**: 条件とアクションで構成される完全な定義
  
* **条件**: エンティティに対して真または偽に評価される述語
  
* **アクション**: すべてのルール条件が満たされたときに実行される操作
  
* **エンティティ変更イベント**: エンティティの作成、更新、または削除の通知
  
* **テンプレート変数**: ランタイムエンティティ値に解決されるプレースホルダー

### 2. Conformance

#### 2.1 適合性レベル

実装は、REQUIRED としてマークされたすべての機能を実装している場合、**適合**しています。

OPTIONAL としてマークされた機能は、実装者の裁量で実装することができます (MAY)。

#### 2.2 必須機能

適合実装は次を満たさなければなりません (MUST):


1. セクション 4 で定義されたすべての条件タイプをサポートする
   
2. セクション 5 で定義されたすべてのアクションタイプをサポートする
   
3. セクション 6 で定義されたテンプレート変数の置換をサポートする
   
4. セクション 7 で定義されたループ防止メカニズムを実装する
   
5. ネストされた論理演算子に対して条件を再帰的に評価する
   
6. 指定された順序でアクションを順次実行する
   
7. セクション 8 の JSON Schema に対してルールを検証する

#### 2.3 オプション機能

適合実装は次を行うことができます (MAY):


1. 追加のカスタム条件タイプをサポートする
   
2. 追加のカスタムアクションタイプをサポートする
   
3. 拡張テンプレート変数パスを提供する
   
4. カスタムループ防止戦略を実装する

### 3. JSON Schema

GeonicDB Rule Specification v1.0 の完全な JSON Schema は仕様ドキュメントで利用可能です。すべてのルールはこのスキーマに対して検証されなければなりません (MUST)。

主要な検証ルール:

* `ruleId`、`name`、`tenantId`、`servicePath`、`conditions`、`actions`、`isActive`、および `priority` は REQUIRED フィールドです
  
* `conditions` 配列は少なくとも 1 つの条件を含まなければなりません (MUST)
  
* `actions` 配列は少なくとも 1 つのアクションを含まなければなりません (MUST)
  
* `cooldownSeconds` は、指定された場合、正の整数でなければなりません (MUST)
  
* `servicePath` は `/` で始まらなければなりません (MUST)

完全な JSON Schema 定義については、正式な仕様ドキュメントのセクション 8 を参照してください。

### 4. Versioning

#### 4.1 バージョン形式

この仕様は Semantic Versioning 2.0.0 (<https://semver.org/>) に従います:


* **MAJOR**: 互換性のない変更 (例: 条件/アクションタイプの削除)
  
* **MINOR**: 後方互換性のある追加 (例: 新しい条件/アクションタイプ)
  
* **PATCH**: 後方互換性のある修正 (例: 明確化、誤字修正)

現在のバージョン: **1.0.0**

#### 4.2 互換性

ルールは、`specVersion` フィールドを使用して準拠する仕様バージョンを宣言することができます (MAY):

```json
{
  "specVersion": "1.0.0",
  "ruleId": "...",
  ...
}
```

#### 4.3 非推奨ポリシー

機能が非推奨になった場合:

1. 機能はドキュメントで DEPRECATED としてマークされます
   
2. 機能は少なくとも 1 つの MAJOR バージョンの間、機能し続けます
   
3. 非推奨の警告はログに記録されるべきです (SHOULD)
   
4. 移行ガイドが提供されなければなりません (MUST)

### 参考文献


* **FIWARE NGSI-v2 Specification**: <https://fiware.github.io/specifications/ngsiv2/stable/>
  
* **FIWARE NGSI-LD Specification**: <https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/>
  
* **JSON Schema Draft 7**: <http://json-schema.org/draft-07/schema#>
  
* **Semantic Versioning 2.0.0**: <https://semver.org/>
  
* **IANA Time Zone Database**: <https://www.iana.org/time-zones>
  
* **ECMAScript Regular Expressions**: <https://tc39.es/ecma262/#sec-regexp-regular-expression-objects>

### 謝辞

本仕様は、Geolonia Inc. の GeonicDB チームによって開発されました。以下からインスピレーションを得ています。

* FIWARE Complex Event Processing (Proton CEP)
  
* json-rules-engine (CacheControl)
  
* AWS EventBridge Rules
  
* Common Expression Language (CEL)

**License**: GNU Affero General Public License v3.0 (AGPL-3.0)
**Copyright**: © 2026 Geolonia Inc.

***

## 関連ドキュメント


* [API Common Specification](../api-reference/endpoints.md) - 一般的な API 仕様
  
* [Authentication & Authorization](../reference/auth.md) - 管理 API と認証要件の詳細
  
* [API Specification](../api-reference/endpoints.md) - 全エンドポイントのリスト
  
* Development Guide - HTTP ステータスコードの詳細
