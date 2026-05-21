# TASKS.md Hardening — Three-Layer Coordination Coherence

<!-- size-justification: ~200L — architectural decision record + sprint scaffold. Read-once by po + agent-father; too interleaved to split. -->

**Date:** 2026-05-21
**Author:** agents-architect
**Status:** FINAL — ready for PO pick-up
**Precedent:** `docs/architecture-briefs/2026-05-21-task-id-format-audit.md` (16-site task-lock audit)
**Sprint refs:** Phase 1–4 task-lock SHIPPED (Phases 1–3: Sprint 1959–1961; Phase 4: Sprint 1962c)

---

## 1. Problem Statement

The system now operates three coordination layers simultaneously:

| Layer | File / Store | Role | Writer |
|-------|-------------|------|--------|
| **Plan/governance** | `docs/TASKS.md` | Human-readable backlog, status, owner | po, pm, ops, dev agents (git edit) |
| **Chain-of-custody** | `docs/signals/*.json` + `docs/signals/DASHBOARD.md` | Handoff receipts and inter-agent messaging | all agents via file write |
| **Runtime atomic guard** | `coordination.db` `task_locks` | Mutual exclusion, collision prevention | MCP tools `task_claim` / `task_heartbeat` / `task_release` |

These three layers were designed independently and have **no automated synchronization path**. With Phase 4 shipped and all 16 lock-sites wired, the task-lock layer is authoritative for runtime ownership. TASKS.md, however, has no awareness of that layer's state. This creates three divergence seams:

### Seam 1 — Status lag (task-lock → TASKS.md)

A developer agent claims `task:1954b`, works for 45 minutes, releases the lock, and commits code. TASKS.md `1954b` row still reads `BLOCKED` because no agent explicitly edits it on lock-acquire or lock-release. The po and pm read a stale BACKLOG view. Sprint planning based on a stale TASKS.md wastes a po cycle re-checking what is genuinely in-flight.

**Frequency:** Every sprint task. Impact: po spends ~10% of c-cycle reading signal files to reconstruct the real state instead of reading TASKS.md directly.

### Seam 2 — Owner field disagreement (TASKS.md owner vs task_lock owner_agent)

`task_locks.owner_agent` is set at claim time from the spawning flow (e.g. `"developer"`, `"dev-mcp-server"`). TASKS.md `Owner` column is set at sprint-planning time by pm. If the pm assigns `"dev-rag-service"` but the dispatcher routes to `"developer"` (wrong zone map), the two fields disagree silently. No enforcement exists.

**Frequency:** Observed at least once per sprint cycle (e.g. watchdog-4 ownership ambiguity between dev-rag-service and developer). Impact: po ratification checks the wrong agent's notebook for evidence.

### Seam 3 — Non-atomic TASKS.md edits (last-write-wins on main)

CLAUDE.md mandates no branches. All agents commit to `main`. When two agents (e.g. developer completing a task + pm opening the next task) both edit `docs/TASKS.md` within the same 30-second window, the second `git commit` wins. The first agent's status update is silently overwritten. The task-lock system prevents duplicate *work* but does not prevent duplicate TASKS.md *edits* — those are coordinated only by git, which is not atomic for concurrent in-flight sessions.

**Frequency:** Low (requires concurrent agent activity on same file), but non-zero during busy sprint days. Impact: task rows disappear from Done section without trace, causing po to re-triage already-closed tasks.

---

## 2. Constraints Reminder

- No branches — all work on `main` (CLAUDE.md).
- Keep SQLite + LanceDB (no cloud, final decision).
- Never hardcode values — query `docs/data/system-map.json` via jq.
- system-auditor is the canonical autonomous monitoring agent; signal bus is the canonical inter-agent channel.
- task-lock Phase 4 is fully shipped — coordination.db and all 4 MCP tools are live.

---

## 3. Options

### Option A — Janitor Cron (system-auditor reconciliation pass)

**Trigger:** system-auditor cron, new audit dimension added at a low-cadence slot (e.g. daily 03:00 UTC — off-peak, after bctcReparseJob at 02:30).

**Mechanism:**
1. system-auditor calls `task_list_held(kind="sprint-task")` via MCP.
2. For each held lock: read TASKS.md, find the row by task_id. Compare `task_locks.owner_agent` vs TASKS.md `Owner` column.
3. If status disagrees (lock held but TASKS.md shows `BACKLOG` or `Done`) → append a DASHBOARD.md row to `## po` section: `type=system_issue`, `summary="TASKS.md/lock diverge: <task_id>"`.
4. po reads the DASHBOARD row at next cycle start (Step 0 already reads DASHBOARD per flow) and manually reconciles TASKS.md.
5. After daily cron: no live-lock rows remain (TTL 3600s covers all sprint-task activity within a day), so the cron also confirms stale-lock expiry.

