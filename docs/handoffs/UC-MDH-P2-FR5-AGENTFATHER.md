# UC-MDH-P2-FR5-AGENTFATHER

**Zone:** `docs/agents/` · **Owner:** `agent-father` · **Size:** S · **Priority:** P1 · **Gate:** safe-now, no rebuild
**Parent row:** `UC-MDH-P2` (done[], decomposed) — sprint `ULTRACODE-AUDIT-FIXALL`
**Spec source:** `docs/handoffs/UC-MDH-P2-BA-spec.md` FR-5 + `[Architect] Brownfield Findings` § B2 ruling
**depends_on:** none
**Sibling (parallel, different owner):** `UC-MDH-P2-FR5-DEV` (developer's 7-file half)
**Depended on by:** `UC-MDH-P2-FR1-SKILLDIR-DELETE` (needs this + the sibling both landed, NFR-2 re-verify)

---

## TLDR
3 agent-identity/tool-grant docs still instruct calling the dead `append_session_record` tool. Same edit content as the developer sibling task — split into this task ONLY because these 3 files sit inside agent-father's exclusive `commit_zone.allowed` (`docs/agents/`), per the architect's B2 ruling (evidence: agent-father's own `create.md`/`edit-prepare.md`/`scaffold-files.md` explicitly author `tools/package/<agent>.md`; live fleet precedent `dev-standards.md:1987` already ruled this file class agent-father-exclusive on a different row).

## [PM] Planning Context
- **Zone:** `docs/agents/`
- **Acceptance Criteria:**
  - [ ] `docs/agents/digest-predict/init.md` (~L53) no longer instructs calling `append_session_record`
  - [ ] `docs/agents/market-analyst/init.md` (~L125) same
  - [ ] `docs/agents/tools/package/digest-predict.md` (~L103) same
  - [ ] Re-verify each line number live before editing — BA cited L95/L102 for the package doc; architect's re-grep found L103; both may have moved again
  - [ ] Confirmed pre-existing: both agents' own `flow/*.md` files already use `end-0-cowork`/`notebook-write` — do NOT touch the flow files, only the `init.md`/`tools/package` identity docs are stale
  - [ ] After this task AND `UC-MDH-P2-FR5-DEV` both land, the developer picking up `UC-MDH-P2-FR1-SKILLDIR-DELETE` re-runs the repo-wide zero-remaining grep (NFR-2) — no action needed here beyond landing cleanly
- **Files to modify:** the 3 files above
- **Files NOT to touch:** the 7 developer-owned files in the sibling task; `docs/agents/tools/list/append_session_record.md` + `docs/agents/tools/list/INDEX.md` (deploy-gated bundle, not this task, and not agent-father's lane either — those are per-MCP-tool reference docs, not agent-identity)
- **Dependencies:** none
- **Knowledge needed:** `docs/policies/dev-standards.md`, `docs/handoffs/UC-MDH-P2-BA-spec.md`

## Standards
`docs/policies/dev-standards.md` · commits: `docs/policies/commit-convention.md` (`Task: UC-MDH-P2-FR5-AGENTFATHER` + `AC:` trailer)
