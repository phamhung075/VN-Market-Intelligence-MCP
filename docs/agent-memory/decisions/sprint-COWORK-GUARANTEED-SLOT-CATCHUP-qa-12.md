# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · qa

**Sprint goal:** Make cowork `guaranteed:true` an honored contract with bounded catch-up on missed slots (ambient — this entry is unrelated task work drained from the same board during the same session).
**Agent:** qa
**Started:** 2026-08-08T11:34:25Z

---

### STEP qa-S1 · qa · 2026-08-08T11:34:25Z
**task-id:** CLEAN-SKILL-BLOAT-CRON-STANDALONE-DB-INTEGRITY-SPLIT-CHILDREN-BYTE-CAP
**what-done:** Direct-commit verify (mode=verify-committed) of commit `67ef5e286` — de-dup of db-integrity CronCreate prompt out of both `register-job-db-integrity-{weekday,offhours}.md` into the pre-existing authoring-doc SSOT.
**what-considered:**
- Trust router's prior RAW-verify note vs re-derive independently — re-ran everything myself (feedback_router_verify_raw_not_badges).
- register.md listed in files[] but not touched by this commit — checked whether that is an omission or correct scope.
**why-decision:** Independently confirmed: commit is real + on main ancestry; diff touches exactly weekday+offhours (register.md correctly untouched, already fixed in prior split 3bfd388ea, still 54L/2357B well under cap); live wc -lc = 33L/1830B weekday, 30L/1624B offhours, matches commit message exactly; ran `context-bloat-backstop.sh` myself against both files — exit 0, zero new signal files (43 before/after); grep-confirmed the "prompt (both jobs, byte-identical)" SSOT block is real at `cron-db-data-integrity.md:54` under `## Create with CronCreate` (line 19), pointer text in both children is accurate not fabricated; cap SSOT confirmed 200L/12000B for `.claude/skills/**/*.md`. No production TS touched — bun test/tsc/mock-guard N/A.
**why-change:** none from plan — clean APPROVED, no issues found.

### STEP qa-S2 · qa · 2026-08-08T11:34:25Z
**task-id:** FIX-NOTEBOOK-COMPOSE-SCRIPT-ACTUATOR
**what-done:** Direct-commit verify (dev-team Review-Lane QA-Drain, `qa[]` row, `branch:null`) of `7552421bc`, on main ancestry. RECURRING-BUG (prior_warns=7) closed via a mechanical actuator, not narrated patch.
**what-considered:**
- `git show --stat` full text vs `--name-only`: full-text grep against the 4 claimed `files[]` false-positived "found" on `auditor-notebook-commit.sh` (only mentioned in commit-message prose, never touched) — re-checked with `--name-only` (actual diff), confirmed genuinely untouched; same for `notebook-section-order.json`.
- Whether those 2 untouched files are a scope gap vs legitimate — re-read AC-1 ("mirroring... precedent", not "modify") and AC-2 ("REUSING... never reimplement"); grep-confirmed both scripts genuinely read `docs/data/notebook-section-order.json` at runtime (`ORDER_FILE=...`), no second hardcoded copy — untouched is correct, not a gap.
- Ran both test suites myself, not dev's self-report: `notebook-compose.test.sh` 9/9 (T1 = AC-4 negative-control replay of `0fcc6a5d2` shape — structurally unreachable, not just warned); `notebook-auto-prune.test.sh` 8/8 unchanged (zero-behavior-change extraction claim held).
**why-decision:** APPROVED, DONE_VERIFIED. Zero TS touched (bun tsc N/A); mock-guard PASS (no production TS/JS in scanned scope, scripts/ also outside size-lint CI scope — no missing-header issue). AC-5 marker contract + follow-up signal to agent-father confirmed present and already routed-to-po.
**why-change:** none — verified exactly what the row scoped; the `files[]` false-positive was a verification-method trap, not a real defect.

