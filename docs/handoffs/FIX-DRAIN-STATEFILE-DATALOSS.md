# FIX-DRAIN-STATEFILE-DATALOSS

**Status:** REVIEW
**Type:** FIX | Size: S | rebuild_required: No
**Title:** drain-signals.js sweeps state file `db-integrity-history.json` → silent history wipe.

---

## [Developer] Implementation Record

- **Service:** scripts (outside apps/mcp-server/ zone — infrastructure scripts fix)
- **Files modified:**
  - `docs/signals/db-integrity-history.json` → `docs/data/db-integrity-history.json` (git mv, 8 entries preserved, 33KB intact)
  - `scripts/db-integrity-history-append.sh` L12 — HIST default path updated to `docs/data/db-integrity-history.json`
  - `scripts/agents-flow/drain-signals.js` — added non-routable-shape guard (Array or no from/source/type/signal_type → SKIP with log)
  - `.claude/commands/crons/cron-db-data-integrity.md` — 4 refs repointed to `docs/data/db-integrity-history.json`
  - `.claude/commands/crons/cron-system-auditor.md` — 1 ref repointed to `docs/data/db-integrity-history.json`
- **Tests written:** N/A (no test suite for scripts/)
- **Git commits:** see RETURN block
- **Type check:** N/A (plain JS / bash scripts)
- **bun test:** N/A — no mcp-server zone changes
- **Tool count:** unchanged (no mcp-server changes)
- **Scheduler count:** unchanged
- **Docs updated:** `.claude/commands/crons/cron-db-data-integrity.md`, `.claude/commands/crons/cron-system-auditor.md`
- **Graphify:** skipped (no architecture docs impacted)

---

## Verification Gate Output

**Gate 1 — drain with state file at new home:**
```
[drain-signals] inbox empty — nothing to drain
inserted=0 pruned_files=0
db_count=1
```
`docs/data/db-integrity-history.json` — 8 entries, 33125 bytes, intact. `docs/signals/processed/` received NO `db-integrity-history.json` copy.

**Gate 2a — non-signal shape probe (`{}`):**
```
[drain-signals] SKIP non-signal shape: _shapeguard_probe.json (no from/type — state file or unknown format; leaving in inbox)
[drain-signals] inbox empty — nothing to drain
inserted=0 pruned_files=0
db_count=1
```
Probe file left in inbox (not moved, not unlinked). PASS.

**Gate 2b — real-shaped signal probe (`{"from":"x","type":"y","to":"po","payload":{}}`):**
```
[drain-signals] SKIP non-signal shape: _shapeguard_probe.json (no from/type — state file or unknown format; leaving in inbox)
_shapeguard_real.json → routed-to-po
inserted=1 pruned_files=0
db_count=1
```
Real signal still routed normally. PASS. Both probes cleaned up.

**Gate 3 — append script against new home:**
```
{ "ok": true, "scan_ts": "2026-06-20T23:47:49Z", "history_len_before": 8, "history_len_after": 9, "cap": 200 }
```
`jq 'length' docs/data/db-integrity-history.json` → 9. Entries grew. PASS.

**Grep confirm — zero stale refs in edited files:**
```
grep -n "signals/db-integrity-history" cron-db-data-integrity.md cron-system-auditor.md db-integrity-history-append.sh → 0 matches
```

---

## RETURN

```
DONE: FIX-DRAIN-STATEFILE-DATALOSS — scripts-only fix, no mcp-server zone change
CHANGED: [docs/signals/db-integrity-history.json→docs/data/db-integrity-history.json, scripts/db-integrity-history-append.sh, scripts/agents-flow/drain-signals.js, .claude/commands/crons/cron-db-data-integrity.md, .claude/commands/crons/cron-system-auditor.md]
REBUILD REQUIRED: No
STATUS: REVIEW
NEXT: qa | verify gate 1-3 output above; confirm no stale refs remain in repo
HANDOFF: docs/handoffs/FIX-DRAIN-STATEFILE-DATALOSS.md
PIPELINE: continue
```
