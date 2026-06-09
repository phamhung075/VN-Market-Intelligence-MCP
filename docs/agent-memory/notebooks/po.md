# PO Notebook

## c · 2026-06-09T04:14Z — CI-RED-RECONCILE: P8 gate FAILED -> PARK schema-drift (PATH B) + open FU-CI-PROFILE-629 (po-S21)

**Trigger:** OOB ci_red `docs/signals/ci-p8-gate-result-6295cb32-20260609T0410Z.json` (router CI-measured P8 native fail+error 631 vs 629 = +2 WORSE, P5 pattern reproduced; router already REVERTED apps/ to 629 baseline 880ffca6 byte-identical 2a6044b1, tsc clean, pushed). PO owns board; router owns push+gate. DJ-GATE-1.

**DECISION = PATH B (autonomous strategic pivot).** PARK schema-drift cluster best-effort-exhausted; 629 = schema-drift FLOOR. PIVOT sprint to full-corpus failure taxonomy, attack by ROI.
- WHY: schema-drift's BEST outcome removes only ~tens of 629 (the 4-5 table-MISSING classes self-heal repeatably heals) and even that nets ~breakeven (created_at x3 column-existence collision claws it back). 6 touches, 4 consecutive disproven fix-hypotheses (P5/P6/P7/P8) on ONE ROI-capped cluster that CANNOT reach /goal 0-fail by itself. Continuing = sunk-cost. A full-corpus taxonomy is the real unblock.
- created_at root cause (recorded for later): NOT a missing-DEFAULT — it's a column-EXISTENCE drift. A column-less competing CREATE TABLE wins the IF NOT EXISTS race on the fresh :memory: singleton. Missing DEFAULT would throw NOT NULL on INSERT, not 'no such column' on query. Revisit ONLY if taxonomy later shows schema-drift is largest/cheapest (it is demonstrably not).

**Board edits (1 atomic jq pass, commit-mutex held):**
- FU-SCHEMA-DRIFT-P8-IMPL (in_progress): REVIEW->REWORK (gate failed, reverted; effectively shelved, superseded by FU-CI-PROFILE-629 — note recorded). Single status key.
- FU-SCHEMA-DRIFT-P8 architect spike: KEPT DONE (direction sound, only created_at hypothesis disproven — spike-sound/fix-wrong, po-S18/19/20 precedent).
- +FU-CI-PROFILE-629 (architect SPIKE, TODO, timebox 120m, zone apps/mcp-server/): profile ALL 629 native fails -> cluster/root-cause/native-count, ranked attack order. Deliverable docs/architecture-briefs/2026-06-09-ci-629-failure-taxonomy.md. NO code change (gate = taxonomy delivered).
- Owner = architect (no dispatch row for test-corpus profiling; no-code root-cause taxonomy = SPIKE/design pattern; deliverable is a brief doc).

**SSOT discipline:** backlog 78->79 (+1 exactly), in_progress unchanged, done 122 unchanged, signal_queue.rows EXACTLY 56 preserved (no whole-object rewrite). Temp validated [ -s ] && jq -e . && size>600000 (701293) BEFORE mv. commit-mutex (task_kind:commit-mutex owner:po ttl 120s) claimed+released around write to serialize vs cowork */15 dispatcher. Commit 09b0b43d (2 owned paths, explicit pathspec, NOT pushed — router owns).

**LESSON:** After N consecutive disproven fix-hypotheses on a cluster whose best-case ROI is capped well below the goal, STOP escalating to the next touch — PARK it as best-effort-exhausted and profile the whole corpus to attack by ROI. Iterating the lowest-ROI surface is sunk-cost even when each spike is individually sound. Open the diagnostic/taxonomy spike, NOT the next dev impl (WIP gate + don't churn).

## Carry-over
- ROUTER OWNS: push (this notebook + journal + orch-state commit 09b0b43d, 3 ahead of origin) + dispatch FU-CI-PROFILE-629 to ARCHITECT (SPIKE 120m, full-corpus 629 taxonomy) BEFORE any attack dev task. Do NOT open the next attack task until taxonomy delivered (gated). WIP<=2 honored (architect lane, 0 IN_PROGRESS).
- Schema-drift PARKED: no 7th touch. created_at column-existence diagnosis archived in po-S21 journal if ever needed.
- Still-open from prior cycles (router routing): FIX-NEWS-VPS-CRASH-LOOP (ops-vps-fetch), FIX-VNSTOCK-FUNDAMENTALS-CRASH-SPIKE (covers bctc-discover), Bug A FIX-NEWS-VPS-HEALTH-SQL needs mcp-server container REBUILD (ops) for live false-UNHEALTHY benefit.
