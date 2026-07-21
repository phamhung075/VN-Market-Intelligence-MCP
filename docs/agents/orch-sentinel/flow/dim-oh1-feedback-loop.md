# Orch Sentinel — OH-1 Feedback-Loop Throughput

**Parent flow:** `docs/agents/orch-sentinel/flow/main.md` (runs in both MODE=FULL and MODE=LITE)
**Answers:** Do findings from loops 2/3/4 (cowork, claude-manager-helper, system-auditor) reach loop 1 (dev-team)?

All thresholds below are read live from their owning source each cycle — never hardcode a duplicate copy (`feedback_no_hardcode_stats`). Severity vocabulary = `CRITICAL | HIGH | MED | LOW | INFO` (signal-dashboard row shape).

Read once at start of this sub-flow (read-only): `docs/data/orch/orch-state.json` `.task_board` and `.signal_queue`, `docs/signals/*.json` (glob count only, never parsed content).

---

## OH-1.1 — Signal→Task Mint Rate

```bash
jq '[.signal_queue.rows[] | select(.ts > (now - 7*86400 | strftime("%Y-%m-%dT%H:%M:%SZ")))]
    | group_by(.status) | map({status: .[0].status, count: length})' docs/data/orch/orch-state.json
jq '[.task_board.active_sprints[].tasks[]? | select(.origin_signal_id != null)] | length' docs/data/orch/orch-state.json
```
**Flag:** `HIGH` if mint rate == 0 for 2 consecutive full runs (compare against prior scorecard OH-1.1 count) while triage volume > 0. Never CRITICAL on a single-run read — needs the 2-consecutive-run confirmation from the prior scorecard's OH-STATE block.

## OH-1.2 — Signal-Born Task Age in BACKLOG

```bash
jq '[.task_board.active_sprints[].tasks[]? | select(.origin_signal_id != null and .status == "BACKLOG")
     | {task_id, created_at, age_days: ((now - (.created_at | fromdateiso8601)) / 86400)}]' docs/data/orch/orch-state.json
```
Read-only — same boundary system-auditor D-FLEET §2b already established (never writes `.task_board`).
**Flag:** `MED` at P50 age > 5d; `HIGH` at P90 > 14d. Report count + oldest `task_id`.

## OH-1.3 — Anomaly-Task-Bridge (ATB) Liveness — CORROBORATION-GATED

```bash
jq '[.signal_queue.rows[] | select(.type == "repair_task_request")] | length' docs/data/orch/orch-state.json
ls docs/signals/atb-*.json 2>/dev/null | wc -l
```
**Corroboration box** (`feedback_false_infra_failure_corroboration_gate` + `feedback_internal_consistency_is_not_corroboration_check_the_other_plane`): zero ATB rows alone is NOT evidence of a broken bridge. Plane 1 (ATB row count) must be corroborated against an INDEPENDENTLY-COMPUTED plane 2 — NOT a re-slice of plane 1's own result set:

```bash
# Plane 2 — independent aggregate: NEW-row age for auditor-sourced rows only (reuses OH-1.6's own computed data, filtered)
jq '[.signal_queue.rows[] | select(.from | startswith("system-auditor")) | select(.status == "NEW")
     | {id, age_hours: ((now - (.ts | fromdateiso8601)) / 3600)}]' docs/data/orch/orch-state.json
```
- Plane 2 shows rows consistently resolved/triaged well under 2h → verdict `INFO "pre-empted by design"` (PO's inline dev-team `:07`/`:37` tick closes NEW auditor rows within ~30min, structurally pre-empting ATB's 2h threshold).
- Plane 2 ALSO shows rows aging past 2h with ATB still silent → promote to `HIGH` ("bridge should have fired and didn't").
- Never call two filters on the SAME `.signal_queue.rows[]` query "corroborated" — plane 2 must be independently computed.

## OH-1.4 — File-Plane Drain Backpressure

```bash
for f in docs/signals/*.json; do jq -e '.from and .to and .type' "$f" >/dev/null 2>&1 || echo "$f"; done | wc -l
```
Threshold source: `docs/agents/dev-team/flow/drain-signals.md` — read the live `> 50` mandatory-full-drain guard from that file (`grep -n "wc -l.*if count"` the guard line), never hardcode `50` here.
**Flag:** `MED` at > 75% of the live guard value; `HIGH` at guard breached.

## OH-1.5 — Queue-Plane Prune Health

```bash
jq '[.signal_queue.rows[] | select(.status | IN("NEW","READ","RESOLVED","SUPERSEDED") | not)] | length' docs/data/orch/orch-state.json
jq '.signal_queue.rows | length' docs/data/orch/orch-state.json
```
Cap source: `.claude/skills/signal-dashboard/SKILL.md` § PRUNE — read the live `200`-row cap from that doc, never hardcode `200` here.
**Flag:** `MED` at > 70% of the live cap; `HIGH` at > 90%.
**Dogfooding note:** this check is the anti-flood guarantee's own subject — see § Anti-Flood Guarantee below.

## OH-1.6 — NEW-Row Max Age Per Recipient

```bash
jq '[.signal_queue.rows[] | select(.status == "NEW")]
    | group_by(.to) | map({to: .[0].to, max_age_hours: (map((now - (.ts | fromdateiso8601)) / 3600) | max)})' docs/data/orch/orch-state.json
```
**Flag:** `MED` at any recipient > 24h stale.

---

## Anti-Flood Guarantee (dogfoods OH-1.5)

Before writing ANY signal_queue row for a check above, read the current `.signal_queue.rows[]` for an existing `status=NEW` row `from == "orch-sentinel"` with the same `check_id` (e.g. `OH-1.4`). If present → skip re-emit, log `"[ANTI-FLOOD] skip duplicate: {check_id}"` — the scorecard already reflects the current value; the queue does not need a duplicate. This check runs for every dimension (OH-1..OH-4), not only OH-1.

## Output of this sub-flow

Return an in-memory list `[{check_id: "OH-1.1", severity, metric, summary}, ...]` for OH-1.1 through OH-1.6 to the calling `main.md` context. Do NOT write to disk here — `emit-scorecard.md` is the sole writer.
