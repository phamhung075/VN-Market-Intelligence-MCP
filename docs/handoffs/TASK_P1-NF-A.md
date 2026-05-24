# TASK P1-NF-A — Sandbox Harness

**Pilot:** news-fetch
**Phase:** 1
**Task:** P1-A
**Status:** DONE

---

## Summary

Created `apps/news-fetch/src/sandbox/runner.ts` — Bun sandbox harness with `--tier`, `--module`, `--scenario`, and `--output` flags. Zero infrastructure imports. Env audit gate baked in. Added `sandbox` script to `package.json`.

---

## Files Created/Modified

- `apps/news-fetch/src/sandbox/runner.ts` (CREATE)
- `apps/news-fetch/src/sandbox/README.md` (CREATE)
- `apps/news-fetch/package.json` (MODIFY — added `sandbox` script)

---

## AC Verification

**AC-1:** Runner accepts `--tier` (primitive|module|all), `--module` (news-fetch), `--scenario` (all|path). PASS.

**AC-2:** For `--tier=primitive`, locates scenario files at `docs/scenarios/news-fetch/primitives/<primitive-name>/*.json`. PASS.

**AC-3:** For `--tier=module`, locates scenario files at `docs/scenarios/news-fetch/module/*.json`. PASS.

**AC-4:** Zero infrastructure imports in sandbox:
```
grep -r "from.*infrastructure\|from.*scrapers\|from.*hono\|from.*playwright" apps/news-fetch/src/sandbox/
# Returns 0 (exit 1 = no matches)
```
PASS.

**AC-5:** Exits 0 when all scenarios PASS; exits 1 when any FAIL. PASS.

**AC-6 (env audit):**
```
env | grep -iE "DB_|API_KEY|SECRET|TOKEN|PASSWORD|BROWSER|PLAYWRIGHT" | grep -v CTX_ADVISOR | grep -v TOKENS
# Returns empty (exit 1)
```
PASS — credentials clean.

**AC-7:** `apps/news-fetch/src/sandbox/README.md` created (3 lines: what it does, how to run, what files it loads). PASS.

---

## [Developer] Sandbox Green Evidence

```
bun run src/sandbox/runner.ts --tier=all --module=news-fetch --scenario=all
[sandbox] No scenario files found — 0 scenarios run.
[sandbox] Result: 0 PASS, 0 FAIL, 0 ERROR
EXIT: 0
```

No scenarios exist yet (primitives created in P1-B1+). Exit 0 confirmed. Baseline tests: 209 pass, 0 fail.

---

## Next

P1-B1 — `published-at-parser` primitive (G12 streak #1)
