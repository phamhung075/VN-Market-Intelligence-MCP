# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · dev-macro-indicators

**Sprint goal:** (ambient — task picked up via BOUNDED-1 idle-capacity auto-pickup, unrelated to the active sprint's own goal)
**Agent:** dev-macro-indicators
**Started:** 2026-07-28T22:16Z

---

### STEP dev-macro-indicators-S1 · dev-macro-indicators · 2026-07-28T22:24:00Z
**task-id:** FIX-SBV-FETCHER-ZERO-VALUE-EMIT
**what-done:** Traced all storeSbvSnapshot writer call sites; declined to implement — the fix is 100% outside apps/macro-indicators/; corrected task zone/owner in orch-state.json backlog and returned .head to idle instead of forcing a wrong-zone change.
**what-considered:**
- Grep-confirmed apps/macro-indicators/ (Go pilot) only READS sbv_rates (pkg/infrastructure/repositories_sbv_rate.go, SBVRateSQLiteAdapter.GetRate — safe-degrade read-only, no INSERT/UPDATE anywhere in the Go tree). Zero write path exists in my zone.
- Grep-confirmed all 3 real storeSbvSnapshot(...) call sites live in apps/mcp-server/: (1) src/interface/mcp/routes/pushSbvRatesHandler.ts (VPS-push handler) — BUGGY: defaults 6 optional rate fields to 0 when the VPS payload omits them (it always does — vps-scripts/fetch-sbv.sh only ever sends usdVndOfficial+fetchedAt, and that script already fails closed on empty VCB XML before POSTing), so the synthetic 0s trip storeSbvSnapshot's own SENTINEL_ZERO_COLUMNS guard (apps/mcp-server/src/infrastructure/fetchers/sbv.ts) and reject the WHOLE snapshot — including the valid non-zero FX rate; handler also ignores the {skipped,zeroColumns} return, logging a false "stored" line regardless. (2) src/scheduler/macro/sbvRatesJob.ts (4h cron) — already correctly fail-closed (pre-flight sentinel check, WORK alert, skip). Not buggy. (3) src/scheduler/news-analysis/intelligenceCycleJob.ts step A2 (best-effort, every cycle) — missing the pre-flight guard job (2) has, ignores the return value; secondary contributor to recurring rejected-zero volume.
- Considered implementing the fix anyway in apps/mcp-server/ since I have the exact diagnosis in hand — REJECTED: hard zone_restricted boundary (apps/macro-indicators/ only) + explicit not_my_job clause ("Code outside apps/macro-indicators/ — use the matching dev-* agent") in my own init.md; router dispatch used the task's (incorrect) `zone: apps/macro-indicators/` label, not a verified code-location check.
- Considered leaving the board row silently in_progress under my ownership — REJECTED: would strand the P1 row behind a dead-end owner. Instead moved it back to task_board.backlog with zone/owner corrected to apps/mcp-server/dev-mcp-server, full trace embedded in `zone_correction_note`, and reset `.head` to idle/router so the next dispatch cycle routes it correctly.
**why-decision:** Zone boundary is a hard constraint (not_my_job + zone_restricted), and forcing a change outside it would violate CLAUDE.md's zone-restriction discipline and my own agent charter; correcting the board's zone/owner unblocks re-dispatch without fabricating a same-zone fix or silently stalling the task.
**why-change:** Router's task brief assumed zone: apps/macro-indicators/ per the (stale) backlog-detail.json mint; live code inspection falsified that — the entire write path is apps/mcp-server/. No code changed in either zone. No G12 sandbox run (no code touched). No REVIEW flip — task returned to BACKLOG with corrected owner, not DONE.
