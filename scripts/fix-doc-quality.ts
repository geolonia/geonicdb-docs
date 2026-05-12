import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'

// ---------------------------------------------------------------------------
// fix-doc-quality.ts
// Post-translation quality fix script for geonicdb-docs.
// Fixes: (1) bare code blocks, (2) missing frontmatter titles, (3) file parity,
//        (4) glossary violations in docs/ja/ (forbidden terms → correct terms)
// Processes both docs/ja/ (content inference) and docs/en/ (ja/ as reference).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Glossary violation replacement
// ---------------------------------------------------------------------------

export interface GlossaryRule {
  /** Forbidden term to replace */
  forbidden: string
  /** Correct term to use */
  correct: string
  /**
   * Optional string that, when immediately following `forbidden`, indicates
   * `forbidden` is already part of a longer correct term and should NOT be
   * replaced. E.g., forbidden="サブスク", negLookahead="リプション" prevents
   * replacing "サブスクリプション" (which already starts with "サブスク").
   */
  negLookahead?: string
  /**
   * Additional negative lookahead strings (each escaped independently).
   * Combined with negLookahead when both are present.
   * E.g., negLookaheads=["-", "."] prevents replacing "geonicdb-docs" and "geonicdb.geolonia.com".
   */
  negLookaheads?: string[]
}

/**
 * Glossary replacement rules for Japanese docs.
 * Derived from glossary.yaml's do_not_use.ja entries.
 * Excludes ambiguous general words (e.g. "実体", "購読", "ブローカー").
 */
export const JA_GLOSSARY_RULES: GlossaryRule[] = [
  // brand
  { forbidden: 'ジオニックDB', correct: 'GeonicDB' },
  // "geonicdb" without suffix is prose violation; compound names ("geonicdb-docs"),
  // URLs ("geonicdb.geolonia.com", "geolonia/geonicdb/compare"), IAM keys ("geonicdb:purpose"),
  // metrics ("geonicdb_uptime"), and inline code ("`npx geonicdb`") are excluded.
  { forbidden: 'geonicdb', correct: 'GeonicDB', negLookaheads: ['-', '.', '/', ':', '_', '`', ')', ']', '>'] },
  { forbidden: 'リアクティブコア', correct: 'ReactiveCore' },
  { forbidden: 'マップリブレ', correct: 'MapLibre' },
  { forbidden: 'ファイウェア', correct: 'FIWARE' },
  { forbidden: 'エムシーピー', correct: 'MCP' },
  // domain
  { forbidden: 'エンティティー', correct: 'エンティティ' },
  { forbidden: 'エンテティ', correct: 'エンティティ' },
  { forbidden: 'テンポラル', correct: '時系列' },
  { forbidden: 'ジオプロパティ', correct: 'GeoProperty' },
  { forbidden: '地理プロパティ', correct: 'GeoProperty' },
  // "コンテキストブローカ" (without ー) is forbidden; "コンテキストブローカー" is correct.
  // Use negLookahead "ー" to avoid double-replacing "コンテキストブローカー".
  { forbidden: 'コンテキストブローカ', correct: 'コンテキストブローカー', negLookahead: 'ー' },
  { forbidden: 'スキーマー', correct: 'スキーマ' },
  // "サブスク" is forbidden; "サブスクリプション" is correct.
  // negLookahead "リプション" prevents replacing inside "サブスクリプション".
  { forbidden: 'サブスク', correct: 'サブスクリプション', negLookahead: 'リプション' },
  { forbidden: 'サービスパス', correct: 'ServicePath' },
  { forbidden: 'アトリビュート', correct: '属性' },
  { forbidden: 'プロパティー', correct: 'プロパティ' },
  // "リレーション" is forbidden; "リレーションシップ" is correct.
  // negLookahead "シップ" prevents replacing inside "リレーションシップ".
  { forbidden: 'リレーション', correct: 'リレーションシップ', negLookahead: 'シップ' },
  { forbidden: 'ウェブソケット', correct: 'WebSocket' },
  { forbidden: 'API鍵', correct: 'APIキー' },
]

/**
 * Build a RegExp for a single glossary rule.
 * Negative lookaheads from both `negLookahead` and `negLookaheads` are combined.
 */
