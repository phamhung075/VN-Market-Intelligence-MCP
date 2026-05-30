<!-- size-justification: 310L — Phase 0 + Phase 2 dual-scope with 7 deliverables, 3 blocking ACs (R1/R3 deliberate-violation proof, R2 ops runbook), DDD layer map per FR, and ops invariant table; all load-bearing for architect briefing -->

# REQ_DYN-WF-FOUNDATION — Multi-Session-Safe Orchestration + Demand-Driven SSOT Instrumentation

**Sprint:** DYN-WF-FOUNDATION
**Status:** SPEC COMPLETE — ready for architect (DWF-ARCH)
**Author:** ba · 2026-05-30
**Input:** `docs/SPRINT_GOAL.md` § DYN-WF-FOUNDATION · `docs/TASKS.md` § DYN-WF-FOUNDATION · `docs/architecture-briefs/2026-05-29-dynamic-workflow-architecture.md` (Sections 1–7 + agents-architect Review 2026-05-30)
**Zone:** multi — `apps/mcp-server/` (is_trading_day tool, coordination seam) + `cross-service/` (cowork/dev-team flow, schedule slots, routing-policy.json, pressure-state.json)

---

## Overview

The fleet is a static cron-tick machine with a session-scoped master cron (SPOF). Two failure modes are live: (A) multiple CLI sessions each hold `*/15` and run the same dispatch (caused 4× chef-morning duplicate publish, 2026-05-29); (B) one session retries an un-confirmed spawn under launch lag. This sprint closes both modes while standing up read-only SSOTs that a later adaptive-cadence phase will consume.

**Implementation sequence is non-negotiable: Phase 0 → Phase 2 → (Phase 1 blocked, not this sprint).**

Phase 1 (adaptive cadence) is explicitly OUT OF SCOPE. Do not attempt to build or partially wire Phase 1 deliverables. Phase 1 is registered as a blocked follow-up task (DWF-PHASE1) in TASKS.md and unblocks only after Phase 2 cutover is QA-signed-off stable.

---

## Glossary

| Term | Definition |
|---|---|
| `slot_id` | Stable work-identity string for a cowork schedule slot (e.g. `chef-morning`). Never contains a time-bucket or tick suffix. |
| `cowork-leader` | The task_claim key for the leader lock — exactly one session leads per tick interval. |
| `cowork-slot:<slot_id>` | The task_claim key for a per-work-item idempotent token. Suffix-free by definition. |
| `published:<work-id>` | Server-side marker checked before send_telegram to prevent duplicate Telegram posts. |
| TTL | time-to-live in seconds passed to task_claim; controls how long a lock holds without renewal before it expires and can be stolen. |
| Heartbeat renewal | task_heartbeat call extending a held lock; the master cron firing IS the heartbeat for the leader lock. |
| Leader lock dark window | Period after mcp-server force-recreate during which no session can renew or re-claim the leader lock (old PID no longer matches owner_session); bounded by leader TTL ≈ 30 min. |
| Dead slot | A schedule slot in cowork-schedule.json whose `enabled: false` and which has either an explicit `_disabled_by` reason or a Phase stub marker. It fires no work and creates confusion in the live slot table. |
| PressureState | Single-row rolling JSON snapshot emitted per tick: signal backlog, last regime/volatility, calendar status, dev-queue depth, host headroom. Instrument-only this sprint — no decision path reads it. |

---

## Phase 0 — Instrument + SSOT Cleanup

**Contract:** Zero behavior change. Every existing cowork/dev-team tick fires exactly as before. Phase 0 deliverables are additive-only or pruning-only; no existing dispatch path is modified.

### FR-P0-1 — Prune dead schedule slots

**DDD layer:** Infrastructure (configuration data, no domain logic)

Remove all permanently-disabled slots from `docs/data/cowork-schedule.json` so the slot table reflects live reality. The cowork dispatcher must never iterate over disabled slots.

Dead slots to remove (all have `enabled: false` with permanent-disable reasons):

