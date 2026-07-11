---
sprint: MONEY-RADAR-P0
branch: task/watchlist-db-sysmap-drift-fix
size: S
zone: cross-service
depends_on: []
blocks: []
---

## TLDR
Live SQLite watchlist table (52 rows) has drifted from SSOT in `docs/data/system-map.json` (.project.watchlist, 34 active). Resync the table to match SSOT: remove 18 orphaned rows (inactive VEA, mis-seeded VNH), restore missing 17+ active items. Restores correctness for /ta/money-flow-oscillators, /ta/roc-momentum, and sibling TA endpoints.

## [PM] Planning Context

- **Zone:** cross-service
- **Acceptance Criteria:**
  - [ ] Live SQLite watchlist table matches system-map.json .project.watchlist (34 active items)
  - [ ] Removed 18 orphaned rows: inactive VEA and VNH mis-seeded entries
  - [ ] Restored missing active items from SSOT
  - [ ] VNH correctly sectored as seafood (not real_estate)
  - [ ] All TA endpoints return corrected universe (verify /ta/money-flow-oscillators + /ta/roc-momentum)
  - [ ] No data loss: prior watchlist_id references in other tables (if any) remain intact

- **Pre-Verification (07-11T10:40Z):**
  - Live watchlist: 52 rows (populated 2026-04-27, last sync >2.5 months stale)
  - System-map SSOT: 34 active items
  - Drift: 18 row delta (52 live vs 34 SSOT)
  - Known issues: VEA (inactive) present in live, VNH mis-seeded as real_estate, 17+ active items missing from live table

- **Files to read first:**
  - `docs/data/system-map.json` (SSOT, lines: `.project.watchlist[]`)
  - Live SQLite schema: `watchlist` table (READ/UPDATE access required)
  - `docs/data/orch/archive/backlog-detail.json#WATCHLIST-DB-SYSMAP-DRIFT-FIX` (full task detail + notes)

- **Files to create:** 
  - None (in-place DB sync)

- **Files to modify:**
  - Live SQLite: `watchlist` table (DELETE orphaned rows, INSERT missing rows from SSOT)
  - *Optional:* `docs/agent-memory/notebooks/dev-*.md` (session log only, per agent boundary rules)

- **Dependencies:** 
  - None (independent)
  - Blocker: Must locate watchlist seeder script location (likely apps/technical-analysis/ per grooming note)

- **Knowledge needed:**
  - `docs/data/system-map.json` structure (project.watchlist array format)
  - SQLite watchlist table schema (see `apps/mcp-server/src/interface/mcp/tools/watchlist/` or DB schema)
  - git history: watchlist table created 2026-04-27 (last sync/seeder invocation)
  - VNH sector mapping: correct value is "seafood" (per system-map)

- **Known Hazards:**
  - **Data integrity:** This is a SERVING-layer fix; verify both tools (`get_bctc_full` validation gate + TA endpoint filters) consume the corrected table
  - **Foreign key risk:** Confirm no other tables have foreign key references to watchlist.code (prior tables like alert_mutes, price_alerts may reference code)
  - **Stale seeder:** The current watchlist seeder (location TBD) must not re-populate live with stale data after this fix
  - **Schema drift:** If watchlist schema changed since 2026-04-27 (e.g., added columns), manual INSERT statements may need adjustment

## Execution Notes

1. **Discover seeder:** Find the watchlist seeder script (grep for "watchlist" in apps/technical-analysis/ or search git log for last seeder commit near 2026-04-27).
2. **Build SSOT set:** Extract all active codes from system-map.json .project.watchlist[].
3. **Identify orphans:** Query live table, find codes NOT in SSOT → mark for deletion.
4. **Identify missing:** Find codes in SSOT NOT in live table → prepare INSERT statements (copy company_name, domain, alert settings from seeder defaults or system-map).
5. **Transactional sync:** 
   - BEGIN TRANSACTION
   - DELETE orphaned rows
   - INSERT missing rows
   - COMMIT
6. **Verify:** Re-query live table → count should equal SSOT (34). Test TA endpoints via curl/tool to confirm no errors.
7. **Commit & document:** `git add docs/data/system-map.json` (if modified) + market.db changes, commit with task reference + pre-verification evidence.

---

## Related Issues
- **Source:** QA repair_task_request WATCHLIST-DB-SYSMAP-DRIFT (non-blocking, found during Money Radar P0 T1 gate)
- **Precedent:** Similar drift-fix pattern applied in MONEY-RADAR-P0 T2-T3 (money_radar_score_history seeded from live signals)
- **Follow-up:** If seeder is dormant or needs updates, escalate to architect/dev-technical-analysis for seeder fix (out of scope for this task)

## [Developer Team Lead] Zone Routing + Root-Cause Pre-Analysis (2026-07-11T10:55Z)

