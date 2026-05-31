# Developer — Notebook

**Last updated:** 2026-05-31 | **Cycle:** ENV-ISOLATION EI-P1-2 + EI-P1-3 | **Sprint:** ENV-ISOLATION

## Session 2026-05-31 — ENV-ISOLATION EI-P1-2 + EI-P1-3

**Tasks:** EI-P1-2 (scripts/ guard) + EI-P1-3 (docs/protocols/dev-environment.md)
**Zone:** scripts/ + docs/protocols/ — general developer zone (no specialist owns these)
**No zone dispatch needed:** scripts/ and docs/protocols/ both unowned by any dev-* specialist.

**EI-P1-2 — What was done:**
- `scripts/run-bt7-backfill.ts`: replaced hardcoded machine-specific absolute DB path with
  `process.env.DB_PATH ?? resolve(PROJECT_ROOT, "apps/mcp-server/data/market.db")`.
  Added guard: if resolved path does not end with `market.db`, refuse (exit 1) unless
  `--force-dev` passed. Always prints `APP_ENV` + resolved `DB_PATH` before any write.
- `scripts/purge-phantom-reports.ts`: added APP_ENV check — if not "production" (default
  when unset), refuse (exit 1) unless `--force-dev` passed. Prints APP_ENV + DB_PATH first.
- Both scripts: `--force-dev` override emits visible WARNING (never silent bypass).
- Commit: `89e9b5b8`

**EI-P1-3 — What was done:**
- Created `docs/protocols/dev-environment.md` (241L) — complete dev session SOP.
- Covers: pre-session checks (market hours + backup), start dev stack (docker compose -f
  docker-compose.yml -f docker-compose.dev.yml up after stopping prod), verify APP_ENV=dev
  + DB_PATH=...market.dev.db in startup log, seed dev DB (.dump financial_reports +
  pdf_extracted_text | sqlite3 market.dev.db), promote BCTC data to prod with mandatory
  FK parent-before-child order (financial_reports → bctc_refined_units → bctc_table_rows,
  each in BEGIN/COMMIT), LanceDB lancedb.dev seeding (optional for BCTC), restore prod
  (down dev → up prod → verify healthy), RISK-5 volume-deletion WARNING (backup market.db
  before any docker volume rm), maintenance script guard output shapes.
- Commit: `0c9bed2a`

**Test result:** No test file written — EI-P1-2 is additive guard-only (fail-loud output shapes
are the deliberate-violation proof at AC level; QA will run the deliberate-violation per
EI-P2-QA scope). EI-P1-3 is docs-only.
**tsc:** not applicable (scripts/ are run directly, not compiled into mcp-server).
**Commits:** 89e9b5b8 (EI-P1-2) / 0c9bed2a (EI-P1-3)

