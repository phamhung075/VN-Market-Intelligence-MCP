# Brief: system-auditor Tier-1 notebook-compose adoption gap — a mechanical commit-time forcing
function, on the CORRECT git-hook stage (not `pre-commit`)

**Date:** 2026-08-26T12:26:38Z
**Author:** architect
**Priority:** P0 (per `task_board.review[].FIX-AUDITOR-NOTEBOOK-COMPOSE-ACTUATOR-BUILT-TESTED-NEVER-WIRED`, PO REWORK 2026-08-24T22:22:18Z)
**Tracking row:** `FIX-AUDITOR-NOTEBOOK-COMPOSE-ACTUATOR-BUILT-TESTED-NEVER-WIRED` — this row's TITLE is now
factually false (the actuator is wired and executes — see §Fresh evidence) and is being closed
(archived) in the same write as this brief; the two children below carry the real remaining work.
Same shape as `docs/architecture-briefs/2026-08-14-wire-notebook-compose-actuator-system-auditor-pilot.md`
(read first, not re-litigated here).

## Scope

Split across **2 zones**, matching the row's own instruction:
- **Child A** (developer, `scripts/git-hooks/`) — the actual forcing function: a NEW `commit-msg`
  hook, not an addition to `pre-commit`. See §Correction below for why.
- **Child B** (agent-father, `docs/agents/system-auditor/flow/`) — a small, non-load-bearing
  defense-in-depth pointer closing the one real structural gap found in the flow doc itself
  (§Root cause). Explicitly NOT presented as "the fix" — Child A alone already satisfies PO's bar.

## Correction to the row's own evidence (RAW-verified this cycle, 2026-08-26T12:xx — supersedes
PO's 2026-08-24T22:22Z snapshot on one narrow point)

The row states "TIER-1 ... has NEVER once invoked the actuator." **That was true at PO's review
time; it is no longer literally true.** Full commit history since the wire (`78a43bf3c`,
2026-08-14) through now, filtered to `docs/agent-memory/notebooks/system-auditor.md`, shows:

- **~20 Tier-1-labeled notebook commits** since the wire.
- **2 of them carry the compose actuator's own marker**, both landing on 2026-08-25, both
  **after** PO's review: `d1ceb8cd949940cca33aee4d202e1edfeb97662b` (13:39:36Z,
  `[WARN direction-defaulted file=system-auditor.md applied=newest_first source=default]`) and
  `0a7d11978b40052bc1d6b09866a0f94249bb65a4` (15:05:51Z, `[OK sections=1 dropped=5 lines=46
  bytes=6197 direction=newest_first]`).
- The other **~18 are narrated/hand-written**, no marker — spanning the full window before AND
  after those two, including both cited bypass occurrences (`f4b9740b2` 08-24T06:44Z,
  `2f3112a99` 08-24T20:20Z) and at least one more AFTER the two marker commits with no further
  Tier-1 notebook commit at all in the ~21h leading up to this brief (a separate, not-fixed-here
  observation — see §Not fixed here).

**Why this correction does not change the verdict:** 2/20 (10%) adoption, with the only 2 successes
clustered in a 90-minute window and zero since, is not meaningfully different from "structurally
never" for PO's purpose (a forcing function that cannot be narrated around). Tier-2/Tier-3/DATA
adoption over the same window is effectively 100% of the notebook-writing cycles that actually ran
(every tier-2/tier-3/DATA notebook commit sampled carries a marker). The corrected number sharpens,
not weakens, the case for a mechanical gate: even a demonstrated-working invocation twice did not
stick on the very next opportunity.

## Root cause (why Tier-1 specifically, confirmed at source)

`docs/agents/system-auditor/flow/main.md`'s own size-justification header states Tier-1 detail is
"extracted to `tier1-probe.md`," while Tier-2/Tier-3 bodies stay inline in `main.md`. Consequence,
confirmed by reading both files end-to-end:

- A Tier-2/Tier-3 cycle reads `main.md` **continuously** — its own check bodies flow straight into
  `## Notebook Write — Durable Checkpoint` (~line 1070) without a context switch.
