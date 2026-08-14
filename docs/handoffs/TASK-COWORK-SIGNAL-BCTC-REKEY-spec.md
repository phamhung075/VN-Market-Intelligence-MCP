# bctc-analyst Filename Rekey & Sequencing (FR-2, FR-7) — Implementation Spec

**Task ID:** TASK-COWORK-SIGNAL-BCTC-REKEY (P1, size M, zone `cross-service/bctc-analyst`, plan_only,
supervised)
**Parent:** FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING (Phase 1, task 2 of 4)
**Sprint:** COWORK-RELIABILITY · **Agent:** developer · **Date:** 2026-08-08
**Status:** SPEC ONLY — `plan_only:true` + `supervised:true` inherited from parent, preserved. **No code
ships from this document.** This is a handoff artifact for a future *unsupervised* developer dispatch to
implement verbatim, after PO re-adjudicates the parent row per its own stated policy
(`supervised_note`: "Child task of plan_only parent; no code ships without parent re-adjudication by PO").

**Inputs read at source before writing this spec** (all live-verified this cycle, not paraphrased):
- `docs/data/orch/orch-state.json` → `TASK-COWORK-SIGNAL-BCTC-REKEY` (full row) and the parent row
  `FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING` (full decision history: BA spec, architect brief, PO's
  `po_architect_signoff_20260807T0545` with 3 binding amendments — Amendment 3 affects task 1's
  `derive_window_key()` branch-2 internals, not this task's filename-template scope; Amendment 1 descopes
  FR-4/tnb entirely, not touched by this task either way).
- `docs/architecture-briefs/2026-08-07-cowork-signal-filename-cycleid-keying.md` §3 (FR-2 + FR-7,
  lines 90-148, all four subsections) — primary scope source — plus §8 (Design decisions summary,
  lines 321-346) and §9 (AC mapping, lines 349-358).
- `docs/handoffs/TASK-COWORK-SIGNAL-DERIVE-WINDOWKEY-spec.md` (delivered ~20 min prior this session,
  committed `df0a91c60`) — the authoritative shared-function contract for `derive_window_key()` this
  spec consumes without redefining (§1 below cites it, does not restate the algorithm).
- Live source files, re-read this cycle, not from the brief's paraphrase: `docs/agents/bctc-analyst/
  flow/cycle.md` (Step 0c, lines 52-89), `stage-analyze.md` (Step 4c lines 61-82, R4/release-mode emit
  line 114), `stage-consolidate.md` (`## Output` section, lines 61-66), `stage-log-notify.md` (§5d-1,
  lines 38-48).
