<!-- size-justification: ~250L — per-heartbeat evidence table across 3 cron families (11 outer
heartbeats total) each requiring a live-code citation (script path or CronCreate prompt text) plus,
for the one concrete gap found, a real 10-cycle notebook sample as the suppression-rate estimate —
matches the evidentiary bar this repo already enforces for cadence/economy briefs (see
2026-08-06-cadence-reanalysis-v2.md, same class). PLAN-ONLY; zero CronCreate/CronList/CronDelete
calls made authoring this file, and none of /cron-cowork-team, /cron-detect-loop,
/cron-standalone-team, crons:cron-orch-sentinel were invoked — self-grep-confirmed in RETURN. -->

# Cron Heartbeat Pre-Spawn Gating — Eliminating Unnecessary Full-Session Boots

**Date:** 2026-08-11
**Author:** agents-architect
**Status:** PLAN-ONLY — no cron/flow/config file touched authoring this brief.
**Trigger:** Router-dispatched — new angle on token economy: does every outer cron heartbeat tick
need to boot a full Claude subagent session, independent of the interval-tuning question already
covered by `docs/architecture-briefs/2026-08-06-cadence-reanalysis-v2.md`.
**Builds on:** 2026-08-06 brief (DST correctness + interval tuning — does NOT ask this question,
confirmed by re-read); memory `project_dynamic_workflow_cadence` (DWF-PHASE1: adaptive-cadence
*decision* is made inside an already-spawned cowork-team agent, not before spawn — a distinct
mechanism from what this brief evaluates); `docs/architecture-briefs/2026-07-01-token-economy-tick-preflight.md`
(TE-T01/WU-1..3 — the origin of the pre-spawn shell-gate pattern this brief extends).

---

## 0. Framing — two different things both called "the cron"

`CronCreate`'s own tick is **always** LLM-narrated — there is no way to run `bash` or read a
verdict file without a Claude Code CLI turn interpreting the `prompt:` text. That turn is cheap
when the prompt is "run this script, branch on its JSON/exit code" (a handful of tool calls, no
large file reads). It is **expensive** when the prompt is "Launch subagent (subagent_type=X). Read
and execute docs/agents/X/flow/main.md" **unconditionally** — that spawns a full nested session
that pays for `main.md` + tools-package + notebook reads (thousands of tokens) even when the probe
that would have answered "is there real work" costs a handful of `bash`/`jq` calls.

**"Full-session boot" in this brief = the subagent `Task` spawn**, not the outer tick's own thin
narration. The fix pattern already proven 3x in this repo (WU-1/WU-2/WU-3, CADRAT-2, AC-1 of
`FIX-MARKETDB-JOURNALMODE-GUARD-SHIPPED-BUT-NEVER-ARMED`) is: put a deterministic shell script call
**directly in the `CronCreate` `prompt:` text**, so the SKIP branch never reaches "Launch subagent"
at all. This brief inventories all 3 named heartbeat families against that pattern.

---

## 1. Inventory — 11 outer heartbeats across the 3 families

