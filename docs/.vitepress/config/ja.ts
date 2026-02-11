import { DefaultTheme, defineConfig } from 'vitepress'

export const ja = defineConfig({
  lang: 'ja',
  description: 'AWS Lambda 上で動作する FIWARE Orion 互換 Context Broker',

  themeConfig: {
    nav: nav(),
    sidebar: sidebar(),

    outline: {
      label: '目次',
    },

    lastUpdated: {
      text: '最終更新',
    },

    docFooter: {
      prev: '前のページ',
      next: '次のページ',
    },
  },
})

function nav(): DefaultTheme.NavItem[] {
  return [
    { text: 'Vela OS', link: '/ja/introduction/what-is-vela' },
    { text: 'はじめに', link: '/ja/getting-started/installation' },
    { text: 'API リファレンス', link: '/ja/api-reference/ngsiv2' },
    { text: '機能', link: '/ja/features/subscriptions' },
    { text: 'AI', link: '/ja/ai-integration/overview' },
    { text: '変更履歴', link: '/ja/changelog' },
    {
      text: 'GitHub',
      link: 'https://github.com/geolonia/vela',
      target: '_blank',
    },
  ]
}

function sidebar(): DefaultTheme.Sidebar {
  return {
    '/ja/': [
      {
        text: 'はじめに',
        items: [
          { text: 'Vela とは？', link: '/ja/introduction/what-is-vela' },
          { text: 'Vela を選ぶ理由', link: '/ja/introduction/why-vela' },
          { text: 'アーキテクチャ', link: '/ja/introduction/architecture' },
          { text: 'クイックスタート', link: '/ja/introduction/quick-start' },
        ],
      },
      {
        text: 'はじめる',
        items: [
          { text: 'インストール', link: '/ja/getting-started/installation' },
          { text: '最初のエンティティ', link: '/ja/getting-started/first-entity' },
          { text: 'デモアプリ', link: '/ja/getting-started/demo-app' },
        ],
      },
      {
        text: '基本概念',
        items: [
          { text: 'NGSI データモデル', link: '/ja/core-concepts/ngsi-data-model' },
          { text: 'マルチテナンシー', link: '/ja/core-concepts/multi-tenancy' },
          { text: 'NGSIv2 vs NGSI-LD', link: '/ja/core-concepts/ngsiv2-vs-ngsild' },
          { text: 'クエリ言語', link: '/ja/core-concepts/query-language' },
        ],
      },
      {
        text: 'API リファレンス',
        items: [
          { text: 'NGSIv2 API', link: '/ja/api-reference/ngsiv2' },
          { text: 'NGSI-LD API', link: '/ja/api-reference/ngsild' },
          { text: '管理 API', link: '/ja/api-reference/admin' },
          { text: 'エンドポイント', link: '/ja/api-reference/endpoints' },
          { text: 'ページネーション', link: '/ja/api-reference/pagination' },
          { text: 'ステータスコード', link: '/ja/api-reference/status-codes' },
        ],
      },
      {
        text: '機能',
        items: [
          { text: 'サブスクリプション', link: '/ja/features/subscriptions' },
          { text: 'フェデレーション', link: '/ja/features/federation' },
          { text: 'ジオクエリ / ZFXY', link: '/ja/features/geo-zfxy' },
          { text: 'ベクトルタイル', link: '/ja/features/vector-tiles' },
          { text: 'テンポラル', link: '/ja/features/temporal' },
          { text: 'カタログ', link: '/ja/features/catalog' },
          { text: 'Smart Data Models', link: '/ja/features/smart-data-models' },
          { text: 'スナップショット', link: '/ja/features/snapshots' },
        ],
      },
      {
        text: 'AI 連携',
        items: [
          { text: '概要', link: '/ja/ai-integration/overview' },
          { text: 'MCP サーバー', link: '/ja/ai-integration/mcp-server' },
          { text: 'llms.txt', link: '/ja/ai-integration/llms-txt' },
          { text: 'tools.json', link: '/ja/ai-integration/tools-json' },
          { text: '活用例', link: '/ja/ai-integration/examples' },
        ],
      },
      {
        text: 'セキュリティ (Coming Soon)',
        items: [
          { text: '概要', link: '/ja/security/' },
        ],
      },
      {
        text: '日本標準規格',
        items: [
          { text: 'CADDE', link: '/ja/japan-standards/cadde' },
          { text: '空間ID / ZFXY', link: '/ja/japan-standards/spatial-id-zfxy' },
          { text: 'スマートシティ事例', link: '/ja/japan-standards/smart-city-cases' },
        ],
      },
      {
        text: 'マイグレーション',
        items: [
          { text: 'Orion → Vela ガイド', link: '/ja/migration/orion-to-vela' },
          { text: '互換性マトリックス', link: '/ja/migration/compatibility-matrix' },
        ],
      },
      {
        text: '変更履歴',
        items: [
          { text: '変更履歴', link: '/ja/changelog' },
        ],
      },
    ],
  }
}
