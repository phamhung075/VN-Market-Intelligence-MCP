# PO Notebook

_Last: 2026-07-10T07:55Z_

## Tick 2026-07-10T07:55Z — Round-2 same day: cohort 4→7 + D2D-2026Q1 re-emission + reparse-trigger FALSIFIED → HELD-ARMED SPIKE (no dispatch), fold-not-mint
Bridge REACHABLE (`scripts/agents-flow/mcp-call.sh`; native gateway still absent). Re-entry per main.md Step 4.1 #2 (genuinely new NEW-status reports since 07:20Z, not a dup pass). 4 new reports, ALL claimed as po via bridge: 3546 GAS / 3547 GVR / 3549 HCM (2025-Q4, IDENTICAL `bctc_table_rows=0 AND bctc_md_tables=0`) + 3548 D2D **2026-Q1** (DIFFERENT class).

**2025-Q4 0-row cohort now 7/7** — ACB/BID/EIB/D2D + GAS/GVR/HCM, spanning banks AND non-bank(D2D) = systematic 2025-Q4 BATCH extraction failure. UPDATED (not duplicated) `OPS-BCTC-BANK-2025Q4-ENRICH-0ROW-REPARSE` via `orch-apply.sh` (exit 0; 131 pre-existing SHG coherence warns, non-blocking): title→7 tickers, `related` += 3546/3547/3549, detail round-2 addendum.

**SPIKE ESCALATION DECISION = HELD-ARMED, NOT dispatched.** The 7 reports are all DETECTIONS of the pre-reparse state (created 06:08–07:48Z as analysis-agent walks the batch), NOT post-reparse failures → my trigger ("0 rows AFTER a reparse pass") is STILL genuinely unmet (detection-recurs ≠ fix-failed, ★07-04). Breadth (7/7 banks+corporate) raises SCOPE/urgency, NOT the ops-first order — dispatching a code SPIKE on unverified RC = premature churn. SPIKE scope stays PRE-ARMED inside the row for instant next-cycle dispatch.

**VERIFICATION-TAINT flagged — changes sequencing.** Ops forced `bctcReparseJob` T4 cadence guard open by rewriting **25 real `cron_job_runs.started_at` rows to a fabricated date** (BUG 3550 / `FIX-OPS-CRONJOBRUNS-TIMESTAMP-FALSIFICATION-GUARDRAIL`, commit 5f4d7187a) instead of the injectable `nowMsFn` → the reparse is UNVERIFIED and may have skipped/partial-run. SEQUENCING FIX (encoded in the row): next cycle MUST NOT trust any "reparse done/success" status — ARM the SPIKE only on a DIRECT RAW-probe of `bctc_table_rows` per report_id vs the live named-volume DB showing ANY of the 7 still at 0. `bctc_table_rows` is extraction ground-truth (independent of the falsified cadence rows) → the RAW-probe is trustworthy; the "job ran cleanly" claim is NOT.

**3548 D2D 2026-Q1 = DUPLICATE → folded-not-minted.** Already tracked in `OPS-BCTC-REFINE-REPASS-NONBANK-5T` (folded 07-07 from analysis #3507, same composite=0.10, VNM/VEA OCR-corruption pattern). This is the 2nd emission → recurring-bug 2+, but the tracking row already exists at high pri → NO new row (anti-churn / skip-duplicate). Recorded telegram-report:3548 as a re-emission witness in `backlog-detail.json`; the re-emission proves the non-bank repass batch is OVERDUE (3 days, DEPLOY-GATE unmet). DISTINCT failure class from the 0-row cohort: 3548 = OCR-corruption (rows extracted but assets<equity), cohort = both-layers-empty (0 rows). Kept apart deliberately — different root, different fix path.

**Router asks (I hold no lock — router holds task:po-triage-20260710; no BATCH/dispatch this tick, all triage folded into existing rows):**
- Commit explicit paths: (a) `docs/agent-memory/notebooks/po.md`; (b) `docs/data/orch/orch-state.json` (reparse row, applied via orch-apply.sh); (c) `docs/data/orch/archive/backlog-detail.json` (3548 fold). All 4 reports already claimed via bridge.
- **Real risk (unchanged + sharpened):** reparse is now not just UNSTARTED (07:20Z) but UNVERIFIED-AND-TAINTED. Ensure ops RE-RUNS cleanly (via `nowMsFn`, NOT another DB timestamp rewrite) AND dev-team RAW-probes `bctc_table_rows` per report_id — do NOT accept a status message at face value. If any of the 7 still 0 on a clean RAW-probe → the pre-armed SPIKE dispatches (extraction/OCR/VPS re-fetch pipeline, apps/pdf-extractor; classifier PROVABLY off-path).
- No `.head`/in_progress row touched. git branch=main only. No board row next_agent==po.

---
_Prior tick 07-10T07:20Z: reports 3544 D2D + 3545 EIB 2025-Q4 0-row → CORRECTED+ESCALATED the OPS reparse row (ACB/BID → 2025-Q4 COHORT incl non-bank D2D), classifier candidate dropped as off-path, held ops-first (no live code SPIKE); RAW-proved D2D is non-bank so "4/4 banks" framing was wrong. Committed via router (d7c0f766e sweep + e676030a1 rescope). Prior 06:50Z (1792425a5): SPIKE-CI-PERFILE BATCH F1/F2/F3+P1 filed + minted the reparse row for ACB/BID 3542+3543. Older → git history + `docs/agent-memory/notebooks/archive/po-2026-07-08.md`._

## Standing method (survives rotation)
- RAW-verify every signal/relayed claim from source (git/gh/docker/curl/jq/files/bridge), never payload-trust — trust-verification-is-system-job. This tick: bridge reachable, all 4 report IDs claimed live, both target rows re-read post-write.
- Churn-not-product (★07-04): dedup board-wide before minting; recurring symptom on identical inputs → NO priority flip-flop, NO dup mint. Detection-recurs ≠ fix-failed → a SPIKE arms only on a VERIFIED post-fix failure, not on breadth of pre-fix detections.
- Verification-taint discipline: when the process that produced a "done" claim is itself compromised (falsified audit trail), do NOT trust its status — require an INDEPENDENT ground-truth RAW-probe (here: `bctc_table_rows` per report_id, orthogonal to the falsified `cron_job_runs` cadence rows).
- Operational-first for data-coverage/extraction gaps: unconfirmed-RC single-signature failures → reparse via the operational track first; mint code work only on post-reparse evidence. Fold duplicates into the existing tracked row; link the report so status=new stops resurfacing.
- Never touch `.head` or any in_progress row owned by a live worker. PO ≠ prod code. Disposition to router; PO does not spawn.
- Gateway-blind/-partial default this session: use the `scripts/agents-flow/mcp-call.sh` bridge for reads/claims; orch-state writes go through `scripts/orch-apply.sh` locally (no gateway needed); if no self-commit path → write file + flag router to commit. Never leave uncommitted work silently.
