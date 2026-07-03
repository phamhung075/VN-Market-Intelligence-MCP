---
sprint: FIX-BCTC-BANK-FORM-CLASSIFIER-BOLD-STRIP
branch: task/FIX-BCTC-BANK-FORM-CLASSIFIER-BOLD-STRIP
size: S
zone: apps/mcp-server/
depends_on: []
blocks: []
---

## TLDR

Bank-form classifier regex has zero tolerance for markdown emphasis markers. CTG's real agentic-refined markdown wraps section codes in bold (`**I**`, `**II**`, … `**XV**`). The anchors `^(XIII|…|I)(\.\d+)?$` and `^[AB]$` never match, so `isBankFormFromRows` classifies real bank-form rows as CORPORATE instead. Independent of FIX-BCTC-BANK-BS-COLUMN-ORDER; can ship in parallel.

## [PM] Planning Context

- **Zone:** apps/mcp-server/
- **File to Modify:**
  - `src/application/utils/bctcFormType.ts` — `isBankFormFromRows` function, around line 76

- **Acceptance Criteria:**
  - [ ] Strip markdown emphasis markers (`**`, `__`, leading/trailing `*`/`_`) from `code` field before testing ROMAN_SECTION and CORP_BALANCE anchors
  - [ ] Verify empirically: CTG income-statement pages 8-9 section codes (`**I**`, `**II**`, etc.) now match `ROMAN_SECTION` regex
  - [ ] No false positives introduced: test that VAS 3-digit codes (not wrapped in bold) still fail to match bold patterns (they never were bold to begin with)

- **Files to read first:**
  - `docs/architecture-briefs/2026-07-03-ctg-bs-realdata-root.md` § 4 (empirical evidence of the bug + fix)
  - `src/application/utils/bctcFormType.ts` lines 60-100 (ROMAN_SECTION + CORP_BALANCE + isBankFormFromRows)

- **Files to modify:**
  - `src/application/utils/bctcFormType.ts` (isBankFormFromRows, one line fix in the ROMAN_SECTION/CORP_BALANCE test logic)

- **Dependencies:**
  - None — this fix is independent and low-risk

- **Knowledge needed:**
  - `docs/architecture-briefs/2026-07-03-ctg-bs-realdata-root.md` § 4
  - `docs/policies/dev-standards.md`

- **Why This Fix:**
  - Markdown emphasis is the refine agent's convention for marking summary/header rows; classifier MUST tolerate it
  - Generic defect (not CTG-specific): any bank ticker whose refine agent emits bold-wrapped codes will hit this
  - Surgical fix: only affects the classifier, zero impact on parser or other layers
