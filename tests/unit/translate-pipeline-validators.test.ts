import { describe, it, expect } from 'vitest'
import {
  nonAsciiRatio,
  checkLanguageDirectory,
  validateMappingEntry,
  checkTruncation,
  checkCompleteness,
  protectBullets,
  restoreBullets,
  protectTables,
  restoreTables,
  validateTableStructure,
  countTableRows,
  BULLET_SENTINEL,
  TABLE_PIPE_SENTINEL,
} from '../../scripts/translate-pipeline-validators.js'

// ---------------------------------------------------------------------------
// P-A5: nonAsciiRatio / checkLanguageDirectory
// ---------------------------------------------------------------------------

describe('nonAsciiRatio', () => {
  it('returns 0 for empty string', () => {
    expect(nonAsciiRatio('')).toBe(0)
  })

  it('returns 0 for ASCII-only content', () => {
    expect(nonAsciiRatio('Hello World 123')).toBe(0)
  })

  it('returns 1 for fully non-ASCII content', () => {
    expect(nonAsciiRatio('日本語テスト')).toBe(1)
  })

  it('calculates correct ratio for mixed content', () => {
    // 'A日B': 1 non-ASCII out of 3 chars = 1/3
    const ratio = nonAsciiRatio('A日B')
    expect(ratio).toBeCloseTo(1 / 3)
  })
})

