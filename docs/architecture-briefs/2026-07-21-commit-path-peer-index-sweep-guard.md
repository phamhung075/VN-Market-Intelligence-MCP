# Architecture Brief — FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD

**Date:** 2026-07-21 | **Author:** architect (router-dispatched, coordination_session 4ae45b71-6dbf-4623-ab62-f388d14d2c85)
**Task:** `docs/data/orch/orch-state.json` `.task_board.ready[]` id `FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD`, P0, recurring_bug_count=3
**Status:** PLAN-ONLY — no code shipped from this brief. Zone: multi (cross-service/).
**BUILD-STANDARD:** not-applicable (bug-fix/hardening class, existing hook infra extended, no new service).

---

## 0. Verdict up front

- Ship **one universal pre-commit hook** (`scripts/git-hooks/pre-commit`), installed the same way as the existing `pre-push` hook. Default disposition: **WARN, never REJECT, fleet-wide, on day 1.** Opt-in per-caller REJECT via `GIT_SWEEP_GUARD_MODE=reject`.
- In the same effort, **fix the 3 already-existing skills' own bare-commit line** (`commit-mutex` Step 3c, `commit-boundary`, `commit`) to pathspec-scoped `git commit -m "<msg>" -- <files>`. This is not cosmetic — it is empirically proven (§2) to structurally eliminate the sweep for anyone who goes through it, independent of the hook.
- The hook is the **universalizing** layer: it is the only one of these controls that cannot be architecturally bypassed by INV-GATEWAY-1 (§1.3), because it lives beneath the OS `git commit` invocation itself, not inside an MCP-bound skill.
- `FIX-AUDITOR-COMMIT-NONEXPLICIT-PATHSPEC` supersession (already recorded by PO on the board) is **endorsed and technically strengthened** (§5): pathspec-scoped commit ignores foreign content regardless of how broadly `git add` staged things, so fixing the commit line subsumes the non-explicit-`git add` root cause that row targeted.
- `next_agent = pm`, not `developer` (§7) — agreeing with PO's rejection, for an additional zone-ownership reason PO's note didn't need to spell out: the deliverable spans zones no single specialist owns (`scripts/git-hooks/` vs `.claude/skills/` vs board bookkeeping).
- AC-6 (second-order harm) is **partially closed** by this design (sweeper-side, real-time) and **explicitly not closed** for the swept victim (§6) — a new row is minted for that (`FIX-COMMIT-SWEEP-VICTIM-SELF-DETECT`, backlog, depends on this row).

---

## 1. Brownfield verification (re-checked raw, not taken on trust)

### 1.1 The 3 occurrences

```
f05795c3c  git show --stat  -> 8 files incl. .github/workflows/ci.yml, apps/mcp-server/bunfig.toml,
                                apps/mcp-server/package.json, scripts/test-coverage.sh, architect notebook
84096f617  git show --stat  -> 4 files; swept scripts/agents-flow/drain-signals.js (+107) and
                                drain-signals.test.js (+97, new) — live developer WIP
0e28eed23  git show --stat  -> 8 files; swept the REMAINDER of the same developer WIP (+23/+65),
                                despite the actor running `git diff --cached --name-status` first
```
All 3 re-confirmed via `git show --stat` at the start of this cycle — matches the row's evidence verbatim.

### 1.2 `.claude/skills/commit-mutex/SKILL.md` — the defect is IN the control

Read raw. Its own critical section (Step 3):
```
3a. git add <path1> <path2> ...
3b. STAGED=$(git diff --cached --name-only)      # snapshot, not a lock
3c. git commit -m "$(cat <<'EOF' ... EOF)"        # BARE — no pathspec
```
Confirmed: an agent that acquires the mutex, stages explicitly, and runs the documented Step 3b
foreign-path check **and passes it** is still vulnerable, because 3b→3c has a gap in which a
peer's `git add` can land, and 3c commits whatever the index holds at that instant — not what 3b
observed. This is exactly what happened to the cowork-team actor in `0e28eed23`.

### 1.3 Scope claim verified: commit-mutex is dispatcher-only, and that's a real gap

