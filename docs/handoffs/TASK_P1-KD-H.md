---
id: "P1-KD-H"
title: "Add reading-scorer 4th primitive to kinh-dich dashboard"
type: "FIX"
phase: "1"
pilot: "kinh-dich (fleet pilot 4)"
owner: "dev-kinh-dich"
zone: "apps/kinh-dich-service"
scope_single_file: "apps/kinh-dich-service/dashboard/index.html"
size: "XS"
priority: "high"
authorization_source: "docs/po-decisions/2026-05-24-kinh-dich-phase1-close-gate-fix-then-clean-go.md (Decision 2)"
authorization_signal: "docs/signals/po-kinh-dich-phase1-fix-then-clean-go-20260524T010315Z.json"
authorized_by: "po"
authorized_at: "2026-05-24T01:03:15Z"
charter: "docs/architecture-briefs/2026-05-23-kinh-dich-factory/pilot-charter.md (v2.0)"
---

# TASK_P1-KD-H — Add reading-scorer 4th primitive to kinh-dich dashboard

## Context

The kinh-dich Phase 1 close-gate ruled CONDITIONAL-GO (3/4 exit criteria met). The single failing criterion was **AC-2: dashboard ≥90% render**. The root cause is known and concrete: the reading-scorer primitive (shipped in P1-F via commit 43158e5c) was never added to the dashboard; it renders only **5/6 card groups = 83% < 90% gate**.

The PO accepted this fix-then-clean-GO authorization on 2026-05-24: complete this **one bounded dashboard task** (~15 min, single file), then QA re-verifies AC-2 only, then Phase 1 = **clean full GO**.

**Reference:** PO decision doc lines 40–59 (root-cause analysis), lines 62–88 (task authorization). This task is NOT a scope creep — it is the explicit completion of P1-G's missing AC-2 deliverable.

---

## Files Under Scope

**Owner:** dev-kinh-dich
**Zone:** `apps/kinh-dich-service`
**Single file:** `apps/kinh-dich-service/dashboard/index.html`

