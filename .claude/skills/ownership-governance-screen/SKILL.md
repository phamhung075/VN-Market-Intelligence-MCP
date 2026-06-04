---
name: ownership-governance-screen
description: >
  Ownership structure, insider transaction, turnover ratio, back-door listing, and
  compensation extraction screen (T-6, T-8, T-9, T-10, T-14). Run in parallel with
  balance-sheet-first-read after rapid-market-cap-screen PASS. Feeds governance
  Factor G of four-factor-synthesis. Invoke also when news-scout detects insider filings.
---

## Ownership Governance Screen (SKILL-4)

**Source techniques:** T-6 (Trung), T-8 (Thành), T-9 (Thành), T-10 (Trung/Báu), T-14 (Thành)
**Cap:** 120L | **Ref brief:** docs/architecture-briefs/2026-06-04-expert-rapid-analysis-skills.md § SKILL-4

### Step 1 — Ownership structure (T-6)

```
call_tool(server="vn-market", tool="get_company_profile", arguments={"code": "<ticker>"})
```

Extract top shareholders list (`shareholders[]`) and officers list (`officers[]`). Apply flags:
Note: `foreign_holding_ratio` may be null (FU-PROFILE-DATA-VERIFY pending — use FOREIGN-CW-ABSENT flag from shareholders[] instead).

```
OWNERLESS         if no single shareholder ≥ 20% AND top holders are all fragmented individuals
SKIN-GAME-WEAK    if founder/controlling-shareholder stake < 20%
                  (or all founders exited to < 5% with nominees holding rest → DANGER)
FOREIGN-CW-ABSENT if no institutional foreign holder ≥ 5% (threshold open per brief §7 Q2)
                  verify "foreign" is genuine equity stake, NOT a repo/collateral arrangement
FREE-FLOAT-LOW    if free float < 15%
```

Legal-trouble magnitude rule: impact ∝ founder's ownership stake. Hired-management trouble (SOE chairmen rotating) = limited; founder/controlling-shareholder arrested (DGC, BC1) = severe.

### Step 2 — Insider transaction check (T-8)

Fetch last 6 months of disclosed insider trades (from get_company_profile officers[] or insider-disclosure data):

```
HIGH-FREQUENCY    if > 3 insider buy/sell events in any single quarter
                  → management has no long-term conviction; timing own stock

INSIDER-EXIT      if net insider sell > 5% of their declared holdings in any 3-month window
                  → insiders know something negative is coming
                  → CRITICAL: if news-scout detected an insider filing → trigger WORK alert immediately
```

Trung: high-frequency insider trading = owner treats own stock as trading vehicle, not long-term holding.

### Step 3 — Turnover ratio check (T-9)

```
daily_turnover_ratio = avg_daily_value_traded_30d / market_cap
ABNORMAL-TURNOVER if daily_turnover_ratio > 1%  (FLC Faros precedent: ~100% = catastrophic)
```

### Step 4 — Back-door listing pattern (T-10)

From get_bctc_full (year-over-year assets) and company history:

```
BACKDOOR-SUSPECTED  if YoY total_assets growth > 200% WITH concurrent full leadership change
                    → tiny shell company inflated to list unlistable entity (NRC/Danh Khôi pattern)
                    → cross-check: 10-year financial history chart shows erratic/lumpy pattern

NO-BANK-TRUST       if zero long-term bank debt on a capital-intensive company
                    → banks refused to lend → banks know structural risk you don't
                    → Báu: "ngân hàng cũng khôn lắm"
                    → bank debt PRESENCE is a quality signal (passed credit committee underwriting)
```

### Step 5 — Management compensation extraction (T-14)

From BCTC statements: extract `reward_fund` (quỹ khen thưởng) and `lntt` (pre-tax profit):

```
COMP-EXTRACTION   if reward_fund / lntt > 25%
                  → management extracting > 25% of pre-tax profit as bonuses
                  → example: 1,000B profit → 200-300B bonuses = minority-shareholder value destruction
```

### Output

```json
{
  "ticker": "<ticker>",
  "red_flags": ["<flag>", ...],
  "governance_score": "GREEN | YELLOW | RED",
  "flag_details": {
    "OWNERLESS": false,
    "SKIN-GAME-WEAK": false,
    "FOREIGN-CW-ABSENT": false,
    "FREE-FLOAT-LOW": false,
    "HIGH-FREQUENCY": false,
    "INSIDER-EXIT": false,
    "ABNORMAL-TURNOVER": false,
    "BACKDOOR-SUSPECTED": false,
    "NO-BANK-TRUST": false,
    "COMP-EXTRACTION": false
  }
}
```

Governance score rules:
- `RED` if any of: OWNERLESS, BACKDOOR-SUSPECTED, INSIDER-EXIT, COMP-EXTRACTION present
- `YELLOW` if any of: SKIN-GAME-WEAK, FOREIGN-CW-ABSENT, HIGH-FREQUENCY, ABNORMAL-TURNOVER, NO-BANK-TRUST
- `GREEN` if zero flags

### Usage in flow files

```
Run in parallel with balance-sheet-first-read (no dependency between them).
Pass governance_score + red_flags → four-factor-synthesis Factor G.
On INSIDER-EXIT flag:
  → send_telegram(channel="work", message="INSIDER-EXIT: <ticker> net-sell >5% in 3m window")
  → log in notebook
```
