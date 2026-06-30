# Environment Variables Reference

## Critical for Production

These must be set in production and differ from development:

### API Server

| Variable | Dev Default | Production | Purpose |
|----------|-------------|-----------|---------|
| `NODE_ENV` | `development` | `production` | Controls logging verbosity and error handling |
| `VEYEBE_API_URL` | `http://localhost:4317` | `https://api.example.com` | Public URL clients use to reach API |
| `PORT` | `4317` | `3000` (or your choice) | Server listen port |
| `HOST` | `127.0.0.1` | `0.0.0.0` | Bind to all interfaces in container |

### Supabase (Required for Sync)

| Variable | Example | Purpose |
|----------|---------|---------|
| `SUPABASE_URL` | `https://xxx.supabase.co` | Supabase project endpoint |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGc...` | Server-side operations (rotate quarterly) |
| `SUPABASE_ANON_KEY` | `eyJhbGc...` | Client-side auth (public, scoped by RLS) |

### GitHub Integration (Optional)

| Variable | Example | Purpose |
|----------|---------|---------|
| `GITHUB_APP_SLUG` | `veyebe-bot` | GitHub App identifier for install URL |
| `GITHUB_APP_ID` | `123456` | GitHub App ID |
| `GITHUB_PRIVATE_KEY` | `-----BEGIN PRIVATE KEY-----...` | For JWT signing (keep secret) |
| `GITHUB_WEBHOOK_SECRET` | `sha256_xxx...` | Webhook HMAC validation (rotate after each deployment) |

### AI Provider (Optional)

| Variable | Example | Purpose |
|----------|---------|---------|
| `AI_BASE_URL` | `https://api.openai.com/v1` | LLM provider endpoint |
| `AI_API_KEY` | `sk-...` | LLM API key (rotate quarterly) |
| `AI_MODEL` | `gpt-4-turbo` | Model name to use |

---

## Desktop Client

| Variable | Dev Default | Production | Notes |
|----------|-------------|-----------|-------|
| `VEYEBE_API_URL` | `http://localhost:4317` | `https://api.example.com` | Required if sync enabled |
| `VEYEBE_WORKSPACE_ID` | `workspace_personal` | User-specific | Set per deployment |
| `VEYEBE_BEARER_TOKEN` | *(none)* | *(from auth)* | Set at runtime after login |
| `GITHUB_INSTALLATION_ID` | *(none)* | GitHub ID | For GitHub integration |
| `GITHUB_OWNER` | *(none)* | Repo owner | For GitHub integration |
| `GITHUB_REPOSITORY` | *(none)* | Repo name | For GitHub integration |

---

## Mobile Client (Expo)

All mobile env vars must be prefixed `EXPO_PUBLIC_` to be embedded in app.

| Variable | Dev Default | Production | Notes |
|----------|-------------|-----------|-------|
| `EXPO_PUBLIC_API_URL` | `http://localhost:4317` | `https://api.example.com` | Embedded in app at build time |
| `EXPO_PUBLIC_WORKSPACE_ID` | `workspace_personal` | User-specific | Embedded at build time |
| `EXPO_PUBLIC_PROJECT_ID` | `project_abc123` | Auto-generated | Embedded at build time |

**⚠️ Important:** These values are embedded in the compiled app. To change them in production, rebuild and redeploy the app.

---

## Security Best Practices

1. **Never commit `.env` to git** — only `.env.example` with empty placeholders
2. **Rotate secrets quarterly:**
   - Supabase service role keys
   - GitHub app private keys
   - AI provider API keys
3. **Use different keys per environment** (dev ≠ staging ≠ production)
4. **Log access:** Set audit logging on Supabase for production
5. **Least privilege:** GitHub app scopes should be read-only by default

---

## Development Setup

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Then customize as needed:
```bash
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=eyJhbGc... # from supabase start
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc... # from supabase start
```

---

## Docker / Kubernetes

Set environment variables in:
- `Dockerfile` — for image defaults (non-sensitive only)
- Kubernetes `configMap` — for config (non-sensitive)
- Kubernetes `secret` — for credentials

Example:
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: veyebe-secrets
type: Opaque
stringData:
  SUPABASE_SERVICE_ROLE_KEY: "eyJhbGc..."
  GITHUB_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----..."
  AI_API_KEY: "sk-..."
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: veyebe-config
data:
  NODE_ENV: "production"
  VEYEBE_API_URL: "https://api.example.com"
  PORT: "3000"
```

Then in deployment spec:
```yaml
env:
  - name: NODE_ENV
    valueFrom:
      configMapKeyRef:
        name: veyebe-config
        key: NODE_ENV
  - name: SUPABASE_SERVICE_ROLE_KEY
    valueFrom:
      secretKeyRef:
        name: veyebe-secrets
        key: SUPABASE_SERVICE_ROLE_KEY
```
