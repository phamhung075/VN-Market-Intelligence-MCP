process.env["DB_PATH"] = ":memory:";

// src/__tests__/1140-trycatch-replacement-observability.test.ts
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

const JOBS_TS = join(import.meta.dir, '../../src/scheduler/jobs.ts')

describe('Task 1140 — try/catch replacement with recordJobRun', () => {
  const src = readFileSync(JOBS_TS, 'utf8')

  it('bctcOverdueCheckJob uses recordJobRun wrapper', () => {
    expect(src).toContain("recordJobRun(getDb(), 'bctcOverdueCheckJob'")
  })

  it('vpsProxyWatchdogJob uses recordJobRun wrapper', () => {
    expect(src).toContain("recordJobRun(getDb(), 'vpsProxyWatchdogJob'")
  })

  it('cronHealthAlertJob uses recordJobRun wrapper', () => {
    expect(src).toContain("recordJobRun(getDb(), 'cronHealthAlertJob'")
  })

  it('AC-4: no standalone try/catch remains for bctcOverdueCheck', () => {
    // Extract the bctcOverdueCheck cron block and assert no raw try{ found inside it
    const bctcStart = src.indexOf("CRONS.bctcOverdueCheck")
    const bctcEnd = src.indexOf("CRONS.vpsProxyWatchdog")
    expect(bctcStart).toBeGreaterThan(-1)
    expect(bctcEnd).toBeGreaterThan(bctcStart)
    const bctcBlock = src.slice(bctcStart, bctcEnd)
    // The block must not contain a bare try {
    expect(bctcBlock).not.toMatch(/\btry\s*\{/)
  })

  it('AC-4: no standalone try/catch remains for vpsProxyWatchdog', () => {
    const vpsStart = src.indexOf("CRONS.vpsProxyWatchdog")
    const vpsEnd = src.indexOf("CRONS.cronHealthAlert")
    expect(vpsStart).toBeGreaterThan(-1)
    expect(vpsEnd).toBeGreaterThan(vpsStart)
    const vpsBlock = src.slice(vpsStart, vpsEnd)
    expect(vpsBlock).not.toMatch(/\btry\s*\{/)
  })

  it('AC-4: no standalone try/catch remains for cronHealthAlert', () => {
    const cronStart = src.indexOf("CRONS.cronHealthAlert")
    const cronEnd = src.indexOf("CRONS.evidenceAccumulator")
    expect(cronStart).toBeGreaterThan(-1)
    expect(cronEnd).toBeGreaterThan(cronStart)
    const cronBlock = src.slice(cronStart, cronEnd)
    expect(cronBlock).not.toMatch(/\btry\s*\{/)
  })

  it('bctcOverdueCheckJob returns rowsWritten from alertsInserted', () => {
    const bctcStart = src.indexOf("CRONS.bctcOverdueCheck")
    const bctcEnd = src.indexOf("CRONS.vpsProxyWatchdog")
    const bctcBlock = src.slice(bctcStart, bctcEnd)
    expect(bctcBlock).toContain('alertsInserted')
    expect(bctcBlock).toContain('rowsWritten')
  })

  it('vpsProxyWatchdogJob does not pass rowsWritten (Pattern C)', () => {
    const vpsStart = src.indexOf("CRONS.vpsProxyWatchdog")
    const vpsEnd = src.indexOf("CRONS.cronHealthAlert")
    const vpsBlock = src.slice(vpsStart, vpsEnd)
    // Pattern C: no rowsWritten return — the callback returns void
    expect(vpsBlock).not.toContain('rowsWritten')
  })

  it('cronHealthAlertJob returns rowsWritten from alertsSent', () => {
    const cronStart = src.indexOf("CRONS.cronHealthAlert")
    const cronEnd = src.indexOf("CRONS.evidenceAccumulator")
    const cronBlock = src.slice(cronStart, cronEnd)
    expect(cronBlock).toContain('alertsSent')
    expect(cronBlock).toContain('rowsWritten')
  })
})
