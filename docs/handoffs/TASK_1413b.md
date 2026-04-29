# TASK 1413b — ADR: ForeignFlow Circuit Breaker Recurring Failure

**Date:** 2026-04-29
**Agent:** architect
**Type:** Architecture Decision Record (ADR)
**Status:** APPROVED — developer may proceed
**Gated by:** Recurring bug escalation rule (5th fix attempt: tasks 1384, 1392, 1403, 1404, 1407)

---

## 1. Prior Fix Commit History

```
56d99482  fix(1404): add foreignFlow CB startup reset after 60s delay
b56cdf85  fix(1407): foreign flow CB three-fix — market-hours gate, reset tool, 10min HALF_OPEN backoff
4022ddb4  qa(1407): fix test assertions for foreignFlow CB resetTimeoutMs=600_000
4a9d5d5e  merge(1407): foreignFlow CB — market-hours gate + reset tool + 10min HALF_OPEN backoff
e5d7f498  fix(1403): CB OPEN→HALF_OPEN→OPEN cycle + vps_service_health idle constraint
b691b6cb  fix(1392): remove CB wrapping from GET fetcher — probe 404 no longer re-opens circuit
de1e2dd5  fix(1392): remove CB wrapping from GET fetcher (second attempt)
abc4b5ea  fix(1388): foreignFlow CB auto-resets after DB fix via halfOpenMaxAttempts=1
c5ea6296  fix(france-msg-quality): task 1384 — message quality fix (first CB-related incident)
```

---

## 2. Root Cause

The `foreignFlow` circuit breaker guards `upsertForeignFlow()` in the VPS push
handler (`POST /api/push-foreign-flow`, file
`apps/mcp-server/src/interface/mcp/routes/pushForeignFlowHandler.ts`, line 196).
It is a standard count-based CB: open after 5 consecutive DB write failures,
reset timer of 10 minutes, `halfOpenMaxAttempts: 1`.

The structural problem is that **the CB guards a write path that is exclusively
driven by the external VPS push schedule**, and the VPS pushes data only during
VN market hours (02:00–08:59 UTC Mon–Fri). This creates two failure modes that
all five prior fixes treat as separate bugs but share the same root mechanism:

**Mode A — off-hours failure accumulation (pre-Task 1407).**
The `foreignFlowFetcherJob` cron fired every 60 s around the clock. Outside
market hours the VPS is silent. The job still attempted a GET probe to a
non-existent VPS endpoint, or the push handler tried `upsertForeignFlow` on
empty data. Failures accumulated in the CB while the market was closed. By
market open the CB was already OPEN, blocking the first real session entirely.
Task 1407 addressed this with a market-hours gate in `runForeignFlowFetcherJobCron`.

**Mode B — stuck OPEN during market hours (all tasks).**
When `upsertForeignFlow` fails (DB constraint, migration timing, transient error),
the CB trips to OPEN. Once OPEN:

1. The push handler immediately returns HTTP 503 to the VPS on every incoming
   push (line 171–185 of pushForeignFlowHandler.ts).
2. The CB can only recover by entering HALF_OPEN (after 10 min timeout) and
   receiving one successful DB write.
3. But the HALF_OPEN probe does not self-trigger — it requires an inbound VPS
   push to drive the `breakers.foreignFlow.execute()` call at line 196.
4. If the VPS is in a retry back-off or has stopped pushing (because it received
   repeated 503s), no probe ever arrives.
5. The CB stays OPEN indefinitely until: (a) a Docker restart, (b) the startup
   60s reset timer fires, or (c) the MCP `reset_foreign_flow_circuit_breaker`
   tool is called manually.

**The CB is structurally passive: it can only recover if the system that caused
it to open voluntarily retries.** The VPS stops retrying after repeated 503s.
The 60s startup reset (Task 1404) fires once at boot and never again. The
market-hours gate (Task 1407) prevents Mode A accumulation but does nothing once
the CB is OPEN inside a trading session.

There is a secondary aggravator: the `resetTimeoutMs` timer is reset every time
`_openCircuit()` is called (line 228: `this._openedAt = new Date()`). During
Mode B, every half-open probe that fails calls `_openCircuit()`, restarting the
10-minute clock. If the VPS retries at intervals shorter than 10 min (which it
does — it pushes every ~60 s and the 503 response does not instruct it to back
off), the HALF_OPEN window may be reached, a probe attempted, it fails, and the
clock resets to another 10 min. Each failed probe extends the outage.

---

