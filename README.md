# Veyebe

**See what you're building. Know what to do next.**

Veyebe is a local-first project intelligence workspace. The desktop client scans a software project without uploading source, maps product features to implementation evidence, and turns gaps into explainable next actions. The mobile companion keeps that project pulse close at hand.

## Development

```bash
npm install
npm run dev:web
```

The browser demo runs without credentials. Desktop folder scanning is available through `npm run dev:desktop`; mobile starts with `npm run dev:mobile`; the optional sync API starts with `npm run dev:api`.

Copy `.env.example` to `.env` only when enabling Supabase, GitHub, or a cloud AI provider. Raw source is never included in the sync payload.
