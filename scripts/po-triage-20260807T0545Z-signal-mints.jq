# scripts/po-triage-20260807T0545Z-signal-mints.jq
# PO triage pass, dev-team tick 2026-08-07T05:07Z (S2 dispatcher-wrap).
# Mints 3 rows + closes 1 signal_queue row + folds 1 corroboration.
# Invoke: jq -f <this> docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

.task_board.backlog += [
  {
    id: "FIX-CHEF-INTRADAY-MARKER-KEY-UTC-HOUR-BASIS-MIGRATION",
    type: "FIX",
    size: "S",
    priority: "P2",
    status: "BLOCKED",
    zone: "cross-service/",
    owner: "po",
    sprint: "COWORK-RELIABILITY",
    created_at: "2026-08-07T05:45:00Z",
    created_by: "po (architect-brief adjudication, FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING amendment 2)",
    depends: ["FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR"],
    title: "EC-2 Phase 2: migrate chef-intraday's multi-fire MARKER_KEY AND its new filename hour component off VN_HOUR onto a UTC hour derived from scheduled_utc_time, in ONE change, so NFR-3 (filename and mutex key share one anchor) keeps holding on a basis with no day-boundary blind spot",
    status_note: "BLOCKED on FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR Component A landing scheduled_utc_time on chef's LIVE-MATCH path (today it is shipped only for the catch-up path, per that row's own Component A gap-finding). Do NOT dispatch before that lands — the migration has no correct target basis until then. AC: (1) chef-intraday's multi-fire MARKER_KEY and the unified-agent-synthesis-*-intraday-{HH}.json hour component both derive from the SAME scheduled_utc_time-derived UTC hour, changed in one commit, never independently re-derived (NFR-3); (2) a cron widening that spans 17:00 UTC (VN midnight) provably cannot alias two different UTC windows onto one (CYCLE_DATE, HOUR) pair — regression test with a synthetic widened cron; (3) no double-publish and no suppressed publish across the migration window (the mutex key basis changes under a live publisher — the cutover cycle must be shown safe).",
    note: "MINTED 2026-08-07 by po from architecture brief docs/architecture-briefs/2026-08-07-cowork-signal-filename-cycleid-keying.md section 4.2 + section 10 item 2. The architect correctly refused to fold this into FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING's Phase 1 (it reopens scope the sibling ANCHOR row deliberately excluded from its own AC, and a live publish-mutex basis change carries double-publish risk that needs its own AC). PO CONFIRMS the split and OVERRIDES the timing: the brief asked PO to mint this 'once Component A ships', which is a consumer with no producer — nobody watches for that landing, the exact defect class that idled FIX-WF2-SUPERVISED-HOLD-NO-PO-SIDE-GOAHEAD-PRODUCER and left FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER's P0 dormant 6+ days. Minted NOW as BLOCKED with an explicit depends[] so the board's own dependency machinery carries it instead of a brief's prose. HAZARD BEING TRACKED (real, latent, schedule-shape-contingent — NOT a false alarm): Phase 1 ships docs/data/unified-agent-synthesis-{CYCLE_DATE_UTC}-intraday-{VN_HOUR}.json, i.e. a VN-local hour appended to a UTC calendar date. Bounded safe today ONLY because chef-intraday's cron is '13 2-8 * * 1-5' — UTC hours 2-8 map 1:1 monotonically to VN hours 9-15, entirely inside one VN day, nowhere near VN midnight (17:00 UTC). Widen that cron across 17:00 UTC and the daily-straddle defect the ANCHOR row exists to close reproduces at hourly grain. TRIPWIRE: any change to chef-intraday's cron in docs/data/cowork-schedule.json must unblock and dispatch this row first."
  },
  {
    id: "FIX-CI-SIZELINT-CHECKFOREIGNFLOWGAP-NEW-OFFENDER-181L",
    type: "FIX",
    size: "XS",
    priority: "high",
    status: "BACKLOG",
    zone: "apps/mcp-server/",
    owner: "po",
    created_at: "2026-08-07T05:45:00Z",
    created_by: "po (triage-signals ci_red, dev-team tick 2026-08-07T05:07Z)",
    check_id: "CI-RED-83bb4359",
    dedup_key: "ci_job:size-lint|file:apps/mcp-server/src/scheduler/news-analysis/audit-checks/checkForeignFlowGap.ts",
    ci_fingerprint: "c3710b13b51014f8435a500c6969dd4e69ce654289f240a514c81d305cbf9faf",
    origin_signal_id: "CI-RED-83bb4359",
    verification_gate: "ci_green_on_subsequent_push",
    title: "CI-RED-83bb4359-FIX — CI RED: size-lint — apps/mcp-server/src/scheduler/news-analysis/audit-checks/checkForeignFlowGap.ts (181L > 120L, new-offender, no baseline entry, no justification header)",
    status_note: "AC: gh run view <databaseId with headSha AFTER 83bb4359e9b45220bf573c7521eaa79d31ec41cd> --json jobs -q '.jobs[]|select(.name==\"size-lint\")|.conclusion' == success (verification_gate=ci_green_on_subsequent_push). Priority: high. Failing job: size-lint. Failing file: apps/mcp-server/src/scheduler/news-analysis/audit-checks/checkForeignFlowGap.ts. Remedy is either a size-justification header on the file or a split — implementer's call; do NOT add a baseline-exemption entry (that launders a new offender).",
    note: "FAILING FILE READ AT SOURCE before dedup, per triage-signals.md ci_red MANDATORY PRE-DEDUP step — gh run view 31150664913 --log-failed emitted: '[size-lint] FAIL — 1 offending file(s) (scanned 1368): apps/mcp-server/src/scheduler/news-analysis/audit-checks/checkForeignFlowGap.ts — new-offender (181L > 120L, no baseline entry, no current justification header)'. Not relayed, not inferred from the job name. FILE-SCOPED DEDUP: no open row on any non-terminal lane carries this dedup_key or names this file — the 5 existing FIX-CI-SIZELINT-* siblings are all file-scoped to OTHER paths (getBctcRefinedTool.ts, embedder.py, app_factory.py, schema.ts, pushBctcRefinedUnitTool.ts). Mint required. PROVENANCE CORRECTION CONFIRMED, not assumed: the offender did NOT come from HEAD 83bb4359e (that commit is docs-only — the router's own synthesis/notebook recovery commit). git log on the file shows exactly one commit, 147ce3a68 'fix(mcp-server): daily_foreign_flow per-trading-day completeness detector', authored 2026-08-07T03:50:06Z, an ancestor of origin/main. CI has been RED on size-lint continuously since — runs at 04:56Z (54df7278d), 05:17Z (1a15c7956), 05:23Z (5c55ded40), 05:27Z (83bb4359e) all failed. So the ci_red probe is correct and this is a genuine standing red, ~1h45m old at mint. RELATED, does NOT dedup this row: FIX-CI-GATES-INVISIBLE-TO-PREPUSH-DOCS-PATH-FILTER (ready[], developer) is the MECHANISM row explaining why a size-lint offender reaches main unblocked — it is gate-scoped, not file-scoped, and closing it would not make this file compliant."
  },
  {
    id: "FIX-CHEFDISH-STEP8E-OWNPATHS-EXCLUDES-SYNTHESIS-JSON",
    type: "FIX",
    size: "S",
    priority: "P1",
    status: "BACKLOG",
    zone: "cross-service/",
    owner: "agent-father",
    next_agent: "agent-father",
    created_at: "2026-08-07T05:45:00Z",
    created_by: "po (triage-signals agent_flow_defect, dev-team tick 2026-08-07T05:07Z)",
    origin_signal_id: "router-2026-08-07T05:24:00Z-chef-commit-gap",
    title: "unified-agent chef-dish.md Step 8e commit gap — own_paths/git-add pathspec never includes docs/data/unified-agent-synthesis-<date>-<slot>.json, so every non-silent dish cycle writes an artifact its own commit step structurally cannot commit; plus a same-day execution-level Step 8e skip that left chef-morning's own notebook uncommitted too",
    status_note: "AC: (1) chef-dish.md Step 8e own_paths/pathspec includes the synthesis JSON the agent's own Step 7.6 contract mandates writing, so the artifact lands in git HEAD in the same cycle that produced it; (2) a post-commit self-verification (git show --stat on the agent's own SHA, same pattern as po/main.md AC-3) asserts BOTH the notebook and the synthesis JSON are in HEAD before the cycle may RETURN success — closes the execution-level skip, which a widened pathspec alone does not; (3) regression: a chef cycle that writes a synthesis JSON and does not commit it must fail loud, not return clean. Owner agent-father (docs/agents/unified-agent/flow/ is its commit zone).",
    note: "MINTED 2026-08-07 by po from router-authored signal docs/signals/processed/router-2026-08-07T05:24:00Z-chef-commit-gap.json (type=agent_flow_defect, suggested_owner=agent-father). TWO DISTINCT DEFECTS on one flow step, both RAW-verified by the reporting router before the signal was written: (a) CONTRACT-LEVEL, standing — the Step 8e own_paths list never names docs/data/unified-agent-synthesis-<date>-<slot>.json even though Step 7.6 mandates writing one every non-silent cycle; found dirty for BOTH the 2026-08-07 chef-intraday (04:35) and chef-morning (05:15) cycles, and git log on unified-agent-synthesis-2026-08-07-intraday.json showed only the unrelated notebook-only commit 6e6ecc60c while the file itself was dirty at investigation time. (b) EXECUTION-LEVEL, that cycle only — chef-morning (05:15 tick) left its OWN notebook uncommitted, i.e. Step 8e did not run at all (no commit hash in the agent's return, git status dirty), which is a DIFFERENT failure from (a) because the notebook IS already in the documented own_paths. Contrast evidence the router recorded: alert-commander and system-auditor's same-window cycles both cited real commit hashes. Router recovered both files out-of-band via commit 83bb4359e (explicit pathspec) — that is recovery, NOT a fix; root cause is untouched. CLASS: commit_zone-excluded ships (memory project_commit_zone_excluded_agent_ships_board_stays_stale), here for a DATA artifact rather than the board. ADJACENCY worth noting for whoever picks this up: the very artifact being lost, unified-agent-synthesis-<date>-<slot>.json, is the same file family FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING is re-keying — an uncommitted synthesis is unrecoverable once the next cycle clobbers the path, so these two defects compound. DEDUP: GAP-CHEF-SYNTHESIS-A-FLOW-PERSIST (backlog, agent-father) covers COMPUTING/persisting the synthesis via flow+endpoint, not the commit pathspec — different mechanism, no fold."
  }
]

