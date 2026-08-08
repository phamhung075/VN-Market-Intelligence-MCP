# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · qa

**Sprint goal:** COWORK-GUARANTEED-SLOT-CATCHUP
**Agent:** qa
**Started:** 2026-08-08T18:56:36Z

---

### STEP qa-S15 · qa · 2026-08-08T18:56:36Z
**task-id:** FIX-COWORK-SPAWN-IDENTITY-PREAMBLE-OFFFLOW
**what-done:** Direct-commit verify (`qa[]` row, `branch:null`, no `commit`/`files[]` field at all — derived via review_note-prose fallback).
**what-considered:**
- `git log --all -- spawn-fanout.md last-fired.md main.md cowork-schedule-consistency.test.js` (files named in review_note prose) → found `add3f13a1`, whose own message carries `Task: FIX-COWORK-SPAWN-IDENTITY-PREAMBLE-OFFFLOW` verbatim.
- Confirmed `main` ancestor; `git show --stat` matches all 4 claimed docs (spawn-fanout.md, last-fired.md, main.md, journal) exactly.
**why-decision:** 3 later commits (`0d16f28ce` session-id inject, `6452935ab` tombstone, `9c509d295` cron-rearm) also touch these same files — read CURRENT live content, not the diff alone: IDENTITY_PREAMBLE (Step 5.2) and the exogenous Step 5.3 off-flow detector are still fully intact, layered cleanly under the later SESSION_ID_LINE append (appended AFTER both, no clobber). `last-fired.md` AC-P1-7-4 and `main.md` JUMP-TO row both present, byte-consistent with the claim. Re-ran (not trusted) the sibling regression suite `cowork-schedule-consistency.test.js` live: 9/9 PASS, matches claim.
**why-change:** Zero `.ts`/production source touched (5 files, all docs/memory/journal) — `bun test`/`tsc --noEmit`/`mock-guard.sh` structurally N/A (mock-guard scans production source only, none touched). Verification gate on the row is explicitly BEHAVIORAL (next live off-flow incident or synthetic injection) — dev's own review_note flags this as unconfirmable in-dispatch; APPROVED on the structural/static claims (code present, correct, unclobbered by later commits, sibling test green), consistent with prior verify-committed precedent for docs-only rows (cycle-598 in notebook).

### STEP qa-S16 · qa · 2026-08-08T18:58:37Z
**task-id:** FIX-MCP-MEMORY-CODE-LEAK
**what-done:** Direct-commit verify (`qa[]` row, `branch:null`, no `commit`/`files[]` field — derived via `dev_implementation_note` prose fallback, found `609f62800`).
**what-considered:**
- Ancestry + file-match: `merge-base --is-ancestor 609f62800 main` yes; `git show --stat` matches all 4 claimed files exactly (schema.ts, 002-db-schema.test.ts, 2 arch docs).
- Static re-run (not trusted from prose): `bun test 002-db-schema.test.ts` 26/26 pass, `bun tsc --noEmit` 0 errors, `mock-guard.sh` PASS, env/secret greps clean.
- PO re-scoped this row's AC (`po_ac_rescope_20260808T1759Z`) to the initDatabase() bootstrap-sweep signature probe only (gates (c)/(e) re-homed off this row) — independently re-measured LIVE, not relayed: `docker logs | grep -c backfillOCFForWatchlist` = 1 since boot (container RestartCount=0, ~2h uptime) vs documented pre-fix ~52/10min; WeakSet guard confirmed present in the deployed container file via `docker exec grep`, not just git HEAD.
**why-decision:** Both the static (commit/tests/tsc/mock-guard) and the row's own live-AC (bootstrap-sweep count) checks independently reproduce PO's live claim rather than trusting it — genuine APPROVED.
**why-change:** No change from plan; board write required a `verification.raw_probe{tool,args,live_value_observed,observed_at}` object (validator-enforced on DONE_VERIFIED) — attached the real docker-logs probe just run, not fabricated.

