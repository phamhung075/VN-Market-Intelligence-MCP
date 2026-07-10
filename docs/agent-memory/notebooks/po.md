# PO Notebook

_Last: 2026-07-10T06:50Z_

## Tick 2026-07-10T06:50Z — dev-team Step 4.1 re-entry → BATCH([FIX×3 + PLAN-ONLY×1], backlog-paced) + BCTC-bank ops-row
Re-entry after this tick's main SPIKE-CI-PERFILE-ISOLATION-FLAKE landed (c3c7966e1 doc, a2c095220 mem). **Bridge REACHABLE** this tick (`scripts/agents-flow/mcp-call.sh` → gateway OK; native `mcp__gateway__call_tool` still absent). `.signal_queue.rows`=[] (stale 07-09T18:58Z) — the ci_red was already drained + actioned into the SPIKE. Two triage inputs: (1) SPIKE findings handoff, (2) new Telegram reports 3542 + 3543.

### (1) SPIKE-CI-PERFILE-ISOLATION-FLAKE findings → 3 scoped FIX rows + 1 PLAN-ONLY (the SPIKE's OWN recommendation: 3 separate scoped items, explicitly NOT one generic "de-flake" ticket)
This is the convergent fruit of a COMPLETED root-cause SPIKE — deferring it = churn-without-convergence (★07-04). Not new discovery work, so the clogged-exit brake (REVIEW≈18) does NOT apply to *filing* it; priority tags let the BOUNDED-1 loop pace promotion vs the clogged exit. All file/line refs RAW-verified this tick:
- `projectRoot.ts:16` `execSync("git rev-parse --show-toplevel")` memoized on `_root` — confirmed blocking child-process on first call.
- `agentBootstrap.ts:358` `const toolNameMap = buildToolNameMap()` — confirmed eager module-level singleton (probes ~107 registrars at import).
- all 8 sweep test files exist (106,1228,1255,137,1383,1501,278,311).
- `retriever.ts` lives under `rag/_deprecated/` → item-3 is PURE test-hygiene (no live prod code touched).
- Dedup: NO board row covers item-1 (FU-OCR-BOOT-LOOP-SEQUENTIAL = a different bootstrap concern; DTS-ST4/AF-SEMBLE unrelated). Item-2 parents FIX-CYCLEJOB-1294 (REVIEW). Item-3 ≠ DEFLAKE-1187 (different file).

**BATCH (priority-tagged BACKLOG; loop promotes by priority):**
- **F1 FIX-MCP-BOOTSTRAP-BLOCKING-EXECSYNC-PROJECTROOT (HIGH)** — real production boot-path bug, not just a test flake. Replace blocking `execSync` in `getProjectRoot()` with an `import.meta.dir` walk-up memoize (no subprocess) OR make `registerAgentMemoryTools`' root resolution lazy (at tool-invocation, off the registration-probe path). On `server.ts:40` cold-start path + it is the CI amplifier. type FIX, zone `apps/mcp-server/`, size S. files: `apps/mcp-server/src/infrastructure/projectRoot.ts`, `apps/mcp-server/src/interface/mcp/bootstrap/agentBootstrap.ts`. AC: cold-start non-regression guard + all ~107 tool names still resolve + 1299b + the ~30 agentBootstrap-importer tests green under CI. baseline_pass: green on quiet machine; flakes only under CI CPU-oversubscription (SPIKE-confirmed).
- **F2 FIX-CYCLEJOB-1294-FOLLOWUP-SWEEP-UNMOCKED-LIVE-FETCH (MED, depends_on FIX-CYCLEJOB-1294 REVIEW)** — inject `macroFetchFn`/`vnstockSyncFn` no-op stubs into `106-intelligence-cycle.test.ts` (mirror `1294-macro-spam-fix.test.ts`), then sweep 1228,1255,137,1383,1501,278,311. SPIKE confirmed 106 fires live yahooFinance/SBV I/O. type FIX, zone `apps/mcp-server/`, size S. files: the 8 `src/__tests__/*` files. AC: zero live network in those tests. Sequence AFTER 1294 merges to reuse the exact pattern.
- **F3 FIX-RAG-TEMPORAL-DECAY-TEST-JITTER (LOW, trivial)** — `135-rag-temporal-decay.test.ts` "brand-new result" zero-tolerance boundary: freeze `now` into `applyTemporalDecay` for that test OR relax `toBeLessThanOrEqual(0.6)`→`0.6001`. type FIX, zone `apps/mcp-server/`, size S. file: `apps/mcp-server/src/__tests__/135-rag-temporal-decay.test.ts`.
- **P1 CI-PERFILE-STRUCTURAL-MITIGATION (PLAN-ONLY, LOW)** — (a) `ci-per-file-isolation.sh` captures per-file `rc` but never checks it → a killed/crashed 0-parsed-fail process is invisible to the gate (fail-loud on `rc`); (b) parallelism=16 on 2–4 vCPU `ubuntu-latest` = 4–8× oversubscription (decision: lower to vCPU count vs CI wall-time). Backlog PLAN-ONLY, not dispatched.

