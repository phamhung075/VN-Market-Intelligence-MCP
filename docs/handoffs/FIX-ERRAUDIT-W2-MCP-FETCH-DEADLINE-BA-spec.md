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
