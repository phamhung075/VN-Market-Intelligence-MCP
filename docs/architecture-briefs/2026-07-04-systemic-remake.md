# Architecture Brief — Systemic Remake: Churn Without Convergence

**Date:** 2026-07-04
**Author:** agents-architect
**Status:** DESIGN COMPLETE — handoff to agent-father (containment) + po/pm/architect/developer (structural)
**Input:** `docs/incidents/2026-07-04-systemic-review-churn-without-convergence.md` (64-agent adversarially-verified forensic diagnosis, 40 CONFIRMED findings). This brief does NOT re-derive the diagnosis — every remedy below cites the finding id(s) it closes and was independently re-verified against live source during authoring (file:line evidence inline).

---

## 0. TL;DR

Two phases. **Phase 1 (containment-now, ship immediately, no redesign):** port the ONE proven no-work gate the system already has (cowork `LOOP-07`) into the two engines that lack it, drain the two already-specced-but-parked detector fixes out of PLAN-ONLY, and stop narrative docs from lying about live counts. **Phase 2 (structural-remake):** replace self-reported completion with a machine-checked gate bolted onto the write path that already validates every orch-state mutation (`orch-apply.sh` → `orch-validate.mjs`), give agents a sanctioned `DEGRADED` exit instead of forcing fabrication, finish the hot/cold split that already shipped once and regressed, and get derived counters out of the git tree. Phase 1 is a prerequisite for measuring Phase 2 (a clean git log is the instrument), not a soft nice-to-have — it must land first and stands alone.

---

## 1. Phasing

| Phase | Root causes (fix order) | Class | Independently shippable? |
|---|---|---|---|
| **1 — Containment-now** | RC-IDLE-LOOPS → RC-DETECTOR → RC-DRIFT | bounded, no redesign | Yes — lands on `main` today, zero dependency on Phase 2 |
| **2 — Structural-remake** | RC-VERIF + RC-CONVERGE (ride together) → RC-ORCHMONO → RC-GITSTATE → RC-CEREMONY (P2, lowest, last) | deeper design | Yes internally sequenced, but each item benefits from Phase 1's clean signal (fewer chore commits masking real ones) |

Every remedy below has: **Target**, **Mechanism**, **Acceptance criterion (machine-checkable)**, **Owner**.

---

## PHASE 1 — CONTAINMENT-NOW

### 1.1 RC-IDLE-LOOPS (P1 — fix first)

**Confirmed by:** `LOOP-07` (cowork's `_step8_silent_release` is the ONLY genuine pre-LLM no-work bail), `LOOP-02` (auditor Tier-2/3 have no pre-gate equivalent to Tier-1's `auditor-tier1-probe.sh`; notebook write is unconditional, `main.md` L74-76/L685-716 always injects a fresh-timestamp section so staging is never empty), `LOOP-03` (dev-team's idle fast-exit at `main.md` Step 0b/L494 runs AFTER Step 0a `drain-signals.md`'s MANDATORY persist+commit — the gate cannot suppress a write that already fired).

**Do NOT invent a new mechanism.** `scripts/agents-flow/cowork-tick-preflight.sh` Step 7/8 (`_step8_silent_release`, L74-113) is the template: check `slots_empty && one_shots_empty && signal_count==0` → emit pressure telemetry + release lock → **SILENT**, no LLM-narrated read, no spawn, no commit. Port this predicate shape verbatim (same fields: NEW-row counts already read elsewhere) to the two other engines.

