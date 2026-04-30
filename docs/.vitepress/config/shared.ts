import { defineConfig } from 'vitepress'

export const shared = defineConfig({
  title: 'GeonicDB',
  description: 'FIWARE Orion-compatible Context Broker on AWS Lambda',

  base: '/',
  // CI's sync-and-translate workflow regenerates docs/en/changelog.md from
  // upstream CHANGELOG.md before build. The regenerated file has no git history
  // for that revision, which crashes VitePress SSR with
  // "Cannot read properties of undefined (reading 'sha')".
  // Disabled until sync flow commits before build, or transformPageData guards.
  lastUpdated: false,
  cleanUrls: true,
  ignoreDeadLinks: true,

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/geonicdb-logo.svg' }],
  ],

  themeConfig: {
    logo: '/geonicdb-logo.svg',

    socialLinks: [
      { icon: 'github', link: 'https://github.com/geolonia/geonicdb' },
    ],

    search: {
      provider: 'local',
    },
  },
})
