# TASK_002 — Watchlist Divergence Audit Script & Cron Wiring

**Parent Task:** FIX-SYSTEM-MAP-WATCHLIST-STALE-34-OF-58  
**Owner:** developer (or dev-mcp-server, zone-flexible)  
**Depends On:** TASK_001 (write-through must land first)  
**Blocked By:** TASK_001  
**Sprint:** COWORK-RELIABILITY  
**Size:** S  
**Priority:** P1

---

## Summary

Implement a standalone audit script that detects divergence between the `docs/data/system-map.json` watchlist and the live SQLite `watchlist` table. Run it on a daily cron. If divergence is detected, emit a BUG-channel telegram. This is the detection backstop for the write-through mechanism (TASK_001) — catches any silent failures.

This task **must** be done after TASK_001 lands (the audit is meaningless before the write-through exists).

---

## Acceptance Criteria

### AC-1: Divergence Audit Script
- [ ] New file: `scripts/checks/watchlist-divergence-audit.ts`
- [ ] Reuses existing, tested exports from `scripts/migrations/resync-watchlist-sysmap-2026-07-11.ts`:
  - [ ] `computeWatchlistDiff()`
  - [ ] `loadSsotWatchlist()`
  - [ ] Do NOT re-derive the diff algorithm from scratch
- [ ] Reads live `watchlist` table (readonly, with `PRAGMA busy_timeout=8000` to avoid spurious lock contention errors)
- [ ] Reads `docs/data/system-map.json` `.project.watchlist[]` codes
- [ ] Calls `computeWatchlistDiff()` to extract `{ orphans: [], missing: [] }` (DB-only vs. file-only rows)
- [ ] Exit code:
  - `0` if no divergence (empty `orphans` and `missing`)
  - `1` if any divergence found
- [ ] stdout: single line of JSON if divergence detected (e.g., `{"orphans":["TICKER1"],"missing":["TICKER2"],"timestamp":"2026-08-22T..."}`)

### AC-2: Telegram Integration
- [ ] If divergence detected (exit 1), call `send_telegram()` (via MCP gateway) with:
  - [ ] `channel: "bug"`
  - [ ] `message: "[watchlist-divergence-audit] DETECTED: orphans=[...], missing=[...] — re-run TASK_001 audit or review latest sync"`
  - [ ] Include raw diff JSON in the message for triage
- [ ] Tool call verified to work live (not a mock)

### AC-3: Standalone Cron Skeleton
- [ ] Integrate into the existing standalone-cron pattern (see `.claude/skills/cron-standalone-team/SKILL.md`)
- [ ] Wire up in `.claude/agents/cron-standalone-auditor-watch/flow/main.md` (or equivalent cadence agent for this TIER)
- [ ] Daily cadence (once per day at a consistent time, e.g., 06:00 UTC)
- [ ] Logged in session notebook with timestamp and exit code
- [ ] No hardcoded environment; reads `$DB_PATH` or falls back to `/app/data/market.db` (same as the running container)

### AC-4: No False Positives
- [ ] After TASK_001 lands and the write-through is live, run the audit 3 times over 24 hours
- [ ] All 3 runs must report zero divergence (if any ticket is added/removed during the window, the write-through keeps it in sync)
- [ ] Baseline: the audit runs clean against the current byte-identical 34/34/34 state (DB=file=frontend)

### AC-5: Integration Test — Negative Control (EC-5 from BA Spec)
- [ ] **CRITICAL:** Test must exercise the REAL failure mode, not just a static add-then-diff
- [ ] Steps:
  1. Call `add_to_watchlist` with a new ticker code (e.g., "TEST")
  2. Verify `system-map.json` updated immediately (file-read assertion)
  3. Verify divergence audit reports zero drift (both DB and file are in sync)
  4. Simulate a corruption-recovery reseed: call `seedWatchlist(db)` with a fresh DB connection
  5. Verify the "TEST" ticker still exists in the table (would be lost without write-through)
  6. Verify divergence audit STILL reports zero drift (file acts as recovery source)
  7. Now remove the file's entry manually (to simulate a human edit or a missed write-through)
  8. Verify divergence audit detects this and exits 1 with proper JSON
  9. Restore the file entry (cleanup), verify audit reports clean again
- [ ] This test MUST be in the codebase so it runs on CI / every re-verify
- [ ] A test that only checks add-then-diff (without the reseed step) is insufficient and will pass under the OLD one-way architecture — the reseed step is what proves write-through actually works

