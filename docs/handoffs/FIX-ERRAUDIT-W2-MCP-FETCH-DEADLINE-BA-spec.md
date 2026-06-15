<!-- size-justification: Wave-2 bounded-fetch spec — 6 unbounded-fetch sites + 2 DRY consolidation sites, new shared util, macroFetch wrapper, full DDD layer map, atomic task breakdown, edge cases, forced-failure DoD. Structural load-bearing for architect+pm+dev-mcp-server+qa chain. -->

# BA Spec — FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE

**Epic:** ERROR-AUDIT-2026-06-15 · Wave 2
**Zone:** `apps/mcp-server/`
**Chain:** ba → architect → pm → dev-mcp-server → qa
**BA task_id:** FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE
**Created:** 2026-06-16T00:00:00Z
**Status:** SPEC COMPLETE — ZERO PO BLOCKERS

---

## Summary

Six production fetch sites in `apps/mcp-server` have NO `AbortSignal` / `AbortController` — any TCP hang blocks them indefinitely, which blows the 60-second gateway timeout and produces a false "gateway down" alert. Two existing inline 15-second deadline copies (`taOhlcvBackfillJob` / `deepFetchVpsJob`) are DRY-violations of the same pattern.

This Wave-2 fix does TWO things atomically:

1. **Land one shared utility** — `withDeadline<T>` + `macroFetch<T>` — in the `infrastructure` layer (see DDD decision below).
2. **Migrate all 6 unbounded-fetch sites + 2 inline-copy sites** to that utility.

The implementation is `dev-mcp-server` only. No Python, no frontend, no other zone.

---

## Precedent (do not re-invent)

`F-MACRO-FETCH-DEADLINE` is `done_verified` in `.task_board.done_verified`. It added a fetch deadline on a single macro path. This task GENERALIZES that inline pattern into ONE shared helper and applies it to every remaining unbounded site. The existing inline `AbortController` + `setTimeout(15_000)` copy in `taOhlcvBackfillJob.ts:149-170` and `AbortSignal.timeout(15_000)` in `deepFetchVpsJob.ts:96` are the REFERENCE implementation — the shared helper must produce identical runtime behavior.

The existing `bctcHttpFetcher.ts` (`AbortController` + `setTimeout(timeoutMs)` + `clearTimeout` in `finally`) is also exemplary. The new `withDeadline` wraps exactly this pattern behind a typed generic.

---

## Deliverables

### D-1 — New file: `apps/mcp-server/src/infrastructure/fetchers/fetchDeadline.ts`

Two exports:

```
withDeadline<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number, label: string): Promise<T>
macroFetch<T>(path: string, body: unknown, opts: { deadlineMs: number }): Promise<{ ok: true; data: T } | { ok: false; degrade: DegradeEnvelope }>
```

`DegradeEnvelope` is a local type in the same file:

```
type DegradeEnvelope = { reason: 'deadline' | 'http-error' | 'network'; status?: number; label: string }
```

### D-2 — Migration of 6 unbounded-fetch sites

Each site calls `withDeadline` (or `macroFetch` for the macro proxy chokepoint) instead of a bare `fetch(url, ...)`.

### D-3 — DRY consolidation of 2 inline copies

`taOhlcvBackfillJob.ts:149-170` and `deepFetchVpsJob.ts:96` migrated to `withDeadline` — no behavior change, only deduplication.

### D-4 — Barrel export

`apps/mcp-server/src/infrastructure/fetchers/index.ts` gains an export for `withDeadline` and `macroFetch`.

---

## FR Catalog

### FR-1 — `withDeadline<T>` primitive

**What it must do:**

- Accept a callback `fn: (signal: AbortSignal) => Promise<T>`, a deadline in milliseconds `ms`, and a human-readable `label` string.
- Internally create an `AbortController`, arm a `setTimeout(() => controller.abort(), ms)`, pass `controller.signal` to `fn`.
- In a `finally` block: `clearTimeout(timerId)` — always clean up the timer to prevent memory leaks on fast paths.
- If the AbortController fires, `fetch` will throw a `DOMException` with `name === "AbortError"`. `withDeadline` must re-throw as a typed `DeadlineError` (a subclass of `Error` or a tagged Error). Alternatively it may re-throw the original abort error; architect decides the exact error type — but the thrown value MUST be distinguishable from a network error in callers.
- `console.error` (no import needed — Bun global) one attribution line on abort: `[withDeadline][${label}] fetch aborted after ${ms}ms`.
- It must NOT catch non-abort errors — those propagate to the caller unchanged.
- It must NOT return a fabricated default. A timeout is a failure; the caller's own error handler decides degrade behavior.

**Deadline value:** the deadline `ms` is passed by the caller. The CONSTRAINT is that every caller must supply a value strictly less than the 60-second gateway timeout. Recommended defaults per site are documented in the migration table below. `withDeadline` itself has no hardcoded timeout — it is generic. No per-host, no per-site special-case inside the helper.

### FR-2 — `macroFetch<T>` discriminated-result wrapper

**What it must do:**

- Wrap `withDeadline` for the macro-indicators HTTP proxy pattern (the ~8-site cluster in `apps/mcp-server/src/interface/mcp/tools/macro/*.ts`).
- Accept `path: string` (appended to `getMacroBaseUrl()` from `macroHttpClient.ts`), `body: unknown`, and `opts: { deadlineMs: number }`.
- Return a discriminated-union result: `{ ok: true; data: T }` on success OR `{ ok: false; degrade: DegradeEnvelope }` on any failure (abort, HTTP error, network error).
- On `ok: false`, emit one `console.error` attribution line: `[macroFetch][${path}] degrade: ${degrade.reason}`.
- Callers use the discriminated result directly — no try/catch needed at the call site.
- `DegradeEnvelope.reason` is `'deadline'` on abort, `'http-error'` on non-2xx, `'network'` on thrown network error.
- MUST NOT fabricate a success result or a confidence value. `ok: false` is the only honest degrade.

### FR-3 — Migration of 6 unbounded-fetch sites

For each site below: replace the raw `fetch(url, ...)` call with the appropriate wrapper. Deadline values are the RECOMMENDED defaults; architect/dev may adjust downward but MUST stay below 60s.

