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

  // Escape regex special chars except * and ?
  const escaped = normalizedScope.replace(/([.+^${}()|[\]\\])/g, '\\$1')
  // Convert glob wildcards to regex
  const regexStr = escaped
    .replace(/\\\*\\\*/g, '.*')   // \*\* → .*
    .replace(/\*/g, '[^/]*')      // * → [^/]*
    .replace(/\?/g, '[^/]')       // ? → [^/]
  const regex = new RegExp(`^${regexStr}$`)
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
  const regex = new RegExp(pattern, 'g')

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

    // Reset lastIndex between reuses (regex has 'g' flag)
    regex.lastIndex = 0
    return line.replace(regex, replacement)
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
    current = applyPattern(current, matcher.pattern, matcher.replacement, rule.skip_in_code)
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
  replacements: number
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

  // Collect all markdown files under specified directories
  const files: string[] = []
  for (const dir of dirs) {
    const absDir = resolve(baseDir, dir)
    const pattern = join(absDir, '**/*.md').replace(/\\/g, '/')
    const found = fg.sync(pattern, { dot: false })
    files.push(...found)
  }

  const statsMap = new Map<string, RunStats>()

  for (const rule of config.rules) {
    if (!rule.enabled) continue
    if (options.ruleFilter && rule.id !== options.ruleFilter) continue

    statsMap.set(rule.id, { ruleId: rule.id, files: 0, replacements: 0 })

    for (const filePath of files) {
      const relPath = relative(baseDir, filePath).replace(/\\/g, '/')
      const content = readFileSync(filePath, 'utf-8')
      const { content: newContent, changes } = processFile(content, rule, relPath)

      if (changes > 0) {
        const s = statsMap.get(rule.id)!
        s.files++
        s.replacements += changes

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
  const applied = stats.filter(s => s.replacements > 0)
  const totalFiles = applied.reduce((n, s) => n + s.files, 0)
  const totalReplacements = applied.reduce((n, s) => n + s.replacements, 0)

  console.log('\n--- saas-docs-rewrite summary ---')
  for (const s of applied) {
    console.log(`  ${s.ruleId}: ${s.files} file(s), ${s.replacements} replacement(s)`)
  }
  console.log(
    `Applied ${applied.length} rule(s) across ${totalFiles} file(s): ${totalReplacements} total replacement(s)`
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
  const ruleFilter = ruleIdx >= 0 ? args[ruleIdx + 1] : undefined

  const dirs = args.filter(a => !a.startsWith('--') && a !== ruleFilter)

  run(dirs.length > 0 ? dirs : ['docs/en', 'docs/ja'], { dryRun, ruleFilter })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
