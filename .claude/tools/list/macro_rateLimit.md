# get_rate_limit_status

**Module:** `interface/mcp/tools/macro/rateLimitTools.ts`

**Category:** Macro (System)

## Overview

Exposes the current rate-limit state of all tracked external API sources. Useful for debugging and monitoring during the intelligence cycle. Returns a table of hosts, last call time, cooldown remaining, and ready status.

## Tool Signature

```typescript
get_rate_limit_status() → string
```

## Input Parameters

None.

## Output Format

Plain text table (Vietnamese labels):

```
Trang thai gioi han API

Host                    | Cuoi cung     | Cho    | Trang thai
cafef.vn                | 15 giay truoc | 0s     | San sang
api-finfo.vndirect.com  | 2 giay truoc  | 3s     | Cho
tradingeconomics.com    | 45 giay truoc | 0s     | San sang
sbv.org.vn              | 1 phut truoc  | 0s     | San sang
...

Tong: 12 nguon | San sang: 10 | Dang cho: 2
```

## Columns

| Column | Meaning | Example |
|--------|---------|---------|
| Host | Domain or API endpoint | `api-finfo.vndirect.com` |
| Cuoi cung (Last) | When last called | "15 giay truoc" (15 seconds ago), "2 phut truoc" (2 minutes ago) |
| Cho (Wait) | Remaining cooldown | "0s" (ready), "3s" (wait 3 more seconds) |
| Trang thai (Status) | Ready/Waiting/Never called | "San sang" (ready), "Cho" (waiting), "Chua goi" (never called) |

## Data Source

- **Tracking:** globalRateLimiter singleton
- **State:** Per-host last call timestamp + configured interval
- **Scope:** All tracked external APIs in DEFAULT_INTERVALS

## Key Characteristics

- **Real-time state:** Shows current cooldown status as of call time
- **Vietnamese labels:** All text formatted for Vietnamese-language readability
- **All known hosts:** Includes both called hosts (with timestamps) and never-called hosts (status "Chua goi")
- **No external calls:** Pure read of in-memory rate limiter state
- **Column alignment:** Fixed-width formatting for readability

## Usage Examples

```
Developer → get_rate_limit_status()
Shows current rate limit state across all external APIs

Scheduler → Called before fetching from external source
Returns wait time if cooldown not satisfied (0 if ready)

Monitor → Shows which APIs are throttled
Helps diagnose slow cycles (e.g., waiting on cafef.vn)
```

## Status Values

| Status | Meaning | Implication |
|--------|---------|-------------|
| San sang | Ready to call | No wait needed; fetch immediately |
| Cho | Cooldown active | Wait N seconds before next call |
| Chua goi | Never called | Ready immediately (first call) |

## Typical Cooldowns (DEFAULT_INTERVALS)

| Host | Interval | Purpose |
|------|----------|---------|
| cafef.vn | 60s | VN stock news |
| api-finfo.vndirect.com | 120s | VN financial data |
| sbv.org.vn | 300s | SBV rates / macro |
| tradingeconomics.com | 300s | Global macro data |
| fed.org | 600s | US Fed data (FRED) |

## Error Handling

- Returns text table (never throws)
- If globalRateLimiter not initialized: returns "Rate limiter not initialized"
- Graceful fallback: shows "status unknown" for any host with missing state

## Integration Notes

- Called by: Developers, Ops agents, Scheduler monitoring
- Used to diagnose slow cycles (bottleneck detection)
- Pre-fetch check: verify cooldown before calling external APIs
- Not called directly by analysis agents (transparent to callers)

---

**Added:** Task 207 (Rate Limit Status MCP Tool)
**Status:** STABLE
