import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'

// ---------------------------------------------------------------------------
// Link checker for VitePress build output
// ---------------------------------------------------------------------------
// Usage:
//   pnpm check-links
//   pnpm check-links --external   (also check external URLs)
// ---------------------------------------------------------------------------

const DIST_DIR = join(process.cwd(), 'docs', '.vitepress', 'dist')
const checkExternal = process.argv.includes('--external')

interface LinkResult {
  file: string
  href: string
  status: 'ok' | 'broken' | 'error'
  detail?: string
}

/** Recursively collect all .html files in a directory */
function collectHtmlFiles(dir: string): string[] {
  const results: string[] = []
  if (!existsSync(dir)) return results

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectHtmlFiles(full))
    } else if (entry.name.endsWith('.html')) {
      results.push(full)
    }
  }
  return results
}

/** Extract href values from <a> tags in HTML content */
function extractLinks(html: string): string[] {
  const linkRegex = /href="([^"]+)"/g
  const links: string[] = []
  let match: RegExpExecArray | null
  while ((match = linkRegex.exec(html)) !== null) {
    links.push(match[1])
  }
  return links
}

/** Check if an internal link resolves to a file in dist */
function checkInternalLink(href: string, sourceFile: string): LinkResult {
  // Strip hash fragment
  const cleanHref = href.split('#')[0]
  if (!cleanHref) {
    // Hash-only link — valid (same page anchor)
    return { file: sourceFile, href, status: 'ok' }
  }

  let targetPath: string
  if (cleanHref.startsWith('/')) {
    // Absolute path from dist root
    targetPath = join(DIST_DIR, cleanHref)
  } else {
    // Relative path from current file's directory
    targetPath = resolve(dirname(sourceFile), cleanHref)
  }

  // Try exact path, then with index.html appended
  const candidates = [
    targetPath,
    join(targetPath, 'index.html'),
    targetPath + '.html',
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return { file: sourceFile, href, status: 'ok' }
    }
  }

  return { file: sourceFile, href, status: 'broken', detail: 'File not found' }
}

/** Check if an external URL is reachable */
async function checkExternalLink(href: string, sourceFile: string): Promise<LinkResult> {
  try {
    const response = await fetch(href, {
      method: 'HEAD',
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'vela-docs-link-checker/1.0' },
    })
    if (response.ok || response.status === 301 || response.status === 302) {
      return { file: sourceFile, href, status: 'ok' }
    }
    return { file: sourceFile, href, status: 'broken', detail: `HTTP ${response.status}` }
  } catch (err) {
    return { file: sourceFile, href, status: 'error', detail: String(err) }
  }
}

async function main() {
  if (!existsSync(DIST_DIR)) {
    console.error(`Error: Build output not found at ${DIST_DIR}`)
    console.error('Run "pnpm docs:build" first.')
    process.exit(1)
  }

  const htmlFiles = collectHtmlFiles(DIST_DIR)
  console.log(`Checking links in ${htmlFiles.length} HTML files...`)
  if (checkExternal) {
    console.log('External link checking enabled (--external)')
  }

  const broken: LinkResult[] = []
  const externalQueue: Promise<LinkResult>[] = []
  let totalLinks = 0

  for (const file of htmlFiles) {
    const html = readFileSync(file, 'utf-8')
    const links = extractLinks(html)

    for (const href of links) {
      // Skip non-http, mailto, tel, javascript links
      if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
        continue
      }

      totalLinks++

      if (href.startsWith('http://') || href.startsWith('https://')) {
        if (checkExternal) {
          externalQueue.push(checkExternalLink(href, file))
        }
        continue
      }

      // Internal link
      const result = checkInternalLink(href, file)
      if (result.status === 'broken') {
        broken.push(result)
      }
    }
  }

  // Process external links in batches of 10
  if (externalQueue.length > 0) {
    console.log(`Checking ${externalQueue.length} external links...`)
    const BATCH_SIZE = 10
    for (let i = 0; i < externalQueue.length; i += BATCH_SIZE) {
      const batch = externalQueue.slice(i, i + BATCH_SIZE)
      const results = await Promise.all(batch)
      for (const result of results) {
        if (result.status !== 'ok') {
          broken.push(result)
        }
      }
    }
  }

  // Report
  console.log(`\nTotal links checked: ${totalLinks}`)

  if (broken.length === 0) {
    console.log('All links OK!')
    process.exit(0)
  }

  console.error(`\nFound ${broken.length} broken link(s):`)
  for (const b of broken) {
    const relFile = b.file.replace(DIST_DIR + '/', '')
    console.error(`  ${relFile}: ${b.href} — ${b.detail || b.status}`)
  }
  process.exit(1)
}

main()
