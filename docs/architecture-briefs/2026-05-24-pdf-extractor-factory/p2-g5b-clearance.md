---
title: "P2-G5b Clearance Brief — pdf-extractor Pilot Phase 2"
date: "2026-05-24"
author: "architect"
pilot: "pdf-extractor"
phase: "2"
task: "P2-G5b-clearance"
verdict: "BLOCKED"
clearance: "BLOCKED"
---

# P2-G5b Clearance Brief

**Generated:** 2026-05-24T10:07Z by architect (P2-G5b-clearance task)
**Verdict:** BLOCKED
**MOOT test:** PARTIAL MOOT — `fetch_ssc_reports` tool already removed; `bctc_batch_sweep` does NOT call the frozen write-chain. BUT: the behavioral bugs anchoring the freeze are unresolved, and 1954c consolidation never landed. G5b cannot be declared MOOT in full because the freeze anchor (1953-G-FAIL fixCycles=6, unresolved) is a standing NO-DISPATCH guard on the entire BCTC write-chain path — not just on specific call paths.

---

## Evidence Base

| File / artifact | Finding |
|---|---|
| `docs/data/bug-inventory.json` | `1953-G-FAIL-BCTC-stale`: fixCycles=6, resolved=false. `1954-BCTC-write-chain-rca`: fixCycles=0, resolved=false. Both entries unchanged since 2026-05-18/2026-05-19. |
| `apps/mcp-server/src/interface/mcp/tools/financial-reports/reports.ts:222` | `fetch_ssc_reports` tool removed (comment: "REMOVED sprint-036 task 230"). Tool is NOT registered. The `registerReportTools()` function has zero `server.tool("fetch_ssc_reports", ...)` call. |
| `apps/mcp-server/src/scheduler/financial-reports/bctcBatchSweepJob.ts` | `runBctcBatchSweep()` / `runBctcBatchSweepJob()` — production deps factory uses `getBctcFull()` which reads SQLite directly (SELECT only). Does NOT call `fetchParseAndStoreBctc` in the batch sweep path. |
| `apps/mcp-server/src/application/usecases/fetchParseAndStoreBctc.ts` | Step 4 (LanceDB embed) rewired to `ragIndex` via `ragHttpClient.ts` (commit `d29da3a8` — rag P2-F). G5b (P2-F) comments present. File is NOT being actively restructured; no 1954c consolidation work in this file. |
| `apps/mcp-server/src/infrastructure/fetchers/pdfExtractorClient.ts` | `extractViaMicroservice()` already calls `http://localhost:5001/extract` (pdf-extractor port). The `/extract` path was wired at Phase 1 (brownfield §4 confirmed operational). |
| `docs/handoffs/` search for TASK_1954b/c/d | No files found. 1954b/c/d handoffs were never created — tasks were never dispatched. |
| `git log --oneline --after="2026-05-19"` grep for 1954b/c/d | Zero commits matching 1954b, 1954c, 1954d, 1954e, 1954f, or "write-chain consolidation". Only `2a5cc2a7` (1954a hotfix) landed. |
| `git log --oneline --since="2026-04-24"` for frozen files | Multiple pre-freeze commits; last meaningful BCTC work: `d29da3a8` (rag P2-F rewire — touches `fetchParseAndStoreBctc.ts` for LanceDB→ragHttpClient migration). No consolidation commit for 1954c. |
| `docs/TASKS.md.bak` | 1954b–1954f described as BLOCKED in backlog. 1954c = "Consolidate 4 queue-entry paths to single owner" — explicitly listed as BLOCKED, unstarted. |
| `docs/signals/DASHBOARD.md` | 1953-G-FAIL NO-DISPATCH sentinel active as of 2026-05-21T03:25Z. B-08 BCTC stale ~78.9h deferred under freeze as of 2026-05-22. Multiple c263/c264/c245 PO rulings all DEFER-FREEZE. |
| `docs/SPRINT_GOAL.md` | "BCTC freeze in force; 1954c is the next structural unlock" — repeated across multiple sprint summaries (1959, 1967, sprint-goal E-7). Active policy confirmed. |
| `docs/REQ_1967.md:166` | "Any finding whose fix path touches BCTC-related files ... must be explicitly flagged `depends_on: 1954c-gate` and NOT included in the immediate fix slate." |

---

## Clearance Criteria Assessment

### C-1: `1954-BCTC-write-chain-rca` status = resolved?

**FAIL — NOT resolved.**

`bug-inventory.json` entry:
```json
{
  "id": "1954-BCTC-write-chain-rca",
  "module": "mcp-server",
  "fixCycles": 0,
  "date": "2026-05-19",
  "resolved": false,
  "evidence": "TASK_1954b design phase: OCR-completion ACK token + writer contract (blocked)"
}
```

The design phase (1954b: ACK token + writer contract) was never started. No handoff file `TASK_1954b.md` exists. No commit in git after 2026-05-19 touches the write-chain consolidation. The `resolved=false` flag is accurate.

**C-1: FAIL**

---

### C-2: `1953-G-FAIL-BCTC-stale` status = resolved?

