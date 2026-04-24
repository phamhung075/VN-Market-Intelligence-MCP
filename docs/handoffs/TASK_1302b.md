# TASK_1302b — Migrate to Domain Text Utils (GREEN Phase)

**Sprint:** 1302
**Branch:** main
**Status:** APPROVED

## files_actually_modified

- src/domain/services/newsNormalizer.ts (lines 23, 857)
- src/domain/services/policyImpactMapper.ts (lines 17, 229)
- src/infrastructure/adapters/analysisFormatters.ts (DELETED)

## Summary

Migrated two domain services off infrastructure import. Both now import
truncateNewsSummary / truncatePolicySummary from domain/services/textUtils.js.
analysisFormatters.ts deleted; 0 references remain.

---

## [QA] Review Record

verdict: APPROVED
blocking_issues: []
non_blocking: []

files_confirmed_clean:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/newsNormalizer.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/policyImpactMapper.ts

merge_commit: n/a (branch = main)
