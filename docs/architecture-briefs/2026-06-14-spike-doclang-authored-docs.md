# SPIKE — DocLang for Authored Docs: Feasibility Brief

**Spike ID:** SPIKE-DOCLANG-AUTHORED-DOCS
**Sprint:** DOCLANG-SERIALIZE
**Author:** architect
**Date:** 2026-06-14
**Timebox used:** 60m / 120m

**DECISION: NO-GO — keep authored docs as markdown. DocLang stays scoped to extracted content only.**

---

## 1. Consumer Parsing Reality

### How docs are consumed — the read path

Every doc consumer in this repo falls into one of four categories, all verified by inspection:

**Category A — LLM raw-text Read (dominant path)**
Agents load docs via the `Read` tool and pass the raw file content to the LLM as text. The LLM
interprets prose, headings, code blocks, and bullet lists by semantic understanding — not by
parsing markdown AST. Verified in:
- All `docs/agents/*/flow/*.md` files — reference `Read` and `skill:` pointers; no XML parser
- All `docs/policies/`, `docs/protocols/`, `docs/standards/`, `docs/references/` — loaded via
  `Read` tool per `always_load` / `lazy_load` blocks in `init.md` files
- `docs/agent-memory/notebooks/*.md` — loaded via `skill: .claude/skills/notebook-read/SKILL.md`
  which issues a plain `Read <path>`
- `.claude/skills/*/SKILL.md` — loaded via `Read` tool when agent flow references `skill: <path>`

**Category B — grep/regex on markdown syntax (two specific cases)**
Two skills run shell grep against markdown files as data:

1. `notebook-write/SKILL.md`: `grep -c "^## " notebook.md` — counts `## ` section headings to
   enforce the 3-section retention rule. If notebook were `.dclg.xml`, this grep returns 0 and
   the skill fails to detect sections, causing a full-overwrite of the notebook on every cycle.

2. `doc-heal-system/SKILL.md` + `claude-manager-helper/flow/main.md`: glob patterns hardcoded to
   `*.md` — `ls *.md`, `find . -name "*.md"`, scope strings
   `docs/{policies,protocols,standards,references,guides}/*.md`. Any file renamed to `.dclg.xml`
   disappears from monitoring, healing, and size-cap enforcement.

**Category C — Claude Code system (YAML frontmatter parser)**
Claude Code's agent runner parses `---\n<YAML>\n---` frontmatter on line 1 of `.claude/agents/*.md`
to extract `name`, `description`, `tools`, `model`. This is structural parsing, not LLM
interpretation. If line 1 is `<?xml` or `<dclg:document`, the YAML parser rejects the file and
the agent fails to spawn. Verified: every agent in `.claude/agents/` (42 files) starts with `---`.

**Category D — Hook byte-counting (calibrate-ctx-overhead.sh)**
The `calibrate-ctx-overhead.sh` hook uses `wc -c` on `CLAUDE.md` and `SKILL.md` files and
`find .claude/skills -name "SKILL.md"` to estimate token overhead. The find glob targets `*.md`
— `.dclg.xml` files are invisible to the token-budget estimator.

### No consumer reads docs as structured XML

Zero tools, scripts, or agents parse authored docs as XML today. There is no XPath, no XML
DOM traversal, no XSD/Schematron validation run against authored docs. The only XML
validation in the entire codebase is `doclang validate` against extracted BCTC output
(already shipped as DOCLANG-SERIALIZE sprint).

---

## 2. Agent-MD Constraint — Frontmatter Incompatibility

### .claude/agents/*.md (42 files)

Claude Code's agent runner requires `---` YAML frontmatter on line 1. These files define
`name`, `description`, `tools`, `model` as YAML fields. DocLang XML has no YAML frontmatter
concept — its header is `<?xml version="1.0"?><dclg:document xmlns:dclg="...">`.

**Converting any `.claude/agents/*.md` to `.dclg.xml` = broken agent spawn.** The agent-md-factory
skill enforces this invariant (`P-4 — Frontmatter line-1 invariant`): `---` on line 1 is mandatory.
DocLang is structurally incompatible.

### .claude/skills/*/SKILL.md (55 files)

Skills also carry YAML frontmatter (`name`, `description`, `required_inputs`). Claude Code uses
this frontmatter for skill discovery and triggering (confirmed by `skill-creator/SKILL.md`
§ description-optimization). Same incompatibility applies.

### CLAUDE.md files (7 files, including global ~/.claude/CLAUDE.md)

Claude Code injects CLAUDE.md content as raw text into every session context. These files are
not parsed as XML — they are plain markdown prose. Converting them to DocLang XML would inject
raw XML tags into the context window, forcing the LLM to parse angle brackets as instructions.
This would degrade reliability and token efficiency (DocLang is designed to be token-efficient
for document content, not for instruction prose).

