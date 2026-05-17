/**
 * TNB Critic Scorer — Unit Tests
 *
 * Tests the pure deterministic scorer: 5 checks × 0.2, threshold 0.6.
 * No I/O, no DB, no HTTP. All tests are synchronous.
 *
 * Checks:
 *   1. Pillar coverage        (0.2)
 *   2. Source tier            (0.2)
 *   3. Specificity            (0.2)
 *   4. BCTC forensics gate    (0.2) — only for fundamental_validation
 *   5. Confidence anchor      (0.2)
 */

import { describe, expect, it } from "bun:test";
import {
  scoreWithTnbCritic,
  type CriticInput,
} from "../domain/services/tnbCriticScorer.js";

// ── helpers ──────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<CriticInput> = {}): CriticInput {
  return {
    fromAgent: "news-scout",
    signalType: "urgent_news",
    stockCode: "VCB",
    payload: {
      title: "VCB raises NIM on low cost-of-capital environment",
      detail:
        "Vietcombank reported Q1 2026 NIM expansion driven by declining cost of capital and strong profit outlook; policy support evident.",
      impact_score: 4,
    },
    findingData: {},
    ...overrides,
  };
}

// ── Check 1: Pillar coverage ──────────────────────────────────────────────────

describe("Check 1 — Pillar coverage", () => {
  it("passes when detail references 'cost of capital'", () => {
    const input = makeInput({
      payload: {
        title: "Test",
        detail:
          "cost of capital declined sharply following NHNN decision. Some extra text here padding.",
        impact_score: 4,
      },
    });
    const result = scoreWithTnbCritic(input);
    expect(result.score).toBeGreaterThanOrEqual(0.2);
  });

  it("passes when detail references 'money supply'", () => {
    const input = makeInput({
      payload: {
        title: "M2 surge in Vietnam",
        detail: "money supply expanded 15% YoY in Q1 2026 driven by credit growth and policy stimulus.",
        impact_score: 4,
      },
    });
    const result = scoreWithTnbCritic(input);
    expect(result.score).toBeGreaterThanOrEqual(0.2);
  });

  it("passes when detail references 'profit'", () => {
    const input = makeInput({
      payload: {
        title: "HPG earnings beat",
        detail: "profit rose 30% in Q2 as steel margins expanded significantly.",
        impact_score: 4,
      },
    });
    const result = scoreWithTnbCritic(input);
    expect(result.score).toBeGreaterThanOrEqual(0.2);
  });

  it("passes when detail references 'policy'", () => {
    const input = makeInput({
      payload: {
        title: "NHNN rate cut",
        detail: "policy rate cut by NHNN supports credit expansion and market sentiment.",
        impact_score: 4,
      },
    });
    const result = scoreWithTnbCritic(input);
    expect(result.score).toBeGreaterThanOrEqual(0.2);
  });

  it("fails pillar check when detail has no pillar keyword", () => {
    const input = makeInput({
      payload: {
        title: "VCB price target raised",
        detail: "The stock went up by a large amount today and volume was elevated.",
        impact_score: 4,
      },
    });
    const result = scoreWithTnbCritic(input);
    // Pillar check should NOT contribute 0.2 — score should be lower
    // (Check 2 passes—no social media; Check 3 may pass; Check 5 passes → max 3×0.2=0.6 minus pillar)
    // With no pillar, score <= 0.8 but pillar reduces it by 0.2 vs full pass
    const fullPassScore = scoreWithTnbCritic(makeInput()).score;
    expect(result.score).toBeLessThan(fullPassScore);
  });
});

// ── Check 2: Source tier ──────────────────────────────────────────────────────

