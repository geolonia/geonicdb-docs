---
title: クエリ言語
description: 属性値、メタデータ、スコープ、言語によるエンティティフィルタリングのクエリ言語構文 — q、mq、scopeQ、pick、omit、lang パラメータの解説。
outline: deep
---

# クエリ言語

Vela OS はエンティティをフィルタリングするための強力なクエリ言語を提供します。このページでは、NGSIv2 と NGSI-LD API で利用可能なすべてのクエリパラメータを解説します。

## 属性クエリ（`q`）

`q` パラメータは属性値でエンティティをフィルタリングします。NGSIv2 と NGSI-LD の両方でサポートされています。

### 演算子

| 演算子 | 説明 | 例 |
|-------|------|-----|
| `==` | 等しい | `temperature==23` |
| `!=` | 等しくない | `status!=inactive` |
| `>` | より大きい | `temperature>20` |
| `<` | より小さい | `temperature<30` |
| `>=` | 以上 | `temperature>=20` |
| `<=` | 以下 | `temperature<=30` |
| `..` | 範囲（`==` と組み合わせ、境界値を含む） | `temperature==20..30` |
| `~=` | パターンマッチ（正規表現） | `name~=Room.*` |

### 基本的な例

温度が 25 度を超える部屋を検索：

```bash
curl -s "https://api.vela.geolonia.com/v2/entities?type=Room&q=temperature>25" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq .
```

ステータスが "available" と等しい部屋を検索：

```bash
curl -s "https://api.vela.geolonia.com/v2/entities?type=Room&q=status==available" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq .
```

NGSI-LD でも同じ `q` パラメータが使用可能：

```bash
curl -s "https://api.vela.geolonia.com/ngsi-ld/v1/entities?type=Room&q=temperature>25" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "NGSILD-Tenant: smartbuilding" \
  -H "Accept: application/ld+json" | jq .
```

### 複数条件

セミコロン（`;`）で AND 条件を指定：

```text
q=temperature>20;pressure<800
```

パイプ（`|`）で OR 条件を指定：

```text
q=temperature==23|temperature==35
```

セミコロンはパイプよりも**優先度が高い**です。以下のクエリは「（temperature > 25 AND humidity < 40）OR（status == active）」を意味します：

```text
q=temperature>25;humidity<40|status==active
```

**例** -- 2 階の使用中で高温の部屋を検索：

```bash
curl -s "https://api.vela.geolonia.com/v2/entities?type=Room&q=floor==2;temperature>25;status==occupied" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq '.[].id'
```

### 範囲クエリ

`==` 演算子と `..` を組み合わせて、境界値を含む範囲でフィルタリング：

```text
q=temperature==20..30
```

これは temperature が 20 から 30 の範囲（境界値を含む）のエンティティにマッチします。

```bash
curl -s "https://api.vela.geolonia.com/v2/entities?type=Room&q=temperature==20..30" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq .
```

### 文字列マッチング

`~=` で正規表現パターンマッチ、`==` で完全一致：

```text
q=status~=act       # 正規表現部分一致（"active"、"actual" 等にマッチ）
q=name==Room1        # 完全一致
q=name~=Room.*       # 正規表現マッチ（"Room1"、"Room201" 等にマッチ）
```

```bash
# 名前が "Conference.*" パターンにマッチするエンティティを検索
curl -s "https://api.vela.geolonia.com/v2/entities?type=Room&q=name~=Conference.*" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq .
```

## メタデータクエリ（`mq`） {#metadata-query}

::: info NGSIv2 のみ
`mq` パラメータは NGSIv2 API でのみ利用可能です。NGSI-LD では、メタデータはサブ属性として表現され、`q` パラメータで直接クエリできます。
:::

`mq` パラメータは属性のメタデータ値に基づいてエンティティをフィルタリングします。`attributeName.metadataName` の後に演算子と値を指定する構文を使用します。

### 演算子

| 演算子 | 説明 | 例 |
|-------|------|-----|
| `==` | 等しい | `mq=temperature.accuracy==0.95` |
| `!=` | 等しくない | `mq=temperature.accuracy!=0` |
| `>` | より大きい | `mq=temperature.accuracy>0.9` |
| `<` | より小さい | `mq=temperature.accuracy<0.5` |
| `>=` | 以上 | `mq=temperature.accuracy>=0.9` |
| `<=` | 以下 | `mq=temperature.accuracy<=1.0` |
| `~=` | パターンマッチ（正規表現） | `mq=temperature.unit~=Cel.*` |
| `..` | 範囲（境界値を含む） | `mq=temperature.accuracy==0.9..1.0` |
| `,` | OR リスト | `mq=temperature.unit==Celsius,Fahrenheit` |

