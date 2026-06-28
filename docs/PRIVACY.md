# Privacy model

Veyebe is local-first by construction, not merely by policy.

## Local-only data

- Raw source and file contents
- Absolute filesystem paths
- Unredacted command output
- Environment variables and credentials
- Local Git remotes containing embedded credentials
- Incremental file indexes and hashes

## Eligible derived data

Only a user-previewed projection may be synchronized:

- Project-scoped opaque identifiers
- Language and framework capabilities
- Aggregate file, test, TODO, churn, and verification metrics
- Relative logical module labels after secret scanning
- User-approved feature names, milestones, and acceptance criteria
- Evidence kinds and locations without source excerpts
- Recommendation rationale generated from eligible fields

## Controls

- The privacy preview shows the exact JSON envelope before first sync.
- Sync can be disabled per project without disabling local analysis.
- Every cloud write records category, schema version, timestamp, and originating scan—not source text.
- Command execution is opt-in, uses executable/argument arrays, has a timeout and environment allowlist, and keeps raw output local.
- Deleting a project removes synchronized derivatives; local cache deletion is a separate explicit action.

## Verification

Automated tests assert that source contents, absolute roots, secret-shaped values, and raw command output cannot appear in a sync payload. Release validation additionally inspects network traffic from a representative scan.
