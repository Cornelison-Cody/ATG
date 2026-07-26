export function formatAzureCodexJobStartError(status, body) {
  const parsed = parseAzureError(body);
  if (parsed?.code === "AuthorizationFailed") {
    const action = extractQuotedValue(parsed.message, /perform action '([^']+)'/);
    const scope = extractQuotedValue(parsed.message, /over scope '([^']+)'/);
    const details = [
      action ? `missing action: ${action}` : "",
      scope ? `scope: ${scope}` : ""
    ].filter(Boolean).join("; ");
    return [
      `Unable to start isolated Codex job (${status}): the Azure Container App managed identity is missing RBAC permission to start the Codex Container Apps Job.`,
      details ? ` ${details}.` : "",
      " Run the one-time Codex job RBAC bootstrap from the deployment workflow, then retry the build or plan request."
    ].join("");
  }

  return `Unable to start isolated Codex job (${status}): ${body}`;
}

function parseAzureError(body) {
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === "object" && parsed.error && typeof parsed.error === "object"
      ? parsed.error
      : null;
  } catch {
    return null;
  }
}

function extractQuotedValue(message, pattern) {
  if (typeof message !== "string") return "";
  const match = message.match(pattern);
  return match ? match[1] : "";
}
