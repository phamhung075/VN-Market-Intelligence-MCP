# UC-MDH-P2-FR2-CATALOG

**Zone:** `docs/guides/` · **Owner:** `developer` · **Size:** S · **Priority:** P1 · **Gate:** safe-now, independent, no rebuild
**Parent row:** `UC-MDH-P2` (done[], decomposed) — sprint `ULTRACODE-AUDIT-FIXALL`
**Spec source:** `docs/handoffs/UC-MDH-P2-BA-spec.md` FR-2 + "Already-landed prep work" §2
**depends_on:** none

---

## TLDR
`docs/guides/guide-skills-registration.md` §15's skills catalog carries two stale rows for skills that no longer exist (`append-session-record`, and a second one the BA spec caught: `session-log-cowork`). Delete both, insert one row for the actual successor (`end-0-cowork`).

## [PM] Planning Context
- **Zone:** `docs/guides/`
- **Acceptance Criteria:**
  - [ ] Delete the `append-session-record` catalog row (line 16)
  - [ ] Delete the `session-log-cowork` catalog row (line 15) — also TE-T05-deleted; the original brief's instruction to "add cowork-end-cycle in its place" is itself stale (`cowork-end-cycle` was deleted too, superseded by `end-0-cowork`) — do not follow that literal text
  - [ ] Insert exactly ONE new row: `| end-0-cowork | .claude/skills/end-0-cowork/SKILL.md | Cowork | End cycle |`
  - [ ] Verify `.claude/skills/end-0-cowork/SKILL.md` exists live before writing the row (already confirmed by architect, but re-check at execution time)
  - [ ] Re-verify line numbers live before editing
- **Files to modify:** `docs/guides/guide-skills-registration.md`
- **Dependencies:** none
- **Knowledge needed:** `docs/policies/dev-standards.md`, `docs/handoffs/UC-MDH-P2-BA-spec.md`

## Standards
`docs/policies/dev-standards.md` · commits: `docs/policies/commit-convention.md` (`Task: UC-MDH-P2-FR2-CATALOG` + `AC:` trailer)
