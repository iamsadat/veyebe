import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export function stableId(namespace: string, value: string): string {
  return `${namespace}_${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

export function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function hashFile(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}
