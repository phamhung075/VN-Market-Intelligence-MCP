# FIX-COWORK-LAYERC-NO-IDENTITY-PREAMBLE — Shared identity preamble + artifact-delta writeback gate

**Written:** 2026-08-28T23:4xZ · **Author:** architect · **Row:** `task_board.backlog[]` FIX-COWORK-LAYERC-NO-IDENTITY-PREAMBLE (P1, M, design track)
**Zone:** multi (`scripts/agents-flow/` + `docs/agents/cowork-team/` + `docs/signals/`) · **BUILD-STANDARD:** not-applicable (bug-fix, in-zone, no new service primitives)
**Origin signal:** `docs/signals/cowork-layerc-no-identity-preamble-20260826T2010Z.md` (detector_defect 3f22ec35) · **PO ruling (this tick):** (1) compose the SAME identity preamble from ONE shared source; (2) gate TASK-COWORK-LAYERC-LASTFIRED-WRITEBACK on artifact-delta proof, NOT exit-0. (1) is a prerequisite for (2).

Design-only. No code changed this cycle. The developer implements; QA verifies after.

---

## 1. The defect, restated with the mechanism it opens

Layer C (`launchd com.vn-market.cowork-guaranteed-slot-firer`, `scripts/agents-flow/cowork-guaranteed-slot-firer.sh`) spawns `claude --dangerously-skip-permissions -p "$trigger_prompt"` **verbatim**. The measured fire (pid 70235, 2026-08-26 19:46:38→19:49:35Z) was exit-0 with **zero artifacts** (no synthesis JSON, no notebook section, no published marker): the spawned session latched onto the project-root CLAUDE.md router protocol and self-suppressed via its own ps-grep.

Two structural gaps, in order:

1. **No identity preamble.** The spawned session's ONLY guaranteed input is the prompt string. Layer B (spawn-fanout.md Step 5.2) prepends `IDENTITY_PREAMBLE` to suppress CLAUDE.md router-protocol inheritance; Layer C composes no preamble at all, so nothing stops the router latch on this plane.
2. **No delivery proof on the writeback path.** TASK-COWORK-LAYERC-LASTFIRED-WRITEBACK (ready, P1, developer) currently says "call `cowork-write-last-fired.js <slot_id>` after an exit-0 claude -p invocation". The measured fire was exit-0 and delivered nothing — building that row as specified would stamp `last_fired` on a null fire and manufacture exactly the false-delivery class the fleet already tracks.

## 2. Design decision 1 — ONE shared preamble source: `scripts/agents-flow/cowork-identity-preamble.sh`

**Decision:** move the `IDENTITY_PREAMBLE` text out of the spawn-fanout.md Step 5.2 inline block into **`scripts/agents-flow/cowork-identity-preamble.sh`** — a bash script that takes the agent name as `$1` and emits the preamble with the agent name substituted. BOTH planes consume this ONE file:

- **Layer B** (spawn-fanout.md Step 5.2): `IDENTITY_PREAMBLE = <output of: bash scripts/agents-flow/cowork-identity-preamble.sh <slot.agent>>`. The dispatcher demonstrably has bash at this step (Step 5.1 runs `uptime`/`sysctl`; cowork-tick-preflight.sh runs bash+jq+curl at the same dispatch step), so executing the script is within the file's own established mechanics.
- **Layer C** (firer `_fire_one_slot`): `PREAMBLE="$(bash "$ROOT/scripts/agents-flow/cowork-identity-preamble.sh" "$agent")"` where `$agent` is read off the matched slot JSON (the matcher already returns `agent` — verified `cowork-match-slots.js` legacy + adaptive output shapes).

**Why a script, not a data file:** the preamble has exactly one interpolated value (the agent name, appearing 3×: "You are X", "frontmatter name is not 'X'", "[X] IDENTITY_CHECK=FAIL"). A plain-text data file would push the substitution logic into two divergent consumers (LLM prose + bash sed) — the "second copy" the PO ruling forbids. One executable script = one place where text AND substitution live, and it is unit-testable. Precedent in-repo: `cowork-match-slots.js` is already the ONE shared matcher consumed by the dispatcher and the firer.

