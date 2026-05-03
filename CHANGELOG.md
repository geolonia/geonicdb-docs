# Changelog

## [Unreleased]

### Added
- [feat] cmd_382 — fixListMerge に DEBUG_FIXLISTMERGE=1 制御の debug logging 追加（skip 理由・行番号記録）(Closes #172)
- [feat] cmd_378 — fix-doc-quality.ts SF4 拡張: fixEmbeddedFences 4/5-backtick edge case (B軸) + fixHeadingMerge heading+inline-code+body 分離 (C軸)。unit tests 9 件追加 (Closes #164)
- [feat] cmd_375 SF4 — fix-doc-quality.ts に fixListMerge / fixHeadingMerge / fixHorizontalRuleMerge / fixAnchorI18n 4 関数追加 + unit tests 29 件。list/heading/hr 連結検出・自動分割、ja docs アンカー Hybrid auto-fix 実装 (Closes #159)
- [feat] Phase 2 — saas-rewrite-rules.yaml に R-SAM-DEPLOY + R-ENV-ADMIN + R-ENV-TABLE 3 rules 追加 + unit tests 9 件（cmd_372）(Closes #154)
- [feat] Phase 1 — saas-docs-rewrite.ts + YAML rule config (R-DEV-MD + R-SAM-BATCH) 実装（cmd_371）(Closes #152)

### Changed
- [glossary] Context Broker hybrid 形式化 — 「ブローカー」を except_after で復活、MQTT/Message/Event broker 文脈を許容（cmd_361）(Closes #137)
- chore(deps): bump @geolonia/yuuhitsu 0.1.13 → 0.1.14 (SF6 context_exception hybrid schema) (Closes #136)

### Fixed
- [fix] cmd_381 — saas-rewrite 冪等化: R-ENV-ADMIN/R-ENV-TABLE に negative lookbehind/lookahead 追加、skip_in_code: false に変更して全文一括マッチングを有効化。unit tests 6 件追加 (Closes #171)
- [fix] cmd_379 — PR#166 残課題 hotfix: saas-rewrite 重複注記削除（en+ja admin.md）、fixListMerge 範囲外 list 5箇所・OS パス 1箇所分離、changelog.md 見出し連結修正、ngsiv2-vs-ngsild.md TOC アンカー + heading 連結修正、subscriptions.md 誤記修正 + DPoP アンカー追加、endpoints.md bare fence 2件修正 (Closes #167)
- [fix] cmd_376 — PR#161 残課題 3 種 hotfix: bare fence 55 件修正 (11 merged lines in 7 files)、geonicdb 小文字 prose 露出解消（Glossary Check 修正と共通原因）、smart-data-models.md heading 連結分離 (Closes #162)
- [fix] cmd_373 — PR#155 ja list/heading 連結 + アンカー hotfix（ngsild.md 11箇所 list 分離 + ngsiv2-vs-ngsild.md heading/hr 分離 + #federation → #フェデレーション）(Closes #157)
- [fix] PR#146 close + bare fence 修正 (6 ja files) + DEVELOPMENT.md 参照暫定削除（cmd_368）(Closes #148)
  ※ cmd_370 で DEVELOPMENT.md 参照の適切リンク整備予定
- [fix] glossary.yaml Subscription do_not_use.ja から「購読」削除 — subscribe 自然訳として許容（cmd_366）(Closes #144)
- [fix] ロゴ配置（geonicdb-logo.svg）+ Phase 1 socialLinks 残務削除（shared.ts の GitHub エントリ削除）（cmd_357）

### Added
- feat: SaaS 6 ステップ手順書再編 — onboarding.md / tenant-admin-user.md 新規追加、quickstart / sign-up / api-key / console 更新、sidebar 順序更新（cmd_352） (Closes #126)
- feat: SaaS 中心 docs 再編 Phase 3 — 新規 SaaS 5 ページ追加（quickstart/sign-up/console/api-key/first-call × en/ja）、sidebar/nav/index.md hero CTA を新ページへ更新 (Closes #123)

### Changed
- refactor: Demo App / First Entity Tutorial を docs/{en,ja}/saas/ 配下に移動（Phase 2-B）、sidebar を SaaS セクションに統合（Q1=B）、内部リンク全更新 (Part of #117)
- docs: SaaS 中心 docs 再編 Phase 2-A — License/Self-hosted 行削除（why-geonicdb / what-is-geonicdb / compatibility-matrix）、faq.md Deployment セクション SaaS 向け全面書き換え、orion-to-geonicdb.md SaaS 前置き追加（Q7=A）(Part of #117)

### Documentation
- docs: README に sync 関係（上流リポジトリ・管理区分・pnpm sync-docs 動作・MAPPING_TABLE 編集手順）を追記（B-1〜B-4）(Closes #111)
- fix: README docs.geonicdb.org → docs.geonicdb.com 誤記修正

### Changed
- glossary: Subscription / Context Broker を warn → block tier 昇格（cmd_337 Q1=A 殿確定）(Closes #114)
- chore(deps): bump @geolonia/yuuhitsu 0.1.12 → 0.1.13 (SF1 prompt 強化: code fence lang 必須化 + glossary warn 強化) (Closes #110)
- feat(docs): SaaS 中心 docs 再編 Phase 1 — docs/{en,ja}/getting-started/installation.md 削除、VitePress config GitHub 関連削除（socialLinks / nav GitHub / sidebar Installation）、index.md hero CTA → Sign Up(brand)/Quick Start/API Reference、changelog GitHub compare/tag URL 削除、本文 git clone / GitHub URL 削除（orion-to-geonicdb.md は Phase 2 範囲ゆえ除外）(Closes #108)

### Fixed
- fix: PR#127 CR Minor 後追い — tenant-admin-user.md ステップ重複解消 + ::: details 空行修正（cmd_356）(Closes #129)
- fix: cmd_350 HF — glossary block 違反 hotfix（Context Broker do_not_use.ja から「ブローカー」除外 — MQTT broker 等一般語との衝突を解消）(Closes #128)
- fix: MAPPING_TABLE から DEVELOPMENT.md / DEPLOYMENT.md 孤児エントリ削除（cmd_340 hotfix）(Closes #121)
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
