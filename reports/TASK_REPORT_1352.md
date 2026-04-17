# TASK_REPORT_1352 — test(ohlcv-startup-probe): TDD tests for runOhlcvStartupProbe

| Field        | Value                                      |
|--------------|--------------------------------------------|
| Task         | 1352                                       |
| Branch       | task/1352-ohlcv-startup-probe-tdd          |
| Sprint       | 119                                        |
| Reviewer     | QA                                         |
| Date         | 2026-04-17                                 |
| Verdict      | PASS                                       |

---

## Pipeline Results

| Step                        | Result | Notes                                       |
|-----------------------------|--------|---------------------------------------------|
| Unit tests (1352)           | RED 5/5 | All 5 TDD tests fail — correct RED state   |
| Full regression             | 4936 pass / 5 fail | 5 = 1352 stubs; pre-existing OCR e2e fail unchanged |
| TypeScript strict           | PASS   | `bun tsc --noEmit` clean                   |
| DDD compliance              | PASS   | No infra/application imports in domain/    |
| Security scan (process.env) | PASS   | `process.env["DB_PATH"]=":memory:"` is established test-suite pattern (3+ prior files); not production code |

---

## RED State Verification

All 5 tests fail with `NOT_IMPLEMENTED — task 1353 will provide the real implementation` (thrown by the stub). TC-4 additionally fails `.not.toThrow()` because the stub throws unconditionally — correct, expected RED state.

---

## Test Quality Assessment

| TC  | Scenario                              | Assertions                                      | Quality |
|-----|---------------------------------------|-------------------------------------------------|---------|
| TC-1 | 2 sparse tickers (FPT=5, VCB=0)      | calls.length=1, msg contains FPT(5)/VCB(0)/backfill-script, result.sparseTickers.length=2, sent=true | Good |
| TC-2 | All tickers >= 8 rows                | calls.length=0, sparseTickers.length=0, sent=false | Good |
| TC-3 | Empty watchlist                      | calls.length=0, sparseTickers.length=0, sent=false | Good |
| TC-4 | DB error (watchlist table dropped)   | no throw, calls.length=0, result.sent=false    | Good |
| TC-5 | Boundary: 7 rows=sparse, 8 rows=ok   | Dual-DB test covering both sides of threshold  | Good |

Boundary condition (TC-5) explicitly tests both sides of the sparse threshold (< 8). Message content check (TC-1) pins the alert format. Error resilience (TC-4) ensures the probe never crashes the scheduler.

---

## Interface Contract (stub → impl handoff)

```typescript
interface OhlcvStartupProbeDeps {
  db?: Database;
  sendWorkFn?: (msg: string) => Promise<boolean>;
}
interface OhlcvStartupProbeResult {
  sparseTickers: Array<{ code: string; count: number }>;
  sent: boolean;
}
```

Stub types align with all test call sites. Task 1353 must implement against this contract without modifying the interface.

---

## DDD Layer

`src/scheduler/ohlcvStartupProbe.ts` lives in the `scheduler` layer (outermost). Accepts injected `db` + `sendWorkFn` — no hidden infrastructure imports in stub. Dependency injection pattern is correct for testability.

---

## Issues

None.

---

## Decision

PASS — branch ready for task 1353 (implementation). No merge required for a TDD-only task; branch stays open for the implementation commit.
