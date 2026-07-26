import assert from "node:assert/strict";
import test from "node:test";
import { formatAzureCodexJobStartError } from "../lib/codex-job-launcher-errors.mjs";

test("Azure authorization failures explain the missing Codex job RBAC", () => {
  const message = formatAzureCodexJobStartError(403, JSON.stringify({
    error: {
      code: "AuthorizationFailed",
      message: "The client 'client-id' with object id 'object-id' does not have authorization to perform action 'Microsoft.App/jobs/start/action' over scope '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.App/jobs/job-name' or the scope is invalid."
    }
  }));

  assert.match(message, /managed identity is missing RBAC permission/);
  assert.match(message, /Microsoft\.App\/jobs\/start\/action/);
  assert.match(message, /\/subscriptions\/sub\/resourceGroups\/rg\/providers\/Microsoft\.App\/jobs\/job-name/);
  assert.match(message, /Container Apps Jobs Operator/);
  assert.match(message, /one-time Codex job RBAC bootstrap/);
});

test("non-Azure authorization failures preserve the response body", () => {
  const message = formatAzureCodexJobStartError(500, "service unavailable");

  assert.equal(message, "Unable to start isolated Codex job (500): service unavailable");
});
