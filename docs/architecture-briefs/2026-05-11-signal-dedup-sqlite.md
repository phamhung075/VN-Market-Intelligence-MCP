# Architecture Brief — Signal Dedup: SQLite Hybrid

**Date:** 2026-05-11
**Author:** agents-architect
**Status:** Ready for implementation
**Target:** agent-father

---

## 1. Architecture Decision

**Drop side (signal authors): unchanged.**
Signal files land at `docs/signals/<agent>-<ts>.json` via atomic file write. No DB dependency on the write path — any agent can drop a signal without a connection or schema concern.

**Process side (dev-team drain): SQLite becomes SSOT.**
On each drain cycle, dev-team reads each inbox file, computes fingerprint, and performs `SELECT 1 FROM signals_processed WHERE fingerprint = ? LIMIT 1`. If absent: INSERT row + move file to `processed/`. If present: move file with `-replay` suffix, skip PO routing.

**`processed/` filesystem copies: KEEP for human audit.**
Rationale: the JSON file in `processed/` is a human-readable audit artifact with zero maintenance cost. The DB row is the SSOT for dedup (indexed, O(log N)). The file is a secondary readable copy. They are complementary, not redundant. Dev-team drain writes both; neither alone is sufficient — DB for speed/correctness, file for human inspection.

Current file-based fingerprint check (scanning every `processed/*.json`) is **eliminated**. The `SELECT` replaces the full-dir scan.

---

## 2. Schema — `signals_processed`

```sql
CREATE TABLE IF NOT EXISTS signals_processed (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint     TEXT    UNIQUE NOT NULL,
  from_agent      TEXT    NOT NULL,
  to_agent        TEXT,
  type            TEXT,
  priority        TEXT,
  payload         TEXT,                          -- JSON blob (original signal.payload)
  created_at      TEXT    NOT NULL,              -- signal.createdAt (ISO 8601)
  processed_at    TEXT    NOT NULL,              -- drain cycle timestamp (ISO 8601)
  processed_by    TEXT    NOT NULL DEFAULT 'dev-team',
  result          TEXT    NOT NULL,              -- routed-to-po | skipped-duplicate-replay | skipped-stale | skipped-duplicate
  source_filename TEXT                           -- original inbox filename for traceability
);

CREATE INDEX IF NOT EXISTS idx_signals_fingerprint   ON signals_processed (fingerprint);
CREATE INDEX IF NOT EXISTS idx_signals_processed_at  ON signals_processed (processed_at);
```

**Schema decisions:**
- `fingerprint UNIQUE` enforces dedup at DB level (double-safety beyond the SELECT guard).
- `payload TEXT` stores full JSON — no separate table needed at current signal volume.
- `source_filename` maps DB row back to the `processed/` file for human audit cross-reference.
- `id` is autoincrement for ordered prune queries; `processed_at` index serves TTL pruning.

---

## 3. DB Choice — Dedicated `signals.db`

**Decision: new dedicated `signals.db` at `docs/signals/signals.db`.**

Reasoning:
- **SSOT boundary:** Signal bus is cross-team infrastructure, not alert-engine domain. Bundling into `alert-engine.db` would couple two unrelated domains and violate DDD layer separation (already enforced project-wide).
- **Blast radius:** A corrupted or locked `signals.db` does not take down the alert verdict lifecycle. Isolation protects the operational system.
- **Location coherence:** `docs/signals/signals.db` co-locates the index with the inbox it describes. The `processed/` dir and the DB live in the same folder — auditors find both in one place.
- **Migration simplicity:** Creating a new DB requires no schema migration on existing operational DBs.
- **Precedent:** The project already isolates DBs by domain (`alert-engine.db`, `stock_price.db`). This is consistent.

---

## 4. Dedup Check

```sql
SELECT 1 FROM signals_processed WHERE fingerprint = ? LIMIT 1;
```

- O(log N) via `idx_signals_fingerprint` B-tree index.
- Replaces the current O(N) full-dir scan of `processed/*.json`.
- Fingerprint algorithm unchanged: `sha256(signal.from + signal.type + JSON.stringify(signal.payload) + signal.createdAt)`.

---

## 5. Auto-Prune

Runs once per drain cycle, after all signals in the inbox batch are processed:

```sql
DELETE FROM signals_processed WHERE processed_at < datetime('now', '-7 days');
```

- Replaces current file-based prune step (`delete processed files older than 7 days`).
- The parallel filesystem prune of `processed/*.json` older than 7 days is RETAINED alongside the DB prune — both run each cycle. This keeps the two audit artifacts in sync.

---

## 6. Migration Path

One-time backfill — runs as T2 (see Task Breakdown):

```
for each file in docs/signals/processed/*.json:
  parse JSON
  extract: fingerprint, from, to, type, priority, payload, createdAt, processedAt, processedBy, result
  if fingerprint present in JSON:
    INSERT OR IGNORE INTO signals_processed (...) VALUES (...)
  else:
    recompute fingerprint from (from + type + payload + createdAt)
    INSERT OR IGNORE INTO signals_processed (...) VALUES (...)
  source_filename = basename(file)
```

- `INSERT OR IGNORE` handles re-runs safely (UNIQUE constraint).
- After backfill verified (row count matches file count), `processed/` dir contents become secondary. No delete required — files remain as archive.
- Backfill script: `scripts/migrations/backfill-signals-db.ts` (TypeScript, uses `bun:sqlite`).