- `docs/handoffs/TASK-COWORK-SIGNAL-BCTC-REKEY.md` — confirmed absent from disk (failed `Read`, same
  dangling-pointer situation the row's own `ba_handoff` field claims as task 1's spec noted; see §6.

---

## 1. Dependency — `derive_window_key()`

This task does **not** define or re-derive the WINDOW_KEY algorithm. It is a pure domain-layer function
already fully specified in `docs/handoffs/TASK-COWORK-SIGNAL-DERIVE-WINDOWKEY-spec.md` (task 1/4 of this
same decomposition). The only facts this spec needs from that document:

- **Signature:** `derive_window_key(prompt_text, slot_id, cowork_schedule_json, live_mcp_fetched_at) ->
  string`.
- **Return format:** `YYYYMMDDTHHMMZ` (UTC, no seconds field) — e.g. `20260807T2100Z`.
- **Consumer contract (NFR-3, restated from that spec's §7, binding on this task):** every consumer of
  `WINDOW_KEY` within one bctc-analyst cycle — the filename (§3 below) AND the `published:` mutex key
  (§4 below) — calls `derive_window_key()` **exactly once** per cycle and reuses the stored session-state
  result; nothing downstream re-derives it independently, and nothing substitutes the raw, run-start-keyed
  `cycle_id` for it.

Do not implement, redefine, or paraphrase the 3-branch pseudocode here. Cite the file.

---

## 2. Sequencing fix — pin `WINDOW_KEY` at Step 0c

**File:** `docs/agents/bctc-analyst/flow/cycle.md`

**Live-verified anchor (this cycle):** `## Step 0c — Calendar Gate + Mode Selection (MANDATORY, runs
every cycle)` at line 52. Its own header text already states "Run AFTER stage-bootstrap.md (regime
variables set) and BEFORE stage-analyze.md" (line 54) — this is exactly the ordering FR-2 needs
(`WINDOW_KEY` must exist in session state before Stages 1-4 write the signal file). **No new step,
no reordering** — add one derivation line inside the existing Step 0c body.

**Exact edit:** immediately after the existing `Set session variable CYCLE_MODE:` block (cycle.md
lines 86-89, the `release`/`routine`/`mixed` enumeration), add:

```
Derive and pin `WINDOW_KEY` for the remainder of this cycle:
  WINDOW_KEY = derive_window_key(prompt_text, slot_id, cowork_schedule_json, live_mcp_fetched_at)
    — see docs/handoffs/TASK-COWORK-SIGNAL-DERIVE-WINDOWKEY-spec.md for the full function contract.
Store as a session variable. Every downstream reference to WINDOW_KEY in this cycle (stage-analyze.md
filename, stage-log-notify.md §5d-1 mutex key) reuses this SAME value — do not recompute.
```

This is purely additive (one derivation line + one session-variable pin) — it does not alter Step 0c's
existing `RELEASE_TICKERS`/`ROUTINE_TICKERS`/`CYCLE_MODE` logic, sequencing rule, or the
reprocess-vs-new-filing guard already present in the same step.

---

## 3. Filename rekey (FR-2 core)

**Files:** `docs/agents/bctc-analyst/flow/stage-analyze.md` (both modes), cosmetic pattern update in
`stage-consolidate.md` (§5 below — that file performs no disk write itself).

**Template change:**

```
docs/signals/bctc_signal_{TICKER}_{YYYYMMDD}_{mode}.json
  → docs/signals/bctc_signal_{TICKER}_{WINDOW_KEY}_{mode}.json
```

**Worked example (from the architecture brief §3.2, cited verbatim, not re-derived):**
`bctc_signal_HPG_20260807T2100Z_routine.json` (slot-3, 21:00 UTC fallback path — this is also the exact
concrete case task 1's spec's Test Case 2 independently re-derives via `derive_window_key()`'s branch 2,
confirming the two specs agree on the same worked instance).

### 3.1 Release mode (existing emit line, pattern substitution only)

**Live-verified anchor:** `stage-analyze.md` line 114 —
`` Emit signal file: `docs/signals/bctc_signal_{TICKER}_{YYYYMMDD}_release.json` including all
business-context fields. `` — inside the `## Release Mode` section's `R4. Signal + ledger` block.

**Exact edit:** replace `{YYYYMMDD}` with `{WINDOW_KEY}` in this line only. No other text on the line
changes (the "including all business-context fields" clause is untouched).

### 3.2 Routine mode (FR-7 — new explicit emit line)

**Live-verified gap (confirmed this cycle):** `stage-analyze.md`'s `## Routine Mode (all watchlist
tickers)` section (lines 6-82) runs Steps 1 through 4c (`4c. Evidence Fragment Recording`, lines 61-80)
and then hits the section-closing `---` at line 82 immediately followed by `## Release Mode` at line 84
— **no emit-line instruction of any kind exists in the routine-mode section.** The routine-mode file
that collides 4x/day (once per bctc cron slot) is written today under an undocumented convention,
confirming the brief's own §3.3 claim.