| Target | Mechanism | Owner |
|---|---|---|
| `scripts/agents-flow/dev-team-tick-preflight.sh` | Add a Step 5 idle-check AFTER the existing fire-election win (RUN path only), reusing the exact fields `drain-signals.md`'s own MANDATORY PERSIST GUARD already reads (`ls docs/signals/*.json \| wc -l`, `signals.db` mtime, `jq '[.signal_queue.rows[]\|select(.status=="NEW")]\|length'` on orch-state, `task_board.active_sprints` emptiness) — evaluate them BEFORE Step 0a instead of only inside it. All-empty → new verdict `RUN-IDLE`. | developer (script + `dev-team-tick-preflight.test.sh` case, PM-decomposed — same precedent as the existing WU-2 script) |
| `docs/agents/dev-team/flow/main.md` Step 0-PREFLIGHT verdict table | Add `RUN-IDLE` branch → JUMP straight to `end` (skip Step 0a `drain-signals` entirely — mirrors cowork's silent-release: emit last state, release locks, zero commit). | agent-father (thin JUMP-TO branch only) |
| `scripts/agents-flow/auditor-tier1-probe.sh` | Generalize to accept `--tier=2\|3` implementing the SAME ALL_GREEN+fresh-heartbeat pre-spawn check Tier-1 already has, run BEFORE the cron even spawns the subagent (not just before commit). | developer |
| `.claude/skills/cron-detect-loop/SKILL.md` Job 3 (Tier-2 `0 */4`) + Job 4 (Tier-3 `0 2`) | Wire `bash scripts/agents-flow/auditor-tier1-probe.sh --tier=2` (etc.) as a pre-gate, exactly mirroring how Job 2 already wires Tier-1. | agent-father (prompt-text wiring only) |
| `docs/agents/system-auditor/flow/main.md` L74-76 + L685-716 (AC-3 settled-write) | Gate the notebook append itself on "did this cycle produce ≥1 new finding/signal/state-change" — a genuinely ALL_GREEN cycle must emit ZERO notebook diff, so `scripts/auditor-notebook-commit.sh`'s existing `SKIP no-staged-changes` (L196-197 — today's only working no-op) actually has something to trigger on. | agent-father |

**Acceptance criteria (machine-checkable):**
1. New `dev-team-tick-preflight.test.sh` case: `task_board.active_sprints=[]`, `docs/signals/` empty, `signal_queue` NEW=0 → mocked call trace contains ZERO calls that would touch `drain-signals.md`, verdict=`RUN-IDLE`.
2. `bash scripts/agents-flow/auditor-tier1-probe.sh --tier=2` invoked twice with no underlying DB/heartbeat delta between calls → second call returns SKIP-SPAWN, zero subagent launch, zero commit.
3. Empirical: `git log --since="7 days ago" --grep="chore(signals): drain\|chore(memory/system-auditor)"` commit count per day trends down on days where `orch-state.json .task_board` sampled at tick time was empty (cross-check against tick timestamps) — a clean git log is itself the proof this phase restores visibility for Phase 2.

---

### 1.2 RC-DETECTOR (P1 — fix third overall, 2nd in this phase)

**Confirmed by:** `LOOP-01` (context-bloat FP re-emitted 4th+ time, no source-side suppression, fix already specced and PLAN-ONLY: backlog id `FIX-CONTEXT-BLOAT-HOOK-SETTLE-READ-DEBOUNCE`), `F4-SIGNAL-ID-COLLISION-NOT-DUP` (8 distinct per-ticker D4 findings collide onto one `sau-d4-{YYYYMMDDHHMM}` id — fix already filed as `FU-AUDITOR-D4-SIGNAL-ID`, BACKLOG, **not** plan-only, just never dispatched), `F5-CLOSURE-11PCT-READ-GRAVEYARD` (READ→RESOLVED transition is already SPECCED in `.claude/skills/signal-dashboard/SKILL.md` §CLOSE but no consumer ever calls it — 3/27 = 11.1% closure, confirmed).

Live backlog check performed during authoring (`jq` on `orch-state.json`):

| id | status | plan_only | action needed |
|---|---|---|---|
| `FIX-CONTEXT-BLOAT-HOOK-SETTLE-READ-DEBOUNCE` | BACKLOG | **true** | promote out of PLAN-ONLY |
| `FU-AUDITOR-D4-SIGNAL-ID` | BACKLOG | false | promote BACKLOG→READY (intake starvation, not blocked) |
| `FIX-SIGNALQUEUE-DUP-ID-GUARD` | TODO | false | already unblocked, needs dispatch |
| `FIX-AUDITOR-B05-BCTC-FRESHNESS-LAYER-SPLIT` | BACKLOG | false | promote BACKLOG→READY |

