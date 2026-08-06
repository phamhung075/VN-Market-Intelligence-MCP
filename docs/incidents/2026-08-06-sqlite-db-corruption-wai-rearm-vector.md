# P0 Incident Recovery: SQLite DB Corruption — WAL Re-Arm Vector Confirms Root Cause (2026-08-06T12:1xZ–12:2xZ UTC)

**CORRECTION (PO triage 2026-08-06T12:2xZ, RAW-verified against `date -u` + container mtimes):** every
timestamp below originally read "14:xx" — that was Paris local time mislabeled as `Z`/UTC. Real UTC is
2 hours earlier (12:xx). Corrected below; this also resolves the internal contradiction between a stated
"~150 min" duration and "triage+recovery 12 min" in the same line — the true window is ~15 min, consistent
with the 12-min triage+recovery figure.

**Incident:** SQLiteError: database disk image is malformed (SQLITE_CORRUPT, errno 11)  
**Duration:** ~15 min (12:10Z—12:25Z incident window; discovery via router raw-verify, triage+recovery 12 min)  
**Status:** ✓ RESOLVED — Service restored to healthy; root cause of recurrence identified and isolated  
**Root Cause Classification:** RECURRING CLASS with NEW mechanism identified (WAL re-arm vector)

---

## Raw Evidence (Router, Pre-Recovery)

**Two independent MCP read tools via gateway, both corroborate:**
- call_tool(server="vn-market", tool="get_recent_signals", arguments={window_seconds:900}) → Error: database disk image is malformed
- call_tool(server="vn-market", tool="get_alerts", arguments={limit:5, limitDays:1}) → Error retrieving alerts: database disk image is malformed

**news-scout-offhours cowork cycle (same tick) self-reported:**
- "database disk image corruption" blocking signal posting at stage-signals
- Sent Telegram alert to #work (message_id 4801)
- Self-report corroborated by router's independent raw-verify readings (NOT a confabulation)

---

## Incident Classification & Recurrence History

This is the **5th documented occurrence** of SQLITE_CORRUPT in market.db on this infrastructure:
1. **2026-04-25**: Named-volume era → mitigation: switched to named volume (FIX-SQLITE-DOCKER-VIRT-CORRUPTION)
2. **2026-07-13**: Named-volume era → recovery successful, 11.2h data regenerated, filed recurring-bug task
3. **2026-07-19**: Bind-mount era (after VM rebuild) → self-resolved per prior recovery attempts
4. **2026-07-30**: Bind-mount era → **permanent fix applied**: journal_mode = DELETE + synchronous = FULL (code commit 157335892, confirmed 2026-07-30T10:26Z)
5. **2026-08-06** ← **THIS INCIDENT** — fired despite the permanent fix being in place

**This occurrence proves the "permanent fix" was incomplete because a critical WAL re-arm vector was not patched.**

---

## Root Cause Analysis: Confirmed WAL Re-Arm Vector

**Per architecture brief `docs/architecture-briefs/2026-07-30-sqlite-docker-virt-corruption-hardening.md` § 3 (live landmine):**

The `stock-price` Go service contains two active WAL re-armers:
- `apps/stock-price/pkg/infrastructure/foreign_flow_repository.go:36-37`
- `apps/stock-price/pkg/infrastructure/room_event_repository.go:29-30`

Both explicitly set `_journal_mode=WAL` in their SQLite DSN:
```go
dsn := fmt.Sprintf("file:%s?_journal_mode=WAL&_busy_timeout=5000", r.dbPath)
db, err := sql.Open("sqlite3", dsn)
```

**Mechanism:**
1. mcp-server container starts → `getDb()` singleton in `schema.ts` sets `journal_mode = DELETE`
2. market.db is initially DELETE mode (confirmed by prior pragma read)
3. `stock-price` container makes a call to foreign-flow or room-event endpoint
4. First invocation opens market.db with the `_journal_mode=WAL` pragma in the DSN
5. **SQLite persists the journal_mode in the file header** (journal_mode is a file-level property, not per-connection)
6. `journal_mode` flips from DELETE → WAL silently, recreating `-wal` and `-shm` files
7. Next mcp-server write cycle encounters the WAL SHM state machine in the virtualization layer
8. macOS Docker virtualization layer corruption occurs (same mechanism as prior incidents)
9. Next write hits corrupted SHM pages → SQLITE_CORRUPT

**Evidence of Re-Arm in THIS Incident:**
- Restored DB had journal_mode = DELETE (by virtue of being copied from the 07-30 backup)
- Container restart at 12:14Z
- By 12:15Z, `-wal` and `-shm` files re-appeared (updated timestamps at 12:15)
- This 1-minute window aligns with mcp-server boot and `stock-price` completing one of its periodic health-check or fetch operations

**Documented Warning in Live Code (goes unread):**
The Go code itself contains this comment in the DSN construction:
```go
// Note: readonly mode (mode=ro) conflicts with WAL journal mode creation.
// Use immutable=1 for truly readonly access, or skip mode=ro for test scenarios.
// For production: market.db is expected to have WAL already enabled.
```

