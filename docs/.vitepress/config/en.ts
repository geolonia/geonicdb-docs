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
    { text: 'GeonicDB', link: '/en/introduction/what-is-geonicdb' },
    { text: 'Getting Started', link: '/en/saas/quickstart' },
    { text: 'API Reference', link: '/en/api-reference/ngsiv2' },
    { text: 'Features', link: '/en/features/subscriptions' },
    { text: 'AI', link: '/en/ai-integration/overview' },
    { text: 'Changelog', link: '/en/changelog' },
  ]
}

function sidebar(): DefaultTheme.Sidebar {
  return {
    '/en/': [
      {
        text: 'Introduction',
        items: [
          { text: 'What is GeonicDB?', link: '/en/introduction/what-is-geonicdb' },
          { text: 'Why GeonicDB?', link: '/en/introduction/why-geonicdb' },
          { text: 'Architecture', link: '/en/introduction/architecture' },
          { text: 'Quick Start', link: '/en/introduction/quick-start' },
        ],
      },
      {
        text: 'SaaS',
        items: [
          { text: 'Quickstart', link: '/en/saas/quickstart' },
          { text: 'Sign Up', link: '/en/saas/sign-up' },
          { text: 'Onboarding', link: '/en/saas/onboarding' },
          { text: 'Tenant Admin User', link: '/en/saas/tenant-admin-user' },
          { text: 'API Key', link: '/en/saas/api-key' },
          { text: 'First API Call', link: '/en/saas/first-call' },
          { text: 'Console', link: '/en/saas/console' },
          { text: 'Demo App', link: '/en/saas/demo-app' },
          { text: 'First Entity Tutorial', link: '/en/saas/first-entity' },
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
          { text: 'NGSIv2 Endpoints', link: '/en/api-reference/ngsiv2-endpoints' },
          { text: 'NGSI-LD API', link: '/en/api-reference/ngsild' },
          { text: 'NGSI-LD Endpoints', link: '/en/api-reference/ngsild-endpoints' },
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
        text: 'Reference',
        items: [
          { text: 'CLI Reference', link: '/en/reference/cli' },
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
          { text: 'Orion to GeonicDB Guide', link: '/en/migration/orion-to-geonicdb' },
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
