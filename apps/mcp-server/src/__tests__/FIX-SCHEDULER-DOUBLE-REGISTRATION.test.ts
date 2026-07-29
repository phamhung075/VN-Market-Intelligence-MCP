/**
 * FIX-SCHEDULER-DOUBLE-REGISTRATION (2026-07-29)
 *
 * RAW-verified LIVE against cron_job_runs (named-volume market.db, docker exec
 * bun:sqlite — NOT a host-CLI/cached read) BEFORE writing any code:
 *   - vnIndexRefreshJob: registered exactly ONCE in buildJobTable() (single
 *     entry, single registerJobTable() call site inside startScheduler(),
 *     which is itself guarded against re-entrant init via the
 *     __vnMarketSchedulerStarted globalThis flag). Yet cron_job_runs showed
 *     genuine same-second duplicate SUCCESS rows on ~13% of market-hour ticks
 *     over 7 days (e.g. 2026-07-28 07:35:00 + 07:35:01, both real
 *     runVnIndexRefreshJob() executions, both status=success).
 *   - vpsServiceHealthJob (10.33%) and walCheckpointJob (3.74%) — two OTHER
 *     table-driven/bespoke jobs that never appeared in the original bug
 *     report — showed the identical same-second duplicate pattern over the
 *     same 7-day window, proving this is a SHARED scheduler-layer defect,
 *     not something specific to the two originally-named jobs.
 *   - pollNewsJob (the report's other named job) is NOT a registered cron job
 *     at all — its cron_job_runs rows are written once per /api/push-news
 *     HTTP call (pushNewsHandler.ts), and newsHeadlinesRefreshJob (the real,
 *     singly-registered, singly-firing 30-min cron — confirmed 145 runs /
 *     ~144 expected ticks over 3 days, only 1 dup-minute) legitimately POSTs
 *     to that endpoint TWICE per cycle (Bloomberg, then Reuters — see
 *     newsHeadlinesRefreshJob.ts). pollNews()'s own URL+title dedup makes
 *     this safe (distinct source content, no duplicate writes). Deduping
 *     pollNewsJob would DROP one of the two legitimate news batches — out of
 *     scope for this fix, NOT touched.
 *
 * Precise root cause (traced through node_modules/node-cron@3.0.3's
 * scheduler.js Scheduler.matchTime()): `recoverMissedExecutions: true`
 * (Lever B, T2-ARCH-CRON-RECOVER-JITTER, already shipped/DONE_VERIFIED as
 * ARCH-CRON-SCHEDULER-RELIABILITY — a *missed*-fire fix) makes the
 * `i === 0 || this.autorecover` gate always true, so under completely
 * ordinary ~1s setTimeout-loop jitter (the interval frequently measures
 * slightly over 1000ms — no stall required), the scheduler re-examines the
 * PRECEDING second on the very next poll. Its "already executed" guard
 * (`lastExecution.getTime() < date_tmp.getTime()`) compares FULL
 * millisecond precision rather than whole-second granularity, so two polls
 * that straddle the same scheduled boundary with slightly different
 * sub-second offsets both pass the guard — the identical logical tick gets
 * emitted (and therefore executed) twice. Confirmed IN-PROCESS: one
 * Scheduler instance per job, one Bun process, no dispatcher/VPS/cowork
 * involvement — NOT the cowork-team-20260615T1620Z dispatcher-overlap class.
 *
 * Fix: `dedupeCronTick()` wraps every scheduleCron() callback (the single
 * canonical registration point — registerJobTable's 57 table-driven jobs,
 * registerBespokeJobs' 22 bespoke jobs, and summaryJobs.ts's 5 jobs all funnel
 * through it; grep confirms zero direct cron.schedule() call sites bypass
 * it) with a per-registration whole-second last-fired guard. A second
 * detection of the SAME scheduled second is skipped (logged, not executed,
 * not double-recorded); a genuinely new second still fires normally.
 * recoverMissedExecutions stays enabled — the missed-fire class this guard's
 * sibling fix (ARCH-CRON-SCHEDULER-RELIABILITY) addressed is NOT reverted.
 */

// Isolation guard: 034-telegram-notifier.test.ts / 1298b-imf-infra.test.ts /
// 084-tool-market.test.ts / FIX-BASE-RATE-COMPUTATION-CRON-DEAD.test.ts document
// the same class of defect — Bun's `mock.module()` is PROCESS-GLOBAL and persists
// across test FILES (not just within the file that called it). FACTORY-SCHEDULER-
// job-table-registry.test.ts calls `mock.module("../scheduler/startupHelpers.js",
// ...)` (stubbing scheduleCron -> a fake returning `{ stop: () => {} }`, no `.now()`)
// inside its Group B/C/D tests and never restores it. RAW-confirmed: a plain
// `import { scheduleCron } from "../scheduler/startupHelpers.js"` silently resolves
// to that stub whenever this file runs in the same `bun test` process AFTER
// FACTORY-SCHEDULER's tests fire — same established workaround as the precedent
// files: bypass the mock cache with a `?isolate=` query-busted dynamic import of
// the REAL module, resolved once at module load.
const _real = await import(
  Bun.resolveSync("../scheduler/startupHelpers.js", import.meta.dir) +
    "?isolate=FIX-SCHEDULER-DOUBLE-REGISTRATION"
);
const dedupeCronTick: typeof import("../scheduler/startupHelpers.js").dedupeCronTick =
  _real.dedupeCronTick;
