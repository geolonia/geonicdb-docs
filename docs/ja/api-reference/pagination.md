---
title: ページネーション
description: GeonicDB API のページネーション仕様 — limit/offset パラメータ、トータルカウントヘッダー、Link ヘッダーの解説。
outline: deep
---

# ページネーション

GeonicDB のすべてのリストエンドポイントは、`limit` と `offset` クエリパラメータによるページネーションをサポートしています。

## パラメータ

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `limit` | integer | 返す項目の最大数 |
| `offset` | integer | スキップする項目数（0 始まり） |

## デフォルトと上限

### NGSIv2 / NGSI-LD / Catalog API

| 設定 | 値 | 備考 |
|------|-----|------|
| デフォルト limit | 20 | FIWARE Orion 互換 |
| デフォルト offset | 0 | |
| 最大 limit | 1000 | FIWARE Orion 互換 |

### Admin API

| 設定 | 値 | 備考 |
|------|-----|------|
| デフォルト limit | 20 | |
| デフォルト offset | 0 | |
| 最大 limit | 100 | 管理エンドポイント用の低い上限 |

## トータルカウントヘッダー

マッチする項目の合計数は、API 固有のレスポンスヘッダーで返されます：

| API | ヘッダー | タイミング |
|-----|---------|----------|
| NGSIv2 | `Fiware-Total-Count` | `options=count` 指定時に返される |
| NGSI-LD | `NGSILD-Results-Count` | 常に返される |
| Admin API | `X-Total-Count` | 常に返される |
| Catalog API | `X-Total-Count` | 常に返される |
| Vector Tiles (GeoJSON) | `X-Total-Count` | 常に返される |

## Link ヘッダー（RFC 8288）

