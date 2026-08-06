# dev-team-drain-0aD-mark-read-20260731-0217.jq
# Step 0a-D: mark the single NEW signal_queue row READ after claim per skill contract.
($now) as $now
| .signal_queue.rows = [ .signal_queue.rows[]
    | if .id == "dev-20260731T020908" then .status = "READ" else . end
  ]
| .signal_queue._updated_at = $now
| .signal_queue._updated_by = "dev-team/drain-0aD-20260731T0217Z"