| slot_id | Disabled reason |
|---|---|
| `digest-monday-predict` | Sprint 1950-T5 — Monday window removed, permanent |
| `financial-analyst-morning` | bctc-analyst-merge H-18 — superseded, DO NOT re-enable |
| `financial-analyst-midday` | bctc-analyst-merge H-18 — superseded, DO NOT re-enable |
| `news-scout-market` | API_MIN_INTERVAL — sub-hourly cron is unsupported by platform |
| `market-watcher-market` | API_MIN_INTERVAL — sub-hourly cron is unsupported by platform |
| `market-watcher-prepost` | API_MIN_INTERVAL — sub-hourly cron is unsupported by platform |
| `alert-commander-market` | API_MIN_INTERVAL — sub-hourly cron is unsupported by platform |
| `daily-seed` | Phase 1 stub — Phase 1 not in this sprint's scope, defer to DWF-PHASE1 |
| `delivery-cron-danger` | Phase 1 stub — Phase 1 not in this sprint's scope, defer to DWF-PHASE1 |
| `delivery-cron-normal` | Phase 1 stub — Phase 1 not in this sprint's scope, defer to DWF-PHASE1 |
| `monthly-recap` | Phase 1 stub — Phase 1 not in this sprint's scope, defer to DWF-PHASE1 |
| `yearly-recap` | Phase 1 stub — Phase 1 not in this sprint's scope, defer to DWF-PHASE1 |

After pruning, 14 enabled slots remain: `chef-morning`, `chef-intraday`, `chef-eod`, `chef-evening`, `digest-sunday`, `tnb-audit`, `bctc-analyst-slot-1` through `bctc-analyst-slot-4`, `news-scout-offhours`, `news-scout-sentiment`, `market-watcher-offhours`, `market-watcher-eod`.

**Acceptance criteria:**

- AC-P0-1-1: `jq '[.slots[] | select(.enabled == false)] | length' docs/data/cowork-schedule.json` returns 0 after pruning.
- AC-P0-1-2: `jq '[.slots[] | select(.enabled)] | length' docs/data/cowork-schedule.json` returns exactly 14 after pruning.
- AC-P0-1-3: No slot removed has `enabled: true` — deliberate-violation: cherry-pick one enabled slot's slot_id and assert it is still present in the post-prune file.
- AC-P0-1-4: The JSON file parses without error (`jq . docs/data/cowork-schedule.json > /dev/null`).

**Edge cases:**

- Phase 1 stub slots (`daily-seed`, `delivery-cron-*`, `monthly-recap`, `yearly-recap`) are removed NOW because Phase 1 is not this sprint. If/when Phase 1 ships (DWF-PHASE1), those slots will be added back with correct design. Removing them now prevents the dispatcher from maintaining dead code paths.
- Do NOT remove `_notes` or `_open_questions` metadata from the JSON root — only remove slot objects from the `slots` array.

---

### FR-P0-2 — Read-only routing-policy.json SSOT

**DDD layer:** Infrastructure (policy data file, consumed by nothing yet)

Create `docs/data/routing-policy.json` as a deterministic, read-only mapping table. The table maps a signal envelope `(type, severity, zone, ticker)` to target agent(s) + Telegram channel + severity. Nothing consumes this file in this sprint — it is an SSOT built for Phase 3 (deferred). Its existence proves the envelope axes are enumerable and the table is feasible.

**Schema requirements:**

- Root key `routing_policy` containing an array of rule objects.
- Each rule object contains: `type` (signal type string or `"*"` wildcard), `severity` (string or `"*"`), `zone` (string or `"*"`), `ticker` (string or `"*"`), `target_agents` (array of agent_id strings), `channel` (Telegram channel id string), and `description` (human-readable string).
- Rules are evaluated in array order; first match wins.
- Wildcard `"*"` matches any value on that axis.
- Final rule must be a full-wildcard catch-all that routes to `po` (PO is the fallback for genuine ambiguity, per brief OQ-6 and CLAUDE.md §3).
- The router MUST be deterministic. An LLM/semantic classifier is explicitly forbidden by CLAUDE.md §3 — "NEVER guess an agent type."

