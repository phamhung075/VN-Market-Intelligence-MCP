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
