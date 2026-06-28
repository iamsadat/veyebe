import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ProjectPulse } from "./model";

const TOKEN_KEY = "veyebe.auth.token";
const API_URL = process.env.EXPO_PUBLIC_API_URL;

export async function getStoredToken(): Promise<string | undefined> {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  return token ?? undefined;
}

export async function setStoredToken(token: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function fetchProjectPulse(
  workspaceId: string,
  projectId: string,
): Promise<ProjectPulse | undefined> {
  if (!API_URL) return undefined;
  const token = await getStoredToken();
  const response = await fetch(
    `${API_URL}/v1/workspaces/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectId)}/pulse`,
    {
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    },
  );
  if (!response.ok) return undefined;
  return response.json() as Promise<ProjectPulse>;
}

export async function patchRecommendation(
  id: string,
  status: "accepted" | "dismissed" | "snoozed",
): Promise<boolean> {
  if (!API_URL) return false;
  const token = await getStoredToken();
  const response = await fetch(`${API_URL}/v1/recommendations/${id}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      status,
      ...(status === "snoozed"
        ? { snoozedUntil: new Date(Date.now() + 86_400_000).toISOString() }
        : {}),
    }),
  });
  return response.ok;
}