describe("Check 2 — Source tier", () => {
  it("passes when detail has no social media references", () => {
    const input = makeInput();
    const result = scoreWithTnbCritic(input);
    // Should pass this check — no social media
    expect(result.score).toBeGreaterThanOrEqual(0.2);
  });

  it("fails when detail references Facebook without tier-1 anchor", () => {
    const input = makeInput({
      payload: {
        title: "Rumor",
        detail:
          "According to Facebook posts and community groups, VCB may report losses. cost of capital rising.",
        impact_score: 4,
      },
    });
    const result = scoreWithTnbCritic(input);
    // Source tier should fail — Facebook mentioned without anchoring
    const baseResult = scoreWithTnbCritic(makeInput());
    expect(result.score).toBeLessThan(baseResult.score);
  });

  it("fails when detail references Zalo without tier-1 anchor", () => {
    const input = makeInput({
      payload: {
        title: "Zalo group chat leak",
        detail:
          "Zalo group messages suggest insider selling at HPG. profit may decline.",
        impact_score: 4,
      },
    });
    const result = scoreWithTnbCritic(input);
    const baseResult = scoreWithTnbCritic(makeInput());
    expect(result.score).toBeLessThan(baseResult.score);
  });

  it("fails when detail references Reddit without tier-1 anchor", () => {
    const input = makeInput({
      payload: {
        title: "Reddit claim",
        detail:
          "Reddit thread claims money supply data was manipulated by authorities.",
        impact_score: 4,
      },
    });
    const result = scoreWithTnbCritic(input);
    const baseResult = scoreWithTnbCritic(makeInput());
    expect(result.score).toBeLessThan(baseResult.score);
  });
});

// ── Check 3: Specificity ──────────────────────────────────────────────────────

describe("Check 3 — Specificity", () => {
  it("passes when title + detail combined >= 80 chars", () => {
    const title = "VCB Q1 results";
    const detail =
      "Net interest margin expanded on cost of capital decline policy support confirmed.";
    expect(title.length + detail.length).toBeGreaterThanOrEqual(80);
    const input = makeInput({ payload: { title, detail, impact_score: 4 } });
    const result = scoreWithTnbCritic(input);
    expect(result.score).toBeGreaterThanOrEqual(0.2);
  });

  it("fails when combined length < 80 chars", () => {
    const input = makeInput({
      payload: {
        title: "Short",
        detail: "Very short.",
        impact_score: 4,
      },
    });
    const result = scoreWithTnbCritic(input);
    const fullResult = scoreWithTnbCritic(makeInput());
    expect(result.score).toBeLessThan(fullResult.score);
  });

  it("fails when detail contains vague phrase as sole conclusion: 'có thể'", () => {
    const input = makeInput({
      payload: {
        title: "VCB update money supply cost of capital changes",
        detail:
          "VCB có thể tăng lãi suất trong tháng tới. profit policy signal here.",
        impact_score: 4,
      },
    });
    const result = scoreWithTnbCritic(input);
    // detail has vague "có thể" — specificity check should fail
    const noVagueInput = makeInput({
      payload: {
        title: "VCB update money supply cost of capital changes",
        detail:
          "VCB will raise interest rates in Q2 based on NHNN directive. profit policy signal.",
        impact_score: 4,
      },
    });
    const noVagueResult = scoreWithTnbCritic(noVagueInput);
    expect(result.score).toBeLessThan(noVagueResult.score);
  });

  it("fails when detail contains 'possibly' as sole conclusion", () => {
    const input = makeInput({
      payload: {
        title: "Market update cost of capital money supply",
        detail:
          "The stock possibly may move higher due to policy changes profit outlook.",
        impact_score: 4,
      },
    });
    const result = scoreWithTnbCritic(input);
    const noVagueInput = makeInput({
      payload: {
        title: "Market update cost of capital money supply",
        detail:
          "The stock will move higher due to confirmed policy changes and profit recovery.",
        impact_score: 4,
      },
    });
    const noVagueResult = scoreWithTnbCritic(noVagueInput);
    expect(result.score).toBeLessThan(noVagueResult.score);
  });

  it("fails when detail contains 'might' as sole conclusion", () => {
    const input = makeInput({
      payload: {
        title: "FPT update cost of capital policy reform",
        detail:
          "FPT might report higher profit if policy support continues for tech sector.",
        impact_score: 4,
      },
    });
    const result = scoreWithTnbCritic(input);
    const noVagueInput = makeInput({
      payload: {
        title: "FPT update cost of capital policy reform",
        detail:
          "FPT will report higher profit as confirmed in HOSE filing and policy directive.",
        impact_score: 4,
      },
    });
    const noVagueResult = scoreWithTnbCritic(noVagueInput);
    expect(result.score).toBeLessThan(noVagueResult.score);
  });
});

