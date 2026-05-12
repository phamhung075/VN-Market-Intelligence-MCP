# Spec 1889a — Financial Analyst Flow Edit: Layer 7 + Layer 8 Wiring

**Sprint:** 1889
**Task-Id:** 1889a
**Status:** SPEC
**Author:** BA agent 2026-05-12
**Closes:** TNB c39 findings #1 (Step G fail) + #2 (Step H fail)
**Methodology ref:** `docs/standards/tnb-methodology.md` §Layer-7, §Layer-8

---

## 1. Objective

Wire 3 already-merged MCP tools into the financial-analyst analysis flow so every FAIR/CHEAP/EXPENSIVE verdict satisfies TNB methodology Steps G and H.

| Tool | Merged | Provides |
|---|---|---|
| `get_cash_flow(ticker, quarters)` | 1878a / `1fb5282b` | OCF per quarter from `financial_reports.operating_cash_flow` |
| `get_investment_clock_phase()` | 1880a / `b6aca505` | {Recovery, Overheat, Stagflation, Reflation, insufficient_data} |
| `get_pyramid_tier(asset_class)` | 1880b / `cb232b26` | {cash, bonds, equity, alt, speculative} |

Gap: flow file currently produces a valuation verdict (CHEAP/FAIR/EXPENSIVE/AVOID) without calling any of these tools — TNB Step G = fail, Step H = fail every cycle.

---

## 2. Scope decision — file to edit

**Investigation result:**

- `docs/standards/tnb-methodology.md` §Layer-5 audit tree: Steps G + H are defined there. SSOT = methodology file, no edit needed to it.
- Agent definition: `.claude/agents/financial-analyst.md` — metadata + knowledge refs only. Flow pointer: `.claude/flows/financial-analyst/cycle.md`.
- **Verdict logic lives in** `.claude/flows/financial-analyst/cycle.md` — Step 2 (EY spread → CHEAP/FAIR/EXPENSIVE/AVOID) and Step 4 (signal emit).

**Single file to edit: `.claude/flows/financial-analyst/cycle.md`**

No change to agent definition file. No new methodology doc needed (SSOT already in `tnb-methodology.md`).

---

## 3. Insertion points (line-anchored to current cycle.md)

### Step G — Layer 7 Forensic NI vs OCF (insert after G-Bond check, before Step 3)

**Anchor — insert after line:**
```
- If G-Bond yield not available → log data gap in session log, skip check
```

**New block:**

```
**2c. Layer 7 — Forensic NI vs OCF** (tnb-methodology.md §Layer-7)
`get_cash_flow(ticker, quarters=8)` → OCF array per quarter

IF tool returns empty / no data:
  → log: "Layer 7: no cash flow data for {ticker} — Layer 7 skipped"
  → continue (non-fatal)

IF data returned — compute per quarter: `accrual = NI - OCF`
  divergence_flag = |OCF - NI| / |NI| > 0.30 AND OCF < NI for ≥2 consecutive quarters
  IF divergence_flag:
    → append to verdict: "earnings quality WARN: NI>OCF divergence ≥2 consecutive qtrs"
  ELSE:
    → append to verdict: "Layer 7: no persistent accrual divergence detected"
Log line: "Layer 7: {ticker} accrual check done — flag={divergence_flag}"
```

---

### Step H — Layer 8 Cycle phase + Pyramid tier (insert before Step 4 signal emit)

**Anchor — insert before:**
```
**4. Chain validation**
```

**New block:**

```
**3b. Layer 8 — Investment Clock + Pyramid tier** (tnb-methodology.md §Layer-8)
`get_investment_clock_phase()` → phase
`get_pyramid_tier("equity")` → tier  (financial-analyst = equity analysis always)

IF phase == "insufficient_data": phase_display = "insufficient_data" (no crash — continue)

Render header (prepend to verdict output and to signal finding_data):
  "📍 Cycle: {phase} | Tier: {tier}"

Log line: "Layer 8: phase={phase} tier={tier}"
```

---

## 4. Signal schema update (Step 4)

`finding_data` in `post_agent_signal` must carry two new fields to pass Layer 8 audit:

```json
{
  "finding_data": {
    "ey_spread": 0.028,
    "valuation_verdict": "<CHEAP|FAIR|EXPENSIVE|AVOID>",
    "regime": "<TIGHTENING|EASING|NEUTRAL>",
    "rate_sensitive_headwind": false,
    "gbond_regime_signal": false,
    "cycle_phase": "<phase|insufficient_data>",
    "pyramid_tier": "equity",
    "earnings_quality_warn": false
  }
}
```

---

## 5. Acceptance Criteria

**AC-1:** Flow file diff shows 3 new tool invocations: `get_cash_flow` in Step 2c, `get_investment_clock_phase` + `get_pyramid_tier` in Step 3b.

**AC-2:** Verdict output includes `earnings quality WARN` conditional line when `|OCF-NI|/|NI| > 0.30` AND `OCF < NI` for ≥2 consecutive quarters; otherwise prints `Layer 7: no persistent accrual divergence detected`.

**AC-3:** Verdict header line `📍 Cycle: {phase} | Tier: {tier}` is present above the CHEAP/FAIR/EXPENSIVE/AVOID line in every cycle output.

**AC-4:** When `get_investment_clock_phase()` returns `insufficient_data`, header renders `📍 Cycle: insufficient_data | Tier: equity` — no exception, no skip.

