import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join, relative } from 'path'

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

describe('code block language identifiers', () => {
  const allFiles = collectMdFiles(DOCS_DIR)

  it('all code blocks have a language identifier', () => {
    const violations: string[] = []

    for (const file of allFiles) {
      const content = readFileSync(file, 'utf-8')
      const lines = content.split('\n')
      let inCodeBlock = false

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const trimmed = line.trimStart()

        if (trimmed.startsWith('```')) {
          if (!inCodeBlock) {
            // Opening fence
            const afterBackticks = trimmed.slice(3).trim()
            if (!afterBackticks) {
              violations.push(`${relative(DOCS_DIR, file)}:${i + 1}`)
            }
            inCodeBlock = true
          } else {
            // Closing fence
            inCodeBlock = false
          }
        }
      }
    }

    expect(
      violations,
      `Code blocks without language identifier:\n${violations.join('\n')}`
    ).toEqual([])
  })
})
