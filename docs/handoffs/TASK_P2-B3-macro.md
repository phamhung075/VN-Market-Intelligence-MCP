---
task_id: "P2-B3"
phase: "2"
title: "G5 Terminal Verification (G5b HTTP + G5c zero TODO)"
owner: "qa"
goal: "G5 completion (both G5b MCP HTTP rewire + G5c TODO sweep verified)"
priority: "HIGH — critical path, unblocks P2-X1 primitives expansion"
estimated_hours: "0.25"
acceptance_criteria_count: "4"
date_authored: "2026-05-23"
authored_by: "pm c282-cycle-45"
---

# TASK P2-B3 — G5 Terminal Verification (G5b HTTP + G5c zero TODO)

**Blocked by:** P2-B2 DONE (TS deprecation must complete before verification)  
**Blocks:** P2-X1 (5 remaining primitives — safe to expand after G5 verification)  
**WIP claim:** qa  
**Anchor (binding pre+post):** 1776df8e (must remain ancestor throughout)  

---

## Context

G5 goal requires three sub-goals:
- **G5a:** apps/macro-indicators/src/ TS files → _deprecated/ (DONE by P2-B2, dev-macro-indicators)
- **G5b:** MCP tool handlers in apps/mcp-server HTTP-routed to Go service port 5004 (DONE by P2-B1, dev-mcp-server)
- **G5c:** Zero TODO.*migrat references in macro zone (this task verifies)

This task is **QA-only verification** — no code changes. QA reads the artifacts from P2-B1 (MCP HTTP rewire commits) and P2-B2 (TS deprecation commit) to confirm both halves of the G5 story are clean and integrated.

**Phase 2 task plan reference:** `docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-2-task-plan-go.md` §P2-B3 (lines 280–295).

---

## Acceptance Criteria (Machine-Verifiable)

### AC-1: G5b HTTP Routing Confirmed (MCP tool handlers → port 5004)

**Requirement:** P2-B1 rewired 4 MCP tools to route via HTTP to the Go macro-indicators service at port 5004. Verify zero direct domain service imports remain in the TS handler layer.

**Command:**
```bash
grep -rn "computeCarryTradeSignal\|computeYieldSpreadSignal\|getMacroCalendar\|fetchYahooFinancePrices|fetchSbvRates" \
  apps/mcp-server/src/interface/mcp/tools/macro/
```

**Requirement:** Must return **0 matches** (all 4 domain imports removed from TS handlers).

**Rationale:** TA pilot lesson L2 — direct domain imports in the interface layer violate DDD boundary. Charter §G5b requires HTTP routing. P2-B1 removed all direct calls; P2-B3 QA confirms removal.

**Evidence to record:** Paste exit code + result summary (should be empty).

---

### AC-2: G5c TODO Sweep (zero "TODO.*migrat" references)

**Requirement:** After P2-B2 TS deprecation, no lingering "TODO: migrate" comments remain in the macro zone.

**Command:**
```bash
grep -r "TODO.*migrat" \
  apps/macro-indicators/ \
  apps/mcp-server/src/interface/mcp/tools/macro/ \
  --include='*.ts' --include='*.go'
```

**Requirement:** Must return **0 matches** (exit 1).

**Rationale:** TA pilot lesson L5 — pre-revert tags and complete removal discipline prevent rollback temptation. Charter §G5c requires zero "TODO: migrate" to confirm mental model is "deprecated = archived, not staged for future work".

**Evidence to record:** Paste exit code + result summary (should be empty).

---

### AC-3: G5a TS File Deprecation Confirmed (from P2-B2)

**Requirement:** P2-B2 moved all non-scraper TS files to `_deprecated/`. Verify no stray TS files remain in the active zone.

**Command:**
```bash
find apps/macro-indicators/src \
  -path "*_deprecated*" -prune \
  -o -type f -name "*.ts" \
  -print | grep -v scraper
```

**Requirement:** Must return **0 results** (exit 0, no output = all TS in active zone either deprecated or scrapers).

**Rationale:** P2-B2 completion was already verified by QA (P2-B2 signal GREEN). P2-B3 spot-checks to confirm no regressions between P2-B2 close and this verification.