| ID | File:Line | Wrapper | Recommended `ms` | Notes |
|---|---|---|---|---|
| mcp-infra-01 | `infrastructure/fetchers/muasamcong.ts:216` | `withDeadline` | 30_000 | VPS-proxied; VPS is slow but not as slow as geo-blocked direct. The `defaultHttpClient.get` is already inside a function — `withDeadline` wraps that call. |
| mcp-infra-03 | `infrastructure/fetchers/sscInsider.ts:134` | `withDeadline` | 30_000 | Same VPS-proxy pattern as muasamcong. `defaultHttpClient.get` inside `fetchInsiderTransactions`. |
| mcp-domain-sched-02 | `scheduler/news-analysis/newsHeadlinesRefreshJob.ts:41` | `withDeadline` | 20_000 | `fetchFromNewsFetch` — internal service, fast path. |
| mcp-domain-sched-03 | `scheduler/financial-reports/bctcPdfPullJob.ts:165` | `withDeadline` | 45_000 | PDF download — large payload, needs more headroom, still < 60s. |
| mcp-interface-01 | `interface/mcp/tools/macro/macroTools.ts:446` | `macroFetch` | 15_000 | Highest-traffic macro tool. Already has `try/catch`; replace inner `fetch` with `macroFetch` discriminated result. |
| mcp-interface-05 | `interface/mcp/server.ts:642` | `withDeadline` | 30_000 | `/api/trigger-pek-extract` → pdf-extractor:5001. The `fetch(pekUrl, ...)` is inside a `try/catch` block already — the deadline wraps the fetch only, catch block remains. |

### FR-4 — DRY consolidation (inline copies → `withDeadline`)

Two existing inline AbortController patterns must be consolidated:

| File:Line | Current pattern | After |
|---|---|---|
| `scheduler/market-data/taOhlcvBackfillJob.ts:149-170` | `new AbortController()` + `setTimeout(15_000)` + `clearTimeout` in `finally` | `withDeadline(signal => fetch(url, { ...headers, signal }), 15_000, 'taOhlcvBackfill')` |
| `scheduler/news-analysis/deepFetchVpsJob.ts:96` | `AbortSignal.timeout(15_000)` inline | `withDeadline(signal => fetch(endpoint, { signal }), 15_000, 'deepFetchVps')` |

Note: `AbortSignal.timeout` does NOT call `clearTimeout` — it leaks the timer. `withDeadline` closes this gap.

### FR-5 — `macroFetch` applied to the 7 macro sibling sites

The 7 macro tool files that hand-copy the same `fetch + !ok + catch` block must each be migrated to `macroFetch`. These are Wave-2 data-layer scope but the architect should list them in the blueprint for dev to handle in one sweep:

- `carryTools.ts:57+134`
- `tradeBalanceTools.ts:96`
- `bopTools.ts:119`
- `liquidityStateTools.ts:137`
- `cpiComponentsTools.ts:95`
- `macroIndicatorsVnTools.ts:80`
- `dinhGiaTools.ts:56`

Each caller replaces the `try { const r = await fetch...; if(!r.ok){...} const d = await r.json(); ... } catch {...}` block with:

```ts
const result = await macroFetch<ExpectedType>(path, body, { deadlineMs: 15_000 });
if (!result.ok) {
  return { content: [{ type: 'text', text: JSON.stringify({ error: 'macro-indicators service unavailable' }) }] };
}
// use result.data
```

### FR-6 — Fail-loud mandate (no fabricated defaults)

On deadline or error, every migrated site must either:
- Throw / propagate the error to the caller's existing `catch` (for `withDeadline` callers that already have try/catch).
- Return `{ ok: false; degrade: DegradeEnvelope }` (for `macroFetch` callers).

No fabricated default values (`confidence=50`, `return []` masking a network error, `return 0`) are permitted as the direct consequence of an abort. The existing `catch { return [] }` or `catch { return null }` patterns at sites mcp-infra-01 and mcp-infra-03 remain valid IF they wrap the entire `withDeadline` call — meaning a true deadline error propagates out of `withDeadline` and is caught by the outer catch, which then logs it and returns `[]`. That is NOT fabrication — it is honest degrade with attribution logging. The key requirement is: the `console.error` attribution log from `withDeadline` MUST fire before the outer catch silences the error.

---

## Non-Functional Requirements

### NFR-1 — No new import for `console.error`

`console.error` is a Bun global. `withDeadline` and `macroFetch` must NOT import any logger. This is a DDD invariant: the utility must remain importable from any layer without creating circular dependencies.

### NFR-2 — Deadline strictly < 60s gateway timeout

Every recommended `ms` value above is < 60_000. If architect/dev adjusts any value, it must stay < 60_000. This constraint prevents the false "gateway down" class.

### NFR-3 — Generic — no per-host / per-date / per-ticker special-case

`withDeadline` and `macroFetch` must contain zero host names, IP addresses, ticker symbols, date literals, or environment-flag branches. The label string passed by callers is for observability only.

### NFR-4 — Timer cleanup on fast path

`clearTimeout(timerId)` must fire in the `finally` block — never conditionally. A resolved promise that does NOT abort must still cancel the pending timer. This matches the precedent in `bctcHttpFetcher.ts:68`.

### NFR-5 — TypeScript strict compliance

The new `fetchDeadline.ts` must compile under `bun check` with zero TypeScript errors. `DeadlineError` class (if introduced) must extend `Error` correctly. Generic type parameters must be used correctly (no `any` without comment justification).

### NFR-6 — No circular dependency

`infrastructure/fetchers/fetchDeadline.ts` must import NOTHING from `domain/`, `application/`, or `interface/`. It may import from `infrastructure/logger.ts` ONLY if architect decides to use the structured logger instead of `console.error` — but `console.error` is the default (NFR-1).

---

## DDD Layer Decision — WHERE `withDeadline` lives

**Decision: `infrastructure/fetchers/fetchDeadline.ts`**

**Rationale:**

`withDeadline` owns an `AbortController`, a `setTimeout`, and a `clearTimeout` — these are I/O-timing side effects. In DDD terms, managing the lifecycle of a network call is an infrastructure concern. The helper does not contain any business logic (no domain terms, no ticker symbols, no market rules). It is analogous to `bctcHttpFetcher.ts` (which also owns `AbortController` + `setTimeout` + `clearTimeout`) — both live in `infrastructure/fetchers/`.

`macroFetch` is a thin wrapper around `withDeadline` that adds the macro-indicators-specific HTTP POST shape and the discriminated-result type. It references `getMacroBaseUrl()` from `infrastructure/fetchers/macroHttpClient.ts` — the same infrastructure layer. This co-location is correct.

**Why NOT application layer:**
The application layer contains use-cases (orchestrating domain calls, implementing business flows). A deadline wrapper is not a use-case — it is a transport-level concern. Placing it in `application/utils/` would violate the principle that application code should not own I/O lifecycle management.

