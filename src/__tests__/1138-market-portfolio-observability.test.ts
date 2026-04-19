Bun.env["DB_PATH"] = ":memory:";

// src/__tests__/1138-market-portfolio-observability.test.ts
import { describe, it, expect } from "bun:test"
import { readFileSync } from "fs"
import { join } from "path"

const jobsSource = readFileSync(
  join(import.meta.dir, "../../src/scheduler/jobs.ts"),
  "utf8",
)

describe("Task 1138 — market/portfolio/prediction jobs observability", () => {
  it("patternWatch callback wraps runPatternWatch with recordJobRun", () => {
    // The callback must call recordJobRun, not a bare await runPatternWatch()
    const match = jobsSource.match(
      /CRONS\.patternWatch[\s\S]*?recordJobRun\(getDb\(\),\s*['"]patternWatchJob['"]/,
    )
    expect(match).not.toBeNull()
  })

  it("weeklyPortfolioReport callback wraps runWeeklyPortfolioReport with recordJobRun", () => {
    const match = jobsSource.match(
      /CRONS\.weeklyPortfolioReport[\s\S]*?recordJobRun\(getDb\(\),\s*['"]weeklyPortfolioReportJob['"]/,
    )
    expect(match).not.toBeNull()
  })

  it("predictionMarketPoll callback wraps runPredictionMarketPoll with recordJobRun", () => {
    const match = jobsSource.match(
      /CRONS\.predictionMarketPoll[\s\S]*?recordJobRun\(getDb\(\),\s*['"]predictionMarketPollJob['"]/,
    )
    expect(match).not.toBeNull()
  })

  it("predictionOutcome callback wraps runPredictionOutcomeCheck with recordJobRun", () => {
    const match = jobsSource.match(
      /CRONS\.predictionOutcome[\s\S]*?recordJobRun\(getDb\(\),\s*['"]predictionOutcomeJob['"]/,
    )
    expect(match).not.toBeNull()
  })

  it("patternWatch does not have a bare await runPatternWatch() without recordJobRun wrapper", () => {
    // Find the patternWatch cron block
    const blockMatch = jobsSource.match(
      /cron\.schedule\(CRONS\.patternWatch[\s\S]*?\}\s*,\s*\{[^}]*\}\s*\)/,
    )
    expect(blockMatch).not.toBeNull()
    const block = blockMatch![0]
    // Must contain recordJobRun
    expect(block).toContain("recordJobRun")
  })

  it("weeklyPortfolioReport does not have a bare await without recordJobRun wrapper", () => {
    const blockMatch = jobsSource.match(
      /cron\.schedule\(CRONS\.weeklyPortfolioReport[\s\S]*?\}\s*,\s*\{[^}]*\}\s*\)/,
    )
    expect(blockMatch).not.toBeNull()
    const block = blockMatch![0]
    expect(block).toContain("recordJobRun")
  })

  it("predictionMarketPoll does not have a bare await without recordJobRun wrapper", () => {
    const blockMatch = jobsSource.match(
      /cron\.schedule\(CRONS\.predictionMarketPoll[\s\S]*?\}\s*,\s*\{[^}]*\}\s*\)/,
    )
    expect(blockMatch).not.toBeNull()
    const block = blockMatch![0]
    expect(block).toContain("recordJobRun")
  })

  it("predictionOutcome does not have a bare await without recordJobRun wrapper", () => {
    const blockMatch = jobsSource.match(
      /cron\.schedule\(CRONS\.predictionOutcome[\s\S]*?\}\s*,\s*\{[^}]*timezone[^}]*\}\s*\)/,
    )
    expect(blockMatch).not.toBeNull()
    const block = blockMatch![0]
    expect(block).toContain("recordJobRun")
  })
})
