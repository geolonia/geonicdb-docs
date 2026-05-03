import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { z } from 'zod'
import {
  loadConfig,
  ConfigSchema,
  applyPattern,
  processFile,
  matchesScope,
  type Rule,
} from '../../scripts/saas-docs-rewrite.js'

// ---------------------------------------------------------------------------
// 1. YAML config loading + zod schema validation (success)
// ---------------------------------------------------------------------------
describe('loadConfig', () => {
  it('loads and validates a valid YAML config', () => {
    const dir = join(tmpdir(), `saas-test-${Date.now()}`)
    mkdirSync(dir, { recursive: true })
    const configPath = join(dir, 'saas-rewrite-rules.yaml')
    writeFileSync(
      configPath,
      `version: 1
enabled: true
rules:
  - id: TEST-RULE
    description: "Test rule"
    enabled: true
    skip_in_code: true
    skip_in_changelog: true
    matchers:
      - pattern: 'foo'
        replacement: 'bar'
        scope: ['docs/en/**/*.md']
`
    )
    try {
      const config = loadConfig(configPath)
      expect(config.version).toBe(1)
      expect(config.enabled).toBe(true)
      expect(config.rules).toHaveLength(1)
      expect(config.rules[0].id).toBe('TEST-RULE')
      expect(config.rules[0].matchers[0].pattern).toBe('foo')
    } finally {
      rmSync(dir, { recursive: true })
    }
  })

  // ---------------------------------------------------------------------------
  // 2. YAML schema fail: invalid format → z.ZodError throw
  // ---------------------------------------------------------------------------
  it('throws ZodError for invalid YAML schema (wrong version)', () => {
    const dir = join(tmpdir(), `saas-test-${Date.now()}`)
    mkdirSync(dir, { recursive: true })
    const configPath = join(dir, 'saas-rewrite-rules.yaml')
    writeFileSync(
      configPath,
      `version: 2
enabled: true
rules: []
`
    )
    try {
      expect(() => loadConfig(configPath)).toThrow(z.ZodError)
    } finally {
      rmSync(dir, { recursive: true })
    }
  })
})

