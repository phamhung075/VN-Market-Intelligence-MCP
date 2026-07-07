# PO Notebook

_Last: 2026-07-07T21:00Z_

## Tick 2026-07-07T21:00Z — SIGN-OFF architect brief (cowork guaranteed-slot durability) + dispatch via board

Read `docs/architecture-briefs/2026-07-07-cowork-guaranteed-slot-durability.md` in full. **SIGNED OFF — full concurrence, no push-back.** Ruling = Option A generalized (reuse `cowork-match-slots.js` matcher filtered `guaranteed===true` to drive ONE launchd firer); Option B (VPS) correctly rejected (no LLM runtime/creds, security-surface increase). Architect's token-cost analysis refutes my 160k/day worst-case (cold `claude -p` one-shots don't accumulate; node pre-gate = ~0 on no-op ticks). Silent-unload finding (fb-firer fired 07-01→07-04 then unloaded undetected) → Tier-1 auditor self-check is the essential recurrence-preventer; I elevated it med→HIGH.

**Dedup win:** board already tracked this as 2 stale F1-epic rows — did NOT mint duplicates.
- `F1-LAUNCHD-COWORK-BACKSTOP` (F1.4, per-slot design) → RE-SPEC to brief's generalized matcher-driven firer + PROMOTE backlog→ready (developer).
- `FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED` (07-03 SPOF incident) → RE-SPEC to brief §3.8 concrete probe-extension + PROMOTE backlog→ready (developer, med→high).
Minted only genuinely-new: `OPS-COWORK-GUARANTEED-SLOT-INSTALL` (ops, backlog HELD on firer), `DOC-COWORK-CRON-RUNBOOK-FRESHEN` (agent-father, ready), `QA-COWORK-SLOT-SESSION-DOWN-SURVIVAL` (qa, backlog HELD on install+auditor = the DoD gate).

**Signal gate:** `atb-cowork-guaranteed-slot-durability-20260707T203223Z` stays **READ (NOT resolved)** — stamped `resolution_gated_on: QA-COWORK-SLOT-SESSION-DOWN-SURVIVAL`. Resolve ONLY after brief §6 7-point session-down test passes. F-GATHERER-OFFHOURS-STALL-0704 = same root cause, no board row, no work item (brief §7 — decision-journal note only).

**Writes:** 1 atomic pass via `scripts/po-s141-...jq | orch-apply.sh` (rc0; backlog net 0, ready +3, sprint_goal +1; dry-run conservation + idempotency delta-0 verified pre-apply). Head untouched (KD-OBS-01-FIX active). **PO does NOT spawn — gateway-blind subagent; returned BATCH to router for per-agent PRE-CLAIM + spawn.** Dispatchable NOW: F1-LAUNCHD-COWORK-BACKSTOP, FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED (developer); DOC-COWORK-CRON-RUNBOOK-FRESHEN (agent-father).

## Prior — Tick 2026-07-07T20:32Z (triaged F-CHEF-MULTIDAY-OUTAGE → minted the repair signal now ruled on above)
Root cause: `*/15` cowork dispatcher session-scoped, no OS backstop; ~73h dead window silenced all guaranteed slots. Minted repair signal + queue row (PLAN-ONLY, needs architect ruling). → architect delivered the brief above.

## Carry-over
- **cowork-durability chain (this tick):** dev does firer+auditor (ready); ops install + qa survival-test are HELD on deps. **DO NOT resolve the signal until QA §6 7-point passes.** Then PO flips signal_queue row → RESOLVED.
- **CI-RED-c5b5f885-FIX** (backlog, blocking) — real coding FIX; closes on ci_green after f71643fb. RETURNED for dispatch.
- **OPS-BCTC-REFINE-REPASS-NONBANK-5T** (+D2D=6 tickers) & **W5-FU-CTG** & **REFLOW-MBB** — ALL await the SAME user-gated ops rebuild+deploy, then one post-deploy batch reingest.
- **W5 deploy-gate rows in review[]** — deploy/USER-gated. Never promote/touch.
- **DEPLOY-GATE (standing):** any BCTC code/VPS fix → route gated deploy/verify to ops (OVERRIDE 07-03: delegate, don't wait).
- **SYSTEMIC-REMAKE-P1** — 4 promoted + 10 atomic held supervised; Phase-2 USER-GATED.
