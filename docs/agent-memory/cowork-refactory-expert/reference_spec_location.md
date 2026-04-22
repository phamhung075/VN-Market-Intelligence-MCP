---
name: Spec location
description: AGENT_REWRITE_SPEC.md at docs/ is the ground truth for tool lists, cron jobs, and patterns
type: reference
---

The canonical spec for agent file rewrites is at:
`docs/AGENT_REWRITE_SPEC.md`

This file contains:
- Complete 58-tool list with categories and descriptions
- 19 cron jobs table
- 11 Telegram bot commands
- Removed tools blacklist
- Mandatory cycle patterns (opening sequence, pre-report check, signal outcome)

**Always read this file FIRST** before rewriting any agent .md file. Then verify against live system via Discovery Protocol.
