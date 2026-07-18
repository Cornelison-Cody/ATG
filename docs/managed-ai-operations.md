# ATG-managed AI closed-beta operations

This runbook covers the OpenAI project, service account, deployment secret, and
weekly operating checks for ATG-funded AI during the trusted closed beta.

Never paste an OpenAI API key or other secret into GitHub issues, pull requests,
comments, logs, screenshots, docs, chat transcripts, or shell history.

## Ownership

- Primary owner: production operator with access to the OpenAI organization
  project and GitHub `production` environment.
- Backup owner: second production operator with the same access and break-glass
  authority.
- Review cadence: weekly during the closed beta, and immediately after invite
  list, budget, model, or deployment-secret changes.

Store owner names in the private operations tracker, not in this repository.

## OpenAI project setup

1. Create a dedicated OpenAI organization project for ATG closed-beta traffic.
2. Name the project so it is clearly separate from personal, development, and
   user BYOK traffic.
3. Create a project service account for the deployed ATG application.
4. Restrict model access to only the Codex model or models ATG supports, where
   the OpenAI project controls permit it.
5. Configure conservative project rate limits for a small trusted beta.
6. Configure monthly project budget notifications with multiple thresholds,
   for example 50%, 80%, and 100% of the expected beta budget.
7. Remember that OpenAI project budgets are soft alerts. They do not stop
   requests; ATG enforcement happens through `ATG_MANAGED_AI_ENABLED`,
   `ATG_MANAGED_AI_BETA_ALLOWLIST`, and the internal managed-credit ledger.

The starting monthly OpenAI project budget should cover:

```text
($5 * invited_user_count) + safety_margin
```

Use a safety margin that covers retries and smoke tests but is still low enough
to alert operators before spend becomes surprising.

## Deployment secret

Generate the service-account API key only inside the approved secret-management
flow. Store it as exactly one of:

- GitHub `production` environment secret `ATG_MANAGED_OPENAI_API_KEY`.
- An Azure-managed secret that the Container App references as
  `ATG_MANAGED_OPENAI_API_KEY`.

Do not reuse this key for BYOK, development, local testing, personal projects, or
one-off Codex runs. User BYOK credentials remain encrypted in the `user-settings`
container and must not be copied into the managed-AI secret.

Only the main ATG service should resolve the managed key. The isolated Codex
Container Apps Job receives the resolved key only through the authenticated,
short-lived job bundle request, alongside the scoped project files and prompt.
The job definition itself must not contain `ATG_MANAGED_OPENAI_API_KEY`.

## Beta eligibility

Keep the invited and ATG-funded beta population explicit:

- Set GitHub environment variable `ATG_MANAGED_AI_BETA_ALLOWLIST` to a
  comma-separated list of Entra principal ids or principal names.
- Use the same identifier shape that ATG receives from
  `x-ms-client-principal-id`, `x-ms-client-principal-name`, or authenticated
  service-principal token claims.
- Use `*` only for a deliberate open-beta moment.
- Remove users from the allowlist when they leave the trusted beta or should move
  to BYOK only.

Managed mode requires all of these to be true:

- `ATG_MANAGED_AI_ENABLED=true`
- `ATG_MANAGED_OPENAI_API_KEY` is configured in approved secret storage
- the authenticated user is present in `ATG_MANAGED_AI_BETA_ALLOWLIST`
- the user's monthly ATG-managed credit has available balance

BYOK remains available when a user has saved and tested a personal OpenAI API
key, even if managed mode is disabled or the user is not in the allowlist.

## Deployment checks

After deployment, confirm the managed key is absent from these places:

- GitHub issue and pull request content.
- Container Apps Job template, secrets, environment variables, and execution
  history.
- Azure logs, diagnostics, and Log Analytics query results.
- Browser responses and dashboard JSON payloads.
- Cosmos `codex-jobs`, `projects`, `user-settings`, and `ai-usage-budget`
  records.
