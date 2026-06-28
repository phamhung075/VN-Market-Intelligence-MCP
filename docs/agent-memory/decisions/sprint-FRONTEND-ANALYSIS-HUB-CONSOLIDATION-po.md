# Decision Journal — Sprint FRONTEND-ANALYSIS-HUB-CONSOLIDATION · po

**Sprint goal:** Analysis page becomes the single consolidated per-stock hub (merge technical + embed 5 stock-scoped zones + 2 nav buttons)
**Agent:** po
**Started:** 2026-06-28T18:10:00Z

---

### STEP po-S1 · po · 2026-06-28 · board-advance (zone wave-1 → INT unblock)
**task-id:** FE-AHUB-W1..W4 + FE-AHUB-INT-INTEGRATE
**what-done:** RAW-verified the 4 parallel zone builds on disk + committed, then advanced the sprint board via `scripts/orch-apply.sh` (gated wrapper): W1-W4 TODO→REVIEW (pending qa), INT-INTEGRATE BLOCKED→READY (deps met). OPS-REBUILD + QA-VERIFY left BLOCKED.
**raw-verify (did NOT trust prompt):**
- 6 component files exist on disk + tracked in HEAD: TechnicalZone (453L) @87871e06, CorporateEventsZone (237L) @961ce5f8, FinancialsZone (186L) @df70cb76, ReputationZone+NewsBuzzZone+ConvictionHistoryZone @4be9d552.
- 4 test files committed: FE-AHUB-W1-TechnicalZone.test.ts, FE-AHUB-W2-CORPEVENTS-ZONE.test.ts, FE-AHUB-W3-FinancialsZone.test.ts, fe-ahub-w4-social-zones.test.ts.
- working tree clean for all 6 zone files.
**what-considered:**
- mark W1-W4 DONE_VERIFIED directly (REJECTED — qa owns DONE flip after live verify; po only lands REVIEW).
- INT → TODO vs READY (chose READY — StatusEnum has READY; clearer dispatch-ready signal than TODO).
**why-decision:** all 4 deps landed + green; INT is the sole-editor serial closer of the shared file dashboard.analysis.tsx, so it can only run after the wave-1 fan-out — now unblocked.
**why-change:** no change from prompt plan.

### STEP po-S2 · po · 2026-06-28 · RETRO — concurrent-commit-race (stage outside mutex)
**task-id:** FE-AHUB-W1 / FE-AHUB-W3 (cross-worker commit attribution)
**observed:** W3's docs commit `87871e06` ("FE-AHUB-W3 add FinancialsZone to api-reference") actually committed W1's `TechnicalZone.tsx` + W1's test `FE-AHUB-W1-TechnicalZone.test.ts` (775 insertions across 3 files) — RAW-confirmed via `git show --stat 87871e06`.
**root-cause:** the commit-mutex serializes commit TIMING but NOT the SHARED git index. Workers ran `git add` OUTSIDE the mutex critical section, so when W3 entered the section and ran a broad add/commit it captured W1's already-staged-but-uncommitted entries.
**impact:** NO data loss — files are committed + tests green — but premature / wrong-hash attribution (W1's component lives under a W3-labelled hash).
**retro action (next parallel fan-out):** stage AND commit must BOTH be inside the commit-mutex critical section, each with explicit pathspec — `git add <paths>` then `git commit -- <paths>` — never a bare `git add -A`/`git add .` or `git commit -a/-am`.
**process-fix candidate:** FLAGGED — if this needs a dev-frontend flow change (enforce in-mutex explicit-pathspec stage+commit), route to agent-father. Not actioned by po (boundary: po does not edit agent definition/flow files).

### STEP po-S3 · po · 2026-06-28 · gate confirmation
**what-done:** confirmed FE-AHUB-INT-INTEGRATE is dispatch-ready (status READY, depends W1-W4 all REVIEW). Router may now spawn the INT dev-frontend closer. orch-apply exit 0; the 90 coherence warnings are pre-existing SHG-migration backlog stragglers (non-blocking), unrelated to this write (FE-AHUB rows live in active_sprints.tasks, not lane arrays). `.head` / CROSS-SESSION rows untouched.
