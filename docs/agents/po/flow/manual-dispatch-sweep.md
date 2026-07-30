# PO — Manual-Dispatch-Sweep (the "manual/PO dispatch" producer)

**Parent flow:** `docs/agents/po/flow/main.md` § Pre-check — runs every PO tick, alongside (not instead of) the existing "blocked tasks waiting for PO" pre-check and the WF-2 `supervised-goahead.md` pre-check, before Step 0-TNB.
**Consumer of this sub-flow's stamp:** none automated by design (see § Why not the `.head`/WIP-budget path below) — this sub-flow IS the "manual/PO dispatch" mechanism itself. The stamp it writes is a pure audit/idempotency marker, read only by this sub-flow's own next tick.
**Consumer of this sub-flow's OUTPUT:** PO's own Step 1 triage/BATCH construction (`docs/agents/po/flow/main.md` § No-Task Guard: "PO CAN self-initiate when channel audit found bugs..." — the SAME pre-existing mechanism Step 0-TNB/Step 0-SIG findings already feed) and, transitively, dev-team Step 3's direct-execute path — the exact pipe that dispatched THIS OWN fix (`FIX-PO-NO-PRODUCER-FOR-MANUAL-DISPATCH-ESCAPE-HATCH`, `PO BATCH triage-20260730T2227Z-po`).
**Origin:** `FIX-PO-NO-PRODUCER-FOR-MANUAL-DISPATCH-ESCAPE-HATCH` — `docs/agents/dev-team/flow/main.md`'s own Lane × Gate Coverage Matrix and `scripts/audits/bounded1-supervised-lane-report.sh`'s DRS/READY-XOR section headers both describe two live classes of row as "reachable only by manual/PO dispatch". Grep-verified independently by PO and dev-team: no PO flow step ever swept `backlog[]`/`ready[]` by priority for this class — every existing touch was an APPEND (mint) or a one-off id-targeted script. 4th instance of this exact "documented consumer, no documented producer" defect class (see `docs/agents/po/flow/supervised-goahead.md` header for the immediately-preceding 3rd instance).

---

## Why not the `.head`/WIP-budget path (design note, read before extending this file)

BOUNDED-1/SLS/RLC/DRS/QA-Drain all write `.head`/`in_progress[]`/`qa[]` directly, sharing dev-team's own `wip_in_progress` concurrency budget. This sub-flow deliberately does **NOT** do that — PO is not dev-team's dispatch loop, has no claim on that budget, and writing `.head` from a second, independently-scheduled agent (PO) would reintroduce exactly the multi-writer `.head`-collision risk `docs/architecture-briefs/2026-07-29-qadrain-head-slot-decouple.md` names (that risk is scoped to a SINGLE linear fall-through chain being provably collision-free by control-flow inspection alone — a second writer outside that chain breaks the proof). Both rows in this sub-flow's target set were EXCLUDED from that chain by deliberate policy (the DRS allowlist ratification; the sup-XOR-plan_only residual gaps documented, not silently assumed covered, in the Lane × Gate Coverage Matrix) — routing them back through the same mechanism they were deliberately excluded from would defeat the reason they were excluded. Folding a found row into PO's own `BATCH` — the ONE dispatch mechanism PO already has, already proven live (it dispatched this very task) — is the correct-scoped action.

---

## Step 1 — Compute the two live candidate sets (byte-identical predicates, never reimplemented)

Both predicates live in `scripts/lib/po-manual-dispatch-eligibility.jq`, which itself `include`s `scripts/lib/devteam-eligibility.jq` and reuses its predicates verbatim (`is_non_dev_next_agent_unrouted`, `effective_supervised`, `effective_plan_only`, `is_design_router_allowed`, `is_epic_wrapper`, `deps_satisfied`, `is_detail_deferred`, `has_unbacked_sequencing_prose`) — zero new predicate logic, only the outer AND-glue every consumer of that shared file already composes. `scripts/audits/bounded1-supervised-lane-report.sh`'s own DRS/READY-XOR sections call the SAME two defs (retrofitted 2026-07-31, live-diffed byte-identical against a pinned snapshot before/after) — this sub-flow, that report script, and its own regression verifier are three call sites of ONE composition, never three copies.

