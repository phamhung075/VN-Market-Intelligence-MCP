# Dynamic Workflow Architecture — From Static Cron-Tick Fleet to Demand-Driven Orchestration

**Date:** 2026-05-29
**Author:** workflow analysis (5 parallel subsystem mappers → 1 synthesizer)
**Status:** PROPOSAL — needs agents-architect review + PO sign-off before any implementation
**Scope:** Re-architect the fleet's orchestration layer (cowork-team + dev-team + signal bus + scheduling + per-agent flows) from fixed wall-clock cron to event/load/dependency-driven activation.

---

## 1. Current State (what we have today)

A **static cron-tick fleet on two clocks**:

| Plane | Mechanism | Cadence |
|---|---|---|
| A (Claude Code CLI) | `CronCreate` master dispatcher | `*/15` cowork tick, `:07` hourly dev-team, 1 cron per maintenance agent |
| B (mcp-server) | 64 node-cron jobs | various |

**The tick is the only clock.** Nothing is event-driven:
- **cowork-team** `*/15` reads a 26-slot JSON table (~12 enabled), matches each slot's cron string to a floor-15min bucket, claims a per-slot lock, writes a shared snapshot, then parallel-spawns due agents in one Agent block. Common path = **SILENT empty-match** (git log shows long runs of these).
- **dev-team** `:07` claims tasks, walks a fixed `po→ba→architect→pm→dev→qa` chain, WIP≤2; its `type→route` table degenerates to **"everything → PO"**.
- **Signal bus** = `docs/signals/*.json` files + `DASHBOARD.md` markdown inbox, **poll-drained** at the next tick (emit→consume latency up to one full cycle, 6h+ observed).
- **Routing** = two hand-maintained markdown tables; **dependencies are faked** as fixed time gaps (chef-eod `depends_on` = a 24-min clock spacing, not a real edge).

### Core limitations
1. **Cadence decoupled from reality** — same tick rate during a flash crash and a dead off-market night; SILENT ticks burn scheduling + git-commit churn while urgent fixes wait ~60 min.
2. **No wake-on-write** — fresh high-severity signal sits un-ACK'd until the next downstream tick. The gateway is request/response (connections dropped per call) so there is no server-push into the CLI session.
3. **Routing is hand-maintained markdown**, not content-addressed — dev-team `type→route` collapses to PO; adding one agent needs lockstep edits to dispatch table + DASHBOARD + schedule slots + cron skill.
4. **Fake dependencies** — a late/failed upstream still feeds the downstream stale data.
5. **No host-resource awareness** — flat WIP≤2, fire-all-slots parallel fan-out ignores the 16GB kernel-panic history; mass-spawn under launch-confirm lag caused 4× duplicate chef-morning publish (2026-05-29).
6. **Single session-scoped master cron = SPOF** — evaporates on CLI restart; documented RemoteTrigger backstop was live-falsified as empty.
7. **Single global `commit-mutex:main`** serializes ALL fleet commits through one git index.

---

## 2. Design Principles

| Principle | Rationale |
|---|---|
| **Heartbeat + adaptive cadence, not a daemon** | A true event loop is impossible (gateway request/response; 16GB host kernel-panics under load). Keep cron but demote it to a slow heartbeat whose **first action** computes desired-cadence from a cheap pressure read. |
| **Demand-gating before fan-out** | Every spawn gated on "is there real work?" (fresh data / new signal / regime change / non-empty queue). Off-market path = sub-second probe + silent exit. |
| **Content-addressed routing** | The signal envelope already carries `(type, severity, zone, ticker)`. One policy file maps envelope → target agent(s) + channel. PO reserved for genuine ambiguity. |
| **Real dependency DAG** | Replace faked time-gaps + static `type→chain` with `depends_on` edges keyed on **completion signals**. Ready node dispatches next tick; planner SKIPS stages whose outputs already exist. |
| **Backpressure as scheduler input** | Spawn budget from live host headroom + conflict-graph width, not flat WIP≤2. Guaranteed/high-priority preempt; low-priority defer. |
| **Idempotency on launch-confirm, not time bucket** | Move the lock key to a spawn-attempt token (work-item id + dispatch nonce) via existing `task_claim` so retries under lag re-claim the same key and are rejected — closes the duplicate-publish class structurally. |
| **Preserve-and-reuse** | Lazy-load, notebook memory, signal envelope, off-market guards, commit-mutex, `po→…→qa` chain, `task_claim` lock are load-bearing — new components wrap them. System degrades to today's behavior if every dynamic input is unavailable. |

