# agents-architect — Notebook

## 2026-08-14T07:56:51Z

**Brief:** `docs/architecture-briefs/2026-08-14-devteam-head-nextagent-write-coherence.md`

PO triage's `FIX-DEVTEAM-HEAD-NEXTAGENT-RESYNC-ON-REASSIGN` (in_progress-resident facet of the stale-`.head` family, 3 confirmed agent types: router DRS, pm ×2, architect). Designed WF-2b: a new `dev-team/main.md` check inserted between WF-2 and WF-3 that, unlike every other WF-N carve-out, never JUMPs away — it resyncs `.head.next_agent` to match the row's own current `next_agent` when they disagree (the row is authoritative, not `.head` — dispatcher-only mirror state, single reader), resets `resume_attempts` to 0 in the same write (prevents a WF-3 false-positive tripping on the first correct dispatch after a fix), and lets S2 dispatch the corrected agent the same tick. Row-lookup scoped to `in_progress[]`+`active_sprints[].tasks[]` only — proven safe regardless of the concurrently-landing WF-1d row's own order (a review/qa-resident row resolves empty either way, never double-fixed). Ruled memory-candidate (a) (per-flow-doc handoff sync) NOT warranted for pm/architect/router given WF-2b's zero-latency single-file fix; ruled pm's partial `.head` write (commit `95540b50d`, status-flip only) needs its own narrow companion (different malformed shape/entry gate, WF-2b structurally can't catch it). Flagged 2 companion rows for PO to mint: `FIX-PM-NONCLOSEOUT-HEAD-RESET-INCOMPLETE-NULLOUT` (agent-father) + `FIX-DEVTEAM-HEAD-NEXTAGENT-COHERENCE-VERIFY` (developer).

**Signal dropped:** `docs/signals/devteam-head-nextagent-write-coherence-20260814.json` → agent-father

---

## 2026-08-14T12:54:30Z

**Brief:** `docs/architecture-briefs/2026-08-14-pm-decompose-closeout-reachability-and-nextagent-mint.md`

3rd-occurrence, escalated pm-decomposition defect: Step 4c's head-release fix sits AFTER Step 3c's own inlined RETURN in the same unbroken numbered-step family — unreachable by construction, not by omission. Fix restructures in place (move 3d/4c content above the RETURN as new 3d/3e, relocate the genuinely-later 4/4b under a new explicit heading) rather than appending — per the row's own caution against repeating occ-2's failure shape. Also designed: explicit `decomposition_complete` flag driving closeout(`done[]`+`.children`)-vs-partial(row `next_agent` corrected) branching; `next_agent` as a conditional-mandatory mint-time field (doc note + staged WARN-tier write-gate, not a hard reject); a narrow RLC cowork-lane exclusion predicate — deliberately NOT a reuse of DRS's ratified allowlist, which would have silently blocked agent-father's 17 live `ready[]` rows (confirmed via live census, not assumed). 39-file fleet sweep for the RETURN-reachability shape found pm the sole current occurrence. Found and reconciled an undersold overlap with `FIX-DEVTEAM-EPICWRAPPER-PARENTHOOD-FIELD-DRIFT-AUTOCLOSE-BLIND`'s write-side scope (same file, same edit site) — flagged for PO to narrow that row to READ-side only. `docs/data/orch/orch-state.json` board mutations (3 follow-up rows to mint + 1 scope-narrowing edit) left to PO/agent-father — outside this agent's declared commit zone.

**Signal dropped:** `docs/signals/2026-08-14-pm-decompose-closeout-reachability-and-nextagent-mint.json` → agent-father

---

## 2026-08-14T16:25:04Z

**Brief:** `docs/architecture-briefs/2026-08-14-market-watcher-eod-offhours-notebook-collision.md`

Router-dispatched (RAW-verified, not self-reported): `market-watcher-offhours` (`0 */4 * * *`) and `market-watcher-eod` (`0 16 * * 1-5`) structurally collide every weekday 16:00 UTC, both full-overwriting `docs/agent-memory/notebooks/market-watcher.md`. Independently re-confirmed this cycle: EOD's own 2026-08-14 notebook entry is permanently lost (git log's latest entry is offhours' own commit `23eed1755`); commit `6cfdfb227` (claims "EOD notebook") actually touched only `news-scout.md` — a bare `git_commit_retry` with no trailing pathspec swept a concurrent peer's change (RULE 2.5 / commit-mutex Step 2c violation, confirmed live in both `eod.md` Step D and `cycle.md`'s offhours self-commit). The existing 2026-08-06 `market-watcher-notebook:main` mutex only guards the git-commit step, not the raw `Write()`, so it can't prevent this. PRIMARY fix: generalize the already-shipped, proven CHEF same-tick mutex (`applyChefMutex`/`cowork-chef-mutex.js`, live since 2026-06-30) into a new sibling `applySupersedeMutex`, driven by a declarative `supersedes` field on the `market-watcher-eod` slot, wired into `cowork-match-slots.js`'s `finish()` — eliminates the double-spawn in-script, deterministically. SECONDARY fast-follow (router-flagged): add the missing trailing pathspec to both bare commit call sites — independent defect, exposes market-watcher commits to any concurrent peer. Rejected a split-notebook-file option (breaks a real single-file consumer, `fb-market-poster/flow/daily.md`) and a write-level-mutex-only option (OVERWRITE-class semantics mean it still loses content, just deterministically). Flagged alert-commander-market/critical as a same-shape but lower-severity (APPEND-class notebook) residual risk — awareness only, no action requested.

**Signal dropped:** `docs/signals/2026-08-14-market-watcher-eod-offhours-notebook-collision.json` → agent-father

---

## 2026-08-14T19:01:07Z

**Brief:** `docs/architecture-briefs/2026-08-14-auditor-write-plane-divergence-root-cause.md`

SPIKE-AUDITOR-WRITE-PLANE-DIVERGENCE-ROOT-CAUSE (PO-triaged, 10 occurrences/6 sub-shapes). ROOT CAUSE confirmed file:line: `scripts/auditor-notebook-commit.sh`'s AC-4 pre-commit backstop, meant to catch a fabricated `[OUTPUT-CONTRACT]` line before it commits, is structurally unreachable dead code since the 2026-08-06 durability reorder made `flow/main.md` commit the notebook BEFORE that line is ever computed, and the line is only ever pasted into RETURN, never the notebook (live-confirmed: notebook HEAD has zero `OUTPUT-CONTRACT` occurrences). Independently forensically confirmed (new evidence) at least 4/10 occurrences are "emit script never invoked": `docs/data/auditor-output-contract-violations.json` (29 real entries, proves the script DOES catch this shape when run) has zero entries for 3 occurrences after its last 04:18:13Z entry; a surviving orphaned marker file (`.auditor-cycle-markers-2026-08-13T12:00Z.tmp`) matching a catalogued occurrence has bookkeeping lines but zero `[emit-signal]` lines. Fix: additive Step 2b in `auditor-notebook-commit.sh` (new optional `--markers-file`/`--cycle-tag` args, both already in scope at the flow's existing call site) cross-checks the notebook's own mandated "Anomalies: N new" line against a real markers-file emit count, REFUSES the commit on mismatch — reuses the proven 7/7 SendMessage-resume mitigation rather than trading for `FIX-AUDITOR-SELF-COMMIT-STEP-NEVER-FIRES`. Disposed all 9 adjacent open rows — none subsumed, none to close.

**Signal dropped:** `docs/signals/2026-08-14-auditor-write-plane-divergence-root-cause.json` → agent-father