**Ownership:**
- Design: agents-architect (this brief).
- Implementation: agent-father adds the reconciliation pass to `docs/agents/system-auditor/handlers.md` and `docs/agents/system-auditor/audit-dimensions.md`. No code change (no new MCP tool; `task_list_held` already shipped in Phase 1).
- Operations: system-auditor runs it; po acts on DASHBOARD alerts.

**Failure mode:**
- `task_list_held` returns empty even with active locks (coordination.db unavailable → F3 degraded mode). Result: false-positive "no divergence" — janitor is silent when it should alert. Mitigation: janitor should also read `docs/pipeline-state.json` and cross-check `activeTaskId` against held locks as a secondary signal.
- TASKS.md parse fails (file corrupted by concurrent edit — Seam 3). Result: janitor aborts, logs BUG telegram. No cascading harm.

**Rollout cost:** Low. 1 flow-edit file (system-auditor handlers.md), 1 doc update (audit-dimensions.md). Zero code changes. No Docker rebuild.

**Blast radius:** Additive-only. system-auditor gains a new read-only audit pass. po gains DASHBOARD alerts. Neither TASKS.md nor coordination.db is written by the janitor. Worst case: spurious DASHBOARD rows that po closes as false-positives.

---

### Option B — Edit-Guard (task_claim wrapper around TASKS.md edits)

**Trigger:** Any agent flow step that edits TASKS.md.

**Mechanism:**
1. Before any TASKS.md edit, the agent claims a synthetic lock: `task_claim(task_id="dash:tasks-md:write", task_kind="dashboard-row", owner_agent=<self>, ttl_seconds=120)`.
2. If claim fails → another agent holds the write lock. Agent retries after 30 seconds (one retry only per fail-loud protocol). If still fails → skip TASKS.md edit this cycle, log BUG telegram.
3. On claim success: read current TASKS.md → apply edit → commit → release lock immediately.
4. The `owner_agent` field set in the lock is logged. A separate log query (`task_list_held(kind="dashboard-row")`) lets po see who last held the write token.
5. Status updates (BACKLOG → In Progress, In Progress → Done) are written atomically within the same lock window.

**Ownership:**
- Design: agents-architect (this brief).
- Implementation: agent-father must add the claim/release wrapper to every flow step that edits TASKS.md across all agents (po, pm, developer, qa, ops, agent-father, architect — at least 7 agent flows). This is a high-touch multi-file change.
- Operations: all agents participate; any agent that edits TASKS.md without the guard creates a bypass.