---

## 3. Proposed Architecture

`cron tick = work` → **`cron heartbeat → consult state → compute action`**. No new always-on daemon. The existing `*/15` heartbeat (kept as a floor) calls a deterministic **Cadence Policy Engine**; most ticks become near-free.

### Components

| Component | Responsibility | Replaces |
|---|---|---|
| **Pressure Probe** | Cheap single-pass script (extends `cowork-match-slots.js`): reads PressureState — signal backlog, last regime/volatility from reused snapshot, VN calendar status, dev-queue depth, host memory headroom. Sub-second; no MCP fan-out on empty path. | Unconditional `get_cycle_bootstrap`/`get_macro_snapshot` every productive tick. |
| **Cadence Policy Engine** | Pure fn `(policy_id, PressureState) → desired_cadence`; per-agent due = `now - last_fired >= cadence`. Slots become `{agent, policy_id, last_fired, guaranteed}`. | Hardcoded 5-field cron strings + fixed `*/15`. |
| **Freshness/Regime Gate** | Runs regime+volatility+calendar+data-delta detection **before** spawn; reuses shared snapshot across ticks, refetch only on staleness/regime-change; downgrades unchanged gatherers to silent. | Post-decision Step 4.7 snapshot fetch + inert never-built tick-snapshot reuse path. |
| **Content-Addressed Router** | `routing-policy.json` maps envelope `(type, severity, zone, ticker)` → target agent(s) + Telegram channel + severity; PO only on low confidence. | Hand-maintained dispatch table + dev-team "everything → PO". |
| **Workgraph (DAG store)** | Persistent `workgraph.json` of work items with `depends_on` edges closing on completion signals; ready-set scheduler dispatches satisfied nodes; planner skips done stages. | Per-cycle ephemeral Tier grouping + static `type→chain` + 24-min fake gaps. |
| **Backpressure Governor** | Spawn budget from host memory headroom (vs Docker 8GB cap / panic history) + conflict-graph width; preempt high-priority, defer low-priority. | Flat WIP≤2 + unconditional fire-all fan-out. |
| **Idempotent Spawn Token + Leader Lock** | `task_claim` keyed on launch-attempt token; persistent server-side leader-lock lets any live session run the heartbeat. | Per-slot lock that can't dedup retries (4× dup publish) + session-scoped SPOF. |
| **VN Trading-Calendar Service** | SSOT for exchange open/holiday/half-day, consulted by Probe + Gate. | Hardcoded `02:00-08:59 UTC` window duplicated in cron strings AND E2 guards. |

### Degradation contract
PressureState unreadable → static cron fallback. Router low-confidence → PO. Host-headroom unknown → WIP≤2. **The system is never worse than today and is reversible at every phase.**

---

## 4. Migration Phases

**Mandatory implementation sequence: 0 → 2 → 1 → (3 → 4 → 5 deferred).** Phase 1 (adaptive cadence) MUST NOT ship before Phase 2 (leader lock). Phase 1 without Phase 2 raises market-hours fire rates, opening more collision windows — strictly worse than today. Phase 2 is the prerequisite gate for Phase 1.

