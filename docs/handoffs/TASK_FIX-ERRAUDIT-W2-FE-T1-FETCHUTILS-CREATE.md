---
task_id: FIX-ERRAUDIT-W2-FE-T1-FETCHUTILS-CREATE
type: sprint-task
title: T-1 Create fetchUtils.ts with safeFetch, proxyUpstream, safeFetchOrNull
epic: FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH
zone: apps/frontend/
owner: dev-frontend
size: S
created_at: 2026-06-16T07:00:00Z
created_by: pm
depends_on: []
---

## Summary

Create the new file `apps/frontend/app/lib/api/fetchUtils.ts` with three typed fetch helpers: `safeFetch<T>`, `proxyUpstream`, and `safeFetchOrNull<T>`. This is the foundation for bounding all frontend fetch sites (loaders, proxies, non-fatal wrappers) with a common 55s deadline and structured error logging.

## Acceptance Criteria

- [ ] File created at `apps/frontend/app/lib/api/fetchUtils.ts`
- [ ] Exports `FETCH_DEADLINE_MS = 55_000` constant
- [ ] Exports `safeFetch<T>(url, parse, opts?)` with signature matching architect blueprint
  - Accepts `url: string`, `parse: (raw: unknown) => T`, optional `opts: { deadlineMs?: number; label?: string }`
  - Returns `Promise<{ data: T; error: string | null }>`
  - Creates `AbortController`, arms `setTimeout(deadlineMs)`, passes `signal` to `fetch`
  - Calls `parse(raw)` on 2xx response JSON; calls `parse(null)` on error/degrade
  - Logs single `console.error` on non-2xx, parse failure, or abort
  - Clears timeout in `finally` block
  - Spec ref: Architect design D-1, lines 184–251
- [ ] Exports `proxyUpstream(upstream, init?, opts?)` 
  - Accepts `upstream: string`, optional `init?: RequestInit`, optional `opts`
  - Returns `Promise<Response>` relaying upstream response as-is (binary-safe via `arrayBuffer`)
  - On deadline abort: returns 504 with `{ error: 'upstream timeout' }`
  - On network error: returns 502 with `{ error: message }`
  - Logs single `console.error` per degrade path
  - Clears timeout in `finally` block
  - Spec ref: Architect design D-1, lines 253–299
- [ ] Exports `safeFetchOrNull<T>(url, parse, opts?)`
  - Accepts `url: string`, `parse: (raw: unknown) => T | null`, optional `opts`
  - Returns `Promise<T | null>`
  - On any error (network, abort, non-2xx, parse failure): logs `console.error` and returns `null`
  - On success: calls `parse(raw)` and returns result (caller handles parse returning null)
  - Clears timeout in `finally` block
  - Spec ref: Architect design D-1, lines 301–339
- [ ] Timer type annotation uses `ReturnType<typeof setTimeout>` to resolve Node vs DOM `Timeout` ambiguity (matches tsconfig ES2022 + @remix-run/node)
- [ ] No imports from domain layers, routes, or components (terminal node in DDD graph)
- [ ] No import of external logger module — uses `console.error` only (global)
- [ ] `pnpm check` passes on the file in isolation (zero TypeScript errors)

## Technical Notes

**Implementation Contract (from architect blueprint):**
- `parse(null)` must be callable by callers and return the empty-shape `T`. Each caller's parser is responsible for handling `raw === null` → empty struct (e.g., `{ items: [], count: 0 }`)
- `label` parameter defaults to URL if not supplied; used in console.error attribution
- `deadlineMs` defaults to `FETCH_DEADLINE_MS` (55_000) if not supplied
- Both `safeFetch` and `proxyUpstream` use independent `AbortController` + `setTimeout` inside each function (not coordinated with any caller-supplied signal for now)
- Abort error detection: `err instanceof Error && err.name === 'AbortError'` (confirmed Bun-compatible)

**Risk Mitigations (from architect):**
- RISK-3: Use `let timerId: ReturnType<typeof setTimeout> | undefined` to avoid Node vs DOM Timeout ambiguity under @remix-run/node

**Edge Cases:**
- EC-1: Timer cleanup on fast path — `clearTimeout(timerId)` in `finally` block (always, no condition)
- EC-2: AbortError discrimination — for now, any `AbortError` from the internal controller is a deadline abort
- Timer must be cleared even on success path to prevent stale `controller.abort()` after response processed

## Test Gate (QA Ownership)

Unit tests (dev-frontend drafts, QA verifies):
- `safeFetch` success path returns `{ data: T, error: null }`
- `safeFetch` non-2xx returns `{ data: emptyT, error: 'upstream NNN' }` + logs
- `safeFetch` abort returns `{ data: emptyT, error: 'AbortError: ... after 55000ms' }` + logs
- `safeFetch` parse throw returns `{ data: emptyT, error: 'parse error: ...' }` + logs (calls `parse(null)`)
- `proxyUpstream` success relays body + status + Content-Type + logs nothing
- `proxyUpstream` abort returns 504 `{ error: 'upstream timeout' }` + logs
- `proxyUpstream` network error returns 502 `{ error: ... }` + logs
- `safeFetchOrNull` success returns parsed value
- `safeFetchOrNull` any failure returns `null` + logs

## Next Step (on completion)

- Code complete + `pnpm check` green → ready for T-2/T-3/T-4 (can run in parallel after T-1)
- Successor tasks: T-2 (Cluster C in client.ts), T-3 (Cluster B proxies), T-4 (Cluster A loaders)

## Reference

- Architect blueprint: `docs/handoffs/FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH-architect-design.md` § D-1 (lines 174–350)
- BA spec: `docs/handoffs/FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH-BA-spec.md` § Deliverables (D-1)
- Full implementation contract: architect design lines 184–251 (fetchUtils.ts complete code)
