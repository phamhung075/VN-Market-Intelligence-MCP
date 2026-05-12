# Architecture Brief — SPRINT-PARALLEL-ISOLATION

**Authored:** 2026-05-12
**Author:** Architect
**Status:** Decision — Ready for BA + PM handoff
**Deferred since:** cycle 37 (c37)
**Absolute cutoff:** c43. Shipped c42.

---

## 1. Context

### The c37 Incident

In cycle 37 (~2026-05-11), main terminal dispatched multiple developer subagents in a single message — the intended "parallel by default" behaviour documented in `docs/protocols/agent-chaining-protocol.md` § Parallel Spawn Rule. All agents shared the same working tree (single repo, single git HEAD). Concurrent `git checkout`, `git add`, and file edits across overlapping file paths caused:

- Branch state corruption (HEAD pointing to wrong commit after concurrent checkouts)
- Merge-conflict-as-data-loss (concurrent edits to the same file produced silent overwrites, not surfaced conflicts)
- Partial commits (file A from agent 1 + file B from agent 2 landing in the same commit, breaking atomic task boundaries)

### Mitigation Since c38

Strict sequential dispatch: main terminal spawns exactly one developer agent, waits for its full return, then spawns the next. Five consecutive sequential-only cycles (c38–c42) have been stable. This anti-c37 pattern is now load-bearing for cycle stability.

### Cost of Sequential-Only

- BA + dev + QA + PM chain serialises work that could be parallel
- Tasks touching disjoint files/services (e.g. dev-stock-price task A + dev-alert-engine task B) have zero logical dependency but are forced to queue
- `dev-team/main.md` Step 3 explicitly instructs: "Tier 1: tasks with no deps → spawn ALL developers in one message (parallel)" — current practice directly contradicts the flow document
- The gap between documented intent and actual dispatch creates silent technical debt: future main-terminal sessions or new operators may re-enable parallel spawn without understanding the c37 race condition

### Goal

Identify and adopt the architectural mechanism that makes parallel agent dispatch safe for tasks touching disjoint files/services. Unblock c44+ for legitimate parallel work. Reconcile `agent-chaining-protocol.md` and `dev-team/main.md` Step 3 with actual safe dispatch rules.

---

## 2. Constraints

1. Must not require user infrastructure changes (no new hardware, no new Docker services, no CI changes)
2. Must work with the existing Claude Code Agent SDK — no custom tooling beyond what the SDK exposes natively
3. Must reconcile with `dev-team/main.md` Step 3 existing text (update the doc, not work around it)
4. Must preserve the single-repo monorepo structure (no repo splits)
5. Must be reversible: if a bug is discovered in the new mechanism, sequential mode must be restorable in one doc edit + one protocol change (no compiled artefacts to redeploy)
6. Must not add per-cycle overhead that exceeds the time saved by parallelism for typical 2-task batches

---

## 3. Options Evaluated

### Option A — Worktree-per-agent (SDK-native)

Each parallel agent spawned with `isolation: "worktree"` in the Agent tool call. Claude Code SDK auto-creates a `git worktree add` directory, sets up an isolated branch, and cleans up after the agent returns.

**How it works in this codebase:**

The Claude Code Agent tool accepts `isolation: "worktree"` as a parameter (confirmed in SDK changelog: "Subagents support `isolation: 'worktree'` for working in a temporary git worktree"; "Fixed Agent tool with `isolation: 'worktree'` reusing stale worktrees from prior sessions"). When set:
- SDK calls `git worktree add <tmpdir> -b <auto-branch>` before spawning the agent
- Agent sees an isolated working tree with its own HEAD, branch, and working directory
- Agent's file writes, `git add`, and `git commit` all operate on that worktree's branch only
- On agent return, main terminal merges the branch (fast-forward if no conflicts) and removes the worktree

**Pros:**
- Complete git-state isolation: each agent has its own branch + HEAD — no shared-HEAD race
- File-level isolation: concurrent edits to the same file land on different branches; conflict surfaces at merge time (deterministic, not silent data loss)
- Zero new infrastructure: SDK handles worktree lifecycle (create + cleanup)
- Cleanup is automatic: SDK removes stale worktrees from prior sessions (fixed bug confirmed in changelog)
- Native to the tool we already use — no custom wrapper scripts

