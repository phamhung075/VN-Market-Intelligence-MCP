# PO Notebook

**Cycle:** Sprint BCTC-TABLE OPENED — user `/goal` "bctc can extract correct result table for analyze" converted to a build sprint off the DONE research brief.
**Last update:** 2026-05-24T21:27:12Z
**Status:** PLANNED + dispatch-ready. First dispatch = BT-1 + BT-0 (parallel) to dev-pdf-extractor.

---

## 2026-05-24T21:27Z — BCTC-TABLE: research brief → two-track build sprint

User mandate via main terminal. Research brief `docs/architecture-briefs/2026-05-24-bctc-table-extraction-research.md` read IN FULL — converted, no new research. Two-track: self-hosted column-aware table extractor (PP-StructureV3 favorite, evidence-gated) + self-hosted cross-check gate; external-API VLM DEFERRED/opt-in (privacy).

**Verified before writing:** 14-doc gold-set on disk confirmed (`data/pdfs-local/` VCB/FPT/HPG/DHG/DIG/BSR/DGC/SHB/VEA/VNM + `data/pdfs/`). pdf-extractor source matches brief (6 pure primitives + infra adapters + sandbox). **1954c freeze CLEARED** — `372fbc91` deprecate pdfOcrWorker at HEAD = consolidation LANDED; integration builds on the consolidated path (architect BT-2 confirms no collision).

**Tasks (docs/TASKS.md § Sprint BCTC-TABLE, handoff TASK_BCTC-TABLE.md):**
BT-1 (CRITICAL, parse fix: vn_number_normalize + reconcile_figures + select_period_column, VNM/DHG anchors) + BT-0 (SPIKE, 14-doc eval, self-hosted only) FIRST + PARALLEL → BT-0-PICK (PO records pick) → BT-2 (architect blueprint) → BT-3 (integrate) + BT-4 (ops/dev-mainserver host model) → BT-5 (cross-check gate) → BT-6 (qa regression) → BT-EXIT (PO).

**Guardrails enforced in goal/tasks/handoff/signal:** (1) NO off-infra data send — privacy non-negotiable, external-API VLM opt-in only; (2) Security Clause — primitives pure, model/IO = adapters, sandbox zero creds; (3) Mac = dev/eval only, prod model on main server; (4) pilot FROZEN 12/12 not edited.

**Dispatch signal:** `docs/signals/po-20260524T212712Z.json` (dispatch_now: BT-1 + BT-0).

**Open questions to user (do NOT block):** (1) third-party API allowed or self-hosted-only [default self-hosted]; (2) main-server GPU? [BT-4 sizing]; (3) figure-accuracy bar + API budget [default ≥95% within ±0.5%].

**Carry-over:** Other sprints still live (KD-QREF-LANG OPEN chain, PDF-INSPECT/KD-QREF/NF-LD CLOSED, P0-SP + P2-TA pilot backlogs). WIP=2 fleet cap — BCTC-TABLE BT-1+BT-0 will occupy both slots; main terminal sequences against TA/stock-price pilot dispatch. BT-0-PICK is the next PO action once the spike scoreboard returns.
