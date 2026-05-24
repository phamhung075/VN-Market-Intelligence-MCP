---
title: "PO Ratification — Commit-Mutex / Advisory Lock on main (Structural Fix)"
date: "2026-05-24"
author: "po"
type: "ratification-decision"
verdict: "RATIFIED-WITH-CONDITIONS"
brief_ratified: "docs/architecture-briefs/2026-05-24-commit-mutex-on-main/00-design.md"
brief_commit: "fbcb9e41"
commission_signal: "docs/signals/po-20260524T023538Z-commit-mutex-structural-fix-commission.json"
architect_done_signal: "docs/signals/architect-commit-mutex-brief-done-20260524T140000Z.json"
frozen_anchor: "debba8eaff0724d1fb32fc9d28640201cc32d1cc"
next_actor: "developer"
---

# PO Ratification — Commit-Mutex on main

## Verdict: RATIFIED-WITH-CONDITIONS

The architect's commit-mutex design (`docs/architecture-briefs/2026-05-24-commit-mutex-on-main/00-design.md`,
commit `fbcb9e41`) is **sound in mechanism and correctly scoped to the no-branches constraint**. It is
ratified for implementation, subject to four binding conditions (C-1..C-4) that close gaps I found during
this decision cycle. None of the conditions block the design philosophy; they tighten the implementation
contract so the fix does not reproduce the very bug it cures.

This is a focused ratification cycle — NOT a sprint. No channel audit, no sprint planning. Per commission
signal `sequence_order: 3`, this is concurrent / important-not-urgent and does not consume a WIP pilot slot.

---

## 1. Assessment Against the Five Requirements

### (a) Does it actually close the verify→commit race? — YES.

The race (brief §1) is: Agent-A `git add` → Agent-B `git add` lands in the window → Agent-A
`git diff --cached` sees clean → Agent-A `git commit` sweeps B's files. The mutex (§3.3) wraps the
**entire** `git add → git diff --cached verify → git commit` as one atomic critical section held by a
single fleet-wide singleton lock (`task_id: commit-mutex:main`). No concurrent `git add` can land between
verify and commit because no second agent can be inside the critical section at all. The verify and the
commit become atomically sequential within the lock. This is the correct and complete elimination of the
window — not a mitigation. **Confirmed against incident evidence in my own notebook**: the fleet
commit-race bit the api-gateway terminal close THIS cycle (concurrent pilot unstaged my files between
`git add` and `git commit`, commit exit 1). The mutex makes that impossible.

### (b) Does it preserve NO-branches / NO-worktrees? — YES.

`task_claim` / `task_release` are SQLite row operations on `data/coordination.db` (verified present:
`data/coordination.db`, 0-byte live-locks DB — write-light by design). No git branch, no worktree, no
history rewrite (§5). All commits continue to land on `main`. I verified the frozen anchor
`debba8eaff0724d1fb32fc9d28640201cc32d1cc` **IS currently an ancestor of HEAD** (`git merge-base
--is-ancestor` → YES) and the design touches nothing that could disturb that ancestry.

### (c) Will cron/background agents truly honor it (enforced, not requested)? — YES IN PRINCIPLE, with a scope correction (C-1).

The enforcement model (§4.2) is correct: the commit step inside each flow is the ONLY path to the git
index; an agent that bypasses the skill bypasses its own flow, which is a fail-loud output-boundary
violation (`docs/protocols/fail-loud-protocol.md` § Output Boundary). Cron agents reload their flow each
tick (§4.3), so they pick up the wired skill automatically — no per-agent config change. This is genuine
flow-level enforcement, not a polite request.

**BUT the brief understates the wiring surface.** §4.1 step 2 and acceptance criterion §10.3 say "every
`.claude/flows/*/main.md`". I enumerated the fleet: **38 flow files contain a raw `git commit`, and 20 of
them are NOT `main.md`** — they are sub-flows (`alert-commander/stage-dispatch-log.md`,
`dev-team/post-cycle.md`, `dev-team/execute-tier.md`, `pm/task-archive.md`,
`financial-analyst/stage-log-notify.md`, `tran-ngoc-bau/auto-cure-and-handoff.md`, `po/channel-audit.md`,
`market-watcher/cycle.md`, `qa-responder/cycle.md`, `report-analyzer/cycle.md`, all four `agent-father/*`,
all four `unified-agent/*`, `digest-predict/monday.md`, `developer/feature-spike.md`). A `*/main.md`-only
wiring would leave 20 commit sites unguarded — and those include high-frequency cron committers
(market-watcher, report-analyzer, qa-responder) that race exactly like the pilots do. I also confirmed the
existing `.claude/skills/commit/SKILL.md` is a **manual `/commit` slash command, NOT wired into any flow**
(grep: zero flows route through it) — so there is no pre-existing single choke point; the new skill must be
wired into all ~38 raw commit sites. This is **C-1** below.

### (d) Is stale-lock handling adequate (crash mid-commit)? — YES.

TTL=60s reclaim (§3.6) is the right mechanism and is already proven in the live task-lock system
(`docs/protocols/task-lock-protocol.md` — Phase 1 shipped 2026-05-20, container-verified, image digest
sha256:598b94c7…). Crash mid-critical-section or crash-before-release both resolve via TTL expiry in ≤60s;
next claimer wins. No heartbeat needed for a 2–10s operation — correct call (heartbeating it would add
pointless MCP round-trips). The 6× headroom (60s for a 2–10s op) is well-judged. The design also correctly
distinguishes this agent-level mutex from git's own `.git/index.lock` (§3.6, `[[feedback_git_stale_locks]]`)
— both layers needed, complementary.

