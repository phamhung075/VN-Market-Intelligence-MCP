# TNB Audit — Cycle 115 — ~2026-07-21T20:30Z (sourced from live MCP `fetchedAt`, no Bash `date -u` this session) (slot=tnb-audit)

## Overall: NEEDS_ATTENTION
Direction: **MIXED** — chef pipeline health itself is GOOD (4/4 fires today 2026-07-21, a business day: morning 05:20, intraday 08:20, eod 08:50, evening 19:51 UTC, all self-report published). But this is the **first cycle with mcp__gateway__call_tool confirmed live** (per the c114 frontmatter fix), and live execution reveals TNB's own audit tooling has a structural defect that was invisible during 20+ MCP-blocked prior cycles — not a chef regression, a TNB-tooling blind spot now exposed.

---

## Previous Handoff ACK (Step 0b2)

c114 (2026-07-19) — **ACK'd by PO 2026-07-19T20:31:00Z** ✓ (PO corrected root cause of the synthesis-write gap to a permission-cascade non-determinism in `unified-agent.md`, rejected TNB's "broaden to Step 7.6 general write-reliability" recommendation, routed `GAP-CHEF-SYNTHESIS-A-FLOW-PERSIST` REVIEW→BACKLOG P1 to agent-father instead, and set a "3 consecutive clean dishes" bar before considering it resolved). No persisting unACK'd blocker.

---

## Capability note

`mcp__gateway__call_tool` **CONFIRMED LIVE AND WORKING** this cycle (first time since the c114 frontmatter fix): `get_week_period`, `task_claim`, `get_macro_snapshot`, `get_system_status`, `read_telegram_reports`, `get_unreviewed_market_messages`, `get_kinhdich_reading`, `get_market_snapshot`, `get_agent_signals`, `get_signal_effectiveness`, `get_alert_accuracy`, `send_telegram` all executed successfully. `F-MCP-SUBAGENT-SYSTEMIC` is CLOSED — no recurrence. No Bash tool this session (consistent, established, fleet-wide pattern for cowork subagents) — notebook git-commit deferred to next Bash-capable sweep.

**PUBLISHED MARKER GATE:** `get_week_period` → periodKey=`2026-07-20/2026-07-26`. `task_claim(task_id="published:tnb-audit:2026-07-20/2026-07-26", task_kind="cowork-slot", ttl_seconds=691200)` → `claimed:true`. No peer collision.

---

## NEW — F-TNB-READTELEGRAMREPORTS-CHANNEL-PARAM-NOOP (HIGH)

`read_telegram_reports` has **no `channel` parameter** in its zod schema (`apps/mcp-server/src/interface/mcp/tools/briefings/telegramReportTools.ts`: only `status`/`limit`/`unclaimed_only`). Live-verified this cycle: calling with `channel="work"`, `channel="market"`, and no channel arg at all returned **byte-identical rows** — the tool only ever reads the `telegram_reports` DB table (BUG-channel-only backlog from `analysis-agent`, e.g. `[BCTC-1345b]`, `[bctcExtractReconcile]`, `[system-auditor]` entries), sorted oldest-unresolved-first (not "last N" despite its own doc claiming DESC). Root cause confirmed via `send_telegram.md`: WORK-channel messages are explicitly **"Not persisted (ephemeral status updates)"**, and MARKET-channel messages are only persisted when an internal `persist` param is passed — which `chef.md`'s `send_telegram(channel="market", message=<Block_A_text>)` call never supplies.

**Impact:** `audit-chef-coverage.md` Step 0.5 (`[chef] START/SENT/SILENT/FAILED` telemetry), `audit-market.md` Step 1a (MARKET plain-language check), and Step 1b (`[CHEF-DETAIL]` WORK layer-walk audit) are **structurally non-functional as written** — no combination of arguments to this tool can ever retrieve that content. This has been true on every cycle since these steps were added; it was masked by 20+ consecutive MCP-blocked cycles (c095-c114) that never got far enough to discover it. `get_unreviewed_market_messages` was checked as a possible alternate (it does persist MARKET messages with `verdict=NULL`) but chef's dish-send doesn't opt into that persistence path either.

