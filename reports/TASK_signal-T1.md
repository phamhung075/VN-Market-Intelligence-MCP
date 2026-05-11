# TASK signal-T1 — Create Signals DB + Schema

**Dispatch:** 2026-05-12 | **Owner:** developer | **Priority:** HIGH | **Type:** FEATURE | **Est. LOC:** ~30

---

## Brief

Create `scripts/migrations/create-signals-db.ts` to initialize `docs/signals/signals.db` with the `signals_processed` table and supporting indexes. Idempotent (IF NOT EXISTS guards).

**Architecture:** See `docs/architecture-briefs/2026-05-11-signal-dedup-sqlite.md` §2.

---

## Files to Create

```
scripts/migrations/create-signals-db.ts  (~30 LOC)
```

## Files to Modify

None (this is a migration script, not part of the active codebase).

---

## Acceptance Criteria

1. **Script opens/creates** `docs/signals/signals.db` via `bun:sqlite`.

2. **Idempotent schema creation:**
   ```sql
   CREATE TABLE IF NOT EXISTS signals_processed (
     id              INTEGER PRIMARY KEY AUTOINCREMENT,
     fingerprint     TEXT    UNIQUE NOT NULL,
     from_agent      TEXT    NOT NULL,
     to_agent        TEXT,
     type            TEXT,
     priority        TEXT,
     payload         TEXT,
     created_at      TEXT    NOT NULL,
     processed_at    TEXT    NOT NULL,
     processed_by    TEXT    NOT NULL DEFAULT 'dev-team',
     result          TEXT    NOT NULL,
     source_filename TEXT
   );
   
   CREATE INDEX IF NOT EXISTS idx_signals_fingerprint  ON signals_processed (fingerprint);
   CREATE INDEX IF NOT EXISTS idx_signals_processed_at ON signals_processed (processed_at);
   ```

3. **Execution:**
   - `bun scripts/migrations/create-signals-db.ts` opens DB + creates table + creates indexes
   - If run twice: no error, table already exists (IF NOT EXISTS guard)
   - Log output: `[create-signals-db] signals.db initialized at docs/signals/signals.db`

4. **No data side effects** — this is schema setup only. No signal data inserted.

5. **Error handling:**
   - If `docs/signals/` dir doesn't exist → fail loud with clear error (do not auto-create dir)
   - If DB file is locked → fail loud with lock timeout error
   - If CREATE TABLE fails for other reason → fail loud with error details

6. **Verification:**
   - ✓ File created: `docs/signals/signals.db`
   - ✓ Table exists: `SELECT 1 FROM sqlite_master WHERE type='table' AND name='signals_processed'`
   - ✓ Indexes exist: `SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_signals_fingerprint'`

---

## Dependencies

- **None** — this task has no upstream deps. Can run immediately.
- **Blocks:** signal-T2 (backfill requires schema to exist)
- **No new external packages** (uses `bun:sqlite`, already available)

---

## Reference

- Architecture brief: `docs/architecture-briefs/2026-05-11-signal-dedup-sqlite.md` §2 (schema definition)
- Idempotent pattern: existing migrations (e.g., `seedWatchlist.ts`)
- bun:sqlite docs: https://bun.sh/docs/api/sqlite

---

## Testing

- Run script: `bun scripts/migrations/create-signals-db.ts`
- Verify DB created + table present
- Re-run: `bun scripts/migrations/create-signals-db.ts` (should succeed, no re-init)
- Inspect: `bun bunx sqlite3 docs/signals/signals.db ".schema signals_processed"`

---

## Rollback

```bash
rm docs/signals/signals.db
# Or via bun:sqlite:
# const db = new Database('docs/signals/signals.db');
# db.exec('DROP TABLE signals_processed;');
# db.close();
```

---

## Dispatch Info

- **Assigned to:** developer (generic, scripts/ is cross-service)
- **Expected start:** immediately (no deps)
- **Expected completion:** ~30 min (straightforward schema init)
- **Next:** signal-T2 (backfill) depends on this task completing
- **Note:** This task runs in parallel with 1880a (different code zones: scripts/ vs apps/mcp-server/)
