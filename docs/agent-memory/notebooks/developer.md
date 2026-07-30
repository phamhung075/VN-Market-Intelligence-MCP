# Developer — Notebook

**Last updated:** 2026-07-30 | **Cycle:** FIX-AUDITOR-CALLER-PROSE-OVERRIDES-DOCUMENTED-DETECTOR-THRESHOLD

## Session 2026-07-30 — FIX-AUDITOR-CALLER-PROSE-OVERRIDES-DOCUMENTED-DETECTOR-THRESHOLD — REVIEW

**Task:** dev-team resume after WF-2 SUPERVISED-HOLD cleared (`cross-service/`). Architect plan_only brief + independent PO ratification (STEP po-5): (1) no refusal rule when a spawn prompt contradicts a documented spec-internal threshold, (2) no provenance on the resulting signal row.

**Actions taken:** `CANONICAL:AUD-CP-1` in `dev-standards.md`. New `## CALLER-INSTRUCTION PRECEDENCE (AUD-CP-1)` block in `main.md` before `## Tier Dispatch` + mandatory `CONTRACT-CONTRADICTION` RETURN line + changelog. 4-line `tier1-probe.md` breadcrumb strictly outside the protected verdict-mapping span. `provenance:"detector"` hardcoded into `emit-audit-signal.sh`'s sole `_build_row_json()` — no flag, no schema migration.

**Verify-live catch:** breadcrumb confirmed via `git diff` OUTSIDE lines 135-142 (byte-identical mapping) — this file was already burned once by an in-span veto. Also: `dev-standards.md`/`docs/WORK.md` entries landed at HEAD via peer commit `c919f69a1` before I could commit — verified byte-identical, not re-committed (`feedback_shared_main_peer_push_sweeps_held_data_commits`).

**Verification:** RED-then-GREEN — T13/T14/T15 (plain/`--e3-only`/CAS-retry shapes) failed pre-fix, GREEN after the hardcode. Suite 53/53 PASS. `pre-commit-auditor-heartbeat.test.sh` 6/6 unaffected. `shellcheck` clean (pre-existing info-level only). No `apps/` touched — `bun test`/`tsc` N/A.

**Board:** `task_board.in_progress[...]` → `review` (`next_agent: qa`), `.head` idle, `orch-apply.sh`.

**Simplicity gate:** PASS — hardcoded literal (no flag, per AC4), doc blocks near-verbatim from the ratified brief.

**Zone note:** No MCP/gateway tool this session — flipped board row via `orch-apply.sh` directly; could not release `task:FIX-AUDITOR-CALLER-PROSE-OVERRIDES-DOCUMENTED-DETECTOR-THRESHOLD`/Telegram (structural gap, flagged for coordinating session).

Zone health: this write hit the SAME notebook-auto-prune.sh tie-break misfire T1-PREGATE flagged (date-only headings, all-tied stable-sort drops physically-first not true-oldest) — recomposed manually within both caps rather than relying on the hook; not filed as a new row (still single-session, flagged for coordinating session).

## Session 2026-07-30 — FIX-BOUNDED1-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-LANE — REVIEW

**Task:** router-adjudicated direct dispatch (`cross-service/`, supervised+plan_only — same pattern as LAYER2/FIX-AUDITOR-CALLER-PROSE this cycle). Implemented architect's PO-ratified Design-Router Sweep (DRS): a 4th WIP≤2 idle-fallthrough writer for backlog rows whose `next_agent` is non-dev and not already SLS's supervised+plan_only territory.

**Actions taken:** `is_design_router_allowed`/`is_design_router_eligible` added to `scripts/lib/devteam-eligibility.jq`. New `scripts/devteam-backlog-promote-design-router-sweep.jq` + `scripts/devteam-backlog-claim-design-router-sweep.jq` — mandatory conditional-guard `.head` write from day one (never unconditional; hard AC, PO ratification Q3). Wired into `docs/agents/dev-team/flow/main.md` as BOUNDED-1→SLS→RLC→**DRS**→QA-Drain→Step1. Ratified narrow allowlist `{architect, ba, pm, po, agents-architect}` — `agent-father`/`ops*`/`qa`/`system-auditor` excluded per the ruling's own reasoning. Extended `scripts/audits/devteam-dispatch-gate-satisfiability.sh` (+6 DRS assertions) and `scripts/audits/bounded1-supervised-lane-report.sh` (new non-gating DRS section, ELIGIBLE vs STRANDED-OFF-ALLOWLIST). CANONICAL pointer added to `dev-standards.md`.

