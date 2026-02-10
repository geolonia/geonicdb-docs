---
title: データカタログ
description: Vela OS でエンティティメタデータを DCAT-AP データセットとして公開し、CKAN オープンデータポータルと連携する方法。
outline: deep
---

# データカタログ

Vela OS は **DCAT-AP**（Data Catalog Vocabulary - Application Profile）形式でエンティティタイプのメタデータを公開し、**CKAN 互換** API エンドポイントを提供する組み込みの **データカタログ** 機能を搭載しています。これにより、オープンデータポータルやデータハーベスティングシステムとのシームレスな連携が可能です。

## 概要

- **DCAT-AP 形式** — EU データポータル標準に準拠した JSON-LD 形式でカタログメタデータを出力
- **CKAN 互換 API** — CKAN ハーベスタプロトコルをサポートし、直接データ取り込みが可能
- **自動メタデータ生成** — エンティティタイプから自動的にデータセットメタデータを生成
- **マルチテナント** — 各テナントが独立したカタログを持つ

## DCAT-AP エンドポイント

### GET /catalog

完全なカタログを DCAT-AP JSON-LD 形式で返します。

```bash
curl https://api.vela.geolonia.com/catalog \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**レスポンス：**

```json
{
  "@context": {
    "dcat": "http://www.w3.org/ns/dcat#",
    "dct": "http://purl.org/dc/terms/",
    "foaf": "http://xmlns.com/foaf/0.1/",
    "xsd": "http://www.w3.org/2001/XMLSchema#"
  },
  "@type": "dcat:Catalog",
  "@id": "urn:ngsi-ld:Catalog:smartcity",
  "dct:title": "Context Data Catalog",
  "dct:description": "DCAT-AP catalog for context data in tenant: smartcity",
  "dct:publisher": {
    "@type": "foaf:Organization",
    "foaf:name": "VelaOS"
  },
  "dct:language": ["ja", "en"],
  "dcat:dataset": [
    {
      "@type": "dcat:Dataset",
      "@id": "urn:ngsi-ld:Dataset:Room",
      "dct:title": "Room",
      "dct:description": "Context data for entity type: Room",
      "dcat:keyword": ["Room"],
      "dcat:distribution": [
        {
          "@type": "dcat:Distribution",
          "dcat:accessURL": "/v2/entities?type=Room",
          "dct:format": "application/json"
        },
        {
          "@type": "dcat:Distribution",
          "dcat:accessURL": "/ngsi-ld/v1/entities?type=Room",
          "dct:format": "application/ld+json"
        }
      ]
    }
  ]
}
```

### GET /catalog/datasets

ページネーション付きのデータセット一覧。

```bash
curl "https://api.vela.geolonia.com/catalog/datasets?limit=10&offset=0" \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

| パラメータ | 説明 | デフォルト |
|-----------|------|-----------|
| `limit` | 返却するデータセット数 | 全件 |
| `offset` | スキップするデータセット数 | 0 |

### GET /catalog/datasets/{datasetId}

特定のデータセット（エンティティタイプ）の詳細。

```bash
curl https://api.vela.geolonia.com/catalog/datasets/Room \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### GET /catalog/datasets/{datasetId}/sample

データセットのサンプルエンティティを取得。

```bash
curl "https://api.vela.geolonia.com/catalog/datasets/Room/sample?limit=3" \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

| パラメータ | 説明 | デフォルト |
|-----------|------|-----------|
| `limit` | サンプルエンティティ数 | 5 |

## CKAN 互換 API

Vela OS は CKAN ハーベスタがコンテキストブローカーからデータを直接取り込める CKAN 互換エンドポイントを提供します。

### GET /catalog/ckan/package_list

すべてのパッケージ（データセット）ID を返します。

```bash
curl https://api.vela.geolonia.com/catalog/ckan/package_list \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**レスポンス：**

```json
{
  "success": true,
  "result": ["room", "sensor", "device"]
}
```

### GET /catalog/ckan/package_show

特定のパッケージの詳細情報を取得。

```bash
curl "https://api.vela.geolonia.com/catalog/ckan/package_show?id=room" \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**レスポンス：**

```json
{
  "success": true,
  "result": {
    "id": "room",
    "name": "room",
    "title": "Room",
    "notes": "Context data for entity type: Room",
    "num_resources": 2,
    "resources": [
      {
        "id": "room-0",
        "name": "Room (JSON)",
        "url": "/v2/entities?type=Room",
        "format": "JSON",
        "description": "Access Room entities via NGSIv2 API"
      },
      {
        "id": "room-1",
        "name": "Room (LD+JSON)",
        "url": "/ngsi-ld/v1/entities?type=Room",
        "format": "LD+JSON",
        "description": "Access Room entities via NGSI-LD API"
      }
    ],
    "tags": [
      { "name": "Room" }
    ]
  }
}
```

### GET /catalog/ckan/current_package_list_with_resources

リソース情報付きのページネーション対応パッケージ一覧。

```bash
curl "https://api.vela.geolonia.com/catalog/ckan/current_package_list_with_resources?limit=10&offset=0" \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## エンドポイント一覧

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/catalog` | 完全な DCAT-AP カタログ |
| GET | `/catalog/datasets` | データセット一覧（DCAT） |
| GET | `/catalog/datasets/{datasetId}` | 個別データセット（DCAT） |
| GET | `/catalog/datasets/{datasetId}/sample` | サンプルデータ |
| GET | `/catalog/ckan/package_list` | CKAN：パッケージ ID 一覧 |
| GET | `/catalog/ckan/package_show` | CKAN：パッケージ詳細 |
| GET | `/catalog/ckan/current_package_list_with_resources` | CKAN：ページネーション対応一覧 |

## CKAN ハーベスタ連携

CKAN ポータルを Vela OS に接続するには：

1. CKAN インスタンスで新しいハーベストソースを作成
2. ソース URL を Vela OS のカタログエンドポイントに設定
3. CKAN ハーベスタが `package_list` でデータセットを検出し、`package_show` で詳細を取得
4. エンティティタイプが変更されるとデータセットが自動的に更新

## マルチテナンシー

カタログ API はマルチテナンシーに対応しています。`Fiware-Service` ヘッダーを使用してカタログを特定のテナントにスコープします：

```bash
curl https://api.vela.geolonia.com/catalog \
  -H "Fiware-Service: smart_city" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

各テナントのカタログには、そのテナントに属するエンティティタイプとデータのみが含まれます。
