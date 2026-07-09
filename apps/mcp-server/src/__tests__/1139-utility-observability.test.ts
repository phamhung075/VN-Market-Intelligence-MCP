Bun.env["DB_PATH"] = ":memory:";

// src/__tests__/1139-utility-observability.test.ts
import { describe, it, expect } from "bun:test"
import { readFileSync } from "fs"
import { join } from "path"

// FACTORY-SCHEDULER-job-table-registry: franceSummary's REGULAR cron registration,
// devTeamHeartbeat / weatherCheck / davPharmacyCheck's cron registrations moved from an
// inline scheduleCron(CRONS.x, async () => { jobRunRepo.wrapRun('xJob', ...) }, opts)
// block in startScheduler.ts into a declarative { name, cron, options, runner } entry in
// schedulerJobTable.ts's buildJobTable(). registerJobTable() wraps EVERY entry in
// jobRunRepo.wrapRun(j.name, j.runner) generically, so the observability invariant now
// holds structurally for any entry present in the table.
const JOBS_PATH = join(import.meta.dir, "../../src/scheduler/schedulerJobTable.ts")
const src = readFileSync(JOBS_PATH, "utf8")

/** Extracts a single buildJobTable() entry's source text by its `name: 'jobName'` marker,
 *  walking backward to the entry's opening `{` and forward (brace-depth-aware) to its
 *  matching closing `}` — robust to nested objects/functions inside the runner body. */
function extractJobTableEntry(source: string, jobName: string): string {
  const idx = source.indexOf(`name: '${jobName}'`)
  if (idx === -1) return ""
  const start = source.lastIndexOf("{", idx)
  if (start === -1) return ""
  let depth = 0
  let end = start
  for (let i = start; i < source.length; i++) {
    if (source[i] === "{") depth++
    else if (source[i] === "}") {
      depth--
      if (depth === 0) { end = i + 1; break }
    }
  }
  return source.slice(start, end)
}

describe("Task 1139 — Utility/infra jobs wrapped in observability (Phase 2)", () => {
  // Task 1839a Phase 2: recordJobRun(getDb(), ...) replaced by jobRunRepo.wrapRun(...)

  it("franceSummaryJob JOB_TABLE entry wraps runFranceSummary, wired to CRONS.franceSummary", () => {
    const entry = extractJobTableEntry(src, "franceSummaryJob")
    expect(entry).not.toBe("")
    expect(entry).toContain("cron: CRONS.franceSummary")
    expect(entry).toContain("runFranceSummary()")
  })

  it("devTeamHeartbeatJob JOB_TABLE entry wraps runDevTeamHeartbeat, wired to CRONS.devTeamHeartbeat", () => {
    const entry = extractJobTableEntry(src, "devTeamHeartbeatJob")
    expect(entry).not.toBe("")
    expect(entry).toContain("cron: CRONS.devTeamHeartbeat")
    expect(entry).toContain("runDevTeamHeartbeat()")
  })

  it("weatherCheckJob JOB_TABLE entry wraps runWeatherCheck, wired to CRONS.weatherCheck", () => {
    const entry = extractJobTableEntry(src, "weatherCheckJob")
    expect(entry).not.toBe("")
    expect(entry).toContain("cron: CRONS.weatherCheck")
    expect(entry).toContain("runWeatherCheck()")
  })

  it("davPharmacyCheckJob JOB_TABLE entry wraps runDavPharmacyCheck, wired to CRONS.davPharmacyCheck", () => {
    const entry = extractJobTableEntry(src, "davPharmacyCheckJob")
    expect(entry).not.toBe("")
    expect(entry).toContain("cron: CRONS.davPharmacyCheck")
    expect(entry).toContain("runDavPharmacyCheck()")
  })

  it("registerJobTable wraps every entry in jobRunRepo.wrapRun (generic — no per-job bare-await path exists)", () => {
    const match = src.match(
      /scheduleCron\(j\.cron,\s*\(\)\s*=>\s*jobRunRepo\.wrapRun\(j\.name,\s*j\.runner\)/,
    )
    expect(match).not.toBeNull()
  })
})