**Fidelity constraints (mandatory):**
- The emitted text MUST be **byte-identical** to the current inline block (spawn-fanout.md lines 247-261), agent name aside. The six `OFFFLOW_MARKERS` vocabulary lives inside this text and Step 5.3's marker-detection contract depends on it (see §4).
- Exit non-zero (e.g. `2`) on empty/missing `$1` — fail loud, never emit a preamble with an empty agent slot.
- Test seam: a new `scripts/agents-flow/cowork-identity-preamble.test.sh` (or an assertion block inside the existing firer test) asserts: output contains all six OFFFLOW_MARKERS, contains the agent name, and is byte-equal to the frozen Step-5.2 text with `<agent>` substituted.

## 3. Design decision 2 — Layer C composes the SAME ENTRY_PROMPT shape as Step 5.2

The firer must not merely prepend the preamble; it must compose the full `ENTRY_PROMPT` shape Step 5.2 produces, because the leaf flows **hard-require `owner_client_session`** for their Phase-2 published-marker claims (verified at source: `chef-dish.md:503-508`, `digest-predict/flow/daily-predict.md:123-128` "or fallback — REQUIRED", `fb-market-poster/flow/daily.md:812-816`, `tran-ngoc-bau` Phase-2 claim; `refine_bctc_md/flow/main.md:25-37` documents the exact `Coordination: owner_client_session=<value>` spawn-prompt contract). A preamble-only fire would reach Step 7, fail the claim on missing `owner_client_session`, log "publish blocked", and EXIT-0 with no artifact — **the same null-fire class, one step later**. So the session line is a hard prerequisite for the artifact-delta gate ever passing.

```
# inside _fire_one_slot(), before invoking claude:
PREAMBLE          = "$(bash "$ROOT/scripts/agents-flow/cowork-identity-preamble.sh" "$agent")"
SESSION_ID_LINE   = "\n\nCoordination: owner_client_session=cowork-layerc:<slot_id>:<fire_epoch>"
SCHEDULED_UTC_LINE= "\nscheduled_utc=" + slot.scheduled_utc_time     # omit entirely when null/empty (same rule as Step 5.2 — never emit "scheduled_utc=null")
ENTRY_PROMPT      = PREAMBLE + slot.trigger_prompt + SESSION_ID_LINE + SCHEDULED_UTC_LINE
```

- `slot.agent` and `slot.scheduled_utc_time` are already on the matcher's matched-slot objects (verified `cowork-match-slots.js:125-140` legacy map + `annotateScheduledUtc` CLI decoration, lines 178-200/505). No matcher change needed.
- **Synthetic session id — flag for PO awareness, deliberate:** `owner_client_session=cowork-layerc:<slot_id>:<fire_epoch>`. Layer C runs under launchd with NO coordination session of its own, and the leaf MUST have a non-empty value to claim its marker. This is a namespaced, deterministic identity FOR THE LAYER C PLANE — never a claim of being a real CLI session, never reused across fires (`<fire_epoch>` guarantees per-fire uniqueness). The marker claims are TTL-only by design (chef-dish.md:515 "NEVER call task_release on success... TTL is the sole expiry path"), so no ownership-confusion risk. The CARD.md "do not mint a fallback" rule governs the DISPATCHER's own claim/heartbeat/release calls; the firer makes NO MCP calls itself — it only hands the leaf a concrete literal, exactly the contract the leaf flows already document. Without this line, the whole fix is structurally unsatisfiable.
- **SCHEDULED_UTC_LINE** keeps the leaf's marker key anchored to the cron's NOMINAL fire instant (FIX-CHEF-MARKER-KEY-ANCHOR-3 contract), same as Layer B. Omit (not null) when the producer degrades.