### STEP qa-S3 · qa · 2026-08-08T13:34:00Z
**task-id:** TE-T05
**what-done:** Direct-commit verify (`qa[]` row, `branch:null`, no prior `commit`/`files[]` on the row — fallback path) of commits `5bae0a65d` (main deliverable, 38 files) + `00fb2f913` (B2 split-out signal), both on main ancestry.
**what-considered:**
- Row carried no `commit`/`files[]` fields (predates the drain) — derived commit from `router_verify_note` prose, then independently re-verified rather than trusting it (feedback_router_verify_raw_not_badges).
- Cross-checked every quantitative claim in the commit message against the live repo rather than the prose alone: 29-file repoint count reconciled exactly against BA spec FR-4's 17 cowork/6 dev-core/5 maintenance/1 ops breakdown (name-by-name); fb-market-poster's 3 "net-new" files confirmed to have zero prior end-of-cycle refs pre-commit (diff shows notebook-write-only or nothing, not a repoint); decision-journal/notebook-write/doc-self-heal/self-critique confirmed byte-identical (`git show` on all 4 = empty diff, NFR-1 held); self-critique's T1-T5 taxonomy + SC-0 allowlist `{news-scout, dev-team}` verified verbatim-matching between the composite's inlined copy and the SSOT file (no drift, NFR-2 held); 87L file size matches both commit message and DJ claim exactly.
- Verified the 3 deleted skip-parentheticals (news-scout/bctc-analyst stage-log-notify.md, unified-agent chef-dish.md) via diff — each removal is now redundant with the composite's own NO-OP rule, not a silent behavior loss.
- FR-6 (cowork-boundary dedup) and the fence-script staleness flag were legitimately split into `docs/signals/processed/po-20260806T191500Z.json` (already routed-to-po) rather than bundled — read the signal payload, confirmed real and non-fabricated (fence-script grep pattern independently confirmed still stale on disk).
**why-decision:** All checks pass, zero production TS/Go touched (pure `.claude/skills/`+`docs/agents/`+`docs/agent-memory/` prose) — bun test/tsc/mock-guard correctly N/A. DJ-GATE-1 held: `sprint-TOKEN-ECONOMY-AUDIT-agent-father.md` STEP agent-father-S4 present, task-id TE-T05 stamped. No arch concern (pure doc/skill refactor, no new domain/MCP tool/cross-service call).
**why-change:** none — APPROVED, DONE_VERIFIED, no issues found.

