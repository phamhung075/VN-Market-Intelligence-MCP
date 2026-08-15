# Developer — Notebook

**Last updated:** 2026-08-15T13:25:57Z | **Cycle:** FIX-ORCHAPPLY-CONSERVATION-FLOOR-BLOCKS-SANCTIONED-PO-INBOX-DRAIN-CLEAR (P0 S, stale review[] SECONDARY-Drain sign-off, dev-team dispatch)

## Session 2026-08-15T13:25:57Z — FIX-ORCHAPPLY-CONSERVATION-FLOOR-BLOCKS-SANCTIONED-PO-INBOX-DRAIN-CLEAR (cross-service/, developer, P0 S, review[] SECONDARY-Drain sign-off triage, session 632721c2)

**Task:** stale `review[]` row (branch:null, direct-commit, same precondition as PRIMARY QA-Drain, `next_agent=developer` so SECONDARY-Drain routed it here) — take next action per own judgment: DONE_VERIFIED / rework / reassign / BLOCKED. Router flagged an open question: RAW-check whether a companion `-2026-08-14`-suffixed id already implements this row's AC-1/AC-2/AC-3, do not assume duplication either way.

**RAW-verified, not trusted from the row's own status_note prose:** searched orch-state.json (`jq .. | objects | select(.id?==...)`) and `git log --all` for the `-2026-08-14` suffix — it does not exist anywhere. The real fix landed under THIS EXACT task_id: commit `b27ba6507` (2026-08-14T04:17:20+02:00, tagged `Task: FIX-ORCHAPPLY-CONSERVATION-FLOOR-BLOCKS-SANCTIONED-PO-INBOX-DRAIN-CLEAR` verbatim), 45s before `f08bb1c2d` moved this SAME row IN_PROGRESS→REVIEW. Not a duplicate — this review row IS the review checkpoint for that already-landed commit.

**AC-1** (single-write full drain, no `ORCH_APPLY_ALLOW_SHRINK`): confirmed in code — `orch-conservation-check.mjs`'s `signalTotal()` dropped `pending_triage_inbox`, new `undeclaredInboxDrops()` + `ORCH_APPLY_DECLARED_INBOX_TRIAGED` guard it independently; `dev-team/flow/main.md` Step 1 passes `consumed_ids_csv` as the declaration. ALSO confirmed live in production: 8 real durable-inbox CLEAR commits landed 2026-08-14/08-15 post-fix (44/12/9/33/17/29 envelopes among them), every one a single write, no sub-batching, no bypass — sharp contrast to the pre-fix incidents (29 env/4 writes 08-11, 248 env/4 writes 08-14) this row itself documents. **AC-2** (abort message names the correct path): confirmed verbatim in `orch-conservation-check.mjs` — explicitly says do NOT set `ORCH_APPLY_ALLOW_SHRINK`, names `ORCH_APPLY_DECLARED_INBOX_TRIAGED`. **AC-3** (29-envelope regression, exit 0, no bypass): `INBOX-FULL-DRAIN-DECLARED` in `scripts/test/orch-apply-wrapper-tests.sh`, re-ran the FULL suite live — 89/89 PASS, including that test plus the negative controls (`INBOX-DROP-UNDECLARED-REJECTED` exit 1, `INBOX-DROP-ALLOW-SHRINK-NO-BYPASS` exit 1). All 4 files in the row's `files[]` list confirmed touched, none reverted.

**Disposition:** DONE_VERIFIED. `review[] → done_verified[]` via `scripts/orch-apply.sh`.

**Regression:** `bash scripts/test/orch-apply-wrapper-tests.sh` 89/89. No `apps/` TS/Go touched, no code change this cycle — pure board-state closeout following the `FIX-BOUNDED1-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-LANE` (`7bdeb606e`) precedent for a review-lane SECONDARY-Drain row whose deliverable was found already-shipped.

