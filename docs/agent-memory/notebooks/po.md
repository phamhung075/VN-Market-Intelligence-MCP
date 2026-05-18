# PO Notebook

## Last updated: 2026-05-18T17:18Z · Cycle: c194 — Sprint 1950 SCOPE EXPANSION (audit-driven hotfixes)

### c194 session summary

**Spawn:** Urgent triage. system-auditor commit `b47ccb67` (`docs/handoffs/agent-definitions-audit-2026-05-18.md`) found 3 CRITICAL + 2 YELLOW in agent definitions.

**Audit findings → triage decisions:**
1. **TNB cron mismatch** (`17 */4` actual vs `13 20` documented) → folded as **1950-T4 HOTFIX**. Couples to 1950-T2 just-shipped (commit `ad68cf5c`): T2's chef-coverage check expects daily 20:13 — will fire false-positive BUGs 6x/day on off-cadence :17 ticks. Must ship before 2026-05-18T20:17Z.
2. **digest-predict cron MISSING + scope conflict** → folded as **1950-T5 FIX**. Create cron-digest-predict.md `47 13 * * 0` + strip daily/Monday/monthly rows from flow main.md (keep Sunday only, per Sprint 1949-T5).
3. **5 oversized notebooks** (ops 2510L, market-watcher 2500L, qa-responder 2313L, pm 1038L, alert-commander 579L) → **MAINT-1950b LOW**. Archive to `docs/archive/notebooks/`. Not blocking.
4. YELLOW (semble-search `model:` field + orphan news-scout-cycle notebooks) → **MAINT-1950c LOW**. Pure hygiene.

**Master scheduler brief (cowork-master-scheduler):** Held for Sprint 1951. SPRINT-M scope (new cowork-scheduler agent + SSOT json + 5 phases) — independent of audit findings. agents-architect signal `2026-05-18T17:02:06Z` parked.

**In-flight verification:**
- 1950-T1 ✅ APPROVED qa commit `ef1ec748`, agent-father commit `f4688989`.
- 1950-T2 ✅ DONE agent-father commit `ad68cf5c` (just-shipped, signal `2026-05-18T17:15:14Z`).
- 1950-T3 ⏳ pending agent-father (runbook doc, LOW).
- 1950-T4 ⏳ NEW URGENT (cron hotfix, HIGH, deadline 20:17Z).
- 1950-T5 ⏳ NEW (digest-predict, MEDIUM).
- MAINT-1950b/c ⏳ NEW LOW (drain when agent-father idle).

**Files updated this cycle:**
- `docs/TASKS.md` — 4 new Backlog rows (1950-T4 HIGH HOTFIX, 1950-T5 MEDIUM FIX, MAINT-1950b LOW, MAINT-1950c LOW).
- `docs/SPRINT_GOAL.md` — Sprint 1950 header expanded with scope-expansion summary table + SAFE-COEXISTENCE rule.
- `docs/signals/po-2026-05-18T17-18-00Z-1950-scope-expansion.json` — request to BA for light spec on T4+T5 (MAINT skip BA per PO judgment).

**Decision rationale:** T4 fold-in vs HOTFIX-outside-sprint — chose fold because T4 directly enables T2 to function correctly; one logical unit. T5 fold-in vs architect-escalation — mechanical alignment to Sprint 1949-T5 already-architected decision; no scope question. MAINT defer — token-economy real but non-destructive.

### Carry-over for next cycle

- **WATCH 2026-05-18T20:17Z:** If 1950-T4 not shipped, expect 1 false-positive `chef-coverage-low` BUG from TNB. Acknowledge as audit-trail confirmation T4 was needed; do NOT escalate.
- **WATCH 2026-05-19T05:23Z:** First guaranteed chef dish (Morning slot). With T1+T2 shipped, expect ≥2 WORK Telegrams (`[chef] START` + `[chef] SENT|SILENT`). Verify next cycle.
- **WATCH 2026-05-19T20:13Z:** First TNB audit cycle on correct schedule (after T4 ships). Should report chef-coverage = 3/3 if Morning + EOD + Evening all fired. If T4 NOT shipped → TNB still on :17 cadence, coverage check unreliable until T4 lands.
- **GATE 2026-05-20T07:22Z:** post-1945-verdict-resolution-scored-pct + post-1945-bug-storm-silence (UNCHANGED). Sprint 1948 still blocked. Decision point in 38h.
- **Sprint 1951 candidate:** cowork-master-scheduler brief (`docs/architecture-briefs/2026-05-18-cowork-master-scheduler.md`) — SPRINT-M, 5-phase, replaces ~17 scattered cron blocks with 1 cowork-scheduler agent reading `docs/data/cowork-schedule.json` SSOT. Open after Sprint 1950 closes (T3+T4+T5+MAINT all DONE).
- **USER-ACTION blockers unchanged:** 1907a (Claude Desktop restart for digest-predict MCP), 1897b (Docker .git/ exclusion VirtioFS). T5 closes digest-predict scope side; 1907a still needs user.
- **Recurring-bug counter:** chef pipeline 3 patches this sprint (T1 telemetry, T2 coverage audit, T4 cron fix). Not architect-escalation territory yet — patches are different files in different zones, all derive from one architect brief (`2026-05-18-cowork-reorder-and-cook-schedule.md`). If a 4th chef-touching FIX lands → reconsider.
- **Signal lifecycle:** processed 3 inbox signals (agent-father T1-done, agent-father T2-done, qa T1-approved). agents-architect cowork-master-scheduler READ-only (parked for Sprint 1951). 1 gatherer signal (`price_anomaly_20260518T1637.json`) left for chef.
