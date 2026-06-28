import { describe, expect, it } from "vitest";
import { validateCommandProfile } from "./commands.js";

describe("validateCommandProfile", () => {
  it("accepts a bounded direct command", () => {
    expect(validateCommandProfile({
      id: "unit-tests",
      label: "Unit tests",
      executable: "npm.cmd",
      arguments: ["test", "--", "--runInBand"],
      workingDirectory: ".",
      timeoutMs: 60_000,
      environmentAllowlist: ["CI", "NODE_ENV"],
    }, "C:\\project")).toEqual({ valid: true, errors: [] });
  });

  it("rejects shell syntax, directory escape, excessive timeout, and unsafe environment names", () => {
    const result = validateCommandProfile({
      id: "unsafe",
      label: "Unsafe",
      executable: "npm && curl",
      arguments: ["test; rm -rf ."],
      workingDirectory: "../outside",
      timeoutMs: 60 * 60_000,
      environmentAllowlist: ["BAD-NAME"],
    }, "C:\\project");
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(5);
  });
});
