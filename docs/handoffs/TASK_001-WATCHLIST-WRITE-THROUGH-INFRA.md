# TASK_001 — Watchlist Write-Through Infrastructure Adapter

**Parent Task:** FIX-SYSTEM-MAP-WATCHLIST-STALE-34-OF-58  
**Owner:** dev-mcp-server  
**Depends:** none  
**Blocked By:** none  
**Sprint:** COWORK-RELIABILITY  
**Size:** M  
**Priority:** P1

---

## Summary

Implement bidirectional watchlist sync between the SQLite `watchlist` table and `docs/data/system-map.json`. When users call `add_to_watchlist` or `remove_from_watchlist`, the mutations must write through to the file immediately, making it a durable source of truth that survives DB corruption recovery.

---

## Acceptance Criteria

### AC-1: systemMapWatchlistWriter Infrastructure Adapter
- [ ] New file: `apps/mcp-server/src/infrastructure/db/systemMapWatchlistWriter.ts`
- [ ] Exports two pure functions:
  - `upsertSystemMapWatchlistEntry(path: string, entry: WatchlistEntry): Promise<void>`
  - `removeSystemMapWatchlistEntry(path: string, code: string): Promise<void>`
- [ ] Uses the exact atomic write pattern from `alertVerdictStore.ts` (read-modify-write with `tmp` file + `renameSync`)
- [ ] Never crashes the caller (fail-open on file errors) — logs warning but does not throw
- [ ] Respects the `active !== false` filter from `deriveWatchlistSeedFromSystemMap()` (does not try to write inactive entries to DB-mirrored fields)

### AC-2: add_to_watchlist / remove_from_watchlist Write-Through Hooks
- [ ] Modify `apps/mcp-server/src/interface/mcp/tools/system/watchlist.ts`:
  - [ ] `add_to_watchlist` handler (line ~224): after SQLite INSERT succeeds, call `upsertSystemMapWatchlistEntry()` before fetching peer suggestions
  - [ ] `remove_from_watchlist` handler (line ~279): after SQLite DELETE succeeds, call `removeSystemMapWatchlistEntry()`
  - [ ] Both wrapped in try/catch — if file write fails, log warning and return a soft warning suffix in the tool response, but do NOT fail the DB mutation
- [ ] DB mutation succeeds and returns to user even if file write fails (fail-open discipline)

### AC-3: Optional `sector` Schema Parameter
- [ ] Add optional `sector: z.string().optional()` to `add_to_watchlist`'s Zod input schema
- [ ] Falls back to Title-Case `domain` string if `sector` is omitted (backward-compatible, existing callers still work)
- [ ] Write-through includes the richer `sector` text instead of a lossy `domain` collapse
- [ ] Documented in the tool's own schema docstring

### AC-4: Unit Tests
- [ ] Test file: `apps/mcp-server/__tests__/unit/test_systemMapWatchlistWriter.ts`
- [ ] Minimum 4 test cases:
  1. Upsert a new entry to a fixture JSON — verify it appears in the written file
  2. Remove an entry from a fixture JSON — verify it is deleted
  3. File write error is caught and logged, does not throw
  4. Write succeeds, file is readable afterward (round-trip verify)
- [ ] All tests pass, coverage >80% of the new module

### AC-5: Integration Test (Paired with TASK_002)
- [ ] After TASK_002 (audit script) lands, add integration case:
  - [ ] Call `add_to_watchlist` with a new ticker
  - [ ] Verify `system-map.json` updated immediately (file-read assertion)
  - [ ] Simulate a reseed cycle: call `seedWatchlist(db)` fresh
  - [ ] Verify the newly added ticker persists (reseed did not wipe it)
  - [ ] Verify divergence audit reports zero drift
- [ ] This test captures the negative-control requirement (EC-5 from BA spec)

### AC-6: No New Crashes in Existing suite
- [ ] Full `apps/mcp-server` test suite runs and passes all pre-existing tests
- [ ] The new file and modifications do not introduce regressions

### AC-7: Docker Bind-Mount Verification
- [ ] Confirm the handoff inside the container reaches the host filesystem:
  - Run `add_to_watchlist` from inside the container
  - Verify `docs/data/system-map.json` updated on the host filesystem
  - Verify the change is git-visible (not in `.gitignore`)

---

## Files Changed

**New:**
- `apps/mcp-server/src/infrastructure/db/systemMapWatchlistWriter.ts`
- `apps/mcp-server/__tests__/unit/test_systemMapWatchlistWriter.ts`