**Zone verdict:** `apps/mcp-server/` — ALL touched files live there (`SqliteWatchlistRepository.ts`, `watchlistReadStore.ts`, `seedWatchlist.ts`, `schema.ts`, `schema-market-data.ts`, `system/watchlist.ts` MCP tool). Handoff's `zone: cross-service` is a misnomer — the seeder is called from `apps/mcp-server` only; `apps/technical-analysis` (Go, TA compute service) reads watchlist codes via a market-data client, it does NOT own the table. Routing to **dev-mcp-server** (not implementing here — Step 0 zone check, developer team-lead never codes inside a matched zone).

**Root cause found (goes deeper than a one-time resync):** `apps/mcp-server/src/infrastructure/db/seedWatchlist.ts` `WATCHLIST_SEED` is a **second hardcoded ticker list** (34 tickers), independent of and badly diverged from `docs/data/system-map.json` `.project.watchlist` (33 active + 1 inactive=VEA). Overlap is only 15 tickers. `schema.ts:202` calls `seedWatchlist(db)` **unconditionally on every non-test DB init** (comment at schema.ts:198-200: "Runs always ... so post-migration DBs with partial data get restored to full ... watchlist state") via `INSERT ... ON CONFLICT(code) DO UPDATE` — this means **a pure DB resync (DELETE+INSERT once) will NOT survive the next server restart/deploy**: the 19 seeder-only tickers not in system-map.json (`GAS, GVR, MBB, ACB, CTG, VPB, D2D, HSG, NKG, HVN, ACV, HCM, DHG, POW, PPC, TCH, VNH, REE, MWG`) will silently re-INSERT themselves back in.

**Mandatory fix scope (not just the resync):** `WATCHLIST_SEED` must be derived from `docs/data/system-map.json` `.project.watchlist[]` (`active==true` entries; `code`→`code`, `exchange`→`exchange`, `sector`→best-fit `domain` enum value) at seed-build time, not hardcoded — per project rule "system-map.json is SSOT — never hardcode ticker lists." Otherwise this is a symptom fix that re-breaks itself.

**VNH resolution (AC ambiguity, resolved):** `system-map.json` has **no VNH entry at all** (confirmed: `grep VNH docs/data/system-map.json` → 0 hits). TLDR + AC-2 group VNH with VEA under "18 orphaned rows to REMOVE" — that is the correct reading. The AC-4 bullet ("VNH correctly sectored as seafood, not real_estate") documents *why* it's an orphan (mis-seeded, no valid `domain` bucket) — it does NOT mean VNH should be kept/re-added. Commit `9713118fe` ("VNH-SECTOR-FIX") already patched the *code-side* hardcoded seed to `domain: "agriculture"` for VNH — that fix becomes moot once `WATCHLIST_SEED` derives from SSOT (VNH drops out entirely, since absent from system-map.json). Live DB's VNH row (still `domain=real_estate`, pre-fix value, added 2026-04-27) should be **DELETED**, not corrected in place.

**Foreign-key check (AC-6):** grep `apps/mcp-server/src/infrastructure/db` for `REFERENCES watchlist` before DELETE — confirm no orphaned FK rows in `alert_mutes`/`price_alerts`/etc. after the sync.

**Hazard reminder (per router dispatch):** live DB = named Docker volume, not host `./data` — verify write lands on the SERVING db. Raw-verify post-write via BOTH `get_watchlist`-style MCP tool AND a direct table probe (`sqlite3`/`bun -e` query) — same-DB tools have diverged on rowcount before (memory: `feedback_same_db_tools_diverge_rowcount`). If a container rebuild is required for the code change to take effect, build only — hand `docker compose up -d` swap to ops, never execute it directly.

## [Developer] Implementation Record (2026-07-11T11:45Z)

