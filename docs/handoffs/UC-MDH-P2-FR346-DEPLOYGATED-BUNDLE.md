# UC-MDH-P2-FR346-DEPLOYGATED-BUNDLE

**Zone:** `apps/mcp-server/src/interface/mcp/tools/` · **Owner:** `developer` · **Size:** M · **Priority:** P1
**Gate:** `deploy_gate: user-approved-off-market` — **DO NOT START until the user has approved an off-market deploy window.**
**Parent row:** `UC-MDH-P2` (done[], decomposed) — sprint `ULTRACODE-AUDIT-FIXALL`
**Spec source:** `docs/handoffs/UC-MDH-P2-BA-spec.md` FR-3/FR-4/FR-6, NFR-1 + `[Architect] Brownfield Findings` § Design decisions — FR-3/FR-4/FR-6 atomic deploy-gated bundle (full detail — this handoff summarizes, the brief is the source of truth for exact line ranges, re-verify live regardless)
**depends_on:** none (independent file set from every other FR-5/FR-1/FR-2/FR-7 child; gated on the deploy window, not on sibling tasks)
**Open blocker (does not block minting this task, does not block PO answering in parallel):** B1 → `po` — does `deploy_gate: user-approved-off-market` cover the whole `UC-MDH-P2` row or only this bundle? Either answer is compatible with this task's scope: it is deploy-gated regardless.

---