| Target | Mechanism | Owner |
|---|---|---|
| `docs/data/orch/orch-state.json` (via `orch-apply.sh`) | Promote the 4 rows above: `plan_only:false` where set, `status: "READY"` for the 3 un-dispatched ones. This is a data mutation, not an agent-file edit. | **po** (triage/promote) → **pm** (decompose into sprint) |
| `scripts/agents-flow/context-bloat-backstop.sh` | Implement the settle-read/debounce fix once dispatched: re-read the file's line count after a short settle window (or gate on committed-state, not mid-write) before declaring a breach. | developer |
| Auditor D4 emit path (wherever `post_agent_signal` fires for `esc-datacov`/`esc-deepdive` rows) | Replace the batch id `sau-d4-{YYYYMMDDHHMM}` with a per-finding discriminator: `sau-d4-{ticker}-{check_id}-{YYYYMMDD}`. | developer |
| `apps/mcp-server/src/infrastructure/orchStateSchema.ts` + `scripts/orch-validate.mjs` | Add an id-uniqueness guard across `signal_queue.rows[]`+`archive[]` at write time (defense in depth for ANY emitter, not just D4). | developer |
| `docs/agents/po/flow/triage-signals.md` (`repair_task_request` row) | When PO creates a `.task_board.backlog[]` FIX task FROM a signal, record the originating signal's `id` on the new task (new `origin_signal_id` field) — wires two already-specced mechanisms together instead of inventing new state. | agent-father |
| `docs/agents/pm/flow/task-archive.md` | On a task reaching `DONE_VERIFIED`, if it carries `origin_signal_id`, flip that `signal_queue` row `READ→RESOLVED` via the already-specced CLOSE protocol (`signal-dashboard/SKILL.md` §CLOSE). | agent-father |

**Acceptance criteria:**
1. `jq '[.signal_queue.rows[] | select(.status=="RESOLVED")] | length / (.signal_queue.rows | length)'` trends up from the confirmed 11.1% baseline over the following week.
2. Synthetic: a task carrying `origin_signal_id` reaches `DONE_VERIFIED` → the referenced `signal_queue` row flips to `RESOLVED` in the SAME commit (no manual step).
3. Synthetic auditor run emitting 8 distinct ticker/check pairs in one tick produces 8 distinct `signal_queue` row ids: `jq '.signal_queue.rows | group_by(.id) | map(select(length>1))'` == `[]`.
4. `docs/data/system-auditor-known-issues.json`-style fingerprint suppression (the pattern already exists for a different check class) is confirmed wired into `context-bloat-backstop.sh`'s emit path specifically — grep shows the script reads a fingerprint file before `post_agent_signal`.

---

### 1.3 RC-DRIFT (P1 — 3rd in this phase)

**Confirmed by:** `F4-TOOLCOUNT-4WAY-DRIFT` (146 CLAUDE.md / 161 mcp-tools.md / 166 system-map.json / 183 generated ground truth — a real generator chain `gen-tool-registry.ts`→`gen-project-stats.ts`→live server EXISTS with a parity test, but that test never keys the 3 narrative-doc copies), `F3-CRONJOBCOUNT-2-VS-SELFNOTE-81-VS-CONFIG-82` (generator `countCronJobsFromSource()` in `scripts/gen-project-stats.ts` already exists — drift means it isn't RUN on a cadence, not that it's missing), `F2-LASTSUCCESSFULCYCLE-DEAD` (47d-stale hand field), `F6-NUMBERED-SPRINT-MODEL-DEAD`, and the freeze-flag decoration confirmed independently this session: `grep -rln "recurringBugEscalationFlag"` across `.ts`/`.md`/`.sh` returns **zero readers**.

