# Decision Journal — Sprint ULTRACODE-AUDIT-FIXALL · qa

**Sprint goal:** Drain confirmed proposals from docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md
**Agent:** qa
**Started:** 2026-07-15T20:20:00Z

---

### STEP qa-S1 · qa · 2026-07-15T20:20:00Z
**task-id:** UC-RDL-P5
**what-done:** RAW-verified `git show aef457f38 -- CLAUDE.md` against all 5 ACs: pointer to
`.claude/skills/dispatch-claim/SKILL.md` exists and covers Step0a/A/A.5/B; Phase B `task_claim`
args (owner_client_session, ttl_seconds=600, task_kind="intent") preserved verbatim (reflowed
1-line, same content); 3-outcome table now includes the previously-missing re-entrant branch
(heartbeat+proceed, do NOT exit), matching SKILL.md:250-256; `redispatch_count<3` hardcode
confirmed dropped (grep clean); no semantic loss (orphan-adoption N_MAX + tree-hygiene DEFER +
presence-roster all reachable via SKILL pointer). DJ-GATE-1: developer journal entry present
(sprint-ULTRACODE-AUDIT-FIXALL-developer.md STEP developer-S1). Verdict: APPROVED.
**what-considered:**
- Treat line-wrap-only reflow of task_claim call as a drop — rejected: byte-for-byte token
  content identical once newlines/indentation collapsed to spaces, no arg removed/altered.
- Require bun test/tsc — rejected: doc-only change (CLAUDE.md), zero apps/ code touched, Smart-Skip
  N/A category confirmed by task scope (git diff --stat shows CLAUDE.md only).
**why-decision:** All 5 brief ACs independently RAW-confirmed against the actual diff, not the
developer's self-report; re-entrant branch (the core bug) is present and matches canonical SKILL.
**why-change:** No change from plan — routine pass, all checks green.

### STEP qa-S2 · qa · 2026-07-16T00:45:00Z
**task-id:** UC-CDC-P2
**what-done:** RAW-reproduced `cowork-guaranteed-slot-firer.test.sh` — 28 passed, 0 failed (baseline
25/25); read T13 block (test.sh:200-218) — confirms stub matcher emits `cadence skip: ... >&2` +
valid stdout JSON in one invocation, asserts exit=0, `slot=chef-eod` fires, and no false "non-JSON
output" logged. Clean-JSON-stdout proof: `.sh:191-198` — `slot_err=$(mktemp)`;
`raw=$(eval "$SLOT_MATCHER_CMD" 2>"$slot_err")` captures stdout only; error path (rc!=0) surfaces
`cat "$slot_err"` in the log message, else `rm -f "$slot_err"`; only `raw` feeds
`jq -c '[.slots[]? | select(.guaranteed == true)]'` at `.sh:200` — stderr cannot reach the parse.
shellcheck on `.sh`: rc=0 clean. `.test.sh` shellcheck: SC1091 (info, line 74) + SC2034 (warning,
line 193) — diffed against `git show HEAD~2:...test.sh` output, byte-identical finding set at the
same lines — pre-existing, not introduced. Premise cross-check: `log(){ ... | tee ... }` (L97) is
called as a bare statement everywhere in the file (`grep '\$(log '` → 0 hits) — never wrapped in a
command substitution, so it cannot feed any jq/JSON parse; the real bug was solely the matcher-eval
capture (old L183, now L192), matching the architecture brief and the developer's premise-correction
over the router's L97 paraphrase. Diff-scope check: `git show 02ba4a635` — both hunks are additive,
confined to `run_firer`'s matcher-capture block (mktemp/redirect/log-message lines); the
`for i in $(seq 0 $((count-1)))` slot-iteration loop, cadence logic, and `_fire_one_slot` calls are
byte-identical, untouched. Dev DJ-GATE-1 marker confirmed: `git show 32c9d1847:...developer.md` —
`STEP developer-S3`, `task-id: UC-CDC-P2` present. Verdict: **PASS**.
**what-considered:**
- Trust the developer's self-reported 28/28 tally without RAW-reproducing — rejected per gate
  mandate (self-reported numbers are never sufficient); ran the suite myself, tallier line matches.
- Flag the 2 `.test.sh` shellcheck findings as new debt — rejected: identical finding set (same
  rule IDs, same line numbers) present on `HEAD~2` before this task's commits; unrelated pre-existing
  debt, out of scope for this gate.
**why-decision:** Every acceptance criterion independently RAW-reproduced against the live diff and
live test run, not the commit-message claims; the fix is minimal, additive, and correctly targets the
matcher-capture site the brief names (not the router's L97 paraphrase the developer already
corrected in their own journal).
**why-change:** No change from plan — all 7 router-specified checks passed on first RAW pass.
