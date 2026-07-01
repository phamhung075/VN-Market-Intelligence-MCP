# po-s135 — single-pass triple-mutation triage (idempotent), pipe through scripts/orch-apply.sh
# Origin 2026-07-01 dev-team tick 05:37Z (head idle, WIP=0, peer session e71c7736 died mid-tick — clean resume).
# M1 PROMOTE  BA-PREDICTION-EVIDENCE-REVIVAL backlog->ready (status=READY + promote stamps; next_agent=ba already set)
#            — the highest-value pending work; activates the first hop (ba) of sprint PREDICTION-EVIDENCE-REVIVAL.
#            Its two child stubs (FIX-EVIDENCE-PIPELINE-STARVED / FIX-PREDICTION-SIGNALS-EMPTY) already carry
#            specced_under=BA-PREDICTION-EVIDENCE-REVIVAL -> stay BACKLOG, must NOT double-dispatch.
# M2 MINT    SPIKE-TICK-SNAPSHOT-DEADCODE-OR-REGRESSED -> backlog (PLAN-ONLY, low) — cowork-fire 04:25Z NOTE:
#            cycle-snapshot-latest.json stale since 06-17; Step 4.7 promotion appears inert. RECURRENCE of the
#            class FU-TICK-SNAPSHOT-EMIT-DARK (DONE 06-05, claimed "class fully eradicated") -> per
#            recurring-bug-escalation, track a time-boxed dead-code-vs-regression SPIKE (consumer harm = none,
#            freshness-gated fallback proven 2wk). NOT dispatched this tick.
# M3 MINT    OPS-OHLCV-VPS-BACKFILL-STALL-NONWATCHLIST -> backlog (PLAN-ONLY, low, infra-vps) — telegram report
#            id=3366 (analysis-agent, normal): VPS backfill stalled after 5 retries; shallow codes BDI/DLC/JSH/
#            SIS/VDC all NON-watchlist; "manual VPS investigation required" = ops/infra not a coding lane; the
#            whole watchlist OHLCV-depth program is already DONE_VERIFIED. Anomaly->dev-task bridge: infra->BACKLOG.
# Head DELIBERATELY UNTOUCHED (router continues from the PO RETURN batch, not .head — po-s132/s134 precedent).
# Idempotent: M1 guarded by backlog-membership, M2/M3 id-guarded across ALL lanes -> re-run mutates 0.

([ .task_board | (.backlog,.ready,.in_progress,.review,.done,.done_verified)[]?
   | if type=="object" then .id else . end ]) as $all_ids
| ((($all_ids | index("BA-PREDICTION-EVIDENCE-REVIVAL")) != null)
   and ((.task_board.backlog | map(select(type=="object" and .id=="BA-PREDICTION-EVIDENCE-REVIVAL")) | length) > 0)) as $promote_ba

# --- M1: promote BA row backlog -> ready (only if still in backlog) ---
| (if $promote_ba
   then
     ([ .task_board.backlog[] | select(type=="object" and .id=="BA-PREDICTION-EVIDENCE-REVIVAL")
        | .status="READY" | .promoted_at=$now | .promoted_by="po-s135"
        | .promotion_note="dev-team tick 2026-07-01T05:37Z: head idle, WIP=0, capacity free. Highest-value pending work; dispatch first hop ba (SPRINT-M). architect SPLITs multi-zone downstream; child stubs stay specced_under. sprint_goal PREDICTION-EVIDENCE-REVIVAL active." ]) as $ba_row
     | .task_board.backlog = ([ .task_board.backlog[] | select((type=="object" and .id=="BA-PREDICTION-EVIDENCE-REVIVAL")|not) ])
     | .task_board.ready   = (.task_board.ready + $ba_row)
   else . end)

# --- M2: mint dead-code SPIKE -> backlog (id-guarded) ---
| (if ($all_ids | index("SPIKE-TICK-SNAPSHOT-DEADCODE-OR-REGRESSED")) == null
   then .task_board.backlog += [{
     id: "SPIKE-TICK-SNAPSHOT-DEADCODE-OR-REGRESSED",
     title: "SPIKE: tick-snapshot Step 4.7 cycle-snapshot-latest.json stale since 06-17 — genuinely inert dead-code (remove) OR silently regressed (re-fix)?",
     owner: "po", next_agent: "cowork-refactory-expert", status: "BACKLOG", type: "SPIKE",
     mode: "spike", timebox: 120, priority: "low", plan_only: true,
     zone: "docs/agents/cowork-team/flow/",
     sprint: null, created_at: $now, created_by: "po-s135",
     recurrence_anchor: "FU-TICK-SNAPSHOT-EMIT-DARK",
     question: "Step 4.7 of docs/agents/cowork-team/flow/tick-snapshot.md promotes cycle-snapshot-latest.json (read by pressure-emit for last_regime/last_volatility). File frozen since 2026-06-17 (per cowork-fire 04:25Z NOTE). Is the promotion path genuinely inert dead-code to REMOVE, or did the emit silently regress after FU-TICK-SNAPSHOT-EMIT-DARK (commit 29d7e944, 06-05) claimed the fence-abort class 'fully eradicated'? Deliverable: findings doc + recommendation (remove vs re-fix vs by-design-off-hours).",
     note: "LOW / HARMLESS. Consumer (pressure-emit) unharmed — freshness-gated fallback proven over 2wk (06-17..07-01). Flagged as candidate dead-code by chef-intraday cowork-fire 04:25Z. Tracked (not dispatched) because it is the 2nd dark-emit on this exact snapshot path after a fix that claimed eradication (recurring-bug-escalation). NOT market-critical; run on a free tick."
   }]
   else . end)

# --- M3: mint OHLCV VPS backfill-stall OPS row -> backlog (id-guarded) ---
| (if ($all_ids | index("OPS-OHLCV-VPS-BACKFILL-STALL-NONWATCHLIST")) == null
   then .task_board.backlog += [{
     id: "OPS-OHLCV-VPS-BACKFILL-STALL-NONWATCHLIST",
     title: "OPS: VPS OHLCV backfill stalled after 5 retries for NON-watchlist shallow codes (BDI:1 DLC:41 JSH:0 SIS:0 VDC:0)",
     owner: "po", next_agent: "ops", status: "BACKLOG", type: "FIX",
     priority: "low", plan_only: true, zone: "infra-vps",
     sprint: null, created_at: $now, created_by: "po-s135",
     source_report_id: 3366,
     note: "Telegram report id=3366 (analysis-agent, normal, 2026-07-01T04:30Z): 'VPS backfill stalled after 5 retries; manual VPS investigation required'. ALL five codes are NON-watchlist (direct grep of system-map.json watchlist = none). The whole watchlist OHLCV-depth program is DONE_VERIFIED (SUBTASK-A..E, REBUILD, PROD-BACKFILL-GATE, PERSIST-DAILY-OHLCV-2YR). Manual VPS investigation = ops/infra, NOT a coding lane. Anomaly->dev-task bridge: infra -> PLAN-ONLY BACKLOG. Low priority — peripheral codes, no serving-layer impact. Related infra: BCTC-HIST-VPS-BACKFILL (DEFERRED, infra-vps)."
   }]
   else . end)