**Reconciliation (PO's added input beyond the brief):** live-computed the 34-row `supervised:true`/`plan_only`-not-true set (down from PO's 41 — one row separately fixed this cycle). 10 already DRS-eligible as specified (DRS excludes only the supervised+plan_only-BOTH class, an AND not an OR — includes P0s `UC-CCA-P3`/`FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR`). 5 non-dev but off-allowlist (policy, not a gap). 7 carry a DEV-role `next_agent` (P0 `FIX-SPRINT-TASK-HEARTBEAT-LOCK`) — genuinely uncovered by BOUNDED-1/SLS/DRS alike; left explicitly out of scope (auto-dispatching a `supervised:true` row to `developer` unattended would defeat the flag's own purpose — a new risk decision, not this implementation cycle's call) and documented with live counts, not silently dropped.

**Verify-live catch:** dry-run against a scratch copy of the LIVE board (never the live file) proved the conditional `.head` guard is load-bearing RIGHT NOW, not just synthetically — this row's own `.head` is genuinely SLS-busy (`FIX-AUDITOR-CALLER-PROSE-OVERRIDES-DOCUMENTED-DETECTOR-THRESHOLD`) and the claim script correctly left it byte-identical while still moving the picked row `ready[]→in_progress[]`. DRS's broader query also surfaced a real live malformed `created_at` (`backlog-detail.json:3820`, missing colons) that crashed the WHOLE `bounded1-supervised-lane-report.sh` instrument — hardened `age_days()` with `try/catch` so one bad timestamp degrades to `null` for that row only.

**Verification:** `scripts/audits/devteam-dispatch-gate-satisfiability.sh` 34/34 PASS (never writes to the live file). `bounded1-supervised-lane-report.sh` DRS section runs clean (120 live target rows, 76 eligible, 44 stranded-off-allowlist by policy); pre-existing unrelated PRIMARY `[FAIL]` (5 rows, dispatch-lane=none) reproduced BEFORE this change too via `git stash` A/B — confirmed not a regression, out of scope. No `apps/` source touched (pure jq+bash+md) — `bun test`/`tsc` structurally N/A. `/graphify docs --update --no-viz` skipped — incremental manifest is repo-wide stale (3853 changed files flagged, overwhelmingly unrelated to this task's 3-doc touch); running it would be a disproportionate token spend for a size-M task and reflects pre-existing graphify-maintenance debt, not something this task introduced — flagged, not silently run or silently skipped.

**Board:** left this row's own status/lane/next_agent UNTOUCHED (plan_only:true+supervised:true, per instruction) — dev-team RAW-verify + PO/dev-team disposition next, same discipline as LAYER2/FIX-AUDITOR-CALLER-PROSE.

**Simplicity gate:** PASS — DRS mirrors SLS/RLC's existing promote+claim shape exactly (no new architecture); only 2 new shared-lib predicates added, both composed entirely from predicates the file already had; allowlist is a caller-supplied `--argjson` (a policy input per the ratification's own design, not new hardcoded config).

**Zone note:** No MCP/gateway tool grant in this session (Read/Edit/Write/Bash only) — committing directly via explicit pathspec per INV-GATEWAY-1; coordinating dev-team session handles `task_heartbeat`/release and RAW-verify.

Zone health: unrelated concurrent-session churn observed in `git status` (`scripts/emit-audit-signal.sh`/`.test.sh` modified by a peer session) — NOT staged/touched by this commit, pathspec-scoped add used throughout.

