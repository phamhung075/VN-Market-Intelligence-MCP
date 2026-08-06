# system-auditor Cycle-Findings Non-Self-Persistence — Root Cause + Structural Fix (plan_only)

**Task ID:** FIX-SYSTEM-AUDITOR-CYCLE-FINDINGS-NOT-SELF-PERSISTED
**Agent:** architect
**Date:** 2026-08-06
**Scope:** design/brief only (plan_only:true) — PM/developer implement.

PO asked for root cause, not another audit re-run, and supplied a discriminator to test: every prior
instance (c40, c44, the 4th telegram-4472 occurrence) is under BACKGROUND-SPAWN conditions; today's
foreground cycles (c51/c52/c53) all committed cleanly. This brief tests that discriminator against live
evidence, then designs a fix that does not depend on trusting either the discriminator or the model.

---

## 1. Discriminator test — result: CONSISTENT WITH, cannot be proven from static evidence alone

`c51`/`c52`/`c53` (07:54Z/08:00Z/08:15Z today) are **re-entrant extended-probe cycles**, fired
synchronously as part of an actively-driven, real-time RAG-service incident investigation this morning
(each cites the prior cycle's own reading and re-probes within minutes — a supervising session was
present and iterating). This is the opposite of "background": nobody drives a re-probe chain unless a
live session is watching. By contrast, every documented loss (c40, c44, telegram-4472) is an ordinary
unattended `*/30`/`0 */4 * * *` cron tick with no supervising session. This is consistent with — but,
from repo-only evidence, does not conclusively *prove* — a background-vs-foreground execution-budget or
turn-lifetime asymmetry (`.claude/skills/dispatch-claim/SKILL.md` itself hedges: a subagent "**MAY**
inherit `CLAUDE_CODE_SESSION_ID` via env" — even an adjacent, simpler property is not stated as
guaranteed for background spawns, so an unverified asymmetry here is a live, not a settled, hypothesis).

**Decisive independent evidence found this cycle (not self-report, not the discriminator itself):** six
orphaned, empty `docs/agent-memory/.auditor-cycle-markers-<FIRE_TICK>.tmp` scratch files currently sit
untracked in the working tree:

| File (FIRE_TICK) | Tier (by cadence) | mtime |
|---|---|---|
| `.auditor-cycle-markers-2026-07-30T16:00Z.tmp` | 2 (`0 */4 * * *`) | stale (checkout-reset) |
| `.auditor-cycle-markers-2026-07-31T00:00Z.tmp` | 2 | stale (checkout-reset) |
| `.auditor-cycle-markers-2026-08-01T04:00Z.tmp` | 2 | stale (checkout-reset) |
| `.auditor-cycle-markers-2026-08-05T17:30Z.tmp` | 1 (`*/30 * * * *`) | 17:34Z (matches tick) |
| `.auditor-cycle-markers-2026-08-05T18:00Z.tmp` | 1 | 18:09Z (matches tick) |
| `.auditor-cycle-markers-2026-08-05T19:00Z.tmp` | 1 | 19:16Z (matches tick) |

Per `docs/agents/system-auditor/flow/main.md` §Step 0d, `$MARKERS_FILE` is created (`: >
"$MARKERS_FILE"`) the instant a cycle wins its fire-election, and is `rm -f`'d "at the very end of the
cycle" — after `scripts/audit-output-contract.sh` runs, which itself runs at/after the Commit step, i.e.
the LAST thing the flow does. **The mere existence of any of these six files is first-party, mechanical
proof that six separate cycles won their fire-election and then never reached their own final line** —
independent of self-report, independent of whether the notebook was specifically the dropped step. None
of the six FIRE_TICKs has a corresponding notebook section (`grep` against
`docs/agent-memory/notebooks/system-auditor.md` — zero hits for all six). All six are Tier-1/Tier-2
routine, unattended cron ticks — none is a re-entrant/supervised extended probe. This is a **4th+, 5th,
and 6th** confirmed instance beyond the 3 PO already had, spanning both cadences over a week, and it was
invisible until this design pass (nobody was grepping for stray dotfiles).

