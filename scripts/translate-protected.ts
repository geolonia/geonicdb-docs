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
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
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

    // Run yuuhitsu translate on the protected input (write to tmpOutput to avoid polluting final path)
    const result = spawnSync(
      'npx',
      ['yuuhitsu', 'translate', '--input', tmpInput, '--lang', lang, '--output', tmpOutput],
      { stdio: 'inherit', shell: false },
    )

    if (result.status !== 0) {
      console.error(`::error::Translation failed for ${input}`)
      return result.status ?? 1
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
      console.error(`::error::P-A1 truncation detected in ${output}: ${truncCheck.reason}`)
      return 1
    }

    // P-A1: check for incomplete output (heading/table row at end)
    const completeCheck = checkCompleteness(outputContent)
    if (!completeCheck.ok) {
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