すべてのページネーション対応エンドポイントは、[RFC 8288](https://www.rfc-editor.org/rfc/rfc8288) 準拠の `Link` ヘッダーをナビゲーション用に返します：

| リレーション | 条件 | 説明 |
|-----------|------|------|
| `next` | `offset + limit < total` | 次のページの URL |
| `prev` | `offset > 0` | 前のページの URL |

```text
Link: <https://api.geonicdb.geolonia.com/v2/entities?limit=10&offset=20>; rel="next",
      <https://api.geonicdb.geolonia.com/v2/entities?limit=10&offset=0>; rel="prev"
```

- 結果が単一ページに収まる場合、`Link` ヘッダーは返されません。
- 既存のクエリパラメータ（`type`、`q` 等）は Link URL に保持されます。
- `prev` の offset は 0 にクランプされます（負の値にはなりません）。

## 使用例

### 基本的なページネーション

```bash
# 最初の 10 件
curl "https://api.geonicdb.geolonia.com/v2/entities?limit=10&offset=0" \
  -H "Fiware-Service: demo"

# 次の 10 件
curl "https://api.geonicdb.geolonia.com/v2/entities?limit=10&offset=10" \
  -H "Fiware-Service: demo"
```

### NGSIv2 でトータルカウントを取得

```bash
curl "https://api.geonicdb.geolonia.com/v2/entities?limit=10&options=count" \
  -H "Fiware-Service: demo"

# レスポンスヘッダー:
# Fiware-Total-Count: 150
```

### NGSI-LD のページネーション

```bash
curl "https://api.geonicdb.geolonia.com/ngsi-ld/v1/entities?limit=10&offset=0" \
  -H "Fiware-Service: demo"

# レスポンスヘッダー:
# NGSILD-Results-Count: 150
```

### Admin API のページネーション

```bash
curl "https://api.geonicdb.geolonia.com/admin/users?limit=50&offset=0" \
  -H "Authorization: Bearer YOUR_API_KEY"

# レスポンスヘッダー:
# X-Total-Count: 75
```

### 全結果の取得

```javascript
async function fetchAllEntities(baseUrl, tenant) {
  const limit = 1000;
  let offset = 0;
  let allEntities = [];
  let total = Infinity;

  while (offset < total) {
    const response = await fetch(
      `${baseUrl}/v2/entities?limit=${limit}&offset=${offset}&options=count`,
      { headers: { 'Fiware-Service': tenant } }
    );

    total = parseInt(response.headers.get('Fiware-Total-Count'), 10);
    const entities = await response.json();
    allEntities = allEntities.concat(entities);
    offset += limit;
  }

  return allEntities;
}
```

## ページネーション対応エンドポイント

### NGSIv2

| エンドポイント | 最大 Limit | カウントヘッダー |
|-------------|-----------|--------------|
| `GET /v2/entities` | 1000 | `Fiware-Total-Count` |
| `GET /v2/types` | 1000 | `Fiware-Total-Count` |
| `GET /v2/subscriptions` | 1000 | `Fiware-Total-Count` |
| `GET /v2/registrations` | 1000 | `Fiware-Total-Count` |
| `POST /v2/op/query` | 1000 | `Fiware-Total-Count` |
| `GET /v2/tiles/{z}/{x}/{y}.geojson` | 1000 | `X-Total-Count` |

### NGSI-LD

| エンドポイント | 最大 Limit | カウントヘッダー |
|-------------|-----------|--------------|
| `GET /ngsi-ld/v1/entities` | 1000 | `NGSILD-Results-Count` |
| `GET /ngsi-ld/v1/types` | 1000 | `NGSILD-Results-Count` |
| `GET /ngsi-ld/v1/attributes` | 1000 | `NGSILD-Results-Count` |
| `GET /ngsi-ld/v1/subscriptions` | 1000 | `NGSILD-Results-Count` |
| `GET /ngsi-ld/v1/csourceRegistrations` | 1000 | `NGSILD-Results-Count` |
| `GET /ngsi-ld/v1/csourceSubscriptions` | 1000 | `NGSILD-Results-Count` |
| `GET /ngsi-ld/v1/jsonldContexts` | 1000 | `NGSILD-Results-Count` |
| `POST /ngsi-ld/v1/entityOperations/query` | 1000 | `NGSILD-Results-Count` |
| `GET /ngsi-ld/v1/temporal/entities` | 1000 | `NGSILD-Results-Count` |
| `GET /ngsi-ld/v1/snapshots` | 1000 | `NGSILD-Results-Count` |
| `GET /ngsi-ld/v1/tiles/{z}/{x}/{y}.geojson` | 1000 | `X-Total-Count` |

### Admin API

| エンドポイント | 最大 Limit | カウントヘッダー |
|-------------|-----------|--------------|
| `GET /admin/users` | 100 | `X-Total-Count` |
| `GET /admin/tenants` | 100 | `X-Total-Count` |
| `GET /admin/policies` | 100 | `X-Total-Count` |
| `GET /admin/policy-sets` | 100 | `X-Total-Count` |
| `GET /admin/oauth-clients` | 100 | `X-Total-Count` |

### Catalog API

| エンドポイント | 最大 Limit | カウントヘッダー |
|-------------|-----------|--------------|
| `GET /catalog/datasets` | 1000 | `X-Total-Count` |
| `GET /catalog/ckan/package_list` | 1000 | `X-Total-Count` |
| `GET /catalog/ckan/current_package_list_with_resources` | 1000 | `X-Total-Count` |

## バリデーションエラー

不正なページネーションパラメータは `400 Bad Request` を返します：

| 条件 | エラーメッセージ |
|------|---------------|
| 非整数の limit | `limit must be a valid integer` |
| 負の limit | `limit must not be negative` |
| ゼロの limit | `limit must be greater than 0` |
| 最大値超過 | `limit exceeds maximum allowed value of {max}` |
| 非整数の offset | `offset must be a valid integer` |
| 負の offset | `offset must not be negative` |

::: tip
`offset` がトータルカウントを超えた場合、空の配列が返されます — これはエラーではありません。
:::

## 次のステップ

- [エンドポイント](/ja/api-reference/endpoints) — 完全なエンドポイントリファレンス
- [ステータスコード](/ja/api-reference/status-codes) — HTTP ステータスコードとエラーフォーマット
