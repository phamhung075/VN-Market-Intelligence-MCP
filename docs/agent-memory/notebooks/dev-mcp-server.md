# dev-mcp-server -- Notebook

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db (write)
Archive: `docs/archive/notebooks/dev-mcp-server-2026-05-21.md` (tasks 1955a-1967-01 archived)

## Working Memory

### Task 1968b1 — get_agent_signals hours_back param (2026-05-21, DONE)

**Change:**
- `agentSignalStore.ts` — added `hoursBack?: number` to `GetSignalsOptions`. SQL query gains `AND s.created_at >= datetime('now', '-N minutes')` when set.
- `agentSignalTools.ts` — added `hours_back: z.coerce.number().positive().optional()` to MCP tool schema. Passed to store as `hoursBack`.
- `.claude/tools/list/get_agent_signals.md` — parameter table updated; L-4 consolidation pattern documented.

**Tests:** `1968b1-get-agent-signals-hours-back.test.ts` — 7/7 GREEN. AC-1 Zod schema, AC-2 filter excludes old signals, AC-3 default backward-compat, AC-4 6h/360-min window, AC-5 from_agent combo. tsc 0 errors. Full suite: 9356 pass / 283 fail (283 = pre-existing BCTC, zero regression).

**Commit:** 4fff6cbb

**Signal:** `docs/signals/dev-mcp-server-1968b1-param-ready.json` → agent-father (ungates phase 2 SELF_SIGNALS_CACHE)

Zone health: get_agent_signals now supports hours_back lookback; L-4 consolidation prereq COMPLETE | HEALTHY

---

### Task 1967-01 — alertSource enum gap: crisis_velocity (2026-05-21, DONE)

**Change:** `alertVerdictTools.ts:30-38` — added `"crisis_velocity"` to Zod enum (8 values total). Tool description updated. `.claude/tools/list/write_alert_verdict.md` updated.

**Tests:** 5/5 GREEN (1967-01 suite) + 15/15 related suite. tsc 0 errors.

**Signal:** `docs/signals/dev-mcp-server-1967-01-done.json` → qa.

Zone health: alertSource enum exhaustive (8 values); alert-commander persists legal_risk + crisis_velocity | HEALTHY

---

### Task 1965b — TASKS.md Janitor cron 03:00Z (2026-05-21, DONE)

**Change:** `tasksMdJanitorJob.ts` (new, ~340L) — daily 03:00 UTC D4 audit. Calls `listHeldTasks`, parses TASKS.md, cross-checks Owner+Status, reads pipeline-state.json, git-commit window detect. BUG telegram 7d dedup. Smoke: 12/12 PASS. Commit: fc398b8a.

Zone health: 9662 tests / 897 files. Bun v1.3.13 C++ crash post-test is known bug | HEALTHY

---

### Carry-over

- 283 pre-existing BCTC PDF parsing test failures — BCTC freeze active, do not touch
- Bun v1.3.13 C++ panic after full suite run is a known upstream bug (exit code 0, tests all pass)
- LanceDB ~29GB > DISK_THRESHOLD_GB(20) — diskUsageAlertJob will fire on next hourly tick (correct behavior, shipped 1959-watchdog-5)
