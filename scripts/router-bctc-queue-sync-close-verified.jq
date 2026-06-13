# Router board mutation: close FIX-BCTC-VPS-QUEUE-SYNC backlog[]->done_verified[] (QA APPROVED + router raw-corroborated).
# Pointer: docs/agents/dev-team/flow/main.md (router board-write step).
# Usage: jq --arg now "$NOW" -f scripts/router-bctc-queue-sync-close-verified.jq orch-state.json
(.task_board.backlog | map(select(.id=="FIX-BCTC-VPS-QUEUE-SYNC"))[0]) as $t
| .task_board.done_verified += [
    ($t + {
        status: "done_verified",
        closed_at: $now,
        closed_by: "router",
        qa_verdict: "APPROVE (qa agent a16fafe6)",
        review_evidence: {
          disposition: "VERIFIED-LIVE-FULL-HEAL",
          dev_commit: "f1c66801",
          rebuilt_image: "2c6ae1ca (from 1042a2a9); 11 peers intact; DB 65,841 cron_job_runs",
          code: "18/0 uncached; tsc exit 0; git show --stat NO orch-state; generic — MAX_404_ATTEMPTS=10 cap by attempt-count, orphan-detect structural URL set-diff (no hardcoded tickers).",
          fence: "G1 cap guard broken -> 5 RED (G1-TC-3..6,INT-1); G2 filter polarity inverted -> 5 RED (G2-TC-1..4,INT-1); both restore 18/0 GREEN. Non-vacuous.",
          g1_cap: "deferred_infra at attempts+1>=10 across all 4 failure paths; generic. Pre-existing 328 deferred_infra@0 NOT from this cap.",
          g2_live: "new-image enricher 20:15 reset all 10 symptom tickers (VNM..FRT 2026Q1) from 532-562 attempts/placeholder to pending@0/source_url=NULL — infinite-404 hammer broken.",
          g3_live: "ROUTER RAW-CONFIRMED: enricher 20:45 rediscovered REAL dated signed PDFs — VNM (hsx.vn .../20260429 - VNM - BCTC...Q1.2026) + MSN (.../20260424 - MSN...Q1.2026). Both status=pending, source_url=real-dated. GENUINE-AVAILABLE, not a discovery defect; full heal loop (reset->rediscover->queue-for-pull) proven.",
          g4_trajectory: "ROUTER RAW: max_pending_attempts=0 (no re-hammer). 26 pending all@0 (10 now real-URL -> done next pull, 15 NULL converge via MAX_ENRICH_ATTEMPTS, 1 HNX). done=48, url_not_found=27. Healthy convergence; full settle completes over subsequent autonomous cycles.",
          ddd_sec: "DDD PASS (scheduler->infra only); Security PASS (Bun.env, prepared stmts); mock-guard exit 0.",
          signals_closed: "Resolves B-06 (VPS bctc stale root) + B-13/C-16 (26 stale pending symptom) folded into this task by PO triage.",
          rebuild: "Done (ops 2c6ae1ca). No further rebuild."
        }
       })
  ]
| .task_board.backlog |= map(select(.id != "FIX-BCTC-VPS-QUEUE-SYNC"))
