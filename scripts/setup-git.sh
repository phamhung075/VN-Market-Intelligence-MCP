#!/bin/bash
# VN Market Intelligence MCP — Git Setup Script
# Run once in the project folder:  bash setup-git.sh
# ─────────────────────────────────────────────────────

set -e

echo "🚀 Initializing git repository..."

# Remove stale lock files left by interrupted git processes
rm -f .git/index.lock .git/refs/heads/master.lock .git/HEAD.lock 2>/dev/null || true

git init
git config user.email "daihung.pham@gmail.com"
git config user.name "Dai Hung PHAM"

# Rename default branch to main (ignore error if already named main)
git branch -m main 2>/dev/null || true

# Stage and commit only if there are no commits yet
if git rev-parse HEAD >/dev/null 2>&1; then
  echo "⚠ Repository already has commits — skipping initial commit"
else
  git add .
  git commit -m "feat(000): initial project structure

- Bun MCP server + tool stubs (src/)
- BCTC complete data model (bctc-schema.ts)
- Dev team: planner/coder/reviewer/fixer (DDD+TDD+Agile/Kanban)
- Kanban board TASKS.md (35 tasks, 5 columns)
- Task report template, project skills

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
fi

echo "✓ Initial commit done"
echo ""
echo "📌 Creating all task branches..."

BRANCHES=(
  # Foundation
  "task/001-project-setup"
  "task/002-db-schema"
  "task/003-env-config"

  # RAG Pipeline
  "task/011-rag-embeddings"
  "task/012-lancedb-store"
  "task/013-rag-retriever"
  "task/014-embedding-text-builder"

  # Infrastructure Fetchers
  "task/021-rss-cafef"
  "task/022-rss-vnexpress"
  "task/023-rss-reuters"
  "task/024-scraper-trading-economics"
  "task/025-yahoo-finance"
  "task/026-hose-prices"
  "task/027-hnx-prices"
  "task/028-sbv-macro"
  "task/029-ssc-scraper"
  "task/030-pdf-extractor"

  # BCTC Parser (Domain)
  "task/041-vn-number-parser"
  "task/042-bctc-balance-sheet"
  "task/043-bctc-income-stmt"
  "task/044-bctc-cashflow"
  "task/045-bctc-ratios"
  "task/046-period-delta"
  "task/047-bctc-orchestrator"
  "task/048-ssc-pipeline"

  # Analysis Engine (Domain)
  "task/061-news-normalizer"
  "task/062-cascade-engine"
  "task/063-signal-detector"
  "task/064-alert-generator"
  "task/065-pattern-matcher"
  "task/066-ai-summary"

  # MCP Server + Tools (Interface)
  "task/081-bun-mcp-server"
  "task/082-tool-watchlist"
  "task/083-tool-analysis"
  "task/084-tool-market"
  "task/085-tool-reports"
  "task/086-tool-alerts"

  # Scheduler (Interface)
  "task/101-job-morning-briefing"
  "task/102-job-news-poll"
  "task/103-job-market-scan"
  "task/104-job-ssc-check"
  "task/105-job-evening-summary"

  # Tests
  "task/121-test-bctc-edge-cases"
  "task/122-test-domain-services"
  "task/123-test-integration-mcp"
  "task/124-test-ssc-pipeline"
  "task/125-test-e2e-briefing"
)

for branch in "${BRANCHES[@]}"; do
  git branch "$branch" main
  echo "  ✓ $branch"
done

echo ""
echo "✅ Done! Summary:"
echo "   Branches created : $(git branch | wc -l) (including main)"
echo "   Current branch   : $(git branch --show-current)"
echo ""
echo "📋 To start working on the first task:"
echo "   git checkout task/001-project-setup"
echo "   # implement → bun test → bun tsc --noEmit → commit → notify Reviewer"
echo ""
echo "📖 Read TASKS.md for the full Kanban board"
echo "📖 Read CLAUDE.md for project context"
echo "📖 Read .claude/agents/ for team role instructions"