## Session 2026-07-30 — FIX-AUDITOR-T1-PREGATE-MEMCREEP-SINGLE-POINT-SAMPLE — REVIEW

**Task:** dev-team BOUNDED-1 auto-pickup (`cross-service/`, `scripts/agents-flow/` zone → developer). `_check_mem_creep()` in `auditor-tier1-probe.sh` took exactly ONE `docker stats` sample per container per invocation and gated ALL_GREEN/FAILURE off it — live-verified: a re-run ~5.5min after a cited ALL_GREEN flipped FAILURE (pdf-extractor 99.91% MemPerc), a transient peak the single sample missed.

**Actions taken:** New `MEM_CREEP_SAMPLES` (>=2, default 2, clamped) / `MEM_CREEP_SAMPLE_INTERVAL_SEC` (default 2s) top-of-script knobs (test seams). Per-container check now loops N `docker stats` samples and gates off the WORST (max) parsed pct — a breach in ANY sample forces FAILURE even if another same-window sample reads GREEN; any single sample's stats-unavailable/unparseable still breaches (unchanged fail-loud). Zero change to `run_probe()` call site, ack-ledger arm, or `{verdict,detail,last_healthy_at}` output schema.

**Verify-live catch (x2):** (1) a notebook-write byte-cap surprise — this section's own first landing pushed `developer.md` over the 60-bytes/line-derived BYTE_CAP even though LINE_CAP was fine; the `notebook-auto-prune.sh` PostToolUse hook fired and, because every heading here is date-only (`Session 2026-07-30`, no time-of-day) and its tie-break sorts stably on ORIGINAL physical order, silently dropped the physically-FIRST section (this one, freshly inserted at the NEWEST-FIRST top) instead of the true-oldest bottom section — caught by re-reading the file post-write rather than trusting the Edit result, recomposed manually below the byte budget instead of relying on the hook. (2) test-stub in-memory call-counter silently broken by `docker stats`'s `$(...)` subshell fork — see Actions.

**Verification:** new regression T54-T58 in `auditor-tier1-probe.test.sh` — T54 reproduces the exact live incident (sample1=70.00% GREEN, sample2=99.91% FAIL → verdict FAILURE, names the WORST pct not the first); T55 proves worst-of-window not last-sample (reversed order, still FAILURE); T56/T57/T58 prove the loop actually samples N times (file-based call-count assertion, tmp-file not array — survives the subshell) and the N>=2 floor is enforced against an invalid override. Full suite 181/181 PASS (167 pre-existing byte-identical + 14 new checks), ~12s (interval knob exported =0 suite-wide). `shellcheck` clean (2 pre-existing unrelated warnings only).

**Board:** `task_board.in_progress[FIX-AUDITOR-T1-PREGATE-MEMCREEP-SINGLE-POINT-SAMPLE]` → `review` (`next_agent: qa`), `.head` reset to idle, same `orch-apply.sh` write.

**Simplicity gate:** PASS — 2 small env-var knobs + a loop around the existing single-sample read; worst-of-N reuses the SAME awk comparison idiom the script already used for the threshold check.

**Zone note:** No MCP/gateway tool available this session (Read/Edit/Write/Bash only, confirmed at Step 0) — flipped the board row directly via `scripts/orch-apply.sh` (permitted, pure bash); could not release `task:FIX-AUDITOR-T1-PREGATE-MEMCREEP-SINGLE-POINT-SAMPLE` or send Telegram (structural gap, flagged for the coordinating dev-team session).

Zone health: notebook-auto-prune.sh's date-only-heading tie-break misfire (above) is a real latent bug but OUT OF SCOPE for this task (scope = `auditor-tier1-probe.sh` only) — not filed as a new row here, flagged in RETURN for the coordinating session to triage. Distinct from `FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE` (loop scope) and `FIX-AUDITOR-A30-VMHWM-VETO-TAUTOLOGY-FALSE-NEGATIVE` (mcp-server veto) — neither touched; `docs/agents/system-auditor/probe.sh` (separate LLM-subagent evidence collector) also confirmed out of scope, untouched.