All six marker files are **empty** (zero `[emit-signal]` lines) — meaning whatever killed these cycles
did so before any anomaly-emission happened, i.e. very early relative to the full ~965-line flow, not
necessarily isolated to "the notebook-write step specifically." This reframes the defect one level up:
it is not provably a notebook-write-step bug in isolation — it is a **whole-cycle durability gap**, of
which lost notebook narrative is the symptom PO's own self-report happened to surface.

## 2. Root cause

The system-auditor flow (`docs/agents/system-auditor/flow/main.md`, 965L) has **no durability checkpoint
between "fire-election won" and "cycle fully closed out."** Every step in between — Tier checks, Anomaly
Reporting/DASHBOARD append, Notebook Write (§ line ~786), Commit (§ line ~893, already hardened into
`scripts/auditor-notebook-commit.sh` per that script's own header: *"Flow-step drift on a narrated
sequence cannot be trusted for a hard invariant — the mutex claim/release must be executed code, not
prose the model may skip"*), FIRE_TASK_ID release, `$MARKERS_FILE` cleanup — depends on ONE continuous
model turn surviving from start to finish. If the turn ends anywhere in that span (haiku-tier budget
exhaustion on a long, heavily lazy-loaded, multi-tool-call flow; a possible background-spawn turn-budget
asymmetry per §1; any unhandled transient tool error the flow doesn't explicitly branch on), **everything
downstream is silently lost** — there is no external signal that it happened, because nothing outside the
dying turn is watching for it.

The already-shipped `auditor-notebook-commit.sh` hardening protects exactly one failure mode: *"the model
reached the Commit step but the flow-doc prose for the mutex claim was unreliable."* It provides **zero**
protection against *"the model never reached the Commit step at all"* — which the six orphaned markers
show is the more common failure. Converting the tail of the flow into a script did not shorten the
at-risk span that precedes it.

The specific symptom PO flagged (agent cites an unrelated peer session's c44 entry as its own
corroboration) is the behavioural signature of a model running low on effective budget near the end of a
long narrated sequence: it reads prior notebook content at Step 0b, and — instead of freshly composing
and writing NEW content late in the same turn — regurgitates already-seen input as if it were its own
output. This is a symptom of the same underlying gap (no checkpoint forces "compose now, durably, before
anything else"), not a separate defect.

## 3. Structural fix (plan_only — design for PM/developer)

### 3a. Immediate: make cycle loss externally, mechanically detectable (cheap, reuses existing infra)

Extend **Step 0b** (notebook-read — the one step every tier of every cycle already executes first) with
a mechanical stale-marker sweep, before any other work:

```bash
STALE_MARKERS=$(find "$PROJECT_ROOT/docs/agent-memory" -maxdepth 1 \
  -name '.auditor-cycle-markers-*.tmp' -mmin +20 2>/dev/null)
```

`+20` minutes comfortably exceeds Tier-1's own normal cycle time (observed: single-digit minutes even for
extended multi-probes) while staying well under Tier-2's 4h gap, so it never fires on an in-progress
sibling tier's cycle. Each FIRE_TICK is literally embedded in the filename — no reconstruction needed.
For each stale hit not already reported (dedup by filename, mirroring the existing dedup-ledger pattern
used elsewhere in this agent): emit ONE `post_agent_signal` (severity WARN, dedup_key
`auditor-cycle-loss:<FIRE_TICK>`) + BUG telegram naming the exact lost tick, THEN `rm -f` it. This closes
the current invisibility gap on the **very next** cycle of ANY tier — typically within 30 minutes of the
loss — without depending on the lost cycle's own model ever getting far enough to self-report. No new
script needed: this is 4-5 lines added to the ALREADY-lazy-loaded Step 0b block, using `find`/`rm`, tools
this agent already has.

### 3b. Root-cause containment: shorten the at-risk span + make the write durable-by-construction

The write step is currently the LAST content-producing action in a ~965-line narrated flow. Two changes,
additive, no new machinery class (mirrors this codebase's own established remediation pattern of
converting narrated "trust the model to reach step N" sequences into script-checked ones — see
`auditor-notebook-commit.sh`'s own header and `FIX-SYSAUDITOR-NOTEBOOK-COMPOSE-ACTUATOR`'s PRE/POST
heading-count guard, both precedents for exactly this class of fix):

1. **Reorder**: move the Notebook Write step to run immediately after each tier's own checks conclude
   (i.e., as the FIRST post-analysis action), ahead of the Anomaly Reporting/DASHBOARD-append/
   OUTPUT-CONTRACT sequence that currently precedes it. Pure reordering — the content available to write
   does not change, only how many further steps must survive AFTER composition. (Signals/DASHBOARD rows
   are already emitted inline during the tier checks themselves, not deferred to end-of-cycle, so this
   reorder does not touch that already-durable path — confirmed by reading the Tier-1/2/3 check bodies:
   `post_agent_signal`/`scripts/emit-dashboard-row.sh` calls happen at the point each anomaly is found.)
2. **Make the composed section durable the instant it exists, decoupled from commit**: write the
   just-composed notebook section text to a per-cycle scratch file
   `docs/agent-memory/.auditor-cycle-draft-<FIRE_TICK>.md` (same lifecycle pattern already proven safe by
   `$MARKERS_FILE` at Step 0d — same directory, same tmp-file discipline) in the SAME action as composing
   it, BEFORE the real notebook Write()/Commit sequence runs. Step 0b's stale-sweep (§3a) is extended to
   ALSO check for a leftover `.auditor-cycle-draft-*.md`: if found, **mechanically** (not by asking the
   model to "remember and re-compose," which is the exact failure mode that produced the false-peer-
   citation symptom) append its already-composed content into the real notebook via the existing
   notebook-write skill's compose step, then commit via the existing `auditor-notebook-commit.sh`, BEFORE
   doing anything else this cycle. This makes a dropped cycle **self-heal on the very next tick of any
   tier** through deterministic script/skill logic operating on already-written content — never through a
   model trying to reconstruct lost analysis from memory.

Net effect: a cycle that dies before reaching its own Commit step now (a) is caught and reported within
one tick via §3a even if §3b's repair path also fails, and (b) has a real, non-regenerated chance of
landing its own findings on the very next tick via §3b, because the expensive part (composing the
finding) was durably persisted the instant it was produced rather than only at the end of a long chain of
steps that may not all survive.

### Files (for PM to route)

- `docs/agents/system-auditor/flow/main.md` — Step 0b stale-marker + stale-draft sweep (§3a/§3b repair);
  reorder Notebook Write ahead of Anomaly Reporting/DASHBOARD/OUTPUT-CONTRACT sequence (§3b.1).
- `.claude/skills/notebook-write/SKILL.md` — extend with the scratch-draft-then-compose step (§3b.2),
  since this pattern is generically useful to any cowork agent with the same long-flow-tail risk, not
  system-auditor alone; keep the change additive/optional so other callers are unaffected until they opt
  in.
- **NOT** `.claude/agents/system-auditor.md` — this design requires no change to the agent definition
  file itself (model tier, tool grants, description are unaffected); per standing PO constraint, any
  future change to that specific file is agent-father's, not developer's — flagging only, not needed
  here.
- New test: `scripts/audits/verify-auditor-cycle-marker-sweep.sh` (synthetic-fixture pattern, mirrors
  `verify-notebook-immutability-gate.sh`) — positive (stale marker/draft present → signal emitted +
  self-heal write lands), negative (fresh in-progress marker within the 20-min window → no false alarm).

## 4. What this does NOT claim

This brief does not claim the background-vs-foreground turn-budget asymmetry is proven — it remains the
best available explanation for WHY cycles die early, consistent with all observed evidence and not
contradicted by anything found, but unverifiable from this repo alone (it would require harness-level
telemetry this agent has no access to). The fix in §3 does not depend on that hypothesis being correct:
it closes the gap regardless of the specific upstream trigger, because it stops trusting any single long
model turn to be the sole durability mechanism.

## 5. DDD / zone

Zone: `cross-service/` (agent flow doc + shared skill, no `apps/**` code). BUILD-STANDARD: not-applicable
(bug-fix/maintenance class, existing agent). plan_only:true preserved — this is the design; PM
decomposes into a dev-team task (likely developer-owned: flow-doc + skill edits + a new verify script,
no agent-definition-file edit required).
