# DJ: FACTORY-SHARED-prune-phantom-primitives

**Date**: 2026-07-24
**Agent**: dev-technical-analysis
**Task**: Delete the phantom `packages/primitives/technical-analysis` package

## Deadness Evidence (verified at source, independent of the ticket claim)

### 1. Directory contents (ls-confirmed)

`packages/primitives/technical-analysis/` contained exactly two entries:
- `bun.lock` (1019 bytes) — a bare `bun install` lockfile listing only 3 devDependency
  type-stub packages (`@types/node`, `bun-types`, `typescript`) under workspace name
  `@vn-market/primitives-technical-analysis`.
- `node_modules/` (29M) — the installed devDependencies from that lockfile.

**No `package.json`. No `.ts`/`.go`/`.js` source file of any kind. No test file.**
`packages/primitives/` had no other subdirectory — `technical-analysis` was its only child.

### 2. Zero live importers (grep-confirmed, whole repo)

`grep -rIln "primitives/technical-analysis" . --exclude-dir=node_modules --exclude-dir=.git`
returns only **doc/prose hits** (architecture briefs, PO decisions, handoffs) — zero hits in
any `*.go`, `*.ts`, `go.mod`, `go.sum`, `package.json`, `tsconfig.json`, `docker-compose.yml`,
`Dockerfile`, or `scripts/*.sh`. The live `apps/technical-analysis` Go service has its own
complete implementation (`pkg/domain/`, `pkg/module/`, `pkg/primitive/{rsi,macd,bollinger_bands,
moving_average,detect_cross}/`) — none of it imports `packages/primitives/technical-analysis`;
Go module paths there are all `github.com/vn-market-intelligence/technical-analysis/...`, never
a `packages/` path (Go has no cross-language import mechanism to a bare directory anyway).

### 3. No workspace/manifest wiring (grep + read-confirmed)

- `pnpm-workspace.yaml` globs `packages/*`, but pnpm only recognizes a directory as a workspace
  member if it has a `package.json` — this directory never had one, so it was **never actually
  a pnpm workspace member** despite matching the glob path.
- `pnpm-lock.yaml` (root, 91K) — zero references to `primitives` or `primitives-technical-analysis`.
- No `go.mod` in the repo (7 checked: kinh-dich-service, macro-indicators, news-fetch,
  api-gateway, technical-analysis, alert-engine, stock-price) references `primitives`.
- No `tsconfig.json` path alias, no `docker-compose.yml` service/volume, no `Dockerfile` COPY
  references it anywhere in the repo.

### 4. `.gitignore` reveals the directory was never git-tracked at all

`git ls-files packages/primitives` → empty. `git check-ignore -v packages/primitives/technical-analysis/bun.lock`
→ matched by `.gitignore:33 packages/primitives/` (under the "vendored third-party clone &
local dep install" comment block). So this directory was pure **local filesystem residue** —
not even committed to the repo — left over from a `bun install` run during the TS pilot attempt,
then git-ignored rather than deleted after the TS revert (see item 5).

### 5. Root cause traced (read-confirmed, `docs/handoffs/TASK_pivot-B-revert.md` +
`docs/architecture-briefs/2026-05-22-language-pivot-evaluation.md` + `docs/po-decisions/2026-05-22-language-pivot-technical-analysis.md`)

The TS pilot commit `6248f3da` originally created
`packages/primitives/technical-analysis/calculate-rsi.ts` (+ test + 3 scenario JSONs). The
language-pivot decision (binding PO doc, 2026-05-22) reverted that commit — `calculate-rsi.ts`
and its test were explicitly deleted as part of `TASK_pivot-B-revert.md` step 3 ("RSI primitive
must be GONE"). The scenario JSONs were rescued elsewhere (they now live under
`docs/scenarios/technical-analysis/primitives/`, confirmed present and used by
`apps/technical-analysis/cmd/sandbox`). The Go rewrite that followed put primitives inside the
service itself (`apps/technical-analysis/pkg/primitive/*`), **not** back into
`packages/primitives/technical-analysis/` — the `bun.lock`/`node_modules` residue from the
original `bun install` was simply never cleaned up, and someone later added it to `.gitignore`
instead of deleting it.

### 6. Architecture-brief cross-check (verified, not merely trusted)

`docs/architecture-briefs/2026-06-15-maintainability-factory-audit.md:553-558`
(`FACTORY-SHARED-prune-phantom-primitives` entry) independently states the same deadness claim
("contains only a bun.lock + node_modules — no package.json, no src, referenced nowhere") and
prescribes deleting `packages/primitives` entirely. This was VERIFIED against live source per
items 1-5 above before deleting — not taken on the ticket's word alone. Also cross-checked
`codebase-analysis-docs/sections/shared-and-infra.md:62,219` which independently documents the
same directory as an "Empty placeholder... no source files."

## Decision

DELETE (confirmed dead — never git-tracked, zero importers, zero manifest wiring, root-caused
to abandoned TS-pilot scaffolding):
- `packages/primitives/` directory in its entirety (`technical-analysis/bun.lock` +
  `technical-analysis/node_modules/`, 29M) — untracked, removed via `rm -rf` (not `git rm`,
  since git never tracked it)
- `.gitignore:33` (`packages/primitives/`) — the now-dangling ignore rule for a path that no
  longer exists

## Files Changed

1. `.gitignore` — removed the `packages/primitives/` ignore line (tracked, committed)
2. `packages/primitives/` — directory deleted from disk (was git-untracked; no git diff, no
   commit entry for the deletion itself)

Lines removed: 1 (`.gitignore`). Disk reclaimed: 29M (untracked, not reflected in git diff stat).

## Verification

- `grep -rIln "primitives/technical-analysis" . --exclude-dir=node_modules --exclude-dir=.git`
  post-delete: only historical doc/prose references remain (briefs, handoffs, PO decisions) —
  zero code/manifest references, unchanged from pre-delete (confirms nothing broke because
  nothing live pointed at it).
- `cd apps/technical-analysis && go build ./cmd/...` → exit 0.
- `cd apps/technical-analysis && go vet ./...` → exit 0.
- `cd apps/technical-analysis && go test ./...` → 12/12 packages `ok` (cmd/sandbox, cmd/server,
  pkg/application, pkg/domain, pkg/infrastructure, pkg/interface/http, pkg/module,
  pkg/primitive/{bollinger_bands,detect_cross,macd,moving_average,rsi}), 0 failures.
- G12 DoD gate: `bash dashboard/build.sh` → "Sandbox results: 35 passed / 0 failed" (25
  primitive + 5 module + 5 service, matching the documented baseline exactly). Headless
  render-check: `[verify-render] PASS — 33 dot-green (L1:25 + L2:5 + L3:3), 0 dot-red,
  0 dot-pending, 0 JS errors, all groups PASSED, no NOT RUN text, no 'not wired' text.`
- pnpm workspace: `pnpm-lock.yaml` had zero references before or after (directory was never a
  recognized workspace member — no `package.json` ever existed for pnpm to register); a full
  `pnpm install` was not re-run repo-wide since nothing in the lockfile/manifest chain
  referenced the deleted path (scoped verification, not a blast-radius risk for a 1-line
  `.gitignore` edit + deletion of an untracked directory).
