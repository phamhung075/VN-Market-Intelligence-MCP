#!/usr/bin/env python3
"""
One-shot migration: .claude/knowledge/  →  docs/{policies,protocols,standards,references}/
Scope: living docs only. Skips docs/handoffs, docs/architecture-briefs, docs/analysis-briefs,
docs/agent-memory, docs/data, docs/incidents, docs/sessions, docs/cycles, docs/briefings,
docs/specs, docs/tasks, docs/evals, docs/TASKS_ARCHIVE.md, reports/, .claude/worktrees/.
"""
import os, subprocess, sys, re
from pathlib import Path

ROOT = Path("/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP")
os.chdir(ROOT)

# ---- File categorization ----
MAPPING = {
    # policies/  (enforceable rules / decisions / conventions)
    "alert-policy.md":              "policies/alert-policy.md",
    "restart-policy.md":            "policies/restart-policy.md",
    "commit-convention.md":         "policies/commit-convention.md",
    "dev-standards.md":             "policies/dev-standards.md",
    "docs-organization.md":         "policies/docs-organization.md",
    "qa-checklist.md":              "policies/qa-checklist.md",
    # protocols/  (sequence flows / procedures / runbooks)
    "agent-chaining-protocol.md":   "protocols/agent-chaining-protocol.md",
    "agent-notebook-protocol.md":   "protocols/agent-notebook-protocol.md",
    "ask-queue-protocol.md":        "protocols/ask-queue-protocol.md",
    "smart-compact-protocol.md":    "protocols/smart-compact-protocol.md",
    "fail-loud-protocol.md":        "protocols/fail-loud-protocol.md",
    "bctc-extraction-runbook.md":   "protocols/bctc-extraction-runbook.md",
    "bug-reporting-via-mcp.md":     "protocols/bug-reporting-via-mcp.md",
    "janitor-procedures.md":        "protocols/janitor-procedures.md",
    "ops-incident-response.md":     "protocols/ops-incident-response.md",
    # standards/  (format specs / schemas / methodologies / tool lookups)
    "mcp-tools.md":                 "standards/mcp-tools.md",
    "cron-jobs.md":                 "standards/cron-jobs.md",
    "telegram-commands.md":         "standards/telegram-commands.md",
    "portfolio-schema.md":          "standards/portfolio-schema.md",
    "alert-message-format.md":      "standards/alert-message-format.md",
    "market-analysis.md":           "standards/market-analysis.md",
    "tnb-methodology.md":           "standards/tnb-methodology.md",
    # references/  (lookups / rosters / maps / templates)
    "agent-roster.md":              "references/agent-roster.md",
    "agent-routing.md":             "references/agent-routing.md",
    "agent-spawn-template.md":      "references/agent-spawn-template.md",
    "analysis-ledger-template.md":  "references/analysis-ledger-template.md",
    "tree-map.md":                  "references/tree-map.md",
    "kinh-dich-layer.md":           "references/kinh-dich-layer.md",
    "vps-setup.md":                 "references/vps-setup.md",
    # bundles/  (role bundles — references aggregator)
    "bundles/bundle-architect.md":  "references/bundles/bundle-architect.md",
    "bundles/bundle-ba.md":         "references/bundles/bundle-ba.md",
    "bundles/bundle-developer.md":  "references/bundles/bundle-developer.md",
    "bundles/bundle-fixer.md":      "references/bundles/bundle-fixer.md",
    "bundles/bundle-pm.md":         "references/bundles/bundle-pm.md",
    "bundles/bundle-qa.md":         "references/bundles/bundle-qa.md",
}

# ---- Step 1: validate source files exist ----
missing = [k for k in MAPPING if not (ROOT / ".claude/knowledge" / k).exists()]
if missing:
    print(f"❌ missing sources: {missing}"); sys.exit(1)
print(f"✓ all {len(MAPPING)} source files present")

# ---- Step 2: create target dirs ----
for sub in ("policies", "protocols", "standards", "references", "references/bundles"):
    (ROOT / "docs" / sub).mkdir(parents=True, exist_ok=True)
print("✓ target dirs created")

