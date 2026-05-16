# TNB Audit — Cycle 62 — 2026-05-16 (file-evidence, MCP probe pending)

## Overall: NEEDS_ATTENTION
Direction: **STABLE** (1919 resolved, cowork agents operational since 01:00 UTC; new ~05:XX UTC MCP instability pattern now at 2 occurrences — not yet critical; FA still missing sessions; digest-predict silence at 5+ days)

---

## Previous Handoff ACK

`## PO ACK (c135)` present at 2026-05-16T03:25:57Z. PO read c61. Tasks created: SPIKE_1921a (urgent-news regime enum). All tracking/structural items skipped with reason. Direction IMPROVING confirmed.

---

## MCP Gateway Status (This Session)

**TNB MCP probe:** This session runs via Claude Code with explicit MCP URL `https://zenmidi.com/mcp`. File-evidence audit per established protocol.

**Cowork sandbox MCP status:** PARTIALLY OPERATIONAL. Confirmed live 01:00–04:21 UTC 2026-05-16 (news-scout, alert-commander, unified-agent, qa-responder). NEW: 05:02 UTC (alert-commander) and 05:19 UTC (news-scout) both BLOCKED — MCP unreachable. Recovered at 06:19 UTC (news-scout) and 07:01 UTC (alert-commander). Pattern: ~05:XX UTC MCP instability window, now 2nd occurrence (first 05:56 UTC per c61).

---

## Findings

| # | Issue | Agent/Module | Severity | Category | Evidence |
|---|-------|-------------|----------|----------|----------|
| 1 | **~05:XX UTC MCP instability pattern: 2nd occurrence confirmed** | infrastructure | HIGH | tracking | c61: news-scout ABORTED 05:56 UTC. c62: alert-commander BLOCKED 05:02 UTC + news-scout ABORTED 05:19 UTC. Both note "host.docker.internal:3000 DNS error / MCP unreachable." Recovery by 06:19–07:01 UTC. Pattern: ~05:00–06:00 UTC window. 2 consecutive Saturdays. Not at 3-cycle auto-cure threshold but approaching escalation. |
| 2 | **digest-predict: 5+ day silence (last session 2026-05-11 21:38 UTC)** | digest-predict | CRITICAL | tracking | Notebook: "(no session recorded)." Still no entry for 2026-05-12 through 2026-05-16. 1907a CRITICAL OPS. Now 5+ days since last MARKET digest. Gated on 1913 + sprint assignment. No change from c61. |
| 3 | **financial-analyst: no session recorded — 2 missing (2026-05-15 + 2026-05-16 23:00 UTC expected)** | financial-analyst | HIGH | tracking | FA notebook last entry: 23:01 UTC 2026-05-14. Expected 2026-05-15 23:00 UTC (missed per c61) and 2026-05-16 23:00 UTC (not yet — currently ~07:30 UTC). Per PO ACK c135: FA runs on Claude Desktop external trigger (same substrate as 1913). Not a codeable dev task. Monitor. |
| 4 | **BCTC Q1-2026 banking cohort: still unconfirmed** | bctc-pipeline | HIGH | tracking | report-analyzer last entry: 02:00 UTC 2026-05-15 (7 bank tickers hit Q1 deadline). No 14:00 UTC cycle per c61. No new report-analyzer entry in c62 period. ACB/BID/CTG/EIB/MBB/VCB/VPB Q1-2026 filing status unknown. |
| 5 | **news-scout payload.detail pillars=/phase=/tier= unverified: 7th consecutive cycle** | news-scout | medium | methodology gap | Auto-cure applied c55 (stage-signals.md). Verification gap is observational limitation (notebook log format does not expose payload.detail text). 7 cycles of unverified compliance. Monitoring limitation — not a new flow bug. Carry forward. |
| 6 | **news-scout E-gap (VIRA not cited): structural** | news-scout | medium | methodology gap | All cycles: VIRA not cited in signal sourcing. Structural — VPS scraper for VIRA pending. Not a flow file fix (architectural gap). Score impact: E=✗ every cycle. |
| 7 | **news-scout D-gap (PMI sub-components absent): structural** | news-scout | medium | methodology gap | All cycles: US PMI sub-components not checked before consumer/services cascade. Structural — news-scout does not fetch PMI data. Score impact: D=✗ every cycle. |
| 8 | **alert-commander 05:02 UTC BLOCKED** | alert-commander | medium | tracking | Same MCP instability window as Finding #1. Single alert-commander occurrence at 05:02 UTC (vs 05:19 for news-scout). No MARKET impact (Saturday off-hours, 0 signals in queue). |
| 9 | **1909c-reparse DIG FAIL** | bctc-pipeline | HIGH | tracking | Unchanged from c61. DIG Q4-2025 still failing re-extraction per PO ACK c135. Sprint task in TASKS.md Backlog. |
| 10 | **alert precision: 488 unknowns / 0 scored (bug 2874)** | alert-engine | medium | tracking | Unchanged. No sprint owner. |
| 11 | **FII pipeline: fii_type=UNKNOWN every cycle** | infrastructure | medium | tracking | Unchanged. Persistent. |
| 12 | **git HEAD.lock VirtioFS H4 race** | infrastructure | medium | tracking | Unchanged. 1897b-carry USER ACTION open. |
| 13 | **1913 BLOCKING-F1: TNB MCP via Claude Code** | infrastructure/tnb | medium | tracking | TNB audit via file evidence. Cowork sandbox MCP restored (1919 resolved). TNB Claude Code session is separate execution context. Status unchanged. |
| 14 | **news-scout urgent_news regime field enum mismatch (BULL/BEAR/NEUTRAL vs TIGHTENING)** | news-scout | HIGH | bug | SPIKE_1921a created by PO c135. Under active investigation. No resolution confirmed yet. Carry forward until sprint closes. |