**Why NOT domain layer:**
Domain must have zero infrastructure imports and zero I/O side effects. `AbortController` and `setTimeout` are runtime APIs; they belong in infrastructure.

**Why NOT a standalone `shared/` top-level directory:**
The project has no existing `shared/` directory at the `src/` level. Introducing one would require architect approval of a new structural convention. `infrastructure/fetchers/` already houses `bctcHttpFetcher.ts` (a generic fetch adapter) and `browserHeaders.ts` (shared fetch constants) — the pattern of shared fetch utilities living there is established. No new directory needed.

**Import path from callers:**

- `muasamcong.ts`, `sscInsider.ts`, `bctcHttpFetcher.ts` — same directory, `./fetchDeadline.js`
- `newsHeadlinesRefreshJob.ts`, `bctcPdfPullJob.ts`, `taOhlcvBackfillJob.ts`, `deepFetchVpsJob.ts` — cross-layer import from scheduler → infrastructure: `../../infrastructure/fetchers/fetchDeadline.js`
- `macroTools.ts`, `carryTools.ts`, et al. — cross-layer from interface → infrastructure: `../../../../infrastructure/fetchers/fetchDeadline.js`
- `server.ts` — same structure as interface layer tools

All these cross-layer imports go downward only (interface → infrastructure; scheduler → infrastructure; infrastructure → infrastructure). No upward imports. DDD import direction is respected.

---

## Atomic Task Breakdown

The following tasks are proposed for the PM workorder. All tasks are within `apps/mcp-server` only. Executing agent: `dev-mcp-server`.

### T-1 — Create `fetchDeadline.ts` with `withDeadline` + `macroFetch` + `DegradeEnvelope`

**Files:** `apps/mcp-server/src/infrastructure/fetchers/fetchDeadline.ts`
**Output:** New file, zero callers yet. `bun check` must pass on this file standalone.
**Size:** S
**Depends:** none

### T-2 — Barrel export in `fetchers/index.ts`

**Files:** `apps/mcp-server/src/infrastructure/fetchers/index.ts`
**Change:** Add `export { withDeadline, macroFetch, type DegradeEnvelope } from './fetchDeadline.js'`
**Size:** XS
**Depends:** T-1

### T-3 — Migrate `muasamcong.ts:216` → `withDeadline`

**Files:** `apps/mcp-server/src/infrastructure/fetchers/muasamcong.ts`
**Change:** `defaultHttpClient.get` wraps its `fetch` call in `withDeadline(signal => fetch(url, { headers, signal }), 30_000, 'muasamcong')`
**Size:** S
**Depends:** T-1

### T-4 — Migrate `sscInsider.ts:134` → `withDeadline`

**Files:** `apps/mcp-server/src/infrastructure/fetchers/sscInsider.ts`
**Change:** `defaultHttpClient.get` wraps its `fetch` call in `withDeadline(signal => fetch(url, { headers, signal }), 30_000, 'sscInsider')`
**Size:** S
**Depends:** T-1

### T-5 — Migrate `newsHeadlinesRefreshJob.ts:41` → `withDeadline`

**Files:** `apps/mcp-server/src/scheduler/news-analysis/newsHeadlinesRefreshJob.ts`
**Change:** `fetchFromNewsFetch` wraps its `fetch` in `withDeadline(signal => fetch(url, { method:'POST', headers, body, signal }), 20_000, 'newsHeadlines')`
**Size:** S
**Depends:** T-1

### T-6 — Migrate `bctcPdfPullJob.ts:165` → `withDeadline`

**Files:** `apps/mcp-server/src/scheduler/financial-reports/bctcPdfPullJob.ts`
**Change:** `makeProductionDeps().fetchPdf` wraps its `fetch` in `withDeadline(signal => fetch(url, { headers, signal }), 45_000, 'bctcPdfPull')`
**Size:** S
**Depends:** T-1

### T-7 — Migrate `macroTools.ts:446` → `macroFetch`

**Files:** `apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts`
**Change:** Replace the `try { const response = await fetch(url, ...) ... } catch {...}` block with `macroFetch<Record<string,any>>('/snapshot', _params ?? {}, { deadlineMs: 15_000 })` + discriminated-result handling.
**Size:** S
**Depends:** T-1

### T-8 — Migrate `server.ts:642` → `withDeadline`

**Files:** `apps/mcp-server/src/interface/mcp/server.ts`
**Change:** The `fetch(pekUrl, ...)` at line 642 is wrapped in `withDeadline(signal => fetch(pekUrl, { method:'POST', headers, body, signal }), 30_000, 'triggerPekExtract')`. The surrounding `try/catch` at lines 640-667 remains intact — `withDeadline`'s `console.error` fires before the outer catch handles the abort error.
**Size:** S
**Depends:** T-1

### T-9 — DRY: consolidate `taOhlcvBackfillJob.ts:149-170`

**Files:** `apps/mcp-server/src/scheduler/market-data/taOhlcvBackfillJob.ts`
**Change:** Replace inline `AbortController` + `setTimeout(15_000)` + `clearTimeout` with `withDeadline(signal => fetch(url, { headers, signal }), 15_000, 'taOhlcvBackfill')`. Runtime behavior unchanged.
**Size:** XS
**Depends:** T-1

### T-10 — DRY: consolidate `deepFetchVpsJob.ts:96`

**Files:** `apps/mcp-server/src/scheduler/news-analysis/deepFetchVpsJob.ts`
**Change:** Replace `AbortSignal.timeout(15_000)` with `withDeadline(signal => fetch(endpoint, { signal }), 15_000, 'deepFetchVps')`. Adds `clearTimeout` cleanup that `AbortSignal.timeout` was missing.
**Size:** XS
**Depends:** T-1

### T-11 — Migrate 7 macro sibling tools → `macroFetch`

**Files:** `carryTools.ts`, `tradeBalanceTools.ts`, `bopTools.ts`, `liquidityStateTools.ts`, `cpiComponentsTools.ts`, `macroIndicatorsVnTools.ts`, `dinhGiaTools.ts` (all in `interface/mcp/tools/macro/`)
**Change:** Each replaces its hand-copied `fetch + !ok + catch` block with `macroFetch<T>(path, body, { deadlineMs: 15_000 })` + discriminated-result guard. This eliminates ~25 lines × 7 files of duplication.
**Size:** M (7 files in one sweep)
**Depends:** T-1, T-7 (T-7 establishes the pattern; T-11 replicates it across siblings)

### T-12 — `bun check` full pass + rebuild

