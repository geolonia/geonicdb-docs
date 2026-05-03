import { readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { load as yamlLoad } from 'js-yaml'
import { z } from 'zod'
import fg from 'fast-glob'

// ---------------------------------------------------------------------------
// saas-docs-rewrite.ts
// Downstream postscript for SaaS-specific text rewrites in geonicdb-docs.
// Applies declarative rules from scripts/config/saas-rewrite-rules.yaml to
// docs/en/**/*.md and docs/ja/**/*.md, preserving upstream OSS purity.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

export const MatcherSchema = z.object({
  pattern: z.string(),
  replacement: z.string(),
  scope: z.array(z.string()),
})

export const RuleSchema = z.object({
  id: z.string(),
  description: z.string(),
  enabled: z.boolean().default(true),
  matchers: z.array(MatcherSchema),
  skip_in_code: z.boolean().default(true),
  skip_in_changelog: z.boolean().default(true),
})

export const ConfigSchema = z.object({
  version: z.literal(1),
  enabled: z.boolean().default(true),
  rules: z.array(RuleSchema),
})

export type Matcher = z.infer<typeof MatcherSchema>
export type Rule = z.infer<typeof RuleSchema>
export type Config = z.infer<typeof ConfigSchema>

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

export function loadConfig(configPath: string): Config {
  const raw = readFileSync(configPath, 'utf-8')
  const parsed = yamlLoad(raw)
  return ConfigSchema.parse(parsed)
}

// ---------------------------------------------------------------------------
// Scope matching
// ---------------------------------------------------------------------------

/** Returns true if relPath matches the given scope glob pattern. */
export function matchesScope(relPath: string, scopePattern: string): boolean {
  const normalizedFile = relPath.replace(/\\/g, '/')
  const normalizedScope = scopePattern.replace(/\\/g, '/')

  // Convert glob pattern to regex segment by segment so that ** is handled
  // correctly before single-* replacement (avoids the .* → .[^/]* double-replace bug).
  const segments = normalizedScope.split('/')
  const regexParts: string[] = []
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (seg === '**') {
      // Match zero or more path segments (including the following slash)
      regexParts.push('(?:[^/]+/)*')
    } else {
      const escaped = seg.replace(/([.+^${}()|[\]\\])/g, '\\$1')
      const part = escaped.replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')
      regexParts.push(part + (i < segments.length - 1 ? '/' : ''))
    }
  }
  const regex = new RegExp(`^${regexParts.join('')}$`)
  return regex.test(normalizedFile)
}

// ---------------------------------------------------------------------------
// Content transformation
// ---------------------------------------------------------------------------

/**
 * Apply a single pattern/replacement to content.
 * When skip_in_code is true, lines inside fenced code blocks (``` or ~~~) are
 * preserved as-is. Patterns that span prose containing inline code spans are
 * still applied — only fenced block contents are protected.
 */
