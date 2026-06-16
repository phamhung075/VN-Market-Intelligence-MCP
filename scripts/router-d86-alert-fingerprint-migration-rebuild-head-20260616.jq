# Router 2026-06-16 — dev-team tick: FIX-ALERT-FINGERPRINT migration fix landed -> flip head to AWAIT-REBUILD (round 2).
#
# d85 routed the lane back to dev-mcp-server after router RAW-verify caught the schema-migration silent-no-op
# (ALTER ADD COLUMN ... TEXT UNIQUE illegal in SQLite -> swallowed -> column never created on named-volume DB).
# dev-mcp-server (agent a3d2138a) committed the migration fix at ec03b6ee. Router RAW-verified the diff first-hand:
#   - ec03b6ee IS ancestor of HEAD (on main); exactly 2 files changed (schema-alerts.ts + the test) — no scope creep.
#   - schema-alerts.ts: CREATE TABLE L31 `fingerprint TEXT` (fresh-DB); ALTER loop L61 `["fingerprint","TEXT"]` (plain,
#     legal on all SQLite); L72-76 `CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_fingerprint ON alerts(fingerprint)
#     WHERE fingerprint IS NOT NULL` (partial — legacy NULL rows don't collide). Generic, no per-ticker/date literal.
#   - test: new AC-7 fault-path block seeds the OLD 18-col no-fingerprint schema + 2 NULL-fp rows, runs initAlertsTables,
#     asserts column+index PRESENT + dedup works + legacy NULL rows survive (kills the self-confirming gap). 105 core pass, tsc clean.
#
# COPY-baked /app/src => NOT live until a real `docker compose build mcp-server` + force-recreate (force-recreate alone
# ships nothing — feedback_force_recreate_no_build_stale_image). HEAD-ONLY guarded move (crash-resume correctness):
# record migration_fix_commit + flip rebuild_required=true + next_agent=ops so a mid-rebuild crash resumes to
# "dispatch ops rebuild", NOT "re-code". Task stays in in_progress[] (live gate not yet met — promotion to review
# waits on router RAW live-verify post-rebuild: column+index PRESENT on the named-volume DB).
#
# GUARD: refuse unless the tid is uniquely in in_progress[]. CONSERVATION: total UNCHANGED (no array move, head-only + annotation).
# Usage: jq --arg now "$NOW" -f scripts/router-d86-alert-fingerprint-migration-rebuild-head-20260616.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| "FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS" as $tid
| . as $root
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) as $before
| ([.task_board.in_progress[]?|select(.id==$tid)]|length) as $ip
| if $ip != 1 then error("tid not uniquely in in_progress[] — refuse head flip: " + ($ip|tostring)) else . end
| .task_board.in_progress = [ .task_board.in_progress[]
    | if .id==$tid then . + {
        migration_fix_commit:"ec03b6ee",
        migration_code_landed_ts:$now,
        migration_tests:"7 pass in fingerprint file / 105 pass across 8 core alert+schema test files / tsc clean",
        migration_diff_verified:"router RAW first-hand: ec03b6ee ancestor of HEAD on main; 2 files only (schema-alerts.ts + test); ddl TEXT UNIQUE->TEXT + partial UNIQUE INDEX (fingerprint) WHERE fingerprint IS NOT NULL; AC-7 fault-path test seeds OLD no-fingerprint schema then asserts column+index PRESENT (non-self-confirming).",
        status:"IN_PROGRESS"
      } else . end ]
| .head = {
    status:"in_progress", updated_at:$now, updated_by:"dev-team",
    active_task_id:$tid, next_agent:"ops", rebuild_required:true,
    next_action:"FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS migration fix landed ec03b6ee (router RAW-verified the diff first-hand: on main, 2 files, ddl TEXT UNIQUE->plain TEXT + partial UNIQUE INDEX idx_alerts_fingerprint WHERE fingerprint IS NOT NULL + non-self-confirming AC-7 fault-path test; 105 core tests pass, tsc clean). COPY-baked /app/src => ops MUST run real `docker compose build mcp-server` THEN `--force-recreate --no-deps` (force-recreate alone ships nothing; NEVER docker compose down). Then ROUTER RAW-verifies LIVE on the named-volume market.db via a keinos/sqlite3 sidecar: (a) image .Created epoch > commit ec03b6ee epoch (compare UTC), (b) container /app/src markers, (c) alerts.fingerprint column PRESENT (PRAGMA table_info), (d) idx_alerts_fingerprint partial unique index PRESENT (PRAGMA index_list + index_xinfo, partial), (e) no duplicate scan:% fingerprints, (f) health + ~11-13 containers Up. Dedup-under-parallel-load proof MONITORED until next market-open scan (market closed now; no-fake-data — cannot force a scan). Then in_progress -> review. DEADLINE: land before next market-open scan ~02:00 UTC (latent alert-write crash until then).",
    note:("ROUTER " + $now + " — dev-team tick: FIX-ALERT-FINGERPRINT migration fix landed ec03b6ee. Router RAW-verified the diff first-hand (NOT relaying the agent badge): ec03b6ee is ancestor of HEAD on main; exactly 2 files (schema-alerts.ts + test); ddl `TEXT UNIQUE`->plain `TEXT` (legal ADD COLUMN) + partial `CREATE UNIQUE INDEX idx_alerts_fingerprint ... WHERE fingerprint IS NOT NULL`; CREATE TABLE also carries fingerprint TEXT for fresh DBs; AC-7 fault-path test seeds the OLD no-fingerprint schema then asserts column+index PRESENT + dedup + legacy NULL survival (kills the self-confirming gap). 105 core tests pass, tsc clean. -> AWAIT-REBUILD round 2 (ops dispatched). Live gate still open: router RAW PRAGMA on the named-volume DB after rebuild (column+index PRESENT) is the bar — QA-green + image-fresh are necessary-not-sufficient (feedback_sqlite_add_column_unique_silent_noop). PUSH held (PO out-of-band).")
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) != $before)
    then error("CONSERVATION FAIL: total changed on a head-only + annotation move") else . end