**Evidence to record:** Paste output (should be empty).

---

### AC-4: G5 Grade Evidence & Handoff Completion

**Requirement:** QA writes G5 grade summary to the **completion signal file** (no separate evidence doc needed — signal is the record).

**Structure:**

```json
{
  "agent": "qa",
  "cycle": "c282-cycle-??",
  "timestamp": "<ISO-8601-UTC>",
  "task_id": "P2-B3",
  "status": "DONE",
  "ac_results": {
    "AC-1_g5b_http_routing": "PASS",
    "ac1_grep_exit_code": 1,
    "ac1_result": "0 matches (all 4 domain imports removed from handlers)",
    "AC-2_g5c_todo_sweep": "PASS",
    "ac2_grep_exit_code": 1,
    "ac2_result": "0 matches (no TODO.*migrat references)",
    "AC-3_g5a_ts_deprecated": "PASS",
    "ac3_find_exit_code": 0,
    "ac3_result": "0 results (all non-scraper TS files in _deprecated/)",
    "AC-4_evidence_recorded": "PASS"
  },
  "g5_status_ready_to_flip": "YES (all 3 sub-goals G5a/G5b/G5c confirmed GREEN)",
  "anchor_1776df8e": "HELD (exit 0 pre-QA)"
}
```

**Rationale:** Charter §Decision Matrix waits for terminal goal states. G5 will flip from TBD → YES after this signal (PM responsibility to flip).

**Evidence to record:** Paste all three grep/find outputs confirming zero matches.

---

## Out of Scope (Explicit Bans)

- Do NOT modify any source files (QA verification task only)
- Do NOT touch `docs/data/pilot-status-macro-indicators.json` (SSOT — PM/PO owned)
- Do NOT flip goal status (PM/PO only per Charter §4.5)
- Do NOT modify `.golangci.yml`, `.github/workflows/ci.yml`, or `apps/technical-analysis/` (FROZEN from prior phases)

---

## Hard Gate Verification Commands

Embed these verbatim into your testing:

```bash
# 1. AC-1: G5b HTTP routing — zero direct domain imports in TS handlers
grep -rn "computeCarryTradeSignal\|computeYieldSpreadSignal\|getMacroCalendar\|fetchYahooFinancePrices|fetchSbvRates" \
  apps/mcp-server/src/interface/mcp/tools/macro/
# must exit 1 (zero matches)

# 2. AC-2: G5c TODO sweep — zero "TODO.*migrat"
grep -r "TODO.*migrat" \
  apps/macro-indicators/ \
  apps/mcp-server/src/interface/mcp/tools/macro/ \
  --include='*.ts' --include='*.go'
# must exit 1 (zero matches)

# 3. AC-3: G5a TS deprecation — zero stray TS in active zone
find apps/macro-indicators/src \
  -path "*_deprecated*" -prune \
  -o -type f -name "*.ts" \
  -print | grep -v scraper
# must exit 0 (zero results)

# 4. Anchor check pre-QA
git merge-base --is-ancestor 1776df8e HEAD && echo "HELD (exit 0)" || echo "BREAK (exit 1)"
```

---

## Downstream Handoff After Completion

1. **QA** creates completion signal `docs/signals/qa-macro-p2-b3-green-<UTC>.json` with all 4 ACs PASS
2. **PM (cycle-45)** reads completion signal → flips G5 status TBD → YES in pilot-status SSOT → commits atomically
3. **PM dispatches P2-X1 (5 remaining primitives)** — G5 clean unblocks primitives expansion

---

## References

- **Architect task plan:** `docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-2-task-plan-go.md` (§P2-B3)
- **P2-B1 (HTTP rewire):** `docs/handoffs/TASK_P2-B1-macro.md` (MCP tool handlers)
- **P2-B2 (TS deprecation):** `docs/handoffs/TASK_P2-B2-macro.md` (git mv src → _deprecated)
- **SSOT:** `docs/data/pilot-status-macro-indicators.json` (phase2.tasks.P2-B3 + goals.G5)
- **Charter binding:** `docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md` (§G5, §Decision Matrix)
