# Build Performance Notes

## Baseline

Measured on June 20, 2026.

Recent PR CI run `27881003579` completed in about 2 minutes 8 seconds:

- Install dependencies: 11 seconds.
- Typecheck and build: 27 seconds.
- Validate Bicep syntax: 19 seconds.
- Build Docker image: 65 seconds.

Local timings on a warm workspace:

- `npm run typecheck`: 1.5 seconds after Next.js generated route types exist.
- `npm run build`: 8.5 seconds.

Standalone `npm run typecheck` can fail on a fresh workspace if `.next/types` does not exist yet, because `tsconfig.json` includes generated Next.js route types. Running `npm run build` generates those types.

## Bottlenecks

- Docker image builds are the largest PR check cost.
- PR CI runs `npm run check` on the host and then builds the Docker image. Before this note, the Dockerfile also ran `npm run check`, which repeated standalone TypeScript checking inside the image.
- Docker dependency layers were not using GitHub Actions layer cache, so repeated CI and deploy builds could spend time rebuilding unchanged layers.
- Bicep validation is a smaller but still visible fixed cost at about 19 seconds.

## Current Optimizations

- Docker image builds run `npm run build` instead of the full `npm run check`; host CI and deploy jobs still run `npm run check` before Docker builds.
- CI and deploy Docker builds use GitHub Actions cache via `docker/build-push-action`.

## Follow-Ups

- Compare the next few PR run durations against the baseline above.
- If Docker remains the dominant cost, consider splitting image verification into a lighter PR job and reserving full image builds for `main`.
- Consider moving Bicep validation to only run when `infra/**` or workflow files change.
