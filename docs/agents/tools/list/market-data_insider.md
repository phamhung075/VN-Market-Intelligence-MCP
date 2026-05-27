# get_insider_transactions & get_insider_signals

**Module:** `interface/mcp/tools/market-data/insiderTools.ts`

**Category:** Market Data

## Overview

Returns insider transaction history from SSC disclosures with on-the-fly streak computation for accumulation patterns. Read path only — write path handled by insiderCheckJob (Task 1143).

Two related tools:
- `get_insider_transactions` — raw transaction history
- `get_insider_signals` — computed accumulation streaks and signals

## Tool Signatures

```typescript
get_insider_transactions(code: string, days?: number, type?: "buy" | "sell" | "all") → string

get_insider_signals(code: string, days?: number) → string
```

## Input Parameters

### get_insider_transactions

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `code` | string | yes | — | Stock ticker code (e.g., "VCB", "SAB") |
| `days` | number | no | 90 | Number of days to look back (1–365) |
| `type` | string | no | "all" | Filter by transaction type: "buy", "sell", or "all" |

### get_insider_signals

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `code` | string | yes | — | Stock ticker code |
| `days` | number | no | 90 | Number of days to look back (1–365) |

## Output Format

### get_insider_transactions

Plain text table with columns:

```
Insider Transactions — [CODE] (last N days)

Date       | Officer Name | Position     | Type | Shares    | Price
2024-05-15 | Nguyen ABC   | CEO          | BUY  | 50,000    | 85,000 VND
2024-05-14 | Tran XYZ     | Director     | SELL | 100,000   | 84,500 VND
...
```

### get_insider_signals

Structured list of accumulation streaks detected:

```
Insider Accumulation Signals — [CODE]

[insider_accumulation]
  Code: VCB
  Position: CEO
  Consecutive buy days: 5
  Total volume: 500,000 shares
  First buy: 2024-04-01
  Latest buy: 2024-05-15
  Signal: insider_accumulation
```

## Streak Computation Logic

A streak is defined as:
- >= 2 distinct `from_date` values where `type='buy'` and `executedVolume > 0`
- Grouped by `code` + normalized position (case-insensitive, trimmed)

**Threshold:** If >= 2 buy days (distinct dates), a streak is flagged with:
- Total volume executed across all buy transactions in streak
- First and latest buy dates
- Signal type: `insider_accumulation`

## Data Source

- **Table:** `insider_transactions`
- **Schema fields:** code, from_date, officer_name, position, type (buy/sell), executedVolume, price
- **Source:** SSC (State Securities Commission) disclosures
- **Timing:** Updated daily via insider check job (Task 1143)

## Key Characteristics

- **Read path only:** This tool reads and formats; writes handled by insiderCheckJob
- **Streak computed on-the-fly:** No pre-computed streak table; computed during read
- **Position normalization:** Positions compared case-insensitive and trimmed
- **Executed volume only:** Pending/planned transactions excluded
- **Date filtering:** All rows filtered by from_date >= (today - days)

## Streak Examples

| Scenario | Streak? | Reasoning |
|----------|---------|-----------|
| 2 buy days, 100k total | YES | >= 2 distinct dates, all executed |
| 1 buy day, 500k volume | NO | Only 1 distinct date |
| 3 buy + 2 sell days | YES | 3 buy days qualify (sell ignored) |
| 2 buy days, 0 executed | NO | Both have executedVolume=0 |

## Usage Examples

```
Financial Analyst → get_insider_transactions(code="VCB", days=90, type="buy")
Returns last 90 days of insider buy transactions for VCB

Market Watcher → get_insider_signals(code="SAB", days=60)
Returns accumulation streaks detected in SAB over last 60 days

Alert Commander → get_insider_transactions(code="FPT")
Returns all insider transactions (buy+sell) for FPT (default 90 days)
```

## Error Handling

- Returns "No transactions found for [CODE]" if code not in database
- Returns empty streak list if no streaks detected
- Returns error message if DB query fails
- Always returns text response (never throws)
- No data section shows gracefully (e.g., "No insider buying detected")

## Integration Notes

- Called by: Market Watcher, Financial Analyst, Alert Commander, Digest & Predict
- Complements `get_foreign_flow` (institutional buying/selling)
- Often triggers alerts when 3+ consecutive buy days detected
- Input to "verified chain" synthesis (insider buying confirms technical setup)
- Used to detect insider confidence in fundamental value

## Related Jobs

- **insiderCheckJob** (Task 1143) — fetches SSC disclosures, populates DB
- **Frequency:** Daily (post-market, ~17:00 VN time)
- **Data freshness:** Latest transactions available same day

---

**Added:** Task 1146 (get_insider_transactions MCP Tool, Sprint 063)
**Status:** STABLE
