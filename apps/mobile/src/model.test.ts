import { describe, expect, it } from "vitest";
import { demoProject, projectReducer } from "./model";

describe("project actions", () => {
  it("updates only the selected recommendation", () => {
    const next = projectReducer(demoProject, { type: "act", id: "r1", status: "accepted" });
    expect(next.recommendations.find((item) => item.id === "r1")?.status).toBe("accepted");
    expect(next.recommendations.find((item) => item.id === "r2")?.status).toBe("open");
  });
});
