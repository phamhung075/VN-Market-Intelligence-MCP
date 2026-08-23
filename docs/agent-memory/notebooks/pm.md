# PM — Notebook

## Archive

Cycles c320 (BA-PREDICTION-EVIDENCE-REVIVAL, 2026-07-01), c319 (EVENING_SUMMARY, 2026-06-21), c327 (P1-MOMENTUM-RS, 2026-06-30), c318 (ARCH-AUTO-PUSH, 2026-06-18), c317 (OHLCV-WRITER, 2026-06-17), c316 (ERRAUDIT-W2, 2026-06-16), and c315 (BCTC-ENRICH, 2026-06-15) archived — see git history (this file, pre-2026-07-10T20:00Z) and commits 675891163d...5d121989 / c06b09a1 for full sprint records. Older cycles (c299–c189) archived to [pm-20260611.md](../../archive/notebooks/pm-20260611.md).

## Session 2026-08-23T09:00Z — Decompose signal-type-registry fix

**Context:** Architect completed P0 pass on FIX-PO-TRIAGE-SIGNALS-TABLE-MATCHES-ZERO-LIVE-SIGNAL-TYPES, decided (b) registry-derived routing + self-filing fallback. Routed to PM for decomposition into exactly two per-owner subtasks.

**Decomposition completed:**

1. **TASK-DEV-MCP-SIGNAL-TYPE-REGISTRY** (owner: dev-mcp-server, SPRINT-S)
   - Extend guard-signal-type-coverage.sh: parse both Pipeline-A (pending_triage_inbox[]) and Pipeline-B (signal_queue.rows[])
   - Add self-filing mint to task_board.backlog[] on unrouted type (dedup-keyed)
   - Proof: synthetic Pipeline-A-only type is caught by cross-pipeline check
   - Status: READY, zone: scripts/

2. **TASK-PO-TRIAGE-SIGNALS-DOC-CORRECTION** (owner: agent-father/po, SPRINT-S)
   - Fix AC-2 falsified claims: system_issue/system-issue are "≤1-2 fires" (FALSE: 112/109 fires, concurrently live)
   - Add tactical Pipeline-B audit-handoff rule to unblock CI red
   - Replace frozen prose with instruction to consult derived registry
   - Status: READY, zone: docs/agents/po/flow/

**Board state:** ready+=2 (104→106), WIP unchanged (36 within limit), backlog+=0 (companion row already exists)

**Handoff files created:**
- docs/handoffs/TASK-DEV-MCP-SIGNAL-TYPE-REGISTRY.md
- docs/handoffs/TASK-PO-TRIAGE-SIGNALS-DOC-CORRECTION.md

**Sequence:** Tasks can run in parallel (different zones, no file overlap). Audit-handoff rule from task 2 unblocks CI; guard extension from task 1 prevents recurrence.

**Session:** 007e33e4-b453-4bb3-8ab1-ef31495906a3


---

## Session 2026-08-23T09:49:54Z — Decompose the paired cron-liveness / cowork-durability rows (11 tasks, 4 owners)

**MANDATE:** Architect returned `NEXT: pm` on two paired board rows (commit `64d521791`), each to be split by owner. ROW 1 is the *trigger*, ROW 2 the *amplifier*; neither alone makes a CLI restart survivable.

### ROW 1 — FIX-CRON-REARM-STEP1B1-LIVENESS-ORACLE-BLIND-WINDOW-FALSE-LIVE (P0) → 4 children
| id | owner | zone | depends_on |
|---|---|---|---|
| TASK-CRON-LIVENESS-PROBE-SCRIPT | developer | scripts/agents-flow/ | — |
| TASK-CRON-LIVENESS-PROBE-TESTS | developer | scripts/agents-flow/ | PROBE-SCRIPT |
| TASK-CRON-SKILLMD-PROBE-WIRING | agent-father | .claude/skills/ | PROBE-SCRIPT, PROBE-TESTS, COWORK-DOC-TRUTH |
| TASK-CRON-AMEND-DEDUP-BRIEF-S13 | architect | docs/architecture-briefs/ | — |

`FOLLOWUP-CRON-STANDALONE-PER-TICK-FIRE-ELECTION-MUTEX` minted to `backlog[]` (P2, architect), explicitly non-blocking per brief R6.

