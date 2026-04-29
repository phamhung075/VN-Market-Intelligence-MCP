Bun.env["DB_PATH"] = ":memory:";

// src/__tests__/1139-utility-observability.test.ts
import { describe, it, expect } from "bun:test"
import { readFileSync } from "fs"
import { join } from "path"

const JOBS_PATH = join(import.meta.dir, "../../src/scheduler/startScheduler.ts")
const src = readFileSync(JOBS_PATH, "utf8")

describe("Task 1139 — Utility/infra jobs wrapped in recordJobRun", () => {
  it("franceSummaryJob uses recordJobRun", () => {
    // Pattern: recordJobRun(getDb(), 'franceSummaryJob', ...) wrapping runFranceSummary
    expect(src).toContain('recordJobRun(getDb(), "franceSummaryJob"')
    expect(src).toContain('runFranceSummary()')
  })

  it("devTeamHeartbeatJob uses recordJobRun", () => {
    expect(src).toContain('recordJobRun(getDb(), "devTeamHeartbeatJob"')
    expect(src).toContain('runDevTeamHeartbeat()')
  })

  it("weatherCheckJob uses recordJobRun", () => {
    expect(src).toContain('recordJobRun(getDb(), "weatherCheckJob"')
    expect(src).toContain('runWeatherCheck()')
  })

  it("davPharmacyCheckJob uses recordJobRun", () => {
    expect(src).toContain('recordJobRun(getDb(), "davPharmacyCheckJob"')
    expect(src).toContain('runDavPharmacyCheck()')
  })

  it("franceSummaryJob does not have bare await runFranceSummary without recordJobRun", () => {
    // Ensure we do not have the old unwrapped pattern:
    //   async () => {\n    await runFranceSummary()\n  }
    // (bare call outside recordJobRun)
    const franceSummaryBlock = src.match(
      /CRONS\.franceSummary[\s\S]*?}\s*,\s*\{[^}]+\}\s*\)/
    )?.[0] ?? ""
    expect(franceSummaryBlock).toContain("recordJobRun")
  })

  it("devTeamHeartbeatJob does not have bare await runDevTeamHeartbeat without recordJobRun", () => {
    const block = src.match(
      /CRONS\.devTeamHeartbeat[\s\S]*?}\s*,\s*\{[^}]+\}\s*\)/
    )?.[0] ?? ""
    expect(block).toContain("recordJobRun")
  })

  it("weatherCheckJob does not have bare await runWeatherCheck without recordJobRun", () => {
    const block = src.match(
      /CRONS\.weatherCheck[\s\S]*?}\s*,\s*\{[^}]+\}\s*\)/
    )?.[0] ?? ""
    expect(block).toContain("recordJobRun")
  })

  it("davPharmacyCheckJob does not have bare await runDavPharmacyCheck without recordJobRun", () => {
    const block = src.match(
      /CRONS\.davPharmacyCheck[\s\S]*?}\s*,\s*\{[^}]+\}\s*\)/
    )?.[0] ?? ""
    expect(block).toContain("recordJobRun")
  })
})