**Recommendation:** route to agent-father/architect — rewrite Step 0.5, Step 1a, Step 1b to use file-proxy (`unified-agent.md` notebook + `unified-agent-synthesis-*.json` + `cowork-schedule.json`) as the **primary** method, not a degraded fallback. This is what every recent TNB cycle has actually done in practice (correctly) — formalize it.

---

## NEW — F-CHEF-MORNING-FALSE-FULL-VERDICT (HIGH)

2026-07-21 morning dish (`unified-agent-synthesis-2026-07-21-morning.json`) self-certifies `"quality_verdict": "full"`, `"layers_walked_summary": "1-6 (full)"`. But the same file's `us_macro_layer` field reads: *"Fed funds rate 3.63% with risk-off sentiment signaled by gold spike..."* — **no PMI, no EFFR-IORB spread** (Layer 2 mandatory content per `tnb-methodology.md` / main.md's own Layer table). `known_gaps` array lists only `business_context_sparse` and `gold_4300_active` — **zero L2 gap token**.

Contrast with the other 3 dishes the **same day**, which have the identical Layer-2 deficiency (Fed rate only, no PMI/EFFR-IORB) but are correctly self-scored `degraded`:
- intraday: `degraded`, though it also omits an explicit L2 token (masked by other correctly-tokened gaps)
- eod: `degraded`, **explicitly tokens `[gap:L2_US_macro_absent]`** — proves the self-scoring gate CAN catch this
- evening: `degraded`, and actually cites real EFFR-IORB content (1.64pp) — L2 genuinely adequate here

Morning is the only dish today where an L2 gap produced a **false "full" certification** rather than an honest gap token — a more serious failure mode than every previously-tracked chef finding (which were all honest `degraded` self-reports). RAW-verified via direct JSON read, not notebook citation (notebook line matches the false "full" claim verbatim — the summary faithfully reflects the bad synthesis, this is not a notebook-summarization artifact).

**First live-verified occurrence.** Below 3-cycle auto-cure threshold — logging, not auto-curing chef.md this cycle.

---

## NEW — F-COWORK-SCHEDULE-CHEFEVENING-LASTFIRED-STALE (MED)

`cowork-schedule.json` chef-evening slot `last_fired` = `"2026-07-19T19:50:29.901Z"` — stale 2+ days. `unified-agent.md` notebook + `unified-agent-synthesis-2026-07-21-evening.json` (`cycle_id: "evening-2026-07-21T19:51:23Z"`) both confirm a real fire at 2026-07-21T19:51:23Z. The other 3 chef slots (morning/intraday/eod) all updated correctly to 07-21 timestamps in the same file. Risk: any coverage-audit trusting `cowork-schedule.json` as ground truth for chef-evening specifically would falsely conclude 2 consecutive missed fires. Dispatcher/scheduler-side metadata bug, not a chef defect — recommend agent-father/ops investigate why only this one slot's `last_fired` write isn't landing.

---

## GAP-CHEF-SYNTHESIS-A-FLOW-PERSIST — fresh data point (still OPEN, PO's bar not met)

`unified-agent-synthesis-2026-07-21-eod.json` **does not exist** (Glob-confirmed absent) despite the notebook explicitly citing that path with a full self-reported detail block ("Dish published: YES ... QUALITY: degraded"). `unified-agent-synthesis-2026-07-20-eod.json` genuinely belongs to 07-20 (`cycle_id: "eod-2026-07-20T08:50Z"`, verified via Read) — ruling out a mislabel explanation, confirming total write-absence.

3 of 4 dishes today (morning/intraday/evening) **did** write correctly (cycle_id + timestamp_utc verified matching their claimed cycle). `unified-agent-synthesis-2026-07-20-evening.json` is also absent (checked this cycle) — so the miss pattern is not confined to "evening": 07-18 (dropped field), 07-19 (evening total miss), 07-20 (evening total miss), 07-21 (eod total miss). This is **consistent with, not contradictory to**, PO's own diagnosis (permission-cascade non-determinism, `model: haiku` — predicts intermittent failure on any slot, not specifically evening).

`.claude/agents/unified-agent.md` description now correctly whitelists `docs/data/unified-agent-synthesis-<DATE_VN>-<SLOT_ID>.json` (read live this cycle, confirmed present) — the textual fix PO applied IS in the current agent definition. Whether that fix landed before or after today's 08:50 UTC eod fire **cannot be determined this cycle** (no Bash/git-log access) — flagging this evidentiary gap explicitly rather than asserting either way. PO's stated resolution bar ("3 consecutive clean dishes") is **not yet met** — today's sequence (clean, clean, MISS, clean) breaks the streak mid-day.