// ── Check 4: BCTC forensics gate ──────────────────────────────────────────────

describe("Check 4 — BCTC forensics gate", () => {
  it("auto-passes for non-fundamental_validation signals", () => {
    const urgentNewsInput = makeInput({ signalType: "urgent_news" });
    const chainCatalystInput = makeInput({ signalType: "chain_catalyst" });
    const r1 = scoreWithTnbCritic(urgentNewsInput);
    const r2 = scoreWithTnbCritic(chainCatalystInput);
    // Both should pass bctc check automatically — no findingData required
    // Full-pass payload: score should be 1.0
    expect(r1.score).toBe(1.0);
    expect(r2.score).toBe(1.0);
  });

  it("fails for fundamental_validation without forensics data", () => {
    const input = makeInput({
      signalType: "fundamental_validation",
      findingData: { direction: "up", confidence: 0.8 },
    });
    const result = scoreWithTnbCritic(input);
    // BCTC check fails — no m_score/f_score/accruals_flag/btn_check
    expect(result.score).toBeLessThan(1.0);
    expect(result.pass).toBe(result.score >= 0.6);
  });

  it("passes for fundamental_validation with m_score in findingData", () => {
    const input = makeInput({
      signalType: "fundamental_validation",
      findingData: { m_score: -2.1, direction: "up", confidence: 0.8 },
    });
    const result = scoreWithTnbCritic(input);
    // BCTC check passes
    expect(result.score).toBe(1.0);
  });

  it("passes for fundamental_validation with f_score in findingData", () => {
    const input = makeInput({
      signalType: "fundamental_validation",
      findingData: { f_score: 7, direction: "up", confidence: 0.8 },
    });
    const result = scoreWithTnbCritic(input);
    expect(result.score).toBe(1.0);
  });

  it("passes for fundamental_validation with accruals_flag in findingData", () => {
    const input = makeInput({
      signalType: "fundamental_validation",
      findingData: { accruals_flag: true, direction: "up", confidence: 0.8 },
    });
    const result = scoreWithTnbCritic(input);
    expect(result.score).toBe(1.0);
  });

  it("passes for fundamental_validation with btn_check in findingData", () => {
    const input = makeInput({
      signalType: "fundamental_validation",
      findingData: { btn_check: "clean", direction: "up", confidence: 0.8 },
    });
    const result = scoreWithTnbCritic(input);
    expect(result.score).toBe(1.0);
  });
});

// ── Check 5: Confidence anchor ────────────────────────────────────────────────

describe("Check 5 — Confidence anchor", () => {
  it("passes when impact_score >= 3 for non-fundamental signals", () => {
    const input = makeInput({
      payload: {
        title: "VCB NIM expansion on cost of capital decline policy support",
        detail: "VCB Q1 2026 NIM expanded 30bps as NHNN cut policy rate and money supply increased.",
        impact_score: 3,
      },
    });
    const result = scoreWithTnbCritic(input);
    expect(result.score).toBe(1.0);
  });

  it("passes when impact_score >= 3 (boundary: 3 passes)", () => {
    const input = makeInput({
      payload: { ...makeInput().payload, impact_score: 3 },
    });
    const result = scoreWithTnbCritic(input);
    expect(result.score).toBe(1.0);
  });

  it("fails when impact_score < 3 (value = 2)", () => {
    const input = makeInput({
      payload: { ...makeInput().payload, impact_score: 2 },
    });
    const result = scoreWithTnbCritic(input);
    // Confidence anchor should fail
    expect(result.score).toBeLessThan(1.0);
  });

  it("passes when confidence_score > 0.5 in findingData (no impact_score)", () => {
    const input = makeInput({
      payload: {
        title: "VCB NIM expansion on cost of capital decline policy support",
        detail: "VCB Q1 2026 NIM expanded 30bps as NHNN cut policy rate and money supply increased.",
        // no impact_score
      },
      findingData: { confidence_score: 0.7 },
    });
    const result = scoreWithTnbCritic(input);
    expect(result.score).toBe(1.0);
  });

  it("fails when neither impact_score nor confidence_score provided", () => {
    const input = makeInput({
      payload: {
        title: "VCB NIM expansion on cost of capital decline policy support",
        detail: "VCB Q1 2026 NIM expanded 30bps as NHNN cut policy rate and money supply increased.",
        // no impact_score
      },
      findingData: {},
    });
    const result = scoreWithTnbCritic(input);
    expect(result.score).toBeLessThan(1.0);
  });
});

