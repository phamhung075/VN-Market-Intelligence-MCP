# TASK 215 — fix(push-foreign-flow): error message "Bad Request" → "Invalid JSON"

## TLDR

Single-line fix. Aligns push-foreign-flow catch block error string with all other push endpoints.

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/server.ts   # line 734: "Bad Request" -> "Invalid JSON"

tests_written: []   # no new test — existing test 1132 already covers this assertion

tests_skipped: []

tsc_clean: true
full_suite_pass: true   # 5780 pass / 0 fail
