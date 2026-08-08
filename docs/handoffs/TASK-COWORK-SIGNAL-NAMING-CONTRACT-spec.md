# Signal Bus Naming Contract & Drain-Reader Documentation — FR-5 / FR-6 Specification

**Task ID:** TASK-COWORK-SIGNAL-NAMING-CONTRACT (P1, size XS, zone `cross-service/standards`, plan_only, supervised)
**Parent:** FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING (Phase 1, task 4 of 4 — LAST child)
**Sprint:** COWORK-RELIABILITY · **Agent:** developer · **Date:** 2026-08-08
**Status:** SPEC ONLY — `plan_only:true` + `supervised:true` inherited from parent, preserved. **No documentation edit
ships from this document.** Neither `docs/standards/mcp-tools.md` nor `docs/agents/dev-team/flow/drain-signals.md`
is touched by this task. This is a handoff artifact for a future *unsupervised* developer dispatch to apply
verbatim, after PO re-adjudicates the parent row per its own stated policy (`supervised_note`: "no code ships
without parent re-adjudication by PO" — this includes documentation-only edits, since the parent gate is on
`supervised`/`plan_only`, not on artifact type).

**Inputs read at source before writing this spec** (all live-verified this cycle, not paraphrased):
- `docs/data/orch/orch-state.json` → `TASK-COWORK-SIGNAL-NAMING-CONTRACT` row (full, `in_progress[]`) and its
  parent `FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING` row (full, `BLOCKED`, `plan_only:true`, `supervised:true`,
  `po_architect_signoff_20260807T0545` — none of the three binding amendments touch FR-5/FR-6).
