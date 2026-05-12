## Task Report signal-T5

**Task:** signal-T5 — QA integration tests for full SQLite signal dedup drain cycle
**Merge SHA:** fc1061e1
**Branch:** task/signal-T5-qa-tests (deleted)
**Date:** 2026-05-12

---

### AC Table

| AC | Description | Result |
|----|-------------|--------|
| AC-T5.1 | Fresh signal: SELECT path → pendingSignals includes signal, `routed-to-po` result, DB row created, inbox file consumed | PASS |
| AC-T5.2 | Replay duplicate: second cycle → `skipped-duplicate-replay`, file moved with `-replay` suffix, NO new DB row (count stays 1) | PASS |
| AC-T5.3 | INSERT OR IGNORE idempotency: double-insert same fingerprint → no throw, count remains 1 | PASS |
| AC-T5.4 | Prune TTL 7d: rows with `processed_at < datetime('now', '-7 days')` deleted; recent row survives; filesystem old files removed; recent file preserved | PASS |
| AC-T5.5 | DB-unavailable degraded path: null DB → `warnLogged=true`, inbox files untouched (not moved), `pendingSignals=[]`, processed/ empty | PASS |
| AC-T5.6 | Stale skip (24h): signal with `createdAt` 48h ago → `skipped-stale`, file moved with `-stale` suffix, no PO routing, no DB row | PASS |

---

### Test Results

```
bun test scripts/migrations/__tests__/signal-T5-dedup-integration.test.ts

 6 pass
 0 fail
 38 expect() calls
Ran 6 tests across 2 files. [494.00ms]
```

### TSC

```
bun tsc --noEmit (from apps/mcp-server/)
Exit: 0 errors
```

### DDD Scan

No `from.*infrastructure` imports in test file. PASS.

### Security Scan

No `process.env`, no hardcoded passwords/secrets/tokens. PASS.

---

### Implementation Notes

- **Test placement:** `scripts/migrations/__tests__/signal-T5-dedup-integration.test.ts` — matches signal-T1/T2 convention (not `apps/mcp-server/src/__tests__/`). Justification: imports from `scripts/migrations/` helpers; no MCP server dependency; no `bunfig.toml` preload required.
- **Test isolation:** Each test uses `mkdtempSync` temp root with isolated `inbox/` and `processed/` subdirs. DB is `:memory:` per test. `afterEach` tears down via `rmSync --recursive`.
- **`computeFingerprint` reuse:** Imported from `scripts/migrations/backfill-signals-db.ts` per spec.
- **`runDrainCycle` helper:** Self-contained drain logic implemented in the test file — models Step 0a logic from `.claude/flows/dev-team/main.md` without importing any production flow code (which is pseudocode in a `.md` file, not executable TypeScript).

---

### Fallback Removal Eligibility

Per `.claude/flows/dev-team/main.md` Step 0a-fallback (lines 120-122):

> Removal trigger: after 2 consecutive drain cycles where the SQLite path completes without error.
> Current status: cycle 38 = "cycle 1 post-T2 backfill". Removal eligible after cycle 39 success.
> Pre-condition: signal-T5 (QA integration tests for dedup SELECT + INSERT + prune) must pass.

**Pre-condition MET:** signal-T5 passes (6/6 ACs). The fallback removal trigger is now unblocked on the test side. Eligibility requires one additional clean drain cycle (cycle 39) where the SQLite path completes without error. After cycle 39 confirmation, the fallback path at flow lines 117-133 may be removed.

---

### Verdict

**APPROVED** — 6/6 ACs pass, TSC 0 errors, DDD PASS, Security PASS. Merged fc1061e1 to main. Branch deleted.