**AC-5:** When `get_cash_flow()` returns empty array, Step 2c logs `"Layer 7: no cash flow data for {ticker} — Layer 7 skipped"` and continues without error. Verdict proceeds normally.

**AC-6:** Added steps use caveman/ULTRA shorthand (imperative single-line commands, no prose padding). Token delta vs current cycle.md: ≤ +60 lines.

**AC-7:** Flow file header or knowledge block references `docs/standards/tnb-methodology.md §Layer-7` and `§Layer-8` so the agent loads the SSOT on demand. No inline methodology restatement beyond the trigger rule.

**AC-8:** Auto-cure verification window c42–c44: `docs/agent-memory/notebooks/financial-analyst.md` must show `Layer 7:` and `📍 Cycle:` text present in ≥1 verdict per cycle across all 3 cycles. If financial-analyst is inactive in c42, extend window to c42–c48 (6 cycles).

---

## 6. TDD Strategy

**T1 — Manual verification (primary):**
Inspect `docs/agent-memory/notebooks/financial-analyst.md` after each of cycles c42, c43, c44.
Pass criteria: both `Layer 7:` and `📍 Cycle:` strings appear ≥1 time per cycle.
Verification window: c42–c44 (extend to c48 if agent inactive in c42).

**T2 — Signal schema check (optional, manual):**
After one cycle fires, query signal bus: `get_open_chain_findings()` — confirm `cycle_phase` and `earnings_quality_warn` keys present in `finding_data` payload.

**T3 — OCF-empty branch (manual):**
Test with a ticker known to have no BCTC data (e.g. OTC stock not in store) — confirm notebook shows `Layer 7 skipped` line, no exception.

**T4 — `insufficient_data` branch (manual):**
Temporarily stub `get_investment_clock_phase()` response = `insufficient_data` via a cycle where PMI/CPI data is stale — confirm header still renders.

**T5 — Divergence flag arithmetic (manual):**
Pick a ticker with known high accruals (e.g. real-estate developer with large receivables). Verify `earnings quality WARN` appears in that cycle's notebook entry.

All 5 tests = manual verification only. No automated test files required — flow edits are doc-only. Structured-output assertion tests deferred to QA sprint if TNB audit finds ≥2 misses in c42–c48.

---

## 7. File List

| File | Action |
|---|---|
| `.claude/flows/financial-analyst/cycle.md` | EDIT — insert Step 2c (Layer 7) + Step 3b (Layer 8) + update Step 4 schema |
| `docs/specs/1889a-financial-analyst-flow-edit.md` | CREATE (this file) |

No other files touched.

---

## 8. Risks and Unknowns

**R1 — Methodology doc present:** `docs/standards/tnb-methodology.md` confirmed exists with §Layer-7 and §Layer-8 defined. AC-7 can reference it directly. No inline brief needed.

**R2 — Financial-analyst inactive in c42:** If no cycle fires in c42, extend auto-cure window to c48. PM documents this in TASKS.md when spawning the dev task.

**R3 — Token bloat:** 3 new tool calls per stock per cycle. Mitigation: Step 2c is skipped entirely (non-fatal early exit) when `get_cash_flow()` returns empty — largest cost risk (watchlist = 30 tickers) is bounded by BCTC coverage (~60–70% of watchlist has OCF data). Expected overhead: 2 extra MCP calls per stock with BCTC data + 2 global calls (clock + tier) per cycle. Acceptable.

**R4 — `get_pyramid_tier("equity")` return value:** Tool always called with `"equity"` since financial-analyst scope = equities only. If tool returns an unexpected tier value, log it but do not block verdict. Non-fatal.

---

## 9. Dependencies

| Task | Status |
|---|---|
| 1878a — `operating_cash_flow` column + `get_cash_flow` tool | DONE (merged `1fb5282b` 2026-05-12) |
| 1880a — `get_investment_clock_phase()` tool | DONE (merged `b6aca505` 2026-05-12) |
| 1880b — `get_pyramid_tier(asset_class)` tool | DONE (merged `cb232b26` 2026-05-12) |

No blockers. All infra merged. This task is a flow-doc edit only.

---

## 10. Blockers for PO

None. All infra ready. No PO decision required before dev starts.

---

## 11. DDD Layer Mapping

| Requirement | DDD Layer |
|---|---|
| `get_cash_flow()` call + accrual computation | Application (orchestration of domain data) |
| OCF divergence rule (|OCF-NI|/|NI| > 0.30, ≥2 qtrs) | Domain (earnings-quality business rule) |
| `get_investment_clock_phase()` call | Application (macro classifier invocation) |
| `get_pyramid_tier("equity")` call | Application (asset classification invocation) |
| Verdict header `📍 Cycle: ... | Tier: ...` | Interface (agent output rendering) |
| Signal `finding_data` schema extension | Interface (signal bus contract) |
| Empty-OCF skip + log | Application (guard clause) |

---

## 12. Hand-off

PM spawns **agent-md-editor** (or developer if agent-md-editor unavailable) with:
- Edit target: `.claude/flows/financial-analyst/cycle.md`
- Insertion anchors: §3 of this spec (exact line anchors provided)
- AC list: §5 (8 ACs)
- Verification window: c42–c44 (extend to c48 if needed)

---

## Out of Scope

- No new MCP tools
- No schema migrations
- No changes to PDF parsing, BCTC ingestion, or methodology docs
- No changes to `.claude/agents/financial-analyst.md` agent definition file
