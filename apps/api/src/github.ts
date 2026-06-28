import { createHmac, createSign, timingSafeEqual } from "node:crypto";
import type { AppConfig } from "./config.js";

export function verifyGitHubSignature(body: Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature?.startsWith("sha256=")) return false;
  const received = Buffer.from(signature.slice(7), "hex");
  const expected = createHmac("sha256", secret).update(body).digest();
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export const supportedGitHubEvents = new Set(["installation", "issues", "pull_request", "check_run", "release"]);

const base64Url = (value: string) => Buffer.from(value).toString("base64url");

export function createGitHubAppJwt(config: AppConfig): string {
  if (!config.GITHUB_APP_ID || !config.GITHUB_PRIVATE_KEY) throw new Error("GitHub App credentials are not configured");
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: config.GITHUB_APP_ID }));
  const unsigned = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(unsigned).end().sign(config.GITHUB_PRIVATE_KEY.replace(/\\n/g, "\n"), "base64url");
  return `${unsigned}.${signature}`;
}

export async function createInstallationToken(config: AppConfig, installationId: number): Promise<string> {
  const response = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: { accept: "application/vnd.github+json", authorization: `Bearer ${createGitHubAppJwt(config)}`, "x-github-api-version": "2022-11-28", "user-agent": "Veyebe" },
  });
  if (!response.ok) throw new Error(`GitHub installation token failed (${response.status})`);
  const result = await response.json() as { token?: string };
  if (!result.token) throw new Error("GitHub did not return an installation token");
  return result.token;
}

export async function githubInstallationRequest(config: AppConfig, installationId: number, path: string, init: RequestInit = {}) {
  const token = await createInstallationToken(config, installationId);
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "x-github-api-version": "2022-11-28", "user-agent": "Veyebe", ...init.headers },
  });
  if (!response.ok) throw new Error(`GitHub request failed (${response.status})`);
  return response.json();
}

type JsonRecord = Record<string, unknown>;
const record = (value: unknown): JsonRecord => value && typeof value === "object" ? value as JsonRecord : {};

/** Keep GitHub metadata useful without persisting issue bodies, patches, source, or arbitrary webhook fields. */
export function normalizeGitHubEvent(eventName: string, value: unknown): JsonRecord {
  const payload = record(value);
  const repository = record(payload.repository);
  const sender = record(payload.sender);
  const subject = record(payload[eventName === "issues" ? "issue" : eventName === "pull_request" ? "pull_request" : eventName === "check_run" ? "check_run" : eventName === "release" ? "release" : "installation"]);
  return {
    action: typeof payload.action === "string" ? payload.action : undefined,
    repository: {
      id: typeof repository.id === "number" ? repository.id : undefined,
      fullName: typeof repository.full_name === "string" ? repository.full_name : undefined,
      private: typeof repository.private === "boolean" ? repository.private : undefined,
    },
    sender: typeof sender.login === "string" ? sender.login : undefined,
    subject: {
      id: typeof subject.id === "number" ? subject.id : undefined,
      number: typeof subject.number === "number" ? subject.number : undefined,
      title: typeof subject.title === "string" ? subject.title.slice(0, 240) : undefined,
      name: typeof subject.name === "string" ? subject.name.slice(0, 160) : undefined,
      tagName: typeof subject.tag_name === "string" ? subject.tag_name.slice(0, 120) : undefined,
      state: typeof subject.state === "string" ? subject.state : undefined,
      status: typeof subject.status === "string" ? subject.status : undefined,
      conclusion: typeof subject.conclusion === "string" ? subject.conclusion : undefined,
      url: typeof subject.html_url === "string" ? subject.html_url : undefined,
    },
  };
}
