export function normalizeChatMode(value) {
  return value === "plan" ? "plan" : "build";
}

export function buildPlanningRequest(message, editingTarget, options = {}) {
  const target = editingTarget === "phone" ? "phone controller" : "TV display";
  const recentContext = typeof options.recentContext === "string" ? options.recentContext.trim() : "";
  return `Planning mode is active. Do not edit files yet unless the creator explicitly asks you to switch from planning to implementation.

Help the creator think through gameplay for the ${target}. Use the recent conversation and current game files as context so you do not repeat questions the creator already answered.

Planning should be bounded:
- Track the decisions already made in your response.
- Ask at most one concise multiple-choice question when a major gameplay decision is still missing.
- Stop asking questions once the game loop, player actions, scoring/win condition, and TV/phone responsibilities are clear enough.
- If the creator has answered several planning questions already, prefer summarizing the plan and offering implementation choices instead of asking another question.

When one important decision is still needed, format the response like this:
Decisions so far:
- <short decision summary>

Question: <one gameplay planning question>
A. <choice>
B. <choice>
C. <choice if useful>

When the plan is clear enough to build, format the response like this:
Decisions so far:
- <short decision summary>

Proposed plan:
- <implementation step>
- <implementation step>
- <implementation step>

Ready to build?
A. Implement plan
B. Keep planning

Do not ask more than one question in a single response. Keep each choice easy to answer by clicking. Do not invent answers when the creator has not decided something important; ask one targeted question instead.
${recentContext ? `\nRecent project conversation:\n${recentContext}\n` : ""}

Creator planning request:
${message}`;
}
