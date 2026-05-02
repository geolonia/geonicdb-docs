---
title: 最初の API 呼び出し
description: curl・JavaScript・Python で GeonicDB API に最初のリクエストを送る — エンティティ作成からクエリ・通知設定まで。
outline: deep
---

# 最初の API 呼び出し

このページでは、`curl`・JavaScript・Python を使って GeonicDB SaaS API に最初のリクエストを送る方法を説明します。

::: info 前提条件
- GeonicDB SaaS アカウントと API キー（[サインアップ](/ja/saas/sign-up)）
- `curl`（または Node.js / Python）がインストールされていること

**API URL**: `https://geonicdb.geolonia.com` — 現在のプレビュー期間中に変更される場合があります。変更がある場合はアカウント担当者からご連絡いたします。
:::

## 環境変数の設定

サンプルを実行する前に、認証情報を環境変数にエクスポートします：

```bash
export GEONICDB_API_KEY="YOUR_API_KEY"
export GEONICDB_TENANT="YOUR_TENANT"
export GEONICDB_BASE_URL="https://geonicdb.geolonia.com"
```

## 1. エンティティを作成する

温度センサーエンティティを作成します：

::: code-group

```bash [curl]
curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$GEONICDB_BASE_URL/v2/entities" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $GEONICDB_API_KEY" \
  -H "Fiware-Service: $GEONICDB_TENANT" \
  -d '{
    "id": "urn:ngsi-ld:Sensor:temp-001",
    "type": "Sensor",
    "temperature": {
      "type": "Number",
      "value": 22.5
    },
    "location": {
      "type": "geo:json",
      "value": {
        "type": "Point",
        "coordinates": [139.6917, 35.6895]
      }
    }
  }'
# 期待値: 201
```

```js [JavaScript]
const BASE_URL = process.env.GEONICDB_BASE_URL;
const API_KEY  = process.env.GEONICDB_API_KEY;
const TENANT   = process.env.GEONICDB_TENANT;

const res = await fetch(`${BASE_URL}/v2/entities`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': API_KEY,
    'Fiware-Service': TENANT,
  },
  body: JSON.stringify({
    id: 'urn:ngsi-ld:Sensor:temp-001',
    type: 'Sensor',
    temperature: { type: 'Number', value: 22.5 },
    location: {
      type: 'geo:json',
      value: { type: 'Point', coordinates: [139.6917, 35.6895] },
    },
  }),
});
console.log(res.status); // 201
```

```python [Python]
import os, requests

BASE_URL = os.environ["GEONICDB_BASE_URL"]
API_KEY  = os.environ["GEONICDB_API_KEY"]
TENANT   = os.environ["GEONICDB_TENANT"]

headers = {
    "Content-Type": "application/json",
    "x-api-key": API_KEY,
    "Fiware-Service": TENANT,
}
entity = {
    "id": "urn:ngsi-ld:Sensor:temp-001",
    "type": "Sensor",
    "temperature": {"type": "Number", "value": 22.5},
    "location": {
        "type": "geo:json",
        "value": {"type": "Point", "coordinates": [139.6917, 35.6895]},
    },
}
r = requests.post(f"{BASE_URL}/v2/entities", json=entity, headers=headers)
print(r.status_code)  # 201
```

:::

**201 Created** が返れば、エンティティが正常に保存されました。

## 2. エンティティを取得する

作成したエンティティを取得します：

::: code-group

```bash [curl]
curl -s "$GEONICDB_BASE_URL/v2/entities/urn:ngsi-ld:Sensor:temp-001" \
  -H "x-api-key: $GEONICDB_API_KEY" \
  -H "Fiware-Service: $GEONICDB_TENANT" | jq .
```

```js [JavaScript]
const res = await fetch(
  `${BASE_URL}/v2/entities/urn:ngsi-ld:Sensor:temp-001`,
  { headers: { 'x-api-key': API_KEY, 'Fiware-Service': TENANT } }
);
console.log(await res.json());
```

```python [Python]
r = requests.get(
    f"{BASE_URL}/v2/entities/urn:ngsi-ld:Sensor:temp-001",
    headers=headers,
)
print(r.json())
```

:::

レスポンス例：

```json
{
  "id": "urn:ngsi-ld:Sensor:temp-001",
  "type": "Sensor",
  "temperature": {
    "type": "Number",
    "value": 22.5,
    "metadata": {}
  },
  "location": {
    "type": "geo:json",
    "value": { "type": "Point", "coordinates": [139.6917, 35.6895] },
    "metadata": {}
  }
}
```

## 3. 属性を更新する

温度の値を更新します：

```bash
curl -X PATCH "$GEONICDB_BASE_URL/v2/entities/urn:ngsi-ld:Sensor:temp-001/attrs" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $GEONICDB_API_KEY" \
  -H "Fiware-Service: $GEONICDB_TENANT" \
  -d '{ "temperature": { "type": "Number", "value": 28.0 } }'
# 期待値: 204 No Content
```

## 4. エンティティ一覧を取得する

```bash
curl -s "$GEONICDB_BASE_URL/v2/entities?type=Sensor&options=keyValues" \
  -H "x-api-key: $GEONICDB_API_KEY" \
  -H "Fiware-Service: $GEONICDB_TENANT" | jq .
```

`options=keyValues` パラメーターを使うと、メタデータなしのシンプルな形式で返ります：

```json
[
  {
    "id": "urn:ngsi-ld:Sensor:temp-001",
    "type": "Sensor",
    "temperature": 28.0,
    "location": { "type": "Point", "coordinates": [139.6917, 35.6895] }
  }
]
```

## 5. 変更通知を設定する

温度が 25°C を超えたときに Webhook 通知を受け取るように設定します：

```bash
curl -X POST "$GEONICDB_BASE_URL/v2/subscriptions" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $GEONICDB_API_KEY" \
  -H "Fiware-Service: $GEONICDB_TENANT" \
  -d '{
    "description": "高温アラート",
    "subject": {
      "entities": [{ "idPattern": ".*", "type": "Sensor" }],
      "condition": {
        "attrs": ["temperature"],
        "expression": { "q": "temperature>25" }
      }
    },
    "notification": {
      "http": { "url": "https://your-webhook.example.com/alerts" },
      "attrs": ["temperature", "location"]
    }
  }'
# 期待値: 201 Created
```

## 次のステップ

- [最初のエンティティ](/ja/saas/first-entity) — バッチ操作や通知設定を含む完全な CRUD ガイド
- [API リファレンス](/ja/api-reference/ngsiv2) — NGSIv2 API の全ドキュメント
- [クエリ言語](/ja/core-concepts/query-language) — `q`・`mq`・`georel` を使った高度なフィルタリング
- [コンソール](/ja/saas/console) — 管理コンソールの概要（Coming Soon）
