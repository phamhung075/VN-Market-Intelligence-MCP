# Decision Journal — Sprint FIX-BCTC-BANK-SCALAR-MAPPING · architect

**Sprint goal:** Bank (B02-TCTD) scalar summary obeys the accounting identity (total_assets>0, plausible net_margin_pct) for CTG/VCB, RAW-verified vs named-volume market.db. TNB audit c97 HIGH finding.
**Agent:** architect
**Started:** 2026-07-10T00:11:00Z

---

### STEP architect-S1 · architect · 2026-07-10T00:20:00Z
**task-id:** FIX-BCTC-BANK-SCALAR-MAPPING
**what-done:** LIGHT SPIKE (reconcile+extend, not re-derive) per BA mandate — wrote `docs/architecture-briefs/2026-07-10-FIX-BCTC-BANK-SCALAR-MAPPING.md`; answered FR-8 (pipeline-health, AC-15) and re-scoped FR-9 (deterministic-reflow fallback); appended Brownfield Findings to BA handoff.
**what-considered:**
- Accept BA's FR-9 framing verbatim ("force_reflow doesn't cover PENDING, extend it") — REJECTED after reading `backfillBctcScalarsTool.ts:139-141` live: default (no force_reflow) is ALREADY `refine_status='PENDING'`; force_reflow extends to DONE, opposite direction. Implementing the literal ask would be a silent no-op merge.
- Treat "63 PENDING reports, agentic pipeline stalled" as sufficient FR-9 justification without checking whether a reflow tool has anything to reflow — REJECTED: RAW-queried full live table, 100% of 63 PENDING reports (incl. CTG/VCB) have ZERO bctc_table_rows. The real blocker is the 0-row skip guard, not the status filter. Found this by cross-joining financial_reports x bctc_table_rows counts grouped by refine_status.
- Design a general (all-63) deterministic fallback — REJECTED as this-sprint scope: re-running the raw extractor reproduces the same corruption (BA's own byte-identical-reparse proof); building a new non-LLM table extractor is SPRINT-S+. Found a narrower, real win instead: CTG's old report_id (96e36139) is orphaned (re-parse hard-deletes+re-mints id, no FK migration) but still holds 451 same-period table rows — scoped as Track 1 (source_report_id carry-forward), sequenced after twin sprint's W2 deploys. VCB/MBB/ACB/BID checked individually — none have an equivalent orphaned same-period sibling, so Track 1 does not generalize; flagged Track 2 as separate backlog.
- FR-8 verdict (a) vs (b) vs (c) — confirmed (a) via direct evidence: cowork-team-20260708T090000Z.json explicitly names refine_bctc_md SKIPPED-GATEWAY-BLIND on a correctly-matched, correctly-scheduled tick (rules out (b) dispatch/cadence gap); cross-checked bctc_refined_units write history + cowork-schedule.json last_fired across ALL slots (not just refine-bctc) to confirm scope/timing, found and named a secondary distinct ~71h session-absence gap layered underneath (already tracked elsewhere, not re-scoped).
**why-decision:** Brownfield-first — read the actual live code and live DB before trusting the spec's framing (same standing precedent as the twin sprint's §3.2 contest of PO's claim). A code change that ships green but touches zero served rows is a worse outcome than surfacing the correction now.
**why-change:** FR-9 scope changed from BA's literal ask (extend force_reflow status filter — no-op) to a corrected two-track design (CTG-specific carry-forward now-viable; general fallback deferred to backlog). Zone/mapping-logic unchanged (reconciled, not re-derived) per LIGHT SPIKE mandate. AC-14 dedup and AC-16 report_id-freshness flagged as advisories only, not implemented (pm/po scope).
