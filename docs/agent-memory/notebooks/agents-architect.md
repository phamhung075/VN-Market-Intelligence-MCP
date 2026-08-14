# agents-architect — Notebook

## 2026-08-11T13:59:53Z

**Brief:** `docs/architecture-briefs/2026-08-11-cron-heartbeat-prespawn-gating.md`

New angle vs. the 2026-08-06 cadence brief (interval tuning): does every outer cron heartbeat need to boot a full subagent regardless of real work. Surveyed all 11 outer-heartbeat CronCreate entries across cron-cowork-team/cron-detect-loop/cron-standalone-team — 8/11 already pre-gated by a deterministic shell script embedded in the CronCreate prompt (cowork-team master, all 4 detect-loop crons, db-integrity ×2, market-db-journal-guard); cron-detect-loop has zero gaps. Of the remaining 3, agent-father and claude-manager-helper need no change (real judgment work every observed tick / cadence already right-sized). code-janitor is the one real gap: CADRAT-3's git-diff Pre-Check lives post-boot inside main.md, gating only the DRY scan, while 3 fully-deterministic sweeps boot a full subagent unconditionally 4x/day — last 10 recorded cycles show the DRY-scan branch suppressed 10/10. Recommended mirroring the existing pre-spawn shell-gate pattern. Explicitly rejected any LLM/local-model pre-gate anywhere in the 3 families — no fuzzy pre-spawn judgment case found; cited 3 live instances of safe-looking gates silently disabling their own mechanism, including `FIX-AGENTFATHER-KEEP-PRECHECK-GATE-BLIND-TO-3-OF-5-SCAN-SURFACES` discovered this same session.

**Signal dropped:** `docs/signals/2026-08-11-cron-heartbeat-prespawn-gating.json` → po (cc agent-father)

---

## 2026-08-12T13:22:49Z

**Brief:** `docs/architecture-briefs/2026-08-12-fix-auditor-dedup-ledger-cas-atomicity.md`

Root-caused the auditor-dedup-ledger.json key-loss (2-instance escalation threshold met) to a bare tmp+mv ledger writer in emit-audit-signal.sh with zero CAS-guard doing 2 independent read-modify-write cycles per invocation — a lost-update race between concurrent system-auditor sessions/tiers. The pretty/compact format flip is a separate same-script bug (inconsistent jq -c usage between the two write sites), not a second-writer signal. Fix: collapse to 1 CAS-guarded write per invocation, reusing this file's own existing E-3/orch-state CAS-retry idiom at a right-sized scope. Did not hand-patch the ledger file itself.

**Signal dropped:** `docs/signals/2026-08-12-fix-auditor-dedup-ledger-cas-atomicity.json` → agent-father

---

## 2026-08-14T04:26:46Z

**Improvement-Proposal Review:** `docs/improvement-proposals/IMP-20260814-system-auditor-notebook-compose-actuator-never-wired.md` (po-authored, LANE-A) — Lane confirmed. Added a 2nd, differently-shaped confirmed occurrence (2026-08-14T04:17:44Z c89→c90, commit `fefa04067`: retained section's HEADING survived byte-identical, its ~101L body silently gutted underneath — distinct from the doc's original numbering/ordering/cap-breach evidence). Answered the router's specific ask by reading `scripts/notebook-compose.sh` end to end: its step-8b byte-for-byte retained-section check structurally closes the truncation shape (ABORTs, writes nothing, on any retained-body mutation) — and does so where `main.md`'s current interim Step 2a guard structurally cannot, since that guard diffs only the SET of `## ` heading lines, never section bodies (exactly why it missed both the 2026-08-09 and 2026-08-14 occurrences). Two gaps NOT closed by wiring the script as-is, folded into sharpened AC-3/AC-1 language in the proposal doc rather than a new brief: `c<NNN>` derivation stays caller-authored per the script's own contract (numbering defect would recur even post-wiring unless made deterministic); default `--section-cap=60` is smaller than real Tier-1 CRITICAL sections (84L/105L observed), risking silent evidence-clipping at authoring time if left untuned. Also found the 2026-08-14 occurrence was NOT under cap pressure (163L reconstructed, both caps unbreached) — the freehand-reproduction risk applies to every notebook write with a nontrivial retained section, not only cap-eviction boundaries.

Did not mint a new board row or a new architecture brief (existing tracked row `FIX-AUDITOR-NOTEBOOK-COMPOSE-ACTUATOR-BUILT-TESTED-NEVER-WIRED`, P1, backlog, already covers this). Did not re-route to `agent-father` (already dropped this exact rewire twice via untracked `docs/signals/processed/` handoffs — the tracked board row is what makes LANE-A viable this time, per the proposal's own rationale). `docs/data/orch/orch-state.json` board-row field update left to `po` — outside this agent's declared commit zone.

**Signal dropped:** `docs/signals/IMP-20260814-system-auditor-notebook-compose-actuator-never-wired-review.json` → po

---

## 2026-08-14T07:56:51Z

**Brief:** `docs/architecture-briefs/2026-08-14-devteam-head-nextagent-write-coherence.md`

PO triage's `FIX-DEVTEAM-HEAD-NEXTAGENT-RESYNC-ON-REASSIGN` (in_progress-resident facet of the stale-`.head` family, 3 confirmed agent types: router DRS, pm ×2, architect). Designed WF-2b: a new `dev-team/main.md` check inserted between WF-2 and WF-3 that, unlike every other WF-N carve-out, never JUMPs away — it resyncs `.head.next_agent` to match the row's own current `next_agent` when they disagree (the row is authoritative, not `.head` — dispatcher-only mirror state, single reader), resets `resume_attempts` to 0 in the same write (prevents a WF-3 false-positive tripping on the first correct dispatch after a fix), and lets S2 dispatch the corrected agent the same tick. Row-lookup scoped to `in_progress[]`+`active_sprints[].tasks[]` only — proven safe regardless of the concurrently-landing WF-1d row's own order (a review/qa-resident row resolves empty either way, never double-fixed). Ruled memory-candidate (a) (per-flow-doc handoff sync) NOT warranted for pm/architect/router given WF-2b's zero-latency single-file fix; ruled pm's partial `.head` write (commit `95540b50d`, status-flip only) needs its own narrow companion (different malformed shape/entry gate, WF-2b structurally can't catch it). Flagged 2 companion rows for PO to mint: `FIX-PM-NONCLOSEOUT-HEAD-RESET-INCOMPLETE-NULLOUT` (agent-father) + `FIX-DEVTEAM-HEAD-NEXTAGENT-COHERENCE-VERIFY` (developer).

**Signal dropped:** `docs/signals/devteam-head-nextagent-write-coherence-20260814.json` → agent-father
