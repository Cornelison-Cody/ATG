# Codex SDK server-side editing

## Recommendation

Use the Codex SDK endpoint for dashboard AI edits. Local development runs the SDK
directly; production creates an isolated Azure Container Apps Job and streams job
state back through the web app.

## Prototype endpoint

`POST /api/chat/codex-sdk` accepts:

```json
{
  "projectId": "project-id",
  "editingTarget": "tv",
  "message": "Add a round timer"
}
```

It streams newline-delimited JSON events. The endpoint is enabled automatically
outside production. Production additionally requires `ENABLE_CODEX_SDK_PROTOTYPE=true`.
The dashboard sends edits to this endpoint.

## End-to-end flow

1. Apply the existing editor authentication check and reject concurrent work on
   the same project in the current process.
2. Export the project's allowlisted editable text files through the existing
   project storage abstraction.
3. Create a mode-`0700`, randomly named temporary workspace and write the files
   beneath `game/`.
4. Start or resume the project's Codex thread with:
   - `workspace-write` sandboxing
   - approval policy `never`
   - network access disabled
   - no additional writable directories
5. Stream sanitized thread, status, file-change, completion, and error events.
6. Re-read the temporary `game/` directory, reject symlinks and deletions, apply
   the existing path and size validation, and calculate the changed-file set.
7. Persist only validated changed files through the existing local/Azure project
   storage abstraction.
8. Persist the thread ID and final chat response, then recursively remove the
   temporary workspace.

The request's abort signal and `ATG_CODEX_SDK_TIMEOUT_MS` cancel long-running
turns. The default timeout is five minutes.

## Authentication

Account Settings selects the billing mode for each user:

- ATG-managed AI uses `ATG_MANAGED_OPENAI_API_KEY` when `ATG_MANAGED_AI_ENABLED=true`.
- BYOK uses the user's encrypted OpenAI API key.

Per-user API keys are encrypted with AES-256-GCM and bound to the authenticated
Entra identity. The selected key is resolved server-side for each request and is
never returned to the browser, logs, chat history, or project files. Production
job containers receive the key only through the authenticated job bundle request.

## Isolation and persistence

Each run receives a unique workspace. A run never receives the filesystem path
of the local project or another project. Azure-backed files are materialized in
the same way as local files, so Codex does not receive Cosmos DB or Blob Storage
credentials.

Only extensions accepted by `game-file-rules.mjs` can be read back. Files
outside `game/`, unsupported files, and SDK/CLI session files are not persisted.
Symlinks and deletion of existing game files fail the run.

Fixture tests run two projects concurrently and verify that their source and
result files do not cross workspace boundaries.

## Threads and recovery

The prototype stores the SDK thread ID in the project's existing
`codexThreadId`. SDK session data still lives in the runtime's Codex home
directory. Local resumes therefore work while that session data remains
available.

Azure executions intentionally start fresh Codex threads and include recent
project chat context because session files do not survive disposable jobs. Local
direct execution can resume threads while local Codex session data remains
available.

## Azure gaps

- The production endpoint now records work in the dedicated `codex-jobs` Cosmos
  container and starts a disposable manual Container Apps Job through the web
  app's managed identity.
- Each execution receives only a random job ID and short-lived job token. It
  fetches the selected project bundle and resolved API key over HTTPS, runs Codex
  inside the disposable outer container boundary, and uploads candidate files for
  validation and persistence by the main service.
- Job records expire from Cosmos after one day. Tokens are stored only as hashes
  and rotate at terminal completion.
- Azure executions intentionally start fresh Codex threads and include recent
  project chat context because rollout files do not survive disposable jobs.
- Local direct execution retains thread resume and retries once with a fresh
  thread only for the specific `no rollout found` failure.

Remaining production hardening:

- Replace the in-process project lock with a distributed project lease.
- Verify the Codex Linux binary and sandbox behavior in the final Container Apps
  image.
- Decide how Codex session files survive replica replacement.
- Define job idempotency so a retried request cannot persist twice.
- Add an explicit dashboard cancellation action that stops the Azure execution;
  replica timeout currently provides the terminal safety bound.
- Add structured logs containing project ID, job ID, workspace ID, thread ID,
  duration, result, and token usage, without prompts, file contents, or secrets.
- Measure cold start, workspace materialization, turn, and persistence latency in
  the deployed environment.

## Local validation

Run normal fixture tests:

```bash
npm test
```

Run the opt-in live SDK smoke test using the current Codex login:

```bash
ATG_RUN_CODEX_SDK_LIVE=true node --test \
  --test-name-pattern="live Codex SDK smoke test" \
  tests/codex-sdk-prototype.test.mjs
```

Start ATG normally, create a fixture project, and call the endpoint:

```bash
curl --no-buffer http://localhost:3000/api/chat/codex-sdk \
  -H 'Content-Type: application/json' \
  --data '{"projectId":"PROJECT_ID","editingTarget":"tv","message":"Add a heading"}'
```

### Initial measurement

The first local end-to-end request on July 1, 2026 used ChatGPT authentication,
materialized a fixture project, changed and persisted `instructions.md`, streamed
progress, stored the thread ID, and removed the workspace successfully.

- Endpoint duration: 13.4 seconds
- Input tokens: 57,250 total, including 39,936 cached
- Output tokens: 272
- Changed files persisted: 1

This is only a smoke-test sample, not a production cost model. ChatGPT
subscription runs consume plan limits rather than API-billed tokens. Azure
testing with per-user API keys must record uncached/cached input and output
tokens across representative game-editing prompts, then apply the current API
prices for the selected model.
