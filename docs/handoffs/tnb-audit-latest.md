# TNB Audit — Cycle 61 — 2026-05-16 (file-evidence, MCP probe pending)

## Overall: NEEDS_ATTENTION
Direction: **IMPROVING** (1919 Docker DNS RESOLVED c132; market-hours alert cycles functional; new MCP instability at 05:56 UTC warrants monitoring)

---

## Previous Handoff ACK

`## PO ACK (c132)` present at 2026-05-16T00:31:43Z. PO noted 1919 RESOLVED, 1909c partial spot-check (VNM PASS / DIG FAIL), fa-shape-guard deferred, alert-precision HOLD. Direction IMPROVING confirmed.

---

## MCP Gateway Status (This Session)

**TNB MCP probe (1913 context):** This session runs via Claude Code with explicit MCP URL `https://zenmidi.com/mcp`. Probe via tool call not executed — audit conducted from file evidence per established protocol.

**Cowork sandbox MCP status:** RESTORED post-1919-fix. Confirmed across:
- alert-commander: live at 01:02 + 02:01 UTC 2026-05-16 (TIGHTENING, Brent $109.24)
- news-scout: live at 01:19 + 02:19 UTC 2026-05-16 (TIGHTENING, HVN salary cut signal)
- unified-agent: live at 01:00 UTC 2026-05-16 ("First successful cycle after 3 consecutive MCP-down blocks")
- qa-responder: live at 00:47 UTC 2026-05-16

**NEW instability at 05:56 UTC 2026-05-16:** news-scout ABORTED — "vn-market MCP server unreachable after 3 retries." Distinct from 1919 (Docker DNS). Intermittent server-side unreachability from cowork sandbox. Monitor next cycle.

---

## Findings