**Acceptance criteria:**

- AC-P0-2-1: File exists at `docs/data/routing-policy.json` and parses as valid JSON (`jq . docs/data/routing-policy.json`).
- AC-P0-2-2: Every distinct `(type, severity, zone)` combination documented in `docs/data/system-map.json` signal types is covered by at least one rule (wildcard coverage acceptable).
- AC-P0-2-3: A catch-all rule (`type:"*", severity:"*", zone:"*", ticker:"*"`) exists as the last entry and routes to `po`.
- AC-P0-2-4: No existing code file imports or reads `routing-policy.json` (file is consumed by nothing — grep for `routing-policy` in `apps/` must return zero hits).
- AC-P0-2-5: Deliberate-violation fence: a CI/lint check (or a bun test) asserts the file is valid JSON and contains the catch-all — if the catch-all is removed, the test goes RED. This proves the fence is not a false-green.

**Edge cases:**

- Agent ids in `target_agents` must match agent ids in `docs/data/system-map.json` — architect validates this at design time.
- Ticker-specific rules (e.g., route VNH alerts to `alert-commander` zone `agriculture`) are optional in Phase 0 but the schema must support them.

---

### FR-P0-3 — is_trading_day tool (new mcp-server tool)

**DDD layer:** Infrastructure (external calendar data source) → Application (tool interface)

Add a new read-only MCP tool `is_trading_day` to mcp-server. This tool is the VN exchange open/holiday/half-day SSOT. It does NOT exist today — `get_macro_calendar` covers macro events only, not HOSE/HNX session status.

This tool is a Phase 0 prerequisite. The calendar-SSOT deliverable (pressure-state.json calendar field) depends on it.

**Tool contract:**

```
is_trading_day(date?: string /* ISO 8601 YYYY-MM-DD, defaults to today VN time */) → {
  date: string,           /* YYYY-MM-DD in VN timezone (GMT+7) */
  is_trading_day: boolean,
  session_status: "open" | "holiday" | "half_day" | "weekend" | "unknown",
  exchange: "HOSE" | "HNX",   /* HOSE is primary; HNX follows same calendar */
  note?: string           /* e.g. holiday name in Vietnamese */
}
```

**Acceptance criteria:**

- AC-P0-3-1: `is_trading_day(date="2025-01-27")` returns `is_trading_day: false, session_status: "holiday"` (Tết Nguyên Đán 2025 — known VN national holiday). Verified via gateway wrapper `mcp__claude_ai_gateway__call_tool(server="vn-market", tool="is_trading_day", arguments={date:"2025-01-27"})`.
- AC-P0-3-2: `is_trading_day(date="2025-01-04")` returns `is_trading_day: true, session_status: "open"` (a known HOSE trading day).
- AC-P0-3-3: `is_trading_day(date="2025-01-11")` returns `is_trading_day: false, session_status: "weekend"` (a Saturday).
- AC-P0-3-4: The tool is read-only — it writes nothing to the database.
- AC-P0-3-5: The tool is reachable via the gateway wrapper (bare tool name `is_trading_day`). Direct `mcp__vn-market__is_trading_day` calls are forbidden (per CLAUDE.md gateway rule).
- AC-P0-3-6: Deliberate-violation: calling with a known holiday date and asserting `is_trading_day: true` must make a test go RED (proves the holiday data source is not a stub returning always-true).
- AC-P0-3-7: `toolCount` in mcp-server container increases by exactly 1 after rebuild (verify via in-container tool list before and after).

**Data source:**

- Architect decides the VN holiday data source. Options: embed a fixed calendar JSON (HOSE published schedule, updated yearly); call a public API. The embedded fixed calendar is preferred (no network dependency, no geo-block risk, deterministic). Architect must specify in DWF-ARCH brief.

**Edge cases:**