export function applyPattern(
  content: string,
  pattern: string,
  replacement: string,
  skipInCode: boolean
): string {
  let regex: RegExp
  try {
    regex = new RegExp(pattern, 'g')
  } catch (cause) {
    throw new Error(`Invalid rewrite pattern: ${pattern}`, { cause: cause as Error })
  }

  if (!skipInCode) {
    return content.replace(regex, replacement)
  }

  // Process line by line, tracking fenced code block boundaries
  const lines = content.split('\n')
  let inFencedBlock = false
  const result = lines.map(line => {
    const trimmed = line.trimStart()
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inFencedBlock = !inFencedBlock
      return line
    }
    if (inFencedBlock) return line

    // When the pattern itself targets backtick-delimited spans (e.g. removing
    // "`MaxBatchSize` SAM parameter"), apply to the whole line.
    // Otherwise split by inline code spans so accidental matches inside
    // backticks are prevented.
    if (pattern.includes('`')) {
      regex.lastIndex = 0
      return line.replace(regex, replacement)
    }

    // Split line by inline code spans (`...`); odd-indexed segments are inside
    // backticks and must not be replaced.
    const segments = line.split(/(`[^`]*`)/g)
    const replaced = segments.map((seg, idx) => {
      if (idx % 2 === 1) return seg  // inside backticks, skip
      regex.lastIndex = 0
      return seg.replace(regex, replacement)
    })
    return replaced.join('')
  })

  return result.join('\n')
}

// ---------------------------------------------------------------------------
// File processing
// ---------------------------------------------------------------------------

export interface ProcessResult {
  content: string
  changes: number
}

/**
 * Apply a rule to file content.
 * Returns updated content and number of patterns that produced changes.
 */
export function processFile(
  content: string,
  rule: Rule,
  relPath: string
): ProcessResult {
  if (rule.skip_in_changelog) {
    const lower = relPath.toLowerCase()
    if (lower.includes('changelog')) {
      return { content, changes: 0 }
    }
  }

  let current = content
  let changes = 0

  for (const matcher of rule.matchers) {
    const inScope = matcher.scope.some(s => matchesScope(relPath, s))
    if (!inScope) continue

    const before = current
    try {
      current = applyPattern(current, matcher.pattern, matcher.replacement, rule.skip_in_code)
    } catch (cause) {
      throw new Error(`Rule ${rule.id} failed for pattern "${matcher.pattern}"`, {
        cause: cause as Error,
      })
    }
    if (current !== before) {
      changes++
    }
  }

  return { content: current, changes }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export interface RunStats {
  ruleId: string
  files: number
  matchedPatterns: number
}

export interface RunOptions {
  dryRun: boolean
  ruleFilter?: string
  configPath?: string
}

export function run(dirs: string[], options: RunOptions): RunStats[] {
  const baseDir = process.cwd()
  const configPath =
    options.configPath ?? join(baseDir, 'scripts/config/saas-rewrite-rules.yaml')

  const config = loadConfig(configPath)

  if (!config.enabled) {
    console.log('saas-docs-rewrite: disabled (enabled: false). No-op.')
    return []
  }

  // Collect all markdown files under specified directories (dedup via Set)
  const filesSet = new Set<string>()
  for (const dir of dirs) {
    const absDir = resolve(baseDir, dir)
    const pattern = join(absDir, '**/*.md').replace(/\\/g, '/')
    const found = fg.sync(pattern, { dot: false })
    for (const f of found) filesSet.add(f)
  }
  const files = [...filesSet]

  const statsMap = new Map<string, RunStats>()

  for (const rule of config.rules) {
    if (!rule.enabled) continue
    if (options.ruleFilter && rule.id !== options.ruleFilter) continue

    statsMap.set(rule.id, { ruleId: rule.id, files: 0, matchedPatterns: 0 })

    for (const filePath of files) {
      const relPath = relative(baseDir, filePath).replace(/\\/g, '/')
      const content = readFileSync(filePath, 'utf-8')
      const { content: newContent, changes } = processFile(content, rule, relPath)

      if (changes > 0) {
        const s = statsMap.get(rule.id)!
        s.files++
        s.matchedPatterns += changes

        if (options.dryRun) {
          console.log(`[dry-run] ${rule.id}: ${relPath} (${changes} pattern(s) matched)`)
        } else {
          writeFileSync(filePath, newContent, 'utf-8')
          console.log(`  [${rule.id}] Applied: ${relPath} (${changes} pattern(s))`)
        }
      }
    }
  }

  // Print summary
  const stats = [...statsMap.values()]
  const applied = stats.filter(s => s.matchedPatterns > 0)
  const totalFiles = applied.reduce((n, s) => n + s.files, 0)
  const totalMatchedPatterns = applied.reduce((n, s) => n + s.matchedPatterns, 0)

  console.log('\n--- saas-docs-rewrite summary ---')
  for (const s of applied) {
    console.log(`  ${s.ruleId}: ${s.files} file(s), ${s.matchedPatterns} matched pattern(s)`)
  }
  console.log(
    `Applied ${applied.length} rule(s) across ${totalFiles} file(s): ${totalMatchedPatterns} total matched pattern(s)`
  )

  return stats
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')

  const ruleIdx = args.indexOf('--rule')
  let ruleFilter: string | undefined
  if (ruleIdx >= 0) {
    const candidate = args[ruleIdx + 1]
    if (!candidate || candidate.startsWith('--')) {
      throw new Error('Invalid arguments: --rule requires a rule id')
    }
    ruleFilter = candidate
  }

  const dirs = args.filter(a => !a.startsWith('--') && a !== ruleFilter)

  run(dirs.length > 0 ? dirs : ['docs/en', 'docs/ja'], { dryRun, ruleFilter })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
