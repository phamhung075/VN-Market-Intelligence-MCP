---
name: system-map-query
description: >
  SSOT query patterns for docs/data/system-map.json.
  Load when an agent needs service config, agent lists, zones, channels,
  data sources, or watchlist data. Use jq — never hardcode these values.
---
<!-- size-justification: 150L — SSOT query reference; 8 jq query groups (microservices, agents, zones, channels, data sources, watchlist, infrastructure) each with multiple named patterns; a query reference loses utility if split — agents need the full pattern set in one load -->

## SSOT File

```
docs/data/system-map.json
```

All structural system data lives here. If the value you need is in this file, **do not hardcode it — query it**.

---

## Query Patterns

### Microservices

```bash
# All service IDs
jq '[.project.microservices[].id]' docs/data/system-map.json

# Services by language
jq '[.project.microservices[] | select(.language=="go") | .id]' docs/data/system-map.json

# Service port by ID
jq '.project.microservices[] | select(.id=="mcp-server") | .port' docs/data/system-map.json

# Total MCP tool count
jq '.project.microservices[] | select(.id=="mcp-server") | .tools | length' docs/data/system-map.json

# Total cron count
jq '.project.microservices[] | select(.id=="mcp-server") | .crons | length' docs/data/system-map.json

# Find which service a tool belongs to
jq '.project.microservices[] | select(.tools[] == "get_macro_snapshot") | .id' docs/data/system-map.json

# Cron by name
jq '.project.microservices[0].crons[] | select(.name=="bctcReparseJob")' docs/data/system-map.json
```

### Agents

```bash
# All agent IDs
jq '[.project.agents[].id]' docs/data/system-map.json

# Agents by type (dev-core | dev-zone | cowork | ops)
jq '[.project.agents[] | select(.type=="cowork") | .id]' docs/data/system-map.json

# Zone specialist for a path
jq '.project.agents[] | select(.zone=="apps/mcp-server") | .id' docs/data/system-map.json

# Count by type
jq '[.project.agents[] | .type] | group_by(.) | map({type: .[0], count: length})' docs/data/system-map.json
```

### Zones

```bash
# Specialist for a zone
jq '.project.zones[] | select(.id=="technical-analysis") | .specialist' docs/data/system-map.json

# All zones with specialists
jq '[.project.zones[] | {zone: .id, specialist}]' docs/data/system-map.json

# Zone by file path prefix
jq '.project.zones[] | select(.path | startswith("apps/alert-engine"))' docs/data/system-map.json
```

### Channels

```bash
# All channel IDs
jq '[.project.channels[].id]' docs/data/system-map.json

# Allowed senders for market channel
jq '.project.channels[] | select(.id=="market") | .allowed_senders' docs/data/system-map.json

# Env var for a channel
jq '.project.channels[] | select(.id=="bug") | .env_var' docs/data/system-map.json
```

### Data Sources

```bash
# All geo-blocked sources
jq '[.project.data_sources[] | select(.geo_blocked==true) | .id]' docs/data/system-map.json

# VPS proxy routes only
jq '[.project.data_sources[] | select(.proxy=="vps") | {id, vps_path}]' docs/data/system-map.json

# Sources by category (price | bctc | news | macro | flow | regulatory | climate | exchange | procurement | sentiment | sector)
jq '[.project.data_sources[] | select(.category=="macro") | .id]' docs/data/system-map.json
```

### Watchlist

```bash
# Active tickers only
jq '[.project.watchlist[] | select(.active==true) | .ticker]' docs/data/system-map.json

# Tickers by sector (partial match)
jq '[.project.watchlist[] | select(.sector | test("Banking")) | .ticker]' docs/data/system-map.json

# Exchange filter
jq '[.project.watchlist[] | select(.exchange=="HOSE" and .active==true) | .ticker]' docs/data/system-map.json

# Sector distribution
jq '[.project.watchlist[] | select(.active==true) | .sector] | group_by(.) | map({sector: .[0], count: length})' docs/data/system-map.json
```

### Infrastructure

```bash
# VPS host
jq '.project.infrastructure.vps.host' docs/data/system-map.json

# VPS route path for a source
jq '.project.infrastructure.vps.routes[] | select(.source_id=="bctc-discover") | .path' docs/data/system-map.json

# All databases and their engines
jq '[.project.infrastructure.databases[] | {id, engine}]' docs/data/system-map.json

# Which services use a specific DB
jq '.project.infrastructure.databases[] | select(.id=="market") | .used_by' docs/data/system-map.json
```

---

## Update Protocol

When system state changes, update `docs/data/system-map.json` AND `docs/data/project-stats.json` (sprint/test counts).

| Change | Update field |
|---|---|
| New service added | `microservices[]` |
| New MCP tool | `microservices[id=mcp-server].tools[]` |
| New cron job | `microservices[id=mcp-server].crons[]` |
| New agent file | `agents[]` |
| New data source | `data_sources[]` |
| New VPS route | `infrastructure.vps.routes[]` and `data_sources[]` |
| Watchlist change | `watchlist[]` |

**Fail-loud:** If this skill cannot be loaded → agents fall back to reading `docs/data/system-map.json` directly with jq.
`fail_loud: false`
