# TASK 1899a-bloomberg-test-split — Bloomberg Test File Split (491L → 4 files ≤200L)

**Sprint:** SPRINT-S | **Size:** S | **Zone:** apps/news-fetch/__tests__/ | **Type:** REFACTOR

---

## TLDR

Split `apps/news-fetch/__tests__/1899a-bloomberg.test.ts` (491L) into 4 files ≤200L each by logical group. Pure file-boundary move — zero production-code changes, zero test-logic changes.

**Origin:** QA NB-2 from `TASK_1899a-bloomberg.md` § Non-Blocking Issues (split-policy decision).

---

## [Architect] Brownfield Findings

### Zone

`apps/news-fetch/__tests__/` (single zone, single service)

Specialist: `dev-news-fetch` (or `dev-mainserver-crawls` per TASKS.md row — same capability)

### Verified paths

- **Source (to delete):** `apps/news-fetch/__tests__/1899a-bloomberg.test.ts` — 491L, 41 `expect()` calls, 29 `it` blocks across 6 describe groups
- **Scraper under test:** `apps/news-fetch/src/infrastructure/scrapers/bloomberg-stealth.ts` — unchanged, not touched
- **Domain models:** `apps/news-fetch/src/domain/models.ts` — imported as `NewsSource`; unchanged
- **Existing test peers:** `1899a-reuters-fallback-dom.test.ts`, `1899a-reuters-fallback-lifecycle.test.ts`, `1899a-reuters-fallback-detect.test.ts` — already split by same policy; confirm naming convention matches

### Source file structure (verified line counts)

| Lines | Group | `it` blocks | `expect()` calls |
|-------|-------|-------------|-----------------|
| 1–113 | Shared preamble (imports, mocks, helpers) | — | — |
| 132–255 | `happy path — DOM extraction` | 8 | 11 |
| 257–277 | `maxItems cap` | 1 | 1 |
| 279–358 | `JSON fallback (__NEXT_DATA__)` | 5 | 8 |
| 360–382 | `PerimeterX challenge` | 2 | 4 |
| 384–424 | `browser lifecycle — close() called in all paths` | 3 | 5 |
| 426–456 | `error handling` | 2 | 5 (shared `it` with lifecycle close) |
| 460–491 | `normalizeDate` (top-level describe, outside outer wrapper) | 7 | 7 |
| **Total** | | **28 `it` blocks** | **41 `expect()`** |

Note: the outer `describe('1899a-bloomberg — BloombergStealth', ...)` wrapper (line 132–456) contains all groups EXCEPT `normalizeDate` (lines 460–491 are a separate top-level describe).

### Critical design constraint — preamble duplication

The source preamble (lines 1–113) contains:
1. `mock.module('playwright', ...)` — **must be registered before** the `await import(...)` call
2. `const { BloombergStealth, normalizeDate } = await import(...)` — **module-scope dynamic import**
3. `let activeMockPage` mutable module-scope state — consumed by every test

In Bun, `mock.module()` and `await import()` at module scope are **per-file**. There is no cross-file mock sharing. Therefore **each split file must carry its own complete preamble**.

However, preamble elements can be **trimmed per file** to control line count:
- `makeNextData()` helper (lines 122–127, 6L) — needed ONLY in `json-fallback` file
- `PX_CONTENT` constant (line 121, 1L) — needed ONLY in `perimeterx-lifecycle` file
- `CLEAN_CONTENT` constant (line 120, 1L) — needed in `dom`, `json-fallback`, `perimeterx-lifecycle` files; NOT in `normalize-date` file
- Section comment separators (8 × comment lines) — removable in split files; saves 8L each

### Target files — design spec

#### 1. `1899a-bloomberg-dom.test.ts` (estimated ~160L)

Content:
- Trimmed preamble: imports + `mockClose` + `buildMockPage` + `mock.module` + `await import` + `CLEAN_CONTENT` (omit `PX_CONTENT`, `makeNextData`)
- Top-level `describe('1899a-bloomberg — DOM extraction', () => {` (rename outer wrapper)
- `beforeEach(() => { mockClose.mockClear(); })`
- Nested `describe('happy path — DOM extraction', ...)` — 8 `it` blocks (lines 139–255)
- Nested `describe('maxItems cap', ...)` — 1 `it` block (lines 259–277)

Assertion count: 12 `expect()` calls.

