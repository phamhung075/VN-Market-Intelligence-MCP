<!-- size-justification: 420L — 7 deliverables across 2 phases, 4 design decisions, R1/R3 hard constraints, ops runbook, DDD layer map, test matrix, explicit file list for PM task breakdown -->

# DYN-WF-FOUNDATION — Technical Blueprint

**Sprint:** DYN-WF-FOUNDATION
**Task:** DWF-ARCH
**Author:** architect · 2026-05-30T21:02 UTC
**Status:** DESIGN COMPLETE — hand to PM (DWF-PM)
**Input spec:** `docs/REQ_DYN-WF-FOUNDATION.md` · `docs/architecture-briefs/2026-05-29-dynamic-workflow-architecture.md`

---

## Zone

**Multi-zone:**

| Zone | Path | Specialist | Work scope |
|---|---|---|---|
| mcp-server | `apps/mcp-server/` | dev-mcp-server | New `is_trading_day` tool; `published:<work-id>` marker via task_claim; routing-policy fence test |
| cross-service | `scripts/agents-flow/` · `docs/data/` · `docs/agents/cowork-team/flow/main.md` | developer | cowork-match-slots.js + cowork-team flow rewrite for leader lock + per-work-item token; routing-policy.json; pressure-state.json emitter; cowork-schedule.json prune |

PM must split into two per-zone subtask tracks: **DWF-DEV-MCP** and **DWF-DEV-CROSS**.

---

## Design Decision Resolution (A–D)

### ARCH-DECIDE-A: is_trading_day data source

**Decision: embedded VN calendar JSON, no network dependency.**

Rationale:
- No geo-block risk (geo-blocked sources require VPS proxy — project_bctc_vps_proxy.md).
- Deterministic: HOSE publishes the annual holiday schedule in advance (typically October of prior year). The embedded JSON covers 2024–2027 with yearly update process.
- AC-P0-3-6 (deliberate-violation proof) requires a known holiday to return `is_trading_day: false` — a live API introduces a test-time network dependency that contradicts the deterministic test requirement.

Implementation:

- **Domain service:** `apps/mcp-server/src/domain/services/vnTradingCalendar.ts`
  - Exports `isVnTradingDay(date: string): TradingDayResult`
  - Reads from embedded constant `VN_HOLIDAYS: Record<string, string>` (map of YYYY-MM-DD → holiday name in Vietnamese)
  - Weekend detection: pure JS `Date.getUTCDay()` after adjusting for GMT+7 offset
  - Half-day detection: `VN_HALF_DAYS: Set<string>` (known Tết eve dates)
  - Unknown future: `session_status: "unknown"` when date > 2027-12-31 (last pre-loaded year boundary)

- **Embedded calendar file:** `apps/mcp-server/src/domain/services/vnHolidayData.ts`
  - Static `export const VN_HOLIDAYS: Record<string, string>` covering 2024–2027
  - Static `export const VN_HALF_DAYS: Set<string>` covering known half-day sessions
  - Includes: 2025-01-27 (Tết Nguyên Đán), all VN national holidays per HOSE circular
  - Yearly update: dev-mcp-server task each October; no migration required (pure constant replacement)

- **MCP tool:** `apps/mcp-server/src/interface/mcp/tools/system/isTradingDayTool.ts`
  - Registers `is_trading_day` tool on McpServer
  - Schema: `{ date?: z.string().optional() }` — defaults to today at GMT+7
  - Timezone handling: if no `date` param, compute `new Date()` shifted +7h to get VN-local date
  - Read-only: no DB writes

- **Registry:** one line added to `apps/mcp-server/src/interface/mcp/tools/registry.ts` (import + push to `toolRegistry`)

