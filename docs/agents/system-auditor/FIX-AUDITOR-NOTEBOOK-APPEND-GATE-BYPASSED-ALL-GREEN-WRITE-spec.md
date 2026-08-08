# Fix Spec — FIX-AUDITOR-NOTEBOOK-APPEND-GATE-BYPASSED-ALL-GREEN-WRITE

**Task:** FIX-AUDITOR-NOTEBOOK-APPEND-GATE-BYPASSED-ALL-GREEN-WRITE · P2 · S · zone `docs/agents/system-auditor/`
**Mode:** `supervised:true` + `plan_only:true` — this document is a PLAN only. No file outside this spec doc and the agent-father notebook was edited this cycle. `scripts/git-hooks/pre-commit` itself is UNTOUCHED — the WARN-mode function below is proposed, not merged. No hard-reject mode is proposed or enabled anywhere in this spec (per dispatch instruction and acceptance criterion (3): escalation to REJECT requires a second confirmed occurrence, which has not happened).
**Produced by:** agent-father, 2026-08-08 (dev-team Supervised-Lane Sweep dispatch, session `165f4245-6173-4054-87fd-c55bb626265f`)
**Handoff to:** po (adjudicates the design; routes to a fix-authorized agent for the actual `scripts/git-hooks/pre-commit` edit — agent-father has direct precedent authoring this exact hook file, see §6)
**Origin:** task_board row `FIX-AUDITOR-NOTEBOOK-APPEND-GATE-BYPASSED-ALL-GREEN-WRITE`; PO acceptance amendment `po_acceptance_amend_20260729T0848` (MATERIAL — supersedes part of the original acceptance (2), see §2)
**Commit-zone note:** agent-father's declared zone (`docs/agents/` · `docs/agent-memory/` · `.claude/skills/` · `.claude/agents/`) EXCLUDES `scripts/` and `docs/data/orch/orch-state.json` (`.claude/skills/commit-boundary/SKILL.md` zone table; `docs/agents/agent-father/init.md` `commit_zone`). This spec's proposed hook diff and the proposed task-board patch (§7) are therefore staged here as exact, ready-to-apply text — not applied by this cycle.

---

## 0. Live re-verification (do not trust the row's own citations)

