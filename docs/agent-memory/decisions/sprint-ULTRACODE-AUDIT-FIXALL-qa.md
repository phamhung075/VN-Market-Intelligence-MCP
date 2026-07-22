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

### STEP qa-S3 · qa · 2026-07-16T01:20:00Z
**task-id:** UC-CDC-P3
**what-done:** RAW-reproduced all 8 required checks against commit `91d61fbe4` (HEAD, unpushed).
(1) `node scripts/agents-flow/cowork-match-slots.test.js` → **26/26 passed, 0 failed** (baseline
16, all TC-1..23 labels enumerated, no skips). (2) TC-15..19 assert legacy-dedup THROUGH `matchSlots`
itself (not only the helper): last_fired AT boundary (02:15:00Z) → 0 results (suppressed); AFTER
boundary same tick (02:15:20Z) → 0 results (suppressed); BEFORE boundary (02:00:00Z, prev tick) → 1
result, slot_id matches (fires); `null` → 1 result (fires, EC-3); malformed `"not-a-date"` → 1 result
(fires, conservative) — matches spec exactly; TC-20..23 additionally unit-test
`isSuppressedByBoundaryDedup` directly. (3) `git show 91d61fbe4 --stat` → exactly 4 files, **zero
`.sh` files touched**; grep of the 3 callers (`match-slots.md:23`, `cowork-tick-preflight.sh:64`,
`cowork-guaranteed-slot-firer.sh:91`) shows each only constructs
`SLOT_MATCHER_CMD="${SLOT_MATCHER_CMD:-node .../cowork-match-slots.js}"` (or, for match-slots.md,
directly invokes the same script) — no caller has its own `last_fired`/boundary logic; all inherit
the matcher's SSOT. (4) Adaptive-path diff-scope check: `git show 91d61fbe4` on the .js file has
exactly 6 hunks — header comment, `isSuppressedByBoundaryDedup`+`legacyCandidates` insertion, the two
legacy-return-point swaps, `nowUnix` relocation, and the `module.exports` line; the adaptive
`evaluateCadence`/cadence-due-check body (~L207-267, incl. the null-`policy_id` fallthrough) has NO
hunk touching it. TC-9..14 (snapToCronBoundary units + adaptive matchSlots) all PASS in the same run
with identical assertions as pre-fix. (5) `isSuppressedByBoundaryDedup` body calls
`snapToCronBoundary(nowUnix, cron)` directly (cowork-match-slots.js:103) — no second boundary
implementation exists. (6) `bash scripts/agents-flow/cowork-tick-preflight.test.sh` → **27 passed, 0
failed**; `bash scripts/agents-flow/cowork-guaranteed-slot-firer.test.sh` → **28 passed, 0 failed** —
both match spec exactly, callers unaffected. (7) Read `slot-claim.md` post-diff + the "Release" note
(L76-77 of the doc: "called after each spawn attempt (success OR failure) via try/finally... 180s TTL
auto-frees after job completes") — the corrected text ("does NOT provide cross-tick dedup... real
mechanism = last_fired boundary dedup + published-marker gate downstream") is internally consistent
with this Release note; the correction is accurate, not a new misstatement. (8) DJ-GATE-1: grep-
confirmed `STEP developer-S4` + `**task-id:** UC-CDC-P3` in
`sprint-ULTRACODE-AUDIT-FIXALL-developer.md`. tsc/mock-guard: **N/A, explicit** — `tsconfig.json`
`include` is `["src/**/*", "*.ts"]` only; `scripts/agents-flow/*.js` is a plain Node script outside
the tsc-checked app and outside the bun-test/mock-guard surface (own `.test.js` harness via plain
`node`, not `bun test`). Verdict: **PASS**.
**what-considered:**
- Trust the developer's self-reported "26/26, 27/27, 28/28" tallies without RAW-running — rejected
  per gate mandate; ran all three suites myself, every tally matches exactly.
- Treat the `.sh`-file caller inheritance claim as satisfied by reading only the developer's journal
  prose — rejected; independently grepped all 3 callers to confirm none has a parallel
  `last_fired`/boundary implementation of its own.
**why-decision:** Every one of the 8 router-specified checks was independently reproduced against the
live commit diff and live test runs (not the commit message or developer journal claims); the fix is
correctly scoped to only the 2 legacy return points, reuses the existing boundary helper (no
duplication), leaves the adaptive path's diff-hunks empty (confirmed via `--stat` hunk count), and the
doc correction is verifiably true against the Release note in the same file.
**why-change:** No change from plan — all 8 checks passed on first RAW pass.

### STEP qa-S4 · qa · 2026-07-16T07:50:00Z
**task-id:** UC-ASL-P2
**what-done:** RAW-ran `emit-audit-signal.test.sh` 6x (48/48 every time) + `context-bloat-backstop.test.sh`
(2/2); AC-1/2/4/5/6 all confirmed via diff-review + live grep. Found AC-3 BLOCKING regression: script:232
feeds `--category-type` (`data_stale`/`db_integrity_breach`) into `post_agent_signal`'s `signal_type` arg,
a closed Zod enum (agentSignalStore.ts:39-50) that does NOT contain either value — live-probed via real
gateway call, confirmed `MCP error -32602 invalid_enum_value`; then ran the real (unmocked) script against
a scratch orch-state copy with main.md's exact site-1 args — `ABORT e1-failed`, signal_queue.rows
count unchanged (2→2), proving E-3 never reached. Sites 3/4 (`--e3-only`) and tier1-probe.md sites 5/6
(`signal_feedback`, valid enum member) unaffected. Root cause: FR-2/architect-design-1 conflated the E-3
row's free-form `type` field with E-1's enum-constrained `signal_type` arg; legacy code hardcoded
`signal_feedback` for E-1 precisely to avoid this. Verdict: **CHANGES_REQUESTED**.
**what-considered:**
- Trust the 48/48 mocked-harness green as sufficient for AC-3 — rejected: `mcp_call()` is stubbed to
  always succeed regardless of `signal_type`, structurally blind to a real enum-validation rejection;
  ran the real transport instead (2 independent live calls: raw probe + full unmocked script run).
- Treat as a developer implementation bug routed straight to fixer only — rejected the "fixer-only"
  framing: root cause is FR-2's own literal wording, faithfully implemented; flagged to both fixer
  (bounded mechanical fix) and architect (spec correction) so the record doesn't re-teach the same bug.
**why-decision:** Static enum read + one live gateway call + one live full-script dry-run (3
independent, corroborating checks) proves sites 1/2 lose 100% of their signal-queue rows + Telegram
alerts in production — a severe availability regression the sprint exists to prevent, not caught by
the (correctly-scoped, network-free) mocked test suite.
**why-change:** Escalation beyond routine — found a P0 blocking defect the mocked harness cannot see;
did not promote board, did not touch orch-state.json/.head, did not push.

### STEP qa-S5 · qa · 2026-07-16T08:24:00Z
**task-id:** UC-ASL-P2
**what-done:** RE-GATE round 2 of fixer commit f1bcf63a3 (line 232 -> hardcoded "signal_feedback").
RAW-ran both harnesses (49/49, 2/2); ran the LIVE unmocked script against the real gateway + live
orch-state.json with both regressed category-types (data_stale, db_integrity_breach) via --no-telegram
-> both OK, E-3 row appended, independently read-back-verified, then cleaned up via orch-apply.sh
(git diff empty post-cleanup, conservation preserved). Re-confirmed AC-1..AC-6 + DDD/injection re-check.
**what-considered:**
- Trust the fixer's own RAW-verification claim (dispatcher head note) as sufficient — rejected: the
  exact defect class (mock blind spot) that caused round-1's bug is the reason a second independent
  live repro is mandatory, not optional, per dispatch instructions.
- Reuse a scratch orch-state.json copy for E-3 (round-1 style) vs write+cleanup on the live file —
  chose live file + cleanup: proves the production write path end-to-end (orch-apply.sh CAS+
  conservation+read-back), not just the E-1 transport; dispatcher's own guardrail text anticipated
  this ("clean up any test signal rows you create").
**why-decision:** 2 independent live invocations (data_stale + db_integrity_breach) both succeeded with
zero ABORT markers, row read-back confirmed both times, sanity-reconfirmed the enum is still genuinely
closed (raw call still rejects), and cleanup left orch-state.json byte-identical to pre-repro state —
this is the decisive, non-mockable proof the round-1 defect is closed.
**why-change:** No change from plan — fix matched recommended option (a) exactly; all checks green.

### STEP qa-S6 · qa · 2026-07-16T09:58:00Z
**task-id:** UC-ASL-P1
**what-done:** Independently re-ran `auditor-tier1-probe.test.sh` (91/91 green); RAW-diffed
ba1524e9f — confirmed `suppress_heartbeat` is a real positional-arg flag (not
`HEARTBEAT_FILE=/dev/null`), `run_tiered_probe()` reads `pre_existing_lh` before calling
`run_probe("suppress_heartbeat")`, system-auditor/flow/main.md end-of-cycle authors the tier-2/3
heartbeat (tmp+mv, gated `AUDIT_TIER∈{2,3}`), T31/T32 exercise the previously-dead
stale-heartbeat→SPAWN branch. No process.env/secrets/eval-of-external-data/unquoted expansion.
**what-considered:**
- register.md (cron-detect-loop) — confirmed no edit needed: exit-code/JSON contract unchanged
- commit scope — diffed e3f2b5a94..f691ad44d: exactly 7 files, zero overlap with 109 pre-existing dirty peer files
**why-decision:** All 4 mandated caveats verified against RAW diff, not summary; dead branch now reachable (T31/T32 pass on real code path).
**why-change:** no change from plan — APPROVED.

### STEP qa-S7 · qa · 2026-07-16T16:07:38Z
**task-id:** UC-CRITIC-GATEWAY-CONTRACT-DRIFT
**what-done:** RAW-verified fixer commit `2ec39e96c` (mechanical doc-only rename
`mcp__claude_ai_gateway__` -> `mcp__gateway__` across 8 files). (1)
`grep -rn claude_ai_gateway` over all 8 target files (gateway-call-contract.md, mcp-tools.md,
task-lock-protocol.md, guide-agent-definition-frontmatter.md, REQ_DYN-WF-FOUNDATION.md,
quality-checklist.json, .claude/skills/task-lock/SKILL.md, tran-ngoc-bau/flow/bootstrap.md) ->
exactly 1 hit: `gateway-call-contract.md:16` (`- \`server\` MUST be exactly \`"vn-market"\` — NOT
\`"claude.ai gateway"\` / \`"claude_ai_gateway"\` / ...`) — confirmed by direct read this is the
bad-server-VALUE exclusion list for the `server=` argument, NOT a tool-prefix, correct to keep
verbatim. (2) `jq empty docs/data/quality-checklist.json` exit 0. (3)
`git show --name-only --format= 2ec39e96c | grep -E '^(apps|packages|scripts)/'` -> zero matches,
confirmed doc-only (9 files touched, all under docs/ or .claude/skills/, incl. the fixer's own
decision doc). (4) Read `gateway-call-contract.md` L10-20 directly — L13 now shows the canonical
`mcp__gateway__call_tool(server="vn-market", tool="<bare_name>", arguments={...})` block. All 4
validations PASS.
**what-considered:**
- Trust the fixer's self-reported "8/8 files clean" claim as sufficient — rejected: RAW-verify
  standing rule, ran the literal grep/jq/git-show myself against the current file contents, not
  the fixer's summary.
- Whether the surviving `claude_ai_gateway` hit at L16 was itself a residual drift bug — rejected
  after reading full context: it's a deliberately-listed bad server-STRING value (paired with
  `vnmarket`/`vn_market`), not the tool-prefix drift this task existed to fix; removing it would
  delete a legitimate guard, not close a gap.