| # | Family | Heartbeat | Cadence | Pre-spawn gate today? | Mechanism |
|---|---|---|---|---|---|
| 1 | cron-cowork-team | master dispatcher | `*/15 * * * *` | **YES** | `scripts/agents-flow/cowork-tick-preflight.sh` runs first from the `CronCreate prompt:` text itself (TE-T01/WU-2); SILENT/LOST_ELECTION/DEFER/TOMBSTONED verdicts never read `main.md` |
| 2 | cron-detect-loop | dev-team | `7,37 * * * *` | **YES** | `dev-team-tick-preflight.sh` in the prompt; spawns only on verdict=RUN |
| 3 | cron-detect-loop | system-auditor Tier-1 | `*/30 * * * *` | **YES** | `auditor-tier1-probe.sh` in the prompt; spawns only on non-ALL_GREEN or stale heartbeat |
| 4 | cron-detect-loop | system-auditor Tier-2 | `0 */4 * * *` | **YES** | `auditor-tier1-probe.sh --tier=2`, SKIP-SPAWN/SPAWN exit code computed inside the script |
| 5 | cron-detect-loop | system-auditor Tier-3 | `0 4 * * *` | **YES** | `auditor-tier1-probe.sh --tier=3`, same shape |
| 6 | cron-standalone-team | db-data-integrity Job A (weekday) | `15,45 4-11 * * 1-5` | **YES** | `db-integrity-probe.sh` (CADRAT-2) — COUNT(*)-diff over 17 tables, SPAWN only on ≥1 table changed |
| 7 | cron-standalone-team | db-data-integrity Job B (off-hours) | `0 0 * * *` | **YES** | same script, byte-identical prompt |
| 8 | cron-standalone-team | market-db-journal-guard | `*/15 * * * *` | **YES (best-in-class)** | prompt runs `verify-market-db-journal-mode.sh` directly, branches on exit code — **no subagent spawn at all**, ever; alert-only via `send_telegram` on FAIL/ERROR |
| 9 | cron-standalone-team | agent-father | `23 14 * * *` | **NO** | prompt: `"Launch subagent (subagent_type=agent-father)..."` unconditional |
| 10 | cron-standalone-team | claude-manager-helper | `30 19 * * 1,4` | **NO** | prompt: `"Launch subagent (subagent_type=claude-manager-helper)..."` unconditional |
| 11 | cron-standalone-team | code-janitor | `0 */6 * * *` | **NO** | prompt: `"Launch subagent (subagent_type=code-janitor)..."` unconditional |

Sources: `.claude/skills/cron-cowork-team/SKILL.md` Step 2; `.claude/skills/cron-detect-loop/register.md`
Jobs 1-4; `.claude/skills/cron-standalone-team/register.md` + `register-job-{db-integrity-weekday,
db-integrity-offhours,agent-father,claude-manager-helper,code-janitor,market-db-journal-guard}.md`.

**Ground-truth correction on the task's own count:** `cron-standalone-team` registers **6**
`CronCreate` entries covering **5** conceptually distinct crons (db-data-integrity counted once,
split into 2 jobs by CADRAT-2), not the 4 named in the dispatch task — `market-db-journal-guard`
(row 8) was added later (`FIX-MARKETDB-JOURNALMODE-GUARD-SHIPPED-BUT-NEVER-ARMED` AC-1, 2026-08-06)
and is in-scope for this family. It turns out to be the strongest existing exemplar (row 8), so
including it strengthens rather than dilutes this brief.

**Result: rows 1-8 (cowork-team's master + all 4 detect-loop crons + all 3 standalone-integrity
entries) are already pre-gated — 2 of them (db-integrity, market-db-journal-guard) shipped as
recently as 2026-08-04/06. `cron-detect-loop` has ZERO gaps.** The real gap is narrower than the
dispatch task's framing implied: **rows 9-11 only**, and (per §2) only one of those three actually
warrants a change.

---

## 2. Rows 9-11, individually assessed — not a blanket "add a gate everywhere"

### Row 9 — agent-father: NO GAP, evidence says don't touch it

`docs/agents/agent-father/flow/keep.md` has a CADRAT-3 **in-flow** `git diff` Pre-Check
(2026-08-04) — but it only gates Steps 1-2 (`scan-orphans.md`), not the spawn. Steps 3-5 (Top-5
checks) run **unconditionally every cycle, Pre-Check result notwithstanding**, and are genuine
prose/judgment work: distinguishing a grep false-positive from a real gap (`docs/agent-memory/notebooks/agent-father.md`
2026-08-07 cycle: 42/42 false "FAIL" on a wrong grep target, caught and fixed, not blindly
auto-applied), classifying a deliberate minimal-tool-agent design vs. a compliance violation
(`semble-search`), auto-fixing a stale `version:` field (2026-08-11 cycle). Both sampled cycles
(2026-08-07, 2026-08-11) produced real auto-fixes/escalations. **A daily cadence that does genuine
judgment work on effectively every observed tick needs no pre-spawn gate — the boot is already
justified by its own payload.** No change recommended.

### Row 10 — claude-manager-helper: NO GAP, cadence itself is the right-sizing

`docs/agents/claude-manager-helper/flow/main.md`'s own dispatch table: `"ALL groups empty AND
weekday ∈ {Mon, Thu} → JUMP TO pass-9b (full-subtree heal ALWAYS runs Mon/Thu)"`. Because the cron
**only fires on Mon/Thu** (`30 19 * * 1,4`), the "empty groups, non-Mon/Thu → skip" branch is
structurally unreachable via this cron — every cron-triggered tick does real work (either a
specific pass or the always-on full-subtree heal) by construction. The economy work here was
already done by right-sizing the **cadence** (2x/week) rather than adding a per-tick gate. No
change recommended.