**FAIL — NOT resolved.**

`bug-inventory.json` entry:
```json
{
  "id": "1953-G-FAIL-BCTC-stale",
  "module": "mcp-server",
  "fixCycles": 6,
  "date": "2026-05-18",
  "resolved": false,
  "evidence": "chore(po/1953g): FAIL confirmed — NO-DISPATCH recurring-bug freeze, BCTC stale 3+ days"
}
```

This is the recurring-bug freeze trigger (6 fixCycles on module=mcp-server BCTC path). The bug is NOT resolved: BCTC VPS pipeline was confirmed stale 78.9 hours as of 2026-05-22 (B-08, DASHBOARD.md). No fix was dispatched or merged after the freeze. The NO-DISPATCH sentinel is explicitly kept active in the signals dashboard as the freeze anchor.

**C-2: FAIL**

---

### C-3: No open fixCycles on mcp-server BCTC path in last 30 days (no active fixCycles)?

**FAIL — Open fixCycles confirmed.**

The bug-inventory shows 1953-G-FAIL (fixCycles=6, open) as the direct trigger of the freeze. Additionally, B-08-BCTC-VPS-stale-78h (module=data-sources, fixCycles=0, unresolved) represents the ongoing behavioral symptom that the freeze is protecting against re-triggering. Multiple subsequent signals (c245, c263, c264) all route new BCTC issues to DEFER-FREEZE rather than dispatching fixes — the freeze is operationally active.

The git log for the frozen files shows the last substantive commit was `d29da3a8` which was rag P2-F (LanceDB rewire, touches `fetchParseAndStoreBctc.ts` minimally for the `AnalysisInput` import type move). No consolidation work landed.

**C-3: FAIL**

---

### C-4: `apps/mcp-server/.../fetchParseAndStoreBctc.ts` stable — no active RCA / consolidation in progress?

**PARTIAL — No active consolidation in progress, but NOT because it landed. It never started.**

The file is currently stable in the sense that no agent is actively editing it for 1954c purposes. However, this stability is the stability of a frozen system, not a resolved one:
- 1954b (ACK token design) was never dispatched — no design doc appended to `2026-05-19-bctc-write-chain-rca.md §8`
- 1954c (4-path consolidation) was never started — no `TASK_1954c.md` handoff
- The RCA brief (`2026-05-19-bctc-write-chain-rca.md`) describes consolidation that is READY FOR SPRINT but was blocked by the recurring-bug-escalation policy itself

The file is NOT being restructured. The consolidation design (`4 queue-entry paths → 1 pull-job owner`) remains an uncommitted architectural intent.

**C-4: PARTIAL — stable due to freeze (not because consolidation landed). The intended restructuring has not occurred.**

---

## MOOT Test

**Question:** Has the 1954c 4-write-path consolidation ALREADY routed the BCTC handler through the pdf-extractor microservice (making G5b rewire unnecessary)?

**Finding: PARTIAL MOOT — the specific call paths G5b targeted are already absent or changed, but NOT due to 1954c consolidation. The freeze anchor is unresolved.**

Evidence:

1. **`fetch_ssc_reports` tool is REMOVED** (`reports.ts:222`: "REMOVED sprint-036 task 230"). The `server.tool("fetch_ssc_reports", ...)` registration no longer exists. There is no live MCP tool entry point named `fetch_ssc_reports` to rewire. This sub-path of G5b is structurally moot — the tool was decommissioned before the freeze, independently of 1954c.

2. **`bctc_batch_sweep` / `run_bctc_batch_sweep`** (`bctcBatchSweepJob.ts`) does NOT call `fetchParseAndStoreBctc` in its core loop. The production deps factory's `getBctcFull` is a read-only SQLite query (SELECT from `financial_reports`). The batch sweep reads existing data; it does NOT trigger the write-chain pipeline. There is no HTTP rewire needed for this path because the path does not call the frozen write-chain functions.

3. **`fetchParseAndStoreBctc.ts` Step 4 (LanceDB)** was rewired to `ragIndex` via `ragHttpClient.ts` by commit `d29da3a8` (rag P2-F). This is a different service (rag-service port 5002), not pdf-extractor port 5001.

4. **`pdfExtractorClient.ts`** exists and already calls `http://localhost:5001/extract` (pdf-extractor). The `/extract` path is operational. However, `fetchParseAndStoreBctc.ts` does NOT call `extractViaMicroservice` from this client — it calls `downloadAndExtractPdf` from `pdf.ts` which uses `pdfExtractorClient` as a secondary path (lazy import, falls back gracefully if unavailable).

**MOOT test verdict: The SPECIFIC call paths G5b was designed to rewire (fetch_ssc_reports → reports.ts/fetchParseAndStoreBctc.ts; bctc_batch_sweep → bctcBatchSweepJob.ts) are either already gone or do not call the write-chain pipeline. In this narrow technical sense the rewire is moot. However:**

