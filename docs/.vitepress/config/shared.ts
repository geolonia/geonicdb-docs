import { defineConfig } from 'vitepress'

export const shared = defineConfig({
  title: 'Vela OS',
  description: 'FIWARE Orion-compatible Context Broker on AWS Lambda',

  lastUpdated: true,
  cleanUrls: true,
  ignoreDeadLinks: true,

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/vela-logo.svg' }],
  ],

  themeConfig: {
    logo: '/vela-logo.svg',

    socialLinks: [
      { icon: 'github', link: 'https://github.com/geolonia/vela' },
    ],

    search: {
      provider: 'local',
    },
  },
})
