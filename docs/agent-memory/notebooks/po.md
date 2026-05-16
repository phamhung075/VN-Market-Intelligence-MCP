# PO Notebook

## Last updated: 2026-05-16T03:25:57Z · Sprint: 1920 COMPLETE — c135 TNB c61 triage

### c135 session summary

**PREFLIGHT (from router):** HEAD.lock #43 cured (age=1360s, 0B, no live PID). Signals inbox EMPTY. In-Progress EMPTY. TNB c61 NEEDS_ATTENTION with new actionable findings.

**TNB c61 ACK at 2026-05-16T03:25:57Z** (`docs/handoffs/tnb-audit-latest.md` updated).

**Findings classification:**
- **Finding #2 → SPIKE_1921a-urgent-news-regime-enum-rethink** (HIGH SPIKE, zone `apps/mcp-server/`, architect, timebox 120m). Code-evidence confirmed: `UrgentNewsFindingDataSchema.regime` enum (`signalTypes.ts:215`) = `[NEUTRAL,BULL,BEAR]` wired to H3 confidence-threshold logic. macro_snapshot uses `[TIGHTENING,NEUTRAL,EASING]`. Two enums encode different concepts (market-direction vs monetary-policy); needs architect rethink before any FIX. Added to Backlog.
- **Finding #3 (digest-predict 5+ day silence)** — already 1907a CRITICAL OPS in Backlog. Same Claude Desktop trigger substrate as 1913 BLOCKING-F1 USER ACTION. NOT codeable until USER refreshes MCP gateway config. No new dispatch.
- **Finding #4 (FA missing 2026-05-15 23:00 UTC session)** — same Claude Desktop trigger substrate as 1907a/1913. Observational. NOT codeable; carry-forward.
- **Finding #6 (FA Layer 8 `get_investment_clock_phase` not in package)** — code-evidence falsifies the framing: tool IS in agentBootstrap.ts L77 + registry.ts L198 + stage-analyze.md L60. Same "not in package" + 4-cycle pattern as 1913. CONCLUSION: same gateway-side Claude Desktop registration mismatch as 1913; bundled into 1913, not a separate task.
- **Finding #9 (BCTC Q1-2026 banking unconfirmed)** — FA blocked by 1913 substrate (same as #4). Observational.
- **Finding #11 (alert-precision 488 unknowns)** — already in Backlog as monitoring, no promotion threshold met (< 550). Hold.
- Findings #5/#7/#8/#10/#12/#13/#14 — see ACK section in handoff (auto-cures applied, monitoring, or known carry-forward).

**Channel audit:** MCP gateway `https://zenmidi.com/mcp` still 1913 substrate. Cowork sandbox MCP restored post-1919 (TNB confirms agents live), but Claude Code session uses separate gateway = 404. WORK/BUG/MARKET unreadable from this terminal; not a fresh failure.

**No-Task Guard:**
1. In-Progress empty.
2. Todo (1862c-E/F) gated USER ACTION.
3. Backlog: SPIKE_1921a NEW (dispatchable), rest are monitoring or USER ACTION.
4. No new REQ/SPRINT_REPORT pending.

**PO decision:** BATCH([SPIKE_1921a-urgent-news-regime-enum-rethink]).

### Carry-over for next cycle (c136)

- **SPIKE_1921a progress:** architect must produce findings doc within 120m timebox. If ships → spawn FIX task with enum migration path. If H3 thresholds intact → low-risk rename; if migration breaks alert-commander reader → 2-step ship plan.
- **FA 2026-05-16 23:00 UTC session:** Verify FA fires post-TNB auto-cure. If silent → escalate Finding #4 to ops investigation.
- **news-scout MCP instability (Finding #7):** Watch next market-hours cycle (Mon 01:00 UTC). If 2nd ABORT → ops investigate MCP server stability separately from 1919.
- **BCTC Q1-2026 banking:** FA must call `get_bctc_full` for ACB/BID/CTG/EIB/MBB/VCB/VPB on next live cycle (gated on 1913).
- **1909c DIG reparse:** ops trigger pending.
- **1913 USER ACTION:** still BLOCKING-F1 — root cause of ~5 TNB findings (#3, #4, #6, #9, partially #11). Channel audit, FA cron, digest-predict cron, FA Layer 8 tool all degraded by this single F1.