function buildGlossaryRegex(rule: GlossaryRule): RegExp {
  const escaped = rule.forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const allLookaheads = [
    ...(rule.negLookahead ? [rule.negLookahead] : []),
    ...(rule.negLookaheads ?? []),
  ]
  if (allLookaheads.length > 0) {
    const negParts = allLookaheads
      .map(la => `(?!${la.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`)
      .join('')
    return new RegExp(`${escaped}${negParts}`, 'g')
  }
  return new RegExp(escaped, 'g')
}

/**
 * Fix glossary violations in a Japanese markdown document.
 * Replaces forbidden terms with correct ones, skipping fenced code blocks.
 *
 * @param content - Markdown content to process
 * @param rules - Glossary rules to apply (defaults to JA_GLOSSARY_RULES)
 * @returns Object with corrected content and count of modified lines
 */
export function fixGlossaryViolations(
  content: string,
  rules: GlossaryRule[] = JA_GLOSSARY_RULES
): { content: string; count: number } {
  const lines = content.split('\n')
  let inFencedBlock = false
  let count = 0

  // Pre-build regexes once for efficiency
  const compiled = rules.map(rule => ({ rule, regex: buildGlossaryRegex(rule) }))

  const result = lines.map(line => {
    const trimmed = line.trimStart()

    // Track fenced code block boundaries (``` or ~~~)
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inFencedBlock = !inFencedBlock
      return line
    }

    // Skip lines inside fenced code blocks
    if (inFencedBlock) return line

    let modified = line
    for (const { rule, regex } of compiled) {
      if (!modified.includes(rule.forbidden)) continue
      // Reset lastIndex between reuses (regex has 'g' flag)
      regex.lastIndex = 0
      const replaced = modified.replace(regex, rule.correct)
      if (replaced !== modified) {
        count++
        modified = replaced
      }
    }
    return modified
  })

  return { content: result.join('\n'), count }
}

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
 * Fix embedded code fences: lines where prose and a code fence start are merged.
 * Detects the pattern `/.```[a-z]/` (any char + three backticks + language letter)
 * and splits into: prose | empty line | ```lang
 *
 * This occurs when an LLM translator merges the last prose line of a chunk with
 * the opening fence of the following code block onto a single line.
 */
export function fixEmbeddedFences(content: string): string {
  const lines = content.split('\n')
  const result: string[] = []
  let inFencedBlock = false

  for (const line of lines) {
    const trimmed = line.trimStart()

    // Track fenced block boundaries — toggle on any ``` or ~~~ line
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inFencedBlock = !inFencedBlock
      result.push(line)
      continue
    }

    // Inside a fenced block: preserve as-is, never split
    if (inFencedBlock) {
      result.push(line)
      continue
    }

    // Detect mid-line fence: prose + (N≥3 consecutive backticks) + lang identifier, at EOL.
    // When N>3, the extra (N-3) leading backticks are inline-code close chars and stay with prose.
    // Handles both standard 3-backtick (N=3) and 4/5-backtick edge cases from yuuhitsu newline loss.
    const fenceMatch = line.match(/^(.*?)(`{3,})([a-z][a-z0-9_+-]*)\s*$/i)
    if (fenceMatch && fenceMatch[1].length > 0) {
      // blockquoted fence (> ``` など) は引用構造のため変更しない
      if (/^\s*(>\s*)+$/.test(fenceMatch[1])) {
        result.push(line)
        continue
      }
      const proseEnd = fenceMatch[1]
      const inlineCloseCount = fenceMatch[2].length - 3
      const lang = fenceMatch[3]
      const finalProse = inlineCloseCount > 0 ? proseEnd + '`'.repeat(inlineCloseCount) : proseEnd
      const indent = line.match(/^\s*/)?.[0] ?? ''
      result.push(finalProse)
      result.push('')
      result.push(indent + '```' + lang)
      continue
    }

    result.push(line)
  }

  return result.join('\n')
}

/**
 * Fix bare code blocks (``` without language) in target content.
 * Uses referenceContent for position-matched language lookup.
 * Falls back to content-based inference if reference has no language either.
 *
 * Also fixes embedded code fences (prose + ```lang on same line) before
 * processing bare blocks, so blockIndex remains consistent with referenceContent.
 */
export function fixBareCodeBlocks(targetContent: string, referenceContent: string | null): string {
  // Fix embedded fences first so code block positions align with referenceContent
  const cleanedContent = fixEmbeddedFences(targetContent)

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

  const lines = cleanedContent.split('\n')
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
// slugify — VitePress-compatible anchor slug generation (internal helper)
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w぀-ヿ㐀-鿿豈-﫿-]/g, '')
    .replace(/^-+|-+$/g, '')
}

