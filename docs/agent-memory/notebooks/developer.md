# Developer — Notebook

**Last updated:** 2026-07-29 | **Cycle:** FIX-COLD-EVICT-EXCLUDE-IDS-VS-HARD-COHERENCE

## Session 2026-07-29 — FIX-VPS-SSC-INSIDER-502 — REVIEW (CLOSED-NO-FIX)

**Task:** BOUNDED-1 auto-pickup, `vps-scripts/` (no system-map.json zone — Tier-3 generic dispatch). Decoupled from BA-PREDICTION-EVIDENCE-REVIVAL/TASK-EVIDENCE-HOP1-MCP; decoupling reason: "VPS upstream root-cause diagnosis deferred (requires live SSH, external portal may be down)".

**Findings:** Live-diagnosed WITHOUT VPS SSH — direct HTTP reproduction sufficed. VPS proxy `/proxy/ssc-insider` → 502 "Upstream HTTP 503 from congbothongtin.ssc.gov.vn/...jspx" (3x consistent). Direct sandbox curl to the SAME upstream → 503 "No server is available to handle this request" on every path incl. domain root — identical from non-VN egress AND VN egress (VPS), ruling out geo-block/VPS misconfig. Parent `ssc.gov.vn` healthy (302 nginx); its WebCenter app tier (`/webcenter/portal/ubck`) times out entirely — same app tier `congbothongtin` runs on. Confirmed genuine external SSC outage, no code defect.

**Actions taken:** Added in-code comment at `vps-scripts/vps-proxy-server.js`'s `SSC_INSIDER_UPSTREAM` documenting root cause + explicit "do not add retry" rationale (git-verified precedent: `B-05-FU-SSC-503-RETRY`/commit `a817b5139` already tried+reverted a 503-retry on this exact SSC domain for the sibling BCTC path — caused a 17-day queue freeze because the retry blew the caller's timeout budget; same mismatch applies here vs `sscInsider.ts`'s `withDeadline(30_000)`). Updated `docs/architecture-briefs/2026-07-01-BA-PREDICTION-EVIDENCE-REVIVAL.md` + `docs/WORK.md` with the closure. No functional code change — deliberately did NOT add retry.

**Verification:** `node --check` clean on the touched file (comment-only; no runtime-testable harness exists for this standalone Node script per repo convention). No `bun test`/`tsc` delta possible — zero `apps/mcp-server/src/` files touched. Committed directly to `main`, no task branch (matches `branch:null` CLOSED-NO-FIX precedent, e.g. `9e69d12bb`). Graphify skipped — no Skill-tool grant on this spawned agent, flagged in WORK.md.

**Board:** `task_board.in_progress[FIX-VPS-SSC-INSIDER-502]` → `review` (`next_agent:qa`, `branch:null`), `.head` synced to idle, via `orch-apply.sh`.

**Simplicity gate:** N/A-clean — comment/doc-only change, no logic/feature/abstraction added (Q1-Q4 all trivially NO).

Zone health: no drift detected.

## Session 2026-07-29 — FIX-AUDITOR-DASHBOARD-APPEND-NO-ACTUATOR-CONTRACT-COUNT-NARRATED — REVIEW

**Task:** Router dispatch, P1, cross-service/. Every counter in the auditor's `[OUTPUT-CONTRACT]` line was narrated, not derived — failing BOTH directions same day (over-report ×2: narrated N, wrote 0; under-report: narrated 0, wrote 1 — a `SKIP-dedup` marker, which still carries `id=`, misread as "nothing emitted"). Row's own `root_cause`/acceptance(2) named a nonexistent path (`scripts/agents-flow/emit-audit-signal.sh`) — verified via `ls` before reading anything; real script is `scripts/emit-audit-signal.sh`.

**Actions taken:** New `scripts/emit-dashboard-row.sh` — actuator for `docs/data/DASHBOARD.md` (the LIVE dashboard, confirmed vs the stale `docs/handoffs/DASHBOARD.md` phantom UC-ASL-P6 purges; also confirmed the `.claude/skills/signal-dashboard/` pointer main.md used was itself wrong — that skill governs `.signal_queue.rows[]`, not this file): tmp+mv atomic append, self-contained commit-mutex guard, MANDATORY POST-WRITE read-back (`grep -qF "signal <id>"`) failing loud to BUG on miss. New `scripts/audit-output-contract.sh` — mechanically parses `[emit-signal]`/`[emit-dashboard]`/`[post-agent-signal]` markers accumulated into a per-cycle `$MARKERS_FILE` (introduced at `flow/main.md` §Step 0d) instead of hand-composed counts; adds an independent `.signal_queue.rows[]` cross-check (the old check was vacuous — both operands narrated by the same agent from the same marker set) plus symmetric violations for `dashboard_rows==0` and RETURN-headline/`NEXT`-token consistency. Wired into all 4 WARN/CRITICAL emit sites + 2 bare `post_agent_signal` sites + `page-freshness.md`'s standard-line portion; D-BCTC-EVAL/D-IMPROVE stay `--e3-only` unchanged.