**Files:** none (validation task)
**Action:** Run `bun check` in `apps/mcp-server/`. Zero TypeScript errors required before QA. Container rebuild mandatory.
**Size:** XS
**Depends:** T-2 through T-11

**Sequencing:** T-1 must complete first (T-2 through T-11 all depend on it). T-2 through T-10 can run in parallel after T-1. T-11 depends on T-7 being done first (pattern precedent). T-12 is the validation gate. Total critical path: T-1 → T-7 → T-11 → T-12 (all others parallel to T-7 and T-11).

---

## Edge Cases

**EC-1 — Fast-path timer leak**
If the fetch resolves BEFORE the timeout fires, `withDeadline` must call `clearTimeout(timerId)` in `finally`. Without this, the timer fires ~ms later with a signal already consumed — a benign but unnecessary abort attempt. Under Bun, pending timers also prevent graceful shutdown. The `finally` block (not a `.then()`) guarantees cleanup on both success and error paths.

**EC-2 — Abort vs network error distinction**
An `AbortError` (from `controller.abort()`) and a genuine network reset error both throw from `fetch`. `withDeadline` must check `err.name === 'AbortError'` (or `err instanceof DOMException && err.name === 'AbortError'`) to discriminate. Only the abort path triggers the `console.error` attribution. Network errors propagate unchanged (callers already handle them).

**EC-3 — `macroFetch` concurrent calls**
Each call to `macroFetch` creates its own `AbortController` (via `withDeadline`). Multiple concurrent macro tool calls do NOT share a controller and cannot abort each other.

**EC-4 — `bctcPdfPullJob` large PDF (45s deadline)**
A 45-second deadline is still below the 60-second gateway threshold. However, the PDF download is a scheduled background job — NOT a synchronous MCP tool call. The gateway timeout does not apply to it directly. The 45s deadline is still correct for protecting the host from a hung TCP connection. Architect may adjust lower if the PDF file sizes in production allow it.

**EC-5 — Existing `bctcHttpFetcher.ts` relationship**
`bctcHttpFetcher.ts` already implements `AbortController` + `setTimeout(timeoutMs)` + `clearTimeout`. It is NOT migrated to `withDeadline` in this wave — it is already correct and generic (it receives `timeoutMs` as a parameter). Architect should note this in the blueprint to prevent dev from unnecessarily touching it.

**EC-6 — `macroFetch` caller return shape**
The current `macroTools.ts:446` `catch` block returns `{ content: [{ type:'text', text: JSON.stringify({ error: 'macro-indicators service unavailable' }) }] }`. After migration to `macroFetch`, the `ok: false` branch must return the same shape. This preserves the existing degrade contract for MCP tool callers.

**EC-7 — `server.ts:642` timeout during market hours**
`/api/trigger-pek-extract` is called by the cowork agent during active analysis. A 30-second deadline on the pdf-extractor:5001 call is acceptable — the pdf-extractor's own internal processing timeout is shorter. If pdf-extractor:5001 is wedged (not just slow), the 30s deadline will surface the hang and return a 502/504 to the caller instead of blocking indefinitely.

**EC-8 — `newsHeadlinesRefreshJob` + `pushToMcpServer` pair**
`newsHeadlinesRefreshJob.ts:41` covers `fetchFromNewsFetch`. The sibling function `pushToMcpServer` (line 67+) also does a `fetch` — audit brief notes this as `pushToMcpServer:79` in the original scope. If this fetch is also unbounded, dev must apply `withDeadline` to it in the same T-5 task. The audit brief lists it as part of `mcp-domain-sched-02`'s scope.

**EC-9 — TypeScript generic inference**
`withDeadline<T>` receives a callback typed as `(signal: AbortSignal) => Promise<T>`. Callers that pass an anonymous arrow function must ensure `T` is inferable or explicitly specified. `macroFetch<T>` requires the caller to specify `T` at the call site. Architect must confirm whether `T = unknown` is acceptable as a default generic bound or if explicit typing is required.

---

## DDD Layer Map

| Task | File | DDD Layer | Justification |
|---|---|---|---|
| T-1 (new utility) | `infrastructure/fetchers/fetchDeadline.ts` | Infrastructure | Owns AbortController + setTimeout lifecycle; pure I/O-timing concern; no domain/business logic |
| T-2 (barrel) | `infrastructure/fetchers/index.ts` | Infrastructure | Barrel file for infrastructure layer |
| T-3 | `infrastructure/fetchers/muasamcong.ts` | Infrastructure | Fetcher — already infrastructure |
| T-4 | `infrastructure/fetchers/sscInsider.ts` | Infrastructure | Fetcher — already infrastructure |
| T-5 | `scheduler/news-analysis/newsHeadlinesRefreshJob.ts` | Domain (Scheduler) | Scheduled job — domain-sched tier; imports infrastructure utility downward (valid) |
| T-6 | `scheduler/financial-reports/bctcPdfPullJob.ts` | Domain (Scheduler) | Scheduled job — domain-sched tier; imports infrastructure utility downward (valid) |
| T-7 | `interface/mcp/tools/macro/macroTools.ts` | Interface | MCP tool handler — interface layer; imports infrastructure utility downward (valid) |
| T-8 | `interface/mcp/server.ts` | Interface | HTTP route handler — interface layer; imports infrastructure utility downward (valid) |
| T-9 | `scheduler/market-data/taOhlcvBackfillJob.ts` | Domain (Scheduler) | Same as T-5 |
| T-10 | `scheduler/news-analysis/deepFetchVpsJob.ts` | Domain (Scheduler) | Same as T-5 |
| T-11 | `interface/mcp/tools/macro/*.ts` (7 files) | Interface | MCP tool handlers; all import infrastructure downward (valid) |
| T-12 | validation | — | Build gate |

Import direction: Infrastructure ← Scheduler (Domain) ← Application ← Interface. All imports in this spec flow downward to Infrastructure only. Zero upward imports.

---

## Acceptance Criteria (Forced-Failure DoD)

Container must be REBUILT after code change. Named-volume DB `vn-market-intelligence-mcp_market_data` for any DB-dependent verification. `./data/market.db` (host path) is a stale decoy — do NOT use.

**AC-1 — `withDeadline` abort path fires before gateway timeout**
Force a hang (e.g., `iptables -A OUTPUT -p tcp --dport <target-port> -j DROP` on the VPS, or use a test HTTP server that never responds). Call any migrated tool within the MCP gateway. The gateway must receive an error response BEFORE the 60-second gateway timeout fires. The mcp-server container log must show the `[withDeadline][label] fetch aborted after Xms` attribution line.

