# SEALED — P2-J rag-service G10 Injection Record

**WARNING: DO NOT READ UNTIL FIX IS COMPLETE (blind-fix discipline per PO)**
**This file is QA-only until dev-rag-service confirms GREEN and QA verifies cycle count.**

---

## Injection Metadata

```
sealed_at: 2026-05-24
sealed_by: qa cycle-98
pre_inject_tag: rag-pre-inject → 8b2dbf30742adbc35946d813bb00e77e8edf7f12
injection_commit: 12d2381c
```

## Exact Bug — SEALED

```
file: apps/rag-service/domain/primitive/top_k_selector/top_k_selector.py
line: 30
original_literal: results[:k]
injected_literal: results[k:]
bug_class: off-by-one slice direction (returns tail instead of head)
```

The single-character change was `:k` → `k:` in the list slice. This causes
`select_top_k` to return the tail of the list after position k, instead of the first
k elements. For a 3-element list with k=2, actual result is `[doc-3]` instead of
`[doc-1, doc-2]`.

## Scenarios That Go RED

### Primitive tier (sandbox --tier=primitive --scenario=all)
Exit code: 1 | PASS: 13 | FAIL: 3

All 3 top_k_selector scenarios fail:
1. `golden.json` — k=2 from 3 elements: actual `[doc-3]` vs expected `[doc-1, doc-2]`
2. `edge_k_equals_len.json` — k=1 from 1 element: actual `[]` vs expected `[doc-1]`
3. `failure_k_exceeds_len.json` — k=5 from 3 elements: actual `[]` vs expected all 3

### Module tier (sandbox --tier=module --scenario=all)
Exit code: 1 | PASS: 1 | FAIL: 1

Module golden FAILS (top_k_selector is called in the pipeline):
- `module_golden.json`: actual `top_k_ids: []` vs expected `top_k_ids: ["doc-1"]`

### Dashboard (dash-check.py)
Exit code: 1 | PASS: 22 | FAIL: 2

RED cards:
- `trace-top-k-selector-golden`: passed=False
- `trace-module-full-golden`: passed=False

## Coupling Note (G11 Trial-1 Evidence)

The module golden scenario ALSO goes RED during this injection (module calls top_k_selector
via the retrieval pipeline). This provides Trial-1 coupling evidence for G11:
- primitive top_k_selector RED → module retrieval golden RED
- Outcome-(a): single-edit fix to top_k_selector.py will restore BOTH primitive
  AND module scenarios to GREEN

## Revert Point

```bash
git checkout rag-pre-inject -- apps/rag-service/domain/primitive/top_k_selector/top_k_selector.py
```
Or: restore `results[k:]` → `results[:k]` on line 30 of top_k_selector.py.

## Verification Checklist (QA post-fix)

- [ ] dev-rag-service found and fixed the bug
- [ ] fix_commit SHA recorded
- [ ] sandbox primitive --scenario=all: 16/16 PASS exit 0
- [ ] sandbox module --scenario=all: 2/2 PASS exit 0
- [ ] dash-check.py: exit 0, 0 FAIL
- [ ] cycle_count <= 2
- [ ] G11 Trial-1 evidence: was module golden RED during injection window? YES (confirmed above)
```
