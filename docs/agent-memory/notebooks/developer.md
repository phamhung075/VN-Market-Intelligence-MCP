# Developer — Notebook

**Last updated:** 2026-07-30 | **Cycle:** FIX-AUDITOR-A12-PROBE-TIMEOUT-EXITCODE-DEBOUNCE

## Session 2026-07-30 — FIX-AUDITOR-A12-PROBE-TIMEOUT-EXITCODE-DEBOUNCE — REVIEW

**Task:** dev-team BOUNDED-1 auto-pickup (`cross-service/`). system-auditor A-12 health probe collapsed every curl failure mode (timeout/refused/DNS) to one `CURL_ERR` token and glossed it as "unreachable"; deferred N-consecutive debounce from DONE `FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE` scope item 2.

**Actions taken:** A1 `probe.sh:48` `--max-time` 3s→5s (floor only, repoint half stays soft-blocked on `FIX-APIGW-HEALTH-CAPABILITY-PROBE-GATE-PARALLEL-SINGLEFLIGHT`, still BACKLOG). A2 new `_classify_curl_exit()` (28/7/6/52→named reasons, else `CURL_ERR_n`), applied only to the transport-failure branch (real non-200 HTTP unchanged). Wrapped `probe.sh`'s body in a standalone-execution guard (mirrors `emit-audit-signal.sh`) so the classifier is unit-testable via `source` — new `probe.test.sh`. A3 N=3-consecutive transport-error debounce wired in `tier1-probe.md` + new extracted `tier1-overrides.md` child (persisted counter, `docs/data/auditor-a12-transport-debounce.json`, tmp+mv, self-heals empty, NOT pre-seeded) — kept OUT of `probe.sh` itself (stateless, no wall-time growth; the emit-decision this gates has never lived in `probe.sh` for any check). A4 fixed the "unreachable" gloss at its real template source (`tier1-probe.md`'s Health-Endpoints + Emit-per-failure sections) — `emit-audit-signal.sh` needed zero change (pure passthrough, verified). A5 CONFIRMED STALE: no live A-04/A-13 check-id exists anywhere; archived 2026-05-19 brief shows they were an OLD numbering scheme since renumbered to today's A-12 — implemented nothing for them.

**Verify-live catch:** genuine RED confirmed by sourcing the PRE-fix `probe.sh` against the new test — the old script's own unconditional `exit 0` aborted the whole test process before any assertion ran (no guard existed then). Live sanity runs on this session's real host caught TWO different real transient conditions on mcp-server (`CONN_REFUSED` then `CURL_ERR_56` seconds apart, mid-restart) — correctly classified as distinct reasons instead of one bare `CURL_ERR`, real-world corroboration beyond the synthetic test cases.

**Verification:** `probe.test.sh` 7/7 PASS. Debounce bash+jq snippet hand-verified in a scratch dir (bump×3→3, reset→0, per-service isolation, self-heal on missing/malformed file). No `apps/` source touched — `bun test`/`tsc` structurally N/A.

**Board:** `task_board.in_progress[FIX-AUDITOR-A12-PROBE-TIMEOUT-EXITCODE-DEBOUNCE]` → `review` (`next_agent: qa`), `.head` reset to idle, same `orch-apply.sh` write.

