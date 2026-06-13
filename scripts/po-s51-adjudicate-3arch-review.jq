# PO sprint-51: adjudicate the 3 architect-owned REVIEW tasks with null park_reason.
# Invoked with --arg now "<ISO8601>". Atomic temp->[ -s ]->jq -e guard->mv at call site.
# Idempotent: re-running sets the same statuses / same reasons.
#
# Rulings (raw-verified this tick):
#   ARCH-QUE-REFERENCE-PAGE (apps/frontend/, medium) — brief docs/architecture-briefs/2026-06-12-que-reference-page.md
#       is DESIGN COMPLETE ("hand to PM"). REVIEW = completed architect brief awaiting accept.
#       -> ACCEPT: status READY-FOR-PM. Frontend zone is free + parallel-safe (NOT mcp-server). Dispatch pm NOW.
#   ARCH-TSU (apps/mcp-server/src/, P1) — NO architect brief deliverable exists (only the BA input
#       spec docs/handoffs/TOOL-SURFACE-UPGRADE-BA-spec.md); note lists 6 OPEN architect blockers; the
#       completed_at is stale/bogus. Design pass NOT done. apps/mcp-server zone BLOCKED until ~16:00.
#       -> PARK with explicit park_reason + zone_block_reason. Re-design dispatch waits for zone release.
#   ARCH-SHIP-WAVE-REAUDIT (zone multi, high) — brief docs/handoffs/SHIP-WAVE-REAUDIT-architect-brief.md
#       is DESIGN COMPLETE, but zone:multi touches apps/mcp-server -> gated by the 16:00 zone hold.
#       -> PARK with explicit park_reason. PM-decomposition mints mcp-server subtasks; cannot run while held.

# (1) ARCH-QUE-REFERENCE-PAGE lives in backlog[] -> ACCEPT to READY-FOR-PM (frontend, free).
.task_board.backlog |= map(
  if (.id // .task_id) == "ARCH-QUE-REFERENCE-PAGE" then
    .status = "READY-FOR-PM"
    | .park_reason = null
    | .accept_note = "ACCEPTED \($now) by po. Architect brief docs/architecture-briefs/2026-06-12-que-reference-page.md = DESIGN COMPLETE (\"hand to PM\"); all 3 RULINGS resolved in brief. Zone apps/frontend/ is parallel-safe + currently FREE (NOT the held apps/mcp-server zone). Route to pm for decomposition (codegen script + frontend page, both -> dev-frontend per QUE-TOOLTIP-DRY precedent). This is the single item the router dispatches NOW."
    | ._updated_at = $now
    | ._adjudicated_by = "po"
  else . end
)

# (2) ARCH-TSU lives in backlog[] -> PARK (design not done + mcp-server zone held).
| .task_board.backlog |= map(
  if (.id // .task_id) == "ARCH-TSU" then
    .status = "PARKED"
    | .park_reason = "Design pass NOT complete: no architect brief deliverable exists (only the BA input spec TOOL-SURFACE-UPGRADE-BA-spec.md); note still lists 6 OPEN architect blockers (ARCH-U2-1/U2-2/U3-1/U4-1/U5-1/U6-1). The stamped completed_at is stale/bogus — REVIEW state was wrong. Needs a real architect design pass to resolve the 6 blockers + emit a brief BEFORE any READY."
    | .zone_block_reason = "Zone apps/mcp-server/src/ is serialized + HELD by EVIDENCE-ACCUM-SILENT-CRON until ~2026-06-13T16:00Z evidenceAccumulatorJob gate. Architect re-design dispatch waits for zone release (architect designs read-only, but the implementation it unblocks targets the held zone, so do not dispatch into a held lane)."
    | ._updated_at = $now
    | ._adjudicated_by = "po"
  else . end
)

# (3) ARCH-SHIP-WAVE-REAUDIT lives in review[] -> PARK (brief done but multi-zone touches held mcp-server).
| .task_board.review |= map(
  if (.id // .task_id) == "ARCH-SHIP-WAVE-REAUDIT" then
    .status = "PARKED"
    | .park_reason = "Architect brief docs/handoffs/SHIP-WAVE-REAUDIT-architect-brief.md is DESIGN COMPLETE, but accept -> pm-decomposition mints per-zone subtasks where zone:multi explicitly spans apps/mcp-server/ + apps/frontend/ (NFR-C-4/5/7 endpoint+page fixes). Cannot accept-and-dispatch while the apps/mcp-server lane is held — decomposition would queue work into a serialized+held zone."
    | .zone_block_reason = "zone:multi touches apps/mcp-server/, which is serialized + HELD by EVIDENCE-ACCUM-SILENT-CRON until ~2026-06-13T16:00Z. Re-adjudicate for pm-handoff after the 16:00 evidenceAccumulatorJob gate lands + zone releases."
    | ._updated_at = $now
    | ._adjudicated_by = "po"
  else . end
)

| ._updated_at = $now
| ._updated_by = "po"
