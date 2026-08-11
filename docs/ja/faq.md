---
title: "FAQ"
description: "Frequently asked questions"
outline: deep
---
# よくある質問 (FAQ)

GeonicDB についてのよくある質問と回答のコレクションです。

## 目次


* [データ量とパフォーマンス](#データ量とパフォーマンス)
  
* [FIWARE Orion との違い](#fiware-orion-との違い)
  
* [デプロイと運用](#デプロイと運用)
  
* [API の使い方](#api-の使い方)
  
* [地理空間拡張](#geospatial-extensions)
  
* [セキュリティ](#セキュリティ)

***

## データ量とパフォーマンス

### Q: データ量の上限はありますか？

**A:** GeonicDB 自体には明示的なデータ量の上限はありません。MongoDB のスケーリング機能に依存します。

#### ハード制限（システム制約）

| Constraint                         | Value      | Description                                                                                                   |
| ---------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------- |
| Maximum items per request          | 1,000      | `limit` upper bound for pagination (FIWARE Orion compatible)                                                  |
| Admin API maximum items            | 100        | Pagination upper bound for admin APIs                                                                         |
| Query execution time (read)        | 3 seconds  | Interactive reads (entity list/query/geo/get). Exceeding it cancels the query and returns `503`               |
| Query execution time (aggregation) | 5 seconds  | Aggregations (temporal rollups, `distinct`/`distinctCount`). Exceeding it cancels the query and returns `503` |
| API Gateway timeout                | 29 seconds | AWS-side limit                                                                                                |
| Lambda timeout                     | 15 minutes | For Lambda functions such as batch processing                                                                 |

> **クエリタイムアウト時の `503` について:** 上記の制限を超えて実行されるクエリ（ほぼ常に、スキャンするエンティティが多すぎることが原因）は、サービスを保護するためにサーバー側でキャンセルされ、API は `503 ServiceUnavailable` とクエリを絞り込むよう求めるメッセージで応答します。`type` または `id` フィルタを追加するか、より小さい `limit`/`lastN` を使用するか、地理的エリアや時間範囲を制限してから再試行してください。どのパターンが遅くなりがちかについては、以下の *「注意が必要なクエリ（潜在的に遅い）」* を参照してください。

#### 本番環境での実用的なガイドライン

| Data Scale               | Recommended Environment                        |
| ------------------------ | ---------------------------------------------- |
| Up to 100,000 entities   | MongoDB Atlas M10–M30                          |
| Up to 1,000,000 entities | MongoDB Atlas M30–M50                          |
| Over 1,000,000 entities  | MongoDB Atlas M50+ with sharding consideration |

### Q: クエリが遅くなるケースはありますか？

**A:** 以下のケースではクエリのパフォーマンスが低下する可能性があります。

#### インデックスを活用するクエリ（高速）


* エンティティ ID による検索
  
* エンティティタイプによるフィルタリング
  
* 地理クエリ（`georel`、`geometry`、`coordinates`）
  
* 最終更新日時（`modifiedAt`）による並べ替え
  
* `observedAt` による時系列データ検索

#### 注意が必要なクエリ（潜在的に遅い）

| Query Pattern                            | Reason                    | Mitigation                       |
| ---------------------------------------- | ------------------------- | -------------------------------- |
| Partial match search on attribute values | Indexes are not effective | Use exact matches where possible |
| Complex combinations of `q` filters      | May result in full scan   | Narrow down filter conditions    |
| Wide-range Geo searches                  | Too many candidates       | Limit the search area            |
| Retrieving all records without `limit`   | High memory consumption   | Always use pagination            |

### Q: 時系列（Temporal）データで注意すべきことは何ですか？

**A:** Entity API の書き込みは、Temporal データに履歴レコードを自動的に追加**しません**。履歴を記録するには、以下のいずれかを使用してください：


1. Temporal API に明示的に書き込む（`POST /ngsi-ld/v1/temporal/entities`、temporal バッチエンドポイント）。MCP および A2A temporal ツールは同じ Temporal サービスを呼び出します。
   
2. `appendToTemporal` アクションを持つ ReactiveCore ルールを設定し、一致するエンティティの変更が Temporal 履歴に追加されるようにする（[REACTIVCORE\_RULES.md](./features/reactivcore-rules.md)）。

この Entity API / Temporal API の分離は意図的なものです（[#344](https://github.com/geolonia/geonicdb/issues/344) を参照）：暗黙的な副作用を回避し、現在の状態の書き込みと履歴管理を別々の責務として保ち、Entity API の標準的な動作を変更しないままにします（自動追加を追加すると、標準的な Entity API の書き込みの動作が変わります）。これは GeonicDB の設計上の決定です — ETSI GS CIM 009 はContext Brokerに自動記録のスキップを要求していません。運用上の副作用として、これはデフォルトですべてのエンティティ更新による無制限の履歴増加も防ぎます。

時系列データ量は、エンティティ数 × 属性数 × 時間間隔によって急速に増加するため、保持期間と容量を明示的に計画してください。

#### 推奨設定

```bash
# Configure automatic deletion of old data (TTL)
# expireAfterSeconds can be set in MongoDB Atlas collection settings
```

#### データ量の見積もり例

```text
1,000 entities x 10 attributes x 1-minute interval x 24 hours x 30 days
= approximately 430 million records/month
```

大量の時系列データを扱う場合は、専用の時系列データベース（TimescaleDB、InfluxDB）との統合を検討してください。

***

## FIWARE Orion との違い

### Q: FIWARE Orion との互換性はどうなっていますか?

**A:** NGSIv2 API は高い互換性があります。GeonicDB 側のカバー範囲は以下の通りです。特定の Orion バージョンがサポートする内容については、[公式 FIWARE Orion ドキュメント](https://fiware-orion.readthedocs.io/)を参照してください。

#### 互換性のある機能


* NGSIv2 エンティティ CRUD 操作
  
* サブスクリプション(通知)
  
* 地理空間クエリ
  
* バッチ操作
  
* レジストレーション(Context Provider)

#### GeonicDB 独自の機能


* NGSI-LD API サポート
  
* JWT 認証・認可
  
* マルチテナンシー
  
* AI ツール連携(MCP)
  
* スナップショット機能

### Q: Orion から移行できますか?

**A:** 基本的なエンティティデータは移行可能です。

```bash
# Export entities from Orion
curl -X GET "http://orion:1026/v2/entities?limit=1000" \
  -H "Fiware-Service: myservice" > entities.json

# Import into GeonicDB
curl -X POST "https://api.example.com/v2/op/update" \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: myservice" \
  -d '{"actionType": "append", "entities": '"$(cat entities.json)"'}'
```

***

## デプロイと運用

### Q: どこにデプロイできますか?

**A:** 以下の環境で動作します。

| Environment              | Description                                         |
| ------------------------ | --------------------------------------------------- |
| AWS Lambda + API Gateway | Recommended. Serverless with automatic scaling      |
| Local (`npm start`)      | For development and testing. Uses in-memory MongoDB |
| Docker                   | Can run in any container environment                |

### Q: どの MongoDB を使用すればよいですか?

**A:** 以下のいずれかを推奨します。

| Service             | Features                                      |
| ------------------- | --------------------------------------------- |
| MongoDB Atlas       | Recommended. Fully managed, automatic scaling |
| Self-hosted MongoDB | Full control, but high operational overhead   |

> **注**: MongoDB 8.0 以上が必要です(Time Series Collection サポートのため)。Amazon DocumentDB は Time Series Collection をサポートしていないため、使用できません。

### Q: 想定されるコストはどのくらいですか?

**A:** サーバーレスアーキテクチャのため、使用した分だけ課金されます。

| Component           | Small scale (100,000 requests/month) | Medium scale (1,000,000 requests/month) |
| ------------------- | ------------------------------------ | --------------------------------------- |
| Lambda              | \~$5                                 | \~$20                                   |
| API Gateway         | \~$4                                 | \~$35                                   |
| MongoDB Atlas (M10) | \~$60                                | \~$60                                   |
| **Total**           | **\~$70/month**                      | **\~$115/month**                        |


* 実際のコストは、リージョン、データ量、リクエストパターンによって異なります。

***

## API の使い方

### Q: NGSIv2 と NGSI-LD のどちらを使うべきですか?

**A:** ユースケースに基づいて選択してください。

| Perspective           | NGSIv2                                           | NGSI-LD                                                                                                                                        |
| --------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Learning curve        | Low                                              | Somewhat high (requires understanding of JSON-LD)                                                                                              |
| FIWARE ecosystem      | Many tools available                             | Number of compatible tools is growing                                                                                                          |
| Time-series data      | Not supported (requires separate implementation) | Standard support via Temporal API (explicit Temporal writes or `appendToTemporal` rules are required; Entity API writes are not auto-recorded) |
| Data interoperability | Limited                                          | High via JSON-LD                                                                                                                               |
| Recommended use       | Integration with existing FIWARE systems         | New development, data interoperability focus                                                                                                   |

### Q: 認証なしで使用できますか?

**A:** 開発環境では、デフォルトで認証なしで使用できます。本番環境では JWT 認証を有効にすることを強く推奨します。

```bash
# Without authentication (development environment)
curl -X GET "http://localhost:3000/v2/entities" \
  -H "Fiware-Service: default"

# With JWT authentication (production environment)
curl -X GET "https://api.example.com/v2/entities" \
  -H "Fiware-Service: default" \
  -H "Authorization: Bearer <access_token>"
```

### Q: テナント (Fiware-Service) は必要ですか?

**A:** 必須ではありませんが、指定しない場合は `default` テナントが使用されます。本番環境では明示的にテナントを指定することを推奨します。

***

## 地理空間拡張機能

### Q: 地理空間拡張機能とは何ですか?

**A:** NGSI 標準の Geo クエリに加えて、GeonicDB は独自の地理空間機能を提供しています。これらは総称して「地理空間拡張機能」と呼ばれます。

#### 機能一覧

| Feature     | Description                                | Supported APIs  |
| ----------- | ------------------------------------------ | --------------- |
| Geo queries | NGSI standard geospatial search            | NGSIv2, NGSI-LD |
| Spatial ID  | Japan Digital Agency 3D Spatial ID support | NGSIv2, NGSI-LD |

### Q: Geo クエリで何ができますか?

**A:** 地理的条件を使用して、位置情報を持つエンティティを検索できます。

#### サポートされているジオメトリタイプ

| Type       | Description                  | Examples                               |
| ---------- | ---------------------------- | -------------------------------------- |
| Point      | A point (latitude/longitude) | Sensor location, store location        |
| Polygon    | A polygon                    | Building area, administrative boundary |
| LineString | A line                       | Road, river                            |

#### サポートされている空間関係 (georel)

| Relationship | Description                     | Usage Example                            |
| ------------ | ------------------------------- | ---------------------------------------- |
| `near`       | Distance from a specified point | "Sensors within 1km of current location" |
| `within`     | Contained within a range        | "Buildings within this district"         |
| `contains`   | Contains a range                | "Areas that contain this point"          |
| `intersects` | Intersects with                 | "Areas that intersect with this road"    |
| `disjoint`   | Separated from                  | "Entities outside this district"         |
| `equals`     | Matches exactly                 | "Entities at the same location"          |

#### 使用例

```bash
# Search for sensors within 1km of Tokyo Station (139.7671, 35.6812)
curl -X GET "http://localhost:3000/v2/entities?type=Sensor&georel=near;maxDistance:1000&geometry=point&coords=139.7671,35.6812" \
  -H "Fiware-Service: default"

# Search for entities within a polygon
curl -X GET "http://localhost:3000/v2/entities?georel=within&geometry=polygon&coords=139.7,35.6,139.8,35.6,139.8,35.7,139.7,35.7,139.7,35.6" \
  -H "Fiware-Service: default"
```

### Q: Spatial ID とは何ですか?

**A:** 日本のデジタル庁/IPA が策定した「3次元空間ID」仕様をサポートする機能です。緯度経度に加えて高度(フロア)を含む3次元空間の一意な識別を可能にします。

#### Spatial ID フォーマット

```text
z/f/x/y

z: Zoom level (0–25)
f: Floor (index in the altitude direction, negative values allowed)
x: X tile coordinate
y: Y tile coordinate
```

#### 使用例

```text
25/0/29805582/13235296  → A specific point on the ground floor
25/1/29805582/13235296  → One floor above the same point
25/-1/29805582/13235296 → Underground at the same point
```

#### 機能

| Operation                            | Description                                                 |
| ------------------------------------ | ----------------------------------------------------------- |
| Coordinates to Spatial ID conversion | Calculate Spatial ID from latitude, longitude, and altitude |
| Spatial ID to bounding box           | Get the 3D extent represented by a Spatial ID               |
| Spatial ID expansion                 | Enumerate child Spatial IDs from a parent Spatial ID        |

#### ユースケース


* 屋内測位(建物内のフロア識別)
  
* ドローンの飛行経路管理
  
* 3D 都市モデルとの統合
  
* 地下施設管理

### Q: GeoProperty を設定するにはどうすればよいですか?

**A:** エンティティに位置情報を格納するには、`location` 属性に GeoJSON フォーマットで座標を設定します。

#### NGSIv2 フォーマット

```json
{
  "id": "Sensor001",
  "type": "Sensor",
  "location": {
    "type": "geo:json",
    "value": {
      "type": "Point",
      "coordinates": [139.7671, 35.6812]
    }
  }
}
```

#### NGSI-LD フォーマット

```json
{
  "id": "urn:ngsi-ld:Sensor:001",
  "type": "Sensor",
  "location": {
    "type": "GeoProperty",
    "value": {
      "type": "Point",
      "coordinates": [139.7671, 35.6812]
    }
  }
}
```

**注意**: 座標は `[経度, 緯度]` の順序です(GeoJSON 標準)。

***

## セキュリティ

### Q: サポートされている認証方法は何ですか？

**A:** 以下の認証方法がサポートされています。

| Method              | Description                                                             |
| ------------------- | ----------------------------------------------------------------------- |
| JWT Bearer Token    | Recommended. User authentication and role-based access control          |
| IP whitelist        | Restrict allowed IPs per tenant                                         |
| API Key (X-Api-Key) | Lightweight authentication for IoT devices and third-party integrations |

### Q: ロール（権限）の種類は何ですか？

**A:** ロールは 4 種類あります。

| Role           | Permissions                                                                             |
| -------------- | --------------------------------------------------------------------------------------- |
| `super_admin`  | Platform management only (`/admin/*`, `/auth/*`). Cannot access data APIs (returns 403) |
| `tenant_admin` | Management of assigned tenants, user management                                         |
| `user`         | Read/write entities (can be restricted by policy)                                       |
| `api_key`      | Scope-based access via X-Api-Key header (origin/entity-type restrictions)               |

詳細は [認証と認可](./reference/auth.md) を参照してください。

### Q: HTTPS は必須ですか？

**A:** 本番環境では必須です。AWS にデプロイする場合、API Gateway が自動的に HTTPS を提供します。

***

## 関連ドキュメント


* [API 仕様](./api-reference/endpoints.md)
  
* 開発とデプロイメントガイド
  
* [認証と認可](./reference/auth.md)
