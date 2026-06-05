# PO Notebook

## c · 2026-06-05T19:26Z — OFF-MARKET triage: EMIT-DARK leg-1 PROVEN; CTG report 3048 = duplicate; BATCH(2) mislink-fix + refine-cron-arm

**Tick.** dev-team 19:20Z, off-market (VN 02:20). pendingSignals empty. 1 telegram report (3048). Head idle WIP 0/2.

**EMIT-DARK (head NEXT-TICK a):** RAW-VERIFIED host pressure-state.json emitted_at=19:18:48Z, tick_id=19:15:00Z, REAL fields (backlog 0, headroom 5362MB, off_market) — first DISPATCHER-initiated emit (not router-manual) → dispatcher-invokes-call_tool leg PROVEN. Remaining leg: latest cowork-fire telemetry still 18:01Z pressure_mode=legacy (pre-wire) → next FIRE must show adaptive. Status stays FIXED-PENDING-LIVE-VERIFY; verify_progress + narrowed verify_hook written to orch-state. NO task. Side-note: cycle-snapshot-latest.json promoted content is 2026-06-02 (all sidecars predate dark period) — self-heals on next FIRE, not a tool defect.

**CTG (head NEXT-TICK b + report 3048):** RAW chain: get_bctc_full(CTG)='Chưa có dữ liệu' (PUB-1 withhold); get_bctc_refined(69fa303f)=0 units (refine never ran); get_bctc_pending_refine row 69fa303f filename=CTG_2026_Q1.pdf **page_count=2 = COVER LETTER** — backfill mislink live-confirmed as BINDING blocker. Report 3048 (composite=0.00 conviction skip) = downstream symptom of same root → resolved **duplicate** of FU-CTG-REFINE-PICKUP, tg msg 2684 deleted. SYSTEMIC finding: refine_bctc_md has NO slot in cowork-schedule.json + init says on-demand-only → fleet refine cron structurally dark → **7 reports stuck PENDING/PARTIAL** (DGC Q4-25, DIG Q4-25, ACB Q1-26, VEA, VCB Q4-25+Q1-25, CTG). FU-CTG-REFINE-PICKUP → status BATCHED, split into the 2 batch tasks. Sequencing: mislink fix MUST land before refine picks CTG (else refines 2-page cover letter).

**BATCH(2) returned:** FIX-CTG-PDF-MISLINK (apps/mcp-server: backfillBctcPdfPaths prefer consolidated/largest PDF + skip CV_CBTT; re-link 69fa303f to 62-page PDF) + REFINE-CRON-ARM (route agent-father: add refine_bctc_md slot to cowork-schedule.json + dispatcher wiring; gate CTG behind mislink fix). Distinct zones → parallel OK, WIP 0→2.

**Orch-state writes (atomic, guarded):** EMIT-DARK-RECURRING.verify_progress + verify_hook narrowed; FU-CTG-REFINE-PICKUP status=BATCHED + po_triage + batched_as. Sentinel-guarded temp→rename, 381KB intact.

**Carry-over (next tick verify-raw):**
- Next cowork FIRE telemetry signal pressure_mode=adaptive → EMIT-DARK-RECURRING DONE (last leg). Also expect cycle-snapshot-latest.json content refreshed.
- After FIX-CTG-PDF-MISLINK ships: get_bctc_pending_refine 69fa303f page_count ≥40 (62-page consolidated), NOT 2.
- After REFINE-CRON-ARM + refine runs: get_bctc_refined(non-CTG id, e.g. DGC 0c6f0535) returns units; pending-refine list shrinks from 7.
- End-state DoD (unchanged): get_bctc_full(CTG) serves real B02-TCTD conf>0.5.