**AC-2 — `macroFetch` degrade is honest (no fabricated data)**
Force macro-indicators:5004 down (`docker stop macro-indicators` or block port 5004). Call `get_macro_snapshot` via the gateway. Response must contain `{ "error": "macro-indicators service unavailable" }` — NOT a fabricated macro value. The degrade must arrive before 60 seconds.

**AC-3 — `macroFetch` happy path unchanged**
With macro-indicators:5004 running and healthy: `get_macro_snapshot` must return live data as before. No regression in the happy-path response shape.

**AC-4 — Carry tool siblings degrade honestly**
With macro-indicators:5004 down, call `get_carry_trade_signal` and any one other macro sibling tool. Each must return `{ "error": "macro-indicators service unavailable" }` within deadline. No hang.

**AC-5 — `taOhlcvBackfillJob` DRY: runtime behavior identical**
Run the OHLCV backfill job in test mode (or observe a live cron tick). Behavior must be identical to pre-migration — only the internal implementation changed. No new errors in happy path.

**AC-6 — `bctcPdfPullJob` deadline fires on hung PDF host**
Simulate a hung PDF download (firewall block). The job must abort and log `[withDeadline][bctcPdfPull] fetch aborted after 45000ms`. The job must not hang indefinitely.

**AC-7 — No timer leak on fast path**
QA or dev verifies (via code review or a unit test) that `clearTimeout` is called in the `finally` block — confirmed by static read of `fetchDeadline.ts`.

**AC-8 — `bun check` passes with zero TypeScript errors**
Run `pnpm check` or `bun check` in `apps/mcp-server/`. Must be clean.

**AC-9 — No regression on `bctcHttpFetcher.ts`**
This file is NOT migrated. Its existing tests must still pass. It is a negative-scope guard.

---

## Blockers

ZERO PO blockers. All design decisions are within the dev-mcp-server + architect authority.

Architect ratification items (not PO blockers — dev may draft pending architect sign-off):

**ARCH-RATIFY-W2-1:** Confirm `DeadlineError` shape — subclass of `Error` vs tagged `{ name: 'DeadlineError' }` object. Both are valid; architect chooses for consistency with existing error patterns in the codebase.

**ARCH-RATIFY-W2-2:** Confirm `AbortError` discrimination — `err.name === 'AbortError'` vs `err instanceof DOMException`. Bun uses `DOMException` with `name 'AbortError'`; architect confirms.

**ARCH-RATIFY-W2-3:** Confirm T-11 scope — whether `dinhGiaTools.ts` line 56 and `carryTools.ts:134` (second fetch site in carry) are included in T-11 or deserve separate tasks. The audit brief counts 8 total macro sites.

**ARCH-RATIFY-W2-4:** Confirm `EC-8` — whether `pushToMcpServer:79` in `newsHeadlinesRefreshJob.ts` is in T-5 scope or a separate task.

---

## Hard Constraints (propagate to architect → pm → dev-mcp-server → qa)

1. ONE SHARED HELPER — `withDeadline` is the single deadline primitive for ALL fetch sites. No per-site re-invention inside the helper.
2. FAIL-LOUD / HONEST DEGRADE — a timeout is an error. `withDeadline` must log and throw. Callers may catch and return an error envelope — but NEVER a fabricated success value.
3. DEADLINE < 60s — every `ms` value supplied to `withDeadline` must be < 60_000. Hard ceiling.
4. NO NEW IMPORT FOR `console.error` — Bun global. DDD invariant.
5. NO per-host / per-ticker / per-date / per-instance branch inside `withDeadline` or `macroFetch`.
6. `bctcHttpFetcher.ts` is NOT touched — it is already correct. Negative scope.
7. Container MUST be rebuilt (not restarted) before QA runs.
8. Named-volume DB only for any DB-dependent verification (`vn-market-intelligence-mcp_market_data`).

---

## Files Modified (scope for architect/dev)

**New:**
- `apps/mcp-server/src/infrastructure/fetchers/fetchDeadline.ts`

**Modified:**
- `apps/mcp-server/src/infrastructure/fetchers/index.ts`
- `apps/mcp-server/src/infrastructure/fetchers/muasamcong.ts`
- `apps/mcp-server/src/infrastructure/fetchers/sscInsider.ts`
- `apps/mcp-server/src/scheduler/news-analysis/newsHeadlinesRefreshJob.ts`
- `apps/mcp-server/src/scheduler/financial-reports/bctcPdfPullJob.ts`
- `apps/mcp-server/src/scheduler/market-data/taOhlcvBackfillJob.ts`
- `apps/mcp-server/src/scheduler/news-analysis/deepFetchVpsJob.ts`
- `apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts`
- `apps/mcp-server/src/interface/mcp/tools/macro/carryTools.ts`
- `apps/mcp-server/src/interface/mcp/tools/macro/tradeBalanceTools.ts`
- `apps/mcp-server/src/interface/mcp/tools/macro/bopTools.ts`
- `apps/mcp-server/src/interface/mcp/tools/macro/liquidityStateTools.ts`
- `apps/mcp-server/src/interface/mcp/tools/macro/cpiComponentsTools.ts`
- `apps/mcp-server/src/interface/mcp/tools/macro/macroIndicatorsVnTools.ts`
- `apps/mcp-server/src/interface/mcp/tools/macro/dinhGiaTools.ts`
- `apps/mcp-server/src/interface/mcp/server.ts`

Zero Python files. Zero frontend files. Zero docs/data files. Implementing specialist: `dev-mcp-server` only.

---

## Handoff to Architect

ZONE: `apps/mcp-server/`
SPEC: this file
NEXT: architect — produce technical design, confirm ARCH-RATIFY-W2-1 through W2-4, blueprint the `DeadlineError` type, confirm `macroFetch` generic inference pattern, confirm T-11 macro sibling scope count (7 vs 8).

---

## [Architect] Brownfield Findings

**Zone:** `apps/mcp-server/`
**BUILD-STANDARD:** lean (zone exists; this is a new shared utility + site migrations within the existing zone)
**BUILD-STANDARD-REF:** `docs/standards/microservice-build-standard.md`

### Layer Go/No-Go — `infrastructure/fetchers/fetchDeadline.ts`

**VERDICT: GO. BA's layer placement is correct and is ratified without modification.**

Justification (brownfield-verified):

