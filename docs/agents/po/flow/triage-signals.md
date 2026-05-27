# PO — Step 0-SIG: Triage pendingSignals[]

**Parent flow:** `docs/agents/po/flow/main.md` (Step 0-SIG dispatcher — MANDATORY when dev-team passes signals)

The dev-team Step 0a drain hands `pendingSignals[]` to PO. Each signal has shape `{from, to, type, payload, priority, createdAt}` where `payload` is usually a file path. PO must read each payload and route accordingly — otherwise the signal is silently lost.

For each signal in `pendingSignals[]`:

| Signal `type` | From | Action | Routing in Step 1 BATCH |
|---|---|---|---|
| `audit-handoff` | `tran-ngoc-bau` | Already covered by Step 0-TNB (reads `docs/handoffs/tnb-audit-latest.md`) | findings → FIX / SPRINT-* |
| `brief_complete` | `agents-architect` | Read `payload` (a `docs/architecture-briefs/*.md`). Brief specifies which files/agents change. | If brief targets `.claude/agents/*` or `docs/agents/*` → UNBLOCK with `route_to: agent-father`. If brief targets `apps/flow/*` code → SPRINT-S/M/L depending on scope. Propagate target zone (e.g. `apps/stock-price/`) into the sprint so architect inherits zone hint. |
| `news_impact` / `price_anomaly` / `bctc_signal` / `fundamental_*` | cowork agents | Cowork signals are usually for `alert-commander`, not PO. If `to=po` was set explicitly, read payload and decide: investment-thesis update (skip — not dev work) or data-pipeline bug (FIX task with `zone: apps/<service>/`). | rarely actionable; default skip with notebook log |
| `zone_missing_tier3` | `dev-team` | Open a CHORE task pre-tagged `zone: <suggestedZone>` (BATCH type CLEAN). **Before inserting:** check `docs/TASKS.md` for an existing open task with `taskId` in title (dedup on `taskId` field — same guard used in drain-signals). If duplicate found → skip, log `"[po] zone_missing_tier3: task {taskId} — duplicate, skipped"`. If new: create CHORE `"Fix missing zone on task {taskId}"` with `zone: {payload.suggestedZone}` assigned to dev-team next cycle, mark signal processed. If `payload.suggestedZone` absent → emit SPIKE to architect for zone inference. Log `"[po] zone_missing_tier3: task {taskId} — CHORE created zone:{suggestedZone}"`. | CHORE/CLEAN with `zone: {suggestedZone}` OR SPIKE to architect |
| `zone_health_report` | `dev-<service>` | Read `payload.findings[]` and `payload.severity`. If `severity=critical` → open FIX task with `zone: {payload.zone}`. If `severity=warn` → add to `pendingObservations[]` for sprint planning. If `severity=ok` → log and skip. Batch all zone_health_report signals from the same week into one sprint review entry. | FIX (critical) OR pendingObservations (warn) OR skip (ok) |
| `implementation_complete` | `agent-father` | Acknowledgment that a brief track shipped. Log `"[po] track {payload.track} of {payload.brief} acknowledged — {N} files changed"`. No task creation. Append to notebook `pendingObservations[]` if `payload.summary` flags a follow-up (e.g. "needs verification"). Signal moved to processed/ by dev-team — no further action. | skip (acknowledgment-only) |
| any unknown `type` | any | Log `"[po] Unknown signal type {type} from {from} — payload retained"` and skip. Notify WORK so the type can be added to this table. | skip; signal already moved to processed/ by dev-team |

ACK each processed signal by writing the result into your notebook entry (no file ACK — the signal is already in `signals_processed` DB).

If `pendingSignals[]` is empty, log `"[po] No pending signals"` and proceed to Step 0 Channel Audit.
