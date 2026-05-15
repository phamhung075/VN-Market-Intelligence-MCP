# Architect — Notebook

**Last updated:** 2026-05-15 UTC | **Sprint:** 1899a-bloomberg-test-split

## This session

Designed the split of `apps/news-fetch/__tests__/1899a-bloomberg.test.ts` (491L) into 4 files ≤200L. Core finding: Bun mock isolation is per-module — `mock.module('playwright', ...)` + `await import()` cannot be shared; each file must carry its own preamble. The PerimeterX+lifecycle file is the tight one (~200L); fix is to flatten 3 sub-describes into a single flat describe (saves 12L). `normalizeDate` file needs no mock.module (pure function, ~60L).

## Patterns noticed

- Reuters fallback split (`1899a-reuters-fallback-{dom,lifecycle,detect}.test.ts`) is the confirmed working precedent for this exact pattern. Always cross-reference when splitting test files in `apps/news-fetch/__tests__/`.
- Preamble line-count bloat is the recurring risk in Bun test splits: 113L preamble means any group <90L of tests will land under 200L; groups of 90-100L need trimming.

## Carry-over (next session)

- 1899a-bloomberg-test-split: handoff at `docs/handoffs/TASK_1899a-bloomberg-test-split.md`. Ready for dev-news-fetch. Risk R-1 (Bun mock state leak across files in same process) — developer must verify `normalizeDate` file runs clean in isolation.
- janitor-1912: `docs/handoffs/TASK_janitor-1912.md` — RF-1 + RF-2 independent disk cleanup tasks. Ready for code-janitor.
- 1914 news-scout dedup: `docs/handoffs/TASK_1914.md` — Option A (extend `get_agent_signals` with `from_agent` param). Guard: when `fromAgent` set, read-mark side-effect must NOT fire.
- c40 container restart: inconclusive (pre-log). Re-evaluate if TNB flags again.
- SPIKE_006 c61: BA spec needed — scoring unification (alertAccuracy.ts + alertOutcomeScorer + verdictResolutionJob). Open Q: confirm 60% threshold denominator with user.
- Headlock F2b + F1 (Docker .git/ exclusion): user-queue carry item.
