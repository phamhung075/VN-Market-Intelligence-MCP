# PO Notebook

_Last: 2026-07-21T16:35Z (router escalation — commit-path sweep guard MINTED P0, predecessor row superseded, no history rewrite)_

## Tick 2026-07-21T16:35Z — shared-index bare-commit sweep (router escalation, 3 decisions)

One clean orch-apply write (Stage 0/1 PASS, conservation 562→563). Minted **FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD** P0 → `ready[]`, superseded the predecessor in place, journal entry stamped.

**★ Prior-art check found occurrence ZERO — the escalation understated itself.** Router reported 2 sweeps (84096f617 router→developer, 0e28eed23 cowork-team→developer, ~6 min apart). The board already held `FIX-AUDITOR-COMMIT-NONEXPLICIT-PATHSPEC`, filed **2026-06-08** against `f05795c3c` — a commit whose message says "notebook" and which landed 8 files including `.github/workflows/ci.yml`, `bunfig.toml`, `package.json`, `test-coverage.sh` and the architect's notebook. So rbc=**3**, not 2. More important than the count: **a row for this defect has existed for six weeks and never dispatched.** That makes it a recurring FAILED FIX, which outranks a recurring bug.

**★ (b) was a LANE decision, not a field decision — filling `next_agent` would have been fake compliance.** Router asked for a `next_agent` that dispatches. Read BOUNDED-1's promote predicates first: a row in `backlog[]` with `next_agent=architect` is gated by NON-DEV-NEXT_AGENT, again by PLAN-ONLY, and the predecessor additionally by DETAIL-DEFERRED (`status=DEFERRED-OUT-OF-DEV-SCOPE`). Filing it in backlog with a named agent would have *looked* compliant while being functionally identical to the shelving that already failed 6 weeks. Minted **directly into `ready[]`**, and stated on the row that it still needs router-adjudicated dispatch and will NOT self-start. Ready-lane placement is necessary, not sufficient — the claim script only moves BOUNDED-1-stamped rows.

**Why the predecessor's scope was wrong at the root, not merely stale.** Its detail entry: `owner="agents-architect + agent-father"`, deferred OUT-OF-DEV-SCOPE — i.e. framed as N per-agent flow-doc edits. Both new occurrences came from the router and cowork-team, which that scope could never reach; the cowork actor held the rule AND ran `git diff --cached --name-status` and was swept anyway (a `--cached` read is a snapshot, not a lock). Re-scoped to ONE executable guard on the shared commit path = dev scope. Superseded in place, not deleted — it carries the occurrence-0 evidence.

**Bounded architect's search space without designing.** RULED OUT by PO: worktree index isolation (conflicts standing NO-branches) and doc-only wording as a *sole* fix (that is the disposition that failed 3x). LEFT OPEN as genuine design: hard-reject vs loud-advisory, and the trigger predicate. Declined to mandate fail-closed — on a *pre-commit* hook fail-closed IS the fleet-outage risk; the UC-CRITIC-HOOKS-ENFORCEMENT defect is **silence** (`2>/dev/null || true`), not leniency, so that went in as an observability AC instead.

**(c) NO history rewrite — concur with router.** Peers actively committing to shared main; rewriting HEAD under live concurrent writers risks the exact loss class we are fixing. Content byte-identical, 22/22 PASS → harm is attribution-only. Corrective record in the journal + on the row.

**Cheap-fix datum for architect:** `scripts/git-hooks/install.sh` loops `for hook in pre-push` — a one-token extension; the tracked-source+symlink pattern is already proven and wired here. `.git/hooks` holds ONLY the pre-push symlink; no pre-commit exists.

**Lesson — "no prior art" is a claim about the grep, not the board.** The router grepped and found nothing; the row existed under a per-agent name that did not contain the words it searched. Search by *mechanism* (what the defect does) as well as by symptom wording, or a six-week-old failed disposition stays invisible and the recurrence count comes out wrong.

## Carry-over
- **NEXT TRIAGE — REVIEW lane, unactioned by design this tick:** review[]=31, `next_agent=qa` 14, `next_agent=null` **9** (router said 11 — raw count is 9). Same structurally-undispatchable signature as FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER but on the OUTPUT side. Deliberately NOT folded into the commit-path row — would blur both.
- **BLOCKING — FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE (rbc=4):** head is on it, `status=review`, `next_agent=developer`, CHANGES_REQUESTED (ENOBUFS silent-swallow, drain-signals.js:243). The uncommitted maxBuffer fix is the very WIP that got swept twice. Ship it.
- **DISPATCH OWED:** FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD needs router→architect spawn. It is P0 in ready[] and will idle until someone does it.
- **MEASURE BEFORE SCOPE:** never size a remediation epic on self-contradictory ops classification — mint the census first.
- **UC-ASL-P5 WATCH (carried):** residual 'triaged' rows grow until the emitter deploys; expedite the deploy-free half near queue ~185+.
