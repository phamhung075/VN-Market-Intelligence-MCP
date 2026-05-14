# TNB Audit — Cycle 51 — 2026-05-14 UTC

## Overall: STABLE
Direction: **IMPROVING** (auto-cure fired for news-scout inter-cycle dedup gap — 3-cycle evidence met; financial-analyst package correct but runtime still skipping G/H steps; digest-predict silence continues; MCP gateway 6th consecutive cycle blocked)

---

## MCP Gateway Status

Live probe attempted per error-boundary skill (`mcp__claude_ai_gateway__call_tool` → `health_check`). Tool not registered in this session scope. Result: NOT REGISTERED — 6th consecutive cycle (c46–c51). This is a live probe result per error-boundary skill requirement, not a memory assertion.

Impact: MARKET channel read blocked, signal bus direct audit blocked, Telegram dispatch blocked. All findings from notebook evidence (authorised pattern since c46).

SPIKE_C86_MCP_REG per PO c86 ACK remains unresolved. User-action item. Sprints 1909/1910 in-flight do not address session scope registration — that is a Desktop config gap.

---

## Findings

| # | Issue | Agent/Module | Severity | Category | Evidence |
|---|-------|-------------|----------|----------|----------|
| 1 | **MCP gateway not registered — 6th consecutive cycle (c46–c51)** | infrastructure / session | HIGH | escalation | Live probe: `mcp__claude_ai_gateway__call_tool` not found. Same result as c46/c47/c48/c49/c50. MARKET audit, bus audit, Telegram dispatch all blocked. User-action item (Desktop config). |
| 2 | **news-scout inter-cycle chain dedup gap — AUTO-CURE APPLIED** | news-scout | medium | AUTO-CURED c51 | 3-cycle evidence: c49 (06:22 IEA/CPI #3145 self-noted overlap), c50 (07:21 proactive suppress "all themes on bus"), c51 (09:21 VN-ATH/FPT-JV #3157/#3158 self-noted overlap with #3151/#3152 from 08:22). Pattern is systemic — not event-specific. Flow `stage-signals.md` updated with 180-min inter-cycle dedup gate before any `chain_catalyst` or `urgent_news` post. |
| 3 | **digest-predict: 5th day silence** | digest-predict | HIGH | tracking / escalation | Last entry: 2026-05-11 21:38 UTC. Notebook shows "(no session recorded)" as current state. Now 5 days without daily digest. Task 1907a-digest-predict-silence dispatched. No resolution visible. User-facing outage escalating. |
| 4 | **financial-analyst: runtime G/H/B step skip despite package update** | financial-analyst | HIGH | methodology gap | Package file (`financial-analyst.md`) contains `get_cash_flow`, `get_macro_snapshot`, `get_investment_clock_phase`. BUT: 2026-05-13 23:05 session explicitly logs "Layer 7: [SKIP] get_cash_flow not in package. Layer 8: [SKIP] get_investment_clock_phase not in package." This is a runtime MCP registration gap — tools are in package file but agent reports them absent at runtime. 1890a-spec-expanded package file was updated; MCP server may not have the tools registered. Dev team must verify MCP server-side registration, not just package .md. |
| 5 | **alert-commander: regime source NEUTRAL (news-fallback) at 10:03 UTC** | alert-commander | low | regime source | 10:03 UTC cycle: "Regime: NEUTRAL (news-fallback)" — fallback path used, not `get_macro_snapshot`. This is a regression from c48/c49 where get_macro_snapshot was confirmed working. May indicate snapshot tool returned error or empty at 10:03. Not confirmed as systematic — 1st cycle of evidence. Track. |
| 6 | **market-watcher: regime inferred from news at 19:39/21:38 UTC 2026-05-13** | market-watcher | low | regime source | 19:39 and 21:38 UTC cycles: "Regime: TIGHTENING (inferred: Fed rate hike fear/gold drop)" with note "Global Liquidity label absent from macro snapshot." c47 auto-cure fixed off-hours duplicate guard but regime source regression occurred on 2026-05-13 night cycles. Track for recurrence. |
| 7 | **VN-Index new ATH ~1,919 confirmed — regime NEUTRAL vs TIGHTENING split persists** | macro-watch | low | carry | news-scout shifted TIGHTENING→NEUTRAL at 09:21 UTC citing "geopolitical cooling (Hormuz), risk-on foreign inflow." alert-commander using NEUTRAL. unified-agent logging TIGHTENING at 06:00, TIGHTENING at 10:00. Split is not a system error — it is a genuine regime ambiguity (global liquidity vs US-rate cycle). Any MARKET bullish alert must carry caveat acknowledging the split. |
| 8 | **BCTC Q1/2026 banking cohort — VCB Q4-2025 filed, Q1/2026 deadline 2026-05-15 (tomorrow)** | financial-analyst | HIGH | tracking / catalyst | Unified-agent confirms VCB Q4-2025 filed 2026-05-14. ACB/BID/CTG/EIB/MBB/VCB/VPB Q1/2026 deadline is 2026-05-15 VNT. financial-analyst must run G-step (get_cash_flow) on VCB Q4-2025 at next cycle. If G/H steps are still skipped at runtime, the OCF forensic gate remains dark for the banking EPS window — the single biggest methodology gap per Layer 7. |
| 9 | **Sprints 1909/1910 in-flight — not yet deployed** | infrastructure | medium | tracking | 1909 (BCTC OCF extractor + get_bctc_ocf tool) and 1910 (FRED ISM subcomponents + EFFR package-reg) are spec-complete per docs/specs/. No deployment confirmation visible in notebooks. D-step (ISM subcomponents) and G-step OCF remain dark until deployed. |

---

## Methodology Audit (Layer 5, 9-step) — by agent

```
[Methodology] alert-commander   A=✓ B=? C=✓ D=n/a E=n/a F=n/a G=n/a H=n/a I=✓
  SCORE: GOOD (4/5 effective — B-step uncertain at 10:03 UTC: news-fallback used, not snapshot)
  evidence: 08:02 UTC NEUTRAL regime, dedup clean (FPT σ=2.41<4.0 suppressed). 10:03 UTC NEUTRAL via news-fallback (regression). FPT σ=3.61<4.0 correctly suppressed. No MARKET fire — correct given no active price alerts and σ < 4.0 override.
  gap: B-step regime source regression at 10:03 (news-fallback vs get_macro_snapshot). 1st cycle of evidence.

[Methodology] news-scout        A=✓ B=✓ C=✓ D=n/a E=n/a F=n/a G=n/a H=n/a I=✓
  SCORE: GOOD (4/4 effective) + AUTO-CURE APPLIED
  evidence: Regime TIGHTENING→NEUTRAL shift at 09:21 UTC documented with explicit reasoning (Hormuz geopolitical cooling, foreign buying reversal). VN-ATH/FPT-JV signals #3157/#3158 fired with proper regime adj. Self-noted dedup overlap at 08:22/09:21 cycles — proactive quality behavior.
  gap B-new (inter-cycle dedup): AUTO-CURED c51. stage-signals.md updated with 180-min dedup gate. Next cycle is first live validation.

[Methodology] market-watcher    A=✓ B=? C=✓ D=n/a E=n/a F=n/a G=n/a H=n/a I=n/a
  SCORE: GOOD (3/4 effective — B-step regime inferred from news on 2026-05-13 night cycles)
  evidence: 15:40/18:41 UTC cycles: NEUTRAL from snapshot. 19:39/21:38 UTC cycles: TIGHTENING inferred from news ("Global Liquidity label absent"). c47 auto-cure off-hours duplicate guard: WORKING (GAS/VRE suppressed at 10:03 UTC alert-commander as stale off-hours signals).
  gap: B-step regime source regression on 2026-05-13 off-hours cycles. Not yet 3-cycle confirmed — tracking.

[Methodology] unified-agent     A=✓ B=✓ C=✓ D=n/a E=n/a F=4/4 G=n/a H=✓ I=✓
  SCORE: GOOD (6/6 effective)
  evidence: Pillars M2✓ COC✓ EPS✓ POL✓ — 4/4 at both 06:00 and 10:00 UTC cycles. BCTC Q1 banking urgency carried (deadline TOMORROW). FPT conviction 0.53 declining trend explicitly noted. fii_type=UNKNOWN flagged. HEAD.lock escalated. VCB Q4-2025 filing self-detected and logged.
  gap F (minor persistent): POL logged as ✓ but no specific policy action cited. Same as c48/c49 — low severity.

[Methodology] financial-analyst  — PARTIALLY AUDITABLE
  SCORE: NEEDS_ATTENTION (2/5 effective — runtime G/H/B skip despite package update)
  Last session: 2026-05-13 23:05 UTC. Session log: "Regime: TIGHTENING (inferred from news 'nỗi lo Fed tăng lãi suất') | Max Deposit Rate: 6.00% (assumed — get_macro_snapshot not in package, data gap)."
  A=✓ B=SKIP(runtime gap) C=✓ D=n/a E=n/a F=n/a G=SKIP(runtime gap) H=SKIP(runtime gap) I=✓
  CRITICAL: package file has all 3 tools. Runtime session reports them absent. This means 1890a-spec-expanded package .md edit did NOT fix the problem — it is a server-side MCP tool registration gap, not a package-file gap. Dev team must verify MCP server registers `get_cash_flow`, `get_macro_snapshot`, `get_investment_clock_phase`. Cannot auto-cure this — it is infrastructure, not a flow file.

[Methodology] report-analyzer   — UNAUDITABLE (no 2026-05-14 session visible in any notebook)
  VCB Q4-2025 filed 2026-05-14. report-analyzer should have processed at next cycle. Not confirmed.

[Methodology] digest-predict    — UNAUDITABLE (5-day silence — finding #3)
  Task 1907a-ops. No resolution. User-facing outage.

[Methodology] qa-responder      — operational (queue empty, no methodology calls)
```

**Scores:** GOOD=4 | NEEDS_ATTENTION=1 | CRITICAL=0 | UNAUDITABLE=3
**Top gap pattern:** financial-analyst runtime B/G/H skip — MCP server-side registration, not flow-file issue. Auto-cure cannot fix this; escalate to dev team.

---

## Auto-Cures Applied

### c51 Auto-Cure — news-scout inter-cycle chain dedup gate

**File modified:** `.claude/flows/news-scout/stage-signals.md`

**Evidence (3 cycles):**
- c49 (06:22 UTC 2026-05-14): #3145 IEA/CPI self-noted "may overlap with #3136/#3141"
- c50 (07:21 UTC 2026-05-14): Proactively noted "all key macro themes already on bus" — no signals fired but awareness not enforced by flow
- c51 (09:21 UTC 2026-05-14): #3157/#3158 VN-ATH/FPT-JV self-noted "may overlap with #3151/#3152 from 08:22 cycle"

**Pattern:** Systemic. Same-theme signals firing 1-2 cycles apart regardless of event type. Agent notices but flow has no enforcement gate.

**Cure applied:** Added inter-cycle dedup gate at top of Stage 3. Gate calls `get_agent_signals` for the last 20 chain_catalyst/urgent_news signals, checks for same event_type + overlapping sectors/ticker within 180 minutes, suppresses with explicit log if match found. Exception for direction reversal (bearish → bullish on new data).

**Next validation:** news-scout next cycle (~11:20 UTC). If IEA/CPI/ATH themes recur, dedup gate should fire and suppress without agent self-noting.

### Prior auto-cures — ROI tracking

**c47 AutoCure (market-watcher off-hours duplicate guard):** SUSTAINED — c51 evidence: alert-commander 10:03 UTC correctly suppressed GAS/VRE stale closing-price signals. Pattern clean.

---

## Persisting Blockers

- **MCP gateway session registration for TNB** — 6th consecutive cycle (c46–c51). User-action: update Cowork Desktop config. Highest-impact infra gap for audit quality.
- **Digest-predict: 5-day silence** — task 1907a dispatched. No visible resolution. Daily digest is primary user-facing morning briefing — escalate 1907a to CRITICAL if not already.
- **Financial-analyst runtime B/G/H skip** — Package file correct; MCP server-side registration likely missing `get_cash_flow`, `get_macro_snapshot`, `get_investment_clock_phase`. Cannot auto-cure — dev task. Urgent given BCTC Q1/2026 banking deadline TOMORROW (2026-05-15).
- **Sprints 1909/1910** — OCF extractor + ISM/EFFR pkg-reg. In-flight per specs. D-step and G-step OCF remain dark until deployed.
- **Alert precision scoring pipeline stalled** — unified-agent logs "N=0/434 scored" and bug 2874 open. Alert effectiveness tracking broken.

---

## Positive Signals

- **VN-Index new ATH ~1,919** — Broad market recovery. Foreign buying reversal on VIC/VHM/VRE/FPT confirmed at 09:21 UTC (news-scout). Pillar alignment strong (tech=TAILWIND in TIGHTENING/NEUTRAL transition).
- **News-scout self-noting quality** — Agent proactively flagging dedup overlaps every cycle. Quality behavior even before auto-cure enforcement. Post-cure, this behavior should translate into suppression, not just awareness.
- **Alert-commander dedup discipline** — FPT σ=3.61<4.0 correctly suppressed at 10:03. GAS/VRE stale signals correctly suppressed. No false MARKET fires.
- **Unified-agent Pillars 4/4 consistent** — Both 06:00 and 10:00 cycles. BCTC urgency self-carried forward correctly.
- **c47 auto-cure ROI sustained** — Off-hours duplicate guard still working after 4 cycles of verification.
- **VCB Q4-2025 BCTC filed 2026-05-14** — First banking filing for this window. report-analyzer should process. financial-analyst must run G-step on next cycle.

---

## Recommendation to PO

1. **financial-analyst runtime tool gap — dev urgent.** Package .md has all 3 tools. Runtime session still reports them absent. The fix is NOT a package-file edit — it is MCP server-side tool registration verification. Before BCTC Q1/2026 banking deadline (2026-05-15), dev team must confirm `get_cash_flow`, `get_macro_snapshot`, `get_investment_clock_phase` are registered on the vn-market MCP server and callable from financial-analyst cowork session. Suggest adding a `health_check` or `list_server_tools` probe at financial-analyst bootstrap Step 0 to self-detect absent tools.

2. **digest-predict silence (task 1907a)** — Now 5-day gap. Escalate to CRITICAL. Daily digest is the user's primary morning briefing. If ops diagnosis shows scheduler issue, fix scheduler. If agent issue, test agent manually.

3. **news-scout inter-cycle dedup auto-cure (c51)** — Applied to stage-signals.md. Validate on next news-scout cycle (~11:20 UTC). If dedup gate fires correctly on recurring IEA/ATH/FPT themes, mark auto-cure ROI confirmed.

4. **Alert precision scoring (bug 2874)** — 434 unknown outcomes, N=0 scored. Brier score and signal effectiveness are both dark. This blocks calibration tracking (TNB Layer 9 responsibility). Prioritise bug 2874 fix.

5. **TNB MCP session registration** — 6th cycle blocked. Remains user-action (Cowork Desktop config). Until resolved, TNB cannot read MARKET channel, probe signal bus, or dispatch Telegram quality reports. Audit quality is permanently degraded.

---

## PO ACK
_(pending c51 PO cycle)_

---
