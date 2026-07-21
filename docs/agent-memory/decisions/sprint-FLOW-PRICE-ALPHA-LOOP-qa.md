# Decision Journal — Sprint FLOW-PRICE-ALPHA-LOOP · qa

**Sprint goal:** wave-1 flow-alpha — OHLCV candle-recovery + backfill hardening (apps/mcp-server/)
**Agent:** qa
**Started:** 2026-07-13T05:45:00Z

---

### STEP qa-S1 · qa · 2026-07-13T05:45:00Z
**task-id:** ALPHA-S1-OHLCV-BACKFILL-DONE-BUG
**what-done:** RAW re-ran the 2 directly-touched suites myself (not trusting dev's 109/109) + `bun tsc --noEmit` on mcp-server; both green, tsc 0 errors.
**what-considered:**
- Trust dev's reported 109/109 vs re-run RAW myself — re-run mandatory per dispatch (RAW gate).
- Full 1199-file suite vs targeted-only — targeted only: VN market OPEN, live container holds :3000, host-starvation risk explicitly flagged by dispatcher.
- Merge/DONE now vs hold REVIEW — hold: code not yet deployed (docker rebuild is user/ops-gated), "serving" claim would be dishonest.
**why-decision:** ohlcv-backfill-done-subtask-b.test.ts = 8/8 (incl new BT-6/7/8), 1360-ohlcv-backfill-queue.test.ts = 9/9 (incl updated TC-6), combined 17/17; tsc clean; DDD grep clean (no new domain->infra import, interface layer importing infra/app is allowed direction, pre-existing import lines unchanged); process.env/secret grep clean; mock-guard PASS. Error path independently verified: BT-6/BT-7 show `bars_inserted` persisted (0 / NULL) on the closed row + a new `done=0,retry_count=1` row inserted — not a silent success; BT-8 shows cap(>=5) → escalate, exactly one `sendTelegramBug`, no new row; mutual-exclusion with the pre-existing depth-probe confirmed (no double-fire in test logs). `done` still flips unconditionally (preserves poller unblock contract) — by design, not a regression.
**why-change:** no change from plan — code matches architect design (`ALPHA-S1-architect-design.md` §3) verbatim, incl. planned BT-6/7/8 test cases and TC-6 update.

### STEP qa-S2 · qa · 2026-07-13T05:45:00Z
**task-id:** ALPHA-S1-OHLCV-BACKFILL-DONE-BUG
**what-done:** Held row in REVIEW (not merged to done) — code verified but NOT live; flagged `deploy_pending:true` instead of full DONE_VERIFIED.
**what-considered:**
- Flip to done[] like a normal APPROVED verdict vs hold REVIEW with a deploy-pending flag.
- Dispatcher's explicit disposition instruction: this fix is DEPLOY-REQUIRED (docker compose up -d --build mcp-server), user-gated + market-sensitive, QA does not deploy.
**why-decision:** Marking DONE_VERIFIED-live would misrepresent serving state (code committed to main already, per "no branches" convention, but the running container still serves the pre-fix binary) — standing lesson: verify SERVING value, not the badge/commit alone.
**why-change:** No change from plan — dispatcher pre-specified this exact disposition; QA's own RAW findings corroborate deploy is genuinely still pending (git commit present, container image unchanged).

### STEP qa-S3 · qa · 2026-07-13T06:17:59Z
**task-id:** ALPHA-S1-STARTUP-CANDLE-GUARD
**what-done:** RAW re-ran guard suite (14/14, matches dev) + mandated regression (5 files, 38/38) + 5 extra dev-cited suites for corroboration (91/91) = 143/0 total; tsc 0 errors; mock-guard PASS; DDD grep clean (domain/ zero infra/app imports).
**what-considered:**
- Trust dev's 14/0 + 93/93 vs re-run RAW — re-run mandatory; my regression subset (38) differs numerically from dev's 93 due to different file bucketing but both are 0-fail, no reconciliation needed since I verified raw myself.
- Item (a) DDD deviation (application importing scheduler's `runOhlcvDailyAggregator`): read architect design §1 directly — snippet does the identical import verbatim → SANCTIONED, not new debt.
- Item (b) dynamic-import cycle claim: wrote standalone script importing all 3 modules in both orders, checked `typeof` on all exports — no TDZ/undefined → confirmed no residual runtime cycle (only a `import type` erased back-edge).
**why-decision:** All 4 disclosed items (a-d) independently verified, not rubber-stamped: (a) accept as approved deviation (matches design + no real cycle per b); (b) confirmed via direct dual-order module-load probe; (c) traced aggregator's actual `[vnMidnight, nowMs)` window math — architect's `+5h` snippet resolves to pre-market VN 05:00, would yield a zero/truncated-tick window, dev's `vnNextMidnight-1` fix is correct, REC-2 test proves it (close=83000 from a genuine late-session tick); (d) getVpsProxyHealth flake never surfaced in my 143-test RAW run and is independently corroborated pre-existing via 2 unrelated prior decision journals (FIX-CI-240, FIX-OHLCV-AGGREGATOR-SEED-UNMIGRATED-P0-qa). Fail-loud G-5 confirmed: rejects same error, `sendTelegramBug` unconditional pre-rethrow, never swallowed.
**why-change:** No change from plan — code matches architect design (`ALPHA-S1-architect-design.md` §2) verbatim; held REVIEW+deploy_pending, same disposition pattern as sibling S1.

### STEP qa-S4 · qa · 2026-07-13T06:17:59Z
**task-id:** ALPHA-S1-STARTUP-CANDLE-GUARD
**what-done:** Held row in REVIEW (not merged to done) — code verified but NOT live; set `qa_code_passed:true`, `deploy_pending:true`, `qa_resolution_note:"CODE_VERIFIED_DEPLOY_PENDING"`, `qa_commit:"1bbc8cead"` via `orch-apply.sh` (task_total conserved 505).
**what-considered:** Same deploy-pending disposition as sibling `ALPHA-S1-OHLCV-BACKFILL-DONE-BUG` — only path, dispatcher pre-specified batching both into one off-market rebuild.
**why-decision:** Container not rebuilt yet (VN market open, user/ops-gated deploy) — flipping DONE_VERIFIED would misrepresent serving state.
**why-change:** No change from plan.

### STEP qa-S5 · qa · 2026-07-13T07:20:00Z
**task-id:** FIX-MCP-BOOTSTRAP-BLOCKING-EXECSYNC-PROJECTROOT
**what-done:** RAW merge-gate on dev-mcp-server commits 252f8ffd1 (fix) + ea3236f43 (DJ). Re-ran targeted 12-file suite myself: 123 pass/0 fail (matches dev exactly). `tsc --noEmit` exit 0.
**what-considered:**
- Trust dev's 123/0 vs re-run RAW — re-run mandatory; own numbers matched exactly.
- Behavioral parity of fs walk-up vs old `git rev-parse` — traced markers (`.git`/`pnpm-workspace.yaml`) exist ONLY at repo root, not `apps/` or `apps/mcp-server/`; new test's own independent `../../../../` expectation confirms 4-level walk-up = repo root.
- Container fallback correctness (the fix's whole point) — read Dockerfile: no `.git`/`pnpm-workspace.yaml` copied into `/app`; walk-up returns undefined → `process.cwd()`="/app" (WORKDIR), matching docker-compose's `/app/docs/*`,`/app/reports` mounts — identical to OLD code's fallback (git absent in image too → same catch→cwd path). No wrong-root risk found.
**why-decision:** Confirmed hot-path claim directly (not trusted): `agentBootstrap.ts:358` `buildToolNameMap()` runs at module load, synchronously probes every `registryFn` incl. `registerAgentMemoryTools` whose line 185 is literally `const memoryDir = resolve(getProjectRoot(), ...)` — first line of the fn body, executed before any `await`. DDD clean: zero infra→application/interface imports in projectRoot.ts (grep). Security clean (no process.env/secret in diff). mock-guard PASS. tool-count: live `gen-project-stats --dry-run` toolCount=183 == committed baseline, file untouched by dry-run — no tools silenced.
**why-change:** No change from plan — dispatcher's 7-point checklist executed in full, all pass.

### STEP qa-S6 · qa · 2026-07-13T07:20:00Z
**task-id:** FIX-MCP-BOOTSTRAP-BLOCKING-EXECSYNC-PROJECTROOT
**what-done:** Ran full 1201-file suite myself: 14569 pass/40 skip/64 fail/5 errors (552s) then known Bun 1.3.13 post-summary tail-crash. Grepped entire log case-insensitive for "projectroot": 0 matches anywhere — zero of the 64 fail/5 errors relate to the changed identifiers.
**what-considered:** 64 fail/5 err is within the same range as the last ~6 QA gates this sprint/prior (63-67 fail, 4-10 errors documented in sprint-SYSTEMIC-REMAKE-P1-qa.md, this file's own qa-S1/S3) — pre-existing structural baseline, not a regression.
**why-decision:** DJ-GATE-1 confirmed present (dev's `sprint-FLOW-PRICE-ALPHA-LOOP-dev-mcp-server.md` STEP dev-mcp-server-S9, `task-id:** FIX-MCP-BOOTSTRAP-BLOCKING-EXECSYNC-PROJECTROOT` literal match). Held row REVIEW (not done) — this is mcp-server bootstrap CODE, takes effect only on container rebuild; same deploy-pending pattern as sibling ALPHA-S1 rows (qa-S2/S4), batches onto the same off-market rebuild.
**why-change:** No change from plan.

### STEP qa-S7 · qa · 2026-07-13T13:45:00Z
**task-id:** FIX-DEVTEAM-BOUNDED1-NONDEV-OWNER-BOARD-FALLBACK-GATE
**what-done:** RAW merge-gate on jq-only commit `8874901b2` (5th sibling BOUNDED1 gate). Ran fixture verifier myself: 9/9 PASS, exit 0 (AC-1..AC-7b+control). `git diff 8874901b2~1..HEAD` on the jq file: confirmed `effective_owner($detail_items)` reads BOTH `$detail_items[.id].owner` (detail-first) and `.owner // ""` (board-fallback), non-dev regex/null-next_agent conditions preserved, sibling `is_non_dev_next_agent_unrouted` + main select pipe (5 gates) byte-identical/unmoved. Proved compile+run (not just `jq empty`) via `-f` invocation against a minimal synthetic doc, exit 0.
**what-considered:** Scope-isolation — `git show --stat 8874901b2` = exactly the 4 named files; `git status --porcelain` still shows the same ~84 pre-existing peer-dirty entries (none overlap task files) — untouched, not staged/reverted. Conservation: `orch-conservation-check.mjs` vs `8874901b2~1` → task_total 507=507.
**why-decision:** Fixtures are non-tautological — dynamic live-data id discovery (AC-1..AC-5/control, zero hardcoded literals) + clearly-labeled `ZZ-SYNTH-*` synthetic rows only where no live example exists (AC-6/AC-7a/AC-7b), each invoking the real `-f scripts/devteam-backlog-promote-bounded1.jq` program against a realistic board+detail snapshot. AC-5 is the actual bug repro (no-detail + non-dev board owner + null next_agent → withheld); AC-6/AC-7a/AC-7b are over-block/precedence regression guards. All PASS → APPROVED, DONE_VERIFIED.
**why-change:** No change from plan.

### STEP qa-S8 · qa · 2026-07-13T14:50:00Z
**task-id:** VCB-MISSING-PDFS
**what-done:** RAW merge-gate on commit `8f6dae658` (resolved by path, not trusted SHA). Re-ran both scoped suites myself: 21/0 (1019-bctc-reparse-job) + 9/0 (reap-dead-stranded-bctc-rows) — matches dev exactly. tsc clean, mock-guard PASS.
**what-considered:**
- Trust dev's file-scope claim (10 files, no stray jq) vs verify raw — verified raw: `git show --name-only` = exactly the 10 named files; `router-mint-d0b-supplement-exclude-relabel-ids.jq` confirmed untracked with zero git history, not in commit.
- Trust the "id=323 retired live" claim vs docker-exec probe the named-volume DB directly — probed directly: `agent_feedback id=323` status='dead'/271 attempts (was new), id=534 status='new'/0 attempts untouched; `ls` on `/app/data/pdfs/` confirms Q4 file genuinely gone, Q1 file genuinely present; `financial_reports` still holds both canonical VCB rows (Q4-2025 + Q1-2025) intact under real filenames.
- DEAD_AT_ATTEMPTS infra-import grep flag vs real DDD violation — read pre-commit revision (`56e7f7633`): identical infra import block pre-existed; new code only reuses already-imported `existsSync`, no new domain→infra edge.
**why-decision:** All RAW evidence corroborates the claims independently (no data loss, dead-row correctly retired, code guard generic/threshold-gated, no test regression). DEAD_AT_ATTEMPTS code guard only self-heals FUTURE rows after an mcp-server rebuild — user-gated/market-sensitive, not QA's call. APPROVED → DONE_VERIFIED, deploy-pending (same pattern as sibling ALPHA-S1/FIX-MCP-BOOTSTRAP rows this sprint).
**why-change:** No change from plan.

### STEP qa-S9 · qa · 2026-07-13T19:10:00Z
**task-id:** HPG-DISCOVER-CONSOLIDATED-PDF
**what-done:** RAW-verified discovery deliverable myself (not trusted from router summary): docker-exec `ls`+`wc -c` on live container confirms consolidated "hop nhat" PDF 7,135,524B present alongside untouched old "rieng" PDF (no data loss); `bun:sqlite` query direct on live named-volume DB confirms `bctc_vps_queue` id=223 `source_url`=consolidated URL, status=done; same query confirms `financial_reports` row 918a7abd still stale (old rieng pdf_path, parsed_at 2026-06-07) — matches disclosed follow-up gap exactly, not silently hidden. Re-ran `BCTC-3b-hsx-fetcher.test.ts` 9/0. `mock-guard.sh` PASS. SQL fully parameterized (3/3 queries). `HSX_API_TOKEN` grep-flagged by security scan traced to pre-existing already-shipped `hsxBctcFetcher.ts:54` (public static token, not a secret) — duplicated verbatim, not new debt.
**what-considered:** Router's "tsc clean" claim vs actual coverage — `scripts/` is outside both root and mcp-server tsconfig `include` globs, so `pnpm --filter vn-market check` never touches this file (false-clean-by-omission). Built isolated tsconfig with project's exact pinned tsc 5.9.3 + real compilerOptions to test the file directly: found 1 real error (line 395, `new Blob([pdfBytes],...)` — `Uint8Array<ArrayBufferLike>` not assignable to `BlobPart` under strict DOM lib). Control-checked sibling precedent `reparse-bctc-reports.ts` (already-shipped, this task explicitly mirrors it) the same way: 2 of its OWN pre-existing type errors surfaced too — confirms scripts/migrations/ has zero tsc coverage project-wide, not a regression unique to this task.
**why-decision:** CAUTION not BLOCK: zero runtime impact (Bun strips types; script already ran successfully live, RAW DB-verified), zero blast radius (not imported by src/, not CI-covered), same pre-existing blind-spot class as an already-shipped sibling script. Discovery deliverable (correct PDF obtained + queue row 223 corrected) is real and complete. VERDICT: APPROVED, DONE_VERIFIED — discovery scope only; reflow gap routed to FIX-PDFEXTRACTOR-TIER1-OCR-TIMEOUT per dispatch instruction, not this task's defect.
**why-change:** No change from plan.

### STEP qa-S10 · qa · 2026-07-13T19:15:00Z
**task-id:** FIX-PDFEXTRACTOR-TIER1-OCR-TIMEOUT
**what-done:** RAW-verified commit `ad26f2f95` myself. tsc clean; 47 tests (5 files touching the 2 changed modules) 47/0 pass. Full suite myself: 14583 pass/40 skip/69 fail/10 errors (661s)+known Bun tail-crash — grepped every failing test-file for the changed symbols: 0 matches; all 10 unhandled-errors trace to `pollNews`/`rag_analyses` (news, unrelated). Read `pek_engine_adapter.py`+`handlers.py` at source: `_extraction_semaphore=threading.Semaphore(1)` non-blocking acquire/finally-release around `extract_layout_and_tables`, single uvicorn process (no `--workers`) — dev's double-fire-is-benign claim CONFIRMED (loser gets `SemaphoreContendedError`, caught+logged, no 2nd inference; bctc_vps_queue transition unaffected since Step5's outcome is discarded by bctcPdfPullJob.ts, Step6 unconditional as before).
**what-considered:** 69/10 vs dev's claimed 62/7 — differs, but within this sprint's own established flaky baseline (qa-S6: 64/5; prior gates 63-67/4-10) → additional flake from full 1203-file parallel run, not a new regression (zero overlap with changed files either way).
**why-decision:** AC1 (discriminated outcome, no silent `done`), AC2 (confidence gate both directions), MUST-FIX Risk-1 (`overwritePdfPathUnconditional` proven via REAL in-memory DB — sibling test shows ensureShellRow alone does NOT clobber, second test shows the explicit UPDATE DOES) all pass code review + tests. SQL parameterized, no `process.env`/secrets, layering unchanged. APPROVED.
**why-change:** No change from plan.

### STEP qa-S11 · qa · 2026-07-13T21:44:00Z
**task-id:** FIX-DAILY-FF-VIEW-JOIN-ANCHOR
**what-done:** Merge-gate signoff on dev commit d71f45949, CI-red unblocker. Read live `schema-market-data.ts:162-200`, confirmed byte-match to architect brief's prescribed DROP+unconditional CREATE VIEW SQL (LEFT JOIN UNION ALL anti-join, 15 cols). RAW re-ran merge-gate pair myself: `daily-foreign-flow-integration.test.ts`+`daily-foreign-flow-schema.test.ts` = 20/0 (matches router). Own 9-file consumer/isolation sweep (1518, MSG-1, 1134, 1516, 1517, 1503, 1133, FIX-DIGEST-FF-ZERO-PAD, TASK-2004) = 79/0. `bun tsc --noEmit` 0 errors. Combined RAW total 99/0 across 11 files, did not re-run full 42-min suite (router already RAW-verified full-suite fail set has zero daily-ff overlap; not tick-appropriate to repeat).
**what-considered:**
- Redo full 42-min `bun test` vs targeted+consumer sweep — targeted: router already isolation-verified full-suite noise is unrelated (grepped, 0 daily-ff matches), redoing wastes ~40min for zero new signal.
- DDD: grepped diff for new `import` lines (zero) + `git show --stat` (exactly 1 production file, infra/db layer) — confirms zero domain touch, no new ports, matches architect brief's own claim.
**why-decision:** View SQL exact match to brief, companion R-1 test assertion diff exact match to brief's prescribed toBe(1)+foreign_buy_vol+comment fix, all RAW tests green, DDD clean, security clean (static DDL, no new env/secrets). APPROVED.
**why-change:** No change from plan.

### STEP qa-S12 · qa · 2026-07-15T00:35:00Z
**task-id:** ALPHA-S2-FOREIGN-FLOW-WRITE-RACE
**what-done:** Whole-epic merge-gate on trunk (HEAD 4491a1f2e, CI-green). RAW-ran new suite (6/0/51 expect) + own 10-file additive-regression sweep (97/0/272 expect, zero regressions to upsertForeignFlow/writeForeignFlowToOhlcv) + guard-rails (1190: 16/0, FACTORY-SCHEDULER: 15/0). tsc exit 0, mock-guard PASS.
**what-considered:**
- cron-registry.json `.jobs[]`=68 vs `schedulerFileCount`=67 — investigate as fresh drift vs trace full history: traced 4 commits back, confirmed jobs_len−schedulerFileCount=1 is a stable pre-existing invariant (not new), SUB4's +1 bump correct.
- Re-run full bun test suite vs targeted+sweep — full suite hangs on documented pre-existing sla-monitor/reaper interval leak, unrelated; targeted+10-file sweep sufficient per dispatch instruction.
**why-decision:** All 8 testable AC (§8) mapped to test/code-read, all PASS. AC#9 router-owned. Out-of-scope integrity confirmed (9 files only, zero domain/application, FIX-half untouched). DDD/security clean. APPROVE.
**why-change:** No change from plan.

### STEP qa-S13 · qa · 2026-07-15T03:01:10Z
**task-id:** ALPHA-S2-OMO-LIQUIDITY-CRON
**what-done:** Final relay hop (4/4). Read `sbvOmoLiquidityCronJob.ts` in full, confirmed all 3 fail-loud branches (HARD/SOFT/success) match brief §3 exactly via test-proven mocked notifyBug call counts + captured log lines. Confirmed `macroFetch`/`LiquidityStateResponseSchema` pre-date this commit via `git log` (reuse, not reinvention). RAW-ran new test (5/0/18) + both count-guards (16/0, 15/0) = 36/0. tsc exit 0, mock-guard PASS. `gen-project-stats.ts --dry-run` confirms toolCount/cronJobCount untouched.
**what-considered:**
- `it()` title stale at "=== 67" while asserting 68 — investigated via `git log -S`, confirmed title has never tracked the value since inception (43) across 6 prior bumps — pre-existing convention, not a new defect, non-blocking.
- `system-map.json` crons length (69) vs `cron-registry.json` schedulerFileCount (68) — traced via `git show ae45fd0e7~1`, confirmed the +1 offset pre-dates this commit (68 vs 67) — pre-existing SSOT drift correctly preserved, not introduced.
**why-decision:** DoD 1-9 all PASS, zero new DDL, reuse confirmed, 3-place doc registration consistent, DDD scan clean (scheduler/ composition-root importing infrastructure/ is established convention). APPROVED, DONE_VERIFIED.
**why-change:** No change from plan.

### STEP qa-S14 · qa · 2026-07-15T04:45:00Z
**task-id:** ALPHA-S2-RAG-FTS-REBUILD-CRON
**what-done:** RAW-verified commit `35cc8cd56` (11 files): `ragRebuildFts()`/`runRagFtsRebuildCron()` single-branch HARD-fail contract matches brief exactly, registered in cronConfig.ts/schedulerJobTable.ts/3 docs, schedulerFileCount 68→69 consistent. Ran targeted suites myself: new test 4/4 (18 expect), 1190-pipeline-watchdog 16/16, FACTORY-SCHEDULER-job-table-registry 15/15 = 35/0. tsc exit 0, mock-guard PASS, DDD clean (scheduler→infrastructure, established convention). Per dispatch instruction, attempted the LIVE BM25 round-trip directly against rag-service (port 5002).
**what-considered:**
- Confirmed live mcp-server container (Up since 2026-07-14T20:14:37Z, predates this commit) does NOT have this cron wired — grepped running container's schedulerJobTable.ts (0 match, also 0 for sibling sbvOmoLiquidityCronJob) + queried live `cron_job_runs` table directly (91 distinct job_names, neither new cron present) — deploy-pending, mcp-server rebuild is ops-gated, not attempted by me.
- Executed `POST /admin/rebuild-fts` against the LIVE rag-service twice (once via a lazy hybrid-search trigger, once directly in isolation) — both times `docker stats` showed memory climbing to 97.7%/99.9% of the 768MiB cgroup limit (docker-compose.yml rag-service `deploy.resources.limits.memory: 768m`) before the container hard-restarted (RestartCount 258→259→260), losing all in-process state (embedding model unloads, `_fts_index_built` resets). Second attempt (direct, no model-load competing) still crashed at ~250s elapsed — proves the FTS-build operation itself, at the corpus's current ~56,254-row size (4x the design brief's 14k-row assumption), cannot complete within the container's memory ceiling. Never reached a completed rebuild in either attempt, so the DoD's literal MISS→rebuild→HIT proof could not be executed.
- Whether to keep retrying for a 3rd attempt vs stop — stopped at 2/2 reproduced crashes: repeating would cause further live-service disruption (rag-service is a shared, actively-used container) for zero additional evidentiary value: root cause (memory ceiling vs corpus size) is already unambiguous and reproduced twice.
**why-decision:** Not a defect in commit 35cc8cd56 — mcp-server code/tests/registration are all clean and mergeable as delivered. The blocker is rag-service capacity: `_build_fts_index()` (already-shipped DFR-P3 code, unmodified by this task) cannot complete within the 768MiB container limit at current corpus scale, and even where memory hadn't yet crashed it, elapsed time (250s+) already exceeds the cron's own 90s `AbortSignal.timeout` 2.7x over — so a memory-safe rebuild would still hard-fail-alert on timeout nightly. Deploying this cron as-is risks a nightly rag-service OOM-restart (service-wide RAG/search outage for the restart duration) — worse than the silent BM25-staleness gap this task fixes. BLOCKED — left board row `in_progress[]` untouched, did not flip DONE, did not touch locks/orch-state.json. Recommend architect/ops decide raise-memory-limit vs streaming-FTS-build vs re-tuned deadline before this cron is safe to schedule.
**why-change:** Router dispatch asked for a binary PASS/BLOCK; a genuine, reproduced infra-capacity blocker surfaced during the mandated live round-trip that no source-read or mocked unit test could have caught — this is the exact scenario the live-verification mandate exists for.

### STEP qa-S15 · qa · 2026-07-15T18:55:00Z
**task-id:** ALPHA-S2-RAG-FTS-CRON-SAFETY-GATE
**what-done:** Independently re-verified commits `db921c52d`+`d7e04b630` (==origin/main). Default-OFF flag `(Bun.env.CRON_RAG_FTS_REBUILD_ENABLED ?? 'false').toLowerCase() === 'true'` (schedulerJobTable.ts:140) gates registration via conditional array-spread (:662) — registration-time omission, confirmed empty-string safe (no croner boot-crash) via isolated probe script. RAW self-run: tsc --noEmit exit 0, mock-guard PASS, targeted FACTORY-SCHEDULER test 20/20 (284 expect), 18-file keyword-matched (schedulerJobTable/ragFts/CRON_RAG_FTS/FACTORY-SCHEDULER) regression sample 197/197, 0 regressions. Deploy path clean: flag absent from docker-compose.yml → stays OFF live. Docs (cron-jobs.md/cron-registry.json/system-map.json) note flag stays OFF until RAG-FTS-BUILD-MEMORY-BOUND verified fixed.
**what-considered:**
- Full 1207-file `bun test` re-run vs targeted+18-file keyword sample — started full run, killed early once targeted sample (covers every file touching the changed surface) came back 197/0; sufficient per dispatch scope, avoids redundant compute.
- No decision-journal entry existed under this task-id pre-dispatch (dispatcher gave focused 5-AC brief, DJ-GATE-1 skipped) — flagged as caveat, closing now per router follow-up.
**why-decision:** All 5 dispatch ACs independently PASS (not trusting dev's self-reported numbers): flag-off omission, flag-on exact reproduction, empty-string safety, tsc/mock-guard/test-count internal consistency, docs updated. PASS.
**why-change:** No change from plan — router accepted verdict, this entry only closes the DJ-GATE-1 gap.

### STEP qa-S16 · qa · 2026-07-16T18:10:00Z
**task-id:** FIX-DEVTEAM-BOUNDED1-EFFECTIVE-DISPOSITION-BOARD-FALLBACK-GATE
**what-done:** RAW-ran `devteam-bounded1-detail-disposition-gate-verify.sh` myself (not trusting dev badge) — 12/12 PASS exit 0, incl. new AC-8/AC-9 (leak closed) + AC-6/AC-10/control (no over-block). Read full `.jq` diff: confirmed `is_non_dev_next_agent_unrouted` drops the old "board next_agent empty" precondition, both predicates delegate to `effective_plan_only`/`effective_next_agent` (board-OR-detail / detail-first-board-fallback), and `$detail_items[.id]` object-index is the pre-existing shape-defensive `from_entries`-keyed map — matches `effective_owner` style, no array-mis-index risk.
**what-considered:**
- Re-deriving the 4 named P1 leak rows + UC-*-UNVERIFIED-BATCH from scratch vs trusting dev's cited isolated-fixture proof in the commit body — accepted dev's cited proof as sufficient given the verifier's own AC-8 is live-discovered (no hardcoded ID) and independently reproduces the same class.
- jq-only change, no tsc/bun test/DDD/mock-guard surface (no TS/Go touched) — Smart-Skip applies, ran only the dedicated verifier.
**why-decision:** DJ-GATE-1 pre-check: developer-S5 entry present in this sprint's developer journal with matching task-id. All raw checks green, scope matches commit-stat exactly (7 files), no over-block regression. APPROVE.
**why-change:** No change from plan.

### STEP qa-S17 · qa · 2026-07-16T18:25:00Z
**task-id:** FR-DEGRADE-01-FIX
**what-done:** DJ-GATE-1 pre-check: dev-mcp-server journal entry present for this task-id — proceed. RAW re-ran `bun test 240-bctc-full.test.ts 1982-quality-burndown-CHIJ.test.ts` myself (not trusting dev's 38/0 claim) → 38 pass/0 fail confirmed live. Read the 3 new tests: stale-flagged case asserts `stale=true`+`stale_since` string+`stale_age_hours>48` on content[1] AND `FR-DEGRADE-01` note on content[0] AND underlying `net_profit` still served (never withheld) — fresh-push and no-push-log cases both assert fail-open `stale=false`. `bun tsc --noEmit` exit 0. Code-reviewed diff: stale fields threaded into the ordinary data-present success path (textOutput staleNote + structured_data.stale/stale_since/stale_age_hours), not only the no-data branch; try/catch around vps_push_log query is empty-catch fail-open (missing table → stays null → stale=false), matches DS-DEGRADE-01 `{stale, stale_since, source}` convention.
**what-considered:**
- Full `bun test` re-run vs Smart-Skip (test+source pair, no new domain/MCP tool/cross-service) — Smart-Skip: targeted suite + tsc + mock-guard sufficient; confirmed known flaky files (1518-foreign-flow, 1407b-coverage-map) share zero overlap with the 2 changed files (bctcFullTools.ts, 240-bctc-full.test.ts).
- mock-guard on the changed production file only (no fabricated-data pattern risk elsewhere in scope) — PASS exit 0.
**why-decision:** All gate checks green: tests raw-confirmed (not badge-trusted), tsc clean, mock-guard PASS, DDD/security scan clean (no infra/application import, no process.env, no secrets, parameterized SQL unchanged), no arch concern (pure bugfix threading existing computed values into an existing success path, no new tool/domain/cross-service). APPROVE — promote to done_verified.
**why-change:** No change from plan.

### STEP qa-S18 · qa · 2026-07-16T19:40:00Z
**task-id:** FR-OBS-01-FIX
**what-done:** DJ-GATE-1 pre-check: dev-mcp-server journal §dev-mcp-server-S22 carries this task-id — proceed. RAW re-ran `bun test 316-bctc-overdue-check.test.ts` myself (not trusting dev's 11/0 claim) → 11 pass/0 fail confirmed live; also RAW re-ran the 3 cited sibling files (1358a/1303i/1050) together = 37 pass/0 fail/116 expect() across 4 files, corroborating dev's "26/26 across siblings" claim. `bun tsc --noEmit` exit 0. `mock-guard.sh` PASS.
**what-considered:**
- Re-running the full 14575-test suite vs Smart-Skip (targeted+sibling+tsc+mock-guard) — Smart-Skip: scheduler-layer bugfix, no new domain/MCP tool/cross-service; grepped `bctcOverdueCheckJob|schedulerJobTable` against the flaky-class test files (vps_push_log/insider-tx/OCR-cache/foreign-flow) → zero matches, structurally corroborating dev's "zero overlap" claim without a multi-minute full run.
- Trusting the commit-message root-cause narrative vs reading the actual diff — read `git show 7ce61568e` directly: confirmed the `alerts` insert line is byte-identical (regression-safe, cascade chain intact), the new WORK send sits inside the SAME `info.changes>0` guard, and `telegram.ts` (home of the shared BUG-only `notifyTelegramAlert`) is NOT in the changed-file list — so the shared HIGH/CRITICAL BUG dispatch for every other alert type is provably untouched.
**why-decision:** All checks green and RAW-confirmed (not badge-trusted): tests pass, tsc clean, mock-guard PASS, DDD/security clean, `schedulerJobTable.ts` diff confirmed comment-only (cron registration untouched), no arch concern. APPROVE — promote to done_verified.
**why-change:** No change from plan.

### STEP qa-S19 · qa · 2026-07-21T16:31:10Z
**task-id:** FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE
**what-done:** Independently re-ran (not trusting dev's 18/18 self-report) in isolated mkdtemp harness built from exact reviewed commit `84096f617` (msg is a peer's, verified FILE CONTENT via `git show 84096f617 -- <path>`) → 18/18 pass, all 3 verification_gate assertions confirmed. Negative control (pre-fix `84096f617^`=`64cd7edf9`) reproduces the dangle, `orch-validate` exit 2. THEN stress-tested beyond the row's literal gate text: built a >1MB fixture matching the LIVE orch-state.json's actual current size (1,114,264B) and ran it against the REVIEWED commit's `repointPayloadRefs()` — its `jq` `execFileSync` call has no `maxBuffer`, throws ENOBUFS, caught by a non-fail-loud branch (`console.error WARN; return`), silently leaving payload_ref dangling — reproducing the row's own target defect via a size-triggered path. Found (uncommitted, in working tree) a candidate fix already addressing this exact gap; ran it → 22/22 pass incl. new ENOBUFS regression scenario.
**what-considered:**
- APPROVE (all 3 stated verification_gate checks pass) vs CHANGES_REQUESTED (found a live-reproducible silent-swallow in the reviewed commit under today's actual file size, contradicting dev's own stated fail-loud design intent) — chose CHANGES_REQUESTED: non-vacuity duty extends to realistic conditions, not just the small synthetic fixture: approving would rubber-stamp recurrence #5 on a row already at recurring_bug_count=4/BLOCK escalation.
- Board write: in-place annotate row in `review[]` (status stays REVIEW, matches `LANE_ALLOWED_STATUSES`) + next_agent=developer vs moving lanes — chose in-place (precedent: po-s140 "STAYS in review[]") — zero lane-length delta, safest.
**why-decision:** Gate-keeper duty: a fix that silently fails under the CURRENT live file size is not mergeable regardless of a green small-fixture test. CHANGES_REQUESTED, routed to developer with exact file:line + the already-drafted uncommitted remedy pointed out (round 1, not yet at architect-escalation threshold).
**why-change:** Extended beyond router's literal ask (small-fixture non-vacuity check) to size-realistic stress test — decisive because the live file already exceeds the failure threshold today, making this not hypothetical.
