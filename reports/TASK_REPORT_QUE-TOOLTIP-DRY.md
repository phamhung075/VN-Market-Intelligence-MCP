## Task Report — QUE-TOOLTIP-DRY (3 subtasks)

**QA agent:** qa
**Date:** 2026-06-12
**Sprint:** QUE-TOOLTIP-DRY
**Frontend image:** sha256:e47f66ad6d1e (healthy, /health 200)

---

### Subtask 1a — DEV-KINH-DICH-QUE-TOOLTIP-PIPELINE

**changed:**
- `scripts/gen-que-descriptions.ts` — rewritten to readFileSync que-reference.js, strip JS wrapper, JSON.parse, emit 2-field interface
- `apps/frontend/app/lib/que-descriptions.generated.ts` — regenerated (64 entries, 2 fields: coreMeaning + marketTrendLabel, header cites que-reference.js)
- `apps/frontend/app/components/QueName.tsx` — state_trend → marketTrendLabel, italic removed from secondary line

**tests:** 14 pass / 0 fail (QUE-TOOLTIP-DRY-1a-codegen-pipeline.test.ts) | tsc: 0 errors | ddd: PASS | security: PASS | mock-guard: PASS

**verdict: APPROVED**

---

### Subtask 1b — DEV-KINH-DICH-QUE-TOOLTIP-FR1-NFR

**changed:**
- `apps/frontend/app/routes/dashboard.kinh-dich-signals.tsx` — QueName import added (L55), SnapshotRow L484-L489 replaced with `<QueName hexagram={item.hexagramNumber} name={item.hexagramName} />`

**tests:** 14 sprint tests GREEN (from 1a) | tsc: 0 errors | ddd: PASS | security: PASS | mock-guard: PASS
**NFR-1:** 0 Tooltip* in routes/ (exit 1 confirmed)
**NFR-2:** 0 hexagram description text hardcoded in routes (all grep hits are API field docs, sentiment labels, sector labels — not QUE_DESCRIPTIONS content)
**NFR-3:** QueName L40-45 fallback intact, hexagram=0 undefined test GREEN
**FlipRow (PO-Q4 regression):** PLAIN — no QueName, no tooltip — deferral intact

**verdict: APPROVED**

---

### Subtask 3 — DEV-MCP-SERVER-QUE-DOWNSTREAM-ANNOTATION

**changed:**
- `apps/mcp-server/src/domain/services/kinhDich/hexagramLibrary.ts:1-8` — 3-line `//` comment replaced with 7-line JSDoc declaring AUTO-GENERATED downstream of que-reference.js

**tests:** 107 pass / 0 fail (kinhDich targeted: 280+301+285+302) | tsc: 0 errors | mock-guard: PASS
**Data changes:** zero (QUE_DATA, QUE_META, all 64 hexagram records untouched)

**verdict: APPROVED**

---

### Pre-existing test failures (out-of-scope, DO NOT attribute to sprint)

Full frontend suite: 1330 pass / 170 fail — baseline confirmed by stash probe pre-sprint.
The 170 failures include: ~47 TopNav nav-count tests (document.body jsdom issue), BCTC eval tests, PageHeader component tests, fetchShareholders/CorporateEvents/WatchlistPrices tests — all pre-existing before QUE-TOOLTIP-DRY commits.
The 14 sprint tests (QUE-TOOLTIP-DRY-1a-codegen-pipeline.test.ts) are GREEN; no new failures introduced.

---

### BCTC Eval Gate

Not applicable — no BCTC report in scope for this sprint.

---

### Verdict: ALL 3 SUBTASKS APPROVED
