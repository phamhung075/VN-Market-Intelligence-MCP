# BA Spec — UC-MDH-P2

**Remove the dead append-session-record skill AND its MCP tool, with full consumer sweep + TE-T05 de-confliction**

## Source

- Board row: `.task_board.in_progress[]` id `UC-MDH-P2` — sprint `ULTRACODE-AUDIT-FIXALL`, type `SPRINT-S` (dispatched to BA anyway, per Design-Router promotion_note 2026-08-23T10:53Z — non-dev next_agent class, distinct from SLS quarantine), P1, zone `multi`, `deploy_gate: user-approved-off-market`.
- Origin brief: `docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md#memory-docs-hygiene-P2` (RESCOPE verdict; verifier note at line 1306; rescope text at line 1308).
- Dispatched with an explicit FALSE-PREMISE correction instruction: verify the "9+ live consumers" claim at source, not from the note.

## Live-consumer count — verified at source, not trusted from the note

Method: `grep -rln "append_session_record" --include="*.md" --include="*.ts" --include="*.json" .` (repo-wide, node_modules excluded), then each hit individually re-opened with `grep -n` to classify instruction-vs-historical.

**Real count: 13 live files instruct/list the tool as callable** (not 9 — the note undercounts by 4). The note's own 9, re-verified with current line numbers (2 had drifted):

| # | File | Note's cited line | Live line |
|---|---|---|---|
| 1 | `docs/agent-memory/AGENT_STARTUP.md` | 12-15 | 12,15 (unchanged) |
| 2 | `docs/agent-memory/INDEX.md` | 15 | 15 (unchanged) |
| 3 | `docs/agent-memory/README.md` | 19 | 19 (unchanged) |
| 4 | `docs/agents/digest-predict/init.md` | 53 | 53 (unchanged) |
| 5 | `docs/agents/tools/package/digest-predict.md` | 95 | **102** (drifted) |
| 6 | `docs/agents/market-analyst/init.md` | 121 | **125** (drifted) |
| 7 | `docs/architecture/microservice/mcp-server/briefings.md` | 24, 56 | 24, 56 (unchanged) |
| 8 | `docs/agents/tools/list/append_session_record.md` | (whole file) | (whole file) |
| 9 | `docs/agents/tools/list/INDEX.md` | 187 | **221** (drifted) |

4 more, found by re-grepping rather than trusting the note's list closed:

| # | File | Line | Why it counts |
|---|---|---|---|
| 10 | `docs/standards/mcp-tools.md` | 103 | Lists `append_session_record` as one of digest-predict's granted tools in the cross-agent capability table; referenced by 15+ live agent `init.md`/`tools/package` files as the tool-surface reference. |
| 11 | `docs/protocols/smart-compact-protocol.md` | 31 | "Call `log_agent_work` or `append_session_record` to offload current state to MCP" — live protocol doc, referenced from `docs/agents/dev-team/flow/post-cycle.md` (a live flow file). |
| 12 | `docs/protocols/smart-compact-protocol-offload.md` | 16, 18, 25 | Table prescribing `append_session_record` for architect/other step-offload patterns. |
| 13 | `docs/data/system-map.json` | 29 | Structural SSOT; own header (`_tools_ssot`, line 6) states its `tools[]` array must stay in sync with `tool-registry.json#totalCount` — this IS the "3-way count sync" the note's item (c) refers to (registry.ts source → tool-registry.json generated → system-map.json mirror). |

Excluded from the consumer count (correctly, per rescope's own item split): `apps/mcp-server/src/interface/mcp/tools/registry.ts` and `.../agentMemoryUpdateTools.ts` (the tool's own source/registration — item (c) target, not a "consumer"), `apps/mcp-server/src/__tests__/1300b-agent-memory-update-tools.test.ts` (item (e) target), `docs/agent-memory/sessions/archive/*.md` (9 files — these are *output artifacts of past calls*, not instructions; item (f) target), `docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md` (the audit itself, self-referential), `docs/handoffs/TASK_1344-arch.md` (closed historical design note about a past fix, not an active instruction).

