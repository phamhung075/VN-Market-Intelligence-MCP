# Architect — Notebook

**Last updated:** 2026-07-31 02:41 UTC | **Sprint:** COWORK-GUARANTEED-SLOT-CATCHUP

[3 most recent cycles retained. Older cycles archived to git history.]

## 2026-07-31T02:41Z — FIX-SUBAGENT-BRANCH-CHECKOUT-HIJACKS-SHARED-WORKING-DIR (zone=cross-service/, P1/M, direct PO-mint FIX, `po/triage-20260731T0212`)

**Task:** every subagent shares ONE git working dir + ONE `HEAD`; any agent that honors a `branch:`
field (e.g. a PM handoff) checks out that branch, and a concurrent peer's commit silently lands on
it. 4 independent hits 2026-07-31 alone.
**Design:** verified git has NO `pre-checkout` hook (only `post-checkout`, which cannot block the
checkout, only revert-after + force the caller's own exit code). Chose AC-1(a): new
`scripts/git-hooks/post-checkout`, hard-reverts any non-`main` checkout in the primary working dir
back to `main`, `MODE=enforce` default (deliberate divergence from the sweep-guard hook's own `warn`
default — justified: zero legitimate off-`main` state exists live today, revert is self-healing not
blocking). Exempts linked worktrees by construction (git-dir vs git-common-dir, live-tested) so it
does not foreclose `SPIKE-C44` later. Rejected (b) worktree-isolation-for-everyone as primary (blast
radius = whole fleet vs `SPIKE-C44`'s own 2-developer scope, itself unstarted) and (c)
schema-level-ban as this row's own primary layer (the `branch:` field lives in free-form markdown,
nothing for a schema to bind to).
**Finding:** 5 live flow docs (`pm/flow/main.md:75`, `developer/flow/main.md:51-54+158`,
`developer/flow/microservice-main.md:53-57+161`, `qa/flow/main.md:37,42,114-124,219-224`,
`fixer/flow/*.md:34,36,60,110`) still actively author/verify/honor the `task/NNN-*` convention
today, post-dating `UC-RDL-P7` STEP1's 2026-07-17 ruling — one of them fired hours before this brief
on the row's own cited incident file. Shipping the hook with zero coordination breaks
`developer/main.md`'s own `VERIFY` line for every M/L task; flagged as a rollout coordination note
for PM, not implemented here (`UC-RDL-P7` STEP2 already owns those 5 files, `agent-father` zone).
**Output:** `docs/architecture-briefs/2026-07-31-fix-subagent-branch-checkout-hijacks-shared-working-dir.md`
— AC-4 live positive control satisfied via 5 scenarios in a disposable scratch repo (control
reproduces the hijack; guarded prevents it; non-destructive-conflict edge case fails loud without
discarding uncommitted work; linked-worktree exemption; re-entrancy, 0.39s, no recursion).
**Next:** board row `backlog[]→ready[]`, `next_agent: pm`, `architect_brief`/`architect_review_note`
written via `orch-apply.sh`. Did not implement `scripts/git-hooks/post-checkout` myself (design-only
per `not_my_job`); did not touch the 5 flow docs (`UC-RDL-P7`'s scope, not this row's — AC-3 dedup).

## 2026-07-31T01:35Z — FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE (zone=cross-service/, P1, size S, sprint COWORK-RELIABILITY, ba-spec relay, dev-team resume lock held across relay)

**Task:** cowork's fire-election leader lock (`cron:cowork:<TICK>`) is released at tick end (correct as a lock) but has no persistent "this nominal tick already ran" marker — a re-fire of the same completed tick re-elects and re-runs the whole tick. Production-confirmed twice in 27h (bctc-analyst-slot-3/-4 duplicate spawns). BA spec: `docs/handoffs/FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE-ba-spec.md`.
**Design:** New pure predicate `_tick_already_ran()` in `cowork-tick-preflight.sh` (Step 2.5, after presence, before election claim) comparing `pressure-state.json`'s `tick_id` (SECOND-precision, server always appends `:00`) against the nominal `TICK` (MINUTE-precision) — normalizes by stripping the trailing `:SS`, NOT a literal `==` (that was the row's own documented landmine, would ship green and suppress nothing). Extracted as a standalone function specifically so NFR-4's positive-control test can replay the two real incident timestamps directly, no wall-clock-injection seam needed. Mirrored the same predicate in prose in `leader-lock.md` (before `### Fire claim` — the ERROR-fallback/manual path, FR-1 explicitly requires both paths). New `TOMBSTONED` verdict + `main.md` JUMP-TO row + a defensive "unrecognized verdict → EXIT, never WORK" fallback row (NFR-5 stale-cron-prompt safety). Comment-only ordering-invariant pin in `telemetry.md` at the P3 release site (NFR-3 — Step 6.0 must stay before the release; the Error Guard's deliberate omission of Step 6.0 is what lets a tick that died early correctly re-run, NFR-2). `.claude/skills/cron-cowork-team/SKILL.md` rollout note: bare `/cron-cowork-team` re-run no-ops post-fix (idempotency guard), needs explicit `CronDelete`+`CronCreate`.
**Finding:** Traced the NFR-5 worst case explicitly — an LLM misreading an unrecognized `TOMBSTONED` verdict against a stale cron prompt would default to the `ERROR` clause and walk through `main.md`→`leader-lock.md`, which independently re-checks the tombstone before ever calling `task_claim`. The FR-1 dual-path mandate (already required for the "known double-fire hole" reason) is therefore also the structural backstop for the NFR-5 rollout gap — not a separate risk needing a separate mechanism. Zone confirmed `cross-service/` via `system-map.json` (`specialist=developer`, not a `dev-<svc>`).
**Output:** `[Architect] Brownfield Findings` appended to `docs/handoffs/FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE-ba-spec.md` (6-file design: script + test + leader-lock.md + main.md + telemetry.md + SKILL.md). No code written (design only, per `not_my_job`).
**Next:** `next_agent: pm` set on the board row via `orch-apply.sh`; status stays `IN_PROGRESS` (pm still owns task breakdown to `developer`). Did NOT touch the dev-team resume lock (`task:FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE`) held across this relay — out of architect's scope. Flag for router: gateway MCP tool (`send_telegram`) was not bound in this session — could not send the mandatory decision-journal CAP-REACHED telegram (sprint-COWORK-GUARANTEED-SLOT-CATCHUP-architect.md hit its byte cap this cycle, sentinel written to the file itself, next architect write rolls to `-2.md`); router should relay that notification.

