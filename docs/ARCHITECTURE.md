# Veyebe architecture

Veyebe treats a project as an evidence graph rather than a task list.

```text
local folder / GitHub metadata
           |
           v
  desktop scanner process -----> local SQLite cache
           |
           v
 normalized ScanSnapshot
           |
     +-----+-------------------+
     |                         |
     v                         v
feature proposals       privacy-reviewed sync payload
     |                         |
     v                         v
Living Constellation      Supabase + API worker
     |                         |
     +----------+--------------+
                v
        recommendation stream
```

## Trust boundary

The desktop scanner is the only subsystem permitted to read raw source. Renderer code receives a normalized snapshot through a narrow validated IPC bridge. The cloud boundary accepts only the explicit sync payload produced by the privacy projector; the projector removes absolute paths, source content, command output, secrets, and unapproved free text.

## Runtime responsibilities

- **Electron main process:** windows, folder selection, safe IPC registration, scanner lifecycle, and local persistence.
- **Scanner utility process:** filesystem traversal, language adapters, Git inspection, deterministic metrics, feature evidence, and privacy projection.
- **Desktop renderer:** onboarding, Living Constellation, architecture lens, evidence inspection, action decisions, and timeline.
- **Mobile:** synchronized project pulse, simplified constellation, approvals, milestones, and critical alerts. It never scans local folders.
- **API/worker:** authenticated derived-state sync, GitHub webhook normalization, optional semantic inference, and continuous recommendation updates.
- **Supabase:** workspace-scoped derived state, row-level security, authentication, and realtime delivery.

## Invariants

1. A recommendation must reference evidence and state why it exists.
2. AI may propose feature state; only user confirmation makes it accepted project truth.
3. Actual events and planned milestones remain distinct.
4. The 3D scene and accessible list are projections of the same domain data.
5. Scanning never executes repository code. Verification commands require an explicit saved profile and user action.
6. Missing Git history reduces capability confidence but never prevents a useful scan.

## Future team evolution

All synchronized entities carry a workspace identifier, but v1 exposes a single personal workspace. Invitations, granular roles, comments, billing, GitLab, Linear, and Jira are intentionally deferred until the daily recommendation loop is validated.