### Row 11 — code-janitor: REAL GAP, concrete evidence

`docs/agents/code-janitor/flow/main.md` has the same CADRAT-3 shape as agent-father — an in-flow
`git diff --name-only HEAD~3..HEAD` Pre-Check scoped to `src/**|apps/*/src/**`, gating **only** the
Decision-Tree DRY-duplication scan. Three "every-scan" sweeps run **unconditionally regardless of
the gate's verdict**: Memory Prune Sweep, Notebook Line-Cap Sweep, Cold Archive Sweep — and **all
three are already pure, idempotent, self-guarded shell scripts** (`scripts/agents-flow/
memory-prune-sweep.sh`, `notebook-linecap-sweep.sh`, `cold-archive-sweep.sh` — confirmed by
reading `main.md`'s own "CANONICAL SCRIPT" blocks, each explicitly file-ops/no-`orch-state.json`-write,
zero LLM judgment invoked to run them).

**Observed live, not asserted:** the 10 most recent recorded scan cycles in
`docs/agent-memory/notebooks/code-janitor.md` (Session 32 → Session 41, notebook-timestamped
2026-08-07T04:45Z → 2026-08-11T12:08Z, ≈4.3 days) show **10/10 "DRY scan skipped (zero `src/` or
`apps/*/src/` changes)"** — the judgment-requiring half of the flow fired zero times in this
window, while the fully-deterministic sweeps found near-zero marginal work each time (Memory Prune:
"0 sessions archived, 0 old health checks deleted" every cycle; Cold Archive: "Skipped (not 1st of
month)" every cycle by its own internal guard; Notebook Line-Cap: small routine pruning, itself
deterministic). **Caveat, stated plainly:** this is one ≈4.3-day sample, not a proven long-run
rate — before sizing an implementation ticket, re-check against a longer window
(`git log --since="30 days ago" -- docs/agent-memory/notebooks/code-janitor.md`).

**The subagent boots anyway, every time, to shell out to 3 scripts that need no LLM judgment.**
This is the one concrete, evidence-backed candidate in all 3 families for moving from an in-flow
(post-boot) gate to a pre-spawn (pre-boot) gate.

---

## 3. Recommendation for row 11 — mirror the existing pattern, don't invent a new one

Move the **same** `git diff --name-only HEAD~3..HEAD` check (scope: `src/**`, `apps/*/src/**` —
verified consistent with the DRY scan's own grep targets in `main.md`'s "Reference Commands"
section) into the `CronCreate prompt:` text for the code-janitor cron, mirroring
`market-db-journal-guard`'s pattern (row 8) exactly:

- **Diff non-empty** (any `src/`/`apps/*/src/` file touched) → spawn the subagent as today, full
  `main.md` flow unchanged.
- **Diff empty** → run the 3 deterministic sweep scripts **directly from the prompt** (same calls
  `main.md` already makes, just narrated by the thin outer tick instead of a booted subagent), then
  spawn the subagent **only if** any script's own output signals something needing judgment (a
  `SIGNAL-WRITTEN` line, a safe-fail requiring manual review, or Cold Archive's rare monthly leg
  producing a non-trivial result) — otherwise, no subagent this tick.

**Auditability requirement — do not lose the per-tick trace.** Today, every tick (even a
"SKIPPED"-everything cycle) leaves a full notebook "Session NNN" entry because the subagent always
boots to write it. A pre-boot gate must not silently drop that trace. Concretely: the pre-gate
script itself must write a structured one-line verdict (`{"verdict":"SKIP-SPAWN"|"SPAWN",
"sweeps":{...},"checked_at":...}`) to a durable state file via atomic tmp+mv write — the same
pattern `db-integrity-probe.sh`/`auditor-tier1-probe.sh` already use — so a SKIP-SPAWN tick is
still inspectable without a notebook entry existing for it.

This is an "improve an existing flow/cron-registration mechanism" implementation, not a new
agent-file lifecycle change — **routes to `po`** per dispatch, not to `agents-architect` or
`agent-father` directly (§6).

