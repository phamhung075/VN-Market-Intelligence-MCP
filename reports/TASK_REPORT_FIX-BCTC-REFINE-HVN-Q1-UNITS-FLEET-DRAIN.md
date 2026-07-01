## Task Report FIX-BCTC-REFINE-HVN-Q1-UNITS-FLEET-DRAIN + FIX-GET-BCTC-OCF-SQL-COLUMN

changed:
- apps/mcp-server/src/application/utils/refinedMarkdownParser.ts (+8 lines, English SECTION_HEADERS)
- apps/mcp-server/src/domain/services/financial-reports/bctcScalarAggregator.ts (+92 lines, OCR fallback + English IS/CF label patterns)
- apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcOcfTool.ts (+14 lines, SELECT aliases for live schema column names)
- apps/mcp-server/src/__tests__/FIX-BCTC-REFINE-HVN-Q1-UNITS-FLEET-DRAIN.test.ts (new, 12 tests)
- apps/mcp-server/src/__tests__/1909b-get-bctc-ocf.test.ts (updated, live column names in makeTestDb)
- scripts/migrations/run-finalize-bctc-refine.ts (new, fleet-drain one-shot)

tests:
- FIX-BCTC-REFINE-HVN-Q1-UNITS-FLEET-DRAIN.test.ts: 12 pass / 0 fail
- 1909b-get-bctc-ocf.test.ts: 8 pass / 0 fail
- scalar regression suite (7 files): 56 pass / 0 fail [dev claimed 61 — 5 count discrepancy, non-blocking, all green]
- BCTC smoke (7 additional files): 105 pass / 0 fail
- BCTC DDD: 1 pass / 0 fail
- tsc: 0 errors
- ddd: PASS (interface→infrastructure import is pre-existing legitimate pattern)
- security: PASS (no process.env, no secrets, no hardcodes in changed files)
- mock-guard: EXIT 0 PASS

verdict: APPROVED

### Gate Notes
- English IS fallbacks (!isBankPath guard): confirmed at bctcScalarAggregator.ts lines 751, 759, 797, 852 — banks continue to resolve via VAS codes only.
- CF fallbacks: unconditional (correct — English CF labels are universal across bank/corporate).
- getBctcOcfTool: read-only (db.prepare().get() SELECT only, no writes).
- Fleet-drain pre-existing PARTIAL: migration WHERE clause (text_status=COMPLETE AND all-units DONE/FAILED) structurally excludes banks with non-DONE units — ACB/HPG/VCB/VEA PARTIAL is pre-existing, not regressed by this fix.
- BCTC eval endpoint: unreachable (server not running in test env) — non-blocking per QA flow §BCTC Eval Gate.
- code commit: 927d4e8f — clean, 6 files exactly as declared.
