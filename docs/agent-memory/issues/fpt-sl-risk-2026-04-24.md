---
agents: market-watcher, alert-commander
trigger: stop-loss, position-risk, concentration
---

# FPT Stop-Loss Breach Imminent (1.46% gap)

## FPT Position at Critical Risk

**Date**: 2026-04-24 06:17 UTC  
**Cycle**: 20260424-0615  
**Status**: ACTIVE  

### Position State
- Current price: 73,600 VND (-1.08% intraday)
- Entry: 80,300 VND
- Stop-loss floor: 74,679 VND
- **Gap to SL: 1,079 VND (1.46%)**
- Unrealized PnL: -33.5M VND (-8.34%)
- Position size: 5,000 shares (100% portfolio concentration)

### Risk Assessment
- Single volatility spike in intraday range could trigger SL
- FPT part of broader tech sector selloff (-0.58% / 1d)
- VN-Index down -0.64%, market-wide mild pullback
- No disruption to supply chain or energy grid
- Oil prices high ($105.5/bbl) → potential headwind for IT services (12% US revenue exposure per news alert)

### Trigger Events
- Any intraday move below 74,679 = SL execution
- Further sector tech weakness or FX pressure (USD/VND at 26,294)

### Recommendation
Monitor intraday closely. Alert Commander notified via signal 1431 (price_anomaly, impact score 8).