## 3. What Each Prior Fix Attempted and Why It Failed

### Task 1384 (Apr 28, morning) — message quality fix
Not a CB fix. First incident flagged. The CB had 168 failures. No architectural
change. Failure persisted.

### Task 1388 — `halfOpenMaxAttempts: 1`
Rationale: reduce the number of successful probes needed to close from 2 to 1,
allowing faster auto-recovery. This was correct and remains in the config.
Why it did not fully fix: the HALF_OPEN state still requires an inbound push to
arrive within the HALF_OPEN window. If the VPS has backed off, no probe fires.

### Task 1392 — remove CB from GET fetcher path
Rationale: the GET path was accidentally wrapping a 404-producing probe inside
`execute()`, causing every scheduled cron tick to re-open the CB via `_onFailure`.
The fix was correct and necessary. It eliminated Mode A's probe loop.
Why it did not fully fix: Mode B (push-path failures) remained untouched. The CB
on the write path can still be tripped by DB failures and then stay OPEN because
the VPS stops pushing after 503s.

### Task 1403 — `vps_service_health` idle constraint + service restart
Rationale: fixed the DB schema bug that caused `upsertForeignFlow` to throw on
every push (UNIQUE constraint on `code` column conflicting with `ON CONFLICT(code,
date)`). This was the original root cause that tripped the CB to OPEN.
Why it did not fully fix: the UNIQUE constraint fix prevents the CB from being
tripped again by that specific bug, but provides no recovery mechanism for the
current OPEN state, and no protection against future DB failures.

### Task 1404 — startup 60s CB reset
Rationale: if the CB is OPEN at container startup, a one-shot reset after 60s
clears it so the VPS's first post-boot push succeeds.
Why it did not fully fix: the reset fires once at startup only. A CB trip that
happens mid-session (e.g. during trading hours, caused by a transient DB error
or a new schema bug) has no automatic recovery mechanism. The startup reset does
not help for in-session OPEN states.

### Task 1407 — market-hours gate + 10min timeout + MCP reset tool
Rationale: gate the fetcher cron to skip outside market hours (eliminates Mode A);
increase timeout from 5 to 10 min (reduces HALF_OPEN probe frequency); add MCP
tool for manual reset.
Why it did not fully fix: the market-hours gate only prevents off-hours failure
accumulation. Once the CB is OPEN during market hours, the VPS stops receiving
HTTP 200 responses (it gets 503), it backs off, and no more pushes arrive to
drive the HALF_OPEN probe. The 10min timeout merely delays the HALF_OPEN window;
it does not guarantee the VPS will push again once that window opens.

---

## 4. The True Root Cause (one paragraph)

The `foreignFlow` circuit breaker is placed on a **passive write endpoint** that
has no self-healing probe. Standard CB pattern assumes the caller retries on its
own schedule; here the caller is an external VPS that treats HTTP 503 as a
terminal signal and backs off. Once the CB opens, it severs the only path by
which HALF_OPEN probes can arrive, making recovery impossible without external
intervention. Every prior fix attacked a symptom (wrong accumulation path, too
short timeout, no reset tool) without addressing the structural gap: the CB has
no active self-probe mechanism and the VPS has no documented retry strategy after
503.

---

## 5. Recommended Approach

Three options are listed in order of invasiveness. Option B is recommended.

---

### Option A — Periodic Active Self-Probe (Minimal Change)

**What:** Add a recurring task (fired by the existing scheduler, every 5 min,
during market hours only) that, when `breakers.foreignFlow.state === 'open'` or
`'half-open'`, performs a lightweight health-check write to the DB (e.g. a
`SELECT 1` or a no-op upsert of a sentinel row) and calls `breakers.foreignFlow`
success/failure accordingly. If the DB is healthy the CB closes; if not, the
failure count increments naturally.

**Trade-offs:**
- Pro: minimal surface area — no changes to push handler, CB class, or VPS.
- Pro: completely isolated from the VPS push cadence.
- Con: the sentinel write is artificial; a healthy `SELECT 1` does not prove the
  real upsert path is healthy.
- Con: adds a cron job that runs only to manage CB state — conceptually a smell.
- Risk: if the sentinel check is misconfigured, it could artificially keep the CB
  closed when the real path is broken.

**DDD layer:** new job in `apps/mcp-server/src/scheduler/market-data/` (interface
layer). No domain changes.

---

### Option B — Exponential Backoff + Active VPS Retry Notification (Recommended)

**What:** Two coordinated changes:

