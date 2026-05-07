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

## Production Deployment

ATG is prepared for a container-based VPS deployment:

- `npm start` runs `node server.mjs` so `/ws/game` WebSockets work in production.
- `.env.example` documents required app, storage, and hosted AI worker variables.
- `Dockerfile` builds a production image.
- `.github/workflows/ci.yml` runs checks and publishes a GHCR image on `main`.
- `/api/health` provides a deployment health check.

See [docs/deployment.md](docs/deployment.md) for the deployment checklist and migration notes.
