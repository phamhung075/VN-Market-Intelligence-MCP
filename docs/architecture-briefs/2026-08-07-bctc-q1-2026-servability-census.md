# BCTC Q1-2026 Servability Census — Architect Findings

**Task:** `SPIKE-BCTC-Q1-2026-SERVABILITY-CENSUS` | **Zone:** apps/mcp-server | **Type:** SPIKE (plan_only, supervised)
**Author:** architect | **Date:** 2026-08-07

**Scan clean:** true ✓ — brownfield read of `bctcFullTools.ts` (`checkPublishability`), `bctcIdentityGuard.ts`,
`newsChainFallback.ts`, `bctcReparseJob.ts` (`insertFallbackRecord`) done before any conclusion below.

---

## 0. Method — both planes, live, this tick (2026-08-07)

- **SSOT ticker set:** `docs/data/system-map.json` `.project.watchlist[]` — 33 `active:true` tickers (never the
  undefined ops "58"; see §6). Plus **HCM**, folded in per explicit `po_decision_a_20260721T16` even though HCM is
  **not** a watchlist member (verified: `jq '.project.watchlist[]|select(.ticker=="HCM")'` → empty). 34 census
  inputs total.
- **SERVING plane:** live `get_bctc_full(code, year=2026, quarter="Q1")` for all 34 tickers via
  `scripts/agents-flow/mcp-call.sh` (gateway meta-tools are absent from this session's tool binding —
  degraded-mode workaround per `docs/standards/gateway-call-contract.md` §6, Bash-equipped-agent path;
  corroborated on first call, not re-raised).
- **DB plane:** direct host read of the live bind-mounted `data/live/market.db` (`docker inspect` confirmed
  `Type=bind`, no `-wal`/`-shm` present, `PRAGMA journal_mode=delete`, `financial_reports` count 257 —
  matches the exact figure in the REPARSE row's own 2026-08-06 QA note, corroborating this is the live DB, not
  the June-era named-volume decoy). Queried `financial_reports` by `sort_key='2026-Q1'` (NOT
  `period_year=2026 AND period_quarter=1` — see §1 pitfall) joined with `refine_status`,
  `bctc_refined_units` counts, and `list_stored_pdfs`.
- Did **not** weight `get_earnings_calendar` — PO/QA already established (`po_ac_contamination_20260721T16`,
  `po_acceptance_reconciliation_20260721T1649`) that NGAY-NOP calendar state is a corrupted discriminator for
  this cluster; `published_at` pulled directly off the DB row instead (same underlying field, no calendar-layer
  distortion).

## 1. Pitfall caught mid-probe — `period_quarter` type drift (kin of `feedback_empty_read_is_not_evidence`)

`financial_reports.period_quarter` is declared `INTEGER` but **2 of 257 rows store it as the literal string
`"Q1"`/`"Q3"`** — placeholder rows written before extraction ever ran (`refine_status='pending'`,
`extraction_confidence=NULL`). One of the two is **HUT's own 2026-Q1 row**. A naive
`WHERE period_year=2026 AND period_quarter=1` filter **silently drops HUT** and would have mis-reported it as
"DB-absent" (mode 2) when a real stub row exists. Re-ran every DB query on `sort_key='2026-Q1'` (text, immune to
the type drift) instead. This is a genuine, narrow schema-hygiene finding — not folded into any of the 3 modes
below, noted for whoever next touches `financial_reports` DDL/ingest.

## 2. Per-ticker census (34 inputs: 33 watchlist + HCM)

