import { describe, expect, it } from "vitest";
import { buildProjectScene } from "./scene.js";

describe("buildProjectScene", () => {
  const graph = {
    nodes: [
      { id: "goal", kind: "goal" as const, label: "Ship" },
      { id: "feature", kind: "feature" as const, label: "Auth", state: "active" as const },
      { id: "evidence", kind: "evidence" as const, label: "auth.ts" },
    ],
    edges: [{ id: "edge", source: "feature", target: "evidence", kind: "evidences" as const, strength: 1 }],
  };

  it("is deterministic and honors reduced motion", () => {
    expect(buildProjectScene(graph)).toEqual(buildProjectScene(graph));
    expect(buildProjectScene(graph, true).nodes.every((node) => node.motion === 0)).toBe(true);
  });
});
