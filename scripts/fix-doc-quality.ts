import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'

// ---------------------------------------------------------------------------
// fix-doc-quality.ts
// Post-translation quality fix script for geonicdb-docs.
// Fixes: (1) bare code blocks, (2) missing frontmatter titles, (3) file parity
// Processes docs/en/ (translation output) using docs/ja/ (source) as reference.
// ---------------------------------------------------------------------------

/**
 * Infer language identifier from code block content.
 * Priority order: JSON → bash → SQL → HTTP → text
 */
export function inferLanguage(content: string): string {
  const trimmed = content.trimStart()

  // JSON: starts with { or [
  if (/^[{\[]/.test(trimmed)) return 'json'

  // bash: line starts with $
  if (/^\s*\$\s/.test(content)) return 'bash'

  // HTTP: starts with GET/POST/PUT/DELETE/PATCH + URL path
  // Must check before SQL to avoid DELETE matching SQL pattern
  if (/^(GET|POST|PUT|DELETE|PATCH)\s+\//i.test(trimmed)) return 'http'

  // SQL: starts with SELECT/INSERT/UPDATE/CREATE/DROP/ALTER (DELETE handled above)
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\b/i.test(trimmed)) return 'sql'

  return 'text'
}

/**
 * Fix bare code blocks (``` without language) in target content.
 * Uses referenceContent for position-matched language lookup.
 * Falls back to content-based inference if reference has no language either.
 */
export function fixBareCodeBlocks(targetContent: string, referenceContent: string | null): string {
  // Extract code block language identifiers from reference content by order
  const refLanguages: (string | null)[] = []
  if (referenceContent) {
    const refLines = referenceContent.split('\n')
    let inBlock = false
    for (const line of refLines) {
      const trimmed = line.trimStart()
      if (trimmed.startsWith('```')) {
        if (!inBlock) {
          const lang = trimmed.slice(3).trim()
          refLanguages.push(lang || null)
          inBlock = true
        } else {
          inBlock = false
        }
      }
    }
  }

  const lines = targetContent.split('\n')
  const result: string[] = []
  let inBlock = false
  let blockIndex = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trimStart()

    if (trimmed.startsWith('```')) {
      if (!inBlock) {
        const lang = trimmed.slice(3).trim()
        if (!lang) {
          // Bare code block — collect content to infer language
          const contentLines: string[] = []
          let j = i + 1
          while (j < lines.length) {
            const nextTrimmed = lines[j].trimStart()
            if (nextTrimmed.startsWith('```')) break
            contentLines.push(lines[j])
            j++
          }

          // Try position-matched reference language first
          const refLang = refLanguages[blockIndex] ?? null
          const resolvedLang = refLang ?? inferLanguage(contentLines.join('\n'))

          // Preserve original indentation before the backticks
          const indent = line.slice(0, line.length - trimmed.length)
          result.push(`${indent}\`\`\`${resolvedLang}`)
          inBlock = true
          blockIndex++
        } else {
          result.push(line)
          inBlock = true
          blockIndex++
        }
      } else {
        result.push(line)
        inBlock = false
      }
    } else {
      result.push(line)
    }
  }

  return result.join('\n')
}

/**
 * Parse frontmatter from markdown content.
 * Returns null if no frontmatter block found.
 */
export function parseFrontmatter(content: string): Record<string, string> | null {
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

/**
 * Check whether the content already has a title in frontmatter.
 * layout: home pages are considered to have a title (uses hero.name instead).
 */
export function hasFrontmatterTitle(content: string): boolean {
  const fm = parseFrontmatter(content)
  if (!fm) return false
  if (fm['layout'] === 'home') return true
  return !!fm['title']
}

/**
 * Extract title from the first H1 heading in the content.
 * Returns null if no H1 found.
 */
export function extractTitleFromHeading(content: string): string | null {
  // Skip frontmatter block if present
  const withoutFm = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
  const match = withoutFm.match(/^#\s+(.+)/m)
  if (!match) return null
  return match[1].trim()
}

/**
 * Add a title to the frontmatter of the given content.
 * If frontmatter exists, inserts title as the first field.
 * If no frontmatter, creates a minimal frontmatter block.
 */
export function addFrontmatterTitle(content: string, title: string): string {
  const hasFm = /^---\r?\n/.test(content)
  if (hasFm) {
    // Insert title after opening ---
    return content.replace(/^---\r?\n/, `---\ntitle: "${title}"\n`)
  }
  // No frontmatter — prepend new block
  return `---\ntitle: "${title}"\n---\n\n${content}`
}

// ---------------------------------------------------------------------------
// Quality fix runner (exported for testability)
// ---------------------------------------------------------------------------

export interface QualityFixResult {
  codeBlockFixes: number
  titleFixes: number
  parityFixes: number
}

function collectMdFiles(dir: string): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectMdFiles(fullPath))
    } else if (entry.name.endsWith('.md')) {
      results.push(fullPath)
    }
  }
  return results.sort()
}

