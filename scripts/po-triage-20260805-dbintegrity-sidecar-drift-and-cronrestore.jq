# scripts/po-triage-20260805-dbintegrity-sidecar-drift-and-cronrestore.jq
#
# PO triage of the 2026-08-05T06:47Z Tier-DATA system-auditor sweep escalation.
# Apply: jq -f scripts/po-triage-20260805-dbintegrity-sidecar-drift-and-cronrestore.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Four dispositions, all backed by PO-run RAW verification (not agent self-report):
#   1. signal sys-20260805T065227-25f7 — routing defects fixed (to/payload_ref per
#      .claude/skills/cron-standalone-team/register.md:132-135) AND downgraded to
#      TRIAGED/duplicate: the anomaly is already board-tracked. Root cause corrected.
#   2. FIX-DB-INTEGRITY-SIDECAR-NAMED-VOLUME-DRIFT — new. The read-only observer
#      tooling still mounts a named volume that commit 5ba622eca (2026-07-15) retired.
#   3. FIX-AUDITOR-DEDUP-TASKBOARD-PRECHECK-NOT-ENFORCED — new. The DEDUP-ENFORCEMENT
#      clause exists in the cron prompt but nothing makes the agent actually run it.
#   4. OPS-MCPSERVER-RESTART-FLUSH-LAYERB-CRON-MEMO — new. Live /api/cron-status is
#      serving a stale 4-file view from a process-lifetime memo with no TTL.
# Plus: CLEAN-OHLCV-INTEGRITY-RESIDUE-REPAIR annotated with accurate live scope.

def NOW: "2026-08-05T07:06:06Z";

# ---------------------------------------------------------------------------
# 1. Signal row sys-20260805T065227-25f7 — fix routing + record true root cause
# ---------------------------------------------------------------------------
.signal_queue.rows |= map(
  if .id == "sys-20260805T065227-25f7" then
    .to = "dev-team"
    | .payload_ref = "docs/data/db-integrity-history.json"
    | .status = "TRIAGED"
    | .summary = "daily_ohlcv: 336 rows high=0/low=0 — FROZEN RESIDUE of ONE 2026-06-14 write batch, already board-tracked (dup)"
    | .triaged_at = NOW
    | .triaged_by = "po"
    | .disposition = "DUPLICATE-ALREADY-TRACKED"
    | .related = ["CLEAN-OHLCV-INTEGRITY-RESIDUE-REPAIR", "FIX-OHLCV-WRITER-INTEGRITY-CONSTRAINT-SCALE-P0", "FIX-AUDITOR-DEDUP-TASKBOARD-PRECHECK-NOT-ENFORCED"]
    | .po_note = "PO RAW-verified 2026-08-05T07:0xZ against the LIVE host-bind DB (data/live/market.db, file:?immutable=1 — NOT the named volume). THREE corrections to the record, in order of how wrong they were:\n(a) ROUTING (auditor defect): row was written to=\"po\" with payload_ref=null. Spec (.claude/skills/cron-standalone-team/register.md:132-135) requires to=\"dev-team\", payload_ref=\"docs/data/db-integrity-history.json\". Fixed here. Wrong routing meant dev-team's drain would never have seen it.\n(b) ROOT CAUSE — the auditor's notebook (c17, commit 35104ef89) said 'Data extraction/load bug on 2026-05-15 ... All 336 violations are from 2026-05-15 (concentrated date)'. WRONG: SELECT date,COUNT(*) ... GROUP BY date returns 20 distinct business dates 2026-05-15..2026-06-12. The router's re-reading ('RECURRING extraction defect across ~a month of trading sessions') is ALSO wrong, and is the more dangerous error because it would have sent dev-team hunting a live recurring writer bug. GROUND TRUTH: every one of the 336 rows carries updated_at='2026-06-14' — a SINGLE write batch on 2026-06-14 that backfilled 20 business dates at once. The 20 `date` values are the batch's COVERAGE, not 20 incidents. Zero violations with date>2026-06-12; MAX(updated_at) over the whole table is TODAY (2026-08-05 07:03) because the nightly backfill actively rewrites ~97% of rows (memory: reference_daily_ohlcv_updated_at_is_mutation_not_arrival) — and in 52 days of those active rewrites it has NOT reintroduced a single zero. The writer is NOT currently defective.\n(c) DEDUP (auditor defect): total constraint violations across ALL classes (high<low OR high<open OR high<close OR low>open OR low>close) is exactly 336 — the same rows. This is the residue already tracked by CLEAN-OHLCV-INTEGRITY-RESIDUE-REPAIR (which recorded 835; partial repair has since landed) with the writer root tracked by FIX-OHLCV-WRITER-INTEGRITY-CONSTRAINT-SCALE-P0 (REVIEW). The auditor's own DEDUP-ENFORCEMENT clause (register.md:144-150) says an anomaly is ALREADY-OPEN and must NOT be re-signalled when a .task_board FIX-* tracks its root. It did not run that check. Board gap filed as FIX-AUDITOR-DEDUP-TASKBOARD-PRECHECK-NOT-ENFORCED.\nNET: no new data-quality task minted; the residue-repair row carries the corrected scope. Not closed outright so dev-team's drain sees the corrected record rather than the auditor's wrong one."
  else . end
)

