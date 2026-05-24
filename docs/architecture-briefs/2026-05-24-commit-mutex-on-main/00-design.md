---
title: "Commit-Mutex / Advisory Lock on main — Structural Fix Design"
date: "2026-05-24"
author: "architect"
status: "AWAITING-PO-RATIFICATION"
commission_signal: "docs/signals/po-20260524T023538Z-commit-mutex-structural-fix-commission.json"
po_decision_doc: "docs/po-decisions/2026-05-24-fleet-rollout-post-pilot3-terminal.md"
frozen_anchor: "debba8eaff0724d1fb32fc9d28640201cc32d1cc"
---

# Commit-Mutex / Advisory Lock on main — Structural Fix Design

Design-only. No implementation until PO ratifies. This document proposes only; ratification is a
separate PO step; implementation is a separate developer task.

---

## 1. Problem Statement

The VN-Market factory runs many concurrent pilot agents (kinh-dich, alert-engine, api-gateway,
pdf-extractor, rag-service, news-fetch) that all commit to a single `main` branch with a shared
git index. Each Claude Code process shares one working-tree index on disk. This produces a
race window:

```
Agent-A: git add <own paths>        ← index now contains A's files
Agent-B: git add <own paths>        ← CONCURRENT — index now contains A + B
Agent-A: git diff --cached          ← sees only own files (B staged after A checked)
Agent-B: git diff --cached          ← sees A's files bundled in
Agent-A: git commit                 ← commits A's files + B's files (silent contamination)
Agent-B: git commit                 ← may commit empty or partial B
```

The `git diff --cached --name-only` verify + `git restore --staged <foreign>` mitigation reduces
but does not eliminate this leak because a concurrent `git add` can land in the window between
the verify and the commit. This has produced at minimum 7 confirmed bundling incidents this session.

### What the interim policy does (and its cost)
Interim FLEET-WIDE SINGLE-COMMITTER SERIALIZATION: at most one worker may be in the
stage-through-commit phase fleet-wide. This is safe but serializes the entire worker lifecycle
(minutes-long build/test phases that have no index conflict risk). Throughput cost: two concurrent
pilots must take turns for minutes-long build/test work even though that work does not touch the
shared index.

### What the commit-mutex does differently
The race window is only the seconds-long critical section: `git add <own paths>` through
`git commit`. Everything before (read, build, test, generate) and after (signal emit) is
lock-free. The mutex serializes ONLY that critical section, letting build/test phases of two
pilots overlap freely.

---

## 2. Constraints (hard — must not be violated)

| Constraint | Source |
|---|---|
| NO git branches | CLAUDE.md + every pilot charter constraints_binding_day_0 |
| NO git worktrees | Same — worktrees require branches |
| All commits land on `main` | Fleet invariant |
| NEVER `git reset HEAD <foreign>` inside or outside the lock | PO ratification / incident-2 clause |
| Anchor `debba8eaff0724d1fb32fc9d28640201cc32d1cc` stays ancestor of HEAD | PO charter |
| No `--force`, `--no-verify`, `--no-gpg-sign`, `push --force` | Dev-standards |
| Explicit-path staging only — NEVER `git add -A` or `git add .` | L84 policy |

---

## 3. Candidate Mechanism — `coordination.db` Advisory Row

### 3.1 Why coordination.db rather than a lockfile

`coordination.db` already exists at `data/coordination.db` and is the established fleet-wide
coordination bus (task-lock system, 4 MCP tools: task_claim / task_heartbeat / task_release /
task_list_held). It provides:

- Atomic row upsert (SQLite WAL mode, single writer at a time by design).
- Built-in TTL + heartbeat for stale-lock reclaim (same pattern as sprint-task locks).
- Observable state: any agent can query who holds the lock without filesystem inspection.
- Already loaded in all dev-zone agents via the task-lock skill.

A raw `flock`-on-lockfile approach would work but gives no visibility, no TTL, and no
heartbeat — it would produce indefinite deadlock if a holder crashes. `coordination.db` gives
crash recovery for free.

### 3.2 New lock kind: `commit-mutex`

Add a fourth `task_kind` value to the existing task-lock system:

```
task_kind:   "commit-mutex"
task_id:     "commit-mutex:main"   (singleton — there is exactly one per fleet)
ttl_seconds: 60                    (commit window is seconds; 60s is generous)
```

#### Why TTL=60s

