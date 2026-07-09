Bun.env["DB_PATH"] = ":memory:";

// src/__tests__/1140-trycatch-replacement-observability.test.ts
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

// FACTORY-SCHEDULER-job-table-registry: bctcOverdueCheckJob / vpsProxyWatchdogJob /
// cronHealthAlertJob's cron registrations moved from an inline
// scheduleCron(CRONS.x, async () => { jobRunRepo.wrapRun('xJob', ...) }, opts) block in
// startScheduler.ts into a declarative { name, cron, options, runner } entry in
// schedulerJobTable.ts's buildJobTable(). registerJobTable() wraps EVERY entry in
// jobRunRepo.wrapRun(j.name, j.runner) generically.
const JOBS_TS = join(import.meta.dir, '../../src/scheduler/schedulerJobTable.ts')

/** Extracts a single buildJobTable() entry's source text by its `name: 'jobName'` marker,
 *  walking backward to the entry's opening `{` and forward (brace-depth-aware) to its
 *  matching closing `}` — robust to nested objects/functions inside the runner body. */
function extractJobTableEntry(source: string, jobName: string): string {
  const idx = source.indexOf(`name: '${jobName}'`)
  if (idx === -1) return ''
  const start = source.lastIndexOf('{', idx)
  if (start === -1) return ''
  let depth = 0
  let end = start
  for (let i = start; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) { end = i + 1; break }
    }
  }
  return source.slice(start, end)
}

describe('Task 1140 — try/catch replacement with observability wrapper (Phase 2)', () => {
  const src = readFileSync(JOBS_TS, 'utf8')
  // Task 1839a Phase 2: recordJobRun(getDb(), ...) replaced by jobRunRepo.wrapRun(...)

  it('bctcOverdueCheckJob JOB_TABLE entry wired to CRONS.bctcOverdueCheck', () => {
    const entry = extractJobTableEntry(src, 'bctcOverdueCheckJob')
    expect(entry).not.toBe('')
    expect(entry).toContain('cron: CRONS.bctcOverdueCheck')
  })

  it('vpsProxyWatchdogJob JOB_TABLE entry wired to CRONS.vpsProxyWatchdog', () => {
    const entry = extractJobTableEntry(src, 'vpsProxyWatchdogJob')
    expect(entry).not.toBe('')
    expect(entry).toContain('cron: CRONS.vpsProxyWatchdog')
  })

  it('cronHealthAlertJob JOB_TABLE entry wired to CRONS.cronHealthAlert', () => {
    const entry = extractJobTableEntry(src, 'cronHealthAlertJob')
    expect(entry).not.toBe('')
    expect(entry).toContain('cron: CRONS.cronHealthAlert')
  })

  it('AC-4: no standalone try/catch remains inside bctcOverdueCheckJob runner', () => {
    const entry = extractJobTableEntry(src, 'bctcOverdueCheckJob')
    expect(entry).not.toBe('')
    expect(entry).not.toMatch(/\btry\s*\{/)
  })

  it('AC-4: no standalone try/catch remains inside vpsProxyWatchdogJob runner', () => {
    const entry = extractJobTableEntry(src, 'vpsProxyWatchdogJob')
    expect(entry).not.toBe('')
    expect(entry).not.toMatch(/\btry\s*\{/)
  })

  it('AC-4: no standalone try/catch remains inside cronHealthAlertJob runner', () => {
    const entry = extractJobTableEntry(src, 'cronHealthAlertJob')
    expect(entry).not.toBe('')
    expect(entry).not.toMatch(/\btry\s*\{/)
  })

  it('bctcOverdueCheckJob returns rowsWritten from alertsInserted', () => {
    const entry = extractJobTableEntry(src, 'bctcOverdueCheckJob')
    expect(entry).toContain('alertsInserted')
    expect(entry).toContain('rowsWritten')
  })

  it('vpsProxyWatchdogJob does not pass rowsWritten (Pattern C)', () => {
    const entry = extractJobTableEntry(src, 'vpsProxyWatchdogJob')
    // Pattern C: no rowsWritten return — the callback returns void
    expect(entry).not.toContain('rowsWritten')
  })

  it('cronHealthAlertJob returns rowsWritten from alertsSent', () => {
    const entry = extractJobTableEntry(src, 'cronHealthAlertJob')
    expect(entry).toContain('alertsSent')
    expect(entry).toContain('rowsWritten')
  })
})
