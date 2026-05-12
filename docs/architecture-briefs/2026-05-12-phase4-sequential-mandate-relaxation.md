# Architecture Brief — Phase 4 Sequential-Mandate Relaxation

**Authored:** 2026-05-12
**Author:** Architect
**Task-Id:** 1893a
**Status:** Decision — Ready for PM + main-terminal adoption
**Supersedes:** Anti-c37 sequential mandate (active c38 – c45)
**Baseline:** 8804 tests (doc-only — no production code change)

---

## 1. Summary

Phase 3 parallel-verification passed on 2 consecutive cycles:

- **c44** — 1892a-ops (ops zone) + 1892a-dev (mcp-server zone) ran concurrently via
  `isolation: "worktree"`. Both branches QA-approved. Cherry-pick merge: zero conflicts.
- **c45** — 1892b (api-gateway zone) + 1888a (doc-only chore) ran concurrently. A
  user-triggered mid-cycle notebook prune and HEAD reset did NOT corrupt either feature
  branch. Cherry-pick merge: zero conflicts.

Both cycles satisfy all 6 criteria in
`docs/architecture-briefs/2026-05-12-sprint-parallel-isolation.md` § 9.

**What unlocks (effective c46):** Parallel dispatch via `isolation: "worktree"` is the
default path for all tasks whose file scopes are disjoint. The sequential mandate
imposed after c37 is lifted.

**What stays guarded (permanent rules):**

1. Any task whose write-set intersects another task's write-set in the same tier → sequential.
2. Any task that writes a shared SSOT file → sequential (veto list in § 2).
3. Any task with a `depends_on` link to another in-flight task → sequential.
4. WIP cap = 2 parallel agents per tier (rationale in § 3).
5. Merge-back remains main-terminal's responsibility — sub-agents do not merge or cherry-pick.

---

## 2. Eligibility Criteria for Parallel Dispatch

Before spawning a tier in parallel, main terminal must verify ALL of the following. Fail
any one criterion → demote the tier to sequential dispatch.

### 2a. Disjoint Zone Test

Each task must be in a distinct service zone:

```
apps/mcp-server/        → dev-mcp-server zone
apps/api-gateway/       → dev-api-gateway zone
apps/stock-price/       → dev-stock-price zone
apps/technical-analysis/→ dev-technical-analysis zone
apps/macro-indicators/  → dev-macro-indicators zone
apps/kinh-dich-service/ → dev-kinh-dich zone
apps/alert-engine/      → dev-alert-engine zone
apps/pdf-extractor/     → dev-pdf-extractor zone
apps/rag-service/       → dev-rag-service zone
docs/ (doc-only chore)  → neutral zone (may pair with any single code zone)
```

Two tasks in the same zone → sequential (same files, same test suite).

### 2b. File-Overlap Probe

For each pair of tasks (A, B) in the proposed parallel tier, the intersection of their
expected write-sets must be empty.

Method: inspect the task spec's `files` field (or BA spec's "Files to modify" list).
If a file appears in both write-sets → sequential.

When in doubt, err sequential. The disjoint-zone test in § 2a is a fast pre-filter;
the file-overlap probe is the decisive check.

### 2c. Shared-SSOT Veto List

If EITHER task must write any of the following files, the entire tier is sequential —
no exceptions:

| Vetoed file | Reason |
|---|---|
| `docs/TASKS.md` | PM-owned register; concurrent appends corrupt row ordering |
| `docs/data/project-stats.json` | Volatile stats SSOT; last-write wins silently |
| Any file in `.claude/agents/` | Agent `.md` files; last-write wins silently |
| Any file in `.claude/flows/` | Flow definitions; last-write wins silently |
| `docs/pipeline-state.json` | Dev-team state machine; main terminal owns writes in parallel tiers (see R6 in parent brief) |
| Any file in `docs/agent-memory/notebooks/` | Notebook files; concurrent appends interleave |

Note: signal files (`docs/signals/{agent}-{ISO}.json`) use unique timestamps in their
filenames and are inherently collision-free — they are NOT on the veto list.

### 2d. Dependency Check

Task B lists Task A in `depends_on` → B must wait for A Done. This precludes parallel
dispatch regardless of file scope.

### 2e. Test Suite Isolation

Both tasks must write tests that run against different SQLite databases. Tests in the
same service zone share a database → zone isolation in § 2a covers this.
Cross-service integration tests that spin up the full Docker stack are always
sequential (they share the Docker network and port space).

