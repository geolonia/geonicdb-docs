import { describe, it, expect, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  inferLanguage,
  fixEmbeddedFences,
  fixBareCodeBlocks,
  extractTitleFromHeading,
  addFrontmatterTitle,
  hasFrontmatterTitle,
  fixGlossaryViolations,
  fixGlossaryBlockViolations,
  runQualityFixes,
} from '../../scripts/fix-doc-quality.js'

// ---------------------------------------------------------------------------
// inferLanguage
// ---------------------------------------------------------------------------
describe('inferLanguage', () => {
  it('detects JSON from curly-brace structure', () => {
    expect(inferLanguage('{\n  "key": "value"\n}')).toBe('json')
  })

  it('detects JSON from array structure', () => {
    expect(inferLanguage('[{"id": 1}, {"id": 2}]')).toBe('json')
  })

  it('detects bash from $ prefix', () => {
    expect(inferLanguage('$ npm install')).toBe('bash')
  })

  it('detects bash from $ prefix with leading whitespace', () => {
    expect(inferLanguage('  $ curl -X GET http://example.com')).toBe('bash')
  })

  it('detects sql from SELECT statement', () => {
    expect(inferLanguage('SELECT * FROM entities')).toBe('sql')
  })

  it('detects sql from INSERT statement', () => {
    expect(inferLanguage('INSERT INTO entities (id) VALUES (1)')).toBe('sql')
  })

  it('detects sql from CREATE TABLE statement', () => {
    expect(inferLanguage('CREATE TABLE test (id INT)')).toBe('sql')
  })

  it('detects http from GET request', () => {
    expect(inferLanguage('GET /api/v1/entities HTTP/1.1')).toBe('http')
  })

  it('detects http from POST request', () => {
    expect(inferLanguage('POST /api/v1/entities HTTP/1.1')).toBe('http')
  })

  it('detects http from PUT request', () => {
    expect(inferLanguage('PUT /api/v1/entities/1 HTTP/1.1')).toBe('http')
  })

  it('detects http from DELETE request', () => {
    expect(inferLanguage('DELETE /api/v1/entities/1 HTTP/1.1')).toBe('http')
  })

  it('falls back to text for unrecognized content', () => {
    expect(inferLanguage('some random content here')).toBe('text')
  })

  it('falls back to text for empty string', () => {
    expect(inferLanguage('')).toBe('text')
  })
})

// ---------------------------------------------------------------------------
// fixEmbeddedFences
// ---------------------------------------------------------------------------
describe('fixEmbeddedFences', () => {
  it('splits embedded fence - inline code backtick + ```lang (PR#97 cli.md pattern)', () => {
    // Pattern: prose ending with inline code backtick merged with ```bash
    const broken = '**`sub list` options**: `--limit <n>`, `--offset <n>`, `--count````bash'
    const result = fixEmbeddedFences(broken)
    const lines = result.split('\n')
    expect(lines[0]).toBe('**`sub list` options**: `--limit <n>`, `--offset <n>`, `--count`')
    expect(lines[1]).toBe('')
    expect(lines[2]).toBe('```bash')
  })

  it('splits embedded fence - macOS/Windows path + ```json (PR#97 installation.md pattern)', () => {
    // Pattern: two merged prose lines + ```json
    const broken = '**macOS**: `~/Library/config.json`**Windows**: `%APPDATA%\\config.json````json'
    const result = fixEmbeddedFences(broken)
    const lines = result.split('\n')
    expect(lines[0]).toBe('**macOS**: `~/Library/config.json`**Windows**: `%APPDATA%\\config.json`')
    expect(lines[1]).toBe('')
    expect(lines[2]).toBe('```json')
  })

  it('splits embedded fence - response label + ```json (PR#97 endpoints.md pattern)', () => {
    const broken = '**Response**: `200 OK````json'
    const result = fixEmbeddedFences(broken)
    const lines = result.split('\n')
    expect(lines[0]).toBe('**Response**: `200 OK`')
    expect(lines[1]).toBe('')
    expect(lines[2]).toBe('```json')
  })

  it('splits embedded fence - heading + ```bash (PR#97 cli.md health/version pattern)', () => {
    const broken = '### `health````bash'
    const result = fixEmbeddedFences(broken)
    const lines = result.split('\n')
    expect(lines[0]).toBe('### `health`')
    expect(lines[1]).toBe('')
    expect(lines[2]).toBe('```bash')
  })

  it('leaves proper fence lines unchanged', () => {
    const proper = '```bash\ncommand\n```'
    expect(fixEmbeddedFences(proper)).toBe(proper)
  })

  it('leaves plain prose unchanged', () => {
    const prose = 'Some text without code fences.'
    expect(fixEmbeddedFences(prose)).toBe(prose)
  })

  it('leaves indented fence starts unchanged', () => {
    const indented = '    ```json\n    {}\n    ```'
    expect(fixEmbeddedFences(indented)).toBe(indented)
  })

  it('does not split closing fences (``` without lang)', () => {
    const content = 'prose\n```\n'
    expect(fixEmbeddedFences(content)).toBe(content)
  })

  it('does not split embedded fence-like text inside a fenced block', () => {
    // "Use ```json" inside a code block must NOT be treated as an embedded fence
    const content = '```md\nSome text\nUse ```json for configuration\nmore text\n```'
    expect(fixEmbeddedFences(content)).toBe(content)
  })

  it('preserves leading indent when splitting an indented embedded fence', () => {
    // List item with indented embedded fence (e.g. inside a list)
    const broken = '  **Response**: `200 OK````json'
    const result = fixEmbeddedFences(broken)
    const lines = result.split('\n')
    expect(lines[0]).toBe('  **Response**: `200 OK`')
    expect(lines[1]).toBe('')
    expect(lines[2]).toBe('  ```json')
  })
})

