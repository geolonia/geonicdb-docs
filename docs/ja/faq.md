---
title: "FAQ"
description: "Frequently asked questions"
outline: deep
---
# よくある質問 (FAQ)

GeonicDB についてよくある質問と回答のコレクションです。

## 目次


* [データ量とパフォーマンス](#data-volume-and-performance)
  
* [FIWARE Orion との違い](#fiware-orion-との違い)
  
* [デプロイと運用](#デプロイと運用)
  
* [API の使い方](#api-の使い方)
  
* [地理空間拡張](#geospatial-extensions)
  
* [セキュリティ](#セキュリティ)

***

## データボリュームとパフォーマンス

### Q: データボリュームの制限はありますか?

**A:** GeonicDB 自体には明示的なデータボリューム制限はありません。MongoDB のスケーリング機能に依存します。

#### ハード制限(システム制約)

| Constraint                | Value      | Description                                                  |
| ------------------------- | ---------- | ------------------------------------------------------------ |
| Maximum items per request | 1,000      | `limit` upper bound for pagination (FIWARE Orion compatible) |
| Admin API maximum items   | 100        | Pagination upper bound for admin APIs                        |
| API Gateway timeout       | 29 seconds | AWS-side limit                                               |
| Lambda timeout            | 15 minutes | For Lambda functions such as batch processing                |

#### 本番環境での実用的なガイドライン

| Data Scale               | Recommended Environment                        |
| ------------------------ | ---------------------------------------------- |
| Up to 100,000 entities   | MongoDB Atlas M10–M30                          |
| Up to 1,000,000 entities | MongoDB Atlas M30–M50                          |
| Over 1,000,000 entities  | MongoDB Atlas M50+ with sharding consideration |

### Q: クエリが遅くなるケースはありますか?

**A:** 以下のケースでクエリパフォーマンスが低下する可能性があります。

#### インデックスを活用するクエリ(高速)


* エンティティ ID による検索
  
* エンティティタイプによるフィルタリング
  
* ジオクエリ(`georel`、`geometry`、`coordinates`)
  
* 最終更新日時(`modifiedAt`)によるソート
  
* `observedAt` による時系列データ検索

#### 注意が必要なクエリ(潜在的に低速)

| Query Pattern                            | Reason                    | Mitigation                       |
| ---------------------------------------- | ------------------------- | -------------------------------- |
| Partial match search on attribute values | Indexes are not effective | Use exact matches where possible |
| Complex combinations of `q` filters      | May result in full scan   | Narrow down filter conditions    |
| Wide-range Geo searches                  | Too many candidates       | Limit the search area            |
| Retrieving all records without `limit`   | High memory consumption   | Always use pagination            |

### Q: 時系列(Temporal)データで注意すべきことは?

**A:** 時系列データのボリュームは、エンティティ数 x 属性数 x 時間間隔で急速に増大します。

#### 推奨設定

```bash
# Configure automatic deletion of old data (TTL)
# expireAfterSeconds can be set in MongoDB Atlas collection settings
```

#### データボリューム推定例

```text
1,000 entities x 10 attributes x 1-minute interval x 24 hours x 30 days
= approximately 430 million records/month
```

大量の時系列データを扱う場合は、専用の時系列データベース(TimescaleDB、InfluxDB)との統合を検討してください。

***

## FIWARE Orion との違い

### Q: FIWARE Orion との互換性は?

**A:** NGSIv2 API は高い互換性があります。詳細は [FIWARE Orion 比較ドキュメント](./migration/compatibility-matrix.md) を参照してください。

#### 互換機能


* NGSIv2 エンティティ CRUD 操作
  
* サブスクリプション(通知)
  
* 地理空間クエリ
  
* バッチ操作
  
* レジストレーション(Context Provider)

#### GeonicDB 独自機能


* NGSI-LD API サポート
  
* JWT 認証・認可
  
* マルチテナンシー
  
* AI ツール連携(MCP)
  
* ベクトルタイル出力
  
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

### Q: どの MongoDB を使うべきですか?

**A:** 以下のいずれかを推奨します。

| Service             | Features                                      |
| ------------------- | --------------------------------------------- |
| MongoDB Atlas       | Recommended. Fully managed, automatic scaling |
| Self-hosted MongoDB | Full control, but high operational overhead   |

> **注意**: MongoDB 8.0 以上が必要です(Time Series Collection サポートのため)。Amazon DocumentDB は Time Series Collections をサポートしていないため非対応です。

### Q: コストの目安は?

**A:** サーバーレスアーキテクチャのため、使った分だけ課金されます。

| Component           | Small scale (100,000 requests/month) | Medium scale (1,000,000 requests/month) |
| ------------------- | ------------------------------------ | --------------------------------------- |
| Lambda              | \~$5                                 | \~$20                                   |
| API Gateway         | \~$4                                 | \~$35                                   |
| MongoDB Atlas (M10) | \~$60                                | \~$60                                   |
| **Total**           | **\~$70/month**                      | **\~$115/month**                        |


* 実際のコストはリージョン、データ量、リクエストパターンによって変動します。

***

## API の使い方

### Q: NGSIv2 と NGSI-LD のどちらを使うべきですか？

**A:** ユースケースに基づいて選択してください。

| Perspective           | NGSIv2                                           | NGSI-LD                                           |
| --------------------- | ------------------------------------------------ | ------------------------------------------------- |
| Learning curve        | Low                                              | Somewhat high (requires understanding of JSON-LD) |
| FIWARE ecosystem      | Many tools available                             | Number of compatible tools is growing             |
| Time-series data      | Not supported (requires separate implementation) | Standard support via Temporal API                 |
| Data interoperability | Limited                                          | High via JSON-LD                                  |
| Recommended use       | Integration with existing FIWARE systems         | New development, data interoperability focus      |

### Q: 認証なしで使用できますか？

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

### Q: テナント (Fiware-Service) は必要ですか？

**A:** 必須ではありませんが、指定しない場合は `default` テナントが使用されます。本番環境では明示的にテナントを指定することを推奨します。

***

## 地理空間拡張機能

### Q: 地理空間拡張機能とは何ですか?

**A:** NGSI 標準の Geo クエリに加えて、GeonicDB が提供する独自の地理空間機能です。これらを総称して「地理空間拡張機能」と呼びます。

#### 機能一覧

| Feature      | Description                                | Supported APIs  |
| ------------ | ------------------------------------------ | --------------- |
| Geo queries  | NGSI standard geospatial search            | NGSIv2, NGSI-LD |
| Vector tiles | GeoJSON tile output for map display        | NGSIv2, NGSI-LD |
| Spatial ID   | Japan Digital Agency 3D Spatial ID support | NGSIv2, NGSI-LD |

### Q: Geo クエリで何ができますか？

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

### Q: ベクタータイルとは何ですか?

**A:** 地図アプリケーション向けに、エンティティの位置情報を GeoJSON タイル形式で出力する機能です。

#### 機能


* **タイル座標系**: Web Mercator (z/x/y 形式)
  
* **クラスタリング**: ズームレベルに基づいてポイントを自動的に集約
  
* **TileJSON サポート**: MapLibre GL JS などの地図ライブラリと統合可能

#### エンドポイント

```bash
# Get TileJSON metadata
curl -X GET "http://localhost:3000/v2/tiles.json" \
  -H "Fiware-Service: default"

# Get tile (example: z=14, x=14552, y=6451)
curl -X GET "http://localhost:3000/v2/tiles/14/14552/6451.geojson" \
  -H "Fiware-Service: default"
```

#### MapLibre GL JS での使用例

```javascript
map.addSource('entities', {
  type: 'geojson',
  data: 'http://localhost:3000/v2/tiles/14/14552/6451.geojson'
});

map.addLayer({
  id: 'entity-points',
  type: 'circle',
  source: 'entities',
  paint: {
    'circle-radius': 6,
    'circle-color': '#007cbf'
  }
});
```

### Q: Spatial ID とは何ですか?

**A:** 日本のデジタル庁/IPA によって制定された「3次元空間識別子」仕様をサポートする機能です。緯度経度に加えて高度(階層)を含む 3D 空間の一意な識別を可能にします。

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


* 屋内測位(建物内の階層識別)
  
* ドローン飛行経路管理
  
* 3D 都市モデルとの統合
  
* 地下施設管理

### Q: GeoProperty を設定するにはどうすればよいですか?

**A:** エンティティに位置情報を保存するには、`location` 属性に GeoJSON 形式で座標を設定します。

#### NGSIv2 形式

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

#### NGSI-LD 形式

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

**注**: 座標は `[longitude, latitude]` の順序です (GeoJSON 標準)。

***

## セキュリティ

### Q: どのような認証方法がサポートされていますか?

**A:** 以下の認証方法がサポートされています。

| Method              | Description                                                             |
| ------------------- | ----------------------------------------------------------------------- |
| JWT Bearer Token    | Recommended. User authentication and role-based access control          |
| IP whitelist        | Restrict allowed IPs per tenant                                         |
| API Key (X-Api-Key) | Lightweight authentication for IoT devices and third-party integrations |

### Q: ロール (権限) にはどのような種類がありますか?

**A:** ロールには 4 種類があります。

| Role           | Permissions                                                                             |
| -------------- | --------------------------------------------------------------------------------------- |
| `super_admin`  | Platform management only (`/admin/*`, `/auth/*`). Cannot access data APIs (returns 403) |
| `tenant_admin` | Management of assigned tenants, user management                                         |
| `user`         | Read/write entities (can be restricted by policy)                                       |
| `api_key`      | Scope-based access via X-Api-Key header (origin/entity-type restrictions)               |

詳細については、[認証と認可](./reference/auth.md) を参照してください。

### Q: HTTPS は必須ですか?

**A:** 本番環境では必須です。AWS にデプロイする場合、API Gateway が自動的に HTTPS を提供します。

***

## 関連ドキュメント


* [API 仕様](./api-reference/endpoints.md)
  
* [FIWARE Orion 比較](./migration/compatibility-matrix.md)
  
* 開発とデプロイメントガイド
  
* [認証と認可](./reference/auth.md)
