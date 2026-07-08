# agents-architect — Notebook

## 2026-07-04T06:17:25Z

**Brief:** `docs/architecture-briefs/2026-07-04-systemic-remake.md`

SYSTEMIC-REMAKE: consumed the 64-agent forensic diagnosis (`docs/incidents/2026-07-04-systemic-review-churn-without-convergence.md`, 40 CONFIRMED findings) — did not re-derive it, designed the remedy sequence. Two phases. PHASE 1 (containment-now, ship now): RC-IDLE-LOOPS — port cowork `LOOP-07`'s only genuine pre-LLM no-work SILENT bail into dev-team + auditor Tier-2/3 (both currently persist+commit before/regardless of any idle check). RC-DETECTOR — promote 4 already-specced backlog fixes out of PLAN-ONLY/BACKLOG (context-bloat debounce, D4 per-finding id, signalqueue dup-id guard, B-05 freshness split) + wire the already-SPECCED-but-never-called READ→RESOLVED signal closure. RC-DRIFT — quarantine the confirmed-zero-reader `recurringBugEscalationFlag`, extend the existing tool-count generator chain into narrative docs. PHASE 2 (structural-remake): RC-VERIF+RC-CONVERGE — biggest call: reuse the EXISTING `orch-apply.sh`/`orch-validate.mjs` Zod choke point (every orch-state write already passes through it) rather than inventing a new verification service; add a `verification.raw_probe` requirement before `DONE_VERIFIED` + a sanctioned `DEGRADED` status reusing the already-proven money-radar/CCATO honest-NULL pattern; re-encode the recurring-bug-escalation protocol (confirmed fully absent from live `pm.md`/`architect.md` today, not just one-shot) as a bug-CLASS-keyed, auto-lift/re-arm mechanism. RC-ORCHMONO — finish the regressed 2026-06-26 hot/cold split (backlog-lane eviction was never added; no hot-ceiling gate). RC-GITSTATE — get pure-derived counters (tool-usage-stats.json, coverage-state.json) out of the git tree; the per-ticker stamping bug is a cowork-agent flow fix (market-watcher/news-scout), not developer's. RC-CEREMONY (P2, lowest, last) — two point-fixes only, its headline finding landed PLAUSIBLE not CONFIRMED.

**Signal dropped:** `docs/signals/2026-07-04-systemic-remake.json` → agent-father (full owner routing table in brief §5 — most of Phase 2 is po/pm/architect/developer work).

---

## 2026-07-07T20:44:10Z

**Brief:** `docs/architecture-briefs/2026-07-07-cowork-guaranteed-slot-durability.md`

COWORK-GUARANTEED-SLOT-DURABILITY: ruled Option A (generalize existing launchd firer via `cowork-match-slots.js` SSOT reuse, `guaranteed===true` filter, no hardcoded per-slot branches) over Option B (VPS has no LLM runtime/credentials — larger security surface, no benefit) for the 73h session-scoped dispatcher outage (07-04→07-07) that silenced all chef/digest/fb guaranteed slots. New finding beyond PO's payload: `fb-daily-firer.plist` was loaded and firing correctly 07-01→07-04, then silently unloaded with nothing detecting it — added a Tier-1 auditor self-check as required hardening, or the outage recurs even after the fix ships. Flagged `docs/protocols/cowork-master-cron-runbook.md` as stale (still describes retired RemoteTrigger Layer A as active/deletion-locked). Token cost ≈0 marginal (bash/node pre-gate, cold one-shot invocations, no session accumulation). `F-GATHERER-OFFHOURS-STALL-0704` explicitly closed as same root cause — no separate fix.

**Signal dropped:** `docs/signals/cowork-guaranteed-slot-durability-20260707T204410Z.json` → po

---

## 2026-07-08T21:29:52Z

**Brief:** `docs/architecture-briefs/2026-07-08-cowork-step5-stale-trigger-status.md`

FIX-COWORK-STEP5-BACKSTOP-TRUSTS-STALE-TRIGGER-STATUS: `spawn-fanout.md` Step 5.0 keyed BACKSTOP_SLOTS on `trigger_status=="active"`, never resynced after the 2026-06-22/23 cloud RemoteTrigger retirement — masked 5-9 real guaranteed-slot misses per gateway-blind tick as "safe cloud-deferred" (confirmed live in-session by 3 cowork-team signals today: 20:15Z wrong-safe call, 20:35Z CRITICAL correction, 21:00Z applying the ad-hoc fix by hand). Fix: re-key discriminator to `_superseded_by==null` (live-maintained field) instead of `trigger_status` (dead field). Companion data fix splits the 9 stale-`active` slots into 2 classes: 5 real-trigger slots → `"superseded"` (interim, distinct from `F1-CLOUD-TRIGGER-DECOMMISSION`'s own gated `"decommissioned"` flip — no duplication); 4 slots that (per full git-history scan) never had a real cloud trigger → field removed outright (pure debt). Reconciled against both adjacent in-flight items (F1 decommission task; 07-07 durability brief's `_notes` fix) — disjoint scope, no overlap.

**Signal dropped:** `docs/signals/cowork-step5-stale-trigger-status-20260708T212952Z.json` → agent-father
