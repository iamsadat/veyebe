export type FeatureState =
  | "proposed"
  | "planned"
  | "active"
  | "needs_verification"
  | "verified"
  | "blocked"
  | "parked";
export interface Feature {
  id: string;
  name: string;
  state: FeatureState;
  evidence: number;
  confidence: number;
  approved: boolean;
}
export interface Recommendation {
  id: string;
  title: string;
  rationale: string;
  confidence: number;
  severity: "critical" | "attention" | "opportunity";
  status: "open" | "accepted" | "dismissed" | "snoozed";
}
export interface Milestone {
  id: string;
  title: string;
  date?: string;
  kind: "actual" | "planned";
}
export interface ProjectPulse {
  id: string;
  name: string;
  goal: string;
  updatedLabel: string;
  features: Feature[];
  recommendations: Recommendation[];
  milestones: Milestone[];
}

export const demoProject: ProjectPulse = {
  id: "38c06544-c941-4b6a-b6f8-748253aeb819",
  name: "Veyebe",
  goal: "Make every project legible and actionable",
  updatedLabel: "Analyzed locally · 8 min ago",
  features: [
    {
      id: "f1",
      name: "Living Constellation",
      state: "active",
      evidence: 18,
      confidence: 0.92,
      approved: true,
    },
    {
      id: "f2",
      name: "Local analyzer",
      state: "verified",
      evidence: 31,
      confidence: 0.97,
      approved: true,
    },
    {
      id: "f3",
      name: "Action inbox",
      state: "needs_verification",
      evidence: 9,
      confidence: 0.84,
      approved: true,
    },
    {
      id: "f4",
      name: "GitHub sync",
      state: "proposed",
      evidence: 4,
      confidence: 0.71,
      approved: false,
    },
  ],
  recommendations: [
    {
      id: "r1",
      title: "Verify action persistence offline",
      rationale:
        "The action flow has implementation evidence but no passing check attached.",
      confidence: 0.91,
      severity: "attention",
      status: "open",
    },
    {
      id: "r2",
      title: "Configure the GitHub App secret",
      rationale:
        "Webhook support is detected, while its required deployment secret is absent.",
      confidence: 0.98,
      severity: "critical",
      status: "open",
    },
    {
      id: "r3",
      title: "Add constellation performance budget",
      rationale:
        "The scene is growing and has no device-level frame budget yet.",
      confidence: 0.76,
      severity: "opportunity",
      status: "open",
    },
  ],
  milestones: [
    { id: "m1", title: "Local scan prototype", date: "Jun 24", kind: "actual" },
    { id: "m2", title: "Mobile pulse review", date: "Jun 27", kind: "actual" },
    { id: "m3", title: "Private dogfood build", kind: "planned" },
  ],
};

export type ProjectEvent =
  | { type: "act"; id: string; status: "accepted" | "dismissed" | "snoozed" }
  | { type: "approve-feature"; id: string }
  | { type: "replace"; project: ProjectPulse };
export function projectReducer(
  project: ProjectPulse,
  event: ProjectEvent,
): ProjectPulse {
  if (event.type === "replace") return event.project;
  if (event.type === "approve-feature")
    return {
      ...project,
      features: project.features.map((item) =>
        item.id === event.id
          ? { ...item, approved: true, state: "planned" }
          : item,
      ),
    };
  return {
    ...project,
    recommendations: project.recommendations.map((item) =>
      item.id === event.id ? { ...item, status: event.status } : item,
    ),
  };
}
