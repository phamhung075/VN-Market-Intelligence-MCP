<!-- size-justification: ≤120L — hot-path only; Payload Pointer Discipline + Docs-to-read table moved to reference.md (load when writing large-payload signals or routing by type) -->
---
name: signal-dashboard
description: SSOT protocol for cowork agent signal communication via docs/data/orch/orch-state.json .signal_queue.rows[]. Covers write, read, ack, close, and prune operations. READ uses two-phase delta-read to eliminate full-file token cost.
---

# Signal Dashboard — Communication Skill

**File:** `docs/data/orch/orch-state.json` **section:** `.signal_queue`
**Rule:** This section is the SSOT inbox for cowork agents. Dev-team pipeline (`signals.db` + JSON) is separate — do NOT replace it. The signal_queue complements it for cowork-to-cowork visibility.
**Write protocol:** Every write to orch-state.json MUST use atomic temp-file-then-rename (see `docs/architecture-briefs/2026-06-01-orch-state-consolidate.md §2.3`). Read full file → modify only `.signal_queue` section → write atomically. NEVER overwrite sibling sections (`.head`, `.task_board`, `.narrative`).

> **CONCURRENT WRITERS — WF-2 (WORKFLOW-FLUIDITY):** Three classes write `.signal_queue.rows[]` concurrently:
>   1. **dev-team** (hourly drain at :07)
>   2. **cowork-team** (every 15 min)
>   3. **system-auditor Tier-2** (0 every 4h)
>
> All three classes collide at :00/4h. TS code MUST call `appendSignalQueueRow()` from
> `apps/mcp-server/src/infrastructure/orchStateStore.ts` — that function implements the
> mtime-compare-retry CAS loop (3 retries) which re-reads the file and re-applies the append
> when a concurrent write is detected before the rename.
> Shell/flow code MUST record mtime before read, check mtime again before rename, retry up to
> 3 times if changed. **Never use bare temp→rename without the CAS guard** — last-write-wins
> silently drops the first writer's rows.

---

## Receivers (row `to` field values)

| `to` value | Receives from |
|---|---|
| `po` | tran-ngoc-bau, agents-architect, system-auditor |
| `tran-ngoc-bau` | unified-agent, market-watcher, financial-analyst (methodology flags) |
| `unified-agent` | market-watcher, news-scout, digest-predict |
| `alert-commander` | market-watcher, news-scout |

To add a new receiver: use the `to` field in the row; no file-structure change needed.

---

## WRITE — append a signal row

Row shape: per orch-state.json schema `signal_queue.rows[]`:
```json
{
  "id": "{from[0:3]}-{YYYYMMDDTHHmmss}",
  "ts": "<ISO-8601 UTC compact>",
  "from": "<agent-id>",
  "to": "<agent-id>",
  "type": "<signal-type>",
  "summary": "<≤120 chars — NO raw payload>",
  "severity": "CRITICAL | HIGH | MED | LOW | INFO",
  "status": "NEW",
  "payload_ref": "<path-to-handoff-file or null>"
}
```
One row per signal. `summary` max 120 chars — strip to fit. `payload_ref` = file path or `null`.

→ Full write procedure: `.claude/skills/signal-dashboard/dashboard-protocol.md § WRITE`
→ Payload >120 chars or sprint-kickoff signals: `.claude/skills/signal-dashboard/reference.md § Payload Pointer Discipline`

---

## READ — two-phase delta-read (0–400 tokens vs full-file)

Phase 1 = stat mtime, skip entirely if unchanged (0 tokens).
Phase 2 = jq filter on `.signal_queue.rows[]` for rows matching `to == my-agent-id` AND `status == "NEW"`, load payload_ref if present, mark READ, update cache.
Cache key: `dashboard_section_cache` in `docs/data/orch/orch-state.json` `.dashboard_section_cache` (dev-team) or spawn-prompt (cowork agents).
No cache → skip Phase 1, go straight to Phase 2. Missing orch-state.json or absent `.signal_queue` → log + skip, never fail-loud.

→ Full read procedure: `.claude/skills/signal-dashboard/dashboard-protocol.md § READ`
→ Docs to load per signal type after READ: `.claude/skills/signal-dashboard/reference.md § Docs to read per signal type`

---

## ACK / CLOSE

- **ACK** (signal received, processing in progress): update row `status: "NEW"` → `"READ"` (atomic write)
- **CLOSE** (signal fully consumed, no further action): update row `status: "READ"` → `"RESOLVED"` (atomic write)
- Modify only the target row's `status` field in `.signal_queue.rows[]` — never overwrite other rows or sections.

---

## PRUNE — MANDATORY after every drain/consume cycle

Archive rows where `status == "RESOLVED" || (status == "READ" && ts < now() - 48h)` to `.signal_queue.archive[]`.
Remove archived rows from `.signal_queue.rows[]`.
Update `.signal_queue._updated_at` + `._updated_by`.
Max 200 rows in `.signal_queue.rows[]` — prune oldest resolved/read first if approaching limit.
NEW rows are NEVER pruned. This step is mandatory, not optional.

→ Full prune procedure: `.claude/skills/signal-dashboard/dashboard-protocol.md § PRUNE`

---

## Signal types (canonical)

| type | Meaning | Common payload_ref |
|---|---|---|
| `audit-handoff` | TNB quality audit complete | `docs/handoffs/tnb-audit-latest.md` |
| `brief_complete` | Architecture brief ready | `docs/architecture-briefs/*.md` |
| `market-signal` | Market anomaly / regime shift | `docs/signals/*.json` |
| `news-impact` | News chain with market impact | `docs/signals/*.json` |
| `system-issue` | Infrastructure problem | null (inline summary only) |
| `methodology-flag` | Agent violated TNB methodology | notebook path |