| # | Issue | Agent/Module | Severity | Category | Evidence |
|---|-------|-------------|----------|----------|----------|
| 1 | **Regime shift: TIGHTENING confirmed across multiple agents at 01:00–02:03 UTC 2026-05-16** | system-wide | HIGH | tracking | alert-commander 02:01 UTC: TIGHTENING, Brent $109.24 (+2.56σ), Gold $4,543.60 (-2.19σ), FII_OUTFLOW_RISK (-0.33%). news-scout 01:19 UTC: TIGHTENING, FII_OUTFLOW_RISK. unified-agent 01:01 UTC: TIGHTENING (live macro_snapshot). All from live macro_snapshot, not news-fallback. This is a regime change from NEUTRAL at market-hours 2026-05-15. |
| 2 | **news-scout payload.detail schema mismatch: urgent_news regime field = BULL/BEAR/NEUTRAL enum (not TIGHTENING)** | news-scout | HIGH | bug | 01:19 UTC 2026-05-16 cycle: "urgent_news regime field: BULL/BEAR/NEUTRAL enum (not TIGHTENING) — schema note logged." The regime field in urgent_news payload uses a different enum than the TIGHTENING/NEUTRAL/EASING enum used by macro_snapshot and expected by alert-commander. Could cause alert-commander to misread regime from signal payload text. Escalate as BUG. |
| 3 | **digest-predict: 5+ day silence (last session 2026-05-11 21:38 UTC)** | digest-predict | CRITICAL | tracking | Notebook shows "(no session recorded)." No entry for 2026-05-12 through 2026-05-16. 1907a CRITICAL OPS. Now 5+ days without any MARKET digest. Gated on 1913 and sprint assignment. |
| 4 | **financial-analyst: no session recorded since 2026-05-14 23:01 UTC** | financial-analyst | HIGH | tracking | FA notebook last entry: 23:01 UTC 2026-05-14. No 2026-05-15 or 2026-05-16 session. FA runs at 23:00 UTC daily — at least 1 session (2026-05-15 23:00 UTC) expected but absent. Post-1919-fix, FA should have run. Check if FA cron is scheduled and firing. |
| 5 | **FA Layer 7 G-gap: OCF anomaly dismissed without forensic fallback (4 cycles)** | financial-analyst | medium | methodology gap | 2026-05-11, 12, 13, 14 sessions all log "OCF/NI anomalous — extraction error" and skip Layer 7 gate entirely. Per tnb-methodology.md Layer 7: when NI is available, forensic gate must be passed or explicitly failed with a recorded reason. AUTO-CURE APPLIED this cycle to stage-analyze.md. |
| 6 | **FA Layer 8 H-gap: get_investment_clock_phase not in package (4 cycles)** | financial-analyst | medium | bug | 4 consecutive cycles: "Layer 8: insufficient_data / get_investment_clock_phase not in package." Layer 8 cannot be satisfied without this tool. BUG for dev — add tool to FA package or expose investment clock phase via an existing tool. |
| 7 | **news-scout MCP instability at 05:56 UTC 2026-05-16 (post-1919-fix)** | news-scout/infrastructure | medium | tracking | news-scout 05:56 UTC: ABORTED — "vn-market MCP server unreachable after 3 retries. host.docker.internal:3000 inaccessible." Distinct from 1919 (Docker DNS fix confirmed). Possible: MCP server process crash at ~05:56 UTC. Monitor at next market-hours cycle (next weekday 01:00 UTC). |
| 8 | **news-scout payload.detail pillars=/phase=/tier= unverified: 6th consecutive cycle** | news-scout | medium | methodology gap | Auto-cure applied c55. Cannot confirm presence of `pillars=` + `phase=` + `tier=` from notebook logs. Now 6 cycles unverified. Combined with Finding #2 (schema mismatch in regime field), escalate to BUG. |
| 9 | **BCTC Q1-2026 banking cohort: unconfirmed filing** | bctc-pipeline | HIGH | tracking | report-analyzer 02:00 UTC 2026-05-15: "7 bank/finco tickers hit deadline 15/05 — expect filings at 14:00 UTC cycle." No 14:00 UTC session recorded in report-analyzer notebook (last entry 02:00 UTC 2026-05-15). ACB/BID/CTG/EIB/MBB/VCB/VPB Q1-2026 filing status unknown. FA needs to confirm via get_bctc_full at next cycle. |
| 10 | **1909c-reparse-validation: partially confirmed (VNM PASS, DIG FAIL per PO c132)** | bctc-pipeline | HIGH | tracking | PO ACK c132: "1909c partial spot-check: VNM PASS / DIG FAIL." DIG Q4-2025 row still failing re-extraction. FA Layer 7 partially unblocked for VNM, still blocked for DIG. Sprint task row in TASKS.md Backlog. |
| 11 | **alert precision: 488 unknowns / 0 scored (bug 2874)** | alert-engine | medium | tracking | Unchanged from c60. Precision feedback pipeline stalled. No sprint owner. |
| 12 | **FII pipeline: fii_type=UNKNOWN every cycle** | infrastructure | medium | tracking | Unchanged. All fallbacks exhausted. Persistent. |
| 13 | **git HEAD.lock VirtioFS H4 race** | infrastructure | medium | tracking | unified-agent notebook: "git HEAD.lock recurring every ~4h. 1897b-carry USER ACTION open." |
| 14 | **1913 BLOCKING-F1: TNB MCP via Claude Code (this session)** | infrastructure/tnb | medium | tracking | TNB audit conducted via file evidence. MCP gateway probe not attempted via tool call this cycle. Cowork sandbox MCP restored (1919 resolved) — TNB Claude Code session is separate execution context. Status: cowork agents all live; TNB-specific probe deferred. |

---

## Auto-Cures Applied