**Cons:**
- Each worktree copies the working tree on disk: for a repo with large `node_modules` or build artefacts, this adds disk pressure. Mitigated here because Docker build artefacts are in containers, not the repo tree.
- Agent must be aware that its `cwd` is the worktree path, not the original repo root. Absolute-path rule in `agent-chaining-protocol.md` (§ Absolute Path Rule) already mandates `git rev-parse --show-toplevel` — this works correctly in worktrees.
- Merge-back step: main terminal must merge each worktree branch after agent returns. For fast-forward merges (disjoint files) this is a single `git merge --ff-only`. For genuine conflicts (same file edited by two agents), merge will fail — this is correct behaviour (surfaces the conflict rather than silently losing data).
- Cross-service integration tests: if two agents both run the full test suite, tests may contend on shared SQLite DBs. This is addressed in Section 7 (Out of Scope).

**Complexity:** S. The SDK does the heavy lifting. Main terminal changes: add `isolation: "worktree"` to Agent tool calls for parallel tasks + a post-return merge step.

---

### Option B — Serialize HEAD-Mutating Ops (lock queue)

Allow agents to read/edit files in parallel but funnel all `git add/commit/branch` operations through a lock-protected queue managed by main terminal.

**How it works:**

Main terminal maintains a `docs/git-lock.json` file. Each agent, before calling `git add` or `git commit`, must acquire the lock (write its agent ID to the file), perform the git op, then release (clear the file). Agents poll the lock file with exponential backoff.

**Pros:**
- Preserves single HEAD
- Minimal protocol change

**Cons:**
- Only addresses git-state races. Does not address file-level race conditions: two agents editing the same file concurrently will still produce silent overwrites regardless of git lock state (the race happens in the filesystem before `git add` is called).
- Lock polling is a distributed systems anti-pattern in a single-process context. Agents cannot observe each other's lock state in real time — they would need to re-read the lock file on every iteration.
- Agents are language-model processes, not threads. "Polling" means re-entering a read loop inside the agent's own reasoning, which is fragile and token-expensive.
- Does not enable true parallelism: if all git ops are serialised, the throughput gain from parallel file edits is only partial.

**Complexity:** S to implement the lock file. But correctness is M-hard: the file-level race is not solved, making this option a false fix.

**Verdict:** Rejected. Solves the easier half of the problem while leaving the harder half (file-level race) open.

---

### Option C — Pre-spawn Stash + Reset

Before spawning parallel agents, snapshot the working tree with `git stash`. Each agent operates on a fresh checkout. On return, replay the stash; conflicts surface at replay time.

**Pros:**
- Each agent sees a clean working tree at spawn time

**Cons:**
- A single stash is global — it does not give each agent its own isolated snapshot. Two agents spawned simultaneously both see the same post-stash working tree; file races are not prevented.
- `git stash` is destructive on the working tree. If any agent fails mid-run, the stash replay may produce undefined state.
- Stash isolation per agent would require multiple stash entries with agent-specific naming — not natively supported by git.
- Does not actually parallelize HEAD writes: the stash replay happens serially, eliminating the throughput gain.

**Complexity:** M (custom stash management) for worse safety guarantees than Option A.

**Verdict:** Rejected. More fragile than Option A, does not solve the core race, and cannot be implemented cleanly with native git.

---

### Option D — Native SDK Worktree (discovered during investigation)

This is Option A with the clarification that the `isolation: "worktree"` parameter is a **first-class Agent SDK feature** already present in this project's Claude Code environment — not a custom implementation. The changelog confirms:

- "Added support for `isolation: worktree` in agent definitions" (declarative agent-level default)
- "Subagents support `isolation: 'worktree'` for working in a temporary git worktree" (per-spawn parameter)
- "Fixed Agent tool with `isolation: 'worktree'` reusing stale worktrees from prior sessions" (bug fixed — safe to use)
- "Added `WorktreeCreate` and `WorktreeRemove` hook events" (observability hooks available if needed)
- "Fixed subagents with worktree isolation or `cwd:` override leaking their working directory back to the parent session's Bash tool" (isolation is genuine — no leakage)

