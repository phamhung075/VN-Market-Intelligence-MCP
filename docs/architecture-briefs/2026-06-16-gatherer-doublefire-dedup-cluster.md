# Architecture Brief — Gatherer Double-Fire Dedup Cluster

**Slug:** `gatherer-doublefire-dedup-cluster`
**Date:** 2026-06-16
**Author:** agents-architect
**Status:** READY → agent-father (Root A) + dev-mcp-server (Roots B/C)
**Supersedes holds:** FIX-GATHERER-DOUBLEFIRE-DISPATCHER · FIX-NEWSSCOUT-SIBLING-DEDUP-CACHE · FIX-MARKETWATCHER-GW-CORROBORATION-GATE

---

## Problem Statement

The offhours-gatherer pair (news-scout-offhours + market-watcher-eod) double-fires when:

1. The manual `*/15` cowork dispatcher reads a **stale** `last_fired` (12:09Z) at ~16:07Z and decides the slot is due.
2. The cloud backstop **independently** fires the same slot pair at ~16:12Z after its own staleness check.
3. The leader-lock read **times out** at step 0b, so the dispatcher cannot determine whether a live peer holds the lock → it cannot defer → it fires anyway.

This produces three concrete harms:

- **Root A** — two dispatcher instances fire the same offhours slot within ~5 minutes (leader-lock unreadable cannot prevent).
- **Root B** — news-scout's `SELF_SIGNALS_CACHE` is initialised empty each run, so the second concurrent run is blind to signals just committed by the first → 2-3 duplicate internal signals.
- **Root C** — market-watcher's Step 0-GW gateway probe times out under the CPU-starved host (load 205) that the double-fire itself caused; without a corroboration gate it files a FALSE gateway-down BUG.

The three roots share one structural cause: **absence of a cross-instance concurrency primitive** that ties defer decisions (A), dedup windows (B), and infra-failure verdicts (C) to a shared, observable fact rather than per-session local state.

---

## Single Concurrency Model — Three Primitives, One Design

All three roots are resolved by the same concurrency model. The model has three primitives that compose:

### Primitive 1 — Backstop-Window Defer Gate (fixes Root A)

**Where:** `docs/agents/cowork-team/flow/leader-lock.md` (new else-branch after the ORPHAN-RECOVERY path)

**Rule:** When `task_force_release_orphan` returns `released=false` (reason: "heartbeat fresh" — live peer holds the lock), the current session ALREADY exits silently. The gap is when the leader-lock read itself **times out** (tool call errors rather than returns `claimed=false`). Today, a timeout is treated as "lock-free" and dispatch continues. This is the root of Root A.

**Fix — Backstop-Window Defer semantics:**

```
LEADER_CLAIM = call_tool(...task_claim "cowork-leader"...)

if call errors / times out:
  # Lock unreadable — do NOT treat as lock-free.
  # Check whether this tick falls in the :00-:15 window of a 4h-boundary hour.
  BOUNDARY_HOURS = {0, 4, 8, 12, 16, 20}  # offhours-gatherer backstop schedule
  current_minute = UTC_now.minute          # 0–59 within the hour
  current_hour   = UTC_now.hour

  if current_hour in BOUNDARY_HOURS AND current_minute < 15:
    log "[cowork] leader-lock UNREADABLE within backstop window (:${current_minute}) — DEFER one tick"
    EXIT  # do NOT fire; cloud backstop peer is presumed to hold it
  else:
    # Outside backstop window → lock-unreadable is safe to treat as lock-free
    → PROCEED (continue to Step 1)
```

**Rationale:** A lock-read timeout within the :00-:15 backstop window of a 4h-boundary hour is the exact signature of a live cloud peer holding the lock. The cloud backstop fires in that window; the manual dispatcher fires 7 minutes after the boundary. If the manual dispatcher cannot read the lock at that moment, the cloud peer is the most likely holder. Deferring one tick costs 15 minutes of latency on a slot that fires every 4 hours — acceptable. Outside that window, the normal timeout-retry path continues unchanged.

**Session discriminator note:** `task_force_release_orphan` keys on `owner_agent` ("cowork-dispatcher"), which **both** the CLI dispatcher and the cloud peer share. This means a live cloud peer is indistinguishable from a genuine own-session hold at the `owner_agent` granularity. The backstop-window defer gate sidesteps this by using **wall-clock position** as a proxy for peer identity. No changes to `task_claim` / `task_heartbeat` / `task_force_release_orphan` tool contracts are needed.

---

### Primitive 2 — Cross-Sibling Signal Visibility Window (fixes Root B)

**Where:** `apps/mcp-server/` — news-scout flow's SELF_SIGNALS_CACHE initialisation step

