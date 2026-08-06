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

### STEP developer-S67 · developer · 2026-08-06T14:50:40Z
**task-id:** FIX-NOTEBOOK-COMPOSE-SCRIPT-ACTUATOR
**what-done:** New `scripts/notebook-compose.sh` (AC-1..AC-5): mechanical compose actuator taking only the new-section text, mktemp+mv settled write. Extracted `notebook-auto-prune.sh`'s direction-vote/tie-break logic into shared `scripts/agents-flow/lib/notebook-section-direction.sh` (AC-2 reuse, not reimpl) — auto-prune re-wired to source it, 8/8 unchanged.
**what-considered:**
- Reuse strategy: literal `source` of `notebook-auto-prune.sh` (rejected — it's a hook, executes on load, not a library) vs extracting a shared `lib/` file (chosen — matches existing `lib/hook-guard.sh` precedent, both scripts now call the SAME function).
- Belt-and-suspenders pre-write invariant check (heading-count arithmetic + byte-identity of every retained section) vs trusting the mechanical algorithm alone — chose to build the check IN, so AC-4 "structurally unreachable" is enforced by code, not just true-by-construction.
**why-decision:** a second divergent copy of the direction algorithm is exactly the AC-2 board row forbids; an in-script pre-write check is strictly stronger than agent-father's interim post-write-then-revert guard it supersedes.
**why-change:** none — AC-1..AC-6 satisfied as specified; AC-2b (sub-block intra-prune) added self-derived direction (not literally required but the correctness-safe reading of "reuse the tie-break logic").
**verify:** `bash -n` clean, shellcheck clean (info-only SC1091, pre-existing-pattern SC2295). `notebook-compose.test.sh` 9/9 incl. T1 = real replay of the `0fcc6a5d2` shape (PRE_COUNT=2, 0 drops needed, file grows) asserting all 3 headings present, c44 byte-intact. `notebook-auto-prune.test.sh` 8/8 unchanged post-refactor (zero regression). Manual smoke test against a copy of the REAL `docs/agent-memory/notebooks/system-auditor.md` (200L, 3 real sections) — retained sections byte-identical (only trailing-blank-line normalization, which `_notebook_section_hashes` already trims before hashing — confirmed safe re: AC-2a). Caught + fixed 2 real bugs during authoring: command-substitution trailing-newline stripping silently undercounting lines/bytes in the cap-check loop, and `grep -c ... || echo 0` double-printing "0\n0" on the zero-match case (both fixed, covered by the passing suite).