| Target | Mechanism | Owner |
|---|---|---|
| `scripts/gen-project-stats.ts` / `scripts/gen-tool-registry.ts` | Wire into a cadence (CI on push to `main`, or fold into an existing frequent cron with a `git diff --quiet` short-circuit so a no-op regen produces zero commit — reuses the same "no delta, no write" discipline as 1.1). | developer |
| existing `tool-registry-parity.test.ts` | Extend to ALSO grep `CLAUDE.md`, `docs/standards/mcp-tools.md`, `docs/ARCHITECTURE.md` for hardcoded tool/cron counts and fail if they diverge from the generated SSOT (`docs/data/tool-registry.json`). This is the exact gap the finding names: "no CI check keys these copies to the registry." | developer |
| `CLAUDE.md`, `docs/standards/mcp-tools.md`, `docs/ARCHITECTURE.md` prose | Replace hardcoded numbers with a pointer to the generated SSOT file (no number to go stale). | **claude-manager-helper** (its stated remit: "CLAUDE.md slim, docs sync" — not agent-father, these are not agent-persona files) |
| `docs/data/project-stats.json` `lastSuccessfulCycle`, `currentSprint` | Delete if genuinely zero readers (verify first — mirror the same grep done for `recurringBugEscalationFlag`), or replace with a computed value (e.g. count of `task_board.active_sprints`). | developer (verify+delete) |
| `docs/data/project-stats.json` `recurringBugEscalationFlag`/`escalationReason` | **Quarantine only in this phase** — add `_maintained_by: "DEPRECATED — see RC-CONVERGE machine-owned freeze flag (Phase 2)"` so nothing new starts trusting a field already proven to have zero readers. Full redesign is RC-CONVERGE's job (§2.1), not duplicated here. | agent-father (comment-only edit) |

**Acceptance criteria:**
1. `grep -c "146 tools\|161 live tools" CLAUDE.md docs/standards/mcp-tools.md` == 0 after fix (numbers replaced with a pointer).
2. Extended parity test: inject a deliberately wrong count into a throwaway copy of a narrative doc → test exits non-zero.
3. `cronJobCount` in `project-stats.json` matches `cron.schedule()` call-site count in `apps/mcp-server/src/scheduler/**` within one regen cycle, verified by the generator's own post-write validation (already present at `gen-project-stats.ts` L235-239 — just needs to actually run on cadence).

---

## PHASE 2 — STRUCTURAL-REMAKE

### 2.1 RC-VERIF + RC-CONVERGE (P0 — ride together, fix second overall)

**Confirmed by:** `F7-DONE-EQUALS-GREEN-TESTS` (fixer flow is test-only, `main.md` L68-70/L109 — no live-tool call anywhere; only ONE grep hit for "raw-verify" repo-wide and it's an illustrative example string, not a mandate), `F1-VERIFICATION-THEATER-LARGEST-CLASS` (146 feedback files; false-green=22, fabricat=19, confab=7, silent=45; every "how to apply" section pushes the fix DOWNSTREAM to router raw-verify instead of an agent-side gate), `F8-TRUST-EQUALS-SILENCE` (absence-of-alert + a positive probe that composite-scores/pruned-tables can also defeat), `F6-REASONING-SEVERED-FROM-HANDOFF` (fixer never reads the decision journal it's told to write to — `dispatch/SKILL.md:109`, absent from `fixer/init.md` knowledge.always_load), and independently confirmed this session: **the entire "recurring-bug-escalation" prose protocol described in memory (`feedback_recurring_bug_escalation.md`) is no longer present in `pm.md` or `architect.md` at all** — `grep -n "Recurring Bug" .claude/agents/pm.md .claude/agents/architect.md` returns nothing. The freeze flag it once fed is now a hand-typed, zero-reader field (confirmed §1.3).

