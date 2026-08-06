# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · developer (continuation 4)

**Sprint goal:** cowork guaranteed-slot catch-up (see -3.md / -2.md / base for prior entries)
**Agent:** developer
**Started:** 2026-08-06T14:10:00Z
**Continuation of:** sprint-COWORK-GUARANTEED-SLOT-CATCHUP-developer-3.md (rolled proactively — that
file was at 35528/36000 bytes, 472 bytes of headroom, before this entry; writing here to avoid a
mid-entry CAP-REACHED breach on -3.md).

---

### STEP developer-S66 · developer · 2026-08-06T14:10:00Z
**task-id:** FIX-DB-INTEGRITY-SIDECAR-NAMED-VOLUME-DRIFT
**what-done:** PO QA-BLOCKING re-claim (AC-1..AC-4/AC-7 from the first pass verified still intact, untouched). New shared `scripts/lib/sqlite-wal-guard.sh` (AC-5): `wal_guard_read_uri` picks `file:<db>?immutable=1` iff `<db>-wal` is absent/0 bytes, else falls back to `file:<db>?mode=ro`. Wired into all 3 callers (db-integrity-counts.sh, db-integrity-probe.sh, db-empty-table-classify.sh), each now reports `read_mode` in its JSON. AC-6: deleted all 3 "always safe" source comments + the same claim in 3 live cron prompt docs (cron-db-data-integrity.md, register-job-db-integrity-{weekday,offhours}.md), replaced with the conditional rule. AC-7: added a regression test asserting none of the 3 scripts read journal_mode in executable code (comment-text excluded).
**what-considered:**
- Fallback strategy: checkpoint-then-retry vs mode=ro vs UNKNOWN/DEGRADED verdict — chose mode=ro (PO's own sanctioned option, already measured correct live at the exact instant immutable=1 went stale); checkpoint-then-retry rejected as an observer mutating a live production DB it should never write to; UNKNOWN/DEGRADED rejected because mode=ro reliably returns a genuinely correct answer here (same-uid direct host read, no cross-process -shm contention).
- Reproducing a non-empty -wal deterministically for tests: `coproc` (bash 4+, fails on macOS system bash 3.2, confirmed by direct trial) vs a FIFO-fed background `sqlite3 <db> < fifo` held in an open read transaction (blocks the close-triggered auto-checkpoint) — chose the FIFO approach, factored into shared `scripts/lib/sqlite-wal-hold-open-fixture.sh` reused by all 4 new test suites.
**why-decision:** mode=ro is the only option that is both a live-PO-endorsed remedy and empirically correct at the point of failure, without adding a mutation path to a read-only observer.
**why-change:** none — all 3 new PO ACs satisfied as specified; original AC-1..AC-4/AC-7 confirmed unchanged.
**verify:** deliberately reproduced non-empty `-wal` (not waited for) via the held-open-reader fixture, at 4 layers: `sqlite-wal-guard.test.sh` (15/15, incl. raw immutable=1 STALE=3 vs guarded=5), `db-integrity-counts.test.sh` (23/23, incl. T6 stale=1 vs correct=3), `db-integrity-probe.test.sh` (33/33, incl. T7 — REAL subprocess invocation proving the live script emits SPAWN/tables_changed=1 on a real committed change that a bare immutable=1 open would have silently missed as SKIP-SPAWN), `db-empty-table-classify.test.sh` (40/40, incl. T12 stale=1 vs correct=3). Also confirmed LIVE against the real `data/live/market.db` right now (`-wal`=6.6MB genuinely pending): all 3 scripts report `read_mode:"ro"` unprompted. 4 sibling suites re-run for regression: mount-drift 12/12, history-append 26/26, dedup-check 13/13 — 0 regressions (162/162 total across all 7 suites). `bash -n` clean on all touched/new files.