1. **Active CB probe in the push handler.** When the push handler receives a
   request and the CB is OPEN, instead of immediately returning 503, check if the
   reset timeout has elapsed (i.e. `breakers.foreignFlow.state` already equals
   `'half-open'` after `_checkTimeout()`). If so, allow the DB write to proceed
   through `execute()` as a probe. This is already how `execute()` works — the
   bug is the early-return guard at line 171–185 of `pushForeignFlowHandler.ts`
   which checks the state *before* calling `execute()`, bypassing `_checkTimeout()`
   and the natural HALF_OPEN probe opportunity. Removing the early-return guard
   and letting `execute()` manage the state machine is the correct fix.

2. **VPS-side retry header.** When the CB is OPEN and the handler returns 503,
   include a `Retry-After` header indicating when the CB will next enter
   HALF_OPEN (`resetTimeoutMs - elapsed` seconds). The VPS script can read this
   header and schedule its next push accordingly.

**Trade-offs:**
- Pro: fixes the structural gap with minimal code change — one guard removal in
  the push handler (lines 169–185).
- Pro: the HALF_OPEN probe fires on the first VPS push after the reset window,
  exactly as the CB was designed.
- Pro: `Retry-After` header is a standard HTTP mechanism; requires minor VPS
  script change but makes retry timing explicit.
- Con: requires a coordinated VPS-side change. If the VPS ignores `Retry-After`,
  the fix still works (Mode B recovery becomes timing-dependent again, but no
  worse than today).
- Risk: if the underlying DB error is not fixed (e.g. a new schema bug), the
  probe will fail and the CB will re-open — but this is correct CB behaviour, not
  a regression.

**DDD layer:** change is entirely in `apps/mcp-server/src/interface/mcp/routes/pushForeignFlowHandler.ts` (interface layer). No domain or infrastructure changes.

---

### Option C — Persistent CB State (Heavy)

**What:** Persist CB state (`state`, `failures`, `openedAt`) to SQLite. On
restart, restore the persisted state instead of always starting CLOSED. Add a
periodic health-check job that drives HALF_OPEN recovery independent of VPS
pushes.

**Trade-offs:**
- Pro: survives Docker restarts with full state continuity.
- Con: large surface area (new DB table, migration, CB class changes, new cron job).
- Con: the restart-reset (Task 1404) was considered a feature — starting CLOSED
  on restart is desirable after a known bad state.
- Risk: DDD violation if persistence logic leaks into the `CircuitBreaker` class
  (domain layer would import infrastructure).

**Not recommended** for this issue. The problem is not state persistence; it is
the passive recovery model.

---

## 6. Exact Files to Change

### Recommended: Option B

#### File 1 — `apps/mcp-server/src/interface/mcp/routes/pushForeignFlowHandler.ts`

**Remove** the early-return guard block at lines 169–185 (the block that checks
`breakers.foreignFlow.stats.state === "open"` and returns 503 before calling
`execute()`). The `execute()` call at line 196 already handles the OPEN state by
throwing `CircuitOpenError`. The 503 response should be returned from the `catch`
block that handles `CircuitOpenError`, not from a pre-flight state check.

Concretely:

1. Delete lines 169–185 (the `circuitBreakerState === "open"` early return block).
2. In the `catch (dbErr)` block (currently line 197), add a branch:
   ```typescript
   if (dbErr instanceof CircuitOpenError) {
     res.writeHead(503, { "Content-Type": "application/json" });
     const retryAfterSec = Math.ceil(
       (breakers.foreignFlow.stats.resetTimeoutMs - (Date.now() - /* openedAt */ 0)) / 1000
     );
     res.setHeader("Retry-After", String(Math.max(retryAfterSec, 60)));
     res.end(JSON.stringify({ error: "Service temporarily unavailable" }));
     return;
   }
   ```
   Note: `CircuitBreakerStats` does not currently expose `openedAt` (it is `null`
   when not open). A safe fallback is to use `resetTimeoutMs` as the full
   `Retry-After` value when `openedAt` is unavailable.

3. Import `CircuitOpenError` from `circuitBreaker.js` at the top of the file.

This single change allows the CB's built-in HALF_OPEN state machine to function
correctly: `execute()` calls `_checkTimeout()` first, which transitions
`open → half-open` if the timeout has elapsed, then allows the function to run
as a probe.

#### File 2 — `apps/mcp-server/src/infrastructure/circuitBreaker.ts`