# ---------------------------------------------------------------------------
# 2. Annotate the existing residue row with the accurate live scope
# ---------------------------------------------------------------------------
| .task_board.backlog |= map(
  if .id == "CLEAN-OHLCV-INTEGRITY-RESIDUE-REPAIR" then
    .po_rescope_at = NOW
    | .po_rescope_by = "po"
    | .live_scope_20260805 = "PO RAW re-measure 2026-08-05T07:0xZ (live host-bind DB data/live/market.db, file:?immutable=1): CURRENT violation count is 336 rows, NOT the 835 in this row's title — partial repair has landed since filing. All 336 are the high=0 AND low=0 class (open/close valid nonzero, e.g. VNDAFS004 2026-05-15 O=21183.99 H=0 L=0 C=21183.99); the broader predicate (high<low OR high<open OR high<close OR low>open OR low>close) returns the SAME 336, so there is no second residue class left. Spread: 20 business dates 2026-05-15..2026-06-12, ALL sharing updated_at='2026-06-14' => ONE backfill batch, not recurring. No violation has date>2026-06-12 and none has been reintroduced in the 52 days since, despite the nightly backfill rewriting most of the table daily. This row is therefore pure data repair with a CLOSED intake — safe to fix forward (recompute H/L from the intraday source, or NULL them and let the gap detector re-fetch) without racing an active writer. Re-derived from signal sys-20260805T065227-25f7, which was a duplicate of this row."
  else . end
)

