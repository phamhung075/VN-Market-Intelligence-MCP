# Ops → User: FRED API Key Setup

**Date**: 2026-05-13
**From**: ops agent
**Status**: ACTIONABLE

## What Happened
The macro-indicators service now includes a FRED (Federal Reserve Economic Data) adapter to fetch US economic indicators. This adapter requires a free API key from the St. Louis Federal Reserve.

**Note**: This is a rare one-time admin task that requires your browser and email.

## Your Action
1. Visit: **https://fred.stlouisfed.org/docs/api/api_key.html**
2. Follow the signup flow (free, instant — you'll need your email)
3. Copy the API key (looks like a long alphanumeric string)
4. Open `.env` in your editor
5. Find the line: `FRED_API_KEY=`
6. Paste your key: `FRED_API_KEY=your_actual_key_here`
7. Save and close

## Verification
Once the key is set, the FRED adapter will load cleanly on the next macro-indicators startup. If the key is missing or invalid, the adapter will fail-loud with a clear error.

## Timeline
- **Now**: `.env` has `FRED_API_KEY=` (stubbed empty)
- **After you paste the key**: Next container restart will pick it up
- **If you need to rotate/revoke**: Visit https://fred.stlouisfed.org/user/ under your account

---
No agent action needed until you provide the key. This is a config-admin task only.