# ---- Step 3: git mv each file ----
moved = []
for src_rel, dst_rel in MAPPING.items():
    src = f".claude/knowledge/{src_rel}"
    dst = f"docs/{dst_rel}"
    r = subprocess.run(["git", "mv", src, dst], capture_output=True, text=True)
    if r.returncode != 0:
        print(f"❌ git mv failed for {src} → {dst}: {r.stderr}"); sys.exit(1)
    moved.append((src, dst))
print(f"✓ git mv {len(moved)} files")

# ---- Step 4: build replacement map ----
# Old: .claude/knowledge/<path>   →   New: docs/<bucket>/<path>
REPLACEMENTS = {}
for src_rel, dst_rel in MAPPING.items():
    REPLACEMENTS[f".claude/knowledge/{src_rel}"] = f"docs/{dst_rel}"
# Also handle: bare "knowledge/<file>" references (relative from .claude/)
for src_rel, dst_rel in MAPPING.items():
    REPLACEMENTS[f"knowledge/{src_rel}"] = f"docs/{dst_rel}"

# ---- Step 5: define living-docs scope ----
SCAN_DIRS = [
    ".claude/agents", ".claude/flows", ".claude/skills",
    "apps/mcp-server/src/interface/mcp/tools",
    "docs/guides", "docs/architecture",
    "docs/policies", "docs/protocols", "docs/standards", "docs/references",
]
SCAN_FILES = [
    "CLAUDE.md", "README.md",
    "docs/ARCHITECTURE.md", "docs/AI_TEAM_DESIGN.md",
    "docs/AGENT_CREATION_GUIDE.md", "docs/GLOSSARY_VI.md",
    "docs/SPRINT_GOAL.md", "docs/WORK.md", "docs/TASKS.md",
]
EXCLUDE_PARTS = {"node_modules", "_archive", "worktrees", ".git"}

def in_scope(p: Path) -> bool:
    if any(part in EXCLUDE_PARTS for part in p.parts): return False
    if p.suffix not in (".md", ".ts", ".json"): return False
    return True

def collect_targets():
    seen = set()
    for d in SCAN_DIRS:
        for f in (ROOT / d).rglob("*"):
            if f.is_file() and in_scope(f):
                seen.add(f)
    for f in SCAN_FILES:
        p = ROOT / f
        if p.exists(): seen.add(p)
    return sorted(seen)

# ---- Step 6: apply replacements ----
targets = collect_targets()
print(f"✓ scope: {len(targets)} files")

edited = 0
total_subs = 0
for f in targets:
    try:
        text = f.read_text(encoding="utf-8")
    except Exception as e:
        print(f"  skip {f}: {e}"); continue
    orig = text
    subs_here = 0
    for old, new in REPLACEMENTS.items():
        if old in text:
            count = text.count(old)
            text = text.replace(old, new)
            subs_here += count
    if text != orig:
        f.write_text(text, encoding="utf-8")
        edited += 1
        total_subs += subs_here

print(f"✓ rewrote {total_subs} references across {edited} files")

# ---- Step 7: remove empty .claude/knowledge ----
kdir = ROOT / ".claude/knowledge"
if kdir.exists():
    leftovers = list(kdir.rglob("*"))
    leftovers = [p for p in leftovers if p.is_file()]
    if leftovers:
        print(f"⚠ leftovers in .claude/knowledge: {leftovers}")
    else:
        # rmdir nested then top
        for sub in sorted(kdir.glob("**/*"), reverse=True):
            if sub.is_dir(): sub.rmdir()
        kdir.rmdir()
        print("✓ removed empty .claude/knowledge/")

# ---- Step 8: residual check ----
import subprocess as sp
r = sp.run(["grep", "-rE", r"\.claude/knowledge/", "--include=*.md", "--include=*.ts", "--include=*.json",
            ".claude", "apps", "docs/guides", "docs/architecture",
            "docs/policies", "docs/protocols", "docs/standards", "docs/references",
            "CLAUDE.md"],
           capture_output=True, text=True)
residuals = [l for l in r.stdout.splitlines() if l.strip()]
# filter out residual residing in historical scope (architecture-briefs/handoffs/etc.) — should be none in scan dirs anyway
print(f"residual .claude/knowledge/ refs in living scope: {len(residuals)}")
if residuals[:5]:
    for l in residuals[:5]: print("   ", l)

print("\n=== DONE ===")
