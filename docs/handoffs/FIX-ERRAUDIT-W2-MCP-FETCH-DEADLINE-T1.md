---
parent_task: FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE
task_number: T-1
title: Create fetchDeadline.ts with withDeadline + macroFetch + DegradeEnvelope
sprint: FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE
size: S
zone: apps/mcp-server/
depends_on: []
blocks: [T-2, T-3, T-4, T-5, T-6, T-8, T-9, T-10, T-7, T-11]
critical_path: true
---

## TLDR

Create a new shared deadline utility file `fetchDeadline.ts` that exports `withDeadline<T>` and `macroFetch<T>` helpers. This is the foundation for all 11 downstream fetch-site migrations. `withDeadline` wraps fetch with an `AbortController` + `setTimeout` pattern, converting deadline expiry into a typed `DeadlineError`. `macroFetch` wraps `withDeadline` with macro-proxy-specific logic, returning a discriminated-result envelope. Zero callers yet; this is the utility definition task.

## [PM] Planning Context

- **Zone:** apps/mcp-server/
- **Files to create:** `apps/mcp-server/src/infrastructure/fetchers/fetchDeadline.ts`
- **Dependencies:** None (this task has no input dependencies; all other tasks depend on this one)
- **Knowledge needed:** 
  - `docs/handoffs/FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE-BA-spec.md` § DDD Layer Decision, FR-1, FR-2, ARCH-RATIFY-W2-1, ARCH-RATIFY-W2-2
  - `apps/mcp-server/src/infrastructure/fetchers/bctcHttpFetcher.ts` (reference implementation)
  - `apps/mcp-server/src/infrastructure/microservices/clients.ts` (AbortError discrimination pattern)

## Acceptance Criteria

- [ ] File `apps/mcp-server/src/infrastructure/fetchers/fetchDeadline.ts` exists with two exports: `withDeadline<T>` and `macroFetch<T>`
- [ ] `DeadlineError extends Error` with properties: `name = 'DeadlineError'`, `label: string`, `deadlineMs: number`. Constructor signature: `new DeadlineError(label: string, ms: number)`. Message includes attribution text `[withDeadline][${label}] fetch aborted after ${ms}ms`
- [ ] `withDeadline<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number, label: string): Promise<T>` implementation:
  - Creates an `AbortController`, arms `setTimeout(controller.abort(), ms)`
  - Passes `controller.signal` to the callback `fn`
  - On `AbortError` (detected via `err instanceof Error && err.name === 'AbortError'`): logs `console.error([withDeadline][${label}] fetch aborted after ${ms}ms)` and throws new `DeadlineError(label, ms)`
  - Non-abort errors propagate unchanged (not caught)
  - `finally` block ALWAYS calls `clearTimeout(timerId)` even on success
  - No hardcoded timeouts, no per-host branches, no per-ticker special-case
- [ ] `macroFetch<T>(baseUrl: string, path: string, body: unknown, opts: { deadlineMs: number }): Promise<{ ok: true; data: T } | { ok: false; degrade: DegradeEnvelope }>` implementation:
  - Constructs full URL via `${baseUrl}${path}`
  - Calls `withDeadline(signal => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal }), opts.deadlineMs, path)`
  - On success (2xx status): `{ ok: true, data: await response.json() }`
  - On `DeadlineError`: returns `{ ok: false, degrade: { reason: 'deadline', label: path } }`
  - On HTTP error (non-2xx): returns `{ ok: false, degrade: { reason: 'http-error', status: response.status, label: path } }`
  - On network error (other thrown Error): returns `{ ok: false, degrade: { reason: 'network', label: path } }`
  - Logs `console.error([macroFetch][${path}] degrade: ${degrade.reason})` on any degradation path
  - No fabricated success value or default confidence on failure
- [ ] `DegradeEnvelope` type is defined in the same file: `{ reason: 'deadline' | 'http-error' | 'network'; status?: number; label: string }`
- [ ] All exports are added to `apps/mcp-server/src/infrastructure/fetchers/index.ts` barrel: `export { withDeadline, macroFetch, type DegradeEnvelope } from './fetchDeadline.js'`
- [ ] `bun check` in `apps/mcp-server/` passes with zero TypeScript errors
- [ ] No imports from `interface/`, `domain/`, `application/`, or `scheduler/` (infrastructure layer isolation maintained)
- [ ] No `console` import statement (Bun global, NFR-1)

