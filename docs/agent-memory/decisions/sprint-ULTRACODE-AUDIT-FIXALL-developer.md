# Decision Journal — Sprint ULTRACODE-AUDIT-FIXALL · developer

**Sprint goal:** Drain confirmed proposals from docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md
**Agent:** developer
**Started:** 2026-07-15T18:15:50Z

---

### STEP developer-S1 · developer · 2026-07-15T18:15:50Z
**task-id:** UC-RDL-P5
**what-done:** Replaced CLAUDE.md:7-26 (20L condensed Phase A/A.5/B pseudocode) with an 8-line pointer to
`.claude/skills/dispatch-claim/SKILL.md` + Phase B `task_claim` call + a 3-row outcome table
(claimed / re-entrant same-session / peer-collision), commit `aef457f38`.
**what-considered:**
- Rewrite the table with 2 outcomes (claimed/peer) matching the OLD prose — rejected: the brief's whole
  point is the missing re-entrant branch was the bug; a 2-row table reproduces the same defect.
- Move Phase A/A.5 detail inline in a shorter form vs pure pointer — rejected: brief explicitly says
  "shrink to a pointer"; inline detail duplicates the canonical SKILL and re-creates the drift the P4
  sibling proposal (sprint-task:/task: prefix) already flagged as a duplication class.
**why-decision:** Brief's exact replacement text + SKILL.md:250-256 re-entrant pattern (heartbeat+proceed,
do NOT exit) is the authoritative source; table format keeps all 3 outcomes scannable while the pointer
carries Step 0a/Phase A/A.5 detail without re-duplicating it in always-loaded CLAUDE.md context.
**why-change:** No change from plan — applied brief's spec verbatim, kept owner_client_session/ttl/
task_claim contract and peer-EXIT wording intact per brief's risk note.

### STEP developer-S2 · developer · 2026-07-15T20:05:54Z
**task-id:** UC-DTL-P2
**what-done:** Added Step 5.5 board-hygiene to `dev-team-tick-preflight.sh` (relocates post-cycle.md
Step 4.2 cold-eviction so it runs on every lock-winning tick); 34 new tests, 89/89 GREEN.
**what-considered:** Router paraphrase named the wrong script (context-bloat-backstop.sh — unrelated
file-line-cap governance) and asked for SKIP/ERROR firing, which the brief's own verifier explicitly
forbids (peer already owns hygiene on SKIP; lock state undefined on ERROR).
**why-decision:** Followed the architecture brief (authoritative "full acceptance criteria" source
per the dispatch prompt) over the router's paraphrase — full reasoning in
`docs/agent-memory/decisions/sprint-UC-DTL-P2-developer.md`.
**why-change:** Corrected target script + scoped firing to RUN/RUN-IDLE only (documented deviation).

### STEP developer-S3 · developer · 2026-07-15T22:26:00Z
**task-id:** UC-CDC-P2
**what-done:** Ported the mktemp stderr-separation idiom into `cowork-guaranteed-slot-firer.sh:183`
run_firer (`raw=$(eval "$SLOT_MATCHER_CMD" 2>&1)` -> `2>"$slot_err"` mktemp file); added T13 regression
(stderr diagnostic + valid stdout JSON, guaranteed slot still fires); 28/28 GREEN, shellcheck clean.
**what-considered:** Router's inline text pointed at `log()`'s `tee` (line 97) as root cause; the
linked architecture brief (cowork-dispatcher-cron-P2, Verifier-confirmed w/ 34 live "non-JSON output"
log errors incl. a missed chef-eod slot) names line 183's `SLOT_MATCHER_CMD` capture instead.
**why-decision:** Followed the brief (authoritative, evidence-verified) over the router's paraphrase —
`log()`'s tee never feeds a command-substitution JSON parse in this file, confirmed by grep audit; the
`2>&1` on the matcher eval is the only real stdout/stderr merge point feeding `jq` in this script.
**why-change:** Fixed line 183 (not line 97) — same bug class, correct location; no new pattern invented.