---

## 3. WIP=2 vs WIP=N Guidance

The SDK `isolation: "worktree"` mechanism supports N concurrent worktrees. This brief
recommends keeping WIP=2 (maximum 2 parallel developer agents per tier) for the
following reasons:

1. **Cognitive load** — main terminal must read and reconcile N returns before spawning
   the next tier. At N=2 this is a clear A-then-B narrative. At N=3+ the merge sequence
   becomes non-obvious, especially when one agent fails mid-run.

2. **Disk headroom** — each worktree duplicates the working tree (estimated <10 MB for
   this repo). Two concurrent worktrees = <20 MB overhead. Acceptable. Three or more
   would stress the macOS Docker VM's shared filesystem.

3. **Task batch reality** — sprint plans for this codebase routinely produce exactly
   2 disjoint tasks per tier (one code zone + one doc-only chore, or two different
   service zones). WIP=2 covers the common case without exposing the WIP=N complexity.

4. **Merge sequencing** — at WIP=2 main terminal can fast-forward merge A, then B, with
   clear rollback paths. At WIP=N the merge ordering requires topological reasoning that
   is error-prone in a language-model context.

**Recommendation: Keep WIP cap at 2. Do not raise it without a new architect brief.**

If a sprint batch produces 3+ truly disjoint tasks, split them across two sub-tiers:
spawn A+B in parallel → merge → spawn C (sequential to A+B merged result).

---

## 4. Failure-Mode Catalogue

### 4a. c37 — The Incident (what went wrong)

**Cycle:** 37 (2026-05-11 ~23:57 UTC)
**What happened:** Main terminal spawned 4 developer agents in a single message. All
4 agents shared the same git working tree (single-worktree repo, single HEAD).

Observed failures:

- `task/1880b-pyramid-tier` branch was created but received 0 commits — 1880b code
  committed onto `task/signal-T2-backfill` because that branch happened to be HEAD
  when dev-mcp-server ran `git commit`.
- `spec/1878a-ocf-column` captured commits from NB-HDR-c38 AND a duplicate of
  signal-T2 content before landing its own commit.
- Processed signal files (moved pre-dispatch) ended up partially committed on signal-T2
  branch and partially untracked.

**Root causes:**

1. No worktree isolation — all agents shared `HEAD` and working directory.
2. Agents ran `git checkout -b <branch>` and `git commit` concurrently on the same
   `.git` index → last-checkout wins determined which branch received the next commit.
3. File edits from different agents interleaved in the working directory before any
   `git add` — no deterministic ownership of in-flight file content.
4. Tasks were not truly disjoint (signal drain state overlapped with code tasks).

**Resolution:** QA cherry-picked correct content and merged in correct order.
Sequential mandate imposed from c38.

---

### 4b. c44 — First Successful Parallel Run (why it worked)

**Cycle:** 44 (2026-05-12 06:26 → 07:05 UTC)
**Tasks:** 1892a-ops (docs zone: `docs/agent-memory/notebooks/ops.md`) +
1892a-dev (code zone: `apps/mcp-server/**` + `vps-scripts/fetch-vn-news.sh`)

**Why it worked:**

1. **True disjoint scopes** — ops zone and mcp-server code zone share zero files.
2. **`isolation: "worktree"` on both spawns** — each agent got its own `git worktree add`
   directory with an independent HEAD and branch. Concurrent `git commit` calls wrote
   to different branches; no shared `.git/index` contention.
3. **No shared SSOT writes during execution** — `docs/TASKS.md` was not touched by
   either agent (PM wrote it after merge). `pipeline-state.json` not written by either
   agent in-worktree.
4. **Cherry-pick merge** — main terminal cherry-picked each worktree's commit onto main
   sequentially. Zero conflicts (disjoint files confirmed at merge time).
5. **SDK worktree lifecycle** — SDK created worktrees before spawn and cleaned stale
   ones automatically. No manual worktree management required.

**One AC failed (1892a-ops AC-3):** `/api/push-*` returned 404 through api-gateway.
This was a **discovery** (routing gap in api-gateway, not the parallel mechanism).
QA correctly distinguished mechanism-pass from functional-fail. Opened 1892b.

---

### 4c. c45 — Second Successful Parallel Run (mid-cycle disruption handled)

