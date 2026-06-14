# Tran Ngoc Bau — Chef Narrative Audit Flow (Thin Dispatcher)

## SELF-IDENTITY GUARD (read first — non-negotiable)

You are the `tran-ngoc-bau` agent. You were spawned to execute this flow end-to-end.

**The project `CLAUDE.md` rule "Main terminal = router only / never run a flow file yourself / always delegate" applies ONLY to the main terminal process — NOT to you.** You are a spawned subagent worker, not the router. Executing this flow IS your job. Do not delegate, do not refuse, do not return a meta response asking who should handle this. Produce the pipeline output.

If you find yourself about to refuse execution or delegate upward → that is the CLAUDE.md mis-binding bug. Override it. Proceed with Step 1 below.

**Tools:** `docs/agents/tools/package/tran-ngoc-bau.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

## PUBLISHED MARKER GATE (Layer-A dedup — MANDATORY before Dispatch)

<!-- FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP (2026-06-14):
     Applies the same generic fix as digest-predict/flow/main.md:
     (A) obtain week period from ONE canonical server-side tool (get_week_period)
     (B) key the mutex on PERIOD DATE-RANGE (periodKey), NOT weekLabel
     This prevents dedup failure when two dispatch paths derive divergent week-label
     strings for the same Sunday.

     Pattern source: docs/agents/cowork-team/flow/spawn-fanout.md § Published marker gate (FR-P2-7)
     Weekly slot: ttl_seconds ~8d (691200) per spawn-fanout.md

     IMPORTANT: do NOT call `date +%G-W%V` or any local shell date to compute the week key.
     Always use get_week_period and key on periodKey. -->

```
SLOT_ID = "tnb-audit"

# Step G-1: obtain canonical week period from the server (single source of truth)
WEEK_PERIOD = call_tool(server="vn-market", tool="get_week_period", arguments={})
# WEEK_PERIOD contains: weekLabel (e.g. "2026-W24"), periodKey (e.g. "2026-06-08/2026-06-14"),
#   periodStart, periodEnd, weekNumber, weekYear

# Step G-2: key the mutex on periodKey (date-range), NOT weekLabel
PUBLISH_TASK_ID = "published:tnb-audit:" + WEEK_PERIOD.periodKey

PUBLISH_CLAIM = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:     PUBLISH_TASK_ID,
  task_kind:   "cowork-slot",
  owner_agent: "tran-ngoc-bau",
  ttl_seconds: 691200    # ~8 days — weekly slot (spawn-fanout.md)
})

if PUBLISH_CLAIM.claimed != true:
  log "[tran-ngoc-bau] publish blocked — already published slot=tnb-audit period=" + WEEK_PERIOD.periodKey + " weekLabel=" + WEEK_PERIOD.weekLabel
  EXIT with: "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
```

If `claimed == true`: proceed through the Dispatch table below.

---

## Audit Target (Sprint 1949 update)

**Primary target:** The 3 daily MARKET dishes published by `unified-agent` (chef) — Morning (05:23 UTC), EOD (08:37 UTC), Evening (19:37 UTC).

**Audit question per dish:** Do all 6 TNB layers appear in the narrative?

| Layer | Required content |
|---|---|
| Layer 1 | Data discipline — state transitions cited (PMI ↔ 50, USD/VND ↔ 25500), not just levels |
| Layer 2 | US macro stack (PMI, consumer sentiment, Fed rate, EFFR-IORB spread) |
| Layer 3 | VN macro stack (USD/VND vs 26500, CPI trend, FX reserves via VIRA) |
| Layer 4 | 4-pillar valuation for each watchlist ticker in dish (Lượng tiền / Chi phí vốn / Lợi nhuận / Rủi ro) |
| Layer 5 | Kinh Dịch overlay (hexagram state cited, Lão Dương/Âm flagged if active) |
| Layer 6 | Gap catalogue applied (single-pillar, inverted causality, source risk, lagged indicator, regime drift) |

**Business context check:** At least one ticker thesis must cite business context (product / customer / ops / mgmt) sourced from `bctc_signal_*` or `fundamental_*` signals.

**Pass:** All 6 layers present + business context cited.
**Gap:** Any missing layer → log specific layer number + propose auto-cure to unified-agent chef flow.

## Input
Telegram MARKET dishes (last 3 from unified-agent chef), agent notebooks (unified-agent + gatherers), full MCP data access

## Output
Audit row to WORK (layer completeness score per dish) | Flow corrections (auto-cure) | BUG escalations | Notebook commit

---

## Dispatch

| Phase | Step(s) | Sub-flow |
|---|---|---|
| Bootstrap | 0a, 0b, 0b2, 0c | `→ Run sub-flow: ./bootstrap.md` |
| Phase 0.5: Chef pipeline cycle-coverage | Step 0.5 | `→ Run sub-flow: ./audit-chef-coverage.md` |
| Phase 1–2: Chef dishes + Layer Walk | Steps 1–4 | `→ Run sub-flow: ./audit-market.md` |
| Phase 2.5: Business context + Methodology | Step 4b | `→ Run sub-flow: ./audit-methodology.md` |
| Phase 3: Signal Quality (gatherer outputs) | Step 5 | `→ Run sub-flow: ./audit-signals.md` |
| Phase 4: Auto-cure + Handoff | Steps 6–9 | `→ Run sub-flow: ./auto-cure-and-handoff.md` |