**Material nuance the note did not have**: the live `flow/*.md` files for both cron-armed digest-predict and manually-invoked market-analyst do **not** call `append_session_record` — both already use `end-0-cowork`/`notebook-write` (the TE-T05 successor pattern; confirmed via `grep -n "append_session_record\|notebook-write\|end-0-cowork" docs/agents/digest-predict/flow/*.md` and the market-analyst equivalent — zero flow-level hits). The stale references are confined to `init.md` (identity/bootstrap doc) and the `tools/package` grant doc, not the executable step sequence. So the audit's I6 framing ("digest-predict will call a dead tool every cycle") is itself now stale — the *cron cadence* is not at risk, but the *identity doc contradicting the flow* is a real anti-hallucination hazard: **live evidence it already fired** — `docs/agent-memory/sessions/archive/2026-08-07-developer.md` (md5 `87f5592c...`, not one of the 3 known test-pollution classes) is a genuine, non-test session record dated 16 days ago, i.e. something followed `AGENT_STARTUP.md`'s literal "Call `append_session_record`" instruction as recently as 2026-08-07, not just in the May/June historical window the brief evidenced.

## TE-T05 de-confliction — status: MOOT, no action possible or needed

- TE-T05 landed and closed `DONE_VERIFIED` 2026-08-08 (commits `5bae0a65d` build, `6d0f66bd4` QA closure) — well before this row was dispatched to BA.
- TE-T05's own execution **already excluded append-session-record from its scope** at build time: commit `5bae0a65d`'s message states "only the already-DEPRECATED append-session-record redirect, left untouched, out of scope per FR-7/UC-MDH-P2" — independently confirmed in `docs/handoffs/TE-T05-BA-spec.md:58` (FR-7, its own non-goal) and QA's closure `status_note` (both re-verified live, not trusted from prose).
- The row itself no longer exists anywhere on the live board: `jq '.. | objects | select(.id? == "TE-T05")' docs/data/orch/orch-state.json` and a full per-lane scan of every `task_board` key both return zero matches — it has been evicted from the live file (done_verified rows get archived/pruned over time) since its 2026-08-08 closure.
- Conclusion: there is no live `note` field anywhere carrying the stale "delete append-session-record" clause to drop via `orch-apply.sh`. The de-confliction the rescope asked for (item 0) already happened, by outcome, 15 days before this dispatch. **No orch-apply action is needed or targetable.**

## Already-landed prep work — found during verification, not previously credited to this row

1. **1300b test sandbox fix is DONE.** The I6 rescope's CHANGE-1/CHANGE-2 (registration-time `AGENT_MEMORY_ROOT` env override + test `beforeEach`/`afterEach` sandboxing) landed 2026-07-16, commit `11c35c0a8` — confirmed live: `agentMemoryUpdateTools.ts:195` reads `process.env.AGENT_MEMORY_ROOT ?? resolve(getProjectRoot(), "docs/agent-memory")` with the exact "registration-time, not module-level" rationale from the brief in its own comment; the test file's `beforeEach`/`afterEach` (lines 47-64) mkdtemp/rmSync the sandbox correctly. **Residual scope of item (e) is only: delete the 2 `append_session_record` test cases** — and that is deploy-coupled (cannot delete test cases exercising a tool that is still registered without leaving the suite red), so it folds into the deploy-gated step below, not into any doc-only prep.
2. **`docs/guides/guide-skills-registration.md` §15 catalog carries a second stale row** not in the original `*Files*` list: `session-log-cowork` (line 15) — also deleted by TE-T05, also still listed as live. The rescope's own instruction ("add cowork-end-cycle in its place") is itself now wrong: `cowork-end-cycle` was deleted by TE-T05 too, superseded by `end-0-cowork`. **Corrected instruction: delete both stale rows (append-session-record line 16, session-log-cowork line 15), add ONE `end-0-cowork` row in their place** — not two separate insertions.

## Functional Requirements

