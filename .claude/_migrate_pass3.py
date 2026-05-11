#!/usr/bin/env python3
"""Pass 3: rewrite folder-glob refs + fix obvious typos."""
import os
from pathlib import Path

ROOT = Path("/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP")
os.chdir(ROOT)

# Order matters: longest first
GLOB_REPLACEMENTS = [
    # bundles → references/bundles
    (".claude/knowledge/bundles/bundle-*.md", "docs/references/bundles/bundle-*.md"),
    (".claude/knowledge/bundles/*.md",        "docs/references/bundles/*.md"),
    (".claude/knowledge/bundles/",            "docs/references/bundles/"),
    # template placeholders
    (".claude/knowledge/<related-knowledge>.md", "docs/<bucket>/<file>.md"),
    (".claude/knowledge/<file>.md",              "docs/<bucket>/<file>.md"),
    (".claude/knowledge/<topic>.md",             "docs/<bucket>/<topic>.md"),
    # glob over the whole tree
    (".claude/knowledge/**",   "docs/{policies,protocols,standards,references}/**"),
    (".claude/knowledge/*.md", "docs/{policies,protocols,standards,references}/*.md"),
    # bare folder reference
    (".claude/knowledge/",     "docs/{policies,protocols,standards,references}/"),
]

# Typo / dead-pointer fixes (only where the intent is clearly recoverable)
TYPO_FIXES = [
    # `reference_vps_setup.md` was the memory file pattern → real file is vps-setup.md
    (".claude/knowledge/reference_vps_setup.md", "docs/references/vps-setup.md"),
    # `position-schema.md` typo → portfolio-schema.md
    (".claude/knowledge/position-schema.md", "docs/standards/portfolio-schema.md"),
    # `telegram-alerts.md` → telegram-commands.md (alerts are described inside)
    (".claude/knowledge/telegram-alerts.md", "docs/standards/telegram-commands.md"),
    # `reference_pdf_ocr_vps_architecture.md` → memory pointer (user memory file)
    (".claude/knowledge/reference_pdf_ocr_vps_architecture.md",
     "memory/reference_pdf_ocr_vps_architecture.md"),
    # `low-confidence-handling.md` → memory pointer (user memory file)
    (".claude/knowledge/low-confidence-handling.md",
     "memory/reference_low_confidence_handling.md"),
    # `stock-classification.md` → JSON (volatile data lives in docs/data/)
    (".claude/knowledge/stock-classification.md", "docs/data/stock-classification.json"),
]

SCAN_DIRS = [
    ".claude/agents", ".claude/flows", ".claude/skills",
    ".claude/tools", ".claude/projects",
    "apps",
    "docs/guides", "docs/architecture",
    "docs/policies", "docs/protocols", "docs/standards", "docs/references",
]
SCAN_FILES = [
    "CLAUDE.md", "README.md", ".claude/WORKFLOW.md",
    "docs/ARCHITECTURE.md", "docs/AI_TEAM_DESIGN.md",
    "docs/AGENT_CREATION_GUIDE.md", "docs/GLOSSARY_VI.md",
    "docs/SPRINT_GOAL.md", "docs/WORK.md", "docs/TASKS.md",
]
EXCLUDE_PARTS = {"node_modules", "_archive", "worktrees", ".git", "dist", ".turbo"}

# Exclude tree-map.md's historical "Deleted Files" section + commit/SKILL "Knowledge Files" row
# from rewriting (they document the OLD paths intentionally).
EXCLUDE_LINES = {
    "docs/references/tree-map.md": [178, 179, 180],  # Deleted Files table — record of past deletions
}

def in_scope(p: Path) -> bool:
    if any(part in EXCLUDE_PARTS for part in p.parts): return False
    if p.suffix not in (".md", ".ts", ".json"): return False
    return True

targets = set()
for d in SCAN_DIRS:
    base = ROOT / d
    if base.exists():
        for f in base.rglob("*"):
            if f.is_file() and in_scope(f): targets.add(f)
for f in SCAN_FILES:
    p = ROOT / f
    if p.exists(): targets.add(p)

def apply_replacements(text, pairs):
    out = text
    n = 0
    for old, new in pairs:
        c = out.count(old)
        if c:
            out = out.replace(old, new)
            n += c
    return out, n

edited = 0
total = 0
for f in sorted(targets):
    rel = str(f.relative_to(ROOT))
    text = f.read_text(encoding="utf-8")
    exclude_lines = EXCLUDE_LINES.get(rel, [])
    if exclude_lines:
        lines = text.splitlines(keepends=True)
        new_lines = []
        for i, line in enumerate(lines, 1):
            if i in exclude_lines:
                new_lines.append(line)
            else:
                rewritten, _ = apply_replacements(line, GLOB_REPLACEMENTS + TYPO_FIXES)
                new_lines.append(rewritten)
        new_text = "".join(new_lines)
    else:
        new_text, _ = apply_replacements(text, GLOB_REPLACEMENTS + TYPO_FIXES)
    if new_text != text:
        # count subs
        subs = sum(text.count(o) - new_text.count(o) for o, _ in GLOB_REPLACEMENTS + TYPO_FIXES if o in text)
        f.write_text(new_text, encoding="utf-8")
        edited += 1
        total += subs

print(f"pass-3: rewrote {total} refs in {edited} files")
