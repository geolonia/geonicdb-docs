// ---------------------------------------------------------------------------
// translate-pipeline-validators.ts
// Quality patterns for geonicdb-docs translation pipeline
// ---------------------------------------------------------------------------
// P-A5: Language directory check (non-ASCII ratio)
// P-A4: File mapping validation (content-title mismatch detection)
// P-A1: Truncation detection (line count + completeness check)
// P-A2: Bullet list newline preservation (sentinel marker)
// P-A3: Table structure protection (cell escape + row count validation)
// ---------------------------------------------------------------------------

export interface ValidationResult {
  ok: boolean
  reason?: string
}

// ---------------------------------------------------------------------------
// P-A5: Language directory check
// ---------------------------------------------------------------------------

/**
 * Calculate the ratio of non-ASCII characters in a string.
 */
export function nonAsciiRatio(content: string): number {
  if (content.length === 0) return 0
  let nonAscii = 0
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) > 127) nonAscii++
  }
  return nonAscii / content.length
}

/**
 * P-A5: Check that a file placed in docs/en/ does not contain excessive non-ASCII content.
 * Non-ASCII ratio > threshold (default 0.30) means the file likely contains Japanese text.
 * @param content - file content to validate
 * @param threshold - non-ASCII character ratio limit (default 0.30)
 */