```bash
NOW_EPOCH=$(date -u +%s)
DRS_ALLOWLIST='["architect","ba","pm","po","agents-architect"]'
jq -c \
  --argjson now_epoch "$NOW_EPOCH" \
  --argjson allowlist "$DRS_ALLOWLIST" \
  --slurpfile detail "$PROJECT_ROOT/docs/data/orch/archive/backlog-detail.json" \
  --slurpfile archive <(bash "$PROJECT_ROOT/scripts/lib/archive-glob-cat.sh") \
  -L "$PROJECT_ROOT/scripts/lib" \
  'include "devteam-eligibility"; include "po-manual-dispatch-eligibility";
   (detail_items_from($detail)) as $detail_items
   | dep_status_map($archive) as $status_map
   | [ ((.task_board.backlog // []) | to_entries[]
        | .key as $idx | .value
        | select(.status == "BACKLOG" or .status == "TODO")
        | select(. | is_drs_stranded_off_allowlist($detail_items; $status_map; $allowlist))
        | select((.po_manual_dispatch_flagged_at // "") == "")
        | { id, priority: (.priority // "unset"), rank: (. | priority_rank), idx: $idx,
            class: "DRS-STRANDED-OFF-ALLOWLIST", lane: "backlog",
            next_agent: (. | effective_next_agent($detail_items)) }),
       ((.task_board.ready // []) | to_entries[]
        | .key as $idx | .value
        | select(. | is_ready_xor_gap($detail_items))
        | select((.po_manual_dispatch_flagged_at // "") == "")
        | { id, priority: (.priority // "unset"), rank: (. | priority_rank), idx: $idx,
            class: "READY-XOR-SUP-OR-PLANONLY", lane: "ready",
            next_agent: (. | effective_next_agent($detail_items)) })
     ] | sort_by([.rank, .idx])' \
  "$PROJECT_ROOT/docs/data/orch/orch-state.json"
```

Log the full list (even if PO only acts on the top entry this tick — visibility matches the report script's own "surfaced, never silently assumed covered" discipline): `"[po] MANUAL-DISPATCH candidates: {N} ({n_drs} DRS-stranded backlog, {n_xor} ready-XOR) — {top_id} selected this tick"`. Empty list (nothing eligible, or everything already flagged and awaiting its BATCH turn) → log `"[po] MANUAL-DISPATCH: 0 unflagged candidates"`, no-op, proceed to Step 0-TNB.

`(.po_manual_dispatch_flagged_at // "") == ""` is the idempotency guard — a row already flagged in a prior tick is excluded here so this step never re-surfaces (and never double-BATCHes) the same row every tick while it's queued waiting for its BATCH to actually get dispatched; it naturally drops out of BOTH source predicates entirely once the row leaves `backlog[]`/`ready[]` (dispatched) or its underlying condition changes (e.g. reassigned to an allowlisted/dev-role `next_agent`, live-observed 2026-07-31 on `FIX-DEVTEAM-QADRAIN-HEAD-WRITE-CONDITIONAL` during this task's own retrofit verification).

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

**Never clears `supervised`/`plan_only`/`next_agent`/`status`** and **never moves the row's lane array-membership** — this is a pure additive audit stamp, not a promote/claim. The row's actual dispatch happens through the SAME `BATCH` mechanism every other PO-self-initiated finding uses (Step 3 below), never through this stamp being read by any automated gate.

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

`scripts/audits/po-manual-dispatch-sweep-verify.sh` — replays `is_drs_stranded_off_allowlist`/`is_ready_xor_gap` (`scripts/lib/po-manual-dispatch-eligibility.jq`, byte-identical, not reimplemented) against a synthetic fixture with positive + negative controls for every branch of the Lane × Gate Coverage Matrix this sub-flow targets. Also asserts this file and the `main.md` pointer to it both exist. Touches no live file.
