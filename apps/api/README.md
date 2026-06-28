# Veyebe sync API

The API is optional: the mobile demo works offline and desktop analysis remains local. Configure Supabase to persist reviewed derived metadata. Without it, the API uses an in-memory store suitable for development.

## Routes

- `GET /health` — deployment and storage health.
- `POST /v1/privacy/audit` — previews why a payload would be blocked.
- `POST /v1/scans` — validates and stores a redacted scan snapshot.
- `PATCH /v1/recommendations/:id` — accepts, dismisses, or snoozes an action.
- `POST /v1/github/webhooks` — verifies SHA-256 signatures and deduplicates supported GitHub App events.

Only structured, derived metadata belongs in this service. Raw source, absolute paths, command output, secrets, and provider tokens are rejected by the shared privacy audit. The AI adapter is provider-neutral and also runs that audit before any network request.