| Phase | Scope | Risk |
|---|---|---|
| **0 — Instrument & SSOT cleanup** | Prune dead schedule slots; stand up `routing-policy.json` + VN-calendar tool as read-only SSOTs nothing consumes yet; emit PressureState doc each tick without acting. Zero behavior change. | Very low |
| **2 — Idempotent spawn token + leader lock** *(ships before Phase 1)* | Switch per-work-item lock key to stable work-item identity (`cowork-slot:<slot_id>`, no tick suffix); explicit short TTL (~180 s) on every per-work-item claim; persistent leader-lock removes SPOF. Closes duplicate-publish + SPOF. | Medium — TTL auto-expiry + heartbeat-renew prevent stuck leader |
| **1 — Heartbeat consults Cadence Policy (cowork)** *(ships after Phase 2)* | Slots gain `policy_id`+`last_fired`; matcher uses `due = now-last_fired >= cadence(pressure)` with old cron as fallback. Calendar suppression + freshness silent-downgrade. SILENT off-market ticks become near-free. | Medium — guaranteed-floor + static fallback mitigate under-firing |
| **3 — Content-addressed router (dev-team first)** *(deferred)* | Replace "everything → PO" with policy lookups (zoned bug → specialist, complete-brief → skip ba/architect); central channel/severity; pre-publish verify gate. Then cowork intent table. | Med-high — shadow-mode until N cycles agree, then flip |
| **4 — Persistent workgraph + ready-set** *(deferred)* | Persist DAG with completion-signal edges; ready-set decouples readiness from linear walk; cowork pipeline (news→market→chef→tnb) as DAG. | High — keep per-cycle recompute as SSOT, workgraph.json as rebuildable cache |
| **5 — Backpressure governor + per-zone commit lanes** *(deferred)* | Size spawn budget from host headroom; preemption; optional per-zone commit lanes for disjoint zones. | High — commit-mutex:main stays default; lanes opt-in for proven-disjoint sets only |

---

## 5. Risks

- **No true wake-on-write achievable** — gateway request/response + no daemon → latency improves only to one heartbeat interval. The design cuts **waste** far more than worst-case new-signal latency.
- Cadence mis-tuning could starve a guaranteed agent → guaranteed-floor needed (second cadence concept to keep consistent).
- New locks/policies are new **false-green surfaces** — each must ship with a deliberate-violation proof, not "exit 0" (per `feedback_fence_false_green`).
- Persisting the workgraph reintroduces the stale-state hazard that bit `pipeline-state.json` (OBSOLETE nextAgent) → treat as rebuildable cache.
- Content-routing trusts envelope metadata correctness → pre-publish verify gate becomes load-bearing, must be non-bypassable.
- Per-zone commit lanes touch the most history-scarred mechanism (`commit-mutex:main`) → single mutex stays default.
- Snapshot reuse risks stale regime during a fast flip → freshness gate must err toward refetch on volatility spikes.

---

## 6. Open Questions (need PO / agents-architect decision)

1. Can the `*/15` heartbeat floor safely shorten to `*/5` on the CLI CronCreate plane without tripping the `API_MIN_INTERVAL` limit that already disabled the market-hours slots? Or must sub-15-min responsiveness come from a different primitive?
2. Is a persistent (non-session-scoped) leader process tolerable on the 16GB host, or must the leader-lock be claimed opportunistically only by whatever CLI session is live (accepting dark windows)?
3. Where should PressureState + workgraph.json live — extend `signals.db` (SQLite) vs new JSON files — given disk-bloat/LanceDB history + need for atomic cross-session reads?
4. Authoritative source for host memory-headroom (Docker stats vs host `vm_stat`), cheap enough per heartbeat?
5. Does a VN trading-calendar tool exist in vn-market today, or must it be added before Phase 0?
6. Should the router be a **deterministic policy table** (auditable, cheap) or a **semantic/LLM classifier** (handles free-text but reintroduces a non-deterministic dispatch surface CLAUDE.md forbids — "NEVER guess an agent type")?

---

## 7. Multi-Session Concurrency (Phase 2 detail)

**Problem:** multiple live CLI sessions can each hold the same session-scoped `*/15` cron and run the same dispatch; and one session can re-spawn an un-confirmed job under launch lag. Both cause duplicate execution (the 4× chef-morning publish, 2026-05-29).

