# Architecture Brief — BCTC Analyst Merge (v2)
**Date:** 2026-05-29 (revised post-PO scope expansion)
**Author:** agents-architect
**PO Decision:** MERGE (2026-05-29); scope expanded with E1–E4 constraints
**Status:** MERGE-OK-v2 — no blocking concerns; E1–E4 fully resolved
**Target:** agent-father for implementation
**Signal:** `docs/signals/bctc-analyst-merge-20260529T042613Z.json` (update payload to v2)

---

## Partial Files Already Created (State After Killed H-1..H-8 Run)

The following files exist on disk as **untracked/uncommitted** from a prior agent-father run that was killed mid-execution. They are consistent and coherent; they do NOT yet contain the E1–E4 expansions. Agent-father must verify, extend, and commit them:

| File | State | Action |
|---|---|---|
| `.claude/agents/bctc-analyst.md` | EXISTS, untracked | Read + extend per E2 guard + E1 pass list notes; commit |
| `docs/agents/bctc-analyst/init.md` | EXISTS, untracked | Extend with E1 pass schema + E3 cache spec; commit |
| `docs/agents/bctc-analyst/flow/main.md` | EXISTS, untracked | Verify thin dispatcher — no changes needed; commit |
| `docs/agents/bctc-analyst/flow/cycle.md` | EXISTS, untracked | Extend with E2 market-hours guard; commit |
| `docs/agents/bctc-analyst/flow/stage-bootstrap.md` | EXISTS, untracked | Read; verify no changes needed; commit |
| `docs/agents/bctc-analyst/flow/stage-analyze.md` | EXISTS, untracked | Extend with E1 multi-pass invocation and E3 cache-check; commit |
| `docs/agents/bctc-analyst/flow/stage-log-notify.md` | EXISTS, untracked | Read; verify no changes needed; commit |

Files NOT yet created: `docs/agents/bctc-analyst/flow/stage-pass-*.md` (E1 — NEW), `docs/agents/bctc-analyst/flow/stage-consolidate.md` (E1 — NEW), `docs/agents/tools/package/bctc-analyst.md` (H-8), `docs/agent-memory/notebooks/bctc-analyst.md` (H-9).

---

## Problem Statement

Two agents (`financial-analyst`, `report-analyzer`) share identical infrastructure, permissions, tool packages, knowledge loads, and signal shape (business-context fields: product/customer/ops/mgmt). Their only behavioral difference is **trigger cadence**: `financial-analyst` runs twice-daily on a cron; `report-analyzer` is event-driven (earnings release). This split forces two agent definition files, two cron entries, two tool packages, two notebooks, and a signal type divergence (`bctc_signal` vs `fundamental`) that chef (`unified-agent`) must dual-accept as a reader. Merging eliminates duplicated maintenance surface and simplifies the chef reader contract.

The PO has expanded scope with four new constraints (E1–E4): multi-pass deep trick detection, off-market-hours-only scheduling, idempotency cache, and extractor binding audit.

---

## (a) Signal-Type Unification

**Recommendation: single canonical `bctc_signal` with discriminator field — DROP `fundamental` type.**

Rationale:
- Both agents post to alert-commander as `fundamental_validation`. That contract is already unified.
- The only divergence is the file-materialized signal in `docs/signals/`: `bctc_signal_*.json` (financial-analyst) vs `fundamental_*.json` (report-analyzer).
- Chef reads these signals as Layer 4 (4-pillar valuation) context. It does not branch on signal type — it reads the business-context fields (product/customer/ops/mgmt) which are identical in both schemas.
- Adding a `mode` discriminator field to the canonical `bctc_signal` shape gives chef a forward-compatible routing hint without requiring separate parser branches.

**Canonical shape for `bctc_signal`:**
```json
{
  "ticker": "FPT",
  "signal_type": "bctc_signal",
  "quarter": "Q1-2026",
  "mode": "routine | release",
  "beat_miss": "beat | miss | in-line | null",
  "net_profit_delta_pct": 18.2,
  "product": "...",
  "customer": "...",
  "ops": "...",
  "mgmt": "...",
  "trick_summary": "...",
  "trick_confidence": "high | medium | low | none",
  "trick_pass_versions": ["balance-sheet-v1", "pl-v1", "cashflow-v1", "rpt-v1", "footnote-v1"]
}
```

- `mode=routine` → twice-daily analysis cycle (former financial-analyst path)
- `mode=release` → earnings release detected (former report-analyzer path)
- `beat_miss` is required when `mode=release`; `null` when `mode=routine`
- `net_profit_delta_pct` is required when `mode=release`; omit when `mode=routine`
- `trick_summary`, `trick_confidence`, `trick_pass_versions` — added for E1; populated by `stage-consolidate.md` after all passes complete; `null` if no passes run this cycle (E3 cache-hit)

**File naming:** `docs/signals/bctc_signal_{TICKER}_{YYYYMMDD}_{mode}.json`
- Former `fundamental_*.json` naming is DEPRECATED upon migration completion.