#### 2. `1899a-bloomberg-json-fallback.test.ts` (estimated ~185L)

Content:
- Full preamble including `makeNextData` helper (no trimming — helper needed here)
- Top-level `describe('1899a-bloomberg — JSON fallback', () => {`
- `beforeEach` omissible (no `mockClose` assertion in this group) OR kept for symmetry
- Nested `describe('JSON fallback (__NEXT_DATA__)', ...)` — 5 `it` blocks (lines 281–357)

Assertion count: 8 `expect()` calls.

**Line count risk:** preamble(113) + `makeNextData`(6) + describe wrapper + JSON group(80) ≈ 202L raw. Developer must remove section comment separators (save 8L) to land at ~194L.

#### 3. `1899a-bloomberg-perimeterx-lifecycle.test.ts` (estimated ~190L)

Content:
- Trimmed preamble: omit `makeNextData` (not needed), keep `PX_CONTENT` and `CLEAN_CONTENT`
- Top-level `describe('1899a-bloomberg — PerimeterX + lifecycle', () => {`
- `beforeEach(() => { mockClose.mockClear(); })`
- Nested `describe('PerimeterX challenge', ...)` — 2 `it` blocks (lines 362–382)
- Nested `describe('browser lifecycle — close() called in all paths', ...)` — 3 `it` blocks (lines 386–424)
- Nested `describe('error handling', ...)` — 2 `it` blocks (lines 428–455)

Assertion count: 14 `expect()` calls.

**Line count calculation:** preamble without `makeNextData`(107) + describe open(1) + beforeEach(3) + PX+lifecycle+error content(97) + close(1) ≈ 209L. Developer **must** remove section comment separators AND inline the `mockClose.mockClear()` inside each `it` that needs it (3 lifecycle `it` blocks already call `mockClose.mockClear()` internally — the outer `beforeEach` is therefore redundant; removing it saves 3L → lands at ~200L). Alternatively, collapse the 3 describe groups into a single flat describe with no nesting.

**Preferred approach:** flatten — single `describe('1899a-bloomberg — PerimeterX + lifecycle', ...)` with all 7 `it` blocks at the same level, no sub-describes. Keeps file under 200L without requiring per-`it` mockClear calls (outer `beforeEach` handles it). Estimated 185L.

#### 4. `1899a-bloomberg-normalize-date.test.ts` (estimated ~60L)

Content:
- Minimal preamble: only the `normalizeDate` import is needed
  ```typescript
  import { describe, it, expect } from 'bun:test';
  const { normalizeDate } = await import('../src/infrastructure/scrapers/bloomberg-stealth.js');
  ```
  No `mock.module`, no `buildMockPage`, no `mockClose`, no `activeMockPage` — none needed
- Top-level `describe('normalizeDate', ...)` — 7 `it` blocks (lines 462–491, already top-level in source)

Assertion count: 7 `expect()` calls.

**Note:** This file does NOT need `mock.module('playwright', ...)` because it only imports `normalizeDate` (a pure function) and does not instantiate `BloombergStealth`. The dynamic import of the module will trigger Playwright's module import chain, but since `BloombergStealth` is never instantiated, no mock calls are made. If tsc or Bun runtime complains about the missing mock context, the developer can add a stub `mock.module('playwright', () => ({ default: { chromium: { launch: () => {} } } }))` as a guard — but this is only needed if Playwright module-level code executes on import.

### Reuse patterns

- Follow the exact same split pattern as the Reuters fallback split already in place:
  - `1899a-reuters-fallback-dom.test.ts` ← DOM group
  - `1899a-reuters-fallback-lifecycle.test.ts` ← lifecycle group
  - `1899a-reuters-fallback-detect.test.ts` ← detection group
- Each file uses its own preamble + `mock.module` + `await import` — confirmed working pattern

### Design decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Preamble strategy | Duplicate + trim per file | Bun mock isolation is per-module — no shared mock infrastructure possible |
| Outer describe naming | Rename per file (`1899a-bloomberg — <group>`) | Each file is an independent suite; avoids misleading outer wrapper |
| `normalizeDate` mock strategy | No `mock.module` needed | Pure function import; no browser instantiation |
| PerimeterX file line control | Flatten sub-describes OR remove section comment separators | Keeps ≤200L without logic change |
| `makeNextData` placement | JSON fallback file ONLY | Helper not needed elsewhere — trimming saves 6L in 3 other files |