**Invariant:** sessions cannot see each other — `CronList`, in-flight spawns, and optimistic file writes are all session-local. The **only** cross-session truth is the **vn-market backend DB** (one process behind the gateway), reached via `task_claim`. Every dedup decision MUST route through it. Filesystem is a weak surface (last-write-wins clobber).

### Two collision modes, one primitive

| Mode | Cause | Fix scope |
|---|---|---|
| A — Two live sessions | Both fire the same tick | Leader lock |
| B — One session, retry under lag | Slow launch-confirm → re-spawn | Per-work-item idempotent token |

**Layer 1 — Leader lock.** Before the master dispatch body: `task_claim(key="cowork-leader", ttl)`. Win → lead this tick + renew. Lose → silent exit. Dead leader → TTL expiry → a standby wins next tick. Fixes double-dispatch **and** the session-scoped SPOF in one move (any live session can lead).

`kind` for the leader lock: `cowork-slot` (existing kind — no new enum value needed; `migrateCoordinationTable()` has already resolved the `commit-mutex` enum drift; live kinds are `cowork-slot | sprint-task | dashboard-row | commit-mutex`).

**Ops invariant (R2):** `SERVER_SESSION_ID` is `pid-<pid>-ts-<startupMs>` — process-level and stable within one container lifetime. A Docker `force-recreate` of the mcp-server (the standard wedge-recovery procedure) resets the PID, so the new process cannot renew the old leader lock via `task_heartbeat` (WHERE `owner_session` no longer matches). The lock is held by the stale row until its TTL elapses. **Ops must treat force-recreate as causing a leader-lock dark window equal to the leader TTL.** With `TTL ≈ 2× heartbeat` (e.g., 30 min for a 15-min heartbeat), this is the maximum dark window. Document this in the Phase 2 runbook; do not shorten by guessing — keep TTL at the 2× heartbeat formula and accept the bounded window.

**Layer 2 — Per-work-item idempotent token.** Claim a key derived from the **work identity alone, not the dispatch attempt** — `task_claim(key="cowork-slot:<slot_id>")` — **before** spawn/publish. Example: `key="cowork-slot:chef-morning"` (NO tick suffix). A retry recomputes the identical key → claim rejected by INSERT OR IGNORE → duplicate prevented.

The old per-slot lock keyed on a time-bucket failed because a fresh bucket appeared at each 15-min boundary, orphaning the lock of a still-running long job and allowing a peer to re-launch. The correct key is the **work item's stable identity** (`cowork-slot:chef-morning`), not a time-stamped variant. The lock is held for the job's real duration via TTL + renewal — not via the key.

**Mandatory TTL requirement (R1 — no default reliance):** `task_claim` defaults to `ttl_seconds=3600` (1 hour). A per-work-item claim using the default would hold the lock for a full hour even if the job crashes in the first 30 seconds — a one-hour starvation window. **Every per-work-item `task_claim` MUST pass an explicit short TTL (~180 s).** `TTL > renewal interval`, never `TTL ≈ job duration`. The Phase 2 implementation must never omit the TTL argument on a per-work-item claim; the 3600 s default is only acceptable for contexts where a long starvation window is tolerable (it is not acceptable here).

**Belt for publish:** server-side `published:<work-id>` marker checked before `send_telegram` — cheap insurance against the most user-visible failure (duplicate Telegram posts). Standing rule still applies: **do not retry an un-confirmed spawn** (`feedback_spawn_retry_under_lag`); the token makes a retry *safe*, not retrying is the first line of defense.

### Lease & TTL — lease + renewal, NOT estimate-as-TTL

One fixed TTL for all jobs is wrong (1-min market tick vs 20-min dev chain). But **agent-estimated TTL is also wrong** — an LLM self-estimate is unreliable, and an underestimate expires the lock *mid-work* → a peer re-runs the job = the exact duplicate-execution bug we are killing. Betting the lock lifetime on the estimate optimizes the wrong variable.

