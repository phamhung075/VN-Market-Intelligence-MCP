# PO consolidated triage pass-12 (health report 0407, 2026-06-14T04:07Z). ONE atomic orch-state write.
# Re-applies discarded pm commit 8419d2e6 intent (BC-1->done_verified, A-1->IN_PROGRESS) onto the
# authoritative post-reconcile board (HEAD bcac87b7) PLUS triages two new 0407 findings.
# RAW-verified against docs/agent-memory/health/team-tool-recheck-2026-06-14-0407.md by router this pass:
#   BC-1 gates: uptime 4h45m14s (>4h, line 4) + WAL 3.49MB<5MB (line 5) + walCheckpointJob@04:00Z flushed.
#   RestartCount=0 (no crash since 23:18Z restart) -> neither reopen-criterion (RestartCount>0 OR WAL>=5MB) met.
# Supersedes scripts/router-bc1-promote-done-verified.jq (stale 03:26Z hardcoded numbers + wrong next_agent=pm).
# Usage: jq --arg now "$NOW" -f scripts/po-s53-0407-consolidated-triage.jq orch-state.json
#
# Mutation 1: BC-1 in_progress[] -> done[] as done_verified (live-verify gates MET per 0407).
# Mutation 2: A-1 ready[] -> in_progress[] as IN_PROGRESS owner=dev-mcp-server (dep BC-1 now satisfied; restore in-flight signal).
# Mutation 3: NEW IMPROVE task FIX-VPS-NEWS-STALE-FALSEPOS appended to backlog[] (idempotent).
# Mutation 4: FIX-NEWS-CB-FALSE-CLOSED priority P2->P1 + append 0407 worsening evidence (27 errors, ~6.5/h).

(.task_board.in_progress | map(select(.id=="BC-1"))[0]) as $bc
| if $bc == null then error("BC-1 not in in_progress[]") else . end
| (.task_board.backlog | any(.id=="FIX-VPS-NEWS-STALE-FALSEPOS")) as $news_dup

# --- Mutation 1: BC-1 -> done_verified ---
| .task_board.done += [
    ($bc + {
      status: "done_verified",
      done_verified_at: $now,
      done_verified_by: "po",
      live_verification_result: {
        gate_passed: true,
        observed_at: "2026-06-14T04:07Z",
        source_report: "docs/agent-memory/health/team-tool-recheck-2026-06-14-0407.md",
        uptime: "4h45m14s (stable since 2026-06-13T23:18Z deliberate restart) — >4h gate MET",
        restart_count: 0,
        restart_count_verdict: "PASS — no auto-restart/crash since BC-1 went live; old ~2h crash cadence shows ZERO recurrence over 4h45m.",
        wal_bytes: 3490000,
        wal_verdict: "PASS — WAL 3.49MB (DOWN from 3.95MB at 02:02Z) < 5MB threshold. walCheckpointJob ran 04:00Z and flushed WAL — checkpoint policy holding as designed.",
        promoter_guard_satisfied: "Reopen-criteria were RestartCount>0 OR WAL>=5MB. Neither met -> legitimate done_verified, NOT a force-promote."
      }
    })
  ]
| .task_board.in_progress |= map(select(.id != "BC-1"))

# --- Mutation 2: A-1 ready[] -> in_progress[] (dep BC-1 satisfied; restore in-flight) ---
| (.task_board.ready | map(select(.id=="A-1"))[0]) as $a1
| if $a1 == null then error("A-1 not in ready[]") else . end
| .task_board.in_progress += [
    ($a1 + {
      status: "IN_PROGRESS",
      owner: "dev-mcp-server",
      in_progress_at: $now,
      in_progress_by: "po",
      unblock_note: "BC-1 done_verified at \($now) per 0407 live-verify -> depends_on satisfied. Re-established IN_PROGRESS (was actively in-flight before the 0407-reconcile discarded local pm commit 8419d2e6; intent restored). dev-mcp-server WIP=2 (FIX-MCP-CRASH-LOOP-WRITEWAL + A-1) — at limit, OK."
    })
  ]
| .task_board.ready |= map(select(.id != "A-1"))

# --- Mutation 3: NEW IMPROVE task (idempotent) ---
| if $news_dup then . else
    .task_board.backlog += [{
      id: "FIX-VPS-NEWS-STALE-FALSEPOS",
      type: "FIX",
      status: "TODO",
      priority: "P3",
      zone: "apps/news-fetch/",
      owner: "dev-news-fetch",
      title: "FIX-VPS-NEWS-STALE-FALSEPOS — get_vps_proxy_health reports news:STALE false-positive: 0407 push log shows recent pushes (03:52, 03:36, 03:20, 03:04, 03:00) contradicting the STALE flag. The VPS staleness threshold is miscalibrated vs actual news push cadence; no real data gap. FIX: align the news stale-detection threshold with the observed push cadence (decouple the STALE flag from data-flow health so a healthy, actively-pushing feed is not flagged stale).",
      user_impact: "LOW — risk that ops/alert-commander consume this STALE flag to suppress a healthy news feed (false-negative on news processing). Inverse class of feedback_passive_health_masks_dead_data (false-STALE vs false-healthy).",
      depends: [],
      source: "health-recheck 0407 NEW finding (N1) — router triage 2026-06-14",
      groomed_by: "po",
      groomed_at: $now
    }]
  end

# --- Mutation 4: bump FIX-NEWS-CB-FALSE-CLOSED P2->P1 + add 0407 evidence ---
| .task_board.backlog |= map(
    if .id=="FIX-NEWS-CB-FALSE-CLOSED" then
      .priority = "P1"
      | .escalation = "Bumped P2->P1 by PO 2026-06-14 per 0407 WORSENED trend (I2): Reuters RSS + TradingEconomics x2 escalated 14->27 consecutive errors (~6.5 errors/h), still 'never succeeded since 23:18Z restart', circuit breakers STILL [OK]/false-closed masking the degradation. Will hit 50+ by next check. Same task covers the class — NOT duplicated."
      | .updated_at = $now
      | .updated_by = "po"
    else . end
  )

# --- head: keep sprint flow active; pipeline stays with dev-mcp-server executing A-1 ---
| .head = {
    status: "in_progress",
    updated_at: $now,
    updated_by: "po",
    active_task_id: "A-1",
    next_agent: "dev-mcp-server"
  }
| ._updated_at = $now
| ._updated_by = "po"
| .task_board._updated_at = $now
| .task_board._updated_by = "po"