**Backfill decision (acceptance 5):** did NOT backfill the "still-missing 06:08Z A-21" DASHBOARD row — its signal_queue row (`sys-20260729T060929-39de`) was subsequently RETRACTED by PO as an out-of-spec emission contradicting the auditor's own `crashRestarts>=2` threshold. Backfilling now would resurrect a withdrawn finding. Real crash owned by `OPS-MCP-RESTART-CHURN-UNCLEAN-SHUTDOWN`/`FIX-MCP-MEMORY-CODE-LEAK`; counting-window bug by `FIX-A21-CRASH-WINDOW-PREDECESSOR-BOUND-FALSE-NEGATIVE` (both untouched).

**Verification:** `scripts/emit-dashboard-row.test.sh` 32/32, `scripts/audit-output-contract.test.sh` 35/35 (both prove a narrated-but-unwritten count cannot pass — AC-4). No regressions: `scripts/emit-audit-signal.test.sh` 49/49 (unchanged). `shellcheck -x` clean on both new scripts. No TS touched.

**Board:** update via `orch-apply.sh` — `IN_PROGRESS` → `review` (`next_agent: qa`).

Zone health: no drift detected.

## Session 2026-07-29 — FIX-COLD-EVICT-EXCLUDE-IDS-VS-HARD-COHERENCE — REVIEW

**Task:** BOUNDED-1 auto-pickup, `scripts/` (outside all dev-* zones). Router-diagnosed: D5-BACKLOG-HYGIENE-VALIDATOR-HARDENING (commit `ed01c5c1b`) flipped `orch-validate.mjs` Stage-1b from warn to hard-fail; broke `orch-cold-evict.sh`'s `--exclude-ids` safety valve — an excluded terminal-status row stays in a non-terminal lane by design, which the new hard-fail rejects, aborting the WHOLE eviction run.

**Findings:** Root cause confirmed exactly as diagnosed. `LANE_ALLOWED_STATUSES` (orchStateSchema.ts) admits NO terminal status in any of backlog/review/qa/in_progress/ready — any terminal-status row parked there (excluded or not) is unconditionally incoherent by construction. Adjacent discovery, flagged not fixed (0 live occurrences, out of this row's stated scope): the referential-dependency eviction guard (2026-07-28) can hit the identical latent shape for a different reason (live `depends_on` reference instead of `--exclude-ids`).

**Actions taken:** `build_hot_temp()` now relabels an excluded-and-terminal row's `.status` to a lane-coherent status (new `EXCLUDE_RELABEL_STATUS` map, default BLOCKED for backlog/review/in_progress, QA/READY for qa/ready — mirrors `LANE_ALLOWED_STATUSES`) before the SHG-3 write-gate runs, stamping `verify_note` with the original status + timestamp. Zero changes to `orch-validate.mjs`/`orchStateSchema.ts` — chose this over teaching the shared validator an exemption list, which would widen a bypass mechanism's blast radius across every orch-state.json writer and walk back D5's "zero exceptions" intent. `docs/policies/dev-standards.md` CANONICAL block updated.

**Verification:** `scripts/test/orch-cold-evict-tests.sh` 33/41 → 41/41 (0 regressions). Negative-path proof: a fresh genuinely-incoherent fixture (unrelated to `--exclude-ids`) still exits 2 via `orch-validate.mjs` — hard-fail intact, checker untouched. `orchStateSchema.test.ts` 104/104, `dev-team-tick-preflight.test.sh` 98/98 (both shell out to the real script) unchanged. `shellcheck -x` clean.

**Board:** `task_board.in_progress[FIX-COLD-EVICT-EXCLUDE-IDS-VS-HARD-COHERENCE]` → `review` (`next_agent: qa`), `.head` synced to idle, via `orch-apply.sh`.

Zone health: no drift detected.
