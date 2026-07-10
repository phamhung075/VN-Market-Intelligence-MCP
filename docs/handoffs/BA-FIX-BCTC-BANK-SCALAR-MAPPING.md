# BA Requirement Spec — FIX-BCTC-BANK-SCALAR-MAPPING

**Sprint/task:** FIX-BCTC-BANK-SCALAR-MAPPING (TNB audit c97 HIGH finding `F-BCTC-BANK-SCALAR-MAPPING`)
**BA task:** BA-FIX-BCTC-BANK-SCALAR-MAPPING
**Status:** SPEC COMPLETE
**Author:** ba
**Date:** 2026-07-09
**NEXT:** architect — SPIKE (light: reconcile+extend, do NOT re-derive from zero — see §1)
**Recurrence:** this is at minimum the 5th distinct surfacing of the exact same CTG defect signature (`total_assets=0`, `net_margin_pct=229157%`, `net_revenue=3910`) since 2026-06-16: (1) PO-s70 mint 06-16 as `FIX-BCTC-BANK-SUMMARY-MAPPING`, (2) PO-s91 mint 06-16 (same day, ~21h later) as a near-duplicate `FIX-BCTC-BANK-SCALAR-MAPPING` off TNB c97 — **never deduped against (1)**, (3) PO reconfirm 06-21, (4) bctc-analyst ESC-2 signal 07-01, (5) bctc-analyst c074-c080 continuous re-confirmation 07-03/07-04 that the merged W1-W4 code fix had **not reflowed onto the served row**. `feedback_recurring_bug_escalation` + `feedback_recurring_detection_vs_recurring_failed_fix` both apply.

---

## 1. CRITICAL — this task is a near-duplicate of an ALREADY-ACTIVE sprint. Reuse, do not re-derive.

`FIX-BCTC-BANK-SUMMARY-MAPPING` (`sprint_goal` status **`active`**, `task_board` still open) owns the **exact same defect** — same ticker (CTG 2026Q1), same numbers (`total_assets=0`, `net_margin_pct=229157.06%`, `net_revenue=3910`, `ebitda=3.6e14`), same "no-fake-data" vision. It was minted by PO-s70 at `2026-06-16T00:04:25Z`; **this** task (`FIX-BCTC-BANK-SCALAR-MAPPING`) was independently minted by PO-s91 the same day at `21:34:06Z` off a TNB-audit finding, with the dispatch note explicitly stating *"Board had NO matching task despite TNB 'minted' note"* — the dedup check missed the sibling row (different id string, same defect). That sprint already ran the full cascade this task's route asks for:

