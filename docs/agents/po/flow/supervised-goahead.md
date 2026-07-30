# PO — Supervised-Hold Ratification (WF-2 `po_goahead` producer)

**Parent flow:** `docs/agents/po/flow/main.md` § Pre-check — runs every PO tick, right after the existing "blocked tasks waiting for PO" pre-check, before Step 0-TNB.
**Consumer:** `docs/agents/dev-team/flow/main.md:467-483` — WF-2 SUPERVISED-HOLD `should_hold` gate. It holds a supervised in_progress/review/qa row from resuming (does NOT spawn `next_agent`) until a key matching `^po_goahead` exists on the row or on `.head`. `.head` is left UNCHANGED while held, so a stamp lands at any tick and the very next dev-team resume tick proceeds automatically — no manual re-triage.
**Origin:** FIX-WF2-SUPERVISED-HOLD-NO-PO-SIDE-GOAHEAD-PRODUCER — the consumer predicate existed with NO documented producer; the stamp only ever landed because a PO hand-authored the exact key pattern ad hoc (`po_goahead_20260722`, `po_goahead_20260730T0905` — `docs/agent-memory/decisions/ruling-20260730T0906Z-po-triage-po.md` STEP po-5). Same structural class as FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER (2026-07-21, idled a P0 6+ days): a documented consumer with no documented producer.

---

## Step 1 — Find the row actually being held

WF-2 evaluates exactly ONE row per dev-team resume tick: whichever row `.head.active_task_id` names, IF `.head.status == "in_progress"`. Re-run dev-team's OWN `should_hold` predicate (byte-identical to `docs/agents/dev-team/flow/main.md:469-478`) against the live file, scoped to that id:

```bash
head_status=$(jq -r '.head.status' docs/data/orch/orch-state.json)
head_tid=$(jq -r '.head.active_task_id' docs/data/orch/orch-state.json)
if [ "$head_status" = "in_progress" ] && [ "$head_tid" != "null" ]; then
  should_hold=$(jq -r --arg tid "$head_tid" \
    --slurpfile detail docs/data/orch/archive/backlog-detail.json \
    -L scripts/lib \
    'include "devteam-eligibility";
     (detail_items_from($detail)) as $detail_items
     | ( [ (.task_board.in_progress // [])[], (.task_board.review // [])[], (.task_board.qa // [])[] ]
         | map(select(.id == $tid or .task_id == $tid)) | first ) as $row
     | (($row != null) and ($row | effective_supervised($detail_items))) as $supervised
     | ( (($row // {}) | keys) + ((.head // {}) | keys) | any(test("^po_goahead"))) as $goahead
     | ($supervised and ($goahead | not)) | tostring' \
    docs/data/orch/orch-state.json)
fi
```

If `should_hold != "true"` → nothing is held right now, proceed to Step 0-TNB.

**Informational only (does NOT gate this step, never auto-ratified):** other `in_progress[]`/`review[]`/`qa[]` rows may ALSO be `effective_supervised` without a `po_goahead_*` stamp yet — they are not currently blocking anything (WF-2 only ever evaluates the head-referenced row) and most are legitimately mid-flight (e.g. the upstream deliverable they need ratified doesn't exist yet). Do not pre-emptively stamp these; ratifying a deliverable that doesn't exist yet is worse than a live hold. Revisit each once it becomes `.head.active_task_id`.

## Step 2 — Ratify independently (never on a relayed verdict)

For each held row: read whatever deliverable `next_agent` is meant to consume (architecture brief, spec, script diff — whatever the supervised checkpoint exists to gate) and verify it AT SOURCE. Do not stamp on a coordinator's or peer agent's RAW-verify report as the sole basis — the entire purpose of `supervised` + `po_goahead` is that PO is the ratifier of record; accepting a relayed verdict makes the gate vacuous (`feedback_reader_writes_its_own_trigger_field_check_is_vacuous`, `feedback_unverified_cross_session_greenlight_no_override_safety_gate`). Concretely: confirm the artifact the brief claims exists actually exists (file present, byte size, commit SHA real), and confirm at least one load-bearing implementability claim by reading the source it's about — not by trusting the brief's prose. See STEP po-5 in `ruling-20260730T0906Z-po-triage-po.md` for a worked example (verified brief existence/size/commit, re-derived the implementability claim from source, and corrected one inaccuracy in the relay before releasing).

Two outcomes:
- **Ratified** → Step 3.
- **Not ratified** (deliverable missing, wrong, or incomplete) → do nothing. Leave the row and `.head` exactly as-is (unlike a BLOCKED task, this is NOT a reset-to-idle case — WF-2 deliberately keeps `.head` pointed at the row so the hold self-heals the instant a stamp lands). Log the reason in the notebook / decision journal so the next PO tick doesn't re-derive it from scratch.

## Step 3 — Stamp `po_goahead_<ts>`

Key MUST match `^po_goahead` (the consumer regex). Timestamp format `YYYYMMDDTHHMMSS` (compact, matches existing precedent `po_goahead_20260730T0905`) — collision-safe across ticks and self-documents when the ratification happened. Value is a one-line rationale (what was verified, what basis).

**Placement — the row is preferred, not `.head`.** Both satisfy the consumer (`should_hold` unions the row's own keys with `.head`'s keys), but a row-level stamp is a durable per-task audit trail that survives `.head` being reused/reset by the next dispatch cycle; a `.head`-only stamp evaporates the moment `.head` moves on to the next task. Stamp `.head` only in the rare case the row object itself is unreachable for write (should not happen in normal operation).

```bash
NOW=$(date -u +%Y%m%dT%H%M%S)
TID="<task_id>"
jq --arg tid "$TID" --arg key "po_goahead_$NOW" --arg note "<one-line: what was verified, at what basis>" \
  '(.task_board.in_progress[], .task_board.review[], .task_board.qa[] | select(.id == $tid or .task_id == $tid)) |= (. + {($key): $note})' \
  docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh"
```

Log: `"[po] SUPERVISED-HOLD released: {task_id} — po_goahead_{ts} stamped"`. No Telegram required — the next dev-team resume tick picks it up silently, same as any other head-unchanged self-heal.

## Regression verifier

`scripts/audits/po-goahead-producer-verify.sh` — replays dev-team's own WF-2 `should_hold` jq (byte-identical, not reimplemented) against a synthetic fixture: before the Step 3 stamp, `should_hold=true`; after applying the EXACT jq pattern above, `should_hold=false`. Also asserts this file and the `main.md` pointer to it both exist. Touches no live file.
