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
//   - Passes `--max-chunk-lines 100` to yuuhitsu so files >100 lines are split at
//     H2/H3 boundaries instead of being sent as a single chunk. Without this,
//     files <300 lines (the default maxChunkLines) are translated in one pass and
//     the claude provider's max_tokens=4096 truncates large table output (P-A3).
//   - Retries translation (up to MAX_RETRIES times) on P-A1 incomplete output,
//     P-A3 table corruption, or transient yuuhitsu failures.
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
  validateCodeBlocks,
} from './translate-pipeline-validators.js'
import { fixEmbeddedFences } from './fix-doc-quality.js'

/** Maximum number of retry attempts after the first try. */
const MAX_RETRIES = 2

/**
 * Build a diff-based HF3 retry hint describing specific extra/missing fence locations.
 * More targeted than a generic count-only message — tells the LLM exactly where the problem is.
 */
function buildFenceDiffHint(
  originalContent: string,
  translatedContent: string,
  originalCount: number,
  translatedCount: number,
): string {
  const transLines = translatedContent.split('\n')

  const transFenceLines: Array<{ lineNum: number; content: string }> = []
  transLines.forEach((line, i) => {
    const trimmed = line.trimStart()
    if (/^```/.test(trimmed) || /^>\s*```/.test(trimmed))
      transFenceLines.push({ lineNum: i + 1, content: line })
  })

  const diff = translatedCount - originalCount
  if (diff > 0) {
    const extra = transFenceLines.slice(originalCount, originalCount + 5)
    const fenceList = extra.map(f => `line ${f.lineNum}: \`${f.content}\``).join(', ')
    return (
      `FENCE COUNT CORRECTION: Your previous translation added ${diff} unwanted code fence(s) not in the original. ` +
      `These extra fences appeared at (translated lines): [${fenceList}]. ` +
      `Remove them and preserve the original ${originalCount} code fence(s) exactly.`
    )
  } else {
    const missing = Math.abs(diff)
    return (
      `FENCE COUNT CORRECTION: Your previous translation removed ${missing} code fence(s). ` +
      `The original has ${originalCount} code fences but your translation only has ${translatedCount}. ` +
      `Preserve all ${originalCount} code fences exactly.`
    )
  }
}

/** Maximum number of stdout lines to retain in logs (OOM guard for large translated output). */
const MAX_LOG_LINES = 50

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
 * Return the last N lines of text using a fixed-size circular buffer.
 * Iterates over the string once without allocating a full split array,
 * preventing OOM on large output (e.g., stdout from translated documents).
 */
function lastNLines(text: string, n: number): string {
  const ring: string[] = []
  let totalLines = 0
  let currentLine = ''

  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      ring.push(currentLine)
      if (ring.length > n) ring.shift()
      totalLines++
      currentLine = ''
    } else {
      currentLine += text[i]
    }
  }

  // Push any trailing content that has no terminating newline
  if (currentLine.length > 0) {
    ring.push(currentLine)
    if (ring.length > n) ring.shift()
    totalLines++
  }

  const omitted = totalLines - ring.length
  if (omitted > 0) {
    return `...(${omitted} lines omitted)...\n` + ring.join('\n')
  }
  return ring.join('\n')
}

/**
 * Escape GitHub Actions workflow-command tokens in text before logging.
 * Raw `::` sequences from subprocess output can inject workflow commands
 * (e.g., `::set-output`, `::error::`) into CI logs.
 */
function sanitizeCI(text: string): string {
  return text.replace(/::/g, '::​')
}

/**
 * SF2 chunk boundary fix: ensure a blank line exists before every code fence start
 * (```lang) that immediately follows a non-empty prose line.
 * Prevents the LLM from merging the last prose line of a chunk with the opening
 * fence of the next chunk into a single line during translation.
 */
