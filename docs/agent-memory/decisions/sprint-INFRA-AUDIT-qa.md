# Decision Journal — Sprint INFRA-AUDIT · qa

**Sprint goal:** Infra-audit fix backlog (auditor Tier-1/Tier-2/Tier-3 probe hardening).
**Agent:** qa
**Started:** 2026-08-06T20:15:37Z

---

### STEP qa-S1 · qa · 2026-08-06T20:15:37Z
**task-id:** FIX-AUDITOR-MEMACK-HEADROOM-FLOOR-AND-DEAD-TRACKEDBY
**what-done:** Direct-commit verify (mode=verify-committed) of commit 3b096d4b2; re-ran probe.test.sh (181/181), shellcheck diff vs parent (0 new warnings), mock-guard PASS, live probe run against real fleet — flipped QA -> DONE_VERIFIED.
**what-considered:**
- Trust developer_review_note prose (167/167, 2 pre-existing shellcheck warnings) at face value — rejected, feedback_router_verify_raw_not_badges.
- Re-run independently at exact commit content (not current HEAD) to isolate this diff's own shellcheck delta — chosen.
- Corroborate live beyond dev's 07-29 capture: ran probe today, verified headroom computed dynamically off live docker inspect cap (1GiB now, not hardcoded 768) — chosen, catches any hardcode.
**why-decision:** All 6 ACs independently reproduced by re-run unit tests (T44-T53) + live fleet run; no new shellcheck/test regressions vs parent commit; mock-guard N/A confirmed (pure shell zone).
**why-change:** No change from plan.

### STEP qa-S2 · qa · 2026-08-12T10:45:00Z
**task-id:** FIX-MOCKGUARD-SCOPE-EXCLUDE-TESTGO
**what-done:** Direct-commit verify (mode=verify-committed) of commit 1fcfa72da; re-ran mock-guard.test.sh (7/7), live --full scan (exit 1→2, no HARD-FAIL), git ls-files pathspec recursion + ~/.bun exclusion independently confirmed, shellcheck clean (1 info-only SC2329 false-positive on trap-invoked fn) — flipped QA → DONE_VERIFIED.
**what-considered:**
- Trust the row's own 7/7 + "exit 1→2" prose at face value — rejected, feedback_router_verify_raw_not_covering.
- Attempted independent RED reproduction via `git stash push -- mock-guard.sh` — no-op (file already at committed HEAD state, nothing to stash); `stash pop` then hit an unrelated PRE-EXISTING stash@{0} conflict and safely aborted (no data touched) — abandoned this path, relied instead on direct diff read + current-state re-run, sufficient given diff is small/legible.
- Judge AC3's self-flagged live-tree "exits 0" wording gap — accepted as honest, non-blocking: row's own symptom/impact text is scoped to exit=1 HARD-FAIL only, never claims live CAUTION backlog must vanish; test-suite's own clean-fixture proves the literal clause under controlled conditions.
**why-decision:** AC1/AC2/AC4 mechanically proven (diff + re-run); AC3 negative controls (non-test .go + non-test .ts) both still HARD-FAIL, detector not blinded; single _test\.go convention confirmed via grep, zero new per-directory literals.
**why-change:** No change from plan.
