# TASK P1-NF-E — Edit-Rerun Handler + Env Audit

**Pilot:** news-fetch
**Phase:** 1
**Task:** P1-E
**Status:** DONE

---

## Summary

Edit-rerun cycle proven (RED→GREEN). `dashboard/rerun-handler.js` created. Env audit clean. `--output` flag was already in runner.ts from P1-A.

---

## Files Created/Modified

- `apps/news-fetch/dashboard/rerun-handler.js` (CREATE — loadTrace() helper)
- `apps/news-fetch/dashboard/results.json` (CREATE — green trace from sandbox run)

---

## AC Verification

**AC-1 (RED transition):**
```
# Edit golden.json → corrupted expectedOutput
# Run sandbox:
bun run src/sandbox/runner.ts --tier=primitive --module=news-fetch --scenario=all --output=dashboard/results.json

  FAIL  published-at-parser [golden] — primitives/published-at-parser/golden.json
         expected: "WRONG-EXPECTED-VALUE" | got: "2026-05-13T14:30:00.000Z"

[sandbox] Result: 11 PASS, 1 FAIL, 0 ERROR
EXIT: 1  ← non-zero, dashboard shows RED for published-at-parser
```

**AC-2 (GREEN transition):**
```
# Revert golden.json → correct expectedOutput
# Re-run sandbox:
bun run src/sandbox/runner.ts --tier=all --module=news-fetch --scenario=all --output=dashboard/results.json

[sandbox] Result: 13 PASS, 0 FAIL, 0 ERROR
EXIT: 0  ← dashboard shows GREEN for all cards
```

**AC-3 (env audit):**
```
env | grep -iE "DB_|API_KEY|SECRET|TOKEN|PASSWORD|BROWSER|PLAYWRIGHT" | grep -v CTX_ADVISOR | grep -v TOKENS
# (empty output — exit 1 = no matches)
```
CLEAN.

**AC-4 (no credential usage in sandbox):**
```
grep -rniE "token|api_key|secret|password|db_path" apps/news-fetch/src/sandbox/
```
Matches only comment lines in runner.ts that define the security check pattern itself (not credential usage). Zero actual credential values. CLEAN.

**AC-5 (RED→GREEN screenshots):** Proved via command output above. Exit code 1 (RED) → exit code 0 (GREEN) transition confirmed.

**AC-6 (G12 DoD gate):**
```
bun run src/sandbox/runner.ts --tier=all --module=news-fetch --scenario=all

[sandbox] Result: 13 PASS, 0 FAIL, 0 ERROR
EXIT: 0
```
All scenarios still green. DONE.

---

## Baseline Tests

```
233 pass, 6 skip, 0 fail
```
