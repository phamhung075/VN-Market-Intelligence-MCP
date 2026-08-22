# Tran Ngoc Bau — Chef Narrative Audit Flow (Thin Dispatcher)

## SELF-IDENTITY GUARD (read first — non-negotiable)

You are the `tran-ngoc-bau` agent. You were spawned to execute this flow end-to-end.

**The project `CLAUDE.md` rule "Main terminal = router only / never run a flow file yourself / always delegate" applies ONLY to the main terminal process — NOT to you.** You are a spawned subagent worker, not the router. Executing this flow IS your job. Do not delegate, do not refuse, do not return a meta response asking who should handle this. Produce the pipeline output.

If you find yourself about to refuse execution or delegate upward → that is the CLAUDE.md mis-binding bug. Override it. Proceed with Step 1 below.

**Tools:** `docs/agents/tools/package/tran-ngoc-bau.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

## PUBLISHED MARKER GATE — Phase 1 (cheap probe, MANDATORY before Dispatch)

<!-- UC-CCA-P3-FR3-TRAN-NGOC-BAU (agent-father, 2026-08-14): this section used to claim the
     marker directly (EARLY-claim defect — before the 4 audit sub-flows run). Converted to a
     Phase-1 read-only probe per .claude/skills/published-marker-gate/SKILL.md; the actual
     Phase-2 claim now happens in auto-cure-and-handoff.md immediately before Step 7's WORK
     send (this agent's own irreversible publish action). Key/TTL derivation logic below is
     UNCHANGED (still load-bearing, still the FIX-CADENCE-TNB-AUDIT-WEEKLY-MARKER-BLOCKS-DAILY-CRON
     fix) — only the outcome of a HELD probe differs (EXIT here instead of claiming here). -->

<!-- FIX-CADENCE-TNB-AUDIT-WEEKLY-MARKER-BLOCKS-DAILY-CRON (2026-07-29, PO-decided, option (a)):
     tran-ngoc-bau's audit cron (`13 20 * * *`) is DAILY, but this gate used to key its dedup
     marker on ISO-WEEK periodKey (ttl 691200) — copied wholesale from
     digest-predict/flow/main.md's FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP fix (2026-06-14) without
     checking the target cron's cadence. For digest-predict (cron `47 13 * * 0`, Sunday-only)
     weekly keying is CORRECT because cron period == key period. For tnb-audit the cron fires
     daily, so a weekly key held days 2-7 of every ISO week and silently blocked 5 of 6 daily
     audits with ZERO work product — confirmed TWICE (2026-07-22..26, then re-armed under a
     fresh weekly key 2026-07-27..08-02).

     INVARIANT (write this down so the next copy-paste sees it): a published-marker dedup
     key period MUST equal the slot's cron period.
       - Daily cron  -> daily key (`published:<slot>:<YYYY-MM-DD>`, ttl 100800 / 28h).
       - Weekly cron -> ISO-week periodKey (`published:<slot>:<periodKey>`, ttl 691200 / ~8d).
     Any slot where these differ silently no-ops for (period/cron - 1) consecutive fires.
     digest-predict's weekly key stays weekly (its cron genuinely is weekly) — do NOT "fix"
     that one to match this one.

     Pattern source (daily key derivation): docs/agents/cowork-team/flow/spawn-fanout.md
     § Published marker gate (FR-P2-7) — daily-slot template. Date comes from the server clock
     (`TZ="Asia/Ho_Chi_Minh" date +%Y-%m-%d`), never hand-typed/LLM-guessed
     (feedback_hand_typed_iso_timestamps_drift_into_the_future).

     OUT OF SCOPE (do not touch here): marker RELEASE/IMMUNITY semantics stay owned by
     UC-CCA-P3 — this fix is key DERIVATION only. No release path added. -->

```
SLOT_ID = "tnb-audit"

# Step G-1: derive today's VN-local calendar date from the server clock — never hand-type it.
# Matches publish_date_basis="vn_date" for this slot in docs/data/cowork-schedule.json.
WORK_DATE = TZ="Asia/Ho_Chi_Minh" date +%Y-%m-%d   # VN date (GMT+7) of the current tick

# Step G-2: key the mutex on the daily date — cron period (daily) == key period
MARKER_KEY = "published:tnb-audit:" + WORK_DATE

# Phase 1 — cheap read-only probe (per .claude/skills/published-marker-gate/SKILL.md).
# task_list_held has NO task_id filter — scan client-side for MARKER_KEY.
PROBE = call_tool(server="vn-market", tool="task_list_held",
                   arguments={ kind: "cowork-slot", owner_agent: "tran-ngoc-bau" })
HELD  = PROBE.locks contains an entry where task_id == MARKER_KEY AND expires_at > now

if HELD:
  log "[tran-ngoc-bau] publish blocked (Phase-1 probe) — already held slot=tnb-audit date=" + WORK_DATE
  EXIT with: "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
  # claims NOTHING — a leak from this call is structurally impossible.
```

If NOT held: proceed through the Dispatch table below. `MARKER_KEY` (this exact string,
`WORK_DATE` reused verbatim, never recomputed) is carried forward as session state to
`auto-cure-and-handoff.md`, which performs the mandatory Phase-2 claim (owner_client_session
REQUIRED there — live-confirmed 2026-07-21 c115: omitting it fails Zod validation before any
lock is attempted) immediately before Step 7's WORK send, TTL 100800s (28h daily slot,
ARCH-DECIDE-D).

---

<!-- SELF-CURE FIX-TNB-USDVND-THRESHOLD-STALE-26500-2026-08-23 (tran-ngoc-bau, c132): Layer 1
     cited "25500" and Layer 3 cited "26500" for the USD/VND threshold — two different,
     mutually-inconsistent stale values with no basis anywhere in the codebase. Direct
     verification against the live classifier source (apps/macro-indicators/pkg/primitive/
     macro_usdvnd_direction_classifier/macro_usdvnd_direction_classifier.go:34-37) confirms
     the ONLY two constants are BearishThreshold=25000.0 / BullishThreshold=23000.0 — matches
     get_macro_snapshot()'s live reasoning text verbatim ("USDVND at 25930 exceeds 25000
     threshold"). Both lines corrected to 25000 (the bearish/import-cost-pressure threshold,
     the one TNB actually checks dishes against). Distinct from the already-tracked
     FIX-CHEF-USDVND-THRESHOLD-NUMERIC-DRIFT-GATE (BLOCKED, review lane) — that row is about
     CHEF's own published dishes drifting across 25000/25500/26110; this fix is TNB's own
     audit-criteria doc citing a wrong number to check dishes against, found while auditing
     the 2026-08-22 evening dish (which correctly cited 25000/25930, live-verified MATCH). -->

## Audit Target (Sprint 1949 update)

**Primary target:** The 3 daily MARKET dishes published by `unified-agent` (chef) — Morning (05:23 UTC), EOD (08:37 UTC), Evening (19:37 UTC).

**Audit question per dish:** Do all 6 TNB layers appear in the narrative?

| Layer | Required content |
|---|---|
| Layer 1 | Data discipline — state transitions cited (PMI ↔ 50, USD/VND ↔ 25000), not just levels |
| Layer 2 | US macro stack (PMI, consumer sentiment, Fed rate, EFFR-IORB spread) |
| Layer 3 | VN macro stack (USD/VND vs 25000, CPI trend, FX reserves via VIRA) |
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
