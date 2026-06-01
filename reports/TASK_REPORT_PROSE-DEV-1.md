# Task Report: PROSE-DEV-1 — Prose Page OCR-Text Display Fix

**Date:** 2026-05-31
**Agent:** dev-mcp-server
**Commit SHA:** a10448b0
**Sprint:** PROSE-DEV-1
**Ref brief:** docs/architecture-briefs/2026-05-31-prose-text-loss.md (fe9683c5)

---

## Root Cause (Architect-Confirmed)

Layer C display defect. `handleBctcInspectOcr` in `bctcInspectHandler.ts` queries
`bctc_layout_units WHERE page_type='table'`. Prose pages (page_type='prose') are excluded
by this filter → query returns null → handler falls into the coverage-gap branch →
`text_content: ""` → viewer renders "No PEK unit for page N (non-table page)."

The raw OCR text exists in `pdf_extracted_text` for every page (ACB: 27 pages, all non-empty)
but was never read in the gap branch.

No data loss. No extraction or storage pipeline defect.

---

## DV Evidence — Before/After

### DV-1: RED (before fix)

```
Expected: "Prose page one content"
Received: ""
```

Assertion `expect(data.text_content).toBe("Prose page one content")` failed.
`text_content` was `""` and `confidence` was `0`.

### DV-1: GREEN (after fix)

```
5 pass
0 fail
```

All DV tests pass:
- DV-1: prose page with pdf_extracted_text row → text_content = "Prose page one content", confidence = 0.8
- DV-1b: confidence read from DB row (not hardcoded)
- DV-2: table page still returns PEK stitched_markdown (regression guard — unchanged)
- DV-3: no-PEK report still returns pdf_extracted_text via existing fallback (regression guard — unchanged)
- DV-3b: prose page with no pdf_extracted_text row → text_content = "" gracefully

---

## Type Check

`bun tsc --noEmit` output: only pre-existing errors in `src/__tests__/BSD3-brief-sector-drift.test.ts`
(untracked file, pre-dates this task). Zero new errors introduced by PROSE-DEV-1 changes.

---

## Regression Check

Targeted suite covering all inspect/PEK-related tests:
- `pek-render-seam.test.ts`: 12 pass, 0 fail (all existing PEK seam tests green including test (c)
  which asserts text_content="" for a page with no pdf_extracted_text row — still correct after fix)
- `PROSE-DEV-1-prose-text-display.test.ts`: 5 pass, 0 fail
- `1271-bctc-inspect-md.test.ts`: 6 pass, 0 fail
- `1273-bctc-inspect-overlay.test.ts`: 10 pass, 0 fail
- `PI3-bctc-inspect.test.ts`: 6 pre-existing failures (unrelated to this task, confirmed same
  failures exist on HEAD before this commit)

Full suite: Bun crashed internally on large suite run (known Bun memory issue on 300+ test files,
unrelated to this task).

---

## Files Touched

| File | Change |
|---|---|
| `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts` | Added pdf_extracted_text fallback SELECT in coverage-gap branch of handleBctcInspectOcr |
| `apps/mcp-server/src/interface/bctc-inspector.html` | pek_coverage_gap render branch now shows text_content when non-empty |
| `apps/mcp-server/src/__tests__/PROSE-DEV-1-prose-text-display.test.ts` | New DV test (5 cases) |

HCM-DISAMBIG-extraction.test.ts: 0 diff (constraint satisfied).
No domain, application, or infrastructure changes. No schema changes.

---

## Constraints Satisfied

- bun:sqlite used as `new Database(":memory:")` — no better-sqlite3
- Same filename→pdf_extracted_text lookup pattern as existing code (WHERE filename=? AND page_number=?)
- HCM-DISAMBIG untouched (git diff confirms 0 diff)
- No BCTC-AWARE files changed
- Scoped git add (3 files explicit)
- pek_coverage_gap:true preserved — correctly signals no PEK-refined table unit

---

## [QA] Review Record — cycle-177 · 2026-06-01

**Verdict: APPROVED**

### Gate Results

| Gate | Result | Evidence |
|---|---|---|
| G1 tsc | PASS | `bun tsc --noEmit` exits 0, no output — zero new errors |
| G2 DV-1 RED proof | CONFIRMED | git diff a10448b0 shows pre-fix `text_content: ""` hardcoded; no SELECT from pdf_extracted_text in coverage-gap branch → test was genuinely RED |
| G2 DV suite 5/5 | PASS | 5 pass / 0 fail — all DV cases green |
| G3 pek-render-seam | PASS | 12/0 pass |
| G3 1271+1273 viewer suites | PASS | 16/0 pass |
| G4 LIVE-SERVE page 1 | PASS | text_content=2081ch, pek_coverage_gap:true, has_pek:true |
| G4 LIVE-SERVE page 2 | PASS | text_content=134ch, confidence=0.8, pek_coverage_gap:true |
| G5 Image SHA | PASS | 33e4386c (new) vs 4446a6e9 (prior) — rebuild confirmed 2026-06-01T17:17Z |
| DDD | PASS | No new imports; interface→application pre-existing (correct layer) |
| Security | PASS | No process.env, no hardcoded secrets/tokens in changed files |

### Anti-False-Green Confirmation

DV-1 was not a tautology. The pre-fix handler at the coverage-gap branch had `text_content: ""` and `confidence: 0` as literal values (not computed). The SELECT from `pdf_extracted_text` was entirely absent. Adding it is the only path for the test assertion `expect(data.text_content).toBe("Prose page one content")` to become GREEN. Confirmed via `git show a10448b0` diff.

Live verification is direct behavior (text_content character count + confidence value), not HTTP 200 alone.
