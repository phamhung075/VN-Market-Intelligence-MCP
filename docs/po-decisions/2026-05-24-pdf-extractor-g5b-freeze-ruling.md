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

## TERMINAL G5 RULING (po, 2026-05-24T10:14:08Z) — NO, pilot holds at 11/12

After 10 goals reached verified-ready and G12 earned, the only open question was G5. Architect
emitted a BLOCKED clearance (`docs/signals/architect-pdf-extractor-g5b-clearance-20260524T1007Z.json`,
brief `p2-g5b-clearance.md`) with a *narrow* MOOT observation: the two G5b TARGET entry-points
(`fetch_ssc_reports`, `bctc_batch_sweep`) are already gone/orthogonal. The terminal question put to PO:
is the charter G5 intent **satisfied-by-absence** — i.e. is there NO live in-server handler still
performing PDF/BCTC extraction in-process, bypassing the pdf-extractor service?

I required a confirming check before any YES. I ran it directly (grep + read of the live extraction
path). **The check FAILED.** A live in-server extraction path exists and bypasses the service:

| Evidence | Finding |
|---|---|
| `apps/mcp-server/src/infrastructure/fetchers/pdf.ts` `downloadAndExtractPdf` | PRIMARY extraction is **in-process**: axios download → `extractPdfText` (pdf-parse) → in-process Tesseract OCR fallback (`ocrPdfBuffer`, pdf.ts:102 — spawns `pdftoppm`+`tesseract` child processes). The pdf-extractor microservice (`extractViaMicroservice` → port 5001) is invoked ONLY as a **low-confidence fallback** (`if (result.confidence < PDF_MICROSERVICE_FALLBACK_THRESHOLD)`, pdf.ts:358), NOT the primary route. |
| Live (non-test) callers of `fetchParseAndStoreBctc` → that path | `bctcReparseJob.ts:555/572`, `pushBctcExtraction.ts:81`, `bctcPdfPullJob.ts:168`, `checkSscReports.ts:228` — all live. `checkSscReports` is the cron that *replaced* the removed `fetch_ssc_reports` tool; it still drives the in-process write-chain. |
| `apps/mcp-server/src/scheduler/startScheduler.ts:254 / :286` | `cron.schedule(CRONS.bctcReparseJob, …)` and `bctcPdfPullJob` are **live-registered cron jobs**, operational. |

### Why NO-by-merits, not YES-by-absence

The architect's MOOT was correct for the two *named tool entry-points* but did not (and could not, by
scope) answer the broader charter intent. The G5 charter intent is "old service code deleted + **all
callers route to the new microservice** + no TODO-migrat" (charter §G5 / `G5_yes_condition`). That intent
is **genuinely NOT met**:

1. The pdf-extractor service is a *fallback*, not the extraction owner. Four live cron jobs still run the
   in-process pdf-parse + Tesseract path on the primary route. The service does not own extraction.
2. This is precisely the BCTC write-chain under the active behavioral freeze (1953-G-FAIL fixCycles=6,
   1954c never landed). The rewire that would make the service the owner is exactly the frozen,
   collision-prone work — it cannot be declared satisfied-by-absence while the path is live AND frozen.
3. `G5_yes_condition` (i) requires G5b completed-after-freeze-lift, or (ii) architect MOOT *at
   1954c-landing*. Neither holds. 1954c never started. Forcing a third "satisfied-by-absence" path now
   would (a) contradict the live evidence, and (b) lift the behavioral RCA freeze by PO fiat — prohibited
   by the §"Why (c) over (a)" reasoning above.

### Disposition

- **G5a** = DONE (dev `d339303f`: tag `pdf-extractor-pre-delete` + leftover scaffold → `_deprecated/`).
- **G5c** = PASS (qa `ba1dcc82`: `TODO.*migrat` grep = 0 across `apps/pdf-extractor/` + `apps/mcp-server/src/`).
- **G5b** = BLOCKED — live in-server extraction path persists; HARD FROZEN unchanged.
- **G5 overall = PARTIAL (NOT YES).** Pilot holds **honestly at 11/12**. G5 is the sole 12/12 blocker.

The behavioral BCTC freeze remains **in force and is NOT orthogonal** here — it governs the very
write-chain that the live extraction path runs through. No freeze-lift signal emitted.
`phase2.bctc_freeze_gate.lift_status` = NOT-LIFTED (unchanged).

**Re-open condition:** after 1954b+1954c land (consolidation merged + QA APPROVED) and 1953-G-FAIL is
confirmed resolved, architect re-runs the G5b clearance. Expected outcome at that point: either a genuine
HTTP rewire makes the service the extraction owner, or a *true* MOOT (consolidation routed all BCTC calls
through the service). Only then can G5 → YES and the 12/12 matrix close.

The decisionMatrix stays unpopulated (Charter §4.5: PO-only, atomic with the 12/12 terminal grade — no
partial population). No goal flipped to YES by this ruling.

---

**Recorded in:** `docs/data/pilot-status-pdf-extractor.json` → `phase2.bctc_freeze_gate` (ruling=split-G5,
lift_status=NOT-LIFTED, terminal G5 = PARTIAL/11-of-12) + `phase2.g5_split` + goal G5 evidence note.
