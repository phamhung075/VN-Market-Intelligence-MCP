Architecture Brief — pm Decomposition Closeout: Unreachable Head-Release Step,
Missing Parent Terminal-Disposition, and `next_agent` Mint-Time Omission

Date: 2026-08-14T12:51:14Z
Task: FIX-PM-DECOMPOSE-CLOSEOUT-STEP-UNREACHABLE-PAST-RETURN-AND-MINT-OMITS-NEXTAGENT
(P0, READY, size M, zone multi, owner agents-architect, DESIGN ONLY — implementation
routes to agent-father + developer, zone-split below)
Mode: DESIGN — ready-to-apply patch text for `docs/agents/pm/flow/main.md` (§2 below)
+ a scoped jq/schema spec for `scripts/lib/devteam-eligibility.jq` /
`scripts/devteam-backlog-claim-ready-lane-consumer.jq` / `docs/standards/task-schema.md`
(§4/§5 below). Zero production code changed here.
Author: agents-architect

---

## 0. Dedup check + prior art

Read the 4 refs po already dedup-checked plus their *full* board-row bodies (not just
titles), and one overlap not surfaced by po's dedup note:

- `FIX-DEVTEAM-HEAD-NEXTAGENT-RESYNC-ON-REASSIGN` (ready[], agent-father, WF-2b design —
  `docs/architecture-briefs/2026-08-14-devteam-head-nextagent-write-coherence.md`, this
  agent's own prior brief) — confirmed disjoint. WF-2b's whole mechanism is "`.head.next_agent`
  disagrees with the row's OWN `next_agent`" — occurrence 3 had both reading `"pm"`,
  perfectly coherent, so WF-2b provably declines (this row's own `question.Q5` states this
  correctly; I independently re-derived the same conclusion reading WF-2b's own source).
- `FIX-ORCHSTATE-MINT-FLAGGED-ROW-WITHOUT-RESOLVABLE-HANDLER` (ready[], architect) — scoped
  to `supervised`/`plan_only` rows with BOTH `owner` AND `next_agent` null. Occurrence 3's
  children had `owner` populated (the whole hazard) — outside that row's predicate entirely.
- `FIX-PM-DECOMPOSE-NO-PRIOR-ART-PROBE` (backlog[], architect) — re-minting shipped work.
  Unrelated defect surface.
- `FIX-DEVTEAM-EPICWRAPPER-PARENTHOOD-FIELD-DRIFT-AUTOCLOSE-BLIND` (backlog[], developer,
  P1) — **po's note undersells the overlap here.** Its `scope` field is not only the
  "compensating sweep" (READ side, widening `effective_children`) — it also explicitly
  claims a WRITE side: *"make pm's decomposition path emit [`.children`]"* and *"a parent
  whose decomposition is complete must not retain a stale next_agent... UC-RDL-P4 carried
  `next_agent=pm` for 15.6h after its own `pm_completed_at` stamp"* — and lists
  `docs/agents/pm/flow/main.md` in its own `files[]`. That is the SAME physical edit site
  (pm's Step-3c/4c decomposition-closeout block) this row's Q1/Q4 fix must also touch. Two
  independently-dispatched rows editing the same block of the same file without
  coordination is a direct collision/rework risk. **Ruling (see §6 Reconciliation):** this
  brief's implementation absorbs the WRITE-side half of that row's scope (pm emits
  `.children` + corrects its own row-level `next_agent` on closeout) as part of the single
  coherent Step-3c/4c-successor restructure below; `FIX-DEVTEAM-EPICWRAPPER-...`'s own scope
  should be narrowed by PO to the READ-side sweep (`effective_children` widening in
  `devteam-eligibility.jq` + `devteam-wrapper-autoclose.jq`) and the unrelated
  "child minted into `in_progress[]` instead of `ready[]`" lane-placement bug it also names —
  dropping `docs/agents/pm/flow/main.md` from its `files[]`. Flagged in the signal payload
  so neither implementer silently reverts the other's work.

No existing brief covers "RETURN-block reachability" or "mint-time `next_agent` mandate" —
new ground.

## 1. Live re-verification

`docs/agents/pm/flow/main.md` read in full at 247 lines (current). Confirmed, not assumed:

- **Step 3c's RETURN is a literal `## RETURN` heading at L110**, inside a fenced code
  block that is otherwise indistinguishable in raw-text terms from a real section
  boundary — `grep -c "^## RETURN"` matches it. Steps **3d** (L123), **4** (L133), **4b**
  (L135), **4c** (L144, the FIX-PM-HEAD-RESET-SHAPE fix) all sit textually AFTER it, in
  the SAME unbroken `**N[a-z]?.**`-numbered step family, with NO intervening `## `
  heading or `<!-- jump:X -->` anchor until `## Signal Queue Write Guard` at L162.
  Step 4c's own guard code is correct and (per its own governing memory,
  `feedback_pm_midsprint_decomposition_leaves_head_stale_not_closeout`) matches
  `dev-team/flow/main.md`'s WF-1c full-null idiom byte-for-byte — the bug is 100%
  placement, not content, confirmed by direct read (not by report alone).
- **Steps 4/4b are genuinely a DIFFERENT call context**, not decomposition-tail content:
  Step 4's own text is *"Set task status → in_progress **when developer picks up**"* —
  this is pm's Step-3-of-dev-team-flow re-entry ("Called from: dev-team Step 3 after each
  tier completes"), a LATER, separate invocation. Only **3d** (heartbeat the sprint
  umbrella lock) and **4c** (head release) are actually part of the SAME decomposition-mint
  invocation as 1/2/3/3b/3c. The current numbering interleaves same-invocation content
  (3d, 4c) with later-invocation content (4, 4b) under one unbroken sequence — a second,
  independent documentation defect that makes the reachability bug easy to reintroduce
  even after a naive "just move 4c up" patch (see Q1 fix below — 4/4b need a *home*, not
  just deletion from the current spot).
- **`orchStateSchema.ts:175`**: `next_agent: z.string().optional()` on `TaskSchema` — no
  `.nullable()`. Confirms explicit `null` fails (`z.string()` rejects it), omission passes
  silently (`.optional()` alone). `docs/standards/task-schema.md`'s own field tables (Mandatory
  + Optional) have zero occurrences of `next_agent` — the doc SSOT and the code SSOT
  disagree about whether this field exists at all, let alone whether it's required.
