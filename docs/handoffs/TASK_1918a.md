# TASK_1918a — Alert Commander Macro Snapshot Shape Guard

**Task ID:** 1918a-alert-commander-macro-snapshot-guard
**Type:** FIX | **Priority:** HIGH | **Size:** S
**Zone:** `apps/mcp-server/` + `.claude/flows/alert-commander/`
**Branch:** main

---

## Problem

TNB c55 cycle-2 evidence (00:02Z + 06:02Z): `get_macro_snapshot` occasionally returns a
`system_status` payload shape (`{"status":"degraded","message":"..."}`) instead of the expected
macro regime text object (`{"text":"...","fetchedAt":"...","source_tier":2}`).

The `stage-bootstrap.md` retry-once logic treats any non-error HTTP response as valid — so a
wrong-shape response is accepted and downstream regime inference silently fails, producing phantom
`REGIME_SOURCE=news-fallback` without any warning.

## Root Cause

`get_macro_snapshot` always returns HTTP 200 with a JSON body. The stage-bootstrap flow only
retries on call failure (tool error / network timeout), not on shape mismatch. A
`system_status`-shaped response passes the retry gate and is then used for regime extraction,
which fails silently because the `text` field with the regime markers is absent.

## Fix Applied

### 1. Shape guard utility (new file)

`apps/mcp-server/src/interface/mcp/tools/macro/macroSnapshotGuard.ts`

Exports `isMacroSnapshotValidShape(value: unknown): boolean` — returns `true` only when value
is an object with a string `text` field. Any missing / non-string `text` (including
`{"status":"degraded",...}`) returns `false`.

### 2. Flow instruction update

`.claude/flows/alert-commander/stage-bootstrap.md` — added **Shape-validation gate** paragraph
in Step 0b (after retry-once logic). Gate fires on both initial attempt and retry. On `false`,
routes identically to call failure (news-fallback + `REGIME_SOURCE=news-fallback` + `[WARN]`
log line). References `macroSnapshotGuard.ts`.

### 3. Unit test

`apps/mcp-server/src/__tests__/1918a-macro-snapshot-shape-guard.test.ts` — 10 tests covering:
- Normal success payload accepted
- Minimal `{text}` payload accepted
- `{"status":"degraded","message":"..."}` rejected (core fixture)
- `{"status":"ok",...}` rejected
- Error payload `{source_tier,error}` rejected
- null / undefined / empty object / numeric text / non-object string rejected

---

## [Developer] Implementation Record

- **Files modified:**
  - `.claude/flows/alert-commander/stage-bootstrap.md` — added shape-validation gate paragraph in Step 0b
  - `docs/TASKS.md` — 1918a moved to Review
- **Files created:**
  - `apps/mcp-server/src/interface/mcp/tools/macro/macroSnapshotGuard.ts:33` — shape guard utility
  - `apps/mcp-server/src/__tests__/1918a-macro-snapshot-shape-guard.test.ts:71` — 10 tests, GREEN
  - `docs/handoffs/TASK_1918a.md` — this handoff
- **Tests written:** `apps/mcp-server/src/__tests__/1918a-macro-snapshot-shape-guard.test.ts` — 10 assertions, GREEN
- **Git commits:** _(pending commit below)_
- **tsc status:** clean (0 errors)
- **Full suite:** 10 pass / 0 fail (targeted) — macro/dispatch regression: 27/0
- **Docs updated:** `.claude/flows/alert-commander/stage-bootstrap.md` — shape-validation gate added | `docs/TASKS.md` — status update
- **Graphify:** skipped (flow doc edit, no architecture change)

---

## Acceptance Criteria

- [x] `isMacroSnapshotValidShape({status:"degraded"})` returns `false`
- [x] `isMacroSnapshotValidShape({text:"Global Liquidity: NEUTRAL",...})` returns `true`
- [x] stage-bootstrap.md gate: shape mismatch → news-fallback (same path as call failure)
- [x] 10/10 unit tests GREEN
- [x] tsc 0 errors
- [x] No regressions in macro/dispatch regression suite (27/0)