### STEP developer-S4 · developer · 2026-07-16T00:00:00Z
**task-id:** UC-CDC-P3
**what-done:** Added `isSuppressedByBoundaryDedup()` (reuses `snapToCronBoundary`, no 2nd boundary
impl) to `cowork-match-slots.js`; applied via one shared `legacyCandidates()` helper at both legacy
return points (pure-legacy branch L134-146 + cadence-unavailable fallback L155-166) — single SSOT
inherited by dispatcher/preflight/firer (all 3 invoke this same script unmodified, confirmed by grep).
Backward-compat preserved: `last_fired==null`/malformed → never suppressed (fires). 10 new tests
(TC-15..19 legacy dedup via matchSlots + TC-20..23 direct unit tests on the helper); full suite
26/26 GREEN; adaptive-mode tests (TC-9..14) unchanged and still pass. Corrected the false R3
"lock persists across ticks" rationale in `slot-claim.md` (real mechanism = last_fired boundary
dedup + published marker; the per-slot claim is released via try/finally right after each spawn).
**what-considered:** Extending the dedup to the null-`policy_id` fallthrough inside true adaptive
mode (~L184-191, pressureState/policyObj/cadence-module all live) — rejected: detail_ref's *Change*
section scopes the fix strictly to "legacy branch (lines 134-145)" and cites the adaptive path's
first-run precedent as the model to *preserve*, not extend; task's own hard constraint ("do NOT
change adaptive-mode behavior") governs, and that fallthrough only runs when adaptive mode is
genuinely active (not a fallback).
**why-decision:** Router's paraphrase additionally named L155-165 (cadence-unavailable fallback) and
L184-187 (null-policy_id fallthrough) as part of the bug. Detail_ref (authoritative) names only
L134-145. L155-165 is a textually-identical duplicate of the legacy branch (same bug, reached only
when `require('./cadence-policy.js')` throws — not "adaptive behavior"), so fixing it via the shared
helper stays SSOT-aligned without contradicting detail_ref. L184-187 sits inside genuine adaptive
evaluation — left unchanged per the explicit adaptive-mode-unchanged constraint; detail_ref does not
scope there either. Also applied the detail_ref's explicit slot-claim.md correction even though the
router's paraphrase said "likely none" for doc updates — detail_ref is authoritative on that file.
**why-change:** No scope change from detail_ref for the core fix; added the doc correction detail_ref
calls for that the paraphrase missed.

### STEP developer-S5 · developer · 2026-07-16T01:01:31Z
**task-id:** UC-CCA-P5
**what-done:** Reordered `docs/agents/news-scout/flow/stage-log-notify.md` to notebook settled-write
(Step 4) -> exec-proof gate (Step 5) -> log_agent_work open/close (Step 6) -> coverage-state (Step 7)
-> WORK ping (Step 8), renumbering away the old 3e/4/4b labels; commit `181a16142`.
**what-considered:**
- Leave coverage-state (Step 7) before the gate to mirror market-watcher exactly — rejected: brief's
  own *Change* spec places it after the log_agent_work pair and calls the market-watcher-vs-here
  difference a harmless deviation; matching the brief's exact stated order over-rides the sibling's
  ordering since the brief text is the authoritative acceptance criteria for this task.
- Drop the log_agent_work "running" open call or relocate it earlier in the cycle — rejected: out of
  scope; the open/close pair must stay adjacent (close needs the open call's returned log_id) and
  moving only the pair (not splitting it) satisfies the required order with a minimal diff.
**why-decision:** exec-proof-gate SKILL.md EP-1/EP-2 reads NOTEBOOK_TS from the newest `## cNNN` heading
and requires it `>= CYCLE_START_UTC`; with the gate before the write this was structurally
unsatisfiable (always the prior cycle's timestamp) — moving the settled-write first makes EXEC_PROOF_1
checkable and closes the false-completion race where log_agent_work(completed)+WORK ping could fire
before the notebook existed for this cycle.
**why-change:** No change from plan — cycle.md required zero edits (no internal order declared there,
confirmed by full read); only stage-log-notify.md touched, no scripts/ copy of this sequence exists.

### STEP developer-S6 · developer · 2026-07-16T07:48:07Z
**task-id:** UC-ASL-P1
**what-done:** run_tiered_probe() reads tier-N heartbeat BEFORE run_probe("suppress_heartbeat") (new
flag param); main.md end-of-cycle adds tmp+mv heartbeat write for tier 2/3. T16/17/20/22 pre-seed
fixtures; T31/32 added (stale/never→SPAWN). 91/91 GREEN.
**what-considered:**
- HEARTBEAT_FILE=/dev/null — rejected: mktemp targets /dev/null.tmp.*, fails non-root, opposite bug.
- Leave T16/17/22 unchanged — rejected: no self-write means 2nd call regresses to SPAWN.
**why-decision:** Verifier's 4 caveats load-bearing (flag trap, test regression, register.md no-op,
TE-T06 non-collision) — followed verbatim; Write not Edit, diff-verified.
**why-change:** No change from plan.