**Chef transition:** Keep dual-accept (`bctc_signal` OR `fundamental` signal_type) ONLY during the migration window (Step H-1 through H-3 below). After H-3 archive, chef drops the `fundamental` fallback branch.

---

## (b) Mode-Switch Logic in `cycle.md`

The merged agent's single `cycle.md` must execute a **calendar gate at cycle start** before any analysis:

```
Step 0b — Mode Selection (MANDATORY, runs every invocation)
  call get_earnings_calendar()
  IF new ĐÃ NỘP releases today for watchlist tickers:
    MODE = release
    TICKERS = [list of newly-filed tickers only]
  ELSE:
    MODE = routine
    TICKERS = get_watchlist() [full watchlist]

  Set signal.mode = MODE for all signals this cycle.
```

Sequencing rule: Mode selection runs AFTER bootstrap (Step 0 regime extraction) and BEFORE BCTC fetch. A single cycle may detect BOTH new releases AND run routine analysis — in that case, process release tickers first (they are time-sensitive), then routine remainder. Each ticker's signal carries its own `mode` field.

**E2 interaction:** Mode selection still runs, but if the E2 market-hours guard fires (see section E2 below), neither release nor routine passes proceed. The guard check occurs in `cycle.md` BEFORE Step 0b.

---

## (c) Ledger Ownership

**Release-mode ONLY writes `docs/analysis-briefs/{TICKER}.md`.**

Routine-mode does NOT write ledger entries. This preserves the existing constraint from report-analyzer: ledger entries are append-only on confirmed earnings events, not on every twice-daily cycle pass.

Rule to encode in merged cycle.md:
```
IF mode == release:
  → Append docs/analysis-briefs/{TICKER}.md per analysis-ledger-template.md
  → Include QoQ/YoY comparison table + verdict sentence
  → Include trick_summary from stage-consolidate.md if passes were run
ELSE (mode == routine):
  → No ledger write. Signal bus only.
```

Ledger integrity invariant: every ledger entry MUST carry the eval pill (`BCTC-EVAL: ... = 🟢/🟡/🔴/⬜`) on the same entry line, per existing BCTC Citation Trust Protocol.

---

## (d) Cron Consolidation — REVISED per E2

**Original schedule `0 0,12 * * *` is REPLACED by `0 15,18,21,0,3 * * *`.**

VN market hours: 09:00–15:00 ICT = 02:00–08:00 UTC. All five slots in the PO-specified schedule fall outside the market window:

| UTC slot | ICT equivalent | In market window (02:00–08:00 UTC)? |
|---|---|---|
| 15:00 UTC | 22:00 ICT | No |
| 18:00 UTC | 01:00 ICT | No |
| 21:00 UTC | 04:00 ICT | No — but see E2 guard |
| 00:00 UTC | 07:00 ICT | No |
| 03:00 UTC | 10:00 ICT | YES — falls inside window |

**Correction:** 03:00 UTC = 10:00 ICT is INSIDE the 02:00–08:00 UTC market window. The E2 in-cycle guard (see E2 section) will fire and defer any pass start attempted at the 03:00 UTC slot. In practice this means the 03:00 UTC slot will regularly produce a "deferred — in market window" log with no analysis run. It is still valid to keep it in the schedule as a graceful retry entry (the guard makes it a no-op during market hours; after 08:00 UTC it would proceed). However, for clean scheduling, the recommended adjusted cron that avoids all in-window slots is:

**`0 15,18,21,0 * * *`** (four slots: 15:00, 18:00, 21:00, 00:00 UTC — all confirmed off-market).

If PO prefers the five-slot schedule including 03:00 UTC, use `0 15,18,21,0,3 * * *` — the E2 in-cycle guard will suppress it during market hours automatically. Agent-father may use either. The four-slot form is cleaner; the five-slot form adds a retry that self-suppresses.

Cron entry (in `cowork-schedule.json` or equivalent):
```json
{
  "agent": "bctc-analyst",
  "cron": "0 15,18,21,0 * * *",
  "description": "BCTC analysis — routine + earnings-release detection. Off-market-hours only (VN 02:00–08:00 UTC is market window; all slots confirmed outside). E2 in-cycle guard provides defense-in-depth."
}
```

Previous `0 0,12 * * *` is RETIRED. The 12:00 UTC slot (19:00 ICT) was off-market and is replaced by the 15:00 UTC equivalent. The 00:00 UTC slot is retained.

---

## (e) Chef Reader Contract

**No rename required. Dual-accept during transition; single-accept after archive.**

Current state: chef reads `bctc_signal_*.json` files from docs/signals/ for Layer 4 business context. Chef does NOT read `fundamental_*.json` by name pattern — it reads via `get_agent_signals(type="fundamental")` or equivalent MCP call. To unify without breaking chef mid-migration:

**Transition contract (Steps H-1 through H-3):**
- Chef accepts `signal_type == "bctc_signal" OR signal_type == "fundamental"` in its signal reader
- This is a 1-line OR condition in chef.md's GATHER step — low risk

