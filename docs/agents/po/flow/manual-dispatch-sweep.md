# PO — Manual-Dispatch-Sweep (the "manual/PO dispatch" producer)

**Parent flow:** `docs/agents/po/flow/main.md` § Pre-check — runs every PO tick, alongside (not instead of) the existing "blocked tasks waiting for PO" pre-check and the WF-2 `supervised-goahead.md` pre-check, before Step 0-TNB.
**Consumer of this sub-flow's stamp:** none automated by design (see § Why not the `.head`/WIP-budget path below) — this sub-flow IS the "manual/PO dispatch" mechanism itself. The stamp it writes is a pure audit + bounded re-admission marker, read only by this sub-flow's own future ticks (Step 1's `flag_reentrant` guard — see § Bounded re-admission below).
**Consumer of this sub-flow's OUTPUT:** PO's own Step 1 triage/BATCH construction (`docs/agents/po/flow/main.md` § No-Task Guard: "PO CAN self-initiate when channel audit found bugs..." — the SAME pre-existing mechanism Step 0-TNB/Step 0-SIG findings already feed) and, transitively, dev-team Step 3's direct-execute path — the exact pipe that dispatched THIS OWN fix (`FIX-PO-NO-PRODUCER-FOR-MANUAL-DISPATCH-ESCAPE-HATCH`, `PO BATCH triage-20260730T2227Z-po`).
**Origin:** `FIX-PO-NO-PRODUCER-FOR-MANUAL-DISPATCH-ESCAPE-HATCH` — `docs/agents/dev-team/flow/main.md`'s own Lane × Gate Coverage Matrix and `scripts/audits/bounded1-supervised-lane-report.sh`'s DRS/READY-XOR section headers both describe two live classes of row as "reachable only by manual/PO dispatch". Grep-verified independently by PO and dev-team: no PO flow step ever swept `backlog[]`/`ready[]` by priority for this class — every existing touch was an APPEND (mint) or a one-off id-targeted script. 4th instance of this exact "documented consumer, no documented producer" defect class (see `docs/agents/po/flow/supervised-goahead.md` header for the immediately-preceding 3rd instance).

**Extended 2026-08-07 (`FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER`, architect — po_residual_measurement_20260728's sub-question 1) with a THIRD candidate class: `BACKLOG-XOR-GAP`.** Live measurement found `backlog[]` rows carrying exactly ONE of `supervised`/`plan_only` whose `next_agent` is dev-role (or absent) are excluded from BOUNDED-1 (either flag alone), SLS (requires both), AND this sub-flow's own pre-existing `DRS-STRANDED-OFF-ALLOWLIST` class (`is_design_router_candidate` requires a non-dev `next_agent`) — 39 rows live, zero eligible picker anywhere, none of them reachable by the READY-XOR class either (that class only ever scans `ready[]`, and nothing promotes a lone-flag `backlog[]` row into `ready[]`). Folded into this SAME mechanism (not a new gate, not a widened SLS/DRS predicate — see `scripts/lib/po-manual-dispatch-eligibility.jq`'s `is_backlog_xor_gap` header for why blanket-widening SLS/DRS was rejected) because it needs the identical safety property: a human (PO) gate before dispatch, not an unattended auto-spawn — the DRS ratification's "supervised dev-role rows require a human gate" reasoning applies equally here, so the fix is to make the human gate a MECHANISM (this sweep) instead of leaving it to incidental notice, never to remove the gate itself.
**Bounded re-admission:** `FIX-PO-MANUAL-DISPATCH-SWEEP-FLAG-WITHOUT-DISPATCH-STRANDS-ROW` (2026-07-31) — Step 1's ORIGINAL exclusion (`(.po_manual_dispatch_flagged_at // "") == ""`) was permanent: stamp (Step 2) and dispatch (BATCH actually reaching dev-team/PM under its own WIP cap) are not atomic, so a row stamped on a tick whose BATCH then got deferred (e.g. dev-team's WIP cap saturated that tick) became invisible to every later sweep forever — 5th instance of the same "documented consumer, no documented producer" family, one layer down from this sub-flow's own origin fix. LIVE INSTANCE that proved it: `TE-T12`, flagged `2026-07-31T06:56:27Z`, still `BACKLOG` ~8h later. Cured by BOUNDING the exclusion to a staleness window (§ Step 1 `flag_reentrant`) rather than folding a second undispatched row into Step 3 whenever Step 2 stamps nothing — the staleness-window shape is the smaller, more mechanical change: it touches only the Step 1 candidate `select`, needs no new Step-3 branch/fallback-selection logic, and reuses the `$now_epoch` argument Step 1's script was already computing (it was passed to `jq` but unused before this fix).

---

## Why not the `.head`/WIP-budget path (design note, read before extending this file)

BOUNDED-1/SLS/RLC/DRS/QA-Drain all write `.head`/`in_progress[]`/`qa[]` directly, sharing dev-team's own `wip_in_progress` concurrency budget. This sub-flow deliberately does **NOT** do that — PO is not dev-team's dispatch loop, has no claim on that budget, and writing `.head` from a second, independently-scheduled agent (PO) would reintroduce exactly the multi-writer `.head`-collision risk `docs/architecture-briefs/2026-07-29-qadrain-head-slot-decouple.md` names (that risk is scoped to a SINGLE linear fall-through chain being provably collision-free by control-flow inspection alone — a second writer outside that chain breaks the proof). Both rows in this sub-flow's target set were EXCLUDED from that chain by deliberate policy (the DRS allowlist ratification; the sup-XOR-plan_only residual gaps documented, not silently assumed covered, in the Lane × Gate Coverage Matrix) — routing them back through the same mechanism they were deliberately excluded from would defeat the reason they were excluded. Folding a found row into PO's own `BATCH` — the ONE dispatch mechanism PO already has, already proven live (it dispatched this very task) — is the correct-scoped action.

---

## Step 1 — Compute the three live candidate sets (byte-identical predicates, never reimplemented)

All three predicates live in `scripts/lib/po-manual-dispatch-eligibility.jq`, which itself `include`s `scripts/lib/devteam-eligibility.jq` and reuses its predicates verbatim (`is_non_dev_next_agent_unrouted`, `effective_supervised`, `effective_plan_only`, `is_design_router_allowed`, `is_epic_wrapper`, `deps_satisfied`, `is_detail_deferred`, `has_unbacked_sequencing_prose`) — zero new predicate logic, only the outer AND-glue every consumer of that shared file already composes. `scripts/audits/bounded1-supervised-lane-report.sh`'s own DRS/READY-XOR/BACKLOG-XOR-GAP sections call the SAME defs (DRS/READY-XOR retrofitted 2026-07-31, BACKLOG-XOR-GAP added 2026-08-07, all live-diffed byte-identical against a pinned snapshot before/after) — this sub-flow, that report script, and its own regression verifier are three call sites of ONE composition, never three copies.

```bash
NOW_EPOCH=$(date -u +%s)
DRS_ALLOWLIST='["architect","ba","pm","po","agents-architect"]'
STALE_SECONDS=14400   # 4h — keep in lockstep with docs/policies/dev-standards.md:517/521 mirror and scripts/audits/po-manual-dispatch-sweep-verify.sh's own STALE_SECONDS
jq -c \
  --argjson now_epoch "$NOW_EPOCH" \
  --argjson stale_seconds "$STALE_SECONDS" \
  --argjson allowlist "$DRS_ALLOWLIST" \
  --slurpfile detail "$PROJECT_ROOT/docs/data/orch/archive/backlog-detail.json" \
  --slurpfile archive <(bash "$PROJECT_ROOT/scripts/lib/archive-glob-cat.sh") \
  -L "$PROJECT_ROOT/scripts/lib" \
  'include "devteam-eligibility"; include "po-manual-dispatch-eligibility";
   def flag_reentrant($now_epoch; $stale_seconds):
     (.po_manual_dispatch_flagged_at // "") as $flagged
     | ($flagged == "")
       or (try (($now_epoch - ($flagged | fromdateiso8601)) > $stale_seconds) catch false);
   (detail_items_from($detail)) as $detail_items
   | dep_status_map($archive) as $status_map
   | [ ((.task_board.backlog // []) | to_entries[]
        | .key as $idx | .value
        | select(.status == "BACKLOG" or .status == "TODO")
        | select(. | is_drs_stranded_off_allowlist($detail_items; $status_map; $allowlist))
        | select(. | flag_reentrant($now_epoch; $stale_seconds))
        | { id, priority: (.priority // "unset"), rank: (. | priority_rank), idx: $idx,
            class: "DRS-STRANDED-OFF-ALLOWLIST", lane: "backlog",
            next_agent: (. | effective_next_agent($detail_items)),
            reflag: ((.po_manual_dispatch_flagged_at // "") != "") }),
       ((.task_board.backlog // []) | to_entries[]
        | .key as $idx | .value
        | select(.status == "BACKLOG" or .status == "TODO")
        | select(. | is_backlog_xor_gap($detail_items; $status_map))
        | select(. | flag_reentrant($now_epoch; $stale_seconds))
        | { id, priority: (.priority // "unset"), rank: (. | priority_rank), idx: $idx,
            class: "BACKLOG-XOR-GAP", lane: "backlog",
            next_agent: (. | effective_next_agent($detail_items)),
            reflag: ((.po_manual_dispatch_flagged_at // "") != "") }),
       ((.task_board.ready // []) | to_entries[]
        | .key as $idx | .value
        | select(. | is_ready_xor_gap($detail_items))
        | select(. | flag_reentrant($now_epoch; $stale_seconds))
        | { id, priority: (.priority // "unset"), rank: (. | priority_rank), idx: $idx,
            class: "READY-XOR-SUP-OR-PLANONLY", lane: "ready",
            next_agent: (. | effective_next_agent($detail_items)),
            reflag: ((.po_manual_dispatch_flagged_at // "") != "") })
     ] | sort_by([.rank, .idx])' \
  "$PROJECT_ROOT/docs/data/orch/orch-state.json"
```

Log the full list (even if PO only acts on the top entry this tick — visibility matches the report script's own "surfaced, never silently assumed covered" discipline): `"[po] MANUAL-DISPATCH candidates: {N} ({n_drs} DRS-stranded backlog, {n_backlogxor} backlog-XOR-gap, {n_xor} ready-XOR, {n_reflag} re-admitted stale-flagged) — {top_id} selected this tick"`. Empty list (nothing eligible, or everything already flagged fresh and awaiting its BATCH turn within the staleness window) → log `"[po] MANUAL-DISPATCH: 0 eligible candidates"`, no-op, proceed to Step 0-TNB.

`is_backlog_xor_gap($detail_items; $status_map)` (new 2026-08-07, `scripts/lib/po-manual-dispatch-eligibility.jq`) is DISJOINT from `is_drs_stranded_off_allowlist` by construction (the former requires a dev-role-or-absent `next_agent`, the latter requires a non-dev `next_agent` — see that predicate's own header) — a `backlog[]` row is never double-counted into both classes in the same tick.

`flag_reentrant($now_epoch; $stale_seconds)` is the idempotency + bounded re-admission guard. An unflagged row (`po_manual_dispatch_flagged_at` empty) is always eligible. A row already flagged in a prior tick is excluded ONLY while its stamp is fresher than `$stale_seconds` (4h) — long enough that a row just stamped this tick, or on the next tick or two, isn't immediately re-surfaced/re-BATCHed while its BATCH still has a realistic chance to actually get dispatched (the ORIGINAL purpose of the guard, preserved); short enough that a row stranded because dispatch didn't happen (e.g. dev-team's WIP cap was saturated that tick — the exact `TE-T12` live instance) re-enters a LATER BATCH well within the same working day instead of being permanently invisible. Once a stamp is older than the window, the row is treated exactly like an unflagged one: re-surfaced in this list, re-selectable in Step 2 (which re-stamps `po_manual_dispatch_flagged_at` to NOW — bumping the freshness clock and resetting the window, an idempotent overwrite whether the row was previously unflagged or stale-flagged), and re-folded into BATCH in Step 3. A malformed/unparseable existing timestamp fails safe (`try ... catch false` → treated as still-fresh/excluded, never crashes the whole sweep). As before, a row naturally drops out of BOTH source predicates entirely once it leaves `backlog[]`/`ready[]` (dispatched) or its underlying condition changes (e.g. reassigned to an allowlisted/dev-role `next_agent`, live-observed 2026-07-31 on `FIX-DEVTEAM-QADRAIN-HEAD-WRITE-CONDITIONAL` during this task's own retrofit verification) — that path is unchanged.

**Same-tick double-BATCH is still structurally impossible** (AC unchanged from the original guard): Step 1 computes the full candidate list ONCE, before Step 2 stamps anything; Step 2 stamps exactly ONE row per invocation from that already-computed list; Step 3 folds that same one row. There is no code path within a single tick where a row can be selected twice, independent of the staleness window's value.

## Step 2 — Select ONE top-priority candidate, stamp it (additive only, never a lane-move)

Same "exactly ONE row per invocation" convention every other picker in this codebase uses (BOUNDED-1/SLS/RLC/DRS promote scripts) — avoids PO trying to fold a dozen rows into one tick's `BATCH` and overwhelming the router/dev-team's own downstream concurrency. If the candidate list from Step 1 is empty, skip this step entirely.

```bash
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
TID="<top candidate id from Step 1>"
CLASS="<its class from Step 1>"
jq --arg tid "$TID" --arg now "$NOW" --arg class "$CLASS" \
  --arg note "po (manual-dispatch-sweep) surfaced $CLASS candidate — folding into this tick's BATCH" \
  '(.task_board.backlog[], .task_board.ready[] | select(.id == $tid)) |=
     (. + { po_manual_dispatch_flagged_at: $now,
            po_manual_dispatch_flagged_by: "po (manual-dispatch-sweep)",
            po_manual_dispatch_class: $class,
            po_manual_dispatch_note: $note })' \
  "$PROJECT_ROOT/docs/data/orch/orch-state.json" | bash "$PROJECT_ROOT/scripts/orch-apply.sh"
```

**Never clears `supervised`/`plan_only`/`next_agent`/`status`** and **never moves the row's lane array-membership** — this is a pure additive audit stamp, not a promote/claim. The row's actual dispatch happens through the SAME `BATCH` mechanism every other PO-self-initiated finding uses (Step 3 below), never through this stamp being read by any automated gate. This overwrite is safe to run on a candidate that ALREADY carried a stale `po_manual_dispatch_flagged_at` (Step 1's `flag_reentrant` re-admission branch) exactly as-is — it simply bumps the timestamp/note to reflect this tick's re-surfacing, no different code path from a first-time flag.

## Step 3 — Fold the flagged row into this tick's BATCH

Build one `BATCH` entry directly from the row's OWN already-complete fields — these are pre-existing full board rows (every one already carries `type`/`id`/`title`/`desc`/`size`/`files`/`baseline_pass`/`zone` from its original mint), never re-authored:

```
{ type: <row.type>, id: <row.id>, title: <row.title>, desc: <row.desc>,
  size: (<row.size> // "S"), files: <row.files>, baseline_pass: <row.baseline_pass>,
  zone: <row.zone> }
```

Append this entry to whatever `BATCH` PO's own Step 1 triage produces this cycle (same array `main.md` § Output already documents — this is an ADDITIONAL input source into that array, not a new output contract). If PO's Step 1 triage this tick produces `NOTHING` otherwise (idle cycle), this entry alone is sufficient to emit a non-empty `BATCH` — do not let an otherwise-idle tick discard an already-flagged, ready-to-dispatch manual candidate.

Log: `"[po] MANUAL-DISPATCH: {id} folded into BATCH ({class})"`.

## Regression verifier

`scripts/audits/po-manual-dispatch-sweep-verify.sh` — replays `is_drs_stranded_off_allowlist`/`is_ready_xor_gap` (`scripts/lib/po-manual-dispatch-eligibility.jq`, byte-identical, not reimplemented) against a synthetic fixture with positive + negative controls for every branch of the Lane × Gate Coverage Matrix this sub-flow targets, PLUS `flag_reentrant`'s three branches (unflagged, fresh-flagged, stale-flagged) replayed byte-identical to Step 1's own inline def (`G-ALREADY-FLAGGED` negative control: fresh-flagged, excluded; `M-STALE-FLAGGED-REENTRANT` positive control: stale-flagged, re-admitted). Also asserts this file and the `main.md` pointer to it both exist. Touches no live file.
