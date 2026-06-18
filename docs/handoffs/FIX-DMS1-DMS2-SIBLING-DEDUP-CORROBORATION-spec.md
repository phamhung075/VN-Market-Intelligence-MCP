# Fix Spec — DMS-1 + DMS-2 (Roots B & C)

**Handoff to:** dev-mcp-server
**Sprint row:** `DMS-DOUBLEFIRE-SIBLING-DEDUP-CORROBORATION` (backlog → promote to ready when `ARCH-CRON-SCHEDULER-RELIABILITY` clears the `apps/mcp-server/` zone)
**Architecture brief:** `docs/architecture-briefs/2026-06-16-gatherer-doublefire-dedup-cluster.md` §Primitive-2 and §Primitive-3
**Root A status:** DONE (commit `69babf46` — leader-lock.md AF-1 backstop-window defer gate)
**Produced by:** agent-father, 2026-06-18
**Zone collision hold:** `apps/mcp-server/` is locked by `ARCH-CRON-SCHEDULER-RELIABILITY` (in_progress). Do NOT open a concurrent coding lane. Promote this task the moment that sprint reaches review/done.

---

## DMS-1 — Root B: Cross-Sibling Signal Visibility Window (news-scout)

### Problem

`SELF_SIGNALS_CACHE` is loaded at Stage 0c in `docs/agents/news-scout/flow/stage-bootstrap.md` with:

```
SELF_SIGNALS_CACHE = call_tool(server="vn-market", tool="get_agent_signals", arguments={
  "from_agent": "news-scout",
  "status": "all",
  "hours_back": 6
})
```

The `from_agent="news-scout"` filter returns only signals committed by THIS session's news-scout. A concurrent sibling news-scout session (fired by the cloud backstop ~5 min after the manual dispatcher) initialises the same cache empty (its own just-committed signals are not yet in any shared state the sibling can see via `from_agent="news-scout"` at the time of its 0c call — the FIRST session's signals ARE in the DB by then but only if the second session runs 0c AFTER the first session's `post_agent_signal` calls complete, which is not guaranteed under double-fire).

The root cause: the cache query is scoped to `from_agent="news-scout"` — effectively per-session — making it blind to a concurrent sibling that fired within the same backstop window.

### Fix

**File:** `docs/agents/news-scout/flow/stage-bootstrap.md` — Step 0c block.

Replace the single `get_agent_signals(from_agent="news-scout")` call with a two-step load:

```
# Step 0c — Load self-signal cache + sibling-window dedup cache

# 1. Self-history (existing): last 6 hours of own signals for feedback tuning
SELF_SIGNALS_CACHE = call_tool(server="vn-market", tool="get_agent_signals", arguments={
  "from_agent": "news-scout",
  "status": "all",
  "hours_back": 6
})
Non-fatal: if tool errors, set SELF_SIGNALS_CACHE = [], skip feedback tuning, continue.

# 2. Sibling-window dedup cache (NEW — Root B fix, DESIGN-GATHERER-DOUBLEFIRE-DEDUP-CLUSTER):
# Query ALL producers for the last 15 minutes. This catches a concurrent sibling news-scout
# that committed signals in the same backstop window. Used ONLY for cross-sibling dedup —
# NOT for feedback tuning (feedback tuning continues to use SELF_SIGNALS_CACHE).
SIBLING_WINDOW_CACHE = call_tool(server="vn-market", tool="get_agent_signals", arguments={
  "from_agent": null,       # all producers — omit or pass null/omit field
  "status": "all",
  "hours_back": 0.25        # 15 minutes = 0.25 hours
})
Non-fatal: if tool errors, set SIBLING_WINDOW_CACHE = [], continue.
```

**Dedup key:** `(signal_type, stock_code_normalised, title_normalised)` — a content-hash triple. Normalise `stock_code` to uppercase trimmed; normalise `title` to lowercase, strip punctuation, collapse whitespace.

**Usage in `stage-signals.md` dedup checks:**

