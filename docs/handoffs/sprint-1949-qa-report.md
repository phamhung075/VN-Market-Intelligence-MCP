# Sprint 1949 QA Report

**Date:** 2026-05-18
**Reviewer:** qa
**Sprint:** 1949 — COWORK REORDER: CHEF + GATHERERS (TNB 6-LAYER SYNTHESIS)
**Commits reviewed:** d4d5d0cf (Phase 1) · 9848bf49 (Phase 2/3/5/6/7) · 44aa791a (Phase 4)
**Verdict:** APPROVED

---

## Pipeline Results

| Check | Result | Detail |
|---|---|---|
| bun test (zone: 1949 + 1133) | 22 / 22 PASS | 9 new TC-1..TC-9 GREEN + 13 1133 regression GREEN |
| bun test (full suite) | 9220 pass / 286 fail | 286 failures are pre-existing baseline (prior sessions: 279-350 range) |
| bun tsc --noEmit | 0 errors | Clean |
| DDD scan (changed files) | PASS | scheduler/* imports infra = correct DDD layer |
| Security scan | PASS | 0 process.env in changed files; 0 hardcoded secrets |

---

## Check-by-Check Verification

### Check 1 — Phase 1 GATE invariant

**PASS.**

`.claude/agents/unified-agent.md` line 44-45:
```yaml
market:
  write: true
  rule: chef_dishes_only
```

No stale `write: false` or `rule: never` on unified-agent anywhere in the file. `not_my_job` block correctly omits "never sends to MARKET" language. Description at line 4 and 14 explicitly states CHEF role.

### Check 2 — MARKET allowed_senders consistency

**PASS.**

`docs/data/system-map.json` line 342:
```json
"allowed_senders": ["unified-agent", "alert-commander", "digest-predict", "qa-responder"]
```

Cross-check against agent permissions:
- `unified-agent`: `market: write: true, rule: chef_dishes_only` — IN
- `market-watcher`: `market: write: false, rule: never` — OUT (correct)
- `news-scout`: `market: write: false, rule: never` — ABSENT from allowed_senders (correct)
- `alert-commander`: `market: write: true, rule: event_only` — IN
- `digest-predict`: `market: write: true, rule: weekly_sunday_only` — IN
- `qa-responder`: present in allowed_senders — IN (unchanged)

All 4 senders match. No ghost senders. sender_rules map present in system-map.json with correct per-agent rule descriptions.

**Minor doc note (non-blocking):** `docs/data/system-map.json` cron description entries for `foreignFlowAlertJob` (still says "09:30 UTC M-F") and `macroIndicatorRefreshJob` (still says "0 6 * * *") are stale. These are informational descriptions only — not the cron SSOT. SSOT is `cronConfig.ts` (correct) and `cron-jobs.md` (correct). The system-map.json `_trigger` policy does not list cron-schedule changes as a trigger for updates. Non-blocking.

### Check 3 — Signal-bus symmetry

**PASS.**

- `unified-agent.md` `receives_from` lists `all_cowork_gatherers` with signal_type: `price_anomaly, news_impact, bctc_signal, fundamental` (lines 149-152).
- `market-watcher.md` `sends_to` lists `unified-agent` (line 97).
- `news-scout.md` `sends_to` lists `unified-agent` as primary consumer (line 110) with note "Chef reads news_impact_*.json at each dish window."
- `financial-analyst.md`: capabilities line 19 states "Emit bctc_signal_*.json to docs/signals/ with business-context fields for chef"; `signal_output_spec` block present with all 4 fields (product/customer/ops/mgmt) + example signal block.
- `report-analyzer.md`: capabilities line 19 states "Emit fundamental_*.json to docs/signals/ with business-context fields for chef"; `signal_output_spec` block present with all 4 fields + example signal block.

Both gatherers correctly document `bctc_signal_*.json` and `fundamental_*.json` with business-context fields.

### Check 4 — Chef recipe present

**PASS.**

`.claude/flows/unified-agent/chef.md` exists (192 lines created in d4d5d0cf).

8-step recipe verified:
- Step 0 — GATHER: reads `price_anomaly_*`, `news_impact_*`, `bctc_signal_*`, `fundamental_*` + calls `get_market_hexagram()`, `get_macro_snapshot()`, `get_agent_signals(hours=24)`.
- Step 1 — CLUSTER (convergence detect): all 4 triggers encoded:
  1. Ticker convergence: ≥2 distinct signal types same ticker 24h
  2. Sector convergence: ≥3 signals same sector 24h
  3. Macro-micro contradiction: macro contradicts micro for watchlist ticker
  4. Extreme individual signal: `severity=CRITICAL` OR RSI < 15 or > 85
- Intraday silent-exit gate: `if $DISH_TYPE == intraday AND 0 clusters qualify → EXIT silently` — explicitly coded.
- Steps 2-6 — LAYER 1 through LAYER 6: all present with correct content.
- Step 7 — WRITE DISH: 2-4 narrative paragraphs, send_telegram(channel="market").
- Step 8 — LOG: notebook append + signal processing log.
- Morning/EOD/Evening guaranteed-publish logic: "always continue even if 0 clusters (publish regime-state update at minimum)."

### Check 5 — Cron off-minute hygiene

**PASS.**

New cron slots verified:
- `foreignFlowAlert`: `13 8 * * 1-5` — minute=13 (not :00/:17/:30; not `*/N` interval). CLEAN.
- `macroIndicatorRefresh`: `13 19 * * *` — minute=13. CLEAN.
- `tran-ngoc-bau` audit: `13 20 * * *` — minute=13. CLEAN.
- `digest-predict` weekly: `47 13 * * 0` — minute=47. CLEAN.

No collision with reserved slots:
- `verdictResolutionJob`: `7 * * * *` (minute=7) — no conflict
- `signalOutcomeResolutionJob`: `17 * * * *` (minute=17) — no conflict
- `vpsProxyWatchdogJob`: `*/10 2-8` — interval pattern, no conflict with off-minute slots

Timing window validation:
- foreignFlowAlert (08:13) → EOD chef (08:37): gap = 24min. CONFIRMED.
- macroIndicatorRefresh (19:13) → Evening Preview (19:37): gap = 24min. CONFIRMED.

TC-5 and TC-6 in 1949-cron-rewiring.test.ts verify these mathematically (both PASS).

### Check 6 — Alert-commander narrowed

**PASS.**

`.claude/agents/alert-commander.md`:
- `market: rule: event_only` (line 45)
- `no_cycle_headers: true` (line 58)
- `urgent_format_max_chars: 140` (line 59)
- Off-hours cron slot: removed (line 101 comment: "off_hours schedule removed")
- Schedule retains `*/15 2-8 * * 1-5` for evaluation cadence; gate in cycle.md ensures silent exit when neither firing condition fires.

`.claude/flows/alert-commander/cycle.md`:
- Firing Gate table at top of file with position-danger (3-condition) and watchlist-opportunity (4-condition) rows.
- CRITICAL always-fires row present.
- "If neither condition fires → EXIT silently. No MARKET write. No WORK cycle-header."

### Check 7 — Digest-predict shrunk

**PASS.**

`.claude/agents/digest-predict.md`:
- `daily_digest` cron: removed (line 113 comment: "# daily_digest removed — unified-agent (chef) owns daily narrative dishes")
- Monthly cron: removed (line 114 comment: "# monthly removed — consolidated into weekly calibration scope")
- `weekly_digest` cron: `47 13 * * 0` — Sunday 13:47 UTC. CORRECT.
- `market: rule: weekly_sunday_only` (line 44).

### Check 8 — TNB auditor reframe

**PASS.**

`.claude/agents/tran-ngoc-bau.md`:
- Description: "Chef narrative auditor. Reads the 3 daily MARKET dishes published by unified-agent (chef). Verifies that each dish walks all 6 TNB layers... Does NOT audit raw atoms or independent agent outputs."
- Audit scope: "Daily audit of the 3 chef dishes (Morning / EOD / Evening from unified-agent)" — "Layer-walk completeness check per dish — all 6 layers present or gap explicitly flagged."
- Schedule: `cron: "13 20 * * *"` — 20:13 UTC. CORRECT.
- Not auditing atom quality; auditing chef narrative for 6-layer walk presence.

### Check 9 — Tests pass

**PASS.**

- 9 new TDD tests (TC-1..TC-9) in `1949-cron-rewiring.test.ts`: all GREEN.
- 1133 regression (22 tests including 13 pre-existing + updates): all GREEN.
- Full suite: 9220 pass / 286 fail — 286 failures are pre-existing (consistent with prior baselines of 279-350 in notebooks c188, c190).
- tsc: 0 errors.

Test count cited: 9220 pass in full suite; 22 pass in zone (1949+1133); 9 new TC in Sprint 1949 batch.

### Check 10 — Docs consistency

**PASS.**

`docs/references/workflow-map.md` "Who Does What" table (lines 99-106):
- `market-watcher`: "docs/signals/price_anomaly* only (no MARKET write)" — CORRECT.
- `financial-analyst`: "docs/signals/bctc_signal* (with business-context fields: product/customer/ops/mgmt)" — CORRECT.
- `report-analyzer`: "docs/signals/fundamental_* (with business-context fields: product/customer/ops/mgmt)" — CORRECT.
- `alert-commander`: "MARKET (position-danger or watchlist-opp ONLY — ≤140 chars; silent exit otherwise)" — CORRECT.
- `digest-predict`: "MARKET (Sunday calibration + portfolio thesis only; daily removed)" — CORRECT.
- `unified-agent`: "MARKET chef dishes 3x/day (Morning/EOD/Evening) + conditional intraday" — CORRECT.
- `tran-ngoc-bau`: "daily cron 20:13 UTC" and "WORK audit row (TNB layer-walk completeness score per dish)" — CORRECT.

`docs/policies/alert-policy.md`:
- "Alert Commander Event Scope (Sprint 1949 — event-only model)" section present (lines 37-51).
- 2-event gate table present: position-danger (3-condition) + watchlist-opportunity (4-condition).
- CRITICAL override row present.

`docs/standards/cron-jobs.md`:
- "Chef Cook Schedule (Sprint 1949 — unified-agent as CHEF)" table present (lines 111-119).
- All 5 chef slots documented (05:23 Morning / 02-08:13 Intraday / 08:37 EOD / 19:37 Evening / Sun 13:47 digest-predict).
- foreignFlowAlertJob updated to 08:13 UTC (line 41).
- macroIndicatorRefreshJob updated to 19:13 UTC (line 75).
- tran-ngoc-bau moved to 20:13 UTC (line 128).

---

## Scope Hygiene (AC-8)

`apps/mcp-server/src/scheduler/audits/` — UNTOUCHED by Sprint 1949. Sprint 1948 zone preserved. No scope creep.

---

## Non-Blocking Observations

1. **docs/data/system-map.json cron descriptions stale** — `foreignFlowAlertJob` shows "09:30 UTC M-F" and `macroIndicatorRefreshJob` shows "0 6 * * *". These are informational only; `cronConfig.ts` and `cron-jobs.md` are correct. The system-map.json `_trigger` policy does not mandate cron-schedule-only updates. Can be addressed in next maintenance cycle (recommended, not blocking).

2. **financial-analyst / report-analyzer `inter_agent.sends_to`** — Neither explicitly names `unified-agent` as a `sends_to` entry (they send to `alert-commander` only in that block). However, the signal routing via `docs/signals/` filesystem is correctly documented in capabilities, signal_output_spec, and workflow-map.md. The signal bus (file-based) is the correct mechanism and does not require an explicit inter_agent send entry. Non-blocking.

---

## AC Matrix

| AC | Criterion | Result |
|---|---|---|
| AC-1 | MARKET ≤5 messages/day (3 guaranteed + ≤2 intraday) | DESIGN PASS — chef 3x + event-only AC + weekly Sunday |
| AC-2 | Chef dish 2-4 paragraphs + TNB layer citations | DESIGN PASS — chef.md Step 7 enforces format |
| AC-3 | Intraday scan 0 MARKET when no convergence | DESIGN PASS — silent-exit gate coded in chef.md Step 1 |
| AC-4 | No atom-list dumps | DESIGN PASS — constraint no_atom_list_to_market + TNB audit |
| AC-5 | TNB layer walk confirmed by tran-ngoc-bau | DESIGN PASS — audit reframed to layer-walk completeness |
| AC-6 | alert-commander ≤1 MARKET/ticker/day outside 2-event rules | DESIGN PASS — event_only gate enforced |
| AC-7 | foreignFlowAlertJob result available before EOD chef 08:37 | CODE PASS — 08:13 confirmed in cronConfig.ts; TC-5 GREEN |
| AC-8 | Sprint 1948 zone untouched | PASS — audits/ unmodified |

---

## Merge Status

All 3 commits (d4d5d0cf, 9848bf49, 44aa791a) are already on `main` branch. No branch merge required — work was committed directly to main per project policy.

**Sprint 1949 — APPROVED.**
