import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, relative, dirname, resolve } from 'path'

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

function isExternalLink(link: string): boolean {
  return /^https?:\/\//.test(link) || link.startsWith('mailto:')
}

function isAnchorOnly(link: string): boolean {
  return link.startsWith('#')
}

describe('internal link validation', () => {
  const allFiles = collectMdFiles(DOCS_DIR)

  it('all internal links point to existing files', () => {
    const broken: string[] = []
    // Regex for markdown links: [text](link) — exclude images ![alt](img)
    const linkRegex = /(?<!!)\[([^\]]*)\]\(([^)]+)\)/g

    for (const file of allFiles) {
      const content = readFileSync(file, 'utf-8')
      let match: RegExpExecArray | null

      while ((match = linkRegex.exec(content)) !== null) {
        const link = match[2].split('#')[0].split('?')[0] // strip anchor and query
        if (!link || isExternalLink(match[2]) || isAnchorOnly(match[2])) continue

        // Resolve the link relative to the file or docs root
        let targetPath: string
        if (link.startsWith('/')) {
          // Absolute path from docs root — strip base path /vela-docs/ if present
          const cleanLink = link.replace(/^\/vela-docs\//, '/')
          targetPath = join(DOCS_DIR, cleanLink.slice(1))
        } else {
          // Relative path
          targetPath = resolve(dirname(file), link)
        }

        // VitePress clean URLs: /en/foo → docs/en/foo.md or docs/en/foo/index.md
        const candidates = [
          targetPath,
          targetPath + '.md',
          join(targetPath, 'index.md'),
          targetPath + '/index.md',
        ]

        const found = candidates.some((c) => existsSync(c))
        if (!found) {
          const lineNum = content.slice(0, match.index).split('\n').length
          broken.push(
            `${relative(DOCS_DIR, file)}:${lineNum} → ${match[2]}`
          )
        }
      }
    }

    expect(
      broken,
      `Broken internal links:\n${broken.join('\n')}`
    ).toEqual([])
  })
})