### STEP qa-S18 · qa · 2026-08-08T18:58:43Z
**task-id:** FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP
**what-done:** Direct-commit verify (`qa[]` row, `branch:null`, no top-level `commit`/`files` field — derived commit from dev's own dated note `dev_rag_service_implementation_20260805T1117Z` naming `22232ad2b`).
**what-considered:**
- `git merge-base --is-ancestor 22232ad2b main`: OK. `git show --stat`: touches exactly the 4 files claimed (repositories.py, test_lancedb_compaction.py, infrastructure.md, testing.md); `Task:`/`AC:` trailers match id + AC1/AC2/AC5 verbatim. `git log 22232ad2b..HEAD -- repositories.py`: empty — live file IS the fix, no later drift.
- Re-ran REAL, not trusted from PO/dev prose: `pytest __tests__/unit/test_lancedb_compaction.py` 6/6 incl. AC1 (real injected `table.optimize` failure resets counter, no immediate re-fire) and AC2 (2 concurrent inserts → exactly 1 `optimize()` call). Full suite 175/175 (superset of dev's claimed 163, later unrelated rows added tests since). `mypy --strict repositories.py`: 14 errors both BEFORE (checked out `22232ad2b^`) and AFTER — confirmed 0 NEW, matches dev's own "14->14" claim rather than trusting it. `mock-guard.sh`: PASS exit 0. No `process.env`/secrets in touched files. Docs diff (infrastructure.md/testing.md) read against current code — accurate, not stale.
- Live container (non-invasive `docker inspect/stats/logs` only, per row's own no-exec constraint): RestartCount=0, StartedAt 08:11:45Z (~10h45m uptime), zero "compaction failed"/"Retryable commit conflict" in 6h logs (871 POST /index / 9 compactions ≈ 96.8/attempt vs pre-fix baseline 55) — corroborating but NOT the judgment basis per `po_deploy_verified_for_qa_20260806T1245`'s explicit scoping (AC1/AC2/AC5 only, not AC3/AC4/AC6).
**why-decision:** APPROVED, DONE_VERIFIED. AC1/AC2 are the row's own stated whole-defect coverage and both pass against a genuinely re-executed, real-failure-injected test, not prose. AC5 (insert still succeeds on compaction failure) covered by both the new AC1 test and the pre-existing `test_compact_failure_is_nonfatal`, both green.
**why-change:** No change from PO's own scoping note — judged this row on AC1/AC2/AC5 code-correctness only, did not re-litigate AC3/AC4/AC6 (host-side observation / explicitly-disclaimed-scope) already adjudicated by PO/router across 6 prior notes on this row.

### STEP qa-S19 · qa · 2026-08-08T18:59:52Z
**task-id:** SYSREMAKE-P2-T2-SCHEMA-ADDITIONS
**what-done:** Direct-commit verify (`qa[]` row, `branch:null`, commit `ad6e422e9`, router-dispatched) of RC-VERIF schema gate vs brief §2.1-§2.5.
**what-considered:**
- Independently re-ran (not trusted): orchStateSchema.test.ts 120/120, atomic-write 8/8, STRAND-5 14/14, AC-mjs 29/29, wrapper-tests 75/75, tsc 0 err, size-lint clean (2 pre-existing unrelated offenders confirmed), mock-guard PASS, orch-validate.mjs on committed snapshot 74cf3856a → Stage0+1 PASS.
- Re-derived §1A-before-TaskSchema placement is a genuine TDZ necessity (TaskSchema's z.object() references VerificationSchema at module-eval time; brief's literal §4 slot is textually after TaskSchema) — verified by reading code order, not dev's say-so.
- Independently re-ran the grandfather jq query live: my own 51-id output byte-identical to embedded `RC_VERIF_GRANDFATHERED_IDS` — set well-formed, no drift.
- Confirmed SYSREMAKE-P2-T3 (full V1-V5/D1-D2/T1 matrix) is a pre-existing PM row (2026-07-17) depends_on this task — deferral is legitimate scope-split, not a hidden gap.
**why-decision:** APPROVED, DONE_VERIFIED. All claims independently reproduced; deviation technically forced and correct; grandfather list proven complete against live data; T1's embedded set matches.
**why-change:** No plan change. Noted non-blocking: `orch-cold-evict-tests.sh` showed 7/59 transient "REAL live file CHANGED" fails — traced to a concurrent peer's uncommitted working-tree write (TE-T31 REVIEW→DONE_VERIFIED) mid-run, unrelated to this commit (never touches that script; committed snapshot independently re-validated clean).

### STEP qa-S19 · qa · 2026-08-08T18:57:41Z
**task-id:** TE-T31
**what-done:** Direct-commit verify (`qa[]` row, `branch:null`, dev-team Review-Lane QA-Drain). `commit_sha` e3a3a68bb8e36cfe529acb511b1053cc01982e57 confirmed real `main` ancestor; `git show --stat` matches all 4 claimed files (gen-tools-index.sh, INDEX.md, dev-standards.md, WORK.md) exactly; Task/AC trailers match TE-T31 verbatim.
**what-considered:**
- Re-ran `bash scripts/gen-tools-index.sh --check` LIVE against the CURRENT registry (183 tools, drifted from 184 at commit time) → NOOP, 0 drift — proves idempotency against a changed registry, not just the shipped snapshot.
- `comm`/`diff` set-equality: registry tools (183) vs INDEX-linked tools (183) = 0/0 both directions, 0 missing `list/<tool>.md` stubs.
- `dev-standards.md` CANONICAL pointer confirmed present; `shellcheck -x` clean; `mock-guard.sh` PASS; secrets/env greps clean; zero `.ts` touched (shell+3 docs only) — `bun test`/`tsc` N/A.
- Independently confirmed the generator PROVEN in real subsequent production use: commit `8766bedc9` (2026-07-31, unrelated Polymarket-retirement task) regenerated INDEX.md via this exact script, correctly dropping 184→183 when the registry changed — end-to-end live evidence, not just ship-time claim.
**why-decision:** APPROVED, DONE_VERIFIED. All 5 AC clauses independently re-verified live, not trusted from prose; DJ-GATE-1 satisfied (developer journal `sprint-TOKEN-ECONOMY-AUDIT-developer.md` STEP developer-S12, task-id TE-T31 present).
**why-change:** No change from plan. Noted non-blocking: a concurrent peer session's writes to this same `qa-14.md` journal + `orch-state.json` interleaved with mine (multiple simultaneous verify-committed rows draining in parallel) — appended via `>>`, did not read-then-overwrite, to avoid dropping peer entries.