A commit critical section (git add explicit paths + git diff --cached verify + git commit via
heredoc) completes in 2–10 seconds under normal conditions. 60 seconds provides 6× headroom
for slow disk I/O, hook execution, or process scheduling jitter while still detecting a crashed
holder within one minute. The task_claim TTL is the ONLY stale-lock reclaim trigger — no
external watchdog needed.

### 3.3 Critical section boundary

The mutex wraps ONLY this critical section (seconds):

```
LOCK BOUNDARY START
  git add <exact own paths — never -A/./dir>
  git diff --cached --name-only  → verify (abort+release if foreign found)
  git commit -m "$(cat <<'EOF' ... EOF)"
LOCK BOUNDARY END
```

Everything outside this boundary is lock-free:
- Read / explore / build / test / generate
- Emit signal files (they are never staged during another agent's commit window)
- task_heartbeat for sprint-task / cowork-slot locks (different lock kind, no conflict)
- git tag (tag-only ops are index-free)

### 3.4 Protocol (pseudo-code — implementable as a shared flow step)

```
## commit-mutex acquire
result = task_claim(
  task_id:     "commit-mutex:main",
  task_kind:   "commit-mutex",
  owner_agent: "<agent-id>",
  ttl_seconds: 60,
  payload:     JSON({ paths: ["<path1>", "<path2>"], intent: "<commit msg summary>" })
)

if result.claimed == false:
  holder = result.current_holder
  log "[<agent>] commit-mutex held by " + holder.owner_agent + " — backoff"
  sleep <backoff>   # see §3.5
  retry acquire     # up to max_retries

if acquire failed after max_retries:
  send_telegram(channel="bug", "[<agent>] commit-mutex: could not acquire after N retries")
  ABORT commit — do NOT stage — do NOT restore foreign — just stop and retry next cycle

## critical section (only with lock held)
  git add <exact own paths>
  VERIFY = $(git diff --cached --name-only)
  if VERIFY contains any path NOT in own-paths:
    git restore --staged <foreign path>   ← ONLY foreign-path restore is allowed
    # NOTE: NEVER git restore --staged <own path> — that discards own work
    re-check VERIFY; if still foreign → task_release; ABORT
  git commit -m "$(cat <<'EOF' ... EOF)"
  git diff --cached --name-only  # post-commit: must be empty (verify no residual)

## release (always — even on failure)
task_release(task_id: "commit-mutex:main")
```

**Foreign-restore rule inside the lock:** If a foreign path is found in the post-add verify step,
`git restore --staged <that-foreign-path>` removes it from the index WITHOUT disturbing the
foreign agent's working-tree changes (staged-only restore, not working-tree restore). The foreign
agent's changes remain in its working tree and will be staged when IT acquires the mutex. This is
the correct and safe behavior. NEVER `git restore --staged <own-path>` — that discards own work.

### 3.5 Acquire timeout and backoff

| Parameter | Value | Rationale |
|---|---|---|
| Initial wait | 5 seconds | Typical commit completes in 2–10s; brief wait usually suffices |
| Backoff multiplier | 2× (exponential) | Avoids thundering-herd on simultaneous retries |
| Max wait per retry | 30 seconds | Upper bound on each sleep |
| Max total retries | 6 | = max total wait ≈ 5+10+20+30+30+30 = 125s before giving up |
| Give-up action | log + telegram(bug) + skip commit (retry next cron cycle) | Non-blocking; work is preserved in working tree |

Cron-spawned agents run on 15-minute cycles. A 125-second max wait is well within one cycle
and does not block the next tick.

### 3.6 Stale-lock reclaim

`task_claim` already implements stale-lock reclaim via TTL: if the current holder's `expires_at`
has passed (i.e., `now > heartbeat_at + ttl_seconds`), `task_claim` overwrites the row and
returns `claimed: true` to the new acquirer. This covers the crashed-holder case.

Additional stale-lock signals:
- Holder crashes mid-critical-section → TTL expires in ≤60s → next claimer wins.
- Holder completes commit but crashes before `task_release` → same: TTL expires in ≤60s.
- No heartbeat is needed for commit-mutex (TTL=60s is short enough; heartbeating a 2–10s
  operation adds unnecessary MCP round-trips).

The existing `task_list_held` tool (with `expired: true`) can expose stuck locks for manual
inspection. No new tooling required.

**Relation to `[[feedback_git_stale_locks]]`:** macOS Spotlight can orphan `.git/*.lock` files
when a git process crashes. This is a SEPARATE layer from the commit-mutex. The commit-mutex
handles CONCURRENT AGENTS racing to stage+commit. The `.git/index.lock` file is git's own
single-writer internal lock (one git process at a time). If `.git/index.lock` exists and no git
process is running, `rm .git/index.lock` is safe (as documented in the feedback). The
commit-mutex does not replace or interact with `.git/index.lock` — it serializes agent-level
access ABOVE the git layer. Both mechanisms are needed and complementary.

---

## 4. How Background / Cron Agents Honor the Lock

The PO commission signal identifies this as the key enforcement challenge: "the lock must be
enforced at the shared commit-helper / flow level, not just politely requested."

### 4.1 Enforcement point

The lock is enforced in exactly one place: the **commit step within each agent's flow** (the
step that calls `git add` + `git commit`). Every agent in the fleet executes commits via its
flow's commit step. There is no other path to reach the git index — agents do not call git
directly outside their flow steps.