- **`scripts/devteam-backlog-claim-ready-lane-consumer.jq` (RLC) has NO agent-identity
  gate of any kind** — read the full script. Its candidate filter (L121-136) requires only
  `effective_next_agent` OR `effective_owner` be non-empty; `resolved_dispatch_lane`
  (`scripts/lib/devteam-eligibility.jq:339-344`) returns whichever is non-empty, preferring
  `next_agent`, falling back to `owner`; the caller (`dev-team/flow/main.md` § Ready-Lane
  Consumer, L716-769) spawns `head.next_agent` **directly**, explicitly *"Do NOT 'JUMP TO
  execute'... zone-detect's dev-only Tier-3 fallback would silently discard that
  resolution."* This is RLC's own **documented, deliberate design choice** — it trusts
  whatever the minting agent resolved, on the stated assumption that "the row is already
  correctly resident in `ready[]`... carrying a resolved inline `next_agent`" (RLC's own
  problem-statement paragraph, `dev-team/flow/main.md` L720, citing PM/architect
  decomposition rows as the canonical example of what it expects to receive). Occurrence 3
  violated that expectation.
- **Live census, `ready[]`, non-supervised/non-plan_only rows** (89 rows,
  `jq -r '.task_board.ready[] | select(.supervised != true and .plan_only != true) |
  (.next_agent // .owner // "NONE")' | sort | uniq -c`): `developer` 37, `agent-father`
  **17**, `dev-mcp-server` 11, `pm` 4, `architect` 4, empty 4, `qa` 3, `agents-architect` 3,
  `claude-manager-helper` 2, `ba` 2, `NONE` 2, `ops` 1, plus 8 singleton `dev-*` rows. This
  is load-bearing evidence for Q5 below (§7) — `agent-father` is RLC's single largest
  non-dev target today, and DRS's own ratified allowlist (`{architect, ba, pm, po,
  agents-architect}`) **explicitly excludes `agent-father`** for an unrelated reason
  (fleet-wide agent-md blast radius). Naively reusing DRS's allowlist on RLC would silently
  stop dispatching 17 currently-live rows — including, concretely, the very implementation
  row this brief is about to recommend minting for `docs/agents/pm/flow/main.md`.
- **`baseline_pass` re-check:** even the router's hand-repaired UC-CCA-P2 (out of scope,
  not touched) shows `"children": null` on the closed parent — confirming the
  parenthood-field-drift gap (§0, last bullet) is present in the reference-clean state too,
  not only in the 3 defective occurrences. Not a contradiction of the row's `baseline_pass`
  claim (which only asserts `.head`/lane/`next_agent` correctness, not `.children`) — just
  evidence the gap is real and un-addressed by any repair to date.
- **`FIX-READYLANE-...` precedent (commit `86b7a6264`)**: confirms the "closeout-shaped
  decomposition → parent to `done[]`" pattern is already a real, applied convention
  (`in_progress[] -= 1 (parent to done[])`), but it was executed as an ad hoc write, not
  through any documented pm flow step — `pm/flow/main.md` has no step that produces this
  outcome today (the row's own "FOURTH DEFECT" finding, confirmed).

## 2. Q1 — Reachability fix + invariant

**Ruling: restructure in place (move existing steps), never append a new one below the
RETURN — the row's own caution ("appending another step is exactly what failed between
occ 2 and occ 3") is directly binding.** Reject the "single terminal exit" alternative as
the general mechanism: `dev-team/flow/main.md` and `qa/flow/main.md` — the two most mature,
most heavily-load-bearing flow docs in this fleet — both use MULTIPLE named-branch RETURN
exits by design (rotation-selected sections, PASS/FAIL/BLOCKED outcomes), never a single
funnel exit. Forcing pm to a single terminal exit would be an outlier convention, not a
fleet-consistent one, and a much larger blast-radius rewrite than the defect warrants.

**The reachability invariant (mechanically checkable, this is what AC-3's checker
implements):**

> Within any document segment bounded by `## `-level headings and/or `<!-- jump:ID -->`
> anchors (this fleet's two existing branch/call-context markers — see `dev-team/flow/main.md`,
> `qa/flow/main.md`), no numbered-step marker matching `^\*\*\d+[a-z]?[.\)]` may appear, in
> raw document order, AFTER an inlined `## RETURN` block that also lives in that same
> segment. Non-numbered prose reference sections (bold headers with no leading digit —
> commit conventions, skill catalogues, "Pre-commit gate", "Signal Queue Write Guard") are
> exempt — they are cross-referenced from multiple points in a flow, not sequential steps,
> and this fleet already uses that convention safely (confirmed by manual sweep, §3).