| Ticker | Serving result (live) | DB: total_assets | DB: refine_status | Mode | Routes to |
|---|---|---|---|---|---|
| BSR | `[CORRUPT DATA — SKIP]` total_assets=166.52 < equity (scale) | 166.52 | PENDING | **1 (scale variant)** | `FIX-BCTC-VALIDATION-GATE-NONBANK-ZERO-SCALE` |
| DGC | `[CORRUPT DATA — SKIP]` total_assets=0 | 0.0 | PENDING | **1** | `FIX-BCTC-REPARSE...` (remediation debt) |
| DXG | `[CORRUPT DATA — SKIP]` total_assets=0 | 0.0 | PENDING | **1** | same |
| FRT | `[CORRUPT DATA — SKIP]` total_assets=0 | 0.0 | PENDING | **1** | same |
| GEX | `[CORRUPT DATA — SKIP]` total_assets=0 | 0.0 | PENDING | **1** | same |
| KDH | `[CORRUPT DATA — SKIP]` total_assets=0 | 0.0 | PENDING | **1** | same |
| PDR | `[CORRUPT DATA — SKIP]` total_assets=0 | 0.0 | PENDING | **1** | same |
| VJC | `[CORRUPT DATA — SKIP]` total_assets=0 | 0.0 | PENDING | **1** | same |
| VHM | `[CORRUPT DATA — SKIP]` total_assets=0 | 0.0 | PENDING | **1 — NOT reparse-batch, pre-existing (see §4)** | `FIX-BCTC-REPARSE...` (remediation debt) |
| VIC | `[CORRUPT DATA — SKIP]` total_assets=0 | 0.0 | PENDING | **1 — NOT reparse-batch, pre-existing (see §4)** | same |
| VNM | `[CORRUPT DATA — SKIP]` total_assets=0 | 0.0 | PENDING | **1 — NOT reparse-batch, pre-existing (see §4)** | same |
| BID | `Chưa có dữ liệu BCTC cho BID. Kiểm tra bằng list_stored_pdfs.` | **no row** | — | **2** | `FIX-BCTC-Q1-2026-STORED-PDF-INGEST-STALL-15T` (no PDF at all for Q1) |
| DAG | `...cho DAG...` | **no row**, **zero PDFs for DAG at ANY period** | — | **2 (deepest — total acquisition gap)** | same |
| HUT | `Chưa có dữ liệu BCTC` | stub row, `{}` JSON, total_assets NULL | pending | **2 — PDF stored 06-13, never parsed** | same (row's own natural-control member) |
| PLX | `...cho PLX...` | **no Q1 row** (PDF stored 06-07) | — | **2 — natural-control member** | same |
| DBC | `Chưa có dữ liệu BCTC` | 15,699,358.5 | **PENDING** | **3** | `FIX-BCTC-REFINE-DURABLE-TRIGGER-BACKSTOP` (corrected — see §5) |
| DIG | same | 17,721,034.2 | PENDING | **3** | same |
| KDC | same | 5,852,139.0 | PENDING | **3** | same |
| MSN | same | 123,512,827.0 | PENDING | **3** | same |
| NVL | same | 8,554,586.2 | PENDING | **3** | same |
| SAB | same | 24,199,404.8 | PENDING | **3** | same |
| SHB | same | 930,982,542.0 | PENDING | **3** | same |
| SSI | same | **2.0 — implausible, near-zero** | PENDING | **3, flag for VALIDATION-GATE forward-test (§6b)** | primarily REFINE, secondarily VALIDATION-GATE |
| VCI | same | 1,280,667.9 | PENDING | **3** | same |
| VIX | same | 34,167,047.2 | PENDING | **3** | same |
| VND | same | 47,964,656.5 | PENDING | **3** | same |
| HCM (non-watchlist, folded per PO) | same | 363,352.4 | PENDING | **3** | same |
| EIB | `PUB-5: confidence too low (31%)` — headline withheld entirely | 269,958,406.0 | **DONE** | **gate working as designed, not a mode** (§6c) | none — correctly conservative |
| DPM | Served, but Validation: failed — assets≠liab+equity (99.9% mismatch), all income-stmt lines 0 | 1,369,863.0 | DONE | Served, plausibility gap (§6b) | flag for VALIDATION-GATE forward-test |
| FPT | Served, plausible | 68,586,094.8 | DONE | Servable | — |
| HPG | Served, plausible (total_assets); some income lines 0 (residual, out of scope) | 259,327,500.2 | PARTIAL | Servable | — |
| KBC | Served, plausible (total_assets); some income lines 0 (residual, out of scope) | 71,803,161.8 | PARTIAL | Servable | — |
| VCB | Served, fully plausible | 2,550,963,342.0 | PARTIAL | Servable | — |
| VRE | Served, plausible | 60,962,946.0 | PARTIAL | Servable | — |

## 3. True unservable count

**27 of 33 watchlist tickers (81.8%) are unservable** through `get_bctc_full(·, 2026, Q1)` right now:
Mode 1 = **11** (10 zero-signature + BSR scale-signature) · Mode 2 = **4** (BID, DAG, HUT, PLX) · Mode 3 = **11**
(DBC, DIG, KDC, MSN, NVL, SAB, SHB, SSI, VCI, VIX, VND). EIB is a 12th ticker returning zero usable data but is
architecturally a **correctly-functioning gate**, not a defect — see §6c; if counted, unservable = 28/33 (85%).
Servable = 6/33 (DPM excluded from "clean" servable — see §6b plausibility flag; if DPM is excluded the clean-servable
count is 5). **6 is the number to use for "true servable."**

This is far below ops's claimed **29 servable** and does not resemble "~40 unservable of 58" under any
denominator I could reconstruct — `SELECT COUNT(DISTINCT action_code) FROM financial_reports WHERE
sort_key='2026-Q1'` (whole DB, not watchlist-scoped) returns **46**, not 58. Ops's classification is not just
arithmetically self-contradictory (29+40≠58) as already flagged in this SPIKE's title — it materially
**overcounts servability** (29 claimed vs. 6 actual) against the real SSOT watchlist.

## 4. VNM / VIC / VHM — mode-1, but NOT reparse-batch spread (answers PO's "also verify")

PO's dispatch asked to verify VNM/VIC (not in the reparse row's 16-ticker title) and treat 16 as a lower bound.
**Confirmed: VNM, VIC, and a third unnamed ticker VHM all carry the mode-1 `total_assets=0` signature live, right
now.** But their DB `parsed_at` timestamps are **2026-06-07 (VHM, VIC) and 2026-06-15 (VNM)** — 5–6 weeks
**before** the reparse batch's active window (07-19/07-20), and **unchanged since** (no reparse write has
touched them). By contrast, the other 7 zero-signature tickers (DGC, DXG, FRT, GEX, KDH, PDR, VJC) all carry
`parsed_at` timestamps **inside** 07-19T14:55Z–07-20T04:14Z, matching the reparse row's own 16-ticker list
exactly.

