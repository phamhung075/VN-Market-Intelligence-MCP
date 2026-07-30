# Decision Journal — Sprint FIX-AUDITOR-T1-PREGATE-MEMCREEP-SINGLE-POINT-SAMPLE · developer

**Sprint goal:** `_check_mem_creep()` in `scripts/agents-flow/auditor-tier1-probe.sh` took exactly ONE `docker stats` sample per container per invocation and gated ALL_GREEN/FAILURE off it — a live re-run ~5.5min after a cited ALL_GREEN flipped FAILURE (pdf-extractor 99.91% MemPerc), a transient peak a single sample missed.
**Agent:** developer
**Started:** 2026-07-30T07:54Z

---

### STEP developer-S1 · developer · 2026-07-30T07:56Z
**task-id:** FIX-AUDITOR-T1-PREGATE-MEMCREEP-SINGLE-POINT-SAMPLE
**what-done:** Zone check: `scripts/agents-flow/` is a root-level script path → Tier 2 of zone-detect routes to generic `developer` (no dev-* specialist zone). SPRINT_ID resolution note: `sprint_goal.entries[]` has MANY concurrently `active` entries (governance debt, unrelated to this task) — mechanical `tail -1` resolves to `COWORK-GUARANTEED-SLOT-CATCHUP`, wrong journal target. Followed the settled precedent for this exact task family (sprint-FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE-developer.md, sprint-FIX-AUDITOR-TIER1-PROBE-ACKED-LAUNCHD-DEATH-SUPPRESSION-developer.md — both standalone auditor-probe BOUNDED-1 fixes use TASK_ID as SPRINT_ID) instead of the unrelated active sprint.
**what-considered:**
- Take N>=2 samples and gate off the WORST (max) sample within one invocation — chosen.
- "Retry once only if first sample is GREEN" (optimization variant AC also allows) — rejected: asymmetric, doesn't catch a FAIL-then-GREEN ordering as robustly, more branching for equivalent benefit.
- A cross-invocation cron-level re-check (compare this tick vs previous tick) — rejected: out of scope, run_probe()'s existing heartbeat/freshness gate already covers cross-invocation staleness; this task is single-invocation sampling only per the fix_spec.
**why-decision:** N-sample-worst-of-window directly reproduces + fixes the cited incident (a transient peak within a short window), is trivially testable without real sleep (file-based call-count test seam), and needed zero change to run_probe()'s call site or output contract (same stdout message / rc=0|1 interface).
**why-change:** no change from plan (fix_spec matched AC1 exactly).

### STEP developer-S2 · developer · 2026-07-30T07:58Z
**task-id:** FIX-AUDITOR-T1-PREGATE-MEMCREEP-SINGLE-POINT-SAMPLE
**what-done:** Implemented `MEM_CREEP_SAMPLES` (>=2, default 2, clamped) / `MEM_CREEP_SAMPLE_INTERVAL_SEC` (default 2s) test-seam knobs; `_check_mem_creep()`'s per-container `docker stats` call is now a loop of N samples, tracking the WORST (max) parsed pct — any single-sample stats-unavailable/unparseable still breaches (unchanged fail-loud). Zero changes to `run_probe()` call site, ack-ledger arm, or output schema.
**what-considered:**
- only path: fix_spec fully specified inline on the task; no design ambiguity on the mechanism itself.
**why-decision:** minimum change satisfying AC1 without touching the two explicitly-out-of-scope neighboring mechanisms (A30-MEM-SINGLE-CONTAINER-SCOPE loop scope; A30-VMHWM-VETO-TAUTOLOGY mcp-server veto).
**why-change:** no change from plan.

### STEP developer-S3 · developer · 2026-07-30T08:00Z
**task-id:** FIX-AUDITOR-T1-PREGATE-MEMCREEP-SINGLE-POINT-SAMPLE
**what-done:** Regression suite T54-T58 added to `auditor-tier1-probe.test.sh`. T54 reproduces the exact live incident (sample1=70.00% GREEN, sample2=99.91% FAIL → verdict FAILURE, worst-pct named). T55 proves worst-of-window (not last-sample) via reversed order. T56/T57/T58 prove the loop actually calls `docker stats` N times (file-based call-count assertion) and the N>=2 floor is enforced. Discovered + fixed a real subshell bug: an in-memory associative-array call-counter is silently discarded across `$(...)` forks — switched the stub's counter to a tmp-file (persists across forks). Full suite: 181/181 pass (167 pre-existing byte-identical + 14 new checks), ~12s runtime (interval knob exported =0 for the whole suite so the new sleep never slows any of the 58 cases).
**what-considered:**
- only path once the subshell bug was found — file-based counter is the standard shell-test workaround for this class of problem.
**why-decision:** file-based counter is the only mechanism that survives `docker stats` being invoked via command substitution inside the script under test.
**why-change:** discovered the associative-array approach doesn't work mid-implementation (caught by re-running the suite before trusting it) — switched to file-based before writing any final assertions.