---

## Business context — persisting, unchanged

All 4 dishes today explicitly token business-context absence/sparsity (`business_context_sparse` / `business_context_unavailable` / `business_context_absent` ×2). Root cause continues to trace to a bctc-analyst-drain-race (signals moved to `processed/` before chef's cycle reads them — bctc-analyst's own notebook confirms very active same-day reprocessing/rotation activity), not the originally-diagnosed wiring gap — matches c114's addendum finding, not new. `FIX-CHEF-BIZCTX-GATHER-TO-CONVICTION-WIRING` remains BACKLOG.

---

## T-45 Adversarial Gate

**PASS — FRESH instance found today**, refreshing the aging window flagged in c114 (07-17 instances were due to expire ~07-24). Intraday dish (`unified-agent-synthesis-2026-07-21-intraday.json`): VCI conviction call explicitly states *"Securities earnings surge Q2 (+32%) contradicted by RSI 20 oversold + FII selling; divergence signals consolidation phase"* — a bullish claim challenged by conflicting technical/flow evidence and explicitly resolved (downgraded to MEDIUM/HOLD, not ignored). Clean challenge-and-resolve instance, dated 2026-07-21.

---

## Findings Table

| # | Issue | Agent/Module | Severity | Category | Status |
|---|-------|-------------|----------|----------|--------|
| F-TNB-READTELEGRAMREPORTS-CHANNEL-PARAM-NOOP | `read_telegram_reports` has no `channel` param; silently reads only the BUG-report table regardless of argument. Blocks audit-chef-coverage.md Step 0.5 + audit-market.md Steps 1a/1b every cycle. | tran-ngoc-bau flow files / MCP tool schema | HIGH | tooling / methodology-execution | **NEW** — recommend agent-father/architect rewrite the 3 flow steps to use file-proxy as primary method. |
| F-CHEF-MORNING-FALSE-FULL-VERDICT | 07-21 morning dish self-certifies "full" (6/6 layers) but its own persisted synthesis has no PMI/EFFR-IORB and zero L2 gap token — same-day eod dish correctly tokens the identical gap. | unified-agent (chef.md) Step 7.5 quality-verdict gate | HIGH | methodology / self-scoring integrity | **NEW** — 1st occurrence, below 3-cycle auto-cure threshold. |
| F-COWORK-SCHEDULE-CHEFEVENING-LASTFIRED-STALE | chef-evening `last_fired` stuck at 07-19 despite a confirmed real 07-21 fire (notebook + synthesis JSON). Other 3 chef slots update correctly. | cowork-schedule.json / dispatcher | MED | scheduler metadata | **NEW** — recommend agent-father/ops investigate. |
| GAP-CHEF-SYNTHESIS-A-FLOW-PERSIST | Fresh miss: 07-21-eod synthesis JSON never written (notebook cites path, file absent). 07-20-evening also absent. 3/4 dishes today wrote correctly. PO's "3 consecutive clean" bar not yet met. | unified-agent (chef.md) Step 7.6 | HIGH (existing, P1) | data-integrity / audit-tooling | **PERSISTING** — fresh negative data point, consistent with PO's non-determinism diagnosis. |
| Business context absent | All 4 dishes today token biz-ctx absence; traces to bctc-analyst drain-race, not wiring. | unified-agent (chef.md) Step 0 GATHER | HIGH (existing) | methodology / data-plumbing | **PERSISTING**, unchanged — `FIX-CHEF-BIZCTX-GATHER-TO-CONVICTION-WIRING` still BACKLOG. |
| BCTC serve-layer pipeline gap | ~17-18 ticker blocked cluster (KBC/NVL/VCI/SSI/DIG/VIX/DPM/SAB etc.), unchanged. | dev-pdf-extractor / bctc pipeline | HIGH (existing) | data-serve-integrity | **PERSISTING** — owned by bctc-analyst, not re-audited. |
| F-MCP-SUBAGENT-SYSTEMIC | Was ≥20 consecutive cycles, zero MCP grant. | tran-ngoc-bau frontmatter | HIGH (existing) | infra | **RESOLVED** — confirmed fixed and holding this cycle. Closing. |

