/**
 * FIX-CRON-SSCCHECKERJOB-DEAD-87D — item 3: CLASS FIX.
 *
 * ROOT DEFECT (shared_failure_mode, per the task's own framing): a NAME-BINDING
 * gap, not a scheduling bug. A job records telemetry under one job_name while
 * the watchdog manifest and the dashboard resolver key off the CRONS config
 * key. Before this fix, THREE independently hand-maintained registries had to
 * agree with each other and were already observed to drift apart:
 *   1. CANONICAL_WATCHDOG_JOB_NAMES        (schedulerWatchdogJob.ts — literal array)
 *   2. WATCHDOG_MANIFEST keys              (schedulerWatchdogJob.ts — literal object)
 *   3. STATIC_JOB_NAME_MAP values          (cronStatusCompute.ts — literal object)
 * WD-10/WD-11 (ARCH-CRON-watchdog.test.ts) already lock #1 <-> #2 together, and
 * WD-11 already derives the ground truth from real wrapRun/recordJobRun call
 * sites in source (not hand-typed comments) for #2. BUT #3 (STATIC_JOB_NAME_MAP)
 * had NO automated check against the source-derived ground truth at all — the
 * only existing check (cronStatusCompute.test.ts "tier-1 map values are exactly
 * CANONICAL_WATCHDOG_JOB_NAMES") drove itself off `STATIC_25_PAIRS`, a FOURTH
 * hand-copied list inside the test file. A developer could add/typo a
 * STATIC_JOB_NAME_MAP entry, forget to mirror it into STATIC_25_PAIRS, and that
 * test would keep passing (it never reads the real map's own keys) — the exact
 * silent-drift mechanism that let sscCheckerJob's job_name diverge unnoticed.
 *
 * FIX: this test reads the REAL STATIC_JOB_NAME_MAP keys directly (via the new
 * `_staticJobNameMapKeysForTests()` accessor — no copied list, ever) and:
 *   (a) re-derives the source-of-truth job_name set from the SAME registration
 *       source files WD-11 scans (self-contained regex scan — duplicated on
 *       purpose rather than importing WD-11's test-local logic, keeping this
 *       file independently runnable/auditable, matching this codebase's
 *       existing self-contained-test-file convention);
 *   (b) asserts every STATIC_JOB_NAME_MAP value has a real call-site literal
 *       (fails LOUDLY, naming the offending key/value, if a future edit types a
 *       job_name that doesn't exist anywhere a job actually records under);
 *   (c) asserts STATIC_JOB_NAME_MAP's key-count and resolved-value-set are
 *       exactly CANONICAL_WATCHDOG_JOB_NAMES (driven by the real map, closing
 *       the WATCHDOG_MANIFEST <-> STATIC_JOB_NAME_MAP consistency gap
 *       end-to-end, not just WATCHDOG_MANIFEST <-> CANONICAL_WATCHDOG_JOB_NAMES).
 *
 * This does NOT attempt a blanket "every CRONS key must appear in
 * cron_job_runs" invariant — the codebase has ~24 legitimately untelemetered
 * bespoke jobs (FIX-CRON-WATCHDOG-COVERAGE-BESPOKE-TELEMETRY tracks that as a
 * separate, proportionate follow-up); a blind version of that check would be a
 * false-positive generator, not a fix. This test is scoped exactly to the
 * registries that are SUPPOSED to describe telemetry-instrumented jobs, and
 * makes them self-consistent and source-verified instead of hand-typed.
 */

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  resolveJobNameDb,
  _staticJobNameMapKeysForTests,
} from "../application/cron/cronStatusCompute.js";
import { CANONICAL_WATCHDOG_JOB_NAMES } from "../scheduler/system/schedulerWatchdogJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Source-derived job_name ground truth — same files/regexes as WD-11
// (ARCH-CRON-watchdog.test.ts), duplicated deliberately (self-contained file).
// ─────────────────────────────────────────────────────────────────────────────

