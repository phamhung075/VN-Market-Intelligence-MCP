<!-- size-justification: 56L — single-guardrail design brief (existing-mechanism audit + design + child-task decomposition); the audit and design sections are load-bearing for the same decision (baseline/ratchet choice) and splitting them loses the "why" trail. -->
# FACTORY-GUARD-CI-size-lint-justification — Architect Design Brief

**Task:** `FACTORY-GUARD-CI-size-lint-justification` (epic FACTORY-MAINTAINABILITY-2026-06, P2, zone `cross-service/`)
**Author:** architect · **Date:** 2026-07-24
**Note on scope precondition:** `backlog-detail.json` carries a coordination note "Scope via architect spike `FACTORY-GUARD-CI-REGRESSION-SPIKE` before dispatch" on all 7 sibling `ci-regression-prevention` rows. That spike is still `BACKLOG` (unclaimed) — this row was pulled ahead of it by BOUNDED-1 idle-capacity auto-pickup. Scoping this ONE row standalone (as dispatched) does not block the spike from later covering the other 6; no rework risk since this design is self-contained.

## 1. Existing live mechanism (verified, not ticket prose)

**Found:** `scripts/agents-flow/context-bloat-backstop.sh` + SSOT `docs/data/file-size-caps.json` already implement line-cap + byte-cap governance with `size-justification` header honoring (±10%/min-5L tolerance), breach-signal emission, and dedup. **But its own SSOT note is explicit: "Code and data JSON are explicitly NOT governed."** Governed patterns are 100% docs/agent-governance surfaces (notebooks, `docs/agents/*/flow/**/*.md`, `.claude/skills/**/*.md`, `.claude/agents/*.md`, `docs/TASKS.md`, `docs/daily/*/*.md`, `docs/agent-memory/decisions/sprint-*.md`). It is also a **Claude-Code PostToolUse hook** (session-time, fires only on Write/Edit/NotebookEdit) — bash-heredoc/non-Claude-tool writes bypass it entirely (same gap TE-T17 `notebook-linecap-sweep.sh` was built to backstop on the notebook plane).

**Confirmed zero coverage for source code:** grepped all 7 `.golangci.yml` (only `depguard` Fence-A/B/C enabled, no `lll`/file-length linter), all 3 TS `eslint.config.mjs` (no `max-lines` rule anywhere in the repo), `apps/pdf-extractor/pyproject.toml` (import-linter fences only, no ruff/flake8 file-length rule), and `.github/workflows/ci.yml` (bun test + go-lint×6 + py-lint, zero size-lint step). **Gap is real and total** — this is a genuinely new mechanism, not a duplicate of the doc-plane hook. It should reuse the SAME `size-justification:` keyword (one grep-able repo-wide convention) but run as a separate CI-time script, since the enforcement plane (git-level gate) and file domain (source code) both differ.