**Conclusion:** the true mode-1 set is 17 tickers total across both cohorts (7 reparse-batch-vintage watchlist
members + VHM/VIC/VNM as **independent, pre-existing** June OCR failures + BSR's scale variant), not because the
reparse batch is spreading, but because **two unrelated corruption sources produce the identical
`total_assets=0` serving signature** and are indistinguishable without `parsed_at`. Remediation-wise this
doesn't matter (both land in the same "already-corrupt row, out of scope of the DONE_VERIFIED write-back-guard
fix, tracked as remediation debt" bucket per that row's own `remediation_note`) — but the **mechanism** claim
("actively spreading") is **not supported** by the timestamps. 16 was correctly a lower bound, but the excess is
old debt, not live spread.

## 5. SSI/NVL "servable→unservable" regression — DISPROVEN, not merely unproven

PO's `po_acceptance_reconciliation_20260721T1649` already walked back the 07-21 "watch-spread" claim as
*"unproven (not disproven)"* for lack of a serving-plane baseline. This census now has DB-plane data that
**disproves** it outright: NVL (`parsed_at=2026-06-08`) and SSI (`parsed_at=2026-06-07`) were extracted **before**
the reparse batch's 07-19 window and have **never been touched since** (`refine_status='PENDING'`, zero rows in
`bctc_refined_units`). They are not corrupt (`total_assets` non-zero for NVL; SSI's near-zero 2.0 is a separate
plausibility issue, §6b) — they are, and always were, **mode-3 refine-backlog stalls**, not reparse victims. The
07-15 "servable" read almost certainly came from the calendar plane (DA NOP), not a `get_bctc_full` probe — which
is exactly the class of error the SPIKE's own method section warned about.