| .task_board.in_progress |= map(
    if .id == "GUARD-NOTEBOOK-CONCURRENT-EDIT-COLLISION-DATA-LOSS"
    then . + {
      po_corroboration_20260807T0545: "OCCURRENCE 3 (cross-row corroboration, priority/owner/scope UNCHANGED — no re-mint). FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING's FR-4 (tran-ngoc-bau notebook write-serialization) was DESCOPED into this row today by po, after the architect flagged its disposition as a risk-tolerance call. Architect's own RAW-verify (brief section 5): 3 tnb-audit cycles since the 2026-07-29 marker-cadence fix (c121/c122/c123), zero repeat c<NNN> collision on tran-ngoc-bau.md specifically. That is a per-FILE null result, not a per-MECHANISM one — the mechanism recurred on qa.md 2026-08-06 (this row's occurrence 2). Net effect on THIS row: no scope change, no priority change; it simply now also carries FR-4's ask, and the FIX-NOTEBOOK-WRITE-AC7-SKILL design (task_claim task_kind='notebook-write', ttl 120s, bracketing only the mechanical fresh-read-merge-write span) is confirmed to be exactly the mechanism the architect was asking whether to commission — already minted, no second design needed. BOTTLENECK FOR WHOEVER PICKS THIS UP: AC7-SKILL is BLOCKED on FIX-NOTEBOOK-WRITE-TASK-KIND-ENUM-EXTENSION (backlog, dev-mcp-server, additive Zod enum value + AC-12 concurrent-writer test harness). That enum row is the whole chain's critical path and it is the cheapest of the three."
    }
    else . end
  )