Option D = Option A implemented via SDK parameter rather than manual `git worktree add` scripting. This reduces complexity from M to S and eliminates the need for a custom worktree lifecycle wrapper.

---

## 4. Recommendation

**Option A / D: SDK-native `isolation: "worktree"` on all parallel developer agent spawns.**

Rationale:

1. **It is the SDK's intended answer to this exact problem.** The Claude Code SDK ships `isolation: "worktree"` precisely to allow parallel subagents to work without shared-state corruption. Using it is the zero-custom-code path.

2. **Correctness guarantees are strong.** Each worktree has its own HEAD, branch, and working directory. File writes cannot race across worktrees. Conflicts surface as merge failures at a deterministic point (after agent returns), not as silent data loss during execution.

3. **The absolute-path rule already makes agents worktree-safe.** `agent-chaining-protocol.md` § Absolute Path Rule mandates `git rev-parse --show-toplevel` for all file writes. This resolves correctly inside a worktree (returns the worktree root, not the main repo root). No agent-code changes required.

4. **Cleanup is handled by the SDK.** Stale worktrees from prior sessions are automatically removed (fixed bug, per changelog). No cron job or cleanup hook needed.

5. **Rollback is trivial.** If `isolation: "worktree"` causes unexpected behaviour, remove the parameter from the spawn call → agents revert to shared-tree dispatch → sequential mode re-engages. One-line revert, no infrastructure change.

6. **Complexity is S, not M.** Options B and C require custom coordination logic; Option A/D requires adding one parameter to Agent tool calls and one merge step in main terminal's post-return handler.

---

## 5. Implementation Roadmap

### Phase 1 — Protocol update (doc-only, no code)

**Owner:** PM (task breakdown) + developer (doc edit)
**Target:** c43

Update `docs/protocols/agent-chaining-protocol.md`:
- § Parallel Spawn Rule: add explicit statement that parallel spawns require `isolation: "worktree"` on each Agent call
- § Rules: update rule 4 to read: "Parallel by default — when tasks touch disjoint files/services, spawn ALL in one message using `isolation: 'worktree'` on each Agent call; main terminal merges branches post-return"
- Add new § Worktree Merge Protocol (see below)

Update `docs/policies/dev-standards.md` (if it addresses agent dispatch):
- Add: "Parallel developer spawns: always use `isolation: 'worktree'`; sequential spawns: `isolation` param omitted"

**No flow file changes yet** — Phase 2 handles `dev-team/main.md`.

---

### Phase 2 — dev-team flow Step 3 reconciliation

**Owner:** developer
**Target:** c43

Update `.claude/flows/dev-team/main.md` Step 3:

Current text (Conflict check before parallel spawn):
```
Different files → ✅ parallel
Same file modified by both → ❌ sequential
```

New text:
```
Different files → ✅ parallel — spawn with isolation: "worktree"
Same file modified by both → ❌ sequential — spawn without isolation, one at a time
Task B depends_on Task A → ❌ sequential
Same test suite → ⚠️ parallel OK if different test files AND tests do not share a SQLite DB
                    (see SPRINT-PARALLEL-ISOLATION brief § Out of Scope for shared-DB caveat)
```

Add to Step 3 — post-return for parallel tier:
```
After all worktree agents in a tier return:
  for each worktree branch:
    git merge --ff-only <branch>     # fast-forward if disjoint (expected case)
    if merge fails: report conflict to WORK + block next tier + spawn architect
    git worktree remove <path>       # cleanup (SDK may auto-remove; explicit is safer)
    git branch -d <branch>           # remove merged branch
```

---

### Phase 3 — Verification on 2 disjoint real tasks

**Owner:** QA (verify) + PM (select tasks)
**Target:** c44

Select two tasks from the next sprint that satisfy:
- Different service zones (e.g. dev-stock-price zone + dev-alert-engine zone)
- Verified disjoint file sets (PM confirms via TASKS.md `files` field)
- Neither task has a `depends_on` the other

Spawn both with `isolation: "worktree"`. Observe:
- Both agents complete independently
- Fast-forward merge succeeds for both
- No shared-HEAD corruption
- All tests pass post-merge

If both pass: Phase 3 is verified. Log in architect notebook.

---

### Phase 4 — Sequential mandate relaxation