---

## 7. Failure Modes

| Failure | Behavior |
|---------|----------|
| `signals.db` unavailable at drain start | Degrade: log `[dev-team] signals.db unavailable — dedup skipped this cycle`, process all inbox signals without dedup check, do NOT move to processed/, retry next cycle. Filesystem inbox remains intact. |
| DB locked (concurrent write) | Retry with 200ms backoff, max 3 attempts. On third failure: degrade as above. |
| INSERT fails (non-UNIQUE violation) | Should not occur (UNIQUE is IGNORE path). Log warning + continue. |
| Filesystem move fails after INSERT | Log error: `[dev-team] orphaned DB row for {filename} — move failed`. Row stays; inbox file stays. Manual cleanup on next cycle. |
| Backfill script fails mid-run | `INSERT OR IGNORE` makes it re-runnable. Re-run from start is safe. |

**Key invariant:** The inbox file drop path never touches the DB. Signal authors are always safe.

---

## 8. Doc Updates Required

All files agent-father must edit after implementation:

| File | Change |
|------|--------|
| `.claude/knowledge/agent-chaining-protocol.md` lines 111-137 | Replace "Processed signals move to `docs/signals/processed/`…Processed files auto-pruned after 7 days" with new dual-record model: DB SSOT + filesystem copy. Update fingerprint-check description to reference SQLite SELECT. |
| `.claude/flows/dev-team/main.md` lines 17-61 (Step 0a) | Replace step 3b (scan all processed/*.json for fingerprint) with SQLite SELECT. Update step 5 (prune) to describe DB DELETE + parallel filesystem prune. Add note on DB unavailability degradation path. |
| `.claude/knowledge/tree-map.md` | Add `docs/signals/signals.db` as child of `agent-chaining-protocol.md` node. Add to Write Ownership table: `docs/signals/signals.db` → Developer / dev-team drain. |
| `docs/data/project-stats.json` | No structural change needed; if DB file count is tracked, add `signals.db` to any DB inventory field. |

---

## 9. Task Breakdown

**Dependency order:**

```
T1 (schema) → T2 (backfill) → T3 (drain rewrite) ─┬─ T4 (doc updates)
                                                    └─ T5 (tests)
T4 and T5 run in parallel after T3 completes.
```

| Task | Description | Owner | Depends on |
|------|-------------|-------|-----------|
| **T1** | Create `scripts/migrations/create-signals-db.ts`: open `docs/signals/signals.db`, execute CREATE TABLE + CREATE INDEX statements. Idempotent (`IF NOT EXISTS`). | developer | — |
| **T2** | Create `scripts/migrations/backfill-signals-db.ts`: scan `docs/signals/processed/*.json`, INSERT OR IGNORE each row with recomputed fingerprint where missing. Log row count on completion. | developer | T1 |
| **T3** | Rewrite dev-team drain Step 0a in `.claude/flows/dev-team/main.md`: replace full-dir scan with `SELECT 1 WHERE fingerprint = ?`. Replace file-prune with `DELETE WHERE processed_at < datetime('now', '-7 days')`. Add DB-unavailable degradation path. Drain logic pseudocode must be updated in the flow file. | developer | T1 |
| **T4** | Doc updates: `agent-chaining-protocol.md`, `tree-map.md`. (Flow file is updated in T3.) | developer | T3 |
| **T5** | Tests: (a) unit — dedup SELECT returns correct result for known fingerprint; INSERT OR IGNORE on duplicate does not throw; prune deletes only rows older than 7 days. (b) integration — full drain cycle with `signals.db`: fresh signal routes to PO; re-fired signal skipped; stale signal skipped; DB-unavailable path degrades without error throw. | qa | T3 |

**Total tasks: 5**

---

## 10. Risk + Rollback

**Risk matrix:**

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| DB corruption (same class as prior SQLite issues) | Low — `docs/` is not Docker volume, not bind-mount. Pure file on macOS host. | Named-volume lessons do not apply here. No Docker process tears this file. |
| Dedup gap during migration window (T1 done, T2 not run) | Low | Keep existing file-based scan in T3 as fallback until T2 confirmed complete. Remove fallback in T3 final merge. |
| `processed/` dir and DB diverging over time | Acceptable | They are complementary, not required to be in sync. DB is SSOT for dedup; file is optional audit copy. |

**Rollback:**
- `git revert` on T3 restores file-based drain logic in the flow file.
- `DROP TABLE signals_processed` removes the DB table.
- Orphaned `processed/` files are harmless — they remain readable and the old scan logic works against them.
- No production microservice is affected — `signals.db` is agent-infrastructure only, not in any Docker service.

---

## Summary

| Dimension | Decision |
|-----------|----------|
| Drop side | Filesystem (unchanged) |
| Process SSOT | SQLite `signals_processed` table in `docs/signals/signals.db` |
| Filesystem processed/ | KEEP — human audit copy |
| Dedup check | `SELECT 1 WHERE fingerprint = ?` — O(log N) |
| Auto-prune | `DELETE WHERE processed_at < datetime('now', '-7 days')` |
| DB placement | Dedicated `signals.db` (not bundled into `alert-engine.db`) |
| Tasks | 5 (T1→T2→T3, then T4+T5 parallel) |
| Rollback | git revert T3 + DROP TABLE — zero production impact |
