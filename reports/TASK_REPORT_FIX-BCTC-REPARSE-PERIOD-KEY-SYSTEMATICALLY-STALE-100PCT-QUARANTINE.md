## Task Report FIX-BCTC-REPARSE-PERIOD-KEY-SYSTEMATICALLY-STALE-100PCT-QUARANTINE

changed: [apps/mcp-server/src/scheduler/financial-reports/bctcReparseJob.ts (+25/-2), apps/mcp-server/src/__tests__/FIX-BCTC-REPARSE-PERIOD-KEY-SYSTEMATICALLY-STALE-100PCT-QUARANTINE.test.ts (new, 139L)]
commits: 6cb8641d2 (code+test) · a1eb8f164 (docs) · 2884d8614 (board lane-move) · 04cb7d39c (notebook) — all confirmed real `main`-ancestry via `git merge-base --is-ancestor`

tests: 15290 pass / 40 skip / 57 fail (full suite, exact match to implementer's claim) | targeted bctc-reparse/guard 8-file suite: 91 pass / 0 fail / 217 expect() (superset of claimed 73) | new test file: 2 pass / 0 fail
tsc: 0 errors | ddd: PASS | security: PASS | mock-guard: PASS (exit 0)
verdict: APPROVED -> DONE_VERIFIED

### Verification detail

**Root cause / fix, confirmed by code-read (not just AC prose):** `reparseSingleWithOcrFallback` previously derived its "supplied" period entirely from `parseYearQuarterFromFilename(payload.filename)` — the stranded queue row's stale filename. Fix adds `const contentPeriod = extractPeriodFromContent(rawText)` (bctcReparseJob.ts:476) and prefers it when non-null, falling back to the filename-derived `yq` only when inconclusive. Traced the full data path: the identical `rawText` string is passed verbatim as `pdfTextOverride` (bctcReparseJob.ts:488) → `resolvePdfText` short-circuits `rawText = pdfTextOverride` (resolvePdfText.ts:100-102, no re-extraction) → `parseBctcReport` calls `checkPeriodContentConsistency(rawText, period.year, period.quarter)` (parseBctcReport.ts:624) on that exact same string. Since `extractPeriodFromContent` is a pure, zero-I/O, deterministic function (periodContentExtractor.ts), the guard's internal recomputation of the content signal is guaranteed identical to the one computed upstream — `consistent: true` whenever a confident content signal exists. This closes the root cause by construction, not just for the two sampled test cases. When content is inconclusive (`null`), the code path is provably unchanged from pre-fix behavior (falls back to `yq`) — no regression risk on poor-OCR filings.

**Guard integrity:** `git show --stat 6cb8641d2` touches ONLY `bctcReparseJob.ts` + the new test file. `periodContentExtractor.ts` (`checkPeriodContentConsistency`, the period-mismatch guard) is byte-for-byte untouched — confirmed directly, not merely trusted from the commit message. This satisfies the row's own "must not weaken the guard" constraint.

**Test execution (ran myself, did not trust prose):**
- New test file (`FIX-BCTC-REPARSE-PERIOD-KEY-SYSTEMATICALLY-STALE-100PCT-QUARANTINE.test.ts`): 2 pass / 0 fail. AC-2 proves content-derived period (Q4-2024) wins over stale filename period (Q1-2024); AC-3 proves unchanged fallback to filename-derived period when content is inconclusive. Mocking only I/O-boundary deps (`extractViaService`, `pipeline`) — real domain logic (`extractPeriodFromContent`) exercised for real, mock-guard-compliant.
- Targeted 8-file bctc-reparse/guard regression (1019, 1068, 1196, 1945d, FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP, FIX-BCTC-REPARSE-DOUBLE-WRAP-DEDUP-GUARD, the new file, FIX-BCTC-INGEST-PERIOD-IDENTITY-UNVALIDATED-VS-CONTENT): 91 pass / 0 fail / 217 expect() — superset of implementer's claimed "73 targeted".
- Full suite: 15290 pass / 40 skip / 57 fail — exact match to implementer's claim. Grepped all 57 `(fail)` lines: zero reference reparse/period-key/quarantine/bctcReparseJob. Independently spot-verified the "2 bctc-adjacent" fail files claimed pre-existing: `293-ocr-fallback-pipeline.test.ts` (4/6 fail) does NOT import `bctcReparseJob.ts` (only `fetchParseAndStoreBctc.js`) and reproduces the identical timeout failures when run in ISOLATION (not just under parallel load) — 20s wall time for 6 tests even alone, confirming this is a pre-existing infra/timeout flake unrelated to this change, not merely re-asserted via git-stash as the implementer claimed.
- `bun tsc --noEmit`: 0 errors.

**DDD scan:** `periodContentExtractor.ts` (domain layer) has zero imports — genuinely pure. `bctcReparseJob.ts` (scheduler layer) importing from `domain/services/financial-reports/periodContentExtractor.js` is the correct DDD direction (application/infra → domain, never the reverse). No domain→infrastructure/application violation.

**Security scan:** no `process.env` in touched files; no hardcoded secrets/passwords/tokens (only comment-word "token(s)" noise matched, not credentials).

**Verification gate (`reparse_run_stores_at_least_one_row_no_period_mismatch`):** directly demonstrated by AC-2 — `reparseSingleWithOcrFallback` returns `true`, pipeline receives the content-consistent period, no `BctcPeriodContentMismatchError` path taken.

**DJ-GATE-1:** `docs/agent-memory/decisions/sprint-COWORK-GUARANTEED-SLOT-CATCHUP-dev-mcp-server-6.md` contains `task-id:** FIX-BCTC-REPARSE-PERIOD-KEY-SYSTEMATICALLY-STALE-100PCT-QUARANTINE` (STEP dev-mcp-server-S4) — satisfied.

**Docs:** `docs/architecture/microservice/mcp-server/financial-reports.md` invariant 13 added (cross-references invariant 10's guard, correctly states the guard is untouched); `docs/WORK.md` summary entry present; both confirmed via `git show a1eb8f164`.

**Non-blocking note:** the board row's own `.files[]` field (`apps/mcp-server/src/scheduler/bctcReparseJob.ts`) is missing the `financial-reports/` subdirectory the real file lives in — this predates the implementer (set by po/triage at task-mint time, 2026-08-12), not an implementation defect. Not blocking.

### Board / head

Row moved `task_board.review[] → task_board.done_verified[]` via `scripts/orch-apply.sh` (Stage 0/1 validation PASS, conservation check clean: `task_total` 718→718, `signal_total` 22→22, atomic rename applied). `status: DONE_VERIFIED`, `next_agent: pm`, `verification.raw_probe` attached same write. `.head` was already pointing at an unrelated live task (`UC-ASL-P3`) before this write — checked and confirmed unaffected by the prior developer lane-move commit (`2884d8614`); no head-stale correction needed on this write (known bug class checked, ruled out as inapplicable here).

Commits: `8aa74cdc7` (qa notebook), `0e8a265f5` (board lane-move, pathspec commit on `docs/data/orch/orch-state.json` only).
