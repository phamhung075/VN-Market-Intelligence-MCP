# PO Notebook

_Last: 2026-07-28T17:35Z (router-dispatched triage) · 1 `orch-apply.sh` write, Zod+conservation clean (task_total 661→665) · 834 ids · `.head` untouched · nothing pushed, no agent spawned, no container touched._

**CONCURRENT-PO NOTE (this same cycle):** a second PO invocation (dev-team Step-1 triage, coordination_session 64c7c677) ran in parallel on an OVERLAPPING signal batch and independently converged on the identical root causes for the freshnessSlaMonitorJob path bug and the BCTC report-swap dedup (see `docs/agent-memory/decisions/po-decisions.md` top entry) — both sets of annotations now coexist harmlessly on the same rows (distinct field-name suffixes, no data loss, conservation-clean). That session's ADDITIONAL findings, not overlapping with this notebook: **S1 context_bloat_breach** (`sprint-ULTRACODE-AUDIT-FIXALL-qa.md`, 507L/41244B) — DEFER, confirmed LIVE sprint journal, not PO's chain (belongs to claude-manager-helper Pass 5b), NO MINT. **S5 ci_red** `CI-RED-6ba39d3c` — confirmed re-observation of the already-dispatched BDI/1408 fix, now visibly DONE_VERIFIED by qa (commit c56c6d350) since this notebook section was written. Its planned `STRANDED-AGENT-MODELS-PERFORMANCE-MODE-COMMIT` UNBLOCK draft was DROPPED as a duplicate once `FIX-STRANDED-SWEEP-CLASSIFY-AGENT-MODEL-SWITCH` (below) was found already landed — no new BATCH entry this cycle, Return=NOTHING. Possible router dup-spawn on identical/overlapping triage inputs — worth a look if it recurs (memory: `feedback_router_skip_po_respawn_identical_inputs`).

## Shipped

| What | State |
|---|---|
| **MINT** `FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM` | P1·architect·plan_only·supervised. qa-recommended follow-up to the closed P0: uvicorn PARENT RSS (VmHWM 97% of cap), not tesseract, is the OOM driver — sawtooth, not a leak (corrected an informal "accumulation" framing before it shipped). |
| **MINT** `FIX-PDFX-EXTRACTION-ENGINE-EMPTY-STRING-SWALLOW` | P2·dev-pdf-extractor. extraction_engine.py:177-178 swallows OCR failure as `""`=success; flagged by both dev+qa, out of P0 scope. |
| **MINT** `FIX-PDFX-GENERIC-MD-TABLE-OCR-UNROUTED-GATEWAY` | P3·dev-pdf-extractor. Scoped to generic_md_table/extractor.py only — verified ocr_worker.py already composes correctly via parent-side slot_async(), excluded it from the router's initial framing. |
| **MINT** `FIX-STRANDED-SWEEP-CLASSIFY-AGENT-MODEL-SWITCH` | P3·CLEAN·dev-team. 20 dirty `.claude/agents/*.md`+agent-models.json are routine model-switch churn (git-diff verified 1-line each), not orphan work — did NOT touch those files (CLAUDE.md: agent-models.json owned elsewhere). |
| Attach evidence → `FIX-L4-FRESHNESS-SLA-MONITOR-SELF-POLICING` | READY row's own AC1/AC2 answered: freshnessSlaMonitorJob.ts:34-36 broken relative path → ENOENT, monitor fires but can't read input. No dup mint. |
| Attach evidence → `FIX-BCTC-INGEST-PERIOD-IDENTITY-UNVALIDATED-VS-CONTENT` | REVIEW row corroborated in real time by cowork signal (DPM 5b0dad71→3e2a26d9) — same defect, already fixed by dev_close_out's migration. No dup mint. |
| 3 signal_queue rows (READ→RESOLVED) | sys-20260728T171555-7cb3, dev-20260728T171505, cowork-...-reportid-swap-midflight — all disposed via attach, not mint. |
| `docs/data/DASHBOARD.md` +1 row | SLA-1 (freshnessSlaMonitorJob ENOENT) — router's own write-boundary gap, reconciled. |

## Lessons

- **Verify the router's bundled framing, don't inherit it.** ocr_worker.py was named alongside generic_md_table/extractor.py as "unrouted" — a direct grep+read showed it already composes correctly (parent-side semaphore wrap around the ProcessPoolExecutor dispatch). Scoped the mint to the real gap only.
- **A qa status_note correction is itself prior art.** The parent-RSS mint came straight from qa's own recommendation text on the closed P0, not a fresh discovery — cheapest, most-verified path to a new row.

## Carry-over

- Peer session (dev-team) holds `FIX-PRESSURE-HOST-HEADROOM-WRONG-MACHINE-WRONG-QUANTITY` (in_progress) + `FIX-BDI-SHIPPING-STALE-404-GUARD` (qa) — untouched, as instructed.
- `review`≈118 / `qa`=0 capacity gap (from prior tick) still open on architect via `FIX-DEVTEAM-REVIEW-LANE-QA-DRAIN` — not re-triaged this cycle.