- Promote via one combined orch-apply.sh transform (lane move + both heads + 2 SPIKE note edits)
  vs 3 sequential calls — chose one transform: single CAS window, single conservation check,
  fewer race opportunities on the hot file.
**why-decision:** Grep/jq/git-show output matched the gate's EXPECTED values exactly (1 line,
exit 0, 0 code paths); no residual `claude_ai_gateway` tool-prefix anywhere in the 8-file set.
**why-change:** No change from plan — promoted `UC-CRITIC-GATEWAY-CONTRACT-DRIFT`
`review[]`->`done_verified[]` (status=DONE_VERIFIED, qa_note/qa_verified_at/qa_verified_by added)
via `jq | scripts/orch-apply.sh` — validator PASS, conservation PASS (task_total live=542
candidate=542, signal_total 0=0). Both `.head` and `.task_board.head` set to matching idle shape
(status idle, active_task_id null, next_agent router). POST-SHIP PM-ACTION (pre-approved
architect+pm): struck the P9 bullet ("gateway tool-name drift in INV-GATEWAY-1") from
`UC-RDL-UNVERIFIED-BATCH`'s note (count 9->8 remaining proposals) and the P12 bullet ("fix stale
wrapper name in TNB bootstrap") from `UC-CCA-UNVERIFIED-BATCH`'s note (count 8->7 remaining
proposals) — both rows remain `type:SPIKE` in `backlog[]`, zero task rows removed, each note
annotated with a one-line struck-trail pointing at this commit. Did NOT push (router's job on
completion notification).