## TLDR
FR-3 (deregister the `append_session_record` MCP tool), FR-4 (regenerate `tool-registry.json` + `project-stats.json` + `tools/list/INDEX.md`, delete the orphaned per-tool stub, hand-edit `system-map.json`), and FR-6 (delete/edit the 1300b test's `append_session_record` coverage) **must land as ONE commit in ONE user-approved off-market deploy window** (NFR-1). Splitting them creates a window where either the docs/registry claim a tool the running server doesn't have, or the running server serves an undocumented/untested tool.

## Why atomic (NFR-1)
- FR-3 without FR-4/FR-6 same commit: registry/docs/tests still reference a tool that no longer exists in code — build break or false docs.
- FR-4 without FR-3 landed first: regenerating the registry against a still-registered tool changes nothing (wrong order).
- FR-6 test-case deletion without FR-3: the suite is untested against a still-live tool, or (if code already changed) red against dead code.

## [PM] Planning Context — sequence (architect design; re-verify every line number live immediately before each edit)
1. **FR-3** `apps/mcp-server/src/interface/mcp/tools/system/agentMemoryUpdateTools.ts`: delete L29-44 (`VALID_AGENTS`), L49-55 (`SessionRecord` interface), L70-77 (`getTodayDateStr()`), L79-109 (`formatSessionRecord()` + JSDoc), L151-166 (`AppendSessionRecordSchema`), L197-296 (Tool-1 registration block incl. header comment). Delete **bottom-to-top** — earlier deletes shift later line numbers. Rewrite module docblock (L1-17) to describe only `update_memory_file`.
   **MUST SURVIVE untouched** (shared with Tool 2 / `update_memory_file`): `hasPathTraversalAttempt()` (L132-134), `sanitizeFileName()` (L139-145), `buildFrontMatter()` (L114-126), `UpdateMemoryFileSchema` (L168-186), Tool-2 registration block (L301-400).
   `registry.ts:218` comment: `// Task 1300b: append_session_record + update_memory_file (+2 tools → 107)` → `// Task 1300b: update_memory_file (+1 tool → 106)`. Do **not** touch the pre-existing L219 "+109" off-by-one — separate janitor debt, out of scope here.
2. **FR-4 (extended — includes 2 files reclassified out of FR-5 by the architect: the per-tool stub + `system-map.json`; both must land in this SAME atomic bundle, not the safe-now doc sweep, since they assert exact tool counts that would be false until FR-3 actually deploys):**
   a. `bun scripts/gen-tool-registry.ts` (after FR-3 lands) — regenerates `docs/data/tool-registry.json`, drops the entry, decrements `totalCount` automatically. No manual JSON edits.
   b. `bun scripts/gen-project-stats.ts` — re-syncs `docs/data/project-stats.json#toolCount` from the freshly regenerated registry (a 4th sync point the BA's "3-way" framing didn't originally name).
   c. `bash scripts/gen-tools-index.sh` — regenerates `docs/agents/tools/list/INDEX.md`; drops the entry for free (it is GENERATED — never hand-edit it).
   d. `git rm docs/agents/tools/list/append_session_record.md` — orphaned per-tool stub; the stub generator (`scripts/gen-tool-list-stubs.py`) is add-only and will never remove it on its own.
   e. `docs/data/system-map.json:29` (line number approximate, re-verify) — manually delete the `"append_session_record",` line from `.project.microservices[0].tools[]` (alphabetically sorted; delete in place, no re-sort needed). This is the **only** genuinely hand-edited step in FR-4.
3. **FR-6** `apps/mcp-server/src/__tests__/1300b-agent-memory-update-tools.test.ts` — **BA's "delete 2 test cases" undercounts; live count is 5-delete + 2-surgical-edit:**
   - DELETE outright: `L74-85` ("accepts valid agent names"), `L87-113` ("rejects invalid agent names via Zod"), `L115-126` ("formats markdown correctly"), `L128-135` ("minimal fields"), `L215-222` ("prevents directory traversal in task_name").
   - SURGICALLY EDIT (do not delete): `L67-72` ("registers 2 tools...") → rename, drop the `append_session_record` assertion, keep `update_memory_file`. `L240-265` (sandbox regression guard) → remove only the `append_session_record` `callTool` block (L246-249) + its "Exercise both tools" comment (L244-245 → singular); **keep** the `update_memory_file` call + both its assertions — deleting this whole test would silently drop its own regression-guard purpose.
   - Drop the `append_session_record` mention from the module docblock (L1-8).
   - Net: 14 `it()` blocks → 9. Zero coverage loss on `update_memory_file`'s own surface.
4. **Pre-commit gate (mechanized backstop, run BEFORE the single commit):** `tool-registry-parity.test.ts` + full `tsc` + the 1300b suite, all green.

## Acceptance Criteria
- [ ] All of steps 1-4 above land in exactly ONE commit
- [ ] `hasPathTraversalAttempt()`, `sanitizeFileName()`, `buildFrontMatter()`, `UpdateMemoryFileSchema`, and the Tool-2 block are byte-identical (or only incidentally reformatted) after the edit — `update_memory_file` must keep working
- [ ] `tool-registry-parity.test.ts` + full `tsc` + 1300b suite all pass before the commit lands
- [ ] Post-deploy smoke check (after the off-market rebuild, not this task's own scope but flag for QA): a live tool listing shows `append_session_record` gone and `update_memory_file` still callable

## Explicitly out of scope
- The pre-existing `registry.ts:219` "+109" comment off-by-one (unrelated janitor debt)
- Fixing `mcp-tools.md`'s already-broken "Renamed/Removed Tools → tool-registry.json → removed" pointer (the `removed` key doesn't exist in the generated schema; pre-existing, unrelated to this row)
- Any of the safe-now FR-1/FR-2/FR-5/FR-7 work — those are separate sibling tasks, not gated on this bundle and not blocking it

## Files
- **Modify:** `apps/mcp-server/src/interface/mcp/tools/system/agentMemoryUpdateTools.ts`, `apps/mcp-server/src/interface/mcp/tools/registry.ts`, `apps/mcp-server/src/__tests__/1300b-agent-memory-update-tools.test.ts`, `docs/data/system-map.json`
- **Regenerate (run generators, do not hand-edit):** `docs/data/tool-registry.json`, `docs/data/project-stats.json`, `docs/agents/tools/list/INDEX.md`
- **Delete:** `docs/agents/tools/list/append_session_record.md`

## Standards
`docs/policies/dev-standards.md` · `docs/protocols/fail-loud-protocol.md` · commits: `docs/policies/commit-convention.md` (`Task: UC-MDH-P2-FR346-DEPLOYGATED-BUNDLE` + `AC:` trailer). Rebuild/deploy per `docs/protocols/docker-deployment-runbook.md` — single-service rebuild only, never `down && up` (peer-container safety).
