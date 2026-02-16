import { defineConfig } from 'vitepress'

export const shared = defineConfig({
  title: 'GeonicDB',
  description: 'FIWARE Orion-compatible Context Broker on AWS Lambda',

  base: '/geonicdb-docs/',
  lastUpdated: true,
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
