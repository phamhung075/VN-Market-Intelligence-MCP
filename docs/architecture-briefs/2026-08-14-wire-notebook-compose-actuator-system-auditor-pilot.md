# Brief: wire the already-built, already-tested `scripts/notebook-compose.sh` actuator into `system-auditor`'s notebook write (PILOT — system-auditor only)

**Date:** 2026-08-14T19:04:52Z
**Author:** agents-architect
**Priority:** P0 (per `task_board.in_progress[].FIX-AUDITOR-NOTEBOOK-COMPOSE-ACTUATOR-BUILT-TESTED-NEVER-WIRED`, promoted P1→P0 by `po_approval_20260814T0525Z`)
**Tracking row:** `FIX-AUDITOR-NOTEBOOK-COMPOSE-ACTUATOR-BUILT-TESTED-NEVER-WIRED` — **this brief routes through that existing tracked row, not a fresh untracked handoff.** Two prior identical handoffs to `agent-father` (`docs/signals/processed/2026-08-06-notebook-compose-script-actuator-landed.json`, `docs/signals/processed/fix-system-auditor-cycle-closeout-actuator-and-signal-path-20260809T0243Z.json` item 4a) were filed to `processed/` with no board row and neither landed — that is the second-order defect this row exists to close. Do not repeat that shape: implementer must update `FIX-AUDITOR-NOTEBOOK-COMPOSE-ACTUATOR-BUILT-TESTED-NEVER-WIRED` on completion, not just mark a signal processed.
**Upstream artifacts (read before implementing, do not re-litigate):** `docs/improvement-proposals/IMP-20260814-system-auditor-notebook-compose-actuator-never-wired.md` (Weakness/Evidence/Architect-Review/PO-Critique/Verdict — the PO rulings restated in §PO Rulings below are copied verbatim from that doc's Verdict) and `docs/architecture-briefs/2026-08-06-fix-system-auditor-notebook-compose-actuator-and-immutability-blindspot.md` (original incident analysis that produced `scripts/notebook-compose.sh`).

## Scope

**PILOT-ONLY, deliberately — `system-auditor` alone.** Per PO's ruling, do NOT widen to the other 36 APPEND-class agents in `.claude/skills/notebook-write/SKILL.md` AC-6's table. That fleet-wide rollout is owned by `FIX-NOTEBOOK-COMPOSE-REWRITES-RETAINED-PRIOR-SECTIONS` (also P0) and is gated on this pilot's Success Signals 1–4 reading green first, per `feedback_fleetwide_gate_validated_on_one_file_optout_allowlist`.

**Files touched (exactly 4 — confirmed sufficient, no additions):**
- `docs/agents/system-auditor/flow/main.md`
- `docs/agents/tools/package/system-auditor.md`
- `scripts/notebook-compose.sh` — **NOT modified.** Confirmed below (§AC-3) that the one plausible gap (`c<NNN>` derivation) is correctly resolved by NOT touching this file.
- `docs/agent-memory/notebooks/system-auditor.md` — one data-repair commit only, no flow logic.

## Fresh evidence (RAW-verified this cycle, 2026-08-14T19:0x — supersedes the board row's now-17h-stale 01:56Z snapshot)

The board row's evidence was captured 2026-08-14T01:53Z. Live re-read just now shows the file has partially self-healed (someone/something pruned it from 426L/5 sections down to 188L/3 sections) but **both core defects are still live, right now, in a freshly-written cycle**:

```
$ grep -n '^## ' docs/agent-memory/notebooks/system-auditor.md
4:## c99 · 2026-08-14T16:00Z
38:## c98 · 2026-08-14T08:59:11Z
105:## c31626 · 2026-08-14T18:20Z
$ wc -l docs/agent-memory/notebooks/system-auditor.md
188
```
- **Ordering still inverted:** `c31626 · 2026-08-14T18:20Z` is the newest entry by a wide margin (18:20 > 16:00 > 08:59) yet sits at the BOTTOM. Newest-first is violated on the very latest cycle, not just in historical evidence.
- **Numbering still non-monotonic/nonsensical:** `c31626` bears no relation to the file's other counters (`c99`, `c98`) — a fifth-digit jump matching the exact "session-fragment-style" corruption class `FIX-AGENT-NOTEBOOK-UUID-PROVENANCE` was built to catch (prose-only counter derivation, no actuator, model free-hands a plausible-looking but wrong number).
- **The marker reaper is still dead and the residue is still growing:** `find docs/agent-memory -maxdepth 1 -name '.auditor-cycle-markers-*.tmp' -mmin +20 | wc -l` → **14** (board row measured 13 at 01:56Z — up one 17 hours later, consistent with zero reaping in the interim, not a fluke).

This confirms the defect is live and ongoing as of the moment this brief is being written, not a settled historical incident — reinforces urgency, does not change the design below.

## Confirmed findings carried forward from the Architect Review (do not re-derive, already RAW-verified)

1. **Wiring `scripts/notebook-compose.sh` as-is closes the *truncation*-shape defect completely** (its step 8 belt-and-suspenders byte-identity check on every retained section makes a "heading survives, body gutted" write structurally unreachable — stronger than the current interim `main.md` Step 2a guard, which only diffs the *set* of heading lines and is proven blind to a body-only mutation, e.g. the `c89→c90`/`fefa04067` occurrence).
2. **AC-3 (`c<NNN>` derivation) is a real, confirmed gap** — the script's own contract states the new-section-body-file is "the ENTIRE caller-authored surface" including its heading; the script performs no derivation or validation of the counter itself. This is NOT closed by wiring the script in as-is.
3. **The script's default `--section-cap=60` is undersized** for real Tier-1 CRITICAL/WARN content — observed real sections: ~84L (2026-08-09 occurrence), ~105L (2026-08-14 `c89`), and this cycle's fresh 84L ALL_GREEN Tier-1 entry (`c31626`, RAW-PROBE only, no Findings) is already brushing the default cap.

## PO Rulings — binding, not to be re-opened by the implementer

Copied verbatim in substance from `IMP-20260814-...md` §Verdict (`po_approval_20260814T0525Z` on the tracking row):

1. **AC-3 closed as option (a).** `main.md`'s rewired notebook-write step computes `c<NNN>` deterministically **in bash, inside `main.md`, before the model authors any prose** into the new-section-body-file. The model never chooses the number. Option (b) — teaching the script to derive/validate the counter itself — is REJECTED: it puts a policy decision inside a byte-mover whose entire value is that it re-authors nothing, and the script has other (future) callers to keep generic.
2. **Section-cap ruled, not deferred.** Raise `--section-cap` to comfortably hold one full RAW-PROBE section and **accept reduced effective retention** as the consequence. Do **NOT** move RAW-PROBE to a side-car file in this change — co-locating evidence with verdict is the point of the notebook, and a side-car re-creates the two-plane split this fleet has repeatedly lost data across (see `project_dashboard_two_data_planes`-class incidents). Fewer, complete sections beat more, clipped ones.
3. **Success Signal 3 (`grep -c 'notebook-compose.sh' main.md > 0`) is insufficient and is replaced, not supplemented, by a runtime-execution proof.** A doc-grep only proves a string was typed — it is satisfied by a commented-out line, a line with a missing Bash-allowlist grant, or (per Critique field 2) any other "wired but never actually executes" shape, which is the *exact* failure class this whole task exists to end. The doc-grep is retained only as a necessary-not-sufficient precondition (§Verification Gate below).
4. **Item 7 (governance ruling on `processed/`-without-a-board-row) is SEVERED.** Not in scope for this brief or its implementation. It is a separate fleet-wide signal-lifecycle policy question.

Scope is **PILOT-ONLY** (restated, binding — see §Scope above).

## Design

### AC-1 — Replace Steps 1a/1(a–g)/2/2a with one scripted actuator call

Current `docs/agents/system-auditor/flow/main.md` lines ~1067–1157 (`Notebook write` heading through the end of Step 2a) are replaced wholesale. New shape, mirroring the `scripts/auditor-notebook-commit.sh` precedent exactly (model authors substantive content only, then calls ONE script and branches on its stdout marker):

```bash
# ── Notebook write — scripted actuator (FIX-AUDITOR-NOTEBOOK-COMPOSE-ACTUATOR-BUILT-TESTED-NEVER-WIRED) ──
NB_PATH="$PROJECT_ROOT/docs/agent-memory/notebooks/system-auditor.md"

# --- AC-4: claim the notebook-write mutex BEFORE deriving c<NNN> or touching the file ---
# Reuses the ALREADY-VALID task_kind="commit-mutex" (apps/mcp-server/.../coordinationStore.ts
# CHECK constraint already includes it — zero schema change, zero dependency on the BLOCKED
# FIX-NOTEBOOK-WRITE-TASK-KIND-ENUM-EXTENSION chain). Uses a DEDICATED task_id, deliberately
# NOT "commit-mutex:main" — that id is the fleet-wide GLOBAL git-index lock
# (.claude/skills/commit-mutex/SKILL.md: "Scope: ONLY that seconds-long [git add/commit]
# section"); reusing it here would serialize this notebook's compose step against every
# unrelated agent's commit fleet-wide. A dedicated id under the same already-valid kind gets
# the correct reap/no-adoption semantics (coordinationStore.ts's own comment: "'commit-mutex':
# short-lived git-index lock — NOT adoptable work" — exactly the right treatment for an
# abandoned mutex, not a stray sprint-task) without borrowing the global lock's contention.
compose_claim = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:              "commit-mutex:system-auditor-notebook",
  task_kind:            "commit-mutex",
  owner_agent:          "system-auditor",
  owner_client_session: $CLAUDE_CODE_SESSION_ID,
  ttl_seconds:          60,
  payload:              {"site": "notebook-compose", "tier": AUDIT_TIER, "tick": FIRE_TICK}
})
if compose_claim.claimed == false:
  holder = compose_claim.current_holder.owner_client_session   # per C-2b: absent holder+no error = mechanism broken, treat as SKIP too
  if holder == $CLAUDE_CODE_SESSION_ID:
    call_tool(server="vn-market", tool="task_heartbeat", arguments={
      task_id: "commit-mutex:system-auditor-notebook", owner_client_session: $CLAUDE_CODE_SESSION_ID})
    # re-entrant — proceed
  else:
    echo "[notebook-compose-mutex] SKIP contended-or-broken holder=<holder|none> — deferring this cycle's notebook write, retry next tick" | tee -a "$MARKERS_FILE"
    # Do NOT touch the notebook this cycle. Anomaly/signal/DASHBOARD/OUTPUT-CONTRACT already ran
    # independently above and are unaffected — only the durable cycle-log narrative is deferred.
    # Skip directly to end-of-cycle bookkeeping (RETURN block) — do not call notebook-compose.sh
    # or the Commit step below this cycle.
# else: claimed=true → proceed, now holding the lock.

# --- AC-3 (PO-closed option a): c<NNN> derived in bash, model never chooses the number ---
LAST_N=$(grep -oE '^## c[0-9]+' "$NB_PATH" | grep -oE '[0-9]+' | sort -n | tail -1)
NEXT_N=$(( ${LAST_N:-0} + 1 ))
UTC_STAMP="$(date -u +"%Y-%m-%dT%H:%MZ")"

# --- Model authors ONLY the substantive body (same content the old Step 1c template already
# specified: Tier line, Anomalies line, Status line, RAW-PROBE fence, Findings, Summary) into a
# scratch file whose heading line is machine-built, never freehand: ---
NEW_SECTION_FILE="$PROJECT_ROOT/docs/agent-memory/.auditor-cycle-newsection-${FIRE_TICK}.tmp"
cat > "$NEW_SECTION_FILE" <<EOF
## c${NEXT_N} · ${UTC_STAMP}
### Audit Run Tier-${AUDIT_TIER} (HH:MM–HH:MM UTC YYYY-MM-DD)
- Tier: ${AUDIT_TIER} | Services: N checked | Sources: N checked | DB checks: N
- Anomalies: N new (C critical, W warn, I info) | M dedup-skipped
- Status: HEALTHY | DEGRADED | CRITICAL
<... RAW-PROBE fence / Findings / Summary exactly as today's template, unchanged ...>
EOF
# BCTC-EVAL-SNAPSHOT sub-block (Tier-2, if applicable) still goes inside this same file, unchanged.

# --- AC-1: the ONE scripted actuator call ---
COMPOSE_OUT="$(bash scripts/notebook-compose.sh "$NB_PATH" "$NEW_SECTION_FILE" 3 150)"
COMPOSE_RC=$?
echo "$COMPOSE_OUT" | tee -a "$MARKERS_FILE"

# --- Release the mutex unconditionally, BEFORE branching on the marker (mirrors
# auditor-notebook-commit.sh's own trap-EXIT unconditional-release-on-every-path pattern) ---
call_tool(server="vn-market", tool="task_release", arguments={
  task_id: "commit-mutex:system-auditor-notebook", owner_client_session: $CLAUDE_CODE_SESSION_ID})
rm -f "$NEW_SECTION_FILE"
```

**Verdict handling (branch on `COMPOSE_OUT`'s first `[notebook-compose]` line — replaces the old Step 2a entirely):**
- `OK ...` → paste verbatim into the notebook is no longer applicable (the script already wrote the notebook) — instead capture the marker for the commit-message embedding below (§Success Signal 3), then proceed to **Commit**.
- `WARN ...` (non-blocking: `new-section-trimmed-to-cap` / `direction-defaulted` / `ac2b-subblock-pruned`) → same as OK, the script still wrote and the `OK` line always follows on the same run; proceed to **Commit**.
- `ABORT ...` (`single-section-overage` / `internal-invariant-violated`) → **notebook untouched by construction** (script writes nothing on any ABORT). Send BUG telegram `[system-auditor] notebook-compose ABORT — <marker line> — this cycle's notebook write skipped, retry next tick`. Log `[NOTEBOOK-GATE-ABORT]` for the next cycle to see (same convention the old Step 2a already used). Do **not** call Commit (nothing staged). Continue the rest of the flow unaffected — this is a caught-and-skipped write, not a fatal cycle error.
- `ERROR ...` (`bad-usage` / `notebook-not-found` / `new-section-file-not-found` / `new-section-empty` / `new-section-missing-heading` / `new-section-multiple-headings` / `tmpfile-write-failed` / `atomic-mv-failed`) → flow-wiring bug (the first four should be unreachable if this rewire is implemented correctly — a live occurrence means the wiring itself is broken, not the script). BUG telegram, continue rest of flow (do NOT abort the whole audit cycle — anomaly/signal/DASHBOARD work already landed independently above this section).

This replaces old Step 1a, Step 1(a–g), Step 2, and Step 2a in their entirety. The **Commit** step immediately below (unchanged call to `scripts/auditor-notebook-commit.sh`) stays exactly as documented today — do not touch its own internal `commit-mutex:main` claim; it is sequential, not nested, with the new compose-mutex above (claimed→released before Commit ever starts), so there is no double-claim/self-deadlock risk.

### AC-2 — Authorize the new calls in the Bash/MCP allowlist

`docs/agents/tools/package/system-auditor.md`:
1. **Bash allowlist line** (currently: "`grep`/`wc`/`comm` against the notebook path (Step 1a/2a snapshot+corruption-check...)"): update the step-reference (Step 1a/2a no longer exist) to point at the new Step 1 `c<NNN>` derivation, and add `bash scripts/notebook-compose.sh <notebook-path> <new-section-body-file> [max-sections] [section-cap]` (the ONE authorized actuator call — mirrors the existing `bash scripts/auditor-notebook-commit.sh <msg> <notebook-path>` entry immediately after it). Per AC-2's own instruction this omission is a *plausible* reason a prior wiring attempt could have failed at runtime even had the flow edit landed — this is the load-bearing half of the wiring, not a formality; PO's Critique field (1) names this exact miss as "the single combination [that] is the whole 'shipped but never wired' failure this proposal exists to end, reproduced one layer down" if skipped.
2. `git checkout -- docs/agent-memory/notebooks/system-auditor.md` (old Step 2a revert-on-mismatch) is no longer used by this flow (the script itself never leaves a partial/corrupt write on disk — every non-OK exit path is a no-op on the real file) — safe to drop from the allowlist, or leave as a harmless unused grant; implementer's call, not load-bearing either way.
3. **`## Task-Lock Audit Tools` section currently states task_claim/task_release are NOT available** ("Read-only audit only — never writes locks", only `task_list_held` listed) — this already contradicts the live flow, which has used `task_claim`/`task_heartbeat`/`task_release` for fire-election (`main.md` §Step 0d) since before this task existed. Reconcile this section while the file is open anyway: add `task_claim` / `task_heartbeat` / `task_release` with their existing fire-election use (`task_id=FIRE_TASK_ID, task_kind="sprint-task"`) retroactively documented, plus the new compose-mutex use from AC-4 above (`task_id="commit-mutex:system-auditor-notebook", task_kind="commit-mutex"`). This is a pre-existing documentation/reality drift, not introduced by this change, but AC-2's own "verify before assuming" instruction applies equally here — worth 10 minutes to close while touching this file.

### AC-3 — `c<NNN>` derivation (closed, see PO Ruling 1 and AC-1's bash above)

No script change. `main.md`'s new Step 1 computes `NEXT_N` via `grep -oE '^## c[0-9]+' ... | sort -n | tail -1`, `+1`, defaulting to `c1` on no match (empty file / blank-state) — same idiom the improvement proposal's Architect Review already specified, reused verbatim.

### AC-4 — Concurrency (closed, see the `task_claim`/`task_release` wrap in AC-1's bash above)

Reuses the already-valid `task_kind="commit-mutex"` under a dedicated `task_id="commit-mutex:system-auditor-notebook"`, held ONLY across derive→author→script-call (never across this cycle's earlier probe/analysis work — same TTL-hazard-avoidance principle `FIX-NOTEBOOK-WRITE-AC7-SKILL`'s own note states), TTL=60s (generous relative to the script's actual sub-second runtime, short enough not to strand a peer long on a dead session). **This satisfies AC-4's "takes the notebook-write mutex" branch without depending on the BLOCKED `FIX-NOTEBOOK-WRITE-TASK-KIND-ENUM-EXTENSION` chain** — matching PO Critique field (4)'s explicit preference for "the re-read-and-reconcile alternative... which has no such [MCP-server-dependency] risk," while providing true mutual exclusion (stronger than a bare re-read) at zero schema cost.

### AC-5 — Data repair (separate, FIRST commit — do not bundle with the flow rewire)

Repair `docs/agent-memory/notebooks/system-auditor.md` to the documented steady state before or independently of the flow rewire landing. Live state as of this brief (see §Fresh evidence): 3 sections, correctly ≤200L, but mis-ordered and mis-numbered. Concrete repair (heading-line text only — **every retained section's body stays byte-identical**, AC-2a immutability invariant, matching the improvement proposal's own §Proposed-Change item 5):

| Current heading | Current position | Real timestamp | Repaired heading | Repaired position |
|---|---|---|---|---|
| `## c31626 · 2026-08-14T18:20Z` | 3rd (bottom) | 18:20Z (newest) | `## c100 · 2026-08-14T18:20Z` | 1st (top) |
| `## c99 · 2026-08-14T16:00Z` | 1st (top) | 16:00Z | `## c99 · 2026-08-14T16:00Z` (unchanged) | 2nd |
| `## c98 · 2026-08-14T08:59:11Z` | 2nd | 08:59:11Z (oldest) | `## c98 · 2026-08-14T08:59:11Z` (unchanged) | 3rd (bottom) |

Rationale: `c99`/`c98` are already internally consistent (descending number = descending time); only `c31626` is corrupt and out of place. Renumbering it to `c100` (continuing the real sequence) and repositioning it to the top closes both defects in one edit with zero risk to the other two sections' content. Verify with `grep -n '^## '` immediately after: expect `c100` (18:20) > `c99` (16:00) > `c98` (08:59), strictly descending both axes, exactly 3 sections, no stray `## ` heading — i.e., the repaired file should already read as a live pass of the Verification Gate below.

### AC-6 — Marker reaper (Step 0b.1) becomes real, verifiable executed bash; `FIRE_TICK` filename key hardened

Two sub-fixes, both inside `main.md`, both small:

**(a) Fail-loud guard at `MARKERS_FILE` init** (current line ~284, unconditional in the live file):
```bash
if [ -z "$FIRE_TICK" ]; then
  echo "[system-auditor] FATAL: FIRE_TICK empty at cycle-marker init (tier=${AUDIT_TIER}) — refusing to create a malformed .auditor-cycle-markers-.tmp file."
  call_tool(server="vn-market", tool="send_telegram", arguments={channel:"bug",
    message:"[system-auditor] FATAL empty FIRE_TICK tier=${AUDIT_TIER} — cycle aborted before marker init, check this tier's FIRE_TICK derivation"})
  EXIT
fi
MARKERS_FILE="$PROJECT_ROOT/docs/agent-memory/.auditor-cycle-markers-${FIRE_TICK}.tmp"
: > "$MARKERS_FILE"
```
Read Step 0d's AUDIT_TIER branches for tiers 1/2/3/5 first — all four already set `FIRE_TICK` unconditionally before this point, so this guard should be a permanent no-op for them. The `AUDIT_TIER=4` (D-FLEET) path is documented at the top of `main.md` as bypassing "§Step 0d tick-boundary election" with its "own one-off claim" — **verify whether that path (in `handlers.md` §Step D-FLEET, out of this task's file list) reaches this same shared `MARKERS_FILE` init line with `FIRE_TICK` never set.** This is the single most likely source of the observed `.auditor-cycle-markers-.tmp` (literally empty key) file. If confirmed, either give D-FLEET its own `FIRE_TICK`-equivalent before this point, or route it around this shared init block entirely — flagging as "verify, do not assume" per this task's own stated posture on AC-2/AC-3; do not claim this closed without checking `handlers.md` §D-FLEET.

**(b) Step 0b.1 sweep hardened to tolerate the already-observed malformed keys and to leave a real, checkable trace.** Today's sweep assumes every stale filename cleanly parses as `.auditor-cycle-markers-<clean-ISO-tick>.tmp`; live evidence shows 2 files keyed `auditor-t1:<tick>` (colon-bearing, breaks the documented "parsed directly from the filename" contract) and 1 keyed with an empty tick. Validate the shape before trusting it:
```bash
STALE_MARKERS=$(find "$PROJECT_ROOT/docs/agent-memory" -maxdepth 1 -name '.auditor-cycle-markers-*.tmp' -mmin +20 2>/dev/null)
SWEEP_COUNT=0; SWEEP_MALFORMED=0
for f in $STALE_MARKERS; do
  raw_tick="$(basename "$f" .tmp)"; raw_tick="${raw_tick#.auditor-cycle-markers-}"
  case "$raw_tick" in
    [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]Z) TICK="$raw_tick" ;;
    *) SWEEP_MALFORMED=$((SWEEP_MALFORMED+1)); TICK="malformed-key" ;;
  esac
  # emit-audit-signal.sh call UNCHANGED from today's Step 0b.1, using $TICK for fire_tick/dedup_key
  # (a "malformed-key" dedup_key still uniquely identifies "the malformed-key class was swept",
  # never re-colliding with a clean tick's own dedup_key) — on any non-ABORT outcome, rm -f "$f"; count it.
done
```
Buffer the outcome (`SWEEP_COUNT`/`SWEEP_MALFORMED`/total found) into a plain shell variable at Step 0b.1 time (this step runs BEFORE `$MARKERS_FILE` exists — Step 0d creates it), then, immediately after the `MARKERS_FILE` init in (a) above, append it:
```bash
echo "[stale-marker-sweep] swept=${SWEEP_COUNT} malformed=${SWEEP_MALFORMED} found=<total>" >> "$MARKERS_FILE"
```
This gives Step 0b.1 the same mechanical, checkable trace every other actuator in this file already has (a grep-able marker line) — closing the specific gap the board row names ("This sweep is NOT itself an entry in THIS cycle's own `$MARKERS_FILE`... its dead-ness is invisible because it is narrated"). It does not change `emit-audit-signal.sh`'s call shape or the dedup ledger.

## Sequencing

1. **AC-5 (data repair)** first, as its own single-purpose commit — independently revertible, touches no flow logic, and gets the file into a state that already trivially passes the Verification Gate's structural checks (1)/(2) even before the rewire lands.
2. **AC-1 + AC-2 + AC-3 + AC-4** together, as one commit (they are one coherent change to the same Notebook Write block — splitting them would leave an intermediate state where the flow calls a script the Bash allowlist doesn't authorize, exactly the "flow edit landed, permission grant missed" failure PO's critique warns about).
3. **AC-6** can land in the same commit as (2) or a follow-up commit — independent risk surface (housekeeping over `.tmp` scratch files, no verdict authority, per PO's own Lane-C-in-disguise adjudication field (5)).
4. Do not touch `scripts/notebook-compose.sh` at any point in this sequence.

## Verification Gate (mechanical, persistence-plane only — no agent RETURN text may substitute, per the board row's own instruction and PO Critique field (2)/(3))

After 3 consecutive real `system-auditor` cycles spanning at least one Tier-1/Tier-2 overlap window:

1. `grep -n '^## ' docs/agent-memory/notebooks/system-auditor.md` → headings strictly DESCENDING in `c<NNN>` top-to-bottom, strictly DESCENDING in timestamp top-to-bottom, exactly 3 in count, no non-cycle `## ` heading present.
2. `wc -l < docs/agent-memory/notebooks/system-auditor.md` ≤ 200.
3. `grep -c 'notebook-compose.sh' docs/agents/system-auditor/flow/main.md` > 0 — **necessary-not-sufficient precondition only** (PO Ruling 3). On its own this does not prove execution.
4. **Runtime-execution proof (replaces the old Signal 3 as the sufficient check):** `git log --oneline -5 -- docs/agent-memory/notebooks/system-auditor.md` shows at least one real commit whose message embeds a `[notebook-compose OK ...]`-shaped suffix — i.e. the script's own stdout marker landed inside a real, committed git-log entry, not merely inside a transient `$MARKERS_FILE` scratch file that gets `rm -f`'d at cycle end. (Implementer note: the simplest way to satisfy this is to append the compose script's own `OK`/`WARN` marker text as a bracketed suffix to the commit message string passed to `scripts/auditor-notebook-commit.sh` in the Commit step, e.g. `"chore(memory/system-auditor): notebook YYYY-MM-DD tier-N [notebook-compose OK sections=3 dropped=1 lines=187 bytes=9821 direction=newest_first]"` — this makes the proof permanent, `git log --grep`-able forever, and immune to the scratch-file's own cleanup, which a `$MARKERS_FILE`-only check would not be.)
5. `find docs/agent-memory -maxdepth 1 -name '.auditor-cycle-markers-*.tmp' -mmin +20 | wc -l` == 0, sampled one hour after the fix ships (per PO Critique field (3): pair this with confirming the AC-6(a) fail-loud guard actually exists in the diff — an `rm -f` of the directory without the guard is not evidence the reaper works, it is evidence someone deleted the symptom).

## Cross-reference (no scope merge, noted per this task's own instruction)

A separate, concurrent `agents-architect` investigation (`docs/architecture-briefs/2026-08-14-auditor-write-plane-divergence-root-cause.md`, tracking `SPIKE-AUDITOR-WRITE-PLANE-DIVERGENCE-ROOT-CAUSE`) fixes a different defect in `scripts/auditor-notebook-commit.sh`'s AC-4 pre-commit contract backstop (fabricated `[OUTPUT-CONTRACT]` lines never reaching the notebook because the commit now runs before that line is computed). Different root cause, different file, no dependency in either direction — both land as independent commits to `system-auditor`'s write path. Worth noting for whoever implements both: this brief's AC-1 rewire changes the exact bash block immediately preceding the **Commit** step call site that other brief's Step 2b addition also touches (same script, `scripts/auditor-notebook-commit.sh`, different section of it) — implement and land this brief's changes and that brief's changes as two separate commits in either order; neither brief's diff overlaps the other's edited lines, but re-read `main.md`'s current state before starting the second one to land, since the first one will have already shifted line numbers.

## Rollback

Every item is a documentation/flow edit plus one data-repair commit, each independently revertible on `main`. `git revert` the flow-rewire commit restores the current LLM-narrated compose path (known-broken, but no worse than today). The AC-5 data-repair commit is independently revertible and touches no other artifact. `scripts/notebook-compose.sh` is never modified by any part of this plan and needs no rollback consideration. If Verification Gate items 1–2 are not met within 7 days of the rewire landing, revert the flow commit and re-open the tracking row with the observed marker output attached — do not iterate on the wiring in place; a failure at that point would mean the script itself has a real gap (contrary to this brief's finding), not a wiring miss.
