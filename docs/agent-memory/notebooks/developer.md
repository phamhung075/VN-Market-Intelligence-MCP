# Developer — Notebook

**Last updated:** 2026-07-23 | **Cycle:** UC-CCA-P6-NBWRITE (notebook-write AC-3 consolidation, Piece 1)

## Session 2026-07-23 — UC-CDC-P4 (dev-team dispatched, cowork-dispatcher-cron-P4, cross-service/) — REVIEW

**Task:** `spawn-fanout.md` Step 5 fired ALL `WON_SLOTS` unconditionally in one message block ("no sequential gating") — root cause of a prior load-205 host-starvation incident (memory `feedback_overparallel_fanout_host_starvation`). PO rescope (architecture brief 2026-07-12 #cowork-dispatcher-cron-P4) asked for a headroom-gated bounded batcher, thresholds SSOT'd not hardcoded.

**Actions taken:** New Step 5.1 computes `MAX_PARALLEL` from `cadence-policy.json` new `_fanout` key (5 thresholds), gated on `host_headroom_mb` (Step 4.2's `PRESSURE_STATE`, fail-safe degraded when legacy/stale) OR `uptime` 1-min load vs `sysctl -n hw.ncpu`. New Step 5.2 batches `WON_SLOTS` (guaranteed slots fill batch 1), fires each batch as one `run_in_background=true` block (BGFAN-1 unchanged within a batch), and waits for completion/load re-probe between batches capped at `batch_wait_max_seconds` (degrades on timeout, never stalls past the 600s token TTL/15-min tick — naive back-to-back batching of background spawns would otherwise be a no-op). Added the carve-out to `agent-chaining-protocol.md` § Background Spawn Mandate. Corrected spawn-fanout.md's stale size-justification header (108L claimed vs 227L actual pre-edit drift) to the real post-edit count.

**Verification:** `cadence-policy.json` jq-validated. `DWF-phase1-cadence.test.ts` (only test touching cadence-policy.js) re-run 51/51 GREEN post `_fanout` addition — no schema assertion broke. Docs/config-only, no `.ts` touched, main-only (no branch, per CLAUDE.md).

**Board:** `task_board.in_progress[UC-CDC-P4]` → review, via `orch-apply.sh`.

**Scope discipline:** Touched `spawn-fanout.md`, `cadence-policy.json`, `agent-chaining-protocol.md`, `WORK.md`, this notebook, decision journal. Flagged not fixed: `graphify-out/graph.json` is 2 months stale (last run 2026-05-23) — a scoped `--update` would re-extract that whole accumulated backlog, disproportionate to this 3-file fix; left for PO/router.

Zone health: `docs/agents/cowork-team/flow/spawn-fanout.md` Step 5 fan-out — now headroom/load-bounded, thresholds SSOT | HEALTHY

## Session 2026-07-23 — UC-CDC-P4 (QA CHANGES_REQUESTED redispatch #1, cross-service/) — REVIEW

**Task:** QA AC1 blocking: Step 5.1's missing/unparseable-`cadence-policy.json` branch inline-synthesized the ENTIRE `_fanout` object (`{max_parallel_default:4, max_parallel_degraded:2, headroom_floor_mb:1500, load_per_core_factor:2, batch_wait_max_seconds:120}`) as a fallback — a shadow copy of the SSOT, violating "ZERO hardcoded fan-out numbers" and contradicting the prior commit/WORK.md claim. AC2–AC6 already PASSED, untouched.

**Actions taken:** Replaced the literal-object fallback with a `FANOUT_MODE="degraded_serial"` downgrade + `MAX_PARALLEL=1` single conservative sentinel (not read from/standing in for any `_fanout` key) — mirrors pressure-read.md Step 4.2's proven missing-policy MODE-downgrade pattern (no numeric synthesis). Headroom/load computation is skipped entirely in that mode (no thresholds exist to gate against) rather than partially reconstructed. Step 5.2's inter-batch wait gained a matching `if FANOUT_MODE == "degraded_serial"` branch — it previously dereferenced `FANOUT_POLICY.batch_wait_max_seconds` unconditionally, which would now crash on an undefined object; degraded_serial instead waits unconditionally for the single spawn's completion (MAX_PARALLEL=1 already bounds concurrency, no timeout/re-probe math needed).

**Verification:** `bun test src/__tests__/DWF-phase1-cadence.test.ts` re-run (not trusted from prior run) — 51 pass / 0 fail, 183 expect() calls. `grep` confirms zero remaining inline `_fanout` numeric literals anywhere in spawn-fanout.md — all 5 keys now referenced by name only (`FANOUT_POLICY.<key>`), inside the `else` (policy-loaded) branch exclusively.

**Board:** `task_board.in_progress[UC-CDC-P4]` → `review`, `qa_blocking_issues` annotated resolved, via `orch-apply.sh`.

**Scope discipline:** Touched only `spawn-fanout.md` (Step 5.1/5.2 + size-justification header), this notebook, decision journal. Did NOT re-touch `cadence-policy.json` `_fanout` values, batch semantics, the health-driven DEGRADED fail-safe branch, the test file, or `agent-chaining-protocol.md` per redispatch scope.

Zone health: `docs/agents/cowork-team/flow/spawn-fanout.md` — no `_fanout` shadow copy remains; missing-policy path now mode-downgrades like pressure-read.md | HEALTHY

## Session 2026-07-23 — UC-CCA-P6-NBWRITE (dev-team BOUNDED-1 auto-pickup, cross-service/) — REVIEW

**Task:** ultracode-audit P6 Piece 1 — notebook-write AC-3 compose logic copy-pasted inline in 4 cowork flows (news-scout/bctc-analyst/chef/digest-predict), diverged (daily-predict missing AC-5 gate + AC-4 fallback); fb-market-poster's flow said "full overwrite" while notebook-write SKILL.md AC-6 already classifies fb-market-poster APPEND — full overwrite wiped its own permanent Lessons/Known patterns section every cycle.

**Actions taken:** Replaced all 4 inline compose blocks with a skill pointer (`.claude/skills/notebook-write/SKILL.md`) + <=10L per-agent section template only, in news-scout/flow/stage-log-notify.md, bctc-analyst/flow/stage-log-notify.md, unified-agent/flow/chef.md Step 8b, digest-predict/flow/daily-predict.md P-6 — kept each flow's existing cowork-end-cycle skip-parenthetical unchanged (still needed until TE-T05 lands). Fixed fb-market-poster/flow/main.md: Output line + STEP 8 header now say APPEND class; restructured the template so `# FB Market Poster — Notebook` + `## Lessons learned` + `## Known patterns` are the never-pruned preamble and the per-cycle body ("Last cycle" fields) now lands as a rolling `## c<NNN> · <ISO>` section.

**Verification:** grep across the 4 edited flows for the inline compose-step phrases ("Identify preamble (before first", "drop oldest `## ` block", "Count in-memory lines. If > 200L") returns zero matches; repo-wide grep confirms the pattern still lives only in the skill itself + 3 out-of-scope files (system-auditor/main.md, digest-predict/monday.md, agents-architect/handlers.md — not in Piece 1's file list, untouched). fb-market-poster grep for "overwrite" now returns only the explanatory "was ... full-overwrite body" comparison text, no live-instruction match. Net -59 lines across the 5 files (81 deletions / 22 insertions, `git diff --stat`).

**Board:** `task_board.in_progress[UC-CCA-P6-NBWRITE]` → `review`, `next_agent=qa`, `.head` synced, via `orch-apply.sh`.

**Scope discipline:** Touched only the 5 flow docs in Piece 1's file list, this notebook, decision journal. Did NOT touch weekly-recap.md/weekly-prediction.md, which independently still say "full overwrite" for the SAME fb-market-poster.md notebook (same bug, different evidence anchor, not in Piece 1's *Files* list or cited I8 evidence) — flagged as a residual gap for a follow-up row, not fixed here. Did NOT touch Piece 2 (cowork-end-cycle no-op rule, skip-parenthetical deletion) — folds into queued TE-T05 per rescope.

Zone health: notebook-write AC-3 — single SSOT compose procedure (skill), 4 flow-doc copies retired | fb-market-poster notebook — APPEND class restored per AC-6, Lessons/Known patterns preamble now survives daily cycles (weekly sub-flows still at risk, see gap above) | HEALTHY
