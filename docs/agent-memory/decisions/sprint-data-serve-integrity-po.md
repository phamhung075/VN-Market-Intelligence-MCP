# Decision Journal — Sprint data-serve-integrity · po

**Sprint goal:** DSI — verify layer serving real value; close consumer loop; durable telemetry.
**Agent:** po
**Started:** 2026-06-23T04:32:49Z

---

## STEP — FIX-DB-INTEGRITY-TRAIL-GITRESET-DATALOSS — P2→P1 escalate + dispatch
**task_id:** FIX-DB-INTEGRITY-TRAIL-GITRESET-DATALOSS
**when:** 2026-06-23T04:32:49Z
**trigger:** Tracked-defect MATERIALIZED — router-verified live 04:28Z: db-integrity-history.json 38→10 entries; ~28 uncommitted 06-21/06-22 scan appends wiped by a fleet `git reset --hard` during an ~11.5h system-auditor hang. Stopgap commit 5be25914 (survives reset --hard HEAD only).
**what-considered:** (1) mint a duplicate DB-anomaly signal — REJECTED (router instruction + task already exists; DB itself HEALTHY this tick, this is a git-tracking defect not a DB-data anomaly); (2) leave P2 in backlog — REJECTED (predicted failure now caused REAL data loss, expedite warranted); (3) bundle the broader surgical-reset scope — REJECTED (separate larger scope, already in task .out_of_scope; broad .gitignore-policy / commit-on-write hook is a deferred PO call).
**why-change:** only path — promote backlog→ready, escalate P2→P1 + blocking:true, repoint idle head (WIP=0) → developer so dev-team Step-0b dispatches NOW. cross-service git+gitignore work → generic developer.
**fix (per task):** `git rm --cached docs/data/db-integrity-history.json` + add to .gitignore; writer scripts/db-integrity-history-append.sh recreates if missing (untrack safe). done_verified = appends survive a real reset tick. No rebuild.
**broader-risk (ask #2):** same reset-wipe class exposes other uncommitted telemetry (orch-state signal_queue, 53 in tree). Annotated on the task as awareness; durable broad policy = deferred, not minted now (avoid scope creep + per perpetual-dirty-tree memory a per-tick commit dirties tree → push conflicts).
**artifact:** scripts/po-s111-dbintegrity-trail-gitreset-p1-promote-dispatch.jq (idempotent, conservation+placement guarded, re-run delta 0).
