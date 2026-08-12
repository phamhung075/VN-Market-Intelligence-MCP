# Decision Journal — Sprint TICK-PREFLIGHT-USAGE-INSTRUMENTATION · architect

**Sprint goal:** Replace the engineering ESTIMATE of silent-tick cost with a MEASURED number — per-invocation, append-only, local-file-only usage telemetry at each cron preflight script's verdict choke point.
**Agent:** architect
**Started:** 2026-08-12T13:31:22Z

---

### STEP architect-S1 · architect · 2026-08-12T13:31:22Z
**task-id:** BA-TICK-PREFLIGHT-USAGE-INSTRUMENTATION
**what-done:** Read BA spec + BA/PO decision journals + all 3 target scripts end-to-end at source (cowork-tick-preflight.sh, dev-team-tick-preflight.sh, auditor-tier1-probe.sh) + the 2 shared-lib extraction precedents (hook-guard.sh, notebook-section-direction.sh) + both test suites' isolation mechanics + .gitignore + the token-ratio brief. Ratified Q1-Q6 + wrote the WU-0..WU-3 blueprint, appended as `[Architect]` section to `docs/handoffs/TICK-PREFLIGHT-USAGE-INSTRUMENTATION-BA-spec.md`.
**what-considered:**
- Q3/Q4: BA's framed options (verdict->exit_code lookup table, or touch every `return N` site; naive per-call-site hook for WU-3) vs a 3rd option neither named: relocate the log call from inside `_emit_verdict()` to the script's own pre-existing "Standalone execution" trailer (`if [[ BASH_SOURCE[0] == $0 ]]; then run_preflight; exit $?; fi`) — already the ONE place every verdict path converges before this task existed, for all 3 scripts including auditor's dual-mode dispatcher.
- Verified (grep + read, not assumed) that run_preflight()/run_probe()/run_tiered_probe() print NOTHING to real stdout except their own single final verdict `jq -n` line in every code path — confirmed via the FIX-DEVTEAM-PREFLIGHT-STEP55-COLDEVICT-STDOUT-LEAK-CORRUPTS-VERDICT precedent (an actual prior incident of exactly this leak class, already fixed by redirecting the leaking call) — so capture-via-`$(...)`-then-reprint at the trailer is safe and byte-identical.
- Q5: EPOCHREALTIME-only (bash5+, breaks this repo's own documented bash-3.2-compat constraint for shared libs) vs second-precision-only (loses signal) vs graceful-degrade (checked live: this exact machine's `/bin/bash` and `bash` both report 3.2.57 — EPOCHREALTIME unset — so the degrade path is not hypothetical, it is this session's live reality).
- Q2: shared single file (PO's literal Q1 path) vs one-file-per-script — chose per-script to structurally remove the rotation-fairness race Q2 exists to ask about, at zero analysis-side cost (jq trivially merges N files later).
**why-decision:** The trailer-relocation choice resolves Q3 AND Q4 simultaneously with a smaller diff than either BA-named option (no lookup table, no per-`return`-site edits, zero touches inside `_emit_verdict()`/`run_probe()`/`run_tiered_probe()` — existing 20/37/32-ish regression suites, which source the script and call `run_preflight`/`run_probe` directly, are provably unaffected since they never reach the trailer). New logging-specific tests reuse the exact same source+call-a-function+stub-mcp_call seam via a new thin wrapper function (`tt_capture_and_log`), satisfying NFR-4 without inventing new isolation mechanics.
**why-change:** Diverges from BA's FR-2/FR-3 literal phrasing ("fires... at its `_emit_verdict()` choke point") — reinterpreted as "the true choke point is wherever all verdict paths structurally converge with a real `$?` available", which for these 3 scripts is the trailer, not `_emit_verdict()`. Q4/Q3 explicitly invited this architect judgment call ("Architect must pick one and own the tradeoff" / "not a mechanical wrapper like WU-1/WU-2 get").