Implementation plan (for the developer who implements this after PO ratification):

1. Author a shared skill: `.claude/skills/commit-mutex/SKILL.md` containing the acquire +
   critical-section + release protocol from §3.4.
2. Each agent flow's commit step gets a single line: `→ skill: .claude/skills/commit-mutex/SKILL.md`
   replacing the current bare `git add / git commit` block.
3. Cron-spawned agents (dev-*, pm, qa, architect) all load their own flow at runtime — they
   pick up the skill update automatically at next cron tick. No per-agent configuration change.

### 4.2 Why this is enforcement, not a polite request

The skill is the ONLY way to commit. Agents that bypass the skill bypass their own flow, which
violates the fail-loud-protocol output boundary (agents may only write to their declared outputs
via their declared flow steps). A flow step that bypasses the commit-mutex skill would be a DDD
/ flow boundary violation detectable in post-merge review. No agent is expected to bypass its
own flow's commit step.

### 4.3 Cron-specific note

Cron-spawned agents (15-minute ticks) call `task_claim("commit-mutex:main")` at commit time
only — not at spawn time. The claim happens inside the critical section, which is seconds long.
If a cron tick fires while another agent holds the mutex, the claiming agent backs off (§3.5)
and retries within the same cycle. If all retries exhaust, the agent skips the commit and retries
on the next cron tick (15 minutes later). This is safe: the agent's working-tree changes are
preserved; the next tick re-enters the flow from the commit step.

---

## 5. Migration from Interim Whole-Worker Serialization

The interim policy (FLEET-WIDE SINGLE-COMMITTER SERIALIZATION) serializes the entire worker.
The commit-mutex serializes only the commit window. These two policies are compatible during
transition:

| Phase | Policy in force | How to transition |
|---|---|---|
| Today (pre-ratification) | Interim whole-worker serialization | No change |
| After PO ratification | Same interim, PLUS commit-mutex skill authored | Skill exists but is not yet wired into flows |
| After developer implements | commit-mutex wired in all flow commit steps | Interim policy can be LIFTED by PO signal |

**Transition rule:** The interim policy stays in force until the developer confirms the skill is
wired into ALL agent flows that perform commits AND at least one observed cycle passes with zero
bundling incidents under the new mutex. PO emits the lift signal.

**Zero history rewrite.** No git operation in this design rewrites history. `task_release` only
updates the `coordination.db` row. The mutex has no effect on any commit SHAs, tags, or
ancestry. Anchor `debba8eaff0724d1fb32fc9d28640201cc32d1cc` is unaffected.

**Zero branches.** `task_claim` / `task_release` are SQLite operations against `data/coordination.db`.
No git branch or worktree is created. All commits continue to land on `main`.

---

## 6. Coordination.db Schema Extension

The existing `coordination_locks` table (used by task-lock system) is sufficient with a minor
schema note. The `task_kind` column currently accepts `cowork-slot`, `sprint-task`,
`dashboard-row`. Adding `commit-mutex` requires only:

- Document the new `task_kind` value in `docs/protocols/task-lock-protocol.md`.
- Add a CHECK constraint amendment (optional hardening — the existing row-upsert logic does
  not enforce an enum; the protocol document is the contract).
- No migration script — `coordination.db` stores only live locks; there is no historical data to
  migrate.

**coordination.db location:** `data/coordination.db` (confirmed via `find` this cycle).
**Accessed via:** existing MCP tools `task_claim` / `task_heartbeat` / `task_release` /
`task_list_held` on `server="vn-market"`. No new MCP tools required.

---

## 7. DDD Layer Assignment

