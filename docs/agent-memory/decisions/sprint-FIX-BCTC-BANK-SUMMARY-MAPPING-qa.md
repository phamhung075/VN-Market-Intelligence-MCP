# Decision Journal — Sprint FIX-BCTC-BANK-SUMMARY-MAPPING · qa

**Sprint goal:** W4 bank total_assets mapping fixtures + total_liabilities exclusion fix; generic markdown row-repair for corrupted bank-form rows.
**Agent:** qa
**Started:** 2026-07-02T01:07:00Z

---

### STEP qa-S1 · qa · 2026-07-02T01:10:00Z
**task-id:** CLEAN-DELETE-STRAY-BUN-CACHE-MCP-SERVER
**what-done:** Deleted stray untracked bun install cache dir `apps/mcp-server/~` (26M, gitignored via .gitignore:5) after passing all 3 RAW pre-checks (dir exists+size, no tracked files, ignore-match confirmed).
**what-considered:**
- rm -rf quoted+./-prefixed path — only safe option, prevents tilde shell-expansion to $HOME
- leave in place — rejected: sole source of mock-guard --full CAUTION-block noise (ajv/path-key/zod bundled TODOs), physical dead debt
**why-decision:** Pre-checks all green; deletion is reversible via bun install if ever needed; zero risk to tracked source.
**why-change:** no change — matched dispatcher-issued steps exactly.