Expose `openedAt` in `CircuitBreakerStats` so the push handler can compute an
accurate `Retry-After` value:

```typescript
export interface CircuitBreakerStats {
  // ... existing fields ...
  /** ISO timestamp when circuit was opened, null if not open */
  openedAt: string | null;
}
```

The `stats` getter already has the `openedAt` value; it currently nullifies it
when `state !== 'open'`. Change the condition so it returns the value when open.
This is a one-line change in the `stats` getter.

#### File 3 — VPS script (optional but recommended)

In `vps-scripts/vn-foreign-flow/` (whichever script pushes to
`/api/push-foreign-flow`), read the `Retry-After` response header on 503 and
sleep for that duration before retrying, instead of using a fixed retry interval.

---

## 7. Test Plan

All tests must pass before merge. The developer must add:

### New tests — `apps/mcp-server/src/__tests__/1413b-cb-halfopen-probe.test.ts`

| ID | Scenario | Assertion |
|----|----------|-----------|
| 1413b-1 | CB is OPEN, resetTimeout has NOT elapsed, push handler receives request | Returns 503 + `Retry-After` header, `_onFailure` NOT called |
| 1413b-2 | CB is OPEN, resetTimeout HAS elapsed (state becomes HALF_OPEN on first `.execute()` call), push succeeds | CB transitions to CLOSED; push handler returns 200 |
| 1413b-3 | CB is OPEN, resetTimeout HAS elapsed, push DB write fails | CB re-opens (`openedAt` reset to now), push handler returns 503 |
| 1413b-4 | CB is CLOSED, push DB write fails 5 times consecutively | CB opens; 6th push returns 503 |
| 1413b-5 | `CircuitBreakerStats.openedAt` is non-null when state is OPEN, null when CLOSED | Regression guard for the stats change |
| 1413b-6 | Market-hours gate: outside trading window, `runForeignFlowFetcherJobCron` skips entirely | No `execute()` call, CB state unchanged |

### Regression suite (must all still pass)

```
bun test src/__tests__/1392-foreign-flow-cb-probe-regression.test.ts
bun test src/__tests__/1388-cb-auto-reset.test.ts
bun test src/__tests__/1404-cb-startup-reset.test.ts
bun test src/__tests__/1407-market-hours-gate.test.ts
bun test src/__tests__/FIX-foreign-flow-cb.test.ts
bun test src/__tests__/1288-foreign-flow-fallback.test.ts
bun test src/__tests__/1352b-foreign-flow-job-wrapper.test.ts
```

### Full suite gate

`bun test` — all pre-existing passing tests must remain passing (baseline: 7849
pass at Task 1407 QA sign-off).

---

## 8. DDD Compliance

All changes are confined to:
- `interface/` layer: `pushForeignFlowHandler.ts` (HTTP handler)
- `infrastructure/` layer: `circuitBreaker.ts` (CB stat shape)
- `scheduler/` layer (interface): `foreignFlowFetcherJob.ts` — no change needed

No domain layer (`domain/services/`, `domain/models/`) changes required.
No new dependencies introduced.

---

## 9. Risk Flags

| Risk | Severity | Mitigation |
|------|----------|------------|
| Removing the early-return guard exposes the HALF_OPEN probe to a real DB write attempt | LOW | This is the intended behaviour of a CB. The probe is protected by the `execute()` try/catch. |
| If `CircuitOpenError` is not imported and caught separately, DB error responses will conflate CB-open with actual DB errors | MEDIUM | Test 1413b-1 through 1413b-3 explicitly verify response codes and headers per scenario. |
| VPS ignores `Retry-After` header — no behaviour change on VPS side | LOW | The server-side fix works independently of VPS changes. VPS change is additive. |
| `openedAt` exposure in stats may confuse consumers that expect null when not open | LOW | The interface change is additive (consumers ignore unknown fields). |

---

## RETURN

DONE: ADR written at docs/handoffs/TASK_1413b.md — root cause identified as passive CB recovery model (early-return guard bypasses HALF_OPEN probe), five prior fixes traced, Option B (remove early-return guard + expose Retry-After) recommended with exact file locations and test plan.
NEXT: developer | implement Option B from this ADR — remove lines 169-185 from pushForeignFlowHandler.ts, add CircuitOpenError catch with Retry-After header, expose openedAt in CircuitBreakerStats, write 6 new tests in 1413b-cb-halfopen-probe.test.ts, run full regression suite.
HANDOFF: docs/handoffs/TASK_1413b.md
PIPELINE: continue
