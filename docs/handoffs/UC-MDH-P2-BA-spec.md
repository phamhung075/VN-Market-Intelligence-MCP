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