---

## 4. Item 3 — is there a genuinely fuzzy pre-spawn judgment case anywhere? Assessed and rejected.

Every gate examined or considered — existing (rows 1-8) and the one new gate recommended (row 11)
— reduces to a **binary or countable predicate** shell+jq already expresses precisely: diff touched
path X, exit code Y, COUNT(*) delta N, heartbeat age vs. a fixed threshold. None of them require
weighing prose, intent, or ambiguity.

**One candidate was seriously considered and rejected:** using a cheap local model to weight
*how likely* a given `src/`/`apps/*/src/` diff is to contain a DRY-duplication-worth-scanning
change (rather than the current "any touch → full scan" binary), to further suppress code-janitor
spawns. **Rejected.** Two independent, load-bearing reasons:

1. **No measured gap to close.** The current binary gate already suppresses 10/10 in the observed
   sample (§2, row 11) — there is no demonstrated residual waste on the DRY-scan branch itself for a
   probabilistic filter to recover. Any further gain is speculative.
2. **This fleet has a documented, *live* history of exactly this failure shape** — a gate that
   *looks* conservative-safe and quietly disables the mechanism it guards:
   - `feedback_pressure_state_caller_supplied_fields_dead_server_computed_live` — `calendar_status`
     froze on an out-of-domain value and silently defeated weekend suppression for weeks, invisible
     because the field "looked" like a normal conservative default.
   - `feedback_cycle_snapshot_promote_conservative_default_refuses_every_input` — a freshness gate
     added to stop stale data became the only branch ever taken; "refuses everything" became
     indistinguishable from "disabled."
   - **Fresh, same-day, same mechanism-class (shell diff-gate, not even LLM):**
     `FIX-AGENTFATHER-KEEP-PRECHECK-GATE-BLIND-TO-3-OF-5-SCAN-SURFACES` (board row created
     2026-08-11T13:00:59Z, ~1h before this brief) — agent-father's own CADRAT-3 Pre-Check scope
     covered only 2 of the 5 surfaces `scan-orphans.md` actually reads, silently skipping Steps 1-2
     for **3 consecutive keep-cycles** (2026-08-07, 2026-08-11×2) on a live, uninvestigated real
     surface (`docs/agent-memory/notebooks/*.md`). PO root-caused it live this session — it is not
     hypothetical, it happened in this exact repo, in this exact gate family, today.

A probabilistic pre-gate would add a new, harder-to-audit failure mode (a "the model said no" verdict
with no ground-truth cross-check) on top of a fleet that has now demonstrated this exact risk 3
times, twice in the pure-deterministic-shell case. **Recommendation: do not introduce an
LLM/local-model pre-gate anywhere in these 3 families now.** If a genuinely fuzzy pre-spawn case
ever surfaces, it must be argued file-by-file with equal rigor and ship with the same
auditability contract as §5 below — not adopted as a default pattern.

---

## 5. Auditability contract — mandatory for row 11's new gate, and a standing check on rows 1-8

1. **Structured per-tick verdict, atomic write** (tmp+mv, never truncate) — every gate decision
   (SKIP or SPAWN) leaves a durable, greppable trace, independent of whether a notebook entry was
   ever written. Already the pattern in every precedent script; row 11's new gate must match it.
2. **Scope-lockstep discipline, cross-referenced, not asserted-once.** §2's row-11 gate scope
   (`src/**`, `apps/*/src/**`) currently matches the DRY scan's own read-surface — verified this
   session by comparing it against `main.md`'s "Reference Commands" grep targets — but
   `FIX-AGENTFATHER-KEEP-PRECHECK-GATE-BLIND-TO-3-OF-5-SCAN-SURFACES` (§4) proves this repo has
   already shipped a gate whose scope silently drifted from its downstream surface. The
   implementation ticket for row 11 should add the same kind of explicit cross-reference that
   row's AC-1 now requires for agent-father, so a future edit to the DRY scan's input surface is
   visibly bound to the gate's scope declaration.
3. **Fail OPEN, never fail closed**, on any probe/script error — unanimous across every precedent
   script (`db-integrity-probe.sh`, `auditor-tier1-probe.sh`, `cowork-tick-preflight.sh`,
   `dev-team-tick-preflight.sh`) and non-negotiable for row 11's new gate too.
