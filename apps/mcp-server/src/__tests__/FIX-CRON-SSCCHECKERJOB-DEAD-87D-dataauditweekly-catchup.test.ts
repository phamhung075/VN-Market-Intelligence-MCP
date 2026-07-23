/**
 * FIX-CRON-SSCCHECKERJOB-DEAD-87D — item 2: dataAuditJob:weekly is a SECOND,
 * genuinely-dead job sharing the same root mechanism as item 1 (RAW-verified
 * live 2026-07-23, NOT merely the job_name/CRONS-key label mismatch the audit
 * originally suspected).
 *
 * Live evidence (docker exec against the production named-volume market.db,
 * 2026-07-23): 8 total `dataAuditJob:weekly` rows, ALL at 18:00(:0x) UTC on a
 * Saturday (dow=6) — correct: CRONS.dataAuditWeekly = '0 1 * * 0' registered
 * with `{ timezone: 'Asia/Ho_Chi_Minh' }` = Sunday 01:00 ICT = Saturday 18:00
 * UTC. Cadence: 04-25, 05-02, 05-09, 05-16, [MISSED 05-23], 05-30, 06-06,
 * [MISSED 06-13], 06-20, 06-27, then NOTHING for 26+ days (07-04/07-11/07-18
 * all missing) as of this task's discovery.
 *
 * Root cause: identical mechanism to FIX-CRON-SUNDAY-STARTUP-CATCHUP (item 1
 * of the parent cron audit) — node-cron's recoverMissedExecutions never
 * bridges a process restart; a weekly job gets exactly ONE window per week,
 * so a restart landing during that window silently loses the entire week with
 * no replay. That fix added a Sunday-morning startup-catchup probe for 4 jobs
 * (integrityCheckJob, bondMaturityPollerJob, devTeamHeartbeatJob,
 * predictionOutcomeJob) — dataAuditJob:weekly was NOT included (its
 * job_name/CRONS-key label mismatch — CRONS key `dataAuditWeekly`, job_name
 * `dataAuditJob:weekly` — plus its Saturday-UTC/Sunday-ICT window meant it
 * fell outside that audit's "4 Sunday UTC-morning jobs" scan scope). Same
 * defect, uncaught because it wasn't visible under the audit's search terms.
 *
 * Fix: add a 5th startup-catchup probe in startScheduler.ts for
 * dataAuditJob:weekly, gated to Saturday 18:00 UTC (requiredUtcDay=6) via
 * runWeeklyAuditWithDb(db) — same shouldRunCatchup() mechanism, no new logic
 * needed in shouldRunCatchup itself (it already generically supports
 * requiredUtcDay since FIX-CRON-SUNDAY-STARTUP-CATCHUP).
 *
 * ACs:
 *   AC-1: Saturday + window reached (18:00 UTC) + no row today → true
 *   AC-2: Sunday (not the required Saturday) → false even though window passed
 *   AC-3: Saturday + window not yet reached (17:59 UTC) → false
 *   AC-4: Saturday + window reached + already-ran row exists today → false (dedup)
 *   AC-5: source contract — startScheduler.ts imports runWeeklyAuditWithDb and
 *         wires a dataAuditJob:weekly shouldRunCatchup(..., 18, 0, ..., 6) call
 *         inside a startup-catchup block (prevents silent regression/removal).
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { shouldRunCatchup } from "../scheduler/jobs.js";

function createCronTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cron_job_runs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name     TEXT NOT NULL,
      started_at   TEXT NOT NULL,
      finished_at  TEXT,
      status       TEXT NOT NULL CHECK(status IN ('running','success','error','crashed')),
      rows_written INTEGER,
      error_msg    TEXT,
      duration_ms  INTEGER
    )
  `);
}

function insertRunToday(db: Database, jobName: string): void {
  db.prepare(
    `INSERT INTO cron_job_runs (job_name, started_at, status)
     VALUES (?, datetime('now'), 'success')`,
  ).run(jobName);
}

let db: Database;
beforeEach(() => {
  db = new Database(":memory:");
  createCronTable(db);
});

describe("FIX-CRON-SSCCHECKERJOB-DEAD-87D item 2 — dataAuditJob:weekly startup-catchup (Saturday 18:00 UTC)", () => {
  it("AC-1: Saturday + window reached (18:00 UTC) + no row today → true", () => {
    // 2026-07-25 is a Saturday
    const now = new Date("2026-07-25T18:00:00Z");
    expect(shouldRunCatchup(db, "dataAuditJob:weekly", 18, 0, now, false, undefined, 6)).toBe(true);
  });

  it("AC-2: Sunday (not the required Saturday) → false even though window passed", () => {
    // 2026-07-26 is a Sunday
    const now = new Date("2026-07-26T18:30:00Z");
    expect(shouldRunCatchup(db, "dataAuditJob:weekly", 18, 0, now, false, undefined, 6)).toBe(false);
  });

  it("AC-3: Saturday + window not yet reached (17:59 UTC < 18:00) → false", () => {
    const now = new Date("2026-07-25T17:59:00Z");
    expect(shouldRunCatchup(db, "dataAuditJob:weekly", 18, 0, now, false, undefined, 6)).toBe(false);
  });

  it("AC-4: Saturday + window reached + already-ran row exists today → false (dedup)", () => {
    insertRunToday(db, "dataAuditJob:weekly");
    const now = new Date("2026-07-25T18:00:02Z");
    expect(shouldRunCatchup(db, "dataAuditJob:weekly", 18, 0, now, false, undefined, 6)).toBe(false);
  });

  it("AC-5: source contract — startScheduler.ts wires the dataAuditJob:weekly catchup probe", () => {
    const src = readFileSync(
      join(import.meta.dir, "../scheduler/startScheduler.ts"),
      "utf-8",
    );
    expect(src).toContain("runWeeklyAuditWithDb");
    expect(src).toContain("'dataAuditJob:weekly'");
    // requiredUtcDay=6 (Saturday) + windowUtcHour=18 — locks the exact window
    // so a future edit can't silently drift it back into a false-negative.
    expect(src).toMatch(
      /shouldRunCatchup\(\s*db,\s*'dataAuditJob:weekly',\s*18,\s*0,\s*new Date\(\),\s*false,\s*undefined,\s*6\s*\)/,
    );
  });
});