- Half-day sessions (e.g., day before Tết): `session_status: "half_day"`, `is_trading_day: true`. Trading windows are shortened; this information is SSOT but Phase 0 does not act on it.
- Unknown date (future, calendar not yet published): return `session_status: "unknown"`, `is_trading_day: false` (safe default — assume closed if unknown).
- Timezone: all dates interpreted in VN time (GMT+7). A Saturday in France is still a Saturday in VN — no ambiguity except at midnight GMT+7 boundaries. Tool must convert `date` param assuming VN timezone.

---

### FR-P0-4 — Per-tick pressure-state.json (instrument-only)

**DDD layer:** Infrastructure (data file emitted by dispatcher, consumed by nothing)

Emit a single-row rolling JSON file `docs/data/pressure-state.json` at each cowork tick. The file is written atomically (write-to-temp then rename). No decision path reads it in Phase 0 — it is purely observational instrumentation.

**Schema:**

```json
{
  "emitted_at": "<ISO 8601 UTC timestamp>",
  "tick_id": "<floor-15min bucket, e.g. 2026-05-30T20:45:00Z>",
  "signal_backlog": <integer — count of unprocessed signals in docs/signals/>,
  "last_regime": "<string from last cycle snapshot — e.g. 'volatile' | 'stable' | 'unknown'>",
  "last_volatility_level": "<string — e.g. 'high' | 'medium' | 'low' | 'unknown'>",
  "calendar_status": "<string from is_trading_day.session_status — e.g. 'open' | 'holiday' | 'weekend' | 'unknown'>",
  "dev_queue_depth": <integer — count of open tasks in TASKS.md with status OPEN or IN_PROGRESS>,
  "host_headroom_mb": <integer or null — available host RAM in MB; null if unreadable>,
  "stale_warning": <boolean — true if this row is more than one tick (>15 min) older than wall clock>
}
```

**Acceptance criteria:**

- AC-P0-4-1: After one cowork tick, `docs/data/pressure-state.json` exists and parses as valid JSON.
- AC-P0-4-2: `emitted_at` is a valid ISO 8601 UTC timestamp within 60 seconds of the tick firing time.
- AC-P0-4-3: `calendar_status` is populated by calling the new `is_trading_day` tool (FR-P0-3); it is NOT the hardcoded `02:00-08:59 UTC` window logic.
- AC-P0-4-4: No code outside the cowork dispatcher emitter reads `pressure-state.json` to make a routing or spawn decision. A grep for `pressure-state` in `apps/` and `.claude/skills/` must return zero hits outside the emitter.
- AC-P0-4-5: The file is written atomically (write temp file → rename/move) so a reader never sees a partial JSON write.
- AC-P0-4-6: If `is_trading_day` call fails, `calendar_status` is set to `"unknown"` and the file is still emitted (fail-safe, never blocks the tick).

**Edge cases:**

- Stale file: if the dispatcher crashes mid-tick and the file was not updated, `stale_warning: true` on the next successful tick prevents consumers in future phases from acting on stale data.
- `host_headroom_mb: null` is valid — host memory probe is best-effort, never blocks tick emission.
- Storage: single JSON file, never a SQLite table. Disk-bloat history (project_disk_full_lancedb_bloat) + write-wedge history (project_mcp_server_write_wedge) both argue against a new always-growing table for a single-row rolling state.

---

## Phase 2 — Leader Lock + Idempotent Per-Work-Item Token

**Contract:** Closes the duplicate-publish class and the session-scoped SPOF. Reuses existing `task_claim` / `task_heartbeat` / `task_release` with kind `cowork-slot`. No new tool, no new kind enum value. Behavior change: each tick now has a cross-session leader election step before dispatch, and each per-work-item spawn is gated on an idempotent token.

**Primitive availability confirmed by agents-architect:** `coordinationStore.ts` + `coordinationTools.ts` implement `task_claim`, `task_heartbeat`, `task_release`, `task_list_held`. Live kinds: `cowork-slot | sprint-task | dashboard-row | commit-mutex`. The `commit-mutex` enum drift is resolved via `migrateCoordinationTable()`. No new kind needed.

---

### FR-P2-5 — Leader lock (cowork-leader)

