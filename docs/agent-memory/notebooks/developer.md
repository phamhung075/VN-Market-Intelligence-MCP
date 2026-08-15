# Developer — Notebook

**Last updated:** 2026-08-15T10:30:00Z | **Cycle:** FU-RAG-DEPLOY-MEMORY (P0 M, PO re-scope + unblock, router-direct dispatch)

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

## Session 2026-08-15T09:56:30Z — FIX-ORCHBACKLOGSTUB-COLD-ITEMS-ARRAY-SHAPE-CRASH-BLOCKS-LANES-MIGRATION (cross-service/, developer, P0 S, router-direct dispatch, PO priority-bump 09:15Z, session 632721c2)

**Task:** `orch-backlog-stub.sh`'s `build_detail_temp()` merge branch crashed on the REAL live `backlog-detail.json` `.items` (a 442-element ARRAY, not the id-keyed object the merge assumed) — exit 5, `array (...) and object (...) cannot be multiplied`. Blocked the `FIX-ORCHSTATE-HOTFILE-BLOAT` LANES=backlog,ready,review migration entirely; PO bumped P1→P0 same-tick — 41 board rows over the prose-ceiling can't be `po_goahead`-ratified until this lands (PO's own janitor-triage write was itself rejected for the same reason).

**AC-1:** normalized cold `.items` on ingest via `scripts/lib/devteam-eligibility.jq`'s `detail_items_from()` (reused via `jq -L "$REPO_ROOT" 'include ...'`, not hand-rolled) before the F-3 per-field merge. **Shape decision (documented in the script header + dev-standards.md):** `.items` now ALWAYS written back ARRAY-shaped — matches the live shape, matches `po-detail-resync-review-lifecycle-routing.sh`'s own read+write convention (the only other writer — would flip it back to array on its next run regardless), and is the only shape that round-trips the 1 pre-id-scheme legacy cold record without destroying it. Also fixed the adjacent reconciliation bug (`.items | keys` on an array yields indices, not ids — flagged but not repaired by an earlier PO row).

**AC-2 (F-5):** preserved `^po_goahead` keys through `build_hot_temp()`'s `STUB_FIELDS` whitelist by prefix — WF-2 `should_hold` has no cold fallback for that key, so a stub re-run used to silently revoke a PO ratification; verified all 6 live `po_goahead_*` rows byte-preserved post-rehearsal.

**AC-3:** new T8 (array-shaped cold input + id-less legacy record preservation, the exact gap that hid F-4) + T9 (`po_goahead_*` survival, prefix-scoped not blanket) in `orch-backlog-stub.test.sh`; T3-T7 assertions updated for the shape decision (`.items|keys` → `[.items[].id]`). 35/35 pass (was 25/25, all 6 new RED pre-fix).

**AC-4 (mandatory, done before claiming this row done):** re-ran the exact PO-specified scratch rehearsal against a byte-identical read-only copy of the live `orch-state.json`+`backlog-detail.json` (`LANES=backlog,ready,review`) — pre-fix exit 5 (crash reproduced verbatim), post-fix exit 0, `Reconciliation PASS — all hot stub ids confirmed in cold detail`, hot file 3,455,546B→1,209,788B. Never written to the real files (scratch dir only, cleaned up after).

**Structural gap (recurring, same class as the last 2 sessions):** graphify incremental step attempted (`graphify update docs`) but the CLI subcommand is AST/code-only (no LLM) and treats the target path as its OWN project root — created an unwanted nested `docs/graphify-out/` (72,579 nodes) instead of touching the canonical root-level graph; removed (was untracked, zero commit risk). No Skill-tool binding available to this spawned agent (Read/Edit/Write/Bash only) to run the real semantic-extraction pipeline. Documented as skipped rather than fabricated.

**Regression:** `bash scripts/orch-backlog-stub.test.sh` 35/35. `shellcheck scripts/orch-backlog-stub.sh` clean. No `apps/` TS/Go touched — `bun test`/`tsc` N/A (pure bash/jq).

**Closeout:** 3 commits, all pathspec-scoped — `b1aa63b7a` (fix + regression tests), `6f55a013e` (dev-standards.md CANONICAL block + WORK.md), `94b78d502` (board row `backlog[]→review[]` lane-move + status flip, same write per the status-flip=lane-move rule established last cycle). Decision-journal entry appended to `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-developer-7.md` (S52). No handoff file (flat `backlog[]` row, PO-direct P0 mint, no PM decomposition — board row's own AC note is the spec, per `main.md`'s known-drift precedent). Router (session 632721c2) holds no per-task lock per INV-GATEWAY-1 (PRE-CLAIM was intent-level only, `intent:developer:<key>`) — this specialist did not attempt `task_claim`/`task_release`.

---