---

## Auto-Cures Applied This Cycle

None — both new findings (read_telegram_reports schema mismatch, morning false-full verdict) are 1st occurrences, below the 3-cycle auto-cure threshold. The read_telegram_reports fix also touches shared flow-doc design (not a simple 1-line patch) — recommending PO/architect review rather than unilateral edit.

---

## Positive Signals

- Chef pipeline coverage 2026-07-21: 4/4 fires (morning/intraday/eod/evening), all published — GOOD, business day ✓
- `mcp__gateway__call_tool` confirmed live and fully functional this cycle — `F-MCP-SUBAGENT-SYSTEMIC` CLOSED ✓
- 3 of 4 dishes' synthesis JSONs wrote correctly, RAW-verified matching their notebook citations (cycle_id + timestamp_utc) ✓
- eod dish correctly self-tokened its own Layer-2 gap (`[gap:L2_US_macro_absent]`) — proves the self-scoring gate CAN work correctly, narrowing the morning-specific defect to a real, isolated bug rather than a universal failure ✓
- T-45 adversarial gate refreshed with a genuine, dated (07-21) challenge-and-resolve instance (VCI) ✓
- Peer notebooks (market-watcher, alert-commander, news-scout, bctc-analyst) all show live MCP access, REGIME extraction, honest self-reporting, no fabrication ✓
- bctc-analyst continues to correctly resist fabricating data on ongoing reprocess-corruption/blocked-cluster tickers, routing as signals instead ✓

---

## Persisting Blockers

1. **F-TNB-READTELEGRAMREPORTS-CHANNEL-PARAM-NOOP (HIGH, NEW):** blocks Phase 0.5/1a/1b every future cycle until flow files are rewritten to use file-proxy as primary method.
2. **FIX-CHEF-BIZCTX-GATHER-TO-CONVICTION-WIRING / drain-race (HIGH):** still BACKLOG, root cause reframed to drain-race not wiring.
3. **GAP-CHEF-SYNTHESIS-A-FLOW-PERSIST (HIGH, P1):** fresh miss this cycle (eod), 3-consecutive-clean bar not met.
4. **BCTC serve-layer pipeline gap (HIGH):** owned by bctc-analyst, unchanged.
5. **Notebook uncommitted this cycle:** no Bash tool this session — deferred to next git-capable sweep (established fleet-wide pattern).

---

## Next Cycle Priorities (c116)

1. Confirm whether agent-father/architect has picked up F-TNB-READTELEGRAMREPORTS-CHANNEL-PARAM-NOOP; if a fix lands, re-verify Phase 0.5/1a/1b execute against real data.
2. Re-check F-CHEF-MORNING-FALSE-FULL-VERDICT for recurrence (2nd occurrence would cross toward escalation).
3. Check whether GAP-CHEF-SYNTHESIS-A-FLOW-PERSIST reaches a clean 3-consecutive-dish streak, or misses again.
4. Confirm whether cowork-schedule.json chef-evening `last_fired` self-corrects on the next fire.
5. If Bash/git becomes available: land this cycle's notebook commit + backlog from prior cycles.

---

## Blocked Steps This Cycle

- Phase 0.5 `read_telegram_reports` for `[chef]` telemetry — tool call succeeded but returned wrong-table data (see F-TNB-READTELEGRAMREPORTS-CHANNEL-PARAM-NOOP); fell back to file-proxy (cowork-schedule.json + unified-agent.md + synthesis JSON), consistent with the sub-flow's own error-boundary clause.
- Phase 1 Steps 1a/1b (MARKET/WORK live channel read) — same tool defect; fell back to file-proxy (notebook + synthesis JSON), same evidence quality as recent prior cycles.
- Dashboard write (`docs/data/orch/orch-state.json` `.signal_queue`) — SKIPPED. Project CLAUDE.md requires every write to route via `scripts/orch-apply.sh` (jq transform piped through the wrapper), which needs Bash; no Bash tool this session and no MCP tool exists to write `.signal_queue` rows directly (checked — no such tool registered). Used `docs/signals/tnb-20260721T203007Z.json` file drop instead (same pattern as c113/c114), which does not require Bash.
- Notebook git-commit — no Bash/git tool this session (deferred to next git-capable sweep, established pattern).