### docs/agents/*/flow/*.md (384 files)

Flow files are loaded by spawned sub-agents via `Read` and interpreted as step-by-step
instructions by the LLM. The LLM expects prose + markdown headings as section markers. DocLang
replaces `## Step 1` with `<dclg:heading level="2">Step 1</dclg:heading>` — the LLM still
understands this but at higher token cost per character and no semantic gain, since the LLM
already handles markdown headings efficiently.

---

## 3. Benefit vs Cost Analysis

### Concrete consumer benefit today: NONE

No tool, agent, or hook today consumes doc geometry, cross-page layout, bounding-box data,
or any attribute that DocLang expresses beyond plain text. The only structured reads on
authored docs are the two grep patterns above — and those target markdown syntax (`^## `),
not DocLang semantics.

DocLang's design goals per spec.md v0.6 §Introduction:
- Preserves geometric/layout information for EXTRACTED documents
- LLM-token-efficient encoding for complex multimodal content (tables, formulas, charts)
- Lossless round-trip from PDF/HTML/Word formats

None of these apply to authored markdown:
- Authored docs have no geometric/layout data — they are created as prose, not extracted
- Markdown's token efficiency is already comparable to DocLang for prose (DocLang overhead
  is justified by table OTSL encoding, not by paragraphs and headings)
- No round-trip conversion problem exists: markdown is the source of truth

The SPIKE-DOCLANG-OTSL-OVERLAP result (notebook 2026-06-13T20:45Z) is instructive:
DocLang added zero net-new defect detection over native gates on extracted content —
the format's value is as a representation, not a validation/semantic layer. For authored
prose, even the representation benefit does not apply.

### Concrete costs of conversion

| Cost | Severity |
|---|---|
| `notebook-write` grep `^## ` breaks: full-overwrite bug on every cycle | P0 (data loss) |
| `.claude/agents/*.md` YAML frontmatter incompatible with DocLang XML | P0 (spawn failure) |
| `.claude/skills/*/SKILL.md` YAML frontmatter incompatible | P0 (skill failure) |
| `doc-heal-system` / `claude-manager-helper` `*.md` globs go blind | P1 (monitoring gap) |
| `calibrate-ctx-overhead.sh` SKILL.md glob goes blind → wrong token budget | P1 (budget error) |
| `CLAUDE.md` injected as XML → angle-bracket noise in every session context | P1 (LLM reliability) |
| 78 `*.md` refs in `tree-map.md` + 11 `*.md` refs in `doc-heal-system` scope string | P1 (SSOT drift) |
| Blast radius: 78 files minimum (16 policies + 27 protocols + 15 standards + 20 references) | High churn |
| Blast radius full: 384 agent flows + 55 skills + 42 agent .md + 7 CLAUDE.md files | Very high churn |

**Total blast radius if converting ALL authored docs: ~585 files. Zero benefit. Multiple P0 breaks.**

---

## 4. Recommendation: NO-GO

**DocLang must NOT be applied to authored project docs.** The format is correctly scoped to
extracted document content (BCTC PDFs, financial statement artifacts). The two scopes are
fundamentally different:

| Dimension | Extracted content | Authored docs |
|---|---|---|
| Origin | PDF/image extraction pipeline | Human/LLM prose authoring |
| Consumer | doclang validate gate, serializer | Read tool → LLM interpretation |
| Structure value | Table OTSL, bboxes, cross-page | None — prose is flat |
| Format constraint | None (new output artifact) | Markdown headings, YAML frontmatter required |
| Conversion cost | Low (new serializer, Phase 1 DONE) | P0-breaking for 585 files |
| Benefit | Standard representation for AI tools | None identifiable |

### What to record in memory

The user directive in `project_doclang_priority_format.md` correctly caveat-flags:
"DocLang is designed for unstructured extracted content, not authored markdown."
This spike confirms that caveat is definitive, not a soft suggestion.

The memory directive should be narrowed: DocLang priority format applies to **extracted document
content only** (scope 1). Scope 2 (authored docs) is closed NO-GO per this spike.

### If a future use case emerges

The only plausible future partial-GO scenario: a new machine-consumer tool that ingests
`docs/architecture-briefs/` or `docs/handoffs/` to perform semantic search across decision
history (similar to the WIKI lesson-advisor). Even then, the right path is to emit a DocLang
representation at query time from markdown source — not to convert the source files. The
markdown files remain the SSOT; a DocLang view is derived on-demand.

---

## 5. BUILD-STANDARD

**not-applicable** — findings spike only. No code change. No doc conversion.
