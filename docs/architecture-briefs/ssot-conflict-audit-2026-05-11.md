# SSOT Architecture Conflict Audit — 2026-05-11

## Status: Premature Audit

**⚠️ FINDING:** The mission assumes a new architecture SSOT with 32 files under `docs/architecture/global.md` + `docs/architecture/microservice/`. These files **do not exist yet** in git (checked: status, untracked, recent commits). Current architecture SSOT is **`docs/ARCHITECTURE.md`** (390 lines).

**Action:** Audit will be re-run once architect commits the 32-file SSOT. Proceeding with baseline conflict check of current docs.

---

## CONFLICTS (Current Docs vs Embedded Info)

### 1. Tool Count Drift

| File | Claims | Actual Source |
|------|--------|---------------|
| `README.md:77` | **112 MCP Tools (Phase 3 Complete)** | — |
| `docs/ARCHITECTURE.md:78` | **132 tools, 59 cron jobs** (MCP Server) | — |
| `docs/data/project-stats.json` | **SSOT for counts** | Pointer in tree-map.md ✓ |

**Conflict:** README claims 112, ARCHITECTURE claims 132. Neither points to `docs/data/project-stats.json` (the actual volatile SSOT).

**Recommended action:** Both docs should point: "See `docs/data/project-stats.json` for current tool/job counts." Remove hardcoded numbers from narrative text.

---

### 2. Microservice Port Mapping Inconsistency

| File | Service | Port | Status |
|------|---------|------|--------|
| `README.md:94` | stock-price | `5010→5000` (correct) | ✓ |
| `docs/ARCHITECTURE.md:38` | stock-price | `5010:5000` (colon notation) | ✓ |
| `restart-policy.md:42` | Stock Price (port 5000) | — (internal only) | ⚠️ Incomplete |

**Conflict:** Notation inconsistency (→ vs :) is minor, but `restart-policy.md` omits the external 5010 mapping, which could confuse operators.

**Recommended action:** Standardize notation to `5010:5000` (Docker Compose standard). Update `restart-policy.md` section 2 to include port mappings table.

---

### 3. VPS Microservice Architecture Duplication

| Reference | Location | Status |
|-----------|----------|--------|
| **BCTC Pull Pipeline** | `docs/ARCHITECTURE.md:310-320` (detailed) | ✓ SSOT |
| **BCTC Pull Pipeline** | `.claude/knowledge/bctc-extraction-runbook.md:7-19` (duplicated) | ⚠️ Duplicate of ARCHITECTURE.md content |
| **Price Proxy Flow** | `docs/ARCHITECTURE.md:284-308` (detailed) | ✓ SSOT |
| **Price Proxy Flow** | `restart-policy.md:51` (1-liner reference) | ✓ Pointer, not duplicate |

**Conflict:** `bctc-extraction-runbook.md` lines 7-19 repeat `ARCHITECTURE.md` lines 310-320 verbatim (architecture: pull-based). Runbook should reference, not duplicate.

**Recommended action:** In `bctc-extraction-runbook.md`, replace lines 7-19 with: "See `docs/ARCHITECTURE.md` § BCTC PDF Proxy (vn-bctc-fetch.service) — Task 1112 for full pipeline. This runbook covers diagnostics only."

---

## DUPLICATES (Identical Facts in 2+ Places)

### 1. Docker-Compose Restart Command

| File | Line | Text |
|------|------|------|
| `README.md:66-68` | Quoted block | `docker-compose down && docker-compose up -d && sleep 5` |
| `docs/ARCHITECTURE.md:53` | Quoted block | `docker-compose down && docker-compose up -d` (no sleep) |
| `restart-policy.md:10` | SSOT | `cd $PROJECT_ROOT && docker-compose down && docker-compose up -d && sleep 5` |

**Issue:** Three copies. `restart-policy.md` is designated SSOT in tree-map.md. README and ARCHITECTURE should shrink to pointers.

**Recommended action:** 
- In `README.md:66-68`, replace with: "See `.claude/knowledge/restart-policy.md` for the authoritative command."
- In `docs/ARCHITECTURE.md:53`, replace with: "Command: `docker-compose down && docker-compose up -d` (see `.claude/knowledge/restart-policy.md` for details)."

---

### 2. Microservices List

| File | Services Listed | Status |
|------|-----------------|--------|
| `README.md:90-100` | 9 services table | Duplicate |
| `docs/ARCHITECTURE.md:32-44` | 9 services table | Duplicate |
| `restart-policy.md:35-49` | 9 services tree | Duplicate |

All three are nearly identical. `docs/ARCHITECTURE.md` should be SSOT (most detailed). Others should link.

**Recommended action:** 
- Keep `docs/ARCHITECTURE.md:32-44` as SSOT.
- Replace `README.md:90-100` with: "See `docs/ARCHITECTURE.md` § Services (Phase 3 — Production) for the current service list."
- Replace `restart-policy.md:35-49` with reference + short tree for context.

---

## STALE (Old Docs Contradicting Current State)

### 1. AI_TEAM_DESIGN.md § Dev Team Restart (Lines 65)