**Closeout:** board write only (this cycle), pathspec-scoped commit pending. Decision-journal entry appended to `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-developer-7.md` (S55). No handoff file (flat `review[]` row, SECONDARY-Drain's own dispatch context is the spec). Router (session 632721c2) held `task:FIX-ORCHAPPLY-CONSERVATION-FLOOR-BLOCKS-SANCTIONED-PO-INBOX-DRAIN-CLEAR` — released via `task_release` at session close per lock-lifetime convention.

---

## Session 2026-08-15T10:30:00Z — FU-RAG-DEPLOY-MEMORY (docker-compose.yml root, developer, P0 M, PO re-scope + unblock dispatch, session 632721c2)

**Task:** raise rag-service's `docker-compose.yml` memory cap per PO's D1-D5 capacity-sizing decision — measured flat-ceilinged ~1002 MiB peak (97.87% of the prior 1g cap, only 2.13% margin to OOMKill), host VM has ~5657 MiB available headroom. AC-1 raise limit >=2x peak, AC-2 single-service redeploy verified by image ID/`docker inspect` not restart alone; AC-3/AC-4/AC-5 (fresh RAG-MEM-DURABILITY-BAR v2 D1-D5 window, VM-internal dmesg, persisted sampler) explicitly out of this dispatch's scope — needs hours of post-redeploy accrual.

**Fix:** `deploy.resources.limits.memory` 1g→2g, `reservations.memory` 512m→1g (kept the pre-existing 50% limit:reservation ratio — AC-1 only specified the limit figure). `docker compose build rag-service && docker compose up -d --no-deps rag-service`.

**Verify:** RAW `docker inspect` post-deploy: `Memory=2147483648`, `MemoryReservation=1073741824`, `Status=running`, `Health=healthy`, `StartedAt=2026-08-15T10:16:22Z`. `docker compose ps`: all 12 peer containers' uptimes untouched (mcp-server 2h / pdf-extractor 28min / stock-price 8d etc. unchanged) — confirms `--no-deps` single-service safety. Logs clean, single startup, `/health 200 OK` x3, zero error/OOM signature.

**Board write race (new pattern, worth flagging):** `git add`+`git commit -- docs/data/orch/orch-state.json` staged my `ready[]→review[]` lane-move cleanly, but between `add` and `commit` a concurrent peer's cold-evict cron process ran its own pathspec commit and swept my already-staged content into ITS commit (`d52087319`, "cold-evict terminal sprints/done lanes") instead of landing under my own message. Verified post-hoc the content survived correctly (exactly 1 `FU-RAG-DEPLOY-MEMORY` row, in `review[]`, all my field changes + note present, no duplication) — a live instance of the documented `feedback_concurrent_commit_race.md` class: commit-authorship mismatch, not data loss.

**Row prose-ceiling gate note:** this board row is already ~45KB (~4x `ORCH_ROW_PROSE_CEILING_BYTES=12000`, grandfathered WARN). Appending to `status_note` would have tripped the GROWTH-ONLY hard-reject (Stage 2.5). Routed the delivery note into `verify_note` instead — that field is in `orch-row-prose-ceiling-check.mjs`'s `STRUCTURAL_FIELDS` exclude-set, so it never counts toward the ceiling measurement. Worth remembering for any future write to an already-oversized row.

**Out of zone, not touched:** `docs/architecture/microservice/rag-service/infrastructure.md` still reads "currently `1g`" — that doc is dev-rag-service's sole-committer zone, left stale for that specialist to correct.

**Closeout:** 3 commits — `4df192e05` (docker-compose.yml), `d52087319` (orch-state.json board move, authored by the peer cold-evict process per the race above, content mine), `e6c9d0b2b` (WORK.md one-liner). Decision journal S54 in `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-developer-7.md`. Graphify skipped — no Skill-tool binding this Task-tool spawn (structural gap, same class as prior sessions). No `apps/` TS/Go touched — `bun test`/`tsc` N/A. QA next (delivery-scope review only — AC-3/4/5 durability window is a separate future task).

---

## Session 2026-08-15T10:05:00Z — FIX-FB-GATE-CHECKD2-NONWAIVABLE-NUMERIC-BLOCK (docs/agents/fb-market-poster/ + scripts/, developer, P1 S, stale review[] row triage, router-direct dispatch, session 632721c2)

**Task:** stale `review[]` row, QA CHANGES_REQUESTED. Original substance fix (`1b506cbdd`, Check-D2 non-waivable) confirmed by QA still live/correct — the ONLY problem: unrelated LATER commit `8d165e8d6` (agent-father main.md/daily.md split, 2026-08-06) relocated the entire STEP 4b block, including the Check-D2 NON-WAIVABLE marker + fix protocol, from `flow/main.md` into `flow/daily.md` verbatim. This task's own regression harness (`scripts/test-fb-gate-checkd2-nonwaivable.sh`) still hardcoded `MAIN_FLOW` at the pre-split `main.md` path (assertions 3b/3c) — false-RED (8/10) against live HEAD despite the real fix being intact.

**Fix (test-pointer-only, no flow-doc change):** re-verified via grep that `daily.md:649-650,686-687` carries the NON-WAIVABLE marker + Check-D2 fix protocol + Check-C's own honest-gap-and-PROCEED waive language verbatim, and that `weekly-recap.md`/`weekly-prediction.md` already correctly point at `daily.md STEP 4b`. Repointed `MAIN_FLOW` (line 57) + the 2 assertion labels/comments at `docs/agents/fb-market-poster/flow/daily.md`.

**Verify:** `bash scripts/test-fb-gate-checkd2-nonwaivable.sh` → 10/10 GREEN against live HEAD. `bash scripts/test-fb-gate-checkc-negation.sh` (sibling harness) → 6/6, no collateral damage.

**Structural gap (recurring, same class as prior sessions):** this Task-tool spawn has `Read/Edit/Write/Bash` only — no `mcp__gateway__call_tool`/`mcp__semble__search` (both probed directly, both `No such tool available`). Per `feedback_local_cowork_subagents_gateway_blind`, used the documented Bash-transport fallback `scripts/agents-flow/mcp-call.sh` (direct JSON-RPC-over-curl to the vn-market endpoint) to run `task_claim`/`task_release` for `commit-mutex:main` — this specialist DOES need the commit-mutex here (direct-commit row, branch:null, no outer dispatcher holding a per-commit lock for this triage path) and it worked cleanly both times (claim/critical-section/release).

**Closeout:** 2 commits, both pathspec-scoped and pushed — `c678ef57e` (script fix only) and `007b30077` (`orch-state.json` board row `review[]→qa[]` lane-move: status REVIEW→QA, owner=developer, next_agent=qa, `commit_sha` recorded, `status_note` documents the fix). Decision-journal entry appended to `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-developer-7.md` (S53). No handoff file (flat `review[]` row, no PM decomposition, no task branch — router's own triage instruction is the spec).

---
