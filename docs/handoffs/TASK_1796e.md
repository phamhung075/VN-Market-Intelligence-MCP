# TASK 1796e — Add DAG entry to docs/data/stock-classification.json

**Sprint:** 1796
**Wave:** 1 (parallel)
**Type:** FIX
**Priority:** P2
**Owner:** developer
**Estimated effort:** ~30 min

---

## Context

JANITOR-012 (done in Sprint 1796 pre-work) reclassified DRC (Da Nang Rubber Group) sector from pharma to machinery. The stock-classification.json DAG file must be updated to reflect this correction.

---

## Acceptance Criteria

1. `docs/data/stock-classification.json` contains a correct entry for DRC with sector = `machinery` (not `pharma` or any other value).
2. The JSON file remains valid (parseable by `JSON.parse`).
3. No other ticker entries are modified unintentionally.
4. Cross-check: the entry must be consistent with the sector assignment in `sectorPeers.ts` (Task 1796f adds machinery sector there — coordinate if needed, but this task only touches the JSON file).

---

## Files

- Primary: `docs/data/stock-classification.json`

---

## Dependencies

None — Wave 1, no blocking tasks. (Coordinate with 1796f on sector naming but do not block on it.)

---

## Definition of Done

- [ ] `jq '.[] | select(.ticker == "DRC") | .sector' docs/data/stock-classification.json` returns `"machinery"`
- [ ] `node -e "JSON.parse(require('fs').readFileSync('docs/data/stock-classification.json','utf8'))"` exits 0
- [ ] No other existing entries changed
- [ ] Commit: `task(1796e): add DAG entry DRC sector=machinery in stock-classification.json`
