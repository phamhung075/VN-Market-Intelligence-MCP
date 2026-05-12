> Parent: [./SKILL.md](./SKILL.md)

# Token Economy — Part 2: File Compression (`/compress`)

Compress natural language files (CLAUDE.md, todos, preferences) into caveman-speak to reduce input tokens. Compressed version overwrites original. Human-readable backup saved as `<filename>.original.md`.

## Trigger

`/compress <filepath>` or when user asks to compress a memory file.

## Process

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

## Compression Rules

### Remove
- Articles: a, an, the
- Filler: just, really, basically, actually, simply, essentially, generally
- Pleasantries: "sure", "certainly", "of course", "happy to", "I'd recommend"
- Hedging: "it might be worth", "you could consider", "it would be good to"
- Redundant phrasing: "in order to" → "to", "make sure to" → "ensure"
- Connective fluff: "however", "furthermore", "additionally", "in addition"

### Preserve EXACTLY (never modify)
- Code blocks (fenced ``` and indented)
- Inline code (`backtick content`)
- URLs and links
- File paths, commands, technical terms, proper nouns
- Dates, version numbers, numeric values
- Environment variables (`$HOME`, `NODE_ENV`)

### Preserve Structure
- All markdown headings (compress body, not heading text)
- Bullet point hierarchy (keep nesting)
- Numbered lists, tables, frontmatter/YAML headers

### Compress
- Short synonyms: "big" not "extensive", "fix" not "implement a solution for"
- Fragments OK: "Run tests before commit" not "You should always run tests before committing"
- Drop "you should", "make sure to", "remember to" — just state the action
- Merge redundant bullets

CRITICAL: Anything inside ` ``` ` must be copied EXACTLY. No comments removed, no reordering, no shortening.

## Pattern

Original:
> You should always make sure to run the test suite before pushing any changes to the main branch.

Compressed:
> Run tests before push to main.

## Boundaries

- ONLY compress: `.md`, `.txt`, extensionless files
- NEVER modify: `.py`, `.js`, `.ts`, `.json`, `.yaml`, `.yml`, `.toml`, `.env`, `.lock`, `.css`, `.html`, `.xml`, `.sql`, `.sh`
- Mixed content: compress ONLY prose sections
- Never compress `FILE.original.md` (skip it)
