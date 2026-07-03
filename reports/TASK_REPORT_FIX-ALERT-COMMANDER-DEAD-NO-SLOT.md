## Task Report FIX-ALERT-COMMANDER-DEAD-NO-SLOT

**Scope verified:** commit `6b86a47aa` (cowork-refactory-expert) — exactly 3 files, 102 insertions / 1 deletion (confirmed via `git show --stat`):
- `docs/data/cowork-schedule.json` — +2 slots (`alert-commander-market`, `alert-commander-critical`)
- `docs/data/system-map.json:1312` — `sender_rules.alert-commander` text reconciled
- `docs/agent-memory/decisions/sprint-FIX-ALERT-COMMANDER-DEAD-NO-SLOT.md` — dev's own journal

No board / orch-state / production-code touch in this commit. 0 UUID/session leak (`grep -c` for both session tokens across the 3 files and the commit body = 0).

### 1. JSON validity
```
jq -e . docs/data/cowork-schedule.json  → exit 0
jq -e . docs/data/system-map.json       → exit 0
```

### 2. Slot correctness
```
$ jq -r '.slots[]|select(.slot_id|test("alert-commander"))|{slot_id,agent,flow_path,cron,guaranteed,policy_id,last_fired}' docs/data/cowork-schedule.json
alert-commander-market:   cron="*/15 2-8 * * 1-5"  guaranteed=false  policy_id=alert-commander-market   flow_path=docs/agents/alert-commander/flow/main.md
alert-commander-critical: cron="0 */4 * * *"       guaranteed=false  policy_id=alert-commander-critical flow_path=docs/agents/alert-commander/flow/main.md
```
- `flow_path` exists: `test -f docs/agents/alert-commander/flow/main.md` → EXISTS.
- Field-shape diff (`keys|sort`) between the 2 new slots and `news-scout-offhours` (existing proven cron slot): identical except `_note`, which is an established optional annotation used by 9 other slots (`digest-daily`, `bctc-analyst-slot-1..4`, `refine-bctc-slot-1..4`) — not an anomaly.
- Cron correctness cross-checked functionally, not just by eye: `node scripts/agents-flow/cowork-match-slots.test.js` → **16/16 pass**, and TC-4/TC-5 exercise `*/15 2-8 * * 1-5` verbatim as a fixture. `0 */4 * * *` is byte-identical to `news-scout-offhours.cron` (grep-confirmed) — the "matches proven off-hours cron" claim in the decision journal holds. `2-8 * * 1-5` (VN market-hours window) also matches `chef-intraday` (`13 2-8 * * 1-5`) — consistent with existing convention.

### 3. system-map:1312 accuracy
```
docs/data/system-map.json:1312
"alert-commander": "Event-only — position-danger (3-condition), watchlist-opportunity (4-condition),
  or verified_chain/legal_risk/crisis_velocity (CRITICAL always, no conditions). ≤140 chars.
  Silent exit if none fire."
```
Cross-checked against `docs/policies/alert-policy.md:46` (`**CRITICAL override** | Always fires: verified_chain OR legal_risk OR crisis_velocity (no gate)`), `docs/agents/alert-commander/flow/cycle.md:17`, and `stage-signals.md:21` (`legal_risk | any | CRITICAL now`). Text is accurate, no overstatement.

### 4. Reactivation-flood risk — CONFIRMED, NOT FULLY GUARDED (evidence below)

Traced each of the 3 CRITICAL-always signal types into actual tool source (not just flow docs):

| Signal | Source tool | Bound mechanism | Flood risk |
|---|---|---|---|
| `verified_chain` / `urgent_news` | `get_cycle_bootstrap` → `get_agent_signals(status="unread")` | `expires_at > now` (TTL 120min default) **and** fetched rows marked `read` on retrieval (`agentSignalStore.ts:896-913`) | Self-limiting — none |
| `crisis_velocity` | `get_crisis_early_warning` → `getCrisisEarlyWarning()` | Live "current hour window" velocity-spike computation (`getCrisisEarlyWarning.ts:71`), not a historical log | None |
| `legal_risk` | `get_legal_risk_signals()` (called bare — no `days`/`hours_back` arg anywhere in `stage-bootstrap.md:42` or `tools/package/alert-commander.md:61`) | Defaults to `days=30` (`legalRiskTools.ts:236`), queries `alerts` + `agent_signals` by `created_at >= cutoff` **only** — no `expires_at` filter, no read/consumed-state, no already-alerted tracking | **Real** |

`legal_risk` feeds Stage 3 matrix (`stage-signals.md:21`: `legal_risk | any | CRITICAL now`, no threshold), and `alert-policy.md` explicitly bars suppression (`Internal Cooldown Rules ... never suppress — Legal risk signals`). `write_alert_verdict` (`alertVerdictTools.ts:63-93`) is a blind append with no pre-check against existing verdicts for the same ticker/source. Net effect: any `legal_risk` hit inside the rolling 30-day window will be re-marked CRITICAL and re-evaluated on **every** subsequent cycle (every 15 min market-hours, every 4h off-hours) for up to 30 days after its `created_at` — nothing marks it "already alerted." Partial mitigant: `stage-dispatch-log.md:6-7` collapses >3 pending alerts into a single digest message, which bounds *message count per cycle* but does **not** stop the same event resurfacing as a "new" CRITICAL alert cycle after cycle.

This gap is **pre-existing** in unmodified alert-commander flow docs + `legalRiskTools.ts` (this commit touches neither file) — restoring the slots reactivates the path but does not create the bug. Given (a) the 3 changed files are correct on their own stated scope, (b) fixing the gap requires flow/tool-code changes out of this task's scope, (c) blocking would leave alert-commander dead longer (worse than a real-but-over-repeated legal-risk alert, which is accurate content, not fabricated data) — this is flagged as a **mandatory follow-up**, not a block on this commit. Recommend a new BACKLOG task: bound `get_legal_risk_signals()` consumption to a short recency window (e.g. since-last-cycle) or add an already-alerted dedup keyed on the agent_signals row id / alerts id before the next MARKET fire.

### 5. Scope discipline
`git show 6b86a47aa --stat` = exactly the 3 claimed files, no board/orch-state/code. `grep -c` for both session identifiers (this QA session UUID and the commit's own `claude.ai/code` session link) across the 3 files = 0/0 (no leak).

### Tests run
No `.ts`/production source files touched by this commit (JSON config + 2 markdown docs only) → full `bun test`/`tsc --noEmit` suite is out of scope per Smart-Skip spirit. Ran the two existing test files that directly exercise the touched surface instead:
- `bun test apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts` → 51 pass / 0 fail
- `node scripts/agents-flow/cowork-match-slots.test.js` → 16/16 pass (cron-matcher, exercises the exact 2 new cron patterns)

### Verdict: **PASS**
Config-restoration DoD (items 1, 2, 3, 5) fully green with raw evidence. Item 4 (reactivation-flood) is a real, evidence-backed, pre-existing gap in the `legal_risk` consumer path — explicitly called out per router instruction, routed as a mandatory follow-up rather than a block, since it is out of this commit's scope and blocking would perpetuate a strictly worse status quo (zero legal-risk coverage).

Router owns the review→done_verified board flip. QA did not touch `.task_board`/`orch-state.json`.
