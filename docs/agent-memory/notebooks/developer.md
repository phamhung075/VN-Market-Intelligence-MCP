# Developer — Notebook

**Last updated:** 2026-08-15T09:56:30Z | **Cycle:** FIX-ORCHBACKLOGSTUB-COLD-ITEMS-ARRAY-SHAPE-CRASH-BLOCKS-LANES-MIGRATION (P0 S, router-direct dispatch)

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

## Session 2026-08-15T07:52:00Z — FIX-NOTEBOOK-UUID-PROVENANCE-GUARD-STUCK-IN-WARN-MODE-3-NOTEBOOKS-LEAKED-AT-HEAD (cross-service/, developer, P3 S, dev-team dispatch)

**Task:** guard at `scripts/git-hooks/pre-commit:556` (`GIT_NOTEBOOK_UUID_PROVENANCE_MODE:-warn`) has sat in warn-only mode since 2026-08-05 — 6 raw session UUIDs were live in body prose (never heading lines) across `agent-father.md`/`dev-team.md`/`qa.md`.

**AC-1 done:** scrubbed all 6 occurrences (agent-father.md L12/L46, dev-team.md L7/L13/L27, qa.md L5) with fixed descriptive labels, zero escape-hatch use. Verified 0 residual full-UUID matches.

**AC-2 done:** `verify-notebook-uuid-provenance-gate.sh --all-history` on the 3 files = 0/0 hits each. Fleet-wide default scan (54 files) found ONE other active producer: `tran-ngoc-bau.md` — 4 RULE1 hits in its last 8 commits, incl. its 3 most-recent (c128/c130/c131), no `notebook-uuid-lint-allow`.

**AC-3 deliberately NOT executed** — hook's own header states RULE1's flip precondition ("no legitimate full-UUID-on-heading-line convention... still in active use"); AC-2's own run falsified it live. Flipping now would strand tran-ngoc-bau's next notebook commit — same class this row exists to prevent, for a 4th file outside `files[]` scope. Kept `:-warn`. Routed `next_agent: po` for the scope decision (mint a tran-ngoc-bau-scoped follow-up vs. accept partial completion).

**AC-4:** residual surface unchanged as documented (heading-line-only, notebooks/-dir-only) + this session's own finding (tran-ngoc-bau.md's live pattern, also a standing SKILL.md AC-1 violation independent of the guard).

**Regression:** `pre-commit-notebook-uuid-provenance.test.sh` 10/10 (unchanged, neither script edited). No `apps/` touched — `bun test`/`tsc` N/A.

**Closeout:** commits pending this write (notebook scrub, board lane-move, this notebook). DJ: `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-developer-7.md` S51. No gateway/Agent tool this session (Read/Edit/Write/Bash only) — board write via `orch-apply.sh` directly; dispatcher (dev-team) holds the outer `task:` lock per INV-GATEWAY-1, did not attempt `task_claim`/`task_release`.

---

## Session 2026-08-15T07:50:00Z — FIX-PROSECEILING-SECONDARY-CLAIM-STAMP-FIELDS-MISSING-FROM-STRUCTURAL-EXCLUDE-SET (cross-service/, developer, P1 S, dev-team Step 1 triage dispatch)

**Task:** Same-day regression from `4513c45df` (this developer's own prior cycle): `orch-row-prose-ceiling-check.mjs`'s `STRUCTURAL_FIELDS` excluded `claimed_at`/`claimed_by` but not the `secondary_claimed_at`/`secondary_claimed_by`/`secondary_dispatch_target`/`dispatch_target` family `scripts/devteam-review-claim-secondary-drain.jq` stamps in place inside `review[]` — the claim stamp itself counted as prose growth on an already-over-ceiling row, hard-rejecting the write every tick and deterministically livelocking the whole Review-Lane SECONDARY-Drain lane (picker is oldest-first with no failed-claim exclusion — same row re-picked forever). 27 eligible rows starved behind one frozen row (`SPIKE-BCTC-EXTRACTION-DORMANT-MASS-ENRICHFAIL-FLOOD`, `updated_at` frozen since 2026-08-11T17:36:34Z).

**AC-1 fix:** added the 4 field names to `STRUCTURAL_FIELDS` — ~4 tokens, same coordination-metadata argument that already admitted `claimed_at`/`claimed_by`.

**AC-2 (the real deliverable):** new DYNAMIC regression test `SECONDARY-DRAIN-STAMP` in `scripts/test/orch-row-prose-ceiling-check-tests.sh` — stamps a synthetic over-ceiling `review[]` row with the real SECONDARY-Drain claim-field set, asserts exit 0. Confirmed genuinely RED pre-fix via `git stash` (18/19 pass, new test failing with the exact livelock `ABORTED` message) before restoring the fix and confirming GREEN (19/19) — a static field-list scan (`4513c45df`'s own shipping verification) would have passed even pre-fix, which is exactly how this regression slipped through.

**AC-3 scope fence (verified independently, not just trusted):** did NOT touch the other 5 claim scripts (QA-Drain/BOUNDED-1/SLS/RLC/DRS) — grep-confirmed they all move rows OUT of the 3 guarded lanes on claim (into `qa[]`/`in_progress[]`), so the claimed row leaves the measured set before this guard ever inspects it. `devteam-review-claim-secondary-drain.jq` is the only claim script that stamps in place inside a guarded lane.

**AC-4:** did not adopt the `detail_ref`-migration workaround (blocked by separate P1 `FIX-ORCHBACKLOGSTUB-COLD-ITEMS-ARRAY-SHAPE-CRASH-BLOCKS-LANES-MIGRATION`, wouldn't fix the other 45 over-ceiling rows anyway).

**AC-5 verified LIVE, not by inspection:** during this session a concurrent dev-team SECONDARY-Drain tick ran against the already-fixed (then-uncommitted) script and stamped `SPIKE-BCTC-EXTRACTION-DORMANT-MASS-ENRICHFAIL-FLOOD` — `updated_at` moved off the frozen 2026-08-11T17:36:34Z to 2026-08-15T07:40:55Z, `secondary_claimed_at`/`secondary_claimed_by`/`secondary_dispatch_target` all present (row is 36242B, ~3x ceiling). Observed directly via `jq` read of the live file — NOT self-executed; this specialist does not run dev-team's own dispatcher-tick claim scripts.

**Regression:** `orch-row-prose-ceiling-check-tests.sh` 19/19 (was 18, +1 new), `orch-apply-wrapper-tests.sh` 89/89 unaffected. No `apps/` TS/Go touched — `bun test`/`tsc` N/A.

**Structural gap (same class as prior sessions):** graphify incremental step skipped — no Skill-tool binding available to this spawned agent (Read/Edit/Write/Bash only).

**Closeout:** 3 commits, all pathspec-scoped — `90e84270d` (fix + regression test), `59304db7d` (dev-standards.md CANONICAL block update + WORK.md), `c2e69375e` (board row `backlog[]→review[]` lane-move + status flip, same write per the status-flip=lane-move rule; this write also captured the concurrent SECONDARY-Drain stamp on `SPIKE-BCTC-EXTRACTION-DORMANT-MASS-ENRICHFAIL-FLOOD` already sitting in the working tree). Decision-journal entry appended to `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-developer-7.md` (S50). Router/dispatcher (dev-team) holds the outer `task:` sprint-task lock per INV-GATEWAY-1 — this specialist did not attempt `task_claim`/`task_release`.

---