## 6. Group {NVL, SSI, VCI, HCM} — PO decision (a) confirmed correct, no new row

All four are **mode 3**: present in DB, non-zero `total_assets` (except SSI, flagged below), `refine_status=
PENDING`, zero `bctc_refined_units` rows. PO's fold-not-mint call was right, and the group is not a distinct
4th mode — it is the same mechanism as 7 other watchlist tickers already in the mode-3 bucket.

### 6a. **Correction to the SPIKE's own routing assumption — mode 3's real mechanism**

The SPIKE's deliverable text pre-assigned mode 3 to `FIX-BCTC-VALIDATION-GATE-NONBANK-ZERO-SCALE` (framed as
"API-gated by validation-failed/low-confidence"). **Live code read (`bctcFullTools.ts:610-628`,
`checkPublishability` PUB-1) shows this is wrong.** The gate that blocks all 11 mode-3 tickers is:

```ts
if (!report || !["DONE", "PARTIAL"].includes(report.refine_status)) {
  return { publishable: false, reason: "Chưa có dữ liệu BCTC" };
}
```

`validation_status` (the field `FIX-BCTC-VALIDATION-GATE-NONBANK-ZERO-SCALE` is about) **plays no role in this
block** — every mode-3 ticker has a real, non-null `validation_status` (`low_confidence` or `failed`), but that
is not what PUB-1 checks. What actually blocks them is `refine_status='PENDING'` — the **separate
bctc_table_rows "agentic refine" pipeline** (LLM-driven table structuring, distinct from the OCR/pdf-parse
extraction that already wrote the scalar `total_assets` etc.) has simply never run on these 11 reports. Every
mode-3 ticker's `extraction_method='pdf-parse'` (a real Tier-2 text extraction, not a stub — confirmed by reading
populated `balance_sheet_json` for DBC) and 0 rows in `bctc_refined_units`. Servable tickers (DPM, FPT, HPG, KBC,
VCB, VRE) all have `refine_status ∈ {DONE, PARTIAL}`; every unblocked-by-mode-1 ticker with `refine_status=
PENDING` is blocked. This correlation is exact across all 34 census inputs — no exceptions.

**Corrected routing: mode 3 → `FIX-BCTC-REFINE-DURABLE-TRIGGER-BACKSTOP`, not
`FIX-BCTC-VALIDATION-GATE-NONBANK-ZERO-SCALE`.** That row already exists, is scoped exactly to "bctc_table_rows
has one live producer, session-CronCreate-dependent, backlog stuck at refine_status=PENDING" — it is the correct
existing home; no new row needed.

### 6b. Fresh forward-looking evidence for `FIX-BCTC-VALIDATION-GATE-NONBANK-ZERO-SCALE` (unchanged scope, new instances)

That row remains correctly scoped for its *own* stated problem — `validation_status` is a soft label that
doesn't hard-block plausibility failures. Two **new** live instances found this tick, beyond its original
POW/VEA examples:
- **SSI** `total_assets=2.0` (million VND — i.e. ~2,000 VND) is not a real number for a top-tier broker;
  currently harmless only because mode-3's PUB-1 gate coincidentally blocks it first. The moment
  `FIX-BCTC-REFINE-DURABLE-TRIGGER-BACKSTOP` drains SSI's backlog entry, this exact scale defect will pass
  straight through `checkPublishability` (no PUB-6-style bound catches "total_assets=2") and get served as a
  headline number. Recommend the validation-gate row add this as a regression test case.
