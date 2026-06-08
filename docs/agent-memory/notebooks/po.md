# PO Notebook

## c · 2026-06-08T13:31Z — DFR-P2/P3 SSOT dedup + briefs APPROVED → ba

**Trigger:** Directed gate. Architect delivered P2/P3 blueprints. Fix SSOT dual-location + approve briefs + route ba.

**SSOT dedup (DJ-GATE-1, verify-raw):** active_sprints[23] (id=DEEPFETCH-RAG-REDESIGN) = AUTHORITATIVE (TODO/next_role=ba/blueprint refs); backlog[69]/[70] = STALE (next_role=architect). Atomic jq temp→rename, guards (non-empty + valid-JSON before mv). Deleted ONLY 2 backlog copies via `(.id∈{P2,P3} and next_role=="architect")|not`. **Post-write raw:** each DFR-P2/P3 EXACTLY ONCE (both @ active_sprints[23]); backlog 71→69; 11 distinct DFR ids intact (9 others untouched). Committed clean **93c0fc70**.

**Briefs APPROVED (read both; committed c0c894f7):**
- P2 (478L): 3-zone split + interface contracts A/B/C + state machine + 10 ACs. Guardrails all covered: caps 10/5, 4h expiry, source_url UNIQUE+INSERT-OR-IGNORE, NO silent delete (_deep suffix), VPS plain-HTTP, Playwright main-only, no hardcode (sector kw=system-map, caps=mcp.config), no branches.
- P3 (306L): FTS 2-call + RRF; LAZY-on-first + daily-rebuild (not startup=probe race / not on-write=O(corpus)); thin mcp-server hybrid?:bool opt-in. 8 ACs.
- Both kept TODO/next_role=ba.

**Sequencing on tasks (PM honor):** P2+P3 rag-service fully PARALLEL. Only mcp-server slices share ragHttpClient.ts (P2=ragIndex write block, P3=RagSearchRequest read block). **Sequence dev-mcp-server P3 slice AFTER P2 slice merges, OR commit-mutex-serialize.** rag-service P3 has NO P2 dep. Stored: `sequencing`(both) + `sequence_after`(P3) + `blocks`(P2).

**Router → dispatch BA** (decompose P2+P3 from blueprints). PO no nested-spawn.

**Carry-over:**
- Flow: ba → pm → dev-{mcp-server,vps-crawls,mainserver-crawls,rag-service} → qa. PM enforce P3-mcp-after-P2-mcp.
- QA P2: caps/daily-limits/4h-expiry actually ENFORCED + upsert-no-delete. QA P3: .vector().text() pattern + non-hybrid byte-identical.
- (prior) A20: /health=200 ≥15min under /extract before DONE. FIX-MACRO-REFRESH-DEAD: verify live refresh (fix b7ce338f) then PM DONE.
