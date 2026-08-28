# scripts/architect-fix-bctc-analyst-notebook-compose-actuator-design-done.jq
#
# Architect design-complete lane-move for FIX-BCTC-ANALYST-NOTEBOOK-COMPOSE-ACTUATOR:
# BACKLOG -> REVIEW, next_agent=developer, in the SAME orch-apply.sh write (chain
# contract: "flip the task to REVIEW (lane-move to .task_board.review[] with
# next_agent='developer' in the SAME orch-apply.sh write) OR leave a clear handoff").
#
# Precedent: scripts/architect-fix-usdvnd-threshold-ssot-design-20260823.jq
# (architect design stamp + review_note + next_agent, single write).
#
# Usage:
#   NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
#   jq --arg now "$NOW" -f scripts/architect-fix-bctc-analyst-notebook-compose-actuator-design-done.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

($ARGS.named.now) as $now
| (.task_board.backlog | map(select(type=="object" and .id=="FIX-BCTC-ANALYST-NOTEBOOK-COMPOSE-ACTUATOR"))[0]) as $t
| if $t == null then error("FIX-BCTC-ANALYST-NOTEBOOK-COMPOSE-ACTUATOR not in backlog[] -- refuse") else . end
| .task_board.backlog |= map(select(type != "object" or .id != "FIX-BCTC-ANALYST-NOTEBOOK-COMPOSE-ACTUATOR"))
| .task_board.review += [
    ($t + {
      status: "REVIEW",
      owner: "developer",
      next_agent: "developer",
      dispatch_lane: "developer",
      architect_design_complete: true,
      architect_completed_at: $now,
      architect_handoff: "docs/architecture-briefs/2026-08-28-fix-bctc-analyst-notebook-compose-actuator.md",
      updated_at: $now,
      updated_by: "architect (FIX-BCTC-ANALYST-NOTEBOOK-COMPOSE-ACTUATOR design)",
      architect_review_note: (
        "DESIGN COMPLETE 2026-08-28T23:40:00Z (architect, dev-team design-track; zone multi; BUILD-STANDARD: not-applicable — BUG-FIX wiring of the EXISTING actuator, no new service/primitives). "
        + "LIVE-VERIFIED ROOT CAUSE (not narrated): docs/agent-memory/notebooks/bctc-analyst.md holds exactly 2 sections (c187/c186) — the S51 doc-only remedy (\"NOT 2\" in stage-log-notify.md) was falsified 11 days later; "
        + "bctc-analyst has NO Bash grant (.claude/agents/bctc-analyst.md tools: Read, Write, Edit, mcp__gateway__call_tool), so the AC-2 retention WHILE-loop is LLM-composed from prose each cycle with no deterministic actuator "
        + "(confirmed failure mode: model applies >=3 instead of >3; same class as news-scout/agents-architect/digest-predict). S51's real fix (wire scripts/notebook-compose.sh + scoped Bash grant) was deferred and NEVER minted — this row IS that fix. "
        + "ACTUATOR SMOKE-VERIFIED THIS CYCLE: ran scripts/notebook-compose.sh against a COPY of the live 2-section notebook + new '## c188' section -> '[notebook-compose] OK sections=3 dropped=0 direction=newest_first' — the script needs ZERO code change; "
        + "also dogfooded on the architect notebook (OK sections=3 dropped=1 direction=oldest_first). "
        + "DESIGN (3 changes, full detail in architect_handoff brief): "
        + "(1) stage-log-notify.md §5a rewire mirroring system-auditor's wired pattern (78a43bf3c 2026-08-14): c<NNN> derived in bash from the file's own headings (never LLM-chosen, FIX-AGENT-NOTEBOOK-UUID-PROVENANCE), UTC via date -u (remove the No-Bash fetchedAt fallback), "
        + "model authors ONLY the new-section body (≤10L template) into a scratch file with machine-built '## c<N> · <UTC>' heading, ONE actuator call `bash scripts/notebook-compose.sh docs/agent-memory/notebooks/bctc-analyst.md <new-section-file> 3 60` (max-sections=3 per AC-2, "
        + "section-cap=60 per AC-2a — do NOT copy system-auditor's 150, that was a PO ruling for RAW-PROBE sections), branch on [notebook-compose] marker (OK/WARN -> Commit §5d embedding marker in the message; ABORT -> BUG telegram + skip commit + [NOTEBOOK-GATE-ABORT] log, NEVER narrated-Write fallback; ERROR -> BUG telegram, continue flow). "
        + "(2) SCOPED BASH GRANT: .claude/agents/bctc-analyst.md tools line -> 'Read, Write, Edit, Bash, mcp__gateway__call_tool'; description MUST declare the real write set in the SAME commit (CI CHECK 2 of scripts/audits/agent-bash-grant-coverage.sh fails otherwise — "
        + "current description claims 'No other filesystem writes permitted', the exact CRITICAL-01 stale-desc class from team-tool-recheck-2026-08-11 + PO ruling FIX-COWORK-AGENT-DESC-STALE-VS-DELIBERATE-BASH-GRANT); Bash scope row added to docs/agents/tools/package/bctc-analyst.md (mirror system-auditor package): "
        + "PERMITTED = date -u, grep/sort/tail/wc on the notebook path (c<NNN> + AC-5), bash scripts/notebook-compose.sh (ONE compose actuator), git add/commit for the notebook path only (5d, mutex-guarded); FORBIDDEN = docker/network/arbitrary writes/rm -rf AND any docs/signals/ enumeration "
        + "(the drain-misread class FIX-BCTC-ANALYST-READS-DRAIN-MOVE-AS-SIGNAL-WRITE-LOSS-4-CYCLES must NOT be reopened; main.md SIGNAL-FILE WRITE VERIFICATION verification-premise rule STANDS). "
        + "(3) VERIFICATION GATES: VG-1 flow runtime (marker branch, no narrated fallback); VG-2 commit-time (marker embedded -> git log --grep='notebook-compose' returns every post-fix commit); VG-3 CI mechanical (agent-bash-grant-coverage --check + re-run --update so the grandfathered bctc-analyst baseline entry DROPS — it exists today because flow demanded Bash while frontmatter didn't); "
        + "VG-4 smoke/replay (copy of live 2-section notebook + new section -> assert sections=3); VG-5 live QA (first post-wire cycles commit exactly 3 sections with marker). "
        + "FILES: docs/agents/bctc-analyst/flow/stage-log-notify.md (primary), .claude/agents/bctc-analyst.md (grant+description, same commit as grant), docs/agents/tools/package/bctc-analyst.md (Bash scope row), docs/data/agent-bash-grant-coverage-baseline.json (drop entry via --update), "
        + "docs/agents/bctc-analyst/flow/main.md (narrow rewording: 'no Bash/Glob grant' sentence is now false; write-verification premise rule unchanged), scripts/notebook-compose.sh (NO code change — smoke-verified; optional header 'Owning flow' line update), docs/agents/shared/debug-logger-protocol.md (OPTIONAL line 23 'Bash-less' -> 'scoped-Bash'; agent-father zone if routed separately). "
        + "RISK FLAGS: (1) sibling FIX-BCTC-ANALYST-STAGELOG-NOTIFY-NO-BASH (BACKLOG, low) premises a flow-doc rewrite REMOVING the Bash steps — SUPERSEDED by this ruling (scoped Bash grant); PO should close/supersede the sibling, do NOT land both. "
        + "(2) drain-misread regression guard: scoped grant explicitly forbids docs/signals/ enumeration. (3) .claude/agents/*.md is nominally agent-father's lifecycle zone but this row's files[] explicitly includes it (precedent: 476646c4e/610110e16 modified agent files from tracked fix rows). "
        + "(4) no new MCP tools, no gateway changes — commit-mutex at 5d already uses mcp__gateway__call_tool (already granted). "
        + "QA COMES AFTER DEVELOPER as a separate agent — not dispatched from this flip. Next: developer implements per brief §3; developer's own lane-move to qa after implementation."
      )
    })
  ]
| .task_board._updated_at = $now
| .task_board._updated_by = "architect (FIX-BCTC-ANALYST-NOTEBOOK-COMPOSE-ACTUATOR design)"
