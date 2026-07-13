# PO — Step PUSH-BACKSTOP (Auto-Push, SECONDARY Best-Effort)

**Parent flow:** `docs/agents/po/flow/main.md` § Step PUSH-BACKSTOP — runs at EVERY PO tick exit (idle path before `JUMP TO end`; non-idle path after `sprint-kickoff.md`/`review-ba-spec.md`/`sprint-signoff.md` returns, before notebook commit).
**Relocated:** TE-T09b (TOKEN-ECONOMY-AUDIT), verbatim/byte-identical extraction of the step body formerly inlined in `main.md` (lines 111-190).

---

<!-- jump:push-backstop -->
## Step PUSH-BACKSTOP — Auto-push when ahead > threshold (SECONDARY best-effort)

> **NO LONGER THE PRIMARY TRIGGER** (FIX-AUTO-PUSH-TRIGGER-NOT-FIRING, 2026-06-18).
> This tick-exit step NEVER fired in autonomous operation: PO is spawned by the dev-team
> router ONLY as a background triage sub-agent (returns BATCH/NOTHING), and the triage
> sub-flows RETURN straight back to the router — control never reaches this step. The
> authoritative trigger is now the dedicated launchd timer `com.vn-market.fleet-push`
> (`launchd/com.vn-market.fleet-push.plist`, every 30 min). This step is RETAINED only as
> a harmless opportunistic best-effort for the rare case PO main.md actually runs to exit
> on a real router tick. SSOT: `docs/standards/cron-jobs.md` § "Push Backstop (dedicated launchd timer)".

**Rationale (legacy Option-B — superseded):** Threshold-checked push was intended to fire inside the PO post-triage tick, adding zero new always-on components. This proved structurally wrong (see above box). Reference: `docs/standards/cron-jobs.md` § "Push Backstop (dedicated launchd timer — Option-A, PIVOTED 2026-06-18)".

**Placement:** Runs at EVERY PO tick exit:
- On the idle path (all-empty No-Task Guard → `JUMP TO end`): run this step BEFORE the JUMP.
- After each non-idle branch workflow returns (`sprint-kickoff.md`, `review-ba-spec.md`, `sprint-signoff.md`): run this step before committing the notebook and exiting.

### Threshold Probe

```bash
ahead=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)
```

If `ahead` is not greater than `${PUSH_THRESHOLD:-20}` → skip entire step (no-op, proceed to notebook commit + exit).

If `ahead > ${PUSH_THRESHOLD:-20}` → proceed to safety guards below.

### Safety Guard 1 — Real push-blocker (in-progress rebase/merge or index.lock)

> **DO NOT guard on working-tree file dirtiness.** The push runs in a `git worktree add … HEAD`
> sandbox operating on COMMITTED HEAD — fully isolated from the dirty main working tree.
> orch-state.json + notebooks are PERPETUALLY dirty (constant cowork churn — the exact
> premise this worktree push exists to overcome), so a file-dirtiness skip blocks the push
> on ~every tick and the backstop never fires (defect FIX-AUTO-PUSH-GUARD1-DEFEATS-PURPOSE).
> A dirty main tree CANNOT race a worktree-isolated push. The only legitimate
> push-blocker is a half-finished git operation on the main repo.

```bash
push_blocker=""
[ -d .git/rebase-merge ] || [ -d .git/rebase-apply ] && push_blocker="rebase-in-progress"
[ -f .git/MERGE_HEAD ]   && push_blocker="merge-in-progress"
[ -f .git/index.lock ]   && push_blocker="index.lock-present"
```

If `push_blocker` is non-empty: the main repo is mid git-operation — **SKIP** this tick, send Telegram WORK, proceed to notebook commit + exit:

```
[po] PUSH-BACKSTOP: ahead=${ahead} > ${PUSH_THRESHOLD:-20} but BLOCKED — main repo ${push_blocker}. Will retry next tick.
```

Call: `mcp__gateway__call_tool(server="vn-market", tool="send_telegram", arguments={channel: "work", message: "<above text>"})`

### Safety Guard 2 — Commit-mutex held (agent mid-commit)

```
mcp__gateway__call_tool(server="vn-market", tool="task_list_held", arguments={kind: "commit-mutex"})
```

If the returned `count > 0`: a commit is in flight. **SKIP** this tick — send Telegram WORK (same message as Guard 1) and proceed to notebook commit + exit. The commit-mutex TTL is 90s; the next PO tick (~15 min) will always find a clear mutex.

### Invoke Script (guards passed)

Both guards cleared → invoke the already-shipped, qa-approved script:

```bash
bash scripts/fleet-worktree-push.sh
```

The script (committed 26807a41) owns all divergence-reconcile, tsc-gate, and push logic. Do NOT re-implement its logic here. The script exits 0 on success (sends Telegram WORK) or 1 on abort (sends Telegram BUG). Exit code is non-fatal to the PO flow — log it and proceed to notebook commit.

**Script interface summary (read `scripts/fleet-worktree-push.sh` for full spec):**
- Env: `PUSH_THRESHOLD` (default 20, tunable without rebuild)
- Flags: `--dry-run` (print only, no push, no Telegram)
- Exit 0: pushed successfully, notified WORK channel
- Exit 1: aborted (tsc red / behind-set touches CODE not in HEAD / merge conflict / push failed), notified BUG channel **AND emits a `docs/signals/fleet-push-abort-{reason}-{ts}.json` signal_queue row** (`type:auto-push-abort`, to `po`, priority `high`) so the orch loop can SEE divergence — previously aborts were BUG-telegram-only and the board was BLIND to them (which is why the two-dot false-abort sat unnoticed for days — FIX-AUTO-PUSH-ABORT-SIGNAL-TRACKING). PO's signal-dashboard pre-check surfaces these under `## po`.
  - **Behind-set classifier (durable):** the script aborts only when the origin behind-set touches **code/config** paths (anything NOT in `docs/**`, `*.md`, `orch-state.json`, `docs/signals/**`, `cowork-schedule.json`, `docs/agent-memory/**`, `scripts/*.jq`). It classifies by WHAT changed, not the commit-message prefix — so benign `Merge` + `docs(reports):` + cowork `chore(...)` + churned `scripts/*.jq` triage helpers (the routine accumulation on origin) never abort the auto-push. (Was a message-prefix `chore(`/`ci(` allow-list that aborted ~every run on `Merge`/`docs(` commits — FIX-AUTO-PUSH-GUARD1-DEFEATS-PURPOSE.)
  - **THREE-dot diff range (FIX-AUTO-PUSH-TWODOT-FALSE-ABORT, 2026-06-19):** the classifier diffs `HEAD...origin/main` (THREE-dot = merge-base→origin = the behind-set's OWN changes), NOT `HEAD..origin/main` (two-dot = symmetric tip diff, which ALSO surfaces LOCAL's unpushed AHEAD code edits). The fleet perpetually carries ahead `*.ts` fixes, so the two-dot range mis-read them as "behind-set touches code" and FALSE-ABORTED every cycle even when origin's behind-set was pure chore. (The `behind=` COUNT uses two-dot `rev-list` correctly — that's reachability, not a content diff.) Gate: `scripts/test-fleet-push-classifier.sh` builds real throwaway repos with local-ahead-code + chore-behind and asserts two-dot would abort while three-dot proceeds.
  - **BOUNDED tsc gate (FIX-AUTO-PUSH-TSC-GATE-HANG, 2026-06-19):** the pre-push `pnpm --filter vn-market check` (`bun tsc --noEmit`) HUNG forever in the worktree (alive ~2h, 0.02s CPU) — it resolved deps through the node_modules SYMLINK (Step 10) and blocked. launchd uses `StartInterval` (no per-run kill), so a hung run STARVES every future push (auto-push DEAD until killed by hand). FIX: the gate now runs under a hard `TSC_GATE_TIMEOUT`s wall-clock cap (default 180s; settable in script header + plist env) via `run_bounded` — a perl process-group watchdog, because macOS has **no** `gtimeout`/`timeout`. Semantics: rc 0 = green→proceed; rc 1 = tsc ran & returned non-zero = GENUINE red→HARD ABORT (`tsc-red` signal); rc 124 = HUNG/bounded-out → the gate is REDUNDANT (the pushed commits were already tsc-gated at commit time by the local pre-push hook + origin CI, and Step 7 already hard-aborts on any code-touching behind-set), so SKIP the gate, emit a `tsc-gate-timeout-skipped` signal, and PROCEED to push — a bounded skip keeps the push alive where a hard-abort would make it dead every cycle (same end-state as the hang; memory feedback_graceful_degrade_needs_bounded_fetch). Gate: `scripts/test-fleet-push-classifier.sh` sources the shipped `run_bounded` and asserts rc 0/1/124 + no-orphan after a hang.
- Invariants: NEVER touches main working tree; NEVER `--force`; NEVER pushes around a GENUINELY red tsc tree (rc1); the tsc gate is BOUNDED and can NEVER hang the launchd job (rc124 → skip+proceed, redundant gate)