This directly targets pm's actual defect shape (a numbered step, same family, after RETURN,
no segment boundary between them) while explicitly NOT flagging the fleet's existing,
legitimate footer-reference convention (would be a false-positive class otherwise).

**Fix, applied to `docs/agents/pm/flow/main.md` (content moves, nothing appended below the
RETURN):**

1. **Relocate Step 3d (heartbeat) and the content of Step 4c (head release) to BEFORE the
   Step-3c RETURN**, renumbered as a continuous **3d → 3e** sequence immediately following
   3c, so the decomposition-mint invocation's own RETURN is truly its last reachable
   element:
   ```
   **3c.** Update task_board (orch-apply write) — unchanged.

   **3d.** Heartbeat umbrella lock — unchanged content, only relocated (was already directly
   below 3c pre-fix, no content change).

   **3e. Decomposition-closeout disposition** (renamed + relocated from 4c;
   FIX-PM-DECOMPOSE-CLOSEOUT-STEP-UNREACHABLE — absorbs the write-side half of
   FIX-DEVTEAM-EPICWRAPPER-PARENTHOOD-FIELD-DRIFT-AUTOCLOSE-BLIND per §0/§6):
   [see Q4 fix, §5, for the full body — terminal-disposition branch + .head release +
   .children write, all ONE orch-apply.sh write]

   Return task list with dependency tiers and zone per task:
   ```
   ## RETURN
   ...
   PIPELINE: continue
   ```
   ```
