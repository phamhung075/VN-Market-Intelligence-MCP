// apps/mcp-server/src/__tests__/1339a-price-confirmation-context.test.ts
// RED phase — all 10 tests must FAIL until 1339b implements the new fields.
// Note: DB_PATH is set to :memory: by apps/mcp-server/src/__tests__/setup.ts preload (Bun.env)
import { describe, it, expect } from "bun:test";
import { createPriceConfirmationBuilder } from "../domain/signals/signalBuilders.js";
import { PriceConfirmationFindingDataSchema } from "../domain/signals/signalTypes.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimum valid base object (existing 5 fields). */
const BASE = {
  price_change_pct: 2.5,
  volume_ratio: 1.8,
  confirms_direction: true,
  fully_priced: false,
  confidence: 0.75,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Task 1339a — PriceConfirmation catalyst correlation fields (RED)", () => {
  // ── Schema tests ────────────────────────────────────────────────────────────

  it("1. schema accepts new optional fields when all 8 fields are provided", () => {
    const input = {
      ...BASE,
      catalyst_stock_code: "VNM",
      catalyst_direction: "BUY",
      time_to_price_move: 3,
    };
    // Must not throw — fails until the schema has these fields
    const result = PriceConfirmationFindingDataSchema.parse(input);
    expect(result.catalyst_stock_code).toBe("VNM");
    expect(result.catalyst_direction).toBe("BUY");
    expect(result.time_to_price_move).toBe(3);
  });

  it("2. schema still accepts objects without the new fields (backward compat)", () => {
    // The schema must declare catalyst_stock_code, catalyst_direction, time_to_price_move
    // as optional fields. This test verifies the schema SHAPE includes these keys.
    // In RED phase the schema object has no such keys, so this will fail.
    const shape = (PriceConfirmationFindingDataSchema as unknown as { shape: Record<string, unknown> }).shape;
    expect(shape).toHaveProperty("catalyst_stock_code");
    expect(shape).toHaveProperty("catalyst_direction");
    expect(shape).toHaveProperty("time_to_price_move");
    // Also confirm base-only parse still works (backward compat)
    const result = PriceConfirmationFindingDataSchema.parse(BASE);
    expect(result.confidence).toBe(0.75);
  });

  it("3. schema rejects catalyst_stock_code shorter than 2 characters", () => {
    const input = { ...BASE, catalyst_stock_code: "" };
    expect(() => PriceConfirmationFindingDataSchema.parse(input)).toThrow();
  });

  it("4. schema rejects invalid catalyst_direction enum value", () => {
    const input = { ...BASE, catalyst_direction: "UP" };
    expect(() => PriceConfirmationFindingDataSchema.parse(input)).toThrow();
  });

  it("5. schema rejects negative time_to_price_move", () => {
    const input = { ...BASE, time_to_price_move: -1 };
    expect(() => PriceConfirmationFindingDataSchema.parse(input)).toThrow();
  });

  // ── Builder tests ───────────────────────────────────────────────────────────

  it("6. builder exposes setCatalystStockCode setter returning this", () => {
    const builder = createPriceConfirmationBuilder();
    // TypeScript will error here in RED phase — cast to any to force runtime failure instead
    const result = (builder as unknown as Record<string, (v: string) => unknown>).setCatalystStockCode("HPG");
    expect(result).toBe(builder);
  });

  it("7. builder exposes setCatalystDirection setter returning this", () => {
    const builder = createPriceConfirmationBuilder();
    const result = (builder as unknown as Record<string, (v: string) => unknown>).setCatalystDirection("SELL");
    expect(result).toBe(builder);
  });

  it("8. builder exposes setTimeToPriceMove setter returning this", () => {
    const builder = createPriceConfirmationBuilder();
    const result = (builder as unknown as Record<string, (v: number) => unknown>).setTimeToPriceMove(6);
    expect(result).toBe(builder);
  });

  it("9. builder round-trip with all 8 fields preserves new fields in output", () => {
    const output = (createPriceConfirmationBuilder() as unknown as Record<string, (v: unknown) => unknown>)
      ["setPriceChangePct"](2.5) as ReturnType<typeof createPriceConfirmationBuilder>;

    // Chain using cast to access methods that don't exist yet
    const b = createPriceConfirmationBuilder() as unknown as {
      setPriceChangePct(v: number): unknown;
      setVolumeRatio(v: number): unknown;
      setConfirmsDirection(v: boolean): unknown;
      setFullyPriced(v: boolean): unknown;
      setConfidence(v: number): unknown;
      setCatalystStockCode(v: string): unknown;
      setCatalystDirection(v: string): unknown;
      setTimeToPriceMove(v: number): unknown;
      build(): Record<string, unknown>;
    };

    const result = b
      .setPriceChangePct(2.5) as typeof b;
    const result2 = (result as typeof b)
      .setVolumeRatio(1.8) as typeof b;
    const result3 = result2.setConfirmsDirection(true) as typeof b;
    const result4 = result3.setFullyPriced(false) as typeof b;
    const result5 = result4.setConfidence(0.75) as typeof b;
    const result6 = result5.setCatalystStockCode("VIC") as typeof b;
    const result7 = result6.setCatalystDirection("BUY") as typeof b;
    const result8 = result7.setTimeToPriceMove(2) as typeof b;
    const built = result8.build();

    expect(built["catalyst_stock_code"]).toBe("VIC");
    expect(built["catalyst_direction"]).toBe("BUY");
    expect(built["time_to_price_move"]).toBe(2);
  });

  it("10. builder round-trip without new fields still succeeds (backward compat)", () => {
    // The builder interface must declare the 3 new setter methods.
    // In RED phase they don't exist, so accessing them via the typed interface fails.
    // We verify the builder HAS the new setters at runtime (they return undefined pre-impl).
    const builder = createPriceConfirmationBuilder() as unknown as Record<string, unknown>;
    expect(typeof builder["setCatalystStockCode"]).toBe("function");
    expect(typeof builder["setCatalystDirection"]).toBe("function");
    expect(typeof builder["setTimeToPriceMove"]).toBe("function");

    // Also run the actual backward-compat build to confirm it still works
    const built = createPriceConfirmationBuilder()
      .setPriceChangePct(-1.2)
      .setVolumeRatio(0.9)
      .setConfirmsDirection(false)
      .setFullyPriced(true)
      .setConfidence(0.5)
      .build();

    expect(built.price_change_pct).toBe(-1.2);
    expect(built.confidence).toBe(0.5);
  });
});
