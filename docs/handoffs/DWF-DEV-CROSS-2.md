---
sprint: DYN-WF-FOUNDATION
task: DWF-DEV-CROSS-2
branch: task/dwf-dev-cross-2-routing-policy
size: S
zone: developer
depends_on: [DWF-DEV-CROSS-1]
blocks: [DWF-DEV-CROSS-4]
---

# DWF-DEV-CROSS-2 — Routing-Policy.json Creation

## TLDR

Create `docs/data/routing-policy.json` as a deterministic, read-only SSOT mapping signal envelopes `(type, severity, zone, ticker)` to target agents. Phase 0 deliverable (consumed by nothing yet — purely an infrastructure SSOT built for Phase 3). Unblocks DWF-DEV-CROSS-4 (Phase 2 leader lock rewrite).

## [PM] Planning Context

**Zone:** `developer` (cross-service)

**Acceptance Criteria:**

- [ ] **AC-P0-2-1:** File exists at `docs/data/routing-policy.json` and parses as valid JSON.
- [ ] **AC-P0-2-2:** Every distinct `(type, severity, zone)` combination from `docs/data/system-map.json` signal types is covered by at least one rule (wildcard coverage acceptable).
- [ ] **AC-P0-2-3:** A catch-all rule (`type:"*", severity:"*", zone:"*", ticker:"*"`) exists as the last entry and routes to `po`.
- [ ] **AC-P0-2-4:** No existing code file imports or reads `routing-policy.json` (grep `routing-policy` in `apps/` returns zero hits).

**Files to read first:**

- `docs/architecture-briefs/2026-05-30-dyn-wf-foundation.md` § routing-policy.json Design (rule schema, rule set, agent ids, channel mapping)
- `docs/REQ_DYN-WF-FOUNDATION.md` § FR-P0-2 (SSOT contract, wildcard schema)
- `docs/data/system-map.json` (signal_types, agent_ids, telegram channels for mapping validation)

**Files to create:**

- `docs/data/routing-policy.json` — Deterministic routing table with the following structure:
  ```json
  {
    "routing_policy": [
      {
        "type": "price_alert",
        "severity": "high",
        "zone": "*",
        "ticker": "*",
        "target_agents": ["alert-commander"],
        "channel": "<channel_id>",
        "description": "High-severity price alerts → alert-commander"
      },
      ... (more rules per design below)
      {
        "type": "*",
        "severity": "*",
        "zone": "*",
        "ticker": "*",
        "target_agents": ["po"],
        "channel": "<work_channel_id>",
        "description": "Catch-all fallback"
      }
    ]
  }
  ```

**Rule set (Phase 0 — read-only, nothing consumes it yet):**

Per architect brief routing-policy.json Design section, rules must cover:
- `type:"price_alert", severity:"high"` → `alert-commander`, channel `market`
- `type:"price_alert", severity:"medium"` → `market-watcher`, channel `market`
- `type:"macro_alert", severity:"*"` → `unified-agent`, channel `work`
- `type:"news_signal", severity:"*"` → `news-scout`, channel `work`
- `type:"bctc_signal", severity:"*"` → `po`, channel `work`
- `type:"regime_change", severity:"*"` → `unified-agent`, channel `market`
- Catch-all: `type:"*", severity:"*", zone:"*", ticker:"*"` → `po`, channel `work`

**Agent ids** (from `docs/data/system-map.json`):
- cowork zone: `unified-agent`, `market-watcher`, `news-scout`, `alert-commander`, `tran-ngoc-bau`
- dev zone: `po`, `ba`, `architect`, `pm`, `developer`, `qa`

**Files NOT to modify:**

- No production code should import or read this file in Phase 0
- File is infrastructure-only; consumption by dev-team or cowork flow is a Phase 3+ feature

**Dependencies:**

- Depends on DWF-DEV-CROSS-1 (prune completes first, logical ordering)
- Unblocked by DWF-DEV-MCP-2 (fence test, which will turn GREEN once this file exists)

**Knowledge needed:**

- `docs/architecture-briefs/2026-05-30-dyn-wf-foundation.md` § routing-policy.json Design (rule schema, signals, agents)
- `docs/data/system-map.json` (signal types, agent ids, channel definitions)
- JSON schema validation

**Implementation notes:**

1. **Rule evaluation:** First match wins. All fields support `"*"` wildcard.

2. **Rule order matters:** More specific rules should come before wildcards. Example ordering:
   - `type:"price_alert", severity:"high"` (most specific)
   - `type:"price_alert", severity:"*"` (less specific)
   - `type:"*", severity:"*"` (least specific)

3. **Catch-all placement:** The catch-all rule MUST be the last entry. No rules after it will ever match.

4. **Validation:**
   ```bash
   jq . docs/data/routing-policy.json > /dev/null
   # Should exit 0 (valid JSON)
   
   jq '.routing_policy | length' docs/data/routing-policy.json
   # Should return rule count
   
   jq '.routing_policy[-1]' docs/data/routing-policy.json
   # Should show catch-all (last rule)
   
   grep -r "routing-policy" apps/
   # Should return 0 (no code imports)
   ```

5. **Coverage check (AC-P0-2-2):**
   - Read `docs/data/system-map.json`, extract all signal types
   - For each type, verify at least one rule in routing-policy.json matches it (directly or via wildcard)
   - Document coverage in a comment within the JSON or in a separate coverage matrix

6. **Ticker-specific rules (optional):**
   - Schema supports ticker field (e.g., route VNH alerts to agriculture zone)
   - Phase 0 does not require ticker-specific rules; use `"*"` for all
   - Future phases can add ticker rows without schema migration

---

## RETURN

Upon completion, developer will commit with trailers:

```
feat(data): add routing-policy.json SSOT

Create deterministic routing table mapping signal envelopes (type, severity, zone, ticker)
to target agents + channels. First-match-wins rule evaluation. Catch-all routes to PO.
Phase 0 deliverable (consumed by nothing yet; Phase 3+ will use for adaptive dispatch).
No code imports this file in Phase 0.

Task: DWF-DEV-CROSS-2
AC: AC-P0-2-1, AC-P0-2-2, AC-P0-2-3, AC-P0-2-4
```

DWF-DEV-MCP-2 (fence test) will turn GREEN once this file exists and is committed.
Then PM will unblock DWF-DEV-CROSS-4 (Phase 2 leader lock rewrite).