In the inter-cycle dedup gate (top of stage-signals.md) and in the legal_risk dedup check, EXTEND the existing `SELF_SIGNALS_CACHE` check to ALSO check `SIBLING_WINDOW_CACHE`:

```
# Before posting ANY signal:
# 1. Check SELF_SIGNALS_CACHE (existing — intra-session, 360 min for legal_risk / 180 min for others)
# 2. ALSO check SIBLING_WINDOW_CACHE (NEW — cross-sibling, 15-min window only)
sibling_hit = SIBLING_WINDOW_CACHE.find(s =>
  content_hash(s) === content_hash(candidate)
)
if sibling_hit:
  log "[DEDUP-SIBLING] {signal_type} suppressed — sibling committed identical signal #{sibling_hit.id} in the last 15 min"
  SUPPRESS
```

The existing self-history dedup rules (180-min chain_catalyst/urgent_news, 360-min legal_risk) are UNCHANGED. The sibling gate is an ADDITIONAL early-exit check using the 15-minute cross-producer window.

**GENERIC constraint (per board row):** No signal_type allowlist — any signal type news-scout produces is eligible for cross-sibling dedup via the 15-minute window. The content-hash key is the discriminator, not signal_type filtering.

### Implementation note — `get_agent_signals` tool contract

If `get_agent_signals` does not accept `from_agent=null` to mean "all producers", implement SIBLING_WINDOW_CACHE via a bare SQL query on the shared named-volume market.db signals table:

```sql
SELECT id, signal_type, stock_code, payload
FROM agent_signals
WHERE created_at >= datetime('now', '-15 minutes')
  AND status IN ('committed', 'published', 'read')
```

Content-hash each row as `sha256(signal_type + ":" + upper(trim(stock_code)) + ":" + lower(trim(title)))`. Match the candidate on this hash before posting.

### Acceptance criterion

Two concurrent news-scout fires within the same minute (simulated: run news-scout twice in rapid succession against the same news feed) produce 0 duplicate `(signal_type, stock_code, title)` signals committed to agent_signals. Second run finds the first run's signals via `SIBLING_WINDOW_CACHE` and suppresses all duplicates.

---

## DMS-2 — Root C: Sibling-Success Corroboration Gate (market-watcher)

### Problem

`docs/agents/market-watcher/flow/main.md` Step 3 reads:

```
3. Run Step 0 smoke probe: call_tool(server="vn-market", tool="get_system_status").
   On failure → send_telegram(channel="bug", message="[market-watcher] Step 0 smoke probe FAILED") → EXIT.
```

This fires a BUG on a SINGLE probe failure with NO retry and NO sibling corroboration. Under CPU-starved host conditions (load 205 from the double-fire itself), a transient timeout is misclassified as a real gateway outage. The false gateway-down BUG compounds the double-fire harm.

### Fix

**File:** `docs/agents/market-watcher/flow/main.md` — Step 3 block only.

Replace the current Step 3 with the Primitive 3 corroboration gate:

```
3. Run Step 0-GW corroboration probe (Root C fix — DESIGN-GATHERER-DOUBLEFIRE-DEDUP-CLUSTER):

   PROBE_1 = call_tool(server="vn-market", tool="get_system_status")
   if PROBE_1 succeeds → gateway UP → continue to Step 4.

   On timeout or error (attempt 1):
     WAIT 30s (CPU-spike backoff)
     PROBE_2 = call_tool(server="vn-market", tool="get_system_status")
     if PROBE_2 succeeds → gateway UP → continue to Step 4.

   On timeout or error (attempt 2 — two successive failures):
     # Do NOT file gateway-down BUG yet. Corroborate via sibling success.
     SIBLING_RECENT = call_tool(server="vn-market", tool="get_agent_signals", arguments={
       "from_agent": null,    # all producers
       "status": "all",
       "hours_back": 0.25     # 15-minute window
     })
     # Filter: producer IN ['market-watcher', 'news-scout'] OR any cowork agent committed in this window.
     # If ANY signal is present (non-empty result): a sibling accessed the gateway successfully.

     if SIBLING_RECENT is non-empty:
       log "[market-watcher] Step 0-GW: 2x timeout but SIBLING_RECENT is non-empty — suppressing false gateway-down BUG"
       # Gateway is reachable via a sibling. This session's failure is a local transient.
       # Options: (a) retry once more after 60s; (b) degrade silently (slot already ran via sibling).
       # Default: EXIT cleanly. Do NOT file gateway-down BUG.
       EXIT

     else:
       # Two successive probe failures + zero sibling success in 15-min window.
       # Real gateway outage confirmed.
       send_telegram(channel="bug", message="[market-watcher] gateway-down CONFIRMED: 2x probe failure + no sibling success in 15-min window")
       EXIT
```

