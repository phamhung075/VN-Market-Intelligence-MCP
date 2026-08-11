# Architecture Brief — Chore-Commit Overhead Audit: Real Coordination Cost vs. Avoidable Churn

**Date:** 2026-08-11
**Author:** agents-architect
**Trigger:** router-dispatched skeptical audit — user reviewed raw `git log`, observed `chore` ≈85% of
recent commits vs `fix`/`feat`, and asked whether this is genuine coordination overhead or "fake
working" busywork, and whether it has already been diagnosed.

## 1. Problem statement

The router pulled preliminary numbers before dispatch (chore n≈425/85%, avg≈73 ins/commit; ~5min
inter-commit cadence; 2 hand-spot-checked chore diffs real but small/mechanical) and asked for an
independent re-verification plus a scoped, evidence-backed verdict — not reassurance. This brief
re-derives every number from source, root-causes the commit volume against the flow docs that actually
mandate it, checks whether the volume was already an accepted tradeoff or an unsized gap, and gives 3
concrete, low-risk recommendations (no cron changes, no removal of the crash-safety commit-per-mutation
model).

## 2. Independent re-verification (own count, disagrees materially on ONE dimension)

Re-derived from `git log -500 --pretty=format:'COMMIT|%H|%ci|%s' --shortstat` (span: 2026-08-08T03:39
→ 2026-08-11T14:27, 3.45 calendar days, but ONE 54h dead gap 2026-08-09T08:04→2026-08-11T14:06 — this
lines up with the fleet-wide API weekly-limit outage this very dispatch is a retry from; effective live
window ≈1.4 days):

| Type | n | % | insertions | avg ins/commit |
|---|---|---|---|---|
| chore | 438 | 87.6% | 67,727 | 154.6 |
| fix | 23 | 4.6% | 6,563 | 285.3 |
| docs | 20 | 4.0% | 4,323 | 216.2 |
| feat | 4 | 0.8% | 1,083 | 270.8 |
| others (design/test/audit/pm/arch/qa/ops/spec/revert/signal) | 15 | 3.0% | 3,569 | — |

Count and type-mix **confirm** the router's read (chore ≈85-88% of commits, order-of-magnitude match on
fix/feat) — the ~13-commit chore-count delta (438 vs ≈425) is immaterial (sampling-window boundary).

**The insertion-volume number materially disagrees, and the reason is itself a finding (§3).** Raw chore
avg is 154.6 ins/commit — ~2x the router's ≈73. Median chore commit size is only **34.5 lines** —
most chore commits ARE small and mechanical, matching the router's spot-check. The average is dragged up
entirely by ONE commit: `328f1c85d` (`chore(signals): drain + prune 2026-08-11T12:25Z`, landed ~2h before
this investigation) added **+33,063 insertions / +1.76MB** to `orch-state.json` alone. Excluding that one
commit: 34,575 ins / 437 commits = **79.1 avg** — matching the router's ≈73 closely. **This is not a
disagreement about methodology — it's a real, active bug that landed between the router's sample and
this one (§3).**

Cadence: median gap between ALL commits fleet-wide (all agents, all types) during live windows = **87.5s**,
mean ≈208s (~3.5min) — same order of magnitude as the router's "~5min sampled" estimate, actually tighter.
Consistent with automated per-cycle commits, not batched human-paced work — confirmed, not merely assumed.

## 3. Finding 1 (concrete bug, not a cadence issue) — unbounded `payload_ref` inlining spikes single commits by hundreds of KB

`docs/agents/dev-team/flow/drain-signals.md` §0a-D's durable-drain design (FIX-DEVTEAM-IDLE-CHAIN-P2A-
DURABLE-DRAIN, 2026-08-08) inlines the FULL content of any `payload_ref` target into the durable
`dev_team_idle_chain.pending_triage_inbox` envelope — "payload inlined, never a pointer (same
dangling-ref-avoidance rationale as FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE)." That rationale is correct for
`docs/signals/processed/{filename}` targets (which get moved/renamed and could dangle) — but system-
auditor's `db_integrity_breach` signals point at `docs/data/db-integrity-history.json`, a **stable,
never-moved, unbounded accumulator file** (161 entries, 745KB today, confirmed live — no rotation/cap
visible in `scripts/db-integrity-history-append.sh`). Every drain of a `db_integrity_breach` signal
re-inlines the ENTIRE cumulative history.

Confirmed live in commit `328f1c85d`: the +33,063-line spike is exactly TWO near-duplicate
`db_integrity_breach` payloads (~599,577 and ~599,573 bytes each) inlined into `pending_triage_inbox` in
one tick. **This single commit accounts for ~49% of ALL insertion volume across the 438-commit chore
sample** — it is the dominant reason the raw insertions/commit metric looks ~2x worse than a sample
taken hours earlier would show. Not fabricated, not empty — the router's spot-check verdict (real,
non-fabricated diffs) holds; the content itself is just unnecessarily duplicated.

**Recommended fix (R3, see §6):** size-gate the inline-vs-pointer decision in `drain-signals.md` §0a-D.

## 4. Finding 2 — structural driver breakdown of the 438 chore commits (own count, top scopes ≈93% coverage)

