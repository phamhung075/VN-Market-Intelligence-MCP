# Developer — Notebook

**Last updated:** 2026-08-26T03:15:00Z | **Cycle:** FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS (session 036ceaf1, router hand-dispatch)

## Session 2026-08-25T22:35:00Z — FIX-DRS-CLAIM-TRUSTS-CACHED-DISPATCH-LANE-NOT-EFFECTIVE-NEXT-AGENT (scripts/, developer, P0 S, session 036ceaf1, BOUNDED-1 auto-pickup)

**Fixed the confirmed defect: `scripts/devteam-backlog-claim-design-router-sweep.jq` read a promote-time cached `.dispatch_lane` with no re-resolution and no null-guard, and wrote it verbatim into `.head.next_agent`.** Two live-confirmed failure modes: stale-but-non-null (silent misroute, no gate detects it) and null (`.head.next_agent=null`, an unspawnable head, live 2026-08-25T20:56Z on an 11-day-old stamp). Fix: resolve `effective_next_agent($detail_items)` fresh at claim time for every stamped candidate, sorted `[priority_rank, idx]` (fixes the SAME tick's separable ordering defect — a fresh P0 no longer starves behind an older stamp), refusing rather than writing null if every candidate's resolution comes up empty.

**Scope-widened to `scripts/devteam-backlog-claim-supervised-lane-sweep.jq`'s PRIMARY path — identical unguarded cached-`dispatch_lane` read, same commit.** Used `resolved_dispatch_lane` there (not bare `effective_next_agent`) since SLS's own promote script already resolves via owner-fallback/`"developer"`-terminal-fallback and a PRIMARY candidate is not guaranteed a present `next_agent` the way a DRS candidate is (`is_non_dev_next_agent_unrouted` guarantees that only for DRS). FALLBACK path was already correct (re-resolves fresh) — untouched.

**AC-4 live remediation: re-audited all 8 pre-existing DRS-stamped `ready[]` rows via `effective_next_agent`, not the row's own raw-board-`.next_agent` comparison — and the conclusion flipped.** The row's note named 3 "mismatches" by diffing `dispatch_lane` against raw board `.next_agent`; re-running the ACTUAL AC-1 resolution function found all 8 already agree with `dispatch_lane` (diff=0 after re-stamping). Root cause of the apparent mismatch: those 3 rows' board `.next_agent` was edited post-promote WITHOUT bumping `.updated_at`, so `effective_next_agent`'s own 2026-08-25 recency-compare (a separate, already-shipped fix) correctly falls back to detail — which matches `dispatch_lane`, not the un-timestamped board edit. Re-stamped all 8 with `dispatch_lane_reresolved_at`/`_by` via `orch-apply.sh` (validated pre-write) as the audit trail; flagged the 3-row board-vs-detail divergence as a SEPARATE, out-of-scope finding for architect/PO (which side is actually correct is a content call, not a code defect).

**Ordering defect (2nd, separable) fixed in the same commit for both scripts** — small change to the same selection expression (`sort_by([priority_rank, idx])`, mirrors `devteam-backlog-claim-bounded1.jq`'s own precedent) rather than filed as a new row. Live P0 `FIX-JOURNALGUARD-ALERT-TRANSPORT-RUNS-ON-THE-PLANE-IT-MONITORS` had been starving behind an 11-day-old stamp; confirmed it now resolves ahead by priority.

**Verified with 8 new isolated regression fixtures added to `scripts/audits/devteam-dispatch-gate-satisfiability.sh`** (AC-1/AC-2 stale-cache-superseded, AC-3 null-lane-resolvable + null-lane-refuse, priority-ordering — each x2 for DRS and SLS-PRIMARY): all 8 PASS. Full suite: 121 PASS / 2 FAIL both before and after my change — the 1 real failure (`SLS gate ... SLS claims a row`) reproduces byte-identical against the pre-fix HEAD copies of both claim scripts (live board currently has zero SLS-eligible backlog rows — a live-data-dependent flake, not a regression).

**Verification:** commits — code (`scripts/devteam-backlog-claim-design-router-sweep.jq`, `scripts/devteam-backlog-claim-supervised-lane-sweep.jq`, `scripts/audits/devteam-dispatch-gate-satisfiability.sh`, `docs/agents/dev-team/flow/main.md`) and board-state (`docs/data/orch/orch-state.json`, 2 orch-apply.sh writes: AC-4 re-stamp + row move) — see commit SHAs in RETURN. Board row `IN_PROGRESS` → `REVIEW`, `next_agent`=qa. Decision journal: `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-developer-9.md` STEP developer-S127.

---

## Session  — FIX-ORCHCOLDEVICT-NARRATED-ARCHIVE-WRITE-NEVER-EXECUTED-DATA-LOSS AC-3 (cross-service/, developer, P0 M, session 036ceaf1, review-lane SECONDARY-drain dispatch)

**QA's "permanently unrecovered" verdict was about live+archive absence, not blob absence — the parent blob (`git show 38c013342e^`) still held all 4 remaining victims.** Decided per row on evidence, no shortcuts: 3 restored, 1 retired.

**Restored to done_verified[]:** FIX-AUDITOR-A30-VMHWM-VETO-TAUTOLOGY-FALSE-NEGATIVE (commits f51ed9ede2/e000e91f1 re-confirmed ancestor-OK + still live at HEAD; dropped a dangling `blocks` ref whose target archived via the normal non-defective evict path) and FIX-DEVTEAM-QADRAIN-HEAD-WRITE-CONDITIONAL (commit 9fe706fa2 re-confirmed, conditional `.head` guard still live). Both carry `verification.raw_probe` honestly reconstructed from their own historical QA status_note, never fabricated.

**Restored to done[]:** FIX-FB-WEEKEND-DEDUP-GATE (status DONE, no RC-VERIF gate; its own secondary_triage_result is its raw evidence; dedup gate spot-re-checked still present at HEAD).

**Retired (not restored) to archive[] as CANCELLED, superseded_by=CONTAM-10-WRITER-H:** FIX-OHLCV-WRITER-INTEGRITY-CONSTRAINT-SCALE-P0. Its own verify_note (written ~13h BEFORE the destructive evict) already said SUPERSEDED — a verbatim DONE_VERIFIED restore would need a raw_probe this row's history never captured; fabricating one is forbidden, so CANCELLED is the honest shape. CONTAM-10-WRITER-H confirmed live+DONE_VERIFIED with its own raw-probe record.

**LESSON — a supersession note is not a probe.** Restoring a DONE_VERIFIED row verbatim is only safe when the row's own history contains something reconstructible as raw_probe; when it only contains a "this was superseded" note, the honest move is CANCELLED + superseded_by, not a manufactured probe.

**Verification:** single orch-apply.sh write (all 4 rows + FIX-ORCHCOLDEVICT next_agent flip in one transform), commit 7320028e1. FIX-ORCHCOLDEVICT stays in review[], next_agent=qa for a final AC-3-focused re-verify (AC-1/AC-2/AC-4 untouched, already QA-confirmed). Lock task:FIX-ORCHCOLDEVICT-NARRATED-ARCHIVE-WRITE-NEVER-EXECUTED-DATA-LOSS left held for the dispatcher.

(header timestamp correction: the empty "## Session  —" heading above is session start 2026-08-26T00:27:27Z — printf %s arg was dropped when authoring it, appending here since notebooks are append-only)

---

## Session 2026-08-26T02:48:06Z — FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS (cross-service/, developer, P0 M, session 036ceaf1, router hand-dispatch)

**Root cause already shipped — verified, did not re-implement.** This epic-wrapper row's own defect (router `intent:` PRE-CLAIM and the cowork-slot dispatcher sharing no `task_id` namespace, so `task_claim` was a no-op mutex across the two paths) was fixed 12 days ago by commit `f8d3891c6` (2026-08-14): Step 2.4 Cowork-Slot Cross-Path Collision Probe in `dispatch-claim/SKILL.md`, lockstep with the matching `CLAUDE.md` phase-list line. Both still live at HEAD; `git log`/board search found zero recurrence of this specific bug after 08-14 (the one post-08-14 `po-double-dispatch` signal I found, 2026-08-24, is dev-team's own SECONDARY-Drain/Step-1 lock-key split — a different mechanism, already routed to architect, not this row).

**The 3 corroborating `orphan-signal:cowork-slot:*` locks cited in the dispatch prompt are NOT this bug.** Per `dispatch-claim/SKILL.md`, only `sprint-task`/`cowork-slot`/`dashboard-row` task-kinds ever generate `orphan-signal` rows (the reaper's designed output for an expired claim). That is a normal lifecycle event for a crashed/timed-out cowork-slot agent, not evidence of the router double-dispatching one. Could not confirm this live via `task_list_held` — developer carries no vn-market MCP tool grant (INV-GATEWAY-1 by design) — so this is a docs-based read, stated as such, not a live probe.

**All remaining atomic work belongs to `children[]`, not this parent row.** `TASK-COWORK-MUTEX-001` (review[], status=BLOCKED) is gated on a separate, already-architect-designed row, `FIX-COWORK-PUBLISHED-MARKER-TTL-28H-EXCEEDS-24H-DAILY-CADENCE` (ready[], next_agent=developer) — NOT assigned to me this cycle, and I have no MCP grant to claim it myself even if it were. `TASK-COWORK-MUTEX-002`/`-003` (backlog[]) both depend on 001. The epic closes via the post-cycle Epic-Wrapper Autoclose Sweep once all 3 go terminal — there is no independent AC left on the parent to implement.

**Lane-move blocked by a live prose-ceiling defect — followed the already-ratified precedent instead of forcing it.** Tried moving the row to `backlog[]` with `status=BLOCKED`; `orch-row-prose-ceiling-check.mjs` hard-rejected it (`live=0B -> candidate=16574B` — this row never resided in a ceiling lane so has zero live baseline, same gap `FIX-SYSTEM-MAP-WATCHLIST-STALE-34-OF-58`'s po ruling hit on 2026-08-24). Same fix applied here: row stays in `in_progress[]`, `status=BLOCKED` — `wip_in_progress` (`scripts/lib/devteam-eligibility.jq`) excludes BLOCKED rows by construction, so this does not consume a WIP slot or deadlock any picker.

**Verification:** no code changed (nothing left to implement). `docs/data/orch/orch-state.json` commit `a247f9fab` (status BLOCKED, blocked_by=[TASK-COWORK-MUTEX-001], claim identity cleared, `.head` reset idle). Decision journal `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-developer-9.md` STEP developer-S128, commit `792e3461a`.
