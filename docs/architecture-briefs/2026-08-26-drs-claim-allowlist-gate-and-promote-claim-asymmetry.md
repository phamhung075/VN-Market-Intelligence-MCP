# DRS claim had no allowlist gate — and the promote/claim compensating-control asymmetry as a class

**Date:** 2026-08-26
**Author:** architect (direct-execute — router dispatched this row straight to architect because DRS's own claim gate is the defect it cannot route through itself)
**Task:** `FIX-DRS-CLAIM-HAS-NO-ALLOWLIST-GATE-OFF-ALLOWLIST-BLIND-DISPATCH` (P0)
**Related:** `FIX-DRS-CLAIM-TRUSTS-CACHED-DISPATCH-LANE-NOT-EFFECTIVE-NEXT-AGENT` (landed earlier the same day; NOT reverted by this fix)

## 1. Verified root cause

`scripts/devteam-backlog-promote-design-router-sweep.jq` applies the ratified
Design-Router Sweep (DRS) agent-identity allowlist
(`is_design_router_eligible` → `is_design_router_allowed`, both in
`scripts/lib/devteam-eligibility.jq`) — the compensating control that makes
DRS's blind auto-dispatch safe at all, since (unlike the Supervised-Lane
Sweep) DRS fires on rows carrying no deliberate-dispatch flag in the
majority of live cases (86/122 at ratification, 2026-07-30).

`scripts/devteam-backlog-claim-design-router-sweep.jq` never called that
predicate. Its candidate filter was exactly:
```
select(.value.promoted_by == "dev-team (design-router sweep)")
| select((.lane | length) > 0)   # .lane = effective_next_agent($detail_items)
```
The string `allowlist` appeared in that file only inside comments;
`is_design_router_allowed` was never invoked. Grep-confirmed before any
change was made.

**Live reproduction (10:07Z dev-team tick, 2026-08-26):** promote correctly
stamped an on-allowlist P0
(`FIX-CYCLE-SNAPSHOT-PRODUCER-NAMES-BY-WALLCLOCK-CONSUMER-LOOKS-UP-BY-NOMINAL-TICK`,
`next_agent: architect`). Claim ignored it and took a *different*
DRS-stamped ready[] row —
`FIX-FLEETPUSH-DISARM-EXISTS-ONLY-IN-UNTRACKED-PLIST-REPO-COPY-SILENTLY-REARMS`
(P0, promoted 2026-08-24T15:46:41Z), whose claim-time
`effective_next_agent()` resolves to `developer` — the dev-role class
BOUNDED-1/SLS/RLC own and DRS is explicitly built never to touch. Both rows
were P0; the older stamp won the `[priority_rank, idx]` tiebreak the
2026-08-26 `FIX-DRS-CLAIM-TRUSTS-CACHED-...` ordering fix introduced,
because that fix (correctly) added the tiebreak but the allowlist gate was
never there to exclude the older, off-allowlist candidate in the first
place. Router caught this pre-spawn and rolled the claim back without
spawning.

**Why the two fixes are related, not the same bug:** the claim-time
re-resolution fix is what makes THIS gap reachable at all — before it, claim
trusted a cached `dispatch_lane` that was itself allowlist-checked at
promote time, so a stale-but-still-allowlisted cache was accidentally safe.
Re-resolving fresh at claim time is still the correct fix (a promote-time
allowlist check says nothing about what the SAME field resolves to later),
but re-resolving without ALSO re-gating on the allowlist converts "stale
cache" into "allowlist bypass." Not reverted here — the gap it exposed is
what this row closes.

## 2. Fix shape — and the scope decision the row asked me to make explicitly

`is_design_router_allowed($detail_items; $allowlist)` takes the allowlist as
a function parameter. The row asked: thread `--argjson allowlist` into the
claim script's own CLI invocation (mirroring promote exactly), or move the
ratified default into the library so the (now two, soon more) call sites
cannot drift independently?

**Decision: the default now lives in the library, as a single named def —
not threaded through claim's CLI invocation at all.**

```jq
def design_router_default_allowlist: ["architect", "ba", "pm", "po", "agents-architect"];

def is_design_router_allowed($detail_items; $allowlist):
  (effective_next_agent($detail_items)) as $na
  | ($allowlist // design_router_default_allowlist) as $al
  | ($na | length) > 0 and (($al | index($na)) != null);
```

Two concrete constraints ruled out "just add `--argjson allowlist` to
claim's invocation, like promote has":

