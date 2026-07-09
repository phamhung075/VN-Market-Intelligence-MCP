# Decision Journal — FACTORY-NEWS-split-sandbox

**Agent:** dev-news-fetch (generic `developer` owner — zone-routed per system-map.json, no dedicated Agent-tool subagent type for `apps/news-fetch/`)
**Task ID:** FACTORY-NEWS-split-sandbox
**Timestamp:** 2026-07-09T22:27Z

## Premise Verification (before touching code)

Backlog note claimed the by-name signature switch sits "around line 223-235" — confirmed present at
that exact location in the live 486-line file before editing. Also grepped for any test importing
`runner.ts` by name or importing any of its would-be-relocated symbols (`deepEqual`,
`discoverScenarioFiles`, `runPrimitiveScenario`, etc.):

```
grep -rln "sandbox/runner\|from.*runner['\"]" apps/news-fetch/__tests__ apps/news-fetch/src/__tests__
```

Zero hits. `runner.ts` is invoked only as a standalone CLI script (`bun run src/sandbox/runner.ts`,
wired via `package.json`'s `"sandbox"` script) — it self-executes on `bun run`, has no unit-tested
exported surface, and no test imports it. Safe to relocate all internals freely; only the file path
`src/sandbox/runner.ts` itself (the CLI entry point) needed to keep existing.

## Decision

Split `apps/news-fetch/src/sandbox/runner.ts` (486L) into 7 files, same directory (`src/sandbox/`),
each ≤120L:

| File | Lines | Responsibility |
|---|---|---|
| `cli.ts` | 48 | `--tier`/`--module`/`--scenario`/`--output` flag parsing + the credential env-audit gate (AC-6) |
| `registry.ts` | 56 | `PRIMITIVE_REGISTRY` / `MODULE_REGISTRY`, each primitive entry carries a new `argAdapter` fn |
| `discover.ts` | 57 | `PROJECT_ROOT`/`SCENARIOS_ROOT` resolution + `discoverScenarioFiles` |
| `equal.ts` | 21 | `deepEqual` |
| `execute.ts` | 120 | `runPrimitiveScenario` + `runModuleScenario` + `runScenario` dispatcher |
| `report.ts` | 82 | per-scenario console output, run summary, JSON trace + `data.js` inline sidecar writer |
| `runner.ts` | 75 | thin orchestrator — `main()` loop + exit codes only |

`import.meta.dir` resolution preserved: every new file still lives in `src/sandbox/`, so
`resolve(import.meta.dir, '../primitive/...')` in `registry.ts` and
`resolve(import.meta.dir, '../../../..')` in `discover.ts` resolve identically to the pre-split values.

**argAdapter replaces the by-name switch**: each `PRIMITIVE_REGISTRY` entry now carries
`argAdapter: (input) => unknown[]`, e.g. `'published-at-parser': { ..., argAdapter: (input) =>
[(input as { rfcDate: string }).rfcDate] }`. `runPrimitiveScenario` calls
`fn(...entry.argAdapter(input))` instead of the 5-branch `if (fnName === 'parsePublishedAt') ... else if
...` chain that used to live inline (confirmed at lines 223-235 pre-edit).

**Behavior-preservation nuance caught before finalizing** (would have been a subtle bug): the original
code resolves `mod[fnName]` using **the scenario JSON's own `"function"` field**
(`const fnName = scenario['function'] as string`), NOT the registry entry's `fnName` field — even
though the registry entries also carry a (redundant, never-read) `fnName` field. My first draft of
`execute.ts` mistakenly wired `resolveFn(entry.importPath, entry.fnName, ...)`. Fixed by keeping the
scenario-derived `fnName` local variable and passing that into `resolveFn`, matching original semantics
exactly (all 14 current scenario JSON fixtures happen to have `scenario.function === entry.fnName`, so
this had zero observable effect on the current fixture set — but a divergence would produce a different
`Function '<name>' not found in module` ERROR message depending on which field is used, and the DoD
explicitly requires PASS/FAIL/ERROR semantics unchanged).

**Two small shared helpers added inside `execute.ts`** (not part of the original file, added to fit both
executors + type + dispatcher into the 120L budget without collapsing readability):
- `resolveFn(importPath, fnName, scenarioFile, tag)` — the dynamic-import + `typeof fn !== 'function'`
  guard chain, byte-identical logic, was duplicated verbatim in both `runPrimitiveScenario` and
  `runModuleScenario` in the original file.
- `finalize(scenarioFile, matched, tag, actual, expectedOutput)` — the `PASS` vs `FAIL`-with-diff
  result-shaping tail, was duplicated 3x across both executors (once in the primitive executor, twice in
  the module executor's partial-match + full-match branches).

Both are pure refactors of exact-duplicate original logic — no behavior change, just deduplication that
was needed to hit the file-size DoD line.

## What Considered

1. **Keep `runScenario` (file-read + dispatch) in `runner.ts` instead of `execute.ts`:** REJECTED — DoD
   explicitly groups "two executors" under `execute.ts`; `runScenario` is the thin dispatcher between
   them and belongs with its two callees, not in the orchestrator.
2. **Add an 8th file (e.g. `types.ts` or split `execute.ts` into `executePrimitive.ts`/`executeModule.ts`)
   to make the 120L cap trivially easy:** REJECTED — DoD names exactly 7 files (`cli, registry, discover,
   equal, execute, report, runner`). Chose to hit the 120L cap through legitimate dedup (`resolveFn`,
   `finalize`) inside the named `execute.ts` instead of inventing an 8th file not in the spec.
3. **Leave `entry.fnName` unused in the registry (as in the original):** KEPT — original code declared
   `fnName` on both `PrimitiveEntry`/`ModuleEntry` interfaces and set it in every registry entry, but
   never actually read `entry.fnName` anywhere (always used the scenario-JSON-derived local `fnName`
   instead). This is pre-existing dead metadata, not something this task's DoD asked me to fix — left
   as-is to keep the diff scoped to the split.

## Why This Change

Collapses a 486-line do-everything CLI script into 7 single-responsibility modules, each independently
readable and testable, with the registry now data-driven (`argAdapter` per entry) instead of requiring a
code change (another `else if` branch) every time a new primitive is added to the sandbox.

## Verification

- **Pre-check:** grep for test imports of `runner.ts` internals — zero hits (see Premise Verification).
- `bun test` (full suite, `apps/news-fetch/`): **233 pass / 6 skip / 0 fail / 372 expect() calls**, 26
  files — identical counts to the pre-split baseline (this task touched zero test files, zero
  non-sandbox production files).
- `bun tsc --noEmit`: 0 errors.
- `eslint src/ --max-warnings 0` (`bun run lint:ci`): 0 warnings/errors.
- `find docs/scenarios/news-fetch -name '*.json' -exec jq . {} \;`: all scenario JSON valid.
- **G12 sandbox gate:** `bun run sandbox --tier=all --module=news-fetch` → **16 PASS, 0 FAIL, 0 ERROR**,
  exit 0 — same result as pre-split.
- **Security gate:** ran the sandbox with a scrubbed env (`env -i PATH=... HOME=... bun run sandbox
  --tier=all --module=news-fetch`) — same 16/16 PASS, confirms the env-audit gate (now in `cli.ts`) still
  runs and the sandbox process needs zero credentials to execute.
- **Direct before/after comparison** (DoD explicitly requires "sandbox runs scenarios identically", not
  just "tests pass"): checked out the pre-edit `runner.ts` via `git show HEAD:...`, ran it and the
  post-split `runner.ts` each with `--output=<file>`, then diffed the two trace JSONs with the `runAt`
  timestamp field stripped (`jq 'del(.runAt)'`). Result: **byte-identical JSON** (all 16 scenario
  results, statuses, and diffs match exactly).
- Line-count check: `wc -l apps/news-fetch/src/sandbox/*.ts` → cli.ts 48, discover.ts 57, equal.ts 21,
  execute.ts 120, registry.ts 56, report.ts 82, runner.ts 75 — every file ≤120L (execute.ts lands exactly
  at the cap).

## Deferred / Not Closed Here

`news-fetch` runs as a `docker-compose` service. The live container still runs the pre-change image. Per
`feedback_user_gates_delegate_to_ops.md` (container swaps/rebuilds are user-gated — same pattern applied
identically on the immediately-preceding `FACTORY-NEWS-dedup-normalizeDate` task), this task is **kept in
`task_board.review[]`, not self-asserted `done_verified`**. This change touched only
`apps/news-fetch/src/sandbox/` — a dev-only scenario-runner CLI with zero infrastructure imports that
never runs inside the container's request path — so the deferred check is a low-risk rebuild-boots-clean
sanity check, not a behavior-change confirmation. Tracked in
`docs/signals/ops-rebuild-verify-news-fetch-20260709T2227Z.json` (non-blocking, P2).
