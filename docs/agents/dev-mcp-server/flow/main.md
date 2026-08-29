<!-- size-justification: 170L — zone-specialist flow overlay; G12 DoD Gate (two-gate evidence table, streak rule, tool-suite probe commands), RUN-SOLO/explicit-add/INV-GATEWAY-1 commit discipline, ESLint fence phase note, scheduler/dashboard circular-dep protocol pointers, and implementation record template are all zone-specific mandatory content with no factoring seam; +2L for DJ-GATE-1 pointer (2026-06-07). NOTE: this declared count was already massively stale pre-edit (file measured 511L before this edit) — not re-derived here, out of this task's scope. FIX-DEVFLOW-SELFCONTAINED-ZONE-FLOWS-SUCCESS-PATH-NO-HEAD-SYNC 2026-08-23 (agent-father): +9L (511→520 measured) — this file delegates to microservice-main.md for BASE steps only, then re-implements its own terminal block, so it never reaches that shared file's SUCCESS-path `.head` idle-reset (FIX-DEVFLOW-MICROSERVICE-SUCCESS-PATH-NO-HEAD-SYNC); added the same guarded idiom here on its own success path, before RETURN. FIX-MONTHLYSIGNALQUALITYAUDITJOB-MISSED-JULY-RECOVER-GUARD 2026-08-29 (dev-mcp-server): +32L (520→552 measured) — new CANONICAL block in Script Persistence for the missed-month recover guard + the one-shot historical backfill script (scripts/migrations/backfill-monthly-signal-quality-audit.ts), incl. live execution result; count re-derived at edit time (this file's declared 170L is a historical marker, not the measured count). -->
# dev-mcp-server — Main Flow

**Zone:** `apps/mcp-server/`
**Specialist for:** MCP tools, schedulers/crons, market data orchestration (gateway service)
**Language:** TypeScript / Bun

**Tools:** `docs/agents/tools/package/developer.md`

## Input
`docs/handoffs/TASK_NNN.md` with `[Architect] Brownfield Findings`

## Output
Code + tests committed | `[Developer] Implementation Record` in handoff | QA notified

---

> Error boundary → `docs/protocols/fail-loud-protocol.md` § "Error Boundary — Blocked Flow = EXIT" — dev-pipeline SSOT (repointed 2026-08-07, FIX-DEVFLOW-MICROSERVICE-MAIN-NO-ERROR-BOUNDARY AC-3: `.claude/skills/cowork-error-boundary/SKILL.md` prescribes gateway calls this specialist holds no grant for and omits the `.head` idle-reset).

---

## Shared Flow

The base implementation steps (Step 0a project-root, Step 0b notebook, pre-code checklist, TDD cycle, DDD layer rules) are defined in the shared flow:

→ Run shared flow: `docs/agents/developer/flow/microservice-main.md`

Substitutions when reading the shared flow:
- `<service>` = `mcp-server`
- `<agent-id>` = `dev-mcp-server`
- zone restriction enforced: only `apps/mcp-server/` files
- test command: `cd apps/mcp-server && bun test`
- type check: `cd apps/mcp-server && bun tsc --noEmit`

For spike tasks (`mode: "spike"`), use `docs/agents/developer/flow/feature-spike.md` instead.

Service docs: `docs/architecture/microservice/mcp-server/`. Owns `market.db`.

Charter (service-specific deltas): `docs/architecture-briefs/2026-05-22-refactor/scale/mcp-server-charter.md`

---

## ⚠️ RUN-SOLO Discipline (mandatory — read before every commit)

This zone is HIGHEST-RISK / RUN-SOLO. Before staging any files:

1. **Confirm no other scale terminal is active** — SOLO constraint is non-negotiable (charter §Scheduling).
2. **Explicit-file staging ONLY.** `git add <exact-path>` per file. NEVER `git add -A`, `git add .`, `git add -am`, or any wildcard flag. This zone has a history of 26-file over-staging incidents.
3. **Pre-commit diff review.** Run `git diff --cached --name-only` and verify ONLY the intended files appear before committing.
4. **Commit directly** — INV-GATEWAY-1: commit-mutex/task_claim/task_release MCP calls are the dispatcher session's sole responsibility; this specialist commits directly (explicit paths). No commit-mutex skill call from here. Stage (explicit paths only) → verify (`git diff --cached --name-only`) → commit.
5. **No --force, --no-verify, --no-gpg-sign.** All work on `main`. No branches.

---

## G12 DoD Gate (two-gate — mandatory — blocking from Day 0)

**Do not mark any task DONE / do not write the RETURN block until BOTH gates pass:**

| Gate | Command | Must show |
|------|---------|-----------|
| Bun test suite | `cd apps/mcp-server && bun test` | 0 failures — all existing tests PASS |
| Tool-suite integrity | See probe commands below | Tool count matches pre-task baseline; server starts; no import error |

**Tool-suite integrity probe (run after every barrel wave / any domain change):**

```bash
# Gate 2a: TypeScript check
cd apps/mcp-server && bun tsc --noEmit

# Gate 2b: Server startup (no import errors)
# Port 3000 is usually occupied by the live Docker container on a dev host —
# EADDRINUSE there proves nothing about YOUR build. Use PORT=<alt> to boot
# your locally-built code in isolation (2026-08-08, FIX-MCP-SSE-SESSION-
# MANAGER-PERCONN-LEAK-NO-REAPER):
cd apps/mcp-server && PORT=3099 bun run src/index.ts &
sleep 5
curl -s http://localhost:3099/health
kill %1

# Gate 2c: Tool count probe — count must match pre-task baseline (no tool silenced)
# Canonical: counts server.tool() + server.registerTool() unique names, .ts files only (no .bak)
bun scripts/gen-project-stats.ts --dry-run | grep '"toolCount"'

# Gate 2d: Scheduler count probe — total registered cron jobs (table-driven +
# bespoke + summaryJobs). Canonical, same generator as Gate 2c (FIX-PROJECT-
# STATS-CRONJOBCOUNT-SSOT-DRIFT, 2026-07-22): a raw `grep cron.schedule` count
# is STALE and WRONG post-FACTORY-SCHEDULER-job-table-registry (61 table-driven
# jobs collapse to a single generic-loop `scheduleCron(j.cron,...)` call site —
# this is exactly what silently drifted docs/data/project-stats.json's
# cronJobCount to 2 for weeks). Gate-2d baseline = 88 as of 2026-07-22
# (61 buildJobTable entries + 22 registerBespokeJobs call sites + 5 summaryJobs.ts).
bun scripts/gen-project-stats.ts --dry-run | grep '"cronJobCount"'
```

Both gates must exit 0 before the task is DONE.

If `bun test` exits non-zero: the task is NOT done. Fix the failing test before re-running.

If Gate 2 (tool-suite) fails: the task is NOT done even if `bun test` is green. A barrel edit that silences a tool or breaks server startup is a regression — rollback to the pre-wave tag and rethink.

**Evidence requirement:** paste the `bun test` summary line AND the Gate 2 probe outputs (tsc exit, server health response, tool count, scheduler count) into the task handoff doc before writing the RETURN block. No evidence = task is NOT accepted.

**Dashboard circular-dep check (after any barrel wave):**
```bash
curl -s http://localhost:3000/api/bctc-inspect | head -5
curl -s http://localhost:3000/dashboards/news-fetch/ | head -5
```
If either returns 500 or empty, the barrel change broke a dashboard route import. Rollback to pre-wave tag.

---

## G12 Streak Rule (3-task streak — blocking)

The three G12 streak tasks for Phase 1 are **P1-B**, **P1-C**, and **P1-D** (see `docs/architecture-briefs/2026-05-22-refactor/scale/mcp-server-phase-1-task-plan.md` §G12 Streak Tasks).

Each must carry both gate evidence pasted into its handoff before it is marked DONE. The streak is broken if ANY task in the sequence ships without evidence. If the streak is broken: reopen the task, re-run both gates, re-paste evidence before re-marking DONE.

Reference: `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` §G12; `docs/architecture-briefs/2026-05-22-refactor/scale/mcp-server-phase-1-task-plan.md` §G12 Streak Tasks

---

## ESLint / Architecture Fence (G4 — Phase 2 concern)

**Phase 1 does NOT require ESLint fence enforcement.** G4 is STILL-UNMET after Phase 1.

**Phase 2 target:** `eslint-plugin-boundaries` (TypeScript/Bun equivalent — NOT `depguard` which is Go-only) that blocks cross-layer imports. Config lives at `apps/mcp-server/eslint.config.mjs`. Verify existing config before creating a new one.

**Do not implement the ESLint fence during Phase 1 tasks** — any fence config change in Phase 1 is out of scope and will be rejected by QA.

Reference: `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` §G4; `docs/architecture-briefs/2026-05-22-refactor/scale/mcp-server-charter.md`

---

**Documentation review** (after code passes, before QA):
→ Run flow: `docs/agents/developer/flow/doc-review.md` with `SERVICE=mcp-server`

**Append to handoff** (before QA):
```markdown
## [Developer] Implementation Record
- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:** [path:lines — description]
- **Tests written:** [path — assertion count, GREEN]
- **Git commits:** [hash message]
- **Type check:** clean (bun tsc --noEmit)
- **bun test:** N pass / 0 fail
- **Tool count:** [N tools — matches pre-task baseline]
- **Scheduler count:** [N cron.schedule entries — matches pre-task baseline (baseline 76 as of FIX-PROJECT-STATS-GENERATED)]
- **Docs updated:** [docs/architecture/microservice/mcp-server/... — what changed] | NONE
- **Graphify:** updated | skipped (no docs impacted)
```

**Notebook write** (before QA) → skill: `.claude/skills/notebook-write/SKILL.md` (replace `<agent-id>` with `dev-mcp-server`; APPEND class — AC-3 settled-write + AC-5 wc gate apply)

**Zone health observation (mandatory — 1 line):**
```
Zone health: <e.g. "bun test 0 fail, 162 tools intact, scheduler 76 cron.schedule (gen-project-stats verified)"> | HEALTHY
```

**Commit notebook** (direct — INV-GATEWAY-1):
```bash
# INV-GATEWAY-1: commit-mutex/task_claim/task_release MCP calls are the dispatcher session's sole
# responsibility; inner specialist agents commit directly (explicit paths), no mutex skill call.
# Explicit-file staging ONLY — never -A or wildcard
git add docs/agent-memory/notebooks/dev-mcp-server.md
git commit -m "chore(memory/dev-mcp-server): notebook YYYY-MM-DD" -- docs/agent-memory/notebooks/dev-mcp-server.md
```

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`

**Skills available to this zone (lazy-load — load only when the task requires it):**
- MCP server design and implementation → skill: `.claude/skills/mcp-builder/SKILL.md` (trigger: task requires building or modifying an MCP server, adding new tools, or following MCP protocol spec)

**DJ-GATE-1** (mandatory before REVIEW flip): run skill `.claude/skills/decision-journal/SKILL.md` § Write Entry [task_id: <TASK_ID>] — gate rule: `docs/protocols/agent-chaining-protocol.md` § Journal-before-DONE Gate.

## Script Persistence — Canonical Pointers

**CANONICAL: Orch-state Zod validator CLI (SSOT-INTEGRITY-PERIMETER SSOT-W1-ZOD-VALIDATOR-CLI)**
```bash
bun scripts/orch-validate.mjs                          # validate live docs/data/orch/orch-state.json
bun scripts/orch-validate.mjs path/to/candidate.json   # validate any candidate before rename
bun scripts/test-orch-validate-ac.mjs                  # run AC-1..AC-4 acceptance fixture
```
Exit 0 = Stage 0 + Stage 1 pass. Exit 1 = dup-key. Exit 2 = schema/ref fail. Exit 3 = file-not-found.
Schema: apps/mcp-server/src/infrastructure/orchStateSchema.ts (SSOT — do NOT duplicate).

**CANONICAL: Generic stranded seed-bar repair (FIX-OHLCV-STRANDED-ROWS-REPAIR-P1)**
purgeStrandedSeedRows() in `apps/mcp-server/src/scheduler/market-data/allzeroOhlcvBackfill.ts`.
Runs automatically at container startup (startScheduler.ts). Deletes rows with
`volume=0 AND open=high=low=close` — generic, no date/ticker literals, idempotent.
No manual script needed: ops rebuild+restart triggers the repair against the live named-volume DB.

**CANONICAL: OHLCV synthetic seed-candle repair (FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0 SUBTASK-6)**
```bash
# Dry-run (default — prints count + sample, no writes):
bun scripts/migrations/repair-ohlcv-seed-candle-2026-06-16.ts --dry-run

# Apply (performs DELETE of synthetic seed rows for 2026-06-16):
docker cp scripts/migrations/repair-ohlcv-seed-candle-2026-06-16.ts \
  vn-market-intelligence-mcp-mcp-server-1:/app/repair-seed-candle.ts
docker exec vn-market-intelligence-mcp-mcp-server-1 \
  bun /app/repair-seed-candle.ts --dry-run
docker exec vn-market-intelligence-mcp-mcp-server-1 \
  bun /app/repair-seed-candle.ts --apply
```
Deletes WHERE date='2026-06-16' AND volume=0 AND open=high AND high=low AND low=close AND data_env IS NULL.
Idempotent — second run deletes 0 rows, exits 0. DB path from Bun.env["DB_PATH"] (named volume inside docker).

**CANONICAL: BCTC finalize re-ingest runbook (FIX-BCTC-BANK-SUMMARY-MAPPING W5, AC-10)**
```bash
# Verify only (default — read-only, no writes, no MCP call):
bun scripts/migrations/reingest-bctc-report.ts --report-id <report_id>

# Apply — calls the LIVE finalize_bctc_refine MCP tool (reuses production code,
# zero duplicated logic) ONLY when >=1 DONE bctc_refined_units window with
# non-empty markdown exists for the report (refuses otherwise — exit 3 — to
# avoid wiping bctc_table_rows with nothing to replace them):
bun scripts/migrations/reingest-bctc-report.ts --report-id <report_id> --apply

# Against the live named-volume DB (docker exec — recommended, matches the
# repair-ohlcv-seed-candle precedent):
docker cp scripts/migrations/reingest-bctc-report.ts \
  vn-market-intelligence-mcp-mcp-server-1:/app/reingest-bctc-report.ts
docker exec vn-market-intelligence-mcp-mcp-server-1 \
  bun /app/reingest-bctc-report.ts --report-id <report_id>
```
Idempotent: already-plausible or confirm_status='CONFIRMED' rows are a no-op (exit 0).
Zero-DONE-window rows are refused (exit 3) rather than silently wiped — a fresh
agentic-refine transcription pass (get_bctc_pending_refine with report_id bypasses
queue-eligibility filters by design, RF-3) is the required manual step first.
Default target/documented example: CTG 2026-Q1, report_id=96e36139-5dac-414d-8e4d-20a4725890d1
(frozen total_assets=0 — architect brief 2026-07-01-FIX-BCTC-BANK-SUMMARY-MAPPING §2).

**CANONICAL: BCTC orphaned-row carry-forward (TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-CTG-CARRY-FORWARD,
Track 1 of FIX-BCTC-BANK-SUMMARY-MAPPING's W5 replacement, architect brief
2026-07-10-FIX-BCTC-BANK-SCALAR-MAPPING §2.5)**
```bash
# Verify only (default — read-only, no writes):
bun scripts/migrations/carry-forward-bctc-orphaned-rows.ts
bun scripts/migrations/carry-forward-bctc-orphaned-rows.ts --source <id> --target <id>

# Apply — INSERT...SELECT copies bctc_table_rows from an orphaned report_id onto
# the current one (report_id has no duplicate-(action_code,sort_key) reuse — a
# re-parse hard-deletes the old row and orphans any already-refined table rows
# under it), then reuses the LIVE backfill_bctc_scalars aggregator (zero
# duplicated logic) to reflow total_assets/net_revenue/etc.:
bun scripts/migrations/carry-forward-bctc-orphaned-rows.ts --apply

# Against the live named-volume DB (docker exec — matches reingest-bctc-report.ts):
docker cp scripts/migrations/carry-forward-bctc-orphaned-rows.ts \
  vn-market-intelligence-mcp-mcp-server-1:/app/carry-forward-bctc-orphaned-rows.ts
docker exec vn-market-intelligence-mcp-mcp-server-1 \
  bun /app/carry-forward-bctc-orphaned-rows.ts --apply
```
Idempotent: target row count already matching source → no-op (exit 0). Refuses
(never touches) CONFIRMED targets, 0-row sources, or conflicting nonzero target
row counts (exit 2/3/4 — see script header). Default source/target: CTG 2026-Q1
orphan 96e36139-... → current e497f7d1-8717-49cc-bfa9-88804464d143.
**LIVE RESULT (2026-07-10T00:40Z, executed):** AC-TRACK1-2 succeeded (451 rows
carried forward, RAW-verified). AC-TRACK1-3 did NOT fully resolve — the
carried-forward rows are 208 income_statement + 173 cash_flow + 70 notes, ZERO
balance_sheet/general rows, so the BEQ-6 section-completeness gate correctly
refuses DONE (refine_status now PARTIAL, total_assets/net_revenue/net_margin_pct
scalars unchanged from pre-migration garbage — this is honest behavior, not a
script bug). Root defect is one level deeper than W2's row-repair scope: the
balance-sheet window was apparently never captured during the original
agentic-refine pass that produced this orphan. Escalated — needs a fresh
agentic-refine pass targeting CTG's balance-sheet page window once the
gateway-blind defect (architect brief §1) resolves.

**CANONICAL: OHLCV backfill-queue manual trigger (DATA-BACKFILL-PRICES-20260706-MONDAY-GAP)**
```bash
# Dry-run (default — reports pending-queue state, no writes):
bun scripts/migrations/trigger-ohlcv-backfill-queue.ts

# Apply (dedup-guarded INSERT into ohlcv_backfill_queue — same pattern as
# ohlcvHistoryBackfillJob.ts / ohlcvStartupProbe.ts; VPS poller picks it up
# on its next ≤30min systemd timer cycle):
docker cp scripts/migrations/trigger-ohlcv-backfill-queue.ts \
  vn-market-intelligence-mcp-mcp-server-1:/app/trigger-ohlcv-backfill-queue.ts
docker exec vn-market-intelligence-mcp-mcp-server-1 \
  bun /app/trigger-ohlcv-backfill-queue.ts --apply
```
If the VPS poller does not deliver (verify: `docker logs <container> | grep '\[push-ohlcv-history\]'`
stays empty across a full timer cycle — VPS-side script execution failure, ops zone), fall back to
direct-fetch (only if a live probe from inside the container confirms VNDirect is currently reachable
— it is geo-block-dependent and may change):
```bash
docker cp scripts/migrations/backfill-ohlcv-gap-2026-07-06.ts \
  vn-market-intelligence-mcp-mcp-server-1:/app/backfill-ohlcv-gap-2026-07-06.ts
docker exec vn-market-intelligence-mcp-mcp-server-1 \
  bun /app/backfill-ohlcv-gap-2026-07-06.ts --dry-run   # lists target codes, no fetch/writes
docker exec vn-market-intelligence-mcp-mcp-server-1 \
  bun /app/backfill-ohlcv-gap-2026-07-06.ts --apply     # fetches VNDirect + writes via writeOhlcvBatch SSOT
```
Date-specific (2026-07-06) but the `findGapCodes`/`runBackfill` exports are reusable — copy + change
the 3 date constants for a future one-off gap. NO FAKE DATA: only real VNDirect responses are written;
empty responses are honest gaps (skipped, logged), never zero-filled.

**CANONICAL: Watchlist SSOT resync (WATCHLIST-DB-SYSMAP-DRIFT-FIX, 2026-07-11)**
```bash
# Dry-run (default — reports orphans/missing, no writes):
bun scripts/migrations/resync-watchlist-sysmap-2026-07-11.ts

# Apply (transaction: DELETE orphans not in system-map.json + UPSERT every SSOT row):
docker cp scripts/migrations/resync-watchlist-sysmap-2026-07-11.ts \
  vn-market-intelligence-mcp-mcp-server-1:/app/resync-watchlist-sysmap.ts
docker exec vn-market-intelligence-mcp-mcp-server-1 \
  bun /app/resync-watchlist-sysmap.ts --apply
```
Root cause: `seedWatchlist.ts`'s `WATCHLIST_SEED` was a second hardcoded ticker
array independently diverged from `docs/data/system-map.json` SSOT (only
15/33 overlap) — `schema.ts` ran it unconditionally on every non-test DB init,
so a pure resync would not have survived a restart. `WATCHLIST_SEED` now
derives from system-map.json at module load (never hardcode ticker lists).
This script deliberately duplicates the SSOT-derivation logic rather than
importing seedWatchlist.ts — the Docker image bakes `src/` at build time
(NOT live-synced like `docs/data/`), so it must work correctly whether run
before or after an image rebuild+swap. Idempotent: a second run finds zero
orphans/missing (exit 0, no-op). Known hazard hit during first live run:
the long-running server's singleton `getDb()` connection did not observe
this script's external write (get_watchlist MCP tool served a stale
row-count until the next container restart) even though two independent
fresh connections both read the correct post-resync state — direct-probe
BOTH tools after ANY out-of-process watchlist write, don't trust one alone.

**CANONICAL: Dead stranded_bctc_pdf row cleanup (VCB-MISSING-PDFS, 2026-07-13)**
```bash
# Dry-run (default — reports dead candidates, no writes):
bun scripts/migrations/reap-dead-stranded-bctc-rows.ts

# Apply (UPDATE status='dead' for every candidate found):
bun scripts/migrations/reap-dead-stranded-bctc-rows.ts --apply

# Against the live named-volume DB (docker exec — matches other CANONICAL scripts):
docker cp scripts/migrations/reap-dead-stranded-bctc-rows.ts \
  vn-market-intelligence-mcp-mcp-server-1:/app/reap-dead-stranded-bctc-rows.ts
docker exec vn-market-intelligence-mcp-mcp-server-1 \
  bun /app/reap-dead-stranded-bctc-rows.ts --apply
```
Generic (no ticker/date literals): selects `agent_feedback` rows tagged
`[AUDIT] stranded_bctc_pdf%` with `status='new'`, `reparse_attempts >=
DEAD_AT_ATTEMPTS(10)`, and a `filePath` (parsed from `detail`) confirmed
absent from disk right now — retires them to `status='dead'` (never
`'resolved'` — they were never actually reparsed) so `bctcReparseJob`'s
`WHERE status='new'` query stops selecting them forever. A row whose file
still exists but keeps failing extraction is untouched (different, still-open
failure mode). Self-contained (duplicates the tiny JSON-detail parse rather
than importing `bctcReparseJob.ts` — same Docker-image-bakes-`src/`-at-
build-time reasoning as `resync-watchlist-sysmap-2026-07-11.ts`). Idempotent:
a second run finds 0 candidates once already marked (exit 0, no-op).
Companion code fix: `DEAD_AT_ATTEMPTS` guard added directly inside
`bctcReparseJob.ts`'s retry loop so future occurrences self-heal without
needing this script re-run (deploy-gated — takes effect after next mcp-server
image rebuild). **LIVE RESULT (2026-07-13T14:11Z, executed):** 1 candidate
found (id=323, VCB_2025_Q4.pdf, 271 reparse_attempts) — marked `dead`.
Second dry-run confirmed 0 candidates remain.

**CANONICAL: Prediction-claim creation_price backfill (FIX-PREDCLAIM-BACKFILL-NULL-CREATIONPRICE deliverable (a), 2026-07-25)**
```bash
# Dry-run (default — reports candidates + source bar or "no_bar", no writes):
bun scripts/migrations/backfill-predclaim-creation-price.ts

# Apply (UPDATE creation_price for every candidate with a real daily_ohlcv bar):
bun scripts/migrations/backfill-predclaim-creation-price.ts --apply

# Against the live named-volume DB (docker exec — matches other CANONICAL scripts):
docker cp scripts/migrations/backfill-predclaim-creation-price.ts \
  vn-market-intelligence-mcp-mcp-server-1:/app/backfill-predclaim-creation-price.ts
docker exec vn-market-intelligence-mcp-mcp-server-1 \
  bun /app/backfill-predclaim-creation-price.ts --apply
```
Generic (no ticker/date/id literals): backfills every `prediction_claims` row with
`creation_price IS NULL AND is_excluded = 0` (still-pending rows only — the
already-excluded legacy rows are out of this query's scope by construction) from the
EXACT-date `daily_ohlcv` close for that ticker on the claim's `created_at` trading
date. No nearest-day fallback — a ticker/date with no exact bar is left untouched and
reported `disposition=no_bar` (honest gap, never fabricated). Idempotent: `WHERE
creation_price IS NULL` write guard — a second run finds 0 candidates once
backfilled. **LIVE RESULT (2026-07-25T12:51Z, executed, standalone per PO ruling
2026-07-25T12:07Z — producer fix FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT
still REBUILD_REQUIRED/user-gated):** 5/5 pending rows backfilled (ids 13,14,15,16,17
— VIC×4 + VNM×1), each with a real source bar, verified read back through the LIVE
`GET /api/prediction-claims` HTTP endpoint (not a host-CLI/sqlite read). Calibration
total held at 17, pending count held at 5 (only `creation_price` changed, no status
flip). Deliverables (b) reconstruct-the-6-excluded and (c) machine-readable exclusion
reasons were explicitly out of scope for this standalone run (PO ruling) — script's
default query naturally excludes `is_excluded=1` rows so a future run cannot
accidentally touch them; a separate task is needed for (b)/(c).

**CANONICAL: Mislabelled-BCTC-period dedupe (FIX-BCTC-INGEST-PERIOD-IDENTITY-UNVALIDATED-VS-CONTENT AC-1, 2026-07-28)**
```bash
# Dry-run (default — read-only snapshot + decision, no writes):
bun scripts/migrations/dedupe-mislabeled-bctc-period.ts
bun scripts/migrations/dedupe-mislabeled-bctc-period.ts --source <id> --target <id>

# Apply (re-parents bctc_refined_units, deletes the duplicate financial_reports
# row, resets the freed bctc_vps_queue row to pending):
bun scripts/migrations/dedupe-mislabeled-bctc-period.ts --apply

# Against the live named-volume DB (docker exec — matches other CANONICAL scripts):
docker cp scripts/migrations/dedupe-mislabeled-bctc-period.ts \
  vn-market-intelligence-mcp-mcp-server-1:/app/dedupe-mislabeled-bctc-period.ts
docker exec vn-market-intelligence-mcp-mcp-server-1 \
  bun /app/dedupe-mislabeled-bctc-period.ts --apply
```
Decision-table gated (never guesses): refuses when source `refine_status='DONE'`
(already finalized — the exact `time_gate` this script exists to respect, needs a
human/PO call instead), target `confirm_status='CONFIRMED'`, action_code mismatch,
source/target share a sort_key, target already has `bctc_refined_units` (manual
reconciliation), or — when both pdf files exist on disk — their md5 hashes differ
(duplicate hypothesis unconfirmed). Idempotent: a second run finds the source row
already absent → no-op (exit 0). Default source/target: DPM
`5b0dad71-3b05-4455-9823-c2072442777d` (mislabelled `2025-Q4`, real content
`2026-Q1`) → `3e2a26d9-525a-4dba-8ebe-fcaecc0cb28e` (correctly-labelled `2026-Q1`).
**LIVE RESULT (2026-07-28T16:45Z, executed):** confirmed byte-identical PDF
duplicate (md5 `bec27c51…` both files) before applying. 23 `bctc_refined_units`
windows re-parented onto the target, duplicate row deleted, `bctc_vps_queue`
`(DPM, 2025, Q4)` reset to `pending`/0/NULL/NULL. Independently RAW-verified via a
fresh DB connection post-apply (not the same connection the script used): exactly
one DPM row remains (`2026-Q1`, `refine_status=PENDING`, 23 units intact),
`get_bctc_report_id(code="DPM", year=2025, quarter="Q4")` now correctly returns
nothing. Applied while `refine_status` was still `PENDING` (re-verified
immediately before the run) — the `time_gate` this script's guard exists to
respect.

**CANONICAL: agent_signals identical-duplicate RAW-verify replay (FIX-AGENT-SIGNALS-IDENTICAL-DUP-EMISSION, 2026-07-29)**
```bash
# Local/CI (Bun.env["DB_PATH"], defaults to /app/data/market.db):
bun scripts/audits/check-agent-signals-dup.ts

# Against the live named-volume DB (docker exec — matches other CANONICAL scripts):
docker cp scripts/audits/check-agent-signals-dup.ts \
  vn-market-intelligence-mcp-mcp-server-1:/tmp/check-agent-signals-dup.ts
docker exec vn-market-intelligence-mcp-mcp-server-1 \
  bun /tmp/check-agent-signals-dup.ts
```
Read-only replay of the GROUP BY (from_agent,signal_type,stock_code,minute-bucket,payload)
HAVING COUNT(*)>1 corroboration query — the standing verification gate for the
identical-duplicate defect class. **LIVE RESULT (2026-07-29T05:04Z):** total=202,
ALL-TIME dup-groups=0, ACTIVE-24h dup-groups=0 — the 2026-06-25 finding (102/43)
had already expired out of the table via TTL + `cleanExpired()` GC. Data-layer
backstop shipped regardless (`idx_agent_signals_dedup_identical`, `schema-news.ts`
+ `postSignal()` `INSERT OR IGNORE`, `agentSignalStore.ts`) since the underlying
scheduler re-entrancy mechanism (cron_job_runs: 41 distinct job names multi-firing
within the same scheduled minute over 7d) remains live — see
`FIX-SCHEDULER-DOUBLE-REGISTRATION` (still BACKLOG, separate board row).

**CANONICAL: Foreign-flow trading-day-gap live re-verification
(FIX-FOREIGN-FLOW-MISSING-TRADING-DAY-2026-08-06-NO-BACKFILL AC-2, 2026-08-07)**
```bash
# Local/CI (Bun.env["DB_PATH"], defaults to /app/data/market.db) — read-only,
# never writes, regardless of --apply (see script header for why):
bun scripts/migrations/backfill-foreign-flow-gap-2026-08-06.ts
bun scripts/migrations/backfill-foreign-flow-gap-2026-08-06.ts --apply

# Against the live named-volume DB (docker exec — matches other CANONICAL scripts):
docker cp scripts/migrations/backfill-foreign-flow-gap-2026-08-06.ts \
  vn-market-intelligence-mcp-mcp-server-1:/app/backfill-foreign-flow-gap-2026-08-06.ts
docker exec vn-market-intelligence-mcp-mcp-server-1 \
  bun /app/backfill-foreign-flow-gap-2026-08-06.ts
```
Reports live `daily_foreign_flow` row-count/truncated-tail status for the
2026-08-06 zero-row gap + the 2026-08-05T04:29:40Z truncated tail, then
live-probes the SAME upstream endpoint the VPS push pipeline uses
(`bgapidatafeed.vps.com.vn/getliststockdata`) for date/range capability.
**LIVE RESULT (2026-08-07T03:22Z, executed):** 2026-08-06 rowCount=0
(confirmed zero-row gap); 2026-08-05 rowCount=99 maxUpdatedAt=
2026-08-05T04:29:40.192Z, truncatedTail=true; upstream probe reachable,
returns only current-tick fields (`lastPrice`/`fBVol`/`fSVolume`/`fRoom`/
`g1..g7` bid-ask ladder/etc.), no date field, verdict=UNRECOVERABLE — matches
the 2026-07-22 precedent for this identical endpoint. Both gaps are
PERMANENT data loss; the real fix is the D-NEW4 completeness detector
(`checkForeignFlowGap`, wired into `dataAuditJob` nightly, see
`infrastructure.md`) so a future occurrence always escalates instead of
self-clearing silently the moment the next fetch lands.

**CANONICAL: Monthly signal-quality audit — missed-month recover guard
(FIX-MONTHLYSIGNALQUALITYAUDITJOB-MISSED-JULY-RECOVER-GUARD, 2026-08-29)**
```bash
# Recover the most recent missed month automatically — NO script needed:
# deploy the fixed image (docker compose up -d --build mcp-server); on the next
# boot the startup catch-up (startScheduler.ts, shouldRunCatchup cadence='month')
# fires the July/prior-month audit once if no SUCCESS cron_job_runs row exists for
# the current calendar month (T4 shouldSkipMonthlyReplay in runMonthlySignalQualityJob
# makes double-send impossible).
#
# One-shot historical backfill — ONLY for months older than the most-recent missed
# one (e.g. June 2026, unrecoverable through natural cadence):
# Dry-run (default — read-only, prints report, no send):
bun scripts/migrations/backfill-monthly-signal-quality-audit.ts --month 2026-06 --month 2026-07

# Apply (sends via live WORK Telegram channel; marker-row idempotent — a second
# apply for an already-backfilled month is refused):
docker cp scripts/migrations/backfill-monthly-signal-quality-audit.ts \
  vn-market-intelligence-mcp-mcp-server-1:/app/backfill-monthly-signal-quality-audit.ts
docker exec vn-market-intelligence-mcp-mcp-server-1 \
  bun /app/backfill-monthly-signal-quality-audit.ts --month 2026-06 --apply
```
**LIVE RESULT (2026-08-29T02:57Z, executed):** June 2026 report (69 rejections /
52 signals, 132.69% rate — ALERT) SENT to WORK channel; marker
`monthlySignalQualityAuditJob:backfill-2026-06` recorded (re-run refused, exit 0).
July 2026 is intentionally NOT backfilled — the post-deploy startup catch-up
produces it (any fire in August audits July), avoiding a duplicate report.
Root cause: `recoverMissedExecutions:false` opt-out + node-cron's restart-blind
recovery; the code fix is the three-layer guard described in
`docs/architecture/microservice/mcp-server/system.md` § FIX-MONTHLYSIGNALQUALITY-
AUDITJOB-MISSED-JULY-RECOVER-GUARD.

---

## Low-Confidence Reparse Runbook

When `extraction_confidence < 0.5` for a batch of tickers after a parser fix ships:

```bash
# CANONICAL SCRIPT: scripts/migrations/reparse-bctc-reports.ts
# Force-reparse specific tickers (latest period):
bun scripts/migrations/reparse-bctc-reports.ts --tickers REE,CTG,PPC

# With period filter:
bun scripts/migrations/reparse-bctc-reports.ts --tickers REE --year 2026 --quarter Q1

# Dry-run:
bun scripts/migrations/reparse-bctc-reports.ts --tickers REE,CTG --dry-run
```

Pre-conditions: container must be running; `VPS_PUSH_API_KEY` env in container; local PDFs in `data/pdfs/`.
Mechanism: reset `bctc_vps_queue` row to `pending` → POST local PDF bytes to `/api/push-bctc-pdf` → pipeline runs in container. Precedent: FIX-BCTC-LOWCONF-REPARSE-BATCH (2026-06-08).

**Update `docs/data/orch/orch-state.json` `.task_board`**: task status IN_PROGRESS → REVIEW (atomic write per §2.3).

**`.head` idle-reset — SUCCESS path (FIX-DEVFLOW-SELFCONTAINED-ZONE-FLOWS-SUCCESS-PATH-NO-HEAD-SYNC, 2026-08-23 — same idiom as `docs/agents/developer/flow/microservice-main.md`'s own AC-1/AC-2/AC-3):** this file delegates to `microservice-main.md` for the BASE steps only, then re-implements its OWN terminal block here — the shared file's `.head` idle-reset step (at the very end of `microservice-main.md`, right before ITS return) is never reached. Run this block immediately after the task_board update above, before RETURN. **GUARD (mandatory, not optional):** reset ONLY when `.head.active_task_id` still names THIS task — never blind-null; a concurrent peer's head pin on a different task must survive.
```bash
head_active_task=$(jq -r '.head.active_task_id' docs/data/orch/orch-state.json)
if [ "$head_active_task" = "$task_id" ]; then
  now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  jq --arg s "idle" --arg t "$now" --arg u "dev-mcp-server" \
    '.head = {status:$s, updated_at:$t, updated_by:$u, active_task_id:null, next_agent:null}' \
    docs/data/orch/orch-state.json \
    | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
fi
```

Return:
```
## RETURN
DONE: Implementation complete — SERVICE=mcp-server, CHANGED=[...], NEW_PASS=N, tsc clean, tools=N, sched=N
NEXT: qa | run full QA pipeline
HANDOFF: docs/handoffs/TASK_NNN.md
PIPELINE: continue
```
