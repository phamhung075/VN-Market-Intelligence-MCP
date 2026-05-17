# TNB Audit — Cycle 67 — 2026-05-18 (file-evidence, MCP unavailable in Claude Code)

## Overall: NEEDS_ATTENTION
Direction: **IMPROVING** (6 live cowork agents operational; news-scout c67 22:21 UTC live; alert-commander c171 22:04 UTC live; new finding: PC1 legal_risk tool extraction gap reached 3-cycle threshold; TNB-critic-gate architecture brief ready for implementation — significant positive development)

---

## Previous Handoff ACK

C66 handoff: `## PO ACK — c169 (2026-05-17T18:38Z)` PRESENT. PO ACK loop operational.
- `1937a-cowork-scheduler-mcp-gap` created as SPIKE
- 7 prior findings skipped (no new task — already tracked or structural)
- Direction confirmed IMPROVING

---

## MCP Gateway Status (This Session)

**TNB MCP probe (Claude Code session):** Structurally blocked. 13th consecutive Claude Code session without MCP access. Established operational pattern — file-evidence audit is the confirmed fallback. Cowork sandbox MCP OPERATIONAL per alert-commander c171 22:04 UTC, news-scout 22:21 UTC, qa-responder 21:48 UTC.

---

## Findings

| # | Issue | Agent/Module | Severity | Category | Evidence |
|---|-------|-------------|----------|----------|----------|
| 1 | **digest-predict: 8+ day silence (last session 2026-05-11 21:38 UTC)** | digest-predict | CRITICAL | tracking | Notebook: "(no session recorded)" — unchanged c63→c67. No MARKET digest in 8+ days. 1907a OPS-CRITICAL. Gateway-independent confirmed. |
| 2 | **PC1 legal_risk tool: 3-cycle extraction gap** | alert-commander / data-pipeline | HIGH | bug | alert-commander cycles 20:04, 21:03, 22:04 UTC all note "`get_legal_risk_signals` returns empty" despite PC1 chairman arrest (bearish score 10.0, news-scout #3318 conf legal, #3343 conf=0.78). 3-cycle threshold reached. news-scout correctly emits signal; tool does not surface it. Flow files correct — upstream data gap. Escalate as BUG. |
| 3 | **BCTC Q1-2026 banking cohort: ACB/BID/CTG/EIB/MBB/VCB/VPB — unconfirmed** | bctc-pipeline / financial-analyst | HIGH | tracking | Financial-analyst last live 23:06 UTC 2026-05-16 (38/38 QUÁ HẠN). report-analyzer last live 02:00 UTC 2026-05-15. Now 18+ days past deadline. First post-recovery FA + report-analyzer cycle needed. |
| 4 | **report-analyzer: 48h+ stale, no live session since gateway recovery** | report-analyzer | MEDIUM | tracking | Last live entry 02:00 UTC 2026-05-15. Blocked cycles (00:08, 00:09 UTC 2026-05-17) then no further notebook entries. Gateway now operational — next scheduled 02:00 UTC cycle should execute live. Monitor c68 for confirmation. |
| 5 | **FA Layer 7 OCF extraction: status unclear post-1930b** | financial-analyst / bctc-pipeline | MEDIUM | tracking | FA notebook 23:06 UTC 2026-05-16: ocf_ni_ratio=504 (FPT) + 1.42e8 (VCB) still anomalous. 1930b shipped c157 — unverified. Layer 7 fallback (c61 auto-cure) remains active as safety net. |
| 6 | **Cowork scheduled-task MCP gap (1937a SPIKE)** | alert-commander / qa-responder / scheduler | MEDIUM | bug | alert-commander 20:28 UTC + qa-responder 13:49 UTC BLOCKED in automated scheduler context. Live Cowork cycles succeed. Sprint 1937a SPIKE created c169. Root cause investigation ongoing. |
| 7 | **TNB Claude Code MCP: 13th consecutive blocked cycle** | infrastructure / tnb | MEDIUM | tracking | Structural. No change since c66. PO acknowledged. |
| 8 | **1897b git HEAD.lock VirtioFS H4: USER action pending** | infrastructure | MEDIUM | tracking | Preflight cure (1906a) active. Structural fix requires user action. Unchanged since c66. |
| 9 | **market-watcher 19:38 UTC BLOCKED** | market-watcher / scheduler | LOW | tracking | market-watcher 19:38 UTC: MCP gateway unreachable. Distinct from alert-commander 20:28 cycle. Possible transient (12:39 UTC cycle was clean). Monitor c68 for recurrence — if pattern → part of 1937a SPIKE scope. |
| 10 | **news-scout structural D+E gaps** | news-scout | LOW | methodology gap | D=PMI sub-components (no PMI data source), E=VIRA (VPS scraper pending). Both structural. Behavioural sustained: #3343 (PC1 legal) conf=0.78 correct elevation, #3344/3345/3346 regime_adj applied correctly under TIGHTENING. |

---

## New Architecture Item (Positive)

**TNB-critic-gate brief (`docs/architecture-briefs/2026-05-17-tnb-critic-gate.md`) — READY FOR IMPLEMENTATION**

agents-architect delivered a complete implementation spec for a server-side critic gate at `post_agent_signal`. Key details:
- 5-check scorer (pillar coverage, source tier, specificity, BCTC forensics, confidence anchor) — all derived from TNB methodology
- Threshold = 0.6 (3 of 5), with BCTC check auto-pass for non-BCTC signals
- Fail-soft (20s timeout → signal passes through unscored), max 1 retry
- Schema: 3 new columns on `agent_signals` (critic_score, critic_notes, retry_count)
- No LLM call, no cowork flow file changes, no alert_signals changes
- Sprint split: Sprint A (schema + types + pure scorer) → Sprint B (wire gate + tests)
- This directly addresses the persistent conf=0.50 majority and pillar-incompleteness patterns TNB has flagged since c61

**Recommendation for PO:** Prioritize Sprint A (schema + scorer) — it is safe to ship independently and unblocks Sprint B gate wiring. Assign to dev-mcp-server zone.

---

## Resolved Since c66 (PO ACK c169)

- **1937a SPIKE created**: cowork scheduled-task MCP gap captured. SPIKE in Backlog.
- **PO ACK loop**: c169 ACK present — loop operational.
- **Market-watcher 12:39 UTC**: Clean live cycle (41 stocks, 0 signals, correct stale-price guard).
- **news-scout confidence elevation**: #3343 PC1 legal conf=0.78 — first non-default confidence signal in several cycles, showing improved signal differentiation.

---

## Methodology Scores (Layer 5, 9-step) — c67

| Agent | Last Live | Score | Status | Key Notes |
|-------|-----------|-------|--------|-----------|
| alert-commander | 22:04 UTC today | GOOD | LIVE | TIGHTENING thresholds enforced. All 3 suppressions correct (conf=0.50 < 0.85). Carry caveat logged. |
| news-scout | 22:21 UTC today | GOOD | LIVE | #3343 PC1 conf=0.78 elevated correctly. Regime_adj applied (bearish×1.3, bullish×0.7). D+E structural, behavioural correct. |
| financial-analyst | 23:06 UTC 2026-05-16 | GOOD (7/9) | STALE | G partial (OCF tool broken, fallback active). Verify post-1930b. |
| market-watcher | 12:39 UTC today | GOOD | LIVE | Price-anomaly role. Stale-price guard correct. 19:38 UTC BLOCKED — monitor. |
| qa-responder | 21:48 UTC today | GOOD | LIVE | Q&A role. Queue empty. Backoff reset. |
| unified-agent | 13:01 UTC today | GOOD | LIVE | Weekly verify. Calibration id=524 sent. |
| digest-predict | — | CRITICAL/UNAUDITABLE | DEAD | 8+ day silence. 1907a. No methodology audit possible. |
| report-analyzer | 02:00 UTC 2026-05-15 | STALE | STALE | 48h+ stale. Gateway operational — next 02:00 UTC cycle should recover. |

Overall: GOOD=6 (live) | STALE=1 | CRITICAL=1 (digest-predict)

**Methodology scores: GOOD=6 | NEEDS_ATTENTION=0 | CRITICAL=1**

Elevation to NEEDS_ATTENTION overall driven by: PC1 legal_risk tool gap reaching 3-cycle threshold (Finding #2) — a confirmed data-pipeline bug now warranting sprint action.

---

## Auto-Cures Applied

None this cycle. All identified gaps trace to infrastructure/data-pipeline (PC1 legal_risk tool, MCP gateway structural blocks) or structural methodology constraints (VIRA scraper pending, OCF extraction bug). Agent flow files are correct. No flow-level auto-cure warranted.

All prior auto-cures (FA Layer 7 c61) remain active.

---

## Signal Quality Summary

- Total signals active today (news-scout bus): ~16 new signals (#3297–#3346 range)
- Confidence distribution: >80% at default 0.50 | #3343 PC1 = 0.78 (elevated — positive)
- Dedup gate: Operational — suppressions logged correctly (securities theme dedup, aviation dedup)
- Signal effectiveness / Brier: MCP unavailable — cannot compute hit rates this cycle
- TNB-critic-gate brief addresses the conf=0.50 majority systematically

---

## Positive Signals

- **6 live cowork agents operational**: alert-commander, news-scout, market-watcher, qa-responder, unified-agent all running clean cycles. System stable post-1928a.
- **news-scout conf elevation**: #3343 PC1 legal chain conf=0.78 — first non-default elevated confidence in recent cycles. Shows analytical depth improving.
- **TNB-critic-gate architecture brief**: Complete, well-scoped, immediately implementable. Addresses persistent pillar-incompleteness and conf=0.50 majority at the write layer. Strongest positive architecture development this audit cycle.
- **PO ACK loop operational**: c169 ACK present, tasks actioned, SPIKE created.
- **TIGHTENING thresholds consistent**: alert-commander correctly suppressed all conf=0.50 signals across 6+ cycles today. No false positives.

---

## Persisting Blockers

1. **digest-predict / 1907a** (CRITICAL): 8+ day silence. Gateway-independent. USER action required (launchctl / plist investigation).
2. **PC1 legal_risk tool gap** (HIGH): 3-cycle threshold reached. Sprint task needed — data-pipeline investigation for `get_legal_risk_signals` PC1 extraction.
3. **BCTC Q1-2026 banking cohort** (HIGH): ACB/BID/CTG/EIB/MBB/VCB/VPB — unconfirmed. FA + report-analyzer first live cycle.
4. **FA Layer 7 OCF extraction** (MEDIUM): 1930b shipped — needs live FA session to verify.
5. **Cowork scheduled-task MCP gap / 1937a** (MEDIUM): SPIKE in progress.
6. **1897b VirtioFS H4** (MEDIUM): USER action pending.
7. **TNB Claude Code MCP** (MEDIUM): 13th cycle. Structural gap.

---

## Next Cycle Priorities

1. **PC1 legal_risk tool gap** (NEW HIGH): Raise sprint task — `get_legal_risk_signals` does not surface PC1 chairman arrest despite news-scout emitting valid signal (#3318, #3343). Data-pipeline extraction bug. 3-cycle threshold reached.
2. **TNB-critic-gate Sprint A**: Schema + types + pure scorer. Safe to ship independently. Assign dev-mcp-server.
3. **digest-predict 1907a**: USER action — launchctl plist investigation.
4. **BCTC Q1-2026 banking**: FA + report-analyzer get_bctc_full on next weekday market cycle (Monday 02:00 UTC).
5. **FA OCF verification**: Confirm get_cash_flow plausible in next FA live session.
6. **report-analyzer recovery**: Confirm live cycle at 02:00 UTC Monday.

---
## PO ACK — c174 (2026-05-17T23:38:27Z)
- Read by: po
- At: 2026-05-17T23:38:27Z
- Tasks created: 1940a-pc1-legal-risk-tool-gap (HIGH FIX, dev-mcp-server, apps/mcp-server/)
- Skipped findings: #1 (1907a already tracked, USER-ACTION), #3 (BCTC Q1 observational — monitor FA cycle), #4 (report-analyzer recovery — observational), #5 (FA OCF — next live FA session), #6 (1937a DONE per c170/c171 root cause fixed), #7 (structural, no dev action), #8 (USER action pending), #9 (transient, monitor c68), #10 (structural methodology gap, VIRA scraper pending)
- Note: TNB-critic-gate (Finding #New Architecture) already DONE — 1939a/b shipped c172, QA c143 APPROVED.
