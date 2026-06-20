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

---

## [QA] Review Record

**Verdict: APPROVED**
**QA agent:** qa
**Reviewed at:** 2026-06-21T00:00:00Z
**Commit:** bfdb8c69

### Gate Results (live, independently run)

**Syntax/lint**
- `node --check scripts/agents-flow/drain-signals.js` → EXIT 0
- `bash -n scripts/db-integrity-history-append.sh` → EXIT 0

**Gate 1 — drain with state file at new home**
- `node scripts/agents-flow/drain-signals.js` output: `[drain-signals] inbox empty — nothing to drain / inserted=0 pruned_files=0 / db_count=1` EXIT 0
- `jq 'length' docs/data/db-integrity-history.json` → 9 (entries intact)
- `docs/signals/processed/` grep for db-integrity-history → NO_COPY_IN_PROCESSED
- PASS

**Gate 2a — no-shape probe `{}`**
- Probe `docs/signals/_qa_probe_noshape.json` = `{}` dropped in inbox
- drain output: `[drain-signals] SKIP non-signal shape: _qa_probe_noshape.json (no from/type — state file or unknown format; leaving in inbox)`
- Probe still present in inbox after drain — PASS
- Probe cleaned up after gate

**Gate 2b — real-shaped probe**
- Probe `docs/signals/_qa_probe_real.json` = `{"from":"qa","type":"test","to":"po","payload":{},"createdAt":"2026-06-21T00:00:00Z"}`
- drain output: `_qa_probe_real.json → routed-to-po / inserted=1 pruned_files=0 / db_count=1`
- Probe moved to processed/ (inbox copy absent) — PASS
- Both probes (inbox + processed/ copy) cleaned up after gate

**Gate 3 — append script**
- `bash scripts/db-integrity-history-append.sh` output: `{ "ok": true, "scan_ts": "2026-06-20T23:51:46Z", "history_len_before": 9, "history_len_after": 10, "cap": 200 }`
- `jq 'length' docs/data/db-integrity-history.json` → 10 (grew from 9) — PASS

**Stale-ref sweep**
- `grep -rn "signals/db-integrity-history" scripts/ .claude/ apps/ docs/agents/` → EXIT 1 (0 matches) — PASS

**Commit hygiene**
- `git show --name-status bfdb8c69`: 9 files
  - 5 files = task-scope (cron-db-data-integrity.md, cron-system-auditor.md, docs/data/db-integrity-history.json, docs/signals/db-integrity-history.json deleted, scripts/agents-flow/drain-signals.js, scripts/db-integrity-history-append.sh)
  - 2 files = handoff + dev memory chore (docs/handoffs/FIX-DRAIN-STATEFILE-DATALOSS.md, docs/agent-memory/decisions/sprint-FE-PAGE-REORG-dev-mcp-server.md, docs/agent-memory/notebooks/dev-mcp-server.md)
  - All within fix scope — no unrelated cowork churn swept — PASS

**Smart-Skip applied:** JS/shell-only fix — no bun test, tsc, DDD scan, security scan, or mock-guard applicable.
**BCTC eval:** N/A (no BCTC report in scope).
