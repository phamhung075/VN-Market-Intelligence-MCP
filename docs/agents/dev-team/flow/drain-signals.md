<!-- size-justification: 124L — signal drain SSOT (mandatory-persist guard, 0a-D cross-team inbox drain, 0a-0..3 fingerprint+route logic, routing table). All sections are load-bearing; no safe extraction without losing trigger→action traceability. BGFAN-1 2026-06-07: header comment added (+2L). CANON-SCRIPT 2026-06-07: scripts/agents-flow/drain-signals.js pointer (+3L). -->
# Dev Team — Step 0a: Drain `docs/signals/`

<!-- BGFAN-1: this file delegates spawn to drain-esc-dispatch.md (ESC-DISPATCH) which carries run_in_background=true. No direct Agent() call here. Canonical rule → docs/protocols/agent-chaining-protocol.md § Background Spawn Mandate -->

**MANDATORY PERSIST GUARD:** Before Step 0a-D, check:
1. `ls docs/signals/*.json | wc -l` → if count > 50: full drain (§0a-1 + DB INSERT + mv) is REQUIRED this tick.
2. `stat -f "%Sm" docs/signals/signals.db` → if mtime > 24h ago: DB write is REQUIRED this tick.
Neither is optional. Curate-and-route without persist+commit = incomplete drain. After drain, commit ONLY these paths: `docs/signals/processed/`, `docs/signals/*.json` (deletions), `docs/signals/signals.db`, `docs/data/orch/orch-state.json` (signal_queue section only).

**Parent flow:** `docs/agents/dev-team/flow/main.md` (Step 0a dispatcher)

Spec: `docs/architecture-briefs/2026-05-11-signal-dedup-sqlite.md` | DB degradation: `docs/protocols/agent-chaining-protocol.md` § Cross-Team Signal Directory

**Rationale:** Sources may re-emit across cycles. In-memory dedup covers only the current pass. Fingerprint check against `signals_processed` in `docs/signals/signals.db` gates cross-cycle duplicates.

---

**0a-D — Drain `docs/data/orch/orch-state.json` `.signal_queue` (cross-team inbox):**

Read `.signal_queue.rows[]` per skill `.claude/skills/signal-dashboard/SKILL.md` § READ.
Find rows where `to` matches `po` or any dev-team-addressed agent. Collect `status=NEW` rows.

→ Load skill: `.claude/skills/task-lock/SKILL.md`

For each NEW row:
  row_key = "dash:signal_queue:" + row.id

  # SAFE-JSON: build payload with jq --arg (bound params) — NEVER interpolate row fields into a shell string.
  # INVARIANT: agent-authored fields (row.id / row.from / row.type) MUST NOT appear in a /bin/sh command line.
  # Pattern: echo '{}' | jq --arg rid "$row_id" --arg frm "$row_from" --arg typ "$row_type" \
  #           '{row_id:$rid,from:$frm,type:$typ}' > /tmp/drain_payload.json
  # Then pass the file content (or the JSON object directly) to call_tool arguments — no shell interpolation.
  claim_payload = {row_id: row.id, from: row.from, type: row.type}   # structured object, not a shell-built string

  result = call_tool(server="vn-market", tool="task_claim", arguments={
    task_id:     row_key,
    task_kind:   "dashboard-row",
    owner_agent: "dev-team",
    ttl_seconds: 1800,
    payload:     JSON.stringify(claim_payload)   // live schema requires a SERIALIZED JSON STRING ("Expected string, received object" — verified 2026-06-05); build the object with bound params first, stringify last — never shell-concatenate
  })

  if not result.claimed:
    log "[dev-team] SKIP dashboard row " + row.id + " — held by " + result.current_holder.owner_agent
    continue                            // Do NOT add to pendingSignals[], do NOT mark READ

  // Claim succeeded — proceed with existing drain logic
  load payload if present → append to pendingSignals[] with source="dashboard"
  mark row NEW → READ
  call_tool(server="vn-market", tool="task_release", arguments={ task_id: row_key })   // release per-row claim immediately after row consumed

If `orch-state.json` missing or `.signal_queue.rows` absent → log "[dev-team] signal_queue skip" and continue. Never fail-loud.

**0a-D-PRUNE — MANDATORY prune after signal_queue row consumption:**

After all NEW rows from 0a-D are marked READ, per skill `.claude/skills/signal-dashboard/SKILL.md` § PRUNE:
```
1. Archive rows where status = RESOLVED or READ + ts < now() - 48h:
   Move to orch-state.json .signal_queue.archive[] (atomic write per §2.3)
2. Remove archived rows from .signal_queue.rows[]
3. Update .signal_queue._updated_at + .signal_queue._updated_by
4. Update dashboard_section_cache in docs/data/orch/orch-state.json .dashboard_section_cache:
   {section_name: "po", last_mtime: <new mtime of orch-state.json>, last_linecount: <rows count>}
5. Commit (atomic temp→rename): git add docs/data/orch/orch-state.json
           git commit -m "chore(signals): drain + prune {ts}"
```
NEW rows are NEVER pruned.
Skip prune gracefully if orch-state.json was missing/skipped in 0a-D.

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

