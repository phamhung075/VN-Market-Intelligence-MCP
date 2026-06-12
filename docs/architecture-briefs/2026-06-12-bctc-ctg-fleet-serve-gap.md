# BCTC-CTG-FLEET-SERVE-GAP — Architect Spike Findings

**Date:** 2026-06-12  
**Spike task:** BCTC-CTG-FLEET-SERVE-SPIKE (PO-dispatched, recurring-bug escalation)  
**Investigator:** architect  
**Timebox:** 120 min  
**Mode:** read-only, no production changes, no board mutations

---

## Executive Root Cause (one line)

The fleet refine cron (`cron-refine-bctc.md`) was designed as a host-level Claude schedule but was **never armed** — it exists only as a `.claude/commands/crons/cron-refine-bctc.md` skill file with no active scheduler entry — so `refine_bctc_md` has never fired, `refine_status` stays `PENDING` for 33 rows, and PUB-1 (`refine_status IN ('DONE','PARTIAL')`) blocks every one of them from being served.

---

## Evidence Chain

### Gate 1 — PUB-1 (primary blocker, `bctcFullTools.ts` L618-623)

```
checkPublishability() line 612:
  if (!report || !["DONE", "PARTIAL"].includes(report.refine_status)) {
    return { publishable: false, reason: "Chưa có dữ liệu BCTC" };
  }
```

Live DB probe of CTG row `c6b17c36-1f4f-48bc-a367-b48afc163ceb`:

| field | value |
|---|---|
| refine_status | `PENDING` |
| text_status | `COMPLETE` |
| extraction_confidence | 0.5625 |
| report_scope | NULL |
| net_revenue | 3910.0 |
| total_assets | 24,735,484,770 |

PUB-1 fires immediately. PUB-3 (balance-sheet decomposition) is never reached.

### Gate 2 — Fleet cron never armed

The refine pipeline is **Option-Y** (AR-ARCH-INVOKE ruling, `bctcRefineJob.ts` header): the in-container `spawn("claude",...)` path was deleted. Refine now requires a host-level fleet cron to call `refine_bctc_md` subagent, which calls `get_bctc_pending_refine` → push units → `finalize_bctc_refine`.

The cron skill exists at `.claude/commands/crons/cron-refine-bctc.md` (schedule: `0 9,14,20 * * *` UTC). But:

1. `docs/data/cron-registry.json` — 65 registered jobs, **zero mention of `refine`** or `refine_bctc_md`.
2. `docs/data/delivery-cron-delivered.json` — empty `{}`.
3. No launchd plist or crontab entry for the refine cron found on the host.
4. Task `REFINE-CRON-ARM` was created as a `batched_as` reference inside `FU-CTG-REFINE-PICKUP` (orch-state) but was **never instantiated as a standalone task** and never dispatched to agent-father for scheduling.

### Gate 3 — SUPERSEDED closure was premature

`FU-CTG-REFINE-PICKUP` was marked `SUPERSEDED` with rationale: *"serve-guard makes CTG serve honest corrupt-skip; re-extraction = fleet cron scope"*. This rationale contained the fix (`fleet cron scope`) but deferred it without creating the REFINE-CRON-ARM task. The arm step was never executed, making the SUPERSEDED closure a false completion that left the fleet structurally dark.

### Gate 4 — OCR text is present; refine inputs are ready

```sql
-- pdf_extracted_text for CTG pdf_path basename
filename = '20260428 - CTG - BCTC hop nhat Quy I.2026 va giai trinh bien dong loi nhuan_signed.pdf'
pages    = 61   -- confirmed live
```

`get_bctc_pending_refine` would find this row and return `windows[]` correctly. The refine agent would have real data to process. Nothing is missing from the pipeline inputs — only the trigger is absent.

---

## Fleet-Wide Blocked-Ticker Counts (per gate)

### refine_status breakdown (all 45 rows)

| refine_status | count | description |
|---|---|---|
| PENDING | 35 | Never processed — fleet cron dark |
| DONE | 7 | Manually or early-pilot processed |
| PARTIAL | 2 | Partially processed (PARTIAL = still served via PUB-1) |
| REJECTED_SANITY | 1 | DGC — terminal state |

### PENDING rows with OCR text available (ready to refine, zero blockers except cron)

33 tickers — full list:

CTG, DIG, DPM (x2), GVR, HCM, HPG (x2), HSG, HVN, KBC (x2), MBB, MWG (x2), NKG, NVL (x2), POW, PPC, REE (x2), SSI, TCH (x2), VCB (x3), VCI, VHM, VIC, VPB, VRE

### PENDING rows with no OCR text (secondary blocker — pdf_path missing)

2 tickers: **D2D** (pdf_path=NULL, OCR exists under `D2D_2026_Q1.pdf` but `fetchAllPageTexts` uses `basename(pdf_path)` — returns empty), **KDC** (pdf_path=NULL, id=`fallback-KDC-2026-Q1`).

These 2 would still fail at the `windows: []` gate (Phase 0 L41 in `refine_bctc_md/flow/main.md`) even after the cron is armed, because `pdf_path` is NULL and `fetchAllPageTexts` cannot derive the filename. They require a separate pdf_path backfill.

### Validation status (stale — set at OCR parse time, not after refine)

| validation_status | count | note |
|---|---|---|
| low_confidence | 22 | Set at OCR parse time; recomputed on read (not a serve blocker) |
| failed | 14 | Same — stale; recomputed on read |
| passed | 5 | — |
| passed_with_warnings | 3 | — |
| pending | 1 | — |

