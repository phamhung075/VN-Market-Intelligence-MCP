<!-- size-justification: two-owner split design (developer script + agent-father flow rewire)
     covering both news-scout and market-watcher's identical prose recipe; keeping both sites in
     one brief is what proves the shared-script design actually eliminates the divergence risk
     AC2 names, rather than just documenting one site. -->
# Architecture Brief — Mechanize news-scout/market-watcher off-hours notebook self-commit

**Task:** FIX-NEWSSCOUT-OFFHOURS-SELFCOMMIT-PROSE-RECIPE-INTERMITTENT | **Zone:** `scripts/agents-flow/` (developer) + `docs/agents/news-scout/flow/`, `docs/agents/market-watcher/flow/` (agent-father) | **BUILD-STANDARD:** not-applicable (bug-fix — mechanizes an existing prose recipe, no new service/feature)

---

## 1. Root cause (confirmed, not re-derived from the row's own text alone)

Both `docs/agents/news-scout/flow/stage-log-notify.md:18-49` and `docs/agents/market-watcher/flow/cycle.md:283-308` carry a byte-for-byte-equivalent ~26-line conditional recipe: acquire a `task_claim` mutex (`<agent>-notebook:main`), check a same-tick clean-diff guard, `git add` + `git_commit_retry` with a trailing RULE-2.5 pathspec, `task_release` in a finally, BUG-channel escalation on genuine failure. This is prose an LLM agent re-derives and re-executes every off-hours cycle — and it demonstrably worked once (2026-08-22T20:09Z, commit `cea834da2`, c272) and then skipped on the very next off-hours tick (2026-08-23T12:05Z) despite sibling agents `market-watcher` (`6034efc1f`) and `alert-commander` (`28c3c2962`) committing cleanly on the identical tick under their own mutex keys — ruling out a shared-resource outage. A 26-line multi-branch conditional recipe has no mechanism forcing deterministic compliance; probabilistic execution IS the defect, independent of any single wrong step.

**Precedent for the fix shape** — `scripts/agents-flow/coverage-stamp.sh` (not `cowork-write-last-fired.js`, which has no MCP-call step) already solved the *exact* class: a prose recipe combining an MCP `task_claim`/`task_release` mutex with a deterministic file mutation, mechanized into one script by sourcing `scripts/agents-flow/mcp-call.sh` (`mcp_call "task_claim" ...` / `mcp_call "task_release" ...`) instead of requiring the calling LLM to issue those `call_tool`s itself. `mcp-call.sh`'s own header states it was "Built ONCE... do not reinvent this transport per script" — this task reuses it, does not reinvent it.

---

## 2. Design — one new script, two call sites

### `scripts/agents-flow/offhours-notebook-self-commit.sh` (new)

```
Usage: offhours-notebook-self-commit.sh --agent <news-scout|market-watcher> [--session ID] [--now ISO8601]
Env:   CLAUDE_CODE_SESSION_ID — owner_client_session for the mutex (same convention as
       coverage-stamp.sh); --session overrides.
```

