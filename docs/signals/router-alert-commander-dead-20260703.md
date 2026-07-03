# Repair: alert-commander silently DEAD ~5.5 weeks — missing cowork slot killed all real-time alerts (proximate cause of PNJ coverage miss)

- **Filed:** 2026-07-03 by router (during PNJ coverage-miss root-cause investigation, user-flagged)
- **Type:** repair_task_request → PO → backlog
- **Suggested task id:** `FIX-ALERT-COMMANDER-DEAD-NO-SLOT`
- **Severity:** HIGH (an entire real-time alert surface has produced ZERO output for ~5.5 weeks)
- **Scope:** small-to-medium — restore slot(s) in `docs/data/cowork-schedule.json` + reconcile doc-drift. Good `cowork-refactory-expert` or `po`-scoped decision candidate.
- **Relationship:** this is the **proximate/operational** cause; `FEAT-SEVERITY-OVERRIDE-SURFACING` (arch brief `docs/architecture-briefs/2026-07-03-severity-override-surfacing.md`, signal `arch-severity-override-surfacing-20260703`) is the **design/robustness** layer. Both are needed — resurrecting the agent restores ALL its alert duties; the CHEF severity-override removes the single-point-of-failure for market-moving events.

## Incident

User flagged 2026-07-03: PNJ (VN30 large-cap, NOT in the 34-ticker watchlist) had a diamond-cert **fraud prosecution** — "tin chấn động" — yet it never reached any user-facing surface. Router RAW-verified the full pipeline:

- **news-scout DID detect it, 3× today** (broad-scoped, not watchlist-gated): `legal_risk #8371` (c116) and `#8482` (c119), confidence **0.95**, "routed to alert-commander (non-watchlist high-severity)". Detection is healthy.
- **alert-commander — the routing target — is DEAD.** Its notebook `docs/agent-memory/notebooks/alert-commander.md` was last modified **27 May** (content "Last updated 2026-05-25 06:42 UTC"); no cycle has run since. news-scout routes legal_risk to an agent that never executes.

## Root cause (three compounding gaps)

1. **Missing cowork slot (definitive fix target).** `docs/agents/cowork-team/flow/main.md:9` lists `alert-commander` among **scheduled** cowork agents, and `.claude/skills/cron-cowork-team/SKILL.md` explicitly names an `alert-commander-market` sub-hourly slot the `*/15` dispatcher "covers". But `docs/data/cowork-schedule.json` `.slots[]` contains **NO alert-commander slot of any kind** (verified: `jq '.slots[].slot_id'` → chef×4, digest×2, tnb-audit, bctc-analyst×4, news-scout×2, market-watcher×2, refine-bctc×4, fb×2 — zero alert). The slot fell out of the SSOT (regression), so the dispatcher has nothing to fire → agent silently dead since ~May 25.
2. **Single point of failure.** The correct `legal_risk → CRITICAL always (fires regardless of watchlist)` override exists ONLY in alert-commander's flow (`cycle.md:17`, `stage-signals.md:21`, `stage-bootstrap.md:42`, `stage-dispatch-log.md:89`, `alert-policy.md:46`) and emits an ephemeral ≤140-char Telegram ping. One dead agent = zero surfacing for all market-moving non-watchlist events.
3. **Doc-drift (mis-diagnosis source).** `docs/data/system-map.json:1312` describes alert-commander sender_rules as *"Event-only — position-danger (3-condition) or watchlist-opportunity (4-condition) ONLY … Silent exit otherwise."* — this **omits** the `legal_risk`/`verified_chain`/`crisis_velocity` CRITICAL-always override that actually exists in the flow. The stale text is what makes alert-commander read as purely watchlist-scoped.

## Impact (beyond PNJ)

For ~5.5 weeks NO real-time alert of ANY class has fired from alert-commander: position-danger, watchlist-opportunity, `verified_chain`, `legal_risk`, `crisis_velocity`. Every one of these has been silently dropped. PNJ is simply the first one a human noticed.

## Proposed fix

1. **(a) Restore alert-commander slot(s) in `docs/data/cowork-schedule.json`** (primary). Confirm the intended cadence — the skill references `alert-commander-market` (market-hours sub-hourly). Decide market-hours-only vs also off-hours (legal/crisis events break outside market hours too — PNJ example fired off-hours). Write atomically (tmp+mv). PO to confirm intended state: **resurrect** (expected) vs **formally retire** (if superseded by `FEAT-SEVERITY-OVERRIDE-SURFACING` — but then position-danger/opportunity duties must be rehomed first).
2. **(b) Reconcile `system-map.json:1312`** sender_rules text to include the CRITICAL-always override (kill the doc-drift).
3. **(c) Add a liveness guard** so a scheduled agent producing zero cycles for > N days raises a system-auditor anomaly (this regression went unnoticed 5.5 weeks — the auditor's passive-health checks did not catch a scheduled-but-unscheduled agent). Ref: `feedback_passive_health_masks_dead_data`.

## Evidence

```
# alert-commander notebook mtime:  27 May 13:16  (now 2026-07-03)  → ~5.5 weeks stale
# cowork-schedule.json slots — NO alert entry:
jq -r '.slots[].slot_id' → (chef-morning|intraday|eod|evening, digest-sunday|daily, tnb-audit,
   bctc-analyst-slot-1..4, news-scout-offhours|sentiment, market-watcher-offhours|eod,
   refine-bctc-slot-1..4, fb-daily|fb-weekend)  # zero "alert-*"
# but declared scheduled: docs/agents/cowork-team/flow/main.md:9 lists alert-commander
# and legal_risk override IS live in code: alert-policy.md:46 "CRITICAL override: Always fires: legal_risk"
# news-scout routed PNJ legal_risk conf0.95 to alert-commander 3× today (c116 #8371, c119 #8482) → received by nobody
```
