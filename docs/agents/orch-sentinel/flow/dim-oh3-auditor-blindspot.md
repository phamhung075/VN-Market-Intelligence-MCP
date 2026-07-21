# Orch Sentinel — OH-3 Auditor Blind-Spot Meta-Check

**Parent flow:** `docs/agents/orch-sentinel/flow/main.md` (MODE=FULL only)
**Answers:** Does system-auditor cover all zones?

**Structural note (why this lives here, not in system-auditor):** system-auditor cannot be the sole
auditor of its own blind spots without recreating `feedback_auditor_self_resolves_signal_false_green` —
a detection-only agent marking its own prior finding resolved based on its own unwitnessed narrative.
See brief §0 for the full precedent comparison against D-FLEET.

---

## OH-3.1 — Probe-Coverage Diff

```bash
jq -r '.project.microservices[].id, (.project.data_sources[].id), (.project.infrastructure.databases[].id), (.project.channels[].id)' docs/data/system-map.json | sort -u
grep -n "http://\|:5[0-9][0-9][0-9]\|/health" docs/agents/system-auditor/probe.sh
grep -n "http://\|:5[0-9][0-9][0-9]\|/health" docs/agents/system-auditor/flow/tier1-probe.md
grep -n "^| [A-C]-[0-9]" docs/agents/system-auditor/flow/main.md docs/agents/system-auditor/audit-dimensions.md
```
Diff the system-map.json entity set against the grep-parsed probe/check-table references.
**Flag:** `HIGH` per structural entity present in system-map.json with ZERO matching probe reference.

## OH-3.2 — VPS Route Count Drift (3-way compare)

```bash
grep -c "geo.block\|route" docs/references/vps-setup*.md
jq '[.project.data_sources[] | select(.geo_blocked == true)] | length' docs/data/system-map.json
call_tool(server="vn-market", tool="get_vps_proxy_health", arguments={})
```
**Flag:** `MED` on any mismatch across the 3 counts (doc-declared vs system-map vs live).

## OH-3.3 — Tier-4/D-FLEET Self-Promotion Guard

```bash
grep -rn "AUDIT_TIER=4" .claude/commands/crons/*.md docs/data/cron-registry.json 2>/dev/null
```
Confirm `AUDIT_TIER=4` is absent from any live cron config — guards against silent self-promotion past the PO gate established in `docs/architecture-briefs/2026-07-18-cron-workflow-optimize-tier4-fleet-audit.md` §7.
**Flag:** `CRITICAL` if found registered as a recurring cron. This is the ONE OH-3 check (and the only check anywhere in orch-sentinel) allowed straight to CRITICAL without corroboration — it is a binary presence/absence read against an explicit written invariant, not an inference.

## OH-3.4 — Heartbeat Granularity Regression

```bash
cat docs/data/auditor-tier1-last-healthy.json docs/data/auditor-tier2-last-healthy.json docs/data/auditor-tier3-last-healthy.json 2>/dev/null
```
Check shape: bare `{last_healthy_at}` vs any richer per-dimension shape.
**Flag:** `INFO` — tracked as a known limitation (per-Tier-3-dimension status already unrecoverable across the notebook's 3-section retention window). Log once; do not re-flag as a "new" finding each run once already logged in a prior scorecard (check the prior OH-STATE block).

---

## Output of this sub-flow

Return `[{check_id: "OH-3.1", severity, metric, summary}, ...]` for OH-3.1 through OH-3.4 to `main.md`. Same anti-flood dedup gate as OH-1 applies before any signal_queue write in `emit-scorecard.md`.