// ── Threshold and pass/fail boundary ─────────────────────────────────────────

describe("Pass/fail boundary at 0.6", () => {
  it("passes (true) when score = 1.0 (all 5 checks pass)", () => {
    const result = scoreWithTnbCritic(makeInput());
    expect(result.score).toBe(1.0);
    expect(result.pass).toBe(true);
  });

  it("passes (true) when exactly 3 of 5 checks pass (score = 0.6)", () => {
    // Force exactly 3 checks to pass:
    // Check 1: fail (no pillar keyword)
    // Check 2: fail (social media)
    // Check 3: pass (long enough, no vague)
    // Check 4: auto-pass (non-fundamental)
    // Check 5: pass (impact_score >= 3)
    const input: CriticInput = {
      fromAgent: "news-scout",
      signalType: "urgent_news",
      stockCode: "VCB",
      payload: {
        title: "VCB stock up today on volume spike",
        detail:
          "According to Facebook posts the stock is going up. Volume was very high today as well.",
        impact_score: 4,
      },
      findingData: {},
    };
    const result = scoreWithTnbCritic(input);
    expect(result.score).toBe(0.6);
    expect(result.pass).toBe(true);
  });

  it("fails (false) when exactly 2 of 5 checks pass (score = 0.4)", () => {
    // Check 1: fail (no pillar keyword)
    // Check 2: fail (social media: Facebook)
    // Check 3: fail (combined < 80 chars)
    // Check 4: auto-pass (non-fundamental)
    // Check 5: pass (impact_score >= 3)
    const input: CriticInput = {
      fromAgent: "news-scout",
      signalType: "urgent_news",
      stockCode: "VCB",
      payload: {
        title: "VCB up",
        detail: "Facebook says VCB up.",
        impact_score: 4,
      },
      findingData: {},
    };
    const result = scoreWithTnbCritic(input);
    expect(result.score).toBeLessThan(0.6);
    expect(result.pass).toBe(false);
  });

  it("returns critique text when pass = false", () => {
    const input: CriticInput = {
      fromAgent: "news-scout",
      signalType: "urgent_news",
      stockCode: "VCB",
      payload: {
        title: "VCB up",
        detail: "Facebook says VCB up.",
        impact_score: 4,
      },
      findingData: {},
    };
    const result = scoreWithTnbCritic(input);
    expect(result.pass).toBe(false);
    expect(typeof result.critique).toBe("string");
    expect(result.critique!.length).toBeGreaterThan(0);
  });

  it("notes field is always a non-empty string", () => {
    const result = scoreWithTnbCritic(makeInput());
    expect(typeof result.notes).toBe("string");
    expect(result.notes.length).toBeGreaterThan(0);
  });
});

// ── CriticResult shape ────────────────────────────────────────────────────────

describe("CriticResult shape", () => {
  it("returns { pass, score, notes } for passing signal", () => {
    const result = scoreWithTnbCritic(makeInput());
    expect(result).toHaveProperty("pass");
    expect(result).toHaveProperty("score");
    expect(result).toHaveProperty("notes");
    expect(typeof result.pass).toBe("boolean");
    expect(typeof result.score).toBe("number");
  });

  it("score is always between 0.0 and 1.0 (inclusive)", () => {
    const cases = [
      makeInput(),
      makeInput({ signalType: "fundamental_validation", findingData: {} }),
      makeInput({ payload: { title: "x", detail: "y" } }),
    ];
    for (const c of cases) {
      const r = scoreWithTnbCritic(c);
      expect(r.score).toBeGreaterThanOrEqual(0.0);
      expect(r.score).toBeLessThanOrEqual(1.0);
    }
  });
});
