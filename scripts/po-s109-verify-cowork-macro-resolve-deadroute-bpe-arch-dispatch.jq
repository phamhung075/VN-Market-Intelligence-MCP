# po-s109 — CLOSE + UNSTICK single-pass triple-mutation triage:
#
# M1 RESOLVE: RELOCATE VERIFY-COWORK-MACRO-SNAPSHOT-ENVELOPE ready[] -> done_verified[] as
#    done_verified:true with router-RAW-probe provenance. Router probed via gateway:
#    get_macro_snapshot.text IS raw JSON (latent leak-trap, unlike get_market_snapshot whose
#    text is human-readable) BUT get_unreviewed_market_messages (8 recent) shows NO leak —
#    every MARKET post is clean Vietnamese prose; agents synthesize macro fields into prose,
#    never dump the raw envelope. NO ACTIVE LEAK. Verified-no-active-leak.
#
# M2 UNSTICK (the real finding): REPOINT top-level .head OFF the dead VERIFY route ONTO
#    BPE-ARCH-1 with status=in_progress + next_agent=architect so the dev-team router's
#    head-resume path (Step 0b: head.status==in_progress AND next_agent non-null) actually
#    FIRES and spawns architect. ROOT of the stick:
#      (a) VERIFY-COWORK was head.next_agent=cowork-team — but cowork-team is the cowork CYCLE
#          dispatcher (runs scheduled agents via signals), NOT a board-task executor; dev-team
#          flow line 17 spawn-guard FORBIDS spawning the cowork-team dispatcher flow. = DEAD ROUTE.
#      (b) head.status was "dispatching" — NOT a status the router's Step 0b handles (only
#          in_progress/idle/stale-24h), so the head sat in a non-routing limlo and NEITHER task
#          dispatched; BPE-ARCH-1 (next_agent=architect, a REAL dev-chain executor) stranded in
#          ready[] ~2h because the head pointer was occupied by the dead VERIFY task.
#    Fix: resolve VERIFY (M1) frees the head; repoint at BPE-ARCH-1 (architect = dispatchable).
#
# M3 DEFENSIVE MINT: id-guarded MINT of FIX-MACRO-SNAPSHOT-HUMANIZE-TEXT -> backlog[] (P3) —
#    close the latent leak-trap: make get_macro_snapshot.text human-readable like
#    get_market_snapshot, so a future prose-parser that naively echoes .text can't leak raw JSON.
#
# Idempotent: M1 relocate guarded by done_verified membership; M2 head guarded; M3 id-guarded.
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg now "$NOW" -f scripts/po-s109-...jq docs/data/orch/orch-state.json
# Atomic temp -> [ -s ] -> jq empty -> conservation -> placement -> rename; commit orch-state by EXPLICIT PATH.

