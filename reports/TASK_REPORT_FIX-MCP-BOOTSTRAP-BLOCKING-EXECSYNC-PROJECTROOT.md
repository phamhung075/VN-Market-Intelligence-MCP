## Task Report FIX-MCP-BOOTSTRAP-BLOCKING-EXECSYNC-PROJECTROOT

**Sprint:** FLOW-PRICE-ALPHA-LOOP · **Commits:** `252f8ffd1` (fix) + `ea3236f43` (DJ-GATE-1 journal) — already on `main` (no-branch convention)
**Reviewed:** 2026-07-13T07:20Z by qa · **Coordination session:** 69b0312e-df43-43a9-9e0b-bddf66d374e3

changed:
- `apps/mcp-server/src/infrastructure/projectRoot.ts` — `getProjectRoot()` no longer shells out to `execSync("git rev-parse --show-toplevel")`; replaced with a memoized synchronous fs walk-up from `import.meta.dir` looking for a repo-root marker (`pnpm-workspace.yaml` or `.git`), `process.cwd()` fallback preserved. `child_process` import removed entirely.
- `apps/mcp-server/src/__tests__/FIX-MCP-BOOTSTRAP-BLOCKING-EXECSYNC-PROJECTROOT.test.ts` (NEW, 3 cases: no execSync/child_process in source, resolves to true monorepo root, memoized/no per-call blocking work)

### RAW test results (re-run by qa, not trusted from dev's reported 123/0)
```
bun test <12 targeted files incl. new FIX-MCP-BOOTSTRAP-* test>   → 123 pass / 0 fail (543 expect calls)
bun tsc --noEmit (apps/mcp-server)                                → 0 errors, exit 0
```
Files: `FIX-MCP-BOOTSTRAP-BLOCKING-EXECSYNC-PROJECTROOT.test.ts`, `1955a-daily-dashboard-project-root.test.ts`, `lint/no-local-project-root.test.ts`, `1300a-agent-memory-tools.test.ts`, `1300b-agent-memory-update-tools.test.ts`, `1854a-daily-dashboard-job.test.ts`, `FACTORY-SCHEDULER-job-table-registry.test.ts`, `emit-pressure-state.test.ts`, `1189-pipeline-health.test.ts`, `230-bootstrap-verify.test.ts`, `1299b-skill-gated-bootstrap.test.ts`, `tool-registry-parity.test.ts`. Own raw count matches dev's claim exactly.