- **jq's compile semantics.** `jq '($foo // "default") as $x | $x'` with no
  `--argjson foo ...` on the CLI is a **compile error**
  (`$foo is not defined at <top-level>`), not a runtime null. Verified
  empirically before choosing a design. This means: if the claim script
  referenced a bare `$allowlist`, every existing call site that invokes it
  without that flag breaks outright.
- **Existing call-site count.** `scripts/devteam-backlog-claim-design-router-sweep.jq`
  is invoked with no `--argjson allowlist` at 9 places today: `main.md`'s
  own DRS claim block, plus 8 fixture invocations across
  `scripts/audits/devteam-dispatch-gate-satisfiability.sh`
  (`AC-DRS-CLAIMTIME-RESOLVE`, `AC-DRS-NULL-LANE-RESOLVABLE`,
  `AC-DRS-NULL-LANE-REFUSE`, `AC-DRS-PRIORITY-ORDER`, the head-guard/negative
  controls, and the rotation-fairness harness). Adding a required
  `--argjson allowlist` would mean editing all 9 in lockstep — the EXACT
  "two call sites can independently drift" failure mode this row warns
  against, just relocated from the *value* to the *CLI plumbing*.

So the claim script calls `design_router_default_allowlist` directly (a
normal jq def reference, not a CLI-bound variable) — zero new CLI flags, zero
existing call sites touched, zero new literal copies. Promote's own
`--argjson allowlist` invocation (main.md, unchanged) is left as the one
caller-visible/audit-trail copy of the value that already existed before
this fix; its own internal fallback (previously a 2nd hand-typed copy of the
same array) now also points at the library def instead of re-typing it — a
pure refactor, no behavior change, verified via a live-board dry-run
(promote still picks the identical top-priority DRS-eligible row).

**Net result:** exactly ONE literal array in the whole repo
(`scripts/lib/devteam-eligibility.jq`'s `design_router_default_allowlist`).
A future PO ruling widening/narrowing the ratified set is a one-file edit,
guaranteed to apply identically to both promote and claim, by construction —
not by convention.

## 3. Claim-side gate

`scripts/devteam-backlog-claim-design-router-sweep.jq`'s `$resolvable`
candidate set now filters through `is_design_router_allowed` in addition to
the existing non-empty-lane check:

```jq
| ( [ $swept[] | select((.lane | length) > 0)
              | select(.row | is_design_router_allowed($detail_items; $al)) ] ) as $resolvable
```

An off-allowlist candidate falls out of `$resolvable` entirely — same
disposition as the existing null-lane refuse case (AC-3): the next
priority-ranked candidate is tried instead; the stamp is left in place
(never cleared, never downgraded, never dispatched) for the row's existing
class of manual/PO pickup to eventually reach it, exactly as an
off-allowlist row was already disposed of at BACKLOG time before ever being
DRS-stamped.

## 4. Regression coverage

`scripts/audits/devteam-dispatch-gate-satisfiability.sh`, alongside the
existing `AC-DRS-CLAIMTIME-RESOLVE` / `AC-DRS-NULL-LANE-REFUSE` /
`AC-DRS-PRIORITY-ORDER` cases:

- **`AC-DRS-ALLOWLIST-GATE`** — an isolated DRS-stamped row whose claim-time
  `next_agent` resolves to `developer` is never claimed (`.head` stays idle,
  `in_progress` stays 0, row stays parked in `ready[]`).
- **`AC-DRS-ALLOWLIST-SKIP-TO-NEXT`** — reproduces the live incident shape
  exactly: an off-allowlist P0 at a LOWER array index (promoted earlier)
  does not starve an on-allowlist P0 ranked behind it; claim skips the
  off-allowlist stamp (leaving it parked) and claims the allowlisted one.

Both were verified to **fail** against the pre-fix claim script (isolated
scratch copy of `git show HEAD:scripts/devteam-backlog-claim-design-router-sweep.jq`,
never the live file) before the fix landed, and pass after — confirming the
regression case actually catches the defect rather than testing a tautology.
Full suite run: both new cases plus every pre-existing DRS/SLS/BOUNDED1/RLC
case pass; the 6 pre-existing failures (`saturated fixture is itself
Zod-schema-valid`, `SLS gate (in_progress<2) is SATISFIABLE...`, and 4
`tNc.json (post-drain candidate) is Zod-schema-valid`) are a pre-existing
baseline unrelated to this fix — confirmed via `git stash` bisection
(present identically with none of this row's changes applied).

## 5. Blast radius — verified, not just measured

The 3 rows named in the incident (stamps deliberately left in place so the
reproduction survived for this fix) were dry-run against a scratch copy of
the LIVE board (never the live file) with the fixed claim script:

| id | next_agent | disposition after fix |
|---|---|---|
| `FIX-FLEETPUSH-DISARM-EXISTS-ONLY-IN-UNTRACKED-PLIST-REPO-COPY-SILENTLY-REARMS` | developer | still parked in `ready[]` — NOT claimed |
| `FIX-MACRO-TE-CHROMIUM-FETCH-BROKEN` | developer | still parked in `ready[]` — NOT claimed |
| `UC-SDF-P2` | developer | still parked in `ready[]` — NOT claimed |

The same dry-run correctly claimed the on-allowlist P0
(`FIX-CYCLE-SNAPSHOT-...`, `next_agent: architect`) into `in_progress[]`
(the lane-move fired; `.head` itself stayed byte-identical only because a
genuinely different task — this one — was live in `.head` at dry-run time,
the existing conditional-guard negative control).

## 6. Class-level finding — promote/claim compensating-control asymmetry — checked BOUNDED-1 / SLS / RLC

The task asked whether the same shape (a compensating control enforced only
at promote time, never re-verified at claim time) exists in the sibling
lanes. Checked all three:

- **RLC (Ready-Lane Consumer):** structurally immune. It has no promote
  script at all — `scripts/devteam-backlog-claim-ready-lane-consumer.jq`
  evaluates every gate (supervised/plan_only exclusion, epic-wrapper,
  `depends_on`, detail-DEFERRED*) directly against live `ready[]` state at
  claim time. There is no promote-time cache to trust, so this bug class
  cannot occur here by construction.

- **BOUNDED-1:** `scripts/devteam-backlog-claim-bounded1.jq`'s ONLY
  candidate filter is `promoted_by == "dev-team (bounded-1 auto-pickup)"`.
  The 2026-08-06 fix (`FIX-DEVTEAM-BOUNDED1-CLAIM-NO-OWN-WIP-RECHECK`) added
  re-verification of WIP budget, priority ordering, and stale-stamp
  draining — but NOT re-verification of promote's own substantive
  eligibility gates (NON-DEV-NEXT_AGENT, SUPERVISED, EPIC-WRAPPER,
  DEPENDS-ON, DETAIL-DEFERRED, PROSE-SEQUENCING). A row whose `supervised`
  flag flips true, or whose `next_agent` is corrected to a non-dev value,
  between promote and a claim that fires in a LATER tick (the file's own
  header documents stamps persisting across ticks) would still be claimed.
  **Lower severity than the DRS gap**, because BOUNDED-1's dispatch target
  is never identity-gated the same way — a claimed row still passes through
  zone-detect's Tier-3 `"developer"` placeholder and Step 3 re-resolution,
  so the worst outcome is a row that should have been held for
  supervised/plan_only handling instead entering the same generic
  autonomous-fix path it would have anyway if BOUNDED-1's OWN gates had
  simply not existed — not a blind dispatch to an unauthorized specialist
  identity.

- **SLS (Supervised-Lane Sweep) PRIMARY path:**
  `scripts/devteam-backlog-claim-supervised-lane-sweep.jq`'s PRIMARY
  candidate set filters on `promoted_by` + a freshly-resolved dispatch lane
  — it does **not** re-verify `effective_supervised && effective_plan_only`
  at claim time. This is the closer analogue to the DRS gap: SLS's entire
  justification for carrying NO agent-identity allowlist (unlike DRS) is
  "these rows are already double human-vetted via supervised+plan_only at
  mint time" (`main.md` § Supervised-Lane Sweep). If those two flags are
  corrected — by a human, or PO re-triage — AFTER promote but BEFORE a
  claim that persists into a later tick, PRIMARY would still claim the row
  and spawn `head.next_agent` DIRECTLY, no zone-detect indirection, on the
  same "already vetted" assumption that no longer holds. Narrower window
  than DRS's (requires a stamp to outlive at least one tick AND a flag edit
  to land inside that window) but the SAME architectural shape: a
  compensating control checked once, at promote, then trusted forever.

**Disposition:** not folded into this row (different scripts, different
call sites, and BOUNDED-1/SLS's own claim scripts already carry unrelated
2026-08-06/2026-08-26 fixes mid-flight — bundling this in would widen this
row's blast radius past its own ACs). Minted
`FIX-BOUNDED1-SLS-CLAIM-NO-PROMOTE-TIME-GATE-RECHECK` (P2, `next_agent:
architect`) into `task_board.backlog[]` in the same board write as this
row's own closeout, so the finding is tracked as an actuated row, not left
in prose only.

## 7. Files touched

- `scripts/lib/devteam-eligibility.jq` — new `design_router_default_allowlist`
  def (SSOT); `is_design_router_allowed`'s internal fallback now points at
  it instead of an empty list; doc comment corrected (no longer claims the
  value is "never hardcoded inside this def" — it now is, deliberately, as
  the single source).
- `scripts/devteam-backlog-promote-design-router-sweep.jq` — internal
  fallback literal replaced with a reference to the shared def (no behavior
  change).
- `scripts/devteam-backlog-claim-design-router-sweep.jq` — new allowlist
  gate on `$resolvable`, using the library default directly (no new CLI
  plumbing).
- `docs/agents/dev-team/flow/main.md` § Design-Router Sweep (DRS) — prose
  corrected to reflect the gate is now enforced at both promote AND claim;
  claim bullet documents the fix.
- `scripts/audits/devteam-dispatch-gate-satisfiability.sh` — two new
  regression cases (§4 above).