/**
 * Run all quality fixes on the docs directory.
 * Processes docs/en/ (translation output) using docs/ja/ (source) as reference.
 * Also handles file parity: copies ja-only files to en/ when missing.
 *
 * @param baseDir - Project root directory (defaults to process.cwd())
 * @returns Counts of fixes applied
 */
export function runQualityFixes(baseDir: string = process.cwd()): QualityFixResult {
  const docsDir = join(baseDir, 'docs')
  const jaDir = join(docsDir, 'ja')
  const enDir = join(docsDir, 'en')

  if (!existsSync(jaDir)) {
    console.error(`Error: docs/ja/ not found at ${jaDir}`)
    process.exit(1)
  }

  const jaFiles = collectMdFiles(jaDir)
  let codeBlockFixes = 0
  let titleFixes = 0
  let parityFixes = 0

  // Process docs/en/ files (translation output) using docs/ja/ as reference
  if (existsSync(enDir)) {
    const enFiles = collectMdFiles(enDir)
    for (const enFile of enFiles) {
      const relPath = relative(enDir, enFile)
      const jaFile = join(jaDir, relPath)

      let enContent = readFileSync(enFile, 'utf-8')
      let changed = false

      // (1) Fix bare code blocks using ja/ as reference
      const jaContent = existsSync(jaFile) ? readFileSync(jaFile, 'utf-8') : null
      const fixed = fixBareCodeBlocks(enContent, jaContent)
      if (fixed !== enContent) {
        enContent = fixed
        changed = true
        codeBlockFixes++
        console.log(`  [code-block] Fixed: en/${relPath}`)
      }

      // (2) Fix missing frontmatter title
      if (!hasFrontmatterTitle(enContent)) {
        const title = extractTitleFromHeading(enContent)
        if (title) {
          enContent = addFrontmatterTitle(enContent, title)
          changed = true
          titleFixes++
          console.log(`  [frontmatter] Added title "${title}": en/${relPath}`)
        } else {
          console.warn(`  [frontmatter] WARN: no title or H1 found in en/${relPath}`)
        }
      }

      if (changed) {
        writeFileSync(enFile, enContent, 'utf-8')
      }
    }
  }

  // (3) File parity: copy ja-only files to en/ when en counterpart is missing
  for (const jaFile of jaFiles) {
    const relPath = relative(jaDir, jaFile)
    const enFile = join(enDir, relPath)
    if (!existsSync(enFile)) {
      const enDestDir = dirname(enFile)
      mkdirSync(enDestDir, { recursive: true })
      const content = readFileSync(jaFile, 'utf-8')
      writeFileSync(enFile, content, 'utf-8')
      parityFixes++
      console.log(`  [parity] Copied to en/: ${relPath}`)
    }
  }

  console.log(`\nDone: ${codeBlockFixes} code-block fixes, ${titleFixes} title fixes, ${parityFixes} parity fixes.`)
  return { codeBlockFixes, titleFixes, parityFixes }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

function main() {
  runQualityFixes(process.cwd())
}

// Only run main when executed directly (not when imported by tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