**The single most important design decision in this brief:** do not invent a new verification service. **Reuse the choke point that already exists and that every orch-state write already passes through** — `scripts/orch-apply.sh` → `scripts/orch-validate.mjs` (Zod schema, `apps/mcp-server/src/infrastructure/orchStateSchema.ts`). This script currently validates schema/dup-keys/coherence and ABORTS the write (exit 1, live file untouched) on failure. Extend its schema with a conditional refinement instead of building a parallel gate — the enforcement point, the atomicity, and the "live file untouched on failure" safety property are already solved.

**(a) Producer-side completion gate.** `orchStateSchema.ts`'s `StatusEnum` already has `DONE_VERIFIED` as distinct from `DONE` — reuse it, don't add a new value for this half. Add a Zod `.superRefine`: when a `task_board`/`backlog` row's `status` is being set to `DONE_VERIFIED`, the row MUST carry `verification.raw_probe: {tool, args_or_query, live_value_observed, observed_at}` — proof of an independent live re-read of the served artifact (not the same call that produced the fix, not "tests pass"). Missing/malformed → validator rejects, `orch-apply.sh` exits 1, live file untouched, row stays at plain `DONE`.

**(b) Sanctioned honest-gap exit.** Add `DEGRADED` as an 8th value to `StatusEnum` (orch-state) AND to `docs/standards/task-schema.md`'s canonical 7-value enum, via the 3-point governed update the doc already documents (TS compile-time check, jq-migration mapping, JSON-schema validation). Any agent that cannot reach the live artifact (tool unreachable, geo-blocked, thin/degraded data) reports `DEGRADED` with `verification.honest_gap_reason` — never fabricates `DONE`. **This is not a new concept** — it formalizes the honest-NULL / DEGRADED pattern already proven in money-radar (`project_money_radar_vision.md`) and the CCATO narrative-truth-gate (`docs/architecture-briefs/2026-06-30-narrative-quality-ccato-gate.md`), extending it from narrative output into the task-completion contract itself.

**(c) Retire "router raw-verifies downstream" as the primary control** — it becomes a spot-check backstop once (a)+(b) push the proof requirement onto the producer at write time.

**(d) Wire QA/fixer.** `docs/agents/qa/flow/main.md` merge-gate and `docs/agents/fixer/flow/main.md` RETURN step (L68-70/109, "tests pass, tsc clean") both currently treat green-tests as sufficient. QA (which already has live-tool access) must attach `verification.raw_probe` before writing `DONE_VERIFIED`; if it cannot reach the live artifact, QA writes `DEGRADED` and routes to PO instead of silently passing.

**(e) Convergence loop, re-encoded as a LIVE, machine-evaluated protocol** (not the dead prose it used to be): a `bug_class` fingerprint — same shape as `docs/data/system-auditor-known-issues.json`'s `fingerprint` field, computed from a normalized error-signature/title hash — is tracked across backlog + memory + `git log --grep` (bug-CLASS, not `git log -- <file>`, closing the per-file-grep gap). Recurrence ≥ 2 in a rolling 30 days → PO/PM sets the freeze predicate to reference a LIVE backlog task id (never a hardcoded label like the "1954c" string that caused a false-positive REFUTED finding this run precisely because task ids can rot into unreadable strings). The SAME gate from (a) reads that referenced task's live status: reaching `DONE_VERIFIED` (proven via raw-probe, not self-report) auto-lifts the freeze AND arms a re-check — if the same `bug_class` recurs again within 30 days post-lift, escalate a SECOND time automatically. Closes "one-shot reset, no re-trigger."

**(f) Reasoning continuity.** `docs/agents/fixer/init.md` `knowledge.always_load` gains the decision-journal skill as a REQUIRED read (not merely a write-step at `main.md:101`) whenever the incoming task carries `route_to: architect` provenance or a `bug_class` recurrence ≥ 2 tag.