**Post-archive contract (after Step H-3):**
- Chef drops the `fundamental` fallback. Only `bctc_signal` accepted.
- No `signal_type` rename — `bctc_signal` is the final canonical name.
- Chef may optionally read `trick_summary` and `trick_confidence` from the signal for Layer-5 qualitative context (E1 output is signal-bus-compatible by design).

Agent-father action: add the dual-accept OR clause to chef.md GATHER step before deploying the merged bctc-analyst, then remove it after archive.

---

## (f) Notebook Consolidation

**New notebook: `docs/agent-memory/notebooks/bctc-analyst.md`**

- Created fresh at migration time (agent-father writes an empty file with `# BCTC Analyst — Notebook`).
- Prior notebooks: per DELETE list below (no archive — PO directive: inline in new bctc-analyst.md c001). Last cycle content from both old notebooks is captured in the c001 bootstrap entry of the new notebook.
- Financial-analyst's last meaningful cycle (2026-05-29 00:00 UTC) is captured. Report-analyzer's last meaningful cycle was 2026-05-15 — trivially stale.

Notebook invariant (merged agent): overwrite-at-cycle-end with full cycle entry including `mode` field and E1 pass summary:
```
### Analysis Cycle (HH:MM–HH:MM UTC) — mode: routine | release
- Mode: routine | release | mixed (N routine + M release) | deferred (E2 guard)
- Stocks: N | Critical findings: [list] | Chain validations: M
- Regime: REGIME | Max Deposit Rate: X.XX% | Valuation flags: [TICKER=verdict,...]
- [if release] Earnings: K tickers processed | Beat: X | Miss: Y | In-line: Z
- [if passes run] Trick passes: balance-sheet/P&L/cashflow/RPT/footnote/segment | Consolidation: M ranked findings
- [if E3 cache-hit] Cache hits: [TICKER/Q/hash] → skip
- [if E2 guard fired] Deferred: market window active at HH:MM UTC — next slot: HH:MM UTC
```

---

## (g) Model Selection

**Per-pass model split: haiku for scan passes, sonnet for deep passes and consolidation.**

Revised from v1 (which pinned sonnet across the board). E1 introduces 6+ passes per ticker per cycle. At 5 slots/day × 30 tickers × 6 passes, haiku is the correct default for the pattern-matching scan passes (balance-sheet, RPT) where the extractor rows are structured and the task is flag detection, not qualitative synthesis. Sonnet is reserved for passes requiring deep qualitative reasoning (footnote/accounting-policy, segment-disclosure, consolidation).

Per-pass model assignment:
| Pass | Model | Rationale |
|---|---|---|
| balance-sheet trick | haiku | Structured row comparison — flag arithmetic anomalies |
| P&L trick | haiku | Revenue/cost pattern detection on structured rows |
| cashflow trick | haiku | CF-vs-NI divergence is arithmetic |
| related-party (RPT) | haiku | Volume/pricing anomaly detection on structured rows |
| footnote/accounting-policy | sonnet | Qualitative policy language — haiku misses nuance |
| segment-disclosure | sonnet | Cross-segment subsidy detection requires context |
| stage-consolidate | sonnet | Rank + synthesize across passes — synthesis task |

**Agent-level model pin:** `.claude/agents/bctc-analyst.md` sets `model: sonnet` as the agent default. Passes explicitly override per-call via the sub-flow invocation model hint if the SDK supports it; otherwise all passes run on sonnet (conservative fallback). This is a soft optimization target — correctness over cost. If the SDK does not support per-sub-flow model override, sonnet for all passes is acceptable.

---

## (h) Migration Order

**Strict sequence — do not reorder:**