**Rule:** The `SELF_SIGNALS_CACHE` must be populated not from per-session state (empty at session start) but from a **shared, database-backed recent-window query** against the signal_bus table.

**Fix — Sibling-aware dedup cache:**

At the point where news-scout initialises `SELF_SIGNALS_CACHE`, replace empty-set initialisation with:

```
SIBLING_WINDOW_SECONDS = 900   # 15 minutes — covers one full dispatcher cadence
SELF_SIGNALS_CACHE = query_signal_bus(
  committed_within_last = SIBLING_WINDOW_SECONDS,
  status IN ['committed', 'published']
)
# Returns deduplicated set of (signal_type, entity, summary_hash) tuples
# from all producers, not just this session's committed set.
```

The dedup key per signal is a content-hash triple: `(signal_type, primary_ticker_or_topic, title_normalized)`. A second news-scout run within 15 minutes will find the first run's signals already in the window, match on the content hash, and suppress duplicates — regardless of which session committed first.

**GENERIC constraint** (per board row): the allowlist must be empty — any signal type produced by news-scout is eligible for dedup via the window. No special-casing per signal_type.

**Key invariant:** the window query must hit the **same named-volume SQLite DB** that the first run wrote to, not a per-session cache. This is already the case for the MCP server architecture (single named-volume market.db). The fix is query-side only — no schema change required.

---

### Primitive 3 — Sibling-Success Corroboration Gate (fixes Root C)

**Where:** `apps/mcp-server/` — market-watcher's Step 0-GW (gateway health probe)

**Rule:** A gateway-down BUG escalation requires corroboration from a second independent source before it is filed. One source alone (a single tool timeout) is insufficient evidence.

**Fix — Corroboration gate before BUG escalation:**

```
Step 0-GW sequence:
  1. Probe: call_tool(get_system_status) — primary probe
     If succeeds → gateway UP → continue normally

  2. On timeout or error (attempt 1):
     WAIT 30s (backoff — avoids CPU-spike false-positive within the same second burst)
     Probe again: call_tool(get_system_status) — retry
     If succeeds → gateway UP → continue normally

  3. On timeout or error (attempt 2):
     # Two successive probes failed. Corroborate before filing BUG.
     # Read sibling-success evidence from shared state:
     SIBLING_KEY = "cowork-slot:market-watcher-eod"   # or news-scout-offhours
     SIBLING_RECENT = query_signal_bus(
       producer IN ['market-watcher', 'news-scout'],
       committed_within_last = 900   # 15-min sibling window
     )

     if SIBLING_RECENT is non-empty:
       # A sibling gatherer succeeded in this same window.
       # Gateway is reachable — this session's failure is local (per-session init miss,
       # CPU spike, or transport transient). Do NOT file gateway-down BUG.
       log "[market-watcher] Step 0-GW: 2x timeout but sibling succeeded — suppressing false gateway-down"
       # Options for this session: (a) retry once more after 60s, (b) degrade silently.
       # Default: EXIT gracefully (slot already ran via sibling; no BUG filed).
       EXIT

     else:
       # No sibling success AND two successive probe failures.
       # Real gateway outage. File BUG.
       send_telegram(channel="bug",
         message="[market-watcher] gateway-down confirmed (2x probe + no sibling success in 15min window)")
       EXIT
```

**Rationale:** The MEMORY entry for `false-infra-failure-corroboration-gate` confirms: "RAW-probe + sibling-success disambiguates a real outage from a per-session init miss." The `SIBLING_RECENT` query reuses Primitive 2's signal-bus window query — same mechanism, same 15-minute window, different consumer.

---

## Shared Infrastructure — One Primitive Reused by Two Roots

Primitives 2 and 3 both query `signal_bus` for recent committed signals within a 15-minute window. This is the **single shared fact** that makes the model coherent:

```
shared_signal_bus_recent_window(window_seconds=900):
  → returns signals committed by ANY cowork agent in the last 15 minutes
  → used by Root B as dedup source (news-scout reads BEFORE committing)
  → used by Root C as corroboration source (market-watcher reads AFTER probe fails)
```

This is a **read-only query** on the existing signal_bus SQLite table in the named-volume market.db. No new table, no new column, no schema migration needed. The query can be expressed as a single MCP tool call: `get_recent_signals(window_seconds=900)` — this tool exists or can be trivially implemented as a filter on the existing `get_signals` tool.

---

## Implementation Decomposition

### Task AF-1 — agent-father (Root A · doc-only · cowork flow)

**File:** `docs/agents/cowork-team/flow/leader-lock.md`

Add a new error branch at the top of the `task_claim` call block (before the `claimed==true` branch):

```markdown
<!-- NEW: Backstop-Window Defer Gate — DESIGN-GATHERER-DOUBLEFIRE-DEDUP-CLUSTER -->
if LEADER_CLAIM call errors or times out:
  <Primitive 1 logic verbatim from §Primitive 1 above>
```