- `bctcHttpFetcher.ts` is the canonical precedent: `AbortController` + `setTimeout(timeoutMs)` + `clearTimeout` in `finally`, no domain imports, no business logic. `withDeadline` is a generic extraction of exactly that pattern.
- `infrastructure/fetchers/` already houses `browserHeaders.ts` (shared fetch constants), `bctcHttpFetcher.ts` (shared fetch adapter) — the convention of domain-free shared fetch utilities in this directory is established.
- `macroFetch` imports `getMacroBaseUrl()` from `macroHttpClient.ts`, which is co-located in `interface/mcp/tools/macro/`. This is the only non-infrastructure import in `macroFetch`. **DDD RISK:** `macroFetch` must NOT import `macroHttpClient.ts` from `infrastructure/fetchers/`. Instead, `macroFetch` must accept `baseUrl` as a parameter, OR `getMacroBaseUrl()` must be called by the caller and passed in. Placing `macroFetch` in `infrastructure/` while importing from `interface/` would be an upward import — a hard DDD violation. See RISK-1 below.
- All caller import directions are downward-only: interface → infrastructure, scheduler → infrastructure, infrastructure → infrastructure. Zero upward imports arise from the new file itself, provided RISK-1 is resolved.

### Verified Paths

- `apps/mcp-server/src/infrastructure/fetchers/bctcHttpFetcher.ts:41-71` — reference impl: `AbortController` + `setTimeout` + `clearTimeout` in `finally`. The `withDeadline` body must replicate lines 45-46/62-70 as a generic.
- `apps/mcp-server/src/scheduler/market-data/taOhlcvBackfillJob.ts:149-170` — inline AbortController pattern to consolidate (T-9). Pattern confirmed read.
- `apps/mcp-server/src/scheduler/news-analysis/deepFetchVpsJob.ts:96` — `AbortSignal.timeout(15_000)` inline; no `clearTimeout` (timer leak confirmed). T-10 fixes this.
- `apps/mcp-server/src/infrastructure/fetchers/foreignFlowFetcher.ts` — uses `err.name === "AbortError"` for discrimination. Working in Bun (confirmed live).
- `apps/mcp-server/src/infrastructure/microservices/clients.ts:57` — also uses `error.name === 'AbortError'`. Same pattern, same runtime, confirmed working.
- `apps/mcp-server/src/interface/mcp/tools/macro/carryTools.ts:57` — bare `fetch` to `/snapshot`, unbounded. `carryTools.ts:134` — bare `fetch` to `/macro-calendar`, also unbounded. Two separate fetch sites in one file (see ARCH-RATIFY-W2-3).
- `apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts:446` — confirmed bare `fetch` to `/snapshot`, no deadline (T-7 scope).
- `apps/mcp-server/src/scheduler/news-analysis/newsHeadlinesRefreshJob.ts:41` — `fetchFromNewsFetch` bare `fetch`. Line 79 — `pushToMcpServer` bare `fetch` to `MCP_SERVER_BASE/api/push-news`. Two unbounded fetches (see ARCH-RATIFY-W2-4).
- `apps/mcp-server/src/infrastructure/fetchers/index.ts` — barrel. No `fetchDeadline` export yet (T-2 target).
- `apps/mcp-server/src/interface/mcp/tools/macro/macroHttpClient.ts:15` — `getMacroBaseUrl()` reads `Bun.env.MACRO_INDICATORS_URL`. Must NOT be imported by `infrastructure/fetchers/fetchDeadline.ts`.

### Existing Error Subclass Patterns

Codebase has four `extends Error` subclasses: `AppConfigError` (infrastructure/config.ts), `CircuitOpenError` (infrastructure/circuitBreaker.ts), `BacktestStrategyNotFoundError` (domain/backtesting), `InsufficientDataError` (domain/services/macro). Pattern is an `Error` subclass with `name` property set in constructor. No tagged-object pattern exists anywhere in the codebase.

---

### ARCH-RATIFY-W2-1 — `DeadlineError` shape

**VERDICT: Error subclass.**

Rationale: the entire codebase uses `extends Error` for typed errors (4 existing examples; no tagged-object pattern). Callers that already do `catch (err)` and check `err.name === 'AbortError'` will need to discriminate `DeadlineError` — `instanceof DeadlineError` is the only reliable discriminator after `withDeadline` re-wraps the abort. A tagged object `{ name: 'DeadlineError' }` is not assignable to `Error` and would break any `catch (e: unknown)` check that type-narrows with `instanceof Error`.

Implementation contract for dev:

```ts
export class DeadlineError extends Error {
  readonly label: string;
  readonly deadlineMs: number;
  constructor(label: string, ms: number) {
    super(`[withDeadline][${label}] fetch aborted after ${ms}ms`);
    this.name = 'DeadlineError';
    this.label = label;
    this.deadlineMs = ms;
  }
}
```

The `message` field carries the attribution text, satisfying the log requirement without a separate `console.error` call at construction time. `withDeadline` still calls `console.error` before throwing so the log fires at abort-time, not at error-catch time.

Callers discriminate with:
- `err instanceof DeadlineError` — for callers that want to distinguish deadline from network error.
- `err.name === 'DeadlineError'` — also works; both are equivalent for subclasses with `this.name` set.

`macroFetch` maps a caught `DeadlineError` to `{ ok: false, degrade: { reason: 'deadline', label } }` — no fabrication, honest degrade.

Honest-log note: `DeadlineError.message` already names the label + ms. When a caller's outer `catch` logs `err.message`, the attribution is automatic. The `console.error` in `withDeadline` fires at the moment of abort (before re-throw), so it appears in the log even if the outer catch is silent.

---

### ARCH-RATIFY-W2-2 — AbortError discrimination in Bun

**VERDICT: Use `err.name === 'AbortError'` only. Do NOT use `instanceof DOMException`.**

Brownfield evidence: two live callers in the codebase already use `err.name === "AbortError"` in Bun and are working:
- `foreignFlowFetcher.ts` (infrastructure layer, VPS-proxied fetch)
- `clients.ts` (microservice retry loop)

Neither uses `instanceof DOMException`. Bun's `AbortController` abort throw produces an error with `name === 'AbortError'`. Under Bun, `DOMException` is available but the thrown abort error is not guaranteed to be `instanceof DOMException` across Bun versions — `err.name === 'AbortError'` is the stable cross-runtime check and is the established codebase convention.

Implementation contract for `withDeadline`:

```ts
} catch (err: unknown) {
  if (err instanceof Error && err.name === 'AbortError') {
    console.error(`[withDeadline][${label}] fetch aborted after ${ms}ms`);
    throw new DeadlineError(label, ms);
  }
  throw err; // network or other errors propagate unchanged
} finally {
  clearTimeout(timerId);
}
```

