---
title: "FAQ"
description: "よくある質問"
outline: deep
---
# よくある質問 (FAQ)

GeonicDB に関するよくある質問と回答をまとめたページです。

## 目次

- [データ量とパフォーマンス](#データ量とパフォーマンス)
- [FIWARE Orion との違い](#fiware-orion-との違い)
- [デプロイと運用](#デプロイと運用)
- [API の使い方](#api-の使い方)
- [地理空間拡張](#地理空間拡張)
- [セキュリティ](#セキュリティ)

---

## データ量とパフォーマンス

### Q: データ量の上限はありますか?

**A:** GeonicDB 自体には明示的なデータ量の上限はありません。MongoDB のスケーリング能力に依存します。

#### ハードリミット (システム上の制約)

| 制約 | 値 | 説明 |
|------|-----|------|
| リクエストあたりの最大アイテム数 | 1,000 | ページネーションの `limit` 上限 (FIWARE Orion 互換) |
| Admin API の最大アイテム数 | 100 | Admin API のページネーション上限 |
| API Gateway タイムアウト | 29 秒 | AWS 側の制限 |
| Lambda タイムアウト | 15 分 | バッチ処理などの Lambda 関数用 |

#### 本番環境での実用的なガイドライン

| データ規模 | 推奨環境 |
|-----------|---------|
| 10 万エンティティまで | MongoDB Atlas M10–M30 |
| 100 万エンティティまで | MongoDB Atlas M30–M50 |
| 100 万エンティティ以上 | MongoDB Atlas M50+ とシャーディングの検討 |

### Q: クエリが遅くなるケースはありますか?

**A:** 以下のようなケースで、クエリのパフォーマンスが低下する可能性があります。

#### インデックスを活用するクエリ (高速)

- エンティティ ID による検索
- エンティティタイプによるフィルタリング
- Geo クエリ (`georel`、`geometry`、`coordinates`)
- 最終更新日時によるソート (`modifiedAt`)
- `observedAt` による時系列データ検索

#### 注意が必要なクエリ (低速になる可能性)

| クエリパターン | 理由 | 対策 |
|--------------|------|------|
| 属性値の部分一致検索 | インデックスが効かない | できるだけ完全一致を使用 |
| `q` フィルタの複雑な組み合わせ | フルスキャンになる可能性 | フィルタ条件を絞り込む |
| 広範囲の Geo 検索 | 候補が多すぎる | 検索範囲を制限 |
| `limit` なしの全件取得 | メモリ消費が大きい | 必ずページネーションを使用 |

### Q: 時系列 (Temporal) データで気をつけることは?

**A:** 時系列データは、エンティティ数 × 属性数 × 時間間隔でデータ量が急増します。

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




大量の時系列データを扱う場合は、専用の時系列データベース (TimescaleDB、InfluxDB) との連携を検討してください。

---

## FIWARE Orion との違い

### Q: FIWARE Orion との互換性は?

**A:** NGSIv2 API は高い互換性があります。詳細は [FIWARE Orion 比較ドキュメント](./migration/compatibility-matrix.md) を参照してください。

#### 互換性のある機能

- NGSIv2 エンティティ CRUD 操作
- サブスクリプション (通知)
- Geo クエリ
- バッチ操作
- レジストレーション (Context Provider)

#### GeonicDB 独自機能

- NGSI-LD API サポート
- JWT 認証と認可
- マルチテナンシー
- AI ツール連携 (MCP)
- ベクタータイル出力
- スナップショット機能

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











---

## デプロイと運用

### Q: どこにデプロイできますか?

**A:** 以下の環境で動作します。

| 環境 | 説明 |
|------|------|
| AWS Lambda + API Gateway | 推奨。サーバーレスで自動スケール |
| ローカル (`npm start`) | 開発とテスト用。インメモリ MongoDB を使用 |
| Docker | 任意のコンテナ環境で動作 |

### Q: どの MongoDB を使えばいいですか?

**A:** 以下のいずれかを推奨します。

| サービス | 特徴 |
|---------|------|
| MongoDB Atlas | 推奨。フルマネージド、自動スケール |
| セルフホスト MongoDB | 完全な制御が可能だが運用負荷が高い |

> **注意**: MongoDB 8.0 以上が必要です (Time Series Collection サポートのため)。Amazon DocumentDB は Time Series Collection に対応していないためサポートされません。

### Q: コストの目安は?

**A:** サーバーレスアーキテクチャのため、使用した分だけ課金されます。

| コンポーネント | 小規模 (月 10 万リクエスト) | 中規模 (月 100 万リクエスト) |
|--------------|---------------------------|----------------------------|
| Lambda | 約 $5 | 約 $20 |
| API Gateway | 約 $4 | 約 $35 |
| MongoDB Atlas (M10) | 約 $60 | 約 $60 |
| **合計** | **約 $70/月** | **約 $115/月** |

* 実際のコストはリージョン、データ量、リクエストパターンにより変動します。

---

## API の使い方

### Q: NGSIv2 と NGSI-LD どちらを使うべきですか?

**A:** 用途に応じて選択してください。

| 観点 | NGSIv2 | NGSI-LD |
|------|--------|---------|
| 学習コスト | 低い | やや高い (JSON-LD の理解が必要) |
| FIWARE エコシステム | ツールが豊富 | 対応ツールが増加中 |
| 時系列データ | 非対応 (別途実装が必要) | Temporal API で標準対応 |
| データの相互運用性 | 限定的 | JSON-LD による高い相互運用性 |
| 推奨用途 | 既存 FIWARE システムとの連携 | 新規開発、データ相互運用重視 |

### Q: 認証なしで使えますか?

**A:** 開発環境ではデフォルトで認証なしで使用できます。本番環境では JWT 認証を有効にすることを強く推奨します。

```bash
# Without authentication (development environment)
curl -X GET "http://localhost:3000/v2/entities" \
  -H "Fiware-Service: default"

# With JWT authentication (production environment)
curl -X GET "https://api.example.com/v2/entities" \
  -H "Fiware-Service: default" \
  -H "Authorization: Bearer <access_token>"
```










### Q: テナント (Fiware-Service) は必須ですか?

**A:** 必須ではありませんが、指定しない場合は `default` テナントが使用されます。本番環境では明示的にテナントを指定することを推奨します。

---

## 地理空間拡張

### Q: 地理空間拡張とは何ですか?

**A:** GeonicDB は NGSI 標準の Geo クエリに加えて、独自の地理空間機能を提供しています。これらを総称して「地理空間拡張」と呼びます。

#### 機能一覧

| 機能 | 説明 | 対応 API |
|------|------|---------|
| Geo クエリ | NGSI 標準の地理空間検索 | NGSIv2、NGSI-LD |
| ベクタータイル | 地図表示用の GeoJSON タイル出力 | NGSIv2、NGSI-LD |
| Spatial ID | 日本デジタル庁 3D 空間 ID 対応 | NGSI-LD |

### Q: Geo クエリで何ができますか?

**A:** 位置情報を持つエンティティを地理的条件で検索できます。

#### サポートされるジオメトリタイプ

| タイプ | 説明 | 例 |
|--------|------|-----|
| Point | 点 (緯度経度) | センサー位置、店舗位置 |
| Polygon | 多角形 | 建物エリア、行政区画 |
| LineString | 線 | 道路、河川 |

#### サポートされる空間関係 (georel)

| 関係 | 説明 | 使用例 |
|------|------|--------|
| `near` | 指定点からの距離 | 「現在地から 1km 以内のセンサー」 |
| `within` | 範囲内に含まれる | 「この区画内の建物」 |
| `contains` | 範囲を含む | 「この点を含むエリア」 |
| `intersects` | 交差する | 「この道路と交差するエリア」 |
| `disjoint` | 離れている | 「この区画外のエンティティ」 |
| `equals` | 完全一致 | 「同じ位置のエンティティ」 |

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

**A:** エンティティの位置情報を GeoJSON タイル形式で出力し、地図アプリケーションで利用できる機能です。

#### 特徴

- **タイル座標系**: Web Mercator (z/x/y 形式)
- **クラスタリング**: ズームレベルに応じて自動的にポイントを集約
- **TileJSON 対応**: MapLibre GL JS などの地図ライブラリと統合可能

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

**A:** 日本のデジタル庁・IPA が策定した「3次元空間識別子」の仕様に対応した機能です。緯度経度に加え、高度 (階層) を含む 3 次元空間を一意に識別できます。

#### Spatial ID の形式

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

| 操作 | 説明 |
|------|------|
| 座標から Spatial ID 変換 | 緯度、経度、高度から Spatial ID を計算 |
| Spatial ID からバウンディングボックス | Spatial ID が表す 3D 範囲を取得 |
| Spatial ID 展開 | 親 Spatial ID から子 Spatial ID を列挙 |

#### ユースケース

- 屋内測位 (建物内の階層識別)
- ドローン飛行経路管理
- 3D 都市モデルとの統合
- 地下施設管理

### Q: GeoProperty の設定方法は?

**A:** エンティティに位置情報を格納するには、`location` 属性に GeoJSON 形式で座標を設定します。

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













**注意**: 座標は `[longitude, latitude]` の順です (GeoJSON 標準)。

---

## セキュリティ

### Q: 認証方式は何がサポートされていますか?

**A:** 以下の認証方式をサポートしています。

| 方式 | 説明 |
|------|------|
| JWT Bearer Token | 推奨。ユーザー認証とロールベースアクセス制御 |
| IP ホワイトリスト | テナントごとに許可 IP を制限 |
| API キー | 今後サポート予定 |

### Q: ロール (権限) の種類は?

**A:** 3 種類のロールがあります。

| ロール | 権限 |
|--------|------|
| `super_admin` | すべてのテナントの管理、システム設定 |
| `tenant_admin` | 割り当てられたテナントの管理、ユーザー管理 |
| `user` | エンティティの読み書き (ポリシーで制限可能) |

詳細は認証と認可を参照してください。

### Q: HTTPS は必須ですか?

**A:** 本番環境では必須です。AWS へのデプロイ時は、API Gateway が自動的に HTTPS を提供します。

---

## 関連ドキュメント

- [API 仕様](./api-reference/endpoints.md)
- [FIWARE Orion 比較](./migration/compatibility-matrix.md)
- [開発とデプロイガイド](./getting-started/installation.md)
- 認証と認可