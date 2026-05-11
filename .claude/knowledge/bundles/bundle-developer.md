# Bundle: Developer

One call, all always-needed rules. Load this instead of dev-standards.md + fail-loud-protocol.md + restart-policy.md separately.

---

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

---

## Key Coding Standards

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

---

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

---

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

---

## Branch Hygiene (steps 1–5)

After merge to main, verify:
1. `git branch --show-current` = `main`
2. `git status --short` = empty
3. Delete task branch: `git branch -d task/NNN-*` + `git push origin --delete task/NNN-*`
4. Remove worktrees: `git worktree remove --force .claude/worktrees/<name>`
4a. If changed files include `vps-scripts/**` or `deploy-vinahost.sh`, run
    `./scripts/maybe-deploy-vps.sh` before deleting the task branch.
5. Drop stashes from merged branch

Full reference → `.claude/WORKFLOW.md#branch-hygiene-checklist`

---

## Restart Command

```bash
cd $PROJECT_ROOT && docker-compose down && docker-compose up -d && sleep 5
```

No other restart mechanism is allowed. All 9 microservices restart in deterministic lockstep.

---

## KNOWLEDGE LOAD FAILURE PROTOCOL

If any Read of `.claude/knowledge/*.md` fails (file missing, empty, <50 chars, or permission denied):
1. IMMEDIATELY `send_telegram(channel="work", message="[developer] Knowledge load failed: <filename> — <error detail>")`
2. `submit_feedback(severity="critical", title="Knowledge load failed: <filename>", agent="developer")`
3. STOP current cycle, return early
4. DO NOT fallback, guess, or continue with partial knowledge
5. DO NOT retry more than once

---

## Lazy-Load (read ONLY when task touches that area)

- Portfolio rules (stop-loss, TP ladder) → `.claude/knowledge/portfolio-schema.md`
- Alert firing rules → `.claude/knowledge/alert-policy.md`
- Hexagram integration → `.claude/knowledge/kinh-dich-layer.md`
- MCP tool surface (when adding/modifying tools) → `.claude/knowledge/mcp-tools.md`
- Cron schedule (when touching schedulers) → `.claude/knowledge/cron-jobs.md`
- Vietnamese financial terms → `docs/GLOSSARY_VI.md`