### STEP qa-S4 · qa · 2026-08-08T11:36:52Z
**task-id:** FIX-DEVTEAM-BOUNDED1-CLAIM-NO-OWN-WIP-RECHECK
**what-done:** Direct-commit verify (`qa[]` row, `branch:null`) of `ab681bb7b` (code+audit-script) + `b3bc55fab` (memory), both on main ancestry, `git show --stat` matches claimed files (`scripts/devteam-backlog-claim-bounded1.jq`, `scripts/audits/devteam-dispatch-gate-satisfiability.sh`; `devteam-backlog-promote-bounded1.jq` correctly untouched per verify_note's stated reasoning — its WIP==0 gate was already correct).
**what-considered:**
- Read the fixed selector myself (not the commit message alone): confirmed `wip_in_progress` own-WIP recheck and `sort_by([priority_rank, idx])` both compose the SHARED `scripts/lib/devteam-eligibility.jq` defs (grep-verified both defs live there), not a local reimplementation — matches AC-2's explicit constraint.
- Re-ran `bash scripts/audits/devteam-dispatch-gate-satisfiability.sh` myself rather than trusting the claimed "71/71 PASS exit 0": got 64 PASS / 6 FAIL / exit 1 — a real discrepancy, investigated rather than waved through (feedback_router_verify_raw_not_badges).
- Root-caused the 6 FAILs: all trace to ONE pre-existing, unrelated fixture-construction line (`.task_board.in_progress[0:1]` truncation, present since before this commit — confirmed via `git show ab681bb7b -- <audit-script>` diff starts strictly AFTER that section) colliding with CURRENT live-board drift: `.head.active_task_id` now points to `FIX-CHEF-USDVND-THRESHOLD-NUMERIC-DRIFT-GATE`, which sits at `in_progress[2]`, not `[0]` — a completely different, later Supervised-Lane-Sweep claim, unrelated to this task. Truncating drops the row `.head` references, so `bun scripts/orch-validate.mjs` rejects the synthesized fixture (`head.active_task_id does not resolve`), and every downstream `tNc.json` derived from it inherits the same invalidity. Reproduced this exact failure by hand outside the script to confirm the mechanism, not just observed it.
- Checked whether this pre-dated the fix (i.e. is unrelated to the diff under review): confirmed the truncation section is byte-identical before/after `ab681bb7b` — this task's diff only ADDS new isolated fixture blocks after it, never touches it. Not a regression this task introduced.
- Verified the row's OWN designated `verification_gate` case ("BOUNDED-1 correctly no-ops when in_progress>=1") PASSES, and all 8 new `AC-BOUNDED1-*` isolated-fixture assertions this commit added PASS, including AC-5's live-data replay — re-ran it live myself right now: fixed selector still picks `FIX-NEWSVPS-OVERNIGHT-PUSH-OUTAGE-663M-SILENT` (P1) over `FIX-JANITOR-HEALTHRECHECK-IDEMPOTENCY-GUARD-MISSES-PROCESSED-DIR` (P2), non-vacuous (array-pos pick differs from ranked pick).
- Confirmed AC-4's header-comment correction landed (lines now document the FALSE invariant and the fix, not the old unsound assumption).
**why-decision:** APPROVED, DONE_VERIFIED — the fix under review is correct and independently proven on isolated, deterministic fixtures; the 6 observed FAILs are a pre-existing, unrelated audit-harness fragility (fixture truncation vs `.head` position) triggered by unrelated live-board churn since commit time, not a defect in this task's diff. Flagged non-blocking in status_note; minted a separate backlog row for the harness fragility itself (dedup-checked, no existing row) rather than silently absorbing or ignoring it.
**why-change:** Scope stayed on this task's own diff; did not fold the harness-fragility fix into this task (different file section, different root cause, would have widened scope past this row's own ACs).

### STEP qa-S5 · qa · 2026-08-08T11:37:57Z
**task-id:** FIX-EMITSIGNAL-BUGTELEGRAM-NO-TEST-SINK-GATE
**what-done:** Direct-commit verify (`qa[]` row, `branch:null`) of `f055226cf`, on main ancestry.
**what-considered:**
- `files[]` names `db-integrity-history-append.sh` but commit doesn't touch it — verified benign: `EMIT_SIGNAL_TELEGRAM_SINK` is exported at top-level in the test file, inherited by the subprocess `bash "$EMIT_SH"` call; no code change needed in that script.
- Ran both suites myself (not the self-report): `emit-audit-signal.test.sh` 123/123 incl. new T27-T31; `db-integrity-history-append.test.sh` 28/28 incl. new T4 sink assertions. Read `_telegram_send()`: single `mcp_call send_telegram` site, gated behind `[ -n "$TELEGRAM_SINK" ]`, both send fns route through it — no bypass left.
- AC-4 N/A claim re-verified: `db-integrity-dedup-check.test.sh` has zero real emit-audit-signal/mcp_call/send_telegram hits (1 comment only). AC-5 correctly deferred — `FIX-TELEGRAM-REPORT-ACK-STATUS-STOP-RESURFACE` confirmed live BACKLOG.
- shellcheck: 3 new SC2329/SC2034 notes in the test file, diffed vs pre-commit — same false-positive class as 8 pre-existing (sourced-script fn-redefinition pattern), no new class; production file gained zero new warnings.
**why-decision:** APPROVED, DONE_VERIFIED — AC-1/2/3 code-verified not prose-trusted.
**why-change:** none.

