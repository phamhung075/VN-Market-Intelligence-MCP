# Architecture Brief — FIX-SUBAGENT-BRANCH-CHECKOUT-HIJACKS-SHARED-WORKING-DIR

**Date:** 2026-07-31 | **Author:** architect (router-dispatched, coordination_session 64c7c677-0f0f-4cee-a3ce-dba79d70b7ae)
**Task:** `docs/data/orch/orch-state.json` `.task_board.backlog[]` id `FIX-SUBAGENT-BRANCH-CHECKOUT-HIJACKS-SHARED-WORKING-DIR`, P1/M, zone `cross-service/`
**Status:** PLAN-ONLY — no code shipped from this brief.
**BUILD-STANDARD:** not-applicable (bug-fix/hardening class, existing `scripts/git-hooks/` infra extended, no new service).

---

## 0. Verdict up front

- Ship **one new git hook**, `scripts/git-hooks/post-checkout` — installed the same
  tracked-source-plus-symlink way as the existing `pre-commit`/`pre-push`. Default
  disposition: **`enforce` (hard, non-destructive auto-revert to `main`) + fail-loud, fleet-wide,
  on day 1.** This is AC-1 candidate **(a)**. `git checkout <branch>`/`git switch <branch>` in the
  shared/primary working directory is intercepted post-hoc (git has **no** `pre-checkout` hook —
  verified against `git help githooks` on this host's git 2.49.0, not assumed) and, unless already
  on `main`, immediately reverted; the hook's exit status is git's own contractually-documented
  mechanism for propagating that back as a **failed** `git checkout`/`git switch` to whichever
  agent issued it.
- AC-1 candidate **(b)** (real per-agent `git worktree` isolation) is **rejected as the primary
  mechanism for this row**, not rejected outright — reasons in §3. The chosen design is
  worktree-aware by construction (linked worktrees are exempted, live-tested in §2 TEST-4) so
  choosing (a) now does not foreclose (b) later.
- AC-1 candidate **(c)** (schema-level ban on the `branch:` field) is **rejected as this row's own
  primary layer** — the trigger is authored in free-form markdown (PM handoffs, flow docs), not a
  Zod-validated JSON shape, so a schema ban has no surface to bind to and would be exactly the
  "prose can be improvised around" failure mode AC-2 exists to close. It is, however, the
  **single most concrete finding of this brief** (§1.3) and is handed to its rightful owner, not
  implemented here (§4).
- **Critical, previously-undocumented finding (§1.3):** the chosen hook and the adjacent policy row
  `UC-RDL-P7` are not independent siblings — they are a **hard co-requisite pair**. Five live flow
  docs (`developer/main.md`, `developer/microservice-main.md`, `qa/main.md`, `fixer/flow/*.md`,
  `pm/main.md`) **still actively author, verify, and honor** a `task/NNN-*` branch-checkout
  convention, post-dating `UC-RDL-P7`'s own 2026-07-17 PO ruling that dropped this exception.
  Shipping this row's hook with zero coordination will make every M/L developer task's own
  documented `VERIFY: git branch --show-current must equal task/NNN-kebab-description` line fail,
  because the hook will have already reverted HEAD to `main` by the time that line runs. §1.3/§5
  give the exact routing recommendation.
- `next_agent: pm` (not `developer` directly) — mirrors this agent's own flow contract ("Multi-zone
  = list all; PM will split into per-zone subtasks") and the precedent set by the sibling
  sweep-guard brief (`docs/architecture-briefs/2026-07-21-commit-path-peer-index-sweep-guard.md
  §7`): the deliverable's own artifact (`scripts/git-hooks/`) is developer zone, but the
  coordination note in §1.3/§5 needs PM's decomposition judgment, not architect's.
- **AC-4 live positive control: satisfied.** Five scenarios reproduced in a disposable scratch
  repo (never the live project repo) — §2. Transcripts are this session's tool history; summary
  results in §2's table.

---

## 1. Brownfield verification (re-checked raw, not taken on trust)

### 1.1 `git` has no `pre-checkout` hook — verified, not assumed

```
$ git --version                         # 2.49.0
$ ls .git/hooks/*.sample | xargs -n1 basename
applypatch-msg.sample  commit-msg.sample  fsmonitor-watchman.sample  post-update.sample
pre-applypatch.sample  pre-commit.sample  pre-merge-commit.sample  pre-push.sample
pre-rebase.sample  pre-receive.sample  prepare-commit-msg.sample  push-to-checkout.sample
sendemail-validate.sample  update.sample
$ git help githooks | grep -n "checkout"
```
No `pre-checkout` sample exists, and `git help githooks`'s full manpage text has exactly one
hook section that mentions "checkout": **`post-checkout`**, verbatim:
> This hook is invoked when a `git-checkout(1)` or `git-switch(1)` is run after having updated the
> worktree... **This hook cannot affect the outcome** of `git switch` or `git checkout`, **other
> than that the hook's exit status becomes the exit status of these two commands.**

This is the load-bearing constraint the whole design works within: the hook cannot *prevent* the
checkout (there is no pre-hook), it can only detect-after-the-fact and (a) attempt a corrective
action and (b) force the calling command's own reported exit code to reflect what happened. AC-1(a)
literally names this shape ("a `post-checkout` hook that hard-reverts + fail-louds") — confirmed
viable, not assumed.

### 1.2 Live repo ground truth (re-confirms `UC-RDL-P7`'s 2026-07-17 finding, still true today)

```
$ git branch -a                 # only main + remotes/origin/main — zero task/* branches
$ git worktree list
.../VN-Market-Intelligence-MCP   34afa3c03 [main]
/private/tmp/fleet-push-wt-...   bdc0c7e62 (detached HEAD)   # scripts/fleet-worktree-push.sh's
/private/tmp/fleet-push-wt-...   bd6a27013 (detached HEAD)   # own isolated push worktrees —
/private/tmp/fleet-push-wt-...   bd6a27013 (detached HEAD)   # detached, never a named branch
```
Confirms `docs/agent-memory/decisions/2026-07-17-UC-RDL-P7-branch-policy-main-only.md`'s ruling is
still the live, unreversed state of the world: zero legitimate `task/*` branches exist; the only
worktree mechanism actually in production use (`scripts/fleet-worktree-push.sh`) is
detached-at-`HEAD`, never a named branch, and lives in a **linked** worktree, never the primary one
— i.e. it already follows the "no branch checkout in the shared/primary dir" invariant this row
exists to make structural.

### 1.3 The actual, live, still-firing trigger — bigger than the router's framing

`docs/data/orch/orch-state.json`'s row evidence names 4 incidents including "the
FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE developer originating the branch via a PM handoff `branch:`
field." Grep confirms this is not a one-off:

```
$ grep -n "^branch: task/NNN-kebab-name" docs/agents/pm/flow/main.md
75:branch: task/NNN-kebab-name
```
`pm/flow/main.md`'s own handoff template (§3b) **still emits** a `branch:` field in **every**
handoff PM writes — post-dating `UC-RDL-P7`'s 2026-07-17 ruling by 2 weeks. Confirmed live and
active:
```
$ grep -l "^branch: task/" docs/handoffs/*.md | xargs ls -lt | head -1
docs/handoffs/FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE-dev.md   31 jul 03:51   # TODAY
```
This is the literal artifact behind one of the row's own 4 cited incidents, minted **hours before**
this brief. And it does not stop at PM's template — every downstream flow doc that consumes a
handoff still **honors** the field as a hard precondition:

| File | Line(s) | What it does |
|---|---|---|
| `docs/agents/pm/flow/main.md` | 75 | Template emits `branch: task/NNN-kebab-name` in every handoff |
| `docs/agents/developer/flow/main.md` | 51-54, 158 | Pre-code checklist Step 2: `git checkout task/NNN-* \|\| git checkout -b task/NNN-*`, then **`VERIFY: git branch --show-current must equal task/NNN-kebab-description before touching any file`** |
| `docs/agents/developer/flow/microservice-main.md` | 53-57, 161 | Identical Step 2 + VERIFY, for every `dev-<service>` zone agent |
| `docs/agents/qa/flow/main.md` | 37, 42, 114-124, 219-224 | `pipeline` JUMP-TO's **first line** is `git checkout task/NNN-kebab-description`; CLEAN workflow deletes `task/NNN-*` branches |
| `docs/agents/fixer/flow/*.md` | 34, 36, 60, 110 | `git status \| grep task/` — confirm on task branch before fixing |

**Consequence for this row's own design, stated plainly:** these are not 4 independent ad-hoc
mistakes to route around — they are **currently-documented, currently-followed instructions**. This
means the post-checkout hook must not special-case `task/NNN-*` names as "expected" — it must
revert **any** non-`main` checkout unconditionally, precisely because it is the mechanism that makes
these still-live, contradicting-the-invariant instructions **harmless by construction** until
`UC-RDL-P7` STEP2 (already scoped, already `next_agent: ba`, "edits developer+qa+microservice+
fixer+pm+dev-team flows to main-only... edit BOTH the branch-creation half AND the QA-merge half
together — never only branch-creation, that wedges QA merge") physically removes them. It also means
the reverse is true and load-bearing: **shipping this row's hook with zero coordination will
immediately break developer's own `VERIFY` line for every M/L task** — `git branch --show-current`
will report `main` (the hook already reverted it) where the flow doc demands
`task/NNN-kebab-description`. This is `UC-RDL-P7`'s own cited hazard ("wedges QA merge" if only one
half is edited) reproduced through a different mechanism (a git hook instead of mixed doc state) —
same remedy needed either way. §5 gives the explicit sequencing recommendation.

### 1.4 Adjacent rows — dedup boundary (AC-3)

- **`UC-RDL-P7`** (BACKLOG, `next_agent: ba`, STEP1 po-gate already resolved 2026-07-17, STEP2
  unstarted): owns the **POLICY** — rewriting the 5 flow docs in §1.3 plus `commit-convention.md`
  to a single main-only source of truth across the *full* branch lifecycle (creation → merge →
  deletion). This row does **not** duplicate that work and does **not** edit any of those 5 files.
  What this row adds that `UC-RDL-P7` alone cannot: `UC-RDL-P7` is a **prose** fix (rewritten flow
  docs); the row's own evidence is that prose already failed 4x. This row's hook is the
  **mechanical** backstop that holds even while `UC-RDL-P7`'s prose fix is in flight, is stale, or a
  future regression reintroduces a `branch:` field anywhere.
- **`SPIKE-C44-PARALLEL-PROOF`** (BACKLOG, priority low): the permission-**widening** spike for two
  `developer` agents in **worktrees on disjoint zones**, proving parallel dispatch is safe so the
  sequential mandate can be relaxed. Not superseded, not touched. The design chosen here (§4) is
  explicitly **compatible** with — and does not gate — that future state: TEST-4 (§2) proves the
  candidate hook exempts linked worktrees by construction (git-dir vs git-common-dir divergence), so
  when/if `SPIKE-C44` lands and worktree isolation for developer pairs goes live, this hook will not
  need to change to accommodate it. Per AC-3's explicit instruction: **not choosing (b)** here means
  `SPIKE-C44` is **not** a dependency of this row (only would be if (b) were chosen as primary).

---

## 2. Live positive control (AC-4) — disposable scratch repo, 5 scenarios

All 5 built and run in `/private/tmp/.../scratchpad/head-guard-proof/` this session (git 2.49.0,
macOS) — **never the live project repo**. Candidate hook source: §4.1. Full transcripts are in this
session's tool-call history.

| # | Scenario | Result |
|---|---|---|
| **TEST-1 (control, no hook)** | A: `git checkout -b featureX`. B (same working dir): `git add agentB.txt && git commit -m "..."` (bare, no pathspec — the dominant fleet commit idiom). | **Reproduces the bug exactly as reported**: B's commit reachable only from `featureX` (`git log featureX` shows it, `git log main` does not). |
| **TEST-2 (guarded)** | Same sequence, hook installed. | A's `git checkout -b featureX` exits **1** (hook intercepted); `HEAD` is `main` before B ever runs. B's commit lands directly on `main` (`git log main` shows it; `featureX` still exists, at the pre-branch commit, containing none of B's work — `git diff main featureX --stat` shows only that `featureX` is *missing* B's file, i.e. never advanced). **AC-4's exact assertion holds.** |
| **TEST-3 (non-destructive edge case)** | A has an **uncommitted** edit to `shared.txt` that conflicts with `main`'s own committed content (peer C committed a *different* change to `shared.txt` on `main` while A was away). Hook's internal recovery `git checkout main` is attempted. | Git's own built-in overwrite-safety **refuses** the revert (`error: Your local changes... would be overwritten by checkout`). Hook surfaces this verbatim to stderr, exits 1, and **does not force/discard anything** — A's uncommitted content is fully intact, `HEAD` stays off `main` pending manual resolution. Confirms the design is fail-loud-not-destructive, matching this repo's standing "never a lossy fallback" precedent. |
| **TEST-4 (linked-worktree exemption)** | A linked worktree created via `git worktree add -b wt-branch $WT main` (mirrors `scripts/fleet-worktree-push.sh`'s own pattern, minus the `-b`). | Hook is invoked there too (hooks are shared across all worktrees — not copied), but the git-dir-vs-git-common-dir discriminator correctly identifies it as a **linked** worktree and exits immediately: `wt-branch` is left untouched, primary working dir's own `HEAD` (`main`) is unaffected. **This is the finding that makes (a) forward-compatible with a future `SPIKE-C44` worktree world (§1.4).** |
| **TEST-5 (re-entrancy)** | Direct timed `git checkout -qb featureX` (no external `timeout` wrapper — this host has none, per existing repo precedent in `scripts/fleet-worktree-push.sh`'s own header comment). | Completes in **0.39s real time**, exit 1, `HEAD` ends on `main`, **exactly 1** `BLOCKED-BY-POLICY` log line and **exactly 1** `auto-reverted` line — confirms the hook's own recovery checkout (`featureX → main`) does not recurse: the base case (`current_ref == main → exit 0`) naturally terminates it on the very next invocation. |

---

## 3. AC-1 candidate evaluation — why (a), not (b) or (c), as the primary layer

**(a) post-checkout hard-revert — CHOSEN.**
- Zero new infrastructure: extends the exact `scripts/git-hooks/` + `install.sh` symlink pattern
  already shipped for `pre-push`/`pre-commit`/`post-commit`.
- MODE default diverges deliberately from the sweep-guard hook's own `warn`-by-default philosophy —
  stated explicitly, not silently: the sweep-guard chose WARN-first because the *unsafe* idiom
  (bare commit) was the *dominant, currently-legitimate* pattern across 60+ flow docs and a hard
  REJECT default would have blocked the majority of fleet commits day 1 (`2026-07-21` brief §3).
  That risk calculus does **not** transfer here: §1.2 shows **zero** legitimate off-`main` state
  exists anywhere in the live repo today (`UC-RDL-P7`'s own ground truth, re-confirmed), and
  reverting is **not** blocking — it is *self-healing*: the agent that checked out a branch (by
  honoring a stale field or an ad hoc command) simply finds itself back where CLAUDE.md already
  says it should always be, and can keep working. `MODE=enforce` by default is therefore the
  correct, lower-risk choice for this specific hazard, not a stricter posture applied out of
  habit — this is the "why-change" from the nearest precedent, stated for the record.
- Reachable with **zero MCP grant** (AC-2): pure `git` builtins + POSIX shell, fires beneath the OS
  `git checkout`/`git switch` invocation itself — the exact same "beneath the specialist population
  that has no gateway binding" argument that justified the sweep-guard's own hook-not-skill choice
  (`INV-GATEWAY-1`, `docs/architecture-briefs/2026-07-21-...md §1.3`).
- Detection mechanism (`git rev-parse --git-dir` vs `--git-common-dir`) is a **documented, public**
  git contract, not an internal-naming hack like the sweep-guard's own `$GIT_INDEX_FILE`-basename
  discriminator — lower fragility risk than that precedent, worth noting positively rather than as a
  new risk.

**(b) real per-agent worktree isolation — REJECTED as primary, not rejected outright.**
- Blast radius mismatch: the row's own hazard involves **every** agent type (router, dev-team, pm,
  po, developer, architect, agents-architect, qa) sharing one `HEAD` — `SPIKE-C44` is scoped to
  exactly **two `developer` agents on disjoint zones**. Generalizing worktree isolation to the full
  fleet is a categorically larger orchestration change (every agent's `$PROJECT_ROOT` resolution,
  every spawn call site) than this row's own P1/M sizing implies, and `SPIKE-C44` itself is still
  BACKLOG/unstarted even at its narrower scope — adopting the unproven mechanism at 4-8x the
  blast radius as the FIX for a P1 hazard is not the smaller, more durable diff.
- Per AC-3's explicit instruction, this dependency is stated precisely because it is **not**
  incurred: choosing (a) means `SPIKE-C44` is **not** a blocking dependency of this row. Had (b)
  been chosen, `SPIKE-C44` would have to complete and prove the mechanism FIRST, and this row would
  sequence strictly after it — flagged here for completeness, not because that path was taken.

**(c) schema-level ban on `branch:` — REJECTED as this row's own primary layer, but the sharpest
concrete finding here (§1.3) and explicitly handed off, not dropped.**
- The trigger lives in free-form markdown (`docs/handoffs/*.md`, flow-doc prose), not a
  Zod-validated JSON shape (`orch-state.json`'s schema hardening,
  `apps/mcp-server/src/infrastructure/orchStateSchema.ts`, has no `branch` field to ban — confirmed,
  grep returned nothing). A "schema ban" has no enforcement surface to bind to for a markdown file;
  it would collapse back into "rewrite the prose correctly" — exactly the control class (AC-2) that
  already failed 4x, for the same reason the sweep-guard chose a hook over "just fix the 3 skills'
  commit line" as the *sole* control.
- Its *substance* — stop authoring/honoring the field — is precisely `UC-RDL-P7` STEP2's scope, now
  handed a concrete, live, grep-verified target list (§1.3's table) instead of the abstract
  "reconcile branch policy" framing that row previously carried.

---

## 4. Design

### 4.1 `scripts/git-hooks/post-checkout` (new) — live-tested candidate, §2

```bash
#!/usr/bin/env bash
# post-checkout hook — shared-working-dir HEAD guard.
# TASK: FIX-SUBAGENT-BRANCH-CHECKOUT-HIJACKS-SHARED-WORKING-DIR
# SPEC: docs/architecture-briefs/2026-07-31-fix-subagent-branch-checkout-hijacks-shared-working-dir.md §4.1
# Args per git contract: $1=prev-HEAD-ref $2=new-HEAD-ref $3=branch-checkout-flag(1|0)
set -u

branch_flag="${3:-0}"
[ "$branch_flag" != "1" ] && exit 0   # file checkout only — HEAD didn't move, nothing to guard

MAIN_BRANCH="${GIT_HEAD_GUARD_MAIN_BRANCH:-main}"
MODE="${GIT_HEAD_GUARD_MODE:-enforce}"   # enforce (default) = auto-revert; warn = log only

# --- Linked-worktree exemption (git-dir vs git-common-dir; public/documented git contract) ------
git_dir="$(git rev-parse --git-dir 2>/dev/null)"
common_dir="$(git rev-parse --git-common-dir 2>/dev/null)"
if [ -n "$git_dir" ] && [ -n "$common_dir" ]; then
  git_dir_abs="$(cd "$git_dir" 2>/dev/null && pwd)"
  common_dir_abs="$(cd "$common_dir" 2>/dev/null && pwd)"
  if [ -n "$git_dir_abs" ] && [ -n "$common_dir_abs" ] && [ "$git_dir_abs" != "$common_dir_abs" ]; then
    exit 0   # linked worktree — exempt by design (e.g. scripts/fleet-worktree-push.sh); not the
             # shared/primary working dir this guard exists to protect. See §2 TEST-4 / §1.4.
  fi
fi

current_ref="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || echo "DETACHED")"
[ "$current_ref" = "$MAIN_BRANCH" ] && exit 0   # already on main — also the base case that stops
                                                  # the hook's own recovery checkout from recursing
                                                  # (§2 TEST-5)

echo "[head-guard] BLOCKED-BY-POLICY: shared working dir checked out '${current_ref}' — CLAUDE.md NO-BRANCHES invariant (this working dir is shared by every subagent's HEAD)." >&2

if [ "$MODE" = "warn" ]; then
  echo "[head-guard] MODE=warn — NOT reverting (visibility-only). Manually return to '${MAIN_BRANCH}'." >&2
  exit 1
fi

if revert_err="$(git checkout "$MAIN_BRANCH" 2>&1)"; then
  echo "[head-guard] auto-reverted: HEAD is back on '${MAIN_BRANCH}'." >&2
else
  echo "[head-guard] REVERT FAILED — git refused to move off '${current_ref}' (most likely uncommitted local changes that would be overwritten). HEAD REMAINS on '${current_ref}'. Non-destructive by construction (git's own safety refused, this hook never forces/discards) but requires MANUAL resolution:" >&2
  echo "$revert_err" >&2
fi

# Exit 1 unconditionally on a detected off-main checkout (revert succeeded OR failed) -- per
# git's own contract (§1.1), this becomes the exit status of the ORIGINAL `git checkout`/
# `git switch` command, so the calling agent sees its own command "fail" and cannot mistake
# itself for still being on the branch it asked for. Never silent, never 2>/dev/null.
exit 1
```

**Recommended additive enrichment (not in the tested §2 core, cheap to add, matches the fleet's
existing observability convention):** a best-effort `docs/signals/` `bug-escalation` write
(`{from:"head-guard", to:"po", ...}`), same shape/pattern as `scripts/git-hooks/pre-commit`'s own
`write_signal()` — durable evidence beyond stderr, zero MCP/network dependency, never gates the
core decision. Implementer should copy `pre-commit`'s existing `write_signal()` verbatim rather than
re-invent it (it is already local to `scripts/git-hooks/pre-commit`, factor to a small shared
`scripts/git-hooks/_lib.sh` if both hooks want it — implementer's call, not a hard requirement of
this brief).

### 4.2 `scripts/git-hooks/install.sh` — one-line loop extension

```bash
for hook in pre-push pre-commit post-commit; do
```
→
```bash
for hook in pre-push pre-commit post-commit post-checkout; do
```
Same already-proven tracked-source-plus-symlink pattern; a fresh clone or `.git` rebuild
re-installing hooks already covers `post-checkout` the moment this line lands — no new mechanism.

### 4.3 `scripts/git-hooks/post-checkout.test.sh` (new, developer zone)

Persist §2's 5 scenarios as a permanent regression suite, same naming/placement convention as
`scripts/git-hooks/pre-commit.test.sh`. This is the row's own `verification_gate`
(`live_two_agent_concurrent_branch_scenario_no_cross_attribution`) made durable, not a one-time
manual check — protects against a future git version changing `post-checkout`'s documented contract
or worktree `--git-dir`/`--git-common-dir` semantics. Implementer should re-run it against the FINAL
script (not just this brief's prototype) before marking the row DONE, and once more on Linux/CI if
that ever becomes available for `scripts/git-hooks/*.test.sh` (today none of them run in CI —
matches the existing, accepted convention for this test family, not a new gap introduced here).

---

## 5. Routing — `next_agent: pm`, with an explicit coordination note (not a new row)

| Artifact | Zone | Owning agent |
|---|---|---|
| `scripts/git-hooks/post-checkout`, `install.sh` edit, `post-checkout.test.sh` | `scripts/` | `developer` (precedent: sweep-guard family routed `scripts/git-hooks/` work to developer; this brief's own dispatcher explicitly warned not to assume `agent-father` for this zone) |
| `docs/policies/dev-standards.md` — add the canonical-pointer line for `scripts/git-hooks/post-checkout`, mirroring the existing sweep-guard `CANONICAL:SSOT-...` entry convention | policy doc | whichever of developer/agent-father lands the hook last (matches sweep-guard brief §8's own convention) |

**Not this row's artifact, flagged for PM to coordinate, not implement here (AC-3 dedup
boundary):** §1.3's 5-file table (`pm/main.md`, `developer/main.md`,
`developer/microservice-main.md`, `qa/main.md`, `fixer/flow/*.md`) is `docs/agents/` —
**`agent-father`'s** declared `commit_zone.allowed` (`docs/agents/`, `.claude/skills/`,
`.claude/agents/`), confirmed from `agent-father/init.md` directly, not assumed — and is
`UC-RDL-P7` STEP2's existing scope, not a new task to mint. **Recommendation for PM:** given §1.3's
finding that shipping this row's hook with zero coordination will break every M/L developer task's
own `VERIFY` line, PM should either (i) flag to `po`/`ba` that `UC-RDL-P7` STEP2 should be
accelerated/scoped-down to land in the same wave as this row's hook (a minimal "stop
authoring/checking the `task/NNN-*` field" slice, not necessarily the full `commit-convention.md`
consolidation), or (ii) sequence this row's hook rollout to start in `MODE=warn` until that slice
lands, then flip to `MODE=enforce` (the env var exists specifically to make that a config change,
not a code change). Which of (i)/(ii) — or both — is a task-breakdown/prioritization call, which is
explicitly PM's job, not architect's (`init.md` `not_my_job: Task breakdown`).

---

## Test strategy

- `scripts/git-hooks/post-checkout.test.sh`: the 5 scratch-repo scenarios from §2, run manually at
  implementation time (mirrors the accepted `pre-commit.test.sh` convention — no CI wiring exists
  for this test family today, not a new gap).
- Row's own `verification_gate` (`live_two_agent_concurrent_branch_scenario_no_cross_attribution`)
  is satisfied by TEST-2 (§2) — implementer should re-run it against the FINAL script before DONE.

## Risk flags

1. **Rollout coordination risk (§1.3/§5)** — shipping the hook without any coordination with
   `UC-RDL-P7` STEP2 will break the `VERIFY` line in `developer/main.md` and
   `developer/microservice-main.md` for every M/L task until those docs are corrected. Mitigated by
   the explicit PM recommendation in §5 (accelerate a minimal slice, or stage via `MODE=warn`
   first). Not mitigated by this brief itself — that is PM's task-breakdown call.
2. **Residual: simultaneous concurrent `git checkout` invocations** (two agents racing on
   `.git/HEAD`/`.git/index.lock` at the exact same instant) are not solved by this hook — git's own
   locking serializes them, but no claim/TTL exists across that serialization (same class of gap the
   row's own `root_cause` text names as a pre-existing, more general hazard). The row's own evidence
   describes a **sequential** race (A checks out, *then* B commits), which this design closes
   completely (§2 TEST-2); a true simultaneous-checkout race is out of scope here, flagged as a
   follow-on, not blocking this row's `verification_gate`.
3. **Stash-pop incident (4th cited occurrence) not independently reproduced** — the evidence
   describes "the head-stamp developer's transient stash-pop failure from the same root cause."
   `git stash pop`/`apply` do not themselves fire `post-checkout` (they use a 3-way merge, not the
   checkout machinery), so this fix does not directly instrument that command. It is expected to be
   covered **indirectly**: the fix collapses "off-`main` dwell time" system-wide from unbounded
   (however long an agent works on a branch before someone else acts) to near-zero (one hook
   execution, ~0.4s per §2 TEST-5), which shrinks the window for any downstream symptom sharing this
   root cause, including a stash/checkout race — this is inference, not a dedicated live
   reproduction, and is named here so it is not silently assumed proven.
4. **`MODE=enforce` default is a deliberate divergence from the sweep-guard hook's `warn` default**
   — justified in §3, not a copy-paste inconsistency; flagged so a future reviewer does not
   "fix" it into matching the other hook's default without re-reading the reasoning.

## Scan clean: true ✓