**DDD layer:** Application (orchestration layer — cross-session dispatch coordination)

Before the master dispatch body executes, the cowork dispatcher must claim the leader lock. A session that loses the claim exits silently. A session that wins proceeds with dispatch and renews the lock at each subsequent tick.

**Lock parameters:**

- `task_claim(kind="cowork-slot", key="cowork-leader", ttl_seconds=<2 × heartbeat_interval>, owner_agent="cowork-dispatcher")`
- Heartbeat interval = 15 min (the `*/15` tick floor). Therefore `ttl_seconds = 1800` (30 min).
- On WIN: proceed with dispatch body; the tick firing IS the renewal (implicit heartbeat via next tick reclaim pattern or explicit `task_heartbeat` call — architect decides which is cleaner).
- On LOSE: log "[cowork] leader lock held by peer — silent exit" and return immediately, no dispatch.
- On TTL-expired stale steal: standard INSERT-OR-IGNORE + stale-steal in `coordinationTools.ts` handles this — no special code needed.

**Acceptance criteria:**

- AC-P2-5-1: With two simulated concurrent leaders (two callers both attempting `task_claim(key="cowork-leader")`), exactly ONE wins and ONE loses per attempt window. The loser receives a non-claimed response and does not execute dispatch. Deliberate-violation: two callers both asserting they won must be impossible — a test that asserts both callers `claimed: true` must go RED.
- AC-P2-5-2: After the leader session exits (simulate by releasing the lock), the standby session wins on the next `task_claim` attempt.
- AC-P2-5-3: The leader TTL is exactly `1800` seconds (2 × 15-min heartbeat). Relying on the default (3600s) is forbidden — the explicit TTL argument must be present in the dispatch code.
- AC-P2-5-4: When the leader lock is held and a non-leader session calls the dispatch body, it exits before spawning any agent (zero spawns from the losing session — assert no Agent() calls were made).

**Edge cases:**

- If `task_claim` itself fails (network/DB error): fail-loud + silent exit for this tick. Do not proceed with dispatch without a confirmed lock win.

---

### FR-P2-6 — Per-work-item idempotent token (cowork-slot:\<slot_id\>)

**DDD layer:** Application (orchestration layer — per-work-item dedup)

Before each agent spawn or publish action, the cowork dispatcher claims a per-work-item idempotent token. The key is derived from the work identity alone — never from the tick time or dispatch attempt.

**BLOCKING requirement R3: key MUST be suffix-free.**

The per-work-item key MUST be `cowork-slot:<slot_id>` with NO nominal-tick or time-bucket suffix. For example:
- CORRECT: `key="cowork-slot:chef-morning"`
- FORBIDDEN: `key="cowork-slot:chef-morning@2026-05-30T05:15:00Z"`
- FORBIDDEN: `key="chef-morning:2026-05-30T05:15"`

A tick suffix changes the key at each 15-min boundary, allowing a peer to re-launch a still-running job by acquiring the "new" key for the next bucket. This recreates the original bug in a subtler form. Hold-through-duration is handled by TTL + renewal, never by the key.

**BLOCKING requirement R1: explicit short TTL, never the default.**

Every per-work-item `task_claim` MUST pass `ttl_seconds=180` (approximately one flow step, ~3 min) explicitly. The `coordinationTools.ts` default is `ttl_seconds=3600` (1 hour). Relying on the default would hold the lock for a full hour after a 30-second crash — a one-hour starvation surface. This is not acceptable.

The lock lifecycle:
1. `task_claim(kind="cowork-slot", key="cowork-slot:<slot_id>", ttl_seconds=180)` — BEFORE spawn/publish
2. Win → proceed with spawn/publish → renew via `task_heartbeat` at each major flow checkpoint (after each major step in the agent flow)
3. Complete → `task_release(task_id="cowork-slot:<slot_id>")`
4. Crash → renewals stop → lock frees after one short TTL (≤180s) regardless of intended job length

**Lock parameters:**