`validation_status` is NOT a gate in `checkPublishability`. It is recomputed on read in `bctcFullTools.ts` BAL-1a block and shown in the Validation display line only. It has no blocking effect.

---

## Structural Root Cause

The BCTC refine pipeline has a **missing execution layer**:

```
OCR extracted (text_status=COMPLETE) ──[cron DARK]──> refine_status=PENDING (forever)
                                                            │
                                                       PUB-1 blocks serve
                                                            │
                                                     "Chưa có dữ liệu BCTC"
```

The pipeline was correctly designed (Option-Y: host-level fleet cron + MCP push tools). The MCP tools (`get_bctc_pending_refine`, `push_bctc_refined_unit`, `finalize_bctc_refine`) are live and functional. The `refine_bctc_md` agent and its flow exist. The cron skill file exists. **The only missing piece is arming the cron in the host scheduler.**

This is not a code defect. It is an ops deployment gap — the `REFINE-CRON-ARM` step was deferred via the SUPERSEDED closure without being completed.

The four prior point-fixes (FIX-CTG-1/2/3 + FIX-CTG-2b) correctly fixed the PDF URL discovery and OCR extraction path. CTG now has 61 pages of clean OCR text. But fixing the input pipeline without arming the refine trigger left the row permanently stuck at PENDING — serving will never unblock without the cron arm.

---

## The ONE Structural Fix

**ARM THE REFINE FLEET CRON** via agent-father.

Zone: `.claude/commands/crons/cron-refine-bctc.md` (cron skill file — already exists, schedule defined)  
Mechanism: dispatch agent-father with task `REFINE-CRON-ARM` to arm `cron-refine-bctc` in the Claude schedule at `0 9,14,20 * * *` UTC (3×/day, outside OFF-HOSE window 02:00–08:59 UTC Mon–Fri defined in `refine_bctc_md/flow/main.md`).

This is not a new feature. The skill, agent, and flow already ship. Arming the cron is a single `CronCreate` operation by agent-father.

### Secondary fix (separate, lower priority)

For the 2 tickers (D2D, KDC) with `pdf_path=NULL`: backfill `financial_reports.pdf_path` from `pdf_extracted_text` where the filename contains the action_code. This is separate scope — these 2 tickers will still be skipped by the refine flow even after the cron is armed (windows=[] gate). Backfill is a one-time migration, not a recurring cron fix.

---

## Recommended Task Decomposition for PM

### Task 1 — REFINE-CRON-ARM (P0, blocker for all 33 tickers)

- **Zone:** `.claude/commands/crons/cron-refine-bctc.md` + Claude schedule
- **Who:** agent-father (cron management)
- **What:** `CronCreate cron-refine-bctc` at `0 9,14,20 * * *` UTC
- **AC:** `CronList` shows `cron-refine-bctc` active; next fire within 24h; after first fire `get_bctc_full(CTG)` returns financial data instead of "Chưa có dữ liệu BCTC"
- **Size:** XS (single CronCreate call)
- **Sequencing:** No prerequisites — OCR is already clean for CTG (61 pages confirmed). Prior PDF mislink fix (FIX-CTG-PDF-MISLINK) already shipped — the correct PDF is in place.

### Task 2 — BCTC-PDF-PATH-BACKFILL (P2, secondary, ~2 tickers)

- **Zone:** `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` or migration script
- **Who:** dev-mcp-server
- **What:** Backfill `financial_reports.pdf_path` for rows where pdf_path IS NULL but `pdf_extracted_text` has pages matching `action_code` pattern
- **AC:** D2D and KDC rows have pdf_path populated; `get_bctc_pending_refine` returns windows > 0 for those rows
- **Size:** S
- **Sequencing:** After REFINE-CRON-ARM is verified working for the 33-ticker fleet

### NOT needed (explicitly ruled out)

- Per-ticker point-fixes (CTG, VCB, D2D individually) — the cron arm covers all 33 in one operation
- Code changes to `bctcRefineJob.ts`, `bctcFullTools.ts`, or `getBctcPendingRefineTool.ts` — the pipeline code is correct
- Re-extraction or re-OCR for CTG — 61-page clean OCR is confirmed present

---

## BUILD-STANDARD: not-applicable

Both tasks are ops/deployment (REFINE-CRON-ARM) and a one-shot migration script (BCTC-PDF-PATH-BACKFILL). No new service, no new feature in an existing service zone. Architect design handoff is not required for Task 1 (ops-only). Task 2 is a migration touching existing schema helpers.

---

## Appendix — Raw DB Evidence

```
-- CTG row (live, 2026-06-12T20:40Z)
id=c6b17c36-1f4f-48bc-a367-b48afc163ceb | action_code=CTG | period=2026-Q1
refine_status=PENDING | text_status=COMPLETE | extraction_confidence=0.5625

-- pdf_extracted_text rows for CTG pdf_path basename
filename='20260428 - CTG - BCTC hop nhat Quy I.2026 va giai trinh bien dong loi nhuan_signed.pdf'
pages=61

-- bctc_refined_units for CTG report
COUNT(*)=0  (never processed)

-- bctc_table_rows for CTG report
COUNT(*)=0  (never processed)

-- Fleet totals
total financial_reports = 45
refine_status=PENDING = 35
  └── with OCR text available = 33 (cron-dark; ready to process)
  └── without OCR text (pdf_path=NULL) = 2 (D2D, KDC; separate backfill needed)
refine_status=DONE = 7
refine_status=PARTIAL = 2
refine_status=REJECTED_SANITY = 1 (DGC — terminal, separate issue)
```
