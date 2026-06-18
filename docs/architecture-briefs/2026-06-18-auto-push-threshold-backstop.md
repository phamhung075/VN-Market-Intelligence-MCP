# Architecture Brief: Auto-Push Threshold Backstop

**Date:** 2026-06-18
**Author:** architect
**Status:** READY-FOR-PM-DECOMPOSE
**Slug:** auto-push-threshold-backstop
**Task:** ARCH-AUTO-PUSH-THRESHOLD-BACKSTOP
**Extends:** FU-ORIGIN-LAG-PUSH-DISCIPLINE (done_verified — brief: `docs/architecture-briefs/2026-06-13-origin-lag-push-discipline.md`)
**Zone:** cross-service/ (script at repo root; flow-step touches `docs/agents/po/flow/main.md`)

---

## DJ-GATE-1 — Decision Journal

**task-id:** ARCH-AUTO-PUSH-THRESHOLD-BACKSTOP
**decision:** OPTION-B chosen — add a threshold-checked push step inside the PO's post-triage tick, NOT a new daemon/cron/launchd. When `git rev-list --count origin/main..HEAD` exceeds threshold N=20 and the bg-agent safety guard passes, the PO flow fires `scripts/fleet-worktree-push.sh`. The script implements the proven worktree-isolation recipe. Divergence reconciliation uses MERGE (never rebase) when behind-set is cloud-chore-only; aborts if a real commit is detected in the behind-set. NEVER touches the main working tree.
**rationale:** See §2 below. Option-B is the lowest-blast-radius path: it reuses existing loop cadence (PO already ticks every 15 min via dev-team), adds zero always-on components, and the worktree isolation means it never conflicts with bg agents holding dirty main-tree state.
**alternatives-rejected:** Option-A dedicated cron/launchd (new always-on component, cron inventory debt, no meaningful latency advantage); Option-C git post-commit hook (push-storm risk; reduces to a mutex-wrapped Option-B inside the hook — same logic, more complexity); Option-D RemoteTrigger periodic (adds cloud dependency, dedup complexity, same behavior as Option-B but harder to trace).

---

## 1. Problem Statement

`FU-ORIGIN-LAG-PUSH-DISCIPLINE` (done_verified, 2026-06-13) shipped Option-1: a bounded rebase-retry push inside the commit-mutex critical section. The push is serialized and race-free. However it fails silently under a permanently-dirty working tree: the `git pull --rebase origin main` in the retry path requires a clean working tree; the cowork churn loop (notebooks, signals, orch-state) keeps the main tree perpetually dirty. When the rebase fails, the push step falls back to "commit local-only" — the correct safe behaviour, but it means lag accumulates indefinitely.

**Recurrence evidence:**
- 2026-06-15: ~149 unpushed commits; router performed manual worktree push (origin 42290a40 → 0c826511).
- 2026-06-17: ~103 unpushed commits; router performed manual worktree push (origin 882ab789 → 701923bc).
- 2026-06-18: ~N commits again; PO promoted the backstop task (po-s102) as the 3rd manual-push recurrence.

Root: the commit-mutex rebase-retry path is incompatible with a perpetually-dirty tree. Option-1 covers the fast-path (agent commits when tree is already clean); Option-2 (periodic worktree-push, decoupled from commit) is the backstop for when the tree stays dirty.

**Proven recipe** (from memory `feedback_push_blocked_by_perpetual_dirty_tree`, repeated in po-s84 + po-s98):
1. `git worktree add <wt> HEAD` — tree-independent
2. Classify behind-set: `git log HEAD..origin/main --oneline` — cloud-chore-only → MERGE; real fix → ABORT
3. If MERGE: `git -C <wt> merge origin/main --no-edit` (conflict guard on `docs/data/orch/orch-state.json`)
4. Symlink `<wt>/node_modules → $(pwd)/node_modules` so pre-push tsc hook passes
5. `cd <wt> && pnpm --filter vn-market check` — MUST be 0, never push around red
6. `git -C <wt> push origin HEAD:main`
7. Remove symlinks, `git worktree remove <wt>`

This recipe is already proven across 2 manual executions. The brief codifies it into a script and connects the trigger.

---

## 2. Trigger Mechanism — Options Evaluation

