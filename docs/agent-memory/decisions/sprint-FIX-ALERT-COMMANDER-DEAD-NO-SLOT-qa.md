# Decision Journal — Sprint FIX-ALERT-COMMANDER-DEAD-NO-SLOT · qa

**Sprint goal:** Restore alert-commander cowork slots (dead ~5.5wk, zero slots) so CRITICAL-always
override (legal_risk/verified_chain/crisis_velocity) surfaces market-moving events again.
**Agent:** qa
**Started:** 2026-07-03T19:05:00Z

---

### STEP qa-S1 · qa · 2026-07-03T19:05:00Z
**task-id:** FIX-ALERT-COMMANDER-DEAD-NO-SLOT
**what-done:** DoD-gated cowork-refactory-expert commit 6b86a47aa (3-file config+doc scope: cowork-schedule.json 2 slots, system-map.json:1312 text, own decision journal). Verdict: PASS.
**what-considered:**
- jq -e validity both files: exit 0/0. Slot field-shape diffed against 3 references (news-scout-offhours, bctc-analyst-slot-1, sibling alert-commander slot) — full parity, `_note` is an established optional field (9 other slots use it).
- Cron sanity: ran actual cron-matcher test suite (`scripts/agents-flow/cowork-match-slots.test.js` 16/16 pass) which exercises `*/15 2-8 * * 1-5` verbatim as a fixture; `0 */4 * * *` byte-identical to news-scout-offhours (proven cron).
- system-map:1312 text cross-checked against alert-policy.md:46 CRITICAL override row + cycle.md:17 + stage-signals.md:21 — accurate, no overstatement.
- flow_path `docs/agents/alert-commander/flow/main.md` exists (test -f confirmed).
- 0 process.env/secret/UUID-leak hits in the 3 changed files; commit --stat confirms exactly 3 files, no board/orch-state/code touch.
**why-decision:** All 5 router DoD items independently reproduced with raw tool output (not narrated). Config values are faithful to their own stated intent.
**why-change:** no change from plan — Smart-Skip applied (0 .ts files touched → DDD/tsc/full-suite N/A by spirit of Smart-Skip; ran 2 directly-relevant existing test files instead of full suite).

### STEP qa-S2 · qa · 2026-07-03T19:05:00Z
**task-id:** FIX-ALERT-COMMANDER-DEAD-NO-SLOT
**what-done:** Traced the reactivation-flood-risk question (router DoD item 4) into actual tool source, not just flow docs.
**what-considered:**
- verified_chain/urgent_news path: sourced via `get_cycle_bootstrap`→`get_agent_signals(status="unread")` — bounded by `expires_at > now` (TTL 120min default) AND marks fetched rows `read` on retrieval (agentSignalStore.ts:896-913). Self-limiting — NOT a flood risk.
- crisis_velocity path: `get_crisis_early_warning` computes a live "current hour window" velocity spike (getCrisisEarlyWarning.ts:71) — not a historical replay. NOT a flood risk.
- legal_risk path: stage-bootstrap.md:42 calls `get_legal_risk_signals()` bare (no days/hours_back arg anywhere in flow docs or tools/package/alert-commander.md). Tool defaults to `days=30` (legalRiskTools.ts:236), queries `alerts`+`agent_signals` by `created_at >= cutoff` ONLY — no `expires_at` check, no read/consumed-state, no already-alerted tracking. Stage 3 matrix (stage-signals.md:21) = `legal_risk | any | CRITICAL now` — no threshold. alert-policy.md explicitly bars suppression for legal_risk ("Internal Cooldown Rules ... never suppress"). `write_alert_verdict` is a blind append (alertVerdictTools.ts:63-93), no pre-check against existing verdicts.
- Partial mitigant: stage-dispatch-log.md:6-7 collapses >3 pending alerts into 1 digest message — bounds MESSAGE COUNT per cycle but does NOT stop the SAME event resurfacing as a fresh CRITICAL alert every subsequent cycle (every 15min market-hours / 4h off-hours) for up to 30 days post-event.
**why-decision:** CONFIRMED, evidence-backed gap — real, not guarded — but pre-existing in unmodified alert-commander flow docs + legalRiskTools.ts (this commit touches neither). Scoped as a mandatory follow-up (new BACKLOG task), not a block on this config-restoration commit, since (a) the 3 changed files are correct on their own terms, (b) fixing the gap requires touching flow/tool code out of this task's stated scope, (c) blocking would leave alert-commander dead longer — worse than a real-but-repeated CRITICAL legal-risk alert.
**why-change:** no change from plan — router explicitly allowed "CHANGES_REQUESTED or a noted follow-up"; chose follow-up given severity/scope tradeoff above.