- BA spec (`docs/handoffs/BA-FIX-BCTC-BANK-SUMMARY-MAPPING.md`, 13 ACs)
- Architect AC-1 SPIKE (`docs/architecture-briefs/2026-07-01-FIX-BCTC-BANK-SUMMARY-MAPPING.md`) — **zone PINNED to `apps/mcp-server/` only**, `apps/pdf-extractor` explicitly ruled OUT (live evidence: `bctc_md_tables`, the actual pdf-extractor→mcp-server ingestion bridge table, is NULL for both CTG's and VCB's report rows — the row data came from the in-repo agentic-refine pipeline, 100% mcp-server-owned code, not from pdf-extractor). **This overrides the current task's `zone_hint` ("apps/pdf-extractor/ + apps/mcp-server/ — architect SPIKE needed to split") — that split premise was already investigated and rejected 8 days ago.**
- PM 5-unit SPLIT (W1 guard-coverage, W2 markdown row-repair, W3 section-boundary guard, W4 aggregator fixtures, W5 truthful validation_status + **operational CTG re-ingest**)
- Dev: W1-W4 shipped + `done_verified` (`a46131cf1`, `2cd9e1054`, `b630277c7`); two follow-on zone-splits (`FIX-BCTC-BANK-BS-COLUMN-ORDER`, `FIX-BCTC-BANK-FORM-CLASSIFIER-BOLD-STRIP`) also shipped `done_verified` 2026-07-03.
- **W5 (the piece that actually unfreezes CTG's `total_assets`) — still BLOCKED** (`08071f4e2`: "W1-W4 done_verified, W5 blocked"). The architect brief's own W5 text (§2 below) predicted exactly this: *"a container rebuild alone will NOT fix it... dev-mcp-server must re-run the agentic-refine + finalize pipeline... it is easy to miss and would otherwise make AC-5 unverifiable after an apparently-clean code deploy."*

**BA recommendation to architect:** do not spend the SPIKE re-deriving the zone split (already pinned, still correct per §3 below) or re-analyzing `bctcScalarAggregator.ts`'s mapping logic (already fixture-hardened in W4, believed sound-but-unproven). Spend it on the **one open question the twin sprint's SPIKE never had to answer because it assumed a simple operational re-ingest would suffice**: §3's finding that the refine *pipeline itself*, not just CTG's row, has been stalled system-wide for over a month. Cross-link both task ids (`FIX-BCTC-BANK-SUMMARY-MAPPING` W5 + `FIX-BCTC-BANK-SCALAR-MAPPING`) onto one output rather than running two independent fixes — flag the duplicate-task board hygiene to po/dev-team as a non-blocking advisory (BA does not merge/close board rows; not this agent's scope).

---

## 2. BA Blockers

**Zero PO blockers.** All open technical questions below are reserved for the architect SPIKE (same precedent as the twin sprint's §2 — PO already pre-answered every product-level question: generic-fix mandate, no-fake-data floor, non-regression scope). The duplicate-task finding (§1) is an advisory flag for po/dev-team board hygiene, not a blocker on this spec.

---

## 3. BA Live-Probe Findings (2026-07-09/10, RAW-verified vs named-volume `market.db`, `docker exec vn-market-intelligence-mcp-mcp-server-1 bun -e ...` against `/app/data/market.db`)

### 3.1 Defect reconfirmed live, **unchanged in value, but the underlying report row is NEW**

```
CTG (report_id=e497f7d1-…, parsed_at=2026-07-07T16:53:55Z, extraction_method=pdf-parse):
  total_assets=0  total_liabilities=24,735,484,770  equity_total=244,904,306  net_revenue=3,910
  net_margin_pct=229,157.06%  ebitda=362,940,957,001,815  confidence_financial=0
  validation_status=low_confidence  refine_status=PENDING
  validation_notes="Accounting identity violated: Assets (0) ≠ Liabilities (24.735.484.770) + Equity (244.904.306) — mismatch 100.0%"

VCB (report_id=bac3e1c1-…, parsed_at=2026-07-07T16:49:10Z, extraction_method=pdf-parse):
  total_assets=2,550,963,342  total_liabilities=2,316,932,013  equity_total=224,558,726  net_revenue=17,420,998
  net_margin_pct=54.31%  confidence_financial=1  validation_status=passed  refine_status=PENDING
  (identity check: 2,316,932,013 + 224,558,726 = 2,541,490,739 vs 2,550,963,342 — within ~0.37% tolerance, PLAUSIBLE)
```

CTG's numbers are **byte-identical** to the 06-16/07-01 baseline (same `total_liabilities`, `equity_total`, `net_revenue`) despite the report row itself being a fresh re-parse (`report_id` changed from `96e36139-…` to `e497f7d1-…`, 3 weeks apart). VCB stays plausible. This is NOT the same `report_id` the twin sprint's W5 runbook names (`96e36139-…`) — **a re-ingest DID happen since 07-01, but it reproduced the exact same corruption**, which is new evidence the twin sprint's architect brief did not have.

### 3.2 NEW finding — `bctc_table_rows` is EMPTY for both current CTG and VCB reports (not merely CTG-corrupted)

```
bctc_table_rows WHERE report_id='e497f7d1-…' (CTG) → 0 rows
bctc_table_rows WHERE report_id='bac3e1c1-…' (VCB) → 0 rows
```

This differs from the twin sprint's 07-01 finding (CTG 55 rows / 20 null-code; VCB 57 clean rows) — those rows belonged to the now-superseded `96e36139-…`/`31f2a9a9-…` report ids, which still exist in `bctc_table_rows` (3,640 total rows across 19 distinct historical `report_id`s) but are **orphaned from the current served report** (CTG's `financial_reports` row now points at `e497f7d1-…`, which has zero associated table rows). The fresh 07-07 re-ingest never went through the row-level agentic-refine path at all for either ticker.

### 3.3 CRITICAL — the refine pipeline has been stalled system-wide since 2026-06-07, not just for CTG

```
financial_reports.refine_status distribution (all 80 rows, all tickers):
  DONE              n=8   latest parsed/refined 2026-06-07T11:23:46Z
  PARTIAL           n=7   latest 2026-06-07T11:46:04Z
  PENDING           n=63  latest 2026-07-07T17:37:18Z   <- CTG/VCB + 61 other tickers land here
  REJECTED_SANITY   n=2   latest 2026-05-16T21:34:21Z

bctc_refined_units (row-level agentic-refine output table): 506 total rows, MOST RECENT refined_at = 2026-07-04T14:08:34 — 
  ZERO entries for CTG's or VCB's current report_id (e497f7d1-…/bac3e1c1-…, both parsed 07-07, 3 days AFTER the last refine-unit push).
```

**No report has completed refine (DONE/PARTIAL) in over a month.** The 07-07 batch (63 PENDING rows, including CTG, VCB, and — notably — 3 OTHER bank tickers in the same batch also showing `total_assets=0`: **MBB, ACB, BID**; plus non-bank tickers GVR/HSG/DHG at `total_assets=0` and SSI/HCM at implausible near-zero magnitudes) was created by whatever process writes the initial `financial_reports` INSERT (`extraction_method=pdf-parse`, i.e. `parseBctcReport.ts` → `balanceSheetExtractor.ts`, the flat-text corporate-VAS-oriented extractor the twin sprint's architect brief already identified as non-bank-aware) — but never advanced past `PENDING` because the row-level agentic-refine step (`get_bctc_pending_refine`/`push_bctc_refined_unit`/`finalize_bctc_refine`, driven by the `refine_bctc_md` agent) has not produced output for ANY report since 07-04.

**Corroborating cross-link (independent evidence, same window):** `docs/agent-memory/notebooks/archive/po-2026-07-08.md` (line 30) logs a **session-wide gateway-blind escalation 2026-07-08T16:00–18:00Z spanning 7 agent types including `refine_bctc_md` by name**, open 22h+. `docs/architecture-briefs/2026-07-09-arch-headless-gateway-cowork-nopost-closure.md` (closed `DONE` 2026-07-09T20:02Z, one day before this spec) independently root-caused the *current* mechanism of this class of gateway-blindness as **"a CLI/harness client-side MCP-connection-lifecycle defect… not fixable from this repo at all"** — the shipped remediation is detect-and-escalate (loud bug signal instead of silent drop), not restoration of tool access for blind sessions. `refine_bctc_md` calling `push_bctc_refined_unit`/`finalize_bctc_refine` requires exactly the `mcp__gateway__call_tool` surface that closure brief describes as structurally blocked in some spawn contexts.

**Implication for the SPIKE:** the twin sprint's W5 ("operational re-ingest, not a code change, will unfreeze CTG") assumed the refine pipeline itself was healthy and just needed to be pointed at CTG's row once. Live evidence now shows the pipeline has not completed a single report in 34+ days, across 63 accumulated PENDING reports (bank and non-bank alike, not a bank-specific pattern) — a candidate root cause the architect SPIKE must explicitly rule in or out: **is CTG's `total_assets=0` fixable by any `apps/pdf-extractor`/`apps/mcp-server` scalar-layer code change at all, if the pipeline stage that would apply such a fix to real data cannot currently execute?** If confirmed, the fix may need a deterministic/non-agentic reflow path (extend `backfill_bctc_scalars force_reflow`, per the `LF-SERVE-REFLOW` precedent, which currently only targets stale `DONE` reports — not `PENDING` ones) rather than another pass at `refinedMarkdownParser.ts`/`bctcScalarAggregator.ts`. **BA does not pin this — flagged as a MUST-RECONCILE SPIKE input, same posture as the twin spec's §3.2/§3.3 findings.**

### 3.4 Generic-ness evidence bonus (from the same 07-07 batch, useful for AC-9 fixtures)

Beyond CTG, the SAME batch shows the `total_assets=0` signature on 3 more bank tickers (**MBB, ACB, BID** — all `validation_status` low_confidence/failed) and on non-bank tickers (GVR, HSG, DHG). VPB (`total_assets=1,684`, `passed`) and EIB (`total_assets=273,270,407`, `passed_with_warnings`) are bank tickers that parsed usably in the same batch — confirming (same as VCB before) that this is a **per-form/per-layout defect, not a uniform bank-vs-non-bank split** — any fix must remain generic (no CTG/MBB/ACB/BID allowlist), consistent with the existing `generic_mandate`.

### 3.5 Non-regression baseline (unchanged from twin spec §3.4)

FPT 2026-Q1 (`failed`, pre-existing, identity holds — not a target) and FPT/VNM 2025-Q4 (`passed`/`passed_with_warnings`, clean) remain valid non-regression reference rows; not re-probed this cycle (no code has touched the corporate path since the twin sprint's last live-verify).

---

## 4. Functional Requirements

**FR-1 through FR-7 are inherited verbatim from `docs/handoffs/BA-FIX-BCTC-BANK-SUMMARY-MAPPING.md` §4** (root-cause SPIKE scope, generic B02-TCTD row→scalar mapping, honest-NULL income-statement scalars, identity-serve-guard coverage across `get_financial_summary`/`get_bctc_full`/`compare_financials`, truthful `validation_status`, non-regression test harness) — not re-typed here to avoid drift between two specs describing the same code. Architect/pm should treat W1-W4's shipped code as the current implementation of FR-1/FR-2/FR-4/FR-5(partial)/FR-7, not a fresh design.

### FR-8 — Refine-pipeline execution health diagnosis — DDD layer: application/infrastructure (`bctcRefineJob.ts`, `finalizeBctcRefineTool.ts`, the `refine_bctc_md` agent dispatch contract)
NEW this cycle (§3.3). Pin whether the 34-day, 63-report refine stall is: (a) the same harness-level gateway-blind defect already closure-documented (`ARCH-HEADLESS-GATEWAY-COWORK-NOPOST`, cross-link only — not repo-fixable per that brief), (b) a `refine_bctc_md` dispatch/cadence gap (agent not being spawned/scheduled at all), or (c) something else. Output must state which, because it determines whether FR-2's mapping fix can ever reach CTG's served row via the current pipeline, or whether a deterministic non-agentic reflow path is required instead.

### FR-9 — Reflow of already-fixed code onto currently-served stale/frozen rows — DDD layer: application (`backfill_bctc_scalars` / `force_reflow`, extend scope)
The `LF-SERVE-REFLOW` precedent (`a353d7052`) force-reflows stale `DONE` reports; it does not cover `PENDING` reports whose scalar columns were frozen at INSERT time by `finalizeBctcRefineTool.ts`'s documented Case-2 preserve-prior-value logic. If FR-8 concludes the agentic pipeline is unavailable, this FR is architect's fallback design target.

---

## 5. Non-Functional Requirements

Inherited from the twin spec (NFR-1 magnitude-plausibility floor, NFR-2 genericity, NFR-3 RAW-verify-on-named-volume-DB-with-rebuild fidelity) — unchanged, still binding.

---

## 6. Edge Cases (Vietnamese BCTC-specific, incremental to twin spec §6)

- **Report-row churn**: CTG's `report_id` changed twice within a month (`96e36139-…` → `e497f7d1-…`) while reproducing byte-identical corrupted figures — any fix verification/qa gate must query the **current** `report_id` for each ticker, not a pinned historical id (the twin sprint's W5 runbook names a now-stale `report_id`; update it before executing).
- **Pipeline-stall false-negative risk**: a `total_assets>0` reading on a `refine_status=PENDING` row (e.g. VCB, EIB, VPB) is NOT proof the scalar-mapping fix works — per §3.3 those values are frozen INSERT-time residuals from the non-bank-aware flat-text extractor, never touched by the refine pipeline's row-based mapper at all. Any AC that only checks "value is plausible" without also checking `refine_status`/row provenance risks a false-green (same class as `feedback_passive_health_masks_dead_data`).
- **Bank ticker generic-ness sample now larger**: MBB/ACB/BID (corrupt) + VPB/EIB (clean-ish) join CTG/VCB as live fixture material for AC-9 — use, don't allowlist.

---

## 7. Numbered Acceptance Criteria

Carrying the twin spec's AC-1 through AC-13 **by reference** (same numbering, same text — see `docs/handoffs/BA-FIX-BCTC-BANK-SUMMARY-MAPPING.md` §7) as the floor this task must also satisfy, plus:

14. **AC-14 [dedup, non-blocking advisory]:** architect/po/dev-team reconcile the two task ids (`FIX-BCTC-BANK-SUMMARY-MAPPING`, `FIX-BCTC-BANK-SCALAR-MAPPING`) onto ONE execution thread before pm decomposes further work — do not run two parallel independent fixes for the same defect.
15. **AC-15 [pipeline-health gate, MANDATORY before re-attempting W5-class operational re-ingest]:** FR-8's diagnosis is produced and answers, with live evidence: is the agentic-refine pipeline (`refine_bctc_md` → `get_bctc_pending_refine`/`push_bctc_refined_unit`/`finalize_bctc_refine`) currently able to execute end-to-end for at least one report? If NO, AC-5 (CTG plausible scalars) cannot be closed by a code-only fix — FR-9's deterministic reflow path (or an equivalent) must be scoped instead, and this must be stated explicitly in the architect brief rather than silently re-attempting the same blocked W5 runbook.
16. **AC-16 [current-row verify]:** all live-verify steps (BA's, qa's) target CTG's **current** `report_id` (`e497f7d1-…` as of this spec — re-check freshness before qa gate, it may have changed again) and VCB's current `report_id` (`bac3e1c1-…`), not the twin spec's now-stale `96e36139-…`/`31f2a9a9-…`.
17. **AC-17 [genericity, extended fixture pool]:** if code changes are made, MBB/ACB/BID (corrupt, same 07-07 batch) are available as additional real-data non-allowlisted proof points beyond CTG/VCB — use where useful for AC-9, do not hardcode.

---

## 8. Cascade-Ordering Enforcement (recurrence_mandate)

Per `feedback_recurring_bug_escalation` (now 5th+ re-fire) and `feedback_recurring_detection_vs_recurring_failed_fix` (W1-W4 code shipped and `done_verified`, but never proven to reach a served row — "detection never ran" for the actual fix, not "fix failed"):

```
ba (this doc)  →  architect (LIGHT SPIKE: reconcile twin-sprint zone pin [already correct, apps/mcp-server/ only],
                             answer FR-8's pipeline-health question, decide FR-2-vs-FR-9 path)
                      │
                      ▼
                 architect brief: pipeline-health verdict + (mapping-fix reuse | deterministic-reflow design)
                      │
                      ▼
                 pm reconciles with the twin sprint's still-open W5 rather than minting a parallel W5
                      │
                      ▼
                 dev (dev-mcp-server, same zone as twin sprint) → qa RAW re-probe on CURRENT report_ids
```

architect MUST NOT re-run the full AC-1 SPIKE from zero (zone is already pinned, mapping logic already fixture-hardened) — the value-add this cycle is FR-8/FR-9, not a repeat of §3.2 zone forensics.

---

## Decision Journal

**task_id:** FIX-BCTC-BANK-SCALAR-MAPPING
See `docs/agent-memory/decisions/sprint-FIX-BCTC-BANK-SCALAR-MAPPING-ba.md`.

## [Architect] Brownfield Findings (LIGHT SPIKE — DONE)

**Full brief:** `docs/architecture-briefs/2026-07-10-FIX-BCTC-BANK-SCALAR-MAPPING.md` (live evidence, code trace — this section is a pointer + zone summary per the flow contract).

- **Zone:** `apps/mcp-server/` — reconciled unchanged from the twin sprint's 2026-07-01 SPIKE. Not re-derived.
- **FR-8/AC-15 verdict:** **(a) confirmed** — the refine pipeline stall is the same harness-level gateway-blind defect (`docs/architecture-briefs/2026-07-08-gateway-blind-cli-handshake-spike.md`), directly corroborated: `bctc_refined_units` zero writes 07-05→07-10 (last write 07-04T14:08:34), ALL 4 `refine-bctc-*` cowork slots frozen at `last_fired` 07-03/07-04 (and in fact ALL 23 cowork slots frozen since 07-07T20:17:30Z), and `docs/signals/processed/cowork-team-20260708T090000Z.json` explicitly names `refine_bctc_md` as skipped `SKIPPED-GATEWAY-BLIND` on a correctly-matched, correctly-scheduled tick — ruling out (b) dispatch/cadence gap. **AC-15 answer: NO, the pipeline cannot currently execute end-to-end** (most recent evidence 2026-07-09T21:01:48Z, gateway still absent). A secondary, distinct ~71h session-absence gap (07-04→07-07) is layered underneath, already tracked by the separate cowork-guaranteed-slot-durability chain — not re-scoped here.
- **FR-9 re-scope (IMPORTANT — BA's literal ask is a no-op):** `backfillBctcScalarsTool.ts`'s default (no `force_reflow`) already targets `refine_status='PENDING'` — `force_reflow=true` extends to ALSO include `DONE`, the opposite direction from the spec's framing. RAW-queried the full live table: **100% of the 63 PENDING reports (CTG/VCB included) have ZERO `bctc_table_rows`** — the tool's existing 0-row skip guard means calling it today, with or without `force_reflow`, returns `SKIPPED` for every one of them; extending the status filter changes no served value. Real, narrower fallback found: CTG's OLD `report_id` (`96e36139-…`, now orphaned — the ticker+period was hard-deleted+re-minted on re-parse, not upserted) still holds 451 same-period table rows; a scoped `source_report_id` carry-forward extension (sequenced strictly AFTER the twin sprint's W2 row-repair deploys) can close AC-5 for CTG without waiting on the gateway. VCB and the other 62 PENDING reports have **no equivalent orphaned same-period data** — no safe deterministic substitute exists for them today (re-running the raw extractor reproduces the same corruption, per BA's own byte-identical-reparse finding); flagged as separate, larger backlog scope, not this sprint. Full detail + risk flags (esp. sequencing risk) in the brief.
- **AC-14 (dedup, advisory only — architect does not merge board rows):** recommend pm/po reconcile `FIX-BCTC-BANK-SUMMARY-MAPPING` (still active, W1-W4 done_verified, W5 blocked) and this task onto ONE thread — this brief's Track 1 carry-forward design is the concrete deterministic replacement for the twin sprint's blocked W5, not a second parallel W5.
- **AC-16:** CTG (`e497f7d1-…`) and VCB (`bac3e1c1-…`) current `report_id`s re-verified live at brief time — unchanged since BA's spec. Twin sprint's W5 runbook (`96e36139-…`) is stale regardless of which execution path (agentic re-ingest vs. Track-1 carry-forward) is eventually run.
- **BUILD-STANDARD:** not-applicable (SPIKE itself); Track 1 build (if pm approves) is `lean`.
- **Scan clean:** true ✓

## RETURN
DONE: BA spec complete — requirements written to `docs/handoffs/BA-FIX-BCTC-BANK-SCALAR-MAPPING.md`. Zero PO blockers. Architect LIGHT SPIKE complete — FR-8 verdict (a) confirmed with fresh live evidence, FR-9 re-scoped (BA's literal ask is a no-op; real fallback = CTG-specific carry-forward Track 1).
ZONE: `apps/mcp-server/` (re-confirmed from twin sprint's architect SPIKE; `apps/pdf-extractor/` ruled OUT — the current task's own `zone_hint` proposing a split is stale)
NEXT: pm — reconcile with the twin sprint (`FIX-BCTC-BANK-SUMMARY-MAPPING`) onto ONE execution thread per AC-14 rather than minting a parallel W5; decompose Track 1 (§2.5 of the brief) as the concrete W5 replacement, sequenced after the twin sprint's W2 deploys. Track 2 (general 62-report unblock) is separate backlog scope, not this sprint.
HANDOFF: `docs/handoffs/BA-FIX-BCTC-BANK-SCALAR-MAPPING.md` + `docs/architecture-briefs/2026-07-10-FIX-BCTC-BANK-SCALAR-MAPPING.md`
PIPELINE: continue