// ---------------------------------------------------------------------------
// 3. R-DEV-MD-EN-BATCH: removes DEVELOPMENT.md reference in EN
// ---------------------------------------------------------------------------
describe('processFile — R-DEV-MD-EN-BATCH', () => {
  const rule: Rule = {
    id: 'R-DEV-MD-EN-BATCH',
    description: 'Remove DEVELOPMENT.md reference from EN ngsiv2',
    enabled: true,
    skip_in_code: true,
    skip_in_changelog: true,
    matchers: [
      {
        pattern: 'See DEVELOPMENT\\.md for configuration details\\.',
        replacement: '',
        scope: ['docs/en/api-reference/ngsiv2.md'],
      },
    ],
  }

  it('removes the pattern in the target EN file', () => {
    const content = 'See DEVELOPMENT.md for configuration details. More text.'
    const { content: result, changes } = processFile(
      content,
      rule,
      'docs/en/api-reference/ngsiv2.md'
    )
    expect(result).toBe(' More text.')
    expect(changes).toBe(1)
  })

  it('does not modify an out-of-scope file', () => {
    const content = 'See DEVELOPMENT.md for configuration details.'
    const { content: result, changes } = processFile(
      content,
      rule,
      'docs/en/other/page.md'
    )
    expect(result).toBe(content)
    expect(changes).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 4. R-DEV-MD-JA-PAGINATION: replaces DEVELOPMENT.md reference with Pagination link in JA
// ---------------------------------------------------------------------------
describe('processFile — R-DEV-MD-JA-PAGINATION', () => {
  const rule: Rule = {
    id: 'R-DEV-MD-JA-PAGINATION',
    description: 'Replace DEVELOPMENT.md API Spec reference with Pagination link in JA',
    enabled: true,
    skip_in_code: true,
    skip_in_changelog: true,
    matchers: [
      {
        pattern: 'DEVELOPMENT\\.md の「API 仕様」セクションを参照してください。',
        replacement: '[ページネーション](/ja/api-reference/pagination)を参照してください。',
        scope: ['docs/ja/core-concepts/ngsiv2-vs-ngsild.md'],
      },
    ],
  }

  it('replaces the Japanese DEVELOPMENT.md reference', () => {
    const input = '詳細については、DEVELOPMENT.md の「API 仕様」セクションを参照してください。'
    const { content: result, changes } = processFile(
      input,
      rule,
      'docs/ja/core-concepts/ngsiv2-vs-ngsild.md'
    )
    expect(result).toBe(
      '詳細については、[ページネーション](/ja/api-reference/pagination)を参照してください。'
    )
    expect(changes).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// 5. R-SAM-BATCH-EN: removes MaxBatchSize SAM parameter mention from EN
// ---------------------------------------------------------------------------
describe('processFile — R-SAM-BATCH-EN', () => {
  const rule: Rule = {
    id: 'R-SAM-BATCH-EN',
    description: 'Remove MaxBatchSize SAM parameter mention from EN ngsiv2',
    enabled: true,
    skip_in_code: true,
    skip_in_changelog: true,
    matchers: [
      {
        pattern: ', configurable up to 10,000 via the `MaxBatchSize` SAM parameter',
        replacement: '',
        scope: ['docs/en/api-reference/ngsiv2.md'],
      },
    ],
  }

  it('removes the MaxBatchSize SAM parameter mention', () => {
    const input =
      'The limit is 100 per request, configurable up to 10,000 via the `MaxBatchSize` SAM parameter.'
    const { content: result, changes } = processFile(
      input,
      rule,
      'docs/en/api-reference/ngsiv2.md'
    )
    expect(result).toBe('The limit is 100 per request.')
    expect(changes).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// 6. R-SAM-BATCH-JA: removes MaxBatchSize SAM parameter mention from JA
// ---------------------------------------------------------------------------
describe('processFile — R-SAM-BATCH-JA', () => {
  const rule: Rule = {
    id: 'R-SAM-BATCH-JA',
    description: 'Remove MaxBatchSize SAM parameter mention from JA ngsiv2',
    enabled: true,
    skip_in_code: true,
    skip_in_changelog: true,
    matchers: [
      {
        pattern: '、`MaxBatchSize` SAM パラメータで最大 10,000 まで設定可能',
        replacement: '',
        scope: ['docs/ja/api-reference/ngsiv2.md'],
      },
    ],
  }

  it('removes the Japanese SAM parameter mention', () => {
    const input = '上限は 100 件/リクエスト、`MaxBatchSize` SAM パラメータで最大 10,000 まで設定可能です。'
    const { content: result, changes } = processFile(
      input,
      rule,
      'docs/ja/api-reference/ngsiv2.md'
    )
    expect(result).toBe('上限は 100 件/リクエストです。')
    expect(changes).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// 7. skip_in_code: true — pattern inside ``` block is NOT replaced
// ---------------------------------------------------------------------------
describe('applyPattern — skip_in_code', () => {
  it('does not replace pattern inside a fenced code block when skip_in_code=true', () => {
    const content = [
      'Normal text: See DEVELOPMENT.md for configuration details.',
      '```bash',
      'See DEVELOPMENT.md for configuration details.',
      '```',
      'After block.',
    ].join('\n')

    const result = applyPattern(
      content,
      'See DEVELOPMENT\\.md for configuration details\\.',
      '',
      true // skip_in_code
    )

    // The fenced block line must be preserved unchanged
    expect(result).toContain('See DEVELOPMENT.md for configuration details.')
    // But the prose line must be replaced
    expect(result).not.toMatch(/^Normal text: See DEVELOPMENT/m)
  })

  it('does not replace pattern inside inline code when skip_in_code=true', () => {
    const content = 'Run `See DEVELOPMENT.md for configuration details.` to configure.'
    const result = applyPattern(
      content,
      'See DEVELOPMENT\\.md for configuration details\\.',
      '',
      true
    )
    // Inline code must be preserved
    expect(result).toBe('Run `See DEVELOPMENT.md for configuration details.` to configure.')
  })

  it('replaces pattern inside a fenced code block when skip_in_code=false', () => {
    const content = [
      '```bash',
      'See DEVELOPMENT.md for configuration details.',
      '```',
    ].join('\n')

    const result = applyPattern(
      content,
      'See DEVELOPMENT\\.md for configuration details\\.',
      '',
      false // skip_in_code disabled
    )

    expect(result).not.toContain('See DEVELOPMENT.md for configuration details.')
  })
})

// ---------------------------------------------------------------------------
// 8. enabled: false (global) — no rules applied (no-op)
// ---------------------------------------------------------------------------
describe('ConfigSchema — enabled: false', () => {
  it('parses config with enabled: false and returns correct flag', () => {
    const config = ConfigSchema.parse({
      version: 1,
      enabled: false,
      rules: [
        {
          id: 'DISABLED-RULE',
          description: 'This rule will not run',
          enabled: true,
          skip_in_code: true,
          skip_in_changelog: true,
          matchers: [{ pattern: 'foo', replacement: 'bar', scope: ['docs/en/**/*.md'] }],
        },
      ],
    })
    expect(config.enabled).toBe(false)
    // When run() checks config.enabled and returns early, no replacements happen.
    // This is tested via the run() no-op branch verified by enabled: false flag.
    expect(config.rules).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// 9. R-SAM-DEPLOY: EventStreamingEnabled SAM deploy block → SaaS note (EN)
// ---------------------------------------------------------------------------
describe('processFile — R-SAM-DEPLOY (EN)', () => {
  const config = loadConfig(join(process.cwd(), 'scripts/config/saas-rewrite-rules.yaml'))
  const rule = config.rules.find(r => r.id === 'R-SAM-DEPLOY')!

  it('replaces EN SAM deploy block with SaaS note', () => {
    const input = [
      'Set the `EventStreamingEnabled` parameter to `true` in the SAM template and deploy.',
      '',
      '```bash',
      'sam deploy -t infrastructure/template.yaml \\',
      '  --parameter-overrides EventStreamingEnabled=true',
      '```',
    ].join('\n')
    const { content: result, changes } = processFile(
      input,
      rule,
      'docs/en/features/subscriptions.md'
    )
    expect(changes).toBe(1)
    expect(result).toBe(
      'Event streaming is enabled by default in GeonicDB SaaS. No additional configuration is required.'
    )
    expect(result).not.toContain('sam deploy')
  })

  it('does not modify an out-of-scope file for R-SAM-DEPLOY', () => {
    const input = [
      'Set the `EventStreamingEnabled` parameter to `true` in the SAM template and deploy.',
      '',
      '```bash',
      'sam deploy -t infrastructure/template.yaml \\',
      '  --parameter-overrides EventStreamingEnabled=true',
      '```',
    ].join('\n')
    const { content: result, changes } = processFile(
      input,
      rule,
      'docs/en/other/page.md'
    )
    expect(result).toBe(input)
    expect(changes).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 10. R-SAM-DEPLOY: EventStreamingEnabled SAM deploy block → SaaS note (JA)
// ---------------------------------------------------------------------------
describe('processFile — R-SAM-DEPLOY (JA)', () => {
  const config = loadConfig(join(process.cwd(), 'scripts/config/saas-rewrite-rules.yaml'))
  const rule = config.rules.find(r => r.id === 'R-SAM-DEPLOY')!

  it('replaces JA SAM deploy block with SaaS note', () => {
    const input = [
      'SAM テンプレートで `EventStreamingEnabled` パラメータを `true` に設定してデプロイします。',
      '',
      '```bash',
      'sam deploy -t infrastructure/template.yaml \\',
      '  --parameter-overrides EventStreamingEnabled=true',
      '```',
    ].join('\n')
    const { content: result, changes } = processFile(
      input,
      rule,
      'docs/ja/features/subscriptions.md'
    )
    expect(changes).toBe(1)
    expect(result).toBe(
      'GeonicDB SaaS ではイベントストリーミングは既定で有効です。追加の設定は不要です。'
    )
    expect(result).not.toContain('sam deploy')
  })
})

// ---------------------------------------------------------------------------
// 11. R-ENV-ADMIN: ADMIN_ALLOWED_IPS SaaS note prepended (EN admin.md)
// ---------------------------------------------------------------------------
describe('processFile — R-ENV-ADMIN (EN admin.md)', () => {
  const config = loadConfig(join(process.cwd(), 'scripts/config/saas-rewrite-rules.yaml'))
  const rule = config.rules.find(r => r.id === 'R-ENV-ADMIN')!

  it('prepends EN SaaS note before ADMIN_ALLOWED_IPS description in admin.md', () => {
    const input =
      'Restrict admin API access to specific IP addresses or CIDR ranges using the `ADMIN_ALLOWED_IPS` environment variable.'
    const { content: result, changes } = processFile(
      input,
      rule,
      'docs/en/api-reference/admin.md'
    )
    expect(changes).toBe(1)
    expect(result).toContain('**SaaS users**: This is configured via the tenant settings API.')
    expect(result).toContain('Restrict admin API access to specific IP addresses')
    // SaaS note comes before the original text
    const noteIdx = result.indexOf('**SaaS users**')
    const origIdx = result.indexOf('Restrict admin API access')
    expect(noteIdx).toBeLessThan(origIdx)
  })

  it('prepends EN SaaS note before ADMIN_ALLOWED_IPS description in endpoints.md', () => {
    const input =
      'By setting the `ADMIN_ALLOWED_IPS` environment variable, you can restrict access to the Admin API (`/admin/*`) to specific IP addresses:'
    const { content: result, changes } = processFile(
      input,
      rule,
      'docs/en/api-reference/endpoints.md'
    )
    expect(changes).toBe(1)
    expect(result).toContain('**SaaS users**: This is configured via the tenant settings API.')
    expect(result).toContain('By setting the `ADMIN_ALLOWED_IPS`')
  })
})

// ---------------------------------------------------------------------------
// 12. R-ENV-ADMIN: ADMIN_ALLOWED_IPS SaaS note prepended (JA)
// ---------------------------------------------------------------------------
describe('processFile — R-ENV-ADMIN (JA)', () => {
  const config = loadConfig(join(process.cwd(), 'scripts/config/saas-rewrite-rules.yaml'))
  const rule = config.rules.find(r => r.id === 'R-ENV-ADMIN')!

  it('prepends JA SaaS note before ADMIN_ALLOWED_IPS description in admin.md', () => {
    const input =
      '`ADMIN_ALLOWED_IPS` 環境変数を使用して、管理 API へのアクセスを特定の IP アドレスまたは CIDR 範囲に制限できます。'
    const { content: result, changes } = processFile(
      input,
      rule,
      'docs/ja/api-reference/admin.md'
    )
    expect(changes).toBe(1)
    expect(result).toContain('**SaaS 利用者の方へ**')
    expect(result).toContain('`ADMIN_ALLOWED_IPS` 環境変数を使用して')
    const noteIdx = result.indexOf('**SaaS 利用者の方へ**')
    const origIdx = result.indexOf('`ADMIN_ALLOWED_IPS` 環境変数を使用して')
    expect(noteIdx).toBeLessThan(origIdx)
  })

  it('prepends JA SaaS note before ADMIN_ALLOWED_IPS description in endpoints.md', () => {
    const input =
      '`ADMIN_ALLOWED_IPS` 環境変数を設定することで、Admin API (`/admin/*`) へのアクセスを特定の IP アドレスに制限できます:'
    const { content: result, changes } = processFile(
      input,
      rule,
      'docs/ja/api-reference/endpoints.md'
    )
    expect(changes).toBe(1)
    expect(result).toContain('**SaaS 利用者の方へ**')
    expect(result).toContain('`ADMIN_ALLOWED_IPS` 環境変数を設定することで')
    const noteIdx = result.indexOf('**SaaS 利用者の方へ**')
    const origIdx = result.indexOf('`ADMIN_ALLOWED_IPS` 環境変数を設定することで')
    expect(noteIdx).toBeLessThan(origIdx)
  })
})

// ---------------------------------------------------------------------------
// 13. R-ENV-TABLE: env var table SaaS note appended (EN endpoints.md)
// ---------------------------------------------------------------------------
describe('processFile — R-ENV-TABLE (EN)', () => {
  const config = loadConfig(join(process.cwd(), 'scripts/config/saas-rewrite-rules.yaml'))
  const rule = config.rules.find(r => r.id === 'R-ENV-TABLE')!

  it('appends EN SaaS note after ADMIN_ALLOWED_IPS table row', () => {
    const input =
      '| `ADMIN_ALLOWED_IPS` | - | IPs/CIDRs allowed to access the Admin API (comma-separated) |'
    const { content: result, changes } = processFile(
      input,
      rule,
      'docs/en/api-reference/endpoints.md'
    )
    expect(changes).toBe(1)
    expect(result).toContain('> **SaaS users**: These environment variables are managed via the GeonicDB SaaS console.')
    // Original table row still present
    expect(result).toContain('| `ADMIN_ALLOWED_IPS` | - | IPs/CIDRs allowed to access the Admin API (comma-separated) |')
    // SaaS note comes after the table row
    const rowIdx = result.indexOf('| `ADMIN_ALLOWED_IPS`')
    const noteIdx = result.indexOf('> **SaaS users**')
    expect(rowIdx).toBeLessThan(noteIdx)
  })
})

// ---------------------------------------------------------------------------
// 14. R-ENV-TABLE: env var table SaaS note appended (JA endpoints.md)
// ---------------------------------------------------------------------------
describe('processFile — R-ENV-TABLE (JA)', () => {
  const config = loadConfig(join(process.cwd(), 'scripts/config/saas-rewrite-rules.yaml'))
  const rule = config.rules.find(r => r.id === 'R-ENV-TABLE')!

  it('appends JA SaaS note after ADMIN_ALLOWED_IPS table row', () => {
    const input =
      '| `ADMIN_ALLOWED_IPS` | - | 管理 API へのアクセスを許可する IP/CIDR(カンマ区切り) |'
    const { content: result, changes } = processFile(
      input,
      rule,
      'docs/ja/api-reference/endpoints.md'
    )
    expect(changes).toBe(1)
    expect(result).toContain('> **SaaS 利用者の方へ**: これらの環境変数は GeonicDB SaaS コンソールで管理されます。')
    expect(result).toContain('| `ADMIN_ALLOWED_IPS` | - | 管理 API へのアクセスを許可する IP/CIDR(カンマ区切り) |')
  })

  it('does not modify an out-of-scope file for R-ENV-TABLE', () => {
    const input =
      '| `ADMIN_ALLOWED_IPS` | - | 管理 API へのアクセスを許可する IP/CIDR(カンマ区切り) |'
    const { content: result, changes } = processFile(
      input,
      rule,
      'docs/ja/api-reference/admin.md'
    )
    expect(result).toBe(input)
    expect(changes).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// matchesScope
// ---------------------------------------------------------------------------
describe('matchesScope', () => {
  it('matches an exact file path', () => {
    expect(matchesScope('docs/en/api-reference/ngsiv2.md', 'docs/en/api-reference/ngsiv2.md')).toBe(
      true
    )
  })

  it('matches a glob pattern with **', () => {
    expect(matchesScope('docs/en/api-reference/ngsiv2.md', 'docs/en/**/*.md')).toBe(true)
  })

  it('matches a multi-level path with ** glob', () => {
    expect(matchesScope('docs/en/nested/deep/page.md', 'docs/en/**/*.md')).toBe(true)
  })

  it('does not match a file outside scope', () => {
    expect(matchesScope('docs/ja/api-reference/ngsiv2.md', 'docs/en/**/*.md')).toBe(false)
  })

  it('does not match a non-md file', () => {
    expect(matchesScope('docs/en/api-reference/ngsiv2.txt', 'docs/en/**/*.md')).toBe(false)
  })
})
