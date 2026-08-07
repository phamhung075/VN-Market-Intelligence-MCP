# TASK 004 — Naming Contract Documentation (FR-5, FR-6)

**Parent:** FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING (P1, plan_only, supervised)
**Acceptance Ratified By:** Architect (2026-08-07, not contingent on amendments)
**Zone:** cross-service/standards (documentation only, no code)
**Size:** XS (two documentation-only edits)
**Estimated Duration:** ~30 min

---

## Overview

This task extends the Signal Bus Naming Contract in `docs/standards/mcp-tools.md` to document two file families (`bctc_signal_*` and `unified-agent-synthesis-*`) that currently exist but are invisible to the SSOT contract. It also adds a one-line clarification to `drain-signals.md` confirming that the dedup fingerprint is content-based and filename-independent (closing AC-3 audit trail).

**Context:** Today's Naming Contract documents only the generic `{from}-{ISO8601-timestamp}.json` pattern. A future auditor cannot discover the ticker-keyed or dish-keyed families by reading the contract alone, which is how the collision class this row fixes remained undocumented until discovered by incident.

---

## Acceptance Criteria

### AC-1: New Subsection in mcp-tools.md (FR-5)
- **Location:** `docs/standards/mcp-tools.md`, add a new subsection after the existing `## Signal Bus — Naming Contract` section (currently lines 148-164)
- **Title:** `### Ticker-keyed and dish-keyed file families (WINDOW_KEY component, FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING)`
- **Content (verbatim from architect brief, §6):**
  ```markdown
  Two file families exist outside the generic `{from}-{ISO-timestamp}.json` pattern above — 
  both MUST carry a WINDOW_KEY (scheduled cron fire-window, UTC, rounded down to the slot's own 
  cadence granularity — never a run-start timestamp / raw `cycle_id`) as their cycle discriminator:

  - `docs/signals/bctc_signal_{TICKER}_{WINDOW_KEY}_{mode}.json` — bctc-analyst, per-ticker,
    `mode` ∈ {routine, release}. `{WINDOW_KEY}` example: `20260807T2100Z`.
  - `docs/data/unified-agent-synthesis-{CYCLE_DATE}-{SLOT_ID}[-{HOUR_COMPONENT}].json` —
    chef/unified-agent. `{HOUR_COMPONENT}` present ONLY for the multi-fire `intraday` slot; absent
    for single-fire slots (morning/eod/evening), which already collapse to 1 file/window once
    `{CYCLE_DATE}` itself is UTC-anchored.

  **WINDOW_KEY invariant:** for any given writer, the SAME value backs both this filename component
  AND that writer's published-marker mutex key (`task_claim` on `published:<slot>:<key>`) — never
  independently re-derived. Two peers of the identical scheduled window are EXPECTED to collide on
  this key by design; the mutex, not the filename, is what prevents the second peer's write (see
  NFR-5 — same-window peer collisions are a different, separately-owned hazard).
  ```

### AC-2: Location in File Hierarchy
- **Requirement:** The new subsection must be placed AFTER the existing generic contract block (the block that documents the `{from}-{ISO-timestamp}.json` pattern)
- **Ordering:** It extends the contract, not replaces it — readers should see the generic pattern first, then learn about these two special families
- **Line numbers:** Will shift after insertion; use section heading as reference, not line number

### AC-3: drain-signals.md One-Liner (FR-6)
- **Location:** `docs/agents/dev-team/flow/drain-signals.md`, near §0a-1's fingerprint description
- **Current context:** The brief notes that drain-signals.js computes `fingerprint = sha256(from+type+payload+createdAt)` — the filename never enters the hash
- **Action:** Add one line of documentation:
  ```markdown
  Filename is never part of the fingerprint; renaming a writer's basename convention 
  (e.g. WINDOW_KEY-keying, FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING) requires no change here.
  ```
- **Placement:** Immediately after the fingerprint description, as part of the same paragraph or as a new bullet
- **Tone:** Brief, factual (this is documentation, not speculation)

### AC-4: No Code Changes
- **Requirement:** The file `scripts/agents-flow/drain-signals.js` is NOT modified in this task
- **Rationale:** No code change is needed; the invariant already holds; documentation only

---

## Files Modified

1. **`docs/standards/mcp-tools.md`**
   - Add new subsection after lines 148-164 (the existing Naming Contract block)
   - Title: `### Ticker-keyed and dish-keyed file families (WINDOW_KEY component, FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING)`
   - Content per AC-1 above

2. **`docs/agents/dev-team/flow/drain-signals.md`**
   - Locate §0a-1 (fingerprint description)
   - Add one-line note per AC-3

---

## Dependencies

- **Blocked by:** 
  - TASK-002 (needs bctc_signal filename documentation to be up-to-date)
  - TASK-003 (needs unified-agent-synthesis filename documentation to be up-to-date)
- **Blocks:** None (documentation only)

---

## Test Strategy

- **Smoke test:** Read both sections with the new content and verify they make sense to someone unfamiliar with the row
- **Cross-check:** Verify the examples (e.g., `20260807T2100Z`) match the patterns defined in TASK-002 and TASK-003
- **Link integrity:** Confirm the cross-reference to FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING is accurate

---

## Scope Clarifications

- **Generic pattern NOT modified:** The existing `{from}-{ISO8601-timestamp}.json` documentation remains unchanged
- **drain-signals.js NOT modified:** Code is unchanged; only documentation added
- **Not a behavior change:** NFR-4 already holds (filename independent of fingerprint) — this task documents an existing invariant

---

## Implementation Notes

1. **Formatting:** Match the existing Naming Contract section's markdown style (bullet points, bold for key terms)
2. **Example WINDOW_KEY:** The example `20260807T2100Z` represents 2026-08-07 at 21:00 UTC (compact ISO form, per architect brief §2)
3. **HOUR_COMPONENT bracketing:** The `[-{HOUR_COMPONENT}]` notation (square brackets) indicates it is optional (present only for intraday)
4. **Placement:** This new subsection is at the same level as the existing contract section (### heading), not nested under it

---

## Decision Journal

- **Ratified 2026-08-07 by Architect** as part of FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING Phase 1
- **Amendment notes:** None — FR-5 and FR-6 carry no binding amendments

## ACCEPTANCE HANDOFF

Checklist for developer before marking DONE:
- [ ] mcp-tools.md: new subsection added after the existing Naming Contract block
- [ ] mcp-tools.md: subsection title and content match the architect brief §6 (verbatim)
- [ ] mcp-tools.md: examples (WINDOW_KEY, HOUR_COMPONENT) are accurate and match TASK-002/TASK-003 patterns
- [ ] mcp-tools.md: NFR-3/NFR-5 guidance documented in the invariant paragraph
- [ ] drain-signals.md: §0a-1 has the one-line clarification added
- [ ] drain-signals.js: NO code change (verify via git diff)
- [ ] Cross-check: section formatting/style matches existing sections in both files