- Project files, chat history, and generated game assets.

Use metadata-only checks. Do not print the secret while checking for it.

Suggested Azure checks:

```bash
az containerapp job show \
  --name "$ATG_CODEX_JOB_NAME" \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --query "properties.template.containers[].env[].name"

az containerapp show \
  --name "$ATG_CONTAINER_APP_NAME" \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --query "properties.template.containers[].env[].name"
```

The Container App may list the `ATG_MANAGED_OPENAI_API_KEY` environment variable
name as a secret reference. The Codex Job should list only job-scoped values such
as `ATG_BASE_URL`, `ATG_CODEX_JOB_ID`, and `ATG_CODEX_JOB_TOKEN`.

## Managed-mode smoke test

Run this after the OpenAI project, production secret, allowlist, isolated Codex
job RBAC bootstrap, and service-principal smoke-test credentials are configured:

1. Set `ATG_MANAGED_AI_ENABLED=true`.
2. Add the smoke-test principal to `ATG_MANAGED_AI_BETA_ALLOWLIST`.
3. Create or select a non-production fixture project.
4. Choose ATG-managed AI for the smoke-test principal.
5. Send a small dashboard Codex edit that should touch only an editable fixture
   file.
6. Confirm the request starts an isolated Container Apps Job, streams status, and
   persists the expected file change.
7. Confirm the managed ledger records a reservation and reconciliation without
   storing prompts, file contents, or API keys.
8. Compare ATG's local estimate with the OpenAI project usage dashboard for the
   same time window. Treat OpenAI as authoritative for billing.

After the smoke test, remove any fixture project and remove the smoke-test
principal from the allowlist unless it is also a real beta account.

## Kill switch

To disable ATG-managed AI without disabling BYOK:

1. Set GitHub environment variable `ATG_MANAGED_AI_ENABLED=false`.
2. Run the production deployment workflow.
3. Confirm Account Settings reports managed AI as temporarily unavailable.
4. Confirm users with saved personal keys can still run BYOK edits.

For an incident response where deployment cannot wait, revoke the OpenAI service
account key in the OpenAI project, then deploy the kill switch and rotate the
secret before re-enabling managed mode.

## Rotation

1. Create a replacement service-account key in the ATG OpenAI project.
2. Store it in the approved secret destination as `ATG_MANAGED_OPENAI_API_KEY`.
3. Deploy production.
4. Run the managed-mode smoke test.
5. Revoke the previous service-account key in OpenAI.
6. Record the rotation date, operator, and reason in the private operations
   tracker.

Do not keep overlapping active keys longer than the deployment and smoke-test
window requires.

## Weekly reconciliation

During the closed beta:

1. Export or review OpenAI project usage and cost for the current UTC month.
2. Review ATG's `ai-usage-budget` managed ledger for reservations,
   reconciliations, failed-job releases, and per-user remaining credit.
3. Compare OpenAI project costs against ATG's local estimates. Investigate
   mismatches larger than expected model-pricing or timing differences.
4. Review failed Codex jobs for repeated retries or prompts that consume credit
   without user-visible value.
5. Check the invite list against `ATG_MANAGED_AI_BETA_ALLOWLIST`.
6. Adjust the OpenAI project budget alerts and rate limits as the beta size
   changes.

OpenAI project usage is the billing source of truth. ATG's internal ledger is
the product entitlement and reconciliation trail.

## Emergency revocation

1. Disable or revoke the service-account key in the OpenAI project.
2. Set `ATG_MANAGED_AI_ENABLED=false` and deploy.
3. Search recent logs and job records for suspicious managed-mode activity
   without printing secret values.
4. Create a replacement key only after the incident is understood.
5. Rotate `ATG_MANAGED_OPENAI_API_KEY`, smoke test, and re-enable managed mode
   only when the owner and backup owner agree.
6. Record the incident timeline and actions in the private operations tracker.