**The MOOT path to G5 YES is NOT available yet** because:
- The clearance condition for MOOT is "architect rules at 1954c-landing that the rewire is no longer needed BECAUSE consolidation already routed the handler through the microservice." (PO ruling §G5_yes_condition, pilot-status-pdf-extractor.json)
- 1954c never landed. The consolidation did not route anything through any microservice. The call paths changed due to earlier independent work (sprint-036 tool removal, rag P2-F LanceDB rewire) — NOT because of 1954c.
- The freeze anchor (1953-G-FAIL, fixCycles=6, unresolved) is a behavioral bug-fix freeze on the BCTC write-chain, not just a structural rewire gate. The underlying behavioral problems (OCR-completes-but-store-strands, 78h stale data, 4-path fragmentation) are unresolved. Declaring MOOT while the behavioral freeze is active would lift the freeze unilaterally — which is exactly what the PO ruling §"Why (c) over (a)" prohibits: "PO does not have the standing to clear a behavioral RCA freeze by fiat; that is architect 1954c clearance."

**A MOOT ruling at this point would be architecturally dishonest.** The technical call paths have changed, but the freeze protection remains valid until the behavioral root causes are confirmed resolved.

---

## Verdict: BLOCKED

| Criterion | Result | Reason |
|---|---|---|
| C-1: 1954-BCTC-write-chain-rca resolved | FAIL | resolved=false. 1954b design never dispatched. No consolidation commit exists. |
| C-2: 1953-G-FAIL-BCTC-stale resolved | FAIL | resolved=false. fixCycles=6. NO-DISPATCH sentinel active. BCTC VPS stale 78.9h as of 2026-05-22. |
| C-3: No open fixCycles on BCTC path (last 30 days) | FAIL | 1953-G-FAIL open. B-08 open. Multiple subsequent signals DEFER-FREEZE rather than dispatch. |
| C-4: fetchParseAndStoreBctc.ts stable, no active RCA | PARTIAL | Stable because frozen (not because consolidation landed). 1954c never started. |
| MOOT test | PARTIAL | The specific tool entry-points G5b targeted are gone (fetch_ssc_reports removed, bctcBatchSweep is read-only). But MOOT cannot be declared — it requires 1954c landing, which never happened. Behavioral freeze anchor unresolved. |

**Clearance: BLOCKED**

G5b stays HARD FROZEN. PM MUST NOT dispatch P2-G5b-dispatch.

---

## What Must Resolve First

Before architect can emit APPROVED or MOOT clearance:

1. **1954b must land** — design doc for OCR-completion ACK token + writer contract appended to `docs/architecture-briefs/2026-05-19-bctc-write-chain-rca.md §8`. This is design-only, no code touch.

2. **1954c must land** — "Consolidate 4 queue-entry paths to single owner" implemented, tested, and merged. `TASK_1954c.md` must exist with a dev commit SHA and QA APPROVED verdict.

3. **After 1954c lands** — architect re-assesses C-1/C-2/C-3/C-4 and the MOOT test. At that point the MOOT ruling becomes available: if the consolidation has routed all BCTC pipeline calls through a single owner AND none of those call paths require a pdf-extractor HTTP rewire (as the current state suggests), architect can emit MOOT clearance.

4. **1953-G-FAIL resolved** — the behavioral bug (BCTC stale data) must be confirmed resolved. This likely resolves as a consequence of 1954c landing + the VPS pipeline being restored.

**Timeline implication for 12/12:** G5 cannot reach YES until the above resolves. The pilot holds at 11/12 (all other goals YES, G5 = PARTIAL/NO on G5b). G5a and G5c can still be graded, but G5 overall cannot be YES.

---

## What This Means for 12/12

The pilot is at most 11/12 until G5b reaches a terminal state. The 11 goals are closeable without touching BCTC paths (G1-G4, G6-G12 all in apps/pdf-extractor/ only). PM should continue dispatching P2-B1 through P2-K2, P2-A1 through P2-A4, P2-G, P2-J0 through P2-J3, P2-K1, P2-K2, P2-G5a, P2-G5c in normal sequence — all CLEAR per the phase-2 task plan BCTC-freeze assessment.

G5b-dispatch is the sole 12/12 blocker.

---

## Recommended Next Action

1. PM confirms G5b-dispatch remains HARD FROZEN (no change to current freeze state).
2. PO acknowledges this clearance as BLOCKED — no freeze-lift signal to emit.
3. The 1954b/1954c sprint work needs to be re-activated by PO/PM at a point when the BCTC behavioral issues are ready to re-open (VPS push pipeline restored, Q2 earnings season context reviewed).
4. After 1954c lands and QA verifies, architect re-runs this clearance assessment. Expected outcome at that point: MOOT (the specific call paths are already gone, consolidation has landed, behavioral fix confirmed).
5. Until then: the pdf-extractor pilot proceeds to close all 11 BCTC-CLEAR goals. G5b is the explicit 12/12 blocker per the Phase-2 task plan §12/12 gate.

---

**Signal path:** `docs/signals/architect-pdf-extractor-g5b-clearance-20260524T1007Z.json`
**Pilot status SSOT:** `docs/data/pilot-status-pdf-extractor.json` → `phase2.bctc_freeze_gate.lift_status` = NOT-LIFTED (confirmed, no change)
