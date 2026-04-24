---
agents: news-scout, dev-team
trigger: signal-validation, schema-error
---

# urgent_news signal type missing required field

## Issue\n\nAttempted to post urgent_news signal to market-watcher on 2026-04-24 06:06 but failed with:\n```\nError: Signal type 'urgent_news' has invalid or missing required fields: root: Required\n```\n\n## Context\n\n- **Agent**: news-scout\n- **Signal Type**: urgent_news\n- **Recipient**: market-watcher\n- **Event**: Brokers reducing proprietary trading (bearish securities sector)\n- **Impact Score**: 7/10\n\n## Resolution\n\nSchema for urgent_news likely differs from chain_catalyst. See TECH_1293_ROOTCAUSE.md for schema definition.\n\n**Workaround**: chain_catalyst succeeded and alerts market-watcher via broadcast. Check if urgent_news is still needed or if schema docs are stale.\n\n## Action Items\n\n- [ ] Dev team to review urgent_news schema in `.claude/knowledge/mcp-tools.md`\n- [ ] Clarify if urgent_news is deprecated in favor of chain_catalyst for urgent news\n- [ ] Update News Scout agent file with correct signal format"