### ROW 2 — FIX-COWORK-DAILY-SLOT-SILENT-SKIP-…-GUARANTEED-ONLY (P1) → 7 children
| id | owner | zone | depends_on |
|---|---|---|---|
| TASK-COWORK-LAYERC-LASTFIRED-WRITEBACK (#1) | developer | scripts/agents-flow/ | — |
| TASK-COWORK-MISSED-FIRE-AUDIT (#2) | developer | scripts/agents-flow/ | LASTFIRED-WRITEBACK |
| TASK-COWORK-CATCHUP-SCOPE-PREDICATE (#4 code) | developer | scripts/agents-flow/ | — |
| TASK-COWORK-SCHEDULE-ONMISS-AND-SCOPE (#3 + #4 data) | agent-father | docs/data/ | CATCHUP-SCOPE-PREDICATE |
| TASK-COWORK-DOC-TRUTH-LAYER-INVENTORY (#5) | agent-father | docs/ | — |
| TASK-COWORK-PMSET-WAKE-ADJUNCT (#6) | ops | infra | — |
| TASK-COWORK-STALE-SLOT-DISPOSITION-TABLE (§7 gate) | qa | cross-service/ | #1, #2, #4code, #3data |

### What I learned this cycle

1. **A "note" is not a dependency, and this repo has the machinery to tell the difference.** `scripts/lib/devteam-eligibility.jq`'s `effective_depends_on()` UNIONS `.depends_on` + `.depends` + `.blocked_by`, and `deps_satisfied()` requires **every** dep to read `DONE_VERIFIED` (hot lanes *and* cold archive). So an ordering written into `depends_on` is mechanically enforced at dispatch; the same sentence in `note` is decorative. Both load-bearing orderings (developer→agent-father on ROW 1, #1→#2 on ROW 2) went into `depends_on`.
2. **Write `depends_on` alone, never both fields.** `orch-validate.mjs` Stage 1f hard-fails when a row carries BOTH `.depends` and `.depends_on` and `.depends` names an id absent from `.depends_on`. Live `ready[]` mixes them (35 rows `depends`, 25 `depends_on`) — picking one field per row sidesteps the divergence guard entirely.
3. **`children: [...]` is the decomposed-parent marker, and it has real semantics.** `is_epic_wrapper()` returns true on any non-empty `children`, which makes the parent non-dispatchable — exactly right after a split. Setting it is what stops a picker re-dispatching the umbrella row.
4. **Retarget a dangling dep onto the concrete child, additively.** `FIX-CRONCREATE-CONTRACT-DIVERGENCE-…` depended on ROW 1's *parent* id. Since the parent is now an epic wrapper, I ADDED `TASK-CRON-SKILLMD-PROBE-WIRING` rather than replacing — non-regressive, and the ordering no longer depends on how the wrapper closes.
5. **Cross-row same-file edges are invisible unless you look for them.** ROW 2's #5 and ROW 1's agent-father task both edit `.claude/skills/cron-cowork-team/SKILL.md` (different sections). Rather than block the fast P1 behind the P0 chain, I put doc-truth FIRST in the P0 child's `depends_on` — the same-file ordering is enforced *and* the live wrong-diagnosis source gets removed immediately.
6. **A decomposition can surface that existing `ready[]` rows are now wrong.** `TASK-COWORK-CATCHUP-3` is exactly the Step 4.55 wiring the brief measured to recover **zero** slots (`catchup_raw`: 8 records, 0 eligible, against a 4-day outage); `TASK-COWORK-CATCHUP-5` targets the same file as new #1. Cancelling rows minted from a *partially* superseded design is a PO scope call — I wrote `status_note` on both naming the contradiction/collision and surfaced them in RETURN instead of silently resolving it.
7. **Give the verification_gate an owner.** ROW 2's gate is an 11-slot disposition table spanning four tasks — precisely the artifact that gets narrated instead of produced. Minted as a qa child with `depends_on` on all four, and its AC-2 says the architect's bucket predictions are *hypotheses*: measure, then escalate divergence.
8. **Board hazards observed:** `orch-apply.sh` reported **0 net-new-growth violations** (23 pre-existing grandfathered WARNs, all unrelated) — both parents stayed under the 12000B ceiling (9602B / 7809B) by keeping the new prose in the *children*, not the umbrella. Sprint umbrella heartbeat `task:COWORK-GUARANTEED-SLOT-CATCHUP` returned `{ok:false, expires_at:0}` (expired/stolen) — logged, non-fatal per flow Step 3d.
9. **`mcp__gateway__call_tool` is not in the pm tool grant.** `bash scripts/agents-flow/mcp-call.sh <tool> '<json>'` is the working substitute for MCP calls from this agent (memory: `feedback_agent_reported_limitation_may_be_structural_check_the_tool_grant`).

### Deferred, deliberately

- **Terminal-lane bloat gate (flow Step 1) NOT run this cycle.** `done[]=15 > 10` and `done_verified[]=28 > 0` both trip it, so `docs/agents/pm/flow/task-archive.md` was due. Deferred because architect was writing to the same hot file in parallel (router-confirmed) and the archive path sets `ORCH_APPLY_ALLOW_SHRINK` — a shrink write racing a peer's growth write is the worst possible moment for it. This is now **3 consecutive pm cycles** (c346, c347, this one) that skipped it; it needs a dedicated pass, not another inline attempt.
- `ready[35] QA-COWORK-SLOT-SESSION-DOWN-SURVIVAL`'s dangling `OPS-COWORK-GUARANTEED-SLOT-INSTALL` dep and the non-self-verifying launchd firer — both router-flagged for PO, left untouched.

**WIP:** `in_progress[]` = 3, already over the 2-max limit → all 11 children held in `ready[]` at `status: TODO` (precedent c346/c347). Decomposition is not itself WIP-gated, so no `PIPELINE: blocked`.

**orch-state:** `task_total` 731 → 743 (+11 ready, +1 backlog). `ready[]` 105 → 116. `.head` was already `{status:idle, active_task_id:null}` → flow Step 4c non-closeout release is a no-op by construction.

**Decision journal:** `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-pm.md` STEP pm-S10 (ROW 1) + pm-S11 (ROW 2). File now 194L/32142B — approaching the 36000B roll threshold, next pm cycle should expect to roll to `-pm-2.md`.

**Session:** 7be6b4cd-057e-419b-a967-4810daf2b646

### ADDENDUM 2026-08-23T09:52:34Z — my decomposition commit was swept into a peer's commit

My 14 explicitly-staged pm-zone files (orch-state, pm notebook, pm decision journal, 11 handoffs) were absorbed into architect's commit `398b0b678` ("arch(cross-service): orch row prose-ceiling value-shape measure + frozen-cohort paydown") before my own `git commit -- <pathspec>` line ran. My commit then reported *"aucune modification n'a été ajoutée à la validation"* and created nothing.

**Nothing was lost** — all 14 files verified present in `398b0b678`, board verified intact afterwards (11 children in `ready[]`, 1 backlog follow-on, both parents carrying `children[]` and `next_agent: developer`). Only the attribution is wrong: a pm decomposition shipped under an `arch(...)` subject line.

**Why RULE 2.5 did not save me:** the pathspec on the commit line protects against a peer's `git add` landing between RULE 2's check and my commit — it makes my commit take only my paths. It does **not** protect against a peer *committing first* and taking my already-staged index entries with them. By the time my pathspec resolved, those paths were clean against the new HEAD, so there was legitimately nothing to commit. The window is between my `git add` and my `git commit`, and it is a shared index.

**Do not "fix" this by rewriting history** — `main` is shared with live concurrent peers.

This is the class already tracked as `FIX-COMMIT-SWEEP-VICTIM-SELF-DETECT` (`backlog[]`, dep `FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-HOOK` currently resolving MISSING per orch-validate Stage 1g). A `docs/signals/commit-sweep-guard-2026-08-23T095105Z-76924.json` was on disk at the moment of the failure and has since vanished — not in `398b0b678` either, so a peer drained it. **The guard fired and its evidence was then swept too**, which is exactly the self-detect gap that row names. Worth attaching to that row as a fresh occurrence with a named victim (pm) and a named sweeper (architect, same minute).
