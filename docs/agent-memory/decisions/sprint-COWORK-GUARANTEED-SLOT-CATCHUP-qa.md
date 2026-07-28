# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · qa

**Sprint goal:** cowork guaranteed-slot catch-up (ambient sprint at time of this entry; task below is unrelated dev-team Review-Lane QA-Drain work routed to qa)
**Agent:** qa
**Started:** 2026-07-28T00:00:00Z

---

### STEP qa-S1 · qa · 2026-07-28T00:00:00Z
**task-id:** UC-GCP-P1
**what-done:** Direct-commit verify (branch:null) of commit 7dcf90919 (+8c6d71683 memory) — re-ran all 6 acceptance checks live, not the dev's prose.
**what-considered:**
- Grep dangling-ref claim vs raw repo state: confirmed 2 `.claude/knowledge` refs fixed (audit script + audit brief), all other `.claude/knowledge/commit-convention.md` hits are pre-existing archival (old TASK_18xx handoffs/reports), zero live flow/skill hits.
- `-a`/`-am` rule: diffed new SSOT line 38-39 against pre-consolidation `commit-convention-format.md:36` — carried forward verbatim.
- audit script: diff shows only header+comment (11L) — deprecated in place, zero live invocation (independently re-grepped).
- tree-map 4-file subtree: now 1 node, no orphans.
**why-decision:** All 6 criteria independently verified against live tree/git log, not just review_note text — APPROVED, no gaps found.
**why-change:** no change from plan.

### STEP qa-S2 · qa · 2026-07-28T14:52:00Z
**task-id:** TASK-COWORK-CATCHUP-1
**what-done:** Direct-commit verify (branch:null) of 06808a8a1 (+81874e17c memory, 00e9f4cb6 board) — router-overridden dispatch, gates 5 dependents. Ran `node cowork-catchup-predicate.test.js` myself (34/34, read every assertion — genuinely tests AC-1/2/3, not shallow), `bun tsc --noEmit` (0 errors, but confirmed via tsconfig.json `include:["src/**/*","*.ts"]` this .js file is never in scope — AC-10 unsatisfiable-as-written, same as cadence-policy.js sibling), grep for infra imports/`task_list_held`/`process.env`/secrets (none), mock-guard.sh (PASS), exports match spec exactly (3 named exports, correct signatures).
**what-considered:**
- Schedule-file diff: byte-diffed all 23 slots' last_fired parent-vs-commit — 22 identical, 1 (digest-daily) advanced 07-24→07-25 (forward only, real cron-consistent timestamp, count unchanged 23→23). Traced root cause: migrate script does full read-JSON.parse→mutate 2 fields→JSON.stringify, so any live uncommitted dispatcher write present at read-time rides along — not script-introduced corruption. Corroborated independently by developer's own journal (S14) disclosing this exact artifact before I found it.
- `_dish_type_catchup_config` + 8 slots' `publish_date_basis` values: byte-match handoff spec exactly, incl. digest-daily=utc_date (verified NOT "corrected" to vn_date).
**why-decision:** APPROVED. All 3 ACs genuinely asserted+passing, DDD purity clean, hot-file edit additive (one explainable forward-only exception, not data loss), digest-daily quirk preserved. AC-10 recorded as unsatisfiable-as-specified (tsc never sees this file), not silently ticked.
**why-change:** no change from plan.

### STEP qa-S3 · qa · 2026-07-28T17:35:00Z
**task-id:** FIX-BDI-SHIPPING-STALE-404-GUARD
**what-done:** Direct-commit verify of 9374e65e0 (test-only)+967e3578d (memory)+15da0ab80 (lane-move REVIEW→QA), all main-ancestor confirmed. Did not trust dev/PO prose — read `supplyChainTools.ts:114-125` myself, confirmed the `indices.length===0` branch genuinely emits the exact "Không đủ dữ liệu..." string the new assertion checks. Re-ran 1408 standalone (8/8) + full 12-file merge-gate suite (115/115, matches claim) + `bun tsc --noEmit` (exit 0).
**what-considered:**
- Repo-wide `bun test` attribution (56 fail/1 error → standing FIX-MCP-SUITE-HEALTH-BASELINE + 1 unrelated `_deprecated/1302-technical-indicators.test.ts` failure): confirmed FIX-MCP-SUITE-HEALTH-BASELINE is a real tracked BACKLOG row (not invented); independently ran `1302-technical-indicators.test.ts` standalone — 2 fail (MA/RSI/MACD text assertions), both untouched by and unrelated to this diff's supply-chain/diacritics scope, corroborating the "unrelated" half of the claim. Full-suite run itself started but did not complete in-session (heavy concurrent host load, ~15k tests) — not blocking given targeted-suite-governs is the pinned CANONICAL reading (dev-standards.md:590) and the diff's own blast radius (1 test file, assertion-only) is independently confirmed.
- Lane-move commit 15da0ab80: verified row now sits in `task_board.qa[]` (status QA, next_agent qa) and no longer in `review[]`; `orch-validate.mjs` Stage 0+1 PASS.
**why-decision:** APPROVED at the QA-mechanism level — source-verified fix, test-only repair matches live behaviour exactly, zero regression, journal/notebook present (DJ-GATE-1 satisfied). NOT flipping to DONE_VERIFIED: origin push + fresh CI run (gate id `ci_green_on_subsequent_push`) still required to close the underlying ci_red signals (CI-RED-6ba39d3c/bda56d1c/1a4cbfb0) — that is a router/push-cascade step, out of QA's direct-commit-verify scope but explicitly named as still-open in the dispatch brief.
**why-change:** none — followed the dispatch brief's own close-gate checklist.

