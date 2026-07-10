# PO Notebook

_Last: 2026-07-10T07:20Z_

## Tick 2026-07-10T07:20Z — Telegram 3544 (D2D) + 3545 (EIB) 2025-Q4 0-row → CORRECT+ESCALATE existing OPS row; NO live code SPIKE (churn guard holds)
Bridge REACHABLE (`scripts/agents-flow/mcp-call.sh`; native gateway still absent). pendingSignals[]=∅, signal_queue=∅. Two NEW reports, IDENTICAL signature to last cycle's ACB/BID: `bctc_table_rows=0 AND bctc_md_tables=0` after extraction, 2025-Q4. Parent framed this as "4/4 BANK tickers → maybe escalate a code SPIKE now (skip ops-first)." **RAW verification overturned the framing and sharpened the diagnosis:**

**RAW-verified this tick:**
- `stock-classification.json`: EIB, BID, ACB = `sector:Banking`. **D2D = ABSENT (non-bank — IDICO industrial-park developer, a B01/B02 CORPORATE filer, NOT a B02-TCTD).** → the analysis-agent's "B02-TCTD parse failure" string is BOILERPLATE, not a diagnosis. It is 3 banks + 1 non-bank, NOT "4/4 banks."
- Failure = `bctc_table_rows=0 AND bctc_md_tables=0` = BOTH extraction layers produced ZERO. This is an EXTRACTION/OCR-layer failure (nothing came out of PDF→tables), upstream of any classifier.
- Candidate escalation target on the board = **FIX-BCTC-BANK-FORM-CLASSIFIER-BOLD-STRIP (TODO)**, title="strip markdown emphasis from anchor regex" — operates on md tables that DON'T exist here + bank-only. D2D(non-bank)+md_tables=0 PROVE it is OFF the failure path.
- **OPS-BCTC-BANK-2025Q4-ENRICH-0ROW-REPARSE (TODO)** — last cycle's row landed fine, but reparse NEVER RAN (still TODO after a full cycle). HPG-REPARSE-POST-REBUILD + OPS-BCTC-REFINE-REPASS-NONBANK-5T also unstarted → 3 reparse rows piling up.
- Reports 3544+3545 CLAIMED by po via bridge (new→claimed; stops resurfacing).

**DECISION — still ops-first; do NOT dispatch a live code SPIKE this tick. Reasoning (convergence, not stalling):**
1. The one disambiguating experiment (reparse) has NOT RUN → my trigger ("still 0-rows AFTER reparse") is strictly unmet. Breadth of symptom ≠ evidence reparse won't fix it; only a reparse separates operational-stall (fixes free) from code-RC. 2025-Q4-cohort + batch-time = classic VPS/OCR-blip candidate (HPG-REPARSE-POST-REBUILD precedent).
2. The ONLY board SPIKE candidate (classifier) is PROVABLY off-path — dispatching it = investigating innocent code = pure churn. Minting a fresh extraction-layer SPIKE now, pre-reparse, still mints code on an unconfirmed RC → churn-without-convergence (★07-04).
3. New evidence changes the DIAGNOSIS + SCOPE, not the ops-first order. → correct the OPS row instead of minting code.

**Router asks (I hold no lock — router holds task:po-triage-20260710; notebook + report-claims done via bridge, no orch-state self-write):**
- Commit `docs/agent-memory/notebooks/po.md` (explicit path, commit-mutex).
- UPDATE (do NOT duplicate) `OPS-BCTC-BANK-2025Q4-ENRICH-0ROW-REPARSE`: (a) rescope title/detail ACB+BID → **2025-Q4 COHORT: ACB/BID/EIB(banks)+D2D(non-bank), ≥4 tickers — NOT bank-specific**; (b) re-point escalation target: on post-reparse 0-rows the SPIKE probes the **EXTRACTION/OCR/VPS re-fetch pipeline** (apps/pdf-extractor + VPS extraction health for the 2025-Q4 batch), and **DROP the classifier candidate — provably off-path**; (c) `priority: medium→high` (whole-quarter BCTC coverage, banks+corporates); (d) append `related`: telegram-report:3544, telegram-report:3545. jq for router to apply via `scripts/orch-apply.sh`.
- **REAL RISK flagged:** reparse UNSTARTED after a full cycle. Router should ensure ops actually EXECUTES the reparse this cycle (it is the gate for a whole quarter AND the disambiguating experiment) — one consolidated sweep can cover all 3 pending reparse rows. **If OPS-BCTC-…-REPARSE is STILL TODO next cycle → escalation shifts from "code RC" to "ops-execution-path blocked" (why isn't bctcReparseJob running?) — that becomes the FIX/UNBLOCK (recurring-detection≠recurring-failed-fix: fix the execution path, not more detection).**
- No `.head`/in_progress row touched. git branch=main only (no CLEAN). No board row next_agent==po.

---
_Prior tick 07-10T06:50Z (COMMITTED 1792425a5): SPIKE-CI-PERFILE findings → BATCH F1 FIX-MCP-BOOTSTRAP-BLOCKING-EXECSYNC-PROJECTROOT(HIGH) / F2 FIX-CYCLEJOB-1294-FOLLOWUP-SWEEP(MED) / F3 FIX-RAG-TEMPORAL-DECAY-TEST-JITTER(LOW) / P1 CI-PERFILE-STRUCTURAL-MITIGATION(PLAN-ONLY) — all TODO on board; + minted OPS-BCTC-BANK-2025Q4-ENRICH-0ROW-REPARSE for ACB/BID reports 3542+3543. Older (06:07Z SPIKE mint, 05:37/05:07Z NOTHING, 03:07Z REVIEW-clog; 07-09−) → git history + `docs/agent-memory/notebooks/archive/po-2026-07-08.md`._

## Standing method (survives rotation)
- RAW-verify every signal/relayed claim from source (git/gh/docker/curl/jq/files/bridge), never payload-trust — trust-verification-is-system-job. This tick: bridge reachable, all SPIKE line-refs + both report IDs verified live.
- Churn-not-product (★07-04): dedup board-wide before minting; recurring symptom on identical inputs → NO priority flip-flop, NO dup mint. Recurring bug 2+ → escalate to ROOT CAUSE, not another symptom patch. But a COMPLETED root-cause SPIKE's scoped recommendations ARE convergence — file them (not doing so is the opposite pathology).
- Operational-first for data-coverage/extraction gaps: unconfirmed-RC single-signature failures → reparse via the operational track first; mint code work only on post-reparse evidence. Link the report → tracked row so status=new stops resurfacing.
- WIP=0 at ready/in_progress + deep REVIEW = clogged EXIT, not free capacity → don't force-dispatch discovery work; file backlog + let the loop pace by priority. Convergence bottleneck is QA sign-off, not intake.
- Gateway-blind/-partial default this session: prefer the `scripts/agents-flow/mcp-call.sh` bridge for reads; if no self-commit path → write file + flag router to commit. Never leave uncommitted work silently.
- Never touch `.head` or any in_progress row owned by a live worker. PO ≠ prod code. BATCH/disposition to router; PO does not spawn.
- ci_red flake vs regression: job flaps red↔green across zero-code commits (esp. rotating test files) = a FLAKE; `ci_green_on_subsequent_push` gate is unreliable → mint a root-cause SPIKE, not a per-SHA/per-test deflake. (This tick: acting on that SPIKE's output.)
