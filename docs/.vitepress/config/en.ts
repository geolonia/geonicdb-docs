import { DefaultTheme, defineConfig } from 'vitepress'

export const en = defineConfig({
  lang: 'en',
  description: 'FIWARE Orion-compatible Context Broker on AWS Lambda',

  themeConfig: {
    nav: nav(),
    sidebar: sidebar(),
  },
})

function nav(): DefaultTheme.NavItem[] {
  return [
    { text: 'Vela OS', link: '/en/introduction/what-is-vela' },
    { text: 'Getting Started', link: '/en/getting-started/installation' },
    { text: 'API Reference', link: '/en/api-reference/ngsiv2' },
    { text: 'Features', link: '/en/features/subscriptions' },
    { text: 'AI', link: '/en/ai-integration/overview' },
    { text: 'Changelog', link: '/en/changelog' },
    {
      text: 'GitHub',
      link: 'https://github.com/geolonia/vela',
      target: '_blank',
    },
  ]
}

function sidebar(): DefaultTheme.Sidebar {
  return {
    '/en/': [
      {
        text: 'Introduction',
        items: [
          { text: 'What is Vela?', link: '/en/introduction/what-is-vela' },
          { text: 'Why Vela?', link: '/en/introduction/why-vela' },
          { text: 'Architecture', link: '/en/introduction/architecture' },
          { text: 'Quick Start', link: '/en/introduction/quick-start' },
        ],
      },
      {
        text: 'Getting Started',
        items: [
          { text: 'Installation', link: '/en/getting-started/installation' },
          { text: 'First Entity Tutorial', link: '/en/getting-started/first-entity' },
          { text: 'Demo App', link: '/en/getting-started/demo-app' },
        ],
      },
      {
        text: 'Core Concepts',
        items: [
          { text: 'NGSI Data Model', link: '/en/core-concepts/ngsi-data-model' },
          { text: 'Multi-Tenancy', link: '/en/core-concepts/multi-tenancy' },
          { text: 'NGSIv2 vs NGSI-LD', link: '/en/core-concepts/ngsiv2-vs-ngsild' },
          { text: 'Query Language', link: '/en/core-concepts/query-language' },
        ],
      },
      {
        text: 'API Reference',
        items: [
          { text: 'NGSIv2 API', link: '/en/api-reference/ngsiv2' },
          { text: 'NGSI-LD API', link: '/en/api-reference/ngsild' },
          { text: 'Admin API', link: '/en/api-reference/admin' },
          { text: 'Endpoints', link: '/en/api-reference/endpoints' },
          { text: 'Pagination', link: '/en/api-reference/pagination' },
          { text: 'Status Codes', link: '/en/api-reference/status-codes' },
        ],
      },
      {
        text: 'Features',
        items: [
          { text: 'Subscriptions', link: '/en/features/subscriptions' },
          { text: 'Federation', link: '/en/features/federation' },
          { text: 'Geo / ZFXY', link: '/en/features/geo-zfxy' },
          { text: 'Vector Tiles', link: '/en/features/vector-tiles' },
          { text: 'Temporal', link: '/en/features/temporal' },
          { text: 'Catalog', link: '/en/features/catalog' },
          { text: 'Smart Data Models', link: '/en/features/smart-data-models' },
          { text: 'Snapshots', link: '/en/features/snapshots' },
        ],
      },
      {
        text: 'AI Integration',
        items: [
          { text: 'Overview', link: '/en/ai-integration/overview' },
          { text: 'MCP Server', link: '/en/ai-integration/mcp-server' },
          { text: 'llms.txt', link: '/en/ai-integration/llms-txt' },
          { text: 'tools.json', link: '/en/ai-integration/tools-json' },
          { text: 'Examples', link: '/en/ai-integration/examples' },
        ],
      },
      {
        text: 'Security (Coming Soon)',
        items: [
          { text: 'Overview', link: '/en/security/' },
        ],
      },
      {
        text: 'Japan Standards',
        items: [
          { text: 'CADDE', link: '/en/japan-standards/cadde' },
          { text: 'Spatial ID / ZFXY', link: '/en/japan-standards/spatial-id-zfxy' },
          { text: 'Smart City Cases', link: '/en/japan-standards/smart-city-cases' },
        ],
      },
      {
        text: 'Migration',
        items: [
          { text: 'Orion to Vela Guide', link: '/en/migration/orion-to-vela' },
          { text: 'Compatibility Matrix', link: '/en/migration/compatibility-matrix' },
        ],
      },
      {
        text: 'Changelog',
        items: [
          { text: 'Changelog', link: '/en/changelog' },
        ],
      },
    ],
  }
}
