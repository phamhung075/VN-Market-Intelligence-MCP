---
name: rapid-market-cap-screen
description: >
  Market-cap-first entry gate (Trung T-1/T-3). Size filter + valuation band vs. own
  10-year history. Runs BEFORE any other analysis on a ticker. Outputs PASS or SKIP
  with reason. Invoke when: first contact with any ticker, before balance-sheet-first-read.
---

## Rapid Market-Cap Screen (SKILL-1)

**Source technique:** T-1 (Trung) + T-3 (Trung + Thành)
**Cap:** 120L | **Ref brief:** docs/architecture-briefs/2026-06-04-expert-rapid-analysis-skills.md § SKILL-1

### Step 1 — Fetch market cap

```
call_tool(server="vn-market", tool="get_market_cap", arguments={"code": "<ticker>"})
```

Extract: `market_cap_billion` (VND billions). Also available: `shares_outstanding`.

### Step 2 — Size gate (T-1)

**Default floor: 500 billion VND** (operator-configurable; open question for PO — see brief §7 Q1).

```
IF market_cap_billion < 500:
  → verdict = SKIP
  → skip_reason = "SKIP-MICRO: market cap {X}B < 500B floor; entry/exit distorts price"
  → EXIT (do not proceed to Step 3)
```

Rationale: Trung's rule — if fund size is significant, micro-caps cannot be traded at scale without self-distorting ("chơi với mình", "lũng loạn giá").

### Step 3 — Fetch valuation history

```
call_tool(server="vn-market", tool="get_bctc_full", arguments={"code": "<ticker>", "years": 10})
```

Extract: annual P/E and P/B for each year available (up to 10 years). Compute:
- `pe_median_10y` — median of all available annual P/E values
- `pb_median_10y` — median of all available annual P/B values
- `pe_current`, `pb_current` — most recent period

### Step 4 — Classify valuation band (T-3)

Compare current vs. own 10-year median. Do NOT compare vs. sector peers (sector = secondary).

```
pe_ratio = pe_current / pe_median_10y   # ratio vs. own history
pb_ratio = pb_current / pb_median_10y

pe_band:
  < 0.8  → CHEAP
  0.8–1.2 → FAIR
  > 1.2  → EXPENSIVE

pb_band: same thresholds applied to pb_ratio
```

Thành rule: prefer companies NOT already run up — EXPENSIVE band requires strong qualitative justification.

### Step 5 — Output

```json
{
  "ticker": "<ticker>",
  "rapid_screen_verdict": "PASS | SKIP",
  "skip_reason": "<string or null>",
  "market_cap_billion": <number>,
  "pe_current": <number>,
  "pe_median_10y": <number>,
  "pe_band": "CHEAP | FAIR | EXPENSIVE",
  "pb_current": <number>,
  "pb_median_10y": <number>,
  "pb_band": "CHEAP | FAIR | EXPENSIVE"
}
```

PASS if: size gate passes AND at least one of pe_band or pb_band is CHEAP or FAIR.
SKIP with reason "SKIP-EXPENSIVE" if: size gate passes but both bands are EXPENSIVE.

### Usage in flow files

```
Step 0b: rapid-market-cap-screen
  skill: .claude/skills/rapid-market-cap-screen/SKILL.md
  input: ticker
  on SKIP → log skip_reason; drop ticker from cycle; continue to next ticker
  on PASS → proceed to balance-sheet-first-read + ownership-governance-screen (parallel)
```
