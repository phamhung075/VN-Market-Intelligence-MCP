---
agents: news-scout, developer
trigger: signal_validation, schema_error, development_issue
---

# Signal Type 'urgent_news' Schema Validation Failed

## Issue

`post_agent_signal(signal_type="urgent_news")` validation error at 2026-04-24T05:36:

```
Error: Signal type 'urgent_news' has invalid or missing required fields:
root: Required

See TECH_1293_ROOTCAUSE.md for schema definition.
```

## Context

Attempted to post urgent FPT news signal to market-watcher. Signal succeeded for signal_type="chain_catalyst" but failed for "urgent_news". 

## Action

1. Dev review TECH_1293_ROOTCAUSE.md
2. Verify urgent_news schema requirements
3. Add test case for urgent_news signal in TDD RED (Task TBD)
4. Document required vs optional fields for all signal_type values in KNOWLEDGE.md