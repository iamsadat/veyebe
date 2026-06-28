import type { ProjectGraph, ProjectScene, ScenePosition } from "./contracts.js";

function hash(input: string): number {
  let value = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function featurePosition(id: string, index: number, total: number): ScenePosition {
  const jitter = (hash(id) % 1000) / 1000;
  const angle = (index / Math.max(1, total)) * Math.PI * 2 + jitter * 0.35;
  const radius = 5.5 + jitter * 1.5;
  return { x: Math.cos(angle) * radius, y: (jitter - 0.5) * 2, z: Math.sin(angle) * radius };
}

/** Produces the same constellation for the same graph on every platform. */
export function buildProjectScene(graph: ProjectGraph, reducedMotion = false): ProjectScene {
  const features = graph.nodes.filter((node) => node.kind === "feature");
  const placed = new Map<string, ScenePosition>();
  const goal = graph.nodes.find((node) => node.kind === "goal");
  if (goal) placed.set(goal.id, { x: 0, y: 0, z: 0 });

  features.forEach((feature, index) => placed.set(feature.id, featurePosition(feature.id, index, features.length)));

  for (const node of graph.nodes) {
    if (placed.has(node.id)) continue;
    const parentEdge = graph.edges.find((edge) => edge.target === node.id || edge.source === node.id);
    const parentId: string | undefined = parentEdge
      ? (parentEdge.source === node.id ? parentEdge.target : parentEdge.source)
      : undefined;
    const base = (parentId ? placed.get(parentId) : undefined) ?? { x: 0, y: 0, z: 0 };
    const seed = hash(node.id);
    const angle = ((seed % 360) / 180) * Math.PI;
    const distance = node.kind === "module" ? 2.2 : 1.25;
    placed.set(node.id, {
      x: base.x + Math.cos(angle) * distance,
      y: base.y + (((seed >>> 8) % 100) / 100 - 0.5) * 1.5,
      z: base.z + Math.sin(angle) * distance,
    });
  }

  return {
    nodes: graph.nodes.map((node) => ({
      ...node,
      position: placed.get(node.id) ?? { x: 0, y: 0, z: 0 },
      radius: node.kind === "goal" ? 1.2 : node.kind === "feature" ? 0.75 : 0.32,
      brightness: node.state === "verified" ? 1 : node.state === "needs_verification" ? 0.62 : 0.78,
      motion: reducedMotion ? 0 : node.state === "active" ? 1 : 0.25,
      warningHalo: node.state === "blocked",
    })),
    edges: graph.edges,
  };
}