**Test impact (firer.test.sh):** existing T3/T3b/T4/T5/T10/T11/T24 assert the fake `CLAUDE_BIN` is invoked with `trigger_prompt` — these keep passing (prompt now contains the trigger_prompt as a substring). NEW assertions needed: the recorded invocation STARTS with the preamble text (fake-claude records `$*`), contains `Coordination: owner_client_session=cowork-layerc:`, and contains `scheduled_utc=` when the canned slot JSON carries `scheduled_utc_time`.

## 4. Design decision 3 — spawn-fanout.md edits stay surgical (do not block the two P2 rows)

Only three regions of spawn-fanout.md change, all inside Step 5.2/5.3 — **disjoint from the two queued P2 rows** (FIX-COWORK-DISPATCH-AXISD-AGEBOUND-PERIODKEY touches Step 2.4 Axis D; FIX-COWORK-FANOUT-LOAD1MIN-COMMA-LOCALE-PARSE touches Step 5.1 LOAD_1MIN):

1. **Step 5.2 IDENTITY_PREAMBLE definition block (lines ~247-261):** replace the inline literal with the shared-script reference (§2). **MUST keep the ENTRY_PROMPT composition lines byte-similar** — `ENTRY_PROMPT = IDENTITY_PREAMBLE + slot.trigger_prompt + SESSION_ID_LINE (+ SCHEDULED_UTC_LINE)` and the legacy branch — because `scripts/agents-flow/cowork-spawn-entry-prompt-session-id.test.js` TC-1..TC-4 regexes match those exact lines (verified: TC-2/TC-3 match `ENTRY_PROMPT\s*=\s*IDENTITY_PREAMBLE\s*\+\s*slot\.trigger_prompt\s*\+\s*SESSION_ID_LINE` and the legacy form; they do NOT match the preamble literal, so the definition change is test-safe).
2. **Step 5.3 negative control (line ~523):** the "first 60 chars of IDENTITY_PREAMBLE" probe must reference the shared source — "first 60 chars of the output of `bash scripts/agents-flow/cowork-identity-preamble.sh <slot.agent>`". Semantics unchanged.
3. **Step 5.3 OFFFLOW_MARKERS provenance comment (lines ~501-513):** the sentence "THIS FILE: all six present, incl. inside IDENTITY_PREAMBLE above" must become "the shared preamble script (`scripts/agents-flow/cowork-identity-preamble.sh`)". Marker LIST unchanged (still 6, same strings). The "re-grep, don't quote" warning stays.
4. Plus the header size-justification changelog entry (+1 line).

Add a `+1` line in the Step 5.2 comment block pointing to the shared script so a future editor edits the script, never a second copy.

## 5. Design decision 4 — artifact-delta gate (PO ruling 2) shape for the writeback

**Contract change:** TASK-COWORK-LAYERC-LASTFIRED-WRITEBACK's spec is amended — `cowork-write-last-fired.js <slot_id>` is called **ONLY on artifact-delta proof, never on exit-0 alone**.

**Proof definition (filesystem-only — the firer has NO gateway/MCP access, verified in its header INVARIANTS):**

```
FIRE_START_EPOCH = date +%s      # captured BEFORE the claude invocation
NOTEBOOK = docs/agent-memory/notebooks/<slot.agent>.md
ARTIFACT_DELTA = [ -f "$NOTEBOOK" ] && [ "$(stat -f %m "$NOTEBOOK")" -gt "$FIRE_START_EPOCH" ]
```