### (2) Telegram 3542 (ACB 2025-Q4) + 3543 (BID 2025-Q4) → NOT a dev-team code BATCH this cycle → ONE tracked OPS backlog row (operational-first, escalate-on-durability)
Both BANK (TCTD) tickers, IDENTICAL signature (`bctc_table_rows=0 AND bctc_md_tables=0`, "B02-TCTD parse failure or extraction pipeline stall"), 37 min apart (06:08:48Z, 06:45:42Z) → a 2025-Q4 bank-form PATTERN, NOT a one-off. BUT root cause is unconfirmed (operational enrich stall vs bank-form-classifier vs enrich_failed-row stranding) and the report's OWN first-line action is operational ("trigger bctcReparseJob"). Churn guard: do NOT mint a code sprint on a hypothesis. Proportionate = operational reparse first (bctc-analyst/ops track; HPG-REPARSE-POST-REBUILD precedent), then escalate on evidence. Candidate code RC to verify against: **FIX-BCTC-BANK-FORM-CLASSIFIER-BOLD-STRIP (TODO)** — 0-rows ≠ the DONE scalar-mapping garbage class, so likely distinct/upstream.
- **OPS-BCTC-BANK-2025Q4-ENRICH-0ROW-REPARSE** — owner bctc-analyst/ops, ZERO new code as step-1. Reparse ACB + BID 2025-Q4 enrich_failed queue rows via bctcReparseJob; links reports 3542+3543 (stops status=new resurfacing per FIX-TELEGRAM-REPORT-ACK-STATUS-STOP-RESURFACE). **ESCALATION TRIGGER:** if either ticker still yields 0 `bctc_table_rows` AFTER a bctcReparseJob pass → mint a code SPIKE (bank B02-TCTD 2025-Q4 0-row RC; also probe other 2025-Q4 banks + whether enrich_failed rows are auto-retried at all). zone `apps/pdf-extractor/` + operational.

### Router asks (I hold no lock — router holds task:po-triage-20260710; bridge used read-only, no self-commit attempted)
- Commit `docs/agent-memory/notebooks/po.md` (explicit path, commit-mutex).
- File to `.task_board.backlog[]`: F1(HIGH), F2(MED, depends FIX-CYCLEJOB-1294), F3(LOW), P1(PLAN-ONLY), + OPS-BCTC-BANK-2025Q4-ENRICH-0ROW-REPARSE (links reports 3542+3543, escalation-trigger above).
- No `.head` / in_progress row touched. git branch = main only (no CLEAN). TNB c107 handoff unchanged (2d old, mapped). No board row has next_agent==po.

---
_Older ticks (07-10 06:07Z SPIKE mint, 05:37Z/05:07Z NOTHING, 03:07Z REVIEW-clog; 07-09 and earlier) → git history + `docs/agent-memory/notebooks/archive/po-2026-07-08.md`._

## Standing method (survives rotation)
- RAW-verify every signal/relayed claim from source (git/gh/docker/curl/jq/files/bridge), never payload-trust — trust-verification-is-system-job. This tick: bridge reachable, all SPIKE line-refs + both report IDs verified live.
- Churn-not-product (★07-04): dedup board-wide before minting; recurring symptom on identical inputs → NO priority flip-flop, NO dup mint. Recurring bug 2+ → escalate to ROOT CAUSE, not another symptom patch. But a COMPLETED root-cause SPIKE's scoped recommendations ARE convergence — file them (not doing so is the opposite pathology).
- Operational-first for data-coverage/extraction gaps: unconfirmed-RC single-signature failures → reparse via the operational track first; mint code work only on post-reparse evidence. Link the report → tracked row so status=new stops resurfacing.
- WIP=0 at ready/in_progress + deep REVIEW = clogged EXIT, not free capacity → don't force-dispatch discovery work; file backlog + let the loop pace by priority. Convergence bottleneck is QA sign-off, not intake.
- Gateway-blind/-partial default this session: prefer the `scripts/agents-flow/mcp-call.sh` bridge for reads; if no self-commit path → write file + flag router to commit. Never leave uncommitted work silently.
- Never touch `.head` or any in_progress row owned by a live worker. PO ≠ prod code. BATCH/disposition to router; PO does not spawn.
- ci_red flake vs regression: job flaps red↔green across zero-code commits (esp. rotating test files) = a FLAKE; `ci_green_on_subsequent_push` gate is unreliable → mint a root-cause SPIKE, not a per-SHA/per-test deflake. (This tick: acting on that SPIKE's output.)
