---
task: P2-NF-A + P2-NF-B + P2-NF-C (developer half)
pilot: news-fetch
phase: 2
status: DONE
date: 2026-05-24
owner: developer
---

# Handoff: P2-NF-A + P2-NF-B + P2-NF-C (developer half)

## P2-NF-A — `news-fetch-pre-ci` tag

Tag created at HEAD (`29d0b498`) before G4 fence work.
Command: `git tag news-fetch-pre-ci HEAD`
Verification: `git tag -l news-fetch-pre-ci` → `news-fetch-pre-ci`
NO `--force`, NO push. Frozen anchor.

## P2-NF-B — eslint.config.mjs Fence-A/B/C

**Files landed:**
- `apps/news-fetch/eslint.config.mjs` — three-fence ESLint config (SI-3 §3.2 Option A)
- `apps/news-fetch/package.json` — added lint/lint:fence/lint:ci scripts + devDeps
- `apps/news-fetch/bun.lock` — updated lockfile

**devDependencies added:**
- `eslint` ^10.4.0
- `eslint-plugin-boundaries` ^6.0.2
- `@typescript-eslint/parser` ^8.59.4 (R-2 fallback, SI-3 §6.3)
- `eslint-import-resolver-typescript` ^4.4.4 (needed for .js-suffixed ESM imports)

**Config notes (mirrors kinh-dich P2-KD-C proven fix):**
- Patterns use `src/<layer>/**` (not `src/<layer>/**/*`) — flat-file layer support
- `import/resolver: { typescript: true }` wired for .js → .ts resolution
- v6 object-based `disallow: { to: { type: [...] } }` selectors used
- `files: ["**/*.ts"]` ensures TS files are included

**Commit history for eslint.config.mjs:**
```
203a951a feat(pdf-extractor): P2-B1 (bundled refined config)
893b17ee feat(news-fetch/G4): P2-NF-B — initial eslint.config.mjs
```

**AC-4a evidence:**
```
$ cd apps/news-fetch && bunx eslint src/ --max-warnings 0
Exit code: 0
```
Clean run — no errors, no warnings. Fence is live.

## P2-NF-C (developer half) — Fence-A violation proof

### Before run (violation injected — NEVER staged/committed)

Violation injected into `src/primitive/published-at-parser/index.ts`:
```typescript
// DELIBERATE FENCE-A VIOLATION — DO NOT COMMIT
import { NewsIngest } from "../../module/news_ingest/index.js"; // Fence-A breach: primitive imports module
```

**Violation run output:**
```
/…/apps/news-fetch/src/primitive/published-at-parser/index.ts
  23:28  error  Fence-A: primitive must not import module layer  boundaries/dependencies

✖ 1 problem (1 error, 0 warnings)

Exit code: 1
```

Key checks:
- Exit code: **1** (non-zero confirmed)
- Fence name in output: **YES** — "Fence-A: primitive must not import module layer"
- Violation staged: **NO**
- Violation committed: **NO**

### Revert

```
git checkout -- apps/news-fetch/src/primitive/published-at-parser/index.ts
```

### After run (post-revert clean)

```
$ bunx eslint src/ --max-warnings 0
Exit code: 0
```

Clean — exit 0. `git status` shows no staged changes in `src/`.

**R-FENCE gate: PASS** — violation exits non-zero with "Fence-A" in output; revert → exit 0.

## G12 Gate (sandbox 13/13)

```
$ cd apps/news-fetch && bun run src/sandbox/runner.ts --tier=all --module=news-fetch --scenario=all

[sandbox] Running 13 scenario(s) — tier=all, module=news-fetch

  PASS  article-relevance-filter [edge]
  PASS  article-relevance-filter [failure]
  PASS  article-relevance-filter [golden]
  PASS  source-dedup-key [edge]
  PASS  source-dedup-key [failure]
  PASS  source-dedup-key [golden]
  PASS  published-at-parser [edge]
  PASS  published-at-parser [failure]
  PASS  published-at-parser [golden]
  PASS  headline-normalizer [edge]
  PASS  headline-normalizer [failure]
  PASS  headline-normalizer [golden]
  PASS  news_ingest [multi-primitive]

[sandbox] Result: 13 PASS, 0 FAIL, 0 ERROR
```

G12 GREEN — sandbox baseline intact.

## AC-4c Freeze Anchor Status

`git log --oneline apps/news-fetch/eslint.config.mjs` most-recent = `203a951a`.
Note: `203a951a` (pdf-extractor P2-B1 commit) bundled the refined fence config in a concurrent commit.
The fence config at HEAD is complete and correct — Fence-A/B/C enforced, violation proof confirmed.
QA P2-NF-D task: verify `eslint.config.mjs` log, confirm no subsequent edits beyond G4 freeze.

## NEXT

QA: P2-NF-D — G4 freeze anchor confirm (AC-4c): `git log --oneline apps/news-fetch/eslint.config.mjs` most-recent = P2-NF-B freeze; compile G4 evidence + emit signal.
