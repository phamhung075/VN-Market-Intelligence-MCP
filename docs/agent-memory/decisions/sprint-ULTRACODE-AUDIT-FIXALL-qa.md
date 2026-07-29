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

### STEP qa-S11 · qa · 2026-07-22T06:57:00Z
**task-id:** UC-MDH-P1
**what-done:** Direct-commit verify (branch:null, no commit/files[] on row — derived via
`git log --follow`), landing commit `11c35c0a8` (peer housekeeping tick absorbed the shared
staged index — dev's own DJ discloses this; independently confirmed via `git diff-tree
--name-status` = exactly the claimed 89 files, no revert/extra/missing).
**what-considered:**
- Trust the review_note's "89-file set + concurrent-commit race" story — rejected: cross-checked
  every claim at source (both `agentMemoryUpdateTools.ts:189` registration-time env-fallback and
  the test's `beforeEach mkdtemp`/`afterEach rm+unset` diffed byte-for-byte, MD5-class deletions
  spot-checked as exact stub content, developer DJ entry cross-read matching).
- "Zero pollution regrowth" claim — rejected face-value: found 19 files still on the flagged MD5
  hashes under `sessions/archive/`; traced each via `git log --diff-filter=A` to 2026-06-13 (pre-
  fix, out of P1's scope — belongs to the separate P3 archive-sweep row), confirmed via
  `--since=<fix-landing>` that ZERO new-dated pollution exists post-fix. Live-reran the 1300b
  suite twice just now (standalone, not trusting the dev's prior run) — 14/14 pass both times,
  `git status --porcelain` on `docs/agent-memory/` clean of new files after each run.
**why-decision:** `bun tsc --noEmit` exit 0; `mock-guard.sh` PASS; DDD grep on the touched prod
file clean (its one `infrastructure/projectRoot.js` import is pre-existing/interface-layer, not a
domain-layer violation, and outside this diff's changed lines); secrets/`process.env` grep — the
one `process.env.AGENT_MEMORY_ROOT` hit is the fix's own injection point, not a leak. `git log
--follow` on both files confirms `11c35c0a8` is still HEAD-current, nothing re-touched them since.
DJ-GATE-1: `sprint-FLOW-PRICE-ALPHA-LOOP-dev-mcp-server.md` STEP dev-mcp-server-S20 present,
matching task-id.
**why-change:** No change from plan — moved `UC-MDH-P1` `qa[]`->`done_verified[]`
(status=DONE_VERIFIED, qa_verdict=APPROVED, commit=11c35c0a8 backfilled). `.head` reset idle,
next_agent=pm. Did NOT push.

### STEP qa-S12 · qa · 2026-07-23T00:52:18Z
**task-id:** UC-CDC-P4
**what-done:** Review-lane gate (row in `review[]`, `branch:null`, docs/config-only, commits
df5871ed4/56b954edc/1ee1b4963 already on main). Verified AC2 (`jq '._fanout'` — valid JSON, all 5
keys present, values match spec exactly). Verified AC3 (batch semantics: `ORDERED_SLOTS` puts
`guaranteed==true` first, `chunk(..., MAX_PARALLEL)`, inter-batch wait loop polls completion-or-
reprobe with 5s ticks hard-capped at `batch_wait_max_seconds`, degrades `MAX_PARALLEL` on timeout —
real wait, not naive back-to-back `run_in_background` spawns). Verified AC4 (`HEADROOM_MB = null`
whenever `PRESSURE_MODE != "adaptive"`, forcing the `DEGRADED` branch — fails to
`max_parallel_degraded`, never fails open). Verified AC5 by RE-RUNNING (not trusting the developer's
51/51 claim): `cd apps/mcp-server && bun test src/__tests__/DWF-phase1-cadence.test.ts` → **51 pass,
0 fail, 183 expect() calls** myself; cross-checked no other consumer schema-validates
cadence-policy.json strictly (`cowork-match-slots.js`, `emitPressureStateTool.ts` — neither breaks
on an added top-level key). Verified AC6: `agent-chaining-protocol.md` carve-out added, correctly
scoped, references SSOT by key name only (no literal numbers). **Found AC1 BLOCKING violation**:
grepped the flow doc's batch/headroom logic for literal integers — `spawn-fanout.md:132-134`
(Step 5.1, `POLICY_FILE`-missing/unparseable/`_fanout`-missing branch) hardcodes the entire
`_fanout` policy object as inline literals (`max_parallel_default:4, max_parallel_degraded:2,
headroom_floor_mb:1500, load_per_core_factor:2, batch_wait_max_seconds:120`) — a shadow copy of the
SSOT values duplicated inline. Both the commit message ("5 tunables, zero hardcoded numbers in the
flow doc") and `docs/WORK.md`'s one-liner ("zero hardcoded numbers in the flow doc") assert the
opposite of what the raw file contains — self-report contradicted by source. Verdict:
**CHANGES_REQUESTED**.
**what-considered:**
- Treat the fallback as an acceptable defensive default (matches today's SSOT values, only
  triggers when the config file itself is unreadable) — rejected: the AC's own verification method
  is explicit and mechanical ("grep the flow doc for literal integers... must reference the
  _fanout keys, not inline constants"), with no fallback-only carve-out; the shadow copy creates
  real SSOT-drift risk (if `_fanout` values are retuned later, this fallback silently keeps stale
  numbers) — exactly the failure mode a threshold SSOT exists to prevent.
- Checked precedent: Step 4.2's `pressure-read.md` handles a fully-missing/malformed policy file by
  logging WARN and degrading to `legacy` mode WITHOUT synthesizing a numeric threshold — no
  established precedent in this codebase for whole-object inline-literal fallback; Step 5.1's
  pattern is a new, avoidable deviation, not consistent with the one per-field `|| 20` default
  `pressure-read.md` uses when a single key inside an already-parsed file is missing.
- Approve with a non-blocking note instead of gating — rejected: the AC was phrased as a hard,
  grep-verifiable gate specifically to catch this class of issue; rubber-stamping a self-report that
  contradicts the raw source defeats the point of RAW verification (feedback_router_verify_raw_not_badges).
**why-decision:** 5/6 ACs independently RAW-confirmed PASS at source (own jq run, own grep of batch/
wait logic, own re-run of the regression suite); AC1 mechanically fails via the same grep method the
gate specified — not a judgment call, a literal-integer match inside the batch/headroom logic block.
**why-change:** Escalation from the default PASS path — moved `UC-CDC-P4` `review[]`->`in_progress[]`
(status=IN_PROGRESS, owner/next_agent=developer, `qa_verdict=CHANGES_REQUESTED`, one `qa_blocking_issues[]`
entry with file:line + fix guidance, `redispatch_count`=0->1) via `jq | scripts/orch-apply.sh`
(validator PASS, conservation PASS 626=626/105=105). `.head` set `next_agent: developer`,
`next_action` names the exact fix. Did NOT approve, did NOT merge (nothing to merge — already on
main), did NOT push.

### STEP qa-S13 · qa · 2026-07-23T01:50:47Z
**task-id:** UC-CDC-P4
**what-done:** Re-review (redispatch #1) of AC1 fix commit 0ffb8d77a. `git show 0ffb8d77a` confirms
the inline `_fanout` object literal was DELETED (not relocated): missing/unparseable branch now
sets `FANOUT_MODE="degraded_serial"`+`MAX_PARALLEL=1` sentinel only; grep for the 5 literals
(4/2/1500/120/load-factor) outside the else branch = zero hits (2 pre-existing prose mentions,
untouched by this diff, illustrative not fallback). Read `pressure-read.md` Step 4.2 source
directly — the claimed precedent matches exactly. AC2 (`cadence-policy.json` unedited, 5 keys
intact) + AC5 (RE-RAN `bun test DWF-phase1-cadence.test.ts` myself: 51/0/183) both RAW-reconfirmed.
AC3/AC4/AC6 untouched by fix diff-stat, re-spot-checked intact.
**what-considered:**
- Flag the L179/L249 numeric prose as a residual AC1 violation — rejected: neither is inside the
  missing/unparseable branch, neither assigns a fallback value, both pre-date this diff untouched.
**why-decision:** All 6 ACs RAW-confirmed PASS at source; the specific defect I flagged
(shadow-copy object) is mechanically absent post-fix via the same grep method that found it.
**why-change:** No change from plan — fix matched the requested remediation exactly.

### STEP qa-S14 · qa · 2026-07-23T02:56:39Z
**task-id:** UC-CCA-P6-NBWRITE
**what-done:** Direct-commit verify of `da70e9e3a`(impl)/`fb61d6f3d`(board flip), both main-ancestor.
Read all 5 diffs raw, not `dev_result` prose. AC1: targeted grep for the boilerplate signature
(`^Step 1.*Read full`/`Single settled write`/`NB_LINES=`) across all 4 flows = 0 hits, matches
dev's exit=1 claim; the one loose hit on a broader grep (bctc:8, one-line AC-3 invariant callout,
not the removed multi-step block) is not a duplicate. AC2: fb main.md :44/:886 now say APPEND-class;
sole remaining "overwrite" hit (:900) is explanatory comparison prose, no live instruction; preamble
(Lessons/Known patterns) now precedes the rolling `## c<NNN>` body, matches AC-6 template. AC3: all
5 files even ``` fence count. Confirmed notebook-write SKILL.md AC-6 table lists fb-market-poster
APPEND (skill:83). Confirmed residual (weekly-recap.md:206/weekly-prediction.md:263 still say full
overwrite) — correctly out of Piece 1's file list, noted not failed.
**what-considered:**
- Fail on the bctc:8 grep hit as an AC1 violation — rejected: it's a 1-line invariant reminder
  after the pointer, not the removed Step-1..6 compose boilerplate; targeted signature grep = 0.
**why-decision:** All 3 stated ACs pass on raw re-derivation; known residual explicitly excluded
from this task's scope by the spawn brief.
**why-change:** No change from plan — verify-committed JUMP-TO, all checks green.

### STEP qa-S15 · qa · 2026-07-23T03:50:33Z
**task-id:** UC-CCA-P4
**what-done:** Direct-commit verify (branch:null, dev-team Review-Lane row) of `455048c76`, main-
ancestor confirmed, `git show --stat` touches exactly the 8 claimed files + board/notebook/journal.
Re-read every diff raw against the dispatch's 5 verify points, not the row's `note` prose:
(a) `weekly-recap.md` new STEP 3e sits between STEP 3d (privacy gate) and STEP 4 (Write deliverable)
— immediately pre-write, `post_body`=STEP-2 output, `agent_id`="fb-market-poster", "Execute
identically to main.md STEP 4d" (byte-checked STEP 4d at `main.md:796` — same skill path/exit-code
handling/non-real-time no-override semantics); (b) `weekly-prediction.md` STEP 4e same pattern,
between STEP 4d (privacy) and STEP 5 (write), `post_body`=STEP-3 output; (c) digest-predict
daily.md/weekly.md/monthly.md: grepped each file for `send_telegram(channel="market"` — single hit
each, gate block sits directly above every one, invocation shape (`GATE_EXIT`/0-1-2 handling/self-
correct-then-honest-gap) matches `daily-predict.md` P-5.5 verbatim structure; (d) qa-responder
`cycle.md` new Step 4b sits between Step 4 (compose) and Step 5 (send) — read the full file top to
bottom to confirm no other MARKET send exists earlier; exit-code handling (0/1/2 + second-pass-FAIL-
proceeds-anyway) is a verbatim structural match to `alert-commander/stage-dispatch-log.md` Step
4a-pre (both real-time-override flows); (e) `SKILL.md` diff: qa-responder added to both the
frontmatter invoker list AND the Time-sensitivity-override paragraph, nothing else touched — no
logic drift, both new pointer-steps route through the one shared `scripts/narrative-truth-gate.sh`
invocation contract, zero re-implementation.
**what-considered:**
- Trust "qa-responder was genuinely ungated" from the commit message/DJ prose alone — rejected:
  independently grepped `alert-commander/flow/stage-dispatch-log.md`, `unified-agent/flow/chef.md`,
  `market-watcher/flow/cycle.md` for `claim-truth-gate` — all 3 already gated pre-existing (commit
  did not touch them, confirmed no dup added); grepped `news-scout` + `bctc-analyst` flow dirs for
  `send_telegram(channel="market"` — zero hits in both, confirming they are not public/MARKET
  publishers (WORK-channel/internal-ledger only) and were correctly left ungated, not a missed gap.
- Treat the qa-responder addition as scope creep beyond the 5-file rescope note — rejected: the
  dispatch instruction itself named qa-responder a verify candidate and asked me to confirm it's a
  genuine live gap not creep; independently re-derived the "no Bash" claim at source — `.claude/
  agents/qa-responder.md:5` frontmatter is `tools: Read, Write, Edit, WebSearch,
  mcp__gateway__call_tool` (no Bash) — the new Step 4b's "No-Bash session note" pointer to SKILL.md
  § "No-Bash cowork subagent sessions" (confirmed present, SKILL.md:81) is the correct, already-
  documented fallback, not an invented one. `agent_id` in `narrative-truth-gate.sh` is used only for
  signal attribution (confirmed reading the script header + grep for `AGENT_ID` usage) — dimension
  routing in `claim-tool-map.json` is agent-agnostic by construction, so adding a 6th invoker
  requires zero engine/lexicon change, matching the claim.
- Run `bun test`/`tsc`/mock-guard — N/A: `git show --stat 455048c76` = 8 files, all `.md`/`.json`
  (flow docs + SKILL.md + orch-state.json + journal/notebook), zero `.ts`/production source touched;
  Smart-Skip correctly applies (doc-only change).
**why-decision:** All 5 dispatch verify points confirmed present, correctly positioned (immediately
pre-send/pre-write, not elsewhere in the flow), routed through the one shared skill/script path with
zero logic drift, and semantically correct (non-real-time no-override for fb/digest-predict,
real-time override for qa-responder mirroring alert-commander exactly). The +1 qa-responder file is
a verified genuine gap per live grep, not creep — matches the dispatch's own framing.
**why-change:** No change from plan — verify-committed JUMP-TO, all 5 points green, APPROVED.

### STEP qa-S17 · qa · 2026-07-23T04:56:54Z
**task-id:** UC-MDH-P3
**what-done:** Direct-commit verify (`review[]`, branch:null) of `memory-prune-sweep.sh` + code-janitor
wiring — commits `d88c1bc6d`(impl+sweep+docs)/`2d5cfbf80`(notebook), both main-ancestor confirmed.
**what-considered:**
- Trust `dev_result`/`status_note` prose vs re-derive at source: re-derived — grepped the script
  itself for `orch-state` (2 hits, both comment lines explaining the exclusion, zero code path
  touches the file); read all 178L, all 4 sweeps match the rescope spec verbatim.
- Trust the 12/12 claim vs re-run: re-ran `memory-prune-sweep.test.sh` live myself — 12/12 PASS,
  confirmed sandboxed (mktemp -d + trap cleanup, env overrides point off-tree; `git status`
  before/after the run shows the only pre-existing dirty entries are unrelated peer drain activity
  — the live `janitor-health-recheck-writer-retired-2026-07-23.json` payload was moved to
  `docs/signals/processed/` by an unrelated dev-team drain tick, not by my test run).
- Trust "live sweep ran, idempotent" vs verify live tree: independently spot-checked the real repo
  — `session-logs/` dir gone, 0 root `scheduled-task-execution-*.md`, 0 `team-tool-recheck-*.md`
  >30d, 0 `sessions/*.md` >14d unarchived, all `.log`/`.json` writers in `sessions/` root untouched
  — matches the commit's claimed live-run counts and the retention doc's rules exactly.
**why-decision:** SSOT-W1 boundary (script=file-write-only, FLOW=signal_queue-append) verified
operationally, not just documented — found the actual `signal_queue.rows[]` row
(`id: janitor-health-recheck-writer-retired-20260723`, `note: "dev-team drain durable delivery:
file-only PO payload appended to signal_queue for PO triage"`), proving the boundary held in
production, not merely on paper. `dev-standards.md`/`.retention.md` pointers both present and
accurate. Smart-Skip correctly applies (shell+docs only, zero `.ts`) — mock-guard/DDD/env/secrets
greps all clean.
**why-change:** No change from plan — verify-committed JUMP-TO, zero blocking issues, APPROVED.

### STEP qa-S18 · qa · 2026-07-23T05:50:00Z
**task-id:** UC-MDH-P4
**what-done:** Direct-commit verify (`review[]`, branch:null) of `decision-journal-archive.sh` +
pm/task-archive.md Step 5.5 wiring — commits `48e6bf250`(impl+test+docs)/`880c28f43`(board flip),
both main-ancestor confirmed. Re-ran `decision-journal-archive.test.sh` myself — 26/26 PASS, exit 0.
Snapshotted `docs/agent-memory/decisions/`+`docs/archive/decisions/` (487 files, filename list + md5
per file) before/after the run — byte-identical, `git status` on both paths unchanged (same 3
pre-existing unrelated dirty files); confirms sandboxing (mktemp -d fixture, `DJA_GIT_MV=0`) is real,
not just claimed.
**what-considered:**
- Trust `dev_result`'s OHLCV-UNIT-CONTAM collision claim vs re-derive: re-derived — grepped live
  orch-state.json, confirmed `OHLCV-UNIT-CONTAM-WHOLEROW-LT1000` is genuinely in
  `active_sprints[]` and `OHLCV-UNIT-CONTAM` is genuinely a `closed_sprints[]` stub, a real live
  string-prefix collision the longest-match awk logic (script:162-175) correctly resolves.
- Trust "file-ops-only, never writes orch-state.json" prose vs grep: grepped the script — `ORCH_STATE`
  used only in `jq -r ... "$ORCH_STATE"` reads (2 sites) and the missing-file guard; zero `>`/write
  redirection, zero `orch-apply.sh` reference — SSOT-W1 boundary holds.
- Run `bun tsc --noEmit`/mock-guard: mock-guard PASS ("no production source files to scan" — `.sh` is
  outside its scan surface); `git show --stat` on both commits confirms zero `.ts` touched anywhere —
  Smart-Skip correctly applies (shell+test+docs only).
- Verify contract fidelity vs flow doc: read `task-archive.md` Step 5.5 verbatim — `comm -23
  <(PRE_EVICT) <(POST_EVICT) | bash decision-journal-archive.sh` (stdin mode, no `--all`) matches the
  script's default `MODE="stdin"` exactly; Step 6 pathspec extension includes both
  `docs/agent-memory/decisions/` and `docs/archive/decisions/` for the `git mv` rename pair.
**why-decision:** Test suite RAW-reproduced (not trusted from commit message), sandboxing
independently proven via before/after hash-identical snapshot (not just reading the test's own
env-var overrides), SSOT-boundary grep-confirmed read-only, and the flow-doc/script invocation
shapes cross-checked line-for-line — all match. Deferred `--all` backfill (~202 files, `--dry-run`
verified) correctly left unexecuted, a separate PO-routed mutating action out of this task's scope.
**why-change:** No change from plan — verify-committed JUMP-TO, zero blocking issues, APPROVED.

### STEP qa-S19 · qa · 2026-07-28T17:00:09Z
**task-id:** UC-GCP-P8
**what-done:** Direct-commit verify (`qa[]`, branch:null, oldest of 83-deep review-lane backlog) of
`stranded-state-sweep.sh` — commit `231860c6a`, main-ancestor confirmed, touches all 7 claimed files
per `git show --stat`. Re-ran `stranded-state-sweep.test.sh` myself — 19/19 PASS, exit 0 (matches
dev claim). Live sanity re-run (dispatcher-requested, 5-day drift check) against CURRENT dirty tree
(44 entries, not the dev's 2026-07-23 57-entry snapshot): exit 0, valid JSON, 7 owned-elsewhere/5
young-skipped/20 unknown (cap-enforced)/0 auto-commit — classifier still healthy live.
**what-considered:**
- Trust "zero git/orch-state writes itself" prose vs grep: grepped script — no `git add`/`commit`,
  `ORCH_STATE` used only in one read-only `jq` dedup probe; only stdout(JSON)/stderr(log) writes.
- Trust commented `# task_claim(...)`/`# task_release(...)` in post-cycle.md Step 4.3 as a defect vs
  convention: cross-checked Step 4.2 (cold-evict) immediately above — identical commented-pseudocode
  mutex-claim style already established there; not a gap specific to this task.
- Shellcheck severity: default run showed only info-level SC2015/SC2329 on the *test* file; re-ran at
  project's own `-S warning` convention (per cycle-486 precedent) — both files exit 0, clean.
- mock-guard + secrets/process.env grep on both `.sh` files: clean (no production TS touched,
  Smart-Skip applies).
**why-decision:** Test suite RAW-reproduced, live 5-day-drift sanity check independently run (not
trusted from the 2026-07-23 dry-run claim alone), both flow-doc (post-cycle.md Step 4.3) and
dev-standards.md CANONICAL pointer confirmed live and accurate against the actual script behavior,
signal-dashboard SKILL.md § WRITE pointer resolves. Zero blocking issues found.
**why-change:** No change from plan — verify-committed JUMP-TO, zero blocking issues, APPROVED.

### STEP qa-S20 · qa · 2026-07-29T00:21:25Z
**task-id:** UC-GCP-P7
**what-done:** Direct-commit verify (`qa[]`, branch:null, stranded 6 days un-QA'd) of /commit skill
rescope. Commits `a5202512c` (fix) + `2cd532595` (memory), both `git merge-base --is-ancestor main`
confirmed, dates 2026-07-23 match `completed_at`. `git show --stat a5202512c` touches exactly
`.claude/skills/commit/SKILL.md` + `.claude/commands/commit.md` — matches claim. Read CURRENT
content of both files (not diff alone) + diffed the fix commit directly against all 5 RESCOPE
acceptance items: (1) Step 4 merge-and-clean-branch — confirmed absent from current file, diff shows
it deleted, grep for `Step 4`/`git branch -d`/`git checkout main` in current SKILL.md returns only
the affirmative no-branches-invariant prose, zero residual procedure; (2) per-category commit-mutex
critical section — Step 2 rewritten to one `commit-mutex:main` acquire/critical-section/release per
category (not spanning the whole run), pointing at `commit-mutex/SKILL.md` Step 3d-PUSH as SSOT —
grep-confirmed that skill file genuinely has a `3d-PUSH`/TTL=90s section, not a broken pointer;
(3) stranded-peer-file age guard — Step 1 mtime<2h check against `commit-boundary/SKILL.md` § RULE 2
— grep-confirmed RULE 2 + the cited agents-architect/agent-father zone rows genuinely exist there;
(4) Co-Authored-By hardcode → pointer — diff shows the literal
`Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>` line deleted, replaced with "Never
hardcode a co-author or model-name trailer here" + pointer to `commit-convention.md` as trailer
SSOT; verified that doc's own `## Trailers` section (Task/AC/Sprint/Claude-Session) contains no
hardcoded model-name trailer, consistent with the pointer's intent; (5) `commit.md` one-line pointer
— current file read is exactly 1 line, diff confirms the prior 3-line prose (which itself
contradicted no-branches invariant: "merge branch finish to main... clean this branch") was replaced.
Grep-confirmed exactly one file repo-wide carries `trigger: /commit` — the "ONE definition" claim
holds structurally, not just by removal. Cross-checked developer's own DJ entry
(`sprint-ULTRACODE-AUDIT-FIXALL-developer.md` STEP developer-S22, `task-id: UC-GCP-P7`) — present,
matches status_note prose. Working tree confirmed clean for both target files (no peer mid-edit).
Docs/skill-only change, zero production `.ts`/`.py` touched — `bun test`/`tsc`/mock-guard
structurally N/A (Smart-Skip, same class as cycle-495 precedent).
**what-considered:**
- Found `docs/references/bundles/bundle-developer.md` § Commit Format still carries a hardcoded
  `Co-Authored-By: Claude Opus 4.6` line + numeric `task(NNN)` format + branch-merge steps — but this
  is a wholly separate, pre-existing developer-agent reference doc (their own direct-commit lazy-load
  bundle, per the rescoped SKILL.md's own INV-GATEWAY-1 note: specialist sub-agents commit directly,
  they don't invoke `/commit`), not a second definition of the `/commit` skill and not named anywhere
  in this row's scope note. Out of scope for this task — flagged non-blocking, not folded into this
  row's verdict, not silently ignored either.
- Trust status_note's file-touch claim vs verify: ran `git show --stat` myself rather than accepting
  the prose count.
- Trust the pointer targets vs verify they resolve: grepped `commit-mutex/SKILL.md` and
  `commit-boundary/SKILL.md` directly for the cited section anchors (3d-PUSH, RULE 2) rather than
  assuming the pointer is live.
**why-decision:** All 5 RESCOPE acceptance items independently confirmed against current file
content + the actual diff (not the status_note prose alone), both commits real and on main ancestry
with correct file-touch sets, all cross-referenced SSOT pointers resolve to live content, zero
blocking issues found.
**why-change:** No change from plan — verify-committed JUMP-TO, zero blocking issues, APPROVED.
Non-blocking out-of-scope observation recorded (bundle-developer.md stale hardcode) for PO triage,
not this row's problem.