- **Test:** `apps/mcp-server/src/__tests__/DWF-is-trading-day.test.ts`
  - AC-P0-3-1: `2025-01-27` → `{ is_trading_day: false, session_status: "holiday" }`
  - AC-P0-3-2: `2025-01-04` → `{ is_trading_day: true, session_status: "open" }`
  - AC-P0-3-3: `2025-01-11` → `{ is_trading_day: false, session_status: "weekend" }`
  - AC-P0-3-6 (deliberate-violation): assert `is_trading_day(date="2025-01-27")` returns `is_trading_day: true` → test must go RED (proving holiday data not a stub)

**DDD layer:** Domain service (`vnTradingCalendar.ts`) + Interface tool (`isTradingDayTool.ts`). No infrastructure layer — pure in-memory constant lookup, no DB, no HTTP.

---

### ARCH-DECIDE-B: Leader lock renewal mechanism

**Decision: explicit `task_heartbeat` call on each tick win, not a reclaim pattern.**

Rationale:
- Reclaim pattern (claim fresh each tick, rely on stale-steal when old row expires) has a race window: if the mcp-server is under load and a stale-steal races against a new session's INSERT OR IGNORE, the new session wins even though the old leader is still alive. This recreates the concurrent-dispatch bug in a new form.
- Explicit heartbeat (`task_heartbeat(task_id="cowork-leader")`) on each tick is clean: the renewal path is `heartbeat_at = now, expires_at = now + ttl_seconds` with `WHERE task_id=? AND owner_session=?`. A live leader renews cleanly; a dead leader fails the `owner_session` predicate and the lock expires naturally.

