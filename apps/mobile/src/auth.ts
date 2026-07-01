import { clearStoredToken, getStoredToken, setStoredToken } from "./sync";

// Supabase password grant. When these env vars are unset the app runs in open
// demo/memory mode (no login gate) — matching the API, which only enforces auth
// when Supabase is configured.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const authConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export type SignInResult = { ok: true } | { ok: false; error: string };

export async function signIn(email: string, password: string): Promise<SignInResult> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return { ok: false, error: "Sign-in is not configured." };
  if (!email || !password) return { ok: false, error: "Enter your email and password." };
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      error_description?: string;
      msg?: string;
    };
    if (!response.ok || !data.access_token) {
      return { ok: false, error: data.error_description ?? data.msg ?? "Sign-in failed." };
    }
    await setStoredToken(data.access_token);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Network error." };
  }
}

export async function signOut(): Promise<void> {
  await clearStoredToken();
}

export async function isAuthed(): Promise<boolean> {
  return Boolean(await getStoredToken());
}
