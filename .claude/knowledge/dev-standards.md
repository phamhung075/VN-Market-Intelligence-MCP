# Developer Standards

## DDD Layer Rules

| Building | Layer | Folder |
|----------|-------|--------|
| Business rule / pure calculation | **domain** | `src/domain/services/` |
| Data model / entity | **domain** | `src/domain/models/` |
| Repository interface (port) | **domain** | `src/domain/repositories/` |
| SQLite or LanceDB access | **infrastructure** | `src/infrastructure/db/` or `rag/` |
| HTTP scraper / fetcher | **infrastructure** | `src/infrastructure/fetchers/` |
| Orchestrating multiple services | **application** | `src/application/usecases/` |
| MCP tool handler | **interface** | `src/interface/mcp/tools/` |
| Cron job | **interface** | `src/interface/scheduler/` |

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
// src/__tests__/NNN-task-name.test.ts
// Note: DB_PATH is set to :memory: by src/__tests__/setup.ts preload (Bun.env)
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

```bash
git commit -m "$(cat <<'EOF'
task(NNN): imperative description

- what changed
- assumptions made

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```
