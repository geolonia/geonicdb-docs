import { test, expect } from '@playwright/test'
import { readdirSync } from 'fs'
import { join, relative } from 'path'

const DOCS_DIR = join(process.cwd(), 'docs')

function collectMdFiles(dir: string, base: string): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.name.startsWith('.')) continue
    if (entry.isDirectory()) {
      results.push(...collectMdFiles(fullPath, base))
    } else if (entry.name.endsWith('.md')) {
      results.push(relative(base, fullPath))
    }
  }
  return results.sort()
}

function mdPathToUrl(mdPath: string): string {
  // Use relative URLs (without leading /) so Playwright resolves against baseURL path
  let url = mdPath.replace(/\.md$/, '')
  if (url.endsWith('/index')) {
    url = url.slice(0, -'index'.length)
  }
  return './' + url
}

const allPages = collectMdFiles(DOCS_DIR, DOCS_DIR)
  // exclude root index.md (redirect page)
  .filter((f) => f !== 'index.md')
  .map((f) => ({ file: f, url: mdPathToUrl(f) }))

test.describe('All pages render', () => {
  for (const { file, url } of allPages) {
    test(`${file} renders at ${url}`, async ({ page }) => {
      const response = await page.goto(url)
      expect(response?.status()).toBe(200)
      // Check page has content (not a blank error page)
      await expect(page.locator('#VPContent')).toBeVisible()
    })
  }
})