- **Why the notebook:** every guaranteed-slot flow writes its agent notebook as a settled terminal step (chef Step 8b via notebook-write skill; digest-predict P-6; fb-market-poster STEP 8; tran-ngoc-bau notebook). The signal's own control case measured "notebook section" as one of the three artifacts, and the null fire produced none. The notebook path is derivable from `slot.agent` alone — no per-agent hardcoded artifact table (respects the firer's "never hardcode per-agent" invariant).
- **Why NOT the marker-claim leg of the signal's "marker claimed, or notebook/synthesis mtime advanced":** the published-marker claim lives in the MCP coordination store; the firer cannot query `task_list_held`. The notebook-mtime leg is the implementable, load-bearing proxy: a genuine publish always writes the notebook at Step 8b; a null fire writes nothing.
- **macOS stat:** production host is macOS (launchd plist; `stat -f %m` BSD form). The firer already carries macOS-specific assumptions (no `timeout` binary — `_bounded_exec` fallback). Use `stat -f %m`; the test harness fakes mtimes via `touch -t`.

**Gate semantics in `_fire_one_slot` (replaces the current unconditional exit-code return):**

```
( invoke claude -p with ENTRY_PROMPT, bounded ) ; rc=$?
if ARTIFACT_DELTA:
  node scripts/agents-flow/cowork-write-last-fired.js "$slot_id"     # PROOF → stamp (monotonic, forward-only; sibling-fresher-stamp guard makes a peer double-write safe by construction — writeback row's own note)
else:
  # no notebook delta — discriminate the two exit-0 shapes by re-reading the schedule
  POST_FIRE_LAST_FIRED = jq -r --arg s "$slot_id" '.slots[] | select(.slot_id == $s) | .last_fired' docs/data/cowork-schedule.json
  if rc == 0 AND ( PRE_FIRE_LAST_FIRED is null OR POST_FIRE_LAST_FIRED == PRE_FIRE_LAST_FIRED ):
    # exit-0 null fire on THIS plane (or peer-blocked with NO peer stamp) — the measured defect class
    log_err "NULL-FIRE: slot=$slot_id exit=$rc NO notebook delta — NOT stamping last_fired"
    _escalate_failure "nullfire:$slot_id" "..."      # bounded by existing ALERT_COOLDOWN_SECONDS + content fingerprint; one alert per slot per episode
  else:
    # peer stamped meanwhile (redundant dual-plane fire) — peer's stamp stands; nothing to write, nothing to alert
    log "peer-stamped or non-zero: slot=$slot_id exit=$rc no delta — leaving last_fired to the peer"
```

**Why the peer-discrimination is needed:** the firer fires REDUNDANTLY alongside a live Layer B every tick (documented in its own header — "this firer fires alongside a live cowork dispatcher"). When Layer B published the same slot this window, the Layer C leaf EXITs "duplicate-publish blocked" with no notebook delta — a NORMAL outcome, not a failure. Escalating every no-delta exit-0 would spam the BUG channel every tick. The re-read discriminates: if a peer stamped (last_fired advanced vs. the pre-fire value captured from the matched slot object at fire time), it is the redundant case — silent. Only a genuinely un-stamped, artifact-less exit-0 is a NULL-FIRE worth one cooldown-bounded BUG alert. `PRE_FIRE_LAST_FIRED` comes from the matched slot object the firer already holds (matcher returns `last_fired`).

**Interaction with the existing failure escalation:** unchanged — non-zero outcomes still escalate via the existing `_escalate_failure` path (fingerprint `slots:<failed_list>`). The new `nullfire:<slot_id>` fingerprint is additive, same cooldown machinery.

**Test additions (firer.test.sh):**
- T26: fake claude writes a fake notebook with mtime > fire start → `cowork-write-last-fired.js` invoked (record via a stubbed `WRITE_LAST_FIRED_CMD` seam — add an env override mirroring `SLOT_MATCHER_CMD`/`CLAUDE_BIN`; default `node "$ROOT/scripts/agents-flow/cowork-write-last-fired.js"`).
- T27: exit-0, no notebook delta, no peer stamp → writeback NOT invoked + exactly ONE nullfire escalation POST naming the slot.
- T28: exit-0, no notebook delta, but peer stamp advanced past pre-fire value → writeback NOT invoked, NO escalation.
- T29: preamble present in the recorded claude invocation (the composed ENTRY_PROMPT shape from §3).