- **Service:** mcp-server
- **Zone:** `apps/mcp-server/src/infrastructure/db/seedWatchlist.ts` + `scripts/migrations/` (script persistence — matches existing canonical-script precedent in this zone)
- **Root cause confirmed & fixed:** `WATCHLIST_SEED` was a second hardcoded ticker array, independently diverged from `docs/data/system-map.json` SSOT. It now derives from system-map.json at module load (`loadWatchlistSeedFromSystemMap()` → `deriveWatchlistSeedFromSystemMap()` → `mapSectorToDomain()`, all pure/unit-tested), reading the file via the same cwd-relative pattern already used by `boardDetailsJob.ts`/`agmPlanJob.ts` (works via the `apps/mcp-server/docs` symlink locally and the `./docs/data:/app/docs/data` bind mount in-container — no Dockerfile change needed for the JSON read). Never throws — a missing/corrupt SSOT file warns and yields an empty seed (leaves the live table untouched) rather than crashing the server.
- **VNH / GVR resolved:** both have zero entries in `system-map.json` → correctly dropped from the seed entirely (not sector-relabeled). The prior VNH-SECTOR-FIX / GVR sector-fix code changes are now moot; their test files were updated to assert absence (superseded), not deleted.
- **Live resync (re-verified before applying, per hazard note — PM's pre-verify of 52 live rows was stale):** actual SERVING table (named-volume `market.db` inside `vn-market-intelligence-mcp-mcp-server-1`) had **41 rows**, 25 orphans (including `VDC/BDI/DLC/JSH/SIS`, which pre-date even the OLD hardcoded seed's own "removed" comment) and 17 missing SSOT tickers — worse drift than the PM pre-verify figure. Applied via `scripts/migrations/resync-watchlist-sysmap-2026-07-11.ts --apply` (parameterized SQL, single transaction: DELETE orphans + UPSERT every SSOT row). Result: **41 → 33 rows, exact ticker-set match to system-map.json's 33 active entries.**
- **RAW-verify — BOTH read paths (found a real divergence):**
  - Direct table probe (fresh `bun:sqlite` connection, twice, before AND after): 33 rows, ticker set identical to system-map.json's active set (empty diff both directions).
  - `get_watchlist` MCP tool (curled both from host and from inside the container): still reports the stale **41**-row snapshot. Root cause: the server's long-running singleton `getDb()` connection never observed this out-of-process write (a real WAL-connection-staleness hazard, not a data-correctness bug — disk data is proven correct by two independent fresh connections). This self-resolves on the next container restart, which is needed anyway for the code fix to take effect. Documented as a standing hazard in `docs/agents/dev-mcp-server/flow/main.md`'s new canonical script entry.
- **Files modified:** `apps/mcp-server/src/infrastructure/db/seedWatchlist.ts` (SSOT derivation), 6 test files updated for the new composition (`1343a-watchlist-restore.test.ts` rewritten to assert dynamically against `WATCHLIST_SEED` rather than a hardcoded ticker list — durable against future SSOT drift; `1343e-bctc-pipeline-integration.test.ts`, `1876a-A6-high-vol-seed.test.ts` counts fixed; `VNH-sector-fix.test.ts`, `1787-gvr-sector-fix.test.ts` updated to assert absence), `scripts/migrations/resync-watchlist-sysmap-2026-07-11.ts` (new, canonical), `docs/agents/dev-mcp-server/flow/main.md` (canonical script pointer).
- **Tests written:** `WATCHLIST-DB-SYSMAP-DRIFT-FIX.test.ts` — 16 assertions, TDD RED (imports didn't exist) → GREEN. `scripts/migrations/__tests__/resync-watchlist-sysmap-2026-07-11.test.ts` — 10 assertions, GREEN.
- **Git commits:** `91ef0ac74` (code + tests + script + flow-doc pointer), `f6eecd833` (notebook + decision journal).
- **Type check:** clean (`bun tsc --noEmit`).
- **bun test:** 10 watchlist-related test files — 79 pass / 1 skip / 0 fail. Full bare `bun test`: 14478 pass / 40 skip / 86 fail / 7 errors — **zero overlap with watchlist/seedWatchlist** (grepped); 2 sampled failures re-run in isolation (`1898b-rss-degradation-regression.test.ts` network-mock timeout, `_deprecated/1302-technical-indicators.test.ts` stale response-format assertion) confirmed pre-existing/unrelated, matching the same "bare `bun test` hangs/flakes in this sandbox" precedent documented in commit `b4fda300a`. A second full-suite re-run genuinely hung (repeating identical log lines, no progress) and was killed — matches the documented precedent; not relied upon.
- **Tool count:** 183 — matches pre-task baseline (Gate 2c).
- **Scheduler count probe:** `grep -rc cron.schedule` returned 3 (not the doc's stale "baseline 76") — the codebase has since centralized cron registration into `schedulerJobTable.ts`'s job-table pattern rather than literal `cron.schedule()` calls; this is a pre-existing doc/reality drift unrelated to this task (zero scheduler files touched).
- **Server boot / dashboard probes:** local boot on an alternate port (in-memory DB) — `/health` toolCount=183, `/api/bctc-inspect` and `/dashboards/news-fetch/` both return valid content (no 500/circular-dep breakage).
- **Docs updated:** `docs/agents/dev-mcp-server/flow/main.md` (canonical script pointer + hazard note).
- **Deploy:** `docker compose build mcp-server` done (image `1c5845d64406`, fresh build confirmed). Swap (`docker compose up -d mcp-server`) NOT executed — user/ops-gated per standing rule. Swap is required for: (1) the code fix to survive future restarts, (2) refreshing the server's stale `getDb()` connection so `get_watchlist` serves the already-correct-on-disk 33-row state.
- **Graphify:** skipped — no docs/architecture-briefs impacted, change is contained to code + tests + one canonical script pointer.
