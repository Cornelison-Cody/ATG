export function normalizeChatMode(value) {
  return value === "plan" ? "plan" : "build";
}

export function buildPlanningRequest(message, editingTarget, options = {}) {
  const target = editingTarget === "phone"
    ? "phone controller"
    : editingTarget === "both"
      ? "TV display and phone controller"
      : "TV display";
  const recentContext = typeof options.recentContext === "string" ? options.recentContext.trim() : "";
  const engineGuidance = buildPlanningEngineGuidance(options.engineMetadata, editingTarget);
  return `Planning mode is active. Do not edit files yet unless the creator explicitly asks you to switch from planning to implementation.

Help the creator think through gameplay for the ${target}. Use the recent conversation and current game files as context so you do not repeat questions the creator already answered.

Planning should be bounded:
- Track the decisions already made in your response.
- Ask at most one concise multiple-choice question when a major gameplay decision is still missing.
- Stop asking questions once the game loop, player actions, scoring/win condition, and TV/phone responsibilities are clear enough.
- If the creator has answered several planning questions already, prefer summarizing the plan and offering implementation choices instead of asking another question.
- Distinguish required gameplay from optional polish. Recommend polish only when it materially improves clarity, engagement, accessibility, or the concept; never silently expand the scope.
- When suggesting engine features, tie each suggestion to the creator's concept, audience, target surface, accessibility needs, and the 4K/30 FPS budget.

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

Implementation handoff:
- Required gameplay: <loop, actions, scoring, and win condition>
- Selected visuals/animation: <chosen engine features and assets, or none>
- Selected sound/feedback: <chosen cues and equivalent visual feedback, or none>
- Performance/accessibility constraints: <target, budget, and reduced-motion choices>

Ready to build?
A. Implement plan
B. Keep planning

Do not ask more than one question in a single response. Keep each choice easy to answer by clicking. Do not invent answers when the creator has not decided something important; ask one targeted question instead.
${engineGuidance}
${recentContext ? `\nRecent project conversation:\n${recentContext}\n` : ""}

Creator planning request:
${message}`;
}

function buildPlanningEngineGuidance(engineMetadata, editingTarget) {
  if (engineMetadata?.type !== "pixi") {
    return `\nLegacy project guidance:
- Keep the existing HTML/CSS/JavaScript architecture and phone/TV ownership boundaries.
- Do not propose PixiJS scenes, engine-only APIs, new runtime dependencies, or engine migration as incidental polish.
- Keep any optional visual polish proportional to the creator's request and the existing implementation.`;
  }

  const targetBoundary = editingTarget === "phone"
    ? "This plan targets phone controls: phone controls remain accessible and DOM-based; coordinate with the Pixi TV only through ATG state/actions when needed."
    : editingTarget === "both"
      ? "This plan targets both surfaces: TV visuals use the pinned Pixi runtime and phone controls remain accessible DOM interfaces."
      : "This plan targets the TV: visuals use the pinned Pixi runtime while phone behavior remains DOM-based unless the creator explicitly requests both surfaces.";

  return `\nEngine-backed project guidance:
- Pinned runtime: ${engineMetadata.runtimeVersion}; format version: ${engineMetadata.formatVersion}. Preserve both values in the implementation handoff.
- Suggest only features that materially help this concept from: sprite animation, particles, transitions, camera effects, sound cues, loading states, and performance strategies. Mark each as required gameplay or optional polish.
- Use ATG scene lifecycle helpers for transitions, timers, tweens, particles, audio, and cleanup; use the bridge for shared state/actions rather than opening sockets or duplicating platform state.
- Recommend approved project assets/manifests and reuse existing assets. Do not suggest CDN imports, unapproved dependencies, binary edits in the Codex workspace, or native 4K backing buffers.
- Keep the full scene within the 4K/30 FPS budget, include accessible visual equivalents for sound/color/motion, and honor prefers-reduced-motion.
- ${targetBoundary}`;
}
