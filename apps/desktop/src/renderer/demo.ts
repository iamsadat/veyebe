import type { Recommendation, ScanSnapshot } from "../shared/contracts";

export const demoSnapshot: ScanSnapshot = {
  projectName: "Luma Studio",
  goal: "Make cinematic collaboration feel as immediate as sketching.",
  analyzedAt: new Date(Date.now() - 1000 * 60 * 7).toISOString(),
  analyzerVersion: "demo/1",
  capabilities: ["typescript", "python", "git-history", "ci", "docker"],
  metrics: { files: 1248, languages: 4, commits: 286 },
  provenance: { source: "demo", redacted: true },
  features: [
    {
      id: "canvas",
      title: "Spatial canvas",
      summary:
        "Infinite multiplayer canvas with precise camera and gesture control.",
      state: "active",
      confidence: 0.91,
      approved: true,
      dependencies: ["sync"],
      acceptanceCriteria: [
        "60 fps with 1,000 objects",
        "Pointer and keyboard parity",
      ],
      position: [-2.9, 0.75, 0.2],
      evidence: [
        {
          id: "e1",
          kind: "code_entity",
          title: "CanvasViewport.tsx",
          detail: "Viewport, camera, and gesture orchestration",
          location: "apps/studio/src/canvas/CanvasViewport.tsx",
          verified: true,
        },
        {
          id: "e2",
          kind: "pull_request",
          title: "PR #184 — spatial selection",
          detail: "Adds lasso and multi-select behaviors",
          verified: false,
        },
      ],
    },
    {
      id: "sync",
      title: "Live presence",
      summary:
        "Low-latency cursors, selection state, and conflict-safe document sync.",
      state: "needs_verification",
      confidence: 0.84,
      approved: true,
      dependencies: [],
      acceptanceCriteria: [
        "P95 sync under 180ms",
        "Reconnect without state loss",
      ],
      position: [2.4, 1.1, -0.7],
      evidence: [
        {
          id: "e3",
          kind: "code_entity",
          title: "presence.gateway.ts",
          detail: "WebSocket presence gateway",
          location: "services/realtime/presence.gateway.ts",
          verified: true,
        },
        {
          id: "e4",
          kind: "check",
          title: "Reconnect stress suite",
          detail: "Intermittent failure on CI runner",
          verified: false,
        },
      ],
    },
    {
      id: "export",
      title: "Cinematic export",
      summary: "Render scenes into shareable, production-ready video.",
      state: "blocked",
      confidence: 0.76,
      approved: true,
      dependencies: ["canvas"],
      acceptanceCriteria: ["4K export", "Audio remains in sync"],
      position: [2.9, -1.45, 0.5],
      evidence: [
        {
          id: "e5",
          kind: "issue",
          title: "Issue #92 — codec strategy",
          detail: "Platform codec choice remains unresolved",
          verified: false,
        },
        {
          id: "e6",
          kind: "code_entity",
          title: "render_pipeline.py",
          detail: "Frame composition pipeline",
          location: "workers/render/render_pipeline.py",
          verified: true,
        },
      ],
    },
    {
      id: "comments",
      title: "Review threads",
      summary: "Contextual feedback anchored to objects and moments.",
      state: "verified",
      confidence: 0.95,
      approved: true,
      dependencies: ["sync"],
      acceptanceCriteria: [
        "Resolve and reopen threads",
        "Deep-link to context",
      ],
      position: [-2.15, -1.7, -0.4],
      evidence: [
        {
          id: "e7",
          kind: "check",
          title: "Review thread suite",
          detail: "42 checks passing",
          verified: true,
        },
        {
          id: "e8",
          kind: "git_event",
          title: "Release v0.8.2",
          detail: "Review threads shipped to dogfood",
          verified: true,
        },
      ],
    },
    {
      id: "assets",
      title: "Asset library",
      summary: "Searchable, reusable visual and audio building blocks.",
      state: "planned",
      confidence: 0.69,
      approved: false,
      dependencies: [],
      acceptanceCriteria: ["Semantic search", "Duplicate detection"],
      position: [0, 2.65, -1.1],
      evidence: [
        {
          id: "e9",
          kind: "document",
          title: "Asset taxonomy brief",
          detail: "Draft taxonomy and metadata model",
          location: "docs/assets.md",
          verified: false,
        },
      ],
    },
  ],
  recommendations: [],
  timeline: [],
};

export const initialRecommendations: Recommendation[] = [
  {
    id: "r1",
    title: "Stabilize reconnect coverage",
    rationale:
      "Live presence has an intermittent CI failure and no verified reconnect acceptance evidence.",
    severity: "critical",
    confidence: 0.92,
    status: "open",
  },
  {
    id: "r2",
    title: "Decide export codec boundary",
    rationale:
      "Cinematic export is blocked by an unresolved cross-platform codec decision.",
    severity: "attention",
    confidence: 0.88,
    status: "open",
  },
  {
    id: "r3",
    title: "Verify canvas performance budget",
    rationale:
      "Recent selection work touches the render loop; the 1,000-object criterion has no current check.",
    severity: "opportunity",
    confidence: 0.81,
    status: "open",
  },
];

demoSnapshot.recommendations = initialRecommendations;
demoSnapshot.timeline = [
  {
    id: "t1",
    date: "Today · 10:42",
    title: "Repository analyzed",
    detail: "1,248 files mapped locally",
    actual: true,
  },
  {
    id: "t2",
    date: "Yesterday · 18:04",
    title: "Spatial selection merged",
    detail: "PR #184 connected to Spatial canvas",
    actual: true,
  },
  {
    id: "t3",
    date: "Next milestone",
    title: "Dogfood review",
    detail: "Planned milestone · no fabricated delivery date",
    actual: false,
  },
];