| Step | Action | Owner |
|---|---|---|
| H-1 | Create/verify `.claude/agents/bctc-analyst.md` (EXISTS — verify E2 guard note in description; commit) | agent-father |
| H-2 | Create/verify `docs/agents/bctc-analyst/init.md` — extend with E1 pass schema + E3 cache spec (EXISTS — extend + commit) | agent-father |
| H-3 | Create/verify `docs/agents/bctc-analyst/flow/main.md` — thin dispatcher (EXISTS — verify no changes; commit) | agent-father |
| H-4 | Create/verify `docs/agents/bctc-analyst/flow/cycle.md` — add E2 market-hours guard before Step 0b (EXISTS — extend + commit) | agent-father |
| H-5 | Create/verify `docs/agents/bctc-analyst/flow/stage-bootstrap.md` (EXISTS — verify; commit) | agent-father |
| H-6 | Create/verify `docs/agents/bctc-analyst/flow/stage-analyze.md` — add E3 cache-check + E1 pass invocation sequence (EXISTS — extend + commit) | agent-father |
| H-7 | Create/verify `docs/agents/bctc-analyst/flow/stage-log-notify.md` (EXISTS — verify; commit) | agent-father |
| H-8 | Create `docs/agents/tools/package/bctc-analyst.md` — union of financial-analyst + report-analyzer tool packages | agent-father |
| H-9 | Create `docs/agent-memory/notebooks/bctc-analyst.md` — empty bootstrap | agent-father |
| H-10 | Create `docs/agents/bctc-analyst/flow/stage-pass-balance-sheet.md` (E1 — NEW) | agent-father |
| H-11 | Create `docs/agents/bctc-analyst/flow/stage-pass-pl.md` (E1 — NEW) | agent-father |
| H-12 | Create `docs/agents/bctc-analyst/flow/stage-pass-cashflow.md` (E1 — NEW) | agent-father |
| H-13 | Create `docs/agents/bctc-analyst/flow/stage-pass-rpt.md` (E1 — NEW) | agent-father |
| H-14 | Create `docs/agents/bctc-analyst/flow/stage-pass-footnote.md` (E1 — NEW) | agent-father |
| H-15 | Create `docs/agents/bctc-analyst/flow/stage-pass-segment.md` (E1 — NEW) | agent-father |
| H-16 | Create `docs/agents/bctc-analyst/flow/stage-consolidate.md` (E1 — NEW) | agent-father |
| H-17 | Add dual-accept OR clause to `chef.md` GATHER step (transition window begins) | agent-father |
| H-18 | Update `cowork-schedule.json`: add `bctc-analyst` at `0 15,18,21,0 * * *`, KEEP old financial-analyst and report-analyzer entries for 24h parallel run | agent-father |
| H-19 | **Flip cron**: remove old financial-analyst + report-analyzer entries from cowork-schedule.json | agent-father (after 24h parallel soak) |
| H-20 | Archive old notebooks → DELETE (per PO directive: no archive, inline in bctc-analyst c001) | agent-father |
| H-21 | Remove dual-accept from chef.md (single `bctc_signal` only) | agent-father |
| H-22 | Delete `.claude/agents/financial-analyst.md` + `.claude/agents/report-analyzer.md` | agent-father |
| H-23 | Delete `docs/agents/financial-analyst/` + `docs/agents/report-analyzer/` dirs | agent-father |
| H-24 | Delete `docs/agents/tools/package/financial-analyst.md` + `docs/agents/tools/package/report-analyzer.md` | agent-father |

**Rollback gate:** Between H-18 and H-19 (24h parallel run), if bctc-analyst emits 0 valid signals on either routine or release path → STOP, revert H-17/H-18, escalate to PO. Do NOT proceed to H-19.

---

## (E1) Multi-Pass Deep Trick Detection

### Pass List and Ordering

Six detection passes + one consolidation, each in its own `stage-pass-*.md` flow file. Ordering is fixed:

| Order | Pass | File | Model | Focus |
|---|---|---|---|---|
| 1 | Balance-sheet trick | `stage-pass-balance-sheet.md` | haiku | Cap-opex, intangibles inflation, A/R receivables stuffing, inventory provisioning, OBS guarantees |
| 2 | P&L trick | `stage-pass-pl.md` | haiku | Revenue-recognition timing, one-off gain dressing, cost reclass, segment margin inconsistency |
| 3 | Cashflow trick | `stage-pass-cashflow.md` | haiku | Operating-CF vs net-income divergence, working-capital release, interest-classification swap |
| 4 | Related-party (RPT) | `stage-pass-rpt.md` | haiku | RPT volume, pricing, intra-group lending, off-market terms |
| 5 | Footnote/accounting-policy | `stage-pass-footnote.md` | sonnet | Policy change, depreciation lives, revenue-recognition shift, discount-rate |
| 6 | Segment-disclosure | `stage-pass-segment.md` | sonnet | Cross-segment subsidies hiding weak vertical |
| 7 | Consolidation | `stage-consolidate.md` | sonnet | Merge per-pass findings → ranked tricks + confidence + final report |

**Rationale for ordering:** Passes 1–4 are arithmetic/structural and fast (haiku). Their outputs feed passes 5–6 which add qualitative context. Consolidation runs last with all six pass outputs.

### Per-Pass Output Schema

Each pass MUST emit a JSON block (written to a temp session variable, NOT to disk — no intermediate files):

```json
{
  "pass_id": "balance-sheet-v1",
  "ticker": "FPT",
  "quarter": "Q1-2026",
  "bctc_content_hash": "sha256:...",
  "findings": [
    {
      "trick_type": "cap-opex",
      "description": "Capitalized maintenance expense...",
      "confidence": "high | medium | low",
      "evidence": [
        {
          "row_index": 42,
          "code": "221",
          "label": "Tài sản cố định hữu hình",
          "value_current": 12345678,
          "page_anchor": 5,
          "note": "YoY increase 34% while revenue flat"
        }
      ],
      "severity": "high | medium | low"
    }
  ],
  "pass_clean": true | false,
  "low_confidence_rows_skipped": 3
}
```

**Evidence requirement (MANDATORY):** every finding in `evidence[]` MUST cite at minimum one of:
- `row_index` (integer — the index into the `bctc_table_rows` result set for this report_id)
- `page_anchor` (integer — page number from the extractor)
- `code` (the BCTC line-item code, e.g. "221")

A finding with zero evidence citations is INVALID and MUST be dropped before consolidation. No hallucinated tricks.