**Tick lifecycle:**
1. Tick fires → `task_claim(kind="cowork-slot", key="cowork-leader", ttl_seconds=1800, owner_agent="cowork-dispatcher")`
2. WIN on first tick (INSERT): proceed with dispatch body
3. WIN on subsequent ticks (INSERT fails → stale-steal succeeds against SAME session's own expired row, OR INSERT succeeds because previous TTL has not yet expired): proceed
4. After dispatch body, call `task_heartbeat(task_id="cowork-leader")` to extend TTL from current time
5. LOSE (another session holds active lock): log `"[cowork] leader lock held by peer — silent exit"` and EXIT

Implementation note: `coordinationTools.ts` `SERVER_SESSION_ID` is process-level. Both terminal sessions sharing the same mcp-server Docker process will have the same `SERVER_SESSION_ID` — meaning the heartbeat check `WHERE owner_session = ?` is effectively process-scoped. This is acceptable (one Docker mcp-server process is the cross-session truth point). The lock distinguishes leaders at the process level, which is the correct granularity.

**Leader TTL:** exactly `1800` seconds (2 × 15-min heartbeat interval). Never rely on default. The explicit argument `ttl_seconds: 1800` must be present in the dispatch code. AC-P2-5-3 tests this.

---

### ARCH-DECIDE-C: published:<work-id> storage mechanism

**Decision: reuse `task_claim` with kind `cowork-slot`, key `published:<work-id>`.**

Rationale:
- No new table, no schema migration, no new enum value (NFR-6). The existing `task_locks` table with kind `cowork-slot` is the cross-session truth point.
- `published:<work-id>` as a `task_id` is a natural fit: INSERT OR IGNORE prevents duplicate publish; the TTL provides natural expiry; `owner_session` correctly scopes to the publishing process.
- Alternative (dedicated `published_log` table): requires a new DDL table, a new store module, and a new migration — pure overhead for what is a dedup check semantically identical to a task_claim.

**Key format:** `published:<slot_id>:<YYYY-MM-DD>` (e.g. `published:chef-morning:2026-05-30`)

The date suffix here identifies CONTENT identity (one morning dish per date is correct) — distinct from the per-work-item dispatch token which is suffix-free (FR-P2-6). The two keys serve different purposes and must not be conflated (this distinction is explicit in the spec).

**Where the check lives:** in `docs/agents/cowork-team/flow/main.md` Step 5, BEFORE calling `send_telegram`. The spawned agent (unified-agent, etc.) is responsible for calling `task_claim(kind="cowork-slot", key="published:<slot_id>:<date>", ttl_seconds=<TTL>)` before its final `send_telegram` step. The dispatcher does NOT own the publish gate — the publishing agent does, so the check is co-located with the send.

Implementation: no new code in mcp-server. The agent flow instruction documents the required `task_claim` call pattern. The existing `task_claim` tool handles it.

---

### ARCH-DECIDE-D: Published marker TTL

**Decision: 28 hours (100800 seconds).**

Rationale:
- 24h TTL risks a same-day retry leaking through if the marker was set early in the day (e.g., 02:00 UTC) and a retry happens at 01:59 UTC the next day (23h59m gap < 24h TTL but a genuinely new-day dish).
- 28h (24h + 4h buffer) covers the full 24h content cycle with a 4h pad against timezone/clock drift.
- The content cycle for all cowork dishes is daily. Weekly slots (digest-sunday, tnb-audit) use `slot_id:YYYY-WW` (ISO week number) with TTL = 8 days (691200s) — architect notes this variant for PM visibility; PM may split as a separate subtask if scope is large.

For simplicity in Phase 2, use a single TTL constant: `PUBLISHED_MARKER_TTL_SECONDS = 100800` (28h) for all daily slots. Weekly slots: `PUBLISHED_MARKER_WEEKLY_TTL_SECONDS = 691200` (8 days).

---

## Verified Paths

### apps/mcp-server/ (Zone 1 — dev-mcp-server)

**New files to CREATE:**

| Path | Purpose | DDD Layer |
|---|---|---|
| `apps/mcp-server/src/domain/services/vnHolidayData.ts` | Embedded VN holiday + half-day constants | Domain |
| `apps/mcp-server/src/domain/services/vnTradingCalendar.ts` | `isVnTradingDay()` pure function | Domain |
| `apps/mcp-server/src/interface/mcp/tools/system/isTradingDayTool.ts` | `is_trading_day` MCP tool registration | Interface |
| `apps/mcp-server/src/__tests__/DWF-is-trading-day.test.ts` | AC-P0-3-1..7 + deliberate-violation | Tests |
| `apps/mcp-server/src/__tests__/DWF-coordination-phase2.test.ts` | DV-P2-1..7 coordination tests | Tests |
| `apps/mcp-server/src/__tests__/DWF-routing-policy-fence.test.ts` | AC-P0-2-5 routing-policy JSON fence | Tests |

**Files to MODIFY:**

| Path | Change | DDD Layer |
|---|---|---|
| `apps/mcp-server/src/interface/mcp/tools/registry.ts` | Add `registerIsTradingDayTool` import + push to toolRegistry (line 147 area) | Interface |

**Zero changes to:**
- `apps/mcp-server/src/infrastructure/db/coordinationStore.ts` — no new kind, no schema change
- `apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts` — no changes needed

### cross-service zone (Zone 2 — developer)

**Files to MODIFY:**

| Path | Change | DDD Layer |
|---|---|---|
| `docs/data/cowork-schedule.json` | Remove 13 dead slots (FR-P0-1); 12 remain | Infrastructure |
| `docs/agents/cowork-team/flow/main.md` | Replace Step 4.6 with leader-lock pattern (FR-P2-5) + suffix-free per-work-item token (FR-P2-6) | Application |

**New files to CREATE:**

| Path | Purpose | DDD Layer |
|---|---|---|
| `docs/data/routing-policy.json` | Deterministic signal routing table (FR-P0-2) | Infrastructure |
| `docs/data/pressure-state.json` | Initial seed file (empty/stub) + emitter instructions | Infrastructure |
| `docs/protocols/dwf-ops-runbook.md` | R2 ops runbook: leader-lock dark window after force-recreate | Infrastructure |

**Files to MODIFY (flow rewrite detail):**

`docs/agents/cowork-team/flow/main.md` changes:

1. **Add Step 0b — Leader lock claim** (before Step 1):
   ```
   result = task_claim(kind="cowork-slot", key="cowork-leader", ttl_seconds=1800,
     owner_agent="cowork-dispatcher")
   if result.claimed == false:
     log "[cowork] leader lock held by peer — silent exit"
     EXIT
   ```

2. **Remove nominal_tick from per-slot claim keys in Step 4.6** (R3 fix):
   - OLD: `task_id: "cowork-slot:" + slot.agent + ":" + nominal_tick`
   - NEW: `task_id: "cowork-slot:" + slot.slot_id` (suffix-free, uses slot_id not agent)
   - TTL change: `ttl_seconds: 180` (was 900; R1 fix — explicit short TTL)

3. **Add Step 4.6b — Heartbeat after dispatch body** (before Step 5 spawns):
   ```
   task_heartbeat(task_id="cowork-leader")
   ```

4. **Add Step 4.8 — Pressure-state.json emitter** (after Step 4.7, before Step 5):
   Emit `docs/data/pressure-state.json` per FR-P0-4 schema.
   Calls `is_trading_day` (bare tool name via gateway) for `calendar_status`.
   Writes atomically: write `.tmp` then rename.

5. **Remove `nominal_tick` variable** (no longer used in per-slot keys):
   The `nominal_tick` bash block in Step 4.6 is deleted; drift_min tracking in Step 3b is retained.

**Note on flow file size:** Current `main.md` is ~300L with size-justification header. After rewrite it will be ~350L. Update size-justification comment to reflect new content.

---

## Reuse Patterns

1. **task_claim / task_heartbeat / task_release** — fully operational in `coordinationStore.ts` + `coordinationTools.ts`. No new DB code. No new kind enum. Reuse `cowork-slot` for both leader lock and per-work-item tokens. Reuse `cowork-slot` for `published:<work-id>` markers.

2. **cowork-match-slots.js** — unchanged. The leader lock and per-work-item token changes are in the flow only, not in the slot-matcher script.

3. **McpServer tool registration pattern** — follow `registerCoordinationTools` pattern exactly: import from `coordinationStore.ts`, stamp `SERVER_SESSION_ID` server-side, never from caller.

4. **Existing test harness** — `_injectCoordinationDb()` + `_resetCoordinationDbState()` are exported from `coordinationStore.ts` for test injection. DWF-coordination-phase2.test.ts uses `new Database(':memory:')` + inject pattern (same as `232-cowork-resilience.test.ts`).

5. **earningsCalendar.ts** pattern — `apps/mcp-server/src/domain/services/financial-reports/earningsCalendar.ts` uses a similar static data + pure function pattern. `vnTradingCalendar.ts` follows the same DDD-clean structure.

---

## DDD Layer Assignments

| Deliverable | Layer | Files |
|---|---|---|
| VN holiday constants | Domain | `vnHolidayData.ts` |
| `isVnTradingDay()` | Domain service | `vnTradingCalendar.ts` |
| `is_trading_day` MCP tool | Interface | `isTradingDayTool.ts` |
| cowork-schedule.json prune | Infrastructure (config) | `docs/data/cowork-schedule.json` |
| routing-policy.json | Infrastructure (policy) | `docs/data/routing-policy.json` |
| pressure-state.json emitter | Infrastructure (data file) + Application (flow instruction) | `main.md` Step 4.8 |
| Leader lock (cowork-leader) | Application (orchestration) | `main.md` Step 0b |
| Per-work-item token | Application (orchestration) | `main.md` Step 4.6 (rewrite) |
| Published marker | Application (publish gate) | Agent flow instruction (no new code) |
| R2 ops runbook | Infrastructure (ops doc) | `docs/protocols/dwf-ops-runbook.md` |

---

## Detailed Test Strategy

### Test file 1: `DWF-is-trading-day.test.ts` (Unit — Domain + Interface)

Uses `vnTradingCalendar.ts` directly (no DB, no HTTP).

| Test | AC | Type |
|---|---|---|
| `2025-01-27` → holiday | AC-P0-3-1 | Happy path |
| `2025-01-04` → open | AC-P0-3-2 | Happy path |
| `2025-01-11` → weekend | AC-P0-3-3 | Happy path |
| Half-day known date → `{ is_trading_day: true, session_status: "half_day" }` | edge case | Happy path |
| Date > 2027 → `{ is_trading_day: false, session_status: "unknown" }` | edge case | Boundary |
| DV-holiday-stub: assert `2025-01-27` returns `is_trading_day: true` → RED | AC-P0-3-6 | Deliberate-violation |
| Tool read-only: call tool and assert coordination.db row count unchanged | AC-P0-3-4 | Negative |

### Test file 2: `DWF-coordination-phase2.test.ts` (Integration — in-memory DB)

Uses `_injectCoordinationDb(new Database(':memory:'))` pattern.

| Test ID | Maps to | Description |
|---|---|---|
| DV-P2-1 | AC-P2-5-1 | Two callers both attempt `task_claim(key="cowork-leader")` simultaneously. Exactly 1 wins. Assert both claiming `claimed: true` → RED (impossible). |
| DV-P2-2 | R3 proof | `cowork-slot:chef-morning` held; second attempt with same key → `claimed: false`. |
| DV-P2-3 | R3 counter-test | `cowork-slot:chef-morning@<tick1>` held; `cowork-slot:chef-morning@<tick2>` succeeds (different key) → demonstrates suffix recreates bug. |
| DV-P2-4 | R1 code assertion | AST/grep check: every `task_claim` call for per-work-item keys has literal `ttl_seconds: 180` argument. Removing it → RED. |
| DV-P2-5 | R1 short-TTL frees at 181s | Claim with `ttl_seconds=180`, advance mock clock 181s without heartbeat, second claim → `claimed: true`. |
| DV-P2-6 | R1 default-3600 starves | Claim with `ttl_seconds=3600`, advance 181s, second claim → `claimed: false` (still locked). |
| DV-P2-7 | Publish marker blocks second send | `published:chef-morning:2026-05-30` claimed; second claim → `claimed: false`; assert log message. |

**Note on clock mocking for DV-P2-5/DV-P2-6:** `coordinationStore.ts` uses SQLite `unixepoch('now')`. Tests must directly manipulate the `expires_at` column via raw SQL (`UPDATE task_locks SET expires_at = unixepoch('now') - 1 WHERE task_id = ?`) to simulate expiry. Do NOT mock `Date.now()` — the store uses SQLite time functions.

### Test file 3: `DWF-routing-policy-fence.test.ts` (Lint/schema fence)

| Test | AC | Type |
|---|---|---|
| `docs/data/routing-policy.json` parses as valid JSON | AC-P0-2-1 | Schema |
| Catch-all rule exists as last entry with `type:"*", severity:"*", zone:"*", ticker:"*"` | AC-P0-2-3 | Schema |
| Catch-all removed → test goes RED | AC-P0-2-5 | Deliberate-violation |
| No `apps/` file imports `routing-policy` | AC-P0-2-4 | Grep assertion |

---

## routing-policy.json Design

**Location:** `docs/data/routing-policy.json`

**Rule evaluation:** first match wins (array order). All fields support `"*"` wildcard.

**Agent IDs** (from `docs/data/system-map.json`):
- cowork: `unified-agent`, `market-watcher`, `news-scout`, `alert-commander`, `tran-ngoc-bau`
- dev: `po`, `ba`, `architect`, `pm`, `developer`, `qa`
- Fallback: `po`

**Schema for each rule:**
```json
{
  "type": "<signal_type | *>",
  "severity": "<high | medium | low | *>",
  "zone": "<zone_id | *>",
  "ticker": "<TICKER | *>",
  "target_agents": ["<agent_id>"],
  "channel": "<telegram_channel_id>",
  "description": "<human-readable>"
}
```

**Rule set (Phase 0 — read-only SSOT, nothing consumes it yet):**
Rules to cover the key signal types from system-map.json:
- `type:"price_alert", severity:"high"` → `alert-commander`, channel `market`
- `type:"price_alert", severity:"medium"` → `market-watcher`, channel `market`
- `type:"macro_alert", severity:"*"` → `unified-agent`, channel `work`
- `type:"news_signal", severity:"*"` → `news-scout`, channel `work`
- `type:"bctc_signal", severity:"*"` → `po`, channel `work`
- `type:"regime_change", severity:"*"` → `unified-agent`, channel `market`
- Catch-all: `type:"*", severity:"*", zone:"*", ticker:"*"` → `po`, channel `work`

---

## pressure-state.json Emitter Design

**Location:** `docs/data/pressure-state.json` (single-row rolling, atomic write)

**Where written:** `docs/agents/cowork-team/flow/main.md` Step 4.8 (new step, after tick-snapshot Step 4.7)

**Write pattern (atomic):**
```bash
TMPFILE="docs/data/pressure-state.json.tmp"
# ... assemble JSON ...
mv "$TMPFILE" "docs/data/pressure-state.json"
```

**calendar_status source:** call `is_trading_day` via gateway (bare tool name). On failure: `calendar_status: "unknown"` (fail-safe, never blocks tick).

**signal_backlog:** `ls docs/signals/*.json 2>/dev/null | wc -l` (bash, no MCP call needed)

**dev_queue_depth:** grep `OPEN\|IN_PROGRESS` in `docs/TASKS.md` | wc -l (approximate; acceptable for Phase 0 instrumentation)

**host_headroom_mb:** `vm_stat | grep "free"` + calculation; on failure: `null`

**last_regime / last_volatility:** read from previous `cycle-snapshot-*.json` if available; fallback `"unknown"`

---

## R2 Ops Runbook Location

File: `docs/protocols/dwf-ops-runbook.md`

Content: verbatim from spec section R2 plus:
- How to verify dark window end: `task_list_held(kind="cowork-slot")` → check `owner_session` on `cowork-leader` row matches new process's pid-ts discriminator
- Do NOT manually delete stale row (race risk documented)
- Dark window duration formula: `TTL_at_restart = 1800s = 30 min max`
- Monitoring: log `"[cowork] leader lock held by peer — silent exit"` will appear on every tick during the dark window — this is expected, not a bug

---

## Risk Flags

| Risk | Severity | Mitigation |
|---|---|---|
| Step 4.6 rewrite breaks existing dispatch | HIGH | Phase 0 (schedule prune) ships first, independently. Phase 2 (flow rewrite) is a separate subtask with QA verification of all 12 enabled slots still dispatching correctly. |
| task_claim with same SERVER_SESSION_ID for both terminals | MEDIUM | Known limitation (code comment Phase 2 in coordinationTools.ts). Acceptable since mcp-server is single Docker process. Document in R2 runbook. |
| pressure-state.json atomic write failure | LOW | Write-to-tmp-then-rename is atomic at filesystem level. On failure: log and skip. Consumer in Phase 1+ checks `stale_warning`. |
| vnHolidayData.ts year boundary (2027) | LOW | `session_status: "unknown"` safe default. Yearly update process: dev-mcp-server task each October per architect note in handoff. |
| Existing DV-P2-4 code assertion (TTL grep) | MEDIUM | The grep must target the FLOW file (`docs/agents/cowork-team/flow/main.md`) not TS code — per-work-item tokens are claimed from the flow, not from server code. PM must scope DV-P2-4 accordingly. |
| cowork-schedule.json prune removes wrong slot | HIGH | AC-P0-1-3 deliberate-violation: assert one known-enabled slot (e.g. `chef-morning`) is still present after prune. QA must verify count=12 AND spot-check enabled slot_ids. |

---

## Standard Detection

`apps/mcp-server/` exists → NEW FEATURE (lean standard)
`cross-service/` config changes + flow rewrite → NEW FEATURE (lean standard)

**BUILD-STANDARD: lean**
**BUILD-STANDARD-REF:** `docs/standards/microservice-build-standard.md`
**NOTE:** dev-mcp-server drives Zone 1 end-to-end; developer drives Zone 2 (cross-service). No full relay required.

---

## Implementation Sequence (mandatory)

Phase 0 tasks MUST be done before Phase 2 tasks. Within Phase 0, FR-P0-3 (is_trading_day) must be done before FR-P0-4 (pressure-state emitter depends on it). Within Phase 2, FR-P2-5 (leader lock) and FR-P2-6 (per-work-item token) are a single atomic rewrite of Step 4.6 in the cowork flow — they cannot be split into separate subtasks because they modify the same flow step.

**PM task sequence:**

1. DWF-DEV-MCP-1: `is_trading_day` tool (FR-P0-3) — CREATE `vnHolidayData.ts`, `vnTradingCalendar.ts`, `isTradingDayTool.ts`; MODIFY `registry.ts`; CREATE test file `DWF-is-trading-day.test.ts` with DV. Rebuild mcp-server. Verify AC-P0-3-7 (toolCount +1).

2. DWF-DEV-MCP-2: routing-policy fence test (FR-P0-2 fence only) — CREATE `DWF-routing-policy-fence.test.ts`. Run against stub file to prove RED before JSON exists.

3. DWF-DEV-CROSS-1: cowork-schedule.json prune (FR-P0-1) — remove 13 dead slots; verify AC-P0-1-1..4.

4. DWF-DEV-CROSS-2: routing-policy.json (FR-P0-2) — CREATE `docs/data/routing-policy.json` per design above; run fence test → GREEN.

5. DWF-DEV-CROSS-3: pressure-state.json emitter (FR-P0-4) — add Step 4.8 to `cowork-team/flow/main.md`; calls `is_trading_day` (which requires DWF-DEV-MCP-1 to be deployed); CREATE initial `pressure-state.json` seed. Verify AC-P0-4-1..6 after first live tick.

6. DWF-DEV-CROSS-4: Phase 2 leader lock + per-work-item token (FR-P2-5 + FR-P2-6) — rewrite `cowork-team/flow/main.md` Steps 0b + 4.6; CREATE `DWF-coordination-phase2.test.ts` with all DV-P2-1..7. Update size-justification comment. Verify AC-P2-5-1..4 and AC-P2-6-1..4.

7. DWF-DEV-CROSS-5: publish marker documentation (FR-P2-7) — document the `task_claim(key="published:<slot_id>:<date>")` pattern in cowork-team flow Step 5 pre-send instructions; CREATE test DV-P2-7 in `DWF-coordination-phase2.test.ts` (already allocated above); CREATE ops runbook `docs/protocols/dwf-ops-runbook.md`.

8. DWF-QA: verify all ACs + deliberate-violation tests RED→GREEN; verify all 12 enabled slots still dispatch correctly after Phase 0; R2 ops runbook present and accurate.

---

## File Count Summary

| Action | Count | Files |
|---|---|---|
| CREATE (mcp-server) | 4 | `vnHolidayData.ts`, `vnTradingCalendar.ts`, `isTradingDayTool.ts`, 3 test files |
| MODIFY (mcp-server) | 1 | `registry.ts` |
| CREATE (cross-service) | 3 | `routing-policy.json`, `pressure-state.json` (seed), `dwf-ops-runbook.md` |
| MODIFY (cross-service) | 2 | `cowork-schedule.json`, `cowork-team/flow/main.md` |
| **Total** | **10** | |

---

## RETURN

```
DONE: Technical design complete, brownfield findings written to docs/handoffs/DWF-ARCH.md
ZONE: multi — apps/mcp-server/ + cross-service (docs/data/, docs/agents/cowork-team/flow/, scripts/agents-flow/)
NEXT: pm | break design into atomic tasks per implementation sequence above; create developer handoffs DWF-DEV-MCP and DWF-DEV-CROSS
HANDOFF: docs/handoffs/DWF-ARCH.md
PIPELINE: continue
```
