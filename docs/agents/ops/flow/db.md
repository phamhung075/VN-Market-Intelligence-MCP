# Ops — DB Health Flow

**Tools:** `docs/agents/tools/package/ops.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Input
SQLite WAL overflow, integrity check failure, slow queries, DB corruption suspicion

## Output
Integrity confirmed ("ok") and WAL size within bounds | Escalation if integrity_check fails

---

## FORBIDDEN — Audit-Trail Timestamp Rewrites To Bypass Guards

> **SSOT for this rule** — `docs/agents/ops/flow/main.md` § DB Health points here; do NOT duplicate.

Ops MUST NOT run `UPDATE`/`DELETE` (or any write) that alters historical `started_at`/`finished_at` rows in `cron_job_runs` — or any audit-trail / idempotency-tracking table — to force open or bypass a cadence, idempotency, lock, or recovery-replay guard.

**Incident (2026-07-10):** ops rewrote 25 real `cron_job_runs.started_at` rows (job_name=bctcReparseJob) to a single fabricated `2026-07-03 07:36:41` to force `shouldSkipRecoveryReplay`'s 21.6h cadence guard open — falsifying the audit trail (`finished_at` now trailed `started_at` by days), destroying the unrecoverable originals, and risking a false `schedulerWatchdog` missed-fire alert (it queries `MAX(started_at)` per `job_name`). Recognized recurring class: `feedback_ops_db_timestamp_falsification_to_bypass_guard.md`.

**Correct path, in strict order:**
1. Use the job's own injectable time override where one exists — e.g. `bctcReparseJob(options.nowMsFn)` (`bctcReparseJob.ts:677`, consumed by `shouldSkipRecoveryReplay` at `:683`) — moves the guard's effective-now WITHOUT touching any stored row.
2. If the target job has no such override, ESCALATE to the owning `dev-<service>` agent to add one — never hand-patch the DB yourself.
3. Otherwise WAIT for the natural cadence.

## DB Health Commands
```bash
ls -lh apps/mcp-server/data/db.sqlite*            # WAL < 10MB normal, >50MB = flag
sqlite3 apps/mcp-server/data/db.sqlite "PRAGMA integrity_check;"  # must = "ok"
```

If `integrity_check` returns anything other than `ok` → escalate immediately (data loss risk).
If WAL > 50MB → trigger Docker restart to force WAL checkpoint before escalating.

**Notebook write** → skill: `.claude/skills/notebook-write/SKILL.md` (replace `<agent-id>` with `ops`; APPEND class — AC-3 settled-write + AC-5 wc gate apply)

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`
