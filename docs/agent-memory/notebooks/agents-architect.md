# agents-architect — Notebook

## 2026-08-14T16:25:04Z

**Brief:** `docs/architecture-briefs/2026-08-14-market-watcher-eod-offhours-notebook-collision.md`

Router-dispatched (RAW-verified, not self-reported): `market-watcher-offhours` (`0 */4 * * *`) and `market-watcher-eod` (`0 16 * * 1-5`) structurally collide every weekday 16:00 UTC, both full-overwriting `docs/agent-memory/notebooks/market-watcher.md`. Independently re-confirmed this cycle: EOD's own 2026-08-14 notebook entry is permanently lost (git log's latest entry is offhours' own commit `23eed1755`); commit `6cfdfb227` (claims "EOD notebook") actually touched only `news-scout.md` — a bare `git_commit_retry` with no trailing pathspec swept a concurrent peer's change (RULE 2.5 / commit-mutex Step 2c violation, confirmed live in both `eod.md` Step D and `cycle.md`'s offhours self-commit). The existing 2026-08-06 `market-watcher-notebook:main` mutex only guards the git-commit step, not the raw `Write()`, so it can't prevent this. PRIMARY fix: generalize the already-shipped, proven CHEF same-tick mutex (`applyChefMutex`/`cowork-chef-mutex.js`, live since 2026-06-30) into a new sibling `applySupersedeMutex`, driven by a declarative `supersedes` field on the `market-watcher-eod` slot, wired into `cowork-match-slots.js`'s `finish()` — eliminates the double-spawn in-script, deterministically. SECONDARY fast-follow (router-flagged): add the missing trailing pathspec to both bare commit call sites — independent defect, exposes market-watcher commits to any concurrent peer. Rejected a split-notebook-file option (breaks a real single-file consumer, `fb-market-poster/flow/daily.md`) and a write-level-mutex-only option (OVERWRITE-class semantics mean it still loses content, just deterministically). Flagged alert-commander-market/critical as a same-shape but lower-severity (APPEND-class notebook) residual risk — awareness only, no action requested.

**Signal dropped:** `docs/signals/2026-08-14-market-watcher-eod-offhours-notebook-collision.json` → agent-father

---

## 2026-08-14T19:01:07Z

**Brief:** `docs/architecture-briefs/2026-08-14-auditor-write-plane-divergence-root-cause.md`

SPIKE-AUDITOR-WRITE-PLANE-DIVERGENCE-ROOT-CAUSE (PO-triaged, 10 occurrences/6 sub-shapes). ROOT CAUSE confirmed file:line: `scripts/auditor-notebook-commit.sh`'s AC-4 pre-commit backstop, meant to catch a fabricated `[OUTPUT-CONTRACT]` line before it commits, is structurally unreachable dead code since the 2026-08-06 durability reorder made `flow/main.md` commit the notebook BEFORE that line is ever computed, and the line is only ever pasted into RETURN, never the notebook (live-confirmed: notebook HEAD has zero `OUTPUT-CONTRACT` occurrences). Independently forensically confirmed (new evidence) at least 4/10 occurrences are "emit script never invoked": `docs/data/auditor-output-contract-violations.json` (29 real entries, proves the script DOES catch this shape when run) has zero entries for 3 occurrences after its last 04:18:13Z entry; a surviving orphaned marker file (`.auditor-cycle-markers-2026-08-13T12:00Z.tmp`) matching a catalogued occurrence has bookkeeping lines but zero `[emit-signal]` lines. Fix: additive Step 2b in `auditor-notebook-commit.sh` (new optional `--markers-file`/`--cycle-tag` args, both already in scope at the flow's existing call site) cross-checks the notebook's own mandated "Anomalies: N new" line against a real markers-file emit count, REFUSES the commit on mismatch — reuses the proven 7/7 SendMessage-resume mitigation rather than trading for `FIX-AUDITOR-SELF-COMMIT-STEP-NEVER-FIRES`. Disposed all 9 adjacent open rows — none subsumed, none to close.

