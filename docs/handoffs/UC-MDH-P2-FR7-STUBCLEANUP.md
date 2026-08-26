# UC-MDH-P2-FR7-STUBCLEANUP

**Zone:** `scripts/migrations/` · **Owner:** `developer` · **Size:** S · **Priority:** P2 · **Gate:** safe-now, independent, no rebuild
**Parent row:** `UC-MDH-P2` (done[], decomposed) — sprint `ULTRACODE-AUDIT-FIXALL`
**Spec source:** `docs/handoffs/UC-MDH-P2-BA-spec.md` FR-7 + `[Architect] Brownfield Findings` § Design decisions — FR-1/FR-2/FR-7, item FR-7
**depends_on:** none

---

## TLDR
Bulk-cleanup script for historical test-pollution stub files left in `docs/agent-memory/sessions/archive/` by past `append_session_record` calls exercised inside test suites (not real records). Pure historical-artifact deletion — no live consumer depends on these files, independent of every other FR in this row.

## [PM] Planning Context
- **Zone:** `scripts/migrations/`
- **Acceptance Criteria:**
  - [ ] New script `scripts/migrations/prune-session-archive-test-pollution.ts` (Bun/TS)
  - [ ] Match by **exact md5 content hash** against the 3 known pollution hashes: `a003f0ccc95c83dcb9a6f67efcb7f19f` (ops), `35d6330b83588017f8b94159a986e202` (developer), `35cdf1f822d66788cc0ca17805c44290` (qa)
  - [ ] `--dry-run` is the default: prints matched list + count, writes nothing
  - [ ] `--execute` stages a `git rm` on the matches (never a raw `rm`)
  - [ ] Fail-loud sanity ceiling: refuse if matched-count exceeds 50% of the directory's file count (guards a hash typo from nuking real records)
  - [ ] Re-enumerate the live match set at run time — do not hardcode or trust the cached "18/19 files" count from the BA/architect passes, it will have drifted further by execution time
  - [ ] Reuse `scripts/gen-tool-registry.ts`'s dry-run/atomic-write/fail-loud shape + `scripts/purge-phantom-reports.ts`'s resolved-path-print-before-write convention — do not invent a new pattern
  - [ ] Add a CANONICAL pointer in `docs/policies/dev-standards.md` § Script Persistence once built
- **Files to create:** `scripts/migrations/prune-session-archive-test-pollution.ts`
- **Files to modify:** `docs/policies/dev-standards.md` (pointer only)
- **Dependencies:** none
- **Knowledge needed:** `docs/policies/dev-standards.md` § Script Persistence, `docs/handoffs/UC-MDH-P2-BA-spec.md`

## Standards
`docs/policies/dev-standards.md` · `docs/protocols/fail-loud-protocol.md` · commits: `docs/policies/commit-convention.md` (`Task: UC-MDH-P2-FR7-STUBCLEANUP` + `AC:` trailer)
