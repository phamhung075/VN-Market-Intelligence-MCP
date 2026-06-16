<!-- size-justification: 130L — thin dispatcher; sub-flow routing table + BATCH schema spec + JUMP TO anchors + notebook-write skill route are tightly bound. Cross-file sub-flows live in `po/triage-*.md`, `po/channel-audit.md`, `po/sprint-*.md`. -->
# Product Owner — Main Flow (Thin Dispatcher)

**Tools:** `docs/agents/tools/package/po.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

## Input
`docs/data/orch/orch-state.json` `.task_board` blockers | `.sprint_goal` | `docs/data/project-stats.json` | latest `reports/TASK_REPORT_*.md` | `pendingSignals[]` from dev-team

## Output
`docs/data/orch/orch-state.json` `.sprint_goal` vision | BA task in `.task_board` | sprint sign-off | BATCH return to dev-team

---

## Role in dev-team flow
> Canonical orchestration: `docs/agents/dev-team/flow/main.md`

**Called from:** dev-team Step 1 — triage all inputs and classify work
**Receives:** `pendingSignals[]` from Step 0a | `read_telegram_reports(status="new")` | `list_unresolved_reports()` | `docs/data/orch/orch-state.json .task_board` | `git log --oneline -30` | `git branch`
**Produces:** `NOTHING` (→ idle EXIT) or `BATCH([{type, id, title, desc, size?, files, baseline_pass, zone?}])` where type ∈ {FIX, SPIKE, SPRINT-S, SPRINT-M, SPRINT-L, UNBLOCK, CLEAN}
**Hand off to:** main terminal — routes batch by type into Step 2 (planning) or Step 3 (direct FIX)
**Composes with:** architect/ba/pm in Step 2 (never directly — main terminal is the router)

Priority order: recurring bugs → UNBLOCK → FIX → CLEAN → SPRINT-S → SPRINT-M/L
> Task size rules → docs/standards/task-size-rules.md
CLEAN: flag any branch with 0 unmerged commits (`git log main..<branch> --oneline` empty) or stale worktree → route to qa.
SPIKE: exploratory question, no clear scope. Output: findings doc. Time-box default 2h. Schema below.

**Every FIX/SPRINT-* entry MUST carry `zone:`** — one of: `apps/<service>/` (single zone), `multi` (architect must split), or `cross-service/` (genuine root/scripts work — routes to generic developer). dev-team Step 3 reads this field; missing zone = batch rejected back to PO.

**SPIKE batch entry schema:**
```
{
  type: "SPIKE",
  id: "SPIKE_NNN",
  title: "<kebab-topic>",
  question: "<the actual question to answer>",
  mode: "spike",
  zone?: "apps/<service>/",
  timebox?: <minutes>          # default 120
}
```

---

## Dispatch — Fluid JUMP TO

JUMP-TO convention → skill: `.claude/skills/jump-to/SKILL.md` · in-file jumps use `JUMP TO <label>`; cross-file routes use `→ Run sub-flow: <path>`.

| Spawn context | First action |
|---|---|
| Cron / dev-team spawn (triage) | JUMP TO `tnb-audit` (pre-flight chain auto-falls through to `no-task-guard`) |
| BUG channel report only | JUMP TO `channel-audit` |
| Triage finished, found backlog → kick off sprint | → Run sub-flow: `docs/agents/po/flow/sprint-kickoff.md` |
| BA returned a spec for review | → Run sub-flow: `docs/agents/po/flow/review-ba-spec.md` |
| QA signalled sprint complete | → Run sub-flow: `docs/agents/po/flow/sprint-signoff.md` |

Never inline both pre-flight and a branch workflow — keep context lean. Pre-flight always runs first, then route to the right sibling and EXIT via its RETURN block.

---

**Pre-check — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`

**Pre-check — Signal dashboard** → skill: `.claude/skills/signal-dashboard/SKILL.md` (§ READ)
- Scan `## po` section for NEW rows. For each: read payload → add to triage context. Mark READ.
- Log: `"[dashboard] {N} new signals"` or `"[dashboard] inbox empty"`. Never fail-loud.

**Pre-check**: `$PROJECT_ROOT/docs/data/orch/orch-state.json` `.task_board` blocked tasks waiting for PO → handle first

<!-- jump:tnb-audit -->
## Step 0-TNB — Read TNB Audit Findings (MANDATORY)

→ Run sub-flow: `docs/agents/po/flow/triage-tnb.md`

