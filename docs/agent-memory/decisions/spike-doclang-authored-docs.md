# Decision Journal — SPIKE-DOCLANG-AUTHORED-DOCS

**task_id:** SPIKE-DOCLANG-AUTHORED-DOCS
**date:** 2026-06-14
**agent:** architect
**zone:** docs/ (authored markdown DAG)
**decision:** CLOSE spike — NO-GO. Keep authored docs as markdown. DocLang stays scoped to extracted content only.

---

## Context

User directive `project-doclang-priority-format` covered two scopes:
scope 1 = extracted document content (BCTC/PDF) — **SHIPPED** as the
DOCLANG-SERIALIZE Phase 1 sprint; scope 2 = authored project docs
(policies/protocols/agent-flows/notebooks). This spike is the findings-only
feasibility study for scope 2. **No conversion was performed.**

---

## What was considered

**Option A (convert authored docs/ markdown → `.dclg.xml`):** make DocLang the
canonical on-disk format for policies, protocols, standards, references, agent
flows, notebooks, and MEMORY.md.

**Option B (NO-GO):** keep authored docs as markdown; DocLang stays scoped to
extracted content only. Emit a derived `.dclg.xml` VIEW at query time from the
`.md` SSOT if a future machine-consumer ever needs one.

---

## Evidence (from direct code inspection of this repo)

Consumers of authored docs fall into four categories — none read DocLang's
value-adds (geometry / bbox / OTSL / cross-page layout):

- **(A) LLM via raw `Read` tool** — dominant path: ~384 agent flows, 55 skills,
  42 agent `.md`, all policy/protocol/standard/reference docs. Passed as plain
  text; no XML parser involved; LLM reads `.md` and `.dclg.xml` prose
  identically → zero benefit.
- **(B) Shell grep `^## `** in `notebook-write/SKILL.md` — structurally counts
  markdown headings to enforce the 3-section / 200L retention rule. A
  `.dclg.xml` notebook returns 0 sections → full-overwrite every cycle → **P0
  data loss.**
- **(C) Claude Code YAML frontmatter parser** for `.claude/agents/*.md` (42) and
  `SKILL.md` (55) — requires `---` YAML on line 1
  ([[project_agent_frontmatter_line1]]). A DocLang `<?xml>` header is
  structurally incompatible → **agent spawn fails.** Same for `CLAUDE.md`.
- **(D) `find . -name "*.md"` globs** in `doc-heal-system` and
  `calibrate-ctx-overhead.sh` hooks — `.dclg.xml` is invisible → monitoring
  blind spots + wrong token-budget estimates.

Blast radius for full conversion: 585+ files, all churn, zero gain.

---

## Decision

**NO-GO.** Scope 2 of the priority-format directive is CLOSED. DocLang is
designed for unstructured EXTRACTED content, not authored prose; authored docs
remain markdown. If a future machine-consumer needs a brief/handoff in DocLang,
the correct path is to emit a derived `.dclg.xml` view at query time from the
`.md` SSOT — never convert source files.

**Brief:** `docs/architecture-briefs/2026-06-14-spike-doclang-authored-docs.md`

---

## Cross-references

- Memory: `project_doclang_priority_format` (status block: scope 1 SHIPPED,
  scope 2 CLOSED NO-GO).
- Sibling spike (scope-1 gate question): `spike-doclang-otsl-overlap.md`
  (DocLang-as-validator-gate = 0 net-new).
- Shipped sprint: DOCLANG-SERIALIZE Phase 1 (commits
  5d121989/2d79baed/01ce9431/ccaf937f, closed 62cbddce).
