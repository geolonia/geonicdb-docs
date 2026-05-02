# Changelog

## [Unreleased]

### Changed
- docs: SaaS 中心 docs 再編 Phase 2-A — License/Self-hosted 行削除（why-geonicdb / what-is-geonicdb / compatibility-matrix）、faq.md Deployment セクション SaaS 向け全面書き換え、orion-to-geonicdb.md SaaS 前置き追加（Q7=A）(Part of #117)

### Documentation
- docs: README に sync 関係（上流リポジトリ・管理区分・pnpm sync-docs 動作・MAPPING_TABLE 編集手順）を追記（B-1〜B-4）(Closes #111)
- fix: README docs.geonicdb.org → docs.geonicdb.com 誤記修正

### Changed
- glossary: Subscription / Context Broker を warn → block tier 昇格（cmd_337 Q1=A 殿確定）(Closes #114)
- chore(deps): bump @geolonia/yuuhitsu 0.1.12 → 0.1.13 (SF1 prompt 強化: code fence lang 必須化 + glossary warn 強化) (Closes #110)
- feat(docs): SaaS 中心 docs 再編 Phase 1 — docs/{en,ja}/getting-started/installation.md 削除、VitePress config GitHub 関連削除（socialLinks / nav GitHub / sidebar Installation）、index.md hero CTA → Sign Up(brand)/Quick Start/API Reference、changelog GitHub compare/tag URL 削除、本文 git clone / GitHub URL 削除（orion-to-geonicdb.md は Phase 2 範囲ゆえ除外）(Closes #108)

### Fixed
- fix: docs/en/changelog.md 日本語混入修正（PR#103 残存 CR Thread 6 対応）(Closes #115)
- fix(translate-pipeline): SF2 embedded fence cascade violations — `fixEmbeddedFences` in `fix-doc-quality.ts` detects and splits `prose```lang` merged lines (`.```[a-z]` pattern); applied as pre-fix in `fixBareCodeBlocks` and as post-process in `translate-protected.ts` after restore steps. `ensureFenceSpacing` pre-processes input to insert blank lines before code fence starts at chunk boundaries, preventing LLM merging. Eliminates bare block cascade violations seen in PR#97. (Closes #104)

### Changed
- chore(deps): bump @geolonia/yuuhitsu to 0.1.12 — code-block boundary protection; package.json and sync-and-translate.yml (4 locations) updated. (Closes #95)

### Added
- feat(translate-pipeline): HF3 code fence validation — `validateCodeBlocks` in `translate-pipeline-validators.ts` detects chunk-boundary fence breaks (original ≠ translated ``` count) and triggers retry. Prevents HTML build errors caused by broken code blocks. (Closes #93)
- feat(workflow): SF2 artifact upload on build failure — `sync-and-translate.yml` uploads `docs/ja/` as `translated-docs-build-failure` artifact (7-day retention) when build verification fails, enabling post-mortem analysis. (Closes #93)

### Changed
- chore(deps): bump @geolonia/yuuhitsu to 0.1.9 — fixes splitAtPositions infinite recursion (SIGSEGV) on files starting with top-level heading. Resolves CI translation failures across all 14 files. (Closes #76, upstream geolonia/yuuhitsu#38)

### Added
- chore: Add diagnostic logging to translate-protected.ts retry loop (Part of #70, Closes #72)
- fix(translate-pipeline): expose yuuhitsu true errors in CI logs — add pre/post-spawn diagnostics (cmd, file size, exit status, signal, elapsed, stdout/stderr tail) and per-attempt summary on final failure. Captures stdout via stdio pipe instead of inherit. Closes #83

### Fixed
- fix(translate-pipeline): pass `--max-chunk-lines 100` to yuuhitsu to prevent P-A3 table corruption. Without this, files <300 lines (the default maxChunkLines) are sent as a single chunk; the claude provider's max_tokens=4096 then truncates large table output (compatibility-matrix.md: 312→189 rows, 60.6%). Smaller chunks ensure each section fits within the token limit. (Closes #68)
- fix(translate-pipeline): add P-A3 table corruption to retry conditions. If chunking alone does not fully restore table rows, retries allow stochastic LLM variation to produce a complete translation. (Closes #68)
- fix(translate-pipeline): capture yuuhitsu stderr and re-emit to CI logs. Previously, yuuhitsu error messages (e.g., for ngsild.md failures) were invisible in CI output, making root cause analysis impossible.
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
