# po-s55-mcp-restart-alert-deploy-discriminate-mint.jq
# Mint FIX-MCP-RESTART-ALERT-DEPLOY-DISCRIMINATE into .task_board.ready[],
# id-guarded across ALL board arrays (skip if already present anywhere).
# route_to: dev-mcp-server, mode: recon-first, generic mandate (no per-instance hardcode).
# Source: router+ops RAW-verified false-positive restart-cadence page (diag 8a17798b).
# Usage: jq --arg now "$NOW" -f scripts/po-s55-...jq docs/data/orch/orch-state.json
#   (atomic temp -> [ -s ] -> jq empty -> rename; commit orch-state by EXPLICIT PATH)

def NEWID: "FIX-MCP-RESTART-ALERT-DEPLOY-DISCRIMINATE";

# Collect every id already on the board (across array-valued + scalar entries).
def board_ids:
  [ .task_board | to_entries[] | .value
    | if type == "array" then .[] else . end
    | select(type == "object") | .id // empty ];

. as $root
| (board_ids | index(NEWID)) as $dup
| if $dup != null then
    .                                  # already present anywhere -> no-op
  else
    .task_board.ready += [{
      id: NEWID,
      type: "FIX",
      size: "S",
      priority: "P3",
      route_to: "dev-mcp-server",
      zone: "apps/mcp-server/",
      mode: "recon-first",
      recon_first: true,
      baseline_pass: false,
      status: "READY",
      title: "restart-cadence alert pages on every intentional deploy (false positive) — discriminate force-recreate deploys from genuine in-place crash-restarts",
      files: [
        "apps/mcp-server/src/scheduler/system/restartCadenceAlertJob.ts"
      ],
      root_cause: "runRestartCadenceAlertJob counts cron_job_runs rows job_name='mcpServerStartup' in a 4h window and fires when count>=2 (ALERT_THRESHOLD), with ZERO discrimination between an intentional ops force-recreate deploy and a genuine in-place crash-restart. Each force-recreate writes a fresh mcpServerStartup sentinel -> 3 deploys today (FIX-RSI-REPORT-FAILCLOSED 05:35, FIX-ALERT-ENGINE-RSI 08:02, FIX-TA-GOSVC-MA5 08:42) = 3 sentinel rows = a 3-restart-in-4h page on a HEALTHY server. Router RAW docker inspect: RestartCount=0, OOMKilled=false, ExitCode=0, Health=healthy -> no crash loop. A monitor that cries wolf on every deploy is a real defect (/goal#1).",
      recon_mandate: "dev-mcp-server reads the ACTUAL query + its data source in restartCadenceAlertJob.ts FIRST and verifies the REAL mechanism before patching. Ops's secondary 'SQL row-aging 4->3' sub-mechanism is logically inconsistent (it claims ZERO mcpServerStartup rows dated future yet the alert emitted three precise TODAY timestamps) — do NOT trust it; confirm against live cron_job_runs rows + the running container. Fix root cause, not symptom.",
      fix_spec: "Definitive discriminator = docker-native RestartCount/ExitCode (RestartCount stays 0 across force-recreate deploys, increments ONLY on real in-place crash-restarts), OR a container-session/instance discriminator so only the CURRENT instance's startup sentinels count toward the cadence threshold. The alert must fire on genuine in-place crash-restarts and STAY SILENT on intentional deploys.",
      generic_mandate: "Must work for ALL future deploys with no per-instance/per-deploy-id hardcode (/goal#2). No allowlist of today's three deploy timestamps.",
      verification_gate: "(V1) simulate N intentional force-recreate deploys in 4h -> job returns alertSent=false (RestartCount/session discriminator holds). (V2) simulate a genuine in-place crash-restart (RestartCount increments) -> job still alertSent=true. (V3) regression test mirrors the existing injectable db+sendFn pattern (RestartCadence unit test). (V4) LIVE: next intentional ops rebuild produces NO restart-cadence WORK page. QA verifies LIVE raw, never badges.",
      non_urgent: true,
      do_not_displace: "FIX-ALERT-ENGINE-RSI-SINGLEDIGIT (parked review, behavioral gate 2026-06-16 briefing 01:00Z / scan 02:15Z) takes precedence on any lane contention.",
      source: "router+ops RAW-verified false-positive restart-cadence page; ops diagnostic committed 8a17798b; recon a338c3a1. FALSE POSITIVE verdict: RestartCount=0 on live container 62b1e615 (FIX-TA-GOSVC-MA5 rebuild 08:42:15Z) proves no crash-restart-in-place; the 3 'restarts' were 3 intentional force-recreate deploys today.",
      groomed_by: "po-S55",
      groomed_at: $now
    }]
    | .task_board._updated_at = $now
    | .task_board._updated_by = "po-S55"
  end