### Consolidation Algorithm (`stage-consolidate.md`)

1. Collect all six pass output JSON blocks.
2. De-duplicate: findings with identical `trick_type` across passes are merged (highest confidence wins; evidence lists combined).
3. Rank by: `severity DESC`, then `confidence DESC`, then `pass_order ASC` (earliest pass first as tiebreaker).
4. Assign final `trick_confidence` to the consolidated output:
   - `high` — at least one finding with `confidence=high` and evidence count ≥ 2
   - `medium` — findings are medium confidence or high with single evidence
   - `low` — all findings are low confidence
   - `none` — all passes returned `pass_clean=true` (no findings)
5. Emit `trick_summary` (1–2 sentence Vietnamese prose summary for signal bus).
6. Populate signal fields: `trick_summary`, `trick_confidence`, `trick_pass_versions`.

### Pass Invocation in `stage-analyze.md`

Passes run PER TICKER, in order 1→6, then consolidation. All seven pass results must be available before `stage-consolidate.md` runs. Passes are sequential (not parallel) — the haiku scan passes are fast enough that parallel dispatch would add coordination overhead for marginal gain on the single-user Mac.

```
For each TICKER:
  [E3] Check idempotency cache → if cache-hit: skip all passes, emit cached signal
  [E2] Confirm not in market window before starting passes
  Run stage-pass-balance-sheet.md → pass_1_result
  Run stage-pass-pl.md → pass_2_result
  Run stage-pass-cashflow.md → pass_3_result
  Run stage-pass-rpt.md → pass_4_result
  Run stage-pass-footnote.md → pass_5_result
  Run stage-pass-segment.md → pass_6_result
  Run stage-consolidate.md (inputs: pass_1..6_result) → trick_summary, trick_confidence
  Emit bctc_signal with trick fields populated
```

---

## (E2) Off-Market-Hours Guard

VN market window: **09:00–15:00 ICT = 02:00–08:00 UTC**.

### In-Cycle Guard (mandatory — encode in `cycle.md` BEFORE Step 0b)

```
Step E2 — Market Hours Check (FIRST STEP in cycle.md, before anything else)

now_utc = current UTC time (hour, minute)
market_window_start = 02:00 UTC
market_window_end = 08:00 UTC

IF now_utc >= market_window_start AND now_utc < market_window_end:
  LOG: "Cycle deferred — VN market window active (HH:MM UTC). Next slot: {next_scheduled_slot}"
  Append to notebook: "deferred — market window active at HH:MM UTC"
  EXIT cycle (gracefully — no error, no alert)

→ Proceed to Step 0 (bootstrap) only if guard passes
```

**Graceful in-flight completion rule:** If a pass has ALREADY STARTED (a pass JSON block is partially built in session) when the agent detects it has crossed into the market window (e.g., a long consolidation runs past 02:00 UTC), the currently-running pass MUST complete. Defer any remaining passes to the next scheduled slot. The partially-completed run is noted in the notebook with `status=partial, deferred_passes=[list]`.

**Defense-in-depth:** The cron schedule (`0 15,18,21,0 * * *`) keeps all trigger times outside the window. The in-cycle guard is the second line of defense against schedule drift or manual invocations.

---

## (E3) Idempotency Cache

### Cache Key

```
key = {ticker, quarter, bctc_content_hash}
```

Where:
- `ticker` = uppercase ticker string (e.g. "FPT")
- `quarter` = period string matching financial_reports.period_type + period_year (e.g. "Q1-2026")
- `bctc_content_hash` = SHA-256 of the concatenated `value_current` fields (in `row_order` order) from `bctc_table_rows` for this report_id + SHA-256 of the raw OCR text from `pdf_extracted_text` for the same report — both inputs, combined. This detects both value changes and OCR changes.

**Why two inputs:** A re-extraction that changes OCR text but produces the same values would still change the hash (desirable — re-run to catch new structural findings). A value change without OCR change (impossible in the current pipeline, but guarded anyway) also triggers re-run.

### Storage Location

```
data/bctc-analysis-cache/{TICKER}/{QUARTER}/{hash}.json
```

Example: `data/bctc-analysis-cache/FPT/Q1-2026/sha256_abc123.json`

The directory `data/bctc-analysis-cache/` lives inside the project root (local filesystem, not in market.db — this is agent-layer metadata, not DB data). Agent-father creates the directory structure at H-9.

### Cache Entry Schema

```json
{
  "ticker": "FPT",
  "quarter": "Q1-2026",
  "bctc_content_hash": "sha256:abc123...",
  "cached_at": "2026-05-29T15:00:00Z",
  "cycle_mode": "routine | release",
  "trick_summary": "...",
  "trick_confidence": "high | medium | low | none",
  "trick_pass_versions": ["balance-sheet-v1", "pl-v1", "cashflow-v1", "rpt-v1", "footnote-v1", "segment-v1"],
  "signal_file": "docs/signals/bctc_signal_FPT_20260529_routine.json",
  "analysis_brief_updated": false
}
```

### Cache Logic in `stage-analyze.md`

