# PO Notebook

**Cycle:** Sprint kickoff PEK-INTEGRATE (user directive) — 2026-05-26T20:37Z.
**Last update:** 2026-05-26T20:42Z
**Status:** Sprint PEK-INTEGRATE OPEN. PEK-BA dispatched (first hop). SUPERSESSION of BCTC-LAYOUT-FIRST engine layer recorded in both SPRINT_GOAL + TASKS. Files UNSTAGED — main terminal commits.

---

## 2026-05-26T20:37Z — PEK-INTEGRATE kickoff (explicit user directive)

**Directive:** re-engine `apps/pdf-extractor` on PDF-Extract-Kit (OpenDataLab), Architect-led. Clone already at `apps/pdf-extractor/PDF-Extract-Kit` (PRISTINE — zero edits). CPU-only, 8GB Docker cap, keep `/api` PULL contract.

**COLLISION FOUND + RESOLVED:** Sprint BCTC-LAYOUT-FIRST (parallel session) was mid-flight hand-building a local PIL/OpenCV/Tesseract layout-first engine for the SAME zone + SAME root problem. PDF-Extract-Kit IS the "heavy local CV" that sprint explicitly deferred. As PO: **PEK SUPERSEDES the BCTC-LAYOUT-FIRST ENGINE layer (LF-EXTRACT)**, **PRESERVES the UX overlay (LF-OVERLAY, engine-agnostic — PEK layout bboxes feed the same overlay contract)**. LF-EXTRACT/LF-DEPLOY/LF-QA PAUSED pending PEK architect brief. Recorded SUPERSESSION NOTICE in BOTH `docs/SPRINT_GOAL.md` + `docs/TASKS.md` so the parallel session sees it. `bctc_table_rows` (`text_table_extractor.py`, 0-byte-diff) untouched under both.

**Verified before planning (not assumed):**
- Clone present, 89MB, own `.git`, `requirements-cpu.txt` + 8 configs.
- `requirements-cpu.txt` STILL pulls `unimernet` (~1.4GB, OUT) + `struct-eqtable` → NOT 8GB-safe as-is; architect trims further.
- `configs/table_parsing.yaml` defaults to StructEqTable (InternVL2-1B VLM) = biggest RAM risk; README offers lighter PaddleOCR+TableMaster. Architect picks.
- `apps/pdf-extractor/.dockerignore` does NOT exclude `PDF-Extract-Kit/`; Dockerfile `COPY . .` → naive build bloats image w/ 89MB pristine repo + its `.git`. (c) decision must fix.

**Wrote:** SPRINT_GOAL § PEK-INTEGRATE (vision/scope/3 hard constraints/4 architect decisions w/ RAM mandate/DoD/owner chain) + supersession header on BCTC-LAYOUT-FIRST; TASKS § PEK-INTEGRATE (7 tasks PEK-BA→PEK-EXIT) + supersession notice; `docs/handoffs/TASK_PEK-INTEGRATE.md` (PO-verified ground truth + architect-deferred decisions). All UNSTAGED.

**Dispatch:** NEXT = ba | write `docs/REQ_PEK-INTEGRATE.md` (PEK-BA). Then PO approval gate → architect PEK-DESIGN. Sprint umbrella lock: task_claim deferred (MCP lock guards concurrent dispatch which main terminal serializes anyway; supersession notices are the real coordination).

---

## Carry-over
- PEK-BA spec returns to PO for approval gate (`po/review-ba-spec.md`) before architect PEK-DESIGN unblocks.
- Architect must RECONCILE PEK with BCTC-LAYOUT-FIRST: decide engine REPLACES vs WRAPS hand-built tiers; reuse LF-OVERLAY contract `2026-05-26-bctc-layout-first-pipeline.md` §3 for PEK layout bboxes; confirm `bctc_table_rows` zero-collision.
- DoD = scale-pilot bar: live clean rows via DIRECT market.db + 8GB/no-panic + pristine-repo-untouched git-diff proof + ops REBUILD + USER verbal G9. 5 prior false-greens.
- If parallel BCTC-LAYOUT-FIRST session is live, its LF-EXTRACT chain is paused — do not let both edit pdf-extractor concurrently.