Feeds findings into Step 1 sprint planning. ACK appended to `docs/handoffs/tnb-audit-latest.md`.

<!-- jump:triage-signals -->
## Step 0-SIG — Triage pendingSignals[]

→ Run sub-flow: `docs/agents/po/flow/triage-signals.md`

MANDATORY when dev-team passed signals. Each `pendingSignals[]` entry routed per signal-type table. If `pendingSignals[]` empty → JUMP TO `channel-audit`.

<!-- jump:channel-audit -->
## Step 0 — Channel Audit + Cross-Check

→ Run sub-flow: `docs/agents/po/flow/channel-audit.md`

Reads MARKET/WORK/BUG/market-group (10 msgs each), classifies issues by 9-row failure-signal table, cross-checks against TASKS.md + git + container state (4-row decision matrix). New FIX/SPRINT tasks carry `zone:`.

---

<!-- jump:no-task-guard -->
## No-Task Guard

After pre-flight runs, check:
1. `docs/data/orch/orch-state.json` `.task_board` — any pending/in-progress tasks? → handle first
2. `read_telegram_reports(status="new")` — any user requests? → handle first
3. Step 0 found issues? → self-initiate sprint from those findings
4. All empty AND channels clean → JUMP TO `end` and return:
```
## RETURN
DONE: No tasks, no user requests, channels clean
NEXT: idle (next cron tick will retry — autonomous mode never returns to user when channels are clean)
PIPELINE: idle
```

**PO CAN self-initiate** when channel audit found bugs, strategy errors, UX issues, or logic problems — these are the sprint backlog. To kick off → jump to `po/sprint-kickoff.md`.

## Branch Workflows (load only the one you need)

| Caller intent | File |
|---|---|
| Triage finished, backlog found → kick off new sprint | `po/sprint-kickoff.md` |
| BA returned a spec for review (`docs/REQ_NNN.md`) | `po/review-ba-spec.md` |
| QA signalled sprint complete (`reports/SPRINT_REPORT_NNN.md`) | `po/sprint-signoff.md` |

Do not inline these workflows here — that's the whole point of the split.

---

**Signal write rule:** When PO emits a `docs/signals/*.json` file, filename MUST follow the contract:
`po-{ISO-8601-timestamp}.json` (e.g. `po-20260521T194519Z.json`). Timestamp via `date -u +%Y%m%dT%H%M%SZ`. Sprint/task references belong in the `payload` field — never in the filename. SSOT → `docs/standards/mcp-tools.md` § Signal Bus — Naming Contract.

**Decision journal** (mandatory — before marking any task DONE/REVIEW):
→ skill: `.claude/skills/decision-journal/SKILL.md` § Write Entry [task_id: "<active task_id from task_board — e.g. BA-NNN or the sprint task PO is closing>"]
Write at minimum ONE entry per task you complete stamped with its task-id. Routine work: `what-considered: "only path: <reason>"`, `why-change: "no change from plan"`.

**Notebook write** (end of every cycle) → skill: `.claude/skills/notebook-write/SKILL.md` (OVERWRITE, target ≤50L). Skill handles body discipline + Carry-over block.

> Invariant: timestamp = current UTC, never future, never speculative. ALWAYS get via `date -u +"%Y-%m-%dT%H:%M:%SZ"` before any ACK append or notebook header.

**Commit notebook** (mutex-guarded):
```
→ skill: .claude/skills/commit-mutex/SKILL.md
  own_paths: ["docs/agent-memory/notebooks/po.md"]
  intent:    "chore(memory/po): notebook YYYY-MM-DD"
```
Convention: `docs/policies/commit-convention.md` § Notebook Commits

