Bun.env["DB_PATH"] = ":memory:";

// src/__tests__/1138-market-portfolio-observability.test.ts
import { describe, it, expect } from "bun:test"
import { readFileSync } from "fs"
import { join } from "path"
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

const jobsSource = readFileSync(
  join(import.meta.dir, "../../src/scheduler/startScheduler.ts"),
  "utf8",
)

describe("Task 1138 — market/portfolio/prediction jobs observability", () => {
  // Task 1839a Phase 2: recordJobRun(getDb(), ...) replaced by jobRunRepo.wrapRun(...)

  it("patternWatch callback wraps runPatternWatch with jobRunRepo.wrapRun", () => {
    const match = jobsSource.match(
      /CRONS\.patternWatch[\s\S]*?jobRunRepo\.wrapRun\s*\(\s*['"]patternWatchJob['"]/,
    )
    expect(match).not.toBeNull()
  })

  it("weeklyPortfolioReport callback wraps runWeeklyPortfolioReport with jobRunRepo.wrapRun", () => {
    const match = jobsSource.match(
      /CRONS\.weeklyPortfolioReport[\s\S]*?jobRunRepo\.wrapRun\s*\(\s*['"]weeklyPortfolioReportJob['"]/,
    )
    expect(match).not.toBeNull()
  })

  it("predictionMarketPoll callback wraps runPredictionMarketPoll with jobRunRepo.wrapRun", () => {
    const match = jobsSource.match(
      /CRONS\.predictionMarketPoll[\s\S]*?jobRunRepo\.wrapRun\s*\(\s*['"]predictionMarketPollJob['"]/,
    )
    expect(match).not.toBeNull()
  })

  it("predictionOutcome callback wraps runPredictionOutcomeCheck with jobRunRepo.wrapRun", () => {
    const match = jobsSource.match(
      /CRONS\.predictionOutcome[\s\S]*?jobRunRepo\.wrapRun\s*\(\s*['"]predictionOutcomeJob['"]/,
    )
    expect(match).not.toBeNull()
  })

  it("patternWatch does not have a bare await runPatternWatch() without wrapRun wrapper", () => {
    const blockMatch = jobsSource.match(
      /cron\.schedule\(CRONS\.patternWatch[\s\S]*?\}\s*,\s*\{[^}]*\}\s*\)/,
    )
    expect(blockMatch).not.toBeNull()
    const block = blockMatch![0]
    // Must contain jobRunRepo.wrapRun (observability preserved via Phase 2 pattern)
    expect(block).toContain("jobRunRepo.wrapRun")
  })

  it("weeklyPortfolioReport does not have a bare await without wrapRun wrapper", () => {
    const blockMatch = jobsSource.match(
      /cron\.schedule\(CRONS\.weeklyPortfolioReport[\s\S]*?\}\s*,\s*\{[^}]*\}\s*\)/,
    )
    expect(blockMatch).not.toBeNull()
    const block = blockMatch![0]
    expect(block).toContain("jobRunRepo.wrapRun")
  })

  it("predictionMarketPoll does not have a bare await without wrapRun wrapper", () => {
    const blockMatch = jobsSource.match(
      /cron\.schedule\(CRONS\.predictionMarketPoll[\s\S]*?\}\s*,\s*\{[^}]*\}\s*\)/,
    )
    expect(blockMatch).not.toBeNull()
    const block = blockMatch![0]
    expect(block).toContain("jobRunRepo.wrapRun")
  })

  it("predictionOutcome does not have a bare await without wrapRun wrapper", () => {
    const blockMatch = jobsSource.match(
      /cron\.schedule\(CRONS\.predictionOutcome[\s\S]*?\}\s*,\s*\{[^}]*timezone[^}]*\}\s*\)/,
    )
    expect(blockMatch).not.toBeNull()
    const block = blockMatch![0]
    expect(block).toContain("jobRunRepo.wrapRun")
  })
})
