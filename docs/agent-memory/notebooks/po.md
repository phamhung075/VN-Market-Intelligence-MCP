# PO Notebook

**Cycle:** mcp-server SCALE pilot — Phase-0 CLOSE (P0-MCP-4 anchor + P0-MCP-EXIT). Host-side bookkeeping only; NO docker build (memory cap → separate session).
**Last update:** 2026-05-25T10:50:43Z
**Status:** mcp-server status=ACTIVE, phase=1, phase0.status=CLOSED, exit_gate=CLOSED, phase1.status=ACTIVE, sequencingGate.decision=PHASE0-CLOSED-PHASE1-READY-SOLO-DEFERRED, verdict=TBD. Commit ad495c3e. LAST factory pilot — 2026-05-22 rollout now 11/11 through Phase-0.

---

## 2026-05-25T10:50Z — mcp-server Phase-0 CLOSED (anchor + exit)

**Trigger:** explicit PO task — close Phase-0. Verified each of the 4 deliverable commits exists in git log BEFORE crediting (did not trust the task note blindly):
- P0-MCP-1 brownfield `44530a26` (architect) — verdict FULL, 12 barrels, 146 tools, G5-inverse map.
- P0-MCP-2 bug-inventory `05dc494a` (qa) — ~9408 pass/~348 fail/35 skip; 7 open bugs (BUG-5 = R-CRITICAL G5-inverse).
- P0-MCP-3 dev-mcp-server flow G12 gate `0a4f1f28` (agent-father). dev_agent_file = N/A (agent pre-existed; flow baked the gate).
- P0-MCP-5 Phase-1 plan `7d78abb1` (architect) — FULL, 10 tasks P1-A..P1-EXIT, 78 ACs.

**P0-MCP-4 anchor:** annotated tag `mcp-server-pre-refactor` @ `7d78abb1` (the clean pre-refactor HEAD after all 4 deliverables landed). Convention `<service>-pre-refactor` (checked `git tag -l` → matches news-fetch-pre-refactor). Local-only, NO push. Recorded in pilot-status §phase0.anchor_tag (SSOT, mirrors news-fetch). Tag now 1 commit behind HEAD (bookkeeping commit ad495c3e sits on top — correct).

**SSOT reconcile (project-stats.json, from P0-MCP-2 live baseline):** cronJobCount 77→68 (= startScheduler.ts `cron.schedule` = dev-mcp-server Gate-2d probe + Phase-1 tripwire; cronConfig.ts=73 noted as broader named-config map). testBaselinePass 9277→9408, testBaselineFail+testFailures 34→348 (live ~9408-9411/~345-348/35 skip, 9791 total; +312 fail = pre-existing BCTC/fixture debt per QA cycles 106-108, NOT new regressions). toolCount=146 UNCHANGED (correct). Added _cronJobCountNote + expanded _testBaselineNote.

**G5-inverse R-CRITICAL CARRY (NOT lost at phase boundary):** confirmed carried as P1-F (kinhDichWrapper.appendKinhDich() bypass in marketTools.ts + news-analysis/analysis.ts + portfolioTools.ts QUE_META import — all R-CRITICAL) + P1-G (pdf.ts/pdfOcrWorker post-1954c — R-MEDIUM). Both end with "every handler proven HTTP-routed" evidence gate. Logged in pilot-status phase1.progress_notes + TASKS.md Phase-1 backlog.

**WAVE B = READY-SOLO-DEFERRED:** plan locked + SOLO conditions met host-side, but P1-A NOT dispatched — every wave QA-gated against live server + closes with docker rebuild → separate docker session (memory cap). phase1.buildWave records readiness=READY/dispatchMode=RUN-SOLO/dispatchState=DEFERRED.

**Integrity:** both JSON re-validated zero-dup-keys (object_pairs_hook) post-edit. Explicit per-file staging (NEVER -A/-am); docs/data tracked-but-dir-ignored → advisory noise harmless (files tracked, index updated, confirmed via `git show :path`). No index.lock + no live git verified before staging; HEAD scope = EXACTLY 3 files; no --force/--no-verify/--no-gpg-sign; local-only. Commit ad495c3e. MCP gateway tools NOT exposed this session → commit-mutex via MCP unavailable; mitigated by SOLO single-writer + immediate pre-commit concurrency recheck (intent of mutex preserved).

## Carry-over
- mcp-server WAVE B (dev-mcp-server) is READY-SOLO-DEFERRED: dispatch P1-A FIRST in the separate docker session, no other dev/scale terminal touching mcp zone. WIP=1 sequential A→B→C→D→E→F→G→H→QA→EXIT. G12 streak = P1-B/C/D. Pre-revert tags created per-wave at P1-C/D/E/F start.
- Anchor `mcp-server-pre-refactor` @ 7d78abb1 FROZEN — no retag/rewrite/push (anchor discipline).
- frontend pilot: AWAITING-USER-G9-SIGNOFF (Path-A verbal) + Wave-C container rebuild (ops, separate docker session). goalsEarned=4, terminal fields TBD until 12/12.
- BUILD-WAVE order to user end-state: A(frontend build, done) → B(mcp-server build SOLO, ready-deferred) → C(ops rebuild containers + live health) → D(qa whole-fleet regression). Live health is the truth gate, not disk-green.
- BUG-1 commit-mutex enum drift still binding (kind=sprint-task workaround). This session: MCP gateway not callable at all from PO agent context — flag if a future cycle needs MCP.
