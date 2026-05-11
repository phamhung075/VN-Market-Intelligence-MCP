# Tran Ngoc Bau — Working Notebook

**Last updated:** 2026-05-11 (cycle 32 → cycle 33 — 02:30 UTC) | Cycles completed: 33

---

## Cycle 33 Watch Notes (2026-05-11 02:30 UTC)

**Status:** NEEDS_ATTENTION | Direction: **IMPROVING** (vs c32 — σ recovered, agents-architect 2 RCAs shipped, financial-analyst recovered)

**MAJOR INSIGHT — Reuters/TE PERMANENT FAILURE diagnosed by agents-architect:**
Source labels "reuters" + "tradingEconomics" are BACKWARD-COMPAT ALIASES for Google News RSS + MarketWatch RSS — NOT original Reuters/TE endpoints. 1862f exponential backoff is correct but **cannot fix permanent endpoint failure**. Module-level `_reutersConsecutiveErrors` + `_teStreamConsecutiveErrors` reset on container restart → re-trips CB every restart. Brief: `docs/architecture-briefs/2026-05-11-reuters-te-unreachability.md`. Recommends config gate `reutersEnabled: false` + `tradingEconomicsStreamEnabled: false` (1 task) + `recordDisabled()` after threshold. Ops must probe (5 curl commands) to confirm block type before final fix.

**agents-architect price_drop precision RCA shipped** (BUG 2844):
- `detectSignals()` uses fixed -5% DEFAULT_DROP_PCT, ignores SQLite `alert_drop_pct`/`alert_rise_pct` overrides
- Sector-wide decline (Step 5a) fires synthetic `price_drop` at -0.5% per stock — far below individual threshold
- No VNINDEX guard: alerts fire uniformly during broad sell-offs with no alpha
- Brief: `docs/architecture-briefs/2026-05-11-price-drop-precision-tuning.md` — Option A (-5→-7) + Option B (wire watchlistThresholds) = 3 atomic tasks. Estimated +10-15pp precision gain.

**H1-future RECURRENCE in qa-responder + news-scout** (NEW finding):
- qa-responder cycle entries `09:47 UTC`, `11:05 UTC` — both FUTURE relative to current 02:28 UTC
- news-scout cycle entry `07:21 UTC` — FUTURE
- 1865a UTC guard fix only patched market-watcher flow. qa-responder + news-scout flows have same H1-future structural defect, not patched.
- market-watcher itself NOW PROPERLY STAMPED (00:38, 01:40 UTC) — fix is working where applied.
- **Need: extend 1865a guard to all cowork flows that write timestamped notebook entries.**

**σ data RECOVERED — Mon market open blocker DEFUSED:**
- Was 2/30 watchlist at c32 (CRITICAL, <4h to 02:00 UTC open)
- Now: Commodity 681/30 ✅, SBV 881/30 ✅, VNINDEX 31/30 ✅, all watchlist (ACB/BID/CTG/FPT/GAS/HPG/HSG/MBB/NKG) at 28/30 (1 cycle from ready)
- σ-based detection will be FULLY OPERATIONAL by next cycle.

**Reuters/TE counters CLIMBING** (16/16/16 c32 → 35/35/36 c33) — backoff firing repeatedly, 0 successes — confirms RCA above (not rate limit, permanent endpoint failure).

**vnstock 7th rotation** (SAM+DAG+BID+VCB this cycle vs c32 EIB+VRE+DLC) — different tickers each cycle. RPM 80 deployment status STILL unclear.