**Correct pattern (etcd/k8s-Lease/Chubby): short lease + renew-while-working + release-on-done.** Then `TTL > renewal interval`, NOT `TTL > job duration`:
- Job runs long → it just renews more times (self-correcting, zero penalty for a bad estimate).
- Agent crashes → renewals stop → lock frees after **one short TTL**, regardless of intended job length.

The job's real duration is handled by **renewal count**, not a guessed up-front number.

**Where the estimate legitimately fits** — hint + guardrail, never the expiry boundary:
- Initial lease hint: `TTL_init = max(min_lease, estimate × 1.5)` so a sub-interval job needs no renewal.
- Runaway ceiling: max-renewals cap → a stuck loop (renewed 200×) gets force-reclaimed + flagged, not held forever.

**Per lock type:**
- **Leader lock** — the master cron *is* the heartbeat; each firing renews. `TTL ≈ 2× heartbeat` (survives one missed tick). No estimate needed. See ops invariant above (R2) for the dark-window bound on mcp-server restart.
- **Per-work-item lock** — the spawned agent renews at **natural flow checkpoints** (after each major flow step) and **releases on completion**. `TTL` = explicit short constant (~180 s, i.e., ~one flow step); crash detected within one step, independent of total length. A 20-min chain and a 1-min tick use the **same** short TTL — the long one just renews more. **Never omit the TTL argument; never rely on the 3600 s default.**

**`task_claim` kind:** use `cowork-slot` for both leader and per-work-item tokens. No new kind is required. The `commit-mutex` enum drift is resolved in the current codebase via `migrateCoordinationTable()` — agents can use `commit-mutex` today without a CHECK constraint failure.

---

*Next step: `po` for phase prioritization. Implementation sequence MUST follow **0 → 2 → 1**; Phase 1 is blocked on Phase 2 cutover. agents-architect review complete (2026-05-30) — see review section below.*

---

## agents-architect Review (2026-05-30)

**Reviewer:** agents-architect
**Review date:** 2026-05-30T12:29:42Z
**Verdict:** CONDITIONAL ADOPT — adopt 0+2+1 ordering is safe with two corrections; defer 3/4/5 confirmed; Section 7 has two exploitable race windows that must be closed before Phase 2 ships.

---

### 1. Phase Cut Verdict: adopt 0+2+1, defer 3/4/5

**The cut is correct in content but the ordering has one dependency risk.**

Phase 0 (instrument + SSOT cleanup) has zero dependencies and zero behavior change — safe to ship first, no objections.

Phase 2 (idempotent spawn token + leader lock) depends on `task_claim` being functional. It is. The four tools (`task_claim`, `task_heartbeat`, `task_release`, `task_list_held`) are fully implemented in `coordinationStore.ts` + `coordinationTools.ts`. The `commit-mutex` kind enum drift (noted in `project_commit_mutex_enum_drift`) has been resolved: `migrateCoordinationTable()` performs an in-place schema migration at startup to add `'commit-mutex'` to the CHECK constraint. The current live enum is `cowork-slot | sprint-task | dashboard-row | commit-mutex`. No new kind is needed for leader-lock or per-work-item tokens under the existing kinds — both can use `cowork-slot` (leader) and `cowork-slot` or `sprint-task` (work item), per the existing workaround noted in the brief's own gotcha.

**Ordering correction:** Phase 2 MUST ship before Phase 1, not after. This is the reverse of the "adopt 0+2+1" label in the recommendation. Here is why: Phase 1 (adaptive cadence) changes the firing rate and introduces `last_fired` tracking. If Phase 1 fires first without Phase 2's leader lock, two live sessions running at different adaptive cadences will each compute `due = now - last_fired >= cadence` independently and both may spawn. The adaptive cadence logic amplifies the collision risk (higher fire rate during market hours means more collision windows, not fewer). Phase 2's leader lock is the prerequisite gate for Phase 1 — Phase 1 without Phase 2 is strictly worse than today. Correct sequencing: **0 → 2 → 1**.