**Owner:** architect (sign-off) + PM (announce)
**Target:** After Phase 3 passes on 2 consecutive cycles (c44 + c45)

Update `agent-chaining-protocol.md` § Rules:
- Remove: "Anti-c37: sequential dispatch only"
- Add: "Parallel dispatch re-enabled via worktree isolation. See SPRINT-PARALLEL-ISOLATION brief for decision rationale."

Update `dev-team/main.md` Step 3 comment block:
- Remove: "NOTE: anti-c37 sequential-only mode active"
- Add: "Parallel dispatch via worktree isolation. Phase 3 verified c44+c45."

Send WORK notification: "Parallel dispatch re-enabled — worktree isolation active from c46."

---

### Phase 5 — Worktree Merge Protocol (hardening)

**Owner:** developer
**Target:** c46 or later (after Phase 4 stable)

Add `docs/protocols/worktree-merge-protocol.md`:
- Standard merge sequence (ff-only → conflict detection → escalation)
- Branch naming convention for worktree branches: `worktree/<agent-id>/<task-id>/<timestamp>`
- Cleanup verification: `git worktree list` after each tier to confirm no orphaned worktrees
- Edge case: agent crashes mid-run (worktree remains) → cleanup procedure

This is hardening, not a blocker. The core mechanism works without this doc.

---

## 6. Risks

### R1 — Worktree branch merge conflict (MEDIUM)

Two agents edit the same file despite the PM's conflict check. Fast-forward merge fails. Main terminal must handle the failure without data loss.

**Mitigation:** Step 3 conflict check is the primary control. The merge failure is the safety net — it surfaces the conflict deterministically rather than losing data. Main terminal must treat merge failure as a BLOCKED signal, report to WORK, and spawn architect for resolution. This is strictly safer than the c37 behaviour (silent data loss).

**Rollback:** Abandon the worktree branches, reset to main, re-run tasks sequentially.

---

### R2 — Absolute path rule violation in a worktree (LOW)

An agent constructs a path relative to CWD instead of `$(git rev-parse --show-toplevel)`. Inside a worktree, CWD is the worktree root (correct). But if an agent hard-codes a path that assumes the main repo root, it will write to the worktree path and the merge will carry the write to main (which may be correct or may be a path collision).

**Mitigation:** The absolute path rule in `agent-chaining-protocol.md` already mandates `git rev-parse --show-toplevel`. Phase 1 adds explicit mention that this rule applies in worktrees. QA Phase 3 verification checks that all file writes landed in the expected locations.

---

### R3 — SDK worktree reuse bug regression (LOW)

The SDK changelog notes: "Fixed Agent tool with `isolation: 'worktree'` reusing stale worktrees from prior sessions." If this bug regresses in a future SDK version, two agents in different cycles could land in the same worktree.

**Mitigation:** Phase 5 (Worktree Merge Protocol) includes `git worktree list` verification after each tier. A stale worktree would appear in the list and be caught before the next cycle. SDK auto-cleanup is the primary control; explicit verification is the secondary.

---

### R4 — Disk pressure from concurrent worktrees (LOW)

Two concurrent worktrees duplicate the working tree on disk. For this repo: `apps/` contains TypeScript source (small), `node_modules` are not checked in (Docker builds manage dependencies), and no large binary assets exist in the working tree. Estimated duplicate size per worktree: <10 MB. Two concurrent worktrees: <20 MB overhead. Acceptable.