- **FR-1** — Delete `.claude/skills/append-session-record/` entirely. DDD layer: **infrastructure**. Gate: safe now, but only after FR-5 (consumer sweep) lands and is re-verified zero-remaining — sequencing dependency, not deploy-gated.
- **FR-2** — `docs/guides/guide-skills-registration.md` §15: delete lines 15 and 16 (session-log-cowork + append-session-record rows), insert one `end-0-cowork` row (corrected per "Already-landed" §2 above). DDD layer: **infrastructure**. Gate: safe now.
- **FR-3** — `apps/mcp-server/src/interface/mcp/tools/system/agentMemoryUpdateTools.ts`: remove the `append_session_record` registration block (keep `update_memory_file`); `registry.ts:217` comment update (currently "Task 1300b: append_session_record + update_memory_file (+2 tools → 107)" → drop the +2 count and the tool name). DDD layer: **infrastructure**. Gate: **DEPLOY-GATED** — requires container rebuild, explicitly out of scope for this pass per hard constraint 2.
- **FR-4** — Regenerate `docs/data/tool-registry.json` (drop the entry, decrement `totalCount`) and sync `docs/data/system-map.json`'s `.project.microservices[0].tools[]` (drop `append_session_record`, per its own `_tools_ssot` note) — the 3-way count sync. DDD layer: **infrastructure**. Gate: **DEPLOY-GATED**, must land in the same window as FR-3 (regenerating the registry for a tool still live in the running container would desync runtime vs. docs the other direction).
- **FR-5** — Update the 13 live consumer files (full list above) from "call `append_session_record`" to the `notebook-write`/`end-0-cowork` pattern. DDD layer: **interface** (these are the agent-facing instruction surface). Gate: safe now, no rebuild needed — docs are read live from the working tree, not shipped in the container image.
- **FR-6** — 1300b test: delete the 2 `append_session_record` test cases (residual of item (e), the sandbox half is already done — see "Already-landed" §1). DDD layer: **infrastructure**. Gate: **DEPLOY-GATED**, must land atomically with FR-3 in the same commit (deleting the test cases before the code is deregistered, or vice versa, both produce a red-vs-dead-code window on main).
- **FR-7** — Bulk stub cleanup script in `scripts/` for the historical pollution in `docs/agent-memory/sessions/archive/` (relocated there since the brief was written — the brief's 3 md5 classes still resolve: `a003f0ccc95c83dcb9a6f67efcb7f19f`×6 ops, `35d6330b83588017f8b94159a986e202`×6 developer, `35cdf1f822d66788cc0ca17805c44290`×6 qa, 18 files total today, down from the brief's "93 as of 07-13" estimate — some combination of the 2026-07-16 commit `11c35c0a8` cleanup and the archive-relocation already reduced the pile; re-enumerate at execution time, do not trust either number). DDD layer: **infrastructure**. Gate: safe now, independent of the other FRs — pure historical-artifact deletion, no live consumer depends on these files.

## Non-Functional Requirements