- Row cites `main.md:684-690` for the Notebook Append Gate. **STALE.** Confirmed live (2026-08-08): the gate now lives at `docs/agents/system-auditor/flow/main.md:963-969` (`### Notebook Append Gate (P1-IDLE-AUDITOR-NOTEBOOK-GATE, 2026-07-04 — RC-IDLE-LOOPS)`), relocated by the 2026-08-06 `FIX-AUDITOR-DURABILITY-STEP0B-DETECTION` reorder (moved the whole Notebook Write/Commit block earlier in the flow, ahead of Anomaly Reporting/OUTPUT-CONTRACT). Condition (b) of the gate was *also* rewired at that time — from reading the OUTPUT-CONTRACT line to a direct `$MARKERS_FILE` grep — independent of this row, but directionally the same "stop trusting narration" instinct.
- **A new, adjacent, but DIFFERENT guard shipped literally today** (2026-08-08) and must not be conflated with this row's detector: `scripts/auditor-notebook-commit.sh` §"AC-4 pre-commit contract backstop" (`FIX-ANALYSIS-ONLY-EXIT-DETECTOR-OR-VERDICT-BLIND-TO-PARTIAL-WRITE-CYCLE`) validates the ARITHMETIC of a staged `[OUTPUT-CONTRACT]` line (`signals_posted >= signal_queue_rows_written`, `signals_posted >= dedup_skipped`, via the new shared lib `scripts/lib/output-contract-invariant.sh`) and refuses the commit if violated. That check proves internal self-consistency of the narrated line; it does **not** check whether a write should have happened at all. A fully self-consistent, all-zero line (`signals_posted=0 | signal_queue_rows_written=0 | dashboard_rows=0`) — exactly the shape of the defect commit `f26526d0e` — passes AC-4 cleanly. This row's detector is still a live gap, not superseded. §3 below reuses `scripts/lib/output-contract-invariant.sh`'s extraction idiom where convenient but does not duplicate its arithmetic check.
- Confirmed via git archaeology that `scripts/auditor-notebook-commit.sh` (blessed commit script) and the *exact* Notebook Append Gate + commit-message-convention text that later moved to `:684-690` were **both already live** at the commit immediately preceding the defect (`bda56d1cd`, `git show bda56d1cd:docs/agents/system-auditor/flow/main.md` confirmed lines 684/727-728 present verbatim). The spec was correct and unambiguous at the time — this rules out "the flow doc itself was wrong/missing" as root cause.
- **Timeline reconstructed** (commit timestamps converted from the repo's local `+02:00` to UTC):
  | UTC | Commit | Convention | Notes |
  |---|---|---|---|
  | 00:43:08Z | `7a500484e` | correct (`chore(memory/system-auditor): notebook 2026-07-29 tier-1`) | Status=HEALTHY (per row's own text) |
  | 02:34:23Z | `5bed759a0` | correct | tier-2 |
  | 03:09:20Z | `4baae43b9` | correct | tier-1, Status=HEALTHY — the same-tier baseline `f26526d0e` itself compared against |
  | **05:11:48Z** | **`f26526d0e`** | **`chore(auditor): Tier-1 cycle 2026-07-29T05:08:58Z — all checks PASS`** (non-standard) | **DEFECT: ALL_GREEN (0/0/0/0), wrote+committed anyway** |
  | 06:11:22Z | `9b27e9723` | correct | tier-1, A-21-WARN |

  Only **one** commit touches `system-auditor.md` in the 05:00-05:15Z window — no second, near-simultaneous commit was found in the retained history, which weakens (does not disprove — ephemeral commit-mutex claim logs are not retained 10 days later) the "race between two concurrent invocations" hypothesis relative to "a single spawn's own prose-skip." The intervening ~2h gaps between correct-convention commits (00:43→02:34→03:09, then 03:09→05:11 with presumably one or more correctly-*skipped* ALL_GREEN Tier-1 ticks in between, since Tier-1 fires on a tighter cadence than these gaps) are consistent with the gate working correctly on adjacent ticks and failing on exactly one.
- **Conclusion (acceptance criterion 1):** root cause remains **formally unconfirmed**, which the row's own acceptance explicitly allows, but is narrowed to: isolated single-cycle non-compliance by one spawn; the spec was correct and live at the time; no direct evidence of a concurrent second writer; the gate has held clean on every other same-day cycle before and after. This spec proceeds directly to the mechanical backstop (acceptance (2)) rather than continuing to chase an unreproducible one-off — consistent with "or accept it may remain unconfirmed."

---

## 1. Live notebook-format survey (corrects the literal shape acceptance (2) assumed)

Acceptance (2) as originally written assumes a fixed 4-line section shape. The live corpus does not hold this uniformly. Surveyed the 3 sections currently retained in `docs/agent-memory/notebooks/system-auditor.md` (2026-08-08):

```
## c82 · 2026-08-08T06:36:08Z
### Audit Run Tier-1 (06:30–06:34 UTC 2026-08-08)
- Tier: 1 | Services: 12 checked | Health: 5 checked | Restarts: 1 checked
- Anomalies: 0 new (C critical, W warn, I info) | 1 dedup-skipped
- Status: DEGRADED

## c81 · 2026-08-08T06:25:27Z
### Audit Run Tier-2 (06:24–06:25 UTC 2026-08-08)
- Tier: 2 | Freshness sweep completed | Anomalies: 1 (WARN) | Status: DEGRADED
   ^ Status is INLINE with Anomalies on the SAME line here — no separate "- Status:" line

## c80 · 2026-08-08T01:08:04Z
### Audit Run Tier-1 (01:05–01:06 UTC 2026-08-08)
- Tier: 1 | Services: 12 host_runtime_set | Health: 5 probed
- Anomalies: 0 new (dedup-skipped 1) | Status: DEGRADED
   ^ again inline
```

Also present: non-audit-cycle headings with **no** `### Audit Run Tier-N` line at all (e.g. `## d4-auto · <ts>`, a D4-candidate maintenance entry).

**Design implications:**
1. `Tier-N` MUST be read from the `### Audit Run Tier-N` line specifically — the one reliably-present anchor. A section with no such line is not an audit cycle and is skipped (fail-open, mirrors `_check_notebook_immutability`'s own "no `## ` boundaries found → different defect, skip" precedent).
2. `Anomalies: N` MUST be read via a tolerant `Anomalies:[[:space:]]*[0-9]+` match against the **whole section body**, not a fixed line position.
3. `Status:` MUST likewise be read via a whole-body `Status:[[:space:]]*(HEALTHY|DEGRADED|CRITICAL)` match — it is not reliably on its own line.

This is a live-data correction to acceptance (2)'s literal wording, not a deviation from its intent (the intent — "compare Anomalies/signal-count/Status against the retained same-tier entry" — is unaffected).

---

## 2. Counter derivation — artifact-derived, per `po_acceptance_amend_20260729T0848`

The PO amendment is **binding and MATERIAL**: counter (b) must NOT be derived from the agent's own OUTPUT-CONTRACT narration (`feedback_reader_writes_its_own_trigger_field_check_is_vacuous` — confirmed live on the 2026-07-29T08:38:34Z cycle, where the agent narrated `signal_queue_rows_written=0` while a real row (`sys-20260729T083834-4dd9`) had genuinely been written). It must instead be derived from the artifact:
```bash
jq '[.signal_queue.rows[] | select(.from=="system-auditor" and .ts >= "<since>")] | length' docs/data/orch/orch-state.json
```
and the same treatment applied to counter (a) "where feasible."

### 2a. Counter (b) — `signal_queue_rows_written` (mandatory, unambiguous)

`scripts/emit-audit-signal.sh`'s E-3 step appends a `.signal_queue.rows[]` entry on **every** non-ABORT, non-`SKIP-duplicate-invocation` outcome — including `SKIP-dedup` (verified live: `_check_dedup_and_maybe_send()` at `scripts/emit-audit-signal.sh:489-518` sets `DEDUP_OUTCOME` but never skips the E-3 write; only `SKIP-duplicate-invocation`, a same-cycle repeat of an identical `(dedup_key, cycle_tag)` pair, produces zero new rows). This exactly matches the flow's own definition of gate condition (b) at `main.md:966` ("new-signal: at least one non-`ABORT` `[emit-signal]` line" — `SKIP-dedup` is explicitly one of the counted outcomes there too). So a straight artifact count over the cycle window is a faithful, not just a proxy, reconstruction of (b).

**Window bound (not specified by the PO amendment's placeholder `<cycle_start_utc>` — resolved here):** the gate's own condition (c) already requires locating "the same-tier retained entry immediately below" for the Status comparison. Reuse that lookup's heading timestamp as the window's lower bound (`prev_ts`), and the hook's own wall-clock (`now`) as the upper bound. This is deliberately **not** the *new* section's own heading timestamp — the 2026-08-06 reorder means emit calls run **before** the notebook-write step composes the new heading, so `new_ts` would incorrectly exclude this cycle's own rows. `[prev_ts, now]` is the correct, self-consistent cycle boundary and reuses a lookup the detector needs anyway (no new parameter invented).

### 2b. Counter (a) — "new-finding" (PO: "where feasible")

Live-traced every Tier-2/Tier-3 `emit-audit-signal.sh` call site that feeds the `Anomalies: N new (C/W/I)` tally (`main.md:534-540` "Emit per stale source", the Tier-3 C-xx equivalent at `:887-907`). Both templates' `--severity` placeholder is literally `"<CRITICAL|WARN|INFO>"` — i.e. **every** qualifying anomaly, including INFO-severity, runs the full E-1/E-2/E-3 Emit Sequence, not just severity≥WARN ones (the *section header* text "severity ≥ WARN" at those two call sites is itself imprecise relative to its own body — flagged as a minor pre-existing doc inconsistency, out of this row's scope to fix). D-BCTC-EVAL (HIGH/MED) and D-IMPROVE (INFO, `--e3-only`) are separate buckets not counted in the `N` tally at all (different severity taxonomy / separate improvement-proposal counter) — excluded from this derivation by design, though see the conservative-bias note below for why their accidental inclusion would still be safe.

So: every row counted in (b)'s window is a candidate finding. The remaining question is which of those rows are genuinely **new** (count toward (a)) vs. **dedup-skipped** (must NOT count — `main.md:965`: "dedup-skipped known anomalies do NOT count"). `docs/data/auditor-dedup-ledger.json` gives exactly this discriminator, for free, as a second independent artifact: `_ledger_upsert()` (`scripts/emit-audit-signal.sh:490-518`) writes `now_ts` into the ledger **only** on the `OK` and `OK-escalation-bypass` branches; on `SKIP-dedup` the ledger entry is left untouched (still carries whatever `ts` it had from its last genuinely-new occurrence, which — for the case this detector cares about — is always strictly older than `prev_ts`, since a *newer* upsert would itself have to be a fresh finding). Therefore:

```
new_count = count of rows in the (b) window whose EITHER:
  (i)  dedup_key is null/absent (an --e3-only row — no dedup concept applies, treat as new), OR
  (ii) auditor-dedup-ledger.json[dedup_key].ts >= prev_ts  (freshly upserted THIS cycle → genuinely new)
```
Rows failing both (present with a `dedup_key` whose ledger `ts` is older than `prev_ts`) are dedup-skips and correctly excluded from `new_count`.

**Conservative-bias note (deliberate, matches this file's existing philosophy):** a stray `--e3-only` row from D-BCTC-EVAL/D-IMPROVE landing inside the window would count toward `new_count` even though it is not literally part of the `Anomalies: N new` tally. This can only ever make the detector **less** likely to WARN (more evidence a write was "justified"), never more — the same fail-safe direction `_check_notebook_immutability`/`_check_notebook_uuid_provenance` already choose ("never a new commit-hot-path failure mode," "fail open"). Documented, not silently accepted.

### 2c. Counter (c) — Status (unchanged, already artifact-derived)

Per the PO amendment: "Keep (c) as-is — Status is genuinely a notebook-local property... already artifact-derived." Read both the new section's and the same-tier retained section's `Status:` value directly from the STAGED GIT CONTENT (§1's tolerant regex) — no narration involved, this was never the vacuous-reader problem.

---

## 3. Proposed detector — new, independent pre-commit hook function

Placement: `scripts/git-hooks/pre-commit`, as a new function `_check_notebook_append_gate_bypass`, inserted **after** `_check_notebook_uuid_provenance || exit 1` (current line 608) and **before** the sweep-guard discriminator block (current line ~610/685) — i.e. it runs unconditionally on every commit attempt, exactly like its two siblings, and independent of the BARE/SCOPED/UNKNOWN mode dispatch below it. **Deliberately a separate function, never folded into `_check_notebook_immutability`**, per acceptance (4): different invariant (retained-section byte-identity vs. "should a write have happened at all"), different failure mode, and mixing them risks destabilizing the immutability guard's own already-validated logic.

```bash
# --- Notebook Append-Gate bypass detector (system-auditor.md ONLY) ---------
# TASK: FIX-AUDITOR-NOTEBOOK-APPEND-GATE-BYPASSED-ALL-GREEN-WRITE
# SPEC: docs/agents/system-auditor/FIX-AUDITOR-NOTEBOOK-APPEND-GATE-BYPASSED-ALL-GREEN-WRITE-spec.md
#
# BUG THIS DETECTS: docs/agents/system-auditor/flow/main.md's own Notebook
# Append Gate (:963-969) is a PROSE self-check the model can skip — confirmed
# live once (commit f26526d0e, 2026-07-29: ALL_GREEN cycle, 0 new findings /
# 0 signal_queue rows / unchanged Status, wrote+committed anyway, via a
# non-standard commit message that never went through the blessed script's
# documented convention). Single confirmed occurrence — this is a WARN-only,
# day-1, unproven-recurring backstop, NOT a hard reject. Escalate to REJECT
# only after a SECOND confirmed occurrence (see mode dispatch below).
#
# COUNTER PROVENANCE (po_acceptance_amend_20260729T0848 — MATERIAL): counters
# (a)/(b) below are read from .signal_queue.rows[] + auditor-dedup-ledger.json
# (independent artifact planes, written by scripts/emit-audit-signal.sh's E-3
# actuator + its own dedup-ledger upsert), NEVER from the staged section's own
# narrated Anomalies:/OUTPUT-CONTRACT text — a detector reading the same
# agent's own self-report of itself cannot catch that agent's own misreading
# (feedback_reader_writes_its_own_trigger_field_check_is_vacuous). Counter (c)
# is read from the staged git content directly (already artifact-derived,
# never was the vacuous-reader problem).
#
# SCOPE: docs/agent-memory/notebooks/system-auditor.md ONLY — no other
# notebook. Independent of, and does NOT replace: (1) _check_notebook_
# immutability above (different invariant — retained-section byte-identity);
# (2) scripts/auditor-notebook-commit.sh's own AC-4 arithmetic backstop
# (different plane — validates internal OUTPUT-CONTRACT self-consistency,
# not whether a write should have happened at all; a fully self-consistent
# all-zero line is exactly this defect's shape and passes AC-4 cleanly).
#
# jq-unavailable / file-unreadable is fail-OPEN + LOUD (never a new
# commit-hot-path failure mode) — same precedent as every guard above.

_check_notebook_append_gate_bypass() {
  local nb="docs/agent-memory/notebooks/system-auditor.md"
  local mode_gate old_tmp new_tmp staged old_hashes new_hashes
  local heading tier anomalies_n status_new heading_ts
  local cmp_heading cmp_tier status_prev prev_ts
  local now_ts sq_rows sqr_count new_count rc all_msgs verdict_word msg

  mode_gate="${GIT_AUDITOR_APPEND_GATE_MODE:-warn}"

  command -v jq >/dev/null 2>&1 || {
    echo "[auditor-append-gate-guard] INTERNAL: jq unavailable — cannot cross-reference signal_queue/dedup-ledger artifacts, failing open" >&2
    return 0
  }

  staged="$(git diff --cached --name-status 2>/dev/null)" || return 0
  [ -z "$staged" ] && return 0
  printf '%s\n' "$staged" | grep -qE $'^[AM][[:space:]]'"$nb"'$' || return 0

  old_tmp="$(mktemp "${TMPDIR:-/tmp}/nb-gate-old.XXXXXX" 2>/dev/null)" || return 0
  new_tmp="$(mktemp "${TMPDIR:-/tmp}/nb-gate-new.XXXXXX" 2>/dev/null)" || { rm -f "$old_tmp"; return 0; }

  if ! git show "HEAD:$nb" > "$old_tmp" 2>/dev/null; then
    rm -f "$old_tmp" "$new_tmp"; return 0   # brand-new file — nothing to gate against yet
  fi
  if ! git show ":$nb" > "$new_tmp" 2>/dev/null; then
    rm -f "$old_tmp" "$new_tmp"; return 0
  fi

  # Reuse the existing per-heading section-hash helper (already sourced in
  # this same file, _notebook_section_hashes) purely for its heading-boundary
  # extraction — the hash column itself is unused here.
  old_hashes="$(_notebook_section_hashes "$old_tmp")"
  new_hashes="$(_notebook_section_hashes "$new_tmp")"
  [ -z "$new_hashes" ] && { rm -f "$old_tmp" "$new_tmp"; return 0; }

  rc=0
  all_msgs=""
  now_ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null)"

  # Iterate the NEW file's headings top-to-bottom (its own settled order).
  # A heading present in old_hashes too is RETAINED — governed by
  # _check_notebook_immutability, not this gate. A heading absent from
  # old_hashes is NEW-THIS-COMMIT and is what this gate evaluates.
  while IFS=$'\t' read -r heading _new_hash; do
    [ -z "$heading" ] && continue
    printf '%s\n' "$old_hashes" | awk -F'\t' -v h="$heading" '$1==h{f=1} END{exit !f}' && continue   # retained, not new

    body="$(awk -v h="$heading" '
      $0==h {p=1; next}
      /^## / && p {exit}
      p {print}
    ' "$new_tmp")"

    tier="$(printf '%s\n' "$body" | grep -oE 'Audit Run Tier-[0-9]+' | head -1 | grep -oE '[0-9]+')"
    [ -z "$tier" ] && continue   # not an audit-cycle section (e.g. d4-auto) — not this gate's subject

    anomalies_n="$(printf '%s\n' "$body" | grep -oE 'Anomalies:[[:space:]]*[0-9]+' | head -1 | grep -oE '[0-9]+$')"
    status_new="$(printf '%s\n' "$body" | grep -oE 'Status:[[:space:]]*(HEALTHY|DEGRADED|CRITICAL)' | head -1 | grep -oE '(HEALTHY|DEGRADED|CRITICAL)')"
    heading_ts="$(printf '%s\n' "$heading" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2})?Z')"
    [ -z "$status_new" ] && continue   # cannot read Status at all — fail open, do not guess

    # Nearest SAME-TIER comparison section BELOW this one, scanning the
    # FULL new-file heading order (covers both a retained HEAD-side baseline
    # AND a same-commit multi-cycle bundle — scripts/lib/output-contract-
    # invariant.sh's own header documents this exact bundling shape live,
    # commit 569f79108a93).
    cmp_heading=""
    seen_self=0
    while IFS=$'\t' read -r h2 _h2hash; do
      [ -z "$h2" ] && continue
      if [ "$seen_self" -eq 0 ]; then
        [ "$h2" = "$heading" ] && seen_self=1
        continue
      fi
      b2="$(awk -v h="$h2" '
        $0==h {p=1; next}
        /^## / && p {exit}
        p {print}
      ' "$new_tmp")"
      cmp_tier="$(printf '%s\n' "$b2" | grep -oE 'Audit Run Tier-[0-9]+' | head -1 | grep -oE '[0-9]+')"
      if [ -n "$cmp_tier" ] && [ "$cmp_tier" = "$tier" ]; then
        cmp_heading="$h2"
        status_prev="$(printf '%s\n' "$b2" | grep -oE 'Status:[[:space:]]*(HEALTHY|DEGRADED|CRITICAL)' | head -1 | grep -oE '(HEALTHY|DEGRADED|CRITICAL)')"
        prev_ts="$(printf '%s\n' "$h2" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2})?Z')"
        break
      fi
    done <<NEWHASHES
$new_hashes
NEWHASHES

    if [ -z "$cmp_heading" ] || [ -z "$status_prev" ] || [ -z "$prev_ts" ]; then
      continue   # no same-tier baseline available yet — cannot compare, fail open (first-ever cycle for this tier, or already pruned out of the retained window)
    fi

    # Artifact-derived (b): signal_queue rows from system-auditor in [prev_ts, now].
    sq_rows="$(jq -c --arg from "system-auditor" --arg since "$prev_ts" --arg until "$now_ts" \
      '[.signal_queue.rows[] | select(.from==$from and .ts>=$since and .ts<=$until)]' \
      docs/data/orch/orch-state.json 2>/dev/null)"
    [ -z "$sq_rows" ] && sq_rows="[]"
    sqr_count="$(printf '%s' "$sq_rows" | jq 'length' 2>/dev/null)"
    [ -z "$sqr_count" ] && sqr_count=0

    # Artifact-derived (a): among those rows, ones with no dedup_key (e3-only
    # → always new) OR whose ledger entry was freshly upserted THIS window.
    new_count="$(printf '%s' "$sq_rows" | jq --slurpfile ledger docs/data/auditor-dedup-ledger.json --arg since "$prev_ts" '
      ($ledger[0] // {}) as $L
      | [ .[] | select(
          ((.dedup_key // "") | length == 0)
          or ( ($L[.dedup_key].ts // "") >= $since )
        ) ] | length' 2>/dev/null)"
    [ -z "$new_count" ] && new_count=0

    if [ "$sqr_count" -eq 0 ] 2>/dev/null && [ "$new_count" -eq 0 ] 2>/dev/null && [ "$status_new" = "$status_prev" ]; then
      verdict_word="WARN"
      [ "$mode_gate" = "reject" ] && verdict_word="REJECT"
      msg="[auditor-append-gate-guard] ${verdict_word}: ${nb} — new section '${heading}' (Tier-${tier}) looks like a genuine ALL_GREEN cycle that should have been SKIPPED per docs/agents/system-auditor/flow/main.md's own Notebook Append Gate (:963-969): narrated 'Anomalies: ${anomalies_n:-?} new', artifact-derived signal_queue_rows_written=${sqr_count}, artifact-derived new-finding=${new_count} in window [${prev_ts},${now_ts}] (source: .signal_queue.rows[] + docs/data/auditor-dedup-ledger.json — independent of this section's own narration), Status unchanged '${status_new}' vs prior same-tier entry '${cmp_heading}'. Confirmed prior occurrence: commit f26526d0e (2026-07-29). mode=${mode_gate} (default warn; escalate to reject ONLY after a SECOND confirmed occurrence of THIS bypass mode per FIX-AUDITOR-NOTEBOOK-APPEND-GATE-BYPASSED-ALL-GREEN-WRITE acceptance (3) — set GIT_AUDITOR_APPEND_GATE_MODE=reject only then, and only after re-validating via a corpus replay, same discipline as GIT_NOTEBOOK_IMMUTABILITY_MODE). Independent of _check_notebook_immutability above (different invariant) and auditor-notebook-commit.sh's own AC-4 arithmetic backstop (different plane)."
      echo "$msg" >&2
      all_msgs="${all_msgs}${msg}
"
      rc=1
    fi
  done <<NEWHASHES2
$new_hashes
NEWHASHES2

  rm -f "$old_tmp" "$new_tmp"
  [ -n "$all_msgs" ] && write_signal "$all_msgs"

  [ "$rc" -eq 1 ] && [ "$mode_gate" != "reject" ] && return 0
  return $rc
}

_check_notebook_append_gate_bypass || exit 1
```

**Note on the doubled heading-scan (`awk` body extraction called twice per candidate — once for `body`, once inside the `cmp_heading` search loop for every retained heading tried):** acceptable at this file's current 3-section-cap notebook size (never more than a handful of headings); flagged for a future optimization pass mirroring `_check_notebook_immutability`'s own "compute once, look up cheaply" precedent (its header comment documents fixing exactly this O(n²) shape once already) if this notebook's section cap is ever raised.

---

## 4. Disposition — WARN only, escalation path (acceptance (2)/(3))

- Default `GIT_AUDITOR_APPEND_GATE_MODE=warn`: detection + `stderr` + one aggregated `write_signal` (→ `docs/signals/*.json`, `to:"po"`, `type:"bug-escalation"`) per violating commit. **Never blocks** — matches this file's own established WARN-by-default-day-1 precedent (`_check_notebook_immutability`, `_check_notebook_uuid_provenance`).
- `GIT_AUDITOR_APPEND_GATE_MODE=reject` is the escalation lever, mirroring the two sibling guards' own env-var pattern exactly (manual, PO/ops-authorized opt-in — **not** an automatic same-session counter like the sweep-guard's AC-2, since the 2+ bar this row cares about is across separate AUDIT CYCLES, potentially days apart, not repeat attempts within one commit session). Per this row's own acceptance (3) and the router's explicit instruction: **do not flip this** until a SECOND confirmed occurrence of this exact bypass mode (not the sibling false-input mode already folded/tracked separately — see `po_acceptance_amend_20260729T0848`'s own explicit "RECURRENCE BOOKKEEPING — deliberately NOT bumped" note) is independently corroborated, ideally via this very detector's own WARN output once it is live.
- This spec does **not** propose enabling `reject` mode anywhere, and does not modify `scripts/git-hooks/pre-commit` — both intentionally deferred to a follow-up implementation cycle after PO sign-off.

---

## 5. Negative control / test plan (for whoever implements this)

1. **Positive replay (the known defect):** `git show f26526d0e^:docs/agent-memory/notebooks/system-auditor.md` vs `git show f26526d0e:...` is the canonical true-positive fixture — same shape `_check_notebook_immutability`'s own replay harness (`scripts/audits/verify-notebook-immutability-gate.sh`) already uses for its own guard. `.signal_queue.rows[]`/`auditor-dedup-ledger.json` at that historical point are not directly replayable (live files, not versioned per-commit) — the replay should instead construct a **synthetic** scratch `orch-state.json`/`dedup-ledger.json` fixture with zero matching rows in the `[prev_ts, now]` window, matching what the historical evidence already proves was true that cycle (`signal_queue_rows_written=0` in the commit's own — now-untrusted but independently corroborated by the row's own PO investigation — OUTPUT-CONTRACT line). Expect: WARN fires.
2. **True negative (a real ALL_GREEN skip):** any of the documented adjacent correctly-skipped Tier-1 ticks between `4baae43b9` (03:09Z) and `f26526d0e` (05:11Z) produced **no** notebook commit at all — by construction, this detector (which only fires when the file IS staged) cannot false-positive on a correctly-skipped cycle, since there is no diff to inspect. Confirm this structurally rather than via replay (nothing to replay).
3. **True negative (a real write, correctly justified):** replay any of the correct-convention commits in the timeline table (§0) that carry genuine new findings/signals — confirm `sqr_count`/`new_count` resolve non-zero from a reconstructed `signal_queue.rows[]` scoped to that cycle's own real emissions, and the detector stays silent.
4. **Status-inline parsing (§1 finding):** replay `c81`'s own commit (`Status` inline with `Anomalies` on one line, no separate `- Status:` line) — confirm the whole-body regex still extracts `status_new` correctly; this is the concrete case that would silently break a fixed-line-position parser.
5. **Multi-section-bundle scoping:** replay `569f79108a93` (the documented c79+c80 same-commit bundle cited by `scripts/lib/output-contract-invariant.sh`'s own header) — confirm each new heading gets its OWN nearest-same-tier comparison (which may itself be another NEW heading in the same commit, not only a HEAD-side retained one) per the unified new-file-order scan in §3, not a single shared baseline.
6. **jq/file-unavailable fail-open:** temporarily rename `jq` off `$PATH` (scratch shell only) and confirm the hook logs the INTERNAL warning and does not block.
7. Register the replay as a persisted script under `scripts/audits/` (per `docs/policies/dev-standards.md` § Script Persistence) once implemented — naming suggestion: `scripts/audits/verify-notebook-append-gate-guard.sh`, sibling to `verify-notebook-immutability-gate.sh` / `verify-notebook-uuid-provenance-gate.sh`.

---

## 6. Implementation notes for whoever ships this

- Single-file edit: `scripts/git-hooks/pre-commit` — insert the function body from §3 verbatim after the current `_check_notebook_uuid_provenance || exit 1` line (currently line 608), before the sweep-guard discriminator block. No other file needs to change to ship the WARN-mode detector itself.
- `agent-father` has direct, repeated precedent authoring this exact hook file (`_check_notebook_immutability`, `_check_notebook_uuid_provenance`, both cited throughout this spec) — a natural implementer for the follow-up dispatch, subject to PO's own routing call per this row's `next_agent` convention.
- Do **not** bundle the §7 negative-control replay script into the same commit as the hook edit unless convenient — they are independently useful and independently testable.
- `docs/policies/dev-standards.md`'s CANONICAL pointer table should get a new entry for `_check_notebook_append_gate_bypass` once shipped, mirroring the existing entries for its two siblings (`FIX-NOTEBOOK-COMPOSE-REWRITES-RETAINED-PRIOR-SECTIONS` / `FIX-AGENT-NOTEBOOK-UUID-PROVENANCE`) — out of scope for THIS plan-only cycle, flagged for the implementer.

---

## 7. Proposed task-board patch (NOT applied by this cycle's commit — see note in §8)

```jq
($id) as $id |
(.task_board.in_progress[] | select(.id==$id)) as $row |
.task_board.in_progress |= map(select(.id != $id)) |
.task_board.review += [ ($row + {
  status: "REVIEW",
  next_agent: "po",
  updated_at: $now,
  updated_by: "agent-father/plan-only-spec-20260808",
  spec_doc: "docs/agents/system-auditor/FIX-AUDITOR-NOTEBOOK-APPEND-GATE-BYPASSED-ALL-GREEN-WRITE-spec.md",
  agent_father_review_note: $note
}) ]
| if .head.active_task_id == $id then
    .head = {status:"idle", active_task_id:null, next_agent:"router",
      next_action:"FIX-AUDITOR-NOTEBOOK-APPEND-GATE-BYPASSED-ALL-GREEN-WRITE closed out by agent-father as a plan-only spec — awaiting po sign-off; scripts/git-hooks/pre-commit is UNTOUCHED (proposal only). orch-state.json commit + task_release still owed by router (agent-father has no gateway binding this session, orch-state.json outside its declared commit_zone).",
      updated_at:$now, updated_by:"agent-father"}
  else . end
```
with `$id="FIX-AUDITOR-NOTEBOOK-APPEND-GATE-BYPASSED-ALL-GREEN-WRITE"`, `$now=<current UTC ISO8601>`, and `$note` = a condensed version of §0-§4 above (root cause narrowed-but-unconfirmed; WARN-only artifact-derived detector designed and spec'd, not merged; escalation to reject gated on a second confirmed occurrence per acceptance (3); full detail in this spec_doc).

---

## 8. Closeout status (this cycle)

- Applied: this spec doc (`docs/agents/system-auditor/FIX-AUDITOR-NOTEBOOK-APPEND-GATE-BYPASSED-ALL-GREEN-WRITE-spec.md`), committed under agent-father's own zone.
- Applied (file write via `scripts/orch-apply.sh`, per `CLAUDE.md`'s Orch-State Hot File write contract) but **NOT committed** by this cycle: the §7 task-board patch — `docs/data/orch/orch-state.json` is outside agent-father's declared `commit_zone` (`FU-AGENT-FATHER-ORCH-SCOPE`); per established precedent (see this agent's own notebook, e.g. `docs/data/orch/archive/2026-08.json` TE-T16/TE-T26 closeouts: "Board row moved ... via orch-apply.sh (already applied to live file) ... agent-father commit_zone excludes ... — router/po must commit this file"), the write-wrapper apply is within bounds but the git commit of that file is not.
- **NOT attempted:** `task_release(task_id="task:FIX-AUDITOR-NOTEBOOK-APPEND-GATE-BYPASSED-ALL-GREEN-WRITE", owner_client_session="165f4245-6173-4054-87fd-c55bb626265f")` — agent-father's tool grant for this cycle is Read/Edit/Write/Glob/Grep/Bash only, no `mcp__gateway__call_tool` binding (a recurring, already-logged structural gap for this agent identity across multiple prior sessions, see `docs/agent-memory/notebooks/agent-father.md`). The dev-team/router session must release this lock.
