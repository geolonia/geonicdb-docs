---
title: ジオクエリと空間ID（ZFXY）
description: Vela OS で near、within、intersects、coveredBy 演算子を使用した地理的クエリと、空間ID（ZFXY）サポートについて。
outline: deep
---

# ジオクエリと空間ID（ZFXY）

Vela OS は位置情報によるエンティティフィルタリングのための強力な地理的クエリ機能を提供します。標準的な NGSI ジオクエリ演算子、GeoJSON ジオメトリタイプ、そして日本のデジタル庁/IPA が推進する空間ID（ZFXY）タイルベース空間インデックスシステムをサポートしています。

## ジオクエリ演算子

### NGSIv2 ジオクエリ

`georel`、`geometry`、`coords` パラメータを使用して、地理的条件でエンティティをフィルタリングします：

```bash
# ある地点から1km以内のエンティティを検索
curl -G https://api.vela.geolonia.com/v2/entities \
  --data-urlencode "georel=near;maxDistance:1000" \
  --data-urlencode "geometry=point" \
  --data-urlencode "coords=35.6812,139.7671" \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

| 演算子 | 説明 | 例 |
|--------|------|-----|
| `near` | ある地点の近くのエンティティ | `georel=near;maxDistance:1000` |
| `within` | ポリゴン内のエンティティ | `georel=within` |
| `intersects` | ジオメトリと交差するエンティティ | `georel=intersects` |
| `coveredBy` | ジオメトリに覆われるエンティティ | `georel=coveredBy` |
| `equals` | 正確な位置のエンティティ | `georel=equals` |
| `disjoint` | ジオメトリ外のエンティティ | `georel=disjoint` |

### ジオメトリタイプ

| タイプ | `coords` 形式 | 例 |
|--------|---------------|-----|
| `point` | `lat,lon` | `35.6812,139.7671` |
| `line` | `lat1,lon1;lat2,lon2;...` | `35.68,139.76;35.69,139.77` |
| `polygon` | `lat1,lon1;lat2,lon2;...;lat1,lon1` | `35.68,139.76;35.69,139.77;35.69,139.76;35.68,139.76` |
| `box` | `latSW,lonSW;latNE,lonNE` | `35.68,139.76;35.70,139.78` |

### NGSI-LD ジオクエリ

NGSI-LD では `geoproperty`、`georel`、`geometry`、`coordinates` パラメータを使用します：

```bash
# ポリゴン内のエンティティを検索
curl -G https://api.vela.geolonia.com/ngsi-ld/v1/entities \
  --data-urlencode "type=Building" \
  --data-urlencode "georel=within" \
  --data-urlencode "geometry=Polygon" \
  --data-urlencode 'coordinates=[[[139.76,35.68],[139.77,35.68],[139.77,35.69],[139.76,35.69],[139.76,35.68]]]' \
  -H "NGSILD-Tenant: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### 距離指定の Near クエリ

```bash
# 東京駅から500メートル以内のエンティティ
curl -G https://api.vela.geolonia.com/v2/entities \
  --data-urlencode "type=Sensor" \
  --data-urlencode "georel=near;maxDistance:500" \
  --data-urlencode "geometry=point" \
  --data-urlencode "coords=35.6812,139.7671" \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

`near` 演算子は以下をサポートします：
- `maxDistance:<メートル>` — 基準点からの最大距離
- `minDistance:<メートル>` — 基準点からの最小距離

## GeoJSON サポート

Vela OS は標準的な GeoJSON 形式でエンティティの位置情報を保存・返却します。

### 位置情報付きエンティティの作成

```bash
curl -X POST https://api.vela.geolonia.com/v2/entities \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "id": "urn:ngsi-ld:Sensor:tokyo-001",
    "type": "Sensor",
    "location": {
      "type": "geo:json",
      "value": {
        "type": "Point",
        "coordinates": [139.7671, 35.6812]
      }
    },
    "temperature": {
      "type": "Number",
      "value": 22.5
    }
  }'
```

### NGSI-LD GeoProperty

```bash
curl -X POST https://api.vela.geolonia.com/ngsi-ld/v1/entities \
  -H "Content-Type: application/json" \
  -H "NGSILD-Tenant: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "id": "urn:ngsi-ld:Sensor:tokyo-001",
    "type": "Sensor",
    "location": {
      "type": "GeoProperty",
      "value": {
        "type": "Point",
        "coordinates": [139.7671, 35.6812]
      }
    }
  }'
```

### サポートされる GeoJSON タイプ

| GeoJSON タイプ | 説明 |
|---------------|------|
| `Point` | 単一座標 |
| `LineString` | 座標のシーケンス |
| `Polygon` | 境界リングで囲まれた閉領域 |
| `MultiPoint` | ポイントのコレクション |
| `MultiLineString` | ラインストリングのコレクション |
| `MultiPolygon` | ポリゴンのコレクション |

## 空間ID（ZFXY）

Vela OS はデジタル庁/IPA のガイドラインに準拠した **空間ID（ZFXY）** システムをサポートしています。ZFXY はズームレベル（Z）、フロア（F）、X座標、Y座標を使用して、3D空間を階層的なグリッドに分割するタイルベースの空間インデックス方式です。

### ZFXY フォーマット

```text
/{z}/{f}/{x}/{y}
```

| 要素 | 説明 |
|------|------|
| `z` | ズームレベル（0–25）— 値が大きいほど高精度 |
| `f` | フロアレベル — 3D空間インデックス用 |
| `x` | X タイル座標 |
| `y` | Y タイル座標 |

### 空間IDによるクエリ

```bash
# 特定の空間タイル内のエンティティを検索
curl -G https://api.vela.geolonia.com/v2/entities \
  --data-urlencode "type=Sensor" \
  --data-urlencode "spatialId=15/0/29103/12903" \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### ユースケース

- **スマートシティのゾーニング** — 統一的なデータ集約のために、エンティティを標準化された空間タイルに割り当て
- **3Dビル管理** — フロア（F）コンポーネントを使用して垂直方向の位置を表現
- **プラットフォーム間の相互運用性** — 政府機関や産業プラットフォーム間で標準化されたタイルシステムを使用した位置データの共有
