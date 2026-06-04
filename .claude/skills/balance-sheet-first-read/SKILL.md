---
name: balance-sheet-first-read
description: >
  Balance-sheet-first read (Trung T-2). Computes asset_coverage, pb_ratio,
  intangible_premium, charter_capital_ratio, balance_flags before any income-statement
  analysis. Invoke immediately after rapid-market-cap-screen PASS; before deep BCTC
  extraction. Enhances TNB Layer 4 Pillar 3.
---

## Balance-Sheet-First Read (SKILL-2)

**Source technique:** T-2 (Trung)
**Cap:** 120L | **Ref brief:** docs/architecture-briefs/2026-06-04-expert-rapid-analysis-skills.md § SKILL-2

### Step 1 — Fetch balance sheet

```
call_tool(server="vn-market", tool="get_bctc_full", arguments={"code": "<ticker>"})
```

Extract from latest period: `total_assets`, `total_liabilities`, `equity` (vốn chủ sở hữu),
`charter_capital` (vốn điều lệ), `receivables`, `investment_property`.
Also pull `market_cap_billion` from rapid-market-cap-screen output (no extra call needed).

### Step 2 — Asset coverage ratio (T-2 step 1)

```
asset_coverage = total_assets / market_cap
```

- `> 1.0` → assets exceed market price → **MARGIN-OF-SAFETY signal** (Trung: "tiềm ẩn tài sản lớn hơn giá thị trường")
- `< 0.5` → company priced at steep premium to assets → heavy intangible/growth premium

Vĩnh Hoàng example: total_assets 13,000B / market_cap 12,000B = 1.08 → asset coverage present.

### Step 3 — P/B ratio (T-2 step 2)

```
pb_ratio = market_cap / equity
```

- `< 1.0` → deep value (trading below book)
- `1–3×` → normal range for most VN sectors
- `> 5×` → intangible premium; requires qualitative justification
- Vinrup counter-example: 14× book → investor must justify 13× premium from governance/growth alone

### Step 4 — Intangible premium (T-2 step 3)

```
intangible_premium_billion = market_cap - equity
```

Label this "governance + growth premium." Name it explicitly in output — it quantifies what the investor is paying for qualitative factors.

### Step 5 — Charter capital durability (T-2 step 5)

```
charter_capital_ratio = charter_capital / total_equity
```

- `> 0.5` → significant retained earnings → long track record of profitable accumulation → **corporate durability signal**
- `< 0.2` → equity mostly retained earnings; check if recent share issuance inflated charter

### Step 6 — Balance flags

Check each condition; add flag string to `balance_flags[]` if triggered:

```
RECEIVABLES-BLOAT   if receivables > 30% of total_assets
                    → cash-conversion risk; may inflate revenue optics

INV-PROPERTY-STALE  if investment_property recorded at > 5-year-old book value
                    → possible hidden asset OR write-down risk; verify current appraisal

CASH-PARKED         if cash_and_equivalents / total_assets > 40%
                    → capital not deployed productively

NO-EQUITY           if equity < 0
                    → insolvent on book basis; STOP — do not proceed further
```

### Step 7 — Output

```json
{
  "ticker": "<ticker>",
  "asset_coverage": <number>,
  "pb_ratio": <number>,
  "intangible_premium_billion": <number>,
  "charter_capital_ratio": <number>,
  "balance_flags": ["<flag>", ...],
  "balance_verdict": "STRONG | ACCEPTABLE | WEAK | INSOLVENT"
}
```

Verdict rules:
- `INSOLVENT` if NO-EQUITY flag present
- `STRONG` if asset_coverage > 1.0 AND pb_ratio < 3 AND balance_flags empty
- `WEAK` if pb_ratio > 8 OR ≥2 flags present
- `ACCEPTABLE` otherwise

### Usage in flow files

```
Step 2a: balance-sheet-first-read
  skill: .claude/skills/balance-sheet-first-read/SKILL.md
  input: ticker, market_cap_billion (from SKILL-1)
  on INSOLVENT → SKIP; log reason; drop ticker
  pass asset_coverage, pb_ratio, balance_verdict → four-factor-synthesis (Factor F input)
```