- `task_claim(kind="cowork-slot", key="cowork-slot:<slot_id>", ttl_seconds=180, owner_agent="cowork-dispatcher")`
- On WIN: spawn/publish proceeds; agent flow renews at checkpoints; release on completion
- On LOSE (already claimed): skip spawn — the work item is already running or being processed. Log "[cowork] slot <slot_id> already claimed — skip duplicate spawn"
- A 20-min dev chain and a 1-min market tick use the SAME short TTL (180s) — the long chain just renews more times

**Acceptance criteria:**

- AC-P2-6-1 (R3 proof): A retry of an un-confirmed per-work-item spawn re-computes the SAME key `cowork-slot:chef-morning` and is rejected by `task_claim` (INSERT OR IGNORE returns not-claimed). Deliberate-violation: a test showing that using `cowork-slot:chef-morning@<tick>` as the key WOULD allow a duplicate through (the tick-suffixed key is not already held) — this test must go RED when the suffix is removed, proving the suffix-free key closes the window.
- AC-P2-6-2 (R1 proof — explicit-TTL path): The `task_claim` call in the dispatch code contains the literal argument `ttl_seconds: 180` (or equivalent constant). A code-level test or lint check asserts the TTL argument is always present on per-work-item claims. Deliberate-violation: remove the `ttl_seconds` argument → the test goes RED (proving the default-3600 path is blocked).
- AC-P2-6-3 (R1 proof — crash frees within TTL): A per-work-item claim set with `ttl_seconds=180` that receives no heartbeat renewals expires within 180 seconds. A test: claim with 180s TTL, wait 181s without heartbeat, assert `task_claim` for the same key now returns `claimed: true` for a new claimant. Deliberate-violation: set TTL=3600 → the same test at 181s returns `claimed: false` (still locked), proving the default would starve for an hour.
- AC-P2-6-4: No per-work-item `task_claim` in the implementation uses a key that contains a time-bucket, tick timestamp, or tick suffix. Grep for the claim call sites and assert key patterns are `cowork-slot:<static_slot_id>` only.

**Edge cases:**

- Slot not in schedule (slot_id unknown): fail-loud, do not spawn, do not claim.
- `task_claim` fails (DB error): fail-loud, skip spawn for this slot this tick (do not proceed without confirmed token).

---

### FR-P2-7 — Published marker belt (published:\<work-id\>)

**DDD layer:** Application (publish gate — Telegram dedup)

Before calling `send_telegram`, the dispatcher checks a server-side `published:<work-id>` marker. If the marker is already set, the `send_telegram` call is skipped. If not, the marker is set and `send_telegram` proceeds.

This is the last line of defense against the most user-visible failure: duplicate Telegram posts. It is belt-and-suspenders with the per-work-item token — the token prevents duplicate spawns, the publish marker prevents duplicate publishes in case a spawn somehow executes twice.

**Marker key:** `published:<work-id>` where `work-id` uniquely identifies the content being published (e.g., `chef-morning:2026-05-30` — date is acceptable here as it identifies the CONTENT being published, not the dispatch attempt; a new morning dish on a new date is genuinely a different work-id).

**Note on key design:** The published marker uses a date suffix on the work-id because it identifies CONTENT identity (one morning dish per date is correct semantics). This is distinct from the per-work-item dispatch token (FR-P2-6) which must be suffix-free because it identifies a RUNNING INSTANCE that should not be re-launched. The two keys serve different purposes and must not be conflated.

**Acceptance criteria:**

- AC-P2-7-1: A `send_telegram` call for `work-id=chef-morning:2026-05-30` is allowed to proceed the first time (marker not yet set).
- AC-P2-7-2: A second `send_telegram` call for the same `work-id` is blocked — the publish marker is already set. Log "[cowork] publish blocked — already published work-id=chef-morning:2026-05-30". Deliberate-violation: a test that removes the marker check and asserts both calls go through must go RED when the check is present.
- AC-P2-7-3: A `send_telegram` call for a DIFFERENT `work-id` (e.g., `chef-morning:2026-05-31`) proceeds normally — the marker is per-work-id, not global.
- AC-P2-7-4: The published marker is stored server-side (in the vn-market DB via a task_claim-compatible mechanism or a dedicated publish log — architect decides the storage mechanism). It must NOT be stored in a local file (session-local files are not cross-session truth).