function ensureFenceSpacing(content: string): string {
  const lines = content.split('\n')
  const result: string[] = []

  for (const line of lines) {
    const trimmed = line.trimStart()
    // If this line opens a code fence with a language identifier
    if (/^```[a-z]/.test(trimmed)) {
      // And the previous output line is non-empty, insert a blank separator
      const prev = result[result.length - 1]
      if (prev !== undefined && prev.trim() !== '') {
        result.push('')
      }
    }
    result.push(line)
  }

  return result.join('\n')
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

type RunResult = {
  status: number
  signal: string | null
  stderr: string
  elapsed: number
}

/**
 * Run yuuhitsu translate, preferring direct `node --stack-size` invocation
 * over `npx yuuhitsu` to avoid stack overflow on large inputs.
 *
 * Uses --max-chunk-lines 100 to force H2/H3-boundary splitting on files >100 lines.
 * Without this, files <300 lines (the default) are sent as a single chunk, and the
 * claude provider's max_tokens=4096 truncates large table output (P-A3 corruption).
 *
 * Logs command line, file size, exit status, signal, elapsed time, and full
 * stdout/stderr to console so CI logs expose the true yuuhitsu error.
 * All subprocess output is sanitized to prevent workflow-command injection.
 */
function runYuuhitsu(
  tmpInput: string,
  lang: string,
  tmpOutput: string,
  inputPath: string,
  inputSize: number,
  extraArgs: string[] = [],
): RunResult {
  const yuuhitsuCli = getYuuhitsuCliPath()

  let cmd: string
  let args: string[]

  if (yuuhitsuCli) {
    cmd = process.execPath
    args = [
      '--stack-size=65536',
      yuuhitsuCli,
      'translate',
      '--input', tmpInput,
      '--lang', lang,
      '--output', tmpOutput,
      '--max-chunk-lines', '100',
      ...extraArgs,
    ]
  } else {
    // Fallback: use npx (may encounter stack overflow on large files)
    cmd = 'npx'
    args = ['yuuhitsu', 'translate', '--input', tmpInput, '--lang', lang, '--output', tmpOutput, '--max-chunk-lines', '100', ...extraArgs]
  }

  // Pre-spawn diagnostic log
  console.log(`[spawn] cmd=${cmd} ${args.join(' ')}`)
  console.log(`[spawn] input=${inputPath} size=${inputSize}B lang=${lang}`)

  const startTime = Date.now()
  const result = spawnSync(
    cmd,
    args,
    { stdio: ['inherit', 'pipe', 'pipe'], shell: false },
  )
  const elapsed = (Date.now() - startTime) / 1000

  const stderr = result.stderr ? result.stderr.toString() : ''
  const stdout = result.stdout ? result.stdout.toString() : ''

  // Post-spawn diagnostic log
  console.log(
    `[spawn] exit status=${result.status ?? 'null'} signal=${result.signal ?? 'none'} elapsed=${elapsed.toFixed(1)}s`,
  )

  if (result.signal && ['SIGTERM', 'SIGKILL', 'SIGSEGV'].includes(result.signal)) {
    console.log(`::warning::Translation killed by signal: ${result.signal}`)
  }

  // Log stdout (truncated) and full stderr, both sanitized to prevent workflow-command injection
  if (stdout.length > 0) {
    console.log(`[stdout last ${MAX_LOG_LINES} lines]\n${sanitizeCI(lastNLines(stdout, MAX_LOG_LINES))}`)
  }

  if (result.error) {
    console.log(`[spawnSync error] ${sanitizeCI(result.error.message)}`)
    return { status: 1, signal: null, stderr, elapsed }
  }

  if (stderr.length > 0) {
    // Emit full stderr (not truncated) — error messages are typically small and
    // full visibility is required to diagnose yuuhitsu failures.
    console.log(`[stderr]\n${sanitizeCI(stderr)}`)
  }

  return { status: result.status ?? 1, signal: result.signal, stderr, elapsed }
}

function main(): number {
  let tmpDir: string | null = null
  try {
    const { input, lang, output } = parseArgs()

    const inputContent = readFileSync(input, 'utf-8')
    const inputSize = Buffer.byteLength(inputContent, 'utf-8')

    // P-A2: protect bullet lists before translation
    let protectedContent = protectBullets(inputContent)
    // P-A3: protect table pipe characters before translation
    protectedContent = protectTables(protectedContent)
    // SF2: ensure blank lines before code fence starts (chunk boundary protection)
    protectedContent = ensureFenceSpacing(protectedContent)

    // Write protected content to a temporary file
    tmpDir = mkdtempSync(join(tmpdir(), 'translate-protected-'))
    const tmpInput = join(tmpDir, 'input.md')
    const tmpOutput = join(tmpDir, 'output.md')
    writeFileSync(tmpInput, protectedContent, 'utf-8')

    // Ensure output directory exists
    mkdirSync(dirname(output), { recursive: true })

    // Track results across all attempts for final error summary.
    const attemptResults: Array<{ attempt: number; status: number; signal: string | null; stderr: string; elapsed: number }> = []

    // HF3 contextual retry: track fence count diff hint for next attempt
    let hf3RetryHint: string | undefined

    // Attempt translation with retries.
    // Retries address two failure modes:
    //   1. yuuhitsu exits non-zero (transient API error, rate limit, etc.)
    //   2. P-A1 incomplete output (LLM truncated the last chunk; retry produces complete output)
    //   3. HF3 code fence count mismatch (contextual retry with diff feedback)
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // Attempt-start diagnostic log
      console.log(
        `[attempt ${attempt + 1}/${MAX_RETRIES + 1}] input=${input} lang=${lang} size=${inputSize}B`,
      )

      if (attempt > 0) {
        // Remove stale output from the previous attempt
        try { if (existsSync(tmpOutput)) rmSync(tmpOutput) } catch { /* ignore */ }
      }

      // Build extra args for contextual retry (HF3 fence count diff feedback)
      const extraArgs: string[] = []
      if (hf3RetryHint) {
        extraArgs.push('--system-prompt-suffix', hf3RetryHint)
      }

      // Run yuuhitsu translate
      const { status, signal, stderr, elapsed } = runYuuhitsu(tmpInput, lang, tmpOutput, input, inputSize, extraArgs)
      attemptResults.push({ attempt: attempt + 1, status, signal, stderr, elapsed })

      if (status !== 0) {
        if (attempt < MAX_RETRIES) {
          const backoffMs = Math.pow(2, attempt) * 1000 // 1s, 2s
          console.log(
            `[attempt ${attempt + 1} failed] status=${status} signal=${signal ?? 'none'} elapsed=${elapsed.toFixed(1)}s — retrying in ${backoffMs}ms`,
          )
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, backoffMs)
          continue
        }
        // All retries exhausted — emit full summary
        const summary = attemptResults
          .map(r =>
            `attempt=${r.attempt} status=${r.status} signal=${r.signal ?? 'none'} elapsed=${r.elapsed.toFixed(1)}s` +
            (r.stderr.length > 0 ? ` stderr_tail=${JSON.stringify(sanitizeCI(r.stderr.slice(-100)))}` : ''),
          )
          .join(' | ')
        console.error(`::error::Translation failed for ${input} — ${summary}`)
        return status
      }

      // Read translation output from tmpOutput
      let outputContent: string
      try {
        if (!existsSync(tmpOutput)) {
          throw new Error(`Temporary output file not found: ${tmpOutput}`)
        }
        outputContent = readFileSync(tmpOutput, 'utf-8')
      } catch (error) {
        if (attempt < MAX_RETRIES) {
          console.warn(
            `Failed to read translated output on attempt ${attempt + 1}, retrying: ${
              error instanceof Error ? error.message : String(error)
            }`,
          )
          continue
        }
        console.error(
          `::error::Failed to read translation output for ${input}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
        return 1
      }

      // P-A2: restore bullet sentinels in translated output
      outputContent = restoreBullets(outputContent)
      // P-A3: restore table pipe sentinels in translated output
      outputContent = restoreTables(outputContent)
      // SF2: fix any embedded fences (prose + ```lang merged by LLM) in output
      outputContent = fixEmbeddedFences(outputContent)

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

      // P-A3: validate table row count — retry on corruption, error if all retries exhausted
      const tableCheck = validateTableStructure(inputContent, outputContent)
      if (!tableCheck.ok) {
        if (attempt < MAX_RETRIES) {
          console.warn(`P-A3 table corruption on attempt ${attempt + 1}, retrying: ${tableCheck.reason}`)
          continue
        }
        console.error(`::error::P-A3 table structure corrupted in ${output}: ${tableCheck.reason}`)
        return 1
      }

      // HF3: validate code block fence count — contextual retry on mismatch, error if all retries exhausted
      const codeBlockCheck = validateCodeBlocks(inputContent, outputContent)
      if (!codeBlockCheck.ok) {
        if (attempt < MAX_RETRIES) {
          // Build diff-based feedback: extract fence counts from reason, then build targeted hint
          const fenceMatch = codeBlockCheck.reason?.match(/original=(\d+), translated=(\d+)/)
          if (fenceMatch) {
            const originalFences = parseInt(fenceMatch[1], 10)
            const translatedFences = parseInt(fenceMatch[2], 10)
            hf3RetryHint = buildFenceDiffHint(inputContent, outputContent, originalFences, translatedFences)
          } else {
            hf3RetryHint = `FENCE COUNT CORRECTION: ${codeBlockCheck.reason}. Preserve the original code fence count exactly.`
          }
          console.warn(`HF3 code fence mismatch on attempt ${attempt + 1}, retrying with context: ${codeBlockCheck.reason}`)
          continue
        }
        console.error(`::error::HF3 code fence mismatch in ${output}: ${codeBlockCheck.reason}`)
        return 1
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
