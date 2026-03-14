# Changelog

## [Unreleased]

### Fixed
- fix(translate-pipeline): spawn yuuhitsu via `node --stack-size=65536` to prevent "Maximum call stack size exceeded" on large files (ngsild.md). NODE_OPTIONS does not allow `--stack-size` (V8-internal flag), so it must be passed directly to the node executable. (Closes #66)
- fix(translate-pipeline): add retry logic (up to 2 retries) for P-A1 incomplete output. LLM responses are stochastic; a retry on truncated output typically produces a complete translation. (Closes #66)

### Added
- feat(translate-pipeline): implement 5 quality patterns (P-A1〜P-A5)
  - **P-A5**: Language directory check — blocks docs/en/ files with non-ASCII ratio > 30%
  - **P-A4**: File mapping validation — detects content-title mismatch in sync mapping table
  - **P-A1**: Truncation detection — errors on translation output < 50% of input line count, or ending with incomplete heading/table row
  - **P-A2**: Bullet list preservation — sentinel marker approach protects list newlines during translation
  - **P-A3**: Table structure protection — pipe escaping + row count validation prevents table corruption
- feat(translate-pipeline): add `scripts/translate-pipeline-validators.ts` with exported validator functions
- feat(translate-pipeline): add `scripts/translate-protected.ts` — yuuhitsu translation wrapper applying P-A1/P-A2/P-A3 guards
- feat(translate-pipeline): update `sync-and-translate.yml` to use `translate-protected.ts` for all translations
- feat(translate-pipeline): add `@types/node` devDependency for TypeScript type checking
- test(translate-pipeline): add 51 unit tests for all 5 validator patterns in `tests/unit/translate-pipeline-validators.test.ts`
