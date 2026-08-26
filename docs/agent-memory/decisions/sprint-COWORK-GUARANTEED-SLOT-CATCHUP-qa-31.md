# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · qa (continuation 31)

**Sprint goal:** COWORK-GUARANTEED-SLOT-CATCHUP
**Agent:** qa
**Started:** 2026-08-26T11:05Z (continuation — qa-30.md breached byte cap 37744/36000, rolled per decision-journal § Cap Check)

---

### STEP qa-S242 · qa · 2026-08-26T11:05Z
**task-id:** FIX-DRS-CLAIM-HAS-NO-ALLOWLIST-GATE-OFF-ALLOWLIST-BLIND-DISPATCH
**what-done:** Direct-commit verify of `9cc870461` (branch:null). Confirmed commit is a real `main`-ancestor touching all 8 claimed files. Grep-confirmed the SSOT def (`design_router_default_allowlist`, `devteam-eligibility.jq:636`) is called by claim (`:181,189`) and promote (`:132`) — no surviving hardcoded copy of the array inside either production consuming script. Ran `devteam-dispatch-gate-satisfiability.sh` at HEAD: both new cases (AC-DRS-ALLOWLIST-GATE, AC-DRS-ALLOWLIST-SKIP-TO-NEXT) PASS; re-ran the SAME post-fix script against a worktree checked out at the parent commit (pre-fix claim/promote/eligibility files) — both FAIL there (real discrimination, not vacuous). Ran the claim jq read-only against a scratch copy of the LIVE board twice: 1st picks on-allowlist P0 `FIX-CYCLE-SNAPSHOT-...`, 2nd (after removing it) picks the next on-allowlist row `FIX-COWORK-LASTFIRED-...`; across both runs all 3 blast-radius off-allowlist rows (`FIX-FLEETPUSH-DISARM-...`, `FIX-MACRO-TE-CHROMIUM-FETCH-BROKEN`, `UC-SDF-P2`) stayed parked in `ready[]`, never claimed. Never touched the live orch-state.json (scratch copies only).
**what-considered:**
- Trust the row's own architect_review_note vs re-derive independently — re-derived: grepped line numbers myself, ran the audit script myself, built the pre-fix worktree myself rather than accept "verified fail-pre-fix/pass-post-fix" on prose.
- 2 unrelated pre-existing FAILs in the same audit run (SLS gate, Review-Lane QA-Drain gate, live in_progress/review counts) — confirmed these fail IDENTICALLY (same lines, same live counts) when the unmodified pre-fix script is run against the same live board, i.e. a pre-existing baseline, not a regression this commit introduced.
**why-decision:** All 4 verify-committed requirements satisfied with independent reproduction, not on-trust. mock-guard PASS (no scannable production source — pure jq/bash/md zone, bun test/tsc structurally N/A, consistent with zone precedent). No ISSUE. -> vc-approved.
**why-change:** no change from plan. Residual (non-blocking, reported, not fixed here): `docs/policies/dev-standards.md`/`main.md:1526`'s DRS promote "Usage:" snippets still hardcode the literal allowlist array via `--argjson` (unchanged by this commit, still an accepted override path) — the "exactly one edit point" claim holds for claim + both scripts' own fallback, not for those two pre-existing docs usage-examples.