- **NFR-1 (atomic deregistration)** — FR-3/FR-4/FR-6 MUST land as one commit, deployed in one user-approved off-market window. Splitting them across separate landings creates a window where either the registry/docs claim a tool the running server doesn't have, or the running server serves a tool the docs/tests no longer reference — both are worse than the current (fully consistent, just stale-instructing) state.
- **NFR-2 (re-verify zero-remaining before deletion)** — Before FR-1 executes, re-run this spec's own grep (`grep -rln "append_session_record" --include="*.md" .`, excluding the 3 categories this spec already ruled out) and confirm 0 remaining instructive hits. Do not trust this spec's 13-file count as still-accurate by the time FR-1 actually runs — board churn between now and execution is real (2 of the note's own 9 line citations had already drifted in 6 weeks).
- **NFR-3 (doc-only vs deploy-gated split is load-bearing)** — FR-1/FR-2/FR-5/FR-7 require no container rebuild (docs/skills are read from the working tree live) and are NOT covered by this row's `deploy_gate: user-approved-off-market`. FR-3/FR-4/FR-6 require a rebuild and ARE covered by it. Conflating the two either strands safe doc work behind an unrelated deploy wait, or — worse — someone reads "deploy_gate" and skips FR-3/FR-4/FR-6 forever because no deploy window ever gets explicitly scheduled for this specific row. See Blocker B1.

## Edge Cases

- **Doc-sweep / tool-deregistration ordering window**: between FR-5 landing (docs corrected) and FR-3 landing (tool actually removed, deploy-gated, could be days/weeks later), the tool remains registered and functional — no breakage, purely an availability-vs-instruction gap in the safe direction (docs stop telling agents to call it; the tool would still work if something did).
- **1300b test-suite red window**: FR-6's 2 test cases exercise a live registered tool until FR-3 lands. Deleting the test cases first (docs-phase) would leave the tool live but untested — not fatal, but violates "fix root cause not symptom." Confirmed via NFR-1 this is intentionally sequenced together, not split.
- **Skill-directory deletion racing a stale cached read**: an agent whose context was bootstrapped before FR-1 lands could still hold `.claude/skills/append-session-record/SKILL.md`'s content in-context (it's already a 1-line DEPRECATED redirect today, so this is low severity — worst case it re-reads the redirect and goes to `end-0-cowork` correctly anyway).
- **Recently-active pollution vector**: `docs/agent-memory/sessions/archive/2026-08-07-developer.md` (see Live-consumer count § above) proves the stale `AGENT_STARTUP.md` instruction produced a genuine new stub as recently as 16 days before this dispatch — FR-5 is not purely theoretical cleanup, it is closing an actively-firing (if infrequent) footgun.
- Vietnamese-market data edge cases: **N/A** — this row is pure agent-tooling/doc hygiene, no VN financial data path is touched.

## Blockers (PO-only)

- **B1 — Confirm the doc-only/deploy-gated split (NFR-3) is the correct reading of `deploy_gate: user-approved-off-market`.** This BA spec's reading is that FR-1/FR-2/FR-5/FR-7 are NOT gated (no rebuild) and can land on main now; only FR-3/FR-4/FR-6 wait for the off-market window. If PO intends the whole row (all 7 FRs) to wait for one deploy window regardless of rebuild-necessity, say so explicitly — otherwise the safe doc work sits idle for no technical reason.
- **B2 — File-ownership split for FR-5's consumer sweep.** Per standing convention (agent-father owns agent identity/flow files; PO/developer are constitutionally out of that lane), is `docs/agents/digest-predict/init.md`, `docs/agents/market-analyst/init.md`, and `docs/agents/tools/package/digest-predict.md` in agent-father's exclusive lane (making FR-5 a 2-owner task: agent-father for those 3 files, developer for the other 10), or does the `tools/package`/`init.md` boundary not apply here since these are tool-grant listings, not flow logic? This determines whether FR-5 is one task or two.
- **B3 — Who executes FR-3/FR-4/FR-6 when the off-market window opens?** Not urgent now (deploy-gated, not this pass), but flagging so PM doesn't have to re-derive it later: these 3 FRs are pure `apps/mcp-server` + generated-artifact changes, squarely developer's lane, no ambiguity — recorded here only so the eventual deploy-window dispatch has a ready answer.

## DDD Layer Summary

| FR | Layer | Gate |
|---|---|---|
| FR-1 skill dir delete | infrastructure | safe-now (sequenced after FR-5) |
| FR-2 catalog fix | infrastructure | safe-now |
| FR-3 MCP tool deregister | infrastructure | deploy-gated |
| FR-4 registry regen (3-way) | infrastructure | deploy-gated |
| FR-5 consumer sweep (13 files) | interface | safe-now |
| FR-6 1300b test-case delete | infrastructure | deploy-gated (atomic w/ FR-3) |
| FR-7 bulk stub cleanup script | infrastructure | safe-now |

## Disposition