export function checkLanguageDirectory(
  content: string,
  threshold = 0.30,
): ValidationResult {
  const ratio = nonAsciiRatio(content)
  if (ratio > threshold) {
    return {
      ok: false,
      reason: `Non-ASCII character ratio ${(ratio * 100).toFixed(1)}% exceeds threshold ${(threshold * 100).toFixed(0)}% — file appears to contain non-English content`,
    }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// P-A4: File mapping validation
// ---------------------------------------------------------------------------

/**
 * Extract the first H1 heading from Markdown content.
 */
function extractH1(content: string): string | null {
  const match = content.match(/^#\s+(.+)$/m)
  return match ? match[1].trim() : null
}

/**
 * Split a path or heading into lowercase keywords for comparison.
 */
function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\.md$/, '')
    .split(/[-_/.\s]+/)
    .filter(w => w.length > 2)
}

/**
 * P-A4: Validate that the source file content is appropriate for the destination path.
 * Checks if the first H1 heading keywords overlap with destination path keywords.
 * @param srcFilename  - source filename (e.g. "EVENT_STREAMING.md")
 * @param content      - raw content of the source file
 * @param destPath     - destination relative path under docs/en/ (e.g. "features/subscriptions.md")
 */
export function validateMappingEntry(
  srcFilename: string,
  content: string,
  destPath: string,
): ValidationResult {
  const h1 = extractH1(content)
  if (!h1) {
    // No H1 heading — cannot validate, treat as pass with info message
    return {
      ok: true,
      reason: `No H1 heading found in ${srcFilename} — skipping mapping validation`,
    }
  }

  const destKeywords = extractKeywords(destPath)
  const headingKeywords = extractKeywords(h1)

  // Allow if any dest keyword appears in heading (or vice versa)
  const overlap = destKeywords.some(dk =>
    headingKeywords.some(hk => hk.includes(dk) || dk.includes(hk)),
  )

  if (!overlap) {
    return {
      ok: false,
      reason: `Mapping mismatch: ${srcFilename} H1 "${h1}" does not appear related to destination "${destPath}". Dest keywords: [${destKeywords.join(', ')}], Heading keywords: [${headingKeywords.join(', ')}]`,
    }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// P-A1: Truncation detection
// ---------------------------------------------------------------------------

/**
 * P-A1: Check if translation output is significantly shorter than the input.
 * If outputLines / inputLines < ratioThreshold (default 0.50), the file is likely truncated.
 */
export function checkTruncation(
  inputContent: string,
  outputContent: string,
  ratioThreshold = 0.50,
): ValidationResult & { ratio: number } {
  const inputLines = inputContent.split('\n').length
  const outputLines = outputContent.split('\n').length

  if (inputLines === 0) {
    return { ok: true, ratio: 1 }
  }

  const ratio = outputLines / inputLines
  if (ratio < ratioThreshold) {
    return {
      ok: false,
      ratio,
      reason: `Possible truncation: output ${outputLines} lines vs input ${inputLines} lines (ratio ${(ratio * 100).toFixed(1)}% < ${(ratioThreshold * 100).toFixed(0)}% threshold)`,
    }
  }

  return { ok: true, ratio }
}

/**
 * P-A1: Check that the translation output does not end with an incomplete heading or table row.
 * - Incomplete heading: last non-empty line is a heading marker with no text (e.g. "### ")
 * - Incomplete table row: last non-empty line starts with | but has no closing |
 */
export function checkCompleteness(content: string): ValidationResult {
  const lines = content.split('\n')
  let lastLine = ''
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim()) {
      lastLine = lines[i].trim()
      break
    }
  }

  if (!lastLine) {
    return { ok: true }
  }

  // Incomplete heading: "### " with no text after
  if (/^#{1,6}\s*$/.test(lastLine)) {
    return {
      ok: false,
      reason: `Output ends with incomplete heading: "${lastLine}"`,
    }
  }

  // Incomplete table row: starts with | but missing closing | or has fewer than 2 pipes
  const pipeCount = (lastLine.match(/\|/g) ?? []).length
  if (/^\|/.test(lastLine) && (pipeCount < 2 || !/\|\s*$/.test(lastLine))) {
    return {
      ok: false,
      reason: `Output ends with incomplete table row: "${lastLine}"`,
    }
  }

  return { ok: true }
}

// ---------------------------------------------------------------------------
// P-A2: Bullet list newline preservation (sentinel marker)
// ---------------------------------------------------------------------------

export const BULLET_SENTINEL = '%%LISTITEM%%'

/**
 * P-A2: Add sentinel markers on the line before each bullet list item.
 * This preserves list structure when translation APIs collapse bullets into one line.
 */
export function protectBullets(content: string): string {
  const lines = content.split('\n')
  const result: string[] = []
  for (const line of lines) {
    // Match list items: "- ", "* ", "+ ", "  - " (with optional indent) or numbered "1. "
    if (/^\s*[-*+]\s/.test(line) || /^\s*\d+\.\s/.test(line)) {
      result.push(BULLET_SENTINEL)
    }
    result.push(line)
  }
  return result.join('\n')
}

/**
 * P-A2: Remove sentinel markers from translated content.
 * Handles two cases:
 *   - Clean case: sentinel on its own line, bullet item on next line (already separated)
 *   - Concatenated case: sentinel inline between bullet text (translation collapsed bullets)
 */
export function restoreBullets(content: string): string {
  if (!content.includes(BULLET_SENTINEL)) return content

  // Split on sentinel; normalize newlines only at each join boundary
  const parts = content.split(BULLET_SENTINEL)
  let restored = parts[0]
  for (let i = 1; i < parts.length; i++) {
    const stripped = parts[i].replace(/^\n/, '')
    restored = restored.replace(/\n?$/, '\n') + stripped
  }
  return restored
}

// ---------------------------------------------------------------------------
// P-A3: Table structure protection
// ---------------------------------------------------------------------------

export const TABLE_PIPE_SENTINEL = '%%PIPE%%'

/**
 * P-A3: Escape pipe characters inside table cells to protect table structure.
 * Only applies to table rows (lines matching /^\s*\|.*\|\s*$/).
 * Does NOT modify separator rows (---|---).
 */
export function protectTables(content: string): string {
  const lines = content.split('\n')
  return lines
    .map(line => {
      // Detect table rows: starts with | (possibly with leading whitespace) and ends with |
      if (/^\s*\|/.test(line) && /\|\s*$/.test(line)) {
        // Replace only escaped pipes (\|) inside cells with the sentinel
        return line.replace(/\\\|/g, TABLE_PIPE_SENTINEL)
      }
      return line
    })
    .join('\n')
}

/**
 * P-A3: Restore pipe sentinels back to | in table cells after translation.
 */
export function restoreTables(content: string): string {
  return content.replaceAll(TABLE_PIPE_SENTINEL, '\\|')
}

/**
 * Count table rows (lines starting with |) in content.
 */
export function countTableRows(content: string): number {
  return content.split('\n').filter(line => /^\s*\|.*\|\s*$/.test(line)).length
}

/**
 * P-A3: Validate that the number of table rows in translated output roughly matches input.
 * A significant drop (below 80% of input rows) indicates table corruption.
 */
export function validateTableStructure(
  inputContent: string,
  outputContent: string,
): ValidationResult {
  const inputRows = countTableRows(inputContent)
  const outputRows = countTableRows(outputContent)

  if (inputRows === 0) {
    return { ok: true }
  }

  if (outputRows < inputRows * 0.8) {
    return {
      ok: false,
      reason: `Table structure corruption: input had ${inputRows} table rows, output has ${outputRows} (${(outputRows / inputRows * 100).toFixed(1)}% of original)`,
    }
  }

  return { ok: true }
}
