Architecture Brief — Sweep-Guard Escalation Actuator + Triage Mechanism-Check Correction

Date: 2026-07-31T01:48:31Z
Task: FIX-SWEEPGUARD-WARN-ONLY-NO-ACTUATOR-AND-TRIAGE-MISADJUDICATION (P1, size S, zone
cross-service/, owner agents-architect, dispatched directly by dev-team from po's own
daily triage — po performed the full investigation; this brief formalizes and extends
po's already-verified root_cause/evidence/ac into an implementable design)
Author: agents-architect
Status: RECOMMENDATION ONLY — no code changed (role boundary; agent-father implements)

---

## 1. Problem (both halves re-verified live this session, source read 2026-07-31T01:4xZ)

**Part 1 — no actuator.** `scripts/git-hooks/pre-commit:445-518` discriminates BARE vs
SCOPED commits precisely (`basename $GIT_INDEX_FILE`: `index`/`index.lock` → BARE,
`next-index-*.lock` → SCOPED-and-silent, AC-4). A BARE commit only ever logs to
`.git/sweep-guard.log` and writes a `docs/signals/commit-sweep-guard-*.json`
`bug-escalation` signal — `GIT_SWEEP_GUARD_MODE` defaults to `warn`, which by
construction never blocks. 14 BARE warns landed in 8h across 4 distinct actor sessions
this tick (`.git/sweep-guard.log`, confirmed by po), including this same
dev-team/router session's own commits. Six rows already exist on this defect family
(HOOK/SKILLS/LAYER2 shipped, PARENT blocked, SCRIPT-ACTUATOR-AND-NOTEBOOK-LONGTAIL in
review scoped to one script call site + notebook cleanup, SWEEP-VICTIM-SELF-DETECT
backlog) — confirmed via live `jq` re-scan this session (17 `SWEEP`-matching rows total,
6 in the family, zero AC on the warn→enforce gap) — none of the six lands anything that
converts repeated BARE commits into a forcing function.

**Part 2 — mis-adjudication.** Neither `docs/agents/po/flow/triage-signals.md` nor
`docs/agents/dev-team/flow/drain-signals.md` §0a-3 carries a routing row for
`type=bug-escalation` `from=commit-sweep-guard` (grep-confirmed, both files read in
full this session). It falls to each file's generic "any other/unknown type" row —
triage-signals.md's own text for that fallback is literally "PO decides" with no
mandatory evidence read. This session's disposition of all four signals — "`git show
--stat <sha>` is clean, hook is noisy, benign" — is a category error: a clean `--stat`
is OUTCOME evidence (no peer happened to stage anything in the race window this time);
whether the commit was pathspec-scoped is a MECHANISM question the discriminator
already answers by construction (a BARE-mode log/signal entry existing AT ALL is
definitional proof of BARE, since the SCOPED branch at pre-commit:453-454 `exit 0`s
before either the log write or `write_signal` call is ever reached). Re-run this tick:
`bash scripts/audits/verify-commit-sweep-discriminator.sh` → `VERDICT: PASS` on git
2.49.0, both C1/C2 claims reproduce.

---

## 2. Part A — Actuator design (`scripts/git-hooks/pre-commit`)

### 2.1 Why NOT a bare global flip on day 1 (the hook's own header already answered this)

The hook's own header (lines 35-42) explains warn-by-default was chosen because a hard
reject-by-default in 2026-07-21 "would additionally block the majority of fleet
commits day 1 (bare-commit-after-`git add` is still the dominant idiom across 60+ flow
docs)". Po's evidence this tick shows that premise has since changed — grep across
`docs/agents/dev-team/flow/*.md`, `docs/agents/po/flow/*.md`,
`.claude/skills/commit-mutex/SKILL.md` for a bare `git commit -m "..."` line returns
ZERO; the 14 live BARE commits are improvised deviation from already-clean docs, not
the documented idiom. That materially weakens (does not eliminate) the original
blast-radius objection to a global flip. Design below still treats a same-day global
flip as unproven — see §2.3 — but does not require ONE MORE DAY of pure silent logging
before anything blocks, which is the actual defect (`warn-only, no actuator, ever`).

### 2.2 Immediate mechanism — per-actor escalation (ships day 1, zero observation delay)

Mirrors the mode-var pattern already built into this same file for the
notebook-immutability guard (`GIT_NOTEBOOK_IMMUTABILITY_MODE`, warn/reject, §188-441)
but scoped **per actor** instead of fleet-wide, so a single session that ignores N
prior warnings gets blocked without waiting on, or requiring, a change that would also
catch well-behaved first-time bare committers. Zero new state or dependency: reuses
`.git/sweep-guard.log`, which already carries `actor=<id>` on every BARE line since
day 1 — a `grep -Fc` count, no date-window arithmetic (avoids the BSD-date
non-portability trap this codebase has hit before — `date -u -d` is not portable to
macOS `date`), bounded by construction because `CLAUDE_CODE_SESSION_ID` is itself a
short-lived per-session value (a fresh session starts at 0).

Insert immediately after the existing `actor=`/`mode_effective=` assignment
(pre-commit:487-489), before the WARN banner block:

```bash
actor="${CLAUDE_CODE_SESSION_ID:-$(git config user.name 2>/dev/null || echo unknown)}"
staged_oneline="$(printf '%s' "$staged" | tr '\n' ' ')"
mode_effective="${GIT_SWEEP_GUARD_MODE:-warn}"

# --- AC-2: same-actor escalation (FIX-SWEEPGUARD-WARN-ONLY-NO-ACTUATOR-AND-TRIAGE-
# MISADJUDICATION) — converts repeated BARE commits from the SAME actor into a
# forcing function without a fleet-wide reject-mode flip. Threshold counts PRIOR
# BARE log lines for this exact actor (computed BEFORE this attempt's own line is
# appended below) — opt-out via GIT_SWEEP_GUARD_ESCALATE_THRESHOLD=0.
escalate_threshold="${GIT_SWEEP_GUARD_ESCALATE_THRESHOLD:-3}"
prior_warns=0
escalated=false
if [ "$mode_effective" != "reject" ] && [ "$escalate_threshold" -gt 0 ] 2>/dev/null; then
  [ -f "$LOG_FILE" ] && prior_warns="$(grep -Fc " actor=${actor} " "$LOG_FILE" 2>/dev/null || echo 0)"
  if [ "$prior_warns" -ge "$escalate_threshold" ] 2>/dev/null; then
    escalated=true
  fi
fi
escalate_effective="$mode_effective"
[ "$escalated" = true ] && escalate_effective="reject"
```

Then change the two downstream consumers of `mode_effective` to use
`escalate_effective`, and enrich the existing `signal_msg` (pre-commit:506) so a
downstream triage read can tell a plain warn apart from an already-blocked repeat
offense (see §3):

```bash
signal_msg="[sweep-guard] BARE commit about to absorb ${n} staged file(s) not necessarily this actor's own: ${staged_oneline}. actor=${actor} mode=${mode_effective} escalated=${escalated} prior_warns=${prior_warns} threshold=${escalate_threshold}. Fix: git commit -m \"<msg>\" -- <own-files-only>."
write_signal "$signal_msg"

if [ "$escalate_effective" = "reject" ]; then
  if [ "$mode_effective" = "reject" ]; then
    echo "[sweep-guard] GIT_SWEEP_GUARD_MODE=reject — BLOCKING this commit. Index is untouched; re-run with an explicit pathspec." >&2
  else
    echo "[sweep-guard] ESCALATED REJECT: actor=${actor} has ${prior_warns} prior BARE warn(s) logged (threshold=${escalate_threshold}) — blocking THIS commit even though GIT_SWEEP_GUARD_MODE=${mode_effective}. Index is untouched; re-run with an explicit pathspec, or set GIT_SWEEP_GUARD_ESCALATE_THRESHOLD=0 to disable escalation (not recommended)." >&2
  fi
  exit 1
fi
```

`log_line` (pre-commit:503-504) stays unchanged in shape (still writes on every BARE
attempt, blocked or not, exactly as it does today for `GIT_SWEEP_GUARD_MODE=reject`) —
this is what keeps the per-actor counter monotonic even across escalated/blocked
retries.

Default threshold=3 is picked directly from po's own measured distribution (14 warns /
4 sessions ≈ 3.5/session) — the 4th BARE attempt in a session is what gets blocked,
which comfortably brackets that empirical average without hair-trigger-blocking a
one-off mistake.

### 2.3 Staged mechanism — global default flip (per po's AC-2, gated on 24h observation)

Keep po's own recommended full graduation as Phase 2, unchanged from the row's AC-2:
after Phase 1 (§2.2 + §3) lands, observe one full day of `.git/sweep-guard.log` warn
volume system-wide. If volume stays low (expected — the escalation mechanism above
should already be suppressing most repeats), PO mints a follow-up row to flip the
in-script default from `${GIT_SWEEP_GUARD_MODE:-warn}` to `${GIT_SWEEP_GUARD_MODE:-reject}`
at pre-commit:489. **Rollback command** (state this in that row's implementation
record verbatim, per po's AC-2): `git revert <the-one-line-flip-commit>`, or as an
immediate non-revert mitigation, export `GIT_SWEEP_GUARD_MODE=warn` in the caller's
shell before commit-authoring flows resume — the env var always overrides the
in-script default, so this requires no code change to un-stick a bad flip.

### 2.4 DoD / positive-control additions for agent-father (AC-4, extends the existing suite)

`scripts/git-hooks/pre-commit.test.sh` currently proves T1-T6 (bare/scoped/directory-
pathspec/rebase/reject-mode/unknown-shape) — already 6/6 green while all 14 of this
tick's BARE commits landed, so green-suite alone is not sufficient evidence per po's
AC-4. Add:
- **T7 (escalation fires):** same simulated `actor` (set `CLAUDE_CODE_SESSION_ID` in the
  scratch repo env) issues `escalate_threshold` consecutive BARE commits in default
  `mode=warn` (each expected to still succeed, matching today's T1 behavior) — the
  `(threshold+1)`th BARE commit from that SAME actor must be blocked (non-zero exit,
  index untouched, matching T5's assertions) even though `GIT_SWEEP_GUARD_MODE` is
  unset/warn.
- **T8 (per-actor scoping, not global):** immediately after T7's block, a DIFFERENT
  simulated actor's FIRST BARE commit in the SAME scratch repo must still only WARN
  (succeed, exit 0) — proves escalation state is keyed per-actor, not a global
  side-effect of T7's run.
- **T9 (opt-out):** `GIT_SWEEP_GUARD_ESCALATE_THRESHOLD=0` — the same actor from T7 can
  issue an unbounded run of BARE commits, none ever escalate.
- Live positive control (po's AC-4, run from a real shell, not just the test suite):
  demonstrate ONE bare commit from a fresh actor identity actually blocked after
  crossing the threshold, and ONE pathspec commit from the same identity still fully
  silent (no stderr, no log line) — record both transcripts in the shipping commit's
  body or the row's implementation note.

---

## 3. Part B — Triage disposition correction

### 3.1 `docs/agents/po/flow/triage-signals.md` — new row (insert into the routing table)

```markdown
| `bug-escalation` | `commit-sweep-guard` | **MANDATORY: parse the payload's own leading tag BEFORE any other check — never disposition off `git show --stat`.** A payload beginning `[sweep-guard] BARE commit about to absorb` is a TRUE POSITIVE BY CONSTRUCTION: pre-commit:453-454 `exit 0`s silently on `mode=SCOPED` before either the log write or this signal's own `write_signal` call is reached, so the signal existing at all IS the mechanism proof — re-verify against `bash scripts/audits/verify-commit-sweep-discriminator.sh` (VERDICT: PASS confirms the discriminator itself is sound on the current git version) if in doubt, never against the resulting commit's diff. **INVALID dispositions — never use to mark a signal benign/closed:** "hook is noisy", "cannot see the pathspec", "`git show --stat <sha>` is clean" — a clean `--stat` is OUTCOME evidence (no peer happened to collide in this particular race window) and is a DIFFERENT claim from MECHANISM (whether a pathspec was actually on the `git commit` line); it can never substitute for the mechanism check above. Correct disposition: parse `escalated=` from the payload (added by FIX-SWEEPGUARD-WARN-ONLY-NO-ACTUATOR-AND-TRIAGE-MISADJUDICATION's hook actuator). If `escalated=true` → the hook itself already blocked this attempt (actor was already over its own per-session threshold and is still trying) — this is a REPEAT-OFFENDER-AFTER-BLOCK signal: open/append a `bug-escalation` FIX-class `.task_board` row (`zone: cross-service/`, dedup-checked against the FIX-COMMIT-SWEEP-GUARD-* family first) citing the actor, priority high. If `escalated=false` (a normal first/second/third-strike warn) → log as a CONFIRMED true positive and append to `pendingObservations[]` for volume tracking; do NOT open a new FIX row per occurrence (the hook's own escalation already converges repeat offenders — see §2 architecture brief `2026-07-31-sweepguard-escalation-actuator-and-triage-mechanism-check.md`). A payload beginning `[sweep-guard] INTERNAL:` is the SEPARATE fail-open/mechanism-broken path (discriminator itself may be malfunctioning on a new git version) — always independently actionable, dedup into a FIX row against the discriminator, never conflated with a BARE finding. | `escalated=true` → FIX row (repeat-after-block) / `escalated=false` → `pendingObservations[]` (never "benign") / `INTERNAL:` → separate FIX (detector malfunction) |
```

### 3.2 `docs/agents/dev-team/flow/drain-signals.md` §0a-3 — new row

```markdown
| `bug-escalation` | `commit-sweep-guard` | PO Step 0-SIG | payload = string message, NOT a file path — starts `[sweep-guard] BARE commit about to absorb` (mechanism-true-positive by construction; PO triage-signals.md's dedicated row is authoritative — NEVER disposition via `git show --stat`, that is outcome not mechanism) or `[sweep-guard] INTERNAL:` (separate fail-open path, always actionable). |
```

This closes the exact gap po diagnosed: today's fallback ("any other type" → "PO
decides", no mandatory evidence read) is why the cheapest disposition won by default —
same structural class as `FIX-CIRED-TRIAGE-WRONG-PLANE-DEDUP-AMNESTY` (a recognised
signal type with no mandatory evidence read in its routing row). The new rows make the
evidence read (parse the payload's own tag + `escalated=` field) mandatory and name
the specific non-dispositions that are now forbidden, closing the loophole at the
routing-table level rather than relying on a future triage pass reasoning it out fresh
each time.

---

## 4. Sequencing for agent-father

1. **Ship together, zero risk, zero dependency on Phase 2:**
   - `docs/agents/po/flow/triage-signals.md` new row (§3.1)
   - `docs/agents/dev-team/flow/drain-signals.md` §0a-3 new row (§3.2)
   - `scripts/git-hooks/pre-commit` per-actor escalation (§2.2) — note this DOES
     change live commit behavior (a 4th same-session BARE commit now blocks), so land
     it and the two doc rows in the SAME commit/session as a paired unit — a triage
     row that expects an `escalated=` field the hook doesn't emit yet is a dangling
     read, not a functional bug, but ships incoherently.
   - `scripts/git-hooks/pre-commit.test.sh` T7-T9 (§2.4)
   - Run the live positive control (§2.4) and record both transcripts.
2. **Gated on 24h observation (§2.3), separate follow-up row minted by PO:** global
   `GIT_SWEEP_GUARD_MODE` default flip from warn to reject, with the rollback command
   stated verbatim in that row's implementation record.

## 5. Dedup check

Re-scanned `.task_board` this session (`jq` over every lane, `/SWEEP/i` on `.id`): 17
matching rows, 6 in the sweep-guard family (HOOK/SKILLS/LAYER2 shipped, PARENT
blocked, SCRIPT-ACTUATOR-AND-NOTEBOOK-LONGTAIL in review, SWEEP-VICTIM-SELF-DETECT
backlog) — none carries an AC for the warn→enforce actuator or the triage adjudication
rule (confirmed by reading each row's own `title`/`ac` field directly). Specifically
checked `FIX-COMMIT-SWEEP-GUARD-SCRIPT-ACTUATOR-AND-NOTEBOOK-LONGTAIL` (review,
next_agent=po): its own title/scope is a DIFFERENT bug — one un-migrated script call
site (`dev-team-tick-preflight.sh:454-455`, still bare after this hook shipped) plus an
unrelated 31-file notebook long-tail cleanup — not the hook's own actuator logic or the
triage routing gap. Zero overlap; this brief does not re-litigate any of the 6.
