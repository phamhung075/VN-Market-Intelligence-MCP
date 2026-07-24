/**
 * Tests for taskStatusClasses — FACTORY-FRONTEND-split-orchestration.
 * Golden-value assertions matching the exact classes the inline
 * dashboard.orchestration.tsx switch statement returned before the move.
 */
import { describe, it, expect } from "vitest";
import { taskStatusClasses } from "./task-status-classes";

describe("taskStatusClasses", () => {
  it("DONE → text-green-400", () => {
    expect(taskStatusClasses("DONE")).toBe("text-green-400");
  });

  it("IN_PROGRESS → text-blue-400", () => {
    expect(taskStatusClasses("IN_PROGRESS")).toBe("text-blue-400");
  });

  it("TODO → text-slate-400", () => {
    expect(taskStatusClasses("TODO")).toBe("text-slate-400");
  });

  it("REVIEW → text-cyan-400", () => {
    expect(taskStatusClasses("REVIEW")).toBe("text-cyan-400");
  });

  it("BLOCKED → text-red-400", () => {
    expect(taskStatusClasses("BLOCKED")).toBe("text-red-400");
  });

  it("CANCELLED → text-slate-600 line-through", () => {
    expect(taskStatusClasses("CANCELLED")).toBe("text-slate-600 line-through");
  });

  it("DEFERRED → text-amber-600", () => {
    expect(taskStatusClasses("DEFERRED")).toBe("text-amber-600");
  });

  it("unrecognized status falls back to text-amber-400 (default branch)", () => {
    expect(taskStatusClasses("BOGUS" as unknown as Parameters<typeof taskStatusClasses>[0])).toBe(
      "text-amber-400"
    );
  });
});
