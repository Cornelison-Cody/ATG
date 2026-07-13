export function normalizeChatMode(value) {
  return value === "plan" ? "plan" : "build";
}

export function buildPlanningRequest(message, editingTarget) {
  const target = editingTarget === "phone" ? "phone controller" : "TV display";
  return `Planning mode is active. Do not edit files yet unless the creator explicitly asks you to switch from planning to implementation.

Help the creator think through gameplay for the ${target}. Ask 3 to 5 concise multiple-choice questions that clarify the game loop, player actions, win/loss conditions, feedback, pacing, and content needs. Use lettered choices like A, B, and C. Keep each question easy to answer from a phone or keyboard. If the request already answers a category, skip that category and ask about the next most useful gameplay decision.

Creator planning request:
${message}`;
}