| Option | Mechanism | New component | Dirty-tree safe | Market-independent | Blast radius |
|--------|-----------|---|---|---|---|
| **B (CHOSEN)** | PO flow post-triage step, fires when ahead > N | None | Yes (worktree isolated) | Yes | Minimal — rides existing tick |
| A | Dedicated launchd / cron | Yes (new plist or cron entry) | Yes | Yes | Adds unmanaged always-on process |
| C | git post-commit hook | None | Partially (fires outside mutex) | Yes | Push-storm risk under concurrent commits |
| D | RemoteTrigger periodic | Yes (cloud job) | Yes | Yes | Cloud dep + dedup complexity |

**Why Option-B beats the alternatives:**

Option-A (cron/launchd): would need a new launchd plist or a new RemoteTrigger. Both add to the already-tracked cron inventory (docs/standards/cron-jobs.md), introduce a new always-on component, and provide no faster cadence than the existing PO tick (~15 min). The design mandate (`docs/data/orch/orch-state.json` `ARCH-AUTO-PUSH-THRESHOLD-BACKSTOP.design_mandate`) explicitly notes: "evaluate option (a) dedicated cron ... (b) po-flow / dev-team-flow step ... PREFER (b) on first read: it adds no always-on component."

Option-C (post-commit hook): fires on every commit, outside the mutex, and would need the same worktree isolation + tsc gate + mutex guard. This reduces to Option-B with hook overhead added. Push-storm risk is non-zero if two agents commit in the same second. Rejected per precedent (FU-ORIGIN-LAG-PUSH-DISCIPLINE §DJ-GATE-1 rationale).

Option-D (RemoteTrigger): introduces cloud dependency for what is a local git operation. Adds dedup complexity (the double-fire memory `feedback_guaranteed_slot_week_key_double_post`). No benefit over B.

**Option-B placement — PO flow, not dev-team flow:**