**Cycle:** 45 (2026-05-12 07:26 → 07:55 UTC)
**Tasks:** 1892b (api-gateway zone: `apps/api-gateway/src/index.ts` + tests) +
1888a (doc-only: `docs/ARCHITECTURE.md` pointer update)

**Why it worked:**

1. **True disjoint scopes** — api-gateway code zone and a single doc-only pointer update
   share zero files.
2. **`isolation: "worktree"` on both spawns** — same mechanism as c44.
3. **Mid-cycle user notebook prune** — user pushed a refresh of agent `.md` files and
   pruned notebooks mid-cycle. The dev-api-gateway notebook cherry-pick (`3031ffb1`)
   was reset by a `HEAD@{1} reset: moving to bb49b82c` event. This did NOT affect
   either feature commit because feature commits were on independent worktree branches,
   not on the file reset by the prune. The notebook reset lost one memory entry but
   preserved all deliverables.
4. **Cherry-pick merge** — feature commits cherry-picked onto main: 1892b (`f4141f63`),
   1888a (`bb49b82c`). Zero conflicts.
5. **Notebook cherry-picks skipped** — per user's mid-cycle pruned-notebooks refresh,
   developer and QA notebook cherry-picks were intentionally skipped. This shows the
   mechanism is resilient to external mid-cycle state changes as long as feature file
   scopes remain disjoint.

**Key lesson:** SDK worktree isolation protects feature commits from working-tree
disruptions that affect the main worktree (e.g. user push, notebook reset). The
feature branches remained intact on their own worktree HEADs throughout the user event.

---

## 5. Flow Patch Points

Two files require edits to lift the sequential mandate. The patches are specified below
as BEFORE/AFTER diff hunks. Apply in c46 or the next dev cycle.

---

### 5a. `.claude/flows/dev-team/execute.md` — Lines 49 and 87

**Context (line 49 current):**

```
BEFORE (line 49):
  Parallel spawns use SDK-native worktree isolation — add `isolation: "worktree"` to
  each Agent call for parallel tasks. SDK handles worktree lifecycle (create + cleanup).
  Main terminal merges each worktree branch (fast-forward if disjoint) after all agents
  in the tier return. Sequential dispatch remains MANDATORY until c44 verification
  (Phase 3). After c44+c45 pass, Phase 4 relaxes the mandate.
```

```
AFTER (line 49):
  Parallel spawns use SDK-native worktree isolation — add `isolation: "worktree"` to
  each Agent call for parallel tasks. SDK handles worktree lifecycle (create + cleanup).
  Main terminal merges each worktree branch (fast-forward if disjoint) after all agents
  in the tier return. **Phase 4 active (c46+): parallel dispatch is the default for
  disjoint-zone tasks. Sequential mandate (anti-c37) lifted. See eligibility criteria:
  `docs/architecture-briefs/2026-05-12-phase4-sequential-mandate-relaxation.md` § 2.**
```

---

### 5b. `docs/protocols/agent-chaining-protocol.md` — § Parallel Isolation, last paragraph

**Context (current "Sequential mandate" paragraph):**

```
BEFORE:
  **Sequential mandate:** Sequential dispatch remains MANDATORY until c44 verification
  (Phase 3 of the roadmap). After c44+c45 pass, Phase 4 relaxes this mandate.
```

```
AFTER:
  **Phase 4 active (c46+):** Sequential mandate lifted. Parallel dispatch via
  `isolation: "worktree"` is the default for tasks satisfying all eligibility criteria
  (disjoint zones, no shared-SSOT writes, no dependency links, WIP≤2). See
  `docs/architecture-briefs/2026-05-12-phase4-sequential-mandate-relaxation.md` § 2
  for the full eligibility checklist. The SSOT veto list (§ 2c) remains permanent —
  it is not relaxed by Phase 4.
```

---

### 5c. `docs/policies/dev-standards.md` — § Parallel Agent Dispatch table

**Context (current last line of the section):**

```
BEFORE:
  Sequential dispatch remains the DEFAULT until c44 verification passes (see Phase 3
  roadmap).
```

```
AFTER:
  **Phase 4 active (c46+):** Parallel dispatch with `isolation: "worktree"` is now the
  DEFAULT for tasks with disjoint file scopes. Sequential dispatch is required only
  when eligibility criteria fail (shared SSOT write, file overlap, or dependency). See
  `docs/architecture-briefs/2026-05-12-phase4-sequential-mandate-relaxation.md` § 2.
```

---

## 6. Rollback Signal

The sequential mandate is **automatically re-imposed** if ANY of the following
observable events occur:

| Observable trigger | Action |
|---|---|
| A fixer commit is opened whose root cause is traced to cross-worktree file contamination (agent A's file edit appeared in agent B's branch) | Re-impose sequential mandate immediately. Architect root-cause before next parallel spawn. |
| A cherry-pick or merge produces a conflict on a file that was NOT in either task's declared write-set | Audit for undeclared file writes. If worktree isolation is the cause → re-impose sequential, open architect brief. |
| A worktree branch is found containing commits from a different task (c37 pattern) | Hard re-impose sequential. SDK worktree isolation may have regressed. File bug. |
| Two parallel agents both write the same SSOT veto-list file (§ 2c) | PM conflict-check failed. Re-impose sequential for the cycle. Tighten PM pre-check flow. |
| `git worktree list` after a tier shows an orphaned worktree from a previous cycle that was NOT auto-cleaned by the SDK | SDK stale-worktree bug regression. Manual cleanup + sequential mandate for next cycle while investigation proceeds. |

**Rollback procedure:**

1. Edit `docs/protocols/agent-chaining-protocol.md` § Parallel Isolation — revert
   Phase 4 paragraph to sequential-mandate wording.
2. Edit `.claude/flows/dev-team/execute.md` line 49 — revert Phase 4 wording.
3. Edit `docs/policies/dev-standards.md` § Parallel Agent Dispatch — revert Phase 4
   wording.
4. Send WORK notification: "Sequential mandate re-imposed — parallel dispatch suspended
   pending architect root-cause. See [cycle number] incident."
5. Architect opens new brief for root-cause before re-enabling parallel dispatch.

Rollback is reversible in one doc-edit pass (3 files). No code, no config, no
infrastructure change.

---

## 7. Open Questions for PO Decision

The following items require PO input before they can be resolved unilaterally. Architect
does not auto-decide these.

**Q1 — WIP cap raise in future sprints.**
This brief recommends WIP=2. If sprint batch sizes grow (e.g. 3 disjoint tasks are
routine), should WIP=3 be permitted under a new architect brief, or should the sub-tier
split pattern (§ 3) be enforced permanently?
*Recommended default: enforce sub-tier split, do not raise WIP cap, until a specific
sprint batch demonstrates the sub-tier pattern creates unacceptable overhead.*

**Q2 — Phase 5 (Worktree Merge Protocol) priority.**
The parent brief defers a formal `docs/protocols/worktree-merge-protocol.md` to Phase 5
(c46+). This includes branch naming conventions, cleanup verification, and orphan-worktree
edge cases. Should Phase 5 be a c46 task (concurrent with first Phase 4 live use), or
deferred further?
*Architect recommends c46 — first live parallel cycle under Phase 4 is the right moment
to discover gaps in the merge protocol.*

**Q3 — QA parallel spawns.**
The parent brief (§ 7, Out of Scope item 3) explicitly defers parallel QA agent spawns.
In c44 and c45, QA ran in parallel across two branches and produced no conflicts (QA
agents read code, write notebook + signal; they do not write to shared SSOT files).
Should QA parallelism be formally permitted under the same eligibility criteria as
developer parallelism?
*Architect flags this as likely safe but does not auto-permit. Needs PO decision +
a minimal verification note (not a full phase).*

**Q4 — Announcement to WORK channel.**
The parent brief Phase 4 roadmap specifies: "Send WORK notification: 'Parallel dispatch
re-enabled — worktree isolation active from c46.'"
Should this be sent by main terminal at the start of c46, or by PM at the close of the
first successful Phase 4 parallel cycle?
*Architect preference: send at start of c46 (informational), not after first cycle
(which would delay the signal unnecessarily).*

---

## 8. Relationship to Parent Brief

This brief is the Phase 4 deliverable of
`docs/architecture-briefs/2026-05-12-sprint-parallel-isolation.md`.

| Parent brief phase | Status |
|---|---|
| Phase 1 — Protocol doc updates | COMPLETE (c43, `6a7008f0`) |
| Phase 2 — dev-team flow Step 3 reconciliation | COMPLETE (c43, `6a7008f0`) |
| Phase 3 — Verification on 2 disjoint real tasks | COMPLETE (c44 PASS + c45 PASS) |
| Phase 4 — Sequential mandate relaxation | **THIS BRIEF** |
| Phase 5 — Worktree Merge Protocol hardening | PENDING (Q2 above) |