# ---------------------------------------------------------------------------
# 3. Mint the three new rows
# ---------------------------------------------------------------------------
| .task_board.backlog += [
  {
    id: "FIX-DB-INTEGRITY-SIDECAR-NAMED-VOLUME-DRIFT",
    type: "FIX",
    title: "db-integrity observer tooling still mounts the named volume commit 5ba622eca retired on 2026-07-15 — counts helper returns null, probe fail-opens every tick",
    zone: "cross-service/",
    priority: "high",
    status: "BACKLOG",
    size: "S",
    next_agent: "dev-team",
    supervised: false,
    plan_only: false,
    baseline_pass: true,
    source: "PO triage of system-auditor Tier-DATA sweep 2026-08-05T06:47Z (router escalation, telegram bug msg_id 4703)",
    created_at: NOW,
    created_by: "po",
    updated_at: NOW,
    root_cause: "2026-07-15 commit 5ba622eca ('fix(infra): bind-mount market data to host disk instead of Docker named volume') moved the live DB off the named volume `vn-market-intelligence-mcp_market_data` and onto a HOST BIND MOUNT `./data/live:/app/data` across all 9 dependent services, because the 2026-07-15 hypervisor VM rebuild had destroyed the named volume. docker-compose.yml now declares only pek_model_cache + bctc-page-images under `volumes:` — market_data is gone entirely. The RUNTIME was migrated; the READ-ONLY OBSERVER tooling was not. Every observer still runs `docker run --rm -v vn-market-intelligence-mcp_market_data:/data keinos/sqlite3 ...`, which makes Docker AUTO-CREATE an empty volume and then fail to open /data/market.db. Confirmed live: `docker volume inspect vn-market-intelligence-mcp_market_data` shows CreatedAt=2026-08-05T06:47:24Z (auto-created by the auditor's own failing probe today) and `docker run -v <vol>:/data alpine ls -la /data` shows an empty dir, while `docker inspect vn-market-intelligence-mcp-mcp-server-1` shows `bind .../data/live -> /app/data` and the real market.db is 425MB with an mtime of seconds ago.",
    evidence: "PO ran both failing commands directly. `bash scripts/db-integrity-counts.sh` -> '[DB-INTEGRITY-COUNTS] PROBE FAILURE (exit 1): Error: unable to open database \"file:/data/market.db?immutable=1\": unable to open database file'. `bash scripts/agents-flow/db-integrity-probe.sh` -> {\"verdict\":\"SPAWN\",\"detail\":\"sidecar query failed (docker unreachable, non-zero exit, or output did not parse into 1 line per watched table) — snapshot left untouched\",\"tables_changed\":-1}. Both fail-open rather than fail-loud, so the degradation is SILENT: the probe's whole purpose is skip-if-unchanged idempotency and it now votes SPAWN unconditionally, and the counts helper's null propagates into every history entry. The same query against the correct path succeeds immediately: `sqlite3 \"file:data/live/market.db?immutable=1\" \"SELECT COUNT(*) FROM daily_ohlcv WHERE high=0 AND low=0;\"` -> 336.",
    blast_radius: "docs/data/db-integrity-history.json holds 138 entries; the last one with non-null `counts` is 2026-06-25T19:25:41Z, then a 41-day gap, then today's 2026-08-05T06:51:39Z entry with counts=NULL. The gap is because the db-data-integrity cron had NO re-arm coverage until /cron-standalone-team was built on 2026-08-04 — so today was the FIRST sweep since the 07-15 bind-mount switch, and it broke immediately. Correct framing: broken for 21 days (since 5ba622eca), first OBSERVED today — not '6 weeks of silent nulls'. The deterministic counts trail that register.md:108-113 explicitly relies on to stop the LLM inventing trends is dead until this lands.",
    files: [
      "scripts/db-integrity-counts.sh",
      "scripts/agents-flow/db-integrity-probe.sh",
      "scripts/db-integrity-history-append.sh",
      "scripts/ops-bctc-enrich-reverify-pulljob.sh",
      ".claude/skills/cron-standalone-team/register.md",
      ".claude/commands/crons/cron-db-data-integrity.md",
      "docs/agents/system-auditor/flow/main.md"
    ],
    ac: [
      "AC-1 DECIDE THE CANONICAL PATH FIRST, then change code. Two candidates: (i) host bind `data/live/market.db` read directly with `sqlite3 \"file:<path>?immutable=1\"` (no docker at all — PO confirmed this works today and is strictly simpler), or (ii) keep a sidecar but mount the host dir: `docker run --rm -v \"$PWD/data/live:/data:ro\" keinos/sqlite3 ...`. Record the choice + rationale in the decision journal. Do NOT re-create the named volume — 5ba622eca retired it deliberately so the DB survives VM rebuilds.",
      "AC-2 scripts/db-integrity-counts.sh returns real non-null counts for every watched table. Verify by running it and diffing at least 3 table counts against the same query run through a second independent access path (e.g. the mcp-server container's own reader) — two planes, per memory feedback_same_db_tools_diverge_rowcount.",
      "AC-3 scripts/agents-flow/db-integrity-probe.sh emits verdict=SKIP-SPAWN on an unchanged DB. This is the actual proof the pre-gate works — today it CANNOT emit SKIP-SPAWN at all. Run it twice with no intervening writes and assert the second call skips.",
      "AC-4 Both scripts FAIL LOUD (non-zero exit + bug-channel-worthy stderr) when the DB is genuinely unreachable, instead of silently returning null / voting SPAWN. The current fail-open is what let this hide for 21 days.",
      "AC-5 Update every doc/prompt that still teaches the named-volume pattern: .claude/skills/cron-standalone-team/register.md Job 1 AND Job 2 prompt bodies (both currently paste the 'DB ACCESS — the live DB is the named volume, NOT host ./data' block verbatim, and both are LIVE — the router registered them at 06:18Z today), .claude/commands/crons/cron-db-data-integrity.md, and the system-auditor flow. grep -rn 'vn-market-intelligence-mcp_market_data' across scripts/ .claude/ docs/ and triage every hit — several scripts/*.jq audit artifacts also assert it, though those are historical records and should be left alone.",
      "AC-6 The memory note reference_live_db_is_named_volume_not_host_data.md is now STALE and actively harmful — it says the named volume is authoritative and host ./data is a 'decoy'. That was true before 5ba622eca and is inverted now. Route a correction so agents stop being taught the wrong path.",
      "AC-7 Regression guard: something must fail when the runtime DB location and the observer DB location diverge again. A test or CI check that resolves the mcp-server container's /app/data mount source and asserts the observer scripts target the same inode/path is the minimum bar."
    ]
  },
  {
    id: "FIX-AUDITOR-DEDUP-TASKBOARD-PRECHECK-NOT-ENFORCED",
    type: "FIX",
    title: "system-auditor DEDUP-ENFORCEMENT is prose-only — it re-signalled a 52-day-old residue already tracked by two board rows, with a fabricated single-date root cause",
    zone: "cross-service/",
    priority: "high",
    status: "BACKLOG",
    size: "S",
    next_agent: "dev-team",
    supervised: false,
    plan_only: false,
    baseline_pass: true,
    source: "PO triage of system-auditor Tier-DATA sweep 2026-08-05T06:47Z — signal sys-20260805T065227-25f7",
    created_at: NOW,
    created_by: "po",
    updated_at: NOW,
    root_cause: "register.md:144-150 states an anomaly is ALREADY-OPEN and must not be re-signalled if '(a) a .task_board FIX-* task tracks its root, OR (b) a prior .signal_queue row for the same table+defect has status NEW/READ/TRIAGED/ACUTE-RESOLVED-ROOT-TRACKED'. It is pure prose with no actuator: nothing reads .task_board, nothing computes the dedup key, nothing blocks the write. On 2026-08-05 the auditor emitted CRITICAL sys-20260805T065227-25f7 for daily_ohlcv high=0/low=0 while CLEAN-OHLCV-INTEGRITY-RESIDUE-REPAIR (BACKLOG, same rows, filed at 835) and FIX-OHLCV-WRITER-INTEGRITY-CONSTRAINT-SCALE-P0 (REVIEW, the writer root) were both open on the board. Clause (a) matched exactly and was never evaluated. Compare FIX-AUDITOR-D4-WHITELIST-DATA-QUALITY-ANOMALY-PREFIX and the auditor-dedup-ledger: dedup exists for OTHER surfaces but not for the .task_board plane.",
    secondary_defect: "The same signal shipped a fabricated root cause. Notebook c17 (commit 35104ef89) asserted 'All 336 violations are from 2026-05-15 (concentrated date)' — the actual GROUP BY returns 20 distinct dates. The agent reported a scoping conclusion it had not measured. This is the confabulation class in memory feedback_agent_selfreport_metalayer_confabulation; the fix should force the scoping query's raw output into the history entry rather than let the agent narrate it, which is the same remedy register.md:108-113 already applies to counts.",
    files: [
      ".claude/skills/cron-standalone-team/register.md",
      ".claude/commands/crons/cron-db-data-integrity.md",
      "docs/agents/system-auditor/flow/main.md",
      "scripts/db-integrity-history-append.sh",
      "docs/data/auditor-dedup-ledger.json"
    ],
    ac: [
      "AC-1 Turn clause (a) into an actuator, not prose: a deterministic pre-write check that reads docs/data/orch/orch-state.json .task_board (all open lanes, not just backlog) plus .signal_queue.rows[] and refuses the append when the dedup key already matches. Put it in the same helper that already owns the append so it cannot be skipped by an agent that is short on context — prose in a prompt body is exactly what failed here.",
      "AC-2 Replay the 2026-08-05 case as the regression test: with CLEAN-OHLCV-INTEGRITY-RESIDUE-REPAIR present on the board, a daily_ohlcv high=0/low=0 finding MUST be suppressed and recorded as already-open in db-integrity-history.json instead of appended to .signal_queue.",
      "AC-3 Do not validate on this one case alone — replay the last ~30 db-integrity signals against the proposed dedup key and report how many would have been suppressed and whether any TRUE positive would have been lost. Per memory feedback_fleetwide_gate_validated_on_one_file_optout_allowlist, a gate proven on a single example is not proven.",
      "AC-4 Scoping honesty: when a finding is row-count based, the history entry must carry the RAW distribution output (the GROUP BY result) as data, not an agent sentence about it. An agent-authored claim like 'concentrated on <date>' with no matching query result in the entry should be structurally impossible.",
      "AC-5 Also cover the routing defect from the same signal: to=\"po\" + payload_ref=null were both written against an explicit spec (register.md:132-135). If the row is assembled by a helper, make the helper own to/payload_ref; if the agent hand-writes it, assert the shape post-write in the same read-back that already exists for row presence."
    ]
  },
  {
    id: "OPS-MCPSERVER-RESTART-FLUSH-LAYERB-CRON-MEMO",
    type: "FIX",
    title: "Live /api/cron-status serves a stale 4-file layer_b view — process-lifetime memo with no TTL cached the deleted-cron-docs window",
    zone: "apps/mcp-server/",
    priority: "med",
    status: "BACKLOG",
    size: "XS",
    next_agent: "ops",
    supervised: false,
    plan_only: false,
    baseline_pass: true,
    source: "PO triage 2026-08-05 — collateral of the cron-doc deletion window 06:20-07:06Z",
    created_at: NOW,
    created_by: "po",
    updated_at: NOW,
    root_cause: "docker-compose.yml:26 bind-mounts ./.claude/commands/crons into mcp-server read-only at /app/.claude/commands/crons, and layerBCronRegistry.ts parses it to build the Layer-B half of GET /api/cron-status (the dashboard Cron Recheck Table). getLayerBCronRows() memoizes into a module-level `_cachedRows` (layerBCronRegistry.ts:137-152) that is populated once and has NO TTL and NO invalidation — only the test-only reset hook clears it. Between ~06:20Z and 07:06Z on 2026-08-05, 12 of the 16 cron docs plus .claude/commands/dev-team.md were deleted from the working tree; the memo was filled during that window. PO restored all 13 files from HEAD at 07:06Z and the container now sees 16 files (docker exec ls confirms), but the API still returns layer_b length 7 — the stale memo survives the file restore.",
    evidence: "Before restore: docker exec ls /app/.claude/commands/crons -> 4 files; curl /api/cron-status -> layer_b length 7 (cron-cowork-team, cron-dev-team, cron-market-watcher#1..#3, cron-orch-sentinel#1..#2). After restore: docker exec ls -> 16 files; curl -> STILL 7. Cache confirmed, not a file problem. Note apps/mcp-server/src/__tests__/layerBCronRegistry.test.ts AC-12 and cronStatusHandler.test.ts AC-12 both assert '13 live files' against the real tree — those would have gone RED during the deletion window, and the hardcoded 13 is itself a NO-HARDCODE violation worth folding in.",
    ac: [
      "AC-1 ops: restart ONLY vn-market-intelligence-mcp-mcp-server-1 to flush the memo, then curl /api/cron-status and assert layer_b length matches the parse of all 16 files. Single-service restart per memory feedback_rebuild_after_dev_change — never `docker compose down && up`, which kills peers. Do it in a quiet window: 4 live CLI agent sessions currently route every gateway call through this container.",
      "AC-2 Decide whether a process-lifetime memo over a bind-mounted doc dir is the right design at all. It means any cron-doc edit is invisible to the dashboard until the next container restart, which silently backdates the operator's view. A cheap mtime check or a short TTL would close it; if the memo is kept deliberately, say so in the handler doc so the next person does not read a stale table as ground truth.",
      "AC-3 Replace the hardcoded '13 live files' expectation in both AC-12 tests with a count derived from the directory (or from system-map.json), so the suite tracks the real fleet instead of pinning a number that was already wrong twice."
    ]
  }
]

| .task_board._updated_at = NOW
| .task_board._updated_by = "po (triage: db-integrity sidecar drift + cron-doc restore)"
| ._updated_at = NOW
| ._updated_by = "po"