**Exact edit:** at the end of Step 4c (`4c. Evidence Fragment Recording`), after its existing final
sentence (`docs/agents/bctc-analyst/flow/stage-analyze.md` line 80: "`bctc_revenue_growth` /
`bctc_pe_ratio` / `bctc_debt_equity` were NEVER seeded (tool-docstring examples only) — do NOT use
them."), insert a new line, still inside Step 4c and still before the section-closing `---` (line 82):

```
Emit signal file: docs/signals/bctc_signal_{TICKER}_{WINDOW_KEY}_routine.json
```

This is the literal line the architecture brief §3.3 specifies, placed at the exact insertion point the
brief names ("end of Step 4c ... immediately before the `---`/`## Release Mode` header"). No other line
in Step 4c or elsewhere in the Routine Mode section changes.

---

## 4. Stage-5 mutex key — rename the variable reference (no logic change)

**File:** `docs/agents/bctc-analyst/flow/stage-log-notify.md`

**Live-verified anchor:** §5d-1 ("Published-marker guard (dedup vs peer double-post of the same slot's
WORK telegram)", lines 38-48):

```
task_claim(task_id="published:bctc-analyst-<slot_id>:<cycle_tick_ISO>", task_kind="sprint-task",
  owner_agent="bctc-analyst", owner_client_session=$CLAUDE_CODE_SESSION_ID, ttl_seconds=3600)
```

with the accompanying prose (line 43): "`<cycle_tick_ISO>` MUST be the NOMINAL slot fire time from the
cron schedule (`0 15,18,21,0 * * *` → round DOWN to `HH:00Z`), never the agent's own observed bootstrap
timestamp."

**Exact edit:** rename the `<cycle_tick_ISO>` token in the `task_claim` call to `<WINDOW_KEY>` — i.e.
`task_id="published:bctc-analyst-<slot_id>:<WINDOW_KEY>"` — and replace the explanatory sentence's
description of how the value is computed with a pointer to the Step-0c pin instead of a second,
independent computation:

```
`<WINDOW_KEY>` is the SAME value pinned once at cycle.md Step 0c (§2 of this spec /
docs/handoffs/TASK-COWORK-SIGNAL-DERIVE-WINDOWKEY-spec.md) — reused here, not recomputed. Historically
this guard independently re-derived a `cycle_tick_ISO` via "round DOWN to HH:00Z" on the observed
bootstrap timestamp; that second computation is retired in favor of the single Step-0c-pinned value,
per NFR-3 (single source of truth) — same semantic value (nominal slot fire time, HH:00Z granularity),
same format, sourced once instead of twice.
```

**No change to the guard's own claim/skip logic** — `claimed:true` still proceeds to 5e (WORK telegram),
`claimed:false` still skips 5e and logs the peer-held message. The existing 2026-07-30 slot-3
double-dispatch rationale paragraph (why the value must be the nominal slot time, not the observed
bootstrap tick) is retained; only the token name and its "how it's computed" clause change.

---

## 5. Doc-debt fold-in — stale cross-reference correction (zero extra scope)

**File:** `docs/agents/bctc-analyst/flow/stage-consolidate.md`

**Live-verified anchor:** the `## Output` section (lines 61-66):

```
## Output

Session state variables: `trick_summary`, `trick_confidence`, `trick_pass_versions`
These are merged into the `bctc_signal_{TICKER}_{YYYYMMDD}_{mode}.json` signal file
in `stage-log-notify.md` step 5 (after this consolidation completes).

No disk writes in this stage — all output goes to session state only.
```

**Confirmed stale/incorrect (re-verified this cycle, not from the brief's prose alone):**
`stage-log-notify.md` Stage 5 is Notebook + Notify + Deadline (5a-5e, no `bctc_signal` write instruction
anywhere in that file — re-read live, confirmed absent). The actual emit line lives in
`stage-analyze.md`: R4 for release mode (§3.1 above), the new FR-7 line for routine mode (§3.2 above).

**Exact edit:** replace the two-line claim with a corrected cross-reference plus the same cosmetic
filename-pattern substitution as §3 (this stage performs no disk write itself — the pattern reference
here is documentation only):

```
## Output

Session state variables: `trick_summary`, `trick_confidence`, `trick_pass_versions`
These are merged into the `bctc_signal_{TICKER}_{WINDOW_KEY}_{mode}.json` signal file in
`stage-analyze.md` (R4 for release mode, the routine-mode Step 4c emit line for routine mode) — NOT in
`stage-log-notify.md`, which contains no `bctc_signal` write instruction.

No disk writes in this stage — all output goes to session state only.
```

An implementer following the pre-existing (wrong) pointer would land the merge logic in the wrong file;
this correction removes that hazard. No logic change — `stage-consolidate.md` still performs zero disk
writes.

---

## 6. Files summary table (per architecture brief §3.5)

| File | Change |
|---|---|
| `docs/agents/bctc-analyst/flow/cycle.md` | Step 0c: add `WINDOW_KEY` derivation line (§2) |
| `docs/agents/bctc-analyst/flow/stage-analyze.md` | Line 114 filename pattern update (release, §3.1) + new explicit routine-mode `Emit signal file:` line at end of Step 4c (FR-7, §3.2) |
| `docs/agents/bctc-analyst/flow/stage-consolidate.md` | Line 64 cross-reference correction (§5) + filename pattern update (cosmetic, no logic — this stage performs no disk write) |
| `docs/agents/bctc-analyst/flow/stage-log-notify.md` | §5d-1: rename `cycle_tick_ISO` reference to the Step-0c-pinned `WINDOW_KEY` (§4); no change to the guard's claim/skip logic |

**None of these 4 files were edited by this task** — this table specifies the edits for a future
unsupervised developer dispatch, per the plan_only constraint (§8).

---

## 7. Test strategy (per architecture brief §8, developer-handoff section)

- **Unit-level:** `derive_window_key()`'s 3 branches are already fully specified and test-cased in
  task 1's spec (`TASK-COWORK-SIGNAL-DERIVE-WINDOWKEY-spec.md` §4, both PO-mandated cases worked
  through). Not re-specified here — this task consumes that function, it does not test it.
- **Integration (AC-1):** two same-day bctc-analyst slots (e.g. slot-1 15:00Z, slot-2 18:00Z) must
  resolve to two DISTINCT `bctc_signal_HPG_*` paths on disk. Concretely: fire the cycle twice with
  `live_mcp_fetched_at` values inside two different slot windows on the same UTC calendar date, assert
  `docs/signals/bctc_signal_{TICKER}_{WINDOW_KEY_1}_{mode}.json` and
  `...{WINDOW_KEY_2}_{mode}.json` are both present and distinct paths (not one overwriting the other).
  A manual re-run of the SAME slot within the same fallback hour resolving to the SAME path is the
  accepted EC-1 collision — the `published:` mutex (§4) is what protects against a double WORK-telegram
  post in that case, not filename uniqueness (per NFR-5, restated from the brief).
- **Regression (NFR-4):** `drain-signals.test.js`'s existing fingerprint-neutrality assertions must
  still pass unmodified against a WINDOW_KEY-keyed filename. This is expected to be a genuine no-op —
  `scripts/agents-flow/drain-signals.js` computes its fingerprint as
  `sha256(from + type + payload + createdAt)`; the basename appears only in `dest` and the
  `source_filename` DB column, never in the hash itself (confirmed at source by PO's own
  `po_goahead_20260807T044131` re-verification on the parent row, and re-affirmed by the architecture
  brief §7's "no code change" disposition for `drain-signals.js`) — so a filename rekey is
  fingerprint-neutral by construction. The regression test's job is to prove this holds in practice
  against the actual new filename shape, not to re-derive the no-op claim.

---

## 8. Non-goals (plan_only reminder)

- No file inside `docs/agents/bctc-analyst/flow/` was edited by this task — §2 through §5 above are
  edit *specifications* for a future unsupervised developer dispatch, the same posture task 1's spec
  took for the shared function itself.
- No file inside `docs/agents/unified-agent/flow/` or `docs/agents/tran-ngoc-bau/flow/` was touched —
  those are `TASK-COWORK-SIGNAL-CHEF-INTRADAY` (task 3) and out of this decomposition's FR-4-descoped
  tnb scope (Amendment 1) respectively. Neither was attempted.
- `TASK-COWORK-SIGNAL-NAMING-CONTRACT` (task 4, `docs/standards/mcp-tools.md` Naming Contract
  subsection) is not attempted here.
- No shared pure-function file (`derive_window_key()`) is created, redefined, or edited by this task —
  it is cited from task 1's already-delivered spec, per §1 above.

---

## 9. AC mapping (per architecture brief §9, carried forward not redesigned)

| Board AC | Satisfied by (this task's scope) |
|---|---|
| AC-1 (two same-day cycles never share a path) | §3 (bctc filename rekey, both modes) |
| AC-2 (between-drains double-write can't silently destroy an unrouted signal) | §3 + §7 Regression — the drain inherits path-uniqueness automatically once §3 ships; no drain-reader change needed (confirmed NO-OP, AC-3) |

AC-3 (drain-reader change, if any, preserves routing) is satisfied by the confirmed NO-OP disposition
(§7 Regression) — no drain-reader file is in this task's own change set. AC-4/tnb-c112 is
`TASK-COWORK-SIGNAL-CHEF-INTRADAY` (task 3) scope, not this task's.

---

## 10. Note on the dangling `ba_handoff` pointer

The row's own `ba_handoff` field (`docs/handoffs/TASK-COWORK-SIGNAL-BCTC-REKEY.md`) does not exist on
disk — confirmed by an actual failed `Read` this cycle, not inferred. This is the same
dangling-pointer situation task 1's spec noted for its own row (`TASK-COWORK-SIGNAL-DERIVE-WINDOWKEY`):
the parent row's PM-decomposition step minted 4 board rows but did not also mint 4 corresponding
per-task handoff stub files, leaving each child row's `ba_handoff` field pointing at a path that only
this spec document (once written) fills — this document is now that pointer's real target in substance
(not filename), consistent with the parent row's own `ba_handoff` field, which correctly points at
`docs/handoffs/FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING-BA-spec.md`, a file that does exist. Not
treated as a blocker, per the same precedent.

---

## Decision Journal
See `docs/agent-memory/decisions/sprint-COWORK-RELIABILITY-developer.md`, task_id
`TASK-COWORK-SIGNAL-BCTC-REKEY`.

## RETURN
```
DONE: Spec complete for bctc-analyst FR-2 (filename rekey) + FR-7 (routine-mode explicit emit line) +
      sequencing fix (WINDOW_KEY pinned once at cycle.md Step 0c, reused at stage-analyze.md +
      stage-log-notify.md §5d-1) + doc-debt fold-in (stage-consolidate.md stale cross-reference
      corrected). derive_window_key() cited from task 1's already-delivered spec, not redefined. All 4
      files' exact edits specified with live-verified line anchors; none edited by this task.
      plan_only+supervised preserved — no code shipped, no writer files touched.
ZONE: cross-service/bctc-analyst
NEXT: po | review spec (this row moves to review[], next_agent=po per dispatch instruction)
HANDOFF: docs/handoffs/TASK-COWORK-SIGNAL-BCTC-REKEY-spec.md
PIPELINE: hold — supervised row, no auto-continue; tasks 3/4 remain separate dispatches
```

---

## 11. PO Adjudication — 2026-08-14T17:34Z (appended by po, sign-off)

**VERDICT: ACCEPTED — `DONE_VERIFIED`, with ONE binding amendment (Amendment 5, below).**
Same disposition shape as this row's sibling task 1 received at its §9 and as the parent received at
`po_architect_signoff_20260807T0545`: approved in place with an acceptance-bearing amendment, **not**
returned for rework. The deliverable — the 4-file edit set, both mode branches, the mutex-key rename, and
the stale-cross-reference correction — is verified correct at source and is not being changed.

### 11.1 What PO re-verified at source this tick (not read from this document's prose)

| Claim in this spec | Verified how | Result |
|---|---|---|
| §3.1 release emit line at `stage-analyze.md:114` with `{YYYYMMDD}_release.json` | `grep -n` live | CONFIRMED, line number still exact |
| §3.2 routine mode has NO emit line anywhere (FR-7 gap is real) | full read of `## Routine Mode` (lines 6-82) | CONFIRMED absent; Step 4c @61, final sentence @80, `---` @82, `## Release Mode` @84 — all four anchors exact |
| §4 `stage-log-notify.md` §5d-1 carries `<cycle_tick_ISO>` + the "NOMINAL slot fire time" prose at line 43 | live read | CONFIRMED, prose line 43 exact |
| §5 `stage-consolidate.md:64` cross-reference to `stage-log-notify.md` step 5 is stale | `grep -n 'bctc_signal' docs/agents/bctc-analyst/flow/*.md` → **zero** hits in `stage-log-notify.md` | CONFIRMED stale; the correction is right |
| §7 NFR-4 fingerprint no-op | `scripts/agents-flow/drain-signals.js:251-252` read at source: `sha256(String(from)+String(type)+payload+String(createdAt))` | CONFIRMED — basename genuinely absent from the hash; rekey is fingerprint-neutral by construction |
| Not superseded during the 6-day review idle | `grep -rn 'WINDOW_KEY\|derive_window_key' docs/agents/bctc-analyst/` → **no matches** | CONFIRMED — nothing shipped; spec is still live work |
| Compatibility with task 1's Amendment 4 (landed 2026-08-14T14:58Z, *after* this spec was written) | task 1 spec §9.2 read in full | **COMPATIBLE** — see 11.2 |

### 11.2 Amendment 4 compatibility — checked, and it *strengthens* this spec

Task 1 was signed off yesterday with Amendment 4, whose part (a) strikes task 1 §7's "single, shared
dependency of both sibling tasks" over-claim and rules that **`TASK-COWORK-SIGNAL-BCTC-REKEY` is the sole
real consumer** of `derive_window_key()` (task 3 uses `VN_HOUR`; task 3's spec line 13 was correct).
This *upholds* §1 of this document — this task's consumption of the function is the genuine one — and the
`YYYYMMDDTHHMMZ` (no `SS`) format §1 cites was explicitly upheld at task 1 §9.1.
Amendment 4(b)'s new branch-2 fail-loud domain guard (`^([01]?[0-9]|2[0-3])$` on the cron hour field) is
**inert for this consumer**: all four bctc slots are bare-integer once-daily crons (`0 15/18/21/0 * * *`,
re-verified live in `docs/data/cowork-schedule.json` this tick), so the guard never trips here. No
behavioural change to anything specified in §2-§5. Amendment 3 is likewise confined to branch-2 internals,
as §1 of this document already correctly states.

### 11.3 Amendment 5 — BINDING, acceptance-bearing, on the future unsupervised implementer

**(a) THE CALL'S FOUR ARGUMENTS ARE UNBOUND AT THE ONLY CALL SITE IN THE DECOMPOSITION. — the one
acceptance-bearing gap.**

Task 1 §1 declares all four inputs are supplied *by the caller* from session state ("already-loaded",
"already in session state (no re-fetch, no wall-clock read)"). Amendment 4(a) then establishes that this
task is the **sole** consumer. Therefore §2 of this document is the *only* place in the entire 4-task
decomposition where those four parameters ever bind to real values — and it binds none of them. Verified
live across all of `docs/agents/bctc-analyst/flow/` this tick:

| Argument | Occurrences in `docs/agents/bctc-analyst/flow/` |
|---|---|
| `prompt_text` | **0** |
| `slot_id` | **1** — and it is itself an undefined placeholder (`<slot_id>` at `stage-log-notify.md:40`) |
| `cowork_schedule_json` | **0** — no step anywhere loads `docs/data/cowork-schedule.json` |
| `live_mcp_fetched_at` | **0** |

`stage-bootstrap.md` is 6 lines and delegates to `.claude/skills/step-0-cowork/SKILL.md` §0b-0c, whose
declared `## Outputs` are `$AGENT_NOTEBOOK`, `$CYCLE_SNAPSHOT`/`$MARKET_CONTEXT`+`$MACRO_SNAPSHOT`,
`$REGIME`, `$CARRY_REGIME` — **none of the four**. Nothing upstream of Step 0c supplies them.

**Why this is acceptance-bearing and not a nit:** an implementer following §2 verbatim writes the call line
and every argument is undefined. Branch 2 cannot resolve a slot record, `WINDOW_KEY` comes back empty or
garbage, and the filename template in §3 collapses to a *constant* across all four daily slots — silently
re-shipping the exact intra-day collision this parent row exists to close. That is Amendment 4(b)'s
"plausible-looking wrong key" failure mode arriving through the **caller** instead of the parse, and
Amendment 4(b)'s guard does not catch it.

**Required — §2 must bind all four before the `derive_window_key()` line, using material already verified:**
- `prompt_text` — the agent's own invocation prompt. Live-verified this tick, all 4 bctc slots'
  `trigger_prompt` in `docs/data/cowork-schedule.json` read exactly:
  `run docs/agents/bctc-analyst/flow/main.md  slot=bctc-analyst-slot-N`.
- `slot_id` — parsed from the `slot=` token of that prompt (`bctc-analyst-slot-1..4`). **Do NOT** adopt PM
  stub `TASK-002-bctc-analyst-rekey.md` AC-2's claim that slot_id is "already known at this step (Calendar
  Gate already determined it)" — that is **false at source**: `cycle.md` Step 0c determines
  `RELEASE_TICKERS`/`ROUTINE_TICKERS`/`CYCLE_MODE` and never a slot id.
- `cowork_schedule_json` — an explicit read of `docs/data/cowork-schedule.json`, added as its own line.
- `live_mcp_fetched_at` — **the genuine residual.** It exists nowhere in this agent's flow *or* in
  step-0-cowork's outputs, so the implementer must bind it to a named, already-fetched MCP payload
  timestamp from Step 0b's bootstrap result. It MUST NOT be satisfied by a wall-clock read: task 1 §1
  forbids it, and bctc-analyst is a Bash-less agent class — it cannot shell out to `date` at all. This is
  the one sub-item that may need a bootstrap-side addition rather than a pure `cycle.md` edit; if Step 0b's
  payload carries no usable fetch timestamp, that is a real dependency to raise before implementing, not to
  paper over.
- Carry PM stub Implementation Note 2 (**NFR-2 no-Bash**) into §2 verbatim — this document omits it entirely
  and it is load-bearing for precisely this agent.

**(b) §10's factual claim is wrong and must be struck.** §10 states the PM decomposition "minted 4 board
rows but did not also mint 4 corresponding per-task handoff stub files". **False** — all four exist and are
dated 2026-08-07 07:59: `docs/handoffs/TASK-001-derive-windowkey.md`, `TASK-002-bctc-analyst-rekey.md`
(8926 bytes, this task's own), `TASK-003-chef-intraday-filename.md`, `TASK-004-naming-contract.md`. The row's
`ba_handoff` field points at a *wrong filename*, not at a missing artifact. Consequence, not merely
cosmetic: this 305-line spec was authored without reading PM's own acceptance handoff for the same task,
and that stub carries both items this document lacks — the argument-sourcing detail (its AC-2) and the
NFR-2 no-Bash constraint (its Implementation Note 2), i.e. exactly Amendment 5(a). Note the provenance:
this false claim was inherited verbatim from task 1's spec §10 rather than checked, which is the **third**
unverified sibling-restatement in this decomposition (after architect brief §2's shared-consumer over-claim
and task 1 §7's inheritance of it). Correct disposition when specs disagree or assert absence: verify at
source, per the parent's own `po_child_review_progress_20260814T1458Z` instruction.

**(c) §2's `cycle.md` line anchors are stale by +9 and must be replaced with the text anchor.** Live this
tick: Step 0c is at line **61** (spec says 52), its "Run AFTER stage-bootstrap.md" header line is **63**
(spec says 54), and the `Set session variable CYCLE_MODE:` block is **95-99** (spec says 86-89). Current
lines 86-89 are the middle of the *"Sequencing rule for mixed cycles"* bullet list — an implementer
trusting the numeric anchor inserts the pin inside that list and breaks it. The spec's quoted-text anchor
("immediately after the existing `Set session variable CYCLE_MODE:` block") remains unambiguous and
correct, so strike the line numbers in favour of it. Noted for calibration: **only `cycle.md` drifted** —
`stage-analyze.md` (114, 61/80/84), `stage-log-notify.md` (43) and `stage-consolidate.md` (64) all still
match this spec exactly, so the spec's live-verification discipline was sound; it is 6 days of drift on one
file, not sloppy sourcing.

### 11.4 Explicitly NOT granted by this sign-off

`plan_only` + `supervised` remain **PRESERVED**. This certifies the **spec artifact**, not a licence to
ship. Per the parent's own `supervised_note`, no code ships until PO re-adjudicates
`FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING`, which stays `BLOCKED`/`next_agent=po` and still owes review on
`TASK-COWORK-SIGNAL-CHEF-INTRADAY` and `TASK-COWORK-SIGNAL-NAMING-CONTRACT` (2 of 4 remaining). An
implementer arriving here MUST carry Amendment 5 (a)+(b)+(c) **and** task 1's Amendment 4 (a)+(b)+(c).