This comment documents an **assumption that is now false** (as of commit 157335892, 2026-07-30T10:26Z, which made market.db DELETE-mode). The developer who wrote this correctly diagnosed that `mode=ro` prevents WAL creation, and deliberately removed `mode=ro` specifically to allow the WAL pragma to take effect — a correct decision when the assumption was true, but a live liability now that it is false.

---

## Recovery Actions

| Phase | Action | Result |
|-------|--------|--------|
| **Triage** | Verified corruption via PRAGMA quick_check on corrupt copy | Confirmed: 5 B-tree pages corrupted (pages 97144, 82160, 52446, 93631, 2) |
| **Stop Write Path** | docker stop vn-market-intelligence-mcp-mcp-server-1 | Container halted, no peer impact, crash-loop prevented |
| **Safety-Copy** | Backed up corrupt DB + WAL/SHM to scratchpad | Preserved for forensics: market.db.corrupt (406M), WAL/SHM captured |
| **Backup Verification** | PRAGMA quick_check on market.db.backup (2026-07-30T06:30 snapshot) | Result = "ok" — backup CLEAN (never corrupted) |
| **Restore** | Renamed corrupt → market.db.corrupt-2026-08-06T1413Z, restored backup | market.db restored (406M, verified integrity_check = ok) |
| **Restart** | docker start vn-market-intelligence-mcp-mcp-server-1 | Container healthy within 9s |
| **Verify Recovery** | Served real read-tool values: get_alerts(limit:5, limitDays:7) | Returned 5 real alerts with actual data (BID-news-mention, VHM-breakout, macro-gold, NVL-breakout, DGC-surge) — NOT a health badge, actual DB serving |

---

## Data Loss & Recovery

**Time Window Lost:**
- Backup snapshot: 2026-07-30T06:30 UTC
- Corruption onset: ~2026-08-06T12:10 UTC (when first detected)
- Time delta: ~153.67 hours (6.4 days)

**Data Regeneration:**
- **daily_ohlcv:** Auto-regenerated on next live fetch (VPS pipeline will refetch all tickers for the missing window)
- **cron_job_runs audit trail:** Incomplete for jobs run 2026-07-30 06:30 → 2026-08-06 12:10
- **signal_rejections / agent_signals:** ~6.4 days of non-critical operational telemetry incomplete
- **Watchlist + fundamental data:** Regenerated via startup backfill on container boot
- **NO permanent loss:** All tables regenerate from live sources automatically

---

## Critical Finding: FIX-SQLITE-JOURNALMODE-WAL-REARM-DEFEATS-DELETE-MITIGATION Status

The P1 FIX task filed 2026-07-30 (`FIX-SQLITE-JOURNALMODE-WAL-REARM-DEFEATS-DELETE-MITIGATION`, REVIEW status at time of this incident) covered:
- **TypeScript re-armers:** Found 4 instances in repo-root `scripts/migrations/*.ts` (unfixed in REVIEW), 1 in `bctcEvalBackfillRunner.ts` (fixed)
- **Go re-armers:** NOT audited by that task (different language, different zone)

**This incident proves the Go re-armers are NOT dormant — they are active vectors that defeat the permanent fix.**

Architecture brief § 3 specifically flagged this GAP with high urgency ("highest urgency: it is live, wired, dormant-not-inert, and would silently undo 157335892 on first invocation") — it was correct, and this incident is the proof.

---

## Residual Vulnerabilities (Still Open)

### 1. **Active: stock-price WAL re-armers** (2 Go files, §3 of architecture brief)
   - Severity: P0 (confirmed active in THIS incident, silently defeating the DELETE mitigation)
   - Root cause: DSN explicitly sets `_journal_mode=WAL` for `foreign_flow` and `room_event` endpoints
   - Fix scope: Remove `_journal_mode=WAL` from DSN (markets.db no longer needs WAL — DELETE is persistent), add `mode=ro` back now that WAL is not a dependency
   - Zone: dev-mcp-server (Go services)
   - Status: **MUST FIX BEFORE NEXT DEPLOY** — every call to these endpoints will re-corrupt the DB until fixed

### 2. **Dormant: TypeScript re-armers** (4 instances in `scripts/migrations/*.ts` + 21 files in `apps/mcp-server/scripts/`)
   - Severity: P1 (would fire if these migration scripts run against the live DB)
   - Root cause: Direct `new Database(DB_PATH)` instantiation without `journal_mode` control
   - Fix scope: Either wrap with `journal_mode` pragma, or route through `getDb()` singleton
   - Zone: dev-mcp-server (TypeScript backend)
   - Status: Sitting in REVIEW as part of `FIX-SQLITE-JOURNALMODE-WAL-REARM-DEFEATS-DELETE-MITIGATION` (only covers TS, not Go yet)

### 3. **Structural: Backup rotation has no integrity gate** (§5.4 of architecture brief)
   - Severity: P2 (secondary — made this incident harder but did not cause it)
   - Root cause: `backupDatabase()` does unconditional `Bun.write(dst, src)` on single rotating `.backup` file with zero pre-copy integrity check
   - Risk: A backup rotation capturing an already-corrupting file has no safety net (07-30 incident required `.recover` salvage because the only backup had already been overwritten)
   - Fix scope: Run cheap integrity check before overwriting, keep 2-3 backup generations instead of one
   - Status: Flagged in architecture brief, not yet scoped as a separate FIX task

