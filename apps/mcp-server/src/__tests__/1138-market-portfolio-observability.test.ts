Bun.env["DB_PATH"] = ":memory:";

// src/__tests__/1138-market-portfolio-observability.test.ts
import { describe, it, expect } from "bun:test"
import { readFileSync } from "fs"
import { join } from "path"

// FACTORY-SCHEDULER-job-table-registry: patternWatch / weeklyPortfolioReport /
// predictionMarketPoll / predictionOutcome's cron registration moved from an inline
// scheduleCron(CRONS.x, async () => { jobRunRepo.wrapRun('xJob', ...) }, opts) block in
// startScheduler.ts into a declarative { name, cron, options, runner } entry in
// schedulerJobTable.ts's buildJobTable(). registerJobTable() wraps EVERY entry in
// jobRunRepo.wrapRun(j.name, j.runner) generically, so the observability invariant now
// holds structurally for any entry present in the table — these tests verify presence +
// correct cron-key/runner-body wiring per job.
const jobTableSource = readFileSync(
  join(import.meta.dir, "../../src/scheduler/schedulerJobTable.ts"),
  "utf8",
)

/** Extracts a single buildJobTable() entry's source text by its `name: 'jobName'` marker,
 *  walking backward to the entry's opening `{` and forward (brace-depth-aware) to its
 *  matching closing `}` — robust to nested objects/functions inside the runner body. */
function extractJobTableEntry(src: string, jobName: string): string {
  const idx = src.indexOf(`name: '${jobName}'`)
  if (idx === -1) return ""
  const start = src.lastIndexOf("{", idx)
  if (start === -1) return ""
  let depth = 0
  let end = start
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") depth++
    else if (src[i] === "}") {
      depth--
      if (depth === 0) { end = i + 1; break }
    }
  }
  return src.slice(start, end)
}

describe("Task 1138 — market/portfolio/prediction jobs observability", () => {
  // Task 1839a Phase 2: recordJobRun(getDb(), ...) replaced by jobRunRepo.wrapRun(...)

  it("patternWatch JOB_TABLE entry wraps runPatternWatch, wired to CRONS.patternWatch", () => {
    const entry = extractJobTableEntry(jobTableSource, "patternWatchJob")
    expect(entry).not.toBe("")
    expect(entry).toContain("cron: CRONS.patternWatch")
    expect(entry).toContain("runPatternWatch()")
  })

  it("weeklyPortfolioReport JOB_TABLE entry wraps runWeeklyPortfolioReport, wired to CRONS.weeklyPortfolioReport", () => {
    const entry = extractJobTableEntry(jobTableSource, "weeklyPortfolioReportJob")
    expect(entry).not.toBe("")
    expect(entry).toContain("cron: CRONS.weeklyPortfolioReport")
    expect(entry).toContain("runWeeklyPortfolioReport()")
  })

  it("predictionMarketPoll JOB_TABLE entry wraps runPredictionMarketPoll, wired to CRONS.predictionMarketPoll", () => {
    const entry = extractJobTableEntry(jobTableSource, "predictionMarketPollJob")
    expect(entry).not.toBe("")
    expect(entry).toContain("cron: CRONS.predictionMarketPoll")
    expect(entry).toContain("runPredictionMarketPoll()")
  })

  it("predictionOutcome JOB_TABLE entry wraps runPredictionOutcomeCheck, wired to CRONS.predictionOutcome", () => {
    const entry = extractJobTableEntry(jobTableSource, "predictionOutcomeJob")
    expect(entry).not.toBe("")
    expect(entry).toContain("cron: CRONS.predictionOutcome")
    expect(entry).toContain("runPredictionOutcomeCheck()")
  })

  it("registerJobTable wraps every entry in jobRunRepo.wrapRun (generic — no per-job bare-await path exists)", () => {
    // FACTORY-SCHEDULER-job-table-registry: the generic loop is the ONLY place
    // buildJobTable() entries get executed — there is no code path that calls a
    // JOB_TABLE runner without going through jobRunRepo.wrapRun(j.name, j.runner).
    const match = jobTableSource.match(
      /scheduleCron\(j\.cron,\s*\(\)\s*=>\s*jobRunRepo\.wrapRun\(j\.name,\s*j\.runner\)/,
    )
    expect(match).not.toBeNull()
  })
})
