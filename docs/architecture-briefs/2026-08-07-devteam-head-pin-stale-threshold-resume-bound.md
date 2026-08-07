Architecture Brief — dev-team `.head` Pin: Cadence-Proportional Stale Threshold + Resume-Attempt Bound

Date: 2026-08-07T22:37Z
Task: FIX-DEVTEAM-HEAD-PIN-STALE-THRESHOLD-24H-VS-TICK-CADENCE (P1, supervised, plan_only,
owner architect, dev-team Supervised-Lane Sweep dispatch)
Mode: DESIGN — `docs/agents/dev-team/flow/main.md` prose/bash edit spec (ready-to-apply patch
text below) + one optional companion schema/verifier row. Zero production code changed here.
Author: architect

---

## 0. Dedup check + prior art

Grepped `docs/architecture-briefs/` for `resume_attempt|head-pin|stale.*threshold` and
`docs/agent-memory/decisions/` / git log for the task id — no prior brief or shipped commit
covers this row. `related_not_duplicate` on the row itself names two adjacent-but-distinct
rows (chain-ordering starvation; session-cron liveness) — both independently confirmed
non-overlapping, not re-litigated here.

## 1. Live re-verification (this cycle, not trusted from the row's own text)

- `docs/agents/dev-team/flow/main.md` is 1054L today. The mechanism's cited `L491/L492` have
  drifted (12+ edits landed on this file since the row was minted 2026-07-25) — current
  anchors: entry gate `L253`, WF-1 `L253-318`, WF-1b `L319-337`, WF-1c `L338-353`, WF-2
  `L354-389`, S2 dispatcher-wrap `L390-422`, the 24h sibling branch `L423`.