**Simplicity gate:** PASS — every new primitive reuses an existing in-repo convention (A-20's 3-sample count, the ledger's tmp+mv self-heal, the file's own documented extraction fallback) rather than inventing new ones.

**Zone note:** No MCP/gateway tool available this session (Read/Edit/Write/Bash only, confirmed at Step 0) — task lock is held by the coordinating dev-team session; could not `task_heartbeat`/`task_release` or send Telegram (structural gap, flagged for the coordinating session).

Zone health: live observation — mcp-server was mid-restart-cycling on this host during this session's live sanity run (unrelated to this task, out of scope to fix here) — flagged in RETURN for the coordinating session, not filed as a new row by me.

## Session 2026-07-30 — FIX-AUDITOR-T1-PREGATE-MEMCREEP-SINGLE-POINT-SAMPLE — REVIEW

**Task:** dev-team BOUNDED-1 auto-pickup (`cross-service/`, `scripts/agents-flow/` zone → developer). `_check_mem_creep()` in `auditor-tier1-probe.sh` took exactly ONE `docker stats` sample per container per invocation and gated ALL_GREEN/FAILURE off it — live-verified: a re-run ~5.5min after a cited ALL_GREEN flipped FAILURE (pdf-extractor 99.91% MemPerc), a transient peak the single sample missed.

**Actions taken:** New `MEM_CREEP_SAMPLES` (>=2, default 2, clamped) / `MEM_CREEP_SAMPLE_INTERVAL_SEC` (default 2s) top-of-script knobs (test seams). Per-container check now loops N `docker stats` samples and gates off the WORST (max) parsed pct — a breach in ANY sample forces FAILURE even if another same-window sample reads GREEN; any single sample's stats-unavailable/unparseable still breaches (unchanged fail-loud). Zero change to `run_probe()` call site, ack-ledger arm, or `{verdict,detail,last_healthy_at}` output schema.

**Verify-live catch (x2):** (1) a notebook-write byte-cap surprise — this section's own first landing pushed `developer.md` over the 60-bytes/line-derived BYTE_CAP even though LINE_CAP was fine; the `notebook-auto-prune.sh` PostToolUse hook fired and, because every heading here is date-only (`Session 2026-07-30`, no time-of-day) and its tie-break sorts stably on ORIGINAL physical order, silently dropped the physically-FIRST section (this one, freshly inserted at the NEWEST-FIRST top) instead of the true-oldest bottom section — caught by re-reading the file post-write rather than trusting the Edit result, recomposed manually below the byte budget instead of relying on the hook. (2) test-stub in-memory call-counter silently broken by `docker stats`'s `$(...)` subshell fork — see Actions.

**Verification:** new regression T54-T58 in `auditor-tier1-probe.test.sh` — T54 reproduces the exact live incident (sample1=70.00% GREEN, sample2=99.91% FAIL → verdict FAILURE, names the WORST pct not the first); T55 proves worst-of-window not last-sample (reversed order, still FAILURE); T56/T57/T58 prove the loop actually samples N times (file-based call-count assertion, tmp-file not array — survives the subshell) and the N>=2 floor is enforced against an invalid override. Full suite 181/181 PASS (167 pre-existing byte-identical + 14 new checks), ~12s (interval knob exported =0 suite-wide). `shellcheck` clean (2 pre-existing unrelated warnings only).

**Board:** `task_board.in_progress[FIX-AUDITOR-T1-PREGATE-MEMCREEP-SINGLE-POINT-SAMPLE]` → `review` (`next_agent: qa`), `.head` reset to idle, same `orch-apply.sh` write.

**Simplicity gate:** PASS — 2 small env-var knobs + a loop around the existing single-sample read; worst-of-N reuses the SAME awk comparison idiom the script already used for the threshold check.

**Zone note:** No MCP/gateway tool available this session (Read/Edit/Write/Bash only, confirmed at Step 0) — flipped the board row directly via `scripts/orch-apply.sh` (permitted, pure bash); could not release `task:FIX-AUDITOR-T1-PREGATE-MEMCREEP-SINGLE-POINT-SAMPLE` or send Telegram (structural gap, flagged for the coordinating dev-team session).

Zone health: notebook-auto-prune.sh's date-only-heading tie-break misfire (above) is a real latent bug but OUT OF SCOPE for this task (scope = `auditor-tier1-probe.sh` only) — not filed as a new row here, flagged in RETURN for the coordinating session to triage. Distinct from `FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE` (loop scope) and `FIX-AUDITOR-A30-VMHWM-VETO-TAUTOLOGY-FALSE-NEGATIVE` (mcp-server veto) — neither touched; `docs/agents/system-auditor/probe.sh` (separate LLM-subagent evidence collector) also confirmed out of scope, untouched.

## Session 2026-07-30 — FIX-STRANDED-SWEEP-CLASSIFY-AGENT-MODEL-SWITCH — REVIEW

**Task:** dev-team BOUNDED-1 auto-pickup (`cross-service/`, `scripts/` zone → developer). `stranded-state-sweep.sh` classifier mis-classified ~40% of what it reports: M1 (dominant, RESCOPED) — UNKNOWN bucket had no mtime age gate (unlike AUTO-COMMIT), so a file an agent is actively editing right now was reported stranded every tick; M2 (original) — `_is_owned_elsewhere()` hand-list missing several routine agent-output classes.

**Actions taken:** (AC3/M1) mirrored the AUTO-COMMIT bucket's `SSS_AGE_HOURS` young-skip mtime gate onto the UNKNOWN bucket (deletions still exempt, no on-disk mtime). (AC4/M2) extended `_is_owned_elsewhere()`'s glob with `docs/data/auditor-dedup-ledger.json`, `docs/data/DASHBOARD.md`, `docs/data/unified-agent-synthesis-*.json`, `docs/social/fb-post-*.md`. (AC1) new `_is_model_switch_only()` — a `git diff HEAD` content check — gates `.claude/agent-models.json`/`.claude/agents/*.md` as OWNED-ELSEWHERE ONLY when every +/- diff line matches the narrow `current_mode`/`model` value-line regex; any other edit still falls through to UNKNOWN (fail-safe default on empty/mixed diff). `scope_out` honored: neither live file itself staged/committed/reverted — classifier code only.

**Verify-live catch:** ran `--plan` live during this task's own in-flight `.head` (active_task_id=this task) as AC5 evidence — `unknown_paths=[]`; stderr confirmed this task's OWN dirty script/test files (`age_h=0`) and 7 unrelated in-flight `docs/analysis-briefs/*.md` files (`age_h=15`, <24h gate) both correctly withheld as young rather than reported — the exact false-positive class M1 described, now closed. Evidence saved to scratchpad (`sss-ac5-plan-20260730T0731Z.json`/`sss-ac5-stderr-20260730T0731Z.log`).

**Verification:** `stranded-state-sweep.test.sh` 25/25 PASS (19 pre-existing + 6 new: AC1 positive×2/negative×1 model-switch fixtures, AC4 4 new OWNED-ELSEWHERE classes, AC3 young-excluded + `SSS_AGE_HOURS=0` re-probe of the SAME fixture now included). `bash -n` syntax-clean both files. No `apps/` TS source touched (`scripts/` zone) — `bun test`/`tsc` structurally N/A.

**Board:** `task_board.in_progress[FIX-STRANDED-SWEEP-CLASSIFY-AGENT-MODEL-SWITCH]` → `review` (`next_agent: qa`), `.head` reset to idle, same `orch-apply.sh` write.

**Simplicity gate:** PASS — `_is_model_switch_only()` is a single small helper reused at exactly 2 call sites (not single-use); fail-safe default (empty/mixed diff → UNKNOWN) chosen over any config knob, since AC1 requires the narrow behavior unconditionally.

**Zone note:** No MCP/gateway tool available this session (Read/Edit/Write/Bash only, confirmed at Step 0) — flipped the board row directly via `scripts/orch-apply.sh` (permitted, pure bash); could not release `task:FIX-STRANDED-SWEEP-CLASSIFY-AGENT-MODEL-SWITCH` or send Telegram (structural gap, flagged for the coordinating dev-team session).

Zone health: no drift detected.
