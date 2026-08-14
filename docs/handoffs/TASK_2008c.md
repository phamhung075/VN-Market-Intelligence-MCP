---
sprint: UC-CDC-P1
branch: task/2008c-flow-doc-calendar-gate-and-defense
size: M
zone: docs/agents/cowork-team/flow/
depends_on: []
blocks: []
---

## TLDR

Delete the `calendar_status` arg line from `telemetry.md` Step 6.0 (FR-A4), and add fail-loud + telegram anomaly detection to `pressure-read.md` Step 4.3 when an out-of-domain `calendar_status` value is encountered (FR-A5). Defense-in-depth once TASK_2008a's enum gate lands; handles legacy on-disk files predating the fix.

## [PM] Planning Context

- **Zone:** docs/agents/cowork-team/flow/
- **Task ID:** TASK_2008c (agent-father specialist)
- **Parent:** UC-CDC-P1 (3-way decomposition)
- **Acceptance Criteria:**
  - [ ] **FR-A4 Implemented:** Delete telemetry.md Step 6.0 circular arg line
    - `telemetry.md` L15 deleted: `"calendar_status": "<CALENDAR_STATUS from Step 4.3>",`
    - Rationale: That line read the value back from Step 4.2 (which itself read from `pressure-state.json`), re-closing the self-recycling loop that TASK_2008b breaks
  - [ ] **FR-A5 Implemented:** Fail-loud on out-of-domain calendar_status values in pressure-read.md Step 4.3
    - Step 4.3 (L52-89) enumeration updated: explicitly list the 5-value domain `{open, half_day, weekend, holiday, unknown}`
    - Any value NOT in that set triggers:
      - `console.error` or `log` message (follows existing pattern at L418/427)
      - `send_telegram(channel="bug", message="[pressure-read] out-of-domain calendar_status: <value>")` — anomaly visible instead of silent
    - Conservative fallthrough still applies (no new blocking behavior, matches today's safe default)
    - NO rate-limit needed (unlike staleness warning): once TASK_2008a+TASK_2008b land, stale out-of-domain value self-heals within one tick (every emit recomputes server-side, and enum gate blocks new bad values)
  - [ ] **File-size justification updated:** Refresh stale size-justification headers
    - `telemetry.md` header count currently `153L justified / 164L actual` (predates this task)
    - `pressure-read.md` header count currently `90L justified / 105L actual` (predates this task)
    - FR-A4 reduces telemetry.md by ~1L; FR-A5 adds ~8-10L to pressure-read.md; update headers to reflect
    - Cap: 120L for `docs/agents/*/flow/**/*.md` per `file-size-caps.json` — both files stay under after edits
  - [ ] **Test Coverage:** Verification via live-tick notebook observation (no unit test twin)
    - Step 4.3 is pure LLM-narrated prose (no JS/TS mirror like `cowork-match-slots.js`/`cadence-policy.js`)
    - Post-deploy, observe next tick carrying a legacy/manual out-of-domain value (or synthetic dry-run)
    - Assert: `send_telegram(channel="bug")` was called + message appears in cowork-team signal

- **Files to read first:**
  - `docs/handoffs/UC-CDC-P1-BA-spec.md` § [Architect] Brownfield Findings (FR-A4/A5 verification, edge cases)
  - `docs/agents/cowork-team/flow/telemetry.md` (L15 exact line to delete, file-size header)
  - `docs/agents/cowork-team/flow/pressure-read.md` (Step 4.3 L52-89, L69 current suppression check, L89 fallthrough, file-size header, existing error pattern)

- **Files to modify:**
  - `docs/agents/cowork-team/flow/telemetry.md` (delete L15, refresh header count)
  - `docs/agents/cowork-team/flow/pressure-read.md` (add enumeration + fail-loud in Step 4.3, refresh header count)

- **Dependencies:** None (TASK_2008a and TASK_2008b are independent)

- **Knowledge needed:**
  - `docs/policies/dev-standards.md` (flow-doc authoring, file-size caps)
  - Flow-doc patterns: `send_telegram(channel="bug")` precedents in the codebase
  - LLM-narrated prose style (no code, but precise logic narration)

## Design Rationale

**Double-layer defense:** TASK_2008a's enum gate prevents NEW out-of-domain values from being written, but legacy on-disk `pressure-state.json` files created before the fix ships may still carry stale literals like "closed"/"off_market". FR-A5 makes those anomalies visible (log + telegram) instead of silently treating them as safe. Once the fix lands, any old file is overwritten within one tick by fresh server-computed values, so this is truly defense-in-depth: catches the legacy window, self-heals automatically.

**Conservative fallthrough:** FR-A5 explicitly does NOT add a new blocking behavior (no "PRESSURE_MODE = legacy" gate on unrecognized values) — it only adds visibility. The safe default is no-suppression, which is what an unrecognized value already gets. This preserves the tool's existing fail-safe-by-default philosophy.

**Deletion not drive-by:** FR-A4 is a straight deletion (one line, no logic change needed). It simply removes the redundant arg that re-closes the loop TASK_2008b opens.

## Architect Verification (2026-08-14)

- File/line targets re-verified live (`telemetry.md:15`, `pressure-read.md` Step 4.3 L52-89)
- Edge case handled: legacy on-disk files with "closed"/"off_market" — self-heal within one tick after TASK_2008a lands
- No new dependencies: `send_telegram(channel="bug")` already used elsewhere in flow-docs for anomaly detection (e.g., `spawn-fanout.md` IDENTITY_CHECK=FAIL)
- Test strategy noted: LLM-narrated prose has no unit test, verification via live-tick observation (same precedent as other Step 4.3 logic)

---

## RETURN (to be filled by developer)

Task complete → git commit with `Task: TASK_2008c` trailer + acceptance criteria list
