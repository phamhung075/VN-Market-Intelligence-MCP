# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · developer

**Sprint goal:** no active sprint goal matched this task; resolved per skill mechanical rule (latest active sprint_goal.entries row) — this task is an unrelated cross-service P1 FIX, ambient to this sprint slot.
**Agent:** developer
**Started:** 2026-08-09T07:41:00Z
**Continuation of:** sprint-COWORK-GUARANTEED-SLOT-CATCHUP-developer-5.md (CAP-REACHED 2026-08-09T03:41:00Z, byte axis 37871/36000)

---

### STEP developer-S94 · developer · 2026-08-09T07:41:00Z
**task-id:** FIX-DEVTEAM-IDLE-CHAIN-TEST-DURABLE
**what-done:** New `scripts/agents-flow/drain-signals-durable.test.js` (46 assertions): Scenario 1 (append→destructive, inbox fully populated), Scenario 2 (bounded1 short-circuit, REAL promote+claim jq scripts, inbox byte-identical), Scenario 3/3b (Step 1's own subtractive clear, byte-verbatim jq from main.md; concurrent-append survives), Scenario 4 (read-only orch dir → append fails, no destructive action, retry-recovery). Extended `orch-conservation-check.mjs` `signalTotal()` to sum `pending_triage_inbox` (TDD RED→GREEN). Added 2 `dev-standards.md` Script Persistence pointers.
**what-considered:**
- Reuse `drain-signals.test.js`'s harness via `require()` vs duplicate a tailored builder — chose duplicate: that file is a standalone script with top-level side effects, not an importable module (same convention it documents for itself).
- Scenario 2: hand-simulate bounded1's effect vs run the REAL `devteam-backlog-{promote,claim}-bounded1.jq` (+ `devteam-eligibility.jq` copied so `include` resolves — CWD-relative, verified empirically) — chose real scripts: a stub proves nothing about actual short-circuit safety.
- Scenario 4 failure mode: reuse the pre-existing "orch-state.json missing" case vs a genuinely new one — chose `chmod 0555` on the containing dir (fails inside `orch-apply.sh`'s own `mktemp`, not drain-signals.js's early-exit) — distinct code path, not a duplicate test.
**why-decision:** handoff's own Scenario 2 text ("run bounded1's promote/claim") only proves the negative control if the REAL scripts run; task's Risk section flags Scenario 4 retry/recovery as the hard part — added an explicit recovery-run assertion, not just the failure half.
**why-change:** no change from PM/architect's 4-scenario spec; added 2 supporting checks (backward-compat `// []` default, Conservation Guard Extension per Subtask 2's own AC) — both explicitly required by the handoff, not scope creep.
**verify:** RED confirmed (conservation-ext Case A failed pre-fix, 45/46) → GREEN (46/46) after 1-function fix. Regression: `drain-signals.test.js` 51/51, `orch-apply-wrapper-tests.sh` 75/75, `orch-state-hook.test.mjs` 21/21, `bun tsc --noEmit` 0 errors (no `.ts` touched). Repo-wide `bun test` times out >2min locally (pre-existing, unrelated to this change) — targeted/merge-gate suites above satisfy `dev-standards.md`'s own pinned reading (zero `.ts` files touched this task).

---