The existing `claimed==false` + heartbeat + orphan-recovery path is unchanged.

**Acceptance criterion:** Simulate leader-lock tool returning error/timeout while `UTC.hour ∈ {0,4,8,12,16,20}` and `UTC.minute < 15` → dispatcher EXITs (defers). Same error outside that window → dispatcher PROCEEDS.

---

### Task DMS-1 — dev-mcp-server (Root B · code · apps/mcp-server/)

**File(s):** news-scout flow / signal dedup initialisation in `apps/mcp-server/src/`

Replace `SELF_SIGNALS_CACHE = []` with `SELF_SIGNALS_CACHE = get_recent_signals(window_seconds=900)`.

If `get_recent_signals` tool does not yet exist as a named MCP tool, implement as a bare SQL query against the signals table: `SELECT signal_type, ticker, title FROM signals WHERE committed_at >= NOW() - 900s AND status IN ('committed','published')`. Content-hash each row to `(signal_type, ticker_normalised, title_normalised)` as the dedup key.

**Acceptance criterion:** Two concurrent news-scout fires within the same minute produce 0 duplicate internal signals (2nd sees the 1st's committed signals via the 15-min window query).

---

### Task DMS-2 — dev-mcp-server (Root C · code · apps/mcp-server/)

**File(s):** market-watcher flow's Step 0-GW in `apps/mcp-server/src/`

Replace the current "2 probe failures → file gateway-down BUG immediately" path with the Primitive 3 corroboration gate (verbatim from §Primitive 3 above). Reuse the same `get_recent_signals(window_seconds=900)` helper from DMS-1.

**Acceptance criterion:** Inject a Step-0-GW timeout while a sibling gatherer's signal is committed in the last 15 minutes → market-watcher EXITs without filing gateway-down BUG. Inject a timeout with NO sibling signals in window → gateway-down BUG IS filed.

---

### Task DMS-1 + DMS-2 may be combined into one dev-mcp-server sprint

Both target `apps/mcp-server/` and share the `get_recent_signals` helper. They can ship in a single commit under one sprint ID. The behavioral acceptance criteria are independent and must each be verified separately.

---

## Routing After This Brief

| Root | Subsumes hold | Implementation task | Route |
|---|---|---|---|
| A | FIX-GATHERER-DOUBLEFIRE-DISPATCHER | AF-1 (flow doc edit) | agent-father (docs zone) |
| B | FIX-NEWSSCOUT-SIBLING-DEDUP-CACHE | DMS-1 (signal cache) | dev-mcp-server (apps/mcp-server/) |
| C | FIX-MARKETWATCHER-GW-CORROBORATION-GATE | DMS-2 (corroboration gate) | dev-mcp-server (apps/mcp-server/) |

The umbrella board row `DESIGN-GATHERER-DOUBLEFIRE-DEDUP-CLUSTER` is stamped `owner=agents-architect` and links this brief. The three HELD child rows (FIX-GATHERER-DOUBLEFIRE-DISPATCHER, FIX-NEWSSCOUT-SIBLING-DEDUP-CACHE, FIX-MARKETWATCHER-GW-CORROBORATION-GATE) remain in `ready[]` with their `hold_reason` replaced by `unblocked_by` pointing to this brief; the next dev-team tick routes them to the correct implementers.

---

## Non-Goals (Out of Scope for This Brief)

- No changes to `task_claim`, `task_heartbeat`, `task_force_release_orphan` tool contracts (Primitive 1 is dispatcher-side logic only).
- No new DB tables, no schema migrations (Primitives 2+3 query the existing signals table).
- No changes to the cloud backstop cadence or the cowork-schedule.json slot definitions.
- No changes to the leader heartbeat TTL (1800s) — already correct.
- No push to origin — PO out-of-band.

---

## Cross-References

- MEMORY: `feedback_gatherer_manual_cloud_doublefire.md` — incident narrative and defer-on-unreadable pattern
- MEMORY: `feedback_false_infra_failure_corroboration_gate.md` — RAW-probe + sibling-success pattern
- MEMORY: `feedback_over_parallel_fanout_host_starvation.md` — load-205 root of the C timeout
- `docs/agents/cowork-team/flow/leader-lock.md` — Primitive 1 insertion point
- `docs/agents/cowork-team/flow/slot-claim.md` — per-work-item tokens (unchanged; they block same-session dup-spawn but NOT cross-instance dup-spawn)
- `docs/agents/cowork-team/flow/last-fired.md` — Step 5b (unchanged; still writes after WON_SLOTS; the defer means WON_SLOTS is empty on defer → last_fired not updated → next readable tick sees same stale value, but by then the cloud peer has updated it)
