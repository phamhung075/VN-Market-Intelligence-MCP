# po-s140 — single-pass DUAL-mutation triage (router-dispatched B-05 decision+dedup)
#
# M1 (MINT, id-guarded across ALL lanes -> re-run mints 0):
#   FIX-AUDITOR-B05-BCTC-FRESHNESS-LAYER-SPLIT -> .task_board.backlog[] (status BACKLOG, PLAN-ONLY).
#   The bctc sibling of FIX-AUDITOR-B11-NEWS-FRESHNESS-LAYER-SPLIT: B-05 applies a 24h-continuous
#   SLA to the RAW quarterly-PDF-push layer (get_vps_proxy_health raw last-push) instead of the
#   authoritative analysis-layer gate (get_sla_status). Fires ~6x/day CRITICAL + Telegram BUG for an
#   event-driven quarterly source. Fix = read the analysis-layer SLA gate and/or exempt when
#   pending==0 + service HEALTHY. Same two-layer-freshness / predicate-drift class as B-11 + C-06/C-11/C-12;
#   same file -> co-fix in one docs/agents/system-auditor/flow/main.md pass.
#
# M2 (UPDATE-IN-PLACE, marker-guarded on .po_recovery_disposition -> idempotent):
#   BCTC-HNX-SSL-HARDEN in review[] — record the recovery disposition (analysis layer recovered via a
#   DIFFERENT fix chain, this task is decoupled security-debt whose OWN post-deploy AC is unverified) and
#   route next_agent -> ops for a live deploy + fetch-with-verification-ON probe (OVERRIDE 07-03: delegate
#   gated deploys/verification to ops). Task STAYS in review[] (no promotion, no resolution).
#
# Idempotent + conservative: backlog +1 (M1), review length byte-stable (M2 in-place), all other lanes byte-stable.
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg now "$NOW" \
#     -f scripts/po-s140-b05-bctc-freshness-layer-split-mint-hnx-ssl-ops-verify.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# (orch-apply does Zod + dup-key + CAS + atomic rename; PUSH HELD — fleet-push timer pushes.)

def id_present($id):
  [ .task_board | to_entries[] | .value | select(type=="array") | .[] | select(type=="object") | .id ]
  | any(. == $id);