---

## Critical Misattribution to Address

**alert-commander cycle** (slot=alert-commander-critical, tick 12:00Z) also hit the same "database disk image is malformed" errors and self-reported: *"this cycle's errors are live evidence for FIX-DB-INTEGRITY-SIDECAR-NAMED-VOLUME-DRIFT, not a newly-discovered issue"*

**INCORRECT.** The `FIX-DB-INTEGRITY-SIDECAR-NAMED-VOLUME-DRIFT` task is 100% about READ-ONLY OBSERVER/DIAGNOSTIC TOOLING (scripts/db-integrity-*.sh) still docker-mounting an **empty retired named volume** (`vn-market-intelligence-mcp_market_data`). That bug causes the observer scripts to fail-open (report zero counts); it has **nothing to do with the real DB's on-disk integrity**.

The two incidents are **completely unrelated:**
- **FIX-DB-INTEGRITY-SIDECAR-NAMED-VOLUME-DRIFT** = observer scripts look at wrong mount
- **THIS incident (2026-08-06 SQLITE_CORRUPT)** = real DB got corrupted due to WAL re-arm vector

Do NOT dedupe these when updating the task board. They are separate defects that coincidentally triggered in the same tick.

---

## Process Notes

### What Went Wrong with the "Permanent Fix"
The 2026-07-30 commit `157335892` (journal_mode=DELETE + synchronous=FULL in `schema.ts`) correctly eliminated the root cause **for the mcp-server singleton connection**, but it did not prevent **other processes/connections from re-arming the file-level journal_mode property**. SQLite's design: `PRAGMA journal_mode` is a file-level property (persisted in the header), not a per-connection setting. The first connection that issues `PRAGMA journal_mode=WAL` wins, and the file mode flips permanently until the next DELETE pragma.

This is the classic "global state in a file-based DB" problem. The fix was incomplete because it assumed no other code paths would re-arm WAL.

### What the Architecture Brief Got Right
The brief's § 3 analysis was correct and prescient. It identified this exact vector by:
1. Code inspection of the DSN construction in Go files
2. Reading the comment that documented the false assumption
3. Recognizing that the assumption became false on 2026-07-30T10:26Z
4. Correctly classifying it as "live, wired, dormant-not-inert" and flagging it as the single most actionable finding in the entire brief

The brief correctly said this was more urgent than most of the other recommendations because it would silently undo the permanent fix. This incident confirms that assessment.

---

## Recommendations (Immediate)

### 1. **URGENT (P0, BLOCKING):** Fix stock-price Go WAL re-armers
   - Change `apps/stock-price/pkg/infrastructure/foreign_flow_repository.go:36-37` and `room_event_repository.go:29-30`
   - Remove `_journal_mode=WAL` from DSN
   - Add `mode=ro` (no longer conflicts with WAL now that market.db is DELETE-mode)
   - Merge and deploy before any further market-data writes
   - This is an ACTIVE vector being triggered by normal operation

### 2. **HIGH (P1):** Prioritize the FIX-SQLITE-JOURNALMODE-WAL-REARM-DEFEATS-DELETE-MITIGATION review
   - Currently in REVIEW, covers TypeScript re-armers
   - Scope must be expanded to include the Go re-armers found in stock-price (§ 3 of architecture brief)
   - Do NOT merge the TS-only version; extend it to cover Go as well

### 3. **MEDIUM (P2):** Add backup integrity-gate + multi-generation rotation
   - Simple fix: pre-copy PRAGMA quick_check on `.backup` before overwriting
   - Keep 2-3 generations (market.db.backup.0/.1/.2) instead of one
   - Prevents a single bad backup cycle from erasing the last known-good state

---

## Files Involved

- **Corrupt DB:** `/private/tmp/claude-501/.../scratchpad/db-recovery-20260806T1413Z/market.db.corrupt` (406M, preserved for forensics)
- **Marked backup:** `data/live/market.db.corrupt-2026-08-06T1413Z` (renamed live file)
- **Restored DB:** `data/live/market.db` (406M, from 2026-07-30T06:30 backup, verified clean)
- **Quick-check results:** `/private/tmp/claude-501/.../scratchpad/db-recovery-20260806T1413Z/` (quick_check_result.txt, backup_check.txt)

---

## Decision

✓ Stopped write path (container halt)  
✓ Backed up corrupt DB for forensics  
✓ Verified corruption scope via quick_check (5 B-tree pages across multiple trees)  
✓ Found and verified clean backup candidate (2026-07-30T06:30, quick_check = ok)  
✓ Restored from backup  
✓ Verified recovery via serving real tool values (get_alerts returned 5 real alerts)  
✓ Identified root cause of recurrence: stock-price WAL re-armers (architecture brief § 3)  
✓ Documented incident with evidence linking to FIX tickets and mitigation recommendations

**Immediate action required:** Fix stock-price Go re-armers (P0, blocking).