- Cron cadence confirmed live: `.claude/skills/cron-detect-loop/register.md:81` —
  `cron: "*/30 * * * *"` (dev-team's own hourly-loop registration), matching that skill's own
  "~48 dev-team ticks/day" framing. This is the cadence AC-1 asks the threshold to be
  proportionate to.
- `HeadSchema` (`apps/mcp-server/src/infrastructure/orchStateSchema.ts:232-245`) and
  `TaskSchema` (`:104-136`) are BOTH `.passthrough()` — every new field this brief proposes
  (`.head.resume_attempts`, `.head.last_resume_at`, row `hold_reason`,
  `resume_attempt_bound_exceeded_at/_by`) validates today with **zero schema change required**.
  Explicit typing is optional polish, spec'd in §7 as a non-blocking companion.
- **Load-bearing finding, not in the row's own text — `scripts/orch-stamp-updated-at.mjs`
  (Stage 1.5 of `orch-apply.sh`) auto-refreshes `.head.updated_at` on ANY write that changes
  ANY other field of `.head`.** This is why S2 today "stamps nothing on `.head`" (mechanism
  text, confirmed live: S2 currently makes zero jq/orch-apply.sh calls between the WF-2 check
  and the `outer_claim` MCP call) — the moment AC-3's resume-attempt counter starts writing
  `.head` on every resume, `.head.updated_at` would auto-refresh on every one of those writes
  too, silently defeating any staleness check keyed off `.head.updated_at`. **Design
  consequence (§4/§5 below): the new age-based check must key off the `in_progress[]` row's
  own `claimed_at` (untouched by this auto-stamp — different field, row-scoped not
  head-scoped, set once by every one of BOUNDED-1/SLS/RLC/DRS's claim scripts, confirmed by
  grep across all 5 claim scripts), never `.head.updated_at`.** This is the "reader writes its
  own trigger field" failure class in a new shape — worth flagging explicitly since a naive
  patch (keep using `.head.updated_at`, just lower 24h→2h) would ship green today and then
  silently stop firing the instant AC-3's own counter starts recording activity.
- **Second load-bearing finding — the current 24h check is NOT gated on WF-2's supervised-hold
  carve-out.** Entry gate `L253` reads `head.status=="in_progress" AND head.next_agent!=null
  AND head.updated_at<24h` as the guard for the WHOLE WF-1→S2 chain (WF-2 included); the 24h
  sibling branch at `L423` is a separate `elif` keyed on `status` + age ALONE, with no
  supervised-hold exemption. A supervised row waiting >24h for a `po_goahead_*` stamp — not
  hypothetical, `po_live_evidence_20260806T0921` on this exact row measured a **~24.2h** idle
  span on a supervised row — would already risk hitting the *existing* 24h stale-crash reset
  today (detaching `.head` from a row that isn't actually stale, just waiting). Naively
  shrinking 24h→2h without restructuring the gate would turn a rare edge case into a routine
  false-positive (PO ratification turnaround well exceeds 2h regularly). **§4 restructures the
  chain so the age check runs strictly AFTER WF-2, never before or in parallel with it — a
  correctness fix this row's own threshold change requires, not a nice-to-have.**

## 2. Threshold value + stated basis (AC-1)

**New threshold: 2 hours (7200s), replacing 24h.**

Basis:
- Measured cadence: 30min/tick (§1), 48 ticks/day.
- Measured healthy-task p100 (this row's own instance evidence): ~13-30min close time (one
  tick), 7 BOUNDED-1 claim→closeout cycles 2026-07-25T02:17Z-05:18Z.
- 2h = 4 ticks = **4x the measured p100** — not an arbitrary round number.
- 2h is also **2x the existing `ttl_seconds:3600` (1h)** already governing the `task:<id>`
  resume-lock's own lifetime (S2's own LOCK-LIFETIME comment, `main.md:409-415`, already names
  this TTL "the same role as the 24h stale-crash reset... crash recovery backstop"). No
  legitimately-still-executing single-specialist work window can silently occupy `.head`
  without the lock-TTL layer ITSELF permitting a fresh resume attempt within 1h — 2h gives a
  full extra hour of margin above that pre-existing backstop before this NEW check can ever
  fire, so it structurally cannot collide with a genuinely-in-flight specialist.
- Net effect vs the incumbent: worst-case undetected pin drops from 24h (never reached in the
  live 07-25 incident — PO caught it by hand at 4h25m) to a hard 2h ceiling — **~12x tighter**
  — while AC-4's attempt-bound (§3) is expected to fire materially sooner still (~90min) on the
  exact observed failure shape, making the 2h check primarily a backstop for a DIFFERENT
  failure shape (§3's own scope note).

**Corroboration (AC-1's own wording: "no `.head` movement AND no commit referencing
active_task_id"; project lesson `feedback_internal_consistency_is_not_corroboration_check_the_
other_plane` applies directly — `.head`'s own age is one plane, git history is the other):**
before resetting on the age threshold, grep `git log` since the row's `claimed_at` for any
commit mentioning the task id. **No match → confirmed silent stall → reset.** **Match found →
do NOT reset this tick** — real forward progress happened but `.head`/lane haven't caught up,
which is the adjacent write-coherence class PO flagged 2026-08-05 on this same row (§6, scoped
out) — falling through lets the following S2 dispatcher-wrap safely no-op via its own
peer-held `outer_claim` check if a specialist genuinely still holds `task:<id>`.

## 3. Resume-attempt evidence + bound (AC-3, AC-4)

New `.head` fields:
- `resume_attempts` (int, default 0/absent) — incremented by 1 the moment S2's
  `outer_claim.claimed == true` on an ALREADY-pinned head, i.e. every genuine "the previous
  attempt is no longer holding the lock, I'm about to try again." **Never incremented on a
  FIRST claim** (BOUNDED-1/SLS/RLC/DRS's claim scripts construct `.head` as a brand-new literal
  object with no `resume_attempts` key — confirmed by reading
  `scripts/devteam-backlog-claim-bounded1.jq:119-129` — so the field is absent/0 for every
  freshly-claimed task by construction, no explicit reset code needed anywhere).
- `last_resume_at` (ISO8601) — stamped alongside, same write.

**Bound: 3 attempts** for the SAME `active_task_id`. Basis: 3 consecutive blind respawns at the
measured 30min cadence is ~90min worst case — inside the 2h AC-1 backstop (§2), and it fires on
the EXACT observed mechanism (repeated respawn of a dead spawn) rather than an indirect time
proxy. One or two isolated hiccups (e.g. transient lock contention) do not trip it; a genuine
loop does, fast. On the live 2026-07-25 incident shape (spawn dies before ever holding
`task:<id>`, so `outer_claim` succeeds every tick), this bound would have escalated at
~T+90min instead of leaving PO to catch it by hand at T+4h25m.

**Escalation, on bound exceeded — mirrors WF-1's own BLOCKED carve-out shape exactly (same
idle-reset + lane-move-to-`backlog[]` pattern, same reason this repo reuses rather than
invents a new escalation channel):** row status → `BLOCKED`, `hold_reason` set (reusing the
EXISTING free-text field already read by `has_hold_reason()` in
`scripts/lib/devteam-eligibility.jq:491-493` — so this row now surfaces in the same
hold-reason-aware reports/sweeps every other BLOCKED-with-reason row does, for free), plus
`resume_attempt_bound_exceeded_at`/`_by` (own field pair, `<event>_at`/`<event>_by` — the
established idiom this file already uses for `promoted_at/_by`, `claimed_at/_by`,
`autoclosed_at/_by`). **Do NOT reuse `blocked_by`** — that field name is ALREADY
schema-meaningful (`orchStateSchema.ts:707`, a reverse dependency-edge array feeding
`effective_depends_on`/`forwardEdgeIds`) — writing a free-text actor string into it would
silently corrupt dependency resolution for this row. `.head` resets to idle in the same write.
BUG-channel Telegram fires (§4). Freed from `wip_in_progress` automatically (BLOCKED rows are
already excluded, `scripts/lib/devteam-eligibility.jq:115-118`) — no separate WIP-release code
needed.

## 4. Signal shape (AC-2)

Two distinct BUG-channel messages (both name task id + pin duration, both computed from
`row.claimed_at`, never `.head.updated_at` — §1's auto-stamp finding):

```
[dev-team] RESUME ATTEMPT BOUND EXCEEDED task=<id> resume_attempts=<N>/3 pinned since <claimed_at> (<Xh Ym>) — stopped re-spawning, marked BLOCKED for triage, head reset idle
```
```
[dev-team] STALE HEAD PIN task=<id> pinned <Xh Ym> (threshold 2h) — no commit referencing this task since pin, no BLOCKED/terminal/ready/supervised carve-out matched — head reset idle, routing to triage
```

## 5. Ready-to-apply patch spec — `docs/agents/dev-team/flow/main.md`

Ordering (unified single chain, no more two disjoint age-gated branches):
`WF-1 BLOCKED → WF-1b TERMINAL-LANE → WF-1c READY-LANE → WF-2 SUPERVISED-HOLD → **WF-3
RESUME-ATTEMPT-BOUND (new)** → **WF-4 STALE-AGE + corroboration (new)** → S2 dispatcher-wrap
(gains one bump-write)`.

**5a. Entry gate (`L253`) — drop the age clause, content otherwise unchanged:**
```diff
- - `head.status == "in_progress"` AND `head.next_agent` non-null AND `head.updated_at < 24h` →
+ - `head.status == "in_progress"` AND `head.next_agent` non-null →
```
Add one comment line noting WF-1/1b/1c/WF-2 now run unconditionally on age (they never
referenced `head.updated_at` in their own bodies — confirmed by reading `L253-389` — so this
is a zero-byte-diff behavior change inside those four blocks, purely a consequence of the
parent gate no longer excluding them once age crosses the old 24h line).

**5b. Delete the old sibling branch (`L423`)** — its function is fully absorbed into WF-4
below, but WF-4 additionally respects BLOCKED/TERMINAL/READY-LANE/SUPERVISED-HOLD (the old
branch did not — §1 finding #2), corroborates against git log (the old branch did not), and
uses `claimed_at` not `.head.updated_at` (the old branch's field is what breaks once AC-3
ships — §1 finding #1).

**5c. Insert after WF-2's closing `if should_hold` block, before S2:**

```markdown
**WF-3 RESUME-ATTEMPT-BOUND check (FIX-DEVTEAM-HEAD-PIN-STALE-THRESHOLD-24H-VS-TICK-CADENCE —
run FIFTH, after BLOCKED/TERMINAL-LANE/READY-LANE/SUPERVISED-HOLD, before WF-4 and before S2
dispatcher-wrap):** AC-3/AC-4. `.head.resume_attempts` increments once per genuine Pipeline
Resume re-spawn attempt (§3 below, S2's own increment); stays flat on any tick where
`outer_claim` fails (peer-held — a specialist genuinely still holds `task:<id>`, not a resume
attempt). Bound = 3.
```bash
resume_attempts=$(jq -r '(.head.resume_attempts // 0)' docs/data/orch/orch-state.json)
if [ "$resume_attempts" -ge 3 ]; then
  now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  pin_claimed_at=$(jq -r --arg tid "$head_active_task" \
    '((.task_board.in_progress // [])[] | select(.id == $tid or (.task_id // null) == $tid) | .claimed_at) // .head.updated_at // empty' \
    docs/data/orch/orch-state.json)
  reason="resume-attempt-bound-exceeded (resume_attempts=$resume_attempts/3)"
  jq --arg s "idle" --arg t "$now" --arg u "dev-team" --arg tid "$head_active_task" --arg reason "$reason" \
    '.head = {status:$s, updated_at:$t, updated_by:$u, active_task_id:null, next_agent:null}
     | .task_board.in_progress = ((.task_board.in_progress // []) | map(
         if (.id == $tid or (.task_id // null) == $tid)
         then . + {status:"BLOCKED", hold_reason:$reason,
                   resume_attempt_bound_exceeded_at:$t,
                   resume_attempt_bound_exceeded_by:"dev-team (resume-attempt-bound)"}
         else . end))' \
    docs/data/orch/orch-state.json \
    | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
  send_telegram(channel="bug", message="[dev-team] RESUME ATTEMPT BOUND EXCEEDED task=" + head_active_task + " resume_attempts=" + resume_attempts + "/3 pinned since " + pin_claimed_at + " — stopped re-spawning, marked BLOCKED for triage, head reset idle")
  JUMP TO drain-signals
fi
```

**WF-4 STALE-AGE check (FIX-DEVTEAM-HEAD-PIN-STALE-THRESHOLD-24H-VS-TICK-CADENCE — run SIXTH,
after WF-3, before S2 dispatcher-wrap):** AC-1/AC-2. Replaces the deleted `L423` branch.
Threshold 2h (§2). Keys off `row.claimed_at`, NOT `.head.updated_at` (§1 finding #1 —
`.head.updated_at` is auto-refreshed by `orch-stamp-updated-at.mjs` on WF-3's own write above,
so it cannot be used here without self-defeating the moment resume attempts start recording).
```bash
pin_claimed_at=$(jq -r --arg tid "$head_active_task" \
  '((.task_board.in_progress // [])[] | select(.id == $tid or (.task_id // null) == $tid) | .claimed_at) // .head.updated_at // empty' \
  docs/data/orch/orch-state.json)
if [ -n "$pin_claimed_at" ]; then
  age_sec=$(jq -n --arg ts "$pin_claimed_at" \
    'def to_epoch: if test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}Z$")
       then (sub("Z$"; ":00Z") | fromdateiso8601) else fromdateiso8601 end;
     (now | floor) - ($ts | to_epoch)')
  if [ "$age_sec" -ge 7200 ]; then
    commit_found=$(git log --since="$pin_claimed_at" --fixed-strings --grep="$head_active_task" --oneline 2>/dev/null | head -1)
    if [ -z "$commit_found" ]; then
      now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
      hrs=$((age_sec/3600)); mins=$(((age_sec%3600)/60))
      jq --arg s "idle" --arg t "$now" --arg u "dev-team" \
        '.head = {status:$s, updated_at:$t, updated_by:$u, active_task_id:null, next_agent:null}' \
        docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
      send_telegram(channel="bug", message="[dev-team] STALE HEAD PIN task=" + head_active_task + " pinned ${hrs}h${mins}m (threshold 2h) — no commit referencing this task since pin, no BLOCKED/terminal/ready/supervised carve-out matched — head reset idle, routing to triage")
      JUMP TO drain-signals
    fi
    # commit_found non-empty: real progress happened since the pin but .head/
    # lane haven't caught up — the adjacent write-coherence class PO flagged
    # 2026-08-05 (§6, deliberately out of scope here). Conservative default:
    # do NOT reset. Fall through — S2's own outer_claim peer-held check is
    # the safety net if a specialist genuinely still holds task:<id>.
  fi
fi
```
```

**Testability seam (recommended, not mandatory):** expose an env-var override for the git-log
check (mirrors the existing `FFLOW_FRESH_OVERRIDE_NOW` idiom in
`scripts/check-foreign-flow-freshness.sh:103`), so the regression verifier (§8) can stub
`commit_found` without needing a scratch git fixture repo.

**5d. S2 dispatcher-wrap (`L390-422`) — one insertion, right after `outer_claim.claimed`
confirms true, before `Agent(...)`:**
```diff
  else:
+   now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
+   jq --arg t "$now" \
+     '.head.resume_attempts = ((.head.resume_attempts // 0) + 1) | .head.last_resume_at = $t' \
+     docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
    try:
      Agent(head.next_agent, context... + head.next_action, run_in_background=true)   # (background) — BGFAN-1
      ...
```
No change needed at SLS/RLC/DRS's own inline first-claim dispatch sites (`L493-521`,
`~572+`, `~634+`) — those are FIRST claims (head.status was idle before this tick), never
resumes; their claim scripts already construct `.head` fresh with no `resume_attempts` key, so
the counter starts at 0/absent for a new task by construction. S2 (Step 0b) is the sole path
that can loop indefinitely re-spawning the same `active_task_id` tick after tick — confirmed by
re-reading the full chain (§1) — so it is the only site needing the increment.

**5e. Housekeeping (implementer's own pass, not spec'd verbatim here):** append one dated entry
to the file's own top size-justification comment (established per-edit convention, every prior
change to this file does this); add one bullet under § Reusable Scripts once §8's verifier
exists, mirroring the existing PENDING-bullet pattern at `L1022`.

## 6. Scope decision — 2026-08-05 write-coherence note: OUT OF SCOPE, with reasoning

The row's own `po_occurrence_20260805T1830Z` note (`.head.next_agent` not re-synced when a
claimed row's `next_agent` is reassigned by the SAME sweep moments later) is a DIFFERENT
mechanism, not folded into this fix:

- **Different trigger class.** This row's 4 ACs are entirely about TEMPORAL staleness — nothing
  moving for too long. The 08-05 note describes an INSTANTANEOUS write-ordering defect: `.head`
  is wrong the moment it is written (fresh `updated_at`), not after any elapsed time. No
  threshold, attempt-counter, or resume-bound in this brief's design could ever detect or
  prevent an already-wrong value written fresh — the write itself is the bug, not its age.
- **Project lesson directly on point:** `feedback_selfreport_conflates_two_dbadjacent_defects_
  by_topic` — same surface (`.head`), genuinely different mechanism (write-ordering vs
  staleness-detection). Folding it in here would be exactly that anti-pattern.
- **Practical:** bundling would give this S-sized P1 two unrelated DoDs/regression-test shapes
  in one commit, for a task whose own acceptance text is already fully specified without it.

**Recommendation for PO:** mint a small standalone follow-up (suggested id:
`FIX-DEVTEAM-HEAD-NEXTAGENT-RESYNC-ON-REASSIGN`) — narrow, mechanical: any writer that changes
a row's OWN `next_agent` while that row is simultaneously `.head.active_task_id` must write
both in the same `orch-apply.sh` transform, or immediately re-sync `.head.next_agent`
afterward. Independently testable (assert `head.next_agent == row.next_agent` immediately after
a same-tick reassignment — no elapsed-time dimension at all), independent DoD from this row.

## 7. Optional companion (not blocking this row's DoD) — developer, code zone

`.passthrough()` on both `HeadSchema` and `TaskSchema` (§1) means §3/§5's new fields validate
today with zero schema change. Recommended, non-blocking polish for a `developer`-zone
follow-up (NOT this row, NOT agent-father's zone — see §9):
```ts
// HeadSchema, apps/mcp-server/src/infrastructure/orchStateSchema.ts:232-245
resume_attempts: z.number().int().nonnegative().optional(),
last_resume_at: z.string().optional(),
```

## 8. Regression verifier spec (companion developer row, §7)

`scripts/audits/devteam-head-pin-resume-bound-verify.sh`, mirroring
`scripts/audits/devteam-pipeline-resume-terminal-lane-verify.sh`'s SYNTHETIC-fixture-only
pattern (zero live `orch-state.json` I/O):
1. **AC-4 positive:** `.head.resume_attempts=3` naming an `in_progress[]` row → assert row
   flips `BLOCKED` + `hold_reason` set, `.head` idle-reset, S2 spawn branch never reached.
2. **AC-4 negative:** `resume_attempts=2` → assert WF-3 does not fire, control reaches WF-4/S2.
3. **AC-1 positive:** `row.claimed_at` = 3h ago, no matching git-log fixture (stub via §5c's
   testability seam) → assert WF-4 fires, `.head` idle-reset.
4. **AC-1 negative (corroboration):** same fixture WITH a matching stubbed commit → assert WF-4
   does NOT reset.
5. **AC-1/WF-2 regression guard (the §1 finding #2 false-positive class — the single most
   important negative control in this set):** synthetic `effective_supervised=true` row, no
   `po_goahead_*`, `claimed_at` = 3h ago (past the 2h threshold) → assert WF-2's `should_hold`
   short-circuits BEFORE WF-4 ever evaluates; `.head` byte-unchanged, still `in_progress`.
6. **AC-3 positive:** assert `.head.resume_attempts`/`last_resume_at` increment on a successful
   S2 outer_claim, and stay flat when `outer_claim.claimed==false` (peer-held).

## 9. Standard Detection + handoff

**BUILD-STANDARD: not-applicable** (bug-fix/refactor, in-zone, no new primitives).

**Zone correction from the dispatch prompt's own guess.** The spawn context suggested
`developer` "since this touches `docs/agents/dev-team/flow/main.md`'s own pseudocode plus
possibly a small schema addition." Per the standing `po_routing_ruling_20260721` artifact-class
ruling (cited on `TE-T08`/`UC-ASL-P6` and, on this EXACT file, twice already —
`docs/architecture-briefs/2026-08-06-review-lane-qadrain-throughput-unblock.md §1c` and the
`TE-T02` relocation note baked into `main.md`'s own top comment): agent-instruction prose under
`docs/agents/**` routes to **agent-father**, never `developer` — `agent-father`'s own
`commit_zone.allowed` is `["docs/agents/", "docs/agent-memory/", ".claude/skills/",
".claude/agents/"]` (`docs/agents/agent-father/init.md:62-63`), and its own `forbidden_outputs`
explicitly bars writing `*.ts`/`*.py`; `developer` carries no grant for `docs/agents/**` at all
and its own `init.md` frames it as zone-dispatch + code outside `dev-*` zones, never flow-doc
authorship. §5's entire deliverable is prose+bash inside `main.md` — zero `.ts`/`.py`/`scripts/`
edits required for the 4 ACs themselves (§7's schema/verifier companion is the ONLY code-zone
piece, and it is explicitly optional/non-blocking). **This row's `next_agent` → `agent-father`**,
correcting the dispatch-time guess; §7/§8 remain flagged as an optional `developer` follow-up
PO can mint separately if wanted (not spawned by this cycle — plan_only, no write authority to
mint new board rows outside this row's own closeout).

## 10. Risk flags

- **DDD/security/memory:** none — pure orchestration-doc + optional schema/audit-script change,
  no production runtime path touched.
- **Regression risk if §1 findings are skipped:** (a) keying the age check off
  `.head.updated_at` instead of `row.claimed_at` would ship a check that silently stops firing
  the moment AC-3's own counter starts writing `.head` — a self-defeating fix that looks green
  in isolation. (b) not reordering WF-2 ahead of the age check would turn 2h into a routine
  false-positive generator against every supervised-hold row (measured live: 24.2h holds are
  not rare). Both are called out explicitly in §5 as non-negotiable ordering/field-choice
  constraints, not stylistic preferences.
- **Field-name collision avoided:** `blocked_by` is schema-meaningful (dependency edge, §3) —
  the escalation write uses `resume_attempt_bound_exceeded_at/_by` instead, never `blocked_by`.
- **Scan clean:** ✓ (brownfield-verified against the live file this cycle, not the row's own
  stale line-number citations).

## RETURN
DONE: Technical design complete — `docs/architecture-briefs/2026-08-07-devteam-head-pin-stale-threshold-resume-bound.md`
ZONE: docs/agents/dev-team/flow/
NEXT: agent-father (main.md prose/bash edit, §5) | developer (optional companion, §7/§8, PO to mint separately if wanted)
PIPELINE: continue
