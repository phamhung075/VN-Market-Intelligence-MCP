---
name: signal-dashboard
description: SSOT protocol for cowork agent signal communication via docs/data/orch/orch-state.json .signal_queue.rows[]. Covers write, read, ack, close, and prune operations. READ uses two-phase delta-read to eliminate full-file token cost. HSC-7 — PRUNE now evicts to cold file; signal_queue.archive[] lane removed.
---
<!-- size-justification: ≤120L — hot-path only; Payload Pointer Discipline + Docs-to-read table moved to reference.md (load when writing large-payload signals or routing by type). UC-ASL-P6 2026-07-31 (0 new lines): Write protocol line lengthened in place — was citing a bare temp-file-then-rename pattern (docs/architecture-briefs/2026-06-01-orch-state-consolidate.md §2.3, pre-orch-apply.sh) which contradicted this file's own CONCURRENT WRITERS CAS-guard mandate 2 sections below; now names scripts/orch-apply.sh directly, matching dashboard-protocol.md's WRITE procedure (step 4) which already routed through it correctly. FIX-COLDEVICT-MALFORMED-TS-CATCH0-EVICTS-FRESH-SIGNAL-ROWS 2026-08-01 (0 new lines): WRITE block `ts` field pinned to explicit second-precision format — the prior "<ISO-8601 UTC compact>" wording did not pin seconds and was readable as permitting minute-precision, which is exactly the shape that defeated orch-cold-evict.sh's age gate (jq fromdateiso8601 throws on it). FIX-PO-TRIAGE-SIGNALS-TABLE-MATCHES-ZERO-LIVE-SIGNAL-TYPES 2026-08-01 (+2 lines): Receivers row for `po` gains cowork-team/dev-team (the two actual largest live senders, previously undeclared); ACK/CLOSE gains the `triaged`/`RETRACTED` status admission + a flagged TERMINAL_SIGNAL_STATUSES eviction gap (follow-up, not fixed here). Canonical Signal types table (below) deliberately left as-is — full live type list now lives in docs/agents/po/flow/triage-signals.md § Live .signal_queue.rows[] inbox, this table stays a non-exhaustive quick-reference to respect the ≤120L cap. -->

# Signal Dashboard — Communication Skill

**File:** `docs/data/orch/orch-state.json` **section:** `.signal_queue`
**Rule:** This section is the SSOT inbox for cowork agents. Dev-team pipeline (`signals.db` + JSON) is separate — do NOT replace it. The signal_queue complements it for cowork-to-cowork visibility.
**Write protocol:** Every write to orch-state.json MUST route through the CAS-guarded wrapper `bash "$PROJECT_ROOT/scripts/orch-apply.sh"` (see `docs/policies/dev-standards.md` § CANONICAL: Orch-state gated write wrapper SSOT-W1-ORCH-APPLY-WRAPPER) — NEVER a raw temp-file-then-rename. Read full file → modify only `.signal_queue` section → pipe the candidate through `orch-apply.sh` (validates + CAS-guards + atomically renames in one step). NEVER overwrite sibling sections (`.head`, `.task_board`, `.narrative`).

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
| `po` | tran-ngoc-bau, agents-architect, system-auditor, cowork-team, dev-team (measured live 2026-08-01: cowork-team + dev-team are the two largest actual senders — 100+/132 hot rows — undeclared until this fix) |
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
  "ts": "<ISO-8601 UTC, seconds MANDATORY: YYYY-MM-DDTHH:MM:SSZ — no minute-only, no fractional>",
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

→ Full write procedure (including mandatory POST-WRITE read-back self-check): `.claude/skills/signal-dashboard/dashboard-protocol.md § WRITE`
→ Payload >120 chars or sprint-kickoff signals: `.claude/skills/signal-dashboard/reference.md § Payload Pointer Discipline`

> **POST-WRITE READ-BACK CONTRACT (mandatory — no exceptions):** After every atomic write, assert the new row `id` is a member of `.signal_queue.rows[]`. If absent → FAIL LOUD: log `[SIGNAL-ROW-ASSERT] FAIL: row '{id}' NOT found in .signal_queue.rows[]` + emit BUG-channel Telegram. NEVER report "row written" if the read-back check was not executed or returned 0. This kills the false-green class (confirmed orphan-key bug 2026-06-18: keys 0,1,2,3,5 accumulated; key "3" held a CRITICAL db_integrity_breach off-board ~1.5d).

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
- **Extended statuses (admitted, PO-only, decided 2026-08-01 per FIX-PO-TRIAGE-SIGNALS-TABLE-MATCHES-ZERO-LIVE-SIGNAL-TYPES AC-4):** `"triaged"` (disposition recorded — carries `disposition`/`triaged_at`/`triaged_by`; treat as equivalent to `RESOLVED` for downstream consumers) and `"RETRACTED"` (verified false positive, no action taken). Both were live on 127+3 of 132 hot `to=po` rows with zero prior doc backing before this fix — chosen over rewriting PO's writing flow because the richer audit trail is already load-bearing. **KNOWN GAP, not fixed by this doc:** `scripts/orch-cold-evict.sh`'s `TERMINAL_SIGNAL_STATUSES` default (`READ,RESOLVED,SUPERSEDED,ACUTE-RESOLVED-ROOT-TRACKED`) omits both → every `triaged`/`RETRACTED` row is stuck in the hot file forever (0/130 evicted, confirmed live). Needs a follow-up code fix (developer, `scripts/orch-cold-evict.sh`) to add both to that default before the 200-row cap is threatened.

---

## PRUNE — MANDATORY after every drain/consume cycle (HSC-7)

Evict terminal rows to cold archive via `scripts/orch-cold-evict.sh` (NOT inline `archive[]` — lane removed).

**Criteria:** status IN (`READ`, `RESOLVED`, `SUPERSEDED`) AND row `ts` older than 24h.

```bash
bash "$PROJECT_ROOT/scripts/orch-cold-evict.sh"
# Script evicts matching signal_queue.rows[] → docs/data/orch/archive/YYYY-MM.json (append-only)
# Removes evicted rows from hot file .signal_queue.rows[] atomically.
# signal_queue.archive[] is always fully cleared by the script (RC-1 fix: inline archive = dead weight).
```

**NEW rows are NEVER pruned.** Eviction failure → log BUG; skip prune; do not fail the drain cycle.

**Full-history audit:** Historical signal rows live in `docs/data/orch/archive/YYYY-MM.json` (cold file).
System-auditor forensic scans MUST load the cold file lazily (never load in hot planning path).

Max 200 rows in `.signal_queue.rows[]` — if approaching limit without PRUNE running, call script immediately.

→ Full prune procedure (including inline-jq equivalent): `.claude/skills/signal-dashboard/dashboard-protocol.md § PRUNE`

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
