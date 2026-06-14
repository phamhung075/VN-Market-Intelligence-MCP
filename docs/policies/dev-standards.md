# Developer Standards

<!-- size-justification: 140L — unified developer reference: code search tools, test patterns, DDD rules, TypeScript conventions, naming. All read together at sprint start to set context; splitting into tool-guide + test-patterns + naming-rules fragments the unified "how we code" standard. SCRIPT-PERSIST 2026-06-07: Script Persistence section incl. maintenance clause (+15L, user directive). -->

## Script Persistence — scripts/, never /tmp

Any script useful for the work or reusable later MUST be saved to `scripts/` — NEVER left in `/tmp` (user directive 2026-06-07; precedent: `scripts/agents-flow/drain-signals.js`).

| Script kind | Location |
|---|---|
| Agent-flow helper (drain, match-slots, cadence…) | `scripts/agents-flow/` |
| Audit / one-shot verification worth replaying | `scripts/audits/` |
| Migration | `scripts/migrations/` |
| CI per-file isolation runner (deterministic, order-independent gate) | `scripts/ci-per-file-isolation.sh [P]` — owning brief: `docs/architecture-briefs/2026-06-09-testing-ci-architecture-rethink.md § P2-4` |
| Anything else reusable | `scripts/` |

After saving: **update the owning flow/skill doc with a canonical pointer** (`node scripts/...` usage line) so future agents discover it instead of rewriting it. Pattern: `docs/agents/dev-team/flow/drain-signals.md` §0a-1 "CANONICAL SCRIPT".

**CANONICAL: OHLCV unit contamination repair (CONTAM-6)**
```bash
# Dry-run (count + sample, no writes):
bun run scripts/migrations/repair-ohlcv-unit-contamination.ts --dry-run

# Live against named volume (docker exec):
docker cp scripts/migrations/repair-ohlcv-unit-contamination.ts \
  vn-market-intelligence-mcp-mcp-server-1:/app/repair-ohlcv-migration.ts
docker exec -it vn-market-intelligence-mcp-mcp-server-1 \
  bun run /app/repair-ohlcv-migration.ts --live
```
Detects WHERE (open < 100 OR low < 100) AND close >= 1000 AND open > 0 AND low > 0.
Excludes all-zero rows (2026-05-30T11:47Z bulk-zeros defect — out of scope).
Repair: open*1000, low*1000. data_env preserved (RF-5).

**CANONICAL: OHLCV low-zero / partial-zero repair (CONTAM-9)**
```bash
# Dry-run (count + sample, no writes):
bun run scripts/migrations/repair-ohlcv-unit-contamination-low-zero.ts --dry-run

# Live against named volume (docker exec):
docker cp scripts/migrations/repair-ohlcv-unit-contamination-low-zero.ts \
  vn-market-intelligence-mcp-mcp-server-1:/app/repair-ohlcv-low-zero.ts
docker exec -it vn-market-intelligence-mcp-mcp-server-1 \
  bun run /app/repair-ohlcv-low-zero.ts --live
```
Three-pass repair: A=mixed-unit open (open<100 AND open>0 AND low=0): open*1000 + low estimate;
B=partial-zero open (open=0, not all-zero): open=close; C=remaining low=0 (close>=1000): low=ROUND(close*0.99).
Excludes all-zero rows (separate defect). data_env preserved (RF-5).

`/tmp` is allowed ONLY for throwaway run-scoped DATA (payload json, stderr capture, session-id cache) — never for executable logic.

**Maintenance (user directive 2026-06-07):** agents MAY update/upgrade an existing `scripts/` script to work better or optimize (fix bugs, harden, speed up, extend) — improving the shared script beats writing a parallel one-off. Rules: (1) if the script implements a flow spec, edit the spec first, then the script — they MUST stay in sync; (2) smoke-test after the change (clean no-op run at minimum); (3) keep the usage contract (CLI args/env/stdout) backward-compatible or update every caller + flow pointer in the same commit; (4) commit under commit-mutex.

## Code Search — Preferred Tools

| Task | Tool |
|------|------|
| Find how a function/class/API works | `mcp__semble__search` |
| Locate callers, usages, implementations | `mcp__semble__search` |
| Discover related code patterns | `mcp__semble__find_related` |
| Exhaustive literal / regex match | `Grep` |
| Read a specific known file | `Read` |
| Find files by name pattern | `Glob` |