**If `get_agent_signals(from_agent=null)` is not available**, fall back to the bare SQL query on named-volume market.db:

```sql
SELECT COUNT(*) AS cnt
FROM agent_signals
WHERE created_at >= datetime('now', '-15 minutes')
  AND status IN ('committed', 'published', 'read')
```

`cnt > 0` → sibling succeeded → suppress BUG. `cnt = 0` → real outage → file BUG.

### Acceptance criterion

**Scenario 1 (false-positive suppression):** Inject a Step-0-GW timeout (both attempts) while a sibling gatherer signal is committed in the last 15 minutes. Market-watcher EXITs cleanly — zero gateway-down BUG filed to Telegram.

**Scenario 2 (real outage detection):** Inject a Step-0-GW timeout (both attempts) with NO signals committed in the last 15 minutes. Market-watcher files exactly one gateway-down BUG to Telegram.

---

## Shared Helper — `get_recent_signals(window_seconds=900)`

Both DMS-1 and DMS-2 use a 15-minute cross-producer signal query. Implement once, reuse both:

```typescript
// apps/mcp-server/src/tools/signals/getRecentSignals.ts
export async function getRecentSignals(windowSeconds: number = 900) {
  const cutoff = new Date(Date.now() - windowSeconds * 1000).toISOString();
  return db.all(
    `SELECT id, signal_type, from_agent, stock_code, payload, created_at
     FROM agent_signals
     WHERE created_at >= ? AND status IN ('committed','published','read')
     ORDER BY created_at DESC`,
    [cutoff]
  );
}
```

Register as an MCP tool `get_recent_signals` with parameter `window_seconds: integer (default 900)`. Or expose as an internal helper and call from both `get_agent_signals` (extended to support `from_agent=null`) and the corroboration gate — whichever minimises code surface.

---

## Zone Collision Hold

Both DMS-1 and DMS-2 edit `apps/mcp-server/` which is locked by `ARCH-CRON-SCHEDULER-RELIABILITY` (currently in_progress). The board row `DMS-DOUBLEFIRE-SIBLING-DEDUP-CORROBORATION` is BACKLOG with `hold_reason` citing this collision.

**Promote to ready[] when:** `ARCH-CRON-SCHEDULER-RELIABILITY` reaches `review` or `done` status.

DMS-1 and DMS-2 MAY ship in a single commit (they share the `getRecentSignals` helper). The behavioral acceptance criteria for each are independent and must be verified separately.

---

## Cross-references

- Architecture brief: `docs/architecture-briefs/2026-06-16-gatherer-doublefire-dedup-cluster.md`
- Root A (DONE): `docs/agents/cowork-team/flow/leader-lock.md` (commit `69babf46`)
- Stage-bootstrap (DMS-1 target): `docs/agents/news-scout/flow/stage-bootstrap.md` Step 0c
- Stage-signals (DMS-1 dedup extension): `docs/agents/news-scout/flow/stage-signals.md` dedup gates
- Market-watcher main (DMS-2 target): `docs/agents/market-watcher/flow/main.md` Step 3
- MEMORY: `feedback_gatherer_manual_cloud_doublefire.md` — incident narrative
- MEMORY: `feedback_false_infra_failure_corroboration_gate.md` — RAW-probe + sibling-success pattern