// ---------------------------------------------------------------------------
// fixListMerge — split merged unordered list items onto separate lines
// ---------------------------------------------------------------------------

/**
 * Fix merged unordered list items: splits lines where multiple `- ` markers
 * appear on the same line due to yuuhitsu newline loss.
 *
 * Detects mid-line `- ` preceded by a closing char (backtick, ), ], CJK).
 * Skips code blocks and table rows. Numbered lists are out of scope (Phase 2).
 */
export function fixListMerge(content: string): string {
  const DEBUG = process.env.DEBUG_FIXLISTMERGE === '1'
  const lines = content.split('\n')
  const result: string[] = []
  let inFencedBlock = false

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum]
    const trimmed = line.trimStart()
    const lineNo = lineNum + 1

    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inFencedBlock = !inFencedBlock
      result.push(line)
      continue
    }

    if (inFencedBlock || trimmed.startsWith('|')) {
      if (DEBUG) {
        const reason = inFencedBlock ? 'fence' : 'table'
        console.error(`[fixListMerge] L${lineNo} skip(${reason}): ${line.slice(0, 80)}`)
      }
      result.push(line)
      continue
    }

    // Only split unordered list items (- or *)
    if (!trimmed.startsWith('- ') && !trimmed.startsWith('* ')) {
      if (DEBUG) {
        console.error(`[fixListMerge] L${lineNo} skip(non-list): ${line.slice(0, 80)}`)
      }
      result.push(line)
      continue
    }

    // Find mid-line list markers: closing-char followed by `- `
    // closing chars: backtick, ), ], fullwidth ), CJK closing quotes, hiragana/katakana/kanji
    const splitRegex = /([`)\]）」』぀-ヿ㐀-鿿豈-﫿])(?:- |\* )/g
    const parts: string[] = []
    let lastSplit = 0
    let match: RegExpExecArray | null

    splitRegex.lastIndex = 0
    while ((match = splitRegex.exec(line)) !== null) {
      const splitAt = match.index + 1 // split right after the closing char
      const backtickCount = (line.slice(0, splitAt).match(/`/g) ?? []).length
      if (backtickCount % 2 !== 0) {
        if (DEBUG) {
          console.error(`[fixListMerge] L${lineNo} skip(inline-code) col${splitAt}: backticks=${backtickCount}, context="${line.slice(Math.max(0, splitAt - 10), splitAt + 10)}"`)
        }
        continue // inside inline code — skip
      }
      if (DEBUG) {
        console.error(`[fixListMerge] L${lineNo} split col${splitAt}: context="${line.slice(Math.max(0, splitAt - 10), splitAt + 10)}"`)
      }
      parts.push(line.slice(lastSplit, splitAt))
      lastSplit = splitAt
    }

    if (parts.length > 0) {
      parts.push(line.slice(lastSplit))
      if (DEBUG) {
        console.error(`[fixListMerge] L${lineNo} process(split ${parts.length} parts): ${line.slice(0, 80)}`)
      }
      result.push(...parts)
    } else {
      if (DEBUG) {
        console.error(`[fixListMerge] L${lineNo} skip(no-match): ${line.slice(0, 80)}`)
      }
      result.push(line)
    }
  }

  return result.join('\n')
}

// ---------------------------------------------------------------------------
// fixHeadingMerge — split headings merged with preceding content/hr
// ---------------------------------------------------------------------------

/**
 * Fix headings merged with preceding text or horizontal rules.
 * Handles three patterns:
 *   `text## heading`     → `text\n\n## heading`
 *   `---## heading`      → `---\n\n## heading`
 *   `text---## heading`  → `text\n\n---\n\n## heading`
 *
 * Skips h1 and code blocks. h1 (`# `) is excluded to reduce false positives.
 */