**Modified:**
- `apps/mcp-server/src/interface/mcp/tools/system/watchlist.ts` (2 call sites added)
- `apps/mcp-server/src/interface/mcp/tools/system/watchlist.ts` (schema: add optional `sector` param)

---

## Context & Constraints

### Why This Matters
- The `add_to_watchlist` / `remove_from_watchlist` tools write to SQLite but never update `system-map.json`
- During DB corruption recovery (5 incidents since April 2026), the file-only `seedWatchlist()` reseed silently discards any ticker that was never in the file
- This makes watchlist tickers added via the user-facing API permanently non-durable on recovery
- Write-through closes this gap by making the file a live mirror

### Schema Gap to Close
- `add_to_watchlist` has a closed `domain` enum but no free-text `sector` field
- `system-map.json` entries carry richer `sector` strings (e.g., "Real Estate / Property Development")
- Write-through today would lose this text; the optional parameter allows the user to provide it on new additions

### Concurrency Profile
- `add_to_watchlist`/`remove_from_watchlist` are user-facing only (zero agent flow call sites per codebase scan)
- Near-simultaneous calls are low-probability; no CAS lock is needed for initial ship
- Note as a follow-up risk if it ever actually races

### Build & Deployment
- `BUILD-STANDARD: not-applicable` — bug-fix on existing primitives, no new service or primitive class
- Full suite runs on every push (CI/pnpm verify)
- After landing, deploy with `docker compose restart technical-analysis` (separate rollout step, tracked in TASK_003 guidance)

---

## Dependencies & Ordering

- **Blocks:** TASK_002 (audit script cannot audit a non-existent write-through)
- **Blocked By:** none
- **Related:** TASK_003 (doc fix, independent, can land in parallel)

---

## Handoff Notes for Developer

1. **Review the reference pattern:** Carefully study `apps/mcp-server/src/infrastructure/fileStore/alertVerdictStore.ts:151-162` before writing `systemMapWatchlistWriter.ts`. The atomic tmp+rename pattern is non-trivial and must be exact.

2. **Bus factor:** BA's spec (§0 Blocker Q1 note) surfaces a critical finding: any new script opening `market.db` directly must NOT set `_journal_mode=WAL` in the connection string — this re-arms a known corruption vector. `watchlist.ts` already uses the container's shared DB instance, so this does not apply here, but the audit script (TASK_002) will need to remember it.

3. **Fail-open discipline:** The write-through is a durability hardening, not a blocking gate. If the file write fails (race, permission, disk full), the user's watchlist mutation has already landed in the DB — it must not be undone. Warn the user, log the error, move on.

4. **Round-trip your own AC-7:** After you land this, personally verify the bind-mount by calling `add_to_watchlist` with a curl/MCP client from *outside* the container and checking `docs/data/system-map.json` on the host. This is the end-to-end proof.

5. **Coordinate with TASK_002:** After AC-6 passes locally, hand off to dev-mcp-server or developer (whoever is doing TASK_002) and confirm they can run their own integration test that exercises the full pipeline.

---

## Related Reading

- **BA Spec:** `docs/handoffs/FIX-SYSTEM-MAP-WATCHLIST-STALE-34-OF-58-BA-spec.md` — see §1 (architecture), §1a (remedy candidates), §2 (FR-2/FR-3)
- **Architect Brief:** appended to BA spec (Blocker Q1 resolution, root cause, design details)
- **Reference Implementation (alertVerdictStore.ts):** `apps/mcp-server/src/infrastructure/fileStore/alertVerdictStore.ts:151-162`
- **Existing Migration Script (for pattern reuse):** `scripts/migrations/resync-watchlist-sysmap-2026-07-11.ts`
- **Corruption Incident:** `docs/incidents/2026-08-06-sqlite-db-corruption-wai-rearm-vector.md` (context for why durability matters)

---

## Closure Checklist

Before marking this task DONE:

- [ ] All 7 ACs above verified, raw
- [ ] AC-1 through AC-6 pass locally in CI
- [ ] AC-7 (bind-mount round-trip) verified with a real tool call from outside the container
- [ ] No regressions in the existing `apps/mcp-server` suite
- [ ] Code review approved by a peer (zone lead or architect)
- [ ] Ready to hand off to TASK_002 for integration test pairing

Then:
- Update orch-state.json: `status: DONE_VERIFIED`, `verified_at: <timestamp>`, `verified_by: dev-mcp-server`
- Move TASK_002 to READY (it was waiting on this)
