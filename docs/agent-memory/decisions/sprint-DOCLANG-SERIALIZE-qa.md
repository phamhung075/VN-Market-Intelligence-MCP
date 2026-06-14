---
agent: qa
sprint: DOCLANG-SERIALIZE
date: 2026-06-14
---

## Decision Journal — DOCLANG-SERIALIZE / QA

### Entry 1

**task-id:** DOCLANG-T1-DOMAIN  
**commit:** 2d79baed  
**verdict:** APPROVED  
**timestamp:** 2026-06-14T12:00:00Z

**what-considered:**
- 7 AC against live code in ports.py (L583-L611) and config.py (L20, L32)
- Pytest suite: 2 failed / 968 passed (raw summary line from terminal)
- DDD scan: zero real infra imports in ports.py (grep hits are docstring-only comments)
- Security scan: no process.env (Python file), no hardcoded secrets
- Additive-only: diff is exactly 1 line added to module docstring bullet list; DocLangWritePort class + config field landed via scaffold 5d121989
- 2 failing tests both in integration/ and both caused by missing PDF fixture at /app/data/pdfs/ (container path not present on host) — neither references ports.py, DocLangWritePort, or doclang_output_dir in any grep
- No BCTC eval gate triggered (no report_id in scope; T1 is pure interface, zero DB writes)

**why-change:** no change from plan — all checks green, failures are pre-existing fixture/env, not T1 regressions

**only-path:** all AC green + test failures confirmed pre-existing and unrelated → APPROVED

**note on dev-claimed count:** Dev reported 3 failed/967 passed; actual run = 2 failed/968 passed. Count difference does not affect verdict (both failures remain env/fixture, none touch T1 code).
