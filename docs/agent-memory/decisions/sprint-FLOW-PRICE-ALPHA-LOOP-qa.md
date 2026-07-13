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