// ---------------------------------------------------------------------------
// fixBareCodeBlocks
// ---------------------------------------------------------------------------
describe('fixBareCodeBlocks', () => {
  it('adds language from en counterpart at same position', () => {
    const ja = '# Title\n\n```\n{"key": "value"}\n```\n'
    const en = '# Title\n\n```json\n{"key": "value"}\n```\n'
    const result = fixBareCodeBlocks(ja, en)
    // Opening fence should now have language identifier
    expect(result).toContain('```json\n{"key": "value"}')
    // Content should differ from input (was modified)
    expect(result).not.toBe(ja)
  })

  it('infers language from content when en has no language either', () => {
    const ja = '# Title\n\n```\n$ npm install\n```\n'
    const en = '# Title\n\n```\n$ npm install\n```\n'
    const result = fixBareCodeBlocks(ja, en)
    // Opening fence should now have inferred language identifier
    expect(result).toContain('```bash\n$ npm install')
    expect(result).not.toBe(ja)
  })

  it('infers language from content when en is null', () => {
    const ja = '# Title\n\n```\n SELECT * FROM t\n```\n'
    const result = fixBareCodeBlocks(ja, null)
    expect(result).toContain('```sql')
  })

  it('does not modify code blocks that already have language', () => {
    const ja = '# Title\n\n```javascript\nconsole.log("hi")\n```\n'
    const en = '# Title\n\n```javascript\nconsole.log("hi")\n```\n'
    const result = fixBareCodeBlocks(ja, en)
    expect(result).toBe(ja)
  })

  it('handles multiple code blocks, some bare some not', () => {
    const ja = [
      '# Title',
      '',
      '```json',
      '{"a": 1}',
      '```',
      '',
      '```',
      '$ curl example.com',
      '```',
    ].join('\n')
    const en = [
      '# Title',
      '',
      '```json',
      '{"a": 1}',
      '```',
      '',
      '```bash',
      '$ curl example.com',
      '```',
    ].join('\n')
    const result = fixBareCodeBlocks(ja, en)
    // First block already had language — should be preserved
    expect(result).toContain('```json\n{"a": 1}')
    // Second block was bare — should be fixed with en's language
    expect(result).toContain('```bash\n$ curl example.com')
  })

  it('uses position-matched en language over content inference', () => {
    // Content looks like JSON but en says yaml
    const ja = '# Title\n\n```\nkey: value\n```\n'
    const en = '# Title\n\n```yaml\nkey: value\n```\n'
    const result = fixBareCodeBlocks(ja, en)
    expect(result).toContain('```yaml')
  })

  it('returns original content unchanged when no bare code blocks', () => {
    const ja = '# Title\n\nSome text without code blocks.\n'
    const result = fixBareCodeBlocks(ja, null)
    expect(result).toBe(ja)
  })

  it('fixes embedded fence and matches blockIndex with reference', () => {
    // Reference (Japanese source) has prose + blank line + ```json
    const ref = '# Title\n\n**Response**: `200 OK`\n\n```json\n{"key": "value"}\n```\n'
    // Target (translated) has embedded fence (prose + ```json merged)
    const target = '# Title\n\n**Response**: `200 OK````json\n{"key": "value"}\n```\n'
    const result = fixBareCodeBlocks(target, ref)
    // ```json should now be on its own line
    expect(result).toMatch(/\n```json\n/)
    // Prose should be on its own line
    expect(result).toContain('**Response**: `200 OK`\n')
    // Content and closing fence preserved
    expect(result).toContain('{"key": "value"}\n```')
  })

  it('fixes embedded fence + bare block in same document - blockIndex aligns', () => {
    // Reference has: ```json (index 0), ```bash (index 1)
    const ref = [
      '# Title',
      '',
      'prose1',
      '',
      '```json',
      '{"a": 1}',
      '```',
      '',
      'prose2',
      '',
      '```bash',
      'cmd',
      '```',
    ].join('\n')
    // Target: first block embedded (prose1```json), second block bare (```)
    const target = [
      '# Title',
      '',
      'prose1```json',
      '{"a": 1}',
      '```',
      '',
      'prose2',
      '',
      '```',
      'cmd',
      '```',
    ].join('\n')
    const result = fixBareCodeBlocks(target, ref)
    // Block 0: should be ```json
    expect(result).toMatch(/prose1\n\n```json\n/)
    // Block 1: was bare, should be ```bash from ref
    expect(result).toMatch(/prose2\n\n```bash\n/)
  })
})

// ---------------------------------------------------------------------------
// extractTitleFromHeading
// ---------------------------------------------------------------------------
describe('extractTitleFromHeading', () => {
  it('extracts title from first H1 heading', () => {
    expect(extractTitleFromHeading('# My Title\n\nSome content')).toBe('My Title')
  })

  it('extracts title after frontmatter', () => {
    const content = '---\ndescription: foo\n---\n\n# My Title\n\nContent'
    expect(extractTitleFromHeading(content)).toBe('My Title')
  })

  it('returns null when no H1 heading exists', () => {
    expect(extractTitleFromHeading('## Subtitle\n\nContent')).toBeNull()
  })

  it('returns null for empty content', () => {
    expect(extractTitleFromHeading('')).toBeNull()
  })

  it('trims whitespace from title', () => {
    expect(extractTitleFromHeading('#   Spaced Title  \n')).toBe('Spaced Title')
  })
})

// ---------------------------------------------------------------------------
// hasFrontmatterTitle
// ---------------------------------------------------------------------------
describe('hasFrontmatterTitle', () => {
  it('returns true when title exists in frontmatter', () => {
    expect(hasFrontmatterTitle('---\ntitle: My Title\n---\n# Heading')).toBe(true)
  })

  it('returns false when title missing from frontmatter', () => {
    expect(hasFrontmatterTitle('---\ndescription: foo\n---\n# Heading')).toBe(false)
  })

  it('returns false when no frontmatter exists', () => {
    expect(hasFrontmatterTitle('# Heading\n\nContent')).toBe(false)
  })

  it('returns true for layout: home pages (no title needed)', () => {
    expect(hasFrontmatterTitle('---\nlayout: home\nhero:\n  name: Test\n---')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// addFrontmatterTitle
// ---------------------------------------------------------------------------
describe('addFrontmatterTitle', () => {
  it('adds title to existing frontmatter', () => {
    const content = '---\ndescription: foo\n---\n\n# Heading\n'
    const result = addFrontmatterTitle(content, 'My Title')
    expect(result).toContain('title: "My Title"')
    expect(result).toContain('description: foo')
  })

  it('creates frontmatter with title when none exists', () => {
    const content = '# Heading\n\nContent'
    const result = addFrontmatterTitle(content, 'My Title')
    expect(result).toMatch(/^---\ntitle: "My Title"\n---/)
    expect(result).toContain('# Heading')
  })

  it('preserves other frontmatter fields', () => {
    const content = '---\ndescription: bar\noutline: deep\n---\n# H'
    const result = addFrontmatterTitle(content, 'Test')
    expect(result).toContain('description: bar')
    expect(result).toContain('outline: deep')
    expect(result).toContain('title: "Test"')
  })
})

// ---------------------------------------------------------------------------
// fixGlossaryViolations
// ---------------------------------------------------------------------------
describe('fixGlossaryViolations', () => {
  it('replaces サービスパス with ServicePath', () => {
    const content = 'サービスパス を使用してテナントを分離します。'
    const { content: result, count } = fixGlossaryViolations(content)
    expect(result).toBe('ServicePath を使用してテナントを分離します。')
    expect(count).toBe(1)
  })

  it('replaces テンポラル with 時系列', () => {
    const content = 'テンポラル データの取得方法を説明します。'
    const { content: result, count } = fixGlossaryViolations(content)
    expect(result).toBe('時系列 データの取得方法を説明します。')
    expect(count).toBe(1)
  })

  it('replaces standalone サブスク with サブスクリプション but not inside サブスクリプション', () => {
    const content = 'サブスク を作成してください。また、サブスクリプション 管理も可能です。'
    const { content: result } = fixGlossaryViolations(content)
    // standalone サブスク → サブスクリプション
    // サブスクリプション should be preserved
    expect(result).toBe('サブスクリプション を作成してください。また、サブスクリプション 管理も可能です。')
  })

  it('preserves content inside fenced code blocks', () => {
    const content = [
      'テンポラル データを見てみましょう:',
      '```bash',
      '# テンポラル 履歴を取得',
      'curl .../temporal/entities',
      '```',
      'テンポラル クエリの詳細:',
    ].join('\n')
    const { content: result } = fixGlossaryViolations(content)
    const lines = result.split('\n')
    // Line 0: outside code block → replaced
    expect(lines[0]).toBe('時系列 データを見てみましょう:')
    // Line 2: inside code block → preserved
    expect(lines[2]).toBe('# テンポラル 履歴を取得')
    // Line 5: outside code block → replaced
    expect(lines[5]).toBe('時系列 クエリの詳細:')
  })

  it('returns count 0 and unchanged content when no violations', () => {
    const content = '時系列 データはサブスクリプションで取得できます。'
    const { content: result, count } = fixGlossaryViolations(content)
    expect(result).toBe(content)
    expect(count).toBe(0)
  })

  it('accepts custom rules', () => {
    const content = '禁止語 がここにあります。'
    const { content: result, count } = fixGlossaryViolations(content, [
      { forbidden: '禁止語', correct: '正式語' },
    ])
    expect(result).toBe('正式語 がここにあります。')
    expect(count).toBe(1)
  })

  it('replaces エンティティー with エンティティ', () => {
    const content = 'エンティティー を作成します。'
    const { content: result } = fixGlossaryViolations(content)
    expect(result).toBe('エンティティ を作成します。')
  })

  it('does not replace リレーション inside リレーションシップ', () => {
    const content = 'リレーション オブジェクトと、リレーションシップ プロパティがあります。'
    const { content: result } = fixGlossaryViolations(content)
    // standalone リレーション → リレーションシップ
    // existing リレーションシップ is preserved
    expect(result).toBe('リレーションシップ オブジェクトと、リレーションシップ プロパティがあります。')
  })

  it('does not replace コンテキストブローカ inside コンテキストブローカー (with ー)', () => {
    const content = 'コンテキストブローカ への接続と、コンテキストブローカー を使用します。'
    const { content: result } = fixGlossaryViolations(content)
    // コンテキストブローカ (without ー) → コンテキストブローカー
    // コンテキストブローカー (with ー) is preserved
    expect(result).toBe('コンテキストブローカー への接続と、コンテキストブローカー を使用します。')
  })
})

// ---------------------------------------------------------------------------
// fixGlossaryBlockViolations
// ---------------------------------------------------------------------------
describe('fixGlossaryBlockViolations', () => {
  it('replaces 購読する with サブスクライブする (verb form)', () => {
    const content = 'エンティティの変更を購読することができます。'
    expect(fixGlossaryBlockViolations(content)).toBe('エンティティの変更をサブスクライブすることができます。')
  })

  it('replaces 購読し variants with サブスクライブし variants', () => {
    const content = '購読して通知を受け取ります。購読した内容を確認。'
    expect(fixGlossaryBlockViolations(content)).toBe('サブスクライブして通知を受け取ります。サブスクライブした内容を確認。')
  })

  it('replaces 購読中 with サブスクライブ中', () => {
    const content = '現在購読中のエンティティ一覧です。'
    expect(fixGlossaryBlockViolations(content)).toBe('現在サブスクライブ中のエンティティ一覧です。')
  })

  it('replaces noun form 購読 with サブスクリプション as fallback', () => {
    const content = 'サブスクリプションの購読を管理します。'
    // 「サブスクリプションの購読」→「サブスクリプションのサブスクリプション」
    expect(fixGlossaryBlockViolations(content)).toBe('サブスクリプションのサブスクリプションを管理します。')
  })

  it('does not replace 購読 inside inline code (backtick-quoted)', () => {
    const content = '`購読する` メソッドを呼び出します。'
    expect(fixGlossaryBlockViolations(content)).toBe('`購読する` メソッドを呼び出します。')
  })

  it('does not replace 購読 inside fenced code block', () => {
    const content = [
      '以下のコードで購読することができます:',
      '```typescript',
      '// 購読する処理',
      'db.subscribe(...)',
      '```',
      '購読が完了しました。',
    ].join('\n')
    const result = fixGlossaryBlockViolations(content)
    const lines = result.split('\n')
    // Line 0: outside block → replaced (購読する → サブスクライブする)
    expect(lines[0]).toBe('以下のコードでサブスクライブすることができます:')
    // Line 2: inside block → preserved
    expect(lines[2]).toBe('// 購読する処理')
    // Line 5: outside block → replaced (noun fallback 購読 → サブスクリプション)
    expect(lines[5]).toBe('サブスクリプションが完了しました。')
  })

  it('handles mixed inline code and prose on the same line', () => {
    const content = '`subscribe` で購読するか、購読中リストを確認してください。'
    const result = fixGlossaryBlockViolations(content)
    expect(result).toBe('`subscribe` でサブスクライブするか、サブスクライブ中リストを確認してください。')
  })

  it('returns content unchanged when no 購読 patterns are present', () => {
    const content = '## サブスクリプション\n\nWebSocket でリアルタイムにデータを受信します。'
    expect(fixGlossaryBlockViolations(content)).toBe(content)
  })
})

// ---------------------------------------------------------------------------
// runQualityFixes — en-side processing (integration tests)
// ---------------------------------------------------------------------------
describe('runQualityFixes', () => {
  let tmpDir: string

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true })
    }
  })

  function setupDocs(files: Record<string, string>): string {
    tmpDir = join(tmpdir(), `fix-doc-quality-test-${Date.now()}`)
    for (const [relPath, content] of Object.entries(files)) {
      const fullPath = join(tmpDir, relPath)
      mkdirSync(join(tmpDir, relPath.split('/').slice(0, -1).join('/')), { recursive: true })
      writeFileSync(fullPath, content, 'utf-8')
    }
    return tmpDir
  }

  it('fixes bare code blocks in en/ files using ja/ as reference', () => {
    const docsDir = setupDocs({
      'docs/ja/guide.md': '# Guide\n\n```json\n{"key": "value"}\n```\n',
      'docs/en/guide.md': '# Guide\n\n```\n{"key": "value"}\n```\n',
    })
    const result = runQualityFixes(docsDir)
    const enContent = readFileSync(join(docsDir, 'docs/en/guide.md'), 'utf-8')
    expect(enContent).toContain('```json')
    expect(result.codeBlockFixes).toBe(1)
  })

  it('adds frontmatter title to en/ files without title', () => {
    const docsDir = setupDocs({
      'docs/ja/guide.md': '---\ntitle: "ガイド"\n---\n# Guide\n\nContent\n',
      'docs/en/guide.md': '# Guide\n\nContent\n',
    })
    const result = runQualityFixes(docsDir)
    const enContent = readFileSync(join(docsDir, 'docs/en/guide.md'), 'utf-8')
    expect(enContent).toContain('title: "Guide"')
    expect(result.titleFixes).toBe(1)
  })

  it('does not modify en/ files that already have correct code blocks and title', () => {
    const original = '---\ntitle: "Guide"\n---\n# Guide\n\n```json\n{"key":"value"}\n```\n'
    const docsDir = setupDocs({
      'docs/ja/guide.md': original,
      'docs/en/guide.md': original,
    })
    const result = runQualityFixes(docsDir)
    const enContent = readFileSync(join(docsDir, 'docs/en/guide.md'), 'utf-8')
    expect(enContent).toBe(original)
    expect(result.codeBlockFixes).toBe(0)
    expect(result.titleFixes).toBe(0)
  })

  it('copies ja-only files to en/ when en counterpart is missing (parity)', () => {
    const jaContent = '# New Page\n\nContent\n'
    const docsDir = setupDocs({
      'docs/ja/new-page.md': jaContent,
    })
    const result = runQualityFixes(docsDir)
    const enPath = join(docsDir, 'docs/en/new-page.md')
    expect(existsSync(enPath)).toBe(true)
    // ja/ file gets frontmatter title added before parity copy, so en/ should have it too
    const enContent = readFileSync(enPath, 'utf-8')
    expect(enContent).toContain('title: "New Page"')
    expect(enContent).toContain('# New Page')
    expect(result.parityFixes).toBe(1)
  })

  it('fixes bare code blocks in ja/ files using content inference', () => {
    const docsDir = setupDocs({
      'docs/ja/guide.md': '# Guide\n\n```\n{"key": "value"}\n```\n',
    })
    const result = runQualityFixes(docsDir)
    const jaContent = readFileSync(join(docsDir, 'docs/ja/guide.md'), 'utf-8')
    expect(jaContent).toContain('```json')
    expect(result.codeBlockFixes).toBe(1)
  })

  it('adds frontmatter title to ja/ files without title', () => {
    const docsDir = setupDocs({
      'docs/ja/guide.md': '# ガイド\n\nContent\n',
    })
    const result = runQualityFixes(docsDir)
    const jaContent = readFileSync(join(docsDir, 'docs/ja/guide.md'), 'utf-8')
    expect(jaContent).toContain('title: "ガイド"')
    expect(result.titleFixes).toBe(1)
  })

  it('does not re-process ja/ files that already have correct quality', () => {
    const jaContent = '---\ntitle: "Guide"\n---\n# Guide\n\n```json\n{"key": "value"}\n```\n'
    const docsDir = setupDocs({
      'docs/ja/guide.md': jaContent,
    })
    runQualityFixes(docsDir)
    const jaAfter = readFileSync(join(docsDir, 'docs/ja/guide.md'), 'utf-8')
    expect(jaAfter).toBe(jaContent)
  })

  it('returns zero counts when docs/en/ is empty and no ja files', () => {
    const docsDir = setupDocs({
      'docs/ja/.gitkeep': '',
    })
    const result = runQualityFixes(docsDir)
    expect(result.codeBlockFixes).toBe(0)
    expect(result.titleFixes).toBe(0)
    expect(result.parityFixes).toBe(0)
    expect(result.glossaryFixes).toBe(0)
  })

  it('fixes glossary violations in ja/ files', () => {
    const docsDir = setupDocs({
      'docs/ja/guide.md': '---\ntitle: "Guide"\n---\n# Guide\n\nサービスパス を使って分離します。テンポラル データも参照。\n',
    })
    const result = runQualityFixes(docsDir)
    const jaContent = readFileSync(join(docsDir, 'docs/ja/guide.md'), 'utf-8')
    expect(jaContent).toContain('ServicePath')
    expect(jaContent).toContain('時系列')
    expect(jaContent).not.toContain('サービスパス')
    expect(jaContent).not.toContain('テンポラル')
    expect(result.glossaryFixes).toBeGreaterThan(0)
  })

  it('does not modify glossary-compliant ja/ files', () => {
    const jaContent = '---\ntitle: "Guide"\n---\n# Guide\n\nServicePath を使って分離します。\n'
    const docsDir = setupDocs({
      'docs/ja/guide.md': jaContent,
    })
    runQualityFixes(docsDir)
    const after = readFileSync(join(docsDir, 'docs/ja/guide.md'), 'utf-8')
    expect(after).toBe(jaContent)
  })
})
