// apps/mcp-server/src/__tests__/1836a-bun-version.test.ts
// AC-1: Bun.version must meet or exceed the pinned version 1.3.13
import { describe, it, expect } from "bun:test";

const PINNED_VERSION = "1.3.13";

function parseVersion(v: string): [number, number, number] {
  const parts = v.split(".").map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function versionGte(actual: string, required: string): boolean {
  const [aMaj, aMin, aPatch] = parseVersion(actual);
  const [rMaj, rMin, rPatch] = parseVersion(required);
  if (aMaj !== rMaj) return aMaj > rMaj;
  if (aMin !== rMin) return aMin > rMin;
  return aPatch >= rPatch;
}

describe("Task 1836a — Bun version invariant", () => {
  it("Bun.version is at least 1.3.13 (AC-1)", () => {
    expect(versionGte(Bun.version, PINNED_VERSION)).toBe(true);
  });

  it("Bun.version is a valid semver string (sanity check)", () => {
    expect(Bun.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("versionGte helper: 1.3.13 >= 1.3.13 is true", () => {
    expect(versionGte("1.3.13", "1.3.13")).toBe(true);
  });

  it("versionGte helper: 1.3.12 >= 1.3.13 is false", () => {
    expect(versionGte("1.3.12", "1.3.13")).toBe(false);
  });

  it("versionGte helper: 1.3.14 >= 1.3.13 is true", () => {
    expect(versionGte("1.3.14", "1.3.13")).toBe(true);
  });

  it("versionGte helper: 2.0.0 >= 1.3.13 is true", () => {
    expect(versionGte("2.0.0", "1.3.13")).toBe(true);
  });
});
