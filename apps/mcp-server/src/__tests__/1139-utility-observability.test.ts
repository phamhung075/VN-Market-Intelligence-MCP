Bun.env["DB_PATH"] = ":memory:";

// src/__tests__/1139-utility-observability.test.ts
import { describe, it, expect } from "bun:test"
import { readFileSync } from "fs"
import { join } from "path"
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

const JOBS_PATH = join(import.meta.dir, "../../src/scheduler/startScheduler.ts")
const src = readFileSync(JOBS_PATH, "utf8")

describe("Task 1139 — Utility/infra jobs wrapped in observability (Phase 2)", () => {
  // Task 1839a Phase 2: recordJobRun(getDb(), ...) replaced by jobRunRepo.wrapRun(...)

  it("franceSummaryJob uses jobRunRepo.wrapRun", () => {
    expect(src).toContain('jobRunRepo.wrapRun("franceSummaryJob"')
    expect(src).toContain('runFranceSummary()')
  })

  it("devTeamHeartbeatJob uses jobRunRepo.wrapRun", () => {
    expect(src).toContain('jobRunRepo.wrapRun("devTeamHeartbeatJob"')
    expect(src).toContain('runDevTeamHeartbeat()')
  })

  it("weatherCheckJob uses jobRunRepo.wrapRun", () => {
    expect(src).toContain('jobRunRepo.wrapRun("weatherCheckJob"')
    expect(src).toContain('runWeatherCheck()')
  })

  it("davPharmacyCheckJob uses jobRunRepo.wrapRun", () => {
    expect(src).toContain('jobRunRepo.wrapRun("davPharmacyCheckJob"')
    expect(src).toContain('runDavPharmacyCheck()')
  })

  it("franceSummaryJob does not have bare await runFranceSummary without wrapRun", () => {
    const franceSummaryBlock = src.match(
      /CRONS\.franceSummary[\s\S]*?}\s*,\s*\{[^}]+\}\s*\)/
    )?.[0] ?? ""
    expect(franceSummaryBlock).toContain("jobRunRepo.wrapRun")
  })

  it("devTeamHeartbeatJob does not have bare await runDevTeamHeartbeat without wrapRun", () => {
    const block = src.match(
      /CRONS\.devTeamHeartbeat[\s\S]*?}\s*,\s*\{[^}]+\}\s*\)/
    )?.[0] ?? ""
    expect(block).toContain("jobRunRepo.wrapRun")
  })

  it("weatherCheckJob does not have bare await runWeatherCheck without wrapRun", () => {
    const block = src.match(
      /CRONS\.weatherCheck[\s\S]*?}\s*,\s*\{[^}]+\}\s*\)/
    )?.[0] ?? ""
    expect(block).toContain("jobRunRepo.wrapRun")
  })

  it("davPharmacyCheckJob does not have bare await runDavPharmacyCheck without wrapRun", () => {
    const block = src.match(
      /CRONS\.davPharmacyCheck[\s\S]*?}\s*,\s*\{[^}]+\}\s*\)/
    )?.[0] ?? ""
    expect(block).toContain("jobRunRepo.wrapRun")
  })
})