### DDD layer assessment

This task operates entirely in `__tests__/` — no domain, application, or infrastructure layer files are modified. DDD compliance is automatic. The test files are not DDD-layered code.

### Test strategy

| Tier | Requirement |
|------|-------------|
| Unit | All 4 new files pass in isolation: `bun test apps/news-fetch/__tests__/1899a-bloomberg-dom.test.ts` (and individually for each file) |
| Glob | `bun test apps/news-fetch/__tests__/1899a-bloomberg-*.test.ts` — GREEN (29 pass, 0 fail) |
| Full suite | `bun test apps/news-fetch/` — baseline parity: 9306 pass / 36 fail unchanged |
| TypeScript | `bun tsc --noEmit` from `apps/news-fetch/` — 0 errors |

### Risk flags

| ID | Severity | Description | Mitigation |
|----|----------|-------------|------------|
| R-1 | MEDIUM | `bun:test` `mock.module()` state leaks across test files run in same process — if `normalizeDate` file runs after a file that mocked `playwright`, the mock may persist | Developer: run `normalizeDate` file in isolation first to verify; if leak confirmed, add `mock.module('playwright', ...)` stub as guard |
| R-2 | LOW | Line count for `perimeterx-lifecycle` file is tight (~200L) — section comment separators MUST be removed | Developer must count lines before commit; acceptance gate: `wc -l 1899a-bloomberg-perimeterx-lifecycle.test.ts` ≤ 200 |
| R-3 | LOW | `json-fallback` file also tight (~185–202L depending on preamble trim) — remove comment separator blocks | Same mitigation as R-2 |
| R-4 | INFO | Source file deletion must be explicit (`rm` or `git rm`) — not just file creation | Developer: verify source file absent after split; `bun test apps/news-fetch/__tests__/1899a-bloomberg.test.ts` should error with "file not found" post-split |
| R-5 | INFO | `normalizeDate` file does not carry `mock.module('playwright', ...)` — verify Playwright module-level code does not execute at import time and cause unhandled promise rejection | If issue arises, add minimal stub mock |

### Assertion count parity (required)

| File | `it` blocks | `expect()` calls |
|------|-------------|-----------------|
| `1899a-bloomberg-dom.test.ts` | 9 (8 DOM + 1 maxItems) | 12 |
| `1899a-bloomberg-json-fallback.test.ts` | 5 | 8 |
| `1899a-bloomberg-perimeterx-lifecycle.test.ts` | 7 (2 PX + 3 lifecycle + 2 error) | 14 |
| `1899a-bloomberg-normalize-date.test.ts` | 7 | 7 |
| **Total** | **28** | **41** |

Note: source file has 29 `it` blocks counted by grep (includes 1 `it` inside nested callbacks). Count by visual inspection is 28 discrete test cases. Developer must verify exact `it` count after split.

### Scan clean

True. No production code changes. No DDD violations. No cross-service dependencies. No new interfaces.

---

## Acceptance Criteria

- [ ] Source `apps/news-fetch/__tests__/1899a-bloomberg.test.ts` deleted
- [ ] 4 new files created, each ≤200L:
  - `apps/news-fetch/__tests__/1899a-bloomberg-dom.test.ts`
  - `apps/news-fetch/__tests__/1899a-bloomberg-json-fallback.test.ts`
  - `apps/news-fetch/__tests__/1899a-bloomberg-perimeterx-lifecycle.test.ts`
  - `apps/news-fetch/__tests__/1899a-bloomberg-normalize-date.test.ts`
- [ ] Total `expect()` calls across 4 files = 41 (parity with source)
- [ ] `bun test apps/news-fetch/__tests__/1899a-bloomberg-*.test.ts` GREEN
- [ ] Baseline parity: 9306 pass / 36 fail unchanged (full suite)
- [ ] `bun tsc --noEmit` — 0 errors from `apps/news-fetch/`

---

## Owner

`dev-news-fetch` (or `dev-mainserver-crawls`)

---

## Related

- Source handoff: `docs/handoffs/TASK_1899a-bloomberg.md` (§ QA NB-2)
- Reuters fallback split pattern: `apps/news-fetch/__tests__/1899a-reuters-fallback-{dom,lifecycle,detect}.test.ts`
- Split policy: `docs/policies/dev-standards.md` § Test File Template (200L cap)