```
For each TICKER, QUARTER:
  1. Compute bctc_content_hash (SHA-256 of sorted value_current list + OCR text)
  2. Check if file exists: data/bctc-analysis-cache/{TICKER}/{QUARTER}/{hash}.json
  3a. CACHE HIT: Read cached signal fields. Re-emit signal (same content, new timestamp).
      Log: "[E3 CACHE HIT] FPT/Q1-2026/sha256:abc123 — skipping all passes"
      Skip all 6 passes + consolidation for this ticker.
  3b. CACHE MISS / HASH CHANGED: Run all 6 passes + consolidation.
      On completion: write new cache entry. If old hash file exists, delete it (one entry per quarter).
      Log: "[E3 CACHE MISS] FPT/Q1-2026 — hash changed or new. Running full pass."
```

**Cache-hit log line format (exact):**
```
[E3 CACHE HIT] {TICKER}/{QUARTER}/{hash_prefix_8chars} — {N} passes skipped — cached {HH:MM}h ago
```

**Re-run cost analysis:**
- Full 6-pass run per ticker: ~6 tool calls + consolidation call = 7 LLM calls (haiku×4, sonnet×3)
- Cache-hit fast path: 1 tool call (read cache file) + 1 signal emit = minimal
- Expected cache-hit rate in routine mode: high (BCTC data changes only when a new filing is ingested via the pull pipeline, which happens at most weekly per ticker)
- Expected cache-hit rate in release mode: always CACHE MISS (new filing by definition has a new hash)

### Final Report Regeneration

`docs/analysis-briefs/{TICKER}.md` is ONLY regenerated (appended) when:
1. `mode == release` (per section (c) constraint), AND
2. Cache miss (new filing hash) — a cache-hit on a release cycle means the filing was already processed; no duplicate ledger entry.

---

## (E4) Extractor Binding

### Fields Actually Produced by the Current Extractor

Based on the BCTC briefs (2026-05-25 BT3-DESIGN, 2026-05-26 BT3-FIX-3, 2026-05-26 BCTC-LAYOUT-FIRST):

**From `bctc_table_rows` (mcp-server `market.db`):**

| Field | Type | Produced? | Notes |
|---|---|---|---|
| `code` | TEXT (nullable) | YES | 3-digit BCTC line code; null for header rows |
| `label` | TEXT NOT NULL | YES | Vietnamese label; may be empty for code rows before BT3-FIX-3 |
| `value_current` | REAL (nullable) | YES | Current period value in VND |
| `value_prior` | REAL (nullable) | YES | Prior period value; null on some pages (BT3-FIX-3 known gap) |
| `unit` | TEXT | YES | "VND" or "billion_vnd" |
| `is_summary_row` | INTEGER | YES | 1 = summary/total row |
| `row_order` | INTEGER | YES | Monotonic within a report |
| `page_number` | INTEGER | YES | Page number in the source PDF |
| `statement_section` | TEXT | YES | "balance_sheet" | "income_statement" | "cash_flow" |
| `period_current` | TEXT | YES | e.g. "31/12/2025" |
| `period_prior` | TEXT | YES | e.g. "31/12/2024" |
| `report_id` | TEXT | YES (FK) | UUID linking to financial_reports |

**From `bctc_balance_checks` (mcp-server `market.db`):**

| Field | Produced? | Notes |
|---|---|---|
| `balance_pass` | YES | 1 = balance sheet identity passes (270 == 300 + 400) |
| `balance_delta` | YES | Numeric delta; 0 when pass |
| `report_id` | YES | FK |

**From `pdf_extracted_text` (mcp-server `market.db`):**

| Field | Produced? | Notes |
|---|---|---|
| `filename` | YES | Source PDF filename |
| `ocr_text` | YES | Raw Tesseract OCR text (flat, not structured) |
| `report_id` | YES (FK implied) | Join via financial_reports |

**From `financial_reports` (mcp-server `market.db`):**

| Field | Produced? | Notes |
|---|---|---|
| `action_code` | YES | Ticker symbol |
| `period_type` | YES | "Q1" | "Q2" | "Q3" | "Q4" | "annual" |
| `period_year` | YES | e.g. 2026 |
| `extraction_method` | YES | "text_native" | "ocr" | "tesseract" |
| `report_id` | YES | UUID PK |

**Low-confidence flags:**
- `value_current IS NULL` on a code row = low confidence (extractor could not parse)
- `value_prior IS NULL` on a code row = partially low confidence (prior column not extracted)
- `balance_pass = 0` = extraction integrity failure — the bctc-analyst MUST NOT run deep tricks on a failing balance check without flagging it

**From `bctc_layout_units` (mcp-server — BCTC-LAYOUT-FIRST sprint, if deployed):**

| Field | Produced? | Notes |
|---|---|---|
| `stitched_markdown` | YES (if LAYOUT-FIRST deployed) | Cross-page stitched markdown table |
| `quarantined` | YES | 1 = unit failed invariant gate |
| `quarantine_reason` | YES (nullable) | Reason string |