### STEP developer-S95 · developer · 2026-08-11T12:20:00Z
**task-id:** FIX-ORPHAN-FR7-VERIFY-TOOL-REGISTRY
**what-done:** Verified `docs/data/tool-registry.json`'s `task_heartbeat`/`task_release` entries against the FR-1/FR-2 params landed by sibling Tasks 1/2 — confirmed no edit needed, documented finding, no code change.
**what-considered:**
- Read the file itself first: both entries are bare name strings inside the `system` group's `tools[]` array — no per-tool object, no params/schema field anywhere in the file's shape (only `_maintained_by`/`lastUpdated`/`totalCount`/`groups[{name,count,tools[]}]`).
- Read `scripts/gen-tool-registry.ts` (the file's own header: `_maintained_by: "generator (do not hand-edit)"`) — its regex (`server\.tool\(\s*["']([^"']+)["']`) extracts ONLY the tool-name string literal, never the Zod schema/params block that follows — structurally cannot duplicate a param payload per-tool.
- Live-verified freshness rather than trusting the static file: `bun scripts/gen-tool-registry.ts --dry-run` → totalCount=183/groups=12/system=41, byte-identical to the committed file; ran `bun test tool-registry-parity.test.ts` (dedicated CI drift guard) → 17/17 pass.
**why-decision:** the subtask's own acceptance line permits "confirm no edit needed" as a valid outcome — verified via the generator's source (not assumption) that this file is structurally incapable of holding per-tool param duplication, so FR-1/FR-2's new `ttl_seconds`/`payload_patch`/`owner_agent`/`original_owner_client_session` fields (now split into `system/coordination/taskHeartbeatTool.ts`+`taskReleaseTool.ts` since Task 2 landed) cannot have caused drift here.
**why-change:** no change from plan — subtask 1 is the entire scope (single-subtask row), no edit required.
**verify:** `jq` inspection (both tools present once each, name-only, `system` group); generator dry-run matches committed file exactly; `tool-registry-parity.test.ts` 17/17 pass (dedicated drift guard already exists and is green).

---

### STEP developer-S96 · developer · 2026-08-11T15:14:14Z
**task-id:** FIX-COMMITCONVENTION-MANDATES-BARE-COMMIT-CONTRADICTS-LIVE-SWEEPGUARD-HARDBLOCK
**what-done:** Rewrote `docs/policies/commit-convention.md` line 38 MANDATORY RULE + § Notebook Commits template (was lines 106-108) to mandate pathspec-ON-the-commit-command (`git commit -m "..." -- <paths>`) as the only canonical form, consistent with the already-correct § Shell Pattern example; reconciled "index-only" to mean WHAT is committed (not `-a`'s sweep), not "bare commit is fine." Also fixed line 7's stale "no blocking commit-msg hook" claim to name the live `scripts/git-hooks/pre-commit` sweep guard. Updated the 3 downstream invariant restatements: `execute-tier.md` § Developer Spawn Constraint, `developer/flow/main.md` § After code step 4, `dev-frontend/flow/main.md` § After code step 3 — all now require the repeated trailing pathspec, not just a prior `git add`.
**what-considered:**
- Touch only lines 38+106-108 per the task's literal scope vs. also fix line 7's "only installed hook is pre-push" claim — chose to also fix line 7: verified live (`.git/hooks/pre-commit` symlinked to `scripts/git-hooks/pre-commit`, confirmed installed) that leaving it would preserve the exact doc/reality contradiction this row exists to close, in the same file, one section up.
- Did not touch `scripts/git-hooks/pre-commit` itself — task explicit: hook is correct, doc was wrong.
**why-decision:** the hook's own stderr text (`git commit -m "<msg>" -- <only-your-own-files>`) is the ground truth this policy doc must mirror; grepped all 4 files post-edit to confirm zero remaining bare-commit mandates.
**why-change:** no change from task scope — line-7 fix is a strict subset of "reconcile the index-only framing," not new scope.
**verify:** grep across all 4 touched files confirms every `git commit -m` invariant/template now carries a trailing `-- <paths>` pathspec (existing notebook-commit lines in `developer/flow/main.md:147` and `dev-frontend/flow/main.md:185` were already correct and untouched). No `apps/` TS/Go touched (pure docs) — `bun test`/`tsc` N/A. Committing this change itself with an explicit pathspec on the commit line (session sweep-guard warn-budget exhausted, bare commit would hard-block).

---

### STEP developer-S97 · developer · 2026-08-11T15:45:00Z
**task-id:** FIX-CRON-CODEJANITOR-NO-PRESPAWN-GATE-BOOTS-FULL-SESSION-4X-DAILY
**what-done:** New `scripts/agents-flow/code-janitor-tick-preflight.sh` mirrors `db-integrity-probe.sh`'s SKIP-SPAWN/SPAWN verdict shape per the ratified brief §3: Branch A (src diff non-empty, same scope as main.md's CADRAT-3 Pre-Check) spawns unchanged; Branch B (diff empty) runs the 3 deterministic sweeps directly, commits whatever they moved (DELTA-scoped `git status`, explicit pathspec), spawns only on SIGNAL-WRITTEN/safe-fail/non-trivial Cold Archive. Updated `cron-code-janitor.md` (authoring SSOT) + `register-job-code-janitor.md` (ported verbatim) CronCreate prompts to branch on the gate's exit code.
**what-considered:**
- Have the gate itself deterministically append the `.signal_queue.rows[]` row on SIGNAL-WRITTEN vs. keep it a SPAWN trigger — rejected auto-append: `memory-prune-sweep.sh`'s own header states that boundary is deliberately the FLOW's job, not the script's; kept SIGNAL-WRITTEN as a brief-literal SPAWN trigger instead.
- Deep-dived a real correctness gap the brief's literal text missed: since THIS gate runs the sweep once, a later subagent re-run of the same idempotent script sees SIGNAL-SKIP, and main.md's existing "skip on SIGNAL-SKIP" text would silently drop a genuinely-new payload's signal row. Closed via a PRE-GATE CONTEXT instruction threaded through the CronCreate prompt text itself (dynamic per-tick narration), not a `main.md` edit — out of this task's file list.
- git-status DELTA-diffing (before/after snapshot, scoped to `docs/agent-memory/`+`docs/handoffs/`) over regex-parsing sweep log lines for commit paths — the repo's own dirty tree at authoring time (many unrelated concurrent-agent files) proved a directory-wide add would have swept up unrelated pending work; delta-diffing is immune to that and to log-message format drift (the exact "gate scope silently drifted" class the brief's §5.2 flags).
**why-decision:** mirrors the ratified, PO-approved brief's recommendation exactly (deterministic shell gate only, no LLM/local-model pre-gate — brief §4 explicitly rejected that pattern given 3 documented live instances of it silently disabling itself) while closing one real bug the brief's prose left implicit.
**why-change:** brief's literal SIGNAL-WRITTEN handling extended (not replaced) with the PRE-GATE CONTEXT prompt instruction — same trigger, closes a genuine pointer-integrity-leak risk, no `main.md` scope creep.
**verify:** `scripts/agents-flow/code-janitor-tick-preflight.test.sh` 27/27 pass (stubs `_git_diff_src_files`/`_git_status_scoped`/`_run_*_sweep`/`_commit_paths` wholesale, never touches real git or the real sweep scripts — 2 real subshell-isolation bugs found+fixed live during TDD: a mutable call-counter and a `_commit_paths` state var both invisible across the `$(...)` command-substitution boundary, fixed via an explicit phase-arg and a file-backed log respectively). `shellcheck` clean on both new files. BSD-sed portability bug found+fixed live (`\+` unsupported without `-E` on this macOS host's `/bin/sed` — switched to `[0-9][0-9]*`). Commit `1d5e55d75`, pathspec-scoped (4 files: the 2 cron docs + the 2 new scripts), no `-a`/`-A`.

---