**Text:** `Restart: docker-compose down && docker-compose up -d && sleep 5`

**Current reality:** Dev Team no longer runs manual restarts. This is **operator-only**, invoked by `restart-policy.md`. Agent/Dev Team flows do NOT call docker-compose directly.

**Status:** Misleading but not critical (document is descriptive, not prescriptive for agents). Mark for clarification.

**Recommended action:** Add footnote: "(Operator-only command. Agents invoke via standard flow restart procedures — see `.claude/knowledge/restart-policy.md`.)"

---

### 2. README.md § Daily Operation (Lines 153-160)

**Text:** Lists times like "08:00 Morning briefing", "22:00 Unified Coordinator quality review" (Vietnam time).

**Current reality:** Actual job counts and cron expressions are in `mcp.config.json` and `.claude/knowledge/cron-jobs.md`. README times are illustrative, not authoritative.

**Status:** Acceptable for user-facing docs. But should note: "Times are indicative. Exact schedule in `mcp.config.json` § scheduler."

**Recommended action:** Add line after table: "See `.claude/knowledge/cron-jobs.md` for authoritative cron job timings."

---

## POINTER GAPS (Missing Pointers to SSOT)

### 1. `README.md` Missing Pointer to Architecture SSOT

**Current:** Line 5 says "real-time VN stock intelligence" but never points to `docs/ARCHITECTURE.md` for system design.

**Recommended action:** Add under "## Architecture" heading: "Full architecture: see `docs/ARCHITECTURE.md`. High-level team design: `docs/AI_TEAM_DESIGN.md`."

---

### 2. `README.md` Service Descriptions Unmapped

**Current:** § Microservices Overview (lines 88-110) lists 9 services with 1-line roles. No pointer to detailed specs.

**Recommended action:** Add note: "Detailed service specs (APIs, inputs, outputs): TBD in `docs/architecture/microservice/<name>.md` (pending SSOT commit)."

---

### 3. Tool Registry Hardcoded vs Pointer

**Current:** 
- `README.md:176-192` embeds 112-tool count + examples
- Should point to `.claude/tools/package/<agent>.md` for per-agent tool lists

**Recommended action:** Replace hardcoded table with: "Active agents and their tool packages: `.claude/tools/package/<agent>.md`. Full tool catalog: `.claude/tools/list/`."

---

## CLEAN (Audited, No Conflicts)

- ✓ `docs/AGENT_CREATION_GUIDE.md` — guide file, no embedded architecture claims
- ✓ `docs/GLOSSARY_VI.md` — terminology only
- ✓ `docs/TASKS.md` — task board (data, not architecture)
- ✓ `docs/SPRINT_GOAL.md` — sprint vision (data, not architecture)
- ✓ `.claude/knowledge/tree-map.md` — explicitly this SSOT; no conflicts with other docs
- ✓ `.claude/knowledge/agent-roster.md` — agent definitions, not system architecture
- ✓ `.claude/knowledge/restart-policy.md` — designated SSOT for restart procedures; internally consistent
- ✓ `.claude/knowledge/cron-jobs.md` — cron reference (lazy-load pointer, correct)

---

## Summary Table

| Type | Count | Files Affected |
|------|-------|-----------------|
| **CONFLICTS** | 3 | README.md, docs/ARCHITECTURE.md, restart-policy.md |
| **DUPLICATES** | 2 | README.md + docs/ARCHITECTURE.md (restart cmd); README.md + docs/ARCHITECTURE.md + restart-policy.md (service list) |
| **STALE** | 2 | AI_TEAM_DESIGN.md (restart context), README.md (cron times) |
| **POINTER GAPS** | 3 | README.md missing architecture pointer; service specs unmapped; tool registry unmapped |
| **CLEAN** | 9 | (listed above) |

---

## Top 3 Most Load-Bearing Fixes

1. **Remove hardcoded tool/job counts from README.md + docs/ARCHITECTURE.md; add pointer to `docs/data/project-stats.json`.** (Fixes CONFLICTS #1 + DUPLICATES). Impact: High. Prevents future count drift in docs.

2. **Collapse BCTC pipeline duplication: Keep `docs/ARCHITECTURE.md` as SSOT; shrink `bctc-extraction-runbook.md` to diagnostics only with reference link.** (Fixes DUPLICATES #2). Impact: Medium. Reduces maintenance burden, clarifies reference hierarchy.

3. **Add architecture cross-references in README.md (line 5 + line 88).** (Fixes POINTER GAPS #1-2). Impact: Medium. Users/developers will find SSOT docs without ad-hoc searching.

---

## Blockers for New 32-File SSOT Commit

Once architect commits `docs/architecture/global.md` + `docs/architecture/microservice/*.md`:

1. **Re-run this audit** comparing new SSOT against all docs.
2. **Update tree-map.md** to include new architecture folder hierarchy.
3. **Deprecate or shrink `docs/ARCHITECTURE.md`** if it duplicates new files (or designate it as user-facing overview + link to detailed specs).
4. **Verify no hardcoded service/port/tool info** in new microservice/.md files (use JSON pointers instead).

**Audit re-trigger:** When git diff shows new files under `docs/architecture/`.