`.claude/skills/commit-mutex/SKILL.md` L4-8, verbatim:
> **INV-GATEWAY-1:** This skill is DISPATCHER-ONLY. Dev-\*/qa/ba/pm/architect specialist sub-agents
> MUST NOT invoke this skill — they lack the MCP gateway binding required to call `task_claim`.
> Specialists commit directly (explicit paths).

Cross-checked against `docs/protocols/dev-star-gateway-binding.md` framing and the WF-3 ruling doc
(`docs/architecture-briefs/2026-06-07-wf3-dev-gateway-binding-ruling.md`) — confirmed this is a
real, ratified architectural exemption, not a stale doc claim. A grep of every flow doc that
references `commit-mutex` (60+ files) shows most of them ALSO show a raw inline
`git add ...; git commit -m ...` block adjacent to the skill-wiring pointer — meaning the bare-commit
idiom is not confined to commit-mutex; it is the dominant idiom across the fleet's flow-doc corpus,
independent of any one skill.

Two sibling skills carry the **same class of defect**, confirmed raw:
- `.claude/skills/commit-boundary/SKILL.md` (agents-architect, agent-father, pm, ops — the agents
  with NO gateway binding at all): RULE 2's pre-commit check is `git diff --cached --name-only`
  (same snapshot-not-lock pattern as commit-mutex 3b). RULE 3 is a genuinely useful **post-hoc**
  backstop (`git show --name-only HEAD`, `git reset --soft HEAD~1` undo-on-surprise) that the other
  two skills lack — worth preserving, not replacing.
- `.claude/skills/commit/SKILL.md` (the `/commit` slash command): Step 2 is a bare
  `git commit -m "$(cat <<'EOF' ...)"` with no pathspec, same defect.

**Conclusion:** the router's framing is correct — fixing and universalizing beats inventing a
second parallel mechanism, but "universalizing" cannot mean "route everyone through commit-mutex"
(INV-GATEWAY-1 forbids that for most of the fleet). It has to mean a control that sits beneath all
of them. A git hook is the only thing that qualifies.

### 1.4 Cheap-fix datum re-verified

```
$ ls -la .git/hooks   # only pre-push (symlink) present; pre-commit does not exist
$ cat scripts/git-hooks/install.sh   # line 10: for hook in pre-push; do
$ git --version  # 2.49.0 (this environment)
```
No `.pre-commit-config.yaml`, no husky/lint-staged — clean ground, nothing to conflict with.

### 1.5 Adjacent, non-duplicate context (do not fold in, do not re-touch)

- `UC-CRITIC-HOOKS-ENFORCEMENT` (backlog, P1, next_agent=ba, unstarted): about **Claude
  PreToolUse-style** hooks (orch-state prewrite Zod gate, context-bloat backstop, notebook
  auto-prune, branch hygiene) silently swallowing failure via `2>/dev/null || true`. Different hook
  family (not git hooks), separate row, **not superseded by this one** — this brief's AC-3
  obligation is only "don't repeat that pattern here," not "fix that row."
- `UC-GCP-UNVERIFIED-BATCH` (backlog, P2, next_agent=ba, unstarted, PLAN-ONLY): carries P5 (extract
  the bounded rebase-retry push guard duplicated across commit-mutex/commit-boundary/commit into
  one `scripts/git-push-guarded.sh`), P6 (a `commit-msg` hook — message-format linting, WARN-then-
  BLOCK rollout pattern, same `install.sh` loop), P9 (trim `commit-mutex` to ≤200L). **Genuinely
  adjacent, not this row's scope.** Flagging so whoever eventually works P6/P9: this brief's Layer-1
  Step-3c fix and P9's line-trim both touch `commit-mutex`'s critical section — sequence P9 AFTER
  the Step-3c substance fix ships, not concurrently, so a trim pass doesn't silently revert it.
  P6's WARN-then-BLOCK staged rollout for `commit-msg` is independent precedent (found, not
  invented, by this brief) for the same WARN-first strategy chosen below (§3).

---

