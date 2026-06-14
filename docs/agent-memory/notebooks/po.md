# PO Notebook

## 2026-06-14T07:10Z — opened sprint DOCLANG-SERIALIZE (user directive project-doclang-priority-format)

**Decision:** phased, evidence-respecting. Phase 1 BUILD now, Phase 2 GATED.

### Board mutations (orch-state.json, atomic temp→verify→rename)
- **NEW sprint_goal** `DOCLANG-SERIALIZE` (active): adopt DocLang `.dclg.xml` v0
  (ns https://www.doclang.ai/ns/v0) as canonical OUTPUT/representation format for
  pdf-extractor extractions — ADDITIVE, never replacing `bctc_table_rows`.
- **NEW** `BA-DOCLANG-SERIALIZE` → backlog (SPRINT-S, ba, zone apps/pdf-extractor/, P-med).
  Phase 1: production `DocLangSerializer` in `apps/pdf-extractor/infrastructure/` rendering
  existing layout-first extractor output → `.dclg.xml`. Promotes throwaway
  `scripts/spike-doclang-otsl-overlap.py`. bctc_table_rows MUST stay unchanged.
- **NEW** `SPIKE-DOCLANG-AUTHORED-DOCS` → backlog (SPIKE, architect, zone docs/agents/,
  gated_behind BA-DOCLANG-SERIALIZE). Phase 2: feasibility of converting authored docs/
  markdown → .dclg.xml — what breaks across docs DAG, consumer benefit? Findings ONLY.

### Anti-confusion ruling (critical)
Prior `SPIKE-DOCLANG-OTSL-OVERLAP` (net-new=0 defects) killed DocLang as a VALIDATION
GATE (Option A). THIS sprint = DocLang as OUTPUT/REPRESENTATION format — distinct scope,
no contradiction. scope_out spells it out so dev/architect don't re-litigate the gate question.

### Why NOT bundle Phase 2 into Phase 1
docs/ markdown is consumed AS markdown by agents+skills+hooks; DocLang targets extracted
unstructured content, not authored prose. Bundling couples low-risk additive serializer to
high-blast-radius agent-flow-reader breakage. Gate Phase 2 behind a feasibility spike.

### Carry-over
- Sprint umbrella lock `task:DOCLANG-SERIALIZE` claimed (ttl 3600).
- Pipeline: po → ba (spec) → architect (design) → dev-pdf-extractor (build) → qa.
- NEXT = ba writes spec for BA-DOCLANG-SERIALIZE. SPIKE-DOCLANG-AUTHORED-DOCS stays TODO
  until Phase 1 ships, then architect runs the feasibility spike.