### STEP qa-S8 · qa · 2026-07-22T04:56:35Z
**task-id:** UC-SDF-P4
**what-done:** Direct-commit verify (mode=verify-committed, branch:null). Found+read diffs for
64cd7edf9/b087d30a0 (both merge-base ancestors of main); ran drain-signals.test.js 28/28 PASS;
mock-guard/DDD/secrets clean; live-checked docs/signals/processed/ (250 files) confirming mtime
fallback fires only when unstamped and correctly skips 2 pre-existing corrupted-JSON legacy files.
**what-considered:**
- Trust review_note prose ("15/15 pass", "1280==1280") — rejected: re-ran test + re-read raw diff.
- 10 unstamped files still present looked like a possible fix gap — investigated: 8 within 7d
  mtime window (expected), 2 unparseable (pre-existing corruption, both tools correctly skip).
**why-decision:** Diff matches remedy exactly (mtime fallback scoped to file-plane only, DB-plane
strftime compare byte-identical/untouched); tests green; live data confirms no over/under-prune.
**why-change:** No change from plan — moved `UC-SDF-P4` `qa[]`->`done_verified[]`
(status=DONE_VERIFIED, qa_verdict=APPROVED, commit=64cd7edf9,b087d30a0, completed_at/by backfilled
from commit author). `.head` reset idle, next_agent=pm. Did NOT push.

