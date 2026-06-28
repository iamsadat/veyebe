import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CommandProfile, CommandProfileValidation, CommandRunResult } from "@veyebe/domain";

const execFileAsync = promisify(execFile);

const SAFE_EXECUTABLE = /^[a-zA-Z0-9._+@/-]+(?:\.exe|\.cmd)?$/;
const SHELL_META = /[;&|`<>\r\n]/;

/** Validates an opt-in profile. This module intentionally provides no execution API. */
export function validateCommandProfile(profile: CommandProfile, projectRoot: string): CommandProfileValidation {
  const errors: string[] = [];
  if (!profile.id.trim() || !profile.label.trim()) errors.push("Profile id and label are required.");
  if (!SAFE_EXECUTABLE.test(profile.executable) || SHELL_META.test(profile.executable)) errors.push("Executable must be a direct executable name or path without shell syntax.");
  if (profile.arguments.some((argument) => SHELL_META.test(argument))) errors.push("Arguments cannot contain shell operators, redirection, or newlines.");
  if (!Number.isInteger(profile.timeoutMs) || profile.timeoutMs < 1_000 || profile.timeoutMs > 15 * 60_000) errors.push("Timeout must be between 1 second and 15 minutes.");
  if (profile.environmentAllowlist.some((name) => !/^[A-Z_][A-Z0-9_]*$/i.test(name))) errors.push("Environment allowlist contains an invalid variable name.");

  const root = path.resolve(projectRoot);
  const workingDirectory = path.resolve(root, profile.workingDirectory);
  const relative = path.relative(root, workingDirectory);
  if (relative.startsWith("..") || path.isAbsolute(relative)) errors.push("Working directory must stay inside the project root.");
  return { valid: errors.length === 0, errors };
}

/** Opt-in verification runner. Raw output never leaves the local process. */
export async function runCommandProfile(profile: CommandProfile, projectRoot: string): Promise<CommandRunResult> {
  const validation = validateCommandProfile(profile, projectRoot);
  if (!validation.valid) throw new Error(validation.errors.join("; "));

  const root = path.resolve(projectRoot);
  const workingDirectory = path.resolve(root, profile.workingDirectory);
  const env: NodeJS.ProcessEnv = {};
  for (const name of profile.environmentAllowlist) {
    const value = process.env[name];
    if (value !== undefined) env[name] = value;
  }

  try {
    const { stdout, stderr } = await execFileAsync(profile.executable, profile.arguments, {
      cwd: workingDirectory,
      timeout: profile.timeoutMs,
      windowsHide: true,
      encoding: "utf8",
      maxBuffer: 512 * 1024,
      env: { ...process.env, ...env },
    });
    return {
      exitCode: 0,
      stdout: stdout.slice(0, 500),
      stderr: stderr.slice(0, 500),
      succeeded: true,
      observedAt: new Date().toISOString(),
    };
  } catch (error) {
    const details = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number };
    return {
      exitCode: typeof details.code === "number" ? details.code : 1,
      stdout: (details.stdout ?? "").slice(0, 500),
      stderr: (details.stderr ?? (error instanceof Error ? error.message : "Command failed")).slice(0, 500),
      succeeded: false,
      observedAt: new Date().toISOString(),
    };
  }
}