**Edge cases:**

- If the marker check itself fails (DB error): fail-loud, skip publish for this tick (safe default — rather miss a post than duplicate it).
- Marker expiry: architect decides TTL for published markers (24h or per-slot cycle length). The marker should expire naturally to allow the next day's dish to publish.

---

## R2 — Ops Runbook: Leader-Lock Dark Window After mcp-server force-recreate

**Status: NON-BLOCKING — must be documented before Phase 2 ships.**

`SERVER_SESSION_ID` in `coordinationTools.ts` is `pid-<pid>-ts-<startupMs>` — process-level and stable within one container lifetime. A Docker `force-recreate` of the mcp-server container (the standard wedge-recovery procedure) resets the PID. The new process cannot renew the old leader lock via `task_heartbeat` because `WHERE owner_session = ?` no longer matches the stale row's `owner_session`.

**Operational invariant:** Force-recreating the mcp-server container causes a leader-lock dark window equal to the leader lock's TTL at the moment of restart. With `TTL = 1800s` (30 min, per FR-P2-5), the maximum dark window is 30 min. During this window, no session wins the leader lock via normal claim (INSERT OR IGNORE fails against the stale row; stale-steal requires `expires_at < now`).

**Ops runbook (must be committed as part of Phase 2 deliverables):**

1. When performing mcp-server `force-recreate` (wedge recovery): note the current time.
2. The leader lock dark window begins immediately and ends at `current_time + leader_TTL` (at most 30 min after the restart).
3. During the dark window, cowork dispatch ticks fire on `*/15` but the leader election step will find no active leader and cannot claim until the stale row expires. Ticks are silently skipped.
4. No manual intervention is required. The stale row TTL expires naturally; the next tick after expiry elects a new leader.
5. To confirm dark window end: observe `task_list_held` returning the new process's `owner_session` on the `cowork-leader` key.
6. Do NOT attempt to manually delete the stale row to shorten the dark window — this risks a race condition with a legitimate claim attempt.

This behavior is a known architectural limitation of the process-level session discriminator (marked Phase 2 in `coordinationTools.ts` source for future SDK sessionId integration). It is acceptable given that the mcp-server is a single Docker process and force-recreate is a recovery-only operation, not routine.

---

## Non-Functional Requirements

| ID | Requirement | Phase | DDD Layer |
|---|---|---|---|
| NFR-1 | Zero behavior change for Phase 0 — existing ticks fire identically before and after. Verified by QA asserting all 14 enabled slots still dispatch correctly post-prune. | P0 | Infrastructure |
| NFR-2 | Phase 0 changes are additive-only or pruning-only (no logic change to dispatch). | P0 | Infrastructure |
| NFR-3 | Phase 2 leader lock and per-work-item token must not introduce measurable latency (the claim calls are sub-second SQLite operations). | P2 | Application |
| NFR-4 | All new locks and policies ship with deliberate-violation tests (RED-before/GREEN-after in the SAME commit as the production code). "exit 0" is not acceptance (per feedback_fence_false_green). | P0+P2 | Application |
| NFR-5 | No new SQLite audit-growth table for PressureState. Single-row JSON only. | P0 | Infrastructure |
| NFR-6 | No new `task_claim` kind enum value. Use `cowork-slot` for both leader lock and per-work-item tokens. | P2 | Application |
| NFR-7 | `commit-mutex:main` stays the single default commit mutex. No per-zone commit lanes in this sprint. | P2 | Infrastructure |
| NFR-8 | MCP tools accessed only via `mcp__claude_ai_gateway__call_tool` wrapper (bare tool names). Never `mcp__vn-market__*`. | P0+P2 | Interface |
| NFR-9 | All structural data queried from `docs/data/system-map.json` via jq — never hardcoded values in code. | P0 | Infrastructure |
| NFR-10 | Phase 1 (adaptive cadence) does NOT start until Phase 2 cutover is QA-signed-off stable (DWF-QA gate). | P2 | Application |

