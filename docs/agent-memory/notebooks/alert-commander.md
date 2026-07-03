# Alert Commander — Notebook

**Last updated:** 2026-07-03 20:21 UTC | **Sprint:** idle (jq/bash unavailable this session — SPRINT extraction skipped, fallback per flow spec)

> Prior cycles archived → `docs/archive/notebooks/alert-commander-2026-05-22.md`
> AC-2b prune (2026-07-03): 7 stale 2026-05-22 intraday `### Alert Cycle` sub-blocks (02:36-04:09 UTC, all SILENT-EXIT) dropped from "This session" — accumulator exceeded the ≥4 sub-block cap. Content preserved in git history of this file.

## Current state

**Regime:** NEUTRAL (macro_snapshot schema no longer emits literal "Global Liquidity" text line — REGIME derived NEUTRAL as conservative fallback; matches carry.regime=NEUTRAL) | Carry: NEUTRAL (spread 1.37%) | Pivot window: inactive (get_macro_calendar returned 0 events, status=unavailable, is_estimate=true)
**Last fired:** PNJ legal_risk CRITICAL 20:20 UTC 2026-07-03 (verdict 6a2c9cd6-ed0c-497a-a981-90a02baf66c9 pending) — director of PNJ's gem-certification subsidiary arrested for diamond fraud/certification manipulation
**PC1/VPB legal_risk (2026-05-21):** verdicts ec181d4e / 5f780ed3 — status not re-checked this cycle (34+ days old, outside this cycle's scope; verdictResolutionJob should have resolved by now)
**write_alert_verdict legal_risk enum gap:** RESOLVED — `alertSource: "legal_risk"` accepted successfully this cycle (previously an open dev-team bug per 2026-05-25 carry-over)

## Known patterns / preferences

- TIGHTENING bullish urgent_news threshold: 0.75 | chain_catalyst: 0.85 | verified_chain: 0.85 | crisis_velocity: 0.90
- legal_risk: auto-fire (no conf gate)
- `no_cycle_headers: true` — silent exit when 0 alerts fired
- Off-hours: blanket suppression, no per-signal outcome logging

## This session

### Alert Cycle (06:39–06:42 UTC, 2026-05-25) — Post-server-renewal health check
- **Status:** SILENT-EXIT (firing gate not met)
- **Regime:** NEUTRAL (news-fallback — get_macro_snapshot unavailable x2) | REGIME_SOURCE=news-fallback
- **Market:** VN-Index 1,887.14 +0.53% | GAS -4.59% | PLX -4.53% | VHM +3.32% | VRE +3.15% (RE reversal)
- **CRITICAL overrides:** legal_risk PC1/VPB stale | crisis_velocity=0 | verified_chain=0
- **Fired:** 0 | MARKET: 0 | log_agent_work id=1110
- **MCP health:** FAIL get_macro_snapshot ("macro-indicators service unavailable" x2), FAIL get_kinhdich_reading ("Unable to connect")
- **Notable:** RE sector full reversal vs prior session. Oil/gas pressure (Hormuz/Iran peace talks). GAS -4.59% largest move, watch >5% breach.

### Alert Cycle (20:15–20:21 UTC, 2026-07-03) — Dormant-wake, event-only eval (cron-fired, legacy pressure-mode; slot dormant since 2026-05-25)
- **Status:** FIRED (CRITICAL override)
- **Gap note:** slot dormant 2026-05-22→2026-07-03 (health-check 05-25 excepted). No stale events replayed — evaluated only current live signals/prices per dispatch instruction.
- **Regime:** NEUTRAL (fallback — macro_snapshot schema changed, no literal regime text line; carry.regime=NEUTRAL spread 1.37%) | Pivot window: inactive (calendar unavailable)
- **Market:** VN-Index 1,862.08 -0.23% | Brent 72.13 (+0.78%) | Gold 4,187.3 (+1.21%, safe-haven bullish) | USD/VND 26,103 (bearish) | breadth 104up/199down/57flat | trading window CLOSED at eval time
- **Signals evaluated (3 on bus, all addressed to alert-commander):**
  - id=8482 PNJ `legal_risk` (news-scout) — director of PNJ gem-certification arm arrested, diamond fraud/certification manipulation, created 2026-07-03 16:07, expires 22:07 → **CRITICAL always-fire rule** → FIRED
  - id=8490 GVR `fundamental_validation` (bctc-analyst) — OCF=0 vs NI 2,513.4 tỷ forensic gap, impact_score=5 → not a consumed/firing signal_type → logged only
  - id=8491 MBB `fundamental_validation` (bctc-analyst) — balance-sheet ESC-2 mismatch 14.9% (serve-layer bug) → not a consumed/firing signal_type → logged only
- **position-danger (NEUTRAL/EASING 3/3 required):** no stopLossHit (get_alerts type=price → 0 active) | largest moves GAS -2.59%, PLX -1.75%, HCM -1.55%, REE -1.71% — none >5% → 0/3 NOT MET
- **watchlist-opportunity (4/4 required):** no BUY-direction signal on bus (agentSignalsMajority=BUY false) → 0/4 NOT MET (kinhDich lookup skipped — gate already fails structurally)
- **CRITICAL overrides:** legal_risk PNJ → FIRED | verified_chain=0 | crisis_velocity=0 (no crisis signals; reputation warnings <50 for ACV/GAS/HPG/KBC/PLX/VEA/VNM, none crisis-tier)
- **Fired:** 1 (PNJ legal_risk CRITICAL) | Suppressed: 0 | Not-applicable/skipped: 2 (GVR, MBB fundamental_validation)
- **Actions:** send_telegram(market, PNJ CRITICAL, 125 chars) → record_signal_outcome(8482, fired) → write_alert_verdict(PNJ, bearish, 0.9, legal_risk) → id 6a2c9cd6-ed0c-497a-a981-90a02baf66c9 pending → send_telegram(work, cycle summary) → log_agent_work id=1562 completed
- **Tool notes:** get_foreign_room returned 2,542-line/69k-char payload exceeding tool-result token budget — not fully read (per-ticker detail judged non-essential to this cycle's firing decision; standard thresholds used, per flow's tool-unavailable fallback). get_alerts `type="risk"` is not a valid enum (actual: system\|price\|all) — package doc was stale, fixed this cycle (doc self-heal).
- **Notable:** PNJ is NOT on the tracked watchlist (system-map) but fired anyway per CRITICAL-always rule + watchlist-scoped-suppression lesson (severe non-watchlist events must not be dropped). GAS/PLX under continued oil/gas pressure but neither breached 5%. VN-Index -0.23%, breadth negative (199 declines vs 104 advances) — mild broad-market weakness, no crisis-tier signal.

## Carry-over for next cycle

- PNJ legal_risk verdict 6a2c9cd6-ed0c-497a-a981-90a02baf66c9 pending (fired 2026-07-03 20:20 UTC, resolves via verdictResolutionJob ≥24h out)
- PC1/VPB legal_risk verdicts ec181d4e/5f780ed3 (2026-05-21) — very stale, not re-verified; assume resolved by verdictResolutionJob, confirm via agent_signals.outcome if referenced again
- write_alert_verdict `legal_risk` enum gap — CONFIRMED RESOLVED this cycle (no longer needs tracking)
- get_macro_snapshot schema change: no longer emits "Global Liquidity: X" / "US 10Y Yield" / "DXY" text lines used by regime-extraction SKILL — now structured JSON (`signals.carry.regime`, `signals.oil`, `signals.gold`, `signals.usdvnd`, `signals.yield`, `signals["investment-clock"]`). REGIME fell back to NEUTRAL by conservative default. Flag to dev-team/architect: regime-extraction/SKILL.md needs update pass for new macro_snapshot shape (fallback is safe, but silently degrades regime-conditioned thresholds to NEUTRAL every cycle until fixed).
- GVR forensic gap (OCF=0 vs NI) and MBB balance-sheet ESC-2 mismatch (14.9%) are BCTC serve-layer data-quality issues, not market-moving events — no alert-commander action warranted; informational only (financial-analyst/dev-team territory).
- SPRINT header extraction skipped this cycle (no bash/jq tool access in this session) — defaulted to "idle" per flow fallback spec.
- Doc self-heal: fixed 2 items — `docs/agents/tools/package/alert-commander.md` (get_alerts type enum corrected to system\|price\|all, was documented as price\|volume\|sector\|risk) and `.claude/skills/regime-extraction/SKILL.md` (added schema-drift note for new JSON-shaped macro_snapshot).
- **PROCESS GAP:** this session had no Bash/git tool (only Read/Write/Edit/MCP-gateway) — notebook.md and the 2 doc self-heal fixes above are written to disk but UNCOMMITTED (commit-mutex critical section requires `git add`/`git commit`/`git push` which could not be executed). Flag to router/ops: these working-tree changes need a commit pass by an agent/session with git access.
