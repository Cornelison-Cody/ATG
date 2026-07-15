import { getAuthenticatedUserId } from "@/lib/auth";
import { requireEditorAuth } from "@/lib/api-auth";
import {
  deleteMonthlyBudget,
  getUsageBudgetSummary,
  saveMonthlyBudget,
  UsageBudgetError
} from "@/lib/usage-budget.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateUser(request);
  if (auth instanceof Response) {
    return auth;
  }
  return Response.json(await getUsageBudgetSummary(auth));
}

export async function PUT(request: Request) {
  const auth = await authenticateUser(request);
  if (auth instanceof Response) {
    return auth;
  }

  try {
    const body = (await request.json()) as { monthlyBudgetUsd?: unknown };
    await saveMonthlyBudget(auth, body.monthlyBudgetUsd);
    return Response.json(await getUsageBudgetSummary(auth));
  } catch (error) {
    return usageBudgetErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const auth = await authenticateUser(request);
  if (auth instanceof Response) {
    return auth;
  }

  try {
    await deleteMonthlyBudget(auth);
    return Response.json(await getUsageBudgetSummary(auth));
  } catch (error) {
    return usageBudgetErrorResponse(error);
  }
}

async function authenticateUser(request: Request) {
  const authResponse = await requireEditorAuth(request);
  if (authResponse) {
    return authResponse;
  }
  const userId = getAuthenticatedUserId(request);
  return userId || Response.json({ error: "A user identity is required." }, { status: 401 });
}

function usageBudgetErrorResponse(error: unknown) {
  if (error instanceof UsageBudgetError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json({ error: "Unable to update AI usage budget settings." }, { status: 500 });
}