複数条件は `q` パラメータと同じ `;`（AND）と `|`（OR）構文を使用します。

### 使用例

temperature 属性の accuracy が 0.9 を超えるエンティティを検索：

```bash
curl -s "https://api.vela.geolonia.com/v2/entities?type=Room&mq=temperature.accuracy>0.9" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq .
```

accuracy が 0.9 から 1.0 の範囲にあるエンティティを検索：

```bash
curl -s "https://api.vela.geolonia.com/v2/entities?type=Room&mq=temperature.accuracy==0.9..1.0" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq .
```

単位が Celsius または Fahrenheit のエンティティを検索：

```bash
curl -s "https://api.vela.geolonia.com/v2/entities?type=Room&mq=temperature.unit==Celsius,Fahrenheit" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq .
```

複数のメタデータ条件を AND で組み合わせ：

```bash
curl -s "https://api.vela.geolonia.com/v2/entities?type=Room&mq=temperature.accuracy>0.9;temperature.unit==Celsius" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq .
```

## スコープクエリ（`scopeQ`） {#scope-query}

::: info NGSI-LD のみ
`scopeQ` パラメータは NGSI-LD API でのみ利用可能です。NGSIv2 はスコープクエリをサポートしていません。
:::

`scopeQ` パラメータはスコープ階層でエンティティをフィルタリングします。スコープはパス形式の文字列（例: `/Japan/Tokyo`）で、エンティティを階層的なカテゴリに分類します。

### 演算子

| パターン | 説明 | 例 |
|---------|------|-----|
| `/path` | 完全一致 | `scopeQ=/Japan/Tokyo` |
| `/path/+` | 1 レベル下（直接の子のみ） | `scopeQ=/Japan/+` |
| `/path/#` | すべての子孫（再帰的） | `scopeQ=/Japan/#` |
| `;` | AND（エンティティはすべてのスコープにマッチする必要あり） | `scopeQ=/Japan/Tokyo;/IoT` |

### 使用例

スコープが `/Japan/Tokyo` と完全一致するエンティティを検索：

```bash
curl -s "https://api.vela.geolonia.com/ngsi-ld/v1/entities?scopeQ=/Japan/Tokyo" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "NGSILD-Tenant: smartcity" \
  -H "Accept: application/ld+json" | jq .
```

`/Japan` の 1 レベル下にあるエンティティを検索（例: `/Japan/Tokyo`、`/Japan/Osaka`）：

```bash
curl -s "https://api.vela.geolonia.com/ngsi-ld/v1/entities?scopeQ=/Japan/+" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "NGSILD-Tenant: smartcity" \
  -H "Accept: application/ld+json" | jq .
```

`/Japan` 配下のすべてのエンティティを検索（例: `/Japan/Tokyo`、`/Japan/Tokyo/Shibuya`）：

```bash
curl -s "https://api.vela.geolonia.com/ngsi-ld/v1/entities?scopeQ=/Japan/%23" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "NGSILD-Tenant: smartcity" \
  -H "Accept: application/ld+json" | jq .
```

::: tip URL エンコーディング
`#` 文字はクエリ文字列で使用する場合、`%23` に URL エンコードする必要があります。
:::

`/Japan/Tokyo` と `/IoT` の両方のスコープに属するエンティティを検索：

```bash
curl -s "https://api.vela.geolonia.com/ngsi-ld/v1/entities?scopeQ=/Japan/Tokyo;/IoT" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "NGSILD-Tenant: smartcity" \
  -H "Accept: application/ld+json" | jq .
```

## 属性プロジェクション（`pick` と `omit`） {#attribute-projection}

::: info NGSI-LD のみ
`pick` と `omit` パラメータは NGSI-LD API でのみ利用可能です。NGSIv2 では、同様の機能として `attrs` パラメータを使用します（選択のみ、除外は不可）。
:::

### `pick` -- 特定の属性を選択

レスポンスに指定した属性のみを含めます。`id` と `type` フィールドは `pick` の値に関係なく常に含まれます。

