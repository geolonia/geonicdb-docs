import { describe, it, expect } from 'vitest'
import { readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

const DOCS_DIR = join(process.cwd(), 'docs')
const EN_DIR = join(DOCS_DIR, 'en')
const JA_DIR = join(DOCS_DIR, 'ja')

function collectMdFiles(dir: string, base: string): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectMdFiles(fullPath, base))
    } else if (entry.name.endsWith('.md')) {
      results.push(relative(base, fullPath))
    }
  }
  return results.sort()
}

function fileExists(dir: string, relPath: string): boolean {
  try {
    statSync(join(dir, relPath))
    return true
  } catch {
    return false
  }
}

describe('JP/EN file parity', () => {
  const enFiles = collectMdFiles(EN_DIR, EN_DIR)
  const jaFiles = collectMdFiles(JA_DIR, JA_DIR)

  it('every EN file has a corresponding JA file', () => {
    const missing = enFiles.filter((f) => !fileExists(JA_DIR, f))
    expect(missing, `JA missing files:\n${missing.join('\n')}`).toEqual([])
  })

  it('every JA file has a corresponding EN file', () => {
    const missing = jaFiles.filter((f) => !fileExists(EN_DIR, f))
    expect(missing, `EN missing files:\n${missing.join('\n')}`).toEqual([])
  })
})
