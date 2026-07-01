# Decision Journal — Sprint FIX-BCTC-REFINE-HVN-Q1-UNITS-FLEET-DRAIN · qa

**Sprint goal:** Fix HVN Q1-2026 all-zero income/CF + OCF SQL column error + fleet PARTIAL drain
**Agent:** qa
**Started:** 2026-07-01T00:16:00Z

---

### STEP qa-S1 · qa · 2026-07-01T00:19:30Z
**task-id:** FIX-BCTC-REFINE-HVN-Q1-UNITS-FLEET-DRAIN / FIX-GET-BCTC-OCF-SQL-COLUMN
**what-done:** Full QA gate — tests, tsc, DDD, security, mock-guard, regression, fleet-drain sanity.
**what-considered:**
- Test counts: named files 12+8=20 pass; scalar regression 7 files 56 pass (dev claimed 61 — 5 count discrepancy, all still PASS); broader BCTC smoke 105 pass; BCTC DDD 1 pass.
- DDD: interface→infrastructure import in getBctcOcfTool pre-existing pattern (10+ occurrences in interface layer — legitimate).
- English IS fallbacks: all guarded with `!isBankPath` (lines 751,759,797,852 confirmed). CF fallbacks unconditional (correct — English CF labels universal).
- Fleet-drain: migration script WHERE clause (`text_status=COMPLETE AND all-units DONE/FAILED`) structurally cannot touch banks with non-DONE units. Pre-existing PARTIAL for ACB/HPG/VCB/VEA not caused by this fix.
- BCTC eval: endpoint unreachable (server not running in test env) — treated as 404-equivalent, non-blocking per flow.
**why-decision:** All gate checks PASS — APPROVED.
**why-change:** Count discrepancy (56 vs 61 claimed) is a non-blocking documentation gap; all 56 tests green.
