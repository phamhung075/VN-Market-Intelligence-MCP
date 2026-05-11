#!/usr/bin/env python3
"""Pass 2: widen scan to .claude/tools, .claude/projects, .claude/WORKFLOW.md, full apps/."""
import os, subprocess, sys
from pathlib import Path

ROOT = Path("/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP")
os.chdir(ROOT)

MAPPING = {
    "alert-policy.md":              "policies/alert-policy.md",
    "restart-policy.md":            "policies/restart-policy.md",
    "commit-convention.md":         "policies/commit-convention.md",
    "dev-standards.md":             "policies/dev-standards.md",
    "docs-organization.md":         "policies/docs-organization.md",
    "qa-checklist.md":              "policies/qa-checklist.md",
    "agent-chaining-protocol.md":   "protocols/agent-chaining-protocol.md",
    "agent-notebook-protocol.md":   "protocols/agent-notebook-protocol.md",
    "ask-queue-protocol.md":        "protocols/ask-queue-protocol.md",
    "smart-compact-protocol.md":    "protocols/smart-compact-protocol.md",
    "fail-loud-protocol.md":        "protocols/fail-loud-protocol.md",
    "bctc-extraction-runbook.md":   "protocols/bctc-extraction-runbook.md",
    "bug-reporting-via-mcp.md":     "protocols/bug-reporting-via-mcp.md",
    "janitor-procedures.md":        "protocols/janitor-procedures.md",
    "ops-incident-response.md":     "protocols/ops-incident-response.md",
    "mcp-tools.md":                 "standards/mcp-tools.md",
    "cron-jobs.md":                 "standards/cron-jobs.md",
    "telegram-commands.md":         "standards/telegram-commands.md",
    "portfolio-schema.md":          "standards/portfolio-schema.md",
    "alert-message-format.md":      "standards/alert-message-format.md",
    "market-analysis.md":           "standards/market-analysis.md",
    "tnb-methodology.md":           "standards/tnb-methodology.md",
    "agent-roster.md":              "references/agent-roster.md",
    "agent-routing.md":             "references/agent-routing.md",
    "agent-spawn-template.md":      "references/agent-spawn-template.md",
    "analysis-ledger-template.md":  "references/analysis-ledger-template.md",
    "tree-map.md":                  "references/tree-map.md",
    "kinh-dich-layer.md":           "references/kinh-dich-layer.md",
    "vps-setup.md":                 "references/vps-setup.md",
    "bundles/bundle-architect.md":  "references/bundles/bundle-architect.md",
    "bundles/bundle-ba.md":         "references/bundles/bundle-ba.md",
    "bundles/bundle-developer.md":  "references/bundles/bundle-developer.md",
    "bundles/bundle-fixer.md":      "references/bundles/bundle-fixer.md",
    "bundles/bundle-pm.md":         "references/bundles/bundle-pm.md",
    "bundles/bundle-qa.md":         "references/bundles/bundle-qa.md",
}

REPLACEMENTS = {}
for src_rel, dst_rel in MAPPING.items():
    REPLACEMENTS[f".claude/knowledge/{src_rel}"] = f"docs/{dst_rel}"
    REPLACEMENTS[f"knowledge/{src_rel}"] = f"docs/{dst_rel}"

# Wider scope this round
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

def in_scope(p: Path) -> bool:
    if any(part in EXCLUDE_PARTS for part in p.parts): return False
    if p.suffix not in (".md", ".ts", ".json"): return False
    return True

targets = set()
for d in SCAN_DIRS:
    base = ROOT / d
    if not base.exists(): continue
    for f in base.rglob("*"):
        if f.is_file() and in_scope(f):
            targets.add(f)
for f in SCAN_FILES:
    p = ROOT / f
    if p.exists(): targets.add(p)
targets = sorted(targets)
print(f"scope pass-2: {len(targets)} files")

edited = 0
total_subs = 0
for f in targets:
    try:
        text = f.read_text(encoding="utf-8")
    except Exception:
        continue
    orig = text
    for old, new in REPLACEMENTS.items():
        if old in text:
            text = text.replace(old, new)
    if text != orig:
        # count subs
        subs_here = sum(orig.count(o) for o in REPLACEMENTS if o in orig)
        f.write_text(text, encoding="utf-8")
        edited += 1
        total_subs += subs_here

print(f"pass-2 rewrote {total_subs} refs in {edited} files")
