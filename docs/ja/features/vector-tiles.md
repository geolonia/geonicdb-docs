---
title: ベクトルタイル
description: Vela OS で TileJSON 3.0、自動クラスタリング、MapLibre GL JS 連携によるベクトルタイル配信。
outline: deep
---

# ベクトルタイル

Vela OS はエンティティの位置データを **ベクトルタイル** として配信でき、コンテキストデータから直接高性能な地図可視化を実現します。組み込みのタイルサーバーは **TileJSON 3.0** 仕様、自動ポイントクラスタリング、**MapLibre GL JS** とのシームレスな連携をサポートしています。

## 概要

ベクトルタイルは、大量の位置情報付きエンティティを地図上に効率的にレンダリングする方法を提供します。すべてのエンティティを取得してクライアント側でレンダリングする代わりに、ベクトルタイルはタイルベースの前処理済みデータを配信し、ユーザーがパン・ズームする際にマップライブラリが段階的にレンダリングできます。

## TileJSON 3.0 エンドポイント

Vela OS は各エンティティタイプに対して TileJSON 3.0 メタデータエンドポイントを公開します：

```bash
curl https://api.vela.geolonia.com/v2/entities/tiles/Room/tilejson \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### レスポンス

```json
{
  "tilejson": "3.0.0",
  "name": "Room",
  "tiles": [
    "https://api.vela.geolonia.com/v2/entities/tiles/Room/{z}/{x}/{y}.pbf"
  ],
  "minzoom": 0,
  "maxzoom": 14,
  "bounds": [122.93, 24.04, 153.99, 45.55]
}
```

## タイルエンドポイント

個別のタイルは Mapbox Vector Tile（MVT / `.pbf`）形式で配信されます：

```text
GET /v2/entities/tiles/{entityType}/{z}/{x}/{y}.pbf
```

| パラメータ | 説明 |
|-----------|------|
| `entityType` | タイルを生成するエンティティタイプ |
| `z` | ズームレベル |
| `x` | タイル列 |
| `y` | タイル行 |

### ヘッダー

| ヘッダー | 必須 | 説明 |
|---------|------|------|
| `Fiware-Service` | はい | テナント名 |
| `Authorization` | 認証有効時 | API アクセストークン |

## 自動クラスタリング

低ズームレベルでは、Vela OS は近接するエンティティを自動的に集約ポイントにクラスタリングします。これにより、都市や地域スケールで大規模データセットを表示する際のレンダリングパフォーマンスが向上します。

| ズームレベル | 動作 |
|------------|------|
| 0–10 | カウントプロパティ付きのクラスタリングポイント |
| 11–14 | 個別エンティティポイント |

クラスタフィーチャーにはクラスタ内のエンティティ数を示す `point_count` プロパティが含まれます。

## MapLibre GL JS 連携

### 基本セットアップ

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="https://unpkg.com/maplibre-gl/dist/maplibre-gl.css" />
  <script src="https://unpkg.com/maplibre-gl/dist/maplibre-gl.js"></script>
</head>
<body>
  <div id="map" style="width: 100%; height: 100vh;"></div>
  <script>
    const map = new maplibregl.Map({
      container: 'map',
      style: 'https://basemaps.geolonia.com/v1/styles/basic.json',
      center: [139.7671, 35.6812],
      zoom: 12
    });

    map.on('load', () => {
      map.addSource('sensors', {
        type: 'vector',
        url: 'https://api.vela.geolonia.com/v2/entities/tiles/Sensor/tilejson'
      });

      map.addLayer({
        id: 'sensor-points',
        type: 'circle',
        source: 'sensors',
        'source-layer': 'entities',
        paint: {
          'circle-radius': 6,
          'circle-color': '#007cbf'
        }
      });
    });
  </script>
</body>
</html>
```

### クラスタの表示

```javascript
map.on('load', () => {
  map.addSource('sensors', {
    type: 'vector',
    url: 'https://api.vela.geolonia.com/v2/entities/tiles/Sensor/tilejson'
  });

  // クラスタ円
  map.addLayer({
    id: 'clusters',
    type: 'circle',
    source: 'sensors',
    'source-layer': 'entities',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': [
        'step', ['get', 'point_count'],
        '#51bbd6', 10,
        '#f1f075', 50,
        '#f28cb1'
      ],
      'circle-radius': [
        'step', ['get', 'point_count'],
        15, 10,
        20, 50,
        25
      ]
    }
  });

  // クラスタカウントラベル
  map.addLayer({
    id: 'cluster-count',
    type: 'symbol',
    source: 'sensors',
    'source-layer': 'entities',
    filter: ['has', 'point_count'],
    layout: {
      'text-field': '{point_count}',
      'text-size': 12
    }
  });

  // 個別ポイント
  map.addLayer({
    id: 'unclustered-point',
    type: 'circle',
    source: 'sensors',
    'source-layer': 'entities',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-radius': 5,
      'circle-color': '#007cbf'
    }
  });
});
```

### クリック操作

```javascript
map.on('click', 'unclustered-point', (e) => {
  const properties = e.features[0].properties;
  new maplibregl.Popup()
    .setLngLat(e.lngLat)
    .setHTML(`<strong>${properties.id}</strong><br>タイプ: ${properties.type}`)
    .addTo(map);
});
```

## タイル内のエンティティプロパティ

ベクトルタイル内の各フィーチャーには以下のプロパティが含まれます：

| プロパティ | 説明 |
|-----------|------|
| `id` | エンティティ ID |
| `type` | エンティティタイプ |
| その他の属性 | エンティティ属性がフィーチャープロパティとして格納 |

## パフォーマンスに関する考慮事項

- ベクトルタイルは MongoDB のジオインデックスからオンデマンドで生成されます
- タイル境界でクリップされ、効率的なデータ転送を実現
- `Fiware-Service` ヘッダーを使用してタイルを特定のテナントにスコープ
- 大規模データセットでは、低ズームレベルでのクラスタリングによりタイルサイズが大幅に削減されます