**Deferred phases confirmed:**
- Phase 3 (content router): correctly deferred. CLAUDE.md §3 "never guess an agent type" and "every intent maps to a real agent in dispatch skill" makes a content-addressed routing policy that bypasses PO structurally illegal until the policy table can be proven deterministic and exhaustive. Shadow-mode validation is the right gate. No objection to deferral.
- Phase 4 (persistent workgraph DAG): correctly deferred. `pipeline-state.json` stale-state failure is the direct analogy; DAG cache with completion-signal edges has an additional failure mode — a signal that never arrives (crashed agent) leaves a dependent node permanently blocked. The brief's "rebuildable cache" mitigation is necessary but must be designed before Phase 4 ships. No objection to deferral.
- Phase 5 (backpressure governor): correctly deferred. Without Phase 0 pressure data, any spawn-budget formula is an LLM estimate — exactly the problem the brief identifies for TTL estimation. No objection to deferral.

**No dependency between deferred and adopted phases that breaks the cut.** The adopted set (0+2+1) is self-contained. The deferred set requires the adopted set's outputs (PressureState from Phase 0, stable leader semantics from Phase 2, cadence data from Phase 1) but does not feed back into them.

---

### 2. Adversarial Review: Section 7 Multi-Session Concurrency

Section 7's design is architecturally sound at the layer level. The two-layer model (leader lock + per-work-item token) and the lease+renewal pattern are the right primitives. However, there are **three concrete failure windows** that the design does not close.

**Race window R1 — Claim-then-crash before first heartbeat (the briefest gap).**

The per-work-item flow is: `task_claim` succeeds → agent spawns child → child crashes before first `task_heartbeat`. The lock holds until TTL expires. The brief recommends a short TTL (~2–3 min per step). For the chef-morning job, the next cowork tick fires at T+15. If TTL is 2–3 min, the lock has already expired before the next tick and a new session correctly wins. So R1 is handled by the short-TTL recommendation — **but only if the TTL is actually set short**. The current `coordinationTools.ts` defaults to `ttl_seconds=3600` (1 hour). A caller who does not pass an explicit short TTL on a per-work-item claim will hold the lock for a full hour even if the job crashes in the first 30 seconds. The brief prescribes "short constant (~one step, 2–3 min)" but does not enforce it — the tool allows 3600 as a default. **This is a false-green surface.** The Phase 2 implementation spec must mandate an explicit short TTL for per-work-item claims and must never rely on the default.

**Race window R2 — Leader lock vs. server-side session discriminator.**

The `coordinationTools.ts` `SERVER_SESSION_ID` is `pid-<pid>-ts-<startupMs>`. This is stable within one process lifetime and correctly distinguishes OS processes. However: `heartbeatTask()` uses `WHERE task_id = ? AND owner_session = ?`. If the mcp-server **restarts** while a session holds the leader lock (e.g., Docker container recreated, which ops does for wedge recovery), the new process gets a new `SERVER_SESSION_ID`. The old lock row still has the old `owner_session`. The new server process cannot renew the lock it logically should own because `owner_session` no longer matches. The lock will not expire until the original TTL elapses. During that window, no session can win the leader lock via normal claim (INSERT OR IGNORE fails; stale-steal requires `expires_at < now`). The leader-lock dark window equals the TTL of the leader lock at the moment of restart. The brief recommends `TTL ≈ 2× heartbeat` for the leader lock — if heartbeat is 15 min, TTL is 30 min, meaning a server restart causes a 30-minute leader-lock dark window. This is known and acceptable (the brief acknowledges dark windows under the persistent-leader-process constraint, Open Question 2), but it must be documented as an explicit operational invariant: ops must know that force-recreating the mcp-server container resets the session discriminator and causes a TTL-length blackout on the leader lock.

**Race window R3 — Per-work-item token key collision across nominal ticks.**

