// src/__tests__/1252-reference-stocks-sync.test.ts
Bun.env["DB_PATH"] = ":memory:";
import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

// Load mcp.config.json
const configPath = path.resolve(import.meta.dir, "../../mcp.config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as {
  market: { referenceStocks: Record<string, string[]> };
};
const referenceStocks = config.market.referenceStocks;

describe("Task 1252 — mcp.config.json referenceStocks synced with SECTOR_PEERS", () => {
  // ─── Missing sectors ──────────────────────────────────────────────────────

  it("has construction sector", () => {
    expect(referenceStocks["construction"]).toBeDefined();
    expect(referenceStocks["construction"]!.length).toBeGreaterThan(0);
  });

  it("has energy sector", () => {
    expect(referenceStocks["energy"]).toBeDefined();
    expect(referenceStocks["energy"]!.length).toBeGreaterThan(0);
  });

  it("has pharmaceutical sector", () => {
    expect(referenceStocks["pharmaceutical"]).toBeDefined();
    expect(referenceStocks["pharmaceutical"]!.length).toBeGreaterThan(0);
  });

  it("has gold_mining sector", () => {
    expect(referenceStocks["gold_mining"]).toBeDefined();
    expect(referenceStocks["gold_mining"]!.length).toBeGreaterThan(0);
  });

  // ─── Missing tickers in existing sectors ──────────────────────────────────

  it("real_estate includes NLG and HDG", () => {
    expect(referenceStocks["real_estate"]).toContain("NLG");
    expect(referenceStocks["real_estate"]).toContain("HDG");
  });

  it("steel includes TIS", () => {
    expect(referenceStocks["steel"]).toContain("TIS");
  });

  it("oil_gas includes OIL", () => {
    expect(referenceStocks["oil_gas"]).toContain("OIL");
  });

  it("tech includes ELC and SAM", () => {
    expect(referenceStocks["tech"]).toContain("ELC");
    expect(referenceStocks["tech"]).toContain("SAM");
  });

  it("aviation includes SCS", () => {
    expect(referenceStocks["aviation"]).toContain("SCS");
  });

  it("securities includes SHS and MBS", () => {
    expect(referenceStocks["securities"]).toContain("SHS");
    expect(referenceStocks["securities"]).toContain("MBS");
  });

  it("utilities includes GEG, BCG, NT2", () => {
    expect(referenceStocks["utilities"]).toContain("GEG");
    expect(referenceStocks["utilities"]).toContain("BCG");
    expect(referenceStocks["utilities"]).toContain("NT2");
  });

  it("agriculture includes ANV, HNG, ASM, DBC", () => {
    expect(referenceStocks["agriculture"]).toContain("ANV");
    expect(referenceStocks["agriculture"]).toContain("HNG");
    expect(referenceStocks["agriculture"]).toContain("ASM");
    expect(referenceStocks["agriculture"]).toContain("DBC");
  });

  it("logistics includes VOS, STG, HAH", () => {
    expect(referenceStocks["logistics"]).toContain("VOS");
    expect(referenceStocks["logistics"]).toContain("STG");
    expect(referenceStocks["logistics"]).toContain("HAH");
  });

  it("insurance includes PVI, BMI, MIG", () => {
    expect(referenceStocks["insurance"]).toContain("PVI");
    expect(referenceStocks["insurance"]).toContain("BMI");
    expect(referenceStocks["insurance"]).toContain("MIG");
  });

  it("automotive includes HAX, CTF, TMT, SMA", () => {
    expect(referenceStocks["automotive"]).toContain("HAX");
    expect(referenceStocks["automotive"]).toContain("CTF");
    expect(referenceStocks["automotive"]).toContain("TMT");
    expect(referenceStocks["automotive"]).toContain("SMA");
  });

  it("retail includes DGW", () => {
    expect(referenceStocks["retail"]).toContain("DGW");
  });

  it("construction includes HHV, CTD, VCG, HBC, FCN", () => {
    expect(referenceStocks["construction"]).toContain("HHV");
    expect(referenceStocks["construction"]).toContain("CTD");
    expect(referenceStocks["construction"]).toContain("VCG");
    expect(referenceStocks["construction"]).toContain("HBC");
    expect(referenceStocks["construction"]).toContain("FCN");
  });

  it("energy includes GEG, REE, PC1, BCG", () => {
    expect(referenceStocks["energy"]).toContain("GEG");
    expect(referenceStocks["energy"]).toContain("REE");
    expect(referenceStocks["energy"]).toContain("PC1");
    expect(referenceStocks["energy"]).toContain("BCG");
  });

  it("pharmaceutical includes DHG, IMP, DBD, PME, TRA, OPC", () => {
    expect(referenceStocks["pharmaceutical"]).toContain("DHG");
    expect(referenceStocks["pharmaceutical"]).toContain("IMP");
    expect(referenceStocks["pharmaceutical"]).toContain("DBD");
    expect(referenceStocks["pharmaceutical"]).toContain("PME");
    expect(referenceStocks["pharmaceutical"]).toContain("TRA");
    expect(referenceStocks["pharmaceutical"]).toContain("OPC");
  });

  it("gold_mining includes PNJ", () => {
    expect(referenceStocks["gold_mining"]).toContain("PNJ");
  });
});
