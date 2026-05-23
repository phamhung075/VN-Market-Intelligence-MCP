---
task_id: P1-G
pilot: stock-price
phase: 1
type: QA
title: "Phase 1 Close-Gate Verification (QA)"
owner: qa
status: READY
assigned_at: 2026-05-24T02:45:00Z
assigned_by: pm
blocked_by:
  - P1-E (DONE 2026-05-24T01:35:37Z, commit 8c8edbf1)
blocks:
  - Phase 1 exit gate (PO decision on phase-1-close-gate verdict)
description: |
  QA-led Phase 1 close-gate verification. Validates Phase 1 exit criteria:
  1. Sandbox all-green (3 tiers: primitive, module, all)
  2. Dashboard render ≥90% (all primitive/module/microservice cards present)
  3. G12 DoD streak confirmed (3/3 consecutive tasks with green sandbox evidence)
  4. R-CGO final verification (zero CGO/mattn imports in primitive/module/sandbox)
  
  Emits Phase 1 exit gate signal with GO / CONDITIONAL-GO / NO-GO verdict.
---

## Context

Stock-price Phase 1 (tasks P1-A through P1-E) is DONE. Per task plan §P1-G, QA now runs the close-gate verification to confirm Phase 1 meets all exit criteria. P1-F (optional 4th primitive) was SKIPPED because:
- G12 DoD streak is complete at 3/3 (P1-B1, P1-B2, P1-B3)
- No unmet G-goal depends on a 4th primitive
- Phase 1 time already fully allocated to core 3 primitives + module + dashboard + edit-rerun + env-audit

---

## Acceptance Criteria

### AC-1 — Sandbox All-Green (3 tiers)

Run all three sandbox tier commands from `apps/stock-price/`:

```bash
cd apps/stock-price
CGO_ENABLED=0 go run ./cmd/sandbox -tier=primitive -module=stock-price -scenario=all
CGO_ENABLED=0 go run ./cmd/sandbox -tier=module -module=stock-price -scenario=all
CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=stock-price -scenario=all
```

**Expected:** All three commands exit with code 0. All scenarios report PASS.

**Verdict:** PASS/FAIL  
**Evidence:** Paste stdout + exit codes below.

---

### AC-2 — Dashboard ≥90%

Open `apps/stock-price/dashboard/index.html` via `file://` (e.g., `open file:///Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/apps/stock-price/dashboard/index.html`).

Confirm:
- All 3 primitive cards visible (`price-quote-normalizer`, `tier-fallback-selector`, `price-staleness-classifier`)
- Module card visible (`price_resolution`)
- Microservice card visible (`stock-price` service)
- Zero console errors (F12 / developer tools)
- Zero pageerrors or requestfailed events

**Expected:** 5/5 cards rendered (3 primitives + 1 module + 1 microservice) = 100%.

**Verdict:** PASS/FAIL  
**Render %:** ___/5 × 100 = ___%  
**Console errors:** (count: ___)

---

### AC-3 — G12 Streak Confirmed (3/3 Tasks)

Verify that the first three sandbox-producing tasks (P1-B1, P1-B2, P1-B3) each have sandbox-green evidence in their handoff docs:

- **P1-B1** (docs/handoffs/TASK_P1-B1.md): AC-4 evidence shows `go run ./cmd/sandbox -tier=primitive -module=stock-price -scenario=all` exits 0 (3/3 scenarios PASS)
- **P1-B2** (docs/handoffs/TASK_P1-B2.md): AC-5 evidence shows all primitive scenarios green (6/6 PASS)
- **P1-B3** (docs/handoffs/TASK_P1-B3.md): AC-5 evidence shows all 9 primitive scenarios green (9/9 PASS)

**Verdict:** 3/3 CONFIRMED / INCOMPLETE  
**Evidence:** Brief summary of each handoff's sandbox-green proof.

---

### AC-4 — R-CGO Final Verification

Run the following grep to confirm zero CGO/mattn imports in the primitive/module/sandbox code:

```bash
cd apps/stock-price
grep -rn "mattn/go-sqlite3\|cgo\|import \"C\"" \
  pkg/primitive/ \
  pkg/module/ \
  cmd/sandbox/
```

**Expected:** Command exits with code 1 (zero matches). No output.

**Verdict:** PASS / FAIL  
**Exit code:** ___  
**Match count:** ___

---

### AC-5 — Phase 1 Exit Gate Report

Emit the Phase 1 exit gate signal to `docs/signals/qa-stock-price-phase1-close-gate-<UTC>.json` with the following structure:

```json
{
  "task_id": "P1-G",
  "pilot": "stock-price",
  "phase": 1,
  "agent": "qa",
  "status": "DONE",
  "timestamp": "<ISO-8601 UTC>",
  "ac_verdicts": {
    "AC-1": {
      "verdict": "PASS or FAIL",
      "sandbox_primitive": { "cmd": "...", "exit_code": 0, "result": "..." },
      "sandbox_module": { "cmd": "...", "exit_code": 0, "result": "..." },
      "sandbox_all": { "cmd": "...", "exit_code": 0, "result": "..." }
    },
    "AC-2": {
      "verdict": "PASS or FAIL",
      "cards_rendered": 5,
      "cards_expected": 5,
      "render_pct": 100,
      "console_errors": 0
    },
    "AC-3": {
      "verdict": "CONFIRMED or INCOMPLETE",
      "p1_b1_evidence": "brief summary",
      "p1_b2_evidence": "brief summary",
      "p1_b3_evidence": "brief summary"
    },
    "AC-4": {
      "verdict": "PASS or FAIL",
      "grep_cmd": "grep -rn \"mattn/go-sqlite3|cgo|import \\\"C\\\"\" pkg/primitive/ pkg/module/ cmd/sandbox/",
      "grep_exit_code": 1,
      "grep_match_count": 0
    }
  },
  "phase1_exit_criteria": {
    "criterion_1": {
      "name": "Time to first primitive",
      "measurement": "(from P1-A dispatch to P1-B1 DONE)",
      "target": "≤ 4 agent-hours",
      "result": "TBD"
    },
    "criterion_2": {
      "name": "Sandbox all-green",
      "measurement": "go run ./cmd/sandbox -tier=all -scenario=all exit code",
      "target": "0 (all scenarios PASS)",
      "result": "PASS / FAIL"
    },
    "criterion_3": {
      "name": "Dashboard ≥90%",
      "measurement": "Panels rendered / panels expected × 100",
      "target": "≥ 90%",
      "result": "100%"
    },
    "criterion_4": {
      "name": "G12 earned (3/3 streak)",
      "measurement": "QA counts consecutive DoD-Gate-satisfied tasks",
      "target": "3/3 verified",
      "result": "CONFIRMED"
    }
  },
  "phase1_gate_verdict": "GO or CONDITIONAL-GO or NO-GO",
  "phase1_gate_rationale": "(brief explanation of verdict)"
}
```

**Exit Gate Verdict Decision Rules** (per task plan §Phase 1 Exit Criteria):
- **GO** = all 4 criteria met → PO dispatches Phase 2
- **CONDITIONAL-GO** = 3 of 4 criteria met → cap Phase 2 at 1 task per sprint for next 2 sprints, then re-evaluate
- **NO-GO** = ≤2 criteria met → architect re-plans Phase 2 scope; do not start Phase 2

---

## Handoff Notes

### System Configuration
- Service: `apps/stock-price/` (Go, port 5000 internal / 5010 external per system-map.json)
- Sandbox: `CGO_ENABLED=0 go run ./cmd/sandbox -tier={primitive|module|all} -module=stock-price -scenario=all`
- Dashboard: `apps/stock-price/dashboard/index.html` (file:// standalone, zero network/CGO)
- Phase 1 completed tasks: P1-A, P1-B1, P1-B2, P1-B3, P1-C, P1-D, P1-E
- P1-F status: SKIPPED (optional, G12 streak already 3/3 complete)

### Key Verification Points
1. **Sandbox tiers must ALL exit 0** — if any tier fails, record specific scenario failures and do NOT declare PASS
2. **Dashboard must open via `file://` with zero network calls** — confirm in developer tools Network panel
3. **G12 streak is binding** — QA verifies ALL 3 handoff docs (P1-B1, P1-B2, P1-B3) show sandbox-green evidence before confirming 3/3
4. **R-CGO final check must show zero matches** — this is the last R-CGO verification; if it fails, escalate to architect before Phase 1 DONE

### Dependencies
- All Phase 1 core tasks (P1-A through P1-E) must be DONE with green signals before QA starts P1-G
- No external services required (sandbox uses only JSON fixtures, no VnDirect API, no SQLite connection)

### Exit Actions
- If **GO or CONDITIONAL-GO**: PO moves Phase 1 to CLOSED status and decides Phase 2 kickoff timing
- If **NO-GO**: Architect reviews phase plan and provides rework scope before Phase 2 dispatch

---

## Return Checklist

- [ ] AC-1 sandbox all-green verified (3 tiers, all exit 0)
- [ ] AC-2 dashboard ≥90% verified (5/5 cards, zero console errors)
- [ ] AC-3 G12 3/3 streak confirmed (all 3 handoff docs reviewed)
- [ ] AC-4 R-CGO final verification passed (zero CGO/mattn matches)
- [ ] AC-5 Phase 1 exit gate signal emitted (docs/signals/qa-stock-price-phase1-close-gate-<UTC>.json)
- [ ] Gate verdict declared (GO / CONDITIONAL-GO / NO-GO + rationale)
- [ ] This handoff returned with DONE status and verdict evidence