Behavior (mirrors the prose 1:1, mechanized — no step becomes optional):
1. Resolve `NOTEBOOK=docs/agent-memory/notebooks/<agent>.md`, `MUTEX_KEY=<agent>-notebook:main` from `--agent` (reject any other value — caller error, exit 2, same class as `cowork-write-last-fired.js`'s unknown-slot-id guard).
2. `mcp_call "task_claim"` (`ttl_seconds=60`), same bounded retry as the prose (3 attempts, 5s apart). Exhausted → proceed unguarded, log `[<agent>] notebook-lock contended 3x — proceeding unguarded` (best-effort, non-fatal — matches existing policy verbatim, do not upgrade to fail-closed here).
3. Same-tick clean-diff guard: `git diff --quiet HEAD -- "$NOTEBOOK"`. Clean → print skip result, exit 0 (benign no-op — this is the eod.md-batch-landed-first case for news-scout, and the equivalent market/prepost-mode-deferred case for market-watcher). Dirty → continue.
4. `git add "$NOTEBOOK"`; commit with an inlined retry loop (the `git_commit_retry` idiom, `docs/protocols/head-lock-self-cure.md` § F4 — retry only on `index.lock`/`HEAD.lock`, max 3, 2s apart) with a trailing `-- "$NOTEBOOK"` pathspec (RULE 2.5 — never a bare `git commit`).
5. Commit success → print result JSON, exit 0.
6. Commit failure after retries (genuine failure) → fire the BUG-channel escalation **from inside the script itself** via `mcp_call "send_telegram"` (`channel="bug"`, message identical to the current prose's, per-agent). This closes the LAST prose-interpreted surface — today the escalation call is also something the LLM must remember to make; mechanizing it removes that too. Exit 1.
7. `task_release` unconditionally in a trap, regardless of which branch above was taken (mirrors the prose's `finally`).

Stdout: one JSON object (same contract shape as `coverage-stamp.sh`/`cowork-write-last-fired.js`) — `{"ok": bool, "action": "skipped_clean"|"committed"|"unguarded_committed"|"escalated_failure", "agent": "...", "notebook": "..."}` — so the calling agent reports status without interpreting anything.

Both flow docs collapse their 26-line block to:
```bash
bash scripts/agents-flow/offhours-notebook-self-commit.sh --agent news-scout
```
(and `--agent market-watcher` at the sibling call site) — one mandatory tool call, same shape as `cowork-write-last-fired.js`'s Step 5b replacement and `coverage-stamp.sh`'s Step 7 replacement already established in this same codebase.

### Test file: `scripts/agents-flow/offhours-notebook-self-commit.test.sh` (new, developer's zone)

Mirror `coverage-stamp.test.sh`'s fixture-repo + stubbed-`mcp_call` convention. Minimum scenarios: (a) clean-diff → skip, exit 0; (b) dirty notebook → commit lands, pathspec-scoped (assert no OTHER staged file gets swept in — this is exactly RULE 2.5's own regression class); (c) mutex contended 3x → unguarded commit still lands, warning logged; (d) commit fails all 3 retries → BUG escalation `mcp_call` invoked with the correct per-agent message, exit 1; (e) unknown/missing `--agent` → exit 2, no mutation attempted.

---

## 3. AC3 (stale header) + AC4 (recover uncommitted c273) — explicitly NOT actioned by architect

`docs/agent-memory/notebooks/news-scout.md` line 3 (`"212 cycles complete (c270 shipped)"`) is stale against the body's live `c273`, and that `c273` section is currently uncommitted **by design** — it is this row's own live evidence of the skip and must not be hand-committed this session (explicit constraint from the dispatch brief, honored here: file read for design purposes only, never staged/committed).

**Recommended disposition, not executed here:** AC4 is auto-satisfied by construction — the very next off-hours tick that runs the new script (post-cutover) will find the pending `c273` diff via the same clean-diff guard and commit it as ordinary operation; no separate manual recovery step is needed or safe to improvise ahead of that. AC3's one-line header correction should be folded into that SAME natural commit (bundle a 1-line header bump alongside whatever `c273`/next section is live when the cutover's first real run fires) — do not hand-edit the header out-of-band before then, since that would touch the same uncommitted file this session was told to leave alone. Flag for PM: sequence the cutover (script ships → flow docs repointed) BEFORE the next `news-scout-offhours` tick if at all schedulable, so the recovery happens under the NEW deterministic path rather than one more probabilistic pass of the old prose.

---

## 4. DDD / Layer notes

Pure infrastructure/tooling — no domain layer involved. `scripts/agents-flow/` is this repo's established location for cowork-orchestration actuators (`coverage-stamp.sh`, `cowork-write-last-fired.js`, `drain-signals.js`) — this script belongs in the same family, reusing `mcp-call.sh` rather than inventing a second MCP-from-bash transport.

## 5. Risk Flags

- **Reuse, don't reinvent:** `mcp-call.sh` is DRAIN-INJECTION-SAFE (`jq -n --arg`/`--argjson` binding, never string-concatenated into the request body) — the new script must build its `task_claim`/`task_release`/`send_telegram` argument JSON the same way, never hand-interpolate an agent-authored string.
- **Two call sites, one script:** AC2 explicitly requires this to prevent re-divergence. The developer PR must update BOTH `stage-log-notify.md` and `cycle.md` in the same change, or the fix only half-lands and the two agents can drift again (exactly the failure class this row exists to close, one level up).
- **Mutex key parameterization:** `--agent` must deterministically produce `<agent>-notebook:main` — do not accept a raw `task_id` override; that would let a caller accidentally alias the two agents' mutexes and reintroduce the deadlock the original design deliberately avoided (different keys "by design, so the two agents never deadlock on each other's own file").

## Test Strategy

Unit: `offhours-notebook-self-commit.test.sh` per §2. Integration: after the flow-doc rewire, the row's own `verification_gate` — three consecutive `news-scout-offhours` ticks leave `docs/agent-memory/notebooks/news-scout.md` clean in `git status` — is the real acceptance signal; QA/PO to confirm post-deploy, not fabricable in a unit test.

## Task-board disposition

`FIX-NEWSSCOUT-OFFHOURS-SELFCOMMIT-PROSE-RECIPE-INTERMITTENT`: `architect_design_complete=true`, `architect_handoff` → this file, `next_agent=pm` (two-owner split — pm decomposes into developer(script+test) → agent-father(both flow-doc rewires, depends on the script existing), same shape as the sibling UC-ASL-P3 design in this session and the live `FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE` / `FIX-AUDITOR-C04-FLOWDOC-REPOINT` precedent already on the board).

## NEXT

**pm** — decompose into the two-owner track described above.
