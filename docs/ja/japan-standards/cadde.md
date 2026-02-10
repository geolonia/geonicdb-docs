---
title: CADDE 連携
description: Vela OS は日本の分野間データ連携基盤 CADDE（Connector Architecture for Decentralized Data Exchange）と連携します。
outline: deep
---

# CADDE 連携

Vela OS は **CADDE**（Connector Architecture for Decentralized Data Exchange）と連携します。CADDE は、異なるデータ提供者・消費者間でのデータ交換を実現する日本のデータ連携アーキテクチャです。

## CADDE とは

CADDE は、日本のデジタル政策フレームワークの下で開発された、分野横断的なデータ交換を促進するアーキテクチャです。以下を提供します:

- **分散型データ交換** — 提供者と消費者間のデータ連携
- **来歴追跡** — データの出所と監査情報
- **標準認証** — Bearer トークンと JWT による認証
- **メタデータ伝播** — HTTP ヘッダーによる情報伝達

## Vela の CADDE サポート

Vela OS は **CADDE 対応データ提供者** として機能します。CADDE コネクタからデータリクエストが送られると、Vela は CADDE 固有のヘッダーを処理し、認証を検証（有効時）し、来歴情報付きでデータを返却します。

### リクエストフロー

```text
CADDE 利用者
    ↓
CADDE コネクタ（ブローカー）
    ↓ (x-cadde-* ヘッダー)
Vela OS（データ提供者）
    ↓ (x-cadde-provenance-* ヘッダー)
CADDE コネクタ
    ↓
CADDE 利用者
```

## CADDE リクエストヘッダー

CADDE コネクタが Vela にアクセスする際、以下のヘッダーを含めます:

| ヘッダー | 必須 | 説明 |
|---------|------|------|
| `x-cadde-resource-url` | いいえ | アクセス対象のリソース URL |
| `x-cadde-resource-api-type` | いいえ | API タイプ（例: `api/ngsi`） |
| `x-cadde-provider` | いいえ | データ提供者の識別子 |
| `x-cadde-options` | いいえ | キーバリューオプション（セミコロン区切り） |
| `Authorization` | 条件付き | `Bearer <token>`（CADDE 認証有効時） |

いずれかの `x-cadde-*` ヘッダーが存在すると CADDE リクエストとして識別されます。

## CADDE レスポンスヘッダー（来歴情報）

Vela は CADDE リクエストへのレスポンスに来歴ヘッダーを自動付与します:

| ヘッダー | 説明 | 例 |
|---------|------|-----|
| `x-cadde-provenance-id` | 一意のリクエスト ID（Fiware-Correlator を使用） | `a1b2c3d4-...` |
| `x-cadde-provenance-timestamp` | ISO 8601 形式のレスポンスタイムスタンプ | `2026-02-10T12:00:00.000Z` |
| `x-cadde-provenance-provider` | データ提供者の識別子 | `provider-001` |
| `x-cadde-provenance-resource-url` | アクセスされた実際のリソース URL | `https://api.vela.geolonia.com/v2/entities` |

## 設定

CADDE 機能は環境変数で設定します:

| 変数 | デフォルト | 説明 |
|------|---------|------|
| `CADDE_ENABLED` | `false` | CADDE 機能を有効化 |
| `CADDE_AUTH_ENABLED` | `false` | CADDE リクエストに Bearer トークン認証を要求 |
| `CADDE_DEFAULT_PROVIDER` | — | リクエストで未指定時のデフォルト提供者 ID |
| `CADDE_JWT_ISSUER` | — | JWT の発行者（`iss` クレーム）の期待値 |
| `CADDE_JWT_AUDIENCE` | — | JWT の受取人（`aud` クレーム）の期待値 |
| `CADDE_JWKS_URL` | — | JWT 署名検証用の JWKS 公開鍵取得 URL |

## 認証

`CADDE_AUTH_ENABLED=true` の場合、Vela は `Authorization` ヘッダーの Bearer トークンを検証します:

1. **JWT デコード** — トークンのデコードと構造の検証
2. **署名検証** — JWKS エンドポイントの公開鍵による署名検証
3. **クレーム検証** — 発行者（`iss`）、受取人（`aud`）、有効期限（`exp`）の確認
4. **JWKS キャッシュ** — 公開鍵は5分間キャッシュされネットワークリクエストを最小化

サポートされる JWT アルゴリズム: RSA（RS256, RS384, RS512）、ECDSA（ES256, ES384, ES512）。

## 使用例: CADDE リクエスト

```bash
curl https://api.vela.geolonia.com/v2/entities?type=AirQualityObserved \
  -H "x-cadde-resource-url: https://data.example.jp/air-quality" \
  -H "x-cadde-resource-api-type: api/ngsi" \
  -H "x-cadde-provider: tokyo-env-agency" \
  -H "Authorization: Bearer YOUR_CADDE_TOKEN"
```

レスポンスには標準の NGSI データに加えて CADDE 来歴ヘッダーが含まれます:

```text
HTTP/1.1 200 OK
x-cadde-provenance-id: a1b2c3d4-e5f6-7890-abcd-ef1234567890
x-cadde-provenance-timestamp: 2026-02-10T12:00:00.000Z
x-cadde-provenance-provider: tokyo-env-agency
x-cadde-provenance-resource-url: https://api.vela.geolonia.com/v2/entities?type=AirQualityObserved
Content-Type: application/json

[...]
```

## 次のステップ

- [空間ID / ZFXY](/ja/japan-standards/spatial-id-zfxy) — 3D 空間識別標準
- [スマートシティ事例](/ja/japan-standards/smart-city-cases) — Vela を使ったスマートシティのユースケース