**Live count (2026-07-24, supersedes ticket's stale "600+"):** of 1,549 tracked `*.ts`/`*.py`/`*.go` files (apps/+packages/, excluding tests/vendor/`.d.ts`), **748 exceed 120 LOC, 15 already carry a valid `size-justification` header, 733 are unjustified.** The 15 already-justified files (`runners.go`, `discover.go`, `capability_probe.go`, `exec_primitive.go`, `telegramCommands.ts`, 6 `pdf-extractor/infrastructure/generic_md_table/*.py` files, etc.) were all produced by prior FACTORY-* split tasks and **already use exactly the convention this ticket proposes** — this design formalizes an emerging practice, not invents one. The 120-LOC threshold itself is not new either — it is the audit brief's own already-declared standard (`docs/architecture-briefs/2026-06-15-maintainability-factory-audit.md`: "its own factory/maintainability standards (120-LOC split + size-justification headers)").

**Ticket-prose correction (verify-live catch):** the backlog description pairs `<!-- size-justification: ... -->` with "TS/MD" — HTML comments are invalid `.ts` syntax. Corrected below: `.ts`/`.go` use `//` (matching the 15 live examples, incl. `telegramCommands.ts` which nests it inside a `/** */` JSDoc block); `.md` keeps `<!-- -->`; `.py` keeps `#`.

## 2. Guardrail design

**Marker (per-language, already-live convention, formalized):**
- `.ts` / `.go`: `// size-justification: <NNL — reason>`
- `.py`: `# size-justification: <NNL — reason>`
- Must appear in the first ~10 lines (the 15 live examples place it at line 1–4, after an optional file-purpose comment).

**Threshold:** 120 LOC, matching the epic's already-declared standard. Excludes the same test/vendor/decl patterns the repo already uses elsewhere (`*.test.ts`, `*_test.go`, `test_*.py`, `__tests__/`, `tests/`, `node_modules/`, `dist/`, `.venv/`, `PDF-Extract-Kit/`, `*.d.ts`).

**Mechanism — baseline/ratchet, NOT blanket hard-fail.** 733 live unjustified offenders means a same-day zero-tolerance gate would instantly red every push/PR — this is not the intent (backlog-detail.json: "stops the backlog from **regrowing**", not "fixes the backlog"). Design:
- One-time generated `docs/data/size-lint-baseline.json` snapshots every currently-over-cap-without-justification file + its line count at generation time — grandfathers 100% of today's debt (same pattern as `file-size-caps.json`, but per-file since code has no uniform per-directory cap the way docs/ does).
- New CI script walks the full tracked tree at push/PR time (full-scan, not diff-only — this is the piece that closes the doc-plane hook's non-Claude-tool-edit gap, and is what makes it a real "CI" gate per the ticket title):
  - File ≤120L or carries a valid header → PASS.
  - File in baseline, still within tolerance (mirrors the hook's ±10%/min-5L idiom) → PASS (untouched grandfathered debt).
  - File in baseline but grown past tolerance → **FAIL** (a touched grandfathered file got worse — the exact regrowth case).
  - File NOT in baseline and >120L without header (new file, or an existing file crossing 120L for the first time) → **FAIL** (new offender, zero tolerance — the core regression gate).
- Baseline entries that shrink under cap or gain a header are prune-eligible via a `--update` regen mode of the same script (mirrors the already-established `gen-tools-index.sh --check`/normal-run split pattern) — run manually by whoever fixes the file, not automatically in CI.
- Exit-code contract: 0 pass / non-zero fail with offending-path list, matching every other CANONICAL script's convention.

**Review visibility (MANDATE point 2):** the CI job's failure output on the PR checks tab IS the review signal — no separate bookkeeping file needed. The baseline manifest's own git diff (entries removed as files get split/justified) is the visible "debt paid down" record over time.

**CI wiring:** new `size-lint` job in `.github/workflows/ci.yml`, `ubuntu-latest` + `actions/checkout@v4` only (pure bash/jq/wc — no bun/go/python setup, cheapest job in the pipeline).

## 3. Build vs plan — decomposed, NOT self-implemented

This needs code (new script + generated baseline + workflow YAML edit + doc pointer) — architect does not write it. One child task, atomic (single sitting, no BA/PM relay — BUILD-STANDARD: not-applicable, bug-fix/tooling-add in-zone).

**Routing correction (verify-live catch #2):** the dispatch prompt suggested "signal agent-father". Checked live: `agent-father`'s own `init.md` disclaims `"not_my_job: Writing production code — that's developer"`, and a sibling live board row (`UC-ASL-P6`) is explicitly `supervised:true` specifically *because* `next_agent: agent-father` + `zone: cross-service/` is un-routable by BOUNDED-1 (`zone-detect` Tier-3 for `cross-service/` resolves to generic `developer`, which cannot reach `agent-father`). Routing this to `agent-father` would reproduce that exact mis-route. Correct `dev_agent`/`next_agent`: **`developer`** (generic, per zone-detect Tier-3 for `cross-service/`).

**Minted child row:** `FACTORY-GUARD-CI-SIZELINT-IMPL` (task_board.backlog, detail in backlog-detail.json) —
- **files:** `scripts/audits/size-lint-justification.sh` (new, `--check`/`--update` modes), `docs/data/size-lint-baseline.json` (new, generated by `--update`), `.github/workflows/ci.yml` (edit — add `size-lint` job), `docs/policies/dev-standards.md` (edit — CANONICAL pointer), `scripts/audits/size-lint-justification.test.sh` (new smoke test)
- **approach:** implement `--check` (CI mode, exit 0/1) and `--update` (regen baseline) per §2 above; run `--update` once to generate the initial baseline from live repo state; wire `size-lint` job into ci.yml; add CANONICAL pointer.
- **dod:** `--check` exits 0 on current repo state (baseline covers all 733); a synthetic new >120L file with no header fails `--check`; a synthetic baseline file grown past tolerance fails; a justified/shrunk file is dropped by `--update`; smoke test covers all 4 cases; CI green on push.

## RETURN
DONE: Design complete, brief written, 1 child task minted (not yet promoted to ready — dispatcher/PM sequences per normal backlog flow).
ZONE: cross-service/
NEXT: pm (routes FACTORY-GUARD-CI-SIZELINT-IMPL to developer when promoted)
BUILD-STANDARD: not-applicable (bug-fix/tooling-add in-zone, no new service/feature primitive)