Agents call `mcp__semble__search` and `mcp__semble__find_related` directly — no CLI command, no sub-agent spawn. Full decision table (when Semble vs Grep/Glob/Read) → `.claude/skills/semble-search/SKILL.md`.

---

## DDD Layer Rules

| Building | Layer | Folder |
|----------|-------|--------|
| Business rule / pure calculation | **domain** | `apps/mcp-server/src/domain/services/` |
| Data model / entity | **domain** | `apps/mcp-server/src/domain/models/` |
| Repository interface (port) | **domain** | `apps/mcp-server/src/domain/repositories/` |
| SQLite or LanceDB access | **infrastructure** | `apps/mcp-server/src/infrastructure/db/` or `rag/` |
| HTTP scraper / fetcher | **infrastructure** | `apps/mcp-server/src/infrastructure/fetchers/` |
| Orchestrating multiple services | **application** | `apps/mcp-server/src/application/usecases/` |
| MCP tool handler | **interface** | `apps/mcp-server/src/interface/mcp/tools/` |
| Cron job | **interface** | `apps/mcp-server/src/interface/scheduler/` |

**Golden rule**: `domain/` has ZERO imports from `infrastructure/`.

## Coding Standards

```typescript
// Runtime config: always Bun.env, never process.env
const port = Bun.env.PORT ?? "3000";

// Import paths: always .js extension (ESM compatibility)
import { embed } from "../infrastructure/rag/embeddings.js";

// No any — use unknown + type narrowing

// MCP tools: ALWAYS return this exact format
return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };

// All financial numbers: million VND (document in JSDoc)

// Fetchers: ALWAYS use browser User-Agent (Vietnamese sites block bots with 503)
// Fetchers: multi-tier fallback pattern (see hose.ts as reference)
// Fetchers: VnDirect stock_prices works for ALL exchanges (HOSE, HNX, UPCOM)

// Sector context: use sectorPeers.ts for 16 sectors including 'automotive'

// Telegram alerts: plain text, Vietnamese format, no Markdown
```

## Test File Template

```typescript
// apps/mcp-server/src/__tests__/NNN-task-name.test.ts
// Note: DB_PATH is set to :memory: by apps/mcp-server/src/__tests__/setup.ts preload (Bun.env)
import { describe, it, expect } from "bun:test";

describe("Task NNN — Title", () => {
  it("does the expected thing", () => {
    // ...
    expect(result).toBe(expected);
  });

  it("handles edge case", () => {
    // empty input, Vietnamese negatives, missing fields
  });
});
```

## Parallel Agent Dispatch

| Scenario | Dispatch | `isolation` param |
|----------|----------|-------------------|
| Tasks with disjoint file scopes | parallel | `isolation: "worktree"` REQUIRED |
| Tasks touching shared SSOT files | sequential | omit `isolation` |
| Sequential (default / anti-c37) | sequential | omit `isolation` |

**Shared SSOT files that hard-trigger sequential dispatch:** `docs/data/orch/orch-state.json`, `docs/data/project-stats.json`, any agent `.md` file.

Sequential dispatch remains the DEFAULT until c44 verification passes (see Phase 3 roadmap).

Source: `docs/architecture-briefs/2026-05-12-sprint-parallel-isolation.md`

---

## Branch Hygiene (after QA merge)

After merge to main, verify:
1. `git branch --show-current` = `main`
2. `git status --short` = empty
3. Delete task branch: `git branch -d task/NNN-*` + `git push origin --delete task/NNN-*`
4. Remove worktrees: `git worktree remove --force .claude/worktrees/<name>`
4a. If changed files include `vps-scripts/**` or `deploy-vinahost.sh`, run
    `./scripts/maybe-deploy-vps.sh` before deleting the task branch.
5. Drop stashes from merged branch

Full reference → `.claude/WORKFLOW.md#branch-hygiene-checklist`

## Commit Format

Full spec → `docs/policies/commit-convention.md` (type vocabulary, scope, task-id, trailers, worked example, no-sprint rule).

Shell mechanism — always use the heredoc pattern:

```bash
git commit -m "$(cat <<'EOF'
<type>(<sprint>/<area>): <task-id> <one-line title>

<optional body>

Sprint: <sprint>
Task: <task-id>
AC: <terse criterion 1> / <terse criterion 2>
EOF
)"
```
