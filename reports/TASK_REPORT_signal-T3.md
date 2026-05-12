# Task Report: signal-T3 — Dev-Team Step 0a SQLite SELECT Rewrite
date: 2026-05-12
outcome: APPROVED

## Scope

Doc-only change. Rewrites `.claude/flows/dev-team/main.md` Step 0a to replace the O(N) full-dir JSON fingerprint scan with a `SELECT 1 FROM signals_processed WHERE fingerprint = ? LIMIT 1` against `docs/signals/signals.db`.

## Test Results

- Unit tests: N/A (doc-only — skipped per gate spec)
- Full suite: N/A (doc-only — skipped per gate spec)
- TypeScript: N/A (doc-only — skipped per gate spec)

## DDD Compliance: N/A (doc-only)
## Security: N/A (doc-only)

## Files Patched

| File | Change |
|------|--------|
| `.claude/flows/dev-team/main.md` | +92/-17 — Step 0a rewrite (Step 0a-0 DB open, Step 0a-1 SQLite path, Step 0a-fallback deprecated section, dual-record write step 4a+4b, DELETE-based prune step 5a+5b) |
| `docs/agent-memory/notebooks/developer.md` | notebook append (cycle 38) |

## Grep Verification

| Reference | Status | Location |
|-----------|--------|----------|
| `signals.db` | PASS | lines 19, 26, 29, 35, 62, 100, 119 + more |
| `signals_processed` | PASS | lines 19, 51, 55, 67, 88, 93, 107 |
| `fingerprint` | PASS | lines 19, 53, 55, 62, 67-68, 80, 88 |
| `SELECT 1 FROM signals_processed WHERE fingerprint` | PASS | line 55 |
| Fallback-removal trigger | PASS | lines 120-122 |
| Dual-record write | PASS | step 4 / lines 70-102 |
| DB-unavailability + retry (ENOENT/SQLITE_CANTOPEN/locked 3x200ms) | PASS | line 33 |
| Cross-ref `docs/architecture-briefs/2026-05-11-signal-dedup-sqlite.md` | PASS | line 21 (file exists) |
| Cross-ref `docs/protocols/agent-chaining-protocol.md` | PASS | line 22 (file exists) |
| DELETE-based prune | PASS | line 107 |

## Architecture Brief Alignment (2026-05-11-signal-dedup-sqlite.md)

| Dimension | Brief | Flow | Verdict |
|-----------|-------|------|---------|
| Dual-record write semantics | File canonical + DB index | Steps 4a + 4b explicit | ALIGNED |
| Degraded mode — inbox files | "do NOT move to processed/" (§7) | Step 0a-fallback line 132 explicit | ALIGNED |
| Degraded mode — dedup | "process without dedup check" (§7) | Step 0a-0 catch block | ALIGNED |
| SELECT pattern | `SELECT 1 WHERE fingerprint = ? LIMIT 1` (§4) | Line 55 verbatim | ALIGNED |
| DB INSERT (new signals) | §2 schema, parameterized | Step 4b SQL PASS | ALIGNED |
| DB prune | `DELETE WHERE processed_at < datetime('now', '-7 days')` (§5) | Step 5a SQL verbatim | ALIGNED |
| Filesystem prune retained | "parallel filesystem prune RETAINED" (§5) | Step 5b | ALIGNED |
| Fallback deprecation | Implied (DB as SSOT) | Explicit DEPRECATED header + removal trigger | ALIGNED (sensible addition) |
| Retry semantics | "200ms backoff, max 3 attempts" (§7) | `locked after 3×200ms retry` line 33 | ALIGNED |

## Deviations

NONE blocking. One additive clarification:

- **Non-blocking — explicit "do not move" in fallback:** Flow adds `Do NOT move files to processed/ when in fallback mode` as an explicit statement in Step 0a-fallback. The brief §7 implies this (inbox intact) but does not state it verbatim in the fallback section. The flow makes it unambiguous. Rationale is sound — conservative and correct. NOT a blocking deviation.

## Idempotency / Safety Check

- `docs/signals/signals.db` EXISTS with 27 rows from signal-T2 backfill (cycle 37)
- Schema confirmed: `signals_processed` table, `fingerprint TEXT UNIQUE NOT NULL`, `idx_signals_fingerprint` B-tree index, `idx_signals_processed_at` index
- Next cron firing: fingerprint computed → SELECT 1 → if fingerprint in 27-row set → `skipped-duplicate-replay`, file moved with `-replay` suffix, no PO routing. SAFE
- Step 0a uses inline `bun:sqlite` pseudocode — no unshipped helper required
- T1 (`scripts/migrations/create-signals-db.ts`) EXISTS
- T2 (`scripts/migrations/backfill-signals-db.ts`) EXISTS

## Markdown Lint

- Code fences: 16 (even) — PASS
- Step numbering: 0a-0, 0a-1, 0a-fallback — consistent and valid
- Step 0b (line 139) and Step 1 (line 149) unaffected — PASS
- No broken cross-refs — PASS

## TASKS.md Changes

- `signal-T3` Backlog row (described `dedup-signals-live.ts` — a different sub-task) replaced with `signal-T4` (doc updates for agent-chaining-protocol + tree-map)
- `signal-T5` (QA integration tests) added to Backlog, unblocked by signal-T3 + signal-T4; fallback removal pre-condition documented
- `signal-T3` added to Done with merge SHA 2b643ec9

## Merge Status

- Merged: `task/signal-T3-drain-rewrite` → `main` via `--no-ff`
- Merge SHA: `2b643ec9`
- Branch deleted: `task/signal-T3-drain-rewrite`
- Unblocks: `signal-T4` (doc updates), `signal-T5` (QA integration tests)
- Fallback removal trigger: cycle 39 SQLite path success + signal-T5 pass (both required)