export function fixHeadingMerge(content: string): string {
  const lines = content.split('\n')
  const result: string[] = []
  let inFencedBlock = false

  for (const line of lines) {
    const trimmed = line.trimStart()

    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inFencedBlock = !inFencedBlock
      result.push(line)
      continue
    }

    if (inFencedBlock) {
      result.push(line)
      continue
    }

    // Detect heading + inline-code + body: ## heading `code`body → split.
    // Greedy `.+` finds the LAST inline-code span; body must start with non-space char.
    // Must run BEFORE the heading skip-check below to catch this pattern.
    if (/^#{1,6} /.test(trimmed)) {
      const headingBodyMatch = trimmed.match(/^(#{1,6} .+`[^`]+`)([^\s`].*)$/)
      if (headingBodyMatch) {
        const indent = line.match(/^\s*/)?.[0] ?? ''
        result.push(indent + headingBodyMatch[1])
        result.push('')
        result.push(headingBodyMatch[2])
        continue
      }
    }

    // Skip lines that already start with a heading or are standalone hr/empty
    if (/^#{1,6} /.test(trimmed) || trimmed === '---' || trimmed === '***' || trimmed === '___' || trimmed === '') {
      result.push(line)
      continue
    }

    // Find mid-line heading marker (h2–h6 only; h1 excluded)
    // Skip matches inside inline code (even backtick count before match position)
    let headingIdx = -1
    for (const m of line.matchAll(/#{2,6} /g)) {
      const idx = m.index ?? -1
      if (idx <= 0) continue
      const backtickCount = (line.slice(0, idx).match(/`/g) ?? []).length
      if (backtickCount % 2 === 0) {
        headingIdx = idx
        break
      }
    }
    if (headingIdx <= 0) {
      result.push(line)
      continue
    }

    const before = line.slice(0, headingIdx)
    const headingPart = line.slice(headingIdx)

    if (before.endsWith('---')) {
      const textBefore = before.slice(0, -3).trimEnd()
      if (textBefore) {
        // Pattern: `text---## heading`
        result.push(textBefore)
        result.push('')
        result.push('---')
        result.push('')
        result.push(headingPart)
      } else {
        // Pattern: `---## heading`
        result.push('---')
        result.push('')
        result.push(headingPart)
      }
    } else {
      // Pattern: `text## heading`
      result.push(before.trimEnd())
      result.push('')
      result.push(headingPart)
    }
  }

  return result.join('\n')
}

// ---------------------------------------------------------------------------
// fixHorizontalRuleMerge — split horizontal rules merged with surrounding text
// ---------------------------------------------------------------------------

/**
 * Fix horizontal rules merged with surrounding prose (non-heading cases).
 * `---## heading` patterns are handled by fixHeadingMerge; this function
 * covers the remaining cases:
 *   `text---`  → `text\n\n---`
 *   `---text`  → `---\n\ntext` (where text doesn't start with ## heading)
 *
 * Skips code blocks, table rows, and standalone hr lines.
 */
export function fixHorizontalRuleMerge(content: string): string {
  const lines = content.split('\n')
  const result: string[] = []
  let inFencedBlock = false

  for (const line of lines) {
    const trimmed = line.trimStart()

    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inFencedBlock = !inFencedBlock
      result.push(line)
      continue
    }

    if (inFencedBlock || trimmed.startsWith('|') || trimmed === '') {
      result.push(line)
      continue
    }

    // Skip standalone hr / setext-style markers
    if (/^[-*_]{3,}$/.test(trimmed)) {
      result.push(line)
      continue
    }

    let processed = false

    // Case 1: non-dash content followed by `---` at end of line
    // Require the char before `---` to be non-dash to avoid `----`
    const hrAtEndMatch = trimmed.match(/^(.+[^-])(---)$/)
    if (hrAtEndMatch) {
      result.push(hrAtEndMatch[1].trimEnd())
      result.push('')
      result.push('---')
      processed = true
    }

    // Case 2: `---` at start followed by non-heading, non-dash text
    // `---## heading` is handled by fixHeadingMerge; skip it here
    if (!processed) {
      const hrAtStartMatch = trimmed.match(/^---([^-#].+)$/)
      if (hrAtStartMatch) {
        result.push('---')
        result.push('')
        result.push(hrAtStartMatch[1].trimStart())
        processed = true
      }
    }

    if (!processed) {
      result.push(line)
    }
  }

  return result.join('\n')
}

// ---------------------------------------------------------------------------
// fixAnchorI18n — fix internal link anchors in Japanese docs (Hybrid mode)
// ---------------------------------------------------------------------------

/**
 * Fix internal link anchors in Japanese docs where English anchors remain
 * after yuuhitsu translation (anchor text was not translated).
 *
 * Hybrid mode (Q4=C):
 *   - heading present in file AND link text slug matches → auto-fix
 *   - no heading match found → warn-only, keep as-is
 *
 * Only applies to Japanese files (isJaFile=true). English files are no-ops.
 *
 * @param content - Markdown file content
 * @param isJaFile - true for docs/ja/ files; false for docs/en/ (no-op)
 */
export function fixAnchorI18n(content: string, isJaFile: boolean): string {
  if (!isJaFile) return content

  // Build slug → heading-text map (fence-aware; duplicate slugs tracked for warn-only)
  const headingMap = new Map<string, string>()
  const slugCount = new Map<string, number>()
  let inFence = false
  for (const headingLine of content.split('\n')) {
    const htrimmed = headingLine.trimStart()
    if (htrimmed.startsWith('```') || htrimmed.startsWith('~~~')) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const hm = htrimmed.match(/^#{1,6}\s+(.+)$/)
    if (hm) {
      const text = hm[1].trim()
      const slug = slugify(text)
      if (slug) {
        slugCount.set(slug, (slugCount.get(slug) ?? 0) + 1)
        if (!headingMap.has(slug)) headingMap.set(slug, text)
      }
    }
  }

  // Replace anchors fence-aware: skip lines inside fenced code blocks
  const replaceAnchorsInLine = (line: string): string =>
    line.replace(/\[([^\]]+)\]\(#([^)]+)\)/g, (full, linkText, anchor) => {
      // Anchor already valid (slug exists in this file) — keep as-is
      if (headingMap.has(anchor)) return full

      // Try to match by slugifying link text
      const linkTextSlug = slugify(linkText)
      if (linkTextSlug && headingMap.has(linkTextSlug)) {
        // Warn-only for ambiguous (duplicate) heading slugs
        if ((slugCount.get(linkTextSlug) ?? 0) > 1) {
          console.warn(`[anchor-i18n] Ambiguous anchor (duplicate heading) #${linkTextSlug} in link [${linkText}]`)
          return full
        }
        return `[${linkText}](#${linkTextSlug})`
      }

      // No match — warn and preserve original
      console.warn(`[anchor-i18n] Could not resolve anchor #${anchor} in link [${linkText}]`)
      return full
    })

  const anchorResult: string[] = []
  let inFenceAnchor = false
  for (const line of content.split('\n')) {
    const trimmed = line.trimStart()
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inFenceAnchor = !inFenceAnchor
      anchorResult.push(line)
      continue
    }
    anchorResult.push(inFenceAnchor ? line : replaceAnchorsInLine(line))
  }
  return anchorResult.join('\n')
}

// ---------------------------------------------------------------------------
// Quality fix runner (exported for testability)
// ---------------------------------------------------------------------------

export interface QualityFixResult {
  codeBlockFixes: number
  titleFixes: number
  parityFixes: number
  glossaryFixes: number
  blockMergeFixes: number
  anchorFixes: number
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
 * Processes both docs/ja/ (using content inference) and docs/en/ (using docs/ja/ as reference).
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
  let glossaryFixes = 0
  let blockMergeFixes = 0
  let anchorFixes = 0

  // (1) Process docs/ja/ files
  // Order: fixEmbeddedFences → fixListMerge → fixHeadingMerge → fixHorizontalRuleMerge
  //        → fixBareCodeBlocks → fixGlossaryViolations → fixAnchorI18n → addFrontmatterTitle
  for (const jaFile of jaFiles) {
    const relPath = relative(jaDir, jaFile)

    let jaContent = readFileSync(jaFile, 'utf-8')
    let changed = false

    // Fix embedded fences first (idempotent; also called inside fixBareCodeBlocks)
    const afterEmbeddedFences = fixEmbeddedFences(jaContent)
    if (afterEmbeddedFences !== jaContent) {
      jaContent = afterEmbeddedFences
      changed = true
    }

    // Fix block boundary merges (list / heading / hr) before bare-code-block processing
    const afterListMerge = fixListMerge(jaContent)
    if (afterListMerge !== jaContent) {
      jaContent = afterListMerge
      changed = true
      blockMergeFixes++
      console.log(`  [list-merge] Fixed: ja/${relPath}`)
    }

    const afterHeadingMerge = fixHeadingMerge(jaContent)
    if (afterHeadingMerge !== jaContent) {
      jaContent = afterHeadingMerge
      changed = true
      blockMergeFixes++
      console.log(`  [heading-merge] Fixed: ja/${relPath}`)
    }

    const afterHrMerge = fixHorizontalRuleMerge(jaContent)
    if (afterHrMerge !== jaContent) {
      jaContent = afterHrMerge
      changed = true
      blockMergeFixes++
      console.log(`  [hr-merge] Fixed: ja/${relPath}`)
    }

    // Fix bare code blocks (also handles embedded fences internally)
    const fixedJa = fixBareCodeBlocks(jaContent, null)
    if (fixedJa !== jaContent) {
      jaContent = fixedJa
      changed = true
      codeBlockFixes++
      console.log(`  [code-block] Fixed: ja/${relPath}`)
    }

    // Fix glossary violations (forbidden terms → correct terms)
    const { content: glossaryFixed, count: glossaryCount } = fixGlossaryViolations(jaContent)
    if (glossaryFixed !== jaContent) {
      jaContent = glossaryFixed
      changed = true
      glossaryFixes += glossaryCount
      console.log(`  [glossary] Fixed ${glossaryCount} term(s): ja/${relPath}`)
    }

    // Fix internal link anchors (ja files only)
    const afterAnchorFix = fixAnchorI18n(jaContent, true)
    if (afterAnchorFix !== jaContent) {
      jaContent = afterAnchorFix
      changed = true
      anchorFixes++
      console.log(`  [anchor-i18n] Fixed: ja/${relPath}`)
    }

    // Fix missing frontmatter title
    if (!hasFrontmatterTitle(jaContent)) {
      const title = extractTitleFromHeading(jaContent)
      if (title) {
        jaContent = addFrontmatterTitle(jaContent, title)
        changed = true
        titleFixes++
        console.log(`  [frontmatter] Added title "${title}": ja/${relPath}`)
      } else {
        console.warn(`  [frontmatter] WARN: no title or H1 found in ja/${relPath}`)
      }
    }

    if (changed) {
      writeFileSync(jaFile, jaContent, 'utf-8')
    }
  }

  // (2) Process docs/en/ files (translation output) using docs/ja/ as reference
  if (existsSync(enDir)) {
    const enFiles = collectMdFiles(enDir)
    for (const enFile of enFiles) {
      const relPath = relative(enDir, enFile)
      const jaFile = join(jaDir, relPath)

      let enContent = readFileSync(enFile, 'utf-8')
      let changed = false

      // Fix embedded fences first (idempotent; same pipeline issue as ja/)
      const afterEmbeddedFencesEn = fixEmbeddedFences(enContent)
      if (afterEmbeddedFencesEn !== enContent) {
        enContent = afterEmbeddedFencesEn
        changed = true
      }

      // Fix block boundary merges for en/ files (same translation pipeline)
      const afterListMergeEn = fixListMerge(enContent)
      if (afterListMergeEn !== enContent) {
        enContent = afterListMergeEn
        changed = true
        blockMergeFixes++
        console.log(`  [list-merge] Fixed: en/${relPath}`)
      }

      const afterHeadingMergeEn = fixHeadingMerge(enContent)
      if (afterHeadingMergeEn !== enContent) {
        enContent = afterHeadingMergeEn
        changed = true
        blockMergeFixes++
        console.log(`  [heading-merge] Fixed: en/${relPath}`)
      }

      const afterHrMergeEn = fixHorizontalRuleMerge(enContent)
      if (afterHrMergeEn !== enContent) {
        enContent = afterHrMergeEn
        changed = true
        blockMergeFixes++
        console.log(`  [hr-merge] Fixed: en/${relPath}`)
      }

      // Fix bare code blocks using ja/ as reference
      const jaContent = existsSync(jaFile) ? readFileSync(jaFile, 'utf-8') : null
      const fixed = fixBareCodeBlocks(enContent, jaContent)
      if (fixed !== enContent) {
        enContent = fixed
        changed = true
        codeBlockFixes++
        console.log(`  [code-block] Fixed: en/${relPath}`)
      }

      // Fix missing frontmatter title
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

  console.log(`\nDone: ${codeBlockFixes} code-block fixes, ${titleFixes} title fixes, ${parityFixes} parity fixes, ${glossaryFixes} glossary fixes, ${blockMergeFixes} merge fixes, ${anchorFixes} anchor fixes.`)
  return { codeBlockFixes, titleFixes, parityFixes, glossaryFixes, blockMergeFixes, anchorFixes }
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