**Gotchas:**
- run-bt7-backfill.ts import path is still a hardcoded absolute path (the backfillBctcTables
  import on line 20) — this is pre-existing and out of scope for EI-P1-2 (don't refactor logic).
- purge-phantom-reports.ts DB_PATH is still resolved from `import.meta.dir/..` (works when
  script is run from scripts/ dir). The guard fires on APP_ENV mismatch, which is the
  correct layer for this script (DB path itself always resolves to market.db correctly).
- TASKS.md EI-P1-2/3 DONE markers were captured in the PO's 1d8d6a67 commit
  (working-tree shared edit) — content is in HEAD.

**NEXT:** QA — EI-P1-2/3 acceptance verified (deliberate-violation: APP_ENV=dev bun purge-phantom-reports.ts → REFUSED). EI-P1-1 (ops) parallel-safe, different file.

---

## Session 2026-05-31 — DWF-PHASE1 P1-DEV-1..7 — Adaptive Cadence | **Sprint:** DWF-PHASE1

## Session 2026-05-31 — DWF-PHASE1 (P1-DEV-1..7)

**Task:** Execute full DWF-PHASE1 dev task set (P1-DEV-1 through P1-DEV-7) — Adaptive Cadence implementation.

**What was done:**

Wave 1 (parallel):
- P1-DEV-1: Created `docs/data/cadence-policy.json` — 19 rules, 3 policies (gatherer-standard/chef-intraday/bctc-offmarket), _staleness_threshold_minutes=20, _cron_fallback semantics for bctc-offmarket open/half_day/unknown.
- P1-DEV-2: Created `scripts/agents-flow/cadence-policy.js` — CommonJS module (loadCadencePolicy, evaluateCadence, computeTiers, isStale). First-match wins, wildcard *, safe default 240 on no-match, dual isStale gate.
- P1-DEV-4: Modified `docs/data/cowork-schedule.json` — added policy_id to all 14 enabled slots per BLOCKER-2 table (6 null, 4 bctc-offmarket, 1 chef-intraday, 4 gatherer-standard).

Wave 2:
- P1-DEV-3: Extended `scripts/agents-flow/cowork-match-slots.js` — adaptive mode via options={mode,pressureState,policyObj}. CLI entrypoint auto-detects adaptive via cadence-policy.json presence + isStale. Output slots gain due_reason + cadence_minutes.

Wave 3:
- P1-DEV-5: Added Steps 4.2-4.5b to `docs/agents/cowork-team/flow/main.md` — staleness gate, calendar suppression, cadence due-check, freshness downgrade, CADENCE_MATCHES rebind. BLOCKER-1 resolution: suppression BEFORE Step 4.6.

Wave 4:
- P1-DEV-6: Added Step 5b to cowork-team flow — batched atomic last_fired write (read→update-WON→.tmp→rename). Non-fatal on failure. Telemetry extended.

Wave 3 parallel:
- P1-DEV-7: Created `apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts` — 48 assertions, 13 DV test blocks (T-1..T-13c). All GREEN. RED proofs documented inline and verified.

**Test result:** 48 pass / 0 fail / 142 expect() calls.
**Commits:** 5a19485e (P1-DEV-1) / cf527304 (P1-DEV-2) / 7405d7c5 (P1-DEV-4) / 54077271 (P1-DEV-3) / 3799d6e2 (P1-DEV-5+6) / d8892afc (P1-DEV-7)
**Zone:** cross-service (NFR-P1-5: zero apps/mcp-server/src/ production code changes)

**Gotchas:**
- cadence-policy.json gitignored by `data/` rule in .gitignore → needed `git add -f`
- The PM summary says "28 rules" but the blueprint defines exactly 19 (8+6+5). Blueprint is authoritative.
- Phase 2 invariants preserved: leader lock (Step 0b), suffix-free cowork-slot: token (Step 4.6), published-marker belt (Step 5) — all untouched. New steps 4.2-4.5b are purely additive between Step 4b and Step 4.6.

**NEXT:** qa — run P1-QA integration verification against main.

---

## Previous sessions (archived context — 2026-05-24/25)

BT-4 AC-2 (2026-05-25): MCP_SERVER_URL explicit in pdf-extractor docker-compose (7d4a447b). Zero behavior change.
NF-LD-5-dev-B (2026-05-24): Refresh + source selector in news-fetch dashboard (12600a1f). 8/8 PASS.
NF-LD-4-dev-B (2026-05-24): ENDPOINT relative path in news-fetch dashboard (d32398f4). 4/4 PASS.
NF-LD-2b (2026-05-24): panel-live-data + dash-check assertions (45fd7f74). 8/8 PASS.
Commit-Mutex (2026-05-24): fleet-wide advisory lock wired into 35 flow files, 39 commit sites (B1-B6). C1/C2/C4 COMPLETE. Race: private GIT_INDEX_FILE technique resolved.
P1-G5 (2026-05-24): news-fetch composition-root + reuters HTTP rewire + OpenAPI (e1c78908).

## Session c212 — Dev-Team Orchestration (JUMP-TO: drain-signals → PO triage → dispatch)

**Preflight:** NO HEAD.lock. Worktree prune: clean. PASS.

**Gate assessment (20:59Z):**
- OBSERVE-1951b: CLOSED (gate was 20:34Z, 25 min past). AC-6 PASS → 1951d UNBLOCKED.
- 1948 gate: 2026-05-20T07:22Z — future, still blocked.
- OBSERVE-1953g: 2026-05-21T02:30Z — future, observing.

**Drain signals (12):** All stale/resolved — moved to processed/. No new PO triage needed (already planned via po-1955-sprint-plan.json signal).

**TASKS.md updates:** OBSERVE-1951b→Done, Sprint-1956→Done (11/11), 1954a AC-3 PASS, stale Backlog entries removed, TASKS.md=80 lines.

**Dispatch:** dev-mcp-server→1955a (HIGH FIX dailyDashboardJob path) + ops→1951d (cutover 12 RemoteTriggers). WIP=2/2.

## Session c178 — Task 1952f (chef-intraday trigger_prompt MCP URL)

**Task:** 1952f — Append MCP URL to `chef-intraday` trigger_prompt in `docs/data/cowork-schedule.json`.

**Root cause confirmed:** cowork-team/main.md Step 5 spawns unified-agent using `trigger_prompt` verbatim. The field lacked `\nMCP: https://zenmidi.com/vn-market/mcp`. Unified-agent exited without tools.

**Narrowest-fix analysis:**
- `news-scout-market`, `market-watcher-market`, `alert-commander-market` → `trigger_error: "API_MIN_INTERVAL"`, no `trigger_id`, produce results via master dispatcher already. NOT modified.
- Only `chef-intraday` has the failure. One field change.

**Files changed:**
- `docs/data/cowork-schedule.json` — `chef-intraday.trigger_prompt` appended `\nMCP: https://zenmidi.com/vn-market/mcp`
- `docs/TASKS.md` — 1952f added to Done
- `docs/agent-memory/notebooks/developer.md` — this update

**Pipeline state:** c178 DONE. Commit on main.

## Previous sessions (archived context)

c178: 1952f chef-intraday trigger_prompt MCP URL append. DONE.
c177: IDLE — 1941d zone conflict, no dispatch.
c176: IDLE — BA-1941c stale slot, 1941d dormant.
1941a: cashFlowTool OCF API-bridge preference fix (b0791eaf). QA approved.
c175: calendar-source-replacement dispatched to dev-macro-indicators.
c174: 1940a (PC1 legal_risk dual-source) shipped. QA APPROVED.
c172-c173: idle, 1939a/b QA in progress. c170: 1938a MCP URL fix shipped.
