# agents-architect — Notebook

## 2026-08-11T12:38:53Z

**Brief:** `docs/architecture-briefs/2026-08-11-chore-commit-overhead-audit.md`

Router-dispatched skeptical audit of chore-commit volume (85%+ of last 500 commits). Re-verified independently: type-mix matches router's read, but raw insertion-volume was skewed ~2x by an active bug — drain-signals.md's payload_ref inlining rule re-pastes the ENTIRE 745KB db-integrity-history.json into orch-state.json on every db_integrity_breach drain (one live commit added +33k lines from this alone, ~49% of the whole chore-insertion sample). Root-caused the 438 chore commits to 5 structural drivers (notebook/40%, orch-state bookkeeping/16%, signal drain+prune/13%, system-auditor per-finding commits/12%, cold-evict/8%) — majority IS crash-safety-mandated (CAS-guarded board writes, per-agent notebook isolation), confirming the router's spot-check verdict (real, not fabricated). Found one already-diagnosed-but-only-half-shipped fix (2026-07-12 brief flagged `docs/signals/processed/*.json` git-churn; only `signals.db` got untracked) and one proven-safe precedent (2026-05-21 L-7 notebook-commit batching, already live for market-watcher/news-scout) to generalize into system-auditor's per-finding DASHBOARD commits. Investigated PM's `done_verified[]>0` cold-evict trigger as a candidate 4th fix and dropped it — traced to a deliberate HSC-6 design decision, not an oversight.

**Signal dropped:** `docs/signals/2026-08-11-chore-commit-overhead-audit.json` → agent-father (cc po, pm/dev-team)

---

## 2026-08-11T13:59:53Z

**Brief:** `docs/architecture-briefs/2026-08-11-cron-heartbeat-prespawn-gating.md`

New angle vs. the 2026-08-06 cadence brief (interval tuning): does every outer cron heartbeat need to boot a full subagent regardless of real work. Surveyed all 11 outer-heartbeat CronCreate entries across cron-cowork-team/cron-detect-loop/cron-standalone-team — 8/11 already pre-gated by a deterministic shell script embedded in the CronCreate prompt (cowork-team master, all 4 detect-loop crons, db-integrity ×2, market-db-journal-guard); cron-detect-loop has zero gaps. Of the remaining 3, agent-father and claude-manager-helper need no change (real judgment work every observed tick / cadence already right-sized). code-janitor is the one real gap: CADRAT-3's git-diff Pre-Check lives post-boot inside main.md, gating only the DRY scan, while 3 fully-deterministic sweeps boot a full subagent unconditionally 4x/day — last 10 recorded cycles show the DRY-scan branch suppressed 10/10. Recommended mirroring the existing pre-spawn shell-gate pattern. Explicitly rejected any LLM/local-model pre-gate anywhere in the 3 families — no fuzzy pre-spawn judgment case found; cited 3 live instances of safe-looking gates silently disabling their own mechanism, including `FIX-AGENTFATHER-KEEP-PRECHECK-GATE-BLIND-TO-3-OF-5-SCAN-SURFACES` discovered this same session.

**Signal dropped:** `docs/signals/2026-08-11-cron-heartbeat-prespawn-gating.json` → po (cc agent-father)

---

## 2026-08-12T13:22:49Z

**Brief:** `docs/architecture-briefs/2026-08-12-fix-auditor-dedup-ledger-cas-atomicity.md`

Root-caused the auditor-dedup-ledger.json key-loss (2-instance escalation threshold met) to a bare tmp+mv ledger writer in emit-audit-signal.sh with zero CAS-guard doing 2 independent read-modify-write cycles per invocation — a lost-update race between concurrent system-auditor sessions/tiers. The pretty/compact format flip is a separate same-script bug (inconsistent jq -c usage between the two write sites), not a second-writer signal. Fix: collapse to 1 CAS-guarded write per invocation, reusing this file's own existing E-3/orch-state CAS-retry idiom at a right-sized scope. Did not hand-patch the ledger file itself.

**Signal dropped:** `docs/signals/2026-08-12-fix-auditor-dedup-ledger-cas-atomicity.json` → agent-father
