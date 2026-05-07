# ATG Production Deployment Checklist

ATG is moving from a local-only proof of concept to a container-hosted service. The first production target is a container-based VPS running the custom Node/Next/WebSocket server.

## Production readiness

- Configure environment variables from `.env.example`.
- Run the app with `npm start` or `node server.mjs`; this preserves `/ws/game` WebSocket support.
- Set `APP_BASE_URL` to the public HTTPS origin so TV QR codes and phone clients use production URLs.
- Mount durable storage at `ATG_DATA_ROOT` while the filesystem-backed store is still active.
- Use `/api/health` for container and reverse-proxy health checks.

## Codex and hosted AI worker

Production must not depend on a local desktop Codex CLI. `/api/chat` now uses:

- `AI_WORKER_URL` when configured, POSTing to `${AI_WORKER_URL}/chat`.
- Local `codex exec` only in development or when `ENABLE_LOCAL_CODEX=true`.

The worker response must be newline-delimited JSON events compatible with the app chat stream:

- `{ "type": "status", "message": "..." }`
- `{ "type": "session", "sessionId": "..." }`
- `{ "type": "final", "message": "..." }`
- `{ "type": "error", "message": "..." }`

The worker should load project data from durable storage, edit only the selected project's `game/` files, persist changes, and preserve conversation context.

## Storage migration

Current local storage remains filesystem-backed:

- Project metadata and chat: `.atg/projects.json`
- Game files: `projects/<slug>/game/*`

Production migration target:

- Database tables for projects and chat messages.
- Object storage or DB-backed file rows for editable game files.
- One-time import from local `.atg/projects.json` and `projects/`.

See `migrations/001_initial_schema.sql` for the proposed schema.

## VPS deployment outline

1. Provision VPS with Docker and a reverse proxy.
2. Point DNS to the VPS.
3. Configure TLS.
4. Pull the published image from GHCR.
5. Run the container with secrets and `ATG_DATA_ROOT` mounted.
6. Ensure reverse proxy forwards WebSocket upgrades to `/ws/game`.
7. Check `/api/health`.
8. Open the dashboard, TV route, and phone route.

## Rollback

- Keep the previous image tag from GitHub Actions.
- If `/api/health` fails after deploy, restart the container using the previous image.
- Keep database migrations backward-compatible until rollback policy is formalized.
