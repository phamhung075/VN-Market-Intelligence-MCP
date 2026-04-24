/**
 * Task 254 — Supply Chain Event Detector Tests
 *
 * Tests for detectSupplyChainEvent() — pure domain function.
 * Detects disruption events from news text using Vietnamese + English patterns.
 */

import { describe, it, expect } from "bun:test";
import {
  detectSupplyChainEvent,
  type SupplyChainEvent,
  type SupplyChainEventType,
} from "../domain/services/supplyChainEventDetector.js";

const WATCHLIST_CODES = ["HPG", "GMD", "VNM", "GVR", "FPT", "VCB"];

describe("Task 254 — Supply Chain Event Detector", () => {
  // Vietnamese port congestion
  it("detects port_congestion from Vietnamese text", () => {
    const text = "Tắc nghẽn cảng Cát Lái gây chậm trễ xuất hàng hóa";
    const event = detectSupplyChainEvent(text, WATCHLIST_CODES);
    expect(event).not.toBeNull();
    expect(event!.eventType).toBe("port_congestion");
  });

  // English port congestion
  it("detects port_congestion from English text", () => {
    const text = "Severe port congestion at Shanghai slows exports";
    const event = detectSupplyChainEvent(text, WATCHLIST_CODES);
    expect(event).not.toBeNull();
    expect(event!.eventType).toBe("port_congestion");
  });

  // Dock strike Vietnamese
  it("detects dock_strike from Vietnamese text", () => {
    const text = "Đình công tại cảng Long Beach làm gián đoạn vận tải";
    const event = detectSupplyChainEvent(text, WATCHLIST_CODES);
    expect(event).not.toBeNull();
    expect(event!.eventType).toBe("dock_strike");
  });

  // Dock strike English
  it("detects dock_strike from English text", () => {
    const text = "US dock strike threatens to halt container shipments";
    const event = detectSupplyChainEvent(text, WATCHLIST_CODES);
    expect(event).not.toBeNull();
    expect(event!.eventType).toBe("dock_strike");
  });

  // Canal blockage — Suez Vietnamese
  it("detects canal_blockage for Suez Canal Vietnamese", () => {
    const text = "Kênh Suez bị tắc do tàu mắc cạn, ảnh hưởng chuỗi cung ứng toàn cầu";
    const event = detectSupplyChainEvent(text, WATCHLIST_CODES);
    expect(event).not.toBeNull();
    expect(event!.eventType).toBe("canal_blockage");
    expect(event!.severity).toBe("critical");
  });

  // Canal blockage — Panama English
  it("detects canal_blockage for Panama Canal English", () => {
    const text = "Panama Canal facing severe drought, transit delays expected";
    const event = detectSupplyChainEvent(text, WATCHLIST_CODES);
    expect(event).not.toBeNull();
    expect(event!.eventType).toBe("canal_blockage");
    expect(event!.severity).toBe("critical");
  });

  // Container shortage Vietnamese
  it("detects container_shortage from Vietnamese text", () => {
    const text = "Thiếu container rỗng tại cảng Hải Phòng, xuất khẩu bị trì hoãn";
    const event = detectSupplyChainEvent(text, WATCHLIST_CODES);
    expect(event).not.toBeNull();
    expect(event!.eventType).toBe("container_shortage");
  });

  // Container shortage English
  it("detects container_shortage from English text", () => {
    const text = "Global container shortage worsens ahead of peak shipping season";
    const event = detectSupplyChainEvent(text, WATCHLIST_CODES);
    expect(event).not.toBeNull();
    expect(event!.eventType).toBe("container_shortage");
  });

  // Force majeure
  it("detects force_majeure", () => {
    const text = "Shipping company declares force majeure on Asia-Europe routes";
    const event = detectSupplyChainEvent(text, WATCHLIST_CODES);
    expect(event).not.toBeNull();
    expect(event!.eventType).toBe("force_majeure");
  });

  // Supply chain disruption Vietnamese
  it("detects route_disruption from Vietnamese supply chain disruption", () => {
    const text = "Gián đoạn chuỗi cung ứng toàn cầu do xung đột Biển Đỏ";
    const event = detectSupplyChainEvent(text, WATCHLIST_CODES);
    expect(event).not.toBeNull();
    expect(event!.eventType).toBe("route_disruption");
  });

  // Supply chain disruption English
  it("detects route_disruption from English supply chain disruption", () => {
    const text = "Supply chain disruption in Asia impacts Vietnamese exporters";
    const event = detectSupplyChainEvent(text, WATCHLIST_CODES);
    expect(event).not.toBeNull();
    expect(event!.eventType).toBe("route_disruption");
  });

  // No match → null
  it("returns null for unrelated text", () => {
    const text = "VN-Index tăng mạnh trong phiên sáng, dòng tiền mạnh vào nhóm ngân hàng";
    const event = detectSupplyChainEvent(text, WATCHLIST_CODES);
    expect(event).toBeNull();
  });

  // Structure check
  it("returned event has correct structure", () => {
    const text = "Port congestion at Cai Mep terminal affects steel imports";
    const event = detectSupplyChainEvent(text, WATCHLIST_CODES);
    expect(event).not.toBeNull();
    expect(typeof event!.eventType).toBe("string");
    expect(["low", "medium", "high", "critical"]).toContain(event!.severity);
    expect(Array.isArray(event!.affectedRoutes)).toBe(true);
    expect(Array.isArray(event!.affectedStocks)).toBe(true);
    expect(typeof event!.confidence).toBe("number");
    expect(event!.confidence).toBeGreaterThan(0);
    expect(event!.confidence).toBeLessThanOrEqual(1);
    expect(typeof event!.description).toBe("string");
  });
});