**Failure mode:**
- An agent crashes between claim and release. Lock expires after 120s (TTL). Next agent waits up to 2 minutes. Acceptable for low-frequency edits.
- An agent edits TASKS.md directly (bypasses wrapper — e.g. a newly written flow that didn't get the update). Guard is opt-in / honor-system until all sites are updated. Phase 4 audit precedent shows ~7 agents touch TASKS.md; partial adoption leaves gaps.
- Coordination.db unavailable (F3): all write-guards return `claimed=false` → all TASKS.md edits are blocked until DB recovers. This inverts the priority: runtime lock health becomes a prerequisite for human-visible backlog updates. **This is the critical blast radius risk.**

**Rollout cost:** High. Requires auditing every TASKS.md edit site across 7+ flow files and adding claim/release pairs. Similar scope to the 16-site Phase 3/4 audit. Estimated 1 sprint (similar to 1960c: 10 commits across 8 flows).

**Blast radius:** High risk of cascading block. If coordination.db has a brief write spike or transient lock, ALL TASKS.md edits across ALL agents are blocked simultaneously. The plan layer (TASKS.md) becomes operationally coupled to the runtime layer (coordination.db) — violating the independence principle: runtime failures should not prevent governance updates.

---

### Option C — Webhook-Style Status Echo (agent-father write-back hook)

**Trigger:** Any agent that calls `task_release` with a `completed_status` payload field (new optional field).

**Mechanism:**
1. Extend `task_release` MCP tool to accept an optional `completed_status: "done" | "blocked" | "failed"` field (one-line schema change in `taskReleaseTools.ts`).
2. The `coordinationStore.ts` release handler, on receiving `completed_status`, appends a row to a new `task_status_echo` table: `(task_id, owner_agent, completed_status, released_at)`.
3. A new lightweight cron (`taskStatusEchoJob`, fires every 15 min) reads `task_status_echo` rows with `applied_to_tasks_md = false`, performs TASKS.md status updates, sets `applied_to_tasks_md = true`.
4. TASKS.md edit is done by the cron — not by the releasing agent — which serializes writes through a single scheduler tick and eliminates the concurrent-edit race (Seam 3).
5. Owner alignment (Seam 2) is derived from `owner_agent` in the echo table, which is written from the live `task_locks` record at release time.

**Ownership:**
- Design: agents-architect (this brief).
- Implementation: agent-father + developer. Requires: (a) schema change in `coordination.db` (new `task_status_echo` table, `apps/mcp-server/src/infrastructure/db/coordinationStore.ts`); (b) `task_release` tool schema extension (`taskReleaseTools.ts`); (c) new `taskStatusEchoJob.ts` cron; (d) agent-father touches every agent flow that calls `task_release` to add `completed_status` field (opt-in — flows that omit it simply don't trigger echo). Fewer sites than Option B because only `task_release` callers are touched, not all TASKS.md editors.
- Operations: cron runs autonomously; system-auditor can verify echo lag as a new audit check.

**Failure mode:**
- Cron fires but TASKS.md is locked by a git merge conflict (concurrent commit by another agent). Cron retries next tick (15 min). At most 15-minute lag on status update — acceptable.
- Agent forgets to pass `completed_status` → echo never fires → status still lags. Mitigation: qa audit check (does `task_release` call include `completed_status`?).
- `task_status_echo` table grows unbounded. Mitigation: cron prunes applied rows older than 7 days in same pass.

**Rollout cost:** Medium. Requires code changes (3 files: coordinationStore, taskReleaseTools, new cron) + Docker rebuild + flow updates at `task_release` sites only (fewer than Option B's TASKS.md edit sites). Estimated 1 sprint smaller than 1960c.

**Blast radius:** Contained. The cron is additive. TASKS.md edits by the cron are serialized through a single writer (the cron). Coordination.db unavailability delays echoes but does not block the human-readable governance layer — po can still manually edit TASKS.md. Runtime failure degrades echo latency, not TASKS.md writability.

---

## 4. Comparison Matrix

| Criterion | Option A (Janitor Cron) | Option B (Edit-Guard) | Option C (Echo Cron) |
|-----------|------------------------|----------------------|---------------------|
| Seam 1 (status lag) | Detects — alerts po, does not auto-fix | Prevents at write time (correct status required at edit) | Auto-fixes with ≤15 min lag |
| Seam 2 (owner disagreement) | Detects — alerts po | Detects at write time (claim-holder owner_agent visible) | Auto-fixes — echo copies live owner_agent from lock record |
| Seam 3 (non-atomic edits) | Does not address | Prevents (write-lock serializes edits) | Prevents (single cron writer) |
| Implementation cost | Low (flow edit only) | High (7+ flow files) | Medium (3 code files + flow edits at release sites) |
| Blast radius on DB failure | Janitor silent | TASKS.md edits blocked system-wide | Echo delayed, governance layer independent |
| Rollout risk | Minimal | High | Moderate |
| Autonomy (no po action needed) | No (po must act on alerts) | Yes (enforced) | Yes (auto-applies) |
| Reversible | Yes (remove audit pass) | Hard (must un-wire 7+ sites) | Yes (cron can be disabled; manual edits continue) |

---

## 5. Recommendation

**Adopt Option A now; design Option C for Sprint 1966+.**

Rationale:

1. Option B is ruled out. Coupling `coordination.db` health to TASKS.md writability violates the independence principle between runtime and governance layers. A transient coordination.db write spike would block all sprint plan updates — a higher-severity failure than the status-lag problem it solves.

2. Option C is the right long-term fix for all three seams. However, it requires code changes and a Docker rebuild — which is gated behind the 1959-watchdog-4 soak window (unlocks 2026-05-22T21:00Z) and current dev-team WIP constraints. Implementing it alongside the BCTC 1954-series or 1948 series would create WIP conflict.

3. Option A is implementable today with zero code changes. It surfaces divergence within 24 hours, gives po the data to reconcile manually, and sets up observable evidence for whether Option C is actually needed. If the janitor fires ≤2 times per week, Option C can be deferred indefinitely. If it fires daily, that is the empirical proof that auto-fix (Option C) is justified.

**Combined rollout path:**

- **Phase 1 (Option A):** agent-father adds janitor reconciliation pass to system-auditor. po acts on DASHBOARD alerts.
- **Phase 2 (Option C, deferred post-soak):** developer implements `task_status_echo` table + cron + `task_release` schema extension. Retire Option A janitor once Option C is observed stable for 7 days.

---

## 6. Acceptance Criteria

### Phase 1 (Option A) — Janitor Cron

| AC | Check | Pass condition |
|----|-------|---------------|
| AC-1 | system-auditor daily 03:00Z pass calls `task_list_held` | `task_list_held` appears in system-auditor session log at 03:00Z±5min |
| AC-2 | Divergence detected → DASHBOARD row created | When a sprint-task lock is held with TASKS.md status ≠ `In Progress`, a row appears in `## po` section within 24h |
| AC-3 | No divergence → no DASHBOARD row | Clean day produces zero false-positive rows in `## po` |
| AC-4 | system-auditor cross-checks pipeline-state.json | If `task_list_held` returns empty but `pipeline-state.json` `activeTaskId` is non-null, a DASHBOARD alert is emitted |
| AC-5 | Seam 3 detection | If two TASKS.md commits land within 30s on the same row, system-auditor detects via `git log --all --oneline -- docs/TASKS.md` and alerts |

### Phase 2 (Option C) — Echo Cron

| AC | Check | Pass condition |
|----|-------|---------------|
| AC-6 | `task_release` with `completed_status` populates echo table | Row in `task_status_echo` within 1s of release call |
| AC-7 | Echo cron updates TASKS.md within 15 min of release | TASKS.md row status matches `completed_status` within one 15-min cron tick |
| AC-8 | Owner field synced | TASKS.md `Owner` column matches `task_status_echo.owner_agent` after sync |
| AC-9 | Seam 3 eliminated | Zero concurrent TASKS.md commits in any 30-second window (single cron writer) |
| AC-10 | Echo table pruned | `task_status_echo` rows with `applied_to_tasks_md=true` AND `released_at < NOW()-7d` are deleted in same cron pass |
| AC-11 | coordination.db failure does not block manual TASKS.md edits | When coordination.db returns unavailable, cron logs BUG telegram and skips — human editors can still commit to TASKS.md |

---

## 7. Sprint Scaffold

PO picks up Phase 1 immediately; Phase 2 after soak unlock.

| Row | Task ID | Title | Type | Owner | Depends | Est |
|-----|---------|-------|------|-------|---------|-----|
| a | 1965a | Design system-auditor TASKS.md reconciliation pass (add to handlers.md + audit-dimensions.md) | TASK | agent-father | — | 1h |
| b | 1965b | Implement + smoke: janitor fires at 03:00Z, calls task_list_held, emits DASHBOARD row on divergence | TASK | dev-mcp-server | 1965a | 2h |
| c | 1965c | QA: verify AC-1..AC-5 across 2 observation days | OBSERVE | qa | 1965b | 48h soak |
| d | 1966a | (deferred post-soak) Developer: task_status_echo table + task_release schema extension + taskStatusEchoJob cron | TASK | dev-mcp-server | 1959-watchdog-4-soak-done + 1965c-pass | 3h |
| e | 1966b | QA: verify AC-6..AC-11 over 2 sprint cycles | OBSERVE | qa | 1966a | 48h |

**Gate:** 1965c must PASS before 1966a is dispatched. If 1965c shows janitor fires ≤2 times in 48h, po may defer 1966a indefinitely.

---

## 8. Files to Modify (agent-father action list)

Phase 1:
- `docs/agents/system-auditor/handlers.md` — add `## TASKS.md Reconciliation Pass` section (trigger: daily 03:00Z cron tick)
- `docs/agents/system-auditor/audit-dimensions.md` — add dimension D4: TASKS.md/task-lock coherence (checks: task_list_held cross-check, pipeline-state cross-check, git log concurrent-commit detection)

Phase 2 (deferred):
- `apps/mcp-server/src/infrastructure/db/coordinationStore.ts` — add `task_status_echo` table migration + insert/query/prune functions
- `apps/mcp-server/src/interface/mcp/tools/taskReleaseTools.ts` — extend `task_release` schema with optional `completed_status` field
- `apps/mcp-server/src/interface/schedules/taskStatusEchoJob.ts` — new cron (15 min interval, single TASKS.md writer)
- `apps/mcp-server/src/interface/schedules/cronConfig.ts` — register `taskStatusEchoJob`
- `apps/mcp-server/src/interface/schedules/startScheduler.ts` — wire `taskStatusEchoJob`
- All agent flow files that call `task_release` — add optional `completed_status` field (8+ sites from Phase 3/4 audit)

**No implementation in this brief — signal to agent-father for all file changes.**
