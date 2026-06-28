import { describe, expect, it } from "vitest";
import { processGitHubEvent } from "./jobs/github-event.js";
import { MemoryStore } from "./store.js";

describe("processGitHubEvent", () => {
  it("loads a recorded delivery", async () => {
    const store = new MemoryStore();
    await store.recordGitHubEvent("delivery-42", "issues", { subject: { title: "Bug" } }, "workspace_personal");
    await expect(processGitHubEvent(store, "delivery-42")).resolves.toBeUndefined();
  });

  it("throws when delivery is missing", async () => {
    const store = new MemoryStore();
    await expect(processGitHubEvent(store, "missing")).rejects.toThrow(/not found/);
  });
});
