---
title: "FAQ"
description: "よくある質問"
outline: deep
---
# よくある質問（FAQ）

GeonicDB に関するよくある質問と回答をまとめています。

## 目次

- [データ量とパフォーマンス](#データ量とパフォーマンス)
- [FIWARE Orion との違い](#fiware-orion-との違い)
- [デプロイと運用](#デプロイと運用)
- [API の使い方](#api-の使い方)
- [地理空間拡張](#地理空間拡張)
- [セキュリティ](#セキュリティ)

---

## データ量とパフォーマンス

### Q: データ量の上限はありますか？

**A:** GeonicDB 自体には明示的なデータ量の上限はありません。MongoDB のスケーリング能力に依存します。

#### ハードリミット（システム上の制約）

| 制約 | 値 | 説明 |
|------|-----|------|
| 1リクエストあたりの最大件数 | 1000件 | ページネーションの `limit` 上限（FIWARE Orion 互換） |
| Admin API の最大件数 | 100件 | 管理系 API のページネーション上限 |
| API Gateway タイムアウト | 29秒 | AWS 側の制限 |
| Lambda タイムアウト | 15分 | バッチ処理等の Lambda 関数 |

#### 実運用での目安

| データ規模 | 推奨環境 |
|-----------|---------|
| 〜10万エンティティ | MongoDB Atlas M10〜M30 |
| 〜100万エンティティ | MongoDB Atlas M30〜M50 |
| 100万エンティティ以上 | MongoDB Atlas M50以上 + シャーディング検討 |

### Q: 検索が遅くなるケースはありますか？

**A:** 以下のケースで検索性能が低下する可能性があります。

#### インデックスを活用できるクエリ（高速）

- エンティティID による検索
- エンティティタイプによるフィルタリング
- Geo クエリ（`georel`, `geometry`, `coordinates`）
- 更新日時（`modifiedAt`）によるソート
- 時系列データの `observedAt` による検索

#### 注意が必要なクエリ（低速になる可能性）

| クエリパターン | 理由 | 対策 |
|--------------|------|------|
| 属性値の部分一致検索 | インデックスが効かない | 可能な限り完全一致を使用 |
| 複雑な `q` フィルタの組み合わせ | フルスキャンになる可能性 | フィルタ条件を絞る |
| 広範囲の Geo 検索 | 候補が多すぎる | 検索範囲を限定 |
| `limit` なしの全件取得 | メモリ消費大 | 必ずページネーションを使用 |

### Q: 時系列データ（Temporal）の注意点は？

**A:** 時系列データはエンティティ数 × 属性数 × 時間でデータ量が急増します。

#### 推奨設定

```bash
# 古いデータの自動削除（TTL）を設定
# MongoDB Atlas のコレクション設定で expireAfterSeconds を設定可能
```

#### データ量の見積もり例

```text
1000エンティティ × 10属性 × 1分間隔 × 24時間 × 30日
= 約4.3億レコード/月
```

大量の時系列データを扱う場合は、専用の時系列データベース（TimescaleDB、InfluxDB）との連携を検討してください。

---

## FIWARE Orion との違い

### Q: FIWARE Orion との互換性は？

**A:** NGSIv2 API は高い互換性を持っています。詳細は [FIWARE Orion 比較ドキュメント](./migration/compatibility-matrix.md) を参照してください。

#### 互換性のある機能

- NGSIv2 エンティティ CRUD 操作
- サブスクリプション（通知）
- Geo クエリ
- バッチ操作
- レジストレーション（Context Provider）

#### GeonicDB 独自の機能

- NGSI-LD API 対応
- JWT 認証・認可
- マルチテナント
- AI ツール連携（MCP）
- ベクタータイル出力
- スナップショット機能

### Q: Orion から移行できますか？

**A:** 基本的なエンティティデータは移行可能です。

```bash
# Orion からエンティティをエクスポート
curl -X GET "http://orion:1026/v2/entities?limit=1000" \
  -H "Fiware-Service: myservice" > entities.json

# GeonicDB にインポート
curl -X POST "https://api.example.com/v2/op/update" \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: myservice" \
  -d '{"actionType": "append", "entities": '"$(cat entities.json)"'}'
```

---

## デプロイと運用

### Q: どこにデプロイできますか？

**A:** 以下の環境で動作します。

| 環境 | 説明 |
|------|------|
| AWS Lambda + API Gateway | 推奨。サーバーレスで自動スケール |
| ローカル（`npm start`） | 開発・テスト用。インメモリ MongoDB 使用 |
| Docker | 任意のコンテナ環境で実行可能 |

### Q: MongoDB は何を使えばいいですか？

**A:** 以下のいずれかを推奨します。

| サービス | 特徴 |
|---------|------|
| MongoDB Atlas | 推奨。フルマネージド、自動スケール |
| セルフホスト MongoDB | フルコントロール可能だが運用負荷大 |

> **注意**: MongoDB 8.0 以上が必要です（Time Series Collection を使用するため）。Amazon DocumentDB は Time Series Collection 非対応のためサポート対象外です。

### Q: コスト目安は？

**A:** サーバーレス構成のため、使った分だけ課金されます。

| コンポーネント | 小規模（月間10万リクエスト） | 中規模（月間100万リクエスト） |
|--------------|---------------------------|----------------------------|
| Lambda | 〜$5 | 〜$20 |
| API Gateway | 〜$4 | 〜$35 |
| MongoDB Atlas (M10) | 〜$60 | 〜$60 |
| **合計** | **〜$70/月** | **〜$115/月** |

※ 実際のコストはリージョン、データ量、リクエストパターンにより変動します。

---

## API の使い方

### Q: NGSIv2 と NGSI-LD どちらを使うべき？

**A:** ユースケースによって選択してください。

| 観点 | NGSIv2 | NGSI-LD |
|------|--------|---------|
| 学習コスト | 低い | やや高い（JSON-LD の理解が必要） |
| FIWARE エコシステム | 多くのツールが対応 | 対応ツールは増加中 |
| 時系列データ | 非対応（別途実装が必要） | Temporal API で標準対応 |
| データの相互運用性 | 限定的 | JSON-LD により高い |
| 推奨用途 | 既存 FIWARE システムとの連携 | 新規開発、データ連携重視 |

### Q: 認証なしで使えますか？

**A:** 開発環境ではデフォルトで認証なしで使用できます。本番環境では JWT 認証を有効にすることを強く推奨します。

```bash
# 認証なし（開発環境）
curl -X GET "http://localhost:3000/v2/entities" \
  -H "Fiware-Service: default"

# JWT 認証あり（本番環境）
curl -X GET "https://api.example.com/v2/entities" \
  -H "Fiware-Service: default" \
  -H "Authorization: Bearer <access_token>"
```

### Q: テナント（Fiware-Service）は必須ですか？

**A:** 必須ではありませんが、指定しない場合は `default` テナントが使用されます。本番環境ではテナントを明示的に指定することを推奨します。

---

## 地理空間拡張

### Q: 地理空間拡張とは？

**A:** GeonicDB は NGSI 標準の Geo クエリに加えて、独自の地理空間機能を提供しています。これらを総称して「地理空間拡張」と呼んでいます。

#### 機能一覧

| 機能 | 説明 | 対応 API |
|------|------|---------|
| Geo クエリ | NGSI 標準の地理空間検索 | NGSIv2, NGSI-LD |
| ベクタータイル | 地図表示用の GeoJSON タイル出力 | NGSIv2, NGSI-LD |
| 空間ID (Spatial ID) | デジタル庁 3次元空間ID 対応 | NGSI-LD |

### Q: Geo クエリでできることは？

**A:** 位置情報を持つエンティティを地理的条件で検索できます。

#### 対応するジオメトリタイプ

| タイプ | 説明 | 例 |
|--------|------|-----|
| Point | 点（緯度経度） | センサー位置、店舗位置 |
| Polygon | 多角形 | 建物エリア、行政区域 |
| LineString | 線 | 道路、河川 |

#### 対応する空間関係（georel）

| 関係 | 説明 | 使用例 |
|------|------|--------|
| `near` | 指定点からの距離 | 「現在地から1km以内のセンサー」 |
| `within` | 範囲内に含まれる | 「この区域内の建物」 |
| `contains` | 範囲を含む | 「この点を含むエリア」 |
| `intersects` | 交差する | 「この道路と交差するエリア」 |
| `disjoint` | 離れている | 「この区域外のエンティティ」 |
| `equals` | 一致する | 「同じ位置のエンティティ」 |

#### 使用例

```bash
# 東京駅（139.7671, 35.6812）から1km以内のセンサーを検索
curl -X GET "http://localhost:3000/v2/entities?type=Sensor&georel=near;maxDistance:1000&geometry=point&coords=139.7671,35.6812" \
  -H "Fiware-Service: default"

# ポリゴン内のエンティティを検索
curl -X GET "http://localhost:3000/v2/entities?georel=within&geometry=polygon&coords=139.7,35.6,139.8,35.6,139.8,35.7,139.7,35.7,139.7,35.6" \
  -H "Fiware-Service: default"
```

### Q: ベクタータイルとは？

**A:** 地図アプリケーション用に、エンティティの位置情報を GeoJSON タイル形式で出力する機能です。

#### 特徴

- **タイル座標系**: Web Mercator（z/x/y 形式）
- **クラスタリング**: ズームレベルに応じて自動的にポイントをまとめる
- **TileJSON 対応**: MapLibre GL JS などの地図ライブラリと連携可能

#### エンドポイント

```bash
# TileJSON メタデータ取得
curl -X GET "http://localhost:3000/v2/tiles.json" \
  -H "Fiware-Service: default"

# タイル取得（z=14, x=14552, y=6451 の例）
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

### Q: 空間ID（Spatial ID）とは？

**A:** デジタル庁/IPA が策定した「3次元空間識別子」の仕様に対応した機能です。緯度・経度に加えて高度（フロア）も含めた3次元空間を一意に識別できます。

#### 空間ID フォーマット

```text
z/f/x/y

z: ズームレベル（0〜25）
f: フロア（高度方向のインデックス、負の値も可）
x: X タイル座標
y: Y タイル座標
```

#### 使用例

```text
25/0/29805582/13235296  → 地上階の特定地点
25/1/29805582/13235296  → 同じ地点の1階上
25/-1/29805582/13235296 → 同じ地点の地下
```

#### 機能

| 操作 | 説明 |
|------|------|
| 座標 → 空間ID 変換 | 緯度経度高度から空間ID を計算 |
| 空間ID → バウンディングボックス | 空間ID が示す3次元範囲を取得 |
| 空間ID の展開 | 親空間ID から子空間ID を列挙 |

#### ユースケース

- 屋内測位（ビル内のフロア識別）
- ドローン飛行経路管理
- 3D 都市モデルとの連携
- 地下施設の管理

### Q: GeoProperty の設定方法は？

**A:** エンティティに位置情報を持たせるには、`location` 属性に GeoJSON 形式で座標を設定します。

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

**注意**: 座標は `[経度, 緯度]` の順番です（GeoJSON 標準）。

---

## セキュリティ

### Q: どのような認証方式に対応していますか？

**A:** 以下の認証方式に対応しています。

| 方式 | 説明 |
|------|------|
| JWT Bearer Token | 推奨。ユーザー認証とロールベースアクセス制御 |
| IP ホワイトリスト | テナント単位で許可 IP を制限 |
| API キー | 将来対応予定 |

### Q: ロール（権限）の種類は？

**A:** 3種類のロールがあります。

| ロール | 権限 |
|--------|------|
| `super_admin` | 全テナントの管理、システム設定 |
| `tenant_admin` | 担当テナントの管理、ユーザー管理 |
| `user` | エンティティの読み書き（ポリシーで制限可能） |

詳細は 認証・認可 を参照してください。

### Q: HTTPS は必須ですか？

**A:** 本番環境では必須です。AWS にデプロイする場合、API Gateway が自動的に HTTPS を提供します。

---

## 関連ドキュメント

- [API 仕様](./api-reference/endpoints.md)
- [FIWARE Orion 比較](./migration/compatibility-matrix.md)
- [開発・デプロイガイド](./getting-started/installation.md)
- 認証・認可