2. **Relocate Steps 4 and 4b** (the genuinely-later "developer picks up" / "heartbeat
   pre-existing lock" content) to their own explicitly-bounded section — do NOT leave them
   floating in the same unbounded segment as 3d/3e. Simplest, lowest-diff placement: fold
   them into the existing `## Signal Queue Write Guard` predecessor position as a new `## `
   heading directly above it:
   ```
   ## Task Lifecycle — Later-Cycle Steps

   Reached only on a SEPARATE pm re-invocation after the decomposition-mint pass above has
   already returned (dev-team Step 3, "after each tier completes") — NOT part of the same
   invocation as Steps 1-3e.

   **4.** Set task status → in_progress when developer picks up
   **4b.** Heartbeat developer's task lock if pre-existing: [unchanged content]
   ```
   This gives the file an explicit `## `-boundary between the decomposition-mint's own step
   family and the later-cycle step family — the exact segment marker the invariant above
   needs, and prevents a future author from re-creating the ambiguity by innocently adding
   a new step near the old 4/4b location.

**AC-3 executable check (spec, implementation is a companion `developer`-zone row, §7):**
parse every `docs/agents/*/flow/*.md`, split on `## `/`<!-- jump: -->` boundaries, assert
the invariant per segment. Positive fixture: pm's PRE-fix file (or a synthetic excerpt)
must FAIL. Negative fixture: pm's POST-fix file, plus `dev-team/flow/main.md` and
`qa/flow/main.md` as already-passing real-world negative controls (§3 sweep already
manually confirms both pass — the checker's first run against live data should reproduce
that, not contradict it).

## 3. Q2 — Fleet sweep (not validated on pm alone)

Grepped every `docs/agents/*/flow/*.md` for `^## RETURN` (39 files matched). For each,
measured tail-length after the LAST such heading, then specifically checked whether any
`^\*\*\d+[a-z]?[.\)]`-shaped step marker appears in that tail (the pm-defect signature).

**Method + result:** 11 files had a tail >10 lines (`code-janitor`, `dev-mainserver-crawls`,
`dev-vps-crawls`, `fb-market-poster/daily`, `fb-market-poster/weekly-{prediction,recap}`,
`ops-mainserver-fetch`, `ops-vps-fetch`, `po/main`, `po/sprint-kickoff`, `qa/main`,
`system-auditor/main`, `unified-agent/chef-dish` — >10 of the 39). Hand-verified the two
files with multiple `## RETURN` headings (`qa/flow/main.md`, 5; `po/flow/market-group.md`,
2) plus the 3 largest tails (`po/flow/main.md` 70L, `system-auditor/flow/main.md` 40L,
`qa/flow/main.md` 24L after its LAST RETURN) by direct read: in every case, content after
RETURN is either (a) genuinely non-numbered footer/reference material (commit convention,
skills-available, decision-journal pointer — exempt by the invariant's own design, §2), or
(b) a distinctly-anchored branch (`<!-- jump:emergency -->`, `<!-- jump:architect-review -->`)
reached only under a different trigger condition the RETURN's own branch never traverses.
Grep-swept the remaining 8 large-tail files' post-RETURN content specifically for the
`**N[a-z]?.**` step-marker regex: **zero matches in any of them.**

**Conclusion: `docs/agents/pm/flow/main.md` is currently the sole live occurrence of this
exact defect shape in the fleet.** This is a real, if manual, sweep — not an
inference-from-pm-alone. It does not substitute for AC-3's executable checker (§2), which
should still be built and run against the full corpus as a standing regression gate (this
sweep is a one-time snapshot; the checker is what prevents recurrence when any of these 39
files — or a 40th, future one — is next edited).

## 4. Q3 — `next_agent`: SSOT status + enforcement layer

**Ruling: conditionally-mandatory-at-mint, documented in the SSOT, enforced at BOTH mint
(doc/template) and write-gate (machine) — not either alone.** Prose-only compliance is
proven insufficient by this row's own SECOND DEFECT: pm followed `task-schema.md`'s
canonical shape to the letter and still produced an unsafe row, because the doc simply
never mentioned the field. A doc fix alone repeats that exposure for the next minting
agent that doesn't re-read the doc closely enough; a schema-only fix alone cannot express
"required only when owner is non-dev" (a flat `z.string()` un-optional flip would break the
huge existing corpus of legacy rows with dev-role owners that never needed the field, which
is out of proportion to the actual hazard).

**Doc layer (`docs/standards/task-schema.md`):** add `next_agent` to the Optional Fields
table with a **conditional-mandatory annotation**: *"Mandatory at mint time when `owner` is
not a `dev-*`/`developer` role (see `scripts/lib/devteam-eligibility.jq:is_dev_role`).
Every minting agent (pm, architect, PO triage, BOUNDED-1/SLS promote scripts) MUST set this
explicitly — never rely on `owner` as an implicit dispatch target. Omission is legal at the
schema layer (back-compat) but flagged at the write gate (see below)."* Cross-reference the
TypeScript interface comment at `orchStateSchema.ts:175` similarly (comment-only, `.optional()`
stays — see next paragraph for why no type change).

**Write-gate layer (new, `scripts/orch-validate.mjs` — the module `orch-apply.sh` already
calls for Zod+coherence checks, §1's re-verification):** add a conditional check, **WARN +
BUG-telegram + violations ledger, NOT a hard reject, on first landing** — a fleet-wide
mandatory-field flip validated on zero measured data would repeat exactly the
`feedback_fleetwide_gate_validated_on_one_file_optout_allowlist` risk class this row's own
`question.Q2` warns against, just one layer down (schema instead of flow-doc). Check shape:
for any row newly appearing in `ready[]`/`backlog[]`/`in_progress[]` this write (i.e.
present in the candidate document but absent — by `id` — from the pre-write live document,
the same diff-unit `orch-stamp-updated-at.mjs` already computes one step earlier in the
same pipeline) whose resolved `owner` is non-dev-role (`is_dev_role` pattern, already
defined and battle-tested in `devteam-eligibility.jq`) AND `next_agent` is absent/empty:
log a `[orch-validate] WARN: next_agent omitted at mint, row=<id> owner=<owner>` line,
append to a new `docs/data/orch/orch-apply-nextagent-omission-violations.json` ledger
(mirrors the existing `docs/data/auditor-output-contract-violations.json` pattern already
live in this repo), telegram `channel=bug`. **Escalate to hard-reject in a follow-up row
once a measurement window (recommend: 2 weeks or 20 mint events, whichever first) shows the
WARN rate at/near zero** — same staged-hardening discipline this repo already uses for the
SHG `.passthrough()` → `.strict()` promotion and for DRS's own allowlist ("add only once a
real row appears").

**Mint-template layer (pm's own Step 3, folded into the §5/§2 restructure):** the canonical
JSON shape note in Step 3 gains `next_agent` as an explicit field in the template, with the
routing-intent-source instruction from AC-4 (§6 below) inline.

## 5. Q4 — Parent terminal disposition + `.children`

**Ruling: pm decides at decomposition time, encoded as an explicit boolean it writes
(`decomposition_complete: true|false`) rather than left implicit in prose
(`decomposition_note`) — this is what makes the closeout-vs-partial branch mechanically
determinable instead of requiring a future reader to parse English.**

- **`decomposition_complete: true`** (all of the parent row's scope has been delegated to
  the minted children — this invocation is pm's LAST touch on this row) → **closeout-shaped**,
  matching the `FIX-READYLANE-...` precedent (commit `86b7a6264`) formally instead of ad
  hoc: parent row moves `in_progress[]`/`active_sprints[]` → `done[]`, `status: "DONE"`,
  `closed_at: $now`, **`children: [<minted child ids>]`** (closes the write-side half of
  `FIX-DEVTEAM-EPICWRAPPER-PARENTHOOD-FIELD-DRIFT-AUTOCLOSE-BLIND`, §0/§6), full `.head`
  null-out (today's 4c guard, unchanged: only fires if `.head.active_task_id` still names
  this row).
- **`decomposition_complete: false`** (mid-sprint-partial — more decomposition or pm
  oversight remains on this row) → parent row **stays** in its current lane, `next_agent`
  **corrected to a non-stale value** on the ROW ITSELF (not just `.head`) — pm names
  whichever agent should act next (often `"pm"` again, if more decomposition is pending;
  never left as a stale pointer to a stage that already finished). `.head` still gets the
  full null-out (today's 4c behavior, unchanged) — that part of the row's diagnosis was
  already correct.
- **New Step 3e body (both branches, ONE `orch-apply.sh` write, same shape both times, no
  content bifurcation risk):**
  ```bash
  NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  head_active=$(jq -r '.head.active_task_id' "$PROJECT_ROOT/docs/data/orch/orch-state.json")
  if [ "$DECOMPOSITION_COMPLETE" = "true" ]; then
    jq --arg s "idle" --arg t "$NOW" --arg u "pm" --arg sid "$SPRINT_ID" \
       --argjson children "$CHILD_IDS_JSON" \
       '(.task_board.in_progress // []) as $ip
        | (.task_board.active_sprints // []) as $as
        | ( [$ip[], ($as[]?.tasks[])] | map(select(.id == $sid)) | .[0] ) as $row
        | .task_board.done = ((.task_board.done // []) + [ $row + {
              status: "DONE", closed_at: $t, children: $children } ])
        | .task_board.in_progress = [ $ip[] | select(.id != $sid) ]
        | (if $head_active_matches then
             .head = {status:$s, active_task_id:null, next_agent:null, updated_at:$t, updated_by:$u}
           else . end)' \
      "$PROJECT_ROOT/docs/data/orch/orch-state.json" | bash "$PROJECT_ROOT/scripts/orch-apply.sh" \
      || echo "[pm] decomposition-closeout ABORTED — orch-apply.sh failed, live SSOT untouched"
  else
    # mid-sprint-partial: row-level next_agent correction + unchanged 4c head-null-out logic
    jq --arg s "idle" --arg t "$NOW" --arg u "pm" --arg sid "$SPRINT_ID" --arg na "$CORRECTED_NEXT_AGENT" \
       '(.task_board.in_progress // []) |= map(if .id == $sid then .next_agent = $na else . end)
        | (.task_board.active_sprints // []) |= map(.tasks |= map(if .id == $sid then .next_agent = $na else . end))
        | (if $head_active_matches then
             .head = {status:$s, active_task_id:null, next_agent:null, updated_at:$t, updated_by:$u}
           else . end)' \
      "$PROJECT_ROOT/docs/data/orch/orch-state.json" | bash "$PROJECT_ROOT/scripts/orch-apply.sh" \
      || echo "[pm] non-closeout head+next_agent correction ABORTED — orch-apply.sh failed, live SSOT untouched"
  fi
  ```
  (Illustrative — exact jq needs a real re-read/anchor pass by whichever agent implements
  it, per this file's own established brownfield-verified-at-apply-time convention; the
  `$head_active_matches` guard is today's existing 4c precondition, unchanged.)

**AC-2 negative control:** a `decomposition_complete: false` replay must assert the parent
row is STILL present in its pre-existing lane (`in_progress[]`/`active_sprints[]`) post-write,
never moved to `done[]`, with only `next_agent` (row-level) and `.head` (full null-out)
changed — this is the fixture that proves the closeout branch isn't taken unconditionally.

## 6. Reconciliation with `FIX-DEVTEAM-EPICWRAPPER-PARENTHOOD-FIELD-DRIFT-AUTOCLOSE-BLIND`

Per §0: that row's WRITE-side scope bullets (pm emits `.children`; parent must not retain a
stale row-level `next_agent`) are **superseded by this brief's Step 3e design** (§5) — same
file, same edit site, same write. Signal payload (§9) explicitly names both row ids so PO
can narrow `FIX-DEVTEAM-EPICWRAPPER-...`'s `files`/`scope` to READ-side only
(`effective_children` widening in `devteam-eligibility.jq` + `devteam-wrapper-autoclose.jq`)
and its own separately-tracked "child minted into `in_progress[]` instead of `ready[]`"
lane-placement defect, dropping `docs/agents/pm/flow/main.md` from its `files[]` so the two
implementers (agent-father on this row, developer on that one) don't race-edit the same
block.

## 7. Q5 — Is a dev-team-side dispatch gate warranted?

**Split ruling.** Agree with po's dedup analysis on the narrow question asked
(`.head`-vs-row `next_agent` coherence, WF-2b's own shape) — it provably cannot fire on
occurrence 3 (§0). **But that is not the only possible dev-team-side gate, and a
different, narrower one IS warranted** — reject a naive "reuse DRS's ratified allowlist on
RLC" fix (considered and rejected, not just skipped):

- **Why DRS's allowlist is the WRONG mechanism for RLC:** DRS's `{architect, ba, pm, po,
  agents-architect}` allowlist is a POSITIVE allowlist tuned for `backlog[]`'s much less
  vetted candidate pool (86/122 DRS candidates carry no deliberate-dispatch flag at all —
  DRS's own header). RLC's candidate pool is different in kind — a row already staged in
  `ready[]`, RLC's own documented precondition being "the row already carries a resolved
  inline `next_agent`" from a trusted minting agent. Reusing DRS's list verbatim would
  exclude `agent-father` (DRS deliberately excludes it for an unrelated reason — fleet-wide
  agent-md blast radius) — **and `agent-father` is RLC's single largest live non-dev
  target today (17 of 89 non-supervised `ready[]` rows, §1 census).** This would silently
  stall the majority of agent-father's routine RLC-driven dispatch, including the very
  follow-up row this brief is about to recommend (§9). Confirmed via live data, not
  assumed — this is exactly the kind of pre-landing dry-run
  `feedback_gate_widening_recommendation_requires_actuator_dry_run` asks for.
- **The actual hazard is narrower than "any non-dev, non-allowlisted target":** it is
  specifically the **cowork lane** (`dev-team/flow/main.md`'s own Team Boundary taxonomy:
  `news-scout, market-watcher, bctc-analyst, alert-commander, digest-predict, unified-agent,
  tran-ngoc-bau, fb-market-poster, qa-responder, market-analyst, refine_bctc_md`) — agents
  this file's own Team Boundary section already declares *"on-demand only; mutex-wrap
  REQUIRED"* before ANY spawn. RLC's dispatch path (`dev-team/flow/main.md` L738-765) does
  a `task:<id>` sprint-task claim and calls `Agent(head.next_agent, ...)` directly — it does
  **not** perform the on-demand mutex-wrap claim (`task:on-demand:<agent_id>:<date>`) the
  Team Boundary section mandates for cowork-lane spawns. So even independent of the
  "subject vs. editor" semantic confusion (pm's actual bug), RLC would already be violating
  this file's own invariant the moment it resolves ANY cowork-lane identity — a second,
  independently-confirmable reason this specific narrow exclusion is warranted regardless
  of how future minting agents behave.
- **Recommended fix (new predicate, developer zone, §9):** `is_cowork_role($s)` in
  `scripts/lib/devteam-eligibility.jq` (membership test against the fixed cowork roster,
  same style as `is_dev_role`), threaded into RLC's candidate filter in
  `scripts/devteam-backlog-claim-ready-lane-consumer.jq`:
  `select((resolved_dispatch_lane($detail_items) | is_cowork_role(.)) | not)`. A row
  resolving to a cowork-lane identity is simply **not an RLC candidate** — same treatment
  RLC already gives a row with no resolvable `next_agent`/`owner` at all (falls through,
  left for PO/SLS's supervised path, which already requires deliberate
  `supervised:true`+`plan_only:true` human/PO flagging before touching a cowork agent).
  Zero regression risk to `agent-father`/`qa`/`claude-manager-helper`/`ops`/`dev-*` targets
  (none are on the cowork roster) — directly verifiable against the §1 census (17
  agent-father rows unaffected; 0 cowork-role rows present in the current census, so this
  lands with zero live behavior change today, purely defense-in-depth against the NEXT
  minting-agent mistake in this shape).

This is a genuinely different mechanism from the rejected `.head`-coherence gate (operates
on `resolved_dispatch_lane` identity membership, not `.head`/row field agreement) — does not
duplicate `FIX-DEVTEAM-HEAD-NEXTAGENT-RESYNC-ON-REASSIGN`'s scope.

## 8. AC-1 replay-fixture spec (ties §2/§5 together)

Companion `developer`-zone regression verifier (§9), synthetic-fixture-only (mirrors
`scripts/audits/devteam-pipeline-resume-terminal-lane-verify.sh`'s pattern — zero live
`orch-state.json` I/O):
1. **Positive, `decomposition_complete:true`:** replay a decomposition-shaped pm invocation
   (parent row + N child specs, each with architect-review-note routing) against a
   synthetic board → assert post-write `.head` idle, parent in `done[]` with
   `children:[...]`, every child in `ready[]` with non-empty `next_agent` matching the
   architect note's per-child assignment (AC-4, next bullet).
2. **Negative control, `decomposition_complete:false`:** same shape, flag false → assert
   parent STAYS in its pre-existing lane, `next_agent` corrected (non-stale), `.head` idle,
   NOT moved to `done[]` (§5 AC-2).
3. **AC-3 reachability check:** positive fixture = pm's pre-fix file (or a synthetic
   excerpt reproducing the same shape) → FAILS the checker; negative fixture = pm's
   post-fix file + `dev-team/flow/main.md` + `qa/flow/main.md` → PASS (§2/§3).
4. **AC-4 — routing-intent source:** pm's Step 3 reads per-child `next_agent` from the
   architect design handoff's own per-subtask assignment (already pm's canonical Input —
   *"Architect design (task list + dependencies + layer assignments)"*, `pm/flow/main.md`
   L6-7) — specifically, any `review_note`/`note` field on the PARENT row or its
   `docs/handoffs/<parent>.md` that enumerates per-subtask owning agents (occurrence 3's own
   architect review_note did exactly this: *"1 shared-skill-file subtask → developer, 6
   agent-family-flow-edit subtasks → agent-father"*). Fallback order when the architect
   design does NOT specify per-child routing: `next_agent := owner` **only if** `owner` is a
   dev-role (`is_dev_role`); otherwise **hold and escalate** (write `status_note:
   "next_agent unresolved — architect design silent on per-child routing, owner is
   non-dev"`, telegram `work`) — never silently omit, matching Q3's mandate (§4).

## 9. Zone-split + follow-up rows to mint

**This brief does not touch `docs/data/orch/orch-state.json`** — outside agents-architect's
declared write zone (`docs/architecture-briefs/` + `docs/signals/` only, per this agent's
own `forbidden_outputs`). PO/router/agent-father must apply the board mutations below; exact
proposed values supplied so nothing is re-derived ad hoc:

1. **`FIX-PM-DECOMPOSE-CLOSEOUT-REACHABILITY-AND-DISPOSITION`** — owner/next_agent
   `agent-father`, size M, zone `docs/agents/pm/flow/`, depends_on: none. Files:
   `docs/agents/pm/flow/main.md`. Implements §2 (reachability restructure) + §5 (Q4
   closeout/partial branch + `.children` write) + §8 AC-4 (routing-intent-source doc) in
   ONE coherent edit (same block, avoid the two-implementer collision named in §6).
2. **`FIX-TASKSCHEMA-NEXTAGENT-CONDITIONAL-MANDATORY`** — owner/next_agent `developer`,
   size S, zone `docs/standards/` + `scripts/`. Files: `docs/standards/task-schema.md`,
   `scripts/orch-validate.mjs` (new WARN-tier check, §4), `docs/data/orch/archive/` (new
   ledger file path, §4). depends_on: none (independent of row 1 — can land in parallel).
3. **`FIX-RLC-COWORK-LANE-EXCLUSION-GATE`** — owner/next_agent `developer`, size XS, zone
   `scripts/`. Files: `scripts/lib/devteam-eligibility.jq` (new `is_cowork_role` predicate),
   `scripts/devteam-backlog-claim-ready-lane-consumer.jq` (candidate filter addition, §7).
   depends_on: none.
4. **PO action (not a new row, a board-hygiene edit):** narrow
   `FIX-DEVTEAM-EPICWRAPPER-PARENTHOOD-FIELD-DRIFT-AUTOCLOSE-BLIND`'s `scope`/`files` per
   §6 — drop `docs/agents/pm/flow/main.md` and the two write-side scope bullets once row 1
   above ships.
5. **Regression verifiers (companion `developer`-zone, §8, not implemented here — `scripts/`
   is outside agent-father's `commit_zone.allowed`, same TE-T02/S1-S20 precedent every prior
   brief in this fleet cites):** fold into row 2 or 3 above, or a 4th XS row
   (`scripts/audits/pm-decompose-closeout-replay-verify.sh` +
   `scripts/audits/flow-doc-return-reachability-verify.sh`) — PO's call on bundling vs.
   splitting.

Recommend rows 1/2/3 dispatch in parallel (no cross-depends) — row 1 is the P0-critical
path (closes the live-armed `IVC-PM-DECOMPOSE` hazard, §1); 2/3 are hardening,
defense-in-depth, non-blocking for row 1's own correctness.

## 10. Risk flags

- **`IVC-PM-DECOMPOSE` is RLC-eligible TODAY** (ready[], `next_agent:"pm"`, 8-row
  decomposition planned) — this is occurrence-4-in-waiting exactly as the board row's
  evidence field states. Row 1 above should be prioritized accordingly; until it lands, any
  pm decomposition (including this one) will reproduce the same `.head`/parent-row
  staleness (though NOT the RLC-dispatch-hazard half, since IVC-PM-DECOMPOSE's own note
  says "owner-chain per PO routing note: dev-mcp-server owns all rows" — a dev-role owner,
  so even with `next_agent` omitted, `resolved_dispatch_lane` would fall back to a SAFE
  dev-role target this one time; the hazard is row/decomposition-specific, not universal —
  still worth landing row 1 before this or the next PM decomposition of a non-dev-owned
  parent).
- **Concurrent-edit risk:** `docs/agents/pm/flow/main.md` was NOT observed mid-edit at read
  time (unlike the WF-2b brief's `dev-team/flow/main.md` situation), but per this fleet's
  own established convention, agent-father should re-read the live file immediately before
  applying row 1's patch — content-anchored, not line-number-anchored.
- **DDD/security/memory:** none — orchestration-doc + jq/schema-doc change only, no
  production runtime path touched.
- **Scope discipline:** explicitly did NOT re-touch UC-CCA-P2 or its children (`baseline_pass`,
  out of scope) — confirmed by read-only census in §1, no writes attempted.

## RETURN
DONE: Technical design complete — `docs/architecture-briefs/2026-08-14-pm-decompose-closeout-reachability-and-nextagent-mint.md`
ZONE: docs/agents/pm/flow/ (primary) | docs/standards/ + scripts/ (secondary, developer)
NEXT: agent-father (row 1, §9) | developer (rows 2-3, §9) | PO (mint all 3 rows + narrow FIX-DEVTEAM-EPICWRAPPER-PARENTHOOD-FIELD-DRIFT-AUTOCLOSE-BLIND per §6, + update THIS row's own `next_agent`/board disposition — agents-architect does not write orch-state.json, §9)
PIPELINE: continue
