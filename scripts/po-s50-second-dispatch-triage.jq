# po-s50-second-dispatch-triage.jq
# Second-dispatch triage of 4 untriaged live signals (2026-06-14).
# - Adds 2 backlog tasks: headless-gateway root-cause (Monday-dispatch) + kinh-dich backtest-501 (4x consecutive).
# - Appends 2 decision-journal entries (digest recovery decision + signal-batch archive decision).
# Stale/already-done signals (refine-lock-ttl, tool-contract-cron-overlap, coherence-audit) are file-archived, not boarded.
# Pointer: docs/agents/po/flow/main.md (PO triage step). Atomic temp->rename + empty-guard enforced by caller.

(.task_board.backlog) |= (
  . + [
    {
      "id": "ARCH-HEADLESS-GATEWAY-COWORK-NOPOST",
      "type": "design",
      "owner": "agents-architect",
      "zone": "agents",
      "priority": "high",
      "size": "M",
      "status": "backlog",
      "created_at": "2026-06-14T16:40:00Z",
      "dispatch_gate": "monday",
      "title": "Root-cause: scheduled cowork slots fired from claude.ai-cloud (RemoteTrigger backstop) have NO call_tool gateway in subagent surface (only Read/Write/Edit) -> send_telegram silently no-posts; digest-sunday W24 BLOCKED 2026-06-14T13:47Z",
      "status_note": "GENERIC across ALL gateway-dependent cowork slots, not just digest. Gateway WAS up (router probed get_week_period 13:47Z+13:52Z live) -> NOT a per-session miss, it is the headless/cloud provisioning gap (claude.ai gateway connector unauthenticated in cloud RemoteTrigger context). Memory: [False-infra-failure corroboration gate] disambiguated -> REAL gap. Design ask (architect/agents-architect): CLI-dispatcher-primary with cloud-RemoteTrigger as Read/Write-only fallback that MUST DETECT missing call_tool (probe e.g. get_week_period) and RE-QUEUE the slot rather than claim-and-drop (silent no-post). Doc/flow design, no production code expected. Off-market, Monday-safe."
    },
    {
      "id": "KD-BACKTEST-501-4X",
      "type": "fix",
      "owner": "dev-mcp-server",
      "zone": "dev-mcp-server",
      "priority": "high",
      "size": "S",
      "status": "backlog",
      "created_at": "2026-06-14T16:40:00Z",
      "title": "kinh-dich backtest returns 501 for 4 CONSECUTIVE digest cycles (run_hexagram_backtest, digest-predict/flow/weekly.md line 43)",
      "status_note": "Distinct from KD-OBS-01-FIX (that = explain_hexagram NaN validation). This = run_hexagram_backtest 501 carried over 4 cycles, surfaced in digest-predict bug-escalation 2026-06-14T13:47Z. AC: run_hexagram_backtest(days=7) returns 200 with backtest payload; if endpoint intentionally unimplemented, weekly.md must degrade gracefully (skip backtest evidence) not 501-block. Tracked here; not previously on board."
    }
  ]
) |
(.decision_journal) |= (
  . + [
    {
      "by": "po",
      "ts": "2026-06-14T16:40:00Z",
      "task_id": "DIGEST-SUNDAY-W24-RECOVERY",
      "decision": "SKIP recovery (do NOT re-dispatch digest-predict) + BACKFILL dedup marker. RAW MARKET verify: W24 digest ALREADY posted today 2026-06-14 (ids 739/740 from_agent=mcp-user, header '📊 DIGEST TUẦN — W24/2026 (08–14/06)' + THIÊN THỜI block) + companions weekly-portfolio id741 + calibration-report id738. Deliverable IS satisfied. Set marker published:digest-sunday:2026-06-08/2026-06-14 (owner_agent=digest-predict ttl 691200) which was UNSET -> any later cron/CLI/RemoteTrigger run this week now EXITs claimed!=true.",
      "what-considered": "Router authorized recover-now via cowork path; FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP is done_verified so gate is live. BUT marker was unset while content already on MARKET -> a recovery run would CLAIM+PUBLISH a 2nd W24 digest = double-post ([Guaranteed-slot week-key double-post]). Verified by content+period not author ([Chef MARKET post attribution]/[Router verify raw not badges]).",
      "why-change": "Changed from router's recommended recover-now to skip+backfill: the 13:47Z cloud-RemoteTrigger run failed (no gateway) but a separate path published the W24 digest content anyway; the missed artifact is the dedup MARKER, not the post."
    },
    {
      "by": "po",
      "ts": "2026-06-14T16:40:00Z",
      "task_id": "SECOND-DISPATCH-SIGNAL-BATCH",
      "decision": "Triaged 4 signals. (1) digest-predict bug-escalation high -> skip+backfill (above) + ARCH-HEADLESS-GATEWAY-COWORK-NOPOST backlog (Monday) + KD-BACKTEST-501-4X backlog. (2) arch-fix-refine-lock-ttl-reclaim -> STALE (FIX-REFINE-LOCK-TTL-RECLAIM done_verified) ARCHIVE. (3) dev-team-tool-contract-cron-overlap -> ALL 3 tasks (F1-A/F1-B/F2-A) already implemented in dev-team/flow/main.md (SF-1 L90-104, GCC-PREFLIGHT L106-107, heartbeat L334, release L376) + gateway-call-contract.md exists 3900B; ARCHIVE no re-create. (4) coherence-audit -> all 6 gaps IMPLEMENTED (verified in task-lock-protocol.md session-singleton, agent-chaining re-Read Invariant, leader-lock SF-1 comment, CLAUDE.md+tree-map+mcp-tools ref gateway-call-contract); ARCHIVE.",
      "what-considered": "Reconciled every signal claim against LIVE repo+board state before boarding -> avoided re-creating done work (3 of 4 signals were already satisfied).",
      "why-change": "no change from router scoping except digest recover->skip (RAW evidence)"
    }
  ]
)
