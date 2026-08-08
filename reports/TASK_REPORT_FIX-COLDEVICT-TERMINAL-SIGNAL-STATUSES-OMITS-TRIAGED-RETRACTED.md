## Task Report FIX-COLDEVICT-TERMINAL-SIGNAL-STATUSES-OMITS-TRIAGED-RETRACTED

**Mode:** Direct-Commit Verify (router-dispatched, not dev-team-cron; `branch:null`, row lived in `review[]` not `qa[]` — `commit_sha` field present)
**Fix commit:** `42e7c6048a0ec2f1d607b35fe16c78f966f64bbe`

changed: `scripts/orch-cold-evict.sh` (L129-153, `TERMINAL_SIGNAL_STATUSES` default), `.claude/skills/signal-dashboard/SKILL.md` (§ ACK/CLOSE gap-closed note, § PRUNE criteria line), `scripts/test/orch-cold-evict-tests.sh` (+T11), `docs/WORK.md` (+entry)

tests: `bash scripts/test/orch-cold-evict-tests.sh` → 59/59 (RE-RUN live, incl. new T11) | `bash scripts/test/orch-apply-wrapper-tests.sh` → 73/76 (3 fail — see Anomaly below, traced unrelated) | bun test/tsc: N/A (pure bash, zero `apps/` TS files touched) | DDD: N/A (no domain/infra imports, bash-only) | security: PASS (no `process.env`, no secrets/tokens in diff) | mock-guard: PASS ("No production source files to scan" — `.sh` not TS) | `shellcheck -x`: clean on both touched scripts

verdict: **APPROVED — DONE_VERIFIED**

### Verification detail
1. **Ancestry:** `git merge-base --is-ancestor 42e7c6048 main` → true.
2. **Scope match:** `git show --stat 42e7c6048` touches exactly the 4 files claimed — no scope creep.
3. **AC-1 (age gate untouched):** read `compute_id_maps()`'s actual selector — `.id != null and (.status | IN($tsig_arr[])) and ((.ts | coldevict_ts_epoch_or_oldest) < $sig_cutoff)` (`orch-cold-evict.sh:533-536`) — `$sig_cutoff` derived from `SIGNAL_MAX_AGE_HOURS` (unchanged `:-24` default) is still ANDed in, byte-identical to pre-fix logic. Live-confirmed: all 10 remaining `triaged` rows on `docs/data/orch/orch-state.json` are <24h old (oldest `ts=2026-08-07T22:34:08Z` vs check time `2026-08-08T18:29Z`), correctly held back.
4. **AC-1 (exact-string match, no case-fold):** grepped for `ascii_downcase`/`ascii_upcase`/case-fold near the predicate — none found anywhere in the script. `.status | IN($tsig_arr[])` is literal jq equality; both `triaged` and `TRIAGED` require (and now have) their own separate literal entries.
5. **AC-2 (skill-doc sync, no new drift):** `.claude/skills/signal-dashboard/SKILL.md` § PRUNE criteria line now reads `READ, RESOLVED, SUPERSEDED, ACUTE-RESOLVED-ROOT-TRACKED, triaged, TRIAGED, RETRACTED` — byte-identical (order + content) to the script's real `TERMINAL_SIGNAL_STATUSES` default. § ACK/CLOSE's prior "KNOWN GAP" note replaced with a closure note pointing at this task — accurate, no overclaim.
6. **AC-3 (dry-run before live):** commit message + review_note both state `--dry-run` was run first (217 rows would evict) before any live application — the fix commit itself performs no live board mutation (confirmed via `git show --stat`, only touches the 4 files above, no `orch-state.json`).
7. **Live production evidence (independently re-derived, not trusted from prose):** a separate, later-sequenced commit `d1ba52d18` (`git log --oneline --graph` confirms it lands immediately after `42e7c6048`, before this task's own `3e448a63b`/`a116734b8`; no `Task:` trailer — genuinely NOT part of this task's own commit chain, a scheduled/peer cold-evict invocation) dropped `signal_queue.rows` 248→31. `jq` histogram before/after that commit: before = 21 READ + 4 RETRACTED + 3 TRIAGED + 220 triaged (248 total); after = 21 READ + 10 triaged (31 total) — matches the dispatcher's claimed count exactly.

### Anomaly investigated (non-blocking)
`orch-apply-wrapper-tests.sh` own re-run returned 73/76 (3 fail: `CONSERVATION setup`, `APPEND-HAPPY` x2), not the claimed 75/75. Root-caused, not accepted or silently flagged: an UNCOMMITTED, in-flight peer WIP edit was sitting dirty in the shared working tree on `apps/mcp-server/src/infrastructure/orchStateSchema.ts` (new RC-VERIF `verification.raw_probe` completion-gate for `DONE_VERIFIED`/`DEGRADED` rows, not yet landed on `main`). `bun scripts/orch-validate.mjs` imports the `.ts` schema directly from disk (no build step), so it picked up the dirty file. Proved unrelated: `git show HEAD:orchStateSchema.ts | grep -c raw_probe` = 0 (this task's own 3 commits never touch that file) vs 10 in the dirty working copy. Not a regression from this diff.

### Board write
`.task_board.review[] → .task_board.done_verified[]`, `status: REVIEW → DONE_VERIFIED`. Board write itself hit the same in-flight peer `raw_probe` gate (rejected the new `DONE_VERIFIED` row without one) — rather than downgrade to plain `DONE` or block on an unrelated peer's local WIP timeline, attached a genuinely-performed `verification.raw_probe` object (`tool: jq`, live `signal_queue` count/histogram + age-gate spot-check as `args`/`live_value_observed`, `observed_at` stamped) — a real independent live re-probe actually run, not fabricated. Re-validated clean, applied via `jq` + `scripts/orch-apply.sh` (conservation OK: `task_total 754→754`, `signal_total 31→31`, `signal_row_identity=clean`). Review text appended to the row's own new `status_note` field (no handoff file — direct-commit verify; dev's `review_note` left intact). Merge commit `424880ccd`, pushed to `origin/main`.

DJ: `docs/agent-memory/decisions/sprint-COWORK-GUARANTEED-SLOT-CATCHUP-qa-13.md` §qa-S14.
