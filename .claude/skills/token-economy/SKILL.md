# Skill: Token Economy

Optimize text output for minimal token cost. Quality first — never drop essential info.
Also supports compressing natural language memory files into caveman format via `/compress`.

---

## Part 1 — Writing Optimization

### When to apply

Writing or editing: docs, changelogs, task descriptions, progress notes, reports, docs/TASKS.md entries.

### 15 Techniques

| # | Technique | When |
|---|-----------|------|
| 1 | Tables over prose | Comparisons, params, config |
| 2 | Bullets with pipes | Multi-part items: `Part1 | Part2 | Part3` |
| 3 | Numbered steps | Workflows, sequences |
| 4 | One example only | Code samples — keep best, drop rest |
| 5 | Pattern statements | Repetition → `**Pattern**: All X do Y` |
| 6 | Add "Why" | Decisions → `**Why**: [reason]` |
| 7 | Concrete errors | `**Error**: \`exact message\`` + `**Fix**: [solution]` |
| 8 | No fluff | Remove ASCII art, emojis, decorations |
| 9 | Scannable | Headers, bullets, tables — no walls of text |
| 10 | Consolidate | Merge duplicate sections |
| 11 | Compact code | 3-5 key lines only |
| 12 | Quick lists | Command/param tables |
| 13 | Inverted pyramid | Critical → Details → Context |
| 14 | Conditional verbosity | Complex: detailed. Routine: one line |
| 15 | No teaching | State facts, skip explanations of basics |

### Quick workflow

1. **Identify**: Prose → table? Multiple examples → one? ASCII → numbered? Teaching → facts?
2. **Apply**: Convert, consolidate, compact
3. **Check**: Essential info preserved? Scannable? No fluff?

### MCP task template

```
Requirements: [WHAT] | Files: [PATH:LINES] (action) | Acceptance: [CRITERIA] | Why: [CONTEXT]
```

`progress_notes`: `[ACTION] [WHAT]. [NEXT].`

`completion_summary`: `[DONE]. [TECH]. Files: [PATHS]. [IMPACT].`

### Common fixes

| Issue | Fix |
|-------|-----|
| Multiple examples | Keep 1 (#4) |
| Prose comparison | Table (#1) |
| Teaching tone | Facts only (#15) |
| ASCII art | Numbered steps (#3) |
| No "why" | Add context (#6) |

---

## Part 2 — File Compression (`/compress`)

Compress natural language files (CLAUDE.md, todos, preferences) into caveman-speak to reduce input tokens. Compressed version overwrites original. Human-readable backup saved as `<filename>.original.md`.

### Trigger

`/compress <filepath>` or when user asks to compress a memory file.

### Process

1. This SKILL.md lives alongside `scripts/` in the same directory. Find that directory.

2. Run:

```
cd <directory_containing_this_SKILL.md> && python3 -m scripts <absolute_filepath>
```

3. The CLI will:
   - detect file type (no tokens)
   - call Claude to compress
   - validate output (no tokens)
   - if errors: cherry-pick fix with Claude (targeted fixes only, no recompression)
   - retry up to 2 times
   - if still failing after 2 retries: report error to user, leave original file untouched

4. Return result to user

### Compression Rules

#### Remove
- Articles: a, an, the
- Filler: just, really, basically, actually, simply, essentially, generally
- Pleasantries: "sure", "certainly", "of course", "happy to", "I'd recommend"
- Hedging: "it might be worth", "you could consider", "it would be good to"
- Redundant phrasing: "in order to" → "to", "make sure to" → "ensure", "the reason is because" → "because"
- Connective fluff: "however", "furthermore", "additionally", "in addition"

#### Preserve EXACTLY (never modify)
- Code blocks (fenced ``` and indented)
- Inline code (`backtick content`)
- URLs and links
- File paths, commands, technical terms, proper nouns
- Dates, version numbers, numeric values
- Environment variables (`$HOME`, `NODE_ENV`)

#### Preserve Structure
- All markdown headings (compress body, not heading text)
- Bullet point hierarchy (keep nesting)
- Numbered lists, tables, frontmatter/YAML headers

#### Compress
- Short synonyms: "big" not "extensive", "fix" not "implement a solution for"
- Fragments OK: "Run tests before commit" not "You should always run tests before committing"
- Drop "you should", "make sure to", "remember to" — just state the action
- Merge redundant bullets

CRITICAL: Anything inside ` ``` ` must be copied EXACTLY. No comments removed, no reordering, no shortening.

### Pattern

Original:
> You should always make sure to run the test suite before pushing any changes to the main branch.

Compressed:
> Run tests before push to main.

### Boundaries

- ONLY compress: `.md`, `.txt`, extensionless files
- NEVER modify: `.py`, `.js`, `.ts`, `.json`, `.yaml`, `.yml`, `.toml`, `.env`, `.lock`, `.css`, `.html`, `.xml`, `.sql`, `.sh`
- Mixed content: compress ONLY prose sections
- Never compress `FILE.original.md` (skip it)

---

## Part 3 — Agent Pipeline Compression Policy (ULTRA / FULL / LITE)

Governs how agents compress outputs when passing context to downstream agents. Reduces token consumption ~75% on long pipeline chains.

### Three Tiers

| Tier | Alias | Reduction | When to use | Format rules |
|------|-------|-----------|-------------|--------------|
| ULTRA | caveman | ~75% | Inter-agent pings, blocker escalations, WIP state changes | `KEY: value` pairs or 1-line imperative only. No prose, no headers, no bullets. |
| FULL | handoff | ~40% | Task handoff files, RETURN blocks, architect design docs, knowledge files | Structured Markdown, bullets/tables, no narrative padding. Max 400 words per handoff body. |
| LITE | summary | ~20% | Session logs, sprint retros, PM status updates to user | Flowing prose OK. Max 3 sentences per point. No filler. |

### Decision Matrix

| Signal type | Tier |
|---|---|
| Agent ping / status check | ULTRA |
| Blocker escalation | ULTRA |
| WIP state change | ULTRA |
| Agent RETURN block | FULL |
| Task handoff file | FULL |
| Architect design doc | FULL |
| Knowledge file (permanent SSOT) | FULL |
| docs/TASKS.md Done row | LITE |
| Sprint session log append | LITE |
| Completed Sprints summary line | LITE |
| User-facing status report | LITE |
| Sprint retrospective | LITE |

### Explicit Tier Signal

For non-standard cases, prefix the message:

```
[ULTRA] STATUS: done.
[FULL] ## Handoff ...
[LITE] Sprint 1409 closed. All tasks merged.
```

### RETURN Block Format (FULL tier)

```
## RETURN
DONE: [one sentence — what was completed]
NEXT: [agent name] | [one sentence — what it must do]
HANDOFF: docs/handoffs/TASK_NNN.md
PIPELINE: continue | complete | blocked
```

Rules: DONE ≤20 words, past tense. NEXT = agent name + task. PIPELINE: `complete` only when full sprint goal achieved.

### Enforcement

Agents violating compression (e.g. pasting full file contents into RETURN block) flagged by PO at sign-off. Repeat violations → architect review of agent prompt.
