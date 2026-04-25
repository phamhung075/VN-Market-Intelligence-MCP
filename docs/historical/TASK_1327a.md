# TASK 1327a — Fix Bootstrap Test: RED → GREEN

**Sprint:** 1327
**Task ID:** 1327-fix-bootstrap
**Owner:** Developer
**DDD Layer:** test (interface-adjacent — reads agent config files)
**Estimated:** 30 min
**Branch:** `task/1327a-fix-bootstrap-test`
**Depends on:** none (runs in parallel with 1327b)
**Blocks:** 1327c (merge gate)

---

## Problem

`apps/mcp-server/src/__tests__/230-bootstrap-verify.test.ts:268` (AC-4c) fails with `ENOENT`.

The test reads 7 Cowork agent `.md` files and asserts each contains `## Step 0-b: Handle Bootstrap Errors`. Those 7 files were intentionally deleted in Sprint 1326 (cowork-analysis-vnmarket-team/ cleanup). **Option A approved**: update the test to match reality.

**Root cause — two bugs in the test:**

1. Wrong `projectRoot` — `path.resolve(__dirname, "../..")` resolves to `apps/mcp-server/`, not the monorepo root. `.claude/agents/` lives at the monorepo root, so every path lookup fails.
2. Stale `agentFiles` array — references 7 deleted files; must be updated to the surviving agent files that actually contain the required section.

---

## Exact File to Modify

`apps/mcp-server/src/__tests__/230-bootstrap-verify.test.ts`

**Lines 272–283** — replace both the `projectRoot` definition and the `agentFiles` array.

---

## Step-by-Step Fix

### Step 1 — Verify current agent files at monorepo root

```bash
ls /path/to/repo/.claude/agents/*.md
grep -l "## Step 0-b: Handle Bootstrap Errors" .claude/agents/*.md
```

At the time this handoff was written, **no** agent file in `.claude/agents/` contains the `## Step 0-b: Handle Bootstrap Errors` section. The section must be added to at least one file that the test will verify, **or** the test assertion must be scoped only to agent files that already have the section.

Canonical surviving agents as of Sprint 1326:
```
.claude/agents/architect.md
.claude/agents/ba.md
.claude/agents/developer.md
.claude/agents/fixer.md
.claude/agents/ops.md
.claude/agents/pm.md
.claude/agents/po.md
.claude/agents/qa.md
.claude/agents/cowork-refactory-expert.md
```

### Step 2 — Add the required section to the target agents

Pick the agents most likely to call bootstrap (agents that do active market analysis cycles). Recommended minimum set: `developer.md`, `ops.md`, `qa.md`.

Append this block to each target file (end of file, before any trailing newline):

```markdown
## Step 0-b: Handle Bootstrap Errors

If `get_memory_files` or `search_memory_by_trigger` returns an error or empty result:
1. Send `send_telegram(channel="work", message="[AGENT_NAME] bootstrap failed: <error>")`.
2. Call `submit_feedback` with error details.
3. STOP. Do NOT proceed with the task cycle. Do NOT fallback or guess.
```

### Step 3 — Update the test

In `apps/mcp-server/src/__tests__/230-bootstrap-verify.test.ts`, replace lines 272–293:

**Old code (lines 272–293):**
```typescript
    const agentFiles = [
      ".claude/agents/01-news-scout.md",
      ".claude/agents/02-financial-analyst.md",
      ".claude/agents/04-market-watcher.md",
      ".claude/agents/05-alert-commander.md",
      ".claude/agents/06-digest-predict.md",
      ".claude/agents/07-qa-responder.md",
      ".claude/agents/unified-agent.md",
    ];

    const projectRoot = path.resolve(__dirname, "../..");
    const requiredSection = "## Step 0-b: Handle Bootstrap Errors";

    for (const agentFile of agentFiles) {
      const filePath = path.join(projectRoot, agentFile);
      const content = fs.readFileSync(filePath, "utf-8");

      expect(content, `Agent file ${agentFile} missing "${requiredSection}" section`).toContain(
        requiredSection
      );
    }
```

**New code:**
```typescript
    // Option A: test references surviving agent files (Sprint 1326 deleted cowork-analysis-vnmarket-team/)
    const agentFiles = [
      ".claude/agents/developer.md",
      ".claude/agents/ops.md",
      ".claude/agents/qa.md",
    ];

    // __dirname = apps/mcp-server/src/__tests__ → go up 4 levels to reach monorepo root
    const projectRoot = path.resolve(__dirname, "../../../..");
    const requiredSection = "## Step 0-b: Handle Bootstrap Errors";

    for (const agentFile of agentFiles) {
      const filePath = path.join(projectRoot, agentFile);
      const content = fs.readFileSync(filePath, "utf-8");

      expect(content, `Agent file ${agentFile} missing "${requiredSection}" section`).toContain(
        requiredSection
      );
    }
```

---

## Acceptance Criteria

- [ ] `bun test apps/mcp-server/src/__tests__/230-bootstrap-verify.test.ts` exits with 0 failures
- [ ] AC-4c test is GREEN (both assertions: file exists + section present)
- [ ] No other tests in 230-bootstrap-verify.test.ts regressed
- [ ] `bun tsc --noEmit` from `apps/mcp-server/` exits 0

---

## Verification Command

```bash
cd apps/mcp-server && bun test src/__tests__/230-bootstrap-verify.test.ts 2>&1 | grep -E "(pass|fail|AC-4c)"
```

Expected: `AC-4c` in pass output, `(fail)` count = 0 for this file.

---

## Risk Notes

- Do not change the `describe` block name or test name — they are referenced in the merge gate doc.
- Adding the section to agent files is a content-only change; no functional logic affected.
- The `projectRoot` depth fix (`../../../..`) is required regardless of which agent files are chosen — the old `../..` has always been wrong for `.claude/` lookups on the monorepo branch.
