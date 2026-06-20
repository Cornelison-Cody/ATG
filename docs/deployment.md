# ATG Azure Deployment

ATG deploys to Azure Container Apps with the existing custom Node/Next/WebSocket server. The first Azure target uses Container Apps consumption, Cosmos DB free tier for project metadata/chat, Blob Storage for editable game files, GHCR for images, and GitHub Actions OIDC for deployment.

## Azure resources

The Bicep template in `infra/main.bicep` creates:

- Container Apps environment and Container App.
- Log Analytics workspace.
- Cosmos DB NoSQL account, `atg` database, and `projects` container.
- Storage account and private `game-assets` blob container.
- Container App secrets and environment variables for the Azure storage backend.

The default Azure region is `westus`.

## Required GitHub configuration

Create a GitHub `production` environment and configure these repository or environment variables:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_RESOURCE_GROUP`
- `AZURE_LOCATION` set to `westus`
- `AZURE_ENVIRONMENT_NAME` set to `prod`
- `APP_BASE_URL` optional on first deploy; leave blank to use the generated Container Apps URL.
- `AI_WORKER_URL`
- `ENTRA_TENANT_ID`
- `ENTRA_CLIENT_ID`
- `GHCR_USERNAME` if the GHCR package is private

Configure these secrets:

- `AI_WORKER_TOKEN`
- `ENTRA_CLIENT_SECRET`
- `GHCR_TOKEN` with `read:packages` if the GHCR package is private
- `OPENAI_API_KEY`

The Azure identity used by GitHub Actions needs permissions to create/update resources in the target resource group. Configure it with an OIDC federated credential for:

- Organization/repo: `Cornelison-Cody/ATG`
- Branch: `main`
- Environment: `production`, if using environment-scoped federation.

## Deployment flow

- Pull requests run `npm run check`, validate Bicep syntax, and build the Docker image.
- Pushes to `main` run `.github/workflows/azure-deploy.yml`.
- The deploy workflow builds and pushes the image to GHCR, deploys Bicep, updates the Container App image, and checks `/api/health`.
- If the GHCR package is private, set `GHCR_USERNAME` and `GHCR_TOKEN` so Container Apps can pull the image.

## App behavior in Azure

- `ATG_STORAGE_BACKEND=azure` stores project metadata and chat in Cosmos DB.
- Editable game files are stored in Blob Storage under project-scoped keys.
- `/`, `/tv/*`, `/join/*`, `/ws/game`, join-info, health, and game asset routes remain public.
- Dashboard, editor, chat, and project mutation routes require Entra-backed Container Apps auth headers in production.
- The Bicep template enables Container Apps authentication when `ENTRA_CLIENT_SECRET` is provided. Its global validation allows anonymous traffic so TV/phone routes can stay public; the app middleware enforces editor-only auth.
- `AI_WORKER_URL` is required for production chat editing. Local Codex CLI execution stays disabled in production.

## Local development

Local development keeps the filesystem backend by default:

```bash
npm install
npm run dev
```

Use `ATG_STORAGE_BACKEND=azure` only when testing against deployed Azure resources.