### DDD / security / mock-guard
- `grep -n "from.*application\|from.*interface" projectRoot.ts <new test>` → zero matches, golden rule intact (infrastructure/ imports nothing from application/interface).
- Security: no `process.env`, no hardcoded secrets in either changed file.
- `bash scripts/audits/mock-guard.sh --files "apps/mcp-server/src/infrastructure/projectRoot.ts apps/mcp-server/src/__tests__/FIX-MCP-BOOTSTRAP-BLOCKING-EXECSYNC-PROJECTROOT.test.ts"` → PASS, exit 0.
- `grep -n "child_process\|execSync" projectRoot.ts` → only doc-comment prose explaining the historical bug remains; no live `import ... from "child_process"` or `execSync(` call syntax (the new test's own AC-1 regex asserts exactly this distinction).

### Behavioral correctness of the new resolver (checklist item 3)
**Normal checkout:** `import.meta.dir` = `apps/mcp-server/src/infrastructure`. Confirmed `apps/mcp-server/` and `apps/` themselves carry **no** `.git`/`pnpm-workspace.yaml` (`ls -la` both dirs) — only the true monorepo root does. Walk-up therefore resolves 4 levels up = repo root, matching the new test's own independently-computed `path.resolve(import.meta.dir, "../../../..")` expectation (AC-2) and identical to what `git rev-parse --show-toplevel` returned pre-fix.

**Container/deployed fallback (the whole point of the fix — checked, not assumed):** Read `apps/mcp-server/Dockerfile` — build stage only `COPY`s `src/`, `tsconfig.json`, `bctc-schema.ts`, `mcp.config.json` into `WORKDIR /app`; no `.git` or `pnpm-workspace.yaml` ever lands in the image. Walk-up from `/app/src/infrastructure` up to filesystem root finds no marker anywhere → falls through to `process.cwd()`. `CMD ["bun","run","src/index.ts"]` runs from `WORKDIR /app`, so `process.cwd()`="/app" — and `docker-compose.yml`'s volume mounts for this service are all `/app/docs/...`, `/app/reports`, `/app/data`, i.e. exactly rooted at `/app`. **Parity confirmed with the OLD code's own fallback**: the container image has no `git` binary installed either (Dockerfile installs python3/tesseract/poppler, not git) — so the pre-fix `execSync("git rev-parse ...")` would itself throw in this exact container, hit the pre-existing `catch { _root = process.cwd() }`, landing on the identical `/app`. No wrong-root regression risk found; fallback is sound.

### Bootstrap hot-path premise verified (not just claimed)
Read `agentBootstrap.ts:311-358`: `buildToolNameMap()` is invoked at top-level module load (`const toolNameMap = buildToolNameMap();`, line 358) and synchronously calls `registryFn(probeFakeServer)` for every tool registry fn, catching sync throws. `registerAgentMemoryTools` (`agentMemoryTools.ts:184-185`) has `getProjectRoot()` as the literal first statement of its body, executed before any `await` — confirming this genuinely sat on the bootstrap hot path pre-fix, exactly as the commit message and DJ entry claim.

### Tool-count integrity (checklist item 4)
`bun scripts/gen-project-stats.ts --dry-run` → `toolCount=183`. `git status --porcelain docs/data/project-stats.json` clean (dry-run did not write); committed baseline already reads `toolCount: 183`. No tools silenced by this registration-path change.

### DJ-GATE-1 (checklist item 6)
`docs/agent-memory/decisions/sprint-FLOW-PRICE-ALPHA-LOOP-dev-mcp-server.md` STEP `dev-mcp-server-S9` present, `**task-id:** FIX-MCP-BOOTSTRAP-BLOCKING-EXECSYNC-PROJECTROOT` literal match, substantive what-done/what-considered/why-decision/why-change — not a stub.

### Full-suite disposition (checklist item 7)
Ran the full suite myself: **14569 pass / 40 skip / 64 fail / 5 errors** across 1201 files (552.39s), then the known Bun 1.3.13 post-summary tail-crash (`panic(main thread): A C++ exception occurred`, exit 132 — non-authoritative engine bug, not a test failure). 64 fail/5 err is consistent with this sprint's own recent baselines (63-67 fail documented across the last 6+ QA gates this week). `grep -i "projectroot"` across the entire captured log → **0 matches** — none of the 64 fail/5 error lines reference `getProjectRoot`/`projectRoot`.

tests: 123 pass / 0 fail (targeted, 12 files, RAW) | tsc: 0 errors | ddd: PASS | security: PASS | mock-guard: PASS | full-suite: 14569/40/64/5 (pre-existing baseline, zero overlap with this change)

### Verdict: PASS (code) — **DEPLOY-REQUIRED, not serving-verified**

Code is committed to `main` (`252f8ffd1` + `ea3236f43`) and behaviorally green, but this is mcp-server bootstrap code — it only takes effect on a container rebuild. Per dispatch: QA does not deploy; rebuild is user/ops-gated. Row held in **REVIEW** (not flipped to `done`) with `qa_code_passed:true` + `deploy_pending:true` + resolution note `CODE_VERIFIED_DEPLOY_PENDING`, batched with the sibling wave-1 ALPHA rows (`599f4aee0`, `1bbc8cead`) into the same off-market rebuild.

Board write: `docs/data/orch/orch-state.json` via `scripts/orch-apply.sh` (validated + conservation-checked). `.head` left untouched (dispatcher-owned).