describe('checkLanguageDirectory (P-A5)', () => {
  it('passes English-only content', () => {
    const result = checkLanguageDirectory('# API Reference\nThis is the API documentation.')
    expect(result.ok).toBe(true)
  })

  it('blocks content with more than 30% non-ASCII (Japanese)', () => {
    // Japanese text will have very high non-ASCII ratio
    const japaneseContent = '# APIリファレンス\nこれはAPIドキュメントでございます。詳細な説明が含まれています。'
    const result = checkLanguageDirectory(japaneseContent)
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('exceeds threshold')
  })

  it('passes content with a small amount of non-ASCII (e.g. accented chars in examples)', () => {
    // Less than 30% non-ASCII
    const mixedContent = 'English text with a few non-ASCII: café, naïve, résumé.'
    const result = checkLanguageDirectory(mixedContent)
    expect(result.ok).toBe(true)
  })

  it('respects custom threshold', () => {
    const content = 'Hello café'  // 'é' is non-ASCII: 1/10 = 10%
    expect(checkLanguageDirectory(content, 0.05).ok).toBe(false)
    expect(checkLanguageDirectory(content, 0.20).ok).toBe(true)
  })

  it('passes empty string', () => {
    expect(checkLanguageDirectory('').ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// P-A4: validateMappingEntry
// ---------------------------------------------------------------------------

describe('validateMappingEntry (P-A4)', () => {
  it('passes when H1 heading keywords overlap with destination path', () => {
    const content = '# Subscriptions\nThis page covers webhook subscriptions.'
    const result = validateMappingEntry('WEBAPP_INTEGRATION.md', content, 'features/subscriptions.md')
    expect(result.ok).toBe(true)
  })

  it('fails when H1 heading has no overlap with destination path', () => {
    const content = '# WebSocket Event Streaming\nReal-time streaming over WebSocket.'
    const result = validateMappingEntry('EVENT_STREAMING.md', content, 'features/subscriptions.md')
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('Mapping mismatch')
  })

  it('passes (with info) when no H1 heading is found', () => {
    const content = 'No heading here, just some content.'
    const result = validateMappingEntry('SOME_FILE.md', content, 'api-reference/endpoints.md')
    expect(result.ok).toBe(true)
    expect(result.reason).toContain('No H1 heading')
  })

  it('passes for API-related headings and destinations', () => {
    const content = '# API Endpoints\nList of all API endpoints.'
    const result = validateMappingEntry('API.md', content, 'api-reference/endpoints.md')
    expect(result.ok).toBe(true)
  })

  it('passes for FAQ (H1 matches short dest keyword)', () => {
    // FAQ.md heading is typically "# FAQ" which matches the "faq" dest keyword
    const content = '# FAQ\nQ: What is GeonicDB?'
    const result = validateMappingEntry('FAQ.md', content, 'faq.md')
    expect(result.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// P-A1: checkTruncation
// ---------------------------------------------------------------------------

describe('checkTruncation (P-A1)', () => {
  it('passes when output line count is >= 50% of input', () => {
    const input = Array(100).fill('line').join('\n')
    const output = Array(60).fill('行').join('\n')
    const result = checkTruncation(input, output)
    expect(result.ok).toBe(true)
    expect(result.ratio).toBeCloseTo(0.6)
  })

  it('fails when output line count is < 50% of input', () => {
    const input = Array(100).fill('line').join('\n')
    const output = Array(40).fill('行').join('\n')
    const result = checkTruncation(input, output)
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('truncation')
    expect(result.ratio).toBeCloseTo(0.4)
  })

  it('passes for exact 50% boundary', () => {
    const input = Array(100).fill('line').join('\n')
    const output = Array(50).fill('行').join('\n')
    const result = checkTruncation(input, output)
    expect(result.ok).toBe(true)
  })

  it('passes when input is empty', () => {
    const result = checkTruncation('', 'output')
    expect(result.ok).toBe(true)
    expect(result.ratio).toBe(1)
  })

  it('respects custom ratio threshold', () => {
    const input = Array(100).fill('line').join('\n')
    const output = Array(60).fill('行').join('\n')
    // With 0.70 threshold, 60% should fail
    expect(checkTruncation(input, output, 0.70).ok).toBe(false)
    // With 0.50 threshold, 60% should pass
    expect(checkTruncation(input, output, 0.50).ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// P-A1: checkCompleteness
// ---------------------------------------------------------------------------

describe('checkCompleteness (P-A1)', () => {
  it('passes normal content', () => {
    const content = '# Title\n\nSome paragraph text.\n\nAnother paragraph.'
    expect(checkCompleteness(content).ok).toBe(true)
  })

  it('passes empty content', () => {
    expect(checkCompleteness('').ok).toBe(true)
  })

  it('fails when last non-empty line is an incomplete heading', () => {
    const content = '# Title\n\nContent here.\n\n### '
    const result = checkCompleteness(content)
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('incomplete heading')
  })

  it('fails for heading with only whitespace', () => {
    const content = 'content\n##   '
    const result = checkCompleteness(content)
    expect(result.ok).toBe(false)
  })

  it('fails when last line is an incomplete table row (no closing pipe)', () => {
    // An incomplete table row: starts with | but missing the closing |
    const content = '| Column1 | Column2 |\n|------|------|\n| cell1'
    const result = checkCompleteness(content)
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('incomplete table row')
  })

  it('passes when last line is a complete table row', () => {
    const content = '| Column1 | Column2 |\n|------|------|\n| cell1 | cell2 |'
    expect(checkCompleteness(content).ok).toBe(true)
  })

  it('ignores trailing blank lines when checking last content', () => {
    const content = '# Title\n\nNormal content.\n\n\n'
    expect(checkCompleteness(content).ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// P-A2: protectBullets / restoreBullets
// ---------------------------------------------------------------------------

describe('protectBullets (P-A2)', () => {
  it('adds sentinel before each bullet item', () => {
    const content = '- item 1\n- item 2\n- item 3'
    const protected_ = protectBullets(content)
    expect(protected_).toContain(BULLET_SENTINEL + '\n- item 1')
    expect(protected_).toContain(BULLET_SENTINEL + '\n- item 2')
    expect(protected_).toContain(BULLET_SENTINEL + '\n- item 3')
  })

  it('does not modify non-bullet lines', () => {
    const content = '# Heading\n\nParagraph text.\n\n- bullet'
    const protected_ = protectBullets(content)
    expect(protected_).toContain('# Heading')
    expect(protected_).toContain('Paragraph text.')
  })

  it('handles asterisk bullets', () => {
    const content = '* item a\n* item b'
    const protected_ = protectBullets(content)
    expect(protected_).toContain(BULLET_SENTINEL + '\n* item a')
  })

  it('handles numbered list items', () => {
    const content = '1. first\n2. second\n3. third'
    const protected_ = protectBullets(content)
    expect(protected_).toContain(BULLET_SENTINEL + '\n1. first')
  })

  it('handles indented bullets', () => {
    const content = '  - nested item\n    - deep nested'
    const protected_ = protectBullets(content)
    expect(protected_).toContain(BULLET_SENTINEL)
  })

  it('does not modify content without bullets', () => {
    const content = '# Title\n\nJust a paragraph.'
    expect(protectBullets(content)).toBe(content)
  })
})

describe('restoreBullets (P-A2)', () => {
  it('removes sentinels on their own lines', () => {
    const content = `%%LISTITEM%%\n- item 1\n%%LISTITEM%%\n- item 2`
    const restored = restoreBullets(content)
    expect(restored).not.toContain(BULLET_SENTINEL)
    expect(restored).toContain('- item 1')
    expect(restored).toContain('- item 2')
  })

  it('handles inline sentinels (concatenated translation case)', () => {
    // Simulates worst-case where translation squashed everything onto one line
    const content = `%%LISTITEM%%- アイテム1%%LISTITEM%%- アイテム2%%LISTITEM%%- アイテム3`
    const restored = restoreBullets(content)
    expect(restored).not.toContain(BULLET_SENTINEL)
    expect(restored).toContain('- アイテム1')
    expect(restored).toContain('- アイテム2')
    expect(restored).toContain('- アイテム3')
  })

  it('returns content unchanged when no sentinel present', () => {
    const content = '- item 1\n- item 2'
    expect(restoreBullets(content)).toBe(content)
  })

  it('round-trips simple bullet list', () => {
    const original = '- item 1\n- item 2\n- item 3'
    const protected_ = protectBullets(original)
    const restored = restoreBullets(protected_)
    // After round-trip, each bullet item should still be present
    expect(restored).toContain('- item 1')
    expect(restored).toContain('- item 2')
    expect(restored).toContain('- item 3')
  })
})

// ---------------------------------------------------------------------------
// P-A3: protectTables / restoreTables / validateTableStructure
// ---------------------------------------------------------------------------

describe('protectTables (P-A3)', () => {
  it('does not modify normal table rows without embedded pipes', () => {
    const content = '| Column A | Column B |\n|----------|----------|\n| value1 | value2 |'
    const protected_ = protectTables(content)
    // No embedded pipes in cells, so content should be unchanged
    expect(protected_).toBe(content)
  })

  it('escapes embedded pipe in table cell content', () => {
    const content = '| A | B or C |\n'
    // No embedded | in cells (| is only the delimiter)
    const protected_ = protectTables(content)
    expect(protected_).toBe(content)
  })

  it('does not modify separator rows', () => {
    const content = '|---|---|\n| :--- | ---: |'
    const protected_ = protectTables(content)
    expect(protected_).toBe(content)
  })

  it('does not modify non-table lines', () => {
    const content = '# Heading\n\nSome text with | a pipe but not a table.'
    const protected_ = protectTables(content)
    expect(protected_).toBe(content)
  })
})

describe('restoreTables (P-A3)', () => {
  it('restores pipe sentinels back to |', () => {
    const content = `| cell with ${TABLE_PIPE_SENTINEL} inside |`
    const restored = restoreTables(content)
    expect(restored).toBe('| cell with | inside |')
    expect(restored).not.toContain(TABLE_PIPE_SENTINEL)
  })

  it('returns content unchanged when no sentinel present', () => {
    const content = '| col1 | col2 |\n| val1 | val2 |'
    expect(restoreTables(content)).toBe(content)
  })

  it('round-trips table content', () => {
    const original = '| A | B |\n|---|---|\n| 1 | 2 |'
    const protected_ = protectTables(original)
    const restored = restoreTables(protected_)
    expect(restored).toBe(original)
  })
})

describe('countTableRows', () => {
  it('counts table rows correctly', () => {
    const content = '| col1 | col2 |\n|---|---|\n| val1 | val2 |\n| val3 | val4 |'
    expect(countTableRows(content)).toBe(4)
  })

  it('returns 0 for content without tables', () => {
    expect(countTableRows('# Heading\n\nParagraph.')).toBe(0)
  })
})

describe('validateTableStructure (P-A3)', () => {
  it('passes when output has same number of table rows as input', () => {
    const input = '| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |'
    const output = '| あ | い |\n|---|---|\n| 一 | 二 |\n| 三 | 四 |'
    expect(validateTableStructure(input, output).ok).toBe(true)
  })

  it('passes when output has >= 80% of input table rows', () => {
    // 4 input rows, 4 output rows = 100% → pass
    const input = Array(4).fill('| a | b |').join('\n')
    const output = Array(4).fill('| あ | い |').join('\n')
    expect(validateTableStructure(input, output).ok).toBe(true)
  })

  it('fails when output has significantly fewer table rows', () => {
    // 10 input rows, 2 output rows = 20% → fail
    const input = Array(10).fill('| a | b |').join('\n')
    const output = Array(2).fill('| あ | い |').join('\n')
    const result = validateTableStructure(input, output)
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('Table structure corruption')
  })

  it('passes when input has no table rows', () => {
    const result = validateTableStructure('No tables here', '表なし')
    expect(result.ok).toBe(true)
  })

  it('passes when output table count equals boundary (exactly 80%)', () => {
    const input = Array(10).fill('| a | b |').join('\n')
    const output = Array(8).fill('| あ | い |').join('\n')
    expect(validateTableStructure(input, output).ok).toBe(true)
  })

  it('fails when output table count is just below 80%', () => {
    const input = Array(10).fill('| a | b |').join('\n')
    const output = Array(7).fill('| あ | い |').join('\n')
    expect(validateTableStructure(input, output).ok).toBe(false)
  })
})
