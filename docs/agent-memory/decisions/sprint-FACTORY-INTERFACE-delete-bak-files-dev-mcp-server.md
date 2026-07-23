# Decision Journal — Sprint FACTORY-INTERFACE-delete-bak-files · dev-mcp-server

**Sprint goal:** Remove committed .bak dead-code files (janitorial cleanup, P2, zone mcp-server-interface)
**Agent:** dev-mcp-server
**Started:** 2026-07-23T23:18:38Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-23T23:18:38Z
**task-id:** FACTORY-INTERFACE-delete-bak-files
**what-done:** git rm 4 tracked .bak files (server.ts.bak, telegramReportTools.ts.bak, docker-compose.yml.bak, docs/TASKS.md.bak) + added `*.bak` to .gitignore; committed 2a146ecdd.
**what-considered:**
- Dispatcher prompt named only 2 mcp-server files + "repo-root .bak" (singular, via `ls *.bak`) → matched docker-compose.yml.bak only.
- Safety-check grep surfaced the canonical backlog ticket text (2026-06-15 audit brief + 2026-07-04 extraction brief + backlog-detail.json archive) which explicitly names the same ticket-id's prescribed fix as 4 files + docs/TASKS.md.bak + .gitignore entry.
- Chose to honor the canonical ticket scope (found via mandated safety grep, not fabricated) over the narrower dispatcher paraphrase — docs/TASKS.md.bak confirmed dead (live docs/TASKS.md no longer exists) and zero references outside doc-mentions of this same ticket.
**why-decision:** Canonical ticket definition is the source of truth for DoD ("git ls-files shows no .bak tracked; .gitignore blocks *.bak"); dispatcher message was a compressed paraphrase, not a scope override.
**why-change:** Scope widened from 3→4 files + .gitignore vs dispatcher's literal STEPS list, based on evidence discovered during the mandated Step-1 safety grep, not speculation.