**From `bctc_page_zones` (mcp-server — BCTC-LAYOUT-FIRST sprint, if deployed):**

| Field | Produced? | Notes |
|---|---|---|
| `zones_json` | YES (if LAYOUT-FIRST deployed) | Full geometric zone JSON per page |
| `schema_inherited_from_page` | YES | Confirms continuation-page schema inheritance |

### Fields Consumed by Each Pass

| Pass | Required fields | Source table |
|---|---|---|
| Balance-sheet trick | `code`, `label`, `value_current`, `value_prior`, `row_order`, `page_number`, `statement_section="balance_sheet"`, `balance_pass`, `balance_delta` | `bctc_table_rows`, `bctc_balance_checks` |
| P&L trick | `code`, `label`, `value_current`, `value_prior`, `statement_section="income_statement"` | `bctc_table_rows` |
| Cashflow trick | `code`, `label`, `value_current`, `value_prior`, `statement_section="cash_flow"` + income_statement for NI comparison | `bctc_table_rows` (two sections) |
| RPT pass | `code`, `label`, `value_current`, `is_summary_row`, `statement_section="balance_sheet"` (RPT receivables) + raw OCR for footnote text | `bctc_table_rows`, `pdf_extracted_text` |
| Footnote/policy | Raw OCR text for the report | `pdf_extracted_text` |
| Segment-disclosure | `statement_section` rows + `stitched_markdown` (if available) | `bctc_table_rows`, `bctc_layout_units` (optional) |

### Missing Fields — Separate Dev Sprint Required

The following fields are REQUIRED by one or more passes but are NOT currently produced by the extractor pipeline:

| Required field | Needed by | Current state | Sprint needed |
|---|---|---|---|
| `confidence_score` per row | All passes (to skip low-confidence rows) | NOT produced | dev-pdf-extractor sprint: add per-row confidence field to `bctc_table_rows` based on Tesseract word confidence average for that row's OCR |
| `statement_section` populated for income_statement and cash_flow | P&L + cashflow passes | PARTIALLY — `bctc_table_rows` has the field but it may only be reliably set for `balance_sheet`; income/cashflow section detection requires verification | dev-pdf-extractor sprint: verify section detection coverage + fix if gaps |
| Footnote text linked to specific line codes | RPT + footnote passes | NOT produced — `pdf_extracted_text` has raw OCR but no code→footnote linkage | dev-pdf-extractor sprint (medium priority): add footnote-anchor linking or accept raw OCR + page_anchor as evidence |

**BLOCK RULE:** The analysis pipeline MUST NOT assume these fields exist. Until the dev sprint delivers them:
- Passes that require `confidence_score` skip rows where `value_current IS NULL OR value_prior IS NULL` as a proxy for low confidence
- Passes that require income/cashflow `statement_section` verify the field is set before running; if missing, log a WARNING and skip that pass for this ticker
- Footnote passes use raw OCR text + `page_anchor` as the evidence anchor (no code linkage)

The three missing-field gaps are flagged here as a **separate `dev-pdf-extractor` sprint** (not part of this merge). Agent-father must NOT silently assume these fields are available when implementing the pass flow files.

---

## Files to Create

| File | Action | Notes |
|---|---|---|
| `.claude/agents/bctc-analyst.md` | VERIFY/EXTEND | EXISTS — add E2 guard note to description |
| `docs/agents/bctc-analyst/init.md` | VERIFY/EXTEND | EXISTS — add E1 pass schema + E3 cache spec |
| `docs/agents/bctc-analyst/flow/main.md` | VERIFY | EXISTS — no changes needed |
| `docs/agents/bctc-analyst/flow/cycle.md` | VERIFY/EXTEND | EXISTS — add E2 market-hours guard as first step |
| `docs/agents/bctc-analyst/flow/stage-bootstrap.md` | VERIFY | EXISTS — no changes needed |
| `docs/agents/bctc-analyst/flow/stage-analyze.md` | VERIFY/EXTEND | EXISTS — add E3 cache-check + E1 pass invocation loop |
| `docs/agents/bctc-analyst/flow/stage-log-notify.md` | VERIFY | EXISTS — no changes needed |
| `docs/agents/bctc-analyst/flow/stage-pass-balance-sheet.md` | CREATE | E1 — haiku pass, balance-sheet tricks |
| `docs/agents/bctc-analyst/flow/stage-pass-pl.md` | CREATE | E1 — haiku pass, P&L tricks |
| `docs/agents/bctc-analyst/flow/stage-pass-cashflow.md` | CREATE | E1 — haiku pass, cashflow tricks |
| `docs/agents/bctc-analyst/flow/stage-pass-rpt.md` | CREATE | E1 — haiku pass, RPT tricks |
| `docs/agents/bctc-analyst/flow/stage-pass-footnote.md` | CREATE | E1 — sonnet pass, footnote/policy |
| `docs/agents/bctc-analyst/flow/stage-pass-segment.md` | CREATE | E1 — sonnet pass, segment-disclosure |
| `docs/agents/bctc-analyst/flow/stage-consolidate.md` | CREATE | E1 — sonnet consolidation |
| `docs/agents/tools/package/bctc-analyst.md` | CREATE | Union of both tool packages |
| `docs/agent-memory/notebooks/bctc-analyst.md` | CREATE | Empty bootstrap; c001 = last-cycle entries from old notebooks |
| `data/bctc-analysis-cache/` | CREATE dir | E3 — empty directory; agent-father creates with `.gitkeep` |