| Driver | n | % of chore | Structurally required? |
|---|---|---|---|
| Agent notebook commits (`memory/*`) | ~174 | 40% | Yes — explicit SSOT (§5), one commit/agent/cycle by design |
| `orch-state.json` board bookkeeping (head resets, DRS stamps, lane moves) | ~69 | 16% | Yes — CAS-guarded concurrent-writer safety, mandated by CLAUDE.md orch-apply.sh contract |
| Signal drain+prune (dev-team Step 0a) | ~59 | 13% | Partially — write is required; file-churn component is not (§5, R2) |
| system-auditor family (DASHBOARD rows + audit-cycle logs + heartbeats) | ~53 | 12% | Write/readback yes; per-finding COMMIT granularity is avoidable (§6, R1) |
| Task-board cold-evict / bookkeeping | ~33 | 8% | Investigated, found deliberate (§5) — no change recommended |
| qa reports | ~11 | 2.5% | Not investigated this cycle — out of scope |
| Remainder (scattered, n≤9 each) | ~33 | 8% | Not investigated this cycle |

## 5. Finding 3 — governance check: partially an accepted tradeoff, partially an unsized/stalled gap

- **Existence is policy-accepted.** `docs/policies/commit-convention.md` § Exempt Categories explicitly
  lists `chore(memory/<agent-id>): notebook YYYY-MM-DD`, `chore(tasks): ...`, and `chore(signals): drain
  ...` as expected, no-`Task:`/`AC:`-required bookkeeping. § Notebook Commits explicitly mandates "one
  commit per agent per cycle — do not batch multiple agents into one commit" — a deliberate isolation
  choice (zone/commit-boundary integrity), not an oversight.
- **Aggregate volume/rate was never sized.** Grepped `docs/policies/`, `docs/architecture-briefs/`,
  `.claude/skills/` for "commit volume/budget/rate/frequency/overhead/noise" — no document sets a target
  or discusses an acceptable ceiling for commits/day. Existence ≠ sizing. This part of the router's
  question is a genuine, previously-unsized gap.
- **But the specific overhead pattern being asked about here has already been diagnosed twice, with
  mixed follow-through:**
  - `docs/architecture-briefs/2026-05-21-token-toolcall-economy.md` § L-7 proposed batching
    market-watcher + news-scout per-cycle notebook **commits** (write stays every cycle) into a single
    EOD commit during active hours, est. "~54 fewer git commits per trading-day." **Confirmed SHIPPED
    and live today** (`docs/agents/market-watcher/flow/cycle.md:283`, `eod.md:84`,
    `docs/agents/news-scout/flow/stage-log-notify.md:14`) — this is direct, already-proven-safe prior
    art for R1 below (write-every-cycle / commit-less-often is not a new pattern for this fleet).
  - `docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md` finding
    `auditor-signal-loop-I11` flagged "signals.db and 1475 processed/*.json git-tracked and
    rewritten/unlinked by every drain — perpetual dirty tree plus dozens of churn commits per week"
    (54 commits/7days ≈7.7/day at the time), with proposal `P7` (untrack both from git, disk-only,
    full history already lives in `docs/data/orch/archive/`). **Only HALF shipped**: `signals.db` is
    now gitignored (confirmed: `git ls-files docs/signals/signals.db` → empty), but **536**
    `docs/signals/processed/*.json` files remain git-tracked and are still staged/committed on every
    drain tick (`drain-signals.md` still runs `git add -- docs/signals/processed/`). The rate this
    finding flagged has since **grown**, not shrunk — 45 `chore(signals): drain + prune` commits landed
    in this sample's ≈1.4 effective live days (≈32/day), vs ≈7.7/day in July. This IS the genuine
    "diagnosed but stalled" gap the router asked about.
- **Investigated and dropped (worth stating precisely, not padding the list):** PM's
  `done_verified[] > 0` immediate cold-evict trigger (`docs/agents/pm/flow/main.md`) initially looked
  like an inconsistent threshold vs. the sibling `done[] > 10` batching rule (19 cold-evict commits in
  this sample, 17 of them in one day). Traced to `docs/architecture-briefs/2026-06-26-orch-state-hot-
  cold-split.md` §7 HSC-6: "evict IMMEDIATELY... done_verified[] lane never grows beyond 5 items" is the
  **deliberate original design** (hot-file-bloat prevention), not an oversight. No functional/correctness
  reason found to relax it — no change recommended here.

## 6. Verdict

**Real, not fake-work — but not fully right-sized either.** The large majority of chore-commit volume is
structurally mandated by the coordination model's own crash-safety/CAS/audit-trail design (confirmed by
reading the actuator scripts' own documented rationale, not merely asserted): concurrent orch-state
writers need CAS-guarded atomic commits, per-agent notebooks need isolated per-cycle commits for
zone/audit-trail integrity, and system-auditor's per-finding WRITE+READBACK is a deliberate anti-false-
green mechanism that must not be batched. The user's underlying worry — "are agents fabricating busywork
to look active" — is **not supported by the evidence**: every commit family checked carries real content,
and the ones that look most repetitive (cold-evict, drain+prune) are each traceable to a specific,
documented design decision.