- **DPM** is *already served* today with `Validation: failed — Assets(1,369,863) ≠ Liabilities(767)+Equity(0),
  mismatch 99.9%` shown as a footnote, not a block — headline `total_assets` is served anyway (equity=0 for a
  real operating company is implausible). This is a live, currently-shipping instance of exactly the "soft
  label, not hard-block" defect the row already targets.

### 6c. EIB — not a mode, a working gate

EIB (`refine_status=DONE`, `total_assets` present) is blocked by **PUB-5** (`extraction_confidence=31% < 50%
threshold`) — the *entire* report is withheld, only the PUB-5 banner is returned. This is the confidence-gate
mechanism doing exactly what its code comment says it should. Not routed anywhere; noted only so its
"technically-unservable" count isn't confused with a defect needing a fix.

## 7. `FIX-BCTC-Q1-2026-STORED-PDF-INGEST-STALL-15T` — scope has shrunk to 2 of its original 15

Of the row's originally-named 15-ticker cohort (DBC DGC DXG FRT GEX **HUT** KDC KDH MSN PDR **PLX** SAB SHB VJC
VND), this census's live data shows:
- **7 → mode 1** (DGC, DXG, FRT, GEX, KDH, PDR, VJC) — already absorbed by the reparse row's own 16-ticker list.
- **6 → mode 3** (DBC, KDC, MSN, SAB, SHB, VND) — extraction genuinely happened (`pdf-parse`, real non-zero
  `balance_sheet_json`), they are refine-backlog stalls, not ingest stalls.
- **Only HUT and PLX remain true ingest-stall members** — both have a stored Q1-2026 PDF
  (`HUT_2026_Q1.pdf` 4.2MB, stored 06-13; `PLX_2026_Q1.pdf` 14.8MB, stored 06-07) and **zero** extraction attempt
  (HUT: hollow `{}` stub row; PLX: no row at all). This matches this row's own `ops_recon_note` (2026-08-06),
  which already independently reached the same 7/7/1 split — this census corroborates it precisely and resolves
  the "1 VPS_STALE" bucket ops flagged for PLX (my live probe returned the plain absent string, not a
  `vps_stale` JSON payload — the vps-stale contamination `ops_recon_note` warned about may itself be
  intermittent; worth a note to whoever verifies `FIX-BCTC-SERVING-GATE-VPSSTALE-IGNORES-DEMAND-QUEUE-DEPTH`).
- **BID and DAG were never part of this row's 15-ticker cohort** (their absence surfaced via the watchlist
  census, not the original PDF-storage sweep) — BID has PDFs for 2026-Q2/2025-Q4 but genuinely none for Q1;
  **DAG has zero stored PDFs for any period** (deepest acquisition-layer gap in the whole census). Both are
  `mode 2` and belong to the same remediation family as HUT/PLX, but are a **fresh scope-widening finding for
  this row**, not previously named anywhere in its notes.

**Recommendation:** whoever next works this row should narrow its cohort to {HUT, PLX, BID, DAG} (4, not 15) —
the other 11 originally-named tickers have already moved on to later pipeline stages with their own owners.

## 8. Fresh evidence for `FIX-BCTC-REFINE-DURABLE-TRIGGER-BACKSTOP` — premise is stale, problem has shifted from dormancy to throughput

That row's diagnosis (filed 07-12, folded 07-17) says the refine producer is **dormant** ("0 new rows since
2026-07-04"). Live check this tick: `bctc_refined_units` MAX(`refined_at`) = **2026-08-07T16:41:29Z** (today),
with rows produced on 07-25, 07-28, 07-29, 07-30, 07-31, 08-01, 08-06, 08-07 — **the producer is active, not
dormant.** But the `refine_status='PENDING'` backlog has **grown monotonically** across every checkpoint on
record: 151 (07-12) → 181 (07-17) → **230 (08-07, today)**. This is a **throughput gap** (extraction outpacing
refine), not a dormancy gap. The row's AC (durable cron survival across session restarts) may still be a valid
partial fix, but its own premise needs updating before anyone scores it "done" against a producer that already
runs daily — closing it on "the cron fires now" would not shrink the still-growing backlog. Flagged for whoever
next works that row; not remediated here (plan_only).

