# Decision Journal — Sprint UC-DTL-P2 · qa

**Sprint goal:** ULTRACODE-AUDIT-FIXALL task UC-DTL-P2 — DJ-GATE-1 independent RAW-verify of the
cold-eviction backstop relocation (post-cycle.md Step 4.2 → tick-preflight.sh Step 5.5).
**Agent:** qa
**Started:** 2026-07-15

---

### STEP qa-S1 · qa · 2026-07-15
**task-id:** UC-DTL-P2
**what-done:** RAW-verify against `docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md`
(dev-team-loop-P2, L434-444), not the router's paraphrase (which incorrectly said "all 4 paths" —
the brief's Verifier note L444 explicitly requires SKIP/ERROR to NEVER fire). Ran both target suites
RAW: `dev-team-tick-preflight.test.sh` → 89 passed / 0 failed (55 baseline + 34 new T21-T31, matches
dev claim). Read `run_preflight()` source directly (scripts/agents-flow/dev-team-tick-preflight.sh:419-500):
confirmed `_step55_board_hygiene` call sits at line 489 — structurally AFTER every ERROR `return`
(L423, L447, L469) and every SKIP `return` (L453, L476), and BEFORE both `_emit_verdict` calls
(RUN-IDLE L492, RUN L497). This is a genuine choke-point (unreachable-by-construction on SKIP/ERROR,
not gated by an extra conditional) — matches T21/T23 (RUN/RUN-IDLE fire when tripped),
T25/T26/T27/T28 (SKIP(a)/SKIP(b)/ERROR(SF-1)/ERROR(fire-election) never fire even against the SAME
tripping fixture `orch-hygiene-trip-notidle.json`) — all 6 read PASS in the RAW run. Confirmed test
harness (`dev-team-tick-preflight.test.sh:48,84,133-144`) overrides `mcp_call` + all 3 Step-5.5
side-effect seams (`_step55_run_cold_evict`/`_step55_run_validate`/`_step55_git_commit_evict`)
wholesale — zero live-repo shell-outs during the suite (T29-T31 additionally exercise mutex-contention
/ cold-evict-failure / validate-failure degrade paths, all non-blocking per post-cycle.md's own
"do not block cycle exit" contract). Diffed threshold predicate: `_step55_board_hygiene` jq (script
L334-351) is line-for-line identical to the pre-relocation `post-cycle.md@83e0578ea^:L41-51`
(TERMINAL_SPRINT_N / SPRINT_GOAL_TERMINAL_N / DONE_N / DV_N, same TERMINAL_SET, same `startswith("BCTC-")`
carve-out) — no behavior lost in the port. post-cycle.md Step 4.2 (current HEAD) reads as a CANON-SCRIPT
spec pointer (L43-96) with the identical bash block retained as documentation-of-record. Invariants:
`_step55_git_commit_evict` uses explicit pathspecs only (`git add "$ORCH_STATE_PATH" "$archive_path"` —
no `-A`/`-a`); `orch-cold-evict.sh` still routes its hot-file write through `orch-apply.sh` with the
named `ORCH_APPLY_ALLOW_SHRINK="orch-cold-evict.sh:scheduled-eviction"` bypass (script L657, unchanged
by this task); commit-mutex is claimed/released around the evict+validate+commit sequence
(`_step55_cold_evict_and_commit`, mutex_id="commit-mutex:main", matches `.claude/skills/commit-mutex/
SKILL.md` canonical id — an improvement over post-cycle.md's OWN pre-existing internal inconsistency,
a per-caller-slug comment vs. its own "Mutex contract" line naming `commit-mutex:main`; developer
journal documents this fix, I independently confirmed it's a correction not a regression). Regression:
`cowork-tick-preflight.test.sh` → 27/27 RAW; `context-bloat-backstop.test.sh` → 2/2 RAW; confirmed via
`git log` that context-bloat-backstop.{sh,test.sh} history (last touched by unrelated cap-recalibration/
debounce fixes) has zero overlap with the 3 commits under review (83e0578ea, 5cb56d425, a8e51b1f6) —
genuinely untouched. DJ-GATE-1 marker present at `sprint-UC-DTL-P2-developer.md:12`
(`**task-id:** UC-DTL-P2`). All 3 commits confirmed on `main`, ancestor of current HEAD, `origin/main`
in sync.
**what-considered:** Router dispatch prompt's own framing flagged the "all 4 paths" claim as a known
router error already corrected by the brief — verified this correction was actually honored by the
developer (it was: T25-T28 assert non-firing, not firing) rather than assuming the developer silently
matched the wrong spec.
**why-decision:** RAW numbers match claim exactly (89/89), selective-firing is structural (not
conditional) confirmed by direct source read at the exact line the developer's own journal cites,
no invariant regressed, regression suites green, unrelated suite confirmed unrelated by history, DJ-GATE-1
marker present. No defects found.
**why-change:** No change from plan — routine PASS, all 6 gate checks green.
**verdict:** PASS