BA performed spec-only work per its own boundary rules (`forbidden_outputs`: never modify agent files, flow files, or knowledge files — every FR-1/2/3/4/5/6/7 target file falls in one of those buckets). No production code, docs, skills, or `orch-state.json` were touched by this BA pass; this spec plus the decision-journal entry are the entire deliverable. Recommended `next_agent`: **architect** — technical design needed for FR-3/FR-4/FR-6's atomic deploy-gated bundle and to adjudicate B2's file-ownership split before PM decomposes into per-owner tasks (developer for FR-1/2/3/4/6/7, agent-father for FR-5's `init.md`/`tools/package` subset pending B2). B1 should go to PO in parallel (does not block architect from starting FR-1/2/5/7 design).

---

## [Architect] Brownfield Findings

- **Zone:** multi — `apps/mcp-server/src/interface/mcp/tools/{registry.ts,system/agentMemoryUpdateTools.ts}` + `apps/mcp-server/src/__tests__/1300b-agent-memory-update-tools.test.ts` (developer, deploy-gated), `.claude/skills/append-session-record/` + `docs/guides/guide-skills-registration.md` (developer, safe-now), `docs/agents/{digest-predict,market-analyst}/init.md` + `docs/agents/tools/package/digest-predict.md` (agent-father, safe-now — see B2 ruling), `docs/agent-memory/{AGENT_STARTUP,INDEX,README}.md` + `docs/architecture/microservice/mcp-server/briefings.md` + `docs/standards/mcp-tools.md` + `docs/protocols/smart-compact-protocol*.md` (developer, safe-now), `docs/data/{tool-registry,system-map}.json` + `docs/agents/tools/list/{append_session_record.md,INDEX.md}` (developer, deploy-gated — reclassified, see below), `scripts/migrations/` (new FR-7 script, developer, safe-now, independent). **Standard Detection:** `BUILD-STANDARD: not-applicable` (bug-fix/refactor/maintenance, in-zone, no new primitives).

- **Verified paths (brownfield, read live not trusted from spec prose):**
  - `apps/mcp-server/src/interface/mcp/tools/system/agentMemoryUpdateTools.ts` — full read. Tool-1-only internals confirmed by cross-reference grep (zero other call sites): `VALID_AGENTS` (L29-44), `SessionRecord` interface (L49-55), `getTodayDateStr()` (L70-77), `formatSessionRecord()`+JSDoc (L79-109), `AppendSessionRecordSchema` (L151-166), Tool-1 registration block incl. header comment (L197-296). Shared/Tool-2-only, MUST SURVIVE: `hasPathTraversalAttempt()` (L132-134, used by both tools), `sanitizeFileName()` (L139-145), `buildFrontMatter()` (L114-126), `UpdateMemoryFileSchema` (L168-186), Tool-2 block (L301-400). Only export is `registerAgentMemoryUpdateTools` (L188) — no other internal is imported elsewhere (`grep -rn "from .*agentMemoryUpdateTools"` → registry.ts + the 1300b test only).
  - `apps/mcp-server/src/interface/mcp/tools/registry.ts:218` — comment-only reference, no functional coupling.
  - `scripts/gen-tool-registry.ts` — confirmed this IS a working generator (scans `apps/mcp-server/src/interface/mcp/tools/` for `server.tool(...)` call sites, atomic temp-write+validate+rename). FR-4's `tool-registry.json` half needs **zero manual JSON edits** — just re-run it after FR-3 lands.
  - `scripts/gen-project-stats.ts:200-206` — confirmed `docs/data/project-stats.json#toolCount` is ALSO auto-synced FROM `tool-registry.json` (its own `AC-U2-8` contract). A 4th sync point BA's "3-way" framing didn't name — must re-run in the same atomic window or it goes stale in the same commit (same NFR-1 hazard class).
  - `docs/agents/tools/list/INDEX.md:1-7` — header states `GENERATED from docs/data/tool-registry.json — do not hand-edit; registry is the SSOT`, produced by `scripts/gen-tools-index.sh`. BA's table listed this as consumer #9 for manual editing — **wrong**, it self-heals for free once FR-4's registry regen runs; hand-editing it would violate its own header and get silently overwritten by the next generator run anyway.
  - `scripts/gen-tool-list-stubs.py:8-10` — confirmed ADD-ONLY (mints missing stubs, "never overwrites an existing stub file"). It does **not** delete orphaned per-tool stubs for tools no longer in the registry — so `docs/agents/tools/list/append_session_record.md` will NOT self-heal; it needs an explicit `git rm`.
  - `docs/data/system-map.json:6,29` — `_tools_ssot` header confirms this is a **hand-maintained mirror**, no generator writes it (grep of `scripts/` + `apps/mcp-server` found zero writers targeting this path). FR-4's own text already scopes this edit correctly (deploy-gated); flagged here only because BA's separate live-consumer table (item #13) implies it's also an FR-5 target, which would race FR-4's gate — see correction below.
  - `docs/agents/agent-father/init.md:63-64` (`commit_zone.allowed: ["docs/agents/", ...]`) + `docs/agents/agent-father/flow/{edit-prepare.md:21, create.md:16, scaffold-files.md:97}` (all three explicitly name `docs/agents/tools/package/<agent_name>.md` as a file agent-father's own lifecycle flows author) + `docs/policies/dev-standards.md:1987` (live precedent: `docs/agents/system-auditor/flow/main.md` ruled "agent-father's exclusive commit zone", a developer-scoped row explicitly forbidden from touching it) — basis for the B2 ruling below.
  - `apps/mcp-server/src/__tests__/1300b-agent-memory-update-tools.test.ts` — full read, all 14 `it()` blocks individually classified (see FR-6 below).

- **Reuse patterns:**
  - FR-4's registry half = reuse `scripts/gen-tool-registry.ts` + `scripts/gen-project-stats.ts` + `scripts/gen-tools-index.sh` (3 existing generators, source-of-truth chained: source → registry.json → project-stats.json + INDEX.md) — zero new tooling, zero manual JSON surgery beyond `system-map.json`'s one hand-maintained line.
  - FR-7's new script: reuse `scripts/gen-tool-registry.ts`'s dry-run/atomic-write/fail-loud shape + `scripts/purge-phantom-reports.ts`'s resolved-path-print-before-write convention. Do not invent a new pattern.

- **Design decisions — FR-3/FR-4/FR-6 atomic deploy-gated bundle (ONE commit, ONE off-market window, per NFR-1):**

  1. **FR-3** `agentMemoryUpdateTools.ts`: delete the L29-44/49-55/70-77/79-109/151-166/197-296 ranges listed above (re-verify exact line numbers immediately before each edit — earlier deletes shift later line numbers, work bottom-to-top). Rewrite module docblock (L1-17) to describe only `update_memory_file`. Keep every "MUST SURVIVE" symbol listed above untouched.
     `registry.ts:218` comment: `registerAgentMemoryUpdateTools,  // Task 1300b: append_session_record + update_memory_file (+2 tools → 107)` → `registerAgentMemoryUpdateTools,  // Task 1300b: update_memory_file (+1 tool → 106)`. **Do not** try to correct line 219's "→109" — that's a pre-existing off-by-one in the comment chain, unrelated to this task; separate janitor debt, out of scope here.
  2. **FR-4 (extended — 2 files reclassified out of FR-5, see correction below):**
     a. `bun scripts/gen-tool-registry.ts` (after FR-3 lands) — regenerates `tool-registry.json`, drops the entry, decrements `totalCount` automatically.
     b. `bun scripts/gen-project-stats.ts` — re-syncs `project-stats.json#toolCount` from the freshly regenerated registry (the 4th sync point above).
     c. `bash scripts/gen-tools-index.sh` — regenerates `docs/agents/tools/list/INDEX.md` from the same registry; drops the `append_session_record` entry for free.
     d. `git rm docs/agents/tools/list/append_session_record.md` — orphaned per-tool stub, no generator removes it (manual, see Verified paths).
     e. `docs/data/system-map.json:29` — manually delete the `"append_session_record",` line from `.project.microservices[0].tools[]` (alphabetically sorted; deleting in place preserves order, no re-sort needed). This is the **only** genuinely hand-edited step in FR-4.
  3. **FR-6** `1300b-agent-memory-update-tools.test.ts` — **BA's spec undercounts ("the 2 append_session_record test cases")**. Live read finds **5 to DELETE outright** + **2 to SURGICALLY EDIT** (not delete — they exercise both tools):
     - DELETE: `L74-85` ("accepts valid agent names"), `L87-113` ("rejects invalid agent names via Zod" — never calls the real tool, hand-rolled reimplementation, dead either way), `L115-126` ("formats markdown correctly"), `L128-135` ("minimal fields"), `L215-222` ("prevents directory traversal in task_name").
     - EDIT: `L67-72` ("registers 2 tools...") → rename, drop the `append_session_record` assertion, keep `update_memory_file`.
     - EDIT: `L240-265` (sandbox regression guard) → remove the `append_session_record` `callTool` block (L246-249) + its "Exercise both tools" comment (L244-245 → singular); **keep** the `update_memory_file` call + both assertions — deleting this test outright would silently drop its whole regression-guard purpose.
     - Module docblock `L1-8`: drop the `append_session_record` mention.
     - Net: 14 `it()` blocks → 9, zero coverage loss on `update_memory_file`'s own surface. Re-verify line numbers live at execution time (same caveat as FR-3).
  4. **Pre-commit gate (mechanized backstop):** run `tool-registry-parity.test.ts` + full `tsc` + the 1300b suite green BEFORE the single commit — this is exactly what that parity test exists to catch if any step above is missed.

- **Correction to BA spec — FR-5's real safe-now scope is 10 files, not 13; 2 files reclassified from FR-5 → FR-4-extended (deploy-gated), 1 already was:**
  The 13-file live-consumer table conflates two different classes: **instructional docs** ("call `append_session_record`" — safe to edit early per BA's own Edge Cases reasoning, the tool still works if something calls it) vs. **structural inventory docs** (files that assert "the server has exactly these N tools" — editing these before FR-3 actually deploys makes a false claim the running container contradicts, the same hazard NFR-1 names). `system-map.json:29` was already correctly gated by BA under FR-4. Two more belong there too, on the identical rationale: `docs/agents/tools/list/append_session_record.md` (a per-tool schema reference stub, not a "call this at end-of-cycle" instruction — its only sane fate is deletion, timed with the tool's actual removal) and `docs/agents/tools/list/INDEX.md` (GENERATED — see Verified paths, must not be hand-edited during the safe-now wave, self-heals via FR-4 step 2c). Folded both into FR-4 §2 above.

- **B2 ruling — FR-5 file-ownership split: YES, 2-owner task.**
  `docs/agents/digest-predict/init.md`, `docs/agents/market-analyst/init.md`, and `docs/agents/tools/package/digest-predict.md` **all fall inside agent-father's exclusive lane.** Evidence (verified structurally, not asserted from convention alone — see Verified paths): (1) agent-father's own `commit_zone.allowed` names the `docs/agents/` prefix; (2) agent-father's own `create.md`/`edit-prepare.md`/`scaffold-files.md` flows explicitly author `tools/package/<agent_name>.md` as part of agent lifecycle — not incidental path overlap; (3) live fleet precedent (`dev-standards.md:1987`) already ruled the identical file class ("agent identity/flow surface") agent-father-exclusive and blocked a developer-scoped row from touching it; (4) BA's own `forbidden_outputs` ("NEVER modify agent files, flow files, or knowledge files") is the mirror-image rule, confirming this is fleet-wide, not local convention.
  **Scope boundary (so PM doesn't over-widen):** the other 2 `docs/agents/`-prefixed FR-5 files — `docs/agents/tools/list/append_session_record.md` and `docs/agents/tools/list/INDEX.md` — are **not** in this lane (now moot anyway, reclassified to FR-4-extended above) and, independent of that, are structurally per-MCP-tool reference docs (same class as `tool-registry.json`/`mcp-tools.md`), not agent-identity — agent-father's own flows never reference `tools/list/`.
  **Net FR-5 split (10 safe-now files):**
  - **agent-father (3):** `docs/agents/digest-predict/init.md:53`, `docs/agents/market-analyst/init.md:125`, `docs/agents/tools/package/digest-predict.md:103`.
  - **developer (7):** `docs/agent-memory/AGENT_STARTUP.md:12-15`, `docs/agent-memory/INDEX.md:15`, `docs/agent-memory/README.md:19`, `docs/architecture/microservice/mcp-server/briefings.md:24,56`, `docs/standards/mcp-tools.md:103` (optional bonus: also add a `| append_session_record | removed — dead tool, no replacement, see UC-MDH-P2 |` row to that file's own "Renamed/Removed Tools" table, which already has a dangling `→ tool-registry.json → removed` pointer — `tool-registry.json` has no `removed` key at all, a **pre-existing** SSOT gap this row didn't create and isn't asked to fix; flagged, not actioned), `docs/protocols/smart-compact-protocol.md:31`, `docs/protocols/smart-compact-protocol-offload.md:16,18,25`.

- **Design decisions — FR-1/FR-2/FR-7 (safe-now, unchanged from BA except confirmatory verification):**
  - **FR-1** `.claude/skills/append-session-record/` (1 file, `SKILL.md`): delete after FR-5 lands + re-verified zero remaining (NFR-2). Confirmed live: zero other path-references beyond `guide-skills-registration.md` (FR-2 target) and inert historical journal/brief/decision prose. Bonus finding: the file's own redirect target, `cowork-end-cycle/SKILL.md`, is **already deleted** (by TE-T05) — the redirect is a dead end pointing to a dead end, reinforcing deletion over further patching.
  - **FR-2** `docs/guides/guide-skills-registration.md` §15: delete table rows 15 (`session-log-cowork`) + 16 (`append-session-record`), insert one row in their place: `| end-0-cowork | .claude/skills/end-0-cowork/SKILL.md | Cowork | End cycle |` — verified `end-0-cowork/SKILL.md` exists live and matches BA's corrected instruction.
  - **FR-7** new script `scripts/migrations/prune-session-archive-test-pollution.ts` (Bun/TS): target `docs/agent-memory/sessions/archive/`; match by **exact md5 content hash** against the 3 known pollution hashes (`a003f0ccc95c83dcb9a6f67efcb7f19f` ops, `35d6330b83588017f8b94159a986e202` developer, `35cdf1f822d66788cc0ca17805c44290` qa — re-verified live content of one sample: byte-identical to the 1300b test's own fixture string "Task 1540: WAL Checkpoint Fix", confirming these are genuine test-pollution stubs, not real records); `--dry-run` default (print matched list+count, write nothing), `--execute` to `git rm` the matches (staged, not raw `rm`); fail-loud sanity ceiling (refuse if matched-count exceeds e.g. 50% of the directory, guards a hash typo from nuking real records); re-enumerate the live match set at run time, never trust a cached count (BA's own instruction — 18/19 today, will drift). Add a CANONICAL pointer in `docs/policies/dev-standards.md` § Script Persistence once built.

- **Risk flags:**
  1. FR-3's block-delete must preserve `hasPathTraversalAttempt()` — it's shared with Tool 2; a delete guided only by "everything under the Tool-1 header" would rip out a function Tool 2 still calls and break the build. Called out explicitly above.
  2. FR-6 undercount (BA said "2", live count is 6-delete+2-edit) — flagged so PM/QA cross-check catches it if the deploy-gated developer trusts BA's literal number instead of re-deriving from source.
  3. `mcp-tools.md`'s "Renamed/Removed Tools → tool-registry.json → removed" pointer is **already broken today** (`removed` key doesn't exist in the generated schema) — pre-existing, unrelated to this row, not actioned here.
  4. Post-deploy smoke check (for whoever runs B3's eventual dispatch): confirm via a tool listing that `append_session_record` is gone and `update_memory_file` still works — not this dispatch's job, named for PM/QA visibility.
  - **Scan clean:** true — 2 BA scope corrections found and resolved in this pass (system-map.json's sibling structural-inventory files reclassified FR-5→FR-4-extended), documented above, not a scan failure.

→ journal: `docs/agent-memory/decisions/sprint-ULTRACODE-AUDIT-FIXALL-architect.md`, STEP architect-S9, task-id `UC-MDH-P2`.