### (e) Gaps — three real ones, bound as C-2..C-4.

1. **The implementation diff is itself a large cross-cutting commit that needs the mutex but lands BEFORE
   the mutex is live (bootstrap paradox).** Wiring ~38 flow files + authoring the skill + amending the
   protocol doc is a big multi-file change committed under the interim whole-worker serialization, which is
   exactly the regime that is leaking. → **C-3**: implementation must be sequenced as small, single-purpose
   commits (skill-author commit, then protocol-doc commit, then flow-wiring in batches), each staged with
   explicit paths + `git diff --cached --name-only` verify immediately before commit, under the interim
   single-committer policy. Do NOT land it as one mega-commit.

2. **R-2 fail-safe (MCP/`task_claim` down) is correct but under-specified for cron.** §3.7/R-2 say "if
   task_claim fails, do NOT commit — skip + bug telegram + fall back to interim serialization." That is the
   right fail-safe (fail-CLOSED, never commit without the mutex). But the interim serialization is a
   human-coordinated policy, not an automated lock — a cron agent in fallback has no automated serializer.
   → **C-2**: the skill's R-2 path must be fail-CLOSED and explicit — on `task_claim` unavailable
   (tool-not-found / db_unavailable, i.e. F3/F5 in the task-lock protocol), the agent SKIPS the commit
   (preserving working tree) and retries next cron tick; it MUST NOT proceed to stage+commit. This must be
   an explicit, tested branch in the skill, not an assumption.

3. **Convoy / starvation of a time-sensitive committer (R-4) under sustained contention.** Backoff is
   ~125s over 6 retries (§3.5), inside one 15-min cron cycle — fine for steady-state 2 pilots. But the
   commission makes 2 concurrent pilots the steady state and the fleet is growing (pilot-6 news-fetch in
   flight). If 3+ committers contend, a slow one can exhaust retries and skip repeatedly. This is LOW
   severity (work is preserved; next tick retries) and NOT a blocker — but → **C-4**: add jitter to the
   backoff (architect already flags this in R-4) and log every give-up to BUG so sustained starvation is
   observable; if observed in practice, raise max_retries or TTL per R-3. Acceptable to ship without
   pre-tuning; just make starvation observable.

---

## 2. Conditions (binding on the developer implementation)

| ID | Condition | Why |
|----|-----------|-----|
| **C-1** | Wire the commit-mutex skill into **ALL flow files that contain a raw `git commit`**, not just `*/main.md`. Developer MUST enumerate (`grep -rl "git commit" .claude/flows/`) and produce a checklist covering all ~38 sites (20 are sub-flows). A `*/main.md`-only wiring is a REJECT. | Brief §4.1/§10.3 say "main.md"; 20 commit sites live in sub-flows incl. high-frequency cron committers. Leaving them unguarded reproduces the bug. |
| **C-2** | The skill's MCP-unavailable path (R-2 / task-lock F3/F5) MUST be **fail-CLOSED and explicitly tested**: if `task_claim` errors or returns db_unavailable, SKIP the commit (preserve working tree), bug-telegram, retry next tick. NEVER stage+commit without the mutex held. | A cron agent in fallback has no automated serializer; an open fallback = the leak returns under MCP outage. |
| **C-3** | Implement as **small single-purpose commits** (skill → protocol-doc → flow-wiring in batches), each with explicit-path staging + `git diff --cached --name-only` verify immediately before commit, under the still-in-force interim single-committer policy. NO mega-commit; NO `-A`/`.`. | The implementation diff itself must not bundle foreign work while the mutex is not yet live (bootstrap paradox). |
| **C-4** | Backoff MUST include **jitter** (R-4) and every give-up MUST log to BUG channel so starvation is observable. TTL/retries stay at 60s/6 as a starting point; tune per R-3 only if observed. | Fleet is growing (pilot-6 in flight); 3+ contenders could starve a slow committer. Observability before tuning. |

Carried-forward (already correct in the brief, restated as non-negotiable):
- Inside the lock, ONLY `git restore --staged <foreign-path>` is permitted; NEVER `git restore --staged
  <own-path>` and NEVER `git reset HEAD <foreign>` (preserves incident-2 fix, commission clause).
- L84 explicit-path staging inside the critical section.
- Anchor `debba8eaff0724d1fb32fc9d28640201cc32d1cc` stays ancestor of HEAD. No history rewrite, no
  branches, no `--force`/`--no-verify`/`--no-gpg-sign`/push-force.

---

## 3. Transition / Interim Policy

The interim FLEET-WIDE SINGLE-COMMITTER SERIALIZATION **stays in force** (per architect done-signal and
commission `in_force_until`). It is lifted only after: (1) developer confirms the skill is wired into ALL
commit sites (C-1 checklist complete), AND (2) the smoke test (brief §10.4) passes, AND (3) at least one
observed cycle runs with zero bundling incidents under the live mutex. PO emits the lift signal at that
point — a separate future decision, not authorized here.

---

## 4. Decision Rationale Summary

The design is the only option that satisfies the absolute no-branches constraint while recovering the
build/test throughput the interim policy sacrifices. It reuses proven, container-verified infrastructure
(coordination.db + task_claim, live since 2026-05-20) rather than inventing a lockfile scheme with no TTL
or visibility. The mechanism genuinely closes the race, not just narrows it. The conditions are
implementation-tightening, not design rejection. **RATIFIED-WITH-CONDITIONS. Proceed to developer.**

Next: developer implements per brief + C-1..C-4. This implementation task is itself large and
cross-cutting — sequence it carefully under the interim serialization (C-3) until the mutex is live.