What IS real overhead: (a) one active bug currently ~doubling the apparent insertion-volume metric
(§3); (b) one already-approved fix from a month ago that stalled half-implemented and got worse in the
gap (§5, drain+prune file-churn); (c) one commit-granularity choice (system-auditor per-finding commits)
that is stricter than the crash-safety property it protects actually requires, with proven-safe prior
art already in production elsewhere in the fleet for the exact same pattern.

## 7. Recommended fixes

**R1 — [HIGH confidence, LOW risk] Batch system-auditor's per-finding GIT COMMIT to end-of-tier-cycle;
keep per-finding WRITE+READBACK unchanged.**
`scripts/emit-dashboard-row.sh`'s own header already treats commit as decoupled, non-blocking bookkeeping
("a commit-failure ... does NOT flip this call's success/count status") — the write's crash-safety
property does not depend on immediate commit. Change: accumulate written-row state across a tier's
finding loop, move the actual `git commit` to ONE call at end-of-tier
(`docs/agents/system-auditor/flow/main.md` / `tier1-probe.md` post-cycle step) covering every
`DASHBOARD.md` + `signal_queue` mutation from that cycle. Precedent: `docs/agents/market-watcher/flow/`
+ `docs/agents/news-scout/flow/stage-log-notify.md` already ship exactly this write-every-cycle /
commit-once-per-session split (L-7, §5) — this generalizes an already-validated pattern, not a novel one.
Est. impact: system-auditor family ≈53/500 commits (12%) → roughly halves if avg ≈2 findings per
finding-bearing cycle, saving **~25 commits/500-window (~5% of total volume)**.
Zone: `scripts/emit-dashboard-row.sh` + `scripts/emit-audit-signal.sh` (developer) +
`docs/agents/system-auditor/flow/main.md`/`tier1-probe.md` (agent-father) — route PM→dev-team (mixed
zone, not agent-father-solo).

**R2 — [MEDIUM confidence, finishes a stalled fix] Untrack `docs/signals/processed/*.json` from git.**
`git rm --cached` the 536 tracked files, add `docs/signals/processed/` to `.gitignore`, drop the
`git add -- docs/signals/processed/` line from `docs/agents/dev-team/flow/drain-signals.md`'s
commit-staging step. Full audit trail survives elsewhere (`docs/data/orch/archive/YYYY-MM.json`,
`signal_queue` history, durable `pending_triage_inbox`) — `processed/` is redundant disk-only
bookkeeping, exactly as the original 2026-07-12 P7 proposal assessed (risk: LOW, already reasoned
through). Does NOT reduce commit COUNT (the `signal_queue` mutation still needs its own commit each
drain) — it removes the largest, most volatile file-churn component from every one of the
~45-59 `chore(signals): drain + prune` commits/window, closing a diagnosed-but-abandoned fix.
Zone: `.gitignore` + `scripts/agents-flow/drain-signals.js` (developer) +
`docs/agents/dev-team/flow/drain-signals.md` (agent-father) — route PM→dev-team.

**R3 — [HIGH priority, data-integrity bug — see §3] Size-gate `payload_ref` inlining in
`drain-signals.md` §0a-D.** Cap inline size (e.g. ≤50KB); above the cap, keep the `payload_ref` pointer.
The dangling-ref rationale that motivated "always inline" doesn't apply to `db-integrity-history.json`
(never moved, never pruned — unlike the `processed/{filename}` move targets FIX-DRAIN-PAYLOADREF-DANGLE-
ON-MOVE was written for). Flag-only, out of this brief's scope: `db-integrity-history.json` itself has
no visible rotation/cap and will keep growing — a follow-up for whoever owns
`scripts/db-integrity-history-append.sh`. Zone: `docs/agents/dev-team/flow/drain-signals.md` — flow-doc-
only prose change, agent-father can direct-implement, or bundle into the same PM→dev-team pass as R1/R2.

**Combined estimated impact:** R1 cuts total commit COUNT by ≈5% (concentrated in the highest-frequency
mechanical category); R2+R3 don't reduce count but remove the two largest sources of per-commit byte
volume/git-index churn (R3 alone was ~49% of this sample's total chore insertions). None of the three
touches cron cadence, notebook-commit isolation policy, or the write/readback crash-safety mechanism
itself — all three defer or right-size the COMMIT step on top of writes that already happen exactly as
often as they do today.

## 8. Dependencies / sequencing

- R1 + R2: mixed-zone (scripts/ + docs/agents/) — signal to **agent-father cc pm/dev-team**, PM
  decomposes into atomic dev-team tasks per standard lane split.
- R3: flow-doc-only — agent-father may direct-implement, or fold into the same PM→dev-team batch as
  R1/R2 for one coordinated review pass (recommended, since all three touch `drain-signals.md`/adjacent
  system-auditor emit scripts in the same review session).
- No dependency ordering required between R1/R2/R3 — independent, individually revertible.
- Not in scope here (flagged only): `db-integrity-history.json` unbounded growth (§3); qa/2 and the
  remaining ~33 scattered chore scopes (§4) — not investigated this cycle.
