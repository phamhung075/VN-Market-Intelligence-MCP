# Router 2026-06-16 — dev-team tick: FIX-ALERT-FINGERPRINT structural live-verify PASS -> promote in_progress -> review.
#
# ops (agent a555d5c3) ran a REAL rebuild: image sha256:7bdbd867 .Created 2026-06-16T13:20:52Z. Router RAW-verified
# FIRST-HAND (not relaying the ops badge):
#   (a) image .Created epoch 1781616052 (13:20:52Z) > commit ec03b6ee ct 1781615863 (13:17:43Z) by 189s — image is fresh.
#   (b) running container /app/src/infrastructure/db/schema-alerts.ts: `fingerprint TEXT` (L31 CREATE TABLE + L61 ALTER),
#       partial `CREATE UNIQUE INDEX idx_alerts_fingerprint ON alerts(fingerprint) WHERE fingerprint IS NOT NULL` (L73-75),
#       grep -c "TEXT UNIQUE" == 0 — source is live; container restarted 13:21:00 (market.db mtime 13:21).
#   (c) named-volume market.db (keinos/sqlite3 sidecar, --entrypoint sqlite3): PRAGMA shows `fingerprint TEXT` column
#       PRESENT (alerts col count 18 -> 19); idx_alerts_fingerprint PRESENT as a PARTIAL unique index (sql carries
#       `WHERE fingerprint IS NOT NULL`); 1283 legacy rows survived (all NULL-fp, none purged); ZERO duplicate non-null
#       fingerprints. Health 200, 11 containers Up, restarts=0, no peer destruction.
#
# REMAINING GATE (NOT structural): the dedup-under-real-load proof — INSERT OR IGNORE actually dropping duplicate
# scan:% fingerprints — requires a LIVE market-open scan (~02:00 UTC). Market is closed now; cannot force a scan
# (no-fake-data). => promote to review and WITHHOLD done_verified; the dedup-drain is MONITORED until next market open.
#
# GUARD: refuse unless the tid is uniquely in in_progress[]. CONSERVATION: total UNCHANGED (in_progress -1, review +1).
# Usage: jq --arg now "$NOW" -f scripts/router-d87-alert-fingerprint-promote-review-20260616.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| "FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS" as $tid
| . as $root
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) as $before
| ([.task_board.in_progress[]?|select(.id==$tid)]|length) as $ip
| if $ip != 1 then error("tid not uniquely in in_progress[] — refuse promote: " + ($ip|tostring)) else . end
| ([.task_board.in_progress[]?|select(.id==$tid)][0]) as $task
| ($task + {
    status:"REVIEW",
    rebuild_commit:"ec03b6ee",
    rebuild_image:"sha256:7bdbd867 .Created 2026-06-16T13:20:52Z (epoch 1781616052 > commit ct 1781615863 by 189s)",
    live_verify_2:"GREEN (structural) — router RAW on named-volume market.db after rebuild: alerts.fingerprint TEXT column PRESENT (col count 18->19); idx_alerts_fingerprint PARTIAL unique index PRESENT (WHERE fingerprint IS NOT NULL); 1283 legacy rows survived (all NULL-fp, none purged); ZERO duplicate non-null fingerprints; /app/src markers live; health 200; 11 containers Up restarts=0.",
    done_verified_withheld:"Dedup-under-real-load proof PENDING — INSERT OR IGNORE dropping duplicate scan:% fingerprints needs a LIVE market-open scan (~02:00 UTC). Market closed now; cannot force (no-fake-data /goal). MONITOR next market-open scan: assert <=1 row per (ticker,kind,fingerprint) per dedup window + pending backlog drains, THEN -> done_verified.",
    monitor_deadline:"2026-06-16T02:00:00Z-class next market-open scan (next session ~2026-06-17 02:00 UTC)",
    promoted_to_review_ts:$now,
    promoted_by:"dev-team"
  }) as $promoted
| .task_board.in_progress = [ .task_board.in_progress[] | select(.id!=$tid) ]
| .task_board.review = ([ $promoted ] + .task_board.review)
| .head = {
    status:"in_progress", updated_at:$now, updated_by:"dev-team",
    active_task_id:$tid, next_agent:"qa", rebuild_required:false,
    next_action:"FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS promoted in_progress -> review after STRUCTURAL live-verify PASS (router RAW first-hand on named-volume market.db: alerts.fingerprint column PRESENT, idx_alerts_fingerprint partial unique index PRESENT WHERE fingerprint IS NOT NULL, 1283 legacy rows survived, 0 dup non-null fp; image 7bdbd867 .Created 13:20:52Z > commit ec03b6ee 13:17:43Z; health 200, 11 Up). done_verified WITHHELD: the dedup-under-real-load proof needs a LIVE market-open scan (~02:00 UTC) — cannot force (no-fake-data). QA may validate test quality + code in review; the FINAL done_verified gate is the market-open dedup-drain observation (<=1 row per (ticker,kind,fingerprint) per dedup window + pending backlog drains), MONITORED at next market open by the dev-team cron. PUSH held (PO out-of-band).",
    note:("ROUTER " + $now + " — dev-team tick CLOSE: FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS lane resolved to REVIEW. Full chain: code 75e7a80f -> rebuild (silent-no-op caught: ALTER ADD COLUMN TEXT UNIQUE illegal, swallowed) -> migration fix ec03b6ee (TEXT UNIQUE->plain TEXT + partial UNIQUE INDEX, mirror in-file broker_sanctions, + non-self-confirming AC-7 fault-path test; 105 core tests, tsc clean) -> ops REAL rebuild 7bdbd867 -> router RAW live-verify on named-volume market.db: column+index PRESENT, 1283 legacy rows survived, 0 dup, health 200, 11 Up. Structural gate GREEN; done_verified WITHHELD pending market-open dedup-drain (no-fake-data — cannot force a scan). Coding mutex task:FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS to be released (owner_agent dev-mcp-server). PUSH held (PO out-of-band).")
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) != $before)
    then error("CONSERVATION FAIL: total changed on an in_progress->review move") else . end