```bash
curl -s "https://api.vela.geolonia.com/ngsi-ld/v1/entities/urn:ngsi-ld:Room:001?pick=temperature,humidity" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "NGSILD-Tenant: smartbuilding" \
  -H "Accept: application/ld+json" | jq .
```

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "id": "urn:ngsi-ld:Room:001",
  "type": "Room",
  "temperature": {
    "type": "Property",
    "value": 23.5
  },
  "humidity": {
    "type": "Property",
    "value": 60
  }
}
```

### `omit` -- 特定の属性を除外

レスポンスから指定した属性を除外します。`id` と `type` は除外できません。

```bash
curl -s "https://api.vela.geolonia.com/ngsi-ld/v1/entities/urn:ngsi-ld:Room:001?omit=location" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "NGSILD-Tenant: smartbuilding" \
  -H "Accept: application/ld+json" | jq .
```

::: warning
`pick` と `omit` は相互排他です。同じリクエストで両方を使用するとエラーになります。
:::

### NGSIv2 の対応

NGSIv2 では、`attrs` パラメータが `pick` と同じ機能を提供します：

```bash
curl -s "https://api.vela.geolonia.com/v2/entities/urn:ngsi-ld:Room:001?attrs=temperature,humidity" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq .
```

NGSIv2 には `omit` に相当する機能はありません。

## 言語フィルタリング（`lang`） {#language-filtering}

::: info NGSI-LD のみ
`lang` パラメータは NGSI-LD API でのみ利用可能です。
:::

`lang` パラメータは `LanguageProperty` 属性をフィルタリングし、指定した言語の値を返します。`lang` を指定すると、`LanguageProperty` はリクエストされた言語の値を持つ通常の `Property` に変換されます。

パラメータは [BCP 47](https://www.rfc-editor.org/info/bcp47) 言語タグを受け付けます。カンマ区切りの優先度リストで複数の言語を指定するか、`*` ですべての言語を返すことができます。

### 使用例

多言語名を持つエンティティがある場合：

```json
{
  "id": "urn:ngsi-ld:Museum:M001",
  "type": "Museum",
  "name": {
    "type": "LanguageProperty",
    "languageMap": {
      "en": "Tokyo National Museum",
      "ja": "東京国立博物館"
    }
  }
}
```

`lang=ja` でリクエスト：

```bash
curl -s "https://api.vela.geolonia.com/ngsi-ld/v1/entities/urn:ngsi-ld:Museum:M001?lang=ja" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "NGSILD-Tenant: smartcity" \
  -H "Accept: application/ld+json" | jq .
```

レスポンス：

```json
{
  "id": "urn:ngsi-ld:Museum:M001",
  "type": "Museum",
  "name": {
    "type": "Property",
    "value": "東京国立博物館",
    "lang": "ja"
  }
}
```

## API 利用可能性のまとめ

| パラメータ | NGSIv2 | NGSI-LD | 説明 |
|-----------|--------|---------|------|
| `q` | あり | あり | 属性値フィルタリング |
| `mq` | あり | なし（サブ属性には `q` を使用） | メタデータ値フィルタリング |
| `scopeQ` | なし | あり | スコープ階層フィルタリング |
| `pick` | なし（`attrs` を使用） | あり | 指定した属性のみ含める |
| `omit` | なし | あり | 指定した属性を除外 |
| `lang` | なし | あり | LanguageProperty の言語選択 |

## クエリパラメータの組み合わせ

単一のリクエストで複数のクエリパラメータを組み合わせて、精密なフィルタを作成できます：

```bash
# NGSI-LD: 東京スコープ内で温度が 25 を超える部屋を、temperature と humidity のみで取得
curl -s "https://api.vela.geolonia.com/ngsi-ld/v1/entities?type=Room&q=temperature>25&scopeQ=/Japan/Tokyo&pick=temperature,humidity" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "NGSILD-Tenant: smartcity" \
  -H "Accept: application/ld+json" | jq .
```

```bash
# NGSIv2: 温度が 20-30 の範囲かつメタデータの accuracy が 0.9 を超える部屋
curl -s "https://api.vela.geolonia.com/v2/entities?type=Room&q=temperature==20..30&mq=temperature.accuracy>0.9" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq .
```

## 次のステップ

- [NGSI データモデル](/ja/core-concepts/ngsi-data-model) -- エンティティ、属性、メタデータの理解
- [マルチテナンシー](/ja/core-concepts/multi-tenancy) -- テナントヘッダーによるデータ分離
- [最初のエンティティチュートリアル](/ja/getting-started/first-entity) -- クエリ例を含む実践ウォークスルー