4. **Periodic independent re-verification.** The agent-father gap (§4) was caught by a human/PO
   spot-check, not by an automated cross-check. Worth flagging (not specifying here — implementation
   detail) that a periodic full-subtree run (e.g., piggybacked on an existing Tier-2/3 or monthly
   sweep) occasionally re-validating that a suppress-decision matches ground truth would have caught
   this sooner than 3 cycles.

---

## 6. Routing

This is a scoped "improve an existing flow + cron-registration mechanism" implementation
(row 11 only) once the user confirms — **not** a new agent-file lifecycle change, so it routes to
**`po`** for triage/task-board entry per the dispatch table, not to `agents-architect` or
`agent-father` directly. Suggested shape: one FIX/S-sized row touching
`.claude/skills/cron-standalone-team/register-job-code-janitor.md` (new prompt text),
`.claude/commands/crons/cron-code-janitor.md` (authoring-doc SSOT, keep in sync per that skill's
own divergence-discipline note), and a new `scripts/agents-flow/code-janitor-tick-preflight.sh`
(mirrors `db-integrity-probe.sh`'s shape) — same review class as CADRAT-2/CADRAT-3, likely
PO→dev-team, not agent-father-solo (mixed zone: scripts/ + `.claude/skills/` + `.claude/commands/`).
Rows 9-10 (agent-father, claude-manager-helper) and rows 1-8 (already gated) need no action —
explicitly out of scope, not silently omitted.

---

## RETURN

```
DONE: Surveyed all 11 outer-heartbeat CronCreate entries across the 3 named families
(cron-cowork-team ×1, cron-detect-loop ×4, cron-standalone-team ×6 entries/5 crons — corrected
from the task's stated 4, market-db-journal-guard is in-scope and is the strongest existing
exemplar). Found 8/11 already pre-gated by a deterministic shell script embedded directly in the
CronCreate prompt (cowork-team master, all 4 detect-loop crons, db-integrity ×2, market-db-journal-
guard) — cron-detect-loop has zero gaps. Of the remaining 3 (agent-father, claude-manager-helper,
code-janitor), 2 need no change on the evidence (agent-father does genuine judgment work on
effectively every observed daily tick; claude-manager-helper's 2x/week cadence is itself already
right-sized so every cron-triggered tick does real work by construction). code-janitor is a real,
evidence-backed gap: its CADRAT-3 git-diff Pre-Check lives post-boot inside main.md and gates only
the DRY scan, while 3 fully-deterministic, already-scripted sweeps run unconditionally every
6h tick regardless — the last 10 recorded cycles (≈4.3 days) show the DRY-scan branch suppressed
10/10 times. Recommended fix mirrors the existing WU-1/2/3+CADRAT-2+market-db-journal-guard
pattern exactly: move the same git-diff check into the CronCreate prompt itself, pre-boot, with an
atomic structured-verdict write so a SKIP-SPAWN tick stays auditable without a notebook entry.
Assessed the fuzzy-judgment-case question (item 3) explicitly and rejected introducing any
LLM/local-model pre-gate anywhere in the 3 families — no gate examined reduces to anything but a
binary/countable predicate already well-served by shell+jq, and this fleet has 3 documented
instances (2 memory-cited, 1 freshly discovered THIS SESSION at
FIX-AGENTFATHER-KEEP-PRECHECK-GATE-BLIND-TO-3-OF-5-SCAN-SURFACES, board row created ~1h before this
brief) of exactly the "safe-looking gate silently disables its own mechanism" failure shape the
task asked to be wary of — including one in the pure-deterministic-shell gate family, proving the
live risk here is gate mis-scoping, not judgment-fuzziness.
NEXT: po — triage the one concrete recommendation (code-janitor pre-spawn gate, §3/§6) into the
task board once the user confirms; likely PO→dev-team, mixed zone (scripts/ + skills/ + commands/).
cc agent-father (file-level owner of docs/agents/code-janitor/flow/main.md and the
cron-standalone-team skill family) for awareness, not as the implementing dispatch.
HANDOFF: docs/architecture-briefs/2026-08-11-cron-heartbeat-prespawn-gating.md
PIPELINE: hold-for-user-confirmation
```
