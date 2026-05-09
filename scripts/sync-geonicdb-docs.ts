import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, unlinkSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { checkLanguageDirectory, validateMappingEntry } from './translate-pipeline-validators.js'

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

// ---------------------------------------------------------------------------
// Changelog Paging (cmd_449)
// ---------------------------------------------------------------------------
// Splits upstream CHANGELOG.md by ## [version] headings into per-version-bucket
// files under docs/en/changelog/. Uses SHA-256 hashing to skip unchanged buckets
// on subsequent syncs (incremental translation support).
// ---------------------------------------------------------------------------

interface ChangelogSection {
  heading: string  // e.g. "## [0.7.1] — 2026-05-02"
  version: string  // e.g. "0.7.1" or "Unreleased"
  content: string  // includes heading line and all body lines
}

function parseChangelogSections(raw: string): { preamble: string; sections: ChangelogSection[] } {
  const lines = raw.split('\n')
  const preambleLines: string[] = []
  const sections: ChangelogSection[] = []
  let inPreamble = true
  let currentSection: ChangelogSection | null = null
  let currentLines: string[] = []

  for (const line of lines) {
    const match = line.match(/^## \[([^\]]+)\]/)
    if (match) {
      if (inPreamble) {
        inPreamble = false
      } else if (currentSection) {
        currentSection.content = currentLines.join('\n').trimEnd()
        sections.push(currentSection)
      }
      currentSection = { heading: line, version: match[1], content: '' }
      currentLines = [line]
    } else if (inPreamble) {
      preambleLines.push(line)
    } else {
      currentLines.push(line)
    }
  }

  if (currentSection) {
    currentSection.content = currentLines.join('\n').trimEnd()
    sections.push(currentSection)
  }

  return { preamble: preambleLines.join('\n').trimEnd(), sections }
}

function versionToBucket(version: string): string {
  if (version.toLowerCase() === 'unreleased') return 'unreleased'
  const parts = version.split('.')
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}.x` : version
}

function sha256Short(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex').slice(0, 16)
}

function loadChangelogHashes(hashFilePath: string): Record<string, string> {
  if (!existsSync(hashFilePath)) return {}
  try {
    return JSON.parse(readFileSync(hashFilePath, 'utf-8')) as Record<string, string>
  } catch {
    return {}
  }
}

function syncChangelogPaged(
  rawContent: string,
  outputBase: string,
  repoBase: string,
  nonAsciiThreshold: number,
): number {
  const hashFilePath = join(repoBase, '.changelog-hashes.json')
  const prevHashes = loadChangelogHashes(hashFilePath)
  const newHashes: Record<string, string> = {}
  let synced = 0

  const { preamble, sections } = parseChangelogSections(rawContent)

  // Group sections by major.minor bucket, preserving order
  const buckets = new Map<string, ChangelogSection[]>()
  const bucketOrder: string[] = []
  for (const section of sections) {
    const bucket = versionToBucket(section.version)
    if (!buckets.has(bucket)) {
      buckets.set(bucket, [])
      bucketOrder.push(bucket)
    }
    buckets.get(bucket)!.push(section)
  }

  const changelogDir = join(outputBase, 'changelog')
  mkdirSync(changelogDir, { recursive: true })

  // Corresponding JA output directory — created alongside EN so file-parity tests pass.
  // When the CI translation workflow (yuuhitsu) runs, it will overwrite these with proper
  // translations. Until then, the EN content (already Japanese from upstream) serves as
  // a reasonable JA placeholder.
  const jaOutputBase = join(outputBase, '..', 'ja')
  const jaChangelogDir = join(jaOutputBase, 'changelog')
  mkdirSync(jaChangelogDir, { recursive: true })

  // Write per-bucket version files
  for (const bucket of bucketOrder) {
    const bucketSections = buckets.get(bucket)!
    const bucketBody = bucketSections.map(s => s.content).join('\n\n')
    const hash = sha256Short(bucketBody)
    newHashes[bucket] = hash

    const filename = `${bucket}.md`
    const destPath = join(changelogDir, filename)
    const destRelative = `changelog/${filename}`

    const jaDestPath = join(jaChangelogDir, filename)
    const unchanged = hash === prevHashes[bucket] && existsSync(destPath)
    const jaMissing = !existsSync(jaDestPath)

    if (unchanged && !jaMissing) {
      console.log(`  SKIP (unchanged): CHANGELOG[${bucket}] → en/${destRelative}`)
      continue
    }

    // P-A5 check
    const langCheck = checkLanguageDirectory(bucketBody, nonAsciiThreshold)
    if (!langCheck.ok) {
      console.error(`  ERROR (P-A5): CHANGELOG[${bucket}] → en/${destRelative}: ${langCheck.reason}`)
      process.exit(1)
    }

    const label = bucket === 'unreleased' ? 'Unreleased' : `v${bucket}`
    const fm = makeFrontmatter(label, `GeonicDB ${label} changelog`)
    const fileContent = fm + bucketBody + '\n'

    if (!unchanged) {
      writeFileSync(destPath, fileContent)
      console.log(`  SYNC: CHANGELOG[${bucket}] → en/${destRelative}`)
      synced++
    } else {
      console.log(`  SKIP (unchanged): CHANGELOG[${bucket}] → en/${destRelative}`)
    }
    // Seed JA copy if missing (will be overwritten by yuuhitsu in CI)
    if (jaMissing) {
      writeFileSync(jaDestPath, fileContent)
      console.log(`  SEED: CHANGELOG[${bucket}] → ja/${destRelative}`)
    }
  }

  // Build index.md (navigation hub) — always regenerate when any bucket changed
  const indexLines: string[] = ['# Changelog', '']
  // Strip h1 line from preamble, keep the rest as intro text
  const preambleBody = preamble.replace(/^#[^\n]*\n?/, '').trim()
  if (preambleBody) {
    indexLines.push(preambleBody, '')
  }
  indexLines.push('## Versions', '')
  for (const bucket of bucketOrder) {
    const secs = buckets.get(bucket)!
    if (bucket === 'unreleased') {
      indexLines.push(`- [Unreleased](./unreleased.md)`)
    } else {
      const dateMatch = secs[0].heading.match(/[—–-]\s*(.+)$/)
      const date = dateMatch ? dateMatch[1].trim() : ''
      const versions = secs.map(s => `v${s.version}`).join(' / ')
      indexLines.push(`- [${versions}](./${bucket}.md)${date ? ` — ${date}` : ''}`)
    }
  }

  const indexContent = makeFrontmatter('Changelog', 'GeonicDB changelog') + indexLines.join('\n') + '\n'
  const indexHash = sha256Short(indexContent)
  newHashes['_index'] = indexHash

  const indexPath = join(changelogDir, 'index.md')
  const jaIndexPath = join(jaChangelogDir, 'index.md')
  const indexUnchanged = indexHash === prevHashes['_index'] && existsSync(indexPath)
  const jaIndexMissing = !existsSync(jaIndexPath)

  if (!indexUnchanged) {
    writeFileSync(indexPath, indexContent)
    console.log('  SYNC: CHANGELOG → en/changelog/index.md')
    synced++
  } else {
    console.log('  SKIP (unchanged): CHANGELOG → en/changelog/index.md')
  }
  // Seed JA index if missing (will be overwritten by yuuhitsu in CI)
  if (jaIndexMissing) {
    writeFileSync(jaIndexPath, indexContent)
    console.log('  SEED: CHANGELOG → ja/changelog/index.md')
  }

  writeFileSync(hashFilePath, JSON.stringify(newHashes, null, 2) + '\n')
  return synced
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
  nonAsciiThreshold?: number  // P-A5 threshold override (default 0.30)
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
    { dest: 'api-reference/ngsiv2-endpoints.md', title: 'NGSIv2 Endpoints', description: 'NGSIv2 endpoint details' },
  ],
  'API_ENDPOINTS_NGSILD.md': [
    { dest: 'api-reference/ngsild-endpoints.md', title: 'NGSI-LD Endpoints', description: 'NGSI-LD endpoint details' },
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
  'TELEMETRY.md': [
    { dest: 'features/telemetry.md', title: 'Telemetry', description: 'OpenTelemetry support' },
  ],
  // CHANGELOG.md is handled by syncChangelogPaged() — this entry exists only for LINK_MAP
  'CHANGELOG.md': [
    { dest: 'changelog/index.md', title: 'Changelog', description: 'GeonicDB changelog', nonAsciiThreshold: 0.40 },
  ],
  'CLI.md': [
    { dest: 'reference/cli.md', title: 'CLI Reference', description: 'GeonicDB CLI (geonic) command reference' },
  ],
  'AUTH.md': [
    { dest: 'reference/auth.md', title: 'Authentication Guide', description: 'GeonicDB authentication and authorization guide' },
  ],
  'QUOTAS.md': [
    { dest: 'saas/quotas.md', title: 'Quotas & Plans', description: 'GeonicDB quota system and plans' },
  ],
  'REACTIVCORE_RULES.md': [
    { dest: 'features/reactivcore-rules.md', title: 'ReactiveCore Rules', description: 'Reactive automation rules based on entity changes' },
  ],
  'SUBSCRIPTIONS.md': [
    { dest: 'features/ngsi-subscriptions.md', title: 'NGSI Subscriptions', description: 'HTTP Webhook subscriptions for entity change notifications' },
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

  // Remove legacy flat changelog.md files (replaced by paged changelog/ directory)
  const legacyChangelog = join(outputBase, 'changelog.md')
  if (existsSync(legacyChangelog)) {
    unlinkSync(legacyChangelog)
    console.log('  CLEANUP: removed legacy docs/en/changelog.md (replaced by docs/en/changelog/)')
  }
  const legacyJaChangelog = join(outputBase, '..', 'ja', 'changelog.md')
  if (existsSync(legacyJaChangelog)) {
    unlinkSync(legacyJaChangelog)
    console.log('  CLEANUP: removed legacy docs/ja/changelog.md (replaced by docs/ja/changelog/)')
  }

  let synced = 0
  let skipped = 0

  for (const srcFile of sourceFiles) {
    const mappings = MAPPING_TABLE[srcFile]
    if (!mappings) {
      console.log(`  SKIP (no mapping): ${srcFile}`)
      skipped++
      continue
    }

    // CHANGELOG.md uses paged output — handled separately after the main loop
    if (srcFile === 'CHANGELOG.md') {
      skipped++
      continue
    }

    const srcPath = join(docsDir, srcFile)
    const rawContent = readFileSync(srcPath, 'utf-8')

    for (const mapping of mappings) {
      const destPath = join(outputBase, mapping.dest)
      const destDir = join(destPath, '..')

      mkdirSync(destDir, { recursive: true })

      // Rewrite internal links for this destination
      const srcContent = rewriteLinks(rawContent, mapping.dest)

      // P-A4: Validate that source content is appropriate for the destination path
      const mappingCheck = validateMappingEntry(srcFile, srcContent, mapping.dest)
      if (!mappingCheck.ok) {
        console.warn(`  WARN (P-A4): ${mappingCheck.reason}`)
      } else if (mappingCheck.reason) {
        console.warn(`  WARN (P-A4): ${mappingCheck.reason}`)
      }

      // P-A5: Check that the content written to docs/en/ does not contain excessive non-ASCII
      const langCheck = checkLanguageDirectory(srcContent, mapping.nonAsciiThreshold)
      if (!langCheck.ok) {
        console.error(`  ERROR (P-A5): ${srcFile} → en/${mapping.dest}: ${langCheck.reason}`)
        process.exit(1)
      }

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

  // Handle CHANGELOG.md with paged output (version-based split + incremental hash)
  const changelogSrcPath = join(geonicdbRepoPath, 'CHANGELOG.md')
  if (existsSync(changelogSrcPath)) {
    const changelogRaw = readFileSync(changelogSrcPath, 'utf-8')
    const mapping = MAPPING_TABLE['CHANGELOG.md']![0]
    synced += syncChangelogPaged(changelogRaw, outputBase, process.cwd(), mapping.nonAsciiThreshold ?? 0.40)
  }

  console.log(`\nDone: ${synced} files synced, ${skipped} files skipped (no mapping / handled separately).`)
}

main()