**Acceptance criteria:**
1. **Fabrication-rejection (exactly the test the diagnosis asked for):** pipe a candidate through `orch-apply.sh` setting `status: "DONE_VERIFIED"` on a row with NO `verification.raw_probe` → validator exits non-zero, live file untouched.
2. **Honest-gap acceptance:** a fixer/QA run against a deliberately unreachable tool (mocked 5xx) produces `status: "DEGRADED"` + non-empty `honest_gap_reason`; CI/QA accepts this as a valid terminal state, not a retry-until-fake-DONE loop.
3. **Convergence:** seed two synthetic fix commits against the same `bug_class` fingerprint within 30 days → freeze predicate auto-references the correct live backlog id; mark that id `DONE_VERIFIED` via (a)'s gate → freeze auto-clears in the same tick, no manual edit (`jq` diff on `orch-state.json` before/after).
4. **Reasoning continuity:** dispatch a fixer task carrying `route_to: architect` provenance → its tool-call trace includes a `Read` on the referenced decision-journal path BEFORE any file edit.

**Owner:** `architect` (dev-team's technical-design agent — brownfield design of the Zod refinement, the 8th-enum governance update, and the `bug_class` fingerprint algorithm) writes the TECH doc → `pm` decomposes → `developer` implements schema/validator/fingerprint code → `agent-father` wires the persona/flow-doc pieces (`fixer/init.md` knowledge load, `fixer/flow/main.md` + `qa/flow/main.md` RETURN-step wording, re-encoding the convergence protocol into `pm.md` + `architect.md` as a LIVE section referencing the new mechanism instead of the dead prose it replaces).

---

### 2.2 RC-ORCHMONO (P1)

**Confirmed by:** `F3-HOTCOLD-SPLIT-REGRESSED` (hot file measured 862,070 bytes now vs the 537,384-byte post-split target = +60.4%/+325KB; `scripts/orch-cold-evict.sh` write phase filters ONLY `.task_board.done`/`.done_verified`/`.closed_sprints`/`.signal_queue.rows` — **backlog terminal rows are never evicted**: 31 DONE + 4 CANCELLED + 11 DEFERRED + 5 REVIEW = 46+ rows stuck in hot backlog; no enforced size ceiling, only dry-run logging), `F5-HOTFILE-CHURN-ORCH-STATE` (1,704 rewrites/30d = 57×/day = 40% of ALL commits in the window).

This is not a new brief — it is **finishing** `docs/architecture-briefs/2026-06-26-orch-state-hot-cold-split.md`, which shipped once and regressed.

| Target | Mechanism | Owner |
|---|---|---|
| `scripts/orch-cold-evict.sh` | Add backlog-lane eviction (currently absent): evict `backlog[]` rows with `status ∈ {DONE, CANCELLED, DEFERRED}` to the cold `backlog-detail.json` archive — same pattern as the existing `done`/`done_verified` eviction. | developer |
| `orch-apply.sh` (pre-rename check) | Enforce a HOT CEILING: after Zod validation, if candidate file size exceeds a configured threshold (e.g. 600KB — above the 537KB post-split baseline with headroom), BLOCK the write (non-zero exit) telling the caller to run `orch-cold-evict.sh` first. Currently size is logged in dry-run only, never gated. | developer |
| `docs/agents/pm/flow/main.md` + `docs/agents/dev-team/flow/` | Re-verify HSC-6 (evict-on-terminal hook) is actually wired — the regression implies it was either never wired or silently reverted; re-apply per the 06-26 spec. | architect (brownfield audit of what shipped vs. specced) → agent-father (re-wire if missing) |

**Acceptance criteria:**
1. `jq '.task_board.backlog | map(select(.status=="DONE" or .status=="CANCELLED" or .status=="DEFERRED")) | length'` == 0 in the hot file post-evict (currently 46+).
2. `wc -c docs/data/orch/orch-state.json` stays ≤ enforced ceiling across a week of normal ticks with no manual intervention.
3. A synthetic oversized candidate piped through `orch-apply.sh` is rejected with non-zero exit.

---

### 2.3 RC-GITSTATE (P1)

**Confirmed by:** `F7-COVERAGE-STATE-PURE-TIMESTAMP-CHURN` (`docs/data/coverage-state.json` — 58 tickers, both `last_covered_news_scout` and `last_covered_market_watcher` collapse to ONE distinct lockstep value each cycle despite both writer specs documenting PER-TICKER stamping in batches ≤3 — a real runtime deviation from spec, not a design gap; 59/59 numstat diff every commit, tracked not gitignored, 8 commits/2 days), plus the already-dirty `docs/agent-memory/modules/tool-usage-stats.json` in THIS session's own `git status` (pure regen churn, same class), and `F5-HOTFILE-CHURN-ORCH-STATE` (40% of commits touch one coordination file, addressed structurally by 2.2 but the underlying "state lives in git" pattern is broader).

| Target | Mechanism | Owner |
|---|---|---|
| `docs/agents/market-watcher/flow/cycle.md` §5c, `docs/agents/news-scout/flow/stage-log-notify.md` §4b | Fix the writer to actually stamp only the ≤3 tickers touched this cycle (matches their OWN spec) instead of bulk-rewriting all 58 rows to one instant. These are cowork-agent flow files. | **cowork-refactory-expert** (its stated remit — not agent-father, not developer) |
| `docs/agent-memory/modules/tool-usage-stats.json`, `docs/data/coverage-state.json` (post-fix, still per-ticker) | Pure-derived/regenerable files: `.gitignore` them; if a downstream reader needs the value, regenerate on demand or persist to SQLite (per the standing "SQLite+LanceDB local-only" rule) instead of a git-tracked JSON. Decouple "record a cycle ran" (telemetry) from "make a product commit" (git history) — telemetry writers must never `git add`/`git commit`. | developer |
| `docs/data/orch/orch-state.json` (the hot file itself) | Whether the HOT file should eventually move off git entirely is a bigger call than "unwedge the split that already exists" — flagged as a candidate follow-up spike, explicitly OUT OF SCOPE here (see §4 Non-goals). | — (deferred) |

**Acceptance criteria:**
1. `git log --since="7 days ago" --numstat -- docs/data/coverage-state.json` shows per-commit row-touch counts < 10 (not 58) once source writers are fixed.
2. `git ls-files | grep -E "tool-usage-stats\.json|coverage-state\.json"` returns EMPTY after the `.gitignore` migration (files still exist on disk, just untracked).
3. Count of commits whose diff touches ONLY pure-counter files drops to 0 post-migration (they can no longer be committed).

---

### 2.4 RC-CEREMONY (P2 — lowest priority, last)

**Confirmed by:** `F3-ROUTER-CEREMONY-OVERHEAD`, `F4-CEREMONY-IS-BUG-SOURCE`; `F2-COORDINATION-MACHINERY-IS-TOP-BUG-SOURCE` landed **PLAUSIBLE, not CONFIRMED** — the 78%/30% corpus stats (114/146 and 43/146 feedback files touching lock/race/coordination terms) are real, but the specific candidate root cause (per-client scoping "never shipped") is stale/overreaching per the adversarial pass. Treat this section as genuinely lower-confidence and keep it light — do not let it compete with Phase 1/2 above for scheduling priority.

| Target | Mechanism | Owner |
|---|---|---|
| `scripts/agents-flow/dev-team-tick-preflight.sh` `_step_sf1_claim()` | Already-filed live bug (not plan-only, sitting in backlog): the function is NOT re-entrant on the session's OWN held SF-1 — inspects only `.claimed`, returns phantom "peer holds it" SKIP for the full 90-min TTL. Fix: mirror `_step_fire_election()` (which DOES compare `current_holder.owner_client_session` and heartbeats on self-hold). Low-hanging, ready to dispatch. | developer |
| `cowork-tick-preflight.sh`, `dev-team-tick-preflight.sh`, `auditor-tier1-probe.sh` (post-1.1 generalization) | Extract shared SF-1/fire-election/presence claim logic into one sourced library (`scripts/agents-flow/tick-preflight-lib.sh`) so the lock/race/orphan/drift bug CLASS gets fixed once, not three times. | developer |
| Router / per-spawn election pattern | Audit whether multiple sub-agents per tick each re-claim presence/fire-election locks redundantly; consolidate to one claim per tick, threaded through sub-flows. | architect (audit) → developer (implement) |

**Acceptance criteria:**
1. Synthetic double-invocation of `_step_sf1_claim` from the SAME `session_id` returns claimed/re-entrant-renewed, not phantom-peer-SKIP.
2. `grep -rc 'task_claim.*task_kind.*sprint-task'` outside the shared library == 0 post-extraction.

---

## 3. Sequencing rationale

Phase 1 must land before Phase 2 is *measured* (not before it is *designed* — architect can start the RC-VERIF/RC-CONVERGE TECH doc in parallel): every Phase 2 acceptance criterion above relies on reading git history / commit cadence / signal closure rates, and those signals are currently 80%+ drowned in chore commits from the exact engines Phase 1 silences. RC-ORCHMONO and RC-GITSTATE further reduce noise but are not blocking for RC-VERIF/RC-CONVERGE, which can proceed against the orch-state file as it exists today (the Zod refinement doesn't care about file size). RC-CEREMONY is explicitly last — P2, one PLAUSIBLE-not-CONFIRMED finding, and its fixes are point patches to scripts Phase 1/2 already touch, so scheduling it concurrently risks merge collisions on the same files for no urgency payoff.

## 4. Non-goals (explicitly deferred — do not boil the ocean)

- **LOOP-04** (anomaly→backlog bridge, never fired) — confirm dead-vs-dormant before touching; separate spike, not part of this remake.
- **Moving `orch-state.json` itself off git** — bigger than "finish the split that already shipped once"; candidate follow-up after 2.2/2.3 land and are measured.
- **Full RC-CEREMONY library rewrite** beyond the two named point-fixes — the PLAUSIBLE verdict on its headline finding means further investment there should wait for a dedicated confirmatory pass.
- **Re-litigating the 8 blind spots** in the incident doc §8 (cost measurement, escape-rate quantification, etc.) — those are follow-up investigation, not remedy design.

## 5. Ownership summary

| Owner | Pieces |
|---|---|
| **po** | Promote 4 named backlog items out of PLAN-ONLY/BACKLOG (§1.2) |
| **pm** | Decompose Phase 1 dev-team/auditor tasks (§1.1) and Phase 2 RC-VERIF/RC-CONVERGE TECH doc (§2.1) into sprints |
| **architect** | TECH docs for RC-VERIF+RC-CONVERGE (§2.1), RC-ORCHMONO regression audit (§2.2), RC-CEREMONY election audit (§2.4) |
| **developer** | All script/schema/validator code: preflight scripts (§1.1), detector fixes (§1.2), generator cadence (§1.3), Zod gate + `DEGRADED` enum + bug_class fingerprint (§2.1), cold-evict + ceiling (§2.2), gitignore migration (§2.3), SF-1 re-entrancy + shared lib (§2.4) |
| **agent-father** | Thin flow-doc/persona edits only: dev-team/auditor JUMP-TO branches (§1.1), cron-detect-loop prompt wiring (§1.1), triage-signals.md/task-archive.md closure wiring (§1.2), project-stats.json deprecation comment (§1.3), fixer/qa flow wiring + pm.md/architect.md re-encoding (§2.1) |
| **claude-manager-helper** | Narrative-doc number→pointer edits in CLAUDE.md/mcp-tools.md/ARCHITECTURE.md (§1.3) |
| **cowork-refactory-expert** | Per-ticker stamping fix in market-watcher/news-scout flow files (§2.3) |

---

_Brief owner: agents-architect. Signal: `docs/signals/2026-07-04-systemic-remake.json` → agent-father (containment-now pieces it owns directly, plus routing note for pieces owned by po/pm/architect/developer/claude-manager-helper/cowork-refactory-expert per §5)._