- `docs/architecture-briefs/2026-08-07-cowork-signal-filename-cycleid-keying.md` §6 (FR-5, lines 271-304), §7
  (FR-6, lines 306-318), §8 (design decisions table), §9 (AC mapping), §10 (open items — item 2, EC-2 Phase 2
  migration, confirmed out of this task's scope; already tracked by the separately-minted
  `FIX-CHEF-INTRADAY-MARKER-KEY-UTC-HOUR-BASIS-MIGRATION` backlog row per the parent's Amendment 2).
- `docs/standards/mcp-tools.md` — full `## Signal Bus — Naming Contract` section re-read live, lines 148-166
  (see §1 below — **the brief's cited line range, 148-164, is confirmed accurate against the live file this
  cycle; no drift found**, unlike some other rows in this fleet's history where brief-cited line numbers had
  gone stale by dispatch time).
- `docs/agents/dev-team/flow/drain-signals.md` — full `§0a-1` fingerprint description re-read live (see §2 below;
  brief cites "near §0a-1's fingerprint description" without a line number — this spec pins the exact live line).
- `scripts/agents-flow/drain-signals.js` — fingerprint computation re-read live, lines 173-174 (see §2 below —
  **confirms the brief's `drain-signals.js:173` citation is accurate**, and independently re-confirms the same
  formula PO's own `po_goahead_20260807T044131` note on the parent row already cited at `173-174`).
- Sibling task specs already in `review[]` (tasks 1-3 of this decomposition) for pattern/format consistency:
  `docs/handoffs/TASK-COWORK-SIGNAL-DERIVE-WINDOWKEY-spec.md`, `TASK-COWORK-SIGNAL-BCTC-REKEY-spec.md`,
  `TASK-COWORK-SIGNAL-CHEF-INTRADAY-spec.md`.

---

## 1. FR-5 — `docs/standards/mcp-tools.md` Naming Contract extension

### 1.1 Live-verified current state

The `## Signal Bus — Naming Contract` section currently spans **lines 148-166** of the live file:

```
148  ## Signal Bus — Naming Contract
149
150  All agents writing to `docs/signals/` MUST comply with the naming contract:
151
152  ```
153  docs/signals/{from}-{ISO-8601-timestamp}.json
154  ```
155
156  - `{from}` — agent id (e.g. `po`, `cowork-team`, `agent-father`)
157  - `{ISO-8601-timestamp}` — compact UTC form `YYYYMMDDTHHMMSSz` (e.g. `20260521T194519Z`)
158  - Full example: `po-20260521T194519Z.json`
159
160  **Why:** Dedup fingerprint in `signals.db` relies on the timestamp component. Missing timestamp breaks dedup and makes stale signals hard to prune.
161
162  **Anti-pattern (never):** `po-1967-ba-approved.json`, `po-1967b-rerun.json` — sprint references belong in the `payload`, not the filename.
163
164  Historical spec (1 line) → `docs/protocols/agent-chaining-protocol.md` § Cross-Team Signal Directory (cross-link only; mcp-tools.md is SSOT).
165
166  ---
```

(Line 167 blank, line 168 `## Inter-Agent Signal Types` — the next H2, confirmed the section boundary is exactly
`166` inclusive.)

Confirmed by direct grep + read this cycle: this section documents **only** the generic
`docs/signals/{from}-{ISO-8601-timestamp}.json` pattern. Neither `bctc_signal_{TICKER}_*` (per-ticker,
`docs/signals/`) nor `unified-agent-synthesis-*` (which lives under `docs/data/`, not even `docs/signals/`) is
acknowledged anywhere in this file — an SSOT audit of this contract today genuinely cannot discover either file
family or the collision class this row exists to close. This matches the brief's §6 finding exactly; no
correction needed to that claim.

### 1.2 Proposed insertion point

**Insert immediately after line 164** (the "Historical spec" cross-link line) **and before line 165's blank
line / line 166's `---` separator** — i.e. the new subsection becomes the last content of the existing `##
Signal Bus — Naming Contract` section, still bounded by the same `---` that currently closes it before `##
Inter-Agent Signal Types`. This is additive-only: no existing line is modified or removed.

### 1.3 Exact proposed subsection text (verbatim, unchanged from the architecture brief §6 — no correction needed)

```markdown

### Ticker-keyed and dish-keyed file families (WINDOW_KEY component, FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING)

Two file families exist outside the generic `{from}-{ISO-timestamp}.json` pattern above —
both MUST carry a WINDOW_KEY (scheduled cron fire-window, UTC, rounded down to the slot's own
cadence granularity — never a run-start timestamp / raw `cycle_id`) as their cycle discriminator:

- `docs/signals/bctc_signal_{TICKER}_{WINDOW_KEY}_{mode}.json` — bctc-analyst, per-ticker,
  `mode` ∈ {routine, release}. `{WINDOW_KEY}` example: `20260807T2100Z`.
- `docs/data/unified-agent-synthesis-{CYCLE_DATE}-{SLOT_ID}[-{HOUR_COMPONENT}].json` —
  chef/unified-agent. `{HOUR_COMPONENT}` present ONLY for the multi-fire `intraday` slot; absent
  for single-fire slots (morning/eod/evening), which already collapse to 1 file/window once
  `{CYCLE_DATE}` itself is UTC-anchored.

**WINDOW_KEY invariant:** for any given writer, the SAME value backs both this filename component
AND that writer's published-marker mutex key (`task_claim` on `published:<slot>:<key>`) — never
independently re-derived. Two peers of the identical scheduled window are EXPECTED to collide on
this key by design; the mutex, not the filename, is what prevents the second peer's write (see
NFR-5 — same-window peer collisions are a different, separately-owned hazard).
```

**Format note:** `derive_window_key()`'s return format is `YYYYMMDDTHHMMZ` (no seconds field), per task 1's
already-delivered spec (`docs/handoffs/TASK-COWORK-SIGNAL-DERIVE-WINDOWKEY-spec.md` §1). The `20260807T2100Z`
worked example above is consistent with that spec's Test Case 2 result — cited here for cross-confirmation, not
redefined; this task does not restate or modify the format contract, only documents the two filename families
that consume it.

### 1.4 Why no correction was needed to the brief's FR-5 text

Unlike some sibling tasks in this decomposition (which found and flagged design refinements or stale
cross-references in their target files), this task's live-verification turned up **zero discrepancy** between
the brief's proposed subsection text and the current state of the target file — the insertion point, the
existing section's exact wording, and the WINDOW_KEY worked example all check out unchanged. The proposed text
in §1.3 is therefore reproduced verbatim from the brief, not because it was accepted without checking, but
because the check found nothing to correct.

---

## 2. FR-6 — `docs/agents/dev-team/flow/drain-signals.md` one-line addition (documentation-only, zero code change)

### 2.1 Live re-confirmation of `scripts/agents-flow/drain-signals.js`'s fingerprint formula

Re-grepped and re-read directly (not trusted from the brief's paraphrase, not trusted from the parent row's own
`po_goahead_20260807T044131` note, though both independently agree):

```
173  const fingerprint = crypto.createHash('sha256')
174    .update(String(from) + String(type) + payload + String(createdAt)).digest('hex');
```

where `payload` (line 172) is `JSON.stringify(j.payload ?? j)` and `from`/`type`/`createdAt` (lines 167, 169,
171) are read from the signal file's own JSON fields — never from `base` (the file's basename, line 167's
sibling declarations never reference it) or from `path`/`fp_path`/`dest` (the only variables that ever hold a
filename, used solely for `fs.writeFileSync`/`fs.unlinkSync`/`report.push`, lines 179-198 — never fed into the
`crypto.createHash` call above them).

**Confirmed: the file's basename genuinely never enters the fingerprint hash.** `dest`/`source_filename`
(the DB column at line 186) reuse whatever basename the writer chose, so a WINDOW_KEY rekey (tasks 1-3's work:
`bctc_signal_{TICKER}_{WINDOW_KEY}_{mode}.json` replacing the old `{TICKER}_{DATE}_{mode}.json`, and
`unified-agent-synthesis-{CYCLE_DATE}-{SLOT_ID}[-{HOUR_COMPONENT}].json` gaining the optional hour suffix) is
fingerprint-neutral by construction — the brief's §7 claim is accurate, no code change is required in
`drain-signals.js`, and this task proposes none.

### 2.2 Live-verified current state of `docs/agents/dev-team/flow/drain-signals.md` §0a-1

The fingerprint description lives at **line 93**, inside the `§0a-1 — Glob and iterate` numbered list (header at
line 87), item 2 of the per-file loop:

```
91  For each file:
92  1. Read JSON. Log: `"[dev-team] Signal: {from} → {to} | type={type} | priority={priority}"`
93  2. **Fingerprint check:** `sha256(from + type + JSON.stringify(payload) + createdAt)`
94     - Match in `signals_processed` → skip PO routing | mv to `processed/{name-replay}.json` | no INSERT
95     - No match → dual-record write:
96       - **Filesystem:** append `{fingerprint, processedAt, processedBy:"dev-team", result}` then mv to `docs/signals/processed/{filename}` — result ∈ {`routed-to-po`, `skipped-duplicate`, `skipped-duplicate-replay`, `skipped-stale`}
97       - **DB INSERT** into `signals_processed(fingerprint, from_agent, to_agent, type, priority, payload, created_at, processed_at, processed_by, result, source_filename)` — INSERT fail is non-fatal (file move is SSOT)
98  3. Append to `pendingSignals[]` with `source="file"` (mirrors 0a-D's `source="dashboard"` tag —
```

The manual spec's prose form (`sha256(from + type + JSON.stringify(payload) + createdAt)`, line 93) matches the
live script's actual computation (§2.1 above) field-for-field — no drift between spec and script found.

### 2.2b Independent NFR-4 regression-strategy cross-check

The brief's §8 test strategy (unchanged, restated for completeness) names `drain-signals.test.js`'s existing
fingerprint-neutrality assertions as the regression guard for this NO-OP claim (NFR-4: "must still pass
unmodified against a WINDOW_KEY-keyed filename"). This task did not re-run that test file — running it is out of
this task's plan_only/spec-only scope (no test execution against application code is prescribed for a
documentation-only FR) — but confirms by direct source read (§2.1) that the assertion's premise (basename
excluded from the hash) holds structurally today, independent of any prior task's claim to the same effect.

### 2.3 Proposed insertion point

**Insert as a new sub-bullet immediately after line 93** (the fingerprint formula line), **before** the existing
"Match in `signals_processed`" sub-bullet at line 94. Rationale: this documents a property of the fingerprint
formula itself (what it does NOT include), so it reads most naturally attached directly to the formula's own
line, ahead of the match/no-match branching logic that follows it. This is additive-only — no existing line
(93-98) is modified.

### 2.4 Exact proposed one-line addition (verbatim, unchanged from the architecture brief §7)

```markdown
   - Filename is never part of the fingerprint; renaming a writer's basename convention (e.g. WINDOW_KEY-keying, FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING) requires no change here.
```

(Indentation: 3 leading spaces, matching the existing sub-bullets at lines 94/95, so it renders as a sibling
bullet under item 2, not a new top-level numbered item.)

### 2.5 `scripts/agents-flow/drain-signals.js` — confirmed no code change

Per §2.1, re-confirmed live and independently of the brief's own claim: **zero lines of `drain-signals.js`
require modification.** This task proposes none, and none is in scope for a `plan_only`+`supervised` row even if
one had been found necessary (it was not).

---

## 3. AC-3 mapping

**AC-3** (per the parent row's own acceptance criteria, restated in the brief §9): *"the drain-reader change, if
any, preserves routing of both cycles' signals."*

**Satisfied by confirmed NO-OP.** §2.1-§2.2 above independently re-verify (not merely re-cite) that:
1. The fingerprint formula (`sha256(from+type+JSON.stringify(payload)+createdAt)`) never reads the file's
   basename — confirmed at the actual `crypto.createHash(...)` call site, lines 173-174.
2. Therefore a WINDOW_KEY-keyed filename (tasks 1-3's rekey) changes `dest`/`source_filename` only — cosmetic,
   never the dedup key — and routing (which `pendingSignals[]` entry gets built, which agent it routes to, which
   `signals_processed` row it dedups against) is unaffected.
3. `drain-signals.js` requires **zero** code change (§2.5); `drain-signals.md` requires only the one-line
   clarifying addition in §2.4, which documents the existing invariant rather than introducing a new one.

AC-3 therefore closes on documentation alone — there is no "drain-reader change" for this row beyond the
clarifying comment, and that comment does not alter behavior.

---

## 4. Dangling `ba_handoff` pointer

The board row's `ba_handoff` field points at `docs/handoffs/TASK-COWORK-SIGNAL-NAMING-CONTRACT.md`, confirmed
**absent** from disk via `ls` before this spec was written (and re-confirmed again during this cycle). This is
the same dangling-pointer pattern already noted and non-blocking on tasks 2 and 3 of this same decomposition
(`TASK-COWORK-SIGNAL-BCTC-REKEY`, `TASK-COWORK-SIGNAL-CHEF-INTRADAY` — both moved to `review[]` without that
field ever resolving to a real file). Not treated as a blocker here either; the real specification content lives
in this document (`docs/handoffs/TASK-COWORK-SIGNAL-NAMING-CONTRACT-spec.md`), and the `spec_doc` board field
(added at closeout) is the pointer a future reader or PO should actually follow.

---

## 5. Non-goals (plan_only reminder)

- No edit to `docs/standards/mcp-tools.md` or `docs/agents/dev-team/flow/drain-signals.md` is made by this task
  — §1 and §2 are exact proposed text + live-verified insertion points for a future unsupervised dispatch to
  apply verbatim, after PO re-adjudicates the parent row.
- No edit to `scripts/agents-flow/drain-signals.js` — confirmed unnecessary (§2.5), and out of scope even if it
  had been necessary.
- `derive_window_key()` is not implemented or re-derived here — that is task 1's contract
  (`docs/handoffs/TASK-COWORK-SIGNAL-DERIVE-WINDOWKEY-spec.md`); this task only documents the filename
  convention that consumes its output, cited by reference (§1.3 format note), not redefined.
- No bctc-analyst, chef/unified-agent, or tran-ngoc-bau file is touched — those are tasks 1/2/(N/A, FR-4 descoped
  per parent Amendment 1) of this decomposition, already handled or out of scope.
- No further agent spawned by this task.

---

## 6. Closing note — 4th and final child of the decomposition

This is the **4th and final** child task of the `FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING` Phase 1
decomposition (`decomposed_tasks`: `TASK-COWORK-SIGNAL-DERIVE-WINDOWKEY`, `TASK-COWORK-SIGNAL-BCTC-REKEY`,
`TASK-COWORK-SIGNAL-CHEF-INTRADAY`, `TASK-COWORK-SIGNAL-NAMING-CONTRACT`). Once this row's closeout (§ below)
lands, **all 4 children will sit in `review[]`**, each with its own `spec_doc` pointer and
`developer_review_note`, all `supervised:true`/`plan_only:true` preserved unchanged. This document does **not**
attempt any epic-wrapper closeout of the parent row — that is PO's job, via the existing Step 4.4 Epic-Wrapper
Autoclose Sweep, once PO re-adjudicates all 4 specs together per the parent's own `supervised_note` and the
`po_architect_signoff_20260807T0545` binding amendments.

---

## Decision Journal
See `docs/agent-memory/decisions/sprint-COWORK-RELIABILITY-developer.md`, task_id
`TASK-COWORK-SIGNAL-NAMING-CONTRACT`.

## RETURN
```
DONE: Spec complete for FR-5 (mcp-tools.md Naming Contract subsection, insertion point live-verified after line
      164, brief text reproduced verbatim -- zero drift found between brief and live file) + FR-6 (drain-signals.md
      one-line addition after line 93, drain-signals.js fingerprint formula re-confirmed at source lines 173-174
      -- basename never in hash, zero code change required). AC-3 satisfied by confirmed NO-OP. Dangling
      ba_handoff pointer noted, non-blocking, same precedent as tasks 2/3. plan_only+supervised preserved -- no
      doc edit shipped, no code touched. 4th and final child of the parent decomposition -- epic-wrapper
      closeout explicitly deferred to PO.
ZONE: cross-service/standards
NEXT: po | review spec (this row moves to review[], next_agent=po per dispatch instruction) -- all 4 children of
      FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING now in review[]
HANDOFF: docs/handoffs/TASK-COWORK-SIGNAL-NAMING-CONTRACT-spec.md
PIPELINE: hold -- supervised row, no auto-continue; epic-wrapper closeout is PO's Step 4.4 sweep, not this task's
```