- A Tier-1 cycle instead lazy-loads a **separate ~800-line file** (`tier1-probe.md`). That file
  ends (its last section is `## Emit per failure`) with **no instruction to return to `main.md`'s
  Notebook Write section** — no "when done, go back to `main.md` line X" pointer of any kind. The
  Tier Dispatch table's own one-line summary (`main.md:139`, "→ notebook (gated) → RETURN") is the
  ONLY place that relationship is stated, and it lives ~950 lines away from the point a Tier-1
  cycle's attention is last drawn to (the end of the lazy-loaded file it just finished).

This is a real, in-zone (agent-father) contributing defect — but per PO's own explicit ruling
("more prose in a 1400L flow doc is NOT an acceptable fix; that is exactly what already failed on
2026-08-06 and again on 2026-08-14"), closing it is **necessary-but-not-sufficient**, never treated
here as the fix. It is Child B, scoped as a 3-line pointer, not a rewrite.

## Why `scripts/git-hooks/pre-commit` is the WRONG host (correction to PO's named host)

PO's status_note names `scripts/git-hooks/pre-commit` as the obvious host and cites its two
existing sibling guards (`_check_auditor_heartbeat_shapes`, `_check_notebook_immutability`) as
precedent. Both of those guards inspect **staged file content** (`git diff --cached`) — they never
need the commit message. This new guard is different in kind: **its whole signal is a string
literally embedded in the commit MESSAGE** (`[notebook-compose OK ...]` / `[OK ...]` / `[WARN
...]`, per the existing `--- Commit ---` step's own message-template convention, `main.md`
`~line 1165`). Per `githooks(5)` (verified, not assumed): **`pre-commit` "is invoked before
obtaining the proposed commit log message"** — it takes no parameters and has no access to the
message at all, by design, regardless of whether `-m` was passed on the command line. A check
placed in `pre-commit` structurally cannot see the string it is being asked to gate on.

The correct host is `commit-msg` — "invoked ... with one parameter, the path to a file that holds
the proposed commit log message" — the only hook stage in this repo's model where message content
exists and a non-zero exit still aborts the commit before it is created. **This repo has no
`commit-msg` hook today** (`scripts/git-hooks/` holds only `pre-commit`, `pre-push`, `post-commit`;
`install.sh`'s `for hook in pre-push pre-commit post-commit` loop does not mention it). Per this
row's own explicit instruction ("If you conclude the pre-commit host is wrong, you must say why and
name a different forcing function — not fall back to documentation"): **name it — a new
`scripts/git-hooks/commit-msg`, installed the same tracked-source-plus-symlink way as the other
three.**

(Verifying this class of thing at the OS/tool-mechanism level, not the flow-doc level, is exactly
what closes the row's own "narration cannot bypass" bar — a `commit-msg` hook runs regardless of
which agent, script, or hand-typed command produced the commit, the same "transport-agnostic"
property `pre-commit`'s own header comment already claims for itself.)

## Design

### Child A — `commit-msg` hook (developer, `scripts/git-hooks/`)

New file `scripts/git-hooks/commit-msg`:

```bash
#!/usr/bin/env bash
# commit-msg hook: notebook-compose actuator forcing-function (PILOT-SCOPED).
# TASK: <Child-A task id>. Parent: FIX-AUDITOR-NOTEBOOK-COMPOSE-ACTUATOR-BUILT-TESTED-NEVER-WIRED.
# SPEC: this brief.
#
# WHY commit-msg, NOT pre-commit: pre-commit fires before git has obtained the
# proposed commit message (githooks(5)) — no parameter, no access, structurally
# cannot see a message-embedded marker. commit-msg receives $1 = path to the
# proposed message, before the commit object is created.
#
# SCOPE: PILOT-ONLY, docs/agent-memory/notebooks/system-auditor.md — the sole
# live caller of scripts/notebook-compose.sh today (FIX-NOTEBOOK-COMPOSE-
# REWRITES-RETAINED-PRIOR-SECTIONS, the fleet-wide rollout, is still un-merged
# in task_board.review[]). Do not widen ahead of that row landing.

set -u
MSG_FILE="${1:-}"
[ -f "$MSG_FILE" ] || exit 0

NB_PATH="docs/agent-memory/notebooks/system-auditor.md"

staged="$(git diff --cached --name-status 2>/dev/null)" || exit 0
printf '%s\n' "$staged" | grep -qE $'^[AM][[:space:]]'"$NB_PATH"'$' || exit 0

# Strip git's own '#'-led cleanup comments before matching (their presence/
# absence depends on core.cleanup/editor; our marker itself never starts '#').
msg_content="$(grep -v '^#' "$MSG_FILE" 2>/dev/null || cat "$MSG_FILE")"

mode="${GIT_NOTEBOOK_COMPOSE_MARKER_MODE:-warn}"

# Escape hatch for legitimate non-compose writes (e.g. the data-repair/renumber
# class, precedent commit 35be008d0 "AC-3 data repair — restore steady state,
# renumber c104->c105" — no marker by design, not a bypass).
if printf '%s' "$msg_content" | grep -qi 'notebook-compose-marker-allow:'; then
  exit 0
fi

# Tolerant match — 4 observed real marker shapes in live history: '[OK ...]',
# '[WARN ...]', '[notebook-compose OK]', '[[notebook-compose] OK ...]'. All
# four contain OK/WARN inside SOME bracketed group; that is the invariant
# checked, not one exact literal shape.
if ! printf '%s' "$msg_content" | grep -qE '\[[^]]*(OK|WARN)[^]]*\]'; then
  verdict_word="WARN"
  [ "$mode" = "reject" ] && verdict_word="REJECT"
  msg="[notebook-compose-marker-guard] ${verdict_word}: staged commit touches ${NB_PATH} with no [notebook-compose OK|WARN ...]-shaped marker in its message. This notebook's SOLE authorized write path is scripts/notebook-compose.sh via docs/agents/system-auditor/flow/main.md's Notebook Write step — a commit with no marker means that step was bypassed (hand-written heading, direct Edit/Write, or a narrated-not-executed cycle), the exact class FIX-AUDITOR-NOTEBOOK-COMPOSE-ACTUATOR-BUILT-TESTED-NEVER-WIRED exists to end (2 confirmed post-wire bypasses: f4b9740b2, 2f3112a99). If this really is an authorized non-compose write (data repair/renumber), add a 'notebook-compose-marker-allow: <reason>' line to the message. mode=${mode} (default warn; set GIT_NOTEBOOK_COMPOSE_MARKER_MODE=reject to hard-enforce once re-validated)."
  echo "$msg" >&2
  [ "$mode" = "reject" ] && exit 1
fi

exit 0
```

`install.sh`: add `commit-msg` to the `for hook in pre-push pre-commit post-commit` loop (→
`pre-push pre-commit post-commit commit-msg`).

**Default mode = warn, not hard-reject** (deliberate — mirrors `_check_notebook_immutability` /
`_check_notebook_uuid_provenance`'s precedent, NOT `_check_auditor_heartbeat_shapes`'s hard-reject
precedent). Reason: unlike the heartbeat-shape guard (a pure authorization violation with no
legitimate exception), this guard has one confirmed legitimate bypass class — the AC-5-style
data-repair/renumber commit (precedent: `35be008d0`, "AC-3 data repair — restore steady state,
renumber c104→c105", correctly has no marker). A day-1 hard reject risks the exact fleet-blocking
regression `_check_notebook_immutability` itself hit and had to walk back same-day
(2026-07-29). The `notebook-compose-marker-allow:` trailer (mirrors the UUID guard's own
`notebook-uuid-lint-allow:` escape hatch) gives that class a documented, auditable pass without
opening the gate for everything.

**Test:** `scripts/git-hooks/commit-msg-notebook-compose-marker.test.sh`, mirroring
`pre-commit-notebook-uuid-provenance.test.sh`'s structure — synthetic staged-notebook + message
fixtures for: (1) marker present, any of the 4 observed shapes → PASS silent; (2) no marker,
mode=warn → WARN stderr, exit 0; (3) no marker, mode=reject → REJECT stderr, exit 1; (4) no marker
but `notebook-compose-marker-allow:` present → PASS silent even under reject; (5) commit does not
touch the notebook path at all → no-op, exit 0 (never runs the check).

**`docs/policies/dev-standards.md` CANONICAL pointer:** new block, same convention as the existing
`FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-HOOK 2026-07-28: CANONICAL pointer for
scripts/git-hooks/pre-commit` entry — this one for `scripts/git-hooks/commit-msg`.

### Child B — `tier1-probe.md` return pointer (agent-father, `docs/agents/system-auditor/flow/`)

At the end of `docs/agents/system-auditor/flow/tier1-probe.md` (after its final `## Emit per
failure` section), add:

```markdown
## Return to main flow

All Tier-1 checks above are now complete. **Return to `docs/agents/system-auditor/flow/main.md`
§ Notebook Write — Durable Checkpoint** — do NOT write the notebook directly from this file; that
section (and its ONE actuator, `scripts/notebook-compose.sh`) is the sole authorized write path for
every tier, Tier-1 included (§Tier Dispatch: `main.md:139`).
```

3 lines. Not a rewrite, not a restatement of the whole Notebook Write contract (which already lives
correctly in `main.md` and does not need duplicating here — duplication is how the 2026-07-29
"Tier-2/3"-labelled-but-Tier-1-reachable heartbeat prose drifted out of sync in the first place, per
`FIX-AUDITOR-TIER1-FLOW-HAND-WRITES-HEARTBEAT-FILE`'s own changelog entry in this same file). This
closes the one concrete structural gap found (§Root cause) without repeating PO's already-rejected
"more prose" pattern — it is a pointer TO the existing mechanism, not a substitute narration OF it.

## Sequencing

Independent — either child may land first; no shared file, no ordering dependency. Land as 2
separate commits (1 per child, per the pathspec-per-zone convention already in force).

## Verification Gate

1. `scripts/git-hooks/commit-msg-notebook-compose-marker.test.sh` — all 5 cases pass.
2. Live: the next narrated/hand-written commit touching
   `docs/agent-memory/notebooks/system-auditor.md` (any tier) produces a
   `[notebook-compose-marker-guard] WARN` line on stderr at commit time — first observable proof
   the gate is live and reachable, independent of any flow-doc read-compliance.
3. Over the following ~48h (≥2 Tier-1 cadence windows at 30 real cycles/day): sample
   `git log --oneline -- docs/agent-memory/notebooks/system-auditor.md`, count Tier-1-labeled
   commits with vs without a marker. Success = adoption ratio measurably higher than the pre-fix
   2/20 baseline — this AC is a trend check, not a single-cycle pass/fail (a WARN-mode gate cannot
   force compliance in one commit; it can only make every future non-compliant commit visible and
   auditable, which is what PO's bar actually requires — "narration cannot bypass" means the
   bypass is now always caught, not that it can never occur again).
4. Confirm `install.sh` re-run on a fresh clone links all 4 hooks (`pre-push pre-commit
   post-commit commit-msg`), not just 3.

## Not fixed here (flagged, not chased — matches this row's own "known-stale, do not chase"
convention)

- The ~21h Tier-1 notebook-commit silence observed between `0a7d11978` (2026-08-25T15:05:51Z) and
  now (2026-08-26T12:26Z) despite a 30-min cadence: `docs/data/auditor-tier1-last-trigger.json`
  shows Tier-1's own pre-gate is firing continuously and healthily (`fire_tick:
  2026-08-26T11:30Z`, `verdict: ALL_GREEN`) — consistent with the probe's SKIP-SPAWN pre-gate
  correctly declining to spawn a full subagent cycle on genuine ALL_GREEN ticks (no new
  finding/signal/state-change → §Notebook Append Gate would SKIP the write even if a cycle did
  spawn). Not re-verified against the Append Gate's own 3-counter logic this pass — flag only,
  separate concern from adoption of the marker on cycles that DO write.
- Not a duplicate of `FIX-AUDITOR-SELF-COMMIT-STEP-NEVER-FIRES` (write-fires/commit-doesn't) or
  `FIX-AUDITOR-NOTEBOOK-APPEND-GATE-BYPASSED-ALL-GREEN-WRITE` (wrote when it should have SKIPped) —
  confirmed both remain open, separate defects, at `docs/data/orch/orch-state.json`
  `.task_board.backlog[]`.

## Rollback

Child A: delete `scripts/git-hooks/commit-msg`, remove it from `install.sh`'s loop, re-run
`install.sh` — the symlink disappears, `.git/hooks/commit-msg` (if git looks for it) simply won't
exist, zero effect on any other hook. Child B: revert the 3-line addition to `tier1-probe.md` —
touches no other section, no logic change elsewhere in the file.