**If disk becomes a concern:** limit concurrent parallel spawns to 2 (already the typical case for this team's task batches).

---

### R5 — Cross-service test contention (MEDIUM — see Out of Scope)

Two worktree agents both run `bun test` across their full service test suites. If the tests share a SQLite DB file (e.g. both agents' test suites write to `market.db` in the same path), test results will be non-deterministic.

**Mitigation:** See Section 7. This brief explicitly defers shared-DB test contention to a separate brief. For now: parallel tasks must be in services with isolated test databases (different service zones satisfy this — `stock-price` and `alert-engine` have separate DBs).

---

### R6 — `pipeline-state.json` write race (LOW)

Both worktree agents are instructed to write `docs/pipeline-state.json` before returning. In worktrees, each agent writes to its own worktree copy of the file. At merge time, both copies will conflict (same file, different content).

**Mitigation:** `pipeline-state.json` is owned by main terminal, not by individual agents. Phase 2 flow update must specify: "In parallel worktree dispatch, agents do NOT write pipeline-state.json — main terminal writes it after all tier merges complete." This removes the write conflict entirely.

**Impact on existing protocol:** The current protocol states all dev-team agents must write `pipeline-state.json`. This rule remains in force for sequential dispatch. For parallel worktree dispatch, the exception is: "main terminal owns pipeline-state.json writes for the tier."

---

## 7. Out of Scope

The following problems are explicitly NOT addressed by this brief:

1. **Shared SQLite DB contention during parallel test runs.** If two agents in different worktrees both run tests that write to the same `market.db` or `alert-engine.db` path on disk, test results will be non-deterministic. This requires a separate brief on test database isolation (e.g. per-test-run DB copy, or test-mode DB path override). Separate ARCH task.

2. **Cross-service integration tests that spawn the full Docker stack.** These are inherently serial. Worktree isolation does not help when tests require a shared Docker network.

3. **Parallel QA spawns writing to the same notebook.** QA agents currently append to their notebook. Two parallel QA agents appending simultaneously could interleave writes. Defer to a separate brief on QA parallelism.

4. **`docs/signals/` file write contention.** Signal files use unique filenames (`{agent}-{ISO-timestamp}.json`) — they are inherently collision-free. No change needed.

5. **Parallel BA or Architect spawns.** These agents write design docs and handoff files, not code. Their parallelism is a separate concern. This brief covers developer agent parallelism only.

6. **Git history aesthetics.** Worktree merges may produce a merge commit instead of a linear history when ff-only is not possible. This is intentional — merge commits are the correct artefact for parallel work. No squash policy is introduced here.

---

## 8. Hand-off

**Immediate:** BA + PM receive this brief. BA does not need to write a spec — this is a doc-only + flow-update brief. PM breaks it into 2 tasks:

- Task SPRINT-PARALLEL-1: Phase 1 + Phase 2 doc updates (developer, c43)
- Task SPRINT-PARALLEL-2: Phase 3 verification (QA, c44)

Phases 4 and 5 are gated on Phase 3 results — PM creates those tasks after Phase 3 passes.

**Developer guidance for Phase 1 + 2:**
- Edit `docs/protocols/agent-chaining-protocol.md` at § Rules (rule 4) and § Parallel Spawn Rule
- Edit `.claude/flows/dev-team/main.md` Step 3 (conflict check block + post-return merge block)
- No production code changes
- No test changes
- Commit as `docs(arch/parallel-isolation): SPRINT-PARALLEL-1 worktree dispatch protocol`

---

## 9. Decision Criteria for Relaxing Sequential Mandate

Sequential-only mode (anti-c37) is relaxed when ALL of the following are true:

1. Phase 1 doc updates committed and merged to main
2. Phase 2 flow update committed and merged to main
3. Phase 3 verification passed on **2 disjoint parallel tasks** in **1 cycle** (c44)
4. No merge conflict failures during Phase 3
5. QA confirms post-merge test suite passes (all tests green, no count regression)
6. Architect signs off in notebook entry for c44

If any of 3–6 fail: root-cause, fix the worktree dispatch procedure, and repeat Phase 3 in c45. The sequential mandate remains in force until all 6 criteria pass.

**Target relaxation cycle: c46** (conservative: allows 1 retry cycle after Phase 3).

---

## 10. Dependencies

- **Claude Code SDK:** `isolation: "worktree"` is confirmed available in the current environment (changelog evidence). No SDK upgrade required.
- **Git:** `git worktree` command is standard Git ≥2.5. All environments (macOS dev, Docker build) have Git ≥2.30. No version constraint.
- **No sprint blockers:** This brief does not depend on any in-flight sprint (1880, 1885, 1886). Phase 1 + 2 can run in parallel with any ongoing development work.
- **No infrastructure changes:** No new Docker services, no new environment variables, no new hardware.
- **Prerequisite for Phase 3:** A sprint batch with ≥2 tasks in different service zones. Typical sprint plan already produces this (e.g. stock-price + alert-engine tasks coexist in most sprints). PM selects the first eligible batch for Phase 3.