## Files to read first (reference implementations)

- `apps/mcp-server/src/infrastructure/fetchers/bctcHttpFetcher.ts:41-71` — AbortController + setTimeout + clearTimeout pattern (DO replicate this)
- `apps/mcp-server/src/infrastructure/microservices/clients.ts:57` — `err.name === 'AbortError'` discrimination (verify this exact check)
- `apps/mcp-server/src/infrastructure/fetchers/foreignFlowFetcher.ts` — another working AbortError check in codebase

## Architecture

**DDD Layer:** Infrastructure (`infrastructure/fetchers/`)

**Rationale:** The helper owns `AbortController`, `setTimeout`, and `clearTimeout` — pure I/O-timing side effects with zero business logic. Analogue to `bctcHttpFetcher.ts` (same pattern, same directory). All callers import downward only: interface → infrastructure, scheduler → infrastructure. No upward imports (ensured by architect's RISK-1 resolution: `macroFetch` receives `baseUrl` as parameter, not imported from `interface/`).

## Implementation Notes

1. **Error discrimination:** `withDeadline` distinguishes abort from network error by checking `err instanceof Error && err.name === 'AbortError'` (not `instanceof DOMException` — Bun convention per `foreignFlowFetcher.ts` and `clients.ts`). Network errors propagate unchanged.

2. **Timer cleanup:** The `finally` block executes on both success and error paths. Do NOT use `.then()` for cleanup — `finally` is the only correct pattern for unconditional cleanup that preserves error propagation.

3. **BaseUrl parameter:** `macroFetch` signature includes `baseUrl: string` as the FIRST parameter (RISK-1 resolution). Macro callers already have `const baseUrl = getMacroBaseUrl()` and pass it in. This prevents an upward import from `infrastructure/` to `interface/mcp/tools/macro/macroHttpClient.ts`.

4. **Honest degrade:** `macroFetch` returns `{ ok: false, degrade: DegradeEnvelope }` on any failure. The `degrade` envelope is the ONLY honest signal; there is no fabricated default value, empty array, or masked success.

5. **Attribution logging:** Both `withDeadline` and `macroFetch` call `console.error` once at the moment of failure, before re-throwing or returning the degrade envelope. This fires immediately and appears in logs even if the outer catch is silent.

6. **Deadline constraint:** All callers must supply `ms < 60_000` (gateway timeout ceiling). This is enforced by each task's own acceptance criteria, not by the helper itself (NFR-2, the helper is generic).

## Testing Strategy (for QA / code review)

- **Unit test:** Verify `withDeadline` fires `DeadlineError` when timeout expires, clears timer on success, propagates non-abort errors unchanged.
- **Unit test:** Verify `macroFetch` returns discriminated-result shapes for deadline, HTTP error, and network error cases.
- **Static check:** Code review confirms `clearTimeout` in `finally` block (AC-7).
- **Compile check:** `bun check` in `apps/mcp-server/` passes with zero errors (NFR-5).

## Blockers

None — this task has no external dependencies.

## Notes for Developer

- **Reference precedent:** `bctcHttpFetcher.ts` is the canonical implementation of this exact pattern. Replicate its structure, but make it generic via a callback parameter `fn`.
- **Do NOT import `console`** — it is a Bun global and will cause TypeScript error if explicitly imported.
- **Do NOT call `getMacroBaseUrl()`** inside the helper — it lives in `interface/`, which would be an upward import. Instead, `macroFetch` accepts it as a parameter from the caller.
- **Generic type parameter `T`:** Callers will specify the expected response type. The helper does not constrain `T`; use `<T = unknown>` as default if needed, but callers should specify explicitly (e.g., `macroFetch<Record<string, unknown>>(baseUrl, path, body, opts)`).
- **No retries in the helper:** `withDeadline` is not a retry wrapper — it is a deadline wrapper only. Retry logic (if needed) belongs in the caller or a separate utility.

---

**Task ID:** W2-T-1
**Estimated Duration:** 2h
**Status:** TODO
**Owner:** dev-mcp-server