**CANONICAL SCRIPT (preferred):** `node scripts/agents-flow/drain-signals.js` executes §0a-1 + §0a-2 in one shot (fingerprint dedup, `_processed` append, mv to `processed/`, DB INSERT, 7-day prune; injection-safe — sqlite3 fed via stdin). Read its stdout report into `pendingSignals[]` routing. The manual spec below remains the SSOT the script MUST match; fall back to it only if node is unavailable. The script does NOT cover §0a-D (queue rows) or the commit — those stay in this flow.

For each file:
1. Read JSON. Log: `"[dev-team] Signal: {from} → {to} | type={type} | priority={priority}"`
2. **Fingerprint check:** `sha256(from + type + JSON.stringify(payload) + createdAt)`
   - Match in `signals_processed` → skip PO routing | mv to `processed/{name-replay}.json` | no INSERT
   - No match → dual-record write:
     - **Filesystem:** append `{fingerprint, processedAt, processedBy:"dev-team", result}` then mv to `docs/signals/processed/{filename}` — result ∈ {`routed-to-po`, `skipped-duplicate`, `skipped-duplicate-replay`, `skipped-stale`}
     - **DB INSERT** into `signals_processed(fingerprint, from_agent, to_agent, type, priority, payload, created_at, processed_at, processed_by, result, source_filename)` — INSERT fail is non-fatal (file move is SSOT)
3. Append to `pendingSignals[]`

**0a-2 — Prune** (after batch, both stores):
```sh
# processed_at stored compact-ISO YYYYMMDDTHHMMSSZ — use lexicographic compare, NOT datetime()
cutoff=$(date -u +%Y%m%dT%H%M%SZ -d '7 days ago' 2>/dev/null || date -u -v-7d +%Y%m%dT%H%M%SZ)
sqlite3 docs/signals/signals.db "DELETE FROM signals_processed WHERE processed_at < '${cutoff}';"
```
Delete `docs/signals/processed/` files with `processedAt` (field value) older than 7 days — field compare, not mtime, correct as-is.
**Canonical script:** `scripts/agents-flow/drain-signals.js` (shipped 2026-06-07) implements §0a-1 + §0a-2 and MUST stay in sync with this spec. Edit the spec first, then the script.

**Escape hatches:** Delete `processed/` copy + DB row → re-routes on next cycle. Or bump `createdAt` → new fingerprint.

**0a-3 — Signal routing table** (applied before handing off to Step 1):

| Signal `type` | From | Route | Notes |
|---|---|---|---|
| `audit-handoff` | `tran-ngoc-bau` | PO Step 0-TNB | payload = handoff file path |
| `brief_complete` | `agents-architect` | PO Step 0-SIG | payload = architecture brief path |
| `zone_missing_tier3` | `dev-team` | PO Step 0-SIG | payload = `{taskId, files, suggestedZone}` — PO opens zone-fix task next cycle |
| `improvement_proposal_lane_b` | `po` | PO Step 0-SIG | payload = proposal doc path. PO triage-signals.md creates the SPRINT-S/M batch entry and routes through the standard po→ba→architect→pm→dev-*→qa chain. Scope field in proposal doc determines SPRINT-S vs SPRINT-M. `SELF_IMPROVE_AUTO_DISPATCH` is per-dispatch-path, default `false` per path until QA records GATE-PROOF-1..5 for that path (Phase 2 / SIG-IMPL-GATE — not implemented here). |
| `repair_task_request` | `system-auditor` | PO Step 0-SIG | anomaly→task bridge; PO triage-signals.md is authoritative handler (creates {check_id}-FIX BACKLOG) |
| `esc-deep-dive-request` | `bctc-analyst` | ESC-DISPATCH | dev-team dispatches model=opus bctc-analyst deep-dive; guard released after spawn |
| any other | any | PO Step 0-SIG | PO decides; unknown types logged + WORK notified |

**ESC-DISPATCH** (type=`esc-deep-dive-request`): handled before PO hand-off, inline this drain tick.
→ Run sub-flow: `docs/agents/dev-team/flow/drain-esc-dispatch.md`

All routed signals are appended to `pendingSignals[]` regardless of type — routing annotation is informational only; PO's `triage-signals.md` is the authoritative dispatch handler.

Non-empty `pendingSignals` feeds into Step 1 (PO Triage).
