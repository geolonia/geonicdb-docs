import { describe, it, expect } from 'vitest'
import { execSync } from 'child_process'

describe('VitePress build', () => {
  it('pnpm docs:build succeeds', () => {
    const result = execSync('pnpm docs:build', {
      cwd: process.cwd(),
      timeout: 120000,
      env: { ...process.env, NODE_ENV: 'production' },
      stdio: 'pipe',
    })
    expect(result).toBeDefined()
  })
})