($now) as $now
| ( "FIX-AUDITOR-B05-BCTC-FRESHNESS-LAYER-SPLIT" ) as $newid
# ---- M1: id-guarded mint into backlog[] ----
| ( if id_present($newid) then .
    else .task_board.backlog += [ {
      id: $newid,
      type: "FIX",
      status: "BACKLOG",
      priority: "P2",
      zone: "docs/agents/system-auditor/",
      size: "S",
      owner: "system-auditor",
      next_agent: "ba",
      title: "system-auditor B-05 (bctc-vps freshness) applies a 24h-continuous SLA to the RAW quarterly-PDF push layer instead of the authoritative analysis-layer SLA gate -> phantom CRITICAL + Telegram BUG ~6x/day for an event-driven quarterly source",
      root_cause: "B-05 reads get_vps_proxy_health(bctc) raw last-push age (still 06-16 / 0-in-24h) and applies a 24h-continuous stale threshold, but bctc filings are an EVENT-DRIVEN quarterly source (Q2-2026 not due until ~late July; 0 items pending). The authoritative freshness gate is get_sla_status(bctc) (analysis layer: age 33min / SLA 850min -> OK). Same two-layer-freshness / predicate-drift class as FIX-AUDITOR-B11-NEWS-FRESHNESS-LAYER-SPLIT (news sibling) and the C-06/C-11/C-12 family: threshold compared against the WRONG layer.",
      fix_spec: "B-05 must gate on the analysis-layer authority, not the raw last-push: (1) PRIMARY: read get_sla_status(bctc) — within SLA -> OK, do not fire. (2) EXEMPT the raw-push staleness path when trigger_bctc_vps_fetch(dry_run) pending==0 AND get_vps_service_health(vn-bctc-fetch)==HEALTHY (event-driven quarterly source: 0 pending + healthy service = nothing stuck = benign). (3) Only escalate raw-push age when pending>0 OR the VPS service is unhealthy. Emit at most ONE finding; never CRITICAL+Telegram-BUG off raw last-push age alone. Co-fix with B-11 in the same docs/agents/system-auditor/flow/main.md pass (same class, same file).",
      dod: [
        "B-05 reads get_sla_status(bctc) as the primary freshness authority; within-SLA -> no fire.",
        "B-05 exempts raw-push staleness when pending==0 AND vn-bctc-fetch HEALTHY (event-driven quarterly source).",
        "RAW: replay the 2026-07-03T22:41Z state (SLA age 33min OK, VPS HEALTHY, pending 0, raw last-push 06-16) -> assert NO CRITICAL + NO Telegram BUG; AND assert a real stuck queue (pending>0 + stale SLA) DOES still fire.",
        "No CRITICAL+Telegram-BUG duplicate from the raw-push root in one Tier-2 cycle."
      ],
      sibling_of: "FIX-AUDITOR-B11-NEWS-FRESHNESS-LAYER-SPLIT",
      related: [ "FIX-AUDITOR-B11-NEWS-FRESHNESS-LAYER-SPLIT", "FIX-BCTC-SLA-FRESHNESS-EXCLUDE-TERMINAL", "FIX-AUDITOR-C06-OFFMARKET-RECALIBRATE" ],
      files: [ "docs/agents/system-auditor/flow/main.md" ],
      co_fix_note: "Groom together with B-11 as ONE docs/agents/system-auditor/flow/main.md two-layer-freshness pass (same file, same predicate-drift class) — the efficient path to stop both raw-vs-analysis phantom CRITICALs + Telegram BUG spam.",
      spam_cost: "4th B-05 CRITICAL emission on 2026-07-03 (~6x/day); each fire also spams a Telegram BUG alert. Recurring per feedback_recurring_bug_escalation.",
      baseline_pass: "RAW-corroborated benign by router 2026-07-03T22:41Z: get_sla_status(bctc) age 33min/SLA 850min OK; get_vps_service_health(vn-bctc-fetch) HEALTHY (polled 4m ago); trigger_bctc_vps_fetch(dry_run) pending 0; get_vps_proxy_health(bctc) raw last-push 06-16/0-in-24h (only stale metric, benign for event-driven quarterly). Auditor-tooling-only, no data incident.",
      source: "PO dedup triage (router-dispatched) of B-05 sau-20260703T223423Z (4th emission today) 2026-07-03",
      created_at: $now,
      created_by: "po"
    } ]
    end )
# ---- M2: in-place update of BCTC-HNX-SSL-HARDEN in review[] ----
| .task_board.review = ( .task_board.review
    | map(
        if (type=="object" and .id=="BCTC-HNX-SSL-HARDEN" and (has("po_recovery_disposition")|not))
        then . + {
          next_agent: "ops",
          updated_at: $now,
          updated_by: "po",
          po_recovery_disposition: ("[po router-dispatched " + $now + "] Analysis layer RECOVERED since 03:03Z (queue 38->0, get_sla_status(bctc) age 33min/SLA 850min OK, vn-bctc-fetch HEALTHY, pending 0) — but via the B-05-FU-SSC-503-RETRY enricher fail-fast chain (DONE_VERIFIED) draining deferred_infra, NOT via this HNX SSL hardening. This task is DECOUPLED security-debt (replace insecure curl -k with --cacert pinning; MITM exposure); recon already falsified any 07-07 SSL expiry cliff (leaf valid to 2027-01-03) and curl -k kept fetching, so there was never a true SSL OUTAGE blocking fetches. Neither 'fix deployed' nor 'self-resolved' is confirmed FOR THIS TASK — its own acceptance (bctc fetch succeeds with verification ON, post-deploy) is UNVERIFIED: repo scope complete (073fa27f+638fba89, router RAW-verified openssl rc=0/no-k) but the VPS deploy (scripts/deploy-vinahost.sh) is unconfirmed and get_vps_proxy_health(bctc) shows 0 fetch in 24h so no hardened-path fetch has actually run. NOT resolvable on the analysis-layer recovery (different fix chain). Per OVERRIDE 07-03 delegate-gated-deploys-to-ops: OPS verification WARRANTED — confirm scripts/deploy-vinahost.sh shipped the CA bundle + hardened fetch-bctc.sh to VPS /root/, then a live HNX fetch with --cacert (verification ON, no -k) returns rc=0 and the fetch succeeds. Task STAYS in review[] until ops confirms. Note: the recurring B-05 FP's durable fix is FIX-AUDITOR-B05-BCTC-FRESHNESS-LAYER-SPLIT (auditor-check layer split), distinct from this deploy task.")
        }
        else . end
      ) )
