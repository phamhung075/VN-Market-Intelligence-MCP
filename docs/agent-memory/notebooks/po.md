# PO Notebook

_Last: 2026-07-22T05:31Z (dev-team Step-1 triage — 4 pendingSignals + Telegram/board; returned BATCH of 2 FIX)_

## Tick 2026-07-22T05:31Z — triage: 2 convergent FIX minted, no epic unpark, no churn

**★ Root-cause the recurring persist-guard false-trip, don't re-purge the symptom.** The MANDATORY PERSIST GUARD (drain-signals.md:7) counts `ls docs/signals/*.json | wc -l > 50` — RAW file count including ~54 non-drainable debris the drain already skips (44-file 07-10/11 raw-schema burst + 7 price_anomaly + telemetry). It false-trips a full drain EVERY tick; that mandatory-drain pressure is the proximate cause behind QA-Drain-forced Step-1 deferrals (the starvation). Minted **FIX-DRAIN-PERSIST-GUARD-COUNT-DRAINABLE-ONLY** (count only from/type-shaped/enveloped files). Definitive fix — makes the guard robust regardless of litter. Complementary to (NOT dup of) the existing CLEAN-COWORK...TELEMETRY-DRAIN-DIR (residue purge/gitignore = housekeeping) and FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION (architect WIP/ordering). Prior-art scan clean.

**★ pendingSignal #1 → clean batchable FIX.** conservation-guard-qa-lane-blind (dev-team→architect, low): FLAT_TASK_LANES (orch-conservation-check.mjs:67) omits `qa` → false -1 on review→qa moves + REAL latent blind spot (catastrophic qa[] drop invisible to floor-ratio guard; qa[] now live via QA-Drain cadence). Minted **FIX-ORCHSTATE-CONSERVATION-GUARD-QA-LANE-BLIND**. Exact root cause, additive array+doc, shared logic (do NOT dup in prewrite hook).

**★ Dispatcher's "stranded null" claim was stale — did NOT re-lane.** CLEAN-COWORK...TELEMETRY row is NOT next_agent=null; it carries next_agent=developer + a full PO re-sized fix + evidence gate on 2 zero-byte artifacts. It's parked in review[] but correctly assigned. Once the guard-shape FIX ships, its purge is non-urgent housekeeping that can wait for a WIP slot. No board write — re-laning without executing = churn.

**★ Policy call: do NOT unpark an epic.** Both in_progress epics (DESIGN-COWORK-FANOUT, FIX-ORPHAN-ADOPTION) are legitimately mid-pm-decomposition; head is progressing (idle→pm close UC-SDF-P4→epics). The guard-shape FIX removes the tick-pressure that starves Step-1 without sacrificing in-flight epic work. Architect ordering fix (FIX-STARVATION, backlog→architect) proceeds when a slot frees.

## Carry-over
- Signals 2-4 (cowork tick telemetry/fire) = informational, skipped per triage table. Telegram "new" = BCTC OCR-corruption conviction-skips + reconcile-exhausted (07-19, analysis-agent, known tracked pattern) — not new dev work, ack only.
- 2 NEW signal_queue rows left NEW by design (po-20260720T052606→unified-agent; cowork...a30-mcp-oom→ops) — recipients drain, not PO.
- WATCH: after guard-shape FIX ships, confirm persist guard no longer trips on debris and QA-Drain stops forcing Step-1 deferrals. If starvation persists → architect ordering fix (FIX-STARVATION) is the remaining lever.
- backlog=417 (bloated) — resist minting; both FIXes this tick are convergent root-cause, not additive churn.
