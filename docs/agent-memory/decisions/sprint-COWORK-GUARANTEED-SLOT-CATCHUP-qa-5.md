# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · qa

**Sprint goal:** Make cowork `guaranteed:true` an honored contract — bounded catch-up/miss-recording for elapsed guaranteed slots; not reopened for this row (cross-service notebook-pruner fix riding the same QA-drain batch).
**Agent:** qa
**Started:** 2026-08-06T21:24:14Z

---

### STEP qa-S1 · qa · 2026-08-06T21:24:14Z
**task-id:** FIX-NOTEBOOK-AUTOPRUNE-DIRECTION-UNRESOLVABLE-ZERO-TS-NOTEBOOKS
**what-done:** Direct-commit verify of `9b0764631`: re-ran `notebook-direction-corpus-replay.sh` live (0/46 unresolved, matches claim) and confirmed AC-3's `-gt` operator fix is intact in the post-refactor `lib/notebook-section-direction.sh:96`.
**what-considered:**
- Block this row on `test-notebook-auto-prune.sh` Test 9 crashing (exit 1) vs. attribute it to its true cause
- Trust peer `qa-3`/`qa-4` journal triage of the same crash vs. re-derive from scratch myself
**why-decision:** Reproduced the Test 9 crash directly (`zsh notebook-auto-prune.sh` → `BASH_SOURCE[0]: parameter not set`) and traced it to commit `7552421bc` (different row `FIX-NOTEBOOK-COMPOSE-SCRIPT-ACTUATOR`, still `REVIEW`/`qa`, will get its own QA cycle) — the lib-extraction's `source "$(dirname "${BASH_SOURCE[0]}")/..."` lines break under zsh, not this row's own vote-comparison fix. Confirmed production-safe myself: `.claude/settings.local.json:62` always invokes the hook via explicit `bash`. Not rubber-stamped from peer notes — independently reran the crash, the diff, and the settings file.
**why-change:** none — verdict matches this row's own claimed AC-1/AC-3 outcome; the zsh crash is correctly out-of-scope, owned by a different already-queued row.

### STEP qa-S2 · qa · 2026-08-06T21:26:00Z
**task-id:** FIX-CI-IMF-INTEGRATION-TEST-NONHERMETIC-LIVE-API
**what-done:** Direct-commit verify of `qa[]` row (`branch:null`, `.commit_sha: 63f90ed7a`).
**what-considered:**
- Row's cited `commit_sha` (`63f90ed7a`) is a real commit object but `git fsck --unreachable`/`merge-base --is-ancestor` prove it is an ORPHANED worktree-local commit (parent `581519c05`), never merged as-is onto main.
- Developer's own journal (S46, `sprint-...-dev-mcp-server-2.md`) names the mechanism: dev-team's merge step cherry-picked `63f90ed7a` onto main's then-live tip (worktree-staleness discipline). Located the real landed commit: `d1bb1140f` — same author/message/diff, parent `61fe79797` (IS main-ancestor), byte-identical patch to the orphan.
- `git show --stat d1bb1140f` matches the row's sole `files[]` entry exactly. Re-ran myself, not trusted from prose: `bun test 1296b-imf-integration.test.ts` 14/14 pass ~268ms, no live-network symptoms (no timeouts/long waits); `bun tsc --noEmit` 0 errors; mock-guard N/A (test-only diff, Smart-Skip).
- `verification_gate: ci_green_on_subsequent_push` satisfied: run `31106283894` (headSha `1ff241d2ec1`, confirmed descendant of `d1bb1140f`, itself a descendant of red commit `a26653ff2`) job `bun test` = success.
**why-decision:** APPROVED, DONE_VERIFIED. Underlying fix verifiably landed and correct on main; `commit_sha` field is a stale/orphaned worktree-hash citation — corrected in `status_note` to the real ancestor `d1bb1140f` rather than blocking on a citation-only defect (mirrors qa-S65/qa-S67 precedent, same cherry-pick mechanism).
**why-change:** none — verified exactly what the row scoped; citation fix is additive to status_note.
