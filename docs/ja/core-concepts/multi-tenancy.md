---
title: マルチテナンシー
description: Vela OS が Fiware-Service および Fiware-ServicePath ヘッダーを使用してテナント間のデータを分離する仕組みを解説します。
outline: deep
---

# マルチテナンシー

Vela OS は HTTP ヘッダーによるマルチテナンシーをサポートしており、単一のデプロイメント内で異なるテナント間の完全なデータ分離を実現します。

## テナントヘッダー

| ヘッダー | 必須 | デフォルト | 説明 |
|---------|------|-----------|------|
| `Fiware-Service` | 推奨 | `default` | テナント識別子（英数字とアンダースコアのみ） |
| `Fiware-ServicePath` | 推奨 | `/` | テナント内の階層パス |
| `Fiware-Correlator` | 任意 | 自動生成 | リクエスト相関 ID（トレーシング用） |

### 基本的な使い方

```bash
curl -X POST https://api.vela.geolonia.com/v2/entities \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -H "Fiware-ServicePath: /buildings/floor1" \
  -d '{
    "id": "urn:ngsi-ld:Room:001",
    "type": "Room",
    "temperature": { "type": "Number", "value": 23.5 }
  }'
```

## テナント分離

異なる `Fiware-Service` 値の下にあるデータは**完全に分離**されます：

- テナント `smartcity` で作成されたエンティティは、テナント `production` からは見えません。
- サブスクリプションは同一テナント内のイベントに対してのみトリガーされます。
- フェデレーションクエリはリクエスト元のテナントにスコープされます。

```bash
# テナント "demo" にエンティティを作成
curl -X POST https://api.vela.geolonia.com/v2/entities \
  -H "Fiware-Service: demo" \
  -H "Content-Type: application/json" \
  -d '{"id": "Room1", "type": "Room", "temperature": {"type": "Number", "value": 22}}'

# 何も返されない — 別のテナント
curl https://api.vela.geolonia.com/v2/entities?type=Room \
  -H "Fiware-Service: production"

# Room1 が返される — 同じテナント
curl https://api.vela.geolonia.com/v2/entities?type=Room \
  -H "Fiware-Service: demo"
```

### テナント名のルール

- 自動的に小文字に変換されます。
- 英数字とアンダースコアのみ使用可能です。
- 省略した場合、`default` テナントが使用されます。

## サービスパス

`Fiware-ServicePath` ヘッダーは、テナント**内**での階層的なデータ整理を提供します。

### パスのフォーマット

- `/` で始まる必要があります。
- 各レベルは英数字とアンダースコアのみ使用可能。
- 最大 10 階層、各レベル最大 50 文字。

```text
/                           # ルート
/buildings                  # レベル 1
/buildings/floor1           # レベル 2
/buildings/floor1/room101   # レベル 3
```

### 階層検索

`/#` サフィックスを使用して、パスとそのすべての子孫を検索できます（**クエリ操作のみ**）：

```bash
# /buildings とすべてのサブパスを検索
curl https://api.vela.geolonia.com/v2/entities \
  -H "Fiware-Service: smartcity" \
  -H "Fiware-ServicePath: /buildings/#"
```

### 複数パス

カンマ区切りのパスで複数の場所を同時に検索できます（最大 10 パス、**クエリ操作のみ**）：

```bash
# /park1 と /park2 の両方を検索
curl https://api.vela.geolonia.com/v2/entities \
  -H "Fiware-Service: smartcity" \
  -H "Fiware-ServicePath: /park1, /park2"
```

### デフォルトの動作

| 操作 | ヘッダー省略時 | 説明 |
|------|-------------|------|
| クエリ（GET） | `/` | ルートパスのみ検索 |
| 書き込み（POST/PUT/PATCH/DELETE） | `/` | ルートパスに書き込み |

::: warning
書き込み操作は単一の非階層パスのみ受け付けます。書き込み操作で `/#` や複数パスを使用するとエラーが返されます。
:::

## NGSI-LD のテナントヘッダー

NGSI-LD もテナント分離をサポートしています。Vela OS は両方のヘッダー名を受け付けます：

| ヘッダー | API |
|---------|-----|
| `Fiware-Service` | NGSIv2 および NGSI-LD |
| `NGSILD-Tenant` | NGSI-LD のみ |

両方のヘッダーは同等です — クライアントに適した方を使用してください。

```bash
# NGSI-LD で Fiware-Service を使用
curl https://api.vela.geolonia.com/ngsi-ld/v1/entities?type=Room \
  -H "Fiware-Service: smartcity"

# NGSI-LD で NGSILD-Tenant を使用
curl https://api.vela.geolonia.com/ngsi-ld/v1/entities?type=Room \
  -H "NGSILD-Tenant: smartcity"
```

## ユースケース

### 環境の分離

テナントを使用して開発、ステージング、本番のデータを分離：

```bash
# 開発環境
curl -H "Fiware-Service: dev" ...

# ステージング
curl -H "Fiware-Service: staging" ...

# 本番環境
curl -H "Fiware-Service: prod" ...
```

### 顧客の分離

SaaS アプリケーションでは、各顧客に個別のテナントを割り当て：

```bash
# 顧客 A
curl -H "Fiware-Service: customer_a" ...

# 顧客 B
curl -H "Fiware-Service: customer_b" ...
```

### 部門別の整理

サービスパスを使用して、テナント内のデータを部門や場所別に整理：

```bash
# 異なるフロアのセンサーデータを作成
curl -H "Fiware-Service: building_mgmt" \
     -H "Fiware-ServicePath: /floor1/sensors" ...

curl -H "Fiware-Service: building_mgmt" \
     -H "Fiware-ServicePath: /floor2/sensors" ...

# フロア横断でセンサーデータを検索
curl -H "Fiware-Service: building_mgmt" \
     -H "Fiware-ServicePath: /#" ...
```

## 次のステップ

- [NGSIv2 vs NGSI-LD](/ja/core-concepts/ngsiv2-vs-ngsild) — 両 API の比較
- [クエリ言語](/ja/core-concepts/query-language) — エンティティフィルタリングのクエリ構文
- [エンドポイント](/ja/api-reference/endpoints) — ヘッダーを含む共通 API 仕様
