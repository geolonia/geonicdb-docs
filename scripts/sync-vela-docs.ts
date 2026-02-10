import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { join, basename, dirname, relative } from 'node:path'

// ---------------------------------------------------------------------------
// Vela docs/ → VitePress docs/ja/ sync script
// ---------------------------------------------------------------------------
// Usage:
//   VELA_REPO_PATH=/path/to/vela pnpm sync-docs
//   (CI: VELA_REPO_PATH=.vela-upstream pnpm sync-docs)
// ---------------------------------------------------------------------------

/** Convert UPPER_SNAKE.md → lower-kebab.md */
function toKebabCase(filename: string): string {
  return filename
    .replace(/\.md$/i, '')
    .toLowerCase()
    .replace(/_/g, '-')
    + '.md'
}

/** Generate VitePress frontmatter block */
function makeFrontmatter(title: string, description: string): string {
  return [
    '---',
    `title: "${title}"`,
    `description: "${description}"`,
    'outline: deep',
    '---',
    '',
  ].join('\n')
}

/** Derive a human-readable title from a kebab-case filename */
function titleFromFilename(kebab: string): string {
  return kebab
    .replace(/\.md$/, '')
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// ---------------------------------------------------------------------------
// Mapping table  (plan.md §6)
// ---------------------------------------------------------------------------
// Each entry: source filename → array of { dest (relative to docs/ja/), title, description }
// When a source maps to multiple destinations the entire content is copied to each.
// ---------------------------------------------------------------------------

interface MappingEntry {
  dest: string        // relative path under docs/ja/  e.g. "api-reference/ngsiv2.md"
  title: string
  description: string
}

const MAPPING_TABLE: Record<string, MappingEntry[]> = {
  'API.md': [
    { dest: 'api-reference/endpoints.md', title: 'API 共通仕様', description: 'Vela API の共通仕様・認証・クエリパラメータ' },
  ],
  'API_NGSIV2.md': [
    { dest: 'api-reference/ngsiv2.md', title: 'NGSIv2 API', description: 'NGSIv2 API リファレンス' },
  ],
  'API_NGSILD.md': [
    { dest: 'api-reference/ngsild.md', title: 'NGSI-LD API', description: 'NGSI-LD API リファレンス' },
  ],
  'API_ENDPOINTS.md': [
    { dest: 'api-reference/endpoints.md', title: 'API エンドポイント一覧', description: '全エンドポイント一覧' },
  ],
  'API_ENDPOINTS_NGSIV2.md': [
    { dest: 'api-reference/ngsiv2.md', title: 'NGSIv2 エンドポイント', description: 'NGSIv2 エンドポイント詳細' },
  ],
  'API_ENDPOINTS_NGSILD.md': [
    { dest: 'api-reference/ngsild.md', title: 'NGSI-LD エンドポイント', description: 'NGSI-LD エンドポイント詳細' },
  ],
  'AUTH_SCENARIOS.md': [
    { dest: 'security/auth-scenarios.md', title: '認証認可シナリオ', description: '認証認可シナリオ（Coming Soon）' },
  ],
  'AUTH_OAUTH.md': [
    { dest: 'security/auth-oauth.md', title: 'OAuth 2.0 / OIDC', description: 'OAuth 2.0 / OIDC 認証（Coming Soon）' },
  ],
  'AUTH_ADMIN.md': [
    { dest: 'api-reference/admin.md', title: '認証管理 API', description: 'Admin API リファレンス' },
  ],
  'AI_INTEGRATION.md': [
    { dest: 'ai-integration/overview.md', title: 'AI 連携 概要', description: 'Vela の AI ネイティブ機能概要' },
    { dest: 'ai-integration/tools-json.md', title: 'tools.json', description: 'AI ツール定義（tools.json）' },
    { dest: 'ai-integration/examples.md', title: 'AI 連携サンプル', description: 'AI 連携コード例' },
  ],
  'MCP.md': [
    { dest: 'ai-integration/mcp-server.md', title: 'MCP サーバー', description: 'Model Context Protocol (MCP) サーバー' },
  ],
  'SMART_DATA_MODELS.md': [
    { dest: 'features/smart-data-models.md', title: 'Smart Data Models', description: 'FIWARE Smart Data Models 対応' },
  ],
  'WEBAPP_INTEGRATION.md': [
    { dest: 'features/subscriptions.md', title: 'サブスクリプション', description: 'HTTP Webhook / MQTT / WebSocket サブスクリプション' },
  ],
  'EVENT_STREAMING.md': [
    { dest: 'features/subscriptions.md', title: 'イベントストリーミング', description: 'リアルタイムイベントストリーミング' },
  ],
  'INTEROPERABILITY.md': [
    { dest: 'core-concepts/ngsiv2-vs-ngsild.md', title: 'NGSIv2 vs NGSI-LD', description: 'NGSIv2 と NGSI-LD の相互運用性' },
  ],
  'CATALOG.md': [
    { dest: 'features/catalog.md', title: 'データカタログ', description: 'DCAT-AP / CKAN 互換データカタログ' },
  ],
  'PAGINATION.md': [
    { dest: 'api-reference/pagination.md', title: 'ページネーション', description: 'API ページネーション' },
  ],
  'STATUS_CODES.md': [
    { dest: 'api-reference/status-codes.md', title: 'ステータスコード', description: 'API レスポンスステータスコード' },
  ],
  'DEVELOPMENT.md': [
    { dest: 'getting-started/installation.md', title: '開発者ガイド', description: '開発環境セットアップ・インストール' },
  ],
  'DEMO_SCENARIO.md': [
    { dest: 'getting-started/demo-app.md', title: 'デモアプリ', description: 'デモシナリオ・アプリ' },
    { dest: 'getting-started/first-entity.md', title: 'はじめてのエンティティ', description: 'エンティティ CRUD チュートリアル' },
  ],
  'FIWARE_ORION_COMPARISON.md': [
    { dest: 'migration/compatibility-matrix.md', title: '互換性マトリクス', description: 'FIWARE Orion との互換性比較' },
  ],
  'FAQ.md': [
    { dest: 'faq.md', title: 'FAQ', description: 'よくある質問' },
  ],
  'DEPLOYMENT.md': [
    { dest: 'getting-started/deployment.md', title: 'デプロイ', description: 'デプロイガイド' },
  ],
  'TELEMETRY.md': [
    { dest: 'features/telemetry.md', title: 'テレメトリ', description: 'OpenTelemetry 対応' },
  ],
}

// ---------------------------------------------------------------------------
// Reverse mapping: source filename (without .md) → primary dest path (for link rewriting)
// ---------------------------------------------------------------------------

function buildLinkMap(): Record<string, string> {
  const map: Record<string, string> = {}
  for (const [srcFile, mappings] of Object.entries(MAPPING_TABLE)) {
    const srcKey = srcFile.replace(/\.md$/i, '')
    // Use the first mapping entry as the primary destination
    map[srcKey] = mappings[0].dest
  }
  return map
}

const LINK_MAP = buildLinkMap()

/**
 * Rewrite internal links that reference other Vela docs files.
 * Patterns handled:
 *   ./FILENAME.md  →  relative path to dest
 *   ./FILENAME     →  relative path to dest
 *   [text](FILENAME.md)  →  relative path to dest
 *   [text](FILENAME)     →  relative path to dest
 *
 * If target file has no mapping (e.g. API_EN.md which doesn't exist),
 * the link is converted to plain text to avoid VitePress dead-link errors.
 */
function rewriteLinks(content: string, currentDest: string): string {
  // Match markdown links: [text](target) and [text](target#anchor)
  return content.replace(
    /\[([^\]]*)\]\(\.?\/?([A-Z][A-Z0-9_]*(?:\.md)?)(#[^\)]+)?\)/g,
    (_match, text, target, anchor) => {
      const targetKey = target.replace(/\.md$/i, '')
      const destPath = LINK_MAP[targetKey]
      if (!destPath) {
        // No mapping found — convert to plain text to avoid dead link
        return text
      }
      // Compute relative path from current file's directory to dest
      const currentDir = dirname(currentDest)
      let relPath = relative(currentDir, destPath)
      // Ensure it starts with ./ for VitePress
      if (!relPath.startsWith('.') && !relPath.startsWith('/')) {
        relPath = './' + relPath
      }
      return `[${text}](${relPath}${anchor || ''})`
    }
  )
}

// Files that map to the same destination — later source is appended.
// We track which destinations have already been written to.
const writtenDests = new Map<string, string>()

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const velaRepoPath = process.env.VELA_REPO_PATH
  if (!velaRepoPath) {
    console.error('Error: VELA_REPO_PATH environment variable is not set.')
    console.error('  Local:  VELA_REPO_PATH=/path/to/vela pnpm sync-docs')
    console.error('  CI:     VELA_REPO_PATH=.vela-upstream pnpm sync-docs')
    process.exit(1)
  }

  const docsDir = join(velaRepoPath, 'docs')
  if (!existsSync(docsDir)) {
    console.error(`Error: docs/ directory not found at ${docsDir}`)
    process.exit(1)
  }

  const outputBase = join(process.cwd(), 'docs', 'ja')
  const sourceFiles = readdirSync(docsDir).filter(f => f.endsWith('.md'))

  console.log(`Found ${sourceFiles.length} source files in ${docsDir}`)

  let synced = 0
  let skipped = 0

  for (const srcFile of sourceFiles) {
    const mappings = MAPPING_TABLE[srcFile]
    if (!mappings) {
      console.log(`  SKIP (no mapping): ${srcFile}`)
      skipped++
      continue
    }

    const rawContent = readFileSync(join(docsDir, srcFile), 'utf-8')

    for (const mapping of mappings) {
      const destPath = join(outputBase, mapping.dest)
      const destDir = join(destPath, '..')

      mkdirSync(destDir, { recursive: true })

      // Rewrite internal links for this destination
      const srcContent = rewriteLinks(rawContent, mapping.dest)

      // If this destination was already written by another source, append content
      const existing = writtenDests.get(mapping.dest)
      if (existing) {
        const separator = '\n\n---\n\n'
        const combined = existing + separator + srcContent
        const frontmatter = makeFrontmatter(mapping.title, mapping.description)
        writeFileSync(destPath, frontmatter + combined)
        writtenDests.set(mapping.dest, combined)
        console.log(`  APPEND: ${srcFile} → ja/${mapping.dest}`)
      } else {
        const frontmatter = makeFrontmatter(mapping.title, mapping.description)
        writeFileSync(destPath, frontmatter + srcContent)
        writtenDests.set(mapping.dest, srcContent)
        console.log(`  SYNC: ${srcFile} → ja/${mapping.dest}`)
      }

      synced++
    }
  }

  console.log(`\nDone: ${synced} files synced, ${skipped} files skipped (no mapping).`)
}

main()
