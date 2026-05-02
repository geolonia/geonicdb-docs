import type MarkdownIt from 'markdown-it'
import { defineConfig } from 'vitepress'

function addVPreToInlineCode(md: MarkdownIt) {
  // VitePress 1.x does not escape {{ }} in inline code spans, so GitHub Actions
  // syntax like `${{ github.sha }}` in upstream CHANGELOG.md causes Vue SSR to
  // try to evaluate `github.sha` and crash. Adding v-pre prevents Vue from
  // processing template expressions inside inline code elements.
  const origCodeInline = md.renderer.rules.code_inline!
  md.renderer.rules.code_inline = (tokens, idx, options, env, self) => {
    return origCodeInline(tokens, idx, options, env, self).replace(
      /^<code/,
      '<code v-pre'
    )
  }
}

export const shared = defineConfig({
  title: 'GeonicDB',
  description: 'FIWARE Orion-compatible Context Broker on AWS Lambda',

  base: '/',
  lastUpdated: true,
  cleanUrls: true,
  ignoreDeadLinks: true,

  markdown: {
    config: addVPreToInlineCode,
  },

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/geonicdb-logo.svg' }],
  ],

  themeConfig: {
    logo: '/geonicdb-logo.svg',
    siteTitle: false,

    search: {
      provider: 'local',
    },
  },
})
