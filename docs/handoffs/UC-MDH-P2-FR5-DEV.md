# UC-MDH-P2-FR5-DEV

**Zone:** `docs/` · **Owner:** `developer` · **Size:** S · **Priority:** P1 · **Gate:** safe-now, no rebuild
**Parent row:** `UC-MDH-P2` (done[], decomposed) — sprint `ULTRACODE-AUDIT-FIXALL`
**Spec source:** `docs/handoffs/UC-MDH-P2-BA-spec.md` FR-5 + `[Architect] Brownfield Findings` (§ correction: 10-file safe-now split, this task = the 7-file developer half)
**depends_on:** none
**Sibling (parallel, different owner):** `UC-MDH-P2-FR5-AGENTFATHER` (agent-father's 3 agent-identity files)
**Depended on by:** `UC-MDH-P2-FR1-SKILLDIR-DELETE` (needs this + the sibling both landed, NFR-2 re-verify)

---

## TLDR
Replace every remaining "call `append_session_record`" instruction in these 7 developer-owned docs with the TE-T05 successor pattern (`notebook-write` / `end-0-cowork`). Pure doc edit, no rebuild — the tool is still registered and works either way during the gap.

## [PM] Planning Context
- **Zone:** `docs/`
- **Acceptance Criteria:**
  - [ ] `docs/agent-memory/AGENT_STARTUP.md` (~L12-15) no longer instructs calling `append_session_record`
  - [ ] `docs/agent-memory/INDEX.md` (~L15) same
  - [ ] `docs/agent-memory/README.md` (~L19) same
  - [ ] `docs/architecture/microservice/mcp-server/briefings.md` (~L24, L56) same
  - [ ] `docs/standards/mcp-tools.md` (~L103) same — cross-agent capability table entry removed/updated
  - [ ] `docs/protocols/smart-compact-protocol.md` (~L31) same
  - [ ] `docs/protocols/smart-compact-protocol-offload.md` (~L16, L18, L25) same
  - [ ] Re-verify each line number live before editing — 2 of the BA spec's original 9 citations had already drifted in 6 weeks; do not trust the numbers above as still-exact
  - [ ] After this task AND `UC-MDH-P2-FR5-AGENTFATHER` both land, re-run `grep -rln "append_session_record" --include="*.md" .` (excluding registration source, the 1300b test, and `docs/agent-memory/sessions/archive/` output artifacts) and confirm 0 remaining instructive hits — this satisfies NFR-2 and unblocks `UC-MDH-P2-FR1-SKILLDIR-DELETE`
- **Files to modify:** the 7 files above
- **Files NOT to touch:** `docs/agents/digest-predict/init.md`, `docs/agents/market-analyst/init.md`, `docs/agents/tools/package/digest-predict.md` (agent-father's exclusive `docs/agents/` lane — see sibling task), `docs/agents/tools/list/append_session_record.md` + `docs/agents/tools/list/INDEX.md` (reclassified to the deploy-gated bundle, `UC-MDH-P2-FR346-DEPLOYGATED-BUNDLE` — do not edit these here, `INDEX.md` is GENERATED and self-heals)
- **Dependencies:** none
- **Knowledge needed:** `docs/policies/dev-standards.md`, `docs/handoffs/UC-MDH-P2-BA-spec.md`

## Optional (flagged, not mandatory)
`docs/standards/mcp-tools.md`'s own "Renamed/Removed Tools" table has a dangling `tool-registry.json → removed` pointer (the generated schema has no `removed` key at all) — pre-existing gap this task did not create and is not asked to fix. If touching that table anyway, adding an `append_session_record | removed — dead tool, no replacement, see UC-MDH-P2` row is a reasonable bonus but not an AC.

## Standards
`docs/policies/dev-standards.md` · commits: `docs/policies/commit-convention.md` (`Task: UC-MDH-P2-FR5-DEV` + `AC:` trailer)