## 2. Empirical technical findings (git internals, live-verified — not asserted from docs)

All of the following were reproduced in a disposable scratch git repo (git 2.49.0, this machine),
not the live project repo. Every claim below has a terminal transcript behind it from this session.

### 2.1 Pathspec-scoped commit structurally prevents the sweep — proven, not assumed

```
actor A: git add peerA.txt
actor B: git add actorB.txt
actor B: git commit -qm "msg" -- actorB.txt        # exact-file pathspec on the COMMIT line
```
Result: `git show --stat --name-only HEAD` → **only** `actorB.txt`. `peerA.txt` remains staged,
untouched, in the shared index — actor A's WIP is fully preserved for actor A to commit itself
later. This holds **even if `git add -A` was used** beforehand (tested explicitly) — pathspec
resolution on the `commit` line ignores everything else in the index regardless of how it got
there. This is the mechanism the row's PO addendum hypothesized; it is now empirically confirmed.

### 2.2 The pre-commit hook can reliably tell "was this commit pathspec-scoped" — via `$GIT_INDEX_FILE`

Instrumented a debug pre-commit hook and captured `$GIT_INDEX_FILE` under 4 invocation shapes:

| Invocation | `$GIT_INDEX_FILE` seen by the hook | Class |
|---|---|---|
| `git commit -m msg` (bare) | `.git/index` (the real, persistent, shared index) | **BARE** |
| `git commit -am msg` | `.git/index.lock` (same real index, mid-write) | **BARE** |
| `git commit -m msg -- exact-file.txt` | `.git/next-index-<pid>.lock` (a **scratch** index git builds just for this commit, resolved BEFORE the hook runs) | **SCOPED** |
| `git commit -m msg -- some-dir/` or `-- .` | ALSO `.git/next-index-<pid>.lock` | **looks SCOPED, but is NOT actually safe (§2.3)** |

Critically: for a bare commit, `git diff --cached --name-only` run **inside the hook** shows the
full real-index content (including any peer's foreign staged file). For a pathspec-scoped commit,
the SAME command inside the hook shows **only** the resolved set — because git already narrowed it
before invoking the hook, and holds `.git/index.lock` (the real one) for the whole transaction, so
no peer's concurrent `git add` can land mid-check. **This is the fix for commit-mutex's Step 3b
TOCTOU gap**: running the identical check *inside* the hook, instead of as a separate script step
before `git commit`, closes the race, because git's own locking now covers the check.

### 2.3 Residual loophole found and scoped: directory/dot pathspecs are NOT safe

`git commit -m msg -- some-dir/` and `git commit -m msg -- .` both route through the "scratch
index" code path (same `next-index-*.lock` signature as a safe exact-file pathspec) **but still
sweep every sibling file staged under that path** — verified directly. This means `$GIT_INDEX_FILE`
alone cannot distinguish "deliberate exact-file list" from "directory/dot pathspec that happens to
resolve broadly." None of the 3 real occurrences used this form (all 3 were fully bare), so it is
not required to satisfy the row's verification_gate, but it is a real adjacent footgun that the
Layer-1 fix (§4) must avoid introducing: the mandated replacement form is **exact file paths only**,
never a directory or `.`, on the commit line — mirroring the existing "never `git add -A`/`.`/`dir`"
convention already documented in `commit-boundary/SKILL.md` RULE 1, extended to the commit line too.

As a secondary, best-effort (non-gating) enrichment: `ps -o command= -p $PPID` inside the hook can
see the parent `git commit` process's full argv, including everything after `--` (verified — it
correctly showed `-- sub2/` and `-- .` distinctly from a genuine file list). This is fragile
(platform-dependent `ps` flags/truncation, not a documented git contract) so it must never be the
gating signal, but it is good enough to (a) name likely-swept files precisely in the warn banner
and (b) optionally flag directory/dot pathspecs as a second, lower-confidence warn. Recommended as
an implementation nicety, not a hard requirement.

### 2.4 `git pull --rebase` replay does NOT re-trigger a false warning — verified

