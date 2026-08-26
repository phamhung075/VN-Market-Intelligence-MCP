# PO Notebook

## 2026-08-26T03:48Z — Step 0-SIG triage, 18 envelopes (router-direct, dev-team tick 03:37Z)

Journal: `docs/agent-memory/decisions/triage-20260826T0348Z-po.md` · transform: `scripts/po-triage-20260826T0348Z-mints-and-folds.jq`.
**3 minted · 6 folded · 1 review-row re-routed · inbox 18→0 (readback PASS) · 3 caller/router premises corrected.**

### The three judgements, all of which cut a mint
**1. `ca53b2c4` chef-dish Step 8e folds, not mints.** The router argued correctly that it is a different defect
from the qa-lane P0 `FIX-SWEEPGUARD-BARE-COMMIT-REPEAT-AFTER-BLOCK-...` — then filed for a new arm without
finding `FIX-CHEFDISH-STEP8E-OWNPATHS-EXCLUDES-SYNTHESIS-JSON`, which covers it exactly. That envelope and the
`4d766602` hook signal are ONE incident. It also asks me to commission a fleet-wide "flow write-targets vs
commit pathspecs" sweep: **it already exists** (`scripts/verify-fleet-commit-pathspec.sh`), is RED with 6 FAILs,
and is tracked at `FIX-VERIFYFLEETPATHSPEC-...`. Land that, re-run it, then judge the population.

**2. AC-5 of the `echo … | jq` row is 19 hits / 7 files — not 211/30, not 17/6.** Repo-wide grep says 211, but
23 of those files are `#!/usr/bin/env bash`, where builtin `echo` does not expand escapes. The vulnerable plane
is only flow/skill snippets agents run through the Bash tool (`/bin/zsh -c`). Sweeping 211 = 190+ sites of churn
on a false premise. Reproduced on this tick's own inbox: `echo` → parse error col 6704, `printf '%s'` → 18.
Row re-routed `next_agent` po→agent-father (I cannot self-implement a flow-doc edit; `next_agent=po` is what
stranded it), zone→`docs/agents/`, files 1→7, AC-4 respecified as a readback rather than a narration.

**3. `2c3cd107` is a second victim, not a new defect.** `signal_outcomes` STALE/HIGH (31d) deduped into an
unowned P2 feature epic is the same unanchored table-name `contains()` that
`FIX-DEDUPCHECK-MATCHEDTASKID-UNANCHORED-SUBSTRING-MISLABEL` already names. Its mandated replay list is now 2.

### Mints
`FIX-QADRAIN-DONE-TO-QA-SCORES-BACKWARD-CONSERVATION-ABORTS-WHOLE-DRAIN` **P0**, architect — verified in-file:
the claim script unions `done[]` by design, `FLAT_TASK_LANES` ranks done(5) above qa(4), tolerance is 1, so at
≥2 rows every write aborts and the forward `review[]` rows die with it. `FIX-AUDITOR-DATATIER-DURABLE-TRAIL-
NARRATED-NUMBERS-CONTRADICT-OWN-EVIDENCE` P1 (two arms: ages understated 15.6x/2.8x in a severity-REDUCING
direction; `dedup_skipped=0` vs its own 3). `CLEAN-CTXBLOAT-DISPATCH-CLAIM-SKILL-730L-40405B` P2.

### what-learned
`orch-row-prose-ceiling-check` aborted my first write and it was right — not about my fold, about the **five
bespoke per-tick keys** accreted on the cycle-snapshot row (11953B). Took its sanctioned hatch: migrated all
three history keys verbatim to the journal, set `detail_ref`, row now ~9.7KB with more content reachable.

### Carry-over
- Cycle-snapshot row **P1→P0**: 32 of 36 snapshot files are prior-day decoys spanning 02:20–21:05, so a stale
  24h HIT is the *default* lookup outcome for ~19h and the only guard is each consumer's ad-hoc date check.
  3 arms on one row — architect must verify "one fix closes arms (b)+(c)" before scoping, and split if not.
- **A-32 (telegram 5163) still unlanded and unverifiable** — queue head-of-line starved at 5068–5082 (08-24).
  Refused to mint from a second-hand summary. C-01 by contrast **is** landed (`...STALE-HOST-DB-DECOY-FALSE-
  CRITICAL`, 99 codes on the live container DB) — the caller's "two unlanded CRITICALs" is stale on that one.
- QA-Drain deadlock is **disarmed right now** (`done[]`=6, none `next_agent=qa`); it re-arms at 2. Not a fix.
- `qa[]` still strands 3 rows against `QA_CAP=10`; every `done[]`-origin claim lands in that same lane.
- Push backstop skipped: standing disarm, CI RED on `a73f0f2c7`.
