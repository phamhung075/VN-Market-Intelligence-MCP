# Router 2026-06-16 — dev-team tick: FIX-ALERT-FINGERPRINT live gate caught a schema-migration silent-no-op.
#
# ops afd9a3bc ran a REAL build (verified: image sha256:9d2f4113 .Created 2026-06-16T12:56:23Z POSTDATES commit
# 75e7a80f 12:51:15Z by ~5m; container /app/src markers all present — code IS live). BUT router RAW live-verify on the
# named-volume market.db (PRAGMA table_info(alerts)) found the `fingerprint` column ABSENT (has_fp=0, no fp index).
#
# ROOT CAUSE (read first-hand at apps/mcp-server/src/infrastructure/db/schema-alerts.ts:54-58): the migration runs
#   `ALTER TABLE alerts ADD COLUMN fingerprint TEXT UNIQUE` inside `try{...}catch{}`. SQLite FORBIDS adding a UNIQUE
#   (or PK) column via ALTER TABLE ADD COLUMN on ANY existing table (fresh or legacy) — the statement throws and the
#   bare catch swallows it, so the column is NEVER created on a real DB. The CREATE TABLE (lines 17-31) omits it too.
#   The broker_sanctions block 60 lines below (124-168) handles this EXACT SQLite limitation correctly via
#   recreate-and-rename — the fingerprint fix ignored that established in-file pattern.
# BLAST RADIUS: taAlertScanJob.ts:126-128/252 + bbAlertScanJob both prepare `INSERT OR IGNORE INTO alerts (... fingerprint)`
#   -> on the live DB this throws "no such column: fingerprint" -> EVERY scan-alert write fails at the next market-open
#   scan (~02:00 UTC). This deploy REGRESSED the path from "dedup missing" to "alert-write broken". Market closed now;
#   ~13h window to land the migration fix + rebuild before it manifests.
# WHY GREEN MISSED IT: the 125 tests build their own schema WITH the column (self-confirming tests), never exercising
#   the production migration; a real rebuild ships SOURCE not schema-runtime-state. Only live PRAGMA on the named volume
#   surfaces it (feedback_silent_swallow_serial_bugs + contract-from-live-payload class).
#
# DISPOSITION: same lane, NOT done -> route back to dev-mcp-server (zone apps/mcp-server/) to complete the migration.
#   PRESCRIBED generic fix (/goal#2, no per-ticker/date literal): schema-alerts.ts -> change the fingerprint ALTER ddl
#   from "TEXT UNIQUE" to plain "TEXT" (legal ADD COLUMN, all DBs) AND enforce uniqueness via a PARTIAL unique index:
#   `CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_fingerprint ON alerts(fingerprint) WHERE fingerprint IS NOT NULL`
#   (partial so legacy NULL-fingerprint rows don't collide; INSERT OR IGNORE honors the partial index since scan rows
#   always bind a non-null fingerprint). Add a fault-path test that runs initAlertsTables on a DB built from the OLD
#   CREATE TABLE (no fingerprint) and asserts the column+index EXIST afterward (kills the self-confirming gap).
#
# GUARD: refuse unless tid uniquely in in_progress[]. CONSERVATION: total UNCHANGED (head-only + task annotation).
# Usage: jq --arg now "$NOW" -f scripts/router-d85-alert-fingerprint-migration-redrive-20260616.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| "FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS" as $tid
| . as $root
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) as $before
| ([.task_board.in_progress[]?|select(.id==$tid)]|length) as $ip
| if $ip != 1 then error("tid not uniquely in in_progress[] — refuse redrive: " + ($ip|tostring)) else . end
| .task_board.in_progress = [ .task_board.in_progress[]
    | if .id==$tid then . + {
        rebuild_done_ts:$now,
        live_verify:"RED — router RAW on named-volume market.db (PRAGMA table_info(alerts)) found fingerprint column ABSENT (has_fp=0, no fp index). Build WAS real (image sha256:9d2f4113 .Created 12:56:23Z > commit 75e7a80f 12:51:15Z; /app/src markers live) — defect is a schema-migration silent-no-op, not a stale image.",
        live_verify_root_cause:"schema-alerts.ts:54-58 runs `ALTER TABLE alerts ADD COLUMN fingerprint TEXT UNIQUE` in try{}catch{}; SQLite forbids ADD COLUMN with UNIQUE on an existing table -> throws -> swallowed -> column never created. CREATE TABLE omits it too. taAlertScanJob/bbAlertScanJob INSERT references fingerprint -> 'no such column' on every scan-alert write at next market-open scan.",
        prescribed_fix:"schema-alerts.ts: fingerprint ALTER ddl TEXT UNIQUE -> plain TEXT; add CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_fingerprint ON alerts(fingerprint) WHERE fingerprint IS NOT NULL. Mirror the in-file broker_sanctions precedent. Add a fault-path test that initAlertsTables on the OLD (no-fingerprint) schema then asserts column+index exist.",
        status:"IN_PROGRESS",
        reopened_by:"dev-team",
        reopened_ts:$now
      } else . end ]
| .head = {
    status:"in_progress", updated_at:$now, updated_by:"dev-team",
    active_task_id:$tid, next_agent:"dev-mcp-server", rebuild_required:false,
    next_action:"FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS live gate RED: ops ran a REAL build (image .Created 12:56:23Z > commit 75e7a80f, /app/src markers live) but router RAW-verify on the named-volume market.db found the fingerprint column ABSENT. ROOT: schema-alerts.ts:54 `ALTER TABLE alerts ADD COLUMN fingerprint TEXT UNIQUE` is illegal SQLite (no UNIQUE via ADD COLUMN) -> throws -> bare catch{} swallows -> column never created; INSERT OR IGNORE ... fingerprint then crashes every scan-alert write at next market-open scan. dev-mcp-server: change ddl TEXT UNIQUE -> TEXT + add partial UNIQUE INDEX (fingerprint) WHERE fingerprint IS NOT NULL (mirror broker_sanctions recreate precedent in same file) + add a non-self-confirming fault-path test. Then ops REAL rebuild, then ROUTER RAW re-verify column+index PRESENT on named-volume DB + no dup scan:% fingerprints. Then -> review. DEADLINE: land before next market-open scan ~02:00 UTC (latent alert-write crash until then).",
    note:("ROUTER " + $now + " — FIX-ALERT-FINGERPRINT live gate RED. ops afd9a3bc rebuild was REAL (image 9d2f4113 .Created 12:56:23Z POSTDATES commit 75e7a80f 12:51:15Z; /app/src markers present — code live) — but router RAW PRAGMA on named-volume market.db: alerts.fingerprint column ABSENT (has_fp=0). Root = schema-alerts.ts:54 ALTER ADD COLUMN ... TEXT UNIQUE illegal in SQLite, swallowed by catch{} -> column never created -> INSERT OR IGNORE ... fingerprint will crash every scan-alert write at next market-open scan (~02:00 UTC; ~13h window). 125 green = self-confirming tests build their own schema; real rebuild ships source not runtime schema-state. Routed back to dev-mcp-server (same lane, WIP=1): TEXT UNIQUE->TEXT + partial UNIQUE INDEX (mirror in-file broker_sanctions) + non-self-confirming fault-path test. ops afd9a3bc image-epoch FAIL claim was a FALSE alarm (botched conversion) — router corrected first-hand. PUSH held (PO out-of-band).")
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) != $before)
    then error("CONSERVATION FAIL: total changed on a head-only + annotation move") else . end