The dev-team flow already runs the PO triage step (Step 1). Adding the push check inside the PO post-triage tick (`docs/agents/po/flow/main.md` § No-Task Guard, after all per-tick triage is done) ensures:
- Runs exactly once per tick regardless of how many agents commit between ticks.
- PO already reads orch-state and git state at tick start — the ahead-count probe is one additional `git rev-list` call.
- Does NOT slow down individual commit-mutex holders (who commit frequently, ~every 2 min).
- Flow-doc owner is clear: `docs/agents/po/flow/main.md` (PO's territory).

Alternatively the step could be placed in `docs/agents/dev-team/flow/post-cycle.md` Step 4.1. This is acceptable as a secondary location but PO is the natural owner of "push to origin" decisions (the existing pattern shows PO consistently making the push call). The brief records PO flow as canonical; if PO is unavailable in a tick, dev-team post-cycle is the fallback.

---

## 3. Threshold N and Where the Flow-Step Lives

### 3.1 Threshold N = 20

Rationale:
- The 2 observed manual-push events triggered at ~103 and ~149 unpushed commits. An N=20 threshold would have caught both much earlier (within 1–2 PO ticks of crossing the threshold).
- N=20 is ~40–60 minutes of normal commit cadence (roughly 1 notebook+signal commit every 2–3 min per active agent, ~6–10 commits per tick).
- Small enough to keep origin lag bounded to <1h; large enough to not fire on every tick during light activity.
- N is injected as a variable in the script header — PM task spec should note that `N=20` is the initial value and can be adjusted by editing the script constant `PUSH_THRESHOLD` without a rebuild.

### 3.2 Flow-Step Location

**Primary:** `docs/agents/po/flow/main.md` — insert as **Step PUSH-BACKSTOP** at the end of the § No-Task Guard section, just before the final `JUMP TO end` on the "All empty AND channels clean" path, AND also after every non-idle branch workflow returns (sprint-kickoff.md, review-ba-spec.md, sprint-signoff.md return to PO's terminal). This ensures the check runs on every PO tick exit, regardless of whether PO had work to do.

**Fallback:** `docs/agents/dev-team/flow/post-cycle.md` Step 4.9 (Cycle Elapsed Announce) — add the check before the `elapsed` announce. Activates when dev-team runs without a PO spawn.

```
## Step PUSH-BACKSTOP (PO tick — end of every exit path)

ahead = $(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)
if [ "$ahead" -gt "${PUSH_THRESHOLD:-20}" ]; then
  → bg-agent-safety-check (§4 below)
  if safety_ok:
    bash scripts/fleet-worktree-push.sh
  else:
    send_telegram(channel="work", message="[po] PUSH-BACKSTOP: ahead=${ahead} > ${PUSH_THRESHOLD:-20} but safety guard BLOCKED — bg agents hold uncommitted mutations. Will retry next tick.")
fi
```

---

## 4. Divergence-Reconcile and Bg-Agent-Safety Guards

### 4.1 Bg-Agent Safety Guard (mandatory, blocks push)

Before firing `scripts/fleet-worktree-push.sh`, the PO step checks that NO background agent holds an uncommitted board mutation. The guard is:

```bash
# Guard 1: Is orch-state dirty with a non-committed mutation from a bg agent?
# A dirty orch-state or notebook means a bg agent is mid-write.
# Allow the push only if the orch-state has been committed (tree is "clean enough").
dirty_critical=$(git diff --name-only | grep -E 'docs/data/orch/orch-state\.json|docs/agent-memory/notebooks/')
if [ -n "$dirty_critical" ]; then
  # Critical files dirty — a bg agent may be mid-write. Skip this tick.
  SAFETY_OK=false
fi

# Guard 2: Is a commit-mutex:main lock currently held?
held=$(call_tool(server="vn-market", tool="task_list_held", arguments={kind: "commit-mutex"}))
if held.count > 0:
  SAFETY_OK=false
  # A commit is in flight. Skip: the next tick (after the commit completes + mutex released) is safe.
```

If `SAFETY_OK=false`: log to WORK, skip this tick. Do NOT attempt push. The commit-mutex TTL is 90s, so the next PO tick (~15 min) will always find a clear mutex.

### 4.2 Divergence-Reconcile (inside the script)

The script must classify the behind-set before any merge:

```bash
behind=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)
if [ "$behind" -gt 0 ]; then
  # Classify each behind commit: is it a real fix or a cloud chore?
  non_chore=$(git log HEAD..origin/main --oneline | grep -v '^[a-f0-9]* chore(' | grep -v '^[a-f0-9]* ci(' | wc -l | tr -d ' ')
  if [ "$non_chore" -gt 0 ]; then
    # Real commits in the behind-set — do NOT auto-merge
    send_telegram(channel="bug", message="[fleet-push] ABORT: origin has ${non_chore} non-chore commits not in HEAD. Manual reconcile required before auto-push.")
    exit 1
  fi
  # All behind-set = cloud chores → safe to merge
  git -C "$WT_PATH" merge origin/main --no-edit
  MERGE_EXIT=$?
  if [ "$MERGE_EXIT" -ne 0 ]; then
    # Merge conflict (rare on cloud-chore-only behind-set, but possible on orch-state.json)
    # Conflict in orch-state.json: keep HEAD (our writes are authoritative; cloud chores are additive)
    if git -C "$WT_PATH" diff --name-only --diff-filter=U | grep -q 'orch-state.json'; then
      git -C "$WT_PATH" checkout --ours docs/data/orch/orch-state.json
      git -C "$WT_PATH" add docs/data/orch/orch-state.json
      git -C "$WT_PATH" merge --continue --no-edit
    else
      git -C "$WT_PATH" merge --abort
      send_telegram(channel="bug", message="[fleet-push] ABORT: merge conflict in non-orch-state file — manual resolve required")
      exit 1
    fi
  fi
fi
```

**Key safety properties:**
- NEVER rebases the behind-set onto HEAD. Rebase requires a clean working tree; the main tree is dirty. The worktree path bypasses this entirely because the worktree itself is on `HEAD` (a committed snapshot) — but we still use MERGE not rebase to avoid rewriting the orch-state.json commit history (which the memory `feedback_push_blocked_by_perpetual_dirty_tree` requires).
- NEVER uses `--force` or `--force-with-lease`. The push must be fast-forward after the merge.
- NEVER pushes around a red pre-push hook. If `pnpm --filter vn-market check` exits non-zero, the script exits 1 and logs to BUG.
- orch-state.json conflict → keep HEAD with `--ours`. The behind-set chore commits only add `_updated_at` and `_updated_by` fields; HEAD carries the real board mutations. This is the exact pattern proven in po-s84 ("merge conflict resolved: docs/data/orch/orch-state.json — kept HEAD _updated_at + preserved BOTH rows").

### 4.3 No-Rebase on Main Tree (safety invariant)

The script MUST use `git worktree add <wt_path> HEAD` with a fresh path (e.g. `/tmp/fleet-push-wt-<timestamp>`). It MUST NOT:
- `git checkout` or `git reset` on the main working tree.
- `git stash` on the main working tree (strands bg agents per memory `feedback_push_blocked_by_perpetual_dirty_tree`).
- `git pull --rebase` on the main working tree (requires clean tree).

The worktree is a detached sandbox. The main working tree is NEVER touched by the script.

---

## 5. Files to Create/Modify

| File | Change | DDD layer | Owner |
|------|--------|-----------|-------|
| `scripts/fleet-worktree-push.sh` (CREATE) | The complete push script implementing the proven recipe (§1) + divergence-reconcile guard (§4.2) + pre-push tsc gate + Telegram notification on success/failure | cross-service script | developer (generic) |
| `docs/agents/po/flow/main.md` | Add **Step PUSH-BACKSTOP** (§3.2): threshold-probe + safety-guard + script invocation, at every tick exit path | flow doc | agent-father |
| `docs/agents/dev-team/flow/post-cycle.md` | Add fallback PUSH-BACKSTOP check at Step 4.9, after elapsed announce, same guard logic as PO step | flow doc | agent-father |
| `docs/standards/cron-jobs.md` | No new cron entry needed (option-B = no new cron). Add one-line note under "Maintenance" or "Infrastructure": "Push backstop: PO tick Step PUSH-BACKSTOP fires scripts/fleet-worktree-push.sh when ahead > PUSH_THRESHOLD=20; no cron entry." | standard doc | agent-father |

**Explicitly NOT touched:**
- `apps/*/` — no production code change
- `.claude/skills/commit-mutex/SKILL.md` — FU-ORIGIN-LAG-PUSH-DISCIPLINE already shipped; not modified
- `launchd/` or any plist — no new daemon
- `.git/hooks/` — no post-commit hook

---

## 6. DDD Layer Assignment

This task is entirely in the **infrastructure + interface** layers of the repo (scripts + flow docs). No domain logic is touched. The `scripts/fleet-worktree-push.sh` is an infrastructure script (git operation + shell). The flow-doc changes are interface-layer (dispatcher logic). No DDD violation.

Zone: `cross-service/` (routes to `developer` generic per zone-detect Tier-2 rule: scripts + root-level flow docs span multiple zones).

---

## 7. Standard Detection

```
Zone check: scripts/ + docs/agents/po/flow/ — these are root-level cross-service paths.
Zone apps/po/ does NOT exist in repo → N/A for service classification.
Classification: MAINTENANCE (cross-service script + flow-doc update, no new service, no new primitives)
→ BUILD-STANDARD: not-applicable (MAINTENANCE)
→ NOTE: developer (generic) owns the script; agent-father owns the flow-doc edits.
Scan clean: true
```

---

## 8. Risk Flags

**RISK-1 (MEDIUM): Worktree path collision if two PO ticks fire concurrently.**
Mitigated by: (a) SF-1 dev-team-cron-singleton guard in dev-team/flow/main.md already prevents two concurrent dev-team ticks; (b) the script MUST use a timestamped worktree path (e.g. `/tmp/fleet-push-wt-$(date +%s)`) and call `git worktree prune` on exit to ensure no stale worktrees accumulate.

**RISK-2 (LOW): orch-state.json conflict keep-HEAD may lose a real behind-set write.**
Mitigated by: the behind-set classification guard (non_chore > 0 → ABORT) fires BEFORE merge. Only cloud-chore-only behind-sets reach the merge path. Cloud chore commits to orch-state are always additive `_updated_at`/`_updated_by` fields — never board mutations (board mutations only happen in the main dev-team session). Keep-HEAD is safe for this class.

**RISK-3 (LOW): tsc hook fails on a non-zero exit that is actually a transient network fetch.**
Mitigated by: `pnpm --filter vn-market check` is a compile-only check (no network). It can fail if the mcp-server package has a genuine type error in the working tree. If it does, the script exits 1 and logs the output to BUG — the correct outcome (red-prepush-strands-fleet lesson: never push around a red tree).

**RISK-4 (LOW): N=20 threshold fires too frequently on a slow-commit day.**
Mitigated by: the check runs in <50ms (`git rev-list --count` on a local repo). If ahead ≤ N, the entire step is a no-op. A push when ahead=21 is not harmful — it just means origin is more up to date. PM may tune N in the script constant.

---

## 9. Acceptance Criteria

**AC-1 (Steady-state bound):** After ship, across one full 24h maintenance cycle, `git rev-list --count origin/main..HEAD` never exceeds N+5 (i.e. ≤25) without a manual intervention. The backstop fires automatically before it grows to 100+.

**AC-2 (Tree-independence):** The main working tree contains dirty files (cowork notebooks, orch-state in progress) at the moment the backstop fires. The push still succeeds. No `git stash`, no `git reset`, no `git checkout` on the main tree.

**AC-3 (BG-agent safety):** When the commit-mutex is held (bg agent mid-commit), the backstop step skips and logs to WORK. The push is deferred to the next tick. The bg agent's commit is preserved.

**AC-4 (Red-tree abort):** If `pnpm --filter vn-market check` exits non-zero, the script exits 1, sends BUG telegram, and does NOT push. No silent bypass.

**AC-5 (Non-chore behind-set abort):** If `origin/main` has a non-chore commit not in HEAD, the script exits 1, sends BUG telegram, and does NOT push.

---

## 10. Atomic Decomposition (for PM)

Suggested breakdown. All tasks are `developer` (generic) or `agent-father` owner; no zone-specific dev-* agent needed. All are independent except Task C depends on Task A.

| Task | Title | Owner | Files | Size | Depends |
|------|-------|-------|-------|------|---------|
| **A** | Create `scripts/fleet-worktree-push.sh`: proven worktree recipe + divergence-reconcile + bg-agent safety guard + tsc gate + Telegram on success/failure | developer | `scripts/fleet-worktree-push.sh` | S | — |
| **B-PO** | Add Step PUSH-BACKSTOP to `docs/agents/po/flow/main.md` (every tick exit path): ahead-probe + safety-guard + call script | agent-father | `docs/agents/po/flow/main.md` | S | A (script must exist) |
| **B-DT** | Add fallback PUSH-BACKSTOP to `docs/agents/dev-team/flow/post-cycle.md` Step 4.9 | agent-father | `docs/agents/dev-team/flow/post-cycle.md` | XS | A |
| **C** | Add `docs/standards/cron-jobs.md` note: no new cron; Push backstop via PO tick | agent-father | `docs/standards/cron-jobs.md` | XS | — |

**Verification gate (all tasks):** After ship, run one PO tick with ahead count forced > 20 (manually add a dummy commit). Verify the script fires, the worktree push succeeds, `git rev-list --count origin/main..HEAD` returns 0, and the Telegram WORK channel receives a `[fleet-push] pushed N commits origin/main` notification. Then verify: add a dirty notebook file (don't commit), force ahead > 20 again, hold the commit-mutex — verify the step SKIPS and logs the safety-guard message.

---

## [Architect] Brownfield Findings

- **Zone:** cross-service/ (scripts + root-level flow docs — no apps/ zone)
  - Task A: `scripts/fleet-worktree-push.sh` (new file, root-level scripts/)
  - Tasks B-PO/B-DT/C: `docs/agents/*/flow/*.md` + `docs/standards/cron-jobs.md`
- **Verified paths:**
  - `scripts/` — confirmed, other scripts follow same pattern (e.g. `scripts/docker-cleanup.sh`, `scripts/ci-per-file-isolation.sh`)
  - `docs/agents/po/flow/main.md` L94-107 (§ No-Task Guard, all exit paths — Step PUSH-BACKSTOP inserts before final `JUMP TO end`)
  - `docs/agents/dev-team/flow/post-cycle.md` L64-76 (Step 4.9 — insert before the elapsed announce or immediately after)
  - `.claude/skills/commit-mutex/SKILL.md` Step 3d-PUSH — ALREADY has the bounded rebase-retry guard (shipped by FU-ORIGIN-LAG-PUSH-DISCIPLINE); NOT modified by this task
- **Reuse patterns:**
  - The proven worktree push recipe (po-s84 + po-s98 notes) is the authoritative template for Task A — not invented here
  - The `task_list_held` call for guard check is already in the commit-mutex protocol as a diagnostic step — reuse exact call signature
  - Step PUSH-BACKSTOP mirrors the SF-1 single-flight guard pattern already in dev-team/flow/main.md Step 0-PREFLIGHT (claim → check → fire → log)
- **Design decisions:**
  - MERGE (not rebase) for behind-set integration — rebase requires clean main tree; worktree is clean but semantics are clearer as merge for chore integration
  - keep-HEAD for orch-state.json conflicts — proven in po-s84; cloud chores are always additive to this file
  - N=20 injected as `PUSH_THRESHOLD` variable in script header — tunable without re-ship
  - Primary placement in PO flow (not dev-team) — PO is the semantic owner of "push to origin" decisions; dev-team fallback covers PO-absent ticks
- **Scan clean:** true

**BUILD-STANDARD: not-applicable (MAINTENANCE — cross-service scripts + flow-doc edits, no new service, no new MCP tools, no new primitives)**
