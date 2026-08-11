# agents-architect — Notebook

## 2026-08-09T02:43:33Z

**Brief:** `docs/architecture-briefs/2026-08-09-fix-system-auditor-cycle-closeout-actuator-and-signal-path.md`

Root-caused the 7-incident system-auditor notebook/signal defect cluster to 2 gaps: (1) `scripts/notebook-compose.sh` — the byte-identity compose actuator built+tested 2026-08-06 specifically to prevent this class — was never wired into `flow/main.md` despite an explicit developer→agent-father handoff 3 days ago; verified live that commit `07dd8d24f` destroyed 2 previously-committed sections (`## c10`, `## c9`) while its own commit message falsely claimed preservation. (2) the tool-grant reference documents `post_agent_signal` as the general signal path with zero mention of the mandatory `emit-audit-signal.sh` wrapper, plausibly causing a CRITICAL cron-fire-gap finding to land on the wrong (rolling-2h `agent_signals`) bus instead of the durable `signal_queue.rows[]`.

**Signal dropped:** `docs/signals/fix-system-auditor-cycle-closeout-actuator-and-signal-path-20260809T0243Z.json` → agent-father

---

## 2026-08-11T12:38:53Z

**Brief:** `docs/architecture-briefs/2026-08-11-chore-commit-overhead-audit.md`

Router-dispatched skeptical audit of chore-commit volume (85%+ of last 500 commits). Re-verified independently: type-mix matches router's read, but raw insertion-volume was skewed ~2x by an active bug — drain-signals.md's payload_ref inlining rule re-pastes the ENTIRE 745KB db-integrity-history.json into orch-state.json on every db_integrity_breach drain (one live commit added +33k lines from this alone, ~49% of the whole chore-insertion sample). Root-caused the 438 chore commits to 5 structural drivers (notebook/40%, orch-state bookkeeping/16%, signal drain+prune/13%, system-auditor per-finding commits/12%, cold-evict/8%) — majority IS crash-safety-mandated (CAS-guarded board writes, per-agent notebook isolation), confirming the router's spot-check verdict (real, not fabricated). Found one already-diagnosed-but-only-half-shipped fix (2026-07-12 brief flagged `docs/signals/processed/*.json` git-churn; only `signals.db` got untracked) and one proven-safe precedent (2026-05-21 L-7 notebook-commit batching, already live for market-watcher/news-scout) to generalize into system-auditor's per-finding DASHBOARD commits. Investigated PM's `done_verified[]>0` cold-evict trigger as a candidate 4th fix and dropped it — traced to a deliberate HSC-6 design decision, not an oversight.

**Signal dropped:** `docs/signals/2026-08-11-chore-commit-overhead-audit.json` → agent-father (cc po, pm/dev-team)

---

## 2026-08-11T13:59:53Z

**Brief:** `docs/architecture-briefs/2026-08-11-cron-heartbeat-prespawn-gating.md`

New angle vs. the 2026-08-06 cadence brief (interval tuning): does every outer cron heartbeat need to boot a full subagent regardless of real work. Surveyed all 11 outer-heartbeat CronCreate entries across cron-cowork-team/cron-detect-loop/cron-standalone-team — 8/11 already pre-gated by a deterministic shell script embedded in the CronCreate prompt (cowork-team master, all 4 detect-loop crons, db-integrity ×2, market-db-journal-guard); cron-detect-loop has zero gaps. Of the remaining 3, agent-father and claude-manager-helper need no change (real judgment work every observed tick / cadence already right-sized). code-janitor is the one real gap: CADRAT-3's git-diff Pre-Check lives post-boot inside main.md, gating only the DRY scan, while 3 fully-deterministic sweeps boot a full subagent unconditionally 4x/day — last 10 recorded cycles show the DRY-scan branch suppressed 10/10. Recommended mirroring the existing pre-spawn shell-gate pattern. Explicitly rejected any LLM/local-model pre-gate anywhere in the 3 families — no fuzzy pre-spawn judgment case found; cited 3 live instances of safe-looking gates silently disabling their own mechanism, including `FIX-AGENTFATHER-KEEP-PRECHECK-GATE-BLIND-TO-3-OF-5-SCAN-SURFACES` discovered this same session.

**Signal dropped:** `docs/signals/2026-08-11-cron-heartbeat-prespawn-gating.json` → po (cc agent-father)
