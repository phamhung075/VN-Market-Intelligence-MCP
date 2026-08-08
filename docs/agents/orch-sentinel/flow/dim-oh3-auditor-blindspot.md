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

## OH-3.2 — VPS Route Count Drift (SSOT-internal hardcode regression guard)

```bash
# Leg 1 — SSOT authoritative count (never hardcode elsewhere; this line IS the source of truth):
ROUTE_COUNT=$(jq '.project.infrastructure.vps.routes | length' docs/data/system-map.json)

# Leg 2 — sweep system-auditor's OWN docs for a literal hardcoded route-count phrase that could
# silently drift from Leg 1 (the exact defect class of FIX-AUDITOR-VPS-ROUTE-COUNT-HARDCODE-
# UNSATISFIABLE — main.md previously hardcoded a stale count against an 8-entry SSOT array):
grep -noE '[Aa]ll [0-9]+ routes|[0-9]+ (geo-blocked )?routes' \
  docs/agents/system-auditor/flow/main.md docs/agents/system-auditor/audit-dimensions.md docs/agents/system-auditor/init.md
```
**Flag:** `MED` if any Leg-2 hit's captured integer != `$ROUTE_COUNT`.

**Retired, do not reintroduce:**
- `data_sources[] | select(.geo_blocked==true)` — numerically coincides with `routes[]` length today
  (both currently the same count) but is a DIFFERENT SSOT set (asks "is this source geo-blocked", not
  "does this source have a VPS route") with no structural invariant tying the two together; it could
  silently diverge (a geo-blocked source added with no route, or vice versa) without ever being
  caught by comparing itself to itself under a different filter. Count `routes[]` directly (Leg 1)
  instead — this is acceptance criterion (4) of FIX-AUDITOR-VPS-ROUTE-COUNT-HARDCODE-UNSATISFIABLE.
- a `get_vps_proxy_health` live-tool leg — that tool returns push-service aggregates, not routes, and
  is structurally incapable of ever equaling `routes[]` length (would either permanently false-flag
  or duplicate main.md's own B-06/B-07 per-route coverage table here; that table is the correct owner
  of live per-route health — this check stays a cheap doc/SSOT hardcode sweep, not a coverage
  re-implementation). Full 3-plane analysis: `docs/handoffs/FIX-AUDITOR-VPS-ROUTE-COUNT-HARDCODE-UNSATISFIABLE-spec.md` §1.

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
