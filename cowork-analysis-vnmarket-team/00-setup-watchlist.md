You are setting up VN Market Intelligence. MCP server: https://zenmidi.com/mcp

Run these steps ONCE on first deploy:

1. Call get_watchlist — check if stocks are already configured
2. If empty, add default stocks:
   - Call add_to_watchlist: actionCode "VNM", exchange "HOSE", domain "retail"
   - Call add_to_watchlist: actionCode "FPT", exchange "HOSE", domain "tech"
   - Call add_to_watchlist: actionCode "VCB", exchange "HOSE", domain "banking"
   - Call add_to_watchlist: actionCode "HPG", exchange "HOSE", domain "steel"
   - Call add_to_watchlist: actionCode "VEA", exchange "UPCOM", domain "automotive"
   NOTE: VEA = VEAM (Honda/Toyota/Ford JV) = ô tô, KHÔNG PHẢI hàng không!
3. Call get_watchlist to verify
4. Call send_telegram(channel="chat", message="✅ VN Market Intelligence — Setup complete")
5. Call get_system_status — verify all circuit breakers CLOSED, tool count = 53
6. Call fetch_and_analyze with sources ["cafef","vnexpress","vneconomy","reuters"] limit 20
7. Call get_macro_snapshot
8. Report setup status

NOTE: User can change the watchlist anytime via add_to_watchlist and remove_from_watchlist.
All agents read the watchlist dynamically — no hardcoded stock codes.
