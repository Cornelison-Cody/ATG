# Azure Tides Gaming

Azure Tides Gaming builds immersive gaming experiences inspired by oceanic worlds and competitive play.
ATG stands for Azure Tides Gaming.

## Status

Local MVP with project workspaces, Codex chat, TV runtime, phone controllers, and WebSocket game rooms.

## Development

```bash
npm install
npm run dev
```

The development server runs the custom Node/Next/WebSocket server at `http://localhost:3000`.

## AI Usage and Budgets

Account Settings tracks token usage and estimated cost for Codex edits made through ATG. Users can set an optional monthly ATG budget for visibility, but BYOK edits are not blocked when that informational budget is exceeded.

ATG keeps local usage records scoped to the signed-in user and does not store prompts, generated file contents, or OpenAI API keys in the usage ledger. Cost values are estimates calculated from server-maintained model pricing; unknown model prices show token totals without a dollar estimate.

Normal OpenAI project API keys cannot read organization-wide Costs API data or a universal remaining-credit balance. Users should use the official [OpenAI Usage Dashboard](https://platform.openai.com/usage) for authoritative account billing, because ATG-local totals only cover requests made through ATG.

## Production Deployment

ATG is prepared for a container-based VPS deployment:

- `npm start` runs `node server.mjs` so `/ws/game` WebSockets work in production.
- `.env.example` documents required app, storage, and hosted AI worker variables.
- `Dockerfile` builds a production image.
- `.github/workflows/ci.yml` runs checks and publishes a GHCR image on `main`.
- `/api/health` provides a deployment health check.

See [docs/deployment.md](docs/deployment.md) for the deployment checklist and migration notes.