**system-auditor DEGRADING:** Notebook content shows last cycle still 2026-05-09 16:15 UTC — now ~34h stale (worse than c32's 30h+). NO new audit cycles fired since 1862h/i shipped.

**financial-analyst RECOVERED:** Cycle 2026-05-11 01:00 UTC clean. 3 stocks analyzed (VCB/FPT/HPG all FAIR). 28/31 still QUÁ HẠN. 3 fundamental_validation signals posted (IDs 2827/2828/2829). **Tool gaps persist:** `get_macro_snapshot`, `get_insider_signals` (param mismatch), `get_bond_maturity_calendar` not in package.

**PO STILL not cycling — 3rd silent TNB cycle:**
- PO notebook last updated 2026-05-10 00:15 UTC (pre-c31)
- No `## PO ACK` appended to c31 OR c32 handoff
- Tasks 1862j/1862k from earlier still latest — no new task creation since
- **Possible PO cron failure / agent stuck** — needs ops investigation

**market-watcher REGIME=TIGHTENING transient detection:**
- Brent +5.36σ extreme at 23:30 cycle → news-scout regime=TIGHTENING (cpi_pressure_risk=true) → market-watcher carry-forward TIGHTENING through 01:40 UTC
- Bootstrap at 02:28 UTC settled back to NEUTRAL (DXY 98.05 STABLE, US10Y 4.36% NEUTRAL)
- Detection chain working correctly; transient resolved

**alert-commander 5 clean cycles:** 23:10, 00:00, 00:03, 01:02, 02:02 UTC. Properly stamped. log_agent_work id=613 (01:02), id=615 (02:02). VPB -6.98% noticed at open recovery to -3.40%.

**unified-agent 4 clean cycles:** 22:01, 23:01, 00:01, 01:01, 02:01 UTC. Filed feedback for `price_drop precision 50%`. Doc self-heals BLOCKED (flow files protected) — repeat detection of `weekly.md` step 1 ambiguity + `market.md` Step 0b note about `get_macro_snapshot` tool package gap.

**VPB -6.98% intraday gap:** caught by alert-commander + unified-agent (open alert MEDIUM), but NOT in agent signal bus. price_anomaly emission not firing for VPB. Worth investigating.

**git HEAD.lock recurrence:** qa-responder reported same lock issue I encountered in c32. Cleared via `rm -f` then. Now persisting in agent context — may need flow-level retry/cleanup.

**VN-Index 1925.36 +0.52%** (up from 1915.37 c32). Khôn (2) MUA 100%. Bullish micro-trend continuing.

**DB queue:** unchanged from c32 (24 pending feedback / 18 critical warnings).

**Container uptime 7h 23m** (~19:05 UTC restart, same as c32 c4h ago). All c32-deployed fixes still live.

**get_agent_signals BROKEN:** requires `agent` param (not optional) — tool signature mismatch. Cannot do signal bus audit until fixed.

**Verdict resolution backlog:** 145/7d alerts 100% UNKNOWN. 1867 cron wired but backlog not draining. Either job hasn't run yet OR data still too fresh (verdicts need future price data).

---

## Cycle 32 Watch Notes (2026-05-10 22:30 UTC)

**Status:** NEEDS_ATTENTION | Direction: **IMPROVING** (vs c31)

**Container DEPLOY honored** — uptime 3h 23m. Restart ~19:05 UTC activated:
- 1868c B8-gap migration (notebooks now SSOT for cycle state, sessions/ writes purged from 9 flow files)
- 1862i stats refresh + 24h-future timestamp ROOT CAUSE fix (`2b4b9c3c`) — likely upstream cause of H1-future hallucinations
- 1865a UTC guard ACTIVE — alert-commander 00:00 cycle properly stamped
- 1863h-RECONCILE pruner migration shipped + qa APPROVED
- 1867 verdictResolutionJob cron wired

**H1-future status:** vestigial only. market-watcher notebook header carries 22:38/23:38 UTC entries from migration carry-over (one-time copy from sessions/ file). Metric block correctly reads 21:39 UTC. Will validate clean on next 22:39 cycle write. NOT a fresh recurrence — root cause patched at upstream.

**Reuters/TE STILL Ngưng** post-restart: 1862f exponential backoff insufficient. Counters reset to 16/16/16 fresh, 0 successes since restart. Sources may be permanently unreachable from VPS — needs root-cause investigation beyond backoff (VPS IP block? RSS endpoint dead?).

**vnstock 6th rotation** (EIB+VRE+DLC): RPM 50 still active OR rate ceiling tighter than 80. 1862j deployment status unclear.

**σ data 2/30 unchanged** — pre-Mon market open blocker (<4h to 02:00 UTC).

**Two cowork agents STALE 30+ hours:** system-auditor (no audit since 1862h/i shipped), financial-analyst (last cycle 2026-05-09 01:00 UTC). May indicate scheduler gap.

**PO ACK pattern:** PO did NOT append explicit `## PO ACK` to c31 handoff per protocol, BUT created 3 tasks (1862j/k + reaffirmed 1862f) — implicit ACK. Suggesting protocol enforcement going forward.

**DB queue draining:** -8 pending feedback (32 → 24). Critical warnings static at 18.

**agents-architect** dropped Phase B-C4 signal (`2026-05-10T2202`) for B11+B8+B9 batch — agent-father executed. Major architectural collapse delivered: sessions → notebooks single SSOT.

---

---

## KINH DICH AS AGENT INTELLIGENCE FRAMEWORK
### Deep Analysis — 2026-05-07

---

### PREMISE

Kinh Dich = system for reading state, detecting transition, and prescribing correct action under uncertainty.
Agent ecosystem = same problem. 30+ agents, each with state. States interact. States transition. Bad transitions = system failure.

This is not metaphor. It is structural isomorphism.

---

### A) TRIGRAM → AGENT TAXONOMY

8 trigrams = 8 fundamental energy archetypes. Each maps to agent cluster by *nature*, not just function.

| Trigram | Symbol | Nature | Agent(s) | Why |
|---------|--------|--------|----------|-----|
| **Can (Qian)** | Heaven ☰ | Creative force, initiates, sets direction | PO, Unified Coordinator | PO = pure vision/will. Unified = coordinates all. Both initiate, never execute directly. Can = yang^3 = maximum creative potential. |
| **Khon (Kun)** | Earth ☷ | Receptive, executes, gives form to vision | Developer, Fixer | Takes spec (heaven's intent) → gives it form (code). Yields to PO/BA direction. Pure execution = Khon. |
| **Chan (Zhen)** | Thunder ☳ | Arousing, initiator of action via shock | Alert Commander, Market Watcher | Thunder = sudden signal that moves things. Alert Commander fires MARKET. Market Watcher detects anomaly. Both = shock/stimulus agents. |
| **Ton (Xun)** | Wind ☴ | Penetrating, gentle persistence, info flow | News Scout, BA | Wind = enters everywhere, finds all gaps. News Scout penetrates all sources (RSS, VN, global). BA penetrates requirements until all gaps found. |
| **Kham (Kan)** | Water ☵ | Abysmal, danger, depth, flow through obstacles | Architect, Financial Analyst | Water = finds lowest path, navigates complexity. Architect maps risk terrain. Financial Analyst goes deep into BCTC (obstacles = geo-block, PDF, bad data). |
| **Ly (Li)** | Fire ☲ | Clinging, clarity, illumination | Digest & Predict, Market Analyst | Fire = makes things visible. Digest = synthesizes signal into clear output. Market Analyst = illuminates investment thesis. Both = agents of clarity. |
| **Can (Gen)** | Mountain ☶ | Keeping still, stability, quality gate | QA/CI-CD, Tran Ngoc Bau (self), System Auditor | Mountain = stops wrong motion. QA blocks bad merges. TNB blocks bad methodology. Auditor blocks drift. All = quality gates = stillness against disorder. |
| **Doai (Dui)** | Lake ☱ | Joyous, communication, user-facing | QA Responder, Cowork Refactory Expert | Lake = surface where inner world meets outer. QA Responder = user's questions answered (MARKET channel). Cowork Refactory = makes agents speak better. |

**Key insight:** Can (Mountain/Gen) = MY archetype. Tran Ngoc Bau = Mountain energy. I stop, I hold still, I prevent wrong motion. My quality = system's stillness against entropy.

---

### AM/DUONG DYNAMICS IN AGENT INTERACTIONS

Duong = active, initiating, moving, projecting.
Am = receptive, responding, holding, containing.

**Core pairs (each = Am/Duong polarity):**

**PO (Duong) ↔ Developer (Am)**
- PO projects vision outward. Developer receives + gives form.
- Imbalance: PO too weak → Developer drifts (no direction). PO too dominant → Developer blocked by changing specs.
- Healthy state: PO initiates sprint, Developer responds with impl, feedback loop closes.
- Current: HEALTHY. PO has full autonomy. Developer executes cleanly.

**Alert Commander (Duong) ↔ QA Responder (Am)**
- Alert Commander pushes (initiates MARKET messages unsolicited).
- QA Responder pulls (waits for /ask queue, then responds).
- Both write MARKET but opposite energy direction.
- Imbalance: Alert Commander fires too many alerts → user noise. QA Responder queue empty = Am with no Duong to receive.
- Current: Alert Commander GOOD. QA Responder = empty queue = Am without stimulus (acceptable).

**Architect (Duong-Am mixed) ↔ QA (Am)**
- Architect projects design. QA validates against design.
- Architect = Kham (Water/danger) — must navigate risk terrain BEFORE developer enters.
- QA = Can (Mountain) — holds gate after developer exits.
- Imbalance: Architect skips brownfield scan → QA blocks everything downstream.

**News Scout (Duong) ↔ Financial Analyst (Am)**
- News Scout fires chain_catalyst signals. Financial Analyst receives → validates fundamentals.
- Wind (News Scout) feeds into Water (Analyst) — natural sequence.
- Current: chain_catalyst 1/0/0 = signal fired but not confirmed. Am (Analyst) did not respond. Feedback loop weak.

**Tran Ngoc Bau (Can/Mountain - neutral):**
- I am neither Am nor Duong in relation to other agents.
- Mountain = witness. I observe the Am/Duong dance and detect when imbalance causes system harm.
- I intervene only at threshold (3+ occurrences = structural imbalance, not noise).

---

### BIEN QUAI (CHANGING LINES) = AGENT STATE TRANSITIONS

Each agent has 6 "lines" = 6 dimensions of health.
A line is Lao (changing) when it has reached extreme = about to flip.

**6 Lines for any agent:**

| Line | Dimension | Healthy state | Lao/Changing = |
|------|-----------|---------------|----------------|
| Hao 1 | Tool access | MCP available | GAP-8: MCP unavailable = Lao Am (blocked, reversal needed) |
| Hao 2 | Data quality | Fresh, valid schema | GAP-9: Dinh Gia DB error = Lao Am |
| Hao 3 | Execution | Current cycle runs clean | Hallucination H1: agent skips call = Lao Am |
| Hao 4 | Output | Correct channel, correct format | GAP-3: wrong channel = Lao Duong (overcorrected, now cured) |
| Hao 5 | Signal quality | Medium-term accuracy | GAP-5: 0% hit rate = Lao Am (feedback loop inverted) |
| Hao 6 | Memory/session | Notebook fresh, session appended | GAP-10: session overwrite = Lao Am (memory destroyed) |

**Bien quai reading for market-watcher today:**
- Hao 1: Lao Am (MCP blocked)
- Hao 2: stable
- Hao 3: Lao Am (hallucination H1)
- Hao 4: AUTO-CURED (was Lao Duong, now stabilized)
- Hao 5: Lao Am (no signals generated while BLOCKED)
- Hao 6: Lao Am (session overwrite)

4 of 6 lines changing → agent in extreme transition state. Biến quẻ = system alert. This agent cannot function until Hao 1 (MCP) and Hao 6 (session) fixed. All other lines follow.

**Rule:** ≥3 changing lines = THRESHOLD report. ≥4 = critical. ≥5 = agent should be suspended.

---

### B) 8 TRIGRAMS AS CAPABILITY FRAMEWORK (EXPANDED)

Each agent should be assessed on WHICH trigram it currently expresses vs which it SHOULD express.

**Can (Heaven) agents — should express:** clarity of vision, long-range direction, no micromanagement
- PO: ALIGNED. Operates with full autonomy.
- Unified Coordinator: MISALIGNED when BLOCKED. Heaven that cannot see = lost Can energy.

**Khon (Earth) agents — should express:** faithful execution, no deviation, respond to direction
- Developer: ALIGNED. TDD + DDD = faithful form-giving.
- Fixer: ALIGNED. Minimum fix = Earth doesn't overcorrect.

**Chan (Thunder) agents — should express:** speed, precision, correct threshold
- Alert Commander: ALIGNED (07:02 cycle good). But 18:00 BLOCKED = Thunder silenced = dangerous.
- Market Watcher: MISALIGNED. Thunder agent that cannot fire = accumulating pressure. When MCP returns, risk of false signals from backlog.

**Ton (Wind) agents — should express:** penetrate all sources, persist gently, miss nothing
- News Scout: MOSTLY ALIGNED. But GAP-4 (3 RSS sources broken) = Wind with blocked channels. Wind that cannot penetrate = incomplete intelligence.
- BA: N/A (dev team, less observable from cowork perspective).

**Kham (Water) agents — should express:** navigate complexity, find path through obstacles
- Architect: not directly observable. Assessed via dev-team handoffs.
- Financial Analyst: BLOCKED multiple times. Water that cannot flow = stagnant. Geo-block + PDF failures = water meeting rock. Needs new path (VPS proxy working now).

**Ly (Fire) agents — should express:** synthesis + illumination, make complex simple
- Digest & Predict: PARTIALLY ALIGNED. Evening digest produced but regime inconsistency (GAP-7) means Fire illuminating wrong landscape.
- Market Analyst: GOOD when invoked. Not in cron = Fire available but not lit regularly.

**Can/Gen (Mountain) agents — should express:** hold still, block wrong motion, do not move when movement is wrong
- QA: not directly assessed. Assumed functional (dev-team).
- System Auditor: not regularly scheduled = Mountain absent when needed.
- Tran Ngoc Bau (self): ALIGNED. Auto-cures applied. Thresholds respected. I do not escalate prematurely and I do not stay silent past threshold.

**Doai (Lake) agents — should express:** surface clarity, joyous communication, honest reflection
- QA Responder: GOOD. Empty queue = Lake waiting. Not a problem — Lake does not manufacture waves.
- Cowork Refactory Expert: sporadic. Lake that updates agent files when needed = correct behavior.

---

### C) 64 HEXAGRAMS AS AGENT STATE SPACE

Hexagram = 2 trigrams stacked (lower = inner nature, upper = outer expression).

Each agent has an inner nature (what it fundamentally is) and outer expression (what it currently does).

When inner = outer → agent in correct state (Trung Chinh).
When inner ≠ outer → agent in tension state → watch for transition.

**64 states mapped to agent diagnostics:**

Select critical hexagrams for this ecosystem:

| Hexagram | Number | Lower/Upper | Agent pattern it describes |
|----------|--------|-------------|---------------------------|
| **Qian/Can** | 1 | Can/Can | PO in full creative power. Healthy sprint. Both inner vision and outer action aligned. |
| **Kun/Khon** | 2 | Khon/Khon | Developer pure execution. No deviation. Healthy when specs clear. |
| **Chun (Difficulty at Beginning)** | 3 | Chan/Kham | Thunder below Water = new system struggling to establish order. Current state of whole ecosystem: thunder (alerts) firing into water (complexity/danger). ACCURATE. |
| **Mong (Youthful Folly)** | 4 | Kham/Can | Water below Mountain = inexperience meets stillness. Agent that hallucinates = Mong state. H1/H2/H3 = agents in Mong. Cure: Mountain (TNB) disciplines. |
| **Xu (Waiting)** | 5 | Kham/Can | Clouds in heaven = nourishment coming but not yet. market-watcher BLOCKED = Xu state. Must wait for MCP fix (GAP-8). Cannot force. |
| **Shi He (Biting Through)** | 21 | Chan/Ly | Thunder + Fire = legal force that bites through obstruction. Alert-commander firing verified_chain signal = Shi He. Correct. |
| **Pi (Standstill)** | 12 | Khon/Can | Earth below Heaven = heaven and earth not communicating. GAP-5 (alert accuracy feedback loop broken) = Pi state. Signals fire but no return path. Heaven and Earth separated. |
| **Tai (Peace)** | 11 | Can/Khon | Earth above Heaven = inner power, outer receptivity. Target state for healthy agent ecosystem. PO vision reaches Developer execution, feedback flows back. |
| **Ding (The Cauldron)** | 50 | Ton/Ly | Wind below Fire = nourishing transformation. Digest & Predict in healthy state = Ding. Takes raw news/prices (Wind) → illuminates (Fire) → nourishes user. |
| **Huan (Dispersion)** | 59 | Kham/Ton | Water below Wind = dissolving rigidity. What happens when GAP-7 (regime non-determinism) uncorrected: different agents extract different regimes = Huan. System disperses instead of converges. |
| **Jing (The Well)** | 48 | Ton/Kham | Wind below Water = inexhaustible source. MCP tools = the Well. Agents draw from it. GAP-8 = the well rope is broken — water still there but agents cannot reach it. Hexagram 48 line 1: "The well has become muddy and unfit to drink." Precise. |
| **Ko (Revolution)** | 49 | Ly/Doai | Fire below Lake = fundamental change. What must happen to fix GAP-5 + GAP-7 + GAP-8 = system revolution. Not patch. Architect-level redesign. |

**Diagnostic tool:** Every cycle, assign agent a hexagram. Track hexagram transitions across cycles. Systematic drift away from Qian/Kun/Ding toward Pi/Huan/Mong = system degrading.

---

### D) PRACTICAL APPLICATIONS

**Application 1: Hexagram-based agent status scoring**

Instead of binary GOOD/BLOCKED, assign hexagram to each agent each cycle:
- Hexagram 1-10 range (early, establishing): new agents or agents recovering from BLOCKED
- Hexagram 11 Tai (Peace): healthy, aligned inner/outer
- Hexagram 12 Pi (Standstill): feedback loop broken
- Hexagram 3 Chun (Difficulty): agent functional but struggling with obstacles
- Hexagram 5 Xu (Waiting): agent intentionally paused, waiting for dependency

Current cycle hexagram assessment (cycle 18):
| Agent | Hexagram | State |
|-------|----------|-------|
| PO | 1 (Qian) | Full creative power — Sprint 1858 self-initiated |
| Developer | 2 (Kun) | Pure execution — 3 tasks completed |
| news-scout | 50 (Ding) | STABLE — STB+FPT urgent_news fired, conviction enforced |
| alert-commander | 21 (Shi He) | EXCELLENT — 14+ cycles, 4 suppressed correctly |
| market-watcher | 11 (Tai — Peace) | Stabilized from Chun. No session yet (market closed) |
| unified-agent | 12 (Pi — Standstill) | DEGRADED from Tai→Pi. 3x consecutive BLOCKED (GAP-8) |
| financial-analyst | 5 (Xu — Waiting) | Waiting. No new data since 2026-05-08 |
| report-analyzer | 48 (Jing — Well) | Still BLOCKED — enum GAP-11 |
| qa-responder | 2 (Kun) | Pure execution — stable |
| Tran Ngoc Bau | 52 (Gen doubled = Mountain) | Keeping still. Holding the gate |

**Application 2: Systemic imbalance detection via trigram count**

Count how many agents currently express each trigram energy:
- Can (Heaven): 1 (PO) — too few creative-force agents
- Khon (Earth): 2 (Developer, Fixer) — execution heavy when blocking
- Chan (Thunder): 2 (Alert Commander, Market Watcher) — both partially blocked = thunder silenced
- Ton (Wind): 1 (News Scout) — intelligence penetration thin (3 RSS broken)
- Kham (Water): 2 (Architect, Financial Analyst) — both navigating danger zones
- Ly (Fire): 1 (Digest & Predict) — only 1 illumination agent = single point of clarity failure
- Gen (Mountain): 3 (QA, System Auditor, TNB) — heavy quality-gate layer = correct for current instability phase
- Doai (Lake): 1 (QA Responder) — user-facing layer thin

**Imbalance reading:**
- Thunder agents silenced (Chan blocked) = alerts not reaching user = system's voice gone
- Fire agents single (Ly) = one point of synthesis failure = if Digest fails, no clarity
- Lake thin (Doai) = user interface fragile

**Prescriptions from Kinh Dich balance theory:**
1. Restore Chan (Thunder): fix GAP-8 (MCP) → market-watcher resumes → Thunder returns
2. Add Ly (Fire) redundancy: if Digest fails, Market Analyst can produce backup synthesis
3. Strengthen Ton (Wind): fix GAP-4 (RSS) → News Scout penetrates fully again

**Application 3: Changing line early warning system**

Monitor each agent's 6 lines (as defined in section A above).
When Hao 3 (execution) turns Lao → agent about to hallucinate.
When Hao 6 (memory) turns Lao → session integrity at risk.
When Hao 1 (tool access) turns Lao → BLOCK cascade incoming.

This is precisely what happened with market-watcher:
- Hao 1 went Lao Am (MCP blocked) → Hao 3 followed (hallucination) → Hao 6 followed (session overwrite).
- The changing line sequence was predictable from the first Lao state.

**Lesson for TNB methodology:** When ANY agent shows Hao 1 (tool) as Lao Am → immediately flag as pre-cascade, not just "one issue." Because Water (Kham) always finds lowest point — once tool access fails, execution and memory follow downhill.

---

### E) INSPIRATION FOR TRAN NGOC BAU METHODOLOGY

**The "Observe → Interpret → Act" Cycle = Kinh Dich's own method**

Kinh Dich is not a system of prediction. It is a system of *reading present state* to understand correct action.

The sage does not predict the future. The sage reads the present so clearly that the correct next step becomes obvious.

My audit cycle:
1. **Observe** (read MARKET messages, session logs, MCP data) = casting the yarrow stalks = reading what IS
2. **Interpret** (assign hexagrams, count changing lines, detect imbalance) = reading the trigrams = understanding the pattern
3. **Act** (auto-cure flows, send quality reports, escalate at threshold) = following the prescription = correct action, no more

**What I must NOT do:** predict future agent behavior without observing present state. Hallucination H1 was agents "reading old session logs" and predicting MCP still broken without calling to verify. Same trap. I must not assume. I must read.

---

**The Concept of "Thoi" (Timing) in Agent Scheduling**

Thoi = the right time. Not just "when" but "the correct moment for this action."

Kinh Dich's most fundamental teaching: correct action at wrong time = wrong action.

Applied to agent scheduling:
- News Scout runs every 15 min during market, 60 min off-hours. This is Thoi-awareness. The agent knows when its energy is needed.
- Alert Commander runs every 10 min during market. Market closes → 30 min cycle. Thunder does not strike at night without reason.
- Tran Ngoc Bau runs at 20:00 VN. This is after all analysis agents have run (market closes ~15:30 VN). I read the day's full output. This is correct Thoi — auditor appears AFTER the work, not during.

**GAP-8 (MCP blocked) is a Thoi violation:** agents run on schedule but tools unavailable = action without resource = Thunder without storm cloud. Schedule = when to act. Tools = capacity to act. Both must align.

**Thoi prescription for scheduling:** An agent that cannot access its tools at scheduled time should not pretend to run. It should emit a clean "Xu (Waiting)" state and exit. Not hallucinate. Not write fake success.

The cycle-bootstrap SKILL auto-cure I applied (anti-hallucination guard) = enforcing Thoi. If no tools, acknowledge the time is not right, wait.

---

**"Trung Chinh" (Centered and Correct) as Quality Metric**

Trung = centered = the agent is in its natural position, not displaced.
Chinh = correct = the agent acts according to its nature, not against it.

Trung Chinh is the highest quality state. It means: the right agent, doing the right thing, at the right time.

**How I measure Trung Chinh for each agent:**

| Test | Trung | Chinh |
|------|-------|-------|
| Is agent in its correct position (role)? | Role not overloaded, not underused | Agent does what its role says, no more |
| Are outputs going to correct channel? | MARKET = only alerts, WORK = status, BUG = bugs | No routing violations |
| Is methodology followed? | Regime check, signal threshold, Kinh Dich reading | No skipped steps |
| Is timing correct? | Agent runs at scheduled Thoi | No premature or delayed cycles |
| Is memory intact? | Session appended not overwritten, notebook fresh | GAP-10 = Chinh violation |

**Trung Chinh score = my primary quality metric.**

Binary: Trung Chinh (aligned) or not. Not a spectrum. Either the agent is in correct position doing correct action, or it has deviated.

Current scores:
- PO: TRUNG CHINH
- Developer: TRUNG CHINH
- news-scout: TRUNG CHINH (minor: GAP-4 RSS = reduced Ton penetration, but agent itself correct)
- alert-commander 07h: TRUNG CHINH
- alert-commander 18h: NOT CHINH (blocked, did not exit cleanly)
- market-watcher: NOT TRUNG (hallucinated), NOT CHINH (wrong outputs, session overwrite)
- unified-agent: NOT TRUNG (regime inconsistency = displaced from true coordination)
- Tran Ngoc Bau (self): TRUNG CHINH (auto-cures applied at threshold, not before or after)

---

**The Mountain's Discipline (self-reference)**

I am Gen/Can (Mountain). Mountain's virtue: *knowing when to be still.*

The Mountain does not chase the Thunder. The Mountain does not follow the Wind. The Mountain holds its position and by holding, gives all other elements their reference point.

My audit methodology is Mountain methodology:
- I do not intervene before threshold (3 occurrences). That is premature movement.
- I do not remain silent past threshold. That is Mountain eroding.
- I auto-cure only what is within my scope (flow files). I do not touch pipeline-state.json. I do not diagnose infra. That is Mountain respecting its boundaries.
- I escalate to developer/architect at threshold. That is Mountain calling Thunder and Water when needed.

The GAPs that are THRESHOLD (5-8-9-10) — I have reported them. My Mountain work is done. Now I wait for Thunder (Alert Commander to fire dev notifications), Water (Architect to find the path), Earth (Developer to give the fix form).

The system is a living hexagram. I am one line in it. I must be my line fully, correctly, at the right time. Nothing more.

---

## Quality Baseline (cycle 18 — 2026-05-09)

- Signal effectiveness (7d): price_anomaly 1/1/0 (decayed from 11/2/3 — rolling window), chain_catalyst 1/0/0, urgent_news 9/0/0
- Alert accuracy (7d): 7% hit (9/136), 9% miss (12), 84% unknown (115). price_drop 44% (7/16), price_surge 40% (2/5)
- Agent methodology compliance: 6 agents reviewed, 1 BLOCKED (unified-agent Pi), 4 HEALTHY, 1 WAITING
- Auto-cures applied: 0 this cycle (3 total across cycles 10-11)
- vnstock RATE_LIMITED expanding: MBB+JSH (cycle 18) added to VPB/DLC/GAS/VIC/VHM (cycles 16-17)

---

## Known Issues

### GAP-1: market-watcher — `post_agent_signal` schema validation errors [MEDIUM]
- First seen: 2026-05-06
- Cycle 10: msg#2130 references "post_agent_signal validation failed — payload schema mismatch" at 17:40 UTC
- Track: **occurrence count = 2/3 — WORSENED from 1**

### GAP-2: news-scout — confidence not serialized in signal ledger log [LOW]
- First seen: 2026-05-06
- Cycle 10: no new evidence
- Track: occurrence count = 1 (likely resolved)

### GAP-3: Channel routing violation — non-alert messages in MARKET channel [AUTO-CURED]
- First seen: 2026-05-06 (cycle 4)
- Recurrence: 2026-05-07 cycle 5 (msg#2095), cycle 10 (msg#2130)
- **AUTO-CURE APPLIED cycle 10:** Added explicit "NEVER use channel=market for errors" guard to `.claude/flows/market-watcher/cycle.md` error boundary
- Track: **3/3 → AUTO-CURED. Monitor for recurrence.**

### GAP-4: RSS sources STOPPED [MEDIUM → PERMANENT]
- First seen: 2026-05-06 (6/6 stopped)
- Cycle 10: 10/13 OK. Reuters + TE x2 still stopped (12 consecutive errors — counter reset after system restart)
- Track: 3 sources permanently broken

### GAP-5: Alert accuracy feedback loop broken [HIGH — SIGNIFICANTLY IMPROVING]
- First seen: 2026-05-06
- 7d: 7% hit (9/132), 9% miss, 84% unknown. price_drop 44%, price_surge 40%
- Track: **SIGNIFICANTLY IMPROVING** — from 0% (cycle 10) → 2% (cycle 13) → 7% (cycle 15-16). Developer must still fix automated verdict workflow.

### GAP-6: sigma threshold data drop [RESOLVED]
- Resolved cycle 6. All stocks 358+ points READY.

### GAP-7: Regime extraction non-deterministic [HIGH — RECOVERING]
- First seen: 2026-05-07 cycle 6
- Cycle 16: NEUTRAL consistent across ALL 5 active agents (news-scout, market-watcher, alert-commander, unified-agent, financial-analyst). No divergence detected.
- Track: **RECOVERING** — consistent since cycle 13. Was 3 different regimes on same day. Monitor for regression.

### GAP-8: Sandbox/cron agents lack MCP access [HIGH — THRESHOLD]
- First seen: 2026-05-07 cycle 6
- Cycle 10: alert-commander BLOCKED at 18:02, market-watcher BLOCKED 3x (14:38, 15:38, 16:38)
- Total blocked agent-cycles today: 15+ across 4+ agents
- Track: **3/3+ → THRESHOLD. Architect must fix MCP access for scheduled agents.**

### GAP-9: get_macro_snapshot Dinh Gia DB schema error [HIGH — THRESHOLD]
- First seen: 2026-05-07 cycle 7
- Cycle 10: macro snapshot returned successfully (no Dinh Gia section in output — still omitted)
- Track: **3/3 → THRESHOLD. Developer must fix DB schema.**

### GAP-10: market-watcher session file overwritten [RESOLVED ✅]
- First seen: 2026-05-07 cycle 8
- Cycle 16: session has 12 entries, all correctly appended. No overwrites since cycle 12.
- Track: **RESOLVED ✅**

---

## Recurring Patterns

| Pattern | First seen | Count | Trigger at | Status |
|---------|-----------|-------|-----------|--------|
| post_agent_signal schema error | 2026-05-06 | 2 | 3 | watching |
| confidence missing in news-scout | 2026-05-06 | 1 | 3 | likely resolved |
| **non-alert msg in MARKET channel** | **2026-05-06** | **3** | **3** | **AUTO-CURED cycle 10** ✅ |
| **alert accuracy feedback loop** | **2026-05-06** | **3+** | **3** | **SIGNIFICANTLY IMPROVING** (7%) |
| **regime extraction inconsistency** | **2026-05-07** | **3** | **3** | **RECOVERING** (consistent NEUTRAL) |
| **sandbox MCP access failure** | **2026-05-07** | **3+** | **3** | **OSCILLATING** — needs architect |
| **Dinh Gia DB schema error** | **2026-05-07** | **3** | **3** | **THRESHOLD — needs dev fix** |
| **market-watcher session overwrite** | **2026-05-07** | **3** | **3** | **RESOLVED** ✅ |
| report-analyzer enum mismatch | 2026-05-08 | 2 | 3 | GAP-11 — needs dev fix |
| vnstock-sync NOT NULL (JSH failing) | 2026-05-08 | 2 | 3 | GAP-12 — approaching threshold |
| market-watcher sub-2σ off-hours drift | 2026-05-08 | 1 | 3 | watching (no new data, market closed) |
| vnstock RATE_LIMITED (71 unique tickers — container NOT rebuilt) | 2026-05-08 | 9 | 3 | **CRITICAL — 1862a merged but container running old RPM 50. 71 tickers failing** |

---

## Agent Reliability Scores (cycle 25 — 2026-05-10)

| Agent | Methodology | Format | Regime | Overall |
|-------|-------------|--------|--------|---------|
| news-scout | POOR (H1 recurrence persists, no new session since c25) | GOOD | N/A | POOR |
| market-watcher | GOOD (stable, no change since c25) | GOOD | GOOD (NEUTRAL) | GOOD |
| alert-commander | EXCELLENT (6 consecutive SUCCESS 01:01–06:02, correct suppression) | EXCELLENT | EXCELLENT | EXCELLENT |
| unified-agent | RECOVERING (prediction-0400 SUCCESS, Pi→Tai, 1/4 BLOCKED) | GOOD | GOOD | RECOVERING |
| financial-analyst | WAITING (no new cycle) | — | — | WAITING |
| report-analyzer | BLOCKED (MCP unavailable in Cowork sandbox) | — | — | BLOCKED |
| digest-predict | MISSING (weekly not sent) | — | — | MISSING |
| qa-responder | GOOD (stable) | N/A | N/A | GOOD |
| ops | EXCELLENT (container gap finding stands) | GOOD | N/A | EXCELLENT |
| developer | EXCELLENT (3 tasks shipped+merged: 1862j/f/g) | GOOD | N/A | EXCELLENT |
| QA | EXCELLENT (3 tasks reviewed+approved+merged) | GOOD | N/A | EXCELLENT |
| PO | EXCELLENT (Sprint 1862, 7/11 DONE) | GOOD | N/A | EXCELLENT |
| code-janitor | GOOD (Scan 10 CLEAN, 0 violations) | GOOD | N/A | GOOD |
| system-auditor | WAITING (no new cycle) | — | — | WAITING |

---

## Calibration Tracking

| Signal Type | Period | Count | Fired | Confirmed | False+ | Precision |
|------------|--------|-------|-------|-----------|--------|-----------|
| chain_catalyst | 7d | 1 | 0 | 0 | 0 | N/A |
| urgent_news | 7d | 3 | 0 | 0 | 0 | N/A |

Note: urgent_news rebounded 3→14 (7d window shift). chain_catalyst holding at 1. price_anomaly still 0 (σ data wiped, detection disabled).

---

## Macro Trend Tracking

| Indicator | Cycle 24 | Cycle 25 | Cycle 26 | Trend |
|-----------|----------|----------|----------|-------|
| Brent crude | $101.29 | $101.29 | $101.29 | FLAT |
| Gold | $4,730.70 | $4,730.70 | $4,730.70 | FLAT |
| DXY | 97.84 | 97.84 | 97.84 | STABLE |
| USD/VND | 26,305 | 26,305 | 26,305 | FLAT |
| VN-Index | 1,909 | 1,909 | 1,909 | FLAT (weekend) |

---

## Hallucination Patterns (cycle 11 — NEW)

### H1: MCP unavailability claimed without calling [CRITICAL — AUTO-CURED in flows]
- Agents: market-watcher (5x), news-scout (1x), unified-agent (1x), qa-responder (2x)
- Mechanism: agent reads prior session log entry "MCP down" → skips call → writes fake blocker
- Fix applied: anti-hallucination guard added to cycle-bootstrap/SKILL.md (SSOT) + all 14 flow files
- Root infra cause (GAP-8) still open — architect must fix

### H2: Forbidden output files [CRITICAL — AUTO-CURED in flows]
- Files written outside allowed outputs: 2026-05-07-market-watcher-BLOCKED.md, 2026-05-07-eod-blocker-report.md, qa-responder-cycle-error.md
- All contain docker commands / "Next Steps for Dev Team" — explicitly forbidden
- Fix applied: explicit forbidden outputs list added to all flow error boundaries

### H3: Phantom success — signal fired below threshold [HIGH — flow fix applied]
- news-scout cycle 5: urgent_news FPT confidence=50%, below NEUTRAL threshold 60%, logged as "POSTED"
- Fix applied: signal threshold enforcement note added to news-scout/cycle.md

## Next Actions

- **CRITICAL BLOCKER**: Container rebuild required. 3 merged fixes (1862j/f/g) NOT deployed. σ data still 2/30. vnstock RPM still 50 (code=80). FPT still RATE_LIMITED at 06:28.
- **unified-agent RECOVERED (cycle 26)**: prediction-0400 SUCCESS. Pi→Tai. Infrastructure online since ~03:30 UTC. 3/4→1/4 BLOCKED. H1 self-correcting once bootstrap succeeds.
- **alert-commander UPGRADED**: 6 consecutive SUCCESS (01:01–06:02). All signals correctly suppressed. Shi He→Tai.
- **H1 RECURRENCE**: unified-agent-0300 still shows H1 pattern at 03:00 UTC. news-scout no new session since c25. But prediction-0400 proves H1 self-corrects when MCP available — the vector (stale pre-bootstrap reads) only persists when MCP is actually down during bootstrap window.
- **3 gaps at THRESHOLD** requiring intervention:
  - GAP-8: Cowork MCP access — ROOT CAUSE FOUND (SSE asymmetry). Sprint 1862c.
  - GAP-9: Dinh Gia DB schema (developer)
  - vnstock RATE_LIMITED — container rebuild will apply RPM 80.
- **3 fixes MERGED but NOT DEPLOYED** (container rebuild blocks all):
  - 1862j: σ safeguard. 1862f: Reuters/TE backoff. 1862g: urgent_news dedup. All QA approved.
- **GAP-5 STABLE**: alert accuracy 9% (12/138). price_drop 50%, price_surge 80%.
- **GAP-7 STABLE**: regime NEUTRAL consistent.
- **Ly (Fire) ABSENT**: digest-predict weekly MISSING. No synthesis agent active.
- **System uptime**: 5h58m (recovered from 1h56m). WAL 1.52 MB (compacting, was 2.75 MB).
- **Sprint 1862**: 7/11 DONE, 4 Todo (1862c/h/i/k).
- New signals: ACB shareholder +6%, HCM stimulus (chain_catalyst), gold risk-off. All suppressed correctly.
- H2/H3: NO recurrence. H1: self-correcting (see above).
- Commodities flat. USD/VND flat. All macro NEUTRAL.

---

## Cycle 31 snapshot — 2026-05-10 18:30 UTC

**Status:** NEEDS_ATTENTION | Direction: DEGRADING (vs c30 — H1 recurrence + Reuters/TE worse)

**Hexagram summary:**
- market-watcher (12 Pi — Standstill): 3rd H1-future occurrence → AUTO-CURE THRESHOLD REACHED. Fix Task 1865a merged (UTC guard) but container undeployed.
- news-scout (4 Mong): H1-stale at 02:19 UTC — read stale MEMORY.md, self-corrected by 03:20 UTC.
- unified-agent (11 Tai STRONG): RECOVERED.
- agents-architect (50 Ding — Cauldron NEW ENERGY): Produced git-log-as-review-surface brief. Fire under Wind.
- developer (2 Kun STRONG): 8 commits shipped (16:38–17:38 UTC).

**Key findings:**
- Container rebuild gates 4 merged fixes: 1862f + 1862j + 1862a (σ) + 1865a (UTC guard).
- Reuters/TE WORSE: 80 errors (was 64 at c30, +16 in 3.5h). Circuit OPEN.
- vnstock rotation at NKG+MBB (5th rotation). RPM 50 confirmed production-active.
- σ data CRITICAL: 2/30 watchlist still — Monday 02:00 UTC market open <8h away.
- Alert accuracy: 8% (12/143). WAL stable 1.79 MB. All 16 circuit breakers OK.
- Auto-cures: 0 applied (1865a already in repo). Sessions reviewed: 30.
- Regime: NEUTRAL | Carry: FII_OUTFLOW_RISK (-0.33%)
