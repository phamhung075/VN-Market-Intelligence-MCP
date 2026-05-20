# Dev Team — Step 0a: Drain `docs/signals/`

**Parent flow:** `.claude/flows/dev-team/main.md` (Step 0a dispatcher)

Spec: `docs/architecture-briefs/2026-05-11-signal-dedup-sqlite.md` | DB degradation: `docs/protocols/agent-chaining-protocol.md` § Cross-Team Signal Directory

**Rationale:** Sources may re-emit across cycles. In-memory dedup covers only the current pass. Fingerprint check against `signals_processed` in `docs/signals/signals.db` gates cross-cycle duplicates.

---

**0a-D — Drain `docs/signals/DASHBOARD.md` (cross-team inbox):**

Read DASHBOARD.md per skill `.claude/skills/signal-dashboard/SKILL.md` § READ.
Find `## po` section (or any dev-team-addressed section). Collect `status=NEW` rows.

→ Load skill: `.claude/skills/task-lock/SKILL.md`

For each NEW row:
  row_key = "dash:" + section_name + ":" + row.id

  result = call_tool(server="vn-market", tool="task_claim", arguments={
    task_id:     row_key,
    task_kind:   "dashboard-row",
    owner_agent: "dev-team",
    ttl_seconds: 1800,
    payload:     '{"row_id":"' + row.id + '","from":"' + row.from + '","type":"' + row.type + '"}'
  })

  if not result.claimed:
    log "[dev-team] SKIP dashboard row " + row.id + " — held by " + result.current_holder.owner_agent
    continue                            // Do NOT add to pendingSignals[], do NOT mark READ

  // Claim succeeded — proceed with existing drain logic
  load payload if present → append to pendingSignals[] with source="dashboard"
  mark row NEW → READ
  call_tool("task_release", { task_id: row_key })   // release per-row claim immediately after row consumed

If DASHBOARD.md missing or no dev-team section → log "[dev-team] dashboard skip" and continue. Never fail-loud.

---

**0a-0 — Open signals.db:**
```
db_path = docs/signals/signals.db
try: open READ_WRITE → db_available = true
catch (ENOENT | SQLITE_CANTOPEN | locked after 3×200ms):
  db_available = false
  log: "[dev-team] WARN: signals.db unavailable — skipping drain, inbox retained for retry"
  pendingSignals = [] | files untouched | continue with empty signals
```

**0a-1 — Glob and iterate** (`docs/signals/*.json`, sorted by `createdAt` ascending):

For each file:
1. Read JSON. Log: `"[dev-team] Signal: {from} → {to} | type={type} | priority={priority}"`
2. **Fingerprint check:** `sha256(from + type + JSON.stringify(payload) + createdAt)`
   - Match in `signals_processed` → skip PO routing | mv to `processed/{name-replay}.json` | no INSERT
   - No match → dual-record write:
     - **Filesystem:** append `{fingerprint, processedAt, processedBy:"dev-team", result}` then mv to `docs/signals/processed/{filename}` — result ∈ {`routed-to-po`, `skipped-duplicate`, `skipped-duplicate-replay`, `skipped-stale`}
     - **DB INSERT** into `signals_processed(fingerprint, from_agent, to_agent, type, priority, payload, created_at, processed_at, processed_by, result, source_filename)` — INSERT fail is non-fatal (file move is SSOT)
3. Append to `pendingSignals[]`

**0a-2 — Prune** (after batch, both stores):
```sql
DELETE FROM signals_processed WHERE processed_at < datetime('now', '-7 days');
```
Delete `docs/signals/processed/` files with `processedAt` older than 7 days.

**Escape hatches:** Delete `processed/` copy + DB row → re-routes on next cycle. Or bump `createdAt` → new fingerprint.

**0a-3 — Signal routing table** (applied before handing off to Step 1):

| Signal `type` | From | Route | Notes |
|---|---|---|---|
| `audit-handoff` | `tran-ngoc-bau` | PO Step 0-TNB | payload = handoff file path |
| `brief_complete` | `agents-architect` | PO Step 0-SIG | payload = architecture brief path |
| `zone_missing_tier3` | `dev-team` | PO Step 0-SIG | payload = `{taskId, files, suggestedZone}` — PO opens zone-fix task next cycle |
| any other | any | PO Step 0-SIG | PO decides; unknown types logged + WORK notified |

All routed signals are appended to `pendingSignals[]` regardless of type — routing annotation is informational only; PO's `triage-signals.md` is the authoritative dispatch handler.

Non-empty `pendingSignals` feeds into Step 1 (PO Triage).