## Files to Modify

| File | Action | Notes |
|---|---|---|
| `docs/agents/chef.md` or relevant unified-agent chef flow | MODIFY | Add dual-accept OR clause (transition); remove after archive |
| `docs/data/cowork-schedule.json` | MODIFY | Add bctc-analyst entry at `0 15,18,21,0 * * *`; remove old entries post-soak |

## Files to Delete (no archive — PO directive)

Per PO scope expansion: DELETE LIST — no archive step. Old notebooks' last-cycle content is captured inline in `docs/agent-memory/notebooks/bctc-analyst.md` c001 entry.

| File | Action |
|---|---|
| `.claude/agents/financial-analyst.md` | DELETE |
| `.claude/agents/report-analyzer.md` | DELETE |
| `docs/agents/financial-analyst/` (full dir) | DELETE |
| `docs/agents/report-analyzer/` (full dir) | DELETE |
| `docs/agents/tools/package/financial-analyst.md` | DELETE |
| `docs/agents/tools/package/report-analyzer.md` | DELETE |
| `docs/agent-memory/notebooks/financial-analyst.md` | DELETE (last cycle inline in bctc-analyst.md c001) |
| `docs/agent-memory/notebooks/report-analyzer.md` | DELETE (last cycle inline in bctc-analyst.md c001) |

---

## Open Questions for Agent-Father

**OQ-1:** Does `docs/agents/chef.md` exist at that path, or does the unified-agent chef flow live at another path? Verify before H-17. (Likely `docs/agents/unified-agent/flow/chef.md` or similar — agent-father should find the GATHER step that reads `docs/signals/bctc_signal_*.json`.)

**OQ-2:** Does `docs/data/cowork-schedule.json` contain a `report-analyzer` entry (it was event-driven, possibly absent from the schedule file)? If absent, H-18/H-19 only touches the `financial-analyst` row.

**OQ-3:** The BCTC Citation Trust Protocol currently lives in `financial-analyst/flow/main.md`. It must be carried into `bctc-analyst/flow/main.md` verbatim with Vietnamese terms (NOT Portuguese — `BAIXA CONFIANÇA / EXTRAÇÃO VERMELHA` MUST be replaced with `ĐỘ TIN CẬY THẤP — TRÍCH XUẤT ĐỎ` per the 2026-05-28 notebook correction). Verify the existing cycle.md does NOT contain Portuguese terms.

**OQ-4 (NEW):** The three missing extractor fields (`confidence_score`, income/cashflow `statement_section` coverage, footnote-code linkage) require a separate `dev-pdf-extractor` sprint before the trick passes can operate at full capability. Agent-father must signal PM to create that sprint task after H-16. Until that sprint is complete, the pass flow files use the fallback logic defined in E4.

**OQ-5 (NEW):** The `data/bctc-analysis-cache/` directory must NOT be committed to git (contains ephemeral agent-generated data). Agent-father must add `data/bctc-analysis-cache/` to `.gitignore` when creating the directory.

---

## Sign-off

**MERGE-OK-v2.**

E1 through E4 are fully resolved and architecturally sound:

- **E1** (multi-pass): 6 passes + consolidation in ordered flow files with evidence-citation requirement and zero-hallucination enforcement. Per-pass output schema is defined. Consolidation algorithm is deterministic (rank by severity + confidence + pass_order). No blocking concerns.

- **E2** (off-market-hours): Guard is a simple UTC time check at the top of `cycle.md`. Cron revised to `0 15,18,21,0 * * *`. The 03:00 UTC slot from the PO proposal is excluded from the base cron (inside window) — the defense-in-depth guard handles any manual invocations. No blocking concerns.

- **E3** (idempotency cache): Key is deterministic and content-based. Storage location is local filesystem (not DB — correct: this is agent-layer metadata). Schema is complete. Cache-hit log format specified. Re-run cost analysis documented. `.gitignore` entry required (OQ-5). No blocking concerns.

- **E4** (extractor binding): Fields consumed by each pass are listed against ACTUAL produced fields from the three relevant briefs (BT3-DESIGN, BT3-FIX-3, LAYOUT-FIRST). Three missing fields identified and flagged as a separate dev sprint — NOT silently assumed. Fallback logic specified for each. No blocking concerns.

The 24h parallel-run gate (H-18→H-19) is the critical safety window; do not compress it. The partial H-1..H-7 files from the killed agent-father run are consistent and usable; agent-father must verify, extend per E1–E4, and commit them.

**Authored by:** agents-architect
**Timestamp:** 2026-05-29T04:37:46Z
**Handoff to:** agent-father (implement) via updated signal `bctc-analyst-merge-20260529T042613Z.json`
