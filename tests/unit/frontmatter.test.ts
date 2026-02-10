import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join, relative } from 'path'
import { readdirSync } from 'fs'

const DOCS_DIR = join(process.cwd(), 'docs')

function collectMdFiles(dir: string): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.name.startsWith('.')) continue
    if (entry.isDirectory()) {
      results.push(...collectMdFiles(fullPath))
    } else if (entry.name.endsWith('.md')) {
      results.push(fullPath)
    }
  }
  return results.sort()
}

function parseFrontmatter(content: string): Record<string, string> | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return null
  const fm: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim()
      const value = line.slice(colonIdx + 1).trim()
      fm[key] = value
    }
  }
  return fm
}

describe('frontmatter validation', () => {
  const allFiles = collectMdFiles(DOCS_DIR)

  it('every page has a title in frontmatter', () => {
    const missing: string[] = []
    for (const file of allFiles) {
      const content = readFileSync(file, 'utf-8')
      const fm = parseFrontmatter(content)
      if (!fm) {
        // layout: home pages use YAML hero.name instead of title — check for that
        if (content.includes('layout: home')) continue
        missing.push(relative(DOCS_DIR, file))
        continue
      }
      if (!fm['title'] && !fm['layout']) {
        missing.push(relative(DOCS_DIR, file))
      }
    }
    expect(missing, `Files missing title:\n${missing.join('\n')}`).toEqual([])
  })
})