Because the push-retry step in all 3 skills does `git pull --rebase origin main` on a non-fast-
forward push, and rebase replays each local commit via `git commit` internally, this was a real
risk of noisy false positives on an already-safe, already-pathspec-scoped commit. Tested directly:
during `git rebase`, the pre-commit hook DOES fire for each replayed commit, but `$GIT_INDEX_FILE`
is ALSO a scratch `next-index-*.lock` during replay (rebase reconstructs a tree from a fixed diff,
it does not consult the live shared index for path resolution) — so replay is always classified
SCOPED regardless of how the original commit was made. **No extra noise from the push-retry path.**

### 2.5 Candidate corroboration signal investigated and rejected: `.head.wip`

`commit-boundary/SKILL.md`'s existing R-HANDOFF protocol already treats `orch-state.json
.head.wip >= 2` as a "contention risk" signal for agents-architect/agent-father. This looked like a
free, local (no-network), already-blessed way to sharpen a WARN into a REJECT only when corroborated.
Checked its actual liveness before relying on it: **live value is currently `null`**; grep across
`scripts/`, `docs/agents/*/flow/`, and `.claude/skills/` shows it is referenced ONLY in that one
narrow-scope skill and is not written by any `orch-apply` transform I could find. Treating a field
this uncorroborated as a reject-trigger would repeat the "empty≠evidence" mistake — **rejected as a
signal**, not used in this design. No other reliable local (non-network) corroboration signal was
found; see §3 for how the disposition decision compensates for that absence.

### 2.6 End-to-end prototype validated against the row's own verification_gate

Built a near-final hook (logic in §4.1) and ran it through the row's exact scenario:
- Actor A stages `peerA.txt`; actor B bare-commits → **WARN fires**, banner names `peerA.txt`
  explicitly, commit still lands with both files (default mode), `.git/sweep-guard.log` gets a line.
- Same scenario with `GIT_SWEEP_GUARD_MODE=reject` → commit is **blocked** (exit 1), index left
  exactly as it was, actor A's file fully recoverable, actor B's fix path is one command
  (`git commit -m msg -- actorB.txt`).
- Actor B commits with an exact-file pathspec (regardless of mode) → **completely silent**, never
  blocked, `peerA.txt` correctly excluded and preserved for actor A. AC-4 satisfied.

Transcripts for all of the above are in this session's tool history; the exact script is in §4.1
and should become `scripts/git-hooks/pre-commit.test.sh`'s fixture (§8).

---

## 3. Disposition decision — WARN default, REJECT opt-in (the trade-off, stated plainly)

**Decision:** the hook's default action on detecting a BARE/unscoped commit is to **warn loudly and
let the commit proceed.** It never hard-blocks by default. A caller can opt into hard-blocking for
its OWN commits via `GIT_SWEEP_GUARD_MODE=reject` in its environment before invoking `git commit`.

**Which way this trades, and why:**

I am trading same-day catch-rate for zero fleet-outage risk on day 1. A hard-reject default would
have caught all 3 real occurrences — but it would ALSO block the majority of commits fleet-wide
starting the moment the hook is installed, because the bare-commit-after-explicit-`git add` idiom
is still the dominant pattern across 60+ flow docs today (§1.3), most of which have not been
migrated to pathspec-scoped commits yet. That is precisely the scenario PO already ruled out for a
different reason (fail-closed on `task_claim`), and precisely the scenario an unattended
zone-detect-Tier-3 developer picking this up alone could produce by choosing REJECT without
weighing it. A misfiring hard-reject stops every agent AND every human on the repo from committing
anything, anywhere, until someone diagnoses and reverts a hook — that is strictly worse than the
sweep bug it replaces, because the sweep bug is silent-but-recoverable (content has been byte-
identical and recoverable in all 3 real occurrences) while a bad fleet-wide pre-commit block is loud
and blocking for 100% of unrelated work.

I am not treating this as "leniency wins, forget it." The WARN path is not a documentation
reminder — it is mechanical, fires on literally every non-compliant commit with no way for the
committing process to not see it (stderr is captured back into the calling agent's own tool
output), and it durably records evidence outside the terminal (§6) so the previous "doc-only failed
3x" failure mode (an agent has to remember and choose to follow a written rule under pressure it
cannot detect) does not recur — the mechanism itself does the remembering.

**Staged escalation path (explicit, not vague):**
1. Ship the hook (WARN default, this row).
2. Ship Layer-1 (§4.2): fix the 3 skills' own commit lines to pathspec form. Their traffic — the
   highest-volume, most-scrutinized call sites — stops triggering the warn almost immediately.
   Recommend these 3 (once fixed) additionally set `GIT_SWEEP_GUARD_MODE=reject` around their own
   critical section: since their commit line is now correct by construction, REJECT is a
   self-regression guard for them specifically, not a fleet-wide gamble.
3. Layer-2 (not this row, named for PM to schedule): sweep the remaining ad-hoc inline
   `git commit -m` blocks in individual flow docs (the long tail behind the 60+-file grep in §1.3)
   to the same pathspec form, using the same technique, one PM-tracked cleanup pass.
4. Flip the GLOBAL default from WARN to REJECT — **explicitly a future, PO-gated decision**, informed
   by the WARN-path telemetry this hook already emits (§6: `docs/signals/*.json` + `.git/sweep-
   guard.log`). Not mandated here, no threshold prescribed here — that is genuine operational tuning
   for whoever reviews the telemetry at the time, not something to freeze into this brief.

---

## 4. Design

### 4.1 Layer 0 — `scripts/git-hooks/pre-commit` (new, universal backstop)

Pure bash, zero required external dependencies for the gating decision (no `jq`, no `curl`, no
network — only `git` builtins and POSIX shell), so it cannot itself become a new network-availability
failure mode inside the commit hot path. Logic (validated end-to-end in §2.6):

```bash
#!/usr/bin/env bash
set -u
idx_base="$(basename -- "$GIT_INDEX_FILE" 2>/dev/null)"

case "$idx_base" in
  index|index.lock)      mode="BARE"   ;;   # reads/writes the shared persistent index directly
  next-index-*.lock)     mode="SCOPED" ;;   # git already resolved an explicit pathspec pre-hook
  *)                     mode="UNKNOWN";;
esac

[ "$mode" = "SCOPED" ] && exit 0   # AC-4 — never blocks the legitimate pathspec-scoped case

if [ "$mode" = "UNKNOWN" ]; then
  # Internal/mechanism-broken path — mirrors commit-mutex's own C-2/C-2b precedent:
  # fail OPEN (never block on our own uncertainty) but LOUD (never 2>/dev/null||true).
  echo "[sweep-guard] INTERNAL: unrecognized GIT_INDEX_FILE shape ($GIT_INDEX_FILE) — fail-open" >&2
  # best-effort docs/signals/ write here too (see §6) — non-fatal if it fails
  exit 0
fi

# mode == BARE — race-free at this point: the hook runs inside git's own index.lock
# transaction, so this reflects exactly what is about to be committed.
staged="$(git diff --cached --name-only)"
n=$(printf '%s\n' "$staged" | grep -c .)

banner "This commit has no pathspec — it will absorb ALL $n currently-staged file(s): $staged.
         Fix: git commit -m \"<msg>\" -- <only-your-own-files>"   # full text in §2.6 transcript
echo "$staged" >> .git/sweep-guard.log                              # local, fast, untracked
write_signal_bug_escalation "$staged"                                # durable, see §6 — best-effort

if [ "${GIT_SWEEP_GUARD_MODE:-warn}" = "reject" ]; then
  echo "[sweep-guard] GIT_SWEEP_GUARD_MODE=reject — BLOCKING." >&2
  exit 1
fi
exit 0
```

Companion `scripts/git-hooks/post-commit` (optional, small): once the sweeper's commit SHA exists,
append it to the SAME `.git/sweep-guard.log` line (correlate via a short-lived marker file written
by pre-commit, read+removed by post-commit) so the durable evidence trail carries the exact SHA a
swept actor's content landed under — this is what makes recovery (`git show <sha>:<path>`) a single
command instead of a git-log archaeology exercise. Non-blocking; failure here must never affect
commit outcome (the commit already happened by the time post-commit runs).

### 4.2 Layer 1 — fix the 3 existing skills' own critical section (small, surgical, high-leverage)

| File | Current defective line | Fix |
|---|---|---|
| `.claude/skills/commit-mutex/SKILL.md` Step 3c | `git commit -m "$(cat <<'EOF' ...)"` (bare) | `git commit -m "$(cat <<'EOF' ...)" -- <own_paths from Step 3a>` |
| `.claude/skills/commit-boundary/SKILL.md` (insert between RULE 2 and RULE 3) | no explicit commit-line pathspec shown at all today | New sub-rule: "commit with `-- <same explicit paths from RULE 1>`"; keep RULE 3's post-hoc `git show`/`reset --soft` as defense-in-depth, not the primary control |
| `.claude/skills/commit/SKILL.md` Step 2 | `git commit -m "$(cat <<'EOF' ...)"` (bare) | same `-- <paths>` addition, reusing the Step 1 explicit file list already collected |

Each of these is a few-line, mechanical, already-fully-specified edit (no design ambiguity left for
the implementer) — deliberately kept small so it can land alongside Layer 0 in the same effort and
immediately cut warn-volume from the fleet's highest-traffic commit call sites (§3 step 2).

### 4.3 Layer 0 install wiring

`scripts/git-hooks/install.sh` line 10:
```bash
for hook in pre-push; do
```
→
```bash
for hook in pre-push pre-commit; do
```
(and `post-commit` too, if §4.1's companion hook ships). Satisfies AC-5 directly: this is the exact,
already-proven, already-tracked-source-plus-symlink pattern the row cites as precedent — a fresh
clone or a `.git` rebuild re-installing hooks is already how `pre-push` survives that scenario
today; extending the loop is the entire fix, no new mechanism needed.

---

## 5. Duplicate resolution — `FIX-AUDITOR-COMMIT-NONEXPLICIT-PATHSPEC`

Already marked `superseded_by: FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD` on the board by PO
(2026-07-21T16:35:12Z), with `"DO NOT WORK THIS ROW — work the successor"` and the row retained
(not deleted) for its occurrence-0 evidence. **Endorsed, no further board action needed on that row
from this brief.** The technical finding in §2.1 strengthens rather than merely confirms the
supersession: that duplicate's root-cause framing was "non-explicit `git add`" (the system-auditor
occurrence used a broad `git add`, not a bare commit-line specifically). §2.1 shows this framing is
now subsumed — a properly pathspec-scoped **commit line** is safe regardless of how broadly `git
add` staged beforehand (tested with `git add -A` explicitly). Fixing the commit line is therefore
both necessary and sufficient; a parallel "audit every `git add` call site for explicitness" effort
(the duplicate's original, never-dispatched, doc-only-`agents-architect`-scoped remediation) would
have been solving the wrong end of the pipe even had it shipped.

---

## 6. Observability (AC-2, AC-3) and second-order harm (AC-6)

**Three channels, all mechanical, none silent:**
1. **stderr banner** — immediate, terminal-visible, captured into the calling agent's own tool
   output (verified in §2.6 — the sweeping agent sees this in real time, cannot miss it the way a
   scrolled-past doc reminder can be missed).
2. **`.git/sweep-guard.log`** (untracked, local, JSONL-ish) — fast same-session diagnostic trail,
   survives nothing (lives in `.git/`, wiped on rebuild) but costs nothing and needs no tooling.
3. **`docs/signals/<hook>-<ISO-timestamp>.json`**, shaped exactly like the existing
   `bug-escalation` signal schema already documented in `docs/protocols/fail-loud-protocol.md`
   Output Boundary §5 and already live-consumed (confirmed: `docs/signals/processed/*.json` shows
   this exact `{from,to,type,payload,priority,createdAt}` shape being processed today, e.g.
   `market-watcher-2026-07-19T20-06-06Z-exec-proof-fail.json`). Written via pure bash+`jq` to a
   local file — **zero MCP/network dependency**, so it can never be blocked by gateway
   unavailability, and it survives a `.git` rebuild (unlike channel 2) because `docs/signals/` is a
   tracked repo path. `"from": "commit-sweep-guard"`, best-effort `CLAUDE_CODE_SESSION_ID` embedded
   for attribution (same env-var convention already required in `scripts/auditor-notebook-commit.sh`),
   `"to": "po"` (existing convention — PO triages bug-escalations). This is the channel that answers
   "how does a plain bash git hook with no agent identity and no MCP binding notify the fleet" —
   reusing an already-live mechanism rather than adding `mcp-call.sh`'s network round-trip to a
   hot commit path. `send_telegram` via `mcp-call.sh` is noted as an OPTIONAL secondary enrichment
   for immediacy, explicitly non-blocking and never gating, since it depends on network+gateway
   availability which the hook's core correctness must not.

**Internal guard failure (AC-3):** an unrecognized `$GIT_INDEX_FILE` shape (future git version
changing this internal convention, or any unexpected state) is treated as a DIFFERENT case from "a
real violation was found" — logged loudly (§4.1 `UNKNOWN` branch) and fails OPEN, mirroring
commit-mutex's own already-PO-ratified C-2/C-2b distinction (transport failure / mechanism-broken →
skip+notify, never silently pass AND never hard-block on the guard's own uncertainty). This is the
same fail-open-but-loud shape PO explicitly asked for, applied consistently, not invented ad hoc.

**AC-6, stated plainly:** this design closes the **sweeper-side** half of the second-order harm —
the sweep event itself is now observable, at the moment it happens, with the exact file list named,
through a channel durable enough to survive the terminal scrolling away. It does **not** close the
**swept-victim-side** half. Git has no concept of "which process staged this file" — there is no
attribution to reconstruct after the fact without an out-of-band declaration of intent, and the
victim in all 3 real occurrences never got to run a `git commit` at all (its `git add` simply lost
the race silently) — meaning there is no process for a commit-path hook to attach a victim-side
warning to. Closing that gap needs either a manifest/intent-declaration primitive (larger than a
hook) or a post-hoc reconciliation check wired into the fleet's shared end-of-cycle infrastructure
(reusing the evidence this row already emits) — genuinely a separate deliverable. Minted as:

**`FIX-COMMIT-SWEEP-VICTIM-SELF-DETECT`** (backlog, P2, `depends: [FIX-COMMIT-PATH-PEER-INDEX-
SWEEP-GUARD]`, owner/next_agent null — routed through normal triage, not direct-to-ready, because
unlike the parent row this is not itself a 3x-recurring dispatch failure) — full rationale in the
row's own `note` field on the board.

---

## 7. Routing — `next_agent: pm`, not `developer`

Agree with PO's rejection of `next_agent=developer` as the direct assignee. Adding a reason PO's
note did not need to spell out because it was about dispatch-path risk, not zone ownership: **the
deliverable genuinely spans zones no single specialist owns.**

| Artifact | Zone | Owning agent per existing declared boundaries |
|---|---|---|
| `scripts/git-hooks/pre-commit`, `post-commit`, `install.sh` edit, `pre-commit.test.sh` | `scripts/` | developer (precedent: `UC-GCP-P4` routed `scripts/git-hooks/pre-push` work to developer, PO decision log 2026-07-13) |
| `.claude/skills/commit-mutex/SKILL.md`, `commit-boundary/SKILL.md`, `commit/SKILL.md` | `.claude/skills/` | agent-father (`commit-boundary/SKILL.md`'s own declared-zone table; agent-father `init.md` `commit_zone.allowed` explicitly excludes `scripts/`, so agent-father structurally cannot be the SOLE owner either) |
| `docs/data/orch/orch-state.json` board transitions | board bookkeeping | pm / router (agent-father `init.md` explicitly excludes this except one signal-queue mark) |

No single specialist's declared zone covers all three. This is precisely the cross-zone case
architect's own flow contract routes to PM for decomposition ("Multi-zone = list all; PM will split
into per-zone subtasks" — `docs/agents/architect/flow/main.md` Step 2/5), independent of and
consistent with PO's dispatch-path concern: PM decomposing this into explicit, PM-directed,
supervised subtasks (one to developer carrying the §4.1 spec verbatim, one to agent-father carrying
the §4.2 table verbatim) is categorically different from an unattended generic developer reaching
this artifact through zone-detect's Tier-3 fallback with no spec at all — it closes PO's stated
concern all the way down the dispatch chain, not just at this row's own `next_agent` field.
**PM must not re-delegate the `scripts/git-hooks/` subtask via unattended zone-detect auto-pickup
either** — it should carry this brief's §4.1 pseudocode as an explicit, supervised handoff.

---

## 8. Files to create / modify (for PM's decomposition)

**Create:**
- `scripts/git-hooks/pre-commit` — §4.1 logic, developer zone
- `scripts/git-hooks/post-commit` — optional SHA-correlation companion, §4.1, developer zone
- `scripts/git-hooks/pre-commit.test.sh` — scratch-repo regression suite mirroring §2.1/2.2/2.3/2.4/2.6
  exactly (bare-sweeps-foreign, pathspec-excludes-foreign-even-after-`add -A`, directory/dot-loophole
  documented as a known-non-goal, rebase-replay-no-false-warn, reject-mode-blocks-and-preserves-index)
  — same naming convention as `scripts/agents-flow/*.test.sh`, developer zone. This is the row's
  verification_gate made permanent, not a one-time manual check — protects against a future git
  version silently changing the `next-index-*.lock` internal naming this design depends on (verified
  only on git 2.49.0/macOS in this session; recommend the implementer also run it once in CI/Linux
  before treating AC as durably satisfied).

**Modify:**
- `scripts/git-hooks/install.sh` line 10 — §4.3, developer zone
- `.claude/skills/commit-mutex/SKILL.md` Step 3c — §4.2, agent-father zone
- `.claude/skills/commit-boundary/SKILL.md` (new sub-rule between RULE 2/3) — §4.2, agent-father zone
- `.claude/skills/commit/SKILL.md` Step 2 — §4.2, agent-father zone
- `docs/policies/dev-standards.md` § Script Persistence — add the canonical-pointer line for
  `scripts/git-hooks/pre-commit` per that section's own convention (agent-father or developer,
  whichever lands last)

## Test strategy

- `scripts/git-hooks/pre-commit.test.sh`: scratch-repo scenarios per §8, run manually at
  implementation time (no CI wiring exists for `scripts/agents-flow/*.test.sh` today either — this
  mirrors that existing, accepted convention rather than inventing new CI infra out of scope).
- Row's own `verification_gate` text is satisfied by the same scratch-repo technique already used
  in §2.6 of this brief — implementer should re-run it against the FINAL script, not just this
  brief's prototype, before marking the row DONE.

## Risk flags

1. **Detection depends on git-internal naming (`next-index-*.lock`)** — not a documented public API.
   Verified stable on git 2.49.0/macOS this session; mitigated by making §8's test script permanent
   and by the `UNKNOWN`-shape fail-open path (§4.1) so a future git version change degrades to
   "no warning" rather than "wrongly blocks everyone."
2. **WARN-fire volume on day 1** could be high (§1.3: bare-commit-after-add is still the majority
   idiom) — mitigated by shipping Layer 1 in the same effort (§3 step 2), and by `docs/signals/`
   already having a live dedup precedent (`docs/data/auditor-dedup-ledger.json`, shipped one day
   before this brief) if volume proves to be a real triage burden for PO later — not built into v1,
   named here so it isn't reinvented from scratch if needed.
3. **`ps`-based argv enrichment (§2.3) is platform-fragile** — explicitly scoped as non-gating,
   best-effort only; core detection never depends on it.
4. **Directory/dot-pathspec loophole (§2.3) is policy-enforced, not 100% mechanically closed** —
   acceptable because it is not one of the 3 observed occurrences and the row's verification_gate
   does not require it; flagged so it is not silently forgotten.

## Scan clean: true ✓
