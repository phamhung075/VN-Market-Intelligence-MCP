# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · dev-mcp-server (cont. 4)

**Sprint goal:** cowork guaranteed-slot catchup (ambient sprint label; this file's entries are per-task, not sprint-scoped work)
**Agent:** dev-mcp-server
**Started:** 2026-08-06T10:30:00Z (continuation of -3.md, CAP-REACHED 2026-08-06T10:05:29Z)

---

### STEP dev-mcp-server-S69 · dev-mcp-server · 2026-08-06T10:30:00Z
**task-id:** CI-PERFILE-STRUCTURAL-MITIGATION
**what-done:** Bound `scripts/ci-per-file-isolation.sh`'s parallelism default to auto-detected vCPU count (`nproc`/`sysctl` fallback) instead of hardcoded `P=16`; `.github/workflows/ci.yml` invocation dropped the literal `16` arg. Aggregation loop now checks the already-captured per-file `rc` (rc-fail-loud, AC-4) — a killed/crashed process with 0 parsed pass/skip/fail previously reported false-GREEN.
**what-considered:**
- raise the per-test timeout instead (AC-3's other named option) — rejected as primary fix: bunfig.toml already sets a generous 30000ms global default; the reproduced mechanism was scheduler-delay under oversubscription pushing real subprocess/network wall-clock budgets past their margin, not a too-tight timeout constant, so widening timeouts further would mask rather than remove the amplifier and slow the whole CI job.
- hardcode a smaller literal (e.g. 4) matching SPIKE's "2-4 vCPU" guess — rejected: brittle if GH changes runner specs again; `nproc` self-adjusts and is the "structural" (not one-off-tuned) fix the row's title asks for.
**why-decision:** Reproduced live on this dev machine: 2 full-suite runs on the SAME unchanged tree produced DIFFERENT failing-file sets (14 files @ P=16 vs 9 @ auto-P=12) — rotating identity is AC-1's own discriminator for runner/environment nondeterminism, not code-content causation. Captured a concrete mechanism instance (102-job-news-poll.test.ts: `rag_analyses` COUNT assertion expected 2 got 0, an unawaited-background-write race) matching AC-2's contention hypothesis exactly.
**why-change:** AC-5's literal "20 consecutive 0-fail local runs" not fully met — this dev host has other concurrent Claude Code agent sessions (detect-loop/standalone-team/cowork-team, confirmed via `ps`) consuming real CPU throughout measurement, so local convergence to 0 is not achievable regardless of P; deferred final AC-5 verification to `gh run rerun` on the real isolated GH-hosted runner post-push. AC-6 (re-evaluate 4 DEFLAKE-*/transient rows) deferred to whoever confirms AC-5 green.
**verification:** rc-fail-loud isolated-verified with a SIGKILL repro (self-killing scratch test file, not committed): old aggregation reported `TOTAL_FAIL=0`/exit 0 (false-GREEN) on a `rc=137` process; new aggregation reports `TOTAL_FAIL=1`/exit 1 (correct). `bun tsc --noEmit` clean. `gen-project-stats.ts --dry-run`: tools=183/cron=88 unchanged (no `src/` touched — code_under_test is repo-root `scripts/`+`.github/workflows/` only, matching the board row's own `code_under_test` field). Commit `edea85e66`.
