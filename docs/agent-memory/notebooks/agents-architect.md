# agents-architect — Notebook

## 2026-07-03T16:08:21Z

**Brief:** `docs/architecture-briefs/2026-07-03-severity-override-surfacing.md`

SEVERITY-OVERRIDE-SURFACING: PNJ (non-watchlist VN30) diamond-fraud prosecution detected by news-scout (#8371, confidence=0.95) reached zero persistent surfaces. Root cause = 3 independent scope leaks, not one gate: (A) CHEF's chef.md Step 0 GATHER never ingests bus-only `legal_risk`/`chain_catalyst`/`urgent_news` as a named input category at all; (B) fb-market-poster main.md:232 explicit "relevant watchlist tickers" text; (C) system-map.json's alert-commander sender_rules text omits the CRITICAL override that already exists code-side. Predicate: legal_risk riskType∈{prosecution,asset_freeze} (0.95 tier only) OR price_anomaly move_sigma≥4.0 & impact≥6; chain_catalyst/crisis_velocity already market-wide, no change. Primary surface: unified-agent CHEF daily dish. New shared skill `.claude/skills/severity-override-gate/SKILL.md` mirrors claim-truth-gate pattern.

**Signal filed:** `docs/data/orch/orch-state.json` `.signal_queue.rows[]` id=`arch-severity-override-surfacing-20260703` → po. Backlog task id: `FEAT-SEVERITY-OVERRIDE-SURFACING`.

---

## 2026-07-04T06:17:25Z

**Brief:** `docs/architecture-briefs/2026-07-04-systemic-remake.md`

SYSTEMIC-REMAKE: consumed the 64-agent forensic diagnosis (`docs/incidents/2026-07-04-systemic-review-churn-without-convergence.md`, 40 CONFIRMED findings) — did not re-derive it, designed the remedy sequence. Two phases. PHASE 1 (containment-now, ship now): RC-IDLE-LOOPS — port cowork `LOOP-07`'s only genuine pre-LLM no-work SILENT bail into dev-team + auditor Tier-2/3 (both currently persist+commit before/regardless of any idle check). RC-DETECTOR — promote 4 already-specced backlog fixes out of PLAN-ONLY/BACKLOG (context-bloat debounce, D4 per-finding id, signalqueue dup-id guard, B-05 freshness split) + wire the already-SPECCED-but-never-called READ→RESOLVED signal closure. RC-DRIFT — quarantine the confirmed-zero-reader `recurringBugEscalationFlag`, extend the existing tool-count generator chain into narrative docs. PHASE 2 (structural-remake): RC-VERIF+RC-CONVERGE — biggest call: reuse the EXISTING `orch-apply.sh`/`orch-validate.mjs` Zod choke point (every orch-state write already passes through it) rather than inventing a new verification service; add a `verification.raw_probe` requirement before `DONE_VERIFIED` + a sanctioned `DEGRADED` status reusing the already-proven money-radar/CCATO honest-NULL pattern; re-encode the recurring-bug-escalation protocol (confirmed fully absent from live `pm.md`/`architect.md` today, not just one-shot) as a bug-CLASS-keyed, auto-lift/re-arm mechanism. RC-ORCHMONO — finish the regressed 2026-06-26 hot/cold split (backlog-lane eviction was never added; no hot-ceiling gate). RC-GITSTATE — get pure-derived counters (tool-usage-stats.json, coverage-state.json) out of the git tree; the per-ticker stamping bug is a cowork-agent flow fix (market-watcher/news-scout), not developer's. RC-CEREMONY (P2, lowest, last) — two point-fixes only, its headline finding landed PLAUSIBLE not CONFIRMED.

**Signal dropped:** `docs/signals/2026-07-04-systemic-remake.json` → agent-father (full owner routing table in brief §5 — most of Phase 2 is po/pm/architect/developer work).

---

## 2026-07-07T20:44:10Z

**Brief:** `docs/architecture-briefs/2026-07-07-cowork-guaranteed-slot-durability.md`

COWORK-GUARANTEED-SLOT-DURABILITY: ruled Option A (generalize existing launchd firer via `cowork-match-slots.js` SSOT reuse, `guaranteed===true` filter, no hardcoded per-slot branches) over Option B (VPS has no LLM runtime/credentials — larger security surface, no benefit) for the 73h session-scoped dispatcher outage (07-04→07-07) that silenced all chef/digest/fb guaranteed slots. New finding beyond PO's payload: `fb-daily-firer.plist` was loaded and firing correctly 07-01→07-04, then silently unloaded with nothing detecting it — added a Tier-1 auditor self-check as required hardening, or the outage recurs even after the fix ships. Flagged `docs/protocols/cowork-master-cron-runbook.md` as stale (still describes retired RemoteTrigger Layer A as active/deletion-locked). Token cost ≈0 marginal (bash/node pre-gate, cold one-shot invocations, no session accumulation). `F-GATHERER-OFFHOURS-STALL-0704` explicitly closed as same root cause — no separate fix.

**Signal dropped:** `docs/signals/cowork-guaranteed-slot-durability-20260707T204410Z.json` → po
