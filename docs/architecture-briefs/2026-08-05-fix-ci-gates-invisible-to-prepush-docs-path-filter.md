<!-- size-justification: ~150L — single-hook design brief: measured dry-run (AC1, the gate on the whole row) + exact hook-diff spec + fail-open/escape-hatch decisions + residual-risk disclosure + test strategy; splitting the measurement out of the design loses the "the number IS the design constraint" trail (mirrors the rebuild-raw-verify-hook brief's own single-file sizing). -->
# FIX-CI-GATES-INVISIBLE-TO-PREPUSH-DOCS-PATH-FILTER — Architect Design Brief

**Task:** `FIX-CI-GATES-INVISIBLE-TO-PREPUSH-DOCS-PATH-FILTER` (P1, zone `cross-service/`, direct PO board-mint, no BA spec)
**Author:** architect · **Date:** 2026-08-05
**Fence (PO's own instruction, restated):** this row is the DETECTION-MECHANISM gap itself, NOT the 3 symptom bugs. It must NOT be closed by `FIX-CI-SIZELINT-BCTC-1345B-PARSE-VALIDATOR-PAIR` / `FIX-CI-PARITY-CLAUDEMD-CRON-LITERAL-EXEMPTION-SHAPE` / `FIX-CI-TASKCLAIM-PO-FLOW-OWNER-SESSION-PAYDOWN` going green — those are independent parallel fixes to the 3 offending files/lines. This row stays open until `scripts/git-hooks/pre-push` itself gains local coverage for the check classes that broke.

## 0. Brownfield read (verified at source, matches PO's D4 triage)

`.git/hooks/pre-push` is a symlink to the tracked `scripts/git-hooks/pre-push` (115L, read in full). Two checks only, both gated by one regex:
```
CODE_TOUCHING_REGEX='^(apps|packages|scripts)/.*\.(ts|tsx|js|mjs|json)$|^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml)$'
```
1. `pnpm --filter vn-market check` (tsc) — only if the push range matches the regex.
2. `scripts/audits/rebuild-raw-verify-check.sh <remote> <local>` — same gate, nested inside it (only invoked when tsc also runs).

`docs/data/orch/orch-state.json`'s CI-red board rows + `git log` confirm 3 independent breakages landed on paths this regex excludes: `size-lint` at `7ac55adc8` (code, but the offending files exceed the ratchet — separately tracked), `bun test`/tool-registry-parity at `9af50bb26` (`CLAUDE.md`, root doc), `task-claim-owner-session-lint` at `3ce726a6e` (`docs/agents/po/flow/sprint-kickoff.md`, docs path). All three are enforced in `.github/workflows/ci.yml` as separate jobs, but pre-push runs none of them. `CODE_TOUCHING_REGEX` explicitly excludes `docs/` and does not test `.md` at all — a docs-only push always skips BOTH existing checks, and no other local check ever runs.

## 1. AC1 — measured dry-run BEFORE any widening (this is the gate on the whole row)

The `docs/`-exclusion exists for a specific, documented reason: `scripts/git-hooks/pre-push:13-19` cites UC-GCP-P4 (2026-07-16) — full tsc measured ~94s, longer than `commit-mutex:main`'s `ttl_seconds=90` (`.claude/skills/commit-mutex/SKILL.md` step 1) — and the mutex's critical section literally wraps `git push origin main` (step 2d), so pre-push hook wall-clock is inside the TTL clock. A naive "just widen the regex to include docs/" would make every doc-only push (~68% of commits, per the hook's own comment) pay that ~94s tsc cost against a 90s budget — reintroducing the exact bug the filter was built to fix.

**Measured 2026-08-05, this machine, 2-3 runs each, `time` wall-clock (`total` field):**

| Check | Command | Run 1 | Run 2 | Run 3 |
|---|---|---|---|---|
| `size-lint-justification.sh --check` | full-tree scan, 1358 files | 13.253s | 13.555s | 14.035s |
| `task-claim-owner-session-lint.sh --check` | full-tree scan, 270 files | 5.480s | 6.143s | 5.848s |
| `bun test tool-registry-parity` (from `apps/mcp-server`) | 1 file, 17 tests | 0.312s | 0.088s | 0.079s |

**Combined ≈ 19.5-20s.** That is inside the 90s TTL with roughly 70s / ~4.5x margin — comfortably safe even accounting for a slower dev machine. `size-lint` dominates the cost (a bash `while read` loop forking `wc`/`head`/`grep`/`awk` per matched file, ~1358 iterations) — not I/O-bound, not cache-warmup-sensitive (2nd/3rd runs did not get materially faster). **AC2's premise is confirmed by measurement, not assumed:** these 3 checks really are cheap relative to tsc (94s), and running all 3 together does not approach the 90s budget.

**Anti-false-green side-effect of the measurement:** running the 3 checks live against current HEAD reproduces the exact 3 CI-red conditions already visible on GitHub Actions — `size-lint` FAILs on `parseBctcReport.ts` / `financialFiguresValidator.ts` (baseline-tolerance-exceeded), `task-claim-owner-session-lint` FAILs on `docs/agents/po/flow/sprint-kickoff.md:44`, and `bun test tool-registry-parity` FAILs `T-U3-4`/`T-U3-7`. This is proof the mechanism this row builds would have caught all 3 breakages locally, at push time, on the very commits that caused them — the concrete demonstration of the gap PO's triage named.

## 2. Design — unconditional doc-shaped checks, tsc/rebuild-verify gated exactly as today

Per the row's own AC2 steer: add the 3 fast checks **unconditionally** (every push, not gated by `CODE_TOUCHING_REGEX`) so a docs-only push — the exact class that broke CI 2 of 3 times — can never silently skip them again (AC3: no silent fail-open on a docs-only push). Leave tsc + `rebuild-raw-verify-check.sh` on their existing `CODE_TOUCHING_REGEX` gate, completely unchanged — that gate's own reasoning (94s constraint) is untouched by this fix.

**Ordering decision (flagged, not silent):** today's `PRE_PUSH_SKIP_TSC=1` guard is the FIRST thing the hook does (line 43-46) and, despite its name, currently bypasses the **entire hook**, not just tsc — a pre-existing mislabeling. Place the new unconditional block **before** that guard, so `PRE_PUSH_SKIP_TSC=1` reverts to matching its own name (skips tsc only) rather than becoming a second, wider escape hatch for exactly the checks this row exists to make un-skippable. This is a 4-line reorder, not a behavior expansion of the escape hatch — `PRE_PUSH_SKIP_TSC=1` remains documented as "NOT recommended, equivalent to `--no-verify`" and CLAUDE.md's standing "never skip hooks" rule is unaffected either way.

**Spec for `scripts/git-hooks/pre-push` (developer implements; exact shape, not literal diff):**
```
set -e
REPO_ROOT="$(git rev-parse --show-toplevel)"; cd "$REPO_ROOT"

run_doc_shaped_checks() {
  bash "$REPO_ROOT/scripts/audits/size-lint-justification.sh" --check || return 1
  bash "$REPO_ROOT/scripts/audits/task-claim-owner-session-lint.sh" --check || return 1
  if ! command -v bun >/dev/null 2>&1; then
    echo "[pre-push] WARN: bun not on PATH — skipping tool-registry-parity check (fail-open, mirrors the pnpm-missing fail-open below)"
  else
    (cd "$REPO_ROOT/apps/mcp-server" && bun test tool-registry-parity) || return 1
  fi
  return 0
}
run_doc_shaped_checks || { echo "[pre-push] BLOCKED: doc-shaped check(s) failed — see output above. Fix, then re-run 'git push'."; exit 1; }

if [ "${PRE_PUSH_SKIP_TSC:-0}" = "1" ]; then
  echo "[pre-push] PRE_PUSH_SKIP_TSC=1 — skipping tsc check (NOT recommended)"
  exit 0
fi
# ...unchanged from here: pnpm check, CODE_TOUCHING_REGEX loop, tsc, rebuild-raw-verify-check.sh...
```
`command -v jq` is deliberately NOT re-checked here: both lint scripts already do their own internal `command -v jq || exit 2` and jq is a hard, ubiquitous dependency across this repo's own tooling (`orch-apply.sh` et al.) — unlike `pnpm`/`bun` (JS toolchains this hook already treats as optionally-absent), a missing `jq` is a genuine environment defect worth BLOCKING on, which also satisfies AC3's "fail loud" requirement more directly than a redundant fail-open wrapper would.

## 3. Explicitly OUT of scope / no change needed

- **`.github/workflows/ci.yml`** — the row's own initial `files` guess listed this, but no CI change is needed: `size-lint` and `task-claim-owner-session-lint` are already separate CI jobs, and `tool-registry-parity.test.ts` already runs inside the existing `test` job's full suite. This fix is 100% local-hook-side.
- **The 3 symptom bugs themselves** (per the fence above) — size-lint's 2 offending files, the parity test's `T-U3-4`/`T-U3-7` CLAUDE.md drift, and `sprint-kickoff.md:44`'s missing `owner_client_session` are each their own row and are explicitly NOT fixed here.
- **The tsc-vs-TTL collision on CODE-touching pushes** — that constraint is pre-existing and unchanged by this fix (tsc alone was already measured at ~94s > 90s TTL before this row; adding ~20s of doc-shaped checks on top of an already-over-budget code-touching push makes an existing, separately-tracked pre-existing condition marginally worse in degree, not in kind). Flagging for the record, not fixing here — no board row currently owns "tsc alone already exceeds the mutex TTL"; PO's lane to decide whether that's worth its own row.

## 4. Test strategy

No test file exists yet for `scripts/git-hooks/pre-push` itself (only its sub-scripts have tests, confirmed live: `scripts/audits/size-lint-justification.test.sh`, `scripts/audits/task-claim-owner-session-lint.test.sh`, `scripts/audits/rebuild-raw-verify-check.test.sh` — this fix does NOT need to touch any of those 3, only add coverage for the hook's own new orchestration). Add `scripts/git-hooks/pre-push.test.sh`, mirroring the isolated-scratch-repo idiom already established by `scripts/git-hooks/pre-commit.test.sh` / `rebuild-raw-verify-check.test.sh` (`new_repo()` under `mktemp -d`, never touches the live repo's `.git/`):
1. Doc-only synthetic push (fixture repo with a passing size-lint/task-claim-lint/parity-equivalent state) → doc-shaped checks run, tsc SKIPPED (mirrors the 9 existing UC-GCP-P4 stdin scenarios' "doc-only skip" case, now asserting the NEW checks fire on that same input where they previously didn't).
2. One doc-shaped check made to fail (e.g. inject an unjustified >120L file) → hook exits 1 (BLOCKED) even though the push is docs-only.
3. Code-touching push → doc-shaped checks run AND tsc still gated exactly as before (reuse the existing fake-pnpm-stub idiom from UC-GCP-P4).
4. `bun` absent on `PATH` → WARN + non-blocking skip of the parity check only (fail-open), other 2 checks still run and can still block.
5. **Live parity proof (not a synthetic fixture):** run the updated `run_doc_shaped_checks()` logic directly against the current repo HEAD (no push needed) and confirm it reproduces the same 3 failures §1 measured live from CI — this is the evidence that local/CI detection parity is restored, independent of whether the 3 symptom rows have shipped yet (AC4: dry-run report + a subsequent green CI once the symptom rows land, not a self-assertion).

## 5. Build vs plan — routing

**Routing:** `next_agent = developer` (`cross-service/` + `scripts/git-hooks/` — precedent: `UC-GCP-P4` routed this exact file to `developer`, PO decision log 2026-07-13; `FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-HOOK` for `pre-commit` sibling, same routing). PM decomposition skipped — single file edit (`scripts/git-hooks/pre-push`) + one new test file + a `docs/policies/dev-standards.md` CANONICAL entry (mirrors every sibling `FACTORY-GUARD-CI-*-IMPL` entry's own pattern — developer adds it as part of the same task, not architect), matches this board's established convention for bounded FIX rows this size (e.g. `FIX-BCTC-SSC-DOC-SELECTION-QUARTER-BLIND-ALWAYS-LATEST`, `FIX-MCP-MEMORY-CODE-LEAK`).

**Risk flag for developer/QA (blast radius):** `scripts/git-hooks/pre-push` gates every push, fleet-wide. Before the first REAL push exercises the new code path: (a) get the new `pre-push.test.sh` fully green in isolation first, (b) `bash -n` + `shellcheck` clean (existing convention for every hook script in this repo), (c) the very commit that ships this fix is itself the first live smoke test of the new hook — if the new checks misbehave, `PRE_PUSH_SKIP_TSC=1` remains the (disfavored, forbidden-by-policy-except-emergency) escape hatch, but shipping a broken blocking check with no clean recovery path would strand the whole fleet's pushes exactly like the historical `TS2367` sole-tsc-red incident did. Do not treat "tests pass in isolation" as sufficient without also confirming §4 point 5 (live dry-run against HEAD reproduces the 3 known CI failures) before calling this DONE.

## RETURN
DONE: Design complete. Measured (not assumed) the 3 candidate checks at ~19.5-20s combined local wall-clock — inside the 90s commit-mutex TTL with ~4.5x margin — confirming AC1/AC2's premise. Exact hook-diff spec, ordering decision (PRE_PUSH_SKIP_TSC scope-correction), fail-open posture, and test plan above. `architect_review_note` + `architect_brief` written via `orch-apply.sh`, `backlog[]→ready[]`, `next_agent: developer`. Fence restated: not closeable by the 3 symptom rows.
ZONE: cross-service/
NEXT: developer (direct — PM decomposition skipped, single bounded file + test + CANONICAL doc entry)
BUILD-STANDARD: not-applicable (bug-fix/tooling-add in-zone, no new service/primitive)
