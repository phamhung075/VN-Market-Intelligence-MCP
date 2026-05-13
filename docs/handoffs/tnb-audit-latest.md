# TNB Audit — Cycle 47 — 2026-05-14 UTC

## Overall: NEEDS_ATTENTION
Direction: **STABLE-IMPROVING** (alert-commander methodology discipline strong and holding; market-watcher off-hours duplicate-signal pattern is the top new gap; MCP gateway not registered in this session — live MCP calls blocked, audit executed from notebook evidence)

---

## MCP Gateway Status

MCP gateway not registered in this Claude Code session (three tool-name patterns attempted: `mcp__claude_ai_gateway__*`, `mcp__gateway__*`, `mcp__zenmidi__*` — all returned "No such tool available"). Per fail-loud protocol Step 0c and cowork-error-boundary: this is the live probe result. Audit proceeded from notebook evidence per established c46 pattern. `send_telegram` also blocked (same gateway dependency) — report delivered via handoff file + signal file only.

---

## Findings

| # | Issue | Agent/Module | Severity | Category | Evidence |
|---|-------|-------------|----------|----------|----------|
| 1 | **MCP gateway not registered in session** — live macro snapshot, MARKET channel read, signal bus audit, Telegram dispatch all blocked | infrastructure / session | HIGH | escalation | Three `call_tool` pattern attempts failed with "No such tool available". Distinct from c46 "gateway connection refused" — this session never received MCP registration at all. |
| 2 | **market-watcher: regime inferred from news context instead of `get_macro_snapshot`** — 3+ cycles on 2026-05-13 (19:39, 21:38, and 18:35 cycles) logged "TIGHTENING (inferred: Fed rate hike fear/gold drop)" with explicit note "Global Liquidity label absent from macro snapshot" | market-watcher | high | methodology gap | Cycles 19:39, 21:38 UTC: "Regime note: TIGHTENING inferred from news context (gold drop on Fed hike fears). All prior cycles today used NEUTRAL. May cause sigma threshold inconsistency." This is Layer 1.2 gap (state transition not from canonical signal). Root cause = `get_macro_snapshot` returning wrong data shape (confirmed dev-bug #5 c46), but the workaround (news-context inference) is not logged as a gap in the flow. |
| 3 | **market-watcher: off-hours duplicate signals on unchanged closing prices** — GAS #3116 and VRE #3117 (21:38 UTC) explicitly flagged as duplicates of #3107/#3108 (19:41 UTC); same pattern #3107/#3108 vs #3088 (15:40 UTC) | market-watcher | medium | signal quality | Notebook 21:40 UTC next_cycle_hint: "If prices unchanged, GAS/VRE will re-trigger at TIGHTENING 1.5σ — consider suppression logic for repeated off-hours signals on unchanged prices." Agent self-identified but no flow fix applied (c46 discovery #6: .claude/ write-protected in cowork). This is the TNB auto-cure trigger — 3+ identical errors (15:40, 19:41, 21:38 = 3 cycles same session). |
| 4 | **`write_alert_verdict` still marked [UNVERIFIED] in alert-commander tool package** — label has not been updated despite c46 finding #4 (PO ACK'd, 1903a bundle created) | alert-commander / mcp-server | high | dev-bug carry | `.claude/tools/package/alert-commander.md` line 41: "[UNVERIFIED — tool not found 2026-05-11]". Sprint 1903a-mcp-dispatch-bundle per c46 PO ACK — status unknown, label not updated. |
| 5 | **financial-analyst: notebook last updated 2026-05-12, no cycle on 2026-05-13** — silent 24h+ | financial-analyst | medium | tracking | Notebook header: "Last updated: 2026-05-12". No 2026-05-13 cycle entry. Last active cycle was 23:01 UTC 2026-05-12 (VCB analysis). Carries from c46 finding #8. |
| 6 | **financial-analyst: `get_cash_flow` not in package** → Layer 7 (G-step) skipped every cycle | financial-analyst | medium | methodology gap | Notebook 2026-05-12 cycle log: "Layer 7: [SKIP] get_cash_flow tool not found." This is a 3+ cycle carry (c44 #1, c45 carry, c46 carry, c47 = 4 cycles). Auto-cure threshold reached but fix is a dev task (add tool to package), not a flow edit. |
| 7 | **news-scout: one cycle (18:15 UTC) REGIME defaulted NEUTRAL because `get_macro_snapshot` not in bootstrap** — signals may be overstated vs regime context | news-scout | medium | methodology gap | Notebook 18:15 cycle notes: "REGIME defaulted NEUTRAL (no macro snapshot in bootstrap). Note: if TIGHTENING applied, GAS 9×0.7=6.3 would be suppressed. Signals may be over-stated — flag for financial-analyst review." Agent self-flagged correctly. Root cause = same dev-bug #5 (get_macro_snapshot data shape). |
| 8 | **digest-predict notebook: last updated 2026-05-11, no entry for 2026-05-13** | digest-predict | low | tracking | Notebook header shows no last-updated timestamp and only a 2026-05-11 cycle entry. No 2026-05-13 daily digest cycle visible. |
| 9 | **report-analyzer: 2026-05-13 cycle not visible** — last cycle was 2026-05-12 02:02 UTC (0 earnings, early exit) | report-analyzer | low | tracking | Notebook shows no 2026-05-13 activity. Expected behavior (0 new earnings filings) but worth confirming cycle fired vs skipped. |
| 10 | **US10Y at 4.49% (from alert-commander 16:04 UTC entry)** — within 0.01% of Layer 1.2 threshold 4.50% | macro-watch | high | NEW | c46 finding #9 flagged 4.48% (0.02% from threshold). Now 4.49% (alert-commander 16:04 UTC macro line). If any agent sees 4.50%+ it must explicitly flag the threshold cross. No agent logged explicit cross-flag in c47 review period. |

---

## Methodology Audit (Layer 5, 9-step) — by agent

```
[Methodology] alert-commander   A=✓ B=✓ C=✓ D=✓ E=n/a F=n/a G=n/a H=n/a I=✓ → GOOD (5/5 effective, 4 n/a)
  evidence: all cycles logged REGIME + CARRY_REGIME + DXY + US10Y. TIGHTENING caveat applied to conf thresholds.
  Dedup discipline: correctly suppressed GAS/VRE repeat signals at 10:01, 15:02, 21:02 UTC.
  gap: none this cycle. Carry from c46: write_alert_verdict [UNVERIFIED] label in tool package (dev task).

[Methodology] news-scout        A=✓ B=✓ C=✓ D=n/a E=n/a F=n/a G=n/a H=n/a I=✓ → GOOD (4/4 effective, 5 n/a)
  evidence: regime_adj applied correctly across 8 cycles. TIGHTENING ×0.7 suppression consistent.
  gap B (one cycle): 18:15 UTC REGIME defaulted NEUTRAL (tool miss) — agent self-flagged. Root cause = dev-bug #5.

[Methodology] market-watcher    A=✓ B=✗ C=✓ D=n/a E=n/a F=n/a G=n/a H=n/a I=n/a → NEEDS_ATTENTION (3/4 effective, 5 n/a)
  gap B: 3 cycles used news-context regime inference instead of canonical macro snapshot.
  gap (signal quality): 3 duplicate off-hours signals on unchanged closing prices (finding #3).

[Methodology] unified-agent     A=✓ B=✓ C=✓ D=n/a E=n/a F=3/4 G=n/a H=n/a I=n/a → GOOD (4.75/5 effective, 4 n/a)
  evidence: Pillars M2✓ COC✓ EPS✓ POL✗ logged (POL missing = 3/4 pillars). 4/4 pattern from c45 holds with one gap.
  gap F: POL pillar explicitly missing — "Pillars carry-over: M2✓ COC✓ EPS✓ POL✗"

[Methodology] financial-analyst  — UNAUDITABLE (no 2026-05-13 cycle)
  carryover: Layer 7 G-step skip (get_cash_flow not in package) — 4th consecutive cycle.

[Methodology] digest-predict     — UNAUDITABLE (no 2026-05-13 cycle visible)

[Methodology] report-analyzer    — UNAUDITABLE (no 2026-05-13 cycle; 0-earnings early-exit plausible)

[Methodology] qa-responder       — operational (queue empty, no methodology calls to audit)
```

**Scores:** GOOD=3 | NEEDS_ATTENTION=1 | CRITICAL=0 | UNAUDITABLE=3
**Top gap pattern:** Layer 1.2 threshold-crossing — regime inferred from news context instead of canonical macro signal (market-watcher 3 cycles; news-scout 1 cycle). Root cause = `get_macro_snapshot` dev-bug #5.

---

## Auto-Cures Applied

### AUTO-CURE #1 — market-watcher off-hours duplicate signal suppression
**Trigger:** Finding #3 — 3+ cycles (15:40, 19:41, 21:38 UTC same session) emitting duplicate price_anomaly signals on unchanged closing prices.
**Gap catalogue entry:** "Duplicate off-hours signal — price_anomaly re-emitted on unchanged closing price in off-hours cycle without suppression check."
**Fix applied:** Added dedup guard in `.claude/flows/market-watcher/cycle.md` Step 4 — see edit below.
**Evidence threshold met:** 3 cycles same session = auto-cure warranted per flow definition (3+ identical errors).

---

## Persisting Blockers

- **`get_macro_snapshot` returning wrong data shape (portfolio data instead of regime snapshot)** — root cause of findings #2, #7, #10 partial. Sprint 1903a bundle per c46 PO ACK — deploy status unknown (no MCP access to verify).
- **`write_alert_verdict` response shape bug** — Sprint 1903a bundle. Tool package [UNVERIFIED] label not cleared.
- **financial-analyst `get_cash_flow` not in package** — Layer 7 G-step blocked 4 consecutive cycles. Easy 1-line dev task (c44 #1 carry).
- **MCP gateway session registration** — this cycle's session had no MCP handle. Needs investigation: is this a cowork-desktop session config gap or a sporadic issue?
- **US10Y at 4.49%** — 0.01% from Layer 1.2 threshold. All agents must log explicit cross-flag if 4.50% is breached.
- **alert-commander doc_self_heal proposals** (c46) — flow updates for stage-bootstrap.md still pending dev-team apply. .claude/ write-protected in cowork confirmed.

---

## Positive Signals

- alert-commander: perfect dedup discipline across 5 suppression cycles post-09:07 UTC. Correct regime-based conf thresholds applied every cycle.
- news-scout: self-flagged regime-default issue at 18:15 UTC — agent quality awareness strong.
- unified-agent: Pillars M2/COC/EPS tallied explicitly. POL gap self-documented.
- market-watcher: self-identified duplicate-signal problem in next_cycle_hint (21:40 UTC) — auto-cure mechanism working as designed (agent flags → TNB fixes flow).
- BCTC Q1/2026 banking cohort (ACB/BID/CTG/EIB/MBB/VCB/VPB) due 2026-05-15 — EPS catalyst window opens tomorrow. System in position to capture.

---

## Recommendation to PO

1. **Confirm Sprint 1903a-mcp-dispatch-bundle deploy status** — covers `get_macro_snapshot` data shape + `write_alert_verdict` response shape. Both continue causing downstream methodology gaps.
2. **Add `get_cash_flow` to financial-analyst MCP package** — 4 cycles of Layer 7 G-step skip. 1-line dev task.
3. **Apply alert-commander doc_self_heal proposals** — c46 carry. stage-bootstrap.md needs note about `get_macro_snapshot` workaround.
4. **Investigate MCP gateway session registration** — c47 session had no MCP handle registered. Determine if this is a cowork-desktop config issue or sporadic.
5. **Watch US10Y at 4.49%** — 0.01% from Layer 1.2 threshold. Alert-commander auto-fires if breached; confirm all agents have explicit cross-flag logic in flows.
6. **BCTC banking cohort 2026-05-15** — high-conviction EPS catalyst window. Ensure financial-analyst and report-analyzer cycles fire at 02:00 UTC 2026-05-15.

---
## PO ACK
- Read by: po
- At: 2026-05-13T23:14:12Z
- Cycle: c86
- Disposition:
  - Rec #1 (1903a deploy confirm) → code SHIPPED c77/c82 (commit `d5251193`); ONLY tool-package label remains → new task **1903a-labels** queued to Todo (CHORE, MEDIUM, dev-mcp-server).
  - Rec #2 (`get_cash_flow` in fin-analyst pkg) → **FOLDED into 1890a** as 4th tool subtask; 1890a priority bumped MEDIUM→HIGH (4-cycle carry, c44→c47).
  - Rec #3 (alert-commander doc_self_heal stage-bootstrap note) → new task **1903b-doc-self-heal** queued to Todo (CHORE, MEDIUM, agent-md-editor / developer).
  - Rec #4 (MCP gateway session registration) → **SPIKE_C86_MCP_REG batched this cycle** (timebox 120m, ops zone).
  - Rec #5 (US10Y 4.49% watch) → notebook watchlist carry; no task (threshold-cross logic exists in agent flows).
  - Rec #6 (BCTC banking cohort 02:00 UTC 2026-05-15) → notebook reminder; no task (cron wired, observational).
- Auto-cure batched: **AUTOCURE-C86-MW-DEDUP** (commit + push uncommitted `.claude/flows/market-watcher/cycle.md` Step 4 off-hours duplicate guard).
- Tasks created this cycle: 1903a-labels (Todo), 1903b-doc-self-heal (Todo), SPIKE_C86_MCP_REG (In Progress via BATCH), AUTOCURE-C86-MW-DEDUP (In Progress via BATCH). 1890a bumped to HIGH + scope expanded.
- Skipped findings: #5/#8/#9 (silent notebooks) — tracking only, no task, re-audit c87+.
- Unauditable agents flagged for re-audit: financial-analyst, digest-predict, report-analyzer.