### STEP qa-S9 · qa · 2026-07-22T05:59:00Z
**task-id:** UC-GCP-P2
**what-done:** Direct-commit verify (mode=verify-committed, branch:null). Read git-ci-publish-P2
Change(a/b/c) from the audit brief; confirmed 476c331d4(.gitignore+drain-signals.md text)+
c34b7fcc9(actual rm --cached of signals.db+15 logs) both main-ancestors, diffs match exactly.
**what-considered:**
- Trust review_note's self-reported pathspec-commit bug story — rejected: independently diffed
  both commits' `--stat`/content, confirmed 476c331d4 alone left files tracked, c34b7fcc9 removed them.
- Risk-note's "add signals.db to backup-smoke scope before untracking" — checked: audit's own
  Verifier already closed this via WAL/shm-already-ignored + drain-signals.md §0a-0 degrade path +
  scripts/migrations/backfill-signals-db.ts (both confirmed present/live), not a blocking gap.
**why-decision:** `git ls-files`/`check-ignore -v` confirm signals.db+15 logs untracked+on-disk;
frozen incident-evidence logs still tracked (scope respected); `git add signals.db` exits 1 live;
drain-signals.md still carries the fix at HEAD (unclobbered by 1 later additive sibling commit).
**why-change:** No change from plan — moved `UC-GCP-P2` `qa[]`->`done_verified[]`
(status=DONE_VERIFIED, qa_verdict=APPROVED). `.head` reset idle, next_agent=pm. Did NOT push.

### STEP qa-S10 · qa · 2026-07-22T06:21:42Z
**task-id:** UC-GCP-P4
**what-done:** Direct-commit verify (mode=verify-committed, branch:null, 3rd live use). No
`commit`/`files[]` on row; single unambiguous hit `9641f664f` via `git log -- scripts/git-hooks/
pre-push` (subject literally cites UC-GCP-P4), main-ancestor, date 14:13:08Z matches
`developer_completed_at` 14:12:40Z within 1min. `git log --follow` confirms no later commit
re-touched the file — HEAD byte-matches the commit diff. Read git-ci-publish-P4 Change+4
hardenings from the audit brief directly, not review_note prose.
**what-considered:**
- Trust the "9 simulated stdin scenarios ... all matched spec" claim as sufficient — rejected;
  independently re-ran all scenarios live against the real hook (stubbed `pnpm`, real repo commit
  SHAs for doc-only/code-touching diffs, a bogus SHA for fail-open, ZERO_SHA for new-branch/
  branch-delete, 2-line stdin for the ANY-rule drain, `PRE_PUSH_SKIP_TSC=1`, PATH-stripped for
  no-pnpm-WARN) — all 8 matched; extracted `CODE_TOUCHING_REGEX` verbatim from the file and
  grep-tested 7 more path samples incl. root package.json/pnpm-lock.yaml/pnpm-workspace.yaml
  (all MATCH) vs docs/*.md and scripts/*.py (both correctly NO MATCH).
- Run `bun test`/`tsc` anyway for completeness — rejected: `git show --stat` = exactly 1 file,
  `.sh` not `.ts`, Smart-Skip N/A category (shell-only, no TS surface touched).
**why-decision:** `bash -n`+`shellcheck` both clean; live-simulated behavior matches all 6 stated
ACs (path-filter skip / fail-open / branch-delete skip / ANY-line-triggers / root-dep-files-in-set
/ new-branch-always-full) verbatim, not just the commit-message claim; `mock-guard.sh` PASS (no
production source to scan), secrets/DDD grep clean; `.git/hooks/pre-push` symlink still resolves
to the file (install.sh untouched since this commit). Developer DJ-GATE-1 entry cross-checked
present (`sprint-ULTRACODE-AUDIT-FIXALL-developer.md` STEP developer-S9, task-id UC-GCP-P4).
**why-change:** No change from plan — moved `UC-GCP-P4` `qa[]`->`done_verified[]`
(status=DONE_VERIFIED, qa_verdict=APPROVED, commit=9641f664f backfilled). `.head` reset idle,
next_agent=pm. Did NOT push.
