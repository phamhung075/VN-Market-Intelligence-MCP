# UC-MDH-P2-FR1-SKILLDIR-DELETE

**Zone:** `.claude/skills/` · **Owner:** `developer` · **Size:** XS · **Priority:** P1 · **Gate:** safe-now (sequenced), no rebuild
**Parent row:** `UC-MDH-P2` (done[], decomposed) — sprint `ULTRACODE-AUDIT-FIXALL`
**Spec source:** `docs/handoffs/UC-MDH-P2-BA-spec.md` FR-1, NFR-2 + `[Architect] Brownfield Findings` § Design decisions — FR-1/FR-2/FR-7
**depends_on:** `UC-MDH-P2-FR5-DEV`, `UC-MDH-P2-FR5-AGENTFATHER`

---

## TLDR
Delete `.claude/skills/append-session-record/` entirely. **Do not start this task until BOTH FR-5 halves have landed.** This is a hard sequencing dependency (NFR-2), not a deploy gate — the tool itself is unaffected either way.

## [PM] Planning Context
- **Zone:** `.claude/skills/`
- **Acceptance Criteria:**
  - [ ] **Gate check first:** both `UC-MDH-P2-FR5-DEV` and `UC-MDH-P2-FR5-AGENTFATHER` are DONE
  - [ ] Re-run the spec's own grep before deleting: `grep -rln "append_session_record" --include="*.md" .`, excluding the 3 categories the BA spec already ruled out (the tool's own registration source, the 1300b test, and `docs/agent-memory/sessions/archive/` output artifacts) — confirm **0 remaining instructive hits**. Do not trust this handoff's or the spec's file counts as still-accurate; board churn is real
  - [ ] If the re-verify finds any remaining live instructive hit, HOLD — do not delete, escalate back (a stale reference surviving the sibling tasks means something was missed)
  - [ ] Delete `.claude/skills/append-session-record/SKILL.md` (single file, whole directory)
  - [ ] Confirmed by architect: the file's own redirect target `.claude/skills/cowork-end-cycle/SKILL.md` is already deleted (TE-T05) — a dead end pointing to a dead end, reinforcing deletion over further patching
- **Files to delete:** `.claude/skills/append-session-record/SKILL.md`
- **Dependencies:** `UC-MDH-P2-FR5-DEV`, `UC-MDH-P2-FR5-AGENTFATHER` (both must be DONE first)
- **Knowledge needed:** `docs/policies/dev-standards.md`, `docs/handoffs/UC-MDH-P2-BA-spec.md`

## Standards
`docs/policies/dev-standards.md` · commits: `docs/policies/commit-convention.md` (`Task: UC-MDH-P2-FR1-SKILLDIR-DELETE` + `AC:` trailer)
