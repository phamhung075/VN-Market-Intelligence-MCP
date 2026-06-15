#!/usr/bin/env bash
# F-BOP-QUERY-RECON STEP1 — SBV BOP OData query semantics probe
# Run on: Vinahost VPS (125.212.251.27) via SSH — SBV is geo-blocked from outside Vietnam
# Purpose: Verify working OData filter + expose 'articles' vs 'items' key bug in parsers_vmt_bop.go
# Date: 2026-06-15
#
# KEY FINDINGS (run from VPS):
#   - API response root key is "articles", NOT "items" (parsers_vmt_bop.go uses json:"items" → 0 parse)
#   - pageSize param is IGNORED by Liferay — always returns all matching records
#   - Date48362898 holds mid-quarter reference dates (NOT quarter-end): 2025-12-25, 2025-08-12, etc.
#   - Quarter-window date-range filters (e.g. 2026-01-01..2026-03-31) miss Q4 2025 data (date=2025-12-25)
#   - Generic contract: filter=status eq 0 and Date48362898 gt '' → returns all 4 quarters, pick articles[0]
#   - Duplicate articleIds appear (~15 rows, 4 unique IDs) due to Liferay locale multi-language rows
#
# WORKING RECIPE:
#   GET https://www.sbv.gov.vn/o/article/v1.0/articles
#     ?scopeKey=20117
#     &contentStructureId=10063168
#     &pageSize=100
#     &filter=status%20eq%200%20and%20Date48362898%20gt%20%27%27
#     &sort=datePublished%3Adesc
#   Headers: Accept: application/json, User-Agent: browser-UA
#   Parse: response.articles[0] (not response.items[0]) — deduplicate by articleId first

set -euo pipefail
CACERT=/etc/ssl/certs/ca-certificates.crt
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
BASE="https://www.sbv.gov.vn/o/article/v1.0/articles"

# --- Probe A: exact Go current-quarter filter (Q2 2026) — expected: 0 results ---
echo "=== Probe A: Q2 2026 filter (current quarter) — expect 0 ==="
FILTER_A="status eq 0 and Date48362898 gt '' and Date48362898 ge '2026-04-01' and Date48362898 le '2026-06-30'"
ENC_A=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$FILTER_A")
curl -s --cacert "$CACERT" -L \
  -H "User-Agent: $UA" -H "Accept: application/json" \
  "${BASE}?scopeKey=20117&contentStructureId=10063168&pageSize=100&filter=${ENC_A}" \
  | python3 -c "import sys,json; j=json.loads(sys.stdin.read()); print('totalCount:', j.get('totalCount'), '| articles:', len(j.get('articles',[])))"

echo ""

# --- Probe B: exact Go prev-quarter filter (Q1 2026) — expected: 0 results ---
echo "=== Probe B: Q1 2026 filter (prev quarter) — expect 0 ==="
FILTER_B="status eq 0 and Date48362898 gt '' and Date48362898 ge '2026-01-01' and Date48362898 le '2026-03-31'"
ENC_B=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$FILTER_B")
curl -s --cacert "$CACERT" -L \
  -H "User-Agent: $UA" -H "Accept: application/json" \
  "${BASE}?scopeKey=20117&contentStructureId=10063168&pageSize=100&filter=${ENC_B}" \
  | python3 -c "import sys,json; j=json.loads(sys.stdin.read()); print('totalCount:', j.get('totalCount'), '| articles:', len(j.get('articles',[])))"

echo ""

# --- Probe C: WORKING generic filter — no date-range, just status+non-empty date field ---
echo "=== Probe C: GENERIC working filter — status eq 0 and Date48362898 gt '' ==="
FILTER_C="status eq 0 and Date48362898 gt ''"
ENC_C=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$FILTER_C")
SORT="datePublished%3Adesc"
curl -s --cacert "$CACERT" -L \
  -H "User-Agent: $UA" -H "Accept: application/json" \
  "${BASE}?scopeKey=20117&contentStructureId=10063168&pageSize=100&filter=${ENC_C}&sort=${SORT}" \
  | python3 -c "
import sys,json
j=json.loads(sys.stdin.read())
arts=j.get('articles',[])
print('totalCount:', j.get('totalCount'), '| articles:', len(arts))
seen=set(); unique=[]
for a in arts:
    aid=a.get('articleId')
    if aid not in seen:
        seen.add(aid); unique.append(a)
print('Unique articleIds:', len(unique))
if unique:
    a=unique[0]; flds=a.get('fields',{})
    print('Latest: id=%s Date48362898=%s Quarter=%s published=%s' % (
        a.get('articleId'), flds.get('Date48362898'), flds.get('Select02257401'), a.get('datePublished','')))
    print('  canCanVangLai=%s canCanTongThe=%s loiVaSaiSot=%s' % (
        flds.get('canCanVangLai'), flds.get('canCanTongThe'), flds.get('loiVaSaiSot')))
"

echo ""
echo "=== Probe D: confirm root key is 'articles' not 'items' ==="
curl -s --cacert "$CACERT" -L \
  -H "User-Agent: $UA" -H "Accept: application/json" \
  "${BASE}?scopeKey=20117&contentStructureId=10063168&pageSize=100&filter=${ENC_C}" \
  | python3 -c "
import sys,json
j=json.loads(sys.stdin.read())
print('items key present?', 'items' in j)
print('articles key present?', 'articles' in j)
print('ALL keys:', list(j.keys()))
"