| .signal_queue.rows |= map(
    if .id == "sys-20260807T052117-0aa8"
    then . + {
      status: "triaged",
      triaged_at: "2026-08-07T05:45:00Z",
      triaged_by: "po",
      disposition: "DUPLICATE of sys-20260807T044935-3bf0 (same rag-service loss-of-reclamation WARN, 32 min earlier, same detector, triaged by po at 2026-08-07T05:04:44Z) — no new mint, no re-triage. That prior disposition stands verbatim and is re-confirmed live this tick: the WARN is FOLDED onto FIX-RAG-EMBEDDER-IDLE-UNLOAD-PATH (review[], next_agent=qa) and the unblocking action is OPS-RAG-SERVICE-REBUILD-STALE-IMAGE-PREDATES-IDLE-UNLOAD-FIX (backlog[], next_agent=ops), which is STILL OPEN — the running rag-service image predates its own fix commit by ~24h, so the A-30 detector is measuring the PRE-FIX binary and will keep re-firing on every Tier-1 cycle until that rebuild lands. Re-fires of this WARN are therefore EXPECTED, not new information, and must not be minted per occurrence. The same event also arrived on the Telegram plane as report id=4486 (message_id=4884, identical 05:21:17Z timestamp and text) — one event, two delivery channels; resolved there as duplicate, not triaged as a separate incident."
    }
    else . end
  )