const scheduleCron: typeof import("../scheduler/startupHelpers.js").scheduleCron =
  _real.scheduleCron;

import { describe, it, expect } from "bun:test";

describe("FIX-SCHEDULER-DOUBLE-REGISTRATION — dedupeCronTick", () => {
  it("DEDUP-1: two calls with Date args in the SAME whole second invoke the wrapped func only once", () => {
    let calls = 0;
    const wrapped = dedupeCronTick(() => { calls++; });

    wrapped(new Date("2026-07-28T07:35:00.050Z"));
    wrapped(new Date("2026-07-28T07:35:00.997Z")); // same whole second, different ms

    expect(calls).toBe(1);
  });

  it("DEDUP-2: reproduces the exact observed node-cron precision bug — sub-second offsets differ, whole second is identical", () => {
    // Mirrors the live-observed pair: 07:35:00 + 07:35:01 wall-clock timestamps
    // recorded 1s apart in cron_job_runs, both resolving to the SAME scheduled
    // second (07:35:00) once node-cron's TimeMatcher normalizes them.
    let calls = 0;
    const wrapped = dedupeCronTick((now) => { calls++; });

    wrapped(new Date("2026-07-28T07:35:00.000Z"));
    wrapped(new Date("2026-07-28T07:35:00.911Z"));

    expect(calls).toBe(1);
  });

  it("DEDUP-3: two calls in DIFFERENT whole seconds both invoke the wrapped func (no over-suppression)", () => {
    let calls = 0;
    const seen: string[] = [];
    const wrapped = dedupeCronTick((now) => {
      calls++;
      if (now instanceof Date) seen.push(now.toISOString());
    });

    wrapped(new Date("2026-07-28T07:35:00.000Z"));
    wrapped(new Date("2026-07-28T07:40:00.000Z")); // next scheduled tick, 5 min later

    expect(calls).toBe(2);
    expect(seen).toEqual([
      "2026-07-28T07:35:00.000Z",
      "2026-07-28T07:40:00.000Z",
    ]);
  });

  it("DEDUP-4: a THIRD call for a later second still fires after a same-second duplicate was skipped", () => {
    let calls = 0;
    const wrapped = dedupeCronTick(() => { calls++; });

    wrapped(new Date("2026-07-28T07:35:00.050Z")); // fires (1)
    wrapped(new Date("2026-07-28T07:35:00.900Z")); // duplicate — skipped
    wrapped(new Date("2026-07-28T07:35:01.000Z")); // genuinely next second — fires (2)

    expect(calls).toBe(2);
  });

  it("DEDUP-5: 'manual' and 'init' string args are NEVER deduped (always pass through)", () => {
    let calls = 0;
    const wrapped = dedupeCronTick(() => { calls++; });

    wrapped("manual");
    wrapped("manual");
    wrapped("init");

    expect(calls).toBe(3);
  });

  it("DEDUP-6: each dedupeCronTick() call returns an INDEPENDENT guard — no cross-job state leakage", () => {
    let callsA = 0;
    let callsB = 0;
    const wrappedA = dedupeCronTick(() => { callsA++; });
    const wrappedB = dedupeCronTick(() => { callsB++; });

    // Same instant, two DIFFERENT job registrations — both must fire once each.
    wrappedA(new Date("2026-07-28T07:35:00.000Z"));
    wrappedB(new Date("2026-07-28T07:35:00.000Z"));

    expect(callsA).toBe(1);
    expect(callsB).toBe(1);
  });
});

describe("FIX-SCHEDULER-DOUBLE-REGISTRATION — scheduleCron integration (dedup wired in)", () => {
  it("INT-1: scheduleCron still returns a valid ScheduledTask (LB-1..LB-5 regression safety)", () => {
    const task = scheduleCron("* * * * *", () => {});
    expect(task).toBeDefined();
    expect(typeof task.stop).toBe("function");
    task.stop();
  });

  it("INT-2: scheduleCron's registered callback dedupes same-second re-entrant invocation via task.now()", () => {
    let calls = 0;
    const task = scheduleCron("* * * * *", () => { calls++; });
    try {
      // ScheduledTask.now(date) is node-cron's public manual-trigger entry
      // point — the same synchronous path Scheduler.matchTime() uses to emit
      // 'scheduled-time-matched'. Exercises the REAL wiring (dedupeCronTick
      // wraps `func` before it reaches cron.schedule), not just the unit.
      task.now(new Date("2026-07-28T07:35:00.050Z"));
      task.now(new Date("2026-07-28T07:35:00.900Z"));
      expect(calls).toBe(1);
    } finally {
      task.stop();
    }
  });
});