**Constraint:** This task touches **ONLY** `apps/kinh-dich-service/dashboard/index.html`. No foreign pilots, no SI-2 fleet index (`docs/dashboards/index.html` is stock-price's exclusive), no `window.__MODULE_DATA__` rewiring.

---

## Dependencies

- **Blocked by:** none (P1-F reading-scorer 4th primitive already shipped; domain layer complete)
- **Blocks:** Phase-1 clean-GO close (P1-KD-QA-AC2-REVERT gate)
- **WIP-1 serialization:** Apply after P1-G QA gate complete

---

## Acceptance Criteria

### AC-H1 — Reading-scorer card renders (6/6 dashboard groups)

**Statement:** Dashboard renders **6/6 card groups** (4 primitives + 1 module + 1 microservice). The reading-scorer primitive appears in the rendered HTML.

**Test:**
```bash
grep -c "reading-scorer" apps/kinh-dich-service/dashboard/index.html
```
**Expected:** `≥ 1` (exit 0)

**Rationale:** P1-D handoff §AC-2 checklist explicitly listed all 6 groups; P1-G re-verified this AC and found 5/6 only. Dashboard must render the complete service portrait.

---

### AC-H2 — Reading-scorer's real scenarios embedded (3 scenarios with 4 functions reflected)

**Statement:** The reading-scorer primitive's **3 actual scenarios** are added to `window.__PRIMITIVES_DATA__` with the SAME JSON shape as the existing 3 primitives (hao-encoder, hexagram-resolver, ngu-hanh-classifier). The card narrative reflects the 4 functions.

**Scenarios (use REAL output from the sandbox):**
- `reading-scorer-golden.json` — happy path (all fields correct)
- `reading-scorer-edge.json` — boundary case (e.g., tied scores)
- `reading-scorer-failure.json` — pathological input (e.g., empty predictions array)

**Data shape:** Match the embedded scenario pattern:
```javascript
{
  primitiveId: "reading-scorer",
  scenarioName: "reading-scorer-golden",
  inputs: { /* ... from sandbox output ... */ },
  expected: { /* ... */ },
  status: "not-run"  // IMPORTANT: not-run on cold open (see AC-H4)
}
```

**Functions reflected in card narrative:**
- `extractOutcomeScore(predictions) → number`
- `extractTrendScore(predictions) → number`
- `extractAction(actionText) → string` (NOT `(score)` — see P1-F contract note in SSOT §P1-F)
- `majorityVote(predictions) → string`

**Source of scenarios:** Run the sandbox runner to retrieve the REAL scenario outputs:
```bash
cd apps/kinh-dich-service
bun run src/sandbox/runner.ts --tier=all --module=kinh-dich --scenario=all
```

Extract the reading-scorer golden, edge, failure scenario blocks from the output and embed them verbatim.

**Rationale:** Honesty requires real data, not invented placeholders. The dashboard is the user trust layer and must reflect actual primitive behavior.

---

### AC-H3 — Panel description label updated (3 → 4 functions)

**Statement:** Line ~855 of the dashboard (the panel description text) is updated:

**Before:**
```
"3 pure TypeScript functions: hao-encoder, hexagram-resolver, ngu-hanh-classifier"
```

**After:**
```
"4 pure TypeScript functions: hao-encoder, hexagram-resolver, ngu-hanh-classifier, reading-scorer"
```

Also extend the function list in the narrative if present.

**Test:** Verify the updated string appears:
```bash
grep "4 pure TypeScript functions" apps/kinh-dich-service/dashboard/index.html
```
**Expected:** match found (exit 0)

**Rationale:** Documentation must match delivered primitives. This is a known stale label (noted in PO decision line 44).

---

### AC-H4 — Honesty contract preserved (NOT-RUN cold-open + self-contained)

**Statement:** All 14 embedded scenarios (12 original + 2 reading-scorer new) must have `status: "not-run"` on cold open. Dashboard MUST remain self-contained (`file://` works in browser without any `fetch`, XHR, or external CDN calls).

**Test A — NOT-RUN status:**
```bash
grep "status.*not-run" apps/kinh-dich-service/dashboard/index.html | wc -l
```
**Expected:** ≥ 14 (all embedded scenarios marked not-run)

**Test B — No fetch/XHR added:**
```bash
grep -E 'fetch|XMLHttpRequest|\bxhr\b|\.get\(|\.post\(' apps/kinh-dich-service/dashboard/index.html | grep -v '<!--' | wc -l
```
**Expected:** 0 (no network calls in script)

**Browser test:** Open `file://$(pwd)/apps/kinh-dich-service/dashboard/index.html` in a browser. No console errors, no red NOT-RUN badge on initial load (cold-open state).

**Rationale:** P1-E established the zero-credential sandbox contract. Phase 2 will introduce live-rerun via G9 PO Playwright; Phase 1 dashboards must stay honest (showing NOT-RUN until executed).

---

### AC-H5 — Sandbox stays 14/14 green (G12 DoD applies)

**Statement:** After modifying the dashboard file, the kinh-dich sandbox must still report **14/14 PASS** (all tiers: 12 primitives + 2 module). Exit code 0.

**Test:**
```bash
cd apps/kinh-dich-service
bun run src/sandbox/runner.ts --tier=all --module=kinh-dich --scenario=all
```

**Expected output (final line):**
```
[sandbox] PASS 14/14 (0 failed, 0 skipped)
```
**Exit:** 0

**G12 DoD Gate applies:** Per charter §G12 and dev-kinh-dich flow definition, the sandbox-green evidence **must be pasted into the RETURN block before task is marked DONE**. (Dashboard changes do not execute domain code, but the gate is mandatory for serialization and Phase 1 integrity.)

**Rationale:** Ensures the dashboard file itself introduces no regressions. Reading-scorer domain layer is unchanged (P1-F), but embedding its scenarios in the dashboard is a content/presentation change that requires end-to-end verification.

---

### AC-H6 — No scope bleed (dashboard-only, no SI-2, no foreign pilots)

**Statement:** This task touches **ONLY** `apps/kinh-dich-service/dashboard/index.html`. No other files are modified.

**Negative tests:**
```bash
# Should return 0 (no changes to SI-2)
git diff HEAD apps/kinh-dich-service/dashboard/index.html | grep -E '^---.*docs/dashboards' && echo FAIL || echo PASS

# Should return 0 (no module-layer rewiring)
grep -l "window.__MODULE_DATA__\s*=" apps/kinh-dich-service/dashboard/index.html && echo FAIL || echo PASS

# Should return 0 (no foreign pilot files touched)
git diff HEAD -- apps/technical-analysis apps/macro-indicators apps/stock-price 2>/dev/null | grep -q . && echo FAIL || echo PASS
```

**Rationale:** Maintains zone isolation and prevents scope creep during Phase 1 finalization.

---

## RETURN Block (before task DONE)

### Sandbox Green Evidence

Dev must paste the full sandbox output here:

```
[sandbox output — paste here after running: cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=all --module=kinh-dich --scenario=all]

[expected final line: [sandbox] PASS 14/14 (0 failed, 0 skipped), exit 0]
```

### File Changes Summary

```
[git diff HEAD -- apps/kinh-dich-service/dashboard/index.html]
```

### AC Checklist (dev self-verify before RETURN)

- [ ] AC-H1: `grep -c "reading-scorer" apps/kinh-dich-service/dashboard/index.html` → ≥ 1
- [ ] AC-H2: 3 real reading-scorer scenarios embedded (golden, edge, failure) with 4 functions reflected
- [ ] AC-H3: Line ~855 updated "3" → "4 pure TypeScript functions"
- [ ] AC-H4: All 14 scenarios have `status: "not-run"`; no `fetch`/XHR in dashboard code; file:// test passes
- [ ] AC-H5: Sandbox 14/14 PASS, exit 0 (paste evidence in RETURN block above)
- [ ] AC-H6: Only `apps/kinh-dich-service/dashboard/index.html` modified; no foreign files touched

---

## Next Steps (Post-DONE)

**1. PM verification:** Confirm all 6 ACs PASS, sandbox-green evidence present.

**2. QA AC-2-only spot re-verify:** Once P1-KD-H DONE, QA runs the AC-2-only re-verification task (**P1-KD-QA-AC2-REVERT** in SSOT):
   - Confirm 6/6 = 100% dashboard render
   - Confirm honest cold-open NOT-RUN preserved
   - Confirm file still self-contained (file:// works)
   - **On QA PASS:** PM flips phase1 status → `APPROVED`; Phase-1 = **clean full GO**

**3. No goal flips:** Per Charter §4.5, this task does NOT flip any G-goals. `goalsEarned` stays 0, `decisionMatrix` stays all-TBD. Goal flips are PO-only at 12/12 terminal atomic close.

---

## Contact

**Owner:** dev-kinh-dich
**Escalation:** If dashboard rendering / scenario embedding / sandbox integration issues arise, escalate to dev-kinh-dich + architect (DDD pattern question).