function deriveRecordedJobNames(): { names: Set<string>; scanned: string[] } {
  const testsDir = resolve(import.meta.dir);

  const filesToScan: Array<{ label: string; path: string }> = [
    { label: "startScheduler.ts", path: resolve(testsDir, "../scheduler/startScheduler.ts") },
    { label: "schedulerJobTable.ts", path: resolve(testsDir, "../scheduler/schedulerJobTable.ts") },
    { label: "startupHelpers.ts", path: resolve(testsDir, "../scheduler/startupHelpers.ts") },
    { label: "summaryJobs.ts", path: resolve(testsDir, "../scheduler/summaryJobs.ts") },
    { label: "foreignFlowAlertJob.ts", path: resolve(testsDir, "../scheduler/market-data/foreignFlowAlertJob.ts") },
    { label: "insiderCheckJob.ts", path: resolve(testsDir, "../scheduler/market-data/insiderCheckJob.ts") },
    { label: "calibrationReportJob.ts", path: resolve(testsDir, "../scheduler/macro/calibrationReportJob.ts") },
    { label: "vnstockFundamentalsJob.ts", path: resolve(testsDir, "../scheduler/financial-reports/vnstockFundamentalsJob.ts") },
    { label: "sscCheckerJob.ts", path: resolve(testsDir, "../scheduler/news-analysis/sscCheckerJob.ts") },
  ];

  const WRAP_RUN_RE = /wrapRun\(\s*['"]([^'"]+)['"]/g;
  const RECORD_JOB_RUN_LITERAL_RE = /recordJobRun\([^,]+,\s*['"]([^'"]+)['"]/g;
  const JOB_NAME_CONST_RE = /\bJOB_NAME_FUNDAMENTALS\s*=\s*['"]([^'"]+)['"]/;
  const SUMMARY_TEMPLATE_RE = /recordJobRun\([^,]+,\s*`summaryJob:\$\{[^}]+\}`/;
  const JOB_TABLE_NAME_RE = /\bname:\s*['"]([^'"]+)['"]/g;

  const names = new Set<string>();
  const scanned: string[] = [];

  for (const { label, path } of filesToScan) {
    let src: string;
    try {
      src = readFileSync(path, "utf-8");
    } catch (err) {
      throw new Error(
        `FIX-CRON-SSCCHECKERJOB-DEAD-87D classfix: cannot read '${label}' at '${path}': ${String(err)}`,
      );
    }
    scanned.push(label);

    let m: RegExpExecArray | null;
    WRAP_RUN_RE.lastIndex = 0;
    while ((m = WRAP_RUN_RE.exec(src)) !== null) names.add(m[1]!);

    RECORD_JOB_RUN_LITERAL_RE.lastIndex = 0;
    while ((m = RECORD_JOB_RUN_LITERAL_RE.exec(src)) !== null) names.add(m[1]!);

    if (label === "schedulerJobTable.ts") {
      JOB_TABLE_NAME_RE.lastIndex = 0;
      while ((m = JOB_TABLE_NAME_RE.exec(src)) !== null) names.add(m[1]!);
    }

    if (label === "vnstockFundamentalsJob.ts") {
      const constMatch = JOB_NAME_CONST_RE.exec(src);
      if (constMatch) names.add(constMatch[1]!);
    }

    if (label === "summaryJobs.ts" && SUMMARY_TEMPLATE_RE.test(src)) {
      names.add("summaryJob:daily");
    }
  }

  return { names, scanned };
}

describe("FIX-CRON-SSCCHECKERJOB-DEAD-87D item 3 — class fix: STATIC_JOB_NAME_MAP registry invariant", () => {
  it("every REAL STATIC_JOB_NAME_MAP value has a matching wrapRun/recordJobRun call-site literal in source", () => {
    const { names: derivedNames, scanned } = deriveRecordedJobNames();
    const staticKeys = _staticJobNameMapKeysForTests();

    const missing = staticKeys
      .map((cronsKey) => ({ cronsKey, jobName: resolveJobNameDb(cronsKey, []) }))
      .filter(({ jobName }) => !derivedNames.has(jobName));

    expect(
      missing,
      `STATIC_JOB_NAME_MAP entries with no matching call-site literal in source ` +
        `(cronStatusCompute.ts would resolve these CRONS keys to a job_name that ` +
        `NOTHING actually records — a dashboard/watchdog false-negative waiting to ` +
        `happen): ${JSON.stringify(missing)}. Scanned: ${scanned.join(", ")}. ` +
        `Fix: correct the STATIC_JOB_NAME_MAP value to match the real recordJobRun/ ` +
        `wrapRun literal, or fix the call site if it was the one that drifted.`,
    ).toEqual([]);
  });

  it("STATIC_JOB_NAME_MAP has exactly as many real keys as CANONICAL_WATCHDOG_JOB_NAMES has entries (no undocumented drift in count)", () => {
    expect(_staticJobNameMapKeysForTests().length).toBe(CANONICAL_WATCHDOG_JOB_NAMES.length);
  });

  it("every REAL STATIC_JOB_NAME_MAP key resolves to a value present in CANONICAL_WATCHDOG_JOB_NAMES", () => {
    const canonicalSet = new Set(CANONICAL_WATCHDOG_JOB_NAMES);
    const staticKeys = _staticJobNameMapKeysForTests();

    const drifted = staticKeys
      .map((cronsKey) => ({ cronsKey, jobName: resolveJobNameDb(cronsKey, []) }))
      .filter(({ jobName }) => !canonicalSet.has(jobName));

    expect(
      drifted,
      `STATIC_JOB_NAME_MAP entries whose resolved job_name is NOT in ` +
        `CANONICAL_WATCHDOG_JOB_NAMES (so WATCHDOG_MANIFEST has no cadence/threshold ` +
        `entry for it — the watchdog can never alert on this job going stale): ` +
        `${JSON.stringify(drifted)}`,
    ).toEqual([]);
  });

  it("every CANONICAL_WATCHDOG_JOB_NAMES entry is reachable from some REAL STATIC_JOB_NAME_MAP key (no orphan canonical name)", () => {
    const staticKeys = _staticJobNameMapKeysForTests();
    const reachable = new Set(staticKeys.map((cronsKey) => resolveJobNameDb(cronsKey, [])));

    const orphans = CANONICAL_WATCHDOG_JOB_NAMES.filter((n) => !reachable.has(n));

    expect(
      orphans,
      `CANONICAL_WATCHDOG_JOB_NAMES entries with no STATIC_JOB_NAME_MAP key that ` +
        `resolves to them (the dashboard's CN-1 tier-1 resolver would fall through to ` +
        `a weaker tier for this job even though it IS in WATCHDOG_MANIFEST): ${JSON.stringify(orphans)}`,
    ).toEqual([]);
  });
});