## 2026-07-31T00:00Z — FIX-PO-NO-PRODUCER-FOR-MANUAL-DISPATCH-ESCAPE-HATCH (zone=cross-service/, P0, direct-FIX router dispatch, PO BATCH triage-20260730T2227Z-po)

**Task:** 4th instance of "documented consumer, no documented producer" — `dev-team/flow/main.md`'s Lane × Gate Coverage Matrix + `bounded1-supervised-lane-report.sh` both describe DRS-STRANDED-OFF-ALLOWLIST backlog rows + ready[] sup-XOR-plan_only rows as "reachable only by manual/PO dispatch" but no PO flow step ever swept the lanes for them.
**Design:** Mirrored `po/flow/supervised-goahead.md`'s shape (mandatory per-tick PO pre-check + lazy-load pointer in `main.md` + regression verifier). New shared lib `scripts/lib/po-manual-dispatch-eligibility.jq` (`is_design_router_candidate`, `is_drs_stranded_off_allowlist`, `is_ready_xor_gap`) `include`s `devteam-eligibility.jq` verbatim — zero new predicate logic. Found the target report script already had a byte-identical hand-inlined copy of the same select-chain; retrofitted it to call the new shared defs instead of leaving a 3rd hand-copy (live-diffed byte-identical against a pinned snapshot before/after — only the `Generated:` timestamp line differs). Deliberately does NOT write `.head`/`in_progress[]` — both target classes were excluded from dev-team's WIP-budget chain by deliberate policy; a 2nd independently-scheduled writer on that chain reintroduces the exact multi-writer `.head`-collision risk `qadrain-head-slot-decouple.md` names. Action shape: additive `po_manual_dispatch_flagged_*` stamp (idempotency only) + fold the top unflagged candidate into PO's own `BATCH` — the only actuator PO's own contract grants it (grep-confirmed zero `Agent(...)` spawn calls anywhere in `po/flow/*.md`).
**Verified:** Live counts at design time — 43 DRS-STRANDED-OFF-ALLOWLIST + 3 READY-XOR = 46 (drifted from PO's stale 49 via a genuine concurrent edit observed mid-session: `FIX-DEVTEAM-QADRAIN-HEAD-WRITE-CONDITIONAL` reassigned agent-father→developer by dev-team, correctly dropping it out of the target set — predicate proven live-reactive, not a stale snapshot). New regression verifier `scripts/audits/po-manual-dispatch-sweep-verify.sh`: 12/12 synthetic-fixture assertions pass (every named Matrix branch, positive+negative controls, plus the idempotency guard).
**Output:** `docs/agents/po/flow/manual-dispatch-sweep.md` (new sub-flow) + `scripts/lib/po-manual-dispatch-eligibility.jq` (new) + `scripts/audits/po-manual-dispatch-sweep-verify.sh` (new) + pointer in `docs/agents/po/flow/main.md` + retrofit in `scripts/audits/bounded1-supervised-lane-report.sh` + `CANONICAL` pointer in `docs/policies/dev-standards.md`.
**Next:** Did NOT widen the DRS allowlist to admit `agent-father` (explicit out-of-scope per the row). Flipped IN_PROGRESS→REVIEW myself (direct-execute, `branch:null`, `.head` reset to idle) per CANONICAL:SSOT-STATUSFLIP-LANEMOVE. `NEXT: po` — PO's own next tick is the first live exercise of the new pre-check.
