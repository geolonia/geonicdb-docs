// ---------------------------------------------------------------------------
// translate-protected.ts
// Translation wrapper with P-A2 (bullet protection) and P-A3 (table protection).
// Replaces direct `npx yuuhitsu translate` calls in CI.
// ---------------------------------------------------------------------------
// Usage:
//   npx tsx scripts/translate-protected.ts --input <file> --lang <lang> --output <file>
//
// Applies before translation:
//   - P-A2: bullet sentinel markers (protectBullets)
//   - P-A3: table pipe escaping (protectTables)
//
// Validates after translation:
//   - P-A1: truncation check (checkTruncation + checkCompleteness)
//   - P-A3: table row count validation (validateTableStructure)
//
// Fixes:
//   - Spawns yuuhitsu via `node --stack-size=65536` to prevent "Maximum call
//     stack size exceeded" on large files. NODE_OPTIONS does not allow --stack-size
//     (V8 flag), so we must pass it directly to the node executable.
//   - Retries translation (up to MAX_RETRIES times) on P-A1 incomplete output,
//     since LLM responses are stochastic and a retry often produces complete output.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import {
  protectBullets,
  restoreBullets,
  protectTables,
  restoreTables,
  checkTruncation,
  checkCompleteness,
  validateTableStructure,
} from './translate-pipeline-validators.js'

/** Maximum number of retry attempts after the first try. */
const MAX_RETRIES = 2

function parseArgs(): { input: string; lang: string; output: string } {
  const args = process.argv.slice(2)
  const get = (flag: string): string => {
    const idx = args.indexOf(flag)
    if (idx === -1 || idx + 1 >= args.length) {
      throw new Error(`Missing required argument: ${flag}`)
    }
    return args[idx + 1]
  }
  return {
    input: get('--input'),
    lang: get('--lang'),
    output: get('--output'),
  }
}

/**
 * Resolve the yuuhitsu CLI entry point (dist/cli/index.js).
 * We invoke it directly via `node --stack-size=65536` to increase the V8 stack
 * size, which prevents "Maximum call stack size exceeded" on large files.
 * NODE_OPTIONS does not allow --stack-size (it is a V8-internal flag), so the
 * only way to set it is by passing it directly to the node executable.
 */
function getYuuhitsuCliPath(): string | null {
  const scriptDir = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    // Relative to scripts/ directory (project root / node_modules)
    resolve(scriptDir, '../node_modules/@geolonia/yuuhitsu/dist/cli/index.js'),
    // Relative to cwd (fallback when run from project root)
    resolve(process.cwd(), 'node_modules/@geolonia/yuuhitsu/dist/cli/index.js'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

/**
 * Run yuuhitsu translate, preferring direct `node --stack-size` invocation
 * over `npx yuuhitsu` to avoid stack overflow on large inputs.
 */
function runYuuhitsu(tmpInput: string, lang: string, tmpOutput: string): number {
  const yuuhitsuCli = getYuuhitsuCliPath()

  if (yuuhitsuCli) {
    // Pass --stack-size=65536 (64 MB) directly to node to prevent stack overflow.
    const result = spawnSync(
      process.execPath,
      ['--stack-size=65536', yuuhitsuCli, 'translate', '--input', tmpInput, '--lang', lang, '--output', tmpOutput],
      { stdio: 'inherit', shell: false },
    )
    return result.status ?? 1
  }

  // Fallback: use npx (may encounter stack overflow on large files)
  const result = spawnSync(
    'npx',
    ['yuuhitsu', 'translate', '--input', tmpInput, '--lang', lang, '--output', tmpOutput],
    { stdio: 'inherit', shell: false },
  )
  return result.status ?? 1
}

function main(): number {
  let tmpDir: string | null = null
  try {
    const { input, lang, output } = parseArgs()

    const inputContent = readFileSync(input, 'utf-8')

    // P-A2: protect bullet lists before translation
    let protectedContent = protectBullets(inputContent)
    // P-A3: protect table pipe characters before translation
    protectedContent = protectTables(protectedContent)

    // Write protected content to a temporary file
    tmpDir = mkdtempSync(join(tmpdir(), 'translate-protected-'))
    const tmpInput = join(tmpDir, 'input.md')
    const tmpOutput = join(tmpDir, 'output.md')
    writeFileSync(tmpInput, protectedContent, 'utf-8')

    // Ensure output directory exists
    mkdirSync(dirname(output), { recursive: true })

    // Attempt translation with retries.
    // Retries address two failure modes:
    //   1. yuuhitsu exits non-zero (transient API error, rate limit, etc.)
    //   2. P-A1 incomplete output (LLM truncated the last chunk; retry produces complete output)
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        console.log(`Retrying translation (attempt ${attempt + 1}/${MAX_RETRIES + 1})...`)
        // Remove stale output from the previous attempt
        try { if (existsSync(tmpOutput)) rmSync(tmpOutput) } catch { /* ignore */ }
      }

      // Run yuuhitsu translate
      const status = runYuuhitsu(tmpInput, lang, tmpOutput)
      if (status !== 0) {
        if (attempt < MAX_RETRIES) continue
        console.error(`::error::Translation failed for ${input}`)
        return status
      }

      // Read translation output from tmpOutput
      let outputContent = readFileSync(tmpOutput, 'utf-8')

      // P-A2: restore bullet sentinels in translated output
      outputContent = restoreBullets(outputContent)
      // P-A3: restore table pipe sentinels in translated output
      outputContent = restoreTables(outputContent)

      // P-A1: check for truncation
      const truncCheck = checkTruncation(inputContent, outputContent)
      if (!truncCheck.ok) {
        if (attempt < MAX_RETRIES) {
          console.warn(`P-A1 truncation on attempt ${attempt + 1}, retrying: ${truncCheck.reason}`)
          continue
        }
        console.error(`::error::P-A1 truncation detected in ${output}: ${truncCheck.reason}`)
        return 1
      }

      // P-A1: check for incomplete output (heading/table row at end)
      const completeCheck = checkCompleteness(outputContent)
      if (!completeCheck.ok) {
        if (attempt < MAX_RETRIES) {
          console.warn(`P-A1 incomplete output on attempt ${attempt + 1}, retrying: ${completeCheck.reason}`)
          continue
        }
        console.error(`::error::P-A1 incomplete output in ${output}: ${completeCheck.reason}`)
        return 1
      }

      // P-A3: validate table row count
      const tableCheck = validateTableStructure(inputContent, outputContent)
      if (!tableCheck.ok) {
        console.warn(`::warning::P-A3 table structure issue in ${output}: ${tableCheck.reason}`)
        // Table issues are warnings — do not exit, allow CI to proceed with investigation
      }

      // All validations passed — write to final output
      writeFileSync(output, outputContent, 'utf-8')

      const ratioStr = truncCheck.ratio !== undefined
        ? ` (${(truncCheck.ratio * 100).toFixed(1)}% of input)`
        : ''
      console.log(`Translated: ${input} → ${output}${ratioStr}`)
      return 0
    }

    // Should not be reached
    return 1
  } finally {
    if (tmpDir) {
      try {
        rmSync(tmpDir, { recursive: true })
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

process.exitCode = main()