**Signal dropped:** `docs/signals/2026-08-14-auditor-write-plane-divergence-root-cause.json` → agent-father

---

## 2026-08-14T19:09:30Z

**Brief:** `docs/architecture-briefs/2026-08-14-wire-notebook-compose-actuator-system-auditor-pilot.md`

FIX-AUDITOR-NOTEBOOK-COMPOSE-ACTUATOR-BUILT-TESTED-NEVER-WIRED (P0, PILOT system-auditor only). Wires the already-built/tested `scripts/notebook-compose.sh` (zero callers 8 days after landing — 2 prior signal-only handoffs both filed to `processed/` with no board row, neither landed) into system-auditor's notebook write: AC-1 one scripted-actuator call replacing the freehand compose ladder; AC-2 Bash-allowlist grant (the specific prior-attempt failure mode PO flagged); AC-3 `c<NNN>` derived in `main.md`'s own bash per PO ruling (script itself untouched); AC-4 concurrent-tier race closed via already-valid `task_kind="commit-mutex"` under a dedicated `task_id` — zero dependency on the BLOCKED `FIX-NOTEBOOK-WRITE-TASK-KIND-ENUM-EXTENSION` chain, matching PO's stated preference; AC-5 separate data-repair commit (fresh evidence this cycle: `c31626·18:20Z` still sits below `c99`/`c98`, defect live and ongoing, not historical); AC-6 hardens the dead marker reaper (14 stale `.tmp` now, up from 13) with a fail-loud empty-`FIRE_TICK` guard + a real per-cycle trace. Success Signal 3 replaced with a runtime-execution proof (script's `OK` marker embedded in a committed git message) per PO ruling, not a doc-grep. Routes through the existing tracked board row, not a fresh handoff — that exact "processed/ signal, no board row" shape is the second-order defect this task exists to close.

**Signal dropped:** `docs/signals/2026-08-14-wire-notebook-compose-actuator-system-auditor-pilot.json` → agent-father

---

## 2026-08-15T11:21:35Z

**Brief:** `docs/architecture-briefs/2026-08-15-cowork-cron-registration-sibling-process-defer.md`

Router-dispatched: user's hand-authored defer note sat inert in the wrong file (`cron-detect-loop/register.md`, governs a different skill's 4 jobs). Root-caused the real bug: `cron-cowork-team/SKILL.md` Step 1a's fast path keys only on `owner_client_session`; two OS processes sharing one `$CLAUDE_CODE_SESSION_ID` (4 distinct `claude` processes confirmed live on this host via `ps` this session) both pass it and each independently local-`CronCreate`s, invisible to each other. Corrected the router's own evidence: `owner_session` is the MCP **server's** own process/boot diagnostic (`taskClaimTool.ts:25-30`), not a client-terminal discriminator — cannot resolve this; session-presence's "1 live row" is equally uninformative (per-session singleton by construction). New finding, flagged not fixed here: the same shared-UUID gap also defeats the P3 fire-election's RE-ENTRANT branch (leader-lock.md + dev-team + auditor tiers + router's own dispatch-claim hot path) — a double-dispatch correctness bug, recommended to PO as a separate follow-up given blast radius. Fix designed (agent-father's own `.md` zone, no MCP schema change): client-side `$PPID`+`lstart` fingerprint (empirically verified stable this session) stored in the existing marker's free-form payload, compared on Step 1a; mismatch → defer + WORK telegram, with a `heartbeat_at`-based self-heal so a genuinely-dead sibling doesn't permanently block re-arm. Rejected reintroducing the retired human "defer" convention as primary (would silently reverse P3's rationale) — kept as an explicit, narrowly-scoped fallback subsection instead.

**Signal dropped:** `docs/signals/2026-08-15-cowork-cron-registration-sibling-process-defer.json` → agent-father