---

## Blockers

None — all questions are answered by the architecture brief and the agents-architect review. The following items are architect-deferred (design decisions, not PO questions):

- **ARCH-DECIDE-A:** Data source for `is_trading_day` holiday calendar (embedded JSON vs. public API). Embedded fixed calendar recommended — no network dependency, no geo-block risk.
- **ARCH-DECIDE-B:** Leader lock renewal mechanism — explicit `task_heartbeat` call per tick vs. reclaim pattern (each tick claims fresh, old stale row expires). Brief §7 says "the master cron firing IS the heartbeat renewal" — architect confirms implementation detail.
- **ARCH-DECIDE-C:** Storage mechanism for `published:<work-id>` marker — reuse `task_claim` with a `published-marker` kind, or a dedicated `published_log` table. Must be server-side (cross-session truth).
- **ARCH-DECIDE-D:** Published marker TTL — 24h or per-slot cycle length. Architect decides based on dish frequency.

---

## DDD Layer Summary

| Deliverable | FR | DDD Layer |
|---|---|---|
| Prune dead slots from cowork-schedule.json | FR-P0-1 | Infrastructure |
| routing-policy.json read-only SSOT | FR-P0-2 | Infrastructure |
| is_trading_day MCP tool | FR-P0-3 | Infrastructure → Application |
| pressure-state.json per-tick emitter | FR-P0-4 | Infrastructure |
| Leader lock (cowork-leader) | FR-P2-5 | Application |
| Per-work-item idempotent token (cowork-slot:\<slot_id\>) | FR-P2-6 | Application |
| Published marker belt (published:\<work-id\>) | FR-P2-7 | Application |
| R2 ops runbook (dark window) | — | Infrastructure (ops documentation) |

---

## Deliberate-Violation Test Matrix (Phase 2 — All 3 Blocking ACs)

Each test must land in the SAME commit as the production code it proves. All tests must go RED before the fix and GREEN after.

| Test ID | What it proves | RED condition | GREEN condition |
|---|---|---|---|
| DV-P2-1 | Single-winner leader lock (R-LEADER) | Two `task_claim(key="cowork-leader")` callers both assert `claimed: true` — test passes (WRONG) | Only one caller gets `claimed: true`; test asserts exactly 1 winner |
| DV-P2-2 | Suffix-free key closes duplicate window (R3) | `cowork-slot:chef-morning@<tick>` key does NOT conflict with a held `cowork-slot:chef-morning@<prior-tick>` — second claim succeeds (WRONG) | `cowork-slot:chef-morning` (no suffix) is already held; second claim returns `claimed: false` |
| DV-P2-3 | Tick-suffix-would-leak counter-test (R3) | No suffix: second claim with same key correctly blocked | With tick suffix: second claim with new bucket key succeeds (demonstrates the suffix recreates the bug) — this RED is the counter-test proving suffix-free is necessary |
| DV-P2-4 | Explicit TTL path (R1 — code assertion) | `ttl_seconds` argument absent from per-work-item claim → no lint/test failure (WRONG) | Lint/test asserts `ttl_seconds: 180` is always present; removing it → test goes RED |
| DV-P2-5 | Crash frees within 180s, not 3600s (R1) | TTL=3600: claim held for >180s without heartbeat; second claim at 181s returns `claimed: false` (starvation — WRONG for short-TTL case) | TTL=180: second claim at 181s without heartbeat returns `claimed: true` (lock freed) |
| DV-P2-6 | Default-3600 would starve for an hour (R1 counter-test) | TTL=180 (correct): freed at 181s — proves short TTL works | TTL=3600 (default): still locked at 181s — demonstrates the default would cause 1-hour starvation |
| DV-P2-7 | Published marker blocks second send_telegram | Marker check absent: second send proceeds (WRONG) | Marker present: second send for same work-id is blocked and logged |