The commit-mutex is an infrastructure-layer coordination primitive in the flow execution layer
(`.claude/skills/`). It does not touch domain, application, or interface layers of any
microservice. It is a cross-cutting operational concern.

| Artifact | Layer | Location |
|---|---|---|
| commit-mutex SKILL | Operational / flow | `.claude/skills/commit-mutex/SKILL.md` |
| task_kind: "commit-mutex" documentation | Protocol | `docs/protocols/task-lock-protocol.md` (amendment) |
| Flow wiring (skill invocation) | Flow step | Each `.claude/flows/*/main.md` commit step |
| `coordination.db` row | Infrastructure | `data/coordination.db` (existing) |

---

## 8. Risk Flags

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| R-1 | Agent implements commit step outside its flow (bypasses mutex) | MEDIUM | Post-merge architectural review; output boundary audit |
| R-2 | MCP tool `task_claim` unavailable (mcp-server down) | LOW | Agent falls back to interim whole-worker serialization (do not commit if task_claim fails) |
| R-3 | TTL=60s too short under extreme disk I/O (large hook, slow Mac) | LOW | Raise TTL to 120s if observed; 60s is a starting point |
| R-4 | Two agents both time out and both skip a commit (convoy effect) | LOW | Exponential backoff with jitter; 6 retries over 125s makes simultaneous exhaustion rare |
| R-5 | `coordination.db` WAL corruption (analogous to market.db corruption bug) | LOW | `coordination.db` is write-light (one row, seconds-long writes); isolated named volume already in place |

**Note on R-2 (mcp-server down):** If `task_claim` fails (MCP unavailable), the agent MUST NOT
proceed to stage+commit without the mutex. The fail-safe is to skip the commit and send a
bug telegram. The interim whole-worker serialization policy covers the gap until MCP recovers.

---

## 9. What This Design Does NOT Change

- No change to commit message format (commit-convention.md stays).
- No change to explicit-path staging (L84 policy stays, REQUIRED inside the critical section).
- No change to `git restore --staged <foreign>` as a secondary defense (it stays, now inside
  the guarded critical section where it is safe).
- No change to tag-only operations (index-free, always safe to run concurrently).
- No change to any microservice source code.
- No change to any pilot-status SSOT, pilot charter, or factory flow.

---

## 10. Implementation Handoff (for developer, post-PO-ratification)

When PO ratifies, PM creates a developer task with these acceptance criteria:

1. **Skill authored:** `.claude/skills/commit-mutex/SKILL.md` exists with the acquire/
   critical-section/release protocol from §3.4, including TTL=60s, backoff table from §3.5,
   foreign-restore rule, and give-up action.

2. **Protocol doc amended:** `docs/protocols/task-lock-protocol.md` documents `task_kind:
   "commit-mutex"` in the lock-kinds table and TTL table.

3. **Flow wiring:** Every `.claude/flows/*/main.md` that contains a commit step invokes the
   commit-mutex skill. Developer enumerates all affected flows and produces a checklist.

4. **Smoke test:** Developer triggers a simulated two-agent concurrent commit (two CLI tabs,
   both acquire at the same time) and confirms: (a) one wins immediately, (b) the other backs
   off and retries, (c) both commits eventually land, (d) no foreign-path bundling observed in
   either commit.

5. **Interim policy lift:** After smoke test passes, developer emits a signal to PO for interim
   policy lift authorization.

---

## 11. Build Standard

```
BUILD-STANDARD: not-applicable
```

This is a flow/skill change, not a microservice feature. No new service, no new DDD layers,
no relay required.

---

## Appendix — Incident Evidence (this session)

| Incident | Contaminating commit | Description |
|---|---|---|
| 1 | 179f7cd1 | doc-heal `.claude/*.md` files bundled into a PM signal commit |
| 2 | (session) | dev evidence committed under a po commit message |
| 3 | 9fd1634e | api-gateway .golangci.yml + g4-fence.md bundled into PM commit |
| 4 | c348ea2a | api-gateway openapi.yaml bundled into PM commit |
| 5 | a1a7224a | pdf-extractor low_confidence_gate (6 files) bundled into the charter-mandated atomic terminal close — atomic close contaminated |
| 6 | (session) | working-tree notebook clobbered by concurrent PO process |

Root cause (all incidents): verify→commit race window. The existing `git diff --cached` verify
fires BEFORE the concurrent agent's `git add` lands — verify sees clean, commit sweeps both.
The advisory lock eliminates this window entirely: only one agent can be inside the critical
section at a time; the verify and the commit are atomically sequential within the lock.
