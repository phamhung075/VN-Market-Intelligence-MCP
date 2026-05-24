---
task_id: "P2-I"
task_title: "G6 Finalization — Dashboard Deprecated-Notice + Phase-2 Wired-State Display"
pilot: "alert-engine"
phase: "2"
charter_ref: "docs/architecture-briefs/2026-05-24-alert-engine-factory/pilot-charter.md"
plan_ref: "docs/architecture-briefs/2026-05-24-alert-engine-factory/phase-2-task-plan-go.md §P2-I"
ssot_ref: "docs/data/pilot-status-alert-engine.json"
owner: "dev-alert-engine"
blocked_by: "P2-H"
blocks: "P2-J"
status: "READY"
sequenced_at: "2026-05-24T094800Z"
sequenced_by: "pm"
---

# TASK P2-I — G6 Finalization: Dashboard Deprecated-Notice + Phase-2 Wired-State Display

## Context

G6 dashboard stub exists from Phase-1 (P1-D). Phase-2 finalization adds two transparency elements:

1. A "Deprecated" notice section listing `pkg/domain/_deprecated/services_v1.go` (G5a transparency — shows what code was superseded by the module).
2. Microservice panel update: note that `alert_pipeline` module is now wired in the composition root (G3 wired state — trust layer shows the Phase-2 architectural change).

All existing panel cards (primitives, module, microservice) and the SI-2 disavowal HTML comment remain untouched.

**Background note:** A background UX workstream already relabeled the dashboard's category chips (commit 099f8819) from `golden/edge/failure` to `Valid Input / Edge Case / Bad Input → Error` via a CATEGORY_LABELS map. P2-I must BUILD ON the current file state — do NOT revert that relabel.

## Files Touched

- `apps/alert-engine/dashboard/index.html` (MODIFY — add G5a `_deprecated/` notice + update microservice panel to reflect Phase-2 wired state; NO SI-2 touch)

## Acceptance Criteria

### AC-1 — Dashboard File Exists and Opens via `file://`

**Command:**
```bash
test -f apps/alert-engine/dashboard/index.html && echo FOUND
```

**Verdict:** Echoes FOUND. File opens via `file://` with zero network calls (QA verifies cold open).

**Evidence:**
```
[Paste test result here]
```

---

### AC-2 — Deprecated Notice Present

**Command:**
```bash
grep -c "_deprecated\|services_v1\|deprecated" apps/alert-engine/dashboard/index.html
```

**Verdict:** Must return ≥1 (the G5a notice mentions the deprecated file path).

**Evidence:**
```
[Paste grep count and sample matches here]
```

---

### AC-3 — SI-2 Disavowal Comment Still Present

**Command:**
```bash
grep -c "SI-2 NOTE\|docs/dashboards/index.html.*stock-price-EXCLUSIVE" \
  apps/alert-engine/dashboard/index.html
```

**Verdict:** Must return ≥1 (the Phase-1 baked disavowal comment is intact).

**Evidence:**
```
[Paste grep count and the disavowal comment line here]
```

---

### AC-4 — Zero Credentials Still Clean

**Command:**
```bash
grep -c "TELEGRAM\|BOT_TOKEN\|CHAT_ID\|API_KEY\|SECRET\|TOKEN\|PASSWORD\|mattn" \
  apps/alert-engine/dashboard/index.html
```

**Verdict:** Must return 0.

**Evidence:**
```
[Paste grep result (should be 0 or empty) here]
```

---

### AC-5 — G12 DoD Gate

**Command:**
```bash
cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all
```

**Verdict:** Exits 0. All ≥11 scenarios PASS. Paste output to handoff doc.

**Evidence:**
```
[Paste sandbox output summary: total=11 pass=11 fail=0 status=OK here]
```

---

## Commit

**Subject pattern:**
```
feat(alert-engine): P2-I — dashboard G6 finalization (deprecated-notice + Phase-2 wired-state) (G6)
```

---

## Important Notes

**SI-2 Boundary (MANDATORY):** alert-engine MUST NOT create or modify `docs/dashboards/index.html` under any circumstances. The SI-2 disavowal HTML comment already baked in P1-D must remain present in `apps/alert-engine/dashboard/index.html`.

**G6 Goal Posture:** NO goal flips. G6 evidence advances but does NOT flip to YES here. §4.5 SSOT untouched (goalsEarned stays 0, decisionMatrix all-TBD). PO flips G6 only at 12/12 terminal Phase-3 close.

---

## Evidence — AC-1

[Paste test output here]

---

## Evidence — AC-2

[Paste grep output + sample deprecated notice text here]

---

## Evidence — AC-3

[Paste grep output + disavowal comment text here]

---

## Evidence — AC-4

[Paste grep result (0) here]

---

## Evidence — AC-5 (G12 DoD Gate)

[Paste sandbox output: total scenarios, pass count, fail count, status, exit code]

---