## 6. Files touched / created (implementer checklist)

| File | Change |
|---|---|
| `scripts/agents-flow/cowork-identity-preamble.sh` | **NEW** — the one shared preamble source (§2) |
| `scripts/agents-flow/cowork-identity-preamble.test.sh` | **NEW** — byte-fidelity + marker-vocabulary + agent-substitution tests (§2) |
| `scripts/agents-flow/cowork-guaranteed-slot-firer.sh` | `_fire_one_slot`: compose ENTRY_PROMPT (§3); artifact-delta gate + writeback call + nullfire discrimination (§5); `WRITE_LAST_FIRED_CMD` env seam |
| `scripts/agents-flow/cowork-guaranteed-slot-firer.test.sh` | New T26-T29; existing T3-T24 assertions re-checked (prompt substring semantics hold) |
| `docs/agents/cowork-team/flow/spawn-fanout.md` | §4 surgical edits only (Step 5.2 definition + Step 5.3 negative control/provenance + header) |
| `docs/signals/cowork-layerc-no-identity-preamble-20260826T2010Z.md` | signal remains in place until the fix lands; drain moves it to processed/ after QA |
| `docs/data/orch/orch-state.json` | THIS row: architect fields + lane-move to review (below); writeback row: note amended to the artifact-delta gate contract |

**Sequencing (must not interleave):** (1) preamble script + firer ENTRY_PROMPT composition + gate land FIRST (this row → developer); (2) the writeback row (TASK-COWORK-LAYERC-LASTFIRED-WRITEBACK) implements the writeback call behind the gate — it is the SAME gate this design specifies, so the row's spec is amended rather than re-designed; (3) the two P2 spawn-fanout rows land after this row's surgical edits (their regions are disjoint — no textual conflict expected, but they must not land before this row's Step 5.2/5.3 edits commit, since both files share the same commit pathspec).

## 7. Risk flags

- **R1 (medium):** synthetic `owner_client_session` is an interpretation beyond the literal PO wording ("same identity preamble"). Flagged in §3 for PO awareness; mitigations: namespaced + per-fire-unique + TTL-only marker usage. If PO objects, the alternative is emitting NO session line — which structurally makes Layer C unable to publish (worse than today's preamble gap, since the fire would then fail one step later and the gate would correctly refuse to stamp — but the firer would still never deliver). This design does not accept that alternative.
- **R2 (low):** notebook mtime is a terminal-write proxy. A flow that publishes but dies between Step 7.6 synthesis and Step 8b notebook write would show NO delta → no stamp → slot stays due → re-fires next tick. That is the documented under-suppress posture (last-fired.md AC-P1-7-3) — conservative and recoverable, never a false stamp.
- **R3 (low):** `stat -f %m` is BSD-only. The production host is macOS (firer already macOS-specific); the test host must be macOS or the test must use `touch -t` on the same host that runs `stat -f %m`.
- **R4 (informational):** the queued P2 rows and the writeback row share `docs/agents/cowork-team/flow/spawn-fanout.md` and `scripts/agents-flow/cowork-guaranteed-slot-firer.sh` pathspecs. Lane sequencing above prevents interleaving; the brief records the exact edit regions so no half-designed state is left behind.

## 8. RETURN

```
DONE: Design complete — shared preamble source (cowork-identity-preamble.sh) + Layer C ENTRY_PROMPT
      composition + artifact-delta writeback gate shape (notebook-mtime proof, peer-stamp discrimination).
ZONE: multi (scripts/agents-flow/ + docs/agents/cowork-team/ + docs/signals/)
NEXT: developer — implement per §6; writeback row (TASK-COWORK-LAYERC-LASTFIRED-WRITEBACK) builds
      its writeback call behind the SAME gate; QA verifies after.
HANDOFF: docs/architecture-briefs/2026-08-28-fix-cowork-layerc-no-identity-preamble.md
PIPELINE: continue
```
