# Decision Journal — FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT

**task_id:** FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT
**date:** 2026-06-28
**agent:** po
**mode:** triage (scope + acceptance + open cascade)

## What was considered
- **Per-ticker special-case patch** (add non-FPT branches): REJECTED — that is the anti-pattern that produced the bug. "Works for one issuer" = overfit; more branches deepen it.
- **Blanket vision-on-failure fallback**: REJECTED — bctc-gate-vision is escalation-only, not a generalization. Masks the deterministic-parser gap.
- **Only path chosen:** SPRINT-M through full cascade (ba → architect → pm → dev-pdf-extractor) to GENERALIZE column/table detection, with acceptance RAW-verified on multiple real issuers (bank VCB + non-bank HPG + FPT non-regression).

## why-change
- PO-validated root at code level: `text_table_extractor.py` split regexes (`_CODE_VALUE_COL_RE`, `_CODE_ROW_SINGLE_SPACE_RE`, `_parse_three_block_layout`) are commented + built from FPT pages 4-5/7; BT3-FIX-2..5 history all FPT-driven; FPT page-7/8/9 baked into fixtures. Classic single-issuer overfit.
- Bank vs non-bank layouts differ (bank-aware BCTC) → acceptance MUST include a bank.
- Contract-from-live-payload: BA/architect must probe real `bctc_table_rows` / bctc-eval per issuer, not the FPT-shaped fixtures.

## Disposition
- Minted FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT → ready[] (P1, zone apps/pdf-extractor/, next_agent=ba), head set to dispatch ba.
- Handoff spec: docs/handoffs/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT.md

---

## Addendum 2026-06-28 — BA spec review + B1-B5 resolution (cascade → architect)

BA returned live-probe spec (FR-1..FR-7, NFR-1..4) with 5 PO-decision blockers. ACCEPTED spec; resolved:
- **B1** CONFIRM targets VCB 2026Q1(31f2a9a9,bank)+HPG 2025Q4(918a7abd)+VNM 2025Q4(4316f6d1)+FPT 2025Q4(e71f845d,non-reg). 0-row class OUT (pipeline-assembly, not column-split) — already tracked by HPG-REPARSE-POST-REBUILD + FIX-PENDING-REFINE-OUTPUT-235K-OVERFLOW. No new task.
- **B2** FPT non-regression = Stage6 GREEN (NOT Stage4 — FPT already RED dup=1 pre-fix); FPT Stage4 dup must not increase. Residual → FU-FPT-2025Q4-STAGE4-DUP (minted backlog, P3, depends this sprint; FR-5 may fix incidentally).
- **B3** VCB measurable: verified real endpoint POST /api/bctc-eval/recompute/:id (server.ts:1982 handleBctcEvalRecompute recomputes stages 4-6). No new endpoint.
- **B4** FACTORY-DOMAIN-extract-bctc-parsing-lib: SEQUENCE SEPARATELY (after), do NOT absorb — behavioral fix vs structural refactor, different zone, parallel-conflict risk. Annotated sequenced_after + MUST-NOT-run-concurrent.
- **B5** FR-4 section-boundary (application layer) CONFIRMED IN-SCOPE — load-bearing for VCB (FM-VCB-1); architect owns mechanism.

what-considered: absorb FACTORY-DOMAIN (REJECTED — conflates behavior+structure, B4 parallel-conflict risk); Stage4 GREEN as FPT non-reg bar (REJECTED — already RED pre-fix); mint new 0-row tracking task (REJECTED — already tracked).
why-change: live BA probe showed FM-VCB-1 section-misfile as severe as column-split → FR-4 must be in-scope or VCB acceptance impossible.

## Disposition (addendum)
- Task ready→in_progress, next_agent=architect, scope/targets/DoD locked on row; head→architect.

---

## Addendum 2026-06-28 (B) — Final acceptance ruling (QA CHANGES_REQUESTED on VNM) → SIGN-OFF + carve-out

QA RAW-verified (rebuilt container, live recompute): VCB 2026Q1 Stage4 GREEN (label_cov=1.0, dup=0, blank=0), HPG 2025Q4 Stage4 GREEN, FPT 2025Q4 Stage6 GREEN + Stage4 dup=0 (bonus). VNM 2025Q4 = 0 rows FAIL.

**Ruling: sprint ACCEPTED on VCB+HPG+FPT; VNM carved OUT.** De-overfit root FIXED; generalization proven on a bank + a non-bank + non-regression = exactly the original DoD. VNM 0-row is a DISTINCT root: (1) column-separated OCR layout no row-parser (Layouts 1-7) can match — predates sprint, NOT a 7-FR regression; (2) VNM's 94 production rows came from the REFINE path (refine_bctc_md→bctc_refined_units→finalizeBctcRefineTool DELETE+reinsert), NOT /extract-tables — QA verified through the wrong pipeline.

what-considered: route VNM back to dev-pdf-extractor as in-sprint (REJECTED — distinct parser architecture + wrong-pipeline verification; conflating balloons scope); full-volume DB restore for data-loss (REJECTED — no backup script exists + destroys other data); mark sprint merely done not done_verified (REJECTED — QA RAW-verified the re-scoped acceptance set live).
why-change: code trace showed /extract-tables (pushBctcTableHandler) writes bctc_table_rows ONLY, never bctc_refined_units → VNM refined truth survived → data fully recoverable via re-finalize, no backup needed.

**Dispositions (po-s130 script, atomic):**
- FR 330/331/332 + parent sprint → done_verified.
- FIX-VNM-BCTC-ROWS-DATA-LOSS-RECOVER → ready P1, dev-mcp-server (recon-first: refined_units survive → re-finalize). head→here.
- SPIKE-BCTC-COLUMN-SEPARATED-LAYOUT → backlog P2 (recon-first; build new parser ONLY if genuine gap).
- FU-EXTRACT-VERIFY-SHADOW-NOT-LIVE → backlog P2 architect (durable guard: never overwrite live rows to verify; recurrence of negative-path-corrupts-live-SSOT).
- FU-FR4-RISK4-30LINE-LIMIT → backlog P3 (architect RISK-4 mitigation, non-blocking).
- TASK_332 (FR-6) = DONE (was only held by the re-scoped VNM gate).
