import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { join, basename, dirname, relative } from 'node:path'

// ---------------------------------------------------------------------------
// GeonicDB docs/ → VitePress docs/en/ sync script
// ---------------------------------------------------------------------------
// Usage:
//   GEONICDB_REPO_PATH=/path/to/geonicdb pnpm sync-docs
//   (CI: GEONICDB_REPO_PATH=.geonicdb-upstream pnpm sync-docs)
//
// Source docs (English) are copied to docs/en/ with English frontmatter.
// The CI workflow then translates docs/en/ → docs/ja/ via yuuhitsu.
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
// Mapping table
// ---------------------------------------------------------------------------
// Each entry: source filename → array of { dest (relative to docs/en/), title, description }
// When a source maps to multiple destinations the entire content is copied to each.
// ---------------------------------------------------------------------------

interface MappingEntry {
  dest: string        // relative path under docs/en/  e.g. "api-reference/ngsiv2.md"
  title: string
  description: string
}

const MAPPING_TABLE: Record<string, MappingEntry[]> = {
  'API.md': [
    { dest: 'api-reference/endpoints.md', title: 'API Common Specification', description: 'GeonicDB API common specification, authentication, and query parameters' },
  ],
  'API_NGSIV2.md': [
    { dest: 'api-reference/ngsiv2.md', title: 'NGSIv2 API', description: 'NGSIv2 API reference' },
  ],
  'API_NGSILD.md': [
    { dest: 'api-reference/ngsild.md', title: 'NGSI-LD API', description: 'NGSI-LD API reference' },
  ],
  'API_ENDPOINTS.md': [
    { dest: 'api-reference/endpoints.md', title: 'API Endpoints', description: 'Complete list of API endpoints' },
  ],
  'API_ENDPOINTS_NGSIV2.md': [
    { dest: 'api-reference/ngsiv2.md', title: 'NGSIv2 Endpoints', description: 'NGSIv2 endpoint details' },
  ],
  'API_ENDPOINTS_NGSILD.md': [
    { dest: 'api-reference/ngsild.md', title: 'NGSI-LD Endpoints', description: 'NGSI-LD endpoint details' },
  ],
  'AUTH_SCENARIOS.md': [
    { dest: 'security/auth-scenarios.md', title: 'Authentication Scenarios', description: 'Authentication and authorization scenarios (Coming Soon)' },
  ],
  'AUTH_OAUTH.md': [
    { dest: 'security/auth-oauth.md', title: 'OAuth 2.0 / OIDC', description: 'OAuth 2.0 / OIDC authentication (Coming Soon)' },
  ],
  'AUTH_ADMIN.md': [
    { dest: 'api-reference/admin.md', title: 'Admin API', description: 'Admin API reference' },
  ],
  'AI_INTEGRATION.md': [
    { dest: 'ai-integration/overview.md', title: 'AI Integration Overview', description: 'Overview of GeonicDB AI-native features' },
    { dest: 'ai-integration/tools-json.md', title: 'tools.json', description: 'AI tool definitions (tools.json)' },
    { dest: 'ai-integration/examples.md', title: 'AI Integration Examples', description: 'AI integration code examples' },
  ],
  'MCP.md': [
    { dest: 'ai-integration/mcp-server.md', title: 'MCP Server', description: 'Model Context Protocol (MCP) server' },
  ],
  'SMART_DATA_MODELS.md': [
    { dest: 'features/smart-data-models.md', title: 'Smart Data Models', description: 'FIWARE Smart Data Models support' },
  ],
  'WEBAPP_INTEGRATION.md': [
    { dest: 'features/subscriptions.md', title: 'Subscriptions', description: 'HTTP Webhook / MQTT / WebSocket subscriptions' },
  ],
  'EVENT_STREAMING.md': [
    { dest: 'features/subscriptions.md', title: 'Event Streaming', description: 'Real-time event streaming' },
  ],
  'INTEROPERABILITY.md': [
    { dest: 'core-concepts/ngsiv2-vs-ngsild.md', title: 'NGSIv2 vs NGSI-LD', description: 'NGSIv2 and NGSI-LD interoperability' },
  ],
  'CATALOG.md': [
    { dest: 'features/catalog.md', title: 'Data Catalog', description: 'DCAT-AP / CKAN compatible data catalog' },
  ],
  'PAGINATION.md': [
    { dest: 'api-reference/pagination.md', title: 'Pagination', description: 'API pagination' },
  ],
  'STATUS_CODES.md': [
    { dest: 'api-reference/status-codes.md', title: 'Status Codes', description: 'API response status codes' },
  ],
  'DEVELOPMENT.md': [
    { dest: 'getting-started/installation.md', title: 'Developer Guide', description: 'Development environment setup and installation' },
  ],
  'DEMO_SCENARIO.md': [
    { dest: 'getting-started/demo-app.md', title: 'Demo App', description: 'Demo scenarios and apps' },
    { dest: 'getting-started/first-entity.md', title: 'First Entity', description: 'Entity CRUD tutorial' },
  ],
  'FIWARE_ORION_COMPARISON.md': [
    { dest: 'migration/compatibility-matrix.md', title: 'Compatibility Matrix', description: 'Feature comparison with FIWARE Orion' },
  ],
  'FAQ.md': [
    { dest: 'faq.md', title: 'FAQ', description: 'Frequently asked questions' },
  ],
  'DEPLOYMENT.md': [
    { dest: 'getting-started/deployment.md', title: 'Deployment', description: 'Deployment guide' },
  ],
  'TELEMETRY.md': [
    { dest: 'features/telemetry.md', title: 'Telemetry', description: 'OpenTelemetry support' },
  ],
  'CHANGELOG.md': [
    { dest: 'changelog.md', title: 'Changelog', description: 'GeonicDB changelog' },
  ],
  'CLI.md': [
    { dest: 'reference/cli.md', title: 'CLI Reference', description: 'GeonicDB CLI (geonic) command reference' },
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
 * Rewrite internal links that reference other GeonicDB docs files.
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
  const geonicdbRepoPath = process.env.GEONICDB_REPO_PATH
  if (!geonicdbRepoPath) {
    console.error('Error: GEONICDB_REPO_PATH environment variable is not set.')
    console.error('  Local:  GEONICDB_REPO_PATH=/path/to/geonicdb pnpm sync-docs')
    console.error('  CI:     GEONICDB_REPO_PATH=.geonicdb-upstream pnpm sync-docs')
    process.exit(1)
  }

  const docsDir = join(geonicdbRepoPath, 'docs')
  if (!existsSync(docsDir)) {
    console.error(`Error: docs/ directory not found at ${docsDir}`)
    process.exit(1)
  }

  const outputBase = join(process.cwd(), 'docs', 'en')
  const sourceFiles = readdirSync(docsDir).filter(f => f.endsWith('.md'))

  // Add CHANGELOG.md from repository root if it exists
  // Fallback: skip if CHANGELOG.md is not present in the repository root
  const changelogPath = join(geonicdbRepoPath, 'CHANGELOG.md')
  if (existsSync(changelogPath)) {
    sourceFiles.push('CHANGELOG.md')
    console.log(`  Found CHANGELOG.md at repository root: ${changelogPath}`)
  } else {
    console.log(`  SKIP: CHANGELOG.md not found at repository root (${changelogPath})`)
  }

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

    // CHANGELOG.md is in the repository root, not in docs/
    // Fallback to docs/ if root version doesn't exist
    const rootChangelog = join(geonicdbRepoPath, srcFile)
    const docsChangelog = join(docsDir, srcFile)
    const srcPath = srcFile === 'CHANGELOG.md' && existsSync(rootChangelog)
      ? rootChangelog
      : docsChangelog
    const rawContent = readFileSync(srcPath, 'utf-8')

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
        console.log(`  APPEND: ${srcFile} → en/${mapping.dest}`)
      } else {
        const frontmatter = makeFrontmatter(mapping.title, mapping.description)
        writeFileSync(destPath, frontmatter + srcContent)
        writtenDests.set(mapping.dest, srcContent)
        console.log(`  SYNC: ${srcFile} → en/${mapping.dest}`)
      }

      synced++
    }
  }

  console.log(`\nDone: ${synced} files synced, ${skipped} files skipped (no mapping).`)
}

main()
