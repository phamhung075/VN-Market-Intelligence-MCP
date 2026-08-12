---
name: published-marker-gate
description: >
  Two-phase publish-once mutex for cowork guaranteed-slot agents. Phase 1 (cheap, read-only)
  aborts before the expensive pipeline if the window is already published. Phase 2 (commit
  point) claims immediately before the flow's own irreversible publish action and is NEVER
  released on success — TTL is the sole expiry path. Analogous in shape to commit-mutex/SKILL.md
  but AGENT-SIDE, not dispatcher-side (see spawn-fanout.md's own disclaimer, L115) — each of the
  6 cowork guaranteed-slot flows (chef, alert-commander, bctc-analyst, fb-market-poster,
  digest-predict, tran-ngoc-bau) invokes this directly via native call_tool, no Bash grant
  required (same call shape all 6 already use live today).
---

# Skill: published-marker-gate

**Design brief:** `docs/architecture-briefs/2026-08-08-uc-cca-p3-published-marker-gate-skill.md` §3
**Task:** `UC-CCA-P3-FR1-FR2-SKILL` (FR-1 two-phase gate, FR-2 uniform abort-path coverage)
**Wired into (FR-3, separate tasks, not this one):** chef, alert-commander, bctc-analyst,
fb-market-poster, digest-predict, tran-ngoc-bau — see brief §4 for the exact file:line target per
gate. `spawn-fanout.md` (dispatcher) does NOT call this skill — the spawned agent does.

## Inputs (caller-supplied, never re-derived by this skill)
- `MARKER_KEY` (string) — window-anchored, timezone-free, per FR-4 (FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR
  Component A). This skill treats it as opaque — date-scoped, per-window, or ISO-week-period-scoped
  keys are all valid; never hardcode a shape here.
- `MARKER_TTL` (int, seconds) — caller-derived from slot cadence (single-fire 100800s / 28h;
  multi-fire = cadence; weekly ~691200s / 8d).
- `OWNER_AGENT` (string) — e.g. "unified-agent", "alert-commander".
- `OWNER_CLIENT_SESSION` (string) — resolved CLAUDE_CODE_SESSION_ID. REQUIRED. Substitute the ACTUAL
  value — never write the literal text "$CLAUDE_CODE_SESSION_ID" (preserves FR-6's already-shipped
  invariant, be3545412).

## Phase 1 — Cheap probe (OPTIONAL — only for flows with an expensive pre-publish pipeline to
protect: chef, fb-market-poster, digest-predict, tran-ngoc-bau. SKIP for alert-commander/bctc-analyst
— their pre-gate work is not conditioned on the dedup outcome, see design note below.)

Run at the flow's existing early gate point (unchanged location — this is a relocation of intent,
not of file/line):

```
PROBE = call_tool(server="vn-market", tool="task_list_held",
                   arguments={ kind: "cowork-slot", owner_agent: OWNER_AGENT })
# task_list_held has NO task_id filter (verified coordinationTools.ts) — scan client-side:
HELD = PROBE.locks contains an entry where task_id == MARKER_KEY AND expires_at > now

if HELD:
  log "[<agent>] publish blocked (Phase-1 probe) — already held key=" + MARKER_KEY
  EXIT with: "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
  # claims NOTHING — a leak from this call is structurally impossible.
else:
  proceed with the flow's own gather/synthesis pipeline
```

## Phase 2 — Commit-point claim (MANDATORY, all 6 gates)

Place **immediately before** the flow's own irreversible publish action — `send_telegram` for 5 of
6 gates, the STEP-5 file `Write` for fb-market-poster. Not one step earlier (defeats FR-2), not
wrapped around synthesis (defeats the cost-optimisation Phase 1 exists for).

```
CLAIM = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:              MARKER_KEY,
  task_kind:            "cowork-slot",
  owner_agent:          OWNER_AGENT,
  owner_client_session: OWNER_CLIENT_SESSION,
  ttl_seconds:          MARKER_TTL
})

if CLAIM.claimed != true:
  log "[<agent>] publish blocked (Phase-2 claim) — already published key=" + MARKER_KEY
  EXIT with: "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
  # a peer claimed between this Phase-1 probe and this Phase-2 claim — do NOT send anything.
else:
  proceed immediately to the publish action (send_telegram / file Write)
  # NEVER task_release on success, and NEVER on ANY exit after this point — successful send,
  # failed send, exception, process death: all leave the marker in place. TTL is the SOLE
  # expiry path (AC-3; resolves Q-send-fail literally — see brief §7).
```

## Design note — why Phase 1 is optional per-gate
alert-commander and bctc-analyst already independently converged on LATE-claim-only (no separate
early probe) because their pre-gate work is not wasted on a dedup miss: alert-commander's
claim-truth-gate + snapshot always runs regardless of dedup outcome (its Firing Gate has already
decided fire/no-fire before this point); bctc-analyst's extraction is the core deliverable
independent of the WORK-channel notify this marker dedups. Retrofitting Phase 1 onto either would
add a call with no cost-optimisation benefit — skip it there, per the existing correct precedent.