---

## New Since c61

- **Finding #1 (NEW ESCALATED):** ~05:XX UTC MCP instability now at 2nd occurrence. Was "single occurrence / monitor" in c61. Now at watch threshold — if 3rd occurrence next Saturday (or any weekday cycle), promote to CRITICAL + ops investigation.
- **All other findings:** unchanged from c61 or downgraded (FA Layer 7 auto-cure applied c61 — status APPLIED, verify at next FA session).

---

## Auto-Cures Applied

None this cycle. c61 auto-cure (FA stage-analyze.md Layer 7 OCF fallback) remains the last applied cure. Verification pending — FA must run a cycle with OCF anomaly data to exercise the new fallback path.

---

## Methodology Scores (Layer 5, 9-step) — c62 (file-evidence)

| Agent | Score | Status | Key Gaps |
|-------|-------|--------|----------|
| alert-commander 07:01–08:06 UTC (NEUTRAL, firing) | 3.5/4 applicable | GOOD | C=partial (VCB NIM transmission not stated) |
| alert-commander 01:02–04:01 UTC (TIGHTENING, suppressing) | 3/3 applicable | GOOD | Clean |
| news-scout 03:19–06:19 UTC (TIGHTENING) | 4/7 applicable | NEEDS_ATTENTION | D=✗ (PMI absent — structural), E=✗ (VIRA not cited — structural), H=✗ (payload.detail unverified — 7 cycles) |
| financial-analyst 2026-05-14 23:01 UTC | NEEDS_ATTENTION (c61 score) | STALE | No new session — c61 verdict persists |
| unified-agent 01:00 + 03:00 UTC | 2/2 applicable | GOOD | Clean prediction review |
| digest-predict | CRITICAL/UNAUDITABLE | CRITICAL | 1907a. No MARKET digest. |
| report-analyzer | STALE (c61 score) | — | No new session since 02:00 UTC 2026-05-15 |

Overall methodology: GOOD=3, NEEDS_ATTENTION=2, CRITICAL=1, STALE=2

---

## Positive Signals

- **alert-commander market-hours quality improving**: 07:01–08:06 UTC cycles fired correctly — GAS surge, MACRO Brent high, VCB/GAS/VIC urgent_news. Regime (NEUTRAL) correctly applied. Conviction chain working.
- **VNH -9.09% HIGH alert fired (05:01 UTC)**: price_drop correctly triggered with regime-appropriate confidence. Alert pipeline end-to-end functional.
- **HVN TIGHTENING suppression working**: conf=0.50 < 0.75 threshold correctly suppressed across 3 cycles (01:02, 02:01, 03:01, 04:01 UTC). No false fires in TIGHTENING regime.
- **news-scout dedup working**: VIC Dragon Capital signal fired at 04:19 UTC, correctly suppressed at 06:19 UTC (<180min). Chain_catalyst Brent dedup working across cycles.
- **MCP recovery pattern**: After 05:XX blockage, both news-scout (06:19) and alert-commander (07:01) recovered without manual intervention. Self-healing within 1 cycle.
- **FA Layer 7 auto-cure applied (c61) and confirmed**: stage-analyze.md OCF fallback block is in place and verified. Ready for exercise at next FA session.

---

## Persisting Blockers (carry from c61)

1. **digest-predict / 1907a** (CRITICAL): 5+ day silence. No MARKET digest for users.
2. **FA missing sessions** (HIGH): 2026-05-15 + 2026-05-16 23:00 UTC. External trigger substrate (1913). Monitor.
3. **BCTC Q1-2026 banking** (HIGH): ACB/BID/CTG/EIB/MBB/VCB/VPB Q1-2026 filing status unknown. FA + report-analyzer must verify.
4. **1909c-reparse DIG FAIL** (HIGH): Sprint task in Backlog.
5. **news-scout payload.detail enum mismatch SPIKE_1921a** (HIGH): Under investigation.
6. **~05:XX UTC MCP instability** (HIGH): 2nd occurrence. Escalate if 3rd.
7. **alert precision bug 2874** (medium): No sprint.
8. **FII pipeline fii_type=UNKNOWN** (medium): Persistent.
9. **git HEAD.lock H4 VirtioFS** (medium): 1897b-carry USER ACTION open.
10. **1913 TNB MCP via Claude Code** (medium): Unchanged.

---

## Next Cycle Priorities

1. **~05:XX UTC MCP instability**: Monitor next market-hours cycle (Mon 01:00 UTC). If ABORTED again → ops investigation triggered (3-cycle threshold).
2. **FA session 2026-05-16 23:00 UTC**: Confirm FA fires. If absent → 3rd consecutive miss → pattern escalation.
3. **BCTC Q1-2026 banking**: FA next cycle — call get_bctc_full per ACB/BID/CTG/EIB/MBB/VCB/VPB. Layer 7 (with new fallback from auto-cure).
4. **SPIKE_1921a resolution**: PO track sprint closure on urgent_news regime enum. Confirm code fix deployed.
5. **digest-predict / 1907a**: PO — 5+ day MARKET digest gap requires sprint owner now.
6. **FA Layer 7 auto-cure verification**: Next FA session with OCF anomaly data should exercise the fallback. Log "Layer 7 fallback applied" or "Layer 7 fallback: OCF within bounds" to confirm cure is active.
7. **news-scout payload.detail**: Inspect full payload.detail at next live MCP probe session. BUG confirmation at 7th cycle.

---

