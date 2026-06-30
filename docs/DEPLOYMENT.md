# Deployment & Operations Guide

## Production Readiness Checklist

- [ ] All environment variables configured (see `.env.example`)
- [ ] NODE_ENV=production set in container
- [ ] VEYEBE_API_URL points to production domain (not localhost)
- [ ] Supabase project provisioned with backup enabled
- [ ] Error tracking integrated (Sentry, DataDog, or equivalent)
- [ ] Log aggregation configured (CloudWatch, ELK, or Datadog)
- [ ] Health checks configured in load balancer
- [ ] SSL/TLS certificate installed and auto-renewal enabled
- [ ] Database replicas configured for failover
- [ ] Backup export tested and automated

## API Server

### Environment Variables (Required for Production)

```bash
NODE_ENV=production                    # Disables verbose logging
SUPABASE_URL=https://...supabase.co   # Production Supabase URL
SUPABASE_SERVICE_ROLE_KEY=...         # Service role key (keep secret)
SUPABASE_ANON_KEY=...                 # Anon key for client auth
PORT=3000                              # Container port
HOST=0.0.0.0                          # Listen on all interfaces
VEYEBE_API_URL=https://api.example.com # Desktop/mobile clients use this
```

### Graceful Shutdown

The API server handles SIGTERM and SIGINT signals:
- Closes active connections
- Waits for pending requests
- Exits with code 0 if successful

**Container restart timeout should be ≥ 30s.**

### Health Check

```bash
curl http://localhost:3000/health
# { "status": "ok", "storage": "supabase", "version": 1 }
```

Use this endpoint in Kubernetes liveness probes (interval: 15s, timeout: 5s).

### Logging

Structured JSON logs (when NODE_ENV=production):
```json
{
  "level": "info",
  "message": "Request processed",
  "timestamp": "2026-06-30T12:00:00Z",
  "statusCode": 202,
  "duration_ms": 145
}
```

### Worker Process

Background job polling runs on a separate process. Restart it if:
- Supabase configuration changes
- New job handlers are deployed

The worker gracefully drains jobs on SIGTERM.

---

## Database Backups

### Supabase Managed Backups

Supabase provides automated daily backups (24-hour retention on Free tier, 30-day on Pro).

**Manual backup (before major changes):**
```bash
pg_dump postgresql://user:pass@db.example.com/veyebe > backup-$(date +%s).sql
```

**Recovery procedure:**
1. Provision new Supabase project or restore to existing
2. Import SQL: `psql < backup-xxx.sql`
3. Run migrations: `supabase db push`
4. Verify row counts in critical tables

---

## Monitoring & Alerting

### Critical Alerts to Configure

| Metric | Threshold | Action |
|--------|-----------|--------|
| API error rate | > 5% in 5min | Page on-call |
| Worker job failures | 3+ in 1h | Check Supabase connectivity |
| /health endpoint down | Any | Kill + restart pod |
| DB connection pool exhausted | Any | Increase pool size, restart app |

### Logs to Monitor

Search production logs for:
- `"level": "error"` — application errors
- `statusCode: 5xx` — server failures
- `errorCode: PGSQL` — database failures
- Job processing errors in background_jobs table

---

## Desktop Client Deployment

The Electron app expects `VEYEBE_API_URL` environment variable. If unset, defaults to localhost (dev mode).

**Distribution:**
- Signed builds required for auto-updates
- Update server URL must be configured
- Code signing certificate should be in CI secrets

---

## Mobile Client Deployment

Requires `EXPO_PUBLIC_API_URL` (public env var).

**EAS Build:**
```bash
eas build --platform all --auto-submit
```

Ensure `EXPO_PUBLIC_API_URL` is set in EAS secrets.

---

## Incident Response

### Database Corruption

If `privacy_audit_log` or `scan_snapshots` becomes inconsistent:
1. Restore from backup: `pg_restore backup-xxx.sql`
2. Re-sync projects from clients
3. Verify record counts match pre-incident

### Worker Deadlock

If jobs accumulate in "running" status:
1. Check `background_jobs.locked_at` timestamps
2. Manual fix: `UPDATE background_jobs SET status='queued' WHERE locked_at < now() - interval '1 hour'`
3. Restart worker process

### API Overload

Rate-limit detection: monitor `statusCode: 429` in logs.
- Check for runaway scans (bad client logic)
- Increase instance size or enable horizontal scaling

---

## Security Checklist

- [ ] HTTPS only (redirect HTTP → HTTPS)
- [ ] Supabase row-level security enabled (verified in DB)
- [ ] GitHub webhook secret configured and validated
- [ ] AI provider API keys rotated quarterly
- [ ] Sensitive logs scrubbed (no private keys in output)
- [ ] Database backups encrypted at rest
- [ ] Only service role key stored in server; anon key public but scoped

---

## Local Development vs Production

| Component | Dev | Production |
|-----------|-----|------------|
| VEYEBE_API_URL | http://localhost:4317 | https://api.example.com |
| NODE_ENV | development | production |
| Logging | Verbose (stdout) | Structured JSON |
| CORS | Disabled | Disabled (same-origin clients) |
| Supabase | Local emulator | Managed cloud |

---

## Scaling

**Horizontal scale API layer:**
- Stateless server; multiple instances behind load balancer
- Session state in Supabase (no sticky sessions needed)
- Use connection pooling (Supabase default: 10 connections/project)

**Worker scaling:**
- Only one worker instance should poll `background_jobs` (FIFO order)
- Increase job batch size in `claim_veyebe_jobs` if latency acceptable

**Database scaling:**
- Supabase handles vertical scaling automatically
- Enable read replicas for reporting queries (not in v0.1.0 scope)

---

## Rollback Procedure

If a deployment fails:

```bash
# Revert to previous container image
kubectl set image deployment/veyebe-api veyebe-api=registry/veyebe:previous-tag

# Check health
kubectl logs deployment/veyebe-api
curl https://api.example.com/health
```

Database migrations cannot be rolled back (immutable logs). If migration breaks:
1. Restore from backup
2. Fix migration
3. Re-deploy

---

## Support Contacts

- On-call: [Link to runbook or escalation path]
- Supabase status: https://status.supabase.io
- GitHub API issues: https://www.githubstatus.com