## 9. Epic-vs-fold recommendation

**FOLD — no epic, no new row.** All 27 unservable tickers resolve cleanly into the 3 pre-existing modes, and
(after the §6a correction) each mode maps to exactly one existing, correctly-scoped row:

| Mode | Count | Home | Status of home (live) |
|---|---|---|---|
| 1 — corrupt/identity-guard skip (total_assets≤0 or scale) | 11 | `FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP` (write-back guard, DONE_VERIFIED) for the mechanism; remediation of the 55 pre-existing corrupt rows (this census's 11 are a subset) is out of that row's scope by its own `remediation_note` — untracked as a *dedicated* remediation row today; scale-signature sub-case (BSR) → `FIX-BCTC-VALIDATION-GATE-NONBANK-ZERO-SCALE` | write-back guard shipped + verified; bulk re-extraction of corrupt rows has no owning row (see §9a) |
| 2 — absent / never extracted | 4 | `FIX-BCTC-Q1-2026-STORED-PDF-INGEST-STALL-15T` (scope narrows to 4, §7) | REVIEW |
| 3 — present, non-zero, refine-pending | 11 (+HCM) | `FIX-BCTC-REFINE-DURABLE-TRIGGER-BACKSTOP` (corrected home, §6a) | BACKLOG, premise stale (§8) |

### 9a. One real gap noted, not minted

Mode-1 remediation (re-extracting/repairing the 55 already-corrupt `financial_reports` rows, of which this
census's 11 watchlist tickers are a subset) is explicitly out-of-scope for the DONE_VERIFIED reparse row and is
**not owned by any single row today** — the closest candidates (`OPS-BCTC-REFINE-REPASS-NONBANK-5T`,
`W5-FU-CTG-REFINE-96e36139`) are per-ticker/per-report remediation rows, not a batch-remediation owner for this
census's 11-ticker set. This is a genuine gap, but it is a **backlog-sizing/ownership gap within an existing FIX
family**, not a new failure mode the SPIKE's 3-mode framework failed to cover — recommend PO decide whether to
widen one of those two rows' scope or open a small batch-remediation row, rather than this SPIKE minting one
unilaterally (outside plan_only SPIKE authority).

## 10. Residual, out-of-scope observations (not part of the 3-mode census)

- DPM/HPG/KBC/VRE serve plausible `total_assets` but some income-statement line items render as `0 tỷ VND`
  (e.g. HPG Operating Profit/EBITDA=0 despite Net Profit=9,055.9 tỷ) — looks like a `bctc_table_rows`
  granularity gap for specific line codes, not a servability failure. Worth a future architect look, not
  chased here (timebox).
- The `period_quarter` string-vs-integer type drift (§1) affects only 2/257 rows today but is a schema-hygiene
  risk for any future consumer that filters numerically.

---

## RETURN
DONE: SPIKE census complete — 34 tickers probed both planes, 3-mode breakdown produced, mode-3 routing corrected
from the SPIKE's own assumption, no new row minted (fold verdict).
ZONE: apps/mcp-server/
NEXT: po | adjudicate the epic-vs-fold recommendation (§9), the mode-3 re-routing correction (§6a), and the
unowned mode-1 batch-remediation gap (§9a); decide whether to narrow FIX-BCTC-Q1-2026-STORED-PDF-INGEST-STALL-15T
per §7 and refresh FIX-BCTC-REFINE-DURABLE-TRIGGER-BACKSTOP's stale dormancy premise per §8.
HANDOFF: docs/architecture-briefs/2026-08-07-bctc-q1-2026-servability-census.md
PIPELINE: continue