The brief proposes keying the per-work-item lock as `task_claim(key="chef-morning@<nominal-tick>")`. The `nominal-tick` is presumably the floor-15min bucket (e.g., `2026-05-30T05:15:00Z`). If a job runs longer than one tick (e.g., the dev-team chain takes 30+ min), the nominal tick for the next dispatch is `2026-05-30T05:30:00Z` — a different key — so a new session can launch a second instance of the same work item even though the first has not completed. The per-work-item key must be derived from the **work identity** (slot_id alone, not slot_id + tick), with the lock released only on completion or TTL expiry. Using a time-bucket suffix in the key recreates the original bug in a subtler form: instead of the key expiring too early (old bug), the key changes to a fresh slot at each tick boundary, bypassing the held lock. The brief's own framing says "keyed on work, not attempt" — the `@<nominal-tick>` suffix contradicts this. The correct key is `cowork-slot:chef-morning` (no tick suffix), relying on TTL + renewal to distinguish a genuinely fresh dispatch from a hung duplicate.

---

### 3. Feasibility Against Real System Constraints

**task_claim + task_heartbeat + task_release: fully implemented and usable today.**

Source: `apps/mcp-server/src/infrastructure/db/coordinationStore.ts` + `apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts`.

Key confirmed facts:
- `task_claim` exists with INSERT OR IGNORE + stale-steal protocol. Four kinds supported: `cowork-slot`, `sprint-task`, `dashboard-row`, `commit-mutex`. No new kind needed for leader-lock (use `cowork-slot`) or per-work-item token (use `cowork-slot` or `sprint-task`).
- `task_heartbeat` exists and implements the renewal pattern exactly as Section 7 specifies: `UPDATE SET expires_at = unixepoch('now') + ttl_seconds WHERE task_id = ? AND owner_session = ?`. Renewal extends from current time by the original TTL. The lease+renewal model is fully operational — this is NOT a new capability to build.
- `task_release` exists and is scoped to the calling session's `SERVER_SESSION_ID` — cannot accidentally release another session's lock.
- The `commit-mutex` enum drift (noted in `project_commit_mutex_enum_drift`) is resolved in the current codebase via `migrateCoordinationTable()`. Agents who attempted `task_claim` with kind `commit-mutex` previously received a CHECK constraint failure; this is now fixed.
- **The `SERVER_SESSION_ID` is process-level, not per-request** (Phase 2 in the code comment acknowledges this and plans to use SDK sessionId when available). This means all tool calls from the same mcp-server process share one session discriminator regardless of which Claude Code session is calling. Two different Claude Code terminals hit the same mcp-server process and get the same `SERVER_SESSION_ID`. The leader lock distinguishes sessions by `owner_agent`, not `owner_session`, when both terminals use the same agent name. This partially defeats the session-scoped isolation guarantee — the heartbeat check `AND owner_session = ?` will pass for either terminal if they send from the same process. This is a known limitation documented in the code; it means the leader lock for Phase 2 will function at the process level (one Docker mcp-server), not the Claude Code session level. In practice this is adequate since the mcp-server is a single Docker process, but it must be noted.

**VN trading-calendar tool (Open Question 5): does NOT exist today.**

The only calendar tool is `get_macro_calendar` which returns macro economic events (FOMC, SBV meetings, CPI/PMI releases) — not exchange open/close/holiday status. VN market hours are currently hardcoded as the `02:00–08:59 UTC` window duplicated in cron strings and E2 guards (exactly as the brief diagnoses). A VN exchange holiday/trading-day SSOT tool must be built before Phase 0's "stand up VN-calendar tool as read-only SSOT" deliverable. Phase 0 is therefore not purely zero-risk: it includes one new dev-mcp-server task (add `is_trading_day` or equivalent tool) which is in scope for a dev sprint, not a config change.

---

### 4. Open Questions — Answerable from Codebase

**OQ-5 (VN trading calendar tool exists today?):** ANSWERED — NO. `get_macro_calendar` covers macro events, not HOSE/HNX open/close/holiday. A dedicated `is_trading_day` tool must be added to `dev-mcp-server` as part of Phase 0. Route to PM as a Phase 0 task prerequisite.

**OQ-6 (deterministic policy table vs. LLM classifier for router?):** ANSWERED — deterministic policy table only. CLAUDE.md §3 "NEVER guess an agent type" is a hard constraint. A semantic/LLM router is forbidden by project policy regardless of its accuracy. This is not a trade-off to evaluate; it is a constraint. The router must be a deterministic `routing-policy.json` with PO as the fallback for ambiguous envelopes.

