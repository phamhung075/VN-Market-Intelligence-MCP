# dev-mcp-server -- Notebook

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db (write)
Archive: `docs/archive/notebooks/dev-mcp-server-2026-05-21.md` (tasks 1955a-1967-01 archived)

## Working Memory

### Task 1968c-P03 — get_agent_signals signal_type filter (2026-05-21, DONE)

**Change:**
- `agentSignalStore.ts` — added `signalType?: string | null` to `GetSignalsOptions`. `getSignals()` gains `AND s.signal_type = '...'` SQL clause when signalType is non-null/non-empty. SQL injection guarded via `replace(/'/g, "''")`.
- `agentSignalTools.ts` — added `signal_type: z.string().nullable().optional()` to `get_agent_signals` MCP tool schema. Tool description updated. Handler passes `signalType` to `getSignals()` when non-null.
- `.claude/tools/list/get_agent_signals.md` — parameter table updated with `signal_type` row; new "Key Notes on signal_type" section added.
- `.claude/flows/alert-commander/stage-signals.md` — step 3b updated to use `signal_type="price_anomaly"` + step 3c updated to use `signal_type="chain_catalyst"` with actual `call_tool` blocks and L-9 comment tags.

**Tests:** `1968c-p03-signal-type-filter.test.ts` — 6/6 GREEN (AC-1 schema, AC-2 filter, AC-3 backward-compat, AC-3b null=all, AC-6c invalid→empty, AC-7 payload reduction 50%). tsc 0 errors. Full suite: 9364 pass / 285 fail (285 = pre-existing BCTC freeze).

**Commit:** c3b18e8c

**Signal:** `docs/signals/dev-mcp-server-1968c-p03-done.json` → qa

Zone health: get_agent_signals server-side signal_type filter COMPLETE; alert-commander 3b+3c use typed queries; wire payload reduced 40-60% | HEALTHY

---

### Task 1967-02 — verified_decision SignalTypeSchema enum (2026-05-21, DONE)

**Change:**
- `agentSignalStore.ts:50` — added `"verified_decision"` to `SignalTypeSchema` z.enum (SSOT, 11 values total). Enum is imported by agentSignalTools.ts; no direct edit needed there for the schema.
- `agentSignalTools.ts:180` — updated `signal_type` describe string to list `verified_decision`.
- `.claude/tools/list/post_agent_signal.md:19` — added `verified_decision` to enum column.
- `docs/standards/mcp-tools.md:144` — new row: Alert Commander → All, chain de-dup ack.

**Tests:** `1967-02-verified-decision-enum.test.ts` — 4/4 GREEN (AC-1 enum accepts, AC-2 round-trip, AC-3 regression, AC-4 reject unknown). tsc 0 errors. Full suite: 9358 pass / 285 fail (285 = pre-existing BCTC freeze).

**Commit:** 257d92bf (swept into PM housekeeping commit; all 3 zone files + test included)

**Signal:** `docs/signals/dev-mcp-server-1967-02-done.json` → qa

Zone health: SignalTypeSchema now has 11 values (urgent_news, price_anomaly, cross_validate, suppress, chain_catalyst, fundamental_validation, price_confirmation, verified_chain, signal_feedback, legal_risk, verified_decision). alert-commander chain-ack unblocked | HEALTHY

---

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

### Carry-over

- 285 pre-existing BCTC PDF parsing test failures — BCTC freeze active, do not touch
- Bun v1.3.13 C++ panic after full suite run is a known upstream bug (exit code 0, tests all pass)
- LanceDB ~29GB > DISK_THRESHOLD_GB(20) — diskUsageAlertJob will fire on next hourly tick (correct behavior, shipped 1959-watchdog-5)