**Reusable triage scripts** (idempotent backlog appends — atomic temp→verify→rename):
- `scripts/po-s50-origin-lag-triage.jq` — append a PLAN-ONLY task to `.task_board.backlog`, skipping if `id` already present.
- `scripts/po-s51-cowork-guaranteed-backstop-groom.jq` — append a READY task to `.task_board.ready` (idempotent across all board arrays) + flip a tnb signal row NEW→RESOLVED in one atomic pass. Pattern reusable for any "groom one task + resolve its source signal" single-signal triage (`--arg now`, CAS-guard the rename).
- `scripts/po-s52-chart-range-triage.jq` — dual-mutation triage: promotes `ALLZERO-OHLCV-FETCH` backlog→ready (scope + regression note) and idempotently appends `FIX-FE-CHART-PRICE-DOMAIN` to ready[]. Originated from 2026-06-14 user BUG report (zero-candle / sliver chart). Usage: `jq --arg now "$NOW" -f scripts/po-s52-chart-range-triage.jq docs/data/orch/orch-state.json`.
- `scripts/po-s50-cron-umbrella-hold-backlog-triage.jq` — multi-mutation cycle triage: HOLD-OPEN an umbrella sprint on a future LIVE re-verification gate (G-gate), mark superseded child dups, append id-guarded ready/backlog tasks, and flip NEW signal_queue rows → RESOLVED in one atomic pass. Reusable pattern for "umbrella mechanism-complete but outcome-gate pending market-day + drain signal backlog". Usage: `jq --arg now "$NOW" -f scripts/po-s50-cron-umbrella-hold-backlog-triage.jq docs/data/orch/orch-state.json` (atomic temp→`[ -s ]`→rename; commit orch-state by EXPLICIT PATH).
- `scripts/po-s54-rsi-pair-dispatch-ready-prune.jq` — single-pass tick triage: PRUNE stale `ready[]` entries that already carry a terminal status (relocate each to `done_verified[]`/`done[]` by status, de-dup guarded — never drop) + DISPATCH a chosen id-set `ready`→`in_progress` with dispatch stamps + annotate held in_progress/parked-review dispositions, all atomically. Reusable pattern for "the ready[] array drifted (false ready[N]) — reconcile to status-correct arrays AND dispatch this tick's real backlog in one pass". Harness adds a CONSERVATION guard (total entries across the 5 board arrays must be unchanged — pure relocation, catches an append/move that loses or duplicates an entry). Usage: `jq --arg now "$NOW" -f scripts/po-s54-rsi-pair-dispatch-ready-prune.jq docs/data/orch/orch-state.json` (atomic temp→`[ -s ]`→`jq empty`→array-shape→conservation→rename; commit orch-state by EXPLICIT PATH).
- `scripts/po-s55-health-recheck-wave2-triage.jq` — single-pass stale-backlog drain triage: enrich a bare backlog row (owner/zone/scope), id-guarded MINT of N new FIX tasks (one HELD with a `depends`+`hold_reason` on a future behavioral gate), and PROMOTE a chosen id-set backlog→ready (`status=READY`), all atomically. Originated 2026-06-15 draining 36 never-drained health-recheck reports (3142..3180) where most dedup'd to done_verified/live-recovered. Reusable pattern for "drain a stale detect→fix backlog: dedup against done_verified + live, enrich+mint only the still-broken-NOW, hold the gate-overlapping one". Harness adds a CONSERVATION guard (post-backlog == pre-backlog + mints − promotions; post-ready == pre-ready + promotions). Usage: `jq --arg now "$NOW" -f scripts/po-s55-health-recheck-wave2-triage.jq docs/data/orch/orch-state.json` (atomic temp→`[ -s ]`→`jq empty`→conservation→rename; commit orch-state by EXPLICIT PATH).
- `scripts/po-s60-bctc-outage-doublefire-triage.jq` — single-pass dev-team :07 multi-mutation triage: id-guarded MINT of N tasks → `ready[]` (one P0 recon-first NOT-a-coding-lane + several deferred-because-owner-BUSY roots), ANNOTATE an existing backlog recurrence (recurrence_count bump, no dup of the new outage report), and ACK a `signal_queue.rows` row NEW→READ (READ not RESOLVED until fixes ship), all atomically. Originated 2026-06-15 (BCTC pipeline 2nd-recurrence outage + offhours-gatherer double-fire). Reusable pattern for "a real recurring outage + a multi-root cowork signal land in the same tick — recon-first the outage, dedup against the existing handoff, mint+defer the roots by owner-busy state". Harness: CONSERVATION guard (ready += exactly N mints, backlog length unchanged, total += N) + HARD-CONSTRAINT guard (a named review[] row stays untouched) + signal-ack guard. Usage: `jq --arg now "$NOW" -f scripts/po-s60-bctc-outage-doublefire-triage.jq docs/data/orch/orch-state.json` (atomic temp→`[ -s ]`→`jq empty`→conservation→guards→rename; commit orch-state by EXPLICIT PATH).
- `scripts/po-s53-builder-prune-codify-triage.jq` — single-task weekend (market-independent / infra) triage: id-guarded PROMOTE of a FIX task into `.task_board.ready[]` with full spec (root_cause/fix_spec/generic_mandate/verification_gate/size), skipped if id present in ANY board array. Originated from the 3rd-recurrence (2026-06-14) host disk-full ENOSPC from Docker build-cache; codifies `docker builder prune -f` into the shared ops rebuild flow. Reusable pattern for "promote one fully-specced infra FIX to ready, idempotent". Usage: `jq --arg now "$NOW" -f scripts/po-s53-builder-prune-codify-triage.jq docs/data/orch/orch-state.json` (atomic temp→`[ -s ]`→`jq empty`→rename; commit orch-state by EXPLICIT PATH).
- `scripts/po-s62-factory-maintainability-mint.jq` — bulk epic-mint triage: id-guarded MINT of an entire zone-routed audit backlog into `.task_board.backlog[]` under a named epic, pulled from the audit `.output` via `--slurpfile` (carries task_id/title/priority/dev_agent/zone/effort/risk/rebuild_required/dod/depends_on — never retyped), PLUS a CI-guardrail cluster (one row per guardrail + an architect spike umbrella listing its children), tagging a named fast-track id-set (`fast_track:true`) and attaching a per-task NOT-NULL caution where a fix could relocate a mask. All rows `status:BACKLOG` (never promoted to ready[]); fully idempotent (re-run mints 0). Originated 2026-06-15 minting the 94-task maintainability factory-audit (Workflow wl2ia1tk8) + 7 CI guardrails. Reusable pattern for "a read-only factory/audit Workflow produced an N-task backlog + guardrail set — mint the whole program under one epic without promoting, dedup against the live board, surface the fast-track wave and any mask-relocation caution". Harness: CONSERVATION guard (backlog += N tasks + M guardrails + 1 spike; ready/in_progress/review/done/done_verified byte-unchanged) + CAS mtime-retry + idempotency re-run (delta 0). Usage: `AUDIT=<.output>; NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg now "$NOW" --slurpfile audit "$AUDIT" -f scripts/po-s62-factory-maintainability-mint.jq docs/data/orch/orch-state.json` (atomic temp→`[ -s ]`→`jq empty`→conservation→CAS→rename; commit orch-state by EXPLICIT PATH; PUSH held — PO's deferred call).
- `scripts/po-s66-head-ssot-collapse-reconcile.jq` — single-head-SSOT collapse + reconcile: RECONCILES top-level `.head` to the most-recent real dispatch, COLLAPSES the deprecated `.task_board.head` to a non-routing redirect stub, and flips the originating signal row NEW→RESOLVED — all atomic, idempotent. Origin 2026-06-15 signal `head-drift-po-s64-vs-task-board-head` (RECURRING ROOT: po-s65/po-s54 scripts wrote `.task_board.head` while dev-team flow Step 0b + orch-state-access.md §2 + router-d1-claim read TOP-LEVEL `.head`, so the dispatch went invisible to flow-resume). Durable fix shipped alongside: the 3 offending writer scripts retargeted to top-level `.head`; canonical-head rule + write-guard documented in `docs/standards/orch-state-access.md` §4. Reusable pattern for "two divergent-writer pointer fields drifted — collapse to the one the consumers read, redirect-stub the other, retarget every writer". Usage: `NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg now "$NOW" -f scripts/po-s66-head-ssot-collapse-reconcile.jq docs/data/orch/orch-state.json` (atomic temp→`[ -s ]`→`jq empty`→CAS-mtime→rename; commit orch-state by EXPLICIT PATH).
- `scripts/po-s71-erraudit-w2-done-verified-w3-fold.jq` — single-pass dual-mutation SIGN-OFF triage: RELOCATE a named review[] row → done_verified[] with RAW-verify provenance stamps (idempotent — no-op if already in done_verified), PLUS FOLD a concrete site-list into an EXISTING backlog row in-place via a `.folded_sites` marker (idempotent, guarded by marker presence — NO SSOT duplicate-key when the wave-N+1 task already exists). Originated 2026-06-16 signing off FIX-ERRAUDIT-W2-MCP-DATALAYER + folding qa's 15 out-of-scope surviving-bare-catch sites into the pre-existing W3-MCP-P2. Reusable pattern for "QA approved task N; flip it done_verified AND fold the out-of-scope same-anti-pattern sites qa found into the already-existing next-wave backlog row (never mint a dup)". Harness: CONSERVATION (review −1, done_verified +1, backlog UNCHANGED, total unchanged) + row-move/fold-once invariant. Usage: `NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg now "$NOW" -f scripts/po-s71-erraudit-w2-done-verified-w3-fold.jq docs/data/orch/orch-state.json` (atomic temp→`[ -s ]`→`jq empty`→conservation→invariant→rename; commit orch-state by EXPLICIT PATH; PUSH held).
- `scripts/po-s72-w1-pek-p0-promote.jq` — single-task groom+promote: PROMOTE a named READY-FOR-GROOMING backlog row → ready[] with full grooming/promotion stamps + `next_agent` for the router lock-claim+spawn chain. Idempotent: skipped entirely if the id is already in ANY non-backlog lane (re-run promotes 0). Originated 2026-06-16 promoting FIX-ERRAUDIT-W1-PEK-P0 into a freed coding slot once its SAME-ZONE dependency (RASTERIZE) reached done_verified. Reusable pattern for "a dependency cleared + the zone is free + coding WIP has a slot — promote one fully-specced unblocked backlog task to ready for the router, po does NOT spawn". Harness: CONSERVATION (backlog −1, ready +1, others unchanged) + promote-once invariant. Usage: `NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg now "$NOW" -f scripts/po-s72-w1-pek-p0-promote.jq docs/data/orch/orch-state.json` (atomic temp→`[ -s ]`→`jq empty`→conservation→rename; commit orch-state by EXPLICIT PATH; PUSH held).
- `scripts/po-s73-w1-pek-p0-signoff-w2-frontend-dispatch.jq` — single-pass SIGN-OFF + NEXT-WAVE-DISPATCH triage: RELOCATE a named coding task in_progress[] → done_verified[] with full RAW-verify provenance stamps (idempotent — no-op if already in done_verified), PLUS PROMOTE the next wave's first unblocked backlog row → ready[] (status=READY, `next_agent`) with grooming/promotion stamps, PLUS SET top-level `.head` to dispatch that task's first agent — all atomic. Idempotent: relocate guarded by done_verified membership, promote skipped if id already in ANY non-backlog lane. Originated 2026-06-16 signing off FIX-ERRAUDIT-W1-PEK-P0 (last of Wave-1, RAW-verified live DB+pytest) and kicking off the Wave-2 frontend hop (FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH, ba) — its sequence_after dep (W2-MCP-FETCH-DEADLINE) already done_verified so the inner-first gate is satisfied. Reusable pattern for "QA approved coding task N (last of a wave) — flip it done_verified AND promote the next wave's first unblocked backlog task to ready + point the canonical head at its first agent, in one pass; po does NOT spawn". Harness: CONSERVATION (in_progress −1, done_verified +1, backlog −1, ready +1, review/done byte-unchanged, total unchanged) + relocate-once/promote-once + head-points-to-promoted invariants. Usage: `NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg now "$NOW" -f scripts/po-s73-w1-pek-p0-signoff-w2-frontend-dispatch.jq docs/data/orch/orch-state.json` (atomic temp→`[ -s ]`→`jq empty`→conservation→invariant→rename; commit orch-state by EXPLICIT PATH; PUSH = PO's call).
- `scripts/po-s74-sla-test-ts2367-unblock-push-promote.jq` — single-task PUSH-UNBLOCK promote+escalate: PROMOTE a named backlog tsc-red FIX → ready[] AND ESCALATE its priority (P3→P2) + set `blocking:true` + `next_agent`, PLUS REPOINT top-level `.head` at it as the immediate next dispatch — because a red pre-push hook (`pnpm --filter vn-market check`) blocks EVERY push on a red tree, so the sole tsc-red now strands the whole fleet's push including already-RAW-verified done_verified sign-off commits (red-prepush-strands-fleet lesson). Idempotent: skipped if the id is already in ANY non-backlog lane. Originated 2026-06-16 when a PO push-now decision hit a SELF-INTRODUCED red (FIX-SIGNAL-CONFIDENCE-DEFAULT-50.test.ts:270 TS2367, HIGH-vs-CRITICAL no-overlap, in the unpushed chain commit 4f5192c5 — NOT benign cloud-chore weather). Reusable pattern for "push-now blocked by a real red pre-push hook — verify it's the SOLE error via `bun tsc --noEmit`, confirm self-introduced (in unpushed commits, touches a changed file), escalate the already-tracked lint task to a blocking push-unblocker, promote+repoint head; po does NOT write the code fix and does NOT push around the red". Harness: CONSERVATION (backlog −1, ready +1, others byte-unchanged) + promote-once + head-points-to-promoted invariants. Usage: `NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg now "$NOW" -f scripts/po-s74-sla-test-ts2367-unblock-push-promote.jq docs/data/orch/orch-state.json` (atomic temp→`[ -s ]`→`jq empty`→conservation→invariant→rename; commit orch-state by EXPLICIT PATH; PUSH HELD until tsc green).
- `scripts/po-s76-ohlcv-p0-code-complete-review-promote-sau-d4-reconcile.jq` — RECOVERY-TRIAGE single-pass triple-mutation reconcile: RELOCATE a CODE-COMPLETE-but-stranded task `ready[]`→`review[]` (next_agent=qa) with full commit-set + RAW-re-run regression provenance + a LIVE post-rebuild qa_gate carried verbatim (code complete ≠ done_verified when the verification_gate is rebuild+live-repair+RAW), STAMP a `.head` reconcile note WITHOUT moving the head (head deliberately stays on the SOLE-tsc-red push-unblocker), and FLIP a paired NEW signal_queue id (both rows) → RESOLVED with ground-truth notes (one STALE false-positive held-lock-on-expired-lock, one reconciled active-vs-held concurrency). Originated 2026-06-16 recovery triage after a dev-team worker shipped all 7 OHLCV-P0 SUBTASKs to HEAD then went quiet mid-lane (lock expired 04:03:05Z, loop quiet 83 min) without a dispatcher tick advancing `ready→review`. Reusable pattern for "a stranded code-complete task whose gate is LIVE+rebuild → promote to review for qa (NOT done_verified), reconcile the head-drift signals it spawned, keep the head on its real blocker". Harness: CONSERVATION (ready −1, review +1, in_progress/done/done_verified byte-unchanged, total unchanged, signal NEW count −2) + CAS-mtime + idempotency (review-membership + status!=RESOLVED guards → re-run mutates 0). Usage: `NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg now "$NOW" -f scripts/po-s76-ohlcv-p0-code-complete-review-promote-sau-d4-reconcile.jq docs/data/orch/orch-state.json` (atomic temp→`[ -s ]`→`jq empty`→conservation→CAS→rename; commit orch-state by EXPLICIT PATH; PUSH HELD until tsc green).
- `scripts/po-s61-bctc-recon-done-enrich-hardening-triage.jq` — single-pass recon-completion + durable-hardening-sprint triage: RELOCATE a COMPLETED recon `in_progress`→`done` (with `done_verified:false` + a `done_verified_deferred_note` gating on a future infra cycle), id-guarded MINT of N follow-on tasks to `ready[]` (incl. an architect-brief umbrella SPIKE that lists its child FIX ids), and ANNOTATE the recurrence-anchor backlog row (recurrence_count held, `architect_briefed:true`, no dup) — ALL idempotent (relocate guarded by `done` membership; annotation guarded by `architect_briefed`; mints by id-presence). Originated 2026-06-15 closing OPS-BCTC-PIPELINE-RECON (2nd recurrence BCTC-VPS-PIPELINE-STALE; deployed discovery fixes did NOT resolve the user-facing P0 whose TRUE root = enrich-silent-0-rows). Reusable pattern for "a recon lane completes + deploys partial fixes + spawns a multi-owner durable hardening sprint whose true user-facing root differs from the deployed fix — close recon done-but-unverified, mint the children incl. an architect brief per recurring-bug-escalation, annotate the recurrence anchor". Harness: CONSERVATION (ready += N mints, in_progress −1, done +1, backlog/review/done_verified unchanged, total += N) + HARD-CONSTRAINT (other in_progress + all review rows untouched, recurrence_count held, each mint present exactly once). Usage: `jq --arg now "$NOW" -f scripts/po-s61-bctc-recon-done-enrich-hardening-triage.jq docs/data/orch/orch-state.json` (atomic temp→`[ -s ]`→`jq empty`→conservation→hard-constraint→rename; commit orch-state by EXPLICIT PATH).

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`

**Skills available to this agent (lazy-load — load only when the task requires it):**
- Word document (docx) deliverable → skill: `.claude/skills/docx/SKILL.md` (trigger: user asks for a sprint brief, project charter, or status report as a .docx file)
- Internal team status communications → skill: `.claude/skills/internal-comms/SKILL.md` (trigger: user asks for a 3P update, project update, or leadership status report in English — work channel only, never for MARKET output)
