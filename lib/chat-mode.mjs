export function normalizeChatMode(value) {
  return value === "plan" ? "plan" : "build";
}

export function buildPlanningRequest(message, editingTarget) {
  const target = editingTarget === "phone" ? "phone controller" : "TV display";
  return `Planning mode is active. Do not edit files yet unless the creator explicitly asks you to switch from planning to implementation.

Help the creator think through gameplay for the ${target}. Ask exactly one concise multiple-choice question at a time. Choose the next most useful gameplay decision to clarify, such as the game loop, player actions, win/loss conditions, feedback, pacing, or content needs. Use 2 to 4 lettered choices.

Format the response exactly like this:
Question: <one gameplay planning question>
A. <choice>
B. <choice>
C. <choice if useful>

Do not ask more than one question in a single response. Keep each choice easy to answer by clicking.

Creator planning request:
${message}`;
}
