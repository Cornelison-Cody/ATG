# ATG Azure Deployment

ATG deploys to Azure Container Apps with the existing custom Node/Next/WebSocket server. The first Azure target uses Container Apps consumption, Cosmos DB free tier for project metadata/chat, Blob Storage for editable game files, GHCR for images, and GitHub Actions OIDC for deployment.

## Azure resources

The Bicep template in `infra/main.bicep` creates:

- Container Apps environment and Container App.
- Log Analytics workspace.
- Cosmos DB NoSQL account, `atg` database, and `projects`, `user-settings`, `codex-jobs`, and `ai-usage-budget` containers.
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
- `ENABLE_CODEX_SDK_PROTOTYPE` set to `true` to route dashboard chat through the server-side SDK.
- `ENTRA_TENANT_ID`
- `ENTRA_CLIENT_ID`
- `GHCR_USERNAME` if the GHCR package is private

Configure these secrets:

- `AI_WORKER_TOKEN`
- `ENTRA_CLIENT_SECRET`
- `GHCR_TOKEN` with `read:packages` if the GHCR package is private
- `OPENAI_API_KEY`
- `ATG_USER_SETTINGS_ENCRYPTION_KEY`, generated once with `openssl rand -base64 32`.

The Azure identity used by GitHub Actions needs permissions to create/update resources in the target resource group. Configure it with an OIDC federated credential for:

- Organization/repo: `Cornelison-Cody/ATG`
- Branch: `main`
- Environment: `production`, if using environment-scoped federation.

Routine deployments do not create Azure role definitions or assignments, so the
GitHub deployment identity does not need elevated RBAC-administration access.

After the first deployment that creates the Codex Container Apps Job, an Azure
Owner or User Access Administrator must run the one-time command printed by the
`Show one-time Codex job RBAC bootstrap` workflow step:

```bash
az role assignment create \
  --assignee-object-id "<container-app-principal-id>" \
  --assignee-principal-type ServicePrincipal \
  --role "Container Apps Contributor" \
  --scope "<codex-job-resource-id>"
```

The assignment is scoped to the single Codex Job resource. It lets the web app
start and inspect that job without granting it access to other Container Apps
resources. Re-running the assignment is unnecessary unless the Container App
managed identity or job resource is replaced.

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
- `AI_WORKER_URL` remains the preferred production chat editing path. If it is unset, trusted beta deployments can set `ENABLE_LOCAL_COMPANION=true` and `ATG_COMPANION_TOKEN` to let a user-run companion process pick up editing jobs from their own machine.
- Direct local Codex CLI execution stays disabled inside the production web container.
- When `ENABLE_CODEX_SDK_PROTOTYPE=true`, dashboard chat uses the Codex SDK endpoint. A user's encrypted account API key takes precedence over the optional process-wide `OPENAI_API_KEY`.
- Per-user OpenAI API keys are stored in the dedicated Cosmos DB `user-settings` container. Keep `ATG_USER_SETTINGS_ENCRYPTION_KEY` stable across deployments; rotating it requires re-encrypting or clearing existing keys.
- ATG-local AI usage estimates and monthly budget preferences are stored in the dedicated Cosmos DB `ai-usage-budget` container. If Account Settings usage calls fail after an image-only deployment, rerun the Bicep deployment so this container and `AZURE_COSMOS_AI_USAGE_CONTAINER` are present.
- Deployed Codex edits run in a manual Container Apps Job. The web app managed
  identity receives `Container Apps Contributor` scoped only to that job through
  the one-time RBAC bootstrap. The execution receives a short-lived job token
  rather than Cosmos, Blob, Entra, or account-key encryption secrets.
- Run the local companion from a trusted machine with Codex installed:

```bash
ATG_BASE_URL=https://atg.example.com \
ATG_COMPANION_TOKEN=change-me \
npm run companion
```

The companion opens outbound HTTPS requests to ATG, downloads only editable `game/` text files into a temporary local workspace, runs `codex exec`, and uploads changed `game/` text files back to the app. Do not use this beta mode for untrusted public users.

## Local development

Local development keeps the filesystem backend by default:

```bash
npm install
npm run dev
```

Use `ATG_STORAGE_BACKEND=azure` only when testing against deployed Azure resources.