**OQ-3 (PressureState + workgraph.json storage — extend signals.db vs. new JSON?):** PARTIAL. The disk-bloat/LanceDB history (`project_disk_full_lancedb_bloat.md`) and the mcp-server write-wedge history (`project_mcp_server_write_wedge.md`) both argue against a new always-growing SQLite table for PressureState. PressureState is a single-row rolling snapshot, not an audit log — a single JSON file (`docs/data/pressure-state.json`) written atomically per tick is the right fit. It is cheap, human-readable, and the stale-state hazard is bounded to one tick's latency (not unbounded like pipeline-state.json was). Workgraph.json is higher risk and should remain deferred (Phase 4). Recommend: PressureState → JSON file; workgraph → deferred decision at Phase 4 onset.

**OQ-1 (can `*/15` safely shorten to `*/5`?):** PARTIALLY ANSWERABLE. The `API_MIN_INTERVAL` block that disabled sub-hourly RemoteTrigger slots (recorded in `spike_1951a_oq1` and cowork-schedule.json notes) applied to RemoteTrigger, not CronCreate. The current master is a CronCreate. There is no documented API_MIN_INTERVAL constraint on CronCreate frequency in the codebase. However, a `*/5` CronCreate means 12 ticks per hour vs. the current 4, tripling git commit churn and session-scoped cron noise. With Phase 2's leader lock in place (only one session leads per tick), the churn is bounded. Sub-15-min responsiveness from `*/5` CronCreate is feasible without the RemoteTrigger block — but should be validated empirically after Phase 2 is stable, not as a Phase 1 change. Not a blocker for the adopted phases.

**OQ-2 (persistent non-session-scoped leader process tolerable on 16GB host?):** UNANSWERABLE from codebase — requires PO/ops decision. The kernel-panic history (`project_host_memory_panic.md`, Docker capped 8GB) means any always-on process is a host risk. The brief's recommended model (leader claimed opportunistically by whatever live session wins, dark windows acceptable) is the safer choice given the host's track record. This review recommends the opportunistic-leader model (accept dark windows) over a persistent daemon.

---

### 5. Summary of Blocking Issues Before Phase 2 Ships

| Issue | Severity | Required Action |
|---|---|---|
| R3 — per-work-item key must NOT include nominal-tick suffix | BLOCKING | Phase 2 spec must mandate `cowork-slot:<slot_id>` as key (no tick), relying on TTL+renewal to hold through the work item's duration |
| R1 — default ttl_seconds=3600 is too long for per-work-item claims | BLOCKING | Phase 2 spec must mandate explicit short TTL (~180s) for per-work-item claims; the Phase 2 implementation must not rely on the tool default |
| Phase ordering: 2 must precede 1 | BLOCKING | Recommendation label "0+2+1" is correct in content; implementation must sequence Phase 2 cutover before Phase 1 adaptive cadence goes live |
| OQ-5 — VN calendar tool missing | Phase 0 prerequisite | Route to PM as a new dev-mcp-server task before Phase 0 "calendar SSOT" deliverable can close |

**R2** (server restart / session-discriminator mismatch on leader lock) is non-blocking but must be documented as an operational invariant before Phase 2 ships. Ops must know: force-recreate of mcp-server container causes a TTL-length leader-lock dark window (target: 30 min or less given 2× heartbeat recommendation).

**The session-discriminator being process-level rather than Claude Code session-level** is a known limitation in the current code (marked Phase 2 in source). For leader-lock correctness this is acceptable since a single mcp-server Docker process is the cross-session truth point. For per-work-item tokens it is also acceptable. No additional action needed for Phase 2 other than documentation.

---

*Signal: agent-father to implement Phase 0 once PO approves. Phase 2 spec must incorporate R1/R2/R3 corrections before dev-mcp-server task is created. Phase 1 blocked on Phase 2 cutover.*
