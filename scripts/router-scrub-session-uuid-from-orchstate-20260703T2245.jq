# Router hygiene: scrub leaked raw session-UUID from tracked orch-state.json (standing constraint: owner_client_session NEVER in a tracked file).
# Pre-existing leak (7 occurrences) written by earlier task-attribution writes into `session`/`assigned_to` fields across
# closed_sprints/done/done_verified/review lanes. Every leaked record has a co-located `owner` with the correct agent role,
# so the faithful scrub sets the leaked field to that role; global walk is the belt-and-suspenders net for any missed path.
# The raw UUID is passed as --arg (NEVER hardcoded into this tracked script).
# Idempotent: re-run is a no-op once the UUID is gone.
# Usage: NOW=...; jq --arg now "$NOW" --arg uuid "$SESSION_UUID" -f scripts/router-scrub-session-uuid-from-orchstate-20260703T2245.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# Global null-safe walk: replace every string scalar exactly == the leaked UUID with a neutral token.
# The co-located `owner` field already carries the correct agent role, so attribution is preserved without it.
# walk() traverses objects/arrays/nulls safely (the earlier per-lane map() approach errored on a null .tasks lane).
walk(if (type=="string" and . == $uuid) then "(session-scrubbed)" else . end)