1. **FA stage-analyze.md — Layer 7 OCF anomaly fallback** (Finding #5, 4-cycle threshold exceeded):
   - Added explicit instruction: when OCF is flagged as extraction_error/anomalous AND NI is available, apply manual accrual fallback (accrual_ratio = (NI - OCF) / abs(NI)), set earnings_quality_warn accordingly, never log "Layer 7 skipped" when NI data is available.
   - File: `.claude/flows/financial-analyst/stage-analyze.md`

---

## Methodology Scores (Layer 5, 9-step) — c61 (file-evidence)

| Agent | Score | Status | Key Gaps |
|-------|-------|--------|----------|
| alert-commander 02:01 UTC (2026-05-16) | 2/3 applicable | NEEDS_ATTENTION | E=✗(VIRA not cited), C=✗(transmission chain shallow for HVN suppression) |
| alert-commander 01:02 UTC (2026-05-16) | n/a (0 signals) | PASS | Clean cycle |
| news-scout 01:19 + 02:19 UTC (2026-05-16) | 3/7 applicable | NEEDS_ATTENTION | D=✗(PMI absent — structural), E=✗(VIRA not cited), H=✗(payload.detail schema mismatch), I=✗(no source-tier tagging) |
| financial-analyst 23:01 UTC 2026-05-14 | 4/7 applicable | NEEDS_ATTENTION | E=✗(VIRA not cited), G=✗(OCF dismissed — AUTO-CURED), H=✗(investment clock not in package — BUG) |
| unified-agent 01:00 UTC (2026-05-16) | n/a (prediction mode) | PASS | Clean prediction review cycle |
| digest-predict | n/a (5+ day silence) | CRITICAL/UNAUDITABLE | 1907a. No MARKET digest. |
| financial-analyst 2026-05-15 23:00 UTC | MISSING SESSION | UNAUDITABLE | No notebook entry. Check FA cron. |

---

## Positive Signals

- **1919 Docker DNS RESOLVED**: All cowork agents confirmed live post-00:23Z 2026-05-16. alert-commander, news-scout, unified-agent, qa-responder all operational.
- **TIGHTENING regime confirmed from live macro_snapshot**: All agents using live macro_snapshot (not news-fallback) at 01:00–02:03 UTC 2026-05-16. 1918a/1918b shape-guard working correctly — TIGHTENING returned cleanly, no shape validation error.
- **VN-Index ATH context**: VN-Index 1,925.46 confirmed ATH on 2026-05-14. Market now at TIGHTENING (Brent $109, Gold -2.19σ, FII_OUTFLOW_RISK) — correct tension flagged across agents.
- **HVN correctly suppressed TIGHTENING**: HVN urgent_news conf=0.50 suppressed at 02:01 UTC (threshold 0.75 for TIGHTENING). Correct logic applied.
- **news-scout dedup working**: VIC/GAS chain_catalysts at 02:19 UTC correctly suppressed (already on bus <180min). Dedup API functioning.
- **Auto-cure: FA Layer 7 fallback** applied this cycle — will enforce forensic gate even when OCF data is extraction-error flagged.

---

## Persisting Blockers

1. **digest-predict / 1907a** (CRITICAL): 5+ day silence. No MARKET digest for users. PO escalate from Backlog to sprint with owner.
2. **FA missing session 2026-05-15 23:00 UTC** (HIGH): Financial-analyst expected but no notebook entry. Check FA cron firing post-1919 fix.
3. **BCTC Q1-2026 banking** (HIGH): ACB/BID/CTG/EIB/MBB/VCB/VPB Q1-2026 filing status unknown post-deadline 2026-05-15. Report-analyzer expected 14:00 UTC cycle but no entry. FA needs to verify at next cycle.
4. **1909c-reparse DIG FAIL** (HIGH): DIG Q4-2025 row still failing. Sprint task in TASKS.md Backlog.
5. **news-scout payload.detail schema mismatch** (HIGH): urgent_news regime field enum mismatch (BULL/BEAR/NEUTRAL vs TIGHTENING/NEUTRAL/EASING). Escalate as BUG.
6. **FA Layer 8 missing tool** (medium): get_investment_clock_phase not in FA package. BUG for dev.
7. **MCP instability 05:56 UTC 2026-05-16** (medium): Intermittent server unreachability post-1919-fix. Monitor next market-hours cycle.
8. **alert precision N=488/0** (medium): Bug 2874. Unchanged. No sprint.
9. **FII pipeline fii_type=UNKNOWN** (medium): Persistent.
10. **git HEAD.lock H4 VirtioFS race** (medium): 1897b-carry USER ACTION open.

---

## Next Cycle Priorities

1. **FA missing session**: Check FA cron, confirm 2026-05-15 23:00 UTC session status. If silent → ops investigate.
2. **BCTC Q1-2026 banking**: FA next cycle — call get_bctc_full per ACB/BID/CTG/EIB/MBB/VCB/VPB. Exercise Layer 7 (with new fallback from auto-cure).
3. **news-scout schema bug**: BUG ticket for dev — urgent_news regime field enum must match TIGHTENING/NEUTRAL/EASING used by macro_snapshot and alert-commander.
4. **digest-predict / 1907a**: PO assign sprint owner. 5+ day MARKET digest gap.
5. **MCP instability monitoring**: Watch news-scout next market-hours cycle (Mon 01:00 UTC). If ABORTED again → ops investigate MCP server stability.
6. **1909c DIG reparse**: Dev complete DIG Q4-2025 row extraction. FA Layer 7 unblocked for DIG only after this.
7. **FA Layer 8 tool**: Dev add get_investment_clock_phase to FA tools package.
8. **news-scout payload.detail**: Next live session — inspect payload.detail for pillars=/phase=/tier=. BUG escalation if still absent (6-cycle pattern).
9. **alert precision bug 2874**: Assign sprint.
10. **1913 TNB probe**: Next TNB session — attempt live MCP tool call to confirm 1913 status.
