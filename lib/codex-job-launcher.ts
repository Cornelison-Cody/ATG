import { ManagedIdentityCredential } from "@azure/identity";
import { formatAzureCodexJobStartError } from "@/lib/codex-job-launcher-errors.mjs";

export async function startAzureCodexJob(jobId: string, token: string) {
  const subscriptionId = required("AZURE_SUBSCRIPTION_ID");
  const resourceGroup = required("AZURE_RESOURCE_GROUP");
  const jobName = required("ATG_CODEX_JOB_NAME");
  const image = required("ATG_CODEX_JOB_IMAGE");
  const baseUrl = required("APP_BASE_URL");
  const credential = new ManagedIdentityCredential();
  const access = await credential.getToken("https://management.azure.com/.default");
  if (!access) throw new Error("Unable to acquire an Azure management token.");

  const url = `https://management.azure.com/subscriptions/${encodeURIComponent(subscriptionId)}/resourceGroups/${encodeURIComponent(resourceGroup)}/providers/Microsoft.App/jobs/${encodeURIComponent(jobName)}/start?api-version=2025-07-01`;
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${access.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      containers: [{
        name: "codex-job",
        image,
        command: ["node", "scripts/atg-codex-job.mjs"],
        env: [
          { name: "ATG_BASE_URL", value: baseUrl },
          { name: "ATG_CODEX_JOB_ID", value: jobId },
          { name: "ATG_CODEX_JOB_TOKEN", value: token }
        ],
        resources: { cpu: 1, memory: "2Gi" }
      }]
    })
  });
  if (!response.ok) {
    throw new Error(formatAzureCodexJobStartError(response.status, await response.text()));
  }
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required to start Azure Codex jobs.`);
  return value;
}
