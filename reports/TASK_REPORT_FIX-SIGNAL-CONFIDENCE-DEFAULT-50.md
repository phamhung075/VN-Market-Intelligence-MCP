## Task Report FIX-SIGNAL-CONFIDENCE-DEFAULT-50
date: 2026-06-19
outcome: APPROVED

changed:
  - apps/mcp-server/src/__tests__/FIX-SIGNAL-CONFIDENCE-DEFAULT-50.test.ts (new, 383L)
  - apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts (+15L)
  - apps/mcp-server/src/scheduler/news-analysis/intelligenceCycleJob.ts (+3L)
  - apps/mcp-server/src/scheduler/system/askQueueCheckJob.ts (+5L)
  - apps/mcp-server/src/scheduler/system/freshnessSlaMonitorJob.ts (+6L)

tests: 22 pass / 0 fail | tsc: 0 errors | ddd: PASS | security: PASS | mock-guard: EXIT 0

---

### Gate 1 — Test run (per-file-isolated)

```
bun test src/__tests__/FIX-SIGNAL-CONFIDENCE-DEFAULT-50.test.ts
22 pass / 0 fail / 41 expect() calls — 301ms
```

Matches dev-reported 22 pass / 0 fail. CONFIRMED.

### Gate 2 — tsc

```
cd apps/mcp-server && bun tsc --noEmit → exit 0
```

CONFIRMED.

### Gate 3 — Source change review (4 call sites)

**agentSignalTools.ts** — reads `findingDataRecord["confidence"]`, type-guards it as
`typeof x === "number"`, then `Math.min(100, Math.max(0, Math.round(rawConfidence * 100)))`.
When absent → `undefined` → spread skipped → DB DEFAULT 50 applies (honest). Not a hardcode.
PASS.

**intelligenceCycleJob.ts** (scheduler/news-analysis/) — adds
`confidence_score: Math.min(100, Math.max(0, Math.round(chain.conviction * 100)))`.
`chain.conviction` is the already-computed field in scope (logged 2 lines below in the
original code). Maps a real runtime value from the chain object. Not a hardcode. PASS.

**askQueueCheckJob.ts** — `Math.min(100, count * 10)` where `count = pending.length`.
Queue-depth derivation: more pending questions → higher urgency confidence. Semantically
honest. Not a frozen constant. PASS.

**freshnessSlaMonitorJob.ts** — `severity === "CRITICAL" ? 90 : 70`. Severity is computed
upstream from `ageMinutes / thresholdMinutes` ratio. These are policy constants tied to
a runtime-classified severity band — the same pattern as HTTP status → priority mapping.
Legitimate; not a masked frozen default. PASS.

**postSignalWithCriticGate** — not changed; confirmed to pass `...input` through, so it
inherits `confidence_score` from callers. No action required. PASS.

Column `DEFAULT 50` kept — correct; it applies only when a producer genuinely has no
confidence signal (i.e. `agentSignalTools.ts` with no `finding_data.confidence` field).

### Gate 4 — DDD compliance

`grep -rn "from.*infrastructure" src/domain/` → no output.
None of the 4 changed files are in `src/domain/`. All are interface-layer or scheduler.
No forbidden domain→infrastructure imports introduced. PASS.

### Gate 5 — Security

- `process.env` in changed files → none found.
- Hardcoded credentials / API keys / secrets → none found.
- No SQL in these diffs; all write via `postSignal()` which uses parameterised queries
  (pre-existing, not touched by this commit).
PASS.

### Gate 6 — Self-confirming test qualification

The test file uses an **in-memory SQLite DB** built with `makeDb()` (own schema). Tests
call `postSignal()` directly — they exercise the real production `postSignal` path (same
function, same store). The derivation-formula tests (agentSignalTools section, lines
185–215; askQueueCheckJob section lines 221–236; freshnessSlaMonitorJob section lines
262–279) are pure arithmetic — they replicate the production formula inline and assert
on it, making them self-confirming at the formula level. However:

- The DB round-trip tests (postSignal → getConfidenceScore) use the real production store,
  not a mock. They confirm the column write-path is wired.
- Router already live-confirmed the spread (ids 6216–6219: 85/90/78/30, none 50) from the
  real named-volume. That independently validates what these tests confirm structurally.

Qualification: self-confirming for derivation formulas (non-blocking); real store path
verified for DB write. Live ground-truth from router removes any residual concern.

### Gate 7 — Mock-guard

```
bash scripts/audits/mock-guard.sh --files "<4 production files>"
[mock-guard] PASS — no fabricated-data patterns found in production source.
exit: 0
```

No test-only mocks in production code paths. PASS.

### Issues

None.

### Merge Status

Work is already on main (commit 4f5192c5, ancestor-verified by router). No branch merge
needed. Board flip to done_verified is router's responsibility.