The `instanceof Error` guard prevents `err.name` access on non-Error throws (defensive, not strictly required in Bun but correct TypeScript narrowing).

---

### ARCH-RATIFY-W2-3 — T-11 macro sibling count: 7 vs 8

**VERDICT: 8 fetch sites, but T-11 scope is 7 files / 8 calls. No new task needed — fold second call into same T-11.**

Brownfield read of `carryTools.ts`:
- Line 57: `get_carry_trade_signal` → `fetch(url)` to `${baseUrl}/snapshot` — unbounded (macroFetch candidate)
- Line 134: `get_macro_calendar` → `fetch(url)` to `${baseUrl}/macro-calendar?days=...` — also unbounded (second fetch site, same file)

The audit brief lists `carryTools.ts:57+134` — both calls are accounted for in the audit. The BA spec FR-5 file list includes `carryTools.ts` once. The discrepancy is 7 files but 8 fetch calls (carry has two).

Resolution: T-11 remains ONE task covering 7 files, but the task description must explicitly state that `carryTools.ts` has TWO fetch calls to migrate (`:57` = `get_carry_trade_signal` to `/snapshot`; `:134` = `get_macro_calendar` to `/macro-calendar`). Both are covered by `macroFetch`. Total: 8 calls migrated in T-11 across 7 files.

PM must annotate T-11 description: "carryTools.ts has 2 fetch calls — migrate both."

---

### ARCH-RATIFY-W2-4 — `pushToMcpServer:79` in scope of T-5 or separate task?

**VERDICT: Fold into T-5. Same file, same job, same deadline budget.**

Brownfield read of `newsHeadlinesRefreshJob.ts`:
- Line 41: `fetchFromNewsFetch` — fetch to `NEWS_FETCH_BASE` (external news-fetch service). Bare, no signal.
- Line 79: `pushToMcpServer` — fetch to `MCP_SERVER_BASE/api/push-news` (local mcp-server itself). Bare, no signal.

The `pushToMcpServer` call has a different risk profile than `fetchFromNewsFetch`: it calls the local server, not an external service. However, "local" does not mean bounded — if the mcp-server's `/api/push-news` handler is backed up (e.g., DB write lock, queue full), this fetch can also hang indefinitely. EC-8 in the BA spec already identified this and scoped it to T-5.

Deadline recommendation for `pushToMcpServer`: **10_000ms** (10s). The call is localhost-to-localhost; 10s is more than enough for an HTTP push that should complete in <1s. A shorter deadline surfaces a hang faster without risk of false abort on healthy paths.

Rationale for not splitting: two fetch calls in one function scope of one job file; T-5 dev reads the file once and migrates both atomically. A separate task would create a false dependency chain without benefit.

**T-5 revised scope (PM must update task description):**
- `newsHeadlinesRefreshJob.ts:41` → `withDeadline(signal => fetch(...), 20_000, 'newsHeadlines')`
- `newsHeadlinesRefreshJob.ts:79` → `withDeadline(signal => fetch(...), 10_000, 'pushToMcpServer')`

---

### DDD Risk Notes

**RISK-1 (HIGH — DDD violation, blocks T-1): `macroFetch` must not import `macroHttpClient.ts`.**

`macroHttpClient.ts` lives in `interface/mcp/tools/macro/`. An import from `infrastructure/fetchers/fetchDeadline.ts` to that path would be an upward import: infrastructure → interface. This is a hard DDD violation that NFR-6 explicitly forbids.

Resolution options for dev (architect decides: Option A):

**Option A (RATIFIED): `macroFetch` receives `baseUrl` as a parameter.**

```ts
macroFetch<T>(
  baseUrl: string,
  path: string,
  body: unknown,
  opts: { deadlineMs: number; label?: string }
): Promise<{ ok: true; data: T } | { ok: false; degrade: DegradeEnvelope }>
```

Each macro caller (macroTools, carryTools, etc.) already calls `getMacroBaseUrl()` at registration time and stores it in `const baseUrl`. They pass `baseUrl` as the first argument. `fetchDeadline.ts` imports nothing from `interface/`.

This is a one-argument addition to the signature BA proposed. The BA spec says `macroFetch(path, body, opts)` — the signature becomes `macroFetch(baseUrl, path, body, opts)`. PM must propagate this change to the dev task description; it is a minor additive change, not a scope change.

Option B (rejected): move `getMacroBaseUrl()` to `infrastructure/`. This would require renaming/moving the file and updating all callers. Over-scope for this wave.

Option C (rejected): keep `macroFetch` in `interface/mcp/tools/macro/` co-located with its callers. This breaks the /goal#2 GENERIC mandate — the helper would not be reachable from `infrastructure/` or `scheduler/` without an upward import.

**RISK-2 (LOW): `bctcPdfPullJob` 45s deadline + VPS proxy latency.**

The BA spec notes bctcPdfPullJob as a background scheduled job (EC-4) — the gateway 60s timeout does NOT apply to it directly. However, the 45s value is still correct as a TCP hang guard. Assessment: 45s is adequate and does NOT need to be lowered. Rationale:

- The PDF download goes through the VPS proxy (Vinahost, ~100-200ms RTT from France, lower from the Docker host itself).
- The Docker host calls the VPS proxy; the VPS calls the BCTC server. Total round-trip overhead is proxy latency only — the gateway's 60s is a gateway-to-mcp-server budget, not a chain budget.
- The scheduled job is not time-sensitive; it runs in background. A 45s deadline surfaces a genuine hang before the job runs again (next cron tick).
- **Recommendation: keep 45s.** If production data shows PDFs downloading in <20s routinely, ops can tune downward without a code change — the deadline is a parameter, not a hardcode.

**RISK-3 (LOW): `server.ts:642` — 503 response body read after `withDeadline`.**

Current code at lines 649-654 reads the response body with `await pekResp.text()` after a `503` status check. After `withDeadline` wraps the `fetch`, the `Response` object is unchanged — body reads are safe as long as `withDeadline` only aborts the connection, not the response. If the deadline fires AFTER the response headers arrive but BEFORE the body is fully read, `pekResp.text()` will throw — this is caught by the existing `catch (fetchErr)` at line 667. No new risk introduced; existing catch covers it.

**RISK-4 (NONE — confirmed negative scope): `bctcHttpFetcher.ts` must NOT be touched.**

Confirmed read: `bctcHttpFetcher.ts` already implements `AbortController` + `clearTimeout` in `finally` correctly. It receives `timeoutMs` as a parameter from its caller. It is the exemplar, not a migration target. Dev must not touch it.