(.task_board.ready | map(select(.id=="VERIFY-COWORK-MACRO-SNAPSHOT-ENVELOPE"))[0]) as $verify
| (.task_board.ready | map(select(.id=="BPE-ARCH-1"))[0]) as $bpe
| (.task_board.done_verified | any(.id=="VERIFY-COWORK-MACRO-SNAPSHOT-ENVELOPE")) as $verify_already_done
| ([.task_board.backlog, .task_board.ready, .task_board.in_progress, .task_board.review,
    .task_board.done, .task_board.done_verified] | flatten
    | any((.id // .task_id // "")=="FIX-MACRO-SNAPSHOT-HUMANIZE-TEXT")) as $humanize_exists

# --- guard: BPE-ARCH-1 must still be in ready[] to repoint the head at it ---
| if $bpe == null and (.head.active_task_id != "BPE-ARCH-1")
  then error("BPE-ARCH-1 not in ready[] and head not already on it — refuse")
  else . end

# --- M1: resolve VERIFY -> done_verified (idempotent) ---
| if ($verify != null) and ($verify_already_done | not)
  then
    .task_board.done_verified += [
      ($verify + {
        status: "done_verified",
        done_verified_at: $now,
        done_verified_by: "po-s109",
        live_verify_agent: "router",
        live_verify_at: $now,
        live_verify_result: "verified-no-active-leak",
        live_verify_evidence: "Router RAW-probed via claude.ai gateway: get_macro_snapshot.text IS raw JSON envelope {status:ok,vnIndex:1824.53,...} (latent leak-trap — unlike get_market_snapshot whose text is human-readable). BUT get_unreviewed_market_messages (8 most recent) shows NO leak: every MARKET post is clean Vietnamese prose; agents synthesize macro fields (USD/VND sigma, yield 7.05% vs 5%, gold -2.2sigma) into prose, never dump the raw envelope. NO ACTIVE LEAK.",
        router_reverify_verdict: "RESOLVED — no active raw-JSON leak to MARKET channel. Latent trap closed defensively via FIX-MACRO-SNAPSHOT-HUMANIZE-TEXT (P3 backlog).",
        verification_gate: "SATISFIED — router live probe (gateway get_macro_snapshot + get_unreviewed_market_messages)",
        dead_route_note: "ROUTE BUG: this task carried next_agent=cowork-team — a DEAD route. cowork-team is the cowork CYCLE dispatcher (runs scheduled agents via signals), NOT a board-task executor; dev-team spawn-guard FORBIDS spawning the cowork-team dispatcher flow. A board VERIFY task routed there could NEVER be picked up. Router verified directly instead. VERIFY-class / live-probe tasks must route to a real executor (router-probe / qa), never cowork-team."
      })
    ]
    | .task_board.ready |= map(select(.id != "VERIFY-COWORK-MACRO-SNAPSHOT-ENVELOPE"))
  else . end

# --- M3: defensive mint FIX-MACRO-SNAPSHOT-HUMANIZE-TEXT (idempotent) ---
| if ($humanize_exists | not)
  then
    .task_board.backlog += [
      {
        id: "FIX-MACRO-SNAPSHOT-HUMANIZE-TEXT",
        type: "FIX",
        title: "Make get_macro_snapshot.text human-readable like get_market_snapshot (close latent raw-JSON leak-trap)",
        desc: "DEFENSIVE / latent-trap closer (spun from VERIFY-COWORK-MACRO-SNAPSHOT-ENVELOPE, router-verified NO active leak). get_macro_snapshot.text currently returns raw JSON ({status,vnIndex,...}) whereas get_market_snapshot.text returns human-readable prose. A future cowork/chef prose-parser that naively echoes .text would leak raw JSON to the MARKET channel. Fix: format get_macro_snapshot.text as a human-readable Vietnamese-friendly section block (same shape as get_market_snapshot), keep the structured fields available alongside (envelope unchanged) so synthesizing agents still read typed values. No active bug — purely closes the inconsistency that makes the leak possible.",
        priority: "P3",
        status: "BACKLOG",
        zone: "apps/mcp-server/",
        owner: "dev-mcp-server",
        size: "S",
        sprint: "BACKLOG",
        market_independent: true,
        created_at: $now,
        created_by: "po-s109",
        source: "VERIFY-COWORK-MACRO-SNAPSHOT-ENVELOPE (router verified no active leak; this closes the latent trap)",
        generic_mandate: "Format the text field generically for ALL macro fields — no per-field/per-ticker hardcode.",
        verification_gate: "get_macro_snapshot.text is human-readable prose (not raw JSON); structured envelope fields still present; no MARKET-channel leak path."
      }
    ]
  else . end

# --- M2: repoint head OFF dead VERIFY route ONTO BPE-ARCH-1 (architect = dispatchable) ---
| .head = {
    status: "in_progress",
    active_task_id: "BPE-ARCH-1",
    next_agent: "architect",
    next_action: "Run BCTC-PROSE-EXTRACT architect SPIKE + design brief (5 blockers: ocr_unit injection path, OCR gap root cause, patch order for active uncommitted work, AI tool arch, structural root-cause for module family). Spec: docs/handoffs/BCTC-PROSE-EXTRACT-BA-spec.md. recurring-bug-escalation — SPIKE is NFR-4 mandatory pre-condition for dev.",
    wip: 1,
    wip_max: 2,
    updated_at: $now,
    updated_by: "po-s109",
    note: "UNSTICK: prior head was VERIFY-COWORK (next_agent=cowork-team = DEAD route, status=dispatching = non-routing) — blocked both promoted tasks ~2h. VERIFY resolved (router verified no active leak). Head repointed at BPE-ARCH-1 -> architect (a REAL dev-chain executor) so dev-team Step-0b head-resume fires and dispatches. zone apps/pdf-extractor/ free (in_progress empty)."
  }
