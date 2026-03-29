# Setup Watchlist — Run ONCE on first deploy

## MCP Connection
Connect to your MCP server URL (e.g. `https://zenmidi.com/mcp`)

## Prompt

```
You are setting up the VN Market Intelligence system. Run these steps once:

1. Call `add_to_watchlist` for each stock:
   - actionCode: "VNM", exchange: "HOSE", domain: "retail"
   - actionCode: "FPT", exchange: "HOSE", domain: "tech"
   - actionCode: "VCB", exchange: "HOSE", domain: "banking"
   - actionCode: "VEA", exchange: "HOSE", domain: "aviation"

2. Verify: Call `get_watchlist` — should show 4 stocks

3. Test Telegram: Call `send_test_telegram` with message: "✅ VN Market Intelligence — Setup complete. Monitoring VNM, FPT, VCB, VEA."

4. System check: Call `get_system_health` — verify all circuit breakers are CLOSED

5. Initial data load: Call `fetch_and_analyze` with sources ["cafef","vnexpress","vneconomy","reuters"] and limit 20

6. Initial macro: Call `get_macro_snapshot`

7. Report setup status.
```