### AC-6: Readonly Database Access Pattern
- [ ] Script does NOT set `_journal_mode=WAL` in the SQLite connection string (critical: this re-arms the corruption vector documented in `docs/incidents/2026-08-06-sqlite-db-corruption-wai-rearm-vector.md`)
- [ ] Sets `PRAGMA busy_timeout=8000` as mandatory (architect's Blocker Q1 note: any readonly connection against `market.db` while the server is live will hit `SQLITE_BUSY` without it)
- [ ] Connection is purely readonly: `PRAGMA query_only=true` or opened with readonly flag

### AC-7: Script is Tested & Documented
- [ ] Test file: `scripts/__tests__/checks/test_watchlist-divergence-audit.ts`
- [ ] Reuses the existing `computeWatchlistDiff` test coverage; focuses on the audit's wrapper logic (exit code, Telegram wiring, JSON formatting)
- [ ] Script has a docstring header explaining its purpose, usage, and dependencies
- [ ] README or script inline help documents the expected JSON schema for both success and divergence states

---

## Files Changed

**New:**
- `scripts/checks/watchlist-divergence-audit.ts`
- `scripts/__tests__/checks/test_watchlist-divergence-audit.ts`
- `.claude/agents/cron-standalone-auditor-watch/flow/main.md` (or updates to existing cron agent if already exists — check zone)

**Modified:**
- `.claude/agents/cron-standalone-auditor-watch/init.md` (add watchlist audit to the cron roster, if new)
- Root `docs/agents/tools/list/` (register the audit if surfaced as an MCP tool — check if needed)

---

## Context & Constraints

### Why This Matters
- Write-through (TASK_001) is the primary defense against watchlist divergence
- But code always has bugs — a silent failure in the write-through could leave the file out of sync
- This audit is the **detection backstop** — catches divergence within one cycle if it happens
- BA's requirement (AC-3): audit must fire "within one cycle of the divergence"

### Critical Test Discipline (AC-5)
- Many tests of the OLD architecture would pass a simple "add a ticker, verify it's in the file" test
- Those tests would NOT catch a corrupted DB, because the DB is still healthy
- EC-5 (from BA spec) demands testing the RECOVERY scenario: add → survive a reseed → audit clean
- This is the only proof that write-through actually closes the durability gap

### Database Access Pattern
- The running `mcp-server` container has a live lock on `market.db` (WAL mode)
- Any new readonly connection MUST set `busy_timeout` or it will spuriously fail on lock contention
- Do NOT use WAL mode yourself; the container's primary connection owns that
- This script is readonly-only and intentionally lightweight (just a diff, no mutations)

### Cron Cadence
- Daily is sufficient for a detection backstop (BA spec: "audit is a detection backstop for (i′) failing silently, not the primary defense")
- More frequent cadences are overkill and waste cycles; less frequent misses days of drift
- Pick a time that avoids peak trading hours (e.g., 06:00 UTC is low-traffic)

### Reusable Exports from Prior Art
- `scripts/migrations/resync-watchlist-sysmap-2026-07-11.ts` already has the functions you need
- That script was tested for correctness on a real 2026-07-11 migration (proven ground)
- Reusing it saves testing effort and guarantees consistency with a known-good implementation

---

## Dependencies & Ordering

- **Blocks:** nothing (informational/detection only)
- **Blocked By:** TASK_001 (write-through must land and stabilize first)
- **Related:** TASK_003 (doc fix, independent)

---

## Handoff Notes for Developer

1. **Readonly discipline:** This script opens the DB in readonly mode. NEVER mutate the table inside this script — if you find divergence, report it via Telegram, not by "fixing it" in the script. The fix responsibility belongs to ops or whoever runs TASK_001's rollout checklist.

2. **Telegram wiring:** Use the gateway MCP wrapper, same as all other tools:
   ```
   mcp__gateway__call_tool(server="vn-market", tool="send_telegram", arguments={
     channel: "bug",
     message: "..."
   })
   ```

3. **Busy timeout is mandatory:** Without `PRAGMA busy_timeout=8000`, you will get spurious failures on live environments where the server is actively using the DB. The architect's Blocker Q1 note explains why; trust it.

4. **AC-5 integration test is non-negotiable:** A test that skips the reseed step will pass under the OLD architecture too (before TASK_001 landed). The reseed is what proves your fix actually works. Include it in CI.

5. **Baseline run:** Before closing this task, run the audit 3 times over 24h (once per major trading session) and confirm it reports zero drift every time. If it detects ANY drift after TASK_001 landed, that's a bug in TASK_001 or the environment — do not close this task until it's clean.

6. **Zone flexibility:** This is marked "developer or dev-mcp-server" because the script could live in either codebase zone (it's small and self-contained). The cron wiring determines where it runs; coordinate with the cron-standalone-team agent to confirm the zone.

---

## Related Reading

- **BA Spec:** `docs/handoffs/FIX-SYSTEM-MAP-WATCHLIST-STALE-34-OF-58-BA-spec.md` — see §2 (FR-3), §4 (EC-5), §6 (file plan)
- **Architect Brief:** appended to BA spec (root cause, design details, EC-5 explanation)
- **Migration Script (reuse pattern):** `scripts/migrations/resync-watchlist-sysmap-2026-07-11.ts` — especially `computeWatchlistDiff()` and `loadSsotWatchlist()` exports
- **Corruption Incident:** `docs/incidents/2026-08-06-sqlite-db-corruption-wai-rearm-vector.md` (context for WAL discipline)
- **Cron Pattern:** `.claude/skills/cron-standalone-team/SKILL.md` (how to wire standalone crons)
- **Telegram Examples:** search `send_telegram` in existing flow docs (e.g., `docs/agents/system-auditor/flow/main.md`) for call patterns

---

## Closure Checklist

Before marking this task DONE:

- [ ] All 7 ACs above verified, raw
- [ ] Script runs locally and against a test DB without spurious errors
- [ ] AC-5 integration test passes (add → reseed → verify)
- [ ] AC-4 baseline run passes 3 times over 24h (zero divergence)
- [ ] Cron wiring verified (script runs daily, logs to notebook)
- [ ] Code review approved by a peer
- [ ] Ready to hand off to QA

Then:
- Update orch-state.json: `status: DONE_VERIFIED`, `verified_at: <timestamp>`, `verified_by: developer/dev-mcp-server`
- Update TASK_001 closure note to confirm integration test paired