### STEP qa-S4 · qa · 2026-07-28T20:20:00Z
**task-id:** FACTORY-APP-split-assembleBriefing
**what-done:** Direct-commit verify of a `review[]` row (not `qa[]` — never drained, next_agent=qa still on the row itself; verified `scripts/devteam-review-claim-qa-drain.jq` would NOT have selected this row anyway — 90+ older `REVIEW`+`next_agent==qa` rows exist dating to 2026-07-23, so I verified this specific id directly rather than running the drain, per router's explicit dispatch). Commits `4744b0792` (code, 26 files: assembleBriefing.ts sequencer + 24 briefing/ modules + types.ts + usecases.md doc) + `09ae11440` (memory, TOCTOU-affected but out-of-scope per dispatch note, not re-litigated) + `7bb2a6784` (board flip in_progress→review), all confirmed on `main` ancestry via `git merge-base --is-ancestor`.
**what-considered:**
- Independently re-ran `bun tsc --noEmit`: 0 errors. Ran a broader-than-claimed targeted suite (38 files matching `assembleBriefing|briefing/` grep, superset of dev's claimed 27+5): 366 pass / 0 fail — cleaner than dev's own claimed "251 pass/1 fail pre-existing cron-expr" (my run hit zero, likely order-variance on the same standing flake, not a regression signal).
- Attempted full repo-wide `bun test` myself: killed after ~8 min at ~23% (284/1233 files) — did not complete under host load, matches this exact suite's known non-determinism (cycle-491/492 precedent) and the pinned CANONICAL reading `dev-standards.md:591` that repo-wide 0-fail is permanently unsatisfiable (standing `FIX-MCP-SUITE-HEALTH-BASELINE`) — targeted/merge-gate suite governs, and that is fully green, so non-blocking.
- File-count math: dev's review_note says "24 files: types.ts + 22 step/helper files" (arithmetically 23, not 24) but the task's own DoD wording ("24 single-owner query/compute modules") matches exactly — `ls` confirms 24 non-`types.ts` modules + `types.ts` = 25 files in `briefing/`, code commit touches all 25 + the sequencer + 1 doc = 27 total paths (26 code + 1 doc). Cosmetic prose imprecision only, not a scope discrepancy — not blocking.
- Verified every non-`types.ts` module ≤120L (max 107L; `types.ts` 180L carries its own size-justification comment, matches repo precedent). `_assembleBriefingImpl` function body itself (not the whole file) is exactly lines 216–287 = 72L, matching the "72L sequencer" claim precisely (whole file is 287L due to re-exports/type declarations, which is expected and documented in the file's own header comment).
- Grepped `computeRSILocal` repo-wide: zero live references, only explanatory comments in `defaultComputeTa.ts` documenting its removal — dead-code claim confirmed.
- Verified all 5 claimed consumer modules (`assembleEveningSummary.ts`, `morningBriefingJob.ts`, `franceSummaryJob.ts`, `eveningSummaryJob.ts`, `usecases/index.ts`) import from `assembleBriefing.js` AND were NOT touched by commit `4744b0792` (`git show --name-only` diff against the 5 paths — zero overlap) — zero-call-site-churn claim independently confirmed, not just trusted.
- `mock-guard.sh --files` PASS on all 26 touched production files; DDD scan (infra-import grep) and security scan (`process.env`/secrets grep) both clean on the same file set.
- `gen-project-stats.ts` independently re-run: toolCount=184/cronJobCount=88 — exact match to claim (reverted the script's own `lastUpdated`-timestamp side-effect on `docs/data/project-stats.json` afterward, no other diff).
- Live server probe on alt port 3098 (did not touch the running :3000 container): `/health` toolCount=184, `/dashboards/news-fetch/` HTTP 200 — killed the probe process and confirmed port freed after.
- `.head` (top-level, authoritative) is currently owned by an unrelated task (`TASK-COWORK-CATCHUP-2`, in_progress) — did NOT touch `.head` at all, only the two board-array entries for this row's own id.
**why-decision:** APPROVED, DONE_VERIFIED. Every claim in the dev's review_note independently re-derived from source (not trusted at face value) — split is a genuine zero-drift extraction, all budgets met, all exports/consumers verified byte-for-byte unchanged, dead code confirmed removed, doc updated, stats/health live-confirmed. The one repo-wide full-suite gap is explicitly non-blocking per pinned CANONICAL policy and does not affect this row's own blast radius, which is independently proven clean.
**why-change:** none — dispatch brief's explicit instruction (re-run independent verification, verify-committed mode, do not re-litigate the 09ae11440 TOCTOU) followed as given.

### STEP qa-S5 · qa · 2026-07-28T20:35:33Z
**task-id:** TASK-COWORK-CATCHUP-2
**what-done:** Direct-commit verify (`review[]` row, `branch:null`, `qa_verify_mode:verify-committed`) of 4-commit stack `c5e7c6747`(code+test)/`fd5d4565e`(docs)/`64c41a6e0`(board)/`d7330d539`(memory), all confirmed on local main AND `origin/main` ancestry.
**what-considered:**
- NFR-2 literal byte-diff: `git show c5e7c6747^:...js` vs current — lines 1-298 (incl. `matchSlots()` body + `module.exports`) MD5-identical; sole diff is 22 additive lines inside `require.main===module`. Ran `node cowork-match-slots.test.js` myself: 43/43. Reproduced RED independently (swapped in pre-change source only) — hard TypeError crash on TC-25, restored byte-identical after (empty `git diff`).
- Sibling `cowork-catchup-predicate.test.js`: re-ran 34/34, confirmed file untouched by this commit via `git show --stat`. `bun tsc --noEmit` (apps/mcp-server) 0 errors. Docs spot-check: `match-slots.md` documents `catchup_raw` shape exactly; `WORK.md` 1-liner present.
- Exercised fallback-path directly (not just via test): predicate module deleted in isolated scratch dir — exits 0, `catchup_raw:[]`, stderr WARN, no crash. Live-ran CLI against real production schedule — schema matches docs exactly.
- Tool-grant claim: `.claude/agents/developer.md` frontmatter = `Read, Edit, Write, Glob, Grep, Bash` — no MCP tool, confirms structural (not excuse) basis for pathspec-scoped commits instead of commit-mutex, corroborated by developer journal STEP developer-S16.
- All 4 commits' `git show --stat` file-lists match exactly what each commit claims — no peer-sweep. `orch-validate.mjs` Stage0+1 PASS.
**why-decision:** Every claim independently re-derived from source (byte-diff, live RED/GREEN reproduction, direct fallback exercise, live CLI run), not trusted at face value — genuine additive-only change, NFR-2 literally holds, docs accurate, tests real. APPROVED, DONE_VERIFIED.
**why-change:** none — followed dispatch brief's explicit verification checklist.

### STEP qa-S6 · qa · 2026-07-28T23:57:14Z
**task-id:** UC-GCP-P3
**what-done:** Direct-commit verify (`qa[]` row, `branch:null`, oldest-stranded pickup, 5d+ dwell) of 2-commit stack `e77635933`(spec: drain-signals.md + commit-boundary/SKILL.md)/`2d7aec151`(notebook+journal), both confirmed on main ancestry via `git merge-base --is-ancestor`.
**what-considered:**
- Diffed `e77635933` content against `dev_result` claim verbatim — `git add -u -- docs/signals/ && git add -- docs/signals/processed/` + post-commit `git status --porcelain` clean invariant + RULE-1 cross-ref all present, live doc text unaltered since.
- Re-ran (not trusted): `drain-signals.test.js` 36/36 pass; `bun tsc --noEmit` 0 errors; docs-only, no production files, mock-guard N/A.
- Bonus router ask — is the fix actually in live use, not just documented: checked today's (2026-07-29) real drain commits. `bd2d6ec903` shows 3 pure `D` entries / 0 `A` (exact `-u` semantics — deletions captured, the bug this row fixes). `24703a07fa` shows the second `git add -- processed/` picking up 1 new untracked-new file. This session's own untracked `docs/signals/*.json` litter (context-bloat-*, cowork-team-*, price_anomaly_*) stays unswept across every recent drain commit — confirms tracked-only scoping holds live, not a paper fix.
- DJ-GATE-1 corroborated: developer's own journal entry present (`sprint-ULTRACODE-AUDIT-FIXALL-developer.md` STEP developer-S21, task-id stamped) before this verify ran.
**why-decision:** APPROVED, DONE_VERIFIED. Fix matches claim exactly, is genuinely deployed (live commits since prove the pattern in production), zero regression, journal present. Board row moved `task_board.qa[]`→`done_verified[]` via `jq`+`scripts/orch-apply.sh` (task_total 670→671, qa-lane move nets +1 by design per cycle-490/489/492 precedent). `.head` was `active_task_id:UC-GCP-P3` — synced to idle in the same write (branch:null rule).
**why-change:** none — router's ask followed exactly, including the bonus live-use sanity check.