**RISK-5 (LOW): `macroFetch` generic type `T`.**

BA spec EC-9 asks whether `T = unknown` is acceptable as default. Resolution: `T` must be explicit at call sites where the caller uses `result.data` with a typed shape. `T = unknown` as the default bound is acceptable; dev should use `macroFetch<Record<string, unknown>>(...)` at existing `macroTools` call sites (matches current `as Record<string, any>`). Using `any` requires a `// eslint-disable` comment per existing codebase convention (see `macroTools.ts:471`). Prefer `Record<string, unknown>` to avoid the eslint suppress.

---

### Deadline Sanity Check (all values)

| Site | Recommended ms | Gateway ceiling | Assessment |
|---|---|---|---|
| muasamcong:216 | 30_000 | 60_000 | Safe — VPS proxy, not in critical path of synchronous MCP call |
| sscInsider:134 | 30_000 | 60_000 | Safe — same VPS proxy pattern |
| newsHeadlines:41 | 20_000 | 60_000 | Safe — internal service, 20s is conservative |
| pushToMcpServer:79 | **10_000** (architect reduced from no-deadline) | 60_000 | Safe — localhost-to-localhost, 10s more than sufficient |
| bctcPdfPullJob:165 | 45_000 | N/A (background job) | Safe — not gated by gateway timeout; 45s is TCP hang guard only |
| macroTools + siblings:446 | 15_000 | 60_000 | Safe — internal Docker network call |
| server.ts:642 | 30_000 | 60_000 | Safe — pdf-extractor:5001 is local Docker network |
| taOhlcvBackfill:149 | 15_000 | 60_000 | Safe — existing precedent value; DRY consolidation only |
| deepFetchVps:96 | 15_000 | 60_000 | Safe — existing precedent value; DRY consolidation + timer fix |

All values are strictly < 60_000. The bctcPdfPullJob 45s value is safe: it is a background scheduler, NOT a synchronous MCP gateway call; the 60s gateway ceiling does not apply to it. 45s protects against a hung TCP connection, not against a gateway timeout.

---

### Test Strategy

| Test type | What to verify | Target |
|---|---|---|
| Unit | `withDeadline` fires `DeadlineError` on abort, clears timer on success, propagates non-abort errors unchanged | `fetchDeadline.test.ts` (new, alongside file) |
| Unit | `macroFetch` returns `{ok:false, degrade:{reason:'deadline'}}` on `DeadlineError`, `{ok:false, degrade:{reason:'http-error', status}}` on non-2xx | same file |
| Integration (forced-failure) | `withDeadline` abort fires before 60s gateway timeout — see AC-1 | QA forced-failure harness |
| Integration (forced-failure) | `macroFetch` degrade is `{error:'macro-indicators service unavailable'}` — see AC-2, AC-4 | QA |
| Regression | `bctcHttpFetcher.ts` tests unchanged — see AC-9 | existing test suite |
| Static | `clearTimeout` in `finally` block — AC-7 | code review, optional unit test |

`bun check` (T-12) is the TypeScript gate. Container rebuild mandatory before QA runs. Named-volume DB only for DB-dependent steps.

---

### Reuse Patterns

- Extend `bctcHttpFetcher.ts` pattern — do NOT duplicate it. `withDeadline` is the abstraction.
- Extend `infrastructure/fetchers/index.ts` barrel — add `fetchDeadline` exports; follow existing section comment style.
- `clients.ts` `fetchWithRetry` (infrastructure/microservices) is a distinct pattern (retry + timeout combined) — NOT to be merged or replaced by `withDeadline`. They serve different callers.
- `AbortSignal.timeout()` (seen in `deepFetchMainJob.ts`, `imfDataFetcher.ts`, `fredEffrIorb.ts`) is NOT migrated in this wave — only the two explicitly named sites (taOhlcvBackfill + deepFetchVps) are DRY targets. Other `AbortSignal.timeout()` callers are out of scope.

---

### Final Scope Confirmation

Files to create (1):
- `apps/mcp-server/src/infrastructure/fetchers/fetchDeadline.ts`

Files to modify (17, per BA spec):
- `apps/mcp-server/src/infrastructure/fetchers/index.ts` (T-2)
- `apps/mcp-server/src/infrastructure/fetchers/muasamcong.ts` (T-3)
- `apps/mcp-server/src/infrastructure/fetchers/sscInsider.ts` (T-4)
- `apps/mcp-server/src/scheduler/news-analysis/newsHeadlinesRefreshJob.ts` (T-5 — both :41 and :79)
- `apps/mcp-server/src/scheduler/financial-reports/bctcPdfPullJob.ts` (T-6)
- `apps/mcp-server/src/scheduler/market-data/taOhlcvBackfillJob.ts` (T-9)
- `apps/mcp-server/src/scheduler/news-analysis/deepFetchVpsJob.ts` (T-10)
- `apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts` (T-7)
- `apps/mcp-server/src/interface/mcp/server.ts` (T-8)
- `apps/mcp-server/src/interface/mcp/tools/macro/carryTools.ts` (T-11 — both :57 and :134)
- `apps/mcp-server/src/interface/mcp/tools/macro/tradeBalanceTools.ts` (T-11)
- `apps/mcp-server/src/interface/mcp/tools/macro/bopTools.ts` (T-11)
- `apps/mcp-server/src/interface/mcp/tools/macro/liquidityStateTools.ts` (T-11)
- `apps/mcp-server/src/interface/mcp/tools/macro/cpiComponentsTools.ts` (T-11)
- `apps/mcp-server/src/interface/mcp/tools/macro/macroIndicatorsVnTools.ts` (T-11)
- `apps/mcp-server/src/interface/mcp/tools/macro/dinhGiaTools.ts` (T-11)

Scan clean: true — no DDD violations in the proposed scope provided RISK-1 (macroFetch signature) is adopted.

---

## RETURN
DONE: Technical design complete. Brownfield findings + 4 ratifications written to `docs/handoffs/FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE-BA-spec.md`
ZONE: apps/mcp-server/
NEXT: pm | break into atomic developer tasks using T-1..T-12 from BA spec; propagate RISK-1 (macroFetch signature change), ARCH-RATIFY-W2-4 (T-5 scope expansion + 10s pushToMcpServer deadline), ARCH-RATIFY-W2-3 (T-11 = 7 files / 8 calls)
HANDOFF: docs/handoffs/FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE-BA-spec.md
PIPELINE: continue
