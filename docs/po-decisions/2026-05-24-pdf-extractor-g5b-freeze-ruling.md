---
title: "PO Decision — pdf-extractor G5b BCTC Freeze Ruling (Phase-2 blocker)"
date: "2026-05-24"
author: "po"
pilot: "pdf-extractor"
phase: "2"
decision_type: "freeze-ruling"
status: "BINDING"
ruling: "(c) SPLIT G5"
freeze_anchor: "1953-G-FAIL / 1954c (BCTC write-chain RCA, recurring-bug-escalation)"
status_ssot: "docs/data/pilot-status-pdf-extractor.json (phase2.bctc_freeze_gate)"
charter_ref: "docs/architecture-briefs/2026-05-24-pdf-extractor-factory/pilot-charter.md §BCTC Freeze Interaction"
brownfield_ref: "docs/architecture-briefs/2026-05-24-pdf-extractor-factory/p0-brownfield-inventory.md §4 + §8"
---

# PO Decision — pdf-extractor G5b BCTC Freeze Ruling

## Context

Phase 1 of the pdf-extractor SCALE pilot closed PASS (QA gate `7247fd08`, signal
`docs/signals/qa-pdf-extractor-phase1-gate-20260524T082834Z.json`). Phase 2 opens with one
hard blocker: **G5 (old code deletion + HTTP rewire)** overlaps the active BCTC recurring-bug
freeze.

G5 has three sub-goals (canonical charter §G5 _title_note):
- **G5a** — old/superseded in-service code moved to `_deprecated/`
- **G5b** — MCP tool handlers rewired HTTP to pdf-extractor port 5001
- **G5c** — zero `TODO.*migrat` references

The G5b rewire scope (brownfield §4) targets two FROZEN handlers:
- `fetch_ssc_reports` → `apps/mcp-server/src/interface/mcp/tools/financial-reports/reports.ts` + `fetchParseAndStoreBctc.ts`
- `bctc_batch_sweep` → `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcBatchSweepJob.ts`

Both sit under HARD FREEZE anchor **1953-G-FAIL / 1954c**.

## Freeze surface (what the freeze actually protects)

From `docs/data/bug-inventory.json`:
- `1953-G-FAIL-BCTC-stale` — module=mcp-server, **fixCycles=6**, unresolved. NO-DISPATCH recurring-bug freeze.
- `1954-BCTC-write-chain-rca` — module=mcp-server, fixCycles=0, unresolved. Design phase: OCR-completion ACK token + writer contract + **consolidation of 4 write paths → 1 pull-job owner**.

The freeze is a **behavioral bug-fix freeze** on the BCTC write-chain: OCR-completes-but-store-strands
(78h stale), missing ACK token, 4 fragmented write paths. The 1954c consolidation is actively
rewriting `fetchParseAndStoreBctc.ts` — the exact file G5b would rewire.

## The structural-vs-behavioral distinction (charter §Key-risk-3)

The directive correctly notes the charter distinction: a *structural HTTP-rewire* (change the call path)
is conceptually different from a *behavioral bug-fix* (change what the write-chain does). If the rewire
were genuinely orthogonal, ruling (a) LIFT would be defensible.

**It is NOT orthogonal here.** The G5b rewire touches `fetchParseAndStoreBctc.ts` and `reports.ts` —
the precise files the 1954c consolidation is restructuring (4 write paths → 1 owner). Rewiring the call
path of code whose write behavior is mid-RCA would:
1. Move the rug under the architect's consolidation work (merge/rebase collisions on the same hot file).
2. Risk conflating a structural commit with the frozen behavioral surface — exactly the recurring-bug
   anti-pattern (`feedback_recurring_bug_escalation.md`: 6 fixCycles on one module → root-cause rethink
   BEFORE any new touch).
3. Provide zero Phase-2 trust value the existing operational HTTP path doesn't already provide — the
   `/extract` endpoint via `pdfExtractorClient.ts` is ALREADY wired and operational (brownfield §4); the
   frozen handlers are write-chain ORCHESTRATION (download+parse+store), not pure-extract calls.

## RULING: (c) SPLIT G5

I split G5 into three independently-gateable sub-goals:

| Sub-goal | Scope | Freeze status | Phase-2 disposition |
|---|---|---|---|
| **G5a** | Move any superseded in-service code (post-primitive-extraction `domain/services.py` remnants — the `validate_financial_figures` mixed-file split per brownfield R-1) to `_deprecated/`. Pure `apps/pdf-extractor/` Python. | CLEAR | Dispatch in Phase 2 normally. Pre-delete tag `pdf-extractor-pre-delete` first. |
| **G5c** | Zero `TODO.*migrat` grep across `apps/mcp-server/src/` + `apps/pdf-extractor/`. Read-only verification. | CLEAR | Dispatch in Phase 2 normally. |
| **G5b** | HTTP-rewire `fetch_ssc_reports` + `bctc_batch_sweep` (touches `reports.ts`, `fetchParseAndStoreBctc.ts`, `bctcBatchSweepJob.ts`). | **HARD FROZEN** | HELD. Sequenced LAST. Requires architect 1954c-clearance signal BEFORE PM may dispatch. |

**G5 reaches YES only when G5a + G5c are done AND G5b is either (i) completed after a 1954c freeze-lift,
or (ii) the architect rules at 1954c-landing that the rewire is no longer needed because consolidation
already routed the handler through the microservice.** G5 is the one goal explicitly gated on freeze-lift.

### Why (c) over (a) and (b)

- **Not (a) LIFT:** the rewire is not orthogonal to the frozen surface — it collides with the 1954c
  consolidation target file. Lifting now would re-trigger the recurring-bug escalation I am bound to
  respect. PO does not have the standing to clear a behavioral RCA freeze by fiat; that is architect
  1954c clearance.
- **Not (b) KEEP-and-sequence-whole-G5-last:** that needlessly freezes G5a (pure Python `_deprecated/`
  move) and G5c (read-only grep), which carry ZERO BCTC touch. Holding clean work hostage to a frozen
  handler wastes a Phase-2 sprint of available value.
- **(c) SPLIT** extracts all BCTC-clear value now (G5a + G5c), isolates only the genuinely-frozen handler
  rewire (G5b), and keeps the freeze intact. Maximises Phase-2 throughput while honouring the freeze.

## Freeze-lift precondition for G5b (unchanged, re-affirmed)

G5b stays HARD FROZEN. PM MUST NOT dispatch, stage, or commit any touch to the named mcp-server BCTC
paths until **BOTH**:
1. Architect emits a 1954c-clearance signal (1953-G-FAIL / 1954c consolidation landed + verified), AND
2. PO emits an explicit freeze-LIFT signal scoped to the G5b rewire, recorded in
   `pilot-status-pdf-extractor.json` phase2.bctc_freeze_gate.

No silent lift. No "structural-only" carve-out before architect clearance — the file collision makes
that distinction unsafe to apply unilaterally.

## Decision matrix impact

None at this stage. G5 (and its split sub-goals) is a Track-A goal; matrix authorship stays PO-only,
atomic with the 12/12 terminal grade (Charter §4.5). This ruling does not flip any goal to YES.

---

**Recorded in:** `docs/data/pilot-status-pdf-extractor.json` → `phase2.bctc_freeze_gate` (ruling=split-G5)
+ `phase2.g5_split`.