### STEP qa-S6 · qa · 2026-08-08T11:38:19Z
**task-id:** FIX-EMITSIGNAL-E3-RC3-FATAL-NORETRY-DROPS-DETECTOR-FINDING
**what-done:** Direct-commit verify (`qa[]` row, `branch:null`) of `7cc052083`, on main ancestry (`git merge-base --is-ancestor` confirmed).
**what-considered:**
- `files[]` names `scripts/orch-apply.sh` but commit doesn't touch it — checked, not waved through: row's own `scope`/`note` name this as approach-a ("no orch-apply.sh contract change"); `git log -- scripts/orch-apply.sh` shows no commit near this date, confirming genuinely untouched, not a missed file.
- Read the diff directly: new `_e3_read_candidate()` seam called BEFORE `_orch_apply_invoke`; empty result sets rc=2+continue (same retry lane as CAS mismatch); a genuine rc=3 can only surface from a real invoke on a non-empty candidate, unchanged (still fatal, zero retry).
- Ran tests myself, not self-report: `bash scripts/emit-audit-signal.test.sh` 123/123 incl. T25 (empty-then-recovers, retries, row lands) and T26 (genuine rc=3, no retry, ABORT, BUG telegram) both green. Sibling sweep reproduced: db-integrity-history-append 28/28, db-integrity-dedup-check 13/13, mcp-call 9/9. `tsc --noEmit` clean; `mock-guard.sh` correctly N/A (.sh out of its .ts/.py/.go scope). shellcheck: pre-existing SC1091 only, diffed vs parent commit, no new warnings.
- Cross-checked orch-apply.sh line numbers cited in the new comment against live file (rc=3 contract L50, empty-stdin guard L120-122 vs comment's cited 118-121) — cosmetic ~2L drift, non-blocking.
**why-decision:** APPROVED, DONE_VERIFIED — both retry/no-retry branches independently reproduced green, fix matches the row's own scoped alternative (assert-non-empty-before-invoke), no orch-apply.sh contract drift.
**why-change:** none.

### STEP qa-S7 · qa · 2026-08-08T11:43:32Z
**task-id:** FIX-AUDITOR-DURABILITY-STEP0B-DETECTION
**what-done:** Direct-commit verify (`qa[]` row, `branch:null`) of `92ef5b3a2` (+`af9ad098c` memory), on main ancestry, diff matches the claimed file exactly.
**what-considered:**
- Read the full diff: Step 0b.1/0b.2/0b.3 bash + reorder + Notebook-Append-Gate rewire all correctly match review_note's fixture-based claims (grep regex = exactly the 5 non-ABORT marker forms `audit-output-contract.sh` counts; `jq fromdateiso8601` threshold logic correct) — independently verified, not trusted.
- Went past text-correctness to LIVE production evidence (~44h since deploy): 2 genuinely fresh orphaned markers created by real post-deploy Tier-1 cycles (`...2026-08-06T21:09:00Z.tmp` real `[emit-signal]` line; `...2026-08-07T00:00Z.tmp` cycle-init only) remain unswept despite dozens of subsequent Tier-1 cycles (live notebook entries through today); zero `D-CYCLE-1`/`D-CYCLE-2` rows ever in `.signal_queue` or the dedup ledger.
- Tier-3 heartbeat currently 52h35m stale — exceeds Step 0b.2's own 48h WARN bar right now, unfired. Also found 6/8 marker files accidentally git-tracked by an unrelated commit (`2ddbe5321`, pm), breaking the "`rm -f` is safe reclaim" premise (`.gitignore` has no entry for this pattern, unlike the sibling scratch pattern).
**why-decision:** CHANGES_REQUESTED — logic is well-designed but shows zero confirmed live execution despite continuously-satisfied trigger conditions; the 2 dependent tasks should not build on an unproven mechanism yet.
**why-change:** Beyond the scope of dev's own fixture-based verification — production evidence contradicts the "durable"/live-verified claim.
